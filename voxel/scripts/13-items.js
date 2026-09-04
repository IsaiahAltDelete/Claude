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
