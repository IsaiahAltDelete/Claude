/* ===========================================================================
   Search.

   The grid keyboard on the left, results in the middle, and what is
   highlighted on the right. Results appear as you type rather than on a
   submit, and everything searchable is searched at once: titles, channels,
   live channels and genres.

   The microphone button works from anywhere and lands here.
   =========================================================================== */

'use strict';

const KEYS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('');

const POPULAR_SEARCHES = [
  'the girlie show', 'free movies', 'kickpuncher', 'live news',
  'the rural juror', 'documentaries', 'westerns', 'kids',
];

/* What the microphone comes back with. Half of them are the things people
   actually say to a remote; the other half are jokes. */
const VOICE_QUERIES = [
  'the girlie show', 'free movies', 'documentaries', 'live news',
  'the rural juror', 'kickpuncher', 'horsin around', 'sports',
  'threat level midnight', 'westerns', 'something to fall asleep to',
];

/** Everything that matches, grouped the way the results column shows them. */
function searchAll(query) {
  const q = query.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!q) return [];
  const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const out = [];

  TITLES.forEach(t => {
    if (norm(t.title).includes(q) || norm(t.genre).includes(q)) {
      out.push({ kind: 'title', id: t.id, name: t.title, sub: `${t.kind === 'series' ? 'Series' : 'Movie'} · ${t.year} · ${t.genre}` });
    }
  });
  CHANNELS.forEach(c => {
    if (norm(c.name).includes(q) || norm(c.id).includes(q)) {
      out.push({ kind: 'chan', id: c.id, name: c.name, sub: State.installed.includes(c.id) ? 'Channel · Added' : 'Channel · In the store' });
    }
  });
  LIVE_CHANNELS.forEach(c => {
    if (norm(c.name).includes(q)) {
      out.push({ kind: 'live', id: c.num, name: c.name, sub: `Live channel · ${c.num}` });
    }
  });

  /* Titles first, then channels, then live — the order Roku puts them in. */
  const rank = { title: 0, chan: 1, live: 2 };
  return out.sort((a, b) => rank[a.kind] - rank[b.kind]).slice(0, 24);
}

defineScreen('search', {
  render(host, arg) {
    let query = (arg && arg.q) || '';

    host.innerHTML = `
      <div class="search">
        <div class="wall"></div>
        ${topbarHTML()}
        ${sideRailHTML('search')}
        <div class="search-left">
          <div class="qfield" id="q-field"></div>
          <div class="kbd" id="q-kbd">
            ${KEYS.map((k, i) => `<div class="kkey f" data-fid="k-${k}" data-key="${k}"${i === 0 ? ' data-first' : ''}>${k}</div>`).join('')}
            <div class="kkey wide act f" data-fid="k-space" data-key="_">SPACE</div>
            <div class="kkey wide act f" data-fid="k-del" data-key="⌫">DELETE</div>
            <div class="kkey wide act f" data-fid="k-clear" data-key="✕">CLEAR</div>
          </div>
          <div class="mic-hint">${ICON('mic')} Press the microphone on the remote to search by voice</div>
        </div>
        <div class="search-right">
          <div class="res-list scroll-y" id="q-results"></div>
          <div class="res-detail" id="q-detail"></div>
        </div>
      </div>`;

    const rail = wireSideRail(host);
    const field = host.querySelector('#q-field');
    const results = host.querySelector('#q-results');
    const detail = host.querySelector('#q-detail');

    function paintField() {
      field.innerHTML = `${ICON('search')}
        <span class="qtext">${query ? esc(query) : '<span class="qplace">Search for movies, shows, actors and channels</span>'}</span>
        <span class="caret"></span>`;
    }

    function paintResults(keepIndex = 0) {
      const found = searchAll(query);

      if (!query) {
        const recents = State.searchHistory.slice(0, 6);
        results.innerHTML = `
          ${recents.length ? `<div class="res-head">Recent searches</div>${
            recents.map((r, i) => `<div class="resrow f" data-fid="rec-${i}" data-recent="${esc(r)}">
              <span class="rr-b"><span class="rr-t">${esc(r)}</span></span></div>`).join('')}` : ''}
          <div class="res-head" style="margin-top:16px">Popular searches</div>
          ${POPULAR_SEARCHES.map((r, i) => `<div class="resrow f" data-fid="pop-${i}" data-recent="${esc(r)}">
            <span class="rr-b"><span class="rr-t">${esc(r)}</span></span></div>`).join('')}`;
        detail.innerHTML = `<div class="empty-note">Start typing, or press the microphone
          on the remote and say what you are looking for.</div>`;
        return;
      }

      if (!found.length) {
        results.innerHTML = `<div class="empty-note">No results for “${esc(query)}”</div>`;
        detail.innerHTML = `<div class="empty-note">Try a shorter search — the box matches
          on titles, channels and genres.</div>`;
        return;
      }

      results.innerHTML = `<div class="res-head">${found.length} result${found.length === 1 ? '' : 's'}</div>` +
        found.map((r, i) => {
          let art = '';
          if (r.kind === 'title') art = keyArt(TITLE_BY_ID[r.id], { withText: false });
          else if (r.kind === 'chan') art = channelArt(CH[r.id], 'sz-s');
          else art = channelArt(CH[LIVE_CHANNELS.find(c => c.num === r.id).id], 'sz-s');
          return `<div class="resrow f" data-fid="res-${i}" data-kind="${r.kind}" data-id="${esc(r.id)}">
              <span class="rr-art">${art}</span>
              <span class="rr-b"><span class="rr-t">${esc(r.name)}</span>
                <span class="rr-s">${esc(r.sub)}</span></span>
            </div>`;
        }).join('');

      const rows = $$('.resrow', results);
      if (rows[keepIndex]) paintDetail(rows[keepIndex]);
    }

    function paintDetail(node) {
      if (!node) return;
      if (node.dataset.recent) {
        detail.innerHTML = `<div class="empty-note">Press <b>OK</b> to search for
          “${esc(node.dataset.recent)}”.</div>`;
        return;
      }
      const kind = node.dataset.kind;
      const id = node.dataset.id;

      if (kind === 'title') {
        const item = TITLE_BY_ID[id];
        const price = priceLabel(item.price);
        detail.innerHTML = `
          <div class="rd-art">${keyArt(item, { withText: false })}</div>
          <h3>${esc(item.title)}</h3>
          <div class="hero-meta"><span>${item.year}</span><span class="dot">&middot;</span>
            <span class="pill rating">${esc(item.rated)}</span><span>${esc(item.genre)}</span>
            <span class="pill ${price.cls}">${esc(price.text)}</span></div>
          <div class="t-body" style="margin-top:10px">${esc(item.desc)}</div>
          <div class="t-micro" style="margin-top:18px">Watch on</div>
          ${item.on.map(cid => `<div class="watch-row" style="font-size:19px">
              <span class="wr-art">${channelArt(CH[cid], 'sz-s')}</span>
              <span>${esc(CH[cid].name)}</span></div>`).join('')}`;
        return;
      }
      if (kind === 'chan') {
        const ch = CH[id];
        detail.innerHTML = `
          <div class="rd-art">${channelArt(ch)}</div>
          <h3>${esc(ch.name)}</h3>
          <div class="hero-meta">${STARS(ch.rating)}<span>${ch.rating.toFixed(1)}</span>
            <span class="dot">&middot;</span><span>${esc(ch.dev)}</span></div>
          <div class="t-body" style="margin-top:10px">${esc(ch.desc)}</div>
          <div class="t-small" style="margin-top:16px">${State.installed.includes(ch.id)
            ? 'Press OK to open this channel.' : 'Press OK to see it in the store.'}</div>`;
        return;
      }
      const live = LIVE_CHANNELS.find(c => c.num === id);
      const prog = programmeAt(live, new Date());
      detail.innerHTML = `
        <div class="rd-art">${sceneArt(live.num)}</div>
        <h3>${esc(live.name)}</h3>
        <div class="hero-meta"><span class="pill live">On now</span><span>${esc(prog.title)}</span>
          <span class="dot">&middot;</span><span>${esc(prog.window)}</span></div>
        <div class="t-small" style="margin-top:16px">Press OK to watch this channel.</div>`;
    }

    function type(key) {
      if (key === '⌫') query = query.slice(0, -1);
      else if (key === '✕') query = '';
      else if (key === '_') query += ' ';
      else query += key.toLowerCase();
      paintField();
      paintResults();
    }

    function remember(term) {
      const clean = term.trim();
      if (!clean) return;
      State.searchHistory = [clean, ...State.searchHistory.filter(t => t !== clean)].slice(0, 12);
      save();
    }

    const api = {
      onFocus(node) { rail.onFocus(node); if (node.closest('#q-results')) paintDetail(node); },

      select(node) {
        if (rail.select(node)) return;

        if (node.dataset.key) { type(node.dataset.key); return; }

        if (node.dataset.recent) {
          query = node.dataset.recent;
          paintField();
          paintResults();
          const first = results.querySelector('.resrow');
          if (first) setFocus(first);
          return;
        }

        remember(query);
        const kind = node.dataset.kind;
        const id = node.dataset.id;
        if (kind === 'title') { go('title', id); return; }
        if (kind === 'chan') {
          if (State.installed.includes(id)) launchChannel(id);
          else go('channel', { id });
          return;
        }
        const live = LIVE_CHANNELS.find(c => c.num === id);
        playLive(live, programmeAt(live, new Date()));
      },

      /** The microphone drops a spoken query straight into the field. */
      voice(spoken) {
        query = spoken;
        paintField();
        paintResults();
        const first = results.querySelector('.resrow');
        if (first) setFocus(first);
      },

      refocus() { if (!Focus.el || !focusables().includes(Focus.el)) focusFirst(host); },
    };

    paintField();
    paintResults();
    return api;
  },
});

/* --------------------------------------------------------------- voice */

/**
 * The microphone. On a real remote this listens; here it shows the same
 * "Listening" panel and then puts a plausible query into search, so the flow
 * an agent walks somebody through is the same one.
 */
async function startVoice() {
  const panel = el('div', 'modal-wrap');
  const card = el('div', 'modal');
  card.style.textAlign = 'center';
  card.innerHTML = `<div class="icon-big">${ICON('mic')}</div>
    <h2>Listening<span class="dots"></span></h2>
    <p>Say the name of a show, a channel or a genre.</p>`;
  panel.appendChild(card);
  openOverlay(panel, { back() { return true; }, select() {} }, { scrim: false });
  setMicLive(true);

  await sleep(1500);
  setMicLive(false);
  closeOverlay();

  const spoken = VOICE_QUERIES[Math.floor(Math.random() * VOICE_QUERIES.length)];
  const top = UI.stack[UI.stack.length - 1];
  if (top && top.id === 'search' && top.api.voice) {
    top.api.voice(spoken);
    toast(`Heard: “${spoken}”`);
    return;
  }
  go('search', { q: spoken });
  toast(`Heard: “${spoken}”`);
}
