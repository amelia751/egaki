## Bible Montage Video Pattern

Rapid image montage with word-by-word captions synced to narration audio.
Vertical 9:16 format for Shorts/Reels/TikTok.

### Project structure

```
bible-montage/
├── video.mdx              ← main composition, per-phrase sections
├── video-clips.mdx        ← alternate version using animated video clips
├── components.tsx          ← RapidMontage, Caption, WordFlash, BlackScreen
├── phrases.json            ← word-level timestamps from narration
├── vite.config.ts
├── public/
│   ├── narration.wav       ← single TTS narration file
│   ├── locrian.mp3         ← background music
│   ├── images/             ← cleaned foreground images (AI-cleaned)
│   ├── raw-frames/         ← original video frames (used as blurred bg)
│   └── videos/             ← animated clips (grok video, 3D camera rotation)
```

### Montage in the preamble

`<RapidMontage>` goes in the **preamble** (before the first `#` heading) so it
persists behind all sections for the entire video. It uses `useAbsoluteCurrentFrame()`
instead of `useCurrentFrame()` so the zoom and image cycling are continuous across
section boundaries, never resetting.

```
┌─────────────────────────────────────┐
│  Preamble (composition-level)       │
│  ├── <Audio> background music       │
│  └── <RapidMontage>                 │
│       ├── blurred raw frame (bg)    │
│       └── cleaned image (fg)        │
│       └── continuous zoom via       │
│           useAbsoluteCurrentFrame   │
├─────────────────────────────────────┤
│  Section 1: caption over montage    │
│  Section 2: caption over montage    │
│  Section N: BlackScreen + WordFlash │
│       (covers montage for emphasis) │
└─────────────────────────────────────┘
```

**Transparent section backgrounds required.** Egaki's `player-page.tsx` has a
default `#050505` background on the section wrapper (`SectionWithLayoutTransition`,
line ~342). This covers preamble content. For the montage to show through, that
background must be changed to `transparent`. Without this patch, preamble content
is invisible behind sections.

### Audio per section for auto-duration

Each section gets its own `<Audio>` pointing to the **same single narration file**
with `trimBefore` and `trimAfter` (in frames) defining the phrase boundaries. This
gives egaki the exact phrase duration for auto-sizing each section. No `duration=`
on headings, no `startFrom`.

```mdx
# P1

<Audio src="/narration.wav" trimBefore={0.112 * FPS} trimAfter={1.47 * FPS} />
<Caption words={[...]} />
```

**Never use `startFrom` with `trimBefore`.** They double-count the offset. `trimBefore`
alone handles both playback positioning and auto-duration.

**Express all time values as `seconds * FPS`.** Never use raw frame numbers for
delays, trimBefore, trimAfter, or any time-based value. This keeps the MDX
portable across different fps settings.

### Caption component

`Caption` renders words one at a time in a vertical cascade with:

- **Per-word delay** (in frames) synced to narration timestamps
- **Staggered horizontal offsets** for organic look
- **Font rotation** between serif and sans-serif per line
- **Word pairing** so some lines show 2 words together
- **Max 6 words per section** to keep captions under half the screen

Each `<Caption>` takes a `words` array:

```tsx
<Caption words={[
  { word: "You", delay: 0 },
  { word: "will", delay: 0.248 * FPS },
  { word: "rest,", delay: 0.412 * FPS },
]} />
```

`delay` is the time offset (in seconds * FPS) from the section start when the
word becomes visible.

### WordFlash + BlackScreen

For emphasis moments, `<BlackScreen>` covers the preamble montage and `<WordFlash>`
displays single words in rapid succession on black.

```mdx
<BlackScreen>
  <WordFlash words={["Just", "this:"]} framesPerWord={5} />
</BlackScreen>
```

`framesPerWord` controls speed (default 5 = ~167ms per word at 30fps).

### Computing phrase data from narration

**Step 1: Generate narration audio.**

Use `egaki speech` or the `GeneratedSpeech` server component. Cartesia `sonic-3.5`
provides word-level timestamps automatically (cached in
`public/generated/audio/timestamps/`).

**Step 2: Get word timestamps.**

If using the server component, timestamps are cached at
`public/generated/audio/timestamps/<hash>.wav.json` as an array of
`{ word, startSecond, endSecond }`.

**Step 3: Split into phrases.**

Group words by punctuation (`.` `,` `:`) and pause gaps (> 0.4s between words).
Each phrase becomes a section. Split phrases longer than 6 words into sub-sections.

**Step 4: Express time values as seconds * FPS.**

For each section:
- `trimBefore = phrase_start_seconds * FPS`
- `trimAfter = next_phrase_start_seconds * FPS`
- Per-word `delay = (word_start - phrase_start) * FPS`

Store in `phrases.json` for reference. Use the raw second values directly
in MDX expressions multiplied by FPS (e.g. `trimBefore={0.112 * FPS}`).

### Creating new videos with this pattern

1. **Source images**: extract frames from reference video, clean with egaki image
   generation (remove text/overlays), optionally animate with egaki video generation
2. **Narration**: generate TTS with `egaki speech`, copy the cached `.wav` to
   `public/narration.wav`
3. **Music**: pick a song, use `egaki demucs` to isolate stems if needed, find the
   best segment with Gemini agent
4. **Phrases**: extract word timestamps from the cached timestamps JSON, split into
   phrases, compute trim bounds and per-word delays
5. **MDX**: write sections with `<Audio trimBefore/trimAfter>` + `<Caption words>`,
   sprinkle in `<BlackScreen><WordFlash>` for emphasis
6. **Montage in preamble**: `<RapidMontage clipDuration={45}>` with background music
