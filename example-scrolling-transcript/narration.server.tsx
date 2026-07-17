// Server component that generates TTS audio from markdown sections,
// transcribes it to get word-level timestamps, and renders a
// ScrollingTranscript with audio-synced word highlighting.
//
// Uses .server.tsx extension so it auto-wraps in <Server> and runs
// in the RSC environment (async, filesystem access, API calls).
//
// The TTS and transcription happen asynchronously: the ScrollingTranscript
// renders immediately with WPM-based default timing, then switches to
// real word timestamps once the promises resolve. Audio playback starts
// when the TTS promise resolves (via promise src support in <Audio>).

import { readAssetBytes } from 'egaki/generate-media'
import { Audio } from 'egaki/video'
import { ScrollingTranscript, type ScrollingTranscriptProps } from './scrolling-transcript'
import { alignWordsToSections, extractPlainText, type ScrollSection } from './transcript-utils'

export interface NarrationProps extends Omit<ScrollingTranscriptProps, 'wordTimings' | 'wordTimingsPromise'> {
  /** Markdown sections with per-section scroll speed */
  sections: ScrollSection[]
  /** TTS generation options. Generates speech from the concatenated
   *  section text (markdown stripped via AST). */
  tts?: {
    model?: string
    voice?: string
    instructions?: string
  }
  /** Transcription model ID. Defaults to 'whisper-1' (word timestamps). */
  transcriptionModel?: string
}

export async function Narration({
  sections,
  tts,
  transcriptionModel,
  ...rest
}: NarrationProps) {
  if (!tts) {
    return <ScrollingTranscript sections={sections} {...rest} />
  }

  const fullText = sections.map((s) => extractPlainText(s.markdown)).join('\n\n')
  const { generateSpeech } = await import('egaki/generate')

  // Start TTS as a promise — not awaited. The Audio component accepts
  // Promise<string> for src and resolves it internally via Suspense.
  const audioSrcPromise: Promise<string> = generateSpeech({ text: fullText, ...tts })
    .then((result) => {
      if (result instanceof Error) throw result
      return result.src
    })

  // Chain transcription after TTS resolves: read audio bytes, transcribe,
  // align word timestamps to sections. This promise is passed to the client
  // component which resolves it via useEffect and switches from WPM timing
  // to real audio-synced timing.
  const { transcribeAudio } = await import('egaki/generate')
  const wordTimingsPromise = audioSrcPromise.then(async (src) => {
    const audioBytes = await readAssetBytes(src)
    const result = await transcribeAudio({ audio: audioBytes, model: transcriptionModel, filename: src })
    if (result instanceof Error) throw result
    const wordTimings = alignWordsToSections(sections, result)
    const lastSection = wordTimings[wordTimings.length - 1]
    const lastWord = lastSection?.[lastSection.length - 1]
    if (lastWord) {
      console.log(`[egaki] narration: ${result.length} words, ~${Math.ceil(lastWord.endSecond)}s`)
    }
    return wordTimings
  })

  return (
    <>
      <Audio src={audioSrcPromise} />
      <ScrollingTranscript
        sections={sections}
        wordTimingsPromise={wordTimingsPromise}
        {...rest}
      />
    </>
  )
}
