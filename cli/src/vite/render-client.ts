/**
 * Client-side rendering entry point.
 * Renders any Remotion composition entirely in the browser using WebCodecs
 * via @remotion/web-renderer's renderMediaOnWeb().
 */

import { renderMediaOnWeb } from '@remotion/web-renderer'
import { ExportContext } from './mdx-video.tsx'
import React from 'react'

/**
 * Wrap a composition for web-renderer entry points (export, screenshot,
 * filmstrip). The scaffold wrapper is visibility:hidden and Chromium creates
 * no paint records for hidden subtrees, which breaks captureElementImage()
 * inside nested <HtmlInCanvas> (AngledScreen): onInit/onPaint silently never
 * run and exports come out flat. visibility is overridable by descendants,
 * so a visibility:visible div at the composition root restores paint records
 * for the whole tree while deeper visibility:hidden ancestors (e.g.
 * LayoutTransition's inactive instances) keep hiding their subtrees
 * relative to this root.
 *
 * Tradeoff (accepted): the scaffold sits at z-index:-9999, painting above
 * the page's root background but below all in-flow content — so the
 * rendering composition can peek through wherever the page shows only the
 * body background. Hiding it differently is not possible:
 *   - opacity:0 / filter:opacity(0) bake into captureElementImage pixels
 *     (verified: capture succeeds but frames come out fully transparent)
 *   - translate/clip-path/resize on the scaffold break the drawElementImage
 *     paint pipeline (black frames — learned June 2026, commit e501ca5)
 *   - visibility:hidden kills paint records entirely (the original bug)
 * An opaque page background or full-viewport player UI fully occludes it.
 *
 * TODO: re-evaluate whether this wrapper is still needed once remotion
 * fixes the HtmlInCanvas delayRender scoping / hidden-scaffold capture bug:
 * https://github.com/remotion-dev/remotion/issues/9367
 */
export function wrapForWebRenderer(component: React.FC): React.FC {
  const Wrapped: React.FC = () =>
    React.createElement(
      'div',
      { style: { visibility: 'visible', position: 'relative', width: '100%', height: '100%' } },
      React.createElement(component),
    )
  return Wrapped
}

export async function renderInBrowser(options: {
  component: React.FC
  durationInFrames: number
  fps?: number
  width?: number
  height?: number
  /** Pixel density / scale multiplier. Default 1. */
  scale?: number
  onProgress?: (progress: number) => void
  signal?: AbortSignal
}) {
  const ExportWrapped: React.FC = () =>
    React.createElement(ExportContext.Provider, { value: true },
      React.createElement(options.component))

  const { getBlob } = await renderMediaOnWeb({
    composition: {
      component: wrapForWebRenderer(ExportWrapped),
      durationInFrames: options.durationInFrames,
      fps: options.fps ?? 30,
      width: options.width ?? 1920,
      height: options.height ?? 1080,
      id: 'MdxVideo',
      calculateMetadata: null,
    },
    inputProps: {},
    container: 'mp4',
    videoCodec: 'h264',
    videoBitrate: 'high',
    allowHtmlInCanvas: true,
    scale: options.scale,
    signal: options.signal,
    onProgress: ({ progress }) => {
      options.onProgress?.(progress)
    },
  })

  return getBlob()
}
