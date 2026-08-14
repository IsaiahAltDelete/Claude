# ISAIART DESIGN

A type-in-space generator. Words and emoji are rasterised once, then thrown
through 3D formations by the GPU — tunnels, helices, galaxies, grids, corridors
— on a canvas whose size you set, with treatments applied to the letterforms
themselves rather than to the whole frame.

**Live:** <https://isaiahaltdelete.github.io/Claude/design/>

No dependencies, no build step, no network. Every typeface is bundled; nothing
is uploaded; the renderer is hand-written WebGL 2.

## How it works

The interesting constraint is that a thousand copies of a word have to cost
about as much as one. Three decisions get there:

**One texture.** Text is split into tokens (a phrase, its words, its characters
or its lines), each token is drawn once into a shelf-packed atlas, and every
copy on screen samples that atlas. Changing the words rebuilds one texture;
changing anything else does not touch it at all.

**Every treatment is a 2D canvas recipe.** Outline, extrude, long shadow,
chrome, halftone, knockout, RGB split and the rest are drawn while a token is
stamped into its cell. They therefore compose with any typeface, with emoji, and
cost nothing per frame — the GPU only ever sees pixels.

**Placement lives in the vertex shader.** Each instance carries an index, four
random numbers and a cell id — twenty-four bytes, uploaded once. Formation,
motion, size, roll, colour and fog are all computed in GLSL from those, so
dragging any of those sliders costs one uniform rather than a buffer upload.

Depth is expressed as fog on the colour rather than as transparency, which lets
glyphs stay opaque enough for the depth buffer to sort overlapping copies
correctly. That is the difference between crisp type and a soup of half-blended
rectangles.

## Pipeline

```
background pass   procedural field, or a tiled glyph/emoji pattern
type pass         instanced quads, multisampled, depth-sorted
bloom             quarter-res bright pass + separable blur   (only when > 0)
post              aberration, pixelate, posterise, scanlines, grain, vignette
```

Everything renders into an offscreen multisampled target at the artboard's
pixel size, so what you see is what a PNG export contains.

## Memory

The things that would normally leak in a tool like this are handled explicitly:
instance buffers grow in powers of two and are released when the live count
falls well below capacity; the atlas and pattern textures are deleted before
being replaced; render targets are rebuilt only on a size change; the frame loop
allocates nothing; and quality tiers cap total pixels so a 4K artboard cannot
melt a phone. Context loss is caught and the whole pipeline rebuilds itself.

## Presets and canvas

Two things get reached for constantly and belong to no panel, so they have
their own buttons in the bar. **Presets** (`P`) opens seventeen finished looks
— tunnels, tickers, galaxies, corridors, emoji swarms, chrome rings, knockout
monoliths — each a complete parameter set, each undoable. **Canvas** (`C`) sets
the artboard: eight ratios, six named pixel sizes from HD to 4K, a turn that
swaps width and height, and a clear.

## Controls

Five panels — Type, Space, Motion, Look, Out — generated from a single schema in
`scripts/02-state.js`. Each entry declares its range, default and which part of
the pipeline it invalidates, and the rail, the URL codec, the presets and the
randomiser all read from that one table.

Sliders jump on press and drag from there. Park the pointer on one and scroll
to adjust it — a wheel gesture belongs to whatever sat under the pointer when
it started, so flicking through the panel past a slider keeps scrolling instead
of nudging a value. Hold Shift for quarter-speed, mid-drag as well as before
it; drag the number to scrub, click it to type; double-click, Backspace or Home
restores a default. Arrows step, Page steps cover a hundredth of the range.

Lists take arrow keys, Home/End, Enter and type-ahead, and the long ones carry
a filter field; focus moves in on open and back to the trigger on close. While
a list is open it owns the keyboard, so typing to find a typeface cannot
trigger a global shortcut.

⌘Z and ⇧⌘Z undo and redo everything, including Randomise, presets, Reset and
Clear — a continuous drag collapses into one step, and each of those commands
is always its own. Clearing the text clears the canvas (⌘⌫, or the ✕ on the
field), and undo brings it back.

On the canvas, drag to orbit, scroll or pinch to dolly, two fingers to pan,
double-click or double-tap to recentre. On a phone the rail is a bottom sheet
that tracks your finger and takes a flick; a vertical swipe that starts on a
slider scrolls the panel rather than overwriting the setting.

## Layout

```
index.html                the whole page
styles/01-tokens.css      palette, reset, type scale
styles/02-controls.css    every custom element
styles/03-layout.css      bar, stage, rail, status
styles/04-responsive.css  the phone sheet
scripts/01-util.js        dom, maths, colour, storage, drag
scripts/02-state.js       schema, defaults, presets, serialisation
scripts/03-atlas.js       tokenising, measuring, the 18 text treatments
scripts/04-shaders.js     GLSL for all five programs
scripts/05-renderer.js    WebGL 2: programs, instancing, targets, passes
scripts/06-controls.js    slider, segment, toggle, select, colour, pad, vec…
scripts/07-panels.js      builds the rail from the schema
scripts/08-export.js      stills and clips
scripts/99-boot.js        wiring and the frame loop
assets/fonts/             20 bundled faces, all OFL 1.1
```

## Output

PNG at 1× or 2× the artboard size (rendered at exactly that size, not upscaled),
copy to clipboard, or a WebM clip recorded from the live canvas at 24/30/60 fps.
Settings travel as a link, save to a JSON file, and persist locally unless you
turn that off.

## Typefaces

Anton, Archivo Black, Bebas Neue, Oswald, Inter, Space Grotesk, Syne, Playfair
Display, DM Serif Display, Instrument Serif, JetBrains Mono, Major Mono Display,
VT323, Orbitron, Bungee, Monoton and Rubik Glitch, plus the system sans, serif
and mono stacks. All bundled faces are under the SIL Open Font License 1.1 —
copyright notices and the licence text are in `assets/fonts/LICENSES.md`. Emoji
render through whichever colour emoji font your device provides.
