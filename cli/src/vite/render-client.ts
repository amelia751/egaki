/**
 * Client-side rendering entry point.
 * Renders any Remotion composition entirely in the browser using WebCodecs
 * via @remotion/web-renderer's renderMediaOnWeb().
 */

import { renderMediaOnWeb } from '@remotion/web-renderer'
import { ExportContext } from './mdx-video.tsx'
import React from 'react'

/**
 * Cover the web-renderer scaffold during export. The scaffold wrapper has
 * position:fixed + visibility:hidden + z-index:-9999, but allowHtmlInCanvas
 * sets visibility:visible on the inner layoutsubtree canvas, which can
 * make it peek through on the page.
 *
 * Do NOT modify the scaffold wrapper's own styles (translate, clip-path,
 * width/height, opacity). All of those break Chrome's drawElementImage
 * paint pipeline and produce black frames in the exported video. The
 * layout subtree canvas must remain at full size, in its original position,
 * with normal visibility for the capture to work.
 *
 * Instead we place an opaque overlay on top (z-index:-9998, one above the
 * scaffold's -9999) that visually hides the rendering without touching
 * the scaffold's layout or paint properties.
 */
export function injectScaffoldCover(): () => void {
  const cover = document.createElement('div')
  cover.style.cssText = [
    'position:fixed',
    'inset:0',
    'z-index:-9998',
    'background:#050505',
    'pointer-events:none',
  ].join(';')
  document.body.appendChild(cover)
  return () => cover.remove()
}

/**
 * Wrap a composition for web-renderer entry points (export, screenshot,
 * filmstrip). The scaffold wrapper is visibility:hidden and Chromium creates
 * no paint records for hidden subtrees, which breaks captureElementImage()
 * inside nested <HtmlInCanvas> (AngledScreen): onInit/onPaint silently never
 * run and exports come out flat. visibility is overridable by descendants,
 * so a visibility:visible div at the composition root restores paint records
 * for the whole tree while deeper visibility:hidden ancestors (e.g.
 * LayoutTransition's inactive instances) keep hiding their subtrees
 * relative to this root. Pair with injectScaffoldCover() so the now-visible
 * tree cannot peek through on the page.
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
  const removeCover = injectScaffoldCover()

  const ExportWrapped: React.FC = () =>
    React.createElement(ExportContext.Provider, { value: true },
      React.createElement(options.component))

  try {
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
  } finally {
    removeCover()
  }
}
