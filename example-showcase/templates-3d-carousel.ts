// 3D & Perspective + Carousel & Flow templates
// 9 templates: ShowcaseStream, CardTotem, FilmStrip, OrbitCarousel,
//              PhotoOrbit, WheelCarousel, CarouselFlow, TickerLoop, ColumnDrift

import {
  type ShowcaseTemplate, type ShowcaseRenderContext, type TemplateParam,
  initLayout, getNum, getStr, getSlotImage, drawSlot, drawImageCover, drawShadow,
  roundedRect, scaleRect, fitToAspect, parseAspect, clamp01, lerp, remap, splitProgress,
  scrollOffset, isPortrait, getDistortionCanvas, setShadowConfig,
  ASPECT_OPTIONS, ASPECT_WITH_FRAME, MOTION_OPTIONS,
} from './showcase-utils.ts'

// ── Showcase Stream ────────────────────────────────────────────────────────

const SHOWCASE_SLOTS = 12
export const showcaseStream: ShowcaseTemplate = {
  id: 'showcase-stream',
  name: 'Showcase Stream',
  description: 'Cards bend around a tilted 3D ring.',
  slotCount: SHOWCASE_SLOTS,
  defaultDuration: 16,
  params: [
    { type: 'color', id: 'background', label: 'Background', default: '#101014' },
    { type: 'number', id: 'ringTilt', label: 'Ring tilt', default: -28, min: -60, max: 60, step: 1, unit: '°' },
    { type: 'number', id: 'ringDepth', label: 'Ring opening', default: 55, min: 15, max: 85, step: 1, unit: '%' },
    { type: 'number', id: 'ringWidth', label: 'Ring size', default: 80, min: 50, max: 95, step: 1, unit: '%' },
    { type: 'number', id: 'cardSize', label: 'Card size', default: 21, min: 12, max: 32, step: 1, unit: '%' },
    { type: 'select', id: 'cardAspect', label: 'Card ratio', default: '1:1', options: ASPECT_OPTIONS },
    { type: 'number', id: 'backFade', label: 'Back fade', default: 70, min: 10, max: 95, step: 5, unit: '%' },
    { type: 'number', id: 'perspective', label: 'Perspective', default: 18, min: 0, max: 40, step: 2, unit: '%' },
  ],
  render(rc) {
    const { ctx, t, width: w, height: h, params } = rc
    const lay = initLayout(rc)
    const tilt = getNum(params, 'ringTilt', -28) * Math.PI / 180
    const depth = Math.min(0.99, Math.max(0.1, getNum(params, 'ringDepth', 55) / 100))
    const semiMinor = Math.sqrt(1 - depth * depth)
    const ringR = Math.min(lay.content.w, lay.content.h) / 2 * (getNum(params, 'ringWidth', 80) / 100) * 1.15
    const cardW = lay.u * getNum(params, 'cardSize', 21)
    const cardH = cardW / parseAspect(getStr(params, 'cardAspect', '1:1'))
    const backAlpha = 1 - getNum(params, 'backFade', 70) / 100
    const perspAmt = getNum(params, 'perspective', 18) / 100
    const rad = lay.radius * 1.4
    const cosT = Math.cos(tilt), sinT = Math.sin(tilt)
    const cx = w / 2, cy = h / 2
    const rotate2d = (x: number, y: number): [number, number] => [x * cosT - y * sinT, -(x * sinT + y * cosT)]
    const getPoint = (phi: number) => {
      const cp = Math.cos(phi), sp = Math.sin(phi)
      const pos = rotate2d(ringR * cp, -ringR * sp * depth)
      const tan = rotate2d(sp, cp * depth)
      const axis = rotate2d(0, -semiMinor)
      const dNorm = sp
      const p = 1 + perspAmt * dNorm
      return { pos, tan, axis, dNorm, p }
    }
    const sorted = Array.from({ length: SHOWCASE_SLOTS }, (_, i) => {
      const phi = 2 * Math.PI * (t + i / SHOWCASE_SLOTS)
      return { slot: i, phi, depth: Math.sin(phi) }
    }).sort((a, b) => a.depth - b.depth)

    const buf = getDistortionCanvas(cardW, cardH)
    const arcFrac = cardW / ringR

    for (const item of sorted) {
      const g = getPoint(item.phi)
      const alpha = backAlpha + (1 - backAlpha) * clamp01((g.dNorm + 0.3) / 0.6)
      const rect = { x: -cardW / 2, y: -cardH / 2, w: cardW, h: cardH }
      const img = getSlotImage(rc, item.slot)
      const applyTransform = (pt: ReturnType<typeof getPoint>) => {
        ctx.translate(cx + pt.pos[0] * pt.p, cy + pt.pos[1] * pt.p)
        ctx.transform(pt.tan[0] * pt.p, pt.tan[1] * pt.p, pt.axis[0] * pt.p, pt.axis[1] * pt.p, 0, 0)
      }

      // Shadow for front-facing cards
      if (g.dNorm > 0.35 && lay.shadow > 0) {
        ctx.save()
        ctx.globalAlpha *= alpha
        applyTransform(g)
        drawShadow(ctx, rect, rad, lay.shadow * 2.2 * (g.dNorm - 0.35))
        ctx.restore()
      }

      if (!buf) {
        ctx.save()
        applyTransform(g)
        drawSlot(ctx, img, item.slot, rect, rad, { alpha })
        ctx.restore()
        continue
      }

      // 3D distortion: render to offscreen then draw sliced
      const bw = buf.canvas.width, bh = buf.canvas.height
      buf.ctx.clearRect(0, 0, bw, bh)
      drawSlot(buf.ctx as CanvasRenderingContext2D, img, item.slot, { x: 0, y: 0, w: bw, h: bh }, rad)

      const slices = Math.min(60, Math.max(12, Math.round(cardW / 4)))
      const sliceW = cardW / slices
      ctx.save()
      ctx.globalAlpha *= alpha
      for (let s = 0; s < slices; s++) {
        const phi2 = item.phi - ((s + 0.5) / slices - 0.5) * arcFrac
        const pt = getPoint(phi2)
        ctx.save()
        applyTransform(pt)
        ctx.drawImage(buf.canvas, (bw * s) / slices, 0, bw / slices, bh, -sliceW / 2 - 0.25, -cardH / 2, sliceW + 0.5, cardH)
        ctx.restore()
      }
      ctx.restore()
    }
  },
}

// ── Card Totem ─────────────────────────────────────────────────────────────

const TOTEM_SLOTS = 6
export const cardTotem: ShowcaseTemplate = {
  id: 'card-totem',
  name: 'Card Totem',
  description: 'A vertical 3D-curved strip of cards through the center.',
  slotCount: TOTEM_SLOTS,
  defaultDuration: 12,
  params: [
    { type: 'color', id: 'background', label: 'Background', default: '#101014' },
    { type: 'number', id: 'cardSize', label: 'Card size', default: 34, min: 22, max: 50, step: 1, unit: '%' },
    { type: 'select', id: 'cardAspect', label: 'Card ratio', default: '1:1', options: ASPECT_OPTIONS },
    { type: 'number', id: 'gap', label: 'Gap', default: 2.5, min: 1, max: 8, step: 0.5, unit: '%' },
    { type: 'number', id: 'curve', label: '3D curve (out / in)', default: 70, min: -100, max: 100, step: 5, unit: '%' },
    MOTION_OPTIONS,
  ],
  render(rc) {
    const { ctx, t, width: w, height: h, params } = rc
    const lay = initLayout(rc)
    const cardW = lay.u * getNum(params, 'cardSize', 34)
    const aspect = parseAspect(getStr(params, 'cardAspect', '1:1'))
    const cardH = cardW / aspect
    const gap = lay.u * getNum(params, 'gap', 2.5)
    const curveAmt = getNum(params, 'curve', 70) / 100
    const absCurve = Math.abs(curveAmt)
    const curveSign = Math.sign(curveAmt)
    const step = cardH + gap
    const totalSpan = TOTEM_SLOTS * step
    const offset = scrollOffset(t, TOTEM_SLOTS, step, getStr(params, 'motion', 'flow'), lay.ease)
    const cx = w / 2
    const halfH = h / 2 + step
    const maxAngle = Math.max(0.06, absCurve * (Math.PI / 2.2))
    const curveRadius = halfH / maxAngle
    const cosMax = 1 - Math.cos(maxAngle)

    const curveY = (d: number) => {
      if (curveSign > 0) return Math.sin(Math.max(-Math.PI / 2, Math.min(Math.PI / 2, d / curveRadius))) * curveRadius
      if (curveSign < 0) { const n = d / halfH; return d * (1 + 0.45 * absCurve * n * n) }
      return d
    }
    const curveFactor = (d: number) => {
      const angle = Math.min(Math.abs(d) / curveRadius, Math.PI / 2)
      return Math.min(1.5, (1 - Math.cos(angle)) / cosMax)
    }

    const buf = getDistortionCanvas(cardW, cardH)

    for (let i = 0; i < TOTEM_SLOTS; i++) {
      const basePos = ((((i * step - offset) % totalSpan) + totalSpan) % totalSpan) - totalSpan / 2
      for (let wrap = -1; wrap <= 1; wrap++) {
        const pos = basePos + wrap * totalSpan
        if (Math.abs(curveY(pos)) > h / 2 + cardH * 1.5) continue

        const img = getSlotImage(rc, i)
        const cf = curveFactor(pos)
        const alpha = curveSign > 0 ? Math.max(0.25, 1 - 0.45 * absCurve * cf) : 1

        if (!buf || absCurve < 0.03) {
          const y = h / 2 + curveY(pos)
          drawSlot(ctx, img, i, { x: cx - cardW / 2, y: y - cardH / 2, w: cardW, h: cardH }, lay.radius, { alpha })
          continue
        }

        const bw = buf.canvas.width, bh = buf.canvas.height
        buf.ctx.clearRect(0, 0, bw, bh)
        drawSlot(buf.ctx as CanvasRenderingContext2D, img, i, { x: 0, y: 0, w: bw, h: bh }, lay.radius)
        ctx.save()
        ctx.globalAlpha *= alpha

        const slices = Math.min(72, Math.max(12, Math.round(cardH / 5)))
        const sliceH = bh / slices
        let prevY = Math.round(h / 2 + curveY(pos - cardH / 2))
        for (let s = 0; s < slices; s++) {
          const d = pos - cardH / 2 + ((s + 1) * cardH) / slices
          if (curveSign > 0 && Math.abs(d / curveRadius) >= Math.PI / 2) break
          const top = prevY
          const bot = Math.round(h / 2 + curveY(d))
          prevY = bot
          if (bot <= top) continue
          const midCf = curveFactor(pos - cardH / 2 + ((s + 0.5) * cardH) / slices)
          const scaleX = curveSign > 0 ? 1 - 0.55 * absCurve * midCf : 1 + 0.4 * absCurve * midCf
          const sliceW = cardW * scaleX
          ctx.drawImage(buf.canvas, 0, s * sliceH, bw, sliceH, cx - sliceW / 2, top, sliceW, bot - top)
        }
        ctx.restore()
      }
    }
  },
}

// ── Film Strip ─────────────────────────────────────────────────────────────

const FILM_SLOTS = 6
export const filmStrip: ShowcaseTemplate = {
  id: 'film-strip',
  name: 'Film Strip',
  description: 'A 3D-curved band of cards gliding through the center.',
  slotCount: FILM_SLOTS,
  defaultDuration: 12,
  params: [
    { type: 'color', id: 'background', label: 'Background', default: '#101014' },
    { type: 'number', id: 'cardSize', label: 'Card size', default: 32, min: 22, max: 48, step: 1, unit: '%' },
    { type: 'select', id: 'cardAspect', label: 'Card ratio', default: '1:1', options: ASPECT_OPTIONS },
    { type: 'number', id: 'gap', label: 'Gap', default: 2.5, min: 1, max: 8, step: 0.5, unit: '%' },
    { type: 'number', id: 'curve', label: '3D curve (out / in)', default: 70, min: -100, max: 100, step: 5, unit: '%' },
    MOTION_OPTIONS,
  ],
  render(rc) {
    const { ctx, t, width: w, height: h, params } = rc
    const lay = initLayout(rc)
    const cardH = lay.u * getNum(params, 'cardSize', 32)
    const aspect = parseAspect(getStr(params, 'cardAspect', '1:1'))
    const cardW = cardH * aspect
    const gap = lay.u * getNum(params, 'gap', 2.5)
    const curveAmt = getNum(params, 'curve', 70) / 100
    const absCurve = Math.abs(curveAmt)
    const curveSign = Math.sign(curveAmt)
    const step = cardW + gap
    const totalSpan = FILM_SLOTS * step
    const offset = scrollOffset(t, FILM_SLOTS, step, getStr(params, 'motion', 'flow'), lay.ease)
    const cy = h / 2
    const halfW = w / 2 + step
    const maxAngle = Math.max(0.06, absCurve * (Math.PI / 2.2))
    const curveRadius = halfW / maxAngle
    const cosMax = 1 - Math.cos(maxAngle)

    const curveX = (d: number) => {
      if (curveSign > 0) return Math.sin(Math.max(-Math.PI / 2, Math.min(Math.PI / 2, d / curveRadius))) * curveRadius
      if (curveSign < 0) { const n = d / halfW; return d * (1 + 0.45 * absCurve * n * n) }
      return d
    }
    const curveFactor = (d: number) => {
      const angle = Math.min(Math.abs(d) / curveRadius, Math.PI / 2)
      return Math.min(1.5, (1 - Math.cos(angle)) / cosMax)
    }

    const buf = getDistortionCanvas(cardW, cardH)

    for (let i = 0; i < FILM_SLOTS; i++) {
      const basePos = ((((i * step - offset) % totalSpan) + totalSpan) % totalSpan) - totalSpan / 2
      for (let wrap = -1; wrap <= 1; wrap++) {
        const pos = basePos + wrap * totalSpan
        if (Math.abs(curveX(pos)) > w / 2 + cardW * 1.5) continue
        const img = getSlotImage(rc, i)
        const cf = curveFactor(pos)
        const alpha = curveSign > 0 ? Math.max(0.25, 1 - 0.45 * absCurve * cf) : 1

        if (!buf || absCurve < 0.03) {
          const x = w / 2 + curveX(pos)
          drawSlot(ctx, img, i, { x: x - cardW / 2, y: cy - cardH / 2, w: cardW, h: cardH }, lay.radius, { alpha })
          continue
        }

        const bw = buf.canvas.width, bh = buf.canvas.height
        buf.ctx.clearRect(0, 0, bw, bh)
        drawSlot(buf.ctx as CanvasRenderingContext2D, img, i, { x: 0, y: 0, w: bw, h: bh }, lay.radius)
        ctx.save()
        ctx.globalAlpha *= alpha

        const slices = Math.min(72, Math.max(12, Math.round(cardW / 5)))
        const sliceSrcW = bw / slices
        let prevX = Math.round(w / 2 + curveX(pos - cardW / 2))
        for (let s = 0; s < slices; s++) {
          const d = pos - cardW / 2 + ((s + 1) * cardW) / slices
          if (curveSign > 0 && Math.abs(d / curveRadius) >= Math.PI / 2) break
          const left = prevX
          const right = Math.round(w / 2 + curveX(d))
          prevX = right
          if (right <= left) continue
          const midCf = curveFactor(pos - cardW / 2 + ((s + 0.5) * cardW) / slices)
          const scaleY = curveSign > 0 ? 1 - 0.55 * absCurve * midCf : 1 + 0.4 * absCurve * midCf
          const sliceH = cardH * scaleY
          ctx.drawImage(buf.canvas, s * sliceSrcW, 0, sliceSrcW, bh, left, cy - sliceH / 2, right - left, sliceH)
        }
        ctx.restore()
      }
    }
  },
}

// ── Orbit Carousel ─────────────────────────────────────────────────────────

const ORBIT_SLOTS = 4
export const orbitCarousel: ShowcaseTemplate = {
  id: 'orbit-carousel',
  name: 'Orbit Carousel',
  description: 'Designs orbit in 3D-like depth, front card in focus.',
  slotCount: ORBIT_SLOTS,
  defaultDuration: 12,
  params: [
    { type: 'number', id: 'spread', label: 'Spread', default: 70, min: 40, max: 100, step: 5, unit: '%' },
    { type: 'number', id: 'depth', label: 'Depth fade', default: 60, min: 20, max: 90, step: 5, unit: '%' },
    { type: 'select', id: 'cardAspect', label: 'Card ratio', default: '1:1', options: ASPECT_WITH_FRAME },
  ],
  render(rc) {
    const { ctx, t, width: w, height: h, params } = rc
    const lay = initLayout(rc)
    const port = isPortrait(w, h)
    const spread = getNum(params, 'spread', 70) / 100
    const depthFade = getNum(params, 'depth', 60) / 100
    const aspect = getStr(params, 'cardAspect', '1:1')
    const half = scaleRect(lay.content, 0.52)
    const card = aspect === 'frame' ? half : fitToAspect(half, parseAspect(aspect))
    const orbitR = (port ? lay.content.h : lay.content.w) * 0.5 * spread

    const items = Array.from({ length: ORBIT_SLOTS }, (_, i) => {
      const angle = 2 * Math.PI * (t + i / ORBIT_SLOTS)
      return { slot: i, offset: Math.sin(angle) * orbitR, depth: Math.cos(angle) }
    }).sort((a, b) => a.depth - b.depth)

    for (const item of items) {
      const norm = (item.depth + 1) / 2
      const scale = 1 - depthFade * 0.55 * (1 - norm)
      const alpha = 1 - depthFade * (1 - norm)
      const r = scaleRect(card, scale)
      if (port) r.y += item.offset; else r.x += item.offset
      drawSlot(ctx, getSlotImage(rc, item.slot), item.slot, r, lay.radius * scale, {
        alpha, shadow: lay.shadow * 2.5 * norm,
      })
    }
  },
}

// ── Photo Orbit ────────────────────────────────────────────────────────────

const PHOTO_ORBIT_SLOTS = 8
const PHOTO_SCALES = [1, 0.84, 0.95, 0.78, 1.04, 0.88, 0.98, 0.82]
const PHOTO_OFFSETS = [0, 6, -4, 8, -6, 4, -8, 5]

export const photoOrbit: ShowcaseTemplate = {
  id: 'photo-orbit',
  name: 'Photo Orbit',
  description: 'A cluster of cards slowly orbiting the center.',
  slotCount: PHOTO_ORBIT_SLOTS,
  defaultDuration: 18,
  params: [
    { type: 'color', id: 'background', label: 'Background', default: '#101014' },
    { type: 'select', id: 'direction', label: 'Direction', default: 'right', options: [
      { value: 'right', label: 'Clockwise' }, { value: 'left', label: 'Counter-clockwise' },
    ]},
    { type: 'select', id: 'motion', label: 'Motion', default: 'linear', options: [
      { value: 'linear', label: 'Linear' }, { value: 'pulse', label: 'Fast–slow–fast' }, { value: 'steps', label: 'Step per card' },
    ]},
    { type: 'number', id: 'pulse', label: 'Pulse strength', default: 60, min: 10, max: 90, step: 5, unit: '%' },
    { type: 'number', id: 'ringWidth', label: 'Ring width', default: 56, min: 30, max: 80, step: 1, unit: '%' },
    { type: 'number', id: 'ringHeight', label: 'Ring height', default: 56, min: 30, max: 80, step: 1, unit: '%' },
    { type: 'number', id: 'cardSize', label: 'Card size', default: 26, min: 14, max: 38, step: 1, unit: '%' },
    { type: 'select', id: 'cardAspect', label: 'Card ratio', default: '1:1', options: ASPECT_OPTIONS },
  ],
  render(rc) {
    const { ctx, t, width: w, height: h, params } = rc
    const lay = initLayout(rc)
    const dir = getStr(params, 'direction', 'right') === 'right' ? 1 : -1
    const rx = (lay.content.w / 2) * (getNum(params, 'ringWidth', 56) / 100)
    const ry = (lay.content.h / 2) * (getNum(params, 'ringHeight', 56) / 100)
    const aspect = parseAspect(getStr(params, 'cardAspect', '1:1'))
    const cardW = lay.u * getNum(params, 'cardSize', 26)
    const cx = w / 2, cy = h / 2
    const motion = getStr(params, 'motion', 'linear')

    let prog = t
    if (motion === 'pulse') {
      const strength = getNum(params, 'pulse', 60) / 100
      prog = t + (strength / (2 * Math.PI)) * Math.sin(2 * Math.PI * t)
    } else if (motion === 'steps') {
      const { index, local } = splitProgress(t, PHOTO_ORBIT_SLOTS)
      prog = (index + lay.ease(remap(local, 0, 0.55))) / PHOTO_ORBIT_SLOTS
    }

    for (let i = 0; i < PHOTO_ORBIT_SLOTS; i++) {
      const angle = 2 * Math.PI * (dir * prog + i / PHOTO_ORBIT_SLOTS)
      const jitter = 1 + PHOTO_OFFSETS[i] / 100
      const x = cx + Math.sin(angle) * rx * jitter
      const y = cy - Math.cos(angle) * ry * jitter
      const cw = cardW * PHOTO_SCALES[i]
      const ch = cw / aspect
      drawSlot(ctx, getSlotImage(rc, i), i, { x: x - cw / 2, y: y - ch / 2, w: cw, h: ch }, lay.radius * 0.5, {
        shadow: lay.shadow * 1.5,
      })
    }
  },
}

// ── Wheel Carousel ─────────────────────────────────────────────────────────

const WHEEL_SLOTS = 6
const WHEEL_POSITIONS = 12
const WHEEL_STEP = (Math.PI * 2) / WHEEL_POSITIONS

export const wheelCarousel: ShowcaseTemplate = {
  id: 'wheel-carousel',
  name: 'Wheel Carousel',
  description: 'Cards on a giant wheel ticking forward with anticipation and overshoot.',
  slotCount: WHEEL_SLOTS,
  defaultDuration: 9,
  params: [
    { type: 'color', id: 'background', label: 'Background', default: '#101014' },
    { type: 'number', id: 'cornerRadius', label: 'Corner radius', default: 5, min: 0, max: 12, step: 0.5, unit: '%' },
    { type: 'select', id: 'direction', label: 'Direction', default: 'right', options: [
      { value: 'right', label: 'Clockwise' }, { value: 'left', label: 'Counter-clockwise' },
    ]},
    { type: 'number', id: 'cardSize', label: 'Card size', default: 70, min: 40, max: 90, step: 1, unit: '%' },
    { type: 'select', id: 'cardAspect', label: 'Card ratio', default: '1:1', options: ASPECT_OPTIONS },
    { type: 'number', id: 'wheelSize', label: 'Wheel size', default: 105, min: 70, max: 160, step: 1, unit: '%' },
    { type: 'number', id: 'anticipation', label: 'Anticipation', default: 20, min: 0, max: 40, step: 1, unit: '%' },
    { type: 'number', id: 'overshoot', label: 'Overshoot', default: 10, min: 0, max: 30, step: 1, unit: '%' },
    { type: 'number', id: 'hold', label: 'Hold', default: 33, min: 0, max: 60, step: 1, unit: '%' },
  ],
  render(rc) {
    const { ctx, t, width: w, height: h, params } = rc
    const lay = initLayout(rc)
    const dir = getStr(params, 'direction', 'right') === 'right' ? 1 : -1
    const wheelR = lay.u * getNum(params, 'wheelSize', 105)
    const cardH = lay.u * getNum(params, 'cardSize', 70)
    const aspect = parseAspect(getStr(params, 'cardAspect', '1:1'))
    const cardW = cardH * aspect
    const antic = getNum(params, 'anticipation', 20) / 100
    const over = getNum(params, 'overshoot', 10) / 100
    const holdPct = 1 - getNum(params, 'hold', 33) / 100
    const { index, local } = splitProgress(t, WHEEL_SLOTS)

    const norm = clamp01(local / Math.max(holdPct, 0.01))
    let k: number
    const smooth = (x: number) => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
    if (norm < 0.2) k = -antic * smooth(norm / 0.2)
    else if (norm < 0.6) k = lerp(-antic, 1 + over, lay.ease(remap(norm, 0.2, 0.6)))
    else k = lerp(1 + over, 1, smooth(remap(norm, 0.6, 1)))

    const angle = index + k
    const cx = w / 2, cy = h / 2 + wheelR

    const visible = Array.from({ length: WHEEL_POSITIONS }, (_, i) => i)
      .map(i => ({ i, ang: dir * (angle - i) * WHEEL_STEP }))
      .filter(({ ang }) => Math.cos(ang) > -0.05)
      .sort((a, b) => Math.cos(a.ang) - Math.cos(b.ang))

    for (const { i, ang } of visible) {
      const x = cx + Math.sin(ang) * wheelR
      const y = cy - Math.cos(ang) * wheelR
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(ang)
      drawSlot(ctx, getSlotImage(rc, i), i % WHEEL_SLOTS,
        { x: -cardW / 2, y: -cardH / 2, w: cardW, h: cardH }, lay.radius, { shadow: lay.shadow * 1.2 })
      ctx.restore()
    }
  },
}

// ── Carousel Flow ──────────────────────────────────────────────────────────

const CAROUSEL_SLOTS = 5
export const carouselFlow: ShowcaseTemplate = {
  id: 'carousel-flow',
  name: 'Carousel Flow',
  description: 'A gliding belt of cards; the centered card takes focus.',
  slotCount: CAROUSEL_SLOTS,
  defaultDuration: 10,
  params: [
    { type: 'number', id: 'sideScale', label: 'Side card scale', default: 0.82, min: 0.6, max: 1, step: 0.01 },
    { type: 'number', id: 'gap', label: 'Gap', default: 5, min: 1, max: 15, step: 0.5, unit: '%' },
    { type: 'select', id: 'cardAspect', label: 'Card ratio', default: '1:1', options: ASPECT_WITH_FRAME },
  ],
  render(rc) {
    const { ctx, t, width: w, height: h, params } = rc
    const lay = initLayout(rc)
    const port = isPortrait(w, h)
    const sideScale = getNum(params, 'sideScale', 0.82)
    const gap = lay.u * getNum(params, 'gap', 5)
    const { index, local } = splitProgress(t, CAROUSEL_SLOTS)
    const prog = index + lay.ease(remap(local, 0, 0.45))
    const axis = port ? 'y' : 'x'
    const aspectStr = getStr(params, 'cardAspect', '1:1')
    const aspectNum = parseAspect(aspectStr === 'frame' ? '1:1' : aspectStr)
    const cardW = axis === 'x'
      ? (aspectStr === 'frame' ? lay.content.w * 0.62 : lay.content.h * aspectNum)
      : lay.content.w
    const cardH = axis === 'x' ? lay.content.h
      : (aspectStr === 'frame' ? lay.content.h * 0.62 : lay.content.w / aspectNum)
    const step = (axis === 'x' ? cardW : cardH) + gap
    const total = step * CAROUSEL_SLOTS
    const cx = w / 2, cy = h / 2

    const items: { slot: number; offset: number; dist: number }[] = []
    for (let i = 0; i < CAROUSEL_SLOTS; i++) {
      let off = (i - prog) * step
      off = (((off % total) + total * 1.5) % total) - total / 2
      items.push({ slot: i, offset: off, dist: Math.abs(off) })
    }
    items.sort((a, b) => b.dist - a.dist)

    for (const item of items) {
      const focus = Math.max(0, 1 - item.dist / step)
      const s = sideScale + (1 - sideScale) * focus
      const alpha = 0.55 + 0.45 * focus
      const cw = cardW * s, ch = cardH * s
      const x = axis === 'x' ? cx + item.offset - cw / 2 : cx - cw / 2
      const y = axis === 'y' ? cy + item.offset - ch / 2 : cy - ch / 2
      drawSlot(ctx, getSlotImage(rc, item.slot), item.slot, { x, y, w: cw, h: ch }, lay.radius * s, {
        alpha, shadow: lay.shadow * 2 * focus,
      })
    }
  },
}

// ── Ticker Loop ────────────────────────────────────────────────────────────

const TICKER_SLOTS = 6
export const tickerLoop: ShowcaseTemplate = {
  id: 'ticker-loop',
  name: 'Ticker Loop',
  description: 'Opposing tilted marquee rows in constant motion.',
  slotCount: TICKER_SLOTS,
  defaultDuration: 12,
  params: [
    { type: 'number', id: 'angle', label: 'Tilt', default: -6, min: -15, max: 15, step: 1, unit: '°' },
    { type: 'number', id: 'rowGap', label: 'Row gap', default: 4, min: 1, max: 10, step: 0.5, unit: '%' },
    { type: 'select', id: 'direction', label: 'Direction', default: 'opposed', options: [
      { value: 'opposed', label: 'Opposed' }, { value: 'same', label: 'Same way' },
    ]},
    { type: 'select', id: 'cardAspect', label: 'Card ratio', default: '1:1', options: ASPECT_OPTIONS },
  ],
  render(rc) {
    const { ctx, t, width: w, height: h, params } = rc
    const lay = initLayout(rc)
    const port = isPortrait(w, h)
    const angle = getNum(params, 'angle', -6) * Math.PI / 180
    const rowGap = lay.u * getNum(params, 'rowGap', 4)
    const opposed = getStr(params, 'direction', 'opposed') === 'opposed'
    const trackLen = (port ? h : w) * 1.6

    ctx.save()
    ctx.translate(w / 2, h / 2)
    ctx.rotate(angle + (port ? Math.PI / 2 : 0))

    const rowH = ((port ? w : h) * 1.4 - rowGap) / 2 - rowGap
    const cardW = rowH * parseAspect(getStr(params, 'cardAspect', '1:1'))
    const cardGap = lay.u * 3
    const cardsPerRow = 3
    const repeatLen = (cardW + cardGap) * cardsPerRow

    for (let row = 0; row < 2; row++) {
      const dir = opposed && row === 1 ? 1 : -1
      const y = row === 0 ? -rowGap / 2 - rowH : rowGap / 2
      const scroll = t * repeatLen * dir
      const copies = Math.ceil(trackLen / repeatLen) + 2

      for (let c = -copies; c <= copies; c++) {
        for (let card = 0; card < cardsPerRow; card++) {
          const slotIdx = row * cardsPerRow + card
          let x = card * (cardW + cardGap) + c * repeatLen + scroll
          x -= cardW / 2
          if (x > trackLen / 2 + cardW || x + cardW < -trackLen / 2 - cardW) continue
          drawSlot(ctx, getSlotImage(rc, slotIdx), slotIdx,
            { x, y, w: cardW, h: rowH }, lay.radius * 0.8, {})
        }
      }
    }
    ctx.restore()
  },
}

// ── Column Drift ───────────────────────────────────────────────────────────

const COL_COLS = 3
const COL_ROWS = 2
const COL_SLOTS = COL_COLS * COL_ROWS

export const columnDrift: ShowcaseTemplate = {
  id: 'column-drift',
  name: 'Column Drift',
  description: 'Three card columns drifting in counter-flow.',
  slotCount: COL_SLOTS,
  defaultDuration: 12,
  params: [
    { type: 'number', id: 'gap', label: 'Gap', default: 3, min: 1, max: 8, step: 0.5, unit: '%' },
    { type: 'select', id: 'cardAspect', label: 'Card ratio', default: '1:1', options: ASPECT_OPTIONS },
  ],
  render(rc) {
    const { ctx, t, params } = rc
    const lay = initLayout(rc)
    const gap = lay.u * getNum(params, 'gap', 3)
    const aspect = parseAspect(getStr(params, 'cardAspect', '1:1'))
    const area = lay.content
    const colW = (area.w - gap * (COL_COLS - 1)) / COL_COLS
    const cardH = colW / aspect
    const repeatH = COL_ROWS * (cardH + gap)

    ctx.save()
    roundedRect(ctx, area.x, area.y, area.w, area.h, lay.radius)
    ctx.clip()

    for (let col = 0; col < COL_COLS; col++) {
      const dir = col === 1 ? -1 : 1
      const x = area.x + col * (colW + gap)
      const scroll = t * repeatH * dir
      for (let row = 0; row < COL_ROWS; row++) {
        const slot = col * COL_ROWS + row
        const rawY = (((row * (cardH + gap) + scroll) % repeatH) + repeatH) % repeatH
        for (let y = area.y + rawY - repeatH * Math.ceil((rawY + area.h) / repeatH); y < area.y + area.h; y += repeatH) {
          if (y + cardH < area.y) continue
          drawSlot(ctx, getSlotImage(rc, slot), slot,
            { x, y, w: colW, h: cardH }, lay.radius * 0.7, {})
        }
      }
    }
    ctx.restore()
  },
}
