// Captions demo — word-level timestamps rendered as TikTok-style overlays.
// Caption data is hardcoded; in production use Whisper transcription output.

import { useCurrentFrame, useVideoConfig } from 'remotion'
import { type Caption } from '@remotion/captions'

const CAPTIONS: Caption[] = [
  { text: 'Welcome', startMs: 200, endMs: 600, timestampMs: 400, confidence: 1 },
  { text: 'to', startMs: 600, endMs: 800, timestampMs: 700, confidence: 1 },
  { text: 'the', startMs: 800, endMs: 950, timestampMs: 875, confidence: 1 },
  { text: 'future', startMs: 950, endMs: 1400, timestampMs: 1175, confidence: 1 },
  { text: 'of', startMs: 1400, endMs: 1550, timestampMs: 1475, confidence: 1 },
  { text: 'video.', startMs: 1550, endMs: 2200, timestampMs: 1875, confidence: 1 },
  { text: 'Create', startMs: 2500, endMs: 2900, timestampMs: 2700, confidence: 1 },
  { text: 'stunning', startMs: 2900, endMs: 3400, timestampMs: 3150, confidence: 1 },
  { text: 'content', startMs: 3400, endMs: 3900, timestampMs: 3650, confidence: 1 },
  { text: 'with', startMs: 3900, endMs: 4100, timestampMs: 4000, confidence: 1 },
  { text: 'just', startMs: 4100, endMs: 4350, timestampMs: 4225, confidence: 1 },
  { text: 'a', startMs: 4350, endMs: 4450, timestampMs: 4400, confidence: 1 },
  { text: 'few', startMs: 4450, endMs: 4700, timestampMs: 4575, confidence: 1 },
  { text: 'lines', startMs: 4700, endMs: 5100, timestampMs: 4900, confidence: 1 },
  { text: 'of', startMs: 5100, endMs: 5250, timestampMs: 5175, confidence: 1 },
  { text: 'code.', startMs: 5250, endMs: 5900, timestampMs: 5575, confidence: 1 },
  { text: 'Captions', startMs: 6200, endMs: 6700, timestampMs: 6450, confidence: 1 },
  { text: 'sync', startMs: 6700, endMs: 7000, timestampMs: 6850, confidence: 1 },
  { text: 'perfectly', startMs: 7000, endMs: 7600, timestampMs: 7300, confidence: 1 },
  { text: 'to', startMs: 7600, endMs: 7750, timestampMs: 7675, confidence: 1 },
  { text: 'every', startMs: 7750, endMs: 8100, timestampMs: 7925, confidence: 1 },
  { text: 'frame.', startMs: 8100, endMs: 8800, timestampMs: 8450, confidence: 1 },
]

// Shows words only after they're spoken, highlights the active word.
export function CaptionOverlay() {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const currentTimeMs = (frame / fps) * 1000

  const spokenWords = CAPTIONS.filter((c) => currentTimeMs >= c.startMs)
  if (spokenWords.length === 0) return null

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 140,
        left: 80,
        right: 80,
        textAlign: 'center',
        zIndex: 10,
      }}
    >
      <p
        style={{
          margin: 0,
          fontFamily: "'Inter', system-ui, sans-serif",
          fontSize: 48,
          fontWeight: 700,
          lineHeight: 1.4,
        }}
      >
        {spokenWords.map((caption, i) => {
          const isActive = currentTimeMs >= caption.startMs && currentTimeMs < caption.endMs
          return (
            <span key={i} style={{ color: isActive ? '#FFD700' : '#fff' }}>
              {i > 0 ? ' ' : ''}{caption.text}
            </span>
          )
        })}
      </p>
    </div>
  )
}

// Same as CaptionOverlay but with larger text, one word at a time feel.
export function WordPopCaptions() {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const currentTimeMs = (frame / fps) * 1000

  const spokenWords = CAPTIONS.filter((c) => currentTimeMs >= c.startMs)
  if (spokenWords.length === 0) return null

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 120,
        left: 80,
        right: 80,
        textAlign: 'center',
        zIndex: 10,
      }}
    >
      <p
        style={{
          margin: 0,
          fontFamily: "'Inter', system-ui, sans-serif",
          fontSize: 52,
          fontWeight: 800,
          lineHeight: 1.4,
        }}
      >
        {spokenWords.map((caption, i) => {
          const isActive = currentTimeMs >= caption.startMs && currentTimeMs < caption.endMs
          return (
            <span key={i} style={{ color: isActive ? '#FFD700' : '#fff' }}>
              {i > 0 ? ' ' : ''}{caption.text}
            </span>
          )
        })}
      </p>
    </div>
  )
}
