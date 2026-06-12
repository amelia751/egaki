/**
 * Scene data for the "Testimonial" Jitter recreation (16:10 horizontal artboard).
 *
 * Extracted from Jitter project NJD34P7zgZCeXpFAJ6dorIdf via Playwriter
 * (window.app scene graph). A cyan-framed photo zooms out while a frosted
 * glass card shrinks into place, quote text slides in word by word, a
 * portrait bubble reveals, and a heart "fills" with a circular mask.
 *
 * Data is separated from components so React Fast Refresh works.
 *
 * Operations timeline (ms):
 *   0-1490     bg image scale 1.5→1, card resize 1150x910→675x392 (smooth:50)
 *   500-...    quote textIn, words slide up masked (607ms/word, 61ms stagger)
 *   752-982    quote mark “ fades in (linear)
 *   1262-2062  portrait mask resize 0→72x72 (smooth:50)
 *   1262-1772  outline heart opacity 0→50% (linear)
 *   1490-...   author textIn, same word params
 *   1632-3572  card scale 1→1.1 (impulseAndOvershoot:96)
 *   1732-3672  heart group scale 0.8→1 (impulseAndOvershoot:71)
 *   2125-3210  filling-heart circular mask scale 0→1 (smooth:50)
 */

export const ARTBOARD = {
  width: 1920,
  height: 1200,
  durationMs: 5140,
  fillColor: '#00D0FF',
} as const

/** Full-bleed background image (z bottom). Scale 1.5→1 from its own center. */
export const BG_VISUAL = {
  x: -11,
  y: -602,
  width: 1943,
  height: 2315,
  src: '/images/visual.jpg',
} as const

/**
 * Frosted glass card. The mask rect and the white overlay rect share the
 * exact same geometry + animations. Center stays fixed while resizing.
 */
export const CARD = {
  centerX: 960.5, // 623 + 675/2
  centerY: 600, // 404 + 392/2
  fromWidth: 1150,
  fromHeight: 910,
  toWidth: 675,
  toHeight: 392,
  cornerRadius: 103,
  overlayColor: '#ffffff',
  overlayOpacity: 0.13,
  resize: { startMs: 0, endMs: 1490 },
  scaleUp: { startMs: 1632, endMs: 3572, from: 1, to: 1.1, intensity: 96 },
} as const

/** The blurred copy of the visual masked by the card rect ("Card blur"). */
export const CARD_BLUR_IMAGE = {
  x: 280, // 420 + (-140)
  y: -237, // -75 + (-162)
  width: 1275,
  height: 1519,
  /** Jitter blurRadius 109 ≈ CSS blur(54.5px) (radius ≈ 2x sigma) */
  blurPx: 54.5,
  src: '/images/visual.jpg',
} as const

export const FONT_FAMILY = 'HelveticaNowDisplay-Medium'

/** lineHeight 108.79% of 32px font */
export const BODY_LINE_HEIGHT = 32 * 1.0879171752929688

export const QUOTE_MARK = {
  x: 694,
  y: 482,
  width: 447,
  fontSize: 32,
  color: '#ffffff',
  text: '\u201C',
  fade: { startMs: 752, endMs: 982 },
} as const

export const QUOTE_TEXT = {
  x: 710,
  y: 481,
  width: 510,
  fontSize: 32,
  color: '#FFEFFB',
  text: "Mango's AI templates save us hours and make every campaign feel personalized. Highly recommend!\u201D",
  textIn: { startMs: 500, nodeDurationMs: 607, offsetMs: 61 },
} as const

export const AUTHOR_TEXT = {
  x: 803,
  y: 652,
  width: 206,
  fontSize: 32,
  color: '#ffffff80',
  text: 'John Doe, CEO of Acme',
  textIn: { startMs: 1490, nodeDurationMs: 607, offsetMs: 61 },
} as const

export const HEART_PATH =
  'M16.6832 31.5349C16.995 31.5349 17.4237 31.3377 17.7367 31.1469C27.132 25.0575 33.3666 18.048 33.3666 10.9136C33.3666 5.05425 29.3334 0.890625 24.0526 0.890625C20.8466 0.890625 18.1564 2.7026 16.6832 5.4958C15.2337 2.71442 12.5198 0.890625 9.31379 0.890625C4.03315 0.890625 0 5.05425 0 10.9136C0 18.048 6.23447 25.0575 15.6363 31.1469C15.9427 31.3377 16.3714 31.5349 16.6832 31.5349Z'

export const HEART = {
  x: 1165,
  y: 669,
  size: 41,
  svg: { x: 4, y: 7, width: 34, height: 32 },
  outlineColor: '#ffffff',
  fillColor: '#FFEFFB',
  groupScale: { startMs: 1732, endMs: 3672, from: 0.8, to: 1, intensity: 71 },
  outlineFade: { startMs: 1262, endMs: 1772, from: 0, to: 0.5 },
  maskScale: { startMs: 2125, endMs: 3210 },
} as const

export const PORTRAIT = {
  x: 709,
  y: 652,
  size: 72,
  outerRadius: 14,
  maskRadius: 15,
  img: { x: -15, y: -4, width: 93, height: 111 },
  src: '/images/portrait.jpg',
  maskResize: { startMs: 1262, endMs: 2062 },
} as const

/** Mango logo vectors, recolored #FFEFFB. Positions are local to the inner
 * "Group 1" which sits at (0, 8.7421875) inside the logo group at (52, 50). */
export const LOGO = {
  x: 52,
  y: 50,
  width: 201,
  height: 57,
  groupY: 8.7421875,
  vectors: [
    { src: '/svg/logo-2.svg', x: 170, y: 9, width: 29, height: 29 },
    { src: '/svg/logo-3.svg', x: 141, y: 9, width: 28, height: 40 },
    { src: '/svg/logo-4.svg', x: 113, y: 9, width: 26, height: 29 },
    { src: '/svg/logo-5.svg', x: 84, y: 9, width: 28, height: 29 },
    { src: '/svg/logo-6.svg', x: 41, y: 0, width: 42, height: 38 },
    { src: '/svg/logo-7.svg', x: 29, y: 0, width: 7, height: 7 },
    { src: '/svg/logo-8.svg', x: 12, y: 27, width: 9, height: 9 },
    { src: '/svg/logo-9.svg', x: 0, y: 14, width: 9, height: 9 },
    { src: '/svg/logo-10.svg', x: 12, y: 2, width: 9, height: 9 },
    { src: '/svg/logo-11.svg', x: 4, y: 6, width: 25, height: 26 },
    { src: '/svg/logo-12.svg', x: 25, y: 14, width: 9, height: 9 },
  ],
} as const

export const URL_TEXT = {
  x: 1592,
  y: 52,
  width: 262,
  fontSize: 27,
  lineHeight: 27 * 0.96,
  color: '#FFEFFB',
  text: 'buildmango.co',
} as const
