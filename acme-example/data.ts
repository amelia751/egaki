// Scene data for the "www.acme.com" Jitter website-promo recreation.
//
// Extracted from Jitter project NKzRvCExX2mIsKx8IgpQeVqE via Playwriter
// (window.app scene graph). A single 1920x1080 artboard, 4000ms, green
// background. A black frame and an image mask shrink in (resize, anchor
// center) while a B&W photo zooms out from 1.2x. "www.acme.com" slides in
// word-by-word behind per-word masks, slides out downward, then the image
// mask collapses toward its bottom-right corner and the black frame grows
// back to its starting size — a perfect loop point.
//
// Jitter op → easing mapping (all default intensity 50):
//   natural    → EASE.natural    bezier(0.8, 0, 0.2, 1)
//   slowDown   → EASE.decelerate bezier(0, 0, 0, 1)
//   accelerate → EASE.accelerate bezier(1, 0, 1, 1)
//   linear     → t => t
//
// Note: the project also contains move-out ops at 4110-5610ms, but the
// artboard duration is 4000ms so they never play (renderer confirms
// exportDuration: 4000). They are intentionally omitted here.

export const ARTBOARD = {
  width: 1920,
  height: 1080,
  durationMs: 4000,
  fillColor: '#506c53',
}

/** Black frame rect (Jitter node EidrJ2nd9opxcfjAcz_os). Center (960, 540). */
export const FRAME = {
  centerX: 960,
  centerY: 540,
  fillColor: '#000000',
  // resize in: 0-1400ms natural, anchor center
  fromW: 1200,
  fromH: 840,
  toW: 1000,
  toH: 640,
  resizeInStartMs: 0,
  resizeInEndMs: 1400,
  // resize out: 3200-3800ms natural, anchor center, back to 1200x840
  resizeOutStartMs: 3200,
  resizeOutEndMs: 3800,
  outW: 1200,
  outH: 840,
}

/** Image mask rect (Jitter node P0hVEmsl9DxlWIliPGRKO). Center (960, 540). */
export const MASK = {
  centerX: 960,
  centerY: 540,
  // resize in: 0-1400ms natural, anchor center
  fromW: 1200,
  fromH: 840,
  toW: 920,
  toH: 560,
  resizeInStartMs: 0,
  resizeInEndMs: 1400,
  // resize out: 3200-3800ms natural, anchor se — bottom-right corner of the
  // rest geometry (960 + 920/2, 540 + 560/2) = (1420, 820) stays fixed
  resizeOutStartMs: 3200,
  resizeOutEndMs: 3800,
  seCornerX: 1420,
  seCornerY: 820,
  // fadeIn on the parent maskGrp: 0-600ms linear
  fadeInStartMs: 0,
  fadeInEndMs: 600,
}

/** B&W photo (Jitter node 45:1504). Center (960, 540). */
export const PICTURE = {
  src: '/images/picture.png',
  centerX: 960,
  centerY: 540,
  // resize: 0-1400ms natural, anchor center, explicit from AND to values
  fromW: 1300,
  fromH: 940,
  toW: 1020,
  toH: 660,
  resizeStartMs: 0,
  resizeEndMs: 1400,
  // scale: 0-3800ms slowDown, 1.2 → 1.0, transform-origin center
  scaleStartMs: 0,
  scaleEndMs: 3800,
  scaleFrom: 1.2,
  scaleTo: 1,
}

/**
 * "www.acme.com" text (Jitter node 45:1526).
 * Layer box x=381 y=459 w=1167 h=160 → center (964.5, 539), textAlign center.
 * DM Sans 700, 160px, lineHeight 100%, letterSpacing -4px, white.
 * Jitter text content is "www. acme. com" — three words for the word split.
 */
export const TEXT = {
  words: ['www.', 'acme.', 'com'],
  centerX: 964.5,
  centerY: 539,
  fontSize: 160,
  // Jitter letterSpacing is Figma-style percent: -4% of 160px = -6.4px
  // (verified by measuring rendered text width: 1175px vs 1198px at -4px)
  letterSpacing: -6.4,
  color: '#ffffff',
  fontFamily: "'DM Sans', sans-serif",
  fontWeight: 700,
  // textIn: slideAndMask, split=words, up, forward order, slowDown per word.
  // travelDistance=100 in the Jitter data is a percentage of the word's em
  // box (1.3em ≈ 208px) — see MaskedWord in components.tsx.
  inStartMs: 500,
  inWordDurationMs: 600,
  inStaggerMs: 150,
  // textOut: slideAndMaskOut, split=words, down, forward order, accelerate
  outStartMs: 2800,
  outWordDurationMs: 800,
  outStaggerMs: 100,
}
