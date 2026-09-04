/* ---------------------------------------------------------------------------
   Characters.

   Every one of these is the same body from the kit with a different job. They
   are built as the x >= 0 half and mirrored, so symmetry is free; anything
   deliberately lopsided — an eyepatch, one pauldron, a satchel strap — is
   added after the mirror, which is also how you tell at a glance which details
   were meant to be one-sided.

   Scale: 19 voxels to the top of the head, which is one third head, and small
   enough that a party of six costs less than one detailed model.
   --------------------------------------------------------------------------- */

(function (root) {
'use strict';

const VOX = root.VOX;
const P = VOX.palette;
const { shade } = VOX.util;
const M = VOX.MATERIAL;

const character = (name, options, build) => VOX.define(Object.assign(
  { name, category: 'characters', build }, options,
));

/* ------------------------------------------------------------------ knight */

character('knight', { tags: ['hero', 'armour', 'medieval'], note: 'Plate, tabard and a plume. The party leader.' }, (m, kit) => {
  const plate = P.iron, dark = P.ironDark;
  kit.humanoid(m, {
    skin: plate, top: plate, bottom: dark, boots: dark, sleeve: plate,
    eyes: P.black, belt: P.leather, headDepth: 3,
  });
  /* tabard over the breastplate */
  m.box(0, 6, 2, 2, 11, 2, P.clothWarm);
  m.box(0, 7, 2, 0, 11, 2, P.gold);
  /* pauldrons */
  m.box(3, 12, -2, 5, 13, 1, plate);
  m.box(4, 11, -2, 5, 11, 1, dark);
  /* helmet: brow band, visor slit, cheek guards */
  m.box(0, 18, -3, 3, 19, 2, dark);
  m.box(0, 16, 2, 3, 16, 2, P.black);
  m.box(0, 15, 2, 1, 15, 2, dark);
  m.map((c, x, y, z) => (y >= 13 && y <= 19 ? shade(c, 1 + (z + 3) * 0.02) : c));
  m.mirrorX();
  /* the crest, and the nose guard, are single things on the centre line */
  m.box(0, 20, -2, 0, 22, 1, P.clothWarm);
  m.box(0, 21, -3, 0, 23, -1, P.clothWarm);
  m.box(0, 20, 2, 0, 20, 2, P.gold, M.METAL);
  m.box(0, 14, 2, 0, 17, 2, dark);
  m.grain(0.07, (c, x, y, z) => y < 13);
});

/* -------------------------------------------------------------------- mage */

character('mage', { tags: ['magic', 'robe', 'staff'], note: 'Robe, beard and a hat with a slouch.' }, (m, kit) => {
  const robe = P.cloth, trim = P.magic;
  kit.humanoid(m, {
    skin: P.skinPale, top: robe, bottom: robe, boots: P.leatherDark,
    sleeve: robe, legGap: false, belt: P.leather,
  });
  /* the robe flares out below the belt */
  for (let y = 5; y >= 0; y--) m.box(0, y, -3, 3 + Math.floor((5 - y) / 2), y, 2, robe);
  m.box(0, 6, 2, 1, 12, 2, trim);
  /* sleeves widen at the cuff */
  m.box(4, 6, -3, 6, 8, 2, robe);
  /* beard */
  m.box(0, 12, 2, 2, 15, 3, P.silver);
  m.box(0, 15, 3, 2, 15, 3, P.silver);
  m.mirrorX();
  /* hat: brim, then a cone that leans back */
  m.discY(0, 20, 0, 5, robe);
  m.discY(0, 21, 0, 4, robe);
  for (let i = 0; i < 6; i++) m.discY(0, 22 + i, -Math.round(i * 0.4), 3.4 - i * 0.5, i === 2 ? trim : robe);
  m.set(0, 27, -2, P.gold, M.EMISSIVE);
  m.grain(0.06);
});

/* ------------------------------------------------------------------- rogue */

character('rogue', { tags: ['hood', 'cloak', 'stealth'], note: 'Hooded, cloaked, and lighter on their feet than the knight.' }, (m, kit) => {
  const cloth = P.clothGreen, dark = shade(P.clothGreen, 0.7);
  kit.humanoid(m, {
    skin: P.skinTan, top: cloth, bottom: P.leatherDark, boots: P.leatherDark,
    sleeve: dark, belt: P.leather, slim: true, headDepth: 3,
  });
  kit.cape(m, dark, { top: 13, bottom: 3, half: 3, depth: -3 });
  /* hood: a shell around the head, open at the front */
  m.box(0, 13, -4, 4, 20, 3, dark);
  m.remove(0, 14, 1, 3, 18, 3);
  m.box(0, 13, -3, 3, 18, 2, P.shadow);
  m.box(1, 16, 2, 2, 16, 2, P.flameHot, M.EMISSIVE);
  m.mirrorX();
  m.box(0, 20, -1, 0, 21, -3, dark);
  m.grain(0.08);
});

/* --------------------------------------------------------------- villager */

character('villager', { tags: ['npc', 'quest', 'town'], note: 'The one who gives you the quest. Apron, boots, no weapon.' }, (m, kit) => {
  kit.humanoid(m, {
    skin: P.skinPale, top: '#b6553f', bottom: '#4a5a6b', boots: P.leatherDark,
    hair: P.hairBrown, fringe: true, belt: P.leather,
  });
  m.box(0, 6, 2, 2, 10, 2, P.canvasCloth);
  m.box(2, 11, 2, 2, 11, 2, P.canvasCloth);
  m.mirrorX();
  m.grain(0.07);
});

/* -------------------------------------------------------------------- king */

character('king', { tags: ['npc', 'royal', 'crown'], note: 'Crown, ermine collar, and a cape that reaches the floor.' }, (m, kit) => {
  const robe = '#6a2f52';
  kit.humanoid(m, {
    skin: P.skinTan, top: robe, bottom: robe, boots: P.leatherDark,
    hair: P.silver, legGap: false, collar: P.white, belt: P.gold,
  });
  for (let y = 5; y >= 0; y--) m.box(0, y, -3, 3 + Math.floor((5 - y) / 2), y, 2, robe);
  m.box(0, 12, 2, 3, 13, 2, P.white);
  m.box(0, 12, -3, 3, 13, 2, P.white);
  m.box(0, 12, 2, 2, 15, 3, P.silver);
  kit.cape(m, robe, { top: 13, bottom: 0, half: 4, depth: -4 });
  m.mirrorX();
  /* crown: a two-high band that sits inside the head's own width, with four
     points on the diagonals so none of them hides the face */
  for (let x = -3; x <= 3; x++) {
    for (let z = -3; z <= 3; z++) {
      const r = Math.hypot(x, z);
      if (r > 2.1 && r < 3.3) m.box(x, 20, z, x, 21, z, P.gold, M.METAL);
    }
  }
  for (const [x, z] of [[2, 2], [-2, 2], [2, -2], [-2, -2]]) m.set(x, 22, z, P.gold, M.METAL);
  m.set(0, 21, 3, P.ruby, M.EMISSIVE);
  m.grain(0.05);
});

/* ------------------------------------------------------------------- robot */

character('robot', { tags: ['sci-fi', 'metal', 'droid'], note: 'Boxy, riveted, and lit from the inside.' }, (m, kit) => {
  const shellColor = '#9aa6b8', dark = '#4a5464', glow = P.gem;
  kit.humanoid(m, {
    skin: shellColor, top: shellColor, bottom: dark, boots: dark,
    sleeve: dark, eyes: glow, headDepth: 3, legGap: false,
  });
  m.replace(shellColor, shellColor, M.METAL);
  m.replace(dark, dark, M.METAL);
  /* chest panel and its indicator */
  m.box(0, 8, 2, 2, 11, 2, dark, M.METAL);
  m.box(0, 9, 2, 1, 10, 2, glow, M.EMISSIVE);
  /* joints */
  m.box(3, 12, -2, 5, 13, 1, dark, M.METAL);
  m.box(4, 7, -2, 5, 7, 1, dark, M.METAL);
  /* visor rather than eyes */
  m.box(0, 16, 2, 3, 16, 2, glow, M.EMISSIVE);
  m.box(0, 19, -3, 3, 19, 2, dark, M.METAL);
  m.mirrorX();
  m.box(0, 20, 0, 0, 22, 0, dark, M.METAL);
  m.set(0, 23, 0, P.ruby, M.EMISSIVE);
});

/* --------------------------------------------------------------- astronaut */

character('astronaut', { tags: ['sci-fi', 'space', 'suit'], note: 'Pressure suit, gold visor, life support on the back.' }, (m, kit) => {
  const suit = '#e6ebf5', joint = '#b9c2d4', trim = '#3a6fd8';
  kit.humanoid(m, {
    skin: suit, top: suit, bottom: suit, boots: joint, sleeve: suit,
    glove: joint, eyes: P.gold, headDepth: 3, legGap: false, belt: trim,
  });
  m.box(3, 12, -2, 5, 13, 1, joint);
  m.box(0, 6, 2, 1, 8, 2, trim);
  /* helmet: a rounded shell with a gold visor across the front */
  m.ellipsoid(0, 16, 0, 4.6, 4.4, 4.6, suit);
  m.box(0, 14, 2, 3, 18, 4, P.gold, M.METAL);
  m.map((c, x, y, z) => (y >= 12 && y <= 20 && z >= 3 && c === VOX.util.rgb(P.gold) ? shade(c, 1.1) : c));
  /* life support */
  m.box(0, 7, -5, 3, 13, -3, joint);
  m.box(0, 8, -6, 2, 12, -6, trim);
  m.mirrorX();
  m.box(0, 20, -1, 0, 20, 1, trim);
  m.set(2, 9, 3, P.gem, M.EMISSIVE);
});

/* ---------------------------------------------------------------- skeleton */

character('skeleton', { tags: ['undead', 'enemy', 'bone'], note: 'Ribs, a jaw, and two lights where the eyes were.' }, (m, kit) => {
  const bone = '#e4e0cf', dark = '#b3ae99';
  /* No kit body: a skeleton is defined by what is missing. */
  m.box(1, 0, -2, 2, 1, 2, bone);            // feet
  m.box(1, 2, -1, 2, 5, 0, bone);            // shins
  m.box(1, 6, -1, 3, 7, 1, dark);            // pelvis
  for (let y = 8; y <= 12; y += 2) m.box(0, y, -2, 3, y, 1, bone);   // ribs
  m.box(0, 8, -1, 0, 13, 0, dark);           // spine
  m.box(0, 13, -2, 3, 13, 1, bone);          // collar
  m.box(4, 7, -1, 4, 12, 0, bone);           // arms
  m.box(0, 14, -3, 3, 18, 2, bone);          // skull
  m.box(1, 16, 2, 2, 17, 2, P.black);        // sockets
  m.box(0, 14, 2, 2, 14, 2, dark);           // jaw
  m.map((c, x, y, z) => (y === 14 && z === 2 && x % 2 === 1 ? P.black : c));
  m.mirrorX();
  m.box(-1, 16, 3, -1, 16, 3, P.flame, M.EMISSIVE);
  m.box(1, 16, 3, 1, 16, 3, P.flame, M.EMISSIVE);
  m.grain(0.09);
});

/* ------------------------------------------------------------------ pirate */

character('pirate', { tags: ['npc', 'sea', 'hat'], note: 'Coat, sash, tricorn — and the eyepatch goes on after the mirror.' }, (m, kit) => {
  const coat = '#3d4a63', sash = '#b8403f';
  kit.humanoid(m, {
    skin: P.skinTan, top: coat, bottom: '#5b4a38', boots: P.leatherDark,
    sleeve: coat, hair: P.hairBlack, belt: P.leather,
  });
  m.box(0, 6, 2, 2, 12, 2, '#d9d2bd');       // shirt front, under the coat
  m.box(0, 6, 2, 3, 9, 2, sash);
  m.box(3, 6, -2, 3, 12, 2, coat);           // coat skirts
  m.box(0, 12, 2, 2, 13, 2, '#d9d2bd');      // collar
  m.mirrorX();
  /* tricorn */
  m.discY(0, 20, 0, 5, P.ink);
  m.box(-4, 21, -1, 4, 21, 1, P.ink);
  m.box(-1, 21, -4, 1, 22, 3, P.ink);
  m.set(0, 22, 3, P.gold, M.METAL);
  /* one eye, one patch */
  m.box(-2, 16, 3, -1, 16, 3, P.ink);
  m.box(-2, 17, 3, -1, 17, 3, P.ink);
  m.grain(0.07);
});

/* ------------------------------------------------------------------- ninja */

character('ninja', { tags: ['stealth', 'enemy', 'scarf'], note: 'All cloth. The scarf is the only thing that reads at distance.' }, (m, kit) => {
  const suit = '#252b3a', wrap = '#171b26', scarf = '#c0392b';
  kit.humanoid(m, {
    skin: suit, top: suit, bottom: wrap, boots: wrap, sleeve: wrap,
    glove: wrap, eyes: P.white, slim: true, headDepth: 3,
  });
  m.box(0, 6, 2, 2, 7, 2, scarf);
  m.box(0, 13, -3, 3, 15, 2, wrap);          // mask below the eyes
  m.box(0, 12, -3, 3, 13, 2, scarf);         // scarf at the neck
  m.mirrorX();
  /* the scarf tail streams to one side only */
  m.box(-4, 10, -3, -3, 13, -2, scarf);
  m.box(-6, 8, -4, -4, 10, -3, scarf);
  m.grain(0.06);
});

/* ------------------------------------------------------------------ farmer */

character('farmer', { tags: ['npc', 'town', 'hat'], note: 'Straw hat, dungarees, and the shirt sleeves rolled up.' }, (m, kit) => {
  const denim = '#4a6a8c', shirt = '#d8c9a8';
  kit.humanoid(m, {
    skin: P.skinDeep, top: shirt, bottom: denim, boots: P.leatherDark,
    sleeve: shirt, hair: P.hairBlack, belt: null,
  });
  m.box(0, 6, -2, 3, 10, 1, denim);          // dungarees over the shirt
  m.box(1, 11, 2, 2, 12, 2, denim);          // strap
  m.box(4, 6, -2, 5, 7, 1, P.skinDeep);      // rolled sleeve, bare forearm
  m.mirrorX();
  /* straw hat, wide enough to sit on the shoulders visually */
  m.discY(0, 20, 0, 6, P.thatch);
  m.discY(0, 21, 0, 3.4, P.thatch);
  m.discY(0, 22, 0, 2.6, shade(P.thatch, 0.9));
  m.grain(0.09);
});

})(typeof globalThis !== 'undefined' ? globalThis : this);
