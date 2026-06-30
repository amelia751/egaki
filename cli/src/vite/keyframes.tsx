/**
 * keyframes() — evaluate a keyframed animation at a given frame.
 *
 * Accepts an array of typed keyframe descriptors with bezier easing, hold,
 * and per-dimension control. Wraps Remotion's interpolate() + cubicBezier()
 * so you get the full Lottie/After Effects easing model with clean parameters.
 *
 * Also includes fromLottieProperty() for converting raw Lottie animated
 * properties to the Keyframe[] format, and extractLottieDimensionEasing()
 * for per-dimension easing overrides.
 *
 * See docs/lottie-to-remotion.md for the Lottie field mapping.
 */

import { interpolate } from 'remotion'
import { cubicBezier } from './easing-curves.ts'

// ---------------------------------------------------------------------------
// Types
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

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

// Step easing: holds at 0 until t=1, then jumps to 1
function stepEasing(t: number): number {
  return t < 1 ? 0 : 1
}

function buildEasingFn(curve: BezierCurve | undefined): (t: number) => number {
  if (!curve) return (t: number) => t // linear
  return cubicBezier(curve[0], curve[1], curve[2], curve[3])
}

// ---------------------------------------------------------------------------
// keyframes() — main API
// ---------------------------------------------------------------------------

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
// Lottie conversion utilities
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
