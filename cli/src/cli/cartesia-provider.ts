// Custom Cartesia TTS provider for the Vercel AI SDK.
// Wraps the Cartesia REST API POST https://api.cartesia.ai/tts/bytes.
// There is no @ai-sdk/cartesia npm package, so this implements SpeechModelV3
// directly against the REST API.
//
// OpenAPI spec: https://docs.cartesia.ai/latest.yml
// TTS bytes endpoint: https://docs.cartesia.ai/api-reference/tts/bytes
// Models: https://docs.cartesia.ai/build-with-cartesia/tts-models/latest
// Pricing: https://docs.cartesia.ai/pricing

import type { SpeechModel } from 'ai'

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
