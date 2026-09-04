/* ---------------------------------------------------------------------------
   The gallery page.

   This file owns the DOM and nothing else — every model, mesh and pixel comes
   from the library above it, which is the point: if the page were deleted the
   maker would still work, and a game embedding it gets the same models the
   gallery shows.

   Two decisions worth knowing about:

   1. Tiles are built on demand. Ninety-odd models is a couple of seconds of
      meshing if you do it up front, so an IntersectionObserver queues a tile
      when it nears the viewport and a small budget per frame drains the queue.
      Scrolling fast never blocks the main thread for more than a frame or two.

   2. The workbench really does re-run the recipe. It evaluates the edited
      function in a scope built from VOX.kit, so `humanoid`, `shade`, `P` and
      the rest resolve exactly as they do in the catalogue source. It runs in
      your browser, on your machine, against your own text — nothing is sent
      anywhere and nothing is stored.
   --------------------------------------------------------------------------- */

(() => {
'use strict';

const VOX = window.VOX;
const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

const state = {
  query: '',
  category: 'all',
  spin: true,
  tiles: new Map(),
  queue: [],
  draining: false,
};

/* ------------------------------------------------------------------ toast */

let toastTimer = 0;
const toastNode = document.createElement('div');
toastNode.className = 'toast';
toastNode.setAttribute('role', 'status');
document.body.appendChild(toastNode);

function toast(message) {
  toastNode.textContent = message;
  toastNode.classList.add('is-open');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastNode.classList.remove('is-open'), 2400);
}

/* ------------------------------------------------------------------ files */

function save(filename, content, type) {
  VOX.Export.download(filename, content, type);
  toast(`Saved ${filename}`);
}

/* ------------------------------------------------------------------- grid */

const observer = new IntersectionObserver(entries => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    observer.unobserve(entry.target);
    state.queue.push(entry.target);
  }
  drain();
}, { rootMargin: '400px 0px' });

/** Build queued tiles a couple at a time, so a fast scroll never stalls. */
function drain() {
  if (state.draining || !state.queue.length) return;
  state.draining = true;
  requestAnimationFrame(() => {
    const started = performance.now();
    while (state.queue.length && performance.now() - started < 12) {
      const node = state.queue.shift();
      if (node.isConnected) mount(node);
    }
    state.draining = false;
    if (state.queue.length) drain();
  });
}

function mount(node) {
  const name = node.dataset.model;
  if (state.tiles.has(name)) return;
  let model;
  try {
    model = VOX.build(name);
  } catch (error) {
    node.querySelector('canvas').replaceWith(Object.assign(document.createElement('p'), {
      className: 'empty', textContent: `${name} failed to build`,
    }));
    console.error(`voxel: ${name} failed to build`, error);
    return;
  }
  const viewer = VOX.Viewer.attach(node.querySelector('canvas'), model, {
    spin: state.spin, maxPixels: 520,
  });
  const stats = node.querySelector('.tile-name small');
  if (stats) stats.textContent = `${model.size.toLocaleString()} voxels`;
  state.tiles.set(name, { viewer, model, node });
}

function tile(entry) {
  const node = document.createElement('article');
  node.className = 'tile';
  node.dataset.model = entry.name;
  node.innerHTML = `
    <canvas aria-label="${entry.title}: drag to turn, arrow keys to rotate" role="img"></canvas>
    <div class="tile-foot">
      <button class="tile-name" type="button">${entry.title}<small>…</small></button>
      <button class="tile-open" type="button" aria-label="Inspect ${entry.title}">
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 2H2v4M10 14h4v-4M14 6V2h-4M2 10v4h4"/></svg>
      </button>
    </div>`;
  const open = () => inspect(entry.name);
  node.querySelector('.tile-name').addEventListener('click', open);
  node.querySelector('.tile-open').addEventListener('click', open);
  node.querySelector('canvas').addEventListener('dblclick', open);
  observer.observe(node);
  return node;
}

function matches(entry) {
  if (state.category !== 'all' && entry.category !== state.category) return false;
  if (!state.query) return true;
  const haystack = `${entry.name} ${entry.title} ${entry.category} ${entry.tags.join(' ')} ${entry.note}`.toLowerCase();
  return state.query.split(/\s+/).every(word => haystack.includes(word));
}

function render() {
  const host = $('#catalogue');
  /* Filtering rebuilds every tile, so the viewers attached to the old ones are
     now pointing at canvases that have left the document. Tear them down first
     — otherwise `mount` sees the name already in `state.tiles`, skips the new
     tile, and you get a grid of blank squares after clearing a search. The
     meshes stay cached in VOX.Viewer.meshes, so re-mounting is cheap. */
  for (const { viewer } of state.tiles.values()) viewer.destroy();
  state.tiles.clear();
  state.queue.length = 0;
  host.textContent = '';
  let shown = 0;

  for (const [id, title, blurb] of VOX.CATEGORIES) {
    const entries = VOX.list().filter(entry => entry.category === id && matches(entry));
    if (!entries.length) continue;
    shown += entries.length;

    const group = document.createElement('section');
    group.className = 'group';
    const head = document.createElement('div');
    head.className = 'group-head';
    head.innerHTML = `<h2 id="cat-${id}">${title}</h2><p>${blurb}</p><span class="count">${entries.length}</span>`;
    group.appendChild(head);

    const grid = document.createElement('div');
    grid.className = 'grid';
    grid.setAttribute('aria-labelledby', `cat-${id}`);
    for (const entry of entries.sort((a, b) => a.title.localeCompare(b.title))) grid.appendChild(tile(entry));
    group.appendChild(grid);
    host.appendChild(group);
  }

  if (!shown) {
    host.innerHTML = '<p class="empty">Nothing matches that. Try <b>tree</b>, <b>glow</b>, or clear the search.</p>';
  }
  $('#result-count').textContent = shown;
}

/* -------------------------------------------------------------- inspector */

const dialog = $('#inspector');
let inspector = null;

function inspect(name) {
  const entry = VOX.get(name);
  if (!entry) return;
  let model;
  try {
    model = VOX.build(name);
  } catch (error) {
    toast(`${name} failed to build`);
    return;
  }
  const mesh = VOX.mesh(model);
  const bounds = model.bounds();
  const palette = model.palette();

  $('#inspector-title').textContent = entry.title;
  $('#inspector-note').textContent = entry.note || `A ${entry.category.replace(/s$/, '')} model.`;
  $('#fact-voxels').textContent = model.size.toLocaleString();
  $('#fact-size').textContent = bounds.size.join('×');
  $('#fact-tris').textContent = mesh.triangles.toLocaleString();
  $('#fact-colours').textContent = palette.length;

  const swatches = $('#swatches');
  swatches.textContent = '';
  for (const { color, count } of palette.slice(0, 22)) {
    const chip = document.createElement('span');
    chip.className = 'swatch';
    chip.style.background = VOX.util.hex(color);
    chip.title = `${VOX.util.hex(color)} — ${count} voxels`;
    swatches.appendChild(chip);
  }

  const source = $('#recipe');
  source.value = entry.build.toString();
  $('#run-note').textContent = 'Edit and run — it only touches this page.';
  $('#run-note').className = 'run-note';

  const canvas = $('#inspector-canvas');
  if (inspector) inspector.destroy();
  inspector = VOX.Viewer.attach(canvas, model, {
    spin: state.spin, maxPixels: 1400, meshKey: `inspect:${name}`, zoom: 0.95,
  });
  dialog.dataset.model = name;
  if (!dialog.open) dialog.showModal();
  if (location.hash.slice(1) !== name) history.replaceState(null, '', `#${name}`);
}

function currentModel() {
  return inspector ? inspector.model : null;
}

$('#inspector-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => {
  if (inspector) { inspector.destroy(); inspector = null; }
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
});
dialog.addEventListener('click', event => {
  /* Clicking the backdrop closes; clicking anything inside the card does not. */
  if (event.target === dialog) dialog.close();
});

for (const button of $$('.view-bar button[data-face]')) {
  button.addEventListener('click', () => inspector && inspector.face(button.dataset.face));
}
$('#view-spin').addEventListener('click', () => {
  if (!inspector) return;
  inspector.spin = !inspector.spin;
  inspector.dirty = true;
  VOX.Viewer.redraw();
  $('#view-spin').setAttribute('aria-pressed', String(inspector.spin));
});

/* --------------------------------------------------------------- exports */

const exporters = {
  json: model => save(`${model.name}.json`, VOX.Export.toJSONText(model, true), 'application/json'),
  obj: model => {
    const { obj, mtl } = VOX.Export.toOBJ(model);
    save(`${model.name}.obj`, obj, 'text/plain');
    setTimeout(() => save(`${model.name}.mtl`, mtl, 'text/plain'), 350);
  },
  ply: model => save(`${model.name}.ply`, VOX.Export.toPLY(model), 'text/plain'),
  vox: model => save(`${model.name}.vox`, VOX.Export.toVOX(model), 'application/octet-stream'),
  png: model => {
    /* The browser's own PNG encoder is a great deal smaller than the library's
       dependency-free one, so use it when it is there. */
    const canvas = $('#inspector-canvas');
    if (canvas.toBlob) {
      canvas.toBlob(blob => save(`${model.name}.png`, blob, 'image/png'), 'image/png');
      return;
    }
    const image = VOX.Raster.render(VOX.mesh(model), {
      width: 512, height: 512, samples: 2,
      yaw: inspector.yaw, pitch: inspector.pitch, zoom: inspector.zoom,
    });
    save(`${model.name}.png`, VOX.Export.toPNG(image), 'image/png');
  },
};

for (const button of $$('.actions button[data-export]')) {
  button.addEventListener('click', () => {
    const model = currentModel();
    if (model) exporters[button.dataset.export](model);
  });
}

$('#copy-recipe').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('#recipe').value);
    toast('Recipe copied');
  } catch {
    $('#recipe').select();
    toast('Press ⌘C / Ctrl+C to copy');
  }
});

/* ------------------------------------------------------------- workbench */

/**
 * Re-evaluate an edited recipe. The scope is VOX.kit plus the colour helpers,
 * which is what the catalogue files themselves have in scope — without it,
 * editing anything that calls `humanoid()` or names `P.gold` would throw.
 */
function runRecipe() {
  const note = $('#run-note');
  const text = $('#recipe').value;
  const name = dialog.dataset.model;
  try {
    const scope = Object.assign({ VOX, P: VOX.palette, M: VOX.MATERIAL, kit: VOX.kit }, VOX.kit, VOX.util);
    const keys = Object.keys(scope);
    // eslint-disable-next-line no-new-func
    const build = new Function(...keys, `"use strict"; return (${text});`)(...keys.map(key => scope[key]));
    if (typeof build !== 'function') throw new TypeError('that is not a function');

    const model = VOX.build({ name: `${name}*`, title: VOX.get(name).title, category: VOX.get(name).category, build });
    if (!model.size) throw new Error('the recipe built nothing');

    inspector.setModel(model, `workbench:${Date.now()}`);
    $('#fact-voxels').textContent = model.size.toLocaleString();
    $('#fact-size').textContent = model.bounds().size.join('×');
    $('#fact-tris').textContent = VOX.mesh(model).triangles.toLocaleString();
    $('#fact-colours').textContent = model.palette().length;
    note.textContent = `Built ${model.size.toLocaleString()} voxels.`;
    note.className = 'run-note is-ok';
  } catch (error) {
    note.textContent = String(error.message || error);
    note.className = 'run-note is-error';
  }
}

$('#run-recipe').addEventListener('click', runRecipe);
$('#recipe').addEventListener('keydown', event => {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); runRecipe(); }
});
$('#reset-recipe').addEventListener('click', () => {
  const entry = VOX.get(dialog.dataset.model);
  if (!entry) return;
  $('#recipe').value = entry.build.toString();
  runRecipe();
});

/* --------------------------------------------------------------- toolbar */

$('#search').addEventListener('input', event => {
  state.query = event.target.value.trim().toLowerCase();
  render();
});

$('#spin').addEventListener('click', () => {
  state.spin = !state.spin;
  $('#spin').setAttribute('aria-pressed', String(state.spin));
  $('#spin .label').textContent = state.spin ? 'Spinning' : 'Still';
  VOX.Viewer.setSpin(state.spin);
});

$('#size').addEventListener('input', event => {
  document.documentElement.style.setProperty('--tile-size', `${event.target.value}px`);
  VOX.Viewer.redraw();
});

$('#surprise').addEventListener('click', () => {
  const names = VOX.names();
  inspect(names[Math.floor(Math.random() * names.length)]);
});

function buildChips() {
  const chips = $('#chips');
  const all = VOX.list();
  const make = (id, title, count) => {
    const chip = document.createElement('button');
    chip.className = 'chip';
    chip.type = 'button';
    chip.dataset.category = id;
    chip.setAttribute('aria-pressed', String(state.category === id));
    chip.innerHTML = `${title}<span class="count">${count}</span>`;
    chip.addEventListener('click', () => {
      state.category = id;
      for (const other of $$('.chip')) other.setAttribute('aria-pressed', String(other.dataset.category === id));
      render();
    });
    chips.appendChild(chip);
  };
  make('all', 'All', all.length);
  for (const [id, title] of VOX.CATEGORIES) {
    const count = all.filter(entry => entry.category === id).length;
    if (count) make(id, title, count);
  }
}

/* ------------------------------------------------------------------- theme */

/* One key across the index, both tools, the 404 and this page. The value is
   JSON-encoded because the tools write it through common/scripts/util.js's
   store helper, which stringifies — read or write it any other way and the
   choice silently stops following the visitor between pages. */
const THEME_KEY = 'isaiart.theme';

function setTheme(value) {
  document.documentElement.dataset.theme = value;
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--bg-0').trim());
  const button = $('#theme');
  button.textContent = value === 'dark' ? 'Light' : 'Dark';
  button.setAttribute('aria-pressed', String(value === 'light'));
  try { localStorage.setItem(THEME_KEY, JSON.stringify(value)); } catch { /* private mode */ }
}

setTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
$('#theme').addEventListener('click', () => {
  setTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
});

/* ------------------------------------------------------------------- boot */

document.addEventListener('keydown', event => {
  if (event.key === '/' && document.activeElement !== $('#search') && !dialog.open) {
    event.preventDefault();
    $('#search').focus();
  }
});

const entries = VOX.list();
$('#stat-models').textContent = entries.length;
$('#stat-categories').textContent = VOX.CATEGORIES.filter(([id]) => entries.some(e => e.category === id)).length;
$('#stat-renderer').textContent = VOX.GL.available() ? 'WebGL2' : 'software';

buildChips();
render();

if (location.hash.length > 1) {
  const name = decodeURIComponent(location.hash.slice(1));
  if (VOX.get(name)) inspect(name);
}

window.addEventListener('hashchange', () => {
  const name = decodeURIComponent(location.hash.slice(1));
  if (name && VOX.get(name)) inspect(name);
  else if (!name && dialog.open) dialog.close();
});

/* A console handle, because half the point of a headless maker is the console. */
window.voxel = {
  build: VOX.build, list: VOX.names, get: VOX.get, kit: VOX.kit, VOX,
  show: inspect,
  help() {
    console.log([
      'voxel.build("knight")        build a model',
      'voxel.list()                 every model name',
      'voxel.show("dragon")         open one in the inspector',
      'VOX.Export.toVOX(model)      MagicaVoxel bytes',
      'VOX.Export.toOBJ(model)      { obj, mtl }',
    ].join('\n'));
  },
};

})();
