/* ===========================================================================
   The remote, the keyboard bindings, and fitting the pair to the window.

   The remote is the real interface here: every button on it maps to the same
   press() the keyboard does, and pressing a button on screen flashes it so it
   is obvious which one was used. The four shortcut buttons carry the artwork
   of the channels they launch, exactly as the printed ones do.
   =========================================================================== */

'use strict';

/* --------------------------------------------------------------- the remote */

function buildRemote(mount) {
  const shortcuts = REMOTE_SHORTCUTS.map(id => CH[id]).filter(Boolean);

  mount.innerHTML = `
    <div class="remote" id="remote">
      <div class="remote-brand">Voice Remote</div>

      <div class="remote-row">
        <button class="rk rk-round rk-power" data-key="power" title="Power" aria-label="Power">${ICON('power')}</button>
        <button class="rk rk-round rk-mic" id="rk-mic" data-key="mic" title="Voice search" aria-label="Voice search">${ICON('mic')}</button>
      </div>

      <div class="remote-row">
        <button class="rk rk-pill" data-key="back" title="Back" aria-label="Back">${ICON('back')}</button>
        <button class="rk rk-pill" data-key="home" title="Home" aria-label="Home">${ICON('home')}</button>
      </div>

      <div class="dpad">
        <button class="dpad-arm dpad-up" data-key="up" aria-label="Up">${ICON('arrowUp')}</button>
        <button class="dpad-arm dpad-left" data-key="left" aria-label="Left">${ICON('arrowLeft')}</button>
        <button class="dpad-arm dpad-right" data-key="right" aria-label="Right">${ICON('arrowRight')}</button>
        <button class="dpad-arm dpad-down" data-key="down" aria-label="Down">${ICON('arrowDown')}</button>
        <button class="dpad-ok" data-key="ok" aria-label="OK">OK</button>
      </div>

      <div class="remote-row">
        <button class="rk rk-round" data-key="replay" title="Instant replay" aria-label="Instant replay">${ICON('replay')}</button>
        <button class="rk rk-round" data-key="star" title="Options" aria-label="Options">${ICON('star')}</button>
      </div>

      <div class="remote-transport">
        <button class="rk" data-key="rew" title="Rewind" aria-label="Rewind">${ICON('rewind')}</button>
        <button class="rk" data-key="play" title="Play / pause" aria-label="Play or pause">${ICON('playpause')}</button>
        <button class="rk" data-key="fwd" title="Fast forward" aria-label="Fast forward">${ICON('forward')}</button>
      </div>

      <div class="remote-apps">
        ${shortcuts.map(ch => `<button class="rk-app" data-app="${ch.id}"
            style="background:linear-gradient(140deg,${ch.c1},${ch.c2});color:${ch.ink || '#fff'}"
            title="${esc(ch.name)}">${esc(ch.short)}</button>`).join('')}
      </div>

      <div class="remote-side">
        <button class="rk-side" data-key="vol+" data-mark="+" title="Volume up" aria-label="Volume up"></button>
        <button class="rk-side" data-key="vol-" data-mark="–" title="Volume down" aria-label="Volume down"></button>
        <button class="rk-side mute" data-key="mute" data-mark="×" title="Mute" aria-label="Mute"></button>
      </div>
    </div>

    <div class="remote-back">
      <button id="rk-pair" title="The pairing button inside the battery compartment">${ICON('remote')} Pair</button>
      <span class="batt" id="rk-batt"><i style="--pct:${State.remote.battery}"></i>${State.remote.battery}%</span>
    </div>

    <div class="hints">
      <kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> move
      <span class="sep">·</span><kbd>Enter</kbd> OK
      <span class="sep">·</span><kbd>Backspace</kbd> back<br>
      <kbd>H</kbd> home <span class="sep">·</span><kbd>*</kbd> options
      <span class="sep">·</span><kbd>R</kbd> replay <span class="sep">·</span><kbd>P</kbd> play<br>
      <kbd>,</kbd><kbd>.</kbd> rewind / forward
      <span class="sep">·</span><kbd>+</kbd><kbd>-</kbd><kbd>M</kbd> volume
      <span class="sep">·</span><kbd>V</kbd> voice
    </div>`;

  mount.addEventListener('click', event => {
    const button = event.target.closest('[data-key],[data-app]');
    if (!button) return;
    if (button.dataset.app) {
      /* A shortcut button launches its channel from anywhere, adding it first
         if it is not on the home screen — which is what the printed buttons do. */
      const id = button.dataset.app;
      if (!State.installed.includes(id)) { State.installed.push(id); save(); }
      noteActivity();
      goHome();
      launchChannel(id);
      return;
    }
    press(button.dataset.key);
  });

  const pair = mount.querySelector('#rk-pair');
  if (pair) pair.addEventListener('click', () => { noteActivity(); pressPairingButton(); });
}

/** Flash the button that was just pressed, wherever the press came from. */
function flashRemote(key) {
  const node = $(`#remote [data-key="${CSS.escape(key)}"]`);
  if (!node) return;
  node.classList.add('press');
  setTimeout(() => node.classList.remove('press'), 130);
}

function setMicLive(on) {
  const mic = $('#rk-mic');
  if (mic) mic.classList.toggle('live', !!on);
}

/** Keep the battery readout in step with State (pairing resets it to full). */
function refreshRemoteBadge() {
  const batt = $('#rk-batt');
  if (!batt) return;
  const pct = State.remote.battery;
  batt.className = `batt${pct <= 25 ? ' low' : ''}`;
  batt.innerHTML = `<i style="--pct:${pct}"></i>${State.remote.paired ? `${pct}%` : 'unpaired'}`;
}

/* ------------------------------------------------------------- the keyboard */

const KEY_MAP = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  Enter: 'ok', ' ': 'ok',
  Backspace: 'back', Escape: 'back',
  Home: 'home', h: 'home', H: 'home',
  '*': 'star', '8': 'star',
  r: 'replay', R: 'replay',
  p: 'play', P: 'play', k: 'play', K: 'play',
  ',': 'rew', '<': 'rew', '.': 'fwd', '>': 'fwd',
  '+': 'vol+', '=': 'vol+', '-': 'vol-', '_': 'vol-',
  m: 'mute', M: 'mute',
  v: 'mic', V: 'mic',
};

function wireKeyboard() {
  window.addEventListener('keydown', event => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const key = KEY_MAP[event.key];
    if (!key) return;
    event.preventDefault();
    press(key);
  });
}

/* ---------------------------------------------------------------- fitting */

/**
 * Scale the remote to the window, then give the television whatever is left.
 * The canvas is always 1280x720 internally; only the transform changes, so
 * nothing inside ever reflows.
 */
function fitStage() {
  const stage = $('#stage');
  const tvCol = $('#tv-col');
  const scaler = $('#remote-scaler');
  const col = $('#remote-col');
  const well = $('#tv-well');
  const canvas = $('#canvas');
  if (!stage || !scaler || !well || !canvas) return;

  const stacked = window.matchMedia('(max-width: 980px), (max-height: 520px)').matches;

  /* --- the remote ---------------------------------------------------- */
  scaler.style.transform = 'none';
  col.style.width = '';
  col.style.height = '';
  const rw = scaler.offsetWidth || 226;
  const rh = scaler.offsetHeight || 660;

  /* The remote grows with the window up to a point, so a 4K browser does not
     end up with a postage-stamp remote beside a wall-sized television. */
  let rs;
  if (stacked) {
    rs = clamp((stage.clientWidth - 32) / rw, 0.7, 1.1);
  } else {
    rs = clamp((stage.clientHeight - 24) / rh, 0.5, 1.35);
  }
  scaler.style.transform = `scale(${rs})`;
  col.style.width = `${Math.ceil(rw * rs)}px`;
  col.style.height = `${Math.ceil(rh * rs)}px`;

  /* --- the television ------------------------------------------------- */
  const chromeH = 24;            /* .tv-frame side padding */
  const chromeV = 46;            /* .tv-frame top padding + chin */
  const extras = ($('#tv-stand') ? $('#tv-stand').offsetHeight : 0)
    + ($('#tv-caption') ? $('#tv-caption').offsetHeight : 0) + 26;

  let availW;
  let availH;
  if (stacked) {
    availW = stage.clientWidth - 28 - chromeH;
    availH = Math.max(220, window.innerHeight * 0.6 - chromeV - extras);
  } else {
    availW = tvCol.clientWidth - chromeH;
    availH = tvCol.clientHeight - chromeV - extras;
  }

  const k = Math.max(0.18, Math.min(availW / 1280, availH / 720));
  canvas.style.transform = `scale(${k})`;
  well.style.width = `${Math.round(1280 * k)}px`;
  well.style.height = `${Math.round(720 * k)}px`;
}
