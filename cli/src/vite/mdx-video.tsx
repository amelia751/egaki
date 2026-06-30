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
  BlurReveal,
  MaskedSlideReveal,
  StaggeredFadeUp,
  ShimmerSweep,
} from './components.tsx'
import { AngledScreen } from './angled-screen.tsx'
import { CodeBlock, CODE_THEMES } from './code-block.tsx'
import { BandsShader } from './bands-shader.tsx'
import { WaveGradientShader } from './wave-gradient-shader.tsx'
import { LiquidGradientShader } from './liquid-gradient-shader.tsx'
import { DispersionRingsShader } from './dispersion-rings-shader.tsx'


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
  Internals,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'
import {
  BEZIER_POINTS,
  cubicBezier,
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
  BEZIER_POINTS,
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
  apple: cubicBezier(0.76, 0, 0.24, 1),
  /** Fast enter, gentle settle — elements arriving with momentum */
  enterFast: cubicBezier(0.22, 1, 0.36, 1),
  /** Slow start, fast exit — elements leaving the frame */
  exitSlow: cubicBezier(0.55, 0, 1, 0.45),
  /** Social media punch — very sharp burst */
  snappy: cubicBezier(0.87, 0, 0.13, 1),
  /** Luxurious, slow cinematic feel */
  cinematic: cubicBezier(0.83, 0, 0.17, 1),

  // --- Bezier presets (intensity 50 defaults) ---

  /** Strong ease-out, snaps into place. The workhorse motion curve. */
  smooth: cubicBezier(0.5, 0, 0, 1),
  /** Symmetric S-curve, natural feeling in-out */
  natural: cubicBezier(0.8, 0, 0.2, 1),
  /** Pure deceleration, no ease-in. Objects arriving at full speed. */
  decelerate: cubicBezier(0, 0, 0, 1),
  /** Pure acceleration, no ease-out. Objects leaving from rest. */
  accelerate: cubicBezier(1, 0, 1, 1),

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
  return cubicBezier(x1, 0, 0, 1)
}

/** natural at custom intensity. Pattern: cubic-bezier(lerp(0.5, 1, i/100), 0, lerp(0.5, 0, i/100), 1) */
export function naturalEasing(intensity: number): EasingFunction {
  const x1 = 0.5 + 0.5 * (intensity / 100)
  const x2 = 0.5 - 0.5 * (intensity / 100)
  return cubicBezier(x1, 0, x2, 1)
}

/** decelerate at custom intensity */
export function decelerateEasing(intensity: number): EasingFunction {
  // 0→(0, 0, 0.3, 1), 50→(0, 0, 0, 1), 75→(0, 0.45, 0, 1), 100→(0, 0.9, 0, 1)
  if (intensity <= 50) {
    const x2 = 0.3 * (1 - intensity / 50)
    return cubicBezier(0, 0, x2, 1)
  }
  const y1 = 0.9 * ((intensity - 50) / 50)
  return cubicBezier(0, y1, 0, 1)
}

/** accelerate at custom intensity */
export function accelerateEasing(intensity: number): EasingFunction {
  // 0→(0.7, 0, 1, 1), 50→(1, 0, 1, 1), 75→(1, 0, 1, 0.55), 100→(1, 0, 1, 0.1)
  if (intensity <= 50) {
    const x1 = 0.7 + 0.3 * (intensity / 50)
    return cubicBezier(x1, 0, 1, 1)
  }
  const y2 = 1 - 0.9 * ((intensity - 50) / 50)
  return cubicBezier(1, 0, 1, y2)
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
// Animation primitives — composable, single-responsibility wrappers.
//
// Each animates ONE CSS property from `from` to `to` over `duration` frames.
// Enter vs exit is inferred from `startInFrames`: positive = enter (offset
// from section start), negative = exit (offset from section end).
//
// All use <Fill> so they're full-frame absolute layers. Compose by nesting:
//   <Opacity from={0} to={1} duration={15}>
//     <TranslateX from={-140} to={0} duration={20}>
//       content
//     </TranslateX>
//   </Opacity>
//
// Opacity is never implicit. TranslateX doesn't auto-fade; wrap in <Opacity>.
// ---------------------------------------------------------------------------

export interface AnimateProps {
  children: ReactNode
  /** Start value of the animated property. */
  from: number
  /** End value of the animated property. */
  to: number
  /** Animation duration in frames. */
  duration: number
  /** Custom easing function. Defaults to ease-out for enter, ease-in for exit. */
  easing?: (t: number) => number
  /**
   * Frame offset for when the animation starts.
   *
   * Positive or zero: offset from section start (enter animation).
   *   `startInFrames={10}` waits 10 frames then starts.
   *
   * Negative: offset from section end (exit animation).
   *   `startInFrames={-30}` means the animation starts 30 frames before the
   *   section ends.
   */
  startInFrames?: number
  /**
   * Fraction (0-1) of the animation clipped by the scene boundary.
   *
   * For enter (startInFrames >= 0): shifts animation earlier so it starts
   * before the scene — element appears mid-motion at the cut point.
   *   cutInMotion={0.1} on a 20-frame animation: starts 2 frames before scene.
   *
   * For exit (startInFrames < 0): shifts animation later so it extends past
   * the scene end — element is still moving at the cut point.
   *   cutInMotion={0.2} on a 20-frame exit: extends 4 frames past scene end.
   */
  cutInMotion?: number
  /**
   * When true, wraps children in a plain `<div>` instead of `<Fill>`.
   * Use this when the animated element is inside a flex/grid/flow layout
   * and should not take the full frame. Without `inline`, the wrapper is
   * an AbsoluteFill that covers the entire composition.
   */
  inline?: boolean
  /** Extra styles applied to the wrapper element (both inline and Fill modes). */
  style?: React.CSSProperties
  /**
   * Label for this animation instance. Used as:
   * - The tweakpane folder title (for visual identification)
   * - An HTML `data-animation` attribute (for agent inspection)
   */
  label: string
}

// Ease-out for enters: arrives with momentum, decelerates into place.
const ENTER_EASING = cubicBezier(0.5, 0, 0, 1)

// Ease-in for exits: starts slow, accelerates away.
const EXIT_EASING = cubicBezier(1, 0, 1, 1)

/** Resolve the effective start frame and default easing from AnimateProps. */
function resolveAnimateStart(
  startInFrames: number,
  duration: number,
  cutInMotion: number,
  durationInFrames: number,
): { effectiveStart: number; isExit: boolean } {
  if (startInFrames < 0) {
    // Exit: negative start counts from section end
    const resolvedStart = durationInFrames + startInFrames
    return {
      effectiveStart: resolvedStart + cutInMotion * duration,
      isExit: true,
    }
  }
  // Enter: positive start counts from section start
  return {
    effectiveStart: startInFrames - cutInMotion * duration,
    isExit: false,
  }
}

// ---------------------------------------------------------------------------
// Easing function → bezier control points extraction.
//
// cubicBezier() attaches a [BEZIER_POINTS] symbol property to the returned
// function with the original [x1, y1, x2, y2] tuple. This lets the tweakpane
// bezier blade show and edit the exact curve for any easing created with
// cubicBezier(), including EASE presets and user-defined curves.
// Non-bezier presets (sampled from spring/bounce physics) don't have this
// property and fall back to a default curve.
// ---------------------------------------------------------------------------

/** Default bezier control points for enter (ease-out) and exit (ease-in). */
const DEFAULT_ENTER_BEZIER: [number, number, number, number] = [0.5, 0, 0, 1] // smooth
const DEFAULT_EXIT_BEZIER: [number, number, number, number] = [1, 0, 1, 1] // accelerate

/** Extract bezier control points from an easing function, or null if not a bezier. */
function easingToBezier(fn: ((t: number) => number) | undefined): [number, number, number, number] | null {
  if (!fn) return null
  const points = (fn as any)[BEZIER_POINTS]
  if (Array.isArray(points) && points.length === 4) return points as [number, number, number, number]
  return null
}

/** Shared tweakpane + interpolation logic for all animation primitives. */
function useAnimateValue(
  componentName: string,
  props: AnimateProps,
): { value: number; resolvedInline: boolean; resolvedStyle: React.CSSProperties | undefined; label: string | undefined } {
  const frame = useCurrentFrame()
  const { durationInFrames, fps } = useVideoConfig()

  const tpLabel = props.label ? `${componentName}: ${props.label}` : componentName

  // Determine default bezier control points from the easing prop
  const defaultIsExit = (props.startInFrames ?? 0) < 0
  const propBezier = easingToBezier(props.easing)
  const defaultBezier = propBezier ?? (defaultIsExit ? DEFAULT_EXIT_BEZIER : DEFAULT_ENTER_BEZIER)

  const tp = useTweakpane(tpLabel, {
    from: { value: props.from, min: -2000, max: 2000, step: 1 },
    to: { value: props.to, min: -2000, max: 2000, step: 1 },
    duration: { value: props.duration, min: 1, max: 10 * fps, step: 1 },
    startInFrames: { value: props.startInFrames ?? 0, min: -10 * fps, max: 10 * fps, step: 1 },
    cutInMotion: { value: props.cutInMotion ?? 0, min: 0, max: 1, step: 0.01 },
    easing: { type: 'cubicBezier' as const, value: defaultBezier },
    inline: props.inline ?? false,
  })

  const tpBezier: [number, number, number, number] = tp.easing
  // If the user changed the bezier curve in tweakpane, use it.
  // Otherwise use the original prop easing (which may be a non-bezier function).
  const bezierChanged = tpBezier[0] !== defaultBezier[0]
    || tpBezier[1] !== defaultBezier[1]
    || tpBezier[2] !== defaultBezier[2]
    || tpBezier[3] !== defaultBezier[3]
  const finalEasing = bezierChanged
    ? cubicBezier(tpBezier[0], tpBezier[1], tpBezier[2], tpBezier[3])
    : (props.easing ?? (defaultIsExit ? EXIT_EASING : ENTER_EASING))

  const { effectiveStart } = resolveAnimateStart(
    tp.startInFrames as number, tp.duration as number,
    tp.cutInMotion as number, durationInFrames,
  )
  const value = interpolate(
    frame,
    [effectiveStart, effectiveStart + (tp.duration as number)],
    [tp.from as number, tp.to as number],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: finalEasing },
  )

  return {
    value,
    resolvedInline: tp.inline as boolean,
    resolvedStyle: props.style,
    label: props.label,
  }
}

export function Opacity(props: AnimateProps) {
  const { value, resolvedInline, resolvedStyle, label } = useAnimateValue('Opacity', props)
  const animStyle = { opacity: value, ...resolvedStyle }
  if (resolvedInline) return <div style={animStyle} data-animation={label}>{props.children}</div>
  return <Fill style={animStyle} data-animation={label}>{props.children}</Fill>
}

export function Scale(props: AnimateProps) {
  const { value, resolvedInline, resolvedStyle, label } = useAnimateValue('Scale', props)
  const animStyle = { transform: `scale(${value})`, willChange: 'transform' as const, ...resolvedStyle }
  if (resolvedInline) return <div style={animStyle} data-animation={label}>{props.children}</div>
  return <Fill style={animStyle} data-animation={label}>{props.children}</Fill>
}

export function TranslateX(props: AnimateProps) {
  const { value, resolvedInline, resolvedStyle, label } = useAnimateValue('TranslateX', props)
  const animStyle = { transform: `translateX(${value}px)`, willChange: 'transform' as const, ...resolvedStyle }
  if (resolvedInline) return <div style={animStyle} data-animation={label}>{props.children}</div>
  return <Fill style={animStyle} data-animation={label}>{props.children}</Fill>
}

export function TranslateY(props: AnimateProps) {
  const { value, resolvedInline, resolvedStyle, label } = useAnimateValue('TranslateY', props)
  const animStyle = { transform: `translateY(${value}px)`, willChange: 'transform' as const, ...resolvedStyle }
  if (resolvedInline) return <div style={animStyle} data-animation={label}>{props.children}</div>
  return <Fill style={animStyle} data-animation={label}>{props.children}</Fill>
}

export function Blur(props: AnimateProps) {
  const { value, resolvedInline, resolvedStyle, label } = useAnimateValue('Blur', props)
  const animStyle = { filter: `blur(${value}px)`, ...resolvedStyle }
  if (resolvedInline) return <div style={animStyle} data-animation={label}>{props.children}</div>
  return <Fill style={animStyle} data-animation={label}>{props.children}</Fill>
}

// ---------------------------------------------------------------------------
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
  BlurReveal,
  MaskedSlideReveal,
  StaggeredFadeUp,
  ShimmerSweep,
  AngledScreen,
  CodeBlock,
  CODE_THEMES,
  BandsShader,
  WaveGradientShader,
  LiquidGradientShader,
  DispersionRingsShader,
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
  WaveGradientShader,
  LiquidGradientShader,
  DispersionRingsShader,
  BlurReveal,
  MaskedSlideReveal,
  StaggeredFadeUp,
  CodeBlock,
  ShimmerSweep,
  Img,
  Audio,
  Video,
  Opacity,
  Scale,
  TranslateX,
  TranslateY,
  Blur,
  GeneratedImage,
  GeneratedVideo,
  GeneratedSpeech,
} as const
