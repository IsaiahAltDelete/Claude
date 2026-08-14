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
tools/build-assets.py        regenerates the Mac's icons and wallpapers
```

## Notes

These are independent educational simulations. They are not Apple, Microsoft or
Roku products, and are not affiliated with or endorsed by Apple Inc., Microsoft
or Roku, Inc. The bundled fonts are Inter and JetBrains Mono, both under the SIL
Open Font License 1.1; licences sit alongside them in each `assets/fonts/`
folder.
