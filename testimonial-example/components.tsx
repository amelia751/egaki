'use client'

/**
 * TestimonialCard — recreation of a Jitter testimonial template (16:10).
 *
 * Extracted from Jitter project NJD34P7zgZCeXpFAJ6dorIdf via Playwriter
 * (window.app scene graph). A 1920x1200 artboard scaled to fit the 1920x1080
 * composition. A cyan frame holds a photo that zooms out from 1.5x while a
 * frosted glass card shrinks from 1150x910 to 675x392. Quote text slides in
 * word by word (masked), a portrait bubble reveals with a center-anchored
 * mask resize, and a heart icon "fills" via a circular mask while the card
 * pulses 1.1x.
 *
 * Operations timeline (ms):
 *   0-1490     bg image scale 1.5→1, card resize 1150x910→675x392 (smooth:50)
 *   500-...    quote textIn, words slide up masked (607ms/word, 61ms stagger)
 *   752-982    quote mark “ fades in (linear)
 *   1262-2062  portrait mask resize 0→72x72 (smooth:50)
 *   1262-1772  outline heart opacity 0→50% (linear)
 *   1490-...   author textIn, same word params
 *   1632-3572  card scale 1→1.1 (impulseAndOvershoot:96)
 *   1732-3672  heart group scale 0.8→1 (impulseAndOvershoot:71)
 *   2125-3210  filling-heart circular mask scale 0→1 (smooth:50)
 *
 * Easings are exact Jitter curves: smooth:standard:v1 at intensity 50 is
 * cubic-bezier(0.5, 0, 0, 1); impulseAndOvershoot:standard:v1 at the
 * non-standard intensities 96 and 71 is reproduced by linearly blending
 * egaki's sampled curves between adjacent intensity levels (50/75/100),
 * matching Jitter's intensity-continuous springs.
 */

import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import { impulseOvershootSamples, lerpSamples } from 'egaki/video'

// ---------------------------------------------------------------------------
// Shared constants (everything used once is inlined at its use site)
// ---------------------------------------------------------------------------

// Layout: scale the 1920x1200 artboard to fit the 1920x1080 composition
const ARTBOARD_W = 1920
const ARTBOARD_H = 1200
const COMP_W = 1920
const COMP_H = 1080
const SCALE = Math.min(COMP_W / ARTBOARD_W, COMP_H / ARTBOARD_H)
const OFFSET_X = (COMP_W - ARTBOARD_W * SCALE) / 2
const OFFSET_Y = (COMP_H - ARTBOARD_H * SCALE) / 2

const FONT_FAMILY = 'HelveticaNowDisplay-Medium'

/** lineHeight 108.79% of 32px font */
const BODY_LINE_HEIGHT = 32 * 1.0879171752929688

/** Per-word textIn params, shared by quote and author texts */
const WORD_DURATION_MS = 607
const WORD_STAGGER_MS = 61

const HEART_PATH =
  'M16.6832 31.5349C16.995 31.5349 17.4237 31.3377 17.7367 31.1469C27.132 25.0575 33.3666 18.048 33.3666 10.9136C33.3666 5.05425 29.3334 0.890625 24.0526 0.890625C20.8466 0.890625 18.1564 2.7026 16.6832 5.4958C15.2337 2.71442 12.5198 0.890625 9.31379 0.890625C4.03315 0.890625 0 5.05425 0 10.9136C0 18.048 6.23447 25.0575 15.6363 31.1469C15.9427 31.3377 16.3714 31.5349 16.6832 31.5349Z'

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

const impulseOvershoot96 = impulseOvershootAt(96)
const impulseOvershoot71 = impulseOvershootAt(71)

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

// ---------------------------------------------------------------------------
// Card geometry — shared by the blur mask and the white overlay.
// Center (960.5, 600) stays fixed while the card resizes 1150x910 → 675x392,
// then the whole rect pulses to 1.1x via animated width/height/radius (not
// transform, so card content stays put — matches Jitter's resize op).
// ---------------------------------------------------------------------------

function cardRect(frame: number, fps: number) {
  const resizeP = interpClamp({ frame, startMs: 0, endMs: 1490, from: 0, to: 1, fps, easing: smooth50 })
  const scaleUp = interpClamp({ frame, startMs: 1632, endMs: 3572, from: 1, to: 1.1, fps, easing: impulseOvershoot96 })
  const w = (1150 + (675 - 1150) * resizeP) * scaleUp
  const h = (910 + (392 - 910) * resizeP) * scaleUp
  return {
    left: 960.5 - w / 2,
    top: 600 - h / 2,
    width: w,
    height: h,
    radius: 103 * scaleUp,
  }
}

// ---------------------------------------------------------------------------
// Background visual + frosted card
// ---------------------------------------------------------------------------

/** Full-bleed background image (z bottom). Scale 1.5→1 from its own center. */
function BackgroundVisual({ frame, fps }: { frame: number; fps: number }) {
  const scale = interpClamp({ frame, startMs: 0, endMs: 1490, from: 1.5, to: 1, fps, easing: smooth50 })
  return (
    <img
      src='/images/visual.jpg'
      style={{
        position: 'absolute',
        left: -11,
        top: -602,
        width: 1943,
        height: 2315,
        maxWidth: 'none', // egaki player ships Tailwind preflight (img { max-width: 100% })
        transform: `scale(${scale})`,
        transformOrigin: 'center center',
      }}
    />
  )
}

function FrostedCard({ frame, fps }: { frame: number; fps: number }) {
  const rect = cardRect(frame, fps)
  const imgScale = interpClamp({ frame, startMs: 0, endMs: 1490, from: 1.5, to: 1, fps, easing: smooth50 })

  // Blurred copy of the visual ("Card blur"), absolute position in artboard
  // space: (420 + (-140), -75 + (-162)) = (280, -237), 1275x1519.
  // Jitter blurRadius 109 ≈ CSS blur(54.5px) (radius ≈ 2x sigma).
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
          src='/images/visual.jpg'
          style={{
            position: 'absolute',
            left: 280 - rect.left,
            top: -237 - rect.top,
            width: 1275,
            height: 1519,
            maxWidth: 'none',
            filter: 'blur(54.5px)',
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
          backgroundColor: '#ffffff',
          opacity: 0.13,
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
  frame,
  fps,
}: {
  text: string
  startMs: number
  frame: number
  fps: number
}) {
  const words = text.split(' ')
  return (
    <>
      {words.map((word, i) => {
        const wordStartMs = startMs + i * WORD_STAGGER_MS
        const progress = interpClamp({ frame, startMs: wordStartMs, endMs: wordStartMs + WORD_DURATION_MS, from: 0, to: 1, fps, easing: smooth50 })
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
            {i < words.length - 1 ? ' ' : null}
          </span>
        )
      })}
    </>
  )
}

// ---------------------------------------------------------------------------
// Heart — outline fade-in, then a circular mask reveals the filled heart.
// Group at (1165, 669), 41x41; svg local rect (4, 7) 34x32.
// ---------------------------------------------------------------------------

const HEART_SIZE = 41
const HEART_SVG = { x: 4, y: 7, width: 34, height: 32 } as const

function Heart({ frame, fps }: { frame: number; fps: number }) {
  const groupScale = interpClamp({ frame, startMs: 1732, endMs: 3672, from: 0.8, to: 1, fps, easing: impulseOvershoot71 })
  const outlineOpacity = interpClamp({ frame, startMs: 1262, endMs: 1772, from: 0, to: 0.5, fps, easing: (t) => t })
  const maskP = interpClamp({ frame, startMs: 2125, endMs: 3210, from: 0, to: 1, fps, easing: smooth50 })
  const maskSize = HEART_SIZE * maskP
  const maskOffset = (HEART_SIZE - maskSize) / 2

  return (
    <div
      style={{
        position: 'absolute',
        left: 1165,
        top: 669,
        width: HEART_SIZE,
        height: HEART_SIZE,
        transform: `scale(${groupScale})`,
        transformOrigin: 'center center',
      }}
    >
      {/* Outline heart, fades 0 → 50% */}
      <div style={{ position: 'absolute', inset: 0, opacity: outlineOpacity }}>
        <svg
          width={HEART_SVG.width}
          height={HEART_SVG.height}
          viewBox={`0 0 ${HEART_SVG.width} ${HEART_SVG.height}`}
          style={{ position: 'absolute', left: HEART_SVG.x, top: HEART_SVG.y }}
        >
          <path d={HEART_PATH} fill='#ffffff' />
        </svg>
      </div>
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
          width={HEART_SVG.width}
          height={HEART_SVG.height}
          viewBox={`0 0 ${HEART_SVG.width} ${HEART_SVG.height}`}
          style={{ position: 'absolute', left: HEART_SVG.x - maskOffset, top: HEART_SVG.y - maskOffset }}
        >
          <path d={HEART_PATH} fill='#FFEFFB' />
        </svg>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Portrait bubble — mask rect resizes 0 → 72x72 from center.
// Group at (709, 652); image local rect (-15, -4) 93x111.
// ---------------------------------------------------------------------------

const PORTRAIT_SIZE = 72

function PortraitBubble({ frame, fps }: { frame: number; fps: number }) {
  const p = interpClamp({ frame, startMs: 1262, endMs: 2062, from: 0, to: 1, fps, easing: smooth50 })
  const size = PORTRAIT_SIZE * p
  const offset = (PORTRAIT_SIZE - size) / 2

  return (
    <div
      style={{
        position: 'absolute',
        left: 709,
        top: 652,
        width: PORTRAIT_SIZE,
        height: PORTRAIT_SIZE,
        borderRadius: 14,
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
          borderRadius: 15,
          overflow: 'hidden',
        }}
      >
        <img
          src='/images/portrait.jpg'
          style={{
            position: 'absolute',
            left: -15 - offset,
            top: -4 - offset,
            width: 93,
            height: 111,
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

/** Mango logo vectors, recolored #FFEFFB. Positions are local to the inner
 * "Group 1" which sits at (0, 8.7421875) inside the logo group at (52, 50). */
const LOGO_VECTORS = [
  { src: '/svg/logo-2.svg', x: 170, y: 9, width: 29, height: 29 },
  { src: '/svg/logo-3.svg', x: 141, y: 9, width: 28, height: 40 },
  { src: '/svg/logo-4.svg', x: 113, y: 9, width: 26, height: 29 },
  { src: '/svg/logo-5.svg', x: 84, y: 9, width: 28, height: 29 },
  { src: '/svg/logo-6.svg', x: 41, y: 0, width: 42, height: 38 },
  { src: '/svg/logo-7.svg', x: 29, y: 0, width: 7, height: 7 },
  { src: '/svg/logo-8.svg', x: 12, y: 27, width: 9, height: 9 },
  { src: '/svg/logo-9.svg', x: 0, y: 14, width: 9, height: 9 },
  { src: '/svg/logo-10.svg', x: 12, y: 2, width: 9, height: 9 },
  { src: '/svg/logo-11.svg', x: 4, y: 6, width: 25, height: 26 },
  { src: '/svg/logo-12.svg', x: 25, y: 14, width: 9, height: 9 },
] as const

function LogoAndUrl() {
  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: 52,
          top: 50,
          width: 201,
          height: 57,
          overflow: 'hidden',
        }}
      >
        <div style={{ position: 'absolute', left: 0, top: 8.7421875 }}>
          {LOGO_VECTORS.map((v, i) => (
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
          left: 1592,
          top: 52,
          width: 262,
          fontSize: 27,
          lineHeight: `${27 * 0.96}px`,
          color: '#FFEFFB',
          fontFamily: FONT_FAMILY,
          textAlign: 'right',
        }}
      >
        buildmango.co
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

  const quoteMarkOpacity = interpClamp({ frame, startMs: 752, endMs: 982, from: 0, to: 1, fps, easing: (t) => t })

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
          width: ARTBOARD_W,
          height: ARTBOARD_H,
          transform: `scale(${SCALE})`,
          transformOrigin: 'top left',
          overflow: 'hidden',
          backgroundColor: '#00D0FF',
          fontFamily: FONT_FAMILY,
        }}
      >
        <BackgroundVisual frame={frame} fps={fps} />
        <FrostedCard frame={frame} fps={fps} />

        {/* Quote mark “ */}
        <div
          style={{
            position: 'absolute',
            left: 694,
            top: 482,
            width: 447,
            fontSize: 32,
            lineHeight: `${BODY_LINE_HEIGHT}px`,
            color: '#ffffff',
            opacity: quoteMarkOpacity,
          }}
        >
          {'\u201C'}
        </div>

        {/* Quote text — word by word slideAndMask */}
        <div
          style={{
            position: 'absolute',
            left: 710,
            top: 481,
            width: 510,
            fontSize: 32,
            lineHeight: `${BODY_LINE_HEIGHT}px`,
            color: '#FFEFFB',
          }}
        >
          <MaskedWordsText
            text={"Mango's AI templates save us hours and make every campaign feel personalized. Highly recommend!\u201D"}
            startMs={500}
            frame={frame}
            fps={fps}
          />
        </div>

        {/* Author text */}
        <div
          style={{
            position: 'absolute',
            left: 803,
            top: 652,
            width: 206,
            fontSize: 32,
            lineHeight: `${BODY_LINE_HEIGHT}px`,
            color: '#ffffff80',
          }}
        >
          <MaskedWordsText text='John Doe, CEO of Acme' startMs={1490} frame={frame} fps={fps} />
        </div>

        <Heart frame={frame} fps={fps} />
        <PortraitBubble frame={frame} fps={fps} />
        <LogoAndUrl />
      </div>
    </AbsoluteFill>
  )
}
