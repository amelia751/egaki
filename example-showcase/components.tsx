// React/Remotion wrapper for showcase templates.
// Renders canvas-based image showcase animations.

import React, { useRef, useEffect, useLayoutEffect, useState, useMemo } from 'react'
import { useCurrentFrame, useVideoConfig, delayRender, continueRender } from 'remotion'
import type { ShowcaseTemplate } from './showcase-utils.ts'
import { getDefaultParams } from './showcase-utils.ts'

// Re-export all templates
export { showcaseStream, cardTotem, filmStrip, orbitCarousel, photoOrbit, wheelCarousel, carouselFlow, tickerLoop, columnDrift } from './templates-3d-carousel.ts'
export { gridReveal, spotlightZoom, flipGrid, popGrid, centerStage, focusShift, deckPeel, zoomParallax, diagonalWipe, stripeReveal, splitReveal } from './templates-grid-spotlight.ts'
export { stackSlide, cascadeDrop, posterBurst, imageTrail, positionDance } from './templates-stack-scatter.ts'

// ── Default placeholder colors ─────────────────────────────────────────────

const PLACEHOLDER_COLORS = [
  '#e74c3c', '#3498db', '#2ecc71', '#f39c12',
  '#9b59b6', '#1abc9c', '#e67e22', '#2980b9',
  '#27ae60', '#c0392b', '#8e44ad', '#16a085',
]

function createColorImage(color: string, size = 200): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = color
  ctx.fillRect(0, 0, size, size)
  return canvas
}

// ── Image loading ──────────────────────────────────────────────────────────

function useLoadImages(srcs: string[]): (HTMLImageElement | HTMLCanvasElement | null)[] {
  const [handle] = useState(() => delayRender('Loading showcase images'))
  const [images, setImages] = useState<(HTMLImageElement | HTMLCanvasElement | null)[]>([])

  useEffect(() => {
    let cancelled = false
    const promises = srcs.map(src => {
      if (!src) return Promise.resolve(null)
      return new Promise<HTMLImageElement | null>(resolve => {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => resolve(img)
        img.onerror = () => resolve(null)
        img.src = src
      })
    })
    Promise.all(promises).then(loaded => {
      if (!cancelled) {
        setImages(loaded)
        continueRender(handle)
      }
    })
    return () => { cancelled = true }
  }, [srcs.join(','), handle])

  return images
}

// ── ShowcaseCanvas — core renderer ─────────────────────────────────────────

interface ShowcaseCanvasProps {
  template: ShowcaseTemplate
  images?: string[]
  params?: Record<string, any>
  style?: React.CSSProperties
}

export function ShowcaseCanvas({ template, images: imageSrcs, params: userParams, style }: ShowcaseCanvasProps) {
  const frame = useCurrentFrame()
  const { fps, durationInFrames, width, height } = useVideoConfig()
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Default to placeholder color images if no images provided
  const defaultSrcs = useMemo(
    () => Array.from({ length: template.slotCount }, () => ''),
    [template.slotCount],
  )
  const srcs = imageSrcs ?? defaultSrcs
  const loadedImages = useLoadImages(srcs)

  // Create color placeholder canvases for missing images
  const finalImages = useMemo(() => {
    return Array.from({ length: template.slotCount }, (_, i) => {
      if (loadedImages[i]) return loadedImages[i]
      if (srcs[i]) return loadedImages[i] // Still loading or failed
      return createColorImage(PLACEHOLDER_COLORS[i % PLACEHOLDER_COLORS.length])
    })
  }, [loadedImages, srcs, template.slotCount])

  // Merge user params with defaults
  const mergedParams = useMemo(() => ({
    ...getDefaultParams(template),
    ...userParams,
  }), [template, userParams])

  // Render each frame synchronously before paint for Remotion/web-renderer accuracy
  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const t = frame / durationInFrames
    template.render({ ctx, t, width, height, params: mergedParams, images: finalImages })
  }, [frame, durationInFrames, width, height, mergedParams, finalImages, template])

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', ...style }}
    />
  )
}

// ── Individual template components ─────────────────────────────────────────
// Each wraps ShowcaseCanvas with a specific template for clean MDX usage:
//   <CardTotem images={["/a.jpg", "/b.jpg"]} cardSize={40} />

import { cardTotem, filmStrip, showcaseStream, orbitCarousel, photoOrbit, wheelCarousel, carouselFlow, tickerLoop, columnDrift } from './templates-3d-carousel.ts'
import { gridReveal, spotlightZoom, flipGrid, popGrid, centerStage, focusShift, deckPeel, zoomParallax, diagonalWipe, stripeReveal, splitReveal } from './templates-grid-spotlight.ts'
import { stackSlide, cascadeDrop, posterBurst, imageTrail, positionDance } from './templates-stack-scatter.ts'

type TemplateComponentProps = {
  images?: string[]
  style?: React.CSSProperties
  [key: string]: any
}

function makeComponent(template: ShowcaseTemplate) {
  return function TemplateComponent({ images, style, ...params }: TemplateComponentProps) {
    return <ShowcaseCanvas template={template} images={images} params={params} style={style} />
  }
}

export const ShowcaseStream = makeComponent(showcaseStream)
export const CardTotem = makeComponent(cardTotem)
export const FilmStrip = makeComponent(filmStrip)
export const OrbitCarousel = makeComponent(orbitCarousel)
export const PhotoOrbit = makeComponent(photoOrbit)
export const WheelCarousel = makeComponent(wheelCarousel)
export const CarouselFlow = makeComponent(carouselFlow)
export const TickerLoop = makeComponent(tickerLoop)
export const ColumnDrift = makeComponent(columnDrift)
export const GridReveal = makeComponent(gridReveal)
export const SpotlightZoom = makeComponent(spotlightZoom)
export const FlipGrid = makeComponent(flipGrid)
export const PopGrid = makeComponent(popGrid)
export const CenterStage = makeComponent(centerStage)
export const FocusShift = makeComponent(focusShift)
export const DeckPeel = makeComponent(deckPeel)
export const ZoomParallax = makeComponent(zoomParallax)
export const DiagonalWipe = makeComponent(diagonalWipe)
export const StripeReveal = makeComponent(stripeReveal)
export const SplitReveal = makeComponent(splitReveal)
export const StackSlide = makeComponent(stackSlide)
export const CascadeDrop = makeComponent(cascadeDrop)
export const PosterBurst = makeComponent(posterBurst)
export const ImageTrail = makeComponent(imageTrail)
export const PositionDance = makeComponent(positionDance)
