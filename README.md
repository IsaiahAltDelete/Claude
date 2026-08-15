# Simulators

Devices rebuilt in the browser, close enough to the real thing to practise on.
All three are for support training: an agent can walk a caller through a flow,
or rehearse one, without touching a real machine.

**Live:** <https://isaiahaltdelete.github.io/Claude/>

| | | |
|---|---|---|
| [macOS Troubleshooting Simulator](mac/README.md) | [`/mac`](https://isaiahaltdelete.github.io/Claude/mac/) | A full macOS Tahoe desktop — window manager, Finder, Safari, Mail, Outlook, System Settings, Recovery |
| [iPhone Simulator](iphone/README.md) | [`/iphone`](https://isaiahaltdelete.github.io/Claude/iphone/) | A full iOS phone — lock screen, Control Centre, Spotlight, App Library and 51 apps |
| [Roku Troubleshooting Simulator](roku/README.md) | [`/roku`](https://isaiahaltdelete.github.io/Claude/roku/) | A streaming player on a TV with a mock-up remote — home screen, channels, live guide, search, store, settings, restarts and factory reset |
| [ISAIART DESIGN](design/README.md) | [`/design`](https://isaiahaltdelete.github.io/Claude/design/) | A type-in-space generator — not a simulator, but it lives here too |

Each folder has its own README with credentials, a feature list, its layout and
the console commands for staging scenarios.

## What they have in common

Vanilla HTML, CSS and JavaScript. No dependencies, no build step, no server —
clone the repository and open any of the `index.html` files. Every asset is
local, so all three run straight from `file://`; the fonts are bundled and all
artwork is generated from primitives rather than fetched.

Everyone in them is invented — Alex Rivera's Mac, Alex Rivera's iPhone and the
Roku in Alex Rivera's living room, with the same made-up household around them,
reserved `.example` addresses and 555 phone numbers throughout. On the Roku,
every streaming service and programme is invented too.

None of them reads or changes your actual machine, phone, streaming device,
network, accounts, camera, microphone or files. All state lives in the page's
`localStorage`, and a factory reset clears it.

Two things reach the network on purpose, and both are stated plainly in the UI:
the Mac's Safari can browse real Wikipedia through its CORS API, and the iPhone's
Maps embeds a real OpenStreetMap view. Everything else works offline.

All three are responsive — usable from a 360px phone to a large desktop — and
honour reduce-motion, reduce-transparency and text-scaling preferences.

## Project layout

```
index.html                   the index page at the site root
404.html                     matching not-found page
.github/workflows/pages.yml  publishes the site to GitHub Pages on push to main
mac/                         the macOS simulator, served at /mac
iphone/                      the iPhone simulator, served at /iphone
roku/                        the Roku simulator, served at /roku
design/                      ISAIART DESIGN, served at /design
tools/build-assets.py        regenerates the Mac's icons and wallpapers
tools/check-syntax.py        parses every script, alone and merged into one scope
tools/check-refs.py          resolves every icon, pane and command reference
tools/smoke.mjs              opens every app in a real browser and asserts on it
```

## Checks

None of the three has a build step, so nothing sits between a typo and the
deployed site. Three gates run on every push and block the deploy:

```
python3 tools/check-syntax.py   parse, including the shared global scopes
python3 tools/check-refs.py     every glyph, pane, command and app id resolves
node tools/smoke.mjs            all 82 apps open in Chromium with no console errors
```

The iPhone's and the Roku's scripts are classic scripts that share one global
lexical environment, so a duplicate top-level `const` anywhere across a set is a
SyntaxError that only exists once the browser merges them — the page still
renders and the app throws when opened. check-syntax reproduces that merge for
both. The Mac is exempt: each of its files wraps its body in an IIFE.

The smoke test also checks the HTML sanitiser, keyboard reachability, colour
contrast, the scenario definitions, and that the Mac and the iPhone still boot
against a save written by an older build. It covers those two only — the Roku
has no browser coverage yet, just the parse and reference gates.

## Notes

These are independent educational simulations. They are not Apple, Microsoft or
Roku products, and are not affiliated with or endorsed by Apple Inc., Microsoft
or Roku, Inc. The bundled fonts are Inter and JetBrains Mono, both under the SIL
Open Font License 1.1; licences sit alongside them in each `assets/fonts/`
folder.
