# Patterns

Ideas for future built-in components and workflows. Not implemented yet.

## AI-generated scene transitions

Render the last frame of the outgoing scene and the first frame of the incoming scene as still images, then feed both to a video generation model (Kling, Veo, etc.) to produce a short transition clip. Works especially well for text-heavy slides because modern image models render text nearly perfectly.

**Reference:** [Fabian Stelzer on slide transitions with Kling](https://x.com/fabianstelzer/status/1994080756382028271)

## Virtual camera pan over a static scene

Take a static scene (a layout, a dashboard, a landing page) and create motion by panning a virtual camera across different regions. Animate a viewport that crops into specific areas of interest, zooming and sliding to highlight details. Similar to a **Ken Burns effect** but with discrete jumps between points of interest.

**Reference:** [1amanly on viewport panning over static images](https://x.com/1amanly/status/2066020115389485084)

## Slide and pop enter/exit

Elements enter from off-screen (slide-in from left, right, top, bottom) or pop in with a spring-driven smash cut. Exit is the reverse.

### Coordinated wipe

The outgoing element slides out and the incoming element slides in **from the same direction**, in a single continuous motion. A **push wipe**: one piece pushes the other out, like a conveyor belt.

**References:**
- [Nexaabyraj on coordinated slide transitions](https://x.com/Nexaabyraj/status/2065677785037979950)
- [1amanly slide-in animations](https://x.com/1amanly/status/2055514181823291762)

## 3D dolly over flat content

Apply a subtle CSS 3D rotation (rotateX/rotateY) to a flat screenshot or screen recording and slowly pan across it with **linear easing**. The constant speed feels cinematic, like a dolly shot gliding over a surface.

**Reference:** [Infisical product video with 3D panning](https://x.com/infisical/status/2065144775133839730)

## Speed ramping per scene

Each scene starts at **2-3x speed**, then decelerates into **slow motion** (0.5x or less). The fast opening signals a new scene and grabs attention; the slow portion lets the viewer absorb details. In cinema this is called **speed ramping** (or **time remapping**).

**Reference:** [Infisical homepage video with speed ramping](https://x.com/infisical/status/2065144775133839730)

## Abstract insert cuts as transitions

Between slower-paced hero scenes, insert short (0.5-1s) clips of fast, abstract, super close-up footage with high movement. Light reflections, liquid surfaces, particle bursts, lens flares, macro textures. These **insert cuts** reset the viewer's visual palette between content scenes. Can be AI-generated or sourced from stock.

**Reference:** [Dime Labs cybertruck video with abstract light inserts](https://x.com/Dime_Labs/status/1988627564231893223)

## Constant subtle camera drift

No scene should be fully static. Add a slow, continuous camera movement: a gentle zoom, a slight 3D rotation, a creeping translation. **Linear easing**, slow. The viewer shouldn't consciously notice it. Combine multiple axes for richer movement.

### Layering drift with entrance animations

Add drift as an **additive layer** over the full scene duration. Interpolate from a **negative offset to 0** so the final value is the natural layout position.

```tsx
const zoomIn = interpolate(frame, [0, 45], [1, 1.35], {
  extrapolateLeft: 'clamp',
  extrapolateRight: 'clamp',
  easing: EASE.cinematic,
})

const drift = interpolate(frame, [0, 90], [-0.08, 0], {
  extrapolateLeft: 'clamp',
  extrapolateRight: 'clamp',
})

const s = Math.round((zoomIn + drift) * 1000) / 1000
```

**References:**
- [Dime Labs cybertruck with constant camera drift](https://x.com/Dime_Labs/status/1988627564231893223)
- [Hukam Design product video with ambient motion](https://x.com/hukamdesign/status/2065470376059244579)
- [Garren Motion with camera moves within a single scene](https://x.com/garrenmotion/status/2065412078584652090)

## Word-highlight captions over animated gradient

Animated gradient background with plain text scrolling slowly upward, caption-style. The currently spoken word gets a **highlight background** that tracks with the audio timing. Pairs naturally with `egaki/text-to-speech` for word-level timestamps.

**Reference:** [ElevenLabs word-highlight caption video](https://x.com/ElevenLabs/status/1930689774278570003)

## Staccato montage as transition

Rapid-fire sequence of images or short video clips, each lasting only 2-4 frames, cut together at extreme speed. Random photos, bold text cards, abstract textures. The rhythm is the point. A **smash cut montage** placed between two slower scenes acts as a percussive break.

**Reference:** [Totaku Original with rapid-cut montage transitions](https://x.com/totaku_original/status/2064278640381300929)

## Tiled repeat grid transition

Take a single frame from the current scene and tile it into a grid of repeated copies. The duplicates can slide, scale, or fan out from the center, then collapse back into the next scene. An **Andy Warhol grid** effect used as a transition.

**Reference:** [Totaku Original with tiled repeat grid](https://x.com/totaku_original/status/2064278640381300929)

## Alternating video and text-only scenes

Interleave full-motion video scenes with minimal text-on-solid-background scenes. The text scenes use animated typography over a flat color. The contrast between rich video and stripped-down text creates pacing. Text scenes act as **title cards**.

**Reference:** [Totaku Original alternating video and text cards](https://x.com/totaku_original/status/2056311080025276442)

## Mixed typography across text scenes

Use a different font for each text-only scene. Heavy sans-serif, thin serif, handwritten script. The font itself becomes a design element. Pair with varying text size, alignment, and color.

**References:**
- [Amanly explainer video with varied typography](https://x.com/1amanly/status/2055514181823291762)
- [Amanly mixed font styles across scenes](https://x.com/1amanly/status/2042234863416471910)

## Rotating background colors for text scenes

Give each text-only scene a different solid background color. The color swap itself becomes a transition; the hard cut between two bold colors signals a new beat.

**Reference:** [Amanly with rotating background colors](https://x.com/1amanly/status/2042234863416471910)

## Per-word color accents

Color individual words differently from the rest of the sentence. One keyword in a bright accent, the rest in white or neutral. Combine with font weight or size changes for stronger emphasis.

## Shared layout animations

Elements live in a shared flexbox or grid layout. When a new element enters, existing elements **reflow** to make room with an **ease-out** transition. This is the FLIP animation pattern. In egaki, `<LayoutTransition>` handles this automatically.

**Reference:** [Amanly shared layout entry animations](https://x.com/1amanly/status/2033585198680723913)

## Cut on motion

An exit animation starts but the scene cuts away **before it finishes**. The next scene begins with its own entry animation already in progress. In film editing: **match cut on action**.

In egaki, use a **negative delay** on exit animations to start them early, and a **positive delay** on entry animations to delay their start.

**Reference:** [Sidorenko on cutting animations mid-motion](https://x.com/asidorenko_/status/2064729741119132119)

## Z-rotation cross-scene transition

The outgoing scene starts a slight Z-axis `rotate()` toward the end, the incoming scene picks up from that angle and rotates back to 0. Small angles (3-5 degrees), combine with a slight scale bump.

**Reference:** [Michael Nowak dashboard presentation](https://x.com/mnowakdesign/status/2066489960413462778)

## Zoom cross-scene transition

The outgoing scene zooms in (scale past 1.0) with ease-out, the incoming scene starts zoomed in and zooms back out to 1.0. Both halves decelerate into the cut point, making the hard cut nearly invisible.

**Reference:** [Michael Nowak dashboard presentation](https://x.com/mnowakdesign/status/2066489960413462778)

## Expanding clip-mask transition

A `clip-path` shape (circle, rounded rectangle) starts small and scales up to reveal the next scene underneath. The outgoing scene stays visible behind the mask. Can use `clip-path: circle()` or `clip-path: inset() round ...` for a device-shaped reveal.

**Reference:** [Motionlogs Studio expanding clip-mask transition](https://x.com/Motionlogstudio/status/2064070112626540789)

## Rapid context swap

A headline stays in a **fixed screen position** while the background rapidly cycles through different photographs every 4-8 frames. Newspaper front page, website screenshot, billboard, book cover. Hard cuts, no crossfade. The rapid pacing communicates ubiquity.

**Reference:** [Dipanjan Dey / Kombai 2.0 with rapid context swaps](https://x.com/Dipanjan_Dey/status/2061825199247614316)

## Fast short clips as transitions

Use very short (0.3-1s) high-energy video clips as transition beats between slower scenes. Cinematic b-roll, nature close-ups, street footage, abstract motion. The clips are too fast to fully register but they inject rhythm and energy into the edit. Unlike staccato montage (which uses 2-4 frame cuts for a percussive burst), these are slightly longer and serve as breathers that carry emotional tone between content scenes.

**Reference:** [Exoskeleton9001 with fast clip transitions](https://x.com/Exoskeleton9001/status/2071529382343041035)
