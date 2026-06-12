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
const SCALE = Math.min(1920 / ARTBOARD_W, 1080 / ARTBOARD_H)
const OFFSET_X = (1920 - ARTBOARD_W * SCALE) / 2
const OFFSET_Y = (1080 - ARTBOARD_H * SCALE) / 2

const QUERY = 'Best motion design tool'

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

/**
 * growIn: scale 0→1 with the measured "slowDown" curve bezier(0, 0.5, 0, 1),
 * opacity 0→1 with cubic ease-out (matched renderer alpha exactly).
 */
function growIn(frame: number, fps: number, startMs: number, endMs: number) {
  return {
    scale: interpClamp({ frame, startMs, endMs, from: 0, to: 1, fps, easing: Easing.bezier(0, 0.5, 0, 1) }),
    opacity: interpClamp({ frame, startMs, endMs, from: 0, to: 1, fps, easing: (t) => 1 - (1 - t) ** 3 }),
  }
}

// ---------------------------------------------------------------------------
// Per-letter textIn ("appear" effect: instant typewriter pop, spaces skipped)
// ---------------------------------------------------------------------------

/** Appearance time per character: spaces share the next letter's slot */
const CHAR_START_MS = (() => {
  let nonSpaceIndex = 0
  return QUERY.split('').map((char) => {
    const startMs = 900 + nonSpaceIndex * 50
    if (char !== ' ') nonSpaceIndex += 1
    return startMs
  })
})()

function TypedQuery({ frame, fps }: { frame: number; fps: number }) {
  const timeMs = (frame / fps) * 1000
  return (
    <span style={{ display: 'inline-flex' }}>
      {QUERY.split('').map((char, i) => (
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

  // resize op (400-1100): width 80→640, "natural" easing = exactly CSS `ease`.
  // Center-anchored: the bar center stays at x 340 (bar x 20 + 640/2).
  const barWidth = interpClamp({
    frame,
    startMs: 400,
    endMs: 1100,
    from: 80,
    to: 640,
    fps,
    easing: Easing.bezier(0.25, 0.1, 0.25, 1),
  })
  const barLeft = 340 - barWidth / 2

  // growIn (0-400) and shrinkOut (3200-3500) on the whole bar group.
  // shrinkOut: scale with the measured "accelerate" curve bezier(1, 0, 1, 0.1),
  // opacity with cubic ease-in (matched renderer alpha exactly).
  const grow = growIn(frame, fps, 0, 400)
  const shrinkScale = interpClamp({
    frame, startMs: 3200, endMs: 3500, from: 1, to: 0, fps,
    easing: Easing.bezier(1, 0, 1, 0.1),
  })
  const shrinkOpacity = interpClamp({
    frame, startMs: 3200, endMs: 3500, from: 1, to: 0, fps,
    easing: (t) => t ** 3,
  })

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
        {/* "Search bar" layerGrp (x 20, y 20, 640x80): pill + icon + text scale/fade together */}
        <div
          style={{
            position: 'absolute',
            left: barLeft,
            top: 20,
            width: barWidth,
            height: 80,
            transform: `scale(${grow.scale * shrinkScale})`,
            transformOrigin: 'center center',
            opacity: grow.opacity * shrinkOpacity,
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: '#ffffff',
              borderRadius: 40,
            }}
          />
          {/* Search icon: 40x40 at (20, 20) inside the bar */}
          <img
            src='/search.svg'
            alt=''
            style={{
              position: 'absolute',
              left: 20,
              top: 20,
              width: 40,
              height: 40,
              maxWidth: 'none', // egaki player ships Tailwind preflight (img { max-width: 100% })
              transform: `scale(${icon.scale})`,
              transformOrigin: 'center center',
              opacity: icon.opacity,
            }}
          />
          {/* Text layer: x 80, y 20 inside the bar, Inter 500 24px, lineHeight 166.667% = 40px */}
          <div
            style={{
              position: 'absolute',
              left: 80,
              top: 20,
              height: 40,
              fontSize: 24,
              fontFamily: '"Inter", sans-serif',
              fontWeight: 500,
              lineHeight: '40px',
              color: '#404040',
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
