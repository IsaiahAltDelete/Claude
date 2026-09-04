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
