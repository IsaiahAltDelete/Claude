# Notes for Claude

Orientation for an agent picking this repository up cold. `README.md` is the
public description; this file is the working knowledge — what the place is, what
must not be broken, and what has already bitten someone.

## What this is

Five independent static pages, plus a shared theme, published to GitHub Pages
from `main`. Three are device simulators for support training; two are graphics
tools. There is no framework, no bundler, no package manager and no server.

| Path | What | Scale |
|---|---|---|
| `mac/` | macOS Tahoe desktop | 32 apps, 21 scripts, ~14k lines |
| `iphone/` | iOS phone | 51 apps, one 8.6k-line `index.html` plus 10 scripts |
| `roku/` | Roku player on a simulated TV | 43 channels, 16 live, 20 scripts |
| `design/` | Type-in-space generator, WebGL 2 | 86 controls, 21 formations, 18 treatments, 22 presets |
| `image/` | Photograph processor, WebGL 2 | 100 controls, 20 presets, classical segmentation |
| `common/` | Theme, controls and parameter store for `design`, `image` and the index | |

## Invariants — do not break these

1. **No build step, no dependencies, no server.** Everything must run by opening
   `index.html`. If a change needs a compiler, a package or a fetch to a CDN,
   it is the wrong change.
2. **Every asset is local.** Fonts are bundled; artwork is generated from
   primitives. Each page must work from `file://` with the network unplugged.
3. **Two network exceptions, both stated in the UI.** The Mac's Safari fetches
   real Wikipedia through its CORS API; the iPhone's Maps embeds OpenStreetMap.
   Nothing else may reach out.
4. **Nothing touches the user's real machine.** All state is `localStorage`.
   In `/image` the photograph never leaves the device.
5. **Everyone is invented.** Alex Rivera's household, `.example` domains, 555
   numbers, and the invented ISP *Sablewave*. Roku's channels and programmes are
   invented too. Never model anyone on a real person, and never introduce a real
   brand beyond the three the simulators openly imitate.
6. **The simulators stay outside the site theme.** See below.

## The theme, and the one rule about it

There are two visual worlds, and this is the thing most likely to be got wrong.

**`mac/`, `iphone/` and `roku/` look like the devices they simulate.** They each
have their own `styles/01-tokens.css` pinned to the real product's metrics —
macOS's 25px menu bar and 12px window radius, Roku's 1280×720 grid and 48px
title-safe margin. They do **not** load anything from `common/`, and they must
not. A house style applied over the top would defeat the purpose: the trainee is
supposed to be learning a real screen. If asked to "make the site consistent",
these are excluded.

**The index, the 404, `design/` and `image/` share one theme.** It is cassette
futurism as an interface language, not a costume:

- warm neutral grounds (near-black / warm paper), never blue, never pure white
- one phosphor amber accent, meaning "this is live" and nothing else
- square corners (2–4px), 1px hairlines, no gloss or drop shadows
- monospaced tabular numerals, uppercase letterspaced micro labels, Inter for body
- **no skeuomorphism**: no bezels, screws, scanline overlays or fake CRT glass,
  and no roleplay text pretending the page is a machine

`common/styles/tokens.css` is the single source for all of it — both themes,
every value. Everything downstream spends token names and never a literal
colour, so a retune is that one file. Two consequences worth knowing:

- **Never introduce a colour literal** in `common/styles/controls.css`, the two
  tool layouts, or the index. The only literals that belong are inside the
  colour picker, where they represent actual colour space (the hue strip, the
  saturation/value square) rather than theme.
- **`tokens.css` sets the base reset only.** It used to also set
  `html, body { height: 100%; overflow: hidden }`; that is app-shell geometry
  and now lives in `design/styles/03-layout.css` and `image/styles/layout.css`,
  because the index loads the same tokens and is an ordinary scrolling document.

### Theme persistence

All four non-emulator pages share the `localStorage` key `isaiart.theme`, so the
choice follows the visitor between them. The value is **JSON-encoded** (`"dark"`,
with quotes), because the two tools write it through `common/scripts/util.js`'s
`store` helper, which stringifies. The index and the 404 encode and decode to
match — if you touch either side, keep them in agreement or the choice silently
falls back to the default.

## Traps this repository has already hit

**The 404 must stay self-contained.** GitHub Pages serves `404.html` for a miss
at any depth (`/Claude/a/b/c/nope`), so a relative stylesheet, font or script
path resolves against a directory that does not exist, and an absolute one
breaks `file://` and forks. It therefore inlines its CSS and JS, uses system
font stacks, and carries a *copy* of the palette. **If you retune
`tokens.css`, retune the copy in `404.html` to match** — it is the one piece of
duplication in the theme and it is deliberate.

**Classic scripts share one global lexical environment.** `iphone/`, `roku/`,
`design/` and `image/` all load plain `<script>` tags, not modules. Two
top-level `const`/`let`/`class` declarations of the same name across a set are a
fatal SyntaxError that only appears once the browser merges them — the page
still renders, and the affected file's functions throw `ReferenceError` when
something calls them. `mac/` is immune because every file wraps its body in
`(function (Mac) { … }(window.Mac))`.

**Canvas phosphor decay does not round-trip in 8 bits.** Fading a canvas by
washing it with its own ground colour at low alpha — the obvious way to draw a
decaying trace — walks the ground off its own value over a few hundred frames,
because 8-bit compositing quantises. The light theme's cream drifted visibly
pink. It also eats anything painted once underneath, like a graticule. Both the
index trace and the 404 scope therefore keep the trace on a separate
transparent layer, fade *that* toward transparent (zero alpha is a fixed point
quantisation lands on exactly), and repaint ground and graticule fresh every
frame.

**A canvas cannot inherit a CSS custom property.** Anything drawn to a canvas
has to read its colours back with `getComputedStyle(document.documentElement)
.getPropertyValue("--x")` and re-read them when the theme changes. Both static
pages watch `data-theme` with a `MutationObserver` rather than calling a repaint
beside every place the theme can change.

## Checks

```sh
python3 tools/check-syntax.py   # parses each script, and each shared global scope merged
python3 tools/check-refs.py     # every glyph, pane, command and app id resolves
python3 tools/build-assets.py   # regenerates mac/ and iphone/ artwork; CI fails on drift
node tools/smoke.mjs            # opens every app in Chromium, fails on any console error
```

`smoke.mjs` needs Playwright and Chromium:

```sh
npm install --no-save playwright@1.49.1
npx playwright install --with-deps chromium
```

In this sandbox Chromium is pre-installed — set
`CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome` and do **not**
run `playwright install`.

**Coverage gap:** all three gates only look at `mac/`, `iphone/` and `roku/`.
The index, the 404, `design/` and `image/` have none — including the
duplicate-`const` check, which they need just as much. Verify those four by
opening them in a browser, in **both themes**, and watching the console. A
throwaway static server plus Playwright is enough; drive the theme with
`document.documentElement.dataset.theme = "light"` and sample real pixels with
`getImageData` rather than trusting a screenshot, which is how the pink-drift
bug above was actually found.

## Adding things

**A Mac app** — `Mac.registerApp({ id, title, icon, render(win), … })`. Launchpad,
the Dock, Spotlight, the Applications folder and the App Store all pick it up.
Interactive markup is declarative: `data-command`, `data-arg`, `data-toggle-path`,
`data-select-path` and `data-range-path` are routed by one handler in
`mac/scripts/40-events.js`.

**An iPhone app** — `defineApp({ id, name, bg, glyph, mount(win, inst) })`.
`defineApp` keys by id, which is how `61`–`65` replace the first-pass versions
without editing the original. Nothing appears on the home screen until its id is
added in `iphone/scripts/69-register.js`.

**A control in either tool** — one entry in the schema (`design/scripts/02-state.js`
or `image/scripts/state.js`) declaring range, default, dependencies and the
sentence that becomes its tooltip. The rail, the URL codec, the presets and the
randomiser all read that one table. For `/image`, one more line in a shader.

**A project on the index** — copy an entry block in `index.html` and keep the
numbers sequential. The counts in each entry's `meta` line are real; if you
change a project's scale, update them.

## Staging scenarios

Each simulator exposes a console API; the per-folder READMEs have the full list.

```js
MacSim.help(); MacSim.scenarios.captivePortal(); MacSim.reset()
setNetwork('captive'); incomingCall('Nina'); factoryReset()      // iPhone
roku.setInput('hdmi2'); roku.noTvControl(); roku.secret()        // Roku
```

## House style for changes

Match what is already there. Comments in this codebase explain *why* a thing is
the way it is — the non-obvious constraint, the failure that motivated it — and
never restate what the line does. Section banners are hairline comment rules.
Prose in the READMEs is plain and specific, uses British spelling, and states
limitations rather than glossing them.
