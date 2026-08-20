/* ---------------------------------------------------------------------------
   Boot and the frame loop.

   This is the only module that owns mutable runtime objects: the renderer, the
   clock, and the small pipeline that turns a state change into the cheapest
   possible amount of work — a uniform change costs one frame, a text change
   costs one atlas rebuild, and nothing else is touched.
   --------------------------------------------------------------------------- */

(() => {
const {
  $, $$, el, icon, clamp, debounce, store, toast, download, isSmall,
} = window.ISO;
const State = window.ISO.State;
const Atlas = window.ISO.Atlas;
const Rail = window.ISO.Rail;
const Export = window.ISO.Export;

const SAVE_KEY = "isaiart.design.state";
const THEME_KEY = "isaiart.design.theme";
/* Kept out of the state blob on purpose: a preference that lives inside the
   thing it deletes cannot survive being switched off, and it has no business
   travelling in a shared link or a settings file. */
const AUTOSAVE_KEY = "isaiart.design.autosave";

/* Pixel budgets per quality tier. Mobile GPUs fall over well before desktop,
   so this is the single knob that keeps a 4K artboard from melting a phone. */
const QUALITY = {
  eco: { maxPixels: 1.1e6, samples: 0 },
  balanced: { maxPixels: 2.8e6, samples: 4 },
  high: { maxPixels: 8.4e6, samples: 8 },
};

const app = {
  renderer: null,
  state: State.data,
  clock: 0,
  cells: 1,
  requestFrame() { dirty = true; },
};

let dirty = true;
let stopRecording = null;

/* ------------------------------------------------------------------ setup */

function fail(message) {
  const msg = $("#stage-msg");
  msg.hidden = false;
  msg.textContent = message;
  $("#artboard").style.opacity = "0.15";
}

/** Keys that describe the session rather than the artwork, so they never
    travel in a link or a settings file. */
const NOT_PORTABLE = ["autosave", "playing"];

function loadInitialState() {
  State.patch({ autosave: store.get(AUTOSAVE_KEY, true) !== false }, { silent: true });
  const hash = location.hash.replace(/^#\/?/, "");
  if (hash && State.applyEncoded(hash, { silent: true })) {
    history.replaceState(null, "", location.pathname + location.search);
    return "link";
  }
  const saved = store.get(SAVE_KEY, null);
  if (saved && typeof saved === "object") {
    State.patch(saved, { silent: true });
    return "saved";
  }
  // Someone who has asked their system for less motion should not be met with
  // a moving canvas; the play button is right there when they want it.
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    State.patch({ playing: false }, { silent: true });
  }
  // First visit on a phone: start at the cheap tier and a portrait canvas.
  if (isSmall()) {
    State.patch({ quality: "eco", aspect: "9:16", width: 1080, height: 1920,
                  count: 200, size: 0.26, dist: 4.2 }, { silent: true });
  }
  return "fresh";
}

/* --------------------------------------------------------------- pipeline */

/* Each async rebuild carries its own token so a later request always wins and
   a stale one drops silently. The two pipelines must not share a counter. */
let atlasToken = 0;
let tileToken = 0;

let lastTruncated = 0;

async function rebuildAtlas() {
  const token = ++atlasToken;
  try {
    const atlas = await Atlas.build(State.data);
    if (token !== atlasToken || !app.renderer) return;
    app.renderer.setAtlas(atlas);
    // No tokens means an empty canvas, so draw nothing at all.
    app.renderer.setCount(atlas.cells.length ? State.get("count") : 0);
    app.cells = atlas.cells.length;

    $("#stage-empty").hidden = atlas.cells.length > 0;

    // The atlas holds 64 cells. Announce crossing the line once — the count
    // changes on every keystroke, so keying the toast off it would spam — and
    // leave a standing note in the status bar for as long as it applies.
    if (atlas.truncated && !lastTruncated) {
      toast(`Drawing the first ${Atlas.MAX_CELLS} pieces of ${atlas.total}`);
    }
    lastTruncated = atlas.truncated || 0;
    const note = $("#stat-msg");
    note.textContent = atlas.truncated ? `${Atlas.MAX_CELLS} of ${atlas.total} pieces` : "";
    note.title = atlas.truncated
      ? "The glyph atlas holds 64 pieces; the rest of the text is not drawn"
      : "";

    updateStatus();
    dirty = true;
  } catch (err) {
    console.error(err);
    toast("Could not draw that text");
  }
}

async function rebuildTile() {
  const token = ++tileToken;
  try {
    const canvas = await Atlas.tile(State.data);
    if (token !== tileToken || !app.renderer) return;
    app.renderer.setPattern(canvas);
    dirty = true;
  } catch (err) {
    console.error(err);
  }
}

const scheduleAtlas = debounce(rebuildAtlas, 90);
const scheduleTile = debounce(rebuildTile, 90);

function applySize() {
  const s = State.data;
  const q = QUALITY[s.quality] || QUALITY.balanced;
  let w = s.width * s.renderScale;
  let h = s.height * s.renderScale;
  const px = w * h;
  if (px > q.maxPixels) {
    const k = Math.sqrt(q.maxPixels / px);
    w *= k;
    h *= k;
  }
  app.renderer.resize(w, h, q.samples);
  layoutArtboard();
  updateStatus();
  dirty = true;
}

/** Fit the artboard inside the stage without ever overflowing it. */
function layoutArtboard() {
  const stage = $("#stage");
  const board = $("#artboard");
  const cs = getComputedStyle(stage);
  const availW = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const availH = stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  const s = State.data;
  const ratio = s.width / Math.max(s.height, 1);
  let w = availW;
  let h = w / ratio;
  if (h > availH) { h = availH; w = h * ratio; }
  board.style.width = `${Math.max(40, Math.floor(w))}px`;
  board.style.height = `${Math.max(40, Math.floor(h))}px`;

  const r = app.renderer;
  // Say plainly when the quality tier is rendering below the artboard size —
  // otherwise a soft-looking preview looks like a bug.
  const scaled = r.width < s.width || r.height < s.height;
  $("#hud-size").textContent = `${s.width} × ${s.height}`;
  $("#hud-render").textContent =
    `${r.width} × ${r.height}${scaled ? " ↓" : ""} · ${Math.round((w / s.width) * 100)}%`;
  $("#hud-render").title = scaled
    ? "Rendering below canvas size for speed — exports are still full size"
    : "Render buffer size and preview zoom";
}

function applyAspect() {
  const found = State.ASPECTS.find((a) => a[0] === State.get("aspect"));
  if (found) State.patch({ width: found[1], height: found[2] });
}

/* ---------------------------------------------------------------- status */

let lastStatus = 0;
function updateStatus(now = 0) {
  if (now && now - lastStatus < 240) return;
  lastStatus = now;
  const r = app.renderer;
  $("#stat-count").textContent = String(r?.instCount ?? 0);
  $("#stat-cells").textContent = String(app.cells);
  $("#stat-fps").textContent = String(Math.min(240, Math.round(1000 / Math.max(frameEma, 1))));
  const dot = $("#stat-dot");
  dot.className = "dot" + (stopRecording ? " rec" : State.get("playing") ? " live" : "");
  const undo = $("#btn-undo"), redo = $("#btn-redo");
  if (undo) undo.disabled = !State.canUndo();
  if (redo) redo.disabled = !State.canRedo();
}

/* -------------------------------------------------------------- the loop */

let last = performance.now();
let frameEma = 16;      // measured wall-clock interval between drawn frames
let lastDraw = 0;

function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  if (document.hidden || !app.renderer) return;

  if (State.get("playing")) {
    app.clock += dt;
    dirty = true;
  }
  if (!dirty) return;
  dirty = false;
  if (lastDraw) frameEma = frameEma * 0.88 + (now - lastDraw) * 0.12;
  lastDraw = now;
  app.renderer.render(State.data, app.clock);
  updateStatus(now);
}

/* --------------------------------------------------------- canvas gestures */

function setupGestures(canvas) {
  const pointers = new Map();
  let mode = null;
  let start = null;

  const centre = () => {
    let x = 0, y = 0;
    for (const p of pointers.values()) { x += p.x; y += p.y; }
    return { x: x / pointers.size, y: y / pointers.size };
  };
  const spread = () => {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  /** Re-baseline from the live camera for however many fingers remain. */
  const reseat = () => {
    mode = pointers.size > 1 ? "pinch" : "orbit";
    start = {
      yaw: State.get("yaw"), pitch: State.get("pitch"), dist: State.get("dist"),
      panX: State.get("panX"), panY: State.get("panY"),
      centre: centre(), spread: pointers.size > 1 ? spread() : 0,
    };
  };

  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    canvas.classList.add("dragging");
    reseat();
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const c = centre();
    if (mode === "orbit" && pointers.size === 1) {
      const dx = c.x - start.centre.x;
      const dy = c.y - start.centre.y;
      State.patch({
        yaw: start.yaw - dx * 0.35,
        pitch: clamp(start.pitch + dy * 0.28, -89, 89),
      });
    } else if (pointers.size > 1) {
      const k = spread() / Math.max(start.spread, 1);
      State.patch({
        dist: clamp(start.dist / k, 0.2, 14),
        panX: clamp(start.panX - (c.x - start.centre.x) / 240, -3, 3),
        panY: clamp(start.panY + (c.y - start.centre.y) / 240, -3, 3),
      });
    }
  });

  let lastTap = 0, lastTapAt = -Infinity;

  const end = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size) {
      // A pinch usually ends one finger at a time. Hand the gesture back to
      // the remaining finger from where the camera is now, or it looks hung.
      reseat();
      return;
    }
    canvas.classList.remove("dragging");
    mode = null;

    // Double-click recentres on desktop; dblclick is unreliable on touch, so
    // detect the double-tap ourselves.
    if (e.pointerType !== "mouse") {
      const moved = start ? Math.hypot(e.clientX - start.centre.x, e.clientY - start.centre.y) : 99;
      const now = e.timeStamp;
      if (moved < 8 && now - lastTapAt < 320 && Math.abs(e.clientX - lastTap) < 24) {
        recentre();
        lastTapAt = -Infinity;
      } else if (moved < 8) {
        lastTapAt = now;
        lastTap = e.clientX;
      }
    }
  };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const k = Math.exp(e.deltaY * 0.0012);
    State.set("dist", clamp(State.get("dist") * k, 0.2, 14));
  }, { passive: false });

  canvas.addEventListener("dblclick", recentre);
}

/* -------------------------------------------------------------- actions */

function setTheme(next) {
  document.documentElement.dataset.theme = next;
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", next === "light" ? "#eeeeef" : "#0a0a0b");
  store.set(THEME_KEY, next);
}

function toggleRecording() {
  const btn = $$('[data-action="rec"]')[0];
  const label = btn?.querySelector("span");
  if (stopRecording) {
    stopRecording();
    stopRecording = null;
    return;
  }
  stopRecording = Export.record(app, State.get("clipLength"), +State.get("clipFps"), (on) => {
    if (!on) {
      stopRecording = null;
      btn?.classList.remove("rec");
      if (label) label.textContent = "Record clip";
    }
    updateStatus();
  });
  if (stopRecording && btn) {
    btn.classList.add("rec");
    if (label) label.textContent = "Stop";
  }
  updateStatus();
}

function handleAction(id) {
  switch (id) {
    case "png1": Export.savePng(app, 1); break;
    case "png2": Export.savePng(app, 2); break;
    case "copy": Export.copyPng(app); break;
    case "rec": toggleRecording(); break;
    case "clear":
      toast(State.clear().length ? "Canvas cleared — ⌘Z to undo" : "Canvas is already empty");
      break;
    case "undo": doUndo(); break;
    case "redo": doRedo(); break;
    case "share": {
      const url = `${location.origin}${location.pathname}#${State.encode()}`;
      navigator.clipboard?.writeText(url).then(
        () => toast("Link copied"),
        () => { location.hash = State.encode(); toast("Link is in the address bar"); });
      break;
    }
    case "save": {
      const doc = State.diff();
      for (const k of NOT_PORTABLE) delete doc[k];
      download(new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" }),
        "isaiart-settings.json");
      toast("Settings saved");
      break;
    }
    case "load": loadFile(); break;
    case "reset":
      toast(State.reset().length ? "Back to defaults — ⌘Z to undo" : "Already at defaults");
      break;
  }
}

async function loadSettingsFile(file) {
  if (!file) return;
  try {
    const obj = JSON.parse(await file.text());
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) throw new Error("shape");
    const incoming = { ...State.DEFAULTS, ...obj };
    // Someone else's file should not flip your session preferences.
    for (const k of NOT_PORTABLE) incoming[k] = State.get(k);
    State.patch(incoming, { source: "load" });
    toast("Settings loaded");
  } catch {
    toast("That file is not settings JSON");
  }
}

function loadFile() {
  const input = el("input", { type: "file", accept: "application/json,.json" });
  input.addEventListener("change", () => loadSettingsFile(input.files?.[0]));
  input.click();
}

/** Dropping a settings file anywhere loads it — it is the file we hand out. */
function setupDrop() {
  const stop = (e) => { e.preventDefault(); };
  addEventListener("dragover", stop);
  addEventListener("drop", (e) => {
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    e.preventDefault();
    if (/\.json$/i.test(file.name) || file.type === "application/json") loadSettingsFile(file);
    else toast("Drop a settings .json file");
  });
}

/* ---------------------------------------------------------------- wiring */

/* ------------------------------------------------------------ bar menus

   Canvas size and presets both used to live at the bottom of the last panel.
   They are the two things you reach for most often and neither belongs to a
   panel, so they get their own buttons and their own small menus. */

/** Named pixel sizes worth one press. Ratios come from the schema. */
const SIZES = [
  ["HD", 1920, 1080],
  ["QHD", 2560, 1440],
  ["4K", 3840, 2160],
  ["Square", 1080, 1080],
  ["Story", 1080, 1920],
  ["Portrait", 1440, 1800],
];

/** The last preset applied, cleared as soon as anything else is touched. */
let activePreset = null;

function menu(anchor, title, body) {
  const pop = el("div", { class: "pop menu", role: "menu", "aria-label": title }, body);
  anchor.setAttribute("aria-expanded", "true");
  window.ISO.showPop(pop, anchor, () => {
    anchor.setAttribute("aria-expanded", "false");
    anchor.focus({ preventScroll: true });
  });
  return pop;
}

function openCanvasMenu() {
  const s = State.data;
  const chips = State.ASPECTS.map(([id, w, h]) => el("button", {
    class: "chip", type: "button", role: "menuitemradio",
    "aria-checked": String(s.aspect === id && s.width === w && s.height === h),
    onclick: () => { State.patch({ aspect: id, width: w, height: h }); window.ISO.closePop(); },
  }, id));

  const sizes = SIZES.map(([name, w, h]) => el("button", {
    class: "pop-item", type: "button", role: "menuitem",
    "aria-selected": String(s.width === w && s.height === h),
    onclick: () => { State.patch({ width: w, height: h }); window.ISO.closePop(); },
  }, el("span", { text: name }), el("span", { class: "pop-tag", text: `${w}×${h}` })));

  menu($("#btn-canvas"), "Canvas size",
    [
      el("p", { class: "menu-title", text: "Ratio" }),
      el("div", { class: "menu-chips" }, chips),
      el("p", { class: "menu-title", text: "Size" }),
      el("div", { class: "menu-list" }, sizes),
      el("div", { class: "menu-foot" },
        el("button", {
          class: "btn", type: "button",
          onclick: () => {
            State.patch({ width: State.get("height"), height: State.get("width") });
            window.ISO.closePop();
            toast("Canvas turned");
          },
        }, icon("swap"), el("span", { text: "Turn" })),
        el("button", {
          class: "btn", type: "button",
          onclick: () => {
            window.ISO.closePop();
            toast(State.clear().length ? "Canvas cleared — ⌘Z to undo" : "Canvas is already empty");
          },
        }, icon("close"), el("span", { text: "Clear" }))),
    ]);
}

function openPresetMenu() {
  const items = State.PRESETS.map((p) => el("button", {
    class: "pop-item", type: "button", role: "menuitem",
    "aria-selected": String(p.id === activePreset),
    onclick: () => {
      State.applyPreset(p.id);
      activePreset = p.id;
      window.ISO.closePop();
      toast(`${p.name} — ⌘Z to undo`);
    },
  }, el("span", { text: p.name })));

  menu($("#btn-presets"), "Presets", [
    el("p", { class: "menu-title", text: `Presets · ${State.PRESETS.length}` }),
    el("div", { class: "menu-grid" }, items),
    el("div", { class: "menu-foot" },
      el("button", {
        class: "btn", type: "button",
        onclick: () => { window.ISO.closePop(); State.randomize(); toast("Randomised — ⌘Z to undo"); },
      }, icon("dice"), el("span", { text: "Random" })),
      el("button", {
        class: "btn", type: "button",
        onclick: () => {
          window.ISO.closePop();
          toast(State.reset().length ? "Back to defaults — ⌘Z to undo" : "Already at defaults");
        },
      }, icon("reset"), el("span", { text: "Reset" }))),
  ]);
}

/** One definition of "put the camera back", for every route that offers it. */
function recentre() {
  State.patch({ yaw: 0, pitch: 0, panX: 0, panY: 0, dist: State.DEFAULTS.dist },
    { source: "camera" });
}

function setupBar() {
  const play = $("#btn-play");
  const paint = () => {
    play.textContent = "";
    play.append(icon(State.get("playing") ? "pause" : "play"));
  };
  play.addEventListener("click", () => State.set("playing", !State.get("playing")));
  $("#btn-undo").append(icon("undo"));
  $("#btn-redo").append(icon("redo"));
  $("#btn-presets").append(icon("presets"));
  $("#btn-canvas").append(icon("canvas"));
  $("#btn-presets").addEventListener("click", openPresetMenu);
  $("#btn-canvas").addEventListener("click", openCanvasMenu);
  $("#btn-undo").addEventListener("click", () => doUndo());
  $("#btn-redo").addEventListener("click", () => doRedo());
  $("#hud-recentre").addEventListener("click", recentre);
  $("#btn-random").append(icon("dice"));
  $("#btn-theme").append(icon("contrast"));
  $("#btn-full").append(icon("expand"));
  $("#btn-help").append(icon("help"));
  $("#btn-png").prepend(icon("image"));   // the label drops away on small phones
  paint();

  $("#btn-random").addEventListener("click", () => { State.randomize(); toast("Randomised — ⌘Z to undo"); });
  $("#btn-theme").addEventListener("click", () =>
    setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));
  $("#btn-full").addEventListener("click", () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.().catch(() => toast("Fullscreen refused"));
  });
  const help = $("#help");
  const openHelp = () => {
    help.hidden = false;
    $("#help-close").focus();
  };
  const closeHelp = () => {
    if (help.hidden) return;
    help.hidden = true;
    $("#btn-help").focus();
  };
  $("#btn-help").addEventListener("click", openHelp);
  $("#help-close").addEventListener("click", closeHelp);
  help.addEventListener("click", (e) => { if (e.target.id === "help") closeHelp(); });
  // The dialog is modal, so Tab stays inside it.
  help.addEventListener("keydown", (e) => {
    if (e.key === "Tab") { e.preventDefault(); $("#help-close").focus(); }
  });
  app.openHelp = openHelp;
  app.closeHelp = closeHelp;
  $("#btn-png").addEventListener("click", () => Export.savePng(app, 1));

  return paint;
}

function doUndo() {
  if (State.undo()) toast("Undo");
  else toast("Nothing to undo");
}

function doRedo() {
  if (State.redo()) toast("Redo");
  else toast("Nothing to redo");
}

function setupKeys() {
  addEventListener("keydown", (e) => {
    const t = e.target;
    const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" ||
      t.isContentEditable || t.closest?.(".pop, .modal"));
    const k = e.key.toLowerCase();
    const mod = e.metaKey || e.ctrlKey;

    // Undo, redo and clear work even while the cursor is in the text field —
    // that is exactly where you want them.
    if (mod && k === "z") {
      e.preventDefault();
      e.shiftKey ? doRedo() : doUndo();
      return;
    }
    if (mod && k === "y") { e.preventDefault(); doRedo(); return; }
    if (mod && (k === "backspace" || k === "delete")) {
      e.preventDefault();
      toast(State.clear().length ? "Canvas cleared — ⌘Z to undo" : "Canvas is already empty");
      return;
    }

    if (typing) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    // Key repeat on Randomise or Export would fire dozens of times a second,
    // evicting the entire undo buffer from a single stuck key.
    if (e.repeat) return;
    if (k === " ") { State.set("playing", !State.get("playing")); e.preventDefault(); }
    else if (k === "r") { State.randomize(); toast("Randomised — ⌘Z to undo"); }
    else if (k === "e") Export.savePng(app, 1);
    else if (k === "t") setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
    else if (k === "f") $("#btn-full").click();
    else if (k === "p") openPresetMenu();
    else if (k === "c") openCanvasMenu();
    else if (k === "?" || (k === "/" && e.shiftKey)) {
      if ($("#help").hidden) app.openHelp?.(); else app.closeHelp?.();
    } else if (k === "escape") { app.closeHelp?.(); window.ISO.closePop?.(); }
    else if (k >= "1" && k <= "5") {
      const panel = State.SCHEMA[+k - 1];
      if (panel) rail.select(panel.id);
    }
  });
}

let rail;
let paintPlay;

function weightControl() {
  return $$("iso-seg").find((n) => n.cfg?.k === "weight");
}

/**
 * Each typeface ships different weights, so the Weight control is rebuilt
 * whenever the face changes.
 *
 * The descriptor has to be *mutated*, not copied: State.FIELDS holds the
 * original object and normalise() validates against its `opts`. Handing the
 * element a fresh copy left the store validating against the old single-entry
 * list, which silently rejected every weight but 400 — the control looked
 * fine and did nothing.
 */
function syncWeights() {
  const face = State.FONT_BY_ID[State.get("font")];
  const node = weightControl();
  if (!face || !node) return;
  const field = State.FIELDS.get("weight");
  field.opts = face.weights.map((w) => [w, String(w)]);
  node.config = field;
  if (!face.weights.includes(+State.get("weight"))) State.set("weight", face.weights[0]);
}

const persist = debounce(() => {
  if (State.get("autosave")) store.set(SAVE_KEY, State.diff());
  else store.del(SAVE_KEY);
}, 700);

function rememberAutosave() {
  const on = State.get("autosave");
  store.set(AUTOSAVE_KEY, on);
  if (!on) store.del(SAVE_KEY);
}

/* A copy count that suits one formation can be useless in another: one copy
   in a galaxy, or two thousand stacked on a single word. Nudge only when the
   current count is clearly wrong for the new shape, so a deliberate choice is
   never overridden. */
const COUNT_FOR = { single: 1, marquee: 12, stack: 9, rows: 84, columns: 120 };

function nudgeCount(formation) {
  const count = State.get("count");
  const want = COUNT_FOR[formation];
  if (want !== undefined) {
    if (count > want * 6 || count < Math.max(1, want / 6)) State.set("count", want);
    return;
  }
  if (count < 24) State.set("count", 240);   // a space formation needs a crowd
}

function onChange({ keys, fx, source }) {
  // The preset tick means "this is what you last applied", so anything else
  // touching the state clears it rather than leaving a stale claim.
  if (source !== "preset") activePreset = null;
  if (fx.has("atlas")) scheduleAtlas();
  if (fx.has("tile")) scheduleTile();
  if (fx.has("inst")) app.renderer.setCount(State.get("count"));
  if (keys.includes("aspect") && source !== "size") applyAspect();
  if (fx.has("size")) applySize();
  if (keys.includes("font")) syncWeights();
  if (keys.includes("formation") && source !== "preset" && source !== "undo" &&
      source !== "redo" && source !== "random" && source !== "load") {
    nudgeCount(State.get("formation"));
  }
  if (keys.includes("playing")) paintPlay();
  if (keys.includes("autosave")) rememberAutosave();
  if (keys.includes("bgType") && State.get("bgType") === "pattern") scheduleTile();
  Rail.refreshDeps();
  updateStatus();
  persist();
  dirty = true;
}

/* The bar buttons and the HUD carry their description in a title attribute,
   which is the right thing in the markup — it survives with scripting off and
   it is what a screen reader falls back to. Once the page is up they are
   handed to the same tooltip everything in the rail uses, so one hover
   behaves like every other. The shortcut, where there is one, becomes the
   second line. */
function adoptTitles() {
  for (const node of document.querySelectorAll("[title]")) {
    const raw = node.getAttribute("title");
    if (!raw) continue;
    const [text, hint] = raw.split(" — ");
    window.ISO.tip.attach(node, { tip: text.trim(), hint: hint ? hint.trim() : "" });
  }
}

/* ------------------------------------------------------------------- boot */

function boot() {
  const savedTheme = store.get(THEME_KEY, "dark");
  document.documentElement.dataset.theme = savedTheme === "light" ? "light" : "dark";

  loadInitialState();

  rail = Rail.buildRail($("#rail-body"), $("#tabs"));
  Rail.setupSheet($("#rail"), $("#sheet-handle"));
  Rail.refreshDeps();
  paintPlay = setupBar();
  setupKeys();
  adoptTitles();
  syncWeights();

  $("#rail").addEventListener("iso-action", (e) => handleAction(e.detail));
  $("#rail").addEventListener("iso-preset", (e) => {
    State.applyPreset(e.detail);
    activePreset = e.detail;
    const preset = State.PRESETS.find((p) => p.id === e.detail);
    toast(`${preset?.name || "Preset"} — ⌘Z to undo`);
  });

  try {
    app.renderer = new window.ISO.Renderer($("#gl"));
  } catch (err) {
    console.error(err);
    fail(String(err.message || err));
    return;
  }

  app.renderer.onRestore = () => {
    applySize();
    rebuildAtlas();
    rebuildTile();
  };

  State.on(onChange);

  applySize();
  rebuildAtlas();
  rebuildTile();

  const relayout = () => { layoutArtboard(); dirty = true; };
  addEventListener("resize", relayout);
  addEventListener("orientationchange", () => setTimeout(relayout, 120));
  if ("ResizeObserver" in window) new ResizeObserver(relayout).observe($("#stage"));

  setupGestures($("#gl"));
  setupDrop();
  requestAnimationFrame(loop);
  window.ISO.app = app;
}

if (document.readyState === "loading") addEventListener("DOMContentLoaded", boot);
else boot();
})();
