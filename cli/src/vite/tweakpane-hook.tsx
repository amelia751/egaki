'use client'

/**
 * Tweakpane integration for the egaki video player.
 *
 * Provides useTweakpane() — a React hook that registers a folder of
 * parameters in a shared tweakpane Pane singleton. Each component gets
 * its own folder; when the component unmounts the folder is disposed and
 * removed from the UI. This means only currently-visible components show
 * their parameters.
 *
 * The Pane is mounted into a container managed by <TweakpaneRoot />,
 * rendered once in player-page.tsx. A single "Copy changes" button at
 * the top of the pane serializes all active component parameters as a
 * structured prompt for AI agents.
 *
 * Tweakpane is pure DOM (no React dependency), so there are no dual-React
 * or SSR issues. During SSR (typeof window === 'undefined') the hook
 * returns the raw default values and skips all DOM work.
 */

import { useEffect, useRef, useState, createContext, useContext } from 'react'
import type { PlayerRef } from '@remotion/player'
import { LayoutContainerContext, useIsPremounting } from './mdx-video.tsx'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Slider config: value + optional min/max/step. */
interface SliderParam {
  value: number
  min?: number
  max?: number
  step?: number
}

/** Select/dropdown config: value + options list. */
interface SelectParam {
  value: string
  options: string[]
}

/**
 * A param value is either:
 * - a bare primitive (number, boolean, string) — auto-inferred control
 * - a SliderParam object with explicit range
 * - a SelectParam object with a dropdown of string options
 */
type ParamValue = number | boolean | string | SliderParam | SelectParam

type ParamSchema = Record<string, ParamValue>

/** Resolved values: SliderParam becomes number, SelectParam becomes string, everything else stays. */
type ResolvedValues<T extends ParamSchema> = {
  [K in keyof T]: T[K] extends SliderParam ? number
    : T[K] extends SelectParam ? string
    : T[K] extends number ? number
    : T[K] extends boolean ? boolean
    : T[K] extends string ? string
    : T[K]
}

// ---------------------------------------------------------------------------
// Pane context — player metadata for the copy prompt
// ---------------------------------------------------------------------------

export interface TweakpaneContextValue {
  playerRef: React.RefObject<PlayerRef | null>
  fps: number
  sections: { heading: string | null; durationInFrames: number }[]
  entryPath: string
}

export const TweakpaneContext = createContext<TweakpaneContextValue | null>(null)

// ---------------------------------------------------------------------------
// Global disable switch
// ---------------------------------------------------------------------------

/**
 * Set to `true` to completely disable tweakpane across all components.
 * useTweakpane() will return raw default values without mounting any UI.
 */
export let TWEAKPANE_DISABLED = false

// ---------------------------------------------------------------------------
// Singleton pane state (module-level, not React state)
// ---------------------------------------------------------------------------

/** Lazily imported tweakpane Pane class. */
let PaneClass: typeof import('tweakpane').Pane | null = null
let paneInstance: import('tweakpane').Pane | null = null
let paneContainer: HTMLElement | null = null

/** Persisted expanded state for the root pane across destroy/recreate cycles. */
let paneExpandedState = true

/** Registry of active folders for the copy prompt. */
interface FolderEntry {
  label: string
  /** The mutable params object bound to tweakpane. */
  params: Record<string, unknown>
  /** The original default values for diffing. */
  defaults: Record<string, unknown>
}
const activeFolders = new Map<string, FolderEntry>()

/** Listeners notified when activeFolders changes (for copy button visibility). */
const folderListeners = new Set<() => void>()
function notifyFolderListeners() {
  folderListeners.forEach((fn) => fn())
}

function resolveDefault(v: ParamValue): number | boolean | string {
  if (typeof v === 'object' && v !== null && 'value' in v) return v.value
  return v
}

function isSliderParam(v: ParamValue): v is SliderParam {
  return typeof v === 'object' && v !== null && 'value' in v && !('options' in v)
}

function isSelectParam(v: ParamValue): v is SelectParam {
  return typeof v === 'object' && v !== null && 'options' in v
}

async function ensurePane(): Promise<import('tweakpane').Pane> {
  if (paneInstance) return paneInstance
  if (!PaneClass) {
    const mod = await import('tweakpane')
    PaneClass = mod.Pane
  }
  if (!paneContainer) {
    paneContainer = document.createElement('div')
    paneContainer.id = 'egaki-tweakpane'
    // Position top-right, above everything
    Object.assign(paneContainer.style, {
      position: 'fixed',
      top: '8px',
      right: '8px',
      zIndex: '99999',
      maxHeight: 'calc(100vh - 16px)',
      overflow: 'hidden',
    })
    document.body.appendChild(paneContainer)
  }
  paneInstance = new PaneClass!({ container: paneContainer, title: 'Parameters', expanded: paneExpandedState })
  paneInstance.on('fold', (ev) => {
    paneExpandedState = ev.expanded
  })
  return paneInstance
}

function disposePane() {
  if (paneInstance) {
    paneInstance.dispose()
    paneInstance = null
  }
  if (paneContainer?.parentElement) {
    paneContainer.parentElement.removeChild(paneContainer)
    paneContainer = null
  }
}

// ---------------------------------------------------------------------------
// Copy prompt serialization
// ---------------------------------------------------------------------------

function getCurrentSection(
  frame: number,
  sections: { heading: string | null; durationInFrames: number }[],
): { heading: string | null; durationInFrames: number } | null {
  let acc = 0
  for (const s of sections) {
    if (frame < acc + s.durationInFrames) return s
    acc += s.durationInFrames
  }
  return sections.length > 0 ? sections[sections.length - 1]! : null
}

function formatValue(v: unknown): string {
  if (typeof v === 'number') {
    return Number.isInteger(v) ? String(v) : v.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')
  }
  return JSON.stringify(v)
}

function serializeTweakpanePrompt(
  ctx: TweakpaneContextValue | null,
): string {
  if (activeFolders.size === 0) return ''

  const parts: string[] = ['## Parameter changes\n']

  if (ctx?.entryPath) {
    parts.push(`File: ${ctx.entryPath}`)
  }

  // Frame + section context
  if (ctx) {
    const currentFrame = ctx.playerRef.current?.getCurrentFrame() ?? null
    if (currentFrame !== null) {
      const seconds = (currentFrame / ctx.fps).toFixed(1)
      parts.push(`Current frame: ${currentFrame} (${seconds}s at ${ctx.fps}fps)`)
      const section = getCurrentSection(currentFrame, ctx.sections)
      if (section?.heading) {
        parts.push(`Section: "${section.heading}"`)
      }
      parts.push('')
    }
  }

  for (const [id, entry] of activeFolders) {
      const changed: string[] = []
    for (const [key, current] of Object.entries(entry.params)) {
      const def = entry.defaults[key]
      if (current !== def) {
        changed.push(`  ${key}: ${formatValue(current)}`)
      }
    }
    if (changed.length > 0) {
      parts.push(`**${entry.label}**`)
      parts.push(changed.join('\n'))
      parts.push('')
    }
  }

  // If nothing changed from defaults, still show all current values
  if (parts.length <= 2) {
    parts.push('No parameters changed from defaults.\n')
    for (const [id, entry] of activeFolders) {
      parts.push(`**${entry.label}** (current values)`)
      for (const [key, current] of Object.entries(entry.params)) {
        parts.push(`  ${key}: ${formatValue(current)}`)
      }
      parts.push('')
    }
  }

  parts.push('Apply these values as the new props in the component code.')
  return parts.join('\n')
}

// Module-level ref for the context value (set by TweakpaneRoot, read by the
// copy button handler). Avoids threading React context into the imperative
// tweakpane button click handler.
let contextRef: TweakpaneContextValue | null = null

let copyButtonAdded = false

async function ensureCopyButton() {
  if (copyButtonAdded) return
  // Set flag synchronously before awaiting to prevent concurrent calls
  // from adding duplicate buttons
  copyButtonAdded = true
  const pane = await ensurePane()
  pane.addButton({ title: '📋 Copy changes' }).on('click', () => {
    const text = serializeTweakpanePrompt(contextRef)
    if (!text) return
    navigator.clipboard.writeText(text).catch(() => {})
  })
  pane.addBlade({ view: 'separator' })
}

// ---------------------------------------------------------------------------
// useTweakpane hook
// ---------------------------------------------------------------------------

/**
 * Register a folder of tweakable parameters for the current component.
 *
 * @param label  Folder title shown in the pane UI. Also set as
 *               `data-tweakpane="label"` on a wrapper div for agent inspection.
 * @param schema Parameter definitions. Each key maps to either:
 *   - a bare `number`, `boolean`, or `string` (auto-inferred control)
 *   - a `{ value, min?, max?, step? }` object for explicit slider range
 *
 * Returns a reactive object with current values. Updating a control in the
 * pane immediately triggers a React re-render with fresh values.
 *
 * On unmount the folder is disposed and removed from the pane.
 */
export function useTweakpane<T extends ParamSchema>(
  label: string,
  schema: T,
): ResolvedValues<T> {
  // Skip registration inside layout-transition ghost renders (the previous
  // section is re-rendered hidden for FLIP measurement; we don't want its
  // components polluting the tweakpane UI) and premounted sequences
  // (premountFor renders the next section early but invisible for preloading;
  // Remotion freezes useCurrentFrame() at 0 and sets opacity: 0).
  const container = useContext(LayoutContainerContext)
  const isGhost = container === 'ghost'
  const isPremounting = useIsPremounting()
  const skip = isGhost || isPremounting

  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const v: Record<string, unknown> = {}
    for (const [key, param] of Object.entries(schema)) {
      v[key] = resolveDefault(param)
    }
    return v
  })

  // Track the schema for updates
  const schemaRef = useRef(schema)
  schemaRef.current = schema

  // Stable ID for this hook instance
  const idRef = useRef(`${label}-${Math.random().toString(36).slice(2, 8)}`)

  useEffect(() => {
    // SSR guard, ghost/premount render, or globally disabled — skip all pane work.
    // `skip` is in the dep array so the effect re-runs when premounting ends and
    // the section becomes active (registers tweakpane) or vice versa (tears down).
    if (typeof window === 'undefined' || skip || TWEAKPANE_DISABLED) return

    const id = idRef.current
    // Mutable params object that tweakpane binds to
    const params: Record<string, unknown> = {}
    const defaults: Record<string, unknown> = {}
    for (const [key, param] of Object.entries(schemaRef.current)) {
      const def = resolveDefault(param)
      params[key] = def
      defaults[key] = def
    }

    let folder: import('tweakpane').FolderApi | null = null
    let disposed = false

    void (async () => {
      await ensureCopyButton()
      if (disposed) return
      const pane = await ensurePane()
      if (disposed) return

      folder = pane.addFolder({ title: label, expanded: true })

      for (const [key, param] of Object.entries(schemaRef.current)) {
        const opts: Record<string, unknown> = {}
        if (isSelectParam(param)) {
          // Build { Label: value } map for tweakpane list binding
          const optionsMap: Record<string, string> = {}
          for (const opt of param.options) optionsMap[opt] = opt
          opts.options = optionsMap
        } else if (isSliderParam(param)) {
          if (param.min !== undefined) opts.min = param.min
          if (param.max !== undefined) opts.max = param.max
          if (param.step !== undefined) opts.step = param.step
        } else if (typeof param === 'number') {
          // Auto-infer range for bare numbers
          if (param >= 0 && param <= 1) {
            opts.min = 0; opts.max = 1; opts.step = 0.01
          } else if (param >= 0 && param <= 10) {
            opts.min = 0; opts.max = param * 3 || 10; opts.step = 0.1
          } else if (param >= 0 && param <= 100) {
            opts.min = 0; opts.max = param * 3 || 100; opts.step = 1
          } else if (param >= 0) {
            opts.min = 0; opts.max = param * 3 || 1000; opts.step = 10
          }
        }

        folder.addBinding(params, key, opts).on('change', (ev) => {
          setValues((prev) => ({ ...prev, [key]: ev.value }))
        })
      }

      // Register for copy prompt
      activeFolders.set(id, { label, params, defaults })
      notifyFolderListeners()
    })()

    return () => {
      disposed = true
      if (folder) {
        folder.dispose()
        folder = null
      }
      activeFolders.delete(id)
      notifyFolderListeners()

      // If no more folders, tear down the pane entirely
      if (activeFolders.size === 0) {
        copyButtonAdded = false
        disposePane()
      }
    }
  }, [label, skip])

  return values as ResolvedValues<T>
}

// ---------------------------------------------------------------------------
// TweakpaneRoot — mounts nothing visible, just provides context
// ---------------------------------------------------------------------------

/**
 * Mount once in the player page. Provides player metadata (frame, fps,
 * sections) to the copy prompt button via module-level ref.
 */
export function TweakpaneRoot({
  playerRef,
  fps,
  sections,
  entryPath,
}: {
  playerRef: React.RefObject<PlayerRef | null>
  fps: number
  sections: { heading: string | null; durationInFrames: number }[]
  entryPath: string
}) {
  // Keep module-level ref in sync for the copy button handler
  useEffect(() => {
    contextRef = { playerRef, fps, sections, entryPath }
    return () => {
      contextRef = null
    }
  }, [playerRef, fps, sections, entryPath])

  return null
}
