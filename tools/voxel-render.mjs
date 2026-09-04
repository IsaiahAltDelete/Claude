#!/usr/bin/env node
/* ===========================================================================
   Bake the catalogue.

   Renders every model in voxel/scripts with the software rasteriser and writes:

     voxel/assets/catalog-sheet.png     every model, one tile each
     voxel/assets/turntable-sheet.png   one model per category, eight angles
     voxel/assets/catalog.json          a manifest with a fingerprint per model

   No browser, no canvas, no dependencies — that is the whole point. The sheets
   are the test image: if a recipe breaks, the tile goes wrong, and you can see
   it in a diff without opening anything.

   Usage:
     node tools/voxel-render.mjs                 # write everything
     node tools/voxel-render.mjs --only knight   # one model, to preview.png
     node tools/voxel-render.mjs --check         # fail if the manifest drifted
   =========================================================================== */

import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import zlib from 'node:zlib';
import { loadVoxel, ROOT } from './voxel-load.mjs';
import { stroke, measure } from './voxel-font.mjs';

const VOX = loadVoxel();
const args = process.argv.slice(2);
const flag = name => args.includes(`--${name}`);
const value = name => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? null : args[index + 1];
};

const ASSETS = join(ROOT, 'voxel', 'assets');
const INK = '#e8ecf5', DIM = '#7d879c', PAPER = '#12141c', PANEL = '#191c26';

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

/* ------------------------------------------------------------ fingerprint */

/** FNV-1a over the sorted voxel list — changes if any voxel or colour moves. */
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

/* ----------------------------------------------------------------- build */

const entries = Array.from(VOX.registry.values());
const order = VOX.CATEGORIES.map(c => c[0]);
entries.sort((a, b) => (order.indexOf(a.category) - order.indexOf(b.category)) || a.name.localeCompare(b.name));

console.log(`voxel: building ${entries.length} models`);
const built = entries.map(entry => {
  const started = Date.now();
  const model = VOX.build(entry.name);
  const mesh = VOX.mesh(model);
  return { entry, model, mesh, ms: Date.now() - started, print: fingerprint(model) };
});

/* --------------------------------------------------------------- preview */

if (flag('only')) {
  const name = value('only');
  const found = built.find(b => b.entry.name === name);
  if (!found) { console.error(`voxel: no model named "${name}"`); process.exit(1); }
  const image = VOX.Raster.image(640, 640, PAPER);
  const shot = VOX.Raster.render(found.mesh, { width: 620, height: 620, samples: 3, yaw: 32, pitch: 22, zoom: 0.94 });
  VOX.Raster.blit(image, shot, 10, 10);
  label(image, found.entry.title, 20, 20, 3, INK);
  writeFileSync(join(ASSETS, 'preview.png'), VOX.Export.toPNG(image, zlib.deflateSync));
  console.log(`voxel: wrote voxel/assets/preview.png — ${found.model.size} voxels`);
  process.exit(0);
}

/* ---------------------------------------------------------- contact sheet */

function contactSheet() {
  const TILE = 176, PAD = 10, COLUMNS = 8, CAPTION = 26, HEADING = 44;
  const groups = VOX.CATEGORIES
    .map(([id, title, blurb]) => ({ id, title, blurb, items: built.filter(b => b.entry.category === id) }))
    .filter(group => group.items.length);

  let height = 96;
  for (const group of groups) {
    group.top = height;
    group.rows = Math.ceil(group.items.length / COLUMNS);
    height += HEADING + group.rows * (TILE + CAPTION) + 18;
  }
  const width = COLUMNS * TILE + PAD * 2;
  const image = VOX.Raster.image(width, height + 30, PAPER);

  label(image, 'VOXEL CATALOGUE', PAD + 4, 26, 5, INK);
  label(image, `${built.length} MODELS / ${groups.length} CATEGORIES / RENDERED HEADLESS`, PAD + 4, 58, 2, DIM);
  VOX.Raster.rect(image, PAD, 78, width - PAD * 2, 1, '#2b3040');

  for (const group of groups) {
    let y = group.top;
    label(image, group.title.toUpperCase(), PAD + 4, y + 8, 3, INK);
    label(image, `${group.items.length}`, width - PAD - 4, y + 9, 2, DIM, 'right');
    VOX.Raster.rect(image, PAD, y + 30, width - PAD * 2, 1, '#232838');
    y += HEADING;

    group.items.forEach((item, index) => {
      const column = index % COLUMNS, row = Math.floor(index / COLUMNS);
      const x = PAD + column * TILE;
      const tileY = y + row * (TILE + CAPTION);
      VOX.Raster.rect(image, x + 3, tileY + 3, TILE - 6, TILE + CAPTION - 8, PANEL);
      const shot = VOX.Raster.render(item.mesh, {
        width: TILE - 12, height: TILE - 12, samples: 2,
        yaw: 32, pitch: 22, zoom: 0.92,
      });
      VOX.Raster.blit(image, shot, x + 6, tileY + 6);
      label(image, item.entry.title, x + TILE / 2, tileY + TILE - 2, 2, INK, 'centre');
      label(image, `${item.model.size}`, x + TILE / 2, tileY + TILE + 11, 2, DIM, 'centre');
    });
  }
  return image;
}

/* ------------------------------------------------------------- turntable */

function turntableSheet() {
  const TILE = 150, PAD = 10, ANGLES = 8, LABEL = 74;
  const picks = VOX.CATEGORIES
    .map(([id]) => built.find(b => b.entry.category === id))
    .filter(Boolean);
  const width = LABEL + ANGLES * TILE + PAD * 2;
  const height = 84 + picks.length * TILE + 24;
  const image = VOX.Raster.image(width, height, PAPER);

  label(image, 'FULL ROTATION', PAD + 4, 24, 5, INK);
  label(image, 'ONE MODEL PER CATEGORY, EVERY 45 DEGREES OF YAW', PAD + 4, 54, 2, DIM);
  VOX.Raster.rect(image, PAD, 72, width - PAD * 2, 1, '#2b3040');

  picks.forEach((item, row) => {
    const y = 84 + row * TILE;
    if (row % 2) VOX.Raster.rect(image, PAD, y, width - PAD * 2, TILE, PANEL);
    label(image, item.entry.title, PAD + 4, y + TILE / 2 - 8, 2, INK);
    label(image, item.entry.category, PAD + 4, y + TILE / 2 + 4, 2, DIM);
    for (let i = 0; i < ANGLES; i++) {
      const shot = VOX.Raster.render(item.mesh, {
        width: TILE - 8, height: TILE - 8, samples: 2,
        yaw: i * (360 / ANGLES), pitch: 20, zoom: 0.9,
      });
      VOX.Raster.blit(image, shot, PAD + LABEL + i * TILE + 4, y + 4);
      if (row === 0) label(image, `${i * (360 / ANGLES)}`, PAD + LABEL + i * TILE + TILE / 2, 60, 2, DIM, 'centre');
    }
  });
  return image;
}

/* ---------------------------------------------------------------- output */

if (!existsSync(ASSETS)) mkdirSync(ASSETS, { recursive: true });

const manifest = {
  format: 'vox-catalogue/1',
  models: built.length,
  categories: VOX.CATEGORIES.filter(([id]) => built.some(b => b.entry.category === id)).map(([id, title]) => ({
    id, title, count: built.filter(b => b.entry.category === id).length,
  })),
  entries: built.map(({ entry, model, mesh, print }) => ({
    name: entry.name,
    title: entry.title,
    category: entry.category,
    tags: entry.tags,
    note: entry.note,
    voxels: model.size,
    size: model.bounds().size,
    colours: model.palette().length,
    quads: mesh.quads,
    triangles: mesh.triangles,
    fingerprint: print,
  })),
};

const manifestPath = join(ASSETS, 'catalog.json');
const manifestText = JSON.stringify(manifest, null, 2) + '\n';

if (flag('check')) {
  if (!existsSync(manifestPath)) {
    console.error('voxel: no committed manifest to check against — run without --check first');
    process.exit(1);
  }
  const committed = readFileSync(manifestPath, 'utf8');
  if (committed !== manifestText) {
    const before = JSON.parse(committed);
    const now = new Map(manifest.entries.map(e => [e.name, e]));
    const was = new Map(before.entries.map(e => [e.name, e]));
    console.error('voxel: the catalogue no longer matches voxel/assets/catalog.json');
    for (const [name, entry] of now) {
      const old = was.get(name);
      if (!old) { console.error(`  + ${name} (new)`); continue; }
      if (old.fingerprint !== entry.fingerprint) {
        console.error(`  ~ ${name}: ${old.voxels} -> ${entry.voxels} voxels, ${old.fingerprint} -> ${entry.fingerprint}`);
      }
    }
    for (const name of was.keys()) if (!now.has(name)) console.error(`  - ${name} (gone)`);
    console.error('  run: node tools/voxel-render.mjs   and commit voxel/assets');
    process.exit(1);
  }
  console.log(`voxel: ${built.length} models match the committed manifest.`);
  process.exit(0);
}

writeFileSync(manifestPath, manifestText);
console.log('voxel: wrote voxel/assets/catalog.json');

const sheet = contactSheet();
writeFileSync(join(ASSETS, 'catalog-sheet.png'), VOX.Export.toPNG(sheet, zlib.deflateSync));
console.log(`voxel: wrote voxel/assets/catalog-sheet.png — ${sheet.width}x${sheet.height}`);

const turntable = turntableSheet();
writeFileSync(join(ASSETS, 'turntable-sheet.png'), VOX.Export.toPNG(turntable, zlib.deflateSync));
console.log(`voxel: wrote voxel/assets/turntable-sheet.png — ${turntable.width}x${turntable.height}`);

const slow = built.slice().sort((a, b) => b.ms - a.ms).slice(0, 3);
console.log(`voxel: ${built.reduce((n, b) => n + b.model.size, 0).toLocaleString()} voxels, `
  + `${built.reduce((n, b) => n + b.mesh.triangles, 0).toLocaleString()} triangles; `
  + `slowest: ${slow.map(b => `${b.entry.name} ${b.ms}ms`).join(', ')}`);
