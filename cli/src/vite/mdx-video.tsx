'use client'

/**
 * Client-side video components for MDX rendering.
 *
 * Contains animation wrappers (enter/exit), element overrides for safe-mdx,
 * and the components map builder. All marked 'use client' because animation
 * components use Remotion hooks (useCurrentFrame, useVideoConfig).
 *
 * The server imports this file and gets client references for the components
 * map. safe-mdx creates React elements with these references on the server;
 * hooks execute on the client inside Remotion's Player render loop.
 */

import { createContext, useContext, useId, useInsertionEffect, useLayoutEffect, type ReactNode } from 'react'
import type { SafeMdxError } from 'safe-mdx'
import type { EagerModules } from 'safe-mdx/parse'
import {
  splitIntoSections,
  calculateTotalDuration,
  resolveAutoDurations,
  type MdxSection,
  type SplitResult,
  type VideoFrontmatter,
} from './mdx-parse.ts'
import {
  MeshGradientBg,
  BlurReveal,
  MaskedSlideReveal,
  StaggeredFadeUp,
  TerminalSimulator,
  GlassCodeBlock,
  ShimmerSweep,
  SpringPopIn,
  AnimatedChart,
  FeaturePill,
  SlotText,
} from './components.tsx'
import { AngledScreen } from './angled-screen.tsx'
import { CodeBlock, CODE_THEMES } from './code-block.tsx'
import { BandsShader } from './bands-shader.tsx'


export { splitIntoSections, calculateTotalDuration, resolveAutoDurations }
import { useTweakpane, TWEAKPANE_DISABLED } from './tweakpane-hook.tsx'
export { useTweakpane, TWEAKPANE_DISABLED }
export type { MdxSection, SplitResult, VideoFrontmatter, EagerModules, SafeMdxError }

// ExportContext and useIsExporting are defined in media-components.tsx and
// re-exported from this file (see the media components re-export section below).

declare global {
  var __egakiMotionSeekTo: ((ms: number, scopeId?: string) => void) | undefined
  var __egakiMotionPrepareTime: ((ms: number) => void) | undefined
  var __egakiMotionRegistry:
    | {
        allAnimations: Set<any>
        scopeIdMap: WeakMap<any, string>
        wrappedStops: WeakSet<any>
        patched: boolean
        currentTimeMs: number | undefined
      }
    | undefined
}

// ---------------------------------------------------------------------------
// MotionTimingSync — bridges Framer Motion (motion/react) with Remotion.
//
// Reads the global seekTo function set by the virtual:egaki-motion-timing
// module (emitted by the Vite plugin when the user has `motion` installed).
// Calls seekTo with the current frame time from useLayoutEffect so motion.div
// animations stay in sync with Remotion's frame-based rendering. No-op when
// motion isn't installed.
// ---------------------------------------------------------------------------

export function MotionTimingSync({ children }: { children: ReactNode }) {
  const scopeId = useId()
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const timeMs = (frame / fps) * 1000

  // Runs before any child layout effects create JSAnimation instances, so
  // the play() patch can immediately sample new animations at this frame.
  useInsertionEffect(() => {
    globalThis.__egakiMotionPrepareTime?.(timeMs)
  }, [timeMs])

  // useLayoutEffect, not useEffect: motion/react creates JSAnimation
  // instances during layout/effect lifecycle, not during render. Using
  // useLayoutEffect ensures seekTo runs AFTER motion has mounted its
  // animations but BEFORE the browser paints, so Remotion's frame
  // capture sees the correct animation state.
  useLayoutEffect(() => {
    globalThis.__egakiMotionSeekTo?.(timeMs, scopeId)
  }, [timeMs, scopeId])

  return (
    <div
      data-egaki-motion-scope-id={scopeId}
      style={{ display: 'contents' }}
    >
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Server slots context — carries RSC-rendered <Server> slot content so that
// the SDK's renderStillOnWeb / renderMediaOnWeb can access them in the fresh
// React tree. Defined here (not in mdx-client.tsx) to avoid a circular import
// between mdx-client.tsx and player-page.tsx.
// ---------------------------------------------------------------------------

export type ServerSlots = Record<string, ReactNode>
export const ServerSlotsContext = createContext<ServerSlots>({})

import {
  AbsoluteFill,
  Easing,
  Internals,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'
import {
  naturalThrowSamples,
  decelerateOvershootSamples,
  decelerateElasticSamples,
  accelerateImpulseSamples,
  accelerateElasticSamples,
  elasticSnapSamples,
  bounceSamples,
  bounceAnticipateSamples,
  bounceThrowSamples,
  impulseSlowSamples,
  impulseOvershootSamples,
  overshootSamples,
  overshootElasticSamples,
  overshootBouncySamples,
  lerpSamples,
} from './easing-curves.ts'

// Re-export the continuous preset functions (Jitter easings at ANY intensity,
// e.g. impulseOvershoot(96), interpolated in config space) and the engine
// primitives for building custom curves.
export {
  type ControlPoint,
  type EasingPreset,
  type Intensity,
  cubicBezier,
  polybezier,
  pathPreset,
  springPreset,
  bouncePreset,
  samplePreset,
  naturalThrow,
  decelerateOvershoot,
  decelerateElastic,
  accelerateImpulse,
  accelerateElastic,
  elasticSnap,
  bounce,
  bounceAnticipate,
  bounceThrow,
  impulseSlow,
  impulseOvershoot,
  overshoot,
  overshootElastic,
  overshootBouncy,
} from './easing-curves.ts'

// Raw sampled curves (51 points per intensity level 0/25/50/75/100).
export {
  naturalThrowSamples,
  decelerateOvershootSamples,
  decelerateElasticSamples,
  accelerateImpulseSamples,
  accelerateElasticSamples,
  elasticSnapSamples,
  bounceSamples,
  bounceAnticipateSamples,
  bounceThrowSamples,
  impulseSlowSamples,
  impulseOvershootSamples,
  overshootSamples,
  overshootElasticSamples,
  overshootBouncySamples,
  lerpSamples,
}

// ---------------------------------------------------------------------------
// useAbsoluteCurrentFrame() — absolute composition frame hook
//
// Remotion's useCurrentFrame() returns the frame relative to the current
// Series.Sequence (resets to 0 at each section). This hook returns the
// absolute frame across the entire composition, useful for global timing,
// syncing elements across sections, or computing total elapsed time.
// Uses Remotion's internal useTimelinePosition which is what useCurrentFrame
// reads before subtracting the sequence offset.
// ---------------------------------------------------------------------------

/**
 * Returns the absolute frame number across the entire composition.
 *
 * Unlike `useCurrentFrame()` which resets to 0 at each section boundary
 * (Series.Sequence), this returns the global frame from 0 to totalDuration.
 *
 * ```tsx
 * const absoluteFrame = useAbsoluteCurrentFrame()
 * const elapsedSeconds = absoluteFrame / fps
 * ```
 */
export function useAbsoluteCurrentFrame(): number {
  return Internals.Timeline.useTimelinePosition()
}

/**
 * Returns `true` when the component is being rendered inside a premounted
 * `<Series.Sequence premountFor={…}>` — i.e. the sequence is mounted early
 * for preloading but invisible (opacity 0, pointer-events none, frozen at
 * its start frame).
 *
 * Use this to skip expensive side effects (tweakpane registration, heavy
 * canvas work, etc.) that shouldn't run during premount.
 *
 * Uses Remotion's internal `SequenceContext.premounting` flag — the same
 * mechanism Remotion's own `<Video>`, `<Audio>`, and `<Img>` use to skip
 * buffering during premount.
 */
export function useIsPremounting(): boolean {
  const ctx = useContext(Internals.SequenceContext)
  return ctx?.premounting ?? false
}

// ---------------------------------------------------------------------------
// springFromDuration() — Framer Motion-style spring API for Remotion
//
// Remotion's spring() uses physics parameters (damping, stiffness, mass)
// which are hard to reason about. This converts the intuitive
// (duration, bounce) pair into those physics params, matching how
// Framer Motion's simplified spring API works internally.
//
// - duration: seconds (how long the animation takes)
// - bounce: 0 = critically damped (no overshoot), 1 = maximum bounce
//
// Always use this over raw spring() config for readability.
// ---------------------------------------------------------------------------

export interface SpringConfig {
  stiffness: number
  damping: number
  mass: number
}

/**
 * Convert a human-readable (duration, bounce) pair into Remotion spring
 * physics config. Matches Motion's `visualDuration` spring formula exactly.
 *
 * The `duration` param is a *perceptual* duration (how long the animation
 * *feels*), not the exact settling time. Motion multiplies it by 1.2
 * internally to derive the natural frequency, so the spring actually
 * oscillates slightly longer than `duration` but *appears* to complete
 * within it. We use the same 1.2 factor for identical behavior.
 *
 * @param duration - Perceptual animation duration in seconds (e.g. 0.5).
 *   Internally multiplied by 1.2 to match Motion's visualDuration formula.
 * @param bounce - Bounciness from 0 (no overshoot) to 1 (max bounce). Default 0.
 *
 * ```ts
 * // No bounce, 400ms
 * spring({ frame, fps, config: springFromDuration(0.4) })
 *
 * // Subtle Apple-like overshoot, 600ms
 * spring({ frame, fps, config: springFromDuration(0.6, 0.25) })
 *
 * // Playful bounce, 500ms
 * spring({ frame, fps, config: springFromDuration(0.5, 0.5) })
 * ```
 */
export function springFromDuration(
  duration: number,
  bounce: number = 0,
): SpringConfig {
  // Matches Motion's visualDuration path (motion-dom spring.ts lines 191-205).
  // The 1.2 factor converts perceptual duration to the spring's natural period.
  const omega = (2 * Math.PI) / (duration * 1.2)
  const stiffness = omega * omega
  // Motion clamps dampingRatio (not bounce) to [0.05, 1]
  const dampingRatio = Math.max(0.05, Math.min(1, 1 - bounce))
  return {
    stiffness,
    damping: 2 * dampingRatio * Math.sqrt(stiffness),
    mass: 1,
  }
}

// ---------------------------------------------------------------------------
// findSpringConfig — Motion's duration-based spring solver (Newton-Raphson).
//
// Unlike springFromDuration (which uses a perceptual visual-duration), this
// finds spring params where the envelope decays to near-zero at exactly the
// given duration. Ported from Motion's findSpring() (motion-dom spring.ts).
// ---------------------------------------------------------------------------

function calcAngularFreq(undampedFreq: number, dampingRatio: number) {
  return undampedFreq * Math.sqrt(1 - dampingRatio * dampingRatio)
}

function approximateRoot(
  envelope: (n: number) => number,
  derivative: (n: number) => number,
  initialGuess: number,
): number {
  let result = initialGuess
  for (let i = 1; i < 12; i++) {
    result = result - envelope(result) / derivative(result)
  }
  return result
}

/**
 * Find spring physics config where the spring settles at exactly `duration`.
 * Ported from Motion's `findSpring()` — uses Newton-Raphson root-finding to
 * solve for the undamped natural frequency that makes the spring envelope
 * reach near-zero at the given duration.
 *
 * Use this when you need the spring to settle at a precise time (e.g. syncing
 * to a beat or section boundary). For general-purpose springs where the feel
 * matters more than exact timing, prefer `springFromDuration()`.
 *
 * Note: Motion's generator also forcibly snaps `value = target` when
 * `t >= duration`. Remotion's spring() does not; it naturally settles.
 * The envelope will be near-zero at `duration` but not forcibly clamped.
 *
 * @param duration - Exact settling time in seconds.
 * @param bounce - Bounciness from 0 (no overshoot) to 1 (max bounce). Default 0.
 *
 * ```ts
 * // Spring that settles in exactly 800ms with moderate bounce
 * spring({ frame, fps, config: findSpringConfig(0.8, 0.3) })
 * ```
 */
export function findSpringConfig(
  duration: number,
  bounce: number = 0,
): SpringConfig {
  const mass = 1
  const velocity = 0
  const safeMin = 0.001

  let dampingRatio = 1 - bounce
  dampingRatio = Math.max(0.05, Math.min(1, dampingRatio))
  duration = Math.max(0.01, Math.min(10, duration))

  let envelope: (n: number) => number
  let derivative: (n: number) => number

  if (dampingRatio < 1) {
    // Underdamped
    envelope = (undampedFreq) => {
      const exponentialDecay = undampedFreq * dampingRatio
      const delta = exponentialDecay * duration
      const a = exponentialDecay - velocity
      const b = calcAngularFreq(undampedFreq, dampingRatio)
      const c = Math.exp(-delta)
      return safeMin - (a / b) * c
    }
    derivative = (undampedFreq) => {
      const exponentialDecay = undampedFreq * dampingRatio
      const delta = exponentialDecay * duration
      const d = delta * velocity + velocity
      const e = Math.pow(dampingRatio, 2) * Math.pow(undampedFreq, 2) * duration
      const f = Math.exp(-delta)
      const g = calcAngularFreq(Math.pow(undampedFreq, 2), dampingRatio)
      const factor = -envelope(undampedFreq) + safeMin > 0 ? -1 : 1
      return (factor * ((d - e) * f)) / g
    }
  } else {
    // Critically damped
    envelope = (undampedFreq) => {
      const a = Math.exp(-undampedFreq * duration)
      const b = (undampedFreq - velocity) * duration + 1
      return -safeMin + a * b
    }
    derivative = (undampedFreq) => {
      const a = Math.exp(-undampedFreq * duration)
      const b = (velocity - undampedFreq) * (duration * duration)
      return a * b
    }
  }

  const undampedFreq = approximateRoot(envelope, derivative, 5 / duration)

  if (isNaN(undampedFreq)) {
    return { stiffness: 100, damping: 10, mass: 1 }
  }

  const stiffness = Math.pow(undampedFreq, 2) * mass
  return {
    stiffness,
    damping: dampingRatio * 2 * Math.sqrt(mass * stiffness),
    mass,
  }
}

/**
 * Shorthand: run a spring animation driven by springFromDuration().
 * Returns 0-to-1 progress (or 0-to-`to` if specified).
 *
 * ```tsx
 * const scale = dspring(frame, fps, 0.5, 0.3) // 500ms, slight bounce
 * ```
 */
export function dspring(
  frame: number,
  fps: number,
  duration: number,
  bounce: number = 0,
  options?: { delay?: number; to?: number; from?: number },
): number {
  return spring({
    frame,
    fps,
    config: springFromDuration(duration, bounce),
    delay: options?.delay,
    to: options?.to,
    from: options?.from,
  })
}

// ---------------------------------------------------------------------------
// Easing presets — named bezier curves for common motion styles.
// Use with interpolate(frame, range, range, { easing: EASE.apple }).
//
// These are the After Effects / Apple motion graphics "cheat codes":
// curves that motion designers converge on for premium-feeling animation.
// ---------------------------------------------------------------------------

export const EASE = {
  /** AE 75% influence — tight S-curve, the "Apple ease" */
  apple: Easing.bezier(0.76, 0, 0.24, 1),
  /** Fast enter, gentle settle — elements arriving with momentum */
  enterFast: Easing.bezier(0.22, 1, 0.36, 1),
  /** Slow start, fast exit — elements leaving the frame */
  exitSlow: Easing.bezier(0.55, 0, 1, 0.45),
  /** Social media punch — very sharp burst */
  snappy: Easing.bezier(0.87, 0, 0.13, 1),
  /** Luxurious, slow cinematic feel */
  cinematic: Easing.bezier(0.83, 0, 0.17, 1),

  // --- Bezier presets (intensity 50 defaults) ---

  /** Strong ease-out, snaps into place. The workhorse motion curve. */
  smooth: Easing.bezier(0.5, 0, 0, 1),
  /** Symmetric S-curve, natural feeling in-out */
  natural: Easing.bezier(0.8, 0, 0.2, 1),
  /** Pure deceleration, no ease-in. Objects arriving at full speed. */
  decelerate: Easing.bezier(0, 0, 0, 1),
  /** Pure acceleration, no ease-out. Objects leaving from rest. */
  accelerate: Easing.bezier(1, 0, 1, 1),

  // --- Sampled presets (intensity 50, spring/bounce/overshoot) ---
  // Values can exceed 0-1 range. Use with interpolate().

  /** Elastic snap into place with ringing oscillation */
  elasticSnap: sampledEasing(elasticSnapSamples[50]),
  /** Standard bounce, like a ball dropping */
  bounce: sampledEasing(bounceSamples[50]),
  /** Bounce with anticipation (pulls back first) */
  bounceAnticipate: sampledEasing(bounceAnticipateSamples[50]),
  /** Throw with bounce on landing */
  bounceThrow: sampledEasing(bounceThrowSamples[50]),
  /** Overshoot then settle back */
  overshoot: sampledEasing(overshootSamples[50]),
  /** Overshoot with elastic ringing */
  overshootElastic: sampledEasing(overshootElasticSamples[50]),
  /** Overshoot with bouncy settle */
  overshootBouncy: sampledEasing(overshootBouncySamples[50]),
  /** Deceleration with overshoot */
  decelerateOvershoot: sampledEasing(decelerateOvershootSamples[50]),
  /** Deceleration with elastic overshoot */
  decelerateElastic: sampledEasing(decelerateElasticSamples[50]),
  /** Natural throw with momentum */
  naturalThrow: sampledEasing(naturalThrowSamples[50]),
  /** Accelerating impulse burst */
  accelerateImpulse: sampledEasing(accelerateImpulseSamples[50]),
  /** Acceleration with elastic windup */
  accelerateElastic: sampledEasing(accelerateElasticSamples[50]),
  /** Slow impulse, gradual build then release */
  impulseSlow: sampledEasing(impulseSlowSamples[50]),
  /** Impulse with overshoot settle */
  impulseOvershoot: sampledEasing(impulseOvershootSamples[50]),
} as const

// ---------------------------------------------------------------------------
// Sampled easing helper — wraps a sample array into an EasingFunction
// ---------------------------------------------------------------------------

type EasingFunction = (t: number) => number

/** Wrap a sampled curve into a Remotion-compatible easing function. */
function sampledEasing(samples: readonly number[]): EasingFunction {
  return (t: number) => lerpSamples(samples, t)
}

// ---------------------------------------------------------------------------
// Intensity-parameterized easing constructors
//
// The default presets in EASE use intensity 50. These functions let you
// pick any intensity from 0-100 (snapped to nearest 25).
// Bezier types compute exact curves; sampled types look up the table.
// ---------------------------------------------------------------------------

type Intensity = 0 | 25 | 50 | 75 | 100
function snapIntensity(i: number): Intensity {
  return (Math.round(i / 25) * 25) as Intensity
}

/** smooth at custom intensity. Pattern: cubic-bezier(lerp(0.3, 0.9, i/100), 0, 0, 1) */
export function smoothEasing(intensity: number): EasingFunction {
  const x1 = 0.3 + 0.6 * (intensity / 100)
  return Easing.bezier(x1, 0, 0, 1)
}

/** natural at custom intensity. Pattern: cubic-bezier(lerp(0.5, 1, i/100), 0, lerp(0.5, 0, i/100), 1) */
export function naturalEasing(intensity: number): EasingFunction {
  const x1 = 0.5 + 0.5 * (intensity / 100)
  const x2 = 0.5 - 0.5 * (intensity / 100)
  return Easing.bezier(x1, 0, x2, 1)
}

/** decelerate at custom intensity */
export function decelerateEasing(intensity: number): EasingFunction {
  // 0→(0, 0, 0.3, 1), 50→(0, 0, 0, 1), 75→(0, 0.45, 0, 1), 100→(0, 0.9, 0, 1)
  if (intensity <= 50) {
    const x2 = 0.3 * (1 - intensity / 50)
    return Easing.bezier(0, 0, x2, 1)
  }
  const y1 = 0.9 * ((intensity - 50) / 50)
  return Easing.bezier(0, y1, 0, 1)
}

/** accelerate at custom intensity */
export function accelerateEasing(intensity: number): EasingFunction {
  // 0→(0.7, 0, 1, 1), 50→(1, 0, 1, 1), 75→(1, 0, 1, 0.55), 100→(1, 0, 1, 0.1)
  if (intensity <= 50) {
    const x1 = 0.7 + 0.3 * (intensity / 50)
    return Easing.bezier(x1, 0, 1, 1)
  }
  const y2 = 1 - 0.9 * ((intensity - 50) / 50)
  return Easing.bezier(1, 0, 1, y2)
}

/** elasticSnap at custom intensity (sampled) */
export function elasticSnapEasing(intensity: number): EasingFunction {
  return sampledEasing(elasticSnapSamples[snapIntensity(intensity)])
}

/** bounce at custom intensity (sampled) */
export function bounceEasing(intensity: number): EasingFunction {
  return sampledEasing(bounceSamples[snapIntensity(intensity)])
}

/** bounceAnticipate at custom intensity (sampled) */
export function bounceAnticipateEasing(intensity: number): EasingFunction {
  return sampledEasing(bounceAnticipateSamples[snapIntensity(intensity)])
}

/** bounceThrow at custom intensity (sampled) */
export function bounceThrowEasing(intensity: number): EasingFunction {
  return sampledEasing(bounceThrowSamples[snapIntensity(intensity)])
}

/** overshoot at custom intensity (sampled) */
export function overshootEasing(intensity: number): EasingFunction {
  return sampledEasing(overshootSamples[snapIntensity(intensity)])
}

/** overshootElastic at custom intensity (sampled) */
export function overshootElasticEasing(intensity: number): EasingFunction {
  return sampledEasing(overshootElasticSamples[snapIntensity(intensity)])
}

/** overshootBouncy at custom intensity (sampled) */
export function overshootBouncyEasing(intensity: number): EasingFunction {
  return sampledEasing(overshootBouncySamples[snapIntensity(intensity)])
}

/** decelerateOvershoot at custom intensity (sampled) */
export function decelerateOvershootEasing(intensity: number): EasingFunction {
  return sampledEasing(decelerateOvershootSamples[snapIntensity(intensity)])
}

/** decelerateElastic at custom intensity (sampled) */
export function decelerateElasticEasing(intensity: number): EasingFunction {
  return sampledEasing(decelerateElasticSamples[snapIntensity(intensity)])
}

/** naturalThrow at custom intensity (sampled) */
export function naturalThrowEasing(intensity: number): EasingFunction {
  return sampledEasing(naturalThrowSamples[snapIntensity(intensity)])
}

/** accelerateImpulse at custom intensity (sampled) */
export function accelerateImpulseEasing(intensity: number): EasingFunction {
  return sampledEasing(accelerateImpulseSamples[snapIntensity(intensity)])
}

/** accelerateElastic at custom intensity (sampled) */
export function accelerateElasticEasing(intensity: number): EasingFunction {
  return sampledEasing(accelerateElasticSamples[snapIntensity(intensity)])
}

/** impulseSlow at custom intensity (sampled) */
export function impulseSlowEasing(intensity: number): EasingFunction {
  return sampledEasing(impulseSlowSamples[snapIntensity(intensity)])
}

/** impulseOvershoot at custom intensity (sampled) */
export function impulseOvershootEasing(intensity: number): EasingFunction {
  return sampledEasing(impulseOvershootSamples[snapIntensity(intensity)])
}

// ---------------------------------------------------------------------------
// Fill — full-frame layer with stretch + vertical center
//
// Like Remotion's AbsoluteFill but with better defaults for video content:
// children stretch horizontally to fill the frame, center vertically.
// ---------------------------------------------------------------------------

export function Fill({
  children,
  style,
  ...rest
}: { children?: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <AbsoluteFill
      style={{
        alignItems: 'stretch',
        justifyContent: 'center',
        ...style,
      }}
      {...rest}
    >
      {children}
    </AbsoluteFill>
  )
}

// ---------------------------------------------------------------------------
// Background — real component that self-positions as an absolute layer
//
// Works both in MDX and when imported from TSX components. Renders its
// children in a full-frame AbsoluteFill behind sibling content. In Remotion
// all layout is absolute, so this naturally layers behind content that
// comes after it in DOM order.
// ---------------------------------------------------------------------------

export function Background({ children }: { children?: ReactNode }) {
  return <AbsoluteFill style={{ zIndex: -1 }}>{children}</AbsoluteFill>
}

const FONT_SANS =
  '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif'
const FONT_MONO =
  '"SF Mono", ui-monospace, SFMono-Regular, "Cascadia Code", monospace'

// ---------------------------------------------------------------------------
// Enter/exit animation components
//
// Each reads useCurrentFrame() and useVideoConfig().durationInFrames
// to animate at the start (enter) or end (exit) of a section.
//
// These use plain <div> wrappers (not AbsoluteFill) so they work both
// as full-section overlays AND inline inside flex layouts. The div
// inherits the parent's sizing naturally.
// ---------------------------------------------------------------------------

interface EnterExitProps {
  children: ReactNode
  /** Animation duration in frames */
  duration?: number
  /** Custom easing function. */
  easing?: (t: number) => number
  /**
   * Delay in frames before the animation starts.
   *
   * Positive values delay the start: `delay={10}` waits 10 frames.
   * Negative values start earlier: `delay={-5}` means the animation is
   * already 5 frames in when the scene begins (enter) or starts 5 frames
   * sooner than the default end-aligned position (exit).
   */
  delay?: number
}

interface SlideProps extends EnterExitProps {
  /** Where the element comes from. SlideIn from="left" enters from the left.
   *  SlideOut from="left" exits to the right (opposite of where it came from). */
  from?: 'up' | 'down' | 'left' | 'right'
  /** Slide distance in pixels. Default 140 (visible at 1080p). */
  distance?: number
}

// Ease-out for enters: arrives with momentum, decelerates into place.
// Elements settle naturally like an object coming to rest.
const ENTER_EASING = Easing.bezier(0.5, 0, 0, 1)

// Ease-in for exits: starts slow, accelerates away.
// Elements pick up speed as they leave, like being pulled offscreen.
const EXIT_EASING = Easing.bezier(1, 0, 1, 1)

// Slide distance in px. 140px+ needed for visible motion at 1080p.
const SLIDE_DISTANCE = 140

export function FadeIn({ children, duration = 15, easing, delay = 0 }: EnterExitProps) {
  const frame = useCurrentFrame()
  const start = delay
  const opacity = interpolate(frame, [start, start + duration], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: easing ?? ENTER_EASING,
  })
  return <div style={{ opacity }}>{children}</div>
}

export function FadeOut({ children, duration = 15, easing, delay = 0 }: EnterExitProps) {
  const frame = useCurrentFrame()
  const { durationInFrames } = useVideoConfig()
  const start = durationInFrames - duration + delay
  const opacity = interpolate(frame, [start, start + duration], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: easing ?? EXIT_EASING,
  })
  return <div style={{ opacity }}>{children}</div>
}

export function ZoomIn({ children, duration = 20, easing, delay = 0 }: EnterExitProps) {
  const frame = useCurrentFrame()
  const start = delay
  const progress = interpolate(frame, [start, start + duration], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: easing ?? ENTER_EASING,
  })
  const scale = interpolate(progress, [0, 1], [0.5, 1])
  return (
    <div style={{ opacity: progress, transform: `scale(${scale})` }}>
      {children}
    </div>
  )
}

export function ZoomOut({ children, duration = 20, easing, delay = 0 }: EnterExitProps) {
  const frame = useCurrentFrame()
  const { durationInFrames } = useVideoConfig()
  const start = durationInFrames - duration + delay
  const progress = interpolate(frame, [start, start + duration], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: easing ?? EXIT_EASING,
  })
  const scale = interpolate(progress, [0, 1], [1, 0.5])
  return (
    <div style={{ opacity: 1 - progress, transform: `scale(${scale})` }}>
      {children}
    </div>
  )
}

export function SlideIn({ children, duration = 20, from = 'up', distance = SLIDE_DISTANCE, easing, delay = 0 }: SlideProps) {
  const frame = useCurrentFrame()
  const start = delay
  const progress = interpolate(frame, [start, start + duration], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: easing ?? ENTER_EASING,
  })
  // Opacity uses a simple linear ramp over a short window so the element
  // becomes visible quickly regardless of the motion easing. Overshoot and
  // elastic easings start near zero for many frames which makes the element
  // invisible if opacity is tied to the same curve.
  const fadeFrames = Math.min(duration, 8)
  const opacity = interpolate(frame, [start, start + fadeFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const d = distance
  // from = where the element comes FROM.
  // "right" means starts offset to the right, slides to center.
  const transforms: Record<string, string> = {
    up: `translateY(${-(1 - progress) * d}px)`,
    down: `translateY(${(1 - progress) * d}px)`,
    left: `translateX(${-(1 - progress) * d}px)`,
    right: `translateX(${(1 - progress) * d}px)`,
  }
  return (
    <div style={{ opacity, transform: transforms[from] }}>
      {children}
    </div>
  )
}

export function SlideOut({ children, duration = 20, from = 'up', distance = SLIDE_DISTANCE, easing, delay = 0 }: SlideProps) {
  const frame = useCurrentFrame()
  const { durationInFrames } = useVideoConfig()
  const start = durationInFrames - duration + delay
  const progress = interpolate(frame, [start, start + duration], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: easing ?? EXIT_EASING,
  })
  // Fade out quickly at the end so elastic/overshoot easings don't keep
  // the element visible while it oscillates near the end.
  const fadeFrames = Math.min(duration, 8)
  const opacity = interpolate(frame, [start + duration - fadeFrames, start + duration], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const d = distance
  // from = where the element originally came from.
  // Exit goes the OPPOSITE direction: from="left" exits to the right.
  const OPPOSITE: Record<string, string> = {
    up: 'down',
    down: 'up',
    left: 'right',
    right: 'left',
  }
  const exitDir = OPPOSITE[from] ?? 'down'
  const transforms: Record<string, string> = {
    up: `translateY(${-progress * d}px)`,
    down: `translateY(${progress * d}px)`,
    left: `translateX(${-progress * d}px)`,
    right: `translateX(${progress * d}px)`,
  }
  return (
    <div style={{ opacity, transform: transforms[exitDir] }}>
      {children}
    </div>
  )
}

export function BlurIn({ children, duration = 20, easing, delay = 0 }: EnterExitProps) {
  const frame = useCurrentFrame()
  const start = delay
  const progress = interpolate(frame, [start, start + duration], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: easing ?? ENTER_EASING,
  })
  const blur = interpolate(progress, [0, 1], [24, 0])
  return (
    <div style={{ opacity: progress, filter: `blur(${blur}px)` }}>
      {children}
    </div>
  )
}

export function BlurOut({ children, duration = 20, easing, delay = 0 }: EnterExitProps) {
  const frame = useCurrentFrame()
  const { durationInFrames } = useVideoConfig()
  const start = durationInFrames - duration + delay
  const progress = interpolate(frame, [start, start + duration], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: easing ?? EXIT_EASING,
  })
  const blur = interpolate(progress, [0, 1], [0, 24])
  return (
    <div style={{ opacity: 1 - progress, filter: `blur(${blur}px)` }}>
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// <Animate> shorthand — composes enter + exit wrappers
// ---------------------------------------------------------------------------

type AnimationType = 'fadeIn' | 'fadeOut' | 'zoomIn' | 'zoomOut' |
  'slideIn' | 'slideOut' | 'blurIn' | 'blurOut'

interface AnimateProps {
  children: ReactNode
  enter?: AnimationType
  exit?: AnimationType
  enterDuration?: number
  exitDuration?: number
}

const ENTER_COMPONENTS: Record<string, React.FC<EnterExitProps>> = {
  fadeIn: FadeIn,
  zoomIn: ZoomIn,
  slideIn: SlideIn,
  blurIn: BlurIn,
}

const EXIT_COMPONENTS: Record<string, React.FC<EnterExitProps>> = {
  fadeOut: FadeOut,
  zoomOut: ZoomOut,
  slideOut: SlideOut,
  blurOut: BlurOut,
}

export function Animate({
  children,
  enter,
  exit,
  enterDuration,
  exitDuration,
}: AnimateProps) {
  let result = children
  if (exit) {
    const ExitComp = EXIT_COMPONENTS[exit]
    if (ExitComp) {
      result = <ExitComp duration={exitDuration}>{result}</ExitComp>
    }
  }
  if (enter) {
    const EnterComp = ENTER_COMPONENTS[enter]
    if (EnterComp) {
      result = <EnterComp duration={enterDuration}>{result}</EnterComp>
    }
  }
  return <>{result}</>
}

// ---------------------------------------------------------------------------
// Keyframes & Lottie utilities — extracted to ./keyframes.tsx
// Re-exported here so all existing consumers keep working.
// ---------------------------------------------------------------------------

export {
  keyframes,
  fromLottieProperty,
  extractLottieDimensionEasing,
  type BezierCurve,
  type Keyframe,
  type KeyframesDimensionOptions,
  type LottieEasingHandle,
  type LottieKeyframe,
  type LottieAnimatedProperty,
} from './keyframes.tsx'

// ---------------------------------------------------------------------------
// LayoutTransition — extracted to ./layout-transition.tsx
// Re-exported here so all existing consumers keep working.
// ---------------------------------------------------------------------------

export {
  LayoutContainerContext,
  LayoutTransition,
  LayoutTransitionProvider,
  LayoutGhost,
  LayoutAnimationLayer,
  type LayoutTransitionMode,
  type LayoutEntry,
  type LayoutRegistry,
} from './layout-transition.tsx'
// Local import for use in MDX_BUILTIN_COMPONENTS
import { LayoutTransition } from './layout-transition.tsx'

// ---------------------------------------------------------------------------
// Media components & ExportContext — extracted to ./media-components.tsx
// Re-exported here so all existing consumers keep working.
// ---------------------------------------------------------------------------

import { ExportContext, useIsExporting, Img, Audio, Video } from './media-components.tsx'
export { ExportContext, useIsExporting, Img, Audio, Video } from './media-components.tsx'

// Visual components and animations are re-exported so they're available
// as named imports from this client module for MDX usage.
export {
  MeshGradientBg,
  BlurReveal,
  MaskedSlideReveal,
  StaggeredFadeUp,
  TerminalSimulator,
  GlassCodeBlock,
  ShimmerSweep,
  SpringPopIn,
  AnimatedChart,
  FeaturePill,
  AngledScreen,
  CodeBlock,
  CODE_THEMES,
  BandsShader,
}

/** Built-in JSX names available in MDX without user imports. Shared by
 *  client rendering (mdx-client.tsx) and <Server> slot rendering (app.tsx).
 *  Add new presentation components here once — not in app.tsx / mdx-client. */
/** Client-side stubs for generated media components. These are always
 *  rendered inside auto-wrapped <Server> slots, so the client never calls
 *  them directly. They exist so safe-mdx's component resolution finds
 *  them, and the prop types enable MDX LSP autocomplete. */
import type {
  GeneratedImageProps,
  GeneratedVideoProps,
  GeneratedSpeechProps,
} from './server-components.tsx'
function GeneratedImage(_props: GeneratedImageProps) { return null }
function GeneratedVideo(_props: GeneratedVideoProps) { return null }
function GeneratedSpeech(_props: GeneratedSpeechProps) { return null }

export const MDX_BUILTIN_COMPONENTS = {
  Fill,
  Background,
  LayoutTransition,
  AngledScreen,
  BandsShader,
  MeshGradientBg,
  BlurReveal,
  MaskedSlideReveal,
  StaggeredFadeUp,
  TerminalSimulator,
  GlassCodeBlock,
  CodeBlock,
  ShimmerSweep,
  SpringPopIn,
  AnimatedChart,
  FeaturePill,
  Img,
  Audio,
  Video,
  FadeIn,
  FadeOut,
  ZoomIn,
  ZoomOut,
  SlideIn,
  SlideOut,
  BlurIn,
  BlurOut,
  Animate,
  SlotText,
  GeneratedImage,
  GeneratedVideo,
  GeneratedSpeech,
} as const
