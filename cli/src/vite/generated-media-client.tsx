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
 *
 * Generation tracking: while the Suspense fallback is mounted (promise
 * pending), each wrapper registers itself in a shared generation tracker.
 * When the promise resolves and the fallback unmounts, the registration
 * is removed. The toolbar reads the tracker via useGenerationStatus()
 * to show "Generating 2 images, 1 speech" etc.
 */

import { Suspense, use, useId, useLayoutEffect, useSyncExternalStore, type ComponentProps, type ReactNode } from 'react'
import { useDelayRender } from 'remotion'
import { Img, Audio, Video, useIsExporting } from './mdx-video.tsx'

// ---------------------------------------------------------------------------
// Generation tracker — tracks how many media items are currently generating.
// Uses the subscribe/getSnapshot pattern for useSyncExternalStore.
// ---------------------------------------------------------------------------

type GeneratingMediaType = 'image' | 'video' | 'speech'

/** Active generation registrations: unique ID → media type. */
const activeGenerations = new Map<string, GeneratingMediaType>()
const listeners = new Set<() => void>()

function notify() {
  for (const fn of listeners) fn()
}

function registerGeneration(id: string, type: GeneratingMediaType) {
  activeGenerations.set(id, type)
  notify()
}

function unregisterGeneration(id: string) {
  activeGenerations.delete(id)
  notify()
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export interface GenerationStatus {
  images: number
  videos: number
  speeches: number
  total: number
}

function getSnapshot(): GenerationStatus | null {
  if (activeGenerations.size === 0) return null
  let images = 0, videos = 0, speeches = 0
  for (const type of activeGenerations.values()) {
    if (type === 'image') images++
    else if (type === 'video') videos++
    else speeches++
  }
  return { images, videos, speeches, total: images + videos + speeches }
}

// Stable reference for SSR (no generations on server)
const serverSnapshot = () => null

// Cache the snapshot object to avoid unnecessary re-renders. Only create
// a new object when the counts actually change.
let cachedSnapshot: GenerationStatus | null = null
let cachedKey = ''

function getStableSnapshot(): GenerationStatus | null {
  const raw = getSnapshot()
  if (raw === null) {
    cachedSnapshot = null
    cachedKey = ''
    return null
  }
  const key = `${raw.images}:${raw.videos}:${raw.speeches}`
  if (key !== cachedKey) {
    cachedKey = key
    cachedSnapshot = raw
  }
  return cachedSnapshot
}

/** Returns generation counts while media is being generated, or null
 *  when nothing is generating. Re-renders only when counts change. */
export function useGenerationStatus(): GenerationStatus | null {
  return useSyncExternalStore(subscribe, getStableSnapshot, serverSnapshot)
}

// ---------------------------------------------------------------------------
// Export-aware Suspense fallback — blocks Remotion frame capture while
// a generated media promise is still pending. Also registers/unregisters
// the generation in the tracker so the toolbar can show status.
// ---------------------------------------------------------------------------

function GeneratedMediaFallback({ type, id, children }: { type: GeneratingMediaType; id: string; children?: ReactNode }) {
  const isExporting = useIsExporting()
  const { delayRender, continueRender } = useDelayRender()

  // Register this generation in the tracker. The fallback is mounted
  // while the promise is pending and unmounted when it resolves.
  useLayoutEffect(() => {
    registerGeneration(id, type)
    return () => unregisterGeneration(id)
  }, [id, type])

  // useLayoutEffect prevents a first-frame capture race: the delay handle
  // is registered before the browser paints, matching Remotion's own pattern.
  useLayoutEffect(() => {
    if (!isExporting) return
    const handle = delayRender('Waiting for generated media', {
      timeoutInMilliseconds: 10 * 60 * 1000,
    })
    return () => continueRender(handle)
  }, [isExporting, delayRender, continueRender])
  return <>{children}</>
}

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
  const id = useId()
  return (
    <Suspense fallback={<GeneratedMediaFallback type="image" id={id}>{fallbackSrc ? <Img src={fallbackSrc} {...rest} /> : null}</GeneratedMediaFallback>}>
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
  const id = useId()
  return (
    <Suspense fallback={<GeneratedMediaFallback type="video" id={id}>{fallbackSrc ? <Video src={fallbackSrc} {...rest} /> : null}</GeneratedMediaFallback>}>
      <ResolvedVideo srcPromise={srcPromise} {...rest} />
    </Suspense>
  )
}

export function GeneratedSpeechClient({
  srcPromise,
  fallbackSrc,
  ...rest
}: {
  srcPromise: Promise<string>
  fallbackSrc?: string
} & ComponentProps<typeof Audio>) {
  const id = useId()
  return (
    <Suspense fallback={<GeneratedMediaFallback type="speech" id={id}>{fallbackSrc ? <Audio src={fallbackSrc} {...rest} /> : null}</GeneratedMediaFallback>}>
      <ResolvedAudio srcPromise={srcPromise} {...rest} />
    </Suspense>
  )
}
