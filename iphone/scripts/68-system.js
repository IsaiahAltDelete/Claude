/* ===========================================================================
   Home-screen system layer: Spotlight search and the App Library.

   Both hang off the existing home screen rather than replacing it. renderHome
   is wrapped instead of rewritten, so the original paging, jiggle mode and
   badge logic all keep working and this file only adds to the result.
   =========================================================================== */

/* =========================================================== APP LIBRARY === */

/* Categories, in the order the App Library shows them. Any app not listed
   falls into "Other" so a newly defined app is never invisible. */
const LIBRARY_CATEGORIES = [
  ['Suggestions', ['safari', 'messages', 'phone', 'camera']],
  ['Productivity & Finance', ['mail', 'outlook', 'notes', 'reminders', 'calendar', 'files', 'wallet', 'stocks', 'freeform', 'calculator']],
  ['Social', ['messages', 'facetime', 'contacts', 'phone']],
  ['Creativity', ['camera', 'photos', 'voicememos', 'freeform']],
  ['Information & Reading', ['safari', 'books', 'podcasts', 'news', 'translate', 'weather', 'stocks']],
  ['Health & Fitness', ['health', 'fitness']],
  ['Travel', ['maps', 'compass', 'findmy', 'weather']],
  ['Entertainment', ['music', 'tv', 'podcasts', 'games']],
  ['Utilities', ['settings', 'clock', 'calculator', 'compass', 'translate', 'home', 'appstore', 'voicememos']],
];

/** Every registered app id, in home-screen order then alphabetical. */
function allAppIds() {
  const ordered = [...PAGE1, ...DOCK, ...State.installed];
  const rest = Object.keys(Apps).filter(id => !ordered.includes(id)).sort((a, b) => Apps[a].name.localeCompare(Apps[b].name));
  return [...new Set([...ordered, ...rest])].filter(id => Apps[id]);
}

/** Category buckets for the library, with an Other bucket for the leftovers. */
function libraryBuckets() {
  const ids = allAppIds();
  const used = new Set();
  const buckets = LIBRARY_CATEGORIES.map(([name, wanted]) => {
    const members = wanted.filter(id => ids.includes(id));
    members.forEach(id => { if (name !== 'Suggestions' && name !== 'Social') used.add(id); });
    return { name, members };
  }).filter(bucket => bucket.members.length);
  const other = ids.filter(id => !used.has(id));
  if (other.length) buckets.push({ name: 'Other', members: other });
  return buckets;
}

/**
 * A folder tile: up to four tappable icons, or three plus a mini grid standing
 * in for the rest. Tapping an icon opens that app; tapping anywhere else opens
 * the folder.
 */
function libraryFolder(bucket) {
  const tile = el('div', 'al-folder');
  const box = el('div', 'al-folder-box');
  bucket.members.slice(0, 4).forEach((id, index) => {
    if (index === 3 && bucket.members.length > 4) {
      const mini = el('div', 'al-mini');
      bucket.members.slice(3, 7).forEach(extra => {
        const dot = el('div');
        dot.innerHTML = appIconHTML(Apps[extra], 15);
        mini.appendChild(dot);
      });
      box.appendChild(mini);
      return;
    }
    const slot = el('div', 'al-slot');
    slot.innerHTML = appIconHTML(Apps[id], 34);
    slot.title = Apps[id].name;
    slot.onclick = event => { event.stopPropagation(); closeLibrary(); openApp(id); };
    box.appendChild(slot);
  });
  tile.appendChild(box);
  const label = el('div', 'al-folder-name');
  label.textContent = bucket.name;
  tile.appendChild(label);
  tile.onclick = () => openLibraryFolder(bucket);
  return tile;
}

/* Same stacking rule as Spotlight — see spotlightLayer() for the ladder. */
function libraryLayer() {
  let layer = $('#applibrary');
  if (layer) return layer;
  layer = el('div');
  layer.id = 'applibrary';
  $('#screen').appendChild(layer);
  layer.addEventListener('pointerdown', event => { if (event.target === layer) closeLibrary(); });
  return layer;
}

function openLibrary() {
  closeSpotlight();
  const layer = libraryLayer();
  layer.classList.add('on');
  layer.innerHTML = '';
  layer.scrollTop = 0;
  $('#home').classList.add('blurred');

  const search = el('button', 'al-search');
  search.innerHTML = `${SF.magnifier}<span>App Library</span>`;
  search.onclick = () => { closeLibrary(); openSpotlight(); };
  layer.appendChild(search);

  const grid = el('div', 'al-grid');
  libraryBuckets().forEach(bucket => grid.appendChild(libraryFolder(bucket)));
  layer.appendChild(grid);

  const close = el('button', 'al-close', 'Close');
  close.onclick = closeLibrary;
  layer.appendChild(close);
}

function closeLibrary() {
  const layer = $('#applibrary');
  if (!layer || !layer.classList.contains('on')) return;
  layer.classList.remove('on');
  if (!currentApp) $('#home').classList.remove('blurred');
  setTimeout(() => { if (!layer.classList.contains('on')) layer.innerHTML = ''; }, 240);
}

function openLibraryFolder(bucket) {
  sheet(box => {
    box.appendChild(h(`<div style="font-size:22px;font-weight:700;margin-bottom:14px">${esc(bucket.name)}</div>`));
    const grid = el('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(4,1fr);gap:18px 10px;max-height:52vh;overflow-y:auto';
    bucket.members.forEach(id => {
      const tile = el('div');
      tile.style.cssText = 'text-align:center;cursor:pointer';
      tile.innerHTML = `${appIconHTML(Apps[id], 54)}
        <div style="font-size:11px;color:var(--txt);margin-top:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(Apps[id].name)}</div>`;
      tile.onclick = () => { closeOverlay(); closeLibrary(); openApp(id); };
      grid.appendChild(tile);
    });
    box.appendChild(grid);
  });
}

/* ============================================================= SPOTLIGHT === */

/**
 * Collect matches from every searchable source. Each source is guarded, so a
 * missing module simply contributes nothing instead of breaking the search.
 */
function spotlightResults(query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const groups = [];
  const push = (title, rows) => { if (rows.length) groups.push({ title, rows: rows.slice(0, 5) }); };
  const safe = fn => { try { return fn() || []; } catch (error) { return []; } };

  /* Names carry punctuation the typist will not ("Wi-Fi", "Find My"), so app
     and settings names are matched with punctuation and spacing removed too. */
  const loose = text => String(text).toLowerCase().replace(/[^a-z0-9]/g, '');
  const looseNeedle = loose(needle);
  const hits = (text, ...extra) => {
    const haystack = [text, ...extra].join(' ').toLowerCase();
    return haystack.includes(needle) || (looseNeedle.length > 1 && loose(haystack).includes(looseNeedle));
  };

  /* Applications */
  push('Applications', allAppIds()
    .filter(id => hits(Apps[id].name))
    .map(id => ({
      iconHTML: appIconHTML(Apps[id], 38),
      label: Apps[id].name,
      sub: 'Application',
      onClick: () => openApp(id),
    })));

  /* Settings */
  push('Settings', safe(() => SETTINGS_INDEX
    .filter(entry => hits(entry.k, entry.p))
    .map(entry => ({
      icon: rowGlyph(entry.i),
      iconBg: entry.c,
      label: entry.k,
      sub: entry.p,
      onClick: () => {
        openApp('settings');
        const inst = openApps.get('settings');
        if (inst && inst.nav) { inst.nav.popToRoot(); entry.go(inst.nav); }
      },
    }))));

  /* Contacts */
  push('Contacts', safe(() => CON().people
    .filter(person => personName(person).toLowerCase().includes(needle) || (person.org || '').toLowerCase().includes(needle))
    .map(person => ({
      icon: SF.person,
      iconBg: '#8e8e93',
      label: personName(person),
      sub: person.org || person.phone || '',
      onClick: () => openApp('contacts'),
    }))));

  /* Notes */
  push('Notes', safe(() => NT().items
    .filter(note => note.body.toLowerCase().includes(needle))
    .map(note => ({
      icon: SF.note,
      iconBg: '#ffd60a',
      label: noteTitle(note),
      sub: notePreview(note).slice(0, 48),
      onClick: () => openApp('notes'),
    }))));

  /* Reminders */
  push('Reminders', safe(() => REM().items
    .filter(item => item.text.toLowerCase().includes(needle))
    .map(item => {
      const list = REM().lists.find(entry => entry.id === item.list);
      return {
        icon: SF.star,
        iconBg: (list && list.colour) || '#0a84ff',
        label: item.text,
        sub: `${(list && list.name) || 'Reminders'}${item.done ? ' · completed' : ''}`,
        onClick: () => openApp('reminders'),
      };
    })));

  /* Calendar */
  push('Events', safe(() => visibleEvents()
    .filter(event => `${event.title} ${event.place || ''}`.toLowerCase().includes(needle))
    .sort((a, b) => a.at - b.at)
    .map(event => ({
      icon: SF.clockGlyph,
      iconBg: (CALENDARS.find(calendar => calendar.id === event.cal) || {}).colour || '#ff453a',
      label: event.title,
      sub: `${relativeDay(event.at)} · ${timeStr(new Date(event.at))}`,
      onClick: () => openApp('calendar'),
    }))));

  /* Mail */
  push('Mail', safe(() => allMessages()
    .filter(message => message.box !== 'trash'
      && `${message.from.n} ${message.from.e} ${message.subject} ${message.body}`.toLowerCase().includes(needle))
    .map(message => ({
      icon: SF.envelope,
      iconBg: '#0a84ff',
      label: message.subject || '(No Subject)',
      sub: `${message.from.n} · ${relativeDay(message.date)}`,
      onClick: () => openApp('mail'),
    }))));

  /* Messages — threads are [direction, text, unread] tuples. */
  push('Messages', safe(() => MSG()
    .filter(thread => `${thread.n} ${(thread.msgs || []).map(entry => entry[1]).join(' ')}`.toLowerCase().includes(needle))
    .map(thread => ({
      icon: SF.msgGlyph,
      iconBg: '#30d158',
      label: thread.n,
      sub: ((thread.msgs || []).slice(-1)[0] || [])[1] || '',
      onClick: () => openApp('messages'),
    }))));

  /* Stocks and Weather are catalogue lookups rather than stored data. */
  push('Stocks', safe(() => STOCK_LIST
    .filter(([symbol, name]) => `${symbol} ${name}`.toLowerCase().includes(needle))
    .map(([symbol, name]) => ({
      icon: SF.sparkles,
      iconBg: '#30d158',
      label: symbol,
      sub: name,
      onClick: () => openApp('stocks'),
    }))));

  push('Weather', safe(() => WX_CITIES
    .filter(([name, region]) => `${name} ${region}`.toLowerCase().includes(needle))
    .map(([name, region]) => ({
      icon: SF.sun,
      iconBg: '#0a84ff',
      label: name,
      sub: region,
      onClick: () => {
        const state = WX();
        if (!state.cities.includes(name)) state.cities.push(name);
        state.page = state.cities.indexOf(name);
        save();
        openApp('weather');
        const inst = openApps.get('weather');
        if (inst && inst.render) inst.render();
      },
    }))));

  /* Always offer the web, the way Spotlight does. */
  groups.push({
    title: 'Siri Suggested Website',
    rows: [{
      icon: SF.globe,
      iconBg: '#8e8e93',
      label: `Search the web for “${query.trim()}”`,
      sub: State.settings.searchEngine || 'Google',
      onClick: () => openApp('safari'),
    }],
  });

  return groups;
}

/* Search history, so the idle screen has something useful on it. */
function spotlightRecents() {
  return slice('spotlight', () => ({ recents: [] })).recents;
}

function rememberSearch(query) {
  const text = query.trim();
  if (text.length < 2) return;
  const state = slice('spotlight', () => ({ recents: [] }));
  state.recents = [text, ...state.recents.filter(entry => entry.toLowerCase() !== text.toLowerCase())].slice(0, 6);
  save();
}

/*
 * The layer sits at z-index 320: above the home screen (100) and any open app
 * (200), below the lock screen (350), the home indicator (600/610), Control
 * Centre (650) and sheets (700). Getting this wrong is what made the first
 * version render underneath the app icons.
 */
function spotlightLayer() {
  let layer = $('#spotlight');
  if (layer) return layer;
  layer = el('div');
  layer.id = 'spotlight';
  $('#screen').appendChild(layer);
  layer.addEventListener('pointerdown', event => { if (event.target === layer) closeSpotlight(); });
  return layer;
}

/** One result row, shared by the top hit and every section. */
function spotlightRow(row, { compact = false } = {}) {
  const item = el('div', 'sl-row');
  const size = compact ? 30 : 38;
  const iconHTML = row.iconHTML
    || `<div class="sl-ic" style="background:${row.iconBg || '#8e8e93'};width:${size}px;height:${size}px">${row.icon || ''}</div>`;
  item.innerHTML = `<div class="sl-icwrap">${iconHTML}</div>
    <div class="sl-text">
      <div class="sl-label">${esc(row.label)}</div>
      ${row.sub ? `<div class="sl-sub">${esc(row.sub)}</div>` : ''}
    </div>
    <div class="sl-chev">${SVG.chev}</div>`;
  item.onclick = () => { closeSpotlight(); row.onClick(); };
  return item;
}

function openSpotlight() {
  closeLibrary();
  const layer = spotlightLayer();
  layer.classList.add('on');
  layer.innerHTML = '';

  /* The wallpaper and icons blur behind Spotlight, the way they do on a phone.
     #home already has the exact effect as .blurred, so it is reused. */
  const home = $('#home');
  const wasBlurred = home.classList.contains('blurred');
  home.classList.add('blurred');
  layer.dataset.restoreBlur = wasBlurred ? '1' : '';

  const head = el('div', 'sl-head');
  const field = el('div', 'sl-field');
  field.innerHTML = `<span class="sl-mag">${SF.magnifier}</span>`;
  const input = el('input');
  input.placeholder = 'Search';
  input.autocapitalize = 'off';
  input.autocomplete = 'off';
  input.spellcheck = false;
  field.appendChild(input);
  const clear = el('button', 'sl-clear', '✕');
  clear.title = 'Clear';
  clear.onclick = () => { input.value = ''; render(); input.focus(); };
  field.appendChild(clear);
  const cancel = el('button', 'sl-cancel', 'Cancel');
  cancel.onclick = closeSpotlight;
  head.append(field, cancel);
  layer.appendChild(head);

  const body = el('div', 'sl-body');
  layer.appendChild(body);

  /** Tiles used for Siri Suggestions and the app section. */
  const appTileFor = id => {
    const tile = el('div', 'sl-tile');
    tile.innerHTML = `${appIconHTML(Apps[id], 54)}<div class="sl-tile-name">${esc(Apps[id].name)}</div>`;
    tile.onclick = () => { closeSpotlight(); openApp(id); };
    return tile;
  };

  function renderIdle() {
    /* Recently used apps read better as suggestions than a fixed list, so the
       switcher order is used when there is one. */
    const recentApps = [...openApps.keys()].reverse().filter(id => Apps[id]);
    const suggestions = [...new Set([...recentApps, ...allAppIds()])].slice(0, 8);

    body.appendChild(h('<div class="sl-head-label">Siri Suggestions</div>'));
    const grid = el('div', 'sl-tiles');
    suggestions.forEach(id => grid.appendChild(appTileFor(id)));
    body.appendChild(grid);

    const recents = spotlightRecents();
    if (recents.length) {
      const label = el('div', 'sl-head-label');
      label.textContent = 'Recent Searches';
      const clearAll = el('button', 'sl-clearall', 'Clear');
      clearAll.onclick = () => { slice('spotlight', () => ({ recents: [] })).recents = []; save(); render(); };
      label.appendChild(clearAll);
      body.appendChild(label);
      const list = el('div', 'sl-card');
      recents.forEach(text => {
        /* A recent search re-runs the query rather than closing Spotlight, so
           its own onClick replaces the one spotlightRow installs. */
        const row = spotlightRow({ icon: SF.history, iconBg: '#48484a', label: text, onClick: () => {} },
          { compact: true });
        row.onclick = () => { input.value = text; render(); input.focus(); };
        list.appendChild(row);
      });
      body.appendChild(list);
    }

    /* A few things worth doing straight from search. */
    body.appendChild(h('<div class="sl-head-label">Shortcuts</div>'));
    const shortcuts = el('div', 'sl-card');
    [
      { icon: SF.camera, iconBg: '#3a3a3c', label: 'Take a Photo', sub: 'Camera', onClick: () => openApp('camera') },
      { icon: SF.compose, iconBg: '#ffd60a', label: 'New Note', sub: 'Notes', onClick: () => {
        const note = { id: Date.now(), folder: 'notes', body: '', at: Date.now() };
        NT().items.unshift(note);
        save();
        openApp('notes');
        const inst = openApps.get('notes');
        if (inst && inst.nav) { inst.nav.popToRoot(); inst.nav.push(noteEditorView(note)); }
      } },
      { icon: SF.grid, iconBg: '#0a84ff', label: 'App Library', sub: `${allAppIds().length} apps`, onClick: () => openLibrary() },
      { icon: SF.wifi, iconBg: '#0a84ff', label: 'Wi-Fi Settings', sub: State.settings.wifiName || 'Not connected', onClick: () => {
        openApp('settings');
        const inst = openApps.get('settings');
        if (inst && inst.nav) { inst.nav.popToRoot(); inst.nav.push(wifiView()); }
      } },
    ].forEach(row => shortcuts.appendChild(spotlightRow(row, { compact: true })));
    body.appendChild(shortcuts);

    body.appendChild(h(`<div class="sl-note">Searches apps, settings, contacts, notes, reminders, events, mail,
      messages, tickers and cities — all on device.</div>`));
  }

  function renderResults(query) {
    const groups = spotlightResults(query);
    /* The web fallback is always last and always present, so "only that one"
       means nothing on the phone matched. */
    const onDevice = groups.filter(group2 => group2.title !== 'Siri Suggested Website');

    if (!onDevice.length) {
      body.appendChild(h(`<div class="sl-empty">
        <div class="sl-empty-glyph">${SF.magnifier}</div>
        <div class="sl-empty-title">No Results</div>
        <div class="sl-empty-sub">Nothing on this iPhone matches “${esc(query.trim())}”.</div></div>`));
    } else {
      /* Top Hit, the way Spotlight leads with its best guess. */
      const top = onDevice[0].rows[0];
      body.appendChild(h('<div class="sl-head-label">Top Hit</div>'));
      const hit = el('div', 'sl-card sl-tophit');
      hit.appendChild(spotlightRow(top));
      body.appendChild(hit);
    }

    groups.forEach((group2, index) => {
      const rows = index === 0 && onDevice.length ? group2.rows.slice(1) : group2.rows;
      if (!rows.length) return;
      const label = el('div', 'sl-head-label');
      label.textContent = group2.title;
      body.appendChild(label);

      /* Applications read better as a row of icons than as a list. */
      if (group2.title === 'Applications') {
        const grid = el('div', 'sl-tiles');
        rows.forEach(row => {
          const id = allAppIds().find(appId => Apps[appId].name === row.label);
          grid.appendChild(id ? appTileFor(id) : spotlightRow(row));
        });
        body.appendChild(grid);
        return;
      }

      const card = el('div', 'sl-card');
      rows.forEach(row => card.appendChild(spotlightRow(row)));
      body.appendChild(card);
    });
  }

  const render = () => {
    body.innerHTML = '';
    body.scrollTop = 0;
    const query = input.value;
    layer.classList.toggle('searching', Boolean(query.trim()));
    if (query.trim()) renderResults(query);
    else renderIdle();
  };

  input.oninput = render;
  input.onkeydown = event => {
    if (event.key === 'Escape') { closeSpotlight(); return; }
    if (event.key !== 'Enter') return;
    const query = input.value.trim();
    if (!query) return;
    rememberSearch(query);
    const first = spotlightResults(query)[0];
    if (first) { closeSpotlight(); first.rows[0].onClick(); }
  };
  /* Anything actually opened from a search is worth remembering too. */
  body.addEventListener('click', () => rememberSearch(input.value), true);

  render();
  setTimeout(() => input.focus(), 140);
}

function closeSpotlight() {
  const layer = $('#spotlight');
  if (!layer || !layer.classList.contains('on')) return;
  layer.classList.remove('on', 'searching');
  if (!layer.dataset.restoreBlur) $('#home').classList.remove('blurred');
  /* Emptied after the fade so the contents do not vanish mid-transition. */
  setTimeout(() => { if (!layer.classList.contains('on')) layer.innerHTML = ''; }, 240);
}

/* ================================================ wiring into the home UI === */

/*
 * The original renderHome is kept and wrapped: it still builds the pages, the
 * dots and the dock, and this adds the App Library page, the extra dot and the
 * Search pill on top of the result.
 */
const baseRenderHome = renderHome;
renderHome = function renderHomeWithLibrary() {
  baseRenderHome();

  const pagesEl = $('#pages');
  if (!pagesEl) return;

  /* An App Library page at the end, so swiping past the last page reaches it. */
  const page = el('div', 'page');
  page.id = 'libraryPage';
  page.style.cssText = 'display:flex;flex-direction:column;justify-content:flex-start;padding-top:8px';
  const grid = el('div');
  grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:18px 14px;padding:6px 6px 0';
  libraryBuckets().slice(0, 6).forEach(bucket => grid.appendChild(libraryFolder(bucket)));
  page.appendChild(grid);
  const all = el('button', '', 'Show all app categories');
  all.style.cssText = 'color:#fff;opacity:.8;font-size:13px;padding:14px 0 0;margin:0 auto';
  all.onclick = openLibrary;
  page.appendChild(all);
  pagesEl.appendChild(page);

  const dots = $('#dots');
  if (dots) {
    const dot = el('div', 'dot');
    dot.style.cssText = 'width:auto;height:auto;background:none;display:grid;place-items:center;opacity:.8';
    dot.innerHTML = `<svg viewBox="0 0 24 24" style="width:13px;height:13px;fill:#fff">
      <circle cx="7" cy="7" r="2.6"/><circle cx="17" cy="7" r="2.6"/><circle cx="7" cy="17" r="2.6"/><circle cx="17" cy="17" r="2.6"/></svg>`;
    dots.appendChild(dot);
  }

  /* The Search pill is a flex item between the page dots and the dock, not an
     absolutely positioned overlay — as an overlay it landed on top of the
     dots. #home is a flex column, so inserting before #dock is enough. */
  const home = $('#home');
  const dock = $('#dock');
  if (home && dock && !$('#searchPill')) {
    const pill = el('button');
    pill.id = 'searchPill';
    pill.innerHTML = `<span class="sp-ic">${SF.magnifier}</span><span>Search</span>`;
    pill.onclick = event => { event.stopPropagation(); openSpotlight(); };
    home.insertBefore(pill, dock);
  }
};

/* Swipe down anywhere on the home pages opens Spotlight, as on a real phone. */
(function spotlightGesture() {
  const pagesEl = $('#pages');
  if (!pagesEl) return;
  let startY = 0;
  let startX = 0;
  let tracking = false;
  pagesEl.addEventListener('pointerdown', event => {
    startY = event.clientY;
    startX = event.clientX;
    tracking = true;
  });
  pagesEl.addEventListener('pointerup', event => {
    if (!tracking) return;
    tracking = false;
    if (locked || currentApp) return;
    if ($('#home').classList.contains('jiggle')) return;
    if (event.clientY - startY > 58 && Math.abs(event.clientX - startX) < 70) openSpotlight();
  });
  pagesEl.addEventListener('pointercancel', () => { tracking = false; });
}());

/* Escape closes the topmost extra layer before the built-in handler can read
   it as "go home", which is why this listener captures. */
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  const spotlight = $('#spotlight');
  const library = $('#applibrary');
  if (spotlight && spotlight.classList.contains('on')) { closeSpotlight(); event.stopPropagation(); }
  else if (library && library.classList.contains('on')) { closeLibrary(); event.stopPropagation(); }
}, true);

const baseGoHome = goHome;
goHome = function goHomeClosingLayers() {
  closeSpotlight();
  closeLibrary();
  baseGoHome();
};

/* Opening an app from anywhere must clear the layers too, or Spotlight would
   stay blurred over the top of whatever was launched. */
const baseOpenApp = openApp;
openApp = function openAppClosingLayers(id, origin) {
  closeSpotlight();
  closeLibrary();
  baseOpenApp(id, origin);
};
