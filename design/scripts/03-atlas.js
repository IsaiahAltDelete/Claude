/* ---------------------------------------------------------------------------
   The glyph atlas.

   Text is rasterised once, into one texture, and then drawn thousands of times
   by the GPU. Every "text effect" is a 2D canvas recipe applied while a token
   is stamped into its cell — which is why they compose with any typeface and
   with emoji, and why they cost nothing per frame.

   Layout is shelf packing: tokens keep their own aspect ratio, sit on rows of
   equal height, and each reports the exact UV rect it occupies so quads are
   never stretched.
   --------------------------------------------------------------------------- */

(() => {
const { clamp, hexToRgba, rgbaToCss, toCss, TAU } = window.ISO;

const MAX_CELLS = 64;
const MAX_TEX = 2048;
const REF = 100;                       // reference font size used for measuring
const EMOJI_STACK = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","EmojiOne Color",sans-serif';

const segmenter = typeof Intl !== "undefined" && Intl.Segmenter
  ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
  : null;

const graphemes = (str) =>
  segmenter ? Array.from(segmenter.segment(str), (s) => s.segment) : Array.from(str);

/* Scratch surfaces, created once and reused for the life of the page. */
const measureCanvas = document.createElement("canvas");
const measureCtx = measureCanvas.getContext("2d", { willReadFrequently: false });
const cellCanvas = document.createElement("canvas");
const cellCtx = cellCanvas.getContext("2d");
const atlasCanvas = document.createElement("canvas");
const atlasCtx = atlasCanvas.getContext("2d");

let noisePattern = null;

function noise() {
  if (noisePattern) return noisePattern;
  const n = document.createElement("canvas");
  n.width = n.height = 64;
  const c = n.getContext("2d");
  const img = c.createImageData(64, 64);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = (Math.random() * 255) | 0;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  c.putImageData(img, 0, 0);
  noisePattern = n;
  return n;
}

/* -------------------------------------------------------------- tokenising */

function applyCase(text, mode) {
  if (mode === "upper") return text.toUpperCase();
  if (mode === "lower") return text.toLowerCase();
  if (mode === "title") return text.replace(/\S+/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
  return text;
}

/** Split the input into the pieces that each become one instance texture. */
function tokenise(text, split, caseMode) {
  const src = applyCase(String(text ?? ""), caseMode);
  let tokens;
  if (split === "lines") tokens = src.split("\n");
  else if (split === "words") tokens = src.split(/\s+/);
  else if (split === "chars") tokens = graphemes(src.replace(/\s+/g, " ")).filter((c) => c !== " ");
  else tokens = [src];
  // No text means an empty canvas, not a placeholder mark: clearing the field
  // is how you clear the artboard. Callers slice to MAX_CELLS themselves so
  // they can tell the user what was left out.
  return tokens.map((t) => t.replace(/\s+$/g, "")).filter((t) => t.length);
}

/* -------------------------------------------------------------- measuring */

function fontSpec(font, weight, size) {
  const face = window.ISO.State.FONT_BY_ID[font] || window.ISO.State.FONT_BY_ID.inter;
  const w = face.weights.includes(+weight) ? +weight : face.weights[0];
  return `${w} ${size}px ${face.css}, ${EMOJI_STACK}`;
}

/** Widths and vertical extents of a token at the reference size. */
function measure(token, spec, trackEm, lineGap) {
  measureCtx.font = spec;
  measureCtx.textAlign = "left";
  measureCtx.textBaseline = "alphabetic";
  const track = trackEm * REF;
  const lines = token.split("\n").map((line) => {
    const chars = graphemes(line);
    let width = 0;
    let ascent = 0;
    let descent = 0;
    for (const ch of chars) {
      const m = measureCtx.measureText(ch);
      width += m.width + track;
      ascent = Math.max(ascent, m.actualBoundingBoxAscent || REF * 0.72);
      descent = Math.max(descent, m.actualBoundingBoxDescent || REF * 0.22);
    }
    if (chars.length) width -= track;
    // A blank line still needs vertical room.
    if (!chars.length) { ascent = REF * 0.72; descent = REF * 0.2; }
    return { text: line, chars, width: Math.max(width, 1), ascent, descent };
  });
  const step = REF * lineGap;
  const first = lines[0];
  const last = lines[lines.length - 1];
  const height = first.ascent + last.descent + step * (lines.length - 1);
  return {
    lines,
    step,
    width: Math.max(...lines.map((l) => l.width)),
    height: Math.max(height, 1),
    top: first.ascent,
  };
}

/* --------------------------------------------------------------- stamping */

/** Extra room an effect needs around the glyphs, in fractions of cell height. */
function padFor(effect, amt, stroke) {
  const base = 0.05 + stroke * 0.9;
  switch (effect) {
    case "glow": return base + 0.22 * (0.3 + amt);
    case "extrude":
    case "shadow":
    case "echo": return base + 0.3 * amt;
    case "split": return base + 0.12 * amt;
    case "knockout":
    case "plate": return base + 0.16;
    case "outline":
    case "both":
    case "inline": return base + 0.02;
    default: return base;
  }
}

/**
 * Paint one token into the scratch cell canvas.
 * Composite operations are used freely because the canvas holds this token
 * alone; it is blitted into the atlas afterwards.
 */
function stamp(w, h, layout, spec, opts) {
  const { effect, amt, strokeEm, colorA, colorB, align, tracking } = opts;

  cellCanvas.width = w;
  cellCanvas.height = h;
  const ctx = cellCtx;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const pad = padFor(effect, amt, strokeEm);
  const scale = Math.min((h - 2 * pad * h) / layout.height, (w - 2 * pad * h) / layout.width);
  const size = REF * scale;
  const track = tracking * size;
  const lineW = Math.max(0.6, strokeEm * size);
  const originY = (h - layout.height * scale) / 2 + layout.top * scale;

  ctx.font = fontSpec(opts.font, opts.weight, size);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;

  /** Draw the whole token, offset by (dx,dy), either filled or stroked. */
  const draw = (dx, dy, mode) => {
    layout.lines.forEach((line, i) => {
      const lw = line.width * scale;
      let x = (w - lw) / 2;
      if (align === "left") x = pad * h;
      else if (align === "right") x = w - pad * h - lw;
      const y = originY + i * layout.step * scale;
      if (tracking === 0) {
        if (mode === "stroke") ctx.strokeText(line.text, x + dx, y + dy);
        else ctx.fillText(line.text, x + dx, y + dy);
      } else {
        let cx = x + dx;
        for (const ch of line.chars) {
          if (mode === "stroke") ctx.strokeText(ch, cx, y + dy);
          else ctx.fillText(ch, cx, y + dy);
          cx += ctx.measureText(ch).width + track;
        }
      }
    });
  };

  const A = toCss(colorA);
  const B = toCss(colorB);
  const d = amt * size;

  ctx.lineWidth = lineW;
  ctx.strokeStyle = B;
  ctx.fillStyle = A;

  switch (effect) {
    case "outline":
      ctx.strokeStyle = A;
      draw(0, 0, "stroke");
      break;

    case "both":
      ctx.strokeStyle = B;
      ctx.lineWidth = lineW * 2;
      draw(0, 0, "stroke");
      ctx.fillStyle = A;
      draw(0, 0, "fill");
      break;

    case "extrude": {
      const steps = Math.max(2, Math.round(2 + amt * 34));
      const ox = (d * 0.5) / steps, oy = (d * 0.5) / steps;
      ctx.fillStyle = B;
      for (let i = steps; i >= 1; i--) draw(ox * i, oy * i, "fill");
      ctx.fillStyle = A;
      draw(0, 0, "fill");
      break;
    }

    case "shadow": {
      const steps = Math.max(4, Math.round(6 + amt * 60));
      const len = d * 1.4;
      const c = hexToRgba(colorB);
      for (let i = steps; i >= 1; i--) {
        c.a = 0.9 * (1 - i / steps) ** 0.6;
        ctx.fillStyle = rgbaToCss(c);
        draw((len * i) / steps, (len * i) / steps, "fill");
      }
      ctx.fillStyle = A;
      draw(0, 0, "fill");
      break;
    }

    case "gradient": {
      const g = ctx.createLinearGradient(0, originY - layout.top * scale, 0, originY + layout.height * scale);
      g.addColorStop(0, A);
      g.addColorStop(1, B);
      ctx.fillStyle = g;
      draw(0, 0, "fill");
      break;
    }

    case "chrome": {
      const top = originY - layout.top * scale;
      const g = ctx.createLinearGradient(0, top, 0, top + layout.height * scale);
      const mid = clamp(0.44 + amt * 0.14, 0.2, 0.7);
      g.addColorStop(0, B);
      g.addColorStop(mid - 0.02, A);
      g.addColorStop(mid, "#ffffff");
      g.addColorStop(mid + 0.02, A);
      g.addColorStop(1, B);
      ctx.fillStyle = g;
      draw(0, 0, "fill");
      ctx.lineWidth = lineW * 0.6;
      ctx.strokeStyle = B;
      if (strokeEm > 0) draw(0, 0, "stroke");
      break;
    }

    case "split": {
      const o = d * 0.35 + 1;
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = "#ff2d2d";
      draw(-o, 0, "fill");
      ctx.fillStyle = "#2dffe0";
      draw(o, 0, "fill");
      ctx.globalCompositeOperation = "source-over";
      const c = hexToRgba(colorA);
      c.a = 0.86;
      ctx.fillStyle = rgbaToCss(c);
      draw(0, 0, "fill");
      break;
    }

    case "inline":
      ctx.fillStyle = A;
      draw(0, 0, "fill");
      ctx.globalCompositeOperation = "source-atop";
      ctx.strokeStyle = B;
      ctx.lineWidth = Math.max(1, lineW * 2);
      draw(0, 0, "stroke");
      ctx.globalCompositeOperation = "source-over";
      break;

    case "stripe": {
      ctx.fillStyle = A;
      draw(0, 0, "fill");
      ctx.globalCompositeOperation = "source-atop";
      ctx.fillStyle = B;
      const period = Math.max(3, size * (0.06 + (1 - amt) * 0.2));
      for (let y = -h; y < h * 2; y += period * 2) {
        ctx.save();
        ctx.translate(w / 2, h / 2);
        ctx.rotate(-Math.PI / 4);
        ctx.fillRect(-w, y, w * 3, period);
        ctx.restore();
      }
      ctx.globalCompositeOperation = "source-over";
      break;
    }

    case "halftone": {
      ctx.fillStyle = A;
      draw(0, 0, "fill");
      ctx.globalCompositeOperation = "source-atop";
      ctx.fillStyle = B;
      const step = Math.max(4, size * (0.05 + (1 - amt) * 0.14));
      const r = step * 0.3;
      for (let y = 0; y < h + step; y += step) {
        for (let x = 0; x < w + step; x += step) {
          ctx.beginPath();
          ctx.arc(x + ((y / step) % 2 ? step / 2 : 0), y, r, 0, TAU);
          ctx.fill();
        }
      }
      ctx.globalCompositeOperation = "source-over";
      break;
    }

    case "grain": {
      ctx.fillStyle = A;
      draw(0, 0, "fill");
      ctx.globalCompositeOperation = "source-atop";
      ctx.globalAlpha = 0.25 + amt * 0.6;
      const pat = ctx.createPattern(noise(), "repeat");
      ctx.fillStyle = pat;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      break;
    }

    case "glow": {
      ctx.shadowColor = B;
      ctx.shadowBlur = size * (0.16 + amt * 0.8);
      ctx.fillStyle = A;
      for (let i = 0; i < 4; i++) draw(0, 0, "fill");
      ctx.shadowBlur = 0;
      ctx.shadowColor = "transparent";
      draw(0, 0, "fill");
      break;
    }

    case "knockout": {
      const inset = pad * h * 0.35;
      ctx.fillStyle = A;
      ctx.fillRect(inset, inset, w - inset * 2, h - inset * 2);
      ctx.globalCompositeOperation = "destination-out";
      draw(0, 0, "fill");
      ctx.globalCompositeOperation = "source-over";
      break;
    }

    case "plate": {
      const inset = pad * h * 0.3;
      ctx.fillStyle = B;
      ctx.fillRect(inset, inset, w - inset * 2, h - inset * 2);
      ctx.fillStyle = A;
      draw(0, 0, "fill");
      break;
    }

    case "echo": {
      const steps = Math.max(2, Math.round(2 + amt * 8));
      const c = hexToRgba(colorB);
      for (let i = steps; i >= 1; i--) {
        c.a = 0.7 * (1 - i / (steps + 1));
        ctx.fillStyle = rgbaToCss(c);
        const o = (d * 1.6 * i) / steps;
        draw(-o, 0, "fill");
        draw(o, 0, "fill");
      }
      ctx.fillStyle = A;
      draw(0, 0, "fill");
      break;
    }

    case "scan": {
      ctx.fillStyle = A;
      draw(0, 0, "fill");
      ctx.globalCompositeOperation = "destination-out";
      const period = Math.max(2, size * (0.02 + (1 - amt) * 0.09));
      ctx.fillStyle = "#000";
      for (let y = 0; y < h; y += period * 2) ctx.fillRect(0, y, w, period);
      ctx.globalCompositeOperation = "source-over";
      break;
    }

    case "chop": {
      const slices = Math.max(2, Math.round(2 + amt * 6));
      const sh = h / slices;
      for (let i = 0; i < slices; i++) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, i * sh, w, sh);
        ctx.clip();
        ctx.fillStyle = i % 2 ? B : A;
        draw((i % 2 ? -1 : 1) * d * 0.3, 0, "fill");
        ctx.restore();
      }
      break;
    }

    default:
      ctx.fillStyle = A;
      draw(0, 0, "fill");
  }

  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
}

/* ------------------------------------------------------------------ build */

/** Make sure the faces a build needs are actually loaded before measuring. */
async function ensureFont(fontId, weight, sample) {
  if (!document.fonts) return;
  const spec = fontSpec(fontId, weight, REF);
  try {
    await document.fonts.load(spec, sample.slice(0, 220) || "A");
    await document.fonts.ready;
  } catch { /* a missing face just falls back */ }
}

/**
 * Build the atlas for the current state.
 * Returns { canvas, cells, width, height, tokens } where each cell is
 * { u0, v0, u1, v1, aspect } in texture space.
 */
async function build(s) {
  const all = tokenise(s.text, s.split, s.case);
  const tokens = all.slice(0, MAX_CELLS);
  const truncated = all.length - tokens.length;
  if (!tokens.length) {
    atlasCanvas.width = atlasCanvas.height = 1;
    atlasCtx.clearRect(0, 0, 1, 1);
    return { canvas: atlasCanvas, cells: [], width: 1, height: 1, tokens, truncated: 0, total: 0 };
  }
  await ensureFont(s.font, s.weight, tokens.join(""));

  const spec = fontSpec(s.font, s.weight, REF);
  const layouts = tokens.map((t) => measure(t, spec, s.tracking, s.lineGap));
  const pad = padFor(s.effect, s.effectAmt, s.stroke);

  // Aspect of each token once its padding is accounted for.
  const aspects = layouts.map((l) => {
    const inner = 1 - 2 * pad;
    return (l.width / l.height) * inner + 2 * pad;
  });
  const maxAspect = Math.max(...aspects);

  // Shelf-pack at the largest cell height that still fits the texture budget.
  let H = clamp(+s.glyphRes || 512, 64, 1024);
  let rows, atlasW, atlasH, placed;
  for (let attempt = 0; attempt < 8; attempt++) {
    const widths = aspects.map((a) => Math.max(8, Math.ceil(a * H)));
    const rowLimit = Math.max(Math.ceil(maxAspect * H), Math.min(MAX_TEX, 2048));
    placed = [];
    let x = 0, y = 0, rowMax = 0;
    rows = 1;
    for (let i = 0; i < widths.length; i++) {
      if (x + widths[i] > rowLimit && x > 0) { x = 0; y += H; rows++; }
      placed.push({ x, y, w: widths[i], h: H });
      x += widths[i];
      rowMax = Math.max(rowMax, x);
    }
    atlasW = Math.max(8, rowMax);
    atlasH = rows * H;
    if (atlasW <= MAX_TEX && atlasH <= MAX_TEX) break;
    H = Math.floor(H * 0.72);
    if (H < 48) { H = 48; break; }
  }

  atlasCanvas.width = atlasW;
  atlasCanvas.height = atlasH;
  atlasCtx.setTransform(1, 0, 0, 1, 0, 0);
  atlasCtx.clearRect(0, 0, atlasW, atlasH);

  const opts = {
    effect: s.effect, amt: s.effectAmt, strokeEm: s.stroke,
    colorA: s.fillA, colorB: s.fillB, align: s.align, tracking: s.tracking,
    font: s.font, weight: s.weight,
  };

  const cells = [];
  for (let i = 0; i < tokens.length; i++) {
    const box = placed[i];
    stamp(box.w, box.h, layouts[i], spec, opts);
    atlasCtx.drawImage(cellCanvas, box.x, box.y);
    cells.push({
      u0: box.x / atlasW,
      v0: box.y / atlasH,
      u1: (box.x + box.w) / atlasW,
      v1: (box.y + box.h) / atlasH,
      aspect: box.w / box.h,
    });
  }

  // Release the scratch surface; the atlas itself is uploaded then reused.
  cellCanvas.width = cellCanvas.height = 1;

  return { canvas: atlasCanvas, cells, width: atlasW, height: atlasH, tokens, truncated, total: all.length };
}

/* -------------------------------------------------------- pattern tiling */

/** A single repeating tile for the "pattern" background. */
async function tile(s) {
  const size = 256;
  await ensureFont(s.patFont, 400, s.patText || "✦");
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  const glyph = graphemes(String(s.patText || "✦"))[0] || "✦";
  const fs = Math.max(6, size * clamp(s.patSize, 0.05, 0.9));
  ctx.font = fontSpec(s.patFont, 400, fs);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  // One glyph per tile: the shader places, rotates and jitters each repeat, so
  // the tile itself only has to hold a centred mark.
  ctx.fillText(glyph, size / 2, size / 2);
  return c;
}

window.ISO.Atlas = { build, tile, tokenise, graphemes, fontSpec, MAX_CELLS };
})();
