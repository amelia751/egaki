# Session Memory

## 2026-03-12

- Public Egaki gateway base should be `/v3/ai` for transparent proxying with
  current `@ai-sdk/gateway` behavior.
- For gateway image/video model requests, model ID is sent in `ai-model-id`
  (not only `ai-image-model-id` / `ai-video-model-id`). Keep legacy headers as fallback.
- Video requests can be classified reliably by endpoint path (`/video-model`) in addition
  to legacy headers.
- AI Gateway may reject video generation with `402 insufficient_funds` and a minimum
  balance requirement (observed: minimum $10) even when auth and routing are correct.
- For gateway request parsing, the source of truth is
  `opensrc/repos/github.com/vercel/ai/packages/gateway/src/gateway-*-model.ts`.
  Video body currently sends only: `prompt`, `n`, `aspectRatio`, `resolution`,
  `duration`, `fps`, `seed`, `providerOptions`, `image`.

## 2026-03-13

### Egaki Features Beyond Plain Remotion (Comprehensive Survey)

Explored entire codebase to identify non-trivial features. Found 25+ major features requiring custom infrastructure:

**Core pipeline:** MDX parsing (frontmatter, sections, durations, aspect ratio), client-side composition building, error recovery with last-good cache.

**Server-side:** RSC integration (app.tsx), Server components with flight streaming, auto-wrapping of generated media, import detection via identifier scanning.

**AI generation:** cachedGenerate HOF (deterministic keys, dedup, stale fallback, progress tracking), media caching (localStorage for raw src, per-section effective duration reports).

**Animation:** Layout transitions with FLIP (ghost measurement, no temporal state, coordinate mapping accounting for Player scale), animation wrappers (FadeIn/Out, SlideIn/Out, etc.), Jitter easing engine (polybezier, spring/bounce physics, 14 presets).

**Infrastructure:** Vite plugin managing 3 environments (client, rsc, ssr), virtual modules (virtual:egaki-mdx, virtual:egaki-modules, virtual:egaki-app), HMR with section-level diff detection and auto-seek.

**Dev tools:** Tweakpane integration (Pane singleton, folder registry, copy button with frame/section metadata), media duration auto-computation (mediabunny fetching, trim/playback-rate handling).

**Export:** Web-renderer with HTML-in-canvas, client-side rendering, export context detection (useIsExporting), agent SDK (window.egakiSDK with screenshot/export/seek/getElementPosition).

**State:** Zustand vanilla store (modules, section reports, generation progress), useSyncExternalStore pattern for external state.

**Special:** Framer Motion sync (patch JSAnimation for frame-based timing), Spiceflow RSC framework, Preamble content (before first heading, outside Series), MDX scope variables (FPS, BEAT), visual component library (remocn ports).

**Complexity:** 51 CLI source files, ~12,800 lines. No part copyable from plain Remotion—all requires custom infrastructure due to Remotion's lack of RSC, MDX parsing, composition-level abstractions.

