'use client'

/**
 * Media duration cache and section duration state.
 *
 * Two layers:
 *
 * 1. **Raw src cache** (persistent) — `Map<string, number>` keyed by media
 *    src URL → RAW source duration in seconds (before trim/playbackRate).
 *    Backed by localStorage. Never stores effective/trimmed durations so
 *    the same src used with different trim ranges doesn't get poisoned.
 *
 * 2. **Per-instance section reports** (ephemeral) — each mounted Audio/Video
 *    component reports its EFFECTIVE playback duration (after trim + speed)
 *    keyed by `(sectionIndex, instanceId)`. Per-section max is derived from
 *    active reports. When a component unmounts, its report is cleared and
 *    the max recomputes — durations shrink correctly when media is removed,
 *    src changes, or trim bounds change.
 *
 * `useMediaDurations()` returns per-section maxes as
 * `Record<string, number>` (section-index-as-string → seconds) for
 * `resolveAutoDurations`. Subscribes via the centralized zustand store.
 */

import { createContext, useContext } from 'react'
import { egakiStore } from './store.ts'
import { useMediaDurations } from './store-hooks.ts'

// ---------------------------------------------------------------------------
// Section index context
//
// Provided by player-page.tsx around each section's content. Audio/Video
// components read this to know which section they belong to, then report
// their effective media duration grouped by section index.
// ---------------------------------------------------------------------------

export const SectionIndexContext = createContext<number>(-1)

export function useSectionIndex(): number {
  return useContext(SectionIndexContext)
}

// ---------------------------------------------------------------------------
// Persistent raw src cache (localStorage)
//
// Stores RAW source duration only — the full media length before any trim
// or speed adjustments. This prevents cache poisoning when the same src
// is used with different trim ranges in different sections.
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'egaki:media-src-durations'

/** src URL → RAW duration in seconds (before trim/speed) */
const rawSrcCache = new Map<string, number>()

function loadSrcCache() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as Record<string, number>
    for (const [src, dur] of Object.entries(parsed)) {
      if (typeof dur === 'number' && dur > 0) rawSrcCache.set(src, dur)
    }
  } catch {
    // localStorage unavailable or corrupted; start fresh
  }
}

function persistSrcCache() {
  try {
    const obj: Record<string, number> = {}
    for (const [src, dur] of rawSrcCache) obj[src] = dur
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj))
  } catch {
    // localStorage full or unavailable, ignore
  }
}

// Load on module init (runs once in the browser)
if (typeof localStorage !== 'undefined') loadSrcCache()

/**
 * Read a cached RAW source duration by src URL.
 * Returns undefined on cache miss. Does NOT trigger any fetch.
 */
export function getCachedRawDuration(src: string): number | undefined {
  return rawSrcCache.get(src)
}

/**
 * Cache a RAW source duration. Only updates if the new value is larger
 * (metadata reads should be deterministic, but multiple formats may
 * report slightly different values).
 */
export function cacheRawDuration(src: string, seconds: number) {
  if (!isFinite(seconds) || seconds <= 0) return
  const prev = rawSrcCache.get(src)
  if (prev === undefined || prev < seconds) {
    rawSrcCache.set(src, seconds)
    persistSrcCache()
  }
}

// ---------------------------------------------------------------------------
// Effective duration: derive from raw + trim + playbackRate
// ---------------------------------------------------------------------------

/**
 * Compute effective media playback duration in seconds from Remotion trim,
 * speed, and gap props.
 *
 * `rawSeconds` is the full source duration (from cache or mediabunny).
 * When both trimBefore and trimAfter are set, rawSeconds is not needed.
 *
 * trimBefore/trimAfter are in FRAMES (Remotion convention).
 * startInFrames offsets playback start: positive delays from section start,
 * negative counts from section end. Only positive values add to auto-duration
 * (negative values anchor to section end, so the section must have an explicit
 * duration or another media element determining length).
 * playbackRate defaults to 1.
 *
 * Returns null when duration cannot be determined (missing bounds and
 * no rawSeconds).
 */
export function computeEffectiveDuration({
  rawSeconds,
  fps,
  trimBefore,
  trimAfter,
  playbackRate,
  startInFrames,
}: {
  rawSeconds?: number
  fps: number
  trimBefore?: number
  trimAfter?: number
  playbackRate?: number
  startInFrames?: number
}): number | null {
  const rate = playbackRate ?? 1
  if (rate <= 0) return null

  const startFrame = trimBefore ?? 0
  const endFrame = trimAfter ?? (rawSeconds != null ? Math.round(rawSeconds * fps) : null)
  if (endFrame == null) return null
  const mediaFrames = endFrame - startFrame
  if (mediaFrames <= 0) return null
  // Only positive startInFrames adds to effective duration (delay before media).
  // Negative startInFrames anchors to section end and doesn't extend auto-duration.
  const offset = startInFrames != null && startInFrames > 0 ? startInFrames : 0
  const totalFrames = mediaFrames + offset
  return totalFrames / fps / rate
}

// ---------------------------------------------------------------------------
// Per-instance section reports — stored in the centralized zustand store.
// ---------------------------------------------------------------------------

export { useMediaDurations }

/**
 * Report an effective media duration for a section from a specific
 * component instance. The per-section max is derived from all active
 * reports via selectMediaDurations. Called by the useReportMediaDuration hook.
 */
export function reportSectionDuration(sectionIndex: number, instanceId: string, seconds: number) {
  if (sectionIndex < 0 || !isFinite(seconds) || seconds <= 0) return
  egakiStore.setState((state) => {
    const prev = state.sectionReports.get(sectionIndex)?.get(instanceId)
    if (prev === seconds) return state
    const newReports = new Map(state.sectionReports)
    const sectionMap = new Map(newReports.get(sectionIndex) ?? [])
    sectionMap.set(instanceId, seconds)
    newReports.set(sectionIndex, sectionMap)
    return { sectionReports: newReports }
  })
}

/**
 * Clear a component instance's report. Called on unmount so the
 * per-section max shrinks when media elements are removed.
 */
export function clearSectionDuration(sectionIndex: number, instanceId: string) {
  egakiStore.setState((state) => {
    const existing = state.sectionReports.get(sectionIndex)
    if (!existing || !existing.has(instanceId)) return state
    const newReports = new Map(state.sectionReports)
    const sectionMap = new Map(existing)
    sectionMap.delete(instanceId)
    if (sectionMap.size === 0) {
      newReports.delete(sectionIndex)
    } else {
      newReports.set(sectionIndex, sectionMap)
    }
    return { sectionReports: newReports }
  })
}

/**
 * Reset all section duration reports. Called when the MDX composition
 * changes (HMR, MDX edit, module update) so stale reports don't persist.
 * Does NOT clear the raw src cache (localStorage).
 */
export function resetSectionDurations() {
  if (egakiStore.getState().sectionReports.size === 0) return
  egakiStore.setState({ sectionReports: new Map() })
}

/**
 * Returns the count of null-duration sections that have no reports yet.
 * Used by the export button to block export until all media durations
 * are resolved.
 */
export function countUnresolvedSections(
  sections: { durationInFrames: number | null }[],
): number {
  const { sectionReports } = egakiStore.getState()
  let count = 0
  for (let i = 0; i < sections.length; i++) {
    if (sections[i]!.durationInFrames !== null) continue
    const reports = sectionReports.get(i)
    if (!reports || reports.size === 0) count++
  }
  return count
}
