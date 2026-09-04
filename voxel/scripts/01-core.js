/* ---------------------------------------------------------------------------
   The voxel model, and the primitives every model is cut from.

   Headless on purpose: this file touches no DOM, no canvas and no browser API,
   so the same code builds a model in a game page, in a Node script that bakes
   a sprite sheet, or in a test that just counts voxels. The only export is a
   global `VOX` namespace, plus a CommonJS handle for the tools in tools/.

   Conventions, kept identical across every model in the catalogue:
     · Y is up, X is right, Z is towards the camera.
     · A model stands on y = 0 and is centred on x = 0, so `mirrorX()` after
       building the x >= 0 half gives a symmetric model of odd width.
     · One voxel is one unit. Nothing is ever half a voxel.

   Storage is a Map from a packed integer key to a packed integer value, which
   is what keeps a 40k-voxel backdrop cheap to build, clone and mirror:
     key   = (x+256)<<20 | (y+256)<<10 | (z+256)      range -256..767 per axis
     value = material<<24 | 0xRRGGBB
   --------------------------------------------------------------------------- */

(function (root) {
'use strict';

const VOX = root.VOX || (root.VOX = {});

/* ------------------------------------------------------------------ keys */

const OFF = 256;
const key = (x, y, z) => (((x + OFF) << 20) | ((y + OFF) << 10) | (z + OFF));
const keyX = k => ((k >>> 20) & 1023) - OFF;
const keyY = k => ((k >>> 10) & 1023) - OFF;
const keyZ = k => (k & 1023) - OFF;

/* Materials. Anything past SOLID changes how the renderers light the face,
   never how the geometry is built. */
const MATERIAL = { SOLID: 0, EMISSIVE: 1, METAL: 2, GLASS: 3 };
const MAT_NAME = ['solid', 'emissive', 'metal', 'glass'];

/* ---------------------------------------------------------------- colour */

/** Anything colour-shaped -> 0xRRGGBB. Accepts '#abc', '#aabbcc', an int, or [r,g,b]. */
function rgb(value) {
  if (typeof value === 'number') return value & 0xffffff;
  if (Array.isArray(value)) {
    return ((value[0] & 255) << 16) | ((value[1] & 255) << 8) | (value[2] & 255);
  }
  if (typeof value === 'string') {
    let hex = value.trim().replace(/^#/, '');
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    const n = parseInt(hex, 16);
    if (Number.isFinite(n)) return n & 0xffffff;
  }
  throw new TypeError(`VOX: cannot read ${JSON.stringify(value)} as a colour`);
}

const hex = value => '#' + (rgb(value) >>> 0).toString(16).padStart(6, '0');
const red = c => (c >> 16) & 255;
const green = c => (c >> 8) & 255;
const blue = c => c & 255;

/** Scale a colour towards black (amount < 1) or white (amount > 1). */
function shade(color, amount) {
  const c = rgb(color);
  const f = v => {
    const out = amount <= 1 ? v * amount : v + (255 - v) * (amount - 1);
    return Math.max(0, Math.min(255, Math.round(out)));
  };
  return (f(red(c)) << 16) | (f(green(c)) << 8) | f(blue(c));
}

/** Linear blend between two colours, 0 = a, 1 = b. */
function mix(a, b, t) {
  const ca = rgb(a), cb = rgb(b);
  const f = (x, y) => Math.round(x + (y - x) * t) & 255;
  return (f(red(ca), red(cb)) << 16) | (f(green(ca), green(cb)) << 8) | f(blue(ca), blue(cb));
}

function hsl(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360; s = Math.max(0, Math.min(1, s)); l = Math.max(0, Math.min(1, l));
  if (s === 0) { const v = Math.round(l * 255); return (v << 16) | (v << 8) | v; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = t => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const to = v => Math.round(v * 255) & 255;
  return (to(channel(h + 1 / 3)) << 16) | (to(channel(h)) << 8) | to(channel(h - 1 / 3));
}

/* ------------------------------------------------------------------- rng */

/** mulberry32 — small, fast, and identical on every platform we run on. */
function rng(seed) {
  let a = (seed >>> 0) || 1;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.int = (min, max) => min + Math.floor(next() * (max - min + 1));
  next.pick = list => list[Math.floor(next() * list.length)];
  next.chance = p => next() < p;
  return next;
}

function hashString(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Deterministic 0..1 from a position — texture that survives a rebuild. */
function hash01(x, y, z) {
  let h = Math.imul(x + 1013, 374761393) ^ Math.imul(y + 5417, 668265263) ^ Math.imul(z + 9871, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/* ----------------------------------------------------------------- model */

class Model {
  constructor(name, options = {}) {
    this.name = name;
    this.title = options.title || name.replace(/(^|-)(\w)/g, (_, d, c) => (d ? ' ' : '') + c.toUpperCase());
    this.category = options.category || 'misc';
    this.tags = options.tags ? options.tags.slice() : [];
    this.note = options.note || '';
    this.cells = new Map();
    this.rand = rng(options.seed === undefined ? hashString(name) : options.seed);
  }

  get size() { return this.cells.size; }

  /* ------------------------------------------------------------- writing */

  set(x, y, z, color, material = 0) {
    x = Math.round(x); y = Math.round(y); z = Math.round(z);
    if (x < -OFF || y < -OFF || z < -OFF || x > 767 || y > 767 || z > 767) return this;
    this.cells.set(key(x, y, z), ((material & 3) << 24) | rgb(color));
    return this;
  }

  /** Write only where nothing is yet — the way to keep an underlayer visible. */
  setIfEmpty(x, y, z, color, material = 0) {
    if (!this.cells.has(key(x, y, z))) this.set(x, y, z, color, material);
    return this;
  }

  clear(x, y, z) { this.cells.delete(key(x, y, z)); return this; }

  has(x, y, z) { return this.cells.has(key(x, y, z)); }

  get(x, y, z) {
    const value = this.cells.get(key(x, y, z));
    return value === undefined ? null : { color: value & 0xffffff, material: (value >>> 24) & 3 };
  }

  colorAt(x, y, z) {
    const value = this.cells.get(key(x, y, z));
    return value === undefined ? null : (value & 0xffffff);
  }

  /* ---------------------------------------------------------- primitives */

  /** Inclusive box. Arguments in any order — the corners are sorted first. */
  box(x0, y0, z0, x1, y1, z1, color, material = 0) {
    const [ax, bx] = x0 <= x1 ? [x0, x1] : [x1, x0];
    const [ay, by] = y0 <= y1 ? [y0, y1] : [y1, y0];
    const [az, bz] = z0 <= z1 ? [z0, z1] : [z1, z0];
    for (let x = Math.round(ax); x <= Math.round(bx); x++) {
      for (let y = Math.round(ay); y <= Math.round(by); y++) {
        for (let z = Math.round(az); z <= Math.round(bz); z++) this.set(x, y, z, color, material);
      }
    }
    return this;
  }

  /** A box with its interior removed — walls, crates, rooms. */
  boxShell(x0, y0, z0, x1, y1, z1, color, material = 0) {
    const [ax, bx] = x0 <= x1 ? [x0, x1] : [x1, x0];
    const [ay, by] = y0 <= y1 ? [y0, y1] : [y1, y0];
    const [az, bz] = z0 <= z1 ? [z0, z1] : [z1, z0];
    for (let x = ax; x <= bx; x++) for (let y = ay; y <= by; y++) for (let z = az; z <= bz; z++) {
      const inside = x > ax && x < bx && y > ay && y < by && z > az && z < bz;
      if (!inside) this.set(x, y, z, color, material);
    }
    return this;
  }

  ellipsoid(cx, cy, cz, rx, ry, rz, color, material = 0) {
    const ex = Math.max(rx, 0.5), ey = Math.max(ry, 0.5), ez = Math.max(rz, 0.5);
    for (let x = Math.floor(cx - ex); x <= Math.ceil(cx + ex); x++) {
      for (let y = Math.floor(cy - ey); y <= Math.ceil(cy + ey); y++) {
        for (let z = Math.floor(cz - ez); z <= Math.ceil(cz + ez); z++) {
          const dx = (x - cx) / ex, dy = (y - cy) / ey, dz = (z - cz) / ez;
          if (dx * dx + dy * dy + dz * dz <= 1.05) this.set(x, y, z, color, material);
        }
      }
    }
    return this;
  }

  sphere(cx, cy, cz, r, color, material = 0) {
    return this.ellipsoid(cx, cy, cz, r, r, r, color, material);
  }

  /** Vertical cylinder, y0..y1 inclusive. */
  cylY(cx, cz, y0, y1, r, color, material = 0) {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) this.discY(cx, y, cz, r, color, material);
    return this;
  }

  cylX(cy, cz, x0, x1, r, color, material = 0) {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
      for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
        for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++) {
          const dy = y - cy, dz = z - cz;
          if (dy * dy + dz * dz <= r * r + 0.35) this.set(x, y, z, color, material);
        }
      }
    }
    return this;
  }

  cylZ(cx, cy, z0, z1, r, color, material = 0) {
    for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
          const dx = x - cx, dy = y - cy;
          if (dx * dx + dy * dy <= r * r + 0.35) this.set(x, y, z, color, material);
        }
      }
    }
    return this;
  }

  discY(cx, y, cz, r, color, material = 0) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++) {
        const dx = x - cx, dz = z - cz;
        if (dx * dx + dz * dz <= r * r + 0.35) this.set(x, y, z, color, material);
      }
    }
    return this;
  }

  /** Cone or tapered column along Y: radius r0 at y0 easing to r1 at y1. */
  cone(cx, cz, y0, y1, r0, r1, color, material = 0) {
    const span = Math.max(1, Math.abs(y1 - y0));
    const step = y1 >= y0 ? 1 : -1;
    for (let y = y0, i = 0; step > 0 ? y <= y1 : y >= y1; y += step, i++) {
      this.discY(cx, y, cz, r0 + (r1 - r0) * (i / span), color, material);
    }
    return this;
  }

  /** Box that tapers in x and z between y0 and y1 — trunks, towers, torsos. */
  taper(cx, cz, y0, y1, w0, d0, w1, d1, color, material = 0) {
    const span = Math.max(1, y1 - y0);
    for (let y = y0; y <= y1; y++) {
      const t = (y - y0) / span;
      const w = Math.round(w0 + (w1 - w0) * t);
      const d = Math.round(d0 + (d1 - d0) * t);
      this.box(cx - w, y, cz - d, cx + w, y, cz + d, color, material);
    }
    return this;
  }

  /** Sampled 3D line with an optional radius — limbs, branches, cables. */
  line(x0, y0, z0, x1, y1, z1, color, r = 0, material = 0) {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), 1);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = Math.round(x0 + (x1 - x0) * t);
      const y = Math.round(y0 + (y1 - y0) * t);
      const z = Math.round(z0 + (z1 - z0) * t);
      if (r <= 0) this.set(x, y, z, color, material);
      else this.sphere(x, y, z, r, color, material);
    }
    return this;
  }

  /** A pitched roof running along X, gable ends facing +/- X. */
  gable(x0, x1, z0, z1, y0, color, material = 0, overhang = 0) {
    const az = Math.min(z0, z1) - overhang, bz = Math.max(z0, z1) + overhang;
    const depth = bz - az;
    const rows = Math.ceil((depth + 1) / 2);
    for (let i = 0; i < rows; i++) {
      const y = y0 + i;
      const near = az + i, far = bz - i;
      if (near > far) break;
      this.box(x0 - overhang, y, near, x1 + overhang, y, near, color, material);
      this.box(x0 - overhang, y, far, x1 + overhang, y, far, color, material);
      if (i === rows - 1) this.box(x0 - overhang, y, near, x1 + overhang, y, far, color, material);
    }
    return this;
  }

  /** A pyramid roof or spire over a rectangular footprint. */
  pyramid(x0, x1, z0, z1, y0, color, material = 0) {
    let ax = x0, bx = x1, az = z0, bz = z1, y = y0;
    while (ax <= bx && az <= bz) {
      this.box(ax, y, az, bx, y, bz, color, material);
      ax++; bx--; az++; bz--; y++;
    }
    return this;
  }

  /* ------------------------------------------------------------- editing */

  /** Mirror across the x = plane axis. Build one half, call this, get both. */
  mirrorX(plane = 0) {
    for (const [k, v] of Array.from(this.cells)) {
      const x = keyX(k);
      this.cells.set(key(2 * plane - x, keyY(k), keyZ(k)), v);
    }
    return this;
  }

  mirrorZ(plane = 0) {
    for (const [k, v] of Array.from(this.cells)) {
      const z = keyZ(k);
      this.cells.set(key(keyX(k), keyY(k), 2 * plane - z), v);
    }
    return this;
  }

  translate(dx, dy, dz) {
    const next = new Map();
    for (const [k, v] of this.cells) next.set(key(keyX(k) + dx, keyY(k) + dy, keyZ(k) + dz), v);
    this.cells = next;
    return this;
  }

  /** Quarter turns about Y, positive = anticlockwise seen from above. */
  rotateY(turns = 1) {
    const n = ((turns % 4) + 4) % 4;
    for (let i = 0; i < n; i++) {
      const next = new Map();
      for (const [k, v] of this.cells) next.set(key(-keyZ(k), keyY(k), keyX(k)), v);
      this.cells = next;
    }
    return this;
  }

  /** Integer upscale — each voxel becomes an n x n x n block. */
  scale(n) {
    if (n <= 1) return this;
    const next = new Map();
    for (const [k, v] of this.cells) {
      const x = keyX(k) * n, y = keyY(k) * n, z = keyZ(k) * n;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (let m = 0; m < n; m++) {
        next.set(key(x + i, y + j, z + m), v);
      }
    }
    this.cells = next;
    return this;
  }

  remove(x0, y0, z0, x1, y1, z1) {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
        for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) this.cells.delete(key(x, y, z));
      }
    }
    return this;
  }

  /** Paste another model in, optionally mirrored or turned. Never destructive. */
  stamp(other, dx = 0, dy = 0, dz = 0, options = {}) {
    const copy = other.clone();
    if (options.rotate) copy.rotateY(options.rotate);
    if (options.mirrorX) { copy.cells = flipX(copy.cells); }
    if (options.scale && options.scale > 1) copy.scale(options.scale);
    for (const [k, v] of copy.cells) {
      const x = keyX(k) + dx, y = keyY(k) + dy, z = keyZ(k) + dz;
      if (options.under && this.cells.has(key(x, y, z))) continue;
      this.cells.set(key(x, y, z), v);
    }
    return this;
  }

  /** Recolour every voxel through a function of (color, x, y, z, material). */
  map(fn) {
    for (const [k, v] of Array.from(this.cells)) {
      const out = fn(v & 0xffffff, keyX(k), keyY(k), keyZ(k), (v >>> 24) & 3);
      if (out === null || out === undefined) continue;
      if (out === false) { this.cells.delete(k); continue; }
      if (typeof out === 'object' && !Array.isArray(out)) {
        this.cells.set(k, (((out.material ?? ((v >>> 24) & 3)) & 3) << 24) | rgb(out.color ?? (v & 0xffffff)));
      } else {
        this.cells.set(k, (v & 0xff000000) | rgb(out));
      }
    }
    return this;
  }

  /** Swap one colour for another everywhere. */
  replace(from, to, material) {
    const target = rgb(from);
    return this.map(color => (color === target
      ? (material === undefined ? rgb(to) : { color: rgb(to), material })
      : color));
  }

  /**
   * Position-hashed brightness jitter — the difference between plastic and
   * stone. Quantised to a handful of steps on purpose: a continuous jitter
   * would give a 3k-voxel rock 3k distinct colours, which bloats the JSON and
   * blows the 255-colour ceiling every voxel editor has.
   */
  grain(amount = 0.12, filter = null, steps = 5) {
    return this.map((color, x, y, z, material) => {
      if (filter && !filter(color, x, y, z, material)) return color;
      if (material === MATERIAL.EMISSIVE) return color;
      const level = Math.floor(hash01(x, y, z) * steps) / (steps - 1);
      return shade(color, 1 - amount + level * amount * 2);
    });
  }

  /** Scatter a second colour through a model — moss, rust, freckles, gravel. */
  speckle(color, chance = 0.12, filter = null) {
    return this.map((current, x, y, z, material) => {
      if (filter && !filter(current, x, y, z, material)) return current;
      return hash01(x * 3 + 7, y * 5 + 11, z * 7 + 13) < chance ? rgb(color) : current;
    });
  }

  /** Delete every voxel that has all six neighbours — keeps the visible skin. */
  hollow() {
    const doomed = [];
    for (const k of this.cells.keys()) {
      const x = keyX(k), y = keyY(k), z = keyZ(k);
      if (this.cells.has(key(x + 1, y, z)) && this.cells.has(key(x - 1, y, z))
        && this.cells.has(key(x, y + 1, z)) && this.cells.has(key(x, y - 1, z))
        && this.cells.has(key(x, y, z + 1)) && this.cells.has(key(x, y, z - 1))) doomed.push(k);
    }
    for (const k of doomed) this.cells.delete(k);
    return this;
  }

  /* -------------------------------------------------------------- layout */

  bounds() {
    if (!this.cells.size) return { min: [0, 0, 0], max: [0, 0, 0], size: [0, 0, 0], center: [0, 0, 0] };
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (const k of this.cells.keys()) {
      const x = keyX(k), y = keyY(k), z = keyZ(k);
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (z < z0) z0 = z; if (z > z1) z1 = z;
    }
    return {
      min: [x0, y0, z0], max: [x1, y1, z1],
      size: [x1 - x0 + 1, y1 - y0 + 1, z1 - z0 + 1],
      center: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2],
    };
  }

  /** Sit the model on y = 0 and centre it on x and z. What every model ships as. */
  ground() {
    const b = this.bounds();
    return this.translate(-Math.round(b.center[0]), -b.min[1], -Math.round(b.center[2]));
  }

  clone() {
    const copy = new Model(this.name, { title: this.title, category: this.category, tags: this.tags, note: this.note });
    copy.cells = new Map(this.cells);
    return copy;
  }

  /* ------------------------------------------------------------ readback */

  /** Every voxel, sorted, so two builds of the same model compare byte for byte. */
  voxels() {
    const out = [];
    for (const [k, v] of this.cells) {
      out.push({ x: keyX(k), y: keyY(k), z: keyZ(k), color: v & 0xffffff, material: (v >>> 24) & 3 });
    }
    out.sort((a, b) => (a.y - b.y) || (a.z - b.z) || (a.x - b.x));
    return out;
  }

  palette() {
    const seen = new Map();
    for (const v of this.cells.values()) {
      const c = v & 0xffffff;
      seen.set(c, (seen.get(c) || 0) + 1);
    }
    return Array.from(seen.entries()).sort((a, b) => b[1] - a[1]).map(([color, count]) => ({ color, count }));
  }

  /** Portable, diffable JSON. Voxels are [x,y,z,paletteIndex,material]. */
  toJSON() {
    const palette = this.palette().map(entry => entry.color);
    const index = new Map(palette.map((color, i) => [color, i]));
    return {
      format: 'vox-model/1',
      name: this.name,
      title: this.title,
      category: this.category,
      tags: this.tags,
      size: this.bounds().size,
      palette: palette.map(hex),
      voxels: this.voxels().map(v => [v.x, v.y, v.z, index.get(v.color), v.material]),
    };
  }

  static fromJSON(data) {
    const model = new Model(data.name, { title: data.title, category: data.category, tags: data.tags });
    const palette = data.palette.map(rgb);
    for (const [x, y, z, ci, material] of data.voxels) model.set(x, y, z, palette[ci], material || 0);
    return model;
  }
}

function flipX(cells) {
  const next = new Map();
  for (const [k, v] of cells) next.set(key(-keyX(k), keyY(k), keyZ(k)), v);
  return next;
}

/* ------------------------------------------------------------------ exit */

VOX.Model = Model;
VOX.MATERIAL = MATERIAL;
VOX.MAT_NAME = MAT_NAME;
VOX.model = (name, options) => new Model(name, options);
VOX.util = { key, keyX, keyY, keyZ, rgb, hex, shade, mix, hsl, rng, hashString, hash01, red, green, blue };
Object.assign(VOX, { rgb, hex, shade, mix, hsl, rng, hash01 });

})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module === 'object' && module.exports) module.exports = globalThis.VOX;
