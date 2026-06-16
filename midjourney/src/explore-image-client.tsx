'use client'

/**
 * Client component that renders a Midjourney explore image.
 * Uses 384px webp thumbnails during preview for fast loading (~17KB),
 * switches to full-res jpeg during export (~5MB).
 *
 * TODO: add tweakpane index slider once cross-package React dedup in
 * Vite SSR is resolved.
 */

import type { CSSProperties } from 'react'
import type { CachedSearchResult } from './types.ts'
import { toPreviewUrl } from './types.ts'
import { Img, useIsExporting } from 'egaki/video'

export function MidjourneyExploreImageClient({
  results,
  index = 0,
  style,
  className,
}: {
  results: CachedSearchResult[]
  index?: number
  style?: CSSProperties
  className?: string
}) {
  const isExporting = useIsExporting()
  const result = results[Math.min(index, Math.max(0, results.length - 1))]
  if (!result) return null

  const src = isExporting ? result.url : toPreviewUrl(result.url)

  return <Img src={src} style={style} className={className} alt={result.prompt} />
}
