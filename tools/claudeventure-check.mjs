#!/usr/bin/env node
/* ===========================================================================
   Build, check and bake every model in ClaudeVenture — with no browser.

   The game's art is code, and code that only runs in a browser is code nobody
   checks. These recipes load in Node exactly as they do in the page (each file
   assigns to a global and exports it for CommonJS), so the whole cast can be
   built, measured, asserted over and rendered here in a couple of seconds.

   It writes:

     claudeventure/assets/cast-sheet.png      the stalls, dishes and fittings
     claudeventure/assets/wardrobe-sheet.png  all fifty-one garments, worn
     claudeventure/assets/cast.json           a fingerprint per model

   `--check` rebuilds and fails if anything drifted from the committed
   manifest, which is what makes the sheets a test rather than a screenshot: a
   recipe that changes by one voxel fails CI with its own name and the old and
   new hashes.

   Usage:
     node tools/claudeventure-check.mjs           # assert, then write
     node tools/claudeventure-check.mjs --check   # assert, then fail on drift
     node tools/claudeventure-check.mjs --quiet   # assert only, write nothing
   =========================================================================== */

import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import zlib from 'node:zlib';
import { loadVoxel, ROOT } from './voxel-load.mjs';
import { stroke, measure } from './voxel-font.mjs';

const require = createRequire(import.meta.url);
const VOX = loadVoxel();

/* The game's own scripts, in the order index.html loads them. Anything past
   03-stage.js touches a canvas or the DOM and has no business here. */
const HEADLESS = ['01-props.js', '02-people.js', '04-content.js', '05-game.js'];
for (const file of HEADLESS) require(join(ROOT, 'claudeventure', 'scripts', file));
const CV = globalThis.CV;

const args = process.argv.slice(2);
const flag = name => args.includes(`--${name}`);
const ASSETS = join(ROOT, 'claudeventure', 'assets');
const INK = '#f4ece2', DIM = '#a2919c', PAPER = '#241d29', RULE = '#4a3d52';

const failures = [];
const fail = message => failures.push(message);

/* ------------------------------------------------------------------ text */

function label(image, text, x, y, scale, color, align = 'left') {
  const width = measure(text, scale);
  const at = align === 'centre' ? Math.round(x - width / 2) : align === 'right' ? x - width : x;
  const c = VOX.util.rgb(color);
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  stroke(text, at, y, scale, (px, py) => {
    if (px < 0 || py < 0 || px >= image.width || py >= image.height) return;
    const i = (py * image.width + px) * 4;
    image.data[i] = r; image.data[i + 1] = g; image.data[i + 2] = b; image.data[i + 3] = 255;
  });
  return width;
}

/** FNV-1a over the sorted voxel list — the same fingerprint the voxel tools use. */
function fingerprint(model) {
  let hash = 2166136261;
  for (const v of model.voxels()) {
    for (const part of [v.x, v.y, v.z, v.color, v.material]) {
      hash ^= part & 0xff; hash = Math.imul(hash, 16777619);
      hash ^= (part >> 8) & 0xff; hash = Math.imul(hash, 16777619);
      hash ^= (part >> 16) & 0xff; hash = Math.imul(hash, 16777619);
    }
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/* ---------------------------------------------------------------- build */

const entries = Array.from(VOX.registry.values()).filter(e => e.category.startsWith('cv'));
if (!entries.length) { console.error('claudeventure: no models registered'); process.exit(1); }

console.log(`claudeventure: building ${entries.length} models`);
const built = entries.map(entry => {
  const model = VOX.build(entry.name);
  return { entry, model, mesh: VOX.mesh(model), print: fingerprint(model) };
});

/* -------------------------------------------------------------- asserts */

/* The conventions from voxel/README.md, applied to the game's own cast. A
   model that breaks one of these does not look wrong on its own — it looks
   wrong standing next to everything else, which is much harder to spot. */
for (const { entry, model } of built) {
  const bounds = model.bounds();
  if (!model.size) { fail(`${entry.name} builds nothing`); continue; }
  if (bounds.min[1] !== 0) fail(`${entry.name} does not stand on y = 0 (min y ${bounds.min[1]})`);
  if (Math.abs(bounds.center[0]) > 1) fail(`${entry.name} is not centred on x (centre ${bounds.center[0]})`);
  if (model.palette().length > 255) fail(`${entry.name} uses ${model.palette().length} colours — a .vox palette holds 255`);
  const [w, h, d] = bounds.size;
  if (w > 64 || d > 64) fail(`${entry.name} is ${w}x${d} on the floor — a stall pitch is 24`);
  if (h > 72) fail(`${entry.name} is ${h} tall — the room is 34 and a stall about 40`);

  /* Deterministic by construction: a recipe that reaches for Math.random
     cannot be fingerprinted, and every sheet in assets/ stops meaning anything. */
  if (fingerprint(VOX.build(entry.name)) !== fingerprint(model)) {
    fail(`${entry.name} builds differently every time — something in it is random`);
  }
}

/* Every station has three tiers, every dish is real, every garment has a slot,
   a rarity and a boost the simulation knows how to apply. */
for (const machine of CV.machineNames) {
  for (const tier of [1, 2, 3]) {
    if (!VOX.get(`cv-${machine}-${tier}`)) fail(`no model for station ${machine} at tier ${tier}`);
  }
}
for (const id of Object.keys(CV.Content.STATIONS)) {
  const def = CV.Content.STATIONS[id];
  if (!CV.machineNames.includes(def.machine)) fail(`station ${id} wants machine "${def.machine}", which has no recipe`);
  if (!CV.dishNames.includes(def.dish)) fail(`station ${id} serves "${def.dish}", which has no recipe`);
}
for (const shop of CV.Content.SHOPS) {
  for (const id of shop.stations) if (!CV.Content.STATIONS[id]) fail(`shop ${shop.id} lists unknown station "${id}"`);
  if (shop.stations.length !== 4) fail(`shop ${shop.id} has ${shop.stations.length} stations — the floor has four pitches`);
}
for (const item of CV.People.WEAR) {
  if (!CV.People.SLOTS.includes(item.slot)) fail(`garment ${item.id} has unknown slot "${item.slot}"`);
  if (!CV.Content.RARITY[item.rarity]) fail(`garment ${item.id} has unknown rarity "${item.rarity}"`);
  if (!item.boost || !CV.Content.BOOSTS[item.boost[0]]) fail(`garment ${item.id} has no usable boost`);
  else if (item.boost[1] <= 0 || item.boost[1] > 0.2) fail(`garment ${item.id} boosts ${item.boost[1]} — the band is 0 to 0.2`);
  if (!VOX.get(`cv-wear-${item.id}`)) fail(`garment ${item.id} has no mannequin in the catalogue`);
}
const ids = CV.People.WEAR.map(i => i.id);
if (new Set(ids).size !== ids.length) fail('two garments share an id');

/* Every pose a character can hold has to build, in every slot combination the
   game will ask for — the sit pose lifts the body and re-stamps the wardrobe,
   which is the one path that can put a hat inside a head. */
for (const pose of CV.People.POSE_NAMES) {
  const look = CV.People.guest(3);
  look.wear = { hat: 'wizard-hat', face: 'shades', top: 'puffer', bottom: 'tutu', shoes: 'skates', back: 'wings' };
  const model = CV.People.person(look, pose);
  if (!model.size) fail(`a fully dressed guest in pose "${pose}" builds nothing`);
  const bounds = model.bounds();
  if (bounds.size[1] > 46) fail(`pose "${pose}" is ${bounds.size[1]} tall — a character is about 20`);
}

/* The economy has to be monotone: a later shop must never be cheaper than an
   earlier one, or the run stalls somewhere in the middle and nobody can say why. */
let previousScale = 0;
for (const shop of CV.Content.SHOPS) {
  if (shop.scale <= previousScale) fail(`shop ${shop.id} is not richer than the one before it`);
  previousScale = shop.scale;
  for (let slot = 1; slot < 4; slot++) {
    const cheaper = CV.Content.rankUnlock(slot, shop.scale) <= CV.Content.rankUnlock(slot - 1, shop.scale);
    if (cheaper) fail(`shop ${shop.id} slot ${slot} costs no more than slot ${slot - 1}`);
  }
}

/* And the simulation has to run: two minutes of it, headless, with no throw
   and something actually earned at the end. */
const game = CV.Game.create();
game.cash = 5000;
for (let slot = 0; slot < 4; slot++) game.buyStation(slot, 4);
for (let i = 0; i < 120 * 20; i++) game.step(1 / 20);
if (game.served === 0) fail('two minutes of simulation served nobody');
if (game.lifetime <= 0) fail('two minutes of simulation earned nothing');
const round = JSON.parse(JSON.stringify(game.toJSON()));
if (!CV.Game.create().load(round)) fail('a save does not load back');
console.log(`claudeventure: 2 min of play served ${game.served} guests for ${CV.Content.money(game.lifetime)}`);

if (failures.length) {
  console.error(`\nFAILED — ${failures.length} problem(s):`);
  for (const message of failures) console.error(`  * ${message}`);
  process.exit(1);
}
console.log(`claudeventure: ${built.length} models pass every assertion`);
if (flag('quiet')) process.exit(0);

/* --------------------------------------------------------------- sheets */

if (!existsSync(ASSETS)) mkdirSync(ASSETS, { recursive: true });

function sheet(items, { title, sub, tile, columns, yaw = 45, pitch = 34, zoom = 0.95 }) {
  const CAPTION = 22, TOP = 84;
  const rows = Math.ceil(items.length / columns);
  const width = columns * tile;
  const image = VOX.Raster.image(width, TOP + rows * (tile + CAPTION) + 18, PAPER);
  label(image, title, 14, 22, 4, INK);
  label(image, sub, 14, 52, 2, DIM);
  VOX.Raster.rect(image, 12, 70, width - 24, 1, RULE);
  items.forEach((item, index) => {
    const x = (index % columns) * tile;
    const y = TOP + Math.floor(index / columns) * (tile + CAPTION);
    const shot = VOX.Raster.render(item.mesh, {
      width: tile - 8, height: tile - 8, samples: 2, projection: 'orthographic', yaw, pitch, zoom,
    });
    VOX.Raster.blit(image, shot, x + 4, y + 4);
    label(image, item.entry.title.toUpperCase(), x + tile / 2, y + tile + 2, 1, DIM, 'centre');
  });
  return image;
}

const cast = built.filter(b => b.entry.category === 'cv');
const wardrobe = built.filter(b => b.entry.category === 'cv-wear');

const castSheet = sheet(cast, {
  title: 'CLAUDEVENTURE — THE CAST',
  sub: `${cast.length} MODELS / STALLS AT THREE TIERS, DISHES, FITTINGS / RENDERED HEADLESS`,
  tile: 150, columns: 9,
});
const wardrobeSheet = sheet(wardrobe, {
  title: 'CLAUDEVENTURE — THE WARDROBE',
  sub: `${wardrobe.length} GARMENTS / ONE FUNCTION EACH, DRAWN ONTO THE SAME BODY`,
  tile: 132, columns: 10, yaw: 34, pitch: 20, zoom: 0.94,
});

const manifest = {
  format: 'claudeventure-cast/1',
  models: built.length,
  garments: wardrobe.length,
  cast: Object.fromEntries(built.map(b => [b.entry.name, {
    print: b.print, voxels: b.model.size, size: b.model.bounds().size,
  }])),
};

const outputs = [
  ['cast-sheet.png', VOX.Export.toPNG(castSheet, zlib.deflateSync)],
  ['wardrobe-sheet.png', VOX.Export.toPNG(wardrobeSheet, zlib.deflateSync)],
  ['cast.json', Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`)],
];

if (flag('check')) {
  let drift = 0;
  const path = join(ASSETS, 'cast.json');
  if (!existsSync(path)) {
    console.error('claudeventure: assets/cast.json is missing — run tools/claudeventure-check.mjs');
    process.exit(1);
  }
  const committed = JSON.parse(readFileSync(path, 'utf8'));
  for (const [name, entry] of Object.entries(manifest.cast)) {
    const was = committed.cast[name];
    if (!was) { console.error(`  + ${name} is new`); drift++; continue; }
    if (was.print !== entry.print) {
      console.error(`  ~ ${name} changed: ${was.print} -> ${entry.print} (${was.voxels} -> ${entry.voxels} voxels)`);
      drift++;
    }
  }
  for (const name of Object.keys(committed.cast)) {
    if (!manifest.cast[name]) { console.error(`  - ${name} is gone`); drift++; }
  }
  if (drift) {
    console.error(`\nclaudeventure: ${drift} model(s) drifted from assets/cast.json.`);
    console.error('Run `node tools/claudeventure-check.mjs` and commit the result.');
    process.exit(1);
  }
  console.log('claudeventure: the committed cast matches its generator.');
  process.exit(0);
}

for (const [name, bytes] of outputs) writeFileSync(join(ASSETS, name), bytes);
console.log(`claudeventure: wrote ${outputs.map(o => `assets/${o[0]}`).join(', ')}`);
