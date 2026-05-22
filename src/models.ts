// Model registry for egaki.
// Maps model IDs to their provider and generation strategy. The enum of
// supported models is derived from this registry so there's a single source
// of truth for both CLI validation and runtime provider resolution.
//
// Provider SDK factories are stored in a descriptor map (PROVIDER_SDKS) so
// adding a new provider is one map entry instead of touching 3 switch blocks.
//
// Provider resolution priority:
//   1. Provider-specific key (e.g. GOOGLE_GENERATIVE_AI_API_KEY) → direct SDK
//   2. Egaki API key (EGAKI_API_KEY) → route through egaki gateway
//   3. No key → error with subscription recommendation
import type { ImageModel, LanguageModel } from 'ai'
import pc from 'picocolors'
import { PROVIDERS, EGAKI_GATEWAY_URL, shouldUseChatGptBackend } from './credentials.js'
import {
  CATALOG,
  VIDEO_CATALOG,
  findModel,
  findVideoModel,
  findAnyModel,
  type ImageModelEntry,
  type VideoModelEntry,
  type AnyModelEntry,
} from './model-catalog.js'

export type { ImageModelEntry, VideoModelEntry, AnyModelEntry }
/** @deprecated Use ImageModelEntry instead */
export type ModelEntry = ImageModelEntry

export const IMAGE_MODELS = CATALOG.map((m) => m.id) as [string, ...string[]]
export const VIDEO_MODELS = VIDEO_CATALOG.map((m) => m.id) as [string, ...string[]]

/**
 * Strip provider prefix from a model ID (e.g. "vertex/imagen-4.0-generate-001" → "imagen-4.0-generate-001").
 * Provider SDKs expect bare model IDs, but the catalog uses prefixed IDs for routing.
 */
function stripProviderPrefix(modelId: string): string {
  const slash = modelId.indexOf('/')
  if (slash === -1) return modelId
  return modelId.slice(slash + 1)
}

export const DEFAULT_MODEL = 'nano-banana-pro-preview'
export const DEFAULT_VIDEO_MODEL = 'veo-3.1-fast-generate-001'

export function getModelConfig(modelId: string): AnyModelEntry {
  const entry = findAnyModel(modelId)
  if (!entry) {
    console.error(pc.red(`Unknown model: ${modelId}`))
    process.exit(1)
  }
  return entry
}

// ─── provider SDK descriptor map ─────────────────────────────────────────────
// Each provider declares which model factories it supports. Lazy imports keep
// unused provider SDKs out of the startup path.
//
// To add a new provider:
//   1. Add an entry here with the relevant factory functions.
//   2. Add models to CATALOG/VIDEO_CATALOG in model-catalog.ts.
//   3. Add a PROVIDERS entry in credentials.ts for the env var / login hint.
// That's it — no switch statements to touch.

type ProviderSdk = {
  image?: (modelId: string) => Promise<ImageModel>
  text?: (modelId: string) => Promise<LanguageModel>
  video?: (modelId: string) => Promise<any>
}

const PROVIDER_SDKS: Record<string, ProviderSdk> = {
  google: {
    image: async (id) => (await import('@ai-sdk/google')).google.image(id),
    text: async (id) => (await import('@ai-sdk/google')).google(id),
    video: async (id) => (await import('@ai-sdk/google')).google.video(id),
  },
  vertex: {
    image: async (id) => (await import('@ai-sdk/google-vertex')).vertex.image(id),
    text: async (id) => (await import('@ai-sdk/google-vertex')).vertex(id),
    video: async (id) => (await import('@ai-sdk/google-vertex')).vertex.video(id),
  },
  openai: {
    image: async (id) => (await import('@ai-sdk/openai')).openai.image(id),
  },
  replicate: {
    image: async (id) => (await import('@ai-sdk/replicate')).replicate.image(id),
  },
  fal: {
    image: async (id) => (await import('@ai-sdk/fal')).fal.image(id),
    video: async (id) => (await import('@ai-sdk/fal')).fal.video(id),
  },
  // Providers routed exclusively through the egaki gateway (no direct SDK).
  // They only need catalog entries and gateway routing, no local SDK factory.
  // bfl, recraft, xai, klingai, alibaba — all handled by the gateway fallback.
}

// ─── key checking ────────────────────────────────────────────────────────────

function hasEgakiKey(): boolean {
  const info = PROVIDERS['egaki']
  if (!info) return false
  return Boolean(process.env[info.envVar])
}

function hasDirectProviderKey(providerName: string): boolean {
  const info = PROVIDERS[providerName]
  if (!info) return false
  return Boolean(process.env[info.envVar])
}

// Check that the provider's API key is available before making API calls.
// Prints a user-friendly error with instructions on how to configure it.
// Prioritizes egaki subscription over individual provider keys.
export function ensureProviderKey(providerName: string): void {
  if (hasDirectProviderKey(providerName)) return

  // Vertex models require a direct key — the upstream Vercel AI Gateway
  // does not support vertex/ routing, so egaki gateway can't proxy them.
  if (providerName === 'vertex') {
    console.error('')
    console.error(pc.red(pc.bold('Vertex models require a direct Google Cloud API key')))
    console.error('')
    console.error(`  ${pc.cyan('egaki login --provider vertex --key <key>')}`)
    console.error('')
    console.error(pc.dim('Get a key at https://console.cloud.google.com/apis/credentials'))
    console.error(pc.dim('Egaki subscription does not cover Vertex routing yet.'))
    console.error('')
    process.exit(1)
  }

  if (hasEgakiKey()) return

  const info = PROVIDERS[providerName]

  console.error('')
  console.error(pc.red(pc.bold(`Missing API key for ${info?.label || providerName}`)))
  console.error('')
  console.error(`  ${pc.bold('Recommended:')} Use Egaki subscription (all models, one key)`)
  console.error('')
  console.error(
    `    ${pc.cyan('egaki subscribe')}                        get started in 30 seconds`,
  )
  console.error('')
  console.error(`  ${pc.dim('Or configure a provider key directly:')}`)
  console.error('')
  console.error(
    `    ${pc.cyan('egaki login')}                           interactive setup`,
  )
  if (info) {
    console.error(
      `    ${pc.cyan(`${info.envVar}=...`)} egaki image ...   inline env var`,
    )
    console.error(
      `    ${pc.cyan(`egaki login --provider ${providerName} --key <key>`)}`,
    )
    console.error('')
    console.error(`  ${pc.dim(info.hint)}`)
  }
  console.error('')
  process.exit(1)
}

// ─── gateway model factories ─────────────────────────────────────────────────

async function createGatewayImageModel(modelId: string, provider: string): Promise<ImageModel> {
  const { createGateway } = await import('ai')
  const gateway = createGateway({
    apiKey: process.env['EGAKI_API_KEY']!,
    baseURL: EGAKI_GATEWAY_URL,
  })
  const bareId = stripProviderPrefix(modelId)
  return gateway.image(`${provider}/${bareId}`)
}

async function createGatewayTextModel(modelId: string, provider: string): Promise<LanguageModel> {
  const { createGateway } = await import('ai')
  const gateway = createGateway({
    apiKey: process.env['EGAKI_API_KEY']!,
    baseURL: EGAKI_GATEWAY_URL,
  })
  const bareId = stripProviderPrefix(modelId)
  return gateway(`${provider}/${bareId}`)
}

async function createGatewayVideoModel(modelId: string, provider: string) {
  const { createGateway } = await import('ai')
  const gateway = createGateway({
    apiKey: process.env['EGAKI_API_KEY']!,
    baseURL: EGAKI_GATEWAY_URL,
  })
  const bareId = stripProviderPrefix(modelId)
  return gateway.video(`${provider}/${bareId}`)
}

// ─── ChatGPT OAuth routing ───────────────────────────────────────────────────

/**
 * ChatGPT OAuth image generation goes through the Codex backend instead of the
 * OpenAI Image API, so OpenAI image models need the custom responses path.
 */
export function shouldUseResponsesApi(modelId: string): boolean {
  const config = findModel(modelId)
  if (!config) return false
  return config.provider === 'openai' && config.strategy === 'image' && shouldUseChatGptBackend()
}

// ─── public model factories ──────────────────────────────────────────────────
// Priority: direct provider key > egaki gateway > error.
// Uses PROVIDER_SDKS map for direct provider creation, eliminating switch blocks.

export async function createImageModel(modelId: string): Promise<ImageModel> {
  const config = getModelConfig(modelId)
  ensureProviderKey(config.provider)

  if (hasDirectProviderKey(config.provider)) {
    const factory = PROVIDER_SDKS[config.provider]?.image
    if (factory) {
      return factory(stripProviderPrefix(modelId))
    }
  }

  if (hasEgakiKey()) {
    return createGatewayImageModel(modelId, config.provider)
  }

  console.error(pc.red(`No API key available for provider: ${config.provider}`))
  process.exit(1)
}

export async function createTextModel(modelId: string): Promise<LanguageModel> {
  const config = getModelConfig(modelId)
  if (config.strategy !== 'text') {
    console.error(pc.red(`Model ${modelId} is not a text model`))
    process.exit(1)
  }
  ensureProviderKey(config.provider)

  if (hasDirectProviderKey(config.provider)) {
    const factory = PROVIDER_SDKS[config.provider]?.text
    if (factory) {
      return factory(stripProviderPrefix(modelId))
    }
    console.error(
      pc.red(
        `Text+image generation is not supported for provider: ${config.provider}`,
      ),
    )
    process.exit(1)
  }

  if (hasEgakiKey()) {
    return createGatewayTextModel(modelId, config.provider)
  }

  console.error(pc.red(`No API key available for provider: ${config.provider}`))
  process.exit(1)
}

export async function createVideoModel(modelId: string): Promise<any> {
  const config = getModelConfig(modelId)
  if (config.strategy !== 'video') {
    console.error(pc.red(`Model ${modelId} is not a video model`))
    process.exit(1)
  }

  ensureProviderKey(config.provider)

  if (hasDirectProviderKey(config.provider)) {
    const factory = PROVIDER_SDKS[config.provider]?.video
    if (factory) {
      return factory(stripProviderPrefix(modelId))
    }
    console.error(
      pc.red(
        `Direct video generation is not supported for provider: ${config.provider}. Use an egaki subscription instead.`,
      ),
    )
    process.exit(1)
  }

  if (hasEgakiKey()) {
    return createGatewayVideoModel(modelId, config.provider)
  }

  console.error(pc.red(`No API key available for provider: ${config.provider}`))
  process.exit(1)
}
