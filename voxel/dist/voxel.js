/* ---------------------------------------------------------------------------
   voxel.js — the headless voxel model maker, as one file.

   GENERATED. Do not edit: run `node tools/voxel-build.mjs` instead. The
   sources are voxel/scripts/*.js, concatenated here in load order.

   Usage in a page:
     <script src="voxel.js"></script>
     <script>
       const model = VOX.build('knight');          // or any catalogue name
       const mesh  = VOX.mesh(model);
       VOX.Viewer.attach(document.querySelector('canvas'), model);
     </script>

   Usage in Node:
     const VOX = require('./voxel.js');
     require('fs').writeFileSync('knight.vox', VOX.Export.toVOX(VOX.build('knight')));

   Contents: 01-core.js, 02-palette.js, 03-mesh.js, 04-view.js, 05-raster.js, 06-catalog.js, 07-export.js, 08-webgl.js, 09-viewer.js, 10-characters.js, 11-animals.js, 12-weapons.js, 13-items.js, 14-furniture.js, 15-scenery.js, 16-buildings.js, 17-vehicles.js, 18-backdrops.js
   --------------------------------------------------------------------------- */

/* ===== 01-core.js ======================================================== */

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

/* ===== 02-palette.js ===================================================== */

/* ---------------------------------------------------------------------------
   One palette for the whole catalogue.

   Seventy models built by nine different files will not read as one set unless
   they share their colours, so every generator pulls from here rather than
   typing a hex code. Swap a value in this file and the whole catalogue moves
   with it — which is the point.

   The ramps (`ramp.stone`, `ramp.wood`, …) are ordered dark -> light, so a
   generator can pick a shade by index and stay inside a family that already
   agrees with itself.
   --------------------------------------------------------------------------- */

(function (root) {
'use strict';

const VOX = root.VOX || (root.VOX = {});
const { shade } = VOX.util;

const P = {
  /* neutrals */
  black: '#12131a', ink: '#1d1f2a', charcoal: '#2b2e3c', slate: '#3d4256',
  steel: '#6c7590', ash: '#9aa3b8', silver: '#c2c9d8', white: '#f2f4fb',

  /* skin, hair, cloth */
  skinPale: '#f0c39a', skinTan: '#d59a6a', skinDeep: '#8f5b3a', skinCool: '#b9d4c2',
  hairBlack: '#241c22', hairBrown: '#5a3a24', hairGold: '#d8a441', hairRed: '#a8442a',
  cloth: '#4a5a8c', clothWarm: '#8c4a3c', clothGreen: '#3f6b46', clothPlum: '#5a3a6b',
  leather: '#6b4a2c', leatherDark: '#43301d', canvasCloth: '#c9b48c',

  /* materials */
  wood: '#7a5533', woodDark: '#4e3520', woodPale: '#b08b57', plank: '#9a6f42',
  stone: '#7b8090', stoneDark: '#4d5260', stonePale: '#a9aebd', brick: '#9c4f3e',
  iron: '#8d93a3', ironDark: '#565c6b', gold: '#e8b53c', goldDark: '#a67a1e',
  copper: '#c0713d', bronze: '#a8763c', gem: '#4fd4d8', ruby: '#d63a5a',
  glassPane: '#9fd6e8', thatch: '#c39b4f', tile: '#7a4c46',

  /* world */
  grass: '#4c8a3a', grassDark: '#356328', dirt: '#6d4c33', dirtDark: '#4a3222',
  sand: '#dcc487', sandDark: '#b89f66', snow: '#eef3fb', water: '#3a7bd5',
  leaf: '#3f7a35', leafDeep: '#2c5a27', leafAutumn: '#c47b2a', pine: '#2f5b3a',
  sky: '#7fb6e8', cloud: '#eef2f8', lava: '#ff7a2f',

  /* light and effect */
  flame: '#ffb43c', flameHot: '#fff0a8', magic: '#a97bff', poison: '#7fe05a',
  bloodRed: '#8e2b2b', shadow: '#232634',
};

/* Ramps: dark -> light, five steps, generated so they stay in family. */
function ramp(base, spread = 0.42) {
  const steps = [];
  for (let i = 0; i < 5; i++) {
    const t = (i / 4) * 2 - 1;                     // -1 .. 1
    steps.push(shade(base, 1 + t * spread));
  }
  return steps;
}

const ramps = {
  stone: ramp(P.stone), wood: ramp(P.wood), iron: ramp(P.iron), gold: ramp(P.gold, 0.3),
  grass: ramp(P.grass), leaf: ramp(P.leaf), dirt: ramp(P.dirt), sand: ramp(P.sand, 0.3),
  cloth: ramp(P.cloth), skin: ramp(P.skinTan, 0.28), snow: ramp(P.snow, 0.16),
  brick: ramp(P.brick), water: ramp(P.water), flame: ramp(P.flame, 0.34),
};

VOX.palette = P;
VOX.ramps = ramps;
VOX.ramp = ramp;

})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module === 'object' && module.exports) module.exports = globalThis.VOX;

/* ===== 03-mesh.js ======================================================== */

/* ---------------------------------------------------------------------------
   Voxels -> triangles.

   Two passes, both cheap, and the reason a 40k-voxel backdrop still renders on
   a phone:

   1. Face culling. A voxel only contributes a face where its neighbour is
      missing, so a solid block of 40k voxels emits the ~7k faces you can
      actually see and none of the interior.
   2. Greedy merging. Coplanar faces that share a colour, a material and all
      four ambient-occlusion corners are merged into the largest rectangle
      available, so a castle wall is a handful of quads rather than hundreds.

   Ambient occlusion is baked per vertex from the three voxels touching each
   corner — the standard 0..3 term — and the quad's diagonal is flipped when
   the corners disagree, which kills the seam that otherwise runs across every
   shaded face. Nothing here needs a GPU: the same buffers feed the WebGL
   renderer in the browser and the software rasteriser in tools/.
   --------------------------------------------------------------------------- */

(function (root) {
'use strict';

const VOX = root.VOX || (root.VOX = {});
const { key } = VOX.util;

/* du x dv = normal, so p -> p+du -> p+du+dv -> p+dv winds anticlockwise when
   seen from the lit side. Order: +X, -X, +Y, -Y, +Z, -Z. */
const FACES = [
  { n: [1, 0, 0], du: [0, 1, 0], dv: [0, 0, 1], origin: [1, 0, 0] },
  { n: [-1, 0, 0], du: [0, 0, 1], dv: [0, 1, 0], origin: [0, 0, 0] },
  { n: [0, 1, 0], du: [0, 0, 1], dv: [1, 0, 0], origin: [0, 1, 0] },
  { n: [0, -1, 0], du: [1, 0, 0], dv: [0, 0, 1], origin: [0, 0, 0] },
  { n: [0, 0, 1], du: [1, 0, 0], dv: [0, 1, 0], origin: [0, 0, 1] },
  { n: [0, 0, -1], du: [0, 1, 0], dv: [1, 0, 0], origin: [0, 0, 0] },
];

const AO_LEVEL = [0.5, 0.7, 0.86, 1];

function build(model, options = {}) {
  const greedy = options.greedy !== false;
  const occlusion = options.ao !== false;
  const cells = model.cells;
  const bounds = model.bounds();

  const solid = (x, y, z) => cells.has(key(x, y, z));

  /* Corner occlusion, the classic three-sample term. */
  function corner(x, y, z, n, a, b) {
    const px = x + n[0], py = y + n[1], pz = z + n[2];
    const s1 = solid(px + a[0], py + a[1], pz + a[2]) ? 1 : 0;
    const s2 = solid(px + b[0], py + b[1], pz + b[2]) ? 1 : 0;
    if (s1 && s2) return 0;
    const c = solid(px + a[0] + b[0], py + a[1] + b[1], pz + a[2] + b[2]) ? 1 : 0;
    return 3 - (s1 + s2 + c);
  }

  const position = [], normal = [], color = [], light = [], material = [];
  let quads = 0;

  for (const face of FACES) {
    const { n, du, dv } = face;
    /* The axis the slices stack along is whichever component the normal uses. */
    const axis = n[0] !== 0 ? 0 : n[1] !== 0 ? 1 : 2;
    const uAxis = du[0] !== 0 ? 0 : du[1] !== 0 ? 1 : 2;
    const vAxis = dv[0] !== 0 ? 0 : dv[1] !== 0 ? 1 : 2;

    const min = bounds.min, max = bounds.max;
    const uMin = min[uAxis], uMax = max[uAxis];
    const vMin = min[vAxis], vMax = max[vAxis];
    const uSpan = uMax - uMin + 1, vSpan = vMax - vMin + 1;

    const maskValue = new Int32Array(uSpan * vSpan);
    const maskAO = new Int32Array(uSpan * vSpan);
    const maskUsed = new Uint8Array(uSpan * vSpan);

    for (let slice = min[axis]; slice <= max[axis]; slice++) {
      maskValue.fill(0); maskAO.fill(0); maskUsed.fill(0);
      let any = false;

      for (let u = 0; u < uSpan; u++) {
        for (let v = 0; v < vSpan; v++) {
          const p = [0, 0, 0];
          p[axis] = slice; p[uAxis] = uMin + u; p[vAxis] = vMin + v;
          const value = cells.get(key(p[0], p[1], p[2]));
          if (value === undefined) continue;
          if (solid(p[0] + n[0], p[1] + n[1], p[2] + n[2])) continue;

          let ao = 0b11111111;                 // every corner fully lit
          if (occlusion) {
            const negU = [-du[0], -du[1], -du[2]], negV = [-dv[0], -dv[1], -dv[2]];
            const a0 = corner(p[0], p[1], p[2], n, negU, negV);
            const a1 = corner(p[0], p[1], p[2], n, du, negV);
            const a2 = corner(p[0], p[1], p[2], n, du, dv);
            const a3 = corner(p[0], p[1], p[2], n, negU, dv);
            ao = a0 | (a1 << 2) | (a2 << 4) | (a3 << 6);
          }
          const index = u * vSpan + v;
          maskValue[index] = value | 0x40000000;   // mark as present
          maskAO[index] = ao;
          any = true;
        }
      }
      if (!any) continue;

      /* Greedy rectangles over the mask. */
      for (let u = 0; u < uSpan; u++) {
        for (let v = 0; v < vSpan; v++) {
          const index = u * vSpan + v;
          if (!maskValue[index] || maskUsed[index]) continue;
          const value = maskValue[index], ao = maskAO[index];

          let height = 1;
          if (greedy) {
            while (v + height < vSpan) {
              const probe = u * vSpan + v + height;
              if (maskUsed[probe] || maskValue[probe] !== value || maskAO[probe] !== ao) break;
              height++;
            }
          }
          let width = 1;
          if (greedy) {
            outer: while (u + width < uSpan) {
              for (let h = 0; h < height; h++) {
                const probe = (u + width) * vSpan + v + h;
                if (maskUsed[probe] || maskValue[probe] !== value || maskAO[probe] !== ao) break outer;
              }
              width++;
            }
          }
          for (let w = 0; w < width; w++) for (let h = 0; h < height; h++) maskUsed[(u + w) * vSpan + v + h] = 1;

          const base = [0, 0, 0];
          base[axis] = slice + face.origin[axis];
          base[uAxis] = uMin + u + face.origin[uAxis];
          base[vAxis] = vMin + v + face.origin[vAxis];

          const rgbValue = value & 0xffffff;
          const mat = (value >>> 24) & 3;
          const r = (rgbValue >> 16) & 255, g = (rgbValue >> 8) & 255, b = rgbValue & 255;
          const corners = [
            AO_LEVEL[ao & 3], AO_LEVEL[(ao >> 2) & 3], AO_LEVEL[(ao >> 4) & 3], AO_LEVEL[(ao >> 6) & 3],
          ];
          const p0 = base;
          const p1 = [base[0] + du[0] * width, base[1] + du[1] * width, base[2] + du[2] * width];
          const p2 = [p1[0] + dv[0] * height, p1[1] + dv[1] * height, p1[2] + dv[2] * height];
          const p3 = [base[0] + dv[0] * height, base[1] + dv[1] * height, base[2] + dv[2] * height];

          /* Flip the split so the darker pair shares the diagonal — otherwise
             the interpolation leaves a visible crease across shaded faces. */
          const flip = corners[0] + corners[2] < corners[1] + corners[3];
          const order = flip ? [1, 2, 3, 1, 3, 0] : [0, 1, 2, 0, 2, 3];
          const points = [p0, p1, p2, p3];

          for (const i of order) {
            const p = points[i];
            position.push(p[0], p[1], p[2]);
            normal.push(n[0], n[1], n[2]);
            color.push(r, g, b);
            light.push(corners[i]);
            material.push(mat);
          }
          quads++;
        }
      }
    }
  }

  return {
    position: new Float32Array(position),
    normal: new Float32Array(normal),
    color: new Uint8Array(color),
    light: new Float32Array(light),
    material: new Float32Array(material),
    count: light.length,
    triangles: light.length / 3,
    quads,
    bounds,
    voxels: cells.size,
  };
}

VOX.mesh = build;
VOX.Mesh = { build, FACES, AO_LEVEL };

})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module === 'object' && module.exports) module.exports = globalThis.VOX;

/* ===== 04-view.js ======================================================== */

/* ---------------------------------------------------------------------------
   Camera, lighting and framing — the part both renderers must agree on.

   The gallery draws with WebGL and the tools draw with a software rasteriser
   in Node. If those two disagree about where the camera sits or how a face is
   lit, the baked test sheet stops being a test of anything. So the matrices,
   the light rig and the material response all live here, once.

   The orbit camera is described the way a turntable is: yaw (degrees around
   the model), pitch (degrees above the horizon), and a zoom multiplier applied
   to a distance derived from the model's own bounding sphere. Every model in
   the catalogue therefore frames itself, whatever its size.
   --------------------------------------------------------------------------- */

(function (root) {
'use strict';

const VOX = root.VOX || (root.VOX = {});

/* One light rig for the whole project: a warm key from the upper right, a cool
   fill from behind left so silhouettes never go black, and enough ambient that
   an unlit face still shows its colour. */
const LIGHT = {
  key: normalize([0.42, 0.86, 0.3]),
  fill: normalize([-0.55, 0.22, -0.7]),
  keyStrength: 0.72,
  fillStrength: 0.2,
  ambient: 0.4,
  specular: { solid: 0.06, emissive: 0, metal: 0.42, glass: 0.3 },
  gloss: { solid: 8, emissive: 1, metal: 26, glass: 40 },
};

function normalize(v) {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

/* ------------------------------------------------------------- matrices */

function perspective(out, fovDeg, aspect, near, far) {
  const f = 1 / Math.tan((fovDeg * Math.PI) / 360);
  out.fill(0);
  out[0] = f / aspect; out[5] = f;
  out[10] = (far + near) / (near - far); out[11] = -1;
  out[14] = (2 * far * near) / (near - far);
  return out;
}

function orthographic(out, halfHeight, aspect, near, far) {
  out.fill(0);
  out[0] = 1 / (halfHeight * aspect); out[5] = 1 / halfHeight;
  out[10] = -2 / (far - near); out[14] = -(far + near) / (far - near); out[15] = 1;
  return out;
}

function lookAt(out, eye, target, up) {
  let zx = eye[0] - target[0], zy = eye[1] - target[1], zz = eye[2] - target[2];
  let len = Math.hypot(zx, zy, zz) || 1;
  zx /= len; zy /= len; zz /= len;
  let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
  len = Math.hypot(xx, xy, xz) || 1;
  xx /= len; xy /= len; xz /= len;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
  out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
  out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
  out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
  out[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
  out[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
  out[15] = 1;
  return out;
}

function multiply(out, a, b) {
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return out;
}

/* ---------------------------------------------------------------- camera */

const DEFAULTS = { yaw: 35, pitch: 24, zoom: 1, fov: 26, projection: 'perspective' };

/**
 * Everything a renderer needs for one frame: the view-projection matrix, the
 * eye position (for speculars) and the near/far it settled on.
 * `bounds` is a model's bounds; voxel (x,y,z) fills the cube [x,x+1].
 */
function camera(bounds, options = {}) {
  const o = Object.assign({}, DEFAULTS, options);
  const aspect = (o.width || 1) / (o.height || 1);
  const center = [
    (bounds.min[0] + bounds.max[0] + 1) / 2,
    (bounds.min[1] + bounds.max[1] + 1) / 2,
    (bounds.min[2] + bounds.max[2] + 1) / 2,
  ];
  if (o.pivot) { center[0] += o.pivot[0]; center[1] += o.pivot[1]; center[2] += o.pivot[2]; }

  const radius = Math.max(1, Math.hypot(bounds.size[0], bounds.size[1], bounds.size[2]) / 2);
  /* Enough room that a turntable never clips the model at any yaw, then the
     user's zoom on top. Narrow aspect ratios pull the camera back further. */
  const fit = radius / Math.sin((o.fov * Math.PI) / 360);
  const distance = (fit * 1.12) / Math.max(0.35, Math.min(1, aspect)) / o.zoom;

  const yaw = (o.yaw * Math.PI) / 180;
  const pitch = Math.max(-1.5, Math.min(1.5, (o.pitch * Math.PI) / 180));
  const eye = [
    center[0] + distance * Math.cos(pitch) * Math.sin(yaw),
    center[1] + distance * Math.sin(pitch),
    center[2] + distance * Math.cos(pitch) * Math.cos(yaw),
  ];

  const near = Math.max(0.05, distance - radius * 2.2);
  const far = distance + radius * 4;
  const projection = new Float32Array(16);
  if (o.projection === 'orthographic') {
    orthographic(projection, (radius * 1.12) / o.zoom, aspect, 0.01, far + radius * 4);
  } else {
    perspective(projection, o.fov, aspect, near, far);
  }
  const view = lookAt(new Float32Array(16), eye, center, [0, 1, 0]);
  const viewProjection = multiply(new Float32Array(16), projection, view);
  return { viewProjection, view, projection, eye, center, radius, distance, near, far };
}

/**
 * The shading every renderer applies, per vertex. Returns a multiplier per
 * channel plus an additive specular term, both already gamma-free.
 */
function shadePoint(normal, ao, material, viewDir) {
  /* Emissive is nearly unlit, but not flat: a light that shows no form at all
     turns a cut gem into a coloured sticker. A sixth of the usual key term and
     a sixth of the occlusion is enough to keep the facets readable. */
  if (material === 1) {
    const key = Math.max(0, normal[0] * LIGHT.key[0] + normal[1] * LIGHT.key[1] + normal[2] * LIGHT.key[2]);
    return { diffuse: (0.94 + key * 0.16) * (0.86 + ao * 0.14), specular: 0.05 };
  }
  const key = Math.max(0, normal[0] * LIGHT.key[0] + normal[1] * LIGHT.key[1] + normal[2] * LIGHT.key[2]);
  const fill = Math.max(0, normal[0] * LIGHT.fill[0] + normal[1] * LIGHT.fill[1] + normal[2] * LIGHT.fill[2]);
  let diffuse = LIGHT.ambient + key * LIGHT.keyStrength + fill * LIGHT.fillStrength;
  if (material === 3) diffuse = diffuse * 0.72 + 0.42;            // glass reads bright and flat
  diffuse *= ao;

  const names = ['solid', 'emissive', 'metal', 'glass'];
  const name = names[material] || 'solid';
  const half = normalize([
    LIGHT.key[0] + viewDir[0], LIGHT.key[1] + viewDir[1], LIGHT.key[2] + viewDir[2],
  ]);
  const spec = Math.pow(
    Math.max(0, normal[0] * half[0] + normal[1] * half[1] + normal[2] * half[2]),
    LIGHT.gloss[name],
  ) * LIGHT.specular[name] * ao;
  return { diffuse, specular: spec };
}

VOX.View = {
  LIGHT, DEFAULTS, camera, shadePoint,
  perspective, orthographic, lookAt, multiply, normalize,
};

})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module === 'object' && module.exports) module.exports = globalThis.VOX;

/* ===== 05-raster.js ====================================================== */

/* ---------------------------------------------------------------------------
   A software rasteriser, so the catalogue can be rendered with no GPU, no
   canvas and no browser at all.

   This is what makes the project headless in the useful sense: `node
   tools/voxel-render.mjs` bakes the contact sheet and the turntable strip from
   the same meshes and the same camera the gallery uses, which is why the test
   image is worth anything. It is also the fallback the gallery falls back to
   when WebGL is unavailable.

   Z-buffered, back-face culled by the world-space normal (no winding
   guesswork), Gouraud-interpolated over baked ambient occlusion, and
   supersampled by an integer factor before the box downsample — which is the
   only antialiasing a voxel model needs, and it keeps the alpha edge clean for
   compositing.
   --------------------------------------------------------------------------- */

(function (root) {
'use strict';

const VOX = root.VOX || (root.VOX = {});
const View = VOX.View;

const DEFAULT = {
  width: 256, height: 256, samples: 2, background: null,
  yaw: 35, pitch: 24, zoom: 1, fov: 26, projection: 'perspective',
};

/**
 * Render a mesh to straight RGBA bytes.
 * Returns { width, height, data } where data is width*height*4, top row first.
 */
function render(mesh, options = {}) {
  const o = Object.assign({}, DEFAULT, options);
  const samples = Math.max(1, Math.min(4, Math.round(o.samples)));
  const W = Math.max(1, Math.round(o.width * samples));
  const H = Math.max(1, Math.round(o.height * samples));

  const cam = View.camera(mesh.bounds, {
    width: o.width, height: o.height, yaw: o.yaw, pitch: o.pitch,
    zoom: o.zoom, fov: o.fov, projection: o.projection, pivot: o.pivot,
  });
  const m = cam.viewProjection;
  const eye = cam.eye;

  const count = mesh.count;
  const sx = new Float32Array(count), sy = new Float32Array(count), sz = new Float32Array(count);
  const ok = new Uint8Array(count);
  const vr = new Float32Array(count), vg = new Float32Array(count), vb = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const px = mesh.position[i * 3], py = mesh.position[i * 3 + 1], pz = mesh.position[i * 3 + 2];
    const cw = m[3] * px + m[7] * py + m[11] * pz + m[15];
    if (cw <= 1e-6) { ok[i] = 0; continue; }
    const cx = m[0] * px + m[4] * py + m[8] * pz + m[12];
    const cy = m[1] * px + m[5] * py + m[9] * pz + m[13];
    const cz = m[2] * px + m[6] * py + m[10] * pz + m[14];
    sx[i] = (cx / cw * 0.5 + 0.5) * W;
    sy[i] = (0.5 - cy / cw * 0.5) * H;
    sz[i] = cz / cw;
    ok[i] = 1;

    const nx = mesh.normal[i * 3], ny = mesh.normal[i * 3 + 1], nz = mesh.normal[i * 3 + 2];
    let dx = eye[0] - px, dy = eye[1] - py, dz = eye[2] - pz;
    const len = Math.hypot(dx, dy, dz) || 1;
    dx /= len; dy /= len; dz /= len;
    const lit = View.shadePoint([nx, ny, nz], mesh.light[i], mesh.material[i], [dx, dy, dz]);
    const spec = lit.specular * 255;
    vr[i] = mesh.color[i * 3] * lit.diffuse + spec;
    vg[i] = mesh.color[i * 3 + 1] * lit.diffuse + spec;
    vb[i] = mesh.color[i * 3 + 2] * lit.diffuse + spec;
  }

  const pixels = new Float32Array(W * H * 3);
  const alpha = new Uint8Array(W * H);
  const depth = new Float32Array(W * H).fill(Infinity);

  let bgR = 0, bgG = 0, bgB = 0, bgA = 0;
  if (o.background !== null && o.background !== undefined) {
    const c = VOX.util.rgb(o.background);
    bgR = (c >> 16) & 255; bgG = (c >> 8) & 255; bgB = c & 255; bgA = 255;
    for (let i = 0; i < W * H; i++) { pixels[i * 3] = bgR; pixels[i * 3 + 1] = bgG; pixels[i * 3 + 2] = bgB; }
    alpha.fill(255);
  }

  for (let t = 0; t < count; t += 3) {
    if (!ok[t] || !ok[t + 1] || !ok[t + 2]) continue;

    /* Cull by the face normal against the eye — independent of winding. */
    const nx = mesh.normal[t * 3], ny = mesh.normal[t * 3 + 1], nz = mesh.normal[t * 3 + 2];
    const facing = nx * (eye[0] - mesh.position[t * 3])
      + ny * (eye[1] - mesh.position[t * 3 + 1])
      + nz * (eye[2] - mesh.position[t * 3 + 2]);
    if (facing <= 0) continue;

    const x0 = sx[t], y0 = sy[t], x1 = sx[t + 1], y1 = sy[t + 1], x2 = sx[t + 2], y2 = sy[t + 2];
    const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    if (Math.abs(area) < 1e-9) continue;
    const inv = 1 / area;

    let minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
    let maxX = Math.min(W - 1, Math.ceil(Math.max(x0, x1, x2)));
    let minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
    let maxY = Math.min(H - 1, Math.ceil(Math.max(y0, y1, y2)));
    if (minX > maxX || minY > maxY) continue;

    for (let y = minY; y <= maxY; y++) {
      const py = y + 0.5;
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5;
        let w0 = ((x1 - px) * (y2 - py) - (x2 - px) * (y1 - py)) * inv;
        let w1 = ((x2 - px) * (y0 - py) - (x0 - px) * (y2 - py)) * inv;
        let w2 = 1 - w0 - w1;
        if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;

        const z = w0 * sz[t] + w1 * sz[t + 1] + w2 * sz[t + 2];
        const index = y * W + x;
        if (z >= depth[index]) continue;
        depth[index] = z;
        pixels[index * 3] = w0 * vr[t] + w1 * vr[t + 1] + w2 * vr[t + 2];
        pixels[index * 3 + 1] = w0 * vg[t] + w1 * vg[t + 1] + w2 * vg[t + 2];
        pixels[index * 3 + 2] = w0 * vb[t] + w1 * vb[t + 1] + w2 * vb[t + 2];
        alpha[index] = 255;
      }
    }
  }

  /* Box downsample, premultiplied so transparent pixels do not bleed black. */
  const outW = Math.round(o.width), outH = Math.round(o.height);
  const data = new Uint8ClampedArray(outW * outH * 4);
  const area = samples * samples;
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      let r = 0, g = 0, b = 0, a = 0, hits = 0;
      for (let j = 0; j < samples; j++) {
        for (let i = 0; i < samples; i++) {
          const index = (y * samples + j) * W + (x * samples + i);
          if (!alpha[index]) continue;
          r += pixels[index * 3]; g += pixels[index * 3 + 1]; b += pixels[index * 3 + 2];
          a += alpha[index]; hits++;
        }
      }
      const out = (y * outW + x) * 4;
      if (!hits) { data[out] = data[out + 1] = data[out + 2] = data[out + 3] = 0; continue; }
      data[out] = r / hits; data[out + 1] = g / hits; data[out + 2] = b / hits;
      data[out + 3] = a / area;
    }
  }
  return { width: outW, height: outH, data, camera: cam };
}

/** Paste one image into another — how the contact sheet is assembled. */
function blit(target, source, dx, dy) {
  for (let y = 0; y < source.height; y++) {
    const ty = dy + y;
    if (ty < 0 || ty >= target.height) continue;
    for (let x = 0; x < source.width; x++) {
      const tx = dx + x;
      if (tx < 0 || tx >= target.width) continue;
      const s = (y * source.width + x) * 4, d = (ty * target.width + tx) * 4;
      const sa = source.data[s + 3] / 255;
      if (sa <= 0) continue;
      const da = target.data[d + 3] / 255;
      const outA = sa + da * (1 - sa);
      for (let c = 0; c < 3; c++) {
        target.data[d + c] = (source.data[s + c] * sa + target.data[d + c] * da * (1 - sa)) / (outA || 1);
      }
      target.data[d + 3] = outA * 255;
    }
  }
  return target;
}

function image(width, height, background) {
  const data = new Uint8ClampedArray(width * height * 4);
  if (background !== undefined && background !== null) {
    const c = VOX.util.rgb(background);
    for (let i = 0; i < width * height; i++) {
      data[i * 4] = (c >> 16) & 255; data[i * 4 + 1] = (c >> 8) & 255;
      data[i * 4 + 2] = c & 255; data[i * 4 + 3] = 255;
    }
  }
  return { width, height, data };
}

/** Flat filled rectangle — sheet backgrounds and separators. */
function rect(target, x0, y0, w, h, color, alphaValue = 1) {
  const c = VOX.util.rgb(color);
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  for (let y = Math.max(0, y0); y < Math.min(target.height, y0 + h); y++) {
    for (let x = Math.max(0, x0); x < Math.min(target.width, x0 + w); x++) {
      const d = (y * target.width + x) * 4;
      target.data[d] = target.data[d] * (1 - alphaValue) + r * alphaValue;
      target.data[d + 1] = target.data[d + 1] * (1 - alphaValue) + g * alphaValue;
      target.data[d + 2] = target.data[d + 2] * (1 - alphaValue) + b * alphaValue;
      target.data[d + 3] = Math.max(target.data[d + 3], 255 * alphaValue);
    }
  }
  return target;
}

VOX.Raster = { render, blit, image, rect, DEFAULT };
VOX.render = render;

})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module === 'object' && module.exports) module.exports = globalThis.VOX;

/* ===== 06-catalog.js ===================================================== */

/* ---------------------------------------------------------------------------
   The registry, and the kit every generator is cut from.

   A model in this project is a *recipe*, not data: a function that receives an
   empty model and fills it. That is what makes the catalogue diffable, seedable
   and small — seventy models cost about as much as one hand-placed one — and it
   is why the gallery can show you the source of anything you are looking at.

   `VOX.define()` registers a recipe. `VOX.build(name)` runs it against a fresh
   model, grounds the result (feet on y = 0, centred on x and z) and hands it
   back. Nothing is cached, so building twice is the cheapest possible test
   that a recipe is deterministic.

   The kit below is the shared vocabulary: a humanoid, a quadruped, a bird, a
   tree, a rock, a building shell. Anything two categories would otherwise both
   invent lives here, which is the only reason a knight and a villager read as
   coming from the same world.
   --------------------------------------------------------------------------- */

(function (root) {
'use strict';

const VOX = root.VOX || (root.VOX = {});
const P = VOX.palette;
const { shade, mix, hash01 } = VOX.util;

const registry = new Map();
const CATEGORIES = [
  ['characters', 'Characters', 'People, and things shaped like people.'],
  ['animals', 'Animals', 'Companions, mounts, livestock and monsters.'],
  ['weapons', 'Weapons', 'Held things, sized to a character’s hand.'],
  ['items', 'Items', 'Pickups, loot and inventory art.'],
  ['furniture', 'Furniture', 'What goes inside a building.'],
  ['scenery', 'Scenery', 'Props that dress a level.'],
  ['buildings', 'Buildings', 'Structures with a footprint you can walk around.'],
  ['vehicles', 'Vehicles', 'Things that move, and things you ride.'],
  ['backdrops', 'Backdrops', 'Large, low-detail set dressing for the far plane.'],
];

/** Register a recipe. Later definitions of the same name replace earlier ones. */
function define(spec) {
  if (!spec || !spec.name || typeof spec.build !== 'function') {
    throw new TypeError('VOX.define needs { name, build }');
  }
  const entry = {
    name: spec.name,
    title: spec.title || spec.name.replace(/(^|-)(\w)/g, (_, d, c) => (d ? ' ' : '') + c.toUpperCase()),
    category: spec.category || 'misc',
    tags: spec.tags || [],
    note: spec.note || '',
    scale: spec.scale || 1,
    build: spec.build,
  };
  registry.set(entry.name, entry);
  return entry;
}

/** Run a recipe. Pass a name, or a recipe object to build something unregistered. */
function build(name, options = {}) {
  const entry = typeof name === 'string' ? registry.get(name) : define(Object.assign({ name: '(scratch)' }, name));
  if (!entry) throw new Error(`VOX: no model named "${name}"`);
  const model = new VOX.Model(entry.name, {
    title: entry.title, category: entry.category, tags: entry.tags,
    note: entry.note, seed: options.seed,
  });
  entry.build(model, kit);
  if (options.ground !== false) model.ground();
  model.recipe = entry;
  return model;
}

const list = filter => Array.from(registry.values()).filter(entry => {
  if (!filter) return true;
  if (filter.category && entry.category !== filter.category) return false;
  if (filter.tag && !entry.tags.includes(filter.tag)) return false;
  return true;
});

const names = () => Array.from(registry.keys());
const get = name => registry.get(name) || null;
const categories = () => CATEGORIES.filter(c => Array.from(registry.values()).some(e => e.category === c[0]));

/* =============================================================== the kit === */

/* --------------------------------------------------------------- humanoid */

/**
 * The shared body. Build the x >= 0 half then mirror, so every character is
 * symmetric by construction and any asymmetry is a deliberate second pass.
 *
 * Proportions are the chunky 1:3 head that reads at 32px and still holds up
 * at 512: legs 0..5, torso 6..12, head 13..18.
 * Returns the anchors accessories hang off.
 */
function humanoid(m, options = {}) {
  const o = Object.assign({
    skin: P.skinTan, top: P.cloth, bottom: P.slate, boots: P.leatherDark,
    sleeve: null, glove: null, hair: null, hairBack: true, eyes: P.ink,
    belt: null, collar: null, bare: false, slim: false, legGap: true,
    headDepth: 3, torsoDepth: 2, faceLight: 0.08,
  }, options);
  const sleeve = o.sleeve || o.top;
  const glove = o.glove || (o.bare ? o.skin : o.skin);
  const half = o.slim ? 2 : 3;

  /* legs */
  m.box(1, 2, -2, half, 5, 1, o.bottom);
  m.box(1, 0, -2, half, 1, 2, o.boots);
  if (!o.legGap) m.box(0, 0, -2, 0, 5, 1, o.bottom);

  /* torso */
  m.box(0, 6, -2, half, 12, 1, o.top);
  if (o.belt) m.box(0, 6, -2, half, 6, 1, o.belt);
  if (o.collar) m.box(0, 12, -2, half, 12, 1, o.collar);

  /* arms: sleeve down to the wrist, then hand */
  m.box(half + 1, 8, -2, half + 2, 12, 1, sleeve);
  m.box(half + 1, 6, -2, half + 2, 7, 1, glove);

  /* head */
  m.box(0, 13, -o.headDepth, 3, 18, o.headDepth - 1, o.skin);
  /* the face catches a touch more light than the sides — cheap, and it reads */
  m.map((color, x, y, z) => (z === o.headDepth - 1 && y >= 13 && y <= 18 && color === VOX.util.rgb(o.skin)
    ? shade(color, 1 + o.faceLight) : color));
  m.box(1, 16, o.headDepth - 1, 2, 16, o.headDepth - 1, o.eyes);

  if (o.hair) {
    m.box(0, 19, -o.headDepth, 3, 19, o.headDepth - 1, o.hair);
    m.box(0, 17, -o.headDepth - 0, 3, 18, -o.headDepth, o.hair);
    m.box(3, 15, -o.headDepth, 3, 18, o.headDepth - 1, o.hair);
    if (o.hairBack) m.box(0, 13, -o.headDepth, 3, 16, -o.headDepth, o.hair);
    if (o.fringe) m.box(0, 18, o.headDepth - 1, 3, 18, o.headDepth - 1, o.hair);
  }
  return {
    half, handY: 6, handX: half + 2, handZ: 0,
    shoulder: 12, headTop: 19, headY: 16, headDepth: o.headDepth,
  };
}

/** A cloak or cape hanging off the shoulders. Call before mirroring. */
function cape(m, color, options = {}) {
  const o = Object.assign({ top: 12, bottom: 2, half: 4, depth: -3 }, options);
  m.box(0, o.bottom, o.depth, o.half, o.top, o.depth, color);
  m.box(o.half, o.bottom + 1, o.depth, o.half, o.top, o.depth + 1, color);
  return m;
}

/* -------------------------------------------------------------- quadruped */

/**
 * A four-legged body facing +Z. Everything a cat, a horse and a dragon share:
 * barrel, four legs, neck, head, tail. Returns the anchors for horns, wings,
 * saddles and whatever else the caller wants to bolt on.
 */
function quadruped(m, options = {}) {
  const o = Object.assign({
    coat: P.leather, belly: null, hoof: null, snout: null, eyes: P.ink,
    legs: 4, legTop: 5, bodyTop: 10, bodyBack: -6, bodyFront: 4,
    halfWidth: 3, neck: 3, headSize: 3, headDrop: 0, tail: 'stub', ears: 'point',
  }, options);
  const belly = o.belly || shade(o.coat, 1.16);
  const hoof = o.hoof || shade(o.coat, 0.62);
  const snout = o.snout || shade(o.coat, 1.2);
  const bodyBottom = o.legTop + 1;

  /* barrel */
  m.box(0, bodyBottom, o.bodyBack, o.halfWidth, o.bodyTop, o.bodyFront, o.coat);
  m.box(0, bodyBottom, o.bodyBack + 1, o.halfWidth - 1, bodyBottom, o.bodyFront - 1, belly);

  /* legs, front and back */
  const legX = o.halfWidth - 1;
  const frontZ = o.bodyFront - 1, backZ = o.bodyBack + 1;
  for (const z of [frontZ, backZ]) {
    m.box(legX - 1, 1, z - 1, legX, o.legTop, z, o.coat);
    m.box(legX - 1, 0, z - 1, legX, 0, z, hoof);
  }

  /* neck and head, leaning forward */
  const headY = o.bodyTop + o.neck - o.headDrop;
  m.box(0, o.bodyTop, o.bodyFront - 1, o.halfWidth - 1, headY - o.headSize, o.bodyFront, o.coat);
  const hz0 = o.bodyFront - 1, hz1 = o.bodyFront + o.headSize - 1;
  m.box(0, headY - o.headSize, hz0, o.headSize - 1, headY, hz1, o.coat);
  m.box(0, headY - o.headSize, hz1, o.headSize - 2, headY - 1, hz1 + 1, snout);
  m.box(1, headY - 1, hz1, o.headSize - 1, headY - 1, hz1, o.eyes);

  if (o.ears === 'point') {
    m.box(o.headSize - 2, headY + 1, hz0 + 1, o.headSize - 1, headY + 2, hz0 + 2, o.coat);
  } else if (o.ears === 'floppy') {
    m.box(o.headSize - 1, headY - 2, hz0 + 1, o.headSize, headY, hz0 + 2, shade(o.coat, 0.85));
  }

  if (o.tail === 'stub') m.box(0, o.bodyTop - 1, o.bodyBack - 1, 1, o.bodyTop, o.bodyBack - 1, o.coat);
  else if (o.tail === 'long') {
    m.line(0, o.bodyTop, o.bodyBack, 0, o.bodyTop + 3, o.bodyBack - 4, o.coat);
    m.line(1, o.bodyTop, o.bodyBack, 1, o.bodyTop + 3, o.bodyBack - 4, o.coat);
  } else if (o.tail === 'brush') {
    m.box(0, o.bodyTop - 3, o.bodyBack - 2, 1, o.bodyTop, o.bodyBack - 1, shade(o.coat, 0.8));
  }
  return { headY, headZ: hz1, bodyBottom, bodyTop: o.bodyTop, front: o.bodyFront, back: o.bodyBack };
}

/* ------------------------------------------------------------------ trees */

function tree(m, options = {}) {
  const o = Object.assign({
    trunk: P.wood, leaf: P.leaf, height: 14, trunkR: 1.6, canopy: 'round',
    canopyR: 5, seed: 7,
  }, options);
  const top = o.height;
  m.cone(0, 0, 0, top, o.trunkR + 0.6, o.trunkR - 0.4, o.trunk);
  m.grain(0.14, (color, x, y, z) => y < top);

  if (o.canopy === 'round') {
    m.ellipsoid(0, top + o.canopyR - 2, 0, o.canopyR, o.canopyR - 1, o.canopyR, o.leaf);
    m.ellipsoid(-o.canopyR * 0.5, top + 1, o.canopyR * 0.4, o.canopyR * 0.7, o.canopyR * 0.5, o.canopyR * 0.6, o.leaf);
  } else if (o.canopy === 'pine') {
    let r = o.canopyR;
    for (let y = top - 8; y < top + 6 && r > 0.6; y += 2) {
      m.cone(0, 0, y, y + 2, r, r * 0.55, o.leaf);
      r *= 0.78;
    }
    m.box(0, top + 5, 0, 0, top + 6, 0, o.leaf);
  } else if (o.canopy === 'palm') {
    for (let a = 0; a < 6; a++) {
      const angle = (a / 6) * Math.PI * 2 + 0.3;
      const dx = Math.cos(angle), dz = Math.sin(angle);
      for (let i = 0; i <= 6; i++) {
        const y = top + 2 - (i * i) * 0.14;
        m.set(Math.round(dx * i), Math.round(y), Math.round(dz * i), o.leaf);
        if (i > 1) {
          m.set(Math.round(dx * i - dz * 0.9), Math.round(y), Math.round(dz * i + dx * 0.9), o.leaf);
          m.set(Math.round(dx * i + dz * 0.9), Math.round(y), Math.round(dz * i - dx * 0.9), o.leaf);
        }
      }
    }
  }
  /* Two tones of leaf, hashed by position, so the canopy is not a flat blob. */
  const dark = shade(o.leaf, 0.78), light = shade(o.leaf, 1.16);
  const leafColor = VOX.util.rgb(o.leaf);
  m.map((color, x, y, z) => {
    if (color !== leafColor) return color;
    const h = hash01(x, y, z);
    return h < 0.3 ? dark : h > 0.78 ? light : color;
  });
  return m;
}

/** A lumpy rock. `sides` controls how boulder-like versus how crystalline. */
function rock(m, options = {}) {
  const o = Object.assign({ color: P.stone, r: 4, height: null, seed: 3, moss: null }, options);
  const rand = VOX.util.rng(o.seed);
  const ry = o.height || o.r * 0.8;
  m.ellipsoid(0, ry * 0.65, 0, o.r, ry, o.r * 0.9, o.color);
  for (let i = 0; i < 4; i++) {
    m.ellipsoid(
      rand.int(-o.r, o.r) * 0.6, ry * rand(), rand.int(-o.r, o.r) * 0.6,
      o.r * 0.55, ry * 0.5, o.r * 0.5, o.color,
    );
  }
  m.remove(-20, -20, -20, 20, -1, 20);
  m.grain(0.16);
  if (o.moss) m.map((color, x, y, z) => (hash01(x, y + 3, z) < 0.34 && !m.has(x, y + 1, z) ? o.moss : color));
  return m;
}

/* -------------------------------------------------------------- buildings */

/**
 * Walls, floor, roof and openings for anything with a door. Returns the
 * interior extents so the caller can furnish it.
 */
function shell(m, options = {}) {
  const o = Object.assign({
    w: 9, d: 8, h: 7, wall: P.canvasCloth, trim: P.woodDark, floor: P.plank,
    roof: 'gable', roofColor: P.tile, base: null, door: true, doorColor: P.woodDark,
    windows: true, glass: P.glassPane, overhang: 1,
  }, options);
  const hx = Math.floor(o.w / 2), hz = Math.floor(o.d / 2);

  if (o.base) m.box(-hx - 1, 0, -hz - 1, hx + 1, 0, hz + 1, o.base);
  const y0 = o.base ? 1 : 0;
  m.box(-hx, y0, -hz, hx, y0, hz, o.floor);
  m.boxShell(-hx, y0, -hz, hx, y0 + o.h, hz, o.wall);
  m.remove(-hx + 1, y0 + o.h, -hz + 1, hx - 1, y0 + o.h, hz - 1);
  /* corner posts */
  for (const x of [-hx, hx]) for (const z of [-hz, hz]) m.box(x, y0, z, x, y0 + o.h, z, o.trim);

  if (o.door) {
    m.box(-1, y0 + 1, hz, 1, y0 + 3, hz, o.doorColor);
    m.box(-1, y0 + 4, hz, 1, y0 + 4, hz, o.trim);
  }
  if (o.windows) {
    for (const z of [-hz, hz]) {
      const skip = z === hz && o.door;
      if (!skip) m.box(-1, y0 + 3, z, 1, y0 + 4, z, o.glass, VOX.MATERIAL.GLASS);
      else {
        m.box(-hx + 2, y0 + 3, z, -hx + 3, y0 + 4, z, o.glass, VOX.MATERIAL.GLASS);
        m.box(hx - 3, y0 + 3, z, hx - 2, y0 + 4, z, o.glass, VOX.MATERIAL.GLASS);
      }
    }
    for (const x of [-hx, hx]) m.box(x, y0 + 3, -1, x, y0 + 4, 1, o.glass, VOX.MATERIAL.GLASS);
  }

  const roofY = y0 + o.h + 1;
  if (o.roof === 'gable') m.gable(-hx, hx, -hz, hz, roofY, o.roofColor, 0, o.overhang);
  else if (o.roof === 'pyramid') m.pyramid(-hx - o.overhang, hx + o.overhang, -hz - o.overhang, hz + o.overhang, roofY, o.roofColor);
  else if (o.roof === 'flat') m.box(-hx - o.overhang, roofY, -hz - o.overhang, hx + o.overhang, roofY, hz + o.overhang, o.roofColor);

  return { hx, hz, y0, roofY, top: roofY, inner: { x: hx - 1, z: hz - 1 } };
}

/* ---------------------------------------------------------------- fittings */

/** A tapered barrel, banded, optionally open at the top. */
function barrel(m, options = {}) {
  const o = Object.assign({ r: 3, h: 7, wood: P.wood, band: P.ironDark, y: 0, open: false, fill: null }, options);
  const radiusAt = y => o.r * (0.86 + Math.sin((y / o.h) * Math.PI) * 0.14);
  for (let y = 0; y <= o.h; y++) m.discY(0, o.y + y, 0, radiusAt(y), o.wood);
  m.discY(0, o.y + 1, 0, radiusAt(1), o.band);
  m.discY(0, o.y + o.h - 1, 0, radiusAt(o.h - 1), o.band);
  if (o.open) {
    /* Scoop the top out from the inside, then drop the contents back in. */
    for (let y = o.h - 3; y <= o.h; y++) {
      for (let x = -o.r; x <= o.r; x++) for (let z = -o.r; z <= o.r; z++) {
        if (x * x + z * z <= (radiusAt(y) - 1) * (radiusAt(y) - 1)) m.clear(x, o.y + y, z);
      }
    }
    if (o.fill) m.discY(0, o.y + o.h - 1, 0, radiusAt(o.h - 1) - 1, o.fill);
  }
  m.grain(0.1);
  return m;
}

/** A flame that reads as one: hot core, warm shell, emissive throughout. */
function flame(m, x, y, z, options = {}) {
  const o = Object.assign({ r: 2, h: 4, hot: P.flameHot, warm: P.flame }, options);
  for (let i = 0; i < o.h; i++) {
    const t = i / o.h;
    m.discY(x, y + i, z, o.r * (1 - t * 0.75), o.warm, VOX.MATERIAL.EMISSIVE);
  }
  m.discY(x, y, z, o.r * 0.55, o.hot, VOX.MATERIAL.EMISSIVE);
  m.set(x, y + o.h, z, o.warm, VOX.MATERIAL.EMISSIVE);
  return m;
}

const kit = {
  P, palette: P, shade, mix, hash01, rng: VOX.util.rng,
  humanoid, cape, quadruped, tree, rock, shell, barrel, flame,
  MATERIAL: VOX.MATERIAL,
};

VOX.define = define;
VOX.build = build;
VOX.list = list;
VOX.names = names;
VOX.get = get;
VOX.categories = categories;
VOX.CATEGORIES = CATEGORIES;
VOX.kit = kit;
VOX.registry = registry;

})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module === 'object' && module.exports) module.exports = globalThis.VOX;

/* ===== 07-export.js ====================================================== */

/* ---------------------------------------------------------------------------
   Getting a model out of here.

   Five formats, chosen for what a small game actually needs:

     json  the native format — diffable, tiny, and what the gallery links to
     obj   with a matching .mtl, for anything that eats meshes
     vox   MagicaVoxel, so a model can be opened and edited by hand
     ply   a single file with vertex colours, for tools that hate .mtl
     png   a rendered image, encoded here rather than by a canvas, so the
           same call works in Node with no dependencies

   The PNG encoder takes a `deflate` function. Node passes `zlib.deflateSync`;
   in the browser nothing is passed and it falls back to stored (uncompressed)
   deflate blocks, which is a valid zlib stream every decoder accepts — larger
   on disk, but it means the library never needs a compression dependency.
   --------------------------------------------------------------------------- */

(function (root) {
'use strict';

const VOX = root.VOX || (root.VOX = {});
const { hex, red, green, blue } = VOX.util;

/* -------------------------------------------------------------------- json */

const toJSON = model => model.toJSON();
const toJSONText = (model, pretty = false) => JSON.stringify(model.toJSON(), null, pretty ? 2 : 0);

/* --------------------------------------------------------------------- obj */

/** OBJ plus MTL. One material per distinct colour; faces come from the mesher. */
function toOBJ(model, options = {}) {
  const name = options.name || model.name;
  const mesh = VOX.mesh(model, { greedy: options.greedy !== false, ao: false });
  const materials = new Map();
  const lines = [`# ${name} — built by the voxel maker`, `mtllib ${name}.mtl`, `o ${name}`];
  const faces = [];

  /* Vertices are deduplicated on their exact integer position. */
  const index = new Map();
  const vertexLines = [];
  const vertexIndex = (x, y, z) => {
    const k = `${x},${y},${z}`;
    let i = index.get(k);
    if (i === undefined) {
      vertexLines.push(`v ${x} ${y} ${z}`);
      i = vertexLines.length;
      index.set(k, i);
    }
    return i;
  };

  for (let t = 0; t < mesh.count; t += 3) {
    const color = (mesh.color[t * 3] << 16) | (mesh.color[t * 3 + 1] << 8) | mesh.color[t * 3 + 2];
    if (!materials.has(color)) materials.set(color, `c${hex(color).slice(1)}`);
    const ids = [];
    for (let i = 0; i < 3; i++) {
      ids.push(vertexIndex(mesh.position[(t + i) * 3], mesh.position[(t + i) * 3 + 1], mesh.position[(t + i) * 3 + 2]));
    }
    faces.push({ material: materials.get(color), ids });
  }

  lines.push(...vertexLines);
  let current = null;
  for (const face of faces) {
    if (face.material !== current) { lines.push(`usemtl ${face.material}`); current = face.material; }
    lines.push(`f ${face.ids[0]} ${face.ids[1]} ${face.ids[2]}`);
  }

  const mtl = [`# ${name}`];
  for (const [color, id] of materials) {
    mtl.push(`newmtl ${id}`, `Kd ${(red(color) / 255).toFixed(4)} ${(green(color) / 255).toFixed(4)} ${(blue(color) / 255).toFixed(4)}`, 'Ka 0 0 0', 'Ks 0 0 0', 'illum 1', '');
  }
  return { obj: lines.join('\n') + '\n', mtl: mtl.join('\n') + '\n' };
}

/* --------------------------------------------------------------------- ply */

function toPLY(model) {
  const mesh = VOX.mesh(model, { ao: true });
  const header = [
    'ply', 'format ascii 1.0', `comment ${model.name} — voxel maker`,
    `element vertex ${mesh.count}`,
    'property float x', 'property float y', 'property float z',
    'property uchar red', 'property uchar green', 'property uchar blue',
    `element face ${mesh.count / 3}`, 'property list uchar int vertex_index', 'end_header',
  ];
  const body = [];
  for (let i = 0; i < mesh.count; i++) {
    body.push(`${mesh.position[i * 3]} ${mesh.position[i * 3 + 1]} ${mesh.position[i * 3 + 2]} ${mesh.color[i * 3]} ${mesh.color[i * 3 + 1]} ${mesh.color[i * 3 + 2]}`);
  }
  for (let f = 0; f < mesh.count; f += 3) body.push(`3 ${f} ${f + 1} ${f + 2}`);
  return header.concat(body).join('\n') + '\n';
}

/* --------------------------------------------------------------------- vox */

/** Quantise to at most 255 colours by frequency, mapping the rest to the nearest. */
function quantise(model, limit = 255) {
  const palette = model.palette();
  const keep = palette.slice(0, limit).map(entry => entry.color);
  if (palette.length <= limit) return { palette: keep, map: new Map(keep.map((c, i) => [c, i])) };
  const map = new Map(keep.map((c, i) => [c, i]));
  for (const { color } of palette.slice(limit)) {
    let best = 0, bestDistance = Infinity;
    for (let i = 0; i < keep.length; i++) {
      const dr = red(color) - red(keep[i]), dg = green(color) - green(keep[i]), db = blue(color) - blue(keep[i]);
      const d = dr * dr * 2 + dg * dg * 3 + db * db;
      if (d < bestDistance) { bestDistance = d; best = i; }
    }
    map.set(color, best);
  }
  return { palette: keep, map };
}

/**
 * MagicaVoxel .vox. Their axes are X right, Y depth, Z up, so ours rotate in:
 * vox(x, y, z) = (our x, -our z, our y), shifted to be non-negative.
 */
function toVOX(model) {
  const bounds = model.bounds();
  const voxels = model.voxels();
  const { palette, map } = quantise(model);
  const size = [bounds.size[0], bounds.size[2], bounds.size[1]];

  const chunks = [];
  const chunk = (id, content, children = []) => {
    const childBytes = children.reduce((n, c) => n + c.length, 0);
    const head = new Uint8Array(12 + content.length + childBytes);
    const view = new DataView(head.buffer);
    for (let i = 0; i < 4; i++) head[i] = id.charCodeAt(i);
    view.setInt32(4, content.length, true);
    view.setInt32(8, childBytes, true);
    head.set(content, 12);
    let offset = 12 + content.length;
    for (const c of children) { head.set(c, offset); offset += c.length; }
    return head;
  };

  const sizeContent = new Uint8Array(12);
  new DataView(sizeContent.buffer).setInt32(0, size[0], true);
  new DataView(sizeContent.buffer).setInt32(4, size[1], true);
  new DataView(sizeContent.buffer).setInt32(8, size[2], true);
  chunks.push(chunk('SIZE', sizeContent));

  const xyzi = new Uint8Array(4 + voxels.length * 4);
  new DataView(xyzi.buffer).setInt32(0, voxels.length, true);
  voxels.forEach((v, i) => {
    const at = 4 + i * 4;
    xyzi[at] = v.x - bounds.min[0];
    xyzi[at + 1] = bounds.max[2] - v.z;
    xyzi[at + 2] = v.y - bounds.min[1];
    xyzi[at + 3] = (map.get(v.color) || 0) + 1;
  });
  chunks.push(chunk('XYZI', xyzi));

  const rgba = new Uint8Array(1024);
  for (let i = 0; i < 256; i++) {
    const color = palette[i] === undefined ? 0 : palette[i];
    rgba[i * 4] = red(color); rgba[i * 4 + 1] = green(color); rgba[i * 4 + 2] = blue(color);
    rgba[i * 4 + 3] = palette[i] === undefined ? 0 : 255;
  }
  chunks.push(chunk('RGBA', rgba));

  const main = chunk('MAIN', new Uint8Array(0), chunks);
  const out = new Uint8Array(8 + main.length);
  out.set([0x56, 0x4f, 0x58, 0x20], 0);                       // "VOX "
  new DataView(out.buffer).setInt32(4, 150, true);
  out.set(main, 8);
  return out;
}

/* --------------------------------------------------------------------- png */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes, start = 0, end = bytes.length) {
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ bytes[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(bytes) {
  let a = 1, b = 0;
  for (let i = 0; i < bytes.length; i++) {
    a = (a + bytes[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

/** Valid zlib with stored blocks — no compression, no dependency. */
function zlibStored(bytes) {
  const blocks = Math.max(1, Math.ceil(bytes.length / 65535));
  const out = new Uint8Array(2 + blocks * 5 + bytes.length + 4);
  out[0] = 0x78; out[1] = 0x01;
  let at = 2, from = 0;
  for (let i = 0; i < blocks; i++) {
    const size = Math.min(65535, bytes.length - from);
    out[at++] = i === blocks - 1 ? 1 : 0;
    out[at++] = size & 255; out[at++] = size >>> 8;
    out[at++] = ~size & 255; out[at++] = (~size >>> 8) & 255;
    out.set(bytes.subarray(from, from + size), at);
    at += size; from += size;
  }
  const sum = adler32(bytes);
  out[at++] = (sum >>> 24) & 255; out[at++] = (sum >>> 16) & 255;
  out[at++] = (sum >>> 8) & 255; out[at++] = sum & 255;
  return out;
}

/**
 * Encode { width, height, data } as a PNG.
 * `deflate` is optional: pass zlib.deflateSync in Node for a smaller file.
 */
function toPNG(image, deflate) {
  const { width, height, data } = image;
  const raw = new Uint8Array(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    const at = y * (width * 4 + 1);
    raw[at] = 0;                                             // filter: none
    raw.set(data.subarray(y * width * 4, (y + 1) * width * 4), at + 1);
  }
  const compressed = deflate ? new Uint8Array(deflate(Buffer.from(raw))) : zlibStored(raw);

  const chunks = [];
  const chunk = (type, body) => {
    const out = new Uint8Array(12 + body.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, body.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(body, 8);
    view.setUint32(8 + body.length, crc32(out, 4, 8 + body.length));
    chunks.push(out);
  };

  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width); view.setUint32(4, height);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  chunk('IHDR', ihdr);
  chunk('IDAT', compressed);
  chunk('IEND', new Uint8Array(0));

  const size = chunks.reduce((n, c) => n + c.length, 8);
  const png = new Uint8Array(size);
  png.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  let at = 8;
  for (const c of chunks) { png.set(c, at); at += c.length; }
  return png;
}

/* ------------------------------------------------------------------ browser */

/** Hand a blob to the user. No-op outside a browser. */
function download(filename, content, type = 'application/octet-stream') {
  if (typeof document === 'undefined') return false;
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

VOX.Export = { toJSON, toJSONText, toOBJ, toPLY, toVOX, toPNG, quantise, crc32, adler32, zlibStored, download };

})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module === 'object' && module.exports) module.exports = globalThis.VOX;

/* ===== 08-webgl.js ======================================================= */

/* ---------------------------------------------------------------------------
   The WebGL2 renderer.

   One context for the whole page, not one per model. A gallery of eighty
   models cannot have eighty WebGL contexts — browsers cap it around sixteen
   and silently drop the oldest — so this renders into a single offscreen
   canvas and the caller blits the result into whatever 2D canvas the tile
   owns. That also means tiles cost a `drawImage` each rather than a context.

   The lighting is deliberately duplicated from 04-view.js rather than shared:
   the vertex shader has to do it in GLSL. If you change the rig there, change
   it here, or the baked sheets in voxel/assets stop matching the page — which
   is exactly what tools/voxel-check.mjs exists to catch.

   Falls back to the software rasteriser when WebGL2 is missing.
   --------------------------------------------------------------------------- */

(function (root) {
'use strict';

const VOX = root.VOX || (root.VOX = {});
const View = VOX.View;

const VERTEX = `#version 300 es
precision highp float;

in vec3 aPosition;
in vec3 aNormal;
in vec3 aColor;
in float aLight;
in float aMaterial;

uniform mat4 uViewProjection;
uniform vec3 uEye;
uniform vec3 uKey;
uniform vec3 uFill;
uniform vec4 uRig;          // ambient, key strength, fill strength, unused

out vec3 vColor;

const vec4 SPECULAR = vec4(0.06, 0.0, 0.42, 0.30);
const vec4 GLOSS    = vec4(8.0,  1.0, 26.0, 40.0);

void main() {
  int material = int(aMaterial + 0.5);
  vec3 normal = aNormal;
  vec3 viewDir = normalize(uEye - aPosition);
  float key = max(dot(normal, uKey), 0.0);
  float fill = max(dot(normal, uFill), 0.0);

  float diffuse = uRig.x + key * uRig.y + fill * uRig.z;
  if (material == 3) diffuse = diffuse * 0.72 + 0.42;
  diffuse *= aLight;

  vec3 halfway = normalize(uKey + viewDir);
  float specular = pow(max(dot(normal, halfway), 0.0), GLOSS[material]) * SPECULAR[material] * aLight;

  if (material == 1) {                       // emissive: nearly unlit, still shaped
    diffuse = (0.94 + key * 0.16) * (0.86 + aLight * 0.14);
    specular = 0.05;
  }

  vColor = aColor * diffuse + specular;
  gl_Position = uViewProjection * vec4(aPosition, 1.0);
}`;

const FRAGMENT = `#version 300 es
precision highp float;
in vec3 vColor;
out vec4 fragColor;
void main() { fragColor = vec4(clamp(vColor, 0.0, 1.0), 1.0); }`;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`voxel: shader failed to compile — ${log}`);
  }
  return shader;
}

class Renderer {
  constructor(options = {}) {
    this.canvas = options.canvas || document.createElement('canvas');
    this.canvas.width = options.width || 512;
    this.canvas.height = options.height || 512;
    const gl = this.canvas.getContext('webgl2', {
      alpha: true, antialias: true, premultipliedAlpha: false,
      preserveDrawingBuffer: true, powerPreference: 'low-power',
    });
    if (!gl) throw new Error('voxel: no WebGL2');
    this.gl = gl;

    const program = gl.createProgram();
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`voxel: program failed to link — ${gl.getProgramInfoLog(program)}`);
    }
    this.program = program;
    this.attribute = {
      position: gl.getAttribLocation(program, 'aPosition'),
      normal: gl.getAttribLocation(program, 'aNormal'),
      color: gl.getAttribLocation(program, 'aColor'),
      light: gl.getAttribLocation(program, 'aLight'),
      material: gl.getAttribLocation(program, 'aMaterial'),
    };
    this.uniform = {
      viewProjection: gl.getUniformLocation(program, 'uViewProjection'),
      eye: gl.getUniformLocation(program, 'uEye'),
      key: gl.getUniformLocation(program, 'uKey'),
      fill: gl.getUniformLocation(program, 'uFill'),
      rig: gl.getUniformLocation(program, 'uRig'),
    };

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.frontFace(gl.CCW);
    gl.clearColor(0, 0, 0, 0);

    /* Uploaded meshes, most-recently-used last. Anything past the limit is
       deleted rather than left for the driver to hold on to. */
    this.uploads = new Map();
    this.limit = options.cache || 40;
  }

  size(width, height) {
    const w = Math.max(1, Math.round(width)), h = Math.max(1, Math.round(height));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
    }
    return this;
  }

  upload(key, mesh) {
    const gl = this.gl;
    let entry = this.uploads.get(key);
    if (entry && entry.count === mesh.count) {
      this.uploads.delete(key); this.uploads.set(key, entry);   // touch
      return entry;
    }
    if (entry) this.release(key);

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buffers = [];
    const bind = (location, data, size, type, normalize) => {
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, size, type, normalize, 0, 0);
      buffers.push(buffer);
    };
    bind(this.attribute.position, mesh.position, 3, gl.FLOAT, false);
    bind(this.attribute.normal, mesh.normal, 3, gl.FLOAT, false);
    bind(this.attribute.color, mesh.color, 3, gl.UNSIGNED_BYTE, true);
    bind(this.attribute.light, mesh.light, 1, gl.FLOAT, false);
    bind(this.attribute.material, mesh.material, 1, gl.FLOAT, false);
    gl.bindVertexArray(null);

    entry = { vao, buffers, count: mesh.count, bounds: mesh.bounds };
    this.uploads.set(key, entry);
    while (this.uploads.size > this.limit) this.release(this.uploads.keys().next().value);
    return entry;
  }

  release(key) {
    const entry = this.uploads.get(key);
    if (!entry) return;
    const gl = this.gl;
    gl.deleteVertexArray(entry.vao);
    for (const buffer of entry.buffers) gl.deleteBuffer(buffer);
    this.uploads.delete(key);
  }

  /** Draw one mesh. `key` identifies the mesh for buffer reuse across frames. */
  draw(key, mesh, options = {}) {
    const gl = this.gl;
    const width = options.width || this.canvas.width;
    const height = options.height || this.canvas.height;
    this.size(width, height);
    const entry = this.upload(key, mesh);
    const cam = View.camera(mesh.bounds, Object.assign({}, options, { width, height }));

    gl.viewport(0, 0, width, height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.uniform.viewProjection, false, cam.viewProjection);
    gl.uniform3fv(this.uniform.eye, cam.eye);
    gl.uniform3fv(this.uniform.key, View.LIGHT.key);
    gl.uniform3fv(this.uniform.fill, View.LIGHT.fill);
    gl.uniform4f(this.uniform.rig, View.LIGHT.ambient, View.LIGHT.keyStrength, View.LIGHT.fillStrength, 0);
    gl.bindVertexArray(entry.vao);
    gl.drawArrays(gl.TRIANGLES, 0, entry.count);
    gl.bindVertexArray(null);
    return cam;
  }

  dispose() {
    for (const key of Array.from(this.uploads.keys())) this.release(key);
    this.gl.deleteProgram(this.program);
  }
}

let shared = null;
let sharedFailed = false;

/** The page-wide renderer. Returns null once WebGL2 has been ruled out. */
function sharedRenderer() {
  if (shared || sharedFailed) return shared;
  try {
    shared = new Renderer({ width: 512, height: 512 });
  } catch (error) {
    sharedFailed = true;
    if (typeof console !== 'undefined') console.warn('voxel: falling back to the software renderer —', error.message);
  }
  return shared;
}

VOX.GL = { Renderer, shared: sharedRenderer, available: () => !!sharedRenderer() };

})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ===== 09-viewer.js ====================================================== */

/* ---------------------------------------------------------------------------
   The turntable.

   Attach one to a <canvas> and you get a model you can spin: drag to orbit,
   wheel or pinch to zoom, arrow keys when it has focus, and an idle spin that
   starts again a moment after you let go. This is the piece a game page would
   actually reuse — the gallery is just eighty of them in a grid.

   Three things keep eighty of them cheap:
     · one shared requestAnimationFrame loop drives every viewer, so the page
       has one frame budget rather than eighty competing ones;
     · an IntersectionObserver parks anything scrolled off screen — parked
       viewers cost nothing at all;
     · a viewer only redraws when something changed, so a still model with the
       spin turned off costs one frame and then nothing.

   Reduced-motion is honoured: the idle spin never starts, and dragging still
   works, because turning a model by hand is the point of the page.
   --------------------------------------------------------------------------- */

(function (root) {
'use strict';

const VOX = root.VOX || (root.VOX = {});
if (typeof window === 'undefined') return;

const meshes = new Map();
/** Build (and remember) the mesh for a model. Keyed by name, so rebuilds reuse. */
function meshFor(model, key) {
  const id = key || model.name;
  let mesh = meshes.get(id);
  if (!mesh || mesh.voxels !== model.cells.size) {
    mesh = VOX.mesh(model);
    meshes.set(id, mesh);
  }
  return mesh;
}

const reduceMotion = window.matchMedia
  ? window.matchMedia('(prefers-reduced-motion: reduce)')
  : { matches: false };

const active = new Set();
let frame = 0;
let last = 0;

function tick(now) {
  frame = 0;
  const dt = last ? Math.min(0.1, (now - last) / 1000) : 0.016;
  last = now;
  let wants = false;
  for (const viewer of active) {
    if (viewer.update(dt)) wants = true;
  }
  if (wants) schedule();
  else last = 0;
}

function schedule() {
  if (!frame) frame = requestAnimationFrame(tick);
}

const DEFAULTS = {
  yaw: 32, pitch: 22, zoom: 0.94, spin: true, spinSpeed: 22,
  minPitch: -80, maxPitch: 85, minZoom: 0.4, maxZoom: 4,
  resumeAfter: 2.5, maxPixels: 620, interactive: true,
};

class Viewer {
  constructor(canvas, model, options = {}) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.options = Object.assign({}, DEFAULTS, options);
    this.yaw = this.options.yaw;
    this.pitch = this.options.pitch;
    this.zoom = this.options.zoom;
    this.spin = this.options.spin && !reduceMotion.matches;
    this.dirty = true;
    this.visible = true;
    this.idle = this.options.resumeAfter;
    this.dragging = false;
    this.pointers = new Map();
    this.pinch = 0;
    this.setModel(model, options.meshKey);

    if (this.options.interactive) this.bind();
    if (typeof IntersectionObserver === 'function') {
      this.observer = new IntersectionObserver(entries => {
        for (const entry of entries) this.visible = entry.isIntersecting;
        if (this.visible) { this.dirty = true; schedule(); }
      }, { rootMargin: '160px' });
      this.observer.observe(canvas);
    }
    active.add(this);
    schedule();
  }

  setModel(model, key) {
    this.model = model;
    this.mesh = meshFor(model, key);
    this.dirty = true;
    schedule();
    return this;
  }

  /** Point the camera at a named face of the model. */
  face(name) {
    const angles = {
      front: [0, 12], back: [180, 12], left: [-90, 12], right: [90, 12],
      top: [32, 78], bottom: [32, -60], corner: [32, 22],
    };
    const [yaw, pitch] = angles[name] || angles.corner;
    this.yaw = yaw; this.pitch = pitch;
    this.dirty = true; this.idle = 0;
    schedule();
    return this;
  }

  reset() {
    this.yaw = this.options.yaw; this.pitch = this.options.pitch;
    this.zoom = this.options.zoom;
    this.dirty = true; schedule();
    return this;
  }

  /* --------------------------------------------------------------- input */

  bind() {
    const canvas = this.canvas;
    canvas.style.touchAction = 'none';
    if (!canvas.hasAttribute('tabindex')) canvas.tabIndex = 0;

    this.onDown = event => {
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      this.dragging = true;
      this.idle = 0;
      canvas.setPointerCapture(event.pointerId);
      canvas.classList.add('is-dragging');
    };
    this.onMove = event => {
      const previous = this.pointers.get(event.pointerId);
      if (!previous) return;
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (this.pointers.size >= 2) {
        const [a, b] = Array.from(this.pointers.values());
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        if (this.pinch) this.setZoom(this.zoom * (distance / this.pinch));
        this.pinch = distance;
        return;
      }
      const dx = event.clientX - previous.x, dy = event.clientY - previous.y;
      this.yaw -= dx * 0.55;
      this.pitch = Math.max(this.options.minPitch, Math.min(this.options.maxPitch, this.pitch + dy * 0.45));
      this.dirty = true; this.idle = 0;
      schedule();
    };
    this.onUp = event => {
      this.pointers.delete(event.pointerId);
      if (this.pointers.size < 2) this.pinch = 0;
      if (!this.pointers.size) { this.dragging = false; canvas.classList.remove('is-dragging'); }
      if (canvas.hasPointerCapture && canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
    };
    this.onWheel = event => {
      event.preventDefault();
      this.setZoom(this.zoom * (event.deltaY > 0 ? 0.9 : 1.1));
      this.idle = 0;
    };
    this.onKey = event => {
      const step = event.shiftKey ? 15 : 5;
      const moves = {
        ArrowLeft: () => { this.yaw -= step; }, ArrowRight: () => { this.yaw += step; },
        ArrowUp: () => { this.pitch = Math.min(this.options.maxPitch, this.pitch + step); },
        ArrowDown: () => { this.pitch = Math.max(this.options.minPitch, this.pitch - step); },
        '+': () => this.setZoom(this.zoom * 1.15), '=': () => this.setZoom(this.zoom * 1.15),
        '-': () => this.setZoom(this.zoom / 1.15),
        '0': () => this.reset(),
      };
      const move = moves[event.key];
      if (!move) return;
      event.preventDefault();
      move();
      this.dirty = true; this.idle = 0;
      schedule();
    };

    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', this.onUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('keydown', this.onKey);
  }

  setZoom(value) {
    this.zoom = Math.max(this.options.minZoom, Math.min(this.options.maxZoom, value));
    this.dirty = true;
    schedule();
    return this;
  }

  /* -------------------------------------------------------------- drawing */

  update(dt) {
    if (!this.visible) return false;
    /* `idle` starts spent, so a fresh viewer turns straight away; any input
       resets it, which is what makes the spin pause while you are posing a
       model and pick up again a couple of seconds after you let go. */
    if (this.spin && !this.dragging) {
      this.idle += dt;
      if (this.idle >= this.options.resumeAfter) {
        this.yaw += this.options.spinSpeed * dt;
        this.dirty = true;
      }
    }
    if (this.dirty) { this.render(); this.dirty = false; }
    return this.spin || this.dragging;
  }

  render() {
    const canvas = this.canvas;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    const cssWidth = rect.width || canvas.clientWidth || 200;
    const cssHeight = rect.height || canvas.clientHeight || 200;
    const width = Math.min(this.options.maxPixels, Math.round(cssWidth * ratio));
    const height = Math.min(this.options.maxPixels, Math.round(cssHeight * ratio));
    if (width < 2 || height < 2) return;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width; canvas.height = height;
    }
    const view = {
      yaw: this.yaw, pitch: this.pitch, zoom: this.zoom,
      width, height, projection: this.options.projection || 'perspective',
    };

    const gl = VOX.GL && VOX.GL.shared();
    this.context.clearRect(0, 0, width, height);
    if (gl) {
      gl.draw(this.model.name, this.mesh, view);
      this.context.drawImage(gl.canvas, 0, 0, width, height, 0, 0, width, height);
    } else {
      /* No WebGL2: the same picture, drawn on the CPU at half resolution. */
      const image = VOX.Raster.render(this.mesh, Object.assign({}, view, {
        width: Math.round(width / 2), height: Math.round(height / 2), samples: 1,
      }));
      const data = new ImageData(new Uint8ClampedArray(image.data), image.width, image.height);
      if (!this.scratch) this.scratch = document.createElement('canvas');
      this.scratch.width = image.width; this.scratch.height = image.height;
      this.scratch.getContext('2d').putImageData(data, 0, 0);
      this.context.imageSmoothingEnabled = true;
      this.context.drawImage(this.scratch, 0, 0, width, height);
    }
  }

  destroy() {
    active.delete(this);
    if (this.observer) this.observer.disconnect();
    const canvas = this.canvas;
    if (this.onDown) {
      canvas.removeEventListener('pointerdown', this.onDown);
      canvas.removeEventListener('pointermove', this.onMove);
      canvas.removeEventListener('pointerup', this.onUp);
      canvas.removeEventListener('pointercancel', this.onUp);
      canvas.removeEventListener('wheel', this.onWheel);
      canvas.removeEventListener('keydown', this.onKey);
    }
  }
}

VOX.Viewer = {
  attach: (canvas, model, options) => new Viewer(canvas, model, options),
  Viewer, meshFor, meshes,
  all: active,
  setSpin(value) { for (const viewer of active) { viewer.spin = value && !reduceMotion.matches; viewer.dirty = true; } schedule(); },
  redraw() { for (const viewer of active) viewer.dirty = true; schedule(); },
};

})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ===== 10-characters.js ================================================== */

/* ---------------------------------------------------------------------------
   Characters.

   Every one of these is the same body from the kit with a different job. They
   are built as the x >= 0 half and mirrored, so symmetry is free; anything
   deliberately lopsided — an eyepatch, one pauldron, a satchel strap — is
   added after the mirror, which is also how you tell at a glance which details
   were meant to be one-sided.

   Scale: 19 voxels to the top of the head, which is one third head, and small
   enough that a party of six costs less than one detailed model.
   --------------------------------------------------------------------------- */

(function (root) {
'use strict';

const VOX = root.VOX;
const P = VOX.palette;
const { shade } = VOX.util;
const M = VOX.MATERIAL;

const character = (name, options, build) => VOX.define(Object.assign(
  { name, category: 'characters', build }, options,
));

/* ------------------------------------------------------------------ knight */

character('knight', { tags: ['hero', 'armour', 'medieval'], note: 'Plate, tabard and a plume. The party leader.' }, (m, kit) => {
  const plate = P.iron, dark = P.ironDark;
  kit.humanoid(m, {
    skin: plate, top: plate, bottom: dark, boots: dark, sleeve: plate,
    eyes: P.black, belt: P.leather, headDepth: 3,
  });
  /* tabard over the breastplate */
  m.box(0, 6, 2, 2, 11, 2, P.clothWarm);
  m.box(0, 7, 2, 0, 11, 2, P.gold);
  /* pauldrons */
  m.box(3, 12, -2, 5, 13, 1, plate);
  m.box(4, 11, -2, 5, 11, 1, dark);
  /* helmet: brow band, visor slit, cheek guards */
  m.box(0, 18, -3, 3, 19, 2, dark);
  m.box(0, 16, 2, 3, 16, 2, P.black);
  m.box(0, 15, 2, 1, 15, 2, dark);
  m.map((c, x, y, z) => (y >= 13 && y <= 19 ? shade(c, 1 + (z + 3) * 0.02) : c));
  m.mirrorX();
  /* the crest, and the nose guard, are single things on the centre line */
  m.box(0, 20, -2, 0, 22, 1, P.clothWarm);
  m.box(0, 21, -3, 0, 23, -1, P.clothWarm);
  m.box(0, 20, 2, 0, 20, 2, P.gold, M.METAL);
  m.box(0, 14, 2, 0, 17, 2, dark);
  m.grain(0.07, (c, x, y, z) => y < 13);
});

/* -------------------------------------------------------------------- mage */

character('mage', { tags: ['magic', 'robe', 'staff'], note: 'Robe, beard and a hat with a slouch.' }, (m, kit) => {
  const robe = P.cloth, trim = P.magic;
  kit.humanoid(m, {
    skin: P.skinPale, top: robe, bottom: robe, boots: P.leatherDark,
    sleeve: robe, legGap: false, belt: P.leather,
  });
  /* the robe flares out below the belt */
  for (let y = 5; y >= 0; y--) m.box(0, y, -3, 3 + Math.floor((5 - y) / 2), y, 2, robe);
  m.box(0, 6, 2, 1, 12, 2, trim);
  /* sleeves widen at the cuff */
  m.box(4, 6, -3, 6, 8, 2, robe);
  /* beard */
  m.box(0, 12, 2, 2, 15, 3, P.silver);
  m.box(0, 15, 3, 2, 15, 3, P.silver);
  m.mirrorX();
  /* hat: brim, then a cone that leans back */
  m.discY(0, 20, 0, 5, robe);
  m.discY(0, 21, 0, 4, robe);
  for (let i = 0; i < 6; i++) m.discY(0, 22 + i, -Math.round(i * 0.4), 3.4 - i * 0.5, i === 2 ? trim : robe);
  m.set(0, 27, -2, P.gold, M.EMISSIVE);
  m.grain(0.06);
});

/* ------------------------------------------------------------------- rogue */

character('rogue', { tags: ['hood', 'cloak', 'stealth'], note: 'Hooded, cloaked, and lighter on their feet than the knight.' }, (m, kit) => {
  const cloth = P.clothGreen, dark = shade(P.clothGreen, 0.7);
  kit.humanoid(m, {
    skin: P.skinTan, top: cloth, bottom: P.leatherDark, boots: P.leatherDark,
    sleeve: dark, belt: P.leather, slim: true, headDepth: 3,
  });
  kit.cape(m, dark, { top: 13, bottom: 3, half: 3, depth: -3 });
  /* hood: a shell around the head, open at the front */
  m.box(0, 13, -4, 4, 20, 3, dark);
  m.remove(0, 14, 1, 3, 18, 3);
  m.box(0, 13, -3, 3, 18, 2, P.shadow);
  m.box(1, 16, 2, 2, 16, 2, P.flameHot, M.EMISSIVE);
  m.mirrorX();
  m.box(0, 20, -1, 0, 21, -3, dark);
  m.grain(0.08);
});

/* --------------------------------------------------------------- villager */

character('villager', { tags: ['npc', 'quest', 'town'], note: 'The one who gives you the quest. Apron, boots, no weapon.' }, (m, kit) => {
  kit.humanoid(m, {
    skin: P.skinPale, top: '#b6553f', bottom: '#4a5a6b', boots: P.leatherDark,
    hair: P.hairBrown, fringe: true, belt: P.leather,
  });
  m.box(0, 6, 2, 2, 10, 2, P.canvasCloth);
  m.box(2, 11, 2, 2, 11, 2, P.canvasCloth);
  m.mirrorX();
  m.grain(0.07);
});

/* -------------------------------------------------------------------- king */

character('king', { tags: ['npc', 'royal', 'crown'], note: 'Crown, ermine collar, and a cape that reaches the floor.' }, (m, kit) => {
  const robe = '#6a2f52';
  kit.humanoid(m, {
    skin: P.skinTan, top: robe, bottom: robe, boots: P.leatherDark,
    hair: P.silver, legGap: false, collar: P.white, belt: P.gold,
  });
  for (let y = 5; y >= 0; y--) m.box(0, y, -3, 3 + Math.floor((5 - y) / 2), y, 2, robe);
  m.box(0, 12, 2, 3, 13, 2, P.white);
  m.box(0, 12, -3, 3, 13, 2, P.white);
  m.box(0, 12, 2, 2, 15, 3, P.silver);
  kit.cape(m, robe, { top: 13, bottom: 0, half: 4, depth: -4 });
  m.mirrorX();
  /* crown: a two-high band that sits inside the head's own width, with four
     points on the diagonals so none of them hides the face */
  for (let x = -3; x <= 3; x++) {
    for (let z = -3; z <= 3; z++) {
      const r = Math.hypot(x, z);
      if (r > 2.1 && r < 3.3) m.box(x, 20, z, x, 21, z, P.gold, M.METAL);
    }
  }
  for (const [x, z] of [[2, 2], [-2, 2], [2, -2], [-2, -2]]) m.set(x, 22, z, P.gold, M.METAL);
  m.set(0, 21, 3, P.ruby, M.EMISSIVE);
  m.grain(0.05);
});

/* ------------------------------------------------------------------- robot */

character('robot', { tags: ['sci-fi', 'metal', 'droid'], note: 'Boxy, riveted, and lit from the inside.' }, (m, kit) => {
  const shellColor = '#9aa6b8', dark = '#4a5464', glow = P.gem;
  kit.humanoid(m, {
    skin: shellColor, top: shellColor, bottom: dark, boots: dark,
    sleeve: dark, eyes: glow, headDepth: 3, legGap: false,
  });
  m.replace(shellColor, shellColor, M.METAL);
  m.replace(dark, dark, M.METAL);
  /* chest panel and its indicator */
  m.box(0, 8, 2, 2, 11, 2, dark, M.METAL);
  m.box(0, 9, 2, 1, 10, 2, glow, M.EMISSIVE);
  /* joints */
  m.box(3, 12, -2, 5, 13, 1, dark, M.METAL);
  m.box(4, 7, -2, 5, 7, 1, dark, M.METAL);
  /* visor rather than eyes */
  m.box(0, 16, 2, 3, 16, 2, glow, M.EMISSIVE);
  m.box(0, 19, -3, 3, 19, 2, dark, M.METAL);
  m.mirrorX();
  m.box(0, 20, 0, 0, 22, 0, dark, M.METAL);
  m.set(0, 23, 0, P.ruby, M.EMISSIVE);
});

/* --------------------------------------------------------------- astronaut */

character('astronaut', { tags: ['sci-fi', 'space', 'suit'], note: 'Pressure suit, gold visor, life support on the back.' }, (m, kit) => {
  const suit = '#e6ebf5', joint = '#b9c2d4', trim = '#3a6fd8';
  kit.humanoid(m, {
    skin: suit, top: suit, bottom: suit, boots: joint, sleeve: suit,
    glove: joint, eyes: P.gold, headDepth: 3, legGap: false, belt: trim,
  });
  m.box(3, 12, -2, 5, 13, 1, joint);
  m.box(0, 6, 2, 1, 8, 2, trim);
  /* helmet: a rounded shell with a gold visor across the front */
  m.ellipsoid(0, 16, 0, 4.6, 4.4, 4.6, suit);
  m.box(0, 14, 2, 3, 18, 4, P.gold, M.METAL);
  m.map((c, x, y, z) => (y >= 12 && y <= 20 && z >= 3 && c === VOX.util.rgb(P.gold) ? shade(c, 1.1) : c));
  /* life support */
  m.box(0, 7, -5, 3, 13, -3, joint);
  m.box(0, 8, -6, 2, 12, -6, trim);
  m.mirrorX();
  m.box(0, 20, -1, 0, 20, 1, trim);
  m.set(2, 9, 3, P.gem, M.EMISSIVE);
});

/* ---------------------------------------------------------------- skeleton */

character('skeleton', { tags: ['undead', 'enemy', 'bone'], note: 'Ribs, a jaw, and two lights where the eyes were.' }, (m, kit) => {
  const bone = '#e4e0cf', dark = '#b3ae99';
  /* No kit body: a skeleton is defined by what is missing. */
  m.box(1, 0, -2, 2, 1, 2, bone);            // feet
  m.box(1, 2, -1, 2, 5, 0, bone);            // shins
  m.box(1, 6, -1, 3, 7, 1, dark);            // pelvis
  for (let y = 8; y <= 12; y += 2) m.box(0, y, -2, 3, y, 1, bone);   // ribs
  m.box(0, 8, -1, 0, 13, 0, dark);           // spine
  m.box(0, 13, -2, 3, 13, 1, bone);          // collar
  m.box(4, 7, -1, 4, 12, 0, bone);           // arms
  m.box(0, 14, -3, 3, 18, 2, bone);          // skull
  m.box(1, 16, 2, 2, 17, 2, P.black);        // sockets
  m.box(0, 14, 2, 2, 14, 2, dark);           // jaw
  m.map((c, x, y, z) => (y === 14 && z === 2 && x % 2 === 1 ? P.black : c));
  m.mirrorX();
  m.box(-1, 16, 3, -1, 16, 3, P.flame, M.EMISSIVE);
  m.box(1, 16, 3, 1, 16, 3, P.flame, M.EMISSIVE);
  m.grain(0.09);
});

/* ------------------------------------------------------------------ pirate */

character('pirate', { tags: ['npc', 'sea', 'hat'], note: 'Coat, sash, tricorn — and the eyepatch goes on after the mirror.' }, (m, kit) => {
  const coat = '#3d4a63', sash = '#b8403f';
  kit.humanoid(m, {
    skin: P.skinTan, top: coat, bottom: '#5b4a38', boots: P.leatherDark,
    sleeve: coat, hair: P.hairBlack, belt: P.leather,
  });
  m.box(0, 6, 2, 2, 12, 2, '#d9d2bd');       // shirt front, under the coat
  m.box(0, 6, 2, 3, 9, 2, sash);
  m.box(3, 6, -2, 3, 12, 2, coat);           // coat skirts
  m.box(0, 12, 2, 2, 13, 2, '#d9d2bd');      // collar
  m.mirrorX();
  /* tricorn */
  m.discY(0, 20, 0, 5, P.ink);
  m.box(-4, 21, -1, 4, 21, 1, P.ink);
  m.box(-1, 21, -4, 1, 22, 3, P.ink);
  m.set(0, 22, 3, P.gold, M.METAL);
  /* one eye, one patch */
  m.box(-2, 16, 3, -1, 16, 3, P.ink);
  m.box(-2, 17, 3, -1, 17, 3, P.ink);
  m.grain(0.07);
});

/* ------------------------------------------------------------------- ninja */

character('ninja', { tags: ['stealth', 'enemy', 'scarf'], note: 'All cloth. The scarf is the only thing that reads at distance.' }, (m, kit) => {
  const suit = '#252b3a', wrap = '#171b26', scarf = '#c0392b';
  kit.humanoid(m, {
    skin: suit, top: suit, bottom: wrap, boots: wrap, sleeve: wrap,
    glove: wrap, eyes: P.white, slim: true, headDepth: 3,
  });
  m.box(0, 6, 2, 2, 7, 2, scarf);
  m.box(0, 13, -3, 3, 15, 2, wrap);          // mask below the eyes
  m.box(0, 12, -3, 3, 13, 2, scarf);         // scarf at the neck
  m.mirrorX();
  /* the scarf tail streams to one side only */
  m.box(-4, 10, -3, -3, 13, -2, scarf);
  m.box(-6, 8, -4, -4, 10, -3, scarf);
  m.grain(0.06);
});

/* ------------------------------------------------------------------ farmer */

character('farmer', { tags: ['npc', 'town', 'hat'], note: 'Straw hat, dungarees, and the shirt sleeves rolled up.' }, (m, kit) => {
  const denim = '#4a6a8c', shirt = '#d8c9a8';
  kit.humanoid(m, {
    skin: P.skinDeep, top: shirt, bottom: denim, boots: P.leatherDark,
    sleeve: shirt, hair: P.hairBlack, belt: null,
  });
  m.box(0, 6, -2, 3, 10, 1, denim);          // dungarees over the shirt
  m.box(1, 11, 2, 2, 12, 2, denim);          // strap
  m.box(4, 6, -2, 5, 7, 1, P.skinDeep);      // rolled sleeve, bare forearm
  m.mirrorX();
  /* straw hat, wide enough to sit on the shoulders visually */
  m.discY(0, 20, 0, 6, P.thatch);
  m.discY(0, 21, 0, 3.4, P.thatch);
  m.discY(0, 22, 0, 2.6, shade(P.thatch, 0.9));
  m.grain(0.09);
});

})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ===== 11-animals.js ===================================================== */

/* ---------------------------------------------------------------------------
   Animals.

   Six of these are the same quadruped from the kit at different proportions —
   a cat is a wolf with shorter legs and a longer tail — which is exactly the
   point of having a kit. The five that are not four-legged (chicken, bee,
   fish, spider, dragon) are built from scratch, because faking them off a
   quadruped costs more than writing them.

   Everything faces +Z, so a game can point one at the camera without a
   per-model rotation table.
   --------------------------------------------------------------------------- */

(function (root) {
'use strict';

const VOX = root.VOX;
const P = VOX.palette;
const { shade, mix } = VOX.util;
const M = VOX.MATERIAL;

const animal = (name, options, build) => VOX.define(Object.assign(
  { name, category: 'animals', build }, options,
));

/* --------------------------------------------------------------------- cat */

animal('cat', { tags: ['pet', 'small'], note: 'Low, long-tailed, and built entirely from the kit quadruped.' }, (m, kit) => {
  const coat = '#c98a3f';
  kit.quadruped(m, {
    coat, belly: '#e8cfa8', legTop: 3, bodyTop: 7, bodyBack: -4, bodyFront: 3,
    halfWidth: 2, neck: 2, headSize: 3, tail: 'none', ears: 'point',
  });
  /* the tail curls up rather than out */
  m.line(0, 8, -4, 0, 12, -6, coat, 0.6);
  m.box(1, 5, 3, 1, 5, 4, '#e8cfa8');            // chest flash
  m.mirrorX();
  m.box(0, 8, 5, 0, 8, 5, '#e8a0a8');            // nose
  m.grain(0.07);
});

/* --------------------------------------------------------------------- dog */

animal('dog', { tags: ['pet', 'companion'], note: 'Floppy ears, a stub tail and a paler muzzle.' }, (m, kit) => {
  const coat = '#8a6340';
  kit.quadruped(m, {
    coat, belly: '#c8a87c', legTop: 4, bodyTop: 8, bodyBack: -5, bodyFront: 3,
    halfWidth: 2, neck: 2, headSize: 3, tail: 'stub', ears: 'floppy',
  });
  m.box(0, 9, 4, 1, 10, 5, shade(coat, 0.85));   // brow
  m.mirrorX();
  m.box(0, 8, 6, 0, 8, 6, P.ink);                // nose
  m.grain(0.08);
});

/* ------------------------------------------------------------------- horse */

animal('horse', { tags: ['mount', 'large'], note: 'Tall enough to be ridden, with a mane down the neck.' }, (m, kit) => {
  const coat = '#6b4630', mane = '#3a2618';
  const anchors = kit.quadruped(m, {
    coat, belly: shade(coat, 1.12), hoof: P.ink, legTop: 8, bodyTop: 14,
    bodyBack: -6, bodyFront: 5, halfWidth: 3, neck: 5, headSize: 3, headDrop: 1,
    tail: 'none', ears: 'point',
  });
  /* mane along the neck, tail off the back */
  m.box(0, 14, 4, 1, anchors.headY, 5, mane);
  m.box(0, 12, -7, 1, 15, -6, mane);
  m.box(0, 8, -8, 1, 12, -7, mane);
  m.mirrorX();
  m.box(0, 15, 8, 0, 16, 8, P.white);            // blaze
  m.grain(0.07);
});

/* --------------------------------------------------------------------- pig */

animal('pig', { tags: ['farm', 'livestock'], note: 'Round, short, and mostly snout.' }, (m, kit) => {
  const coat = '#e8a3a8';
  kit.quadruped(m, {
    coat, belly: '#f5c6c9', hoof: '#8c5b60', legTop: 2, bodyTop: 7, bodyBack: -5,
    bodyFront: 3, halfWidth: 3, neck: 0, headSize: 3, headDrop: 1, tail: 'stub', ears: 'floppy',
  });
  m.box(0, 5, 6, 1, 6, 6, '#d98a92');            // snout disc
  m.mirrorX();
  m.box(-1, 5, 7, 1, 6, 7, '#c97b83');
  m.box(0, 6, 7, 0, 6, 7, P.ink);
  m.grain(0.06);
});

/* -------------------------------------------------------------------- wolf */

animal('wolf', { tags: ['enemy', 'pack'], note: 'The dog with the friendliness removed: lower head, bristled back.' }, (m, kit) => {
  const coat = '#8a8f9c';
  kit.quadruped(m, {
    coat, belly: '#c3c9d2', hoof: P.charcoal, legTop: 5, bodyTop: 10, bodyBack: -6,
    bodyFront: 4, halfWidth: 2, neck: 2, headSize: 3, headDrop: 2, tail: 'none', ears: 'point',
  });
  m.box(0, 11, -3, 1, 11, 2, P.charcoal);        // hackles
  m.line(0, 10, -6, 0, 12, -9, coat, 1);         // tail out behind
  m.mirrorX();
  m.box(-1, 9, 8, 1, 9, 8, P.ink);
  m.box(-1, 10, 7, -1, 10, 7, P.flame, M.EMISSIVE);
  m.box(1, 10, 7, 1, 10, 7, P.flame, M.EMISSIVE);
  m.grain(0.09);
});

/* -------------------------------------------------------------------- bear */

animal('bear', { tags: ['enemy', 'large', 'forest'], note: 'Heavy through the shoulders, with a low head.' }, (m, kit) => {
  const coat = '#5a3f2c';
  kit.quadruped(m, {
    coat, belly: shade(coat, 1.1), hoof: P.ink, legTop: 4, bodyTop: 11, bodyBack: -6,
    bodyFront: 4, halfWidth: 4, neck: 1, headSize: 3, headDrop: 1, tail: 'stub', ears: 'point',
  });
  m.box(0, 11, -2, 3, 12, 2, coat);              // shoulder hump
  m.mirrorX();
  m.box(-1, 9, 8, 1, 10, 8, '#c8a87c');          // muzzle
  m.box(0, 10, 9, 0, 10, 9, P.ink);
  m.grain(0.1);
});

/* ----------------------------------------------------------------- chicken */

animal('chicken', { tags: ['farm', 'small'], note: 'Two legs, a wattle and a comb — the smallest model in the set.' }, (m, kit) => {
  const body = '#f2efe6', beak = P.gold, comb = '#c0392b';
  m.ellipsoid(0, 6, 0, 3, 3, 4, body);
  m.box(0, 8, -1, 2, 10, 1, body);               // neck
  m.box(0, 10, -1, 2, 12, 2, body);              // head
  m.box(1, 3, 1, 1, 4, 2, beak);                 // legs
  m.box(1, 2, 1, 2, 2, 3, beak);                 // feet
  m.box(3, 5, -1, 3, 7, 2, shade(body, 0.92));   // wing
  m.box(0, 13, 0, 1, 13, 1, comb);               // comb
  m.box(0, 12, 3, 1, 12, 3, beak);               // beak
  m.box(0, 10, 2, 1, 11, 2, comb);               // wattle
  m.box(0, 5, -4, 1, 8, -5, body);               // tail
  m.mirrorX();
  m.set(-2, 12, 2, P.ink); m.set(2, 12, 2, P.ink);
  m.grain(0.05);
});

/* ------------------------------------------------------------------ dragon */

animal('dragon', { tags: ['boss', 'enemy', 'wings'], note: 'The one big enemy: wings, horns, and a lit throat.' }, (m, kit) => {
  const scale = '#3f7a5c', belly = '#c9b06a', horn = '#e8e0c8';
  const anchors = kit.quadruped(m, {
    coat: scale, belly, hoof: P.charcoal, legTop: 6, bodyTop: 13, bodyBack: -8,
    bodyFront: 5, halfWidth: 4, neck: 5, headSize: 4, headDrop: 0,
    tail: 'none', ears: 'none',
  });
  /* tail: a taper that drops as it goes back */
  for (let i = 0; i < 10; i++) {
    const r = 3 - i * 0.28;
    m.discY(0, 13 - Math.round(i * 0.55), -8 - i, Math.max(0.6, r), scale);
  }
  /* Wing: a swept membrane lying in the XZ plane and rising as it goes out,
     with a darker leading bone. Spread flat like this it reads as a wing from
     the three-quarter view everything in the catalogue is shown at; a vertical
     membrane would read as a comb. */
  const membrane = mix(scale, P.ink, 0.4), bone = shade(scale, 0.72);
  for (let i = 0; i <= 8; i++) {
    const x = 4 + i;
    const y = 14 + Math.round(i * 0.55);
    const front = 3 - Math.round(i * 0.9);
    const back = -4 - Math.round(i * 0.45);
    m.box(x, y, back, x, y, front, membrane);
    m.box(x, y, front, x, y, front, bone);
    if (i % 3 === 0) m.box(x, y, back, x, y + 1, front, bone);   // ribs
  }
  /* spines down the back */
  for (let z = -7; z <= 4; z += 2) m.box(0, 14, z, 0, 15 + (z % 4 === 0 ? 1 : 0), z, horn);
  m.mirrorX();
  /* horns and a mouth that glows */
  const hy = anchors.headY;
  m.box(2, hy + 1, 5, 3, hy + 2, 6, horn);
  m.box(-3, hy + 1, 5, -2, hy + 2, 6, horn);
  m.box(-2, hy - 3, 9, 2, hy - 2, 9, P.flame, M.EMISSIVE);
  m.grain(0.08);
});

/* -------------------------------------------------------------------- fish */

animal('fish', { tags: ['water', 'small', 'pickup'], note: 'Reads from the side, which is how a fish is ever seen.' }, (m, kit) => {
  const body = '#3f8fd0', fin = '#e8a33c';
  m.ellipsoid(0, 5, 0, 2, 3.4, 6, body);
  m.map((c, x, y, z) => (y > 5 ? shade(c, 0.88) : shade(c, 1.14)));
  m.box(0, 3, -8, 0, 8, -6, fin);                // tail
  m.box(0, 8, -1, 1, 9, 2, fin);                 // dorsal
  m.box(2, 4, 1, 3, 5, 3, fin);                  // pectoral
  m.mirrorX();
  m.box(-2, 6, 5, -2, 6, 5, P.white); m.box(2, 6, 5, 2, 6, 5, P.white);
  m.box(-2, 6, 6, -2, 6, 6, P.ink); m.box(2, 6, 6, 2, 6, 6, P.ink);
  m.grain(0.06);
});

/* --------------------------------------------------------------------- bee */

animal('bee', { tags: ['small', 'flying', 'insect'], note: 'Striped, translucent-winged, and only nine voxels long.' }, (m, kit) => {
  const gold = '#f0c02a', stripe = '#2a2318';
  m.ellipsoid(0, 5, 0, 3, 3, 4.5, gold);
  m.map((c, x, y, z) => ((z + 8) % 4 < 2 ? stripe : c));
  m.box(0, 4, -5, 1, 5, -5, stripe);             // sting
  m.ellipsoid(0, 6, 4, 2.4, 2.4, 2.4, stripe);   // head
  m.box(1, 7, 6, 2, 8, 6, stripe);               // antennae
  m.box(2, 9, 7, 2, 9, 7, stripe);
  /* wings, as glass so they catch the light rather than block it */
  for (let i = 0; i < 3; i++) m.box(3 + i, 8, -1 + i, 3 + i, 8 + Math.round(i * 0.5), 1 + i, P.white, M.GLASS);
  m.mirrorX();
  m.box(-1, 7, 6, 1, 7, 6, gold);
  m.set(-1, 6, 6, P.ink); m.set(1, 6, 6, P.ink);
});

/* ------------------------------------------------------------------ spider */

animal('spider', { tags: ['enemy', 'cave', 'insect'], note: 'Eight legs, built as four mirrored pairs on an arc.' }, (m, kit) => {
  const body = '#2b2434', leg = '#1a1620', eye = '#d64545';
  m.ellipsoid(0, 5, -2, 4, 3, 5, body);          // abdomen
  m.ellipsoid(0, 4, 4, 3, 2.6, 3, body);         // cephalothorax
  const feet = [[7, 6], [8, 2], [8, -2], [6, -6]];
  feet.forEach(([fx, fz], i) => {
    const kneeY = 8 - i * 0.4;
    m.line(2, 4, 3, fx - 2, kneeY, fz, leg, 0.7);
    m.line(fx - 2, kneeY, fz, fx, 0, fz, leg, 0.7);
  });
  m.mirrorX();
  for (const [x, z, y] of [[1, 7, 5], [2, 6, 4], [3, 6, 5], [1, 6, 3]]) {
    m.set(x, y, z, eye, M.EMISSIVE); m.set(-x, y, z, eye, M.EMISSIVE);
  }
  m.grain(0.09);
});

/* -------------------------------------------------------------------- bird */

animal('bird', { tags: ['small', 'flying'], note: 'A songbird, with the wings out so it reads in flight.' }, (m, kit) => {
  const body = '#4a6fd0', chest = '#e8b03c';
  m.ellipsoid(0, 5, 0, 2.4, 2.6, 3.4, body);
  m.ellipsoid(0, 8, 2, 2, 2, 2, body);           // head
  m.box(0, 4, 1, 1, 5, 3, chest);                // breast
  m.box(0, 8, 4, 0, 8, 5, P.gold);               // beak
  m.box(0, 3, -5, 1, 4, -3, body);               // tail
  for (let i = 0; i < 3; i++) m.box(2 + i, 5 + i, -1, 2 + i, 5 + i, 1 + i, shade(body, 0.85));
  m.box(1, 2, 1, 1, 3, 2, P.gold);               // legs
  m.mirrorX();
  m.set(-1, 9, 4, P.ink); m.set(1, 9, 4, P.ink);
  m.grain(0.05);
});

})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ===== 12-weapons.js ===================================================== */

/* ---------------------------------------------------------------------------
   Weapons.

   All sized to the kit humanoid's hand, which sits two voxels out from the
   shoulder line: a one-handed weapon is around 14 voxels long, a two-handed
   one around 22, and every one of them is built along +Y with the grip at the
   bottom. That convention is the whole point — a game can parent any of these
   to a hand bone with the same offset and never special-case a model.

   They are also all drawn standing up, because that is how they read in an
   inventory grid.
   --------------------------------------------------------------------------- */

(function (root) {
'use strict';

const VOX = root.VOX;
const P = VOX.palette;
const { shade } = VOX.util;
const M = VOX.MATERIAL;

const weapon = (name, options, build) => VOX.define(Object.assign(
  { name, category: 'weapons', build }, options,
));

/**
 * Grip, guard and pommel — the bottom of most things here.
 *
 * Blades are three voxels across and one deep. A square cross-section reads as
 * a plank rather than a blade, so only the guard and the pommel get depth, and
 * the blade stays flat the way a real one is.
 */
function hilt(m, options = {}) {
  const o = Object.assign({
    grip: P.leatherDark, metal: P.gold, guard: 4, length: 5, y: 0, gem: null,
  }, options);
  m.box(0, o.y, -1, 0, o.y + o.length, 1, o.grip);
  m.box(-1, o.y - 1, -1, 1, o.y - 1, 1, o.metal, M.METAL);       // pommel
  if (o.gem) m.set(0, o.y - 2, 0, o.gem, M.EMISSIVE);
  const gy = o.y + o.length + 1;
  m.box(-o.guard, gy, 0, o.guard, gy, 0, o.metal, M.METAL);
  m.box(-o.guard + 1, gy, -1, o.guard - 1, gy, 1, o.metal, M.METAL);
  m.box(-1, gy + 1, -1, 1, gy + 1, 1, o.metal, M.METAL);
  return gy + 1;
}

/* The gallery's workbench re-evaluates a recipe in a scope built from VOX.kit,
   so a helper a recipe calls has to be reachable from there or an edit of that
   recipe fails with a ReferenceError the moment it runs. */
VOX.kit.hilt = hilt;

/* ------------------------------------------------------------------- sword */

weapon('sword', { tags: ['melee', 'starter'], note: 'The reference weapon: everything else is sized against it.' }, (m, kit) => {
  const steel = '#cfd6e4', edge = '#f2f5fb', fuller = '#9aa4b8';
  const top = hilt(m, { guard: 4, gem: P.ruby });
  for (let y = top + 1; y <= top + 14; y++) {
    m.box(-1, y, 0, 1, y, 0, edge);
    m.set(0, y, 0, y > top + 12 ? edge : fuller);                // fuller down the middle
  }
  m.box(-1, top + 15, 0, 1, top + 15, 0, steel);
  m.set(0, top + 16, 0, steel);
  m.map((c, x, y) => (y > top ? { color: c, material: M.METAL } : c));
});

/* ------------------------------------------------------------------ dagger */

weapon('dagger', { tags: ['melee', 'rogue', 'small'], note: 'Half a sword, with a wrapped grip.' }, (m, kit) => {
  const steel = '#c4ccdc', edge = '#e8eef8';
  const top = hilt(m, { guard: 2, length: 3, metal: P.bronze });
  m.box(0, 1, -1, 0, 2, 1, '#3a2a1c');                           // wrap
  for (let y = top + 1; y <= top + 6; y++) {
    m.box(-1, y, 0, 1, y, 0, edge);
    m.set(0, y, 0, steel);
  }
  m.set(0, top + 7, 0, steel);
  m.map((c, x, y) => (y > top ? { color: c, material: M.METAL } : c));
});

/* -------------------------------------------------------------------- axe */

weapon('axe', { tags: ['melee', 'two-handed', 'tool'], note: 'A head heavy enough to look like it hurts.' }, (m, kit) => {
  const haft = P.wood, steel = '#b9c2d2';
  m.box(-1, 0, -1, 1, 16, 1, haft);
  m.box(-1, 0, -1, 1, 1, 1, P.leatherDark);
  m.grain(0.1);
  /* head: a crescent bitten out of a block, both sides */
  for (const side of [1, -1]) {
    for (let y = 10; y <= 17; y++) {
      const reach = Math.round(4 - Math.abs(y - 13.5) * 0.7);
      if (reach <= 0) continue;
      m.box(side * 2, y, -1, side * (2 + reach), y, 1, steel, M.METAL);
    }
  }
  m.box(-2, 11, -1, 2, 16, 1, '#8f97a8', M.METAL);
  m.box(-1, 17, -1, 1, 18, 1, steel, M.METAL);
});

/* ------------------------------------------------------------------ hammer */

weapon('war-hammer', { tags: ['melee', 'two-handed', 'blunt'], note: 'Banded head, riveted cheeks, long haft.' }, (m, kit) => {
  const haft = P.woodDark, steel = '#9aa2b4';
  m.box(-1, 0, -1, 1, 15, 1, haft);
  m.box(-1, 0, -1, 1, 2, 1, P.leatherDark);
  m.box(-4, 13, -3, 4, 18, 3, steel, M.METAL);
  m.box(-5, 14, -2, 5, 17, 2, shade(steel, 0.85), M.METAL);
  for (const x of [-5, 5]) for (const y of [15, 16]) m.set(x, y, 0, P.gold, M.METAL);
  m.box(-1, 19, -1, 1, 20, 1, steel, M.METAL);
  m.grain(0.06, (c, x, y) => y < 13);
});

/* ------------------------------------------------------------------- spear */

weapon('spear', { tags: ['melee', 'reach', 'two-handed'], note: 'Long, thin, and bound below the head.' }, (m, kit) => {
  const shaft = P.woodPale, steel = '#c9d1e0';
  m.box(0, 0, 0, 0, 22, 0, shaft);
  m.box(-1, 0, -1, 1, 0, 1, shaft);
  for (const y of [6, 7, 14, 15]) m.box(-1, y, -1, 1, y, 1, P.leatherDark);
  m.grain(0.1, (c, x, y) => y < 22);
  m.box(-1, 23, 0, 1, 27, 0, steel, M.METAL);
  m.box(0, 23, -1, 0, 27, 1, steel, M.METAL);
  m.box(-1, 28, 0, 1, 28, 0, '#eef2fa', M.METAL);
  m.box(0, 29, 0, 0, 30, 0, '#eef2fa', M.METAL);
  m.box(-1, 22, 0, 1, 22, 0, P.bronze, M.METAL);
});

/* --------------------------------------------------------------------- bow */

weapon('bow', { tags: ['ranged', 'wood'], note: 'A curved limb built from a sampled arc, and a one-voxel string.' }, (m, kit) => {
  const wood = P.wood, string = '#e8e4d4';
  /* the limb: an arc of x = f(y), mirrored top to bottom */
  for (let y = 0; y <= 11; y++) {
    const x = Math.round(-3 + (y * y) * 0.028);
    m.box(x, y, -1, x, y, 1, wood);
    m.box(x, -y, -1, x, -y, 1, wood);
  }
  m.box(-2, -2, -1, -2, 2, 1, P.leatherDark);                    // grip wrap
  for (const y of [11, -11]) m.box(-1, y, 0, 0, y, 0, P.bronze, M.METAL);
  m.grain(0.12, c => c === VOX.util.rgb(wood));
  /* string, drawn straight between the tips */
  for (let y = -11; y <= 11; y++) m.setIfEmpty(0, y, 0, string);
  m.translate(0, 12, 0);
});

/* ---------------------------------------------------------------- crossbow */

weapon('crossbow', { tags: ['ranged', 'wood', 'metal'], note: 'Stock, prod and a loaded bolt.' }, (m, kit) => {
  const stock = P.wood, steel = '#98a0b0';
  m.box(-1, 0, -6, 1, 2, 6, stock);                              // stock
  m.box(-1, 0, -8, 1, 1, -6, stock);
  m.box(-1, -3, -3, 1, 0, -1, stock);                            // grip
  m.grain(0.1);
  for (let i = 0; i <= 7; i++) {                                 // prod
    const z = 4 - Math.round(i * i * 0.08);
    m.box(2 + i, 1, z, 2 + i, 2, z, steel, M.METAL);
    m.box(-2 - i, 1, z, -2 - i, 2, z, steel, M.METAL);
  }
  for (let x = -9; x <= 9; x++) m.setIfEmpty(x, 3, 1, '#e8e4d4');  // string
  m.box(0, 3, -4, 0, 3, 5, '#5a4a32');                           // bolt
  m.box(-1, 3, 5, 1, 3, 6, steel, M.METAL);
  m.box(0, 3, -5, 0, 4, -4, '#c0392b');                          // fletch
  m.rotateY(1);
});

/* ------------------------------------------------------------------- staff */

weapon('staff', { tags: ['magic', 'two-handed', 'glow'], note: 'The only weapon here that lights the room.' }, (m, kit) => {
  const wood = '#6b4a2c';
  m.box(0, 0, 0, 0, 20, 0, wood);
  m.box(-1, 0, -1, 1, 0, 1, wood);
  for (let y = 3; y < 20; y += 4) m.set(0, y, 0, shade(wood, 0.72));
  m.grain(0.12);
  /* claw holding the stone */
  for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    m.box(x, 21, z, x, 23, z, P.bronze, M.METAL);
    m.set(x, 24, z, P.bronze, M.METAL);
  }
  m.sphere(0, 24, 0, 2.2, P.magic, M.EMISSIVE);
  m.sphere(0, 24, 0, 1.1, '#e8ddff', M.EMISSIVE);
  m.box(0, 21, 0, 0, 22, 0, P.bronze, M.METAL);
});

/* ------------------------------------------------------------------ shield */

weapon('shield', { tags: ['defence', 'heraldry'], note: 'A heater shield, with the boss and the rim in metal.' }, (m, kit) => {
  const face = '#3f5f9c', rim = '#b9c2d2', trim = P.gold;
  for (let y = 0; y <= 15; y++) {
    /* straight-sided at the top, tapering to a point at the bottom */
    const w = y > 10 ? 6 : Math.round(1 + y * 0.55);
    m.box(-w, y, 0, w, y, 1, face);
    m.box(-w, y, 0, -w, y, 1, rim, M.METAL);
    m.box(w, y, 0, w, y, 1, rim, M.METAL);
  }
  m.box(-6, 16, 0, 6, 16, 1, rim, M.METAL);
  m.box(0, 4, 2, 0, 13, 2, trim, M.METAL);                       // charge
  m.box(-3, 9, 2, 3, 9, 2, trim, M.METAL);
  m.sphere(0, 9, 1, 1.6, rim, M.METAL);                          // boss
  m.box(-2, 6, -1, 2, 6, -1, P.leatherDark);                     // strap
  m.box(-2, 12, -1, 2, 12, -1, P.leatherDark);
});

/* ------------------------------------------------------------------ blaster */

weapon('blaster', { tags: ['sci-fi', 'ranged', 'glow'], note: 'The sci-fi counterpart to the sword: same hand, same height.' }, (m, kit) => {
  const shellColor = '#d8dde8', dark = '#3a4152', glow = P.gem;
  m.box(-1, 0, -2, 1, 5, 1, dark);                               // grip
  m.box(-2, 6, -3, 2, 9, 6, shellColor, M.METAL);                // body
  m.box(-2, 7, 6, 2, 8, 9, dark, M.METAL);                       // barrel
  m.box(-1, 7, 9, 1, 8, 10, glow, M.EMISSIVE);
  m.box(-3, 6, -1, 3, 7, 2, dark, M.METAL);                      // cell
  m.box(-3, 7, 0, -3, 7, 1, glow, M.EMISSIVE);
  m.box(3, 7, 0, 3, 7, 1, glow, M.EMISSIVE);
  m.box(-1, 10, -1, 1, 10, 3, shellColor, M.METAL);              // sight
  m.box(0, 11, 2, 0, 11, 2, glow, M.EMISSIVE);
  m.box(-1, 5, 2, 1, 6, 3, dark);                                // trigger guard
});

/* ------------------------------------------------------------------- torch */

weapon('torch', { tags: ['light', 'held'], note: 'Held like a weapon, so it lives here rather than with the items.' }, (m, kit) => {
  m.box(0, 0, 0, 0, 9, 0, P.woodDark);
  m.box(-1, 0, -1, 1, 1, 1, P.woodDark);
  m.grain(0.14);
  m.box(-1, 9, -1, 1, 10, 1, '#3a2a1c');
  VOX.kit.flame(m, 0, 11, 0, { r: 2.2, h: 5 });
});

})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ===== 13-items.js ======================================================= */

/* ---------------------------------------------------------------------------
   Items.

   Pickups and inventory art. These are the smallest models in the catalogue on
   purpose: an item is usually drawn at 32 or 48 pixels floating over a tile, so
   detail below about eight voxels across is wasted, and silhouette is
   everything. Each one is built so its outline still reads when the whole
   thing is nine pixels tall.
   --------------------------------------------------------------------------- */

(function (root) {
'use strict';

const VOX = root.VOX;
const P = VOX.palette;
const { shade } = VOX.util;
const M = VOX.MATERIAL;

const item = (name, options, build) => VOX.define(Object.assign(
  { name, category: 'items', build }, options,
));

/* ------------------------------------------------------------------ potion */

item('potion', { tags: ['pickup', 'consumable', 'glow'], note: 'Round flask, cork, and a liquid that lights itself.' }, (m, kit) => {
  const glass = '#bfe4f0', liquid = '#d6335e';
  m.ellipsoid(0, 4, 0, 3.4, 3.4, 3.4, glass, M.GLASS);
  /* The liquid has to reach the surface to be seen at all — an inner sphere
     inside a solid one is culled away before it ever meets the light. */
  m.map((c, x, y) => (y <= 4 ? { color: liquid, material: M.EMISSIVE } : c));
  m.box(-1, 7, -1, 1, 9, 1, glass, M.GLASS);                     // neck
  m.box(-1, 8, -1, 1, 8, 1, liquid, M.EMISSIVE);
  m.box(-2, 10, -2, 2, 11, 2, '#a8763c');                        // cork
  m.box(-1, 12, -1, 1, 12, 1, '#8a5f2c');
  m.remove(-4, 0, -4, 4, 0, 4);
});

/* ------------------------------------------------------------------- chest */

item('chest', { tags: ['loot', 'container'], note: 'Lid open, gold inside, bands and a lock in metal.' }, (m, kit) => {
  const wood = '#7a5533', band = '#4a4f5e', gold = P.gold;
  m.box(-5, 0, -4, 5, 5, 4, wood);
  m.grain(0.1);
  for (const x of [-4, 0, 4]) m.box(x, 0, -4, x, 5, 4, band, M.METAL);
  m.box(-5, 0, -4, 5, 0, 4, band, M.METAL);
  /* contents */
  m.box(-4, 5, -3, 4, 6, 3, gold, M.METAL);
  m.map((c, x, y, z) => (y === 6 && (x + z) % 3 === 0 ? shade(gold, 1.2) : c));
  /* lid, hinged back and tilted open */
  for (let i = 0; i <= 4; i++) {
    m.box(-5, 6 + i, -4 - i, 5, 6 + i, -4 - i + 1, i === 4 ? band : wood);
  }
  m.box(-1, 3, 4, 1, 5, 4, gold, M.METAL);                       // lock
  m.set(0, 4, 5, '#2a2a2a');
});

/* ---------------------------------------------------------------- coin pile */

item('coin-pile', { tags: ['loot', 'currency'], note: 'Loose coins, stacked by a hash so the heap is never symmetric.' }, (m, kit) => {
  const gold = P.gold, dark = P.goldDark;
  for (let x = -4; x <= 4; x++) {
    for (let z = -4; z <= 4; z++) {
      const d = Math.hypot(x, z);
      if (d > 4.4) continue;
      const h = Math.max(0, Math.round(3 - d * 0.7 + kit.hash01(x, 0, z) * 1.6));
      for (let y = 0; y <= h; y++) m.set(x, y, z, (x + z + y) % 2 ? gold : dark, M.METAL);
    }
  }
  /* one coin on edge, so the pile has a readable top */
  m.box(1, 4, -1, 1, 6, 1, gold, M.METAL);
  m.set(1, 5, 0, dark, M.METAL);
});

/* --------------------------------------------------------------------- gem */

item('gem', { tags: ['loot', 'currency', 'glow'], note: 'Two pyramids, base to base. The only shape a gem needs.' }, (m, kit) => {
  const face = '#4fd4d8';
  for (let i = 0; i <= 3; i++) {
    m.box(-3 + i, 4 + i, -3 + i, 3 - i, 4 + i, 3 - i, face, M.EMISSIVE);
  }
  for (let i = 0; i <= 3; i++) {
    m.box(-3 + i, 3 - i, -3 + i, 3 - i, 3 - i, 3 - i, shade(face, 0.82), M.EMISSIVE);
  }
  m.map((c, x, y, z) => (x === -3 || z === -3 ? shade(c, 0.8) : c));
  m.set(-1, 6, -1, '#eaffff', M.EMISSIVE);
});

/* --------------------------------------------------------------------- key */

item('key', { tags: ['quest', 'small'], note: 'Bow, shaft, two wards — nine voxels of unmistakable silhouette.' }, (m, kit) => {
  const gold = P.gold;
  m.box(0, 0, -1, 0, 11, 1, gold, M.METAL);                      // shaft
  for (let x = -3; x <= 3; x++) for (let y = 9; y <= 15; y++) {
    const d = Math.hypot(x, y - 12);
    if (d > 1.6 && d < 3.4) m.box(x, y, -1, x, y, 1, gold, M.METAL);
  }
  m.box(1, 0, -1, 3, 1, 1, gold, M.METAL);                       // wards
  m.box(1, 3, -1, 2, 4, 1, gold, M.METAL);
  m.grain(0.08);
});

/* ------------------------------------------------------------------- apple */

item('apple', { tags: ['food', 'pickup'], note: 'A pickup that reads at any size: red ball, brown stalk, one leaf.' }, (m, kit) => {
  const skin = '#d13b3b';
  m.ellipsoid(0, 4, 0, 3.4, 3.2, 3.4, skin);
  m.map((c, x, y, z) => (kit.hash01(x, y, z) < 0.18 ? shade(skin, 1.22) : c));
  m.clear(0, 7, 0);
  m.box(0, 7, 0, 0, 9, 0, '#5a3a24');
  m.box(1, 9, 0, 3, 9, 1, '#4a8f3a');                            // leaf
  m.box(2, 10, 0, 3, 10, 1, '#5aa347');
});

/* -------------------------------------------------------------------- bomb */

item('bomb', { tags: ['weapon', 'throwable', 'glow'], note: 'Sphere, fuse, spark. The spark is the only emissive voxel.' }, (m, kit) => {
  m.sphere(0, 5, 0, 4.4, '#2c3040');
  m.map((c, x, y, z) => (x < -1 && y > 5 ? shade(c, 1.5) : c));  // highlight
  m.box(-1, 9, -1, 1, 10, 1, '#5a5f70', M.METAL);                // collar
  m.line(0, 10, 0, 2, 14, -1, '#b9a06a', 0.4);                   // fuse
  m.sphere(2, 14, -1, 1.4, P.flame, M.EMISSIVE);
  m.set(2, 15, -1, P.flameHot, M.EMISSIVE);
});

/* -------------------------------------------------------------------- book */

item('book', { tags: ['quest', 'magic'], note: 'Closed, with a clasp — pages are one lighter slab, not fifty.' }, (m, kit) => {
  const cover = '#5a3a6b', page = '#e8e2cf';
  m.box(-5, 0, -4, 5, 0, 4, cover);
  m.box(-5, 3, -4, 5, 3, 4, cover);
  m.box(-5, 0, -4, -5, 3, 4, cover);                             // spine
  m.box(-4, 1, -3, 5, 2, 3, page);
  m.box(4, 1, 0, 6, 2, 1, P.gold, M.METAL);                      // clasp
  m.box(-5, 1, 0, -5, 2, 1, P.gold, M.METAL);
  m.box(-2, 4, -1, 2, 4, 1, P.gold, M.METAL);                    // sigil
  m.set(0, 4, 0, P.magic, M.EMISSIVE);
});

/* ------------------------------------------------------------------ scroll */

item('scroll', { tags: ['quest', 'magic'], note: 'Rolled, with the ends showing and a ribbon around the middle.' }, (m, kit) => {
  const paper = '#e4d9b8';
  m.cylX(3, 0, -6, 6, 3, paper);
  m.grain(0.06);
  m.cylX(3, 0, -7, -6, 3.4, shade(paper, 0.86));                 // rolled ends
  m.cylX(3, 0, 6, 7, 3.4, shade(paper, 0.86));
  m.box(-8, 2, -1, -8, 4, 1, '#8a5f2c');                         // dowels
  m.box(8, 2, -1, 8, 4, 1, '#8a5f2c');
  m.cylX(3, 0, -1, 1, 3.6, '#b8403f');                           // ribbon
});

/* ----------------------------------------------------------------- lantern */

item('lantern', { tags: ['light', 'glow', 'pickup'], note: 'The one item meant to be carried at night.' }, (m, kit) => {
  const frame = '#4a4f5e';
  m.box(-3, 0, -3, 3, 1, 3, frame, M.METAL);
  m.box(-3, 8, -3, 3, 9, 3, frame, M.METAL);
  for (const [x, z] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) m.box(x, 1, z, x, 8, z, frame, M.METAL);
  m.box(-2, 2, -2, 2, 7, 2, '#ffd98a', M.EMISSIVE);              // the light
  m.box(-3, 4, -3, 3, 4, 3, frame, M.METAL);
  m.box(-1, 10, 0, 1, 12, 0, frame, M.METAL);                    // handle
  m.box(-2, 9, 0, 2, 10, 0, frame, M.METAL);
});

/* ---------------------------------------------------------------- backpack */

item('backpack', { tags: ['gear', 'container'], note: 'Straps, buckles and a bedroll — the adventurer’s inventory icon.' }, (m, kit) => {
  const canvas = '#8a6a45', strap = '#4a3220';
  m.box(-4, 0, -3, 4, 9, 3, canvas);
  m.grain(0.09);
  m.box(-4, 10, -2, 4, 11, 2, canvas);                           // flap
  m.box(-4, 9, 3, 4, 11, 3, shade(canvas, 0.82));
  for (const x of [-2, 2]) {
    m.box(x, 6, -4, x, 11, -4, strap);
    m.box(x, 8, 3, x, 11, 3, strap);
    m.set(x, 8, 4, P.bronze, M.METAL);
  }
  m.cylX(11, -1, -5, 5, 2, '#7a8a6a');                           // bedroll
  m.box(-5, 3, -1, -5, 5, 1, strap);
  m.box(5, 3, -1, 5, 5, 1, strap);
});

})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ===== 14-furniture.js =================================================== */

/* ---------------------------------------------------------------------------
   Furniture.

   Everything here is sized to the buildings in 16-buildings.js: a chair seat
   is at y = 5, a table top at y = 8, and a doorway is seven voxels clear. Put
   a kit humanoid next to any of it and the proportions hold, which is the only
   test furniture ever really has to pass.
   --------------------------------------------------------------------------- */

(function (root) {
'use strict';

const VOX = root.VOX;
const P = VOX.palette;
const { shade } = VOX.util;
const M = VOX.MATERIAL;

const furniture = (name, options, build) => VOX.define(Object.assign(
  { name, category: 'furniture', build }, options,
));

/** Four legs under a top. Half the models in this file start here. */
function legs(m, hx, hz, top, color, thickness = 1) {
  for (const x of [-hx, hx]) {
    for (const z of [-hz, hz]) {
      m.box(x, 0, z, x + (x < 0 ? thickness - 1 : -(thickness - 1)), top, z + (z < 0 ? thickness - 1 : -(thickness - 1)), color);
    }
  }
}

VOX.kit.legs = legs;

/* ------------------------------------------------------------------- table */

furniture('table', { tags: ['tavern', 'indoor'], note: 'Plank top, cross-braced legs, one knot per plank.' }, (m, kit) => {
  const wood = P.wood, dark = P.woodDark;
  legs(m, 6, 4, 7, dark);
  m.box(-6, 5, -4, 6, 5, 4, dark);                               // brace
  m.box(-7, 8, -5, 7, 9, 5, wood);                               // top
  for (let x = -7; x <= 7; x += 3) m.box(x, 9, -5, x, 9, 5, shade(wood, 0.88));
  m.grain(0.12);
});

/* ------------------------------------------------------------------- chair */

furniture('chair', { tags: ['tavern', 'indoor'], note: 'Seat at five, so the kit humanoid sits without adjustment.' }, (m, kit) => {
  const wood = P.wood, dark = P.woodDark;
  legs(m, 3, 3, 4, dark);
  m.box(-4, 5, -4, 4, 5, 4, wood);                               // seat
  m.box(-4, 6, -4, 4, 12, -3, wood);                             // back
  m.remove(-3, 8, -4, 3, 10, -3);
  m.box(-4, 12, -4, 4, 13, -3, dark);
  m.grain(0.12);
});

/* --------------------------------------------------------------------- bed */

furniture('bed', { tags: ['indoor', 'save-point'], note: 'A pillow, a turned-down sheet and a frame with feet.' }, (m, kit) => {
  const frame = P.woodDark, sheet = '#c9d4e4', quilt = '#b8443f', pillow = P.white;
  m.box(-5, 0, -11, 5, 2, 11, frame);
  m.box(-5, 3, -11, 5, 3, 11, sheet);
  m.box(-5, 3, -11, 5, 7, -9, frame);                            // headboard
  m.box(-5, 3, 10, 5, 5, 11, frame);                             // footboard
  m.box(-4, 4, -8, 4, 5, -5, pillow);
  m.box(-5, 4, -3, 5, 5, 10, quilt);                             // quilt
  m.box(-5, 4, -4, 5, 4, -4, shade(quilt, 0.85));
  for (let z = -2; z < 10; z += 3) m.box(-5, 5, z, 5, 5, z, shade(quilt, 1.1));
  m.grain(0.07, (c, x, y) => y < 3);
});

/* -------------------------------------------------------------- bookshelf */

furniture('bookshelf', { tags: ['indoor', 'library'], note: 'Books coloured from a hash, so no two shelves repeat.' }, (m, kit) => {
  const wood = P.woodDark;
  m.box(-7, 0, -3, 7, 19, 3, wood);
  m.grain(0.1);
  const spines = ['#b8443f', '#3f6b8c', '#4a7a45', '#8c6a3f', '#6b4a7a', '#c9a03f'];
  for (const shelfY of [1, 7, 13]) {
    m.remove(-6, shelfY, -2, 6, shelfY + 4, 3);   /* open at the front (z = 3) */
    let x = -6;
    while (x <= 6) {
      const width = 1 + Math.floor(kit.hash01(x, shelfY, 0) * 2);
      const height = 3 + Math.floor(kit.hash01(x, shelfY, 5) * 2);
      const color = spines[Math.floor(kit.hash01(x, shelfY, 9) * spines.length)];
      if (x + width > 6) break;
      m.box(x, shelfY, -2, x + width - 1, shelfY + height, 2, color);
      m.box(x, shelfY + height, -2, x + width - 1, shelfY + height, 2, shade(color, 0.8));
      x += width + 1;
    }
  }
});

/* --------------------------------------------------------------- fireplace */

furniture('fireplace', { tags: ['indoor', 'light', 'glow'], note: 'Stone surround, log pile, and a fire that lights the mantel.' }, (m, kit) => {
  const stone = P.stone;
  m.box(-8, 0, -4, 8, 13, 4, stone);
  m.remove(-5, 1, -2, 5, 8, 5);
  m.box(-9, 13, -5, 9, 14, 5, shade(stone, 0.82));               // mantel
  m.grain(0.14);
  m.box(-5, 1, -2, 5, 1, 4, '#2a2622');                          // ash
  for (const [x, z] of [[-2, 1], [1, 0], [-1, 2]]) m.cylX(2, z, x - 2, x + 2, 1.4, P.woodDark);
  kit.flame(m, 0, 3, 1, { r: 3, h: 5 });
  m.box(-5, 9, -2, 5, 9, 3, shade(stone, 0.7));                  // flue
});

/* ------------------------------------------------------------------- anvil */

furniture('anvil', { tags: ['smithy', 'workshop'], note: 'The classic silhouette: waist, horn and heel.' }, (m, kit) => {
  const iron = '#5a606e';
  m.box(-4, 0, -3, 4, 1, 3, shade(iron, 0.8), M.METAL);
  m.box(-2, 2, -2, 2, 4, 2, iron, M.METAL);                      // waist
  m.box(-5, 5, -3, 5, 7, 3, iron, M.METAL);                      // face
  m.box(-8, 5, -2, -5, 6, 2, iron, M.METAL);                     // horn
  m.box(-9, 5, -1, -9, 6, 1, iron, M.METAL);
  m.box(5, 5, -2, 7, 7, 2, iron, M.METAL);                       // heel
  m.grain(0.1);
});

/* ------------------------------------------------------------------ throne */

furniture('throne', { tags: ['royal', 'indoor'], note: 'The chair, scaled up and given gold. Same seat height.' }, (m, kit) => {
  const stone = '#6a6f80', cloth = '#6a2f52', gold = P.gold;
  m.box(-7, 0, -6, 7, 4, 6, stone);
  m.box(-7, 5, -6, 7, 5, 6, cloth);                              // cushion
  m.box(-7, 6, -6, 7, 20, -5, stone);                            // back
  m.box(-6, 8, -5, 6, 18, -5, cloth);
  for (const x of [-7, 7]) m.box(x, 6, -6, x, 12, 6, stone);     // arms
  for (const x of [-7, 7]) m.box(x, 13, -6, x, 13, 6, gold, M.METAL);
  m.box(-7, 21, -6, 7, 21, -5, gold, M.METAL);
  for (let x = -6; x <= 6; x += 3) m.box(x, 22, -6, x, 23, -5, gold, M.METAL);
  m.box(0, 12, -4, 0, 14, -4, gold, M.METAL);
  m.grain(0.09, (c, x, y, z) => c === VOX.util.rgb(stone));
});

/* ------------------------------------------------------------------- crate */

furniture('crate', { tags: ['prop', 'container', 'destructible'], note: 'Planked, braced diagonally, and stackable on a one-voxel grid.' }, (m, kit) => {
  const wood = P.plank, dark = P.woodDark;
  m.box(-5, 0, -5, 5, 10, 5, wood);
  m.grain(0.13);
  /* Frame all twelve edges first: without them a crate is just a brown cube. */
  for (const y of [0, 10]) {
    m.box(-5, y, -5, 5, y, -5, dark); m.box(-5, y, 5, 5, y, 5, dark);
    m.box(-5, y, -5, -5, y, 5, dark); m.box(5, y, -5, 5, y, 5, dark);
  }
  for (const x of [-5, 5]) for (const z of [-5, 5]) m.box(x, 0, z, x, 10, z, dark);
  for (const y of [5]) {
    m.box(-5, y, -5, 5, y, -5, dark); m.box(-5, y, 5, 5, y, 5, dark);
    m.box(-5, y, -5, -5, y, 5, dark); m.box(5, y, -5, 5, y, 5, dark);
  }
  /* diagonal brace on all four sides */
  for (let i = 0; i <= 10; i++) {
    m.set(-5 + i, i, 5, dark); m.set(-5 + i, i, -5, dark);
    m.set(5, i, -5 + i, dark); m.set(-5, i, -5 + i, dark);
  }
});

/* ------------------------------------------------------------------ barrel */

furniture('barrel', { tags: ['prop', 'container', 'tavern'], note: 'Staved, banded, and wider at the middle than the ends.' }, (m, kit) => {
  kit.barrel(m, { r: 5, h: 12, wood: P.wood, band: '#4a4f5e' });
  /* stave lines: every third column a touch darker */
  m.map((c, x, y, z) => (Math.abs(x + z) % 3 === 0 ? shade(c, 0.9) : c));
  m.discY(0, 12, 0, 4.6, shade(P.wood, 1.08));
});

/* ---------------------------------------------------------------- cauldron */

furniture('cauldron', { tags: ['witch', 'cooking', 'glow'], note: 'A pot on legs with something green in it.' }, (m, kit) => {
  const iron = '#3a3f4a', brew = P.poison;
  for (let y = 3; y <= 12; y++) {
    const r = 5.2 - Math.abs(y - 8) * 0.24 - (y > 10 ? 0.6 : 0);
    m.discY(0, y, 0, r, iron, M.METAL);
  }
  for (const [x, z] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) m.box(x, 0, z, x, 3, z, iron, M.METAL);
  /* hollow the top and fill it */
  for (let y = 10; y <= 12; y++) for (let x = -5; x <= 5; x++) for (let z = -5; z <= 5; z++) {
    if (x * x + z * z < 16) m.clear(x, y, z);
  }
  m.discY(0, 11, 0, 3.8, brew, M.EMISSIVE);
  m.set(1, 12, -1, brew, M.EMISSIVE);
  m.set(-2, 12, 1, brew, M.EMISSIVE);
  m.grain(0.08, (c) => c === VOX.util.rgb(iron));
});

/* --------------------------------------------------------------------- rug */

furniture('rug', { tags: ['indoor', 'decor'], note: 'One voxel thick, with a woven border and fringe.' }, (m, kit) => {
  const field = '#8c3f4a', border = '#d8b45a', dark = '#5a2833';
  m.box(-9, 0, -6, 9, 0, 6, field);
  m.box(-9, 0, -6, 9, 0, -5, border);
  m.box(-9, 0, 5, 9, 0, 6, border);
  m.box(-9, 0, -6, -8, 0, 6, border);
  m.box(8, 0, -6, 9, 0, 6, border);
  m.box(-5, 0, -3, 5, 0, 3, dark);
  m.box(-3, 0, -2, 3, 0, 2, border);
  m.box(-2, 0, -1, 2, 0, 1, field);
  for (let x = -9; x <= 9; x += 2) { m.set(x, 0, -7, border); m.set(x, 0, 7, border); }
});

/* -------------------------------------------------------------- lamp post */

furniture('lamp-post', { tags: ['street', 'light', 'glow'], note: 'Street furniture: base, fluted post, glass head.' }, (m, kit) => {
  const iron = '#33384a';
  m.discY(0, 0, 0, 3, iron, M.METAL);
  m.discY(0, 1, 0, 2.4, iron, M.METAL);
  m.box(0, 2, 0, 0, 18, 0, iron, M.METAL);
  m.box(-1, 2, -1, 1, 4, 1, iron, M.METAL);
  for (const [x, z] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) m.box(x, 18, z, x, 20, z, iron, M.METAL);
  m.box(-2, 19, -2, 2, 23, 2, '#ffe6a8', M.EMISSIVE);
  m.box(-2, 19, -2, 2, 19, 2, iron, M.METAL);
  m.pyramid(-3, 3, -3, 3, 24, iron);
  m.set(0, 28, 0, iron, M.METAL);
});

})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ===== 15-scenery.js ===================================================== */

/* ---------------------------------------------------------------------------
   Scenery.

   Props that dress a level rather than sit in it. Two rules keep a scene from
   looking like a shop window: nothing here is symmetric unless it was built by
   someone (a fence is, a rock is not), and every organic surface gets two
   tones of the same colour so a hillside of them does not read as one flat
   green.

   All of them sit on y = 0 with a slightly wider base than top, so they still
   look planted when dropped on uneven terrain.
   --------------------------------------------------------------------------- */

(function (root) {
'use strict';

const VOX = root.VOX;
const P = VOX.palette;
const { shade, hash01 } = VOX.util;
const M = VOX.MATERIAL;

const scenery = (name, options, build) => VOX.define(Object.assign(
  { name, category: 'scenery', build }, options,
));

/* ---------------------------------------------------------------- oak tree */

scenery('oak-tree', { tags: ['tree', 'forest'], note: 'The default tree. Round canopy, offset second lobe, roots that flare.' }, (m, kit) => {
  kit.tree(m, { height: 13, trunkR: 1.8, canopy: 'round', canopyR: 6, leaf: P.leaf, seed: 11 });
  for (const [x, z] of [[2, 1], [-2, -1], [1, -2], [-1, 2]]) m.box(x, 0, z, x, 1, z, P.wood);
});

scenery('pine-tree', { tags: ['tree', 'forest', 'winter'], note: 'Stacked skirts, each narrower than the last.' }, (m, kit) => {
  kit.tree(m, { height: 12, trunkR: 1.4, canopy: 'pine', canopyR: 6, leaf: P.pine, seed: 5 });
});

scenery('palm-tree', { tags: ['tree', 'beach'], note: 'A leaning trunk with six sampled fronds.' }, (m, kit) => {
  const trunk = '#9a7a4a';
  for (let y = 0; y <= 16; y++) {
    const lean = Math.round(y * y * 0.012);
    m.discY(lean, y, 0, 1.8 - y * 0.05, trunk);
  }
  m.grain(0.14);
  const top = 16, lean = Math.round(top * top * 0.012);
  for (let a = 0; a < 6; a++) {
    const angle = (a / 6) * Math.PI * 2 + 0.4;
    const dx = Math.cos(angle), dz = Math.sin(angle);
    for (let i = 1; i <= 7; i++) {
      const y = top + 2 - Math.round(i * i * 0.13);
      m.set(lean + Math.round(dx * i), y, Math.round(dz * i), P.leaf);
      if (i > 1 && i < 7) {
        m.set(lean + Math.round(dx * i - dz), y, Math.round(dz * i + dx), shade(P.leaf, 0.86));
        m.set(lean + Math.round(dx * i + dz), y, Math.round(dz * i - dx), shade(P.leaf, 1.12));
      }
    }
  }
  for (const [x, z] of [[0, 1], [1, 0], [-1, 0]]) m.set(lean + x, top + 1, z, '#8a6a3a');
});

/* -------------------------------------------------------------------- bush */

scenery('bush', { tags: ['plant', 'filler'], note: 'Three overlapping lobes and a few berries.' }, (m, kit) => {
  const leaf = '#417a3a';
  m.ellipsoid(0, 3, 0, 4, 3, 4, leaf);
  m.ellipsoid(3, 2, -1, 3, 2.4, 3, leaf);
  m.ellipsoid(-2, 3, 2, 3, 2.6, 3, leaf);
  m.remove(-8, -4, -8, 8, -1, 8);
  m.map((c, x, y, z) => {
    const h = hash01(x, y, z);
    return h < 0.28 ? shade(leaf, 0.78) : h > 0.8 ? shade(leaf, 1.18) : c;
  });
  m.speckle('#c0392b', 0.05);
});

/* -------------------------------------------------------------------- rock */

scenery('rock', { tags: ['terrain', 'filler'], note: 'A boulder with moss on whatever faces the sky.' }, (m, kit) => {
  kit.rock(m, { r: 5, height: 4, seed: 17, color: P.stone, moss: '#4a7a3a' });
});

scenery('crystal', { tags: ['cave', 'glow', 'mineral'], note: 'Three shards from one base, the tallest lit brightest.' }, (m, kit) => {
  const stone = '#4a4358';
  kit.rock(m, { r: 4, height: 2, seed: 23, color: stone });
  const shard = (x, z, h, r, color) => {
    for (let i = 0; i <= h; i++) {
      const t = i / h;
      m.discY(x, 1 + i, z, Math.max(0.6, r * (1 - t * 0.85)), color, M.EMISSIVE);
    }
  };
  shard(0, 0, 11, 2.6, '#8a5fd8');
  shard(-3, 2, 7, 1.9, '#a97bff');
  shard(3, -1, 5, 1.6, '#6f4ac0');
});

/* ------------------------------------------------------------------ cactus */

scenery('cactus', { tags: ['desert', 'plant'], note: 'Ribbed column with two arms and a flower.' }, (m, kit) => {
  const green = '#3f7a4a';
  m.box(-2, 0, -2, 2, 16, 2, green);
  m.box(-3, 0, -1, 3, 16, 1, green);
  m.box(-1, 0, -3, 1, 16, 3, green);
  m.box(3, 6, -1, 5, 7, 1, green);                               // right arm
  m.box(4, 8, -1, 5, 12, 1, green);
  m.box(-5, 9, -1, -3, 10, 1, green);                            // left arm
  m.box(-5, 11, -1, -4, 14, 1, green);
  m.map((c, x, y, z) => (Math.abs(x) === 3 || Math.abs(z) === 3 ? shade(c, 0.86) : c));
  m.grain(0.06);
  m.box(-1, 17, -1, 1, 17, 1, '#d8577a');                        // flower
  m.set(0, 18, 0, '#f0a0b8');
  for (let i = 0; i < 14; i++) {
    const y = 2 + i;
    m.set(3, y, 0, '#e8e0c0'); m.set(-3, y + 1, 0, '#e8e0c0');
  }
});

/* --------------------------------------------------------------- mushroom */

scenery('mushroom', { tags: ['cave', 'plant', 'glow'], note: 'Cap, gills, stalk — and it glows, because it is that kind of forest.' }, (m, kit) => {
  const stalk = '#e8e0cf', cap = '#c0392b';
  m.cylY(0, 0, 0, 8, 1.6, stalk);
  m.discY(0, 0, 0, 2.4, stalk);
  for (let i = 0; i <= 4; i++) m.discY(0, 9 + i, 0, 6 - i * 1.2, cap);
  m.discY(0, 8, 0, 5, shade('#f0d8c0', 1), M.EMISSIVE);          // gills
  m.map((c, x, y, z) => (c === VOX.util.rgb(cap) && hash01(x, y, z) < 0.16 ? '#f2f0e8' : c));
  m.grain(0.06, (c) => c === VOX.util.rgb(stalk));
});

/* ------------------------------------------------------------------ flowers */

scenery('flower-patch', { tags: ['plant', 'filler', 'ground'], note: 'A ground tile you can scatter: grass tufts and four colours of bloom.' }, (m, kit) => {
  const colors = ['#e8d24a', '#d85a7a', '#7a9fe8', '#f0f0f0'];
  for (let x = -7; x <= 7; x++) for (let z = -7; z <= 7; z++) {
    if (Math.hypot(x, z) > 7.2) continue;
    m.set(x, 0, z, hash01(x, 1, z) < 0.4 ? shade(P.grass, 0.86) : P.grass);
  }
  for (let i = 0; i < 26; i++) {
    const x = Math.round((hash01(i, 3, 1) - 0.5) * 13);
    const z = Math.round((hash01(i, 7, 2) - 0.5) * 13);
    if (Math.hypot(x, z) > 6.4) continue;
    const h = 1 + Math.floor(hash01(i, 9, 3) * 3);
    m.box(x, 1, z, x, h, z, '#4a8a3a');
    if (h > 1) m.set(x, h + 1, z, colors[Math.floor(hash01(i, 11, 4) * colors.length)]);
  }
});

/* -------------------------------------------------------------------- fence */

scenery('fence', { tags: ['built', 'boundary'], note: 'Three posts and two rails — a repeating segment, not a one-off.' }, (m, kit) => {
  const wood = P.wood;
  for (const x of [-10, 0, 10]) {
    m.box(x - 1, 0, -1, x + 1, 9, 1, wood);
    m.box(x - 1, 10, -1, x + 1, 10, 1, shade(wood, 0.8));
  }
  for (const y of [3, 7]) m.box(-10, y, 0, 10, y + 1, 0, shade(wood, 1.1));
  m.grain(0.13);
});

/* --------------------------------------------------------------------- well */

scenery('well', { tags: ['built', 'village', 'water'], note: 'Stone ring, timber frame, and a bucket on a rope.' }, (m, kit) => {
  const stone = P.stone, wood = P.woodDark;
  for (let y = 0; y <= 4; y++) {
    for (let x = -6; x <= 6; x++) for (let z = -6; z <= 6; z++) {
      const d = Math.hypot(x, z);
      if (d > 3.6 && d < 6.4) m.set(x, y, z, stone);
    }
  }
  m.grain(0.16);
  m.discY(0, 0, 0, 3.6, P.water);
  m.map((c, x, y, z) => (c === VOX.util.rgb(P.water) ? { color: c, material: M.GLASS } : c));
  for (const x of [-5, 5]) m.box(x, 5, -1, x, 14, 1, wood);      // uprights
  m.box(-6, 15, -3, 6, 15, 3, wood);                             // roof beam
  m.gable(-7, 7, -5, 5, 16, P.tile, 0, 0);
  m.cylX(13, 0, -4, 4, 1.2, wood);                               // winch
  m.box(4, 13, 0, 6, 13, 0, wood);
  m.box(0, 8, 0, 0, 12, 0, '#c9b48c');                           // rope
  m.box(-2, 6, -2, 2, 8, 2, '#5a4a32');                          // bucket
  m.box(-2, 8, -2, 2, 8, 2, '#6a5a42');
});

/* --------------------------------------------------------------- campfire */

scenery('campfire', { tags: ['light', 'glow', 'camp'], note: 'A ring of stones, four logs and a fire. Save point in a hundred games.' }, (m, kit) => {
  for (let a = 0; a < 12; a++) {
    const angle = (a / 12) * Math.PI * 2;
    const x = Math.round(Math.cos(angle) * 6), z = Math.round(Math.sin(angle) * 6);
    m.ellipsoid(x, 1, z, 1.8, 1.4, 1.8, P.stone);
  }
  m.grain(0.16);
  m.box(-5, 0, -5, 5, 0, 5, '#3a3228');
  for (const [x, z, r] of [[-3, 0, 0], [3, 0, 0], [0, -3, 1], [0, 3, 1]]) {
    if (r) m.cylZ(x, 2, z - 3, z + 3, 1.4, P.woodDark);
    else m.cylX(2, z, x - 3, x + 3, 1.4, P.woodDark);
  }
  kit.flame(m, 0, 3, 0, { r: 3.2, h: 6 });
});

/* ------------------------------------------------------------- gravestone */

scenery('gravestone', { tags: ['graveyard', 'spooky'], note: 'Leaning, chipped, and mossy on the north side.' }, (m, kit) => {
  const stone = '#8a8f9a';
  m.box(-5, 0, -3, 5, 1, 3, shade(stone, 0.82));
  m.box(-4, 1, -2, 4, 11, 1, stone);
  m.discY(0, 12, 0, 4, stone);
  m.remove(-5, 12, 2, 5, 12, 4);
  m.remove(-5, 12, -4, 5, 12, -3);
  m.box(-2, 5, 2, 2, 9, 2, shade(stone, 0.9));                   // inscription panel
  m.box(-1, 6, 3, 1, 8, 3, shade(stone, 0.72));
  m.box(0, 5, 3, 0, 9, 3, shade(stone, 0.72));
  m.grain(0.13);
  m.map((c, x, y, z) => (z < 0 && hash01(x, y, z) < 0.3 ? '#5a7a4a' : c));
  m.remove(-6, 0, -6, 6, 0, -4);
});

/* ---------------------------------------------------------------- signpost */

scenery('signpost', { tags: ['built', 'road'], note: 'Two arms pointing opposite ways, because one always looks broken.' }, (m, kit) => {
  const wood = P.wood;
  m.box(-1, 0, -1, 1, 16, 1, P.woodDark);
  m.box(2, 11, -1, 9, 14, 0, wood);
  m.box(9, 12, -1, 10, 13, 0, wood);
  m.box(-9, 5, 0, -2, 8, 1, wood);
  m.box(-10, 6, 0, -9, 7, 1, wood);
  m.grain(0.14);
  m.box(3, 12, -2, 8, 13, -2, shade(wood, 1.2));
  m.box(-8, 6, 2, -3, 7, 2, shade(wood, 1.2));
  m.discY(0, 0, 0, 3, P.grass);
});

/* --------------------------------------------------------------- tree stump */

scenery('stump', { tags: ['forest', 'filler'], note: 'Rings on the cut, roots at the base, one axe notch.' }, (m, kit) => {
  const bark = '#5a4028', inner = '#b08b57';
  m.cylY(0, 0, 0, 5, 4.2, bark);
  m.discY(0, 5, 0, 4.2, inner);
  m.map((c, x, y, z) => (y === 5 && Math.round(Math.hypot(x, z)) % 2 === 0 ? shade(inner, 0.86) : c));
  for (const [x, z] of [[4, 1], [-4, -1], [1, 4], [-2, -4], [3, -3]]) {
    m.ellipsoid(x, 0, z, 2, 1, 2, bark);
  }
  m.remove(2, 4, 2, 5, 5, 5);
  m.grain(0.13);
  m.remove(-9, -9, -9, 9, -1, 9);
});

})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ===== 16-buildings.js =================================================== */

/* ---------------------------------------------------------------------------
   Buildings.

   Structures with a footprint you can walk around, and — where it costs
   nothing — an interior floor, because a doorway with a void behind it reads
   as scenery rather than architecture. Doorways are seven voxels clear, which
   is two more than the kit humanoid needs, and floors are at y = 1 so a
   threshold step exists.

   These are the largest models in the catalogue at 20-40 voxels a side. Even
   the biggest mesh to under 4,000 triangles after greedy merging, which is
   what makes a street of them cheap.
   --------------------------------------------------------------------------- */

(function (root) {
'use strict';

const VOX = root.VOX;
const P = VOX.palette;
const { shade, hash01 } = VOX.util;
const M = VOX.MATERIAL;

const building = (name, options, build) => VOX.define(Object.assign(
  { name, category: 'buildings', build }, options,
));

/** Timber framing: uprights, a sill and a head, over whatever wall is there. */
function timbers(m, hx, hz, y0, y1, color) {
  for (const z of [-hz, hz]) {
    for (let x = -hx; x <= hx; x += 4) m.box(x, y0, z, x, y1, z, color);
    m.box(-hx, y1, z, hx, y1, z, color);
  }
  for (const x of [-hx, hx]) {
    for (let z = -hz; z <= hz; z += 4) m.box(x, y0, z, x, y1, z, color);
    m.box(x, y1, -hz, x, y1, hz, color);
  }
}

VOX.kit.timbers = timbers;

/* ----------------------------------------------------------------- cottage */

building('cottage', { tags: ['village', 'house', 'medieval'], note: 'Plaster and timber under a thatched gable, with a chimney that smokes.' }, (m, kit) => {
  const s = kit.shell(m, {
    w: 17, d: 15, h: 9, wall: '#ddd2b8', trim: '#5a4028', floor: P.plank,
    roof: 'gable', roofColor: P.thatch, base: P.stoneDark, overhang: 2,
  });
  timbers(m, s.hx, s.hz, s.y0, s.y0 + 9, '#5a4028');
  m.grain(0.07);
  /* thatch wants texture more than any other surface here */
  m.map((c, x, y, z) => (c === VOX.util.rgb(P.thatch)
    ? shade(c, 0.86 + hash01(x, y, z) * 0.3) : c));
  /* chimney */
  m.box(5, s.y0 + 6, -6, 8, 20, -3, P.brick);
  m.map((c, x, y, z) => (c === VOX.util.rgb(P.brick) && y % 2 === 0 ? shade(c, 0.88) : c));
  m.box(4, 20, -7, 9, 21, -2, shade(P.brick, 0.8));
  m.remove(6, 21, -5, 7, 21, -4);
  /* doorstep and a lamp beside the door */
  m.box(-2, 0, 8, 2, 0, 9, P.stoneDark);
  m.box(4, s.y0 + 5, 8, 4, s.y0 + 5, 8, '#ffd98a', M.EMISSIVE);
});

/* -------------------------------------------------------------- stone hut */

building('hut', { tags: ['village', 'house', 'small'], note: 'The cheapest building that still reads as a home.' }, (m, kit) => {
  const s = kit.shell(m, {
    w: 11, d: 11, h: 7, wall: '#9a9384', trim: '#6a6356', floor: P.dirt,
    roof: 'pyramid', roofColor: P.thatch, overhang: 1, windows: false,
  });
  m.box(-2, 1, 5, 2, 5, 5, '#3a2a1c');
  m.box(-4, 4, -5, -2, 5, -5, P.glassPane, M.GLASS);
  m.grain(0.13);
  m.map((c, x, y, z) => (c === VOX.util.rgb(P.thatch) ? shade(c, 0.84 + hash01(x, y, z) * 0.32) : c));
  m.box(-6, 0, -6, 6, 0, 6, P.dirt);
});

/* ------------------------------------------------------------------- shop */

building('shop', { tags: ['town', 'trade'], note: 'Two storeys, an awning over the counter, and a sign on an arm.' }, (m, kit) => {
  const s = kit.shell(m, {
    w: 15, d: 13, h: 8, wall: '#c8b48f', trim: '#6a4a30', floor: P.plank,
    roof: 'flat', roofColor: '#6a4a30', overhang: 1, windows: false, door: false,
  });
  /* shopfront: a wide opening with a counter */
  m.remove(-5, 1, 6, 5, 6, 6);
  m.box(-5, 1, 5, 5, 3, 6, '#8a6a45');
  m.box(-6, 4, 6, 6, 4, 6, '#6a4a30');
  /* upper storey, jettied out over the street */
  m.boxShell(-8, 10, -7, 8, 17, 7, '#d8cbaa');
  m.box(-8, 9, -7, 8, 9, 7, '#6a4a30');
  timbers(m, 8, 7, 10, 17, '#6a4a30');
  m.box(-3, 12, 7, 3, 15, 7, P.glassPane, M.GLASS);
  m.box(0, 12, 7, 0, 15, 7, '#6a4a30');
  m.gable(-9, 9, -8, 8, 18, '#8c4a3c', 0, 1);
  /* striped awning */
  for (let i = 0; i <= 4; i++) {
    m.box(-6, 8 - i, 7 + i, 6, 8 - i, 7 + i, i % 2 ? '#c0392b' : '#e8e0d0');
  }
  /* hanging sign */
  m.box(9, 14, 4, 12, 14, 4, '#6a4a30');
  m.box(11, 10, 3, 11, 13, 5, '#8a6a45');
  m.box(11, 11, 6, 11, 12, 6, P.gold, M.METAL);
  m.grain(0.06);
});

/* ------------------------------------------------------------ stone tower */

building('stone-tower', { tags: ['castle', 'wizard', 'tall'], note: 'A round tower: crenellations, arrow slits and a lit window.' }, (m, kit) => {
  const stone = P.stone;
  for (let y = 0; y <= 34; y++) {
    const r = y < 3 ? 9.5 - y * 0.4 : 8;
    for (let x = -10; x <= 10; x++) for (let z = -10; z <= 10; z++) {
      const d = Math.hypot(x, z);
      if (d < r && d > r - 2.2) m.set(x, y, z, stone);
    }
  }
  m.grain(0.16);
  /* courses: every fourth ring a shade darker */
  m.map((c, x, y, z) => (y % 4 === 0 ? shade(c, 0.9) : c));
  m.box(-2, 1, 6, 2, 7, 9, '#3a2a1c');                           // door
  for (const y of [13, 22]) {
    m.box(-1, y, 6, 1, y + 3, 9, P.shadow);
    m.box(0, y, 7, 0, y + 3, 8, '#ffd98a', M.EMISSIVE);
  }
  m.box(-9, 17, -1, -6, 20, 1, P.shadow);                        // arrow slits
  m.box(6, 26, -1, 9, 29, 1, P.shadow);
  /* corbelled top, then crenellations */
  for (let x = -11; x <= 11; x++) for (let z = -11; z <= 11; z++) {
    const d = Math.hypot(x, z);
    if (d < 10 && d > 7.4) m.box(x, 35, z, x, 36, z, shade(stone, 0.86));
  }
  for (let a = 0; a < 16; a++) {
    const angle = (a / 16) * Math.PI * 2;
    const x = Math.round(Math.cos(angle) * 8.6), z = Math.round(Math.sin(angle) * 8.6);
    if (a % 2 === 0) m.box(x, 37, z, x, 39, z, stone);
  }
  m.discY(0, 35, 0, 7.6, P.plank);
});

/* ---------------------------------------------------------------- windmill */

building('windmill', { tags: ['village', 'landmark'], note: 'A tapered tower, a cap, and four sails on a real hub.' }, (m, kit) => {
  const stone = '#c8bda8';
  for (let y = 0; y <= 26; y++) {
    const r = 9 - y * 0.22;
    for (let x = -10; x <= 10; x++) for (let z = -10; z <= 10; z++) {
      const d = Math.hypot(x, z);
      if (d < r && d > r - 2.4) m.set(x, y, z, stone);
    }
  }
  m.grain(0.1);
  m.box(-2, 1, 6, 2, 7, 9, '#5a4028');
  m.box(-1, 12, 5, 1, 14, 8, P.glassPane, M.GLASS);
  m.box(-8, 18, -1, -5, 20, 1, P.glassPane, M.GLASS);
  /* cap */
  for (let i = 0; i <= 5; i++) m.discY(0, 27 + i, 0, 6.4 - i * 0.9, '#7a4c46');
  m.discY(0, 27, 0, 7, '#5a3830');
  /* sails: four arms on a hub at the front, with slats */
  const hubZ = 8;
  m.cylZ(0, 22, hubZ, hubZ + 3, 1.6, '#5a4028');
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    for (let i = 3; i <= 16; i++) {
      m.set(dx * i, 22 + dy * i, hubZ + 3, '#6a5038');
      if (i > 4 && i % 2 === 0) {
        m.set(dx * i - dy * 2, 22 + dy * i + dx * 2, hubZ + 3, '#d8cbaa');
        m.set(dx * i - dy, 22 + dy * i + dx, hubZ + 3, '#d8cbaa');
      }
    }
  }
});

/* -------------------------------------------------------------- lighthouse */

building('lighthouse', { tags: ['coast', 'landmark', 'glow'], note: 'Red and white bands, a glazed lamp room, and the lamp is the light.' }, (m, kit) => {
  for (let y = 0; y <= 30; y++) {
    const r = 8.5 - y * 0.16;
    const band = Math.floor(y / 6) % 2 ? '#c0392b' : '#f0ece0';
    for (let x = -9; x <= 9; x++) for (let z = -9; z <= 9; z++) {
      const d = Math.hypot(x, z);
      if (d < r && d > r - 2.2) m.set(x, y, z, band);
    }
  }
  m.grain(0.07);
  m.box(-2, 1, 5, 2, 7, 8, '#3a4152');
  /* gallery */
  m.discY(0, 31, 0, 7.4, '#3a4152', M.METAL);
  m.discY(0, 32, 0, 7.4, '#3a4152', M.METAL);
  m.remove(-6, 32, -6, 6, 32, 6);
  for (let a = 0; a < 12; a++) {
    const angle = (a / 12) * Math.PI * 2;
    m.box(Math.round(Math.cos(angle) * 6.6), 32, Math.round(Math.sin(angle) * 6.6), Math.round(Math.cos(angle) * 6.6), 34, Math.round(Math.sin(angle) * 6.6), '#3a4152', M.METAL);
  }
  /* lamp room */
  for (let y = 33; y <= 38; y++) {
    for (let x = -5; x <= 5; x++) for (let z = -5; z <= 5; z++) {
      const d = Math.hypot(x, z);
      if (d < 5 && d > 3.6) m.set(x, y, z, P.glassPane, M.GLASS);
    }
  }
  m.sphere(0, 36, 0, 3, '#fff3c0', M.EMISSIVE);
  for (let i = 0; i <= 4; i++) m.discY(0, 39 + i, 0, 5.4 - i * 1.1, '#3a4152', M.METAL);
  m.set(0, 44, 0, '#c0392b', M.EMISSIVE);
});

/* ------------------------------------------------------------- watchtower */

building('watchtower', { tags: ['military', 'wood', 'outpost'], note: 'Four legs, a ladder, and a platform with a rail.' }, (m, kit) => {
  const wood = P.wood, dark = P.woodDark;
  for (const [x, z] of [[-7, -7], [7, -7], [-7, 7], [7, 7]]) {
    for (let y = 0; y <= 18; y++) {
      const lean = Math.round((18 - y) * 0.16);
      m.box(x > 0 ? x - lean : x + lean, y, z > 0 ? z - lean : z + lean,
        x > 0 ? x - lean + 1 : x + lean - 1, y, z > 0 ? z - lean + 1 : z + lean - 1, wood);
    }
  }
  for (const y of [6, 13]) {                                     // cross braces
    m.box(-8, y, -8, 8, y, -7, dark); m.box(-8, y, 7, 8, y, 8, dark);
    m.box(-8, y, -8, -7, y, 8, dark); m.box(7, y, -8, 8, y, 8, dark);
  }
  m.box(-9, 19, -9, 9, 20, 9, wood);                             // platform
  m.remove(-3, 19, 4, 0, 20, 9);                                 // hatch
  for (const [x0, z0, x1, z1] of [[-9, -9, 9, -8], [-9, 8, 9, 9], [-9, -9, -8, 9], [8, -9, 9, 9]]) {
    m.box(x0, 21, z0, x1, 23, z1, dark);
    m.remove(x0 + 1, 22, z0, x1 - 1, 22, z1);
  }
  m.gable(-10, 10, -10, 10, 27, '#7a4c46', 0, 1);
  for (const [x, z] of [[-8, -8], [8, -8], [-8, 8], [8, 8]]) m.box(x, 24, z, x, 26, z, wood);
  for (let y = 0; y <= 19; y += 2) m.box(-2, y, 9, 0, y, 9, dark);   // ladder rungs
  m.box(-2, 0, 10, -2, 19, 10, wood);
  m.box(0, 0, 10, 0, 19, 10, wood);
  m.grain(0.12);
});

/* --------------------------------------------------------------- castle gate */

building('castle-gate', { tags: ['castle', 'military', 'landmark'], note: 'Two drum towers, a portcullis and a banner over the arch.' }, (m, kit) => {
  const stone = '#8f95a5', dark = '#5f6572';
  /* curtain wall between the towers */
  m.box(-8, 0, -5, 8, 20, 5, stone);
  m.remove(-5, 1, -6, 5, 13, 6);
  for (let i = 0; i <= 5; i++) m.box(-5 + i, 14 + i, -6, 5 - i, 14 + i, 6, stone);
  m.remove(-4, 14, -6, 4, 16, 6);
  /* towers */
  for (const cx of [-14, 14]) {
    for (let y = 0; y <= 26; y++) {
      const r = y < 2 ? 8 : 7;
      for (let x = -8; x <= 8; x++) for (let z = -8; z <= 8; z++) {
        const d = Math.hypot(x, z);
        if (d < r && d > r - 2.4) m.set(cx + x, y, z, stone);
      }
    }
    for (let a = 0; a < 12; a++) {
      const angle = (a / 12) * Math.PI * 2;
      const x = Math.round(Math.cos(angle) * 6), z = Math.round(Math.sin(angle) * 6);
      if (a % 2 === 0) m.box(cx + x, 27, z, cx + x, 29, z, stone);
    }
    m.discY(cx, 26, 0, 5.6, P.plank);
    m.box(cx - 1, 12, 5, cx + 1, 15, 7, P.shadow);
  }
  m.grain(0.15);
  m.map((c, x, y, z) => (y % 5 === 0 ? shade(c, 0.92) : c));
  /* portcullis */
  for (let x = -5; x <= 5; x += 2) m.box(x, 1, 4, x, 13, 4, dark, M.METAL);
  for (let y = 1; y <= 13; y += 3) m.box(-5, y, 4, 5, y, 4, dark, M.METAL);
  /* battlements along the wall, and a banner */
  for (let x = -8; x <= 8; x += 2) m.box(x, 21, -5, x, 23, 5, stone);
  m.box(-3, 15, 6, 3, 20, 6, '#8c2f3c');
  m.box(-3, 15, 6, 3, 15, 6, P.gold, M.METAL);
  m.box(-1, 17, 7, 1, 19, 7, P.gold, M.METAL);
});

/* -------------------------------------------------------------------- tent */

building('tent', { tags: ['camp', 'cloth', 'small'], note: 'Panelled canvas over a solid A-frame, with the flap rolled back to one side.' }, (m, kit) => {
  const canvas = '#d8cdb0', stripe = '#a8493f';
  /* Built solid and left solid. A one-voxel-thick 45-degree slope is not
     watertight — consecutive courses only meet at an edge, so you can see
     straight through the diagonal — and thickening the courses puts a lit
     ledge on every row, which reads as slats rather than cloth. The interior
     faces are culled by the mesher either way, so a solid prism is both the
     cheapest and the best-looking answer. */
  /* Panels are a half-shade apart, not two different colours: a stepped slope
     already draws a hard line on every course, and crossing that with strong
     stripes turns a tent into a set of slats. The one strong colour is the hem. */
  const panel = z => ((z + 24) % 6 < 2 ? shade(canvas, 0.93) : canvas);
  for (let i = 0; i <= 9; i++) {
    const w = 9 - i;
    for (let z = -9; z <= 9; z++) m.box(-w, i, z, w, i, z, panel(z));
  }
  m.box(-9, 0, -9, 9, 0, 9, stripe);
  m.grain(0.05);
  /* doorway: a recess deep enough to read as an opening */
  m.remove(-3, 0, 6, 3, 6, 9);
  m.box(-3, 0, 6, 3, 0, 9, '#9a8f78');
  m.box(3, 0, 9, 4, 6, 10, stripe);                              // rolled flap
  m.box(-4, 0, 9, -3, 6, 9, stripe);
  m.box(-3, 7, 9, 3, 7, 10, canvas);
  /* ridge pole, guys and pegs */
  m.box(0, 10, -11, 0, 10, 11, P.woodDark);
  for (const [x, z] of [[-12, -12], [12, -12], [-12, 12], [12, 12]]) {
    m.line(0, 10, z > 0 ? 9 : -9, x, 1, z, '#c9b48c');
    m.box(x, 0, z, x, 1, z, P.woodDark);
  }
});

})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ===== 17-vehicles.js ==================================================== */

/* ---------------------------------------------------------------------------
   Vehicles.

   Things that move. Each is built facing +Z with its origin at the contact
   point — wheel bottom, keel, landing skid — so a game can put one on the
   ground at y = 0 and drive it forward without an offset table.

   Wheels are the only genuinely awkward shape in voxels. They are built as a
   filled disc minus a smaller disc, in the XY plane, which reads as a wheel
   from every angle that matters and costs nothing.
   --------------------------------------------------------------------------- */

(function (root) {
'use strict';

const VOX = root.VOX;
const P = VOX.palette;
const { shade, hash01 } = VOX.util;
const M = VOX.MATERIAL;

const vehicle = (name, options, build) => VOX.define(Object.assign(
  { name, category: 'vehicles', build }, options,
));

/**
 * A spoked wheel. Two orientations, because both are needed and getting the
 * axle wrong is the single easiest mistake to make here:
 *   wheelZ — disc in the XY plane, axle along Z (a wheel seen head-on)
 *   wheelX — disc in the YZ plane, axle along X (a wheel on the side of a
 *            vehicle facing +Z, which is nearly always the one you want)
 */
function wheelZ(m, cx, cy, z0, z1, r, rim, hub, spokes = 6) {
  for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d <= r && d > r - 1.6) m.box(x, y, z0, x, y, z1, rim);
    }
  }
  for (let i = 0; i < spokes; i++) {
    const angle = (i / spokes) * Math.PI * 2 + 0.3;
    m.line(cx, cy, z0, cx + Math.round(Math.cos(angle) * (r - 1)), cy + Math.round(Math.sin(angle) * (r - 1)), z0, hub);
  }
  m.box(cx - 1, cy - 1, z0, cx + 1, cy + 1, z1, hub);
}

function wheelX(m, cy, cz, x0, x1, r, rim, hub, spokes = 6) {
  /* spokes = 0 gives a filled tyre — what a road wheel wants at this size. */
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++) {
      const d = Math.hypot(y - cy, z - cz);
      if (d <= r && (spokes > 0 ? d > r - 1.6 : true)) m.box(x0, y, z, x1, y, z, rim);
    }
  }
  const face = x1 >= x0 ? x1 : x0;
  for (let i = 0; i < spokes; i++) {
    const angle = (i / spokes) * Math.PI * 2 + 0.3;
    m.line(face, cy, cz, face, cy + Math.round(Math.sin(angle) * (r - 1)), cz + Math.round(Math.cos(angle) * (r - 1)), hub);
  }
  m.box(x0, cy - 1, cz - 1, x1, cy + 1, cz + 1, hub);
}

Object.assign(VOX.kit, { wheelX, wheelZ });

/* -------------------------------------------------------------------- cart */

vehicle('cart', { tags: ['medieval', 'transport'], note: 'Two wheels, a bed of planks, and shafts for something to pull it.' }, (m, kit) => {
  const wood = P.wood, dark = P.woodDark;
  m.box(-6, 6, -9, 6, 7, 6, wood);                               // bed
  for (let z = -9; z <= 6; z += 3) m.box(-6, 7, z, 6, 7, z, shade(wood, 0.88));
  m.box(-7, 8, -10, 7, 13, -9, dark);                            // sides
  m.box(-7, 8, -10, -6, 13, 6, dark);
  m.box(6, 8, -10, 7, 13, 6, dark);
  m.grain(0.12);
  m.box(-8, 4, -2, 8, 5, 2, dark);                               // axle
  wheelX(m, 5, 0, -9, -8, 5.5, dark, shade(wood, 1.1));
  wheelX(m, 5, 0, 8, 9, 5.5, dark, shade(wood, 1.1));
  m.box(-5, 6, 7, -4, 7, 16, wood);                              // shafts
  m.box(4, 6, 7, 5, 7, 16, wood);
  m.box(-5, 6, 15, 5, 7, 16, wood);
  /* a bit of cargo, so it does not read as an empty box */
  m.box(-4, 8, -7, 0, 11, -2, '#8a6a45');
  m.box(1, 8, -6, 5, 10, -1, '#7a8a6a');
});

/* ----------------------------------------------------------------- sailboat */

vehicle('sailboat', { tags: ['water', 'transport'], note: 'Clinker hull, one mast, and a sail with a curve in it.' }, (m, kit) => {
  const hull = '#7a5533', trim = '#4e3520', sail = '#e8e2d0';
  /* hull: a tapered tub, wider and taller towards the stern */
  for (let z = -14; z <= 14; z++) {
    const t = (z + 14) / 28;
    const w = Math.round(5 - Math.abs(t - 0.42) * 5.5);
    const top = 7 - Math.round(Math.abs(t - 0.45) * 3);
    if (w < 1) continue;
    for (let y = 0; y <= top; y++) {
      const taper = y < 2 ? w - (2 - y) : w;
      m.box(-taper, y, z, taper, y, z, y % 3 === 0 ? trim : hull);
    }
  }
  m.grain(0.1);
  for (let z = -12; z <= 12; z++) {                               // hollow it out
    for (let x = -4; x <= 4; x++) m.clear(x, 7, z), m.clear(x, 6, z);
  }
  m.box(-4, 5, -12, 4, 5, 12, '#5a4028');                        // deck floor
  m.box(-4, 6, -6, 4, 6, -4, trim);                              // thwart
  m.box(-4, 6, 6, 4, 6, 8, trim);
  /* Mast and a square sail across the beam. A fore-and-aft sail is edge-on
     from three-quarter view and disappears; a square one always shows. */
  m.box(-1, 6, -1, 1, 30, 1, trim);
  m.box(-9, 28, -1, 9, 28, 0, trim);                             // yard
  for (let y = 12; y <= 27; y++) {
    const spread = 9 - Math.round((27 - y) * 0.12);
    const belly = Math.round(Math.sin(((y - 12) / 15) * Math.PI) * 2.5);
    for (let x = -spread; x <= spread; x++) {
      const bow = Math.round(belly * (1 - Math.abs(x) / (spread + 1)));
      m.set(x, y, bow, x % 4 === 0 ? shade(sail, 0.93) : sail);
    }
  }
  m.box(-9, 11, 0, 9, 11, 0, trim);                              // foot
  for (const x of [-9, 9]) m.line(x, 11, 0, x > 0 ? 4 : -4, 7, 3, '#c9b48c');
  m.box(-1, 31, -1, 1, 32, 1, '#c0392b');                        // pennant
  m.box(-1, 31, 2, 1, 32, 5, '#c0392b');
});

/* ---------------------------------------------------------------- minecart */

vehicle('minecart', { tags: ['mine', 'rail', 'small'], note: 'A tub on a frame, with a rail section under it.' }, (m, kit) => {
  const iron = '#6a6f7e', wood = P.woodDark;
  m.boxShell(-5, 4, -7, 5, 11, 7, iron, M.METAL);
  m.remove(-4, 11, -6, 4, 11, 6);
  m.box(-5, 4, -7, 5, 4, 7, iron, M.METAL);
  for (const z of [-6, 0, 6]) m.box(-6, 5, z, 6, 10, z, shade(iron, 0.8), M.METAL);
  m.box(-4, 8, -6, 4, 10, 6, '#3a3a44');                         // ore inside
  m.map((c, x, y, z) => (y === 10 && hash01(x, y, z) < 0.2 ? P.gem : c));
  m.box(-4, 2, -5, 4, 3, -3, iron, M.METAL);                     // trucks
  m.box(-4, 2, 3, 4, 3, 5, iron, M.METAL);
  for (const z of [-4, 4]) {
    wheelX(m, 2, z, -6, -5, 2.4, '#4a4f5e', '#8a8f9e', 4);
    wheelX(m, 2, z, 5, 6, 2.4, '#4a4f5e', '#8a8f9e', 4);
  }
  /* a length of track, so the cart has something to stand on */
  m.box(-8, 0, -12, 8, 0, 12, wood);
  for (let z = -12; z <= 12; z += 3) m.box(-8, 0, z, 8, 0, z, shade(wood, 0.82));
  m.box(-6, 1, -12, -5, 1, 12, iron, M.METAL);
  m.box(5, 1, -12, 6, 1, 12, iron, M.METAL);
});

/* --------------------------------------------------------------------- car */

vehicle('car', { tags: ['modern', 'road'], note: 'A modern silhouette in as few voxels as it takes: bonnet, cabin, boot.' }, (m, kit) => {
  const body = '#c0392b', glass = '#9fd6e8', tyre = '#23262e';
  m.box(-6, 3, -16, 6, 8, 16, body);                             // main body
  m.box(-6, 9, -8, 6, 13, 6, body);                              // cabin
  m.box(-7, 4, -14, 7, 7, 14, shade(body, 0.86));                // sill
  m.map((c, x, y, z) => (y === 8 || y === 13 ? shade(c, 1.12) : c));
  /* glass all round the cabin */
  m.box(-5, 10, 6, 5, 12, 7, glass, M.GLASS);
  m.box(-5, 10, -9, 5, 12, -8, glass, M.GLASS);
  m.box(-7, 10, -7, -6, 12, 5, glass, M.GLASS);
  m.box(6, 10, -7, 7, 12, 5, glass, M.GLASS);
  m.box(-5, 14, -8, 5, 14, 6, shade(body, 0.9));                 // roof
  /* lights and grille */
  m.box(-5, 6, 17, -3, 7, 17, '#fff3c0', M.EMISSIVE);
  m.box(3, 6, 17, 5, 7, 17, '#fff3c0', M.EMISSIVE);
  m.box(-5, 6, -17, -3, 7, -17, '#d63a3a', M.EMISSIVE);
  m.box(3, 6, -17, 5, 7, -17, '#d63a3a', M.EMISSIVE);
  m.box(-2, 5, 17, 2, 7, 17, '#3a3f4a', M.METAL);
  for (const z of [10, -10]) {
    m.remove(-8, 0, z - 4, 8, 6, z + 4);                         // arch
    wheelX(m, 4, z, -8, -6, 4.4, tyre, '#b9c2d2', 0);
    wheelX(m, 4, z, 6, 8, 4.4, tyre, '#b9c2d2', 0);
    m.box(-8, 4, z - 1, 8, 4, z + 1, '#7a828f', M.METAL);        // axle line
  }
});

/* ---------------------------------------------------------------- spaceship */

vehicle('spaceship', { tags: ['sci-fi', 'flying', 'glow'], note: 'Delta wing, canopy, three engines and a lit underside.' }, (m, kit) => {
  const hull = '#c8cede', dark = '#4a5162', glow = '#4fd4d8';
  /* fuselage */
  for (let z = -14; z <= 16; z++) {
    const t = (z + 14) / 30;
    const w = Math.round(4 - Math.abs(t - 0.35) * 3.4);
    const h = Math.round(4 - Math.abs(t - 0.4) * 3.2);
    if (w < 1 || h < 1) continue;
    m.box(-w, 6 - h, z, w, 6 + h, z, hull, M.METAL);
  }
  /* delta wings */
  for (let i = 0; i <= 12; i++) {
    const reach = 12 - i;
    m.box(-4 - reach, 5, -12 + i, 4 + reach, 6, -12 + i, hull, M.METAL);
  }
  m.box(-16, 5, -12, -14, 8, -8, dark, M.METAL);                 // wingtip fins
  m.box(14, 5, -12, 16, 8, -8, dark, M.METAL);
  m.box(-1, 7, -14, 1, 13, -9, dark, M.METAL);                   // tail fin
  /* canopy */
  m.box(-3, 9, 2, 3, 10, 9, glow, M.GLASS);
  m.box(-3, 8, 1, 3, 8, 10, dark, M.METAL);
  /* engines */
  for (const x of [-6, 0, 6]) {
    m.box(x - 2, 4, -15, x + 2, 8, -13, dark, M.METAL);
    m.box(x - 1, 5, -16, x + 1, 7, -16, glow, M.EMISSIVE);
  }
  /* running lights and a painted stripe */
  m.box(-4, 4, 6, -4, 4, 12, '#d63a5a', M.EMISSIVE);
  m.box(4, 4, 6, 4, 4, 12, glow, M.EMISSIVE);
  m.box(0, 10, 11, 0, 10, 16, dark, M.METAL);
  m.box(-2, 3, -6, 2, 3, 4, dark, M.METAL);
});

/* --------------------------------------------------------------- hot air balloon */

vehicle('balloon', { tags: ['flying', 'landmark'], note: 'Gores in four colours, a burner, and a wicker basket.' }, (m, kit) => {
  const gores = ['#c0392b', '#e8b53c', '#3f6b8c', '#e8e2d0'];
  /* envelope: a teardrop, coloured by the angle around the axis */
  for (let y = 10; y <= 40; y++) {
    const t = (y - 10) / 30;
    const r = Math.sin(Math.pow(t, 0.75) * Math.PI) * 13 + (1 - t) * 2;
    for (let x = -14; x <= 14; x++) for (let z = -14; z <= 14; z++) {
      const d = Math.hypot(x, z);
      if (d > r || d < r - 2) continue;
      const gore = Math.floor((Math.atan2(z, x) + Math.PI) / (Math.PI / 4)) % gores.length;
      m.set(x, y, z, gores[gore]);
    }
  }
  m.discY(0, 40, 0, 3, '#8a8f9e', M.METAL);
  /* ropes down to the basket */
  for (const [x, z] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) {
    m.line(x * 1.6, 12, z * 1.6, x, 7, z, '#8a7a5a');
  }
  /* burner and basket */
  m.box(-2, 8, -2, 2, 9, 2, '#6a6f7e', M.METAL);
  m.box(-1, 9, -1, 1, 11, 1, P.flame, M.EMISSIVE);
  m.boxShell(-5, 0, -5, 5, 7, 5, '#b08b57');
  m.remove(-4, 7, -4, 4, 7, 4);
  m.box(-5, 0, -5, 5, 0, 5, '#8a6a3f');
  m.map((c, x, y, z) => (y < 7 && y > 0 && c === VOX.util.rgb('#b08b57') && (y + x + z) % 2 === 0 ? shade(c, 0.86) : c));
  m.box(-5, 7, -5, 5, 7, 5, '#8a6a3f');
  m.remove(-4, 7, -4, 4, 7, 4);
});

})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ===== 18-backdrops.js =================================================== */

/* ---------------------------------------------------------------------------
   Backdrops.

   Set dressing for the far plane: wide, shallow, and deliberately low on
   detail, because anything behind the play area is read as a silhouette and a
   colour and nothing else. They are the largest models in the catalogue by
   voxel count and among the cheapest by triangle count — a heightfield is
   almost all interior, and the mesher throws every interior face away.

   Each is generated from a hashed heightfield rather than placed by hand, so
   the seed in the recipe is the whole design: change it and you get a
   different mountain range with the same character.
   --------------------------------------------------------------------------- */

(function (root) {
'use strict';

const VOX = root.VOX;
const P = VOX.palette;
const { shade, mix, hash01, rng } = VOX.util;
const M = VOX.MATERIAL;

const backdrop = (name, options, build) => VOX.define(Object.assign(
  { name, category: 'backdrops', build }, options,
));

/** Smooth-ish 1D noise: three hashed octaves, interpolated. */
function ridge(x, seed, scale, amplitude) {
  let total = 0, frequency = scale, weight = amplitude;
  for (let octave = 0; octave < 3; octave++) {
    const at = x / frequency;
    const i = Math.floor(at), t = at - i;
    const a = hash01(i, seed, octave), b = hash01(i + 1, seed, octave);
    const smooth = t * t * (3 - 2 * t);
    total += (a + (b - a) * smooth) * weight;
    frequency /= 2.2; weight /= 2.1;
  }
  return total;
}

/** 1 in the middle, easing to 0 at the edge — stops a heightfield ending in a cliff. */
function falloff(value, limit, softness = 0.35) {
  const t = Math.min(1, Math.abs(value) / limit);
  return t < 1 - softness ? 1 : Math.max(0, 1 - (t - (1 - softness)) / softness);
}

Object.assign(VOX.kit, { ridge, falloff });

/* --------------------------------------------------------- mountain range */

backdrop('mountain-range', { tags: ['terrain', 'far', 'snow'], note: 'Nine hashed peaks combined by max, so the range has summits instead of a plateau.' }, (m, kit) => {
  const rock = '#6a7080', snow = P.snow, scree = '#4e5464';

  /* Octave noise makes hills, not mountains: it has no notion of a summit, so
     a range built from it comes out either as foothills or — once you stretch
     it — as a wall with a jagged top. Placing explicit peaks and taking the
     highest one at each column gives a silhouette that reads as a range from
     the first glance, and the noise goes back to doing what it is good at,
     which is roughening the slopes. */
  const rand = rng(3);
  const peaks = [];
  for (let i = 0; i < 9; i++) {
    peaks.push({
      x: -28 + rand() * 56, z: -5 + rand() * 10,
      h: 13 + rand() * 21, r: 7 + rand() * 9,
    });
  }

  const heightAt = (x, z) => {
    let best = 0;
    for (const p of peaks) {
      const d = Math.hypot((x - p.x) * 0.62, (z - p.z) * 1.5) / p.r;
      if (d >= 1) continue;
      best = Math.max(best, p.h * Math.pow(1 - d, 1.25));
    }
    if (best <= 0) return 0;
    return Math.round((best + ridge(x * 2 + z, 7, 5, 2.4) - 1) * falloff(x, 31, 0.15));
  };

  for (let x = -30; x <= 30; x++) {
    for (let z = -7; z <= 7; z++) {
      const height = heightAt(x, z);
      for (let y = 0; y <= height; y++) {
        let color = rock;
        if (height > 20 && y > height - 4) color = snow;
        else if (height > 17 && y > height - 6 && hash01(x, y, z) < 0.5) color = snow;
        if (y < 3) color = scree;
        m.set(x, y, z, color);
      }
    }
  }
  m.map((c, x, y, z) => (hash01(x, y, z) < 0.22 ? shade(c, 0.88) : c));
  /* a lake at the foot, and pines along the shore */
  m.box(-30, 0, 8, 30, 0, 11, P.water, M.GLASS);
  for (let x = -28; x <= 28; x += 3) {
    if (hash01(x, 9, 1) < 0.45) continue;
    const h = 3 + Math.floor(hash01(x, 11, 2) * 3);
    const z = 6 + Math.round(hash01(x, 13, 3) * 2);
    for (let i = 0; i < h; i++) m.box(x - (h - i > 1 ? 1 : 0), i + 1, z - 1, x + (h - i > 1 ? 1 : 0), i + 1, z + 1, P.pine);
    m.set(x, 0, z, P.woodDark);
  }
});

/* --------------------------------------------------------------- forest line */

backdrop('forest-line', { tags: ['terrain', 'far', 'trees'], note: 'A hedge of canopies on a rolling bank — one silhouette, not forty trees.' }, (m, kit) => {
  for (let x = -28; x <= 28; x++) {
    for (let z = -8; z <= 8; z++) {
      const height = Math.round(2 + ridge(x + z, 7, 21, 5));
      for (let y = 0; y <= height; y++) {
        m.set(x, y, z, y === height ? (hash01(x, y, z) < 0.3 ? shade(P.grass, 0.86) : P.grass) : P.dirt);
      }
    }
  }
  /* canopies, packed close enough to merge into a treeline */
  const rand = rng(19);
  for (let i = 0; i < 34; i++) {
    const x = -27 + Math.round(rand() * 54);
    const z = -7 + Math.round(rand() * 13);
    const base = 2 + Math.round(ridge(x + z, 7, 21, 5));
    const h = 5 + Math.floor(rand() * 6);
    const r = 3 + rand() * 2.2;
    const leaf = rand() < 0.3 ? P.pine : rand() < 0.4 ? P.leafAutumn : P.leaf;
    m.cylY(x, z, base, base + h, 1.2, P.woodDark);
    if (leaf === P.pine) {
      for (let s = 0; s < 3; s++) m.cone(x, z, base + h - 2 + s * 2, base + h + s * 2 + 1, r - s * 0.7, 0.6, leaf);
    } else {
      m.ellipsoid(x, base + h + r * 0.5, z, r, r * 0.85, r, leaf);
    }
  }
  m.map((c, x, y, z) => {
    const h = hash01(x, y, z);
    return h < 0.26 ? shade(c, 0.82) : h > 0.84 ? shade(c, 1.14) : c;
  });
});

/* -------------------------------------------------------------- city skyline */

backdrop('city-skyline', { tags: ['modern', 'far', 'glow'], note: 'Towers on a grid, windows lit by a hash — the night is the point.' }, (m, kit) => {
  const rand = rng(31);
  const walls = ['#39404f', '#2f3542', '#454c5c', '#252b36'];
  for (let i = 0; i < 26; i++) {
    const x = -30 + Math.round(rand() * 60);
    const z = -10 + Math.round(rand() * 20);
    const w = 2 + Math.floor(rand() * 4);
    const d = 2 + Math.floor(rand() * 3);
    const h = 6 + Math.floor(rand() * 30) - Math.abs(z);
    if (h < 5) continue;
    const wall = walls[Math.floor(rand() * walls.length)];
    m.box(x - w, 0, z - d, x + w, h, z + d, wall);
    /* windows: a grid, two thirds of them lit */
    for (let y = 2; y < h - 1; y += 3) {
      for (let wx = x - w + 1; wx <= x + w - 1; wx += 2) {
        for (const wz of [z - d, z + d]) {
          if (hash01(wx, y, wz) < 0.34) continue;
          m.set(wx, y, wz, hash01(wx, y, wz + 5) < 0.5 ? '#ffe6a8' : '#a8d8ff', M.EMISSIVE);
        }
      }
      for (let wz = z - d + 1; wz <= z + d - 1; wz += 2) {
        for (const wx of [x - w, x + w]) {
          if (hash01(wx, y, wz) < 0.34) continue;
          m.set(wx, y, wz, '#ffe6a8', M.EMISSIVE);
        }
      }
    }
    /* roof furniture, so the skyline is not a row of flat tops */
    if (rand() < 0.5) m.box(x - 1, h + 1, z - 1, x + 1, h + 2 + Math.floor(rand() * 4), z + 1, shade(wall, 0.8));
    if (rand() < 0.3) { m.box(x, h + 1, z, x, h + 6, z, '#5a6070'); m.set(x, h + 7, z, '#d63a3a', M.EMISSIVE); }
  }
  m.box(-32, 0, -12, 32, 0, 12, '#232833');                      // ground plane
});

/* -------------------------------------------------------------- desert dunes */

backdrop('desert-dunes', { tags: ['terrain', 'far', 'desert'], note: 'Long dunes with a wind-shadow side, and one arch to break the line.' }, (m, kit) => {
  const duneAt = (x, z) => (2 + ridge(x * 0.55 + z * 1.6, 11, 13, 9) + Math.sin(x * 0.21) * 2.5)
    * falloff(x, 30, 0.25) * falloff(z, 10, 0.5);
  for (let x = -30; x <= 30; x++) {
    for (let z = -10; z <= 10; z++) {
      const height = Math.round(duneAt(x, z));
      for (let y = 0; y <= height; y++) {
        /* the lee side of a dune sits a shade darker */
        const lee = duneAt(x + 1, z) < height ? 0.9 : 1.04;
        m.set(x, y, z, shade(y === height ? P.sand : P.sandDark, lee));
      }
    }
  }
  m.map((c, x, y, z) => (hash01(x, y, z) < 0.18 ? shade(c, 1.06) : c));
  /* a rock arch, standing on the tallest ground it can find */
  const rock = '#a86a4a';
  const baseAt = x => Math.round(duneAt(x, -4));
  const ax = 12, ay = baseAt(ax);
  m.box(ax - 8, ay, -6, ax - 5, ay + 12, -2, rock);
  m.box(ax + 4, ay, -6, ax + 7, ay + 10, -2, rock);
  for (let i = 0; i <= 12; i++) {
    const y = ay + 12 + Math.round(Math.sin((i / 12) * Math.PI) * 3);
    m.box(ax - 8 + i, y - 2, -6, ax - 8 + i, y, -2, rock);
  }
  m.grain(0.14, (c, x, y, z) => c === VOX.util.rgb(rock));
  for (const [x, z] of [[-16, 4], [-14, 6], [20, 2]]) {          // scrub
    m.ellipsoid(x, baseAt(x) + 1, z, 2, 1.4, 2, '#8a8f5a');
  }
});

/* ----------------------------------------------------------- floating island */

backdrop('floating-island', { tags: ['fantasy', 'far', 'water'], note: 'Grass over a rock keel, a waterfall off the edge, and one tree.' }, (m, kit) => {
  /* top surface */
  for (let x = -18; x <= 18; x++) {
    for (let z = -14; z <= 14; z++) {
      const d = Math.hypot(x / 18, z / 14);
      if (d > 1) continue;
      const top = Math.round(3 - d * 3 + ridge(x + z * 2, 5, 9, 3));
      for (let y = top; y > top - 3; y--) m.set(x, y, z, y === top ? P.grass : P.dirt);
      /* the keel: everything below tapers to a point */
      const depth = Math.round((1 - d) * 22);
      for (let y = top - 3; y > top - 3 - depth; y--) {
        const shrink = (top - 3 - y) / Math.max(1, depth);
        if (Math.hypot(x / (18 * (1 - shrink * 0.92)), z / (14 * (1 - shrink * 0.92))) > 1) continue;
        m.set(x, y, z, shrink > 0.5 ? '#4a4048' : '#6a5f58');
      }
    }
  }
  m.map((c, x, y, z) => (hash01(x, y, z) < 0.24 ? shade(c, 0.86) : c));
  /* a pool that spills over the edge */
  m.discY(-6, 4, 4, 4, P.water, M.GLASS);
  m.discY(-6, 3, 4, 3, P.water, M.GLASS);
  for (let y = -14; y <= 3; y++) {
    const spread = 1 + Math.round((3 - y) * 0.12);
    m.box(-11 - spread, y, 3 - spread, -9, y, 5 + spread, P.water, M.GLASS);
  }
  /* one tree, and rocks along the rim */
  VOX.kit.tree(m, { height: 9, trunkR: 1.4, canopy: 'round', canopyR: 5, leaf: P.leaf, seed: 3 });
  m.translate(0, 0, 0);
  for (const [x, z] of [[10, -6], [13, 3], [-13, -8], [4, 10]]) {
    m.ellipsoid(x, Math.round(3 - Math.hypot(x / 18, z / 14) * 3) + 1, z, 2, 1.6, 2, '#7b8090');
  }
});

/* ---------------------------------------------------------------- cloud bank */

backdrop('cloud-bank', { tags: ['sky', 'far', 'soft'], note: 'Lobes on a hashed grid, flat underneath the way real cloud is.' }, (m, kit) => {
  const rand = rng(41);
  const white = '#f4f7fd', grey = '#cfd8e8';
  const puff = (cx, cy, cz, r) => {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
        for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++) {
          if (y < cy - r * 0.45) continue;                       // flat base
          const d = Math.hypot((x - cx) / r, (y - cy) / (r * 0.8), (z - cz) / r);
          if (d <= 1) m.set(x, y, z, y < cy - r * 0.2 ? grey : white);
        }
      }
    }
  };
  for (let i = 0; i < 3; i++) {
    const bank = -18 + i * 18;
    for (let j = 0; j < 7; j++) {
      puff(bank + Math.round((rand() - 0.5) * 16), 8 + rand() * 7, Math.round((rand() - 0.5) * 14), 4 + rand() * 4);
    }
  }
  m.map((c, x, y, z) => (hash01(x, y, z) < 0.16 ? shade(c, 1.03) : c));
  /* the flat base has to be level, or it reads as popcorn */
  const base = m.bounds().min[1];
  m.map((c, x, y, z) => (y < base + 3 ? mix(c, grey, 0.5) : c));
});

})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module === 'object' && module.exports) module.exports = globalThis.VOX;
