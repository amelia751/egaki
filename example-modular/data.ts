/**
 * Scene data for the "MODULAR 1-03" bento showreel recreation.
 *
 * Extracted from a Jitter project via Playwriter. The animation is a bento
 * grid of SVG cards arranged in 5 off-screen "screens" around a central
 * 1076x1076 viewport. Cards scatter in 3 phases with staggered timing.
 *
 * Data is separated from components so React Fast Refresh works.
 *
 * All card positions are in the bento's local coordinate system (1076x1076).
 * The component scales this to fill the Remotion composition (1920x1080).
 */

// ---------------------------------------------------------------------------
// SVG asset paths (downloaded from Jitter's CloudFront CDN)
// ---------------------------------------------------------------------------

const SVG = {
  bigSquare: '/svg/big-square.svg',
  bigSquare3: '/svg/big-square-3.svg',
  bigSquareAlt: '/svg/big-square-alt.svg',
  smallSquare: '/svg/small-square.svg',
  vertical: '/svg/vertical.svg',
  wide: '/svg/wide.svg',
} as const

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Card {
  id: string
  name: string
  src: string
  x: number
  y: number
  width: number
  height: number
}

export interface Screen {
  name: string
  x: number
  y: number
  cards: Card[]
}

export interface MoveAnim {
  cardId: string
  startMs: number
  endMs: number
  moveX?: number
  moveY?: number
}

// ---------------------------------------------------------------------------
// Layout constants
//
// The bento clip is 1076x1076 in Jitter's coordinate system. All card
// positions and animation offsets use this space. The component scales the
// whole thing to fit 1920x1080 with padding.
// ---------------------------------------------------------------------------

export const ARTBOARD = {
  background: '#e0e1e4',
} as const

export const BENTO = {
  /** Clip viewport size in local coordinates */
  clipSize: 1076,
  clipRadius: 50,
} as const

// ---------------------------------------------------------------------------
// Screen layouts — 5 screens positioned around the central viewport
// ---------------------------------------------------------------------------

export const SCREENS: Screen[] = [
  {
    name: 'SCREEN 1',
    x: 0,
    y: 0,
    cards: [
      { id: 'bs1-1', name: 'BIG-SQUARE-1', src: SVG.bigSquare, x: 30, y: 30, width: 495, height: 495 },
      { id: 'bs1-2', name: 'BIG-SQUARE-2', src: SVG.bigSquare, x: 30, y: 555, width: 495, height: 495 },
      { id: 'bs1-3', name: 'BIG-SQUARE-3', src: SVG.bigSquare3, x: 555, y: 555, width: 495, height: 495 },
      { id: 'v1', name: 'VERTICAL-1', src: SVG.vertical, x: 555, y: 30, width: 232, height: 495 },
      { id: 'ss1-1', name: 'SMALL-SQUARE-1', src: SVG.smallSquare, x: 817.5, y: 30, width: 232, height: 232 },
      { id: 'ss1-2', name: 'SMALL-SQUARE-2', src: SVG.smallSquare, x: 817.5, y: 293, width: 232, height: 232 },
    ],
  },
  {
    name: 'SCREEN 2 (TOP)',
    x: 0,
    y: -1050,
    cards: [
      { id: 's2-bs1', name: 'BIG-SQUARE-1', src: SVG.bigSquare, x: 555, y: 30, width: 495, height: 495 },
      { id: 's2-bs2', name: 'BIG-SQUARE-2', src: SVG.bigSquare, x: 555, y: 555, width: 495, height: 495 },
    ],
  },
  {
    name: 'SCREEN 3 (BOTTOM)',
    x: 0,
    y: 1080,
    cards: [
      { id: 's3-bs1', name: 'BIG-SQUARE-1', src: SVG.bigSquareAlt, x: 30, y: 30, width: 495, height: 495 },
      { id: 's3-w1', name: 'WIDE-1', src: SVG.wide, x: 30, y: 555, width: 495, height: 232.5 },
      { id: 's3-w2', name: 'WIDE-2', src: SVG.wide, x: 30, y: 817.5, width: 495, height: 232.5 },
    ],
  },
  {
    name: 'SCREEN 4 (LEFT)',
    x: -1050,
    y: 0,
    cards: [
      { id: 's4-bs1', name: 'BIG-SQUARE-1', src: SVG.bigSquare, x: 555, y: 30, width: 495, height: 495 },
      { id: 's4-w1', name: 'WIDE-1', src: SVG.wide, x: 30, y: 30, width: 495, height: 232.5 },
      { id: 's4-w2', name: 'WIDE-2', src: SVG.wide, x: 30, y: 292.5, width: 495, height: 232.5 },
    ],
  },
  {
    name: 'SCREEN 5 (RIGHT)',
    x: 1049.5,
    y: 0,
    cards: [
      { id: 's5-bs1', name: 'BIG-SQUARE-1', src: SVG.bigSquare, x: 30, y: 555, width: 495, height: 495 },
      { id: 's5-ss1', name: 'SMALL-SQUARE-1', src: SVG.smallSquare, x: 555, y: 555, width: 232, height: 232 },
      { id: 's5-ss2', name: 'SMALL-SQUARE-2', src: SVG.smallSquare, x: 817.5, y: 555, width: 232, height: 232 },
      { id: 's5-ss3', name: 'SMALL-SQUARE-3', src: SVG.smallSquare, x: 555, y: 818, width: 232, height: 232 },
      { id: 's5-ss4', name: 'SMALL-SQUARE-4', src: SVG.smallSquare, x: 817.5, y: 818, width: 232, height: 232 },
    ],
  },
]

// ---------------------------------------------------------------------------
// Animation phases
//
// Each MoveAnim targets a card by ID with a timed offset. Offsets are
// additive: a card that moves up in Phase 1 and left in Phase 2 accumulates
// both offsets. Stagger is 50ms between each card in a group.
//
// Easing: Jitter's "smooth:standard:v1" at intensity 50 =
// cubic-bezier(0.5, 0, 0, 1). Extracted from Jitter's webpack bundle.
// ---------------------------------------------------------------------------

/** Phase 1 (500-2700ms): Vertical scatter — cards split up and down */
export const PHASE_1: MoveAnim[] = [
  // Screen 1 cards moving UP
  { cardId: 'bs1-1', startMs: 500, endMs: 2700, moveY: -1050 },
  { cardId: 'bs1-2', startMs: 550, endMs: 2700, moveY: -1050 },
  // Screen 3 cards moving UP (these are below, moving into view)
  { cardId: 's3-bs1', startMs: 600, endMs: 2700, moveY: -1080 },
  { cardId: 's3-w1', startMs: 650, endMs: 2700, moveY: -1080 },
  { cardId: 's3-w2', startMs: 700, endMs: 2700, moveY: -1080 },

  // Screen 1 cards moving DOWN
  { cardId: 'bs1-3', startMs: 500, endMs: 2700, moveY: 1050 },
  { cardId: 'v1', startMs: 550, endMs: 2700, moveY: 1050 },
  { cardId: 'ss1-2', startMs: 600, endMs: 2700, moveY: 1050 },
  { cardId: 'ss1-1', startMs: 650, endMs: 2700, moveY: 1050 },
  // Screen 2 cards moving DOWN (these are above, moving into view)
  { cardId: 's2-bs2', startMs: 700, endMs: 2700, moveY: 1050 },
  { cardId: 's2-bs1', startMs: 750, endMs: 2700, moveY: 1050 },
]

/** Phase 2 (3200-5550ms): Horizontal scatter — cards split left and right */
export const PHASE_2: MoveAnim[] = [
  // Cards moving LEFT
  { cardId: 's3-w1', startMs: 3200, endMs: 5550, moveX: -1050 },
  { cardId: 's3-w2', startMs: 3250, endMs: 5550, moveX: -1050 },
  { cardId: 's2-bs2', startMs: 3300, endMs: 5550, moveX: -1050 },
  { cardId: 's5-bs1', startMs: 3350, endMs: 5550, moveX: -1050 },
  { cardId: 's5-ss1', startMs: 3400, endMs: 5550, moveX: -1050 },
  { cardId: 's5-ss3', startMs: 3450, endMs: 5550, moveX: -1050 },
  { cardId: 's5-ss2', startMs: 3500, endMs: 5550, moveX: -1050 },
  { cardId: 's5-ss4', startMs: 3550, endMs: 5550, moveX: -1050 },

  // Cards moving RIGHT
  { cardId: 's2-bs1', startMs: 3200, endMs: 5550, moveX: 1050 },
  { cardId: 's3-bs1', startMs: 3250, endMs: 5550, moveX: 1050 },
  { cardId: 's4-bs1', startMs: 3300, endMs: 5550, moveX: 1050 },
  { cardId: 's4-w1', startMs: 3350, endMs: 5550, moveX: 1050 },
  { cardId: 's4-w2', startMs: 3400, endMs: 5550, moveX: 1050 },
]

/** Phase 3 (6050-8450ms): Final vertical scatter — remaining cards exit */
export const PHASE_3: MoveAnim[] = [
  // Cards moving UP
  { cardId: 's4-bs1', startMs: 6050, endMs: 8450, moveY: -1050 },
  { cardId: 's5-ss1', startMs: 6100, endMs: 8450, moveY: -1050 },
  { cardId: 's5-ss2', startMs: 6150, endMs: 8450, moveY: -1050 },
  { cardId: 's5-ss3', startMs: 6200, endMs: 8450, moveY: -1050 },
  { cardId: 's5-ss4', startMs: 6249, endMs: 8449, moveY: -1050 },
  { cardId: 'v1', startMs: 6300, endMs: 8450, moveY: -1050 },
  { cardId: 'ss1-1', startMs: 6350, endMs: 8450, moveY: -1050 },
  { cardId: 'ss1-2', startMs: 6400, endMs: 8450, moveY: -1050 },
  { cardId: 'bs1-3', startMs: 6450, endMs: 8450, moveY: -1050 },

  // Cards moving DOWN
  { cardId: 's5-bs1', startMs: 6050, endMs: 8260, moveY: 1050 },
  { cardId: 's4-w2', startMs: 6100, endMs: 8260, moveY: 1050 },
  { cardId: 's4-w1', startMs: 6150, endMs: 8260, moveY: 1050 },
  { cardId: 'bs1-2', startMs: 6200, endMs: 8260, moveY: 1050 },
  { cardId: 'bs1-1', startMs: 6260, endMs: 8260, moveY: 1050 },
]

/** All animations concatenated for easy lookup */
export const ALL_ANIMATIONS: MoveAnim[] = [...PHASE_1, ...PHASE_2, ...PHASE_3]

// ---------------------------------------------------------------------------
// Overlay text elements at the bottom of the artboard
// ---------------------------------------------------------------------------

export const OVERLAY_TEXTS = [
  { text: 'Modular', x: 131.67, width: 1318, align: 'center' as const },
  { text: '1-03 (LITE)', x: 817.67, width: 632, align: 'center' as const },
  { text: 'RICO.SUPPLY', x: 1254.67, width: 305, align: 'right' as const },
] as const
