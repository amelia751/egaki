/**
 * AngledScreen demo components showing image and video use cases.
 *
 * Blur direction is auto-detected from rotateY: negative rotateY means
 * the right side is far, so it gets blurred automatically.
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
        bokehBlur={10}
        bokehOffset={0.6}
        backgroundColor="#0a0a0a"
        debug={false}
        width="100%"
        height="100%"
        style={{ transform: `translateX(${translateX}px)` }}
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
        bokehBlur={14}
        bokehOffset={0.66}
        backgroundColor="#050510"
        debug={false}
        width="100%"
        height="100%"
        style={{ transform: `translateX(${translateX}px)` }}
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
