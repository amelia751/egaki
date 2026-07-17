// Nested image montage component inspired by TikTok sun-worship edit style.
// Every beat a new image appears at the center with the most padding.
// Previous images grow outward, never shrink. After MAX_VISIBLE images,
// the oldest one falls off screen.
//
// Rendering order: oldest (largest, behind) first, newest (smallest, front) last.

import { Img, Fill, EASE } from 'egaki/video'
import { useCurrentFrame, useVideoConfig, AbsoluteFill, interpolate } from 'remotion'

// Scale for each "age" (how many beats since introduced).
// age 0 = newest (most padded, smallest), age N = oldest (largest, behind).
// Each step only grows, so an image entering at 0.35 will move to 0.55,
// then 0.75, then 0.95, then off screen.
const SCALE_BY_AGE = [0.6, 0.78, 0.96, 1.18, 1.45]
const MAX_VISIBLE = SCALE_BY_AGE.length

// Dims the background with a black overlay that eases in over a given duration.
// Use in Background to darken the preamble video behind section content.
export function DimOverlay({ darkness = 0.5, duration = 30 }: { darkness?: number; duration?: number }) {
  const frame = useCurrentFrame()
  const opacity = interpolate(frame, [0, duration], [0, darkness], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE.decelerate,
  })

  return (
    <AbsoluteFill style={{ backgroundColor: `rgba(0, 0, 0, ${opacity})` }} />
  )
}

// Film-style subtitle captions. Words appear one by one, no animation,
// simple yellow text at the bottom of the screen.
type WordEntry = { word: string; delay: number }

export function Caption({ words }: { words: WordEntry[] }) {
  const frame = useCurrentFrame()

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <span
        style={{
          fontSize: 42,
          fontWeight: 400,
          color: '#f5d442',
          fontFamily: '"Georgia", "Times New Roman", serif',
          textAlign: 'center',
          lineHeight: 1.4,
          letterSpacing: '0.01em',
          maxWidth: '70%',
        }}
      >
        {words.map((w, i) => (
          <span key={i} style={{ opacity: frame >= w.delay ? 1 : 0 }}>
            {i > 0 ? ' ' : ''}{w.word}
          </span>
        ))}
      </span>
    </AbsoluteFill>
  )
}

export function ImageMontage({
  images,
  beat,
}: {
  images: string[]
  beat: number
}) {
  const frame = useCurrentFrame()
  const currentBeat = Math.floor(frame / beat)

  // Build visible layers. age 0 = newest (front), higher age = older (behind).
  const layers: { src: string; age: number; imageIndex: number }[] = []
  for (let age = 0; age < MAX_VISIBLE; age++) {
    const imageIndex = currentBeat - age
    if (imageIndex < 0 || imageIndex >= images.length) continue
    layers.push({ src: images[imageIndex], age, imageIndex })
  }

  // Render back-to-front: oldest (largest) first, newest (smallest) on top
  layers.reverse()

  return (
    <Fill>
      <AbsoluteFill
        style={{
          backgroundColor: 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {layers.map(({ src, age, imageIndex }) => {
          const scale = SCALE_BY_AGE[age]!

          return (
            <div
              key={`img-${imageIndex}`}
              style={{
                position: 'absolute',
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transform: `scale(${scale})`,
                willChange: 'transform',
              }}
            >
              <Img
                src={src}
                style={{
                  maxWidth: '100%',
                  maxHeight: '100%',
                  objectFit: 'contain',
                  display: 'block',
                }}
              />
            </div>
          )
        })}
      </AbsoluteFill>
    </Fill>
  )
}
