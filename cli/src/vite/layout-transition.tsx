'use client'

/**
 * LayoutTransition — FLIP-based layout animation across section boundaries.
 *
 * <LayoutTransition id="x"> wraps an element that should animate from its
 * position in the previous section to its position in the current section.
 * When two consecutive sections both contain <LayoutTransition id="x">,
 * the element in the current section starts at the previous section's
 * position and springs to its natural position.
 *
 * Architecture (no temporal state — seek-safe by design):
 * - The previous section is re-rendered in a hidden "ghost" container,
 *   pinned at its last frame via Remotion <Freeze>. This happens in
 *   SectionWithLayoutTransition (player-page.tsx).
 * - LayoutContainerContext tells each LayoutTransition whether it lives
 *   in the ghost or the visible container.
 * - Entries register into LayoutRegistryContext in useLayoutEffect.
 *   React runs effects in tree order, so all LayoutTransition effects
 *   (descendants of containers rendered before the layer) complete before
 *   LayoutAnimationLayer's effect runs.
 * - LayoutAnimationLayer measures ghost vs visible rects every frame and
 *   writes interpolated FLIP transforms directly to the visible wrappers.
 *
 * Hard-won correctness details (do not "simplify" these away):
 * - getBoundingClientRect() INCLUDES CSS transforms. Transforms must be
 *   reset before measuring, or each frame compounds the previous frame's
 *   FLIP offset and the element drifts.
 * - The Remotion Player scales the composition to fit the viewport.
 *   Client-px deltas must be divided by that scale before being used as
 *   transform values in composition space. The layer measures the scale
 *   from its own composition-sized AbsoluteFill.
 * - The web-renderer does not support z-index; layer order is DOM order.
 *   The ghost renders BEFORE the visible content so the visible section
 *   paints over it even if a renderer ignores visibility:hidden.
 */

import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'
import { dspring } from './mdx-video.tsx'

// ---------------------------------------------------------------------------
// Types and context
// ---------------------------------------------------------------------------

type LayoutContainerKind = 'ghost' | 'visible'

/** Which axes to animate: position + size, position only, or size only. */
export type LayoutTransitionMode = 'both' | 'position' | 'size'

export interface LayoutEntry {
  id: string
  container: LayoutContainerKind
  ref: RefObject<HTMLDivElement | null>
  /** Transition duration in frames */
  durationInFrames: number
  /** Spring bounce, 0 = no overshoot */
  bounce: number
  /** Custom easing function. When set, overrides the spring. */
  easing: ((t: number) => number) | null
  /** Which axes to animate. Default 'both'. */
  mode: LayoutTransitionMode
  /** Intra-scene: frame at which this instance becomes visible (inclusive). */
  showFrom?: number
  /** Intra-scene: frame at which this instance stops being visible (exclusive). */
  showUpTo?: number
}

export interface LayoutRegistry {
  entries: Set<LayoutEntry>
  /** Returns an unregister function */
  register(entry: LayoutEntry): () => void
}

const LayoutRegistryContext = createContext<LayoutRegistry | null>(null)
export const LayoutContainerContext = createContext<LayoutContainerKind>('visible')

// ---------------------------------------------------------------------------
// Style interpolation helpers for LayoutTransition FLIP animations.
// Mirrors Framer Motion's mix-values.ts, scale-border-radius.ts, and
// scale-box-shadow.ts but adapted for our ghost/visible FLIP approach.
// ---------------------------------------------------------------------------

type RGBA = [number, number, number, number]

/** Parse rgb()/rgba()/hex color string to [r, g, b, a] tuple. */
function parseColor(str: string): RGBA | null {
  if (!str || str === 'transparent' || str === 'rgba(0, 0, 0, 0)') return null
  // rgb(r, g, b) or rgba(r, g, b, a)
  const m = str.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/)
  if (m && m[1] && m[2] && m[3]) return [+m[1], +m[2], +m[3], m[4] !== undefined ? +m[4] : 1]
  return null
}

/** Mix two RGBA colors by progress (0–1). */
function mixColor(from: RGBA, to: RGBA, progress: number): string {
  const r = Math.round(from[0] + (to[0] - from[0]) * progress)
  const g = Math.round(from[1] + (to[1] - from[1]) * progress)
  const b = Math.round(from[2] + (to[2] - from[2]) * progress)
  const a = from[3] + (to[3] - from[3]) * progress
  return a >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`
}

/** Parse a borderRadius value (px or %) to a number. Returns 0 for unparseable. */
function parseBorderRadius(val: string): number {
  return parseFloat(val) || 0
}

/** Linearly interpolate two numbers. */
function mixNumber(from: number, to: number, progress: number): number {
  return from + (to - from) * progress
}

/** CSS border-radius corner property names in kebab-case for
 *  getPropertyValue() reads and setProperty() writes. */
const BORDER_RADIUS_PROPS = [
  'border-top-left-radius',
  'border-top-right-radius',
  'border-bottom-left-radius',
  'border-bottom-right-radius',
] as const

/**
 * Parse a simple box-shadow string into its numeric components.
 * Returns null for 'none', multiple shadows, or unparseable values.
 *
 * getComputedStyle returns shadows like:
 *   "rgba(0, 0, 0, 0.2) 0px 4px 12px 0px"
 *   "0px 4px 12px 0px rgba(0, 0, 0, 0.2)"
 *
 * Multiple shadows are separated by commas OUTSIDE parentheses.
 * We must not reject commas inside rgba().
 */
function parseBoxShadow(val: string): { offsetX: number; offsetY: number; blur: number; spread: number; color: string } | null {
  if (!val || val === 'none') return null
  // Check for multiple shadows: commas outside parentheses.
  // Walk the string tracking paren depth; if we find a comma at depth 0
  // there are multiple shadows, which we don't support.
  let depth = 0
  for (let i = 0; i < val.length; i++) {
    const ch = val[i]
    if (ch === '(') depth++
    else if (ch === ')') depth--
    else if (ch === ',' && depth === 0) return null
  }
  // Extract the color function or keyword
  const colorMatch = val.match(/(rgba?\([^)]+\)|#[0-9a-fA-F]+)/)
  if (!colorMatch || !colorMatch[1]) return null
  const color = colorMatch[1]
  const withoutColor = val.replace(color, '').trim()
  const nums = withoutColor.split(/\s+/).map(parseFloat).filter((n) => !isNaN(n))
  if (nums.length < 2 || nums[0] === undefined || nums[1] === undefined) return null
  return {
    offsetX: nums[0],
    offsetY: nums[1],
    blur: nums[2] ?? 0,
    spread: nums[3] ?? 0,
    color,
  }
}

/**
 * Apply FLIP transform and interpolated visual styles to an element.
 *
 * Reads computed styles from the source/target's first child elements (where
 * user visual styles like borderRadius and backgroundColor live) and applies
 * interpolated values to the wrapper element during the transition.
 *
 * Scale correction for borderRadius and boxShadow follows Framer Motion's
 * approach: borderRadius is counter-scaled by the projection delta so corners
 * don't distort; boxShadow offsets and blur are divided by the scale so
 * shadows don't squish.
 */
function applyFlip({
  el,
  sourceEl,
  fromRect,
  toRect,
  progress,
  playerScale,
  entry,
}: {
  el: HTMLElement
  sourceEl: HTMLElement
  fromRect: DOMRect
  toRect: DOMRect
  progress: number
  playerScale: number
  entry: LayoutEntry
}) {
  const inv = 1 - progress
  let dx = ((fromRect.x - toRect.x) / playerScale) * inv
  let dy = ((fromRect.y - toRect.y) / playerScale) * inv
  let sx = 1 + (fromRect.width / toRect.width - 1) * inv
  let sy = 1 + (fromRect.height / toRect.height - 1) * inv

  // Mode: constrain which axes animate
  if (entry.mode === 'position') { sx = 1; sy = 1 }
  if (entry.mode === 'size') { dx = 0; dy = 0 }

  el.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`

  // Read computed styles from the visual content elements (first child),
  // since user styles live on children, not the LayoutTransition wrapper.
  // Interpolated visual styles are applied to targetVisual (not the wrapper)
  // so they override the child's own styles during the transition. If we
  // wrote to the wrapper, the child's own background/shadow would paint
  // over our interpolated values.
  const sourceVisual = sourceEl.firstElementChild
  const targetVisual = el.firstElementChild
  if (!(sourceVisual instanceof HTMLElement) || !(targetVisual instanceof HTMLElement)) return

  const fromStyles = getComputedStyle(sourceVisual)
  const toStyles = getComputedStyle(targetVisual)

  // --- Border radius interpolation + scale correction ---
  // Interpolate each corner independently, then counter-scale per axis
  // so corners appear visually correct despite the scale transform.
  // Uses elliptical border-radius (xR / sx, yR / sy) for accurate
  // correction under non-uniform scale, unlike simple average scaling.
  // Only processes px values; % units pass through unchanged (mixing
  // incompatible units would produce incorrect results).
  const hasRadiusChange = BORDER_RADIUS_PROPS.some(
    (prop) => fromStyles.getPropertyValue(prop) !== toStyles.getPropertyValue(prop),
  )
  if (hasRadiusChange || sx !== 1 || sy !== 1) {
    let hasNonZeroRadius = false
    for (const prop of BORDER_RADIUS_PROPS) {
      const fromVal = fromStyles.getPropertyValue(prop)
      const toVal = toStyles.getPropertyValue(prop)
      const fromIsPercent = fromVal.includes('%')
      const toIsPercent = toVal.includes('%')
      // Only mix compatible units. If either is %, skip interpolation
      // and use the target value directly (same as Motion's fallback).
      if (fromIsPercent || toIsPercent) {
        patchStyle(el, targetVisual, prop, toVal)
        hasNonZeroRadius = hasNonZeroRadius || parseBorderRadius(toVal) > 0
        continue
      }
      const fromR = parseBorderRadius(fromVal)
      const toR = parseBorderRadius(toVal)
      const mixed = mixNumber(fromR, toR, progress)
      // Elliptical counter-scale: divide by each axis's scale separately
      // so non-uniform scales (e.g. scale(2, 1)) correct each direction.
      const correctedX = sx !== 0 ? Math.max(mixed / sx, 0) : mixed
      const correctedY = sy !== 0 ? Math.max(mixed / sy, 0) : mixed
      patchStyle(el, targetVisual, prop, `${correctedX}px ${correctedY}px`)
      hasNonZeroRadius = hasNonZeroRadius || mixed > 0
    }
    // Only set overflow:hidden when there's a non-zero radius that needs
    // child clipping. Setting it unconditionally can crop content.
    if (hasNonZeroRadius) patchStyle(el, targetVisual, 'overflow', 'hidden')
  }

  // --- Background color interpolation ---
  // Motion doesn't interpolate background during layout transitions,
  // but for video this is valuable: hard color cuts between sections
  // look jarring. We interpolate if both sides have a non-transparent bg.
  const fromColor = parseColor(fromStyles.backgroundColor)
  const toColor = parseColor(toStyles.backgroundColor)
  if (fromColor && toColor) {
    patchStyle(el, targetVisual, 'background-color', mixColor(fromColor, toColor, progress))
  }

  // --- Box shadow scale correction ---
  // When the element is scaled, box-shadow offsets and blur get squished.
  // Counter-scale them by the projection delta, same as Motion's
  // correctBoxShadow. offsetX by sx, offsetY by sy, blur+spread by
  // average scale. Only handles single shadows for simplicity.
  const targetShadow = toStyles.boxShadow
  if (targetShadow && targetShadow !== 'none') {
    const parsed = parseBoxShadow(targetShadow)
    if (parsed) {
      const avgScale = (sx + sy) / 2
      if (avgScale !== 0 && avgScale !== 1) {
        patchStyle(el, targetVisual, 'box-shadow', `${parsed.offsetX / sx}px ${parsed.offsetY / sy}px ${parsed.blur / avgScale}px ${parsed.spread / avgScale}px ${parsed.color}`)
      }
    }
  }

  // --- Opacity interpolation ---
  // Linearly interpolate opacity when source and target differ.
  // Applied to the visual child (not wrapper) to avoid multiplying
  // with the child's own opacity.
  const toOpacity = parseFloat(toStyles.opacity) || 1
  const fromOpacity = parseFloat(fromStyles.opacity) || 1
  if (fromOpacity !== toOpacity) {
    patchStyle(el, targetVisual, 'opacity', String(mixNumber(fromOpacity, toOpacity, progress)))
  }
}

/** Tracks imperative style overrides applied by applyFlip. Keyed by the
 *  patched element (the visual child). Each entry maps CSS property →
 *  { applied, previous }. On reset, restores the previous value (what the
 *  DOM had before we overwrote it, typically a React inline style) instead
 *  of clearing to empty. Only restores if the DOM still has our applied
 *  value; if React changed it between frames, we leave it alone.
 *
 *  Limitation: if a user component animates the SAME CSS property that
 *  applyFlip patches (e.g. backgroundColor via interpolate()) and React's
 *  new value happens to serialize identically to our last applied value,
 *  reset will incorrectly restore the stale previous. This only matters
 *  on the transition end frame (|progress - 1| < 0.001) when applyFlip is
 *  skipped. Avoid animating borderRadius, backgroundColor, boxShadow,
 *  overflow, or opacity on elements inside LayoutTransition during the
 *  transition window. */
const appliedPatches = new WeakMap<HTMLElement, Map<string, { applied: string; previous: string }>>()

/** Maps each LayoutTransition wrapper → set of child elements we patched.
 *  This ensures resetFlipStyles restores ALL patched children even if
 *  the child order changes between frames (e.g. React inserts a new
 *  element before the patched child, making it no longer firstElementChild). */
const patchedChildrenByWrapper = new WeakMap<HTMLElement, Set<HTMLElement>>()

/** Record an imperative style write so resetFlipStyles can undo it safely.
 *  @param wrapper — the LayoutTransition wrapper div (for tracking)
 *  @param el — the actual visual child element being patched
 *  Saves the current DOM value before overwriting, so it can be restored. */
function patchStyle(wrapper: HTMLElement, el: HTMLElement, prop: string, value: string) {
  let patches = appliedPatches.get(el)
  if (!patches) { patches = new Map(); appliedPatches.set(el, patches) }
  // Only capture previous on first patch per reset cycle; subsequent
  // patches within the same frame update `applied` but keep the original
  // previous so we restore to what React had, not our last intermediate.
  const existing = patches.get(prop)
  const previous = existing ? existing.previous : el.style.getPropertyValue(prop)
  patches.set(prop, { applied: value, previous })
  el.style.setProperty(prop, value)

  // Track this child under its wrapper so resetFlipStyles can find it
  // even if it's no longer firstElementChild.
  let children = patchedChildrenByWrapper.get(wrapper)
  if (!children) { children = new Set(); patchedChildrenByWrapper.set(wrapper, children) }
  children.add(el)
}

/** Reset all styles applied by applyFlip.
 *  Clears transform on the wrapper. For child visual styles, restores
 *  each property to its previous value (the React inline style that was
 *  there before we overwrote it). Only restores if the DOM still has our
 *  applied value; if React changed it between frames, that value is kept.
 *  Iterates all tracked patched children, not just firstElementChild,
 *  so children that moved position in the DOM are still restored. */
function resetFlipStyles(el: HTMLElement) {
  el.style.transform = ''
  const children = patchedChildrenByWrapper.get(el)
  if (!children) return
  for (const child of children) {
    const patches = appliedPatches.get(child)
    if (!patches) continue
    for (const [prop, { applied, previous }] of patches) {
      if (child.style.getPropertyValue(prop) === applied) {
        child.style.setProperty(prop, previous)
      }
    }
    appliedPatches.delete(child)
  }
  patchedChildrenByWrapper.delete(el)
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

/**
 * Provides the registry that connects LayoutTransition elements (in both
 * the ghost and visible containers) with the LayoutAnimationLayer.
 * One provider per section — wraps ghost + visible + animation layer.
 */
export function LayoutTransitionProvider({ children }: { children: ReactNode }) {
  const [registry] = useState<LayoutRegistry>(() => {
    const entries = new Set<LayoutEntry>()
    return {
      entries,
      register(entry: LayoutEntry) {
        entries.add(entry)
        return () => {
          entries.delete(entry)
        }
      },
    }
  })

  return (
    <LayoutRegistryContext.Provider value={registry}>
      {children}
    </LayoutRegistryContext.Provider>
  )
}

/**
 * Marks its subtree as the hidden ghost copy of the previous section.
 * LayoutTransition elements inside register as 'ghost' and are only
 * used as measurement sources, never animated.
 */
export function LayoutGhost({ children }: { children: ReactNode }) {
  return (
    <LayoutContainerContext.Provider value="ghost">
      {children}
    </LayoutContainerContext.Provider>
  )
}

/**
 * Wraps an element that should keep visual continuity across section
 * boundaries. Matching is by `id`: if the previous section also rendered
 * <LayoutTransition id="x">, the element springs from its old position
 * to its new one at the start of the section.
 *
 * Usage in MDX:
 * ```mdx
 * # Scene 1 duration=5s
 *
 * <LayoutTransition id="title">
 *   <BlurReveal text="Hello" />
 * </LayoutTransition>
 *
 * # Scene 2 duration=5s
 *
 * <LayoutTransition id="title" duration={25} bounce={0.2}>
 *   <BlurReveal text="Hello" />
 * </LayoutTransition>
 * ```
 *
 * If no matching id exists in the previous section, children render
 * normally with no animation.
 */
export function LayoutTransition({
  id,
  duration = 20,
  bounce = 0.15,
  easing,
  mode = 'both',
  showFrom,
  showUpTo,
  children,
}: {
  id: string
  /** Transition duration in frames. Default 20. */
  duration?: number
  /** Spring bounce, 0 = no overshoot, 1 = max. Default 0.15.
   *  Ignored when `easing` is set (easing replaces the spring entirely). */
  bounce?: number
  /** Custom easing function. When set, uses interpolate() over `duration`
   *  frames instead of the spring. Overrides `bounce`. */
  easing?: (t: number) => number
  /** Which axes to animate. 'position' snaps size instantly; 'size' snaps
   *  position instantly; 'both' (default) animates both. */
  mode?: LayoutTransitionMode
  /** Intra-scene: frame at which this instance becomes visible (inclusive).
   *  When set (along with showUpTo), enables intra-scene FLIP transitions
   *  between multiple instances of the same id within the same section.
   *  Ranges must not overlap. */
  showFrom?: number
  /** Intra-scene: frame at which this instance stops being visible (exclusive).
   *  Defaults to Infinity (visible until end of section). */
  showUpTo?: number
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const registry = useContext(LayoutRegistryContext)
  const container = useContext(LayoutContainerContext)
  // useCurrentFrame() throws outside Remotion context (SSR tests). The
  // try-catch is safe: the hook is always called unconditionally so hook
  // order is stable; we just handle the missing context gracefully.
  let frame = 0
  try { frame = useCurrentFrame() } catch {}

  const hasTimeRange = showFrom !== undefined || showUpTo !== undefined
  const rangeFrom = showFrom ?? 0
  const rangeUpTo = showUpTo ?? Infinity
  const isActive = !hasTimeRange || (frame >= rangeFrom && frame < rangeUpTo)

  // One stable entry object per component instance. Fields are refreshed
  // on every render (cheap own-ref mutation) so the animation layer always
  // reads current props without re-registration.
  const entryRef = useRef<LayoutEntry | null>(null)
  if (entryRef.current === null) {
    entryRef.current = {
      id, container, ref, durationInFrames: duration, bounce, easing: easing ?? null,
      mode,
      showFrom: hasTimeRange ? rangeFrom : undefined,
      showUpTo: hasTimeRange ? rangeUpTo : undefined,
    }
  }
  entryRef.current.id = id
  entryRef.current.container = container
  entryRef.current.durationInFrames = duration
  entryRef.current.bounce = bounce
  entryRef.current.easing = easing ?? null
  entryRef.current.mode = mode
  entryRef.current.showFrom = hasTimeRange ? rangeFrom : undefined
  entryRef.current.showUpTo = hasTimeRange ? rangeUpTo : undefined

  useLayoutEffect(() => {
    if (!registry) return
    return registry.register(entryRef.current!)
  }, [registry])

  // transformOrigin '0 0': FLIP deltas are computed from top-left corners,
  // so the scale component must also originate from the top-left.
  //
  // width: fit-content: prevents the wrapper from stretching to 100% width
  // in block-layout parents. Without this, a LayoutTransition in a block
  // parent (e.g. display:block div) measures as full-width even though the
  // content is small. When the matching element in the next section is in a
  // flex parent (content-sized), the FLIP scale ratio becomes enormous
  // (e.g. 1920px / 364px ≈ 5.3x), grossly distorting text. fit-content
  // ensures the wrapper always matches its content dimensions regardless
  // of parent layout, so FLIP scale ratios reflect actual content size
  // differences, not layout context differences.
  //
  // When using time ranges, inactive instances are visibility:hidden (keeps
  // layout footprint for FLIP measurement) instead of display:none.
  return (
    <div
      ref={ref}
      data-layout-id={id}
      style={{
        transformOrigin: '0 0',
        width: 'fit-content',
        ...(hasTimeRange && !isActive
          ? { visibility: 'hidden' as const, pointerEvents: 'none' as const }
          : {}),
      }}
    >
      {children}
    </div>
  )
}

/**
 * Measures ghost vs visible LayoutTransition elements after every render
 * and writes FLIP transforms to the visible wrappers. Must be rendered
 * AFTER both containers (sibling order matters: its layout effect has to
 * run after all LayoutTransition registrations).
 *
 * Renders an empty composition-sized AbsoluteFill used only to measure
 * the Player's scale factor (composition px vs client px).
 */
export function LayoutAnimationLayer() {
  const registry = useContext(LayoutRegistryContext)
  const frame = useCurrentFrame()
  const { fps, width } = useVideoConfig()
  const rootRef = useRef<HTMLDivElement>(null)

  // No dependency array: must re-run on every frame (the Player re-renders
  // each frame, and rect positions can change with frame-driven layout).
  useLayoutEffect(() => {
    if (!registry) return
    const entries = [...registry.entries]

    // Categorize entries by container and timing mode.
    const allGhosts = entries.filter((e) => e.container === 'ghost')
    const allVisible = entries.filter((e) => e.container === 'visible')
    // Timed visible entries for intra-scene FLIP (ghost entries excluded
    // to prevent cross-section pollution).
    const timedVisible = allVisible.filter((e) => e.showFrom !== undefined)

    // Reset ALL styles BEFORE measuring: getBoundingClientRect() includes
    // transforms, so measuring a transformed element would compound the
    // previous frame's FLIP offset. Also clear interpolated visual styles
    // (borderRadius, backgroundColor, etc.) so getComputedStyle reads the
    // element's natural values, not our previous frame's overrides.
    for (const e of entries) {
      if (e.ref.current) resetFlipStyles(e.ref.current)
    }

    const rootRect = rootRef.current?.getBoundingClientRect()
    if (!rootRect || rootRect.width === 0) return
    // Player scale: composition is 1920 wide but rendered smaller/larger
    // in the viewport. Translate deltas are measured in client px and
    // applied in composition px, so divide by this scale. Scale ratios
    // (sx, sy) are dimensionless and unaffected.
    const playerScale = rootRect.width / width

    // --- Cross-section FLIP (ghost → visible) ---
    // Build one "representative" per id from each side so cross-section
    // FLIP works even when the previous section used untimed entries and
    // the current section uses timed entries (or vice versa).
    if (allGhosts.length > 0) {
      // Ghost representatives: for untimed ghosts, use directly. For timed
      // ghosts, find the one that was active at the frozen frame. The ghost
      // container freezes at prevDurationInFrames-1, so the active timed
      // ghost has NO inline visibility:hidden (set by LayoutTransition).
      const ghostReps = new Map<string, LayoutEntry>()
      for (const e of allGhosts) {
        if (ghostReps.has(e.id)) continue
        if (e.showFrom === undefined) {
          ghostReps.set(e.id, e)
        } else if (e.ref.current?.style.visibility !== 'hidden') {
          ghostReps.set(e.id, e)
        }
      }

      // Visible representatives: untimed visible first, then active timed.
      const visibleReps = new Map<string, LayoutEntry>()
      for (const e of allVisible) {
        if (visibleReps.has(e.id)) continue
        if (e.showFrom === undefined) {
          visibleReps.set(e.id, e)
        } else if (frame >= (e.showFrom ?? 0) && frame < (e.showUpTo ?? Infinity)) {
          visibleReps.set(e.id, e)
        }
      }

      for (const [id, e] of visibleReps) {
        const el = e.ref.current
        if (!el) continue
        const ghost = ghostReps.get(id)
        const ghostEl = ghost?.ref.current
        if (!ghostEl) continue

        const progress = e.easing
          ? interpolate(frame, [0, e.durationInFrames], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
              easing: e.easing,
            })
          : dspring(frame, fps, e.durationInFrames / fps, e.bounce)
        // Must check |progress - 1| not just progress > threshold, otherwise
        // bouncy springs that overshoot past 1.0 get their overshoot frames
        // skipped and the bounce is invisible.
        if (Math.abs(progress - 1) < 0.001) continue

        const fromRect = ghostEl.getBoundingClientRect()
        const toRect = el.getBoundingClientRect()
        if (toRect.width === 0 || toRect.height === 0 || fromRect.width === 0) continue

        applyFlip({ el, sourceEl: ghostEl, fromRect, toRect, progress, playerScale, entry: e })
      }
    }

    // --- Intra-scene FLIP (timed entries within same section) ---
    if (timedVisible.length > 0) {
      // Group timed entries by id, sort each group by showFrom.
      const timedById = new Map<string, LayoutEntry[]>()
      for (const e of timedVisible) {
        const list = timedById.get(e.id)
        if (list) list.push(e)
        else timedById.set(e.id, [e])
      }

      for (const [, group] of timedById) {
        if (group.length < 2) continue
        group.sort((a, b) => (a.showFrom ?? 0) - (b.showFrom ?? 0))

        // Find the currently active entry.
        const active = group.find(
          (e) => frame >= (e.showFrom ?? 0) && frame < (e.showUpTo ?? Infinity),
        )
        if (!active?.ref.current) continue

        // Find previous: the entry whose range ended most recently before
        // the active entry's range starts. Since ranges don't overlap and
        // are sorted, it's the last entry with showUpTo <= active.showFrom.
        const activeFrom = active.showFrom ?? 0
        let prev: LayoutEntry | undefined
        for (let i = group.length - 1; i >= 0; i--) {
          const e = group[i]!
          if (e !== active && (e.showUpTo ?? Infinity) <= activeFrom) {
            prev = e
            break
          }
        }
        if (!prev?.ref.current) continue

        // Transition starts when the active entry's range begins.
        const localFrame = frame - activeFrom
        const progress = active.easing
          ? interpolate(localFrame, [0, active.durationInFrames], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
              easing: active.easing,
            })
          : dspring(localFrame, fps, active.durationInFrames / fps, active.bounce)
        // Must check |progress - 1| not just progress > threshold, otherwise
        // bouncy springs that overshoot past 1.0 get their overshoot frames
        // skipped and the bounce is invisible.
        if (Math.abs(progress - 1) < 0.001) continue

        // FLIP: measure previous (visibility:hidden, keeps layout) → active.
        const fromRect = prev.ref.current.getBoundingClientRect()
        const toRect = active.ref.current.getBoundingClientRect()
        if (toRect.width === 0 || toRect.height === 0 || fromRect.width === 0) continue

        applyFlip({ el: active.ref.current, sourceEl: prev.ref.current, fromRect, toRect, progress, playerScale, entry: active })
      }
    }
  })

  return <AbsoluteFill ref={rootRef} style={{ pointerEvents: 'none' }} />
}
