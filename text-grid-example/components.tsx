/**
 * TextGrid3D — Stacked opaque text panes in 3D perspective.
 *
 * Multiple opaque panes stacked along the Z-axis. Each pane contains
 * columns of repeated text, where each column is a rectangle with a
 * solid background. Gaps between columns and between panes are transparent.
 * The camera animates across 3 transitions, jumping to successive panes
 * with an ease-out motion.
 * Tweakpane controls let you adjust spacing, angles, and grid layout.
 */

import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import { useTweakpane, EASE } from 'egaki/video'

const ROW_ITEMS = [
  'Every Prompt',
  'Every tool call',
  'Every retry',
  'Every correction',
  'rectification',
]

const PANE_COUNT = 5
const ROWS_PER_PANE = 8

export function TextGrid3D() {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const tp = useTweakpane('TextGrid3D', {
    perspective: { value: 800, min: 100, max: 3000, step: 10 },
    rotateX: { value: -24.5, min: -45, max: 60, step: 0.5 },
    rotateY: { value: -45, min: -60, max: 60, step: 0.5 },
    rotateZ: { value: 6, min: -45, max: 45, step: 0.5 },
    translateX: { value: 25, min: -1200, max: 1200, step: 5 },
    translateY: { value: 245, min: -800, max: 800, step: 5 },
    translateZ: { value: 370, min: -500, max: 1500, step: 10 },
    itemGap: { value: 80, min: 0, max: 300, step: 2 },
    rowGap: { value: 10, min: 0, max: 60, step: 1 },
    paneSpacing: { value: 300, min: 50, max: 1000, step: 10 },
    fontSize: { value: 42, min: 12, max: 100, step: 1 },
    scale: { value: 1.3, min: 0.3, max: 5, step: 0.05 },
    bokehBlur: { value: 12, min: 0, max: 40, step: 0.5 },
    bokehOffset: { value: 0.7, min: 0, max: 1, step: 0.01 },
  })

  // Camera animation: 3 transitions jumping between pane stacks.
  // Each transition takes ~40 frames with ease-out, then holds.
  // Movement is along X and Y to simulate panning across the grid.
  const t1 = fps * 1.5  // transition 1 starts at 1.5s
  const t2 = fps * 3.5  // transition 2 starts at 3.5s
  const t3 = fps * 5.5  // transition 3 starts at 5.5s
  const dur = fps * 0.8 // each transition lasts 0.8s

  const jump = tp.itemGap + tp.fontSize * 5 // roughly one column width
  const jumpY = jump * 0.5

  const cameraX = interpolate(
    frame,
    [0, t1, t1 + dur, t2, t2 + dur, t3, t3 + dur],
    [0, 0, -jump, -jump, -jump * 2, -jump * 2, -jump * 3],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.decelerate },
  )

  const cameraY = interpolate(
    frame,
    [0, t1, t1 + dur, t2, t2 + dur, t3, t3 + dur],
    [0, 0, -jumpY, -jumpY, -jumpY * 2, -jumpY * 2, -jumpY * 3],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.decelerate },
  )

  return (
    <AbsoluteFill style={{ backgroundColor: '#eae7e0', overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          perspective: `${tp.perspective}px`,
          perspectiveOrigin: '45% 40%',
        }}
      >
        <div
          style={{
            position: 'relative',
            transformStyle: 'preserve-3d',
            transform: [
              `translateX(${tp.translateX + cameraX}px)`,
              `translateY(${tp.translateY + cameraY}px)`,
              `translateZ(${tp.translateZ}px)`,
              `rotateX(${tp.rotateX}deg)`,
              `rotateY(${tp.rotateY}deg)`,
              `rotateZ(${tp.rotateZ}deg)`,
              `scale(${tp.scale})`,
            ].join(' '),
            transformOrigin: '50% 50%',
            willChange: 'transform',
          }}
        >
          {Array.from({ length: PANE_COUNT }, (_, paneIdx) => {
            const z = -paneIdx * tp.paneSpacing
            return (
              <div
                key={paneIdx}
                style={{
                  position: paneIdx === 0 ? 'relative' : 'absolute',
                  top: 0,
                  left: 0,
                  transform: `translateZ(${z}px)`,
                  display: 'flex',
                  gap: `${tp.itemGap}px`,
                }}
              >
                {ROW_ITEMS.map((text, ci) => (
                  <div
                    key={ci}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: `${tp.rowGap}px`,
                      backgroundColor: '#eae7e0',
                      padding: '8px 14px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {Array.from({ length: ROWS_PER_PANE }, (_, rowIdx) => (
                      <span
                        key={rowIdx}
                        style={{
                          fontFamily:
                            '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
                          fontSize: `${tp.fontSize}px`,
                          fontWeight: 500,
                          color: '#2a3c2a',
                          opacity: 0.75,
                          lineHeight: 1.15,
                          letterSpacing: '-0.02em',
                        }}
                      >
                        {text}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>

      {/* Bokeh blur: fixed in screen space, outside the 3D transform. */}
      {tp.bokehBlur > 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backdropFilter: `blur(${tp.bokehBlur}px)`,
            WebkitBackdropFilter: `blur(${tp.bokehBlur}px)`,
            maskImage: `linear-gradient(to left, transparent ${tp.bokehOffset * 100}%, black ${Math.min((tp.bokehOffset + 0.15) * 100, 100)}%)`,
            WebkitMaskImage: `linear-gradient(to left, transparent ${tp.bokehOffset * 100}%, black ${Math.min((tp.bokehOffset + 0.15) * 100, 100)}%)`,
            pointerEvents: 'none',
          }}
        />
      )}
    </AbsoluteFill>
  )
}
