/**
 * Centralized client-side state store (zustand/vanilla).
 *
 * Pure vanilla store with no React imports. State slices:
 *
 * 1. **modules** — eagerly-imported user .tsx/.ts modules, updated via HMR
 * 2. **sectionReports** — per-section effective media durations reported by
 *    Audio/Video components (ephemeral, not persisted)
 * 3. **serverGenerationStatus** — server-reported generation progress from
 *    the /api/generation-progress SSE stream, for the toolbar status indicator
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

export interface GenerationStatus {
  /** Count of active generations per namespace (e.g. { image: 2, video: 1 }) */
  counts: Record<string, number>
  total: number
}

/** Individual generation entry from the server progress stream. */
export interface GenerationProgressEntry {
  key: string
  namespace: string
  label: string
  model?: string
  startedAt: number
  elapsedMs: number
  params: Record<string, unknown>
}

/** A generation that failed, reported via the progress stream. */
export interface GenerationError {
  key: string
  namespace: string
  label: string
  model?: string
  error: string
  durationMs: number
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

  /** Server-reported generation progress from /api/generation-progress SSE stream. */
  serverGenerationStatus: GenerationStatus | null

  /** Detailed generation entries from the server progress stream. */
  serverGenerationEntries: GenerationProgressEntry[]

  /** Recent generation errors from the server progress stream.
   *  Errors auto-clear after ERROR_DISPLAY_DURATION_MS. */
  serverGenerationErrors: GenerationError[]
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const egakiStore = createStore<EgakiClientState>()(
  subscribeWithSelector(() => ({
    modules: {} as EagerModules,
    sectionReports: new Map(),
    serverGenerationStatus: null as GenerationStatus | null,
    serverGenerationEntries: [] as GenerationProgressEntry[],
    serverGenerationErrors: [] as GenerationError[],
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

/** Generation status from the server progress stream, or null when idle. */
export function selectGenerationStatus(state: EgakiClientState): GenerationStatus | null {
  return state.serverGenerationStatus
}


