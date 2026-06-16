## Code style

**Inline single-use values.** Do not extract constants for objects, numbers, strings, or
expressions that are only used once. Inline them at the usage site. Named constants should
only exist when the value is used in multiple places or when the name carries important
semantic meaning that the raw value does not convey. This applies to all egaki component
files, example recreations, and video templates.

**HMR-safe global state (server code only).** The Vite plugin explicitly invalidates
RSC/SSR modules on user file changes (`hotUpdate` in `vite-plugin.ts`), so server-side
module-level state resets mid-session. Any mutable state in server code (`app.tsx`,
`server-components.tsx`, files without `'use client'`) that must survive these
invalidations (caches, queues, in-flight promises) must be stored on `globalThis`
with a `??=` initializer:

```ts
const generationQueue: Map<string, Promise<string>> =
  (globalThis as any).__egakiGenerationQueue ??= new Map()
```

Client-side code (`'use client'` files like `mdx-client.tsx`, `tweakpane-hook.tsx`,
`code-block.tsx`, etc.) does NOT need this pattern. Vite's HMR watcher excludes
`node_modules`, and the only HMR boundary in `mdx-client.tsx` is a dependency-accept
for `virtual:egaki-modules` (the module itself does not re-execute). React Fast Refresh
patches component functions in place without re-running module scope. Client module-level
`Map`s, `Set`s, and singletons are safe as bare initializers.

**Import easings from egaki, never redefine them.** `egaki/video` exports `EASE` (preset
curves at intensity 50), continuous preset functions like `smoothEasing(intensity)`,
`impulseOvershoot(intensity)`, and primitives like `polybezier()`. When a component needs
`bezier(0.5, 0, 0, 1)` that is `EASE.smooth`; `bezier(0.9, 0, 0, 1)` is
`smoothEasing(100)`. Always check `EASE.*` and the `*Easing(intensity)` functions before
defining a local easing constant. Only define a local curve when it is a project-specific
Jitter extraction that has no matching egaki preset.

## MDX LSP autocomplete for built-in components

Every egaki video project must have MDX LSP support so built-in components
(`FadeIn`, `SlideIn`, `BlurReveal`, etc.) get autocomplete with prop types
in `.mdx` files. This requires three things:

1. **`@mdx-js/typescript-plugin`** installed as a devDependency.
2. **`tsconfig.json`** with the plugin registered, `checkMdx` enabled, and
   `.mdx` files included:

```json
{
  "compilerOptions": {
    "plugins": [{ "name": "@mdx-js/typescript-plugin" }]
  },
  "mdx": { "checkMdx": true },
  "include": ["**/*.ts", "**/*.tsx", "**/*.d.ts", "**/*.mdx"]
}
```

3. **`egaki-env.d.ts`** in the project root with:

```ts
import 'egaki/mdx-components'
```

The vite plugin auto-generates `egaki-env.d.ts` on first run. The global
`MDXProvidedComponents` type is declared in `cli/src/vite/mdx-provided-components.ts`
and derives from `MDX_BUILTIN_COMPONENTS` in `mdx-video.tsx`, so adding a new
component to the runtime map automatically makes it available in the LSP.

When creating new example projects, always include all three pieces. After
changes, restart the TS server in VS Code for the MDX LSP to pick them up.

### IDE setup

**VS Code**: install the [MDX extension](https://marketplace.visualstudio.com/items?itemName=unifiedjs.vscode-mdx).
It bundles `@mdx-js/typescript-plugin` and the language server. Make sure
`mdx.server.enable` is `true` (the default). Restart the TS server after
adding `egaki-env.d.ts` or changing tsconfig.

**Zed**: install the [zed-mdx](https://github.com/srazzak/zed-mdx) extension.
TypeScript support is **off by default**; enable it in `settings.json`:

```json
{
  "languages": {
    "MDX": {
      "lsp": {
        "mdx-analyzer": {
          "initialization_options": {
            "typescript": { "enabled": true }
          }
        }
      }
    }
  }
}
```

### Limitations

`tsc` cannot check `.mdx` files. TypeScript plugins are editor-only;
they do not run with the `tsc` CLI. MDX type checking is limited to
the editor LSP. A dedicated `@mdx-js/cli` is tracked upstream at
https://github.com/mdx-js/mdx-analyzer/issues/292 but does not exist yet.

## Conventions

**CLI framework:** Built with [goke](https://github.com/remorses/goke), a type-safe CLI
framework for TypeScript. Commands, options, and help text are defined in `cli/src/cli.ts`
using goke's API. Run `egaki --help` to see everything.

**Model discovery:** `egaki --help` shows commands and flags, but it does **not** list
all valid model IDs. When you need to know which models/providers can be passed to
`egaki image` or `egaki video`, use:

```bash
egaki models
egaki models --json
egaki models --type image
egaki models --type video
egaki models --provider openai
```

Use `egaki models --json` when an agent needs the exact model IDs in a machine-readable form.

**Error handling:** This project uses [errore](https://errore.org) — Go-style error
handling for TypeScript. Functions return `Error | T` unions instead of throwing.
Check errors with `instanceof Error` and early-return them.

**Do NOT wrap goke command action handlers in try/catch.** Goke already catches
errors thrown inside `.action()` callbacks and prints them. Wrapping in try/catch
is redundant and breaks goke's built-in error formatting. Use errore's return-based
error handling inside handlers instead:

```ts
cli.command("example", "Do something").action(async (options) => {
  // errore style: return errors as values, handle with instanceof
  const result = await doThing();
  if (result instanceof Error) {
    console.error(result.message);
    process.exit(1);
  }
  // happy path continues at root level
});
```

## Vercel AI SDK image generation docs

Before making changes to image generation logic, read the relevant AI SDK docs.
Append `.md` to any URL below to get clean markdown as plain text.

- https://ai-sdk.dev/docs/ai-sdk-core/image-generation
- https://ai-sdk.dev/docs/reference/ai-sdk-core/generate-image
- https://ai-sdk.dev/docs/reference/ai-sdk-core/wrap-image-model
- https://ai-sdk.dev/docs/reference/ai-sdk-errors/ai-no-image-generated-error
- https://ai-sdk.dev/docs/troubleshooting/high-memory-usage-with-images
- https://ai-sdk.dev/cookbook/guides/google-gemini-image-generation

For example: `curl https://ai-sdk.dev/docs/ai-sdk-core/image-generation.md`

## ChatGPT OAuth image generation

ChatGPT OAuth image generation in `egaki` mirrors the Codex backend flow, not
the normal OpenAI Image API. See `docs/chatgpt-codex-image-backend.md` before
changing this path.

Important Codex sources:

- https://github.com/openai/codex/blob/main/codex-rs/tools/src/tool_spec.rs
- https://github.com/openai/codex/blob/main/codex-rs/protocol/src/models.rs
- https://github.com/openai/codex/blob/main/codex-rs/core/tests/common/responses.rs

The key detail: ChatGPT-auth image requests go to
`https://chatgpt.com/backend-api/codex/responses` with the built-in
`image_generation` tool and user `input_image` content items for image-to-image.

To find more relevant docs, fetch the sitemap and grep for keywords:

```bash
curl -s https://ai-sdk.dev/sitemap.xml | grep -oP '(?<=<loc>)[^<]+' | grep image
```

## Egaki Gateway (Cloudflare Worker)

The `gateway/` directory contains a Cloudflare Worker that proxies AI requests
through the Vercel AI Gateway. It handles Stripe subscriptions, API key validation,
and dollar-based usage tracking.

**Model costs are derived from the catalog.** `gateway/src/plans.ts` imports
`CATALOG` from `cli/src/model-catalog.ts` directly. Wrangler's bundler resolves the
cross-directory import at build time, so there's no duplication. When you add or
update models in the catalog, the gateway picks up the costs automatically.

**Deploy:** `cd gateway && pnpm run deploy`

**Secrets (managed via Doppler):** `AI_GATEWAY_API_KEY`, `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `RESEND_FROM`

## Vercel AI Gateway models endpoint

The AI Gateway exposes a public models catalog at:

```
GET https://ai-gateway.vercel.sh/v1/models
```

No auth required. Returns JSON with all available models, capabilities, and pricing.
Use this to discover new models and update `cli/src/model-catalog.ts`.

When updating model support in the CLI, always:

1. Check `https://ai-gateway.vercel.sh/v1/models` for new model IDs.
2. Add missing image-capable models to `cli/src/model-catalog.ts`.
3. If `/v1/models` lacks per-image pricing, source price from provider docs and
   record it manually in the catalog.

**Current limitation (as of Feb 2026):** Pure image models (`type: "image"`) return
`"input": "0", "output": "0"` — the actual per-image cost is NOT in the API response.
Only per-token pricing for language models is accurate. Per-image costs must be sourced
manually from provider pricing pages for now. Hopefully this will be fixed eventually.

```bash
# Fetch all models (no truncation)
curl -s https://ai-gateway.vercel.sh/v1/models | jq '.'

# List all image-capable model IDs with their types
curl -s https://ai-gateway.vercel.sh/v1/models | jq -r '.data[] | select(.tags | index("image-generation")) | "\(.id) (\(.type))"'

# List all video-capable model IDs with their type and duration pricing tiers count
curl -s https://ai-gateway.vercel.sh/v1/models | jq -r '.data[] | select(.type == "video") | "\(.id) (\(.type)) tiers=\((.pricing.video_duration_pricing // []) | length)"'

# Inspect endpoint-level provider details for one model (pricing, params, capabilities)
curl -s https://ai-gateway.vercel.sh/v1/models/google/veo-3.1-generate-001/endpoints | jq '.'
```

## AI Gateway wire format source of truth

When parsing AI Gateway request payloads in `gateway/src/worker.ts`, do not guess
provider-specific fields. Use the `@ai-sdk/gateway` source code as the source of truth
for what gets sent over the wire.

Fetch source once if missing:

```bash
npx opensrc @ai-sdk/gateway
```

Then read these files in `opensrc/repos/github.com/vercel/ai/packages/gateway/src/`:

- `gateway-video-model.ts` — exact request body for `/video-model`
- `gateway-image-model.ts` — exact request body for `/image-model`
- `gateway-language-model.ts` — exact request body/headers for `/language-model`
- `gateway-video-model.test.ts` — request/response examples, including optional fields

For video specifically, the current body fields are:
`prompt`, `n`, `aspectRatio`, `resolution`, `duration`, `fps`, `seed`, `providerOptions`, `image`.
`providerOptions` is passed through as-is (opaque), so billing logic must not depend on
assumed provider-specific keys unless those keys are explicitly guaranteed by upstream docs.

<!-- opensrc:start -->

## Source Code Reference

Source code for dependencies is available in `opensrc/` for deeper understanding of implementation details.

See `opensrc/sources.json` for the list of available packages and their versions.

Use this source code when you need to understand how a package works internally, not just its types/interface.

### Fetching Additional Source Code

To fetch source code for a package or repository you need to understand, run:

```bash
npx opensrc <package>           # npm package (e.g., npx opensrc zod)
npx opensrc pypi:<package>      # Python package (e.g., npx opensrc pypi:requests)
npx opensrc crates:<package>    # Rust crate (e.g., npx opensrc crates:serde)
npx opensrc <owner>/<repo>      # GitHub repo (e.g., npx opensrc vercel/ai)
```

# egaki video

MDX-to-video framework built on Remotion and Spiceflow. Write MDX with headings as section boundaries; each heading becomes a timed Remotion `Series.Sequence`. Frontmatter sets global `fps` and `bpm`.

### Heading duration and transition units

`duration` and `transition` props on headings accept a number with an optional unit suffix:

| Unit | Example | Meaning |
|---|---|---|
| `s` | `duration=3.5s` | Seconds (multiplied by fps) |
| `beats` / `beat` | `duration=8beats` | Beats (using frontmatter `bpm`) |
| `frames` / `frame` / `fps` / `f` | `duration=90frames` | Raw frames |
| *(bare number)* | `duration=90` | Raw frames (same as `frames`) |

```mdx
---
fps: 30
bpm: 120
---

# Intro duration=3s

# Verse duration=8beats

# Bridge duration=90frames transition=15f

# Outro duration=2s transition=0.5s
```

## How it works

```
MDX file
  │
  ▼
app.tsx (server, Spiceflow RSC)
  └── passes ONLY the raw MDX source string to the client via RSC flight
        │
        ▼
mdx-client.tsx ('use client', runs in the browser)
  ├── safe-mdx parses AST, resolves user imports via virtual:egaki-modules
  ├── mdx-parse.ts ──► split into MdxSection[] by headings, parse durations
  ├── renders each section to JSX (everything is client-side React)
  └── renders PlayerPage with the sections
        │
        ▼
player-page.tsx (client)
  ├── wraps sections in Remotion <Series> / <Series.Sequence>
  ├── renders interactive <Player> with controls
  └── "Export MP4" button ──► render-client.ts
                                 └── @remotion/web-renderer renderMediaOnWeb()
                                     (WebCodecs + HTML-in-canvas, fully in-browser)
```

**MDX renders fully on the client.** There is no RSC serialization boundary between MDX content and components, so MDX expression props can be functions (`easing={x => x}`, evaluated by safe-mdx's safe AST interpreter with `evaluateOptions: { functions: true }` — no eval), and user `.tsx` components don't need a `'use client'` directive.

## `<Server>` — server component slots

`<Server>` is a **reserved MDX element** marking a subtree as React Server Components. Its children render in the RSC environment in app.tsx (async allowed, fs/API access, promises stream to client children through flight) and get spliced into the client tree as a slot.

```mdx
import { AsyncStats } from './async-stats'
import { TextToSpeech } from 'egaki/text-to-speech'

# Analytics duration=6s

<FadeIn duration={15}>
  <Server>
    <AsyncStats />
    <TextToSpeech text="Analytics that build themselves." />
  </Server>
</FadeIn>
```

How it works:

- app.tsx finds `<Server>` nodes (`findServerNodes`) and **dynamically imports** exactly the modules referenced inside them (`collectServerImportSources` scans JSX names + expression identifiers inside `<Server>` subtrees and matches them against MDX import statements — no filename convention needed). There is no static rsc module map; paths resolve at request time.
- **Bare specifiers work** (`import { TextToSpeech } from 'egaki/text-to-speech'`): app.tsx resolves them to file paths via `createRequire(projectRoot)` (node_modules + package exports), then imports through the RSC module runner. The resolved file's `'use client'` directive (or absence) decides client ref vs server component. Requires safe-mdx ≥ 1.11.2 (`resolveModulePath` exact-key match for bare specifiers). Built-in server components live in `cli/src/vite/server-components.tsx`.
- Each node's children render server-side and become `serverSlots` keyed by the node's **start line**.
- The MDX string sent to the client has each `<Server>` block **blanked to `<Server />` with newline padding** (`blankServerContents`), preserving the exact line count so slot keys, `data-markdown-line`, and sourcemaps stay aligned with the original file — and the client never parses server-only content.
- On the client, `Server` is a real component in the components map that reads `ServerSlotsContext` and matches its slot via its `data-markdown-line` prop. (A safe-mdx `renderNode` hook can NOT be used: nested JSX children go through `jsxTransformer`, which bypasses the hook.)
- Import statements are filtered **per-statement** to each environment's resolvable modules (`filterImportNodesToModules`; contiguous import lines parse as a single `mdxjsEsm` node).

Conventions and rules:

- Files referenced inside `<Server>` execute in the RSC env. They do NOT need a special filename — but **`*.server.{ts,tsx}` remains a hard override**: such files are excluded from the client/ssr module maps and never bundled to the browser. Use the postfix for files with API keys or node-only imports.
- Each `<Server>` must start on its **own line** (slots are keyed by line; duplicates warn and only the first renders).
- Inside `<Server>` normal RSC rules apply: no function props into client refs, no Remotion hooks (built-ins like `FadeIn` are client refs and work fine as slot children).
- Editing a file referenced inside `<Server>` triggers `rsc:update` → flight refetch → fresh slots. The refetch **remounts the Player** (frame resets to 0) — a spiceflow payload-swap behavior; regular file edits intentionally do NOT send rsc:update for this reason. Moving components in/out of `<Server>` is just an entry-MDX edit — no reload needed.
- v1 limitations: `<Server>` inside imported `.mdx` files is ignored (warns); imported `.mdx` files inside `<Server>` are not supported; components reaching `<Server>` only through element variables (not JSX names) are not detected.

**Vite plugin** (`src/vite/vite-plugin.ts`): accepts `{ entry: './video.mdx' }`, generates virtual modules for the MDX source, user imports (eager glob of all `.tsx/.ts` in project root), and the Spiceflow app entry. Auto-injects `spiceflowPlugin` and `@vitejs/plugin-react`. HMR: entry MDX edits invalidate virtual modules and send `rsc:update` (string flows through flight); user `.tsx`/`.ts`/imported-`.mdx` edits stay in the client module graph — component files get React Fast Refresh, everything else propagates through `virtual:egaki-modules` to `mdx-client.tsx`, which accepts the dep update via `import.meta.hot.accept('virtual:egaki-modules', cb)` and pushes the fresh map into React via `useSyncExternalStore`.

**Components** (`components.tsx`): ported from [remocn](https://github.com/kapishdima/remocn). Includes `MeshGradientBg`, `BlurReveal`, `MaskedSlideReveal`, `StaggeredFadeUp`, `TerminalSimulator`, `GlassCodeBlock`, `ShimmerSweep`, `SpringPopIn`, `AnimatedChart`, `FeaturePill`. All use Remotion hooks (`useCurrentFrame`, `useVideoConfig`, `spring`, `interpolate`).

**Animation wrappers** (`mdx-video.tsx`): `FadeIn`, `FadeOut`, `ZoomIn`, `ZoomOut`, `SlideIn`, `SlideOut`, `BlurIn`, `BlurOut`, and `<Animate enter="fadeIn" exit="zoomOut">` shorthand. Enter animations use ease-out by default (decelerate into place); exit animations use ease-in (accelerate away). `SlideIn`/`SlideOut` use a `from` prop (not `direction`): `from="left"` on SlideIn means the element enters from the left; `from="left"` on SlideOut means it exits to the right (opposite of where it came from). All wrappers accept a `delay` prop (frames) instead of `offset`: positive delays the start, negative starts earlier.

**`<Fill>`** (`mdx-video.tsx`): a full-frame layer like Remotion's `AbsoluteFill` but with better defaults for video content. Children **stretch horizontally** to fill the frame and **center vertically**. Available in MDX without imports (part of `MDX_BUILTIN_COMPONENTS`). Also exported from `egaki/video`. Accepts the same `style` and HTML attributes as a `div`; pass `style` to override alignment when needed. Prefer `<Fill>` over raw `<AbsoluteFill>` in egaki components and MDX files. The scene content wrapper in `player-page.tsx` uses `<Fill>` internally.

## Generated media in TSX server components

`GeneratedImage`, `GeneratedVideo`, and `GeneratedSpeech` can be used inside
separate `.server.tsx` files instead of directly in MDX. This lets you compose
generated media with custom logic, loops, conditionals, and TypeScript type safety.

### Why `egaki/video` stubs don't work in TSX

`egaki/video` exports **client stubs** that return `null`. These exist only for
MDX component resolution and LSP autocomplete. In MDX, `wrapGenerateNodes()`
walks the AST and auto-wraps bare `<GeneratedImage>` in `<Server>`, replacing
the stub with the real async server implementation at render time. But when
`GeneratedImage` is inside a TSX component, the MDX parser only sees the
outer component name (e.g. `<HeroScene />`), not what's inside it. The
auto-wrapping never fires, and the stub silently renders nothing. No error,
no warning.

### The pattern: `.server.tsx` + `egaki/generate-media`

Two things are needed:

1. **Import from `egaki/generate-media`** (not `egaki/video`). This module
   exports the real async server implementations that call AI generation APIs.
2. **Use the `.server.tsx` file extension.** The Vite plugin excludes
   `*.server.{ts,tsx}` from the client bundle, so node-only imports and
   API keys stay out of the browser.

Components imported from `.server.*` files are **automatically wrapped in
`<Server>`** by `wrapGenerateNodes()` in `server-mdx.ts`. The function scans
the MDX's import declarations for sources matching the `.server` postfix and
collects their local names. Any JSX element with a matching name gets wrapped
in a synthetic `<Server>` node (same technique used for `GeneratedImage`).
No manual `<Server>` block is needed in the MDX.

```tsx
// hero-scene.server.tsx
import { GeneratedImage } from 'egaki/generate-media'
import { FadeIn, Fill } from 'egaki/video'

export async function HeroScene() {
  return (
    <Fill>
      <FadeIn duration={20}>
        <GeneratedImage
          prompt="a magical forest with glowing mushrooms"
          seed={99}
          model="imagen-4.0-generate-001"
          style={{ width: '80%', margin: 'auto', borderRadius: 16 }}
        />
      </FadeIn>
    </Fill>
  )
}
```

```mdx
import { HeroScene } from './hero-scene.server'

# Scene duration=5s

<HeroScene />
```

Client-only imports like `FadeIn` and `Fill` from `egaki/video` are fine
inside `.server.tsx` files. They have `'use client'` directives, so the RSC
module runner treats them as client references and they render correctly in
the browser.

### How it flows

```
MDX
 │
 ├── wrapGenerateNodes() detects './hero-scene.server' import
 │      │
 │      ▼
 │   <HeroScene /> auto-wrapped in synthetic <Server> node
 │      │
 │      ▼
 │   collectServerImportSources() finds './hero-scene.server'
 │      │
 │      ▼
 │   importServerModules() dynamically imports it in RSC env
 │      │
 │      ▼
 │   HeroScene() runs server-side (async, node APIs available)
 │      │
 │      ├── GeneratedImage from egaki/generate-media
 │      │     └── checks cache ► generates image ► returns GeneratedImageClient
 │      │
 │      └── FadeIn, Fill from egaki/video
 │            └── 'use client' ► client references, render in browser
 │
 └── Client receives RSC flight with streamed slot content
```

The `generated-media-example/` project has a working `hero-scene.server.tsx`
demonstrating this pattern.

## `FPS` and `BEAT` scope variables

MDX expressions have access to `FPS` and `BEAT` as global scope variables,
derived from frontmatter `fps` and `bpm`. No import needed.

- **`FPS`** = frames per second (default 30). Use to convert seconds to frames.
- **`BEAT`** = frames per beat, computed as `fps / (bpm / 60)`. At 120bpm/30fps = 15 frames.

```mdx
---
fps: 30
bpm: 120
---

# Intro duration=2s

<SlideIn from="left" delay={0.3 * FPS}>
  <SlideOut from="left" delay={-0.5 * FPS}>
    <TextSlide text="Hello" />
  </SlideOut>
</SlideIn>

# Verse duration={8 * BEAT}

<FadeIn duration={2 * BEAT}>
  Content appears over 2 beats
</FadeIn>
```

These are injected via safe-mdx's `scope` prop in `mdx-client.tsx`. Imported
`.mdx` files also receive the same scope from the entry MDX's frontmatter.

**Media components**: `<Video>` and `<Audio>` from `@remotion/media` are available in MDX.
Both accept `gapBefore` and `gapAfter` props (in frames) to add empty timeline
padding before/after the media. `gapBefore` delays playback start; both gaps are
included in auto-duration computation. Use `FPS`/`BEAT` scope variables for
readable values: `<Video src="/clip.mp4" gapBefore={1 * FPS} gapAfter={2 * BEAT} />`.

## Making components configurable with `useTweakpane`

`useTweakpane(label, schema)` registers a folder of tweakable parameters
in a shared tweakpane pane (fixed top-right in the player). When the
component unmounts, its folder is removed. Only visible components show
parameters.

Import from `egaki/video` or directly from `./tweakpane-hook.tsx`:

```tsx
import { useTweakpane } from 'egaki/video'
```

### Pattern: accept props, pass to useTweakpane as defaults

Do **not** destructure tweakpane-managed props from the props object.
Instead, reference `props.value ?? default` in the schema so the prop
serves as the default and tweakpane overrides it live.

```tsx
export function MyComponent(props: MyComponentProps) {
  // Non-tweakable props: destructure normally
  const { children, style } = props

  // Tweakable props: pass as defaults, let user override in the pane
  const tp = useTweakpane('MyComponent', {
    // Slider with explicit range
    blur: { value: props.blur ?? 12, min: 0, max: 50, step: 0.5 },
    // Boolean toggle (checkbox)
    visible: props.visible ?? true,
    // String (text input)
    label: props.label ?? 'Hello',
    // Color (string starting with #)
    color: props.color ?? '#ff0055',
    // Point 2D (object with x, y)
    offset: props.offset ?? { x: 50, y: 25 },
  })

  // Use tp values directly, no isExporting branching needed
  return <div style={{ filter: `blur(${tp.blur}px)`, color: tp.color }}>
    {children}
  </div>
}
```

Ghost renders (layout-transition FLIP measurement) are automatically
skipped. A single "Copy changes" button at the top of the pane
serializes all active component params as structured markdown for AI
agents, including current frame, section heading, and only params that
differ from their defaults.

Tweakpane docs: https://tweakpane.github.io/docs/input-bindings/

## Animation utilities — `springFromDuration`, `dspring`, and `EASE` presets

Always use `springFromDuration()` or `dspring()` instead of raw `spring({ config: { damping, stiffness, mass } })`. The physics parameters are hard to reason about; `(duration, bounce)` is intuitive and matches Framer Motion's API.

```tsx
import { spring } from 'remotion'
import { springFromDuration, dspring, EASE } from 'egaki/video'

// springFromDuration returns a config object for Remotion's spring()
const scale = spring({ frame, fps, config: springFromDuration(0.5, 0.3) })

// dspring is the shorthand that calls spring() internally
const opacity = dspring(frame, fps, 0.6, 0.25)  // 600ms, subtle bounce
const pop = dspring(frame, fps, 0.4)              // 400ms, no bounce

// EASE presets for interpolate()
const x = interpolate(frame, [0, 30], [0, 100], {
  easing: EASE.apple,  // the Apple 75% influence S-curve
  extrapolateLeft: 'clamp',
  extrapolateRight: 'clamp',
})
```

**`bounce` parameter**: 0 = no overshoot (critically damped), 0.25 = subtle Apple-like, 0.5 = playful, 1 = maximum bounce.

**`EASE` presets**: `apple` (tight S-curve), `enterFast` (arrive with momentum), `exitSlow` (leave with gravity), `snappy` (social media punch), `cinematic` (luxurious slow).

### Motion curve presets

`EASE` also includes motion design curves for smooth transitions, bounces, and
overshoots. Each preset is a function compatible with `interpolate()`. Default
presets use intensity 50; use the `*Easing(intensity)` functions for custom feel.

```tsx
import { EASE, smoothEasing, bounceEasing, overshootEasing } from 'egaki/video'
import { interpolate } from 'remotion'

// Smooth snap — strong ease-out, the workhorse for sliding elements
const x = interpolate(frame, [0, 60], [0, 500], {
  easing: EASE.smooth,
  extrapolateLeft: 'clamp',
  extrapolateRight: 'clamp',
})

// Bounce — like a ball dropping, great for landing animations
const y = interpolate(frame, [0, 45], [0, 300], {
  easing: EASE.bounce,
  extrapolateLeft: 'clamp',
  extrapolateRight: 'clamp',
})

// Overshoot with elastic settle — elements pop past target then ring back
const scale = interpolate(frame, [0, 30], [0, 1], {
  easing: EASE.overshootElastic,
  extrapolateLeft: 'clamp',
  extrapolateRight: 'clamp',
})

// Custom intensity — higher = more extreme effect
const gentleSmooth = interpolate(frame, [0, 60], [0, 1], {
  easing: smoothEasing(25),  // gentler ease-out
  extrapolateLeft: 'clamp',
  extrapolateRight: 'clamp',
})

const hardBounce = interpolate(frame, [0, 60], [0, 1], {
  easing: bounceEasing(100), // extreme bouncing
  extrapolateLeft: 'clamp',
  extrapolateRight: 'clamp',
})
```

**Bezier presets** (clean curves, no overshoot):
`smooth`, `natural`, `decelerate`, `accelerate`

**Spring/bounce presets** (values can exceed 0-1):
`elasticSnap`, `bounce`, `bounceAnticipate`, `bounceThrow`, `overshoot`,
`overshootElastic`, `overshootBouncy`, `decelerateOvershoot`, `decelerateElastic`,
`naturalThrow`, `accelerateImpulse`, `accelerateElastic`, `impulseSlow`,
`impulseOvershoot`

Never use raw `spring({ config: { damping: 15, stiffness: 150 } })` in new code. Convert to `springFromDuration(duration, bounce)` instead.

### Continuous easing presets and curve engine

The motion presets above are generated by a port of Jitter's easing engine
(`cli/src/vite/easing-curves.ts`), not hardcoded tables. `egaki/video` also
exports the **continuous preset functions**: each takes ANY intensity 0-100
(interpolated in config space, no snapping to 25-steps) and returns an easing
function for `interpolate()`.

```tsx
import { overshoot, naturalThrow, elasticSnap, bounce } from 'egaki/video'
import { interpolate } from 'remotion'

// Exact Jitter curve at intensity 63 — between the 50 and 75 presets
const scale = interpolate(frame, [0, 30], [0, 1], {
  easing: overshoot(63),
  extrapolateLeft: 'clamp',
  extrapolateRight: 'clamp',
})

// Subtle anticipation throw at intensity 10
const x = interpolate(frame, [0, 45], [0, 400], {
  easing: naturalThrow(10),
  extrapolateLeft: 'clamp',
  extrapolateRight: 'clamp',
})
```

All 14 presets are exported: `naturalThrow`, `decelerateOvershoot`,
`decelerateElastic`, `accelerateImpulse`, `accelerateElastic`, `elasticSnap`,
`bounce`, `bounceAnticipate`, `bounceThrow`, `impulseSlow`, `impulseOvershoot`,
`overshoot`, `overshootElastic`, `overshootBouncy`.

The engine primitives are exported too, for building custom curves the same
way Jitter builds its presets:

```tsx
import { cubicBezier, polybezier, pathPreset } from 'egaki/video'

// Analytic cubic-bezier y(x) solver. y values may exceed 0-1 for overshoot.
const ease = cubicBezier(0.5, 0, 0, 1)

// Multi-segment curve from control points. Handles: x is a fraction toward
// the neighbor anchor, y is in value units (bare number = { x: n, y: 0 }).
const throwCurve = polybezier([
  { x: 0, y: 0, upper: 0.7 },
  { x: 0.33, y: -0.2, lower: 0.8, upper: 0.8 }, // dip below 0 (anticipation)
  { x: 0.67, y: 1.3, lower: 0.1, upper: 0.1 }, // overshoot past 1
  { x: 1, y: 1, lower: 0.8 },
])

// Intensity-parameterized preset: configs at any intensity keys are
// linearly interpolated in config space.
const myPreset = pathPreset({
  0: [
    { x: 0, y: 0, upper: 0 },
    { x: 0.4, y: 1.05, lower: 0.8, upper: 0.2 },
    { x: 1, y: 1, lower: 0.7 },
  ],
  100: [
    { x: 0, y: 0, upper: 0 },
    { x: 0.15, y: 1.8, lower: 0.8, upper: 0.1 },
    { x: 1, y: 1, lower: 0.8 },
  ],
})
const easing = myPreset(35)
```

`springPreset` (mass/tension/friction physics) and `bouncePreset`
(gravity + bounceFactor simulation) build the physics-based presets;
`samplePreset(preset)` bakes any preset into 51-point arrays per intensity
level, matching the `*Samples` exports. Golden tests in
`cli/src/vite/easing-curves.test.ts` pin all preset outputs to the values
originally extracted from Jitter — keep them passing when touching the engine.

## Preamble — composition-level content

Content **before the first `#` heading** in the MDX file is the **preamble**. It is rendered at the Remotion composition level, outside the `<Series>` that sequences sections. This means preamble content persists across all sections for the entire video duration, and renders in the background behind the section content (earlier DOM order = behind).

Use the preamble for:
- **Soundtracks**: `<Audio src="/music.mp3" />` plays for the full video
- **Ambient background video**: `<Video src="/bg.mp4" />` loops behind all sections
- **Global background color or image**: a `<Background>` with `<MeshGradientBg>` or a static color that shows behind every section without repeating it in each one
- **Persistent overlays**: watermarks, logos, or any element that should never disappear between sections

```mdx
---
fps: 30
bpm: 120
---

<Audio src="/soundtrack.mp3" />
<Video src="/ambient-bg.mp4" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />

# First Section duration=5s

This content appears on top of the ambient background video.
```

Content inside sections (after a heading) is scoped to that section's `Series.Sequence` and only visible during that section's duration. Preamble content has no such scoping; it renders for the entire composition and sits behind the sections in z-order.

## LayoutTransition — FLIP animation across section boundaries

`<LayoutTransition id="x">` makes an element animate from its position in the
previous section to its new position in the current section. Matching is by
`id`: when two consecutive sections both contain `<LayoutTransition id="x">`,
the element in the new section springs from where the viewer last saw it.

```mdx
# Scene 1 duration=3s

<LayoutTransition id="title">**Hello**</LayoutTransition>

# Scene 2 duration=3s

<LayoutTransition id="title" duration={25} bounce={0.2}>**Hello**</LayoutTransition>

<LayoutTransition id="subtitle">**World**</LayoutTransition>
```

In Scene 2, "Hello" animates from its centered Scene-1 position to its new
slot above "World". "World" has no match in Scene 1 so it just appears
normally. Props: `id` (required), `duration` (frames, default 20), `bounce`
(spring bounce 0-1, default 0.15).

**Seek-safe by design.** No temporal state is used. The previous section is
re-rendered in a hidden ghost container pinned at its last frame via Remotion
`<Freeze>`; the animation layer measures ghost vs visible positions every
frame and derives FLIP transforms purely from the current frame. Seeking
backward, forward, or mid-transition always produces the correct frame.

**Constraints:**
- The wrapped child must be **flow content** (text, spans, divs in the flex
  column). Components that render a full-frame `AbsoluteFill` (like
  `BlurReveal`) measure as zero-size wrappers and the transition no-ops.
- Works for elements inside imported TSX components too (React context).
- The ghost stays mounted for the first 5 seconds of a section
  (`GHOST_WINDOW_SECONDS` in `player-page.tsx`); springs must settle within
  that window.

Implementation lives in `cli/src/vite/mdx-video.tsx` (`LayoutTransition`,
`LayoutTransitionProvider`, `LayoutGhost`, `LayoutAnimationLayer`) and
`cli/src/vite/player-page.tsx` (`SectionWithLayoutTransition`, ghost
mounting). Manual demo: `video-example/layout-test.mdx` via
`pnpm vite --config vite.layout-test.config.ts` in `video-example/`.

## Client-side rendering — HtmlInCanvas mode

egaki video renders in the browser via `@remotion/web-renderer` (WebCodecs, no FFmpeg) with **`allowHtmlInCanvas: true`** (set in `render-client.ts` and `sdk.ts`). This uses Chromium's `drawElementImage` API, which takes a **full screenshot per frame**. All CSS features work, including `perspective`, `transform-style: preserve-3d`, `backdrop-filter`, `mask-image`, `radial-gradient`, `mix-blend-mode`, `filter`, `clip-path`, and everything else. Write components assuming full CSS support.

**Media imports** (still applies regardless of renderer mode):
- Do NOT import `<Audio>`, `<Video>`, or `<OffthreadVideo>` from `remotion`. Those are `Html5Audio`/`Html5Video` wrappers that throw in the web-renderer.
- Always import `<Audio>` and `<Video>` from `@remotion/media`.
- Do NOT use `<AnimatedEmoji>` from `@remotion/animated-emoji` (use `<Lottie>` instead).
- **Never use raw `<img>` tags.** Always use `<Img>` from `egaki/video` (or import from
  `./mdx-video.tsx` inside the cli package). The egaki `Img` wraps Remotion's `<Img>`,
  which calls `delayRender()` while the image loads. A raw `<img>` will render a blank
  frame during export because the renderer captures the frame before the image finishes
  loading. This applies to all components, MDX element overrides, and packages like
  `midjourney`.

| Component | Import from | Web-renderer support |
|---|---|---|
| `<Audio>` | `@remotion/media` | supported |
| `<Video>` | `@remotion/media` | supported |
| `<Audio>` | `remotion` (Html5Audio) | not supported |
| `<Video>` | `remotion` (Html5Video) | not supported |
| `<OffthreadVideo>` | `remotion` | not supported |

**Other constraints:**
- HtmlInCanvas is **Chromium-only**. Export must happen in Chrome or Chromium-based browsers.
- No multithreading; rendering is single-threaded.
- Background browser tabs throttle `requestAnimationFrame`, slowing down export. Keep the tab in the foreground during export.
- **`getRemotionEnvironment().isRendering` does NOT work** with client-side rendering
  (`@remotion/web-renderer`). It always returns `false`. To detect export mode, use our
  custom `useIsExporting()` hook (reads `ExportContext`, set in `render-client.ts`).

<details>
<summary>Walk renderer CSS limitations (NOT applicable to egaki, listed for reference only)</summary>

The walk renderer (used when `allowHtmlInCanvas` is false) has these CSS limitations. egaki never uses the walk renderer, so these do not apply:

- `backdrop-filter`, `mix-blend-mode`, `background-blend-mode`
- `z-index`, `perspective`, `perspective-origin`, `transform-style`
- `text-decoration`, `writing-mode`, `object-position`
- `inset` box shadows and shadow spread radius
- `background-image` with anything other than `linear-gradient`
- `mask-image` with anything other than `linear-gradient`
- `clip-path: url()`, `filter: url()`, `corner-shape`
- Filters (`blur`, `brightness`, etc.) do not work in Safari/WebKit
</details>

## Preventing subpixel jitter in animations

Animating `transform: scale()` or `translateX/Y()` with fractional values causes
**subpixel stuttering** — text re-rasterizes at slightly different subpixel positions
each frame. Monospace text and thin lines (gridlines, borders) are especially sensitive.

Two rules to prevent it:

1. **Add `willChange: 'transform'`** on the animated element. This promotes the layer
   to its own compositor surface so the browser rasterizes once and transforms the
   bitmap instead of re-laying-out text every frame.
2. **Round interpolated values** to 3 decimal places to reduce uniquely-valued frames:
   `Math.round(value * 1000) / 1000`.

```tsx
const scale = interpolate(frame, [0, 90], [1, 1.35], {
  extrapolateLeft: 'clamp',
  extrapolateRight: 'clamp',
  easing: EASE.cinematic,
})
const s = Math.round(scale * 1000) / 1000

<div style={{
  transform: `scale(${s})`,
  transformOrigin: '60% 45%',
  willChange: 'transform',
}}>
```

## Remotion resources

- **Remotion GitHub**: https://github.com/remotion-dev/remotion
- **Remotion docs**: https://www.remotion.dev/docs
- **Remotion LLM system prompt** (llms.txt): https://www.remotion.dev/llms.txt (no `llms-full.txt`)
- **Remotion AI code generation guide**: https://www.remotion.dev/docs/ai/generate

### Browser rendering (`@remotion/web-renderer`)

This package renders video entirely in the browser using WebCodecs (no server, no FFmpeg). It's what powers the "Export MP4" button.

- **Overview**: https://www.remotion.dev/docs/client-side-rendering
- **`renderMediaOnWeb()` API**: https://www.remotion.dev/docs/web-renderer/render-media-on-web
- **`renderStillOnWeb()` API**: https://www.remotion.dev/docs/web-renderer/render-still-on-web
- **HTML-in-canvas** (Chromium experimental): https://www.remotion.dev/docs/client-side-rendering/html-in-canvas
- **Progress tracker**: https://github.com/remotion-dev/remotion/issues/5913

To read the `@remotion/web-renderer` source code:

```bash
bunx opensrc path remotion-dev/remotion
# then read from: packages/web-renderer/
```

The web renderer implementation is at `packages/web-renderer/` in the Remotion monorepo. Key files:
- `packages/web-renderer/src/render-media-on-web.ts` (main entry)
- `packages/web-renderer/src/render-still-on-web.ts`
- `packages/web-renderer/src/compose.ts` (DOM tree walker that paints to OffscreenCanvas)
- `packages/web-renderer/src/html-in-canvas/` (Chromium `drawElementImage` path)

## Agent SDK (`window.egakiSDK`)

The SDK singleton is mounted on `window.egakiSDK` when the player page loads. Agents call it via Playwriter's `page.evaluate()` to screenshot frames or export video segments.

`page.evaluate()` cannot return binary types (`Blob`, `ArrayBuffer`), so the SDK returns **data URL strings**. Convert to a buffer with `fetch()`:

### Player controls

```js
// Seek to frame 120
playwriter -s 1 -e 'await state.page.evaluate(() => window.egakiSDK.seekTo(120))'

// Get current frame
playwriter -s 1 -e 'console.log(await state.page.evaluate(() => window.egakiSDK.getCurrentFrame()))'

// Play / pause / toggle
playwriter -s 1 -e 'await state.page.evaluate(() => window.egakiSDK.play())'
playwriter -s 1 -e 'await state.page.evaluate(() => window.egakiSDK.pause())'
```

### Screenshot a frame

```js
// Screenshot frame 60
playwriter -s 1 -e "$(cat <<'EOF'
const dataUrl = await state.page.evaluate(() => window.egakiSDK.screenshot({ frame: 60 }))
const buf = Buffer.from(await (await fetch(dataUrl)).arrayBuffer())
require("node:fs").writeFileSync("/tmp/frame-60.png", buf)
console.log("saved", buf.length, "bytes")
EOF
)"

// Screenshot whatever the player is currently showing
playwriter -s 1 -e "$(cat <<'EOF'
const dataUrl = await state.page.evaluate(() => window.egakiSDK.screenshotCurrentFrame())
const buf = Buffer.from(await (await fetch(dataUrl)).arrayBuffer())
require("node:fs").writeFileSync("/tmp/current.png", buf)
console.log("saved", buf.length, "bytes")
EOF
)"
```

### Export a video segment

For large videos, trigger a browser download instead of transferring via data URL:

```js
// Export frames 0-90 as MP4, downloads to ~/Downloads
playwriter -s 1 -e 'await state.page.evaluate(() => window.egakiSDK.export({ frameRange: [0, 90], path: "clip.mp4" }))'
```

To get the full video as a data URL (small compositions only):

```js
playwriter -s 1 -e "$(cat <<'EOF'
const dataUrl = await state.page.evaluate(() => window.egakiSDK.export({ frameRange: [0, 90], videoBitrate: "high" }))
const buf = Buffer.from(await (await fetch(dataUrl)).arrayBuffer())
require("node:fs").writeFileSync("/tmp/clip.mp4", buf)
console.log("saved", buf.length, "bytes")
EOF
)"
```

### Get composition info

```js
playwriter -s 1 -e 'console.log(await state.page.evaluate(() => window.egakiSDK.getInfo()))'
// { totalDuration: 450, fps: 30, width: 1920, height: 1080, sectionCount: 3, durationSeconds: 15, currentFrame: 0, isPlaying: false }
```

### Get element position

Maps a DOM element's position to composition coordinates (1920×1080 space). Returns pixels and percentages. The Player scales the composition to fit the viewport; this method accounts for that scale factor.

```js
// Seek to a specific frame, then get the position of an element
playwriter -s 1 -e "$(cat <<'EOF'
const pos = await state.page.evaluate(() => {
  window.egakiSDK.seekTo(0)
  const el = document.querySelector('.hero-logo')
  return window.egakiSDK.getElementPosition(el)
})
console.log(pos)
// { x: 810, y: 440, width: 300, height: 200,
//   xPercent: 42.19, yPercent: 40.74, widthPercent: 15.63, heightPercent: 18.52,
//   centerX: 960, centerY: 540, centerXPercent: 50, centerYPercent: 50 }
EOF
)"
```

**Layout transition between scenes.** Capture an element's position in scene 1, then use those coordinates to position the same element in scene 2 so it appears to stay in place (or animate from the old position to a new one).

```js
// 1. Seek to the last frame of scene 1, capture the logo position
// 2. Seek to the first frame of scene 2, capture the same element
// 3. The delta tells you how to animate the transition
playwriter -s 1 -e "$(cat <<'EOF'
const info = await state.page.evaluate(() => window.egakiSDK.getInfo())
const fps = info.fps

// Scene 1 ends at frame 149 (5s at 30fps), scene 2 starts at 150
const scene1Pos = await state.page.evaluate(() => {
  window.egakiSDK.seekTo(149)
  return window.egakiSDK.getElementPosition(document.querySelector('.product-card'))
})

const scene2Pos = await state.page.evaluate(() => {
  window.egakiSDK.seekTo(150)
  return window.egakiSDK.getElementPosition(document.querySelector('.product-card'))
})

console.log('Scene 1 position:', scene1Pos.xPercent + '%', scene1Pos.yPercent + '%')
console.log('Scene 2 position:', scene2Pos.xPercent + '%', scene2Pos.yPercent + '%')
console.log('Delta:', {
  dx: scene2Pos.x - scene1Pos.x,
  dy: scene2Pos.y - scene1Pos.y,
})
EOF
)"
```

### SDK methods

**Player controls** (synchronous, no await needed inside evaluate):
- **`seekTo(frame)`** — seek the player to a specific frame
- **`getCurrentFrame()`** — returns the frame the player is currently displaying
- **`play()`** / **`pause()`** / **`toggle()`** — playback control
- **`isPlaying()`** — returns boolean

**Element position** (synchronous):

**`getElementPosition(element)`** — maps a DOM element to composition coordinates. Returns `{ x, y, width, height, centerX, centerY }` in composition pixels, plus `*Percent` variants (0-100) for all six values. Useful for matching element positions across scenes to build layout transition animations.

**Rendering** (async, returns data URL strings):

**`screenshot(options?)`** — renders one frame via `renderStillOnWeb()`.
- `frame` (number, default 0)
- `format` ('png' | 'jpeg' | 'webp', default 'png')
- `quality` (0-1, for jpeg/webp)
- `scale` (number, default 1)
- `allowHtmlInCanvas` (boolean, default true)

**`screenshotCurrentFrame(options?)`** — same as `screenshot()` but captures whatever frame the player is on. Accepts the same options except `frame`.

**`export(options?)`** — renders video via `renderMediaOnWeb()`. If `path` is set, also triggers a browser download.
- `frameRange` (number | [number, number] | null, default null = all)
- `container` ('mp4' | 'webm' | 'mkv', default 'mp4')
- `videoCodec` ('h264' | 'vp8' | 'vp9' | 'av1')
- `videoBitrate` (number | 'very-low' | 'low' | 'medium' | 'high' | 'very-high')
- `audioCodec`, `audioBitrate`, `sampleRate`, `muted`, `transparent`
- `scale`, `keyframeIntervalInSeconds`, `hardwareAcceleration`
- `path` (string — triggers download)
- `onProgress` (callback)

**`getInfo()`** — returns `{ totalDuration, fps, width, height, sectionCount, durationSeconds, currentFrame, isPlaying }`.

All option types are re-exported from `@remotion/web-renderer`. See Remotion docs for full details on each parameter.

## Docs

- **[Lottie to Remotion conversion](docs/lottie-to-remotion.md)**: how to read a Lottie JSON file and reproduce its animations using Remotion's `interpolate()` and `Easing.bezier()`. Covers the full keyframe/easing model, field mapping, overshoot, hold keyframes, per-segment easing, and a conversion algorithm.

## Key files

| File | Role |
|---|---|
| `cli/src/vite/vite-plugin.ts` | Vite plugin entry, virtual modules, HMR |
| `cli/src/vite/app.tsx` | Spiceflow RSC server: MDX string + `<Server>` slot rendering |
| `cli/src/vite/mdx-client.tsx` | Client MDX app: parsing, sections, safe-mdx rendering |
| `cli/src/vite/mdx-parse.ts` | Environment-agnostic section splitting and duration parsing |
| `cli/src/vite/server-mdx.ts` | `<Server>` parsing: slot extraction, blanking, import detection |
| `cli/src/vite/server-components.tsx` | Built-in server components (`egaki/text-to-speech`) |
| `cli/src/vite/mdx-video.tsx` | Client animation components, `MDX_BUILTIN_COMPONENTS`, re-exports |
| `cli/src/vite/components.tsx` | Visual components (remocn ports) |
| `cli/src/vite/player-page.tsx` | Client Player wrapper + export UI |
| `cli/src/vite/render-client.ts` | In-browser MP4 export via `@remotion/web-renderer` |
| `cli/src/vite/sdk.ts` | Agent SDK singleton (`window.egakiSDK`) |

## Testing the MDX video engine

After changes to parsing, rendering, `<Server>` slots, the Vite plugin, or built-in MDX scope, run **both** unit tests in `cli/` and the integration example in `video-example/`.

**Unit tests** (parsing, safe-mdx wiring, `<Server>` helpers, keyframes, imports):

```bash
cd cli && pnpm test
```

Main suite: `cli/src/vite/mdx-video.test.tsx`, `cli/src/vite/easing-curves.test.ts`.

**Example app + e2e** (dev server, HMR, client MDX, `<Server>` flight, `egaki/text-to-speech`):

```bash
cd video-example && pnpm run test-e2e
```

Playwright starts Vite on port **5199** (`video-example/playwright.config.ts`), runs `video-example/e2e/hmr.test.ts` serially. Reuses an existing server on 5199 when not in CI.

Vitest alone is enough for isolated parsing or helper changes with no plugin/HMR behavior. If behavior crosses server ↔ client or the browser Player, run **`video-example` e2e** before finishing.
