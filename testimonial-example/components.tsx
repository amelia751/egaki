'use client'

/**
 * TestimonialCard — recreation of a Jitter testimonial template (16:10).
 *
 * A 1920x1200 artboard scaled to fit the 1920x1080 composition. A cyan
 * frame holds a photo that zooms out from 1.5x while a frosted glass card
 * shrinks from 1150x910 to 675x392. Quote text slides in word by word
 * (masked), a portrait bubble reveals with a center-anchored mask resize,
 * and a heart icon "fills" via a circular mask while the card pulses 1.1x.
 *
 * Easings are exact Jitter curves: smooth:standard:v1 at intensity 50 is
 * cubic-bezier(0.5, 0, 0, 1); impulseAndOvershoot:standard:v1 at the
 * non-standard intensities 96 and 71 is reproduced by linearly blending
 * egaki's sampled curves between adjacent intensity levels (50/75/100),
 * matching Jitter's intensity-continuous springs.
 */

import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import { impulseOvershootSamples, lerpSamples } from 'egaki/video'
import {
  ARTBOARD,
  AUTHOR_TEXT,
  BG_VISUAL,
  BODY_LINE_HEIGHT,
  CARD,
  CARD_BLUR_IMAGE,
  FONT_FAMILY,
  HEART,
  HEART_PATH,
  LOGO,
  PORTRAIT,
  QUOTE_MARK,
  QUOTE_TEXT,
  URL_TEXT,
} from './data'

// ---------------------------------------------------------------------------
// Layout: scale 1920x1200 artboard to fit 1920x1080
// ---------------------------------------------------------------------------

const COMP_W = 1920
const COMP_H = 1080

const SCALE = Math.min(COMP_W / ARTBOARD.width, COMP_H / ARTBOARD.height)
const OFFSET_X = (COMP_W - ARTBOARD.width * SCALE) / 2
const OFFSET_Y = (COMP_H - ARTBOARD.height * SCALE) / 2

// ---------------------------------------------------------------------------
// Easings
// ---------------------------------------------------------------------------

/** smooth:standard:v1 @ intensity 50 */
const smooth50 = Easing.bezier(0.5, 0, 0, 1)

/**
 * impulseAndOvershoot:standard:v1 at an arbitrary intensity (0-100).
 * Blends the two adjacent sampled curves (steps of 25) linearly, which
 * reproduces Jitter's continuous intensity dial within sampling error.
 */
function impulseOvershootAt(intensity: number): (t: number) => number {
  const levels = [0, 25, 50, 75, 100] as const
  const lo = levels.filter((l) => l <= intensity).pop() ?? 0
  const hi = levels.find((l) => l >= intensity) ?? 100
  const f = hi === lo ? 0 : (intensity - lo) / (hi - lo)
  const a = impulseOvershootSamples[lo]
  const b = impulseOvershootSamples[hi]
  return (t) => lerpSamples(a, t) * (1 - f) + lerpSamples(b, t) * f
}

const impulseOvershoot96 = impulseOvershootAt(CARD.scaleUp.intensity)
const impulseOvershoot71 = impulseOvershootAt(HEART.groupScale.intensity)

// ---------------------------------------------------------------------------
// Animation helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Card geometry — shared by the blur mask and the white overlay
// ---------------------------------------------------------------------------

function cardRect(frame: number, fps: number) {
  const resizeP = interpClamp(frame, CARD.resize.startMs, CARD.resize.endMs, 0, 1, fps, smooth50)
  const scaleUp = interpClamp(
    frame,
    CARD.scaleUp.startMs,
    CARD.scaleUp.endMs,
    CARD.scaleUp.from,
    CARD.scaleUp.to,
    fps,
    impulseOvershoot96,
  )
  const w = (CARD.fromWidth + (CARD.toWidth - CARD.fromWidth) * resizeP) * scaleUp
  const h = (CARD.fromHeight + (CARD.toHeight - CARD.fromHeight) * resizeP) * scaleUp
  return {
    left: CARD.centerX - w / 2,
    top: CARD.centerY - h / 2,
    width: w,
    height: h,
    radius: CARD.cornerRadius * scaleUp,
  }
}

// ---------------------------------------------------------------------------
// Background visual + frosted card
// ---------------------------------------------------------------------------

function BackgroundVisual({ frame, fps }: { frame: number; fps: number }) {
  const scale = interpClamp(frame, 0, 1490, 1.5, 1, fps, smooth50)
  return (
    <img
      src={BG_VISUAL.src}
      style={{
        position: 'absolute',
        left: BG_VISUAL.x,
        top: BG_VISUAL.y,
        width: BG_VISUAL.width,
        height: BG_VISUAL.height,
        maxWidth: 'none', // egaki player ships Tailwind preflight (img { max-width: 100% })
        transform: `scale(${scale})`,
        transformOrigin: 'center center',
      }}
    />
  )
}

function FrostedCard({ frame, fps }: { frame: number; fps: number }) {
  const rect = cardRect(frame, fps)
  const imgScale = interpClamp(frame, 0, 1490, 1.5, 1, fps, smooth50)

  return (
    <>
      {/* Blurred copy of the visual, masked by the card rect */}
      <div
        style={{
          position: 'absolute',
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          borderRadius: rect.radius,
          overflow: 'hidden',
        }}
      >
        <img
          src={CARD_BLUR_IMAGE.src}
          style={{
            position: 'absolute',
            left: CARD_BLUR_IMAGE.x - rect.left,
            top: CARD_BLUR_IMAGE.y - rect.top,
            width: CARD_BLUR_IMAGE.width,
            height: CARD_BLUR_IMAGE.height,
            maxWidth: 'none',
            filter: `blur(${CARD_BLUR_IMAGE.blurPx}px)`,
            transform: `scale(${imgScale})`,
            transformOrigin: 'center center',
          }}
        />
      </div>
      {/* White overlay at 13% */}
      <div
        style={{
          position: 'absolute',
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          borderRadius: rect.radius,
          backgroundColor: CARD.overlayColor,
          opacity: CARD.overlayOpacity,
        }}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Word-by-word slideAndMask text (Jitter textIn op)
// ---------------------------------------------------------------------------

function MaskedWordsText({
  text,
  startMs,
  nodeDurationMs,
  offsetMs,
  frame,
  fps,
}: {
  text: string
  startMs: number
  nodeDurationMs: number
  offsetMs: number
  frame: number
  fps: number
}) {
  return (
    <>
      {text.split(' ').map((word, i) => {
        const wordStartMs = startMs + i * offsetMs
        const progress = interpClamp(frame, wordStartMs, wordStartMs + nodeDurationMs, 0, 1, fps, smooth50)
        return (
          <span key={i}>
            <span
              style={{
                display: 'inline-block',
                overflow: 'hidden',
                verticalAlign: 'top',
              }}
            >
              <span
                style={{
                  display: 'inline-block',
                  transform: `translateY(${(1 - progress) * 100}%)`,
                }}
              >
                {word}
              </span>
            </span>
            {i < text.split(' ').length - 1 ? ' ' : null}
          </span>
        )
      })}
    </>
  )
}

// ---------------------------------------------------------------------------
// Heart — outline fade-in, then a circular mask reveals the filled heart
// ---------------------------------------------------------------------------

function Heart({ frame, fps }: { frame: number; fps: number }) {
  const groupScale = interpClamp(
    frame,
    HEART.groupScale.startMs,
    HEART.groupScale.endMs,
    HEART.groupScale.from,
    HEART.groupScale.to,
    fps,
    impulseOvershoot71,
  )
  const outlineOpacity = interpClamp(
    frame,
    HEART.outlineFade.startMs,
    HEART.outlineFade.endMs,
    HEART.outlineFade.from,
    HEART.outlineFade.to,
    fps,
    (t) => t,
  )
  const maskP = interpClamp(frame, HEART.maskScale.startMs, HEART.maskScale.endMs, 0, 1, fps, smooth50)
  const maskSize = HEART.size * maskP
  const maskOffset = (HEART.size - maskSize) / 2

  const heartSvg = (fill: string) => (
    <svg
      width={HEART.svg.width}
      height={HEART.svg.height}
      viewBox={`0 0 ${HEART.svg.width} ${HEART.svg.height}`}
      style={{ position: 'absolute', left: HEART.svg.x - 0, top: HEART.svg.y - 0 }}
    >
      <path d={HEART_PATH} fill={fill} />
    </svg>
  )

  return (
    <div
      style={{
        position: 'absolute',
        left: HEART.x,
        top: HEART.y,
        width: HEART.size,
        height: HEART.size,
        transform: `scale(${groupScale})`,
        transformOrigin: 'center center',
      }}
    >
      {/* Outline heart, fades 0 → 50% */}
      <div style={{ position: 'absolute', inset: 0, opacity: outlineOpacity }}>{heartSvg(HEART.outlineColor)}</div>
      {/* Filling heart revealed by a circle growing from center */}
      <div
        style={{
          position: 'absolute',
          left: maskOffset,
          top: maskOffset,
          width: maskSize,
          height: maskSize,
          borderRadius: '50%',
          overflow: 'hidden',
        }}
      >
        <svg
          width={HEART.svg.width}
          height={HEART.svg.height}
          viewBox={`0 0 ${HEART.svg.width} ${HEART.svg.height}`}
          style={{ position: 'absolute', left: HEART.svg.x - maskOffset, top: HEART.svg.y - maskOffset }}
        >
          <path d={HEART_PATH} fill={HEART.fillColor} />
        </svg>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Portrait bubble — mask rect resizes 0 → 72x72 from center
// ---------------------------------------------------------------------------

function PortraitBubble({ frame, fps }: { frame: number; fps: number }) {
  const p = interpClamp(frame, PORTRAIT.maskResize.startMs, PORTRAIT.maskResize.endMs, 0, 1, fps, smooth50)
  const size = PORTRAIT.size * p
  const offset = (PORTRAIT.size - size) / 2

  return (
    <div
      style={{
        position: 'absolute',
        left: PORTRAIT.x,
        top: PORTRAIT.y,
        width: PORTRAIT.size,
        height: PORTRAIT.size,
        borderRadius: PORTRAIT.outerRadius,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: offset,
          top: offset,
          width: size,
          height: size,
          borderRadius: PORTRAIT.maskRadius,
          overflow: 'hidden',
        }}
      >
        <img
          src={PORTRAIT.src}
          style={{
            position: 'absolute',
            left: PORTRAIT.img.x - offset,
            top: PORTRAIT.img.y - offset,
            width: PORTRAIT.img.width,
            height: PORTRAIT.img.height,
            maxWidth: 'none',
          }}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Static chrome — Mango logo and URL
// ---------------------------------------------------------------------------

function LogoAndUrl() {
  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: LOGO.x,
          top: LOGO.y,
          width: LOGO.width,
          height: LOGO.height,
          overflow: 'hidden',
        }}
      >
        <div style={{ position: 'absolute', left: 0, top: LOGO.groupY }}>
          {LOGO.vectors.map((v, i) => (
            <img
              key={i}
              src={v.src}
              style={{ position: 'absolute', left: v.x, top: v.y, width: v.width, height: v.height, maxWidth: 'none' }}
            />
          ))}
        </div>
      </div>
      <div
        style={{
          position: 'absolute',
          left: URL_TEXT.x,
          top: URL_TEXT.y,
          width: URL_TEXT.width,
          fontSize: URL_TEXT.fontSize,
          lineHeight: `${URL_TEXT.lineHeight}px`,
          color: URL_TEXT.color,
          fontFamily: FONT_FAMILY,
          textAlign: 'right',
        }}
      >
        {URL_TEXT.text}
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Main composition
// ---------------------------------------------------------------------------

export function TestimonialCard() {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const quoteMarkOpacity = interpClamp(
    frame,
    QUOTE_MARK.fade.startMs,
    QUOTE_MARK.fade.endMs,
    0,
    1,
    fps,
    (t) => t,
  )

  return (
    <AbsoluteFill style={{ backgroundColor: '#ffffff' }}>
      <style>{`
        @font-face {
          font-family: '${FONT_FAMILY}';
          src: url('/fonts/helvetica-now-display-medium.otf') format('opentype');
          font-weight: 500;
        }
      `}</style>

      {/* Scaled artboard container */}
      <div
        style={{
          position: 'absolute',
          left: OFFSET_X,
          top: OFFSET_Y,
          width: ARTBOARD.width,
          height: ARTBOARD.height,
          transform: `scale(${SCALE})`,
          transformOrigin: 'top left',
          overflow: 'hidden',
          backgroundColor: ARTBOARD.fillColor,
          fontFamily: FONT_FAMILY,
        }}
      >
        <BackgroundVisual frame={frame} fps={fps} />
        <FrostedCard frame={frame} fps={fps} />

        {/* Quote mark “ */}
        <div
          style={{
            position: 'absolute',
            left: QUOTE_MARK.x,
            top: QUOTE_MARK.y,
            width: QUOTE_MARK.width,
            fontSize: QUOTE_MARK.fontSize,
            lineHeight: `${BODY_LINE_HEIGHT}px`,
            color: QUOTE_MARK.color,
            opacity: quoteMarkOpacity,
          }}
        >
          {QUOTE_MARK.text}
        </div>

        {/* Quote text — word by word slideAndMask */}
        <div
          style={{
            position: 'absolute',
            left: QUOTE_TEXT.x,
            top: QUOTE_TEXT.y,
            width: QUOTE_TEXT.width,
            fontSize: QUOTE_TEXT.fontSize,
            lineHeight: `${BODY_LINE_HEIGHT}px`,
            color: QUOTE_TEXT.color,
          }}
        >
          <MaskedWordsText
            text={QUOTE_TEXT.text}
            startMs={QUOTE_TEXT.textIn.startMs}
            nodeDurationMs={QUOTE_TEXT.textIn.nodeDurationMs}
            offsetMs={QUOTE_TEXT.textIn.offsetMs}
            frame={frame}
            fps={fps}
          />
        </div>

        {/* Author text */}
        <div
          style={{
            position: 'absolute',
            left: AUTHOR_TEXT.x,
            top: AUTHOR_TEXT.y,
            width: AUTHOR_TEXT.width,
            fontSize: AUTHOR_TEXT.fontSize,
            lineHeight: `${BODY_LINE_HEIGHT}px`,
            color: AUTHOR_TEXT.color,
          }}
        >
          <MaskedWordsText
            text={AUTHOR_TEXT.text}
            startMs={AUTHOR_TEXT.textIn.startMs}
            nodeDurationMs={AUTHOR_TEXT.textIn.nodeDurationMs}
            offsetMs={AUTHOR_TEXT.textIn.offsetMs}
            frame={frame}
            fps={fps}
          />
        </div>

        <Heart frame={frame} fps={fps} />
        <PortraitBubble frame={frame} fps={fps} />
        <LogoAndUrl />
      </div>
    </AbsoluteFill>
  )
}
