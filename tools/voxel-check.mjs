#!/usr/bin/env node
/* ===========================================================================
   The voxel library's test suite.

   Everything here is a failure this project has an actual way of shipping:

     · a recipe that throws, or builds nothing, is invisible in a gallery that
       lazily renders only what is on screen;
     · a recipe that is not deterministic makes the baked sheets drift on every
       run and turns the CI drift gate into noise;
     · a model that renders to an empty tile — built entirely below y = 0,
       say, or inside out — looks exactly like a model that has not loaded;
     · an export that silently drops voxels is only noticed by whoever opens
       the file a week later.

   No dependencies, no browser. Runs in about a second.

   Usage:  node tools/voxel-check.mjs [--verbose]
   =========================================================================== */

import zlib from 'node:zlib';
import { loadVoxel } from './voxel-load.mjs';

const VOX = loadVoxel();
const VERBOSE = process.argv.includes('--verbose') || process.argv.includes('-v');

const failures = [];
let checks = 0;
const fail = message => failures.push(message);
const ok = (condition, message) => { checks++; if (!condition) fail(message); return condition; };
const say = message => { if (VERBOSE) console.log(message); };

/* ------------------------------------------------------------- the library */

{
  const m = VOX.model('primitives');
  m.box(0, 0, 0, 2, 2, 2, '#ff0000');
  ok(m.size === 27, `box: expected 27 voxels, got ${m.size}`);
  ok(m.colorAt(1, 1, 1) === 0xff0000, 'box: colour did not round-trip');

  m.remove(1, 1, 1, 1, 1, 1);
  ok(m.size === 26, 'remove: did not delete exactly one voxel');

  const mirrored = VOX.model('mirror');
  mirrored.box(1, 0, 0, 2, 0, 0, '#00ff00');
  mirrored.mirrorX();
  ok(mirrored.size === 4 && mirrored.has(-2, 0, 0), 'mirrorX: did not reflect across x = 0');

  const turned = VOX.model('turn');
  turned.set(3, 0, 0, '#0000ff');
  turned.rotateY(1);
  ok(turned.has(0, 0, 3), `rotateY: expected (0,0,3), got ${JSON.stringify(turned.voxels()[0])}`);
  turned.rotateY(3);
  ok(turned.has(3, 0, 0), 'rotateY: four quarter turns did not return to the start');

  const scaled = VOX.model('scale');
  scaled.set(0, 0, 0, '#ffffff');
  scaled.scale(3);
  ok(scaled.size === 27, `scale: expected 27 voxels, got ${scaled.size}`);

  ok(VOX.util.rgb('#abc') === 0xaabbcc, 'rgb: three-digit hex did not expand');
  ok(VOX.util.hex(0x1a2b3c) === '#1a2b3c', 'hex: round trip failed');
  ok(VOX.util.shade('#808080', 0) === 0, 'shade: 0 should be black');

  /* The grain is hashed, not random: two builds must agree exactly. */
  const a = VOX.model('grain'); a.box(0, 0, 0, 5, 5, 5, '#808080'); a.grain(0.2);
  const b = VOX.model('grain'); b.box(0, 0, 0, 5, 5, 5, '#808080'); b.grain(0.2);
  ok(JSON.stringify(a.voxels()) === JSON.stringify(b.voxels()), 'grain: not deterministic');
}

/* -------------------------------------------------------------- the mesher */

{
  const solid = VOX.model('solid');
  solid.box(0, 0, 0, 3, 3, 3, '#888888');
  const mesh = VOX.mesh(solid);
  ok(mesh.quads === 6, `mesher: a cube should greedy-merge to 6 quads, got ${mesh.quads}`);
  ok(mesh.count === 36, `mesher: 6 quads is 36 vertices, got ${mesh.count}`);
  ok(mesh.position.every(Number.isFinite), 'mesher: non-finite vertex position');

  const ungreedy = VOX.mesh(solid, { greedy: false });
  ok(ungreedy.quads === 96, `mesher: 4x4x4 has 96 outer faces, got ${ungreedy.quads}`);

  const buried = VOX.model('buried');
  buried.box(0, 0, 0, 4, 4, 4, '#888888');
  const before = VOX.mesh(buried).quads;
  buried.set(2, 2, 2, '#ff0000');
  ok(VOX.mesh(buried).quads === before, 'mesher: an interior voxel produced faces');
}

/* ------------------------------------------------------------ the exporters */

{
  const model = VOX.build('chest');

  const json = JSON.parse(VOX.Export.toJSONText(model));
  const back = VOX.Model.fromJSON(json);
  ok(back.size === model.size, `json: ${model.size} voxels in, ${back.size} out`);
  ok(JSON.stringify(back.voxels()) === JSON.stringify(model.voxels()), 'json: voxels did not survive the round trip');

  const { obj, mtl } = VOX.Export.toOBJ(model);
  ok(/^v -?\d/m.test(obj) && /^f \d+ \d+ \d+$/m.test(obj), 'obj: no vertices or faces');
  ok(/newmtl /.test(mtl) && obj.includes('mtllib'), 'obj: material library not referenced');

  const ply = VOX.Export.toPLY(model);
  ok(ply.startsWith('ply\n') && ply.includes('end_header'), 'ply: malformed header');

  const vox = VOX.Export.toVOX(model);
  const magic = String.fromCharCode(...vox.slice(0, 4));
  ok(magic === 'VOX ', `vox: bad magic "${magic}"`);
  const view = new DataView(vox.buffer, vox.byteOffset);
  ok(view.getInt32(4, true) === 150, 'vox: wrong version');
  /* Search for the chunk tag as bytes: "VOX " itself contains an 'X'. */
  const xyzi = Buffer.from(vox.buffer, vox.byteOffset, vox.length).indexOf('XYZI');
  ok(xyzi > 0, 'vox: no XYZI chunk');
  ok(view.getInt32(xyzi + 12, true) === model.size, 'vox: voxel count does not match the model');

  /* Both PNG paths have to produce something a decoder accepts. */
  for (const [label, deflate] of [['zlib', zlib.deflateSync], ['stored', null]]) {
    const image = VOX.Raster.image(8, 8, '#123456');
    const png = VOX.Export.toPNG(image, deflate);
    ok(png[0] === 137 && String.fromCharCode(...png.slice(1, 4)) === 'PNG', `png/${label}: bad signature`);
    const idat = Buffer.from(png).indexOf('IDAT');
    const length = Buffer.from(png).readUInt32BE(idat - 4);
    const inflated = zlib.inflateSync(Buffer.from(png.slice(idat + 4, idat + 4 + length)));
    ok(inflated.length === 8 * (8 * 4 + 1), `png/${label}: IDAT does not inflate to a full image`);
    ok(inflated[1] === 0x12 && inflated[2] === 0x34, `png/${label}: first pixel is wrong`);
  }
}

/* ----------------------------------------------------------- the catalogue */

const seen = new Set();
const validCategories = new Set(VOX.CATEGORIES.map(c => c[0]));
const entries = Array.from(VOX.registry.values());
ok(entries.length >= 60, `catalogue: only ${entries.length} models registered`);

for (const entry of entries) {
  const where = `${entry.category}/${entry.name}`;
  ok(!seen.has(entry.name), `catalogue: duplicate name "${entry.name}"`);
  seen.add(entry.name);
  ok(validCategories.has(entry.category), `${where}: unknown category`);
  ok(/^[a-z0-9-]+$/.test(entry.name), `${where}: name should be lower-case and hyphenated`);
  ok(entry.note.length > 0, `${where}: no note — every model should say what it is for`);

  let model;
  try {
    model = VOX.build(entry.name);
  } catch (error) {
    fail(`${where}: build threw — ${error.message}`);
    continue;
  }

  ok(model.size > 0, `${where}: built nothing`);
  ok(model.size < 40000, `${where}: ${model.size} voxels is beyond what a game page wants`);

  const bounds = model.bounds();
  ok(bounds.min[1] === 0, `${where}: sits at y = ${bounds.min[1]}, should be grounded at 0`);
  ok(Math.abs(bounds.min[0] + bounds.max[0]) <= 1, `${where}: not centred on x (${bounds.min[0]}..${bounds.max[0]})`);
  ok(Math.max(...bounds.size) <= 96, `${where}: ${bounds.size.join('x')} is too big to place`);

  const palette = model.palette();
  ok(palette.length <= 255, `${where}: ${palette.length} colours exceeds the 255 a .vox palette holds`);

  /* Determinism, checked the same way the CI drift gate checks it. */
  const again = VOX.build(entry.name);
  ok(JSON.stringify(again.voxels()) === JSON.stringify(model.voxels()), `${where}: two builds differ`);

  const mesh = VOX.mesh(model);
  ok(mesh.count > 0 && mesh.count % 3 === 0, `${where}: mesh has ${mesh.count} vertices`);
  ok(mesh.position.every(Number.isFinite), `${where}: mesh has a non-finite position`);
  ok(mesh.triangles < 60000, `${where}: ${mesh.triangles} triangles is too many`);

  /* Does it actually show up? An empty tile is the failure nobody reports. */
  const shot = VOX.Raster.render(mesh, { width: 64, height: 64, samples: 1, yaw: 32, pitch: 22 });
  let covered = 0;
  for (let i = 3; i < shot.data.length; i += 4) if (shot.data[i] > 8) covered++;
  const fraction = covered / (64 * 64);
  ok(fraction > 0.04, `${where}: renders to ${(fraction * 100).toFixed(1)}% of the frame — is it visible?`);

  say(`  ${where.padEnd(28)} ${String(model.size).padStart(6)} voxels  ${String(mesh.triangles).padStart(6)} tris  ${bounds.size.join('x')}`);
}

/* --------------------------------------------------------------- the view */

{
  const model = VOX.build('knight');
  const mesh = VOX.mesh(model);
  const first = VOX.Raster.render(mesh, { width: 48, height: 48, samples: 1, yaw: 0, pitch: 20 });
  const second = VOX.Raster.render(mesh, { width: 48, height: 48, samples: 1, yaw: 180, pitch: 20 });
  ok(Buffer.compare(Buffer.from(first.data), Buffer.from(second.data)) !== 0,
    'camera: front and back render identically — is yaw connected?');

  const cam = VOX.View.camera(mesh.bounds, { width: 100, height: 100, yaw: 0, pitch: 0, zoom: 1 });
  ok(cam.eye[2] > cam.center[2], 'camera: yaw 0 should put the eye in front of the model');
  ok(cam.near > 0 && cam.far > cam.near, 'camera: bad near/far');
}

/* -------------------------------------------------------------------- done */

if (failures.length) {
  console.error(`\nvoxel-check: ${failures.length} failure${failures.length === 1 ? '' : 's'} in ${checks} checks\n`);
  for (const message of failures) console.error(`  ✗ ${message}`);
  process.exit(1);
}
console.log(`voxel-check: ${checks} checks passed over ${entries.length} models.`);
