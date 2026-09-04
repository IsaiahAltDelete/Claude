# ISAIART IMAGE

A photograph processor. Tone and grade, screens and distortions, and — the
part that makes the rest worth having — a subject found and separated from its
background, so every effect can be aimed at one side of the cut.

**Live:** <https://isaiahaltdelete.github.io/Claude/image/>

No dependencies, no build step, no network. Your photograph is decoded, worked
on and exported entirely on your device; nothing is uploaded, and there is no
server to upload it to.

## Finding the subject

The interesting problem here is doing real segmentation with no model, no
weights and no network — everything has to fit in a script file and run in a
few hundred milliseconds. Classical computer vision does, and `scripts/segment.js`
is the whole of it:

**Saliency** finds where the subject probably is. A spectral-residual pass —
FFT the luminance, subtract the log-magnitude's own smoothed average, invert —
answers "what in this frame is unlike the rest of it", which is a surprisingly
good proxy for what a person would call the subject. Colour contrast in Lab
space is mixed in, Otsu picks a threshold, and the largest connected blob
becomes a rectangle.

**GrabCut** turns that rectangle into a boundary. Two Gaussian mixtures are
learned — one for what is probably foreground, one for what is certainly
background — and the labelling that best explains the pixels is found as a
minimum cut of a graph whose edges are colour differences. The max-flow is
Boykov–Kolmogorov with source and sink trees and orphan adoption, which is the
algorithm that made this tractable on a CPU in the first place.

**Guided-filter matting** puts the edge back. The cut is computed on a copy no
larger than 512px, so its boundary is blocky; a guided filter run against the
full-size picture pulls that boundary onto the real one, which is what recovers
hair and glass instead of a paper cut-out.

Three tools reach it. **Box** is the strongest: draw a rectangle round the
subject and the graph cut works from inside your hint rather than a guess.
**Find subject** does the whole thing unattended. **Pick** takes everything of
one colour in a press, and **Add** and **Erase** paint the selection by hand
for the piece the algorithm was never going to get.

## Pipeline

```
geometry     fit, zoom, pan, rotate, flip — applied to the photograph and to
             the mask with identical uniforms, so the two stay registered
tone         exposure and white balance in linear light, the tonal controls in
             display space, then the grade
blur         one separable Gaussian, shared by clarity, sharpen and soften
style        the effect panel: coordinate distortions first, then screens
composite    subject against background, with outline and drop shadow
bloom        quarter-res bright pass                        (only when > 0)
post         aberration, grain, vignette, border
```

Every stage is a full-screen pass, and every uniform is bound from a manifest
that names its parameter — so adding a slider means one line in the schema and
one line in a shader, and nothing in the renderer has to learn about it.

The mask is carried as a single-channel texture and sampled through the same
geometry pass as the picture. Feather, grow/shrink and smooth are shaped at the
edge in the composite shader rather than rebuilt on the CPU, which is why those
three sliders are live under a drag while the detector is not.

## Memory

The photograph is decoded once and uploaded once. A reduced copy — no longer
than 1400px — is kept as plain pixels, because segmentation and the brush are
CPU work and twelve megapixels would make both a hundred times slower for a
mask the GPU then samples through a linear filter anyway. Render targets are
allocated per size and deleted before being replaced; textures are deleted
before reupload; the frame loop allocates nothing, and the brush writes into
the mask it already has rather than a copy per pointer event. Quality tiers cap
total preview pixels so a 4K canvas cannot melt a phone, and exports ignore
that cap entirely.

## Controls

Six panels — Source, Tone, Grade, Effect, Subject, Out — generated from one
schema in `scripts/state.js`. Each entry declares its range, default, the rows
it depends on and a sentence explaining what it does; the rail, the tooltips,
the URL codec, the presets and the randomiser all read from that single table.

Sliders jump on press and drag from there; park the pointer on one and scroll
to adjust it. Hold Shift for quarter-speed, drag the number to scrub, click it
to type, double-click to restore a default. Hovering anything gives you the
sentence it carries, after a pause the first time and instantly thereafter.

⌘Z and ⇧⌘Z undo and redo. The selection is not a parameter, so it keeps its own
history — undo steps back through whichever of the two you touched last, which
means a brush stroke and a slider drag both come back the way you expect.

**Randomise** varies a look rather than sampling the sliders. Sampling every
control independently reliably produces noise, so a roll starts from a preset,
re-rolls its grade, jitters its tone inside bounds that keep the picture
readable, and adds at most one or two stylistic moves — never two that argue,
and never the same starting point twice running.

## Output

PNG, JPEG or WebP at 1× or 2× the canvas size — rendered at exactly that size,
not upscaled, and never at the preview's resolution whatever the quality tier
is set to. PNG is the only one that keeps a transparent background, which is
what the **Transparent** background mode is for. Copy puts a full-size PNG
straight on the clipboard. With Animate on, the live canvas records to a clip.

Settings travel as a link and save to a JSON file — the treatment only, never
the photograph. They persist locally unless you turn that off.

## Layout

```
index.html              the whole page
styles/layout.css       bar, stage, artboard, rail, status, the phone sheet
scripts/state.js        schema, defaults, 20 presets, the randomiser
scripts/shaders.js      GLSL for all seven programs, and the uniform manifest
scripts/segment.js      saliency, GrabCut, max-flow, matting, wand, brush
scripts/renderer.js     WebGL 2: programs, targets, the pass chain
scripts/export.js       stills and clips
scripts/boot.js         the picture, the mask, the clock, and the wiring
```

Shared with `/design`: `common/styles` (tokens and every control's styling) and
`common/scripts` (dom and maths helpers, the parameter store, the custom
elements, and the rail builder). Both pages are the same tool wearing different
schemas.
