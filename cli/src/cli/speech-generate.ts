// Programmatic API for egaki speech generation.
// Returns Error | Result (errore style) instead of process.exit/console.error.
//
// Two variants:
//   - `generateSpeech(opts)` — cached, writes to public/generated/audio/, returns { src }
//   - `generateSpeechUncached(opts)` — raw, returns bytes in GenerateSpeechResult
//
// Usage:
//   import { generateSpeech, generateSpeechUncached } from 'egaki/generate'
//   const cached = await generateSpeech({ text: 'Hello world' })
//   if (!(cached instanceof Error)) cached.src // '/generated/audio/hello-world-a1b2c3d4.mp3'
//   const raw = await generateSpeechUncached({ text: 'Hello world' })
//   if (!(raw instanceof Error)) raw.audio.uint8Array // raw bytes
import {
  experimental_generateSpeech as aiGenerateSpeech,
} from 'ai'
import { injectCredentialsToEnv } from './credentials.js'
import {
  getSpeechModelConfig,
  createSpeechModel,
  DEFAULT_SPEECH_MODEL,
} from './speech-models.js'
import type { GeneratedFile } from './generate.js'

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
}

export interface GenerateSpeechResult {
  audio: GeneratedFile
  model: string
  cost: number | null
  warnings?: unknown[]
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
 */
export async function generateSpeechUncached(opts: GenerateSpeechOptions): Promise<Error | GenerateSpeechResult> {
  injectCredentialsToEnv()

  const model = opts.model ?? DEFAULT_SPEECH_MODEL
  const config = getSpeechModelConfig(model)
  if (config instanceof Error) return config

  const speechModel = await createSpeechModel(model)
  if (speechModel instanceof Error) return speechModel

  let result
  try {
    result = await aiGenerateSpeech({
      model: speechModel,
      text: opts.text,
      ...(opts.voice ? { voice: opts.voice } : {}),
      ...(opts.outputFormat ? { outputFormat: opts.outputFormat } : {}),
      ...(opts.instructions ? { instructions: opts.instructions } : {}),
      ...(opts.speed != null ? { speed: opts.speed } : {}),
      ...(opts.language ? { language: opts.language } : {}),
    })
  } catch (err) {
    return err instanceof Error ? err : new Error(String(err))
  }

  const audioBytes = result.audio.uint8Array
  const mediaType = result.audio.mediaType || inferMediaTypeFromBytes(audioBytes, opts.outputFormat)

  const cost = calculateSpeechCost(config.cost, opts.text.length)

  return {
    audio: { uint8Array: audioBytes, mediaType },
    model,
    cost,
    warnings: result.warnings,
  }
}

// ─── cached generateSpeech ──────────────────────────────────────────────────

import { cachedGenerate } from './cached-generate.js'
import { extensionFromMediaType } from './cache-utils.js'
import type { CachedGenerateResult } from './generate.js'

export const generateSpeech = cachedGenerate<GenerateSpeechOptions & { seed?: number }, GeneratedFile, CachedGenerateResult>({
  namespace: 'audio',
  prefixFrom: (p) => p.text,
  modelFrom: (p) => p.model,
  generate: async (params) => {
    const result = await generateSpeechUncached(params)
    if (result instanceof Error) throw result
    return result.audio
  },
  serialize: (audio) => ({
    bytes: audio.uint8Array,
    extension: extensionFromMediaType(audio.mediaType),
  }),
})
