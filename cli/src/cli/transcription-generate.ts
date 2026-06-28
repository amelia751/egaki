// Programmatic API for egaki audio transcription (speech-to-text).
// Returns Error | Result (errore style) instead of process.exit/console.error.
//
// Two variants:
//   - `transcribeAudio(opts)` — cached, writes JSON to public/generated/transcription/, returns WordTimestamp[]
//   - `transcribeAudioUncached(opts)` — raw, returns TranscribeResult with text + segments
//
// Uses direct HTTP calls to each provider API (no AI SDK dependency).
// Each provider implementation lives in transcription-providers.ts.
//
// Usage:
//   import { transcribeAudio, transcribeAudioUncached } from 'egaki/generate'
//   const cached = await transcribeAudio({ audio: fs.readFileSync('audio.mp3') })
//   if (!(cached instanceof Error)) cached // WordTimestamp[]
//   const raw = await transcribeAudioUncached({ audio: fs.readFileSync('audio.mp3') })
//   if (!(raw instanceof Error)) raw.text // full transcript
import { injectCredentialsToEnv } from './credentials.js'
import {
  getTranscriptionModelConfig,
  getTranscriptionProvider,
  DEFAULT_TRANSCRIPTION_MODEL,
} from './transcription-models.js'

// ─── autocomplete-friendly union types ───────────────────────────────────────

/** Transcription model IDs from the catalog. Accepts arbitrary strings too. */
export type TranscriptionModelId =
  | 'whisper-1' | 'gpt-4o-transcribe' | 'gpt-4o-mini-transcribe'
  | 'scribe_v1'
  | 'nova-3'
  | 'whisper-large-v3' | 'whisper-large-v3-turbo' | 'distil-whisper-large-v3-en'
  | 'ink-whisper'
  | (string & {})

// ─── public types ────────────────────────────────────────────────────────────

export interface TranscribeOptions {
  /** Audio data as a Uint8Array or Buffer. */
  audio: Uint8Array
  /** Transcription model ID. Defaults to 'whisper-1' if omitted. */
  model?: TranscriptionModelId
  /** ISO 639-1 language hint (e.g. "en", "es", "fr"). */
  language?: string
  /** Original audio filename, used as the human-readable cache file prefix. */
  filename?: string
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
}

// ─── word-level timestamp types ──────────────────────────────────────────────

/** A single word with its start/end time in seconds. */
export interface WordTimestamp {
  word: string
  startSecond: number
  endSecond: number
}

/**
 * Convert TranscriptionSegment[] to WordTimestamp[].
 *
 * When segments are word-level (one word per segment), maps directly.
 * When segments are phrase/sentence-level, splits by whitespace and
 * distributes time evenly across words as a fallback.
 */
export function segmentsToWordTimestamps(segments: TranscriptionSegment[]): WordTimestamp[] {
  const result: WordTimestamp[] = []
  for (const seg of segments) {
    const trimmed = seg.text.trim()
    // Skip empty/whitespace-only segments (ElevenLabs returns space segments)
    if (!trimmed) continue
    const words = trimmed.split(/\s+/).filter(Boolean)
    if (words.length <= 1) {
      result.push({ word: trimmed, startSecond: seg.startSecond, endSecond: seg.endSecond })
      continue
    }
    // Phrase-level segment: distribute time evenly across words
    const duration = seg.endSecond - seg.startSecond
    const wordDuration = duration / words.length
    for (let i = 0; i < words.length; i++) {
      result.push({
        word: words[i]!,
        startSecond: seg.startSecond + i * wordDuration,
        endSecond: seg.startSecond + (i + 1) * wordDuration,
      })
    }
  }
  return result
}

/**
 * Convert WordTimestamp[] to @remotion/captions Caption[] format.
 * First word has no leading space; subsequent words get a leading space
 * (required by createTikTokStyleCaptions).
 */
export function wordTimestampsToCaptions(words: WordTimestamp[]): Array<{
  text: string
  startMs: number
  endMs: number
  timestampMs: number
  confidence: number
}> {
  return words.map((w, i) => ({
    text: i === 0 ? w.word : ` ${w.word}`,
    startMs: w.startSecond * 1000,
    endMs: w.endSecond * 1000,
    timestampMs: ((w.startSecond + w.endSecond) / 2) * 1000,
    confidence: 1,
  }))
}

// ─── cost calculation ────────────────────────────────────────────────────────

export function calculateTranscriptionCost(
  cost: { type: 'per-second'; perSecond: number },
  durationInSeconds: number | undefined,
): number | null {
  if (durationInSeconds == null) return null
  return durationInSeconds * cost.perSecond
}

// ─── transcribeAudioUncached ─────────────────────────────────────────────────

/**
 * Transcribe audio to text. Auto-detects which provider to use
 * based on model ID. Shares credentials with the CLI.
 */
export async function transcribeAudioUncached(opts: TranscribeOptions): Promise<Error | TranscribeResult> {
  injectCredentialsToEnv()

  const model = opts.model ?? DEFAULT_TRANSCRIPTION_MODEL
  const config = getTranscriptionModelConfig(model)
  if (config instanceof Error) return config

  if (opts.language && !config.features.languageHint) {
    return new Error(`Model ${model} does not support a language hint`)
  }

  const provider = getTranscriptionProvider(config.provider)
  if (provider instanceof Error) return provider

  let result
  try {
    result = await provider.transcribe({
      audio: opts.audio,
      modelId: model,
      language: opts.language,
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
  }
}

// ─── cached transcribeAudio ─────────────────────────────────────────────────

import fs from 'node:fs'
import path from 'node:path'
import { cachedGenerate } from './cached-generate.js'

export const transcribeAudio = cachedGenerate<TranscribeOptions, { wordTimestamps: WordTimestamp[]; text: string }, WordTimestamp[]>({
  namespace: 'transcription',
  prefixFrom: (p) => {
    if (p.filename) {
      const ext = path.extname(p.filename)
      return path.basename(p.filename, ext)
    }
    return 'transcription'
  },
  // Exclude filename from cache key — it only affects the human-readable prefix,
  // not the identity of the transcription result.
  cacheKey: ({ filename, ...rest }) => rest as Record<string, unknown>,
  modelFrom: (p) => p.model,
  generate: async (params) => {
    const result = await transcribeAudioUncached(params)
    if (result instanceof Error) throw result
    return {
      wordTimestamps: segmentsToWordTimestamps(result.segments),
      text: result.text,
    }
  },
  serialize: (result) => ({
    json: result.wordTimestamps,
    extension: '.json',
    // Use the transcript text as a more readable filename prefix
    prefix: result.text || undefined,
  }),
  deserialize: ({ filePath }) => {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  },
})
