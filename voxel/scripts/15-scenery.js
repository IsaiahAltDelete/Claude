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
