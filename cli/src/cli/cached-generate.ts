// General-purpose persisted memoization for expensive async functions.
//
// cachedGenerate() wraps any async function with:
//   - Deterministic filesystem caching (params → stable hash → file)
//   - Concurrent call deduplication (same key → same promise)
//   - Stale fallback management (old results moved to stale/ subfolder)
//   - Progress tracking (namespace-based, drives the player toolbar UI)
//
// Binary params (Uint8Array) are auto-hashed in the cache key. The caller
// only provides a generate function, a serializer, and a namespace.
//
// Usage:
//   const generateImage = cachedGenerate({
//     namespace: 'image',
//     prefixFrom: (p) => p.prompt,
//     generate: (p) => generateImageUncached(p).then(r => r.images[0]!),
//     serialize: (file) => ({ bytes: file.uint8Array, extension: '.png' }),
//   })

import fs from 'node:fs'
import path from 'node:path'
import {
  stableJsonKey, hashKey, promptPrefix,
  generatedDir, findCachedFile, findFallbackFile, moveFileToStale,
  generationQueue, formatKeyParams,
} from './cache-utils.js'

// ---------------------------------------------------------------------------
// Progress registry — tracks all active generations with metadata so the
// client and agents can observe progress across all scenes.
// Keyed by namespace string (not a fixed enum), so any user-defined
// namespace automatically gets tracking.
// ---------------------------------------------------------------------------

export interface GenerationEntry {
  namespace: string
  label: string
  model?: string
  startedAt: number
  params: Record<string, unknown>
}

const generationRegistry: Map<string, GenerationEntry> =
  (globalThis as any).__egakiGenerationRegistry ??= new Map<string, GenerationEntry>()

type ProgressListener = () => void
const progressListeners: Set<ProgressListener> =
  (globalThis as any).__egakiProgressListeners ??= new Set<ProgressListener>()

function notifyProgressListeners() {
  for (const listener of progressListeners) {
    try { listener() } catch { /* listener errors are non-fatal */ }
  }
}

/** Subscribe to generation progress changes. Returns an unsubscribe function. */
export function onProgressChange(listener: ProgressListener): () => void {
  progressListeners.add(listener)
  return () => { progressListeners.delete(listener) }
}

export interface GenerationProgressSummary {
  counts: Record<string, number>
  total: number
}

export interface GenerationProgressEntry extends GenerationEntry {
  key: string
  elapsedMs: number
}

export interface GenerationError {
  key: string
  namespace: string
  label: string
  model?: string
  error: string
  durationMs: number
}

export interface GenerationProgressEvent {
  generations: GenerationProgressEntry[]
  errors: GenerationError[]
  summary: GenerationProgressSummary
  done: boolean
}

/** Recent generation errors, drained on each getGenerationProgress() call
 *  so each SSE event includes errors that happened since the last yield. */
const recentErrors: GenerationError[] =
  (globalThis as any).__egakiRecentErrors ??= [] as GenerationError[]

/** Get a snapshot of all active generations with elapsed time computed.
 *  Drains the error queue so each call returns only new errors since last read. */
export function getGenerationProgress(): GenerationProgressEvent {
  const now = Date.now()
  const generations: GenerationProgressEntry[] = []
  const counts: Record<string, number> = {}
  for (const [key, entry] of generationRegistry) {
    generations.push({ ...entry, key, elapsedMs: now - entry.startedAt })
    counts[entry.namespace] = (counts[entry.namespace] ?? 0) + 1
  }
  const total = generations.length
  const errors = recentErrors.splice(0)
  return {
    generations,
    errors,
    summary: { counts, total },
    done: total === 0 && errors.length === 0,
  }
}

function registerGeneration(key: string, entry: GenerationEntry) {
  generationRegistry.set(key, entry)
  notifyProgressListeners()
}

function unregisterGeneration(key: string, error?: string) {
  const entry = generationRegistry.get(key)
  if (entry && error) {
    recentErrors.push({
      key,
      namespace: entry.namespace,
      label: entry.label,
      model: entry.model,
      error,
      durationMs: Date.now() - entry.startedAt,
    })
  }
  generationRegistry.delete(key)
  notifyProgressListeners()
}

// ---------------------------------------------------------------------------
// Auto cache key — recursively walks params, hashes Uint8Array values,
// strips undefined. Handles nested objects and arrays of any depth.
// ---------------------------------------------------------------------------

function normalizeCacheValue(value: unknown): unknown {
  if (value === undefined) return undefined
  if (value instanceof Uint8Array) return hashKey(value)
  if (Array.isArray(value)) return value.map(normalizeCacheValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, normalizeCacheValue(v)]),
    )
  }
  return value
}

function autoCacheKey(params: Record<string, unknown>): Record<string, unknown> {
  return normalizeCacheValue(params) as Record<string, unknown>
}

// ---------------------------------------------------------------------------
// cachedGenerate — the higher-order function
// ---------------------------------------------------------------------------

type SerializeResult =
  | { bytes: Uint8Array; extension: string; prefix?: string }
  | { json: unknown; extension: '.json'; prefix?: string }

export interface CachedGenerateConfig<TParams, TGenerated, TResult> {
  /** Filesystem namespace: files go to `public/generated/{namespace}/` */
  namespace: string

  /** Human-readable filename prefix derived from params */
  prefixFrom: (params: TParams) => string

  /** Extract the cache-relevant subset of params. Use this to exclude fields
   *  that affect naming but not identity (e.g. `filename` in transcription).
   *  Defaults to using all params. Uint8Array values are auto-hashed regardless. */
  cacheKey?: (params: TParams) => Record<string, unknown>

  /** The actual generation function. Throw on error. */
  generate: (params: TParams) => Promise<TGenerated>

  /** How to persist the result to disk.
   *  Return { bytes, extension } for binary files or { json, extension: '.json' } for data.
   *  Optionally return { prefix } to override the filename prefix (e.g. when
   *  the readable name comes from the result, not the params). */
  serialize: (result: TGenerated, params: TParams) => SerializeResult

  /** How to read a cached result back.
   *  For binary: receives { urlPath, filePath }, defaults to { src: urlPath }.
   *  For JSON: filePath contains the JSON data. */
  deserialize?: (cached: { urlPath: string; filePath: string }) => TResult

  /** Model ID key in params, used for progress tracking display. */
  modelFrom?: (params: TParams) => string | undefined
}

/** Result of getCacheInfo — used by server components for sync cache checks
 *  and fallback lookup before starting async generation. */
export interface CacheInfo {
  hash: string
  prefix: string
  dir: string
  key: string
  cached: string | undefined
  fallback: { filename: string; inStale: boolean } | undefined
  fallbackSrc: string | undefined
}

/** Compute cache info for a given namespace and params without starting generation.
 *  Used by server components to check cache and find fallback synchronously. */
export function getCacheInfo(
  namespace: string,
  params: Record<string, unknown>,
  prefixText: string,
): CacheInfo {
  const keyParams = autoCacheKey(params)
  // Note: getCacheInfo uses the raw params. If a cachedGenerate wrapper uses
  // cacheKey to exclude fields, the caller should pass the same subset here.
  const key = stableJsonKey(keyParams)
  const hash = hashKey(key)
  const dir = generatedDir(namespace)
  const prefix = promptPrefix(prefixText)

  const cached = findCachedFile(dir, hash)
  const fallback = cached ? undefined : findFallbackFile(dir, prefix, hash)
  const fallbackSrc = fallback
    ? `/generated/${namespace}/${fallback.inStale ? 'stale/' : ''}${fallback.filename}`
    : undefined

  return { hash, prefix, dir, key, cached, fallback, fallbackSrc }
}

export function cachedGenerate<TParams, TGenerated, TResult = { src: string }>(
  config: CachedGenerateConfig<TParams, TGenerated, TResult>,
): (params: TParams) => Promise<Error | TResult> {
  const { namespace, prefixFrom, cacheKey, generate, serialize, deserialize, modelFrom } = config

  return function cachedFn(params: TParams): Promise<Error | TResult> {
    const rawKeyParams = cacheKey ? cacheKey(params) : (params as Record<string, unknown>)
    const keyParams = autoCacheKey(rawKeyParams)
    const key = stableJsonKey(keyParams)
    const hash = hashKey(key)
    const dir = generatedDir(namespace)
    const prefix = promptPrefix(prefixFrom(params))

    // Queue key includes namespace to prevent cross-namespace collisions.
    // Two wrappers with different namespaces but identical params must not
    // share the same in-flight promise.
    const queueKey = `${namespace}:${key}`

    // 1. Cache hit — return immediately
    const cached = findCachedFile(dir, hash)
    if (cached) {
      const urlPath = `/generated/${namespace}/${cached}`
      const filePath = path.join(dir, cached)
      if (deserialize) {
        return Promise.resolve(deserialize({ urlPath, filePath }))
      }
      return Promise.resolve({ src: urlPath } as TResult)
    }

    // 2. Dedup — return pending promise if same key is in-flight
    const pending = generationQueue.get(queueKey)
    if (pending) return pending

    // 3. Find stale fallback for cleanup after generation
    const fallback = findFallbackFile(dir, prefix, hash)

    // 4. Register progress
    const regKey = `${namespace}:${hash}`
    const label = prefixFrom(params)
    registerGeneration(regKey, {
      namespace,
      label,
      model: modelFrom?.(params),
      startedAt: Date.now(),
      params: keyParams,
    })

    // 5. Generate, serialize, write to disk
    // The entire body is wrapped in try/catch so that failures in serialize(),
    // fs.writeFileSync(), or deserialize() also unregister progress and return
    // Error instead of throwing through the promise.
    const promise = (async (): Promise<Error | TResult> => {
      try {
        console.log(`[egaki] generating ${namespace}: ${prefix}-${hash} (${formatKeyParams(keyParams)})`)

        const result = await generate(params)

        const serialized = serialize(result, params)
        const finalPrefix = serialized.prefix ? promptPrefix(serialized.prefix) : prefix
        const filename = `${finalPrefix}-${hash}${serialized.extension}`
        const filePath = path.join(dir, filename)

        if ('bytes' in serialized) {
          fs.writeFileSync(filePath, serialized.bytes)
        } else {
          fs.writeFileSync(filePath, JSON.stringify(serialized.json, null, 2))
        }

        console.log(`[egaki] generated ${namespace}: ${filename}`)
        if (fallback) moveFileToStale(dir, fallback)
        unregisterGeneration(regKey)

        const urlPath = `/generated/${namespace}/${filename}`
        if (deserialize) {
          return deserialize({ urlPath, filePath })
        }
        return { src: urlPath } as TResult
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err))
        unregisterGeneration(regKey, error.message)
        return error
      } finally {
        generationQueue.delete(queueKey)
      }
    })()

    generationQueue.set(queueKey, promise)
    return promise
  }
}
