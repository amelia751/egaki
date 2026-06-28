// Direct HTTP transcription providers for egaki.
// Each provider sends multipart form or raw audio to the provider API
// and parses the response, including word-level timestamps.
//
// This replaces the AI SDK's experimental_transcribe + @ai-sdk/* provider
// packages, giving us full control over request/response handling.
// In particular, we can:
//   - Send verbose_json + word timestamp granularities for whisper-1
//   - Avoid verbose_json for gpt-4o-transcribe models, which only support json/text
//   - Parse the top-level `words` array from Groq responses (the AI SDK
//     Groq provider only parses `segments`)
//
// API reference / OpenAPI specs:
//   OpenAI:     https://platform.openai.com/docs/api-reference/audio/createTranscription
//   Groq:       https://console.groq.com/docs/api-reference#audio-transcription
//               (OpenAI-compatible endpoint at /openai/v1/audio/transcriptions)
//   ElevenLabs: https://elevenlabs.io/docs/api-reference/speech-to-text/convert
//   Deepgram:   https://developers.deepgram.com/reference/listen-file

import type { TranscriptionSegment } from './transcription-generate.js'

// ─── shared types ────────────────────────────────────────────────────────────

export interface TranscriptionProviderOptions {
  audio: Uint8Array
  modelId: string
  language?: string
  abortSignal?: AbortSignal
}

export interface TranscriptionProviderResult {
  text: string
  segments: TranscriptionSegment[]
  language?: string
  durationInSeconds?: number
}

export interface TranscriptionProvider {
  transcribe(options: TranscriptionProviderOptions): Promise<TranscriptionProviderResult>
}

// ─── shared helpers ──────────────────────────────────────────────────────────

function mediaTypeFromAudioBytes(audio: Uint8Array): string {
  if (audio.length >= 3 && audio[0] === 0x49 && audio[1] === 0x44 && audio[2] === 0x33) return 'audio/mpeg' // ID3 header
  if (audio.length >= 2 && audio[0] === 0xff && (audio[1]! & 0xe0) === 0xe0) return 'audio/mpeg' // MP3 sync word
  // MP4/M4A: ftyp box at byte offset 4 (box size in first 4 bytes, then 'ftyp')
  if (audio.length >= 12 && audio[4] === 0x66 && audio[5] === 0x74 && audio[6] === 0x79 && audio[7] === 0x70) return 'audio/mp4'
  // WebM: EBML header magic bytes
  if (audio.length >= 4 && audio[0] === 0x1a && audio[1] === 0x45 && audio[2] === 0xdf && audio[3] === 0xa3) return 'audio/webm'
  if (audio.length >= 4 && audio[0] === 0x52 && audio[1] === 0x49 && audio[2] === 0x46 && audio[3] === 0x46) return 'audio/wav' // RIFF
  if (audio.length >= 4 && audio[0] === 0x4f && audio[1] === 0x67 && audio[2] === 0x67 && audio[3] === 0x53) return 'audio/ogg' // OggS
  if (audio.length >= 4 && audio[0] === 0x66 && audio[1] === 0x4c && audio[2] === 0x61 && audio[3] === 0x43) return 'audio/flac' // fLaC
  return 'audio/mpeg'
}

function extensionFromMediaType(mediaType: string): string {
  const map: Record<string, string> = {
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/ogg': 'ogg',
    'audio/flac': 'flac',
    'audio/webm': 'webm',
    'audio/mp4': 'm4a',
    'audio/m4a': 'm4a',
    'audio/x-m4a': 'm4a',
  }
  return map[mediaType] || 'mp3'
}

function buildAudioFormData(audio: Uint8Array, modelId: string): { formData: FormData; mediaType: string } {
  const mediaType = mediaTypeFromAudioBytes(audio)
  const ext = extensionFromMediaType(mediaType)
  const formData = new FormData()
  // Copy into a fresh ArrayBuffer to satisfy TypeScript's BlobPart constraint
  // (Uint8Array backed by SharedArrayBuffer is not assignable to BlobPart).
  const buf = new Uint8Array(audio) as BlobPart
  const blob = new Blob([buf], { type: mediaType })
  formData.append('file', new File([blob], `audio.${ext}`, { type: mediaType }), `audio.${ext}`)
  formData.append('model', modelId)
  return { formData, mediaType }
}

// ─── OpenAI ──────────────────────────────────────────────────────────────────
// POST https://api.openai.com/v1/audio/transcriptions
// Multipart form: file, model, response_format, timestamp_granularities[], language
//
// gpt-4o-transcribe and gpt-4o-mini-transcribe only support response_format=json
// (NOT verbose_json). Word timestamps require verbose_json, so these models
// cannot return word-level timestamps. This is an OpenAI API limitation, not ours.
// whisper-1 supports verbose_json and returns word timestamps.

const GPT4O_TRANSCRIBE_MODELS = ['gpt-4o-transcribe', 'gpt-4o-mini-transcribe']

interface OpenAITranscriptionResponse {
  text: string
  language?: string
  duration?: number
  segments?: Array<{ text: string; start: number; end: number }>
  words?: Array<{ word: string; start: number; end: number }>
}

export function createOpenAITranscriptionProvider(): TranscriptionProvider {
  return {
    async transcribe(options) {
      const apiKey = process.env['OPENAI_API_KEY']
      if (!apiKey) {
        throw new Error('Missing OPENAI_API_KEY. Run: egaki login --provider openai --key <key>')
      }

      const { formData } = buildAudioFormData(options.audio, options.modelId)

      // gpt-4o-transcribe models only support "json" format;
      // whisper-1 supports "verbose_json" which enables word timestamps.
      const isGpt4oTranscribe = GPT4O_TRANSCRIBE_MODELS.includes(options.modelId)
      formData.append('response_format', isGpt4oTranscribe ? 'json' : 'verbose_json')
      if (!isGpt4oTranscribe) {
        formData.append('timestamp_granularities[]', 'word')
      }
      if (options.language) {
        formData.append('language', options.language)
      }

      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}` },
        body: formData,
        signal: options.abortSignal,
      })

      if (!response.ok) {
        const errorText = await response.text().catch(() => '')
        throw new Error(`OpenAI transcription API error ${response.status}: ${errorText || response.statusText}`)
      }

      const json = await response.json() as OpenAITranscriptionResponse

      // Prefer word-level segments from the `words` array; fall back to
      // sentence-level `segments` if words are not present.
      const segments: TranscriptionSegment[] =
        json.words?.map((w) => ({ text: w.word, startSecond: w.start, endSecond: w.end }))
        ?? json.segments?.map((s) => ({ text: s.text, startSecond: s.start, endSecond: s.end }))
        ?? []

      return {
        text: json.text,
        segments,
        language: json.language,
        durationInSeconds: json.duration,
      }
    },
  }
}

// ─── Groq ────────────────────────────────────────────────────────────────────
// POST https://api.groq.com/openai/v1/audio/transcriptions
// OpenAI-compatible multipart form. The key fix: we parse the top-level `words`
// array from the response, which the AI SDK's @ai-sdk/groq provider ignores
// (it only parses `segments`).

interface GroqTranscriptionResponse {
  text: string
  language?: string
  duration?: number
  segments?: Array<{ text: string; start: number; end: number }>
  words?: Array<{ word: string; start: number; end: number }>
}

export function createGroqTranscriptionProvider(): TranscriptionProvider {
  return {
    async transcribe(options) {
      const apiKey = process.env['GROQ_API_KEY']
      if (!apiKey) {
        throw new Error('Missing GROQ_API_KEY. Run: egaki login --provider groq --key <key>')
      }

      const { formData } = buildAudioFormData(options.audio, options.modelId)
      formData.append('response_format', 'verbose_json')
      formData.append('timestamp_granularities[]', 'word')
      formData.append('timestamp_granularities[]', 'segment')
      if (options.language) {
        formData.append('language', options.language)
      }

      const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}` },
        body: formData,
        signal: options.abortSignal,
      })

      if (!response.ok) {
        const errorText = await response.text().catch(() => '')
        throw new Error(`Groq transcription API error ${response.status}: ${errorText || response.statusText}`)
      }

      const json = await response.json() as GroqTranscriptionResponse

      // Prefer word-level from the `words` array (now parsed correctly);
      // fall back to sentence-level `segments`.
      const segments: TranscriptionSegment[] =
        json.words?.map((w) => ({ text: w.word, startSecond: w.start, endSecond: w.end }))
        ?? json.segments?.map((s) => ({ text: s.text, startSecond: s.start, endSecond: s.end }))
        ?? []

      return {
        text: json.text,
        segments,
        language: json.language,
        durationInSeconds: json.duration,
      }
    },
  }
}

// ─── ElevenLabs ──────────────────────────────────────────────────────────────
// POST https://api.elevenlabs.io/v1/speech-to-text
// Multipart form: file, model_id, language_code, timestamps_granularity, tag_audio_events
// Returns JSON with text, language_code, words[{ text, type, start, end }]

interface ElevenLabsTranscriptionResponse {
  text: string
  language_code: string
  language_probability: number
  words?: Array<{
    text: string
    type: 'word' | 'spacing' | 'audio_event'
    start?: number
    end?: number
  }>
}

export function createElevenLabsTranscriptionProvider(): TranscriptionProvider {
  return {
    async transcribe(options) {
      const apiKey = process.env['ELEVENLABS_API_KEY']
      if (!apiKey) {
        throw new Error('Missing ELEVENLABS_API_KEY. Run: egaki login --provider elevenlabs --key <key>')
      }

      const mediaType = mediaTypeFromAudioBytes(options.audio)
      const ext = extensionFromMediaType(mediaType)
      const formData = new FormData()
      const buf = new Uint8Array(options.audio) as BlobPart
      const blob = new Blob([buf], { type: mediaType })
      formData.append('file', new File([blob], `audio.${ext}`, { type: mediaType }), `audio.${ext}`)
      formData.append('model_id', options.modelId)
      formData.append('timestamps_granularity', 'word')
      formData.append('tag_audio_events', 'true')
      if (options.language) {
        formData.append('language_code', options.language)
      }

      const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
        method: 'POST',
        headers: { 'xi-api-key': apiKey },
        body: formData,
        signal: options.abortSignal,
      })

      if (!response.ok) {
        const errorText = await response.text().catch(() => '')
        throw new Error(`ElevenLabs transcription API error ${response.status}: ${errorText || response.statusText}`)
      }

      const json = await response.json() as ElevenLabsTranscriptionResponse

      // Filter to only 'word' type entries (skip 'spacing' and 'audio_event')
      const segments: TranscriptionSegment[] = json.words
        ?.filter((w) => w.type === 'word' && w.text.trim())
        .map((w) => ({ text: w.text, startSecond: w.start ?? 0, endSecond: w.end ?? 0 }))
        ?? []

      // Duration is the end time of the last word
      const lastWord = json.words?.findLast((w) => w.type === 'word' && w.end != null)
      const durationInSeconds = lastWord?.end ?? undefined

      return {
        text: json.text,
        segments,
        language: json.language_code,
        durationInSeconds,
      }
    },
  }
}

// ─── Deepgram ────────────────────────────────────────────────────────────────
// POST https://api.deepgram.com/v1/listen?model={model}&...
// Raw audio body with Content-Type header (not multipart form).
// Query params control model, language, detect_language, smart_format, etc.
// Returns results.channels[0].alternatives[0].{ transcript, words[{ word, start, end }] }
// and metadata.duration for audio length.

interface DeepgramTranscriptionResponse {
  metadata?: { duration?: number }
  results?: {
    channels: Array<{
      detected_language?: string
      alternatives: Array<{
        transcript: string
        words: Array<{ word: string; start: number; end: number }>
      }>
    }>
  }
}

export function createDeepgramTranscriptionProvider(): TranscriptionProvider {
  return {
    async transcribe(options) {
      const apiKey = process.env['DEEPGRAM_API_KEY']
      if (!apiKey) {
        throw new Error('Missing DEEPGRAM_API_KEY. Run: egaki login --provider deepgram --key <key>')
      }

      const mediaType = mediaTypeFromAudioBytes(options.audio)

      const params = new URLSearchParams()
      params.append('model', options.modelId)
      params.append('smart_format', 'true')
      if (options.language) {
        params.append('language', options.language)
      } else {
        params.append('detect_language', 'true')
      }

      const response = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
        method: 'POST',
        headers: {
          'Authorization': `Token ${apiKey}`,
          'Content-Type': mediaType,
        },
        body: new Uint8Array(options.audio) as any,
        signal: options.abortSignal,
      })

      if (!response.ok) {
        const errorText = await response.text().catch(() => '')
        throw new Error(`Deepgram transcription API error ${response.status}: ${errorText || response.statusText}`)
      }

      const json = await response.json() as DeepgramTranscriptionResponse

      const channel = json.results?.channels?.[0]
      const alt = channel?.alternatives?.[0]

      const segments: TranscriptionSegment[] =
        alt?.words?.map((w) => ({ text: w.word, startSecond: w.start, endSecond: w.end }))
        ?? []

      return {
        text: alt?.transcript ?? '',
        segments,
        language: channel?.detected_language,
        durationInSeconds: json.metadata?.duration,
      }
    },
  }
}

// ─── Cartesia ────────────────────────────────────────────────────────────────
// POST https://api.cartesia.ai/stt
// Already implemented in cartesia-provider.ts with direct HTTP calls.
// This wrapper adapts the existing implementation to the TranscriptionProvider
// interface.

interface CartesiaSTTResponse {
  text: string
  type: 'transcript'
  duration?: number
  language?: string
  words?: Array<{ word: string; start: number; end: number }>
}

const CARTESIA_API_BASE = 'https://api.cartesia.ai'
const CARTESIA_API_VERSION = '2026-03-01'

export function createCartesiaTranscriptionProvider(): TranscriptionProvider {
  return {
    async transcribe(options) {
      const apiKey = process.env['CARTESIA_API_KEY']
      if (!apiKey) {
        throw new Error('Missing CARTESIA_API_KEY. Run: egaki login --provider cartesia --key <key>')
      }

      const mediaType = mediaTypeFromAudioBytes(options.audio)
      const ext = extensionFromMediaType(mediaType)
      const formData = new FormData()
      const buf = new Uint8Array(options.audio) as BlobPart
      const blob = new Blob([buf], { type: mediaType })
      formData.append('file', new File([blob], `audio.${ext}`, { type: mediaType }), `audio.${ext}`)
      formData.append('model', options.modelId)
      formData.append('language', options.language || 'en')
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
        throw new Error(`Cartesia STT API error ${response.status}: ${errorText || response.statusText}`)
      }

      const json = await response.json() as CartesiaSTTResponse

      const segments: TranscriptionSegment[] =
        json.words?.map((w) => ({ text: w.word, startSecond: w.start, endSecond: w.end }))
        ?? []

      return {
        text: json.text,
        segments,
        language: json.language,
        durationInSeconds: json.duration,
      }
    },
  }
}
