/**
 * Scene data for "Frame 168" — Jitter file NbnQviDo0kCroZCbnHZAKe1e.
 *
 * Horizontal 1920×1200 artboard, 3500ms. Browser mockup scales/moves in over a
 * Ken Burns background; "jitter.new" letter-reveals in the URL bar; at 1750ms the
 * scene swaps to an address-bar zoom group with the same text treatment.
 *
 * Extracted via window.app (PORTING-TO-REMOTION.md). Reference frames in
 * reference-frames/jitter-*.png from /api/renderer/.
 */

export const JITTER_FILE_ID = 'NbnQviDo0kCroZCbnHZAKe1e'

export const ARTBOARD = {
  width: 1920,
  height: 1200,
  durationMs: 3500,
  background: '#ffffff',
} as const

/** Key ms for screenshot comparison against Jitter renderer */
export const REFERENCE_TIMESTAMPS_MS = [0, 400, 900, 1250, 1750, 2200, 3000, 3499] as const

export const SWAP_MS = 1750