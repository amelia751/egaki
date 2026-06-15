'use client'

/**
 * BentoShowreel — recreation of the Jitter "MODULAR 1-03" animation.
 *
 * A bento grid of SVG cards arranged in 5 off-screen screens around a
 * 1076x1076 clipped viewport. Cards scatter in 3 phases (vertical,
 * horizontal, vertical) with staggered timing and smooth easing.
 *
 * Layout strategy: the bento clip (1076x1076 in Jitter coordinates) is
 * scaled to fill the 1920x1080 composition height with padding, then
 * centered horizontally. All card positions and animation offsets stay
 * in the original coordinate system; a single CSS transform on the
 * outer container handles the scaling.
 */

import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import { EASE } from 'egaki/video'
import {
  ALL_ANIMATIONS,
  ARTBOARD,
  BENTO,
  OVERLAY_TEXTS,
  SCREENS,
  type Card,
  type MoveAnim,
} from './data'

// ---------------------------------------------------------------------------
// Layout: scale 1076x1076 bento to fill 1920x1080 with padding
// ---------------------------------------------------------------------------

const COMP_W = 1920
const COMP_H = 1080
const PADDING = 40

/** How much to scale the bento to fill the composition height */
const BENTO_SCALE = (COMP_H - PADDING * 2) / BENTO.clipSize
/** Rendered pixel size of the bento clip */
const BENTO_RENDERED = BENTO.clipSize * BENTO_SCALE
/** Center the 1076-wide clip area horizontally */
const BENTO_LEFT = (COMP_W - BENTO_RENDERED) / 2
const BENTO_TOP = PADDING
/**
 * Width of the outer container in local (pre-scale) coordinates.
 * Sized so that after scaling it spans the full composition width,
 * allowing cards to animate off-screen without being clipped early.
 */
const CONTAINER_LOCAL_W = COMP_W / BENTO_SCALE
/** Offset to center the 1076 clip within the wider container */
const CLIP_OFFSET_X = (CONTAINER_LOCAL_W - BENTO.clipSize) / 2

// Overlay sits below the bento, filling the bottom of the composition
const OVERLAY_TOP = BENTO_TOP + BENTO_RENDERED - 80
const OVERLAY_HEIGHT = COMP_H - OVERLAY_TOP

// ---------------------------------------------------------------------------
// Animation engine
// ---------------------------------------------------------------------------

/** Build a lookup table: cardId → list of animations targeting it. */
const animsByCard = new Map<string, MoveAnim[]>()
for (const anim of ALL_ANIMATIONS) {
  const list = animsByCard.get(anim.cardId)
  if (list) list.push(anim)
  else animsByCard.set(anim.cardId, [anim])
}

/**
 * Compute the cumulative (x, y) offset for a card at the current frame.
 * Each animation contributes its interpolated offset; they stack additively.
 */
function computeCardOffset(
  cardId: string,
  frame: number,
  fps: number,
): { x: number; y: number } {
  const anims = animsByCard.get(cardId)
  if (!anims) return { x: 0, y: 0 }

  let x = 0
  let y = 0

  for (const anim of anims) {
    const startFrame = (anim.startMs / 1000) * fps
    const endFrame = (anim.endMs / 1000) * fps

    const progress = interpolate(frame, [startFrame, endFrame], [0, 1], {
      easing: EASE.smooth,
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    })

    if (anim.moveX) x += anim.moveX * progress
    if (anim.moveY) y += anim.moveY * progress
  }

  return { x, y }
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function AnimatedCard({ card, screenX, screenY }: { card: Card; screenX: number; screenY: number }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const offset = computeCardOffset(card.id, frame, fps)

  return (
    <img
      src={card.src}
      alt={card.name}
      style={{
        position: 'absolute',
        left: screenX + card.x,
        top: screenY + card.y,
        width: card.width,
        height: card.height,
        borderRadius: 25,
        transform: `translate(${offset.x}px, ${offset.y}px)`,
        willChange: 'transform',
      }}
    />
  )
}

function Overlay() {
  const fontSize = 16
  const fontFamily = '"Space Mono", monospace'

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        bottom: 0,
        width: COMP_W,
        height: OVERLAY_HEIGHT,
      }}
    >
      {/* Gradient overlay: black at bottom, transparent at top */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(to top, #000000, transparent)',
          opacity: 0.5,
        }}
      />

      {/* Text row pinned to the bottom of the composition */}
      <div
        style={{
          position: 'absolute',
          left: BENTO_LEFT,
          right: COMP_W - BENTO_LEFT - BENTO_RENDERED,
          bottom: 20,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
        }}
      >
        {/* ΓICO® logotype */}
        <div
          style={{
            fontSize: 18,
            fontFamily,
            fontWeight: 700,
            color: 'white',
            opacity: 0.75,
            letterSpacing: 1,
            flexShrink: 0,
          }}
        >
          ΓICO.
        </div>

        {/* Spacer + text labels */}
        <div style={{ flex: 1, fontSize, fontFamily, color: 'white', opacity: 0.75, textAlign: 'center' }}>
          Modular
        </div>
        <div style={{ flex: 1, fontSize, fontFamily, color: 'white', opacity: 0.75, textAlign: 'center' }}>
          1-03 (LITE)
        </div>
        <div style={{ fontSize, fontFamily, color: 'white', opacity: 0.75, textAlign: 'right', flexShrink: 0 }}>
          RICO.SUPPLY
        </div>
      </div>
    </div>
  )
}

export function BentoShowreel() {
  return (
    <AbsoluteFill
      style={{
        backgroundColor: ARTBOARD.background,
        fontFamily: '"Space Mono", monospace',
      }}
    >
      {/* Google Fonts link for Space Mono */}
      <link
        href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap"
        rel="stylesheet"
      />

      {/*
        Wide container: spans the full composition width (in local coords)
        so cards animating horizontally aren't clipped early. Clips only
        at the composition edges. The rounded visual background and the
        animated cards are siblings, not parent/child, so the rounded
        border doesn't clip the cards.
      */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: BENTO_TOP,
          width: CONTAINER_LOCAL_W,
          height: BENTO.clipSize,
          transform: `scale(${BENTO_SCALE})`,
          transformOrigin: 'top left',
          overflow: 'hidden',
        }}
      >
        {/* Rounded visual background — purely decorative, no clipping */}
        <div
          style={{
            position: 'absolute',
            left: CLIP_OFFSET_X,
            top: 0,
            width: BENTO.clipSize,
            height: BENTO.clipSize,
            borderRadius: BENTO.clipRadius,
            backgroundColor: '#b3b3b3',
            overflow: 'hidden',
          }}
        >
          {/* White backing glow */}
          <div
            style={{
              position: 'absolute',
              left: -210,
              top: -210,
              width: 1500,
              height: 1500,
              backgroundColor: '#ffffff',
              opacity: 0.5,
            }}
          />
        </div>

        {/* Cards layer — positioned relative to the clip center, NOT clipped by rounded rect */}
        {SCREENS.map((screen) =>
          screen.cards.map((card) => (
            <AnimatedCard
              key={card.id}
              card={card}
              screenX={CLIP_OFFSET_X + screen.x}
              screenY={screen.y}
            />
          )),
        )}
      </div>

      {/* Bottom overlay with gradient and text */}
      <Overlay />
    </AbsoluteFill>
  )
}
