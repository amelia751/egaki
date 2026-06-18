// Programmatic API for egaki speech generation.
// Returns Error | Result (errore style) instead of process.exit/console.error.
//
// Two variants:
//   - `generateSpeech(opts)` — cached, writes to public/generated/audio/, returns { src }
//   - `generateSpeechUncached(opts)` — raw, returns bytes in GenerateSpeechResult
//
// Uses our own SpeechProvider interface instead of the Vercel AI SDK's
// experimental_generateSpeech. This lets providers return word-level timestamps
// alongside audio (ElevenLabs /with-timestamps, Cartesia /tts/sse).
//
// Usage:
//   import { generateSpeech, generateSpeechUncached } from 'egaki/generate'
//   const cached = await generateSpeech({ text: 'Hello world' })
//   if (!(cached instanceof Error)) cached.src // '/generated/audio/hello-world-a1b2c3d4.mp3'
//   const raw = await generateSpeechUncached({ text: 'Hello world' })
//   if (!(raw instanceof Error)) raw.audio.uint8Array // raw bytes
//   if (raw.timestamps) raw.timestamps[0] // { word: 'Hello', startSecond: 0, endSecond: 0.4 }
import { injectCredentialsToEnv } from './credentials.js'
import {
  getSpeechModelConfig,
  getSpeechProvider,
  DEFAULT_SPEECH_MODEL,
} from './speech-models.js'
import type { GeneratedFile } from './generate.js'
import type { WordTimestamp } from './transcription-generate.js'

export type { WordTimestamp }

// ─── SpeechProvider interface ────────────────────────────────────────────────
// Each provider implements this to generate audio + optional word timestamps.

export interface SpeechProviderResult {
  audio: Uint8Array
  mediaType: string
  /** Word-level timestamps, if the provider supports them. */
  timestamps?: WordTimestamp[]
}

export interface SpeechProviderOptions {
  text: string
  modelId: string
  voice?: string
  outputFormat?: string
  instructions?: string
  speed?: number
  language?: string
  abortSignal?: AbortSignal
}

export interface SpeechProvider {
  generate(options: SpeechProviderOptions): Promise<SpeechProviderResult>
}

// ─── autocomplete-friendly union types ───────────────────────────────────────

/** Speech model IDs from the catalog. Accepts arbitrary strings too. */
export type SpeechModelId =
  | 'tts-1' | 'tts-1-hd' | 'gpt-4o-mini-tts'
  | 'eleven_v3' | 'eleven_multilingual_v2' | 'eleven_flash_v2_5' | 'eleven_turbo_v2_5'
  | 'sonic-3.5' | 'sonic-3'
  | (string & {})

/** Built-in voice presets across providers. Accepts arbitrary strings too. */
export type SpeechVoice =
  | 'alloy' | 'ash' | 'coral' | 'echo' | 'fable' | 'onyx' | 'nova' | 'sage' | 'shimmer' | 'ballad' | 'cedar' | 'marin' | 'verse'
  | (string & {})

/** Audio output formats. */
export type AudioOutputFormat = 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm' | 'raw' | (string & {})

// ─── public types ────────────────────────────────────────────────────────────

export interface GenerateSpeechOptions {
  /** The text to convert to speech. */
  text: string
  /** Speech model ID. Defaults to DEFAULT_SPEECH_MODEL ('tts-1') if omitted. */
  model?: SpeechModelId
  /** Voice ID or name (provider-specific). */
  voice?: SpeechVoice
  /** Output audio format: mp3, wav, pcm, opus, aac, flac, etc. */
  outputFormat?: AudioOutputFormat
  /** Style instructions for models that support it (e.g. gpt-4o-mini-tts). */
  instructions?: string
  /**
   * Playback speed multiplier. `1.0` is normal speed; values below slow
   * down, values above speed up.
   *
   * Accepted ranges vary by provider:
   *
   * | Provider    | Range       | Notes                                                        |
   * |-------------|-------------|--------------------------------------------------------------|
   * | OpenAI      | 0.25 – 4.0  | Works with `tts-1`, `tts-1-hd`, `gpt-4o-mini-tts`.          |
   * | ElevenLabs  | 0.25 – 4.0  | Passed as `voice_settings.speed`. Extreme values degrade     |
   * |             |             | quality. Flash/turbo models may ignore it.                   |
   * | Cartesia    | 0.6 – 1.5   | Passed as `generation_config.speed`. Sonic models treat it   |
   * |             |             | as guidance, not an exact multiplier.                        |
   *
   * @default 1.0
   */
  speed?: number
  /** ISO 639-1 language code (e.g. "en", "es", "fr"). */
  language?: string
  /** Abort signal for cancelling the request. */
  abortSignal?: AbortSignal
}

export interface GenerateSpeechResult {
  audio: GeneratedFile
  model: string
  cost: number | null
  /** Word-level timestamps, if the provider supports them (ElevenLabs, Cartesia). */
  timestamps?: WordTimestamp[]
}

// ─── cost calculation ────────────────────────────────────────────────────────

export function calculateSpeechCost(
  cost: { type: 'per-character'; perMillionChars: number },
  textLength: number,
): number {
  return (textLength / 1_000_000) * cost.perMillionChars
}

// ─── media type inference ────────────────────────────────────────────────────

function inferAudioMediaType(format?: string): string {
  switch (format) {
    case 'mp3':
      return 'audio/mpeg'
    case 'wav':
      return 'audio/wav'
    case 'pcm':
    case 'raw':
      return 'audio/pcm'
    case 'opus':
      return 'audio/opus'
    case 'aac':
      return 'audio/aac'
    case 'flac':
      return 'audio/flac'
    default:
      return 'audio/mpeg'
  }
}

function inferMediaTypeFromBytes(audio: Uint8Array, requestedFormat?: string): string {
  // Check magic bytes first
  if (audio.length >= 3 && audio[0] === 0x49 && audio[1] === 0x44 && audio[2] === 0x33) {
    return 'audio/mpeg' // ID3 header (MP3)
  }
  if (audio.length >= 2 && audio[0] === 0xff && (audio[1]! & 0xe0) === 0xe0) {
    return 'audio/mpeg' // MP3 sync word
  }
  if (audio.length >= 4 && audio[0] === 0x52 && audio[1] === 0x49 && audio[2] === 0x46 && audio[3] === 0x46) {
    return 'audio/wav' // RIFF header
  }
  if (audio.length >= 4 && audio[0] === 0x4f && audio[1] === 0x67 && audio[2] === 0x67 && audio[3] === 0x53) {
    return 'audio/ogg' // OggS header (could be opus)
  }
  if (audio.length >= 4 && audio[0] === 0x66 && audio[1] === 0x4c && audio[2] === 0x61 && audio[3] === 0x43) {
    return 'audio/flac' // fLaC header
  }
  // Fall back to requested format
  return inferAudioMediaType(requestedFormat)
}

// ─── generateSpeech ──────────────────────────────────────────────────────────

/**
 * Generate speech audio from text. Auto-detects which provider to use
 * based on model ID. Shares credentials and subscription with the CLI.
 * Returns word-level timestamps when the provider supports them.
 */
export async function generateSpeechUncached(opts: GenerateSpeechOptions): Promise<Error | GenerateSpeechResult> {
  injectCredentialsToEnv()

  const model = opts.model ?? DEFAULT_SPEECH_MODEL
  const config = getSpeechModelConfig(model)
  if (config instanceof Error) return config

  const provider = getSpeechProvider(config.provider)
  if (provider instanceof Error) return provider

  let result: SpeechProviderResult
  try {
    result = await provider.generate({
      text: opts.text,
      modelId: model,
      voice: opts.voice,
      outputFormat: opts.outputFormat,
      instructions: opts.instructions,
      speed: opts.speed,
      language: opts.language,
      abortSignal: opts.abortSignal,
    })
  } catch (err) {
    return err instanceof Error ? err : new Error(String(err))
  }

  const mediaType = result.mediaType || inferMediaTypeFromBytes(result.audio, opts.outputFormat)
  const cost = calculateSpeechCost(config.cost, opts.text.length)

  return {
    audio: { uint8Array: result.audio, mediaType },
    model,
    cost,
    timestamps: result.timestamps,
  }
}

// ─── cached generateSpeech ──────────────────────────────────────────────────
// Writes audio to public/generated/audio/ and a sidecar .timestamps.json
// next to it when the provider returns word timestamps. On cache hit,
// the sidecar is read back to populate the result.
//
// Uses cachedGenerate with postWrite to write the timestamps sidecar after
// the audio file, and deserialize to read it back on cache hit.

import fs from 'node:fs'
import path from 'node:path'
import { cachedGenerate } from './cached-generate.js'
import { extensionFromMediaType } from './cache-utils.js'

/** Compute the sidecar timestamps path for an audio file.
 *  Stored in a `timestamps/` subdirectory to avoid cache key collision:
 *  findCachedFile() matches any filename containing the hash, so a sidecar
 *  like `foo-hash.mp3.timestamps.json` in the same directory would be
 *  mistakenly returned as the "cached audio" file. */
function timestampsPathFor(filePath: string): string {
  return path.join(path.dirname(filePath), 'timestamps', path.basename(filePath) + '.json')
}

export interface CachedSpeechResult {
  src: string
  timestamps?: WordTimestamp[]
}

/** Internal result carrying both audio bytes and optional timestamps. */
interface SpeechGenerateOutput {
  audio: GeneratedFile
  timestamps?: WordTimestamp[]
}

export const generateSpeech = cachedGenerate<GenerateSpeechOptions & { seed?: number }, SpeechGenerateOutput, CachedSpeechResult>({
  namespace: 'audio',
  prefixFrom: (p) => p.text,
  modelFrom: (p) => p.model,
  generate: async (params) => {
    const result = await generateSpeechUncached(params)
    if (result instanceof Error) throw result
    return { audio: result.audio, timestamps: result.timestamps }
  },
  serialize: (output) => ({
    bytes: output.audio.uint8Array,
    extension: extensionFromMediaType(output.audio.mediaType),
  }),
  postWrite: (filePath, output) => {
    if (output.timestamps?.length) {
      const tsPath = timestampsPathFor(filePath)
      fs.mkdirSync(path.dirname(tsPath), { recursive: true })
      fs.writeFileSync(tsPath, JSON.stringify(output.timestamps, null, 2))
    }
  },
  deserialize: ({ urlPath, filePath }) => {
    const tsPath = timestampsPathFor(filePath)
    let timestamps: WordTimestamp[] | undefined
    try {
      if (fs.existsSync(tsPath)) {
        timestamps = JSON.parse(fs.readFileSync(tsPath, 'utf-8'))
      }
    } catch { /* non-fatal: timestamps are optional */ }
    return { src: urlPath, timestamps }
  },
})
