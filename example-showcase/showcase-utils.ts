// Showcase template engine.
// Helper functions, types, easing, and canvas drawing utilities.

// ── Types ──────────────────────────────────────────────────────────────────

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface ShowcaseRenderContext {
  ctx: CanvasRenderingContext2D
  t: number // 0-1 normalized progress
  width: number
  height: number
  params: Record<string, any>
  images: (HTMLImageElement | HTMLCanvasElement | null)[]
}

export interface TemplateParam {
  type: string
  id: string
  label: string
  default: any
  min?: number
  max?: number
  step?: number
  unit?: string
  options?: { value: string; label: string }[]
  group?: string
  visibleIf?: { id: string; values: string[] }
}

export interface ShowcaseTemplate {
  id: string
  name: string
  description: string
  slotCount: number
  defaultDuration: number
  params: TemplateParam[]
  render: (ctx: ShowcaseRenderContext) => void
}

export interface ShadowConfig {
  offX: number
  offY: number
  blur: number
  spread: number
  color: string
  unit: number
}

export interface LayoutInfo {
  u: number
  content: Rect
  radius: number
  easeName: string
  ease: (t: number) => number
  shadow: number
}

// ── Param helpers ──────────────────────────────────────────────────────────

export function getNum(params: Record<string, any>, key: string, def: number): number {
  const v = params[key]
  return typeof v === 'number' ? v : def
}

export function getStr(params: Record<string, any>, key: string, def: string): string {
  const v = params[key]
  return typeof v === 'string' ? v : def
}

export function getBool(params: Record<string, any>, key: string, def: boolean): boolean {
  const v = params[key]
  return typeof v === 'boolean' ? v : def
}

// ── Math helpers ───────────────────────────────────────────────────────────

export function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** Remap t from [start,end] to [0,1], clamped */
export function remap(t: number, start: number, end: number): number {
  return end <= start ? (t >= start ? 1 : 0) : clamp01((t - start) / (end - start))
}

/** Staggered progress for item `index` out of `count` items */
export function stagger(t: number, index: number, count: number, overlap = 0): number {
  if (count <= 1) return clamp01(t)
  const segLen = 1 / (count - (count - 1) * clamp01(overlap))
  const segStart = index * segLen * (1 - clamp01(overlap))
  return remap(t, segStart, segStart + segLen)
}

/** Fade in/out envelope: ramp up from 0 to fadeIn, hold, ramp down from fadeOut to 1 */
export function envelope(t: number, fadeIn: number, fadeOut: number): number {
  return t < fadeIn ? remap(t, 0, fadeIn) : t < fadeOut ? 1 : 1 - remap(t, fadeOut, 1)
}

/** Split progress into index + local fraction */
export function splitProgress(t: number, count: number): { index: number; local: number } {
  const v = clamp01(t) * count
  let index = Math.floor(v)
  if (index >= count) index = count - 1
  return { index, local: v - index }
}

/** Is portrait orientation? */
export function isPortrait(w: number, h: number): boolean {
  return h > w * 1.05
}

// ── Layout helpers ─────────────────────────────────────────────────────────

function unitScale(w: number, h: number): number {
  return Math.min(w, h) / 100
}

export function contentRect(w: number, h: number, paddingPct: number): Rect {
  const pad = unitScale(w, h) * paddingPct
  return { x: pad, y: pad, w: w - pad * 2, h: h - pad * 2 }
}

export function scaleRect(r: Rect, s: number): Rect {
  const cx = r.x + r.w / 2
  const cy = r.y + r.h / 2
  return { x: cx - (r.w * s) / 2, y: cy - (r.h * s) / 2, w: r.w * s, h: r.h * s }
}

export function lerpRect(a: Rect, b: Rect, t: number): Rect {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    w: a.w + (b.w - a.w) * t,
    h: a.h + (b.h - a.h) * t,
  }
}

export function fitToAspect(r: Rect, aspect: number): Rect {
  let w = r.w
  let h = r.h
  if (w / h > aspect) w = h * aspect
  else h = w / aspect
  return { x: r.x + (r.w - w) / 2, y: r.y + (r.h - h) / 2, w, h }
}

export function parseAspect(s: string): number {
  switch (s) {
    case '4:3': return 4 / 3
    case '3:4': return 3 / 4
    case '16:9': return 16 / 9
    case '9:16': return 9 / 16
    case '4:5': return 4 / 5
    case '5:4': return 5 / 4
    case '1:1':
    default: return 1
  }
}

/** Compute grid cell rects for `count` items */
export function gridCells(area: Rect, count: number, gap: number, portrait: boolean): Rect[] {
  let cols: number
  if (count <= 1) cols = 1
  else if (count === 2) cols = portrait ? 1 : 2
  else if (count <= 4) cols = 2
  else cols = portrait ? 2 : 3
  if (count === 3) cols = portrait ? 1 : 3
  const rows = Math.ceil(count / cols)
  const cellW = (area.w - gap * (cols - 1)) / cols
  const cellH = (area.h - gap * (rows - 1)) / rows
  const cells: Rect[] = []
  for (let i = 0; i < count; i++) {
    const col = i % cols
    const row = Math.floor(i / cols)
    cells.push({ x: area.x + col * (cellW + gap), y: area.y + row * (cellH + gap), w: cellW, h: cellH })
  }
  return cells
}

// ── Easing functions ───────────────────────────────────────────────────────

const easeLinear = (t: number) => t
const easeSmooth = (t: number) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
const easeSnappy = (t: number) => t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)
const easeAccel = (t: number) => t <= 0 ? 0 : Math.pow(2, 10 * t - 10)
const easeOvershoot = (t: number) => 1 + 3.2 * Math.pow(t - 1, 3) + 2.2 * Math.pow(t - 1, 2)
const easeBounce = (t: number) =>
  t < 1 / 2.75 ? 7.5625 * t * t
    : t < 2 / 2.75 ? 7.5625 * (t -= 1.5 / 2.75) * t + 0.75
      : t < 2.5 / 2.75 ? 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375
        : 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375
const easeElastic = (t: number) => {
  if (t <= 0) return 0
  if (t >= 1) return 1
  const p = (2 * Math.PI) / 3
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * p) + 1
}

const EASING_MAP: Record<string, (t: number) => number> = {
  linear: easeLinear,
  smooth: easeSmooth,
  snappy: easeSnappy,
  overshoot: easeOvershoot,
  bounce: easeBounce,
  elastic: easeElastic,
}

export function getEasing(name: string, customAmount = 60): (t: number) => number {
  if (name === 'custom') {
    const norm = Math.max(-100, Math.min(100, customAmount)) / 100
    if (norm === 0) return easeLinear
    const power = 1 + Math.abs(norm) * 4
    return norm > 0 ? (t) => 1 - Math.pow(1 - t, power) : (t) => Math.pow(t, power)
  }
  return EASING_MAP[name] ?? easeSmooth
}

export { easeSmooth, easeOvershoot, easeAccel }

// ── Shadow system ──────────────────────────────────────────────────────────

let currentShadow: ShadowConfig | null = null

export function setShadowConfig(s: ShadowConfig | null) {
  currentShadow = s
}

export function drawShadow(ctx: CanvasRenderingContext2D, rect: Rect, radius: number, amount: number) {
  if (amount <= 0 || !currentShadow) return
  const s = currentShadow
  const scale = s.unit > 0 ? amount / s.unit : 1
  ctx.save()
  ctx.shadowColor = s.color
  ctx.shadowBlur = s.blur * scale
  let shiftX = 0, shiftY = 0, hasTransform = false
  const BIG = 1e5
  try {
    const m = ctx.getTransform()
    const det = m.a * m.d - m.b * m.c
    if (det) { shiftX = -BIG * m.d / det; shiftY = BIG * m.b / det; hasTransform = true }
  } catch {}
  ctx.shadowOffsetX = (hasTransform ? BIG : 0) + s.offX
  ctx.shadowOffsetY = s.offY
  const spread = hasTransform ? s.spread : Math.min(s.spread, -1)
  roundedRect(ctx, rect.x + shiftX - spread, rect.y + shiftY - spread,
    Math.max(0, rect.w + spread * 2), Math.max(0, rect.h + spread * 2), Math.max(0, radius + spread))
  ctx.fillStyle = '#000'
  ctx.fill()
  ctx.restore()
}

// ── Canvas drawing ─────────────────────────────────────────────────────────

export function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const cr = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, cr)
    return
  }
  ctx.moveTo(x + cr, y)
  ctx.arcTo(x + w, y, x + w, y + h, cr)
  ctx.arcTo(x + w, y + h, x, y + h, cr)
  ctx.arcTo(x, y + h, x, y, cr)
  ctx.arcTo(x, y, x + w, y, cr)
  ctx.closePath()
}

function getMediaSize(img: HTMLImageElement | HTMLCanvasElement | null): { w: number; h: number } | null {
  if (!img) return null
  if ('videoWidth' in img) return { w: (img as any).videoWidth, h: (img as any).videoHeight }
  return { w: img.width, h: img.height }
}

function computeCoverCrop(srcW: number, srcH: number, dstW: number, dstH: number, zoom = 1, panX = 0, panY = 0) {
  const scale = Math.max(dstW / srcW, dstH / srcH) * Math.max(zoom, 1e-4)
  const visW = dstW / scale
  const visH = dstH / scale
  const offX = (srcW - visW) / 2
  const offY = (srcH - visH) / 2
  return {
    sx: offX * (1 + Math.max(-1, Math.min(1, panX))),
    sy: offY * (1 + Math.max(-1, Math.min(1, panY))),
    sw: visW,
    sh: visH,
  }
}

function drawPlaceholder(ctx: CanvasRenderingContext2D, rect: Rect, radius: number) {
  ctx.save()
  roundedRect(ctx, rect.x, rect.y, rect.w, rect.h, radius)
  ctx.clip()
  ctx.fillStyle = '#5b5b66'
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h)
  ctx.restore()
}

export function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | HTMLCanvasElement | null,
  rect: Rect,
  radius: number,
  opts: { zoom?: number; panX?: number; panY?: number; alpha?: number } = {},
) {
  if (rect.w <= 0 || rect.h <= 0) return
  const alpha = opts.alpha ?? 1
  if (alpha <= 0) return
  const size = img ? getMediaSize(img) : null
  if (!img || !size || size.w <= 0 || size.h <= 0) {
    ctx.save(); ctx.globalAlpha *= alpha; drawPlaceholder(ctx, rect, radius); ctx.restore()
    return
  }
  const crop = computeCoverCrop(size.w, size.h, rect.w, rect.h, opts.zoom, opts.panX, opts.panY)
  ctx.save()
  ctx.globalAlpha *= alpha
  roundedRect(ctx, rect.x, rect.y, rect.w, rect.h, radius)
  ctx.clip()
  ctx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, rect.x, rect.y, rect.w, rect.h)
  ctx.restore()
}

/** Draw a slot image with optional shadow, alpha, zoom, pan */
export function drawSlot(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | HTMLCanvasElement | null,
  _slotIndex: number,
  rect: Rect,
  radius: number,
  opts: { alpha?: number; shadow?: number; zoom?: number; panX?: number; panY?: number } = {},
) {
  if (rect.w <= 0 || rect.h <= 0) return
  const alpha = opts.alpha ?? 1
  if (alpha <= 0) return
  ctx.save()
  ctx.globalAlpha *= alpha
  if (opts.shadow && opts.shadow > 0 && currentShadow) {
    drawShadow(ctx, rect, radius, opts.shadow)
  }
  const size = img ? getMediaSize(img) : null
  if (img && size && size.w > 0 && size.h > 0) {
    drawImageCover(ctx, img, rect, radius, { zoom: opts.zoom, panX: opts.panX, panY: opts.panY })
  } else {
    drawPlaceholder(ctx, rect, radius)
  }
  ctx.restore()
}

/** Get image from slot array */
export function getSlotImage(ctx: ShowcaseRenderContext, index: number) {
  return ctx.images[index % ctx.images.length] ?? null
}

// ── Init layout (called at start of each template render) ──────────────────

function hexToRgba(hex: string, opacity: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return `rgba(0,0,0,${opacity})`
  const n = parseInt(m[1], 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${opacity})`
}

export function initLayout(rc: ShowcaseRenderContext): LayoutInfo {
  const { ctx, width: w, height: h, params } = rc
  try { ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high' } catch {}
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = getStr(params, 'background', '#101014')
  ctx.fillRect(0, 0, w, h)

  const u = unitScale(w, h)
  const shadowOn = getBool(params, 'shadowEnabled', false)
  setShadowConfig(shadowOn ? {
    offX: u * getNum(params, 'shadowX', 0),
    offY: u * getNum(params, 'shadowY', 1),
    blur: u * getNum(params, 'shadowBlur', 1.5),
    spread: u * getNum(params, 'shadowSpread', -0.25),
    color: hexToRgba(getStr(params, 'shadowColor', '#000000'), getNum(params, 'shadowOpacity', 40) / 100),
    unit: u,
  } : null)

  return {
    u,
    content: contentRect(w, h, getNum(params, 'padding', 6)),
    radius: u * getNum(params, 'cornerRadius', 3),
    easeName: getStr(params, 'easing', 'smooth'),
    ease: getEasing(getStr(params, 'easing', 'smooth'), getNum(params, 'easeAmount', 60)),
    shadow: shadowOn ? u : 0,
  }
}

// ── Offscreen canvas for 3D distortion ─────────────────────────────────────

let offscreenBuf: { canvas: OffscreenCanvas | HTMLCanvasElement; ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D } | null = null

export function getDistortionCanvas(w: number, h: number) {
  const iw = Math.max(2, Math.round(w))
  const ih = Math.max(2, Math.round(h))
  if (!offscreenBuf) {
    let canvas: OffscreenCanvas | HTMLCanvasElement
    if (typeof OffscreenCanvas !== 'undefined') canvas = new OffscreenCanvas(iw, ih)
    else if (typeof document !== 'undefined') canvas = document.createElement('canvas')
    else return null
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    offscreenBuf = { canvas, ctx: ctx as any }
  }
  if (offscreenBuf.canvas.width !== iw) offscreenBuf.canvas.width = iw
  if (offscreenBuf.canvas.height !== ih) offscreenBuf.canvas.height = ih
  try { (offscreenBuf.ctx as any).imageSmoothingEnabled = true; (offscreenBuf.ctx as any).imageSmoothingQuality = 'high' } catch {}
  return offscreenBuf
}

// ── Flow/step scroll offset ────────────────────────────────────────────────

export function scrollOffset(t: number, count: number, step: number, motion: string, ease: (t: number) => number): number {
  if (motion !== 'steps') return t * count * step
  const { index, local } = splitProgress(t, count)
  return (index + ease(remap(local, 0, 0.55))) * step
}

// ── PRNG (deterministic) ───────────────────────────────────────────────────

export function mulberry32(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 1831565813) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ── Shared param definitions ───────────────────────────────────────────────

export const ASPECT_OPTIONS = [
  { value: '1:1', label: '1:1' },
  { value: '4:3', label: '4:3' },
  { value: '3:4', label: '3:4' },
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
]

export const ASPECT_WITH_FRAME = [{ value: 'frame', label: 'Frame' }, ...ASPECT_OPTIONS]

export const MOTION_OPTIONS: TemplateParam = {
  type: 'select', id: 'motion', label: 'Motion', default: 'flow',
  options: [{ value: 'flow', label: 'Continuous' }, { value: 'steps', label: 'Stop at center' }],
}

/** Base params that most templates share (background, padding, radius, shadow, easing) */
export const BASE_PARAMS: TemplateParam[] = [
  { type: 'color', id: 'background', label: 'Background', default: '#101014' },
  { type: 'number', id: 'padding', label: 'Padding', default: 6, min: 0, max: 20, step: 0.5, unit: '%' },
  { type: 'number', id: 'cornerRadius', label: 'Corner radius', default: 3, min: 0, max: 12, step: 0.5, unit: '%' },
  { type: 'toggle', id: 'shadowEnabled', label: 'Shadow', default: false, group: 'Shadow' },
  { type: 'number', id: 'shadowX', label: 'X', default: 0, min: -10, max: 10, step: 0.5, unit: '%', group: 'Shadow' },
  { type: 'number', id: 'shadowY', label: 'Y', default: 1, min: -10, max: 10, step: 0.5, unit: '%', group: 'Shadow' },
  { type: 'number', id: 'shadowBlur', label: 'Blur', default: 1.5, min: 0, max: 10, step: 0.25, unit: '%', group: 'Shadow' },
  { type: 'number', id: 'shadowSpread', label: 'Spread', default: -0.25, min: -3, max: 3, step: 0.25, unit: '%', group: 'Shadow' },
  { type: 'number', id: 'shadowOpacity', label: 'Opacity', default: 40, min: 0, max: 100, step: 5, unit: '%', group: 'Shadow' },
  { type: 'color', id: 'shadowColor', label: 'Color', default: '#000000', group: 'Shadow' },
  { type: 'select', id: 'easing', label: 'Easing', default: 'smooth', options: [
    { value: 'smooth', label: 'Smooth' }, { value: 'snappy', label: 'Snappy' },
    { value: 'overshoot', label: 'Overshoot' }, { value: 'bounce', label: 'Bounce' },
    { value: 'elastic', label: 'Elastic' }, { value: 'linear', label: 'Linear' },
    { value: 'custom', label: 'Custom' },
  ]},
  { type: 'number', id: 'easeAmount', label: 'Custom curve (in ⟷ out)', default: 60, min: -100, max: 100, step: 5, unit: '%', visibleIf: { id: 'easing', values: ['custom'] } },
]

const SHADOW_PARAM_IDS = ['shadowEnabled', 'shadowX', 'shadowY', 'shadowBlur', 'shadowSpread', 'shadowOpacity', 'shadowColor']
const EASING_PARAM_IDS = ['easing', 'easeAmount']

/** Merge base params with template-specific params, deduplicating by id */
export function mergeParams(template: ShowcaseTemplate, excludeIds?: string[]): TemplateParam[] {
  const exclude = new Set([...template.params.map(p => p.id), ...(excludeIds ?? [])])
  return [...BASE_PARAMS.filter(p => !exclude.has(p.id)), ...template.params]
}

/** Map of template -> excluded base param ids */
export function getExcludedBaseParams(templateId: string): string[] {
  const noShadow = SHADOW_PARAM_IDS
  const noEasing = EASING_PARAM_IDS
  const noPadding = ['padding']
  switch (templateId) {
    case 'card-totem': return [...noPadding, ...noShadow]
    case 'deck-peel': return noPadding
    case 'film-strip': return [...noPadding, ...noShadow]
    case 'poster-burst': return [...noPadding, ...noEasing]
    case 'image-trail': return noPadding
    case 'wheel-carousel': return noPadding
    case 'ticker-loop': return [...noPadding, ...noEasing, ...noShadow]
    case 'cascade-drop': return noEasing
    case 'orbit-carousel': return noEasing
    case 'showcase-stream': return noEasing
    case 'column-drift': return [...noEasing, ...noShadow]
    case 'pop-grid': return [...noEasing, ...noShadow]
    case 'diagonal-wipe': return noShadow
    case 'stripe-reveal': return noShadow
    case 'zoom-parallax': return noShadow
    default: return []
  }
}

/** Get default params for a template */
export function getDefaultParams(template: ShowcaseTemplate): Record<string, any> {
  const params: Record<string, any> = {}
  for (const p of mergeParams(template, getExcludedBaseParams(template.id))) {
    params[p.id] = p.default
  }
  return params
}
