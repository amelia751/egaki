/**
 * Rapid montage components for the bible imagery recreation.
 * RapidMontage: cycles through 18 cleaned images with raw frames as background.
 * VideoMontage: cycles through 18 animated video clips instead.
 * WordFlash: black screen with rapid single-word display for emphasis.
 */
'use client'

import { useCurrentFrame, useVideoConfig, AbsoluteFill } from 'remotion'
import { Img, Video, useAbsoluteCurrentFrame } from 'egaki/video'
import { interpolate } from 'remotion'

const CLEANED_IMAGES = Array.from({ length: 18 }, (_, i) => {
  const idx = String(i + 1).padStart(2, '0')
  return `/images/cleaned-${idx}.png`
})

const RAW_FRAMES = Array.from({ length: 18 }, (_, i) => {
  const idx = String(i + 1).padStart(2, '0')
  return `/raw-frames/frame-${idx}.png`
})

const VIDEO_CLIPS = Array.from({ length: 18 }, (_, i) => {
  const idx = String(i + 1).padStart(2, '0')
  return `/videos/animated-${idx}.mp4`
})



interface RapidMontageProps {
  /** Duration each image is shown, in frames */
  clipDuration?: number
}

export function VideoMontage({ clipDuration = 45 }: RapidMontageProps) {
  const frame = useCurrentFrame()
  const { durationInFrames } = useVideoConfig()

  const currentIndex = Math.floor(frame / clipDuration) % VIDEO_CLIPS.length

  // Continuous zoom across entire duration
  const scale = interpolate(frame, [0, durationInFrames], [1, 1.5])
  const s = Math.round(scale * 1000) / 1000

  return (
    <AbsoluteFill>
      {/* Raw video frame as blurred background */}
      <AbsoluteFill>
        <Img
          src={RAW_FRAMES[currentIndex]}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            filter: 'blur(20px) brightness(0.4)',
            transform: `scale(${Math.round(1.1 * s * 1000) / 1000})`,
            willChange: 'transform',
          }}
        />
      </AbsoluteFill>

      {/* Animated video clip */}
      <AbsoluteFill
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Video
          src={VIDEO_CLIPS[currentIndex]}
          muted
          loop
          objectFit="contain"
          style={{
            maxWidth: '90%',
            maxHeight: '90%',
            transform: `scale(${s})`,
            willChange: 'transform',
          }}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  )
}

/**
 * WordFlash — black screen with rapid single-word display.
 * Each word shows for a fixed number of frames (default 5 = ~167ms).
 * No animation, just hard cuts between words.
 */
export function WordFlash({ words, framesPerWord = 5 }: { words: string[]; framesPerWord?: number }) {
  const frame = useCurrentFrame()

  const currentWordIndex = Math.min(Math.floor(frame / framesPerWord), words.length - 1)

  return (
    <AbsoluteFill
      style={{
        backgroundColor: 'black',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <span
        style={{
          fontSize: 140,
          fontWeight: 900,
          color: 'white',
          fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
          letterSpacing: '-0.04em',
          textTransform: 'uppercase',
        }}
      >
        {words[currentWordIndex]}
      </span>
    </AbsoluteFill>
  )
}

/**
 * Caption — organic word-by-word text overlay.
 * Words appear one at a time in a vertical cascade with staggered
 * horizontal offsets. Sometimes 2 words share a line. Font family
 * rotates between serif, sans-serif, and display fonts per line
 * for a handcrafted editorial look.
 */
type WordEntry = { word: string; delay: number }

// Horizontal offsets for organic stagger
const OFFSETS = [0, 50, -25, 70, -45, 35, -60, 15, -35, 55, -15, 40]

// Font rotation: mix of serif, sans-serif, and display fonts.
// Each line picks a font deterministically from this list.
const FONTS = [
  '"Playfair Display", "Georgia", "Times New Roman", serif',
  '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
  '"Georgia", "Times New Roman", serif',
  '"SF Pro Display", -apple-system, sans-serif',
  '"Palatino", "Book Antiqua", "Times New Roman", serif',
  '"Helvetica Neue", "Arial", sans-serif',
]

// Pattern for grouping words into lines: true = pair with next word
const PAIR_PATTERN = [false, true, false, false, true, false, true, false, false, true, false, false]

export function Caption({ words }: { words: WordEntry[] }) {
  const frame = useCurrentFrame()

  // Group words into lines (sometimes 1 word, sometimes 2)
  const lines: { text: string; delay: number }[] = []
  let i = 0
  while (i < words.length) {
    const shouldPair = PAIR_PATTERN[i % PAIR_PATTERN.length] && i + 1 < words.length
    if (shouldPair) {
      lines.push({
        text: words[i].word + ' ' + words[i + 1].word,
        delay: words[i].delay,
      })
      i += 2
    } else {
      lines.push({ text: words[i].word, delay: words[i].delay })
      i += 1
    }
  }

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-end',
        padding: '0 60px 100px',
        gap: 4,
      }}
    >
      {lines.map((line, li) => {
        const visible = frame >= line.delay
        const font = FONTS[li % FONTS.length]
        const isSerif = font.includes('serif') && !font.includes('sans-serif')
        return (
          <span
            key={li}
            style={{
              fontSize: isSerif ? 50 : 46,
              fontWeight: isSerif ? 700 : 800,
              fontStyle: isSerif && li % 3 === 0 ? 'italic' : 'normal',
              color: 'white',
              fontFamily: font,
              textAlign: 'center',
              textShadow: '0 3px 20px rgba(0,0,0,0.9), 0 1px 6px rgba(0,0,0,0.7)',
              marginLeft: OFFSETS[li % OFFSETS.length],
              opacity: visible ? 1 : 0,
            }}
          >
            {line.text}
          </span>
        )
      })}
    </AbsoluteFill>
  )
}

/**
 * BlackScreen — full black overlay to hide the montage behind it.
 * Use inside a section to cover the preamble montage.
 */
export function BlackScreen({ children }: { children?: React.ReactNode }) {
  return (
    <AbsoluteFill style={{ backgroundColor: 'black' }}>
      {children}
    </AbsoluteFill>
  )
}

export function RapidMontage({ clipDuration = 20 }: RapidMontageProps) {
  const absoluteFrame = useAbsoluteCurrentFrame()

  const currentIndex = Math.floor(absoluteFrame / clipDuration) % CLEANED_IMAGES.length

  // Continuous zoom across entire video, never resets per section
  // Use a large total so it never clamps early
  const scale = interpolate(absoluteFrame, [0, 30 * 60], [1, 1.5])
  const s = Math.round(scale * 1000) / 1000

  return (
    <AbsoluteFill>
      {/* Oval mask with foreground image */}
      <AbsoluteFill
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: '75%',
            height: '60%',
            borderRadius: '50%',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Img
            src={CLEANED_IMAGES[currentIndex]}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transform: `scale(${s})`,
              willChange: 'transform',
            }}
          />
        </div>
      </AbsoluteFill>

    </AbsoluteFill>
  )
}
