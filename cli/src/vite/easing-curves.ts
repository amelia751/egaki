/**
 * Easing curve engine for spring/bounce/overshoot presets.
 *
 * Ported from Jitter's easing engine (jitter.video webpack bundle,
 * module 78102). The presets were previously stored as hardcoded sample
 * arrays extracted from Jitter; they are now generated from the same
 * three primitives Jitter uses:
 *
 *   1. Polybezier paths: control points with handles, linearly interpolated
 *      between intensity configs (d3-interpolate semantics), each segment
 *      evaluated with an analytic (Cardano) cubic-bezier y(x) solver.
 *   2. Spring physics (elasticSnap): semi-implicit Euler, step 0.005,
 *      settle epsilon 1e-10, timeline truncated at 34% of settle time.
 *   3. Bounce physics: explicit Euler, step 1, gravity 9.8e-6, velocity
 *      flipped and scaled by bounceFactor when crossing position 100,
 *      capped at 16 bounces.
 *
 * Each `*Samples` export contains 51 evenly-spaced points (t=0 to t=1)
 * per intensity level (0, 25, 50, 75, 100), rounded to 4 decimals exactly
 * like Jitter does. The generated values are verified against the original
 * extracted arrays in easing-curves.test.ts. Values can exceed the 0-1
 * range for overshoot and bounce effects.
 *
 * Porting lessons (do not "simplify" these or the outputs change):
 *   - Lerp must be `a * (1 - t) + b * t` (d3-interpolate form), not
 *     `a + (b - a) * t`, to stay bit-identical with Jitter's output.
 *   - The intensity pair search keeps the LOWER key on distance ties
 *     (strict `<` in the reduce), so intensity 25 lerps configs 0..50.
 *   - Spring acceleration must keep Jitter's exact expression order:
 *     `(-tension * (pos - 100) + -friction * v) / mass`.
 *   - Rounding is `Math.round((x + Number.EPSILON) * 1e4) / 1e4`.
 */

// ---------------------------------------------------------------------------
// Cubic bezier y(x) solver — analytic Cardano roots
// ---------------------------------------------------------------------------

const identity = (e: number) => e

/** Solve the cubic for the bezier parameter via Cardano's formula. */
function cardano(e: number, t: number, n: number, r: number, i: number): number {
  const { cbrt, sqrt, PI } = Math
  const o = t + n * e
  const a = o ** 2 + r
  if (a > 0) {
    const root = sqrt(a)
    return cbrt(o + root) + cbrt(o - root) - i
  }
  const s = cbrt(sqrt(o * o - a))
  const c = o ? Math.atan(sqrt(-a) / o) : -PI / 2
  const u =
    n < 0
      ? (o > 0 ? 2 * PI : PI) - c
      : i < 0
        ? (o > 0 ? 2 * PI : -3 * PI) + c
        : (o > 0 ? 0 : PI) + c
  return 2 * s * Math.cos(u / 3) - i
}

/** Evaluate the cubic bezier polynomial at parameter e. */
const evalCubic = (e: number, t: number, n: number, r: number) =>
  ((t * e + 3 * n) * e + r) * e

/**
 * cubic-bezier(x1, y1, x2, y2) as a y(x) function. x1/x2 must be in [0, 1];
 * y values may exceed [0, 1] for overshoot.
 */
export function cubicBezier(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): (x: number) => number {
  if (!(0 <= x1 && x1 <= 1 && 0 <= x2 && x2 <= 1)) {
    throw new Error('Bezier x values must be in [0, 1] range')
  }
  if (x1 === y1 && x2 === y2) return identity
  const i = 6 * (3 * x1 - 3 * x2 + 1)
  const o = 6 * (x2 - 2 * x1)
  const a = 3 * x1
  const s = i * i
  const c = o * o
  const u = o / i
  const l = (3 * o * a) / s - (c * o) / (s * i)
  const d = (2 * a) / i - c / s
  const f = d * d * d
  const p = 3 / i
  const h = 3 * y1 - 3 * y2 + 1
  const m = y2 - 2 * y1
  const y = 3 * y1
  const solve = i ? cardano : identity
  return (e) =>
    0 === e || 1 === e ? e : evalCubic(solve(e, l, p, f, u), h, m, y)
}

// ---------------------------------------------------------------------------
// Polybezier path: control points with handles
// ---------------------------------------------------------------------------

/** Handle: x is a fraction toward the neighbor anchor, y is in value units. */
export interface HandleXY {
  x: number
  y: number
}

/** A bare number is shorthand for `{ x: number, y: 0 }`. */
export type Handle = number | HandleXY

export interface ControlPoint {
  x: number
  y: number
  /** Handle toward the previous point (incoming). */
  lower?: Handle
  /** Handle toward the next point (outgoing). */
  upper?: Handle
}

function normalizeHandle(h: Handle | undefined): HandleXY | undefined {
  if (h === undefined) return undefined
  return typeof h === 'number' ? { x: h, y: 0 } : h
}

/** Scale a handle fraction by the x-distance to the neighbor anchor. */
function scaleHandle(dx: number, h: Handle | undefined): [number, number] | undefined {
  const n = normalizeHandle(h)
  if (n === undefined) return undefined
  // `+ 0` normalizes -0 (e.g. handle x of 0 scaled by a negative dx), like Jitter.
  return [n.x * dx + 0, n.y * dx + 0]
}

interface PolyPoint {
  p: [number, number]
  lower?: [number, number]
  upper?: [number, number]
}

/** Build a y(x) easing function from polybezier control points. */
export function polybezier(points: ControlPoint[]): (x: number) => number {
  const pts: PolyPoint[] = points.map((pt, n) => {
    const out: PolyPoint = { p: [pt.x, pt.y] }
    const next = points[n + 1]
    const prev = points[n - 1]
    if (n !== 0 && pt.lower !== undefined) {
      out.lower = scaleHandle(prev!.x - pt.x, pt.lower)
    }
    if (n !== points.length - 1 && pt.upper !== undefined) {
      out.upper = scaleHandle(next!.x - pt.x, pt.upper)
    }
    return out
  })

  // One bezier per segment; null when the segment is degenerate (dx or dy 0).
  const segments: (((x: number) => number) | null)[] = []
  {
    let prev = pts[0]!
    for (let o = 1; o < pts.length; o++) {
      const cur = pts[o]!
      const dx = cur.p[0] - prev.p[0]
      const dy = cur.p[1] - prev.p[1]
      const out = prev.upper || [0, 0]
      const inc = cur.lower || [0, 0]
      if (dx && dy) {
        segments.push(cubicBezier(out[0] / dx, out[1] / dy, 1 + inc[0] / dx, 1 + inc[1] / dy))
      } else {
        segments.push(null)
      }
      prev = cur
    }
  }

  return function (x) {
    let before: PolyPoint | undefined
    let point = pts[0]!
    let o = 0
    for (o = 0; o < pts.length; o++) {
      point = pts[o]!
      if (x < point.p[0]) break
      if (x === point.p[0]) return point.p[1]
      before = point
    }
    const anchorX = point.p[0]
    if (!before || x > anchorX) {
      // Extrapolate beyond the endpoints along the boundary handle.
      const handle = (x > anchorX && point.upper) || (x < anchorX && point.lower)
      return (
        point.p[1] +
        (handle && 0 !== handle[1] ? ((x - anchorX) * handle[1]) / handle[0] : 0)
      )
    }
    const segment = segments[o - 1]
    if (!segment) return before.p[1]
    const dx = point.p[0] - before.p[0]
    const dy = point.p[1] - before.p[1]
    return before.p[1] + dy * segment((x - before.p[0]) / dx)
  }
}

// ---------------------------------------------------------------------------
// Intensity interpolation between configs
// ---------------------------------------------------------------------------

interface IntensityPair<T> {
  adjustedIntensity: number
  pair: [T, T]
}

/** Pick the two configs bracketing `t` and the local interpolation factor. */
function findIntensityPair<T>(configs: Record<number, T>, t: number): IntensityPair<T> {
  const keys = Object.keys(configs)
    .map(Number)
    .sort((a, b) => a - b)
  if (keys.length < 2) throw new Error('Too few items to find a pair.')
  // On distance ties the reduce keeps the LOWER key (strict <), matching Jitter.
  const nearest = keys.reduce((e, n) => (Math.abs(n - t) < Math.abs(e - t) ? n : e))
  const o = keys.indexOf(nearest)
  let pair: [number, number]
  if (nearest < t) pair = [nearest, keys[o + 1]!]
  else if (nearest > t) pair = [keys[o - 1]!, nearest]
  else pair = 0 === o ? [nearest, keys[o + 1]!] : [keys[o - 1]!, nearest]
  return {
    adjustedIntensity: (t - pair[0]) / (pair[1] - pair[0]),
    pair: [configs[pair[0]]!, configs[pair[1]]!],
  }
}

/** d3-interpolate number form: a*(1-t) + b*t. Order matters for FP exactness. */
const lerpNumber = (a: number, b: number, t: number) => a * (1 - t) + b * t

function lerpHandle(
  a: HandleXY | undefined,
  b: HandleXY | undefined,
  t: number,
): HandleXY | undefined {
  if (a === undefined || b === undefined) return b
  return { x: lerpNumber(a.x, b.x, t), y: lerpNumber(a.y, b.y, t) }
}

function lerpControlPoints(
  a: ControlPoint[],
  b: ControlPoint[],
  t: number,
): ControlPoint[] {
  return b.map((pb, i) => {
    const pa = a[i]!
    return {
      x: lerpNumber(pa.x, pb.x, t),
      y: lerpNumber(pa.y, pb.y, t),
      lower: lerpHandle(normalizeHandle(pa.lower), normalizeHandle(pb.lower), t),
      upper: lerpHandle(normalizeHandle(pa.upper), normalizeHandle(pb.upper), t),
    }
  })
}

/** An easing preset parameterized by intensity (0-100, continuous). */
export type EasingPreset = (intensity: number) => (t: number) => number

/** Polybezier preset parameterized by intensity. */
export function pathPreset(configs: Record<number, ControlPoint[]>): EasingPreset {
  return (intensity) => {
    const { adjustedIntensity, pair } = findIntensityPair(configs, intensity)
    return polybezier(lerpControlPoints(pair[0], pair[1], adjustedIntensity))
  }
}

// ---------------------------------------------------------------------------
// Physics integration
// ---------------------------------------------------------------------------

interface PhysicsState {
  position: number
  velocity: number
}

interface PhysicsConfig {
  integrationType?: 'semi-implicit' | 'explicit'
  getAcceleration: (position: number, velocity: number) => number
  isFinished: (previous: PhysicsState, current: PhysicsState) => boolean
  applySideEffects?: (state: PhysicsState, step: number) => PhysicsState
  v0: number
  step?: number
  /** Fraction of the simulated timeline mapped onto t in [0, 1]. */
  sliceIndexRatio?: number
  finalPosition?: number
}

/**
 * Integrate a 1D physics simulation and return an easing function that maps
 * t in [0, 1] onto the (possibly truncated) recorded timeline, normalized by
 * the final position.
 */
function physicsEasing(config: PhysicsConfig): (t: number) => number {
  const {
    integrationType = 'semi-implicit',
    getAcceleration,
    isFinished,
    applySideEffects,
    v0,
    step = 1,
    sliceIndexRatio = 1,
  } = config
  const state: PhysicsState = { position: 0, velocity: v0 }
  const timeline: number[] = [0]
  const advance = (dt: number) => {
    const a = getAcceleration(state.position, state.velocity)
    if ('semi-implicit' === integrationType) {
      state.velocity = state.velocity + a * dt
      state.position = state.position + state.velocity * dt
    } else {
      state.position = state.position + state.velocity * dt
      state.velocity = state.velocity + a * dt
    }
    if (applySideEffects !== undefined) {
      const next = applySideEffects(state, dt)
      state.position = next.position
      state.velocity = next.velocity
    }
    timeline.push(state.position)
  }
  let previous: PhysicsState = { ...state }
  for (advance(step); !isFinished(previous, state); ) {
    previous = { ...state }
    advance(step)
  }
  const lastIndex = Math.floor((timeline.length - 1) * sliceIndexRatio)
  const finalPosition = config.finalPosition ?? timeline[timeline.length - 1]!
  return (t) => {
    const idx = t * lastIndex
    const lo = Math.floor(idx)
    let position: number
    if (lo === timeline.length - 1) position = timeline[lo]!
    else {
      const a = timeline[lo]!
      position = a + (timeline[lo + 1]! - a) * (idx - lo)
    }
    return position / finalPosition
  }
}

// ---------------------------------------------------------------------------
// Spring — used by elasticSnap
// ---------------------------------------------------------------------------

export interface SpringPhysicsConfig {
  mass: number
  tension: number
  friction: number
  v0: number
}

const SPRING_TARGET = 100
const SPRING_EPSILON = 1e-10

function springEasing(config: SpringPhysicsConfig): (t: number) => number {
  const { mass, tension, friction, v0 } = config
  return physicsEasing({
    v0,
    getAcceleration: (position, velocity) =>
      (-tension * (position - SPRING_TARGET) + -friction * velocity) / mass,
    isFinished: (previous, current) =>
      Math.abs(current.velocity) < SPRING_EPSILON &&
      Math.abs(current.position - SPRING_TARGET) < SPRING_EPSILON,
    finalPosition: SPRING_TARGET,
    step: 0.005,
    sliceIndexRatio: 0.34,
  })
}

function lerpSpringConfig(
  a: SpringPhysicsConfig,
  b: SpringPhysicsConfig,
  t: number,
): SpringPhysicsConfig {
  return {
    mass: lerpNumber(a.mass, b.mass, t),
    tension: lerpNumber(a.tension, b.tension, t),
    friction: lerpNumber(a.friction, b.friction, t),
    v0: lerpNumber(a.v0, b.v0, t),
  }
}

/** Spring preset parameterized by intensity. */
export function springPreset(configs: Record<number, SpringPhysicsConfig>): EasingPreset {
  return (intensity) => {
    const { adjustedIntensity, pair } = findIntensityPair(configs, intensity)
    return springEasing(lerpSpringConfig(pair[0], pair[1], adjustedIntensity))
  }
}

// ---------------------------------------------------------------------------
// Bounce
// ---------------------------------------------------------------------------

export interface BouncePhysicsConfig {
  mass: number
  /** Fraction of velocity kept (and flipped) at each bounce. */
  bounceFactor: number
  friction: number
  v0: number
}

const BOUNCE_TARGET = 100
const BOUNCE_EPSILON = 1e-4
const GRAVITY = 9.8 / 1e6

function bounceEasing(config: BouncePhysicsConfig): (t: number) => number {
  const { mass, bounceFactor, friction, v0 } = config
  let bounces = 0
  return physicsEasing({
    v0,
    step: 1,
    integrationType: 'explicit',
    finalPosition: BOUNCE_TARGET,
    getAcceleration: (position, velocity) =>
      (GRAVITY * mass + -friction * velocity) / mass,
    isFinished: (previous, current) =>
      (Math.abs(current.velocity) < BOUNCE_EPSILON &&
        Math.abs(current.position - BOUNCE_TARGET) < BOUNCE_EPSILON) ||
      bounces > 15,
    applySideEffects: (state, dt) => {
      const { position, velocity } = state
      if (position < BOUNCE_TARGET) return state
      // Time elapsed since crossing the floor within this step.
      const overshootTime = dt - Math.abs(position - BOUNCE_TARGET) / Math.abs(velocity)
      const bounceVelocity = -velocity * bounceFactor
      bounces += 1
      return {
        position: BOUNCE_TARGET + overshootTime * bounceVelocity,
        velocity: bounceVelocity,
      }
    },
  })
}

function lerpBounceConfig(
  a: BouncePhysicsConfig,
  b: BouncePhysicsConfig,
  t: number,
): BouncePhysicsConfig {
  return {
    mass: lerpNumber(a.mass, b.mass, t),
    bounceFactor: lerpNumber(a.bounceFactor, b.bounceFactor, t),
    friction: lerpNumber(a.friction, b.friction, t),
    v0: lerpNumber(a.v0, b.v0, t),
  }
}

/** Bounce preset parameterized by intensity. */
export function bouncePreset(configs: Record<number, BouncePhysicsConfig>): EasingPreset {
  return (intensity) => {
    const { adjustedIntensity, pair } = findIntensityPair(configs, intensity)
    return bounceEasing(lerpBounceConfig(pair[0], pair[1], adjustedIntensity))
  }
}

// ---------------------------------------------------------------------------
// Sampling
// ---------------------------------------------------------------------------

export type Intensity = 0 | 25 | 50 | 75 | 100

/** Round to 4 decimals like Jitter; normalizes -0 to 0. */
function round4(value: number): number {
  const rounded = Math.round((value + Number.EPSILON) * 1e4) / 1e4
  return rounded === 0 ? 0 : rounded
}

/** Sample a preset at 51 evenly spaced points for all 5 intensity levels. */
export function samplePreset(preset: EasingPreset): Record<Intensity, number[]> {
  const out = {} as Record<Intensity, number[]>
  for (const intensity of [0, 25, 50, 75, 100] as const) {
    const easing = preset(intensity)
    out[intensity] = Array.from({ length: 51 }, (_, i) => round4(easing(i / 50)))
  }
  return out
}

// ---------------------------------------------------------------------------
// Jitter preset configs (verbatim from the bundle)
// ---------------------------------------------------------------------------

/** natural:throw:v1 — anticipate backward, fly past, settle */
export const naturalThrow = pathPreset({
  0: [
    { x: 0, y: 0, upper: 0.6 },
    { x: 0.33, y: -0.1, lower: 0.5, upper: 0.5 },
    { x: 0.67, y: 1.2, lower: 0.2, upper: 0.2 },
    { x: 1, y: 1, lower: 0.7 },
  ],
  50: [
    { x: 0, y: 0, upper: 0.7 },
    { x: 0.33, y: -0.2, lower: 0.8, upper: 0.8 },
    { x: 0.67, y: 1.3, lower: 0.1, upper: 0.1 },
    { x: 1, y: 1, lower: 0.8 },
  ],
  100: [
    { x: 0, y: 0, upper: 0.8 },
    { x: 0.33, y: -0.4, lower: 0.9, upper: 0.9 },
    { x: 0.67, y: 1.5, lower: 0.05, upper: 0.05 },
    { x: 1, y: 1, lower: 0.9 },
  ],
})

/** slowdown:overshoot:v1 — decelerate with a single overshoot */
export const decelerateOvershoot = pathPreset({
  0: [
    { x: 0, y: 0, upper: 0 },
    { x: 0.35, y: 1.1, lower: 0.8, upper: 0.2 },
    { x: 1, y: 1, lower: 0.7 },
  ],
  50: [
    { x: 0, y: 0, upper: 0 },
    { x: 0.3, y: 1.3, lower: 0.8, upper: 0.2 },
    { x: 1, y: 1, lower: 0.7 },
  ],
  100: [
    { x: 0, y: 0, upper: 0 },
    { x: 0.22, y: 1.5, lower: 1, upper: 0.2 },
    { x: 1, y: 1, lower: 0.7 },
  ],
})

/** slowdown:elasticOvershoot:v1 — decelerate with elastic overshoot */
export const decelerateElastic = pathPreset({
  0: [
    { x: 0, y: 0, upper: 0 },
    { x: 0.5, y: 1.1, lower: 0.9, upper: 0.3 },
    { x: 1, y: 1, lower: 0.5 },
  ],
  50: [
    { x: 0, y: 0, upper: 0 },
    { x: 0.5, y: 1.2, lower: 1, upper: 0.4 },
    { x: 1, y: 1, lower: 0.7 },
  ],
  100: [
    { x: 0, y: 0, upper: { x: 0, y: 0.5 } },
    { x: 0.5, y: 1.5, lower: 1, upper: 0.7 },
    { x: 1, y: 1, lower: 0.8 },
  ],
})

/** accelerate:impulse:v1 — dip backward then accelerate away */
export const accelerateImpulse = pathPreset({
  0: [
    { x: 0, y: 0, upper: 0.4 },
    { x: 0.4, y: -0.1, lower: 0.4, upper: 0.7 },
    { x: 1, y: 1, lower: 0 },
  ],
  50: [
    { x: 0, y: 0, upper: 0.4 },
    { x: 0.5, y: -0.2, lower: 0.4, upper: 0.8 },
    { x: 1, y: 1, lower: 0 },
  ],
  100: [
    { x: 0, y: 0, upper: 0.4 },
    { x: 0.63, y: -0.5, lower: 0.4, upper: 1 },
    { x: 1, y: 1, lower: 0 },
  ],
})

/** accelerate:elastic:v1 — elastic windup then accelerate away */
export const accelerateElastic = pathPreset({
  0: [
    { x: 0, y: 0, upper: 0.6 },
    { x: 0.5, y: -0.1, lower: 0.5, upper: 1 },
    { x: 1, y: 1, lower: 0 },
  ],
  50: [
    { x: 0, y: 0, upper: 0.7 },
    { x: 0.5, y: -0.2, lower: 0.6, upper: 1 },
    { x: 1, y: 1, lower: 0 },
  ],
  100: [
    { x: 0, y: 0, upper: 0.8 },
    { x: 0.5, y: -0.5, lower: 0.9, upper: 1 },
    { x: 1, y: 1, lower: { x: 0, y: 0.5 } },
  ],
})

/** elastic:standard:v1 — spring snap with ringing oscillation */
export const elasticSnap = springPreset({
  0: { mass: 1, tension: 80, friction: 12.522, v0: 0 },
  50: { mass: 1, tension: 80, friction: 8.944, v0: 0 },
  100: { mass: 1, tension: 80, friction: 4.472, v0: 0 },
})

/** bounce:standard:v1 — like a ball dropping */
export const bounce = bouncePreset({
  0: { mass: 1, bounceFactor: 0.2, friction: 0, v0: 0 },
  50: { mass: 1, bounceFactor: 0.5, friction: 0, v0: 0 },
  100: { mass: 1, bounceFactor: 0.7, friction: 0, v0: 0 },
})

/** bounce:anticipate:v1 — pull back first, then bounce into place */
export const bounceAnticipate = bouncePreset({
  0: { mass: 20, bounceFactor: 0.7, friction: 0.001, v0: -0.05 },
  100: { mass: 2, bounceFactor: 0.5, friction: 0, v0: -0.05 },
})

/** bounce:throw:v1 — thrown with initial velocity, bounces on landing */
export const bounceThrow = bouncePreset({
  0: { mass: 1, bounceFactor: 0.7, friction: 0, v0: 0.02 },
  100: { mass: 1, bounceFactor: 0.3, friction: 0, v0: 0.1 },
})

/** impulse:standard:v1 — slow dip then gradual release */
export const impulseSlow = pathPreset({
  0: [
    { x: 0, y: 0, upper: 0.3 },
    { x: 0.17, y: -0.05, lower: 0.25, upper: 0.25 },
    { x: 1, y: 1, lower: 0.7 },
  ],
  50: [
    { x: 0, y: 0, upper: 0.35 },
    { x: 0.3, y: -0.2, lower: 0.25, upper: 0.25 },
    { x: 1, y: 1, lower: 0.8 },
  ],
  100: [
    { x: 0, y: 0, upper: 0.5 },
    { x: 0.47, y: -1, lower: 0.25, upper: 0.25 },
    { x: 1, y: 1, lower: 1 },
  ],
})

/** impulseAndOvershoot:standard:v1 — dip backward, overshoot, settle */
export const impulseOvershoot = pathPreset({
  0: [
    { x: 0, y: 0, upper: 0.35 },
    { x: 0.17, y: -0.1, lower: 0.35, upper: 0.4 },
    { x: 0.67, y: 1.05, lower: 0.65, upper: 0.25 },
    { x: 1, y: 1, lower: 0.6 },
  ],
  50: [
    { x: 0, y: 0, upper: 0.35 },
    { x: 0.2, y: -0.2, lower: 0.35, upper: 0.45 },
    { x: 0.6, y: 1.1, lower: 0.75, upper: 0.25 },
    { x: 1, y: 1, lower: 0.6 },
  ],
  100: [
    { x: 0, y: 0, upper: 0.35 },
    { x: 0.27, y: -1, lower: 0.3, upper: 0.6 },
    { x: 0.47, y: 1.5, lower: 0.9, upper: 0.2 },
    { x: 1, y: 1, lower: 0.6 },
  ],
})

/** overshoot:standard:v1 — overshoot then settle back */
export const overshoot = pathPreset({
  0: [
    { x: 0, y: 0, upper: 0 },
    { x: 0.46, y: 1.05, lower: 0.8, upper: 0.2 },
    { x: 1, y: 1, lower: 0.7 },
  ],
  50: [
    { x: 0, y: 0, upper: 0 },
    { x: 0.25, y: 1.2, lower: 0.8, upper: 0.2 },
    { x: 1, y: 1, lower: 0.75 },
  ],
  100: [
    { x: 0, y: 0, upper: 0 },
    { x: 0.15, y: 2, lower: 0.8, upper: 0.1 },
    { x: 1, y: 1, lower: 0.8 },
  ],
})

/** overshoot:elastic:v1 — overshoot with elastic ringing */
export const overshootElastic = pathPreset({
  0: [
    { x: 0, y: 0, upper: 0.5 },
    { x: 0.5, y: 1.1, lower: 0.6, upper: 0.4 },
    { x: 1, y: 1, lower: 0.5 },
  ],
  50: [
    { x: 0, y: 0, upper: 0.7 },
    { x: 0.5, y: 1.2, lower: 0.8, upper: 0.6 },
    { x: 1, y: 1, lower: 0.7 },
  ],
  100: [
    { x: 0, y: 0, upper: 0.8 },
    { x: 0.5, y: 1.5, lower: 0.9, upper: 0.7 },
    { x: 1, y: 1, lower: 0.8 },
  ],
})

/** overshoot:bouncy:v1 — overshoot with a bouncy settle */
export const overshootBouncy = pathPreset({
  0: [
    { x: 0, y: 0, upper: 0.8 },
    { x: 0.5, y: 1.2, lower: 0.4, upper: 0.2 },
    { x: 1, y: 1, lower: 0.6 },
  ],
  50: [
    { x: 0, y: 0, upper: 0.9 },
    { x: 0.5, y: 1.5, lower: 0.2, upper: 0.1 },
    { x: 1, y: 1, lower: 0.7 },
  ],
  100: [
    { x: 0, y: 0, upper: 1 },
    { x: 0.5, y: 1.9, lower: 0.1, upper: 0.05 },
    { x: 1, y: 1, lower: 0.9 },
  ],
})

// ---------------------------------------------------------------------------
// Sampled curves — same data as the previously hardcoded arrays
// ---------------------------------------------------------------------------

export const naturalThrowSamples = samplePreset(naturalThrow)
export const decelerateOvershootSamples = samplePreset(decelerateOvershoot)
export const decelerateElasticSamples = samplePreset(decelerateElastic)
export const accelerateImpulseSamples = samplePreset(accelerateImpulse)
export const accelerateElasticSamples = samplePreset(accelerateElastic)
export const elasticSnapSamples = samplePreset(elasticSnap)
export const bounceSamples = samplePreset(bounce)
export const bounceAnticipateSamples = samplePreset(bounceAnticipate)
export const bounceThrowSamples = samplePreset(bounceThrow)
export const impulseSlowSamples = samplePreset(impulseSlow)
export const impulseOvershootSamples = samplePreset(impulseOvershoot)
export const overshootSamples = samplePreset(overshoot)
export const overshootElasticSamples = samplePreset(overshootElastic)
export const overshootBouncySamples = samplePreset(overshootBouncy)

/** Linearly interpolate a sampled curve at time t (0-1). */
export function lerpSamples(samples: readonly number[], t: number): number {
  const clamped = Math.max(0, Math.min(1, t))
  const idx = clamped * (samples.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.min(lo + 1, samples.length - 1)
  const frac = idx - lo
  return samples[lo]! * (1 - frac) + samples[hi]! * frac
}
