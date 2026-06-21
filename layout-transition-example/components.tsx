/**
 * Components for the intra-scene LayoutTransition example.
 *
 * Demonstrates using LayoutTransition with showFrom/showUpTo to animate
 * a shared element between different positions within the same section,
 * without needing separate scenes.
 */

'use client'

import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import { EASE, FadeIn, Fill } from 'egaki/video'

/** Blue indicator dot that animates between list items via LayoutTransition. */
export function Dot() {
  return (
    <div
      style={{
        width: 24,
        height: 24,
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
        boxShadow: '0 0 20px rgba(59, 130, 246, 0.5)',
        flexShrink: 0,
      }}
    />
  )
}

/** A list item row with a slot for the LayoutTransition indicator. */
export function ListItem({
  label,
  description,
  indicator,
}: {
  label: string
  description: string
  indicator?: React.ReactNode
}) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const opacity = interpolate(frame, [0, fps * 0.4], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE.smooth,
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, opacity }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        {indicator}
        <div
          style={{
            fontSize: 48,
            fontWeight: 600,
            color: '#fafafa',
            fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
            letterSpacing: '-0.02em',
          }}
        >
          {label}
        </div>
      </div>
      <div
        style={{
          fontSize: 28,
          fontWeight: 400,
          color: '#71717a',
          fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
          marginLeft: 48,
        }}
      >
        {description}
      </div>
    </div>
  )
}

/** Feature card that highlights when active, used in the second example. */
export function FeatureCard({
  title,
  icon,
  active,
  badge,
}: {
  title: string
  icon: string
  active?: boolean
  badge?: React.ReactNode
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 16,
        padding: '32px 40px',
        borderRadius: 20,
        background: active ? 'rgba(59, 130, 246, 0.1)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${active ? 'rgba(59, 130, 246, 0.3)' : 'rgba(255,255,255,0.06)'}`,
        transition: 'none',
        position: 'relative',
      }}
    >
      {badge && (
        <div style={{ position: 'absolute', top: -12, right: -12 }}>
          {badge}
        </div>
      )}
      <div style={{ fontSize: 56 }}>{icon}</div>
      <div
        style={{
          fontSize: 32,
          fontWeight: 500,
          color: active ? '#93c5fd' : '#a1a1aa',
          fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
        }}
      >
        {title}
      </div>
    </div>
  )
}

/** Animated badge pill that moves between feature cards. */
export function ActiveBadge() {
  return (
    <div
      style={{
        padding: '6px 16px',
        borderRadius: 100,
        background: '#3b82f6',
        fontSize: 20,
        fontWeight: 600,
        color: 'white',
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
        boxShadow: '0 4px 12px rgba(59, 130, 246, 0.4)',
      }}
    >
      Active
    </div>
  )
}
