/**
 * Scene data for the "Kaleidoscope: Intro Slide" recreation.
 *
 * Extracted from Jitter project 4UHTbrTBhTIvF612Zz9f46nu via Playwriter
 * (window.app scene graph). A horizontal 1920x1080 artboard, 5220ms long.
 * Six full-frame layers scale in from the center one after another, like a
 * kaleidoscope zoom, ending on a presentation title slide with a Greek
 * temple photo:
 *
 *   Frame 01  circle pattern (pink rings on navy)   scale 0 -> 1.5  @ 0
 *   Frame 02  cream solid background                scale 0 -> 1.5  @ 1062
 *   Frame 03  line grid (cream lines on navy)       scale 0 -> 1    @ 1340
 *   Frame 04  pink solid background                 scale 0 -> 1.3  @ 1808
 *   Frame 05  square shapes (blue squares on navy)  scale 0 -> 1.3  @ 2226
 *   Frame 06  logo: masked temple image + title     resize/scale    @ 2412
 *
 * The whole Main Composition zooms to 1.5x over 0-4760ms on top of that.
 *
 * Data is separated from components so React Fast Refresh works.
 * All positions are in artboard coordinates (1920x1080).
 */

export const ARTBOARD = {
  width: 1920,
  height: 1080,
  durationMs: 5220,
  background: '#B7D5F2',
} as const

// ---------------------------------------------------------------------------
// Easings — RAW custom:path:v1 control points from the Jitter ops, fed
// directly to egaki's polybezier() (the ported Jitter curve engine), so the
// curves are exact by construction.
//
// LESSON LEARNED: do NOT hand-convert these to cubic-bezier with the
// "cubic-bezier(upper, 0, lower, 1)" shortcut. Numeric handles are FRACTIONS
// toward the neighbor anchor: a `lower: 0.8375` on the end point means
// x2 = 1 - 0.8375 = 0.1625, and object handles scale into the segment
// (lower {x:0.5375, y:0.125} -> (0.4625, 0.875)). polybezier() handles all
// of this exactly like Jitter.
//
// smooth:standard:v1 intensity 50 ops use EASE.smooth = bezier(0.5, 0, 0, 1).
// ---------------------------------------------------------------------------

import type { ControlPoint } from 'egaki/video'

export const EASING_PATHS: Record<string, ControlPoint[]> = {
  /** Main Composition zoom 1 -> 1.5 ~= bezier(0.9125, 0, 0.5, 1) */
  mainZoom: [
    { x: 0, y: 0, upper: 0.9125 },
    { x: 1, y: 1, lower: 0.5 },
  ],
  /** Frame 01 scale + Circle Pattern counter-scale ~= bezier(0.8, 0, 0.5, 1) */
  frame01Scale: [
    { x: 0, y: 0, upper: 0.8 },
    { x: 1, y: 1, lower: 0.5 },
  ],
  /** Circle resize 2200 -> 811 / pattern rotate ~= bezier(0.3875, 0, 0.1625, 1) */
  circleResize: [
    { x: 0, y: 0, upper: 0.3875 },
    { x: 1, y: 1, lower: 0.8375 },
  ],
  /** Line grid per-vector moves ~= bezier(0.7, 0, 0.4625, 0.875) */
  lineMove: [
    { x: 0, y: 0, upper: 0.7 },
    { x: 1, y: 1, lower: { x: 0.5375, y: 0.125 } },
  ],
  /** Frame 05 rectangle morphs ~= bezier(0.475, 0, 0.1125, 1) */
  shapeMorph: [
    { x: 0, y: 0, upper: 0.475 },
    { x: 1, y: 1, lower: 0.8875 },
  ],
  /** textIn per-letter easing ~= bezier(0.2625, 0.7125, 0.5, 1) */
  textIn: [
    { x: 0, y: 0, upper: { x: 0.2625, y: 0.7125 } },
    { x: 1, y: 1, lower: 0.5 },
  ],
}

// ---------------------------------------------------------------------------
// Frame 01 — Circle Pattern
// Six stroked circles (no fill, 9px inside stroke #faa6ff, cornerRadius 809)
// resize from 2200x2200 to 811x811 with fixed centers, inside a rotating,
// counter-scaling pattern group.
// ---------------------------------------------------------------------------

export const FRAME_01 = {
  background: '#141432',
  /** Frame 01 group scale */
  frameScale: { startMs: 0, endMs: 2498, from: 0, to: 1.5 },
  /** Outer Circle Pattern group (counter-scales 2 -> 1) */
  pattern: {
    x: -103.00048828125,
    y: -680.3204199226384,
    width: 2125.0005493164062,
    height: 2440.6423912087266,
    scale: { startMs: 0, endMs: 2490, from: 2, to: 1 },
    /** Inner pattern group rotates 0 -> 90 */
    rotate: { startMs: 0, endMs: 2500, from: 0, to: 90 },
  },
  /** Circle stroke */
  stroke: { color: '#faa6ff', width: 9 },
  /** Resize op shared by all six circles (anchor center) */
  circleResize: { startMs: 0, endMs: 2500, fromSize: 2200, toSize: 811 },
  /** Circle centers in pattern-group coordinates (x + w/2, y + h/2) */
  circleCenters: [
    { cx: 599.706, cy: 1220.816 },
    { cx: 831.276, cy: 819.725 },
    { cx: 1294.418, cy: 819.725 },
    { cx: 1525.988, cy: 1220.819 },
    { cx: 1294.42, cy: 1621.91 },
    { cx: 831.273, cy: 1621.914 },
  ],
} as const

// ---------------------------------------------------------------------------
// Frame 02 / Frame 04 — solid backgrounds scaling in from center
// ---------------------------------------------------------------------------

export const FRAME_02 = {
  color: '#f9ffde',
  scale: { startMs: 1062, endMs: 3560, from: 0, to: 1.5 },
} as const

export const FRAME_04 = {
  color: '#faa6ff',
  scale: { startMs: 1808, endMs: 4306, from: 0, to: 1.3 },
} as const

// ---------------------------------------------------------------------------
// Frame 03 — Line Pattern
// 12 vertical + 7 horizontal cream 5px lines (SVG strokes in Jitter, plain
// divs here) on a navy background. The Lines group counter-scales 3.5 -> 1
// while individual lines slide to scattered offsets.
// ---------------------------------------------------------------------------

export interface GridLine {
  /** Line rect in Lines-group coordinates (already includes stroke offset) */
  x: number
  y: number
  width: number
  height: number
  /** Move op target offset (from 0,0) */
  moveX: number
  moveY: number
}

export const FRAME_03 = {
  background: '#141432',
  lineColor: '#F9FFDE',
  frameScale: { startMs: 1340, endMs: 3838, from: 0, to: 1 },
  /** Lines group at (-2,-3), 1920x1086, counter-scale */
  lines: {
    x: -2,
    y: -3,
    width: 1920,
    height: 1086,
    scale: { startMs: 1338, endMs: 3838, from: 3.5, to: 1 },
  },
  /** Per-line move op timing */
  move: { startMs: 1840, endMs: 2980 },
} as const

/**
 * Vertical lines: svg box (x, 2, 6x1083), path at x=3 stroke 5
 * -> div at (x + 0.5, 2) sized 5x1082.5.
 * Horizontal lines: svg box (3, y, 1915x6), path at y=3 stroke 5
 * -> div at (3, y + 0.5) sized 1914x5.
 */
export const GRID_LINES: GridLine[] = [
  // vertical (Vector 1-12)
  { x: 0.5, y: 2, width: 5, height: 1082.5, moveX: 0, moveY: 0 },
  { x: 174.5, y: 2, width: 5, height: 1082.5, moveX: -140, moveY: 0 },
  { x: 348.5, y: 2, width: 5, height: 1082.5, moveX: -213, moveY: 0 },
  { x: 522.5, y: 2, width: 5, height: 1082.5, moveX: -237, moveY: 0 },
  { x: 696.5, y: 2, width: 5, height: 1082.5, moveX: -233, moveY: 0 },
  { x: 870.5, y: 2, width: 5, height: 1082.5, moveX: -186, moveY: 0 },
  { x: 1044.5, y: 2, width: 5, height: 1082.5, moveX: 40, moveY: 0 },
  { x: 1218.5, y: 2, width: 5, height: 1082.5, moveX: 232, moveY: 0 },
  { x: 1392.5, y: 2, width: 5, height: 1082.5, moveX: 244, moveY: 0 },
  { x: 1566.5, y: 2, width: 5, height: 1082.5, moveX: 217, moveY: 0 },
  { x: 1740.5, y: 2, width: 5, height: 1082.5, moveX: 143, moveY: 0 },
  { x: 1914.5, y: 2, width: 5, height: 1082.5, moveX: 0, moveY: 0 },
  // horizontal (Vector 13-19)
  { x: 3, y: 0.5, width: 1914, height: 5, moveX: 0, moveY: 0 },
  { x: 3, y: 194.5, width: 1914, height: 5, moveX: 0, moveY: -157 },
  { x: 3, y: 367.5, width: 1914, height: 5, moveX: 0, moveY: -225 },
  { x: 3, y: 540.5, width: 1914, height: 5, moveX: 0, moveY: 0 },
  { x: 3, y: 713.5, width: 1914, height: 5, moveX: 0, moveY: 237 },
  { x: 3, y: 886.5, width: 1914, height: 5, moveX: 0, moveY: 157 },
  { x: 3, y: 1080.5, width: 1914, height: 5, moveX: 0, moveY: 77 },
]

// ---------------------------------------------------------------------------
// Frame 05 — Square Shapes
// Four rectangles morph (scale / rotate / cornerRadius / move) inside a
// counter-scaling Shapes group on a navy background.
// ---------------------------------------------------------------------------

export interface ShapeRect {
  /** Base rect in Shapes-group coordinates */
  x: number
  y: number
  width: number
  height: number
  fill: string
  /** Static base rotation (deg) when no rotate op */
  baseAngle: number
  /** Animated values over the shared morph window (2480-3470ms) */
  scale: { from: number; to: number }
  rotate?: { from: number; to: number }
  cornerRadius: { from: number; to: number }
  move?: { fromX: number; toX: number }
}

export const FRAME_05 = {
  background: '#141432',
  frameScale: { startMs: 2226, endMs: 4724, from: 0, to: 1.3 },
  /** Shapes group at (-318.36, 0), 2556.64x1079.49, counter-scale 2 -> 1 */
  shapes: {
    x: -318.36087133478577,
    y: 0,
    width: 2556.6378395999163,
    height: 1079.4915324584726,
    scale: { startMs: 2228, endMs: 4728, from: 2, to: 1 },
  },
  morph: { startMs: 2480, endMs: 3470 },
} as const

export const SHAPE_RECTS: ShapeRect[] = [
  // Rectangle 15 — big blue diamond collapsing to small square
  {
    x: 898.3662109375, y: 158.08787751737304,
    width: 763.3157958984375, height: 763.3157958984375,
    fill: '#0d2ea4', baseAngle: 45,
    scale: { from: 1, to: 0.4 },
    rotate: { from: 135, to: 0 },
    cornerRadius: { from: 300, to: 0 },
  },
  // Rectangle 18 — navy rounded square on top of Rectangle 15
  {
    x: 1031.4999891377197, y: 292.5000196771542,
    width: 497.0000305175781, height: 495.9999694824219,
    fill: '#141432', baseAngle: 90,
    scale: { from: 1, to: 0.4 },
    rotate: { from: 90, to: 0 },
    cornerRadius: { from: 250, to: 100 },
  },
  // Rectangle 19 — right blue diamond growing in
  {
    x: 1928.2183138155146, y: 279.7608702388045,
    width: 521.9577026367188, height: 521.9576416015625,
    fill: '#0d2ea4', baseAngle: 45,
    scale: { from: 0.5, to: 1 },
    cornerRadius: { from: 300, to: 0 },
    move: { fromX: -300, toX: -318 },
  },
  // Rectangle 20 — left blue diamond growing in
  {
    x: 109.74007666341498, y: 279.7608702388045,
    width: 521.9577026367188, height: 521.9576416015625,
    fill: '#0d2ea4', baseAngle: 45,
    scale: { from: 0.5, to: 1 },
    cornerRadius: { from: 300, to: 0 },
    move: { fromX: 300, toX: 318 },
  },
]

// ---------------------------------------------------------------------------
// Frame 06 — Logo (masked temple image + title)
//
// A maskGrp whose mask is Rectangle 2 (1310x736 centered at 960,540),
// resizing from 0x0 while also scaling to 0.9766. Inside: the temple image
// (zooming 0.5 -> 1.076), a 10%-black overlay offset by (10,10), and a
// corner-labels frame. On top, the Title group scales 0.2 -> 1 with
// per-letter textIn animations.
// ---------------------------------------------------------------------------

export const FRAME_06 = {
  /** Mask rect (Rectangle 2): center fixed, resize 0 -> full + scale */
  mask: {
    centerX: 960, centerY: 540,
    width: 1310, height: 736,
    resize: { startMs: 2412, endMs: 4333 },
    scale: { startMs: 2412, endMs: 4333, from: 1, to: 0.976583717724052 },
  },
  /** Temple image (base rect in artboard coords) */
  image: {
    src: '/images/temple.jpg',
    x: 366, y: 206, width: 1188, height: 668,
    scale: { startMs: 2417, endMs: 4333, from: 0.5, to: 1.0763462765500058 },
  },
  /** Black overlay: resize 0 -> full (center 970,550), opacity 0 -> 0.1 */
  overlay: {
    centerX: 970, centerY: 550,
    width: 1310, height: 736,
    resize: { startMs: 2412, endMs: 4333 },
    opacity: { startMs: 3123, endMs: 4608, from: 0, to: 0.1 },
  },
  /** Corner labels frame at (361,208), 1194x722 */
  labels: {
    x: 361, y: 208, width: 1194, height: 722,
    fontSize: 14,
    fontFamily: '"Inter", sans-serif',
    color: '#ffffff',
    /** letterSpacing -2% of fontSize */
    letterSpacing: -0.28,
    jitter: { x: 0, y: 5.232042458566951, text: 'Jitter' },
    intro: { x: 540.827150773774, y: 5.232042458566951, width: 114.30525164113784, text: 'Intro Template' },
    www: { x: 540.827150773774, y: 648.8677704743158, width: 114.30525164113784, text: 'www.jitter.com' },
    dot: { x: 1191.2431406997607, y: 0, size: 8 },
  },
  /** Title group at (186,2), 1567x1074, scale 0.2 -> 1 */
  title: {
    x: 186, y: 2, width: 1567, height: 1074,
    scale: { startMs: 2482, endMs: 5026, from: 0.2, to: 1 },
  },
} as const

// ---------------------------------------------------------------------------
// Title texts — exact Jitter text layers (Title-group coordinates).
// lineHeight and letterSpacing are percentages of fontSize (Jitter style);
// CSS line-height % and computed px tracking reproduce them exactly.
// ---------------------------------------------------------------------------

export const BRAND_TEXT = {
  text: 'Brand Guideline      Version 0.1',
  x: -6, y: 459, width: 1579.126220703125, height: 128.0485382080078,
  fontSize: 76.17,
  fontFamily: '"Playfair Display", serif',
  lineHeightPercent: 110.41668,
  /** -5% of fontSize */
  letterSpacing: -3.8085,
  color: '#ffffff',
  /** textIn op */
  textIn: { startMs: 3098, nodeDurationMs: 161, offsetMs: 47, travelDistance: 50 },
} as const

export const PRESENTATION_TEXT = {
  text: 'Presentation Template',
  x: -6, y: 384, width: 1579, height: 346,
  fontSize: 75,
  fontFamily: '"Inter", sans-serif',
  lineHeightPercent: 509.68798,
  /** -6% of fontSize */
  letterSpacing: -4.5,
  color: '#ffffff',
  textIn: { startMs: 3433, nodeDurationMs: 256, offsetMs: 77, travelDistance: 50 },
} as const

/** Vector 20 — white dash between "Brand Guideline" and "Version 0.1" */
export const TITLE_DASH = {
  x: 833, y: 512, width: 84, height: 2,
  color: '#ffffff',
  /** show op — hidden before this */
  showMs: 3433,
} as const

/** Main Composition zoom (scale 1 -> 1.5 over almost the whole video) */
export const MAIN_ZOOM = { startMs: 0, endMs: 4760, from: 1, to: 1.5 } as const
