'use client'

/**
 * Client wrappers for server-generated media components.
 *
 * Each wrapper receives a `srcPromise: Promise<string>` from the server
 * component (streamed through RSC flight) and a `fallbackSrc` for the
 * stale file to show while generation is in progress. React 19's `use()`
 * suspends until the promise resolves, then renders the actual media
 * component. While suspended, the fallback (stale generation) renders if
 * available; otherwise nothing renders.
 *
 * Passthrough props are forwarded to the underlying media component so
 * users can set style, className, trimBefore, trimAfter, playbackRate, etc.
 */

import { Suspense, use, type ComponentProps } from 'react'
import { Img, Audio, Video } from './mdx-video.tsx'

// ---------------------------------------------------------------------------
// Inner components that call use() — must be inside <Suspense>
// ---------------------------------------------------------------------------

function ResolvedImage({ srcPromise, ...rest }: { srcPromise: Promise<string> } & ComponentProps<typeof Img>) {
  const src = use(srcPromise)
  return <Img src={src} {...rest} />
}

function ResolvedVideo({ srcPromise, ...rest }: { srcPromise: Promise<string> } & ComponentProps<typeof Video>) {
  const src = use(srcPromise)
  return <Video src={src} {...rest} />
}

function ResolvedAudio({ srcPromise, ...rest }: { srcPromise: Promise<string> } & ComponentProps<typeof Audio>) {
  const src = use(srcPromise)
  return <Audio src={src} {...rest} />
}

// ---------------------------------------------------------------------------
// Exported client wrappers — render fallback while promise is pending
// ---------------------------------------------------------------------------

export function GeneratedImageClient({
  srcPromise,
  fallbackSrc,
  ...rest
}: {
  srcPromise: Promise<string>
  fallbackSrc?: string
} & ComponentProps<typeof Img>) {
  return (
    <Suspense fallback={fallbackSrc ? <Img src={fallbackSrc} {...rest} /> : null}>
      <ResolvedImage srcPromise={srcPromise} {...rest} />
    </Suspense>
  )
}

export function GeneratedVideoClient({
  srcPromise,
  fallbackSrc,
  ...rest
}: {
  srcPromise: Promise<string>
  fallbackSrc?: string
} & ComponentProps<typeof Video>) {
  return (
    <Suspense fallback={fallbackSrc ? <Video src={fallbackSrc} {...rest} /> : null}>
      <ResolvedVideo srcPromise={srcPromise} {...rest} />
    </Suspense>
  )
}

export function GeneratedAudioClient({
  srcPromise,
  fallbackSrc,
  ...rest
}: {
  srcPromise: Promise<string>
  fallbackSrc?: string
} & ComponentProps<typeof Audio>) {
  return (
    <Suspense fallback={fallbackSrc ? <Audio src={fallbackSrc} {...rest} /> : null}>
      <ResolvedAudio srcPromise={srcPromise} {...rest} />
    </Suspense>
  )
}
