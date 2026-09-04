#!/usr/bin/env node
/* ===========================================================================
   Concatenate the voxel library into voxel/dist/voxel.js.

   The library is written as separate plain scripts because that is what the
   rest of this repository does and it keeps the files readable. A game page,
   though, wants one <script> tag — especially a game page that is not in this
   repository — so the same sources are stapled together in load order and
   committed. There is no minification, no transpiling and no source map: the
   bundle is the sources, in order, with a header.

   Anything numbered 99- is page boot code, not library, and stays out.

   Usage:
     node tools/voxel-build.mjs            # write the bundle
     node tools/voxel-build.mjs --check    # fail if it has drifted from source
   =========================================================================== */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, SCRIPTS } from './voxel-load.mjs';

const DIST = join(ROOT, 'voxel', 'dist');
const TARGET = join(DIST, 'voxel.js');
const check = process.argv.includes('--check');

const files = readdirSync(SCRIPTS).filter(f => f.endsWith('.js') && !f.startsWith('99-')).sort();

const header = `/* ---------------------------------------------------------------------------
   voxel.js — the headless voxel model maker, as one file.

   GENERATED. Do not edit: run \`node tools/voxel-build.mjs\` instead. The
   sources are voxel/scripts/*.js, concatenated here in load order.

   Usage in a page:
     <script src="voxel.js"></script>
     <script>
       const model = VOX.build('knight');          // or any catalogue name
       const mesh  = VOX.mesh(model);
       VOX.Viewer.attach(document.querySelector('canvas'), model);
     </script>

   Usage in Node:
     const VOX = require('./voxel.js');
     require('fs').writeFileSync('knight.vox', VOX.Export.toVOX(VOX.build('knight')));

   Contents: ${files.join(', ')}
   --------------------------------------------------------------------------- */

`;

const body = files.map(file => {
  const source = readFileSync(join(SCRIPTS, file), 'utf8').trimEnd();
  return `/* ===== ${file} ${'='.repeat(Math.max(0, 66 - file.length))} */\n\n${source}\n`;
}).join('\n');

const bundle = header + body + `
if (typeof module === 'object' && module.exports) module.exports = globalThis.VOX;
`;

if (check) {
  if (!existsSync(TARGET)) {
    console.error('voxel-build: voxel/dist/voxel.js is missing — run node tools/voxel-build.mjs');
    process.exit(1);
  }
  if (readFileSync(TARGET, 'utf8') !== bundle) {
    console.error('voxel-build: voxel/dist/voxel.js is stale — run node tools/voxel-build.mjs and commit it');
    process.exit(1);
  }
  console.log(`voxel-build: bundle matches ${files.length} sources.`);
  process.exit(0);
}

if (!existsSync(DIST)) mkdirSync(DIST, { recursive: true });
writeFileSync(TARGET, bundle);
console.log(`voxel-build: wrote voxel/dist/voxel.js — ${files.length} files, ${(bundle.length / 1024).toFixed(1)} kB`);
