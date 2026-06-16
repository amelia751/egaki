/**
 * Lightweight cache utilities for Midjourney search results.
 * Adapted from egaki's server-components.tsx caching pattern.
 * Stores simplified JSON files instead of binary media.
 */

import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

/** Deterministic JSON: keys sorted recursively, undefined stripped. */
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
export function hashKey(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 8)
}

/** First ~40 chars of text, kebab-cased, filesystem-safe. */
export function promptSlug(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 40)
    .replace(/-$/, '')
  return slug || 'search'
}

/** Ensure a directory exists and return its path. */
export function ensureCacheDir(projectRoot: string): string {
  const dir = path.join(projectRoot, 'public', 'generated', 'midjourney')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

/** Find an existing cached JSON file by hash. Also checks stale/ and restores if found. */
export function findCachedFile(dir: string, hash: string): string | undefined {
  try {
    const found = fs.readdirSync(dir).find((f) => f.includes(hash) && f.endsWith('.json'))
    if (found) return found
  } catch { /* empty */ }
  try {
    const staleDir = path.join(dir, 'stale')
    const inStale = fs.readdirSync(staleDir).find((f) => f.includes(hash) && f.endsWith('.json'))
    if (inStale) {
      fs.renameSync(path.join(staleDir, inStale), path.join(dir, inStale))
      console.log(`[midjourney] restored from stale: ${inStale}`)
      return inStale
    }
  } catch { /* empty */ }
  return undefined
}

/** Move a file to stale/ subfolder. No-op if already there or doesn't exist. */
export function moveToStale(dir: string, filename: string) {
  const src = path.join(dir, filename)
  const staleDir = path.join(dir, 'stale')
  try {
    if (!fs.existsSync(src)) return
    fs.mkdirSync(staleDir, { recursive: true })
    fs.renameSync(src, path.join(staleDir, filename))
    console.log(`[midjourney] moved stale: ${filename}`)
  } catch { /* race with another rename, safe to ignore */ }
}

/** Find a previous cache file with the same prefix but different hash. */
export function findStaleFile(dir: string, prefix: string, currentHash: string): string | undefined {
  const match = (f: string) => f.startsWith(prefix + '-') && !f.includes(currentHash) && f.endsWith('.json')
  try {
    return fs.readdirSync(dir).find(match)
  } catch { /* empty */ }
  return undefined
}
