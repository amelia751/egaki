// Speech model registry for egaki.
// Maps speech model IDs to their provider and SpeechProvider factory.
//
// Provider resolution priority (same as image/video):
//   1. Direct provider key → direct provider implementation
//   2. Egaki API key → route through egaki gateway (future)
//   3. No key → error with subscription recommendation
import pc from 'picocolors'
import type { SpeechProvider } from './speech-generate.js'
import {
  PROVIDERS,
  injectCredentialsToEnv,
} from './credentials.js'
import { ValidationError } from './models.js'
import {
  SPEECH_CATALOG,
  findSpeechModel,
  type SpeechModelEntry,
} from './speech-catalog.js'

export { type SpeechModelEntry }

export const DEFAULT_SPEECH_MODEL = 'tts-1'

// ─── provider factory map ────────────────────────────────────────────────────

type SpeechProviderFactory = () => Promise<SpeechProvider>

const SPEECH_PROVIDER_FACTORIES: Record<string, SpeechProviderFactory> = {
  openai: async () => {
    const { createOpenAISpeechProvider } = await import('./openai-speech-provider.js')
    return createOpenAISpeechProvider()
  },
  elevenlabs: async () => {
    const { createElevenLabsSpeechProvider } = await import('./elevenlabs-speech-provider.js')
    return createElevenLabsSpeechProvider()
  },
  cartesia: async () => {
    const { createCartesiaSpeechProvider } = await import('./cartesia-provider.js')
    return createCartesiaSpeechProvider()
  },
}

// ─── key checking ────────────────────────────────────────────────────────────

function hasDirectProviderKey(providerName: string): boolean {
  const info = PROVIDERS[providerName]
  if (!info) return false
  return Boolean(process.env[info.envVar])
}

function hasEgakiKey(): boolean {
  const info = PROVIDERS['egaki']
  if (!info) return false
  return Boolean(process.env[info.envVar])
}

// ─── config lookup ───────────────────────────────────────────────────────────

export function getSpeechModelConfig(modelId: string): Error | SpeechModelEntry {
  const entry = findSpeechModel(modelId)
  if (!entry) {
    return new ValidationError(`Unknown speech model: ${modelId}`)
  }
  return entry
}

// ─── auth source detection ───────────────────────────────────────────────────

type AuthSource =
  | { type: 'api-key'; label: string }
  | { type: 'egaki-gateway' }

function resolveAuthSource(providerName: string): AuthSource {
  const info = PROVIDERS[providerName]
  if (info && process.env[info.envVar]) {
    return { type: 'api-key', label: info.envVar }
  }
  if (hasEgakiKey()) {
    return { type: 'egaki-gateway' }
  }
  return { type: 'api-key', label: 'unknown' }
}

function logAuthSource(source: AuthSource): void {
  switch (source.type) {
    case 'api-key':
      console.error(pc.dim(`Auth: ${source.label}`))
      break
    case 'egaki-gateway':
      console.error(pc.dim('Auth: Egaki subscription (gateway)'))
      break
  }
}

// ─── ensure key ──────────────────────────────────────────────────────────────

export function ensureSpeechProviderKey(providerName: string): Error | undefined {
  if (hasDirectProviderKey(providerName)) return undefined

  // Speech models don't go through the gateway yet (AI Gateway doesn't
  // support speech routing). Direct provider key is required.
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
const providerCache: Map<string, Promise<SpeechProvider>> =
  (globalThis as any).__egakiSpeechProviderCache ??= new Map()

// ─── public factory ──────────────────────────────────────────────────────────

export function getSpeechProvider(providerName: string): Error | SpeechProvider {
  injectCredentialsToEnv()

  const keyError = ensureSpeechProviderKey(providerName)
  if (keyError) return keyError

  const authSource = resolveAuthSource(providerName)
  logAuthSource(authSource)

  const factory = SPEECH_PROVIDER_FACTORIES[providerName]
  if (!factory) {
    return new Error(`Speech generation is not supported for provider: ${providerName}`)
  }

  // Return a lazy provider: the factory is async but we want getSpeechProvider
  // to be sync for ergonomic use in generateSpeechUncached. The provider promise
  // is cached globally per provider name so the factory runs once across all calls.
  return {
    async generate(options) {
      const cached = providerCache.get(providerName)
      if (cached) return (await cached).generate(options)
      const promise = factory()
      providerCache.set(providerName, promise)
      return (await promise).generate(options)
    },
  }
}
