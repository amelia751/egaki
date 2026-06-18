// OpenAI speech provider for egaki.
// Wraps the Vercel AI SDK @ai-sdk/openai since OpenAI TTS has no
// timestamp support. Returns audio only, timestamps are always undefined.
import {
  experimental_generateSpeech as aiGenerateSpeech,
} from 'ai'
import type { SpeechProvider, SpeechProviderOptions, SpeechProviderResult } from './speech-generate.js'

export function createOpenAISpeechProvider(): SpeechProvider {
  return {
    async generate(options: SpeechProviderOptions): Promise<SpeechProviderResult> {
      const { openai } = await import('@ai-sdk/openai')
      const model = openai.speech(options.modelId)

      const result = await aiGenerateSpeech({
        model,
        text: options.text,
        ...(options.voice ? { voice: options.voice } : {}),
        ...(options.outputFormat ? { outputFormat: options.outputFormat } : {}),
        ...(options.instructions ? { instructions: options.instructions } : {}),
        ...(options.speed != null ? { speed: options.speed } : {}),
        ...(options.language ? { language: options.language } : {}),
        ...(options.abortSignal ? { abortSignal: options.abortSignal } : {}),
      })

      return {
        audio: result.audio.uint8Array,
        mediaType: result.audio.mediaType || 'audio/mpeg',
        // OpenAI TTS does not support word timestamps
        timestamps: undefined,
      }
    },
  }
}
