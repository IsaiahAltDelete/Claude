/* ===========================================================================
   Core: DOM helpers, the saved state, and the small utilities everything else
   is built out of.

   Nothing in this simulator touches a real device, a real network or a real
   account. The whole box lives in one localStorage key, and Settings > System >
   Advanced system settings > Factory reset deletes it.
   =========================================================================== */

'use strict';

/* --------------------------------------------------------------- DOM helpers */

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Build an element. `cls` may carry several classes; `html` is trusted, and
 *  every caller in this project passes markup it generated itself. */
function el(tag, cls, html) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (html != null) node.innerHTML = html;
  return node;
}

/** Escape anything that came from a text field before it goes into markup. */
function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const pad2 = n => String(n).padStart(2, '0');

/** Deterministic PRNG. Artwork and generated data must never flicker between
 *  renders, so everything random is seeded from a stable string. */
function rng(seed) {
  let v = (typeof seed === 'string'
    ? [...seed].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 17)
    : seed) || 1;
  if (v < 0) v = -v;
  return () => {
    v = (v * 1103515245 + 12345) & 0x7fffffff;
    return v / 0x7fffffff;
  };
}

const pick = (list, random) => list[Math.floor(random() * list.length) % list.length];

/* ------------------------------------------------------------------- clocks */

function fmtClock(date = new Date(), twelve = true) {
  let h = date.getHours();
  const m = pad2(date.getMinutes());
  if (!twelve) return `${pad2(h)}:${m}`;
  const suffix = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${suffix}`;
}

function fmtDate(date = new Date()) {
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

/** Seconds to h:mm:ss / m:ss, the way a trick-play bar shows them. */
function fmtDur(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}:${pad2(m)}:${pad2(sec)}` : `${m}:${pad2(sec)}`;
}

/** "3 hours, 12 minutes" — the shape System > About uses for uptime. */
function fmtUptime(ms) {
  const mins = Math.floor(ms / 60000);
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  const parts = [];
  if (d) parts.push(`${d} day${d === 1 ? '' : 's'}`);
  if (h) parts.push(`${h} hour${h === 1 ? '' : 's'}`);
  parts.push(`${m} minute${m === 1 ? '' : 's'}`);
  return parts.join(', ');
}

const sleep = ms => new Promise(res => setTimeout(res, ms));

/* -------------------------------------------------------------------- state */

const STORE_KEY = 'roku-sim-v1';

/* The box as it ships in this simulator. Everyone and everything named here is
   invented: the household, the network, the streaming services and the serial
   number on the back of the player. */
function freshState() {
  return {
    version: 1,

    power: 'on',
    setupComplete: true,
    bootedAt: Date.now() - 3 * 3600 * 1000 - 12 * 60000,

    deviceName: 'Living Room',
    model: 'Roku Ultra',
    modelNumber: '4850X',
    serial: 'YH00CD481239',
    deviceId: 'S3G91Y482614',

    software: { version: '14.5.4', build: '4222-C2', channel: 'Stable', lastChecked: null, pending: null },

    theme: 'roku',
    screensaver: 'clock',
    screensaverWait: 5,          /* minutes; 0 disables */

    volume: 24,
    muted: false,

    display: { type: 'auto', resolved: '4K HDR 60Hz', hdr: true, hdmiMode: 'auto', refresh: '60Hz' },
    audio: { mode: 'auto', hdmi: 'auto', spdif: 'auto', volumeMode: 'off', autoLevel: false },

    accessibility: { captions: 'off', captionStyle: 'default', audioGuide: false, speechRate: 'normal', textMag: false },

    network: {
      mode: 'wireless',
      ssid: 'Sunfish Cottage 5G',
      security: 'WPA2-PSK (AES)',
      band: '5 GHz',
      channelNo: 44,
      signal: 4,                 /* 0-4 bars */
      linkSpeed: '433 Mbps',
      ip: '192.168.1.41',
      gateway: '192.168.1.1',
      subnet: '255.255.255.0',
      dns: '192.168.1.1',
      macWireless: 'B0:A7:37:4E:12:9C',
      macWired: 'B0:A7:37:4E:12:9D',
      connected: true,
      internet: true,
      lastCheck: null,
    },
    knownNetworks: ['Sunfish Cottage 5G', 'Sunfish Cottage'],
    bandwidthSaver: true,

    remote: {
      paired: true,
      kind: 'Roku Voice Remote',
      battery: 82,
      firmware: '2.1.15',
      protocol: 'Wi-Fi Direct',
      lastPaired: 'Set up with this device',
      tvControl: true,           /* has learned the television's power/input codes */
    },

    /* The set the box is plugged into. The Roku is on HDMI 1; everything else
       is the television's own business. */
    tv: { input: 'hdmi1' },

    system: {
      fastStart: true,
      standbyLed: true,
      autoPowerNoSignal: true,
      autoPowerIdle: '4 hours',
      cec: true,
      cecOneTouch: true,
      cecStandby: true,
      timeZone: 'US Eastern',
      clock12: true,
      screenMirroring: 'prompt',
      externalControl: 'enabled',
      mobileControl: true,
    },

    parental: { pin: '', pinScope: 'off' },
    guestMode: false,
    privacy: { personalisedAds: false, microphone: true, smartTv: false, voiceHistory: true },

    account: { linked: true, email: 'alex.rivera@example.com', name: 'Alex Rivera', since: 'March 2021' },

    installed: [],               /* filled by the catalogue on first boot */
    ratings: {},
    continueWatching: [],
    searchHistory: [],
    lastMenu: 'home',
    seenNew: [],
    hiddenMenu: [],
  };
}

/** Merge saved values over the defaults so a state saved by an older build
 *  still opens, and any key added since simply takes its default. */
function mergeDefaults(target, defaults) {
  Object.keys(defaults).forEach(key => {
    const dv = defaults[key];
    if (dv && typeof dv === 'object' && !Array.isArray(dv)) {
      if (!target[key] || typeof target[key] !== 'object') target[key] = {};
      mergeDefaults(target[key], dv);
    } else if (!(key in target)) {
      target[key] = dv;
    }
  });
  return target;
}

let State = freshState();

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    State = raw ? mergeDefaults(JSON.parse(raw), freshState()) : freshState();
  } catch (err) {
    /* A corrupt or unreadable store is not worth a broken television. */
    State = freshState();
  }
  return State;
}

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(State)); } catch (err) { /* private mode */ }
  }, 90);
}

/** Used by Factory reset: wipe the store and start over from the splash. */
function wipeState() {
  try { localStorage.removeItem(STORE_KEY); } catch (err) { /* ignore */ }
  State = freshState();
}
