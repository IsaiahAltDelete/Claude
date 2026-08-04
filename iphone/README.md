# iPhone Simulator

A browser-based simulation of an iPhone running iOS 26, built for support
training. Lock screen, Face ID, Control Centre, Dynamic Island, the app
switcher, Spotlight, the App Library and 51 apps — so an agent can walk a caller
through a real flow, or rehearse one, without a device in hand.

Nothing here reads or changes your actual phone, network, accounts, camera,
microphone or files. All state lives in this page's `localStorage`, there is no
build step and no server, and every asset is local — the simulator runs straight
from `file://`. The one thing that reaches the network is Maps, which embeds a
real OpenStreetMap view.

**Live:** <https://isaiahaltdelete.github.io/Claude/iphone/>. The site root is an
index of the simulators in this repository; this one lives at `/iphone`.

## Running it

Open the live link above, or clone the repository and open `iphone/index.html` in
any current browser.

There are no fixed credentials to memorise — the phone is deliberately easy to
get into and hard to get stuck in:

| | |
|---|---|
| Unlocking | swipe up from the bar at the bottom, or tap it. Face ID succeeds silently |
| Apple Account | any name, any valid-looking email, any non-empty password. The account starts signed in as `alex.rivera@icloud.example` |
| Wi-Fi | any password of 8 or more characters joins a secured network; anything shorter fails with the real "Unable to Join" alert |
| Verification codes | arrive as a genuine Messages notification — read the six digits out of it and type them in |

## Driving it

The phone is driven the way a phone is: **drag to scroll**, don't use the wheel.
A fingertip cursor follows the pointer, a tap under the drag threshold clicks
normally, and flicks carry momentum.

| | |
|---|---|
| Home | tap the bar at the bottom, or swipe up from it |
| App switcher | double-tap the home bar |
| Control Centre | swipe down from the top-right corner |
| Spotlight | tap **Search** above the dock, or swipe down on the home screen |
| App Library | swipe past the last home page, or tap the grid dot |
| Lock | the side button on the right edge of the device |
| Volume / silent | the buttons on the left edge |
| Dismiss anything | `Esc` |

## What it covers

**Shell** — lock screen with notifications, widgets and a working clock; Face ID
unlock; Dynamic Island that expands for events and shrinks to a call pill;
Control Centre with live toggles; app switcher with card dismissal; home-screen
paging with dots, jiggle mode, app deletion and badges; App Library with
category folders you can open or launch straight from.

**Spotlight** — reached from the Search pill above the dock or by swiping down
on the home screen. Idle it offers Siri Suggestions (most recently used apps
first), your recent searches and four shortcuts. Typing searches apps, settings,
contacts, notes, reminders, calendar events, mail, messages, tickers and cities,
leads with a Top Hit, groups the rest by source, and always offers the web last.
Punctuation is ignored, so "wifi" finds Wi-Fi and "findmy" finds Find My.

**Phone and Messages** — favourites, recents, contacts, keypad and voicemail;
outgoing and incoming calls with a real ringtone synthesised in the browser, mute
/ speaker / hold, an in-call keypad, and a call that keeps running in the island
when you go home. Messages threads with unread counts, and one-time passcode
messages that carry a genuine six-digit code the verification sheets accept.

**Photos and Camera** — a 48-item generated library across four tabs (Library,
For You, Albums, Search) with Years/Months/Days/All, favourites, Recently Deleted
with recover, and per-photo info. Camera has six modes, zoom, flash, timer, grid,
front/rear flip, filters, tap-to-focus, a self-timer countdown and video
recording with a running REC timer — and every shot genuinely lands in Photos.

**Day-to-day** — Calendar (month grid, day timeline, four colour-coded
calendars, event detail, add, search), Reminders (smart lists, per-list
completion, flags), Contacts (search, favourites, A–Z sections, actions that
open Phone/Messages/Mail), Files (locations, folders, storage bar, previews),
Voice Memos (a live waveform recorder that saves real memos with playback).

**Utilities** — Weather with 32 cities, a deterministic 10-day forecast, an
hourly scroller, °F/°C and a sky that tracks local time; Calculator with a
scientific keypad, memory keys and a calculation tape; Notes with folders,
search, pinning, checklists and Recently Deleted; Compass that uses real device
orientation where the browser offers it; Translate with downloadable on-device
language packs; Stocks with generated price series, ranges and key statistics.

**Health, Home and media** — Health (14 metrics, activity rings, medications,
Medical ID, ranges by day/week/month/year), Fitness (rings, workouts you can
start and end, awards, editable goals), Home (13 accessories across five rooms,
scenes, dimming, a thermostat, camera tiles), Find My (people, devices, items,
Mark As Lost), FaceTime (a full call UI with controls), Books (a reader with real
paging and a reading goal), Podcasts (shows, episodes, playback position),
Freeform (a sticky-note canvas you can drag), Music (albums, playlists, a queue,
shuffle and repeat, a scrubber and a mini player that follows you around).

**Settings** — the full tree: Apple Account with iCloud, Family Sharing, Sign-In
& Security, Media & Purchases and Payment; Wi-Fi with known networks, passwords,
DNS and per-network detail; Cellular, Bluetooth, VPN, Notifications,
Sounds, Focus, Screen Time, General with About/Software Update/Storage/Transfer
or Reset, Display, Wallpaper, Face ID, Privacy, per-app settings and Apps.

**Troubleshooting** — the network failure modes are all reachable and all
recoverable: Wi-Fi off, a password rejected for being too short, a network out of
range, no cellular service, airplane mode, a connected network with no internet,
and a **captive portal** — full bars, Settings showing "Connected", and nothing
loading until the airport sign-in page is completed. Safari, Mail and the App
Store all read the same state, so they fail together and recover together.
Reset Network Settings, Reset All Settings and Erase All Content and Settings all
work, and the erase runs a twelve-step **Setup Assistant** on the next boot
rather than dropping you back onto a configured phone.

The captive portal is worth calling out because it is the one failure mode where
every indicator says the phone is fine. Stage it from the control panel
(**Network → Portal**) or with `setNetwork('captive')`.

## Project layout

Paths are relative to the repository root; everything below `iphone/` belongs to
this simulator.

```
iphone/index.html          the device shell, core framework and original apps
iphone/README.md           this file
iphone/assets/
  fonts/                   Inter 200–700 (OFL) with @font-face mapping
  icon.svg                 favicon
iphone/styles/extra.css    the styles the extension apps add
iphone/scripts/
  60-shared.js             seeded PRNG, generated artwork, charts, layout helpers
  61-photos-camera.js      Photos and Camera
  62-daily.js              Calendar, Reminders, Contacts, Files, Voice Memos
  63-utility.js            Weather, Calculator, Notes, Compass, Translate, Stocks
  64-health-home.js        Health, Fitness, Home, Find My, FaceTime, Books,
                           Podcasts, Freeform
  65-music.js              Music
  66-setup-network.js      captive portal and the Setup Assistant
  68-system.js             Spotlight and the App Library
  69-register.js           puts the new apps on the home screen
```

`index.html` is one file on purpose: it carries the device chrome, the
`Nav`/`defineApp` framework, and the apps the first version shipped with. The
`scripts/` files are classic (non-module) scripts, so they share one global
scope with it — that is what lets them call `defineApp`, `Nav`, `group`, `sheet`
and the `SF` glyph library directly.

Adding an app is one call:

```js
defineApp({
  id: 'example',
  name: 'Example',
  bg: 'linear-gradient(180deg,#5ac8fa,#0a63e8)',
  glyph: '…',                 // inline SVG
  mount(win, inst) {
    const nav = new Nav(win);
    inst.nav = nav;
    nav.setRoot({ title: 'Example', largeTitle: true, build(body) { /* … */ } });
  },
});
```

`defineApp` keys by id, which is how `61`–`65` replace the thin first-pass
Photos, Camera, Weather, Notes, Calculator and Music without editing the
original code. `69-register.js` then decides what appears on the home screen, so
a new app is invisible until its id is added there.

`66-setup-network.js` reaches further in: it needs to change how existing
behaviour works, not add alongside it. Rather than editing `index.html`, it keeps
a reference to the original and replaces the binding — `isOnline`, `netReason`,
`setNetwork`, `wifiView`, `safariError`, `factoryReset` and `renderPanel` are all
wrapped this way, so every path that did not involve a portal behaves exactly as
it did before. `68-system.js` does the same to `renderHome` and `goHome`.

## Generated data

Nothing is fetched and nothing is bundled as a binary. Photo thumbnails, album
art, book covers and map tiles are inline SVG data URIs; forecasts, price series,
health metrics and workout histories come from a small seeded PRNG keyed on the
symbol and the calendar date. The same day always reads the same way, so a
screenshot taken during a training session still matches what the trainee sees —
but the data does move on as the days pass.

## Setting up scenarios

Open the browser console:

```js
setNetwork('offline')            // connected, but nothing routes
setNetwork('noservice')          // cellular down, Wi-Fi only
setNetwork('captive')            // joined, but the portal is not signed in
setNetwork('online')             // back to normal
captivePortalSheet()             // reopen the sign-in page
runSetupAssistant()              // replay the out-of-box flow
State.settings.airplane = true; save(); renderStatus()
WF().current = null; save(); renderStatus()   // drop off Wi-Fi
incomingCall('Karma S')          // ring the phone, with audio
sendOTP('spectrum')              // deliver a six-digit code by Messages
pushNotification('mail', 'Spectrum', 'Your bill is ready')
setBadge('mail', 12)
lockPhone()
factoryReset()                   // wipe localStorage and reload
```

The extension apps expose their state the same way — `WX()`, `HL()`,
`fitnessGoals()`, `HM()`, `MU()`, `NT()`, `ST()`, `TR()`, `PHOTOLIB()` — so a
scenario can be staged by editing state and calling `save()`.

## The people in it

Everyone and everywhere in the simulator is invented. The phone belongs to Alex
Rivera; Nina Okafor, Milo Rivera and the rest of the contacts, senders, callers
and account holders are made up, all the addresses use reserved `.example`
domains, and every phone number is in the 555 range. Nothing is modelled on a
real person.

## Notes

This is an independent educational simulation and is not an Apple product. It is
not affiliated with or endorsed by Apple Inc. All artwork is drawn from
primitives in the page itself; the bundled font is Inter under the SIL Open Font
License 1.1 (the licence is in `assets/fonts/`). On a Mac with the real Apple
faces installed the interface picks those up first via `local()`, falling back to
the bundled Inter files everywhere else.
