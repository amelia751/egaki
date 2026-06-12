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
 * Placeholder text-to-speech server component. Proves the bare-specifier
 * <Server> import path end to end; real synthesis (egaki gateway TTS →
 * <Audio> with the generated file) lands later.
 */
export async function TextToSpeech({ text, voice = 'alloy' }: TextToSpeechProps) {
  // Simulated async generation step so the streaming/Suspense path is
  // exercised like the real implementation will.
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
