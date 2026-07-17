'use client'

/**
 * ReleaseNotes — recreation of Jitter file xFi3smHmxArCqhMrHpV4Na1d.
 *
 * A 4:5 Mango release-notes template. Blue intro with a concentric pattern and
 * masked text reveals, then a smooth wipe to a white changelog layout with the
 * original Jitter logo-loop MP4 as the abstract bottom illustration.
 */

import { Video } from '@remotion/media'
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import { EASE, cubicBezier } from 'egaki/video'

const ARTBOARD_W = 1080
const ARTBOARD_H = 1350
const COMP_W = 1920
const COMP_H = 1080
const SCALE = Math.min(COMP_W / ARTBOARD_W, COMP_H / ARTBOARD_H)
const OFFSET_X = (COMP_W - ARTBOARD_W * SCALE) / 2
const OFFSET_Y = (COMP_H - ARTBOARD_H * SCALE) / 2

const LOGO_VIDEO = '/logo-loop.mp4'

function msToFrame(ms: number, fps: number) {
  return (ms / 1000) * fps
}

function at({
  frame,
  fps,
  startMs,
  endMs,
  from,
  to,
  easing = EASE.smooth,
}: {
  frame: number
  fps: number
  startMs: number
  endMs: number
  from: number
  to: number
  easing?: (t: number) => number
}) {
  return interpolate(frame, [msToFrame(startMs, fps), msToFrame(endMs, fps)], [from, to], {
    easing,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
}

function Logo({ color }: { color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, color }}>
      <div style={{ position: 'relative', width: 38, height: 38 }}>
        {Array.from({ length: 8 }, (_, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: 15,
              top: 0,
              width: 8,
              height: 38,
              borderRadius: 999,
              background: color,
              transform: `rotate(${i * 45}deg)`,
              transformOrigin: '50% 50%',
            }}
          />
        ))}
        <div
          style={{
            position: 'absolute',
            inset: 11,
            borderRadius: 999,
            background: color === '#000000' ? '#ffffff' : '#0045e5',
          }}
        />
      </div>
      <div style={{ fontFamily: 'Inter, Arial, sans-serif', fontSize: 48, fontWeight: 800, letterSpacing: -1.5 }}>
        Mango
      </div>
    </div>
  )
}

function MaskedWords({
  text,
  color,
  fontFamily,
  fontSize,
  fontWeight = 700,
  letterSpacing = -2,
  lineHeight = 1,
  startMs,
  durationMs,
  offsetMs,
  outStartMs,
  outDurationMs = 500,
  travel = 1,
}: {
  text: string
  color: string
  fontFamily: string
  fontSize: number
  fontWeight?: number
  letterSpacing?: number
  lineHeight?: number
  startMs: number
  durationMs: number
  offsetMs: number
  outStartMs?: number
  outDurationMs?: number
  travel?: number
}) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const timeMs = (frame / fps) * 1000
  const words = text.split(/(\s+)/)
  let wordIndex = 0

  return (
    <span
      style={{
        display: 'block',
        fontFamily,
        fontSize,
        fontWeight,
        letterSpacing,
        lineHeight,
        color,
        whiteSpace: 'pre-wrap',
      }}
    >
      {words.map((word, i) => {
        if (/^\s+$/.test(word)) return word
        const current = wordIndex++
        const inStart = startMs + current * offsetMs
        const inProgress = Math.min(1, Math.max(0, (timeMs - inStart) / durationMs))
        const inEase = EASE.smooth(inProgress)
        const outProgress = outStartMs == null ? 0 : Math.min(1, Math.max(0, (timeMs - (outStartMs + current * 28)) / outDurationMs))
        const outEase = EASE.accelerate(outProgress)
        return (
          <span key={i} style={{ display: 'inline-block', overflow: 'hidden', verticalAlign: 'bottom' }}>
            <span
              style={{
                display: 'inline-block',
                opacity: inEase * (1 - outEase),
                transform: `translateY(${(1 - inEase) * fontSize * travel - outEase * fontSize * 0.65}px)`,
                willChange: 'transform, opacity',
              }}
            >
              {word}
            </span>
          </span>
        )
      })}
    </span>
  )
}

function Pattern({ blueY }: { blueY: number }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const scale = at({ frame, fps, startMs: 0, endMs: 1410, from: 1.5, to: 0.8 })
  const grow = at({ frame, fps, startMs: 2210, endMs: 4060, from: 1, to: 1.6 })
  const late = at({ frame, fps, startMs: 4789, endMs: 6519, from: 1, to: 1.35 })
  const rotate =
    at({ frame, fps, startMs: 2210, endMs: 4060, from: 0, to: 45 }) +
    at({ frame, fps, startMs: 4789, endMs: 6519, from: 0, to: 45 })

  return (
    <div
      style={{
        position: 'absolute',
        left: 242,
        top: 377 + blueY,
        width: 596,
        height: 596,
        transform: `rotate(${rotate}deg) scale(${scale * grow * late})`,
        transformOrigin: 'center',
        opacity: 0.9,
      }}
    >
      {[596, 346, 102, 849].map((size, i) => (
        <div
          key={size}
          style={{
            position: 'absolute',
            left: (596 - size) / 2,
            top: (596 - size) / 2,
            width: size,
            height: size,
            border: `${i === 3 ? 36 : 24}px solid rgba(0,0,0,0.1)`,
            borderRadius: i % 2 === 0 ? 999 : 0,
            background: '#0045e5',
            boxSizing: 'border-box',
          }}
        />
      ))}
    </div>
  )
}

function Header({ mode }: { mode: 'blue' | 'white' }) {
  const color = mode === 'blue' ? '#bbe5ff' : '#000000'

  return (
    <div
      style={{
        position: 'absolute',
        left: 31,
        right: 31,
        top: 19,
        height: 76,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        color,
      }}
    >
      <Logo color={color} />
      <div
        style={{
          fontFamily: 'Inter, Arial, sans-serif',
          fontSize: 34,
          fontWeight: 700,
          letterSpacing: -1.1,
          color,
        }}
      >
        buildmango.co
      </div>
    </div>
  )
}

function CategoryIcon({ type, color, progress = 1 }: { type: 'plus' | 'bug' | 'gear'; color: string; progress?: number }) {
  return (
    <svg width="76" height="76" viewBox="0 0 76 76" style={{ overflow: 'visible', opacity: progress }}>
      {type === 'plus' && (
        <>
          <path d="M38 6L64 19V57L38 70L12 57V19Z" fill="#b3b3b3" />
          <rect x="35" y="23" width="6" height="30" fill={color} />
          <rect x="23" y="35" width="30" height="6" fill={color} />
        </>
      )}
      {type === 'bug' && (
        <>
          <path d="M22 22L54 54" stroke={color} strokeWidth="6" strokeLinecap="round" />
          <path d="M19 19L57 19L57 57L19 57Z" fill="none" stroke="#b3b3b3" strokeWidth="11" transform="rotate(22 38 38)" />
        </>
      )}
      {type === 'gear' && (
        <>
          <path d="M31 5H45L47 14C50 15 53 17 56 19L65 16L72 28L65 34C66 37 66 40 65 43L72 49L65 61L56 58C53 60 50 62 47 63L45 72H31L29 63C26 62 23 60 20 58L11 61L4 49L11 43C10 40 10 37 11 34L4 28L11 16L20 19C23 17 26 15 29 14Z" fill="none" stroke={color} strokeWidth="6" />
          <circle cx="38" cy="38" r="12" fill="none" stroke={color} strokeWidth="6" />
        </>
      )}
    </svg>
  )
}

function CategoryHeading({
  icon,
  children,
  color,
  left,
  top,
  startMs,
  moveFrom = 40,
  shiftY = 0,
}: {
  icon: 'plus' | 'bug' | 'gear'
  children: string
  color: string
  left: number
  top: number
  startMs: number
  moveFrom?: number
  shiftY?: number
}) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const progress = at({ frame, fps, startMs, endMs: startMs + 956, from: 0, to: 1 })
  return (
    <div
      style={{
        position: 'absolute',
        left,
        top: top + (1 - progress) * moveFrom + shiftY,
        display: 'flex',
        alignItems: 'center',
        gap: 24,
        opacity: at({ frame, fps, startMs, endMs: startMs + 138, from: 0, to: 1, easing: EASE.linear }),
        color,
      }}
    >
      <CategoryIcon type={icon} color={color} progress={progress} />
      <MaskedWords
        text={children}
        color={color}
        fontFamily="Georgia, 'Times New Roman', serif"
        fontSize={88}
        fontWeight={400}
        letterSpacing={-4.5}
        lineHeight={0.95}
        startMs={startMs}
        durationMs={icon === 'gear' ? 727 : 666}
        offsetMs={icon === 'gear' ? 73 : 67}
      />
    </div>
  )
}

function DetailLines({ lines, top, startMs, outStartMs }: { lines: string[]; top: number; startMs: number; outStartMs?: number }) {
  return (
    <div style={{ position: 'absolute', left: 54, top, width: 796, display: 'flex', flexDirection: 'column', gap: 0 }}>
      {lines.map((line, i) => (
        <div key={line}>
          <MaskedWords
            text={`→    ${line}`}
            color="#000000"
            fontFamily="Inter, Arial, sans-serif"
            fontSize={43}
            fontWeight={650}
            letterSpacing={-1.1}
            lineHeight={1.08}
            startMs={startMs + i * 87}
            durationMs={i === 1 ? 1320 : i === 2 ? 1218 : 1131}
            offsetMs={i === 1 ? 133 : i === 2 ? 122 : 114}
            outStartMs={outStartMs == null ? undefined : outStartMs + i * 100}
            outDurationMs={i === 1 ? 646 : i === 2 ? 563 : 498}
            travel={0.9}
          />
        </div>
      ))}
    </div>
  )
}

function Cta({ color }: { color: string }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: 344,
        top: 1249,
        width: 330,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        fontFamily: 'Inter, Arial, sans-serif',
        fontSize: 28,
        fontWeight: 650,
        lineHeight: 1.15,
        letterSpacing: -0.6,
        color,
      }}
    >
      <span>Link in bio</span>
      <span>buildmango.co/release</span>
    </div>
  )
}

function LogoVideo({ startMs, endMs, yFrom = 400 }: { startMs: number; endMs: number; yFrom?: number }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const timeMs = (frame / fps) * 1000
  if (timeMs < startMs || timeMs >= endMs) return null
  const y = at({
    frame,
    fps,
    startMs,
    endMs: startMs + 1537,
    from: yFrom,
    to: 0,
    easing: cubicBezier(0, 0.31553, 0.89258, 1),
  })
  const fade = Math.min(1, Math.max(0, (timeMs - startMs) / 300)) * (timeMs > endMs - 700 ? Math.max(0, (endMs - timeMs) / 700) : 1)
  return (
    <Video
      src={LOGO_VIDEO}
      muted
      objectFit="cover"
      style={{
        position: 'absolute',
        left: 70,
        top: 755 + y,
        width: 940,
        height: 1175,
        opacity: fade,
      }}
    />
  )
}

function BlueIntro() {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const timeMs = (frame / fps) * 1000
  if (timeMs > 6650) return null

  const blueY = at({ frame, fps, startMs: 5059.667, endMs: 6629.667, from: 0, to: -1350 })
  const titleY = at({
    frame,
    fps,
    startMs: 630,
    endMs: 1551,
    from: 327,
    to: -20,
    easing: cubicBezier(0, 0.47871, 0.71362, 1),
  })
  const titleSmallY = at({
    frame,
    fps,
    startMs: 2340,
    endMs: 3360,
    from: 0,
    to: -409,
    easing: cubicBezier(0.7311, 0, 0.71362, 1),
  })
  const titleScale = at({
    frame,
    fps,
    startMs: 2340,
    endMs: 3360,
    from: 1,
    to: 0.5,
    easing: cubicBezier(0.7311, 0, 0.71362, 1),
  })

  return (
    <div style={{ position: 'absolute', inset: 0, transform: `translateY(${blueY}px)` }}>
      <div style={{ position: 'absolute', inset: 0, background: '#0045e5' }} />
      <Pattern blueY={0} />
      <Header mode="blue" />
      <div
        style={{
          position: 'absolute',
          left: 31,
          top:
            116 +
            at({
              frame,
              fps,
              startMs: 630,
              endMs: 1551,
              from: 755,
              to: 0,
              easing: cubicBezier(0, 0.47871, 0.71362, 1),
            }),
          width: 1018,
          height: at({ frame, fps, startMs: 630, endMs: 1551, from: 0, to: 18, easing: cubicBezier(0, 0.47871, 1, 1) }),
          background: '#bae5ff',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 35,
          top:
            134 +
            at({
              frame,
              fps,
              startMs: 630,
              endMs: 1551,
              from: 755,
              to: 0,
              easing: cubicBezier(0, 0.47871, 0.71362, 1),
            }),
        }}
      >
        <MaskedWords
          text={'10/20/34'}
          color="#bae5ff"
          fontFamily="Inter, Arial, sans-serif"
          fontSize={60}
          fontWeight={750}
          letterSpacing={-2}
          startMs={630}
          durationMs={837}
          offsetMs={84}
        />
      </div>
      <div
        style={{
          position: 'absolute',
          left:
            35 +
            at({
              frame,
              fps,
              startMs: 2340,
              endMs: 3360,
              from: 0,
              to: -30,
              easing: cubicBezier(0.7311, 0, 0.71362, 1),
            }),
          top: 595 + titleY + titleSmallY,
          transform: `scale(${titleScale})`,
          transformOrigin: 'left top',
        }}
      >
        <MaskedWords
          text="Release Notes"
          color="#bbe5ff"
          fontFamily="Inter, Arial, sans-serif"
          fontSize={104}
          fontWeight={850}
          letterSpacing={-4}
          startMs={630}
          durationMs={767}
          offsetMs={77}
          outStartMs={5092}
          outDurationMs={258}
        />
      </div>
      {timeMs > 2500 && (
        <>
          <CategoryHeading icon="plus" color="#bae5ff" left={18} top={816} startMs={2670} shiftY={at({ frame, fps, startMs: 5092, endMs: 6419, from: 0, to: -679 })}>
            New features
          </CategoryHeading>
          <CategoryHeading icon="bug" color="#bae5ff" left={16} top={915} startMs={2830} moveFrom={74} shiftY={at({ frame, fps, startMs: 5092, endMs: 6419, from: 0, to: -380 })}>
            Bug fixes
          </CategoryHeading>
          <CategoryHeading icon="gear" color="#bae5ff" left={23} top={1013} startMs={3050} moveFrom={78} shiftY={at({ frame, fps, startMs: 5092, endMs: 6419, from: 0, to: -380 })}>
            Improvements
          </CategoryHeading>
        </>
      )}
      <Cta color="#bae5ff" />
    </div>
  )
}

function WhiteContent() {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const newShift = at({ frame, fps, startMs: 8661, endMs: 9988, from: 0, to: -304 })
  const bugShift = at({ frame, fps, startMs: 12254, endMs: 13581, from: 0, to: -304 })
  const firstShift = at({ frame, fps, startMs: 5092, endMs: 6419, from: 0, to: -679 })
  const midShift = at({ frame, fps, startMs: 5092, endMs: 6419, from: 0, to: -380 })

  return (
    <>
      <Header mode="white" />
      <div
        style={{
          position: 'absolute',
          left: 31,
          top: 116,
          width: 1018,
          height: at({ frame, fps, startMs: 4659, endMs: 5459, from: 18, to: 0, easing: EASE.accelerate }),
          background: '#000000',
        }}
      />
      <CategoryHeading icon="plus" color="#000000" left={49} top={835} startMs={2670} shiftY={firstShift}>
        New features
      </CategoryHeading>
      <CategoryHeading icon="bug" color="#000000" left={47} top={934} startMs={2830} moveFrom={74} shiftY={midShift + newShift}>
        Bug fixes
      </CategoryHeading>
      <CategoryHeading icon="gear" color="#000000" left={54} top={1032} startMs={3050} moveFrom={78} shiftY={midShift + bugShift}>
        Improvements
      </CategoryHeading>
      <DetailLines
        top={319}
        startMs={5372}
        outStartMs={8043}
        lines={['AI-generated ad templates.', 'Real-time personalization.', 'Better export options.']}
      />
      <DetailLines
        top={405}
        startMs={8893}
        outStartMs={11564}
        lines={['Sync issues fixed.', 'Dashboard display bugs fixed.', 'Text glitches resolved.']}
      />
      <DetailLines
        top={514}
        startMs={12343}
        lines={['Improved AI text quality.', 'Faster loading & smoother UI.', 'Stronger data security.']}
      />
      <LogoVideo startMs={5092} endMs={10115.333} />
      <LogoVideo startMs={8661} endMs={13684.333} yFrom={220} />
      <LogoVideo startMs={11957.667} endMs={16981} yFrom={170} />
      <Cta color="#000000" />
    </>
  )
}

export function ReleaseNotes() {
  return (
    <AbsoluteFill style={{ background: '#f2f2f2', overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          left: OFFSET_X,
          top: OFFSET_Y,
          width: ARTBOARD_W,
          height: ARTBOARD_H,
          transform: `scale(${SCALE})`,
          transformOrigin: 'top left',
          overflow: 'hidden',
          background: '#ffffff',
        }}
      >
        <WhiteContent />
        <BlueIntro />
      </div>
    </AbsoluteFill>
  )
}
