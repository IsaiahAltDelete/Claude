/* ---------------------------------------------------------------------------
   ClaudeVenture — the props.

   Every object in the shop is a voxel *recipe* run through the maker in
   /voxel: a function handed an empty grid that fills it with boxes, discs and
   mirrored halves. Nothing here is a sprite, a texture or a mesh file, so the
   whole shop — twelve machines at three tiers each, twelve dishes, the decor,
   the room itself — is a few hundred lines of readable JavaScript rather than
   a few megabytes of art.

   Conventions are the catalogue's, because these models stand next to models
   from it (the chest, the coin pile, the plants, the cat):

     · Y up, X right, Z towards the camera. A machine faces +Z, at the customer.
     · Build the x >= 0 half, mirrorX(), then add the deliberate asymmetry.
     · One voxel is one unit; a character is 19 tall; a floor tile is 12 across.
     · Colour comes from the shared palette, never a literal hex.

   The one place this file departs from the catalogue is the palette. A
   medieval catalogue is built on mud, iron and leaf; a cute food shop needs
   candy. So CV.P extends VOX.palette rather than replacing it — every extra is
   *derived*, through hsl(), mix() or shade(), so the two sets stay one world
   and a retune of either moves everything.
   --------------------------------------------------------------------------- */

(function (root) {
'use strict';

const VOX = root.VOX;
if (!VOX) throw new Error('ClaudeVenture: load voxel/dist/voxel.js first');
const CV = root.CV || (root.CV = {});

const { shade, mix, hsl, hash01 } = VOX.util;
const V = VOX.palette;
const M = VOX.MATERIAL;

/* ------------------------------------------------------------- palette --- */

/* Sweeter, higher-key and a touch desaturated against the catalogue, which is
   what makes a shop read as a shop rather than as a dungeon. Ordered by what
   the thing is, not by hue, because that is how they get picked. */
const P = Object.assign({}, V, {
  /* shop shell */
  floorA: hsl(34, 0.40, 0.80), floorB: hsl(26, 0.36, 0.71),
  floorEdge: hsl(24, 0.30, 0.54),
  wall: hsl(38, 0.34, 0.93), wallLow: hsl(28, 0.32, 0.78),
  wallTrim: hsl(20, 0.28, 0.46), skirting: hsl(22, 0.24, 0.38),

  /* machine bodies */
  bodyMint: hsl(166, 0.36, 0.60), bodyBlush: hsl(348, 0.52, 0.72),
  bodyCream: hsl(40, 0.58, 0.82), bodySky: hsl(202, 0.48, 0.66),
  bodyGrape: hsl(272, 0.34, 0.62), bodyLime: hsl(96, 0.38, 0.58),
  bodyCoral: hsl(14, 0.68, 0.66), bodyTeal: hsl(186, 0.40, 0.52),

  chrome: hsl(220, 0.10, 0.78), chromeDark: hsl(222, 0.12, 0.44),
  rubber: hsl(228, 0.10, 0.24), knob: hsl(4, 0.62, 0.56),
  screen: hsl(190, 0.62, 0.60), glow: hsl(48, 0.96, 0.66),

  /* food */
  bun: hsl(32, 0.62, 0.66), patty: hsl(18, 0.44, 0.32), lettuce: hsl(96, 0.46, 0.52),
  tomato: hsl(4, 0.72, 0.54), cheese: hsl(44, 0.86, 0.60), potato: hsl(44, 0.76, 0.62),
  lemon: hsl(52, 0.86, 0.62), berry: hsl(320, 0.56, 0.60), mintCream: hsl(150, 0.42, 0.74),
  choco: hsl(20, 0.48, 0.28), coffee: hsl(24, 0.42, 0.24), milk: hsl(38, 0.36, 0.92),
  dough: hsl(38, 0.56, 0.76), crust: hsl(30, 0.58, 0.52), sauce: hsl(6, 0.66, 0.44),
  rice: hsl(42, 0.20, 0.92), salmon: hsl(18, 0.78, 0.66), nori: hsl(150, 0.28, 0.22),
  boba: hsl(28, 0.34, 0.44), tea: hsl(30, 0.40, 0.60), shell: hsl(48, 0.72, 0.72),

  /* signage and money */
  neonPink: hsl(330, 0.90, 0.66), neonCyan: hsl(186, 0.88, 0.62),
  cash: hsl(140, 0.34, 0.52), cashDark: hsl(140, 0.30, 0.38),
  ribbon: hsl(348, 0.68, 0.60), giftBox: hsl(196, 0.52, 0.62),
});

/* Six body colours in a fixed order, so station N always looks like station N
   whichever location it turns up in. */
const BODIES = [P.bodyMint, P.bodyBlush, P.bodyCream, P.bodySky, P.bodyGrape,
  P.bodyLime, P.bodyCoral, P.bodyTeal];

/* ------------------------------------------------------- shared fittings --- */

const TILE = 12;              // one floor tile, in voxels
const define = spec => VOX.define(Object.assign({ category: 'cv' }, spec));

/**
 * The cabinet every machine stands on: a rounded-ish body, a kick at the
 * bottom, a worktop, and a pair of feet. Returns the worktop height so the
 * machine on top does not have to know how tall its own base is.
 */
function cabinet(m, options = {}) {
  const o = Object.assign({ w: 5, d: 4, h: 7, body: P.bodyCream, top: P.chrome, kick: null }, options);
  const kick = o.kick || shade(o.body, 0.72);
  m.box(-o.w, 1, -o.d, o.w, o.h - 1, o.d, o.body);
  m.box(-o.w, 0, -o.d + 1, o.w, 0, o.d - 1, kick);
  m.box(-o.w + 1, 0, -o.d, o.w - 1, 0, o.d, kick);
  /* A darker recess across the front reads as a door without costing depth. */
  m.box(-o.w + 2, 2, o.d, o.w - 2, o.h - 3, o.d, shade(o.body, 0.88));
  m.box(-o.w + 1, o.h, -o.d, o.w - 1, o.h, o.d, o.top);
  m.box(-o.w, o.h, -o.d + 1, o.w, o.h, o.d - 1, o.top);
  return o.h + 1;
}

/** The handle strip a machine gets on its cabinet front. */
function handle(m, y, w, color) {
  m.box(-w, y, 5, w, y, 5, color, M.METAL);
  return m;
}

/**
 * Tier dressing. Every machine is built once and then decorated by level, so
 * an upgrade is visible without a second recipe. It is deliberately a *rim*
 * and not a lid: the first version of this put a gold slab across the top at
 * tier 3 and buried the one part of each machine that told you what it was.
 *
 * tier 1  honest plastic
 * tier 2  chrome corner posts and a lit readout on the cabinet front
 * tier 3  a gold rim around the worktop, with bulbs along the customer's edge
 */
function tierDress(m, tier, options = {}) {
  const o = Object.assign({ w: 5, d: 4, deck: 7 }, options);
  if (tier >= 2) {
    for (const x of [-o.w, o.w]) m.box(x, 1, o.d, x, o.deck - 1, o.d, P.chrome, M.METAL);
    m.box(-3, 2, o.d + 1, 3, 4, o.d + 1, P.chromeDark, M.METAL);
    m.box(-2, 3, o.d + 2, 2, 4, o.d + 2, P.screen, M.EMISSIVE);
  }
  if (tier >= 3) {
    const W = o.w + 1, D = o.d + 1;
    m.box(-W, o.deck, -D, W, o.deck, -D, P.gold, M.METAL);
    m.box(-W, o.deck, D, W, o.deck, D, P.gold, M.METAL);
    m.box(-W, o.deck, -D, -W, o.deck, D, P.gold, M.METAL);
    m.box(W, o.deck, -D, W, o.deck, D, P.gold, M.METAL);
    for (let x = -W; x <= W; x += 2) m.set(x, o.deck + 1, D, P.glow, M.EMISSIVE);
  }
  return m;
}

/** A short pipe with a nozzle — every drinks machine has one. */
function spout(m, x, y, z, color) {
  m.cylY(x, z, y - 3, y, 1.2, color, M.METAL);
  m.discY(x, y - 4, z, 1.6, shade(color, 0.8), M.METAL);
  return m;
}

/**
 * The topper: the stall's own dish, built from the dish recipes further down
 * this file and stamped over the machine at double scale on a short post.
 *
 * It replaces a signboard, which is what this was first. A board is a vertical
 * plate, and a vertical plate is the one surface this camera lights worst —
 * the key comes from almost directly above, so the board went grey and the
 * emblem painted on it disappeared. A fat round object catches the key on its
 * top faces and reads from across the room, which is the whole job.
 */
function topper(m, dishName, scale = 2) {
  const y = m.bounds().max[1];
  m.box(-1, y - 1, -1, 1, y + 2, 1, P.chromeDark, M.METAL);
  m.stamp(VOX.build(dishName), 0, y + 3, 0, { scale });
  return m;
}

/* ================================================================ machines = */

/* Each machine is (model, tier) and builds around the origin facing +Z: a
   cabinet, one big signature part on top of it, a sign at the back, and the
   tier dressing. The signature part is what has to be legible at 80 pixels —
   the details underneath it are for the players who lean in. */

const MACHINES = {
  /* -------------------------------------------------------------- drinks */
  juice(m, tier) {
    const y = cabinet(m, { body: P.bodyLime });
    /* one fat tank, filling further the more the stall is upgraded */
    m.cylY(0, 0, y, y + 9, 4.2, P.glassPane, M.GLASS);
    m.cylY(0, 0, y, y + 2 + tier * 2, 3.4, P.lemon);
    for (let i = 0; i < 5; i++) m.set(Math.round(Math.cos(i * 1.9) * 2), y + 1 + i, Math.round(Math.sin(i * 1.9) * 2), shade(P.lemon, 1.3));
    m.discY(0, y + 10, 0, 4.6, P.chrome, M.METAL);
    m.discY(0, y + 11, 0, 2.4, P.bodyLime);
    spout(m, 0, y + 1, 5, P.chrome);
    for (const x of [-4, 4]) m.box(x, y + 1, 4, x, y + 2, 4, P.knob);
    tierDress(m, tier);
  },

  coffee(m, tier) {
    const y = cabinet(m, { body: P.bodyCoral });
    m.box(-5, y, -4, 5, y + 9, 1, shade(P.bodyCoral, 0.9));
    m.box(-5, y + 10, -4, 5, y + 11, 2, P.chrome, M.METAL);
    m.box(-4, y + 3, 2, 4, y + 8, 2, P.chromeDark, M.METAL);
    for (const x of [-2, 2]) {
      spout(m, x, y + 5, 3, P.chrome);
      m.cylY(x, 3, y, y + 2, 1.6, P.milk);
      m.cylY(x, 3, y + 1, y + 2, 1.1, P.coffee);
    }
    /* the hopper: taller with every tier, which is the tell from a distance */
    m.taper(0, -1, y + 12, y + 13 + tier * 2, 3, 3, 2, 2, P.chromeDark, M.METAL);
    m.discY(0, y + 14 + tier * 2, -1, 3, P.chrome, M.METAL);
    tierDress(m, tier);
  },

  boba(m, tier) {
    const y = cabinet(m, { body: P.bodyGrape });
    for (const x of [-3, 3]) {
      m.cylY(x, -1, y, y + 10, 2.8, P.glassPane, M.GLASS);
      m.cylY(x, -1, y, y + 4 + tier, 2.2, x < 0 ? P.tea : shade(P.berry, 1.1));
      m.discY(x, y + 11, -1, 3.2, P.chrome, M.METAL);
      for (let i = 0; i < 4; i++) m.set(x + (i % 2 ? 1 : -1), y + 1 + i, -1 + (i % 2), P.boba);
    }
    m.box(-6, y, 2, 6, y + 2, 4, shade(P.bodyGrape, 0.86));
    for (const x of [-4, 0, 4]) m.box(x, y + 3, 4, x, y + 3, 4, P.neonPink, M.EMISSIVE);
    tierDress(m, tier);
  },

  smoothie(m, tier) {
    const y = cabinet(m, { body: P.bodyMint });
    for (const x of [-3, 3]) {
      m.box(x - 2, y, -2, x + 2, y + 1, 2, P.chromeDark, M.METAL);
      m.cylY(x, 0, y + 2, y + 9, 2.4, P.glassPane, M.GLASS);
      m.cylY(x, 0, y + 2, y + 3 + tier * 2, 1.8, x < 0 ? P.berry : P.mintCream);
      m.discY(x, y + 10, 0, 2.8, P.chrome, M.METAL);
      m.box(x + 2, y + 3, 0, x + 3, y + 5, 0, P.chromeDark, M.METAL);
    }
    m.box(-6, y + 11, -4, 6, y + 12, 4, shade(P.bodyMint, 0.84));
    tierDress(m, tier, { w: 6 });
  },

  /* ---------------------------------------------------------------- hot */
  grill(m, tier) {
    const y = cabinet(m, { body: P.bodySky });
    m.box(-6, y, -4, 6, y + 1, 4, P.chromeDark, M.METAL);
    for (let x = -5; x <= 5; x += 2) m.box(x, y + 2, -3, x, y + 2, 3, P.rubber);
    for (const [x, z] of [[-3, 0], [1, -1], [3, 2]]) {
      m.ellipsoid(x, y + 3, z, 2, 0.6, 2, P.patty);
      m.set(x, y + 4, z, P.cheese);
    }
    for (const x of [-3, 0, 3]) m.set(x, y + 2, 1, P.flame, M.EMISSIVE);
    /* the extraction hood — wide, flat, and unmistakable in silhouette */
    for (const x of [-6, 6]) m.box(x, y + 3, -4, x, y + 8, 4, P.chrome, M.METAL);
    m.taper(0, 0, y + 9, y + 12, 7, 5, 4, 3, P.chrome, M.METAL);
    if (tier >= 2) m.box(-2, y + 13, -1, 2, y + 13 + tier * 2, 1, P.chromeDark, M.METAL);
    tierDress(m, tier, { w: 6 });
  },

  fryer(m, tier) {
    const y = cabinet(m, { body: P.bodyCream, top: P.chrome });
    m.box(-6, y, -4, 6, y + 3, 4, P.chromeDark, M.METAL);
    for (const x of [-3, 3]) {
      /* an open basket with fries standing out of it: reads at any size */
      m.boxShell(x - 2, y + 1, -2, x + 2, y + 5, 2, P.chrome, M.METAL);
      m.remove(x - 1, y + 5, -1, x + 1, y + 5, 1);
      m.box(x - 1, y + 2, -1, x + 1, y + 3, 1, shade(P.potato, 0.85));
      for (const [dx, dz, h] of [[-1, 0, 3], [0, 1, 4], [1, -1, 3], [0, -1, 2]]) {
        m.box(x + dx, y + 4, dz, x + dx, y + 4 + h, dz, P.potato);
      }
      m.box(x, y + 6, 3, x, y + 8, 4, P.rubber);
    }
    m.box(-6, y + 9, -4, 6, y + 10, -1, shade(P.bodyCream, 0.86));
    if (tier >= 3) m.box(-5, y + 11, -3, 5, y + 11, -2, P.gold, M.METAL);
    tierDress(m, tier, { w: 6 });
  },

  pizza(m, tier) {
    const y = cabinet(m, { body: P.brick, kick: shade(P.brick, 0.7), top: P.stonePale });
    /* a domed brick oven with a black arch — the strongest silhouette here */
    m.ellipsoid(0, y + 1, 0, 6, 7.5, 5, P.brick);
    m.remove(-8, y - 4, -8, 8, y, 8);
    m.speckle(shade(P.brick, 1.2), 0.2, (c, x, yy) => yy > y);
    m.cylZ(0, y + 4, 4, 6, 3.2, P.rubber);
    m.box(-3, y + 1, 4, 3, y + 4, 6, P.rubber);
    m.box(-2, y + 1, 5, 2, y + 2, 6, P.flame, M.EMISSIVE);
    m.box(-4, y + 1, 5, 4, y + 1, 6, P.stonePale);
    m.cylY(2, -3, y + 8, y + 12 + tier, 1.8, P.stoneDark);
    m.discY(2, y + 13 + tier, -3, 2.4, P.stoneDark);
    tierDress(m, tier, { w: 6, d: 5 });
  },

  taco(m, tier) {
    const y = cabinet(m, { body: P.bodyCoral });
    m.box(-6, y, -4, 6, y + 1, 4, P.chromeDark, M.METAL);
    m.box(-5, y + 2, -3, 5, y + 2, 3, shade(P.chrome, 0.92), M.METAL);
    for (const x of [-4, 0, 4]) {
      m.box(x - 1, y + 3, -1, x + 1, y + 3, 1, P.dough);
      m.box(x - 1, y + 4, 0, x + 1, y + 4, 0, P.patty);
    }
    /* a striped awning over the griddle */
    for (const x of [-6, 6]) m.box(x, y + 3, -4, x, y + 9, 4, P.woodDark);
    for (let i = 0; i <= 12; i++) {
      const c = i % 2 ? P.bodyCream : P.bodyCoral;
      m.box(-6 + i, y + 10, -5, -6 + i, y + 10, 5, c);
      m.box(-6 + i, y + 11, -3, -6 + i, y + 11, 3, c);
    }
    if (tier >= 2) for (const x of [-5, 0, 5]) m.set(x, y + 9, 5, P.neonPink, M.EMISSIVE);
    tierDress(m, tier, { w: 6 });
  },

  /* --------------------------------------------------------------- cold */
  gelato(m, tier) {
    const y = cabinet(m, { body: P.bodyBlush });
    m.box(-6, y, -4, 6, y + 2, 4, shade(P.bodyBlush, 0.9));
    for (const [i, c] of [P.mintCream, P.berry, P.choco, P.lemon].entries()) {
      const x = -5 + i * 3;
      m.box(x, y + 3, -3, x + 2, y + 3, 3, c);
      m.ellipsoid(x + 1, y + 4, 0, 1.4, 1, 2.4, shade(c, 1.14));
    }
    /* a glass vitrine with a chrome rail — cold food is always behind glass */
    for (const x of [-6, 6]) m.box(x, y + 4, -4, x, y + 9, 4, P.chrome, M.METAL);
    m.box(-6, y + 4, 4, 6, y + 9, 4, P.glassPane, M.GLASS);
    m.box(-6, y + 4, -4, 6, y + 9, -4, P.glassPane, M.GLASS);
    m.box(-6, y + 10, -4, 6, y + 11, 4, shade(P.bodyBlush, 0.8));
    if (tier >= 2) m.ellipsoid(0, y + 12, 0, 4, 2.4, 3, P.mintCream);
    if (tier >= 3) m.sphere(0, y + 14, 0, 1.6, P.berry);
    tierDress(m, tier, { w: 6 });
  },

  sushi(m, tier) {
    const y = cabinet(m, { body: P.woodPale, top: P.plank, kick: P.woodDark });
    m.box(-6, y, -4, 6, y + 1, 4, P.plank);
    m.grain(0.1, (c, x, yy) => yy >= y);
    for (const x of [-4, 0, 4]) {
      m.cylY(x, 1, y + 2, y + 3, 1.8, P.rice);
      m.box(x - 2, y + 4, 0, x + 1, y + 4, 2, P.salmon);
      m.box(x - 2, y + 2, -2, x - 2, y + 3, -1, P.nori);
    }
    /* a little tiled pent roof on posts, with a noren curtain under it */
    for (const x of [-6, 6]) m.box(x, y + 2, -4, x, y + 9, 4, P.woodDark);
    m.gable(-7, 7, -5, 5, y + 10, P.tile, 0, 1);
    m.box(-6, y + 6, 5, 6, y + 8, 5, P.cloth);
    m.box(-1, y + 6, 5, 1, y + 8, 5, shade(P.cloth, 1.3));
    if (tier >= 3) m.box(-7, y + 10, 5, 7, y + 10, 5, P.gold, M.METAL);
    tierDress(m, tier, { w: 6 });
  },

  /* -------------------------------------------------------------- baked */
  donut(m, tier) {
    const y = cabinet(m, { body: P.bodyTeal });
    for (let shelf = 0; shelf < 2; shelf++) {
      const sy = y + 1 + shelf * 4;
      m.box(-6, sy, -4, 6, sy, 4, P.chrome, M.METAL);
      for (const x of [-4, 0, 4]) {
        m.discY(x, sy + 1, 0, 2.2, P.dough); m.clear(x, sy + 1, 0);
        m.discY(x, sy + 2, 0, 1.8, shelf ? P.berry : P.choco); m.clear(x, sy + 2, 0);
      }
    }
    for (const x of [-6, 6]) m.box(x, y + 1, -4, x, y + 9, 4, P.chrome, M.METAL);
    m.box(-6, y + 1, -4, 6, y + 9, -4, P.glassPane, M.GLASS);
    m.box(-6, y + 10, -4, 6, y + 11, 4, shade(P.bodyTeal, 0.86));
    /* a giant donut on the roof — the loudest silhouette in the shop */
    m.cylZ(0, y + 17, -1, 0, 5.4, P.dough);
    m.cylZ(0, y + 17, -2, 1, 2, P.bodyTeal);
    m.remove(-3, y + 14, -3, 3, y + 20, 2);
    m.cylZ(0, y + 18, 0, 1, 5.4, tier >= 2 ? P.berry : P.choco);
    m.remove(-3, y + 15, 0, 3, y + 21, 1);
    if (tier >= 3) for (const [dx, dy] of [[-3, 2], [3, 1], [0, 4], [2, -3]]) m.set(dx, y + 17 + dy, 2, P.mintCream);
    tierDress(m, tier, { w: 6 });
  },

  bakery(m, tier) {
    const y = cabinet(m, { body: P.bodyCream, kick: P.woodDark, top: P.plank });
    m.box(-6, y, -4, 6, y + 1, 4, P.woodDark);
    for (let shelf = 0; shelf < 2; shelf++) {
      const sy = y + 2 + shelf * 4;
      m.box(-6, sy, -4, 6, sy, 4, P.woodPale);
      for (const x of [-4, 0, 4]) m.ellipsoid(x, sy + 2, 0, 1.8, 1.4, 2.4, shelf ? P.crust : P.dough);
    }
    for (const x of [-6, 6]) m.box(x, y + 1, -4, x, y + 10, 4, P.woodDark);
    m.box(-6, y + 1, -4, 6, y + 10, -4, P.glassPane, M.GLASS);
    /* a scalloped awning, striped like a patisserie */
    for (let i = 0; i <= 13; i++) {
      const c = i % 2 ? P.bodyCream : P.ribbon;
      m.box(-6 + i, y + 11, -4, -6 + i, y + 11, 6, c);
      m.box(-6 + i, y + 12, -4, -6 + i, y + 12, 4, c);
      if (i % 2) m.set(-6 + i, y + 10, 6, c);
    }
    if (tier >= 3) m.box(-6, y + 13, -3, 6, y + 13, 0, P.gold, M.METAL);
    tierDress(m, tier, { w: 6 });
  },
};

/* Which dish floats over which stall. The donut stall goes without: it already
   carries a five-voxel-thick donut on the roof, and a topper above that would
   be a sign above a sign. */
const TOPPERS = {
  juice: 'lemonade', coffee: 'espresso', boba: 'bobacup', smoothie: 'smoothiecup',
  grill: 'burger', fryer: 'fries', pizza: 'slice', taco: 'tacoplate',
  gelato: 'cone', sushi: 'sushiplate', donut: null, bakery: 'croissant',
};

for (const [name, build] of Object.entries(MACHINES)) {
  for (const tier of [1, 2, 3]) {
    define({
      name: `cv-${name}-${tier}`,
      title: `${name[0].toUpperCase()}${name.slice(1)} · tier ${tier}`,
      tags: ['station', name],
      build: (m) => {
        build(m, tier);
        /* Mounted off the finished height rather than a number typed per
           recipe, so a machine that grows a taller hopper at tier 3 pushes its
           own topper up and nothing ever ends up inside anything. */
        if (TOPPERS[name]) topper(m, `cv-dish-${TOPPERS[name]}`);
        m.grain(0.05);
      },
    });
  }
}

/* ================================================================== dishes = */

/* Small enough to sit in a hand or on a tray: nothing here is over 7 voxels.
   Each is centred on the origin so a carried dish can be placed by its middle. */

const DISHES = {
  lemonade(m) {
    m.cone(0, 0, 0, 5, 1.6, 2.2, P.glassPane, M.GLASS);
    m.cone(0, 0, 1, 4, 1.4, 2, P.lemon);
    m.discY(0, 5, 0, 2.2, shade(P.lemon, 1.2));
    m.box(1, 5, 0, 2, 7, 0, P.mintCream);
    m.box(-2, 6, 0, -1, 6, 0, P.leaf);
  },
  espresso(m) {
    m.cylY(0, 0, 0, 4, 2.2, P.milk);
    m.cylY(0, 0, 3, 4, 1.6, P.coffee);
    m.box(2, 1, 0, 3, 3, 0, P.milk);
    m.discY(0, 0, 0, 2.8, P.silver);
  },
  bobacup(m) {
    m.cone(0, 0, 0, 6, 1.8, 2.4, P.glassPane, M.GLASS);
    m.cone(0, 0, 0, 4, 1.6, 2.2, P.tea);
    for (const [x, z] of [[0, 0], [1, 1], [-1, 1], [1, -1]]) m.set(x, 1, z, P.boba);
    m.discY(0, 6, 0, 2.6, P.bodyGrape);
    m.box(0, 7, 0, 0, 9, 0, P.bodyBlush);
  },
  burger(m) {
    m.ellipsoid(0, 4, 0, 3.4, 1.6, 3.4, P.bun);
    m.box(-3, 2, -3, 3, 2, 3, P.lettuce);
    m.box(-3, 1, -3, 3, 1, 3, P.patty);
    m.box(-3, 3, -3, 3, 3, 3, P.cheese);
    m.ellipsoid(0, 0, 0, 3.2, 1, 3.2, shade(P.bun, 0.88));
    m.speckle(P.white, 0.14, (c, x, y) => y >= 4);
  },
  fries(m) {
    m.box(-2, 0, -2, 2, 3, 2, P.tomato);
    m.box(-2, 4, -2, 2, 4, 2, shade(P.tomato, 1.2));
    for (const [x, z, h] of [[-1, -1, 4], [1, 0, 5], [0, 1, 4], [-1, 1, 3], [1, -1, 3]]) {
      m.box(x, 4, z, x, 4 + h, z, P.potato);
    }
  },
  slice(m) {
    for (let i = 0; i <= 5; i++) m.box(-i, 0, i - 3, i, 0, i - 3, P.crust);
    for (let i = 0; i <= 4; i++) m.box(-i, 1, i - 3, i, 1, i - 3, P.cheese);
    m.box(-4, 1, 2, 4, 1, 2, P.crust);
    for (const [x, z] of [[0, 0], [2, 1], [-2, 1]]) m.discY(x, 2, z, 1.2, P.sauce);
  },
  tacoplate(m) {
    m.box(-4, 0, -2, 4, 0, 2, P.dough);
    m.box(-4, 1, -2, -4, 3, 2, P.dough);
    m.box(4, 1, -2, 4, 3, 2, P.dough);
    m.box(-3, 1, -2, 3, 1, 2, P.patty);
    m.box(-3, 2, -2, 3, 2, 2, P.lettuce);
    m.box(-2, 3, -1, 2, 3, 1, P.cheese);
  },
  cone(m) {
    m.cone(0, 0, 0, 5, 0.6, 2.2, P.shell);
    m.sphere(0, 6, 0, 2.4, P.mintCream);
    m.sphere(0, 8, 0, 1.8, P.berry);
    m.set(0, 10, 0, P.tomato);
  },
  sushiplate(m) {
    m.box(-4, 0, -3, 4, 0, 3, P.white);
    for (const x of [-2, 1]) {
      m.cylY(x, 0, 1, 3, 1.8, P.rice);
      m.box(x - 2, 4, -2, x + 1, 4, 2, P.salmon);
      m.box(x - 2, 1, -2, x - 2, 3, 2, P.nori);
    }
  },
  donutbox(m) {
    m.box(-4, 0, -3, 4, 1, 3, P.dough);
    for (const [x, z] of [[-2, 0], [2, 0]]) {
      m.discY(x, 2, z, 2, P.dough); m.clear(x, 2, z);
      m.discY(x, 3, z, 1.6, x < 0 ? P.berry : P.choco); m.clear(x, 3, z);
      m.set(x + 1, 4, z, P.mintCream); m.set(x - 1, 4, z + 1, P.lemon);
    }
  },
  croissant(m) {
    m.box(-3, 0, -1, 3, 1, 1, P.crust);
    for (const [x, dz] of [[-4, 1], [4, 1]]) m.box(x, 1, dz - 2, x, 2, dz, P.crust);
    m.box(-2, 2, -1, 2, 2, 1, shade(P.crust, 1.2));
    m.grain(0.12);
  },
  smoothiecup(m) {
    m.cylY(0, 0, 0, 6, 2.2, P.glassPane, M.GLASS);
    m.cylY(0, 0, 0, 4, 1.8, P.berry);
    m.discY(0, 5, 0, 2, P.milk);
    m.box(1, 6, 0, 1, 9, 0, P.neonPink);
    m.set(0, 6, 1, P.leaf);
  },
};

for (const [name, build] of Object.entries(DISHES)) {
  define({ name: `cv-dish-${name}`, tags: ['dish'], build });
}

/* ================================================================== decor = */

define({
  name: 'cv-counter', tags: ['fixture'],
  build(m) {
    m.box(-6, 0, -3, 6, 7, 3, P.woodPale);
    m.box(-6, 0, -3, 6, 0, 3, P.woodDark);
    m.box(-6, 3, 3, 6, 4, 3, P.wallTrim);
    m.box(-7, 8, -4, 7, 8, 4, P.plank);
    m.grain(0.1);
  },
});

define({
  name: 'cv-register', tags: ['fixture'],
  build(m) {
    m.box(-4, 0, -3, 4, 3, 3, P.bodyCream);
    m.box(-4, 4, -3, 4, 6, 0, shade(P.bodyCream, 0.86));
    m.box(-3, 5, 1, 3, 7, 1, P.screen, M.EMISSIVE);
    m.box(-4, 4, 1, 4, 8, 2, P.chromeDark, M.METAL);
    m.remove(-3, 5, 1, 3, 7, 2);
    for (let x = -3; x <= 3; x += 2) for (const z of [-1, -2]) m.set(x, 4, z, P.knob);
    m.box(-2, 9, 0, 2, 9, 0, P.gold, M.METAL);
  },
});

define({
  name: 'cv-stool', tags: ['fixture'],
  build(m) {
    m.discY(0, 6, 0, 3, P.bodyBlush);
    m.discY(0, 7, 0, 2.6, shade(P.bodyBlush, 1.14));
    m.cylY(0, 0, 0, 5, 1, P.chromeDark, M.METAL);
    m.discY(0, 0, 0, 2.6, P.chromeDark, M.METAL);
  },
});

define({
  name: 'cv-cafe-table', tags: ['fixture'],
  build(m) {
    m.discY(0, 9, 0, 5, P.woodPale);
    m.discY(0, 10, 0, 4.6, shade(P.woodPale, 1.1));
    m.cylY(0, 0, 0, 8, 1.4, P.chromeDark, M.METAL);
    m.discY(0, 0, 0, 3.4, P.chromeDark, M.METAL);
    m.grain(0.08);
  },
});

define({
  name: 'cv-planter', tags: ['decor'],
  build(m, kit) {
    /* The catalogue's tree helper, sat in a pot: build the plant on the
       ground, lift the whole thing, then fill the pot in under it. */
    kit.tree(m, { height: 6, trunkR: 1.2, canopy: 'round', canopyR: 5, leaf: P.leaf });
    m.translate(0, 7, 0);
    m.taper(0, 0, 0, 5, 4, 4, 5, 5, P.brick);
    m.box(-5, 6, -5, 5, 6, 5, P.dirtDark);
  },
});

define({
  name: 'cv-menu-board', tags: ['decor'],
  build(m) {
    m.box(-8, 0, 0, 8, 11, 0, P.woodDark);
    m.box(-7, 1, 1, 7, 10, 1, P.charcoal);
    for (let i = 0; i < 4; i++) {
      const y = 8 - i * 2;
      m.box(-6, y, 2, 1 + (i % 3), y, 2, P.white);
      m.box(4, y, 2, 6, y, 2, P.glow, M.EMISSIVE);
    }
  },
});

define({
  name: 'cv-neon-sign', tags: ['decor'],
  build(m) {
    m.box(-9, 0, 0, 9, 1, 0, P.chromeDark, M.METAL);
    m.box(-9, 0, 0, -9, 7, 0, P.chromeDark, M.METAL);
    m.box(9, 0, 0, 9, 7, 0, P.chromeDark, M.METAL);
    m.box(-9, 7, 0, 9, 8, 0, P.chromeDark, M.METAL);
    m.box(-7, 2, 1, 7, 3, 1, P.neonPink, M.EMISSIVE);
    m.box(-5, 5, 1, 5, 6, 1, P.neonCyan, M.EMISSIVE);
    for (const x of [-7, 7]) m.box(x, 2, 1, x, 6, 1, P.neonPink, M.EMISSIVE);
  },
});

define({
  name: 'cv-bin', tags: ['decor'],
  build(m) {
    m.cylY(0, 0, 0, 8, 3.4, P.chromeDark, M.METAL);
    m.cylY(0, 0, 1, 7, 2.6, P.charcoal);
    m.discY(0, 9, 0, 3.8, P.chrome, M.METAL);
    m.box(-2, 9, -2, 2, 9, 2, P.charcoal);
    m.discY(0, 3, 0, 3.5, shade(P.chromeDark, 1.2), M.METAL);
  },
});

define({
  name: 'cv-tip-jar', tags: ['decor'],
  build(m) {
    m.cylY(0, 0, 0, 6, 2.6, P.glassPane, M.GLASS);
    m.discY(0, 0, 0, 2.6, P.chrome, M.METAL);
    m.cylY(0, 0, 1, 3, 2, P.cash);
    m.discY(0, 7, 0, 3, P.chrome, M.METAL);
    m.box(-2, 8, 0, 2, 10, 0, P.cash);
  },
});

define({
  name: 'cv-gift-box', tags: ['pickup'],
  build(m) {
    m.box(-4, 0, -4, 4, 6, 4, P.giftBox);
    m.box(-1, 0, -4, 1, 6, 4, P.ribbon);
    m.box(-4, 0, -1, 4, 6, 1, P.ribbon);
    m.box(-5, 7, -5, 5, 8, 5, shade(P.giftBox, 1.12));
    m.box(-1, 7, -5, 1, 8, 5, P.ribbon);
    m.box(-2, 9, -2, 2, 10, 2, P.ribbon);
    m.box(-4, 9, -1, 4, 10, 1, P.ribbon);
  },
});

define({
  name: 'cv-lot', tags: ['fixture'],
  build(m) {
    /* A pitch waiting for a stall: a pallet, three crates and a hoarding with
       a question mark on it. Deliberately low and deliberately wood-coloured —
       the first version put a cream tarp over the top and the brightest, most
       eye-catching object in the shop was the place where nothing was. */
    m.box(-7, 0, -5, 7, 1, 5, P.woodDark);
    for (const [x, z, h] of [[-4, -1, 6], [3, 1, 4], [-1, 3, 3]]) {
      m.boxShell(x - 3, 2, z - 3, x + 3, 2 + h, z + 3, P.wood);
      m.box(x - 3, 2 + h, z - 3, x + 3, 2 + h, z + 3, P.woodDark);
    }
    m.grain(0.16);
    for (const x of [-6, 6]) m.box(x, 2, 5, x, 13, 5, P.woodDark);
    m.box(-6, 6, 5, 6, 13, 5, P.bodyCream);
    m.box(-6, 13, 4, 6, 14, 6, P.woodDark);
    /* the question mark, drawn a voxel proud of the board */
    m.box(-2, 11, 6, 1, 11, 6, P.woodDark);
    m.box(2, 10, 6, 2, 10, 6, P.woodDark);
    m.box(0, 9, 6, 1, 9, 6, P.woodDark);
    m.box(0, 8, 6, 0, 8, 6, P.woodDark);
    m.box(0, 7, 6, 0, 7, 6, P.ribbon);
  },
});

define({
  name: 'cv-floor-mat', tags: ['decor'],
  build(m) {
    m.box(-8, 0, -5, 8, 0, 5, P.bodyCoral);
    m.box(-7, 0, -4, 7, 0, 4, shade(P.bodyCoral, 1.16));
    m.box(-5, 0, -2, 5, 0, 2, P.bodyCream);
  },
});

define({
  name: 'cv-crate-stack', tags: ['decor'],
  build(m) {
    for (const [x, z, y] of [[-3, 0, 0], [3, -1, 0], [0, 0, 6]]) {
      m.boxShell(x - 3, y, z - 3, x + 3, y + 5, z + 3, P.wood);
      m.box(x - 3, y + 5, z - 3, x + 3, y + 5, z + 3, P.woodDark);
    }
    m.grain(0.12);
  },
});

define({
  name: 'cv-arrow', tags: ['ui'],
  build(m) {
    /* A map pin, not an arrow. A downward arrowhead is a cone with its point
       at the bottom, and this camera looks down at it — so the widest slice
       hides every slice under it and the whole thing reads as a flat plate.
       A pin has a round head above a spike and is legible from any angle. */
    m.cone(0, 0, 0, 5, 0.6, 2.4, P.goldDark, M.METAL);
    m.sphere(0, 9, 0, 4.2, P.gold, M.METAL);
    /* The plus goes on the *top* face, which is the one this camera sees most
       of and the one the key light hits hardest. */
    m.box(-1, 13, -3, 1, 13, 3, P.white);
    m.box(-3, 13, -1, 3, 13, 1, P.white);
    m.box(-1, 12, -4, 1, 12, -4, P.glow, M.EMISSIVE);
    m.box(-1, 12, 4, 1, 12, 4, P.glow, M.EMISSIVE);
  },
});

/* A pile of coins rather than a gold brick: round, stacked and slightly
   scattered, so it reads as money at twenty pixels. */
define({
  name: 'cv-cash-pile', tags: ['pickup'],
  build(m) {
    for (const [x, z, h] of [[0, 0, 4], [-3, 2, 2], [3, -1, 3], [1, 3, 1]]) {
      for (let y = 0; y <= h; y++) m.discY(x, y, z, 2.6, y % 2 ? P.gold : shade(P.gold, 0.84), M.METAL);
    }
    m.box(-1, 5, -1, 1, 6, 1, P.cash);
    m.box(-3, 5, 0, 3, 6, 0, P.cash);
    m.box(-1, 5, 0, 1, 6, 0, P.cashDark);
  },
});

/* =================================================================== room = */

/**
 * The shop itself, built as one model and meshed once: floor, two walls, the
 * skirting, the window band and the door frame. Everything that never moves
 * belongs here — the renderer uploads it a single time and never touches it
 * again, which is what keeps a scene of thirty moving things cheap.
 *
 * `cols` x `rows` floor tiles of TILE voxels each, centred on the origin, with
 * the open side facing +Z and +X (the camera's near corner).
 */
function room(options = {}) {
  const o = Object.assign({ cols: 7, rows: 5, wall: P.wall, floorA: P.floorA, floorB: P.floorB, accent: P.bodyMint }, options);
  const m = VOX.model('cv-room', { title: 'Shop floor', category: 'cv' });
  const w = (o.cols * TILE) / 2, d = (o.rows * TILE) / 2;

  /* Chequered floor, one shade per tile, with a hashed grain so a big flat
     plane still has something for the light to sit on. */
  for (let cx = 0; cx < o.cols; cx++) {
    for (let cz = 0; cz < o.rows; cz++) {
      const color = (cx + cz) % 2 ? o.floorA : o.floorB;
      const x0 = -w + cx * TILE, z0 = -d + cz * TILE;
      m.box(x0, -1, z0, x0 + TILE - 1, -1, z0 + TILE - 1, color);
    }
  }
  m.grain(0.06, (c, x, y) => y === -1);
  m.box(-w - 1, -1, -d - 1, w, -1, -d - 1, P.floorEdge);
  m.box(-w - 1, -1, -d - 1, -w - 1, -1, d, P.floorEdge);

  /* A strip of pavement wrapping the open corner. Guests arrive from off-stage
     and leave the same way, and without this they spend the first and last two
     seconds of every visit walking on the background. */
  const pavement = shade(P.floorEdge, 0.94);
  m.box(-w - 1, -1, d + 2, w + 10, -1, d + 12, pavement);
  m.box(w + 2, -1, -d - 1, w + 10, -1, d + 12, pavement);
  m.grain(0.05, (c, x, y, z) => y === -1 && (z > d + 1 || x > w + 1));
  /* A kerb between the two, so the shop has an edge rather than bleeding into
     the street. */
  m.box(-w - 1, -1, d + 1, w + 1, 0, d + 1, P.floorEdge);
  m.box(w + 1, -1, -d - 1, w + 1, 0, d + 1, P.floorEdge);

  /* Two walls only: the far ones. An isometric shop with four walls is a box
     you cannot see into, and the near two would be doing nothing but hiding
     the game. */
  const H = 34;
  m.box(-w - 2, 0, -d - 3, w + 1, H, -d - 1, o.wall);
  m.box(-w - 3, 0, -d - 3, -w - 1, H, d + 1, o.wall);
  /* wainscot, skirting and the picture rail */
  m.box(-w - 2, 0, -d - 1, w + 1, 11, -d - 1, P.wallLow);
  m.box(-w - 1, 0, -d - 3, -w - 1, 11, d + 1, P.wallLow);
  m.box(-w - 2, 12, -d - 1, w + 1, 12, -d - 1, P.wallTrim);
  m.box(-w - 1, 12, -d - 3, -w - 1, 12, d + 1, P.wallTrim);
  m.box(-w - 2, 0, -d - 1, w + 1, 1, -d - 1, P.skirting);
  m.box(-w - 1, 0, -d - 3, -w - 1, 1, d + 1, P.skirting);

  /* A window band, so the far wall is not a slab. Glass is a material, not a
     colour: the renderers light it flat and bright. */
  for (let cx = 1; cx < o.cols - 1; cx += 2) {
    const x0 = -w + cx * TILE + 2;
    m.box(x0, 16, -d - 2, x0 + TILE - 5, 27, -d - 2, P.glassPane, M.GLASS);
    m.box(x0 - 1, 15, -d - 2, x0 + TILE - 4, 15, -d - 2, P.wallTrim);
    m.box(x0 - 1, 28, -d - 2, x0 + TILE - 4, 28, -d - 2, P.wallTrim);
  }
  for (let cz = 1; cz < o.rows - 1; cz += 2) {
    const z0 = -d + cz * TILE + 2;
    m.box(-w - 2, 16, z0, -w - 2, 27, z0 + TILE - 5, P.glassPane, M.GLASS);
    m.box(-w - 2, 15, z0 - 1, -w - 2, 15, z0 + TILE - 4, P.wallTrim);
    m.box(-w - 2, 28, z0 - 1, -w - 2, 28, z0 + TILE - 4, P.wallTrim);
  }

  /* The stripe that tells you which shop you are in. */
  m.box(-w - 2, 13, -d - 1, w + 1, 14, -d - 1, o.accent);
  m.box(-w - 1, 13, -d - 3, -w - 1, 14, d + 1, o.accent);
  return m;
}

/* ------------------------------------------------------------------ exit --- */

CV.P = P;
CV.TILE = TILE;
CV.BODIES = BODIES;
CV.Props = { room, cabinet, tierDress, spout, topper, MACHINES, DISHES, TOPPERS };
CV.dishNames = Object.keys(DISHES);
CV.machineNames = Object.keys(MACHINES);

})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module === 'object' && module.exports) module.exports = globalThis.CV;
