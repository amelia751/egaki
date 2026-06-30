// Stack & Scatter templates
// 5 templates: StackSlide, CascadeDrop, PosterBurst, ImageTrail, PositionDance

import {
  type ShowcaseTemplate, type ShowcaseRenderContext,
  initLayout, getNum, getStr, getSlotImage, drawSlot,
  scaleRect, fitToAspect, parseAspect,
  clamp01, lerp, remap, stagger, splitProgress,
  easeOvershoot, easeAccel,
  ASPECT_OPTIONS, ASPECT_WITH_FRAME,
} from './showcase-utils.ts'

// ── Stack Slide ────────────────────────────────────────────────────────────

const STACK_SLOTS = 4
export const stackSlide: ShowcaseTemplate = {
  id: 'stack-slide',
  name: 'Stack Slide',
  description: 'Cards slide up one over another with a springy landing.',
  slotCount: STACK_SLOTS,
  defaultDuration: 8,
  params: [
    { type: 'number', id: 'inset', label: 'Card inset', default: 4, min: 0, max: 15, step: 0.5, unit: '%' },
    { type: 'number', id: 'depthScale', label: 'Depth scale', default: 0.95, min: 0.85, max: 1, step: 0.01 },
    { type: 'select', id: 'cardAspect', label: 'Card ratio', default: '1:1', options: ASPECT_WITH_FRAME },
  ],
  render(rc) {
    const { ctx, t, height: h, params } = rc
    const lay = initLayout(rc)
    const inset = lay.u * getNum(params, 'inset', 4)
    const aspectStr = getStr(params, 'cardAspect', '1:1')
    const inner = {
      x: lay.content.x + inset,
      y: lay.content.y + inset,
      w: lay.content.w - inset * 2,
      h: lay.content.h - inset * 2,
    }
    const card = aspectStr === 'frame' ? inner : fitToAspect(inner, parseAspect(aspectStr))
    const depthScale = getNum(params, 'depthScale', 0.95)
    const { index, local } = splitProgress(t, STACK_SLOTS)
    const prog = lay.ease(remap(local, 0, 0.55))

    // Draw background cards (receding)
    for (let d = 2; d >= 1; d--) {
      const slot = (index - d + STACK_SLOTS * 2) % STACK_SLOTS
      const depth = lerp(d - 1, d, prog)
      const s = Math.pow(depthScale, depth)
      const r = scaleRect(card, s)
      r.y -= lay.u * 1.2 * depth
      drawSlot(ctx, getSlotImage(rc, slot), slot, r, lay.radius, {
        alpha: Math.max(0, 1 - depth * 0.28), shadow: lay.shadow * 2,
      })
    }

    // Current card sliding up
    const offscreen = h + card.h * 0.1
    const cardY = lerp(offscreen, card.y, prog)
    const tilt = (1 - prog) * (Math.PI / 180) * 2
    ctx.save()
    ctx.translate(card.x + card.w / 2, cardY + card.h / 2)
    ctx.rotate(tilt)
    drawSlot(ctx, getSlotImage(rc, index), index,
      { x: -card.w / 2, y: -card.h / 2, w: card.w, h: card.h }, lay.radius, { shadow: lay.shadow * 3 })
    ctx.restore()
  },
}

// ── Cascade Drop ───────────────────────────────────────────────────────────

const CASCADE_SLOTS = 4
const CASCADE_ROTATIONS = [-3, 2, -1.5, 2.5]

export const cascadeDrop: ShowcaseTemplate = {
  id: 'cascade-drop',
  name: 'Cascade Drop',
  description: 'Cards tumble into a loose stack, then sweep away.',
  slotCount: CASCADE_SLOTS,
  defaultDuration: 7,
  params: [
    { type: 'number', id: 'rotation', label: 'Rotation', default: 100, min: 0, max: 200, step: 5, unit: '%' },
    { type: 'number', id: 'cardSize', label: 'Card size', default: 78, min: 50, max: 95, step: 1, unit: '%' },
    { type: 'select', id: 'cardAspect', label: 'Card ratio', default: '1:1', options: ASPECT_WITH_FRAME },
  ],
  render(rc) {
    const { ctx, t, height: h, params } = rc
    const lay = initLayout(rc)
    const rotAmt = getNum(params, 'rotation', 100) / 100
    const size = getNum(params, 'cardSize', 78) / 100
    const aspectStr = getStr(params, 'cardAspect', '1:1')
    const inner = scaleRect(lay.content, size)
    const card = aspectStr === 'frame' ? inner : fitToAspect(inner, parseAspect(aspectStr))
    const holdEnd = 0.62
    const exitOffset = easeAccel(remap(t, 0.82, 1)) * (h + card.h)

    for (let i = 0; i < CASCADE_SLOTS; i++) {
      const prog = easeOvershoot(stagger(remap(t, 0, holdEnd), i, CASCADE_SLOTS, 0.35))
      if (prog <= 0) continue

      const rot = CASCADE_ROTATIONS[i] * rotAmt * Math.PI / 180
      const y = lerp(-(card.h + card.y + lay.u * 5), card.y, prog) + exitOffset
      const angle = lerp(rot * 2.5, rot, Math.min(1, prog))
      const xJitter = lay.u * 1.4 * i

      ctx.save()
      ctx.translate(card.x + card.w / 2 + (i % 2 === 0 ? -xJitter : xJitter) * 0.4, y + card.h / 2)
      ctx.rotate(angle)
      drawSlot(ctx, getSlotImage(rc, i), i,
        { x: -card.w / 2, y: -card.h / 2, w: card.w, h: card.h }, lay.radius, { shadow: lay.shadow * 2.5 })
      ctx.restore()
    }
  },
}

// ── Poster Burst ───────────────────────────────────────────────────────────

const POSTER_MAX_SLOTS = 10
function posterEase(t: number) {
  return t < 0.5 ? (1 - Math.pow(1 - 2 * t, 3)) / 2 : 0.5 + Math.pow(2 * t - 1, 3) / 2
}

export const posterBurst: ShowcaseTemplate = {
  id: 'poster-burst',
  name: 'Poster Burst',
  description: 'Images burst from the center, growing to cover the last.',
  slotCount: POSTER_MAX_SLOTS,
  defaultDuration: 12,
  params: [
    { type: 'color', id: 'background', label: 'Background', default: '#101014' },
    { type: 'select', id: 'cardAspect', label: 'Card ratio', default: '1:1', options: ASPECT_WITH_FRAME },
    { type: 'number', id: 'count', label: 'Images used', default: 4, min: 2, max: 10, step: 1 },
    { type: 'select', id: 'flow', label: 'Flow', default: 'sequential', options: [
      { value: 'sequential', label: 'One by one' }, { value: 'staggered', label: 'Staggered' }, { value: 'volley', label: 'Volley' },
    ]},
    { type: 'number', id: 'overlap', label: 'Stagger overlap', default: 60, min: 20, max: 100, step: 5, unit: '%' },
    { type: 'number', id: 'groupSize', label: 'Volley group', default: 3, min: 2, max: 4, step: 1 },
    { type: 'number', id: 'hold', label: 'Hold time', default: 30, min: 0, max: 60, step: 5, unit: '%' },
  ],
  render(rc) {
    const { ctx, t, width: w, height: h, params } = rc
    const lay = initLayout(rc)
    const aspectStr = getStr(params, 'cardAspect', '1:1')
    const aspect = aspectStr === 'frame' ? w / h : parseAspect(aspectStr)
    const count = Math.min(POSTER_MAX_SLOTS, Math.max(2, Math.round(getNum(params, 'count', 4))))
    const holdPct = getNum(params, 'hold', 30) / 100
    const fullH = Math.max(h, w / aspect)
    const fullW = fullH * aspect
    const cx = w / 2, cy = h / 2

    const draw = (slot: number, scale: number) => {
      if (scale <= 0) return
      const sw = fullW * scale, sh = fullH * scale
      drawSlot(ctx, getSlotImage(rc, slot), slot,
        { x: cx - sw / 2, y: cy - sh / 2, w: sw, h: sh },
        lay.radius * Math.max(0, 1 - scale * 0.92) * 4, {
          shadow: lay.shadow * 3 * Math.sin(Math.PI * Math.min(1, scale)),
        })
    }

    const flow = getStr(params, 'flow', 'sequential')

    if (flow === 'staggered') {
      const easeOut = (x: number) => 1 - Math.pow(1 - x, 3)
      const seg = 1 / count
      const overlap = getNum(params, 'overlap', 60) / 100
      const span = Math.min(seg * (1 + 3 * overlap), 1 - seg)
      const items = Array.from({ length: count }, (_, i) => ({
        slot: i, age: (t + 1 - i * seg) % 1,
      })).sort((a, b) => b.age - a.age)
      for (const item of items) draw(item.slot, easeOut(remap(item.age, 0, span)))
      return
    }

    if (flow === 'volley') {
      const groupSize = Math.min(count, Math.max(1, Math.round(getNum(params, 'groupSize', 3))))
      const groupDur = 1 / Math.ceil(count / groupSize)
      const staggerDelay = groupDur * 0.16
      const animDur = groupDur * 0.26
      const items = Array.from({ length: count }, (_, i) => {
        const start = Math.floor(i / groupSize) * groupDur + (i % groupSize) * staggerDelay
        return { slot: i, age: (t - start + 1) % 1 }
      }).sort((a, b) => b.age - a.age)
      for (const item of items) draw(item.slot, posterEase(remap(item.age, 0, animDur)))
      return
    }

    // Sequential
    const { index, local } = splitProgress(t, count)
    const prog = posterEase(remap(local, 0, Math.max(0.2, 1 - holdPct)))
    draw((index + count - 1) % count, 1)
    draw(index, prog)
  },
}

// ── Image Trail ────────────────────────────────────────────────────────────

const TRAIL_SLOTS = 12
const TRAIL_POINTS: [number, number][] = [
  [0.7905, 0.389], [0.755, 0.347], [0.72, 0.3055], [0.6845, 0.264],
  [0.649, 0.2225], [0.611, 0.1925], [0.566, 0.1585], [0.5065, 0.137],
  [0.4375, 0.1285], [0.3175, 0.1485], [0.272, 0.17], [0.2265, 0.1915],
  [0.181, 0.213], [0.1355, 0.2345], [0.09, 0.256], [0.0445, 0.2775],
  [-0.001, 0.299], [-0.0465, 0.3205],
]
const TRAIL_IN_DUR = 0.236
const TRAIL_IN_SPEED = 0.08
const TRAIL_APPEAR = 0.29
const TRAIL_DISAPPEAR = 0.21
const TRAIL_FADE = 0.05

function catmullRom(pts: [number, number][], t: number): { x: number; y: number } {
  const n = pts.length
  const pos = clamp01(t) * (n - 1)
  const i = Math.min(Math.floor(pos), n - 2)
  const frac = pos - i
  const p0 = pts[Math.max(0, i - 1)]
  const p1 = pts[i]
  const p2 = pts[i + 1]
  const p3 = pts[Math.min(n - 1, i + 2)]
  const interp = (a: number, b: number, c: number, d: number) =>
    0.5 * (2 * b + (-a + c) * frac + (2 * a - 5 * b + 4 * c - d) * frac * frac + (-a + 3 * b - 3 * c + d) * frac ** 3)
  return { x: interp(p0[0], p1[0], p2[0], p3[0]), y: interp(p0[1], p1[1], p2[1], p3[1]) }
}

export const imageTrail: ShowcaseTemplate = {
  id: 'image-trail',
  name: 'Image Trail',
  description: 'A trail of cards popping in along a sweeping arc, then melting away.',
  slotCount: TRAIL_SLOTS,
  defaultDuration: 10,
  params: [
    { type: 'color', id: 'background', label: 'Background', default: '#101014' },
    { type: 'number', id: 'cornerRadius', label: 'Corner radius', default: 0, min: 0, max: 12, step: 0.5, unit: '%' },
    { type: 'number', id: 'cardSize', label: 'Card size', default: 19, min: 10, max: 32, step: 0.5, unit: '%' },
    { type: 'select', id: 'cardAspect', label: 'Card ratio', default: '1:1', options: ASPECT_OPTIONS },
    { type: 'number', id: 'trailLength', label: 'Trail length', default: 18, min: 8, max: 24, step: 1 },
    { type: 'number', id: 'popFrom', label: 'Pop from', default: 50, min: 0, max: 80, step: 5, unit: '%' },
  ],
  render(rc) {
    const { ctx, t, width: w, height: h, params } = rc
    const lay = initLayout(rc)
    const trailLen = Math.max(2, Math.round(getNum(params, 'trailLength', 18)))
    const cardW = lay.u * getNum(params, 'cardSize', 19)
    const aspect = parseAspect(getStr(params, 'cardAspect', '1:1'))
    const cardH = cardW / aspect
    const popFrom = getNum(params, 'popFrom', 50) / 100
    const easeIn = (x: number) => 1 - lay.ease(1 - x)

    const items: { i: number; pass: number; age: number; scale: number; x: number; y: number }[] = []

    for (let pass = 0; pass < 2; pass++) {
      const local = (t - pass * 0.5 + 1) % 1
      for (let p = 0; p < trailLen; p++) {
        const frac = p / (trailLen - 1)
        const start = frac * TRAIL_IN_DUR
        const end = TRAIL_APPEAR + frac * TRAIL_DISAPPEAR
        if (local < start || local >= end + TRAIL_FADE) continue

        const scaleIn = popFrom + (1 - popFrom) * lay.ease(remap(local, start, start + TRAIL_IN_SPEED))
        const scaleOut = 1 - (1 - popFrom) * easeIn(remap(local, end, end + TRAIL_FADE))
        const pt = catmullRom(TRAIL_POINTS, frac)
        const px = pass === 0 ? pt.x : 1 - pt.x
        const py = pass === 0 ? pt.y : 1 - pt.y

        items.push({ i: pass * trailLen + p, pass, age: local - start, scale: scaleIn * scaleOut, x: px * w, y: py * h })
      }
    }

    items.sort((a, b) => b.age - a.age)
    for (const item of items) {
      const sw = cardW * item.scale, sh = cardH * item.scale
      drawSlot(ctx, getSlotImage(rc, item.i), item.i % TRAIL_SLOTS,
        { x: item.x - sw / 2, y: item.y - sh / 2, w: sw, h: sh }, lay.radius * item.scale, {
          shadow: lay.shadow * 0.8,
        })
    }
  },
}

// ── Position Dance ─────────────────────────────────────────────────────────

const DANCE_SLOTS = 6
const DANCE_KEYFRAMES = [
  { pts: [[0.435, 0.629], [0.132, 0.517], [0.182, 0.826]] as [number, number][], scales: [1, 0.7, 1.2], base: 1.12 },
  { pts: [[0.181, 0.814], [0.293, 0.814], [0.475, 0.5]] as [number, number][], scales: [1, 1.5, 1.5], base: 0.66 },
  { pts: [[0.812, 0.814], [0.558, 0.484], [0.182, 0.24]] as [number, number][], scales: [1, 1.3, 0.8], base: 1.1 },
  { pts: [[0.606, 0.194], [0.801, 0.194], [0.801, 0.583]] as [number, number][], scales: [1, 0.4, 1], base: 1.39 },
  { pts: [[0.8, 0.503], [0.801, 0.828], [0.506, 0.828]] as [number, number][], scales: [1, 0.7, 0.7], base: 0.99 },
  { pts: [[0.153, 0.356], [0.246, 0.165], [0.694, 0.206]] as [number, number][], scales: [1, 1.5, 1.5], base: 0.74 },
]
const DANCE_STEPS = 3
const DANCE_HOLD = 0.3

export const positionDance: ShowcaseTemplate = {
  id: 'position-dance',
  name: 'Position Dance',
  description: 'Cards cycle through three positions and scales in a seamless loop.',
  slotCount: DANCE_SLOTS,
  defaultDuration: 4,
  params: [
    { type: 'color', id: 'background', label: 'Background', default: '#101014' },
    { type: 'number', id: 'cornerRadius', label: 'Corner radius', default: 4, min: 0, max: 12, step: 0.5, unit: '%' },
    { type: 'number', id: 'cardSize', label: 'Card size', default: 28, min: 16, max: 42, step: 1, unit: '%' },
    { type: 'select', id: 'cardAspect', label: 'Card ratio', default: '1:1', options: ASPECT_OPTIONS },
    { type: 'number', id: 'spacing', label: 'Spacing', default: 0, min: -20, max: 20, step: 1, unit: '%' },
  ],
  render(rc) {
    const { ctx, t, width: w, height: h, params } = rc
    const lay = initLayout(rc)
    const cardW = lay.u * getNum(params, 'cardSize', 28)
    const aspect = parseAspect(getStr(params, 'cardAspect', '1:1'))
    const cardH = cardW / aspect
    const spacing = getNum(params, 'spacing', 0) / 100
    const prog = t * DANCE_STEPS
    const step = Math.min(DANCE_STEPS - 1, Math.floor(prog))
    const local = prog - step
    const interp = local < DANCE_HOLD ? 0 : lay.ease(remap(local, DANCE_HOLD, 1))

    for (let i = 0; i < DANCE_SLOTS; i++) {
      const kf = DANCE_KEYFRAMES[i]
      const from = kf.pts[step]
      const to = kf.pts[(step + 1) % DANCE_STEPS]
      const x = from[0] + (to[0] - from[0]) * interp
      const y = from[1] + (to[1] - from[1]) * interp
      const sFrom = kf.scales[step]
      const sTo = kf.scales[(step + 1) % DANCE_STEPS]
      const s = kf.base * (sFrom + (sTo - sFrom) * interp)
      const cw = cardW * s * (1 + spacing)
      const ch = cardH * s * (1 + spacing)

      drawSlot(ctx, getSlotImage(rc, i), i,
        { x: x * w - cw / 2, y: y * h - ch / 2, w: cw, h: ch }, lay.radius * s, {
          shadow: lay.shadow * 1.2,
        })
    }
  },
}
