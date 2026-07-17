'use client'

/**
 * TestimonialCard — testimonial template inspired by Jitter.
 *
 * Uses egaki animation primitives (Opacity, Scale with inline mode) and
 * flexbox for all layout. No hardcoded pixel positions for element placement.
 *
 * Operations timeline (seconds):
 *   0-1.49     bg image scale 1.5→1, card resize (smooth:50)
 *   0.5-...    quote textIn, words slide up masked (0.607s/word, 0.061s stagger)
 *   0.752-0.982  quote mark " fades in (linear)
 *   1.262-2.062  portrait mask scale 0→1 (smooth:50)
 *   1.262-1.772  outline heart opacity 0→50% (linear)
 *   1.49-...   author textIn, same word params
 *   1.632-3.572  card scale 1→1.1 (impulseAndOvershoot:96)
 *   1.732-3.672  heart group scale 0.8→1 (impulseAndOvershoot:71)
 *   2.125-3.21   filling-heart circular mask scale 0→1 (smooth:50)
 */

import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import { EASE, Fill, Img, Opacity, Scale, impulseOvershoot } from 'egaki/video'

const HEART_PATH =
  'M16.6832 31.5349C16.995 31.5349 17.4237 31.3377 17.7367 31.1469C27.132 25.0575 33.3666 18.048 33.3666 10.9136C33.3666 5.05425 29.3334 0.890625 24.0526 0.890625C20.8466 0.890625 18.1564 2.7026 16.6832 5.4958C15.2337 2.71442 12.5198 0.890625 9.31379 0.890625C4.03315 0.890625 0 5.05425 0 10.9136C0 18.048 6.23447 25.0575 15.6363 31.1469C15.9427 31.3377 16.3714 31.5349 16.6832 31.5349Z'

const impulseOvershoot96 = impulseOvershoot(96)
const impulseOvershoot71 = impulseOvershoot(71)

// ---------------------------------------------------------------------------
// Background visual — full-bleed image with zoom-out animation
// ---------------------------------------------------------------------------

function BackgroundVisual({ src, speed = 1 }: { src: string; speed?: number }) {
  const fps = useVideoConfig().fps / speed
  if (!src) return null
  return (
    <Scale from={1.5} to={1} duration={1.49 * fps} easing={EASE.smooth} label="bg-zoom">
      <Img
        src={src}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
      />
    </Scale>
  )
}

// ---------------------------------------------------------------------------
// Frosted card — backdrop blur + white tint, centered via flexbox
// ---------------------------------------------------------------------------

function FrostedCard({ speed = 1 }: { speed?: number }) {
  const fps = useVideoConfig().fps / speed
  return (
    <Fill style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Scale from={1150 / 675} to={1} duration={1.49 * fps} easing={EASE.smooth} inline label="card-resize">
        <Scale from={1} to={1.1} duration={1.94 * fps} startInFrames={1.632 * fps} easing={impulseOvershoot96} inline label="card-pulse">
           <div
            style={{
              width: 675,
              height: 392,
              borderRadius: 40,
              backdropFilter: 'blur(54.5px)',
              WebkitBackdropFilter: 'blur(54.5px)',
              backgroundColor: 'rgba(255, 255, 255, 0.13)',
            }}
          />
        </Scale>
      </Scale>
    </Fill>
  )
}

// ---------------------------------------------------------------------------
// Word-by-word slideAndMask text (Jitter textIn op)
// Per-word animation, stays as a custom helper.
// ---------------------------------------------------------------------------

function MaskedWordsText({ text, startSec, speed = 1 }: { text: string; startSec: number; speed?: number }) {
  const frame = useCurrentFrame()
  const fps = useVideoConfig().fps / speed
  const words = text.split(' ')
  return (
    <>
      {words.map((word, i) => {
        const wordStart = (startSec + i * 0.061) * fps
        const progress = interpolate(frame, [wordStart, wordStart + 0.607 * fps], [0, 1], {
          easing: EASE.smooth,
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })
        return (
          <span key={i}>
            <span style={{ display: 'inline-block', overflow: 'hidden', verticalAlign: 'top' }}>
              <span style={{ display: 'inline-block', transform: `translateY(${(1 - progress) * 100}%)` }}>
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
// Heart — outline fade-in + circular mask fill reveal + group scale
// ---------------------------------------------------------------------------

function Heart({ speed = 1 }: { speed?: number }) {
  const frame = useCurrentFrame()
  const fps = useVideoConfig().fps / speed
  const maskP = interpolate(frame, [2.125 * fps, 3.21 * fps], [0, 1], {
    easing: EASE.smooth,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  const heartSvg = (fill: string) => (
    <svg width="100%" height="100%" viewBox="0 0 34 32" style={{ display: 'block' }}>
      <path d={HEART_PATH} fill={fill} />
    </svg>
  )

  return (
    <Scale
      from={0.8}
      to={1}
      duration={1.94 * fps}
      startInFrames={1.732 * fps}
      easing={impulseOvershoot71}
      inline
      label="heart-pop"
      style={{ width: '2.5em', height: '2.5em', position: 'relative', flexShrink: 0 }}
    >
      {/* Outline heart, fades 0 → 50% */}
      <Opacity
        from={0}
        to={0.5}
        duration={0.51 * fps}
        startInFrames={1.262 * fps}
        easing={(t) => t}
        inline
        label="heart-outline"
        style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        {heartSvg('#ffffff')}
      </Opacity>
      {/* Filling heart revealed by a circle growing from center */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          clipPath: `circle(${maskP * 75}% at center)`,
        }}
      >
        {heartSvg('#FFEFFB')}
      </div>
    </Scale>
  )
}

// ---------------------------------------------------------------------------
// Portrait bubble — scale reveal from center
// ---------------------------------------------------------------------------

function PortraitBubble({ src, speed = 1 }: { src: string; speed?: number }) {
  const fps = useVideoConfig().fps / speed
  return (
    <div style={{ width: '2.5em', height: '2.5em', borderRadius: '20%', overflow: 'hidden', flexShrink: 0 }}>
      <Scale
        from={0}
        to={1}
        duration={0.8 * fps}
        startInFrames={1.262 * fps}
        easing={EASE.smooth}
        inline
        label="portrait-reveal"
        style={{ width: '100%', height: '100%', borderRadius: '20%', overflow: 'hidden' }}
      >
        <img
          src={src}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </Scale>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main composition
// ---------------------------------------------------------------------------

/** Default logo built from SVG sprites (Mango logo). */
function DefaultLogo() {
  const vectors = [
    { src: '/svg/logo-2.svg', x: 170, y: 9, w: 29, h: 29 },
    { src: '/svg/logo-3.svg', x: 141, y: 9, w: 28, h: 40 },
    { src: '/svg/logo-4.svg', x: 113, y: 9, w: 26, h: 29 },
    { src: '/svg/logo-5.svg', x: 84, y: 9, w: 28, h: 29 },
    { src: '/svg/logo-6.svg', x: 41, y: 0, w: 42, h: 38 },
    { src: '/svg/logo-7.svg', x: 29, y: 0, w: 7, h: 7 },
    { src: '/svg/logo-8.svg', x: 12, y: 27, w: 9, h: 9 },
    { src: '/svg/logo-9.svg', x: 0, y: 14, w: 9, h: 9 },
    { src: '/svg/logo-10.svg', x: 12, y: 2, w: 9, h: 9 },
    { src: '/svg/logo-11.svg', x: 4, y: 6, w: 25, h: 26 },
    { src: '/svg/logo-12.svg', x: 25, y: 14, w: 9, h: 9 },
  ]
  return (
    <div style={{ position: 'relative', width: 201, height: 48 }}>
      {vectors.map((v, i) => (
        <img
          key={i}
          src={v.src}
          style={{ position: 'absolute', left: v.x, top: v.y, width: v.w, height: v.h, maxWidth: 'none' }}
        />
      ))}
    </div>
  )
}

export interface TestimonialCardProps {
  /** Quote body. Opening/closing quote marks are added automatically. */
  quote?: string
  /** Author line shown next to the portrait, e.g. 'John Doe, CEO of Acme'. */
  author?: string
  /** Portrait image url. Gets the same zoomed framing as the original. */
  portraitSrc?: string
  /** Full-bleed background photo, also used for the card's frosted blur. */
  backgroundSrc?: string
  /** Website url shown top-right. */
  url?: string
  /** Logo element shown top-left. Defaults to the Mango SVG sprite logo. */
  logo?: React.ReactNode
  /** Font family for all text. Defaults to system sans-serif. */
  fontFamily?: string
  /** URL for a custom @font-face. If provided, a @font-face rule is injected. */
  fontSrc?: string
  /** Playback speed multiplier for the whole animation timeline (1 = original). */
  speed?: number
}

export function TestimonialCard({
  quote = "Mango's AI templates save us hours and make every campaign feel personalized. Highly recommend!",
  author = 'John Doe, CEO of Acme',
  portraitSrc = '/images/portrait.jpg',
  backgroundSrc = '/images/visual.jpg',
  url = 'buildmango.co',
  logo = <DefaultLogo />,
  fontFamily = 'HelveticaNowDisplay-Medium',
  fontSrc = '/fonts/helvetica-now-display-medium.otf',
  speed = 1,
}: TestimonialCardProps) {
  const fps = useVideoConfig().fps / speed

  return (
    <Fill style={{ fontFamily, overflow: 'hidden' }}>
      {fontSrc && (
        <style>{`
          @font-face {
            font-family: '${fontFamily}';
            src: url('${fontSrc}') format('opentype');
            font-weight: 500;
          }
        `}</style>
      )}

      {/* Background image with zoom-out */}
      <BackgroundVisual src={backgroundSrc} speed={speed} />

      {/* Frosted card layer */}
      <FrostedCard speed={speed} />

      {/* Card content — flexbox centered, matches frosted card size */}
      <Fill style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Scale from={1150 / 675} to={1} duration={1.49 * fps} easing={EASE.smooth} inline label="content-resize">
          <Scale from={1} to={1.1} duration={1.94 * fps} startInFrames={1.632 * fps} easing={impulseOvershoot96} inline label="content-pulse">
            <div
              style={{
                width: 675,
                height: 392,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                padding: '0 40px',
                gap: 16,
                fontSize: 32,
                lineHeight: 1.09,
              }}
            >
              {/* Quote text */}
              <div style={{ color: '#FFEFFB' }}>
                <Opacity from={0} to={1} duration={0.23 * fps} startInFrames={0.752 * fps} easing={(t) => t} inline label="quote-mark" style={{ display: 'inline', color: '#ffffff' }}>
                  {'\u201C'}
                </Opacity>
                <MaskedWordsText text={`${quote}\u201D`} startSec={0.5} speed={speed} />
              </div>

              {/* Author row: portrait + name + heart */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5em' }}>
                <PortraitBubble src={portraitSrc} speed={speed} />
                <div style={{ color: '#ffffff80', flex: 1 }}>
                  <MaskedWordsText text={author} startSec={1.49} speed={speed} />
                </div>
                <Heart speed={speed} />
              </div>
            </div>
          </Scale>
        </Scale>
      </Fill>

      {/* Header: logo left, URL right */}
      <Fill
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          padding: '3% 3%',
          fontFamily,
        }}
      >
        {logo}
        <div style={{ fontSize: 27, color: '#FFEFFB' }}>{url}</div>
      </Fill>
    </Fill>
  )
}
