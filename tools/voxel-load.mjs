/* ---------------------------------------------------------------------------
   Load the voxel library headlessly.

   The library ships as plain scripts so a game page can drop them in with a
   <script> tag and no build step. That same shape loads fine in Node: each file
   assigns to a global `VOX` and exports it for CommonJS, so requiring them in
   filename order is all the "module system" this needs.

   Anything numbered 99- touches the DOM and is skipped here.
   --------------------------------------------------------------------------- */

import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const require = createRequire(import.meta.url);

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const SCRIPTS = join(ROOT, 'voxel', 'scripts');

export function loadVoxel() {
  const files = readdirSync(SCRIPTS).filter(f => f.endsWith('.js') && !f.startsWith('99-')).sort();
  for (const file of files) require(join(SCRIPTS, file));
  const VOX = globalThis.VOX;
  if (!VOX || typeof VOX.build !== 'function') throw new Error('voxel: library failed to load');
  return VOX;
}

export const scriptOrder = () =>
  readdirSync(SCRIPTS).filter(f => f.endsWith('.js')).sort();
