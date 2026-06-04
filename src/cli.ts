#!/usr/bin/env node
// Main CLI entrypoint for egaki - AI image and video generation.
// Uses the Vercel AI SDK for image generation across multiple providers.
// Designed to be called by agents and humans alike.
//
// Two generation paths depending on model:
//   - imagen-* models → generateImage() with google.image()
//   - all other models → generateText() with responseModalities: ['IMAGE']
// The CLI auto-detects which path to use based on model ID prefix.
import { goke } from 'goke'
import { z } from 'zod'
import dedent from 'string-dedent'
import {
  APICallError,
  generateImage as aiGenerateImage,
  generateText,
  experimental_generateVideo as aiGenerateVideo,
  NoImageGeneratedError,
  NoVideoGeneratedError,
  RetryError,
} from 'ai'
import type { XaiImageModelOptions, XaiVideoModelOptions } from '@ai-sdk/xai'
import type { GoogleImageModelOptions, GoogleLanguageModelOptions, GoogleVideoModelOptions } from '@ai-sdk/google'
import type { GoogleVertexImageModelOptions, GoogleVertexVideoModelOptions } from '@ai-sdk/google-vertex'
import type { FalImageModelOptions, FalVideoModelOptions } from '@ai-sdk/fal'
import type { ByteDanceVideoProviderOptions } from '@ai-sdk/bytedance'
import { select, isCancel, cancel } from '@clack/prompts'
import fs from 'node:fs'
import path from 'node:path'
import pc from 'picocolors'
import { createParser, type EventSourceMessage } from 'eventsource-parser'
import pkg from '../package.json' with { type: 'json' }
import {
  injectCredentialsToEnv,
  PROVIDERS,
  getChatGptAuth,
  saveChatGptAuth,
  getKeyStatus,
} from './credentials.js'
import {
  IMAGE_MODELS,
  VIDEO_MODELS,
  DEFAULT_MODEL,
  DEFAULT_VIDEO_MODEL,
  getModelConfig,
  createImageModel,
  createTextModel,
  createVideoModel,
  shouldUseResponsesApi,
} from './models.js'
import {
  CATALOG,
  VIDEO_CATALOG,
  describeProviderValues,
} from './model-catalog.js'
import {
  loginInteractive,
  loginNonInteractive,
  showLoginStatus,
  removeLogin,
  readKeyFromStdin,
} from './login.js'
import {
  subscribeInteractive,
  subscribeNonInteractive,
  unsubscribe,
  showUsage,
} from './subscription.js'
import { getValidChatGptAuth } from './chatgpt-auth.js'

// OpenAI doesn't export a providerOptions type for image models yet (vercel/ai#12437).
// These fields are what providerOptions.openai accepts, derived from
// node_modules/@ai-sdk/openai/src/image/openai-image-model-options.ts.
// NOTE: The SDK uses camelCase keys in providerOptions, then internally maps to
// snake_case for the OpenAI API. Always use camelCase here.
type OpenAIImageProviderOptions = {
  quality?: 'standard' | 'low' | 'medium' | 'high' | 'auto'
  outputFormat?: 'png' | 'jpeg' | 'webp'
  outputCompression?: number
  size?: `${number}x${number}`
  partialImages?: number | null
  background?: 'auto' | 'opaque' | 'transparent'
}

const cli = goke('egaki')

process.title = 'egaki'

process.on('uncaughtException', (err) => {
  printErrorDetails(err)
  process.exit(1)
})

process.on('unhandledRejection', (reason) => {
  printErrorDetails(reason)
  process.exit(1)
})

// ─── login command ───────────────────────────────────────────────────────────

cli
  .command(
    'login',
    dedent`
      Configure API keys for image generation providers.
      Interactive mode: shows a provider picker and secure key input.
      Non-interactive mode: pass --provider and --key flags, or pipe key via stdin.
      Keys are saved to ~/.config/egaki/credentials.json (mode 0600).
    `,
  )
  .option(
    '-p, --provider [name]',
    z
      .string()
      .describe(
        `Provider name for non-interactive login (${Object.keys(PROVIDERS).join(', ')})`,
      ),
  )
  .option(
    '-k, --key [key]',
    z.string().describe('API key value for non-interactive login'),
  )
  .option('--show', 'Show which providers are configured and their status')
  .option(
    '--remove [provider]',
    z.string().describe('Remove the stored key for a provider'),
  )
  .example('# Interactive login (pick provider, paste key)')
  .example('egaki login')
  .example('# Non-interactive login with flags')
  .example('egaki login --provider google --key AIza...')
  .example('egaki login --provider vertex --key AIza...')
  .example('# Pipe key from stdin (useful in CI/scripts)')
  .example('echo "AIza..." | egaki login --provider google')
  .example('# Show configured providers')
  .example('egaki login --show')
  .example('# Remove a stored key')
  .example('egaki login --remove google')
  .action(async (options) => {
    if (options.show) {
      showLoginStatus()
      return
    }

    if (options.remove) {
      removeLogin(options.remove)
      return
    }

    // Non-interactive: --provider + --key or stdin
    if (options.provider) {
      // OAuth providers use browser flow — skip key reading
      if (options.provider === 'chatgpt' || options.provider === 'xai-oauth') {
        await loginNonInteractive({ provider: options.provider, key: '' })
        return
      }
      const key = options.key || (await readKeyFromStdin())
      await loginNonInteractive({ provider: options.provider, key })
      return
    }

    // Interactive mode
    await loginInteractive()
  })

// ─── subscribe command ───────────────────────────────────────────────────────

cli
  .command(
    'subscribe',
    dedent`
      Subscribe to Egaki for access to all image models with a single API key.
      You can also use your own provider keys (Google/OpenAI/Replicate/Fal)
      via 'egaki login --provider <name> --key <key>' if you prefer BYOK.
      Egaki subscription avoids managing one key per provider.
      Three plans: Starter ($9/mo, 100 credits), Pro ($29/mo, 500 credits),
      Unlimited ($99/mo, 2000 credits). One credit ≈ one standard image.
      Interactive mode: pick a plan and get a checkout URL (email prefill optional).
      Non-interactive: --email is optional and only pre-fills checkout.
    `,
  )
  .option(
    '-e, --email [email]',
    z.string().describe('Optional email prefill for checkout (skips interactive prompt)'),
  )
  .option(
    '--plan [plan]',
    z.string().describe('Plan ID: starter, pro, or unlimited (default: pro)'),
  )
  .example('# Interactive subscribe')
  .example('egaki subscribe')
  .example('# Non-interactive (for agents)')
  .example('egaki subscribe --email user@example.com --plan pro')
  .example('# Non-interactive without email prefill')
  .example('egaki subscribe --plan pro')
  .action(async (options) => {
    const isTTY = process.stdout.isTTY && process.stdin.isTTY
    if (!isTTY || options.email || options.plan) {
      subscribeNonInteractive(options.email, options.plan)
      return
    }
    await subscribeInteractive()
  })

// ─── unsubscribe command ─────────────────────────────────────────────────────

cli
  .command(
    'unsubscribe',
    dedent`
      Cancel your Egaki subscription. Uses the stored API key to identify
      the subscription. You can resubscribe anytime with 'egaki subscribe'.
    `,
  )
  .example('egaki unsubscribe')
  .action(async () => {
    await unsubscribe()
  })

// ─── usage command ───────────────────────────────────────────────────────────

cli
  .command(
    'usage',
    dedent`
      Show your current Egaki credit usage for this billing period.
      Displays plan, credits used, credits remaining, and period info.
    `,
  )
  .example('egaki usage')
  .action(async () => {
    await showUsage()
  })

// ─── image command ───────────────────────────────────────────────────────────

cli
  .command(
    'image <prompt>',
    dedent`
      Generate images from a text prompt using AI models.
      Supports Imagen models (dedicated image generation) and Gemini
      multimodal models (text+image output). The model type is auto-detected
      from the model ID: imagen-* uses the image API, everything else uses
      the text API with image output enabled.
    `,
  )
  .option(
    '-m, --model [model]',
    z.string().describe('Model ID for generation. If omitted, shows an interactive picker (or uses default in non-TTY mode)'),
  )
  .option(
    '-o, --output [path]',
    z
      .string()
      .default('egaki-output.png')
      .describe('Output file path (index suffix added when generating multiple)'),
  )
  .option(
    '-n, --count [n]',
    z.number().default(1).describe('Number of images to generate'),
  )
  .option(
    '--aspect-ratio [ratio]',
    z
      .string()
      .describe(
        'Aspect ratio for the generated image. Imagen supports: 1:1, 3:4, 4:3, 9:16, 16:9. Gemini supports additional ratios: 2:3, 3:2, 4:5, 5:4, 21:9',
      ),
  )
  .option(
    '--seed [seed]',
    z.number().describe('Seed for reproducible generation. Same seed + same prompt = same image'),
  )
  .option(
    '--image-size [size]',
    z
      .enum(['1K', '2K', '4K'])
      .describe(
        'Output resolution for Gemini text-model image generation. Only applies to gemini-*-image* models',
      ),
  )
  .option(
    '-i, --input [file]',
    z
      .array(z.string())
      .describe(
        'Reference image for editing or variations (repeatable). Accepts local file paths or URLs (http/https). Pass one or more images along with a text prompt to edit them',
      ),
  )
  .option(
    '--mask [file]',
    z
      .string()
      .describe(
        'Mask image for inpainting. Accepts a local file path or URL (http/https). White areas in the mask are replaced with generated content. Used together with --input',
      ),
  )
  .option(
    '--quality [level]',
    z
      .string()
      .describe(
        `Image quality level. ${describeProviderValues('quality', [CATALOG])}`,
      ),
  )
  .option(
    '--resolution [res]',
    z
      .string()
      .describe(
        `Output resolution. ${describeProviderValues('resolution', [CATALOG])}`,
      ),
  )
  .option(
    '--output-format [format]',
    z
      .string()
      .describe(
        `Output image format. ${describeProviderValues('output-format', [CATALOG])}`,
      ),
  )
  .option(
    '--negative-prompt [text]',
    z
      .string()
      .describe(
        'Describe what to avoid in the generated image (Fal models)',
      ),
  )
  .option(
    '--allow-people',
    'Allow generating images of people (Imagen blocks people by default)',
  )
  .option(
    '--json',
    'Output result metadata as JSON to stdout (model, usage, warnings, file paths)',
  )
  .option(
    '--stdout',
    'Write raw image bytes to stdout instead of saving to a file. Useful for piping to other tools',
  )
  .example('# Generate a simple image')
  .example('egaki image "a sunset over mars"')
  .example('# Use a specific model with aspect ratio')
  .example('egaki image "cyberpunk city at night" -m imagen-4.0-ultra-generate-001 --aspect-ratio 16:9')
  .example('# Edit an existing image')
  .example('egaki image "add a wizard hat to the cat" --input cat.jpg -o cat-wizard.png')
  .example('# Edit an image from a URL')
  .example('egaki image "make it pop art" --input https://example.com/photo.jpg')
  .example('# Inpainting with a mask')
  .example('egaki image "fill with flowers" --input photo.jpg --mask mask.png')
  .example('# Generate with Gemini multimodal at 4K')
  .example('egaki image "dreamy landscape" -m gemini-2.5-flash-image --image-size 4K')
  .example('# Route through Vertex AI (Google Cloud billing)')
  .example('egaki image "product photo on marble" -m vertex/imagen-4.0-generate-001')
  .example('# Generate multiple images')
  .example('egaki image "abstract art" -n 4 -o art.png')
  .example('# Pipe to another tool')
  .example('egaki image "logo design" --stdout | convert - -resize 512x512 logo.png')
  .action(async (prompt, options) => {
    // Inject stored API keys as env vars before calling the AI SDK.
    injectCredentialsToEnv()

    const model = options.model ?? await resolveImageModel()
    const outputPath = options.output ?? 'egaki-output.png'
    const count = options.count ?? 1
    const config = getModelConfig(model)
    const parsedAspectRatio = parseAspectRatioOption(options.aspectRatio)

    if (!options.stdout) {
      console.error(pc.dim(`Model: ${model}`))
      console.error(pc.dim(`Prompt: ${prompt}`))
    }

    const inputImages = await readInputImages(options.input)
    const maskImage = options.mask
      ? await readInputSource(options.mask)
      : undefined

    // When using ChatGPT OAuth with OpenAI image models, route through the
    // Responses API + imageGeneration tool instead of the Image API.
    // The Codex OAuth client lacks the `api.model.images.request` scope.
    const useResponsesApi = config.strategy === 'image' && shouldUseResponsesApi(model)

    if (useResponsesApi) {
      if (!options.stdout) {
        console.error(pc.dim('Mode: Responses API (ChatGPT OAuth)'))
      }
      await generateWithResponsesApi({
        prompt,
        model,
        outputPath,
        count,
        aspectRatio: parsedAspectRatio,
        seed: options.seed,
        inputImages,
        maskImage,
        json: options.json || false,
        stdout: options.stdout || false,
      })
    } else if (config.strategy === 'image') {
      await generateWithImageModel({
        prompt,
        model,
        outputPath,
        count,
        aspectRatio: parsedAspectRatio,
        seed: options.seed,
        inputImages,
        maskImage,
        allowPeople: options.allowPeople || false,
        quality: options.quality,
        resolution: options.resolution,
        outputFormat: options.outputFormat,
        negativePrompt: options.negativePrompt,
        json: options.json || false,
        stdout: options.stdout || false,
      })
    } else {
      await generateWithTextModel({
        prompt,
        model,
        outputPath,
        inputImages,
        imageSize: options.imageSize,
        aspectRatio: options.aspectRatio,
        json: options.json || false,
        stdout: options.stdout || false,
      })
    }
  })

// ─── video command ───────────────────────────────────────────────────────────

cli
  .command(
    'video <prompt>',
    dedent`
      Generate videos from a text prompt (or image+text prompt for models that
      support image-to-video). Uses AI SDK experimental_generateVideo under the hood.

      Agent note: video generation can be slow. When invoking this command from
      automation, use a command timeout of at least 5 minutes.
    `,
  )
  .option(
    '-m, --model [model]',
    z.string().describe('Video model ID for generation. If omitted, shows an interactive picker (or uses default in non-TTY mode)'),
  )
  .option(
    '-o, --output [path]',
    z
      .string()
      .default('egaki-output.mp4')
      .describe('Output file path (index suffix added when generating multiple)'),
  )
  .option(
    '-n, --count [n]',
    z.number().default(1).describe('Number of videos to generate'),
  )
  .option(
    '--aspect-ratio [ratio]',
    z.string().describe('Video aspect ratio in WIDTH:HEIGHT format (e.g. 16:9, 9:16)'),
  )
  .option(
    '--resolution [resolution]',
    z
      .string()
      .describe(`Video resolution. ${describeProviderValues('resolution', [VIDEO_CATALOG])}. Google: 720p, 1080p, 4k`),
  )
  .option(
    '--duration [seconds]',
    z.number().describe('Video duration in seconds. Veo: 4-8s. xAI Grok: 1-15s. Kling: 5-10s. Wan: 2-15s'),
  )
  .option(
    '--fps [fps]',
    z.number().describe('Frames per second for video models that support fps override'),
  )
  .option(
    '--seed [seed]',
    z.number().describe('Seed for reproducible video generation (model support varies)'),
  )
  .option(
    '-i, --input [file]',
    z
      .string()
      .describe(
        'Input file for video generation. For i2v: a reference image. For edit-video/extend-video: a source video. Accepts local file paths or URLs',
      ),
  )
  .option(
    '--mode [mode]',
    z
      .enum(['edit-video', 'extend-video', 'reference-to-video'])
      .describe(
        `Video operation mode. ${describeProviderValues('mode', [VIDEO_CATALOG])}`,
      ),
  )
  .option(
    '--reference-images [path]',
    z
      .array(z.string())
      .describe(
        'Reference images for R2V generation, repeatable. xAI: 1-7 images. Seedance: 1-9 images (use @Image1 etc. in prompt)',
      ),
  )
  .option(
    '--negative-prompt [text]',
    z
      .string()
      .describe(
        'Describe what to avoid in the generated video (Fal models)',
      ),
  )
  .option(
    '--json',
    'Output result metadata as JSON to stdout (model, usage, warnings, file paths)',
  )
  .option(
    '--stdout',
    'Write raw video bytes to stdout instead of saving to a file. Useful for piping to other tools',
  )
  .example('# Generate a video')
  .example('egaki video "A paper airplane gliding through clouds" -o airplane.mp4')
  .example('# Generate with Veo model + duration')
  .example('egaki video "cinematic rainy street at night" -m veo-3.1-fast-generate-001 --duration 6')
  .example('# Route through Vertex AI (Google Cloud billing)')
  .example('egaki video "storm over mountains" -m vertex/veo-3.1-fast-generate-001 --duration 6')
  .example('# Image-to-video (model support required)')
  .example('egaki video "animate subtle camera pan" --model luma-ray-2 --input frame.png -o animated.mp4')
  .example('# Generate multiple videos')
  .example('egaki video "waves crashing on cliffs" -n 2 -o waves.mp4')
  .action(async (prompt, options) => {
    injectCredentialsToEnv()

    const model = options.model ?? await resolveVideoModel()
    const outputPath = options.output ?? 'egaki-output.mp4'
    const count = options.count ?? 1
    const config = getModelConfig(model)

    if (config.strategy !== 'video') {
      console.error(pc.red(`Model ${model} is not a video model`))
      process.exit(1)
    }

    if (!options.stdout) {
      console.error(pc.dim(`Model: ${model}`))
      console.error(pc.dim(`Prompt: ${prompt}`))
      console.error(pc.dim('Mode: Video API (experimental_generateVideo)'))
    }

    // Determine how --input is used based on --mode:
    // - edit-video / extend-video: input is a source video, passed as videoUrl (needs URL)
    // - everything else (i2v, t2v): input is a reference image, passed as bytes
    const isVideoInputMode = options.mode === 'edit-video' || options.mode === 'extend-video'

    // Validate mode-specific required inputs
    if (isVideoInputMode && !options.input) {
      console.error(pc.red(`--input is required with --mode ${options.mode}. Pass a local video file or URL.`))
      process.exit(1)
    }
    if (options.mode === 'reference-to-video' && (!options.referenceImages || options.referenceImages.length === 0)) {
      console.error(pc.red('--reference-images is required with --mode reference-to-video. Pass 1-7 image files or URLs.'))
      process.exit(1)
    }

    let inputImage: Uint8Array | undefined
    let videoUrl: string | undefined

    if (options.input && isVideoInputMode) {
      // Upload local file or use URL directly for video editing/extension
      videoUrl = await resolveToUrl(options.input)
    } else if (options.input) {
      // Read as bytes for image-to-video
      inputImage = await readInputSource(options.input)
    }

    // Resolve --reference-images: upload local files to get URLs
    let resolvedReferenceImages = options.referenceImages
    if (resolvedReferenceImages) {
      resolvedReferenceImages = await Promise.all(
        resolvedReferenceImages.map((ref: string) => resolveToUrl(ref)),
      )
    }

    await generateWithVideoModel({
      prompt,
      model,
      outputPath,
      count,
      aspectRatio: options.aspectRatio,
      resolution: options.resolution,
      duration: options.duration,
      fps: options.fps,
      seed: options.seed,
      inputImage,
      mode: options.mode,
      videoUrl,
      referenceImages: resolvedReferenceImages,
      negativePrompt: options.negativePrompt,
      json: options.json || false,
      stdout: options.stdout || false,
    })
  })

// ─── models command ──────────────────────────────────────────────────────────

cli
  .command(
    'models',
    dedent`
      List all supported image generation models with pricing, features,
      and provider info. Output is YAML for easy reading and piping.
    `,
  )
  .option(
    '-p, --provider [provider]',
    z.string().describe('Filter models by provider name (e.g. google, openai, replicate, fal)'),
  )
  .option(
    '--type [type]',
    z
      .enum(['all', 'image', 'video'])
      .default('all')
      .describe('Filter by model type: image (image+text-image), video, or all'),
  )
  .option('--json', 'Output as JSON instead of YAML')
  .action(async (options) => {
    const yaml = await import('js-yaml')
    const providerStatuses = Object.fromEntries(
      Object.keys(PROVIDERS).map((provider) => [provider, getKeyStatus(provider)]),
    )

    let models: Array<typeof CATALOG[number] | typeof VIDEO_CATALOG[number]> =
      options.type === 'video'
        ? [...VIDEO_CATALOG]
        : options.type === 'image'
          ? [...CATALOG]
          : [...CATALOG, ...VIDEO_CATALOG]

    if (options.provider) {
      models = models.filter((m) => m.provider === options.provider)
      if (models.length === 0) {
        console.error(pc.red(`No models found for provider: ${options.provider}`))
        process.exit(1)
      }
    }

    const output = models.map((m) => ({
      id: m.id,
      name: m.name,
      ...(m.description ? { description: m.description } : {}),
      provider: m.provider,
      auth: providerStatuses[m.provider] ?? { available: false, source: 'none' },
      strategy: m.strategy,
      released: m.released,
      cost: formatCatalogCost(m.cost),
      features:
        m.strategy === 'video'
          ? {
              textToVideo: m.features.textToVideo,
              imageToVideo: m.features.imageToVideo,
              capabilities: m.features.capabilities.join(', ') || 'none',
              seed: m.features.seed,
              multipleVideos: m.features.multipleVideos,
              aspectRatios: m.features.aspectRatios?.join(', ') || 'none',
              resolutions: m.features.resolutions?.join(', ') || 'unknown',
              durationRangeSec: m.features.durationRangeSec
                ? `${m.features.durationRangeSec.min}-${m.features.durationRangeSec.max}`
                : 'unknown',
            }
          : {
              editing: m.features.editing,
              inpainting: m.features.inpainting,
              seed: m.features.seed,
              multipleImages: m.features.multipleImages,
              aspectRatios: m.features.aspectRatios.join(', ') || 'none',
              ...(m.features.sizes ? { sizes: m.features.sizes.join(', ') } : {}),
            },
    }))

    if (options.json) {
      console.log(JSON.stringify(output, null, 2))
    } else {
      console.log(yaml.dump(output, { lineWidth: 120, noRefs: true }))
    }
  })

/** Upload gateway base URL for temporary file uploads. */
const UPLOAD_GATEWAY_BASE = 'https://egaki.org'
/** Max upload size in bytes (must match gateway limit). */
const MAX_UPLOAD_SIZE = 100 * 1024 * 1024

cli.help()
cli.version(pkg.version)
await cli.parse()

// ─── error output helpers ────────────────────────────────────────────────────

type PrintableValue = unknown
type ErrorDetailsInput = Parameters<typeof APICallError.isInstance>[0]

async function runProviderCall<T>(operation: string, call: () => Promise<T>): Promise<T> {
  const result = await call().catch((error) => {
    printErrorDetails(error, operation)
    process.exit(1)
  })
  return result
}

function printErrorDetails(error: ErrorDetailsInput, operation?: string): void {
  const prefix = operation ? `${operation} failed` : 'Command failed'
  console.error(pc.red(pc.bold(prefix)))

  if (APICallError.isInstance(error)) {
    printKeyValue('name', error.name)
    printKeyValue('message', error.message)
    printKeyValue('statusCode', error.statusCode)
    printKeyValue('url', error.url)
    printKeyValue('isRetryable', error.isRetryable)
    printJsonBlock('responseBody', parseJsonLike(error.responseBody))
    printJsonBlock('responseHeaders', error.responseHeaders)
    printJsonBlock('requestBodyValues', error.requestBodyValues)
    printJsonBlock('data', error.data)
    printCause(error.cause)
    printStack(error)
    return
  }

  if (NoImageGeneratedError.isInstance(error) || NoVideoGeneratedError.isInstance(error)) {
    printKeyValue('name', error.name)
    printKeyValue('message', error.message)
    printJsonBlock('responses', error.responses)
    printCause(error.cause)
    printStack(error)
    return
  }

  if (RetryError.isInstance(error)) {
    printKeyValue('name', error.name)
    printKeyValue('message', error.message)
    printKeyValue('reason', error.reason)
    printJsonBlock('errors', error.errors.map((e) => serializeUnknown(e)))
    printCause(error.cause)
    printStack(error)
    return
  }

  if (error instanceof Error) {
    printKeyValue('name', error.name)
    printKeyValue('message', error.message)
    // @ai-sdk/xai discards statusResponse.error when status==='failed',
    // so XAI_VIDEO_GENERATION_FAILED carries no useful info. Add a hint.
    if (error.name === 'XAI_VIDEO_GENERATION_FAILED') {
      console.error(
        pc.dim(
          'hint: xAI returned status "failed" but @ai-sdk/xai discards the error details.\n' +
            'Common causes: invalid/corrupt input image, content policy violation, or transient backend error.\n' +
            'To see the real error, poll the video status endpoint manually:\n' +
            '  curl https://api.x.ai/v1/videos/<request_id> -H "Authorization: Bearer $TOKEN"',
        ),
      )
    }
    printJsonBlock('details', serializeOwnProperties(error))
    printCause(error.cause)
    printStack(error)
    return
  }

  printJsonBlock('error', serializeUnknown(error))
}

function printKeyValue(key: string, value: PrintableValue): void {
  if (value === undefined) return
  console.error(`${pc.dim(`${key}:`)} ${String(value)}`)
}

function printJsonBlock(label: string, value: PrintableValue): void {
  if (value === undefined) return
  const serialized = stableStringify(value)
  if (!serialized || serialized === '{}') return
  console.error(pc.dim(`${label}:`))
  console.error(serialized)
}

function printCause(cause: Error['cause']): void {
  if (cause === undefined) return
  console.error(pc.dim('cause:'))
  console.error(stableStringify(serializeUnknown(cause)))
}

function printStack(error: Error): void {
  if (!error.stack) return
  console.error(pc.dim('stack:'))
  console.error(pc.dim(error.stack))
}

function parseJsonLike(value?: string): PrintableValue {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function serializeUnknown(value: ErrorDetailsInput): PrintableValue {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      ...serializeOwnProperties(value),
      ...(value.cause === undefined ? {} : { cause: serializeUnknown(value.cause) }),
      ...(value.stack ? { stack: value.stack } : {}),
    }
  }
  return value
}

function serializeOwnProperties(error: Error): Record<string, PrintableValue> {
  return Object.fromEntries(
    Object.entries(error).map(([key, value]) => [key, serializeUnknown(value)]),
  )
}

function stableStringify(value: PrintableValue): string | undefined {
  const seen = new WeakSet<object>()
  return JSON.stringify(value, (_key, item) => {
    if (typeof item === 'bigint') return item.toString()
    if (item instanceof Date) return item.toISOString()
    if (typeof item !== 'object' || item === null) return item
    if (seen.has(item)) return '[Circular]'
    seen.add(item)
    return item
  }, 2)
}

// ─── interactive model pickers ──────────────────────────────────────────────

/** Curated image models shown in the interactive picker, ordered by recommendation. */
const FEATURED_IMAGE_MODELS = [
  'imagen-4.0-generate-001',
  'imagen-4.0-ultra-generate-001',
  'imagen-4.0-fast-generate-001',
  'gemini-2.5-flash-image',
  'gemini-3.1-flash-image-preview',
  'nano-banana-pro-preview',
  'gpt-image-2',
  'gpt-image-1.5',
  'chatgpt-image-latest',
  'flux-kontext-pro',
  'flux-kontext-max',
  'flux-pro-1.1-ultra',
  'recraft-v4',
  'dall-e-3',
  'grok-imagine-image-pro',
]

/**
 * Resolve the image model: show interactive picker in TTY, use default otherwise.
 */
async function resolveImageModel(): Promise<string> {
  const isTTY = process.stdin.isTTY && process.stderr.isTTY
  if (!isTTY) return DEFAULT_MODEL

  const options = FEATURED_IMAGE_MODELS
    .map((id) => CATALOG.find((m) => m.id === id))
    .filter(Boolean)
    .map((m) => {
      const cost = m!.cost.type === 'per-image'
        ? pc.dim(`$${m!.cost.perImage}/img`)
        : m!.cost.type === 'per-token'
          ? pc.dim(`$${m!.cost.outputPerM}/M out`)
          : ''
      return {
        value: m!.id,
        label: `${m!.name} ${cost}`,
        hint: m!.id,
      }
    })

  const selected = await select({
    message: 'Select an image model',
    options,
  })

  if (isCancel(selected)) {
    cancel('Cancelled.')
    process.exit(0)
  }

  return selected
}

/**
 * Resolve the video model: show interactive picker in TTY, use default otherwise.
 */
async function resolveVideoModel(): Promise<string> {
  const isTTY = process.stdin.isTTY && process.stderr.isTTY
  if (!isTTY) return DEFAULT_VIDEO_MODEL

  const options = VIDEO_CATALOG.map((m) => {
    const dur = m.features.durationRangeSec
      ? pc.dim(`${m.features.durationRangeSec.min}-${m.features.durationRangeSec.max}s`)
      : ''
    return {
      value: m.id,
      label: `${m.name} ${dur}`,
      hint: m.id,
    }
  })

  const selected = await select({
    message: 'Select a video model',
    options,
  })

  if (isCancel(selected)) {
    cancel('Cancelled.')
    process.exit(0)
  }

  return selected
}

function isUrl(input: string): boolean {
  return /^https?:\/\//i.test(input)
}

function mimeTypeFromExtension(ext: string): string {
  const map: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
  }
  return map[ext.toLowerCase()] || 'application/octet-stream'
}

/**
 * Upload a local file to the egaki gateway and return the public URL.
 * Used when a flag that expects a URL receives a local file path instead.
 */
async function uploadFileToGateway(filePath: string): Promise<string> {
  const resolved = path.resolve(filePath)
  if (!fs.existsSync(resolved)) {
    console.error(pc.red(`File not found: ${resolved}`))
    process.exit(1)
  }

  const stat = fs.statSync(resolved)
  if (stat.size > MAX_UPLOAD_SIZE) {
    console.error(pc.red(`File too large: ${resolved} (${Math.round(stat.size / 1024 / 1024)}MB). Maximum is ${MAX_UPLOAD_SIZE / 1024 / 1024}MB`))
    process.exit(1)
  }

  const ext = path.extname(resolved)
  const contentType = mimeTypeFromExtension(ext)
  const fileBytes = fs.readFileSync(resolved)

  console.error(pc.dim(`Uploading ${filePath}...`))

  const response = await fetch(`${UPLOAD_GATEWAY_BASE}/upload`, {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body: fileBytes,
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    console.error(pc.red(`Upload failed: ${response.status} ${response.statusText}`))
    if (body) console.error(pc.dim(body))
    process.exit(1)
  }

  const result = await response.json() as { url: string }
  console.error(pc.dim(`Uploaded: ${result.url}`))
  return result.url
}

/**
 * Resolve a value that should be a URL: if it's already a URL, return as-is.
 * If it's a local file path, upload it to the gateway and return the public URL.
 */
async function resolveToUrl(input: string): Promise<string> {
  if (isUrl(input)) return input
  return uploadFileToGateway(input)
}

async function readInputSource(input: string): Promise<Uint8Array> {
  if (isUrl(input)) {
    console.error(pc.dim(`Fetching ${input}...`))
    const res = await fetch(input)
    if (!res.ok) {
      console.error(pc.red(`Failed to fetch ${input}: ${res.status} ${res.statusText}`))
      process.exit(1)
    }
    return new Uint8Array(await res.arrayBuffer())
  }
  const resolved = path.resolve(input)
  if (!fs.existsSync(resolved)) {
    console.error(pc.red(`File not found: ${resolved}`))
    process.exit(1)
  }
  return new Uint8Array(fs.readFileSync(resolved))
}

async function readInputImages(
  inputs: string[] | undefined,
): Promise<Uint8Array[]> {
  if (!inputs || inputs.length === 0) {
    return []
  }
  return Promise.all(inputs.map((f) => readInputSource(f)))
}

// ─── type-safe provider option builders ──────────────────────────────────────
// Each builder switches on provider name and constructs a typed object using
// `satisfies` with the SDK's exported type. This catches typos in keys and
// invalid enum values at compile time instead of runtime.

type ImageOptionInputs = {
  aspectRatio?: `${number}:${number}`
  allowPeople: boolean
  quality?: string
  resolution?: string
  outputFormat?: string
  negativePrompt?: string
}

// Return type uses a mapped type that preserves the typed structure while
// remaining compatible with the AI SDK's ProviderOptions (Record<string, JSONObject>).
// The satisfies checks catch key typos and invalid enum values at compile time,
// then we widen to the SDK's expected shape at the boundary.
type ProviderOptionsResult = Record<string, Record<string, string | number | boolean | string[] | null | undefined | Record<string, string | number | boolean | null | undefined>>>

function buildImageProviderOptions(
  provider: string,
  opts: ImageOptionInputs,
): ProviderOptionsResult {
  switch (provider) {
    case 'google': {
      const googleOpts = {
        ...(opts.allowPeople ? { personGeneration: 'allow_all' as const } : {}),
        ...(opts.aspectRatio ? { aspectRatio: opts.aspectRatio as GoogleImageModelOptions['aspectRatio'] } : {}),
      } satisfies GoogleImageModelOptions
      return { google: googleOpts }
    }
    case 'vertex': {
      const vertexOpts = {
        ...(opts.allowPeople ? { personGeneration: 'allow_all' as const } : {}),
        ...(opts.negativePrompt ? { negativePrompt: opts.negativePrompt } : {}),
      } satisfies GoogleVertexImageModelOptions
      return { vertex: vertexOpts }
    }
    case 'xai': {
      const xaiOpts = {
        ...(opts.quality ? { quality: opts.quality as XaiImageModelOptions['quality'] } : {}),
        ...(opts.resolution ? { resolution: opts.resolution as XaiImageModelOptions['resolution'] } : {}),
        ...(opts.outputFormat ? { output_format: opts.outputFormat } : {}),
      } satisfies XaiImageModelOptions
      return { xai: xaiOpts }
    }
    case 'openai': {
      const openaiOpts = {
        ...(opts.quality ? { quality: opts.quality as OpenAIImageProviderOptions['quality'] } : {}),
        ...(opts.outputFormat ? { outputFormat: opts.outputFormat as OpenAIImageProviderOptions['outputFormat'] } : {}),
      } satisfies OpenAIImageProviderOptions
      return { openai: openaiOpts }
    }
    case 'fal': {
      const falOpts = {
        ...(opts.outputFormat ? { outputFormat: opts.outputFormat } : {}),
        ...(opts.negativePrompt ? { negativePrompt: opts.negativePrompt } : {}),
      } satisfies FalImageModelOptions
      return { fal: falOpts }
    }
    default:
      // Providers routed through the gateway (bfl, recraft, etc.) pass options
      // as-is since they don't have local SDK types.
      return {}
  }
}

type VideoOptionInputs = {
  resolution?: string
  mode?: string
  videoUrl?: string
  referenceImages?: string[]
  negativePrompt?: string
  model: string
}

function buildVideoProviderOptions(
  provider: string,
  opts: VideoOptionInputs,
): ProviderOptionsResult | undefined {
  switch (provider) {
    case 'xai': {
      // xAI video modes are a discriminated union; build the correct variant.
      const base = {
        ...(opts.resolution ? { resolution: opts.resolution as '480p' | '720p' } : {}),
      }
      if (opts.mode === 'edit-video' && opts.videoUrl) {
        const xaiOpts = { ...base, mode: 'edit-video' as const, videoUrl: opts.videoUrl } satisfies XaiVideoModelOptions
        return { xai: xaiOpts }
      }
      if (opts.mode === 'extend-video' && opts.videoUrl) {
        const xaiOpts = { ...base, mode: 'extend-video' as const, videoUrl: opts.videoUrl } satisfies XaiVideoModelOptions
        return { xai: xaiOpts }
      }
      if (opts.mode === 'reference-to-video' && opts.referenceImages) {
        const xaiOpts = { ...base, mode: 'reference-to-video' as const, referenceImageUrls: opts.referenceImages } satisfies XaiVideoModelOptions
        return { xai: xaiOpts }
      }
      // Default: text-to-video or image-to-video (no mode)
      if (Object.keys(base).length === 0) return undefined
      const xaiOpts = { ...base } satisfies XaiVideoModelOptions
      return { xai: xaiOpts }
    }
    case 'bytedance': {
      // Seedance r2v: pass reference image URLs via providerOptions.bytedance.referenceImages.
      // In the prompt, reference images with @Image1, @Image2, etc. (Seedance 2.0) or
      // [Image 1], [Image 2] (Seedance 1.0 Lite I2V).
      const bytedanceOpts = {
        ...(opts.resolution ? { resolution: opts.resolution } : {}),
        ...(opts.referenceImages ? { referenceImages: opts.referenceImages } : {}),
      } satisfies ByteDanceVideoProviderOptions
      if (Object.keys(bytedanceOpts).length === 0) return undefined
      return { bytedance: bytedanceOpts }
    }
    case 'fal': {
      const falOpts = {
        ...(opts.resolution ? { resolution: opts.resolution } : {}),
        ...(opts.negativePrompt ? { negativePrompt: opts.negativePrompt } : {}),
      } satisfies FalVideoModelOptions
      if (Object.keys(falOpts).length === 0) return undefined
      return { fal: falOpts }
    }
    case 'google': {
      const googleOpts = {
        ...(opts.negativePrompt ? { negativePrompt: opts.negativePrompt } : {}),
      } satisfies GoogleVideoModelOptions
      if (Object.keys(googleOpts).length === 0) return undefined
      return { google: googleOpts }
    }
    case 'vertex': {
      const vertexOpts = {
        ...(opts.negativePrompt ? { negativePrompt: opts.negativePrompt } : {}),
      } satisfies GoogleVertexVideoModelOptions
      if (Object.keys(vertexOpts).length === 0) return undefined
      return { vertex: vertexOpts }
    }
    default:
      return undefined
  }
}

// Generate using the dedicated generateImage API (Imagen models)
async function generateWithImageModel({
  prompt,
  model,
  outputPath,
  count,
  aspectRatio,
  seed,
  inputImages,
  maskImage,
  allowPeople,
  quality,
  resolution,
  outputFormat,
  negativePrompt,
  json,
  stdout,
}: {
  prompt: string
  model: string
  outputPath: string
  count: number
  aspectRatio?: `${number}:${number}`
  seed?: number
  inputImages: Uint8Array[]
  maskImage?: Uint8Array
  allowPeople: boolean
  quality?: string
  resolution?: string
  outputFormat?: string
  negativePrompt?: string
  json: boolean
  stdout: boolean
}) {
  // Build the prompt: plain string or multimodal with reference images
  const imagePrompt = inputImages.length > 0
    ? { text: prompt, images: inputImages, ...(maskImage ? { mask: maskImage } : {}) }
    : prompt

  const config = getModelConfig(model)
  const imageModel = await createImageModel(model)

  // Build type-safe provider options using the SDK types with `satisfies`.
  // Each provider has its own shape; we switch on provider to get compile-time safety.
  const providerOptions = buildImageProviderOptions(config.provider, {
    aspectRatio,
    allowPeople,
    quality,
    resolution,
    outputFormat,
    negativePrompt,
  })

  if (!stdout) {
    console.error(pc.cyan('Generating...'))
  }

  const result = await runProviderCall('Image generation', () => aiGenerateImage({
    model: imageModel,
    prompt: imagePrompt,
    n: count,
    ...(aspectRatio ? { aspectRatio } : {}),
    ...(seed !== undefined ? { seed } : {}),
    providerOptions,
  }))

  const files = result.images.map((img) => ({
    uint8Array: img.uint8Array,
    mediaType: img.mediaType,
  }))

  if (stdout) {
    writeFirstToStdout(files)
    return
  }

  const savedFiles = saveGeneratedFiles(files, outputPath)
  const cost = calculateCost(config.cost, result.usage, result.images.length)
  printCost(cost)

  if (json) {
    console.log(JSON.stringify({
      model,
      files: savedFiles,
      count: result.images.length,
      cost,
      usage: result.usage,
      warnings: result.warnings,
    }, null, 2))
  }
}

// Generate using generateText with responseModalities (Gemini multimodal models)
async function generateWithTextModel({
  prompt,
  model,
  outputPath,
  inputImages,
  imageSize,
  aspectRatio,
  json,
  stdout,
}: {
  prompt: string
  model: string
  outputPath: string
  inputImages: Uint8Array[]
  imageSize?: '1K' | '2K' | '4K'
  aspectRatio?: string
  json: boolean
  stdout: boolean
}) {
  const textModel = await createTextModel(model)
  const config = getModelConfig(model)

  if (!stdout) {
    console.error(pc.cyan('Generating...'))
  }

  // Build messages: if we have input images, create a multimodal prompt
  const messages = inputImages.length > 0
    ? [
        {
          role: 'user' as const,
          content: [
            { type: 'text' as const, text: prompt },
            ...inputImages.map((img) => ({
              type: 'image' as const,
              image: img,
            })),
          ],
        },
      ]
    : undefined

  // Type-safe Google/Vertex language model options with image generation config.
  // aspectRatio is cast to the Google SDK's enum type since CLI input is a free string.
  type GoogleAspectRatio = NonNullable<NonNullable<GoogleLanguageModelOptions['imageConfig']>['aspectRatio']>
  const googleOpts = {
    responseModalities: ['TEXT', 'IMAGE'],
    ...(imageSize || aspectRatio
      ? {
          imageConfig: {
            ...(imageSize ? { imageSize } : {}),
            ...(aspectRatio ? { aspectRatio: aspectRatio as GoogleAspectRatio } : {}),
          },
        }
      : {}),
  } satisfies GoogleLanguageModelOptions

  const providerOptionsKey = config.provider === 'vertex' ? 'vertex' : 'google'

  const result = await runProviderCall('Text/image generation', () => generateText({
    model: textModel,
    ...(messages ? { messages } : { prompt }),
    providerOptions: {
      [providerOptionsKey]: googleOpts,
    },
  }))

  const imageFiles = result.files.filter((f) => f.mediaType.startsWith('image/'))

  if (imageFiles.length === 0) {
    console.error(pc.red('No images generated.'))
    process.exit(1)
  }

  if (stdout) {
    writeFirstToStdout(imageFiles)
    return
  }

  const savedFiles = saveGeneratedFiles(imageFiles, outputPath)
  const cost = calculateCost(config.cost, result.usage, imageFiles.length)
  printCost(cost)

  if (result.text && !json) {
    console.error(pc.dim(result.text))
  }

  if (json) {
    console.log(JSON.stringify({
      model,
      files: savedFiles,
      count: imageFiles.length,
      text: result.text || null,
      cost,
      usage: result.usage,
    }, null, 2))
  }
}

// Generate using the OpenAI Responses API with imageGeneration tool.
// Used when auth comes from ChatGPT OAuth (no Image API scope).
async function generateWithResponsesApi({
  prompt,
  model,
  outputPath,
  count,
  aspectRatio,
  seed,
  inputImages,
  maskImage,
  json,
  stdout,
}: {
  prompt: string
  model: string
  outputPath: string
  count: number
  aspectRatio?: `${number}:${number}`
  seed?: number
  inputImages: Uint8Array[]
  maskImage?: Uint8Array
  json: boolean
  stdout: boolean
}) {
  if (count !== 1) {
    console.error(pc.red('ChatGPT image generation currently supports exactly one output image.'))
    process.exit(1)
  }

  if (seed !== undefined) {
    console.error(pc.red('ChatGPT image generation does not support --seed.'))
    process.exit(1)
  }

  if (maskImage) {
    console.error(pc.red('ChatGPT image generation does not support --mask yet.'))
    process.exit(1)
  }

  const size = aspectRatio ? chatGptImageSizeFromAspectRatio(aspectRatio) : undefined
  if (aspectRatio && !size) {
    console.error(
      pc.red(
        'ChatGPT image generation only supports --aspect-ratio 1:1, 3:2, or 2:3.',
      ),
    )
    process.exit(1)
  }

  const storedAuth = getChatGptAuth()
  if (!storedAuth?.accountId) {
    console.error(pc.red('Missing ChatGPT account metadata. Please run `egaki login --provider chatgpt` again.'))
    process.exit(1)
  }

  const auth = await getValidChatGptAuth(storedAuth, saveChatGptAuth)
  if (auth instanceof Error) {
    console.error(pc.red(auth.message))
    process.exit(1)
  }

  if (!stdout) {
    console.error(pc.cyan('Generating...'))
  }

  const content: Array<{ type: 'input_text'; text: string } | { type: 'input_image'; image_url: string }> = [
    { type: 'input_text', text: prompt },
    ...inputImages.map((image) => ({
      type: 'input_image' as const,
      image_url: imageBytesToDataUrl(image),
    })),
  ]

  const response = await fetch('https://chatgpt.com/backend-api/codex/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${auth.access}`,
      'ChatGPT-Account-ID': auth.accountId,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-5.4',
      instructions: 'You are Codex.',
      input: [
        {
          type: 'message',
          role: 'user',
          content,
        },
      ],
      tools: [
        {
          type: 'image_generation',
          model,
          size: 'auto',
          quality: 'auto',
          output_format: 'png',
          output_compression: 100,
          moderation: 'auto',
          ...(size ? { size } : {}),
        },
      ],
      tool_choice: 'auto',
      parallel_tool_calls: true,
      stream: true,
      store: false,
      include: [],
    }),
  })

  if (!response.ok || !response.body) {
    const body = await response.text().catch(() => '')
    console.error(pc.red(`ChatGPT image generation failed: ${response.status}`))
    if (body) console.error(pc.dim(body))
    process.exit(1)
  }

  let imageBase64: string | undefined
  let revisedPrompt: string | null = null

  const processSseMessage = (message: EventSourceMessage) => {
    if (!message.data) return
    try {
      const event = JSON.parse(message.data) as {
        type?: string
        partial_image_b64?: string
        item?: { type?: string; result?: string; revised_prompt?: string | null }
      }
      if (
        event.type === 'response.image_generation_call.partial_image' &&
        event.partial_image_b64 &&
        !imageBase64
      ) {
        imageBase64 = event.partial_image_b64
      }
      if (
        event.type === 'response.output_item.done' &&
        event.item?.type === 'image_generation_call'
      ) {
        if (event.item.result) imageBase64 = event.item.result
        revisedPrompt = event.item.revised_prompt ?? revisedPrompt
      }
    } catch {
      // Ignore keepalive and partial parse noise.
    }
  }

  const parser = createParser({
    onEvent: processSseMessage,
  })

  const decoder = new TextDecoder()

  for await (const chunk of response.body) {
    parser.feed(decoder.decode(chunk, { stream: true }))
  }
  parser.feed(decoder.decode())

  if (!imageBase64) {
    console.error(pc.red('No images generated.'))
    process.exit(1)
  }

  const imageBytes = Buffer.from(imageBase64, 'base64')
  const mediaType = 'image/png'

  if (stdout) {
    process.stdout.write(imageBytes)
    return
  }

  const savedFiles: string[] = []
  const filePath = ensureExtension(outputPath, extensionFromMediaType(mediaType))
  fs.writeFileSync(filePath, imageBytes)
  console.error(pc.green(`Saved: ${filePath}`))
  savedFiles.push(filePath)

  if (revisedPrompt && !json) {
    console.error(pc.dim(`Revised prompt: ${revisedPrompt}`))
  }

  if (json) {
    const output = {
      model,
      files: savedFiles,
      count: 1,
      revisedPrompt,
    }
    console.log(JSON.stringify(output, null, 2))
  }
}

// Generate using experimental_generateVideo (video models)
async function generateWithVideoModel({
  prompt,
  model,
  outputPath,
  count,
  aspectRatio,
  resolution,
  duration,
  fps,
  seed,
  inputImage,
  mode,
  videoUrl,
  referenceImages,
  negativePrompt,
  json,
  stdout,
}: {
  prompt: string
  model: string
  outputPath: string
  count: number
  aspectRatio?: string
  resolution?: string
  duration?: number
  fps?: number
  seed?: number
  inputImage?: Uint8Array
  mode?: string
  videoUrl?: string
  referenceImages?: string[]
  negativePrompt?: string
  json: boolean
  stdout: boolean
}) {
  const videoModel = await createVideoModel(model)
  const config = getModelConfig(model)

  // Validate that the model supports video-url input before building options.
  // Only models with a 'video-url' providerOption (currently xAI) accept edit/extend mode.
  if (videoUrl && !config.providerOptions?.some((opt) => opt.flag === 'video-url')) {
    console.error(pc.red(`Model ${model} does not support video URL input for editing/extension`))
    process.exit(1)
  }

  // Build type-safe provider options for video generation.
  const providerOptions = buildVideoProviderOptions(config.provider, {
    resolution,
    mode,
    videoUrl,
    referenceImages,
    negativePrompt,
    model,
  })

  if (!stdout) {
    console.error(pc.cyan('Generating...'))
  }

  const result = await runProviderCall('Video generation', () => aiGenerateVideo({
    model: videoModel,
    prompt: inputImage
      ? { image: inputImage, text: prompt }
      : prompt,
    n: count,
    ...(aspectRatio ? { aspectRatio: aspectRatio as `${number}:${number}` } : {}),
    ...(resolution ? { resolution: resolution as `${number}x${number}` } : {}),
    ...(duration != null ? { duration } : {}),
    ...(fps != null ? { fps } : {}),
    ...(seed != null ? { seed } : {}),
    ...(providerOptions ? { providerOptions } : {}),
  }))

  const files = result.videos.map((v: { uint8Array: Uint8Array; mediaType: string }) => ({
    uint8Array: v.uint8Array,
    mediaType: v.mediaType,
  }))

  if (stdout) {
    writeFirstToStdout(files)
    return
  }

  const savedFiles = saveGeneratedFiles(files, outputPath)
  const cost = calculateCost(config.cost, {
    videosGenerated: result.videos.length,
    durationSeconds: duration,
    resolution,
  }, result.videos.length)
  printCost(cost)

  if (json) {
    console.log(JSON.stringify({
      model,
      files: savedFiles,
      count: result.videos.length,
      cost,
      warnings: result.warnings,
      responses: result.responses,
    }, null, 2))
  }
}

// ─── shared output helpers ───────────────────────────────────────────────────
// Common logic for saving generated files, calculating cost, and printing JSON
// metadata. Used by all generation paths to avoid repeating boilerplate.

type GeneratedFile = {
  uint8Array: Uint8Array
  mediaType: string
}

/**
 * Save generated files to disk. Returns the list of saved file paths.
 * Handles single vs multi-file naming with index suffixes.
 */
function saveGeneratedFiles(
  files: GeneratedFile[],
  outputPath: string,
): string[] {
  const savedFiles: string[] = []
  for (let i = 0; i < files.length; i++) {
    const file = files[i]!
    const ext = extensionFromMediaType(file.mediaType)
    const filePath =
      files.length === 1
        ? ensureExtension(outputPath, ext)
        : insertIndex(outputPath, i, ext)

    fs.writeFileSync(filePath, file.uint8Array)
    console.error(pc.green(`Saved: ${filePath}`))
    savedFiles.push(filePath)
  }
  return savedFiles
}

/**
 * Print estimated cost to stderr if calculable.
 */
function printCost(cost: number | null): void {
  if (cost != null) {
    console.error(pc.dim(`Cost: ${formatCost(cost)}`))
  }
}

/**
 * Write the first file's raw bytes to stdout (for piping to other tools).
 */
function writeFirstToStdout(files: GeneratedFile[]): void {
  const file = files[0]
  if (file) {
    process.stdout.write(Buffer.from(file.uint8Array))
  }
}

// ─── cost helpers ────────────────────────────────────────────────────────────

function calculateCost(
  cost: {
    type: 'per-image'
    perImage: number
  } | {
    type: 'per-token'
    inputPerM: number
    outputPerM: number
  } | {
    type: 'per-video-second'
    defaultDurationSec: number
    tiers: Array<{ resolution?: string; costPerSecond: number }>
  } | {
    type: 'unknown'
  },
  usage: {
    inputTokens?: number
    outputTokens?: number
    imagesGenerated?: number
    videosGenerated?: number
    durationSeconds?: number
    resolution?: string
  },
  count: number = 1,
): number | null {
  if (cost.type === 'per-image') {
    return cost.perImage * count
  }
  if (cost.type === 'per-token' && usage.inputTokens != null && usage.outputTokens != null) {
    return (
      (usage.inputTokens * cost.inputPerM + usage.outputTokens * cost.outputPerM) / 1_000_000
    )
  }
  if (cost.type === 'per-video-second') {
    const durationSec = usage.durationSeconds ?? cost.defaultDurationSec
    const resolution = normalizeResolutionKey(usage.resolution)
    const tier =
      cost.tiers.find((t) => normalizeResolutionKey(t.resolution) === resolution) ??
      cost.tiers[0]
    if (!tier) {
      return null
    }
    return tier.costPerSecond * durationSec * count
  }
  return null
}

function formatCatalogCost(
  cost: {
    type: 'per-image'
    perImage: number
  } | {
    type: 'per-token'
    inputPerM: number
    outputPerM: number
  } | {
    type: 'per-video-second'
    defaultDurationSec: number
    tiers: Array<{ resolution?: string; mode?: string; audio?: boolean; costPerSecond: number }>
  } | {
    type: 'unknown'
  },
): string {
  if (cost.type === 'per-image') {
    return `$${cost.perImage}/image`
  }
  if (cost.type === 'per-token') {
    return `$${cost.inputPerM}/M input, $${cost.outputPerM}/M output`
  }
  if (cost.type === 'per-video-second') {
    const tierText = cost.tiers
      .map((t) => {
        const parts = [
          t.resolution,
          t.mode ? `mode=${t.mode}` : undefined,
          t.audio != null ? `audio=${t.audio}` : undefined,
        ].filter(Boolean)
        return parts.length > 0
          ? `$${t.costPerSecond}/s (${parts.join(', ')})`
          : `$${t.costPerSecond}/s`
      })
      .join('; ')
    return `${tierText} (default duration ${cost.defaultDurationSec}s)`
  }
  return 'unknown'
}

function formatCost(dollars: number): string {
  if (dollars < 0.01) {
    return `$${dollars.toFixed(4)}`
  }
  return `$${dollars.toFixed(2)}`
}

function extensionFromMediaType(mediaType: string): string {
  const map: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'video/quicktime': '.mov',
  }
  return map[mediaType] || (mediaType.startsWith('video/') ? '.mp4' : '.png')
}

function inferImageMediaType(image: Uint8Array): string {
  if (image.length >= 8 && image[0] === 0x89 && image[1] === 0x50 && image[2] === 0x4e && image[3] === 0x47) {
    return 'image/png'
  }
  if (image.length >= 3 && image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff) {
    return 'image/jpeg'
  }
  if (
    image.length >= 12 &&
    image[0] === 0x52 && image[1] === 0x49 && image[2] === 0x46 && image[3] === 0x46 &&
    image[8] === 0x57 && image[9] === 0x45 && image[10] === 0x42 && image[11] === 0x50
  ) {
    return 'image/webp'
  }
  if (
    image.length >= 6 &&
    image[0] === 0x47 && image[1] === 0x49 && image[2] === 0x46 && image[3] === 0x38
  ) {
    return 'image/gif'
  }
  return 'image/png'
}

function imageBytesToDataUrl(image: Uint8Array): string {
  const mediaType = inferImageMediaType(image)
  return `data:${mediaType};base64,${Buffer.from(image).toString('base64')}`
}

function chatGptImageSizeFromAspectRatio(
  aspectRatio: `${number}:${number}`,
): '1024x1024' | '1536x1024' | '1024x1536' | undefined {
  switch (aspectRatio) {
    case '1:1':
      return '1024x1024'
    case '3:2':
      return '1536x1024'
    case '2:3':
      return '1024x1536'
    default:
      return undefined
  }
}

function normalizeResolutionKey(input?: string): string | undefined {
  if (!input) return undefined
  const normalized = input.trim().toLowerCase()
  if (normalized === '1920x1080') return '1080p'
  if (normalized === '1280x720') return '720p'
  if (normalized === '854x480' || normalized === '848x480') return '480p'
  return normalized
}

function isAspectRatio(input: string): input is `${number}:${number}` {
  return /^\d+:\d+$/.test(input)
}

function parseAspectRatioOption(input?: string): `${number}:${number}` | undefined {
  if (!input || !isAspectRatio(input)) {
    return undefined
  }
  return input
}

function ensureExtension(filePath: string, ext: string): string {
  const parsed = path.parse(filePath)
  if (parsed.ext) {
    return filePath
  }
  return filePath + ext
}

function insertIndex(filePath: string, index: number, ext: string): string {
  const parsed = path.parse(filePath)
  const finalExt = parsed.ext || ext
  return path.join(parsed.dir, `${parsed.name}-${index}${finalExt}`)
}
