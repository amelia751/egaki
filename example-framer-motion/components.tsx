/**
 * Framer Motion demo components for egaki video.
 *
 * Showcases declarative motion.div animations synced with Remotion's
 * frame-based rendering via egaki's motion-timing bridge. Covers: fade,
 * spring, keyframes, stagger, SVG, color, blur, 3D transforms, path
 * drawing, text reveal, and combined effects.
 */

import { motion, stagger, Transition, Target, VariantLabels, TargetAndTransition } from 'motion/react'

// ---------------------------------------------------------------------------
// 1. Text reveal — characters stagger in from below with spring physics
// ---------------------------------------------------------------------------

function AnimatedChar({ char, index }: { char: string; index: number }) {
  return (
    <motion.span
      initial={{ opacity: 0, y: 60, filter: 'blur(8px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{
        type: 'spring',
        duration: 0.6,
        bounce: 0.3,
        delay: index * 0.04,
      }}
      style={{ display: 'inline-block', whiteSpace: 'pre' }}
    >
      {char === ' ' ? '\u00A0' : char}
    </motion.span>
  )
}

export function TextReveal({ text, color = '#fafafa' }: { text: string; color?: string }) {
  return (
    <div
      style={{
        fontSize: 80,
        fontWeight: 800,
        color,
        letterSpacing: '-0.03em',
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
        textAlign: 'center',
        lineHeight: 1.1,
      }}
    >
      {text.split('').map((char, i) => (
        <AnimatedChar key={i} char={char} index={i} />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// 2. Typewriter line — words appear one by one with a cursor
// ---------------------------------------------------------------------------

export function TypewriterLine({ words, color = '#a5b4fc' }: { words: string[]; color?: string }) {
  return (
    <div
      style={{
        fontSize: 48,
        fontFamily: '"SF Mono", ui-monospace, monospace',
        color,
        display: 'flex',
        gap: 16,
        justifyContent: 'center',
        flexWrap: 'wrap',
      }}
    >
      {words.map((word, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0, scale: 0.8, filter: 'blur(4px)' }}
          animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
          transition={{ duration: 0.4, delay: i * 0.3 }}
          style={{ display: 'inline-block' }}
        >
          {word}
        </motion.span>
      ))}
      <motion.span
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 1, 0] }}
        transition={{ duration: 1, repeat: Infinity, delay: words.length * 0.3 }}
        style={{ color: '#818cf8' }}
      >
        |
      </motion.span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 3. Floating cards — cards drift up with stagger and slight rotation
// ---------------------------------------------------------------------------

const cardColors = ['#6366f1', '#ec4899', '#14b8a6', '#f59e0b', '#8b5cf6']

export function FloatingCards() {
  return (
    <div style={{ display: 'flex', gap: 24, justifyContent: 'center', perspective: 1000 }}>
      {['API', 'Auth', 'DB', 'Cache', 'CDN'].map((label, i) => (
        <motion.div
          key={label}
          initial={{ opacity: 0, y: 120, rotateX: -25, scale: 0.85 }}
          animate={{ opacity: 1, y: 0, rotateX: 0, scale: 1 }}
          transition={{
            type: 'spring',
            duration: 0.8,
            bounce: 0.25,
            delay: i * 0.12,
          }}
          style={{
            width: 160,
            height: 200,
            borderRadius: 20,
            background: `linear-gradient(135deg, ${cardColors[i]}, ${cardColors[i]}99)`,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontSize: 28,
            fontWeight: 700,
            boxShadow: `0 20px 60px ${cardColors[i]}44`,
            border: '1px solid rgba(255,255,255,0.15)',
          }}
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', delay: i * 0.12 + 0.3, duration: 0.5, bounce: 0.5 }}
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: 'rgba(255,255,255,0.2)',
              marginBottom: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 22,
            }}
          >
            {['⚡', '🔐', '💾', '🚀', '🌐'][i]}
          </motion.div>
          {label}
        </motion.div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// 4. Architecture diagram — nodes and edges animate in sequence
// ---------------------------------------------------------------------------

function DiagramNode({
  label,
  x,
  y,
  delay,
  color,
  size = 100,
}: {
  label: string
  x: number
  y: number
  delay: number
  color: string
  size?: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', duration: 0.6, bounce: 0.4, delay }}
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: size,
        height: size,
        borderRadius: size / 2,
        background: `linear-gradient(135deg, ${color}, ${color}88)`,
        border: '2px solid rgba(255,255,255,0.2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        fontSize: 18,
        fontWeight: 700,
        boxShadow: `0 8px 32px ${color}55`,
      }}
    >
      {label}
    </motion.div>
  )
}

function DiagramEdge({
  x1,
  y1,
  x2,
  y2,
  delay,
}: {
  x1: number
  y1: number
  x2: number
  y2: number
  delay: number
}) {
  const length = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
  const angle = Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI)
  return (
    <motion.div
      initial={{ scaleX: 0, opacity: 0 }}
      animate={{ scaleX: 1, opacity: 0.6 }}
      transition={{ duration: 0.4, delay }}
      style={{
        position: 'absolute',
        left: x1,
        top: y1,
        width: length,
        height: 2,
        background: 'linear-gradient(90deg, #6366f1, #a78bfa)',
        transformOrigin: '0 50%',
        transform: `rotate(${angle}deg)`,
      }}
    />
  )
}

export function ArchitectureDiagram() {
  // Centered node layout
  const cx = 450
  const cy = 200
  return (
    <div style={{ position: 'relative', width: 900, height: 420, margin: '0 auto' }}>
      {/* Edges first (behind nodes) */}
      <DiagramEdge x1={cx + 50} y1={cy + 50} x2={cx - 200 + 50} y2={cy + 160 + 50} delay={0.5} />
      <DiagramEdge x1={cx + 50} y1={cy + 50} x2={cx + 50} y2={cy + 160 + 50} delay={0.6} />
      <DiagramEdge x1={cx + 50} y1={cy + 50} x2={cx + 200 + 50} y2={cy + 160 + 50} delay={0.7} />
      <DiagramEdge x1={cx - 200 + 50} y1={cy - 140 + 50} x2={cx + 50} y2={cy + 50} delay={0.3} />
      <DiagramEdge x1={cx + 200 + 50} y1={cy - 140 + 50} x2={cx + 50} y2={cy + 50} delay={0.4} />

      {/* Top row */}
      <DiagramNode label="Client" x={cx - 200} y={cy - 140} delay={0.0} color="#3b82f6" />
      <DiagramNode label="Mobile" x={cx + 200} y={cy - 140} delay={0.1} color="#8b5cf6" />

      {/* Center */}
      <DiagramNode label="Gateway" x={cx} y={cy} delay={0.2} color="#ec4899" size={120} />

      {/* Bottom row */}
      <DiagramNode label="Auth" x={cx - 200} y={cy + 160} delay={0.5} color="#14b8a6" />
      <DiagramNode label="API" x={cx} y={cy + 160} delay={0.6} color="#f59e0b" />
      <DiagramNode label="Store" x={cx + 200} y={cy + 160} delay={0.7} color="#ef4444" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// 5. Metric counters — numbers roll up with spring
// ---------------------------------------------------------------------------

export function MetricCounters() {
  const metrics = [
    { label: 'Requests/sec', value: '12.4K', color: '#6366f1' },
    { label: 'Latency p99', value: '23ms', color: '#14b8a6' },
    { label: 'Uptime', value: '99.99%', color: '#f59e0b' },
    { label: 'Error rate', value: '0.01%', color: '#ec4899' },
  ]
  return (
    <div style={{ display: 'flex', gap: 32, justifyContent: 'center' }}>
      {metrics.map((m, i) => (
        <motion.div
          key={m.label}
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', duration: 0.7, bounce: 0.2, delay: i * 0.15 }}
          style={{
            textAlign: 'center',
            padding: '28px 40px',
            borderRadius: 20,
            background: '#111',
            border: `1px solid ${m.color}44`,
          }}
        >
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', delay: i * 0.15 + 0.3, duration: 0.5, bounce: 0.4 }}
            style={{ fontSize: 52, fontWeight: 800, color: m.color, letterSpacing: '-0.02em' }}
          >
            {m.value}
          </motion.div>
          <div style={{ fontSize: 20, color: '#888', marginTop: 8, fontWeight: 500 }}>{m.label}</div>
        </motion.div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// 6. SVG path drawing — strokes animate with spring
// ---------------------------------------------------------------------------

export function AnimatedLogo() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <svg width="400" height="400" viewBox="0 0 400 400" fill="none">
        {/* Outer ring */}
        <motion.circle
          cx={200}
          cy={200}
          r={150}
          stroke="#6366f1"
          strokeWidth={3}
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1.2, ease: 'easeInOut' }}
        />
        {/* Inner ring */}
        <motion.circle
          cx={200}
          cy={200}
          r={100}
          stroke="#a78bfa"
          strokeWidth={2}
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 0.7 }}
          transition={{ duration: 1, delay: 0.3, ease: 'easeInOut' }}
        />
        {/* Center dot */}
        <motion.circle
          cx={200}
          cy={200}
          r={20}
          fill="#818cf8"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', delay: 0.8, duration: 0.5, bounce: 0.5 }}
          style={{ transformOrigin: '200px 200px' }}
        />
        {/* Decorative lines */}
        {[0, 60, 120, 180, 240, 300].map((angle, i) => {
          const rad = (angle * Math.PI) / 180
          const x1 = 200 + 110 * Math.cos(rad)
          const y1 = 200 + 110 * Math.sin(rad)
          const x2 = 200 + 140 * Math.cos(rad)
          const y2 = 200 + 140 * Math.sin(rad)
          return (
            <motion.line
              key={angle}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="#6366f1"
              strokeWidth={2}
              strokeLinecap="round"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 0.8 }}
              transition={{ duration: 0.3, delay: 0.5 + i * 0.08 }}
            />
          )
        })}
      </svg>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 7. Gradient morph bar — background color keyframes
// ---------------------------------------------------------------------------

export function GradientMorphBar() {
  return (
    <motion.div
      initial={{ width: 0, opacity: 0, borderRadius: 40 }}
      animate={{ width: '90%', opacity: 1, borderRadius: 20 }}
      transition={{ type: 'spring', duration: 1, bounce: 0.2 }}
      style={{
        height: 120,
        margin: '0 auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      <motion.div
        animate={{
          background: [
            'linear-gradient(135deg, #6366f1, #ec4899)',
            'linear-gradient(135deg, #14b8a6, #3b82f6)',
            'linear-gradient(135deg, #f59e0b, #ef4444)',
            'linear-gradient(135deg, #8b5cf6, #06b6d4)',
            'linear-gradient(135deg, #6366f1, #ec4899)',
          ],
        }}
        transition={{ duration: 4, ease: 'easeInOut' }}
        style={{
          width: '100%',
          height: '100%',
          borderRadius: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 36,
          fontWeight: 800,
          color: 'white',
          letterSpacing: '-0.02em',
        }}
      >
        <motion.span
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.5 }}
        >
          Gradient Morphing
        </motion.span>
      </motion.div>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// 8. Orbit animation — elements rotate around a center point
// ---------------------------------------------------------------------------

export function OrbitAnimation() {
  const orbitItems = [
    { emoji: '⚛️', radius: 120, delay: 0, color: '#61dafb' },
    { emoji: '🔥', radius: 120, delay: 0.15, color: '#ff6b35' },
    { emoji: '💎', radius: 120, delay: 0.3, color: '#b9f2ff' },
    { emoji: '🌊', radius: 120, delay: 0.45, color: '#0ea5e9' },
  ]

  return (
    <div style={{ position: 'relative', width: 300, height: 300, margin: '0 auto' }}>
      {/* Center label */}
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', duration: 0.6, bounce: 0.4 }}
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 80,
          height: 80,
          borderRadius: 40,
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 28,
          fontWeight: 800,
          color: 'white',
          boxShadow: '0 0 40px #6366f155',
        }}
      >
        HUB
      </motion.div>

      {/* Orbit ring */}
      <motion.div
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 0.3, scale: 1 }}
        transition={{ duration: 0.5 }}
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 240,
          height: 240,
          borderRadius: '50%',
          border: '1px solid #6366f1',
        }}
      />

      {/* Orbiting items */}
      {orbitItems.map((item, i) => {
        const angle = (i * 360) / orbitItems.length
        const rad = (angle * Math.PI) / 180
        const x = 150 + item.radius * Math.cos(rad) - 24
        const y = 150 + item.radius * Math.sin(rad) - 24
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              type: 'spring',
              duration: 0.5,
              bounce: 0.5,
              delay: item.delay + 0.3,
            }}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              width: 48,
              height: 48,
              borderRadius: 14,
              background: `${item.color}22`,
              border: `1px solid ${item.color}44`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 24,
            }}
          >
            {item.emoji}
          </motion.div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// 9. 3D flip cards — cards rotate on Y axis to reveal back side
// ---------------------------------------------------------------------------

export function FlipReveal() {
  const items = [
    { front: 'Fast', back: '< 50ms', color: '#6366f1' },
    { front: 'Secure', back: 'E2E', color: '#14b8a6' },
    { front: 'Scale', back: '10M+', color: '#f59e0b' },
  ]
  return (
    <div style={{ display: 'flex', gap: 32, justifyContent: 'center', perspective: 1200 }}>
      {items.map((item, i) => (
        <motion.div
          key={item.front}
          initial={{ rotateY: 180, opacity: 0 }}
          animate={{ rotateY: 0, opacity: 1 }}
          transition={{ type: 'spring', duration: 0.8, bounce: 0.2, delay: i * 0.2 }}
          style={{
            width: 220,
            height: 280,
            borderRadius: 24,
            background: `linear-gradient(180deg, ${item.color}22, ${item.color}11)`,
            border: `1px solid ${item.color}44`,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            backfaceVisibility: 'hidden',
          }}
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', delay: i * 0.2 + 0.5, bounce: 0.5 }}
            style={{
              fontSize: 56,
              fontWeight: 800,
              color: item.color,
              letterSpacing: '-0.03em',
            }}
          >
            {item.back}
          </motion.div>
          <div style={{ fontSize: 24, color: '#888', fontWeight: 600 }}>{item.front}</div>
        </motion.div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// 10. Pulse wave — concentric circles pulse outward
// ---------------------------------------------------------------------------

export function PulseWave() {
  return (
    <div style={{ position: 'relative', width: 400, height: 400, margin: '0 auto' }}>
      {[0, 1, 2, 3].map((i) => (
        <motion.div
          key={i}
          initial={{ scale: 0, opacity: 0.8 }}
          animate={{ scale: 2.5, opacity: 0 }}
          transition={{
            duration: 2,
            delay: i * 0.4,
            ease: 'easeOut',
          }}
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: 80,
            height: 80,
            borderRadius: '50%',
            border: '2px solid #6366f1',
            transform: 'translate(-50%, -50%)',
          }}
        />
      ))}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', duration: 0.5, bounce: 0.4 }}
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 80,
          height: 80,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 32,
          color: 'white',
          fontWeight: 800,
          boxShadow: '0 0 60px #6366f155',
        }}
      >
        GO
      </motion.div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 11. Sliding stat bars — horizontal bars grow with spring
// ---------------------------------------------------------------------------

export function StatBars() {
  const stats = [
    { label: 'React', pct: 92, color: '#61dafb' },
    { label: 'TypeScript', pct: 88, color: '#3178c6' },
    { label: 'Node.js', pct: 76, color: '#68a063' },
    { label: 'Rust', pct: 45, color: '#dea584' },
    { label: 'Go', pct: 62, color: '#00add8' },
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, width: 800, margin: '0 auto' }}>
      {stats.map((s, i) => (
        <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.1 }}
            style={{ width: 130, fontSize: 24, fontWeight: 600, color: '#ccc', textAlign: 'right' }}
          >
            {s.label}
          </motion.div>
          <div style={{ flex: 1, height: 36, background: '#1a1a2e', borderRadius: 18, overflow: 'hidden' }}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${s.pct}%` }}
              transition={{ type: 'spring', duration: 1, bounce: 0.15, delay: i * 0.12 + 0.2 }}
              style={{
                height: '100%',
                background: `linear-gradient(90deg, ${s.color}, ${s.color}88)`,
                borderRadius: 18,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                paddingRight: 16,
                fontSize: 18,
                fontWeight: 700,
                color: 'white',
              }}
            >
              {s.pct}%
            </motion.div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// 12. Cascading notification stack — cards slide in from right
// ---------------------------------------------------------------------------

export function NotificationStack() {
  const notifications = [
    { title: 'Deploy succeeded', desc: 'Production v2.4.1 is live', color: '#14b8a6', icon: '✓' },
    { title: 'New PR merged', desc: 'feat: add motion support', color: '#6366f1', icon: '⎇' },
    { title: 'Alert resolved', desc: 'CPU usage back to normal', color: '#f59e0b', icon: '⚡' },
    { title: 'User milestone', desc: '10,000th signup today', color: '#ec4899', icon: '★' },
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: 600, margin: '0 auto' }}>
      {notifications.map((n, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: 300, scale: 0.9 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          transition={{ type: 'spring', duration: 0.7, bounce: 0.2, delay: i * 0.2 }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 20,
            padding: '20px 28px',
            borderRadius: 16,
            background: '#111',
            border: `1px solid ${n.color}33`,
          }}
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', delay: i * 0.2 + 0.3, bounce: 0.5 }}
            style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              background: `${n.color}22`,
              color: n.color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 24,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {n.icon}
          </motion.div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#fafafa' }}>{n.title}</div>
            <div style={{ fontSize: 18, color: '#888', marginTop: 4 }}>{n.desc}</div>
          </div>
        </motion.div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// 13. Text roll — characters rotate on X axis with staggered enter/exit
// ---------------------------------------------------------------------------

export type TextRollProps = {
  children: string
  duration?: number
  getEnterDelay?: (index: number) => number
  getExitDelay?: (index: number) => number
  style?: React.CSSProperties
  transition?: Transition
  variants?: {
    enter: {
      initial: Target | VariantLabels | boolean
      animate: TargetAndTransition | VariantLabels
    }
    exit: {
      initial: Target | VariantLabels | boolean
      animate: TargetAndTransition | VariantLabels
    }
  }
}

export function TextRoll({
  children,
  duration = 0.5,
  getEnterDelay = (i) => i * 0.1,
  getExitDelay = (i) => i * 0.1 + 0.2,
  style,
  transition = { ease: 'easeIn' },
  variants,
}: TextRollProps) {
  const defaultVariants = {
    enter: {
      initial: { rotateX: 0 },
      animate: { rotateX: 90 },
    },
    exit: {
      initial: { rotateX: 90 },
      animate: { rotateX: 0 },
    },
  } as const

  const letters = children.split('')

  return (
    <span style={style}>
      {letters.map((letter, i) => (
        <span
          key={i}
          aria-hidden="true"
          style={{
            position: 'relative',
            display: 'inline-block',
            perspective: 10000,
            transformStyle: 'preserve-3d',
            width: 'auto',
          }}
        >
          <motion.span
            style={{
              position: 'absolute',
              display: 'inline-block',
              backfaceVisibility: 'hidden',
              transformOrigin: '50% 25%',
            }}
            initial={variants?.enter?.initial ?? defaultVariants.enter.initial}
            animate={variants?.enter?.animate ?? defaultVariants.enter.animate}
            transition={{
              ...transition,
              duration,
              delay: getEnterDelay(i),
            }}
          >
            {letter === ' ' ? '\u00A0' : letter}
          </motion.span>
          <motion.span
            style={{
              position: 'absolute',
              display: 'inline-block',
              backfaceVisibility: 'hidden',
              transformOrigin: '50% 100%',
            }}
            initial={variants?.exit?.initial ?? defaultVariants.exit.initial}
            animate={variants?.exit?.animate ?? defaultVariants.exit.animate}
            transition={{
              ...transition,
              duration,
              delay: getExitDelay(i),
            }}
          >
            {letter === ' ' ? '\u00A0' : letter}
          </motion.span>
          <span style={{ visibility: 'hidden' }}>
            {letter === ' ' ? '\u00A0' : letter}
          </span>
        </span>
      ))}
    </span>
  )
}
