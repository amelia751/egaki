// Code snippets shown inside CodeBlock scenes of the launch video.
// Kept as plain template literals (no interpolation) so they render verbatim.

export const TESTIMONIAL_SNIPPET = `---
fps: 30
bpm: 129.2
---

import { TestimonialCard } from './components'

# Testimonial duration=8beats

<Background>
  <WaveGradientShader
    colors={['#0a0a2e', '#1a0a3e', '#00d0ff', '#ff6b9d']}
  />
</Background>

<TestimonialCard
  quote="egaki writes our launch videos for us.
    Every release ships with a video now."
  author="John Doe, CEO of Acme"
/>`

export const ANATOMY_SNIPPET = `# Hero duration=8beats

<GeneratedSpeech
  text="Ship your launch video today."
  model="sonic-3"
  voice="marketing-voice"
/>

<Caption words={[
  { word: 'Ship', delay: 0 },
  { word: 'it', delay: 0.3 * FPS },
]} />

<GeneratedImage
  prompt="product hero shot, studio lighting"
  aspectRatio="16:9"
/>`
