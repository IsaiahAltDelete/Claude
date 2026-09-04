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
