/**
 * Simple components for the slot-text example.
 * SlotText itself is a built-in egaki component (no import needed in MDX).
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
