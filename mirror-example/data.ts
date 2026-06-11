/**
 * Scene data for the "Mirror: Social Media Showcase" recreation.
 *
 * Extracted from a Jitter project via Playwriter. The animation is a
 * vertical 1080x1350 artboard with mirrored image galleries that fan out
 * from center, framed by thin white bars and serif typography.
 *
 * Data is separated from components so React Fast Refresh works.
 *
 * All positions are in the Jitter artboard coordinate system (1080x1350).
 * The component scales this to fit the Remotion composition (1920x1080).
 */

// ---------------------------------------------------------------------------
// Image asset paths (downloaded from Jitter's CloudFront CDN)
//
// Right and left groups share most images except Visual 02 which differs.
// Images are numbered by their download order; the mapping below assigns
// them to the correct visual slot in each group.
// ---------------------------------------------------------------------------

/** Right group images (Visual 01-10) */
export const RIGHT_IMAGES = [
  '/images/visual-01.png',
  '/images/visual-02.jpg', // s_0llRVy4zvj634NAlRYH.jpg
  '/images/visual-03.png',
  '/images/visual-04.png',
  '/images/visual-05.jpg',
  '/images/visual-06.jpg',
  '/images/visual-07.jpg',
  '/images/visual-08.jpg',
  '/images/visual-09.jpg',
  '/images/visual-10.jpeg',
] as const

/** Left group images — same as right except Visual 02 */
export const LEFT_IMAGES = [
  '/images/visual-01.png',
  '/images/visual-11.jpg', // mHDcxIXmjGVQDhekqT0sA.jpg (different from right)
  '/images/visual-03.png',
  '/images/visual-04.png',
  '/images/visual-05.jpg',
  '/images/visual-06.jpg',
  '/images/visual-07.jpg',
  '/images/visual-08.jpg',
  '/images/visual-09.jpg',
  '/images/visual-10.jpeg',
] as const

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VisualCard {
  /** X position within the group's local coordinate system */
  x: number
  /** Mask dimensions (visible clip area for the image) */
  maskWidth: number
  maskHeight: number
  /** Image dimensions (slightly larger than mask, covers the clip) */
  imgWidth: number
  imgHeight: number
  /** Image offset within the mask group */
  imgX: number
  imgY: number
  /** Per-card initial scale factor (set at t=0) */
  initialScale: number
  /** When this card becomes visible (ms) */
  showMs: number
  /** When this card becomes invisible (ms) */
  hideMs: number
  /** Mask resize animation start (ms) — resizes from 0x0 to full */
  resizeStartMs: number
  /** Mask resize animation end (ms) */
  resizeEndMs: number
}

// ---------------------------------------------------------------------------
// Layout constants
//
// Artboard is 1080x1350 in Jitter. All positions and sizes use this space.
// The component scales the whole thing to fit 1920x1080.
// ---------------------------------------------------------------------------

export const ARTBOARD = {
  width: 1080,
  height: 1350,
  duration: 4000,
  background: '#000000',
} as const

// ---------------------------------------------------------------------------
// Frame group — thin bars, ticks, and bottom URL text
//
// Positioned at (120, 100) relative to artboard, sized 840x1150.
// ---------------------------------------------------------------------------

export const FRAME = {
  x: 120,
  y: 100,
  width: 840,
  height: 1150,
  /** Top center tick mark */
  tickTop: { x: 419, y: 0, width: 3, height: 16, color: '#d9d9d9' },
  /** Bottom center tick mark */
  tickBottom: { x: 419, y: 1134, width: 3, height: 16, color: '#d9d9d9' },
  /** Left vertical bar */
  leftBar: { x: 0, y: 0, width: 1, height: 1150, color: '#ffffff' },
  /** Right vertical bar */
  rightBar: { x: 840, y: 0, width: 1, height: 1150, color: '#ffffff' },
  /** Bottom URL text */
  urlText: {
    text: 'www.website.com',
    x: 330,
    y: 1068,
    width: 181,
    height: 27,
    fontSize: 20,
    fontFamily: '"Roboto Mono", monospace',
    color: '#e3e3e3',
  },
} as const

// ---------------------------------------------------------------------------
// Text layers — "Social template" and "Live on Jitter"
// ---------------------------------------------------------------------------

export const SOCIAL_TEXT = {
  text: 'Social template',
  x: 198,
  y: 615,
  width: 685,
  height: 120,
  fontSize: 100,
  fontFamily: '"Lora", serif',
  color: '#E3E3E3',
} as const

export const LIVE_TEXT = {
  text: 'Live on Jitter',
  x: 252,
  y: 615,
  width: 577,
  height: 120,
  fontSize: 100,
  fontFamily: '"Lora", serif',
  color: '#E3E3E3',
} as const

// ---------------------------------------------------------------------------
// Visual groups — left and right mirrored galleries
//
// Each group contains 10 masked image cards. Cards are positioned in a
// horizontal row at increasing X offsets. Per-card scale factors (0.5 to 8)
// create a perspective-like depth effect when combined with the parent
// group's scale animation (2 → 0.5 → 0.3).
// ---------------------------------------------------------------------------

export const VISUAL_RIGHT = {
  x: 497,
  y: 513,
  width: 666,
  height: 324,
} as const

export const VISUAL_LEFT = {
  x: -84,
  y: 513,
  width: 666,
  height: 324,
} as const

/**
 * Card X positions, per-card scales, and timing for each of the 10 visuals.
 * Both left and right groups share identical layout; only the image differs.
 *
 * Mask resize targets the inner rect (258x324). The resize animates from
 * 0x0 to full size with smooth:standard:v1 intensity 50 easing.
 *
 * Right-group IDs for reference:
 *   0JLyRQPa, viz3t-rl, Lx7WFP8R, R1G6g7bm, 4pe-e-Aq,
 *   Ltb-qEOc, gVTPfw9z, NsFeSVIH, Zmw5gF3B, _Xz55Baf
 * Left-group IDs:
 *   hFj1c0Zy, QwjTaLkh, syh902kD, l9k4K2ak, ROjYyrtI,
 *   fjIvdiMA, ZSRYoBsY, 2FBxP4vZ, o6eP2dkz, 4NSD5yNt
 */
export const VISUAL_CARDS: VisualCard[] = [
  {
    x: 121, maskWidth: 258, maskHeight: 324, imgWidth: 277, imgHeight: 345, imgX: 1, imgY: 4,
    initialScale: 0.5, showMs: 996, hideMs: 2397, resizeStartMs: 599, resizeEndMs: 1599,
  },
  {
    x: 187, maskWidth: 258, maskHeight: 324, imgWidth: 277, imgHeight: 345, imgX: 1, imgY: 4,
    initialScale: 0.8, showMs: 1354, hideMs: 2507, resizeStartMs: 951, resizeEndMs: 1951,
  },
  {
    x: 283, maskWidth: 258, maskHeight: 324, imgWidth: 255, imgHeight: 319, imgX: 12, imgY: 17,
    initialScale: 1.2, showMs: 1648, hideMs: 2607, resizeStartMs: 1254, resizeEndMs: 2254,
  },
  {
    x: 448, maskWidth: 258, maskHeight: 324, imgWidth: 293, imgHeight: 363, imgX: -7, imgY: -2,
    initialScale: 2, showMs: 1850, hideMs: 2687, resizeStartMs: 1454, resizeEndMs: 2454,
  },
  {
    x: 647, maskWidth: 258, maskHeight: 324, imgWidth: 283, imgHeight: 353, imgX: -2, imgY: -1,
    initialScale: 3, showMs: 1970, hideMs: 2757, resizeStartMs: 1568, resizeEndMs: 2568,
  },
  {
    x: 857, maskWidth: 258, maskHeight: 324, imgWidth: 273, imgHeight: 339, imgX: 3, imgY: 3,
    initialScale: 4, showMs: 2062, hideMs: 2817, resizeStartMs: 1658, resizeEndMs: 2658,
  },
  {
    x: 1072, maskWidth: 258, maskHeight: 324, imgWidth: 277, imgHeight: 345, imgX: 1, imgY: 4,
    initialScale: 5, showMs: 2127, hideMs: 2867, resizeStartMs: 1728, resizeEndMs: 2728,
  },
  {
    x: 1298, maskWidth: 258, maskHeight: 324, imgWidth: 277, imgHeight: 345, imgX: 1, imgY: 4,
    initialScale: 6, showMs: 2187, hideMs: 2907, resizeStartMs: 1788, resizeEndMs: 2788,
  },
  {
    x: 1555, maskWidth: 258, maskHeight: 324, imgWidth: 277, imgHeight: 345, imgX: 1, imgY: 4,
    initialScale: 7, showMs: 2237, hideMs: 2937, resizeStartMs: 1838, resizeEndMs: 2838,
  },
  {
    x: 1881, maskWidth: 258, maskHeight: 324, imgWidth: 277, imgHeight: 345, imgX: 1, imgY: 4,
    initialScale: 8, showMs: 2277, hideMs: 2957, resizeStartMs: 1880, resizeEndMs: 2890,
  },
]

// ---------------------------------------------------------------------------
// Animation timing constants (milliseconds)
// ---------------------------------------------------------------------------

export const ANIM = {
  /** Frame bars spread apart */
  barSpread: { startMs: 0, endMs: 2237, distance: 420 },
  /** Frame bars hidden window */
  barHideMs: 996,
  barShowMs: 2877,
  /** Frame bars return to original position */
  barReturn: { startMs: 2602, endMs: 3402, distance: 420 },

  /** "Social template" scale down (1 → 0.15) */
  socialScale: { startMs: 200, endMs: 1598, from: 1, to: 0.15 },
  /** "Social template" opacity fade (100 → 0) */
  socialOpacity: { startMs: 600, endMs: 1598, from: 1, to: 0 },

  /** Visual groups scale phase 1 (2 → 0.5) + move ±200px */
  groupPhase1: { startMs: 864, endMs: 2490, scaleFrom: 2, scaleTo: 0.5, moveX: 200 },
  /** Visual groups scale phase 2 (handoff → 0.3) */
  groupPhase2: { startMs: 2052, endMs: 3362, scaleTo: 0.3 },

  /** "Live on Jitter" scale (1.5 → 1) */
  liveScale: { startMs: 2197, endMs: 3697, from: 1.5, to: 1 },
  /** "Live on Jitter" textIn (per-letter stagger) */
  liveTextIn: { startMs: 2503, letterDurationMs: 198, offsetMs: 60, travelY: 50 },

  /** "www.website.com" textIn */
  wwwTextIn: { startMs: 2600, letterDurationMs: 254, offsetMs: 35, travelY: 50 },
  /** "www.website.com" slide from X+100 to 0 */
  wwwMove: { startMs: 2600, endMs: 3400, fromX: 100 },
} as const

// ---------------------------------------------------------------------------
// Easing definitions — cubic-bezier values extracted from Jitter
//
// For custom:path:v1, the control points map to:
//   cubic-bezier(upper, 0, lower, 1)
// unless upper/lower are objects with {x, y} overrides.
//
// For smooth:standard:v1, the pattern is:
//   cubic-bezier(snapped_value, 0, 0, 1)
// where values at intensity 0/25/50/75/100 = 0.3/0.4/0.5/0.7/0.9
// ---------------------------------------------------------------------------

export const EASINGS = {
  /** smooth:standard:v1 intensity 50 — mask resize, general */
  smooth50: [0.5, 0, 0, 1] as const,
  /** smooth:standard:v1 intensity 100 (90 rounds to 100) — bar spread */
  smooth100: [0.9, 0, 0, 1] as const,
  /** Rescaling visuals initial scale — custom:path */
  rescale: [0.5375, 0, 0.65, 1] as const,
  /** "Social template" scale down */
  socialScale: [1, 0, 0.6, 1] as const,
  /** "Social template" opacity fade */
  socialOpacity: [1, 0, 0, 1] as const,
  /** Visual group scale+move phase 1 */
  groupPhase1: [0.7875, 0, 0.625, 1] as const,
  /** Visual group scale phase 2 */
  groupPhase2: [0.8875, 0, 0.5, 1] as const,
  /** "Live on Jitter" scale */
  liveScale: [0.6875, 0.0625, 0.7375, 1] as const,
  /** "Live on Jitter" textIn stagger easing */
  liveTextIn: [0.75, 0, 0.4, 1] as const,
  /** "www.website.com" textIn stagger easing */
  wwwTextIn: [0.6, 0, 0.5, 1] as const,
  /** "www.website.com" per-letter easing */
  wwwLetterEasing: [0.5875, 0, 0.7875, 1] as const,
  /** Bar return + www move easing */
  barReturn: [0.6, 0, 0.8, 1] as const,
} as const
