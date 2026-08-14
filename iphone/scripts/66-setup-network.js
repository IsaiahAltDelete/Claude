/* ===========================================================================
   Two troubleshooting flows the first pass did not have.

   1. A captive portal: Wi-Fi is joined and shows full bars, but nothing reaches
      the internet until the hotel/airport sign-in page is completed. It is the
      failure mode callers describe as "it says I'm connected but nothing
      works", and it needs its own state because every other offline mode
      correctly reports Wi-Fi as down.

   2. A Setup Assistant. Erase All Content and Settings used to reload straight
      onto a configured home screen, which is the one place the simulator ended
      somewhere a real phone never does. Now the erase leaves a marker and the
      assistant runs on the next boot.

   isOnline(), netReason() and setNetwork() are wrapped rather than rewritten,
   so the original behaviour is untouched for every other mode.
   =========================================================================== */

/* ======================================================== CAPTIVE PORTAL === */

/** True when Wi-Fi is up but the portal has not been completed. */
function captiveActive() {
  const settings = State.settings;
  return settings.network === 'captive' && !settings.airplane && Boolean(settings.wifi) && !settings.portalDone;
}

const baseIsOnline = isOnline;
isOnline = function isOnlineWithCaptive() {
  /* Behind a portal the radio is up and the bars are full, but nothing routes.
     Once the portal is completed the mode behaves like any other online state,
     which the base implementation already handles. */
  return captiveActive() ? false : baseIsOnline();
};

const baseNetReason = netReason;
netReason = function netReasonWithCaptive() {
  if (captiveActive()) {
    return `“${State.settings.wifiName}” requires you to sign in before you can use the internet. `
      + 'Open the sign-in page from the Wi-Fi notification, or in Settings › Wi-Fi.';
  }
  return baseNetReason();
};

const baseSetNetwork = setNetwork;
setNetwork = function setNetworkWithCaptive(mode) {
  if (mode !== 'captive') {
    State.settings.portalDone = false;
    baseSetNetwork(mode);
    return;
  }
  const settings = State.settings;
  settings.network = 'captive';
  settings.airplane = false;
  settings.wifi = true;
  settings.portalDone = false;
  settings.wifiName = 'MCO Airport Free WiFi';
  save();
  applyAppearance();
  renderCC();
  island('⚠', '#ff9f0a', 'Wi-Fi', 'Sign in to MCO Airport Free WiFi', 3200);
  pushNotification('settings', 'Wi-Fi', `Sign in to the network “${settings.wifiName}” to use the internet.`);
  setTimeout(() => captivePortalSheet(), 900);
};

/** The sign-in page a portal pushes at you. Accepts anything reasonable. */
function captivePortalSheet() {
  sheet(box => {
    box.style.padding = '0';
    const settings = State.settings;

    /* A portal is a web page, so it is drawn as one — chrome and all, because
       recognising that framing is half of diagnosing it. */
    box.appendChild(h(`<div style="display:flex;align-items:center;gap:8px;padding:12px 16px;
        border-bottom:.5px solid var(--sep);color:var(--txt2);font-size:12px">
        <span style="display:grid;place-items:center">${SF.wifi}</span>
        <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
          ${esc(settings.wifiName)}</span>
        <span style="color:var(--sysorange)">Not Secure</span></div>`));

    const page = el('div');
    page.style.cssText = 'padding:22px 20px 8px;text-align:center';
    page.innerHTML = `
      <div style="width:54px;height:54px;border-radius:14px;margin:0 auto 12px;
        background:linear-gradient(135deg,#0a84ff,#5e5ce6);display:grid;place-items:center;color:#fff">${SF.plane}</div>
      <div style="font-size:21px;font-weight:700">Orlando International</div>
      <div style="color:var(--txt2);font-size:14px;margin-top:4px;line-height:1.45">
        Complimentary Wi-Fi, 45 minutes. Accept the terms to continue.</div>`;
    box.appendChild(page);

    const form = el('div', 'grp');
    form.style.margin = '16px';
    const field = (label, placeholder, type) => {
      const row = el('div', 'compose-field');
      row.innerHTML = `<div class="k">${esc(label)}</div>`;
      const input = el('input');
      input.placeholder = placeholder;
      if (type) input.type = type;
      input.autocapitalize = 'off';
      row.appendChild(input);
      form.appendChild(row);
      return input;
    };
    const emailInput = field('Email', 'you@example.com');
    const roomInput = field('Flight', 'Optional');
    form.lastElementChild.style.borderBottom = 'none';
    box.appendChild(form);

    let accepted = false;
    const terms = makeRow({
      label: 'I accept the terms of use',
      chevron: false,
      onClick: row => {
        accepted = !accepted;
        row.querySelector('.check').textContent = accepted ? '☑' : '☐';
      },
    });
    terms.insertBefore(h('<div class="check" style="font-size:19px;margin-right:10px">☐</div>'), terms.firstChild);
    const termsGroup = el('div', 'grp');
    termsGroup.style.margin = '0 16px';
    termsGroup.appendChild(terms);
    box.appendChild(termsGroup);

    const connect = el('div');
    connect.style.padding = '16px';
    const button = el('button', 'btn-primary', 'Connect');
    button.onclick = () => {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput.value.trim())) { toast('Enter an email address'); return; }
      if (!accepted) { toast('Accept the terms to continue'); return; }
      button.innerHTML = '<div class="spinner" style="margin:0 auto;border-top-color:#fff"></div>';
      setTimeout(() => {
        State.settings.portalDone = true;
        save();
        closeOverlay();
        renderStatus();
        renderCC();
        island(SVG.wifi, '#30d158', 'Wi-Fi', 'Signed in — you are online', 2600);
      }, 1400);
      void roomInput;
    };
    connect.appendChild(button);
    box.appendChild(connect);

    const later = el('button', '', 'Not now');
    later.style.cssText = 'color:var(--txt2);font-size:15px;display:block;width:100%;padding:0 0 18px';
    later.onclick = closeOverlay;
    box.appendChild(later);
  }, { full: true });
}

/*
 * Settings › Wi-Fi is where a caller is told to look, so the way back into the
 * portal has to be there. wifiView is wrapped: the original view is built as
 * always, and the banner is prepended to whatever it produced.
 */
const baseWifiView = wifiView;
wifiView = function wifiViewWithPortal() {
  const view = baseWifiView();
  const build = view.build;
  view.build = function buildWithBanner(body, nav, self) {
    build.call(this, body, nav, self);
    if (!captiveActive()) return;
    const banner = h(`<div style="margin:10px 16px 0;padding:12px 14px;border-radius:12px;
      background:rgba(255,159,10,.16);border:.5px solid rgba(255,159,10,.45);font-size:13px;line-height:1.45">
      <b>Sign-in required.</b> “${esc(State.settings.wifiName)}” is connected but has no internet access until the
      sign-in page is completed.</div>`);
    const open = el('button', '', 'Open the sign-in page');
    open.style.cssText = 'color:var(--sysblue);font-size:13px;margin-top:8px;display:block';
    open.onclick = () => captivePortalSheet();
    banner.appendChild(open);
    body.insertBefore(banner, body.firstChild);
  };
  return view;
};

/*
 * Safari's offline page is headed "You Are Not Connected to the Internet",
 * which is the wrong story behind a portal — the phone is connected, the
 * traffic just is not routed yet. safariError is wrapped so that page retitles
 * itself and offers the way through.
 */
const baseSafariError = safariError;
safariError = function safariErrorWithPortal(title, message, url) {
  const page = baseSafariError(title, message, url);
  if (!captiveActive()) return page;
  const heading = page.querySelector('div:nth-child(2)');
  if (heading) heading.textContent = 'Sign In to Use This Network';
  const open = el('button', 'btn-primary', 'Open the Sign-In Page');
  open.style.maxWidth = '260px';
  open.onclick = () => captivePortalSheet();
  page.appendChild(open);
  return page;
};

/* ======================================================= SETUP ASSISTANT === */

const SETUP_STEPS = ['hello', 'language', 'appearance', 'wifi', 'privacy', 'faceid', 'passcode', 'account', 'location', 'siri', 'screentime', 'done'];

/** Marker left behind by an erase; the assistant runs while it is present. */
function setupPending() {
  try { return localStorage.getItem('iphone-sim-setup') === 'pending'; } catch (error) { return false; }
}

function markSetupPending() {
  try { localStorage.setItem('iphone-sim-setup', 'pending'); } catch (error) { /* private mode */ }
}

function clearSetupPending() {
  try { localStorage.removeItem('iphone-sim-setup'); } catch (error) { /* private mode */ }
}

/* Erase now leaves the marker, so the next boot runs setup rather than landing
   on a fully configured phone. */
const baseFactoryReset = factoryReset;
factoryReset = function factoryResetIntoSetup() {
  markSetupPending();
  baseFactoryReset();
};

function runSetupAssistant() {
  clearSetupPending();
  const choices = { language: 'English', region: 'United States', appearance: 'Dark', wifi: null, faceid: false, passcode: '', account: null, location: true, siri: true, screentime: false };

  const layer = el('div');
  layer.id = 'setupAssistant';
  layer.style.cssText = `position:absolute;inset:0;z-index:1800;background:var(--page);color:var(--txt);
    display:flex;flex-direction:column;overflow:hidden`;
  $('#screen').appendChild(layer);

  /* The assistant owns the screen: no home bar, no notifications, no apps. */
  $('#home').classList.add('blurred');
  locked = false;
  $('#lock').classList.add('hidden');
  $('#screen').classList.remove('locked');

  let step = 0;

  const shell = (title, subtitle, glyph) => {
    layer.innerHTML = '';
    const head = el('div');
    head.style.cssText = 'flex:none;padding:74px 30px 18px;text-align:center';
    head.innerHTML = `${glyph ? `<div style="display:grid;place-items:center;color:var(--sysblue);margin-bottom:16px">${glyph}</div>` : ''}
      <div style="font-size:27px;font-weight:700;letter-spacing:-.02em">${esc(title)}</div>
      ${subtitle ? `<div style="color:var(--txt2);font-size:14.5px;line-height:1.5;margin-top:10px">${esc(subtitle)}</div>` : ''}`;
    const body = el('div');
    body.style.cssText = 'flex:1;overflow-y:auto;padding-bottom:8px';
    const foot = el('div');
    foot.style.cssText = 'flex:none;padding:12px 20px 30px';
    layer.append(head, body, foot);
    return { body, foot };
  };

  const primary = (foot, label, onClick) => {
    const button = el('button', 'btn-primary', label);
    button.onclick = onClick;
    foot.appendChild(button);
    return button;
  };

  const secondary = (foot, label, onClick) => {
    const button = el('button', '', label);
    button.style.cssText = 'color:var(--sysblue);font-size:15px;display:block;width:100%;padding:14px 0 0';
    button.onclick = onClick;
    foot.appendChild(button);
    return button;
  };

  const next = () => { step += 1; render(); };

  function render() {
    const name = SETUP_STEPS[step];

    if (name === 'hello') {
      /* The greeting owns the whole layer rather than sitting on top of the
         standard shell, so there is exactly one thing to tap. */
      layer.innerHTML = '';
      const hello = el('button');
      hello.id = 'setupHello';
      hello.style.cssText = `flex:1;width:100%;display:grid;place-items:center;background:#000;color:#fff;
        border:0;font:inherit;cursor:pointer`;
      hello.innerHTML = `<div style="text-align:center">
        <div style="font-size:56px;font-weight:200;letter-spacing:-.03em">hello</div>
        <div style="opacity:.5;font-size:13px;margin-top:18px">tap to set up</div></div>`;
      hello.onclick = next;
      layer.appendChild(hello);
      return;
    }

    if (name === 'language') {
      const { body, foot } = shell('Select Your Language', 'This can be changed later in Settings.', SF.globe);
      group(body, {
        rows: ['English', 'Español', 'Français', 'Deutsch', '日本語'].map(language => ({
          label: language,
          value: choices.language === language ? '✓' : '',
          onClick: () => { choices.language = language; render(); },
        })),
      });
      group(body, {
        header: 'Country or Region',
        rows: ['United States', 'Canada', 'United Kingdom', 'Australia'].map(region => ({
          label: region,
          value: choices.region === region ? '✓' : '',
          onClick: () => { choices.region = region; render(); },
        })),
      });
      primary(foot, 'Continue', next);
      return;
    }

    if (name === 'appearance') {
      const { body, foot } = shell('Choose Your Look', 'Pick the appearance you prefer. You can change it any time.', SF.sun);
      const row = el('div');
      row.style.cssText = 'display:flex;gap:14px;padding:10px 20px';
      [['Light', '#f2f2f7', '#000'], ['Dark', '#1c1c1e', '#fff']].forEach(([label, background, colour]) => {
        const tile = el('button');
        const on = choices.appearance === label;
        tile.style.cssText = `flex:1;border-radius:16px;padding:14px 10px;background:${background};color:${colour};
          border:2px solid ${on ? 'var(--sysblue)' : 'transparent'}`;
        tile.innerHTML = `<div style="height:96px;border-radius:10px;background:${colour === '#fff' ? '#000' : '#fff'};
            border:.5px solid rgba(128,128,128,.4);margin-bottom:10px"></div>
          <div style="font-size:15px;font-weight:600">${label}</div>`;
        tile.onclick = () => {
          choices.appearance = label;
          State.settings.dark = label === 'Dark';
          save();
          applyAppearance();
          render();
        };
        row.appendChild(tile);
      });
      body.appendChild(row);
      primary(foot, 'Continue', next);
      return;
    }

    if (name === 'wifi') {
      const { body, foot } = shell('Choose a Wi-Fi Network', 'A connection is needed to activate this iPhone.', SF.wifi);
      if (choices.wifi) {
        /* The joined row is deliberately not tappable: a sheet opening over the
           Continue button is exactly the dead end this flow must not have. */
        const joined = el('div', 'grp');
        const row = el('div', 'row static');
        row.innerHTML = `<div style="display:grid;place-items:center;margin-right:10px;color:var(--sysblue)">${SF.wifi}</div>
          <div class="lbl"><div>${esc(choices.wifi)}</div><div class="sub">Connected</div></div>
          <div style="color:var(--sysgreen);font-size:13px">Joined</div>`;
        joined.appendChild(row);
        body.appendChild(joined);
      }
      group(body, {
        header: choices.wifi ? 'Other Networks' : 'Networks',
        rows: AIRWAVES.filter(air => air.ssid !== choices.wifi).slice(0, 6).map(air => ({
          icon: SF.wifi,
          iconBg: '#8e8e93',
          label: air.ssid,
          sub: air.sec === 'open' ? 'Open network' : air.sec,
          onClick: () => {
            if (air.sec === 'open') { join(air.ssid); return; }
            sheet(box => {
              box.appendChild(h(`<div style="font-size:19px;font-weight:700;margin-bottom:4px">Enter the password for “${esc(air.ssid)}”</div>
                <div style="color:var(--txt2);font-size:13px;margin-bottom:12px">Passwords for ${esc(air.sec)} networks are at least 8 characters.</div>`));
              const wrap = el('div', 'compose-field');
              const input = el('input');
              input.type = 'password';
              input.placeholder = 'Password';
              wrap.appendChild(input);
              box.appendChild(wrap);
              box.appendChild(primaryButton('Join', () => {
                if (input.value.length < 8) { toast('That password is too short'); return; }
                closeOverlay();
                join(air.ssid);
              }));
              setTimeout(() => input.focus(), 320);
            });
          },
        })),
      });
      body.appendChild(h(`<div class="grp-f">Any password of 8 characters or more is accepted — this simulator
        never contacts a real network.</div>`));

      const button = primary(foot, 'Continue', () => {
        if (!choices.wifi) { toast('Join a network to continue'); return; }
        State.settings.wifi = true;
        State.settings.wifiName = choices.wifi;
        State.settings.network = 'online';
        save();
        renderStatus();
        next();
      });
      button.style.opacity = choices.wifi ? '1' : '.45';
      secondary(foot, 'Use Cellular Connection', () => {
        choices.wifi = null;
        State.settings.wifi = false;
        State.settings.cellular = true;
        State.settings.network = 'online';
        save();
        renderStatus();
        next();
      });

      function join(ssid) {
        choices.wifi = ssid;
        render();
        island(SVG.wifi, '#0a84ff', 'Wi-Fi', `Joined ${ssid}`, 2000);
      }
      return;
    }

    if (name === 'privacy') {
      const { body, foot } = shell('Data & Privacy', '', SF.hand);
      body.appendChild(h(`<div style="padding:4px 26px;color:var(--txt2);font-size:14.5px;line-height:1.6">
        This icon appears when an Apple feature asks to use your personal information.<br><br>
        You will see it before that information is collected or used.<br><br>
        This simulator collects nothing at all. Everything it shows is generated on
        this device and stored only in this browser.</div>`));
      primary(foot, 'Continue', next);
      return;
    }

    if (name === 'faceid') {
      const { body, foot } = shell('Face ID', 'Use Face ID to unlock the iPhone and authorise purchases.', SF.faceid);
      body.appendChild(h(`<div style="display:grid;place-items:center;padding:16px 0 8px">
        <div style="width:170px;height:170px;border-radius:50%;border:3px dashed var(--sysblue);
          display:grid;place-items:center;color:var(--sysblue)">${sf('<circle cx="12" cy="8" r="3.8"/><path d="M4.6 20.4a7.4 7.4 0 0114.8 0"/>', { size: 76 })}</div></div>`));
      primary(foot, choices.faceid ? 'Continue' : 'Set Up Face ID', () => {
        if (choices.faceid) { next(); return; }
        choices.faceid = true;
        State.settings.faceid = true;
        save();
        island(SF.faceid, '#30d158', 'Face ID', 'Face ID is set up', 2000);
        render();
      });
      secondary(foot, 'Set Up Later in Settings', () => { State.settings.faceid = false; save(); next(); });
      return;
    }

    if (name === 'passcode') {
      const { body, foot } = shell('Create a Passcode', 'A passcode protects the data on the iPhone.', SF.lock);
      const dots = el('div');
      dots.style.cssText = 'display:flex;gap:16px;justify-content:center;padding:20px 0 26px';
      const paintDots = () => {
        dots.innerHTML = '';
        for (let index = 0; index < 6; index += 1) {
          const dot = el('div');
          dot.style.cssText = `width:14px;height:14px;border-radius:50%;border:1.5px solid var(--txt);
            background:${index < choices.passcode.length ? 'var(--txt)' : 'transparent'}`;
          dots.appendChild(dot);
        }
      };
      paintDots();
      body.appendChild(dots);

      const pad = el('div');
      pad.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:14px;padding:0 44px';
      ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].forEach(key => {
        if (!key) { pad.appendChild(el('div')); return; }
        const button = el('button', '', key);
        button.style.cssText = `height:64px;border-radius:50%;background:var(--bg3);color:var(--txt);
          font-size:26px;font-weight:400`;
        button.onclick = () => {
          if (key === '⌫') choices.passcode = choices.passcode.slice(0, -1);
          else if (choices.passcode.length < 6) choices.passcode += key;
          paintDots();
          if (choices.passcode.length === 6) {
            State.settings.passcode = choices.passcode;
            save();
            setTimeout(next, 260);
          }
        };
        pad.appendChild(button);
      });
      body.appendChild(pad);
      secondary(foot, 'Passcode Options', () => toast('Only a 6-digit passcode is simulated'));
      secondary(foot, 'Set Up Later in Settings', () => { choices.passcode = ''; next(); });
      return;
    }

    if (name === 'account') {
      const { body, foot } = shell('Apple Account', 'Sign in to use iCloud, the App Store and Messages.', SF.cloud);
      const form = el('div', 'grp');
      form.style.margin = '10px 16px';
      const field = (label, placeholder, type) => {
        const row = el('div', 'compose-field');
        row.innerHTML = `<div class="k" style="min-width:78px">${esc(label)}</div>`;
        const input = el('input');
        input.placeholder = placeholder;
        if (type) input.type = type;
        input.autocapitalize = 'off';
        row.appendChild(input);
        form.appendChild(row);
        return input;
      };
      const nameInput = field('Name', 'Jane Appleseed');
      const emailInput = field('Email', 'you@icloud.com');
      const passwordInput = field('Password', 'Required', 'password');
      form.lastElementChild.style.borderBottom = 'none';
      body.appendChild(form);
      body.appendChild(h(`<div class="grp-f">Any address works — the simulator never contacts Apple. Whatever you
        enter becomes the account shown throughout Settings.</div>`));

      primary(foot, 'Sign In', () => {
        if (!nameInput.value.trim()) { toast('Enter a name'); return; }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput.value.trim())) { toast('Enter a valid email'); return; }
        if (!passwordInput.value) { toast('Enter a password'); return; }
        const email = emailInput.value.trim().toLowerCase();
        const account = {
          id: Date.now(),
          name: nameInput.value.trim(),
          email,
          initials: nameInput.value.trim().split(/\s+/).map(word => word[0]).join('').slice(0, 2).toUpperCase(),
          color: 'linear-gradient(135deg,#5e5ce6,#0a84ff)',
          storage: 4.2,
          plan: '5 GB',
        };
        const accounts = ACC();
        accounts.list = [account];
        accounts.signedIn = account.id;
        State.settings.appleID = email;
        State.settings.name = `${account.name.split(/\s+/)[0]}’s iPhone`;
        choices.account = email;
        save();
        next();
      });
      secondary(foot, 'Set Up Later in Settings', next);
      return;
    }

    if (name === 'location') {
      const { body, foot } = shell('Location Services', 'Apps can ask to use your location for directions and weather.', SF.compass);
      group(body, {
        rows: [
          { label: 'Enable Location Services', toggle: () => choices.location, onToggle: value => { choices.location = value; } },
        ],
        footer: 'Nothing is actually located — Maps opens a real map, everything else uses Orlando as a fixed point.',
      });
      primary(foot, 'Continue', next);
      return;
    }

    if (name === 'siri') {
      const { body, foot } = shell('Siri & Apple Intelligence', 'Ask Siri to send messages, set reminders and more.', SF.sparkles);
      group(body, {
        rows: [
          { label: 'Enable Apple Intelligence', toggle: () => choices.siri, onToggle: value => { choices.siri = value; State.settings.appleIntelligence = value; save(); } },
        ],
        footer: 'Requests are simulated locally; no audio is captured and nothing is sent anywhere.',
      });
      primary(foot, 'Continue', next);
      return;
    }

    if (name === 'screentime') {
      const { body, foot } = shell('Screen Time', 'See weekly reports and set limits for what you want to manage.', SF.hourglass);
      group(body, {
        rows: [
          { label: 'Turn On Screen Time', toggle: () => choices.screentime, onToggle: value => { choices.screentime = value; } },
        ],
      });
      primary(foot, 'Continue', next);
      return;
    }

    /* done */
    const { body, foot } = shell('Welcome to iPhone', '', '');
    body.appendChild(h(`<div style="display:grid;place-items:center;padding:10px 0 18px;color:var(--sysblue)">
      ${sf('<path d="M4 12.5l5 5L20 6.5"/>', { w: 2.2, size: 84 })}</div>
      <div style="padding:0 30px;color:var(--txt2);font-size:14.5px;line-height:1.6;text-align:center">
        Setup is complete.<br><br>
        ${choices.wifi ? `Wi-Fi: ${esc(choices.wifi)}` : 'Using cellular data'}<br>
        ${choices.account ? `Signed in as ${esc(choices.account)}` : 'No Apple Account'}<br>
        Face ID ${choices.faceid ? 'on' : 'off'} · Passcode ${choices.passcode ? 'set' : 'not set'}
      </div>`));
    primary(foot, 'Get Started', () => {
      layer.remove();
      $('#home').classList.remove('blurred');
      renderHome();
      renderStatus();
      renderCC();
      island('👋', '#0a84ff', State.settings.name || 'iPhone', 'Setup complete', 2600);
    });
  }

  render();
}

/* setupPending() is checked by scripts/70-boot.js once the splash has played,
   so the whole startup order stays readable in one place. runSetupAssistant is
   also callable from the console to replay the flow on demand. */

/* ============================================== wiring into the Sim panel === */

/*
 * The outside-the-device control panel is where scenarios are staged, so the
 * two new ones belong there. renderPanel is wrapped: it rebuilds its own markup
 * from scratch every call, so the extra controls are appended afterwards and
 * re-appended on every render.
 */
Sim.captive = function captiveScenario() {
  setNetwork('captive');
  this.log('Scenario: captive portal — joined, no internet until sign-in');
  renderPanel();
};

Sim.setup = function setupScenario() {
  this.log('Running Setup Assistant');
  if ($('#setupAssistant')) $('#setupAssistant').remove();
  goHome();
  runSetupAssistant();
};

const baseRenderPanel = renderPanel;
renderPanel = function renderPanelWithScenarios() {
  baseRenderPanel();
  const panel = $('.deck-inner');
  if (!panel) return;

  const netSeg = $('#netseg', panel);
  if (netSeg) {
    const button = el('button', State.settings.network === 'captive' ? 'on' : '', 'Portal');
    button.title = 'Joined a network that needs a sign-in page';
    button.onclick = () => Sim.captive();
    netSeg.appendChild(button);
  }

  /* The two new scenario buttons sit with the existing "can't connect" one. */
  const scenarios = netSeg && netSeg.nextElementSibling;
  if (scenarios && scenarios.classList.contains('pbtns')) {
    if (captiveActive()) {
      const open = el('button', 'pbtn blue wide', '🔓 Open the Wi-Fi sign-in page');
      open.onclick = () => captivePortalSheet();
      scenarios.appendChild(open);
    }
    const setup = el('button', 'pbtn wide', '⟳ Run Setup Assistant');
    setup.onclick = () => Sim.setup();
    scenarios.appendChild(setup);
  }

  const log = $('#simlog', panel);
  if (log && captiveActive()) {
    const note = el('div', 'pnote');
    note.style.margin = '0 0 8px';
    note.innerHTML = 'Wi-Fi shows full bars and Settings shows it as connected — '
      + 'but Safari, Mail and the App Store all fail until the portal is completed.';
    panel.insertBefore(note, log);
  }
};

