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
