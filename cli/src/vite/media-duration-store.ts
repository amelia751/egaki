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
 * `resolveAutoDurations`. Subscribes via `useSyncExternalStore`.
 */

import { createContext, useContext, useSyncExternalStore } from 'react'

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
 * gapBefore/gapAfter are in FRAMES — empty timeline padding before/after
 * the media plays. They add to the total effective duration.
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
  gapBefore,
  gapAfter,
}: {
  rawSeconds?: number
  fps: number
  trimBefore?: number
  trimAfter?: number
  playbackRate?: number
  gapBefore?: number
  gapAfter?: number
}): number | null {
  const rate = playbackRate ?? 1
  if (rate <= 0) return null

  const startFrame = trimBefore ?? 0
  const endFrame = trimAfter ?? (rawSeconds != null ? Math.round(rawSeconds * fps) : null)
  if (endFrame == null) return null
  const mediaFrames = endFrame - startFrame
  if (mediaFrames <= 0) return null
  const totalFrames = mediaFrames + (gapBefore ?? 0) + (gapAfter ?? 0)
  return totalFrames / fps / rate
}

// ---------------------------------------------------------------------------
// Per-instance section reports (ephemeral)
//
// Each Audio/Video instance reports its effective playback duration keyed
// by (sectionIndex, instanceId). instanceId is a stable string per
// component instance (via useId or useRef). When a component unmounts,
// its report is cleared and the per-section max recomputes.
// ---------------------------------------------------------------------------

/** sectionIndex → Map<instanceId, effectiveSeconds> */
const sectionReports = new Map<number, Map<string, number>>()

const listeners = new Set<() => void>()

function notifyListeners() {
  for (const fn of listeners) fn()
}

/** Snapshot for useSyncExternalStore */
let snapshot: Record<string, number> = buildSnapshot()

function buildSnapshot(): Record<string, number> {
  const obj: Record<string, number> = {}
  for (const [idx, reports] of sectionReports) {
    if (reports.size === 0) continue
    let max = 0
    for (const dur of reports.values()) {
      if (dur > max) max = dur
    }
    if (max > 0) obj[String(idx)] = max
  }
  return obj
}

function updateSnapshot() {
  const next = buildSnapshot()
  const prevKeys = Object.keys(snapshot)
  const nextKeys = Object.keys(next)
  if (
    prevKeys.length === nextKeys.length &&
    nextKeys.every((k) => snapshot[k] === next[k])
  ) {
    return
  }
  snapshot = next
  notifyListeners()
}

/**
 * Report an effective media duration for a section from a specific
 * component instance. The per-section max is derived from all active
 * reports. Called by the useReportMediaDuration hook.
 */
export function reportSectionDuration(sectionIndex: number, instanceId: string, seconds: number) {
  if (sectionIndex < 0 || !isFinite(seconds) || seconds <= 0) return
  let reports = sectionReports.get(sectionIndex)
  if (!reports) {
    reports = new Map()
    sectionReports.set(sectionIndex, reports)
  }
  const prev = reports.get(instanceId)
  if (prev === seconds) return // no change
  reports.set(instanceId, seconds)
  updateSnapshot()
}

/**
 * Clear a component instance's report. Called on unmount so the
 * per-section max shrinks when media elements are removed.
 */
export function clearSectionDuration(sectionIndex: number, instanceId: string) {
  const reports = sectionReports.get(sectionIndex)
  if (!reports) return
  if (!reports.has(instanceId)) return
  reports.delete(instanceId)
  if (reports.size === 0) sectionReports.delete(sectionIndex)
  updateSnapshot()
}

/**
 * Hook for MdxClientApp. Returns per-section maxes as Record<string, number>
 * (section-index-as-string → seconds) compatible with resolveAutoDurations.
 * Re-renders when any section's max changes.
 */
export function useMediaDurations(): Record<string, number> {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => snapshot,
    () => snapshot,
  )
}

/**
 * Reset all section duration reports. Called when the MDX composition
 * changes (HMR, MDX edit, module update) so stale reports from the
 * previous composition don't persist. Media components will re-report
 * on their next mount.
 *
 * Does NOT clear the raw src cache (localStorage). Cached raw durations
 * are keyed by src URL and remain valid across composition changes.
 */
export function resetSectionDurations() {
  if (sectionReports.size === 0) return
  sectionReports.clear()
  updateSnapshot()
}

/**
 * Returns true when any section has at least one pending (unreported)
 * auto-duration. Used by the export button to block export until all
 * media durations are resolved.
 *
 * Takes the sections array from the composition and returns the count
 * of null-duration sections that have no reports yet.
 */
export function countUnresolvedSections(
  sections: { durationInFrames: number | null }[],
): number {
  let count = 0
  for (let i = 0; i < sections.length; i++) {
    if (sections[i]!.durationInFrames !== null) continue
    const reports = sectionReports.get(i)
    if (!reports || reports.size === 0) count++
  }
  return count
}
