/* ---------------------------------------------------------------------------
   One palette for the whole catalogue.

   Seventy models built by nine different files will not read as one set unless
   they share their colours, so every generator pulls from here rather than
   typing a hex code. Swap a value in this file and the whole catalogue moves
   with it — which is the point.

   The ramps (`ramp.stone`, `ramp.wood`, …) are ordered dark -> light, so a
   generator can pick a shade by index and stay inside a family that already
   agrees with itself.
   --------------------------------------------------------------------------- */

(function (root) {
'use strict';

const VOX = root.VOX || (root.VOX = {});
const { shade } = VOX.util;

const P = {
  /* neutrals */
  black: '#12131a', ink: '#1d1f2a', charcoal: '#2b2e3c', slate: '#3d4256',
  steel: '#6c7590', ash: '#9aa3b8', silver: '#c2c9d8', white: '#f2f4fb',

  /* skin, hair, cloth */
  skinPale: '#f0c39a', skinTan: '#d59a6a', skinDeep: '#8f5b3a', skinCool: '#b9d4c2',
  hairBlack: '#241c22', hairBrown: '#5a3a24', hairGold: '#d8a441', hairRed: '#a8442a',
  cloth: '#4a5a8c', clothWarm: '#8c4a3c', clothGreen: '#3f6b46', clothPlum: '#5a3a6b',
  leather: '#6b4a2c', leatherDark: '#43301d', canvasCloth: '#c9b48c',

  /* materials */
  wood: '#7a5533', woodDark: '#4e3520', woodPale: '#b08b57', plank: '#9a6f42',
  stone: '#7b8090', stoneDark: '#4d5260', stonePale: '#a9aebd', brick: '#9c4f3e',
  iron: '#8d93a3', ironDark: '#565c6b', gold: '#e8b53c', goldDark: '#a67a1e',
  copper: '#c0713d', bronze: '#a8763c', gem: '#4fd4d8', ruby: '#d63a5a',
  glassPane: '#9fd6e8', thatch: '#c39b4f', tile: '#7a4c46',

  /* world */
  grass: '#4c8a3a', grassDark: '#356328', dirt: '#6d4c33', dirtDark: '#4a3222',
  sand: '#dcc487', sandDark: '#b89f66', snow: '#eef3fb', water: '#3a7bd5',
  leaf: '#3f7a35', leafDeep: '#2c5a27', leafAutumn: '#c47b2a', pine: '#2f5b3a',
  sky: '#7fb6e8', cloud: '#eef2f8', lava: '#ff7a2f',

  /* light and effect */
  flame: '#ffb43c', flameHot: '#fff0a8', magic: '#a97bff', poison: '#7fe05a',
  bloodRed: '#8e2b2b', shadow: '#232634',
};

/* Ramps: dark -> light, five steps, generated so they stay in family. */
function ramp(base, spread = 0.42) {
  const steps = [];
  for (let i = 0; i < 5; i++) {
    const t = (i / 4) * 2 - 1;                     // -1 .. 1
    steps.push(shade(base, 1 + t * spread));
  }
  return steps;
}

const ramps = {
  stone: ramp(P.stone), wood: ramp(P.wood), iron: ramp(P.iron), gold: ramp(P.gold, 0.3),
  grass: ramp(P.grass), leaf: ramp(P.leaf), dirt: ramp(P.dirt), sand: ramp(P.sand, 0.3),
  cloth: ramp(P.cloth), skin: ramp(P.skinTan, 0.28), snow: ramp(P.snow, 0.16),
  brick: ramp(P.brick), water: ramp(P.water), flame: ramp(P.flame, 0.34),
};

VOX.palette = P;
VOX.ramps = ramps;
VOX.ramp = ramp;

})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module === 'object' && module.exports) module.exports = globalThis.VOX;
