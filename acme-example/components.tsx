// AcmePromo — recreation of a Jitter website-promo template (16:9).
//
// Extracted from Jitter project NKzRvCExX2mIsKx8IgpQeVqE via Playwriter
// (window.app scene graph). A black frame and an image mask resize in from
// oversized while a B&W group photo zooms out from 1.2x. "www.acme.com"
// rises word-by-word behind per-word masks, drops back out, then the image
// mask collapses toward its bottom-right corner while the black frame grows
// back to its starting size, looping seamlessly.
//
// Implementation notes (see ../docs and the jitter skill PORTING guide):
// - resize ops animate width/height around an anchor: anchor center keeps
//   the rect's center fixed; anchor se keeps the bottom-right corner fixed.
// - move/resize go to CSS left/top/width/height; only the photo zoom uses
//   transform: scale() so transform-origin math stays trivial.
// - "slideAndMask" text: each word sits inside an overflow:hidden box that
//   is clipped to roughly the glyph bounds (all words are x-height-only,
//   no ascenders/descenders) so a 100px travel fully hides the word.

import { interpolate, useCurrentFrame, useVideoConfig, Easing } from 'remotion'
import { ARTBOARD, FRAME, MASK, PICTURE, TEXT } from './data'

type EasingFn = (t: number) => number

// ---------------------------------------------------------------------------
// Jitter legacy easing names → curves.
//
// This project uses the OLD simple easing names ("natural", "slowDown",
// "accelerate"), not the versioned "natural:standard:v1" presets. The curves
// were derived by sampling Jitter's /api/renderer/ output frame by frame and
// fitting cubic beziers (see the measurements in the session that built this
// example — fit error < 0.001):
//   natural    → cubic-bezier(0.25, 0.1, 0.25, 1)   (the classic CSS "ease")
//   slowDown   → cubic ease-out  (1 - (1-x)^3)
//   accelerate → cubic ease-in   (x^3)
// ---------------------------------------------------------------------------
const easeNatural: EasingFn = Easing.bezier(0.25, 0.1, 0.25, 1)
const easeSlowDown: EasingFn = Easing.out(Easing.cubic)
const easeAccelerate: EasingFn = Easing.in(Easing.cubic)

/** interpolate() with clamping, ms-based input range. */
function interpMs(
  frame: number,
  fps: number,
  startMs: number,
  endMs: number,
  from: number,
  to: number,
  easing: EasingFn,
): number {
  return interpolate(
    frame,
    [(startMs / 1000) * fps, (endMs / 1000) * fps],
    [from, to],
    { easing, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  )
}

const linear: EasingFn = (t) => t

/**
 * One word of the "slideAndMask" text effect. The outer span is an
 * overflow-hidden window clipped to the glyph box; the inner span slides
 * vertically inside it.
 *
 * DM Sans metrics at 160px with line-height 1: ascent ≈ 0.78em puts the
 * baseline ≈ 125px from the top of the line box. All words here use only
 * x-height glyphs (≈ 0.55em ≈ 88px) plus the period on the baseline, so
 * the glyph box is roughly [37px, 128px] within the 160px line box. The
 * mask window adds a few px of slack so antialiased edges aren't shaved.
 */
function MaskedWord({
  word,
  index,
  frame,
  fps,
}: {
  word: string
  index: number
  frame: number
  fps: number
}) {
  // Travel distance: Jitter's travelDistance=100 is a PERCENTAGE of the
  // word's full em box (ascent + descent ≈ 1.3em for DM Sans → 208px at
  // 160px). Measured from renderer frames: word offsets fit travel ≈ 208px
  // exactly; with 100px the words would never fully leave the mask window.
  const travel = TEXT.fontSize * 1.3

  // slide in: up from +travel to 0
  const inStart = TEXT.inStartMs + index * TEXT.inStaggerMs
  const inOffset = interpMs(
    frame,
    fps,
    inStart,
    inStart + TEXT.inWordDurationMs,
    travel,
    0,
    easeSlowDown,
  )
  // slide out: down from 0 to +travel
  const outStart = TEXT.outStartMs + index * TEXT.outStaggerMs
  const outOffset = interpMs(
    frame,
    fps,
    outStart,
    outStart + TEXT.outWordDurationMs,
    0,
    travel,
    easeAccelerate,
  )
  const translateY = inOffset + outOffset

  // Mask window: the word's full em box (ascent ≈ 0.99em above baseline,
  // descent ≈ 0.31em below). Measured from renderer frames: sliding words
  // clip exactly at baseline + 0.31em (y ≈ 641 for the rest baseline 594).
  // With line-height 1 the box is 1em tall and glyphs overflow it by
  // 0.15em on each side, so the window extends 0.15em beyond the line box.
  const windowTop = -0.15 * TEXT.fontSize
  const windowH = 1.3 * TEXT.fontSize

  return (
    <span style={{ display: 'inline-block', overflow: 'hidden', height: windowH }}>
      <span
        style={{
          display: 'block',
          lineHeight: 1,
          marginTop: -windowTop,
          transform: `translateY(${translateY}px)`,
        }}
      >
        {word}
      </span>
    </span>
  )
}

export function AcmePromo() {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  // --- black frame rect: resize in (anchor center), resize out (anchor center)
  const frameInW = interpMs(frame, fps, FRAME.resizeInStartMs, FRAME.resizeInEndMs, FRAME.fromW, FRAME.toW, easeNatural)
  const frameInH = interpMs(frame, fps, FRAME.resizeInStartMs, FRAME.resizeInEndMs, FRAME.fromH, FRAME.toH, easeNatural)
  const frameW = interpMs(frame, fps, FRAME.resizeOutStartMs, FRAME.resizeOutEndMs, frameInW, FRAME.outW, easeNatural)
  const frameH = interpMs(frame, fps, FRAME.resizeOutStartMs, FRAME.resizeOutEndMs, frameInH, FRAME.outH, easeNatural)

  // --- image mask rect: resize in (anchor center), collapse out (anchor se)
  const maskInW = interpMs(frame, fps, MASK.resizeInStartMs, MASK.resizeInEndMs, MASK.fromW, MASK.toW, easeNatural)
  const maskInH = interpMs(frame, fps, MASK.resizeInStartMs, MASK.resizeInEndMs, MASK.fromH, MASK.toH, easeNatural)
  const maskW = interpMs(frame, fps, MASK.resizeOutStartMs, MASK.resizeOutEndMs, maskInW, 0, easeNatural)
  const maskH = interpMs(frame, fps, MASK.resizeOutStartMs, MASK.resizeOutEndMs, maskInH, 0, easeNatural)

  // before collapse the mask is centered; during collapse the SE corner is
  // pinned. Deriving left/top from the SE corner is correct in both phases
  // because while centered, se = center + size/2 ⇔ left = center - size/2.
  const collapseStartFrame = (MASK.resizeOutStartMs / 1000) * fps
  const collapsing = frame >= collapseStartFrame
  const maskLeft = collapsing ? MASK.seCornerX - maskW : MASK.centerX - maskW / 2
  const maskTop = collapsing ? MASK.seCornerY - maskH : MASK.centerY - maskH / 2

  const maskOpacity = interpMs(frame, fps, MASK.fadeInStartMs, MASK.fadeInEndMs, 0, 1, linear)

  // --- photo: resize (anchor center) composed with scale 1.2 → 1
  const picW = interpMs(frame, fps, PICTURE.resizeStartMs, PICTURE.resizeEndMs, PICTURE.fromW, PICTURE.toW, easeNatural)
  const picH = interpMs(frame, fps, PICTURE.resizeStartMs, PICTURE.resizeEndMs, PICTURE.fromH, PICTURE.toH, easeNatural)
  const picScale = interpMs(frame, fps, PICTURE.scaleStartMs, PICTURE.scaleEndMs, PICTURE.scaleFrom, PICTURE.scaleTo, easeSlowDown)

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        width: ARTBOARD.width,
        height: ARTBOARD.height,
        background: ARTBOARD.fillColor,
        overflow: 'hidden',
      }}
    >
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@700&display=swap"
      />

      {/* black frame */}
      <div
        style={{
          position: 'absolute',
          left: FRAME.centerX - frameW / 2,
          top: FRAME.centerY - frameH / 2,
          width: frameW,
          height: frameH,
          backgroundColor: FRAME.fillColor,
        }}
      />

      {/* masked picture */}
      <div
        style={{
          position: 'absolute',
          left: maskLeft,
          top: maskTop,
          width: maskW,
          height: maskH,
          overflow: 'hidden',
          opacity: maskOpacity,
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: PICTURE.centerX - maskLeft - picW / 2,
            top: PICTURE.centerY - maskTop - picH / 2,
            width: picW,
            height: picH,
            transform: `scale(${picScale})`,
            transformOrigin: 'center center',
          }}
        >
          <img
            src={PICTURE.src}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        </div>
      </div>

      {/* www.acme.com — per-word slide and mask */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: TEXT.centerY - TEXT.fontSize / 2,
          width: ARTBOARD.width,
          height: TEXT.fontSize,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          // the layer box center is at x=964.5, not 960
          paddingLeft: (TEXT.centerX - ARTBOARD.width / 2) * 2,
          fontFamily: TEXT.fontFamily,
          fontWeight: TEXT.fontWeight,
          fontSize: TEXT.fontSize,
          lineHeight: 1,
          letterSpacing: TEXT.letterSpacing,
          color: TEXT.color,
          whiteSpace: 'pre',
        }}
      >
        {/* Jitter's word split renders the words adjacent — the spaces in the
            source text "www. acme. com" only define the split boundaries */}
        {TEXT.words.map((word, i) => (
          <MaskedWord key={i} word={word} index={i} frame={frame} fps={fps} />
        ))}
      </div>
    </div>
  )
}
