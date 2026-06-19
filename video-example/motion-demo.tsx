/**
 * Demo components using Framer Motion (motion/react) inside egaki video.
 *
 * These test the motion-timing integration: JSAnimation patching,
 * MotionTimingSync frame sync, and backward seek support. Each component
 * uses declarative motion.div props (animate, initial, transition) that
 * would normally run on wall-clock time. The integration makes them
 * frame-deterministic for Remotion rendering.
 */

import { motion } from 'motion/react'

export function MotionFadeIn() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.8 }}
      style={{
        padding: 24,
        background: '#e74c3c',
        borderRadius: 12,
        color: 'white',
        fontWeight: 'bold',
        fontSize: 32,
        textAlign: 'center',
      }}
    >
      Motion Fade In
    </motion.div>
  )
}

export function MotionSpringSlide() {
  return (
    <motion.div
      initial={{ x: -400, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 100, damping: 15 }}
      style={{
        padding: 24,
        background: '#3498db',
        borderRadius: 12,
        color: 'white',
        fontWeight: 'bold',
        fontSize: 32,
        textAlign: 'center',
      }}
    >
      Spring Slide
    </motion.div>
  )
}

export function MotionScaleRotate() {
  return (
    <motion.div
      initial={{ scale: 0, rotate: -180 }}
      animate={{ scale: 1, rotate: 0 }}
      transition={{ type: 'spring', duration: 1, bounce: 0.5 }}
      style={{
        width: 200,
        height: 200,
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        borderRadius: 24,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        fontWeight: 'bold',
        fontSize: 28,
        margin: '0 auto',
      }}
    >
      Pop!
    </motion.div>
  )
}

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.15 } },
}
const itemVariants = {
  hidden: { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
}

export function MotionStaggeredList() {
  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      style={{ display: 'flex', gap: 16, justifyContent: 'center' }}
    >
      {['Alpha', 'Beta', 'Gamma', 'Delta'].map((text) => (
        <motion.div
          key={text}
          variants={itemVariants}
          style={{
            padding: '16px 28px',
            background: '#2ecc71',
            borderRadius: 12,
            color: 'white',
            fontWeight: 'bold',
            fontSize: 28,
          }}
        >
          {text}
        </motion.div>
      ))}
    </motion.div>
  )
}
