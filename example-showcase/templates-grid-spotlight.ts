// Grid + Spotlight & Focus + Reveal & Wipe templates
// 11 templates: GridReveal, SpotlightZoom, FlipGrid, PopGrid,
//               CenterStage, FocusShift, DeckPeel, ZoomParallax,
//               DiagonalWipe, StripeReveal, SplitReveal

import {
  type ShowcaseTemplate, type ShowcaseRenderContext,
  initLayout, getNum, getStr, getBool, getSlotImage, drawSlot, drawImageCover,
  roundedRect, scaleRect, lerpRect, fitToAspect, parseAspect, gridCells,
  clamp01, lerp, remap, stagger, envelope, splitProgress, isPortrait, mulberry32,
  easeOvershoot, easeAccel,
  ASPECT_OPTIONS, ASPECT_WITH_FRAME,
} from './showcase-utils.ts'

// ── Grid Reveal ────────────────────────────────────────────────────────────

const GRID_SLOTS = 4
const GRID_ORDERS: Record<string, number[]> = {
  row: [0, 1, 2, 3],
  column: [0, 2, 1, 3],
  diagonal: [0, 1, 2, 3].sort((a, b) => (a % 2) + Math.floor(a / 2) - ((b % 2) + Math.floor(b / 2))),
}

export const gridReveal: ShowcaseTemplate = {
  id: 'grid-reveal',
  name: 'Grid Reveal',
  description: 'A 2×2 grid assembles tile by tile, holds, then disperses.',
  slotCount: GRID_SLOTS,
  defaultDuration: 6,
  params: [
    { type: 'number', id: 'gap', label: 'Gap', default: 3, min: 0, max: 10, step: 0.5, unit: '%' },
    { type: 'select', id: 'order', label: 'Reveal order', default: 'row', options: [
      { value: 'row', label: 'Rows' }, { value: 'column', label: 'Columns' }, { value: 'diagonal', label: 'Diagonal' },
    ]},
  ],
  render(rc) {
    const { ctx, t, params } = rc
    const lay = initLayout(rc)
    const gap = lay.u * getNum(params, 'gap', 3)
    const order = GRID_ORDERS[getStr(params, 'order', 'row')] ?? GRID_ORDERS.row
    const cells = gridCells(lay.content, GRID_SLOTS, gap, false)

    for (let i = 0; i < GRID_SLOTS; i++) {
      const rank = order.indexOf(i)
      let prog: number
      if (t < 0.65) prog = lay.ease(stagger(remap(t, 0, 0.35), rank, GRID_SLOTS, 0.5))
      else prog = 1 - lay.ease(stagger(remap(t, 0.65, 1), GRID_SLOTS - 1 - rank, GRID_SLOTS, 0.5))

      const s = 0.7 + 0.3 * prog
      const cell = scaleRect(cells[i], s)
      drawSlot(ctx, getSlotImage(rc, i), i, cell, lay.radius, {
        alpha: prog, shadow: lay.shadow * 1.5 * prog,
      })
    }
  },
}

// ── Spotlight Zoom ─────────────────────────────────────────────────────────

const SPOTLIGHT_SLOTS = 4
export const spotlightZoom: ShowcaseTemplate = {
  id: 'spotlight-zoom',
  name: 'Spotlight Zoom',
  description: 'Grid tiles take turns filling the frame.',
  slotCount: SPOTLIGHT_SLOTS,
  defaultDuration: 12,
  params: [
    { type: 'number', id: 'gap', label: 'Gap', default: 3, min: 0, max: 10, step: 0.5, unit: '%' },
    { type: 'number', id: 'dimming', label: 'Background dim', default: 45, min: 0, max: 80, step: 5, unit: '%' },
  ],
  render(rc) {
    const { ctx, t, params } = rc
    const lay = initLayout(rc)
    const gap = lay.u * getNum(params, 'gap', 3)
    const dim = getNum(params, 'dimming', 45) / 100
    const cells = gridCells(lay.content, SPOTLIGHT_SLOTS, gap, false)
    const { index, local } = splitProgress(t, SPOTLIGHT_SLOTS)

    let prog: number
    if (local < 0.22) prog = lay.ease(remap(local, 0, 0.22))
    else if (local < 0.78) prog = 1
    else prog = 1 - lay.ease(remap(local, 0.78, 1))

    for (let i = 0; i < SPOTLIGHT_SLOTS; i++) {
      if (i !== index) drawSlot(ctx, getSlotImage(rc, i), i, cells[i], lay.radius, { alpha: 1 - dim * prog })
    }

    const expanded = lerpRect(cells[index], lay.content, prog)
    drawSlot(ctx, getSlotImage(rc, index), index, expanded, lerp(lay.radius, lay.radius * 1.4, prog), {
      shadow: lay.shadow * 3 * prog,
    })
  },
}

// ── Flip Grid ──────────────────────────────────────────────────────────────

const FLIP_TILES = 4
const FLIP_SLOTS = FLIP_TILES * 2

export const flipGrid: ShowcaseTemplate = {
  id: 'flip-grid',
  name: 'Flip Grid',
  description: 'Tiles flip between two sets of designs in a ripple.',
  slotCount: FLIP_SLOTS,
  defaultDuration: 8,
  params: [
    { type: 'number', id: 'gap', label: 'Gap', default: 3, min: 0, max: 10, step: 0.5, unit: '%' },
    { type: 'select', id: 'axis', label: 'Flip axis', default: 'horizontal', options: [
      { value: 'horizontal', label: 'Horizontal' }, { value: 'vertical', label: 'Vertical' },
    ]},
  ],
  render(rc) {
    const { ctx, t, params } = rc
    const lay = initLayout(rc)
    const gap = lay.u * (typeof params.gap === 'number' ? params.gap : 3)
    const horiz = getStr(params, 'axis', 'horizontal') === 'horizontal'
    const cells = gridCells(lay.content, FLIP_TILES, gap, false)
    const flipDur = 0.12

    for (let i = 0; i < FLIP_TILES; i++) {
      const offset = i * 0.13
      const local = (t - offset + 1) % 1
      let scaleVal = 1
      let showB: boolean

      if (local < flipDur) {
        const p = lay.ease(local / flipDur)
        scaleVal = Math.abs(Math.cos(Math.PI * p))
        showB = p >= 0.5
      } else if (local < 0.5) {
        showB = true
      } else if (local < 0.5 + flipDur) {
        const p = lay.ease((local - 0.5) / flipDur)
        scaleVal = Math.abs(Math.cos(Math.PI * p))
        showB = p < 0.5
      } else {
        showB = false
      }

      const slot = showB! ? i + FLIP_TILES : i
      const cell = cells[i]
      const cx = cell.x + cell.w / 2
      const cy = cell.y + cell.h / 2

      ctx.save()
      ctx.translate(cx, cy)
      ctx.scale(horiz ? Math.max(scaleVal, 0.001) : 1, horiz ? 1 : Math.max(scaleVal, 0.001))
      drawSlot(ctx, getSlotImage(rc, slot), slot,
        { x: -cell.w / 2, y: -cell.h / 2, w: cell.w, h: cell.h }, lay.radius, {
          shadow: lay.shadow * (1 - scaleVal) * 3,
        })
      ctx.restore()
    }
  },
}

// ── Pop Grid ───────────────────────────────────────────────────────────────

const POP_SLOTS = 6
export const popGrid: ShowcaseTemplate = {
  id: 'pop-grid',
  name: 'Pop Grid',
  description: 'Grid tiles pop in and out on their own offbeat cycles.',
  slotCount: POP_SLOTS,
  defaultDuration: 8,
  params: [
    { type: 'number', id: 'gap', label: 'Gap', default: 3, min: 0, max: 10, step: 0.5, unit: '%' },
    { type: 'number', id: 'visible', label: 'Visible share', default: 62, min: 30, max: 85, step: 1, unit: '%' },
  ],
  render(rc) {
    const { ctx, t, width: w, height: h, params } = rc
    const lay = initLayout(rc)
    const gap = lay.u * getNum(params, 'gap', 3)
    const visible = getNum(params, 'visible', 62) / 100
    const cells = gridCells(lay.content, POP_SLOTS, gap, isPortrait(w, h))
    const rng = mulberry32(42)
    const offsets = Array.from({ length: POP_SLOTS }, () => rng())
    const fadeIn = (1 - visible) / 2
    const fadeOut = 1 - fadeIn

    for (let i = 0; i < POP_SLOTS; i++) {
      const local = (t + offsets[i]) % 1
      const prog = envelope(local, fadeIn, fadeOut)
      if (prog <= 0) continue
      const enter = local < fadeIn ? easeOvershoot(prog) : prog
      const cell = scaleRect(cells[i], Math.max(0.001, enter))
      drawSlot(ctx, getSlotImage(rc, i), i, cell, lay.radius * enter, { alpha: Math.min(1, prog * 1.6) })
    }
  },
}

// ── Center Stage ───────────────────────────────────────────────────────────

const CENTER_SLOTS = 3
export const centerStage: ShowcaseTemplate = {
  id: 'center-stage',
  name: 'Center Stage',
  description: 'One design at a time takes the spotlight.',
  slotCount: CENTER_SLOTS,
  defaultDuration: 7,
  params: [
    { type: 'number', id: 'travel', label: 'Travel distance', default: 60, min: 20, max: 120, step: 5, unit: '%' },
    { type: 'toggle', id: 'ghosts', label: 'Ghost trail', default: true },
    { type: 'number', id: 'cardSize', label: 'Card size', default: 86, min: 60, max: 100, step: 1, unit: '%' },
  ],
  render(rc) {
    const { ctx, t, width: w, params } = rc
    const lay = initLayout(rc)
    const travel = (getNum(params, 'travel', 60) / 100) * w
    const ghosts = getBool(params, 'ghosts', true)
    const card = scaleRect(lay.content, getNum(params, 'cardSize', 86) / 100)
    const { index, local } = splitProgress(t, CENTER_SLOTS)
    const holdEnd = 0.75

    if (local < holdEnd) {
      // Enter
      const p = lay.ease(remap(local, 0, 0.3))
      const r = scaleRect(card, lerp(0.9, 1, p))
      r.x += travel * (1 - p)
      drawSlot(ctx, getSlotImage(rc, index), index, r, lay.radius, {
        alpha: p, shadow: lay.shadow * 2.5 * p,
      })
    } else {
      // Exit
      const p = lay.ease(remap(local, holdEnd, 1))
      const xOff = -travel * p
      const s = lerp(1, 0.92, p)
      const alpha = 1 - p

      if (ghosts) {
        for (let g = 3; g >= 1; g--) {
          const gp = lay.ease(remap(local - g * 0.025, holdEnd, 1))
          const gr = scaleRect(card, lerp(1, 0.92, gp))
          gr.x += -travel * gp
          drawSlot(ctx, getSlotImage(rc, index), index, gr, lay.radius, { alpha: alpha * 0.12 * (4 - g) })
        }
      }
      const r = scaleRect(card, s)
      r.x += xOff
      drawSlot(ctx, getSlotImage(rc, index), index, r, lay.radius, {
        alpha, shadow: lay.shadow * 2.5 * alpha,
      })
    }
  },
}

// ── Focus Shift ────────────────────────────────────────────────────────────

const FOCUS_SLOTS = 4
export const focusShift: ShowcaseTemplate = {
  id: 'focus-shift',
  name: 'Focus Shift',
  description: 'Thumbnails take turns expanding into the spotlight.',
  slotCount: FOCUS_SLOTS,
  defaultDuration: 10,
  params: [
    { type: 'number', id: 'railSize', label: 'Rail size', default: 26, min: 18, max: 40, step: 1, unit: '%' },
    { type: 'number', id: 'gap', label: 'Gap', default: 2.5, min: 0.5, max: 8, step: 0.5, unit: '%' },
  ],
  render(rc) {
    const { ctx, t, width: w, height: h, params } = rc
    const lay = initLayout(rc)
    const port = isPortrait(w, h)
    const railPct = getNum(params, 'railSize', 26) / 100
    const gap = lay.u * getNum(params, 'gap', 2.5)
    const m = lay.content

    let mainRect: { x: number; y: number; w: number; h: number }
    let thumbRects: { x: number; y: number; w: number; h: number }[]

    if (port) {
      const railH = m.h * railPct
      mainRect = { x: m.x, y: m.y, w: m.w, h: m.h - railH - gap }
      const tw = (m.w - gap * 2) / 3
      thumbRects = [0, 1, 2].map(i => ({ x: m.x + i * (tw + gap), y: m.y + m.h - railH, w: tw, h: railH }))
    } else {
      const railW = m.w * railPct
      mainRect = { x: m.x, y: m.y, w: m.w - railW - gap, h: m.h }
      const th = (m.h - gap * 2) / 3
      thumbRects = [0, 1, 2].map(i => ({ x: m.x + m.w - railW, y: m.y + i * (th + gap), w: railW, h: th }))
    }

    const { index, local } = splitProgress(t, FOCUS_SLOTS)
    const prog = lay.ease(remap(local, 0, 0.4))
    const curr = index
    const prev = (index + FOCUS_SLOTS - 1) % FOCUS_SLOTS
    const currThumbs = [1, 2, 3].map(i => (curr + i) % FOCUS_SLOTS)
    const prevThumbs = [1, 2, 3].map(i => (prev + i) % FOCUS_SLOTS)

    const getLayout = (slot: number) => {
      if (slot === curr) {
        const fromThumb = thumbRects[prevThumbs.indexOf(slot)] ?? thumbRects[0]
        return { rect: lerpRect(fromThumb, mainRect, prog), radius: lay.radius }
      }
      if (slot === prev) return { rect: lerpRect(mainRect, thumbRects[2], prog), radius: lay.radius }
      const prevIdx = prevThumbs.indexOf(slot)
      const currIdx = currThumbs.indexOf(slot)
      return { rect: lerpRect(thumbRects[prevIdx], thumbRects[currIdx], prog), radius: lay.radius * 0.8 }
    }

    const drawOrder = [...currThumbs.filter(s => s !== prev && s !== curr), prev, curr]
    for (const slot of drawOrder) {
      const { rect, radius } = getLayout(slot)
      drawSlot(ctx, getSlotImage(rc, slot), slot, rect, radius, {
        shadow: slot === curr ? lay.shadow * 2.5 * prog : lay.shadow,
      })
    }
  },
}

// ── Deck Peel ──────────────────────────────────────────────────────────────

const DECK_SLOTS = 4
export const deckPeel: ShowcaseTemplate = {
  id: 'deck-peel',
  name: 'Deck Peel',
  description: 'A centered deck where the front card drops away in turn.',
  slotCount: DECK_SLOTS,
  defaultDuration: 9,
  params: [
    { type: 'color', id: 'background', label: 'Background', default: '#101014' },
    { type: 'number', id: 'cardSize', label: 'Card size', default: 48, min: 35, max: 65, step: 1, unit: '%' },
    { type: 'select', id: 'cardAspect', label: 'Card ratio', default: '1:1', options: ASPECT_WITH_FRAME },
    { type: 'number', id: 'peek', label: 'Stack peek', default: 4, min: 2, max: 8, step: 0.5, unit: '%' },
  ],
  render(rc) {
    const { ctx, t, width: w, height: h, params } = rc
    const lay = initLayout(rc)
    const cardSize = lay.u * getNum(params, 'cardSize', 48)
    const aspect = parseAspect(getStr(params, 'cardAspect', '1:1'))
    const peekDist = lay.u * getNum(params, 'peek', 4)
    const cardRect = {
      x: w / 2 - cardSize / 2,
      y: h / 2 - cardSize / aspect / 2,
      w: cardSize,
      h: cardSize / aspect,
    }
    const rad = lay.radius * 1.6
    const { index, local } = splitProgress(t, DECK_SLOTS)
    const prog = lay.ease(remap(local, 0, 0.45))

    const peekRect = (depth: number) => ({
      x: cardRect.x, y: cardRect.y - peekDist * depth, w: cardRect.w, h: cardRect.h,
    })

    // Stack behind (3 cards receding)
    const stack: { slot: number; depth: number }[] = [{ slot: index, depth: 4 - prog }]
    for (let d = 3; d >= 1; d--) stack.push({ slot: (index + d) % DECK_SLOTS, depth: d - prog })

    for (const { slot, depth } of stack) {
      const r = peekRect(depth)
      ctx.save()
      ctx.translate(r.x + r.w / 2, r.y + r.h / 2)
      ctx.scale(1 - depth * 0.03, 1)
      drawSlot(ctx, getSlotImage(rc, slot), slot,
        { x: -r.w / 2, y: -r.h / 2, w: r.w, h: r.h }, rad, { shadow: lay.shadow * 1.2 })
      ctx.restore()
    }

    // Peeling card
    const dropY = prog * (h - cardRect.y + lay.u * 12)
    ctx.save()
    ctx.translate(cardRect.x + cardRect.w / 2, cardRect.y + cardRect.h / 2 + dropY)
    ctx.rotate((5 * Math.PI / 180) * prog)
    drawSlot(ctx, getSlotImage(rc, index), index,
      { x: -cardRect.w / 2, y: -cardRect.h / 2, w: cardRect.w, h: cardRect.h }, rad, {
        shadow: lay.shadow * 2.5 * (1 - prog * 0.5),
      })
    ctx.restore()
  },
}

// ── Zoom Parallax ──────────────────────────────────────────────────────────

const ZOOM_SLOTS = 3
export const zoomParallax: ShowcaseTemplate = {
  id: 'zoom-parallax',
  name: 'Zoom Parallax',
  description: 'Slow Ken Burns drift with parallax crossfades.',
  slotCount: ZOOM_SLOTS,
  defaultDuration: 9,
  params: [
    { type: 'number', id: 'zoomAmount', label: 'Zoom amount', default: 12, min: 4, max: 25, step: 1, unit: '%' },
    { type: 'select', id: 'panDir', label: 'Pan direction', default: 'alternate', options: [
      { value: 'alternate', label: 'Alternate' }, { value: 'left', label: 'Left' }, { value: 'right', label: 'Right' },
    ]},
  ],
  render(rc) {
    const { ctx, t, params } = rc
    const lay = initLayout(rc)
    const zoom = getNum(params, 'zoomAmount', 12) / 100
    const panMode = getStr(params, 'panDir', 'alternate')
    const { index, local } = splitProgress(t, ZOOM_SLOTS)
    const crossFade = 0.18
    const panDir = (i: number) => panMode === 'left' ? -1 : panMode === 'right' ? 1 : i % 2 === 0 ? -1 : 1

    ctx.save()
    roundedRect(ctx, lay.content.x, lay.content.y, lay.content.w, lay.content.h, lay.radius)
    ctx.clip()

    const drawLayer = (slot: number, progress: number, alpha: number, entering: boolean) => {
      const img = getSlotImage(rc, slot)
      const z = entering ? lerp(1 + zoom * 1.5, 1, progress) : lerp(1, 1 + zoom, progress)
      const pan = panDir(slot) * lerp(-0.5, 0.5, progress) * (entering ? 0.3 : 1)
      if (img) {
        drawImageCover(ctx, img, lay.content, 0, { zoom: z, panX: pan, alpha })
      } else {
        ctx.save(); ctx.globalAlpha *= alpha
        ctx.fillStyle = '#5b5b66'; ctx.fillRect(lay.content.x, lay.content.y, lay.content.w, lay.content.h)
        ctx.restore()
      }
    }

    drawLayer(index, local, 1, false)
    if (local > 1 - crossFade) {
      const p = lay.ease(remap(local, 1 - crossFade, 1))
      drawLayer((index + 1) % ZOOM_SLOTS, 0, p, true)
    }
    ctx.restore()
  },
}

// ── Diagonal Wipe ──────────────────────────────────────────────────────────

const DIAG_SLOTS = 3
export const diagonalWipe: ShowcaseTemplate = {
  id: 'diagonal-wipe',
  name: 'Diagonal Wipe',
  description: 'Slides revealed by a sweeping diagonal edge.',
  slotCount: DIAG_SLOTS,
  defaultDuration: 8,
  params: [
    { type: 'number', id: 'angle', label: 'Edge angle', default: -20, min: -45, max: 45, step: 5, unit: '°' },
    { type: 'number', id: 'edgeGlow', label: 'Edge glow', default: 60, min: 0, max: 100, step: 5, unit: '%' },
  ],
  render(rc) {
    const { ctx, t, width: w, height: h, params } = rc
    const lay = initLayout(rc)
    const angle = getNum(params, 'angle', -20) * Math.PI / 180
    const glow = getNum(params, 'edgeGlow', 60) / 100
    const area = lay.content
    const { index, local } = splitProgress(t, DIAG_SLOTS)
    const crossDur = 0.35

    ctx.save()
    roundedRect(ctx, area.x, area.y, area.w, area.h, lay.radius)
    ctx.clip()

    // Current image
    const img = getSlotImage(rc, index)
    drawImageCover(ctx, img, area, 0)

    // Wipe transition
    if (local > 1 - crossDur) {
      const p = lay.ease(remap(local, 1 - crossDur, 1))
      const diag = w + h
      const cx = w / 2, cy = h / 2

      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(angle)
      ctx.beginPath()
      ctx.rect(diag / 2 - p * diag, -diag, diag, 2 * diag)
      ctx.clip()

      // Edge glow
      if (glow > 0) {
        ctx.fillStyle = `rgba(255,255,255,${0.5 * glow * Math.sin(Math.PI * p)})`
        ctx.fillRect(diag / 2 - p * diag, -diag, lay.u * 1.2, 2 * diag)
      }

      ctx.rotate(-angle)
      ctx.translate(-cx, -cy)
      const nextImg = getSlotImage(rc, (index + 1) % DIAG_SLOTS)
      drawImageCover(ctx, nextImg, area, 0)
      ctx.restore()
    }
    ctx.restore()
  },
}

// ── Stripe Reveal ──────────────────────────────────────────────────────────

const STRIPE_SLOTS = 3
export const stripeReveal: ShowcaseTemplate = {
  id: 'stripe-reveal',
  name: 'Stripe Reveal',
  description: 'Images reassemble from sliding strips.',
  slotCount: STRIPE_SLOTS,
  defaultDuration: 8,
  params: [
    { type: 'number', id: 'strips', label: 'Strips', default: 7, min: 3, max: 14, step: 1 },
  ],
  render(rc) {
    const { ctx, t, width: w, height: h, params } = rc
    const lay = initLayout(rc)
    const stripCount = Math.round(getNum(params, 'strips', 7))
    const horiz = !isPortrait(w, h)
    const area = lay.content
    const { index, local } = splitProgress(t, STRIPE_SLOTS)
    const transLen = 0.5

    ctx.save()
    roundedRect(ctx, area.x, area.y, area.w, area.h, lay.radius)
    ctx.clip()

    // Previous image as base
    const prevSlot = (index + STRIPE_SLOTS - 1) % STRIPE_SLOTS
    drawImageCover(ctx, getSlotImage(rc, prevSlot), area, 0)

    // Strips sliding in
    const prog = remap(local, 0, transLen)
    for (let s = 0; s < stripCount; s++) {
      const p = lay.ease(stagger(prog, s, stripCount, 0.65))
      if (p <= 0) continue
      const dir = s % 2 === 0 ? -1 : 1
      ctx.save()
      ctx.beginPath()
      if (horiz) {
        const stripW = area.w / stripCount
        ctx.rect(area.x + s * stripW, area.y, stripW + 1, area.h)
        ctx.clip()
        drawImageCover(ctx, getSlotImage(rc, index), { ...area, y: area.y + dir * (1 - p) * area.h }, 0)
      } else {
        const stripH = area.h / stripCount
        ctx.rect(area.x, area.y + s * stripH, area.w, stripH + 1)
        ctx.clip()
        drawImageCover(ctx, getSlotImage(rc, index), { ...area, x: area.x + dir * (1 - p) * area.w }, 0)
      }
      ctx.restore()
    }
    ctx.restore()
  },
}

// ── Split Reveal ───────────────────────────────────────────────────────────

const SPLIT_SLOTS = 4
export const splitReveal: ShowcaseTemplate = {
  id: 'split-reveal',
  name: 'Split Reveal',
  description: 'Paired panels slide in from opposite edges.',
  slotCount: SPLIT_SLOTS,
  defaultDuration: 8,
  params: [
    { type: 'number', id: 'splitRatio', label: 'Split ratio', default: 50, min: 30, max: 70, step: 1, unit: '%' },
    { type: 'number', id: 'gap', label: 'Gap', default: 2, min: 0, max: 8, step: 0.5, unit: '%' },
  ],
  render(rc) {
    const { ctx, t, width: w, height: h, params } = rc
    const lay = initLayout(rc)
    const port = isPortrait(w, h)
    const ratio = getNum(params, 'splitRatio', 50) / 100
    const gap = lay.u * getNum(params, 'gap', 2)
    const m = lay.content

    const panels = port
      ? [
          { x: m.x, y: m.y, w: m.w, h: m.h * ratio - gap / 2 },
          { x: m.x, y: m.y + m.h * ratio + gap / 2, w: m.w, h: m.h * (1 - ratio) - gap / 2 },
        ]
      : [
          { x: m.x, y: m.y, w: m.w * ratio - gap / 2, h: m.h },
          { x: m.x + m.w * ratio + gap / 2, y: m.y, w: m.w * (1 - ratio) - gap / 2, h: m.h },
        ]

    const { index, local } = splitProgress(t, 2)
    const curr = index
    const prev = (index + 1) % 2

    for (let p = 0; p < 2; p++) {
      const panel = panels[p]
      const baseSlot = prev * 2 + p
      const incomingSlot = curr * 2 + p
      const prog = lay.ease(remap(local, p * 0.08, 0.5 + p * 0.08))

      ctx.save()
      roundedRect(ctx, panel.x, panel.y, panel.w, panel.h, lay.radius)
      ctx.clip()

      // Static base (previous pair)
      drawSlot(ctx, getSlotImage(rc, baseSlot), baseSlot, panel, 0)

      // Sliding in (current pair)
      const isFirst = p === 0
      const size = port ? panel.h : panel.w
      const slideOff = (1 - prog) * size * (isFirst ? -1 : 1)
      const slideRect = port ? { ...panel, y: panel.y + slideOff } : { ...panel, x: panel.x + slideOff }
      drawSlot(ctx, getSlotImage(rc, incomingSlot), incomingSlot, slideRect, 0, {
        shadow: lay.shadow * 2 * (1 - Math.abs(prog * 2 - 1)),
      })
      ctx.restore()
    }
  },
}
