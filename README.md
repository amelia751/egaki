# egaki

Generate AI images and videos from the terminal with one command.

`egaki` is a TypeScript CLI built on the Vercel AI SDK and goke. It supports
Google Imagen, Gemini image-capable models, video generation (Veo, Kling, Wan,
Bytedance Seedance, xAI Grok), and model discovery with pricing.

## Install

```bash
pnpm add -g egaki
```

## Quick start

```bash
egaki login
egaki image "a watercolor fox reading a map" -o fox.png
egaki video "a paper boat drifting on a calm lake at sunrise" -o boat.mp4
```

### Quick start with ChatGPT auth

```bash
egaki login --provider chatgpt
egaki image "a dreamy studio ghibli style bakery at sunrise" -m gpt-image-1.5 -o bakery.png
egaki image "change the red jacket to a blue jacket" -m gpt-image-1.5 --input portrait.png -o portrait-blue.png
```

## CLI examples

### Generate an image from text

```bash
egaki image "cinematic mountain village at sunrise" -o village.png
egaki image "isometric floating city, detailed, soft colors" -m imagen-4.0-generate-001
```

### Edit with an input image

```bash
egaki image "add a red scarf and make it winter" --input portrait.jpg -o portrait-winter.png
egaki image "turn this into a manga panel" --input https://example.com/photo.jpg -o manga.png
egaki image "change the red square to a blue square" -m gpt-image-1.5 --input input.png -o output.png
```

### Inpainting with a mask

```bash
egaki image "replace the sky with dramatic storm clouds" --input landscape.png --mask mask.png -o storm.png
```

### Generate multiple images

```bash
egaki image "minimal logo concepts for a cat cafe" -n 4 -o logo.png
```

### Control composition

```bash
egaki image "cyberpunk alley at night" --aspect-ratio 16:9
egaki image "polaroid-style travel photo" --aspect-ratio 4:5
egaki image "wide landscape matte painting" -m gpt-image-1.5 --aspect-ratio 3:2 -o wide.png
```

### Use Google Cloud billing via Vertex AI

```bash
egaki login --provider vertex --key AIza...
egaki image "editorial sneaker photo on white seamless" -m vertex/imagen-4.0-generate-001 -o sneaker.png
egaki video "storm over mountains" -m vertex/veo-3.1-fast-generate-001 --duration 6 -o storm.mp4
```

### Pipe image output to other tools

```bash
egaki image "flat icon of a fox" --stdout | magick - -resize 512x512 fox-icon.png
```

---

### Generate a video from text

```bash
egaki video "a paper boat drifting on a calm lake at sunrise" -o boat.mp4
egaki video "timelapse of a stormy sea, cinematic" -m veo-3.1-generate-001 --duration 8 -o storm.mp4
```

### Generate with a cheap model

```bash
# Kling v2.5 Turbo — fast and inexpensive
egaki video "a cat walking on a rooftop at night" -m klingai/kling-v2.5-turbo-t2v --duration 5 -o cat.mp4
```

### Image-to-video

```bash
# Animate a still image (model must support i2v)
egaki video "slowly animate the clouds" --input photo.jpg -m klingai/kling-v2.6-i2v -o animated.mp4
```

### Control resolution and aspect ratio

```bash
egaki video "aerial drone shot over a city grid" \
  -m veo-3.1-fast-generate-001 \
  --aspect-ratio 16:9 \
  --resolution 1080p \
  --duration 6 \
  -o city.mp4
```

### Generate multiple videos

```bash
egaki video "waves crashing on cliffs at golden hour" -n 2 -o waves.mp4
# writes waves.mp4 and waves-1.mp4
```

### Pipe video output to other tools

```bash
egaki video "looping rain animation" --stdout | ffmpeg -i pipe:0 -vf fps=12 rain.gif
```

---

### xAI Grok image generation

```bash
# Basic text-to-image
egaki image "a fox wearing armor in a misty forest" -m grok-imagine-image -o fox.png

# High quality + 2K resolution
egaki image "product photo of a ceramic vase on linen" \
  -m grok-imagine-image-quality \
  --quality high \
  --resolution 2k \
  -o vase.png

# Edit an existing image
egaki image "add dramatic storm clouds to the sky" \
  -m grok-imagine-image \
  --input landscape.jpg \
  -o landscape-storm.png

# Generate multiple variations
egaki image "abstract geometric pattern" -m grok-imagine-image -n 3 -o pattern.png
# writes pattern-0.png, pattern-1.png, pattern-2.png

# Control aspect ratio and output format
egaki image "vertical phone wallpaper, aurora borealis" \
  -m grok-imagine-image \
  --aspect-ratio 9:16 \
  --output-format jpeg \
  -o wallpaper.jpg
```

### xAI Grok video generation

```bash
# Basic text-to-video
egaki video "a paper airplane gliding through clouds" \
  -m grok-imagine-video \
  --duration 5 \
  -o airplane.mp4

# Text-to-video with resolution and aspect ratio
egaki video "cinematic drone shot over a city at sunset" \
  -m grok-imagine-video \
  --duration 8 \
  --resolution 720p \
  --aspect-ratio 16:9 \
  -o city.mp4

# Image-to-video (animate a still image)
egaki video "slowly pan across the scene with gentle wind" \
  -m grok-imagine-video \
  --input photo.jpg \
  --duration 5 \
  -o animated.mp4

# Video editing (modify an existing video — pass the source via --input)
egaki video "make it look like a watercolor painting" \
  -m grok-imagine-video \
  --mode edit-video \
  --input ./original.mp4 \
  -o edited.mp4

# Video extension (continue from last frame)
egaki video "the camera keeps moving forward" \
  -m grok-imagine-video \
  --mode extend-video \
  --input ./clip.mp4 \
  -o extended.mp4

# Reference-to-video (R2V): generate a video guided by 1-7 reference images.
# The images act as style and content references (not as the first frame).
# Accepts local files or URLs; local files are uploaded automatically.
egaki video "the model walks down a white runway wearing the outfit from the reference" \
  -m grok-imagine-video \
  --mode reference-to-video \
  --reference-images ./model-face.jpg \
  --reference-images ./outfit.jpg \
  --duration 8 \
  -o runway.mp4

# Low-res draft for quick iteration
egaki video "test animation concept" \
  -m grok-imagine-video \
  --duration 3 \
  --resolution 480p \
  -o draft.mp4
```

### xAI Grok auth

```bash
# Option 1: direct API key
egaki login --provider xai --key xai-...

# Option 2: Grok Build subscription (browser OAuth)
egaki login --provider xai-oauth

# Check auth status
egaki login --show
```

---

### Discover models and pricing

```bash
egaki models
egaki models --type video
egaki models --type image
egaki models --provider google
egaki models --json
```

---

### Advanced image examples

```bash
# Deterministic result (models that support seed)
egaki image "studio product shot of a ceramic mug" \
  -m imagen-4.0-generate-001 \
  --seed 42 \
  -o mug-seed-42.png

# High quality Gemini image generation with 4K output
egaki image "architectural concept art, brutalist library interior" \
  -m gemini-2.5-flash-image \
  --image-size 4K \
  --aspect-ratio 16:9 \
  -o library-4k.png

# Multi-reference edit (pass --input multiple times)
egaki image "blend style from first image and color palette from second" \
  --input style-reference.jpg \
  --input palette-reference.jpg \
  -m nano-banana-pro-preview \
  -o hybrid-style.png

# JSON mode for automation/pipelines
egaki image "futuristic sneaker concept" \
  -m gpt-image-1.5 \
  --json \
  -o sneaker.png

# Batch generation with indexed output names
egaki image "mascot variations, flat vector look" \
  -m gpt-image-1-mini \
  -n 6 \
  -o mascot.png
# writes mascot-0.png ... mascot-5.png
```

## Model quick reference

### Image models

| Model ID | Best for | Example command |
| --- | --- | --- |
| `imagen-4.0-ultra-generate-001` | High-quality prompt-to-image with seed + ratio | `egaki image "luxury perfume ad on marble" -m imagen-4.0-ultra-generate-001 --aspect-ratio 3:4 --seed 7 -o perfume.png` |
| `gemini-3.1-flash-image-preview` | Fast, cheap text+image edits with wide aspect-ratio support | `egaki image "turn into manga splash page" -m gemini-3.1-flash-image-preview --input portrait.jpg --aspect-ratio 4:1 -o manga-wide.png` |
| `nano-banana-pro-preview` | Highest-fidelity Google text+image output | `egaki image "fashion editorial, dramatic rim light" -m nano-banana-pro-preview --input model.jpg --image-size 2K -o editorial.png` |
| `gpt-image-1.5` | OpenAI image generation with strong editing/inpainting | `egaki image "replace background with neon city" -m gpt-image-1.5 --input product.png --mask bg-mask.png -o product-neon.png` |
| `fal-ai/flux/schnell` | Very fast low-cost ideation batches | `egaki image "logo sketch, geometric fox" -m fal-ai/flux/schnell -n 8 -o fox-logo.png` |

### Video models

| Model ID | Best for | Example command |
| --- | --- | --- |
| `veo-3.1-generate-001` | Highest quality video with audio, up to 4K | `egaki video "rainy Tokyo street at night" -m veo-3.1-generate-001 --duration 8 -o tokyo.mp4` |
| `veo-3.1-fast-generate-001` | Fast Veo with 720p–4K, good for iteration | `egaki video "abstract paint patterns" -m veo-3.1-fast-generate-001 --duration 5 -o paint.mp4` |
| `vertex/veo-3.1-generate-001` | Same as above, routed through Vertex AI | `egaki video "rainy Tokyo street" -m vertex/veo-3.1-generate-001 --duration 8 -o tokyo.mp4` |
| `klingai/kling-v2.5-turbo-t2v` | Cheap, fast Kling text-to-video | `egaki video "a paper boat on a pond" -m klingai/kling-v2.5-turbo-t2v --duration 5 -o boat.mp4` |
| `bytedance/seedance-v1.5-pro` | Bytedance, audio support, three resolutions | `egaki video "timelapse of clouds above mountains" -m bytedance/seedance-v1.5-pro -o clouds.mp4` |
| `grok-imagine-video` | xAI video with editing, extension, R2V | `egaki video "a dog catching a frisbee" -m grok-imagine-video --duration 5 -o dog.mp4` |

## Feature support by model family

- **Google Imagen (`imagen-*`)**: supports `--seed`, `--aspect-ratio`, `--input`, `--mask`, `-n`
- **Google Gemini image models**: supports `--input`, `--aspect-ratio`, `--image-size`; usually no `--seed`
- **OpenAI image models**: strong editing and inpainting; size controls are model-specific
- **BFL image models (`flux-*`)**: Kontext/Pro variants via AI Gateway subscription
- **Recraft models (`recraft-*`)**: v2/v3/v4 families available via AI Gateway subscription
- **xAI image models (`grok-imagine-*`)**: `--quality`, `--resolution`, `--output-format`, `--input` for editing, `-n` for batches. Auth via API key or Grok Build OAuth
- **Vertex models (`vertex/*`)**: same models as Google AI Studio, routed through Vertex AI / Google Cloud billing
- **Google Veo video models**: up to 4K, audio optional, duration 4–8s
- **Kling video models**: mode (std/pro), audio on v2.6+, image-to-video support
- **Bytedance Seedance**: 480p–1080p, audio support on v1.5-pro
- **xAI Grok video (`grok-imagine-video`)**: 480p–720p, 1–15s, i2v, video editing, video extension, R2V from reference images

## Subscription and usage

egaki supports **both** authentication modes:

- **BYOK (bring your own keys):** add provider keys with `egaki login` per provider.
- **ChatGPT auth:** log in with `egaki login --provider chatgpt` to use the ChatGPT/Codex backend for supported OpenAI image generation and editing flows.
- **xAI Grok Build auth:** log in with `egaki login --provider xai-oauth` to use your Grok Build subscription for xAI image and video generation.
- **Egaki subscription:** use one `egaki_...` key to access all supported models without managing keys for each provider.
- **Google vs Vertex:** bare model IDs (e.g. `imagen-4.0-generate-001`) use Google AI Studio. Prefix with `vertex/` (e.g. `vertex/imagen-4.0-generate-001`) to route through Vertex AI / Google Cloud billing.

```bash
# Subscribe and get a checkout URL
egaki subscribe --email user@example.com --plan pro

# Subscribe without email prefill
egaki subscribe --plan pro

# Save your Egaki key after checkout
egaki login --provider egaki --key egaki_...

# BYOK examples (direct provider keys)
egaki login --provider google --key AIza...
egaki login --provider vertex --key AIza...

# ChatGPT OAuth for Codex-backed image generation/editing
egaki login --provider chatgpt
egaki image "turn this product shot into a clay render" -m gpt-image-1.5 --input product.png -o product-clay.png

# Check subscription usage / cancel
egaki usage
egaki unsubscribe
```

## Help

```bash
egaki --help
egaki image --help
egaki video --help
egaki models --help
```

## Auth and billing

- `egaki login` stores provider keys in `~/.config/egaki/credentials.json`.
- `egaki subscribe`, `egaki usage`, and `egaki unsubscribe` manage Egaki plans.
- Video costs are tracked per-second based on model, resolution, and duration.

## License

MIT
