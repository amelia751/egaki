// Custom Cartesia TTS and STT providers for the Vercel AI SDK.
// Wraps the Cartesia REST API directly since there is no @ai-sdk/cartesia package.
//
// TTS: POST https://api.cartesia.ai/tts/bytes (Sonic models)
// STT: POST https://api.cartesia.ai/stt (Ink models)
//
// Source of truth for request/response types:
//   JS SDK (auto-generated from OpenAPI spec by Stainless):
//   https://github.com/cartesia-ai/cartesia-js/blob/main/src/resources/stt/stt.ts
//   https://github.com/cartesia-ai/cartesia-js/blob/main/src/resources/tts.ts
//
// API docs:
//   TTS bytes: https://docs.cartesia.ai/api-reference/tts/bytes
//   STT batch: https://docs.cartesia.ai/api-reference/stt/transcribe
//   TTS models: https://docs.cartesia.ai/build-with-cartesia/tts-models/latest
//   STT models: https://docs.cartesia.ai/build-with-cartesia/stt/latest
//   Pricing: https://docs.cartesia.ai/pricing

import type { SpeechModel, TranscriptionModel } from 'ai'

// ─── Cartesia STT response types (from cartesia-js SDK) ─────────────────────
// Source: https://github.com/cartesia-ai/cartesia-js/blob/main/src/resources/stt/stt.ts

type CartesiaSTTResponse = {
  /** The transcribed text. */
  text: string
  /** Always 'transcript' for batch transcription. */
  type: 'transcript'
  /** Duration of input audio in seconds. */
  duration?: number
  /** The specified language of the input audio. */
  language?: string
  /** Unique identifier for this transcription request. */
  request_id?: string
  /** @deprecated Not used for batch transcription. */
  is_final?: boolean
  /** Word-level timestamps. Only included when timestamp_granularities[] includes 'word'. */
  words?: Array<CartesiaSTTWord>
}

type CartesiaSTTWord = {
  /** The transcribed word. */
  word: string
  /** Start time of the word in seconds. */
  start: number
  /** End time of the word in seconds. */
  end: number
}

const CARTESIA_API_BASE = 'https://api.cartesia.ai'
const CARTESIA_API_VERSION = '2026-03-01'

// Default voice: Katie (en-US Female), recommended for voice agents
const DEFAULT_VOICE_ID = 'f786b574-daa5-4673-aa0c-cbe3e8534c02'

/**
 * Map user-facing format strings to Cartesia output_format objects.
 * Cartesia requires structured output format objects, not plain strings.
 */
function buildOutputFormat(format?: string): {
  container: string
  sample_rate?: number
  encoding?: string
  bit_rate?: number
} {
  switch (format) {
    case 'wav':
      return { container: 'wav', encoding: 'pcm_s16le', sample_rate: 44100 }
    case 'raw':
    case 'pcm':
      return { container: 'raw', encoding: 'pcm_s16le', sample_rate: 44100 }
    case 'mp3':
    default:
      return { container: 'mp3', sample_rate: 44100, bit_rate: 128000 }
  }
}

function containerToMediaType(container: string): string {
  switch (container) {
    case 'wav':
      return 'audio/wav'
    case 'raw':
      return 'audio/pcm'
    case 'mp3':
    default:
      return 'audio/mpeg'
  }
}

/**
 * Create a Cartesia speech model that implements the Vercel AI SDK SpeechModelV3.
 *
 * Requires CARTESIA_API_KEY in env. Voice defaults to Katie (en-US Female)
 * if not specified. Speed is passed via generation_config.speed (0.6-1.5).
 */
export function createCartesiaSpeechModel(modelId: string): SpeechModel {
  return {
    specificationVersion: 'v3' as const,
    provider: 'cartesia',
    modelId,

    async doGenerate(options: {
      text: string
      voice?: string
      outputFormat?: string
      instructions?: string
      speed?: number
      language?: string
      providerOptions?: Record<string, Record<string, unknown>>
      abortSignal?: AbortSignal
      headers?: Record<string, string | undefined>
    }) {
      const apiKey = process.env['CARTESIA_API_KEY']
      if (!apiKey) {
        throw new Error(
          'Missing CARTESIA_API_KEY. Run: egaki login --provider cartesia --key <key>',
        )
      }

      const voiceId = options.voice || DEFAULT_VOICE_ID
      const outputFormat = buildOutputFormat(options.outputFormat)

      const body: Record<string, unknown> = {
        model_id: modelId,
        transcript: options.text,
        voice: { mode: 'id', id: voiceId },
        output_format: outputFormat,
      }

      if (options.language) {
        body.language = options.language
      }

      if (options.speed != null) {
        body.generation_config = { speed: options.speed }
      }

      const response = await fetch(`${CARTESIA_API_BASE}/tts/bytes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cartesia-Version': CARTESIA_API_VERSION,
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: options.abortSignal,
      })

      if (!response.ok) {
        const errorText = await response.text().catch(() => '')
        throw new Error(
          `Cartesia TTS API error ${response.status}: ${errorText || response.statusText}`,
        )
      }

      const audioBuffer = await response.arrayBuffer()
      const audio = new Uint8Array(audioBuffer)

      return {
        audio,
        warnings: [],
        response: {
          timestamp: new Date(),
          modelId,
          headers: (() => {
            const h: Record<string, string> = {}
            response.headers.forEach((v, k) => { h[k] = v })
            return h
          })(),
        },
        providerMetadata: {
          cartesia: {
            mediaType: containerToMediaType(outputFormat.container),
          },
        },
      }
    },
  }
}

// ─── Cartesia STT (Ink models) ───────────────────────────────────────────────

/**
 * Create a Cartesia transcription model that implements TranscriptionModelV3.
 * Wraps POST https://api.cartesia.ai/stt with multipart/form-data.
 *
 * Model: ink-whisper (batch transcription, word-level timestamps, 99+ languages)
 */
export function createCartesiaTranscriptionModel(modelId: string): TranscriptionModel {
  return {
    specificationVersion: 'v3' as const,
    provider: 'cartesia',
    modelId,

    async doGenerate(options: {
      audio: Uint8Array | string
      mediaType: string
      providerOptions?: Record<string, Record<string, unknown>>
      abortSignal?: AbortSignal
      headers?: Record<string, string | undefined>
    }) {
      const apiKey = process.env['CARTESIA_API_KEY']
      if (!apiKey) {
        throw new Error(
          'Missing CARTESIA_API_KEY. Run: egaki login --provider cartesia --key <key>',
        )
      }

      const audioBytes = typeof options.audio === 'string'
        ? Buffer.from(options.audio, 'base64')
        : new Uint8Array(options.audio)

      const cartesiaOpts = options.providerOptions?.['cartesia'] ?? {}
      const language = (cartesiaOpts['language'] as string) || 'en'

      const formData = new FormData()
      const ext = mediaTypeToExtension(options.mediaType)
      const blob = new Blob([audioBytes], { type: options.mediaType })
      formData.append('file', new File([blob], `audio.${ext}`, { type: options.mediaType }))
      formData.append('model', modelId)
      formData.append('language', language)
      formData.append('timestamp_granularities[]', 'word')

      const response = await fetch(`${CARTESIA_API_BASE}/stt`, {
        method: 'POST',
        headers: {
          'Cartesia-Version': CARTESIA_API_VERSION,
          'Authorization': `Bearer ${apiKey}`,
        },
        body: formData,
        signal: options.abortSignal,
      })

      if (!response.ok) {
        const errorText = await response.text().catch(() => '')
        throw new Error(
          `Cartesia STT API error ${response.status}: ${errorText || response.statusText}`,
        )
      }

      const json = await response.json() as CartesiaSTTResponse

      const responseHeaders: Record<string, string> = {}
      response.headers.forEach((v, k) => { responseHeaders[k] = v })

      return {
        text: json.text,
        segments: json.words?.map((w) => ({
          text: w.word,
          startSecond: w.start,
          endSecond: w.end,
        })) ?? [],
        language: json.language,
        durationInSeconds: json.duration,
        warnings: [],
        response: {
          timestamp: new Date(),
          modelId,
          headers: responseHeaders,
          body: json,
        },
      }
    },
  }
}

function mediaTypeToExtension(mediaType: string): string {
  const map: Record<string, string> = {
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/ogg': 'ogg',
    'audio/flac': 'flac',
    'audio/webm': 'webm',
    'audio/mp4': 'mp4',
    'audio/m4a': 'm4a',
  }
  return map[mediaType] || 'mp3'
}
