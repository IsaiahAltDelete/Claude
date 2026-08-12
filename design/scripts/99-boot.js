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

function loadInitialState() {
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

async function rebuildAtlas() {
  const token = ++atlasToken;
  try {
    const atlas = await Atlas.build(State.data);
    if (token !== atlasToken || !app.renderer) return;
    app.renderer.setAtlas(atlas);
    app.renderer.setCount(State.get("count"));
    app.cells = atlas.cells.length;
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
  $("#hud-size").textContent = `${s.width} × ${s.height}`;
  $("#hud-render").textContent = `${app.renderer.width} × ${app.renderer.height} · ${Math.round((w / s.width) * 100)}%`;
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

  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    canvas.classList.add("dragging");
    mode = pointers.size > 1 ? "pinch" : "orbit";
    start = {
      yaw: State.get("yaw"), pitch: State.get("pitch"), dist: State.get("dist"),
      panX: State.get("panX"), panY: State.get("panY"),
      centre: centre(), spread: pointers.size > 1 ? spread() : 0,
    };
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

  const end = (e) => {
    pointers.delete(e.pointerId);
    if (!pointers.size) {
      canvas.classList.remove("dragging");
      mode = null;
    }
  };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const k = Math.exp(e.deltaY * 0.0012);
    State.set("dist", clamp(State.get("dist") * k, 0.2, 14));
  }, { passive: false });

  canvas.addEventListener("dblclick", () => {
    State.patch({ yaw: 0, pitch: 0, panX: 0, panY: 0 });
  });
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
    case "share": {
      const url = `${location.origin}${location.pathname}#${State.encode()}`;
      navigator.clipboard?.writeText(url).then(
        () => toast("Link copied"),
        () => { location.hash = State.encode(); toast("Link is in the address bar"); });
      break;
    }
    case "save":
      download(new Blob([JSON.stringify(State.diff(), null, 2)], { type: "application/json" }),
        "isaiart-settings.json");
      toast("Settings saved");
      break;
    case "load": loadFile(); break;
    case "reset":
      State.reset();
      toast("Back to defaults");
      break;
  }
}

function loadFile() {
  const input = el("input", { type: "file", accept: "application/json,.json" });
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const obj = JSON.parse(await file.text());
      State.patch({ ...State.DEFAULTS, ...obj });
      toast("Settings loaded");
    } catch {
      toast("That file is not settings JSON");
    }
  });
  input.click();
}

/* ---------------------------------------------------------------- wiring */

function setupBar() {
  const play = $("#btn-play");
  const paint = () => {
    play.textContent = "";
    play.append(icon(State.get("playing") ? "pause" : "play"));
  };
  play.addEventListener("click", () => State.set("playing", !State.get("playing")));
  $("#btn-random").append(icon("dice"));
  $("#btn-theme").append(icon("contrast"));
  $("#btn-full").append(icon("expand"));
  $("#btn-help").append(icon("help"));
  paint();

  $("#btn-random").addEventListener("click", () => { State.randomize(); toast("Randomised"); });
  $("#btn-theme").addEventListener("click", () =>
    setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));
  $("#btn-full").addEventListener("click", () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.().catch(() => toast("Fullscreen refused"));
  });
  $("#btn-help").addEventListener("click", () => { $("#help").hidden = false; });
  $("#help-close").addEventListener("click", () => { $("#help").hidden = true; });
  $("#help").addEventListener("click", (e) => { if (e.target.id === "help") $("#help").hidden = true; });
  $("#btn-png").addEventListener("click", () => Export.savePng(app, 1));

  return paint;
}

function setupKeys() {
  addEventListener("keydown", (e) => {
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === " ") { State.set("playing", !State.get("playing")); e.preventDefault(); }
    else if (k === "r") State.randomize();
    else if (k === "e") Export.savePng(app, 1);
    else if (k === "t") setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
    else if (k === "f") $("#btn-full").click();
    else if (k === "?" || (k === "/" && e.shiftKey)) $("#help").hidden = !$("#help").hidden;
    else if (k === "escape") { $("#help").hidden = true; window.ISO.closePop?.(); }
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

function syncWeights() {
  const face = State.FONT_BY_ID[State.get("font")];
  const node = weightControl();
  if (!face || !node) return;
  node.config = { ...node.cfg, opts: face.weights.map((w) => [w, String(w)]) };
  if (!face.weights.includes(+State.get("weight"))) State.set("weight", face.weights[0]);
}

const persist = debounce(() => {
  if (State.get("autosave")) store.set(SAVE_KEY, State.diff());
  else store.del(SAVE_KEY);
}, 700);

function onChange({ keys, fx, source }) {
  if (fx.has("atlas")) scheduleAtlas();
  if (fx.has("tile")) scheduleTile();
  if (fx.has("inst")) app.renderer.setCount(State.get("count"));
  if (keys.includes("aspect") && source !== "size") applyAspect();
  if (fx.has("size")) applySize();
  if (keys.includes("font")) syncWeights();
  if (keys.includes("playing")) paintPlay();
  if (keys.includes("bgType") && State.get("bgType") === "pattern") scheduleTile();
  Rail.refreshDeps();
  updateStatus();
  persist();
  dirty = true;
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
  syncWeights();

  $("#rail").addEventListener("iso-action", (e) => handleAction(e.detail));
  $("#rail").addEventListener("iso-preset", (e) => {
    State.applyPreset(e.detail);
    toast(State.PRESETS.find((p) => p.id === e.detail)?.name || "Preset");
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
  requestAnimationFrame(loop);
  window.ISO.app = app;
}

if (document.readyState === "loading") addEventListener("DOMContentLoaded", boot);
else boot();
})();
