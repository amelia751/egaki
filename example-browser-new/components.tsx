'use client'

/**
 * BrowserNew — recreation of Jitter "Frame 168" (file NbnQviDo0kCroZCbnHZAKe1e).
 *
 * Timeline (ms):
 *   0–1900   background image scale 1→1.25 (linear)
 *   0–1250   browser group scale 0.75→1 + move (−50,−277)→(35,56) (smooth:50)
 *   399+     small URL text letter textIn (appear, travel 20%, slowdown:50)
 *   1750+    zoom browser out so full domain fits in the chrome; URL text stays on mockup
 */

import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import { decelerateEasing, EASE } from 'egaki/video'
import { ARTBOARD, SWAP_MS } from './data'

const ARTBOARD_W = ARTBOARD.width
const ARTBOARD_H = ARTBOARD.height
const COMP_W = 1920
const COMP_H = 1080
const SCALE = Math.min(COMP_W / ARTBOARD_W, COMP_H / ARTBOARD_H)

const BROWSER_GRP_X = -395.451171875
const BROWSER_GRP_Y = 176
const BROWSER_W = 2713
const BROWSER_H = 3104
const BROWSER_CX = BROWSER_W / 2
const BROWSER_CY = BROWSER_H / 2
const URL_LEFT = 1271.708984375
const URL_TOP = 374.76776123046875
const URL_W = 520
const URL_H = 114
const URL_CX = URL_LEFT + URL_W / 2
const URL_CY = URL_TOP + URL_H / 2

const P1_MOVE_X = 35
const P1_MOVE_Y = 56
const P1_SCALE = 1
/** Zoom into omnibox: domain ~full frame width (still inside browser chrome edges). */
const P2_SCALE = 2.55

/** Top-left of browser group so URL center sits at (tx, ty) with scale s (origin: group center). */
function groupPosForUrlAt(tx: number, ty: number, s: number) {
  return {
    gx: tx - BROWSER_CX - (URL_CX - BROWSER_CX) * s,
    gy: ty - BROWSER_CY - (URL_CY - BROWSER_CY) * s,
  }
}

function msToFrame(ms: number, fps: number) {
  return (ms / 1000) * fps
}

function interpClamp(
  frame: number,
  startMs: number,
  endMs: number,
  from: number,
  to: number,
  fps: number,
  easing: (t: number) => number,
) {
  return interpolate(frame, [msToFrame(startMs, fps), msToFrame(endMs, fps)], [from, to], {
    easing,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
}

function letterProgress(timeMs: number, index: number, textInStartMs: number) {
  const start = textInStartMs + index * 180
  const end = start + 867
  if (timeMs <= start) return 0
  if (timeMs >= end) return 1
  const t = (timeMs - start) / (end - start)
  return decelerateEasing(50)(t)
}

function LetterText({
  text,
  timeMs,
  textInStartMs,
  fontSize,
  fontWeight,
  lineHeightPercent,
  left,
  top,
  width,
  height,
}: {
  text: string
  timeMs: number
  textInStartMs: number
  fontSize: number
  fontWeight: number
  lineHeightPercent: number
  left: number
  top: number
  width: number
  height: number
}) {
  const lineHeight = fontSize * (lineHeightPercent / 100)
  const travelPx = fontSize * (20 / 100)

  return (
    <div
      style={{
        position: 'absolute',
        left,
        top,
        minWidth: width,
        width: 'max-content',
        height,
        overflow: 'visible',
        fontFamily: '"Inter", system-ui, sans-serif',
        fontSize,
        fontWeight,
        lineHeight: `${lineHeight}px`,
        color: '#202124',
        letterSpacing: 0,
        whiteSpace: 'nowrap',
      }}
    >
      {text.split('').map((char, i) => {
        const p = letterProgress(timeMs, i, textInStartMs)
        return (
          <span
            key={`${i}-${char}`}
            style={{
              display: 'inline-block',
              transform: `translateY(${travelPx * (1 - p)}px)`,
              opacity: p,
              whiteSpace: char === ' ' ? 'pre' : undefined,
            }}
          >
            {char}
          </span>
        )
      })}
    </div>
  )
}

export function BrowserNew() {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const timeMs = (frame / fps) * 1000
  const phase2 = timeMs >= SWAP_MS

  const bgScale = phase2
    ? 1
    : interpClamp(frame, 0, 1900, 1, 1.25, fps, t => t)

  let groupLeft = BROWSER_GRP_X - 50
  let groupTop = BROWSER_GRP_Y - 277
  let browserScale = 0.75

  if (timeMs > 0 && timeMs < SWAP_MS) {
    const mx = interpClamp(frame, 0, 1250, -50, P1_MOVE_X, fps, EASE.smooth)
    const my = interpClamp(frame, 0, 1250, -277, P1_MOVE_Y, fps, EASE.smooth)
    browserScale = interpClamp(frame, 0, 1250, 0.75, P1_SCALE, fps, EASE.smooth)
    groupLeft = BROWSER_GRP_X + mx
    groupTop = BROWSER_GRP_Y + my
  } else if (phase2) {
    const t = interpClamp(frame, SWAP_MS, SWAP_MS + 600, 0, 1, fps, EASE.smooth)
    const p1UrlX = BROWSER_GRP_X + P1_MOVE_X + BROWSER_CX + (URL_CX - BROWSER_CX) * P1_SCALE
    const p1UrlY = BROWSER_GRP_Y + P1_MOVE_Y + BROWSER_CY + (URL_CY - BROWSER_CY) * P1_SCALE
    const p1 = groupPosForUrlAt(p1UrlX, p1UrlY, P1_SCALE)
    const p2 = groupPosForUrlAt(ARTBOARD_W / 2, ARTBOARD_H * 0.5, P2_SCALE)
    groupLeft = interpolate(t, [0, 1], [p1.gx, p2.gx])
    groupTop = interpolate(t, [0, 1], [p1.gy, p2.gy])
    browserScale = interpolate(t, [0, 1], [P1_SCALE, P2_SCALE])
  }

  return (
    <AbsoluteFill style={{ backgroundColor: '#ffffff' }}>
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500&display=swap"
      />
      <div
        style={{
          position: 'absolute',
          left: (COMP_W - ARTBOARD_W * SCALE) / 2,
          top: (COMP_H - ARTBOARD_H * SCALE) / 2,
          width: ARTBOARD_W,
          height: ARTBOARD_H,
          transform: `scale(${SCALE})`,
          transformOrigin: 'top left',
          overflow: 'hidden',
          backgroundColor: phase2 ? '#ffffff' : ARTBOARD.background,
        }}
      >
        {!phase2 ? (
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: 1920,
              height: 1200,
              overflow: 'hidden',
            }}
          >
            <img
              src="/images/background.png"
              alt=""
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                width: 1920,
                height: 1200,
                maxWidth: 'none',
                transform: `translate(-50%, -50%) scale(${bgScale})`,
                transformOrigin: 'center center',
                objectFit: 'cover',
              }}
            />
          </div>
        ) : null}

        <div
          style={{
            position: 'absolute',
            left: groupLeft,
            top: groupTop,
            width: BROWSER_W,
            height: BROWSER_H,
            transform: `scale(${browserScale})`,
            transformOrigin: 'center center',
          }}
        >
          <img
            src="/images/browser.png"
            alt=""
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: BROWSER_W,
              height: BROWSER_H,
              maxWidth: 'none',
            }}
          />
          <LetterText
            text="jitter.new"
            timeMs={timeMs}
            textInStartMs={399.33333333337214}
            fontSize={96.88195037841797}
            fontWeight={400}
            lineHeightPercent={116.66666}
            left={URL_LEFT}
            top={URL_TOP}
            width={URL_W}
            height={URL_H}
          />
        </div>
      </div>
    </AbsoluteFill>
  )
}