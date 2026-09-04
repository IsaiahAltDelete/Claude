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
