# ISAIART — Simulators and tools

Five things that run in a browser with nothing to install: three device
simulators built for support training, and two graphics tools that ended up
alongside them.

**Live:** <https://isaiahaltdelete.github.io/Claude/> · **Main site:**
<https://isaiart.com>

| | | |
|---|---|---|
| [macOS Troubleshooting Simulator](mac/README.md) | [`/mac`](https://isaiahaltdelete.github.io/Claude/mac/) | A full macOS Tahoe desktop — window manager, Finder, Safari, Mail, Outlook, System Settings, Recovery. 31 apps |
| [iPhone Simulator](iphone/README.md) | [`/iphone`](https://isaiahaltdelete.github.io/Claude/iphone/) | A full iOS phone — lock screen, Control Centre, Spotlight, App Library and 51 apps, with a control panel beside the device |
| [Roku Troubleshooting Simulator](roku/README.md) | [`/roku`](https://isaiahaltdelete.github.io/Claude/roku/) | A streaming player on a simulated television with a mock-up remote — 43 channels, live guide, search, store, the settings tree, restarts and factory reset |
| [ISAIART Design](design/README.md) | [`/design`](https://isaiahaltdelete.github.io/Claude/design/) | A type-in-space generator — 21 formations, 18 letterform treatments, hand-written WebGL |
| [ISAIART Image](image/README.md) | [`/image`](https://isaiahaltdelete.github.io/Claude/image/) | A photograph processor — grading, screens, and subject cut-out by a graph cut running on your device |

Each folder has its own README with credentials, a feature list, its layout and
the console commands for staging scenarios. `CLAUDE.md` is the orientation note
for anyone — human or agent — picking the repository up cold.

## How it looks

There are two visual worlds here, and the split is deliberate rather than
accidental drift.

**The three simulators look like the devices they simulate**, and nothing else.
A macOS window has to have macOS's 12px corner radius and its Liquid Glass
materials; the Roku has to be Roku purple on a 1280×720 grid with a 48px
title-safe margin; the iPhone has to be iOS. That is the entire point — an
agent rehearsing "check which input the TV is on" is learning a real screen, so
a house style applied over the top would make them worse at the job. They are
therefore **excluded from the site theme** and always will be. Each one carries
its own tokens file pinned to the real product's metrics.

**Everything that is not a simulator shares one theme:** the index, the 404,
`/design` and `/image`. It is cassette futurism taken as an interface language
rather than a costume — the visual grammar of instrument panels and test
equipment, kept as actual interface:

- **Warm neutral grounds.** Near-black in dark, warm paper in light. Nothing is
  blue and nothing is pure white, so the ground reads as a panel rather than as
  a document.
- **One phosphor accent.** Amber, and it means exactly one thing: this control
  is live. Everything else is achromatic so the canvas keeps all the real
  colour.
- **Square corners and hairlines.** 2–4px radii, 1px rules, no gloss, no drop
  shadows, no rounded cards.
- **Monospaced readouts.** Every number is tabular JetBrains Mono; every micro
  label is uppercase and letterspaced. Body text is Inter.
- **No skeuomorphism.** No bezels, screws, scanline overlays, CRT curvature or
  chrome pretending to be hardware, and no narration pretending the page is a
  machine. The one moving element on each static page — the chart-recorder
  trace on the index, the X–Y oscilloscope on the 404 — is a real instrument
  behaviour, drawn with genuine phosphor decay, and it is structural: the index
  trace *is* the rule between the masthead and the directory.

Light and dark are siblings, not an inversion — the light theme is warm paper
under the same lamp, not the dark theme with the values flipped. The choice is
remembered under one `localStorage` key across all four pages, so it follows
you from the index into a tool and back.

All of it comes out of one file, `common/styles/tokens.css`. Every rule in the
shared controls, both tool layouts and the index spends token names and never a
literal colour, so retuning the whole theme is that file alone. The 404 is the
single deliberate exception, and it says why in its own comments — GitHub Pages
serves it for a miss at *any* depth, so it cannot link a stylesheet and carries
a copy of the palette instead.

## What they have in common

Vanilla HTML, CSS and JavaScript. No dependencies, no build step, no server —
clone the repository and open any of the `index.html` files. Every asset is
local, so all five run straight from `file://`; the fonts are bundled and all
artwork is generated from primitives rather than fetched.

Everyone in the simulators is invented — Alex Rivera's Mac, Alex Rivera's iPhone
and the Roku in Alex Rivera's living room, with the same made-up household
around them, reserved `.example` addresses and 555 phone numbers throughout. On
the Roku, every streaming service and programme is invented too. The internet
provider throughout, **Sablewave**, is invented as well.

None of them reads or changes your actual machine, phone, streaming device,
network, accounts, camera, microphone or files. All state lives in the page's
`localStorage`, and a factory reset clears it. In `/image`, your photograph is
decoded, worked on and exported entirely on your device — there is no server to
upload it to.

Two things reach the network on purpose, and both are stated plainly in the UI:
the Mac's Safari can browse real Wikipedia through its CORS API, and the
iPhone's Maps embeds a real OpenStreetMap view. Everything else works offline.

Everything is responsive — usable from a 360px phone to a large desktop — and
honours reduce-motion, reduce-transparency and text-scaling preferences.

## Project layout

```
index.html                   the index page at the site root
404.html                     matching not-found page, deliberately self-contained
favicon.svg
.github/workflows/pages.yml  publishes the site to GitHub Pages on push to main
mac/                         the macOS simulator, served at /mac
iphone/                      the iPhone simulator, served at /iphone
roku/                        the Roku simulator, served at /roku
design/                      ISAIART Design, served at /design
image/                       ISAIART Image, served at /image
common/                      the theme, controls and parameter store the two tools
                             and the index share
  styles/tokens.css          the whole palette, both themes — the single source
  styles/controls.css        every custom element
  scripts/util.js            dom, maths, colour, storage, drag
  scripts/store.js           the parameter store: patches, undo, presets, links
  scripts/controls.js        slider, segment, toggle, select, colour, pad, vec…
  scripts/panels.js          builds a control rail from any schema
  assets/fonts/              20 bundled faces, all OFL 1.1
tools/build-assets.py        regenerates the Mac's and iPhone's icons and wallpapers
tools/check-syntax.py        parses every simulator script, alone and merged into one scope
tools/check-refs.py          resolves every icon, pane and command reference
tools/smoke.mjs              opens every app in a real browser and asserts on it
```

The three simulators each keep their own `assets/fonts/`, because they are
independent of `common/` and of each other — a simulator has to keep looking
like its device even if the site theme is thrown away entirely.

## Checks

Nothing here has a build step, so nothing sits between a typo and the deployed
site. Three gates run on every push and block the deploy:

```
python3 tools/check-syntax.py   parse, including the shared global scopes
python3 tools/check-refs.py     every glyph, pane, command and app id resolves
node tools/smoke.mjs            every app and screen opens in Chromium, no console errors
```

The iPhone's and the Roku's scripts are classic scripts that share one global
lexical environment, so a duplicate top-level `const` anywhere across a set is a
SyntaxError that only exists once the browser merges them — the page still
renders and the app throws when opened. check-syntax reproduces that merge for
both. The Mac is exempt: each of its files wraps its body in an IIFE.

The smoke test also checks the HTML sanitiser, keyboard reachability, colour
contrast, the scenario definitions, and that the Mac and the iPhone still boot
against a save written by an older build.

The Roku is covered too. Its settings are one large tree of closures evaluated
lazily against live state, so the suite walks every node and calls every
`value()` and `detail()` in it, then renders each screen that has rows. It also
opens every channel page, checks that no screen repeats a focus id, switches the
television through all five of its inputs, asserts that HDMI-CEC one-touch play
both works when it is on and stays quiet when it is off, and leaves the player
by each exit to prove the playback clock stops and the resume point survives.

**What the gates do not cover:** all three only look at `mac/`, `iphone/` and
`roku/`. The index, the 404, `/design` and `/image` have no automated coverage
at all — even though `design/` and `image/` load classic scripts into one shared
global scope and carry exactly the same duplicate-`const` hazard the simulators
are checked for. Changes to those four are verified by opening them, in both
themes. `CLAUDE.md` has the recipe.

## Notes

These are independent educational simulations. They are not Apple, Microsoft or
Roku products, and are not affiliated with or endorsed by Apple Inc., Microsoft
or Roku, Inc. Every bundled typeface is under the SIL Open Font License 1.1;
licences sit alongside them in each `assets/fonts/` folder.
