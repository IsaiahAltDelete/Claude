/* ---------------------------------------------------------------------------
   Animals.

   Six of these are the same quadruped from the kit at different proportions —
   a cat is a wolf with shorter legs and a longer tail — which is exactly the
   point of having a kit. The five that are not four-legged (chicken, bee,
   fish, spider, dragon) are built from scratch, because faking them off a
   quadruped costs more than writing them.

   Everything faces +Z, so a game can point one at the camera without a
   per-model rotation table.
   --------------------------------------------------------------------------- */

(function (root) {
'use strict';

const VOX = root.VOX;
const P = VOX.palette;
const { shade, mix } = VOX.util;
const M = VOX.MATERIAL;

const animal = (name, options, build) => VOX.define(Object.assign(
  { name, category: 'animals', build }, options,
));

/* --------------------------------------------------------------------- cat */

animal('cat', { tags: ['pet', 'small'], note: 'Low, long-tailed, and built entirely from the kit quadruped.' }, (m, kit) => {
  const coat = '#c98a3f';
  kit.quadruped(m, {
    coat, belly: '#e8cfa8', legTop: 3, bodyTop: 7, bodyBack: -4, bodyFront: 3,
    halfWidth: 2, neck: 2, headSize: 3, tail: 'none', ears: 'point',
  });
  /* the tail curls up rather than out */
  m.line(0, 8, -4, 0, 12, -6, coat, 0.6);
  m.box(1, 5, 3, 1, 5, 4, '#e8cfa8');            // chest flash
  m.mirrorX();
  m.box(0, 8, 5, 0, 8, 5, '#e8a0a8');            // nose
  m.grain(0.07);
});

/* --------------------------------------------------------------------- dog */

animal('dog', { tags: ['pet', 'companion'], note: 'Floppy ears, a stub tail and a paler muzzle.' }, (m, kit) => {
  const coat = '#8a6340';
  kit.quadruped(m, {
    coat, belly: '#c8a87c', legTop: 4, bodyTop: 8, bodyBack: -5, bodyFront: 3,
    halfWidth: 2, neck: 2, headSize: 3, tail: 'stub', ears: 'floppy',
  });
  m.box(0, 9, 4, 1, 10, 5, shade(coat, 0.85));   // brow
  m.mirrorX();
  m.box(0, 8, 6, 0, 8, 6, P.ink);                // nose
  m.grain(0.08);
});

/* ------------------------------------------------------------------- horse */

animal('horse', { tags: ['mount', 'large'], note: 'Tall enough to be ridden, with a mane down the neck.' }, (m, kit) => {
  const coat = '#6b4630', mane = '#3a2618';
  const anchors = kit.quadruped(m, {
    coat, belly: shade(coat, 1.12), hoof: P.ink, legTop: 8, bodyTop: 14,
    bodyBack: -6, bodyFront: 5, halfWidth: 3, neck: 5, headSize: 3, headDrop: 1,
    tail: 'none', ears: 'point',
  });
  /* mane along the neck, tail off the back */
  m.box(0, 14, 4, 1, anchors.headY, 5, mane);
  m.box(0, 12, -7, 1, 15, -6, mane);
  m.box(0, 8, -8, 1, 12, -7, mane);
  m.mirrorX();
  m.box(0, 15, 8, 0, 16, 8, P.white);            // blaze
  m.grain(0.07);
});

/* --------------------------------------------------------------------- pig */

animal('pig', { tags: ['farm', 'livestock'], note: 'Round, short, and mostly snout.' }, (m, kit) => {
  const coat = '#e8a3a8';
  kit.quadruped(m, {
    coat, belly: '#f5c6c9', hoof: '#8c5b60', legTop: 2, bodyTop: 7, bodyBack: -5,
    bodyFront: 3, halfWidth: 3, neck: 0, headSize: 3, headDrop: 1, tail: 'stub', ears: 'floppy',
  });
  m.box(0, 5, 6, 1, 6, 6, '#d98a92');            // snout disc
  m.mirrorX();
  m.box(-1, 5, 7, 1, 6, 7, '#c97b83');
  m.box(0, 6, 7, 0, 6, 7, P.ink);
  m.grain(0.06);
});

/* -------------------------------------------------------------------- wolf */

animal('wolf', { tags: ['enemy', 'pack'], note: 'The dog with the friendliness removed: lower head, bristled back.' }, (m, kit) => {
  const coat = '#8a8f9c';
  kit.quadruped(m, {
    coat, belly: '#c3c9d2', hoof: P.charcoal, legTop: 5, bodyTop: 10, bodyBack: -6,
    bodyFront: 4, halfWidth: 2, neck: 2, headSize: 3, headDrop: 2, tail: 'none', ears: 'point',
  });
  m.box(0, 11, -3, 1, 11, 2, P.charcoal);        // hackles
  m.line(0, 10, -6, 0, 12, -9, coat, 1);         // tail out behind
  m.mirrorX();
  m.box(-1, 9, 8, 1, 9, 8, P.ink);
  m.box(-1, 10, 7, -1, 10, 7, P.flame, M.EMISSIVE);
  m.box(1, 10, 7, 1, 10, 7, P.flame, M.EMISSIVE);
  m.grain(0.09);
});

/* -------------------------------------------------------------------- bear */

animal('bear', { tags: ['enemy', 'large', 'forest'], note: 'Heavy through the shoulders, with a low head.' }, (m, kit) => {
  const coat = '#5a3f2c';
  kit.quadruped(m, {
    coat, belly: shade(coat, 1.1), hoof: P.ink, legTop: 4, bodyTop: 11, bodyBack: -6,
    bodyFront: 4, halfWidth: 4, neck: 1, headSize: 3, headDrop: 1, tail: 'stub', ears: 'point',
  });
  m.box(0, 11, -2, 3, 12, 2, coat);              // shoulder hump
  m.mirrorX();
  m.box(-1, 9, 8, 1, 10, 8, '#c8a87c');          // muzzle
  m.box(0, 10, 9, 0, 10, 9, P.ink);
  m.grain(0.1);
});

/* ----------------------------------------------------------------- chicken */

animal('chicken', { tags: ['farm', 'small'], note: 'Two legs, a wattle and a comb — the smallest model in the set.' }, (m, kit) => {
  const body = '#f2efe6', beak = P.gold, comb = '#c0392b';
  m.ellipsoid(0, 6, 0, 3, 3, 4, body);
  m.box(0, 8, -1, 2, 10, 1, body);               // neck
  m.box(0, 10, -1, 2, 12, 2, body);              // head
  m.box(1, 3, 1, 1, 4, 2, beak);                 // legs
  m.box(1, 2, 1, 2, 2, 3, beak);                 // feet
  m.box(3, 5, -1, 3, 7, 2, shade(body, 0.92));   // wing
  m.box(0, 13, 0, 1, 13, 1, comb);               // comb
  m.box(0, 12, 3, 1, 12, 3, beak);               // beak
  m.box(0, 10, 2, 1, 11, 2, comb);               // wattle
  m.box(0, 5, -4, 1, 8, -5, body);               // tail
  m.mirrorX();
  m.set(-2, 12, 2, P.ink); m.set(2, 12, 2, P.ink);
  m.grain(0.05);
});

/* ------------------------------------------------------------------ dragon */

animal('dragon', { tags: ['boss', 'enemy', 'wings'], note: 'The one big enemy: wings, horns, and a lit throat.' }, (m, kit) => {
  const scale = '#3f7a5c', belly = '#c9b06a', horn = '#e8e0c8';
  const anchors = kit.quadruped(m, {
    coat: scale, belly, hoof: P.charcoal, legTop: 6, bodyTop: 13, bodyBack: -8,
    bodyFront: 5, halfWidth: 4, neck: 5, headSize: 4, headDrop: 0,
    tail: 'none', ears: 'none',
  });
  /* tail: a taper that drops as it goes back */
  for (let i = 0; i < 10; i++) {
    const r = 3 - i * 0.28;
    m.discY(0, 13 - Math.round(i * 0.55), -8 - i, Math.max(0.6, r), scale);
  }
  /* Wing: a swept membrane lying in the XZ plane and rising as it goes out,
     with a darker leading bone. Spread flat like this it reads as a wing from
     the three-quarter view everything in the catalogue is shown at; a vertical
     membrane would read as a comb. */
  const membrane = mix(scale, P.ink, 0.4), bone = shade(scale, 0.72);
  for (let i = 0; i <= 8; i++) {
    const x = 4 + i;
    const y = 14 + Math.round(i * 0.55);
    const front = 3 - Math.round(i * 0.9);
    const back = -4 - Math.round(i * 0.45);
    m.box(x, y, back, x, y, front, membrane);
    m.box(x, y, front, x, y, front, bone);
    if (i % 3 === 0) m.box(x, y, back, x, y + 1, front, bone);   // ribs
  }
  /* spines down the back */
  for (let z = -7; z <= 4; z += 2) m.box(0, 14, z, 0, 15 + (z % 4 === 0 ? 1 : 0), z, horn);
  m.mirrorX();
  /* horns and a mouth that glows */
  const hy = anchors.headY;
  m.box(2, hy + 1, 5, 3, hy + 2, 6, horn);
  m.box(-3, hy + 1, 5, -2, hy + 2, 6, horn);
  m.box(-2, hy - 3, 9, 2, hy - 2, 9, P.flame, M.EMISSIVE);
  m.grain(0.08);
});

/* -------------------------------------------------------------------- fish */

animal('fish', { tags: ['water', 'small', 'pickup'], note: 'Reads from the side, which is how a fish is ever seen.' }, (m, kit) => {
  const body = '#3f8fd0', fin = '#e8a33c';
  m.ellipsoid(0, 5, 0, 2, 3.4, 6, body);
  m.map((c, x, y, z) => (y > 5 ? shade(c, 0.88) : shade(c, 1.14)));
  m.box(0, 3, -8, 0, 8, -6, fin);                // tail
  m.box(0, 8, -1, 1, 9, 2, fin);                 // dorsal
  m.box(2, 4, 1, 3, 5, 3, fin);                  // pectoral
  m.mirrorX();
  m.box(-2, 6, 5, -2, 6, 5, P.white); m.box(2, 6, 5, 2, 6, 5, P.white);
  m.box(-2, 6, 6, -2, 6, 6, P.ink); m.box(2, 6, 6, 2, 6, 6, P.ink);
  m.grain(0.06);
});

/* --------------------------------------------------------------------- bee */

animal('bee', { tags: ['small', 'flying', 'insect'], note: 'Striped, translucent-winged, and only nine voxels long.' }, (m, kit) => {
  const gold = '#f0c02a', stripe = '#2a2318';
  m.ellipsoid(0, 5, 0, 3, 3, 4.5, gold);
  m.map((c, x, y, z) => ((z + 8) % 4 < 2 ? stripe : c));
  m.box(0, 4, -5, 1, 5, -5, stripe);             // sting
  m.ellipsoid(0, 6, 4, 2.4, 2.4, 2.4, stripe);   // head
  m.box(1, 7, 6, 2, 8, 6, stripe);               // antennae
  m.box(2, 9, 7, 2, 9, 7, stripe);
  /* wings, as glass so they catch the light rather than block it */
  for (let i = 0; i < 3; i++) m.box(3 + i, 8, -1 + i, 3 + i, 8 + Math.round(i * 0.5), 1 + i, P.white, M.GLASS);
  m.mirrorX();
  m.box(-1, 7, 6, 1, 7, 6, gold);
  m.set(-1, 6, 6, P.ink); m.set(1, 6, 6, P.ink);
});

/* ------------------------------------------------------------------ spider */

animal('spider', { tags: ['enemy', 'cave', 'insect'], note: 'Eight legs, built as four mirrored pairs on an arc.' }, (m, kit) => {
  const body = '#2b2434', leg = '#1a1620', eye = '#d64545';
  m.ellipsoid(0, 5, -2, 4, 3, 5, body);          // abdomen
  m.ellipsoid(0, 4, 4, 3, 2.6, 3, body);         // cephalothorax
  const feet = [[7, 6], [8, 2], [8, -2], [6, -6]];
  feet.forEach(([fx, fz], i) => {
    const kneeY = 8 - i * 0.4;
    m.line(2, 4, 3, fx - 2, kneeY, fz, leg, 0.7);
    m.line(fx - 2, kneeY, fz, fx, 0, fz, leg, 0.7);
  });
  m.mirrorX();
  for (const [x, z, y] of [[1, 7, 5], [2, 6, 4], [3, 6, 5], [1, 6, 3]]) {
    m.set(x, y, z, eye, M.EMISSIVE); m.set(-x, y, z, eye, M.EMISSIVE);
  }
  m.grain(0.09);
});

/* -------------------------------------------------------------------- bird */

animal('bird', { tags: ['small', 'flying'], note: 'A songbird, with the wings out so it reads in flight.' }, (m, kit) => {
  const body = '#4a6fd0', chest = '#e8b03c';
  m.ellipsoid(0, 5, 0, 2.4, 2.6, 3.4, body);
  m.ellipsoid(0, 8, 2, 2, 2, 2, body);           // head
  m.box(0, 4, 1, 1, 5, 3, chest);                // breast
  m.box(0, 8, 4, 0, 8, 5, P.gold);               // beak
  m.box(0, 3, -5, 1, 4, -3, body);               // tail
  for (let i = 0; i < 3; i++) m.box(2 + i, 5 + i, -1, 2 + i, 5 + i, 1 + i, shade(body, 0.85));
  m.box(1, 2, 1, 1, 3, 2, P.gold);               // legs
  m.mirrorX();
  m.set(-1, 9, 4, P.ink); m.set(1, 9, 4, P.ink);
  m.grain(0.05);
});

})(typeof globalThis !== 'undefined' ? globalThis : this);
