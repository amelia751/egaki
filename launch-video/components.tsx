'use client'

/**
 * Components for the egaki launch video.
 *
 * Reuses scene components from other example projects via workspace
 * dependencies (re-exported below so the MDX client module map can
 * resolve them through this local file), plus a few launch-specific
 * components: screen-recording placeholders, animated code anatomy,
 * montage caption, and the egaki outro.
 */

import { Sequence, interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import { CodeBlock, EASE, Fill, Video, dspring } from 'egaki/video'

// --- Reused scene components from other examples (workspace deps) ----------

import { TestimonialCard } from 'example-testimonial/components'
export { TestimonialCard }
export { MirrorShowcase } from 'example-mirror/components'
export { WordRevealTitle, PromptCard } from 'claude-fusion-launch/components'
export { ImageMontage } from 'example-sun-montage/components'

const SERIF = 'Georgia, "Times New Roman", serif'
const MONO = '"SF Mono", "Roboto Mono", Menlo, monospace'

const clamp = {
  extrapolateLeft: 'clamp',
  extrapolateRight: 'clamp',
} as const

/* ------------------------------------------------------------------ */
/* Screen recording placeholder - swapped for real footage later       */
/* ------------------------------------------------------------------ */

export function RecordingPlaceholder({
  label,
  sublabel,
}: {
  label: string
  sublabel?: string
}) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const enter = interpolate(frame, [0, 0.5 * fps], [0, 1], {
    ...clamp,
    easing: EASE.smooth,
  })
  const drift = interpolate(frame, [0, 6 * fps], [1, 1.03], clamp)
  const recOn = Math.floor(frame / (0.6 * fps)) % 2 === 0
  return (
    <Fill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div
        style={{
          width: 1560,
          height: 840,
          borderRadius: 24,
          border: '2px dashed rgba(255,255,255,0.25)',
          backgroundColor: 'rgba(255,255,255,0.04)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 28,
          opacity: enter,
          transform: `scale(${Math.round(drift * 1000) / 1000})`,
          willChange: 'transform',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: '50%',
              backgroundColor: '#ff4444',
              opacity: recOn ? 1 : 0.25,
            }}
          />
          <span
            style={{
              fontFamily: MONO,
              fontSize: 30,
              letterSpacing: '0.12em',
              color: 'rgba(255,255,255,0.55)',
            }}
          >
            SCREEN RECORDING
          </span>
        </div>
        <div
          style={{
            fontFamily: SERIF,
            fontSize: 52,
            color: 'rgba(255,255,255,0.92)',
            textAlign: 'center',
            maxWidth: 1200,
            lineHeight: 1.3,
          }}
        >
          {label}
        </div>
        {sublabel ? (
          <div
            style={{
              fontFamily: MONO,
              fontSize: 28,
              color: 'rgba(255,255,255,0.45)',
            }}
          >
            {sublabel}
          </div>
        ) : null}
      </div>
    </Fill>
  )
}

/* ------------------------------------------------------------------ */
/* Code scene - centered CodeBlock; the code string is passed as a     */
/* prop because safe-mdx does not evaluate expression children, only   */
/* attribute expressions. Optional highlight groups step on the beat.  */
/* ------------------------------------------------------------------ */

export function CodeScene({
  code,
  highlightGroups = [[]],
  beatsPerGroup = 4,
  beat = 1,
  theme = 'vercel',
  title,
  fontSize = 22,
  width = 1150,
}: {
  code: string
  /** Line-number groups highlighted one after the other. */
  highlightGroups?: number[][]
  beatsPerGroup?: number
  /** Frames per beat, pass the BEAT scope variable. */
  beat?: number
  theme?: string
  title?: string
  fontSize?: number
  width?: number
}) {
  const frame = useCurrentFrame()
  const group = Math.min(
    Math.floor(frame / (beatsPerGroup * beat)),
    highlightGroups.length - 1,
  )
  return (
    <Fill style={{ alignItems: 'center', justifyContent: 'center' }}>
      {/* showBackground=false drops the theme's gray gradient plate so the
          code window blends into the scene's pure black background. */}
      <CodeBlock
        theme={theme}
        title={title}
        fontSize={fontSize}
        width={width}
        highlightLines={highlightGroups[group]}
        showBackground={false}
      >
        {code}
      </CodeBlock>
    </Fill>
  )
}

/* ------------------------------------------------------------------ */
/* Light swipe transition - 4K overlay clip with black background,     */
/* blended with screen mode so black reads as transparent. Placed at   */
/* the very end of a scene: the clip finishes exactly on the cut.      */
/* ------------------------------------------------------------------ */

export function LightSwipe({
  src,
  peakSec,
  playbackRate = 1,
  opacity = 1,
}: {
  src: string
  /**
   * Time of the clip's brightest flash (measured with ffmpeg signalstats).
   * The clip is positioned so this peak lands right at the scene cut; the
   * black tail after the flash is cut off by the section boundary.
   */
  peakSec: number
  playbackRate?: number
  opacity?: number
}) {
  const { durationInFrames, fps } = useVideoConfig()
  // Peak lands 2 frames before the cut so the flash is perceivable pre-cut.
  const from = Math.max(0, durationInFrames - Math.round((peakSec / playbackRate) * fps) - 2)
  return (
    <Sequence from={from} layout="none">
      <Fill style={{ opacity, pointerEvents: 'none' }}>
        {/* Screen blend: black pixels become transparent so only the light
            streaks overlay the scene. The contrast crush pushes near-black
            noise fully to black so no grey veil washes over the frame. */}
        <Video
          src={src}
          playbackRate={playbackRate}
          muted
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            mixBlendMode: 'screen',
            filter: 'brightness(0.75) contrast(2.2)',
          }}
        />
      </Fill>
    </Sequence>
  )
}

/* ------------------------------------------------------------------ */
/* TypewriterTitle - character-by-character reveal synced to the TTS   */
/* voiceover. Word timings come from `egaki transcribe` on the         */
/* generated speech wav. Full text is laid out invisibly so centered   */
/* lines never shift while typing; the caret is zero-width.            */
/* ------------------------------------------------------------------ */

export function TypewriterTitle({
  words,
  fontSize = 92,
  color = '#ffffff',
}: {
  /** Word timings in seconds from section start. `br` starts a new line. */
  words: { text: string; startSec: number; endSec: number; br?: boolean }[]
  fontSize?: number
  color?: string
}) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const t = frame / fps

  const lines: (typeof words)[] = [[]]
  for (const w of words) {
    if (w.br && lines[lines.length - 1]!.length > 0) lines.push([])
    lines[lines.length - 1]!.push(w)
  }

  // Caret sits after the last word that has started typing, blinks while
  // typing and for a beat after, then disappears.
  let activeIndex = -1
  words.forEach((w, i) => {
    if (t >= w.startSec) activeIndex = i
  })
  const lastEnd = words[words.length - 1]?.endSec ?? 0
  const caretOn = t < lastEnd + 1 && Math.floor(t * 2.4) % 2 === 0

  let globalIndex = -1
  return (
    <Fill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div
        style={{
          fontFamily: SERIF,
          fontSize,
          color,
          textAlign: 'center',
          lineHeight: 1.25,
          letterSpacing: '-0.01em',
        }}
      >
        {lines.map((line, li) => (
          <div key={li}>
            {line.map((w, wi) => {
              globalIndex += 1
              const isActive = globalIndex === activeIndex
              const p = interpolate(t, [w.startSec, w.endSec], [0, 1], clamp)
              const visible = Math.round(p * w.text.length)
              const trail = wi < line.length - 1 ? ' ' : ''
              return (
                <span key={wi}>
                  {w.text.slice(0, visible)}
                  {isActive && caretOn ? (
                    // position:absolute keeps the caret out of flow at the
                    // current inline position, so it can never wrap lines.
                    <span style={{ position: 'absolute', opacity: 0.9 }}>|</span>
                  ) : null}
                  <span style={{ opacity: 0 }}>{w.text.slice(visible)}</span>
                  {trail}
                </span>
              )
            })}
          </div>
        ))}
      </div>
    </Fill>
  )
}

/* ------------------------------------------------------------------ */
/* DriftZoom - constant subtle camera drift (docs/patterns.md).        */
/* Linear zoom from 1 to `to` across the whole section so no scene is  */
/* ever fully static. Slow enough that the viewer doesn't notice it.   */
/* ------------------------------------------------------------------ */

export function DriftZoom({
  to = 1.06,
  children,
}: {
  to?: number
  children: React.ReactNode
}) {
  const frame = useCurrentFrame()
  const { durationInFrames } = useVideoConfig()
  const s = Math.round((1 + (to - 1) * (frame / durationInFrames)) * 1000) / 1000
  return (
    <Fill style={{ transform: `scale(${s})`, willChange: 'transform' }}>
      {children}
    </Fill>
  )
}

/* ------------------------------------------------------------------ */
/* EgakiTestimonial - TestimonialCard branded for egaki: serif         */
/* wordmark logo instead of the Mango SVG sprite, egaki.video URL.     */
/* ------------------------------------------------------------------ */

export function EgakiTestimonial() {
  return (
    <TestimonialCard
      quote="egaki writes our launch videos for us. Every release ships with a video now. Highly recommend!"
      author="John Doe, CEO of Acme"
      portraitSrc="/images/portrait.jpg"
      backgroundSrc=""
      url="egaki.video"
      speed={1.6}
      logo={
        <div
          style={{
            fontFamily: SERIF,
            fontSize: 44,
            fontWeight: 600,
            color: '#ffffff',
            letterSpacing: '-0.02em',
          }}
        >
          egaki
        </div>
      }
    />
  )
}

/* ------------------------------------------------------------------ */
/* Screen recording - rounded window with spring entrance, ambient     */
/* glow and slow zoom drift. Plays a pre-cropped/sped-up mp4.          */
/* ------------------------------------------------------------------ */

export function ScreenRecording({
  src,
  width = 1440,
  aspectRatio = 1280 / 840,
}: {
  src: string
  width?: number
  aspectRatio?: number
}) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const enter = dspring(frame, fps, 0.6, 0)
  const drift = interpolate(frame, [0, 6 * fps], [0, 0.03], clamp)
  const s = Math.round((0.94 + enter * 0.06 + drift) * 1000) / 1000
  return (
    <Fill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div
        style={{
          width,
          height: width / aspectRatio,
          borderRadius: 18,
          overflow: 'hidden',
          border: '1px solid rgba(255,255,255,0.14)',
          // Scene bg is black, so a dark drop shadow is invisible - use a
          // faint blue ambient glow to lift the window off the background.
          boxShadow: '0 0 140px rgba(90, 110, 255, 0.22)',
          opacity: enter,
          transform: `scale(${s}) translateY(${(1 - enter) * 40}px)`,
          willChange: 'transform',
        }}
      >
        <Video src={src} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
    </Fill>
  )
}

/* ------------------------------------------------------------------ */
/* ExportButtonZoom - the export recording zoomed on the Export MP4    */
/* button. Uses CSS `zoom` instead of transform scale so the inner     */
/* magnification never nests transforms inside the section transforms  */
/* (Chromium drawElementImage silently drops nested-transform subtrees */
/* during export). `left`/`top` are divided by the zoom factor because */
/* Chromium zooms the element's own offsets too.                       */
/* ------------------------------------------------------------------ */

export function ExportButtonZoom({
  src,
  width = 1440,
  aspectRatio = 1280 / 840,
  // Export MP4 button center within the cropped clip (595, 797 of 1280x840)
  focusX = 0.465,
  focusY = 0.949,
  zoom = 2.7,
}: {
  src: string
  width?: number
  aspectRatio?: number
  focusX?: number
  focusY?: number
  zoom?: number
}) {
  const frame = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()
  const height = width / aspectRatio
  // Slow linear zoom-in drift on top of the base magnification
  const z = zoom + (frame / durationInFrames) * 0.5
  const offX = Math.min(Math.max(focusX * width * z - width / 2, 0), width * z - width)
  const offY = Math.min(Math.max(focusY * height * z - height / 2, 0), height * z - height)
  const fadeIn = interpolate(frame, [0, 0.3 * fps], [0, 1], clamp)
  return (
    <Fill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div
        style={{
          width,
          height,
          borderRadius: 18,
          overflow: 'hidden',
          position: 'relative',
          border: '1px solid rgba(255,255,255,0.14)',
          boxShadow: '0 0 140px rgba(90, 110, 255, 0.22)',
          opacity: fadeIn,
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: -offX / z,
            top: -offY / z,
            width,
            height,
            zoom: z,
          }}
        >
          <Video src={src} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      </div>
    </Fill>
  )
}

/* ------------------------------------------------------------------ */
/* Montage caption - serif word reveal pinned to the lower third       */
/* ------------------------------------------------------------------ */

export function MontageCaption({
  text,
  startSec = 0.2,
}: {
  text: string
  startSec?: number
}) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const words = text.split(' ')
  return (
    <Fill style={{ alignItems: 'center', justifyContent: 'flex-end' }}>
      <div
        style={{
          marginBottom: 90,
          fontFamily: SERIF,
          fontSize: 58,
          color: '#ffffff',
          textAlign: 'center',
          letterSpacing: '-0.01em',
          padding: '18px 44px',
          borderRadius: 18,
          backgroundColor: 'rgba(0,0,0,0.55)',
        }}
      >
        {words.map((word, i) => {
          const start = (startSec + i * 0.14) * fps
          const o = interpolate(frame, [start, start + 0.4 * fps], [0, 1], {
            ...clamp,
            easing: EASE.decelerate,
          })
          return (
            <span key={i} style={{ opacity: o }}>
              {i > 0 ? ' ' : ''}
              {word}
            </span>
          )
        })}
      </div>
    </Fill>
  )
}

/* ------------------------------------------------------------------ */
/* Outro - egaki logotype, install command, domain                     */
/* ------------------------------------------------------------------ */

export function EgakiOutro() {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const enter = dspring(frame, fps, 0.7, 0)
  const cmdIn = interpolate(frame, [0.9 * fps, 1.5 * fps], [0, 1], {
    ...clamp,
    easing: EASE.decelerate,
  })
  const urlIn = interpolate(frame, [1.4 * fps, 2.0 * fps], [0, 1], {
    ...clamp,
    easing: EASE.decelerate,
  })
  return (
    <Fill
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 44,
      }}
    >
      <div
        style={{
          fontFamily: SERIF,
          fontSize: 190,
          fontWeight: 600,
          color: '#ffffff',
          letterSpacing: '-0.03em',
          opacity: enter,
          transform: `scale(${0.92 + enter * 0.08})`,
          willChange: 'transform',
        }}
      >
        egaki
      </div>
      <div
        style={{
          fontFamily: MONO,
          fontSize: 40,
          color: 'rgba(255,255,255,0.85)',
          backgroundColor: 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.18)',
          borderRadius: 14,
          padding: '18px 36px',
          opacity: cmdIn,
          transform: `translateY(${(1 - cmdIn) * 24}px)`,
        }}
      >
        npm i -g egaki
      </div>
      <div
        style={{
          fontFamily: SERIF,
          fontSize: 34,
          color: 'rgba(255,255,255,0.5)',
          opacity: urlIn,
        }}
      >
        Launch videos, written by agents.
      </div>
    </Fill>
  )
}
