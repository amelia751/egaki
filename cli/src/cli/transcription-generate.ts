// Programmatic API for egaki audio transcription (speech-to-text).
// Returns Error | Result (errore style) instead of process.exit/console.error.
// The CLI (cli.ts) is a thin wrapper around this function.
//
// Usage:
//   import { transcribeAudio } from 'egaki/generate'
//   const result = await transcribeAudio({ audio: fs.readFileSync('audio.mp3'), model: 'whisper-1' })
//   if (result instanceof Error) { /* handle */ }
//   result.text       // full transcript
//   result.segments   // word-level timestamps
import {
  experimental_transcribe as aiTranscribe,
} from 'ai'
import { injectCredentialsToEnv } from './credentials.js'
import {
  getTranscriptionModelConfig,
  createTranscriptionModel,
  DEFAULT_TRANSCRIPTION_MODEL,
} from './transcription-models.js'

// ─── autocomplete-friendly union types ───────────────────────────────────────

/** Transcription model IDs from the catalog. Accepts arbitrary strings too. */
export type TranscriptionModelId =
  | 'whisper-1' | 'gpt-4o-transcribe' | 'gpt-4o-mini-transcribe'
  | 'scribe_v1'
  | 'nova-3'
  | 'whisper-large-v3' | 'whisper-large-v3-turbo' | 'distil-whisper-large-v3-en'
  | (string & {})

// ─── public types ────────────────────────────────────────────────────────────

export interface TranscribeOptions {
  /** Audio data as a Uint8Array or Buffer. */
  audio: Uint8Array
  /** Transcription model ID. Defaults to 'whisper-1' if omitted. */
  model?: TranscriptionModelId
  /** ISO 639-1 language hint (e.g. "en", "es", "fr"). */
  language?: string
}

export interface TranscriptionSegment {
  text: string
  startSecond: number
  endSecond: number
}

export interface TranscribeResult {
  text: string
  segments: TranscriptionSegment[]
  language: string | undefined
  durationInSeconds: number | undefined
  model: string
  cost: number | null
  warnings?: unknown[]
}

// ─── cost calculation ────────────────────────────────────────────────────────

export function calculateTranscriptionCost(
  cost: { type: 'per-second'; perSecond: number },
  durationInSeconds: number | undefined,
): number | null {
  if (durationInSeconds == null) return null
  return durationInSeconds * cost.perSecond
}

// ─── provider-specific language options ──────────────────────────────────────

/** ElevenLabs uses `languageCode` instead of `language` in providerOptions. */
function buildLanguageOptions(provider: string, language: string): Record<string, Record<string, string>> {
  if (provider === 'elevenlabs') {
    return { elevenlabs: { languageCode: language } }
  }
  return { [provider]: { language } }
}

// ─── transcribeAudio ─────────────────────────────────────────────────────────

/**
 * Transcribe audio to text. Auto-detects which provider to use
 * based on model ID. Shares credentials with the CLI.
 */
export async function transcribeAudio(opts: TranscribeOptions): Promise<Error | TranscribeResult> {
  injectCredentialsToEnv()

  const model = opts.model ?? DEFAULT_TRANSCRIPTION_MODEL
  const config = getTranscriptionModelConfig(model)
  if (config instanceof Error) return config

  const transcriptionModel = await createTranscriptionModel(model)
  if (transcriptionModel instanceof Error) return transcriptionModel

  if (opts.language && !config.features.languageHint) {
    return new Error(`Model ${model} does not support a language hint`)
  }

  let result
  try {
    result = await aiTranscribe({
      model: transcriptionModel,
      audio: opts.audio,
      ...(opts.language ? {
        providerOptions: buildLanguageOptions(config.provider, opts.language),
      } : {}),
    })
  } catch (err) {
    return err instanceof Error ? err : new Error(String(err))
  }

  const cost = calculateTranscriptionCost(config.cost, result.durationInSeconds)

  return {
    text: result.text,
    segments: result.segments,
    language: result.language,
    durationInSeconds: result.durationInSeconds,
    model,
    cost,
    warnings: result.warnings,
  }
}
