# Simulators

Devices rebuilt in the browser, close enough to the real thing to practise on.
Both are for support training: an agent can walk a caller through a flow, or
rehearse one, without touching a real machine.

**Live:** <https://isaiahaltdelete.github.io/Claude/>

| | | |
|---|---|---|
| [macOS Troubleshooting Simulator](mac/README.md) | [`/mac`](https://isaiahaltdelete.github.io/Claude/mac/) | A full macOS Tahoe desktop — window manager, Finder, Safari, Mail, Outlook, System Settings, Recovery |
| [iPhone Simulator](iphone/README.md) | [`/iphone`](https://isaiahaltdelete.github.io/Claude/iphone/) | A full iOS phone — lock screen, Control Centre, Spotlight, App Library and 51 apps |
| [ISAIART DESIGN](design/README.md) | [`/design`](https://isaiahaltdelete.github.io/Claude/design/) | A type-in-space generator — not a simulator, but it lives here too |

Each folder has its own README with credentials, a feature list, its layout and
the console commands for staging scenarios.

## What they have in common

Vanilla HTML, CSS and JavaScript. No dependencies, no build step, no server —
clone the repository and open either `index.html`. Every asset is local, so both
run straight from `file://`; the fonts are bundled and all artwork is generated
from primitives rather than fetched.

Everyone in both simulators is invented — Alex Rivera's Mac and Alex Rivera's
iPhone, with the same made-up household around them, reserved `.example`
addresses and 555 phone numbers throughout.

Neither one reads or changes your actual machine, phone, network, accounts,
camera, microphone or files. All state lives in the page's `localStorage`, and a
factory reset clears it.

Two things reach the network on purpose, and both are stated plainly in the UI:
the Mac's Safari can browse real Wikipedia through its CORS API, and the iPhone's
Maps embeds a real OpenStreetMap view. Everything else works offline.

Both are responsive — usable from a 360px phone to a large desktop — and honour
reduce-motion, reduce-transparency and text-scaling preferences.

## Project layout

```
index.html                   the index page at the site root
404.html                     matching not-found page
.github/workflows/pages.yml  publishes the site to GitHub Pages on push to main
mac/                         the macOS simulator, served at /mac
iphone/                      the iPhone simulator, served at /iphone
design/                      ISAIART DESIGN, served at /design
tools/build-assets.py        regenerates the Mac's icons and wallpapers
tools/check-syntax.py        parses every script, alone and merged into one scope
tools/check-refs.py          resolves every icon, pane and command reference
tools/smoke.mjs              opens every app in a real browser and asserts on it
```

## Checks

Neither simulator has a build step, so nothing sits between a typo and the
deployed site. Three gates run on every push and block the deploy:

```
python3 tools/check-syntax.py   parse, including the iPhone's shared global scope
python3 tools/check-refs.py     every glyph, pane, command and app id resolves
node tools/smoke.mjs            all 82 apps open in Chromium with no console errors
```

The smoke test also checks the HTML sanitiser, keyboard reachability, colour
contrast, the scenario definitions, and that both simulators still boot against
a save written by an older build.

## Notes

These are independent educational simulations and are not Apple products. They
are not affiliated with or endorsed by Apple Inc. or Microsoft. The bundled fonts
are Inter and JetBrains Mono, both under the SIL Open Font License 1.1; licences
sit alongside them in each `assets/fonts/` folder.
