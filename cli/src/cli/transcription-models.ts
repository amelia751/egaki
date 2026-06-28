// Transcription model registry for egaki.
// Maps transcription model IDs to their provider and direct HTTP provider factory.
// Follows the same pattern as speech-models.ts: provider factory map with lazy
// imports, auth source detection, and key validation.
//
// No AI SDK dependency — all providers use direct HTTP calls via
// TranscriptionProvider implementations in transcription-providers.ts.
import pc from 'picocolors'
import type { TranscriptionProvider } from './transcription-providers.js'
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

// ─── provider factory map ────────────────────────────────────────────────────

type TranscriptionProviderFactory = () => Promise<TranscriptionProvider>

const TRANSCRIPTION_PROVIDER_FACTORIES: Record<string, TranscriptionProviderFactory> = {
  openai: async () => {
    const { createOpenAITranscriptionProvider } = await import('./transcription-providers.js')
    return createOpenAITranscriptionProvider()
  },
  elevenlabs: async () => {
    const { createElevenLabsTranscriptionProvider } = await import('./transcription-providers.js')
    return createElevenLabsTranscriptionProvider()
  },
  deepgram: async () => {
    const { createDeepgramTranscriptionProvider } = await import('./transcription-providers.js')
    return createDeepgramTranscriptionProvider()
  },
  groq: async () => {
    const { createGroqTranscriptionProvider } = await import('./transcription-providers.js')
    return createGroqTranscriptionProvider()
  },
  cartesia: async () => {
    const { createCartesiaTranscriptionProvider } = await import('./transcription-providers.js')
    return createCartesiaTranscriptionProvider()
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

// ─── provider cache ──────────────────────────────────────────────────────────

/** Global cache of provider instances, keyed by provider name. */
const providerCache: Map<string, Promise<TranscriptionProvider>> =
  (globalThis as any).__egakiTranscriptionProviderCache ??= new Map()

// ─── public factory ──────────────────────────────────────────────────────────

export function getTranscriptionProvider(providerName: string): Error | TranscriptionProvider {
  injectCredentialsToEnv()

  const keyError = ensureTranscriptionProviderKey(providerName)
  if (keyError) return keyError

  const authSource = resolveAuthSource(providerName)
  logAuthSource(authSource)

  const factory = TRANSCRIPTION_PROVIDER_FACTORIES[providerName]
  if (!factory) {
    return new Error(`Transcription is not supported for provider: ${providerName}`)
  }

  // Return a lazy provider: the factory is async but we want getTranscriptionProvider
  // to be sync for ergonomic use in transcribeAudioUncached. The provider promise
  // is cached globally per provider name so the factory runs once across all calls.
  return {
    async transcribe(options) {
      const cached = providerCache.get(providerName)
      if (cached) return (await cached).transcribe(options)
      const promise = factory()
      providerCache.set(providerName, promise)
      return (await promise).transcribe(options)
    },
  }
}
