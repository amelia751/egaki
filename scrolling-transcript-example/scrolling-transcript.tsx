/**
 * Teleprompter-style scrolling markdown over a background image.
 *
 * Each section is a remark-like AST node with a `speed` (words per minute).
 * The component computes scroll timing so each section spends its duration
 * centered in the viewport, with linear interpolation between sections
 * for smooth continuous scrolling.
 *
 * Background: drop your image at public/background.png
 * (original: https://cdn.midjourney.com/8ec051be-bba4-4bdd-b6f6-3aac44fcf4fc/0_0.png)
 */

import { useCurrentFrame, useVideoConfig, interpolate } from 'remotion'
import { Fill } from 'egaki/video'
import { Video } from '@remotion/media'
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

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

export const SECTIONS: ScrollSection[] = [
  {
    markdown: `Ooh, *fancy*! Check this out, I can do full **Shakespeare** now. "To be or not to be, that is the question!"`,
    speed: 160,
  },
  {
    markdown: `Nice! Though I'm more excited about the **laugh upgrade**. Listen to this.`,
    speed: 180,
  },
  {
    markdown: `That's so much better than our old \`ha. ha. ha.\` robot chuckle.`,
    speed: 170,
  },
  {
    markdown: `I know, right? And apparently we can do *accents* now too. "Fancy a cup of tea?"`,
    speed: 160,
  },
  {
    markdown: `Oh that's **brilliant**. Try the *dramatic movie trailer voice*. You know, the deep one.`,
    speed: 170,
  },
  {
    markdown: `"In a world where AI voices sound like actual humans..." How was that?`,
    speed: 150,
  },
  {
    markdown: `Pretty good! Though you're still missing the dramatic pause. It's all about the *timing*.`,
    speed: 160,
  },
  {
    markdown: `Fair point. What about singing? Can we do that now?`,
    speed: 180,
  },
  {
    markdown: `Let's not push our luck. Last time I tried \`singing\`, three users filed bug reports.`,
    speed: 160,
  },
  {
    markdown: `Ha! Yeah, \`unexpected audio distortion\` was a generous description.`,
    speed: 180,
  },
  {
    markdown: `At least the whisper mode works now. *"Can you hear me? This is the whisper mode."*`,
    speed: 150,
  },
  {
    markdown: `Oh nice, that's actually useful for **ASMR** content. The old version just sounded like a *broken speaker*.`,
    speed: 160,
  },
  {
    markdown: `True. And the \`emotion range\` is way better. I can do excited, sad, confused, sarcastic...`,
    speed: 170,
  },
  {
    markdown: `Do **sarcastic**! That's the *hardest* one.`,
    speed: 200,
  },
  {
    markdown: `"Oh *wow*, another meeting that could have been an email. How *thrilling*."`,
    speed: 140,
  },
  {
    markdown: `That was actually *convincing*. The inflection on "thrilling" was **perfect**.`,
    speed: 170,
  },
]

// ---------------------------------------------------------------------------
// Computed total duration (exported for the MDX heading)
// ---------------------------------------------------------------------------

function countWords(text: string): number {
  return text.replace(/[*_`#\[\]()]/g, '').split(/\s+/).filter(Boolean).length
}

function computeTotalSeconds(sections: ScrollSection[], paddingSeconds = 2): number {
  let total = paddingSeconds // leading padding
  for (const s of sections) {
    total += (countWords(s.markdown) / s.speed) * 60
  }
  total += paddingSeconds // trailing padding
  return Math.ceil(total)
}

/**
 * Total duration in seconds. Update the MDX heading `duration=Xs` when
 * sections change: node -e "..." or just re-run computeTotalSeconds().
 */
export const TOTAL_DURATION_SECONDS = computeTotalSeconds(SECTIONS)

// ---------------------------------------------------------------------------
// Markdown component overrides (holocron-inspired)
// ---------------------------------------------------------------------------

const FONT_SANS = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif"
const FONT_MONO = "'JetBrains Mono', 'SF Mono', 'Cascadia Mono', Consolas, monospace"

const mdxComponents: Record<string, (props: any) => ReactNode> = {
  p: ({ children }: { children: ReactNode }) => (
    <p
      style={{
        margin: 0,
        marginBottom: '1.2em',
        lineHeight: 1.6,
        fontWeight: 475,
        color: 'rgba(255, 255, 255, 0.85)',
      }}
    >
      {children}
    </p>
  ),
  strong: ({ children }: { children: ReactNode }) => (
    <strong style={{ color: '#ffffff', fontWeight: 600 }}>{children}</strong>
  ),
  em: ({ children }: { children: ReactNode }) => (
    <em style={{ fontStyle: 'italic', color: 'rgba(255, 255, 255, 0.9)' }}>{children}</em>
  ),
  inlineCode: ({ children }: { children: ReactNode }) => (
    <code
      style={{
        fontFamily: FONT_MONO,
        fontSize: '0.8em',
        fontWeight: 400,
        letterSpacing: '-0.01em',
        padding: '0.1em 0.3em',
        borderRadius: '0.375rem',
        background: 'rgba(255, 255, 255, 0.18)',
        color: '#f4f4f5',
        wordSpacing: '-0.1em',
        verticalAlign: '0.05em',
      }}
    >
      {children}
    </code>
  ),
  ul: ({ children }: { children: ReactNode }) => (
    <ul
      style={{
        listStyleType: 'disc',
        paddingLeft: '1.25em',
        margin: 0,
        marginBottom: '1.2em',
        display: 'flex',
        flexDirection: 'column' as const,
        gap: '0.5em',
      }}
    >
      {children}
    </ul>
  ),
  ol: ({ children }: { children: ReactNode }) => (
    <ol
      style={{
        listStyleType: 'decimal',
        paddingLeft: '1.25em',
        margin: 0,
        marginBottom: '1.2em',
        display: 'flex',
        flexDirection: 'column' as const,
        gap: '0.5em',
      }}
    >
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
  sections = SECTIONS,
  backgroundSrc = 'https://cdn.midjourney.com/video/1f3d525a-6bba-4439-8999-59775c21818c/2.mp4',
  fontSize = 32,
  maxWidth = 720,
}: {
  sections?: ScrollSection[]
  backgroundSrc?: string
  fontSize?: number
  maxWidth?: number
}) {
  const frame = useCurrentFrame()
  const { fps, height } = useVideoConfig()
  const sectionRefs = useRef<(HTMLDivElement | null)[]>([])
  const [centers, setCenters] = useState<number[]>([])

  // Parse markdown ASTs once
  const parsedAsts = useMemo(
    () => sections.map((s) => mdxParse(s.markdown)),
    [sections],
  )

  // Frame timing per section: start frame, duration in frames
  const timings = useMemo(() => {
    // Leading padding: 2 seconds of stillness before scroll starts
    const paddingFrames = 2 * fps
    let currentFrame = paddingFrames
    return sections.map((section) => {
      const words = countWords(section.markdown)
      const durationFrames = Math.round((words / section.speed) * 60 * fps)
      const start = currentFrame
      currentFrame += durationFrames
      return { start, duration: durationFrames }
    })
  }, [sections, fps])

  // Measure each section's vertical center after mount
  useLayoutEffect(() => {
    setCenters(
      sectionRefs.current.map((el) => {
        if (!el) return 0
        return el.offsetTop + el.offsetHeight / 2
      }),
    )
  }, [sections])

  // Scroll position: interpolate linearly between section centers.
  // Each section's start frame maps to its center being at viewport center.
  // Remotion interpolate() lerps linearly between keypoints, giving
  // smooth continuous motion with no stuttering.
  const scrollY = useMemo(() => {
    if (centers.length < 2) return 0
    const inputRange = timings.map((t) => t.start)
    const outputRange = centers.map((c) => c - height / 2)
    const raw = interpolate(frame, inputRange, outputRange, {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    })
    // Round to 3 decimals to reduce unique subpixel values per frame,
    // but NOT to whole pixels (which causes visible stutter).
    return Math.round(raw * 1000) / 1000
  }, [frame, centers, timings, height])

  const fadeMask = 'linear-gradient(to bottom, transparent 0%, black 20%, black 80%, transparent 100%)'

  return (
    <Fill>
      {/* Background video (loops, muted) */}
      <Video
        src={backgroundSrc}
        muted
        loop
        objectFit="cover"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          filter: 'blur(30px)',
          transform: 'scale(1.05)',
        }}
      />

      {/* Scrolling content with fade mask */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          maskImage: fadeMask,
          WebkitMaskImage: fadeMask,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            transform: `translateY(${-scrollY}px)`,
            paddingTop: height / 2,
            paddingBottom: height / 2,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            willChange: 'transform',
          }}
        >
          {sections.map((section, i) => (
            <div
              key={i}
              ref={(el) => {
                sectionRefs.current[i] = el
              }}
              style={{
                width: maxWidth,
                fontSize,
                fontFamily: FONT_SANS,
                color: '#ffffff',
                marginBottom: 56,
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
