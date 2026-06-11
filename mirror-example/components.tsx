'use client'

/**
 * MirrorShowcase — recreation of the Jitter "Mirror: Social Media Showcase".
 *
 * A vertical 1080x1350 artboard scaled to fit 1920x1080. Two mirrored
 * galleries of masked phone screenshots fan out from center while serif
 * text transitions between "Social template" and "Live on Jitter".
 *
 * Animation phases:
 *   0-1000ms    Frame bars spread apart, "Social template" scales down
 *   600-2500ms  Masked image cards appear with staggered resize reveals
 *   864-2490ms  Visual groups scale 2→0.5 and spread ±200px
 *   2052-3362ms Visual groups scale further to 0.3
 *   2400-2960ms Cards hide in staggered sequence
 *   2500-3700ms "Live on Jitter" appears, bars return, URL slides in
 *
 * Easing: all curves are exact cubic-bezier values extracted from Jitter's
 * webpack bundle. No approximations or preset substitutions.
 */

import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import {
  ANIM,
  ARTBOARD,
  EASINGS,
  FRAME,
  LEFT_IMAGES,
  LIVE_TEXT,
  RIGHT_IMAGES,
  SOCIAL_TEXT,
  VISUAL_CARDS,
  VISUAL_LEFT,
  VISUAL_RIGHT,
  type VisualCard,
} from './data'

// ---------------------------------------------------------------------------
// Layout: scale 1080x1350 artboard to fit 1920x1080
// ---------------------------------------------------------------------------

const COMP_W = 1920
const COMP_H = 1080

/** Scale factor to fit artboard height into composition */
const SCALE = Math.min(COMP_W / ARTBOARD.width, COMP_H / ARTBOARD.height)
/** Center the scaled artboard horizontally */
const OFFSET_X = (COMP_W - ARTBOARD.width * SCALE) / 2
const OFFSET_Y = (COMP_H - ARTBOARD.height * SCALE) / 2

// ---------------------------------------------------------------------------
// Easing functions (precomputed from data)
// ---------------------------------------------------------------------------

const E = {
  smooth50: Easing.bezier(...EASINGS.smooth50),
  smooth100: Easing.bezier(...EASINGS.smooth100),
  socialScale: Easing.bezier(...EASINGS.socialScale),
  socialOpacity: Easing.bezier(...EASINGS.socialOpacity),
  groupPhase1: Easing.bezier(...EASINGS.groupPhase1),
  groupPhase2: Easing.bezier(...EASINGS.groupPhase2),
  liveScale: Easing.bezier(...EASINGS.liveScale),
  liveTextIn: Easing.bezier(...EASINGS.liveTextIn),
  wwwTextIn: Easing.bezier(...EASINGS.wwwTextIn),
  wwwLetterEasing: Easing.bezier(...EASINGS.wwwLetterEasing),
  barReturn: Easing.bezier(...EASINGS.barReturn),
}

// ---------------------------------------------------------------------------
// Animation helpers
// ---------------------------------------------------------------------------

function msToFrame(ms: number, fps: number) {
  return (ms / 1000) * fps
}

function interpClamp(
  frame: number,
  startMs: number,
  endMs: number,
  from: number,
  to: number,
  fps: number,
  easing: (t: number) => number,
) {
  return interpolate(frame, [msToFrame(startMs, fps), msToFrame(endMs, fps)], [from, to], {
    easing,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
}

// ---------------------------------------------------------------------------
// Frame bars
// ---------------------------------------------------------------------------

function FrameBars({ frame, fps }: { frame: number; fps: number }) {
  const { barSpread, barReturn: barRet, barHideMs, barShowMs } = ANIM

  // Bar spread offset (0 → +420 for left, 0 → -420 for right)
  const spreadProgress = interpClamp(frame, barSpread.startMs, barSpread.endMs, 0, 1, fps, E.smooth100)
  // Bar return offset (+420 → 0 for left, -420 → 0 for right)
  const returnProgress = interpClamp(frame, barRet.startMs, barRet.endMs, 0, 1, fps, E.barReturn)

  const leftOffset = barSpread.distance * spreadProgress - barRet.distance * returnProgress
  const rightOffset = -barSpread.distance * spreadProgress + barRet.distance * returnProgress

  // Visibility: hidden between barHideMs and barShowMs
  const timeMs = (frame / fps) * 1000
  const visible = timeMs < barHideMs || timeMs >= barShowMs

  if (!visible) return null

  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: FRAME.leftBar.x,
          top: FRAME.leftBar.y,
          width: FRAME.leftBar.width,
          height: FRAME.leftBar.height,
          backgroundColor: FRAME.leftBar.color,
          transform: `translateX(${leftOffset}px)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: FRAME.rightBar.x,
          top: FRAME.rightBar.y,
          width: FRAME.rightBar.width,
          height: FRAME.rightBar.height,
          backgroundColor: FRAME.rightBar.color,
          transform: `translateX(${rightOffset}px)`,
        }}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Text with per-letter animation (textIn effect)
// ---------------------------------------------------------------------------

function AnimatedText({
  text,
  startMs,
  letterDurationMs,
  offsetMs,
  travelY,
  easing,
  frame,
  fps,
  style,
}: {
  text: string
  startMs: number
  letterDurationMs: number
  offsetMs: number
  travelY: number
  easing: (t: number) => number
  frame: number
  fps: number
  style?: React.CSSProperties
}) {
  return (
    <span style={{ display: 'inline-flex', ...style }}>
      {text.split('').map((char, i) => {
        const charStartMs = startMs + i * offsetMs
        const charEndMs = charStartMs + letterDurationMs
        const progress = interpClamp(frame, charStartMs, charEndMs, 0, 1, fps, easing)
        const y = travelY * (1 - progress)
        const opacity = progress

        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              transform: `translateY(${y}px)`,
              opacity,
              whiteSpace: char === ' ' ? 'pre' : undefined,
            }}
          >
            {char}
          </span>
        )
      })}
    </span>
  )
}

// ---------------------------------------------------------------------------
// "Social template" text — scales down and fades
// ---------------------------------------------------------------------------

function SocialTemplateText({ frame, fps }: { frame: number; fps: number }) {
  const scale = interpClamp(
    frame, ANIM.socialScale.startMs, ANIM.socialScale.endMs,
    ANIM.socialScale.from, ANIM.socialScale.to, fps, E.socialScale,
  )
  const opacity = interpClamp(
    frame, ANIM.socialOpacity.startMs, ANIM.socialOpacity.endMs,
    ANIM.socialOpacity.from, ANIM.socialOpacity.to, fps, E.socialOpacity,
  )

  return (
    <div
      style={{
        position: 'absolute',
        left: SOCIAL_TEXT.x,
        top: SOCIAL_TEXT.y,
        width: SOCIAL_TEXT.width,
        height: SOCIAL_TEXT.height,
        fontSize: SOCIAL_TEXT.fontSize,
        fontFamily: SOCIAL_TEXT.fontFamily,
        color: SOCIAL_TEXT.color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transform: `scale(${scale})`,
        opacity,
        whiteSpace: 'nowrap',
      }}
    >
      {SOCIAL_TEXT.text}
    </div>
  )
}

// ---------------------------------------------------------------------------
// "Live on Jitter" text — scales in + per-letter textIn
// ---------------------------------------------------------------------------

function LiveOnJitterText({ frame, fps }: { frame: number; fps: number }) {
  const scale = interpClamp(
    frame, ANIM.liveScale.startMs, ANIM.liveScale.endMs,
    ANIM.liveScale.from, ANIM.liveScale.to, fps, E.liveScale,
  )

  // Only visible after textIn starts (first letter begins animating)
  const timeMs = (frame / fps) * 1000
  if (timeMs < ANIM.liveTextIn.startMs - 100) return null

  return (
    <div
      style={{
        position: 'absolute',
        left: LIVE_TEXT.x,
        top: LIVE_TEXT.y,
        width: LIVE_TEXT.width,
        height: LIVE_TEXT.height,
        fontSize: LIVE_TEXT.fontSize,
        fontFamily: LIVE_TEXT.fontFamily,
        color: LIVE_TEXT.color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transform: `scale(${scale})`,
        overflow: 'hidden',
        whiteSpace: 'nowrap',
      }}
    >
      <AnimatedText
        text={LIVE_TEXT.text}
        startMs={ANIM.liveTextIn.startMs}
        letterDurationMs={ANIM.liveTextIn.letterDurationMs}
        offsetMs={ANIM.liveTextIn.offsetMs}
        travelY={ANIM.liveTextIn.travelY}
        easing={E.liveTextIn}
        frame={frame}
        fps={fps}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// "www.website.com" text — textIn + slide from X offset
// ---------------------------------------------------------------------------

function UrlText({ frame, fps }: { frame: number; fps: number }) {
  const timeMs = (frame / fps) * 1000
  if (timeMs < ANIM.wwwTextIn.startMs - 100) return null

  const slideX = interpClamp(
    frame, ANIM.wwwMove.startMs, ANIM.wwwMove.endMs,
    ANIM.wwwMove.fromX, 0, fps, E.barReturn,
  )

  return (
    <div
      style={{
        position: 'absolute',
        left: FRAME.urlText.x,
        top: FRAME.urlText.y,
        width: FRAME.urlText.width,
        height: FRAME.urlText.height,
        fontSize: FRAME.urlText.fontSize,
        fontFamily: FRAME.urlText.fontFamily,
        color: FRAME.urlText.color,
        transform: `translateX(${slideX}px)`,
        overflow: 'hidden',
        whiteSpace: 'nowrap',
      }}
    >
      <AnimatedText
        text={FRAME.urlText.text}
        startMs={ANIM.wwwTextIn.startMs}
        letterDurationMs={ANIM.wwwTextIn.letterDurationMs}
        offsetMs={ANIM.wwwTextIn.offsetMs}
        travelY={ANIM.wwwTextIn.travelY}
        easing={E.wwwLetterEasing}
        frame={frame}
        fps={fps}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Single masked visual card
// ---------------------------------------------------------------------------

function MaskedCard({
  card,
  imageSrc,
  frame,
  fps,
}: {
  card: VisualCard
  imageSrc: string
  frame: number
  fps: number
}) {
  const timeMs = (frame / fps) * 1000

  // Visibility
  if (timeMs < card.showMs || timeMs >= card.hideMs) return null

  // Mask resize: 0x0 → full size
  const resizeProgress = interpClamp(
    frame, card.resizeStartMs, card.resizeEndMs, 0, 1, fps, E.smooth50,
  )
  const maskW = card.maskWidth * resizeProgress
  const maskH = card.maskHeight * resizeProgress

  // The mask rect in Jitter has padding (x:10, y:10 within the maskGrp).
  // The resize grows from center, so offset by half the unresized portion.
  const maskOffsetX = (card.maskWidth - maskW) / 2
  const maskOffsetY = (card.maskHeight - maskH) / 2

  return (
    <div
      style={{
        position: 'absolute',
        left: card.x + 10 + maskOffsetX,
        top: -10 + 10 + maskOffsetY,
        width: maskW,
        height: maskH,
        overflow: 'hidden',
        transform: `scale(${card.initialScale})`,
        transformOrigin: 'center center',
      }}
    >
      <img
        src={imageSrc}
        style={{
          position: 'absolute',
          left: card.imgX - 10 - maskOffsetX,
          top: card.imgY - 10 - maskOffsetY,
          width: card.imgWidth,
          height: card.imgHeight,
        }}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Visual group — computes group-level scale and move, renders all cards
// ---------------------------------------------------------------------------

function VisualGroup({
  groupX,
  groupY,
  moveDirection,
  angle,
  images,
  frame,
  fps,
}: {
  groupX: number
  groupY: number
  /** +1 for left group (moves right), -1 for right group (moves left) */
  moveDirection: 1 | -1
  /** Base rotation angle in degrees (0 for right, -180 for left = mirror) */
  angle: number
  images: readonly string[]
  frame: number
  fps: number
}) {
  const { groupPhase1, groupPhase2 } = ANIM
  const timeMs = (frame / fps) * 1000

  // Phase 1: scale from 2 to 0.5 (864-2490ms)
  // Phase 2: scale from handoff value to 0.3 (2052-3362ms)
  // Phase 2 starts during Phase 1, taking over from the current value.
  let groupScale: number

  if (timeMs < groupPhase1.startMs) {
    groupScale = groupPhase1.scaleFrom
  } else if (timeMs < groupPhase2.startMs) {
    // Phase 1 active
    groupScale = interpClamp(
      frame, groupPhase1.startMs, groupPhase1.endMs,
      groupPhase1.scaleFrom, groupPhase1.scaleTo, fps, E.groupPhase1,
    )
  } else {
    // Phase 2 takes over — compute handoff value from Phase 1 at Phase 2 start
    const handoffScale = interpClamp(
      msToFrame(groupPhase2.startMs, fps),
      groupPhase1.startMs, groupPhase1.endMs,
      groupPhase1.scaleFrom, groupPhase1.scaleTo, fps, E.groupPhase1,
    )
    groupScale = interpClamp(
      frame, groupPhase2.startMs, groupPhase2.endMs,
      handoffScale, groupPhase2.scaleTo, fps, E.groupPhase2,
    )
  }

  // Move offset (only phase 1)
  const moveProgress = interpClamp(
    frame, groupPhase1.startMs, groupPhase1.endMs, 0, 1, fps, E.groupPhase1,
  )
  const moveX = moveDirection * groupPhase1.moveX * moveProgress

  return (
    <div
      style={{
        position: 'absolute',
        // Move offset applied to position, not transform — matches Jitter's
        // behavior where move changes the element's x/y, then scale is applied
        // from the element's center at the new position.
        left: groupX + moveX,
        top: groupY,
        width: 666,
        height: 324,
        transform: `rotate(${angle}deg) scale(${groupScale})`,
        transformOrigin: 'center center',
      }}
    >
      {VISUAL_CARDS.map((card, i) => (
        <MaskedCard
          key={i}
          card={card}
          imageSrc={images[i]}
          frame={frame}
          fps={fps}
        />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main composition
// ---------------------------------------------------------------------------

export function MirrorShowcase() {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  return (
    <AbsoluteFill style={{ backgroundColor: ARTBOARD.background }}>
      {/* Google Fonts */}
      <link
        href="https://fonts.googleapis.com/css2?family=Lora:wght@400&family=Roboto+Mono:wght@400&display=swap"
        rel="stylesheet"
      />

      {/* Scaled artboard container */}
      <div
        style={{
          position: 'absolute',
          left: OFFSET_X,
          top: OFFSET_Y,
          width: ARTBOARD.width,
          height: ARTBOARD.height,
          transform: `scale(${SCALE})`,
          transformOrigin: 'top left',
          overflow: 'hidden',
        }}
      >
        {/* "Social template" text */}
        <SocialTemplateText frame={frame} fps={fps} />

        {/* Visual groups (rendered behind "Live on Jitter") */}
        <VisualGroup
          groupX={VISUAL_LEFT.x}
          groupY={VISUAL_LEFT.y}
          moveDirection={1}
          angle={-180}
          images={LEFT_IMAGES}
          frame={frame}
          fps={fps}
        />
        <VisualGroup
          groupX={VISUAL_RIGHT.x}
          groupY={VISUAL_RIGHT.y}
          moveDirection={-1}
          angle={0}
          images={RIGHT_IMAGES}
          frame={frame}
          fps={fps}
        />

        {/* "Live on Jitter" text */}
        <LiveOnJitterText frame={frame} fps={fps} />

        {/* Frame group */}
        <div
          style={{
            position: 'absolute',
            left: FRAME.x,
            top: FRAME.y,
            width: FRAME.width,
            height: FRAME.height,
          }}
        >
          {/* Tick marks */}
          <div
            style={{
              position: 'absolute',
              left: FRAME.tickTop.x,
              top: FRAME.tickTop.y,
              width: FRAME.tickTop.width,
              height: FRAME.tickTop.height,
              backgroundColor: FRAME.tickTop.color,
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: FRAME.tickBottom.x,
              top: FRAME.tickBottom.y,
              width: FRAME.tickBottom.width,
              height: FRAME.tickBottom.height,
              backgroundColor: FRAME.tickBottom.color,
            }}
          />

          {/* Animated bars */}
          <FrameBars frame={frame} fps={fps} />

          {/* URL text */}
          <UrlText frame={frame} fps={fps} />
        </div>
      </div>
    </AbsoluteFill>
  )
}
