/* ---------------------------------------------------------------------------
   Boot, the frame loop, and everything that owns a mutable runtime object.

   Three things live here that live nowhere else:

     · the picture — decoded once, uploaded to the GPU once, and kept a second
       time as a reduced pixel array because segmentation is a CPU job;
     · the mask — a plain 8-bit array the size of that reduced copy, with its
       own small undo stack, since it is not a schema parameter and the state
       store knows nothing about it;
     · the clock — advanced only while the animated effects are switched on,
       so a still edit costs exactly one frame per change.

   Everything else is wiring: a state change comes in, the smallest amount of
   work that could satisfy it goes out.
   --------------------------------------------------------------------------- */

(() => {
const { $, el, icon, debounce, store, toast, download, isSmall } = window.ISO;
const State = window.ISO.State;
const Rail = window.ISO.Rail;
const Export = window.ISO.Export;
const Segment = window.ISO.Segment;

const SAVE_KEY = "isaiart.image.state";
const THEME_KEY = "isaiart.image.theme";
/* Kept out of the state blob on purpose: a preference that lives inside the
   thing it deletes cannot survive being switched off. */
const AUTOSAVE_KEY = "isaiart.image.autosave";

/* Pixel budgets per quality tier, applied to the preview only — an export
   always renders at the canvas size the Out panel says. */
const QUALITY = { eco: 1.1e6, balanced: 3.2e6, high: 9.4e6 };

/* The analysis copy of the picture. Everything on the CPU — saliency, the
   mixtures, the graph cut, the brush — runs at this size, and the mask is
   stored at it too. A twelve-megapixel phone photograph would make every one
   of those a hundred times slower for a mask the GPU then samples through a
   linear filter anyway. */
const WORK_MAX = 1400;

const app = {
  renderer: null,
  state: State.data,
  clock: 0,
  sourceName: "",
  sourceSize: [1, 1],
  pixels: null,            // ImageData at WORK_MAX, for segmentation and the brush
  mask: null,              // { data, width, height } or null for "everything"
  maskFrom: "",            // how the current mask was made, for the readout
  requestFrame() { dirty = true; },
};

let dirty = true;
let rail;
let busyText = "";
let stopRecording = null;

/* ------------------------------------------------------------------ setup */

function fail(message) {
  const msg = $("#stage-msg");
  msg.hidden = false;
  msg.textContent = message;
  $("#artboard").style.opacity = "0.15";
}

/** Keys that describe the session rather than the picture. */
const NOT_PORTABLE = ["autosave"];

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
  if (isSmall()) {
    State.patch({ quality: "eco", renderScale: 0.85 }, { silent: true });
  }
  return "fresh";
}

/* --------------------------------------------------------------- the size */

function applySize() {
  const s = State.data;
  const budget = QUALITY[s.quality] || QUALITY.balanced;
  let w = s.width * s.renderScale;
  let h = s.height * s.renderScale;
  const px = w * h;
  if (px > budget) {
    const k = Math.sqrt(budget / px);
    w *= k;
    h *= k;
  }
  app.renderer.resize(w, h);
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
  w = Math.max(40, Math.floor(w));
  h = Math.max(40, Math.floor(h));
  board.style.width = `${w}px`;
  board.style.height = `${h}px`;

  // The overlay is a CSS-sized canvas, so its backing store has to follow the
  // artboard rather than the render target — it draws a cursor, not pixels.
  const overlay = $("#mask-overlay");
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const ow = Math.round(w * dpr), oh = Math.round(h * dpr);
  if (overlay.width !== ow || overlay.height !== oh) {
    overlay.width = ow;
    overlay.height = oh;
  }

  const r = app.renderer;
  const scaled = r.width < s.width || r.height < s.height;
  $("#hud-size").textContent = `${s.width} × ${s.height}`;
  $("#hud-render").textContent =
    `${r.width} × ${r.height}${scaled ? " ↓" : ""} · ${Math.round((w / s.width) * 100)}%`;
  $("#hud-render").title = scaled
    ? "Rendering below canvas size for speed — exports are still full size"
    : "Render buffer size and preview zoom";
}

function applyAspect() {
  const id = State.get("aspect");
  if (id === "free") return;
  const found = State.ASPECTS.find((a) => a[0] === id);
  if (found) State.patch({ width: found[1], height: found[2] }, { source: "size" });
}

/** Set the canvas to the picture's own shape, capped to something sane. */
function matchCanvasToImage(opts) {
  const [iw, ih] = app.sourceSize;
  const cap = 2400;
  const k = Math.min(1, cap / Math.max(iw, ih));
  State.patch({
    aspect: "free",
    width: Math.max(160, Math.round(iw * k)),
    height: Math.max(160, Math.round(ih * k)),
  }, opts);
}

/* ------------------------------------------------------------- the source */

/** Decode a blob to whatever this browser will hand the GPU fastest. */
async function decode(blob) {
  if (typeof createImageBitmap === "function") {
    try {
      return { source: await createImageBitmap(blob), release: (s) => s.close?.() };
    } catch { /* fall through to the element path */ }
  }
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.decoding = "async";
  try {
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = () => rej(new Error("decode"));
      img.src = url;
    });
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
  return { source: img, release: () => URL.revokeObjectURL(url) };
}

/** The reduced copy every CPU pass reads. */
function samplePixels(source, w0, h0) {
  const k = Math.min(1, WORK_MAX / Math.max(w0, h0, 1));
  const w = Math.max(1, Math.round(w0 * k));
  const h = Math.max(1, Math.round(h0 * k));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

function setSource(source, release, name, { fitCanvas = true } = {}) {
  const w = source.width || source.naturalWidth || 1;
  const h = source.height || source.naturalHeight || 1;
  try {
    app.renderer.setImage(source);
    app.pixels = samplePixels(source, w, h);
  } finally {
    release?.(source);
  }
  app.sourceName = name || "";
  app.sourceSize = [w, h];

  setMask(null, "");
  maskPast.length = 0;
  maskFuture.length = 0;

  $("#stage-drop").hidden = true;
  $("#hud-source").textContent = `${name ? name.slice(0, 22) + " · " : ""}${w} × ${h}`;
  $("#hud-source").title = name || "Loaded picture";

  if (fitCanvas) matchCanvasToImage({ source: "load" });
  applySize();
  updateStatus();
  dirty = true;
}

async function openBlob(blob, name) {
  if (!blob || !/^image\//.test(blob.type || "")) {
    toast("That is not a picture this browser can read");
    return false;
  }
  setBusy("Decoding…");
  try {
    const { source, release } = await decode(blob);
    setSource(source, release, name || blob.name || "");
    toast("Picture loaded — press Find subject to cut it out");
    return true;
  } catch {
    toast("Could not decode that picture");
    return false;
  } finally {
    setBusy("");
  }
}

/* -------------------------------------------------------------- the sample

   Bundling a photograph would mean bundling its licence, its colour profile
   and half a megabyte. Drawing one costs neither, and a synthetic still life
   is honest about what the detector is being shown: a single lit form on a
   plain ground, which is exactly the case subject-finding is good at. */

function makeSample() {
  const w = 1280, h = 960;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const x = c.getContext("2d");

  const wash = x.createLinearGradient(0, 0, 0, h);
  wash.addColorStop(0, "#cdd2da");
  wash.addColorStop(0.58, "#e7e2d8");
  wash.addColorStop(1, "#bdb1a0");
  x.fillStyle = wash;
  x.fillRect(0, 0, w, h);

  const glow = x.createRadialGradient(w * 0.74, h * 0.26, 0, w * 0.74, h * 0.26, h * 0.62);
  glow.addColorStop(0, "rgba(255,238,208,0.85)");
  glow.addColorStop(1, "rgba(255,238,208,0)");
  x.fillStyle = glow;
  x.fillRect(0, 0, w, h);

  // The table the form stands on, kept close in tone to the wall so the
  // subject stays the only strong edge in the frame.
  x.fillStyle = "#a89984";
  x.fillRect(0, h * 0.74, w, h * 0.26);
  x.fillStyle = "rgba(0,0,0,0.06)";
  x.fillRect(0, h * 0.74, w, 3);

  // Cast shadow first, so the form sits on it rather than over it.
  x.save();
  x.translate(w * 0.5, h * 0.755);
  x.scale(1, 0.17);
  x.beginPath();
  x.arc(w * 0.05, 0, w * 0.19, 0, Math.PI * 2);
  x.fillStyle = "rgba(60,44,32,0.34)";
  x.fill();
  x.restore();

  // A vase, drawn as one closed path: down the right side from the lip, across
  // the foot, and back up the left. Both sides are the same curve with the
  // horizontal offsets negated, so the form is symmetrical by construction.
  const cx = w * 0.5, top = h * 0.24, bot = h * 0.755;
  const side = (d) => {
    x.bezierCurveTo(
      cx + d * w * 0.055, top + h * 0.10,
      cx + d * w * 0.155, top + h * 0.22,
      cx + d * w * 0.135, bot - h * 0.09);
    x.bezierCurveTo(
      cx + d * w * 0.128, bot - h * 0.03,
      cx + d * w * 0.088, bot,
      cx + d * w * 0.052, bot);
  };
  const sideBack = (d) => {
    x.bezierCurveTo(
      cx + d * w * 0.088, bot,
      cx + d * w * 0.128, bot - h * 0.03,
      cx + d * w * 0.135, bot - h * 0.09);
    x.bezierCurveTo(
      cx + d * w * 0.155, top + h * 0.22,
      cx + d * w * 0.055, top + h * 0.10,
      cx + d * w * 0.042, top);
  };
  x.beginPath();
  x.moveTo(cx + w * 0.042, top);
  side(1);
  x.lineTo(cx - w * 0.052, bot);
  sideBack(-1);
  x.closePath();

  const skin = x.createLinearGradient(cx - w * 0.16, 0, cx + w * 0.16, 0);
  skin.addColorStop(0, "#2b2f39");
  skin.addColorStop(0.42, "#4d5361");
  skin.addColorStop(0.7, "#7d8494");
  skin.addColorStop(1, "#31353f");
  x.fillStyle = skin;
  x.fill();

  // A single specular stripe is what makes it read as a solid rather than a
  // silhouette, and gives the colour model something to separate on. It is
  // faded at both ends: a hard-edged patch of light grey reads as a hole
  // punched through the form rather than as light landing on it.
  x.save();
  x.beginPath();
  x.ellipse(cx + w * 0.048, h * 0.46, w * 0.014, h * 0.155, -0.1, 0, Math.PI * 2);
  x.clip();
  const spec = x.createLinearGradient(0, h * 0.30, 0, h * 0.62);
  spec.addColorStop(0, "rgba(223,230,242,0)");
  spec.addColorStop(0.42, "rgba(223,230,242,0.62)");
  spec.addColorStop(1, "rgba(223,230,242,0)");
  x.fillStyle = spec;
  x.fillRect(cx - w * 0.2, h * 0.28, w * 0.4, h * 0.36);
  x.restore();

  return c;
}

/* ------------------------------------------------------------------ masks

   The mask has its own history because it is not a parameter: undo prefers it
   whenever the last thing that happened was a mask edit, and falls through to
   the parameter store otherwise. That is the rule people expect from a photo
   tool without ever being told it. */

const maskPast = [];
const maskFuture = [];
const MASK_HISTORY = 14;
let maskWasLast = false;

const copyMask = (m) => (m ? { data: m.data.slice(), width: m.width, height: m.height } : null);

function setMask(mask, from) {
  app.mask = mask;
  app.maskFrom = mask ? from : "";
  app.renderer.setMask(mask);
  updateStatus();
  dirty = true;
}

/** Record the mask about to be replaced, then replace it. */
function commitMask(next, from) {
  maskPast.push({ mask: copyMask(app.mask), from: app.maskFrom });
  if (maskPast.length > MASK_HISTORY) maskPast.shift();
  maskFuture.length = 0;
  maskWasLast = true;
  setMask(next, from);
}

function undoMask() {
  const step = maskPast.pop();
  if (!step) return false;
  maskFuture.push({ mask: copyMask(app.mask), from: app.maskFrom });
  setMask(step.mask, step.from);
  return true;
}

function redoMask() {
  const step = maskFuture.pop();
  if (!step) return false;
  maskPast.push({ mask: copyMask(app.mask), from: app.maskFrom });
  setMask(step.mask, step.from);
  return true;
}

/** Let the busy state paint before a long synchronous pass begins. */
const yieldFrame = () =>
  new Promise((res) => requestAnimationFrame(() => setTimeout(res, 0)));

let detecting = false;

async function detectSubject() {
  if (!app.pixels) { toast("Open a picture first"); return; }
  if (detecting) return;
  detecting = true;
  setBusy("Finding the subject…");
  await yieldFrame();
  try {
    const found = Segment.auto(app.pixels, { refineMax: WORK_MAX });
    commitMask(found, "auto");
    const s = State.data;
    toast(s.bgMode === "keep" && s.effectTarget === "all"
      ? "Subject found — now set a Background, or aim the effects at one side"
      : "Subject found — brush to correct it");
  } catch (err) {
    console.error(err);
    toast("Could not work out where the subject is");
  } finally {
    detecting = false;
    setBusy("");
  }
}

function invertSelection() {
  if (!app.pixels) { toast("Open a picture first"); return; }
  const base = app.mask || Segment.full(app.pixels.width, app.pixels.height);
  commitMask(Segment.invert(base), "inverted");
  toast("Selection inverted");
}

function clearSelection() {
  if (!app.mask) { toast("Nothing is selected"); return; }
  commitMask(null, "");
  toast("Selection cleared — ⌘Z to bring it back");
}

/* --------------------------------------------------------- canvas pointer

   Painting happens in the picture's own coordinates, not the canvas's, so the
   pointer has to be walked through the same transform the geometry pass
   applies — written forwards here because the shader reads it backwards. */

function canvasToSource(clientX, clientY) {
  const rect = $("#gl").getBoundingClientRect();
  const s = State.data;
  const vx = (clientX - rect.left) / Math.max(rect.width, 1);
  const vy = 1 - (clientY - rect.top) / Math.max(rect.height, 1);

  const A = app.renderer.width / Math.max(app.renderer.height, 1);
  const imgA = app.sourceSize[0] / Math.max(app.sourceSize[1], 1);

  let px = (vx - 0.5) * A - s.panX * A * 0.5;
  let py = (vy - 0.5) - s.panY * 0.5;

  const a = -s.rotate * Math.PI / 180;
  const ca = Math.cos(a), sa = Math.sin(a);
  const rx = px * ca - py * sa;
  const ry = px * sa + py * ca;

  const z = Math.max(s.zoom, 0.0001);
  let fw, fh;
  if (s.fit === "stretch") {
    fw = A;
    fh = 1;
  } else {
    let hh = A / Math.max(imgA, 0.0001);
    hh = s.fit === "cover" ? Math.max(1, hh) : Math.min(1, hh);
    fw = hh * Math.max(imgA, 0.0001);
    fh = hh;
  }

  let ux = (rx / z) / fw + 0.5;
  let uy = (ry / z) / fh + 0.5;
  if (s.flipH) ux = 1 - ux;
  if (s.flipV) uy = 1 - uy;

  const inside = ux >= 0 && ux <= 1 && uy >= 0 && uy <= 1;
  // Texture rows run top first while the quad's v runs bottom up, so the row
  // coordinate is the complement of the one the shader samples with.
  return { x: ux, y: 1 - uy, inside };
}

/**
 * The interactive counterpart of Segment.paint: identical falloff, written
 * into the existing buffer instead of a copy. A drag fires pointer events far
 * faster than a two-megabyte allocation per event can be collected.
 */
function stampMask(mask, ux, uy, radius, value) {
  const w = mask.width, h = mask.height;
  const r = Math.max(0.5, radius * Math.max(w, h));
  const cx = ux * (w - 1);
  const cy = uy * (h - 1);
  const target = value * 255;
  const inner = 0.55;                       // the hard core, as a fraction of r

  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(w - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(h - 1, Math.ceil(cy + r));
  const dst = mask.data;

  for (let py = y0; py <= y1; py++) {
    const dy = py - cy;
    const row = py * w;
    for (let px = x0; px <= x1; px++) {
      const dx = px - cx;
      const t = Math.sqrt(dx * dx + dy * dy) / r;
      if (t >= 1) continue;
      let alpha = 1;
      if (t > inner) {
        const u = (t - inner) / (1 - inner);
        alpha = 1 - u * u * (3 - 2 * u);
      }
      const i = row + px;
      dst[i] = dst[i] + (target - dst[i]) * alpha;
    }
  }
}

/** Stamps along a segment so a fast drag is a stroke rather than a dotted line. */
function strokeMask(mask, from, to, radius, value) {
  const dx = to.x - from.x, dy = to.y - from.y;
  const span = Math.hypot(dx * mask.width, dy * mask.height);
  const step = Math.max(1, Math.floor(span / Math.max(radius * Math.max(mask.width, mask.height) * 0.4, 1)));
  for (let i = 1; i <= step; i++) {
    const t = i / step;
    stampMask(mask, from.x + dx * t, from.y + dy * t, radius, value);
  }
}

let hoverPoint = null;
let boxDrag = null;

/**
 * Cut the subject out of the rectangle just drawn.
 *
 * This is the strongest of the three selection tools and the reason the graph
 * cut exists: told roughly where the subject is, it learns a colour model for
 * each side of that hint and finds the boundary itself. A detector run has to
 * guess the rectangle; here it was handed one.
 */
async function cutFromBox(from, to) {
  const x = Math.min(from.x, to.x), y = Math.min(from.y, to.y);
  const w = Math.abs(to.x - from.x), h = Math.abs(to.y - from.y);
  if (w < 0.02 || h < 0.02) { toast("Drag a box around the subject"); return; }
  if (detecting) return;
  detecting = true;
  setBusy("Cutting out the box…");
  await yieldFrame();
  try {
    commitMask(Segment.fromBox(app.pixels, { x, y, w, h }, { refineMax: WORK_MAX }), "box");
    toast("Cut out — brush to correct it");
  } catch (err) {
    console.error(err);
    toast("Could not separate that box");
  } finally {
    detecting = false;
    setBusy("");
  }
}

function paintOverlay() {
  const overlay = $("#mask-overlay");
  const ctx = overlay.getContext("2d");
  ctx.clearRect(0, 0, overlay.width, overlay.height);

  const mode = State.get("brushMode");
  if (mode === "off") return;

  const dpr = overlay.width / Math.max(overlay.getBoundingClientRect().width, 1);

  if (boxDrag) {
    const a = boxDrag.fromScreen, b = boxDrag.toScreen;
    const bx = Math.min(a.cx, b.cx) * dpr, by = Math.min(a.cy, b.cy) * dpr;
    const bw = Math.abs(b.cx - a.cx) * dpr, bh = Math.abs(b.cy - a.cy) * dpr;
    ctx.lineWidth = Math.max(1, dpr);
    ctx.setLineDash([6 * dpr, 4 * dpr]);
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.strokeRect(bx - dpr, by - dpr, bw + 2 * dpr, bh + 2 * dpr);
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.strokeRect(bx, by, bw, bh);
    ctx.setLineDash([]);
    return;
  }

  if (!hoverPoint) return;
  const x = hoverPoint.cx * dpr;
  const y = hoverPoint.cy * dpr;

  ctx.lineWidth = Math.max(1, dpr);
  if (mode === "box" || mode === "wand") {
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    const k = 9 * dpr;
    ctx.beginPath();
    ctx.moveTo(x - k, y); ctx.lineTo(x - 2 * dpr, y);
    ctx.moveTo(x + 2 * dpr, y); ctx.lineTo(x + k, y);
    ctx.moveTo(x, y - k); ctx.lineTo(x, y - 2 * dpr);
    ctx.moveTo(x, y + 2 * dpr); ctx.lineTo(x, y + k);
    ctx.stroke();
    return;
  }

  // The brush is sized against the picture, so the ring on screen has to come
  // back through the same transform. The canvas is one unit tall in the
  // geometry pass, so one unit is exactly the artboard's height in pixels;
  // everything else is how much of a unit the picture's height occupies.
  const s = State.data;
  const mh = app.pixels ? app.pixels.height : 1;
  const mLong = app.pixels ? Math.max(app.pixels.width, app.pixels.height) : 1;
  const imgA = app.sourceSize[0] / Math.max(app.sourceSize[1], 1);
  const A = Math.max(app.renderer.width, 1) / Math.max(app.renderer.height, 1);
  let fh = A / Math.max(imgA, 0.0001);
  if (s.fit === "cover") fh = Math.max(1, fh);
  else if (s.fit === "contain") fh = Math.min(1, fh);
  else fh = 1;
  const r = Math.max(3,
    (s.brushSize * 0.5 * mLong / mh) * fh * s.zoom * overlay.height);

  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.strokeStyle = mode === "erase" ? "rgba(255,120,120,0.9)" : "rgba(255,255,255,0.9)";
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, r + dpr, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(0,0,0,0.45)";
  ctx.stroke();
}

function setupBrush() {
  const overlay = $("#mask-overlay");
  let painting = false;
  let last = null;

  const track = (e) => {
    const rect = overlay.getBoundingClientRect();
    hoverPoint = { cx: e.clientX - rect.left, cy: e.clientY - rect.top };
    paintOverlay();
  };

  overlay.addEventListener("pointerdown", (e) => {
    const mode = State.get("brushMode");
    if (mode === "off" || !app.pixels) return;
    const p = canvasToSource(e.clientX, e.clientY);
    if (!p.inside) return;
    e.preventDefault();
    overlay.setPointerCapture(e.pointerId);

    if (mode === "box") {
      const rect = overlay.getBoundingClientRect();
      boxDrag = {
        from: p,
        to: p,
        fromScreen: { cx: e.clientX - rect.left, cy: e.clientY - rect.top },
        toScreen: { cx: e.clientX - rect.left, cy: e.clientY - rect.top },
      };
      track(e);
      return;
    }

    if (mode === "wand") {
      const s = State.data;
      const picked = Segment.wand(app.pixels, app.mask, p.x, p.y, {
        tolerance: s.wandTol,
        feather: Math.max(0.05, s.maskFeather * 0.6),
        mode: e.altKey ? "subtract" : app.mask ? "add" : "replace",
      });
      commitMask(picked, "picked");
      toast(e.altKey ? "Removed that colour" : "Added that colour");
      return;
    }

    painting = true;
    // One undo step per stroke, not per pointer event.
    maskPast.push({ mask: copyMask(app.mask), from: app.maskFrom });
    if (maskPast.length > MASK_HISTORY) maskPast.shift();
    maskFuture.length = 0;
    maskWasLast = true;

    if (!app.mask) {
      // The first brush stroke on an unmasked picture starts from nothing
      // selected, which is the only reading that makes "Add" mean anything.
      app.mask = Segment.clear(app.pixels.width, app.pixels.height);
    } else {
      app.mask = { data: app.mask.data.slice(), width: app.mask.width, height: app.mask.height };
    }
    app.maskFrom = "painted";

    last = p;
    stampMask(app.mask, p.x, p.y, State.get("brushSize") * 0.5, mode === "erase" ? 0 : 1);
    app.renderer.setMask(app.mask);
    updateStatus();
    dirty = true;
    track(e);
  });

  overlay.addEventListener("pointermove", (e) => {
    if (boxDrag) {
      const rect = overlay.getBoundingClientRect();
      boxDrag.to = canvasToSource(e.clientX, e.clientY);
      boxDrag.toScreen = { cx: e.clientX - rect.left, cy: e.clientY - rect.top };
      track(e);
      return;
    }
    track(e);
    if (!painting) return;
    const p = canvasToSource(e.clientX, e.clientY);
    const mode = State.get("brushMode");
    strokeMask(app.mask, last, p, State.get("brushSize") * 0.5, mode === "erase" ? 0 : 1);
    last = p;
    app.renderer.setMask(app.mask);
    dirty = true;
  });

  const release = () => {
    if (boxDrag) {
      const b = boxDrag;
      boxDrag = null;
      paintOverlay();
      cutFromBox(b.from, b.to);
      return;
    }
    if (!painting) return;
    painting = false;
    last = null;
    app.renderer.setMask(app.mask);
    updateStatus();
    dirty = true;
  };
  overlay.addEventListener("pointerup", release);
  overlay.addEventListener("pointercancel", release);
  overlay.addEventListener("pointerleave", () => { hoverPoint = null; paintOverlay(); });

  return () => {
    const mode = State.get("brushMode");
    overlay.classList.toggle("painting", mode !== "off");
    overlay.classList.toggle("erasing", mode === "erase");
    if (mode === "off") { hoverPoint = null; boxDrag = null; }
    paintOverlay();
  };
}

/* ---------------------------------------------------------------- status */

function setBusy(text) {
  busyText = text || "";
  $("#stat-msg").textContent = busyText;
  const msg = $("#stage-msg");
  msg.hidden = !busyText;
  msg.textContent = busyText;
  updateStatus();
}

let lastStatus = 0;
function updateStatus(now = 0) {
  if (now && now - lastStatus < 240) return;
  lastStatus = now;
  const s = State.data;
  $("#stat-size").textContent = `${s.width} × ${s.height}`;
  $("#stat-mask").textContent = app.mask
    ? `${app.maskFrom || "set"} ${app.mask.width}×${app.mask.height}`
    : app.pixels ? "none" : "—";
  $("#stat-fps").textContent = String(Math.min(240, Math.round(1000 / Math.max(frameEma, 1))));
  const dot = $("#stat-dot");
  dot.className = "dot" +
    (stopRecording ? " rec" : busyText ? " busy" : State.get("animate") ? " live" : "");

  const undo = $("#btn-undo"), redo = $("#btn-redo");
  if (undo) undo.disabled = !(State.canUndo() || maskPast.length);
  if (redo) redo.disabled = !(State.canRedo() || maskFuture.length);

  const fit = $("#hud-fit");
  if (fit) fit.textContent = { cover: "Cover", contain: "Contain", stretch: "Stretch" }[s.fit] || "Fit";
}

/* -------------------------------------------------------------- the loop */

let last = performance.now();
let frameEma = 16;
let lastDraw = 0;

function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  if (document.hidden || !app.renderer) return;

  // The animated effects — wave, glitch, grain — are the only readers of the
  // clock, so a still edit advances nothing and costs one frame per change.
  if (State.get("animate")) {
    app.clock += dt * State.get("animSpeed");
    dirty = true;
  }
  if (!dirty) return;
  dirty = false;
  if (lastDraw) frameEma = frameEma * 0.88 + (now - lastDraw) * 0.12;
  lastDraw = now;
  app.renderer.render(State.data, app.clock);
  updateStatus(now);
}

/* --------------------------------------------------------------- session */

function setTheme(next) {
  document.documentElement.dataset.theme = next;
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", next === "light" ? "#eeeeef" : "#0a0a0b");
  store.set(THEME_KEY, next);
}

function pickFile(accept, onFile) {
  const input = el("input", { type: "file", accept });
  input.addEventListener("change", () => onFile(input.files?.[0]));
  input.click();
}

async function loadSettingsFile(file) {
  if (!file) return;
  try {
    const obj = JSON.parse(await file.text());
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) throw new Error("shape");
    const incoming = { ...State.DEFAULTS, ...obj };
    for (const k of NOT_PORTABLE) incoming[k] = State.get(k);
    State.patch(incoming, { source: "load" });
    toast("Settings loaded");
  } catch {
    toast("That file is not settings JSON");
  }
}

async function pasteImage() {
  if (!navigator.clipboard?.read) {
    toast("This browser only pastes with ⌘V on the page");
    return;
  }
  try {
    for (const item of await navigator.clipboard.read()) {
      const type = item.types.find((t) => t.startsWith("image/"));
      if (type) return void openBlob(await item.getType(type), "clipboard");
    }
    toast("No picture on the clipboard");
  } catch {
    toast("Clipboard blocked — press ⌘V on the page instead");
  }
}

function toggleRecording() {
  const btn = document.querySelector('[data-action="rec"]');
  const label = btn?.querySelector("span");
  if (stopRecording) { stopRecording(); stopRecording = null; return; }
  if (!app.renderer.hasImage) { toast("Open a picture first"); return; }
  if (!State.get("animate")) { toast("Switch Animate on first — a still frame makes a still clip"); return; }

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
    case "open": pickFile("image/*", (f) => f && openBlob(f, f.name)); break;
    case "paste": pasteImage(); break;
    case "sample": {
      const c = makeSample();
      setSource(c, null, "sample");
      toast("Sample loaded — press Find subject");
      break;
    }

    case "detect": detectSubject(); break;
    case "invertMask": invertSelection(); break;
    case "clearMask": clearSelection(); break;

    case "png1": Export.save(app, 1); break;
    case "png2": Export.save(app, 2); break;
    case "copy": Export.copy(app); break;
    case "rec": toggleRecording(); break;

    case "share": {
      const url = `${location.origin}${location.pathname}#${State.encode()}`;
      navigator.clipboard?.writeText(url).then(
        () => toast("Link copied — it carries the treatment, not the picture"),
        () => { location.hash = State.encode(); toast("Link is in the address bar"); });
      break;
    }
    case "save": {
      const doc = State.diff();
      for (const k of NOT_PORTABLE) delete doc[k];
      download(new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" }),
        "isaiart-image-settings.json");
      toast("Settings saved");
      break;
    }
    case "load": pickFile("application/json,.json", loadSettingsFile); break;
    case "reset":
      toast(State.reset().length ? "Back to defaults — ⌘Z to undo" : "Already at defaults");
      break;
  }
}

/** Dropping either a picture or a settings file anywhere on the page works. */
function setupDrop() {
  const zone = $("#stage-drop");
  let depth = 0;

  addEventListener("dragenter", (e) => {
    if (!e.dataTransfer?.types?.includes("Files")) return;
    depth++;
    zone.classList.add("over");
  });
  addEventListener("dragleave", () => {
    depth = Math.max(0, depth - 1);
    if (!depth) zone.classList.remove("over");
  });
  addEventListener("dragover", (e) => { e.preventDefault(); });
  addEventListener("drop", (e) => {
    depth = 0;
    zone.classList.remove("over");
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    e.preventDefault();
    if (/^image\//.test(file.type)) openBlob(file, file.name);
    else if (/\.json$/i.test(file.name) || file.type === "application/json") loadSettingsFile(file);
    else toast("Drop a picture, or a settings .json");
  });

  // The drop plate is also the obvious thing to press before anything exists.
  zone.addEventListener("click", () => handleAction("open"));

  addEventListener("paste", (e) => {
    const item = Array.from(e.clipboardData?.items || [])
      .find((i) => i.kind === "file" && i.type.startsWith("image/"));
    if (!item) return;
    e.preventDefault();
    openBlob(item.getAsFile(), "clipboard");
  });
}

/* ------------------------------------------------------------- bar menus */

const SIZES = [
  ["HD", 1920, 1080],
  ["QHD", 2560, 1440],
  ["4K", 3840, 2160],
  ["Square", 1440, 1440],
  ["Story", 1080, 1920],
  ["Print", 2480, 3508],
];

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

  const sizes = SIZES.map(([label, w, h]) => el("button", {
    class: "pop-item", type: "button", role: "menuitem",
    "aria-selected": String(s.width === w && s.height === h),
    onclick: () => { State.patch({ aspect: "free", width: w, height: h }); window.ISO.closePop(); },
  }, el("span", { text: label }), el("span", { class: "pop-tag", text: `${w}×${h}` })));

  menu($("#btn-canvas"), "Canvas size", [
    el("p", { class: "menu-title", text: "Ratio" }),
    el("div", { class: "menu-chips" }, chips),
    el("p", { class: "menu-title", text: "Size" }),
    el("div", { class: "menu-list" }, sizes),
    el("div", { class: "menu-foot" },
      el("button", {
        class: "btn", type: "button", disabled: !app.pixels,
        onclick: () => { window.ISO.closePop(); matchCanvasToImage(); toast("Canvas matched to the picture"); },
      }, icon("image"), el("span", { text: "Match picture" })),
      el("button", {
        class: "btn", type: "button",
        onclick: () => {
          window.ISO.closePop();
          State.patch({ aspect: "free", width: s.height, height: s.width });
        },
      }, icon("swap"), el("span", { text: "Turn" }))),
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
          toast(State.clear().length ? "Treatment cleared — ⌘Z to undo" : "Nothing to clear");
        },
      }, icon("reset"), el("span", { text: "Clear look" }))),
  ]);
}

/* ---------------------------------------------------------------- wiring */

function setupBar() {
  $("#btn-undo").append(icon("undo"));
  $("#btn-redo").append(icon("redo"));
  $("#btn-open").append(icon("open"));
  $("#btn-presets").append(icon("presets"));
  $("#btn-canvas").append(icon("canvas"));
  $("#btn-random").append(icon("dice"));
  $("#btn-theme").append(icon("contrast"));
  $("#btn-full").append(icon("expand"));
  $("#btn-help").append(icon("help"));
  $("#btn-export").prepend(icon("download"));

  $("#btn-undo").addEventListener("click", doUndo);
  $("#btn-redo").addEventListener("click", doRedo);
  $("#btn-open").addEventListener("click", () => handleAction("open"));
  $("#btn-presets").addEventListener("click", openPresetMenu);
  $("#btn-canvas").addEventListener("click", openCanvasMenu);
  $("#btn-export").addEventListener("click", () => Export.save(app, 1));
  $("#btn-random").addEventListener("click", () => { State.randomize(); toast("Randomised — ⌘Z to undo"); });
  $("#btn-theme").addEventListener("click", () =>
    setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));
  $("#btn-full").addEventListener("click", () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.().catch(() => toast("Fullscreen refused"));
  });

  const FITS = ["cover", "contain", "stretch"];
  $("#hud-fit").addEventListener("click", () => {
    const i = FITS.indexOf(State.get("fit"));
    State.set("fit", FITS[(i + 1) % FITS.length]);
  });

  const help = $("#help");
  let lastFocus = null;
  app.openHelp = () => {
    lastFocus = document.activeElement;
    help.hidden = false;
    $("#help-close").focus({ preventScroll: true });
  };
  app.closeHelp = () => {
    if (help.hidden) return;
    help.hidden = true;
    lastFocus?.focus?.({ preventScroll: true });
  };
  $("#btn-help").addEventListener("click", () => (help.hidden ? app.openHelp() : app.closeHelp()));
  $("#help-close").addEventListener("click", app.closeHelp);
  help.addEventListener("click", (e) => { if (e.target === help) app.closeHelp(); });
  help.addEventListener("keydown", (e) => { if (e.key === "Escape") app.closeHelp(); });
}

function doUndo() {
  // The mask is not a parameter, so it keeps its own history; undo prefers
  // whichever of the two was touched last, which is what a photo tool does.
  if (maskWasLast && maskPast.length) {
    undoMask();
    toast("Undo selection");
    return;
  }
  if (State.undo()) toast("Undo");
  else if (undoMask()) toast("Undo selection");
  else toast("Nothing to undo");
}

function doRedo() {
  if (maskWasLast && maskFuture.length) {
    redoMask();
    toast("Redo selection");
    return;
  }
  if (State.redo()) toast("Redo");
  else if (redoMask()) toast("Redo selection");
  else toast("Nothing to redo");
}

function setupKeys() {
  addEventListener("keydown", (e) => {
    const t = e.target;
    const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" ||
      t.isContentEditable || t.closest?.(".pop, .modal"));
    const k = e.key.toLowerCase();
    const mod = e.metaKey || e.ctrlKey;

    if (mod && k === "z") {
      e.preventDefault();
      e.shiftKey ? doRedo() : doUndo();
      return;
    }
    if (mod && k === "y") { e.preventDefault(); doRedo(); return; }
    if (mod && (k === "backspace" || k === "delete")) {
      e.preventDefault();
      toast(State.clear().length ? "Treatment cleared — ⌘Z to undo" : "Nothing to clear");
      return;
    }

    if (typing) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.repeat) return;

    if (k === "o") handleAction("open");
    else if (k === "r") { State.randomize(); toast("Randomised — ⌘Z to undo"); }
    else if (k === "e") Export.save(app, 1);
    else if (k === "d") detectSubject();
    else if (k === "m") State.set("showMask", !State.get("showMask"));
    else if (k === "t") setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
    else if (k === "f") $("#btn-full").click();
    else if (k === "p") openPresetMenu();
    else if (k === "c") openCanvasMenu();
    else if (k === "?" || (k === "/" && e.shiftKey)) {
      if ($("#help").hidden) app.openHelp?.(); else app.closeHelp?.();
    } else if (k === "escape") { app.closeHelp?.(); window.ISO.closePop?.(); }
    else if (k >= "1" && k <= "6") {
      const panel = State.SCHEMA[+k - 1];
      if (panel) rail.select(panel.id);
    }
  });
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

let syncBrush;

function onChange({ keys, fx, source }) {
  if (source !== "preset") activePreset = null;
  // A parameter edit means the parameter store is what undo should step back
  // through — until the selection is touched again.
  if (source !== "undo" && source !== "redo") maskWasLast = false;

  if (keys.includes("aspect") && source !== "size") applyAspect();
  if (fx.has("size")) applySize();
  if (keys.includes("brushMode") || keys.includes("brushSize") ||
      keys.includes("fit") || keys.includes("zoom")) syncBrush();
  if (keys.includes("autosave")) rememberAutosave();

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
  setupBar();
  setupKeys();
  adoptTitles();

  $("#rail").addEventListener("iso-action", (e) => handleAction(e.detail));
  $("#rail").addEventListener("iso-preset", (e) => {
    State.applyPreset(e.detail);
    activePreset = e.detail;
    const preset = State.PRESETS.find((p) => p.id === e.detail);
    toast(`${preset?.name || "Preset"} — ⌘Z to undo`);
  });

  try {
    app.renderer = new window.ISO.ImageRenderer($("#gl"));
  } catch (err) {
    console.error(err);
    fail(String(err.message || err));
    return;
  }

  app.renderer.onRestore = () => {
    applySize();
    app.renderer.setMask(app.mask);
    dirty = true;
  };

  syncBrush = setupBrush();
  State.on(onChange);

  applySize();
  syncBrush();
  updateStatus();

  const relayout = () => { layoutArtboard(); paintOverlay(); dirty = true; };
  addEventListener("resize", relayout);
  addEventListener("orientationchange", () => setTimeout(relayout, 120));
  if ("ResizeObserver" in window) new ResizeObserver(relayout).observe($("#stage"));

  setupDrop();
  requestAnimationFrame(loop);
  window.ISO.app = app;
}

if (document.readyState === "loading") addEventListener("DOMContentLoaded", boot);
else boot();
})();
