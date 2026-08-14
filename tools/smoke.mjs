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

/* A fixture shaped like the markup the Wikipedia parse API returns, plus the
   things a hostile or merely awkward page would include. Kept here rather
   than fetched so the assertions below are deterministic and run offline. */
const WIKI_FIXTURE = `
  <div class="mw-parser-output">
    <p>Intro with an <a href="/wiki/Internal_Link">internal link</a>
       and a <a href="/wiki/Other#Section_Two">deep link</a>.</p>
    <div class="mw-heading mw-heading2"><h2 id="History">History</h2></div>
    <p>History text.</p>
    <div class="mw-heading mw-heading2"><h2 id="See also">See also</h2></div>
    <ul><li><a href="#History">Back to History</a></li>
        <li><a href="#See also">See also</a></li></ul>
    <script>window.__sanitizerEscaped = 'script';</script>
    <iframe src="https://evil.example"></iframe>
    <object data="https://evil.example"></object>
    <a href="javascript:void(window.__sanitizerEscaped='href')">click</a>
    <p onclick="window.__sanitizerEscaped='handler'">handler</p>
    <img src="//upload.wikimedia.org/x.png" width="900" height="700">
    <img src="http://insecure.example/x.png">
    <div id="settings">an id that would collide with the simulator</div>
  </div>`;

/**
 * Assertions for Mac.Web.sanitize.
 *
 * Worth pinning down precisely: it is the only place in either simulator
 * that renders markup fetched from the open internet into the same document
 * as the app itself. Both halves matter — nothing executable may survive,
 * and enough must survive that articles are still navigable.
 */
async function testSanitizer(page) {
  const result = await page.evaluate(fixture => {
    const html = Mac.Web.sanitize(fixture, { lang: 'en', project: 'wikipedia', title: 'Test' });
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const anchors = [...doc.querySelectorAll('[data-web-anchor]')];
    return {
      escaped: window.__sanitizerEscaped || null,
      scripts: doc.querySelectorAll('script, iframe, object, embed, style, link').length,
      handlers: [...doc.querySelectorAll('*')].filter(node =>
        [...node.attributes].some(attribute => attribute.name.toLowerCase().startsWith('on'))).length,
      jsHrefs: [...doc.querySelectorAll('[href]')].filter(node =>
        /^\s*javascript:/i.test(node.getAttribute('href'))).length,
      rawIds: [...doc.querySelectorAll('[id]')].map(node => node.id).filter(id => !id.startsWith('wiki-anchor-')),
      unresolvedAnchors: anchors.filter(link =>
        !doc.querySelector(`[id="${CSS.escape(link.dataset.webAnchor)}"]`)).map(link => link.dataset.webAnchor),
      anchorCount: anchors.length,
      insecureImages: [...doc.querySelectorAll('img')].filter(node =>
        !/^https:\/\//i.test(node.getAttribute('src') || '')).length,
      keptFragment: [...doc.querySelectorAll('a[data-command="browse"]')]
        .some(node => node.dataset.arg.includes('#Section_Two')),
      headings: doc.querySelectorAll('h2').length,
    };
  }, WIKI_FIXTURE);

  if (result.escaped) note(`mac sanitize: executable content survived (${result.escaped})`);
  if (result.scripts) note(`mac sanitize: ${result.scripts} script/iframe/style element(s) survived`);
  if (result.handlers) note(`mac sanitize: ${result.handlers} inline event handler(s) survived`);
  if (result.jsHrefs) note(`mac sanitize: ${result.jsHrefs} javascript: href(s) survived`);
  if (result.rawIds.length) note(`mac sanitize: un-namespaced id(s) leaked into the app document: ${result.rawIds.join(', ')}`);
  if (result.anchorCount < 2) note('mac sanitize: in-page section links were dropped');
  if (result.unresolvedAnchors.length) note(`mac sanitize: section link(s) point at nothing: ${result.unresolvedAnchors.join(', ')}`);
  if (result.insecureImages) note(`mac sanitize: ${result.insecureImages} non-https image(s) survived`);
  if (!result.keptFragment) note('mac sanitize: a link to another article lost its #section fragment');
  if (!result.headings) note('mac sanitize: headings were stripped, so articles have no structure');
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

  await testSanitizer(page);
  await testScenarios(page);

  await context.close();
}

/**
 * Every scenario must set up and evaluate cleanly.
 *
 * A scenario's `setup` and its `done()` predicates read state from all over
 * the simulator — Wi-Fi, the file system, browser history, the account — so
 * they are exactly the thing that rots quietly when one of those shapes
 * changes. A scenario that throws in `done()` is silently treated as
 * unfinished, which reads to the trainee as a goal they cannot complete.
 */
async function testScenarios(page) {
  const results = await page.evaluate(() => {
    const out = [];
    for (const scenario of Mac.Scenarios.all) {
      const record = { id: scenario.id, checks: scenario.checks.length, errors: [] };
      if (!scenario.title || !scenario.brief) record.errors.push('missing title or brief');
      if (!scenario.checks.length) record.errors.push('has no goals');
      if (!scenario.hints?.length) record.errors.push('has no hints');
      try {
        Mac.Scenarios.start(scenario.id);
        Mac.Dialog.close();
      } catch (error) { record.errors.push(`setup threw: ${error.message}`); }
      scenario.checks.forEach(check => {
        try { check.done(); } catch (error) { record.errors.push(`${check.id}.done() threw: ${error.message}`); }
        if (!check.label) record.errors.push(`${check.id} has no label`);
      });
      /* The fault has to actually be present: a scenario whose goals are all
         satisfied the moment it starts is not a scenario. */
      const met = Mac.state.scenario.done.length;
      if (met === scenario.checks.length) record.errors.push('every goal was already met at setup');
      out.push(record);
    }
    Mac.Scenarios.stop();
    return out;
  });

  results.forEach(result => {
    result.errors.forEach(problem => note(`mac scenario ${result.id}: ${problem}`));
  });
  console.log(`  mac: ${results.length} scenarios, ${results.reduce((n, r) => n + r.checks, 0)} goals`);
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
  /* finishUnlock rather than unlock: unlock runs Face ID on a timer, and this
     suite is not testing the lock screen — testLockScreen is. */
  await page.evaluate(() => finishUnlock());
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

  await testKeyboardAccess(page);

  await context.close();
}

/**
 * Nothing tappable may be tappable *only*.
 *
 * Almost every control on the phone is a div with an onclick, which is fine
 * for a finger and reaches nobody using a keyboard or a screen reader. A
 * container whose own click merely forwards to a focusable child (a Settings
 * row wrapping a switch) is allowed — the child is the control. Anything
 * else is a dead end, so it fails here.
 */
async function testKeyboardAccess(page) {
  const surfaces = [
    ['home screen', () => { goHome(); }],
    ['settings', () => { goHome(); openApp('settings'); }],
    ['control centre', () => { goHome(); document.querySelector('#cc').classList.add('on'); renderCC(); }],
    ['lock screen', () => { document.querySelector('#cc').classList.remove('on'); lockPhone(); }],
  ];

  for (const [label, setup] of surfaces) {
    await page.evaluate(`(${setup.toString()})()`);
    await page.waitForTimeout(320);
    const orphans = await page.evaluate(() => [...document.querySelector('#screen').querySelectorAll('div')]
      .filter(node => typeof node.onclick === 'function')
      .filter(node => !node.hasAttribute('role') && node.tabIndex < 0)
      .filter(node => !node.querySelector('[tabindex="0"],button,input,select,textarea,[role]'))
      .map(node => `${node.className || '(no class)'}: ${node.textContent.trim().slice(0, 32)}`)
      .slice(0, 8));
    orphans.forEach(item => note(`iphone ${label}: click-only, unreachable by keyboard — ${item}`));
  }

  /* The focus trap, which is what makes a modal usable rather than a place
     Tab escapes from immediately. */
  const modal = await page.evaluate(async () => {
    goHome();
    await new Promise(resolve => setTimeout(resolve, 300));
    const tile = document.querySelector('#pages .app[data-app="settings"]');
    tile.focus();
    const origin = document.activeElement === tile;
    alertBox({ title: 'Focus check', message: 'body', buttons: [{ text: 'Cancel' }, { text: 'OK' }] });
    await new Promise(resolve => setTimeout(resolve, 140));
    const inside = document.querySelector('#overlay').contains(document.activeElement);
    closeOverlay();
    await new Promise(resolve => setTimeout(resolve, 80));
    return { origin, inside, restored: document.activeElement === tile };
  });
  if (!modal.origin) note('iphone: a home-screen icon cannot take focus');
  if (!modal.inside) note('iphone: opening an alert does not move focus into it');
  if (!modal.restored) note('iphone: closing an alert does not restore focus to where it came from');

  /* Every text token has to clear WCAG AA against the surface it lands on. */
  const contrast = await page.evaluate(() => {
    const linear = value => { const c = value / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    const luminance = ([r, g, b]) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
    /* The tokens are authored as both `#fff` and `rgba(...)`, so both forms
       have to parse — a hex value returns no numbers to a naive match. */
    const parse = value => {
      const text = value.trim();
      const hex = text.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
      if (hex) {
        const digits = hex[1].length === 3 ? [...hex[1]].map(d => d + d) : hex[1].match(/../g);
        return digits.map(pair => parseInt(pair, 16));
      }
      return (text.match(/[\d.]+/g) || [0, 0, 0]).map(Number);
    };
    const ratio = (token, background) => {
      const parts = parse(token);
      const alpha = parts.length > 3 ? parts[3] : 1;
      const composed = [0, 1, 2].map(i => background[i] + (parts[i] - background[i]) * alpha);
      const [high, low] = [luminance(composed), luminance(background)].sort((a, b) => b - a);
      return (high + 0.05) / (low + 0.05);
    };
    const style = getComputedStyle(document.documentElement);
    const surfaces = { black: [0, 0, 0], group: [28, 28, 30], raised: [44, 44, 46] };
    const out = {};
    ['--txt', '--txt2', '--txt3'].forEach(name => {
      out[name] = Math.min(...Object.values(surfaces).map(bg => ratio(style.getPropertyValue(name), bg)));
    });
    return out;
  });
  Object.entries(contrast).forEach(([token, value]) => {
    if (value < 4.5) note(`iphone: ${token} measures ${value.toFixed(2)}:1, under the 4.5:1 body text needs`);
  });
}

/**
 * Boot each simulator against a save it did not write.
 *
 * Both of these ship as a single HTML page in a browser, so the state on
 * disk outlives every deploy: whatever is in localStorage when a new build
 * lands is what the new build has to open. A save from two versions ago, or
 * one that has been hand-edited, must degrade to defaults rather than throw
 * during boot — and a boot-time throw is the worst case here, because both
 * overlays are visible at parse time and a dead splash screen has no way out
 * that does not involve devtools.
 */
async function testStaleSaves(browser, base) {
  const cases = [
    {
      label: 'iphone: malformed types',
      path: 'iphone', key: 'iphone-sim-v4',
      save: { settings: { dark: 'yes', ringer: 'loud' }, notes: 'not an array', badges: null, wf: null },
    },
    {
      label: 'iphone: an older build with none of the newer keys',
      path: 'iphone', key: 'iphone-sim-v4',
      save: { settings: { dark: true, wifi: true, wifiName: 'SABLEWAVE-5G' }, installed: [], badges: {} },
    },
    {
      label: 'iphone: unknown keys from a future build',
      path: 'iphone', key: 'iphone-sim-v4',
      save: { settings: { dark: true, somethingNew: { nested: true } }, unknownSlice: [1, 2, 3] },
    },
    {
      label: 'mac: a previous schema',
      path: 'mac', key: 'macos-tahoe-simulator-v9',
      save: { schema: 3, settings: { appearance: 'dark' }, fs: [], volumes: [] },
    },
    {
      label: 'mac: current schema, corrupted contents',
      path: 'mac', key: 'macos-tahoe-simulator-v9',
      save: { schema: 10, settings: null, fs: 'not an array', wifi: { enabled: 'yes' }, volumes: null },
    },
    {
      label: 'mac: not JSON at all',
      path: 'mac', key: 'macos-tahoe-simulator-v9', raw: 'this is not json {{{',
    },
  ];

  for (const testCase of cases) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await blockOutbound(context);
    const page = await context.newPage();
    watch(page, testCase.label);
    /* Seeded before any script runs, so load() genuinely reads it. */
    await context.addInitScript(([key, value]) => {
      try { localStorage.setItem(key, value); } catch { /* blocked */ }
    }, [testCase.key, testCase.raw ?? JSON.stringify(testCase.save)]);

    await page.goto(`${base}/${testCase.path}/`, { waitUntil: 'load' });
    await page.waitForTimeout(testCase.path === 'mac' ? 2600 : 3400);

    const alive = testCase.path === 'mac'
      ? await page.evaluate(() => Boolean(window.Mac?.state?.settings) && Mac.appList().length > 0)
      : await page.evaluate(() => typeof Apps !== 'undefined' && Object.keys(Apps).length > 0
          && Boolean(document.querySelector('#pages .app')));
    if (!alive) note(`${testCase.label}: the simulator did not come up`);

    await context.close();
  }
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
  await testStaleSaves(browser, hosted.base);
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
