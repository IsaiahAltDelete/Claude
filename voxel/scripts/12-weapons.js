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
