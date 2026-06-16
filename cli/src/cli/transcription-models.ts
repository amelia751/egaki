// Transcription model registry for egaki.
// Maps transcription model IDs to their provider and SDK factory. Follows the
// same pattern as speech-models.ts: PROVIDER_SDKS descriptor map with lazy
// imports, auth source detection, and key validation.
//
// Provider resolution priority (same as speech):
//   1. Direct provider key → direct SDK
//   2. No key → error with instructions
import type { TranscriptionModel } from 'ai'
import pc from 'picocolors'
import {
  PROVIDERS,
  injectCredentialsToEnv,
} from './credentials.js'
import { ValidationError } from './models.js'
import {
  TRANSCRIPTION_CATALOG,
  findTranscriptionModel,
  type TranscriptionModelEntry,
} from './transcription-catalog.js'

export { type TranscriptionModelEntry }

export const TRANSCRIPTION_MODELS = TRANSCRIPTION_CATALOG.map((m) => m.id) as [string, ...string[]]
export const DEFAULT_TRANSCRIPTION_MODEL = 'whisper-1'

// ─── provider SDK descriptor map ─────────────────────────────────────────────

type TranscriptionProviderSdk = {
  transcription: (modelId: string) => Promise<Error | TranscriptionModel>
}

const TRANSCRIPTION_PROVIDER_SDKS: Record<string, TranscriptionProviderSdk> = {
  openai: {
    transcription: async (id) => {
      const { openai } = await import('@ai-sdk/openai')
      return openai.transcription(id)
    },
  },
  elevenlabs: {
    transcription: async (id) => {
      const { elevenlabs } = await import('@ai-sdk/elevenlabs')
      return elevenlabs.transcription(id)
    },
  },
  deepgram: {
    transcription: async (id) => {
      const { deepgram } = await import('@ai-sdk/deepgram')
      return deepgram.transcription(id)
    },
  },
  groq: {
    transcription: async (id) => {
      const { groq } = await import('@ai-sdk/groq')
      return groq.transcription(id)
    },
  },
}

// ─── key checking ────────────────────────────────────────────────────────────

function hasDirectProviderKey(providerName: string): boolean {
  const info = PROVIDERS[providerName]
  if (!info) return false
  return Boolean(process.env[info.envVar])
}

// ─── config lookup ───────────────────────────────────────────────────────────

export function getTranscriptionModelConfig(modelId: string): Error | TranscriptionModelEntry {
  const entry = findTranscriptionModel(modelId)
  if (!entry) {
    return new ValidationError(`Unknown transcription model: ${modelId}`)
  }
  return entry
}

// ─── auth source detection ───────────────────────────────────────────────────

type AuthSource =
  | { type: 'api-key'; label: string }

function resolveAuthSource(providerName: string): AuthSource {
  const info = PROVIDERS[providerName]
  if (info && process.env[info.envVar]) {
    return { type: 'api-key', label: info.envVar }
  }
  return { type: 'api-key', label: 'unknown' }
}

function logAuthSource(source: AuthSource): void {
  console.error(pc.dim(`Auth: ${source.label}`))
}

// ─── ensure key ──────────────────────────────────────────────────────────────

export function ensureTranscriptionProviderKey(providerName: string): Error | undefined {
  if (hasDirectProviderKey(providerName)) return undefined

  const info = PROVIDERS[providerName]
  const label = info?.label || providerName
  return new ValidationError(
    `Missing API key for ${label}. ` +
    `Run: egaki login --provider ${providerName} --key <key>. ` +
    (info ? info.hint : ''),
  )
}

// ─── public factory ──────────────────────────────────────────────────────────

export async function createTranscriptionModel(modelId: string): Promise<Error | TranscriptionModel> {
  injectCredentialsToEnv()

  const config = getTranscriptionModelConfig(modelId)
  if (config instanceof Error) return config

  const keyError = ensureTranscriptionProviderKey(config.provider)
  if (keyError) return keyError

  const authSource = resolveAuthSource(config.provider)
  logAuthSource(authSource)

  const factory = TRANSCRIPTION_PROVIDER_SDKS[config.provider]
  if (!factory) {
    return new Error(`Transcription is not supported for provider: ${config.provider}`)
  }

  return factory.transcription(modelId)
}
