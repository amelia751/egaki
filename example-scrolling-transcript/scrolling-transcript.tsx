'use client'

/**
 * Reusable teleprompter-style scrolling markdown component with optional
 * word-level highlight sync from audio transcription.
 *
 * Renders markdown sections as a smooth-scrolling vertical feed over any
 * background. Each section scrolls at a speed derived from its word count
 * and WPM setting. Uses monotone cubic Hermite interpolation for C1
 * continuous scrolling (no velocity discontinuities at section boundaries).
 *
 * When `wordTimings` is provided, the component:
 *   1. Derives scroll timing from transcription timestamps (ignoring WPM `speed`)
 *   2. Renders words as individual <span> elements instead of SafeMdxRenderer
 *   3. Highlights the currently-spoken word based on frame/fps timing
 */

import { useCurrentFrame, useVideoConfig, interpolate } from 'remotion'
import { Fill } from 'egaki/video'
import { SafeMdxRenderer } from 'safe-mdx'
import { mdxParse } from 'safe-mdx/parse'
import { useEffect, useRef, useLayoutEffect, useState, useMemo, type ReactNode } from 'react'
import {
  countWords,
  extractPlainText,
  extractRichWords,
  alignWordsToSections,
  computeTotalSeconds,
  type ScrollSection,
  type WordTiming,
  type RichWord,
} from './transcript-utils'

// Re-export types and utilities so existing imports keep working
export { countWords, extractPlainText, extractRichWords, alignWordsToSections, computeTotalSeconds }
export type { ScrollSection, WordTiming, RichWord }

export interface ScrollingTranscriptProps {
  /** Markdown sections with per-section scroll speed */
  sections: ScrollSection[]
  /** Pre-computed word timings per section (from server-side transcription + alignment).
   *  When provided, renders words as highlighted spans instead of SafeMdxRenderer,
   *  and derives scroll timing from transcription timestamps. */
  wordTimings?: WordTiming[][]
  /** Async word timings promise. When provided, the component starts with WPM-based
   *  default timing and switches to real timestamps once the promise resolves.
   *  Use this for async TTS generation where timings arrive after initial render. */
  wordTimingsPromise?: Promise<WordTiming[][]>
  /** Font size in pixels (default 32) */
  fontSize?: number
  /** Max content width in pixels (default 720) */
  maxWidth?: number
  /** Vertical gap between sections in pixels (default 56) */
  sectionGap?: number
  /** Leading/trailing padding in seconds before/after scroll starts (default 2) */
  paddingSeconds?: number
  /** Fade mask percentages [fadeIn, fadeOut] as 0-100 (default [20, 80]) */
  fadeMask?: [number, number]
  /** Override the mdx component map for custom markdown styling */
  components?: Record<string, (props: any) => ReactNode>
  /** Style for the currently-active (spoken) word */
  activeWordStyle?: React.CSSProperties
  /** Style for words that have already been spoken */
  pastWordStyle?: React.CSSProperties
  /** Style for words that haven't been spoken yet */
  futureWordStyle?: React.CSSProperties
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Monotone cubic Hermite interpolation (Fritsch-Carlson).
 * Like Remotion's interpolate() but C1 continuous — no velocity
 * discontinuities at keypoints. Uses harmonic mean tangents to keep
 * the curve monotone (no overshoot between keypoints).
 */
function smoothInterpolate(input: number, inputRange: number[], outputRange: number[]): number {
  const n = inputRange.length
  if (n === 0) return 0
  if (n === 1) return outputRange[0]

  const slopes = Array.from({ length: n - 1 }, (_, i) =>
    (outputRange[i + 1] - outputRange[i]) / (inputRange[i + 1] - inputRange[i]),
  )

  const tangents = Array.from({ length: n }, (_, i) => {
    if (i === 0) return slopes[0]
    if (i === n - 1) return slopes[n - 2]
    const prev = slopes[i - 1]
    const next = slopes[i]
    if (prev * next <= 0) return 0
    return (2 * prev * next) / (prev + next)
  })

  if (input <= inputRange[0]) {
    return outputRange[0] + (input - inputRange[0]) * tangents[0]
  }
  if (input >= inputRange[n - 1]) {
    return outputRange[n - 1] + (input - inputRange[n - 1]) * tangents[n - 1]
  }

  let i = 0
  while (i < n - 2 && input > inputRange[i + 1]) i++

  const x0 = inputRange[i]
  const x1 = inputRange[i + 1]
  const y0 = outputRange[i]
  const y1 = outputRange[i + 1]
  const dx = x1 - x0
  const t = (input - x0) / dx
  const t2 = t * t
  const t3 = t2 * t

  return (
    (2 * t3 - 3 * t2 + 1) * y0 +
    (t3 - 2 * t2 + t) * dx * tangents[i] +
    (-2 * t3 + 3 * t2) * y1 +
    (t3 - t2) * dx * tangents[i + 1]
  )
}



// ---------------------------------------------------------------------------
// Default markdown component overrides (holocron-inspired)
// ---------------------------------------------------------------------------

const FONT_SANS = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif"
const FONT_MONO = "'JetBrains Mono', 'SF Mono', 'Cascadia Mono', Consolas, monospace"

const defaultMdxComponents: Record<string, (props: any) => ReactNode> = {
  p: ({ children }: { children: ReactNode }) => (
    <p style={{
      margin: 0, marginBottom: '1.2em', lineHeight: 1.6,
      fontWeight: 475, color: 'rgba(255, 255, 255, 0.85)',
    }}>
      {children}
    </p>
  ),
  strong: ({ children }: { children: ReactNode }) => (
    <strong style={{ color: '#ffffff', fontWeight: 600 }}>{children}</strong>
  ),
  em: ({ children }: { children: ReactNode }) => (
    <em style={{ fontStyle: 'italic', color: 'rgba(255, 255, 255, 0.9)' }}>{children}</em>
  ),
  code: ({ children }: { children: ReactNode }) => (
    <code style={{
      fontFamily: FONT_MONO, fontSize: '0.86em', fontWeight: 400,
      letterSpacing: 0, padding: '0.15em 0.35em', borderRadius: '0.375rem',
      background: 'rgba(255, 255, 255, 0.15)', color: '#ffffff',
      whiteSpace: 'nowrap' as const, verticalAlign: '0.05em',
    }}>
      {children}
    </code>
  ),
  ul: ({ children }: { children: ReactNode }) => (
    <ul style={{
      listStyleType: 'disc', paddingLeft: '1.25em', margin: 0,
      marginBottom: '1.2em', display: 'flex', flexDirection: 'column' as const, gap: '0.5em',
    }}>
      {children}
    </ul>
  ),
  ol: ({ children }: { children: ReactNode }) => (
    <ol style={{
      listStyleType: 'decimal', paddingLeft: '1.25em', margin: 0,
      marginBottom: '1.2em', display: 'flex', flexDirection: 'column' as const, gap: '0.5em',
    }}>
      {children}
    </ol>
  ),
  li: ({ children }: { children: ReactNode }) => (
    <li style={{ lineHeight: 1.6, paddingLeft: '0.25em' }}>{children}</li>
  ),
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ScrollingTranscript({
  sections,
  wordTimings,
  wordTimingsPromise,
  fontSize = 32,
  maxWidth = 720,
  sectionGap = 56,
  paddingSeconds = 2,
  fadeMask: fadeMaskRange = [20, 80],
  components: componentOverrides,
  activeWordStyle,
  pastWordStyle,
  futureWordStyle,
}: ScrollingTranscriptProps) {
  const frame = useCurrentFrame()
  const { fps, height } = useVideoConfig()
  const sectionRefs = useRef<(HTMLDivElement | null)[]>([])
  const [centers, setCenters] = useState<number[]>([])

  const currentSecond = frame / fps

  // Async word timings: start with sync wordTimings (or undefined),
  // switch to resolved promise value when it arrives.
  // RSC flight thenables may not have .catch(), so use .then(onFulfilled, onRejected).
  const [asyncTimings, setAsyncTimings] = useState<WordTiming[][] | undefined>(undefined)
  useEffect(() => {
    if (!wordTimingsPromise || wordTimings) return
    let cancelled = false
    wordTimingsPromise.then(
      (t) => { if (!cancelled) setAsyncTimings(t) },
      (err) => console.error('[egaki] wordTimingsPromise failed:', err),
    )
    return () => { cancelled = true }
  }, [wordTimingsPromise, wordTimings])

  const resolvedTimings = wordTimings ?? asyncTimings

  const mdxComponents = useMemo(
    () => (componentOverrides ? { ...defaultMdxComponents, ...componentOverrides } : defaultMdxComponents),
    [componentOverrides],
  )

  const parsedAsts = useMemo(
    () => sections.map((s) => mdxParse(s.markdown)),
    [sections],
  )

  // Pre-extract rich words (with formatting flags) for each section.
  // Same word count and order as extractPlainText, so indices match word timings.
  const richWordsPerSection = useMemo(
    () => sections.map((s) => extractRichWords(s.markdown)),
    [sections],
  )

  // When word timings are available (sync or async-resolved), derive scroll
  // timing from transcription timestamps. Otherwise fall back to WPM-based.
  const timings = useMemo(() => {
    const paddingFrames = paddingSeconds * fps

    if (resolvedTimings?.length) {
      return sections.map((_section, i) => {
        const sectionWords = resolvedTimings[i]
        if (!sectionWords?.length) {
          return { start: paddingFrames, duration: fps }
        }
        const startSec = sectionWords[0].startSecond
        const endSec = sectionWords[sectionWords.length - 1].endSecond
        const start = Math.round(startSec * fps) + paddingFrames
        const duration = Math.round((endSec - startSec) * fps)
        return { start, duration: Math.max(duration, 1) }
      })
    }

    // Fallback: WPM-based timing
    let currentFrame = paddingFrames
    return sections.map((section) => {
      const words = countWords(section.markdown)
      const durationFrames = Math.round((words / section.speed) * 60 * fps)
      const start = currentFrame
      currentFrame += durationFrames
      return { start, duration: durationFrames }
    })
  }, [sections, fps, paddingSeconds, resolvedTimings])

  useLayoutEffect(() => {
    setCenters(
      sectionRefs.current.map((el) => (el ? el.offsetTop + el.offsetHeight / 2 : 0)),
    )
  }, [sections, fontSize, maxWidth])

  // Precompute the scroll curve keyframes (stable across frames)
  const scrollCurve = useMemo(() => {
    if (centers.length < 2) return undefined
    return {
      inputRange: timings.map((t) => t.start),
      outputRange: centers.map((c) => c - height / 2),
    }
  }, [centers, timings, height])

  const scrollY = useMemo(() => {
    if (!scrollCurve) return 0
    const raw = smoothInterpolate(frame, scrollCurve.inputRange, scrollCurve.outputRange)
    return Math.round(raw * 1000) / 1000
  }, [frame, scrollCurve])

  const mask = useMemo(
    () => `linear-gradient(to bottom, transparent 0%, black ${fadeMaskRange[0]}%, black ${fadeMaskRange[1]}%, transparent 100%)`,
    [fadeMaskRange[0], fadeMaskRange[1]],
  )

  // Memoize word highlight styles so React sees the same object reference
  // across frames where props haven't changed. Without this, every span
  // gets a new style object every frame, forcing DOM style recalc.
  // All words get identical padding so toggling the active background
  // never causes layout shifts. Only the background color changes.
  const wordBase: React.CSSProperties = {
    // Horizontal padding extends the background pill, negative margin
    // cancels it out so word spacing stays at the natural 0.25ch.
    padding: '0.05em 0.15em',
    margin: '0 -0.15em',
    borderRadius: '0.25rem',
  }
  const activeStyle = useMemo<React.CSSProperties>(() => ({
    ...wordBase,
    color: '#ffffff',
    background: 'rgba(255, 255, 255, 0.15)',
    ...activeWordStyle,
  }), [activeWordStyle])
  const inactiveStyle = useMemo<React.CSSProperties>(() => ({
    ...wordBase,
    color: 'rgba(255, 255, 255, 0.85)',
    background: 'transparent',
    ...pastWordStyle,
  }), [pastWordStyle])

  return (
    <Fill>
      <div style={{
        position: 'absolute', inset: 0,
        maskImage: mask, WebkitMaskImage: mask,
        overflow: 'hidden',
      }}>
        <div style={{
          transform: `translateY(${-scrollY}px)`,
          paddingTop: height / 2,
          paddingBottom: height / 2,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          willChange: 'transform',
          // contain: layout + style tells the browser that children's layout
          // changes cannot affect ancestors, skipping expensive recalc passes.
          // 'size' is omitted because the container's height depends on its
          // children (variable section count).
          contain: 'layout style',
        }}>
          {sections.map((section, i) => {
            const sectionWords = resolvedTimings?.[i]
            // Derive opacity from scroll distance to this section's center.
            // This keeps opacity perfectly synchronized with the transform
            // instead of relying on a discrete activeSectionIndex that can
            // be out of phase with the scroll position.
            const distFromCenter = Math.abs((centers[i] ?? 0) - height / 2 - scrollY)
            const sectionOpacity = interpolate(
              distFromCenter,
              [0, 220, 700],
              [1, 0.4, 0.15],
              { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
            )
            return (
              <div
                key={i}
                ref={(el) => { sectionRefs.current[i] = el }}
                style={{
                  width: maxWidth,
                  fontSize,
                  fontFamily: FONT_SANS,
                  color: '#ffffff',
                  marginBottom: sectionGap,
                  opacity: sectionOpacity,
                  // Promote each section to its own compositor layer so
                  // opacity changes don't force text re-rasterization of
                  // siblings. The GPU composites the cached bitmap at the
                  // new opacity instead.
                  willChange: 'opacity',
                  contain: 'layout style paint',
                }}
              >
                {sectionWords ? (
                  // Word-level highlighted rendering with markdown formatting
                  <p style={{
                    margin: 0, marginBottom: '1.2em', lineHeight: 1.6,
                    fontWeight: 475, color: 'rgba(255, 255, 255, 0.85)',
                  }}>
                    {sectionWords.map((wt, wi) => {
                      // A word is active if we're within its timestamp range,
                      // OR if we're past its end but before the next word starts
                      // (fills gaps between timestamps so the highlight persists).
                      const nextStart = sectionWords[wi + 1]?.startSecond ?? Infinity
                      const isActive = currentSecond >= wt.startSecond && currentSecond < nextStart
                      const style = isActive ? activeStyle : inactiveStyle
                      const rich = richWordsPerSection[i]?.[wi]

                      // Wrap word text in formatting elements from the AST
                      let content: ReactNode = wt.word
                      if (rich?.code) {
                        content = <code style={{
                          fontFamily: FONT_MONO, fontSize: '0.86em', fontWeight: 400,
                          padding: '0.15em 0.35em', borderRadius: '0.375rem',
                          background: 'rgba(255, 255, 255, 0.15)', color: '#ffffff',
                        }}>{content}</code>
                      }
                      if (rich?.bold) {
                        content = <strong style={{ color: '#ffffff', fontWeight: 600 }}>{content}</strong>
                      }
                      if (rich?.italic) {
                        content = <em style={{ fontStyle: 'italic', color: 'rgba(255, 255, 255, 0.9)' }}>{content}</em>
                      }

                      return (
                        <span key={wi}>
                          {wi > 0 ? ' ' : ''}<span style={style}>{content}</span>
                        </span>
                      )
                    })}
                  </p>
                ) : (
                  // Fallback: full markdown rendering via SafeMdxRenderer
                  <SafeMdxRenderer
                    markdown={section.markdown}
                    mdast={parsedAsts[i]}
                    components={mdxComponents}
                    onError={(e) => console.warn('[scroll]', e.message)}
                  />
                )}
              </div>
            )
          })}

        </div>
      </div>
    </Fill>
  )
}
