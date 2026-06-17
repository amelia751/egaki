/**
 * Reusable teleprompter-style scrolling markdown component.
 *
 * Renders markdown sections as a smooth-scrolling vertical feed over any
 * background. Each section scrolls at a speed derived from its word count
 * and WPM setting. Uses monotone cubic Hermite interpolation for C1
 * continuous scrolling (no velocity discontinuities at section boundaries).
 */

import { useCurrentFrame, useVideoConfig } from 'remotion'
import { Fill } from 'egaki/video'
import { SafeMdxRenderer } from 'safe-mdx'
import { mdxParse } from 'safe-mdx/parse'
import { useRef, useLayoutEffect, useState, useMemo, type ReactNode } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScrollSection {
  /** Markdown string for this section */
  markdown: string
  /** Reading speed in words per minute; controls how long this section stays centered */
  speed: number
}

export interface ScrollingTranscriptProps {
  /** Markdown sections with per-section scroll speed */
  sections: ScrollSection[]
  /** Background element rendered behind the scrolling text (e.g. <Video>, <Img>, or a gradient div) */
  background?: ReactNode
  /** Extra styles applied to the background wrapper div (e.g. filter, transform).
   *  Remotion's @remotion/media Video renders a <canvas> that ignores the
   *  style prop, so visual effects like blur and scale must go here. */
  backgroundStyle?: React.CSSProperties
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
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function countWords(text: string): number {
  return text.replace(/[*_`#\[\]()]/g, '').split(/\s+/).filter(Boolean).length
}

/** Compute total duration in seconds for a set of sections (including padding). */
export function computeTotalSeconds(sections: ScrollSection[], paddingSeconds = 2): number {
  let total = paddingSeconds
  for (const s of sections) {
    total += (countWords(s.markdown) / s.speed) * 60
  }
  total += paddingSeconds
  return Math.ceil(total)
}

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
  background,
  fontSize = 32,
  maxWidth = 720,
  sectionGap = 56,
  paddingSeconds = 2,
  fadeMask: fadeMaskRange = [20, 80],
  components: componentOverrides,
  backgroundStyle,
}: ScrollingTranscriptProps) {
  const frame = useCurrentFrame()
  const { fps, height } = useVideoConfig()
  const sectionRefs = useRef<(HTMLDivElement | null)[]>([])
  const [centers, setCenters] = useState<number[]>([])

  const mdxComponents = useMemo(
    () => (componentOverrides ? { ...defaultMdxComponents, ...componentOverrides } : defaultMdxComponents),
    [componentOverrides],
  )

  const parsedAsts = useMemo(
    () => sections.map((s) => mdxParse(s.markdown)),
    [sections],
  )

  const timings = useMemo(() => {
    const paddingFrames = paddingSeconds * fps
    let currentFrame = paddingFrames
    return sections.map((section) => {
      const words = countWords(section.markdown)
      const durationFrames = Math.round((words / section.speed) * 60 * fps)
      const start = currentFrame
      currentFrame += durationFrames
      return { start, duration: durationFrames }
    })
  }, [sections, fps, paddingSeconds])

  useLayoutEffect(() => {
    setCenters(
      sectionRefs.current.map((el) => {
        if (!el) return 0
        return el.offsetTop + el.offsetHeight / 2
      }),
    )
  }, [sections, fontSize, maxWidth])

  const scrollY = useMemo(() => {
    if (centers.length < 2) return 0
    const inputRange = timings.map((t) => t.start)
    const outputRange = centers.map((c) => c - height / 2)
    return smoothInterpolate(frame, inputRange, outputRange)
  }, [frame, centers, timings, height])

  const mask = `linear-gradient(to bottom, transparent 0%, black ${fadeMaskRange[0]}%, black ${fadeMaskRange[1]}%, transparent 100%)`

  return (
    <Fill>
      {/* Background wrapper: forces any child (including Remotion's
          @remotion/media <canvas>) to fill the full composition.
          Remotion's Video with objectFit renders a bare <canvas> that
          ignores the style prop, so visual effects like blur and scale
          must go on this wrapper via backgroundStyle. */}
      <style>{`
        .__scroll-bg > * { position: absolute !important; inset: 0 !important; width: 100% !important; height: 100% !important; }
        .__scroll-bg canvas { object-fit: cover; }
      `}</style>
      <div className="__scroll-bg" style={{ position: 'absolute', inset: 0, overflow: 'hidden', ...backgroundStyle }}>
        {background}
      </div>

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
        }}>
          {sections.map((section, i) => (
            <div
              key={i}
              ref={(el) => { sectionRefs.current[i] = el }}
              style={{
                width: maxWidth,
                fontSize,
                fontFamily: FONT_SANS,
                color: '#ffffff',
                marginBottom: sectionGap,
              }}
            >
              <SafeMdxRenderer
                markdown={section.markdown}
                mdast={parsedAsts[i]}
                components={mdxComponents}
                onError={(e) => console.warn('[scroll]', e.message)}
              />
            </div>
          ))}
        </div>
      </div>
    </Fill>
  )
}
