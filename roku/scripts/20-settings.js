/* ===========================================================================
   Settings.

   The whole tree is one data structure. A node is a row; it either drills in
   (children), runs something (act), or is a choice in a list (set/choose).
   Because drilling in pushes a screen, Back walks back out of the tree without
   any per-screen bookkeeping, and the breadcrumb is just the path.

   Values read from State every time they are drawn, so a setting changed
   three menus deep is correct the moment you walk back up.
   =========================================================================== */

'use strict';

const onOff = value => (value ? 'On' : 'Off');

/** A row that flips a boolean. */
function toggleNode(id, label, get, set, detail) {
  return {
    id, label,
    value: () => onOff(get()),
    detail,
    act() { set(!get()); save(); renderTop(); },
  };
}

/**
 * A row that drills into a list of choices, each ticked when current. Roku
 * always shows the chosen value on the parent row, which is why `value` is
 * wired up here rather than left to the caller.
 */
function choiceNode(id, label, options, get, set, { detail, note } = {}) {
  const nameOf = v => {
    const found = options.find(o => o.id === v);
    return found ? found.name : String(v);
  };
  return {
    id, label,
    value: () => nameOf(get()),
    detail: detail || (() => {
      const current = options.find(o => o.id === get()) || {};
      const blurb = current.detail || current.desc || '';
      return `<div class="det-title">${esc(label)}</div>
        <div class="det-desc">Currently set to <b>${esc(nameOf(get()))}</b>.</div>
        ${blurb ? `<div class="det-desc">${esc(blurb)}</div>` : ''}
        ${note ? `<div class="det-note">${note}</div>` : ''}`;
    }),
    children: () => options.map(opt => ({
      id: String(opt.id),
      label: opt.name,
      isSet: () => get() === opt.id,
      detail: () => `<div class="det-title">${esc(opt.name)}</div>
        <div class="det-desc">${esc(opt.detail || opt.desc || '')}</div>`,
      act() { set(opt.id); save(); toast(`${label}: ${opt.name}`); back(); },
    })),
  };
}

/* -------------------------------------------------------------- detail panes */

function netDetail() {
  const n = State.network;
  const wired = n.mode === 'wired';
  const state = !n.connected ? 'bad' : (!n.internet ? 'warn' : '');
  const label = !n.connected ? 'Not connected'
    : (!n.internet ? 'Connected to the network, but not to the internet' : 'Connected');

  return `<div class="det-title">Network</div>
    <div class="status-line ${state}"><span class="dotmark"></span><span>${esc(label)}</span></div>
    <dl class="facts">
      <div class="fact"><dt>Connection</dt><dd>${wired ? 'Wired' : 'Wireless'}</dd></div>
      ${wired ? '' : `<div class="fact"><dt>Network name</dt><dd>${esc(n.ssid)}</dd></div>
      <div class="fact"><dt>Signal strength</dt><dd>${BARS(n.signal, n.signal <= 2)} ${['None', 'Poor', 'Fair', 'Good', 'Excellent'][n.signal]}</dd></div>`}
      <div class="fact"><dt>IP address</dt><dd class="mono">${esc(n.ip)}</dd></div>
    </dl>
    <div class="det-note">Press <b>OK</b> on <b>Check connection</b> to test the link
      to the router and to the internet, one step at a time.</div>`;
}

function aboutDeviceDetail() {
  const up = Date.now() - State.bootedAt;
  const n = State.network;
  return `<div class="det-title">About</div>
    <dl class="facts">
      <div class="fact"><dt>Device name</dt><dd>${esc(State.deviceName)}</dd></div>
      <div class="fact"><dt>Model</dt><dd>${esc(State.model)} (${esc(State.modelNumber)})</dd></div>
      <div class="fact"><dt>Serial number</dt><dd class="mono">${esc(State.serial)}</dd></div>
      <div class="fact"><dt>Device ID</dt><dd class="mono">${esc(State.deviceId)}</dd></div>
      <div class="fact"><dt>Software version</dt><dd class="mono">${esc(State.software.version)} build ${esc(State.software.build)}</dd></div>
      <div class="fact"><dt>Update channel</dt><dd>${esc(State.software.channel)}</dd></div>
      <div class="fact"><dt>Network</dt><dd>${n.mode === 'wired' ? 'Wired' : esc(n.ssid)}</dd></div>
      <div class="fact"><dt>IP address</dt><dd class="mono">${esc(n.ip)}</dd></div>
      <div class="fact"><dt>Wireless MAC</dt><dd class="mono">${esc(n.macWireless)}</dd></div>
      <div class="fact"><dt>Wired MAC</dt><dd class="mono">${esc(n.macWired)}</dd></div>
      <div class="fact"><dt>Uptime</dt><dd>${esc(fmtUptime(up))}</dd></div>
    </dl>
    <div class="det-note">Read the serial number and software version out of here when
      you are asked for them — they are the two a support call always needs.</div>`;
}

function remoteDetail() {
  const r = State.remote;
  return `<div class="det-title">${esc(r.kind)}</div>
    <div class="status-line ${r.paired ? '' : 'bad'}"><span class="dotmark"></span>
      <span>${r.paired ? 'Paired and connected' : 'Not paired'}</span></div>
    <dl class="facts">
      <div class="fact"><dt>Battery</dt><dd>${r.battery}%</dd></div>
      <div class="fact"><dt>Firmware</dt><dd class="mono">${esc(r.firmware)}</dd></div>
      <div class="fact"><dt>Connection</dt><dd>${esc(r.protocol)}</dd></div>
      <div class="fact"><dt>Paired</dt><dd>${esc(r.lastPaired)}</dd></div>
    </dl>
    <div class="meter ${r.battery > 25 ? 'good' : 'warn'}"><i style="width:${r.battery}%"></i></div>`;
}

/* ------------------------------------------------------------------ the tree */

function settingsTree() {
  const S = State;

  return {
    id: 'root',
    label: 'Settings',
    children: () => [

      /* ---------------------------------------------------------- Network */
      {
        id: 'network', label: 'Network', value: () => (S.network.connected ? (S.network.mode === 'wired' ? 'Wired' : S.network.ssid) : 'Not connected'),
        detail: netDetail,
        children: () => [
          { id: 'about', label: 'About', detail: netAboutDetail, act() { toast('Network details are shown on the right'); } },
          { id: 'check', label: 'Check connection', detail: () => `<div class="det-title">Check connection</div>
              <div class="det-desc">Runs three tests in order: this device to your router,
                your router to the internet, and then a download speed test.</div>
              <div class="det-note">This is the first thing to run when anything streams badly.</div>`,
            act() { go('netcheck'); } },
          { id: 'setup', label: 'Set up connection', detail: () => `<div class="det-title">Set up connection</div>
              <div class="det-desc">Join a different wireless network, or switch to a wired
                connection. The current connection stays up until the new one succeeds.</div>`,
            act() { go('netsetup'); } },
          toggleNode('saver', 'Bandwidth saver', () => S.bandwidthSaver, v => { S.bandwidthSaver = v; },
            () => `<div class="det-title">Bandwidth saver</div>
              <div class="det-desc">Stops streaming after four hours without a button press,
                so a channel left running overnight does not keep using data.</div>`),
        ],
      },

      /* ------------------------------------------------ Remotes & devices */
      {
        id: 'remotes', label: 'Remotes & devices', value: () => (S.remote.paired ? '1 remote' : 'No remote paired'),
        detail: () => `<div class="det-title">Remotes &amp; devices</div>
          <div class="det-desc">Pair a remote, check its battery and firmware, or connect
            headphones and speakers over Bluetooth.</div>`,
        children: () => [
          { id: 'remote', label: S.remote.kind, value: () => `${S.remote.battery}%`, detail: remoteDetail,
            children: () => [
              { id: 'rename', label: 'Rename remote', detail: () => '<div class="det-title">Rename remote</div><div class="det-desc">Useful when a household has more than one.</div>',
                act() { renameRemote(); } },
              { id: 'fw', label: 'Check for remote firmware update', detail: () => `<div class="det-title">Remote firmware</div>
                  <div class="det-desc">Currently ${esc(S.remote.firmware)}. Updates are rare and
                    fix pairing and battery reporting.</div>`,
                act() { checkRemoteFirmware(); } },
              { id: 'forget', label: 'Unpair remote', detail: () => `<div class="det-title">Unpair remote</div>
                  <div class="det-desc">Forgets this remote. You will need to pair it again,
                    or use the mobile app, to control this device.</div>
                  <div class="det-note warn">Only do this if the remote is misbehaving —
                    without a paired remote the buttons on the box are the only way back.</div>`,
                act() { unpairRemote(); } },
            ] },
          { id: 'pair', label: 'Pair new device', detail: () => `<div class="det-title">Pair new device</div>
              <div class="det-desc">Hold the pairing button inside the battery compartment for
                five seconds, until the light flashes.</div>
              <div class="det-note">The pairing button is under the remote in this simulator —
                the small <b>Pair</b> control below it.</div>`,
            act() { startPairing(); } },
          { id: 'bt', label: 'Bluetooth devices', value: () => 'None paired',
            detail: () => `<div class="det-title">Bluetooth devices</div>
              <div class="det-desc">Nothing is paired. Headphones and speakers connect here;
                private listening through the mobile app does not need pairing.</div>`,
            act() { toast('No Bluetooth devices found'); } },
          { id: 'tvctl', label: 'Set up remote for TV control', detail: () => `<div class="det-title">TV control</div>
              <div class="det-desc">Teaches the remote the power and volume codes for your
                television, so one remote does both.</div>`,
            act() { setUpTvControl(); } },
        ],
      },

      /* ------------------------------------------------------------ Theme */
      {
        id: 'theme', label: 'Theme', value: () => (THEMES.find(t => t.id === S.theme) || {}).name,
        detail: () => `<div class="det-title">Theme</div>
          <div class="det-desc">Changes the background and the colour of the highlight.
            It never changes where anything is.</div>
          <div class="themegrid">${THEMES.map(themeSwatch).join('')}</div>`,
        children: () => [
          choiceNode('themes', 'Themes', THEMES.map(t => ({ id: t.id, name: t.name, detail: 'Applies immediately.' })),
            () => S.theme, v => { S.theme = v; applyTheme(); }, {
              detail: () => `<div class="det-title">Themes</div>
                <div class="det-desc">Currently <b>${esc((THEMES.find(t => t.id === S.theme) || {}).name)}</b>.
                  A theme only changes the backdrop and the colour of the highlight.</div>
                <div class="themegrid">${THEMES.map(themeSwatch).join('')}</div>`,
            }),
          choiceNode('saver', 'Screensavers', SCREENSAVERS.map(s => ({ id: s.id, name: s.name, detail: s.desc })),
            () => S.screensaver, v => { S.screensaver = v; },
            { note: 'The screensaver never covers something that is playing.' }),
          choiceNode('wait', 'Wait time', SAVER_WAITS.map(w => ({ id: w.id, name: w.name })),
            () => S.screensaverWait, v => { S.screensaverWait = v; },
            { note: 'The screensaver starts after this long with no button pressed.' }),
          { id: 'preview', label: 'Preview screensaver', detail: () => '<div class="det-title">Preview</div><div class="det-desc">Shows the screensaver until you press a button.</div>',
            act() { startScreensaver(true); } },
        ],
      },

      /* ------------------------------------------------------------ Audio */
      {
        id: 'audio', label: 'Audio', value: () => (AUDIO_MODES.find(m => m.id === S.audio.mode) || {}).name,
        detail: () => `<div class="det-title">Audio</div>
          <div class="det-desc">If there is no sound at all, set both HDMI and the audio mode
            back to Stereo — that rules out a receiver that cannot decode the surround format
            being sent to it.</div>`,
        children: () => [
          choiceNode('mode', 'Audio mode', AUDIO_MODES, () => S.audio.mode, v => { S.audio.mode = v; }),
          choiceNode('hdmi', 'HDMI', AUDIO_MODES, () => S.audio.hdmi, v => { S.audio.hdmi = v; },
            { note: 'Set this to <b>PCM-Stereo</b> when a soundbar plays nothing but menu clicks.' }),
          choiceNode('vmode', 'Volume mode', VOLUME_MODES, () => S.audio.volumeMode, v => { S.audio.volumeMode = v; },
            { note: 'Leveling evens out loud adverts; Night also lifts quiet dialogue.' }),
          toggleNode('autolevel', 'Automatic volume levelling', () => S.audio.autoLevel, v => { S.audio.autoLevel = v; },
            () => '<div class="det-title">Automatic volume levelling</div><div class="det-desc">Keeps the level steady between channels.</div>'),
        ],
      },

      /* ----------------------------------------------------- Display type */
      choiceNode('display', 'Display type', DISPLAY_TYPES, () => S.display.type, v => {
        S.display.type = v;
        S.display.resolved = v === 'auto' ? '4K HDR 60Hz' : (DISPLAY_TYPES.find(d => d.id === v) || {}).name;
        S.display.hdr = v === 'auto' || v === '4khdr';
      }, {
        detail: () => `<div class="det-title">Display type</div>
          <div class="det-desc">Currently <b>${esc(S.display.resolved)}</b>.</div>
          <dl class="facts">
            <div class="fact"><dt>Resolution</dt><dd>${S.display.hdr ? '3840 x 2160' : '1920 x 1080'}</dd></div>
            <div class="fact"><dt>Refresh rate</dt><dd>${esc(S.display.refresh)}</dd></div>
            <div class="fact"><dt>HDR</dt><dd>${S.display.hdr ? 'HDR10 available' : 'Not in use'}</dd></div>
            <div class="fact"><dt>HDCP</dt><dd>2.2 authenticated</dd></div>
          </dl>
          <div class="det-note warn">If the picture drops out when a film starts, step this
            down to <b>1080p</b> — that is almost always an HDMI cable that cannot carry 4K.</div>`,
      }),

      /* ------------------------------------------------- Parental controls */
      {
        id: 'parental', label: 'Parental controls', value: () => (S.parental.pin ? 'PIN set' : 'No PIN'),
        detail: () => `<div class="det-title">Parental controls</div>
          <div class="det-desc">A four-digit PIN can be required before anything is bought,
            or before any channel is added.</div>`,
        children: () => [
          { id: 'pin', label: S.parental.pin ? 'Change PIN' : 'Create PIN',
            detail: () => '<div class="det-title">PIN</div><div class="det-desc">Four digits. Keep it away from the remote.</div>',
            act() { setParentalPin(); } },
          choiceNode('scope', 'When to ask for the PIN', [
            { id: 'off', name: 'Never', detail: 'Nothing is protected.' },
            { id: 'buy', name: 'Before every purchase', detail: 'Rentals and subscriptions ask first.' },
            { id: 'all', name: 'Before adding any channel', detail: 'Even free channels ask first.' },
          ], () => S.parental.pinScope, v => { S.parental.pinScope = v; }),
        ],
      },

      /* ----------------------------------------------------- Accessibility */
      {
        id: 'access', label: 'Accessibility', value: () => (S.accessibility.audioGuide ? 'Audio guide on' : ''),
        detail: () => `<div class="det-title">Accessibility</div>
          <div class="det-desc">Captions, the audio guide that reads the interface aloud, and
            how fast it speaks.</div>`,
        children: () => [
          choiceNode('cc', 'Captions mode', CAPTION_MODES, () => S.accessibility.captions, v => { S.accessibility.captions = v; },
            { note: '“On replay” only shows captions while you skip back, which catches a line of dialogue without leaving them on.' }),
          choiceNode('ccstyle', 'Caption style', [
            { id: 'default', name: 'Default' }, { id: 'large', name: 'Large text' },
            { id: 'boxed', name: 'White on black box' }, { id: 'yellow', name: 'Yellow text' },
          ], () => S.accessibility.captionStyle, v => { S.accessibility.captionStyle = v; }),
          toggleNode('guide', 'Audio guide', () => S.accessibility.audioGuide, v => { S.accessibility.audioGuide = v; },
            () => `<div class="det-title">Audio guide</div>
              <div class="det-desc">Reads menus and buttons aloud. On a real device this is
                also the shortcut nobody means to press — four taps of <b>*</b> turns it on.</div>`),
          choiceNode('rate', 'Speech rate', [
            { id: 'slow', name: 'Slow' }, { id: 'normal', name: 'Normal' },
            { id: 'fast', name: 'Fast' }, { id: 'veryfast', name: 'Very fast' },
          ], () => S.accessibility.speechRate, v => { S.accessibility.speechRate = v; }),
        ],
      },

      /* ------------------------------------------------------- Home screen */
      {
        id: 'homescreen', label: 'Home screen', value: () => `${MENU.length - State.hiddenMenu.length} of ${MENU.length} shown`,
        detail: () => `<div class="det-title">Home screen</div>
          <div class="det-desc">Hide the sections of the menu you never use. Home, Search,
            Streaming Channels and Settings always stay.</div>`,
        children: () => MENU
          .filter(m => !['home', 'search', 'store', 'settings'].includes(m.id))
          .map(m => toggleNode(m.id, m.name,
            () => !State.hiddenMenu.includes(m.id),
            v => {
              State.hiddenMenu = v
                ? State.hiddenMenu.filter(id => id !== m.id)
                : [...State.hiddenMenu, m.id];
            },
            () => `<div class="det-title">${esc(m.name)}</div>
              <div class="det-desc">${State.hiddenMenu.includes(m.id) ? 'Hidden from the menu.' : 'Shown in the menu.'}</div>`)),
      },

      /* -------------------------------------------------------- Guest Mode */
      {
        id: 'guest', label: 'Guest Mode', value: () => onOff(S.guestMode),
        detail: () => `<div class="det-title">Guest Mode</div>
          <div class="det-desc">Lets a visitor sign in to their own subscriptions without
            touching yours. Everything they signed in to is signed out again when Guest Mode
            ends, which needs the PIN set here.</div>`,
        children: () => [
          { id: 'toggle', label: S.guestMode ? 'Turn off Guest Mode' : 'Turn on Guest Mode',
            detail: () => `<div class="det-title">${S.guestMode ? 'Ending' : 'Starting'} Guest Mode</div>
              <div class="det-desc">${S.guestMode
                ? 'Signs out every account added during the visit.'
                : 'You will be asked for a four-digit PIN. It is needed to turn Guest Mode off again.'}</div>`,
            act() { toggleGuestMode(); } },
        ],
      },

      /* ----------------------------------------------------------- Privacy */
      {
        id: 'privacy', label: 'Privacy',
        detail: () => `<div class="det-title">Privacy</div>
          <div class="det-desc">What this device is allowed to collect and share.</div>`,
        children: () => [
          toggleNode('ads', 'Limit ad tracking', () => !S.privacy.personalisedAds, v => { S.privacy.personalisedAds = !v; },
            () => `<div class="det-title">Limit ad tracking</div>
              <div class="det-desc">Ads still appear; they stop being chosen from what has
                been watched on this device.</div>`),
          { id: 'resetad', label: 'Reset advertising identifier',
            detail: () => '<div class="det-title">Reset advertising identifier</div><div class="det-desc">Gives this device a new advertising ID, as if it were new.</div>',
            act() { toast('Advertising identifier reset'); } },
          toggleNode('mic', 'Channel microphone access', () => S.privacy.microphone, v => { S.privacy.microphone = v; },
            () => '<div class="det-title">Microphone access</div><div class="det-desc">Whether channels may ask to use the remote microphone.</div>'),
          toggleNode('acr', 'Smart TV experience', () => S.privacy.smartTv, v => { S.privacy.smartTv = v; },
            () => `<div class="det-title">Smart TV experience</div>
              <div class="det-desc">Uses what is playing on other inputs to suggest things to
                watch. Off by default in this simulator.</div>`),
        ],
      },

      /* ------------------------------------------------------------ Search */
      {
        id: 'search', label: 'Search', value: () => `${S.searchHistory.length} recent`,
        detail: () => `<div class="det-title">Search</div>
          <div class="det-desc">Recent searches appear on the search screen until they are
            cleared here.</div>`,
        children: () => [
          { id: 'clear', label: 'Clear personal search results',
            detail: () => `<div class="det-title">Clear searches</div>
              <div class="det-desc">${S.searchHistory.length ? `${S.searchHistory.length} searches are stored.` : 'Nothing is stored.'}</div>`,
            act() { State.searchHistory = []; save(); toast('Search history cleared'); renderTop(); } },
        ],
      },

      /* ------------------------------------------------------ Legal notice */
      {
        id: 'legal', label: 'Legal notice',
        detail: () => `<div class="det-title">Legal notice</div>
          <div class="det-desc">This is an independent educational simulation built for
            support training. It is not a Roku product and is not affiliated with, endorsed by
            or connected to Roku, Inc.</div>
          <div class="det-desc">Every streaming service, programme, person, network and serial
            number in it is invented. Nothing here reads or changes a real device, network or
            account — all of it lives in this page's local storage, and Factory reset clears it.</div>`,
        act() { toast('Nothing further to show'); },
      },

      /* ------------------------------------------------------------ System */
      {
        id: 'system', label: 'System', value: () => `Roku OS ${S.software.version}`,
        detail: () => `<div class="det-title">System</div>
          <div class="det-desc">Device information, time, power, updates and the advanced
            settings — including restart and factory reset.</div>`,
        children: () => [
          { id: 'about', label: 'About', detail: aboutDeviceDetail, act() { toast('Device details are shown on the right'); } },

          { id: 'time', label: 'Time', value: () => S.system.timeZone,
            detail: () => `<div class="det-title">Time</div>
              <div class="det-desc">The clock is set from the network. The time zone only
                affects how it is displayed.</div>`,
            children: () => [
              choiceNode('tz', 'Time zone', TIME_ZONES.map(t => ({ id: t, name: t })),
                () => S.system.timeZone, v => { S.system.timeZone = v; }),
              choiceNode('fmt', 'Clock format', [
                { id: true, name: '12-hour' }, { id: false, name: '24-hour' },
              ], () => S.system.clock12, v => { S.system.clock12 = v; }),
            ] },

          choiceNode('mirror', 'Screen mirroring', [
            { id: 'prompt', name: 'Prompt', detail: 'Ask every time a phone or laptop tries to mirror.' },
            { id: 'always', name: 'Always allow', detail: 'Never ask.' },
            { id: 'never', name: 'Never allow', detail: 'Refuse silently.' },
          ], () => S.system.screenMirroring, v => { S.system.screenMirroring = v; }),

          { id: 'power', label: 'Power',
            detail: () => `<div class="det-title">Power</div>
              <div class="det-desc">Standby behaviour, and the two things a support call reaches
                for first — a system restart and a full power off.</div>`,
            children: () => [
              toggleNode('fast', 'Fast TV start', () => S.system.fastStart, v => { S.system.fastStart = v; },
                () => `<div class="det-title">Fast TV start</div>
                  <div class="det-desc">Keeps enough of the system awake in standby that it wakes
                    instantly. Uses a little more power.</div>`),
              toggleNode('led', 'Standby LED', () => S.system.standbyLed, v => { S.system.standbyLed = v; },
                () => '<div class="det-title">Standby LED</div><div class="det-desc">The small light on the front while the box is asleep.</div>'),
              toggleNode('nosig', 'Auto power savings — no signal', () => S.system.autoPowerNoSignal, v => { S.system.autoPowerNoSignal = v; },
                () => '<div class="det-title">No signal</div><div class="det-desc">Sleeps after fifteen minutes with nothing on the input.</div>'),
              choiceNode('idle', 'Auto power savings — idle', IDLE_POWER.map(t => ({ id: t, name: t })),
                () => S.system.autoPowerIdle, v => { S.system.autoPowerIdle = v; }),
              { id: 'restart', label: 'System restart',
                detail: () => `<div class="det-title">System restart</div>
                  <div class="det-desc">Shuts the software down cleanly and starts it again.
                    Nothing is lost — channels, accounts and settings all stay.</div>
                  <div class="det-note">This clears most streaming and remote faults on its own.
                    Try it before anything else.</div>`,
                act() { confirmRestart(); } },
              { id: 'off', label: 'Power off',
                detail: () => `<div class="det-title">Power off</div>
                  <div class="det-desc">Puts the device into standby. Press the power button on
                    the remote to bring it back.</div>`,
                act() { confirmPowerOff(); } },
            ] },

          { id: 'cec', label: 'Control other devices (CEC)', value: () => onOff(S.system.cec),
            detail: () => `<div class="det-title">HDMI-CEC</div>
              <div class="det-desc">Lets this device turn the television on and switch it to the
                right input, and lets the television's remote drive it.</div>
              <div class="det-note warn">Turn this off if the TV keeps changing input on its own,
                or switches itself on overnight.</div>`,
            children: () => [
              toggleNode('enable', 'System audio control', () => S.system.cec, v => { S.system.cec = v; },
                () => '<div class="det-title">System audio control</div><div class="det-desc">Sends volume to the television or receiver over HDMI.</div>'),
              toggleNode('otp', '1-touch play', () => S.system.cecOneTouch, v => { S.system.cecOneTouch = v; },
                () => '<div class="det-title">1-touch play</div><div class="det-desc">Wakes the TV and switches input when you press a button on the remote.</div>'),
              toggleNode('standby', 'Device auto power off', () => S.system.cecStandby, v => { S.system.cecStandby = v; },
                () => '<div class="det-title">Device auto power off</div><div class="det-desc">Sleeps when the television is switched off.</div>'),
            ] },

          { id: 'update', label: 'System update', value: () => `Roku OS ${S.software.version}`,
            detail: () => `<div class="det-title">System update</div>
              <div class="det-desc">This device checks for updates on its own every day or so.
                Checking here forces it.</div>
              <dl class="facts">
                <div class="fact"><dt>Current version</dt><dd class="mono">${esc(S.software.version)} build ${esc(S.software.build)}</dd></div>
                <div class="fact"><dt>Last checked</dt><dd>${S.software.lastChecked ? esc(S.software.lastChecked) : 'Not since the last restart'}</dd></div>
              </dl>`,
            children: () => [
              { id: 'check', label: 'Check now',
                detail: () => '<div class="det-title">Check now</div><div class="det-desc">Contacts the update servers and installs anything found.</div>',
                act() { checkForUpdate(); } },
            ] },

          choiceNode('extctl', 'External control', [
            { id: 'enabled', name: 'Enabled', detail: 'Apps on your network may control this device.' },
            { id: 'permissive', name: 'Permissive', detail: 'Allows control from outside the local network too.' },
            { id: 'disabled', name: 'Disabled', detail: 'Nothing on the network may control it — including the mobile app.' },
          ], () => S.system.externalControl, v => { S.system.externalControl = v; },
            { note: 'If the phone app cannot find this device, this is the setting to check first.' }),

          /* -------------------------------------- Advanced system settings */
          {
            id: 'advanced', label: 'Advanced system settings',
            detail: () => `<div class="det-title">Advanced system settings</div>
              <div class="det-desc">The resets live here. Network connection reset only forgets
                Wi-Fi; factory reset erases everything.</div>`,
            children: () => [
              { id: 'netreset', label: 'Network connection reset',
                detail: () => `<div class="det-title">Network connection reset</div>
                  <div class="det-desc">Forgets every stored wireless network and password, then
                    restarts. Accounts, channels and settings are kept.</div>
                  <div class="det-note">Use this when the box says it is connected but nothing
                    loads, and a restart has not fixed it.</div>`,
                act() { confirmNetworkReset(); } },
              { id: 'factory', label: 'Factory reset',
                detail: () => `<div class="det-title">Factory reset</div>
                  <div class="det-desc">Erases everything on this device — the account link,
                    every channel, every setting — and runs guided setup again.</div>
                  <div class="det-note bad">There is no undo. You will need the account details
                    to link it again afterwards.</div>`,
                act() { confirmFactoryReset(); } },
              toggleNode('mobile', 'Control by mobile apps', () => S.system.mobileControl, v => { S.system.mobileControl = v; },
                () => '<div class="det-title">Control by mobile apps</div><div class="det-desc">Allows the phone app to act as a remote and keyboard.</div>'),
              { id: 'connect', label: 'Device connect', value: () => 'Ready',
                detail: () => `<div class="det-title">Device connect</div>
                  <div class="det-desc">Lets a phone or a voice assistant pair with this device
                    over the local network.</div>`,
                act() { toast('Device connect is ready for pairing'); } },
              { id: 'advdisp', label: 'Advanced display settings',
                detail: () => `<div class="det-title">Advanced display settings</div>
                  <div class="det-desc">HDMI mode and dynamic range. Step the HDMI mode down if
                    the picture flickers, drops out or shows sparkles.</div>`,
                children: () => [
                  choiceNode('hdmi', 'HDMI mode', [
                    { id: 'auto', name: 'Auto', detail: 'Negotiate the highest the cable will carry.' },
                    { id: '2.0', name: 'HDMI 2.0', detail: '4K at 60Hz. Needs a high-speed cable.' },
                    { id: '1.4', name: 'HDMI 1.4', detail: '4K at 30Hz. Works over almost any cable.' },
                  ], () => S.display.hdmiMode, v => { S.display.hdmiMode = v; },
                    { note: 'A picture that cuts out every few seconds is nearly always a cable that cannot carry HDMI 2.0.' }),
                  toggleNode('hdr', 'HDR', () => S.display.hdr, v => { S.display.hdr = v; },
                    () => '<div class="det-title">HDR</div><div class="det-desc">High dynamic range, when both the television and the stream support it.</div>'),
                ] },
            ],
          },
        ],
      },

      /* --------------------------------------------------------------- Help */
      {
        id: 'help', label: 'Help',
        detail: () => `<div class="det-title">Help</div>
          <div class="det-desc">Short answers to the things that go wrong most often.</div>`,
        children: () => HELP_TOPICS.map(topic => ({
          id: topic.id, label: topic.title,
          detail: () => `<div class="det-title">${esc(topic.title)}</div>${topic.body}`,
          act() { toast('Read the steps on the right'); },
        })),
      },
    ],
  };
}

/** The network facts. `withTitle` is off when another heading already sits
 *  above it, as on the finished Check connection screen. */
function netAboutDetail(withTitle = true) {
  const n = State.network;
  return `${withTitle ? '<div class="det-title">Network — About</div>' : ''}
    <dl class="facts">
      <div class="fact"><dt>Status</dt><dd>${n.connected ? (n.internet ? 'Connected' : 'No internet') : 'Not connected'}</dd></div>
      <div class="fact"><dt>Connection type</dt><dd>${n.mode === 'wired' ? 'Wired (Ethernet)' : 'Wireless'}</dd></div>
      ${n.mode === 'wired' ? '' : `
      <div class="fact"><dt>Network name</dt><dd>${esc(n.ssid)}</dd></div>
      <div class="fact"><dt>Security</dt><dd>${esc(n.security)}</dd></div>
      <div class="fact"><dt>Band</dt><dd>${esc(n.band)} · channel ${n.channelNo}</dd></div>
      <div class="fact"><dt>Signal strength</dt><dd>${BARS(n.signal, n.signal <= 2)}</dd></div>
      <div class="fact"><dt>Link speed</dt><dd>${esc(n.linkSpeed)}</dd></div>`}
      <div class="fact"><dt>IP address</dt><dd class="mono">${esc(n.ip)}</dd></div>
      <div class="fact"><dt>Subnet mask</dt><dd class="mono">${esc(n.subnet)}</dd></div>
      <div class="fact"><dt>Gateway</dt><dd class="mono">${esc(n.gateway)}</dd></div>
      <div class="fact"><dt>DNS</dt><dd class="mono">${esc(n.dns)}</dd></div>
      <div class="fact"><dt>MAC address</dt><dd class="mono">${esc(n.mode === 'wired' ? n.macWired : n.macWireless)}</dd></div>
    </dl>`;
}

const HELP_TOPICS = [
  { id: 'buffer', title: 'A channel keeps buffering', body: `
    <div class="det-desc">Run <b>Settings &rsaquo; Network &rsaquo; Check connection</b> first and read the
      download speed it reports. Under about 3 Mbps will buffer on anything in HD.</div>
    <div class="det-desc">If the speed is fine, restart the device from
      <b>Settings &rsaquo; System &rsaquo; Power &rsaquo; System restart</b>, then check the signal
      strength — two bars or fewer usually means the box is too far from the router.</div>` },
  { id: 'nopicture', title: 'The screen is blank or keeps dropping out', body: `
    <div class="det-desc">Set <b>Settings &rsaquo; Display type</b> to <b>1080p</b>, and
      <b>Advanced display settings &rsaquo; HDMI mode</b> to <b>HDMI 1.4</b>. If the picture comes
      back, the cable cannot carry 4K.</div>
    <div class="det-desc">A purple screen with an HDCP message is the same fault: the cable or
      the input cannot negotiate copy protection.</div>` },
  { id: 'nosound', title: 'There is no sound', body: `
    <div class="det-desc">Set both <b>Settings &rsaquo; Audio &rsaquo; Audio mode</b> and
      <b>HDMI</b> to <b>Stereo</b>. Surround formats a receiver cannot decode come out silent.</div>
    <div class="det-desc">Check the mute state on the remote, and that volume is not being sent
      to a device that is switched off through HDMI-CEC.</div>` },
  { id: 'remote', title: 'The remote does not work', body: `
    <div class="det-desc">Check the battery level in <b>Settings &rsaquo; Remotes &amp; devices</b>.
      Then pair it again: hold the pairing button inside the battery compartment for five
      seconds until the light flashes.</div>
    <div class="det-desc">A remote with a microphone pairs over Wi-Fi Direct and needs the box
      restarted if it stops responding entirely.</div>` },
  { id: 'signin', title: 'A channel keeps asking me to sign in', body: `
    <div class="det-desc">Remove the channel from the home screen with <b>*</b> &rsaquo;
      <b>Remove channel</b>, restart the device, then add it again from
      <b>Streaming Channels</b>. That clears the stored sign-in.</div>` },
  { id: 'slow', title: 'The menus are slow', body: `
    <div class="det-desc">Restart from <b>Settings &rsaquo; System &rsaquo; Power</b>, then remove
      channels that are not used — a home screen with a hundred tiles takes longer to draw.</div>` },
];

/* --------------------------------------------------------------- the screen */

/** Walk the tree to the node a path points at. */
function nodeAt(path) {
  let node = settingsTree();
  const trail = [node];
  path.forEach(step => {
    const kids = node.children ? node.children() : [];
    const found = kids.find(k => k.id === step);
    if (found) { node = found; trail.push(found); }
  });
  return { node, trail };
}

defineScreen('settings', {
  render(host, arg) {
    const path = (arg && arg.path) || [];
    const { node, trail } = nodeAt(path);
    const rows = node.children ? node.children() : [];

    const crumbs = trail.map((n, i) => (i === trail.length - 1
      ? `<b>${esc(n.label)}</b>`
      : esc(n.label))).join('<span class="sl">›</span>');

    host.innerHTML = `
      <div class="settings">
        <div class="wall"></div>
        ${topbarHTML()}
        ${sideRailHTML('settings')}
        <div class="set-head">
          <div class="trail">${crumbs}</div>
          <h1>${esc(node.label)}</h1>
        </div>
        <div class="set-body">
          <div class="set-menu scroll-y">
            ${rows.map((row, i) => {
              const value = row.value ? row.value() : '';
              const ticked = row.isSet && row.isSet();
              const drills = !!row.children;
              return `<div class="row f${ticked ? ' is-set' : ''}" data-fid="s-${row.id}" data-row="${row.id}"${i === 0 ? ' data-first' : ''}>
                  <span>${esc(row.label)}</span>
                  ${value ? `<span class="row-val">${value}</span>` : ''}
                  ${drills && !value ? '<span class="row-chev">›</span>' : ''}
                </div>`;
            }).join('')}
            ${rows.length ? '' : '<div class="empty-note">Nothing to change here.</div>'}
          </div>
          <div class="set-detail scroll-y" id="set-detail"></div>
        </div>
      </div>`;

    const rail = wireSideRail(host);
    const detail = host.querySelector('#set-detail');

    function paint(target) {
      if (!target || !target.dataset.row) {
        detail.innerHTML = node.detail ? node.detail() : '';
        return;
      }
      const row = rows.find(r => r.id === target.dataset.row);
      detail.innerHTML = row && row.detail ? row.detail() : (node.detail ? node.detail() : '');
    }

    return {
      onFocus(target) { rail.onFocus(target); paint(target); },
      select(target) {
        if (rail.select(target)) return;
        const row = rows.find(r => r.id === target.dataset.row);
        if (!row) return;
        if (row.children) { go('settings', { path: path.concat(row.id) }); return; }
        if (row.act) row.act();
      },
      refocus() { if (!Focus.el || !focusables().includes(Focus.el)) focusFirst(host); },
    };
  },
});
