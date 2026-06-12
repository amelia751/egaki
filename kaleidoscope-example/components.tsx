'use client'

/**
 * KaleidoscopeIntro — recreation of the Jitter "Kaleidoscope: Intro Slide".
 *
 * A horizontal 1920x1080 artboard (matches the Remotion composition 1:1, no
 * letterboxing). Six full-frame layers zoom in from the center one after
 * another while the whole composition slowly zooms to 1.5x:
 *
 *   0ms     powder-blue empty canvas
 *   ~800ms  navy circle-pattern frame growing from center
 *   ~1400ms pink rings + cream background appearing
 *   ~2100ms cream bg with navy line grid scattering
 *   ~2700ms pink flash + navy square shapes morphing
 *   ~3300ms masked temple image growing, title letters rising in
 *   ~5000ms settled final slide
 *
 * Implementation follows the Jitter porting guide:
 * - scale ops are CSS transform scale() with center origin
 * - move ops adjust left/top (never translate)
 * - resize ops animate width/height around the anchor (center here)
 * - per-letter textIn with the op's bezier easing and 50% em-box travel
 *
 * All easing curves are exact cubic beziers from the Jitter ops; the
 * smooth:standard:v1 (intensity 50) ops use egaki's EASE.smooth preset.
 */

import { EASE, polybezier } from 'egaki/video'
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import {
  ARTBOARD,
  BRAND_TEXT,
  EASING_PATHS,
  FRAME_01,
  FRAME_02,
  FRAME_03,
  FRAME_04,
  FRAME_05,
  FRAME_06,
  GRID_LINES,
  MAIN_ZOOM,
  PRESENTATION_TEXT,
  SHAPE_RECTS,
  TITLE_DASH,
  type ShapeRect,
} from './data'

// ---------------------------------------------------------------------------
// Easing functions (exact beziers, precomputed once)
// ---------------------------------------------------------------------------

const E = {
  mainZoom: polybezier(EASING_PATHS.mainZoom),
  frame01Scale: polybezier(EASING_PATHS.frame01Scale),
  circleResize: polybezier(EASING_PATHS.circleResize),
  lineMove: polybezier(EASING_PATHS.lineMove),
  shapeMorph: polybezier(EASING_PATHS.shapeMorph),
  textIn: polybezier(EASING_PATHS.textIn),
  smooth: EASE.smooth, // smooth:standard:v1 intensity 50 = bezier(0.5, 0, 0, 1)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function interpClamp(
  frame: number,
  startMs: number,
  endMs: number,
  from: number,
  to: number,
  fps: number,
  easing: (t: number) => number,
) {
  return interpolate(frame, [(startMs / 1000) * fps, (endMs / 1000) * fps], [from, to], {
    easing,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
}

/** Full-artboard layer group that scales from its center */
function ScaledFrame({
  scale,
  background,
  clips,
  children,
}: {
  scale: number
  background?: string
  clips?: boolean
  children?: React.ReactNode
}) {
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: ARTBOARD.width,
        height: ARTBOARD.height,
        backgroundColor: background,
        overflow: clips ? 'hidden' : undefined,
        transform: `scale(${scale})`,
        transformOrigin: 'center center',
      }}
    >
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Frame 01 — Circle Pattern
// ---------------------------------------------------------------------------

function CirclePatternFrame({ frame, fps }: { frame: number; fps: number }) {
  const { frameScale, pattern, stroke, circleResize, circleCenters, background } = FRAME_01

  const frameS = interpClamp(frame, frameScale.startMs, frameScale.endMs, frameScale.from, frameScale.to, fps, E.frame01Scale)
  const patternS = interpClamp(frame, pattern.scale.startMs, pattern.scale.endMs, pattern.scale.from, pattern.scale.to, fps, E.frame01Scale)
  const rotation = interpClamp(frame, pattern.rotate.startMs, pattern.rotate.endMs, pattern.rotate.from, pattern.rotate.to, fps, E.circleResize)
  const size = interpClamp(frame, circleResize.startMs, circleResize.endMs, circleResize.fromSize, circleResize.toSize, fps, E.circleResize)

  return (
    <ScaledFrame scale={frameS} background={background} clips>
      <div
        style={{
          position: 'absolute',
          left: pattern.x,
          top: pattern.y,
          width: pattern.width,
          height: pattern.height,
          transform: `scale(${patternS})`,
          transformOrigin: 'center center',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: pattern.width,
            height: pattern.height,
            transform: `rotate(${rotation}deg)`,
            transformOrigin: 'center center',
          }}
        >
          {circleCenters.map((c, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: c.cx - size / 2,
                top: c.cy - size / 2,
                width: size,
                height: size,
                borderRadius: '50%',
                border: `${stroke.width}px solid ${stroke.color}`,
                boxSizing: 'border-box',
              }}
            />
          ))}
        </div>
      </div>
    </ScaledFrame>
  )
}

// ---------------------------------------------------------------------------
// Frame 03 — Line Pattern
// ---------------------------------------------------------------------------

function LinePatternFrame({ frame, fps }: { frame: number; fps: number }) {
  const { frameScale, lines, move, background, lineColor } = FRAME_03

  const frameS = interpClamp(frame, frameScale.startMs, frameScale.endMs, frameScale.from, frameScale.to, fps, E.smooth)
  const linesS = interpClamp(frame, lines.scale.startMs, lines.scale.endMs, lines.scale.from, lines.scale.to, fps, E.smooth)
  const moveP = interpClamp(frame, move.startMs, move.endMs, 0, 1, fps, E.lineMove)

  return (
    <ScaledFrame scale={frameS} background={background} clips>
      <div
        style={{
          position: 'absolute',
          left: lines.x,
          top: lines.y,
          width: lines.width,
          height: lines.height,
          transform: `scale(${linesS})`,
          transformOrigin: 'center center',
        }}
      >
        {GRID_LINES.map((l, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: l.x + l.moveX * moveP,
              top: l.y + l.moveY * moveP,
              width: l.width,
              height: l.height,
              backgroundColor: lineColor,
            }}
          />
        ))}
      </div>
    </ScaledFrame>
  )
}

// ---------------------------------------------------------------------------
// Frame 05 — Square Shapes
// ---------------------------------------------------------------------------

function MorphingRect({ rect, frame, fps }: { rect: ShapeRect; frame: number; fps: number }) {
  const { morph } = FRAME_05
  const p = interpClamp(frame, morph.startMs, morph.endMs, 0, 1, fps, E.shapeMorph)

  const scale = rect.scale.from + (rect.scale.to - rect.scale.from) * p
  const angle = rect.rotate ? rect.rotate.from + (rect.rotate.to - rect.rotate.from) * p : rect.baseAngle
  const radius = rect.cornerRadius.from + (rect.cornerRadius.to - rect.cornerRadius.from) * p
  const moveX = rect.move ? rect.move.fromX + (rect.move.toX - rect.move.fromX) * p : 0

  return (
    <div
      style={{
        position: 'absolute',
        left: rect.x + moveX,
        top: rect.y,
        width: rect.width,
        height: rect.height,
        backgroundColor: rect.fill,
        borderRadius: radius,
        transform: `rotate(${angle}deg) scale(${scale})`,
        transformOrigin: 'center center',
      }}
    />
  )
}

function SquareShapesFrame({ frame, fps }: { frame: number; fps: number }) {
  const { frameScale, shapes, background } = FRAME_05

  const frameS = interpClamp(frame, frameScale.startMs, frameScale.endMs, frameScale.from, frameScale.to, fps, E.smooth)
  const shapesS = interpClamp(frame, shapes.scale.startMs, shapes.scale.endMs, shapes.scale.from, shapes.scale.to, fps, E.smooth)

  return (
    <ScaledFrame scale={frameS} background={background} clips>
      <div
        style={{
          position: 'absolute',
          left: shapes.x,
          top: shapes.y,
          width: shapes.width,
          height: shapes.height,
          transform: `scale(${shapesS})`,
          transformOrigin: 'center center',
        }}
      >
        {SHAPE_RECTS.map((rect, i) => (
          <MorphingRect key={i} rect={rect} frame={frame} fps={fps} />
        ))}
      </div>
    </ScaledFrame>
  )
}

// ---------------------------------------------------------------------------
// Frame 06 — Logo (masked temple image + title)
// ---------------------------------------------------------------------------

/**
 * Per-letter rising/fading text (Jitter textIn, effect 'appear').
 *
 * LESSON LEARNED: the per-letter stagger is `offset / 2` ms, NOT `offset`.
 * Measured against /api/renderer/ frames at 3600/4000/4400/4800ms: with the
 * raw offset (47/77ms) the recreation lagged the reference by ~2x; with
 * offset/2 every checkpoint matches within one letter (e.g. "Brand
 * Guideline — Version 0.1" completes at ~3990ms in both).
 */
function TextInLetters({
  text,
  startMs,
  nodeDurationMs,
  offsetMs,
  travelPx,
  frame,
  fps,
}: {
  text: string
  startMs: number
  nodeDurationMs: number
  offsetMs: number
  travelPx: number
  frame: number
  fps: number
}) {
  return (
    <>
      {text.split('').map((char, i) => {
        const charStartMs = startMs + (i * offsetMs) / 2
        const p = interpClamp(frame, charStartMs, charStartMs + nodeDurationMs, 0, 1, fps, E.textIn)
        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              transform: `translateY(${travelPx * (1 - p)}px)`,
              opacity: p,
              whiteSpace: char === ' ' ? 'pre' : undefined,
            }}
          >
            {char}
          </span>
        )
      })}
    </>
  )
}

function LogoFrame({ frame, fps }: { frame: number; fps: number }) {
  const timeMs = (frame / fps) * 1000
  const { mask, image, overlay, labels, title } = FRAME_06

  // Mask rect: resize 0 -> full around fixed center, combined with scale
  const resizeP = interpClamp(frame, mask.resize.startMs, mask.resize.endMs, 0, 1, fps, E.smooth)
  const maskScale = interpClamp(frame, mask.scale.startMs, mask.scale.endMs, mask.scale.from, mask.scale.to, fps, E.smooth)
  const maskW = mask.width * resizeP * maskScale
  const maskH = mask.height * resizeP * maskScale
  const maskLeft = mask.centerX - maskW / 2
  const maskTop = mask.centerY - maskH / 2

  // Image zoom (center anchored at its own base rect center)
  const imgScale = interpClamp(frame, image.scale.startMs, image.scale.endMs, image.scale.from, image.scale.to, fps, E.smooth)

  // Overlay: own resize around (970,550) + opacity fade to 10%
  const ovResizeP = interpClamp(frame, overlay.resize.startMs, overlay.resize.endMs, 0, 1, fps, E.smooth)
  const ovW = overlay.width * ovResizeP
  const ovH = overlay.height * ovResizeP
  const ovOpacity = interpClamp(frame, overlay.opacity.startMs, overlay.opacity.endMs, overlay.opacity.from, overlay.opacity.to, fps, E.smooth)

  // Title group scale
  const titleScale = interpClamp(frame, title.scale.startMs, title.scale.endMs, title.scale.from, title.scale.to, fps, E.smooth)

  // 50% em-box travel for the textIn letters (em box ~= 1.3 * fontSize)
  const brandTravel = (BRAND_TEXT.textIn.travelDistance / 100) * BRAND_TEXT.fontSize * 1.3
  const presTravel = (PRESENTATION_TEXT.textIn.travelDistance / 100) * PRESENTATION_TEXT.fontSize * 1.3

  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: ARTBOARD.width, height: ARTBOARD.height }}>
      {/* Mask group — children positioned in artboard coords relative to the moving mask origin */}
      <div
        style={{
          position: 'absolute',
          left: maskLeft,
          top: maskTop,
          width: maskW,
          height: maskH,
          overflow: 'hidden',
        }}
      >
        {/* Temple image */}
        <img
          src={image.src}
          style={{
            position: 'absolute',
            left: image.x - maskLeft,
            top: image.y - maskTop,
            width: image.width,
            height: image.height,
            maxWidth: 'none',
            transform: `scale(${imgScale})`,
            transformOrigin: 'center center',
          }}
        />
        {/* Black overlay (10% at rest) */}
        <div
          style={{
            position: 'absolute',
            left: overlay.centerX - ovW / 2 - maskLeft,
            top: overlay.centerY - ovH / 2 - maskTop,
            width: ovW,
            height: ovH,
            backgroundColor: '#000000',
            opacity: ovOpacity,
          }}
        />
        {/* Corner labels */}
        <div
          style={{
            position: 'absolute',
            left: labels.x - maskLeft,
            top: labels.y - maskTop,
            width: labels.width,
            height: labels.height,
            fontSize: labels.fontSize,
            fontFamily: labels.fontFamily,
            letterSpacing: labels.letterSpacing,
            color: labels.color,
          }}
        >
          <div style={{ position: 'absolute', left: labels.jitter.x, top: labels.jitter.y }}>{labels.jitter.text}</div>
          <div style={{ position: 'absolute', left: labels.intro.x, top: labels.intro.y, width: labels.intro.width, textAlign: 'center' }}>
            {labels.intro.text}
          </div>
          <div style={{ position: 'absolute', left: labels.www.x, top: labels.www.y, width: labels.www.width, textAlign: 'center' }}>
            {labels.www.text}
          </div>
          <div
            style={{
              position: 'absolute',
              left: labels.dot.x,
              top: labels.dot.y,
              width: labels.dot.size,
              height: labels.dot.size,
              borderRadius: '50%',
              backgroundColor: labels.color,
            }}
          />
        </div>
      </div>

      {/* Title group */}
      <div
        style={{
          position: 'absolute',
          left: title.x,
          top: title.y,
          width: title.width,
          height: title.height,
          transform: `scale(${titleScale})`,
          transformOrigin: 'center center',
        }}
      >
        {/* "Presentation Template" */}
        <div
          style={{
            position: 'absolute',
            left: PRESENTATION_TEXT.x,
            top: PRESENTATION_TEXT.y,
            width: PRESENTATION_TEXT.width,
            height: PRESENTATION_TEXT.height,
            fontSize: PRESENTATION_TEXT.fontSize,
            fontFamily: PRESENTATION_TEXT.fontFamily,
            lineHeight: `${PRESENTATION_TEXT.lineHeightPercent}%`,
            letterSpacing: PRESENTATION_TEXT.letterSpacing,
            color: PRESENTATION_TEXT.color,
            textAlign: 'center',
            whiteSpace: 'nowrap',
          }}
        >
          <TextInLetters
            text={PRESENTATION_TEXT.text}
            startMs={PRESENTATION_TEXT.textIn.startMs}
            nodeDurationMs={PRESENTATION_TEXT.textIn.nodeDurationMs}
            offsetMs={PRESENTATION_TEXT.textIn.offsetMs}
            travelPx={presTravel}
            frame={frame}
            fps={fps}
          />
        </div>
        {/* "Brand Guideline      Version 0.1" */}
        <div
          style={{
            position: 'absolute',
            left: BRAND_TEXT.x,
            top: BRAND_TEXT.y,
            width: BRAND_TEXT.width,
            height: BRAND_TEXT.height,
            fontSize: BRAND_TEXT.fontSize,
            fontFamily: BRAND_TEXT.fontFamily,
            lineHeight: `${BRAND_TEXT.lineHeightPercent}%`,
            letterSpacing: BRAND_TEXT.letterSpacing,
            color: BRAND_TEXT.color,
            textAlign: 'center',
            whiteSpace: 'nowrap',
          }}
        >
          <TextInLetters
            text={BRAND_TEXT.text}
            startMs={BRAND_TEXT.textIn.startMs}
            nodeDurationMs={BRAND_TEXT.textIn.nodeDurationMs}
            offsetMs={BRAND_TEXT.textIn.offsetMs}
            travelPx={brandTravel}
            frame={frame}
            fps={fps}
          />
        </div>
        {/* Dash between "Brand Guideline" and "Version 0.1" */}
        {timeMs >= TITLE_DASH.showMs ? (
          <div
            style={{
              position: 'absolute',
              left: TITLE_DASH.x,
              top: TITLE_DASH.y,
              width: TITLE_DASH.width,
              height: TITLE_DASH.height,
              backgroundColor: TITLE_DASH.color,
            }}
          />
        ) : null}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function KaleidoscopeIntro() {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const mainScale = interpClamp(frame, MAIN_ZOOM.startMs, MAIN_ZOOM.endMs, MAIN_ZOOM.from, MAIN_ZOOM.to, fps, E.mainZoom)

  const frame02S = interpClamp(frame, FRAME_02.scale.startMs, FRAME_02.scale.endMs, FRAME_02.scale.from, FRAME_02.scale.to, fps, E.smooth)
  const frame04S = interpClamp(frame, FRAME_04.scale.startMs, FRAME_04.scale.endMs, FRAME_04.scale.from, FRAME_04.scale.to, fps, E.smooth)

  return (
    <AbsoluteFill style={{ backgroundColor: ARTBOARD.background, overflow: 'hidden' }}>
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Inter:wght@400&family=Playfair+Display:wght@400&display=swap"
      />
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: ARTBOARD.width,
          height: ARTBOARD.height,
          transform: `scale(${mainScale})`,
          transformOrigin: 'center center',
        }}
      >
        <CirclePatternFrame frame={frame} fps={fps} />
        <ScaledFrame scale={frame02S}>
          <div style={{ position: 'absolute', inset: 0, backgroundColor: FRAME_02.color }} />
        </ScaledFrame>
        <LinePatternFrame frame={frame} fps={fps} />
        <ScaledFrame scale={frame04S}>
          <div style={{ position: 'absolute', inset: 0, backgroundColor: FRAME_04.color }} />
        </ScaledFrame>
        <SquareShapesFrame frame={frame} fps={fps} />
        <LogoFrame frame={frame} fps={fps} />
      </div>
    </AbsoluteFill>
  )
}
