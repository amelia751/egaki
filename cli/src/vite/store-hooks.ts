'use client'

/**
 * React hooks for the egaki client state store.
 *
 * Separated from store.ts so the vanilla store has no React dependency and
 * can be imported from any environment (RSC, SSR, client). These hooks are
 * only imported by 'use client' components.
 *
 * Uses useSyncExternalStore with stable module-level selectors. This avoids
 * zustand's useStore + useShallow which internally calls useRef and fails
 * during Spiceflow's SSR pass when the Vite SSR optimizer creates a split
 * React instance (optimized react-dom/server.edge vs real pnpm react).
 */

import { useSyncExternalStore } from 'react'
import {
  egakiStore,
  selectMediaDurations,
  selectGenerationStatus,
  type GenerationStatus,
} from './store.ts'

// Same as safe-mdx's EagerModules
type EagerModules = Record<string, Record<string, any>>

// ---------------------------------------------------------------------------
// Stable subscribe/getSnapshot functions (module-level constants so
// useSyncExternalStore never re-subscribes on re-render).
//
// getSnapshot must return a referentially stable value when the derived
// result hasn't changed. useSyncExternalStore compares snapshots with
// Object.is(), so returning a new object every call causes infinite
// re-render loops. We cache the last snapshot and shallow-compare.
// ---------------------------------------------------------------------------

function shallowEqualRecord(a: Record<string, number>, b: Record<string, number>): boolean {
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  if (keysA.length !== keysB.length) return false
  for (const key of keysA) {
    if (a[key] !== b[key]) return false
  }
  return true
}

function shallowEqualStatus(a: GenerationStatus | null, b: GenerationStatus | null): boolean {
  if (a === b) return true
  if (a === null || b === null) return false
  return a.images === b.images && a.videos === b.videos && a.speeches === b.speeches && a.total === b.total
}

// Media durations
const subscribeMediaDurations = (callback: () => void) =>
  egakiStore.subscribe((state) => state.sectionReports, callback)
let cachedMediaDurations: Record<string, number> = {}
const getMediaDurations = () => {
  const next = selectMediaDurations(egakiStore.getState())
  if (!shallowEqualRecord(cachedMediaDurations, next)) {
    cachedMediaDurations = next
  }
  return cachedMediaDurations
}
const getMediaDurationsServer = () => cachedMediaDurations

// Generation status
const subscribeGenerationStatus = (callback: () => void) =>
  egakiStore.subscribe((state) => state.activeGenerations, callback)
let cachedGenerationStatus: GenerationStatus | null = null
const getGenerationStatus = () => {
  const next = selectGenerationStatus(egakiStore.getState())
  if (!shallowEqualStatus(cachedGenerationStatus, next)) {
    cachedGenerationStatus = next
  }
  return cachedGenerationStatus
}
const getGenerationStatusServer = () => null

// Modules
const subscribeModules = (callback: () => void) =>
  egakiStore.subscribe((state) => state.modules, callback)
const getModules = () => egakiStore.getState().modules

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** Hook: per-section max media durations. */
export function useMediaDurations(): Record<string, number> {
  return useSyncExternalStore(subscribeMediaDurations, getMediaDurations, getMediaDurationsServer)
}

/** Hook: generation counts while media is being generated, or null. */
export function useGenerationStatus(): GenerationStatus | null {
  return useSyncExternalStore(subscribeGenerationStatus, getGenerationStatus, getGenerationStatusServer)
}

/** Hook: user modules from virtual:egaki-modules. */
export function useModules(): EagerModules {
  return useSyncExternalStore(subscribeModules, getModules, getModules)
}

export type { GenerationStatus }
