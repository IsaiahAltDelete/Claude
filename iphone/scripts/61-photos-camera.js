/* ===========================================================================
   Camera and Photos.

   These replace the original stubs. The two share one persisted library, so a
   shot taken in Camera really does appear in Photos, can be favourited, deleted
   into Recently Deleted, and recovered from there.
   =========================================================================== */

/* --------------------------------------------------------------- the library */

function PHOTOLIB() {
  return slice('photos', () => {
    const items = [];
    const albums = ['Nature', 'City', 'Animals', 'Food', 'Travel'];
    for (let i = 0; i < 48; i += 1) {
      items.push({
        id: `p${i}`,
        seed: `photo-${i}`,
        at: Date.now() - i * 5.4e7 - Math.floor(rng(i)() * 3e7),
        fav: i % 11 === 0,
        deleted: false,
        album: albums[i % albums.length],
        kind: i % 9 === 0 ? 'video' : 'photo',
        seconds: i % 9 === 0 ? 8 + (i % 20) : 0,
      });
    }
    return { items, next: 48 };
  });
}

/* The camera's own state, shared with Settings › Camera. Both reach it
   through here so the viewfinder's Grid button and the Grid switch in
   Settings can never end up describing two different settings — which is the
   sort of inconsistency this simulator exists to teach people to spot. */
function CAM() {
  return slice('camera', () => ({
    mode: 'PHOTO', flash: 'auto', zoom: 1, timer: 0, front: false, filter: 'None',
    grid: false, level: true, mirrorFront: true,
  }), 2);
}

const livePhotos = () => PHOTOLIB().items.filter(item => !item.deleted);
const deletedPhotos = () => PHOTOLIB().items.filter(item => item.deleted);

function addPhoto({ kind = 'photo', seconds = 0, album = 'Recents' } = {}) {
  const store = PHOTOLIB();
  const item = {
    id: `p${store.next}`,
    seed: `shot-${store.next}-${Date.now() % 9973}`,
    at: Date.now(),
    fav: false,
    deleted: false,
    album,
    kind,
    seconds,
  };
  store.items.unshift(item);
  store.next += 1;
  save();
  return item;
}

/** Group items by calendar day, newest first. */
function groupByDay(items) {
  const buckets = new Map();
  items.slice().sort((a, b) => b.at - a.at).forEach(item => {
    const key = new Date(item.at).toDateString();
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(item);
  });
  return [...buckets.entries()];
}

/* ------------------------------------------------------------------- Photos */

defineApp({
  id: 'photos',
  name: 'Photos',
  bg: 'linear-gradient(135deg,#fff,#f2f2f2)',
  glyph: `<svg viewBox="0 0 100 100" style="width:82%">
    ${['#f9c22e', '#f68b1f', '#ee3b3b', '#c2379b', '#7b3fd4', '#2f7ee0', '#22b5c8', '#4cc35a'].map((c, i) =>
      `<ellipse cx="50" cy="50" rx="7.4" ry="19" transform="rotate(${i * 45} 50 32)" fill="${c}" opacity=".82"/>`).join('')}</svg>`,
  mount(win, inst) {
    const nav = new Nav(win);
    inst.nav = nav;
    inst.tab = 'library';
    nav.setRoot(photosTabView(inst));
  },
  onShow(inst) { inst.nav.refresh(); },
});

/** Bottom tab bar shared by the Photos root. */
function photosTabView(inst) {
  return {
    title: 'Photos',
    largeTitle: true,
    shortTitle: 'Photos',
    build(body, nav, view) {
      const tabs = [
        ['library', 'Library', SF.photo],
        ['foryou', 'For You', SF.sparkles],
        ['albums', 'Albums', SF.appsIcon],
        ['search', 'Search', SF.magnifier],
      ];

      const render = () => {
        [...body.children].forEach(child => { if (!child.classList.contains('lg-title')) child.remove(); });
        const title = body.querySelector('.lg-title');
        if (title) title.textContent = tabs.find(t => t[0] === inst.tab)[1];
        ({
          library: () => photosLibrary(body, nav),
          foryou: () => photosForYou(body, nav),
          albums: () => photosAlbums(body, nav),
          search: () => photosSearch(body, nav),
        })[inst.tab]();
      };

      const bar = el('div', 'tabbar');
      tabs.forEach(([id, label, glyph]) => {
        const button = el('button', inst.tab === id ? 'on' : '', `${glyph}<span>${label}</span>`);
        button.onclick = () => {
          inst.tab = id;
          $$('button', bar).forEach(b => b.classList.remove('on'));
          button.classList.add('on');
          render();
        };
        bar.appendChild(button);
      });
      view.tabbar = bar;
      render();
    },
  };
}

function photosLibrary(body, nav) {
  const store = slice('photosView', () => ({ scale: 'Days' }));
  const items = livePhotos();

  const seg = segmented(['Years', 'Months', 'Days', 'All'], store.scale, value => {
    store.scale = value;
    save();
    nav.refresh();
  });
  seg.style.margin = '4px 16px 12px';
  body.appendChild(seg);

  if (store.scale === 'All') {
    const grid = el('div', 'ph-grid');
    items.forEach(item => grid.appendChild(photoTile(item, nav, items)));
    body.appendChild(grid);
  } else if (store.scale === 'Days') {
    groupByDay(items).slice(0, 14).forEach(([day, group]) => {
      body.appendChild(h(`<div style="margin:16px 20px 8px">
        <div style="font-size:calc(20px * var(--tsize));font-weight:700">${esc(relativeDay(new Date(day)))}</div>
        <div style="font-size:calc(13px * var(--tsize));color:var(--txt3)">${esc(new Date(day).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }))} · ${group.length} items</div></div>`));
      const grid = el('div', 'ph-grid');
      group.forEach(item => grid.appendChild(photoTile(item, nav, items)));
      body.appendChild(grid);
    });
  } else {
    // Years and Months both collapse to one hero tile per bucket.
    const buckets = new Map();
    items.forEach(item => {
      const date = new Date(item.at);
      const key = store.scale === 'Years'
        ? String(date.getFullYear())
        : date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(item);
    });
    [...buckets.entries()].forEach(([label, group]) => {
      const hero = el('div');
      hero.style.cssText = 'margin:12px 16px;border-radius:16px;overflow:hidden;position:relative;height:210px';
      hero.style.background = `url("${artURI(group[0].seed, { w: 700, h: 420 })}") center/cover`;
      hero.appendChild(h(`<div style="position:absolute;inset:auto 0 0;padding:14px 16px;color:#fff;
        background:linear-gradient(transparent,rgba(0,0,0,.6))">
        <div style="font-size:calc(22px * var(--tsize));font-weight:700">${esc(label)}</div>
        <div style="font-size:calc(13px * var(--tsize));opacity:.85">${group.length} items</div></div>`));
      hero.onclick = () => nav.push(photoCollectionView(label, group));
      body.appendChild(hero);
    });
  }

  body.appendChild(h(`<div class="grp-f">${items.length} photos and videos. Artwork is generated on
    the device, so the library looks identical offline.</div>`));
}

function photoTile(item, nav, collection) {
  const cell = artCell(item.seed, { w: 240, h: 240 });
  if (item.kind === 'video') {
    cell.appendChild(h(`<div style="position:absolute;left:5px;bottom:4px;color:#fff;font-size:calc(10px * var(--tsize));
      text-shadow:0 1px 3px rgba(0,0,0,.6)">▶ ${clockDuration(item.seconds)}</div>`));
    cell.style.position = 'relative';
  }
  if (item.fav) {
    cell.style.position = 'relative';
    cell.appendChild(h(`<div style="position:absolute;right:5px;bottom:4px;color:#fff;font-size:calc(11px * var(--tsize));
      text-shadow:0 1px 3px rgba(0,0,0,.6)">♥</div>`));
  }
  cell.onclick = () => nav.push(photoDetail(item, collection, nav));
  /* A photo has no text of its own, so the date is the only thing that can
     distinguish one cell from the next in a grid of forty-eight. */
  actionable(cell, {
    label: `${item.kind === 'video' ? 'Video' : 'Photo'}, ${item.album}, ${relativeDay(item.at)}`
      + `${item.fav ? ', favourite' : ''}`,
  });
  return cell;
}

function photoCollectionView(title, items) {
  return {
    title,
    shortTitle: title,
    build(body, nav) {
      const grid = el('div', 'ph-grid');
      items.forEach(item => grid.appendChild(photoTile(item, nav, items)));
      body.appendChild(grid);
    },
  };
}

function photoDetail(item, collection, parentNav) {
  return {
    title: relativeDay(new Date(item.at)),
    right: [{ html: SF.share, onClick: () => actionSheet('Share', [
      { text: 'AirDrop', onClick: () => toast('AirDrop is simulated') },
      { text: 'Copy Photo', onClick: () => toast('Copied') },
      { text: 'Save to Files', onClick: () => toast('Saved to Files') },
    ]) }],
    build(body, nav) {
      const stage = el('div');
      stage.style.cssText = `height:430px;background:#000 url("${artURI(item.seed, { w: 800, h: 800 })}") center/contain no-repeat`;
      body.appendChild(stage);

      const date = new Date(item.at);
      group(body, { rows: [
        { label: date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }),
          sub: timeStr(date), chevron: false },
        { label: 'Kind', value: item.kind === 'video' ? `Video · ${clockDuration(item.seconds)}` : 'Photo' },
        { label: 'Album', value: item.album },
        { label: 'Camera', value: 'iPhone 15 Pro · f/1.78' },
        { label: 'Resolution', value: item.kind === 'video' ? '3840 × 2160' : '4032 × 3024' },
      ] });

      const bar = el('div');
      bar.style.cssText = 'display:flex;justify-content:space-around;padding:16px 20px;color:var(--sysblue)';
      const actions = [
        [item.fav ? 'Unfavourite' : 'Favourite', SF.star, () => {
          item.fav = !item.fav;
          save();
          toast(item.fav ? 'Added to Favourites' : 'Removed from Favourites');
          nav.refresh();
        }],
        ['Adjust', SF.sliders, () => toast('Editing is simulated')],
        ['Info', SF.gear, () => toast(`${item.kind === 'video' ? 'Video' : 'Photo'} · ${item.album}`)],
        [item.deleted ? 'Recover' : 'Delete', SF.trash, () => {
          if (item.deleted) {
            item.deleted = false;
            save();
            toast('Recovered to Library');
            nav.pop();
            return;
          }
          alertBox({
            title: 'Delete Photo?',
            message: 'It moves to Recently Deleted and is removed after 30 days.',
            buttons: [
              { text: 'Cancel' },
              { text: 'Delete', style: 'red', onClick: () => {
                item.deleted = true;
                save();
                toast('Moved to Recently Deleted');
                nav.pop();
              } },
            ],
          });
        }],
      ];
      actions.forEach(([label, glyph, onClick]) => {
        const button = el('button', '', glyph);
        button.title = label;
        button.style.cssText = 'display:grid;justify-items:center;gap:4px;font-size:calc(11px * var(--tsize));color:inherit';
        button.appendChild(h(`<div style="font-size:calc(11px * var(--tsize))">${label}</div>`));
        button.onclick = onClick;
        bar.appendChild(button);
      });
      body.appendChild(bar);
      void collection;
      void parentNav;
    },
  };
}

function photosForYou(body, nav) {
  const items = livePhotos();
  body.appendChild(cardHeader('Memories'));
  const rail = el('div', 'hscroll');
  rail.style.padding = '0 16px 8px';
  [['Last Week', 7], ['This Month', 30], ['Best of the Year', 300], ['Nature Walks', 120]].forEach(([label, span], index) => {
    const picks = items.filter(item => Date.now() - item.at < span * 864e5);
    const cardEl = el('div', 'hcard');
    cardEl.style.minWidth = '190px';
    const art = el('div');
    art.style.cssText = `height:250px;border-radius:16px;position:relative;overflow:hidden;
      background:url("${artURI(`memory-${index}`, { w: 400, h: 520 })}") center/cover`;
    art.appendChild(h(`<div style="position:absolute;inset:auto 0 0;padding:12px;color:#fff;
      background:linear-gradient(transparent,rgba(0,0,0,.6))">
      <div style="font-weight:700">${esc(label)}</div>
      <div style="font-size:calc(12px * var(--tsize));opacity:.85">${picks.length || items.length} items</div></div>`));
    cardEl.appendChild(art);
    cardEl.onclick = () => nav.push(photoCollectionView(label, picks.length ? picks : items.slice(0, 12)));
    rail.appendChild(cardEl);
  });
  body.appendChild(rail);

  body.appendChild(cardHeader('Featured Photos'));
  const grid = el('div', 'ph-grid');
  items.filter(item => item.fav).concat(items.slice(0, 9)).slice(0, 9)
    .forEach(item => grid.appendChild(photoTile(item, nav, items)));
  body.appendChild(grid);

  body.appendChild(cardHeader('Shared Album Activity'));
  group(body, { rows: [
    { icon: SF.person, iconBg: 'var(--sysblue)', label: 'Family', sub: '3 new photos from Dana', onClick: () => toast('Shared albums are simulated') },
    { icon: SF.person, iconBg: 'var(--sysgreen)', label: 'Support Bench', sub: 'You added 2 photos', onClick: () => toast('Shared albums are simulated') },
  ] });
}

function photosAlbums(body, nav) {
  const items = livePhotos();
  const albums = [...new Set(items.map(item => item.album))];

  body.appendChild(cardHeader('My Albums'));
  const grid = el('div');
  grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:14px;padding:4px 16px 8px';
  const tile = (label, collection, seed) => {
    const wrap = el('div');
    const art = el('div');
    art.style.cssText = `height:150px;border-radius:12px;background:url("${artURI(seed, { w: 320, h: 320 })}") center/cover`;
    wrap.appendChild(art);
    wrap.appendChild(h(`<div style="margin-top:6px;font-size:calc(14px * var(--tsize));font-weight:500">${esc(label)}</div>
      <div style="font-size:calc(12px * var(--tsize));color:var(--txt3)">${collection.length}</div>`));
    wrap.onclick = () => nav.push(photoCollectionView(label, collection));
    grid.appendChild(wrap);
  };

  tile('Recents', items, items[0]?.seed || 'recents');
  tile('Favourites', items.filter(item => item.fav), 'favourites');
  albums.forEach(album => tile(album, items.filter(item => item.album === album), `album-${album}`));
  body.appendChild(grid);

  body.appendChild(cardHeader('Media Types'));
  group(body, { rows: [
    { icon: SF.camera, iconBg: 'var(--sysblue)', label: 'Videos', value: String(items.filter(i => i.kind === 'video').length),
      onClick: () => nav.push(photoCollectionView('Videos', items.filter(i => i.kind === 'video'))) },
    { icon: SF.person, iconBg: 'var(--systeal)', label: 'Selfies', value: String(Math.ceil(items.length / 6)),
      onClick: () => nav.push(photoCollectionView('Selfies', items.filter((_, i) => i % 6 === 0))) },
    { icon: SF.photo, iconBg: 'var(--syspurple)', label: 'Screenshots', value: String(Math.ceil(items.length / 8)),
      onClick: () => nav.push(photoCollectionView('Screenshots', items.filter((_, i) => i % 8 === 0))) },
  ] });

  body.appendChild(cardHeader('Utilities'));
  group(body, { rows: [
    { icon: SF.trash, iconBg: 'var(--sysgray)', label: 'Recently Deleted', value: String(deletedPhotos().length),
      onClick: () => nav.push(recentlyDeletedView()) },
  ] });
}

function recentlyDeletedView() {
  return {
    title: 'Recently Deleted',
    shortTitle: 'Deleted',
    build(body, nav) {
      const items = deletedPhotos();
      if (!items.length) {
        body.appendChild(emptyState(SF.trash, 'Nothing Deleted', 'Photos you delete stay here for 30 days.'));
        return;
      }
      const grid = el('div', 'ph-grid');
      items.forEach(item => grid.appendChild(photoTile(item, nav, items)));
      body.appendChild(grid);
      body.appendChild(primaryButton('Recover All', () => {
        items.forEach(item => { item.deleted = false; });
        save();
        toast(`Recovered ${items.length} items`);
        nav.refresh();
      }));
    },
  };
}

function photosSearch(body, nav) {
  const items = livePhotos();
  let query = '';
  const results = el('div');

  const paint = () => {
    results.innerHTML = '';
    if (!query.trim()) {
      results.appendChild(cardHeader('Categories'));
      const grid = el('div');
      grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:4px 16px';
      [...new Set(items.map(item => item.album))].forEach(album => {
        const tile = el('div');
        tile.style.cssText = `height:110px;border-radius:12px;position:relative;overflow:hidden;
          background:url("${artURI(`cat-${album}`, { w: 320, h: 220 })}") center/cover`;
        tile.appendChild(h(`<div style="position:absolute;inset:auto 0 0;padding:8px 10px;color:#fff;font-weight:600;
          background:linear-gradient(transparent,rgba(0,0,0,.55))">${esc(album)}</div>`));
        tile.onclick = () => nav.push(photoCollectionView(album, items.filter(item => item.album === album)));
        grid.appendChild(tile);
      });
      results.appendChild(grid);
      return;
    }
    const matches = items.filter(item =>
      item.album.toLowerCase().includes(query.toLowerCase()) ||
      item.kind.includes(query.toLowerCase()) ||
      relativeDay(new Date(item.at)).toLowerCase().includes(query.toLowerCase()));
    if (!matches.length) {
      results.appendChild(emptyState(SF.magnifier, 'No Results', `Nothing matched “${query}”.`));
      return;
    }
    results.appendChild(cardHeader(`${matches.length} results`));
    const grid = el('div', 'ph-grid');
    matches.forEach(item => grid.appendChild(photoTile(item, nav, matches)));
    results.appendChild(grid);
  };

  body.appendChild(searchField('Photos, People, Places', value => { query = value; paint(); }));
  body.appendChild(results);
  paint();
}

/* ------------------------------------------------------------------- Camera */

const CAMERA_MODES = ['TIME-LAPSE', 'SLO-MO', 'VIDEO', 'PHOTO', 'PORTRAIT', 'PANO'];

defineApp({
  id: 'camera',
  name: 'Camera',
  bg: 'linear-gradient(160deg,#4a4a4c,#1c1c1e)',
  darkStatus: true,
  glyph: `<svg viewBox="0 0 100 100" style="width:74%">
    <rect x="12" y="26" width="76" height="52" rx="13" fill="#c7c7cc"/>
    <circle cx="50" cy="52" r="18" fill="#3a3a3c"/><circle cx="50" cy="52" r="11" fill="#0a0a0c"/>
    <circle cx="50" cy="52" r="5" fill="#4a5a7a"/>
    <rect x="38" y="19" width="24" height="9" rx="4" fill="#aeaeb2"/>
    <circle cx="78" cy="37" r="3.4" fill="#ffd60a"/></svg>`,
  mount(win, inst) {
    const state = CAM();
    inst.cam = { recording: false, seconds: 0, ticker: null };
    win.style.background = '#000';

    const root = el('div');
    root.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;color:#fff;overflow:hidden';
    win.appendChild(root);

    /* ---- top controls */
    const top = el('div');
    top.style.cssText = 'padding:56px 20px 8px;display:flex;align-items:center;justify-content:space-between;font-size:calc(13px * var(--tsize))';
    root.appendChild(top);

    /* ---- viewfinder */
    const finder = el('div');
    finder.style.cssText = 'flex:1;position:relative;overflow:hidden;background:#0a0a0c';
    root.appendChild(finder);

    /* ---- bottom controls */
    const bottom = el('div');
    bottom.style.cssText = 'padding:10px 0 34px;background:#000';
    root.appendChild(bottom);

    const paint = () => {
      const isVideo = state.mode === 'VIDEO' || state.mode === 'SLO-MO' || state.mode === 'TIME-LAPSE';

      top.innerHTML = '';
      const flashButton = el('button', '', ({ auto: '⚡︎A', on: '⚡︎', off: '⚡︎̸' })[state.flash]);
      flashButton.style.cssText = 'color:' + (state.flash === 'off' ? '#8e8e93' : '#ffd60a') + ';font-size:calc(15px * var(--tsize))';
      flashButton.onclick = () => {
        state.flash = state.flash === 'auto' ? 'on' : state.flash === 'on' ? 'off' : 'auto';
        save();
        paint();
        toast(`Flash ${state.flash}`);
      };
      top.appendChild(flashButton);

      const live = el('div');
      live.style.cssText = 'display:flex;gap:16px;align-items:center';
      [['Grid', state.grid, () => { state.grid = !state.grid; save(); paint(); }],
       [state.timer ? `${state.timer}s` : 'Timer', state.timer > 0, () => { state.timer = state.timer === 0 ? 3 : state.timer === 3 ? 10 : 0; save(); paint(); }]]
        .forEach(([label, on, onClick]) => {
          const button = el('button', '', esc(label));
          button.style.cssText = `font-size:calc(12px * var(--tsize));color:${on ? '#ffd60a' : '#fff'};opacity:${on ? 1 : 0.75}`;
          button.onclick = onClick;
          live.appendChild(button);
        });
      top.appendChild(live);

      if (inst.cam.recording) {
        top.innerHTML = `<div style="flex:1;text-align:center;color:#ff453a;font-weight:600">
          ● ${clockDuration(inst.cam.seconds)}</div>`;
      }

      /* Viewfinder: a generated scene stands in for a camera feed. */
      finder.innerHTML = '';
      const scene = el('div');
      const zoomScale = 1 + (state.zoom - 1) * 0.35;
      const mirrored = state.front && state.mirrorFront !== false;
      scene.style.cssText = `position:absolute;inset:0;background:url("${artURI(state.front ? 'selfie-scene' : 'camera-scene', { w: 700, h: 900 })}") center/cover;
        transform:scale(${zoomScale})${mirrored ? ' scaleX(-1)' : ''};transition:transform .25s ease;
        filter:${({ None: 'none', Vivid: 'saturate(1.5) contrast(1.1)', Mono: 'grayscale(1)', Silvertone: 'grayscale(1) contrast(1.2) brightness(1.05)', Noir: 'grayscale(1) contrast(1.5) brightness(.85)' })[state.filter]}`;
      finder.appendChild(scene);

      if (state.mode === 'PORTRAIT') {
        finder.appendChild(h(`<div style="position:absolute;inset:0;
          box-shadow:inset 0 0 90px 40px rgba(0,0,0,.45);pointer-events:none"></div>
          <div style="position:absolute;top:12px;left:50%;transform:translateX(-50%);
          background:rgba(255,214,10,.9);color:#000;font-size:calc(11px * var(--tsize));font-weight:600;padding:3px 9px;border-radius:8px">
          NATURAL LIGHT</div>`));
      }
      if (state.grid) {
        finder.appendChild(h(`<div style="position:absolute;inset:0;pointer-events:none;
          background:linear-gradient(to right,transparent 33.2%,rgba(255,255,255,.3) 33.3%,rgba(255,255,255,.3) 33.5%,transparent 33.6%,transparent 66.2%,rgba(255,255,255,.3) 66.3%,rgba(255,255,255,.3) 66.5%,transparent 66.6%),
          linear-gradient(to bottom,transparent 33.2%,rgba(255,255,255,.3) 33.3%,rgba(255,255,255,.3) 33.5%,transparent 33.6%,transparent 66.2%,rgba(255,255,255,.3) 66.3%,rgba(255,255,255,.3) 66.5%,transparent 66.6%)"></div>`));
      }
      /* Level: on a real phone this only appears once the device is close to
         flat, and turns yellow when it is level. There is no accelerometer
         here, so it settles a moment after the app opens. */
      if (state.level !== false) {
        finder.appendChild(h(`<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
          width:110px;height:1.5px;background:#ffd60a;opacity:.85;pointer-events:none;border-radius:1px"></div>`));
      }
      // Tap to focus.
      finder.onclick = event => {
        const box = el('div');
        const rect = finder.getBoundingClientRect();
        box.style.cssText = `position:absolute;width:74px;height:74px;border:1.5px solid #ffd60a;border-radius:6px;
          left:${event.clientX - rect.left - 37}px;top:${event.clientY - rect.top - 37}px;
          animation:none;pointer-events:none`;
        finder.appendChild(box);
        setTimeout(() => box.remove(), 900);
      };

      /* Zoom pills */
      const zooms = el('div');
      zooms.style.cssText = 'position:absolute;left:0;right:0;bottom:12px;display:flex;gap:10px;justify-content:center';
      [0.5, 1, 2, 3].forEach(level => {
        const pill = el('button', '', level === state.zoom ? `${level}×` : `${level}`);
        pill.style.cssText = `min-width:${level === state.zoom ? 42 : 34}px;height:${level === state.zoom ? 42 : 34}px;
          border-radius:50%;background:rgba(0,0,0,.45);backdrop-filter:blur(8px);
          color:${level === state.zoom ? '#ffd60a' : '#fff'};font-size:calc(12px * var(--tsize));font-weight:600`;
        pill.onclick = event => { event.stopPropagation(); state.zoom = level; save(); paint(); };
        zooms.appendChild(pill);
      });
      finder.appendChild(zooms);

      /* ---- bottom: filters, modes, shutter */
      bottom.innerHTML = '';

      if (state.mode === 'PHOTO' || state.mode === 'PORTRAIT') {
        const filters = el('div', 'hscroll');
        filters.style.cssText = 'padding:0 16px 10px;gap:8px';
        ['None', 'Vivid', 'Mono', 'Silvertone', 'Noir'].forEach(name => {
          const chip = el('button', '', esc(name));
          chip.style.cssText = `flex:none;padding:5px 12px;border-radius:999px;font-size:calc(12px * var(--tsize));
            background:${state.filter === name ? '#ffd60a' : 'rgba(255,255,255,.14)'};
            color:${state.filter === name ? '#000' : '#fff'}`;
          chip.onclick = () => { state.filter = name; save(); paint(); };
          filters.appendChild(chip);
        });
        bottom.appendChild(filters);
      }

      const modes = el('div');
      modes.style.cssText = 'display:flex;gap:18px;justify-content:center;font-size:calc(11px * var(--tsize));letter-spacing:.06em;padding:4px 0 12px;overflow-x:auto';
      CAMERA_MODES.forEach(mode => {
        const button = el('button', '', mode);
        button.style.cssText = `flex:none;color:${mode === state.mode ? '#ffd60a' : 'rgba(255,255,255,.65)'};
          font-weight:${mode === state.mode ? 700 : 400}`;
        button.onclick = () => {
          if (inst.cam.recording) return;
          state.mode = mode;
          save();
          paint();
        };
        modes.appendChild(button);
      });
      bottom.appendChild(modes);

      const row = el('div');
      row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:0 28px';

      // Last shot thumbnail opens Photos.
      const recent = livePhotos()[0];
      const thumb = el('button');
      thumb.style.cssText = `width:48px;height:48px;border-radius:8px;overflow:hidden;
        background:${recent ? `url("${artURI(recent.seed, { w: 120, h: 120 })}") center/cover` : 'rgba(255,255,255,.15)'}`;
      thumb.onclick = () => openApp('photos');
      row.appendChild(thumb);

      const shutter = el('button');
      shutter.id = 'camShutter';
      shutter.style.cssText = `width:72px;height:72px;border-radius:50%;border:4px solid #fff;
        background:${isVideo ? (inst.cam.recording ? '#ff453a' : '#ff453a') : '#fff'};
        ${inst.cam.recording ? 'border-radius:16px;width:60px;height:60px' : ''}`;
      shutter.onclick = () => capture(isVideo);
      row.appendChild(shutter);

      const flip = el('button', '', SF.history);
      flip.style.cssText = 'width:48px;height:48px;border-radius:50%;background:rgba(255,255,255,.18);display:grid;place-items:center';
      flip.onclick = () => { state.front = !state.front; save(); paint(); toast(state.front ? 'Front camera' : 'Rear camera'); };
      row.appendChild(flip);

      bottom.appendChild(row);
    };

    const shoot = isVideo => {
      if (isVideo) {
        if (inst.cam.recording) {
          clearInterval(inst.cam.ticker);
          const seconds = inst.cam.seconds;
          inst.cam.recording = false;
          inst.cam.seconds = 0;
          addPhoto({ kind: 'video', seconds: Math.max(1, seconds), album: 'Recents' });
          paint();
          toast(`Video saved · ${clockDuration(seconds)}`);
          return;
        }
        inst.cam.recording = true;
        inst.cam.seconds = 0;
        inst.cam.ticker = setInterval(() => { inst.cam.seconds += 1; paint(); }, 1000);
        paint();
        return;
      }
      const flashEl = el('div');
      flashEl.style.cssText = 'position:absolute;inset:0;background:#fff;z-index:9;transition:opacity .18s';
      win.appendChild(flashEl);
      setTimeout(() => { flashEl.style.opacity = '0'; }, 40);
      setTimeout(() => flashEl.remove(), 260);
      addPhoto({ album: state.mode === 'PORTRAIT' ? 'Portraits' : 'Recents' });
      paint();
      toast(state.mode === 'PORTRAIT' ? 'Portrait saved' : 'Photo saved to Library');
    };

    const capture = isVideo => {
      if (state.timer && !isVideo && !inst.cam.recording) {
        let left = state.timer;
        const countdown = el('div');
        countdown.style.cssText = `position:absolute;inset:0;display:grid;place-items:center;z-index:8;
          font-size:calc(88px * var(--tsize));font-weight:200;color:#ffd60a;text-shadow:0 2px 20px rgba(0,0,0,.5)`;
        countdown.textContent = String(left);
        finder.appendChild(countdown);
        const tick = setInterval(() => {
          left -= 1;
          countdown.textContent = String(left);
          if (left <= 0) {
            clearInterval(tick);
            countdown.remove();
            shoot(false);
          }
        }, 1000);
        return;
      }
      shoot(isVideo);
    };

    paint();
    inst.onHide = () => { clearInterval(inst.cam.ticker); inst.cam.recording = false; };
  },
});
