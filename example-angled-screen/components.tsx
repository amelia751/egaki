/**
 * AngledScreen demo components showing image and video use cases.
 *
 * Uses the WebGL shader AngledScreen (HTML-in-canvas + depth-of-field).
 * Blur is depth-based: whatever part of the plane is further from the
 * camera gets progressively more bokeh blur (Three.js BokehShader model,
 * focused on the plane center by default).
 */

import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion'

import { Video , AngledScreen, EASE } from 'egaki/video'

export function ImageShowcase() {
  const frame = useCurrentFrame()

  const translateX = interpolate(frame, [0, 150], [-60, 60], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE.cinematic,
  })

  return (
    <AbsoluteFill style={{ backgroundColor: '#0a0a0a' }}>
      <AngledScreen
        rotateX={12}
        rotateY={-20}
        translateZ={185}
        perspective={800}
        backgroundColor="#0a0a0a"
        debug={false}
        width="100%"
        height="100%"
        translateX={translateX}
      >
        <img
          src="/screenshot.png"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
          }}
        />
      </AngledScreen>
    </AbsoluteFill>
  )
}

export function VideoShowcase() {
  const frame = useCurrentFrame()

  const translateX = interpolate(frame, [0, 240], [-80, 80], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE.cinematic,
  })

  return (
    <AbsoluteFill style={{ backgroundColor: '#050510' }}>
      <AngledScreen
        rotateX={10}
        rotateY={-22}
        translateZ={175}
        perspective={750}
        backgroundColor="#050510"
        debug={false}
        width="100%"
        height="100%"
        translateX={translateX}
      >
        <Video
          src="/arrakis.mp4"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
          }}
        />
      </AngledScreen>
    </AbsoluteFill>
  )
}
