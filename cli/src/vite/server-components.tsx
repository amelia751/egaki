/**
 * Server components for AI media generation in MDX <Server> blocks.
 *
 * No 'use client' directive: these execute in the RSC environment (async,
 * filesystem access, API calls). They are auto-wrapped in <Server> by
 * wrapGenerateNodes() in server-mdx.ts, so users write them bare in MDX.
 *
 * Each component:
 *   1. Builds a stable cache key from generation params (sorted JSON)
 *   2. Checks public/generated/{type}/ for an existing file with that hash
 *   3. If cached, returns the client wrapper with the resolved URL immediately
 *   4. If not cached, starts generation and returns immediately with a promise
 *      that the client wrapper awaits via React 19 use()
 *   5. On regeneration (seed change), marks old file as stale- prefix
 *
 * Generation props are type-safe, reusing the same option types from
 * egaki/generate. Passthrough props (style, className, trim, etc.) are
 * forwarded to the client wrapper which renders the actual media component.
 */

import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { ComponentProps } from 'react'
import type { GenerateImageOptions } from '../cli/generate.js'
import type { GenerateVideoOptions } from '../cli/generate.js'
import type { GenerateSpeechOptions } from '../cli/speech-generate.js'
import {
  GeneratedImageClient,
  GeneratedVideoClient,
  GeneratedAudioClient,
} from './generated-media-client.tsx'
import type { Img, Audio, Video } from './mdx-video.tsx'

// projectRoot is provided by the virtual module at Vite runtime.
// Using dynamic import so tests that import the caching utilities
// don't fail trying to resolve the virtual module statically.
let _projectRoot: string | undefined
async function getProjectRoot(): Promise<string> {
  if (_projectRoot) return _projectRoot
  const mod = await import(/* @vite-ignore */ 'virtual:egaki-mdx')
  _projectRoot = mod.projectRoot
  return _projectRoot!
}

// ---------------------------------------------------------------------------
// Asset path resolution — paths starting with `/` resolve to the project's
// public/ folder (Vite convention), then fall back to absolute/relative paths.
// ---------------------------------------------------------------------------

/** Resolve a path prop to an absolute filesystem path.
 *  `/photo.png` → `{projectRoot}/public/photo.png` if the file exists.
 *  Relative paths resolve against projectRoot.
 *  Absolute paths and URLs pass through unchanged. */
async function resolveAssetPath(p: string): Promise<string> {
  if (p.startsWith('http://') || p.startsWith('https://')) return p
  const root = await getProjectRoot()
  if (p.startsWith('/')) {
    const publicPath = path.join(root, 'public', p)
    if (fs.existsSync(publicPath)) return publicPath
  }
  if (path.isAbsolute(p)) return p
  return path.resolve(root, p)
}

/** Resolve a path and read it as bytes. Works with public paths (`/img.png`),
 *  relative paths, absolute paths, and URLs (http/https). */
async function readAssetBytes(p: string): Promise<Uint8Array> {
  const resolved = await resolveAssetPath(p)
  if (resolved.startsWith('http://') || resolved.startsWith('https://')) {
    const res = await fetch(resolved)
    if (!res.ok) throw new Error(`Failed to fetch ${resolved}: ${res.status}`)
    return new Uint8Array(await res.arrayBuffer())
  }
  return new Uint8Array(fs.readFileSync(resolved))
}

// ---------------------------------------------------------------------------
// Caching utilities
// ---------------------------------------------------------------------------

/** Deterministic JSON from a value: keys sorted recursively, undefined
 *  values stripped. Safe for nested objects and arrays. */
export function stableJsonKey(value: unknown): string {
  return JSON.stringify(sortValue(value))
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => [k, sortValue(v)]),
  )
}

/** First 8 hex chars of sha256. */
export function hashKey(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 8)
}

/** First ~40 chars of text, kebab-cased, filesystem-safe. */
export function promptPrefix(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 40)
    .replace(/-$/, '')
}

function extensionFromMediaType(mediaType: string): string {
  const map: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/webp': '.webp',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'audio/mpeg': '.mp3',
    'audio/wav': '.wav',
    'audio/opus': '.opus',
    'audio/ogg': '.ogg',
    'audio/aac': '.aac',
    'audio/flac': '.flac',
  }
  return map[mediaType] || '.bin'
}

type MediaType = 'image' | 'video' | 'audio'

async function generatedDir(type: MediaType): Promise<string> {
  const root = await getProjectRoot()
  const dir = path.join(root, 'public', 'generated', type)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

/** Find an existing cached file by hash in the generated directory.
 *  Returns the filename (not full path) or undefined. */
export function findCachedFile(dir: string, hash: string): string | undefined {
  try {
    return fs.readdirSync(dir).find((f) => f.includes(hash))
  } catch {
    return undefined
  }
}

/** Find a previous generation with the same prompt prefix that can serve
 *  as fallback while a new generation is in progress. Looks for files
 *  matching the prefix but with a different hash (different seed/params). */
export function findFallbackFile(dir: string, prefix: string, currentHash: string): string | undefined {
  try {
    return fs.readdirSync(dir).find((f) =>
      f.startsWith(prefix + '-')
      && !f.includes(currentHash),
    )
  } catch {
    return undefined
  }
}

// ---------------------------------------------------------------------------
// Generation queue: one promise per cache key, deduplicates concurrent calls.
// Stored on globalThis so in-flight promises survive Vite HMR module reloads.
// Without this, a module reload would drop the reference to a pending promise,
// causing the next render to start a duplicate generation.
// ---------------------------------------------------------------------------

const generationQueue: Map<string, Promise<string>> =
  (globalThis as any).__egakiGenerationQueue ??= new Map<string, Promise<string>>()

// ---------------------------------------------------------------------------
// GeneratedImage
// ---------------------------------------------------------------------------

// Omit binary props (replaced with string paths) and `count` (always 1 per component).
type GeneratedImageGenProps = Omit<GenerateImageOptions, 'count' | 'inputImages' | 'maskImage'> & {
  /** Input image paths for image-to-image. Accepts public paths (`/photo.png`),
   *  relative paths, absolute paths, or URLs. Read as bytes before generation. */
  inputImages?: string[]
  /** Mask image path for inpainting. Same resolution rules as inputImages. */
  maskImage?: string
}

export type GeneratedImageProps = GeneratedImageGenProps & Omit<ComponentProps<typeof Img>, 'src'>

export async function GeneratedImage({ inputImages: inputImagePaths, maskImage: maskImagePath, ...props }: GeneratedImageProps) {
  // Split generation params from passthrough (component) props
  const { prompt, model, seed, aspectRatio, quality, resolution, outputFormat, negativePrompt, allowPeople, imageSize, ...passthrough } = props
  const inputImages = inputImagePaths ? await Promise.all(inputImagePaths.map(readAssetBytes)) : undefined
  const maskImage = maskImagePath ? await readAssetBytes(maskImagePath) : undefined
  const genParams: GenerateImageOptions = { prompt, model, seed, aspectRatio, quality, resolution, outputFormat, negativePrompt, allowPeople, imageSize, inputImages, maskImage }
  const key = stableJsonKey({ _type: 'image', ...genParams })
  const hash = hashKey(key)
  const dir = await generatedDir('image')
  const prefix = promptPrefix(prompt)

  // Check cache
  const cached = findCachedFile(dir, hash)
  if (cached) {
    const src = `/generated/image/${cached}`
    return <GeneratedImageClient srcPromise={Promise.resolve(src)} {...passthrough} />
  }

  // Find a previous generation with same prompt to show while generating
  const fallback = findFallbackFile(dir, prefix, hash)
  const fallbackSrc = fallback ? `/generated/image/${fallback}` : undefined

  // Deduplicate concurrent generations
  let srcPromise = generationQueue.get(key)
  if (!srcPromise) {
    srcPromise = (async () => {
      try {
        console.log(`[egaki] generating image: ${prefix}-${hash}...`)
        const { generateImage } = await import('../cli/generate.js')
        const result = await generateImage(genParams)
        if (result instanceof Error) {
          console.error(`[egaki] image generation failed:`, result.message)
          throw result
        }
        const file = result.images[0]
        if (!file) throw new Error('No image generated')
        const ext = extensionFromMediaType(file.mediaType)
        const filename = `${prefix}-${hash}${ext}`
        fs.writeFileSync(path.join(dir, filename), file.uint8Array)
        // Mark the old fallback file as stale now that we have a fresh one
        // Files are immutable cache entries — never renamed or deleted
        console.log(`[egaki] generated image: ${filename}`)
        return `/generated/image/${filename}`
      } finally {
        generationQueue.delete(key)
      }
    })()
    generationQueue.set(key, srcPromise)
  }

  return <GeneratedImageClient srcPromise={srcPromise} fallbackSrc={fallbackSrc} {...passthrough} />
}

// ---------------------------------------------------------------------------
// GeneratedVideo
// ---------------------------------------------------------------------------

// Omit binary props (replaced with string path) and `count` (always 1 per component).
type GeneratedVideoGenProps = Omit<GenerateVideoOptions, 'count' | 'inputImage'> & {
  /** Input image path for image-to-video. Accepts public paths (`/photo.png`),
   *  relative paths, absolute paths, or URLs. Read as bytes before generation. */
  inputImage?: string
}

export type GeneratedVideoProps = GeneratedVideoGenProps & Omit<ComponentProps<typeof Video>, 'src'>

export async function GeneratedVideo({ inputImage: inputImagePath, ...props }: GeneratedVideoProps) {
  const { prompt, model, seed, aspectRatio, resolution, duration, fps, negativePrompt, mode, videoUrl, referenceImages, ...passthrough } = props
  const inputImage = inputImagePath ? await readAssetBytes(inputImagePath) : undefined
  const genParams: GenerateVideoOptions = { prompt, model, seed, aspectRatio, resolution, duration, fps, negativePrompt, inputImage, mode, videoUrl, referenceImages }
  const key = stableJsonKey({ _type: 'video', ...genParams })
  const hash = hashKey(key)
  const dir = await generatedDir('video')
  const prefix = promptPrefix(prompt)

  const cached = findCachedFile(dir, hash)
  if (cached) {
    const src = `/generated/video/${cached}`
    return <GeneratedVideoClient srcPromise={Promise.resolve(src)} {...passthrough} />
  }

  const fallback = findFallbackFile(dir, prefix, hash)
  const fallbackSrc = fallback ? `/generated/video/${fallback}` : undefined

  let srcPromise = generationQueue.get(key)
  if (!srcPromise) {
    srcPromise = (async () => {
      try {
        console.log(`[egaki] generating video: ${prefix}-${hash}...`)
        const { generateVideo } = await import('../cli/generate.js')
        const result = await generateVideo(genParams)
        if (result instanceof Error) {
          console.error(`[egaki] video generation failed:`, result.message)
          throw result
        }
        const file = result.videos[0]
        if (!file) throw new Error('No video generated')
        const ext = extensionFromMediaType(file.mediaType)
        const filename = `${prefix}-${hash}${ext}`
        fs.writeFileSync(path.join(dir, filename), file.uint8Array)
        // Files are immutable cache entries — never renamed or deleted
        console.log(`[egaki] generated video: ${filename}`)
        return `/generated/video/${filename}`
      } finally {
        generationQueue.delete(key)
      }
    })()
    generationQueue.set(key, srcPromise)
  }

  return <GeneratedVideoClient srcPromise={srcPromise} fallbackSrc={fallbackSrc} {...passthrough} />
}

// ---------------------------------------------------------------------------
// GeneratedAudio
// ---------------------------------------------------------------------------

type GeneratedAudioGenProps = GenerateSpeechOptions & {
  /** Optional. Change to trigger regeneration. */
  seed?: number
}

export type GeneratedAudioProps = GeneratedAudioGenProps & Omit<ComponentProps<typeof Audio>, 'src'>

export async function GeneratedAudio(props: GeneratedAudioProps) {
  const { text, model, voice, outputFormat, instructions, speed, language, seed, ...passthrough } = props
  const genParams = { text, model, voice, outputFormat, instructions, speed, language, seed }
  const key = stableJsonKey({ _type: 'audio', ...genParams })
  const hash = hashKey(key)
  const dir = await generatedDir('audio')
  const prefix = promptPrefix(text)

  const cached = findCachedFile(dir, hash)
  if (cached) {
    const src = `/generated/audio/${cached}`
    return <GeneratedAudioClient srcPromise={Promise.resolve(src)} {...passthrough} />
  }

  const fallback = findFallbackFile(dir, prefix, hash)
  const fallbackSrc = fallback ? `/generated/audio/${fallback}` : undefined

  let srcPromise = generationQueue.get(key)
  if (!srcPromise) {
    srcPromise = (async () => {
      try {
        console.log(`[egaki] generating audio: ${prefix}-${hash}...`)
        const { generateSpeech } = await import('../cli/speech-generate.js')
        const result = await generateSpeech({ text, model, voice, outputFormat, instructions, speed, language })
        if (result instanceof Error) {
          console.error(`[egaki] audio generation failed:`, result.message)
          throw result
        }
        const file = result.audio
        const ext = extensionFromMediaType(file.mediaType)
        const filename = `${prefix}-${hash}${ext}`
        fs.writeFileSync(path.join(dir, filename), file.uint8Array)
        // Files are immutable cache entries — never renamed or deleted
        console.log(`[egaki] generated audio: ${filename}`)
        return `/generated/audio/${filename}`
      } finally {
        generationQueue.delete(key)
      }
    })()
    generationQueue.set(key, srcPromise)
  }

  return <GeneratedAudioClient srcPromise={srcPromise} fallbackSrc={fallbackSrc} {...passthrough} />
}

// ---------------------------------------------------------------------------
// TextToSpeech (legacy alias for GeneratedAudio, kept for backwards compat)
// ---------------------------------------------------------------------------

interface TextToSpeechProps {
  /** Text to synthesize. */
  text: string
  /** Voice preset. */
  voice?: string
}

export async function TextToSpeech({ text, voice = 'alloy' }: TextToSpeechProps) {
  return GeneratedAudio({ text, voice })
}
