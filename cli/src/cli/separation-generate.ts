// Audio separation using fal.ai's Demucs API.
// Splits audio into stems (vocals, drums, bass, guitar, piano, other).
// Returns Error | Result (errore style) instead of throwing.
//
// Uses @fal-ai/client directly since Demucs is a fal-specific API
// with no Vercel AI SDK wrapper. Requires FAL_KEY env var or
// egaki login --provider fal.
import { fal } from '@fal-ai/client'
import { injectCredentialsToEnv } from './credentials.js'

// ─── types ──────────────────────────────────────────────────────────────────

export type StemName = 'vocals' | 'drums' | 'bass' | 'other' | 'guitar' | 'piano'

export type DemucsModel =
  | 'htdemucs'
  | 'htdemucs_ft'
  | 'htdemucs_6s'
  | 'hdemucs_mmi'
  | 'mdx'
  | 'mdx_extra'
  | 'mdx_q'
  | 'mdx_extra_q'

export interface SeparateAudioOptions {
  /** Raw audio bytes to separate. */
  audio: Uint8Array
  /** Which stems to extract. Default: ['vocals', 'other'] */
  stems?: StemName[]
  /** Demucs model variant. Default: 'htdemucs_6s' */
  model?: DemucsModel
  /** Output format: 'mp3' or 'wav'. Default: 'mp3' */
  outputFormat?: 'mp3' | 'wav'
  /** Number of random shifts for quality (higher = better but slower). Default: 1 */
  shifts?: number
  /** Segment overlap 0.0-1.0 (higher = better quality). Default: 0.25 */
  overlap?: number
  /** Original filename for display/logging. */
  filename?: string
  /** Progress callback for queue updates. */
  onProgress?: (message: string) => void
}

export interface StemResult {
  name: StemName
  url: string
  contentType: string
}

export interface SeparateAudioResult {
  stems: StemResult[]
  model: string
}

// ─── validation ─────────────────────────────────────────────────────────────

const ALL_STEMS: StemName[] = ['vocals', 'drums', 'bass', 'other', 'guitar', 'piano']
const FOUR_STEM_MODELS: DemucsModel[] = ['htdemucs', 'htdemucs_ft', 'hdemucs_mmi', 'mdx', 'mdx_extra', 'mdx_q', 'mdx_extra_q']
const SIX_STEM_ONLY: StemName[] = ['guitar', 'piano']

export function validateStems(stems: StemName[], model: DemucsModel): Error | void {
  for (const s of stems) {
    if (!ALL_STEMS.includes(s)) {
      return new Error(`Unknown stem: "${s}". Valid stems: ${ALL_STEMS.join(', ')}`)
    }
  }
  if (FOUR_STEM_MODELS.includes(model)) {
    const invalid = stems.filter((s) => SIX_STEM_ONLY.includes(s))
    if (invalid.length > 0) {
      return new Error(
        `Stems ${invalid.join(', ')} are only available with htdemucs_6s model. ` +
        `Current model: ${model}`,
      )
    }
  }
}

// ─── main function ──────────────────────────────────────────────────────────

export async function separateAudioUncached(
  opts: SeparateAudioOptions,
): Promise<Error | SeparateAudioResult> {
  injectCredentialsToEnv()

  const falKey = process.env['FAL_KEY']
  if (!falKey) {
    return new Error(
      'FAL_KEY not found. Run: egaki login --provider fal\n' +
      'Get your key at https://fal.ai/dashboard/keys',
    )
  }

  fal.config({ credentials: falKey })

  const model: DemucsModel = opts.model ?? 'htdemucs_6s'
  const stems: StemName[] = opts.stems ?? ['vocals', 'other']
  const outputFormat = opts.outputFormat ?? 'mp3'

  const validationError = validateStems(stems, model)
  if (validationError) return validationError

  if (opts.audio.length === 0) {
    return new Error('No audio data provided')
  }

  // Upload the audio file to fal storage so the API can access it
  const file = new File(
    [Buffer.from(opts.audio)],
    opts.filename ?? 'audio.mp3',
    { type: 'audio/mpeg' },
  )

  opts.onProgress?.('Uploading audio to fal.ai...')
  let audioUrl: string
  try {
    audioUrl = await fal.storage.upload(file)
  } catch (err) {
    return new Error(`Failed to upload audio: ${err instanceof Error ? err.message : String(err)}`)
  }
  opts.onProgress?.('Audio uploaded. Starting separation...')

  // Call the Demucs API
  type DemucsOutput = Record<string, { url: string; content_type: string }>
  let result: { data: DemucsOutput }
  try {
    result = await fal.subscribe('fal-ai/demucs', {
      input: {
        audio_url: audioUrl,
        model,
        stems,
        shifts: opts.shifts ?? 1,
        overlap: opts.overlap ?? 0.25,
        output_format: outputFormat,
      },
      logs: true,
      onQueueUpdate: (update) => {
        if (update.status === 'IN_PROGRESS') {
          const u = update as typeof update & { logs?: Array<{ message: string }> }
          if (u.logs) {
            for (const log of u.logs) {
              opts.onProgress?.(log.message)
            }
          }
        }
      },
    }) as any
  } catch (err) {
    return new Error(`Separation failed: ${err instanceof Error ? err.message : String(err)}`)
  }

  // Extract the requested stems from the result
  const resultStems: StemResult[] = []
  for (const stemName of stems) {
    const stemData = result.data[stemName]
    if (stemData?.url) {
      resultStems.push({
        name: stemName,
        url: stemData.url,
        contentType: stemData.content_type ?? `audio/${outputFormat}`,
      })
    }
  }

  if (resultStems.length === 0) {
    return new Error('No stems returned from the API. Check model and stem names.')
  }

  return {
    stems: resultStems,
    model,
  }
}

// ─── download helper ────────────────────────────────────────────────────────

/** Download a stem from its URL and return the bytes. */
export async function downloadStem(url: string): Promise<Error | Uint8Array> {
  try {
    const response = await fetch(url)
    if (!response.ok) {
      return new Error(`Failed to download stem: HTTP ${response.status}`)
    }
    return new Uint8Array(await response.arrayBuffer())
  } catch (err) {
    return new Error(`Failed to download stem: ${err instanceof Error ? err.message : String(err)}`)
  }
}
