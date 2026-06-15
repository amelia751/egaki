// Speech model registry for egaki.
// Maps speech model IDs to their provider and SDK factory. Follows the same
// pattern as models.ts for image/video: PROVIDER_SDKS descriptor map with
// lazy imports, auth source detection, and gateway fallback.
//
// Provider resolution priority (same as image/video):
//   1. Direct provider key → direct SDK
//   2. Egaki API key → route through egaki gateway (future)
//   3. No key → error with subscription recommendation
import type { SpeechModel } from 'ai'
import pc from 'picocolors'
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

export const SPEECH_MODELS = SPEECH_CATALOG.map((m) => m.id) as [string, ...string[]]
export const DEFAULT_SPEECH_MODEL = 'tts-1'

// ─── provider SDK descriptor map ─────────────────────────────────────────────

type SpeechProviderSdk = {
  speech: (modelId: string) => Promise<Error | SpeechModel>
}

const SPEECH_PROVIDER_SDKS: Record<string, SpeechProviderSdk> = {
  openai: {
    speech: async (id) => {
      const { openai } = await import('@ai-sdk/openai')
      return openai.speech(id)
    },
  },
  elevenlabs: {
    speech: async (id) => {
      const { elevenlabs } = await import('@ai-sdk/elevenlabs')
      return elevenlabs.speech(id)
    },
  },
  cartesia: {
    speech: async (id) => {
      const { createCartesiaSpeechModel } = await import('./cartesia-provider.js')
      return createCartesiaSpeechModel(id)
    },
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

// ─── public factory ──────────────────────────────────────────────────────────

export async function createSpeechModel(modelId: string): Promise<Error | SpeechModel> {
  injectCredentialsToEnv()

  const config = getSpeechModelConfig(modelId)
  if (config instanceof Error) return config

  const keyError = ensureSpeechProviderKey(config.provider)
  if (keyError) return keyError

  const authSource = resolveAuthSource(config.provider)
  logAuthSource(authSource)

  const factory = SPEECH_PROVIDER_SDKS[config.provider]
  if (!factory) {
    return new Error(`Speech generation is not supported for provider: ${config.provider}`)
  }

  return factory.speech(modelId)
}
