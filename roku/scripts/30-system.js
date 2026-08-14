/* ===========================================================================
   System: power, boot, restart, updates, factory reset, guided setup and the
   screensaver.

   These are the flows a support call actually spends its time in, so they are
   the ones written out in full rather than faked with a toast — a restart
   really does tear the interface down and build it again, and a factory reset
   really does empty the store and run guided setup on the way back up.
   =========================================================================== */

'use strict';

/* ------------------------------------------------------------------- theme */

function applyTheme() {
  UI.canvas.dataset.theme = State.theme;
}

/* ------------------------------------------------------------------- power */

function setLed(state) {
  const led = $('#tv-led');
  if (led) led.dataset.state = state;
}

function togglePower() {
  if (State.power === 'standby') { powerOn(); return; }
  powerOff();
}

function powerOff() {
  State.power = 'standby';
  save();
  setLed(State.system.standbyLed ? 'standby' : 'off');

  const node = el('div', 'standby');
  node.innerHTML = `
    <div>
      <div class="sb-note">${esc(State.model)} is in standby.</div>
      <button class="btn f" data-fid="wake" data-act="wake" data-first>Press power to wake</button>
    </div>`;
  setSystem(node, {
    select() { powerOn(); },
    key(k) { if (k === 'ok') { powerOn(); return true; } return true; },
    back() { return true; },
  });
}

function powerOn() {
  State.power = 'on';
  save();
  setLed('busy');
  /* Fast TV start skips the long boot, which is the whole point of it. */
  if (State.system.fastStart) {
    clearSystem();
    setLed('on');
    noteActivity();
    toast('Woken from standby');
    return;
  }
  bootSequence({ reason: 'Starting up' });
}

/* -------------------------------------------------------------------- boot */

/**
 * The purple splash. `after` runs once it finishes; by default it drops onto
 * the home screen, or into guided setup if the box has been reset.
 */
function bootSequence({ reason = 'Starting up', after = null, quick = false } = {}) {
  setLed('busy');
  const node = el('div', 'boot');
  node.innerHTML = `
    <div class="boot-inner">
      <div class="boot-word">Roku</div>
      <div class="boot-track"><i id="boot-bar" style="width:0%"></i></div>
      <div class="boot-note" id="boot-note">${esc(reason)}<span class="dots"></span></div>
    </div>`;
  setSystem(node, { key() { return true; }, back() { return true; }, select() {} });

  const bar = node.querySelector('#boot-bar');
  const note = node.querySelector('#boot-note');
  const steps = quick
    ? [[40, reason], [100, 'Launching Home Screen']]
    : [[18, reason], [46, 'Checking for updates'], [74, 'Starting channels'], [100, 'Launching Home Screen']];

  let i = 0;
  const step = () => {
    if (i >= steps.length) {
      setLed('on');
      State.bootedAt = Date.now();
      save();
      clearSystem();
      if (after) after();
      else if (!State.setupComplete) resetTo('setup');
      else resetTo('home');
      noteActivity();
      return;
    }
    const [pct, text] = steps[i];
    bar.style.width = `${pct}%`;
    note.innerHTML = `${esc(text)}<span class="dots"></span>`;
    i += 1;
    setTimeout(step, quick ? 700 : 950);
  };
  setTimeout(step, 260);
}

/* ----------------------------------------------------------------- restart */

async function confirmRestart() {
  const answer = await dialog({
    title: 'Restart this device?',
    body: `<p>The device will shut down and start again. Nothing is lost — your account,
      your channels and every setting stay exactly as they are.</p>
      <p>It takes about half a minute.</p>`,
    actions: [{ id: 'cancel', label: 'Cancel' }, { id: 'restart', label: 'Restart' }],
  });
  if (answer !== 'restart') return;
  runRestart('Restarting');
}

/** Shared by the menu restart, the network reset and a finished update. */
function runRestart(reason, after = null) {
  closeAllOverlays();
  const black = el('div', 'standby');
  setSystem(black, { key() { return true; }, back() { return true; }, select() {} });
  setLed('busy');
  setTimeout(() => bootSequence({ reason, after }), 900);
}

async function confirmPowerOff() {
  const answer = await dialog({
    title: 'Power off?',
    body: `<p>The device goes into standby. Press the power button on the remote to bring
      it back.</p>`,
    actions: [{ id: 'cancel', label: 'Cancel' }, { id: 'off', label: 'Power off' }],
  });
  if (answer === 'off') powerOff();
}

/* ------------------------------------------------------------------ update */

async function checkForUpdate() {
  const busy = busyDialog({ title: 'Checking for updates', body: '<p>Contacting the update servers.</p>' });
  await sleep(1900);
  busy.close();

  State.software.lastChecked = `${fmtClock(new Date(), State.system.clock12)} today`;
  save();

  if (!State.network.connected || !State.network.internet) {
    await dialog({
      title: 'Could not check for updates',
      body: `<p>This device could not reach the update servers.</p>
        <p>Check <b>Settings &rsaquo; Network &rsaquo; Check connection</b> first.</p>`,
      actions: [{ id: 'ok', label: 'OK' }],
    });
    renderTop();
    return;
  }

  /* One update is waiting on a box that has never taken it; after that the
     check honestly reports that there is nothing to do. */
  if (State.software.version !== '14.5.4') {
    await dialog({
      title: 'Your device is up to date',
      body: `<p>Roku OS ${esc(State.software.version)} build ${esc(State.software.build)} is the
        current version for this device.</p>`,
      actions: [{ id: 'ok', label: 'OK' }],
    });
    renderTop();
    return;
  }

  const answer = await dialog({
    title: 'A software update is available',
    body: `<p>Roku OS 14.5.6 is ready to install. The device will restart when it finishes.</p>
      <p class="dim2">Download size 214 MB.</p>`,
    actions: [{ id: 'now', label: 'Update now' }, { id: 'later', label: 'Later' }],
  });
  if (answer !== 'now') return;

  await runUpdateProgress();
}

function runUpdateProgress() {
  return new Promise(resolve => {
    const node = el('div', 'progress-screen');
    node.innerHTML = `
      <div class="ps-inner">
        <h2 id="up-title">Downloading the update</h2>
        <p id="up-sub">Do not unplug this device.</p>
        <div class="meter"><i id="up-bar" style="width:0%"></i></div>
        <p class="num" id="up-pct">0%</p>
        <div class="warnline">The device restarts on its own when the update is installed.</div>
      </div>`;
    setSystem(node, { key() { return true; }, back() { return true; }, select() {} });

    const bar = node.querySelector('#up-bar');
    const pctText = node.querySelector('#up-pct');
    const title = node.querySelector('#up-title');
    let pct = 0;

    const timer = setInterval(() => {
      pct += 4 + Math.round(Math.random() * 5);
      if (pct >= 100) {
        pct = 100;
        clearInterval(timer);
        bar.style.width = '100%';
        pctText.textContent = '100%';
        title.textContent = 'Installing';
        setTimeout(() => {
          State.software.version = '14.5.6';
          State.software.build = '4231-B4';
          save();
          runRestart('Installing the update', () => {
            resetTo('home');
            toast('Updated to Roku OS 14.5.6');
            resolve();
          });
        }, 1400);
        return;
      }
      if (pct > 55) title.textContent = 'Verifying the update';
      bar.style.width = `${pct}%`;
      pctText.textContent = `${pct}%`;
    }, 320);
  });
}

/* ----------------------------------------------------------- factory reset */

async function confirmFactoryReset() {
  const code = String(1000 + Math.floor(Math.random() * 8999));

  const warn = await dialog({
    title: 'Factory reset everything',
    body: `<p>This erases everything on this device: the account it is linked to, every channel
      you added, every setting and every stored network.</p>
      <p>When it finishes, the device restarts and runs guided setup as if it were new.</p>`,
    actions: [{ id: 'cancel', label: 'Cancel' }, { id: 'go', label: 'Continue' }],
  });
  if (warn !== 'go') return;

  /* Roku makes you type a code shown on screen so a reset can never be one
     stray button press. */
  const typed = await enterResetCode(code);
  if (typed !== code) {
    if (typed !== null) {
      await dialog({ title: 'That code did not match', body: '<p>Nothing was erased.</p>', actions: [{ id: 'ok', label: 'OK' }] });
    }
    return;
  }

  closeAllOverlays();
  const node = el('div', 'progress-screen');
  node.innerHTML = `
    <div class="ps-inner">
      <h2>Erasing</h2>
      <p>Do not unplug this device.</p>
      <div class="meter"><i id="fr-bar" style="width:0%"></i></div>
    </div>`;
  setSystem(node, { key() { return true; }, back() { return true; }, select() {} });

  const bar = node.querySelector('#fr-bar');
  let pct = 0;
  const timer = setInterval(() => {
    pct += 7;
    bar.style.width = `${Math.min(100, pct)}%`;
    if (pct >= 100) {
      clearInterval(timer);
      wipeState();
      State.setupComplete = false;
      State.installed = [];
      State.account.linked = false;
      save();
      setTimeout(() => bootSequence({ reason: 'Starting up', after: () => resetTo('setup') }), 700);
    }
  }, 260);
}

/** The four-digit confirmation code, typed from what is on screen. */
function enterResetCode(code) {
  return new Promise(resolve => {
    let entered = '';
    const node = el('div', 'modal-wrap');
    const card = el('div', 'modal');
    node.appendChild(card);

    const paint = () => {
      card.innerHTML = `
        <h2>Enter the code to confirm</h2>
        <p>Type <b>${esc(code)}</b> to erase this device.</p>
        <span class="code">${entered.padEnd(4, '_')}</span>
        <div class="modal-actions" style="justify-content:center;gap:10px;flex-wrap:wrap">
          ${['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'OK'].map((k, i) => `
            <button class="btn slim f" style="min-width:76px" data-fid="fr-${k}" data-pin="${k}"${i === 0 ? ' data-first' : ''}>${k}</button>`).join('')}
        </div>`;
    };

    let done = false;
    const finish = value => { if (done) return; done = true; closeOverlay(); resolve(value); };

    paint();
    openOverlay(node, {
      select(target) {
        const k = target.dataset.pin;
        if (k === '⌫') { entered = entered.slice(0, -1); paint(); focusFirst(); return; }
        if (k === 'OK') { finish(entered); return; }
        if (entered.length < 4) entered += k;
        paint();
        focusFirst();
        if (entered.length === 4) finish(entered);
      },
      back() { finish(null); return true; },
    }, { scrim: false });
  });
}

/* ------------------------------------------------------------ guided setup */

const SETUP_STEPS = [
  { id: 'language', name: 'Language' },
  { id: 'country', name: 'Country' },
  { id: 'network', name: 'Network' },
  { id: 'update', name: 'Software' },
  { id: 'display', name: 'Display' },
  { id: 'link', name: 'Link account' },
  { id: 'done', name: 'Finish' },
];

defineScreen('setup', {
  render(host) {
    let step = 0;
    let chosenNet = null;
    let password = '';

    function shell(bodyHTML, { title, sub = '' } = {}) {
      host.innerHTML = `
        <div class="setup">
          <div class="wall"></div>
          <div class="setup-side">
            <div class="ss-title">Guided Setup</div>
            ${SETUP_STEPS.map((s, i) => `
              <div class="ss-step ${i < step ? 'done' : i === step ? 'now' : ''}">
                <span class="ss-num">${i < step ? '✓' : i + 1}</span><span>${esc(s.name)}</span>
              </div>`).join('')}
          </div>
          <div class="setup-main">
            <h1>${esc(title)}</h1>
            ${sub ? `<div class="sm-sub">${sub}</div>` : ''}
            <div class="sm-body scroll-y">${bodyHTML}</div>
          </div>
        </div>`;
      focusFirst(host);
    }

    function paint() {
      const which = SETUP_STEPS[step].id;

      if (which === 'language') {
        shell(`<div style="max-width:520px">${LANGUAGES.map((l, i) => `
            <div class="row f${i === 0 ? ' is-set' : ''}" data-fid="lang-${i}" data-next="1"${i === 0 ? ' data-first' : ''}>${esc(l)}</div>`).join('')}
          </div>`, { title: 'Choose your language', sub: 'You can change this later in Settings.' });
        return;
      }

      if (which === 'country') {
        shell(`<div style="max-width:520px">${COUNTRIES.map((c, i) => `
            <div class="row f${i === 0 ? ' is-set' : ''}" data-fid="cty-${i}" data-next="1"${i === 0 ? ' data-first' : ''}>${esc(c)}</div>`).join('')}
          </div>`, { title: 'Choose your country', sub: 'This sets which channels and stores are available.' });
        return;
      }

      if (which === 'network') {
        if (!chosenNet) {
          shell(`<div style="max-width:640px">
              ${VISIBLE_NETWORKS.map((n, i) => `
                <div class="netrow f" data-fid="sn-${i}" data-ssid="${esc(n.ssid)}"${i === 0 ? ' data-first' : ''}>
                  <span class="nr-name">${esc(n.ssid)}</span>
                  ${n.secure ? `<span class="nr-lock">${ICON('lock')}</span>` : ''}
                  ${BARS(n.signal, n.signal <= 2)}
                </div>`).join('')}
              <div class="netrow f" data-fid="sn-wired" data-wired="1">
                <span class="nr-name">Connect with an Ethernet cable instead</span>${ICON('ethernet')}</div>
            </div>`, { title: 'Connect to your network', sub: 'Networks in range, strongest first.' });
          return;
        }
        shell(`
          <div class="pwfield" style="max-width:620px">${password ? esc('•'.repeat(password.length)) : '<span class="dim2">Password</span>'}<span class="caret"></span></div>
          <div class="okbd">
            ${'abcdefghijklmnopqrstuvwxyz0123456789'.split('').map(ch => `
              <div class="kkey f" data-fid="sp-${ch}" data-ch="${ch}">${ch}</div>`).join('')}
            <div class="kkey wide act f" data-fid="sp-del" data-act="del">DELETE</div>
            <div class="kkey xwide act f" data-fid="sp-connect" data-act="connect" data-first>CONNECT</div>
          </div>`, { title: `Password for ${esc(chosenNet)}`, sub: 'Eight characters or more.' });
        return;
      }

      if (which === 'update') {
        shell(`<div style="display:flex;align-items:center;gap:20px;margin-top:14px">
            <div class="spin"></div><div class="t-row">Checking for updates<span class="dots"></span></div>
          </div>`, { title: 'Software', sub: 'Making sure this device has the current software before it starts.' });
        setTimeout(() => { step += 1; paint(); }, 2200);
        return;
      }

      if (which === 'display') {
        shell(`
          <dl class="facts" style="max-width:520px">
            <div class="fact"><dt>Detected</dt><dd>4K HDR at 60Hz</dd></div>
            <div class="fact"><dt>HDCP</dt><dd>2.2 authenticated</dd></div>
            <div class="fact"><dt>HDMI</dt><dd>Port 1</dd></div>
          </dl>
          <div class="btnrow" style="margin-top:26px">
            <button class="btn f wide" data-fid="d-ok" data-next="1" data-first>That looks right</button>
            <button class="btn f" data-fid="d-1080" data-display="1080p">Use 1080p instead</button>
          </div>
          <div class="det-note" style="margin-top:22px">If the picture flickered or dropped out
            during this check, choose 1080p — that is a cable that cannot carry 4K.</div>`,
          { title: 'Display type', sub: 'The television was asked what it supports.' });
        return;
      }

      if (which === 'link') {
        shell(`
          <div class="linkcode">K7QP2N</div>
          <div class="sm-sub">Go to <b>example.com/link</b> on a phone or computer, sign in, and
            enter this code. The screen moves on by itself once it is entered.</div>
          <div class="btnrow" style="margin-top:26px">
            <button class="btn f wide" data-fid="l-ok" data-link="1" data-first>I have entered the code</button>
            <button class="btn f" data-fid="l-skip" data-next="1">Skip for now</button>
          </div>
          <div class="det-note" style="margin-top:22px">Without an account the device still plays
            free channels, but nothing can be added from the store.</div>`,
          { title: 'Link this device to an account', sub: 'This is what a support call means by "activation".' });
        return;
      }

      shell(`
        <div class="t-body" style="max-width:620px">Every channel from the account has been
          restored to the home screen. The remote is paired, the network is connected and the
          software is current.</div>
        <div class="btnrow" style="margin-top:26px">
          <button class="btn f wide" data-fid="fin" data-finish="1" data-first>Go to the home screen</button>
        </div>`, { title: 'You are all set', sub: '' });
    }

    async function joinNetwork() {
      shell(`<div style="display:flex;align-items:center;gap:20px;margin-top:14px">
          <div class="spin"></div><div class="t-row">Joining ${esc(chosenNet)}<span class="dots"></span></div>
        </div>`, { title: 'Connecting' });
      await sleep(1700);
      const net = VISIBLE_NETWORKS.find(n => n.ssid === chosenNet);
      if (net && net.secure && password.length < 8) {
        toast('That password was not accepted');
        paint();
        return;
      }
      Object.assign(State.network, {
        mode: 'wireless', ssid: chosenNet, connected: true, internet: true,
        signal: net ? net.signal : 3, band: net ? net.band : '5 GHz',
        security: net && net.secure ? 'WPA2-PSK (AES)' : 'Open',
      });
      State.knownNetworks = [chosenNet];
      save();
      step += 1;
      paint();
    }

    paint();

    return {
      select(node) {
        if (node.dataset.next) { step += 1; paint(); return; }
        if (node.dataset.display) {
          State.display.type = '1080p';
          State.display.resolved = '1080p TV';
          State.display.hdr = false;
          save();
          step += 1;
          paint();
          return;
        }
        if (node.dataset.wired) {
          Object.assign(State.network, { mode: 'wired', connected: true, internet: true, signal: 4 });
          save();
          step += 1;
          paint();
          return;
        }
        if (node.dataset.ssid) {
          chosenNet = node.dataset.ssid;
          password = '';
          const net = VISIBLE_NETWORKS.find(n => n.ssid === chosenNet);
          if (net && !net.secure) { joinNetwork(); return; }
          paint();
          return;
        }
        if (node.dataset.ch) {
          password += node.dataset.ch;
          const keep = Focus.el && Focus.el.dataset.fid;
          paint();
          const again = host.querySelector(`[data-fid="${CSS.escape(keep)}"]`);
          if (again) setFocus(again);
          return;
        }
        if (node.dataset.act === 'del') { password = password.slice(0, -1); paint(); return; }
        if (node.dataset.act === 'connect') { joinNetwork(); return; }
        if (node.dataset.link) {
          State.account.linked = true;
          State.installed = PREINSTALLED.slice();
          save();
          step += 1;
          paint();
          return;
        }
        if (node.dataset.finish) {
          State.setupComplete = true;
          if (!State.installed.length) State.installed = PREINSTALLED.slice();
          save();
          resetTo('home');
          toast('Setup complete');
        }
      },
      back() {
        if (SETUP_STEPS[step].id === 'network' && chosenNet) { chosenNet = null; paint(); return true; }
        if (step > 0) { step -= 1; paint(); return true; }
        return true;
      },
      refocus() {},
    };
  },
});

/* ------------------------------------------------------------- screensaver */

let idleTimer = null;
let saverDrift = null;

function noteActivity() {
  clearTimeout(idleTimer);
  if (UI.system && UI.system.api.isSaver) stopScreensaver();
  const minutes = State.screensaverWait;
  if (!minutes || State.screensaver === 'off') return;
  idleTimer = setTimeout(() => startScreensaver(), minutes * 60 * 1000);
}

function startScreensaver(preview = false) {
  if (State.power === 'standby') return;
  if (UI.system) return;
  const top = UI.stack[UI.stack.length - 1];
  /* Nothing covers a running player, which is how it behaves on the box. */
  if (!preview && top && top.id === 'player') return;

  const node = el('div', 'saver');
  const inner = el('div', 'drift');
  inner.innerHTML = State.screensaver === 'logo'
    ? '<div class="sv-logo">Roku</div>'
    : `<div class="sv-time" id="saver-time">${fmtClock(new Date(), State.system.clock12)}</div>
       <div class="sv-date" id="saver-date">${fmtDate()}</div>`;
  node.appendChild(inner);

  setSystem(node, {
    isSaver: true,
    swallow() { stopScreensaver(); },
    key() { stopScreensaver(); return true; },
    back() { stopScreensaver(); return true; },
    select() { stopScreensaver(); },
  });

  const move = () => {
    const w = 1280 - inner.offsetWidth;
    const h = 720 - inner.offsetHeight;
    inner.style.transition = 'transform 5.5s linear';
    inner.style.transform = `translate(${Math.round(Math.random() * Math.max(0, w))}px,${Math.round(Math.random() * Math.max(0, h))}px)`;
  };
  move();
  saverDrift = setInterval(move, 5500);
}

function stopScreensaver() {
  clearInterval(saverDrift);
  saverDrift = null;
  clearSystem();
  noteActivity();
}
