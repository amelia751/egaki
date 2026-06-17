// CaptionedAudio — demonstrates @remotion/captions with egaki.
//
// Renders TikTok-style animated captions synced to audio. Uses
// createTikTokStyleCaptions() to group word-level timestamps into pages,
// then highlights the active word on each page using useCurrentFrame().
//
// The caption data here is hardcoded for the demo. In a real project you'd
// generate it from Whisper (via @remotion/install-whisper-cpp, @remotion/whisper-web,
// or @remotion/openai-whisper) and feed the resulting Caption[] array in.

import { useMemo } from 'react'
import { useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion'
import { type Caption, createTikTokStyleCaptions } from '@remotion/captions'
import { EASE, springFromDuration } from 'egaki/video'

// ---------------------------------------------------------------------------
// Sample caption data — word-level timestamps as if from a transcription API.
// Whitespace before each word is required by createTikTokStyleCaptions().
// ---------------------------------------------------------------------------

const CAPTIONS: Caption[] = [
  { text: 'Welcome', startMs: 200, endMs: 600, timestampMs: 400, confidence: 1 },
  { text: ' to', startMs: 600, endMs: 800, timestampMs: 700, confidence: 1 },
  { text: ' the', startMs: 800, endMs: 950, timestampMs: 875, confidence: 1 },
  { text: ' future', startMs: 950, endMs: 1400, timestampMs: 1175, confidence: 1 },
  { text: ' of', startMs: 1400, endMs: 1550, timestampMs: 1475, confidence: 1 },
  { text: ' video.', startMs: 1550, endMs: 2200, timestampMs: 1875, confidence: 1 },
  { text: ' Create', startMs: 2500, endMs: 2900, timestampMs: 2700, confidence: 1 },
  { text: ' stunning', startMs: 2900, endMs: 3400, timestampMs: 3150, confidence: 1 },
  { text: ' content', startMs: 3400, endMs: 3900, timestampMs: 3650, confidence: 1 },
  { text: ' with', startMs: 3900, endMs: 4100, timestampMs: 4000, confidence: 1 },
  { text: ' just', startMs: 4100, endMs: 4350, timestampMs: 4225, confidence: 1 },
  { text: ' a', startMs: 4350, endMs: 4450, timestampMs: 4400, confidence: 1 },
  { text: ' few', startMs: 4450, endMs: 4700, timestampMs: 4575, confidence: 1 },
  { text: ' lines', startMs: 4700, endMs: 5100, timestampMs: 4900, confidence: 1 },
  { text: ' of', startMs: 5100, endMs: 5250, timestampMs: 5175, confidence: 1 },
  { text: ' code.', startMs: 5250, endMs: 5900, timestampMs: 5575, confidence: 1 },
  { text: ' Captions', startMs: 6200, endMs: 6700, timestampMs: 6450, confidence: 1 },
  { text: ' sync', startMs: 6700, endMs: 7000, timestampMs: 6850, confidence: 1 },
  { text: ' perfectly', startMs: 7000, endMs: 7600, timestampMs: 7300, confidence: 1 },
  { text: ' to', startMs: 7600, endMs: 7750, timestampMs: 7675, confidence: 1 },
  { text: ' every', startMs: 7750, endMs: 8100, timestampMs: 7925, confidence: 1 },
  { text: ' frame.', startMs: 8100, endMs: 8800, timestampMs: 8450, confidence: 1 },
]

// ---------------------------------------------------------------------------
// TikTok-style caption overlay
// ---------------------------------------------------------------------------

export function CaptionOverlay({
  combineMs = 1800,
}: {
  /** How many ms of closeness to combine words into one page. */
  combineMs?: number
}) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const currentTimeMs = (frame / fps) * 1000

  const { pages } = useMemo(
    () => createTikTokStyleCaptions({ captions: CAPTIONS, combineTokensWithinMilliseconds: combineMs }),
    [combineMs],
  )

  // Find the active page: the one whose time range covers the current frame
  const activePage = pages.find(
    (page) => currentTimeMs >= page.startMs && currentTimeMs < page.startMs + page.durationMs,
  )

  if (!activePage) return null

  // Page entrance: spring scale from 0.85 to 1
  const pageStartFrame = Math.round((activePage.startMs / 1000) * fps)
  const pageFrame = frame - pageStartFrame
  const pageScale = spring({
    frame: pageFrame,
    fps,
    config: springFromDuration(0.35, 0.15),
  })

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 140,
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'center',
        zIndex: 10,
      }}
    >
      <div
        style={{
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(12px)',
          borderRadius: 16,
          padding: '16px 28px',
          transform: `scale(${0.85 + 0.15 * pageScale})`,
          opacity: Math.min(1, pageScale * 1.5),
          willChange: 'transform',
        }}
      >
        <p
          style={{
            margin: 0,
            fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
            fontSize: 48,
            fontWeight: 700,
            lineHeight: 1.3,
            whiteSpace: 'pre',
            textAlign: 'center',
          }}
        >
          {activePage.tokens.map((token, i) => {
            const isActive = currentTimeMs >= token.fromMs && currentTimeMs < token.toMs
            const isPast = currentTimeMs >= token.toMs

            return (
              <span
                key={i}
                style={{
                  color: isActive ? '#FFD700' : isPast ? '#ffffff' : 'rgba(255,255,255,0.4)',
                  transition: 'none',
                }}
              >
                {token.text}
              </span>
            )
          })}
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Word-by-word pop-in style (alternative to TikTok pages)
// ---------------------------------------------------------------------------

export function WordPopCaptions() {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const currentTimeMs = (frame / fps) * 1000

  // Show all words that have started, animate each one popping in
  const visibleWords = CAPTIONS.filter((c) => currentTimeMs >= c.startMs)

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 120,
        left: 80,
        right: 80,
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: '4px 0',
        zIndex: 10,
      }}
    >
      {visibleWords.map((caption, i) => {
        const wordStartFrame = Math.round((caption.startMs / 1000) * fps)
        const wordFrame = frame - wordStartFrame
        const pop = spring({ frame: wordFrame, fps, config: springFromDuration(0.3, 0.3) })
        const isActive = currentTimeMs >= caption.startMs && currentTimeMs < caption.endMs

        return (
          <span
            key={i}
            style={{
              fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
              fontSize: 52,
              fontWeight: 800,
              color: isActive ? '#FFD700' : '#ffffff',
              transform: `scale(${pop})`,
              opacity: pop,
              display: 'inline-block',
              willChange: 'transform',
              textShadow: '0 2px 12px rgba(0,0,0,0.6)',
            }}
          >
            {caption.text}
          </span>
        )
      })}
    </div>
  )
}
