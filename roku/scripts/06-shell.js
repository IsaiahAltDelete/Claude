/* ===========================================================================
   The shell.

   Screens are pushed onto a stack, overlays sit on top of the screen, and the
   system layer sits on top of everything (boot, screensaver, standby, guided
   setup). Whichever of those is topmost owns the remote: it gets first refusal
   on every button, and anything it does not claim falls through to the default
   behaviour — arrows move the highlight, OK selects, Back pops.
   =========================================================================== */

'use strict';

const SCREENS = {};

/** Register a screen. `factory.render(host, arg)` returns the screen's API. */
function defineScreen(id, factory) { SCREENS[id] = factory; }

const UI = {
  stack: [],
  overlays: [],
  system: null,        /* { node, api } */
  tv: null,            /* set while the television, not the box, owns the remote */
  rendered: null,      /* the api whose DOM is currently mounted */
  canvas: null,
  layers: {},

  /** Whoever owns the remote right now. */
  current() {
    /* The television outranks everything: if the set is on another input, the
       box may as well not be there. */
    if (UI.tv) return UI.tv.api;
    if (UI.system) return UI.system.api;
    if (UI.overlays.length) return UI.overlays[UI.overlays.length - 1].api;
    const top = UI.stack[UI.stack.length - 1];
    return top ? top.api : null;
  },

  /** The element navigation is confined to. */
  refreshScope() {
    if (UI.tv) Focus.scope = UI.layers.tv;
    else if (UI.system) Focus.scope = UI.layers.system;
    else if (UI.overlays.length) Focus.scope = UI.overlays[UI.overlays.length - 1].node;
    else Focus.scope = UI.layers.screen;
  },
};

/* -------------------------------------------------------------- navigation */

function renderTop({ restore = true } = {}) {
  const entry = UI.stack[UI.stack.length - 1];
  if (!entry) return;

  /* Tear the outgoing screen down before its DOM goes. A screen that owns a
     timer has no other chance to stop it: Back runs through the screen's own
     handler, but Home replaces the stack from underneath it. */
  if (UI.rendered && UI.rendered.dispose) UI.rendered.dispose();
  UI.rendered = null;

  UI.layers.screen.innerHTML = '';
  const host = el('div', 'layer-inner anim-fade');
  host.style.cssText = 'position:absolute;inset:0';
  UI.layers.screen.appendChild(host);

  entry.api = SCREENS[entry.id].render(host, entry.arg) || {};
  entry.node = host;
  UI.rendered = entry.api;
  UI.refreshScope();

  const wanted = restore && entry.focusId
    ? host.querySelector(`[data-fid="${CSS.escape(entry.focusId)}"]`)
    : null;
  if (wanted) setFocus(wanted);
  else focusFirst(host);
}

/** Remember where the highlight was so Back returns to it. */
function stashFocus() {
  const entry = UI.stack[UI.stack.length - 1];
  if (entry && Focus.el && Focus.el.dataset.fid) entry.focusId = Focus.el.dataset.fid;
}

function go(id, arg, { replace = false } = {}) {
  if (!SCREENS[id]) return;
  closeAllOverlays();
  stashFocus();
  if (replace) UI.stack.pop();
  UI.stack.push({ id, arg, focusId: null });
  renderTop({ restore: false });
}

function back() {
  if (UI.stack.length <= 1) return false;
  UI.stack.pop();
  renderTop();
  return true;
}

/** Home button: drop everything and show the home screen. */
function goHome() {
  closeAllOverlays();
  clearSystem();
  UI.stack = [{ id: 'home', arg: null, focusId: null }];
  renderTop({ restore: false });
}

/** Replace the whole stack — used by boot and by guided setup. */
function resetTo(id, arg) {
  closeAllOverlays();
  UI.stack = [{ id, arg, focusId: null }];
  renderTop({ restore: false });
}

/* ---------------------------------------------------------------- overlays */

/**
 * Put a panel over the current screen. `api` is the same shape a screen
 * returns; `dismissable` decides whether Back simply closes it.
 */
function openOverlay(node, api = {}, { scrim = true } = {}) {
  const wrap = el('div', 'layer-inner');
  wrap.style.cssText = 'position:absolute;inset:0';
  if (scrim) wrap.appendChild(el('div', 'scrim'));
  wrap.appendChild(node);
  UI.layers.overlay.appendChild(wrap);
  UI.overlays.push({ node: wrap, api });
  UI.refreshScope();
  focusFirst(wrap);
  return wrap;
}

function closeOverlay() {
  const top = UI.overlays.pop();
  if (!top) return false;
  top.node.remove();
  UI.refreshScope();
  const owner = UI.current();
  if (owner && owner.refocus) owner.refocus();
  else if (!Focus.el || !focusables().includes(Focus.el)) focusFirst();
  return true;
}

function closeAllOverlays() {
  while (UI.overlays.length) closeOverlay();
}

/* ----------------------------------------------------------------- dialogs */

/**
 * A modal with a title, some copy and a row of buttons. Resolves with the
 * chosen action's id, or null if Back dismissed it.
 */
function dialog({ title, body = '', actions = [], stack = false, icon = '', dismissable = true }) {
  return new Promise(resolve => {
    const node = el('div', 'modal-wrap');
    const card = el('div', 'modal');
    card.innerHTML = `
      ${icon ? `<div class="icon-big">${icon}</div>` : ''}
      <h2>${title}</h2>
      ${body}
      <div class="modal-actions${stack ? ' stack' : ''}">
        ${actions.map((a, i) => `<button class="btn f${a.wide ? ' wide' : ''}" data-fid="dlg${i}" data-act="${esc(a.id)}"${i === 0 ? ' data-first' : ''}>${esc(a.label)}</button>`).join('')}
      </div>`;
    node.appendChild(card);

    let done = false;
    const finish = value => {
      if (done) return;
      done = true;
      closeOverlay();
      resolve(value);
    };

    openOverlay(node, {
      select(target) { if (target.dataset.act) finish(target.dataset.act); },
      back() { if (dismissable) finish(null); return true; },
    }, { scrim: false });
  });
}

/** A dialog with no buttons, closed programmatically. Returns a handle. */
function busyDialog({ title, body = '' }) {
  const node = el('div', 'modal-wrap');
  const card = el('div', 'modal');
  card.innerHTML = `<h2>${title}</h2>${body}
    <div style="display:flex;justify-content:center;margin-top:24px"><div class="spin"></div></div>`;
  node.appendChild(card);
  openOverlay(node, { back() { return true; }, select() {} }, { scrim: false });
  return {
    node: card,
    setBody(html) { const p = card.querySelector('.busy-body'); if (p) p.innerHTML = html; },
    close() { if (UI.overlays.some(o => o.node.contains(node))) closeOverlay(); },
  };
}

/* ------------------------------------------------------------------ toasts */

function toast(text, ms = 2400) {
  const node = el('div', 'toast', esc(text));
  UI.layers.toast.querySelector('.toasts').appendChild(node);
  setTimeout(() => {
    node.classList.add('leaving');
    setTimeout(() => node.remove(), 320);
  }, ms);
}

/* ------------------------------------------------------------------ volume */

let volTimer = null;
function showVolume() {
  let bar = $('#volbar');
  if (!bar) {
    bar = el('div', 'volbar');
    bar.id = 'volbar';
    UI.layers.toast.appendChild(bar);
  }
  const muted = State.muted;
  bar.className = `volbar${muted ? ' muted' : ''}`;
  bar.innerHTML = `
    <div class="vb-top">${ICON(muted ? 'mute' : 'volume')}
      <span>${muted ? 'Muted' : 'Volume'}</span>
      <span class="num">${muted ? '' : State.volume}</span></div>
    <div class="vb-track"><i style="width:${muted ? 0 : State.volume}%"></i></div>`;
  clearTimeout(volTimer);
  volTimer = setTimeout(() => bar.remove(), 1800);
}

function setVolume(delta) {
  if (State.muted && delta !== 0) State.muted = false;
  State.volume = clamp(State.volume + delta, 0, 100);
  save();
  showVolume();
}

function toggleMute() {
  State.muted = !State.muted;
  save();
  showVolume();
}

/* ------------------------------------------------------------ system layer */

/** Take over the whole screen (boot, screensaver, standby, setup). */
function setSystem(node, api = {}) {
  UI.layers.system.innerHTML = '';
  UI.layers.system.appendChild(node);
  UI.system = { node, api };
  UI.refreshScope();
  focusFirst(UI.layers.system);
}

function clearSystem() {
  if (!UI.system) return;
  UI.layers.system.innerHTML = '';
  UI.system = null;
  UI.refreshScope();
  const owner = UI.current();
  if (owner && owner.refocus) owner.refocus();
  else focusFirst();
}

/* ------------------------------------------------------------- the top bar */

/** Shared header used by the home screen and the content pages. */
function topbarHTML({ title = '' } = {}) {
  const net = State.network;
  let chip = '';
  if (!net.connected) {
    chip = `<span class="tb-chip warn">${ICON('wifi')} Not connected</span>`;
  } else if (!net.internet) {
    chip = `<span class="tb-chip warn">${ICON('warn')} No internet</span>`;
  }
  const guest = State.guestMode ? '<span class="tb-chip">Guest Mode</span>' : '';
  return `<div class="topbar">
      ${title ? `<span class="t-section">${esc(title)}</span>` : ''}
      <span class="spacer"></span>${guest}${chip}
      <span class="clock" id="tb-clock">${fmtClock(new Date(), State.system.clock12)}</span>
    </div>`;
}

function tickClock() {
  const node = $('#tb-clock');
  if (node) node.textContent = fmtClock(new Date(), State.system.clock12);
  const saver = $('#saver-time');
  if (saver) {
    saver.textContent = fmtClock(new Date(), State.system.clock12);
    const date = $('#saver-date');
    if (date) date.textContent = fmtDate();
  }
}

/* ----------------------------------------------------------- key dispatch */

/* One entry point for every button, whether it came from the on-screen remote
   or the keyboard. */
function press(key) {
  flashRemote(key);
  noteActivity(key);
  noteChord(key);

  /* Power and volume work from anywhere, exactly as they do on the real
     remote — even over a dialog or the screensaver. */
  if (key === 'power') { togglePower(); return; }
  if (State.power === 'standby') { powerOn(); return; }

  if (key === 'vol+') { setVolume(+2); return; }
  if (key === 'vol-') { setVolume(-2); return; }
  if (key === 'mute') { toggleMute(); return; }

  /* Input is the television's button, so it works whatever the box is doing. */
  if (key === 'input') { toggleInputPicker(); return; }

  const owner = UI.current();

  /* The screensaver eats the first press of anything else. */
  if (!UI.tv && UI.system && UI.system.api.swallow) {
    UI.system.api.swallow(key);
    return;
  }

  if (owner && owner.key && owner.key(key) === true) return;

  switch (key) {
    case 'up': case 'down': case 'left': case 'right':
      moveFocus(key);
      break;
    case 'ok':
      activate();
      break;
    case 'back':
      if (owner && owner.back && owner.back() === true) break;
      if (UI.overlays.length) { closeOverlay(); break; }
      if (!back()) toast('Already at the home screen');
      break;
    case 'home':
      goHome();
      break;
    case 'star':
      if (owner && owner.star) owner.star();
      break;
    case 'replay': case 'rew': case 'fwd': case 'play':
      /* Transport buttons do nothing outside a player, which is exactly what
         they do on the box. */
      break;
    case 'mic':
      startVoice();
      break;
    default:
      break;
  }
}
