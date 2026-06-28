// Transcription (speech-to-text) model catalog — single source of truth.
// Mirrors the speech catalog pattern: every model's provider, pricing,
// features live here. Other modules derive their data from this catalog.
//
// Pricing sources:
//   OpenAI:      https://platform.openai.com/docs/pricing (per minute of audio)
//   ElevenLabs:  https://elevenlabs.io/pricing
//   Deepgram:    https://deepgram.com/pricing
//   Groq:        https://groq.com/pricing

import type { ProviderOption } from './model-catalog.js'

// ─── cost types ──────────────────────────────────────────────────────────────

export type PerSecondCost = {
  type: 'per-second'
  /** USD per second of audio */
  perSecond: number
}

export type TranscriptionModelCost = PerSecondCost

// ─── feature types ───────────────────────────────────────────────────────────

export type TranscriptionModelFeatures = {
  /** Whether word-level timestamps are returned */
  wordTimestamps: boolean
  /** Whether speaker diarization is supported */
  diarization: boolean
  /** Whether language detection is automatic */
  languageDetection: boolean
  /** Whether a language hint can be provided */
  languageHint: boolean
  /** Supported input audio formats */
  inputFormats: string[]
  /** Max audio duration in seconds (0 = unknown/unlimited) */
  maxDurationSec: number
}

// ─── entry type ──────────────────────────────────────────────────────────────

export type TranscriptionModelEntry = {
  id: string
  name: string
  description?: string
  provider: string
  strategy: 'transcription'
  released: string
  cost: TranscriptionModelCost
  features: TranscriptionModelFeatures
  providerOptions?: ProviderOption[]
}

// ─── shared fragments ────────────────────────────────────────────────────────

const openaiBase = {
  provider: 'openai',
  strategy: 'transcription' as const,
}

const elevenlabsBase = {
  provider: 'elevenlabs',
  strategy: 'transcription' as const,
}

const deepgramBase = {
  provider: 'deepgram',
  strategy: 'transcription' as const,
}

const groqBase = {
  provider: 'groq',
  strategy: 'transcription' as const,
}

const cartesiaBase = {
  provider: 'cartesia',
  strategy: 'transcription' as const,
}

const commonInputFormats = ['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm', 'ogg', 'flac']

// ─── catalog ─────────────────────────────────────────────────────────────────

export const TRANSCRIPTION_CATALOG: TranscriptionModelEntry[] = [
  // ── OpenAI ─────────────────────────────────────────────────────────────
  {
    id: 'whisper-1',
    name: 'Whisper v1',
    description: 'OpenAI Whisper large-v2 model. Reliable, supports 57 languages.',
    ...openaiBase,
    released: '2023-03',
    cost: { type: 'per-second', perSecond: 0.0001 }, // $0.006/min
    features: {
      wordTimestamps: true,
      diarization: false,
      languageDetection: true,
      languageHint: true,
      inputFormats: commonInputFormats,
      maxDurationSec: 0,
    },
  },
  {
    id: 'gpt-4o-transcribe',
    name: 'GPT-4o Transcribe',
    description: 'GPT-4o powered transcription. Better accuracy than Whisper on complex audio. No word timestamps (OpenAI API only supports response_format=json for this model, verbose_json is required for timestamps).',
    ...openaiBase,
    released: '2025-03',
    cost: { type: 'per-second', perSecond: 0.0001 }, // $0.006/min
    features: {
      // OpenAI API limitation: gpt-4o-transcribe only supports response_format=json,
      // not verbose_json. Word timestamps require verbose_json.
      wordTimestamps: false,
      diarization: false,
      languageDetection: true,
      languageHint: true,
      inputFormats: commonInputFormats,
      maxDurationSec: 0,
    },
  },
  {
    id: 'gpt-4o-mini-transcribe',
    name: 'GPT-4o Mini Transcribe',
    description: 'GPT-4o Mini powered transcription. Cheaper, still better than Whisper. No word timestamps (same OpenAI API limitation as gpt-4o-transcribe).',
    ...openaiBase,
    released: '2025-03',
    cost: { type: 'per-second', perSecond: 0.00005 }, // $0.003/min
    features: {
      // Same OpenAI API limitation as gpt-4o-transcribe.
      wordTimestamps: false,
      diarization: false,
      languageDetection: true,
      languageHint: true,
      inputFormats: commonInputFormats,
      maxDurationSec: 0,
    },
  },

  // ── ElevenLabs ─────────────────────────────────────────────────────────
  {
    id: 'scribe_v1',
    name: 'ElevenLabs Scribe v1',
    description: 'ElevenLabs speech-to-text with word-level timestamps and speaker diarization.',
    ...elevenlabsBase,
    released: '2024-12',
    cost: { type: 'per-second', perSecond: 0.0001 },
    features: {
      wordTimestamps: true,
      diarization: true,
      languageDetection: true,
      languageHint: true,
      inputFormats: commonInputFormats,
      maxDurationSec: 0,
    },
  },

  // ── Deepgram ───────────────────────────────────────────────────────────
  {
    id: 'nova-3',
    name: 'Deepgram Nova 3',
    description: 'Deepgram Nova 3. Fast and accurate with word-level timestamps and diarization.',
    ...deepgramBase,
    released: '2025-01',
    cost: { type: 'per-second', perSecond: 0.0000717 }, // $0.0043/min
    features: {
      wordTimestamps: true,
      diarization: true,
      languageDetection: true,
      languageHint: true,
      inputFormats: commonInputFormats,
      maxDurationSec: 0,
    },
  },

  // ── Groq ───────────────────────────────────────────────────────────────
  {
    id: 'whisper-large-v3',
    name: 'Whisper Large v3 (Groq)',
    description: 'Whisper large-v3 on Groq. Extremely fast inference with word-level timestamps.',
    ...groqBase,
    released: '2024-01',
    cost: { type: 'per-second', perSecond: 0.00000185 }, // $0.000111/min
    features: {
      wordTimestamps: true,
      diarization: false,
      languageDetection: true,
      languageHint: true,
      inputFormats: commonInputFormats,
      maxDurationSec: 7200,
    },
  },
  {
    id: 'whisper-large-v3-turbo',
    name: 'Whisper Large v3 Turbo (Groq)',
    description: 'Whisper large-v3-turbo on Groq. Faster variant with slightly less accuracy.',
    ...groqBase,
    released: '2024-06',
    cost: { type: 'per-second', perSecond: 0.000000667 }, // $0.00004/min
    features: {
      wordTimestamps: true,
      diarization: false,
      languageDetection: true,
      languageHint: true,
      inputFormats: commonInputFormats,
      maxDurationSec: 7200,
    },
  },
  {
    id: 'distil-whisper-large-v3-en',
    name: 'Distil Whisper Large v3 EN (Groq)',
    description: 'Distilled English-only Whisper on Groq. Cheapest option, English only.',
    ...groqBase,
    released: '2024-01',
    cost: { type: 'per-second', perSecond: 0.000000333 }, // $0.00002/min
    features: {
      wordTimestamps: true,
      diarization: false,
      languageDetection: false,
      languageHint: false,
      inputFormats: commonInputFormats,
      maxDurationSec: 7200,
    },
  },

  // ── Cartesia ───────────────────────────────────────────────────────────
  // Pricing: 1 credit per 2 seconds of audio on /stt batch endpoint.
  // At Startup plan ($49/1.25M credits) ≈ $0.00002/sec.
  {
    id: 'ink-whisper',
    name: 'Cartesia Ink Whisper',
    description: 'Cartesia batch STT. Word-level timestamps, 99+ languages. Based on Whisper.',
    ...cartesiaBase,
    released: '2026-01',
    cost: { type: 'per-second', perSecond: 0.00002 },
    features: {
      wordTimestamps: true,
      diarization: false,
      languageDetection: false,
      languageHint: true,
      inputFormats: ['mp3', 'mp4', 'm4a', 'wav', 'webm', 'ogg', 'flac'],
      maxDurationSec: 0,
    },
  },
]

// ─── lookup helpers ──────────────────────────────────────────────────────────

export function findTranscriptionModel(modelId: string): TranscriptionModelEntry | undefined {
  return TRANSCRIPTION_CATALOG.find((m) => m.id === modelId)
}
