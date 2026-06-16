/**
 * <MidjourneyExploreImage> — RSC that searches Midjourney and returns image results.
 *
 * Runs server-side via egaki's <Server> auto-wrapping (detected by .server.tsx postfix).
 * Searches Midjourney's explore API through the user's browser via Playwriter,
 * caches the simplified results as JSON in public/generated/midjourney/,
 * and streams the results array to a client component with tweakpane index picker.
 *
 * Cache is persistent across server restarts. Same search+aspectRatio combo
 * always returns the same results without hitting the API again.
 */

import fs from 'node:fs'
import path from 'node:path'
import type { CSSProperties } from 'react'
import { Midjourney } from './midjourney.ts'
import { simplifyJob, type CachedSearchResult } from './types.ts'
import { stableJsonKey, hashKey, promptSlug, ensureCacheDir, findCachedFile, moveToStale, findStaleFile } from './cache.ts'
import { MidjourneyExploreImageClient } from './explore-image-client.tsx'

// HMR-safe queue: survives Vite module invalidations in RSC env.
const searchQueue: Map<string, Promise<CachedSearchResult[]>> =
  (globalThis as any).__midjourneySearchQueue ??= new Map<string, Promise<CachedSearchResult[]>>()

// Lazy singleton: one Midjourney instance shared across all renders.
let mjInstance: Midjourney | null = (globalThis as any).__midjourneyInstance ?? null

function getMidjourney(): Midjourney {
  if (!mjInstance) {
    mjInstance = new Midjourney()
    ;(globalThis as any).__midjourneyInstance = mjInstance
  }
  return mjInstance
}

// projectRoot comes from egaki's virtual module
let _projectRoot: string | undefined
async function getProjectRoot(): Promise<string> {
  if (_projectRoot) return _projectRoot
  const mod = await import('virtual:egaki-mdx')
  _projectRoot = mod.projectRoot
  return _projectRoot!
}

async function getResults(options: {
  search: string
  aspectRatio?: string
  aspectRatioTolerance?: number
}): Promise<CachedSearchResult[]> {
  const { search, aspectRatio, aspectRatioTolerance } = options
  const projectRoot = await getProjectRoot()
  const dir = ensureCacheDir(projectRoot)

  const keyParams = { search, aspectRatio, aspectRatioTolerance }
  const key = stableJsonKey(keyParams)
  const hash = hashKey(key)
  const prefix = promptSlug(search)
  const filename = `${prefix}-${hash}.json`

  // Check cache first
  const cachedFilename = findCachedFile(dir, hash)
  if (cachedFilename) {
    return JSON.parse(fs.readFileSync(path.join(dir, cachedFilename), 'utf-8')) as CachedSearchResult[]
  }

  // Deduplicate concurrent searches for the same query
  let pending = searchQueue.get(key)
  if (!pending) {
    pending = (async () => {
      try {
        console.log(`[midjourney] searching: "${search}" (${hash})`)
        const mj = getMidjourney()
        const jobs = await mj.search(search, { aspectRatio, aspectRatioTolerance })
        const results = jobs.map((job) => simplifyJob(job))

        // Write cache
        fs.writeFileSync(path.join(dir, filename), JSON.stringify(results, null, 2))
        console.log(`[midjourney] cached ${results.length} results: ${filename}`)

        // Move stale file from previous search with same prefix
        const stale = findStaleFile(dir, prefix, hash)
        if (stale) moveToStale(dir, stale)

        return results
      } finally {
        searchQueue.delete(key)
      }
    })()
    searchQueue.set(key, pending)
  }

  return pending
}

export interface MidjourneyExploreImageProps {
  /** Search query for Midjourney's explore feed. */
  search: string
  /** Which result to display (0-indexed). Default: 0. Adjustable via tweakpane. */
  index?: number
  /** Filter results by aspect ratio, e.g. "16:9", "1:1". */
  aspectRatio?: string
  /** Aspect ratio filter tolerance (0-1). Default: 0.1 */
  aspectRatioTolerance?: number
  /** CSS styles passed to the <img> element. */
  style?: CSSProperties
  /** CSS class name. */
  className?: string
}

export async function MidjourneyExploreImage({
  search,
  index = 0,
  aspectRatio,
  aspectRatioTolerance,
  style,
  className,
}: MidjourneyExploreImageProps) {
  const results = await getResults({ search, aspectRatio, aspectRatioTolerance })
  return <MidjourneyExploreImageClient results={results} index={index} style={style} className={className} />
}
