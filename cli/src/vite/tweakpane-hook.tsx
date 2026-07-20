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
 * The Pane is mounted into a sidebar container managed by <TweakpaneRoot />,
 * rendered once in player-page.tsx. The sidebar is always visible on the
 * right side of the page and takes its own space in the layout (no floating
 * overlay). A single "Copy changes" button at the top of the pane serializes
 * all active component parameters as a structured prompt for AI agents.
 *
 * Tweakpane is pure DOM (no React dependency), so there are no dual-React
 * or SSR issues. During SSR (typeof window === 'undefined') the hook
 * returns the raw default values and skips all DOM work.
 *
 * Live props vs user overrides: each param follows the LIVE schema value
 * passed on every render (so animated props like translateX={interpolate(...)}
 * work) until the user touches that control in the pane. Once touched, the
 * user's value wins for that key until the component remounts. Untouched
 * controls are refreshed in the pane every render so animated values are
 * visible while playing. Programmatic refreshes are guarded so tweakpane's
 * change events (which fire on refresh() too) don't mark keys as touched.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, createContext, useContext } from 'react'
import type { PlayerRef } from '@remotion/player'
import { LayoutContainerContext, useIsPremounting } from './mdx-video.tsx'
import { setSidebarOpen } from './store.ts'
import { useSidebarOpen } from './store-hooks.ts'

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

/** Cubic bezier config: four control points [x1, y1, x2, y2]. */
export interface CubicBezierParam {
  type: 'cubicBezier'
  value: [number, number, number, number]
}

/** Range config: min/max pair displayed as a single range slider (plugin-essentials). */
interface RangeParam {
  type: 'range'
  value: { min: number; max: number }
  min: number
  max: number
  step?: number
}

/**
 * A param value is either:
 * - a bare primitive (number, boolean, string) — auto-inferred control
 * - a SliderParam object with explicit range
 * - a SelectParam object with a dropdown of string options
 * - a CubicBezierParam for a visual bezier curve editor
 * - a RangeParam for a min/max range slider (plugin-essentials)
 */
type ParamValue = number | boolean | string | SliderParam | SelectParam | CubicBezierParam | RangeParam

type ParamSchema = Record<string, ParamValue>

/** Resolved values: SliderParam becomes number, SelectParam becomes string, CubicBezierParam becomes tuple, RangeParam becomes {min, max}, everything else stays. */
type ResolvedValues<T extends ParamSchema> = {
  [K in keyof T]: T[K] extends SliderParam ? number
    : T[K] extends SelectParam ? string
    : T[K] extends CubicBezierParam ? [number, number, number, number]
    : T[K] extends RangeParam ? { min: number; max: number }
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

/** Lazily imported tweakpane Pane class and essentials plugin module. */
let PaneClass: typeof import('tweakpane').Pane | null = null
let EssentialsPlugin: any = null
let paneInstance: import('tweakpane').Pane | null = null

/** External container element set by TweakpaneRoot. The Pane mounts into
 *  this DOM node instead of creating its own floating div. */
let externalContainer: HTMLElement | null = null

/** Persisted expanded state for the root pane across destroy/recreate cycles. */
let paneExpandedState = true

/** Registry of active folders for the copy prompt. */
interface FolderEntry {
  label: string
  /** The mutable params object bound to tweakpane. */
  params: Record<string, unknown>
  /** The original default values for diffing. */
  defaults: Record<string, unknown>
  /** Keys the user changed via the pane UI. Only these count as "changed"
   *  in the copy prompt — untouched keys track live (possibly animated)
   *  props, so diffing them against mount-time defaults would be noise. */
  touched: Set<string>
}
const activeFolders = new Map<string, FolderEntry>()

/** Listeners notified when activeFolders changes (for copy button visibility). */
const folderListeners = new Set<() => void>()
function notifyFolderListeners() {
  folderListeners.forEach((fn) => fn())
}

/** Shallow-clone arrays and plain objects so tweakpane's in-place mutations
 *  don't leak between params and defaults references. */
function cloneValue<T>(value: T): T {
  if (Array.isArray(value)) return [...value] as T
  if (typeof value === 'object' && value !== null) return { ...value } as T
  return value
}

/** Deep-equal for param values: primitives, small arrays (bezier tuples),
 *  and flat objects (range {min, max}). */
function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => x === b[i])
  }
  if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) {
    const ra = a as Record<string, unknown>
    const rb = b as Record<string, unknown>
    const ka = Object.keys(ra)
    return ka.length === Object.keys(rb).length && ka.every((k) => ra[k] === rb[k])
  }
  return false
}

function resolveDefault(v: ParamValue): number | boolean | string | [number, number, number, number] | { min: number; max: number } {
  if (isCubicBezierParam(v)) return [...v.value]
  if (isRangeParam(v)) return { ...v.value }
  if (typeof v === 'object' && v !== null && 'value' in v) return v.value
  return v
}

function isSliderParam(v: ParamValue): v is SliderParam {
  return typeof v === 'object' && v !== null && 'value' in v && !('options' in v) && !('type' in v)
}

function isSelectParam(v: ParamValue): v is SelectParam {
  return typeof v === 'object' && v !== null && 'options' in v
}

function isCubicBezierParam(v: ParamValue): v is CubicBezierParam {
  return typeof v === 'object' && v !== null && 'type' in v && (v as any).type === 'cubicBezier'
}

function isRangeParam(v: ParamValue): v is RangeParam {
  return typeof v === 'object' && v !== null && 'type' in v && (v as any).type === 'range'
}

/** Guard against concurrent ensurePane() calls during the async import. */
let panePromise: Promise<import('tweakpane').Pane | null> | null = null

async function ensurePane(): Promise<import('tweakpane').Pane | null> {
  if (paneInstance) return paneInstance
  if (panePromise) return panePromise

  panePromise = (async () => {
    if (!PaneClass) {
      // Load tweakpane and the essentials plugin (cubic bezier blade) together.
      // Both are cached at module level so subsequent pane re-creations (after
      // disposePane on scene change) register the plugin synchronously, avoiding
      // a race where concurrent ensurePane() callers get a pane without the
      // plugin registered.
      const [mod, essentials] = await Promise.all([
        import('tweakpane'),
        import('@tweakpane/plugin-essentials').catch(() => null),
      ])
      PaneClass = mod.Pane
      EssentialsPlugin = essentials
    }
    if (!externalContainer) {
      console.warn('[egaki] TweakpaneRoot not mounted — tweakpane has no container')
      return null
    }
    paneInstance = new PaneClass!({ container: externalContainer, title: 'Parameters', expanded: paneExpandedState })
    if (EssentialsPlugin) paneInstance.registerPlugin(EssentialsPlugin)
    paneInstance.on('fold', (ev) => {
      paneExpandedState = ev.expanded
    })
    return paneInstance
  })()

  const pane = await panePromise
  panePromise = null
  return pane
}

function disposePane() {
  if (paneInstance) {
    paneInstance.dispose()
    paneInstance = null
  }
  // Don't remove the container — it's owned by TweakpaneRoot (React).
  // The Pane's dispose() already removes its own element from the container.
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
  if (Array.isArray(v) && v.length === 4 && v.every((x) => typeof x === 'number')) {
    // Cubic bezier control points — format as cubicBezier() call so agents
    // can paste it directly as an easing prop value.
    return `cubicBezier(${v.join(', ')})`
  }
  if (typeof v === 'object' && v !== null && 'min' in v && 'max' in v) {
    const r = v as { min: number; max: number }
    const fmtNum = (n: number) => Number.isInteger(n) ? String(n) : n.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')
    return `{ min: ${fmtNum(r.min)}, max: ${fmtNum(r.max)} }`
  }
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

  let hasAnyChanges = false
  for (const [id, entry] of activeFolders) {
    const changed: string[] = []
    for (const [key, current] of Object.entries(entry.params)) {
      const def = entry.defaults[key]
      // Only user-touched keys count as changed. Untouched keys mirror live
      // (possibly animated) props, so comparing them to mount-time defaults
      // would produce false positives on every playing frame.
      if (entry.touched.has(key) && !valuesEqual(current, def)) {
        changed.push(`  ${key}: ${formatValue(current)}`)
      }
    }
    if (changed.length > 0) {
      hasAnyChanges = true
      parts.push(`**${entry.label}**`)
      parts.push(changed.join('\n'))
      parts.push('')
    }
  }

  // If nothing changed from defaults, still show all current values
  if (!hasAnyChanges) {
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

// Stable module-level callbacks for useSyncExternalStore in CopyChangesButton.
function subscribeFolders(cb: () => void) {
  folderListeners.add(cb)
  return () => { folderListeners.delete(cb) }
}
const getHasActiveFolders = () => activeFolders.size > 0
const getServerHasActiveFolders = () => false

/** React component: copy button rendered above the tweakpane pane. */
function CopyChangesButton() {
  const [copied, setCopied] = useState(false)
  const hasActiveFolders = useSyncExternalStore(
    subscribeFolders,
    getHasActiveFolders,
    getServerHasActiveFolders,
  )

  if (!hasActiveFolders) return null

  return (
    <button
      onClick={() => {
        const text = serializeTweakpanePrompt(contextRef)
        if (!text) return
        navigator.clipboard.writeText(text).catch(() => {})
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        margin: '8px 8px 4px',
        width: 'calc(100% - 16px)',
        padding: '7px 12px',
        background: copied ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 6,
        color: copied ? '#4ade80' : '#a1a1aa',
        fontSize: 12,
        fontWeight: 500,
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif',
        cursor: 'pointer',
        transition: 'background 0.15s, color 0.15s',
      }}
    >
      {copied ? '✓ Copied prompt' : '📋 Copy changes'}
    </button>
  )
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
 * Values follow live props: each key returns the schema value from the
 * CURRENT render until the user touches that control in the pane, so
 * animated props (e.g. `translateX={interpolate(frame, ...)}`) flow through
 * every frame. Once touched, the user's pane value wins for that key until
 * the component remounts.
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

  // Keys the user changed via the pane UI. Untouched keys follow the live
  // schema value on every render (so animated props work); touched keys keep
  // the user's pane value until remount.
  const touchedRef = useRef<Set<string>>(new Set())
  // Latest user override values, mirrored from state so the mount effect can
  // seed rebuilt folders without re-running on every pane change.
  const valuesRef = useRef(values)
  valuesRef.current = values
  // Live handles to the mounted folder + bound params, used by the per-render
  // sync effect below to push animated prop values into the pane.
  const liveRef = useRef<{ folder: import('tweakpane').FolderApi; params: Record<string, unknown> } | null>(null)
  // True while we call folder.refresh() programmatically. tweakpane emits
  // change events on refresh() too, so handlers must ignore those or every
  // animated frame would mark keys as user-touched.
  const refreshingRef = useRef(false)

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
      // Clone object/array values so tweakpane's in-place mutations on params
      // don't corrupt the defaults (used by "Copy changes" diffing).
      // Touched keys keep the user's override when the folder is rebuilt
      // (e.g. premount → active transition re-runs this effect).
      const touched = touchedRef.current.has(key)
      params[key] = cloneValue(touched ? valuesRef.current[key] : def)
      defaults[key] = cloneValue(def)
    }

    let folder: import('tweakpane').FolderApi | null = null
    let disposed = false

    void (async () => {
      const pane = await ensurePane()
      if (disposed || !pane) return

      folder = pane.addFolder({ title: label, expanded: true })

      for (const [key, param] of Object.entries(schemaRef.current)) {
        if (isCubicBezierParam(param)) {
          // Cubic bezier blade — visual curve editor
          const blade = folder.addBlade({
            view: 'cubicbezier',
            value: param.value,
            expanded: true,
            label: key,
            picker: 'inline',
          } as any)
          ;(blade as any).on('change', (ev: any) => {
            if (refreshingRef.current) return
            const val = ev.value
            const tuple: [number, number, number, number] = [
              Math.round(val.x1 * 1000) / 1000,
              Math.round(val.y1 * 1000) / 1000,
              Math.round(val.x2 * 1000) / 1000,
              Math.round(val.y2 * 1000) / 1000,
            ]
            params[key] = tuple
            touchedRef.current.add(key)
            setValues((prev) => ({ ...prev, [key]: tuple }))
          })
          continue
        }
        if (isRangeParam(param)) {
          // Range slider from plugin-essentials — min/max pair as one control
          folder.addBinding(params, key, {
            min: param.min,
            max: param.max,
            step: param.step,
          }).on('change', (ev) => {
            if (refreshingRef.current) return
            const val = ev.value as { min: number; max: number }
            touchedRef.current.add(key)
            setValues((prev) => ({ ...prev, [key]: { min: val.min, max: val.max } }))
          })
          continue
        }
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
          if (refreshingRef.current) return
          touchedRef.current.add(key)
          setValues((prev) => ({ ...prev, [key]: ev.value }))
        })
      }

      liveRef.current = { folder, params }

      // Register for copy prompt
      activeFolders.set(id, { label, params, defaults, touched: touchedRef.current })
      notifyFolderListeners()
    })()

    return () => {
      disposed = true
      liveRef.current = null
      if (folder) {
        folder.dispose()
        folder = null
      }
      activeFolders.delete(id)
      notifyFolderListeners()

      // If no more folders, tear down the pane entirely
      if (activeFolders.size === 0) {
        disposePane()
      }
    }
  }, [label, skip])

  // Push live (possibly animated) prop values into the pane for untouched
  // keys. Runs after every render — during playback the component re-renders
  // each frame, so animated values are visible moving in the pane UI.
  // folder.refresh() emits change events; refreshingRef makes handlers
  // ignore them so refreshes never mark keys as touched.
  useEffect(() => {
    const live = liveRef.current
    if (!live) return
    let dirty = false
    for (const [key, param] of Object.entries(schemaRef.current)) {
      if (touchedRef.current.has(key)) continue
      // Bezier blades are not bindings — refresh() won't read params for
      // them. The returned value still follows live props below.
      if (isCubicBezierParam(param)) continue
      const liveVal = resolveDefault(param)
      if (!valuesEqual(live.params[key], liveVal)) {
        live.params[key] = cloneValue(liveVal)
        dirty = true
      }
    }
    if (dirty) {
      refreshingRef.current = true
      live.folder.refresh()
      refreshingRef.current = false
    }
  })

  // Merge: user-touched keys return the pane value, untouched keys follow
  // the live schema value so animated props work without any extra wiring.
  const merged: Record<string, unknown> = {}
  for (const [key, param] of Object.entries(schema)) {
    merged[key] = touchedRef.current.has(key) ? values[key] : resolveDefault(param)
  }
  return merged as ResolvedValues<T>
}

// ---------------------------------------------------------------------------
// TweakpaneRoot — sidebar container for the tweakpane pane
// ---------------------------------------------------------------------------

/** Sidebar width constant shared with player-page layout. */
export const SIDEBAR_WIDTH = 280

/** Lucide-style panel-right icon used for both opening and closing the sidebar. */
function PanelRightIcon() {
  return (
    <svg
      width='16'
      height='16'
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth='1.5'
      strokeLinecap='round'
      strokeLinejoin='round'
    >
      <rect x='3' y='3' width='18' height='18' rx='2' />
      <line x1='15' y1='3' x2='15' y2='21' />
    </svg>
  )
}

/**
 * Right sidebar that hosts the tweakpane Pane. Collapsed by default so the
 * video takes the full width; a fixed top-right button opens it. The sidebar
 * container stays mounted while collapsed (hidden via display: none) because
 * useTweakpane registers controls into it — unmounting would lose all
 * registrations until components remount. Also provides player metadata
 * (frame, fps, sections) to the copy prompt button.
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
  // Ref callback sets the container synchronously when the DOM node mounts,
  // before any child useEffect (where useTweakpane calls ensurePane). On
  // unmount the callback receives null, so we clean up the pane.
  const containerRefCallback = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      externalContainer = node
    } else {
      disposePane()
      externalContainer = null
    }
  }, [])

  // Keep module-level ref in sync for the copy button handler
  useEffect(() => {
    contextRef = { playerRef, fps, sections, entryPath }
    return () => {
      contextRef = null
    }
  }, [playerRef, fps, sections, entryPath])

  const sidebarOpen = useSidebarOpen()

  return (
    <>
      {!sidebarOpen && (
        <button
          onClick={() => setSidebarOpen(true)}
          title='Open controls sidebar'
          className='fixed top-4 right-4 z-10 flex items-center justify-center rounded-lg w-8 h-8 text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-colors cursor-pointer'
        >
          <PanelRightIcon />
        </button>
      )}
      <div
        className='egaki-sidebar'
        style={{
          width: SIDEBAR_WIDTH,
          minWidth: SIDEBAR_WIDTH,
          height: '100vh',
          position: 'sticky',
          top: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          background: '#111',
          borderLeft: '1px solid rgba(255,255,255,0.08)',
          flexShrink: 0,
          display: sidebarOpen ? undefined : 'none',
        }}
      >
        <div className='flex items-center justify-end px-2 pt-2'>
          <button
            onClick={() => setSidebarOpen(false)}
            title='Close controls sidebar'
            className='flex items-center justify-center rounded-lg w-8 h-8 text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-colors cursor-pointer'
          >
            <PanelRightIcon />
          </button>
        </div>
        <CopyChangesButton />
        <div
          ref={containerRefCallback}
          id='egaki-tweakpane'
          style={{ width: '100%' }}
        />
      </div>
    </>
  )
}
