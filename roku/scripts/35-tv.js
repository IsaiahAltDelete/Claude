/* ===========================================================================
   The television's own inputs.

   The Roku is a box plugged into HDMI 1. Everything above this file draws the
   box; this file draws the *set* — the input list, what the other inputs show,
   and the on-screen display that goes with them. It deliberately looks nothing
   like the Roku interface, because on a real support call the whole difficulty
   is telling the two apart.

   The box keeps running while the set is elsewhere, which is exactly the fault
   being reproduced: everything works, and the customer sees "No Signal".
   =========================================================================== */

'use strict';

/** Whichever input the set is showing. */
function currentInput() {
  return TV_INPUTS.find(i => i.id === State.tv.input) || TV_INPUTS[0];
}

const onRoku = () => State.tv.input === 'hdmi1';

/* ------------------------------------------------------------- the chin */

function paintChin() {
  const input = currentInput();
  const label = $('#tv-input-label');
  if (label) label.textContent = input.name;
  const cap = $('#cap-model');
  if (cap) cap.textContent = State.model;
  const capState = $('#cap-state');
  if (capState) {
    capState.textContent = onRoku()
      ? 'Simulated device — nothing here touches a real Roku, network or account'
      : `The set is on ${input.name}. The Roku is still running on HDMI 1.`;
  }
}

/* --------------------------------------------------------- source screens */

/** What the set shows on an input that is not the Roku. */
function sourceHTML(input) {
  if (input.id === 'hdmi1') return '';

  if (input.device === 'disc') {
    return `<div class="tv-src src-disc">
        <div class="src-inner">
          <div class="src-logo">VERTEX<span>4K</span></div>
          <div class="src-menu">
            <span class="src-item on">Disc</span>
            <span class="src-item">Media</span>
            <span class="src-item">Network</span>
            <span class="src-item">Setup</span>
          </div>
          <div class="src-note">No disc inserted</div>
        </div>
        <div class="src-hint">This is a different device. The Roku remote does not control it.</div>
      </div>`;
  }

  if (input.device === 'tuner') {
    return `<div class="tv-src src-tuner">
        <div class="src-inner">
          <h2>No channels found</h2>
          <p>Nothing is tuned on the antenna input. Run a channel scan from the
            television's own menu, or plug the aerial back in.</p>
        </div>
        <div class="src-hint">This is the set's tuner, not the Roku.</div>
      </div>`;
  }

  /* Nothing plugged in: the card every support call ends up staring at. */
  return `<div class="nosignal">
      <div class="ns-card">
        <h2>No Signal</h2>
        <p>${esc(input.name)} &middot; check the cable, or press <b>Input</b> to change source</p>
      </div>
    </div>`;
}

/**
 * Draw (or clear) the television layer. Called on every input change, on wake,
 * and once at boot.
 */
function renderSource() {
  const host = $('#tv-source');
  if (!host) return;
  const input = currentInput();
  host.innerHTML = sourceHTML(input);
  paintChin();
  updateTvOwnership();
}

/**
 * The set owns the remote whenever it is not showing the Roku, or whenever its
 * own menu is open. That is what stops arrow presses reaching a box the viewer
 * cannot see.
 */
function updateTvOwnership() {
  const pickerOpen = !!$('#tv-osd .input-picker');
  if (onRoku() && !pickerOpen) {
    UI.tv = null;
    UI.refreshScope();
    const owner = UI.current();
    if (owner && owner.refocus) owner.refocus();
    else if (!Focus.el || !focusables().includes(Focus.el)) focusFirst();
    return;
  }
  UI.tv = { api: TV_API };
  UI.refreshScope();
  if (pickerOpen) focusFirst($('#layer-tv'));
}

/* ------------------------------------------------------------- the picker */

let pickerTimer = null;

function openInputPicker() {
  const osd = $('#tv-osd');
  if (!osd) return;

  osd.innerHTML = `
    <div class="input-picker">
      <div class="ip-head">Input</div>
      ${TV_INPUTS.map(input => `
        <div class="ip-row f${input.id === State.tv.input ? ' here' : ''}"
             data-fid="in-${input.id}" data-input="${input.id}"${input.id === State.tv.input ? ' data-first' : ''}>
          <span class="ip-name">${esc(input.name)}</span>
          <span class="ip-dev">${esc(input.label)}</span>
        </div>`).join('')}
      <div class="ip-foot">Press <b>OK</b> to switch</div>
    </div>`;

  updateTvOwnership();
  restartPickerTimer();
}

function restartPickerTimer() {
  clearTimeout(pickerTimer);
  /* A real set drops its input list after a few idle seconds. */
  pickerTimer = setTimeout(closeInputPicker, 7000);
}

function closeInputPicker() {
  clearTimeout(pickerTimer);
  const osd = $('#tv-osd');
  if (osd) osd.innerHTML = '';
  updateTvOwnership();
}

function toggleInputPicker() {
  if ($('#tv-osd .input-picker')) { closeInputPicker(); return; }
  if (!State.remote.tvControl && !tvButtonPress) {
    /* The remote only drives the set once it has learned its codes. */
    tvBanner('This remote is not set up to control the television',
      'Settings › Remotes & devices › Set up remote for TV control');
    return;
  }
  openInputPicker();
}

/* A flag so the buttons on the set itself always work, however the remote is
   configured — which is the fallback a support call falls back to. */
let tvButtonPress = false;
function pressTvInputButton() {
  tvButtonPress = true;
  toggleInputPicker();
  tvButtonPress = false;
}

/* -------------------------------------------------------------- switching */

function setInput(id, { quiet = false } = {}) {
  const input = TV_INPUTS.find(i => i.id === id);
  if (!input) return;
  State.tv.input = id;
  save();
  closeInputPicker();
  renderSource();
  if (!quiet) tvBanner(input.name, input.label);
}

/** The little corner label a set flashes when the source changes. */
function tvBanner(title, sub = '') {
  const osd = $('#tv-osd');
  if (!osd) return;
  const node = el('div', 'tv-banner', `<b>${esc(title)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}`);
  osd.appendChild(node);
  setTimeout(() => node.remove(), 2600);
}

/**
 * HDMI-CEC one-touch play: a button on the Roku remote wakes the set and pulls
 * it back to the box's own input. With CEC turned off it does nothing, which
 * is the whole reason the setting is worth knowing about.
 */
function cecPullToRoku(reason) {
  if (onRoku()) return false;
  if (!State.system.cec || !State.system.cecOneTouch) return false;
  setInput('hdmi1', { quiet: true });
  tvBanner('HDMI 1', `Switched by the Roku · ${reason}`);
  return true;
}

/* --------------------------------------------------- who owns the remote */

let deafPresses = 0;

const TV_API = {
  select(node) {
    if (node && node.dataset.input) setInput(node.dataset.input);
  },

  key(k) {
    const pickerOpen = !!$('#tv-osd .input-picker');

    if (pickerOpen) {
      restartPickerTimer();
      if (k === 'back') { closeInputPicker(); return true; }
      if (k === 'up' || k === 'down') { moveFocus(k); return true; }
      if (k === 'ok') { activate(); return true; }
      if (k === 'left' || k === 'right') return true;
      return true;
    }

    /* No picker, and the set is on another input: the box is still running,
       but nothing the remote sends can be seen. Home pulls it back if CEC is
       on; otherwise say so, once the viewer has pressed a few keys. */
    if (k === 'home' && cecPullToRoku('Home pressed')) { deafPresses = 0; return true; }

    deafPresses += 1;
    if (deafPresses === 2 || deafPresses % 6 === 0) {
      tvBanner(`The television is on ${currentInput().name}`, 'Press Input to switch back to HDMI 1');
    }
    return true;
  },

  back() { closeInputPicker(); return true; },
  refocus() {},
};

/* ------------------------------------------------------- wiring the set */

function wireTvButtons() {
  const input = $('#tv-key-input');
  const power = $('#tv-key-power');
  if (input) input.addEventListener('click', () => { noteActivity(); pressTvInputButton(); });
  if (power) power.addEventListener('click', () => { noteActivity(); togglePower(); });
}
