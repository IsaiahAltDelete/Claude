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
  // Flat layouts. Everything above throws type through space; these five keep
  // it on the picture plane, where a slow slide reads as design rather than
  // as weather. Their indices are fixed — the shader branches on them.
  ["single", "Single"], ["rows", "Rows"], ["columns", "Columns"],
  ["stack", "Stack"], ["marquee", "Marquee"],
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
            ph: "Type anything. Emoji welcome.",
            tip: "The words themselves — emoji render in full colour, and an empty field clears the canvas" },
          { k: "emoji", t: "emoji", l: "Insert", fx: "atlas",
            tip: "Append a mark to the end of the text" },
          { k: "split", t: "seg", l: "Split", d: "phrase", fx: "atlas",
            opts: [["phrase", "Phrase"], ["words", "Words"], ["chars", "Chars"], ["lines", "Lines"]],
            tip: "What one copy contains — the whole phrase, or a word, letter or line per copy" },
          { k: "case", t: "seg", l: "Case", d: "upper", fx: "atlas",
            opts: [["asis", "As is"], ["upper", "AA"], ["lower", "aa"], ["title", "Aa"]],
            tip: "Recase the text without retyping it" },
          { k: "contentBtns", t: "buttons", l: "Canvas",
            items: [["clear", "Clear"], ["undo", "Undo"], ["redo", "Redo"]],
            tip: "Empty the canvas, or step back and forward through everything you have changed" },
        ],
      },
      {
        title: "Face",
        controls: [
          { k: "font", t: "select", l: "Typeface", d: "grotesk", fx: "atlas", preview: true,
            opts: FONTS.map((f) => [f.id, f.name, f.cat]),
            tip: "Twenty bundled faces plus your system stacks, each previewed in itself" },
          { k: "weight", t: "seg", l: "Weight", d: 700, fx: "atlas", dynamic: "weights", opts: [[400, "400"]],
            tip: "Only the weights this particular face actually ships are offered" },
          S("tracking", "Tracking", -0.08, 0.8, 0.005, 0.01, { fx: "atlas", unit: "em", bipolar: true,
            tip: "Letter spacing — opening it up turns a word into a line of marks" }),
          S("lineGap", "Line height", 0.7, 2.2, 0.01, 1, { fx: "atlas",
            tip: "Spacing between lines, for text with returns in it" }),
          { k: "align", t: "seg", l: "Align", d: "center", fx: "atlas",
            opts: [["left", "Left"], ["center", "Centre"], ["right", "Right"]],
            tip: "How multiple lines sit against each other" },
        ],
      },
      {
        title: "Treatment",
        controls: [
          { k: "effect", t: "select", l: "Effect", d: "fill", fx: "atlas", opts: EFFECTS,
            tip: "How the letterforms themselves are drawn — applied once, so it costs nothing per frame" },
          S("effectAmt", "Amount", 0, 1, 0.01, 0.5, { fx: "atlas",
            tip: "How far the treatment is pushed — depth for extrude, blur for glow, offset for echo" }),
          S("stroke", "Line weight", 0, 0.24, 0.002, 0.05, { fx: "atlas", unit: "em",
            tip: "Thickness of any outline the treatment draws" }),
          { k: "fillA", t: "color", l: "Ink", d: "#f4f4f5", fx: "atlas",
            tip: "The main colour of the letterforms" },
          { k: "fillB", t: "color", l: "Second ink", d: "#6f6f76", fx: "atlas",
            tip: "The treatment's other colour — the shadow, the stripes, the outline" },
          { k: "glyphRes", t: "seg", l: "Texture", d: 512, fx: "atlas",
            opts: [[256, "256"], [512, "512"], [768, "768"], [1024, "1K"]],
            tip: "Resolution the type is rasterised at — raise it only if copies look soft up close" },
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
          { k: "formation", t: "select", l: "Shape", d: "single", opts: FORMATIONS,
            tip: "Where the copies go — the last five are flat layouts on the picture plane rather than in space" },
          S("count", "Copies", 1, 3000, 1, 1, { fx: "inst", int: true,
            tip: "How many copies exist — the GPU draws them all from one texture, so this is cheap" }),
          S("radius", "Spread", 0, 4, 0.01, 1.7, {
            tip: "How wide the formation opens — in the flat layouts, how much of the frame it fills" }),
          S("depth", "Depth", 0.2, 12, 0.01, 6, {
            tip: "How far the formation runs into the distance — keep it under twice the camera distance or copies fly through the lens" }),
          S("turns", "Turns", 0, 12, 0.05, 2, {
            tip: "Revolutions for the spirals and rings, and the row or column count in the flat layouts" }),
          S("scatter", "Scatter", 0, 1, 0.01, 0, {
            tip: "Random displacement away from the perfect formation" }),
          S("stagger", "Stagger", 0, 1, 0.01, 0, {
            tip: "Desynchronises the copies so they stop travelling in lockstep" }),
        ],
      },
      {
        title: "Instance",
        controls: [
          S("size", "Size", 0.02, 3, 0.005, 0.55, {
            tip: "How large one copy is drawn" }),
          S("sizeVar", "Size jitter", 0, 1, 0.01, 0, {
            tip: "Random variation in size, which reads as depth even when there is none" }),
          S("sizeDepth", "Size by depth", -1, 1, 0.01, 0, { bipolar: true,
            tip: "Grow or shrink copies with distance, on top of what perspective already does" }),
          { k: "facing", t: "seg", l: "Facing", d: "billboard",
            opts: [["billboard", "Camera"], ["flat", "Flat"], ["radial", "Radial"], ["flow", "Flow"]],
            tip: "Which way each copy turns — always at you, fixed to the field, wrapped on the radius, or along the path" },
          S("roll", "Roll", -180, 180, 1, 0, { unit: "°", bipolar: true, int: true,
            tip: "Rotation of every copy in its own plane" }),
          S("rollVar", "Roll jitter", 0, 180, 1, 0, { unit: "°", int: true,
            tip: "Random rotation per copy" }),
        ],
      },
      {
        title: "Camera",
        controls: [
          S("fov", "Lens", 15, 120, 1, 64, { unit: "°", int: true,
            tip: "Field of view — narrow flattens the scene, wide exaggerates the rush past the lens" }),
          S("dist", "Distance", 0.2, 14, 0.01, 3.2, {
            tip: "How far back the camera sits" }),
          { k: "look", t: "pad", l: "Frame", d: [0, 0], keys: ["panX", "panY"],
            tip: "Shift the framing off centre", hint: "Drag the pad, or arrow keys when focused" },
          S("yaw", "Yaw", -180, 180, 0.5, 0, { unit: "°", bipolar: true,
            tip: "Orbit around the field — dragging on the canvas does this too" }),
          S("pitch", "Pitch", -89, 89, 0.5, 0, { unit: "°", bipolar: true,
            tip: "Look down on the field or up at it" }),
          S("orbit", "Auto orbit", -1, 1, 0.01, 0, { bipolar: true,
            tip: "Turn the camera continuously, hands off" }),
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
          S("speed", "Travel", -3, 3, 0.01, 0, { bipolar: true,
            tip: "Movement along the formation — towards you when positive, away when negative, still at zero" }),
          S("spin", "Field spin", -2, 2, 0.01, 0, { bipolar: true,
            tip: "Rotates the whole field around its axis" }),
          S("swirl", "Swirl", -2, 2, 0.01, 0, { bipolar: true,
            tip: "Twists the field progressively with depth, like wringing a cloth" }),
          S("tumble", "Tumble", -3, 3, 0.01, 0, { bipolar: true,
            tip: "Spins each copy on its own, at its own rate" }),
        ],
      },
      {
        title: "Disturbance",
        controls: [
          S("wobble", "Wobble", 0, 1.5, 0.01, 0, {
            tip: "A small drift per copy, enough to stop the formation feeling machined" }),
          S("wobbleFreq", "Wobble rate", 0.05, 6, 0.01, 1, {
            tip: "How quickly the wobble cycles" }),
          S("turb", "Turbulence", 0, 1.5, 0.01, 0, {
            tip: "A flowing field that pushes copies around in currents" }),
          S("turbScale", "Turb scale", 0.1, 6, 0.01, 1.2, {
            tip: "Size of the turbulent cells — small values churn, large ones sweep" }),
          S("pulse", "Pulse", 0, 1, 0.01, 0, {
            tip: "Copies breathe in and out of scale" }),
          S("pulseRate", "Pulse rate", 0.05, 8, 0.01, 1.4, {
            tip: "How fast the breathing goes" }),
        ],
      },
      {
        title: "Drift",
        controls: [
          { k: "drift", t: "pad", l: "Direction", d: [0, 0], keys: ["driftX", "driftY"],
            tip: "Which way the whole field slides over time" },
          S("driftAmt", "Drift rate", 0, 2, 0.01, 0, {
            tip: "How fast it slides" }),
          { k: "playing", t: "toggle", l: "Animate", d: true,
            tip: "Freeze the clock — a still frame is easier to compose and export" },
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
            opts: [["solid", "Solid"], ["depth", "Depth"], ["index", "Index"], ["random", "Random"]],
            tip: "How the two tints are handed out — one colour, or graded by distance, order or chance" },
          { k: "tintA", t: "color", l: "Tint A", d: "#ffffff",
            tip: "Multiplied over the letterforms, so white leaves the ink and emoji exactly as drawn" },
          { k: "tintB", t: "color", l: "Tint B", d: "#7c7c84", dep: (s) => s.colorMode !== "solid",
            tip: "The far end of the colour ramp" },
          { k: "blend", t: "seg", l: "Blend", d: "normal",
            opts: [["normal", "Normal"], ["add", "Add"], ["screen", "Screen"], ["mult", "Mult"]],
            tip: "Normal sorts copies by depth; the others let them build up light or darkness where they overlap" },
          S("opacity", "Opacity", 0.02, 1, 0.01, 1, {
            tip: "Overall transparency of the type" }),
          S("fog", "Depth fade", 0, 1, 0.01, 0.25, {
            tip: "How quickly distance drains the ink into the background colour" }),
        ],
      },
      {
        title: "Background",
        controls: [
          { k: "bgType", t: "select", l: "Field", d: "solid", opts: BACKGROUNDS,
            tip: "What sits behind the type — transparent exports a PNG with real alpha" },
          { k: "bgA", t: "color", l: "Base", d: "#0c0c0e", dep: (s) => s.bgType !== "none",
            tip: "The background's main colour, and the colour distance fades into" },
          { k: "bgB", t: "color", l: "Second", d: "#212127",
            dep: (s) => ["linear", "radial", "grid", "dots", "stripes", "noise", "pattern"].includes(s.bgType),
            tip: "The background's other colour" },
          S("bgAngle", "Angle", 0, 360, 1, 160, { unit: "°", int: true,
            dep: (s) => ["linear", "stripes"].includes(s.bgType),
            tip: "Direction of the gradient or the stripes" }),
          S("bgScale", "Scale", 0.1, 6, 0.01, 1, {
            dep: (s) => ["grid", "dots", "stripes", "noise", "pattern", "radial"].includes(s.bgType),
            tip: "How large the background's repeat is" }),
        ],
      },
      {
        title: "Pattern",
        dep: (s) => s.bgType === "pattern",
        controls: [
          { k: "patText", t: "text", l: "Glyph", d: "✦", fx: "tile",
            tip: "One character or emoji, tiled across the background" },
          { k: "patFont", t: "select", l: "Face", d: "system", fx: "tile", preview: true,
            opts: FONTS.map((f) => [f.id, f.name, f.cat]),
            tip: "Face the tiled glyph is drawn in" },
          S("patSize", "Glyph size", 0.05, 0.9, 0.005, 0.42, { fx: "tile",
            tip: "How much of its cell the glyph fills" }),
          S("patRot", "Rotation", -180, 180, 1, 0, { unit: "°", bipolar: true, int: true,
            tip: "Turn every tile" }),
          S("patJitter", "Jitter", 0, 1, 0.01, 0, {
            tip: "Randomise each tile's position and angle so the grid stops reading as a grid" }),
          S("patOpacity", "Opacity", 0, 1, 0.01, 0.5, {
            tip: "How strongly the pattern shows against the base colour" }),
          S("patDrift", "Drift", -1, 1, 0.01, 0, { bipolar: true,
            tip: "Slide the pattern behind the type" }),
        ],
      },
      {
        title: "Post",
        controls: [
          S("bloom", "Bloom", 0, 1.5, 0.01, 0, {
            tip: "Light bleeds out of the brightest areas" }),
          S("chroma", "Aberration", 0, 1, 0.01, 0, {
            tip: "Splits the colour channels towards the corners, like a cheap lens" }),
          S("grain", "Grain", 0, 1, 0.01, 0.03, {
            tip: "Film grain over the whole frame" }),
          S("scan", "Scanlines", 0, 1, 0.01, 0, {
            tip: "Horizontal lines across the frame, at a fixed count so exports match the preview" }),
          S("vignette", "Vignette", 0, 1, 0.01, 0.12, {
            tip: "Darkens the corners and pulls the eye to the middle" }),
          S("pixelate", "Pixelate", 0, 1, 0.01, 0, {
            tip: "Quantises the whole frame down to blocks" }),
          S("posterize", "Posterise", 0, 1, 0.01, 0, {
            tip: "Reduces the frame to a few tones per channel" }),
          S("contrast", "Contrast", -1, 1, 0.01, 0, { bipolar: true,
            tip: "Final contrast on the finished frame" }),
          { k: "invert", t: "toggle", l: "Invert", d: false,
            tip: "Flips the whole frame to its negative" },
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
            opts: ASPECTS.map((a) => [a[0], a[0]]),
            tip: "Sets the artboard to a standard ratio" },
          { k: "dims", t: "vec", l: "Size", d: [1920, 1080], fx: "size", keys: ["width", "height"],
            min: 160, max: 4096, unit: "px",
            tip: "Exact artboard size in pixels — this is what an export contains" },
          S("renderScale", "Render scale", 0.4, 2, 0.05, 1, { fx: "size",
            tip: "Preview resolution relative to the canvas — lower it for speed, exports are unaffected" }),
          { k: "quality", t: "seg", l: "Quality", d: "balanced", fx: "size",
            opts: [["eco", "Eco"], ["balanced", "Balanced"], ["high", "High"]],
            tip: "Caps total pixels and multisampling, so a 4K canvas cannot bring a laptop down" },
        ],
      },
      {
        title: "Export",
        controls: [
          { k: "exportPng", t: "buttons", l: "Still",
            items: [["png1", "PNG 1×"], ["png2", "PNG 2×"], ["copy", "Copy"]],
            tip: "Renders one frame at exactly the canvas size, or twice it" },
          S("clipLength", "Clip length", 1, 30, 0.5, 6, { unit: "s",
            tip: "How long a recorded clip runs before it stops itself" }),
          { k: "clipFps", t: "seg", l: "Frame rate", d: 30, opts: [[24, "24"], [30, "30"], [60, "60"]],
            tip: "Frames per second in the recorded clip" },
          { k: "record", t: "buttons", l: "Motion", items: [["rec", "Record clip"]],
            tip: "Records the live canvas to a video file" },
        ],
      },
      {
        title: "Session",
        controls: [
          { k: "presetPick", t: "presets", l: "Presets",
            tip: "Complete looks — applying one is a single step you can undo" },
          { k: "sessionBtns", t: "buttons", l: "State",
            items: [["share", "Link"], ["save", "Save"], ["load", "Load"], ["reset", "Reset"]],
            tip: "Copy the whole composition as a link, or move it as a settings file" },
          { k: "autosave", t: "toggle", l: "Remember settings", d: true,
            tip: "Keeps this composition in local storage between visits" },
        ],
      },
    ],
  },
];

/* ------------------------------------------------------------ built-ins */

const PRESETS = [
  /* The flat layouts first: this tool opens on Plain, and these are the
     neighbours of that starting point rather than a detour from it. */
  { id: "plain", name: "Plain", patch: {
    text: "ISAIART", font: "grotesk", weight: 700, case: "upper", split: "phrase",
    effect: "fill", fillA: "#f4f4f5", formation: "single", count: 1, size: 0.55,
    tracking: 0.01, speed: 0, spin: 0, fog: 0.25, bgType: "solid", bgA: "#0c0c0e",
    vignette: 0.12, grain: 0.03 } },

  { id: "rows", name: "Rows", patch: {
    text: "ISAIART", font: "grotesk", weight: 700, case: "upper", split: "phrase",
    effect: "fill", formation: "rows", count: 84, turns: 6, radius: 1.75, size: 0.13,
    tracking: 0.06, speed: 0.22, facing: "flat", colorMode: "index", tintA: "#f2f2f3",
    tintB: "#6c6c74", bgType: "solid", bgA: "#0c0c0e", fog: 0, vignette: 0.16, grain: 0.04 } },

  { id: "columns", name: "Columns", patch: {
    text: "ISAIART", font: "oswald", case: "upper", split: "chars", effect: "fill",
    formation: "columns", count: 120, turns: 9, radius: 1.8, size: 0.11, speed: 0.18,
    facing: "flat", colorMode: "index", tintA: "#f2f2f3", tintB: "#67676f",
    bgType: "solid", bgA: "#0b0b0d", fog: 0, vignette: 0.18, grain: 0.04 } },

  { id: "stack", name: "Stack", patch: {
    text: "ISAIART", font: "anton", case: "upper", split: "phrase", effect: "fill",
    formation: "stack", count: 9, radius: 1.72, size: 0.16, tracking: 0.18, speed: 0,
    facing: "flat", colorMode: "index", tintA: "#f4f4f5", tintB: "#585860",
    bgType: "solid", bgA: "#0c0c0e", fog: 0, vignette: 0.14, grain: 0.03 } },

  { id: "marquee", name: "Marquee", patch: {
    text: "ISAIART DESIGN —", font: "bebas", case: "upper", split: "phrase", effect: "fill",
    formation: "marquee", count: 10, radius: 1.9, size: 0.3, tracking: 0.04, speed: 0.35,
    facing: "flat", colorMode: "solid", tintA: "#f4f4f5", bgType: "solid", bgA: "#0d0d10",
    fog: 0, vignette: 0.2, scan: 0.1, grain: 0.04 } },

  { id: "void", name: "Void tunnel", patch: {
    text: "ISAIART", font: "anton", case: "upper", split: "phrase", effect: "both", stroke: 0.03,
    fillA: "#f4f4f5", fillB: "#101014", formation: "tunnel", count: 260, radius: 1.7, depth: 6,
    size: 0.3, speed: 0.35, spin: 0.05, facing: "billboard", colorMode: "depth",
    tintA: "#ffffff", tintB: "#5b5b62", bgType: "linear", bgA: "#0a0a0c", bgB: "#1d1d22",
    fog: 0.85, vignette: 0.3, grain: 0.05, bloom: 0.1 } },
  { id: "ticker", name: "Ticker", patch: {
    text: "DESIGN\nSTUDIO\nISAIART", font: "grotesk", weight: 700, split: "lines", case: "upper",
    effect: "fill", formation: "line", count: 26, depth: 5.5, size: 0.28, tracking: 0.12,
    speed: 0.35, dist: 3.6, facing: "billboard", colorMode: "depth", tintA: "#f2f2f3",
    tintB: "#5c5c64", bgType: "solid", bgA: "#0b0b0d", fog: 0.8, scan: 0.18, grain: 0.06,
    vignette: 0.24 } },
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
    formation: "column", count: 90, radius: 1.6, depth: 6, turns: 4, size: 0.36, speed: 0.2,
    spin: 0.18, dist: 4.4, facing: "radial", colorMode: "depth", tintA: "#efefef", tintB: "#6a6a72",
    bgType: "solid", bgA: "#101012", fog: 0.72, vignette: 0.42, grain: 0.09, contrast: 0.12 } },
  { id: "static", name: "Static", patch: {
    text: "ISAIART", font: "vt323", split: "chars", effect: "scan", effectAmt: 0.5,
    formation: "wall", count: 220, radius: 2.2, depth: 2.6, size: 0.5, sizeVar: 0.3,
    wobble: 0.2, wobbleFreq: 2.6, turb: 0.25, speed: 0.1, facing: "flat", colorMode: "random",
    tintA: "#ffffff", tintB: "#c9c9d0", bgType: "noise", bgA: "#0a0a0b", bgB: "#1a1a1e",
    bgScale: 2, scan: 0.26, grain: 0.16, chroma: 0.24, fog: 0.3, contrast: 0.24 } },

  { id: "corridor", name: "Corridor", patch: {
    text: "ISAIART DESIGN", split: "words", font: "jetbrains", weight: 600, case: "upper",
    effect: "fill", formation: "corridor", count: 460, radius: 1.5, depth: 8, size: 0.24,
    speed: 0.55, facing: "radial", colorMode: "depth", tintA: "#ffffff", tintB: "#4e4e55",
    bgType: "solid", bgA: "#0a0a0c", fog: 0.9, vignette: 0.36, grain: 0.06, scan: 0.12 } },

  { id: "vortex", name: "Vortex", patch: {
    text: "ISAIART", split: "chars", font: "bebas", effect: "fill", formation: "vortex",
    count: 900, radius: 2.4, depth: 6, turns: 6, size: 0.28, speed: 0.5, swirl: 0.4,
    colorMode: "depth", tintA: "#ffffff", tintB: "#5a5a62", bgType: "radial", bgA: "#09090b",
    bgB: "#1b1b20", fog: 0.85, bloom: 0.15, vignette: 0.36 } },

  { id: "orbit", name: "Orbit", patch: {
    text: "ISAIART", font: "instrument", case: "asis", effect: "fill", formation: "rings",
    count: 300, radius: 2, depth: 4, turns: 5, size: 0.32, spin: 0.12, pitch: -24, dist: 4.2,
    facing: "radial", colorMode: "index", tintA: "#f4f4f5", tintB: "#6b6b73",
    bgType: "radial", bgA: "#0b0b0d", bgB: "#1d1d22", fog: 0.6, vignette: 0.4, grain: 0.04 } },

  { id: "confetti", name: "Confetti", patch: {
    text: "🖤 ✦ ⚡ 🧊 ✨", split: "words", font: "system", formation: "cloud", count: 420,
    radius: 1.9, depth: 5, size: 0.38, sizeVar: 0.5, scatter: 0.8, speed: 0.35, tumble: 1.1,
    pulse: 0.2, pulseRate: 2, tintA: "#ffffff", bgType: "solid", bgA: "#101013",
    fog: 0.55, vignette: 0.3, bloom: 0.15 } },

  { id: "chrome", name: "Chrome", patch: {
    text: "ISAIART", font: "archivo", effect: "chrome", effectAmt: 0.5, stroke: 0.02,
    fillA: "#f2f2f3", fillB: "#3a3a40", formation: "torus", count: 44, radius: 1.7, turns: 1,
    size: 0.3, spin: 0.1, pitch: 44, dist: 5, bgType: "linear", bgA: "#0b0b0d", bgB: "#26262c",
    bgAngle: 110, fog: 0.55, vignette: 0.35, contrast: 0.1 } },

  { id: "plan", name: "Plan", patch: {
    text: "ISAIART DESIGN", split: "words", font: "oswald", effect: "outline", stroke: 0.03,
    formation: "grid", count: 340, radius: 2.6, depth: 4, turns: 2, size: 0.28, speed: 0.1,
    facing: "flat", colorMode: "depth", tintA: "#ffffff", tintB: "#55555c", bgType: "grid",
    bgA: "#0b0b0d", bgB: "#212127", bgScale: 2.2, fog: 0.75, vignette: 0.28, grain: 0.05 } },

  { id: "ribbon", name: "Ribbon", patch: {
    text: "ISAIART", split: "chars", font: "syne", weight: 800, effect: "gradient",
    fillA: "#ffffff", fillB: "#6e6e77", formation: "ribbon", count: 220, radius: 1.5, depth: 5,
    turns: 4, size: 0.22, speed: 0.45, dist: 3.8, tintA: "#ffffff", bgType: "linear",
    bgA: "#0a0a0c", bgB: "#1e1e24", bgAngle: 200, fog: 0.8, vignette: 0.3, bloom: 0.1 } },

  { id: "nebula", name: "Nebula", patch: {
    text: "✦ ● ✳", split: "words", font: "system", effect: "glow", effectAmt: 0.7,
    fillA: "#ffffff", fillB: "#8a8a92", formation: "shell", count: 1100, radius: 2.4,
    size: 0.12, sizeVar: 0.7, spin: 0.06, tumble: 0.2, blend: "add", colorMode: "random",
    tintA: "#ffffff", tintB: "#7a7a84", bgType: "radial", bgA: "#08080a", bgB: "#141418",
    fog: 0.35, bloom: 0.7, vignette: 0.45, grain: 0.05 } },

  { id: "stamp", name: "Stamp", patch: {
    text: "ISAIART", font: "bungee", effect: "plate", fillA: "#0a0a0b", fillB: "#f2f2f3",
    formation: "arc", count: 44, radius: 2.2, turns: 4, depth: 5, size: 0.26, speed: 0,
    spin: 0.04, scatter: 0.25, colorMode: "solid", tintA: "#ffffff", bgType: "stripes", bgA: "#0d0d10",
    bgB: "#17171c", bgScale: 1.6, bgAngle: 45, fog: 0.5, vignette: 0.35, grain: 0.07 } },
];

/* --------------------------------------------------------------- runtime */

/* Randomising leaves alone the things you chose on purpose. */
const NO_RANDOM = [
  "text", "patText", "width", "height", "aspect", "renderScale", "quality",
  "glyphRes", "clipLength", "clipFps", "autosave", "playing", "invert",
];

/* Palettes the randomiser draws from. Achromatic first, because that is what
   this tool looks like, with a few muted duotones for variety. */
const PALETTES = [
  ["#ffffff", "#5b5b62", "#0a0a0c", "#1d1d22"],
  ["#f2f2f3", "#8a8a92", "#101012", "#26262c"],
  ["#efe9df", "#7d766b", "#0c0b0a", "#211f1c"],
  ["#e8eef0", "#6f7d82", "#080b0c", "#18211f"],
  ["#f0e6e6", "#8a6f74", "#0d0a0b", "#241b1e"],
  ["#e9edf5", "#6d7488", "#090a0e", "#1a1d26"],
  ["#f4f0e2", "#87806a", "#0d0c07", "#221f16"],
];

/* Effects that survive being applied to any face at any size. The showier
   ones are drawn less often so a random look is not always shouting. */
const COMMON_EFFECTS = ["fill", "fill", "fill", "outline", "both", "extrude", "gradient"];
const RARE_EFFECTS = ["shadow", "chrome", "split", "inline", "stripe", "halftone",
                      "grain", "glow", "knockout", "plate", "echo", "scan", "chop"];

/**
 * Vary a composition rather than sample the parameter space.
 *
 * The first version of this rolled every slider independently and the result
 * was always the same thing: a few thousand specks. The space of settings is
 * mostly noise, and only a thin shell of it is design. So this starts from a
 * preset — which is by definition a composition someone shaped — then re-rolls
 * its identity and jitters its geometry inside bounds that keep it legible.
 */
function randomLook({ pick, rand, chance, DEFAULTS, PRESETS, data }) {
  const base = pick(PRESETS).patch;
  const p = { ...DEFAULTS, ...base };

  // Keep the words, the canvas and the session settings.
  p.text = data.text;

  // ---- identity ----------------------------------------------------------
  const face = pick(FONTS);
  p.font = face.id;
  p.weight = pick(face.weights);
  p.case = pick(["upper", "upper", "upper", "asis", "title"]);
  p.split = pick(["phrase", "phrase", "words", "chars", "lines"]);
  p.effect = chance(0.75) ? pick(COMMON_EFFECTS) : pick(RARE_EFFECTS);
  p.effectAmt = +rand(0.25, 0.8).toFixed(2);
  p.stroke = +rand(0.02, 0.08).toFixed(3);
  p.tracking = chance(0.3) ? +rand(0, 0.25).toFixed(3) : 0;

  const [ink, second, bgA, bgB] = pick(PALETTES);
  p.fillA = ink;
  p.fillB = second;
  p.tintA = ink;
  p.tintB = second;
  p.bgA = bgA;
  p.bgB = bgB;
  p.colorMode = pick(["solid", "depth", "depth", "index", "random"]);
  p.bgType = pick(["solid", "linear", "linear", "radial", "grid", "dots", "stripes", "noise"]);

  // ---- geometry, kept inside the archetype -------------------------------
  const scale = rand(0.7, 1.4);
  p.count = Math.round(Math.min(2400, Math.max(6, (base.count ?? 240) * rand(0.6, 1.7))));
  p.size = +Math.min(1.6, Math.max(0.08, (base.size ?? 0.3) * scale)).toFixed(3);
  p.radius = +Math.max(0.2, (base.radius ?? 1.7) * rand(0.75, 1.3)).toFixed(2);
  p.depth = +Math.max(0.6, (base.depth ?? 6) * rand(0.7, 1.4)).toFixed(2);
  p.turns = +Math.max(0, (base.turns ?? 2) * rand(0.5, 1.8)).toFixed(2);
  p.scatter = chance(0.4) ? +rand(0, 0.5).toFixed(2) : (base.scatter ?? 0.12);
  p.sizeVar = +rand(0, 0.5).toFixed(2);

  // A copy must never end up inside the lens: on an axis-centred formation
  // the run has to stay shallower than twice the camera distance.
  p.dist = +Math.max(1.4, (base.dist ?? 3.2) * rand(0.85, 1.25)).toFixed(2);
  if (["line", "ribbon", "arc", "stack", "single", "marquee"].includes(p.formation)) {
    p.depth = +Math.min(p.depth, p.dist * 1.6).toFixed(2);
  }
  p.fov = Math.round(rand(45, 80));
  p.pitch = chance(0.35) ? Math.round(rand(-40, 40)) : 0;
  p.yaw = chance(0.25) ? Math.round(rand(-30, 30)) : 0;

  // ---- motion ------------------------------------------------------------
  p.speed = +rand(-0.2, 0.9).toFixed(2);
  p.spin = chance(0.5) ? +rand(-0.25, 0.25).toFixed(3) : 0;
  p.tumble = chance(0.2) ? +rand(-0.6, 0.6).toFixed(2) : 0;
  p.wobble = chance(0.2) ? +rand(0, 0.35).toFixed(2) : 0;
  p.turb = chance(0.15) ? +rand(0, 0.4).toFixed(2) : 0;
  p.pulse = chance(0.15) ? +rand(0, 0.3).toFixed(2) : 0;

  // ---- finish ------------------------------------------------------------
  p.fog = +rand(0.35, 0.95).toFixed(2);
  p.opacity = 1;
  p.vignette = +rand(0.15, 0.45).toFixed(2);
  p.grain = +rand(0, 0.12).toFixed(3);
  p.bloom = chance(0.35) ? +rand(0.05, 0.5).toFixed(2) : 0;
  p.chroma = chance(0.2) ? +rand(0.05, 0.35).toFixed(2) : 0;
  p.scan = chance(0.2) ? +rand(0.05, 0.35).toFixed(2) : 0;
  p.pixelate = 0;
  p.posterize = 0;
  p.contrast = +rand(-0.05, 0.2).toFixed(2);
  return p;
}

window.ISO.State = window.ISO.createStore({
  SCHEMA,
  noRandom: NO_RANDOM,
  randomize: randomLook,
  clearPatch: { text: "" },
  extras: { FONTS, FONT_BY_ID, EMOJI, PRESETS, ASPECTS, FORMATIONS, EFFECTS, BACKGROUNDS },
});
})();
