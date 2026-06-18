// ElevenLabs speech provider for egaki.
// Uses the streaming endpoint /v1/text-to-speech/{voiceId}/stream/with-timestamps
// to get audio chunks + character timestamps in a single streamed response.
// Character-level alignment is grouped into word-level timestamps.
//
// API docs: https://elevenlabs.io/docs/api-reference/text-to-speech/stream-with-timestamps
//
// The streaming response is NDJSON (newline-delimited JSON), NOT SSE.
// Each line is a JSON object: { audio_base64, alignment?, normalized_alignment? }
// Alignment data (character-level timing) is included in the first chunk only.
// We use `normalized_alignment` (timing of what was actually spoken).

import type { SpeechProvider, SpeechProviderOptions, SpeechProviderResult } from './speech-generate.js'
import type { WordTimestamp } from './transcription-generate.js'

const ELEVENLABS_API_BASE = 'https://api.elevenlabs.io'
const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM' // Rachel

// ─── format mapping ──────────────────────────────────────────────────────────

const FORMAT_MAP: Record<string, string> = {
  mp3: 'mp3_44100_128',
  mp3_32: 'mp3_44100_32',
  mp3_64: 'mp3_44100_64',
  mp3_96: 'mp3_44100_96',
  mp3_128: 'mp3_44100_128',
  mp3_192: 'mp3_44100_192',
  pcm: 'pcm_44100',
  pcm_16000: 'pcm_16000',
  pcm_22050: 'pcm_22050',
  pcm_24000: 'pcm_24000',
  pcm_44100: 'pcm_44100',
  ulaw: 'ulaw_8000',
}

function resolveOutputFormat(format?: string): string {
  if (!format) return 'mp3_44100_128'
  return FORMAT_MAP[format] || format
}

function formatToMediaType(format: string): string {
  if (format.startsWith('mp3')) return 'audio/mpeg'
  if (format.startsWith('pcm')) return 'audio/pcm'
  if (format.startsWith('ulaw')) return 'audio/basic'
  if (format.startsWith('opus')) return 'audio/opus'
  if (format.startsWith('wav')) return 'audio/wav'
  return 'audio/mpeg'
}

// ─── character-to-word grouping ──────────────────────────────────────────────

interface CharacterAlignment {
  characters: string[]
  character_start_times_seconds: number[]
  character_end_times_seconds: number[]
}

/**
 * Group character-level timestamps into word-level timestamps.
 * Characters are grouped by splitting on whitespace characters.
 * Each word's start time is the start of its first character,
 * and its end time is the end of its last character.
 */
export function groupCharactersToWords(alignment: CharacterAlignment): WordTimestamp[] {
  const words: WordTimestamp[] = []
  let currentWord = ''
  let wordStart = -1
  let wordEnd = -1

  for (let i = 0; i < alignment.characters.length; i++) {
    const char = alignment.characters[i]!
    const charStart = alignment.character_start_times_seconds[i]!
    const charEnd = alignment.character_end_times_seconds[i]!

    if (/\s/.test(char)) {
      if (currentWord) {
        words.push({ word: currentWord, startSecond: wordStart, endSecond: wordEnd })
        currentWord = ''
        wordStart = -1
        wordEnd = -1
      }
      continue
    }

    currentWord += char
    if (wordStart < 0) wordStart = charStart
    wordEnd = charEnd
  }

  if (currentWord) {
    words.push({ word: currentWord, startSecond: wordStart, endSecond: wordEnd })
  }

  return words
}

// ─── NDJSON stream types ─────────────────────────────────────────────────────

interface ElevenLabsStreamChunk {
  audio_base64: string
  alignment?: CharacterAlignment | null
  normalized_alignment?: CharacterAlignment | null
}

// ─── NDJSON stream parser ────────────────────────────────────────────────────

/**
 * Parse an ElevenLabs NDJSON stream into audio chunks and character alignment.
 * Each line is a JSON object with audio_base64 and optional alignment data.
 * Alignment is typically only in the first chunk.
 */
export async function parseElevenLabsStream(
  body: ReadableStream<Uint8Array>,
): Promise<{ audioChunks: Uint8Array[]; alignment?: CharacterAlignment }> {
  const audioChunks: Uint8Array[] = []
  let alignment: CharacterAlignment | undefined

  const reader = body.pipeThrough(new TextDecoderStream() as any).getReader()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += value

    // Process complete lines
    let newlineIdx: number
    while ((newlineIdx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newlineIdx).trim()
      buffer = buffer.slice(newlineIdx + 1)
      if (!line) continue

      let chunk: ElevenLabsStreamChunk
      try {
        chunk = JSON.parse(line)
      } catch {
        continue
      }

      if (chunk.audio_base64) {
        audioChunks.push(new Uint8Array(Buffer.from(chunk.audio_base64, 'base64')))
      }

      // Capture alignment from first chunk that has it
      if (!alignment) {
        const align = chunk.normalized_alignment || chunk.alignment
        if (align) alignment = align
      }
    }
  }

  // Process any remaining data in buffer (last line without trailing newline)
  const remaining = buffer.trim()
  if (remaining) {
    try {
      const chunk: ElevenLabsStreamChunk = JSON.parse(remaining)
      if (chunk.audio_base64) {
        audioChunks.push(new Uint8Array(Buffer.from(chunk.audio_base64, 'base64')))
      }
      if (!alignment) {
        const align = chunk.normalized_alignment || chunk.alignment
        if (align) alignment = align
      }
    } catch { /* ignore malformed trailing data */ }
  }

  return { audioChunks, alignment }
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

// ─── provider ────────────────────────────────────────────────────────────────

export function createElevenLabsSpeechProvider(): SpeechProvider {
  return {
    async generate(options: SpeechProviderOptions): Promise<SpeechProviderResult> {
      const apiKey = process.env['ELEVENLABS_API_KEY']
      if (!apiKey) {
        throw new Error('Missing ELEVENLABS_API_KEY. Run: egaki login --provider elevenlabs --key <key>')
      }

      const voiceId = options.voice || DEFAULT_VOICE_ID
      const outputFormat = resolveOutputFormat(options.outputFormat)

      const body: Record<string, unknown> = {
        text: options.text,
        model_id: options.modelId,
      }

      if (options.language) {
        body.language_code = options.language
      }

      if (options.speed != null) {
        body.voice_settings = { speed: options.speed }
      }

      const queryParams = new URLSearchParams({ output_format: outputFormat })
      const url = `${ELEVENLABS_API_BASE}/v1/text-to-speech/${voiceId}/stream/with-timestamps?${queryParams}`

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': apiKey,
        },
        body: JSON.stringify(body),
        signal: options.abortSignal,
      })

      if (!response.ok) {
        const errorText = await response.text().catch(() => '')
        throw new Error(
          `ElevenLabs TTS API error ${response.status}: ${errorText || response.statusText}`,
        )
      }

      if (!response.body) {
        throw new Error('ElevenLabs TTS stream response has no body')
      }

      const { audioChunks, alignment } = await parseElevenLabsStream(response.body)
      const audio = concatUint8Arrays(audioChunks)
      const timestamps = alignment ? groupCharactersToWords(alignment) : undefined

      return {
        audio,
        mediaType: formatToMediaType(outputFormat),
        timestamps,
      }
    },
  }
}
