/**
 * Server-safe MDX parsing utilities for the video framework.
 *
 * This module contains ONLY parsing logic (frontmatter, section splitting,
 * duration calculation). It does NOT import remotion or any client-only
 * modules, so it can safely run in the RSC server environment.
 *
 * The rendering counterpart is mdx-video.tsx which re-exports these
 * functions alongside the Remotion components.
 */

import YAML from 'yaml'

// Inline mdast types to avoid requiring @types/mdast as a dependency
type RootContent = any
type Root = { type: 'root'; children: RootContent[] }

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_FPS = 30
const DEFAULT_BPM = 120
const DEFAULT_SECTION_BEATS = 10

// ---------------------------------------------------------------------------
// Frontmatter parsing
// ---------------------------------------------------------------------------

const DEFAULT_WIDTH = 1920
const DEFAULT_HEIGHT = 1080

export interface VideoFrontmatter {
  fps: number
  bpm: number
  width: number
  height: number
  /** Pixel density / scale multiplier for rendering. Default 1.
   *  Setting scale=2 renders at 2x resolution (e.g. 3840×2160 for a 1920×1080 comp). */
  scale: number
}

/** Scope variables injected into MDX expressions via safe-mdx's `scope` prop.
 *  Both server (app.tsx) and client (mdx-client.tsx) must pass the same shape. */
export interface MdxScope {
  FPS: number
  BEAT: number
}

/** Build the MDX scope from frontmatter values. */
export function buildMdxScope(fps: number, bpm: number): MdxScope {
  return { FPS: fps, BEAT: fps / (bpm / 60) }
}

/** Parse YAML frontmatter from mdast. Extracts fps, bpm, width, height, scale. */
export function parseFrontmatter(mdast: Root): VideoFrontmatter {
  const result: VideoFrontmatter = {
    fps: DEFAULT_FPS,
    bpm: DEFAULT_BPM,
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    scale: 1,
  }
  for (const node of mdast.children) {
    if (node.type !== 'yaml') continue
    const text = (node as any).value as string
    if (!text) continue
    const parsed = YAML.parse(text)
    if (parsed && typeof parsed === 'object') {
      if (typeof parsed.fps === 'number' && parsed.fps > 0) result.fps = parsed.fps
      if (typeof parsed.bpm === 'number' && parsed.bpm > 0) result.bpm = parsed.bpm
      if (typeof parsed.width === 'number') {
        const w = Math.round(parsed.width)
        if (w > 0) result.width = w
      }
      if (typeof parsed.height === 'number') {
        const h = Math.round(parsed.height)
        if (h > 0) result.height = h
      }
      if (typeof parsed.scale === 'number' && parsed.scale > 0) result.scale = parsed.scale
    }
  }
  return result
}

// ---------------------------------------------------------------------------
// Aspect ratio from composition dimensions
// ---------------------------------------------------------------------------

const STANDARD_RATIOS: [number, number][] = [
  [1, 1], [3, 4], [4, 3], [9, 16], [16, 9],
  [2, 3], [3, 2], [4, 5], [5, 4], [9, 21], [21, 9],
]

function gcd(a: number, b: number): number {
  while (b) { [a, b] = [b, a % b] }
  return a
}

function parseRatio(s: string): [number, number] | undefined {
  const [a, b] = s.split(':').map(Number)
  if (a && b && a > 0 && b > 0) return [a, b]
}

/** Compute the closest aspect ratio string from pixel dimensions.
 *  When `allowedRatios` is provided (e.g. from a model's supported list),
 *  picks the best match from that list. Otherwise uses STANDARD_RATIOS.
 *  Reduces to the exact ratio first (e.g. 1920×1080 → 16:9). If the exact
 *  ratio doesn't match, picks the closest by comparing decimal values.
 *  Returns '16:9' for invalid inputs. */
export function aspectRatioFromDimensions(width: number, height: number, allowedRatios?: string[]): string {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return '16:9'
  }
  const candidates: [number, number][] = allowedRatios?.length
    ? allowedRatios.map(parseRatio).filter((r): r is [number, number] => r !== undefined)
    : STANDARD_RATIOS
  if (candidates.length === 0) return '16:9'

  const d = gcd(width, height)
  const rw = width / d
  const rh = height / d
  // Check exact match first
  if (candidates.some(([w, h]) => w === rw && h === rh)) {
    return `${rw}:${rh}`
  }
  // Find closest by decimal value
  const target = width / height
  let best = candidates[0]!
  let bestDiff = Infinity
  for (const ratio of candidates) {
    const diff = Math.abs(ratio[0] / ratio[1] - target)
    if (diff < bestDiff) {
      bestDiff = diff
      best = ratio
    }
  }
  return `${best[0]}:${best[1]}`
}

// ---------------------------------------------------------------------------
// Duration parsing from heading text
// ---------------------------------------------------------------------------

const HEADING_PROP_RE = /\s+(duration)=(\d+(?:\.\d+)?)(s|fps|frames?|f|beats?)?/gi

interface ParsedHeading {
  label: string
  durationInFrames: number | null
}

function parseHeadingProps(
  rawText: string,
  fps: number,
  bpm: number,
): ParsedHeading {
  let label = rawText
  let durationInFrames: number | null = null
  const framesPerBeat = fps / (bpm / 60)

  // Strip all key=value props from the heading text
  label = label.replace(HEADING_PROP_RE, (_match, key, value, unit) => {
    const v = Number(value)
    const u = (unit || '').toLowerCase()
    let frames: number
    if (u === 's') {
      frames = Math.round(v * fps)
    } else if (u === 'beat' || u === 'beats') {
      frames = Math.round(v * framesPerBeat)
    } else {
      // bare number, fps, f, frame, frames — all mean raw frames
      frames = Math.round(v)
    }

    if (key.toLowerCase() === 'duration') {
      durationInFrames = frames
    }
    return ''
  }).trim()

  return { label: label || 'Untitled', durationInFrames }
}

// ---------------------------------------------------------------------------
// Section splitting
// ---------------------------------------------------------------------------

export interface MdxSection {
  heading: string | null
  nodes: RootContent[]
  /** Duration in frames. `null` means "auto-infer from media content". */
  durationInFrames: number | null
}

export interface SplitResult {
  sections: MdxSection[]
  frontmatter: VideoFrontmatter
  /** ESM import nodes from the document, needed by SafeMdxRenderer to resolve modules */
  imports: RootContent[]
  /** Content nodes before the first heading. Rendered at composition level,
   *  outside the Series, spanning the full video duration. Use for soundtracks,
   *  ambient background videos, or any component that should persist across
   *  all sections. */
  preamble: RootContent[]
}

function extractHeadingText(node: RootContent): string {
  if (node.type !== 'heading') return ''
  const parts: string[] = []
  for (const child of (node as any).children || []) {
    if (child.type === 'text') parts.push(child.value)
  }
  return parts.join('') || 'Untitled'
}

export function splitIntoSections(mdast: Root): SplitResult {
  const frontmatter = parseFrontmatter(mdast)
  const { fps, bpm } = frontmatter
  const framesPerBeat = fps / (bpm / 60)
  const defaultDuration = Math.round(DEFAULT_SECTION_BEATS * framesPerBeat)

  const sections: MdxSection[] = []
  const imports: RootContent[] = []
  const preamble: RootContent[] = []
  let current: MdxSection | null = null
  let beforeFirstHeading = true

  for (const node of mdast.children) {
    if (node.type === 'yaml' || node.type === 'toml') {
      continue
    }
    if (node.type === 'mdxjsEsm') {
      imports.push(node)
      continue
    }

    if (node.type === 'heading') {
      beforeFirstHeading = false
      const rawText = extractHeadingText(node)
      const parsed = parseHeadingProps(rawText, fps, bpm)
      current = {
        heading: parsed.label,
        nodes: [],
        durationInFrames: parsed.durationInFrames ?? null,
      }
      sections.push(current)
      continue
    }

    // Content before the first heading goes into the preamble, which is
    // rendered at composition level (outside Series) so it spans the
    // full video duration.
    if (beforeFirstHeading) {
      preamble.push(node)
    } else if (current) {
      current.nodes.push(node)
    }
  }

  return { sections, frontmatter, imports, preamble }
}

/** Calculate total composition duration.
 *  All sections must have resolved (non-null) durations. */
export function calculateTotalDuration(sections: { durationInFrames: number }[]): number {
  let total = 0
  for (const s of sections) {
    total += s.durationInFrames
  }
  return total
}

// ---------------------------------------------------------------------------
// Auto-duration resolution
// ---------------------------------------------------------------------------

/** MdxSection with a guaranteed non-null durationInFrames. */
export type ResolvedMdxSection = MdxSection & { durationInFrames: number }

/**
 * Resolve null (auto) durations using per-section media durations.
 *
 * `sectionDurations` is keyed by section index (as string) → max media
 * duration in seconds. Audio/Video components populate this at runtime
 * via the media duration store after fetching metadata with mediabunny.
 *
 * For each section with `durationInFrames === null`:
 *   1. Look up the section's index in `sectionDurations`.
 *   2. If found, set duration = Math.round(seconds * fps).
 *   3. Otherwise fall back to DEFAULT_SECTION_BEATS * framesPerBeat.
 *
 * Sections with explicit durations are returned unchanged.
 * Generic so extra fields (like `jsx`) are preserved in the return type.
 */
export function resolveAutoDurations<T extends { durationInFrames: number | null }>(
  sections: T[],
  fps: number,
  bpm: number,
  sectionDurations: Record<string, number> = {},
): (T & { durationInFrames: number })[] {
  const framesPerBeat = fps / (bpm / 60)
  const defaultDuration = Math.round(DEFAULT_SECTION_BEATS * framesPerBeat)

  return sections.map((section, i): T & { durationInFrames: number } => {
    if (section.durationInFrames !== null) {
      return section as T & { durationInFrames: number }
    }

    const seconds = sectionDurations[String(i)]
    const durationInFrames = seconds !== undefined && seconds > 0
      ? Math.round(seconds * fps)
      : defaultDuration

    return { ...section, durationInFrames }
  })
}
