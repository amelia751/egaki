# Changelog

All notable changes to this project will be documented in this file.

## 0.7.2

1. **Fixed missing `spiceflow` and `@vitejs/plugin-react` dependencies** — both were listed as optional peer dependencies but imported unconditionally by the Vite plugin. Now included as regular dependencies so `egaki/vite` works out of the box without manually installing them.

## 0.7.1

1. **Fixed `egaki/vite` import failing from npm** — the Vite plugin export was pointing to raw `.ts` source files, which Node cannot load from `node_modules`. Now correctly points to compiled JS. The `./cached-generate` export had the same issue.
2. **Fixed path resolution in published package** — the Vite plugin resolves `app.tsx` and `motion-timing.ts` from the `src/vite/` directory. Previously it used `import.meta.url` directly, which broke when running from `dist/vite/`. Now resolves relative to the package root.

## 0.7.0

1. **MDX video framework** — write video scenes in MDX files, preview in a browser-based player, and export to MP4 via in-browser WebCodecs rendering. Each `#` heading becomes a timed section. Animation primitives (`Opacity`, `Scale`, `TranslateX`, `TranslateY`, `Blur`) handle motion with composable enter/exit animations:

   ```mdx
   ---
   fps: 30
   bpm: 120
   ---

   <Audio src="/soundtrack.mp3" />

   # Intro duration=3s

   <TranslateX from={-140} to={0} duration={0.7 * FPS}>
     <div style={{ fontSize: 72, fontWeight: 900, color: 'white' }}>Hello</div>
   </TranslateX>

   # Scene Two duration=8beats

   <Opacity from={0} to={1} duration={2 * BEAT}>
     <div style={{ fontSize: 48 }}>Built with egaki</div>
   </Opacity>
   ```

   Install the Vite plugin (`egaki/vite`), point it at your `.mdx` entry, and run `vite dev`. Heading durations support `s` (seconds), `beats` (from frontmatter `bpm`), and `frames` units. `FPS` and `BEAT` are available as scope variables in MDX expressions.

2. **`egaki speech` command** — text-to-speech generation with OpenAI, ElevenLabs, and Cartesia providers:

   ```bash
   egaki speech "Hello, welcome to egaki!" -o hello.mp3
   egaki speech "Breaking news" -m gpt-4o-mini-tts --instructions "News anchor tone"
   egaki speech "Smooth narration" -m sonic-3.5 --voice <voice-id> --speed 0.8
   cat script.txt | egaki speech --stdin -o narration.mp3
   ```

3. **`egaki transcribe` command** — speech-to-text with word-level timestamps from OpenAI, ElevenLabs, Deepgram, Groq, and Cartesia:

   ```bash
   egaki transcribe recording.mp3 -m whisper-1
   egaki transcribe podcast.mp3 -m ink-whisper   # Cartesia, cheapest
   egaki transcribe interview.wav --stdout
   ```

4. **`egaki demucs` command** — audio stem separation via fal.ai (no local torch needed):

   ```bash
   egaki demucs song.mp3 --stems vocals,drums,bass,other
   egaki demucs song.mp3 --stems vocals -o stems/
   ```

5. **`egaki voice clone` command** — clone a voice from audio for use with `egaki speech`:

   ```bash
   egaki voice clone vocals.mp3 --name "Narrator"
   egaki voice clone clip.mp3 --name "Speaker" --provider elevenlabs --remove-background-noise
   egaki speech "Hello" --voice <voice-id>
   ```

6. **`<Server>` RSC slots in MDX** — mark subtrees as React Server Components with `<Server>`. Children render server-side (async, fs/API access) and stream into the client tree:

   ```mdx
   import { TextToSpeech } from 'egaki/text-to-speech'

   # Narrated Scene duration=5s

   <Server>
     <TextToSpeech text="This narration is generated at dev time." />
   </Server>
   ```

   Files with `.server.tsx` extension are auto-wrapped in `<Server>` when imported into MDX.

7. **`GeneratedImage`, `GeneratedVideo`, `GeneratedSpeech` server components** — AI-generated media with filesystem caching and deduplication. Generate once, cache forever:

   ```tsx
   // hero.server.tsx
   import { GeneratedImage } from 'egaki/generate-media'

   export async function Hero() {
     return <GeneratedImage prompt="magical forest" model="imagen-4.0-generate-001" />
   }
   ```

8. **LayoutTransition FLIP animations** — elements animate from their position in the previous section to the new position using FLIP transforms. Supports cross-section and intra-scene transitions with `showFrom`/`showUpTo`:

   ```mdx
   # Scene 1 duration=3s
   <LayoutTransition id="title">**Hello**</LayoutTransition>

   # Scene 2 duration=3s
   <LayoutTransition id="title" duration={25} bounce={0.2}>**Hello**</LayoutTransition>
   ```

9. **WebGL shader components** — `BandsShader`, `WaveGradientShader`, `LiquidGradientShader`, `DispersionRingsShader` ported from Framer with full tweakpane integration. All props are exposed as live sliders and color pickers.

10. **Tweakpane integration** — `useTweakpane(label, schema)` registers live-editable parameters in a shared pane. Components show/hide their controls based on visibility. A "Copy changes" button exports all tweaked values as structured markdown.

11. **Framer Motion (`motion/react`) integration** — auto-detected when installed. `motion.div`, springs, variants, and staggered children work inside MDX sections with frame-deterministic rendering and backward scrubbing support.

12. **Easing curve engine** — ported from Jitter with 14 continuous preset functions (`smoothEasing`, `bounceEasing`, `overshootEasing`, `impulseOvershoot`, etc.) that accept any intensity 0-100. `cubicBezier()` from `egaki/video` attaches `BEZIER_POINTS` metadata for tweakpane editing:

    ```tsx
    import { EASE, smoothEasing, cubicBezier } from 'egaki/video'
    const x = interpolate(frame, [0, 60], [0, 500], { easing: EASE.smooth })
    ```

13. **`CodeBlock` component** — syntax-highlighted code with shiki and ray.so themes, built into MDX scope.

14. **`Fill` component** — full-frame layer like `AbsoluteFill` but children stretch horizontally and center vertically. Available in MDX without imports.

15. **`inline` and `style` props on animation primitives** — `inline` wraps in a plain `<div>` instead of full-frame `<Fill>`, so animated elements participate in flex/grid layout. `style` adds CSS to the wrapper.

16. **Auto-duration from media** — sections without explicit `duration` infer their length from the longest `<Audio>` or `<Video>` element inside them.

17. **Player redesign** — right sidebar layout, floating toolbar with playback rate control, keyboard shortcuts (J/K/L scrub, space play/pause), video trim controls, and cubic bezier blade for easing editing.

18. **Agent SDK (`window.egakiSDK`)** — programmatic control from Playwriter. Screenshot frames, export video segments, get composition info, filmstrip grid rendering, and element position mapping.

19. **Programmatic `egaki/generate` API** — import `generateImage`, `generateVideo`, `generateSpeech` directly from TypeScript without the CLI.

20. **Custom composition dimensions** — `width` and `height` in MDX frontmatter override the default 1920x1080. `scale` frontmatter field controls pixel density.

21. **Multi-entry MDX** — all `.mdx` files in the project root are served as separate routes, not just the configured entry.

22. **MDX LSP autocomplete** — built-in components get prop autocomplete in `.mdx` files via `@mdx-js/typescript-plugin` and auto-generated `egaki-env.d.ts`.

23. **Breaking: animation primitives replaced** — the 8 previous animation wrappers (`FadeIn`, `SlideIn`, `ScaleIn`, `FadeOut`, etc.) are replaced by 5 composable primitives (`Opacity`, `Scale`, `TranslateX`, `TranslateY`, `Blur`). Enter vs exit is inferred from `startInFrames` sign. Nest them to compose animations.

24. **Breaking: `gapBefore`/`gapAfter` replaced with `startInFrames`** — `<Audio>` and `<Video>` now use `startInFrames` (positive = delay from section start, negative = offset from section end).

## 0.6.0

1. **xAI provider with Grok image and video generation** — generate images and videos using xAI's Aurora and Grok models. Two auth paths: direct API key via `XAI_API_KEY` or Grok Build OAuth browser flow:

   ```bash
   # Direct API key
   egaki login --provider xai --key xai-xxx

   # OAuth (opens browser)
   egaki login --provider xai-oauth

   # Generate images
   egaki image "cyberpunk cityscape at dusk" -m grok-imagine-image -o city.png

   # Generate videos
   egaki video "a cat playing piano" -m grok-imagine-video -o cat.mp4
   ```

   Auth priority: explicit `XAI_API_KEY` > xAI OAuth > stored xai key > egaki gateway.

2. **New CLI flags for provider-specific options** — control quality, resolution, output format, and more per-provider:

   ```bash
   # Quality and resolution (xAI)
   egaki image "portrait" -m grok-imagine-image --quality high --resolution 2k

   # Output format
   egaki image "logo" -m grok-imagine-image --output-format png

   # Negative prompts (Fal models)
   egaki image "landscape" -m fal-ai/flux-pro/v1.1 --negative-prompt "blurry, low quality"

   # Video modes (xAI): edit, extend, reference-to-video
   egaki video "slow zoom out" -m grok-imagine-video --mode extend-video --input clip.mp4
   egaki video "a person walking" -m grok-imagine-video --mode reference-to-video --reference-images ref1.png ref2.png
   ```

   Flag descriptions are auto-derived from the model catalog so `--help` shows valid values per provider.

3. **Local file upload for video editing and reference images** — `--input` and `--reference-images` on the video command now accept local file paths. Files are uploaded to a temporary R2 bucket (auto-expires after 2 days) and the URL is passed to the provider:

   ```bash
   # Edit a local video file
   egaki video "add lens flare" -m grok-imagine-video --mode edit-video --input local-clip.mp4

   # Reference images from disk
   egaki video "person walking in park" -m grok-imagine-video --mode reference-to-video --reference-images photo1.jpg photo2.jpg
   ```

   The `--video-url` flag was removed; `--input` now handles both local files and URLs depending on the mode.

4. **Unified model catalog** — all image and video model definitions (provider, pricing, features, provider options) now live in a single `model-catalog.ts` file. Provider option schemas are sourced directly from `@ai-sdk/*` package types with URL comments pointing to upstream docs for easy verification.

5. **Type-safe provider options** — provider option objects passed to the AI SDK now use `satisfies` with the actual SDK types, catching mismatches at compile time instead of runtime.

6. **Fixed OAuth race condition** — the xAI OAuth callback server is now resilient to state mismatches from stale browser tabs or retried requests, preventing silent auth failures.

## 0.5.0

1. **Interactive model picker** — omitting `--model` now shows a select prompt with popular models instead of silently using a default:

   ```bash
   # Shows a model picker in the terminal
   egaki image "a dreamy watercolor landscape" -o landscape.png

   # Explicit model skips the picker
   egaki image "a dreamy watercolor landscape" -m imagen-4.0-generate-001 -o landscape.png
   ```

   Works for both `egaki image` and `egaki video`. In non-interactive (piped/scripted) mode, the default model is used automatically so existing scripts are unaffected.

## 0.4.1

1. **Added `gpt-image-2` model** — OpenAI's new flagship image generation model (released 2026-04-21) is now available in the model catalog:

   ```bash
   egaki image "a dreamy watercolor landscape" -m gpt-image-2 -o landscape.png
   egaki models --json | jq '.[] | select(.id == "gpt-image-2")'
   ```

   Supports editing, inpainting, and multiple output images. Token-based pricing (~$0.053 for medium-quality 1024×1024).

2. **`chatgpt-image-latest` now tracks `gpt-image-2`** — the rolling alias has been updated from `gpt-image-1.5` to `gpt-image-2`, with pricing adjusted accordingly.

## 0.4.0

1. **ChatGPT login for OpenAI image generation** — use your ChatGPT subscription in `egaki` without a separate OpenAI platform API key:

   ```bash
   egaki login --provider chatgpt
   egaki image "a dreamy studio ghibli style bakery at sunrise" -m gpt-image-1.5 -o bakery.png
   ```

   OpenAI image requests authenticated this way now follow the same Codex backend flow used by ChatGPT instead of the normal Image API path.

2. **ChatGPT-backed image editing** — edit existing images with OpenAI image models through the ChatGPT/Codex backend:

   ```bash
   egaki image "change the red jacket to a blue jacket" -m gpt-image-1.5 --input portrait.png -o portrait-blue.png
   egaki image "turn this product shot into a clay render" -m gpt-image-1.5 --input product.png -o product-clay.png
   ```

   Multiple input images are supported. For this backend path, `egaki` now explicitly rejects unsupported options like `--seed`, `--mask`, and multi-image output instead of pretending they work.

3. **Aspect ratio support for ChatGPT image generation** — supported ChatGPT/OpenAI aspect ratios now map to the backend's real size controls:

   ```bash
   egaki image "wide landscape matte painting" -m gpt-image-1.5 --aspect-ratio 3:2 -o wide.png
   egaki image "book cover concept art" -m gpt-image-1.5 --aspect-ratio 2:3 -o cover.png
   ```

   Supported ratios on this path are `1:1`, `3:2`, and `2:3`.

4. **`egaki models` now shows login availability** — model discovery output includes whether each provider is currently usable from your configured credentials:

   ```bash
   egaki models
   egaki models --json | jq '.[] | {id, provider, auth}'
   ```

   The output now includes `auth.available` and `auth.source` (`env`, `stored`, `oauth`, or `none`) so you can see which model families are ready to use.

## 0.3.0

1. **Google Vertex AI provider** — use Google Cloud billing instead of AI Studio by
   prefixing model IDs with `vertex/`:

   ```bash
   egaki login --provider vertex --key AIza...
   egaki image "product shot on marble" -m vertex/imagen-4.0-generate-001 -o product.png
   egaki image "editorial portrait" -m vertex/gemini-3.1-flash-image-preview --aspect-ratio 4:5
   egaki video "storm over mountains" -m vertex/veo-3.1-fast-generate-001 --duration 6 -o storm.mp4
   ```

   Bare model IDs (e.g. `imagen-4.0-generate-001`) continue to route through Google AI
   Studio as before. `vertex/` prefix routes through `@ai-sdk/google-vertex` using your
   `GOOGLE_VERTEX_API_KEY`. The two providers are fully independent — having one key does
   not affect the other.

   Supported Vertex models:
   - `vertex/imagen-4.0-generate-001`, `vertex/imagen-4.0-ultra-generate-001`, `vertex/imagen-4.0-fast-generate-001`
   - `vertex/gemini-2.5-flash-image`, `vertex/gemini-3-pro-image-preview`, `vertex/gemini-3.1-flash-image-preview`
   - `vertex/veo-3.1-generate-001`, `vertex/veo-3.1-fast-generate-001`

2. **`egaki models --provider vertex`** — list only Vertex models:

   ```bash
   egaki models --provider vertex
   ```

3. **Fixed confusing error for Vertex without a key** — if you attempt a `vertex/` model
   without a `GOOGLE_VERTEX_API_KEY` configured, you now get a clear error pointing you
   to set one up instead of a cryptic upstream failure.

## 0.2.0

1. **New `egaki video` command** — generate videos from text prompts or still images.
   Full support for all AI Gateway video providers:

   ```bash
   egaki video "a paper boat drifting on a calm lake at sunrise" -o boat.mp4
   egaki video "timelapse of a stormy sea" -m google/veo-3.1-generate-001 --duration 8 -o storm.mp4
   egaki video "animate the clouds slowly" --input photo.jpg -m klingai/kling-v2.6-i2v -o animated.mp4
   ```

   Supported models: Google Veo 3.0/3.1, Kling v2.5/v2.6/v3.0, Bytedance Seedance,
   Alibaba Wan, xAI Grok video.

2. **Full video options** — `--duration`, `--resolution`, `--aspect-ratio`, `--fps`,
   `--seed`, `--count`, `--input` (image-to-video), `--stdout`, `--json`.

3. **`egaki models --type` filter** — filter model listing by modality:

   ```bash
   egaki models --type video
   egaki models --type image
   egaki models --type all   # default
   ```

   Video models show duration range, capabilities (t2v, i2v, r2v), and resolution tiers.

4. **Egaki subscription covers video** — all gateway video models work with your
   `egaki_...` key; usage is billed per-second based on model, resolution, and duration.

## 0.1.0

1. **New `egaki video` command** — generate videos from text prompts using AI models
   via `experimental_generateVideo`:

   ```bash
   egaki video "a paper boat drifting on a calm lake at sunrise" -o boat.mp4
   egaki video "timelapse of a stormy sea" -m google/veo-3.1-generate-001 --duration 8 -o storm.mp4
   ```

   Supports all major AI Gateway video models: Google Veo 3.0/3.1, Kling v2.5/v2.6/v3.0,
   Bytedance Seedance, Alibaba Wan, and xAI Grok video.

2. **Image-to-video support** — animate a still image with models that support `i2v`:

   ```bash
   egaki video "slowly animate the clouds" --input photo.jpg -m klingai/kling-v2.6-i2v -o animated.mp4
   ```

3. **New video options** — `--duration`, `--resolution`, `--aspect-ratio`, `--fps`,
   `--seed`, `--count`, `--input`, `--stdout`, `--json` for full control over generation.

4. **`egaki models --type` filter** — filter model listing by modality:

   ```bash
   egaki models --type video
   egaki models --type image
   egaki models --type all   # default
   ```

   Video models show duration range, capabilities (t2v, i2v, r2v), and resolution tiers.

5. **Egaki subscription now covers video** — all gateway video models work with your
   `egaki_...` key; usage is tracked per-second based on model tier and duration.

6. **AI SDK dependencies pinned to exact versions** — `ai`, `@ai-sdk/google`,
   `@ai-sdk/fal`, `@ai-sdk/openai`, `@ai-sdk/replicate` are now pinned so AI Gateway
   protocol changes can't silently break the CLI.

## 0.0.2

- Make subscribe messaging explicit about both auth modes.
- Clarify BYOK provider keys vs single Egaki subscription key in CLI + docs.
- Expand README with advanced usage and model-specific command examples.

## 0.0.1

- Initial public release of the `egaki` CLI.
- Image generation command with model selection and file/stdout output.
- Login, subscription, unsubscribe, usage, and models commands.
