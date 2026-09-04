/* ===========================================================================
   Boot.

   Wires the layers together, restores the saved device, builds the remote and
   starts the box the way it would start after being plugged in: the purple
   splash, then either the home screen or guided setup if it has never been
   set up.

   The console helpers at the bottom are for staging a situation quickly when
   somebody is rehearsing a call — they do the same things the menus do.
   =========================================================================== */

'use strict';

(function boot() {
  load();

  UI.canvas = $('#canvas');
  UI.layers = {
    screen: $('#layer-screen'),
    overlay: $('#layer-overlay'),
    system: $('#layer-system'),
    toast: $('#layer-toast'),
    tv: $('#layer-tv'),
  };

  /* A box that has never been set up has no channels; one that has been
     factory reset gets them back when the account is linked again. */
  if (!State.installed.length && State.setupComplete) State.installed = PREINSTALLED.slice();
  if (!State.seenNew.length) State.seenNew = PREINSTALLED.slice();
  save();

  applyTheme();
  $('#cap-model').textContent = State.model;

  buildRemote($('#remote-mount'));
  refreshRemoteBadge();
  wireTvButtons();
  wirePointer(UI.canvas);
  wireKeyboard();

  /* Any pointer movement counts as activity, so the screensaver does not
     appear over someone who is reading the screen. */
  ['pointerdown', 'pointermove', 'wheel'].forEach(type => {
    window.addEventListener(type, () => noteActivity(), { passive: true });
  });

  fitStage();
  window.addEventListener('resize', fitStage);
  if (window.ResizeObserver) new ResizeObserver(fitStage).observe(document.body);

  setInterval(tickClock, 1000);

  /* The splash, then wherever this device belongs. */
  UI.stack = [{ id: State.setupComplete ? 'home' : 'setup', arg: null, focusId: null }];
  bootSequence({
    reason: 'Starting up',
    quick: true,
    after() {
      resetTo(State.setupComplete ? 'home' : 'setup');
      /* If the set was left on another input, it stays there — the box has
         just booted behind it, exactly as it would in the living room. */
      renderSource();
      if (!State.setupComplete) toast('This device needs setting up');
    },
  });
})();

/* --------------------------------------------------------- console helpers */

/* Everything below is reachable through the menus as well. These exist so a
   situation can be staged in one line while someone is practising, rather
   than clicked through first. */
window.roku = {
  /** setNetwork('ok' | 'nointernet' | 'weak' | 'offline' | 'wired') */
  setNetwork(mode) {
    const n = State.network;
    if (mode === 'ok') Object.assign(n, { mode: 'wireless', connected: true, internet: true, signal: 4, ssid: n.ssid || 'Sunfish Cottage 5G' });
    if (mode === 'nointernet') Object.assign(n, { connected: true, internet: false });
    if (mode === 'weak') Object.assign(n, { connected: true, internet: true, signal: 1 });
    if (mode === 'offline') Object.assign(n, { connected: false, internet: false, signal: 0 });
    if (mode === 'wired') Object.assign(n, { mode: 'wired', connected: true, internet: true, signal: 4 });
    save();
    renderTop();
    return `network: ${mode}`;
  },

  /** setBattery(12) — low battery is the usual "remote stopped working". */
  setBattery(pct) {
    State.remote.battery = clamp(Math.round(pct), 0, 100);
    save();
    refreshRemoteBadge();
    renderTop();
    return `remote battery: ${State.remote.battery}%`;
  },

  /** unpair() — leaves the box with no paired remote. */
  unpair() { State.remote.paired = false; save(); refreshRemoteBadge(); renderTop(); return 'remote unpaired'; },

  /** oldSoftware() — puts an update back on the shelf so the flow can be run again. */
  oldSoftware() {
    State.software.version = '14.5.4';
    State.software.build = '4222-C2';
    save();
    renderTop();
    return 'an update is available again';
  },

  /** setInput('hdmi2') — the "check your input" fault, staged in one line. */
  setInput(id) { setInput(id); return `input: ${currentInput().name}`; },

  /** noTvControl() — the remote forgets the television's codes. */
  noTvControl() { State.remote.tvControl = false; save(); return 'the remote no longer drives the set'; },

  /** noCec() — turns off one-touch play, so Home cannot pull the set back. */
  noCec() { State.system.cec = false; State.system.cecOneTouch = false; save(); return 'HDMI-CEC off'; },

  restart() { runRestart('Restarting'); return 'restarting'; },
  secret() { openSecretScreen(); return 'platform secret screen'; },
  saver() { startScreensaver(true); return 'screensaver'; },
  setup() { State.setupComplete = false; save(); resetTo('setup'); return 'guided setup'; },
  reset() { wipeState(); location.reload(); },
  state: () => State,
};
