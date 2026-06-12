/**
 * Built-in SERVER components for MDX <Server> blocks.
 *
 * No 'use client' directive: these execute in the RSC environment, so
 * they can be async, call APIs, and read the filesystem. Import them in
 * MDX via bare specifiers (e.g. `import { TextToSpeech } from
 * 'egaki/text-to-speech'`) and use them inside <Server> — app.tsx
 * resolves bare specifiers through vite's resolver at request time.
 */

interface TextToSpeechProps {
  /** Text to synthesize. */
  text: string
  /** Voice preset. */
  voice?: string
}

/**
 * TODO: Real TTS — call egaki gateway (or provider) synthesis, write audio
 * to the project/public path, return Remotion `<Audio src={...} />` (from
 * `@remotion/media`). This stub only proves bare-specifier `<Server>` imports.
 */
export async function TextToSpeech({ text, voice = 'alloy' }: TextToSpeechProps) {
  // TODO: replace with gateway TTS + <Audio>
  await new Promise((resolve) => setTimeout(resolve, 10))
  return (
    <span
      data-egaki-tts
      data-voice={voice}
      style={{ display: 'none' }}
      aria-hidden
    >
      {text}
    </span>
  )
}
