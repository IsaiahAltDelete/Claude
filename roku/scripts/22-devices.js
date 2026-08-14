/* ===========================================================================
   The device-shaped settings flows: pairing and renaming the remote, teaching
   it the television's power and volume codes, the parental PIN and Guest Mode.

   Pairing is the one worth being fussy about — it is the flow a support agent
   walks somebody through most often, and the detail that matters is that the
   pairing button is inside the battery compartment, not on the front.
   =========================================================================== */

'use strict';

/* ------------------------------------------------------------------ pairing */

let pairingWindow = null;      /* set while the box is listening for a remote */

/**
 * Start listening for a remote. The box waits thirty seconds; pressing the
 * Pair control under the on-screen remote during that window completes it.
 */
async function startPairing() {
  const node = el('div', 'modal-wrap');
  const card = el('div', 'modal');
  node.appendChild(card);

  let left = 30;
  let done = false;

  const paint = () => {
    card.innerHTML = `
      <h2>Pair a new remote</h2>
      <p>Hold the pairing button inside the battery compartment for five seconds, until the
        light on the remote starts flashing.</p>
      <p class="dim2" style="margin-top:14px">In this simulator the pairing button is the
        <b>Pair</b> control underneath the remote.</p>
      <div style="display:flex;align-items:center;gap:18px;margin-top:24px">
        <div class="spin"></div>
        <div class="t-row">Searching — ${left}s remaining</div>
      </div>
      <div class="modal-actions">
        <button class="btn f" data-fid="cancel" data-act="cancel" data-first>Cancel</button>
      </div>`;
  };

  const finish = result => {
    if (done) return;
    done = true;
    clearInterval(timer);
    pairingWindow = null;
    closeOverlay();
    if (result === 'paired') {
      State.remote.paired = true;
      State.remote.battery = 100;
      State.remote.lastPaired = 'Paired just now';
      save();
      dialog({
        title: 'Remote paired',
        body: '<p>The remote is connected and ready to use.</p>',
        actions: [{ id: 'ok', label: 'OK' }],
      }).then(() => renderTop());
    } else if (result === 'timeout') {
      dialog({
        title: 'No remote found',
        body: `<p>Nothing answered in thirty seconds.</p>
          <p>Take the batteries out, put them back in, then hold the pairing button again for
            five seconds. If the light does not flash at all, the batteries are flat.</p>`,
        actions: [{ id: 'again', label: 'Try again' }, { id: 'ok', label: 'Cancel' }],
      }).then(answer => { if (answer === 'again') startPairing(); });
    }
  };

  paint();
  openOverlay(node, {
    select(target) { if (target.dataset.act === 'cancel') finish('cancel'); },
    back() { finish('cancel'); return true; },
  }, { scrim: false });

  pairingWindow = () => finish('paired');
  const timer = setInterval(() => {
    left -= 1;
    if (left <= 0) { finish('timeout'); return; }
    if (!done) paint();
  }, 1000);
}

/** Wired to the Pair control under the on-screen remote. */
function pressPairingButton() {
  if (pairingWindow) { pairingWindow(); return; }
  toast('Pairing light flashing — nothing is listening for it');
}

function unpairRemote() {
  dialog({
    title: 'Unpair this remote?',
    body: `<p>The remote will stop working until it is paired again.</p>
      <p>You can still drive this device from the buttons on the box, or from the mobile app.</p>`,
    actions: [{ id: 'cancel', label: 'Keep it paired' }, { id: 'unpair', label: 'Unpair' }],
  }).then(answer => {
    if (answer !== 'unpair') return;
    State.remote.paired = false;
    State.remote.lastPaired = 'Not paired';
    save();
    renderTop();
    toast('Remote unpaired — use Pair new device to set it up again');
  });
}

function renameRemote() {
  const names = ['Roku Voice Remote', 'Living Room Remote', 'Upstairs Remote', 'Alex’s Remote'];
  const panel = el('div', 'optpanel');
  panel.innerHTML = `<h2>Rename remote</h2><div class="sub">Pick a name.</div>
    ${names.map((n, i) => `<div class="row f${State.remote.kind === n ? ' is-set' : ''}"
      data-fid="rn-${i}" data-name="${esc(n)}"${i === 0 ? ' data-first' : ''}>${esc(n)}</div>`).join('')}`;
  openOverlay(panel, {
    select(node) {
      State.remote.kind = node.dataset.name;
      save();
      closeOverlay();
      renderTop();
      toast('Remote renamed');
    },
  });
}

async function checkRemoteFirmware() {
  const busy = busyDialog({ title: 'Checking the remote', body: '<p>Looking for newer remote firmware.</p>' });
  await sleep(1800);
  busy.close();
  await dialog({
    title: 'The remote is up to date',
    body: `<p>Firmware ${esc(State.remote.firmware)} is the current version for this remote.</p>`,
    actions: [{ id: 'ok', label: 'OK' }],
  });
}

/* -------------------------------------------------------------- TV control */

async function setUpTvControl() {
  const steps = [
    { q: 'Point the remote at the television and press OK. Did the television switch off?', yes: 'power' },
    { q: 'Press OK again. Did the volume change?', yes: 'volume' },
  ];

  for (let i = 0; i < steps.length; i += 1) {
    const answer = await dialog({
      title: 'Set up remote for TV control',
      body: `<p>${esc(steps[i].q)}</p>
        <p class="dim2">If nothing happened, choose <b>No</b> and the next set of codes is tried.</p>`,
      actions: [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }, { id: 'skip', label: 'Skip' }],
    });
    if (answer === 'skip' || answer === null) { toast('TV control setup skipped'); return; }
    if (answer === 'no') {
      const busy = busyDialog({ title: 'Trying the next code set', body: '<p>This takes a few seconds.</p>' });
      await sleep(1400);
      busy.close();
      i -= 1;
    }
  }

  await dialog({
    title: 'TV control is set up',
    body: '<p>The power and volume buttons on this remote now control the television.</p>',
    actions: [{ id: 'ok', label: 'OK' }],
  });
}

/* -------------------------------------------------------- parental controls */

async function setParentalPin() {
  const first = await enterNewPin('Choose a 4-digit PIN');
  if (first === null) return;
  const again = await enterNewPin('Enter the same PIN again');
  if (again === null) return;
  if (first !== again) {
    await dialog({ title: 'The PINs did not match', body: '<p>Nothing was changed. Try again.</p>', actions: [{ id: 'ok', label: 'OK' }] });
    return;
  }
  State.parental.pin = first;
  if (State.parental.pinScope === 'off') State.parental.pinScope = 'buy';
  save();
  renderTop();
  toast('PIN set');
}

/** A keypad that returns whatever was typed, rather than checking it. */
function enterNewPin(title) {
  return new Promise(resolve => {
    let entered = '';
    const node = el('div', 'modal-wrap');
    const card = el('div', 'modal');
    node.appendChild(card);

    const paint = () => {
      card.innerHTML = `
        <h2>${esc(title)}</h2>
        <span class="code">${'•'.repeat(entered.length)}${'_'.repeat(4 - entered.length)}</span>
        <div class="modal-actions" style="justify-content:center;gap:10px;flex-wrap:wrap">
          ${['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'OK'].map((k, i) => `
            <button class="btn slim f" style="min-width:76px" data-fid="np-${k}" data-pin="${k}"${i === 0 ? ' data-first' : ''}>${k}</button>`).join('')}
        </div>`;
    };

    let done = false;
    const finish = value => { if (done) return; done = true; closeOverlay(); resolve(value); };

    paint();
    openOverlay(node, {
      select(target) {
        const k = target.dataset.pin;
        if (k === '⌫') { entered = entered.slice(0, -1); paint(); focusFirst(); return; }
        if (k === 'OK') { finish(entered.length === 4 ? entered : null); return; }
        if (entered.length < 4) entered += k;
        paint();
        focusFirst();
        if (entered.length === 4) finish(entered);
      },
      back() { finish(null); return true; },
    }, { scrim: false });
  });
}

/* --------------------------------------------------------------- Guest Mode */

async function toggleGuestMode() {
  if (State.guestMode) {
    const ok = State.parental.pin
      ? await promptPin('Enter the PIN to end Guest Mode', State.parental.pin)
      : true;
    if (!ok) { toast('Incorrect PIN'); return; }
    State.guestMode = false;
    save();
    renderTop();
    await dialog({
      title: 'Guest Mode ended',
      body: '<p>Every account signed in during the visit has been signed out.</p>',
      actions: [{ id: 'ok', label: 'OK' }],
    });
    return;
  }

  const pin = await enterNewPin('Choose a PIN to end Guest Mode later');
  if (pin === null) return;
  State.parental.pin = State.parental.pin || pin;
  State.guestMode = true;
  save();
  renderTop();
  await dialog({
    title: 'Guest Mode is on',
    body: `<p>A visitor can now sign in to their own subscriptions without touching yours.</p>
      <p>Ending Guest Mode needs the PIN you just chose.</p>`,
    actions: [{ id: 'ok', label: 'OK' }],
  });
}
