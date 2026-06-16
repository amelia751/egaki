/**
 * Type definitions for Midjourney API responses.
 * Reverse-engineered from midjourney.com network traffic.
 */

export interface MidjourneyPrompt {
  /** Negative prompt terms */
  no: string[]
  /** Reference image URLs */
  images: string[]
  stop: number | null
  chaos: number | null
  /** Aspect ratio */
  ar: { w: number; h: number } | null
  seed: number | null
  speed: string | null
  visibility: string | null
  batchSize: number | null
  exp: string | null
  /** Standard definition mode */
  sd: boolean
  /** Decoded prompt segments with weights */
  decodedPrompt: { content: string; weight: number }[]
  params: unknown | null
  /** Model version (e.g. "8.1", "7", "6.1") */
  version: string
  quality: number | null
  tile: boolean
  styleRaw: boolean
  styleRef: { content: string; weight: number }[]
  personalize: { content: string; weight: number }[]
  /** Personalization version */
  pv: string | null
  /** Style version */
  sv: string | null
  /** Style weight */
  sw: number | null
  depthRef: { content: string; weight: number }[]
  /** Depth weight */
  dw: number | null
  stylize: number | null
  weird: number | null
  imageWeight: number | null
  video: boolean
  draft: boolean
  /** HD generation */
  hd: boolean
  preview: boolean
  /** Aspect version */
  av: string | null
}

export interface MidjourneyJobItem {
  filtered: boolean
  liked_by_user: boolean
  actions: Record<string, unknown>
  server_filtered: boolean
}

export interface MidjourneyJob {
  isFeedJob: boolean
  /** UUID of the generation job */
  id: string
  /** e.g. "v8-1_hd_diffusion", "v7_diffusion" */
  job_type: string
  event_type: string
  /** Unix millisecond timestamp */
  enqueue_time: number
  parent_grid: string | null
  parent_id: string | null
  width: number
  height: number
  username_v2: string
  display_name: string
  /** UUID of the creator */
  user_id: string
  prompt: MidjourneyPrompt
  published: boolean
  /** Grid items (typically 4 per generation) */
  items: MidjourneyJobItem[]
  owner_profile: unknown | null
  type: 'image' | 'video'
  video_segments: unknown | null
}

export interface MidjourneySearchOptions {
  /** Page number, 1-indexed. Default: 1 */
  page?: number
  /**
   * Filter results by aspect ratio tolerance. Only jobs whose width/height
   * ratio is within this tolerance of the target ratio are returned.
   * Format: "16:9", "1:1", "2:3", etc.
   */
  aspectRatio?: string
  /**
   * How close a job's aspect ratio must be to the target to pass the filter.
   * Default: 0.1 (10% tolerance). Lower values are stricter.
   */
  aspectRatioTolerance?: number
}

/** Simplified search result stored in the JSON cache. */
export interface CachedSearchResult {
  /** CDN URL for the image */
  url: string
  /** The original prompt text */
  prompt: string
  width: number
  height: number
  /** Creator's display name */
  username: string
  /** Model version (e.g. "8.1") */
  version: string
  /** Original job ID */
  jobId: string
}

/** Convert a full MidjourneyJob to a simplified CachedSearchResult. */
export function simplifyJob(job: MidjourneyJob, gridIndex = 0): CachedSearchResult {
  return {
    url: getImageUrl(job, gridIndex),
    prompt: getPromptText(job),
    width: job.width,
    height: job.height,
    username: job.display_name,
    version: job.prompt.version,
    jobId: job.id,
  }
}

/** Parse an aspect ratio string like "16:9" into a numeric ratio. */
export function parseAspectRatio(ar: string): number | null {
  const parts = ar.split(':')
  if (parts.length !== 2) return null
  const w = Number(parts[0])
  const h = Number(parts[1])
  if (!w || !h) return null
  return w / h
}

/** Filter jobs by aspect ratio tolerance. */
export function filterByAspectRatio(options: {
  jobs: MidjourneyJob[]
  aspectRatio: string
  tolerance?: number
}): MidjourneyJob[] {
  const { jobs, aspectRatio, tolerance = 0.1 } = options
  const target = parseAspectRatio(aspectRatio)
  if (!target) return jobs
  return jobs.filter((job) => {
    const ratio = job.width / job.height
    return Math.abs(ratio - target) / target <= tolerance
  })
}

/**
 * Constructs the full-res CDN URL for a Midjourney job image.
 *
 * Midjourney CDN URL patterns (reverse-engineered from their website):
 *   Full-res:   `https://cdn.midjourney.com/<id>/0_N.jpeg`  (job detail page)
 *   Thumbnail:  `https://cdn.midjourney.com/<id>/0_N_384_N.webp` (~17KB, 384px wide)
 *   Full webp:  `https://cdn.midjourney.com/<id>/0_N.webp`  (full-res as webp)
 *
 * N is the grid index (0-3 for a 4-image grid).
 */
export function getImageUrl(job: MidjourneyJob, gridIndex = 0): string {
  return `https://cdn.midjourney.com/${job.id}/0_${gridIndex}.jpeg`
}

/**
 * Constructs a smaller webp preview URL.
 *
 * Midjourney CDN supports these widths: 384, 640, 1024, 2048.
 * Default is 1024 (~76KB vs ~5MB for the original).
 */
export function getPreviewUrl(job: MidjourneyJob, gridIndex = 0, width = 1024): string {
  return `https://cdn.midjourney.com/${job.id}/0_${gridIndex}_${width}_N.webp`
}

/**
 * Derives a smaller preview URL from a full-res CDN URL.
 * `/0_0.jpeg` or `/0_0.png` -> `/0_0_1024_N.webp`
 *
 * Supported widths: 384, 640, 1024, 2048.
 */
export function toPreviewUrl(fullUrl: string, width = 1024): string {
  return fullUrl.replace(/\/0_(\d+)\.(jpeg|png|webp)$/, `/0_$1_${width}_N.webp`)
}

/**
 * Extracts the full decoded prompt text from a job.
 */
export function getPromptText(job: MidjourneyJob): string {
  return job.prompt.decodedPrompt.map((s) => s.content).join(' ')
}
