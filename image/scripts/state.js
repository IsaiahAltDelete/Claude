/* ---------------------------------------------------------------------------
   The parameter model.

   One schema describes every control on the image page: its type, range,
   default and — importantly — which part of the pipeline it invalidates. The
   rail UI, the URL codec, presets, randomising and the renderer all read from
   this single table, so adding a parameter means adding one line here and one
   line in a shader manifest.

   fx:  "size" resizes the render targets, "mask" rebuilds the subject mask on
        the CPU. Everything else is a shader uniform and costs nothing, which
        is why almost nothing here carries a flag at all.
   --------------------------------------------------------------------------- */

(() => {

/* ------------------------------------------------------------ enumerations */

/* Canvas ratios, as [id, width, height]. "Free" is not here: it means the
   width and height fields are whatever you last typed, so the integrator
   handles it by simply not applying a ratio. */
const ASPECTS = [
  ["1:1", 1440, 1440], ["4:5", 1440, 1800], ["3:2", 1800, 1200],
  ["2:3", 1200, 1800], ["16:9", 1920, 1080], ["9:16", 1080, 1920],
  ["4:3", 1600, 1200],
];

const GRADE_MODES = [
  ["off", "Off"], ["duotone", "Duotone"], ["gradient", "Gradient"],
  ["split", "Split tone"], ["mono", "Mono"],
];

const DITHERS = [
  ["off", "Off"], ["bayer2", "Bayer 2"], ["bayer4", "Bayer 4"],
  ["bayer8", "Bayer 8"], ["noise", "Noise"],
];

const BG_MODES = [
  ["keep", "Keep"], ["solid", "Solid"], ["gradient", "Gradient"],
  ["blur", "Blur"], ["transparent", "Transparent"], ["checker", "Checker"],
];

/* Which grade modes actually read which of the three colours. The rail hides
   a colour the current mode ignores, so nobody spends a minute tuning a
   swatch that does nothing. */
const USES_A = ["duotone", "gradient", "split"];
const USES_B = ["duotone", "gradient", "split"];
const USES_C = ["gradient", "split"];

/* ----------------------------------------------------------------- schema */

const S = (k, l, min, max, step, d, extra) => ({ k, t: "slider", l, min, max, step, d, ...extra });

const SCHEMA = [
  {
    id: "source", label: "Source",
    sections: [
      {
        title: "Picture",
        controls: [
          { k: "sourceBtns", t: "buttons", l: "Image",
            items: [["open", "Open"], ["paste", "Paste"], ["sample", "Sample"]],
            tip: "Take a photograph from disk or the clipboard, or load the bundled sample to have something to push around" },
          { k: "fit", t: "seg", l: "Fit", d: "cover",
            opts: [["cover", "Cover"], ["contain", "Contain"], ["stretch", "Stretch"]],
            tip: "Cover fills the canvas and crops, Contain shows the whole picture with space around it, Stretch distorts it to fit" },
        ],
      },
      {
        title: "Framing",
        controls: [
          S("zoom", "Zoom", 0.2, 4, 0.01, 1, {
            tip: "Pushes into the picture — everything past the canvas edge is cropped away, not shrunk" }),
          { k: "place", t: "pad", l: "Position", d: [0, 0], keys: ["panX", "panY"], min: -1, max: 1,
            tip: "Slides the picture inside the canvas, for putting the subject where you want it",
            hint: "Drag the pad, or arrow keys when focused" },
          S("rotate", "Rotate", -180, 180, 1, 0, { unit: "°", bipolar: true, int: true,
            tip: "Turns the picture inside the canvas; the corners crop rather than the canvas growing to meet them" }),
          { k: "flipH", t: "toggle", l: "Flip across", d: false,
            tip: "Mirrors left to right, which is the fix for anything shot into a mirror or a front camera" },
          { k: "flipV", t: "toggle", l: "Flip down", d: false,
            tip: "Turns the picture upside down" },
        ],
      },
    ],
  },

  {
    id: "tone", label: "Tone",
    sections: [
      {
        title: "Exposure",
        controls: [
          S("exposure", "Exposure", -3, 3, 0.01, 0, { bipolar: true,
            tip: "Overall lightness in stops, applied before anything else so it behaves like the dial on a camera" }),
          S("brightness", "Brightness", -1, 1, 0.01, 0, { bipolar: true,
            tip: "A flat lift or drop after the curve — the last small nudge when exposure has gone too far" }),
          S("contrast", "Contrast", -1, 1, 0.01, 0, { bipolar: true,
            tip: "Opens the gap between light and dark; pushing up rolls the ends off instead of clipping them" }),
          S("gamma", "Gamma", 0.2, 3, 0.01, 1, {
            tip: "Bends the midtones up or down while black stays black and white stays white" }),
          S("highlights", "Highlights", -1, 1, 0.01, 0, { bipolar: true,
            tip: "Reaches only the brightest areas — pull down to bring back a blown sky" }),
          S("shadows", "Shadows", -1, 1, 0.01, 0, { bipolar: true,
            tip: "Opens detail out of the dark areas without flattening everything else" }),
          S("whites", "Whites", -1, 1, 0.01, 0, { bipolar: true,
            tip: "Sets how early the picture reaches full white" }),
          S("blacks", "Blacks", -1, 1, 0.01, 0, { bipolar: true,
            tip: "Sets how early it reaches full black — down for a deep print, up for a faded, matte one" }),
        ],
      },
      {
        title: "Colour",
        controls: [
          S("temperature", "Temperature", -1, 1, 0.01, 0, { bipolar: true,
            tip: "Warms towards orange or cools towards blue, the way a white balance does" }),
          S("tintGM", "Tint", -1, 1, 0.01, 0, { bipolar: true,
            tip: "The other white balance axis, green against magenta — what corrects a fluorescent-lit room" }),
          S("vibrance", "Vibrance", -1, 1, 0.01, 0, { bipolar: true,
            tip: "Saturates the muted colours first and leaves the strong ones alone, so skin does not go orange" }),
          S("saturation", "Saturation", -1, 1, 0.01, 0, { bipolar: true,
            tip: "Raises or drains every colour equally; all the way down is grey" }),
          S("hueShift", "Hue", -180, 180, 1, 0, { unit: "°", bipolar: true, int: true,
            tip: "Rotates every colour around the wheel — a few degrees corrects, a hundred invents" }),
        ],
      },
      {
        title: "Detail",
        controls: [
          S("clarity", "Clarity", -1, 1, 0.01, 0, { bipolar: true,
            tip: "Local contrast — pulls texture out of the midtones without touching the overall exposure" }),
          S("sharpen", "Sharpen", 0, 2, 0.01, 0, {
            tip: "Crisps up edges; past halfway it starts drawing a bright line along them" }),
          S("softBlur", "Soften", 0, 1, 0.01, 0, {
            tip: "Blurs the whole picture, which flatters skin and swallows sensor noise" }),
        ],
      },
    ],
  },

  {
    id: "grade", label: "Grade",
    sections: [
      {
        title: "Colour map",
        controls: [
          { k: "gradeMode", t: "select", l: "Grade", d: "off", opts: GRADE_MODES,
            tip: "Remaps the picture onto colours you choose — two for duotone, three across a gradient, ends only for split tone, none for mono" },
          S("gradeAmt", "Amount", 0, 1, 0.01, 1, { dep: (s) => s.gradeMode !== "off",
            tip: "How far the mapped colour replaces the original — halfway is a tint rather than a rebuild" }),
          { k: "gradeA", t: "color", l: "Dark", d: "#16161a",
            dep: (s) => USES_A.includes(s.gradeMode),
            tip: "Where the shadows land" },
          { k: "gradeB", t: "color", l: "Light", d: "#f2f2f3",
            dep: (s) => USES_B.includes(s.gradeMode),
            tip: "Where the highlights land" },
          { k: "gradeC", t: "color", l: "Mid", d: "#8a8a92",
            dep: (s) => USES_C.includes(s.gradeMode),
            tip: "Where the midtones land, between the other two — this is the one that decides whether a grade looks muddy" },
        ],
      },
      {
        title: "Break up",
        controls: [
          S("posterize", "Posterise", 0, 1, 0.01, 0, {
            tip: "Collapses the tones into flat bands, like a screen print pulled in three passes" }),
          S("thresholdAmt", "Threshold", 0, 1, 0.01, 0, {
            tip: "Drives the picture towards pure black and white with nothing in between" }),
          S("thresholdLevel", "Level", 0, 1, 0.01, 0.5, { dep: (s) => s.thresholdAmt > 0,
            tip: "Where the cut falls — move it until the subject reads and the rest drops away" }),
          { k: "dither", t: "select", l: "Dither", d: "off", opts: DITHERS,
            tip: "Fakes the missing tones with a pattern instead of banding — the ordered grids look printed, noise looks photographic" },
          S("ditherLevels", "Steps", 2, 16, 1, 4, { int: true, dep: (s) => s.dither !== "off",
            tip: "How many tones per channel survive before the pattern has to fill in the rest" }),
        ],
      },
      {
        title: "Process",
        controls: [
          S("solarize", "Solarise", 0, 1, 0.01, 0, {
            tip: "Folds the brightest tones back down, the way a negative does when it is flashed to light" }),
          S("sepia", "Sepia", 0, 1, 0.01, 0, {
            tip: "Warm brown print tone, laid over whatever the grade has already done" }),
          { k: "invert", t: "toggle", l: "Invert", d: false,
            tip: "Flips the picture to its negative" },
        ],
      },
    ],
  },

  {
    id: "effect", label: "Effect",
    sections: [
      {
        title: "Screen",
        controls: [
          S("pixelate", "Pixelate", 0, 1, 0.01, 0, {
            tip: "Drops the resolution until the picture is visible blocks" }),
          S("halftone", "Halftone", 0, 1, 0.01, 0, {
            tip: "Rebuilds the picture out of print dots, sized by how dark each patch is" }),
          S("halftoneScale", "Cell size", 2, 60, 0.5, 12, { unit: "px", dep: (s) => s.halftone > 0,
            tip: "How large one dot cell is — small reads as newsprint, large as pop art" }),
          S("halftoneAngle", "Screen angle", 0, 180, 1, 45, { unit: "°", int: true, dep: (s) => s.halftone > 0,
            tip: "Turns the dot grid; real print uses forty-five degrees so the dots stop reading as rows and columns" }),
          { k: "halftoneShape", t: "seg", l: "Shape", d: "dot",
            opts: [["dot", "Dot"], ["line", "Line"], ["cross", "Cross"]],
            dep: (s) => s.halftone > 0,
            tip: "Round dots, straight lines, or crossed hatching like an engraving" },
          S("edge", "Edges", 0, 1, 0.01, 0, {
            tip: "Finds the outlines in the picture and draws them" }),
          { k: "edgeMode", t: "seg", l: "Edge mode", d: "over",
            opts: [["over", "Over"], ["only", "Only"], ["invert", "Invert"]],
            dep: (s) => s.edge > 0,
            tip: "Lay the outlines over the photograph, keep them alone on black, or flip to dark lines on white" },
          S("emboss", "Emboss", 0, 1, 0.01, 0, {
            tip: "Lights the picture from one side so it reads as pressed metal" }),
        ],
      },
      {
        title: "Distort",
        controls: [
          S("kaleido", "Kaleidoscope", 0, 12, 1, 0, { int: true,
            tip: "Folds the canvas into that many mirrored wedges around the centre" }),
          S("kaleidoAngle", "Kaleido angle", -180, 180, 1, 0, { unit: "°", bipolar: true, int: true,
            dep: (s) => s.kaleido > 0,
            tip: "Turns the picture inside the wedges, which is the control you nudge to find the arrangement worth keeping" }),
          { k: "mirror", t: "seg", l: "Mirror", d: "off", wrap: 3,
            opts: [["off", "Off"], ["left", "Left"], ["right", "Right"],
                   ["top", "Top"], ["bottom", "Bottom"], ["quad", "Quad"]],
            tip: "Reflects one half of the canvas onto the other, or all four quarters at once" },
          S("waveAmt", "Wave", 0, 1, 0.01, 0, {
            tip: "Ripples the picture as though it were seen through moving water" }),
          S("waveFreq", "Wave scale", 1, 40, 0.5, 8, { dep: (s) => s.waveAmt > 0,
            tip: "How tightly the ripples are packed — low is a slow swell, high is corrugation" }),
          S("glitch", "Glitch", 0, 1, 0.01, 0, {
            tip: "Tears the picture into horizontal slices and shoves them sideways" }),
          S("glitchScale", "Slice count", 2, 80, 1, 18, { int: true, dep: (s) => s.glitch > 0,
            tip: "How many bands the tear is cut into — few reads as damage, many as static" }),
          S("rgbSplit", "RGB split", 0, 1, 0.01, 0, {
            tip: "Pulls the red, green and blue channels apart into coloured ghosts" }),
          S("rgbAngle", "Split angle", 0, 360, 1, 0, { unit: "°", int: true, dep: (s) => s.rgbSplit > 0,
            tip: "Direction the channels separate along" }),
          S("scanlines", "Scanlines", 0, 1, 0.01, 0, {
            tip: "Dark lines across the frame, the way a picture off a tube screen looks" }),
          S("scanCount", "Line count", 40, 1200, 10, 300, { int: true, dep: (s) => s.scanlines > 0,
            tip: "How many lines fit from top to bottom, fixed so an export matches the preview" }),
        ],
      },
      {
        title: "Finish",
        controls: [
          S("bloom", "Bloom", 0, 1.5, 0.01, 0, {
            tip: "Light bleeds out of the brightest areas and spills over what is next to them" }),
          S("bloomThresh", "Bloom cut", 0, 1, 0.01, 0.6, { dep: (s) => s.bloom > 0,
            tip: "How bright a pixel has to be before it is allowed to glow" }),
          S("chroma", "Aberration", 0, 1, 0.01, 0, {
            tip: "Colour fringing that grows towards the corners, the way a cheap lens behaves" }),
          S("grain", "Grain", 0, 1, 0.01, 0, {
            tip: "Film grain over the finished frame, which hides banding as well as it adds age" }),
          S("grainSize", "Grain size", 0.5, 8, 0.1, 1, { dep: (s) => s.grain > 0,
            tip: "How coarse the specks are — large reads as pushed high-speed film, small as sensor noise" }),
          S("vignette", "Vignette", -1, 1, 0.01, 0, { bipolar: true,
            tip: "Darkens the corners to pull the eye inwards, or lifts them when negative" }),
          S("border", "Border", 0, 0.25, 0.005, 0, {
            tip: "An inset frame around the picture, measured against the short edge" }),
          { k: "borderColor", t: "color", l: "Border ink", d: "#0a0a0b", dep: (s) => s.border > 0,
            tip: "Colour of that frame" },
          { k: "animate", t: "toggle", l: "Animate", d: false,
            tip: "Lets the moving effects run — grain, glitch and wave sit perfectly still until this is on" },
          S("animSpeed", "Rate", 0, 3, 0.01, 1, { dep: (s) => s.animate,
            tip: "How fast that movement runs" }),
        ],
      },
    ],
  },

  {
    id: "subject", label: "Subject",
    sections: [
      {
        /* Feather, grow/shrink and smooth carry no fx flag on purpose: all
           three are shaped at the edge by the composite shader, not by a CPU
           rebuild. Only the detector, the wand and the brush write the mask
           array itself. */
        title: "Selection",
        controls: [
          { k: "maskBtns", t: "buttons", l: "Mask",
            items: [["detect", "Find subject"], ["invertMask", "Invert"], ["clearMask", "Clear"]],
            tip: "Work out where the subject is, swap which side of it is selected, or throw the selection away" },
          S("maskFeather", "Feather", 0, 1, 0.01, 0.25, {
            tip: "How soft the edge of the selection is — a little softness hides a rough cut-out" }),
          S("maskExpand", "Grow / shrink", -1, 1, 0.01, 0, { bipolar: true,
            tip: "Pushes the selection outwards or pulls it in, which is how you trim a halo off a light background" }),
          S("maskSmooth", "Smooth", 0, 1, 0.01, 0.3, {
            tip: "Rounds the wobble out of the selection outline instead of following every pixel" }),
          { k: "showMask", t: "toggle", l: "Show mask", d: false,
            tip: "Paints the selection in red over a flattened picture so you can see exactly what it caught" },
          { k: "brushMode", t: "seg", l: "Tool", d: "off", wrap: 5,
            opts: [["off", "Off"], ["box", "Box"], ["add", "Add"], ["erase", "Erase"], ["wand", "Pick"]],
            tip: "Box draws a rectangle round the subject and cuts it out from inside that hint — the most reliable of the three. Add and Erase paint the selection by hand; Pick takes everything of one colour in a press" },
          S("brushSize", "Brush size", 0.01, 0.4, 0.005, 0.08,
            { dep: (s) => s.brushMode === "add" || s.brushMode === "erase",
              tip: "Width of the brush as a fraction of the frame, so it stays the same size at any canvas" }),
          S("wandTol", "Pick tolerance", 0.02, 0.6, 0.01, 0.16, { dep: (s) => s.brushMode === "wand",
            tip: "How far a colour may drift from the one you pressed on and still be taken — hold Alt while pressing to remove instead" }),
        ],
      },
      {
        title: "Background",
        controls: [
          { k: "bgMode", t: "select", l: "Background", d: "keep", opts: BG_MODES,
            tip: "What happens behind the subject — leave it, replace it with colour, throw it out of focus, or knock it out to real transparency" },
          { k: "bgColorA", t: "color", l: "Base", d: "#0a0a0b",
            dep: (s) => ["solid", "gradient"].includes(s.bgMode),
            tip: "The flat colour behind the subject, and the top of the gradient" },
          { k: "bgColorB", t: "color", l: "Second", d: "#26262c",
            dep: (s) => s.bgMode === "gradient",
            tip: "The bottom of that gradient" },
          S("bgBlur", "Background blur", 0, 1, 0.01, 0.6, { dep: (s) => s.bgMode === "blur",
            tip: "How far out of focus the background goes, from a hint of depth to unreadable" }),
          S("bgDim", "Background level", -1, 1, 0.01, 0, { bipolar: true,
            dep: (s) => s.bgMode !== "transparent",
            tip: "Darkens or lifts everything behind the subject in stops, which is the cheapest way to make a subject stand off" }),
        ],
      },
      {
        title: "Separation",
        controls: [
          { k: "effectTarget", t: "seg", l: "Apply effects to", d: "all",
            opts: [["all", "All"], ["subject", "Subject"], ["background", "Background"]],
            tip: "Whether every tone, grade and effect above hits the whole frame or only one side of the selection" },
          S("subjectLift", "Subject level", -1, 1, 0.01, 0, { bipolar: true,
            tip: "Darkens or lifts the subject alone, for when it sits half a stop off its new background" }),
          S("outline", "Outline", 0, 0.06, 0.001, 0, {
            tip: "Draws a line around the subject, the way a sticker is die-cut" }),
          { k: "outlineColor", t: "color", l: "Outline ink", d: "#f2f2f3", dep: (s) => s.outline > 0,
            tip: "Colour of that line" },
          S("shadowAmt", "Drop shadow", 0, 1, 0.01, 0, {
            tip: "How solid a shadow the subject casts onto whatever is behind it" }),
          S("shadowAngle", "Shadow angle", -180, 180, 1, 45, { unit: "°", bipolar: true, int: true,
            dep: (s) => s.shadowAmt > 0,
            tip: "Which way the shadow falls, and so where the light is coming from" }),
          S("shadowDist", "Shadow offset", 0, 0.2, 0.002, 0.03, { dep: (s) => s.shadowAmt > 0,
            tip: "How far the shadow is thrown, which reads as how far the subject floats above the background" }),
          S("shadowBlurR", "Shadow blur", 0, 0.1, 0.001, 0.02, { dep: (s) => s.shadowAmt > 0,
            tip: "Sharp shadows sit the subject on the ground, soft ones lift it away" }),
          { k: "shadowColor", t: "color", l: "Shadow ink", d: "#000000", dep: (s) => s.shadowAmt > 0,
            tip: "Colour of the shadow — a dark version of the background reads truer than black" },
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
          { k: "aspect", t: "seg", l: "Ratio", d: "free", fx: "size", wrap: 4,
            opts: [["free", "Free"], ...ASPECTS.map((a) => [a[0], a[0]])],
            tip: "Locks the canvas to a standard ratio; Free keeps whatever size you type below" },
          { k: "dims", t: "vec", l: "Size", d: [1600, 1200], fx: "size", keys: ["width", "height"],
            min: 160, max: 4096, unit: "px",
            tip: "Exact canvas size in pixels — this is what an export contains, whatever the preview is showing" },
          S("renderScale", "Render scale", 0.4, 2, 0.05, 1, { fx: "size",
            tip: "Preview resolution relative to the canvas — drop it when a big picture feels sluggish, exports are unaffected" }),
          { k: "quality", t: "seg", l: "Quality", d: "balanced", fx: "size",
            opts: [["eco", "Eco"], ["balanced", "Balanced"], ["high", "High"]],
            tip: "Caps total pixels and how many blur passes run, so a 4K canvas cannot bring a laptop down" },
        ],
      },
      {
        title: "Export",
        controls: [
          { k: "exportPng", t: "buttons", l: "Still",
            items: [["png1", "PNG 1×"], ["png2", "PNG 2×"], ["copy", "Copy"]],
            tip: "Writes one frame at exactly the canvas size or at twice it, or puts it straight on the clipboard" },
          { k: "format", t: "seg", l: "Format", d: "png",
            opts: [["png", "PNG"], ["jpg", "JPEG"], ["webp", "WebP"]],
            tip: "PNG is the only one that keeps a transparent background; JPEG is smallest and WebP sits between them" },
          S("jpgQuality", "JPEG quality", 0.3, 1, 0.01, 0.92, { dep: (s) => s.format !== "png",
            tip: "How hard the file is compressed before blocking shows up around edges" }),
          S("clipLength", "Clip length", 1, 30, 0.5, 6, { unit: "s", dep: (s) => s.animate,
            tip: "How long a recorded clip runs before it stops itself" }),
          { k: "clipFps", t: "seg", l: "Frame rate", d: 30, opts: [[24, "24"], [30, "30"], [60, "60"]],
            dep: (s) => s.animate,
            tip: "Frames per second in the recorded clip" },
          { k: "record", t: "buttons", l: "Motion", items: [["rec", "Record clip"]],
            dep: (s) => s.animate,
            tip: "Records the live canvas to a video file — only worth reaching for once Animate is on, since a still frame makes a still clip" },
        ],
      },
      {
        title: "Session",
        controls: [
          { k: "presetPick", t: "presets", l: "Presets",
            tip: "Complete looks — applying one is a single step you can undo" },
          { k: "sessionBtns", t: "buttons", l: "State",
            items: [["share", "Link"], ["save", "Save"], ["load", "Load"], ["reset", "Reset"]],
            tip: "Copy the whole edit as a link, or move it between machines as a settings file" },
          { k: "autosave", t: "toggle", l: "Remember settings", d: true,
            tip: "Keeps this edit in local storage between visits" },
        ],
      },
    ],
  },
];

/* ------------------------------------------------------------- built-ins

   Each of these is a whole look rather than a demonstration of one slider.
   They are written as complete recipes — the tone that supports the grade,
   the grain that sells the film stock — because a preset that only sets its
   headline parameter falls apart on the next photograph. */

const PRESETS = [
  { id: "punch", name: "Punch", patch: {
    exposure: 0.08, contrast: 0.24, whites: 0.1, blacks: -0.14,
    vibrance: 0.24, saturation: 0.04, clarity: 0.28, sharpen: 0.35,
    grain: 0.04, vignette: 0.12 } },

  { id: "mono", name: "Hard mono", patch: {
    gradeMode: "mono", gradeAmt: 1, exposure: 0.05, contrast: 0.46,
    highlights: -0.12, shadows: -0.1, whites: 0.22, blacks: -0.32,
    clarity: 0.42, sharpen: 0.5, grain: 0.14, grainSize: 1.2, vignette: 0.22 } },

  { id: "bleach", name: "Bleach bypass", patch: {
    exposure: 0.12, contrast: 0.42, highlights: 0.16, blacks: -0.22,
    saturation: -0.55, vibrance: 0.1, clarity: 0.36, sharpen: 0.25,
    gradeMode: "split", gradeAmt: 0.45,
    gradeA: "#101418", gradeB: "#f2f1ea", gradeC: "#8f9296",
    grain: 0.12, vignette: 0.2 } },

  { id: "cold", name: "Cold cinema", patch: {
    exposure: -0.05, contrast: 0.2, highlights: -0.1, shadows: 0.14,
    blacks: -0.2, temperature: -0.32, tintGM: 0.06, saturation: -0.14,
    gradeMode: "split", gradeAmt: 0.6,
    gradeA: "#0e1a26", gradeB: "#f2e6d2", gradeC: "#5b6a76",
    clarity: 0.16, grain: 0.07, vignette: 0.26 } },

  { id: "warmfilm", name: "Warm film", patch: {
    exposure: 0.06, contrast: 0.1, highlights: -0.16, shadows: 0.18,
    blacks: -0.06, temperature: 0.24, tintGM: -0.05,
    vibrance: 0.2, saturation: -0.08,
    gradeMode: "split", gradeAmt: 0.42,
    gradeA: "#241d16", gradeB: "#ffeccd", gradeC: "#a89680",
    softBlur: 0.08, grain: 0.24, grainSize: 1.4, vignette: 0.16 } },

  { id: "duotone", name: "Duotone poster", patch: {
    contrast: 0.32, blacks: -0.18, whites: 0.12, clarity: 0.3, sharpen: 0.3,
    gradeMode: "duotone", gradeAmt: 1, gradeA: "#111436", gradeB: "#f4e9d8",
    posterize: 0.34, border: 0.02, borderColor: "#f4e9d8" } },

  { id: "riso", name: "Risograph", patch: {
    exposure: 0.1, contrast: 0.26, shadows: 0.1, saturation: -0.2,
    gradeMode: "duotone", gradeAmt: 1, gradeA: "#1b2a7a", gradeB: "#ffd3dc",
    dither: "bayer4", ditherLevels: 5,
    halftone: 0.34, halftoneScale: 6, halftoneAngle: 20,
    grain: 0.2, grainSize: 1.6, border: 0.015, borderColor: "#ffd3dc" } },

  { id: "newsprint", name: "Newsprint", patch: {
    gradeMode: "mono", gradeAmt: 1, brightness: 0.06, contrast: 0.36,
    blacks: -0.18, clarity: 0.22,
    halftone: 0.9, halftoneScale: 7.5, halftoneAngle: 45, halftoneShape: "dot",
    sepia: 0.14, grain: 0.1, border: 0.012, borderColor: "#0a0a0b" } },

  { id: "bayer", name: "Bayer pixel", patch: {
    contrast: 0.3, saturation: -0.2, clarity: 0.2,
    gradeMode: "duotone", gradeAmt: 0.85, gradeA: "#0b1a12", gradeB: "#c8ffd0",
    pixelate: 0.42, posterize: 0.5, dither: "bayer8", ditherLevels: 4,
    scanlines: 0.12, scanCount: 240 } },

  { id: "push", name: "Grain push", patch: {
    exposure: 0.38, contrast: 0.34, highlights: -0.12, blacks: -0.26,
    gradeMode: "mono", gradeAmt: 0.85, clarity: 0.32, sharpen: 0.2,
    softBlur: 0.06, grain: 0.85, grainSize: 2.2, vignette: 0.3 } },

  { id: "cross", name: "Cross process", patch: {
    exposure: 0.04, contrast: 0.36, highlights: 0.16, blacks: -0.22,
    temperature: 0.16, tintGM: -0.24, vibrance: 0.16, saturation: 0.3,
    gradeMode: "split", gradeAmt: 0.7,
    gradeA: "#0b3b2e", gradeB: "#fff0b8", gradeC: "#7a6f8c",
    grain: 0.13, vignette: 0.28 } },

  { id: "infrared", name: "Infrared", patch: {
    exposure: 0.15, contrast: 0.26, highlights: 0.1, temperature: -0.1,
    hueShift: 128, vibrance: 0.3, saturation: 0.45,
    gradeMode: "split", gradeAmt: 0.45,
    gradeA: "#20003a", gradeB: "#ffd7e6", gradeC: "#c86ba0",
    bloom: 0.36, bloomThresh: 0.55, grain: 0.09, vignette: 0.2 } },

  { id: "vhs", name: "VHS", patch: {
    exposure: 0.05, contrast: 0.12, temperature: 0.07, saturation: 0.22,
    softBlur: 0.2, glitch: 0.35, glitchScale: 26,
    rgbSplit: 0.35, rgbAngle: 0, scanlines: 0.45, scanCount: 420,
    chroma: 0.3, grain: 0.3, grainSize: 1.8, vignette: 0.32,
    animate: true, animSpeed: 1.2 } },

  { id: "cutout", name: "Cutout", patch: {
    contrast: 0.18, clarity: 0.22, sharpen: 0.3, vibrance: 0.14,
    maskFeather: 0.16, maskSmooth: 0.4,
    bgMode: "solid", bgColorA: "#e2483a",
    outline: 0.006, outlineColor: "#f2f2f3",
    shadowAmt: 0.38, shadowAngle: 55, shadowDist: 0.035,
    shadowBlurR: 0.028, shadowColor: "#000000" } },

  { id: "focus", name: "Subject in focus", patch: {
    exposure: 0.04, contrast: 0.14, clarity: 0.26, sharpen: 0.4,
    maskFeather: 0.32, maskSmooth: 0.4,
    bgMode: "blur", bgBlur: 0.85, bgDim: -0.38,
    subjectLift: 0.1, vignette: 0.22, grain: 0.05 } },

  { id: "highkey", name: "High key", patch: {
    exposure: 0.46, brightness: 0.12, contrast: -0.1, gamma: 1.12,
    highlights: 0.22, shadows: 0.26, whites: 0.26, blacks: 0.12,
    vibrance: 0.12, saturation: -0.12, clarity: -0.12, softBlur: 0.12,
    bloom: 0.32, bloomThresh: 0.7, vignette: -0.26 } },

  { id: "ink", name: "Ink threshold", patch: {
    gradeMode: "mono", gradeAmt: 1, contrast: 0.24, clarity: 0.4, sharpen: 0.3,
    thresholdAmt: 1, thresholdLevel: 0.52,
    border: 0.02, borderColor: "#0a0a0b" } },

  { id: "blueprint", name: "Blueprint", patch: {
    contrast: 0.2, clarity: 0.3,
    edge: 0.85, edgeMode: "only",
    gradeMode: "duotone", gradeAmt: 1, gradeA: "#0a1f4d", gradeB: "#dfe9ff",
    grain: 0.07, border: 0.012, borderColor: "#dfe9ff" } },

  { id: "kaleido", name: "Kaleidoscope", patch: {
    exposure: 0.06, contrast: 0.18, vibrance: 0.24, saturation: 0.1,
    kaleido: 6, kaleidoAngle: 0,
    bloom: 0.22, bloomThresh: 0.62, vignette: 0.26,
    animate: true, animSpeed: 0.4 } },

  { id: "flare", name: "Solar flare", patch: {
    exposure: 0.1, contrast: 0.22, saturation: 0.32,
    solarize: 0.7,
    gradeMode: "gradient", gradeAmt: 0.55,
    gradeA: "#12060a", gradeB: "#ffe9a8", gradeC: "#b8452a",
    bloom: 0.4, bloomThresh: 0.55, grain: 0.1, vignette: 0.26 } },
];

/* --------------------------------------------------------------- runtime */

/* Randomising leaves alone everything that is a decision about this
   particular photograph rather than about the look: how it is framed, where
   the subject was found, what happens behind it, and how big the export is.
   Rolling those would mean every random look had to be re-framed by hand. */
const NO_RANDOM = [
  "fit", "zoom", "panX", "panY", "rotate", "flipH", "flipV",
  "maskFeather", "maskExpand", "maskSmooth", "showMask", "brushMode", "brushSize", "wandTol",
  "bgMode", "bgColorA", "bgColorB", "bgBlur", "bgDim",
  "effectTarget", "subjectLift", "outline", "outlineColor",
  "shadowAmt", "shadowAngle", "shadowDist", "shadowBlurR", "shadowColor",
  "aspect", "width", "height", "renderScale", "quality",
  "format", "jpgQuality", "autosave", "animate", "animSpeed",
  "clipLength", "clipFps",
];

/* Clear returns the picture to the state it arrived in: every tone, grade and
   effect back to nothing, while the framing, the selection and the canvas
   stay exactly as they were set. Built from the schema so it cannot drift out
   of step with the defaults. */
const NEUTRAL_PANELS = ["tone", "grade", "effect"];
const CLEAR_PATCH = {};
for (const panel of SCHEMA) {
  if (!NEUTRAL_PANELS.includes(panel.id)) continue;
  for (const sec of panel.sections) {
    for (const c of sec.controls) {
      if (c.d !== undefined && c.t !== "pad" && c.t !== "vec") CLEAR_PATCH[c.k] = c.d;
    }
  }
}

/* Colour sets the randomiser grades with. Each one is a complete triple —
   shadow, highlight, midtone — chosen together, because two colours drawn
   independently almost never agree, and the midtone is what decides whether a
   grade reads as a look or as mud. */
const GRADE_SETS = [
  { a: "#0d1117", b: "#f4f2ec", c: "#7d828c" },   // neutral ink
  { a: "#0e1a26", b: "#f2e6d2", c: "#5b6a76" },   // cold day for night
  { a: "#241d16", b: "#ffeccd", c: "#a89680" },   // warm negative
  { a: "#111436", b: "#f4e9d8", c: "#6a6ba0" },   // navy and bone
  { a: "#1b2a7a", b: "#ffd3dc", c: "#8a6f9c" },   // riso blue and pink
  { a: "#0b3b2e", b: "#fff0b8", c: "#7a8f5c" },   // cross-processed slide
  { a: "#20003a", b: "#ffd7e6", c: "#c86ba0" },   // false colour
  { a: "#12060a", b: "#ffe9a8", c: "#b8452a" },   // ember
  { a: "#0a1f4d", b: "#dfe9ff", c: "#5f86c4" },   // blueprint
  { a: "#1a1512", b: "#e8ded0", c: "#8c7a66" },   // sepia print
];

/* One stylistic move each, with the settings that move needs to look
   deliberate. Two moves from the same group fight each other — a halftone
   under a pixelation is mush, a kaleidoscope under a mirror is soup — so the
   picker takes at most one from any group. */
const STYLE_MOVES = [
  { group: "screen", apply(p, { rand, pick }) {
    p.halftone = +rand(0.55, 1).toFixed(2);
    p.halftoneScale = +rand(4, 16).toFixed(1);
    p.halftoneAngle = pick([15, 30, 45, 60, 75]);
    p.halftoneShape = pick(["dot", "dot", "dot", "line", "cross"]);
    p.contrast = +Math.min(0.6, p.contrast + 0.15).toFixed(2);
  } },
  /* Coarsening the picture and dithering it are two different ideas about the
     same thing, and doing both at once is how a photograph turns into
     speckle: the ordered pattern lands on tones the quantiser has already
     flattened, so every smooth gradient breaks into confetti. They are two
     moves, and the group they share means only one of them can be drawn. */
  { group: "screen", apply(p, { rand }) {
    p.pixelate = +rand(0.18, 0.42).toFixed(2);
    p.posterize = +rand(0.25, 0.5).toFixed(2);
    p.clarity = +Math.min(0.6, p.clarity + 0.12).toFixed(2);
  } },
  { group: "screen", apply(p, { rand, pick }) {
    p.dither = pick(["bayer4", "bayer4", "bayer8", "noise"]);
    // Enough levels to read as a screen print rather than as noise; the low
    // counts are only bearable on a picture that is already flat.
    p.ditherLevels = pick([5, 6, 6, 8, 10]);
    p.contrast = +Math.min(0.6, p.contrast + 0.12).toFixed(2);
    p.saturation = +Math.max(-0.9, p.saturation - 0.1).toFixed(2);
  } },
  { group: "screen", apply(p, { rand, pick }) {
    p.edge = +rand(0.45, 0.9).toFixed(2);
    p.edgeMode = pick(["over", "over", "only", "invert"]);
    p.clarity = +Math.min(0.6, p.clarity + 0.1).toFixed(2);
  } },
  { group: "distort", apply(p, { rand, pick }) {
    p.kaleido = pick([3, 4, 5, 6, 6, 8]);
    p.kaleidoAngle = Math.round(rand(-180, 180));
  } },
  { group: "distort", apply(p, { pick }) {
    p.mirror = pick(["left", "right", "top", "quad"]);
  } },
  { group: "distort", apply(p, { rand }) {
    p.waveAmt = +rand(0.15, 0.5).toFixed(2);
    p.waveFreq = +rand(3, 18).toFixed(1);
  } },
  { group: "break", apply(p, { rand }) {
    p.glitch = +rand(0.2, 0.55).toFixed(2);
    p.glitchScale = Math.round(rand(8, 40));
    p.rgbSplit = +rand(0.15, 0.45).toFixed(2);
    p.rgbAngle = Math.round(rand(0, 360));
  } },
  { group: "break", apply(p, { rand }) {
    p.scanlines = +rand(0.25, 0.6).toFixed(2);
    p.scanCount = Math.round(rand(160, 700) / 10) * 10;
    p.chroma = +rand(0.1, 0.35).toFixed(2);
  } },
  { group: "finish", apply(p, { rand }) {
    p.bloom = +rand(0.3, 0.8).toFixed(2);
    p.bloomThresh = +rand(0.45, 0.75).toFixed(2);
  } },
  { group: "finish", apply(p, { rand }) {
    // Grain past about two thirds stops reading as stock and starts reading
    // as a broken sensor, so the top of the range is left to the sliders.
    p.grain = +rand(0.3, 0.62).toFixed(2);
    p.grainSize = +rand(1.2, 3).toFixed(1);
  } },
  { group: "finish", apply(p, { rand }) {
    p.solarize = +rand(0.35, 0.8).toFixed(2);
    p.saturation = +Math.min(0.6, p.saturation + 0.2).toFixed(2);
  } },
];

/* Whether the starting preset is already shouting. If it is, the randomiser
   adds nothing, or at most one more thing. Enumerated controls count too — a
   preset that already dithers or mirrors is as committed as one that has
   pushed a slider, and the earlier version of this list, being numbers only,
   quietly let those stack a second effect on top. */
const LOUD = [
  "halftone", "pixelate", "posterize", "thresholdAmt", "edge", "emboss",
  "glitch", "rgbSplit", "scanlines", "kaleido", "waveAmt", "solarize",
  "grain", "chroma", "bloom",
];
const LOUD_ENUM = ["dither", "mirror"];

/* Which preset the last roll started from, so the next one starts somewhere
   else. Two identical-looking results in a row is what makes a randomise
   button feel broken, even when the numbers underneath really did change. */
let lastBase = "";

const lim = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/**
 * Vary a look rather than sample the parameter space.
 *
 * Sampling every slider independently produces noise, reliably: the space of
 * settings is mostly ugly and only a thin shell of it is design. So this
 * starts from a preset — by definition a look someone shaped — re-rolls its
 * colour, jitters its tone inside bounds that keep the picture readable, and
 * then adds one or two stylistic moves at most. The result should look like
 * something a person chose, and unlike the previous one.
 */
function randomLook(helpers) {
  const { pick, rand, chance, DEFAULTS, PRESETS: presets } = helpers;

  let base = pick(presets);
  for (let i = 0; i < 6 && base.id === lastBase && presets.length > 1; i++) base = pick(presets);
  lastBase = base.id;

  const p = { ...DEFAULTS, ...base.patch };

  // ---- colour ------------------------------------------------------------

  // Most of the time the grade is re-rolled outright, which is the single
  // change that most alters what a look feels like. The rest of the time the
  // preset's own grade survives and the tone jitter below does the work.
  if (chance(0.72)) {
    const set = pick(GRADE_SETS);
    p.gradeMode = pick(["duotone", "duotone", "gradient", "split", "split", "mono", "off"]);
    p.gradeA = set.a;
    p.gradeB = set.b;
    p.gradeC = set.c;
    // Split tone sits on top of the photograph, so it wants a light hand;
    // the mapping modes replace the colour outright and want a firm one.
    p.gradeAmt = p.gradeMode === "split"
      ? +rand(0.3, 0.7).toFixed(2)
      : +rand(0.65, 1).toFixed(2);
  }

  if (chance(0.12) && p.gradeMode === "off") p.hueShift = Math.round(rand(-180, 180));

  // ---- tone, jittered around whatever the preset set --------------------

  const jit = (v, amt, lo, hi) => +lim(v + rand(-amt, amt), lo, hi).toFixed(2);
  p.exposure = jit(p.exposure, 0.2, -0.8, 0.8);
  p.brightness = jit(p.brightness, 0.08, -0.25, 0.25);
  p.contrast = jit(p.contrast, 0.16, -0.35, 0.6);
  p.gamma = +lim(p.gamma + rand(-0.1, 0.1), 0.7, 1.4).toFixed(2);
  p.highlights = jit(p.highlights, 0.14, -0.5, 0.4);
  p.shadows = jit(p.shadows, 0.14, -0.4, 0.5);
  p.whites = jit(p.whites, 0.12, -0.4, 0.4);
  p.blacks = jit(p.blacks, 0.12, -0.45, 0.35);
  p.temperature = jit(p.temperature, 0.18, -0.55, 0.55);
  p.tintGM = jit(p.tintGM, 0.12, -0.4, 0.4);
  p.vibrance = jit(p.vibrance, 0.16, -0.4, 0.6);
  p.saturation = jit(p.saturation, 0.16, -0.9, 0.5);
  p.clarity = jit(p.clarity, 0.15, -0.35, 0.6);
  p.sharpen = +lim(p.sharpen + rand(-0.15, 0.25), 0, 0.9).toFixed(2);

  // ---- one or two moves, not eleven -------------------------------------

  const busy = LOUD.filter((k) => (base.patch[k] ?? 0) > 0.15).length +
    LOUD_ENUM.filter((k) => base.patch[k] && base.patch[k] !== "off").length;
  let moves = busy >= 2 ? 0 : busy === 1 ? (chance(0.35) ? 1 : 0) : pick([0, 1, 1, 2]);

  const pool = STYLE_MOVES.slice();
  const spent = new Set();
  while (moves > 0 && pool.length) {
    const move = pick(pool);
    pool.splice(pool.indexOf(move), 1);
    if (spent.has(move.group)) continue;
    spent.add(move.group);
    move.apply(p, helpers);
    moves--;
  }

  // ---- finish ------------------------------------------------------------

  // Grain and a vignette are the two things that quietly hold a frame
  // together, so they are always present in some small amount.
  if (!p.grain) p.grain = +rand(0.03, 0.16).toFixed(2);
  p.vignette = +lim(p.vignette + rand(-0.08, 0.16), -0.3, 0.42).toFixed(2);
  p.border = chance(0.15) ? pick([0.01, 0.015, 0.02]) : 0;
  p.borderColor = p.gradeB || DEFAULTS.borderColor;
  p.invert = false;

  return p;
}

window.ISO.State = window.ISO.createStore({
  SCHEMA,
  noRandom: NO_RANDOM,
  randomize: randomLook,
  clearPatch: CLEAR_PATCH,
  extras: { PRESETS, ASPECTS, GRADE_MODES, DITHERS, BG_MODES, GRADE_SETS },
});
})();
