/**
 * Components for the Claude x Autodesk Fusion launch video recreation.
 *
 * Template scenes: connector toggle card, serif word-reveal titles, Claude
 * chat prompt card with typing, gray chat bubbles, full-frame still images
 * with slow zoom drift (placeholders for screen recordings), exploded-view
 * showcase (text + image), and logo outro.
 *
 * Colors sampled from the original video:
 *   coral bg  #CF6E59   cream bg #F5F3ED   outro cream #EFEEE5
 *   text dark #191816   toggle blue #077FCD  claude coral accent #D9765F
 */
import React from 'react'
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import { EASE, Fill, Img, dspring } from 'egaki/video'

export const COLORS = {
  coral: '#CF6E59',
  cream: '#F5F3ED',
  outroCream: '#EFEEE5',
  ink: '#191816',
  toggleBlue: '#077FCD',
  accent: '#D9765F',
}

const SERIF = 'Georgia, "Times New Roman", serif'
const SANS =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif'

const clamp = {
  extrapolateLeft: 'clamp',
  extrapolateRight: 'clamp',
} as const

/* ------------------------------------------------------------------ */
/* Scene 1: Autodesk Fusion connector toggle card                      */
/* ------------------------------------------------------------------ */

export function FusionToggleCard({
  toggleAtSec = 1.1,
}: {
  toggleAtSec?: number
}) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  // Camera move: card starts small in the upper-left, drifts to center
  // while growing to full size (matches the original's opening zoom).
  // Accelerating: the original lingers left, then zooms in right before
  // the toggle flip.
  const move = interpolate(frame, [0, 1.5 * fps], [0, 1], {
    ...clamp,
    easing: EASE.accelerate,
  })
  const scale = 0.62 + 0.38 * move
  const tx = -560 * (1 - move)
  const ty = -240 * (1 - move)

  // Toggle knob slides right, track color changes
  const t = interpolate(
    frame,
    [toggleAtSec * fps, toggleAtSec * fps + 0.25 * fps],
    [0, 1],
    { ...clamp, easing: EASE.smooth },
  )

  return (
    <Fill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div
        style={{
          transform: `translate(${Math.round(tx * 10) / 10}px, ${Math.round(ty * 10) / 10}px) scale(${Math.round(scale * 1000) / 1000})`,
          willChange: 'transform',
          width: 1140,
          height: 300,
          borderRadius: 60,
          backgroundColor: '#EFEDE4',
          boxShadow: '0 24px 60px rgba(0,0,0,0.18)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 72px',
          gap: 48,
          margin: '0 auto',
        }}
      >
        <Img
          src="/fusion-icon.png"
          style={{ width: 152, height: 152, borderRadius: 32 }}
        />
        <div
          style={{
            fontFamily: SANS,
            fontSize: 64,
            fontWeight: 600,
            color: '#111',
            flex: 1,
          }}
        >
          Autodesk Fusion
        </div>
        {/* Toggle */}
        <div
          style={{
            width: 168,
            height: 92,
            borderRadius: 46,
            backgroundColor: t > 0.5 ? COLORS.toggleBlue : '#C9C7BE',
            position: 'relative',
            transition: 'none',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 8,
              left: 8 + t * 76,
              width: 76,
              height: 76,
              borderRadius: '50%',
              backgroundColor: 'white',
              boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
            }}
          />
        </div>
      </div>
    </Fill>
  )
}

/* ------------------------------------------------------------------ */
/* Serif title with word-by-word reveal (intro + section titles)       */
/* ------------------------------------------------------------------ */

export function WordRevealTitle({
  lines,
  fontSize = 88,
  color = COLORS.ink,
  wordStaggerSec = 0.12,
  wordDurationSec = 0.45,
  startSec = 0.15,
}: {
  lines: string[]
  fontSize?: number
  color?: string
  wordStaggerSec?: number
  wordDurationSec?: number
  startSec?: number
}) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  let wordIndex = 0
  return (
    <Fill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div
        style={{
          fontFamily: SERIF,
          fontSize,
          fontWeight: 600,
          color,
          textAlign: 'center',
          lineHeight: 1.25,
          letterSpacing: '-0.01em',
        }}
      >
        {lines.map((line, li) => (
          <div key={li}>
            {line.split(' ').map((word, wi) => {
              const start = (startSec + wordIndex * wordStaggerSec) * fps
              wordIndex += 1
              const o = interpolate(
                frame,
                [start, start + wordDurationSec * fps],
                [0, 1],
                { ...clamp, easing: EASE.decelerate },
              )
              return (
                <span key={wi} style={{ opacity: o }}>
                  {wi > 0 ? ' ' : ''}
                  {word}
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
/* Scene 4: Claude prompt card with greeting + typed text + send       */
/* ------------------------------------------------------------------ */

export function PromptCard({
  greeting = 'Hey there, Samuel',
  text,
  typeStartSec = 0.4,
  typeDurationSec = 1.7,
  sendAtSec,
}: {
  greeting?: string
  text: string
  typeStartSec?: number
  typeDurationSec?: number
  sendAtSec?: number
}) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const enter = dspring(frame, fps, 0.5, 0)

  const chars = Math.round(
    interpolate(
      frame,
      [typeStartSec * fps, (typeStartSec + typeDurationSec) * fps],
      [0, text.length],
      clamp,
    ),
  )
  const typed = text.slice(0, chars)
  const cursorOn = Math.floor(frame / (0.4 * fps)) % 2 === 0 || chars < text.length

  // Send button press: quick scale dip
  const sendPress =
    sendAtSec === undefined
      ? 0
      : interpolate(
          frame,
          [
            sendAtSec * fps,
            sendAtSec * fps + 0.1 * fps,
            sendAtSec * fps + 0.25 * fps,
          ],
          [0, 1, 0],
          clamp,
        )

  return (
    <Fill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div
        style={{
          width: 1350,
          margin: '0 auto',
          opacity: enter,
          transform: `translateY(${(1 - enter) * 40}px)`,
          willChange: 'transform',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 24,
            marginBottom: 56,
          }}
        >
          <Img src="/claude-asterisk.png" style={{ width: 64, height: 64 }} />
          <span
            style={{
              fontFamily: SERIF,
              fontSize: 72,
              color: '#3d3929',
              letterSpacing: '-0.01em',
            }}
          >
            {greeting}
          </span>
        </div>
        <div
          style={{
            backgroundColor: 'white',
            borderRadius: 28,
            boxShadow: '0 8px 30px rgba(0,0,0,0.06)',
            padding: '44px 48px 36px',
            minHeight: 280,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div
            style={{
              fontFamily: SANS,
              fontSize: 40,
              lineHeight: 1.45,
              color: '#1a1a17',
              minHeight: 130,
            }}
          >
            {typed}
            <span style={{ opacity: cursorOn ? 1 : 0 }}>|</span>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span style={{ fontFamily: SANS, fontSize: 44, color: '#555' }}>
              +
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
              <span style={{ fontFamily: SANS, fontSize: 32, color: '#3a3a35' }}>
                Opus 4.7 ⌄
              </span>
              <div
                style={{
                  width: 76,
                  height: 76,
                  borderRadius: 18,
                  backgroundColor: COLORS.accent,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontSize: 40,
                  transform: `scale(${1 - sendPress * 0.12})`,
                }}
              >
                ↑
              </div>
            </div>
          </div>
        </div>
      </div>
    </Fill>
  )
}

/* ------------------------------------------------------------------ */
/* Chat bubble (user question, gray rounded rect)                      */
/* ------------------------------------------------------------------ */

// `text` supports \n for explicit line breaks (rendered via pre-line)
export function ChatBubble({
  text,
  maxWidth = 1060,
  fontSize = 56,
}: {
  text: string
  maxWidth?: number
  fontSize?: number
}) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const enter = dspring(frame, fps, 0.55, 0.1)
  return (
    <Fill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div
        style={{
          margin: '0 auto',
          maxWidth,
          opacity: enter,
          transform: `translateY(${(1 - enter) * 60}px)`,
          willChange: 'transform',
          backgroundColor: '#E8E5DC',
          borderRadius: 24,
          padding: '34px 44px',
          fontFamily: SANS,
          fontSize,
          lineHeight: 1.45,
          color: '#1a1a17',
          whiteSpace: 'pre-line',
        }}
      >
        {text}
      </div>
    </Fill>
  )
}

/* ------------------------------------------------------------------ */
/* Full-frame still image with slow zoom drift (recording stand-in)    */
/* ------------------------------------------------------------------ */

export function StillFrame({
  src,
  from = 1,
  to = 1.02,
  origin = '50% 50%',
  fadeInSec = 0,
}: {
  src: string
  from?: number
  to?: number
  origin?: string
  fadeInSec?: number
}) {
  const frame = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()
  const scale = interpolate(frame, [0, durationInFrames], [from, to])
  const s = Math.round(scale * 1000) / 1000
  const o =
    fadeInSec > 0
      ? interpolate(frame, [0, fadeInSec * fps], [0, 1], clamp)
      : 1
  return (
    <Fill style={{ opacity: o }}>
      <div
        style={{
          width: '100%',
          height: '100%',
          transform: `scale(${s})`,
          transformOrigin: origin,
          willChange: 'transform',
        }}
      >
        <Img
          src={src}
          objectFit="cover"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        />
      </div>
    </Fill>
  )
}

/* ------------------------------------------------------------------ */
/* Exploded view showcase: serif text left + model image right         */
/* ------------------------------------------------------------------ */

export function TextAndModel({
  text,
  src,
  zoom = 1.45,
}: {
  text: string
  src: string
  zoom?: number
}) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const enter = interpolate(frame, [0, 0.6 * fps], [0, 1], {
    ...clamp,
    easing: EASE.smooth,
  })
  const drift = interpolate(frame, [0, 3 * fps], [1.0, 1.03], clamp)
  return (
    <Fill style={{ flexDirection: 'row', alignItems: 'center' }}>
      <div style={{ width: '38%', paddingLeft: 130 }}>
        <div
          style={{
            fontFamily: SERIF,
            fontSize: 56,
            color: COLORS.ink,
            lineHeight: 1.3,
            opacity: enter,
            transform: `translateY(${(1 - enter) * 30}px)`,
            marginBottom: 48,
          }}
        >
          {text}
        </div>
        <Img
          src="/claude-asterisk.png"
          style={{ width: 56, height: 56, opacity: enter }}
        />
      </div>
      <div
        style={{
          width: '62%',
          height: '100%',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <Img
          src={src}
          style={{
            width: '100%',
            // Multiply blend melts the still's white viewport background
            // into the cream scene background.
            mixBlendMode: 'multiply',
            transform: `scale(${Math.round(drift * zoom * 1000) / 1000})`,
            willChange: 'transform',
          }}
        />
      </div>
    </Fill>
  )
}

/* ------------------------------------------------------------------ */
/* Outro: Claude logo lockup                                           */
/* ------------------------------------------------------------------ */

export function ClaudeLogoOutro() {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const enter = dspring(frame, fps, 0.7, 0.15)
  const rotate = interpolate(frame, [0, 0.7 * fps], [-20, 0], {
    ...clamp,
    easing: EASE.smooth,
  })
  return (
    <Fill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 30,
          opacity: enter,
          transform: `scale(${0.9 + enter * 0.1})`,
          willChange: 'transform',
        }}
      >
        <Img
          src="/claude-asterisk.png"
          style={{
            width: 120,
            height: 120,
            transform: `rotate(${rotate}deg)`,
          }}
        />
        <span
          style={{
            fontFamily: SERIF,
            fontSize: 130,
            fontWeight: 600,
            color: COLORS.ink,
            letterSpacing: '-0.02em',
          }}
        >
          Claude
        </span>
      </div>
    </Fill>
  )
}
