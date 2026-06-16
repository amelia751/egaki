import { useCurrentFrame, useVideoConfig, interpolate, Easing } from 'remotion'
import { Fill, EASE } from 'egaki/video'

export function TextOverlay({
  text,
  subtitle,
  position = 'center',
}: {
  text: string
  subtitle?: string
  position?: 'center' | 'bottom'
}) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const glow = interpolate(frame, [0, fps * 2], [0, 8], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE.smooth,
  })

  return (
    <Fill
      style={{
        justifyContent: position === 'bottom' ? 'flex-end' : 'center',
        alignItems: 'center',
        paddingBottom: position === 'bottom' ? 120 : 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 16,
        }}
      >
        <div
          style={{
            fontSize: 120,
            fontWeight: 900,
            color: 'white',
            letterSpacing: 20,
            textShadow: `0 0 ${glow}px rgba(255,255,255,0.8), 0 4px 30px rgba(0,0,0,0.6)`,
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          {text}
        </div>
        {subtitle && (
          <div
            style={{
              fontSize: 36,
              fontWeight: 400,
              color: 'rgba(255,255,255,0.85)',
              letterSpacing: 6,
              textShadow: '0 2px 20px rgba(0,0,0,0.5)',
              fontFamily: 'system-ui, sans-serif',
            }}
          >
            {subtitle}
          </div>
        )}
      </div>
    </Fill>
  )
}
