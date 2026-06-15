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

import { createContext, useContext, type ReactNode } from 'react'
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
} from './components.tsx'
import { AngledScreen } from './angled-screen.tsx'
import { CodeBlock, CODE_THEMES } from './code-block.tsx'
import {
  getCachedRawDuration,
  cacheRawDuration,
  computeEffectiveDuration,
  reportSectionDuration,
  useSectionIndex,
} from './media-duration-store.ts'

export { splitIntoSections, calculateTotalDuration, resolveAutoDurations }
import { useTweakpane } from './tweakpane-hook.tsx'
export { useTweakpane }
export type { MdxSection, SplitResult, VideoFrontmatter, EagerModules, SafeMdxError }

// ---------------------------------------------------------------------------
// Export context — lets components detect when they're inside a render export
// ---------------------------------------------------------------------------

export const ExportContext = createContext(false)

/** Returns true when the component is rendering inside an export (renderMediaOnWeb). */
export function useIsExporting(): boolean {
  return useContext(ExportContext)
}

import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useDelayRender,
  useVideoConfig,
} from 'remotion'
import { Audio as MediaAudio, Video as MediaVideo } from '@remotion/media'
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
 * physics config. Ported from Framer Motion's spring resolver.
 *
 * @param duration - Animation duration in seconds (e.g. 0.5)
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
  const omega = (2 * Math.PI) / duration
  const zeta = 1 - Math.max(0, Math.min(1, bounce))
  return {
    stiffness: omega * omega,
    damping: 2 * zeta * omega,
    mass: 1,
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
// Background — real component that self-positions as an absolute layer
//
// Works both in MDX and when imported from TSX components. Renders its
// children in a full-frame AbsoluteFill behind sibling content. In Remotion
// all layout is absolute, so this naturally layers behind content that
// comes after it in DOM order.
// ---------------------------------------------------------------------------

export function Background({ children }: { children?: ReactNode }) {
  return <AbsoluteFill style={{ zIndex: 0 }}>{children}</AbsoluteFill>
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
// keyframes() — evaluate a keyframed animation at a given frame
//
// Accepts an array of typed keyframe descriptors with bezier easing, hold,
// and per-dimension control. Wraps Remotion's interpolate() + Easing.bezier()
// so you get the full Lottie/After Effects easing model with clean parameters.
//
// See video/docs/lottie-to-remotion.md for the Lottie field mapping.
// ---------------------------------------------------------------------------

/**
 * Cubic bezier control points: [x1, y1, x2, y2].
 * Same as CSS `cubic-bezier(x1, y1, x2, y2)`.
 * x values must be in [0, 1]. y values can overshoot (< 0 or > 1).
 */
export type BezierCurve = [x1: number, y1: number, x2: number, y2: number]

/** A single keyframe in a `keyframes()` animation. */
export interface Keyframe<T extends number | number[] = number> {
  /** Frame number where this keyframe occurs. */
  time: number
  /** Value at this keyframe. Scalar or vector (e.g. [x, y] for position). */
  value: T
  /**
   * Bezier easing curve for the transition FROM this keyframe TO the next.
   * Four control points [x1, y1, x2, y2], same as CSS cubic-bezier().
   * Omit for linear interpolation. Ignored on the last keyframe.
   */
  easing?: BezierCurve
  /**
   * If true, value holds constant until the next keyframe (step function).
   * No interpolation occurs. Overrides `easing`.
   */
  hold?: boolean
}

/** Options for per-dimension easing on vector keyframes. */
export interface KeyframesDimensionOptions {
  /**
   * Per-dimension bezier easing overrides.
   * Index matches the dimension index in the value array.
   * When set, overrides the keyframe-level `easing` for that dimension.
   * Each entry is a [x1, y1, x2, y2] bezier curve or undefined to use the keyframe's easing.
   */
  dimensionEasing?: (BezierCurve | undefined)[]
}

// Step easing: holds at 0 until t=1, then jumps to 1
function stepEasing(t: number): number {
  return t < 1 ? 0 : 1
}

function buildEasingFn(curve: BezierCurve | undefined): (t: number) => number {
  if (!curve) return (t: number) => t // linear
  return Easing.bezier(curve[0], curve[1], curve[2], curve[3])
}

/**
 * Evaluate a keyframed animation at the given frame.
 *
 * Scalar version: each keyframe has a numeric `value`, returns a number.
 *
 * ```ts
 * const opacity = keyframes(frame, [
 *   { time: 0,  value: 0,   easing: [0.33, 0, 0.67, 1] },
 *   { time: 30, value: 1 },
 * ])
 * ```
 */
export function keyframes(
  frame: number,
  kfs: Keyframe<number>[],
  options?: KeyframesDimensionOptions,
): number

/**
 * Vector version: each keyframe has an array `value`, returns an array
 * of the same length. Supports per-dimension easing via options.
 *
 * ```ts
 * const [x, y] = keyframes(frame, [
 *   { time: 0,  value: [0, 0],     easing: [0.33, 0, 0.67, 1] },
 *   { time: 30, value: [200, 400] },
 * ])
 * ```
 */
export function keyframes<N extends number>(
  frame: number,
  kfs: Keyframe<number[] & { length: N }>[],
  options?: KeyframesDimensionOptions,
): number[]

export function keyframes(
  frame: number,
  kfs: Keyframe<number | number[]>[],
  options?: KeyframesDimensionOptions,
): number | number[] {
  if (kfs.length === 0) {
    throw new Error('keyframes() requires at least one keyframe')
  }

  if (kfs.length === 1) {
    return kfs[0]!.value
  }

  const first = kfs[0]!.value
  const isVector = Array.isArray(first)

  if (isVector) {
    return evaluateVector(frame, kfs as Keyframe<number[]>[], options)
  }

  return evaluateScalar(frame, kfs as Keyframe<number>[], options)
}

function evaluateScalar(
  frame: number,
  kfs: Keyframe<number>[],
  options?: KeyframesDimensionOptions,
): number {
  const inputRange = kfs.map((kf) => kf.time)
  const outputRange = kfs.map((kf) => kf.value)
  const dimEasing = options?.dimensionEasing?.[0]

  const easings: ((t: number) => number)[] = []
  for (let i = 0; i < kfs.length - 1; i++) {
    const kf = kfs[i]!
    if (kf.hold) {
      easings.push(stepEasing)
    } else {
      easings.push(buildEasingFn(dimEasing ?? kf.easing))
    }
  }

  return interpolate(frame, inputRange, outputRange, {
    easing: easings,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
}

function evaluateVector(
  frame: number,
  kfs: Keyframe<number[]>[],
  options?: KeyframesDimensionOptions,
): number[] {
  const dimensions = kfs[0]!.value.length
  const result: number[] = new Array(dimensions)

  for (let dim = 0; dim < dimensions; dim++) {
    const inputRange = kfs.map((kf) => kf.time)
    const outputRange = kfs.map((kf) => kf.value[dim]!)
    const dimEasing = options?.dimensionEasing?.[dim]

    const easings: ((t: number) => number)[] = []
    for (let i = 0; i < kfs.length - 1; i++) {
      const kf = kfs[i]!
      if (kf.hold) {
        easings.push(stepEasing)
      } else {
        easings.push(buildEasingFn(dimEasing ?? kf.easing))
      }
    }

    result[dim] = interpolate(frame, inputRange, outputRange as number[], {
      easing: easings,
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    })
  }

  return result
}

// ---------------------------------------------------------------------------
// fromLottieProperty() — convert a raw Lottie animated property to keyframes
//
// Takes Lottie's { a, k } shape directly and returns a Keyframe[] array
// compatible with keyframes(). Useful when loading a Lottie JSON file and
// wanting to drive Remotion animations from its data.
// ---------------------------------------------------------------------------

/** Raw Lottie easing handle shape. */
export interface LottieEasingHandle {
  x: number | number[]
  y: number | number[]
}

/** Raw Lottie keyframe as found in a .json file. */
export interface LottieKeyframe {
  /** Frame number */
  t: number
  /** Value at this keyframe */
  s?: number[]
  /** Hold flag */
  h?: 0 | 1
  /** In tangent (easing into next keyframe) */
  i?: LottieEasingHandle
  /** Out tangent (easing leaving this keyframe) */
  o?: LottieEasingHandle
}

/** Raw Lottie animated property: { a: 0|1, k: value | keyframes }. */
export interface LottieAnimatedProperty {
  /** 1 if animated, 0 if static */
  a: 0 | 1
  /** Static value (when a=0) or array of keyframes (when a=1) */
  k: number | number[] | LottieKeyframe[]
}

/**
 * Convert a raw Lottie animated property into a `Keyframe[]` array
 * that can be passed directly to `keyframes()`.
 *
 * ```ts
 * import lottieJson from './animation.json'
 *
 * // Get the opacity property from layer 0
 * const opacityKfs = fromLottieProperty(lottieJson.layers[0].ks.o)
 * const opacity = keyframes(frame, opacityKfs)
 * ```
 *
 * For static properties (a=0), returns a single keyframe at time 0.
 * For vector properties, values are preserved as arrays.
 */
export function fromLottieProperty(
  property: LottieAnimatedProperty,
): Keyframe<number>[] | Keyframe<number[]>[] {
  // Static property
  if (!property.a || !Array.isArray(property.k) || property.k.length === 0) {
    const val = property.k
    if (Array.isArray(val)) {
      return [{ time: 0, value: val }] as Keyframe<number[]>[]
    }
    return [{ time: 0, value: val as number }]
  }

  const lottieKfs = property.k as LottieKeyframe[]

  // Detect if this is a scalar or vector property from the first keyframe's value
  const firstValue = lottieKfs[0]!.s
  if (!firstValue || firstValue.length === 0) {
    return [{ time: 0, value: 0 }]
  }

  const isScalar = firstValue.length === 1

  if (isScalar) {
    return lottieKfs.map((lkf, i): Keyframe<number> => {
      const kf: Keyframe<number> = {
        time: lkf.t,
        value: lkf.s?.[0] ?? 0,
      }
      if (lkf.h === 1) {
        kf.hold = true
      } else if (lkf.o && lkf.i && i < lottieKfs.length - 1) {
        kf.easing = extractBezier(lkf.o, lkf.i, 0)
      }
      return kf
    })
  }

  // Vector property
  return lottieKfs.map((lkf, i): Keyframe<number[]> => {
    const kf: Keyframe<number[]> = {
      time: lkf.t,
      value: lkf.s ? [...lkf.s] : [],
    }
    if (lkf.h === 1) {
      kf.hold = true
    } else if (lkf.o && lkf.i && i < lottieKfs.length - 1) {
      // Use dimension 0 for the keyframe-level easing
      kf.easing = extractBezier(lkf.o, lkf.i, 0)
    }
    return kf
  })
}

/**
 * Extract per-dimension easing overrides from a Lottie keyframe sequence.
 * Returns a `dimensionEasing` array suitable for the `keyframes()` options.
 * Only needed when the Lottie property has different easing per dimension
 * (e.g. position with independent X/Y curves).
 *
 * ```ts
 * const posKfs = fromLottieProperty(lottieJson.layers[0].ks.p)
 * const dimEasing = extractLottieDimensionEasing(lottieJson.layers[0].ks.p, segmentIndex)
 * const [x, y] = keyframes(frame, posKfs, { dimensionEasing: dimEasing })
 * ```
 */
export function extractLottieDimensionEasing(
  property: LottieAnimatedProperty,
  segmentIndex: number,
): (BezierCurve | undefined)[] | undefined {
  if (!property.a || !Array.isArray(property.k)) return undefined
  const lottieKfs = property.k as LottieKeyframe[]
  const lkf = lottieKfs[segmentIndex]
  if (!lkf?.o || !lkf?.i || !lkf.s) return undefined

  const dimensions = lkf.s.length
  if (dimensions <= 1) return undefined

  // Check if all dimensions have the same easing — if so, no overrides needed
  const ox = lkf.o.x
  const oy = lkf.o.y
  const ix = lkf.i.x
  const iy = lkf.i.y
  if (!Array.isArray(ox) || !Array.isArray(oy) || !Array.isArray(ix) || !Array.isArray(iy)) {
    return undefined
  }
  if (ox.length <= 1 && oy.length <= 1 && ix.length <= 1 && iy.length <= 1) {
    return undefined
  }

  const result: (BezierCurve | undefined)[] = []
  for (let dim = 0; dim < dimensions; dim++) {
    result.push(extractBezier(lkf.o, lkf.i, dim))
  }
  return result
}

function extractBezier(
  out: LottieEasingHandle,
  into: LottieEasingHandle,
  dimension: number,
): BezierCurve {
  const ox = Array.isArray(out.x) ? (out.x[dimension] ?? out.x[0]!) : out.x
  const oy = Array.isArray(out.y) ? (out.y[dimension] ?? out.y[0]!) : out.y
  const ix = Array.isArray(into.x) ? (into.x[dimension] ?? into.x[0]!) : into.x
  const iy = Array.isArray(into.y) ? (into.y[dimension] ?? into.y[0]!) : into.y
  return [ox, oy, ix, iy]
}

// ---------------------------------------------------------------------------
// LayoutTransition — FLIP-based layout animation across section boundaries
//
// <LayoutTransition id="x"> wraps an element that should animate from its
// position in the previous section to its position in the current section.
// When two consecutive sections both contain <LayoutTransition id="x">,
// the element in the current section starts at the previous section's
// position and springs to its natural position.
//
// Architecture (no temporal state — seek-safe by design):
// - The previous section is re-rendered in a hidden "ghost" container,
//   pinned at its last frame via Remotion <Freeze>. This happens in
//   SectionWithLayoutTransition (player-page.tsx).
// - LayoutContainerContext tells each LayoutTransition whether it lives
//   in the ghost or the visible container.
// - Entries register into LayoutRegistryContext in useLayoutEffect.
//   React runs effects in tree order, so all LayoutTransition effects
//   (descendants of containers rendered before the layer) complete before
//   LayoutAnimationLayer's effect runs.
// - LayoutAnimationLayer measures ghost vs visible rects every frame and
//   writes interpolated FLIP transforms directly to the visible wrappers.
//
// Hard-won correctness details (do not "simplify" these away):
// - getBoundingClientRect() INCLUDES CSS transforms. Transforms must be
//   reset before measuring, or each frame compounds the previous frame's
//   FLIP offset and the element drifts.
// - The Remotion Player scales the composition to fit the viewport.
//   Client-px deltas must be divided by that scale before being used as
//   transform values in composition space. The layer measures the scale
//   from its own composition-sized AbsoluteFill.
// - The web-renderer does not support z-index; layer order is DOM order.
//   The ghost renders BEFORE the visible content so the visible section
//   paints over it even if a renderer ignores visibility:hidden.
// ---------------------------------------------------------------------------

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type RefObject,
} from 'react'

type LayoutContainerKind = 'ghost' | 'visible'

interface LayoutEntry {
  id: string
  container: LayoutContainerKind
  ref: RefObject<HTMLDivElement | null>
  /** Transition duration in frames */
  durationInFrames: number
  /** Spring bounce, 0 = no overshoot */
  bounce: number
  /** Custom easing function. When set, overrides the spring. */
  easing: ((t: number) => number) | null
}

interface LayoutRegistry {
  entries: Set<LayoutEntry>
  /** Returns an unregister function */
  register(entry: LayoutEntry): () => void
}

const LayoutRegistryContext = createContext<LayoutRegistry | null>(null)
export const LayoutContainerContext = createContext<LayoutContainerKind>('visible')

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

// ---------------------------------------------------------------------------
// Ghost-aware media components
//
// @remotion/media's Audio/Video register media assets in layout effects even
// when their DOM is hidden, so a raw re-export would leak/duplicate audio and
// can make the Player buffer while a hidden ghost is pinned near trimAfter.
// These wrappers neutralize media inside the ghost: Audio renders nothing (it
// has no layout footprint anyway), Video becomes a layout-only placeholder.
//
// Video also integrates with tweakpane: when not exporting, it loads the
// source media duration and registers start/end sliders (in seconds)
// so users can interactively cut the video. The sliders convert to Remotion's
// trimBefore/trimAfter frame props on the underlying @remotion/media Video.
// ---------------------------------------------------------------------------

/**
 * Shared hook for Audio/Video: fetches raw media duration, computes
 * effective playback duration (accounting for trim + playbackRate), and
 * reports to the per-section duration store.
 *
 * Priority:
 *   1. Both trimBefore + trimAfter set → compute from props, no fetch.
 *   2. Raw src cached → compute effective from cached raw + trim + rate.
 *   3. Cache miss → delayRender, fetch via mediabunny, cache raw, compute
 *      effective, report, continueRender.
 *
 * Returns the RAW source duration (for tweakpane trim controls). null until
 * known. Reports the EFFECTIVE duration to the section store.
 *
 * Returns the RAW source duration (for tweakpane trim controls). null until
 * known. Reports the EFFECTIVE duration to the section store.
 *
 * Uses delayRender to block export rendering until the duration is known.
 *
 * Reports are NOT cleared on unmount. Remotion's Series.Sequence unmounts
 * inactive sections during normal seek/playback; clearing on unmount would
 * cause an infinite loop (report → duration changes → remount → report).
 * Reports persist for the lifetime of the composition and are reset when
 * the MDX/modules change (see resetSectionDurations in mdx-client.tsx).
 */
function useReportMediaDuration(props: {
  src?: string
  trimBefore?: number
  trimAfter?: number
  playbackRate?: number
}, skip?: boolean): number | null {
  const instanceId = useId()
  const sectionIndex = useSectionIndex()
  const { fps } = useVideoConfig()
  const { delayRender, continueRender } = useDelayRender()
  const isExporting = useIsExporting()
  const [rawDuration, setRawDuration] = useState<number | null>(null)

  useEffect(() => {
    if (!props.src || skip) return

    let delayHandle: number | null = null
    let disposed = false

    const reportEffective = (raw: number) => {
      const effective = computeEffectiveDuration({
        rawSeconds: raw,
        fps,
        trimBefore: props.trimBefore,
        trimAfter: props.trimAfter,
        playbackRate: props.playbackRate,
      })
      if (effective != null && effective > 0) {
        reportSectionDuration(sectionIndex, instanceId, effective)
      }
    }

    // Fast path: both trim bounds set → effective duration fully determined.
    const effectiveFromProps = computeEffectiveDuration({
      fps,
      trimBefore: props.trimBefore,
      trimAfter: props.trimAfter,
      playbackRate: props.playbackRate,
    })
    if (effectiveFromProps != null) {
      reportSectionDuration(sectionIndex, instanceId, effectiveFromProps)
      return
    }

    // Check raw src cache
    const cachedRaw = getCachedRawDuration(props.src)
    if (cachedRaw !== undefined) {
      setRawDuration(cachedRaw)
      reportEffective(cachedRaw)
      return
    }

    // Cache miss: during export, block rendering until metadata is known.
    // In the interactive Player, delayRender still creates global handles even
    // though playback buffering is handled by Remotion's separate BufferState.
    // Keeping it export-only avoids stale render-ready state during trim seeks.
    if (isExporting) {
      delayHandle = delayRender('Fetching media duration for ' + props.src)
    }

    void (async () => {
      try {
        const { Input, UrlSource, ALL_FORMATS } = await import('mediabunny')
        if (disposed) return
        const input = new Input({
          formats: ALL_FORMATS,
          source: new UrlSource(props.src!),
        })
        const duration =
          (await input.getDurationFromMetadata()) ??
          (await input.computeDuration())
        input.dispose()
        if (!disposed && isFinite(duration) && duration > 0) {
          cacheRawDuration(props.src!, duration)
          setRawDuration(duration)
          reportEffective(duration)
        }
      } catch {
        // Source unreadable or unsupported format; skip
      } finally {
        if (delayHandle != null) {
          continueRender(delayHandle)
          delayHandle = null
        }
      }
    })()

    return () => {
      disposed = true
      if (delayHandle != null) {
        continueRender(delayHandle)
        delayHandle = null
      }
    }
  }, [props.src, skip, sectionIndex, instanceId, fps, props.trimBefore, props.trimAfter, props.playbackRate, isExporting])

  return rawDuration
}

export function Img(props: React.ImgHTMLAttributes<HTMLImageElement>) {
  const container = useContext(LayoutContainerContext)
  if (container === 'ghost') {
    return (
      <div
        className={props.className}
        style={{ width: props.width, height: props.height, ...props.style }}
        data-egaki-ghost-img
      />
    )
  }
  // eslint-disable-next-line jsx-a11y/alt-text
  return <img {...props} />
}

export function Audio(props: ComponentProps<typeof MediaAudio>) {
  const container = useContext(LayoutContainerContext)
  useReportMediaDuration(props, container === 'ghost')
  if (container === 'ghost') return null
  return <MediaAudio {...props} />
}

export function Video(props: ComponentProps<typeof MediaVideo>) {
  const container = useContext(LayoutContainerContext)
  const isExporting = useIsExporting()

  if (container === 'ghost') {
    return <GhostVideoPlaceholder {...props} />
  }

  // During export, report duration but skip tweakpane UI
  if (isExporting) {
    return <VideoExportDuration {...props} />
  }

  return <VideoWithTweakpane {...props} />
}

function GhostVideoPlaceholder(props: ComponentProps<typeof MediaVideo>) {
  return (
    <div
      className={props.className}
      style={{ width: props.width, height: props.height, ...props.style }}
      data-egaki-ghost-video
    />
  )
}

/** Export mode: reports duration to section store, renders plain MediaVideo. */
function VideoExportDuration(props: ComponentProps<typeof MediaVideo>) {
  useReportMediaDuration(props)
  return <MediaVideo {...props} />
}

/**
 * Loads the source video's duration via the shared hook, then delegates
 * to VideoTrimControls for tweakpane trim sliders. Until duration is known,
 * renders the video without trim controls.
 */
function VideoWithTweakpane(props: ComponentProps<typeof MediaVideo>) {
  const rawDuration = useReportMediaDuration(props)

  if (rawDuration === null) {
    return <MediaVideo {...props} />
  }

  return <VideoTrimControls {...props} mediaDuration={rawDuration} />
}

/**
 * Registers tweakpane start/end sliders (in seconds) and converts
 * them to Remotion's trimBefore/trimAfter frame props. The folder label
 * is the video filename extracted from src.
 *
 * When the user drags a slider, the player pauses and seeks to the
 * corresponding frame so the user can see exactly where the cut lands.
 * Seeks are debounced to 50ms to avoid flooding the player during
 * continuous dragging.
 *
 * Section offset computation: this component lives inside a Remotion
 * Series.Sequence. useCurrentFrame() returns the frame relative to the
 * sequence, while egakiSDK.getCurrentFrame() returns the absolute
 * composition frame. The difference (absolute - relative) gives the
 * section's start frame in the composition, cached on first render.
 */
function VideoTrimControls(
  props: ComponentProps<typeof MediaVideo> & { mediaDuration: number },
) {
  const { mediaDuration, ...videoProps } = props
  const { fps, durationInFrames: sectionDuration } = useVideoConfig()
  const relativeFrame = useCurrentFrame()

  // Compute the absolute frame offset of this section once on first render.
  // useCurrentFrame() = relative, egakiSDK.getCurrentFrame() = absolute.
  const sectionOffsetRef = useRef<number | null>(null)
  if (sectionOffsetRef.current === null) {
    try {
      const absoluteFrame = window.egakiSDK?.getCurrentFrame() ?? 0
      sectionOffsetRef.current = absoluteFrame - relativeFrame
    } catch {
      sectionOffsetRef.current = 0
    }
  }

  // Use the filename from src as the tweakpane folder label
  const src = typeof props.src === 'string' ? props.src : 'Video'
  const label = src.split('/').pop()?.split('?')[0] || 'Video'

  // Convert any existing trim props (in frames) to seconds for defaults
  const defaultStart = props.trimBefore != null ? props.trimBefore / fps : 0
  const defaultEnd = props.trimAfter != null ? props.trimAfter / fps : mediaDuration

  const tp = useTweakpane(label, {
    start: { value: defaultStart, min: 0, max: mediaDuration, step: 0.1 },
    end: { value: defaultEnd, min: 0, max: mediaDuration, step: 0.1 },
  })

  // Debounced seek: pause the player and seek to the trim point so the
  // user sees the exact frame they're cutting to. Debounce at 50ms so
  // continuous slider dragging doesn't flood the player with seeks.
  const seekTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevTrimStartRef = useRef(tp.start)
  const prevTrimEndRef = useRef(tp.end)

  useEffect(() => {
    const sdk = window.egakiSDK
    if (!sdk) return

    const offset = sectionOffsetRef.current ?? 0
    let targetFrame: number | null = null

    if (tp.start !== prevTrimStartRef.current) {
      // start changed → seek to section start (where source shows start)
      targetFrame = offset
      prevTrimStartRef.current = tp.start
    } else if (tp.end !== prevTrimEndRef.current) {
      // end changed → seek to the section-relative frame where source
      // shows the end point: F = (end - start) * fps - 1
      // Seek away from the cut. Browser/media decoders are often
      // flaky at the exact final decodable frame of a trimmed range, and this
      // seek is only preview feedback; trimAfter itself remains exact.
      const endRelative = Math.round((tp.end - tp.start) * fps) - Math.round(fps * 0.25)
      targetFrame = offset + Math.max(0, Math.min(endRelative, sectionDuration - 1))
      prevTrimEndRef.current = tp.end
    }

    if (targetFrame === null) return

    if (seekTimerRef.current) clearTimeout(seekTimerRef.current)
    const frame = targetFrame
    seekTimerRef.current = setTimeout(() => {
      try {
        sdk.pause()
        sdk.seekTo(Math.max(0, frame))
      } catch {
        // SDK not ready, ignore
      }
    }, 50)

    return () => {
      if (seekTimerRef.current) clearTimeout(seekTimerRef.current)
    }
  }, [tp.start, tp.end, fps, sectionDuration])

  // Convert seconds back to frames for Remotion
  const trimBefore = tp.start > 0 ? Math.round(tp.start * fps) : undefined
  const trimAfter = tp.end < mediaDuration ? Math.round(tp.end * fps) : undefined

  return <MediaVideo {...videoProps} trimBefore={trimBefore} trimAfter={trimAfter} />
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
  children,
}: {
  id: string
  /** Transition duration in frames. Default 20. */
  duration?: number
  /** Spring bounce, 0 = no overshoot, 1 = max. Default 0.15. */
  bounce?: number
  /** Custom easing function. When set, uses interpolate() over `duration`
   *  frames instead of the spring. */
  easing?: (t: number) => number
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const registry = useContext(LayoutRegistryContext)
  const container = useContext(LayoutContainerContext)

  // One stable entry object per component instance. Fields are refreshed
  // on every render (cheap own-ref mutation) so the animation layer always
  // reads current props without re-registration.
  const entryRef = useRef<LayoutEntry | null>(null)
  if (entryRef.current === null) {
    entryRef.current = { id, container, ref, durationInFrames: duration, bounce, easing: easing ?? null }
  }
  entryRef.current.id = id
  entryRef.current.container = container
  entryRef.current.durationInFrames = duration
  entryRef.current.bounce = bounce
  entryRef.current.easing = easing ?? null

  useLayoutEffect(() => {
    if (!registry) return
    return registry.register(entryRef.current!)
  }, [registry])

  // transformOrigin '0 0': FLIP deltas are computed from top-left corners,
  // so the scale component must also originate from the top-left.
  return (
    <div ref={ref} data-layout-id={id} style={{ transformOrigin: '0 0' }}>
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
    const visible = entries.filter((e) => e.container === 'visible')
    const ghosts = entries.filter((e) => e.container === 'ghost')

    // Reset transforms BEFORE measuring: getBoundingClientRect() includes
    // transforms, so measuring a transformed element would compound the
    // previous frame's FLIP offset. This also clears stale transforms once
    // the ghost unmounts (no pairs left).
    for (const e of visible) {
      if (e.ref.current) {
        e.ref.current.style.transform = ''
      }
    }
    if (ghosts.length === 0) return

    const rootRect = rootRef.current?.getBoundingClientRect()
    if (!rootRect || rootRect.width === 0) return
    // Player scale: composition is 1920 wide but rendered smaller/larger
    // in the viewport. Translate deltas are measured in client px and
    // applied in composition px, so divide by this scale. Scale ratios
    // (sx, sy) are dimensionless and unaffected.
    const playerScale = rootRect.width / width

    for (const e of visible) {
      const el = e.ref.current
      if (!el) continue
      const ghost = ghosts.find((g) => g.id === e.id)
      const ghostEl = ghost?.ref.current
      if (!ghostEl) continue

      const progress = e.easing
        ? interpolate(frame, [0, e.durationInFrames], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
            easing: e.easing,
          })
        : dspring(frame, fps, e.durationInFrames / fps, e.bounce)
      if (progress > 0.999) continue

      const from = ghostEl.getBoundingClientRect()
      const to = el.getBoundingClientRect()
      if (to.width === 0 || to.height === 0 || from.width === 0) continue

      // FLIP: at progress 0 the element appears exactly at the ghost
      // (previous section) position/size; at progress 1 it is untransformed.
      const inv = 1 - progress
      const dx = ((from.x - to.x) / playerScale) * inv
      const dy = ((from.y - to.y) / playerScale) * inv
      const sx = 1 + (from.width / to.width - 1) * inv
      const sy = 1 + (from.height / to.height - 1) * inv
      el.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`
    }
  })

  return <AbsoluteFill ref={rootRef} style={{ pointerEvents: 'none' }} />
}

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
  GeneratedAudioProps,
} from './server-components.tsx'
function GeneratedImage(_props: GeneratedImageProps) { return null }
function GeneratedVideo(_props: GeneratedVideoProps) { return null }
function GeneratedAudio(_props: GeneratedAudioProps) { return null }

export const MDX_BUILTIN_COMPONENTS = {
  Background,
  LayoutTransition,
  AngledScreen,
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
  GeneratedImage,
  GeneratedVideo,
  GeneratedAudio,
} as const
