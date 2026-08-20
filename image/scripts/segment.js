/* ---------------------------------------------------------------------------
   Subject segmentation.

   Everything here is classical computer vision written out by hand: there is no
   model to load and no service to call, so the subject has to be found from
   first principles. The pipeline is the one that still holds up without a
   learned prior — saliency to locate the subject, GrabCut to cut it out, a
   guided filter to make the cut follow real edges instead of the grid.

   Cost discipline, because a photograph off a phone is twelve megapixels:
     · analysis runs on a box-filtered copy no longer than MAX_WORK;
     · the graph covers only the region whose label can still change;
     · every buffer is allocated once per call and reused across iterations;
     · only the matting pass sees anything near full resolution, and that is
       capped too.

   Nothing in this file touches the DOM, the document or a canvas, so it can be
   moved into a worker unchanged. The namespace is attached at the very end.
   --------------------------------------------------------------------------- */

(() => {

/* The long edge every analysis stage runs at. Saliency, the mixtures and the
   cut all happen here; a 12 MP source and a 2 MP source cost the same. */
const MAX_WORK = 512;

/* Matting is the one stage whose cost scales with the source, so it has its own
   ceiling. Sixteen hundred is enough for hair to survive a print. */
const REFINE_MAX = 1600;

const GMM_K = 5;                  // components per mixture, as in the original paper
const DEFAULT_ITERS = 3;
const DEFAULT_GAMMA = 50;         // smoothness weight GrabCut was tuned with
const LAMBDA = 4000;              // the "infinite" terminal capacity of a pinned pixel
const COV_RIDGE = 1e-5;           // keeps a degenerate component invertible
const EPS = 1e-9;                 // a residual at or below this counts as saturated
const INF_D = 0x3fffffff;

/* Trimap states, in GrabCut's own vocabulary. */
const BGD = 0, FGD = 1, PR_BGD = 2, PR_FGD = 3;

/* Eight neighbours in a fixed order, so that the opposite of direction d is
   always (d + 4) & 7. That identity is what lets the grid graph store its arcs
   without a single sister pointer. */
const DX = [1, 1, 0, -1, -1, -1, 0, 1];
const DY = [0, 1, 1, 1, 0, -1, -1, -1];

/* ------------------------------------------------------------------ scalars */

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

function clampi(v, lo, hi) {
  v = Math.round(v);
  return v < lo ? lo : v > hi ? hi : v;
}

/** Deterministic noise. A tool that returns a different cut for the same click
    is impossible to reason about, so k-means is seeded rather than random. */
function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* -------------------------------------------------------------------- masks */

function makeMask(width, height) {
  const w = Math.max(1, width | 0), h = Math.max(1, height | 0);
  return { data: new Uint8ClampedArray(w * h), width: w, height: h };
}

function clearMask(width, height) {
  return makeMask(width, height);
}

function fullMask(width, height) {
  const m = makeMask(width, height);
  m.data.fill(255);
  return m;
}

function invertMask(mask) {
  const out = makeMask(mask.width, mask.height);
  const src = mask.data, dst = out.data;
  for (let i = 0; i < dst.length; i++) dst[i] = 255 - src[i];
  return out;
}

function validImage(image) {
  return !!image && image.data && image.width > 0 && image.height > 0 &&
    image.data.length >= image.width * image.height * 4;
}

/* --------------------------------------------------------------- resampling */

/**
 * Box-filter downscale of an RGBA image to a given long edge. Every source
 * pixel lands in exactly one destination bin, which makes this a single linear
 * pass over the source — the only pass in the whole file that touches all
 * twelve million of them.
 *
 * When the image is already small enough the same buffer is handed back rather
 * than copied. Nothing downstream writes into a source image.
 */
function downscaleRGBA(image, maxEdge) {
  const sw = image.width | 0, sh = image.height | 0;
  const longEdge = Math.max(sw, sh);
  if (longEdge <= maxEdge) return { data: image.data, width: sw, height: sh };

  const scale = maxEdge / longEdge;
  const dw = Math.max(1, Math.round(sw * scale));
  const dh = Math.max(1, Math.round(sh * scale));
  const src = image.data;
  const acc = new Uint32Array(dw * dh * 4);
  const cnt = new Uint32Array(dw * dh);

  // Bin indices are computed once per axis instead of once per pixel.
  const colBin = new Int32Array(sw);
  for (let x = 0; x < sw; x++) colBin[x] = Math.min(dw - 1, ((x * dw) / sw) | 0);
  const rowBin = new Int32Array(sh);
  for (let y = 0; y < sh; y++) rowBin[y] = Math.min(dh - 1, ((y * dh) / sh) | 0);

  for (let y = 0; y < sh; y++) {
    const base = rowBin[y] * dw;
    let s = y * sw * 4;
    for (let x = 0; x < sw; x++, s += 4) {
      const bin = base + colBin[x];
      const o = bin * 4;
      acc[o] += src[s];
      acc[o + 1] += src[s + 1];
      acc[o + 2] += src[s + 2];
      acc[o + 3] += src[s + 3];
      cnt[bin]++;
    }
  }

  const out = new Uint8ClampedArray(dw * dh * 4);
  for (let i = 0, o = 0; i < cnt.length; i++, o += 4) {
    const c = cnt[i] || 1;
    out[o] = acc[o] / c;
    out[o + 1] = acc[o + 1] / c;
    out[o + 2] = acc[o + 2] / c;
    out[o + 3] = acc[o + 3] / c;
  }
  return { data: out, width: dw, height: dh };
}

/** Bilinear resample of a single-byte mask, with the usual half-pixel centres. */
function resampleBilinear(src, sw, sh, dst, dw, dh) {
  const fx = sw / dw, fy = sh / dh;
  for (let y = 0; y < dh; y++) {
    let sy = (y + 0.5) * fy - 0.5;
    if (sy < 0) sy = 0; else if (sy > sh - 1) sy = sh - 1;
    const y0 = sy | 0;
    const y1 = y0 + 1 < sh ? y0 + 1 : y0;
    const ty = sy - y0;
    const r0 = y0 * sw, r1 = y1 * sw, o = y * dw;
    for (let x = 0; x < dw; x++) {
      let sx = (x + 0.5) * fx - 0.5;
      if (sx < 0) sx = 0; else if (sx > sw - 1) sx = sw - 1;
      const x0 = sx | 0;
      const x1 = x0 + 1 < sw ? x0 + 1 : x0;
      const tx = sx - x0;
      const a = src[r0 + x0], b = src[r0 + x1], c = src[r1 + x0], d = src[r1 + x1];
      dst[o + x] = (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * ty;
    }
  }
}

/** Box-filter downscale of a single-byte mask, matching downscaleRGBA. */
function resampleBox(src, sw, sh, dst, dw, dh) {
  const acc = new Uint32Array(dw * dh);
  const cnt = new Uint32Array(dw * dh);
  const colBin = new Int32Array(sw);
  for (let x = 0; x < sw; x++) colBin[x] = Math.min(dw - 1, ((x * dw) / sw) | 0);
  for (let y = 0; y < sh; y++) {
    const base = Math.min(dh - 1, ((y * dh) / sh) | 0) * dw;
    const r = y * sw;
    for (let x = 0; x < sw; x++) {
      const bin = base + colBin[x];
      acc[bin] += src[r + x];
      cnt[bin]++;
    }
  }
  for (let i = 0; i < dst.length; i++) dst[i] = acc[i] / (cnt[i] || 1);
}

function resampleMask(mask, dw, dh) {
  const sw = mask.width, sh = mask.height;
  const out = makeMask(dw, dh);
  if (sw === dw && sh === dh) {
    out.data.set(mask.data);
    return out;
  }
  if (dw < sw && dh < sh) resampleBox(mask.data, sw, sh, out.data, out.width, out.height);
  else resampleBilinear(mask.data, sw, sh, out.data, out.width, out.height);
  return out;
}

/* ----------------------------------------------------------------- filtering */

/**
 * Separable running-sum box blur over a float plane. Edges replicate, so the
 * blur of a constant plane is that constant everywhere — which matters because
 * the guided filter divides one blurred plane by another.
 */
function boxBlur(src, dst, w, h, r, tmp) {
  if (r < 1) { dst.set(src); return; }
  const win = 2 * r + 1;

  for (let y = 0; y < h; y++) {
    const row = y * w;
    let sum = 0;
    for (let i = -r; i <= r; i++) sum += src[row + (i < 0 ? 0 : i > w - 1 ? w - 1 : i)];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = sum / win;
      const add = x + r + 1, sub = x - r;
      sum += src[row + (add > w - 1 ? w - 1 : add)] - src[row + (sub < 0 ? 0 : sub)];
    }
  }

  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let i = -r; i <= r; i++) sum += tmp[(i < 0 ? 0 : i > h - 1 ? h - 1 : i) * w + x];
    for (let y = 0; y < h; y++) {
      dst[y * w + x] = sum / win;
      const add = y + r + 1, sub = y - r;
      sum += tmp[(add > h - 1 ? h - 1 : add) * w + x] - tmp[(sub < 0 ? 0 : sub) * w + x];
    }
  }
}

/* ---------------------------------------------------------------------- FFT

   A radix-2 Cooley-Tukey transform, iterative and in place. Only the spectral
   residual needs it and only at 64 x 64, so the twiddle factors are tabulated
   once for the whole transform rather than recomputed per stage: the table is
   sixty-four entries and removes the drift that the usual angle recurrence
   accumulates. */

function makeFFT(n) {
  const half = n >> 1;
  const cos = new Float64Array(half);
  const sin = new Float64Array(half);
  for (let i = 0; i < half; i++) {
    const a = (-2 * Math.PI * i) / n;
    cos[i] = Math.cos(a);
    sin[i] = Math.sin(a);
  }
  const rev = new Int32Array(n);
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    rev[i] = j;
  }

  /** In-place transform of one line held at re[off + k * stride]. */
  return function fft(re, im, off, stride, inverse) {
    for (let i = 1; i < n; i++) {
      const j = rev[i];
      if (i < j) {
        const a = off + i * stride, b = off + j * stride;
        let t = re[a]; re[a] = re[b]; re[b] = t;
        t = im[a]; im[a] = im[b]; im[b] = t;
      }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const halfLen = len >> 1;
      const step = n / len;
      for (let start = 0; start < n; start += len) {
        for (let k = 0; k < halfLen; k++) {
          const tw = k * step;
          const wr = cos[tw];
          const wi = inverse ? -sin[tw] : sin[tw];
          const a = off + (start + k) * stride;
          const b = a + halfLen * stride;
          const vr = re[b] * wr - im[b] * wi;
          const vi = re[b] * wi + im[b] * wr;
          re[b] = re[a] - vr; im[b] = im[a] - vi;
          re[a] += vr; im[a] += vi;
        }
      }
    }
    if (inverse) {
      for (let k = 0; k < n; k++) {
        const a = off + k * stride;
        re[a] /= n;
        im[a] /= n;
      }
    }
  };
}

/* ----------------------------------------------------------------- saliency

   Three cues, because no single one is reliable on its own.

   Spectral residual (Hou and Zhang) finds whatever the image cannot predict
   from its own average spectrum: it fires on the odd thing in the frame and
   ignores repeating texture. It is computed on a 64 x 64 square, aspect ratio
   deliberately discarded, exactly as published.

   A centre prior encodes the fact that people put the subject near the middle
   of the frame, and it suppresses the corner responses the residual leaves
   behind.

   Global colour contrast scores a pixel by how far its colour sits from every
   other colour in the picture, weighted by how common those colours are. It is
   computed over a quantised histogram in CIELAB, so the per-pixel cost is one
   table lookup rather than a colour conversion. */

function spectralResidual(grey, w, h, out) {
  const N = 64;
  const small = new Float32Array(N * N);
  const cnt = new Uint32Array(N * N);
  for (let y = 0; y < h; y++) {
    const by = Math.min(N - 1, ((y * N) / h) | 0) * N;
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const bin = by + Math.min(N - 1, ((x * N) / w) | 0);
      small[bin] += grey[row + x];
      cnt[bin]++;
    }
  }
  for (let i = 0; i < small.length; i++) small[i] /= cnt[i] || 1;

  const re = new Float64Array(N * N);
  const im = new Float64Array(N * N);
  for (let i = 0; i < re.length; i++) re[i] = small[i];

  const fft = makeFFT(N);
  for (let y = 0; y < N; y++) fft(re, im, y * N, 1, false);
  for (let x = 0; x < N; x++) fft(re, im, x, N, false);

  // Log spectrum, and the smooth version of it that the residual is measured
  // against. A 3 x 3 mean is the filter the method was published with.
  const logAmp = new Float64Array(N * N);
  for (let i = 0; i < logAmp.length; i++) {
    logAmp[i] = Math.log(Math.hypot(re[i], im[i]) + 1e-8);
  }
  const avg = new Float64Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let sum = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = Math.min(N - 1, Math.max(0, y + dy)) * N;
        for (let dx = -1; dx <= 1; dx++) {
          sum += logAmp[yy + Math.min(N - 1, Math.max(0, x + dx))];
        }
      }
      avg[y * N + x] = sum / 9;
    }
  }

  // Keep the phase, replace the amplitude with the exponentiated residual.
  for (let i = 0; i < re.length; i++) {
    const mag = Math.hypot(re[i], im[i]);
    const amp = Math.exp(logAmp[i] - avg[i]);
    if (mag > 1e-12) {
      const s = amp / mag;
      re[i] *= s;
      im[i] *= s;
    } else {
      re[i] = 0;
      im[i] = 0;
    }
  }

  for (let y = 0; y < N; y++) fft(re, im, y * N, 1, true);
  for (let x = 0; x < N; x++) fft(re, im, x, N, true);

  const sal = new Float32Array(N * N);
  for (let i = 0; i < sal.length; i++) sal[i] = re[i] * re[i] + im[i] * im[i];

  // The squared inverse transform is speckled; the method calls for a Gaussian,
  // and three box passes are indistinguishable from one at this size.
  const t1 = new Float32Array(N * N);
  const t2 = new Float32Array(N * N);
  boxBlur(sal, t1, N, N, 2, t2);
  boxBlur(t1, sal, N, N, 2, t2);
  boxBlur(sal, t1, N, N, 2, t2);

  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < t1.length; i++) {
    if (t1[i] < lo) lo = t1[i];
    if (t1[i] > hi) hi = t1[i];
  }
  const span = hi - lo > 1e-12 ? hi - lo : 1;
  for (let i = 0; i < t1.length; i++) t1[i] = (t1[i] - lo) / span;

  resampleFloat(t1, N, N, out, w, h);
}

/** Bilinear resample of a float plane, used to lift the 64 x 64 residual. */
function resampleFloat(src, sw, sh, dst, dw, dh) {
  const fx = sw / dw, fy = sh / dh;
  for (let y = 0; y < dh; y++) {
    let sy = (y + 0.5) * fy - 0.5;
    if (sy < 0) sy = 0; else if (sy > sh - 1) sy = sh - 1;
    const y0 = sy | 0;
    const y1 = y0 + 1 < sh ? y0 + 1 : y0;
    const ty = sy - y0;
    const r0 = y0 * sw, r1 = y1 * sw, o = y * dw;
    for (let x = 0; x < dw; x++) {
      let sx = (x + 0.5) * fx - 0.5;
      if (sx < 0) sx = 0; else if (sx > sw - 1) sx = sw - 1;
      const x0 = sx | 0;
      const x1 = x0 + 1 < sw ? x0 + 1 : x0;
      const tx = sx - x0;
      const top = src[r0 + x0] + (src[r0 + x1] - src[r0 + x0]) * tx;
      const bot = src[r1 + x0] + (src[r1 + x1] - src[r1 + x0]) * tx;
      dst[o + x] = top + (bot - top) * ty;
    }
  }
}

/* sRGB byte to linear light, tabulated because the input is a byte. */
const LINEAR = new Float64Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  LINEAR[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function labOf(r, g, b, out) {
  const rl = LINEAR[r], gl = LINEAR[g], bl = LINEAR[b];
  const x = (0.4124564 * rl + 0.3575761 * gl + 0.1804375 * bl) / 0.95047;
  const y = 0.2126729 * rl + 0.7151522 * gl + 0.072175 * bl;
  const z = (0.0193339 * rl + 0.119192 * gl + 0.9503041 * bl) / 1.08883;
  const fx = x > 0.008856 ? Math.cbrt(x) : 7.787 * x + 16 / 116;
  const fy = y > 0.008856 ? Math.cbrt(y) : 7.787 * y + 16 / 116;
  const fz = z > 0.008856 ? Math.cbrt(z) : 7.787 * z + 16 / 116;
  out[0] = 116 * fy - 16;
  out[1] = 500 * (fx - fy);
  out[2] = 200 * (fy - fz);
}

function colourContrast(rgba, w, h, out) {
  const Q = 12;                       // twelve levels an axis, 1728 possible colours
  const n = w * h;
  const bins = Q * Q * Q;
  const count = new Uint32Array(bins);
  const sumR = new Uint32Array(bins);
  const sumG = new Uint32Array(bins);
  const sumB = new Uint32Array(bins);
  const binOf = new Int32Array(n);

  for (let i = 0, o = 0; i < n; i++, o += 4) {
    const r = rgba[o], g = rgba[o + 1], b = rgba[o + 2];
    const bin = (((r * Q) >> 8) * Q + ((g * Q) >> 8)) * Q + ((b * Q) >> 8);
    binOf[i] = bin;
    count[bin]++;
    sumR[bin] += r;
    sumG[bin] += g;
    sumB[bin] += b;
  }

  // Only the occupied bins matter, and there are rarely more than a few hundred
  // of them, so the pairwise distance loop is cheap.
  const live = [];
  for (let i = 0; i < bins; i++) if (count[i]) live.push(i);
  const m = live.length;
  const lab = new Float64Array(m * 3);
  const freq = new Float64Array(m);
  const tmp = new Float64Array(3);
  for (let k = 0; k < m; k++) {
    const bin = live[k];
    const c = count[bin];
    labOf(Math.round(sumR[bin] / c), Math.round(sumG[bin] / c), Math.round(sumB[bin] / c), tmp);
    lab[k * 3] = tmp[0];
    lab[k * 3 + 1] = tmp[1];
    lab[k * 3 + 2] = tmp[2];
    freq[k] = c / n;
  }

  const score = new Float64Array(m);
  for (let a = 0; a < m; a++) {
    let acc = 0;
    const la = lab[a * 3], aa = lab[a * 3 + 1], ba = lab[a * 3 + 2];
    for (let b = 0; b < m; b++) {
      const dl = la - lab[b * 3], da = aa - lab[b * 3 + 1], db = ba - lab[b * 3 + 2];
      acc += freq[b] * Math.sqrt(dl * dl + da * da + db * db);
    }
    score[a] = acc;
  }

  let hi = 0;
  for (let a = 0; a < m; a++) if (score[a] > hi) hi = score[a];
  const inv = hi > 1e-9 ? 1 / hi : 0;

  const byBin = new Float32Array(bins);
  for (let k = 0; k < m; k++) byBin[live[k]] = score[k] * inv;
  for (let i = 0; i < n; i++) out[i] = byBin[binOf[i]];
}

/**
 * The combined map, returned as bytes so that Otsu can work off a histogram.
 * The residual and the colour term are averaged rather than multiplied, so one
 * of them failing quietly does not zero the other; the centre prior multiplies,
 * because a thing at the very edge of the frame is not the subject whatever
 * else it scores.
 */
function saliency(work, grey) {
  const w = work.width, h = work.height, n = w * h;
  const sr = new Float32Array(n);
  const cc = new Float32Array(n);
  spectralResidual(grey, w, h, sr);
  colourContrast(work.data, w, h, cc);

  const out = new Uint8ClampedArray(n);
  const raw = new Float32Array(n);
  const cx = (w - 1) / 2, cy = (h - 1) / 2;
  const rx = Math.max(1, cx), ry = Math.max(1, cy);
  const sigma = 0.65;
  const k = -1 / (2 * sigma * sigma);
  let lo = Infinity, hi = -Infinity;
  for (let y = 0; y < h; y++) {
    const dy = (y - cy) / ry;
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const dx = (x - cx) / rx;
      const prior = Math.exp((dx * dx + dy * dy) * k);
      const v = (0.6 * sr[row + x] + 0.4 * cc[row + x]) * prior;
      raw[row + x] = v;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  const span = hi - lo > 1e-9 ? hi - lo : 1;
  for (let i = 0; i < n; i++) out[i] = ((raw[i] - lo) / span) * 255;
  return out;
}

/** Otsu's threshold over a 256-bin histogram: the split that maximises the
    between-class variance, which needs no parameter from the caller. */
function otsu(map) {
  const hist = new Uint32Array(256);
  for (let i = 0; i < map.length; i++) hist[map[i]]++;
  const total = map.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 128, bestVar = -1;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > bestVar) { bestVar = between; best = t; }
  }
  return best;
}

/**
 * The bounding box of the largest eight-connected run of above-threshold
 * pixels. Taking only the largest is what stops a bright reflection in a corner
 * from dragging the box out to cover the whole frame.
 */
function largestBlobBox(map, w, h, threshold) {
  const n = w * h;
  const seen = new Uint8Array(n);
  const stack = new Int32Array(n);
  let bestArea = 0;
  let box = null;

  for (let start = 0; start < n; start++) {
    if (seen[start] || map[start] < threshold) continue;
    let sp = 0;
    stack[sp++] = start;
    seen[start] = 1;
    let area = 0, x0 = w, y0 = h, x1 = -1, y1 = -1;
    while (sp > 0) {
      const p = stack[--sp];
      const py = (p / w) | 0;
      const px = p - py * w;
      area++;
      if (px < x0) x0 = px;
      if (px > x1) x1 = px;
      if (py < y0) y0 = py;
      if (py > y1) y1 = py;
      for (let d = 0; d < 8; d++) {
        const qx = px + DX[d], qy = py + DY[d];
        if (qx < 0 || qy < 0 || qx >= w || qy >= h) continue;
        const q = qy * w + qx;
        if (seen[q] || map[q] < threshold) continue;
        seen[q] = 1;
        stack[sp++] = q;
      }
    }
    if (area > bestArea) { bestArea = area; box = [x0, y0, x1, y1]; }
  }
  return box ? { box, area: bestArea } : null;
}

/* ------------------------------------------------------- Gaussian mixtures */

function makeGMM(k) {
  return {
    k,
    mean: new Float64Array(k * 3),
    icov: new Float64Array(k * 9),
    norm: new Float64Array(k),      // weight / sqrt(det), zero for a dead component
    logNorm: new Float64Array(k),   // the same thing in logs, for the assignment pass
    cnt: new Float64Array(k),
    sum: new Float64Array(k * 3),
    prod: new Float64Array(k * 9),
  };
}

function gmmReset(m) {
  m.cnt.fill(0);
  m.sum.fill(0);
  m.prod.fill(0);
}

function gmmAdd(m, comp, r, g, b) {
  m.cnt[comp]++;
  const s = comp * 3;
  m.sum[s] += r; m.sum[s + 1] += g; m.sum[s + 2] += b;
  const p = comp * 9;
  m.prod[p] += r * r; m.prod[p + 1] += r * g; m.prod[p + 2] += r * b;
  m.prod[p + 3] += g * r; m.prod[p + 4] += g * g; m.prod[p + 5] += g * b;
  m.prod[p + 6] += b * r; m.prod[p + 7] += b * g; m.prod[p + 8] += b * b;
}

/**
 * Turn the accumulators into usable Gaussians. The shared (2 pi) ^ -3/2 factor
 * is dropped: it is identical in both mixtures, so it cancels in the difference
 * of the two data terms and never reaches the graph.
 */
function gmmLearn(m) {
  let total = 0;
  for (let k = 0; k < m.k; k++) total += m.cnt[k];
  if (total <= 0) { m.norm.fill(0); m.logNorm.fill(-Infinity); return false; }

  const cov = new Float64Array(9);
  for (let k = 0; k < m.k; k++) {
    const c = m.cnt[k];
    if (c < 1) { m.norm[k] = 0; m.logNorm[k] = -Infinity; continue; }
    const s = k * 3;
    const mr = m.sum[s] / c, mg = m.sum[s + 1] / c, mb = m.sum[s + 2] / c;
    m.mean[s] = mr; m.mean[s + 1] = mg; m.mean[s + 2] = mb;
    const p = k * 9;
    const mu = [mr, mg, mb];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) cov[i * 3 + j] = m.prod[p + i * 3 + j] / c - mu[i] * mu[j];
    }

    // A component sitting on a flat patch has a singular covariance; a ridge on
    // the diagonal keeps it invertible, escalating if that was not enough.
    let ridge = COV_RIDGE;
    let det = 0;
    let ok = false;
    for (let attempt = 0; attempt < 4; attempt++) {
      const a = cov[0] + ridge, e = cov[4] + ridge, i9 = cov[8] + ridge;
      const b = cov[1], cc = cov[2], d = cov[3], f = cov[5], g = cov[6], hh = cov[7];
      det = a * (e * i9 - f * hh) - b * (d * i9 - f * g) + cc * (d * hh - e * g);
      if (det > 1e-18 && Number.isFinite(det)) {
        const inv = 1 / det;
        m.icov[p] = (e * i9 - f * hh) * inv;
        m.icov[p + 1] = (cc * hh - b * i9) * inv;
        m.icov[p + 2] = (b * f - cc * e) * inv;
        m.icov[p + 3] = (f * g - d * i9) * inv;
        m.icov[p + 4] = (a * i9 - cc * g) * inv;
        m.icov[p + 5] = (cc * d - a * f) * inv;
        m.icov[p + 6] = (d * hh - e * g) * inv;
        m.icov[p + 7] = (b * g - a * hh) * inv;
        m.icov[p + 8] = (a * e - b * d) * inv;
        ok = true;
        break;
      }
      ridge *= 100;
    }
    m.norm[k] = ok ? (c / total) / Math.sqrt(det) : 0;
    m.logNorm[k] = ok ? Math.log(m.norm[k]) : -Infinity;
  }

  for (let k = 0; k < m.k; k++) if (m.norm[k] > 0) return true;
  return false;
}

/* Both evaluators pull the arrays into locals before the loop: they run tens of
   millions of times per cut and the property loads are not free. */

function gmmProb(m, r, g, b) {
  const norm = m.norm, mean = m.mean, icov = m.icov, k = m.k;
  let p = 0;
  for (let c = 0, s = 0, i = 0; c < k; c++, s += 3, i += 9) {
    const nk = norm[c];
    if (nk === 0) continue;
    const d0 = r - mean[s], d1 = g - mean[s + 1], d2 = b - mean[s + 2];
    let q = d0 * (icov[i] * d0 + icov[i + 1] * d1 + icov[i + 2] * d2) +
            d1 * (icov[i + 3] * d0 + icov[i + 4] * d1 + icov[i + 5] * d2) +
            d2 * (icov[i + 6] * d0 + icov[i + 7] * d1 + icov[i + 8] * d2);
    if (q > 1400) continue;                 // the exponential has underflowed
    if (q < 0) q = 0;                       // rounding, on a near-singular component
    p += nk * Math.exp(-0.5 * q);
  }
  return p;
}

/** The most likely component, compared in logs so the assignment pass needs no
    exponentials at all — only their ordering matters here. */
function gmmBest(m, r, g, b) {
  const logNorm = m.logNorm, mean = m.mean, icov = m.icov, k = m.k;
  let best = 0, bestScore = -Infinity;
  for (let c = 0, s = 0, i = 0; c < k; c++, s += 3, i += 9) {
    const ln = logNorm[c];
    if (ln === -Infinity) continue;
    const d0 = r - mean[s], d1 = g - mean[s + 1], d2 = b - mean[s + 2];
    const q = d0 * (icov[i] * d0 + icov[i + 1] * d1 + icov[i + 2] * d2) +
              d1 * (icov[i + 3] * d0 + icov[i + 4] * d1 + icov[i + 5] * d2) +
              d2 * (icov[i + 6] * d0 + icov[i + 7] * d1 + icov[i + 8] * d2);
    const score = ln - 0.5 * q;
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return best;
}

/**
 * k-means in RGB, seeded k-means++ so the five components start apart from one
 * another. Only a subsample takes part in finding the centres — the full set is
 * assigned afterwards, which is what the mixture is actually fitted from.
 */
function kmeansAssign(col, idx, count, k, comp, seed) {
  const stride = Math.max(1, Math.ceil(count / 12000));
  const sampleCount = Math.ceil(count / stride);
  const centres = new Float64Array(k * 3);
  const rand = mulberry32(seed);
  const dist = new Float64Array(sampleCount);

  // The subsample is gathered once into a flat array: the inner loops below run
  // over it many times and an extra indirection per read is measurable.
  const pts = new Float32Array(sampleCount * 3);
  for (let s = 0; s < sampleCount; s++) {
    const p = idx[s * stride] * 3;
    pts[s * 3] = col[p];
    pts[s * 3 + 1] = col[p + 1];
    pts[s * 3 + 2] = col[p + 2];
  }

  const first = Math.min(sampleCount - 1, (rand() * sampleCount) | 0);
  centres[0] = pts[first * 3];
  centres[1] = pts[first * 3 + 1];
  centres[2] = pts[first * 3 + 2];

  for (let c = 1; c < k; c++) {
    let total = 0;
    for (let s = 0; s < sampleCount; s++) {
      const p = s * 3;
      let best = Infinity;
      for (let j = 0; j < c; j++) {
        const dr = pts[p] - centres[j * 3];
        const dg = pts[p + 1] - centres[j * 3 + 1];
        const db = pts[p + 2] - centres[j * 3 + 2];
        const d = dr * dr + dg * dg + db * db;
        if (d < best) best = d;
      }
      dist[s] = best;
      total += best;
    }
    let pick = 0;
    if (total > 1e-12) {
      let target = rand() * total;
      for (let s = 0; s < sampleCount; s++) {
        target -= dist[s];
        if (target <= 0) { pick = s; break; }
        pick = s;
      }
    } else {
      pick = Math.min(sampleCount - 1, (rand() * sampleCount) | 0);
    }
    const q = pick * 3;
    centres[c * 3] = pts[q]; centres[c * 3 + 1] = pts[q + 1]; centres[c * 3 + 2] = pts[q + 2];
  }

  const sums = new Float64Array(k * 3);
  const counts = new Float64Array(k);
  for (let iter = 0; iter < 10; iter++) {
    sums.fill(0);
    counts.fill(0);
    let moved = 0;
    for (let s = 0; s < sampleCount; s++) {
      const p = s * 3;
      let best = 0, bestD = Infinity;
      for (let j = 0; j < k; j++) {
        const dr = pts[p] - centres[j * 3];
        const dg = pts[p + 1] - centres[j * 3 + 1];
        const db = pts[p + 2] - centres[j * 3 + 2];
        const d = dr * dr + dg * dg + db * db;
        if (d < bestD) { bestD = d; best = j; }
      }
      sums[best * 3] += pts[p];
      sums[best * 3 + 1] += pts[p + 1];
      sums[best * 3 + 2] += pts[p + 2];
      counts[best]++;
      moved += bestD;
    }
    for (let j = 0; j < k; j++) {
      if (counts[j] < 1) continue;                 // an empty centre simply stays put
      centres[j * 3] = sums[j * 3] / counts[j];
      centres[j * 3 + 1] = sums[j * 3 + 1] / counts[j];
      centres[j * 3 + 2] = sums[j * 3 + 2] / counts[j];
    }
    if (moved < 1e-9) break;
  }

  for (let s = 0; s < count; s++) {
    const p = idx[s] * 3;
    let best = 0, bestD = Infinity;
    for (let j = 0; j < k; j++) {
      const dr = col[p] - centres[j * 3];
      const dg = col[p + 1] - centres[j * 3 + 1];
      const db = col[p + 2] - centres[j * 3 + 2];
      const d = dr * dr + dg * dg + db * db;
      if (d < bestD) { bestD = d; best = j; }
    }
    comp[idx[s]] = best;
  }
}

/* ------------------------------------------------------ maximum flow (BK)

   Boykov and Kolmogorov's augmenting-path solver, kept close to the reference
   implementation because this is the one part of the file where a plausible
   approximation would produce a plausible but wrong mask.

   The grid lets the arc storage collapse: node i owns arcs i * 8 + d, and the
   sister of that arc is always arcTo[a] * 8 + ((d + 4) & 7). Terminal links are
   one signed number per node — positive is residual from the source, negative
   is residual to the sink — because whichever of the two capacities is smaller
   can be pushed through immediately and forgotten.

   Residuals are double precision and a residual at or below EPS counts as
   saturated. Exact zero tests are what the reference uses, and they are correct
   in exact arithmetic; the tolerance is there so that rounding cannot leave a
   sliver of capacity behind and send the search round again for no gain. */

const FREE = 0, SOURCE = 1, SINK = 2;
const P_NONE = -1, P_TERM = -2, P_ORPH = -3;

function createFlow(n) {
  const arcTo = new Int32Array(n * 8).fill(-1);
  const rcap = new Float64Array(n * 8);
  const trCap = new Float64Array(n);
  const parent = new Int32Array(n);
  const tree = new Uint8Array(n);
  const ts = new Int32Array(n);
  const dist = new Int32Array(n);
  const qNext = new Int32Array(n);
  const inQ = new Uint8Array(n);
  const orphCap = n + 2;
  const orph = new Int32Array(orphCap);

  let qHead = -1, qTail = -1;
  let orphHead = 0, orphTail = 0, orphCount = 0;
  let time = 0;

  function setActive(i) {
    if (inQ[i]) return;
    inQ[i] = 1;
    qNext[i] = -1;
    if (qTail < 0) qHead = i; else qNext[qTail] = i;
    qTail = i;
  }

  function nextActive() {
    while (qHead >= 0) {
      const i = qHead;
      qHead = qNext[i];
      if (qHead < 0) qTail = -1;
      qNext[i] = -1;
      inQ[i] = 0;
      if (parent[i] !== P_NONE) return i;
    }
    return -1;
  }

  function orphFront(i) {
    if (orphCount >= orphCap - 1) return;
    orphHead = orphHead === 0 ? orphCap - 1 : orphHead - 1;
    orph[orphHead] = i;
    orphCount++;
  }

  function orphBack(i) {
    if (orphCount >= orphCap - 1) return;
    orph[orphTail] = i;
    orphTail = orphTail + 1 === orphCap ? 0 : orphTail + 1;
    orphCount++;
  }

  function orphPop() {
    if (orphCount === 0) return -1;
    const i = orph[orphHead];
    orphHead = orphHead + 1 === orphCap ? 0 : orphHead + 1;
    orphCount--;
    return i;
  }

  const sister = (a) => arcTo[a] * 8 + (((a & 7) + 4) & 7);

  function augment(midArc) {
    // The bottleneck of the whole path: the middle arc, then up the source tree
    // to its root, then down the sink tree to its root.
    let bottleneck = rcap[midArc];
    let i = midArc >> 3;
    for (;;) {
      const a = parent[i];
      if (a === P_TERM) break;
      const rev = sister(a);
      if (rcap[rev] < bottleneck) bottleneck = rcap[rev];
      i = arcTo[a];
    }
    if (trCap[i] < bottleneck) bottleneck = trCap[i];
    let j = arcTo[midArc];
    for (;;) {
      const a = parent[j];
      if (a === P_TERM) break;
      if (rcap[a] < bottleneck) bottleneck = rcap[a];
      j = arcTo[a];
    }
    if (-trCap[j] < bottleneck) bottleneck = -trCap[j];
    if (!(bottleneck > EPS)) {
      // The tree invariants say this cannot happen. If rounding ever produced
      // it anyway, close the arc so the next growth cannot find the same path
      // again and spin.
      rcap[midArc] = 0;
      return 0;
    }

    rcap[sister(midArc)] += bottleneck;
    rcap[midArc] -= bottleneck;

    // Anything left saturated behind us loses its parent and becomes an orphan.
    i = midArc >> 3;
    for (;;) {
      const a = parent[i];
      if (a === P_TERM) break;
      const rev = sister(a);
      rcap[a] += bottleneck;
      rcap[rev] -= bottleneck;
      if (rcap[rev] <= EPS) { parent[i] = P_ORPH; orphFront(i); }
      i = arcTo[a];
    }
    trCap[i] -= bottleneck;
    if (trCap[i] <= EPS) { parent[i] = P_ORPH; orphFront(i); }

    j = arcTo[midArc];
    for (;;) {
      const a = parent[j];
      if (a === P_TERM) break;
      const rev = sister(a);
      rcap[rev] += bottleneck;
      rcap[a] -= bottleneck;
      if (rcap[a] <= EPS) { parent[j] = P_ORPH; orphFront(j); }
      j = arcTo[a];
    }
    trCap[j] += bottleneck;
    if (trCap[j] >= -EPS) { parent[j] = P_ORPH; orphFront(j); }

    return bottleneck;
  }

  /**
   * Re-home an orphan on the shortest surviving branch of its own tree, or free
   * it and orphan everything that hung off it. The timestamp and distance marks
   * are the reason this stays near linear: a branch already validated this pass
   * is not walked twice.
   */
  function processOrphan(i, isSink) {
    const own = isSink ? SINK : SOURCE;
    let bestArc = -1, dMin = INF_D;

    for (let d = 0; d < 8; d++) {
      const a0 = i * 8 + d;
      const j = arcTo[a0];
      if (j < 0 || tree[j] !== own) continue;
      const pj = parent[j];
      if (pj === P_NONE) continue;
      const feed = isSink ? rcap[a0] : rcap[j * 8 + ((d + 4) & 7)];
      if (feed <= EPS) continue;

      let dd = 0, k = j, steps = 0;
      for (;;) {
        if (ts[k] === time) { dd += dist[k]; break; }
        const a = parent[k];
        dd++;
        if (a === P_TERM) { ts[k] = time; dist[k] = 1; break; }
        if (a === P_ORPH || a === P_NONE) { dd = INF_D; break; }
        k = arcTo[a];
        if (++steps > n) { dd = INF_D; break; }   // a malformed chain cannot loop forever
      }
      if (dd >= INF_D) continue;
      if (dd < dMin) { dMin = dd; bestArc = a0; }
      for (let m = j; ts[m] !== time; m = arcTo[parent[m]]) {
        ts[m] = time;
        dist[m] = dd--;
      }
    }

    if (bestArc >= 0) {
      parent[i] = bestArc;
      ts[i] = time;
      dist[i] = dMin + 1;
      return;
    }

    parent[i] = P_NONE;
    tree[i] = FREE;
    ts[i] = 0;
    for (let d = 0; d < 8; d++) {
      const a0 = i * 8 + d;
      const j = arcTo[a0];
      if (j < 0 || tree[j] !== own) continue;
      const pj = parent[j];
      if (pj === P_NONE) continue;
      const feed = isSink ? rcap[a0] : rcap[j * 8 + ((d + 4) & 7)];
      if (feed > EPS) setActive(j);
      if (pj !== P_TERM && pj !== P_ORPH && arcTo[pj] === i) {
        parent[j] = P_ORPH;
        orphBack(j);
      }
    }
  }

  function solve() {
    parent.fill(P_NONE);
    tree.fill(FREE);
    ts.fill(0);
    dist.fill(0);
    inQ.fill(0);
    qHead = qTail = -1;
    orphHead = orphTail = orphCount = 0;
    time = 0;

    for (let i = 0; i < n; i++) {
      const t = trCap[i];
      if (t > EPS) { tree[i] = SOURCE; parent[i] = P_TERM; dist[i] = 1; setActive(i); }
      else if (t < -EPS) { tree[i] = SINK; parent[i] = P_TERM; dist[i] = 1; setActive(i); }
    }

    let current = -1;
    let guard = 0;
    const guardMax = 64 * n + 1000000;

    for (;;) {
      if (++guard > guardMax) break;         // a stall must end the solve, not the tab

      let i = current;
      if (i >= 0) {
        inQ[i] = 0;
        if (parent[i] === P_NONE) i = -1;
      }
      if (i < 0) {
        i = nextActive();
        if (i < 0) break;
      }

      const own = tree[i];
      const base = i * 8;
      let midArc = -1;
      for (let d = 0; d < 8; d++) {
        const a = base + d;
        const j = arcTo[a];
        if (j < 0) continue;
        const rev = j * 8 + ((d + 4) & 7);
        const cap = own === SOURCE ? rcap[a] : rcap[rev];
        if (cap <= EPS) continue;
        const other = tree[j];
        if (other === FREE) {
          tree[j] = own;
          parent[j] = rev;
          ts[j] = ts[i];
          dist[j] = dist[i] + 1;
          setActive(j);
        } else if (other !== own) {
          midArc = own === SOURCE ? a : rev;     // always oriented source side to sink side
          break;
        } else if (ts[j] <= ts[i] && dist[j] > dist[i]) {
          parent[j] = rev;
          ts[j] = ts[i];
          dist[j] = dist[i] + 1;
        }
      }

      time++;
      if (midArc >= 0) {
        inQ[i] = 1;                            // i stays active across the augmentation
        current = i;
        augment(midArc);
        let o;
        while ((o = orphPop()) >= 0) processOrphan(o, tree[o] === SINK);
      } else {
        current = -1;
      }
    }
  }

  return { arcTo, rcap, trCap, tree, solve };
}

/* -------------------------------------------------------------- GrabCut */

/**
 * Contrast-sensitive smoothness. Beta is the reciprocal of twice the mean
 * squared neighbour difference, so the exponential is scaled by how noisy this
 * particular photograph is rather than by a constant someone picked.
 */
function computeBeta(col, w, h) {
  let total = 0, count = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 3;
      for (let d = 0; d < 4; d++) {
        const qx = x + DX[d], qy = y + DY[d];
        if (qx < 0 || qy < 0 || qx >= w || qy >= h) continue;
        const q = (qy * w + qx) * 3;
        const dr = col[p] - col[q], dg = col[p + 1] - col[q + 1], db = col[p + 2] - col[q + 2];
        total += dr * dr + dg * dg + db * db;
        count++;
      }
    }
  }
  if (count === 0 || total <= 1e-12) return 0;   // a flat image gets uniform smoothness
  return 1 / (2 * (total / count));
}

/**
 * The cut itself, at working resolution. The trimap is GrabCut's: everything
 * outside the rectangle is definitely background and never changes, everything
 * inside starts as probable foreground.
 *
 * The graph is built over the rectangle plus a one-pixel frame rather than the
 * whole image. Pixels outside are pinned to the sink, so no edge between two of
 * them can ever be cut, and leaving them out gives an identical minimum cut for
 * a fraction of the nodes.
 */
function grabCut(work, box, opts) {
  const w = work.width, h = work.height, n = w * h;
  const iters = clampi(opts.iters > 0 ? opts.iters : DEFAULT_ITERS, 1, 8);
  const gamma = opts.gamma > 0 ? opts.gamma : DEFAULT_GAMMA;
  const mask = makeMask(w, h);

  let bx0 = clampi(box.x * w, 0, w - 1);
  let by0 = clampi(box.y * h, 0, h - 1);
  let bx1 = clampi((box.x + box.w) * w, bx0 + 1, w);
  let by1 = clampi((box.y + box.h) * h, by0 + 1, h);
  const inside = (bx1 - bx0) * (by1 - by0);
  if (inside < 16 || inside >= n) {
    // Nothing to solve: either the rectangle is a speck or it leaves no
    // background to model. Hand back the rectangle rather than a wrong cut.
    for (let y = by0; y < by1; y++) mask.data.fill(255, y * w + bx0, y * w + bx1);
    return mask;
  }

  const src = work.data;
  const col = new Float32Array(n * 3);
  for (let i = 0, o = 0, c = 0; i < n; i++, o += 4, c += 3) {
    col[c] = src[o] / 255;
    col[c + 1] = src[o + 1] / 255;
    col[c + 2] = src[o + 2] / 255;
  }

  const tri = new Uint8Array(n);
  tri.fill(BGD);
  for (let y = by0; y < by1; y++) tri.fill(PR_FGD, y * w + bx0, y * w + bx1);

  const beta = computeBeta(col, w, h);

  // Region of interest: the rectangle plus the pinned frame around it.
  const rx0 = Math.max(0, bx0 - 1), ry0 = Math.max(0, by0 - 1);
  const rx1 = Math.min(w, bx1 + 1), ry1 = Math.min(h, by1 + 1);
  const rw = rx1 - rx0, rh = ry1 - ry0, rn = rw * rh;

  const flow = createFlow(rn);
  const { arcTo, rcap, trCap } = flow;
  const ew = new Float32Array(rn * 4);
  const DIAG = 1 / Math.SQRT2;

  for (let y = 0; y < rh; y++) {
    for (let x = 0; x < rw; x++) {
      const p = y * rw + x;
      const ip = (y + ry0) * w + (x + rx0);
      const pc = ip * 3;
      for (let d = 0; d < 4; d++) {
        const qx = x + DX[d], qy = y + DY[d];
        if (qx < 0 || qy < 0 || qx >= rw || qy >= rh) continue;
        const q = qy * rw + qx;
        const qc = ((qy + ry0) * w + (qx + rx0)) * 3;
        const dr = col[pc] - col[qc], dg = col[pc + 1] - col[qc + 1], db = col[pc + 2] - col[qc + 2];
        const dsq = dr * dr + dg * dg + db * db;
        const weight = gamma * (d === 1 || d === 3 ? DIAG : 1) * Math.exp(-beta * dsq);
        ew[p * 4 + d] = weight;
        arcTo[p * 8 + d] = q;
        arcTo[q * 8 + d + 4] = p;
      }
    }
  }

  const fgGMM = makeGMM(GMM_K);
  const bgGMM = makeGMM(GMM_K);
  const comp = new Uint8Array(n);

  // Index lists for the two sides, gathered once; membership only changes for
  // pixels inside the rectangle, so the lists are rebuilt each iteration.
  const fgIdx = new Int32Array(n);
  const bgIdx = new Int32Array(n);
  let fgCount = 0, bgCount = 0;
  for (let i = 0; i < n; i++) {
    if (tri[i] === FGD || tri[i] === PR_FGD) fgIdx[fgCount++] = i;
    else bgIdx[bgCount++] = i;
  }
  if (fgCount < GMM_K || bgCount < GMM_K) {
    for (let y = by0; y < by1; y++) mask.data.fill(255, y * w + bx0, y * w + bx1);
    return mask;
  }

  kmeansAssign(col, fgIdx, fgCount, GMM_K, comp, 0x9e3779b9);
  kmeansAssign(col, bgIdx, bgCount, GMM_K, comp, 0x85ebca6b);

  for (let it = 0; it < iters; it++) {
    // Fit both mixtures to the current labelling.
    gmmReset(fgGMM);
    gmmReset(bgGMM);
    for (let s = 0; s < fgCount; s++) {
      const i = fgIdx[s], c = i * 3;
      gmmAdd(fgGMM, comp[i], col[c], col[c + 1], col[c + 2]);
    }
    for (let s = 0; s < bgCount; s++) {
      const i = bgIdx[s], c = i * 3;
      gmmAdd(bgGMM, comp[i], col[c], col[c + 1], col[c + 2]);
    }
    const fgOk = gmmLearn(fgGMM);
    const bgOk = gmmLearn(bgGMM);
    if (!fgOk || !bgOk) break;                 // no usable model, keep the last labelling

    // Terminal capacities. The signed form is log p(fg) - log p(bg): the shared
    // offset between the two negative log-likelihoods cancels here, which is
    // both cheaper and better conditioned than carrying it into the graph.
    for (let y = 0; y < rh; y++) {
      for (let x = 0; x < rw; x++) {
        const p = y * rw + x;
        const ip = (y + ry0) * w + (x + rx0);
        const t = tri[ip];
        if (t === BGD) { trCap[p] = -LAMBDA; continue; }
        if (t === FGD) { trCap[p] = LAMBDA; continue; }
        const c = ip * 3;
        const r = col[c], g = col[c + 1], b = col[c + 2];
        let pf = gmmProb(fgGMM, r, g, b);
        let pb = gmmProb(bgGMM, r, g, b);
        if (!(pf > 1e-30)) pf = 1e-30; else if (pf > 1e30) pf = 1e30;
        if (!(pb > 1e-30)) pb = 1e-30; else if (pb > 1e30) pb = 1e30;
        trCap[p] = Math.log(pf) - Math.log(pb);
      }
    }

    // Arc residuals start each solve from the stored weights.
    for (let p = 0; p < rn; p++) {
      for (let d = 0; d < 4; d++) {
        const q = arcTo[p * 8 + d];
        if (q < 0) continue;
        const weight = ew[p * 4 + d];
        rcap[p * 8 + d] = weight;
        rcap[q * 8 + d + 4] = weight;
      }
    }

    flow.solve();

    for (let y = 0; y < rh; y++) {
      for (let x = 0; x < rw; x++) {
        const ip = (y + ry0) * w + (x + rx0);
        const t = tri[ip];
        if (t === BGD || t === FGD) continue;
        tri[ip] = flow.tree[y * rw + x] === SOURCE ? PR_FGD : PR_BGD;
      }
    }

    // Rebuild the sample lists and re-assign components for the next round.
    fgCount = 0;
    bgCount = 0;
    for (let i = 0; i < n; i++) {
      if (tri[i] === FGD || tri[i] === PR_FGD) fgIdx[fgCount++] = i;
      else bgIdx[bgCount++] = i;
    }
    if (fgCount < GMM_K || bgCount < GMM_K) break;
    if (it + 1 < iters) {
      for (let s = 0; s < fgCount; s++) {
        const i = fgIdx[s], c = i * 3;
        comp[i] = gmmBest(fgGMM, col[c], col[c + 1], col[c + 2]);
      }
      for (let s = 0; s < bgCount; s++) {
        const i = bgIdx[s], c = i * 3;
        comp[i] = gmmBest(bgGMM, col[c], col[c + 1], col[c + 2]);
      }
    }
  }

  const out = mask.data;
  for (let i = 0; i < n; i++) out[i] = tri[i] === FGD || tri[i] === PR_FGD ? 255 : 0;
  return mask;
}

/* -------------------------------------------------------- guided filter

   He, Sun and Tang's guided filter, with the grey image as guide and the mask
   as input. Inside a window the output is a linear function of the guide, so
   the mask inherits the guide's edges: this is the stage that turns a blocky
   graph cut into an alpha that follows hair, fur and motion blur. */

function guidedFilter(guide, input, w, h, radius, eps, out) {
  const n = w * h;
  const mI = new Float32Array(n);
  const mP = new Float32Array(n);
  const mII = new Float32Array(n);
  const mIP = new Float32Array(n);
  const stage = new Float32Array(n);
  const tmp = new Float32Array(n);

  boxBlur(guide, mI, w, h, radius, tmp);
  boxBlur(input, mP, w, h, radius, tmp);
  for (let i = 0; i < n; i++) stage[i] = guide[i] * guide[i];
  boxBlur(stage, mII, w, h, radius, tmp);
  for (let i = 0; i < n; i++) stage[i] = guide[i] * input[i];
  boxBlur(stage, mIP, w, h, radius, tmp);

  // a lands in mIP and b in mII; both source planes are finished with by then.
  for (let i = 0; i < n; i++) {
    const varI = mII[i] - mI[i] * mI[i];
    const covIp = mIP[i] - mI[i] * mP[i];
    const a = covIp / (varI + eps);
    mIP[i] = a;
    mII[i] = mP[i] - a * mI[i];
  }
  boxBlur(mIP, mP, w, h, radius, tmp);
  boxBlur(mII, mI, w, h, radius, tmp);

  for (let i = 0; i < n; i++) {
    const v = mP[i] * guide[i] + mI[i];
    out[i] = v < 0 ? 0 : v > 1 ? 1 : v;
  }
}

function refineMask(image, mask, opts) {
  const w = image.width, h = image.height, n = w * h;
  const src = mask.width === w && mask.height === h ? mask : resampleMask(mask, w, h);
  const longEdge = Math.max(w, h);
  const radius = opts.radius > 0
    ? Math.round(opts.radius)
    : Math.max(2, Math.round(longEdge / 120));
  const eps = opts.eps > 0 ? opts.eps : 1e-4;

  const guide = new Float32Array(n);
  const input = new Float32Array(n);
  const data = image.data;
  for (let i = 0, o = 0; i < n; i++, o += 4) {
    guide[i] = (0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2]) / 255;
    input[i] = src.data[i] / 255;
  }

  guidedFilter(guide, input, w, h, radius, eps, input);

  const out = makeMask(w, h);
  for (let i = 0; i < n; i++) out.data[i] = input[i] * 255;
  return out;
}

/* ------------------------------------------------------------- morphology

   Flat greyscale dilation and erosion in constant time per pixel (van Herk,
   Gil and Werman). The structuring element is an octagon rather than a square:
   a square of radius a dilated by a diamond of radius 2c, which is four
   separable passes and a much closer match to a disc than a square is. The
   diamond is itself the sum of the two diagonal segments, which the strided
   line filter handles without any special case.

   The padding either side of a line holds the identity element — zero for a
   maximum, 255 for a minimum — so growing never pulls the border in and
   shrinking never eats it away. */

function lineMorph(buf, start, stride, count, r, isMax, pad, g, hh) {
  const k = 2 * r + 1;
  const ident = isMax ? 0 : 255;
  const m = count + 2 * k;
  for (let i = 0; i < k; i++) { pad[i] = ident; pad[k + count + i] = ident; }
  for (let i = 0; i < count; i++) pad[k + i] = buf[start + i * stride];

  for (let b = 0; b < m; b += k) {
    const e = Math.min(b + k, m);
    let acc = pad[b];
    g[b] = acc;
    for (let i = b + 1; i < e; i++) {
      const v = pad[i];
      acc = isMax ? (v > acc ? v : acc) : (v < acc ? v : acc);
      g[i] = acc;
    }
    acc = pad[e - 1];
    hh[e - 1] = acc;
    for (let i = e - 2; i >= b; i--) {
      const v = pad[i];
      acc = isMax ? (v > acc ? v : acc) : (v < acc ? v : acc);
      hh[i] = acc;
    }
  }

  for (let i = 0; i < count; i++) {
    const c = k + i;
    const a = g[c + r], b = hh[c - r];
    buf[start + i * stride] = isMax ? (a > b ? a : b) : (a < b ? a : b);
  }
}

function morphPass(buf, w, h, r, isMax, pad, g, hh) {
  if (r < 1) return;
  for (let y = 0; y < h; y++) lineMorph(buf, y * w, 1, w, r, isMax, pad, g, hh);
  for (let x = 0; x < w; x++) lineMorph(buf, x, w, h, r, isMax, pad, g, hh);
}

function morphDiagonal(buf, w, h, r, isMax, pad, g, hh) {
  if (r < 1) return;
  // Down and to the right: one step is w + 1, and x never wraps because the
  // run stops before it reaches the right edge.
  for (let x0 = 0; x0 < w; x0++) {
    const count = Math.min(w - x0, h);
    if (count > 1) lineMorph(buf, x0, w + 1, count, r, isMax, pad, g, hh);
  }
  for (let y0 = 1; y0 < h; y0++) {
    const count = Math.min(w, h - y0);
    if (count > 1) lineMorph(buf, y0 * w, w + 1, count, r, isMax, pad, g, hh);
  }
  // Up and to the right: one step is 1 - w.
  for (let y0 = 0; y0 < h; y0++) {
    const count = Math.min(w, y0 + 1);
    if (count > 1) lineMorph(buf, y0 * w, 1 - w, count, r, isMax, pad, g, hh);
  }
  for (let x0 = 1; x0 < w; x0++) {
    const count = Math.min(w - x0, h);
    if (count > 1) lineMorph(buf, (h - 1) * w + x0, 1 - w, count, r, isMax, pad, g, hh);
  }
}

/* ------------------------------------------------------------ flood select */

function wandSelect(image, sel, sx, sy, tol, feather, contiguous) {
  const w = image.width, h = image.height, n = w * h;
  const data = image.data;
  const seed = (sy * w + sx) * 4;
  const sr = data[seed], sg = data[seed + 1], sb = data[seed + 2];
  const soft = tol * (1 - feather);
  const band = tol - soft;

  // A weighted RGB distance: cheap, and closer to how the eye weights the
  // channels than a plain Euclidean one. Divided by three so the result stays
  // on the same 0..255 scale as the tolerance.
  const strength = (i) => {
    const o = i * 4;
    const dr = data[o] - sr, dg = data[o + 1] - sg, db = data[o + 2] - sb;
    const d = Math.sqrt(2 * dr * dr + 4 * dg * dg + 3 * db * db) / 3;
    if (d > tol) return 0;
    if (d <= soft || band <= 0) return 255;
    return Math.round(255 * (1 - (d - soft) / band));
  };

  if (!contiguous) {
    for (let i = 0; i < n; i++) sel[i] = strength(i);
    return;
  }

  /* Span fill. Three states rather than a visited flag: a pixel is untested,
     tested and rejected, tested and accepted, or accepted and already covered
     by a span. Collapsing the last two into one flag is the classic way to get
     a flood fill that quietly stops at the first rejected pixel of a run, so
     they are kept apart. */
  const UNTESTED = 0, REJECTED = 1, ACCEPTED = 2, COVERED = 3;
  const state = new Uint8Array(n);
  let stack = new Int32Array(4096);
  let sp = 0;

  const push = (p) => {
    if (sp === stack.length) {
      const grown = new Int32Array(stack.length * 2);
      grown.set(stack);
      stack = grown;
    }
    stack[sp++] = p;
  };

  const open = (p) => {
    const s = state[p];
    if (s === ACCEPTED) return true;
    if (s !== UNTESTED) return false;
    const v = strength(p);
    sel[p] = v;
    state[p] = v > 0 ? ACCEPTED : REJECTED;
    return v > 0;
  };

  push(sy * w + sx);
  while (sp > 0) {
    const p = stack[--sp];
    if (!open(p)) continue;
    const py = (p / w) | 0;
    const px = p - py * w;
    const row = py * w;

    // Grow the run this seed sits in, cover it, then look for fresh runs on the
    // rows above and below. Working in spans keeps the stack in the hundreds
    // rather than growing with the area of the selection.
    let xl = px;
    while (xl - 1 >= 0 && open(row + xl - 1)) xl--;
    let xr = px;
    while (xr + 1 < w && open(row + xr + 1)) xr++;
    for (let x = xl; x <= xr; x++) state[row + x] = COVERED;

    for (let s = 0; s < 2; s++) {
      const ny = s === 0 ? py - 1 : py + 1;
      if (ny < 0 || ny >= h) continue;
      const nrow = ny * w;
      let run = false;
      for (let x = xl; x <= xr; x++) {
        if (open(nrow + x)) {
          if (!run) { push(nrow + x); run = true; }
        } else run = false;
      }
    }
  }
}

/* -------------------------------------------------------------- pipelines */

/**
 * The two reductions a whole-image call needs. The matting copy is made first
 * and the working copy is made from it, so the twelve million source pixels are
 * read once rather than twice — box filtering in two steps is a pyramid, which
 * is if anything the better filter.
 */
function prepare(image, opts) {
  const cap = opts.refineMax > 0 ? Math.round(opts.refineMax) : REFINE_MAX;
  const base = downscaleRGBA(image, Math.max(cap, MAX_WORK));
  return { base, work: downscaleRGBA(base, MAX_WORK) };
}

/** Upsample a working-resolution mask and matte it against the source. */
function finish(image, base, workMask, opts) {
  const sw = image.width, sh = image.height;
  if (opts.refine === false) return resampleMask(workMask, sw, sh);

  const lifted = resampleMask(workMask, base.width, base.height);
  const refined = refineMask(base, lifted, opts);
  if (refined.width === sw && refined.height === sh) return refined;
  return resampleMask(refined, sw, sh);
}

function fromBox(image, box, opts) {
  opts = opts || {};
  if (!validImage(image)) return makeMask(1, 1);
  if (!box) return makeMask(image.width, image.height);
  const { base, work } = prepare(image, opts);
  const rect = {
    x: clamp01(box.x),
    y: clamp01(box.y),
    w: clamp01(box.w),
    h: clamp01(box.h),
  };
  const cut = grabCut(work, rect, opts);
  return finish(image, base, cut, opts);
}

function auto(image, opts) {
  opts = opts || {};
  if (!validImage(image)) return makeMask(1, 1);

  const { base, work } = prepare(image, opts);
  const w = work.width, h = work.height, n = w * h;
  const grey = new Float32Array(n);
  const data = work.data;
  for (let i = 0, o = 0; i < n; i++, o += 4) {
    grey[i] = (0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2]) / 255;
  }

  const map = saliency(work, grey);
  const threshold = otsu(map);
  const blob = largestBlobBox(map, w, h, threshold);

  // Pad the box a little: Otsu tends to clip the dim edge of a subject, and
  // GrabCut recovers far better from a box that is slightly too large than from
  // one that has cut a shoulder off.
  let x0, y0, x1, y1;
  const usable = blob && blob.area > n * 0.004;
  if (usable) {
    const padX = Math.max(2, Math.round(w * 0.03));
    const padY = Math.max(2, Math.round(h * 0.03));
    x0 = blob.box[0] - padX;
    y0 = blob.box[1] - padY;
    x1 = blob.box[2] + 1 + padX;
    y1 = blob.box[3] + 1 + padY;
  } else {
    // Saliency found nothing it believes in. A generous centred rectangle is
    // the honest fallback, and it is what a person would have drawn.
    x0 = w * 0.12; y0 = h * 0.12; x1 = w * 0.88; y1 = h * 0.88;
  }

  // Always leave a margin of real background: the mixtures have nothing to
  // learn from if the rectangle reaches the frame.
  const marginX = Math.max(1, Math.round(w * 0.02));
  const marginY = Math.max(1, Math.round(h * 0.02));
  x0 = clampi(x0, marginX, w - marginX - 2);
  y0 = clampi(y0, marginY, h - marginY - 2);
  x1 = clampi(x1, x0 + 2, w - marginX);
  y1 = clampi(y1, y0 + 2, h - marginY);

  const cut = grabCut(work, { x: x0 / w, y: y0 / h, w: (x1 - x0) / w, h: (y1 - y0) / h }, opts);
  return finish(image, base, cut, opts);
}

function wand(image, mask, x, y, opts) {
  opts = opts || {};
  if (!validImage(image)) return mask ? resampleMask(mask, mask.width, mask.height) : makeMask(1, 1);
  const w = image.width, h = image.height, n = w * h;
  const sx = clampi(clamp01(x) * (w - 1), 0, w - 1);
  const sy = clampi(clamp01(y) * (h - 1), 0, h - 1);
  const tol = clamp01(opts.tolerance != null ? opts.tolerance : 0.15) * 255;
  const feather = clamp01(opts.feather != null ? opts.feather : 0.2);
  const contiguous = opts.contiguous !== false;
  const mode = opts.mode || "add";

  const sel = new Uint8Array(n);
  wandSelect(image, sel, sx, sy, tol, feather, contiguous);

  const out = makeMask(w, h);
  if (mode === "replace" || !mask) {
    out.data.set(sel);
    return out;
  }
  const base = mask.width === w && mask.height === h ? mask : resampleMask(mask, w, h);
  const dst = out.data, prev = base.data;
  if (mode === "subtract") {
    for (let i = 0; i < n; i++) {
      const keep = 255 - sel[i];
      dst[i] = prev[i] < keep ? prev[i] : keep;
    }
  } else {
    for (let i = 0; i < n; i++) dst[i] = prev[i] > sel[i] ? prev[i] : sel[i];
  }
  return out;
}

function paint(mask, x, y, radius, value, hardness) {
  const w = mask.width, h = mask.height;
  const out = makeMask(w, h);
  out.data.set(mask.data);
  const longEdge = Math.max(w, h);
  const r = Math.max(0.5, clamp01(radius) * longEdge);
  const cx = clamp01(x) * (w - 1);
  const cy = clamp01(y) * (h - 1);
  const target = clamp01(value) * 255;
  const hard = clamp01(hardness == null ? 0.5 : hardness);

  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(w - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(h - 1, Math.ceil(cy + r));
  const dst = out.data;
  const inner = hard >= 1 ? 1 : hard;

  for (let py = y0; py <= y1; py++) {
    const dy = py - cy;
    const row = py * w;
    for (let px = x0; px <= x1; px++) {
      const dx = px - cx;
      const t = Math.sqrt(dx * dx + dy * dy) / r;
      if (t >= 1) continue;
      let alpha;
      if (t <= inner) alpha = 1;
      else {
        // Smoothstep across the soft rim, so a stroke has no visible ring.
        const u = (t - inner) / (1 - inner);
        alpha = 1 - u * u * (3 - 2 * u);
      }
      const i = row + px;
      dst[i] = dst[i] + (target - dst[i]) * alpha;
    }
  }
  return out;
}

function morph(mask, amount) {
  const w = mask.width, h = mask.height;
  const out = makeMask(w, h);
  out.data.set(mask.data);
  const a = amount < -1 ? -1 : amount > 1 ? 1 : amount;
  if (!a) return out;

  const rMax = Math.max(1, Math.round(0.04 * Math.max(w, h)));
  const r = Math.round(Math.abs(a) * rMax);
  if (r < 1) return out;

  const isMax = a > 0;
  const square = Math.max(1, Math.round(r * 0.414));
  const diag = Math.round(r * 0.293);
  const k = 2 * Math.max(square, diag) + 1;
  const span = Math.max(w, h) + 2 * k + 4;
  const pad = new Uint8Array(span);
  const g = new Uint8Array(span);
  const hh = new Uint8Array(span);

  morphPass(out.data, w, h, square, isMax, pad, g, hh);
  morphDiagonal(out.data, w, h, diag, isMax, pad, g, hh);
  return out;
}

function smooth(mask, amount) {
  const w = mask.width, h = mask.height, n = w * h;
  const out = makeMask(w, h);
  const a = clamp01(amount);
  if (!a) { out.data.set(mask.data); return out; }

  const r = Math.max(1, Math.round(a * 0.02 * Math.max(w, h)));
  const buf = new Float32Array(n);
  const alt = new Float32Array(n);
  const tmp = new Float32Array(n);
  for (let i = 0; i < n; i++) buf[i] = mask.data[i];

  // Three box passes stand in for a Gaussian; the difference is below a level
  // of the eight-bit mask this writes back into.
  boxBlur(buf, alt, w, h, r, tmp);
  boxBlur(alt, buf, w, h, r, tmp);
  boxBlur(buf, alt, w, h, r, tmp);
  for (let i = 0; i < n; i++) out.data[i] = alt[i];
  return out;
}

function refine(image, mask, opts) {
  opts = opts || {};
  if (!validImage(image)) return mask ? resampleMask(mask, mask.width, mask.height) : makeMask(1, 1);
  if (!mask) return makeMask(image.width, image.height);
  return refineMask(image, mask, opts);
}

const root = globalThis;
root.ISO = root.ISO || {};
root.ISO.Segment = {
  MAX_WORK,
  auto,
  fromBox,
  wand,
  paint,
  invert: invertMask,
  clear: clearMask,
  full: fullMask,
  morph,
  smooth,
  refine,
};
})();
