---
name: egaki
repo: remorses/egaki
description: >
  AI image and video generation CLI and MDX-to-video framework built on Remotion.
  Use this skill to install egaki, configure auth, generate images/videos, create
  MDX video projects with animation primitives (Opacity, Scale, TranslateX, Blur),
  easing presets (EASE, springFromDuration, dspring, cubicBezier), LayoutTransition,
  captions, voice cloning, TTS, Server components, and media components. ALWAYS load
  this skill when the user mentions egaki, runs egaki commands, edits egaki MDX video
  files, or works in a project with an egaki vite plugin.
---

# egaki

Every time you work with egaki, you MUST fetch the latest README:

```bash
curl -s https://raw.githubusercontent.com/remorses/egaki/main/README.md # NEVER pipe to head/tail, read the full output
```

The README is the single source of truth for all user-facing docs: CLI usage,
MDX video syntax, animation primitives, easing presets, LayoutTransition,
captions, voice cloning, media components, CSS rules, and project setup.

## Always check help first

```bash
egaki --help # NEVER pipe to head/tail, read the full output
```

For subcommand details: `egaki <command> --help` (e.g. `egaki image --help`,
`egaki video --help`, `egaki login --help`)

## Auth options

Two authentication modes:

1. **Egaki subscription key** (recommended, all models, one key)
2. **Provider API keys** (Google, OpenAI, Fal, xAI, etc.) via `egaki login`

If using Egaki subscription, set it up with `egaki subscribe`, then store
the key with `egaki login --provider egaki --key egaki_...`.

## Login behavior for remote agents

When login requires a URL flow, run login in the background and send the login URL
to the user so they can complete auth interactively.

## Model selection

The `--model` / `-m` flag is **optional** on both `egaki image` and `egaki video`.

- **Interactive (TTY):** omitting `--model` shows a picker
- **Non-interactive (piped/scripted):** uses a sensible default

Agents should always pass `-m` explicitly to avoid the interactive picker.

### Preferred image models

1. **`gpt-image-1`** (or `gpt-image-2` / `chatgpt-image-latest` if available)
2. **`grok-imagine-image`** (xAI Grok)
3. **`nano-banana-pro-preview`**

### Preferred video models

1. **`grok-imagine-video-1.5`** (xAI Grok)

## Video generation note

Video generation can be very slow (1-3 minutes per request). Always use a
command timeout of **at least 5 minutes** from automation or agent workflows.
