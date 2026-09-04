/* ---------------------------------------------------------------------------
   ClaudeVenture — people, and everything they wear.

   One body, built limb by limb rather than through the catalogue's `humanoid`
   helper, for one reason: that helper builds the x >= 0 half and mirrors it,
   which is exactly right for a model that stands still and exactly wrong for
   one that walks. A walk cycle is asymmetric by definition — left leg forward,
   right arm forward — so the limbs are placed individually here and the
   proportions are copied from the kit so the two still read as one world:

       feet 0..1 · legs 0..5 · torso 6..12 · head 13..18 · hair 19

   Everything above that is wardrobe. A garment is a function handed the body's
   anchors and a colour, so a chef's hat does not need to know how tall a head
   is — it asks. That is what lets fifty items go on any body, in any pose,
   in any combination, without a single hand-authored variant.
   --------------------------------------------------------------------------- */

(function (root) {
'use strict';

const VOX = root.VOX;
const CV = root.CV;
if (!VOX || !CV) throw new Error('ClaudeVenture: load 01-props.js first');

const { shade, mix, hsl, rng, hashString } = VOX.util;
const P = CV.P;
const M = VOX.MATERIAL;

/* ------------------------------------------------------------- anchors --- */

/* Where the body's landmarks are. Wardrobe reads these and never a literal, so
   raising the head by a voxel moves every hat in the game with it. */
const A = {
  half: 3,                       // torso and head half-width
  z0: -2, z1: 1,                 // torso depth
  headZ0: -3, headZ1: 2,         // the head is a voxel deeper than the body
  footY: 0, legY0: 2, legY1: 5,
  hipY: 6, chestY: 12,
  headY0: 13, headY1: 18, headTop: 19,
  armX: 4, armY0: 6, armY1: 12,
  eyeY: 16,
};

/* --------------------------------------------------------------- poses --- */

/* Four poses per character, swapped by the renderer as a flipbook. Legs and
   arms swing in opposite pairs, which is the whole trick — two frames of that
   plus a vertical bob is a convincing walk at this scale. */
const POSES = {
  idle: { legR: 0, legL: 0, armR: 0, armL: 0, arms: 'down', bob: 0 },
  stepA: { legR: 2, legL: -2, armR: -2, armL: 2, arms: 'down', bob: 1 },
  stepB: { legR: -2, legL: 2, armR: 2, armL: -2, arms: 'down', bob: 1 },
  carry: { legR: 0, legL: 0, armR: 0, armL: 0, arms: 'forward', bob: 0 },
  carryA: { legR: 2, legL: -2, armR: 0, armL: 0, arms: 'forward', bob: 1 },
  carryB: { legR: -2, legL: 2, armR: 0, armL: 0, arms: 'forward', bob: 1 },
  cheer: { legR: 0, legL: 0, armR: 0, armL: 0, arms: 'up', bob: 0 },
  sit: { legR: 0, legL: 0, armR: 0, armL: 0, arms: 'down', bob: 0, sit: true },
};
const POSE_NAMES = Object.keys(POSES);

/* ---------------------------------------------------------------- hair --- */

const HAIR = {
  bald(m, c) { /* nothing, and that is a style */ },
  short(m, c) {
    m.box(-3, 19, -3, 3, 19, 2, c);
    m.box(-3, 17, -3, 3, 18, -3, c);
    m.box(-3, 16, -3, -3, 18, 2, c);
    m.box(3, 16, -3, 3, 18, 2, c);
    m.box(-3, 18, 2, 3, 18, 2, c);
  },
  long(m, c) {
    HAIR.short(m, c);
    m.box(-3, 11, -4, 3, 18, -3, c);
    m.box(-3, 12, -3, -3, 16, 2, c);
    m.box(3, 12, -3, 3, 16, 2, c);
  },
  bun(m, c) {
    HAIR.short(m, c);
    m.sphere(0, 21, -1, 2.2, c);
    m.box(-1, 12, -4, 1, 16, -4, c);
  },
  ponytail(m, c) {
    HAIR.short(m, c);
    m.box(-1, 14, -5, 1, 18, -4, c);
    m.box(-1, 9, -5, 1, 13, -4, c);
  },
  spiky(m, c) {
    HAIR.short(m, c);
    for (const [x, z] of [[-2, -1], [0, 1], [2, -1], [-1, -2], [2, 1]]) {
      m.box(x, 20, z, x, 21, z, c);
      m.set(x, 22, z, c);
    }
  },
  curly(m, c) {
    m.box(-3, 19, -3, 3, 19, 2, c);
    m.box(-3, 16, -3, 3, 18, -3, c);
    for (const [x, y, z] of [[-3, 20, -1], [3, 20, -1], [0, 21, -1], [-2, 20, 1], [2, 20, 1], [0, 20, -3]]) {
      m.sphere(x, y, z, 1.6, c);
    }
    m.box(-3, 16, -3, -3, 18, 2, c);
    m.box(3, 16, -3, 3, 18, 2, c);
  },
  bob(m, c) {
    m.box(-3, 19, -3, 3, 19, 2, c);
    m.box(-3, 14, -4, 3, 18, -3, c);
    m.box(-4, 14, -3, -3, 18, 2, c);
    m.box(3, 14, -3, 4, 18, 2, c);
    m.box(-3, 18, 2, 3, 18, 2, c);
  },
};
const HAIR_STYLES = Object.keys(HAIR);

/* ======================================================== the wardrobe === */

/* Every item is `build(m, colour)` drawn onto a finished body. They are
   written whole rather than half-and-mirrored, because the body underneath is
   not symmetric once it is walking.

   `slot` is what it replaces, `rarity` is how hard it is to find, and `boost`
   is the small, honest bonus it carries — a hat that does nothing is a hat
   nobody equips, and a hat that doubles your income is the only hat anyone
   equips. Everything here is in the 2–12% band. */

const WEAR = [];
const wear = (slot, id, name, rarity, boost, build, tint) =>
  WEAR.push({ slot, id, name, rarity, boost, build, tint: tint || null });

/* --------------------------------------------------------------- hats --- */

wear('hat', 'chef-toque', 'Chef’s Toque', 'common', ['tips', 0.04], (m, c) => {
  m.box(-3, 19, -3, 3, 20, 2, shade(c, 0.9));
  m.box(-3, 21, -3, 3, 23, 2, c);
  for (const [x, z] of [[-2, -2], [2, -2], [0, 0], [-2, 1], [2, 1]]) m.sphere(x, 24, z, 1.6, c);
}, P.white);

wear('hat', 'cap', 'Ball Cap', 'common', ['speed', 0.04], (m, c) => {
  m.box(-3, 19, -3, 3, 21, 2, c);
  m.box(-2, 22, -2, 2, 22, 1, c);
  m.box(-3, 19, 3, 3, 19, 4, shade(c, 0.86));
  m.set(0, 23, 0, shade(c, 1.3));
}, P.bodySky);

wear('hat', 'beanie', 'Bobble Beanie', 'common', ['patience', 0.05], (m, c) => {
  m.box(-3, 19, -3, 3, 22, 2, c);
  m.box(-3, 18, -3, 3, 18, 2, shade(c, 0.82));
  m.sphere(0, 24, -1, 2, P.white);
}, P.bodyBlush);

wear('hat', 'visor', 'Sun Visor', 'common', ['prep', 0.04], (m, c) => {
  m.box(-3, 19, -3, 3, 19, 2, c);
  m.box(-3, 19, 3, 3, 19, 5, mix(c, P.glassPane, 0.6), M.GLASS);
}, P.bodyLime);

wear('hat', 'cat-ears', 'Cat Ears', 'rare', ['tips', 0.06], (m, c) => {
  for (const x of [-2, 2]) {
    m.box(x - 1, 19, -1, x + 1, 20, 0, c);
    m.box(x, 21, -1, x, 22, 0, c);
    m.set(x, 21, 1, P.bodyBlush);
  }
  m.box(-3, 19, -3, 3, 19, 2, c);
}, P.charcoal);

wear('hat', 'bunny-ears', 'Bunny Ears', 'rare', ['luck', 0.06], (m, c) => {
  m.box(-3, 19, -3, 3, 19, 2, c);
  for (const x of [-2, 2]) {
    m.box(x, 20, -1, x, 25, 0, c);
    m.box(x, 22, 0, x, 25, 1, P.bodyBlush);
  }
}, P.white);

wear('hat', 'headphones', 'Studio Cans', 'rare', ['prep', 0.07], (m, c) => {
  m.box(-3, 20, -1, 3, 21, 0, c);
  m.box(-2, 22, -1, 2, 22, 0, c);
  for (const x of [-4, 4]) {
    m.box(x, 15, -2, x, 18, 1, c);
    m.box(x, 16, -1, x, 17, 0, P.neonCyan, M.EMISSIVE);
  }
}, P.charcoal);

wear('hat', 'party-hat', 'Party Cone', 'rare', ['tips', 0.06], (m, c) => {
  m.cone(0, -1, 19, 26, 3.4, 0.6, c);
  for (let y = 20; y < 26; y += 2) m.discY(0, y, -1, 3.4 - (y - 19) * 0.5, shade(c, 1.3));
  m.sphere(0, 27, -1, 1.4, P.glow, M.EMISSIVE);
}, P.bodyGrape);

wear('hat', 'flower-crown', 'Flower Crown', 'rare', ['patience', 0.07], (m, c) => {
  m.box(-3, 19, -3, 3, 19, 2, P.leaf);
  for (const [x, z] of [[-3, 0], [0, 2], [3, 0], [-2, -3], [2, -3]]) {
    m.set(x, 20, z, c);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) m.set(x + dx, 20, z + dz, shade(c, 1.2));
  }
}, P.bodyBlush);

wear('hat', 'top-hat', 'Top Hat', 'epic', ['value', 0.08], (m, c) => {
  m.box(-4, 19, -4, 4, 19, 3, c);
  m.box(-3, 20, -3, 3, 26, 2, c);
  m.box(-3, 22, -3, 3, 23, 2, P.ribbon);
}, P.ink);

wear('hat', 'crown', 'Little Crown', 'epic', ['value', 0.09], (m, c) => {
  m.box(-3, 19, -3, 3, 20, 2, c, M.METAL);
  for (const [x, z] of [[-3, -3], [3, -3], [-3, 2], [3, 2], [0, -3], [0, 2]]) {
    m.box(x, 21, z, x, 22, z, c, M.METAL);
    m.set(x, 23, z, P.ruby, M.EMISSIVE);
  }
}, P.gold);

wear('hat', 'donut-hat', 'Donut Hat', 'epic', ['tips', 0.09], (m, c) => {
  m.cylY(0, -1, 19, 21, 4, P.dough);
  m.discY(0, 22, -1, 4, c);
  for (let y = 19; y <= 22; y++) m.remove(-1, y, -2, 1, y, 0);
  for (const [x, z] of [[-3, -1], [2, -3], [3, 1], [-2, 2]]) m.set(x, 23, z, P.mintCream);
}, P.berry);

wear('hat', 'wizard-hat', 'Wizard Hat', 'epic', ['luck', 0.09], (m, c) => {
  m.box(-5, 19, -5, 5, 19, 4, c);
  m.cone(0, -1, 20, 29, 3.2, 0.6, c);
  m.box(-4, 20, -4, 4, 20, 3, shade(c, 0.7));
  for (const [x, y, z] of [[2, 24, 1], [-2, 26, -2], [1, 27, -1]]) m.set(x, y, z, P.glow, M.EMISSIVE);
}, P.bodyGrape);

wear('hat', 'halo', 'Halo', 'legendary', ['luck', 0.12], (m, c) => {
  m.discY(0, 24, -1, 4, c, M.EMISSIVE);
  m.remove(-2, 24, -3, 2, 24, 1);
}, P.glow);

/* --------------------------------------------------------------- tops --- */

wear('top', 'apron', 'Crew Apron', 'common', ['prep', 0.04], (m, c) => {
  m.box(-3, 6, -2, 3, 12, 1, P.white);          // the shirt it is worn over
  m.box(-5, 10, -2, 5, 12, 1, P.white);
  m.box(-3, 6, 2, 3, 11, 2, c);                 // and the apron itself
  m.box(-1, 12, 2, 1, 12, 2, c);
  m.box(-3, 6, -2, 3, 6, 2, shade(c, 0.88));
  m.box(-3, 8, 2, 3, 8, 2, shade(c, 0.8));
}, P.bodyMint);

wear('top', 'tee', 'Plain Tee', 'common', ['patience', 0.03], (m, c) => {
  m.box(-3, 6, -2, 3, 12, 1, c);
  m.box(-5, 10, -2, 5, 12, 1, c);
  m.box(-2, 9, 2, 2, 11, 2, shade(c, 1.25));
}, P.cloth);

wear('top', 'hoodie', 'Hoodie', 'common', ['patience', 0.05], (m, c) => {
  m.box(-3, 6, -2, 3, 12, 1, c);
  m.box(-5, 6, -2, 5, 12, 1, c);
  m.box(-3, 12, -3, 3, 13, 2, shade(c, 0.86));
  m.box(-2, 7, 2, 2, 8, 2, shade(c, 0.78));
  m.box(0, 9, 2, 0, 12, 2, shade(c, 1.2));
}, P.slate);

wear('top', 'stripes', 'Breton Stripes', 'common', ['tips', 0.04], (m, c) => {
  m.box(-3, 6, -2, 3, 12, 1, P.white);
  m.box(-5, 9, -2, 5, 12, 1, P.white);
  for (let y = 7; y <= 12; y += 2) {
    m.box(-3, y, -2, 3, y, 1, c);
    m.box(-5, y, -2, 5, y, 1, c);
  }
}, P.cloth);

wear('top', 'hawaiian', 'Holiday Shirt', 'rare', ['patience', 0.06], (m, c) => {
  m.box(-3, 6, -2, 3, 12, 1, c);
  m.box(-5, 10, -2, 5, 12, 1, c);
  m.speckle(P.leaf, 0.22, (col, x, y) => y >= 6 && y <= 12);
  m.speckle(P.lemon, 0.14, (col, x, y) => y >= 6 && y <= 12);
  m.box(-3, 12, -2, 3, 12, 2, P.white);
}, P.bodyCoral);

wear('top', 'varsity', 'Varsity Jacket', 'rare', ['speed', 0.06], (m, c) => {
  m.box(-3, 6, -2, 3, 12, 1, c);
  m.box(-5, 6, -2, 5, 12, 1, P.white);
  m.box(-5, 6, -2, 5, 7, 1, shade(c, 0.8));
  m.box(-3, 12, -2, 3, 12, 1, P.white);
  m.box(-1, 9, 2, 1, 11, 2, P.white);
}, P.clothWarm);

wear('top', 'lab-coat', 'Lab Coat', 'rare', ['prep', 0.07], (m, c) => {
  m.box(-3, 4, -2, 3, 12, 1, c);
  m.box(-5, 6, -2, 5, 12, 1, c);
  m.box(0, 4, 2, 0, 12, 2, shade(c, 0.86));
  m.box(-3, 12, -2, 3, 12, 2, shade(c, 0.9));
  m.box(-3, 8, 2, -2, 9, 2, P.screen);
}, P.white);

wear('top', 'overalls', 'Dungarees', 'rare', ['value', 0.06], (m, c) => {
  m.box(-3, 8, -2, 3, 12, 1, P.white);          // the tee underneath
  m.box(-5, 10, -2, 5, 12, 1, P.white);
  m.box(-3, 6, -2, 3, 10, 1, c);
  for (const x of [-2, 2]) m.box(x, 11, -2, x, 12, -2, c);
  for (const x of [-2, 2]) m.box(x, 11, 1, x, 12, 1, c);
  m.box(-3, 6, 2, 3, 9, 2, shade(c, 1.15));
  m.box(-2, 10, 1, 2, 10, 1, P.gold, M.METAL);
}, P.water);

wear('top', 'puffer', 'Puffer Jacket', 'epic', ['patience', 0.08], (m, c) => {
  for (let y = 6; y <= 12; y += 2) {
    m.box(-4, y, -3, 4, y + 1, 2, c);
    m.box(-6, y, -3, 6, y + 1, 2, y >= 10 ? c : shade(c, 0.9));
  }
  m.box(0, 6, 3, 0, 12, 3, shade(c, 0.7));
}, P.bodyCoral);

wear('top', 'tuxedo', 'Tuxedo', 'epic', ['value', 0.09], (m, c) => {
  m.box(-3, 6, -2, 3, 12, 1, c);
  m.box(-5, 6, -2, 5, 12, 1, c);
  m.box(-1, 6, 2, 1, 12, 2, P.white);
  m.box(-2, 11, 2, 2, 12, 2, c);
  m.box(-1, 11, 2, 1, 11, 2, P.ribbon);
}, P.ink);

wear('top', 'band-tee', 'Tour Tee', 'epic', ['tips', 0.08], (m, c) => {
  m.box(-3, 6, -2, 3, 12, 1, c);
  m.box(-5, 10, -2, 5, 12, 1, c);
  m.box(-2, 8, 2, 2, 10, 2, P.neonPink, M.EMISSIVE);
  m.box(-1, 9, 2, 1, 9, 2, c);
}, P.black);

wear('top', 'cloud-knit', 'Cloud Knit', 'legendary', ['patience', 0.12], (m, c) => {
  m.box(-3, 6, -2, 3, 12, 1, c);
  m.box(-5, 6, -2, 5, 12, 1, c);
  for (const [x, y, z] of [[-2, 11, 2], [2, 10, 2], [0, 8, 2], [-4, 9, 2], [4, 11, 2]]) {
    m.sphere(x, y, z, 1.4, P.white);
  }
  m.box(-3, 12, -2, 3, 12, 2, P.white);
}, P.bodySky);

/* ------------------------------------------------------------ bottoms --- */

wear('bottom', 'jeans', 'Jeans', 'common', ['speed', 0.03], (m, c) => {
  for (const x of [-3, 1]) m.box(x, 2, -2, x + 2, 5, 1, c);
  m.box(-3, 5, -2, 3, 6, 1, shade(c, 0.86));
  m.box(-3, 6, -2, 3, 6, 1, P.leatherDark);
}, P.water);

wear('bottom', 'shorts', 'Shorts', 'common', ['speed', 0.04], (m, c) => {
  for (const x of [-3, 1]) m.box(x, 4, -2, x + 2, 5, 1, c);
  m.box(-3, 5, -2, 3, 6, 1, c);
  m.box(-3, 6, -2, 3, 6, 1, shade(c, 0.8));
}, P.clothGreen);

wear('bottom', 'skirt', 'Skirt', 'common', ['tips', 0.04], (m, c) => {
  m.box(-4, 3, -3, 4, 4, 2, c);
  m.box(-3, 5, -2, 3, 6, 1, shade(c, 1.12));
  for (let x = -4; x <= 4; x += 2) m.box(x, 2, -3, x, 2, 2, shade(c, 0.86));
}, P.clothPlum);

wear('bottom', 'cargo', 'Cargo Pants', 'rare', ['luck', 0.05], (m, c) => {
  for (const x of [-3, 1]) {
    m.box(x, 2, -2, x + 2, 5, 1, c);
    m.box(x - 1, 3, -1, x - 1, 4, 0, shade(c, 0.82));
    m.box(x + 3, 3, -1, x + 3, 4, 0, shade(c, 0.82));
  }
  m.box(-3, 5, -2, 3, 6, 1, shade(c, 0.9));
}, P.leather);

wear('bottom', 'slacks', 'Pressed Slacks', 'rare', ['value', 0.05], (m, c) => {
  for (const x of [-3, 1]) {
    m.box(x, 2, -2, x + 2, 5, 1, c);
    m.box(x + 1, 2, 1, x + 1, 5, 1, shade(c, 1.2));
  }
  m.box(-3, 5, -2, 3, 6, 1, c);
  m.box(-3, 6, -2, 3, 6, 1, P.ink);
}, P.charcoal);

wear('bottom', 'leggings', 'Rainbow Leggings', 'epic', ['speed', 0.08], (m, c) => {
  for (const x of [-3, 1]) for (let y = 2; y <= 5; y++) {
    m.box(x, y, -2, x + 2, y, 1, y % 2 ? c : P.neonCyan);
  }
  m.box(-3, 5, -2, 3, 6, 1, c);
}, P.neonPink);

wear('bottom', 'tutu', 'Tutu', 'epic', ['tips', 0.08], (m, c) => {
  m.box(-3, 3, -2, 3, 5, 1, shade(c, 0.9));
  m.discY(0, 5, 0, 5.4, c);
  m.discY(0, 4, 0, 4.4, shade(c, 1.16));
  m.box(-3, 6, -2, 3, 6, 1, shade(c, 0.8));
}, P.bodyBlush);

/* -------------------------------------------------------------- shoes --- */

wear('shoes', 'sneakers', 'Sneakers', 'common', ['speed', 0.04], (m, c) => {
  for (const x of [-3, 1]) {
    m.box(x, 0, -2, x + 2, 1, 2, c);
    m.box(x, 0, -2, x + 2, 0, 2, P.white);
    m.box(x, 1, 2, x + 2, 1, 2, P.white);
  }
}, P.bodyCoral);

wear('shoes', 'boots', 'Work Boots', 'common', ['prep', 0.04], (m, c) => {
  for (const x of [-3, 1]) {
    m.box(x, 0, -2, x + 2, 2, 2, c);
    m.box(x, 0, -2, x + 2, 0, 2, P.ink);
    m.box(x, 2, -2, x + 2, 2, 1, shade(c, 1.2));
  }
}, P.leather);

wear('shoes', 'loafers', 'Loafers', 'rare', ['value', 0.05], (m, c) => {
  for (const x of [-3, 1]) {
    m.box(x, 0, -2, x + 2, 1, 2, c);
    m.box(x + 1, 1, 0, x + 1, 1, 0, P.gold, M.METAL);
  }
}, P.leatherDark);

wear('shoes', 'sandals', 'Sandals', 'rare', ['patience', 0.05], (m, c) => {
  for (const x of [-3, 1]) {
    m.box(x, 0, -2, x + 2, 0, 2, c);
    m.box(x + 1, 1, -1, x + 1, 1, 1, shade(c, 0.8));
  }
}, P.canvasCloth);

wear('shoes', 'skates', 'Roller Skates', 'epic', ['speed', 0.1], (m, c) => {
  for (const x of [-3, 1]) {
    m.box(x, 1, -2, x + 2, 2, 2, c);
    m.box(x, 1, -2, x + 2, 1, 2, P.white);
    for (const z of [-1, 1]) {
      m.box(x, 0, z, x + 2, 0, z, P.gold, M.METAL);
    }
  }
}, P.neonPink);

wear('shoes', 'glow-boots', 'Glow Boots', 'legendary', ['speed', 0.12], (m, c) => {
  for (const x of [-3, 1]) {
    m.box(x, 0, -2, x + 2, 2, 2, P.charcoal);
    m.box(x, 0, -2, x + 2, 0, 2, c, M.EMISSIVE);
    m.box(x, 2, 2, x + 2, 2, 2, c, M.EMISSIVE);
  }
}, P.neonCyan);

/* --------------------------------------------------------------- face --- */

wear('face', 'glasses', 'Round Glasses', 'common', ['prep', 0.04], (m, c) => {
  for (const x of [-2, 1]) m.box(x, 15, 3, x + 1, 17, 3, c, M.METAL);
  m.box(-3, 16, 3, 3, 16, 3, c, M.METAL);
  m.box(-2, 16, 3, -1, 16, 3, P.glassPane, M.GLASS);
  m.box(1, 16, 3, 2, 16, 3, P.glassPane, M.GLASS);
}, P.chromeDark);

wear('face', 'shades', 'Shades', 'rare', ['tips', 0.06], (m, c) => {
  m.box(-3, 16, 3, 3, 17, 3, c);
  m.box(-3, 16, 3, -1, 17, 3, shade(c, 1.4));
  m.box(-3, 17, 2, 3, 17, 2, c);
}, P.ink);

wear('face', 'blush', 'Rosy Cheeks', 'common', ['patience', 0.04], (m, c) => {
  for (const x of [-3, 2]) {
    m.box(x, 14, 3, x + 1, 15, 3, c);
    m.set(x + (x < 0 ? 0 : 1), 16, 3, shade(c, 1.2));
  }
}, P.bodyBlush);

wear('face', 'monocle', 'Monocle', 'epic', ['value', 0.08], (m, c) => {
  m.box(1, 15, 3, 3, 17, 3, c, M.METAL);
  m.box(2, 16, 3, 2, 16, 3, P.glassPane, M.GLASS);
  m.box(1, 14, 3, 1, 12, 3, c, M.METAL);
}, P.gold);

wear('face', 'moustache', 'Fine Moustache', 'rare', ['tips', 0.05], (m, c) => {
  m.box(-2, 14, 3, 2, 14, 3, c);
  m.box(-3, 15, 3, -3, 15, 3, c);
  m.box(3, 15, 3, 3, 15, 3, c);
}, P.hairBrown);

wear('face', 'star-eyes', 'Star Eyes', 'legendary', ['luck', 0.12], (m, c) => {
  for (const x of [-2, 2]) {
    m.box(x - 1, 16, 3, x + 1, 16, 3, c, M.EMISSIVE);
    m.box(x, 15, 3, x, 17, 3, c, M.EMISSIVE);
  }
}, P.glow);

/* --------------------------------------------------------------- back --- */

wear('back', 'satchel', 'Satchel', 'common', ['luck', 0.04], (m, c) => {
  m.box(-3, 7, -4, 3, 11, -3, c);
  m.box(-3, 11, -4, 3, 11, -3, shade(c, 0.8));
  m.box(-2, 12, -3, -1, 12, 1, shade(c, 0.8));
  m.box(1, 12, -3, 2, 12, 1, shade(c, 0.8));
}, P.leather);

wear('back', 'cape', 'Short Cape', 'rare', ['value', 0.06], (m, c) => {
  m.box(-4, 4, -4, 4, 12, -3, c);
  m.box(-5, 6, -3, -4, 12, -3, c);
  m.box(4, 6, -3, 5, 12, -3, c);
  m.box(-3, 12, -3, 3, 12, 1, shade(c, 0.78));
}, P.clothWarm);

wear('back', 'backpack', 'Delivery Pack', 'rare', ['prep', 0.06], (m, c) => {
  m.box(-3, 6, -5, 3, 12, -3, c);
  m.box(-2, 7, -6, 2, 10, -5, shade(c, 0.86));
  m.box(-3, 13, -5, 3, 13, -3, shade(c, 1.14));
  for (const x of [-2, 2]) m.box(x, 12, -3, x, 12, 1, shade(c, 0.7));
}, P.bodyTeal);

wear('back', 'turtle', 'Shell Pack', 'epic', ['patience', 0.08], (m, c) => {
  m.ellipsoid(0, 9, -4, 4.4, 4, 2.4, c);
  m.remove(-6, 3, -3, 6, 14, 4);
  m.speckle(shade(c, 0.7), 0.3, (col, x, y, z) => z < -2);
}, P.clothGreen);

wear('back', 'jetpack', 'Jet Pack', 'epic', ['speed', 0.09], (m, c) => {
  for (const x of [-2, 2]) {
    m.cylY(x, -4, 6, 12, 1.8, c, M.METAL);
    m.discY(x, 13, -4, 1.8, P.chrome, M.METAL);
    m.box(x, 4, -5, x, 5, -3, P.flame, M.EMISSIVE);
  }
  m.box(-2, 8, -4, 2, 11, -4, P.chromeDark, M.METAL);
}, P.bodyCoral);

wear('back', 'wings', 'Star Wings', 'legendary', ['luck', 0.12], (m, c) => {
  for (const side of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const x = side * (4 + i), y = 8 + Math.round(i * 1.3), h = 4 - Math.floor(i / 2);
      m.box(x, y, -4, x, y + h, -3, c, M.EMISSIVE);
    }
  }
}, P.glow);

const SLOTS = ['hat', 'face', 'top', 'bottom', 'shoes', 'back'];
const BY_ID = new Map(WEAR.map(item => [item.id, item]));
const BY_SLOT = {};
for (const slot of SLOTS) BY_SLOT[slot] = WEAR.filter(item => item.slot === slot);

/* ==================================================== building a person === */

const SKINS = [P.skinPale, P.skinTan, P.skinDeep, mix(P.skinTan, P.skinPale, 0.5),
  mix(P.skinDeep, P.skinTan, 0.5), P.skinCool];
const HAIRS = [P.hairBlack, P.hairBrown, P.hairGold, P.hairRed, P.ash,
  hsl(200, 0.5, 0.6), hsl(320, 0.45, 0.62), hsl(140, 0.35, 0.5)];

/** The bare body: legs, torso, arms, head, and a face that is trying its best. */
function body(m, look, pose) {
  const o = POSES[pose] || POSES.idle;
  const worn = look.wear || {};
  const skin = look.skin;
  /* A slot with something in it clears its region to skin and lets the garment
     paint what it actually covers — which is why shorts leave a shin and a
     t-shirt leaves a forearm, without either item having to say so. */
  const shirt = worn.top ? skin : look.shirt;
  const trouser = worn.bottom ? skin : look.trouser;
  const shoe = worn.shoes ? skin : look.shoe;
  const lift = o.sit ? 4 : 0;

  /* legs — drawn per side so they can swing independently */
  for (const [side, dz] of [[1, o.legR], [-1, o.legL]]) {
    const x0 = side > 0 ? 1 : -3;
    if (o.sit) {
      m.box(x0, 6, -2, x0 + 2, 7, 3, trouser);
      m.box(x0, 2, 3, x0 + 2, 5, 4, trouser);
      m.box(x0, 0, 3, x0 + 2, 1, 5, shoe);
    } else {
      m.box(x0, 2, -2 + dz, x0 + 2, 5, 1 + dz, trouser);
      m.box(x0, 0, -2 + dz, x0 + 2, 1, 2 + dz, shoe);
    }
  }

  /* torso and neck */
  m.box(-3, 6 + lift, -2, 3, 12 + lift, 1, shirt);
  m.box(-1, 12 + lift, -1, 1, 12 + lift, 0, shade(skin, 0.94));

  /* arms — three attitudes, which is all a body this size can tell apart */
  for (const [side, dz] of [[1, o.armR], [-1, o.armL]]) {
    const x = side > 0 ? A.armX : -A.armX - 1;
    if (o.arms === 'up') {
      m.box(x, 10 + lift, -2, x + 1, 16, 1, shirt);
      m.box(x, 17, -2, x + 1, 18, 1, skin);
    } else if (o.arms === 'forward') {
      m.box(x, 10 + lift, -2, x + 1, 11 + lift, 3, shirt);
      m.box(x, 10 + lift, 4, x + 1, 11 + lift, 5, skin);
    } else {
      m.box(x, 8 + lift, -2 + dz, x + 1, 12 + lift, 1 + dz, shirt);
      m.box(x, 6 + lift, -2 + dz, x + 1, 7 + lift, 1 + dz, skin);
    }
  }

  /* head — a voxel deeper than the body, which is what makes it read as a head */
  m.box(-3, 13 + lift, -3, 3, 18 + lift, 2, skin);
  m.map((color, x, y, z) => (z === 2 && y >= 13 + lift && y <= 18 + lift && color === VOX.util.rgb(skin)
    ? shade(color, 1.07) : color));
  for (const x of [-2, 1]) m.box(x, 16 + lift, 2, x + 1, 16 + lift, 2, look.eyes);
  for (const x of [-2, 2]) m.set(x, 17 + lift, 2, P.white);
  m.box(-1, 14 + lift, 2, 1, 14 + lift, 2, shade(skin, 0.72));
  m.box(-2, 15 + lift, 2, -2, 15 + lift, 2, mix(skin, P.bodyBlush, 0.5));
  m.box(2, 15 + lift, 2, 2, 15 + lift, 2, mix(skin, P.bodyBlush, 0.5));

  if (look.hairStyle && HAIR[look.hairStyle]) {
    const draw = HAIR[look.hairStyle];
    if (lift) {
      /* Sitting lifts the head; the hair has to come with it, and the cheapest
         honest way to do that is to draw it on a scratch model and stamp it. */
      const scratch = VOX.model('hair');
      draw(scratch, look.hair);
      m.stamp(scratch, 0, lift, 0);
    } else {
      draw(m, look.hair);
    }
  }
  return m;
}

/**
 * A whole person: body, then every equipped garment in slot order, then the
 * held dish if they are carrying one. Order matters — trousers before the
 * apron that hangs over them, hair before the hat that sits on it.
 */
function person(look, pose = 'idle') {
  const m = VOX.model(look.id || 'cv-person', { title: look.name || 'Person', category: 'cv' });
  body(m, look, pose);
  const sitting = (POSES[pose] || POSES.idle).sit;
  for (const slot of SLOTS) {
    const id = look.wear && look.wear[slot];
    const item = id && BY_ID.get(id);
    if (!item) continue;
    /* Garments are written against a standing body. A sitting one has moved
       everything above the hips up by four, so those pieces are drawn on a
       scratch model and stamped into place rather than re-authored. */
    const above = slot === 'hat' || slot === 'face' || slot === 'top' || slot === 'back';
    const color = (look.tint && look.tint[slot]) || item.tint || P.white;
    if (sitting && above) {
      const scratch = VOX.model('wear');
      item.build(scratch, color);
      m.stamp(scratch, 0, 4, 0);
    } else {
      item.build(m, color);
    }
  }
  if (look.holding) {
    const dish = VOX.build(`cv-dish-${look.holding}`);
    m.stamp(dish, 0, sitting ? 15 : 11, sitting ? 6 : 6);
  }
  return m;
}

/** A random guest. Deterministic in the seed, so guest #7 is always guest #7. */
function guest(seed) {
  const r = rng(hashString('guest' + seed));
  const skin = r.pick(SKINS);
  const hats = BY_SLOT.hat, tops = BY_SLOT.top, bottoms = BY_SLOT.bottom, shoes = BY_SLOT.shoes;
  const tone = () => hsl(r.int(0, 359), 0.35 + r() * 0.3, 0.45 + r() * 0.25);
  const look = {
    id: `cv-guest-${seed}`,
    skin,
    hair: r.pick(HAIRS),
    hairStyle: r.pick(HAIR_STYLES),
    eyes: P.ink,
    shirt: tone(), trouser: tone(), shoe: r.chance(0.5) ? P.leatherDark : P.charcoal,
    wear: {},
    tint: {},
  };
  /* Guests wear a couple of things, never a full set: the player's avatar has
     to stay the best-dressed person in the room. */
  if (r.chance(0.55)) { const t = r.pick(tops); look.wear.top = t.id; look.tint.top = tone(); }
  if (r.chance(0.45)) { const b = r.pick(bottoms); look.wear.bottom = b.id; look.tint.bottom = tone(); }
  if (r.chance(0.4)) { const s = r.pick(shoes); look.wear.shoes = s.id; look.tint.shoes = tone(); }
  if (r.chance(0.3)) look.wear.hat = r.pick(hats).id;
  if (r.chance(0.22)) look.wear.face = r.pick(BY_SLOT.face).id;
  return look;
}

/** The crew: one uniform, tinted by the shop you are standing in. */
function crew(accent, seed = 1) {
  const r = rng(hashString('crew' + seed));
  return {
    id: `cv-crew-${seed}`,
    skin: r.pick(SKINS), hair: r.pick(HAIRS), hairStyle: r.pick(HAIR_STYLES), eyes: P.ink,
    shirt: P.white, trouser: P.charcoal, shoe: P.charcoal,
    wear: { top: 'apron', hat: 'cap', shoes: 'sneakers' },
    tint: { top: accent, hat: accent, shoes: shade(accent, 0.8) },
  };
}

/* -------------------------------------------------- catalogue entries --- */

/* Registered so the headless checker and the cast sheet can see them. The game
   itself calls person() directly — a guest's look changes every time one walks
   in, and a registry entry is for a model that holds still. */
VOX.define({
  name: 'cv-manager', title: 'Manager', category: 'cv', tags: ['person'],
  build: (m) => {
    const look = crew(P.bodyMint, 3);
    look.wear = { top: 'apron', hat: 'chef-toque', shoes: 'sneakers', face: 'glasses' };
    look.tint = { top: P.bodyMint, hat: P.white, shoes: P.bodyCoral };
    m.stamp(person(look, 'idle'));
  },
});

for (let i = 1; i <= 4; i++) {
  VOX.define({
    name: `cv-guest-${i}`, title: `Guest ${i}`, category: 'cv', tags: ['person'],
    build: (m) => { m.stamp(person(guest(i * 7), i === 2 ? 'stepA' : 'idle')); },
  });
}

/* One mannequin per garment — the wardrobe as a contact sheet, and the only
   way to catch a hat that has drifted a voxel off the head. */
for (const item of WEAR) {
  VOX.define({
    name: `cv-wear-${item.id}`, title: item.name, category: 'cv-wear', tags: ['wear', item.slot],
    build: (m) => {
      const look = {
        skin: P.skinTan, hair: P.hairBrown, hairStyle: item.slot === 'hat' ? 'short' : 'bob',
        eyes: P.ink, shirt: P.ash, trouser: P.steel, shoe: P.charcoal,
        wear: { [item.slot]: item.id }, tint: {},
      };
      m.stamp(person(look, 'idle'));
    },
  });
}

/* ------------------------------------------------------------------ exit --- */

CV.People = {
  A, POSES, POSE_NAMES, HAIR, HAIR_STYLES, SKINS, HAIRS,
  WEAR, SLOTS, BY_ID, BY_SLOT, body, person, guest, crew,
};

})(typeof globalThis !== 'undefined' ? globalThis : this);
