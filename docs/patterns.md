# Patterns

Ideas for future built-in components and workflows. Not implemented yet.

## AI-generated scene transitions

Render the last frame of the outgoing scene and the first frame of the incoming scene
as still images, then feed both to a video generation model (Kling, Veo, etc.) to
produce a short transition clip. The video model interpolates between the two keyframes,
creating organic cinematic transitions that would be impossible to build procedurally.

Works especially well for text-heavy slides because modern image models render text
nearly perfectly, giving the video model clean start/end frames.

**Reference:** [Fabian Stelzer on slide transitions with Kling](https://x.com/fabianstelzer/status/1994080756382028271)

## Virtual camera pan over a static scene

Take a static scene (a layout, a dashboard, a landing page) and create motion by
panning a virtual camera across different regions of it. Instead of showing the full
scene statically, animate a viewport that crops into specific areas of interest, zooming
and sliding to highlight details. Each viewport shift can have its own animated entry
(scale-in, slide, blur reveal, etc.). Similar to a **Ken Burns effect** but with
discrete jumps between points of interest rather than a single continuous drift.

This is a low-effort way to add dynamism. The scene content stays the same; the
component automatically creates multiple "shots" from it by framing different regions.
No artistic direction needed beyond the source scene itself.

**Reference:** [1amanly on viewport panning over static images](https://x.com/1amanly/status/2066020115389485084)

## Slide and pop enter/exit

Elements enter from off-screen (**slide-in** from left, right, top, bottom) or pop in
with a spring-driven **smash cut**. Exit is the reverse: elements slide out of frame or
shrink away. The easing matters; a spring with slight overshoot on entry and a fast
ease-in on exit feels snappy and intentional.

### Coordinated wipe

The strongest version of this is when the outgoing element slides out and the incoming
element slides in **from the same direction**, in a single continuous motion. In editing
this is a variant of a **push wipe**. It feels like a conveyor belt: one piece pushes
the other out. This creates a sense of flow and keeps the viewer's eye tracking in one
direction instead of jumping around.

**References:**
- [Nexaabyraj on coordinated slide transitions](https://x.com/Nexaabyraj/status/2065677785037979950)
- [1amanly slide-in animations](https://x.com/1amanly/status/2055514181823291762)

## 3D dolly over flat content

Apply a subtle CSS 3D rotation (rotateX/rotateY) to a flat screenshot or screen
recording and slowly pan across it with **linear easing**. The constant speed feels
cinematic, like a **dolly shot** gliding over a surface. No acceleration or
deceleration; the linear motion is what makes it feel smooth and intentional rather
than bouncy.

Great for product demos, landing page showcases, and dashboards where the content is
static but you want the viewer to feel like they're exploring it. The 3D tilt adds
depth and the slow pan keeps attention without requiring any actual animation in the
source content.

**Reference:** [Infisical product video with 3D panning](https://x.com/infisical/status/2065144775133839730)

## Speed ramping per scene

Each scene starts with the video playing at **2-3x speed**, then decelerates into
**slow motion** (0.5x or less) for the remainder. The fast opening acts as a natural
transition; the burst of motion signals a new scene and grabs attention. The slow
portion that follows lets the viewer absorb details.

In cinema this is called **speed ramping** (or **time remapping**). It works
particularly well with real-world footage, physical product shots, camera moves over
3D objects, and anime edits. The technique turns any continuous-motion clip into
something that feels edited and intentional without actually cutting anything.

The deceleration curve matters. A hard snap from fast to slow feels like a freeze
frame. A smooth ease-out from fast into slow feels like the camera is settling into
the moment, which is usually the more cinematic choice.

**Reference:** [Infisical homepage video with speed ramping](https://x.com/infisical/status/2065144775133839730)

## Abstract insert cuts as transitions

Between slower-paced hero scenes, insert short (0.5-1s) clips of fast, abstract,
super close-up footage with high movement. Light reflections, liquid surfaces, particle
bursts, lens flares, macro textures. These act as **insert cuts** that reset the
viewer's visual palette between content scenes, the same way a cymbal crash punctuates
a musical phrase.

The contrast in pacing is what sells it. The hero scenes are deliberate and composed;
the inserts are chaotic and kinetic. The viewer's brain reads the burst of abstract
motion as a scene boundary without needing a traditional fade or wipe. Works especially
well in product videos, car ads, and anime-style edits where you want energy without
breaking the mood.

These clips can be AI-generated (prompt for abstract light, caustics, ink in water,
sparks) or sourced from stock. They don't need to match the content thematically; the
speed and texture alone carry the transition.

**Reference:** [Dime Labs cybertruck video with abstract light inserts](https://x.com/Dime_Labs/status/1988627564231893223)

## Constant subtle camera drift

No scene should be fully static. Every scene benefits from a slow, continuous camera
movement: a gentle zoom, a slight 3D rotation, a creeping translation. This is called
**camera drift** (or **ambient motion**). It keeps the frame alive and prevents the
viewer from feeling like they're looking at a still image, even when the content itself
isn't animated.

The motion should be **linear easing** and **slow**. No acceleration, no bounce, no
spring. The viewer shouldn't consciously notice it; they should just feel that the video
has life. Think of it as the visual equivalent of a room tone in audio, always present,
never drawing attention.

Combine multiple axes for richer movement: zoom in slowly while rotating slightly on Y,
or translate left while tilting on X. The compound motion feels more natural than any
single axis alone.

**References:**
- [Dime Labs cybertruck with constant camera drift](https://x.com/Dime_Labs/status/1988627564231893223)
- [Hukam Design product video with ambient motion](https://x.com/hukamdesign/status/2065470376059244579)
- [Garren Motion with camera moves within a single scene](https://x.com/garrenmotion/status/2065412078584652090)

## Word-highlight captions over animated gradient

An animated gradient background with plain text scrolling slowly upward, caption-style,
revealing content as it's being narrated. The currently spoken word gets a
**highlight background** (contrasting pill or color shift) that tracks with the audio
timing.

The gradient keeps the visual interesting without competing with the text. The slow
scroll gives the viewer a sense of progress through the content. The word-level
highlight anchors attention to exactly what's being said, making it easy to follow even
with the sound off.

Pairs naturally with `egaki/text-to-speech` for generating the audio and word-level
timestamps. The TTS output provides exact timing per word, which drives both the scroll
position and the highlight.

**Reference:** [ElevenLabs word-highlight caption video](https://x.com/ElevenLabs/status/1930689774278570003)

## Staccato montage as transition

A rapid-fire sequence of images or short video clips, each lasting only 2-4 frames,
cut together at extreme speed. The content can be anything: random photos, bold text
cards, abstract textures, close-up details, inverted colors. It doesn't need to make
narrative sense; the rhythm is the point.

In music this is a **staccato** passage. In film editing it's a **smash cut montage**
or **flash cut** sequence. Placed between two slower, composed scenes it acts as a
percussive break, a burst of visual energy that resets the viewer's attention and makes
the next calm scene feel even more deliberate by contrast.

The images can be AI-generated in bulk (prompt for abstract textures, typography,
close-ups) or pulled from the project's own assets. Syncing the cuts to a beat makes
it feel intentional; without music, even random timing works because the sheer speed
overwhelms any sense of order.

**Reference:** [Totaku Original with rapid-cut montage transitions](https://x.com/totaku_original/status/2064278640381300929)

## Tiled repeat grid transition

Take a single frame (or short clip) from the current scene and tile it into a grid of
repeated copies. The duplicates can slide, scale, or fan out from the center, creating
a kaleidoscope-like burst before collapsing back into the next scene. This is a
variation of a **contact sheet** or **Andy Warhol grid** effect used as a transition.

The repetition itself is the visual hook. A single shoe becomes five shoes side by side;
a face becomes a 3x3 mosaic. The grid can animate in (tiles sliding from off-screen,
scaling up from zero, or snapping in with staggered delay) and animate out (collapsing
into a single tile that becomes the next scene's opening frame).

Works well as a punctuation mark between scenes. The repeated image reinforces the
subject visually while the grid animation provides movement and rhythm.

**Reference:** [Totaku Original with tiled repeat grid](https://x.com/totaku_original/status/2064278640381300929)

## Alternating video and text-only scenes

Interleave full-motion video scenes with minimal text-on-solid-background scenes. The
text scenes use animated typography (words appearing one by one, sliding in, changing
font weight or style mid-sentence) over a flat color or subtle texture. The contrast
between rich video and stripped-down text creates pacing and lets the message land.

The text scenes act as **title cards**, giving the viewer a moment to read and absorb
before the next visual hit. Mixing fonts (serif, italic, bold) within the same sentence
adds visual variety without needing any imagery. The rhythm of video-text-video-text
keeps the edit feeling structured and intentional.

This pattern is especially effective for brand and fashion videos where the product
footage is strong but needs narrative framing.

**Reference:** [Totaku Original alternating video and text cards](https://x.com/totaku_original/status/2056311080025276442)

## Mixed typography across text scenes

Use a different font for each text-only scene to keep the visual rhythm varied.
One scene in a heavy sans-serif, the next in a thin serif, the next in a handwritten
script. The font itself becomes a design element, carrying tone and emphasis even
when the layout stays simple (centered text on a flat background).

This prevents text scenes from feeling repetitive. Each font change signals a new
beat, almost like a different speaker or a shift in tone. Pair with varying text
size, alignment, and color to amplify the contrast between scenes.

**References:**
- [Amanly explainer video with varied typography](https://x.com/1amanly/status/2055514181823291762)
- [Amanly mixed font styles across scenes](https://x.com/1amanly/status/2042234863416471910)

## Rotating background colors for text scenes

Give each text-only scene a different solid background color. Cycle through a curated
palette so consecutive scenes never share the same hue. The color swap itself becomes
a transition; no fade or animation needed, the hard cut between two bold colors is
enough to signal a new beat. Keeps text scenes visually distinct even when the layout
and font stay the same.

**Reference:** [Amanly with rotating background colors](https://x.com/1amanly/status/2042234863416471910)

## Per-word color accents

Within a single text scene, color individual words differently from the rest of the
sentence. One keyword in a bright accent, the rest in white or neutral. This draws the
eye to the important word and adds visual texture without needing images, icons, or
animation. Multiple accent colors in the same sentence can create a rainbow or
branded color scheme effect.

Combine with font weight or size changes on the accented word for stronger emphasis.

## Shared layout animations

Elements live in a shared flexbox or grid layout. When a new element enters the scene,
the existing elements **reflow** to make room, animating smoothly to their new positions
with an **ease-out** transition. The entering element slides or fades in while the
others shift aside, creating a natural, physics-feeling rearrangement.

This is the FLIP animation pattern. In egaki, the `<LayoutTransition>` component
handles this automatically: give matching elements the same `id` across scenes and they
animate from their old position to their new one. The layout does the choreography;
you just add or remove items.

Works well for building up lists, card grids, feature comparisons, or any scene where
content accumulates incrementally. Each addition feels deliberate rather than instant.

**Reference:** [Amanly shared layout entry animations](https://x.com/1amanly/status/2033585198680723913)

## Cut on motion

An exit animation starts but the scene cuts away **before it finishes**. The next
scene begins with its own entry animation already in progress. The viewer's brain fills
in the gap, making the transition feel faster and more energetic than if each animation
played to completion. In film editing this is called a **match cut on action** or
**cutting on motion**.

In egaki, animation wrappers like `<SlideOut>` and `<SlideIn>` accept a
`delay` prop (in frames). A **negative delay** on an exit animation starts it
earlier in the scene, so the scene cuts while the element is still mid-exit. A
**positive delay** on an entry animation delays when it begins. Combined, you get
precise control over the cut point:

- `<SlideOut delay={-15}>` — exit starts 15 frames before the scene ends, gets cut
  mid-slide
- `<SlideIn delay={10}>` — entry waits 10 frames into the new scene before starting

The delay is predictable and frame-exact. No need to calculate durations relative to
scene length; you just say "start this animation N frames earlier/later than default."

**Reference:** [Sidorenko on cutting animations mid-motion](https://x.com/asidorenko_/status/2064729741119132119)
