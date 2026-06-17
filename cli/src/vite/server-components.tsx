/**
 * Server components for AI media generation in MDX <Server> blocks.
 *
 * No 'use client' directive: these execute in the RSC environment (async,
 * filesystem access, API calls). They are auto-wrapped in <Server> by
 * wrapGenerateNodes() in server-mdx.ts, so users write them bare in MDX.
 *
 * Each component delegates to the cached generate functions from egaki/generate
 * (which handle caching, deduplication, stale management, and progress tracking
 * via cachedGenerate) and passes the resolved URL to the client wrapper component.
 *
 * The server components add a thin layer on top for:
 * - Composition-aware defaults (aspect ratio from dimensions)
 * - Asset path resolution (string paths → Uint8Array)
 * - Fallback lookup for RSC streaming (show stale while generating)
 * - RSC flight streaming (pass promise to client wrapper)
 */

import fs from 'node:fs'
import path from 'node:path'
import type { ComponentProps } from 'react'
import type { GenerateImageOptions } from '../cli/generate.js'
import type { GenerateVideoOptions } from '../cli/generate.js'
import type { GenerateSpeechOptions } from '../cli/speech-generate.js'
import { CATALOG, VIDEO_CATALOG } from '../cli/model-catalog.js'
import { DEFAULT_MODEL, DEFAULT_VIDEO_MODEL } from '../cli/models.js'
import { aspectRatioFromDimensions } from './mdx-parse.ts'
import {
  GeneratedImageClient,
  GeneratedVideoClient,
  GeneratedSpeechClient,
} from './generated-media-client.tsx'
import type { Img, Audio, Video } from './mdx-video.tsx'
import { setProjectRoot } from '../cli/cache-utils.js'
import { getCacheInfo } from '../cli/cached-generate.js'

// Re-export progress tracking from the centralized module
export {
  getGenerationProgress,
  onProgressChange,
  type GenerationProgressEvent,
  type GenerationProgressSummary,
  type GenerationProgressEntry,
  type GenerationError,
  type GenerationEntry,
} from '../cli/cached-generate.js'

// Re-export caching utilities so existing imports from 'egaki/generate-media' still work
export { stableJsonKey, hashKey, promptPrefix, findCachedFile, findFallbackFile } from '../cli/cache-utils.js'

// ---------------------------------------------------------------------------
// Project root and composition dimensions from Vite virtual module.
// setProjectRoot() is called here so the cached generate functions
// in egaki/generate know where public/generated/ is.
// ---------------------------------------------------------------------------

let _initialized = false
async function ensureInit() {
  if (_initialized) return
  const mod = await import('virtual:egaki-mdx')
  setProjectRoot(mod.projectRoot)
  _initialized = true
}

async function getCompositionDimensions(): Promise<{ width: number; height: number }> {
  const mod = await import('virtual:egaki-mdx')
  return { width: mod.compositionWidth, height: mod.compositionHeight }
}

/** Look up a model's supported aspect ratios from the catalog. */
function getModelAspectRatios(modelId: string, type: 'image' | 'video'): string[] | undefined {
  if (type === 'image') {
    const entry = CATALOG.find((m) => m.id === modelId)
    return entry?.features.aspectRatios
  }
  const entry = VIDEO_CATALOG.find((m) => m.id === modelId)
  return entry?.features.aspectRatios ?? undefined
}

// ---------------------------------------------------------------------------
// Asset path resolution — paths starting with `/` resolve to the project's
// public/ folder (Vite convention), then fall back to absolute/relative paths.
// ---------------------------------------------------------------------------

/** Resolve a path prop to an absolute filesystem path.
 *  `/photo.png` → `{projectRoot}/public/photo.png` if the file exists.
 *  Relative paths resolve against projectRoot.
 *  Absolute paths and URLs pass through unchanged. */
export async function resolveAssetPath(p: string): Promise<string> {
  await ensureInit()
  const { getProjectRoot } = await import('../cli/cache-utils.js')
  const root = getProjectRoot()
  if (p.startsWith('http://') || p.startsWith('https://')) return p
  if (p.startsWith('/')) {
    const publicDir = path.join(root, 'public')
    const publicPath = path.resolve(publicDir, '.' + p)
    if (publicPath.startsWith(publicDir + path.sep) && fs.existsSync(publicPath)) {
      return publicPath
    }
  }
  if (path.isAbsolute(p)) return p
  return path.resolve(root, p)
}

/** Resolve a path and read it as bytes. */
export async function readAssetBytes(p: string): Promise<Uint8Array> {
  const resolved = await resolveAssetPath(p)
  if (resolved.startsWith('http://') || resolved.startsWith('https://')) {
    const res = await fetch(resolved)
    if (!res.ok) throw new Error(`Failed to fetch ${resolved}: ${res.status}`)
    return new Uint8Array(await res.arrayBuffer())
  }
  return new Uint8Array(fs.readFileSync(resolved))
}

// ---------------------------------------------------------------------------
// GeneratedImage
// ---------------------------------------------------------------------------

type GeneratedImageGenProps = Omit<GenerateImageOptions, 'count' | 'inputImages' | 'maskImage'> & {
  inputImages?: string[]
  maskImage?: string
}

export type GeneratedImageProps = GeneratedImageGenProps & Omit<ComponentProps<typeof Img>, 'src'>

export async function GeneratedImage({ inputImages: inputImagePaths, maskImage: maskImagePath, ...props }: GeneratedImageProps) {
  await ensureInit()
  const { prompt, model, seed, aspectRatio: aspectRatioProp, quality, resolution, outputFormat, negativePrompt, allowPeople, imageSize, ...passthrough } = props

  const { width, height } = await getCompositionDimensions()
  const allowedRatios = getModelAspectRatios(model ?? DEFAULT_MODEL, 'image')
  const aspectRatio = aspectRatioProp ?? (
    allowedRatios?.length ? aspectRatioFromDimensions(width, height, allowedRatios) : undefined
  )
  const inputImages = inputImagePaths ? await Promise.all(inputImagePaths.map(readAssetBytes)) : undefined
  const maskImage = maskImagePath ? await readAssetBytes(maskImagePath) : undefined

  const genParams = { prompt, model, seed, aspectRatio, quality, resolution, outputFormat, negativePrompt, allowPeople, imageSize, inputImages, maskImage }

  // Sync cache check + fallback lookup for RSC streaming
  const cacheInfo = getCacheInfo('image', genParams, prompt)
  if (cacheInfo.cached) {
    return <GeneratedImageClient srcPromise={Promise.resolve(`/generated/image/${cacheInfo.cached}`)} {...passthrough} />
  }

  // Start generation — cachedGenerate handles dedup, progress, and stale management
  const { generateImage } = await import('../cli/generate.js')
  const srcPromise = generateImage(genParams)
    .then((result) => {
      if (result instanceof Error) throw result
      return result.src
    })

  return <GeneratedImageClient srcPromise={srcPromise} fallbackSrc={cacheInfo.fallbackSrc} {...passthrough} />
}

// ---------------------------------------------------------------------------
// GeneratedVideo
// ---------------------------------------------------------------------------

type GeneratedVideoGenProps = Omit<GenerateVideoOptions, 'count' | 'inputImage'> & {
  inputImage?: string
}

export type GeneratedVideoProps = GeneratedVideoGenProps & Omit<ComponentProps<typeof Video>, 'src'>

export async function GeneratedVideo({ inputImage: inputImagePath, ...props }: GeneratedVideoProps) {
  await ensureInit()
  const { prompt, model, seed, aspectRatio: aspectRatioProp, resolution, duration, fps, negativePrompt, mode, videoUrl, referenceImages, ...passthrough } = props

  const inputImage = inputImagePath ? await readAssetBytes(inputImagePath) : undefined
  const { width, height } = await getCompositionDimensions()
  const allowedRatios = getModelAspectRatios(model ?? DEFAULT_VIDEO_MODEL, 'video')
  const aspectRatio = aspectRatioProp ?? (
    allowedRatios?.length ? aspectRatioFromDimensions(width, height, allowedRatios) : undefined
  )

  const genParams = { prompt, model, seed, aspectRatio, resolution, duration, fps, negativePrompt, inputImage, mode, videoUrl, referenceImages }

  const cacheInfo = getCacheInfo('video', genParams, prompt)
  if (cacheInfo.cached) {
    return <GeneratedVideoClient srcPromise={Promise.resolve(`/generated/video/${cacheInfo.cached}`)} {...passthrough} />
  }

  const { generateVideo } = await import('../cli/generate.js')
  const srcPromise = generateVideo(genParams)
    .then((result) => {
      if (result instanceof Error) throw result
      return result.src
    })

  return <GeneratedVideoClient srcPromise={srcPromise} fallbackSrc={cacheInfo.fallbackSrc} {...passthrough} />
}

// ---------------------------------------------------------------------------
// GeneratedSpeech
// ---------------------------------------------------------------------------

type GeneratedSpeechGenProps = GenerateSpeechOptions & {
  seed?: number
}

export type GeneratedSpeechProps = GeneratedSpeechGenProps & Omit<ComponentProps<typeof Audio>, 'src'>

export async function GeneratedSpeech(props: GeneratedSpeechProps) {
  await ensureInit()
  const { text, model, voice, outputFormat, instructions, speed, language, seed, ...passthrough } = props

  const genParams = { text, model, voice, outputFormat, instructions, speed, language, seed }

  const cacheInfo = getCacheInfo('audio', genParams, text)
  if (cacheInfo.cached) {
    return <GeneratedSpeechClient srcPromise={Promise.resolve(`/generated/audio/${cacheInfo.cached}`)} {...passthrough} />
  }

  const { generateSpeech } = await import('../cli/speech-generate.js')
  const srcPromise = generateSpeech(genParams)
    .then((result) => {
      if (result instanceof Error) throw result
      return result.src
    })

  return <GeneratedSpeechClient srcPromise={srcPromise} fallbackSrc={cacheInfo.fallbackSrc} {...passthrough} />
}

// ---------------------------------------------------------------------------
// TextToSpeech (legacy alias for GeneratedSpeech, kept for backwards compat)
// ---------------------------------------------------------------------------

interface TextToSpeechProps {
  /** Text to synthesize. */
  text: string
  /** Voice preset. */
  voice?: string
}

export async function TextToSpeech({ text, voice = 'alloy' }: TextToSpeechProps) {
  return GeneratedSpeech({ text, voice })
}


