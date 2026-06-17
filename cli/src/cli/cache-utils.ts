// Shared caching utilities for egaki generate functions.
//
// Provides deterministic cache keys, file lookup, deduplication queues,
// and stale file management. Used by the cached variants of generateImage,
// generateSpeech, generateVideo, and transcribeAudio.
//
// The project root (for locating public/generated/) is set via setProjectRoot()
// at startup. In Vite context, server-components.tsx sets it from the virtual
// module. Falls back to process.cwd() if not set.

import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

// ---------------------------------------------------------------------------
// Project root
// ---------------------------------------------------------------------------

let _projectRoot: string | undefined

/** Set the project root directory. Called by the Vite plugin on startup. */
export function setProjectRoot(root: string) {
  _projectRoot = root
}

/** Get the project root directory. Falls back to cwd if not set. */
export function getProjectRoot(): string {
  return _projectRoot ?? process.cwd()
}

// ---------------------------------------------------------------------------
// Deterministic cache keys
// ---------------------------------------------------------------------------

/** Deterministic JSON from a value: keys sorted recursively, undefined
 *  values stripped. Safe for nested objects and arrays. */
export function stableJsonKey(value: unknown): string {
  return JSON.stringify(sortValue(value))
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => [k, sortValue(v)]),
  )
}

/** First 8 hex chars of sha256. */
export function hashKey(input: string | Uint8Array): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 8)
}

/** First ~40 chars of text, kebab-cased, filesystem-safe. */
export function promptPrefix(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 40)
    .replace(/-$/, '')
  return slug || 'generated'
}

export function extensionFromMediaType(mediaType: string): string {
  const map: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/webp': '.webp',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'audio/mpeg': '.mp3',
    'audio/wav': '.wav',
    'audio/opus': '.opus',
    'audio/ogg': '.ogg',
    'audio/aac': '.aac',
    'audio/flac': '.flac',
  }
  return map[mediaType] || '.bin'
}

// ---------------------------------------------------------------------------
// Generated directory management
// ---------------------------------------------------------------------------

/** Returns the generated files directory for a given namespace.
 *  Creates the directory if it doesn't exist. */
export function generatedDir(namespace: string): string {
  const root = getProjectRoot()
  const dir = path.join(root, 'public', 'generated', namespace)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

// ---------------------------------------------------------------------------
// File lookup
// ---------------------------------------------------------------------------

/** Find an existing cached file by hash in the generated directory.
 *  Also checks the stale/ subfolder — if found there, restores it. */
export function findCachedFile(dir: string, hash: string): string | undefined {
  try {
    const found = fs.readdirSync(dir).find((f) => f.includes(hash))
    if (found) return found
  } catch { /* empty */ }
  try {
    const staleDir = path.join(dir, 'stale')
    const inStale = fs.readdirSync(staleDir).find((f) => f.includes(hash))
    if (inStale) {
      fs.renameSync(path.join(staleDir, inStale), path.join(dir, inStale))
      console.log(`[egaki] restored from stale: ${inStale}`)
      return inStale
    }
  } catch { /* empty */ }
  return undefined
}

/** Find a previous generation with the same prompt prefix (different hash)
 *  that can serve as fallback while a new generation is in progress. */
export function findFallbackFile(dir: string, prefix: string, currentHash: string): { filename: string; inStale: boolean } | undefined {
  const match = (f: string) => f.startsWith(prefix + '-') && !f.includes(currentHash)
  try {
    const inDir = fs.readdirSync(dir).find(match)
    if (inDir) return { filename: inDir, inStale: false }
  } catch { /* empty */ }
  try {
    const staleDir = path.join(dir, 'stale')
    const inStale = fs.readdirSync(staleDir).find(match)
    if (inStale) return { filename: inStale, inStale: true }
  } catch { /* empty */ }
  return undefined
}

// ---------------------------------------------------------------------------
// Stale file management
// ---------------------------------------------------------------------------

/** Move a specific file into the stale/ subfolder of its directory. */
export function moveFileToStale(dir: string, fallback: { filename: string; inStale: boolean }) {
  if (fallback.inStale) return
  const src = path.join(dir, fallback.filename)
  const staleDir = path.join(dir, 'stale')
  try {
    if (!fs.existsSync(src)) return
    fs.mkdirSync(staleDir, { recursive: true })
    fs.renameSync(src, path.join(staleDir, fallback.filename))
    console.log(`[egaki] moved stale: ${fallback.filename} → stale/`)
  } catch { /* race with another rename, safe to ignore */ }
}

// ---------------------------------------------------------------------------
// Generation queue — deduplicates concurrent calls with the same cache key.
// Stored on globalThis so in-flight promises survive Vite HMR module reloads.
// ---------------------------------------------------------------------------

export const generationQueue: Map<string, Promise<any>> =
  (globalThis as any).__egakiGenerationQueue ??= new Map<string, Promise<any>>()

/** Format key params for logging, omitting undefined values and the _type field. */
export function formatKeyParams(params: Record<string, unknown>): string {
  const entries = Object.entries(params)
    .filter(([k, v]) => v !== undefined && k !== '_type')
    .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
  return entries.join(', ')
}
