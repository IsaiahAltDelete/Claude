/* ---------------------------------------------------------------------------
   The parameter model.

   One schema describes every control in the app: its type, range, default and
   — importantly — which part of the pipeline it invalidates. The rail UI, the
   URL codec, presets, randomising and the renderer all read from this single
   table, so adding a parameter means adding one line here.

   fx:  "atlas" rebuilds the glyph texture, "inst" reallocates instance
        buffers, "tile" repaints the background pattern, "size" resizes the
        render targets. Everything else is a uniform and costs nothing.
   --------------------------------------------------------------------------- */

(() => {
const { clamp, store, encodeState, decodeState } = window.ISO;

/* ------------------------------------------------------------------ fonts */

const FONTS = [
  { id: "anton",      name: "Anton",              css: '"Anton"',              weights: [400],           cat: "display" },
  { id: "archivo",    name: "Archivo Black",      css: '"Archivo Black"',      weights: [400],           cat: "display" },
  { id: "bebas",      name: "Bebas Neue",         css: '"Bebas Neue"',         weights: [400],           cat: "display" },
  { id: "oswald",     name: "Oswald",             css: '"Oswald"',             weights: [400, 700],      cat: "cond" },
  { id: "inter",      name: "Inter",              css: '"Inter"',              weights: [400, 500, 700], cat: "sans" },
  { id: "grotesk",    name: "Space Grotesk",      css: '"Space Grotesk"',      weights: [400, 700],      cat: "sans" },
  { id: "syne",       name: "Syne",               css: '"Syne"',               weights: [400, 800],      cat: "sans" },
  { id: "playfair",   name: "Playfair Display",   css: '"Playfair Display"',   weights: [400, 700, 900], cat: "serif" },
  { id: "dmserif",    name: "DM Serif Display",   css: '"DM Serif Display"',   weights: [400],           cat: "serif" },
  { id: "instrument", name: "Instrument Serif",   css: '"Instrument Serif"',   weights: [400],           cat: "serif" },
  { id: "jetbrains",  name: "JetBrains Mono",     css: '"JetBrains Mono"',     weights: [400, 600],      cat: "mono" },
  { id: "majormono",  name: "Major Mono Display", css: '"Major Mono Display"', weights: [400],           cat: "mono" },
  { id: "vt323",      name: "VT323",              css: '"VT323"',              weights: [400],           cat: "pixel" },
  { id: "orbitron",   name: "Orbitron",           css: '"Orbitron"',           weights: [500, 900],      cat: "tech" },
  { id: "bungee",     name: "Bungee",             css: '"Bungee"',             weights: [400],           cat: "display" },
  { id: "monoton",    name: "Monoton",            css: '"Monoton"',            weights: [400],           cat: "retro" },
  { id: "glitch",     name: "Rubik Glitch",       css: '"Rubik Glitch"',       weights: [400],           cat: "retro" },
  { id: "system",     name: "System Sans",        css: "system-ui, sans-serif", weights: [400, 700, 900], cat: "sys" },
  { id: "sysserif",   name: "System Serif",       css: "Georgia, 'Times New Roman', serif", weights: [400, 700], cat: "sys" },
  { id: "sysmono",    name: "System Mono",        css: "ui-monospace, Menlo, monospace", weights: [400, 700], cat: "sys" },
];
const FONT_BY_ID = Object.fromEntries(FONTS.map((f) => [f.id, f]));

const EMOJI = ["★", "✦", "✳", "◆", "●", "▲", "✕", "⌁", "☾", "☀",
               "🛰", "🪐", "👾", "🛸", "💿", "📼", "🔋", "🧊", "🌀", "⚡",
               "🖤", "🤍", "🔥", "💀", "🫧", "🌑", "📡", "🧿", "🕳", "✨"];

/* ------------------------------------------------------------ enumerations */

const FORMATIONS = [
  ["line", "Line"], ["tunnel", "Tunnel"], ["helix", "Helix"], ["grid", "Grid"],
  ["wall", "Wave wall"], ["sphere", "Sphere"], ["torus", "Torus"], ["vortex", "Vortex"],
  ["galaxy", "Galaxy"], ["cloud", "Cloud"], ["rings", "Rings"], ["corridor", "Corridor"],
  ["column", "Column"], ["ribbon", "Ribbon"], ["arc", "Arc"], ["shell", "Shell"],
];

const EFFECTS = [
  ["fill", "Fill"], ["outline", "Outline"], ["both", "Fill + outline"],
  ["extrude", "Extrude"], ["shadow", "Long shadow"], ["gradient", "Gradient"],
  ["chrome", "Chrome"], ["split", "RGB split"], ["inline", "Inline"],
  ["stripe", "Stripes"], ["halftone", "Halftone"], ["grain", "Grain"],
  ["glow", "Glow"], ["knockout", "Knockout"], ["plate", "Plate"],
  ["echo", "Echo"], ["scan", "Scanline"], ["chop", "Chop"],
];

const BACKGROUNDS = [
  ["solid", "Solid"], ["linear", "Linear"], ["radial", "Radial"], ["grid", "Grid"],
  ["dots", "Dots"], ["stripes", "Stripes"], ["noise", "Noise"], ["pattern", "Pattern"],
  ["none", "Transparent"],
];

const ASPECTS = [
  ["16:9", 1920, 1080], ["9:16", 1080, 1920], ["1:1", 1440, 1440],
  ["4:5", 1440, 1800], ["3:2", 1800, 1200], ["2:3", 1200, 1800],
  ["21:9", 2100, 900], ["4:3", 1600, 1200],
];

/* ----------------------------------------------------------------- schema */

const S = (k, l, min, max, step, d, extra) => ({ k, t: "slider", l, min, max, step, d, ...extra });

const SCHEMA = [
  {
    id: "type", label: "Type",
    sections: [
      {
        title: "Content",
        controls: [
          { k: "text", t: "text", l: "Text", d: "ISAIART", area: true, fx: "atlas",
            ph: "Type anything. Emoji welcome." },
          { k: "emoji", t: "emoji", l: "Insert", fx: "atlas" },
          { k: "split", t: "seg", l: "Split", d: "phrase", fx: "atlas",
            opts: [["phrase", "Phrase"], ["words", "Words"], ["chars", "Chars"], ["lines", "Lines"]] },
          { k: "case", t: "seg", l: "Case", d: "upper", fx: "atlas",
            opts: [["asis", "As is"], ["upper", "AA"], ["lower", "aa"], ["title", "Aa"]] },
          { k: "contentBtns", t: "buttons", l: "Canvas",
            items: [["clear", "Clear"], ["undo", "Undo"], ["redo", "Redo"]] },
        ],
      },
      {
        title: "Face",
        controls: [
          { k: "font", t: "select", l: "Typeface", d: "anton", fx: "atlas", preview: true,
            opts: FONTS.map((f) => [f.id, f.name, f.cat]) },
          { k: "weight", t: "seg", l: "Weight", d: 400, fx: "atlas", dynamic: "weights", opts: [[400, "400"]] },
          S("tracking", "Tracking", -0.08, 0.8, 0.005, 0, { fx: "atlas", unit: "em", bipolar: true }),
          S("lineGap", "Line height", 0.7, 2.2, 0.01, 1, { fx: "atlas" }),
          { k: "align", t: "seg", l: "Align", d: "center", fx: "atlas",
            opts: [["left", "Left"], ["center", "Centre"], ["right", "Right"]] },
        ],
      },
      {
        title: "Treatment",
        controls: [
          { k: "effect", t: "select", l: "Effect", d: "fill", fx: "atlas", opts: EFFECTS },
          S("effectAmt", "Amount", 0, 1, 0.01, 0.5, { fx: "atlas" }),
          S("stroke", "Line weight", 0, 0.24, 0.002, 0.05, { fx: "atlas", unit: "em" }),
          { k: "fillA", t: "color", l: "Ink", d: "#f4f4f5", fx: "atlas" },
          { k: "fillB", t: "color", l: "Second ink", d: "#6f6f76", fx: "atlas" },
          { k: "glyphRes", t: "seg", l: "Texture", d: 512, fx: "atlas",
            opts: [[256, "256"], [512, "512"], [768, "768"], [1024, "1K"]] },
        ],
      },
    ],
  },

  {
    id: "space", label: "Space",
    sections: [
      {
        title: "Formation",
        controls: [
          { k: "formation", t: "select", l: "Shape", d: "tunnel", opts: FORMATIONS },
          S("count", "Copies", 1, 3000, 1, 240, { fx: "inst", int: true }),
          S("radius", "Spread", 0, 4, 0.01, 1.7),
          S("depth", "Depth", 0.2, 12, 0.01, 6),
          S("turns", "Turns", 0, 12, 0.05, 2),
          S("scatter", "Scatter", 0, 1, 0.01, 0.12),
          S("stagger", "Stagger", 0, 1, 0.01, 0),
        ],
      },
      {
        title: "Instance",
        controls: [
          S("size", "Size", 0.02, 3, 0.005, 0.3),
          S("sizeVar", "Size jitter", 0, 1, 0.01, 0.1),
          S("sizeDepth", "Size by depth", -1, 1, 0.01, 0, { bipolar: true }),
          { k: "facing", t: "seg", l: "Facing", d: "billboard",
            opts: [["billboard", "Camera"], ["flat", "Flat"], ["radial", "Radial"], ["flow", "Flow"]] },
          S("roll", "Roll", -180, 180, 1, 0, { unit: "°", bipolar: true, int: true }),
          S("rollVar", "Roll jitter", 0, 180, 1, 0, { unit: "°", int: true }),
        ],
      },
      {
        title: "Camera",
        controls: [
          S("fov", "Lens", 15, 120, 1, 64, { unit: "°", int: true }),
          S("dist", "Distance", 0.2, 14, 0.01, 3.2),
          { k: "look", t: "pad", l: "Frame", d: [0, 0], keys: ["panX", "panY"] },
          S("yaw", "Yaw", -180, 180, 0.5, 0, { unit: "°", bipolar: true }),
          S("pitch", "Pitch", -89, 89, 0.5, 0, { unit: "°", bipolar: true }),
          S("orbit", "Auto orbit", -1, 1, 0.01, 0, { bipolar: true }),
        ],
      },
    ],
  },

  {
    id: "motion", label: "Motion",
    sections: [
      {
        title: "Flow",
        controls: [
          S("speed", "Travel", -3, 3, 0.01, 0.35, { bipolar: true }),
          S("spin", "Field spin", -2, 2, 0.01, 0.05, { bipolar: true }),
          S("swirl", "Swirl", -2, 2, 0.01, 0, { bipolar: true }),
          S("tumble", "Tumble", -3, 3, 0.01, 0, { bipolar: true }),
        ],
      },
      {
        title: "Disturbance",
        controls: [
          S("wobble", "Wobble", 0, 1.5, 0.01, 0),
          S("wobbleFreq", "Wobble rate", 0.05, 6, 0.01, 1),
          S("turb", "Turbulence", 0, 1.5, 0.01, 0),
          S("turbScale", "Turb scale", 0.1, 6, 0.01, 1.2),
          S("pulse", "Pulse", 0, 1, 0.01, 0),
          S("pulseRate", "Pulse rate", 0.05, 8, 0.01, 1.4),
        ],
      },
      {
        title: "Drift",
        controls: [
          { k: "drift", t: "pad", l: "Direction", d: [0, 0], keys: ["driftX", "driftY"] },
          S("driftAmt", "Drift rate", 0, 2, 0.01, 0),
          { k: "playing", t: "toggle", l: "Animate", d: true },
        ],
      },
    ],
  },

  {
    id: "look", label: "Look",
    sections: [
      {
        title: "Colour",
        controls: [
          { k: "colorMode", t: "seg", l: "Mode", d: "solid",
            opts: [["solid", "Solid"], ["depth", "Depth"], ["index", "Index"], ["random", "Random"]] },
          { k: "tintA", t: "color", l: "Tint A", d: "#ffffff" },
          { k: "tintB", t: "color", l: "Tint B", d: "#7c7c84", dep: (s) => s.colorMode !== "solid" },
          { k: "blend", t: "seg", l: "Blend", d: "normal",
            opts: [["normal", "Normal"], ["add", "Add"], ["screen", "Screen"], ["mult", "Mult"]] },
          S("opacity", "Opacity", 0.02, 1, 0.01, 1),
          S("fog", "Depth fade", 0, 1, 0.01, 0.85),
        ],
      },
      {
        title: "Background",
        controls: [
          { k: "bgType", t: "select", l: "Field", d: "linear", opts: BACKGROUNDS },
          { k: "bgA", t: "color", l: "Base", d: "#0c0c0e", dep: (s) => s.bgType !== "none" },
          { k: "bgB", t: "color", l: "Second", d: "#212127",
            dep: (s) => ["linear", "radial", "grid", "dots", "stripes", "noise", "pattern"].includes(s.bgType) },
          S("bgAngle", "Angle", 0, 360, 1, 160, { unit: "°", int: true, dep: (s) => ["linear", "stripes"].includes(s.bgType) }),
          S("bgScale", "Scale", 0.1, 6, 0.01, 1, { dep: (s) => ["grid", "dots", "stripes", "noise", "pattern", "radial"].includes(s.bgType) }),
        ],
      },
      {
        title: "Pattern",
        dep: (s) => s.bgType === "pattern",
        controls: [
          { k: "patText", t: "text", l: "Glyph", d: "✦", fx: "tile" },
          { k: "patFont", t: "select", l: "Face", d: "system", fx: "tile", preview: true,
            opts: FONTS.map((f) => [f.id, f.name, f.cat]) },
          S("patSize", "Glyph size", 0.05, 0.9, 0.005, 0.42, { fx: "tile" }),
          S("patRot", "Rotation", -180, 180, 1, 0, { unit: "°", bipolar: true, int: true }),
          S("patJitter", "Jitter", 0, 1, 0.01, 0),
          S("patOpacity", "Opacity", 0, 1, 0.01, 0.5),
          S("patDrift", "Drift", -1, 1, 0.01, 0, { bipolar: true }),
        ],
      },
      {
        title: "Post",
        controls: [
          S("bloom", "Bloom", 0, 1.5, 0.01, 0),
          S("chroma", "Aberration", 0, 1, 0.01, 0),
          S("grain", "Grain", 0, 1, 0.01, 0.05),
          S("scan", "Scanlines", 0, 1, 0.01, 0),
          S("vignette", "Vignette", 0, 1, 0.01, 0.25),
          S("pixelate", "Pixelate", 0, 1, 0.01, 0),
          S("posterize", "Posterise", 0, 1, 0.01, 0),
          S("contrast", "Contrast", -1, 1, 0.01, 0, { bipolar: true }),
          { k: "invert", t: "toggle", l: "Invert", d: false },
        ],
      },
    ],
  },

  {
    id: "out", label: "Out",
    sections: [
      {
        title: "Canvas",
        controls: [
          { k: "aspect", t: "seg", l: "Ratio", d: "16:9", fx: "size", wrap: 4,
            opts: ASPECTS.map((a) => [a[0], a[0]]) },
          { k: "dims", t: "vec", l: "Size", d: [1920, 1080], fx: "size", keys: ["width", "height"],
            min: 160, max: 4096, unit: "px" },
          S("renderScale", "Render scale", 0.4, 2, 0.05, 1, { fx: "size" }),
          { k: "quality", t: "seg", l: "Quality", d: "balanced", fx: "size",
            opts: [["eco", "Eco"], ["balanced", "Balanced"], ["high", "High"]] },
        ],
      },
      {
        title: "Export",
        controls: [
          { k: "exportPng", t: "buttons", l: "Still",
            items: [["png1", "PNG 1×"], ["png2", "PNG 2×"], ["copy", "Copy"]] },
          S("clipLength", "Clip length", 1, 30, 0.5, 6, { unit: "s" }),
          { k: "clipFps", t: "seg", l: "Frame rate", d: 30, opts: [[24, "24"], [30, "30"], [60, "60"]] },
          { k: "record", t: "buttons", l: "Motion", items: [["rec", "Record clip"]] },
        ],
      },
      {
        title: "Session",
        controls: [
          { k: "presetPick", t: "presets", l: "Presets" },
          { k: "sessionBtns", t: "buttons", l: "State",
            items: [["share", "Link"], ["save", "Save"], ["load", "Load"], ["reset", "Reset"]] },
          { k: "autosave", t: "toggle", l: "Remember settings", d: true },
        ],
      },
    ],
  },
];

/* --------------------------------------------------- flatten + defaults */

const FIELDS = new Map();     // key → control descriptor
const DEFAULTS = {};

for (const panel of SCHEMA) {
  for (const sec of panel.sections) {
    for (const c of sec.controls) {
      c.panel = panel.id;
      if (c.t === "pad" || c.t === "vec") {
        c.keys.forEach((key, i) => {
          FIELDS.set(key, { ...c, k: key, t: c.t === "pad" ? "padAxis" : "vecAxis", index: i });
          DEFAULTS[key] = c.d[i];
        });
      } else if (c.d !== undefined) {
        FIELDS.set(c.k, c);
        DEFAULTS[c.k] = c.d;
      }
    }
  }
}

/* Randomising leaves the things you chose deliberately alone. */
const NO_RANDOM = new Set([
  "text", "patText", "width", "height", "aspect", "renderScale", "quality",
  "glyphRes", "clipLength", "clipFps", "autosave", "playing", "invert",
]);

/* ------------------------------------------------------------ built-ins */

const PRESETS = [
  { id: "void", name: "Void tunnel", patch: {
    text: "ISAIART", font: "anton", case: "upper", split: "phrase", effect: "both", stroke: 0.03,
    fillA: "#f4f4f5", fillB: "#101014", formation: "tunnel", count: 260, radius: 1.7, depth: 6,
    size: 0.3, speed: 0.35, spin: 0.05, facing: "billboard", colorMode: "depth",
    tintA: "#ffffff", tintB: "#5b5b62", bgType: "linear", bgA: "#0a0a0c", bgB: "#1d1d22",
    fog: 0.85, vignette: 0.3, grain: 0.05, bloom: 0.1 } },
  { id: "ticker", name: "Ticker", patch: {
    text: "DESIGN\nSTUDIO\nISAIART", font: "grotesk", weight: 700, split: "lines", case: "upper",
    effect: "fill", formation: "line", count: 60, depth: 9, size: 0.5, tracking: 0.12,
    speed: 0.8, spin: 0, facing: "billboard", colorMode: "solid", tintA: "#f2f2f3",
    bgType: "solid", bgA: "#0b0b0d", fog: 0.35, scan: 0.18, grain: 0.06, vignette: 0.2 } },
  { id: "swarm", name: "Emoji swarm", patch: {
    text: "🛰 👾 🪐 ✦", split: "words", font: "system", effect: "fill", formation: "cloud",
    count: 900, radius: 2.2, depth: 6, size: 0.34, sizeVar: 0.6, scatter: 0.9, speed: 0.2,
    tumble: 0.4, facing: "billboard", colorMode: "solid", tintA: "#ffffff",
    bgType: "radial", bgA: "#0b0b0d", bgB: "#232329", fog: 0.5, bloom: 0.25, grain: 0.04 } },
  { id: "galaxy", name: "Galaxy", patch: {
    text: "✦", split: "chars", font: "system", effect: "glow", formation: "galaxy", count: 1400,
    radius: 2.6, turns: 4.5, depth: 1.4, size: 0.14, sizeVar: 0.8, speed: 0, spin: 0.12,
    pitch: -58, dist: 3.6, colorMode: "index", tintA: "#ffffff", tintB: "#6a6a72",
    blend: "add", bgType: "radial", bgA: "#08080a", bgB: "#17171b", fog: 0.2, bloom: 0.6, vignette: 0.4 } },
  { id: "wall", name: "Grid wall", patch: {
    text: "ISAIART", font: "jetbrains", weight: 600, split: "chars", effect: "outline", stroke: 0.045,
    formation: "grid", count: 600, radius: 2.4, depth: 3.4, size: 0.3, speed: 0.12, spin: 0,
    facing: "flat", colorMode: "depth", tintA: "#ffffff", tintB: "#4c4c53", bgType: "grid",
    bgA: "#0c0c0e", bgB: "#26262c", bgScale: 1.6, fog: 0.7, vignette: 0.3, grain: 0.05 } },
  { id: "helix", name: "Helix", patch: {
    text: "ISAIART DESIGN", split: "chars", font: "orbitron", weight: 900, effect: "extrude",
    effectAmt: 0.6, formation: "helix", count: 260, radius: 0.95, depth: 6.5, turns: 5,
    size: 0.4, speed: 0.5, swirl: 0.2, facing: "flow", colorMode: "depth", tintA: "#ffffff",
    tintB: "#66666e", bgType: "stripes", bgA: "#0a0a0c", bgB: "#141418", bgScale: 2.4,
    fog: 0.6, chroma: 0.18, bloom: 0.2 } },
  { id: "monolith", name: "Monolith", patch: {
    text: "ISAIART", font: "playfair", weight: 900, split: "phrase", case: "upper", effect: "knockout",
    formation: "column", count: 220, radius: 0.6, depth: 6, size: 0.8, speed: 0.18, spin: 0.22,
    facing: "radial", colorMode: "solid", tintA: "#efefef", bgType: "solid", bgA: "#101012",
    fog: 0.62, vignette: 0.42, grain: 0.09, contrast: 0.12 } },
  { id: "static", name: "Static", patch: {
    text: "ISAIART", font: "vt323", split: "chars", effect: "scan", formation: "wall", count: 800,
    radius: 2.2, depth: 2.6, size: 0.26, sizeVar: 0.3, wobble: 0.25, wobbleFreq: 2.6, turb: 0.35,
    speed: 0.1, facing: "flat", colorMode: "random", tintA: "#ffffff", tintB: "#8a8a90",
    bgType: "noise", bgA: "#0a0a0b", bgB: "#1a1a1e", bgScale: 2, scan: 0.4, grain: 0.22,
    chroma: 0.3, fog: 0.4 } },
];

/* --------------------------------------------------------------- runtime */

const state = { ...DEFAULTS };
const listeners = new Set();

/* ---------------------------------------------------------------- history

   Randomise, presets and Reset can wipe out a look in one keystroke, so every
   change is undoable. Snapshots are whole states — this object is a few dozen
   numbers, so the memory is trivial next to being able to get your work back.

   Consecutive edits to the same control coalesce: dragging a slider for three
   seconds leaves one undo step, not three hundred. A pause longer than the
   coalescing window, or touching a different control, starts a new step. */

const HISTORY_LIMIT = 80;
const COALESCE_MS = 650;

const past = [];
const future = [];
let restoring = false;
let notifying = 0;
let lastMark = "";
let lastMarkAt = -Infinity;

function record(keys, source) {
  const now = performance.now();
  if (source === "app") {
    // Control edits coalesce while you stay on the same control.
    const mark = keys.slice().sort().join(",");
    const continuing = mark === lastMark && now - lastMarkAt < COALESCE_MS;
    lastMark = mark;
    lastMarkAt = now;
    if (continuing) return;
  } else {
    // Randomise, presets, reset and file loads are always their own step.
    lastMark = "";
    lastMarkAt = now;
  }
  past.push({ ...state });
  if (past.length > HISTORY_LIMIT) past.shift();
  future.length = 0;
}

function normalise(k, v) {
  const f = FIELDS.get(k);
  if (!f) return v;
  if (f.t === "slider" || f.t === "vecAxis" || f.t === "padAxis") {
    const min = f.min ?? -Infinity, max = f.max ?? Infinity;
    let n = Number(v);
    if (!Number.isFinite(n)) n = DEFAULTS[k];
    if (f.int) n = Math.round(n);
    return clamp(n, min, max);
  }
  if (f.t === "toggle") return !!v;
  if (f.t === "seg" && f.opts) {
    const ok = f.opts.some((o) => String(o[0]) === String(v));
    return ok ? f.opts.find((o) => String(o[0]) === String(v))[0] : DEFAULTS[k];
  }
  if (f.t === "select" && f.opts) {
    return f.opts.some((o) => o[0] === v) ? v : DEFAULTS[k];
  }
  return v;
}

function fxOf(keys) {
  const fx = new Set();
  for (const k of keys) {
    const f = FIELDS.get(k);
    if (f?.fx) fx.add(f.fx);
  }
  return fx;
}

const State = {
  FONTS, FONT_BY_ID, EMOJI, SCHEMA, FIELDS, DEFAULTS, PRESETS, ASPECTS, FORMATIONS, EFFECTS, BACKGROUNDS,
  data: state,

  get: (k) => state[k],

  /** Apply one or many keys. `silent` skips notification (used while loading). */
  patch(obj, { silent = false, source = "app", history = true } = {}) {
    const pending = [];
    for (const [k, raw] of Object.entries(obj)) {
      if (!(k in DEFAULTS)) continue;
      const v = normalise(k, raw);
      if (state[k] === v) continue;
      pending.push([k, v]);
    }
    if (!pending.length) return [];

    /* Snapshot before mutating, so undo lands on the state you could see.
       A patch raised from inside a notification — the weight clamped to one
       the new typeface actually has, the canvas size following a ratio — is a
       consequence of the change already being recorded, not a step of its
       own; folding it in is what makes one undo reverse one user action. */
    if (history && !restoring && !silent && notifying === 0) {
      record(pending.map(([k]) => k), source);
    }

    const changed = [];
    for (const [k, v] of pending) {
      state[k] = v;
      changed.push(k);
    }
    if (!silent) {
      const payload = { keys: changed, fx: fxOf(changed), source };
      notifying++;
      try {
        listeners.forEach((fn) => fn(payload));
      } finally {
        notifying--;
      }
    }
    return changed;
  },

  canUndo: () => past.length > 0,
  canRedo: () => future.length > 0,

  undo() {
    if (!past.length) return false;
    future.push({ ...state });
    const snapshot = past.pop();
    restoring = true;
    lastMark = "";
    State.patch(snapshot, { source: "undo" });
    restoring = false;
    return true;
  },

  redo() {
    if (!future.length) return false;
    past.push({ ...state });
    const snapshot = future.pop();
    restoring = true;
    lastMark = "";
    State.patch(snapshot, { source: "redo" });
    restoring = false;
    return true;
  },

  set(k, v, opts) { return State.patch({ [k]: v }, opts); },

  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },

  /** Only the keys that differ from defaults — keeps links and saves short. */
  diff() {
    const out = {};
    for (const [k, v] of Object.entries(state)) if (v !== DEFAULTS[k]) out[k] = v;
    return out;
  },

  encode: () => encodeState(State.diff()),

  applyEncoded(str, opts) {
    const obj = decodeState(str);
    if (!obj || typeof obj !== "object") return false;
    State.patch({ ...DEFAULTS, ...obj }, opts);
    return true;
  },

  /** Both return the keys they changed, so callers can tell you the truth. */
  reset(opts) { return State.patch({ ...DEFAULTS }, { source: "reset", ...opts }); },

  /** Empty the canvas without touching anything else you have set up. */
  clear() { return State.patch({ text: "" }, { source: "clear" }); },

  randomize() {
    const patch = {};
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    for (const [k, f] of FIELDS) {
      if (NO_RANDOM.has(k)) continue;
      if (f.t === "slider") {
        // Bias towards the calmer end so a random look is still usable.
        const t = Math.random() ** 1.5;
        patch[k] = f.int ? Math.round(f.min + t * (f.max - f.min)) : +(f.min + t * (f.max - f.min)).toFixed(3);
      } else if (f.t === "seg" || f.t === "select") {
        patch[k] = pick(f.opts)[0];
      } else if (f.t === "color") {
        const g = Math.floor(140 + Math.random() * 115);
        patch[k] = k.startsWith("bg") ? "#0" + "abcdef"[Math.floor(Math.random() * 6)] + "0d10".slice(0, 4)
                                      : "#" + g.toString(16).repeat(3);
      } else if (f.t === "padAxis") {
        patch[k] = +(Math.random() * 2 - 1).toFixed(2) * 0.4;
      }
    }
    // Keep the result inside sane performance and framing limits.
    patch.count = Math.round(120 + Math.random() * 900);
    patch.speed = +(Math.random() * 1.4 - 0.4).toFixed(2);
    patch.opacity = 1;
    patch.size = +(0.14 + Math.random() * 0.7).toFixed(2);
    patch.dist = +(1.4 + Math.random() * 3).toFixed(2);
    patch.fov = Math.round(40 + Math.random() * 45);
    patch.pitch = Math.round((Math.random() * 2 - 1) * 35);
    patch.bgType = pick(BACKGROUNDS.filter((b) => b[0] !== "none"))[0];
    State.patch(patch, { source: "random" });
  },

  applyPreset(id) {
    const p = PRESETS.find((x) => x.id === id);
    if (!p) return;
    State.patch({ ...DEFAULTS, ...p.patch }, { source: "preset" });
  },
};

window.ISO.State = State;
window.ISO.store = store;
})();
