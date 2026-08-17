# Roku Troubleshooting Simulator

A browser-based simulation of a Roku streaming player on a television, built
for support training. The home screen and its menu, forty-odd channels, the
live TV guide, search, the streaming store, playback with trick play, the full
settings tree, restarts, software updates, network setup, factory reset and
guided setup — driven by a mock-up remote beside the screen, so an agent can
walk a caller through a real flow, or rehearse one, without a box in hand.

Nothing here reads or changes a real Roku, network or account. All state lives
in this page's `localStorage`, there is no build step and no server, and every
asset is local — the simulator runs straight from `file://` with the network
unplugged.

**Live:** <https://isaiahaltdelete.github.io/Claude/roku/>. The site root is an
index of the simulators in this repository; this one lives at `/roku`.

## Running it

Open the live link above, or clone the repository and open `roku/index.html` in
any current browser.

There is nothing to sign in to. The device ships linked to an invented account,
joined to an invented home network, with nineteen channels on the home screen.

## Driving it

The remote on the right is the interface. Every button works, and every button
has a key:

| | |
|---|---|
| Move the highlight | arrow keys, or the D-pad |
| Select | <kbd>Enter</kbd>, or **OK** |
| Back | <kbd>Backspace</kbd> or <kbd>Esc</kbd> |
| Home | <kbd>H</kbd> |
| Options (`✱`) | <kbd>*</kbd> |
| Instant replay | <kbd>R</kbd> |
| Play / pause | <kbd>P</kbd> |
| Rewind / fast forward | <kbd>,</kbd> and <kbd>.</kbd> |
| Volume, mute | <kbd>+</kbd>, <kbd>-</kbd>, <kbd>M</kbd> |
| Voice search | <kbd>V</kbd>, or the microphone |
| TV input | <kbd>I</kbd>, or the input button |
| Power / standby | the power button |

Clicking on the screen also works — it moves the highlight there and presses
OK, which is what the remote would have done in two steps.

The four shortcut buttons at the bottom of the remote launch their channel from
anywhere, and the small **Pair** control underneath it is the pairing button
inside the battery compartment. It only does anything while the box is actually
listening for a remote.

## The television

The Roku is a box plugged into **HDMI 1**. The set it is plugged into is
simulated too, and that is deliberate: "check which input the TV is on" is the
first question on a huge share of real calls, and it is impossible to practise
if the television is only a picture frame.

Press **Input** on the remote (or <kbd>I</kbd>) and the set draws its own input
list — square corners, flat grey, nothing like the Roku interface, because
telling the two apart is the entire skill. HDMI 2 has a disc player on it,
HDMI 3 and AV have nothing, and the antenna input has never been tuned.

Switch away from HDMI 1 and the box keeps running behind the set, which is
exactly the fault: everything works, and the customer sees *No Signal*. The
Roku remote goes deaf, because nothing it sends can be seen. Three ways back:

- **Input** on the remote, and choose HDMI 1
- **Home**, if HDMI-CEC one-touch play is on under
  *Settings › System › Control other devices (CEC)* — turn it off and Home
  stops working, which is worth showing someone once
- the **Input** button on the set itself, which always works, even when the
  remote has never learned the television's codes

That last one matters: the remote only drives the set once it has been through
*Settings › Remotes & devices › Set up remote for TV control*. Take that away
(`roku.noTvControl()`) and the remote's Input button says so instead of doing
nothing, which is the honest failure.

## What it covers

**Home screen** — the left menu (Home, What to Watch, Live TV, Sports, Featured
Free, Movie Store, TV Store, Search, Streaming Channels, Settings) which expands
when the highlight is in it and collapses to icons when it is not; a grid of
channel tiles that scrolls; the clock; and the `✱` options panel over a tile
with **Remove channel**, **Move channel** (the tile really does follow the
arrows), **Rate channel**, **Check for updates** and **About this channel**.

**Content** — What to Watch, Sports, Featured Free, the Movie Store and the TV
Store are rails of key art under a detail band that tracks the highlight.
Selecting a title opens its page: synopsis, rating, price, and a **Watch on**
list of the services carrying it.

**Live TV** — a channel guide with a preview pane, sixteen channels and two
hours of schedule. The schedule is generated from the channel number and the
half-hour slot, so it is the same every time it is opened.

**Search** — the grid keyboard on the left, results in the middle, details on
the right. Titles, channels, live channels and genres are all searched at once,
results appear as you type, and recent searches are kept until they are cleared
in Settings. The microphone works from anywhere and lands here.

**Streaming Channels** — nine categories, a channel page with rating, developer,
version and size, and an **Add channel** flow that genuinely installs to the end
of the home screen with a **New** flag on it until it is opened once.

**Channels and playback** — opening a channel shows its splash, then its own
branded screens. Playback has a real trick-play bar, three rewind and
fast-forward speeds, instant replay, a `✱` options panel for captions, audio
track and video quality, and the **advanced video statistics** overlay — bitrate,
resolution, dropped frames, buffer and Wi-Fi signal — which is what to ask for
when a picture looks soft or keeps stopping. Part-watched titles come back in
**Continue Watching**.

**Settings** — the whole tree, and it all works:

- **Network** — About (signal, band, link speed, IP, gateway, DNS, MAC),
  **Check connection** (the three-step test, which fails at the honest step),
  **Set up connection** (wireless or wired, a scan, a password keyboard), and
  Bandwidth saver
- **Remotes & devices** — battery and firmware, rename, unpair, **Pair new
  device** with a thirty-second window, Bluetooth, TV control setup
- **Theme** — five themes, three screensavers, wait time and a preview
- **Audio** — audio mode, HDMI, volume mode, automatic levelling
- **Display type** — with the HDMI and HDR facts behind it
- **Parental controls**, **Accessibility**, **Home screen** (hide menu sections),
  **Guest Mode**, **Privacy**, **Search**, **Legal notice**
- **System** — About (serial, software version, uptime), Time, Screen mirroring,
  **Power** (Fast TV start, standby LED, auto power savings, **System restart**,
  **Power off**), HDMI-CEC, **System update**, External control, and
  **Advanced system settings** with **Network connection reset** and
  **Factory reset**
- **Help** — six short answers to the faults that come up most

**Secret screens** — Roku's own button chords are here because they are real,
and because they are the fastest way out of a wedged box:

| Chord | What it does |
|---|---|
| Home ×5, Up, Rewind ×2, Fast forward ×2 | reboots the device |
| Home ×5, Fast forward ×3, Rewind ×2 | the platform secret screen |
| Home ×5, Right, Left, Right, Left, Right | jumps straight to the network menu |

The secret screen is plain, monospaced and deliberately ugly, and everything on
it — serial, uptime, CPU temperature, free memory, signal, remote battery — is
read off the simulated device rather than invented on the spot.

**System flows** — a restart really tears the interface down, shows the purple
splash and builds it again. A software update downloads, installs and restarts.
A factory reset makes you type the code shown on screen, erases the store and
runs a seven-step **guided setup** on the way back up: language, country,
network, software, display type, account linking and finish. Power off puts the
device in standby with a red LED, and the screensaver drifts a clock around
after five minutes — but never over something that is playing.

## Staging a situation

Everything below is reachable through the menus as well; these exist so a
situation can be set up in one line while someone is practising. Open the
browser console:

```js
roku.setNetwork('nointernet')  // connected to Wi-Fi, no route out
roku.setNetwork('weak')        // one bar — buffers, and Check connection says why
roku.setNetwork('offline')     // not joined to anything
roku.setNetwork('wired')       // Ethernet
roku.setNetwork('ok')          // back to normal

roku.setInput('hdmi2')         // the set is on the wrong input
roku.noTvControl()             // the remote never learned the TV's codes
roku.noCec()                   // one-touch play off, so Home cannot pull it back

roku.setBattery(9)             // the usual "the remote stopped working"
roku.unpair()                  // no paired remote at all
roku.oldSoftware()             // put the update back on the shelf
roku.restart()                 // straight to the splash
roku.secret()                  // the platform secret screen
roku.saver()                   // screensaver now
roku.setup()                   // run guided setup again
roku.reset()                   // wipe localStorage and reload
```

`roku.state()` returns the whole device if you want to look at it.

With no internet, a channel draws its own branded error inside its own splash
rather than throwing a system dialog — which is exactly the state that confuses
people on a real call, because everything else on the box still works.

## Checks

The repository's three gates cover this simulator; they run on every push and
block the deploy. From the repository root:

```
python3 tools/check-syntax.py   parse, including the merged global scope
python3 tools/check-refs.py     every glyph and reference resolves
node tools/smoke.mjs            every screen opens in Chromium, no console errors
```

The scripts here are classic scripts sharing one global lexical environment, so
a duplicate top-level `const` between any two of them is a SyntaxError that only
appears once the browser merges them — check-syntax reproduces that merge.

The smoke test walks the entire settings tree, calling every `value()` and
`detail()` closure in it, renders each screen that has rows, opens every channel
page, switches the television through all five inputs, asserts one-touch play
works with HDMI-CEC on and stays quiet with it off, and leaves the player by
each exit to prove the clock stops and the resume point survives.

## Project layout

Paths are relative to the repository root; everything below `roku/` belongs to
this simulator.

```
roku/index.html                the page: the TV frame, the four layers, the remote mount
roku/assets/fonts/             bundled Inter, five weights, and its licence
roku/assets/icon.svg           favicon

roku/styles/01-tokens.css      variables, reset, focus primitives, the 1280x720 canvas
roku/styles/02-stage.css       the television, the remote, and how they are scaled
roku/styles/03-home.css        menu, grid, channel artwork, the options panel
roku/styles/04-content.css     rails, key art, the guide, search, the store, the player
roku/styles/05-settings.css    the two-column settings tree
roku/styles/06-system.css      boot, dialogs, toasts, screensaver, guided setup
roku/styles/07-responsive.css  fitting the pair into the window

roku/scripts/01-core.js        helpers, the saved device, storage
roku/scripts/02-icons.js       every glyph, drawn not fetched
roku/scripts/03-art.js         channel logos, key art, the frames behind playback
roku/scripts/04-data.js        channels, titles, live channels, settings options
roku/scripts/05-focus.js       spatial navigation — the engine the remote drives
roku/scripts/06-shell.js       screen stack, overlays, dialogs, toasts, key dispatch
roku/scripts/09-menu.js        the left menu, shared by every screen that has one
roku/scripts/10-home.js        home screen, the * options panel, move and remove
roku/scripts/11-rails.js       the five rail pages and the title page
roku/scripts/12-live.js        the live guide and its generated schedule
roku/scripts/13-search.js      search and voice search
roku/scripts/14-store.js       the streaming store, channel pages, adding a channel
roku/scripts/15-app.js         launching a channel, and the player
roku/scripts/20-settings.js    the settings tree and the screen that walks it
roku/scripts/21-network.js     check connection, set up connection, network reset
roku/scripts/22-devices.js     pairing, TV control, the PIN, Guest Mode
roku/scripts/30-system.js      power, boot, restart, updates, factory reset, setup
roku/scripts/35-tv.js          the television's own inputs, and its on-screen display
roku/scripts/40-remote.js      the remote, the keyboard map, fitting the stage
roku/scripts/99-boot.js        wiring, first boot, and the console helpers
```

## How it is built

Vanilla HTML, CSS and JavaScript. No dependencies, no build step, no server.

The television draws itself on a fixed **1280x720 canvas** — the same HD design
grid Roku's own interface is laid out on — and the whole canvas is scaled with a
single transform to fit the window. Every size in the stylesheets is therefore a
real pixel on a 720p screen, and nothing inside the picture ever reflows.

Navigation is **spatial**, not a tab order: anything the remote can land on is
marked `.f`, and a direction press measures every candidate and picks whichever
one lies that way and costs least to reach. Screens never handle arrow keys
themselves. Whatever is topmost — a screen, an overlay, or the system layer —
gets first refusal on every button, and anything it does not claim falls through
to the default: arrows move, OK selects, Back pops.

All artwork is **composed, not fetched**. A channel logo is a brand gradient, a
CSS texture, a geometric mark and set type, sized from its own box with
container queries so the same logo is correct on a grid tile, a store listing, a
search result and a remote shortcut button. Key art and the frames behind
playback are built the same way, from a seeded generator so nothing flickers
between renders.

Responsive from a 360px phone to a large desktop — below about 980px the remote
drops underneath the set — and it honours reduce-motion and reduce-transparency.

## The jokes

The support flows are all straight. The content around them is not.

Every title in the catalogue is a **show within a show** — the sort of thing
that only ever exists inside somebody else's sitcom, playing on a television in
the background of a scene. The developer names on the channel pages are the
fictional companies that made them, the neighbours' Wi-Fi networks are the
names people really do give their routers, and there are a few more buried in
the search suggestions, the live guide and the voice results.

None of it changes how anything behaves — a channel page still shows a real
version number and a real size next to a developer who does not exist. Places
worth looking: any channel page (the **Developer** line), *Settings › Network ›
Set up connection* (the network list), the **Live TV** guide, the microphone,
and one channel whose developer explains a name that started as an accident.

## Notes

This is an independent educational simulation and is not a Roku product. It is
not affiliated with, endorsed by or connected to Roku, Inc.

Every streaming service, live channel, person, network name and serial number in
it is invented. The programme titles and company names are affectionate nods to
fictional works and fictional companies from other people's comedy — they are
jokes, not products, and nothing here is offered as, or connected to, anything
real. The bundled font is Inter, under the SIL Open Font License 1.1; the
licence sits alongside it in `assets/fonts/`.
