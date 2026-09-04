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
