/* ===========================================================================
   The content pages — What to Watch, Sports, Featured Free, the Movie Store
   and the TV Store.

   All five are the same screen with a different set of rails: a detail band at
   the top that tracks the highlight, then rows of key art you scroll sideways
   through. Selecting anything opens the title page, which is where the "watch
   on" choices live.
   =========================================================================== */

'use strict';

/** Progress, if this title is part-watched. */
function watchProgress(id) {
  const entry = State.continueWatching.find(e => e.id === id);
  return entry ? entry.pct : 0;
}

function posterHTML(item, shape, fid, first = false) {
  const price = priceLabel(item.price);
  const pct = watchProgress(item.id);
  return `<div class="poster ${shape} f lift" data-fid="${fid}" data-title="${item.id}"${first ? ' data-first' : ''}>
      ${item.price === 'free' ? '<span class="badge">Free</span>' : ''}
      ${keyArt(item)}
      ${pct ? `<span class="progressbar"><i style="width:${pct}%"></i></span>` : ''}
      <span class="sr-only">${esc(item.title)} — ${esc(price.text)}</span>
    </div>`;
}

function channelPosterHTML(ch, fid, first = false) {
  return `<div class="poster wide f lift" data-fid="${fid}" data-chan="${ch.id}"${first ? ' data-first' : ''}>
      ${channelArt(ch)}
      <span class="sr-only">${esc(ch.name)}</span>
    </div>`;
}

/* ------------------------------------------------------------- the pages */

/** Rails are built fresh each render so newly-watched titles show up. */
function buildRails(section) {
  const byGenre = genre => TITLES.filter(t => t.genre === genre);
  const free = TITLES.filter(t => t.price === 'free');
  const rent = TITLES.filter(t => t.price !== 'free' && t.price !== 'sub');
  const series = TITLES.filter(t => t.kind === 'series');
  const movies = TITLES.filter(t => t.kind === 'movie');

  if (section === 'watch') {
    const cont = State.continueWatching
      .map(entry => TITLE_BY_ID[entry.id])
      .filter(Boolean);
    return [
      cont.length ? { title: 'Continue Watching', shape: 'wide', items: cont } : null,
      { title: 'Popular on the channels you have', shape: 'tall', items: seededOrder(TITLES, 'popular').slice(0, 12) },
      { title: 'New this week', shape: 'wide', items: TITLES.filter(t => t.year >= 2024).slice(0, 10) },
      { title: 'Free with ads', shape: 'tall', items: free },
      { title: 'Because you watched documentaries', shape: 'tall', items: byGenre('Documentary').concat(byGenre('Nature')) },
      { title: 'Live now', shape: 'wide', kind: 'live', items: LIVE_CHANNELS.slice(0, 8) },
    ].filter(Boolean);
  }

  if (section === 'sports') {
    return [
      { title: 'Live and upcoming', shape: 'wide', kind: 'live', items: LIVE_CHANNELS.filter(c => ['sportswire', 'courtside', 'pitchside'].includes(c.id)) },
      { title: 'Sports channels', shape: 'chan', items: CHANNELS.filter(c => c.kind === 'sports') },
      { title: 'Highlights and replays', shape: 'wide', items: byGenre('Sport') },
      { title: 'Sports documentaries', shape: 'tall', items: byGenre('Documentary').slice(0, 8) },
    ];
  }

  if (section === 'free') {
    return [
      { title: 'Free movies', shape: 'tall', items: free.filter(t => t.kind === 'movie') },
      { title: 'Free series', shape: 'tall', items: free.filter(t => t.kind === 'series') },
      { title: 'Free channels to add', shape: 'chan', items: CHANNELS.filter(c => c.kind === 'avod') },
      { title: 'Free live channels', shape: 'wide', kind: 'live', items: LIVE_CHANNELS.slice(2, 10) },
    ];
  }

  if (section === 'movies') {
    return [
      { title: 'New to rent', shape: 'tall', items: rent },
      { title: 'Top selling', shape: 'tall', items: seededOrder(movies, 'topsell').slice(0, 10) },
      { title: 'Under $5', shape: 'wide', items: rent.filter(t => Number(t.price) < 5) },
      { title: 'Included with a subscription', shape: 'tall', items: movies.filter(t => t.price === 'sub').slice(0, 12) },
    ];
  }

  /* tvstore */
  return [
    { title: 'Popular series', shape: 'tall', items: seededOrder(series, 'popseries') },
    { title: 'New episodes this week', shape: 'wide', items: series.filter(t => t.year >= 2024) },
    { title: 'Complete box sets', shape: 'tall', items: series.filter(t => t.year < 2024) },
    { title: 'Channels with series', shape: 'chan', items: CHANNELS.filter(c => c.kind === 'svod').slice(0, 10) },
  ];
}

const RAIL_TITLES = {
  watch:   { title: 'What to Watch', sub: 'Picked from the channels on this device' },
  sports:  { title: 'Sports', sub: 'Live games, highlights and sports channels' },
  free:    { title: 'Featured Free', sub: 'Nothing to subscribe to — these play with ads' },
  movies:  { title: 'Movie Store', sub: 'Rent or buy, then watch on any of your devices' },
  tvstore: { title: 'TV Store', sub: 'Series by the episode, the season or the box set' },
};

defineScreen('rails', {
  render(host, section) {
    const meta = RAIL_TITLES[section] || RAIL_TITLES.watch;
    const rails = buildRails(section);

    host.innerHTML = `
      <div class="page with-rail">
        <div class="wall"></div>
        ${topbarHTML()}
        ${sideRailHTML(section)}
        <div class="page-head"><div>
          <h1>${esc(meta.title)}</h1>
          <div class="head-sub">${esc(meta.sub)}</div>
        </div></div>
        <div class="hero" id="rail-hero"></div>
        <div class="rails scroll-y"><div class="rails-inner">
          ${rails.map((rail, ri) => `
            <section class="rail">
              <h2 class="rail-title">${esc(rail.title)}</h2>
              <div class="rail-track scroll-x">
                ${rail.items.map((item, ii) => {
                  const fid = `r${ri}-${ii}`;
                  /* The screen opens on the first poster, not on the menu. */
                  const first = ri === 0 && ii === 0;
                  if (rail.shape === 'chan') return channelPosterHTML(item, fid, first);
                  if (rail.kind === 'live') return liveTileHTML(item, fid, first);
                  return posterHTML(item, rail.shape, fid, first);
                }).join('')}
              </div>
            </section>`).join('')}
        </div></div>
      </div>`;

    const rail = wireSideRail(host);
    const hero = host.querySelector('#rail-hero');

    function paintHero(node) {
      if (!node) return;
      if (node.dataset.title) {
        const item = TITLE_BY_ID[node.dataset.title];
        const price = priceLabel(item.price);
        hero.innerHTML = `
          <div class="hero-art">${keyArt(item, { withText: false })}</div>
          <div class="hero-body">
            <div class="hero-title">${esc(item.title)}</div>
            <div class="hero-meta">
              <span>${item.year}</span><span class="dot">&middot;</span>
              <span class="pill rating">${esc(item.rated)}</span>
              <span>${esc(item.genre)}</span><span class="dot">&middot;</span>
              <span>${item.kind === 'series' ? `${item.mins} min episodes` : fmtDur(item.mins * 60)}</span>
              <span class="pill ${price.cls}">${esc(price.text)}</span>
              <span class="pill hd">HD</span>
            </div>
            <div class="hero-desc">${esc(item.desc)}</div>
          </div>`;
        return;
      }
      if (node.dataset.chan) {
        const ch = CH[node.dataset.chan];
        hero.innerHTML = `
          <div class="hero-art">${channelArt(ch)}</div>
          <div class="hero-body">
            <div class="hero-title">${esc(ch.name)}</div>
            <div class="hero-meta">${STARS(ch.rating)}<span>${ch.rating.toFixed(1)}</span>
              <span class="dot">&middot;</span><span>${esc(ch.reviews)} ratings</span>
              <span class="pill ${ch.kind === 'avod' ? 'free' : 'sub'}">${ch.kind === 'avod' ? 'Free with ads' : 'Subscription'}</span>
              ${State.installed.includes(ch.id) ? '<span class="pill hd">Added</span>' : ''}</div>
            <div class="hero-desc">${esc(ch.desc)}</div>
          </div>`;
        return;
      }
      if (node.dataset.live) {
        const live = LIVE_CHANNELS.find(c => `${c.num}` === node.dataset.live);
        const now = programmeAt(live, new Date());
        hero.innerHTML = `
          <div class="hero-art">${channelArt(CH[live.id])}</div>
          <div class="hero-body">
            <div class="hero-title">${esc(now.title)}</div>
            <div class="hero-meta"><span class="pill live">Live</span>
              <span>${esc(live.num)} ${esc(live.name)}</span><span class="dot">&middot;</span>
              <span>${esc(now.window)}</span></div>
            <div class="hero-desc">${esc(now.desc)}</div>
          </div>`;
      }
    }

    const api = {
      onFocus(node) {
        rail.onFocus(node);
        paintHero(node);
      },
      select(node) {
        if (rail.select(node)) return;
        if (node.dataset.title) { go('title', node.dataset.title); return; }
        if (node.dataset.chan) { go('channel', { id: node.dataset.chan }); return; }
        if (node.dataset.live) { go('live', { channel: node.dataset.live }); }
      },
      back() { return false; },
      refocus() { if (!Focus.el || !focusables().includes(Focus.el)) focusFirst(host); },
    };
    return api;
  },
});

/* ------------------------------------------------------------ live tiles */

function liveTileHTML(live, fid, first = false) {
  const now = programmeAt(live, new Date());
  return `<div class="poster wide f lift" data-fid="${fid}" data-live="${live.num}"${first ? ' data-first' : ''}>
      ${keyArt({ id: `live-${live.num}`, title: now.title }, { sub: `${live.num} ${live.name}` })}
      <span class="badge" style="background:rgba(200,30,30,.85)">LIVE</span>
    </div>`;
}

/* --------------------------------------------------------- the title page */

defineScreen('title', {
  render(host, id) {
    const item = TITLE_BY_ID[id];
    const price = priceLabel(item.price);
    const services = item.on.map(cid => CH[cid]).filter(Boolean);
    const resume = State.continueWatching.find(e => e.id === id);

    host.innerHTML = `
      <div class="page">
        <div class="wall"></div>
        ${topbarHTML()}
        <div class="chpage">
          <div class="cp-art">${keyArt(item, { withText: false })}</div>
          <div style="min-width:0;flex:1">
            <h1>${esc(item.title)}</h1>
            <div class="cp-meta">
              <span>${item.year}</span><span>&middot;</span>
              <span class="pill rating">${esc(item.rated)}</span>
              <span>${esc(item.genre)}</span><span>&middot;</span>
              <span>${item.kind === 'series' ? 'Series' : fmtDur(item.mins * 60)}</span>
              <span class="pill ${price.cls}">${esc(price.text)}</span>
              <span class="pill hd">HD</span>
            </div>
            <div class="cp-desc">${esc(item.desc)}</div>
            <div class="cp-actions">
              <button class="btn f wide" data-fid="play" data-play="1" data-first>
                ${resume ? `Resume from ${fmtDur(item.mins * 60 * resume.pct / 100)}` : 'Play'}
              </button>
              ${resume ? '<button class="btn f" data-fid="restart" data-play="restart">Start over</button>' : ''}
            </div>
            <div class="t-micro" style="margin-top:26px">Watch on</div>
            <div style="max-width:520px;margin-top:6px">
              ${services.map((ch, i) => `
                <div class="watch-row f" data-fid="on-${ch.id}" data-on="${ch.id}">
                  <span class="wr-art">${channelArt(ch, 'sz-s')}</span>
                  <span style="min-width:0">
                    <span style="display:block;font-size:21px">${esc(ch.name)}</span>
                    <span class="t-small">${State.installed.includes(ch.id) ? 'Added to your home screen' : 'Not added yet'}</span>
                  </span>
                  <span class="pill ${price.cls}" style="margin-left:auto">${esc(price.text)}</span>
                </div>`).join('')}
            </div>
          </div>
        </div>
      </div>`;

    return {
      select(node) {
        if (node.dataset.play) {
          const from = node.dataset.play === 'restart' ? 0 : (resume ? resume.pct : 0);
          playTitle(item, services[0] ? services[0].id : 'beacon', from);
          return;
        }
        if (node.dataset.on) {
          const ch = CH[node.dataset.on];
          if (!State.installed.includes(ch.id)) { go('channel', { id: ch.id }); return; }
          playTitle(item, ch.id, resume ? resume.pct : 0);
        }
      },
    };
  },
});
