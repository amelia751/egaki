'use client'

/**
 * Visual text effect components for egaki video.
 *
 * Must be 'use client' because they use Remotion hooks (useCurrentFrame,
 * useVideoConfig, spring, interpolate) which only work inside the Player
 * render context on the client.
 */

import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'


// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

const FONT_SANS =
  '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif'

// ---------------------------------------------------------------------------
// BlurReveal — text fades in from blurred to sharp
// ---------------------------------------------------------------------------

export interface BlurRevealProps {
  text: string
  blur?: number
  fontSize?: number
  color?: string
  fontWeight?: number
  /** Duration of the reveal in frames (defaults to 60% of composition) */
  revealFrames?: number
}

export function BlurReveal({
  text,
  blur = 20,
  fontSize = 96,
  color = '#fafafa',
  fontWeight = 700,
  revealFrames,
}: BlurRevealProps) {
  const frame = useCurrentFrame()
  const { durationInFrames } = useVideoConfig()
  const dur = revealFrames ?? durationInFrames * 0.6

  const opacity = interpolate(frame, [0, dur], [0, 1], {
    extrapolateRight: 'clamp',
  })
  const blurAmount = interpolate(frame, [0, dur], [blur, 0], {
    extrapolateRight: 'clamp',
  })

  return (
    <AbsoluteFill
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <span
        style={{
          opacity,
          filter: `blur(${blurAmount}px)`,
          fontSize,
          fontWeight,
          color,
          letterSpacing: '-0.04em',
          fontFamily: FONT_SANS,
        }}
      >
        {text}
      </span>
    </AbsoluteFill>
  )
}

// ---------------------------------------------------------------------------
// MaskedSlideReveal — words slide up from behind a mask
// ---------------------------------------------------------------------------

export interface MaskedSlideRevealProps {
  text: string
  staggerDelay?: number
  fontSize?: number
  color?: string
  fontWeight?: number
}

export function MaskedSlideReveal({
  text,
  staggerDelay = 3,
  fontSize = 56,
  color = '#fafafa',
  fontWeight = 600,
}: MaskedSlideRevealProps) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const words = text.split(' ')

  return (
    <AbsoluteFill
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <span
        style={{
          fontSize,
          fontWeight,
          color,
          letterSpacing: '-0.03em',
          fontFamily: FONT_SANS,
        }}
      >
        {words.map((word, i) => {
          const t = spring({
            frame: frame - i * staggerDelay,
            fps,
            config: { damping: 14 },
          })
          return (
            <span
              key={i}
              style={{
                display: 'inline-block',
                overflow: 'hidden',
                verticalAlign: 'bottom',
                lineHeight: 1.1,
                marginRight: '0.25em',
              }}
            >
              <span
                style={{
                  display: 'inline-block',
                  transform: `translateY(${(1 - t) * 100}%)`,
                }}
              >
                {word}
              </span>
            </span>
          )
        })}
      </span>
    </AbsoluteFill>
  )
}

// ---------------------------------------------------------------------------
// StaggeredFadeUp
// ---------------------------------------------------------------------------

export interface StaggeredFadeUpProps {
  text: string
  staggerDelay?: number
  distance?: number
  fontSize?: number
  color?: string
  fontWeight?: number
}

export function StaggeredFadeUp({
  text,
  staggerDelay = 4,
  distance = 24,
  fontSize = 48,
  color = '#a1a1aa',
  fontWeight = 400,
}: StaggeredFadeUpProps) {
  const frame = useCurrentFrame()
  const words = text.split(' ')

  return (
    <AbsoluteFill
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <span
        style={{
          fontSize,
          fontWeight,
          color,
          letterSpacing: '-0.02em',
          fontFamily: FONT_SANS,
        }}
      >
        {words.map((word, i) => {
          const local = frame - i * staggerDelay
          const opacity = interpolate(local, [0, 14], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          })
          const y = interpolate(local, [0, 14], [distance, 0], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          })
          return (
            <span
              key={i}
              style={{
                display: 'inline-block',
                marginRight: '0.25em',
                opacity,
                transform: `translateY(${y}px)`,
              }}
            >
              {word}
            </span>
          )
        })}
      </span>
    </AbsoluteFill>
  )
}

// ---------------------------------------------------------------------------
// ShimmerSweep — light sweep across text
// ---------------------------------------------------------------------------

export interface ShimmerSweepProps {
  text: string
  baseColor?: string
  shineColor?: string
  fontSize?: number
  fontWeight?: number
}

export function ShimmerSweep({
  text,
  baseColor = '#52525b',
  shineColor = '#fafafa',
  fontSize = 72,
  fontWeight = 700,
}: ShimmerSweepProps) {
  const frame = useCurrentFrame()
  const { durationInFrames } = useVideoConfig()

  const position = interpolate(
    frame,
    [0, durationInFrames * 0.75],
    [200, -100],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  )

  const textStyle: React.CSSProperties = {
    fontSize,
    fontWeight,
    letterSpacing: '-0.04em',
    fontFamily: FONT_SANS,
    margin: 0,
    lineHeight: 1,
  }

  return (
    <AbsoluteFill
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <span style={{ ...textStyle, color: baseColor }}>{text}</span>
        <span
          style={{
            ...textStyle,
            position: 'absolute',
            inset: 0,
            color: 'transparent',
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            backgroundImage: `linear-gradient(110deg, transparent 30%, ${shineColor} 50%, transparent 70%)`,
            backgroundSize: '200% 100%',
            backgroundPosition: `${position}% 50%`,
          }}
        >
          {text}
        </span>
      </div>
    </AbsoluteFill>
  )
}
