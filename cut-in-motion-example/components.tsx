/**
 * Text slides for the cut-in-motion example.
 *
 * TextSlide is just styled text, no positioning or background.
 * Bg is a separate full-frame background color layer.
 * The SlideIn/SlideOut wrappers only move the text, not the background.
 */

'use client'

import { AbsoluteFill } from 'remotion'

export function TextSlide({
  text,
  color = '#ffffff',
  font = 'Inter, system-ui, sans-serif',
  size = 72,
}: {
  text: string
  color?: string
  font?: string
  size?: number
}) {
  return (
    <AbsoluteFill style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div
        style={{
          fontFamily: font,
          fontSize: size,
          fontWeight: 800,
          color,
          textAlign: 'center',
          letterSpacing: -2,
          lineHeight: 1.1,
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  )
}

export function Bg({ color }: { color: string }) {
  return <AbsoluteFill style={{ background: color }} />
}
