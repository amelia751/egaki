/**
 * Centralized client-side state store (zustand/vanilla).
 *
 * Pure vanilla store with no React imports. State slices:
 *
 * 1. **modules** — eagerly-imported user .tsx/.ts modules, updated via HMR
 * 2. **sectionReports** — per-section effective media durations reported by
 *    Audio/Video components (ephemeral, not persisted)
 * 3. **activeGenerations** — tracks in-flight AI generation promises for the
 *    toolbar status indicator
 *
 * React hooks live in store-hooks.ts ('use client') to keep this file
 * importable from any environment (RSC, SSR, client) without pulling in React.
 */

import { createStore } from 'zustand/vanilla'
import { subscribeWithSelector } from 'zustand/middleware'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Same as safe-mdx's EagerModules: Record<string, Record<string, any>> */
type EagerModules = Record<string, Record<string, any>>

export type GeneratingMediaType = 'image' | 'video' | 'speech'

export interface GenerationStatus {
  images: number
  videos: number
  speeches: number
  total: number
}

export interface EgakiClientState {
  /** User-imported modules from virtual:egaki-modules. Updated by HMR. */
  modules: EagerModules

  /**
   * Per-instance section duration reports (ephemeral).
   * sectionIndex → Map<instanceId, effectiveSeconds>
   * Each Audio/Video component reports its effective playback duration.
   */
  sectionReports: Map<number, Map<string, number>>

  /** Active AI generation registrations: unique ID → media type. */
  activeGenerations: Map<string, GeneratingMediaType>
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const egakiStore = createStore<EgakiClientState>()(
  subscribeWithSelector(() => ({
    modules: {} as EagerModules,
    sectionReports: new Map(),
    activeGenerations: new Map(),
  })),
)

// ---------------------------------------------------------------------------
// Selectors — derive values from state
// ---------------------------------------------------------------------------

/**
 * Derive per-section max media durations.
 * Returns Record<string, number> (section-index-as-string → seconds).
 */
export function selectMediaDurations(state: EgakiClientState): Record<string, number> {
  const obj: Record<string, number> = {}
  for (const [idx, reports] of state.sectionReports) {
    if (reports.size === 0) continue
    let max = 0
    for (const dur of reports.values()) {
      if (dur > max) max = dur
    }
    if (max > 0) obj[String(idx)] = max
  }
  return obj
}

/** Derive generation counts, or null when nothing is generating. */
export function selectGenerationStatus(state: EgakiClientState): GenerationStatus | null {
  if (state.activeGenerations.size === 0) return null
  let images = 0, videos = 0, speeches = 0
  for (const type of state.activeGenerations.values()) {
    if (type === 'image') images++
    else if (type === 'video') videos++
    else speeches++
  }
  return { images, videos, speeches, total: images + videos + speeches }
}


