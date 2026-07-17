/**
 * Components for the Playwriter Cloud Browsers launch video.
 *
 * BrowserChrome — CSS-only Chrome browser frame with extension icon
 * BrowserSwarm — 1 browser springs into a 3x3 grid
 * AgentGrid — 2x3 mini-browser grid with agent labels
 * LimitationList — staggered text bullets over dimmed background
 * BlockedScreen — browser showing CAPTCHA/blocked with red stamp
 * PricingReveal — $10 counter animation
 * TerminalDemo — terminal typing playwriter cloud commands
 * DimOverlay — black overlay that eases in
 * AnimatedCursor — cursor that moves and clicks
 */

'use client'

import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig, spring } from 'remotion'
import { EASE, springFromDuration, cubicBezier, impulseOvershoot } from 'egaki/video'

// ── Shared styles ──────────────────────────────────────────────────

export const FONT_MONO = '"SF Mono", "JetBrains Mono", "Fira Code", monospace'
export const FONT_SANS = '"SF Pro Display", "Inter", system-ui, sans-serif'

// ── DimOverlay ─────────────────────────────────────────────────────

export function DimOverlay({ darkness = 0.5, duration = 30 }: { darkness?: number; duration?: number }) {
  const frame = useCurrentFrame()
  const opacity = interpolate(frame, [0, duration], [0, darkness], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE.decelerate,
  })
  return <AbsoluteFill style={{ backgroundColor: `rgba(0, 0, 0, ${opacity})` }} />
}

// ── BrowserChrome ──────────────────────────────────────────────────

function BrowserDot({ color }: { color: string }) {
  return <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: color }} />
}

function ExtensionIcon({ active, scale = 1 }: { active: boolean; scale?: number }) {
  return (
    <div
      style={{
        width: 20 * scale,
        height: 20 * scale,
        borderRadius: 4 * scale,
        backgroundColor: active ? '#22c55e' : '#6b7280',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 10 * scale,
        fontWeight: 700,
        color: 'white',
        fontFamily: FONT_SANS,
        transition: 'background-color 0.2s',
      }}
    >
      P
    </div>
  )
}

export function BrowserChrome({
  url = 'example.com',
  children,
  width = 800,
  height = 500,
  showExtensionClick = false,
  extensionActive = false,
  accentColor,
  style,
}: {
  url?: string
  children?: React.ReactNode
  width?: number
  height?: number
  showExtensionClick?: boolean
  extensionActive?: boolean
  accentColor?: string
  style?: React.CSSProperties
}) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const extActive = showExtensionClick
    ? frame > fps * 1.5
    : extensionActive

  const cursorVisible = showExtensionClick && frame > fps * 0.5 && frame < fps * 2.5

  // Cursor moves toward extension icon
  const cursorX = showExtensionClick
    ? interpolate(frame, [fps * 0.5, fps * 1.4], [width * 0.5, width - 60], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
        easing: EASE.smooth,
      })
    : 0
  const cursorY = showExtensionClick
    ? interpolate(frame, [fps * 0.5, fps * 1.4], [height * 0.4, 18], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
        easing: EASE.smooth,
      })
    : 0

  // Click flash
  const clickFlash = showExtensionClick
    ? interpolate(frame, [fps * 1.5, fps * 1.5 + 4, fps * 1.5 + 8], [0, 1, 0], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      })
    : 0

  // Popup appears after click
  const popupVisible = showExtensionClick && frame > fps * 1.8

  const popupOpacity = showExtensionClick
    ? interpolate(frame, [fps * 1.8, fps * 2.1], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      })
    : 0

  const popupScale = showExtensionClick
    ? interpolate(frame, [fps * 1.8, fps * 2.2], [0.9, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
        easing: EASE.smooth,
      })
    : 1

  return (
    <div
      style={{
        width,
        height,
        borderRadius: 12,
        overflow: 'hidden',
        backgroundColor: 'rgba(20, 20, 25, 0.88)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgba(255,255,255,0.08)',
        position: 'relative',
        ...style,
      }}
    >
      {/* Chrome bar */}
      <div
        style={{
          height: 36,
          backgroundColor: '#2a2a2a',
          display: 'flex',
          alignItems: 'center',
          padding: '0 12px',
          gap: 8,
          borderBottom: '1px solid #333',
        }}
      >
        <div style={{ display: 'flex', gap: 6 }}>
          <BrowserDot color="#ff5f57" />
          <BrowserDot color="#febc2e" />
          <BrowserDot color="#28c840" />
        </div>

        {/* URL bar */}
        <div
          style={{
            flex: 1,
            height: 24,
            borderRadius: 6,
            backgroundColor: '#1a1a1a',
            display: 'flex',
            alignItems: 'center',
            padding: '0 10px',
            fontSize: 12,
            fontFamily: FONT_SANS,
            color: '#999',
          }}
        >
          {url}
        </div>

        {/* Extension icon */}
        <div style={{ position: 'relative' }}>
          <ExtensionIcon active={extActive} />
          {clickFlash > 0 && (
            <div
              style={{
                position: 'absolute',
                inset: -4,
                borderRadius: 8,
                backgroundColor: `rgba(34, 197, 94, ${clickFlash * 0.4})`,
              }}
            />
          )}
        </div>
      </div>

      {/* Content area */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: height - 36,
          backgroundColor: '#0f0f0f',
          overflow: 'hidden',
        }}
      >
        {children || (
          <div
            style={{
              padding: 40,
              color: '#666',
              fontFamily: FONT_SANS,
              fontSize: 14,
            }}
          >
            <div style={{ width: '60%', height: 20, backgroundColor: '#1a1a1a', borderRadius: 4, marginBottom: 12 }} />
            <div style={{ width: '80%', height: 14, backgroundColor: '#151515', borderRadius: 4, marginBottom: 8 }} />
            <div style={{ width: '70%', height: 14, backgroundColor: '#151515', borderRadius: 4, marginBottom: 8 }} />
            <div style={{ width: '40%', height: 14, backgroundColor: '#151515', borderRadius: 4, marginBottom: 20 }} />
            <div
              style={{
                width: 120,
                height: 32,
                backgroundColor: accentColor || '#3b82f6',
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              Sign Up
            </div>
          </div>
        )}
      </div>

      {/* Animated cursor */}
      {cursorVisible && (
        <div
          style={{
            position: 'absolute',
            left: cursorX,
            top: cursorY,
            width: 0,
            height: 0,
            borderLeft: '6px solid white',
            borderTop: '4px solid transparent',
            borderBottom: '4px solid transparent',
            borderRight: '4px solid transparent',
            transform: 'rotate(-30deg)',
            filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.8))',
            zIndex: 100,
          }}
        />
      )}

      {/* Extension popup */}
      {popupVisible && (
        <div
          style={{
            position: 'absolute',
            right: 12,
            top: 42,
            width: 180,
            padding: '12px 14px',
            backgroundColor: '#222',
            border: '1px solid #444',
            borderRadius: 8,
            opacity: popupOpacity,
            transform: `scale(${popupScale})`,
            transformOrigin: 'top right',
            zIndex: 50,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontFamily: FONT_SANS,
              fontSize: 13,
              color: '#22c55e',
              fontWeight: 600,
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: '#22c55e',
                boxShadow: '0 0 6px rgba(34,197,94,0.6)',
              }}
            />
            Connected
          </div>
          <div style={{ fontSize: 11, color: '#888', marginTop: 4, fontFamily: FONT_SANS }}>
            Tab is now controlled
          </div>
        </div>
      )}
    </div>
  )
}

// ── BrowserSwarm ───────────────────────────────────────────────────

const SWARM_COLORS = ['#3b82f6', '#22c55e', '#a855f7', '#f97316', '#ef4444', '#06b6d4', '#eab308', '#ec4899', '#8b5cf6']

function MiniBrowser({ color, label, delay, size = 160 }: { color: string; label: string; delay: number; size?: number }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const progress = spring({
    frame: Math.max(0, frame - delay),
    fps,
    config: springFromDuration(0.5, 0.3),
  })

  const scale = interpolate(progress, [0, 1], [0, 1])
  const opacity = interpolate(progress, [0, 0.3], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  return (
    <div
      style={{
        width: size,
        height: size * 0.7,
        borderRadius: 6,
        overflow: 'hidden',
        backgroundColor: '#1a1a1a',
        border: '1px solid #333',
        transform: `scale(${scale})`,
        opacity,
        position: 'relative',
      }}
    >
      {/* Mini chrome bar */}
      <div
        style={{
          height: 16,
          backgroundColor: '#2a2a2a',
          display: 'flex',
          alignItems: 'center',
          padding: '0 6px',
          gap: 3,
          borderBottom: '1px solid #333',
        }}
      >
        <div style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: '#ff5f57' }} />
        <div style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: '#febc2e' }} />
        <div style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: '#28c840' }} />
        <div style={{ flex: 1 }} />
        <div style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: color, fontSize: 5, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>P</div>
      </div>
      {/* Content placeholder */}
      <div style={{ padding: 8 }}>
        <div style={{ width: '60%', height: 6, backgroundColor: '#252525', borderRadius: 2, marginBottom: 4 }} />
        <div style={{ width: '80%', height: 4, backgroundColor: '#1f1f1f', borderRadius: 2, marginBottom: 3 }} />
        <div style={{ width: '50%', height: 4, backgroundColor: '#1f1f1f', borderRadius: 2 }} />
      </div>
      {/* Label badge */}
      <div
        style={{
          position: 'absolute',
          bottom: 6,
          right: 6,
          padding: '2px 6px',
          borderRadius: 4,
          backgroundColor: color,
          fontSize: 8,
          fontWeight: 700,
          color: 'white',
          fontFamily: FONT_SANS,
        }}
      >
        {label}
      </div>
    </div>
  )
}

export function BrowserSwarm() {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  // Phase 1: single browser centered (0-1s)
  // Phase 2: grid appears (1s+)
  const gridProgress = interpolate(frame, [fps * 1, fps * 1.5], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE.smooth,
  })

  // Single browser fades/shrinks as grid appears
  const singleScale = interpolate(frame, [fps * 0.8, fps * 1.3], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE.smooth,
  })

  const singleOpacity = interpolate(frame, [fps * 0.8, fps * 1.2], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  // Slight 3D perspective on the grid
  const tiltX = interpolate(frame, [fps * 1, fps * 3], [8, 5], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const tiltY = interpolate(frame, [fps * 1, fps * 3], [-12, -8], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Single browser (phase 1) */}
      {singleOpacity > 0.01 && (
        <div style={{ position: 'absolute', transform: `scale(${singleScale})`, opacity: singleOpacity }}>
          <BrowserChrome width={900} height={560} extensionActive url="app.example.com" />
        </div>
      )}

      {/* Grid (phase 2) */}
      {gridProgress > 0.01 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 16,
            perspective: '1200px',
            transform: `perspective(1200px) rotateX(${tiltX}deg) rotateY(${tiltY}deg)`,
            opacity: gridProgress,
          }}
        >
          {SWARM_COLORS.map((color, i) => (
            <MiniBrowser
              key={i}
              color={color}
              label={`cloud-${i + 1}`}
              delay={Math.round(fps * 0.8 + i * 2)}
              size={240}
            />
          ))}
        </div>
      )}
    </AbsoluteFill>
  )
}

// ── AgentGrid ──────────────────────────────────────────────────────

const AGENT_SITES = [
  { name: 'Agent 1', site: 'Gmail', color: '#ef4444', content: 'Inbox (3 new)' },
  { name: 'Agent 2', site: 'Twitter', color: '#3b82f6', content: '@mentions (12)' },
  { name: 'Agent 3', site: 'Stripe', color: '#a855f7', content: 'Dashboard' },
  { name: 'Agent 4', site: 'GitHub', color: '#22c55e', content: 'Pull Requests' },
  { name: 'Agent 5', site: 'Shopify', color: '#f97316', content: 'Orders (47)' },
  { name: 'Agent 6', site: 'Linear', color: '#06b6d4', content: 'Sprint Board' },
]

function AgentBrowserCard({ agent, delay }: { agent: typeof AGENT_SITES[0]; delay: number }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const progress = spring({
    frame: Math.max(0, frame - delay),
    fps,
    config: springFromDuration(0.4, 0.2),
  })

  // Pulsing status dot
  const pulse = Math.sin(frame * 0.15) * 0.3 + 0.7

  return (
    <div
      style={{
        width: 300,
        height: 160,
        borderRadius: 10,
        backgroundColor: 'rgba(26, 26, 26, 0.85)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.08)',
        overflow: 'hidden',
        transform: `scale(${progress})`,
        opacity: progress,
      }}
    >
      {/* Mini chrome bar */}
      <div
        style={{
          height: 20,
          backgroundColor: '#2a2a2a',
          display: 'flex',
          alignItems: 'center',
          padding: '0 8px',
          gap: 4,
          borderBottom: '1px solid #333',
          fontSize: 9,
          color: '#888',
          fontFamily: FONT_SANS,
        }}
      >
        <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#ff5f57' }} />
        <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#febc2e' }} />
        <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#28c840' }} />
        <span style={{ marginLeft: 8 }}>{agent.site.toLowerCase()}.com</span>
      </div>

      {/* Content */}
      <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'white', fontFamily: FONT_SANS }}>
          {agent.site}
        </div>
        <div style={{ fontSize: 11, color: '#888', fontFamily: FONT_SANS }}>{agent.content}</div>
      </div>

      {/* Agent badge */}
      <div
        style={{
          position: 'absolute',
          bottom: 8,
          right: 8,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '3px 8px',
          borderRadius: 12,
          backgroundColor: agent.color + '22',
          border: `1px solid ${agent.color}44`,
        }}
      >
        <div
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            backgroundColor: agent.color,
            opacity: pulse,
            boxShadow: `0 0 4px ${agent.color}`,
          }}
        />
        <span style={{ fontSize: 9, fontWeight: 600, color: agent.color, fontFamily: FONT_SANS }}>
          {agent.name}
        </span>
      </div>
    </div>
  )
}

export function AgentGrid() {
  const { fps } = useVideoConfig()

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gridTemplateRows: 'repeat(2, 1fr)',
          gap: 16,
        }}
      >
        {AGENT_SITES.map((agent, i) => (
          <AgentBrowserCard key={i} agent={agent} delay={Math.round(fps * 0.1 + i * 3)} />
        ))}
      </div>

      {/* Feature pills at bottom */}
      <div
        style={{
          position: 'absolute',
          bottom: 60,
          display: 'flex',
          gap: 12,
        }}
      >
        {['Stealth Chromium', 'Residential Proxies', 'Anti-Bot Bypass', 'Live Preview'].map((label, i) => {
          const frame = useCurrentFrame()
          const delay = fps * 1.5 + i * 5
          const opacity = interpolate(frame, [delay, delay + 10], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          })
          const y = interpolate(frame, [delay, delay + 10], [8, 0], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
            easing: EASE.smooth,
          })
          return (
            <div
              key={label}
              style={{
                padding: '6px 14px',
                borderRadius: 20,
                backgroundColor: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                fontSize: 12,
                fontWeight: 500,
                color: 'rgba(255,255,255,0.7)',
                fontFamily: FONT_SANS,
                opacity,
                transform: `translateY(${y}px)`,
              }}
            >
              {label}
            </div>
          )
        })}
      </div>
    </AbsoluteFill>
  )
}

// ── LimitationList ─────────────────────────────────────────────────

export interface LimitationItem {
  text: string
  /** Frame offset when this item starts appearing. Pass `seconds * FPS`
   *  from MDX, ideally derived from real narration word timestamps so
   *  bullets land in sync with the spoken line instead of a fixed cadence. */
  delay: number
}

export function LimitationList({ items }: { items: LimitationItem[] }) {
  const frame = useCurrentFrame()

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 80,
        left: 0,
        right: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 16,
      }}
    >
      {items.map((item, i) => {
        const delay = item.delay
        const opacity = interpolate(frame, [delay, delay + 10], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })
        const x = interpolate(frame, [delay, delay + 12], [-30, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
          easing: EASE.smooth,
        })
        return (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              opacity,
              transform: `translateX(${x}px)`,
            }}
          >
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: '#ef4444',
              }}
            />
            <span
              style={{
                fontSize: 32,
                fontWeight: 600,
                color: 'rgba(255,255,255,0.9)',
                fontFamily: FONT_SANS,
                letterSpacing: '-0.02em',
              }}
            >
              {item.text}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ── BlockedScreen ──────────────────────────────────────────────────

export function BlockedScreen({ stampDelay }: { stampDelay?: number } = {}) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  // Red stamp pops in — defaults to 0.8s in, pass `stampDelay` (frames,
  // ideally `seconds * FPS` from the word timestamp of "blocked" in the
  // narration) to land the stamp exactly when the word is spoken.
  const stampScale = spring({
    frame: Math.max(0, frame - (stampDelay ?? Math.round(fps * 0.8))),
    fps,
    config: springFromDuration(0.4, 0.4),
  })

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <BrowserChrome url="app.example.com" width={800} height={500}>
        {/* CAPTCHA-like blocked page */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            gap: 16,
            position: 'relative',
          }}
        >
          <div
            style={{
              fontSize: 48,
              color: '#666',
            }}
          >
            🤖
          </div>
          <div
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: '#999',
              fontFamily: FONT_SANS,
            }}
          >
            Are you a robot?
          </div>
          <div
            style={{
              width: 200,
              height: 60,
              border: '2px solid #333',
              borderRadius: 4,
              display: 'flex',
              alignItems: 'center',
              padding: '0 12px',
              gap: 10,
            }}
          >
            <div
              style={{
                width: 24,
                height: 24,
                border: '2px solid #555',
                borderRadius: 3,
              }}
            />
            <span style={{ fontSize: 13, color: '#888', fontFamily: FONT_SANS }}>
              I'm not a robot
            </span>
          </div>

          {/* BLOCKED stamp */}
          <div
            style={{
              position: 'absolute',
              transform: `scale(${stampScale}) rotate(-12deg)`,
              padding: '8px 24px',
              border: '4px solid #ef4444',
              borderRadius: 8,
              fontSize: 36,
              fontWeight: 900,
              color: '#ef4444',
              fontFamily: FONT_SANS,
              letterSpacing: '0.1em',
              opacity: stampScale > 0.01 ? 1 : 0,
            }}
          >
            BLOCKED
          </div>
        </div>
      </BrowserChrome>
    </AbsoluteFill>
  )
}

// ── PricingReveal ──────────────────────────────────────────────────

export function PricingReveal() {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  // Counter rolls from 0 to 10
  const count = interpolate(frame, [0, fps * 0.8], [0, 10], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE.smooth,
  })

  // Subtitle fade up
  const subtitleOpacity = interpolate(frame, [fps * 0.6, fps * 1], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const subtitleY = interpolate(frame, [fps * 0.6, fps * 1], [15, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE.smooth,
  })

  // Scale entrance
  const mainScale = spring({
    frame,
    fps,
    config: springFromDuration(0.6, 0.15),
  })

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          transform: `scale(${mainScale})`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <div
          style={{
            fontSize: 120,
            fontWeight: 900,
            color: 'white',
            fontFamily: FONT_SANS,
            letterSpacing: '-0.04em',
            lineHeight: 1,
          }}
        >
          ${Math.round(count)}
        </div>
        <div
          style={{
            fontSize: 28,
            fontWeight: 500,
            color: 'rgba(255,255,255,0.5)',
            fontFamily: FONT_SANS,
            opacity: subtitleOpacity,
            transform: `translateY(${subtitleY}px)`,
          }}
        >
          /mo per browser
        </div>
      </div>
    </AbsoluteFill>
  )
}

// ── TerminalDemo ───────────────────────────────────────────────────

interface TerminalLine {
  text: string
  type: 'command' | 'success' | 'output' | 'dim'
  delay: number // frames before this line starts typing
}

export function TerminalDemo({ lines }: { lines: TerminalLine[] }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const charsPerFrame = 1.5

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: 760,
          borderRadius: 12,
          overflow: 'hidden',
          backgroundColor: 'rgba(17, 17, 17, 0.88)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        {/* Terminal chrome */}
        <div
          style={{
            height: 32,
            backgroundColor: '#1a1a1a',
            display: 'flex',
            alignItems: 'center',
            padding: '0 12px',
            gap: 6,
            borderBottom: '1px solid #222',
          }}
        >
          <BrowserDot color="#ff5f57" />
          <BrowserDot color="#febc2e" />
          <BrowserDot color="#28c840" />
          <span
            style={{
              marginLeft: 12,
              fontSize: 12,
              color: '#666',
              fontFamily: FONT_MONO,
            }}
          >
            ~/projects
          </span>
        </div>

        {/* Terminal content */}
        <div style={{ padding: '16px 20px', minHeight: 140 }}>
          {lines.map((line, i) => {
            const lineStart = line.delay
            const elapsed = Math.max(0, frame - lineStart)
            const visibleChars = Math.floor(elapsed * charsPerFrame)
            const displayText = line.text.slice(0, Math.min(visibleChars, line.text.length))
            const isTyping = visibleChars < line.text.length && elapsed > 0
            const isVisible = elapsed > 0

            if (!isVisible) return null

            const color =
              line.type === 'command'
                ? 'white'
                : line.type === 'success'
                  ? '#22c55e'
                  : line.type === 'dim'
                    ? '#666'
                    : '#999'

            return (
              <div
                key={i}
                style={{
                  fontFamily: FONT_MONO,
                  fontSize: 15,
                  lineHeight: 1.7,
                  color,
                  whiteSpace: 'pre',
                }}
              >
                {line.type === 'command' && (
                  <span style={{ color: '#22c55e' }}>$ </span>
                )}
                {line.type === 'success' && (
                  <span>✓ </span>
                )}
                {displayText}
                {isTyping && line.type === 'command' && (
                  <span
                    style={{
                      display: 'inline-block',
                      width: 8,
                      height: 16,
                      backgroundColor: 'white',
                      marginLeft: 1,
                      opacity: Math.sin(frame * 0.3) > 0 ? 1 : 0,
                    }}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </AbsoluteFill>
  )
}

// ── SplitView (terminal + browser side by side) ────────────────────

export function SplitView() {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  // Code block types in
  const codeText = `await page.goto("https://app.com")
await page.click(".signup-btn")
await screenshot({ page })`
  const codeChars = Math.floor(frame * 1.2)
  const displayCode = codeText.slice(0, Math.min(codeChars, codeText.length))

  // Button highlight on right side (after click line types)
  const clickLineStart = 'await page.goto("https://app.com")\nawait page.click('.length
  const showHighlight = codeChars > clickLineStart + 10

  const highlightOpacity = showHighlight
    ? interpolate(frame, [fps * 1.5, fps * 1.8], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      })
    : 0

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 40,
        padding: '0 80px',
      }}
    >
      {/* Left: code block */}
      <div
        style={{
          width: 580,
          borderRadius: 12,
          overflow: 'hidden',
          backgroundColor: 'rgba(17, 17, 17, 0.85)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,255,255,0.08)',
          padding: '24px 28px',
        }}
      >
        <div style={{ fontSize: 11, color: '#666', fontFamily: FONT_MONO, marginBottom: 12 }}>
          $ playwriter -s 1 -e
        </div>
        <pre
          style={{
            fontFamily: FONT_MONO,
            fontSize: 14,
            lineHeight: 1.6,
            color: '#e5e5e5',
            margin: 0,
            whiteSpace: 'pre-wrap',
          }}
        >
          {displayCode}
          <span
            style={{
              display: 'inline-block',
              width: 7,
              height: 14,
              backgroundColor: 'white',
              marginLeft: 1,
              opacity: Math.sin(frame * 0.3) > 0 ? 1 : 0,
            }}
          />
        </pre>
      </div>

      {/* Arrow */}
      <div style={{ fontSize: 32, color: '#444' }}>►</div>

      {/* Right: browser */}
      <BrowserChrome url="app.example.com" width={540} height={380} extensionActive>
        <div
          style={{
            padding: 30,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <div style={{ width: '70%', height: 16, backgroundColor: '#1a1a1a', borderRadius: 4 }} />
          <div style={{ width: '90%', height: 10, backgroundColor: '#151515', borderRadius: 4 }} />
          <div style={{ width: '60%', height: 10, backgroundColor: '#151515', borderRadius: 4 }} />
          <div style={{ marginTop: 8, position: 'relative', display: 'inline-flex' }}>
            <div
              style={{
                width: 120,
                height: 36,
                backgroundColor: '#3b82f6',
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontSize: 13,
                fontWeight: 600,
                fontFamily: FONT_SANS,
              }}
            >
              Sign Up
            </div>
            {/* Click highlight ring */}
            {highlightOpacity > 0 && (
              <div
                style={{
                  position: 'absolute',
                  inset: -4,
                  borderRadius: 10,
                  border: '2px solid #22c55e',
                  opacity: highlightOpacity,
                  boxShadow: '0 0 12px rgba(34,197,94,0.4)',
                }}
              />
            )}
          </div>
        </div>
      </BrowserChrome>
    </AbsoluteFill>
  )
}

// ── QA Code Block ──────────────────────────────────────────────────

export function QACodeBlock() {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const lines = [
    '// QA: test all funnels in parallel',
    'await Promise.all([',
    "  task('signup',   { browser: 'cloud-1' }),",
    "  task('checkout', { browser: 'cloud-2' }),",
    "  task('onboard',  { browser: 'cloud-3' }),",
    '])',
  ]

  // Highlight sweeps down line by line
  const highlightLine = interpolate(frame, [fps * 0.5, fps * 2.5], [0, lines.length], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE.smooth,
  })

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: 640,
          borderRadius: 12,
          overflow: 'hidden',
          backgroundColor: 'rgba(17, 17, 17, 0.88)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        {/* Header */}
        <div
          style={{
            height: 32,
            backgroundColor: '#1a1a1a',
            display: 'flex',
            alignItems: 'center',
            padding: '0 14px',
            borderBottom: '1px solid #222',
            fontSize: 12,
            color: '#666',
            fontFamily: FONT_MONO,
          }}
        >
          qa-tests.ts
        </div>

        {/* Code */}
        <div style={{ padding: '16px 20px' }}>
          {lines.map((line, i) => {
            const isHighlighted = i <= highlightLine && i > 0 && i < lines.length - 1
            const lineOpacity = interpolate(frame, [i * 4, i * 4 + 8], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            })

            return (
              <div
                key={i}
                style={{
                  fontFamily: FONT_MONO,
                  fontSize: 15,
                  lineHeight: 1.8,
                  color: line.startsWith('//') ? '#666' : '#e5e5e5',
                  opacity: lineOpacity,
                  backgroundColor: isHighlighted ? 'rgba(34,197,94,0.08)' : 'transparent',
                  margin: '0 -20px',
                  padding: '0 20px',
                  borderLeft: isHighlighted ? '2px solid #22c55e' : '2px solid transparent',
                  whiteSpace: 'pre',
                }}
              >
                {line}
                {/* Green check after execution */}
                {isHighlighted && i <= Math.floor(highlightLine) && (
                  <span style={{ color: '#22c55e', marginLeft: 8 }}>✓</span>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </AbsoluteFill>
  )
}
