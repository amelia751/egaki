/**
 * Tests for cachedGenerate — the general-purpose persisted memoization HOF.
 *
 * Uses a temp directory as the project root so tests are isolated and don't
 * touch the real public/generated/ folder. Tests verify: cache hit/miss,
 * dedup of concurrent calls, stale fallback management, auto-hashing of
 * Uint8Array params, JSON serialization, progress tracking, error handling,
 * and the getCacheInfo helper.
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {
  cachedGenerate,
  getCacheInfo,
  getGenerationProgress,
  type CachedGenerateConfig,
} from './cached-generate.ts'
import { setProjectRoot } from './cache-utils.ts'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'egaki-cached-generate-test-'))
  setProjectRoot(tmpDir)
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface TestParams {
  prompt: string
  seed?: number
  inputData?: Uint8Array
}

function makeTestConfig(overrides?: Partial<CachedGenerateConfig<TestParams, { data: string }, { src: string }>>) {
  let callCount = 0
  const config: CachedGenerateConfig<TestParams, { data: string }, { src: string }> = {
    namespace: 'test',
    prefixFrom: (p) => p.prompt,
    generate: async (params) => {
      callCount++
      return { data: `generated-${params.prompt}` }
    },
    serialize: (result) => ({
      bytes: new Uint8Array(Buffer.from(result.data)),
      extension: '.txt',
    }),
    ...overrides,
  }
  return { config, getCallCount: () => callCount }
}

// ---------------------------------------------------------------------------
// Cache hit / miss
// ---------------------------------------------------------------------------

describe('cache hit and miss', () => {
  test('first call generates and writes file', async () => {
    const { config, getCallCount } = makeTestConfig()
    const fn = cachedGenerate(config)

    const result = await fn({ prompt: 'hello world' })
    expect(result).not.toBeInstanceOf(Error)
    const r = result as { src: string }
    expect(r.src).toMatch(/^\/generated\/test\/hello-world-[a-f0-9]{8}\.txt$/)
    expect(getCallCount()).toBe(1)

    // File exists on disk
    const filePath = path.join(tmpDir, 'public', r.src)
    expect(fs.existsSync(filePath)).toBe(true)
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('generated-hello world')
  })

  test('second call with same params returns cached (no generation)', async () => {
    const { config, getCallCount } = makeTestConfig()
    const fn = cachedGenerate(config)

    const r1 = await fn({ prompt: 'hello world' })
    const r2 = await fn({ prompt: 'hello world' })

    expect(r1).not.toBeInstanceOf(Error)
    expect(r2).not.toBeInstanceOf(Error)
    expect((r1 as { src: string }).src).toBe((r2 as { src: string }).src)
    expect(getCallCount()).toBe(1) // only called once
  })

  test('different params generate different files', async () => {
    const { config, getCallCount } = makeTestConfig()
    const fn = cachedGenerate(config)

    const r1 = await fn({ prompt: 'alpha' })
    const r2 = await fn({ prompt: 'beta' })

    expect(r1).not.toBeInstanceOf(Error)
    expect(r2).not.toBeInstanceOf(Error)
    expect((r1 as { src: string }).src).not.toBe((r2 as { src: string }).src)
    expect(getCallCount()).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// Concurrent dedup
// ---------------------------------------------------------------------------

describe('deduplication', () => {
  test('concurrent calls with same params return same promise', async () => {
    let resolveGenerate!: (v: { data: string }) => void
    const { config } = makeTestConfig({
      generate: () => new Promise((resolve) => { resolveGenerate = resolve }),
    })
    const fn = cachedGenerate(config)

    const p1 = fn({ prompt: 'dedup test' })
    const p2 = fn({ prompt: 'dedup test' })

    // Resolve the single generation
    resolveGenerate({ data: 'result' })

    const [r1, r2] = await Promise.all([p1, p2])
    expect(r1).not.toBeInstanceOf(Error)
    expect(r2).not.toBeInstanceOf(Error)
    expect((r1 as { src: string }).src).toBe((r2 as { src: string }).src)
  })
})

// ---------------------------------------------------------------------------
// Stale fallback management
// ---------------------------------------------------------------------------

describe('stale management', () => {
  test('changing params moves old file to stale/', async () => {
    const { config } = makeTestConfig()
    const fn = cachedGenerate(config)

    // Generate first version
    const r1 = await fn({ prompt: 'hello world', seed: 1 })
    expect(r1).not.toBeInstanceOf(Error)

    const firstFile = path.basename((r1 as { src: string }).src)

    // Generate with different seed but same prompt prefix
    const r2 = await fn({ prompt: 'hello world', seed: 2 })
    expect(r2).not.toBeInstanceOf(Error)

    // Old file should be in stale/
    const staleDir = path.join(tmpDir, 'public', 'generated', 'test', 'stale')
    const staleFiles = fs.existsSync(staleDir) ? fs.readdirSync(staleDir) : []
    expect(staleFiles).toContain(firstFile)
  })
})

// ---------------------------------------------------------------------------
// Auto-hashing Uint8Array params
// ---------------------------------------------------------------------------

describe('Uint8Array auto-hashing', () => {
  test('same bytes produce same cache key', async () => {
    const { config, getCallCount } = makeTestConfig()
    const fn = cachedGenerate(config)

    const data = new Uint8Array([1, 2, 3])
    const r1 = await fn({ prompt: 'with data', inputData: data })
    const r2 = await fn({ prompt: 'with data', inputData: new Uint8Array([1, 2, 3]) })

    expect(getCallCount()).toBe(1) // same key → cached
    expect((r1 as { src: string }).src).toBe((r2 as { src: string }).src)
  })

  test('different bytes produce different cache keys', async () => {
    const { config, getCallCount } = makeTestConfig()
    const fn = cachedGenerate(config)

    await fn({ prompt: 'with data', inputData: new Uint8Array([1, 2, 3]) })
    await fn({ prompt: 'with data', inputData: new Uint8Array([4, 5, 6]) })

    expect(getCallCount()).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// JSON serialization
// ---------------------------------------------------------------------------

describe('JSON serialization', () => {
  test('json serialize writes .json and deserialize reads it back', async () => {
    interface JsonResult { items: string[] }
    const fn = cachedGenerate<{ query: string }, JsonResult, JsonResult>({
      namespace: 'json-test',
      prefixFrom: (p) => p.query,
      generate: async (params) => ({ items: [params.query, 'b', 'c'] }),
      serialize: (result) => ({
        json: result,
        extension: '.json' as const,
      }),
      deserialize: ({ filePath }) => JSON.parse(fs.readFileSync(filePath, 'utf-8')),
    })

    const r1 = await fn({ query: 'search term' })
    expect(r1).not.toBeInstanceOf(Error)
    expect((r1 as JsonResult).items).toEqual(['search term', 'b', 'c'])

    // Second call reads from cache
    const r2 = await fn({ query: 'search term' })
    expect(r2).not.toBeInstanceOf(Error)
    expect((r2 as JsonResult).items).toEqual(['search term', 'b', 'c'])
  })
})

// ---------------------------------------------------------------------------
// Prefix override from serialize
// ---------------------------------------------------------------------------

describe('prefix override', () => {
  test('serialize can return a prefix to override the filename', async () => {
    const fn = cachedGenerate<{ id: string }, { text: string }, { src: string }>({
      namespace: 'prefix-test',
      prefixFrom: () => 'initial',
      generate: async () => ({ text: 'the actual content is here' }),
      serialize: (result) => ({
        bytes: new Uint8Array(Buffer.from(result.text)),
        extension: '.txt',
        prefix: 'the actual content is here',
      }),
    })

    const r = await fn({ id: '123' })
    expect(r).not.toBeInstanceOf(Error)
    // The filename should use the override prefix, not 'initial'
    expect((r as { src: string }).src).toMatch(/the-actual-content-is-here/)
    expect((r as { src: string }).src).not.toMatch(/initial/)
  })
})

// ---------------------------------------------------------------------------
// Progress tracking
// ---------------------------------------------------------------------------

describe('progress tracking', () => {
  test('generation is registered and unregistered', async () => {
    let resolveGenerate!: (v: { data: string }) => void
    const fn = cachedGenerate<TestParams, { data: string }>({
      namespace: 'progress-test',
      prefixFrom: (p) => p.prompt,
      modelFrom: (p) => `model-${p.seed}`,
      generate: () => new Promise((resolve) => { resolveGenerate = resolve }),
      serialize: (result) => ({
        bytes: new Uint8Array(Buffer.from(result.data)),
        extension: '.txt',
      }),
    })

    const promise = fn({ prompt: 'tracking test', seed: 42 })

    // While generating, progress should show the entry
    const progress = getGenerationProgress()
    expect(progress.summary.total).toBe(1)
    expect(progress.summary.counts['progress-test']).toBe(1)
    expect(progress.generations[0]?.namespace).toBe('progress-test')
    expect(progress.generations[0]?.label).toBe('tracking test')
    expect(progress.generations[0]?.model).toBe('model-42')

    // Resolve the generation
    resolveGenerate({ data: 'done' })
    await promise

    // After completion, progress should be empty
    const after = getGenerationProgress()
    expect(after.summary.total).toBe(0)
  })

  test('failed generation reports error in progress', async () => {
    const fn = cachedGenerate<TestParams, { data: string }>({
      namespace: 'error-progress',
      prefixFrom: (p) => p.prompt,
      generate: async () => { throw new Error('API failed') },
      serialize: (result) => ({
        bytes: new Uint8Array(Buffer.from(result.data)),
        extension: '.txt',
      }),
    })

    const result = await fn({ prompt: 'fail test' })
    expect(result).toBeInstanceOf(Error)
    expect((result as Error).message).toBe('API failed')

    // Error should be in the progress drain
    const progress = getGenerationProgress()
    expect(progress.errors.length).toBe(1)
    expect(progress.errors[0]?.error).toBe('API failed')
    expect(progress.errors[0]?.namespace).toBe('error-progress')

    // Errors drain on read — second call should have none
    const progress2 = getGenerationProgress()
    expect(progress2.errors.length).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe('error handling', () => {
  test('generate throwing returns Error', async () => {
    const fn = cachedGenerate<TestParams, { data: string }>({
      namespace: 'error-test',
      prefixFrom: (p) => p.prompt,
      generate: async () => { throw new Error('boom') },
      serialize: (result) => ({
        bytes: new Uint8Array(Buffer.from(result.data)),
        extension: '.txt',
      }),
    })

    const result = await fn({ prompt: 'error test' })
    expect(result).toBeInstanceOf(Error)
    expect((result as Error).message).toBe('boom')
  })

  test('non-Error throw is wrapped in Error', async () => {
    const fn = cachedGenerate<TestParams, { data: string }>({
      namespace: 'error-test-2',
      prefixFrom: (p) => p.prompt,
      generate: async () => { throw 'string error' },
      serialize: (result) => ({
        bytes: new Uint8Array(Buffer.from(result.data)),
        extension: '.txt',
      }),
    })

    const result = await fn({ prompt: 'string error test' })
    expect(result).toBeInstanceOf(Error)
    expect((result as Error).message).toBe('string error')
  })

  test('failed call does not cache — retry regenerates', async () => {
    let shouldFail = true
    const fn = cachedGenerate<TestParams, { data: string }>({
      namespace: 'retry-test',
      prefixFrom: (p) => p.prompt,
      generate: async (params) => {
        if (shouldFail) throw new Error('temporary failure')
        return { data: `ok-${params.prompt}` }
      },
      serialize: (result) => ({
        bytes: new Uint8Array(Buffer.from(result.data)),
        extension: '.txt',
      }),
    })

    const r1 = await fn({ prompt: 'retry' })
    expect(r1).toBeInstanceOf(Error)

    shouldFail = false
    const r2 = await fn({ prompt: 'retry' })
    expect(r2).not.toBeInstanceOf(Error)
    expect((r2 as { src: string }).src).toMatch(/\/generated\/retry-test\//)
  })
})

// ---------------------------------------------------------------------------
// Namespace isolation in dedup queue
// ---------------------------------------------------------------------------

describe('namespace isolation', () => {
  test('same params in different namespaces generate independently', async () => {
    let imageCallCount = 0
    let videoCallCount = 0

    const imageFn = cachedGenerate<{ prompt: string }, { data: string }>({
      namespace: 'ns-image',
      prefixFrom: (p) => p.prompt,
      generate: async (params) => {
        imageCallCount++
        return { data: `image-${params.prompt}` }
      },
      serialize: (result) => ({
        bytes: new Uint8Array(Buffer.from(result.data)),
        extension: '.png',
      }),
    })

    const videoFn = cachedGenerate<{ prompt: string }, { data: string }>({
      namespace: 'ns-video',
      prefixFrom: (p) => p.prompt,
      generate: async (params) => {
        videoCallCount++
        return { data: `video-${params.prompt}` }
      },
      serialize: (result) => ({
        bytes: new Uint8Array(Buffer.from(result.data)),
        extension: '.mp4',
      }),
    })

    const [imgResult, vidResult] = await Promise.all([
      imageFn({ prompt: 'same params' }),
      videoFn({ prompt: 'same params' }),
    ])

    expect(imgResult).not.toBeInstanceOf(Error)
    expect(vidResult).not.toBeInstanceOf(Error)
    expect(imageCallCount).toBe(1)
    expect(videoCallCount).toBe(1)
    // Different src paths
    expect((imgResult as { src: string }).src).toMatch(/ns-image/)
    expect((vidResult as { src: string }).src).toMatch(/ns-video/)
  })
})

// ---------------------------------------------------------------------------
// Recursive Uint8Array hashing
// ---------------------------------------------------------------------------

describe('recursive binary hashing', () => {
  test('nested Uint8Array values produce stable cache keys', async () => {
    const { config, getCallCount } = makeTestConfig()
    const fn = cachedGenerate(config)

    // Pass nested binary data inside an object
    const r1 = await fn({ prompt: 'nested', inputData: new Uint8Array([10, 20, 30]) } as any)
    const r2 = await fn({ prompt: 'nested', inputData: new Uint8Array([10, 20, 30]) } as any)

    expect(getCallCount()).toBe(1) // same nested bytes → cached
  })
})

// ---------------------------------------------------------------------------
// Serialize failure handling
// ---------------------------------------------------------------------------

describe('serialize failure', () => {
  test('serialize throwing unregisters progress and returns Error', async () => {
    // Drain any leftover errors from previous tests
    getGenerationProgress()

    const fn = cachedGenerate<TestParams, { data: string }>({
      namespace: 'serialize-fail',
      prefixFrom: (p) => p.prompt,
      generate: async () => ({ data: 'ok' }),
      serialize: () => { throw new Error('serialize exploded') },
    })

    const result = await fn({ prompt: 'serialize test' })
    expect(result).toBeInstanceOf(Error)
    expect((result as Error).message).toBe('serialize exploded')

    // Progress should be clean — no stuck entries
    const progress = getGenerationProgress()
    expect(progress.summary.total).toBe(0)
    // Error should be in the drain
    expect(progress.errors.length).toBe(1)
    expect(progress.errors[0]?.error).toBe('serialize exploded')
  })
})

// ---------------------------------------------------------------------------
// cacheKey config excludes non-identity fields
// ---------------------------------------------------------------------------

describe('cacheKey config', () => {
  test('excluded fields do not affect cache identity', async () => {
    let callCount = 0
    const fn = cachedGenerate<{ query: string; label?: string }, { data: string }>({
      namespace: 'cachekey-test',
      prefixFrom: (p) => p.label ?? p.query,
      cacheKey: ({ label, ...rest }) => rest,
      generate: async (params) => {
        callCount++
        return { data: `result-${params.query}` }
      },
      serialize: (result) => ({
        bytes: new Uint8Array(Buffer.from(result.data)),
        extension: '.txt',
      }),
    })

    await fn({ query: 'search', label: 'label-a' })
    await fn({ query: 'search', label: 'label-b' })

    // Same query, different labels → should be same cache entry
    expect(callCount).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// getCacheInfo helper
// ---------------------------------------------------------------------------

describe('getCacheInfo', () => {
  test('returns cache miss before any generation', () => {
    const info = getCacheInfo('test-ns', { prompt: 'hello' }, 'hello')
    expect(info.cached).toBeUndefined()
    expect(info.hash).toMatch(/^[a-f0-9]{8}$/)
    expect(info.prefix).toBe('hello')
  })

  test('returns cache hit after generation', async () => {
    const { config } = makeTestConfig()
    const fn = cachedGenerate(config)

    await fn({ prompt: 'cached info test' })

    const info = getCacheInfo('test', { prompt: 'cached info test' }, 'cached info test')
    expect(info.cached).toBeDefined()
    expect(info.cached).toMatch(/cached-info-test-[a-f0-9]{8}\.txt/)
  })

  test('returns fallbackSrc when a previous generation exists', async () => {
    const { config } = makeTestConfig()
    const fn = cachedGenerate(config)

    // Generate first version
    await fn({ prompt: 'fallback test', seed: 1 })

    // Query for a different version that doesn't exist yet
    // Version 1 is in the main dir and should be found as fallback
    const info = getCacheInfo('test', { prompt: 'fallback test', seed: 2 }, 'fallback test')
    expect(info.cached).toBeUndefined()
    expect(info.fallbackSrc).toBeDefined()
    expect(info.fallbackSrc).toMatch(/\/generated\/test\/fallback-test-/)
  })
})
