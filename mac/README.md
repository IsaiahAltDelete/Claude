# macOS Tahoe Troubleshooting Simulator

A browser-based simulation of a Mac running macOS Tahoe 26, built for support
training. It looks and behaves like the real desktop — Liquid Glass
materials, a working window manager, System Settings, Mail, Outlook, Safari, the
App Store, Recovery and Setup Assistant — so agents can rehearse full
troubleshooting flows without touching a real machine.

Nothing here reads or changes your actual Mac, network, accounts or files. All
state lives in this page's `localStorage`, and there is no build step and no
server. Every asset is local, so the simulator runs straight from `file://` —
the one thing that reaches the network is the browser's optional live web
access, described below.

**Live:** <https://isaiahaltdelete.github.io/Claude/mac/> — the site root is a
minimal index of projects; the simulator lives at `/mac`.

## Running it

Open the live link above, or clone the repository and open `mac/index.html` in
any current browser. Everything except live web access works from `file://`,
since all assets are local.

| | |
|---|---|
| Login password | `support` |
| Apple Account | `isaiah@icloud.example` / `support`, verification code `424242` |
| Wi-Fi passwords | Spectrum Home `spectrum` · Support Bench 5G `benchpass` · Neighbor 5G `neighbor` · Printer Setup `printer` |

## What it covers

**Desktop shell** — menu bar with per-app menus, Dock (magnification, position,
auto-hide, running dots, badges, minimised-window slots, contextual menus),
Control Centre, Notification Centre, desktop widgets and items, Launchpad with
paging and search, Mission Control with Spaces, Spotlight, volume/brightness
HUDs and a full contextual-menu layer.

**Window management** — multiple windows per app, each with independent state,
so two Finder windows browse different folders and two Safari windows keep
separate tabs. Drag, eight-direction resize, minimise to the Dock, zoom, full
screen, edge-snap tiling (halves, quarters, fill), cascade, `⌘\`` window
cycling, `⌘Tab` app switching, Spaces with per-window assignment, and reflow on
viewport resize.

**Apps** — Finder (icon/list/column/gallery views, path bar, per-window history,
Bin with Put Back and Empty), Safari (per-tab history, private browsing,
bookmarks, downloads, a catalogue of simulated support pages, **real Wikipedia
browsing**, offline and captive-portal and fraudulent-site error states), Apple Mail (two accounts,
unified mailboxes, categories, compose/drafts/send, rules, signatures, junk,
seven-pane settings sheet), Microsoft Outlook (ribbon, folder pane, Focused
Inbox, calendar, People, its own settings), App Store (sections, app detail
pages, install/update/remove with progress), Notes, TextEdit, Preview,
Calculator, Terminal (30+ simulated commands), Activity Monitor (CPU / Memory /
Energy / Disk / Network), Disk Utility (First Aid, mount, erase), Console,
Screenshot, Time Machine, Passwords, System Information, Migration Assistant,
plus Messages, Calendar, Reminders, Contacts, Photos, Music, Podcasts, Maps,
FaceTime, Weather and Freeform.

**System Settings** — 26 top-level panes and 10 sub-panes, all searchable, plus
a complete Apple Account section: iCloud storage and features, Family Sharing,
trusted devices, Sign-In & Security with two-factor, Media & Purchases and
Payment & Shipping. Signing out genuinely disables iCloud-backed features
elsewhere in the simulator.

**Troubleshooting** — every network failure mode is reachable and recoverable:
Wi-Fi off, wrong password, unavailable network, captive-portal sign-in, missing
DNS, no DHCP address, proxy misconfiguration, offline Mail and App Store, and a
network-only reset. The five-stage Network Diagnostics run reports which stage
failed and offers the matching fix.

**Lifecycle** — boot, login window (user list or name-and-password), lock
screen, sleep, restart, shut down, log out, Safe Mode, macOS Recovery (Time
Machine restore, reinstall, Disk Utility First Aid, Startup Security, Erase
Assistant), Erase All Content and Settings with password + `ERASE` confirmation,
and a five-step Setup Assistant that runs afterwards.

**Responsive and accessible** — usable from a 360px phone to a large desktop;
below 820px windows become stacked sheets. Reduce motion, reduce transparency,
increase contrast and text scaling all work, honour OS-level preferences, and
every control is keyboard reachable with visible focus rings.

## Live web access

The simulated Safari can load the real web, which the globe button in its
toolbar switches on and off.

Wikipedia and its sister projects are fetched through their CORS-enabled API and
rendered natively — Wikipedia sends `X-Frame-Options: DENY`, so an iframe could
never work, but the API is open to browsers. Internal `/wiki/` links keep
browsing inside the simulator, search hits the real search endpoint, and article
text is attributed under CC BY-SA 4.0.

Fetched markup is never assigned to `innerHTML`. It is parsed into an inert
document, walked against a strict tag/attribute allowlist, and rebuilt — scripts,
styles, iframes, forms, event-handler attributes and `javascript:`/`data:` URLs
are all dropped.

Any other real site is attempted in a sandboxed iframe. Most large sites refuse
to be embedded, so known ones go straight to a "refused to connect" page with an
open-in-a-new-tab escape hatch.

Live loads still respect the **simulated** network, so scenarios stay honest: turn
off the simulated Wi-Fi or clear its DNS and Wikipedia fails exactly like the
built-in pages do. `.local` and `.test` hosts always stay simulated.

## Project layout

```
index.html                 minimal white-on-black project index (site root)
404.html                   matching not-found page
.github/workflows/pages.yml  publishes the site to GitHub Pages on push to main
mac/                       the simulator, served at /mac
mac/index.html             shell markup and script order
mac/assets/
  fonts/                   Inter + JetBrains Mono (OFL) with @font-face mapping
  icons/                   41 generated app, document and volume icons
  wallpapers/              6 generated desktop pictures
  brand/apple-mark.svg     Apple mark drawn from primitives
mac/styles/                tokens, controls, shell, windows, apps, settings, responsive
mac/scripts/
  01-core.js               helpers, persistence, session state
  02-glyphs.js             inline SVG glyph library and icon helpers
  03-state.js              the whole simulated Mac as default data
  04-ui.js                 dialogs, notifications, HUDs, row builders
  05-windows.js            app registry, window manager, Mission Control
  06-shell.js              appearance sync, menu bar, Dock, Control Centre, Launchpad
  07-spotlight.js          search, arithmetic and unit conversion
  08-web.js                live web access, fetching and HTML sanitising
  10-16                    Finder, Safari, Mail, Outlook, App Store, utilities, media
  20-21                    System Settings and Apple Account
  30-31                    network/diagnostics and power/recovery/setup
  40-events.js             delegated events and the command router
  99-boot.js               startup and the MacSim developer API
tools/build-assets.py      regenerates every icon and wallpaper
```

Apps are declarative: `Mac.registerApp({ id, title, icon, render(win), … })`
adds an entry that Launchpad, the Dock, Spotlight, the Applications folder and
the App Store all pick up automatically. Interactive markup is declarative too —
`data-command`, `data-arg`, `data-toggle-path`, `data-select-path` and
`data-range-path` are routed by a single handler in `scripts/40-events.js`.

## Regenerating assets

```sh
python3 tools/build-assets.py
```

Icons are superellipse ("squircle") app tiles built from gradient stops plus a
glyph, using the same lighting treatment throughout, so the set stays visually
consistent. Wallpapers are layered SVG gradients.

## Setting up scenarios

Open the browser console:

```js
MacSim.help()                    // list the API
MacSim.skipLogin()               // straight to the desktop
MacSim.scenarios.offline()       // Wi-Fi off
MacSim.scenarios.captivePortal() // join the cafe network
MacSim.scenarios.breakDNS()      // names stop resolving
MacSim.scenarios.lowBattery()
MacSim.scenarios.fullTrash()
MacSim.scenarios.signOut()       // Apple Account signed out
MacSim.setting('browser.liveWeb', false)  // simulated pages only
MacSim.reset()                   // Erase All Content and Settings
```

## Keyboard shortcuts

`⌘Space` Spotlight · `F3` Mission Control · `F4` Launchpad · `⌘Tab` switch app ·
`` ⌘` `` cycle windows · `⌘M` minimise · `⌘W` close · `⌘N` new window ·
`⌃⌘F` full screen · `⌃⌥←/→` tile left/right · `⌃←/→` switch desktop ·
`⌃⌘Q` lock · `⇧⌘Q` log out · `⌥⌘⎋` Force Quit · `⇧⌘3` screenshot ·
`⇧⌘⌫` empty the Bin · `Esc` dismiss.

## Notes

This is an independent educational simulation and is not an Apple product. It is
not affiliated with or endorsed by Apple Inc. or Microsoft. All artwork is drawn
from primitives in `tools/build-assets.py`; the bundled fonts are Inter and
JetBrains Mono, both under the SIL Open Font License 1.1 (licences are in
`assets/fonts/`). On a real Mac the interface picks up the genuine system faces
first via `local()`, falling back to the bundled fonts elsewhere.
