/**
 * Custom components for the video-example showcase.
 * Dot and ListItem are used for the intra-scene LayoutTransition demo.
 */

import { useCurrentFrame, useVideoConfig } from 'remotion'

export function Dot() {
  return (
    <div
      style={{
        width: 20,
        height: 20,
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #818cf8, #6366f1)',
        boxShadow: '0 0 12px rgba(99, 102, 241, 0.6)',
        flexShrink: 0,
      }}
    />
  )
}

export function ListItem({
  label,
  description,
  children,
}: {
  label: string
  description: string
  children?: React.ReactNode
}) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 20,
        padding: '20px 24px',
        background: 'rgba(255, 255, 255, 0.04)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: 14,
      }}
    >
      <div style={{ width: 20, display: 'flex', justifyContent: 'center' }}>
        {children}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span
          style={{
            fontSize: 22,
            fontWeight: 600,
            color: '#e4e4e7',
            fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontSize: 16,
            color: '#71717a',
            fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
          }}
        >
          {description}
        </span>
      </div>
    </div>
  )
}
