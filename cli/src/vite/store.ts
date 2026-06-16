'use client'

/**
 * Centralized client-side state store (zustand/vanilla).
 *
 * Replaces three independent hand-rolled useSyncExternalStore + Set<listener>
 * mini-stores with one source of truth. State slices:
 *
 * 1. **modules** — eagerly-imported user .tsx/.ts modules, updated via HMR
 * 2. **sectionReports** — per-section effective media durations reported by
 *    Audio/Video components (ephemeral, not persisted)
 * 3. **activeGenerations** — tracks in-flight AI generation promises for the
 *    toolbar status indicator
 *
 * React hooks read slices via useSyncExternalStore with selectors so each
 * consumer only re-renders when its slice changes.
 */

import { useSyncExternalStore } from 'react'
import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'
import { subscribeWithSelector } from 'zustand/middleware'
import { useShallow } from 'zustand/shallow'

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

// ---------------------------------------------------------------------------
// React hooks — useStore with selectors
// ---------------------------------------------------------------------------

/**
 * Hook: per-section max media durations.
 * Returns Record<string, number> (section-index-as-string → seconds).
 * Uses shallow equality so a new object is only returned when values change.
 */
export function useMediaDurations(): Record<string, number> {
  return useStore(egakiStore, useShallow(selectMediaDurations))
}

/** Hook: generation counts while media is being generated, or null. */
export function useGenerationStatus(): GenerationStatus | null {
  return useStore(egakiStore, useShallow(selectGenerationStatus))
}

// Stable references for useModules — useSyncExternalStore re-subscribes
// whenever the subscribe function identity changes, so these must be
// module-level constants.
const subscribeModules = (callback: () => void) =>
  egakiStore.subscribe((state) => state.modules, callback)
const getModules = () => egakiStore.getState().modules

/**
 * Hook: user modules from virtual:egaki-modules.
 *
 * Uses useSyncExternalStore instead of useStore because the server snapshot
 * must reflect the current modules (set via setModules during module init),
 * not the store's initial state (empty {}). Zustand's useStore uses
 * getInitialState() for SSR which stays empty forever.
 *
 * Uses subscribeWithSelector's selector-based subscribe so only module
 * changes fire the callback (not sectionReports or activeGenerations).
 */
export function useModules(): EagerModules {
  return useSyncExternalStore(subscribeModules, getModules, getModules)
}
