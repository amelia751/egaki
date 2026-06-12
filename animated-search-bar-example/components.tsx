'use client'

/**
 * AnimatedSearchBar — recreation of the Jitter "Animated Search Bar" template.
 *
 * Extracted from Jitter project HW8zKOEcZe3bI6ueRRRcAfb0 via Playwriter
 * (window.app scene graph) — horizontal "Search" artboard only (680x120,
 * 4000ms, transparent background). A white pill search bar grows in as a
 * circle, expands from the center to full width, a search icon pops in,
 * the query "Best motion design tool" types in letter by letter, then the
 * whole bar shrinks away.
 *
 * Operations timeline (ms):
 *   0-400      growIn  Search bar  (scale 0→1 + fade, easing "slowDown")
 *   100-500    growIn  Search icon (same behavior)
 *   400-1100   resize  Search bar width 80→640, anchor center ("natural")
 *   900-1850   textIn  typewriter: letters pop in, 50ms apart, spaces skipped
 *   3200-3500  shrinkOut Search bar (scale 1→0 + fade, "accelerate")
 *
 * Easings were measured from Jitter's /api/renderer/ output (50ms and 10ms
 * frame sweeps, alpha-bbox + per-letter ink darkness), then fit numerically:
 *   - resize "natural"      → cubic-bezier(0.25, 0.1, 0.25, 1)  (CSS `ease`)
 *   - growIn "slowDown"     → scale cubic-bezier(0, 0.5, 0, 1), opacity 1-(1-t)^3
 *   - shrinkOut "accelerate"→ scale cubic-bezier(1, 0, 1, 0.1), opacity t^3
 * The opacity power curves matched the measured center alpha exactly at
 * every sample point; the bezier fits have rmse < 0.02 against the
 * measured bar widths/scales.
 *
 * textIn gotcha: although the op stores nodeDuration 500 / travelDistance 20 /
 * slideDirection "up", the renderer output shows letters jumping from 0 to
 * full opacity within 10ms with NO vertical travel — effect "appear" is a
 * plain typewriter. Letter i appears at 900 + nonSpaceIndex(i) * 50 ms
 * (spaces get no stagger slot: "d" of "design" pops 50ms after "n" of
 * "motion"). Measured: m@1100, o@1150 ... l@1850, one letter per 50ms.
 */

import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion'

// ---------------------------------------------------------------------------
// Layout: scale the 680x120 artboard to fit the 1920x1080 composition
// ---------------------------------------------------------------------------

const ARTBOARD_W = 680
const ARTBOARD_H = 120
const COMP_W = 1920
const COMP_H = 1080
const SCALE = Math.min(COMP_W / ARTBOARD_W, COMP_H / ARTBOARD_H)
const OFFSET_X = (COMP_W - ARTBOARD_W * SCALE) / 2
const OFFSET_Y = (COMP_H - ARTBOARD_H * SCALE) / 2

// ---------------------------------------------------------------------------
// Scene constants (Jitter artboard coordinates)
// ---------------------------------------------------------------------------

/** "Search bar" layerGrp: x 20, y 20, 640x80, radius 40, fill #ffffff */
const BAR = { x: 20, y: 20, width: 640, height: 80, radius: 40, color: '#ffffff' }
/** Bar center never moves: resize is center-anchored */
const BAR_CENTER_X = BAR.x + BAR.width / 2
/** resize op fromValue: bar starts as an 80px-wide circle */
const BAR_START_WIDTH = 80

/** Search icon: 40x40 at (20, 20) inside the bar */
const ICON = { x: 20, y: 20, size: 40 }

/** Text layer: x 80, y 20 inside the bar, Inter 500 24px, lh 166.667% */
const TEXT = {
  value: 'Best motion design tool',
  x: 80,
  y: 20,
  height: 40,
  fontSize: 24,
  color: '#404040',
  fontFamily: '"Inter", sans-serif',
  fontWeight: 500,
  lineHeight: 40, // 24px * 166.66667%
}

/** textIn op: typewriter pop, 50ms per non-space letter (see header comment) */
const TEXT_IN = { startMs: 900, staggerMs: 50 }

// ---------------------------------------------------------------------------
// Easings (measured + fit, see header comment)
// ---------------------------------------------------------------------------

/** "natural" on the resize op — exactly CSS `ease` */
const resizeEase = Easing.bezier(0.25, 0.1, 0.25, 1)
/** "slowDown" scale curve on growIn ops and textIn nodeEasing */
const slowDownEase = Easing.bezier(0, 0.5, 0, 1)
/** "accelerate" scale curve on shrinkOut */
const accelerateEase = Easing.bezier(1, 0, 1, 0.1)
/** growIn opacity: cubic ease-out (matched renderer alpha exactly) */
const cubicOut = (t: number) => 1 - (1 - t) ** 3
/** shrinkOut opacity: cubic ease-in (matched renderer alpha exactly) */
const cubicIn = (t: number) => t ** 3

// ---------------------------------------------------------------------------
// Animation helpers
// ---------------------------------------------------------------------------

function msToFrame(ms: number, fps: number) {
  return (ms / 1000) * fps
}

function interpClamp({
  frame,
  startMs,
  endMs,
  from,
  to,
  fps,
  easing,
}: {
  frame: number
  startMs: number
  endMs: number
  from: number
  to: number
  fps: number
  easing: (t: number) => number
}) {
  return interpolate(frame, [msToFrame(startMs, fps), msToFrame(endMs, fps)], [from, to], {
    easing,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
}

/** growIn: scale 0→1 (slowDown) + opacity 0→1 (cubic out) over [startMs, endMs] */
function growIn(frame: number, fps: number, startMs: number, endMs: number) {
  return {
    scale: interpClamp({ frame, startMs, endMs, from: 0, to: 1, fps, easing: slowDownEase }),
    opacity: interpClamp({ frame, startMs, endMs, from: 0, to: 1, fps, easing: cubicOut }),
  }
}

/** shrinkOut: scale 1→0 (accelerate) + opacity 1→0 (cubic in) over [startMs, endMs] */
function shrinkOut(frame: number, fps: number, startMs: number, endMs: number) {
  return {
    scale: interpClamp({ frame, startMs, endMs, from: 1, to: 0, fps, easing: accelerateEase }),
    opacity: interpClamp({ frame, startMs, endMs, from: 1, to: 0, fps, easing: cubicIn }),
  }
}

// ---------------------------------------------------------------------------
// Per-letter textIn ("appear" effect: instant typewriter pop, spaces skipped)
// ---------------------------------------------------------------------------

/** Appearance time per character: spaces share the next letter's slot */
const CHAR_START_MS = (() => {
  let nonSpaceIndex = 0
  return TEXT.value.split('').map((char) => {
    const startMs = TEXT_IN.startMs + nonSpaceIndex * TEXT_IN.staggerMs
    if (char !== ' ') nonSpaceIndex += 1
    return startMs
  })
})()

function TypedQuery({ frame, fps }: { frame: number; fps: number }) {
  const timeMs = (frame / fps) * 1000
  return (
    <span style={{ display: 'inline-flex' }}>
      {TEXT.value.split('').map((char, i) => (
        <span
          key={i}
          style={{
            display: 'inline-block',
            opacity: timeMs >= CHAR_START_MS[i] ? 1 : 0,
            whiteSpace: char === ' ' ? 'pre' : undefined,
          }}
        >
          {char}
        </span>
      ))}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AnimatedSearchBar() {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  // resize: width 80→640, center-anchored (bar center stays at x 340)
  const barWidth = interpClamp({
    frame,
    startMs: 400,
    endMs: 1100,
    from: BAR_START_WIDTH,
    to: BAR.width,
    fps,
    easing: resizeEase,
  })
  const barLeft = BAR_CENTER_X - barWidth / 2

  // growIn (0-400) and shrinkOut (3200-3500) on the whole bar group
  const grow = growIn(frame, fps, 0, 400)
  const shrink = shrinkOut(frame, fps, 3200, 3500)
  const barScale = grow.scale * shrink.scale
  const barOpacity = grow.opacity * shrink.opacity

  // icon growIn (100-500), scales from its own center on top of the group scale
  const icon = growIn(frame, fps, 100, 500)

  return (
    <AbsoluteFill>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@500&display=swap');`}</style>
      {/* Artboard, scaled to fit the composition */}
      <div
        style={{
          position: 'absolute',
          left: OFFSET_X,
          top: OFFSET_Y,
          width: ARTBOARD_W,
          height: ARTBOARD_H,
          transform: `scale(${SCALE})`,
          transformOrigin: 'top left',
        }}
      >
        {/* Search bar group: white pill + icon + text scale/fade together */}
        <div
          style={{
            position: 'absolute',
            left: barLeft,
            top: BAR.y,
            width: barWidth,
            height: BAR.height,
            transform: `scale(${barScale})`,
            transformOrigin: 'center center',
            opacity: barOpacity,
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: BAR.color,
              borderRadius: BAR.radius,
            }}
          />
          <img
            src='/search.svg'
            alt=''
            style={{
              position: 'absolute',
              left: ICON.x,
              top: ICON.y,
              width: ICON.size,
              height: ICON.size,
              maxWidth: 'none', // egaki player ships Tailwind preflight (img { max-width: 100% })
              transform: `scale(${icon.scale})`,
              transformOrigin: 'center center',
              opacity: icon.opacity,
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: TEXT.x,
              top: TEXT.y,
              height: TEXT.height,
              fontSize: TEXT.fontSize,
              fontFamily: TEXT.fontFamily,
              fontWeight: TEXT.fontWeight,
              lineHeight: `${TEXT.lineHeight}px`,
              color: TEXT.color,
              whiteSpace: 'nowrap',
            }}
          >
            <TypedQuery frame={frame} fps={fps} />
          </div>
        </div>
      </div>
    </AbsoluteFill>
  )
}
