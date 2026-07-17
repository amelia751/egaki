/**
 * CylinderText — Words arranged on a 3D rotating cylinder with chromatic aberration.
 *
 * Words sit on the inner surface of a vertical cylinder (rotateX per word).
 * The cylinder slowly rotates, scrolling words through the viewport.
 * A chromatic aberration effect (3-channel RGB separation with radial mask)
 * creates lens-like color fringing at the screen edges.
 * Font: Outfit (Google Fonts), geometric sans-serif with rounded terminals.
 */

import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import { useTweakpane, EASE } from 'egaki/video'

const WORDS = [
  'bungalow',
  'chatoyant',
  'idyllic',
  'lagoon',
  'serendipity',
  'ephemeral',
  'petrichor',
  'luminous',
  'sonder',
  'vellichor',
  'halcyon',
  'mellifluous',
]

/**
 * Renders the cylinder of words. Extracted so we can render it 3 times
 * for the RGB chromatic aberration channels.
 */
function CylinderRing({
  rotation,
  radius,
  fontSize,
  color,
  style,
}: {
  rotation: number
  radius: number
  fontSize: number
  color: string
  style?: React.CSSProperties
}) {
  const angleStep = 360 / WORDS.length

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        perspective: '1200px',
        perspectiveOrigin: '50% 50%',
        ...style,
      }}
    >
      <div
        style={{
          position: 'relative',
          transformStyle: 'preserve-3d',
          transform: `rotateX(${rotation}deg)`,
          willChange: 'transform',
        }}
      >
        {WORDS.map((word, i) => {
          const angle = i * angleStep
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: [
                  'translate(-50%, -50%)',
                  `rotateX(${angle}deg)`,
                  `translateZ(${radius}px)`,
                ].join(' '),
                fontFamily: '"Outfit", sans-serif',
                fontSize: `${fontSize}px`,
                fontWeight: 400,
                color,
                whiteSpace: 'nowrap',
                letterSpacing: '-0.02em',
                backfaceVisibility: 'hidden',
              }}
            >
              {word}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function CylinderText() {
  const frame = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()

  const tp = useTweakpane('CylinderText', {
    radius: { value: 350, min: 200, max: 800, step: 10 },
    fontSize: { value: 72, min: 24, max: 150, step: 1 },
    rotationSpeed: { value: 30, min: -90, max: 90, step: 1 },
    aberrationStrength: { value: 2.5, min: 0, max: 30, step: 0.5 },
    edgeBlur: { value: 3, min: 0, max: 80, step: 1 },
    // % from top/bottom where blur/aberration starts. A small clear zone
    // means most of the frame is blurred; only a narrow center strip is sharp.
    clearZone: { value: 26, min: 15, max: 48, step: 1 },
  })

  // Slow continuous rotation over the full scene duration
  const rotation = interpolate(frame, [0, durationInFrames], [0, tp.rotationSpeed])

  // Chromatic aberration offset (px) — applied to R and B channels
  const aberr = tp.aberrationStrength

  // Vertical edge mask: transparent in a narrow center band, opaque everywhere else.
  // Uses a very sharp gradient (only ~3% transition) so blur and aberration
  // snap on aggressively. Most of the top/bottom is fully blurred.
  // CSS masks: black = opaque (visible), transparent = hidden.
  const cz = tp.clearZone
  const edgeMask = [
    `linear-gradient(to bottom,`,
    `  black 0%,`,
    `  black ${cz - 3}%,`,
    `  transparent ${cz}%,`,
    `  transparent ${100 - cz}%,`,
    `  black ${100 - cz + 3}%,`,
    `  black 100%)`,
  ].join('\n')

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {/* Google Fonts: Outfit */}
      <style>
        {`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500&display=swap');`}
      </style>

      {/* White base layer — always visible, ensures clean text at center */}
      <CylinderRing
        rotation={rotation}
        radius={tp.radius}
        fontSize={tp.fontSize}
        color="#ffffff"
      />

      {/* Red channel — offset up-left, masked to top/bottom edges only */}
      <CylinderRing
        rotation={rotation}
        radius={tp.radius}
        fontSize={tp.fontSize}
        color="#ff0000"
        style={{
          mixBlendMode: 'screen',
          transform: `translate(${-aberr}px, ${-aberr}px)`,
          maskImage: edgeMask,
          WebkitMaskImage: edgeMask,
        }}
      />

      {/* Blue channel — offset down-right, masked to top/bottom edges only */}
      <CylinderRing
        rotation={rotation}
        radius={tp.radius}
        fontSize={tp.fontSize}
        color="#0000ff"
        style={{
          mixBlendMode: 'screen',
          transform: `translate(${aberr}px, ${aberr}px)`,
          maskImage: edgeMask,
          WebkitMaskImage: edgeMask,
        }}
      />

      {/* Edge blur overlay — backdrop-filter blur masked to top/bottom edges.
          Simulates depth-of-field: words curving away are out of focus. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backdropFilter: `blur(${tp.edgeBlur}px)`,
          WebkitBackdropFilter: `blur(${tp.edgeBlur}px)`,
          maskImage: edgeMask,
          WebkitMaskImage: edgeMask,
          pointerEvents: 'none',
        }}
      />
    </AbsoluteFill>
  )
}
