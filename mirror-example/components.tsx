'use client'

/**
 * MirrorShowcase — mirrored egaki motion graphics sequence.
 *
 * A vertical 1080x1350 artboard scaled into 1920x1080. Two mirrored
 * galleries of masked phone screenshots fan out from center while serif
 * text transitions between "Motion graphics" and "egaki".
 *
 * Animation phases:
 *   0-1000ms    Frame bars spread apart, "Motion graphics" scales down
 *   600-2500ms  Masked image cards appear with staggered resize reveals
 *   864-2490ms  Visual groups scale 2→0.5 and spread ±200px
 *   2052-3362ms Visual groups scale further to 0.3
 *   2400-2960ms Cards hide in staggered sequence
 *   2500-3700ms "egaki" appears, bars return, URL slides in
 *
 * Easing: custom cubic-bezier curves tuned for the mirrored reveal.
 */

import { useEffect } from 'react'
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import { cubicBezier, EASE, Img, smoothEasing } from 'egaki/video'
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
// Easing functions (precomputed from data)
// ---------------------------------------------------------------------------

const E = {
  smooth50: EASE.smooth,
  smooth100: smoothEasing(100),
  socialScale: cubicBezier(...EASINGS.socialScale),
  socialOpacity: cubicBezier(...EASINGS.socialOpacity),
  groupPhase1: cubicBezier(...EASINGS.groupPhase1),
  groupPhase2: cubicBezier(...EASINGS.groupPhase2),
  liveScale: cubicBezier(...EASINGS.liveScale),
  liveTextIn: cubicBezier(...EASINGS.liveTextIn),
  wwwTextIn: cubicBezier(...EASINGS.wwwTextIn),
  wwwLetterEasing: cubicBezier(...EASINGS.wwwLetterEasing),
  barReturn: cubicBezier(...EASINGS.barReturn),
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
// "Motion graphics" text — scales down and fades
// ---------------------------------------------------------------------------

function MotionGraphicsText({ frame, fps }: { frame: number; fps: number }) {
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
// "egaki" text — scales in + per-letter textIn
// ---------------------------------------------------------------------------

function EgakiText({ frame, fps }: { frame: number; fps: number }) {
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
// "egaki.video" text — textIn + slide from X offset
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

  // The mask rect has 10px padding within its group.
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
      {/* egaki Img (not plain <img>): calls delayRender() while loading so
          offscreen exports/screenshots never capture missing images. */}
      <Img
        src={imageSrc}
        style={{
          position: 'absolute',
          left: card.imgX - 10 - maskOffsetX,
          top: card.imgY - 10 - maskOffsetY,
          width: card.imgWidth,
          height: card.imgHeight,
          maxWidth: 'none',
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
        // Move offset is applied to position so scale stays centered on the
        // translated group.
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

const GOOGLE_FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Lora:wght@400&family=Roboto+Mono:wght@400&display=swap'

/** Load Google Fonts into document.head instead of rendering a <link> inside
 *  the composition: offscreen renders (screenshot/export via drawElementImage)
 *  fail to draw subtrees that contain a loading external stylesheet. */
function useGoogleFonts() {
  useEffect(() => {
    if (document.head.querySelector(`link[href="${GOOGLE_FONTS_HREF}"]`)) return
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = GOOGLE_FONTS_HREF
    document.head.appendChild(link)
  }, [])
}

export function MirrorShowcase() {
  const frame = useCurrentFrame()
  const { fps, width, height } = useVideoConfig()
  const scale = Math.min(width / ARTBOARD.width, height / (ARTBOARD.height + 810))
  useGoogleFonts()

  return (
    <AbsoluteFill style={{ backgroundColor: ARTBOARD.background }}>

      {/* Scaled artboard container.
          Uses CSS `zoom` instead of `transform: scale()`: Chromium's
          experimental drawElementImage (html-in-canvas, used by
          @remotion/web-renderer screenshots/exports) silently fails to draw
          subtrees where a transformed element contains further transformed
          children under this scaled container — the whole artboard came out
          black. `zoom` scales layout without a transform matrix and renders
          correctly in both the live player and offscreen exports.
          Note: Chromium multiplies the element's own left/top by its zoom
          factor, so the centering offset is divided by `scale` here. */}
      <div
        style={{
          position: 'absolute',
          left: (width - ARTBOARD.width * scale) / 2 / scale,
          top: 0,
          width: ARTBOARD.width,
          height: ARTBOARD.height,
          zoom: scale,
          overflow: 'visible',
        }}
      >
        {/* "Motion graphics" text */}
        <MotionGraphicsText frame={frame} fps={fps} />

        {/* Visual groups (rendered behind "egaki") */}
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

        {/* "egaki" text */}
        <EgakiText frame={frame} fps={fps} />

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
