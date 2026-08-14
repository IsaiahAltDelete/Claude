/* ===========================================================================
   Smoke test for both simulators.

   Neither simulator has a global error handler, so a throw inside an app's
   render or mount produces a blank window and a console trace nobody sees: the
   app still appears in the Dock or on the home screen and is dead when clicked.
   That is exactly the failure a trainee hits and a maintainer never does.

   So: open every app in both simulators and fail on any console error, any
   uncaught rejection, any failed same-origin request, and any app that mounts
   empty. Sixty-odd apps, one screenful of assertions, every render path.

   The two deliberate network calls (Wikipedia, OpenStreetMap) are blocked so
   the run is deterministic and works offline.

   Usage:
     node tools/smoke.mjs                     # serves the repo itself
     node tools/smoke.mjs --base <url>        # test an already-served copy
     node tools/smoke.mjs --headed            # watch it

   Requires playwright. In CI:  npx --yes playwright@1.49.1 install --with-deps chromium
   =========================================================================== */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const flag = name => args.includes(`--${name}`);
const value = name => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? null : args[index + 1];
};

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.json': 'application/json', '.png': 'image/png', '.txt': 'text/plain; charset=utf-8',
};

/** Minimal static server, so the suite has no dependency on how you serve. */
async function serve() {
  const server = createServer(async (request, response) => {
    try {
      let path = decodeURIComponent(request.url.split('?')[0]);
      if (path.endsWith('/')) path += 'index.html';
      const file = join(ROOT, normalize(path).replace(/^(\.\.[/\\])+/, ''));
      const body = await readFile(file);
      response.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
      response.end(body);
    } catch {
      response.writeHead(404).end('not found');
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

const problems = [];
const note = message => problems.push(message);

/** Attach the listeners that turn a silent failure into a test failure. */
function watch(page, label) {
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const text = message.text();
    // A blocked route is our own doing, not a defect.
    if (/net::ERR_(FAILED|BLOCKED|ABORTED)/.test(text)) return;
    note(`${label}: console error — ${text.slice(0, 200)}`);
  });
  page.on('pageerror', error => note(`${label}: uncaught — ${error.message.slice(0, 200)}`));
  page.on('requestfailed', request => {
    const url = request.url();
    if (!url.startsWith('http://127.0.0.1')) return;
    note(`${label}: request failed — ${url} ${request.failure()?.errorText || ''}`);
  });
  page.on('response', response => {
    const url = response.url();
    if (url.startsWith('http://127.0.0.1') && response.status() >= 400) {
      note(`${label}: HTTP ${response.status()} — ${url}`);
    }
  });
}

/** Keep the run offline and deterministic. */
async function blockOutbound(context) {
  await context.route('**://*/**', route => {
    const url = route.request().url();
    if (url.startsWith('http://127.0.0.1')) return route.continue();
    return route.abort();
  });
}

async function testMac(browser, base) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await blockOutbound(context);
  const page = await context.newPage();
  watch(page, 'mac');

  await page.goto(`${base}/mac/`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.Mac && window.MacSim, null, { timeout: 15000 });
  await page.evaluate(() => {
    MacSim.skipLogin();
    MacSim.setting('browser.liveWeb', false);
  });
  await page.waitForTimeout(800);

  /* `launch`-only apps (Launchpad) never create a window, so they are opened
     but not asserted on. Hidden apps are not in appList at all. */
  const ids = await page.evaluate(() => Mac.appList().map(a => a.id));
  const windowed = await page.evaluate(() => Mac.appList().filter(a => !Mac.apps[a.id].launch).map(a => a.id));
  console.log(`  mac: ${ids.length} apps (${windowed.length} windowed)`);

  for (const id of ids) {
    await page.evaluate(appId => Mac.wm.open(appId), id);
    await page.waitForTimeout(120);
    if (!windowed.includes(id)) continue;
    const filled = await page.evaluate(appId => {
      const win = Mac.wm.forApp(appId)[0];
      return Boolean(win && win.el.querySelector('.window-body')?.textContent.trim().length);
    }, id);
    if (!filled) note(`mac: ${id} mounted an empty window`);
  }

  /* Re-render everything under the other appearance — a second pass through
     every app.render with different state, for the price of one line. */
  await page.evaluate(() => { Mac.set('settings.appearance', 'dark'); Mac.wm.refreshAll(); });
  await page.waitForTimeout(900);
  await page.evaluate(() => { Mac.set('settings.appearance', 'light'); Mac.wm.refreshAll(); });
  await page.waitForTimeout(600);

  await context.close();
}

async function testIphone(browser, base) {
  const context = await browser.newContext({ viewport: { width: 900, height: 1000 } });
  await blockOutbound(context);
  const page = await context.newPage();
  watch(page, 'iphone');

  await page.goto(`${base}/iphone/`, { waitUntil: 'load' });
  /* `const Apps` is a top-level lexical declaration, so it never becomes a
     property of window — it has to be probed by bare reference. */
  await page.waitForFunction(
    () => typeof Apps !== 'undefined' && typeof openApp === 'function', null, { timeout: 15000 });
  await page.waitForTimeout(2600);          // boot animation
  await page.evaluate(() => unlock());
  await page.waitForTimeout(400);

  const ids = await page.evaluate(() => Object.keys(Apps));
  console.log(`  iphone: ${ids.length} apps`);

  /* Every registered app must have the shape openApp depends on. `glyph` is
     genuinely optional — maps and wallet draw their own — so it is not asserted. */
  const malformed = await page.evaluate(() => Object.entries(Apps)
    .filter(([id, def]) => def.id !== id || !def.name || typeof def.mount !== 'function')
    .map(([id]) => id));
  malformed.forEach(id => note(`iphone: ${id} is registered with a malformed definition`));

  for (const id of ids) {
    await page.evaluate(appId => { goHome(); openApp(appId); }, id);
    await page.waitForTimeout(160);
    const filled = await page.evaluate(appId => {
      const inst = openApps.get(appId);
      return Boolean(inst && inst.win.textContent.trim().length);
    }, id);
    if (!filled) note(`iphone: ${id} mounted an empty window`);
  }

  /* The layers that render outside any app. */
  await page.evaluate(() => { goHome(); openSpotlight(); });
  await page.waitForTimeout(300);
  await page.fill('#spotlight input', 'wifi');
  await page.waitForTimeout(300);
  const hits = await page.evaluate(() => document.querySelectorAll('#spotlight .sl-row').length);
  if (!hits) note('iphone: Spotlight returned nothing for "wifi"');
  await page.evaluate(() => { closeSpotlight(); openLibrary(); });
  await page.waitForTimeout(300);
  const folders = await page.evaluate(() => document.querySelectorAll('#applibrary .al-folder').length);
  if (!folders) note('iphone: the App Library rendered no folders');
  await page.evaluate(() => closeLibrary());

  /* A save written by an older build must not brick the boot. */
  await page.evaluate(() => {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ settings: { dark: 'yes' }, notes: 'not an array', badges: null }));
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(3000);
  const recovered = await page.evaluate(
    () => typeof Apps !== 'undefined' && Object.keys(Apps).length > 0 && Boolean(document.querySelector('#pages .app')));
  if (!recovered) note('iphone: a malformed save prevents the simulator from booting');

  await context.close();
}

/* Resolved through CJS so NODE_PATH and a globally installed playwright both
   work — this repo has no package.json and should not grow one just to test. */
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'));
} catch {
  console.error('smoke: playwright is not installed.\n'
    + '  npx --yes playwright@1.49.1 install --with-deps chromium\n'
    + '  NODE_PATH=<dir containing node_modules> node tools/smoke.mjs\n'
    + '  (or set PLAYWRIGHT_MODULE to the module path)');
  process.exit(2);
}

const supplied = value('base');
const hosted = supplied ? { base: supplied, server: null } : await serve();
console.log(`Smoke-testing ${hosted.base}`);

const launch = { headless: !flag('headed') };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
if (process.env.CI) launch.args = ['--no-sandbox'];

const browser = await chromium.launch(launch);
try {
  await testMac(browser, hosted.base);
  await testIphone(browser, hosted.base);
} finally {
  await browser.close();
  hosted.server?.close();
}

if (problems.length) {
  console.error(`\nFAILED — ${problems.length} problem(s):`);
  problems.forEach(p => console.error(`  * ${p}`));
  process.exit(1);
}
console.log('\nSmoke test passed: every app in both simulators mounted with no errors.');
