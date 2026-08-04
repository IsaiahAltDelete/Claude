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

/** A folder tile: up to four full icons, or three plus a mini grid. */
function libraryFolder(bucket) {
  const tile = el('div');
  tile.style.cssText = 'cursor:pointer;text-align:center';
  const box = el('div');
  box.style.cssText = `display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:8px;border-radius:22px;
    background:rgba(120,120,128,.26);backdrop-filter:blur(20px);aspect-ratio:1`;
  const shown = bucket.members.slice(0, 4);
  shown.forEach((id, index) => {
    if (index === 3 && bucket.members.length > 4) {
      const mini = el('div');
      mini.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:2px';
      bucket.members.slice(3, 7).forEach(extra => {
        const dot = el('div');
        dot.style.cssText = 'border-radius:4px;overflow:hidden';
        dot.innerHTML = appIconHTML(Apps[extra], 15);
        mini.appendChild(dot);
      });
      box.appendChild(mini);
      return;
    }
    const slot = el('div');
    slot.innerHTML = appIconHTML(Apps[id], 34);
    slot.style.cssText = 'display:grid;place-items:center';
    slot.onclick = event => { event.stopPropagation(); closeLibrary(); openApp(id); };
    box.appendChild(slot);
  });
  tile.appendChild(box);
  tile.appendChild(h(`<div style="font-size:11px;color:#fff;margin-top:6px;text-shadow:0 1px 3px rgba(0,0,0,.6)">${esc(bucket.name)}</div>`));
  tile.onclick = () => openLibraryFolder(bucket);
  return tile;
}

function libraryLayer() {
  let layer = $('#applibrary');
  if (layer) return layer;
  layer = el('div');
  layer.id = 'applibrary';
  layer.style.cssText = `position:absolute;inset:0;z-index:42;display:none;flex-direction:column;
    background:rgba(20,20,22,.62);backdrop-filter:blur(34px) saturate(160%);padding:56px 18px 22px;overflow-y:auto`;
  $('#screen').appendChild(layer);
  return layer;
}

function openLibrary() {
  const layer = libraryLayer();
  layer.style.display = 'flex';
  layer.innerHTML = '';
  layer.scrollTop = 0;

  const search = el('div');
  search.style.cssText = `display:flex;align-items:center;justify-content:center;gap:7px;height:38px;margin-bottom:18px;
    border-radius:12px;background:rgba(255,255,255,.16);color:#fff;font-size:16px;cursor:pointer`;
  search.innerHTML = `${SF.magnifier}<span>App Library</span>`;
  search.onclick = () => { closeLibrary(); openSpotlight(); };
  layer.appendChild(search);

  const grid = el('div');
  grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:20px 16px;padding-bottom:24px';
  libraryBuckets().forEach(bucket => grid.appendChild(libraryFolder(bucket)));
  layer.appendChild(grid);

  const close = el('button', '', 'Close');
  close.style.cssText = 'color:#fff;opacity:.7;font-size:14px;padding:10px;margin:0 auto 8px';
  close.onclick = closeLibrary;
  layer.appendChild(close);
}

function closeLibrary() {
  const layer = $('#applibrary');
  if (layer) layer.style.display = 'none';
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

function spotlightLayer() {
  let layer = $('#spotlight');
  if (layer) return layer;
  layer = el('div');
  layer.id = 'spotlight';
  layer.style.cssText = `position:absolute;inset:0;z-index:44;display:none;flex-direction:column;
    background:rgba(16,16,18,.72);backdrop-filter:blur(34px) saturate(170%);padding:52px 0 0`;
  $('#screen').appendChild(layer);
  layer.addEventListener('pointerdown', event => { if (event.target === layer) closeSpotlight(); });
  return layer;
}

function openSpotlight() {
  closeLibrary();
  const layer = spotlightLayer();
  layer.style.display = 'flex';
  layer.innerHTML = '';

  const field = el('div');
  field.style.cssText = `display:flex;align-items:center;gap:8px;margin:0 16px 12px;height:40px;padding:0 12px;
    border-radius:12px;background:rgba(255,255,255,.18);color:#fff;flex:none`;
  field.innerHTML = `<span style="display:grid;place-items:center;opacity:.8">${SF.magnifier}</span>`;
  const input = el('input');
  input.placeholder = 'Search';
  input.style.cssText = 'flex:1;min-width:0;background:transparent;border:0;outline:0;color:#fff;font-size:17px';
  field.appendChild(input);
  const cancel = el('button', '', 'Cancel');
  cancel.style.cssText = 'color:#fff;opacity:.8;font-size:15px;flex:none';
  cancel.onclick = closeSpotlight;
  const head = el('div');
  head.style.cssText = 'display:flex;align-items:center;flex:none;padding-right:12px';
  head.append(field, cancel);
  layer.appendChild(head);

  const body = el('div');
  body.style.cssText = 'flex:1;overflow-y:auto;padding:0 0 24px';
  layer.appendChild(body);

  const render = () => {
    body.innerHTML = '';
    const query = input.value;
    if (!query.trim()) {
      /* Idle state: the eight most likely apps, like Siri Suggestions. */
      body.appendChild(h(`<div style="color:rgba(255,255,255,.5);font-size:12px;letter-spacing:.5px;
        padding:6px 20px 10px">SIRI SUGGESTIONS</div>`));
      const grid = el('div');
      grid.style.cssText = 'display:grid;grid-template-columns:repeat(4,1fr);gap:18px 8px;padding:0 16px';
      allAppIds().slice(0, 8).forEach(id => {
        const tile = el('div');
        tile.style.cssText = 'text-align:center;cursor:pointer';
        tile.innerHTML = `${appIconHTML(Apps[id], 52)}
          <div style="font-size:11px;color:#fff;margin-top:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(Apps[id].name)}</div>`;
        tile.onclick = () => { closeSpotlight(); openApp(id); };
        grid.appendChild(tile);
      });
      body.appendChild(grid);
      body.appendChild(h(`<div style="color:rgba(255,255,255,.42);font-size:13px;line-height:1.5;padding:26px 24px 0">
        Search apps, settings, contacts, notes, reminders, events, mail, messages, stocks and cities.
        Everything is searched on device.</div>`));
      return;
    }

    const groups = spotlightResults(query);
    if (groups.length === 1) {
      body.appendChild(h(`<div style="text-align:center;color:rgba(255,255,255,.55);font-size:15px;padding:34px 30px 18px">
        No results on this iPhone for “${esc(query.trim())}”.</div>`));
    }
    groups.forEach(group2 => {
      body.appendChild(h(`<div style="color:rgba(255,255,255,.5);font-size:12px;letter-spacing:.5px;
        padding:16px 20px 6px">${esc(group2.title.toUpperCase())}</div>`));
      const list = el('div');
      list.style.cssText = 'margin:0 12px;border-radius:14px;background:rgba(255,255,255,.1);overflow:hidden';
      group2.rows.forEach((row, index) => {
        const item = el('div');
        item.style.cssText = `display:flex;align-items:center;gap:12px;padding:11px 14px;cursor:pointer;color:#fff;
          ${index ? 'border-top:.5px solid rgba(255,255,255,.12)' : ''}`;
        const iconHTML = row.iconHTML
          || `<div style="width:32px;height:32px;border-radius:8px;background:${row.iconBg || '#8e8e93'};
              display:grid;place-items:center;color:#fff">${row.icon || ''}</div>`;
        item.innerHTML = `<div style="flex:none;display:grid;place-items:center">${iconHTML}</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(row.label)}</div>
            ${row.sub ? `<div style="font-size:12px;opacity:.6;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(row.sub)}</div>` : ''}
          </div>`;
        item.onclick = () => { closeSpotlight(); row.onClick(); };
        list.appendChild(item);
      });
      body.appendChild(list);
    });
  };

  input.oninput = render;
  input.onkeydown = event => {
    if (event.key === 'Escape') closeSpotlight();
    if (event.key === 'Enter') {
      const first = spotlightResults(input.value)[0];
      if (first) { closeSpotlight(); first.rows[0].onClick(); }
    }
  };
  render();
  setTimeout(() => input.focus(), 120);
}

function closeSpotlight() {
  const layer = $('#spotlight');
  if (layer) { layer.style.display = 'none'; layer.innerHTML = ''; }
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

  /* Search pill above the dock. */
  const home = $('#home');
  if (home && !$('#searchPill')) {
    const pill = el('button');
    pill.id = 'searchPill';
    pill.innerHTML = `<span style="display:grid;place-items:center">${SF.magnifier}</span><span>Search</span>`;
    home.appendChild(pill);
    pill.onclick = event => { event.stopPropagation(); openSpotlight(); };
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

/* Escape and going home both dismiss the extra layers. */
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  if ($('#spotlight') && $('#spotlight').style.display === 'flex') { closeSpotlight(); event.stopPropagation(); }
  else if ($('#applibrary') && $('#applibrary').style.display === 'flex') { closeLibrary(); event.stopPropagation(); }
}, true);

const baseGoHome = goHome;
goHome = function goHomeClosingLayers() {
  closeSpotlight();
  closeLibrary();
  baseGoHome();
};
