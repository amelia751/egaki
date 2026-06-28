// Custom Cartesia TTS and STT providers.
//
// TTS: POST https://api.cartesia.ai/tts/sse with add_timestamps=true
//   Returns word-level timestamps natively via SSE events.
//   API docs: https://docs.cartesia.ai/api-reference/tts/sse
//
// STT: POST https://api.cartesia.ai/stt (Ink models)
//   API docs: https://docs.cartesia.ai/api-reference/stt/transcribe
//
// Source of truth for request/response types:
//   JS SDK (auto-generated from OpenAPI spec by Stainless):
//   https://github.com/cartesia-ai/cartesia-js/blob/main/src/resources/stt/stt.ts
//   https://github.com/cartesia-ai/cartesia-js/blob/main/src/resources/tts.ts
//
// TTS models: https://docs.cartesia.ai/build-with-cartesia/tts-models/latest
// STT models: https://docs.cartesia.ai/build-with-cartesia/stt/latest
// Pricing: https://docs.cartesia.ai/pricing

import type { SpeechProvider, SpeechProviderOptions, SpeechProviderResult } from './speech-generate.js'
import type { WordTimestamp } from './transcription-generate.js'

const CARTESIA_API_BASE = 'https://api.cartesia.ai'
const CARTESIA_API_VERSION = '2026-03-01'

// Default voice: Katie (en-US Female), recommended for voice agents
const DEFAULT_VOICE_ID = 'f786b574-daa5-4673-aa0c-cbe3e8534c02'

// ─── shared helpers ──────────────────────────────────────────────────────────

/**
 * Map user-facing format strings to Cartesia output_format objects.
 * The SSE endpoint only supports raw container (not mp3/wav), so we
 * always use raw PCM for SSE streaming.
 */
function buildSseOutputFormat(format?: string): {
  container: 'raw'
  encoding: string
  sample_rate: number
} {
  // SSE endpoint only supports raw container. We always use PCM s16le
  // and let the caller convert if needed.
  const sampleRate = format === 'pcm_16000' ? 16000
    : format === 'pcm_22050' ? 22050
    : format === 'pcm_24000' ? 24000
    : 44100
  return { container: 'raw', encoding: 'pcm_s16le', sample_rate: sampleRate }
}

// ─── SSE event types ─────────────────────────────────────────────────────────
// From https://docs.cartesia.ai/api-reference/tts/sse

interface CartesiaSseChunk {
  type: 'chunk'
  data: string // base64 encoded audio
}

interface CartesiaSseTimestamps {
  type: 'timestamps'
  word_timestamps: {
    words: string[]
    start: number[]
    end: number[]
  }
}

interface CartesiaSseDone {
  type: 'done'
}

interface CartesiaSseError {
  type: 'error'
  message: string
  status_code: number
}

type CartesiaSseEvent = CartesiaSseChunk | CartesiaSseTimestamps | CartesiaSseDone | CartesiaSseError

// ─── SSE parser ──────────────────────────────────────────────────────────────

import { EventSourceParserStream } from 'eventsource-parser/stream'

/**
 * Parse a Cartesia SSE stream into audio chunks and word timestamps.
 * Uses eventsource-parser for robust SSE frame parsing.
 */
export async function parseCartesiaSseStream(
  body: ReadableStream<Uint8Array>,
): Promise<{ audioChunks: Uint8Array[]; timestamps: WordTimestamp[] }> {
  const audioChunks: Uint8Array[] = []
  const timestamps: WordTimestamp[] = []

  const eventStream = body
    .pipeThrough(new TextDecoderStream() as any)
    .pipeThrough(new EventSourceParserStream())

  const reader = eventStream.getReader()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    let event: CartesiaSseEvent
    try {
      event = JSON.parse(value.data)
    } catch {
      continue
    }

    if (event.type === 'chunk') {
      audioChunks.push(new Uint8Array(Buffer.from(event.data, 'base64')))
    } else if (event.type === 'timestamps') {
      const ts = event.word_timestamps
      for (let i = 0; i < ts.words.length; i++) {
        timestamps.push({
          word: ts.words[i]!,
          startSecond: ts.start[i]!,
          endSecond: ts.end[i]!,
        })
      }
    } else if (event.type === 'error') {
      throw new Error(`Cartesia TTS SSE error ${event.status_code}: ${event.message}`)
    }
  }

  return { audioChunks, timestamps }
}

/** Concatenate multiple Uint8Array chunks into one. */
function concatUint8Arrays(chunks: Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((sum, c) => sum + c.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return result
}

/**
 * Wrap raw PCM s16le mono audio into a WAV container.
 * The SSE endpoint only supports raw PCM output, but browsers need a
 * proper container format. WAV is the simplest lossless wrapper.
 */
function wavFromPcmS16Le(pcm: Uint8Array, sampleRate: number): Uint8Array {
  const header = new ArrayBuffer(44)
  const view = new DataView(header)
  const channels = 1
  const bitsPerSample = 16
  const byteRate = sampleRate * channels * (bitsPerSample / 8)
  const blockAlign = channels * (bitsPerSample / 8)

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
  }

  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + pcm.byteLength, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)            // subchunk1 size (PCM)
  view.setUint16(20, 1, true)             // audio format (PCM = 1)
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitsPerSample, true)
  writeStr(36, 'data')
  view.setUint32(40, pcm.byteLength, true)

  const wav = new Uint8Array(44 + pcm.byteLength)
  wav.set(new Uint8Array(header), 0)
  wav.set(pcm, 44)
  return wav
}

// ─── Cartesia TTS SpeechProvider ─────────────────────────────────────────────

/**
 * Create a Cartesia speech provider using the SSE endpoint with word timestamps.
 * Returns raw PCM audio (pcm_s16le) since the SSE endpoint only supports raw container.
 */
export function createCartesiaSpeechProvider(): SpeechProvider {
  return {
    async generate(options: SpeechProviderOptions): Promise<SpeechProviderResult> {
      const apiKey = process.env['CARTESIA_API_KEY']
      if (!apiKey) {
        throw new Error('Missing CARTESIA_API_KEY. Run: egaki login --provider cartesia --key <key>')
      }

      const voiceId = options.voice || DEFAULT_VOICE_ID
      const outputFormat = buildSseOutputFormat(options.outputFormat)

      const body: Record<string, unknown> = {
        model_id: options.modelId,
        transcript: options.text,
        voice: { mode: 'id', id: voiceId },
        output_format: outputFormat,
        add_timestamps: true,
      }

      if (options.language) {
        body.language = options.language
      }

      if (options.speed != null) {
        body.generation_config = { speed: options.speed }
      }

      const response = await fetch(`${CARTESIA_API_BASE}/tts/sse`, {
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
          `Cartesia TTS SSE API error ${response.status}: ${errorText || response.statusText}`,
        )
      }

      if (!response.body) {
        throw new Error('Cartesia TTS SSE response has no body')
      }

      const { audioChunks, timestamps } = await parseCartesiaSseStream(response.body)
      const pcm = concatUint8Arrays(audioChunks)
      // Wrap raw PCM in WAV container so browsers can play the audio.
      const audio = wavFromPcmS16Le(pcm, outputFormat.sample_rate)

      return {
        audio,
        mediaType: 'audio/wav',
        timestamps: timestamps.length > 0 ? timestamps : undefined,
      }
    },
  }
}

// Cartesia STT is now implemented as a TranscriptionProvider in
// transcription-providers.ts (createCartesiaTranscriptionProvider).
// The old TranscriptionModel-based implementation was removed to drop
// the AI SDK dependency from the transcription path.
