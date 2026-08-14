/* ===========================================================================
   The network flows: check connection, set up connection, and the network
   connection reset.

   Check connection is the three-step test a support call always starts with,
   and it reports honestly — if the box is joined to a network with no route
   out, step one passes and step two fails, which is exactly the state that
   confuses people.
   =========================================================================== */

'use strict';

/* --------------------------------------------------------- check connection */

const CHECK_STEPS = [
  { id: 'lan', label: 'Connection to your wireless network' },
  { id: 'wan', label: 'Connection to the internet' },
  { id: 'speed', label: 'Internet download speed' },
];

defineScreen('netcheck', {
  render(host) {
    const n = State.network;
    let stage = 0;
    let results = {};
    let finished = false;

    host.innerHTML = `
      <div class="settings">
        <div class="wall"></div>
        ${topbarHTML()}
        ${sideRailHTML('settings')}
        <div class="set-head">
          <div class="trail">Settings<span class="sl">›</span>Network<span class="sl">›</span><b>Check connection</b></div>
          <h1>Check connection</h1>
        </div>
        <div class="set-body">
          <div class="set-menu">
            <div id="nc-steps"></div>
            <div style="margin-top:26px" id="nc-actions"></div>
          </div>
          <div class="set-detail" id="nc-detail"></div>
        </div>
      </div>`;

    const steps = host.querySelector('#nc-steps');
    const actions = host.querySelector('#nc-actions');
    const detail = host.querySelector('#nc-detail');

    function paint() {
      steps.innerHTML = CHECK_STEPS.map((step, i) => {
        let cls = 'idle';
        let mark = '·';
        let value = '';
        if (i < stage || finished) {
          const r = results[step.id];
          cls = r && r.ok ? 'ok' : 'fail';
          mark = r && r.ok ? '✓' : '✕';
          value = r ? r.value : '';
        } else if (i === stage && !finished) {
          cls = '';
          mark = '<span class="spin"></span>';
        }
        return `<div class="checkstep ${cls}">
            <span class="cs-mark">${mark}</span>
            <span>${esc(step.label)}</span>
            <span class="cs-val">${esc(value)}</span>
          </div>`;
      }).join('');

      if (finished) {
        const allOk = CHECK_STEPS.every(s => results[s.id] && results[s.id].ok);
        actions.innerHTML = `<div class="btnrow">
          <button class="btn f" data-fid="again" data-act="again" data-first>Check again</button>
          <button class="btn f" data-fid="setup" data-act="setup">Set up connection</button>
          <button class="btn f" data-fid="done" data-act="done">Done</button></div>`;
        detail.innerHTML = allOk
          ? `<div class="det-title">Everything checks out</div>
             <div class="det-desc">This device can reach the internet at
               ${esc(results.speed.value)}, which is enough for HD and, above about 25 Mbps, 4K.</div>
             ${netAboutDetail(false)}`
          : `<div class="det-title">Something failed</div>
             <div class="det-desc">${results.lan.ok
               ? 'The box is joined to the network but cannot get out to the internet. Restart the router, then restart this device from Settings › System › Power.'
               : 'The box is not joined to a wireless network at all. Run Set up connection and rejoin.'}</div>
             <div class="det-note warn">Signal strength here is
               ${['none', 'poor', 'fair', 'good', 'excellent'][n.signal]}.</div>`;
        focusFirst(host);
      } else {
        actions.innerHTML = '';
        detail.innerHTML = `<div class="det-title">Testing<span class="dots"></span></div>
          <div class="det-desc">Each step is tried in order. The first one to fail is the one
            worth acting on — the ones after it will fail whatever the cause.</div>`;
      }
    }

    async function run() {
      stage = 0; results = {}; finished = false; paint();

      await sleep(1200);
      results.lan = n.connected
        ? { ok: true, value: `${['None', 'Poor', 'Fair', 'Good', 'Excellent'][n.signal]} signal` }
        : { ok: false, value: 'Not connected' };
      stage = 1; paint();
      if (!results.lan.ok) {
        results.wan = { ok: false, value: 'Skipped' };
        results.speed = { ok: false, value: 'Skipped' };
        finished = true; paint(); return;
      }

      await sleep(1400);
      results.wan = n.internet
        ? { ok: true, value: `${esc(n.gateway)} reachable` }
        : { ok: false, value: 'No response' };
      stage = 2; paint();
      if (!results.wan.ok) {
        results.speed = { ok: false, value: 'Skipped' };
        finished = true; paint(); return;
      }

      await sleep(1700);
      const mbps = n.mode === 'wired' ? 94.2 : [0, 2.1, 8.4, 34.6, 78.3][n.signal];
      results.speed = { ok: mbps >= 3, value: `${mbps.toFixed(1)} Mbps` };
      State.network.lastCheck = `${fmtClock(new Date(), State.system.clock12)} today`;
      save();
      finished = true; paint();
    }

    const rail = wireSideRail(host);
    run();

    return {
      onFocus(node) { rail.onFocus(node); },
      select(node) {
        if (rail.select(node)) return;
        const act = node.dataset.act;
        if (act === 'again') { run(); return; }
        if (act === 'setup') { go('netsetup', null, { replace: true }); return; }
        back();
      },
      refocus() {},
    };
  },
});

/* ----------------------------------------------------------- set up connection */

const PW_ROWS = [
  'abcdefghij', 'klmnopqrst', 'uvwxyz0123', '456789.-_@',
];

defineScreen('netsetup', {
  render(host) {
    let stage = 'type';           /* type → scan → password → connecting → done */
    let chosen = null;
    let password = '';
    let shift = false;
    let failure = '';

    const rail = { onFocus() {}, select() { return false; } };

    function shell(title, trail, bodyHTML) {
      host.innerHTML = `
        <div class="settings">
          <div class="wall"></div>
          ${topbarHTML()}
          ${sideRailHTML('settings')}
          <div class="set-head">
            <div class="trail">Settings<span class="sl">›</span>Network<span class="sl">›</span><b>${esc(trail)}</b></div>
            <h1>${esc(title)}</h1>
          </div>
          <div class="set-body"><div style="flex:1;padding:6px 48px 22px 26px;overflow:hidden">${bodyHTML}</div></div>
        </div>`;
      focusFirst(host);
    }

    function paintType() {
      shell('Set up connection', 'Set up connection', `
        <div class="det-desc" style="margin-bottom:20px">How is this device connected?</div>
        <div style="max-width:620px">
          <div class="row f" data-fid="t-wireless" data-type="wireless" data-first>
            ${ICON('wifi')}<span>Wireless</span><span class="row-chev">›</span></div>
          <div class="row f" data-fid="t-wired" data-type="wired">
            ${ICON('ethernet')}<span>Wired</span><span class="row-chev">›</span></div>
        </div>
        <div class="det-note">A wired connection is always steadier. If the box is next to the
          router anyway, use the cable.</div>`);
    }

    function paintScan() {
      shell('Choose your network', 'Set up connection', `
        <div class="det-desc" style="margin-bottom:14px">Networks in range, strongest first.</div>
        <div style="max-width:660px">
          ${VISIBLE_NETWORKS.map((net, i) => `
            <div class="netrow f" data-fid="n-${i}" data-ssid="${esc(net.ssid)}"${i === 0 ? ' data-first' : ''}>
              <span class="nr-name">${esc(net.ssid)}</span>
              ${net.secure ? `<span class="nr-lock">${ICON('lock')}</span>` : ''}
              ${BARS(net.signal, net.signal <= 2)}
            </div>`).join('')}
          <div class="netrow f" data-fid="n-scan" data-rescan="1">
            <span class="nr-name">Scan again to see all networks</span></div>
        </div>`);
    }

    function paintPassword() {
      const rows = PW_ROWS.map(row => (shift ? row.toUpperCase() : row));
      shell(`Enter the password for ${chosen}`, 'Set up connection', `
        <div class="pwfield">${password ? esc('•'.repeat(password.length)) : '<span class="dim2">Password</span>'}<span class="caret"></span></div>
        ${failure ? `<div class="det-note bad" style="margin:0 0 14px">${esc(failure)}</div>` : ''}
        <div class="okbd">
          ${rows.map(row => row.split('').map(ch => `
            <div class="kkey f" data-fid="p-${ch}" data-ch="${esc(ch)}">${esc(ch)}</div>`).join('')).join('')}
          <div class="kkey wide act f" data-fid="p-shift" data-act="shift">${shift ? 'abc' : 'ABC'}</div>
          <div class="kkey wide act f" data-fid="p-del" data-act="del">DELETE</div>
          <div class="kkey wide act f" data-fid="p-clear" data-act="clear">CLEAR</div>
          <div class="kkey wide act f" data-fid="p-show" data-act="show">SHOW</div>
          <div class="kkey wide act f" data-fid="p-connect" data-act="connect" data-first>CONNECT</div>
        </div>
        <div class="det-note">Any password of eight characters or more is accepted here; a
          shorter one fails the way a wrong one does on a real device.</div>`);
    }

    async function connect() {
      shell('Connecting', 'Set up connection', `
        <div style="display:flex;align-items:center;gap:18px;margin-top:20px">
          <div class="spin"></div><div class="t-row">Joining ${esc(chosen)}<span class="dots"></span></div>
        </div>`);
      await sleep(1600);

      const net = VISIBLE_NETWORKS.find(n => n.ssid === chosen);
      const needsPassword = net ? net.secure : true;
      if (needsPassword && password.length < 8) {
        failure = 'That password was not accepted. Check it and try again.';
        stage = 'password';
        paintPassword();
        return;
      }

      Object.assign(State.network, {
        mode: 'wireless',
        ssid: chosen,
        connected: true,
        internet: true,
        signal: net ? net.signal : 3,
        band: net ? net.band : '5 GHz',
        security: needsPassword ? 'WPA2-PSK (AES)' : 'Open',
        ip: `192.168.1.${40 + Math.floor(Math.random() * 40)}`,
      });
      if (!State.knownNetworks.includes(chosen)) State.knownNetworks.push(chosen);
      save();

      shell('Connected', 'Set up connection', `
        <div class="status-line"><span class="dotmark"></span><span>Connected to ${esc(chosen)}</span></div>
        ${netAboutDetail(false)}
        <div class="btnrow" style="margin-top:22px">
          <button class="btn f" data-fid="done" data-act="done" data-first>Done</button>
          <button class="btn f" data-fid="check" data-act="check">Check connection</button>
        </div>`);
    }

    async function connectWired() {
      shell('Connecting', 'Set up connection', `
        <div style="display:flex;align-items:center;gap:18px;margin-top:20px">
          <div class="spin"></div><div class="t-row">Looking for a wired connection<span class="dots"></span></div>
        </div>`);
      await sleep(1500);
      Object.assign(State.network, {
        mode: 'wired', connected: true, internet: true, signal: 4,
        ip: '192.168.1.38', linkSpeed: '1000 Mbps',
      });
      save();
      shell('Connected', 'Set up connection', `
        <div class="status-line"><span class="dotmark"></span><span>Connected over Ethernet</span></div>
        ${netAboutDetail(false)}
        <div class="btnrow" style="margin-top:22px"><button class="btn f" data-fid="done" data-act="done" data-first>Done</button></div>`);
    }

    paintType();

    return {
      onFocus(node) { rail.onFocus(node); },
      select(node) {
        if (node.dataset.menu) {
          const [screen, arg] = MENU_TARGET[node.dataset.menu];
          if (screen === 'home') goHome(); else go(screen, arg, { replace: true });
          return;
        }
        if (node.dataset.type) {
          if (node.dataset.type === 'wired') { connectWired(); return; }
          stage = 'scan';
          paintScan();
          return;
        }
        if (node.dataset.rescan) { paintScan(); toast('Scanning'); return; }
        if (node.dataset.ssid) {
          chosen = node.dataset.ssid;
          const net = VISIBLE_NETWORKS.find(n => n.ssid === chosen);
          password = '';
          failure = '';
          if (net && !net.secure) { connect(); return; }
          stage = 'password';
          paintPassword();
          return;
        }
        if (node.dataset.ch) {
          password += node.dataset.ch;
          const keep = Focus.el && Focus.el.dataset.fid;
          paintPassword();
          const again = host.querySelector(`[data-fid="${CSS.escape(keep)}"]`);
          if (again) setFocus(again);
          return;
        }
        const act = node.dataset.act;
        if (act === 'shift') { shift = !shift; paintPassword(); return; }
        if (act === 'del') { password = password.slice(0, -1); paintPassword(); return; }
        if (act === 'clear') { password = ''; paintPassword(); return; }
        if (act === 'show') { toast(password ? `Password: ${password}` : 'Nothing typed yet'); return; }
        if (act === 'connect') { connect(); return; }
        if (act === 'check') { go('netcheck', null, { replace: true }); return; }
        if (act === 'done') back();
      },
      back() {
        if (stage === 'password') { stage = 'scan'; paintScan(); return true; }
        if (stage === 'scan') { stage = 'type'; paintType(); return true; }
        return false;
      },
      refocus() {},
    };
  },
});

/* ------------------------------------------------------- network connection reset */

async function confirmNetworkReset() {
  const answer = await dialog({
    title: 'Network connection reset',
    body: `<p>This forgets every wireless network and password stored on this device and then
      restarts it. Your account, your channels and every other setting are kept.</p>
      <p>You will need the Wi-Fi password again to reconnect.</p>`,
    actions: [{ id: 'cancel', label: 'Cancel' }, { id: 'reset', label: 'Reset connection' }],
  });
  if (answer !== 'reset') return;

  State.knownNetworks = [];
  Object.assign(State.network, { connected: false, internet: false, ssid: '', signal: 0, ip: '0.0.0.0' });
  save();
  runRestart('Network connection reset', () => {
    resetTo('netsetup');
    toast('Wireless networks forgotten — set up the connection again');
  });
}
