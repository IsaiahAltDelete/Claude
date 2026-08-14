/* ===========================================================================
   Boot.

   This runs LAST, after every extension script has registered its apps and
   replaced whatever globals it means to replace. That ordering is the whole
   point of the file: boot used to sit at the end of the inline <script>, which
   meant it painted the home screen, the lock notifications and the control
   panel while the un-patched versions of renderHome, renderPanel and friends
   were still the ones bound — so two separate extension files each had to
   remember to replay those calls afterwards. Nothing was missed only because
   both remembered. Booting after the extensions removes the whole class.

   Boot is also the one place where a throw is unrecoverable: both the boot
   splash and the lock screen are visible at parse time and hidden only by the
   last statements here, so an exception leaves a dead splash on every
   subsequent reload with no way back that does not involve devtools. Hence the
   trap: clear the save, reload once, and say so.
   =========================================================================== */

/** Scale the device to the viewport, allowing for the control drawer. */
function fitStage() {
  const stage = $('#stage');
  const panel = $('#panel');
  // Measure the drawer live so the phone scales smoothly while it slides.
  const panelW = panel ? panel.getBoundingClientRect().width + (deckOpen ? 58 : 0) : 0;
  const scale = Math.min(1, (window.innerHeight - 30) / 852, (window.innerWidth - panelW - 76) / 393);
  stage.style.height = `${852 * scale}px`;
  stage.style.width = `${393 * scale}px`;
  stage.style.transform = 'none';
  stage.firstElementChild.style.transformOrigin = 'top left';
  stage.firstElementChild.style.transform = `scale(${scale})`;
}
window.addEventListener('resize', fitStage);

const BOOT_RECOVERY_FLAG = 'iphone-sim-recovering';

function bootSimulator() {
  registerStoreApps();
  applyAppArt();
  ML(); SafariState(); WF(); PH(); MSG(); ACC(); WAL(); CK();
  if (State.settings.wifi && WF().connected) State.settings.wifiName = WF().connected;
  // A couple of pending updates, but only for apps that are actually installed.
  State.updatesAvailable = (State.updatesAvailable || []).filter(id => State.installed.includes(id));
  State.installed.slice(0, 2).forEach(id => {
    if (!State.updatesAvailable.includes(id)) State.updatesAvailable.push(id);
  });
  save();

  /* A download or install that was in flight when the page closed cannot
     resume — its interval is gone — so it rewinds to a state the user can
     act on rather than sitting at a percentage that will never move. */
  const update = OSU();
  if (update.stage === 'downloading') { update.stage = 'available'; update.progress = 0; }
  if (update.stage === 'installing') { update.stage = 'downloaded'; update.progress = 0; }
  setBadge('settings', updatePending() ? 1 : 0);
  save();

  applyAppearance();
  renderHome();
  renderCC();
  renderLockNotifs();
  renderPanel();
  renderStatus();
  setBadge('appstore', State.updatesAvailable.length);
  syncMailBadge();
  setDeck(deckOpen && window.innerWidth > 820, { animate: false });
  fitStage();

  locked = true;
  $('#screen').classList.add('locked');
  $('#lock').classList.remove('hidden');
  $('#lk-lockicon').innerHTML = SF.lock;
  setTimeout(() => $('#boot').classList.add('gone'), 2300);
  setTimeout(() => island('🔒', '#1c1c1e', 'iPhone', 'Swipe up to unlock', 2600), 2900);

  /* An erase leaves a marker; the assistant runs on the next boot, after the
     splash has played. Lives here rather than in 66-setup-network.js so the
     order of the whole startup sequence is readable in one place. */
  if (typeof setupPending === 'function' && setupPending()) {
    setTimeout(runSetupAssistant, 2400);
  }
}

try {
  bootSimulator();
  sessionStorage.removeItem(BOOT_RECOVERY_FLAG);
} catch (error) {
  /* Recover once. The session flag stops a save that is fine from being wiped
     repeatedly by a bug that is not in the save at all. */
  const alreadyTried = sessionStorage.getItem(BOOT_RECOVERY_FLAG) === '1';
  console.error('iPhone simulator failed to start', error);
  if (!alreadyTried) {
    try {
      sessionStorage.setItem(BOOT_RECOVERY_FLAG, '1');
      localStorage.removeItem(SAVE_KEY);
    } catch (ignored) { /* private mode */ }
    location.reload();
  } else {
    const boot = $('#boot');
    if (boot) {
      boot.innerHTML = `<div style="max-width:280px;text-align:center;color:#fff;font-family:var(--sf)">
        <div style="font-size:19px;font-weight:600;margin-bottom:8px">iPhone Simulator could not start</div>
        <div style="font-size:13px;opacity:.7;line-height:1.5">Its saved data has already been cleared once.
          Reload the page, or open it with <b>?reset</b> on the end of the address.</div>
        <div style="font-size:11px;opacity:.45;margin-top:14px">${esc(String(error && error.message || error))}</div></div>`;
    }
  }
}
