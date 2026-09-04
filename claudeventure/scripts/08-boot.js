/* ---------------------------------------------------------------------------
   ClaudeVenture — starting it up and keeping it running.

   The wiring: build the stage, the game, the scene and the interface; restore
   the save; run one loop that steps the simulation on wall-clock time and
   draws whatever the step left behind.

   The loop is `requestAnimationFrame`, but the simulation inside it is not:
   `Game.update` accumulates real elapsed seconds and steps a fixed 20 Hz. A
   background tab therefore does not earn anything while it is hidden — it
   earns it on the way back, once, through the same away-time path a closed tab
   uses, which is the only way those two can be made to agree.
   --------------------------------------------------------------------------- */

(function (root) {
'use strict';

const CV = root.CV;
const VOX = root.VOX;
if (!CV || !CV.Hud) throw new Error('ClaudeVenture: load 07-hud.js first');

const C = CV.Content;
const doc = root.document;
const SAVE_KEY = 'isaiart.claudeventure';
const THEME_KEY = 'isaiart.theme';
const AUTOSAVE = 10;

function readSave() {
  try {
    const raw = root.localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) { return null; }
}

function writeSave(data) {
  try { root.localStorage.setItem(SAVE_KEY, JSON.stringify(data)); return true; }
  catch (error) { return false; }
}

function boot() {
  const canvas = doc.getElementById('stage');
  const hudMount = doc.getElementById('hud');
  if (!canvas || !hudMount) return null;

  const stage = CV.Stage.create(canvas, { yaw: 45, pitch: 36, center: [0, 16, -4] });
  const game = CV.Game.create();

  /* ---------------------------------------------------------- the save */
  const saved = readSave();
  let away = null;
  if (saved && game.load(saved)) {
    const elapsed = (Date.now() - (saved.at || Date.now())) / 1000;
    away = game.awayEarnings(elapsed);
    if (away.amount > 0) game.claimAway(away);
    else away = null;
  }

  const scene = CV.Scene.create(stage, game);
  const hud = CV.Hud.create(hudMount, game, scene);
  hud.onReset = () => {
    try { root.localStorage.removeItem(SAVE_KEY); } catch (error) { /* private mode */ }
    root.location.reload();
  };

  if (away) {
    hud.openModal({
      title: 'While you were out',
      body: `${C.duration(away.seconds)} away. The crew kept going and took `
        + `${C.money(away.amount)} — idle shops earn at ${Math.round(CV.Game.OFFLINE_RATE * 100)}% `
        + 'of what they make while you are watching.',
      accent: CV.P.gold,
      actions: [['Back to work', () => hud.closeModal(), 'go']],
    });
  }

  /* --------------------------------------------------------- the input */

  /* One gesture for everything on the floor: tap money to sweep it, tap a box
     to open it, tap a machine to hurry it. Pointer events rather than click,
     so a drag on a phone does not fire one on release. */
  let downAt = null;
  canvas.addEventListener('pointerdown', event => {
    downAt = { x: event.clientX, y: event.clientY, t: performance.now() };
  });
  canvas.addEventListener('pointerup', event => {
    if (!downAt) return;
    const moved = Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y);
    const held = performance.now() - downAt.t;
    downAt = null;
    if (moved > 14 || held > 700) return;
    const ground = stage.pick(event.clientX, event.clientY);
    const result = game.tap(ground.x, ground.z);
    if (result.hit) hud.paint(true);
  });
  canvas.addEventListener('contextmenu', event => event.preventDefault());

  doc.addEventListener('keydown', event => {
    if (event.target && /^(INPUT|TEXTAREA)$/.test(event.target.tagName)) return;
    const keys = { 1: 'shop', 2: 'crew', 3: 'wear', 4: 'stats' };
    if (keys[event.key]) { hud.show(keys[event.key]); event.preventDefault(); }
    if (event.key === 'Escape') hud.closeModal();
  });

  /* ---------------------------------------------------------- the loop */

  let last = performance.now();
  let saveTimer = 0;
  let hidden = false;
  let hiddenAt = 0;

  doc.addEventListener('visibilitychange', () => {
    if (doc.hidden) { hidden = true; hiddenAt = Date.now(); writeSave(game.toJSON()); return; }
    hidden = false;
    const seconds = (Date.now() - hiddenAt) / 1000;
    const result = game.awayEarnings(seconds);
    if (result.amount > 0 && seconds > 45) {
      game.claimAway(result);
      hud.toast(`+${C.money(result.amount)} while the tab was away.`, 'good');
    }
    last = performance.now();
  });

  root.addEventListener('beforeunload', () => writeSave(game.toJSON()));

  function frame(now) {
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    if (!hidden) {
      game.update(dt);
      for (const event of game.drain()) hud.handle(event);
      scene.draw(dt);
      stage.render();
      hud.paint(false);
      saveTimer += dt;
      if (saveTimer >= AUTOSAVE) { saveTimer = 0; writeSave(game.toJSON()); }
    }
    root.requestAnimationFrame(frame);
  }
  root.requestAnimationFrame(frame);

  /* The camera has to fit the room on a phone held upright as well as on a
     desktop, and the only free variable is how much world fits vertically. */
  /* The tray covers the right-hand third on a wide screen, so the picture is
     panned left by half of whatever it covers and the shop stays centred in
     what you can actually see. On a phone the tray is along the bottom
     instead, so the pan goes the other way. */
  const TRAY = 342;
  function fit() {
    const rect = canvas.getBoundingClientRect();
    const aspect = Math.max(0.4, rect.width / Math.max(1, rect.height));
    const wide = rect.width >= 900;
    const covered = wide ? TRAY / Math.max(1, rect.width) : 0;
    stage.pan = [-covered, wide ? -0.06 : 0.14];
    const usable = wide ? 1 - covered : 1;
    stage.halfHeight = Math.max(58, 68 / Math.min(1.7, aspect * usable));
  }
  fit();
  root.addEventListener('resize', fit);

  /* ---------------------------------------------------------- the page */

  const themeButton = doc.getElementById('theme');
  if (themeButton) {
    const apply = value => {
      doc.documentElement.dataset.theme = value;
      themeButton.textContent = value === 'dark' ? 'Light' : 'Dark';
      themeButton.setAttribute('aria-pressed', String(value === 'light'));
      try { root.localStorage.setItem(THEME_KEY, JSON.stringify(value)); } catch (error) { /* fine */ }
    };
    themeButton.addEventListener('click', () => {
      apply(doc.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
    });
    apply(doc.documentElement.dataset.theme || 'dark');
  }

  const rendererNote = doc.getElementById('renderer-note');
  if (rendererNote) {
    rendererNote.textContent = stage.renderer === 'webgl'
      ? 'WebGL2' : 'software renderer';
  }

  /* Handed to the console and to the smoke test, which needs a way in that is
     not clicking things. */
  const api = { game, stage, scene, hud, save: () => writeSave(game.toJSON()), SAVE_KEY };
  root.CLAUDEVENTURE = api;
  return api;
}

if (doc && doc.readyState !== 'loading') boot();
else if (doc) doc.addEventListener('DOMContentLoaded', boot);

CV.boot = boot;

})(typeof globalThis !== 'undefined' ? globalThis : this);
