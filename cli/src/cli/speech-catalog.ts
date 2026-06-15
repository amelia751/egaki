// Speech model catalog — single source of truth for all TTS models.
// Mirrors the image/video catalog pattern: every model's provider, pricing,
// features, and default voices live here. Other modules derive their data
// from this catalog.
//
// Pricing sources:
//   OpenAI:      https://platform.openai.com/docs/pricing (per 1M characters)
//   ElevenLabs:  https://elevenlabs.io/pricing (per 1K characters, varies by plan)
//   Cartesia:    https://cartesia.ai/pricing (plan-based, ~1 credit per character)

import type { ProviderOption } from './model-catalog.js'

// ─── cost types ──────────────────────────────────────────────────────────────

export type PerCharacterCost = {
  type: 'per-character'
  /** USD per 1 million characters */
  perMillionChars: number
}

export type SpeechModelCost = PerCharacterCost

// ─── feature types ───────────────────────────────────────────────────────────

export type SpeechModelFeatures = {
  /** Supported output audio formats */
  outputFormats: string[]
  /** Whether the model supports voice instructions / style prompts */
  instructions: boolean
  /** Whether speed control is supported */
  speed: boolean
  /** Whether language selection is supported */
  language: boolean
  /** Max input characters per request (0 = unknown/unlimited) */
  maxChars: number
  /** Built-in voice names (not exhaustive for providers with voice libraries) */
  defaultVoices: string[]
}

// ─── entry type ──────────────────────────────────────────────────────────────

export type SpeechModelEntry = {
  id: string
  name: string
  description?: string
  provider: string
  strategy: 'speech'
  released: string
  cost: SpeechModelCost
  features: SpeechModelFeatures
  providerOptions?: ProviderOption[]
}

// ─── shared fragments ────────────────────────────────────────────────────────

const openaiSpeechBase = {
  provider: 'openai',
  strategy: 'speech' as const,
}

const elevenlabsSpeechBase = {
  provider: 'elevenlabs',
  strategy: 'speech' as const,
}

const cartesiaSpeechBase = {
  provider: 'cartesia',
  strategy: 'speech' as const,
}

// ─── catalog ─────────────────────────────────────────────────────────────────

export const SPEECH_CATALOG: SpeechModelEntry[] = [
  // ── OpenAI ─────────────────────────────────────────────────────────────
  {
    id: 'tts-1',
    name: 'TTS-1 (Standard)',
    description: 'OpenAI standard text-to-speech. Low latency, good for real-time use.',
    ...openaiSpeechBase,
    released: '2023-11',
    cost: { type: 'per-character', perMillionChars: 15 },
    features: {
      outputFormats: ['mp3', 'opus', 'aac', 'flac', 'wav', 'pcm'],
      instructions: false,
      speed: true,
      language: false,
      maxChars: 4096,
      defaultVoices: ['alloy', 'ash', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer'],
    },
  },
  {
    id: 'tts-1-hd',
    name: 'TTS-1 HD',
    description: 'OpenAI high-definition text-to-speech. Higher fidelity audio.',
    ...openaiSpeechBase,
    released: '2023-11',
    cost: { type: 'per-character', perMillionChars: 30 },
    features: {
      outputFormats: ['mp3', 'opus', 'aac', 'flac', 'wav', 'pcm'],
      instructions: false,
      speed: true,
      language: false,
      maxChars: 4096,
      defaultVoices: ['alloy', 'ash', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer'],
    },
  },
  {
    id: 'gpt-4o-mini-tts',
    name: 'GPT-4o Mini TTS',
    description:
      'OpenAI GPT-4o Mini with text-to-speech. Supports style instructions ' +
      'for expressive speech control.',
    ...openaiSpeechBase,
    released: '2025-03',
    cost: { type: 'per-character', perMillionChars: 12 },
    features: {
      outputFormats: ['mp3', 'opus', 'aac', 'flac', 'wav', 'pcm'],
      instructions: true,
      speed: true,
      language: false,
      maxChars: 2000,
      defaultVoices: [
        'alloy', 'ash', 'ballad', 'cedar', 'coral', 'echo',
        'fable', 'marin', 'nova', 'onyx', 'sage', 'shimmer', 'verse',
      ],
    },
  },

  // ── ElevenLabs ─────────────────────────────────────────────────────────
  {
    id: 'eleven_v3',
    name: 'ElevenLabs v3',
    description: 'Latest ElevenLabs model with best quality and expressiveness.',
    ...elevenlabsSpeechBase,
    released: '2025-06',
    cost: { type: 'per-character', perMillionChars: 100 },
    features: {
      outputFormats: ['mp3_44100_128', 'mp3_22050_32', 'pcm_16000', 'pcm_22050', 'pcm_24000', 'pcm_44100', 'ulaw_8000'],
      instructions: false,
      speed: false,
      language: true,
      maxChars: 0,
      defaultVoices: [],
    },
  },
  {
    id: 'eleven_multilingual_v2',
    name: 'ElevenLabs Multilingual v2',
    description: 'ElevenLabs multilingual model. Supports 29 languages.',
    ...elevenlabsSpeechBase,
    released: '2024-01',
    cost: { type: 'per-character', perMillionChars: 100 },
    features: {
      outputFormats: ['mp3_44100_128', 'mp3_22050_32', 'pcm_16000', 'pcm_22050', 'pcm_24000', 'pcm_44100', 'ulaw_8000'],
      instructions: false,
      speed: false,
      language: true,
      maxChars: 0,
      defaultVoices: [],
    },
  },
  {
    id: 'eleven_flash_v2_5',
    name: 'ElevenLabs Flash v2.5',
    description: 'ElevenLabs low-latency model optimized for speed.',
    ...elevenlabsSpeechBase,
    released: '2024-08',
    cost: { type: 'per-character', perMillionChars: 50 },
    features: {
      outputFormats: ['mp3_44100_128', 'mp3_22050_32', 'pcm_16000', 'pcm_22050', 'pcm_24000', 'pcm_44100', 'ulaw_8000'],
      instructions: false,
      speed: false,
      language: true,
      maxChars: 0,
      defaultVoices: [],
    },
  },
  {
    id: 'eleven_turbo_v2_5',
    name: 'ElevenLabs Turbo v2.5',
    description: 'ElevenLabs turbo model. Balanced quality and speed.',
    ...elevenlabsSpeechBase,
    released: '2024-06',
    cost: { type: 'per-character', perMillionChars: 50 },
    features: {
      outputFormats: ['mp3_44100_128', 'mp3_22050_32', 'pcm_16000', 'pcm_22050', 'pcm_24000', 'pcm_44100', 'ulaw_8000'],
      instructions: false,
      speed: false,
      language: true,
      maxChars: 0,
      defaultVoices: [],
    },
  },


  // ── Cartesia ───────────────────────────────────────────────────────────
  // Pricing is plan-based (~1 credit per character). The per-million rate
  // below is estimated from the Startup plan ($49/1.25M credits ≈ $39/M).
  // See https://cartesia.ai/pricing for current plans.
  {
    id: 'sonic-3.5',
    name: 'Cartesia Sonic 3.5',
    description:
      'Fastest, most natural Cartesia TTS. #1 for naturalness, sub-90ms latency, ' +
      '42 languages. Recommended for production.',
    ...cartesiaSpeechBase,
    released: '2026-05',
    cost: { type: 'per-character', perMillionChars: 39 },
    features: {
      outputFormats: ['mp3', 'wav', 'raw'],
      instructions: false,
      speed: true,
      language: true,
      maxChars: 0,
      defaultVoices: [
        'f786b574-daa5-4673-aa0c-cbe3e8534c02', // Katie (en-US Female)
        'db6b0ed5-d5d3-463d-ae85-518a07d3c2b4', // Skylar (en-US Female)
        'a5136bf9-224c-4d76-b823-52bd5efcffcc', // Jameson (en-US Male)
        '62ae83ad-4f6a-430b-af41-a9bede9286ca', // Gemma (en-GB Female)
        'ef191366-f52f-447a-a398-ed8c0f2943a1', // Archie (en-GB Male)
      ],
    },
  },
  {
    id: 'sonic-3',
    name: 'Cartesia Sonic 3',
    description:
      'Previous generation Cartesia TTS. Still high quality with pronunciation ' +
      'dictionaries support.',
    ...cartesiaSpeechBase,
    released: '2025-01',
    cost: { type: 'per-character', perMillionChars: 39 },
    features: {
      outputFormats: ['mp3', 'wav', 'raw'],
      instructions: false,
      speed: true,
      language: true,
      maxChars: 0,
      defaultVoices: [
        'f786b574-daa5-4673-aa0c-cbe3e8534c02', // Katie (en-US Female)
        'db6b0ed5-d5d3-463d-ae85-518a07d3c2b4', // Skylar (en-US Female)
        'a5136bf9-224c-4d76-b823-52bd5efcffcc', // Jameson (en-US Male)
      ],
    },
  },

]

// ─── lookup helpers ──────────────────────────────────────────────────────────

export function findSpeechModel(modelId: string): SpeechModelEntry | undefined {
  return SPEECH_CATALOG.find((m) => m.id === modelId)
}
