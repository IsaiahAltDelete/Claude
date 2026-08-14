/* ===========================================================================
   Opening a channel, and playing something.

   A channel shows its splash, then its own screens — brand bar, rails, its own
   idea of navigation — and playback is a real player with trick play, an
   options panel on *, and the advanced video statistics overlay a support call
   asks for when a picture looks soft or keeps stopping.
   =========================================================================== */

'use strict';

/** Open a channel from the home grid, the store or a search result. */
function launchChannel(id) {
  const ch = CH[id];
  if (!ch) return;
  if (!State.installed.includes(id)) { go('channel', { id }); return; }
  if (!State.seenNew.includes(id)) { State.seenNew.push(id); save(); }
  go('chapp', { id });
}

/* ------------------------------------------------------- inside a channel */

const CHAPP_TABS = ['Home', 'Series', 'Movies', 'Search', 'Settings'];

defineScreen('chapp', {
  render(host, arg) {
    const ch = CH[arg.id];
    const mine = titlesOn(ch.id);
    const splashMs = 1300;

    host.innerHTML = `
      <div class="chapp">
        <div class="wall"></div>
        <div class="chsplash" id="ch-splash" style="--c1:${ch.c1};--c2:${ch.c2}">
          <div class="cs-logo">${channelArt(ch, '')}</div>
          <div class="cs-bar"><i></i></div>
        </div>
      </div>`;

    const root = host.querySelector('.chapp');
    let api = { select() {}, back() { return false; } };

    /* A channel that cannot reach the internet says so itself, inside its own
       branding, rather than throwing a system dialog — which is exactly what
       makes this one confusing on a real support call. */
    function showOffline() {
      root.innerHTML = `
        <div class="cherr" style="--c1:${ch.c1};--c2:${ch.c2}">
          <div class="ce-inner">
            <h2>${esc(ch.name)} can't connect</h2>
            <p>This channel could not reach its servers. Check that this device is
              connected to the internet, then try again.</p>
            <div class="ce-actions">
              <button class="btn f" data-fid="retry" data-act="retry" data-first>Try again</button>
              <button class="btn f" data-fid="net" data-act="net">Network settings</button>
              <button class="btn f" data-fid="exit" data-act="exit">Exit channel</button>
            </div>
          </div>
        </div>`;
      api = {
        select(node) {
          if (node.dataset.act === 'retry') { renderTop(); return; }
          if (node.dataset.act === 'net') { go('settings', { path: ['network'] }); return; }
          goHome();
        },
        back() { goHome(); return true; },
      };
      focusFirst(host);
    }

    function showChannel() {
      const featured = mine[0] || TITLES[0];
      const rails = [
        { title: `New on ${ch.name}`, shape: 'tall', items: mine.length ? mine : seededOrder(TITLES, ch.id).slice(0, 8) },
        { title: 'Continue watching', shape: 'wide', items: State.continueWatching.map(e => TITLE_BY_ID[e.id]).filter(Boolean) },
        { title: 'Recommended for you', shape: 'tall', items: seededOrder(TITLES, `${ch.id}-rec`).slice(0, 10) },
        { title: 'Browse by genre', shape: 'wide', items: seededOrder(TITLES, `${ch.id}-genre`).slice(0, 8) },
      ].filter(r => r.items.length);

      root.innerHTML = `
        <div class="chapp-bar">
          <span class="cb-logo">${channelArt(ch, 'sz-s')}</span>
          <span class="cb-nav">
            ${CHAPP_TABS.map((t, i) => `<span class="cbn f${i === 0 ? ' on' : ''}" data-fid="tab-${t}" data-tab="${t}">${t}</span>`).join('')}
          </span>
          <span class="cb-acct">${State.account.linked ? esc(State.account.email) : 'Not signed in'}</span>
        </div>
        <div class="hero" id="ch-hero"></div>
        <div class="rails scroll-y"><div class="rails-inner">
          ${rails.map((rail, ri) => `
            <section class="rail">
              <h2 class="rail-title">${esc(rail.title)}</h2>
              <div class="rail-track scroll-x">
                ${rail.items.map((item, ii) => posterHTML(item, rail.shape, `c${ri}-${ii}`, ri === 0 && ii === 0)).join('')}
              </div>
            </section>`).join('')}
        </div></div>`;

      const hero = root.querySelector('#ch-hero');

      function paintHero(item) {
        const price = priceLabel(item.price);
        hero.innerHTML = `
          <div class="hero-art">${keyArt(item, { withText: false })}</div>
          <div class="hero-body">
            <div class="hero-title">${esc(item.title)}</div>
            <div class="hero-meta"><span>${item.year}</span><span class="dot">&middot;</span>
              <span class="pill rating">${esc(item.rated)}</span><span>${esc(item.genre)}</span>
              <span class="pill ${price.cls}">${esc(price.text)}</span></div>
            <div class="hero-desc">${esc(item.desc)}</div>
          </div>`;
      }
      paintHero(featured);

      api = {
        onFocus(node) {
          if (node.dataset.title) paintHero(TITLE_BY_ID[node.dataset.title]);
        },
        select(node) {
          if (node.dataset.tab) {
            $$('.cbn', root).forEach(t => t.classList.toggle('on', t === node));
            toast(`${ch.name}: ${node.dataset.tab}`);
            return;
          }
          if (node.dataset.title) {
            const item = TITLE_BY_ID[node.dataset.title];
            const entry = State.continueWatching.find(e => e.id === item.id);
            playTitle(item, ch.id, entry ? entry.pct : 0);
          }
        },
        back() { return false; },
        refocus() { if (!Focus.el || !focusables().includes(Focus.el)) focusFirst(host); },
      };
      focusFirst(host);
    }

    setTimeout(() => {
      if (!UI.stack.length || UI.stack[UI.stack.length - 1].id !== 'chapp') return;
      if (!State.network.connected || !State.network.internet) showOffline();
      else showChannel();
    }, splashMs);

    return {
      select(node) { return api.select && api.select(node); },
      onFocus(node) { return api.onFocus && api.onFocus(node); },
      back() { return api.back ? api.back() : false; },
      key(k) { return api.key ? api.key(k) : false; },
      refocus() { if (api.refocus) api.refocus(); },
    };
  },
});

/* -------------------------------------------------------------- the player */

function playTitle(item, channelId, startPct = 0) {
  go('player', { kind: 'vod', titleId: item.id, channelId, startPct });
}

function playLive(live, prog) {
  go('player', { kind: 'live', live, prog, channelId: live.id });
}

const AUDIO_TRACKS = ['English (Stereo)', 'English (Dolby Digital Plus 5.1)', 'Español', 'Audio description'];
const SUB_TRACKS = ['Off', 'English', 'English (SDH)', 'Español'];
const QUALITIES = ['Auto', '1080p', '720p', '480p'];

defineScreen('player', {
  render(host, arg) {
    const item = arg.kind === 'vod' ? TITLE_BY_ID[arg.titleId] : null;
    const ch = CH[arg.channelId];
    const duration = item ? item.mins * 60 : arg.prog.mins * 60;
    const title = item ? item.title : arg.prog.title;
    const subtitle = item
      ? `${item.year} · ${item.rated} · ${ch ? ch.name : ''}`
      : `${arg.live.num} ${arg.live.name} · ${arg.prog.window}`;

    let position = arg.kind === 'vod' ? Math.round(duration * (arg.startPct || 0) / 100) : 0;
    let playing = true;
    let speed = 0;                 /* -3..3, 0 is normal */
    let barTimer = null;
    let stats = false;
    let audio = 1;
    let subs = 0;
    let quality = 0;
    let buffering = true;

    host.innerHTML = `
      <div class="player">
        ${sceneArt(`${arg.kind}-${title}`)}
        <div class="buffering" id="pl-buf">
          <div style="text-align:center">
            <div class="spin" style="margin:0 auto"></div>
            <div class="pct">Loading ${esc(ch ? ch.name : 'channel')}<span class="dots"></span></div>
          </div>
        </div>
        <div class="trick" id="pl-trick"></div>
      </div>`;

    const trick = host.querySelector('#pl-trick');
    const buf = host.querySelector('#pl-buf');

    function statsHTML() {
      if (!stats) return '';
      const res = quality === 0 ? (State.display.hdr ? '3840x2160' : '1920x1080') : `${QUALITIES[quality] === '1080p' ? '1920x1080' : QUALITIES[quality] === '720p' ? '1280x720' : '854x480'}`;
      const bitrate = quality === 0 ? 15800 : quality === 1 ? 8000 : quality === 2 ? 4200 : 1800;
      const drop = State.network.signal <= 2 ? 42 : 0;
      return `<div class="vstats">
          <h4>Advanced video statistics</h4>
          <div class="vs-row"><span>Video resolution</span><span>${res}</span></div>
          <div class="vs-row"><span>Video bitrate</span><span>${bitrate} kbps</span></div>
          <div class="vs-row"><span>Video codec</span><span>HEVC Main 10</span></div>
          <div class="vs-row"><span>Audio</span><span>${esc(AUDIO_TRACKS[audio])}</span></div>
          <div class="vs-row"><span>Dropped frames</span><span>${drop}</span></div>
          <div class="vs-row"><span>Buffer</span><span>${(6.4 - (4 - State.network.signal) * 1.4).toFixed(1)} s</span></div>
          <div class="vs-row"><span>Wi-Fi signal</span><span>${State.network.signal} of 4 bars</span></div>
          <div class="vs-row"><span>HDCP</span><span>2.2 authenticated</span></div>
        </div>`;
    }

    function paint() {
      const remaining = Math.max(0, duration - position);
      const pct = arg.kind === 'live' ? 100 : clamp((position / duration) * 100, 0, 100);
      const speedText = speed === 0 ? '' : `<span class="tk-speed">${speed > 0 ? '▶▶' : '◀◀'} ${Math.abs(speed)}x</span>`;

      trick.innerHTML = `
        <div class="tk-title">${esc(title)}</div>
        <div class="tk-sub">${esc(subtitle)}</div>
        ${arg.kind === 'live'
          ? `<div class="tk-state"><span class="pill live">LIVE</span>
              <span>${esc(arg.prog.window)}</span>${speedText}</div>`
          : `<div class="tk-barwrap">
              <span class="tk-time num">${fmtDur(position)}</span>
              <span class="tk-bar"><i style="width:${pct}%"></i><span class="thumb" style="left:${pct}%"></span></span>
              <span class="tk-time right num">-${fmtDur(remaining)}</span>
            </div>
            <div class="tk-state">${ICON(playing && speed === 0 ? 'play' : speed !== 0 ? (speed > 0 ? 'forward' : 'rewind') : 'pause')}
              <span>${speed !== 0 ? '' : playing ? 'Playing' : 'Paused'}</span>${speedText}
              <span style="margin-left:auto;color:var(--tx-3);font-size:17px">
                ${esc(QUALITIES[quality])} &middot; ${subs === 0 ? 'CC off' : `CC ${SUB_TRACKS[subs]}`} &middot; Press ✱ for options
              </span>
            </div>`}`;

      const old = host.querySelector('.vstats');
      if (old) old.remove();
      if (stats) host.querySelector('.player').insertAdjacentHTML('beforeend', statsHTML());
    }

    function showBar(sticky = false) {
      trick.classList.remove('away');
      clearTimeout(barTimer);
      if (!sticky && playing && speed === 0) barTimer = setTimeout(() => trick.classList.add('away'), 3600);
    }

    /* Playback clock. Trick-play speeds move the position rather than the
       clock, so 3x rewind really does run backwards through the bar. */
    const tick = setInterval(() => {
      if (buffering) return;
      if (speed !== 0) {
        position = clamp(position + speed * 8, 0, duration);
        if (position <= 0 || position >= duration) { speed = 0; playing = true; }
        paint();
        return;
      }
      if (!playing) return;
      position = Math.min(duration, position + 1);
      if (arg.kind === 'vod' && position >= duration) { playing = false; finish(); }
      paint();
    }, 1000);

    function remember() {
      if (arg.kind !== 'vod') return;
      const pct = Math.round((position / duration) * 100);
      State.continueWatching = State.continueWatching.filter(e => e.id !== item.id);
      if (pct > 2 && pct < 96) State.continueWatching.unshift({ id: item.id, pct });
      State.continueWatching = State.continueWatching.slice(0, 8);
      save();
    }

    function finish() {
      remember();
      paint();
      showBar(true);
    }

    function exit() {
      clearInterval(tick);
      remember();
      if (!back()) goHome();
    }

    /* Start-up buffer, then play. */
    setTimeout(() => {
      buffering = false;
      buf.remove();
      paint();
      showBar();
    }, 1400);

    paint();

    const api = {
      select() { api.key('play'); },

      key(k) {
        switch (k) {
          case 'play':
            if (speed !== 0) { speed = 0; playing = true; }
            else playing = !playing;
            paint(); showBar(!playing);
            return true;
          case 'ok':
            if (speed !== 0) { speed = 0; playing = true; }
            else playing = !playing;
            paint(); showBar(!playing);
            return true;
          case 'fwd':
            if (arg.kind === 'live') { toast('Live channels cannot be fast-forwarded'); return true; }
            speed = speed >= 3 ? 0 : Math.max(1, speed + 1);
            playing = speed === 0;
            paint(); showBar(true);
            return true;
          case 'rew':
            speed = speed <= -3 ? 0 : Math.min(-1, speed - 1);
            playing = speed === 0;
            paint(); showBar(true);
            return true;
          case 'replay':
            position = Math.max(0, position - 10);
            speed = 0; playing = true;
            paint(); showBar();
            toast('Instant replay — back 10 seconds');
            return true;
          case 'left':
            if (arg.kind === 'live') return true;
            position = Math.max(0, position - 10);
            paint(); showBar();
            return true;
          case 'right':
            if (arg.kind === 'live') return true;
            position = Math.min(duration, position + 10);
            paint(); showBar();
            return true;
          case 'up': case 'down':
            showBar(true);
            return true;
          case 'back':
            exit();
            return true;
          default:
            return false;
        }
      },

      star() {
        showBar(true);
        const panel = el('div', 'playopts');
        const rows = [
          { id: 'cc', label: 'Closed captioning', val: SUB_TRACKS[subs] },
          { id: 'audio', label: 'Audio track', val: AUDIO_TRACKS[audio] },
          { id: 'quality', label: 'Video quality', val: QUALITIES[quality] },
          { id: 'stats', label: 'Advanced video statistics', val: stats ? 'On' : 'Off' },
          { id: 'restart', label: 'Start over', val: '' },
        ];
        panel.innerHTML = `<h3>Options</h3>${rows.map((r, i) => `
          <div class="row f" data-fid="po-${r.id}" data-po="${r.id}"${i === 0 ? ' data-first' : ''}>
            ${esc(r.label)}${r.val ? `<span class="row-val">${esc(r.val)}</span>` : ''}
          </div>`).join('')}
          <div class="t-small" style="position:absolute;left:30px;bottom:34px;right:30px">
            Press <b>Back</b> to close. Options set here last until the channel is closed.</div>`;

        openOverlay(panel, {
          select(node) {
            const which = node.dataset.po;
            if (which === 'cc') subs = (subs + 1) % SUB_TRACKS.length;
            if (which === 'audio') audio = (audio + 1) % AUDIO_TRACKS.length;
            if (which === 'quality') quality = (quality + 1) % QUALITIES.length;
            if (which === 'stats') stats = !stats;
            if (which === 'restart') { position = 0; playing = true; speed = 0; closeOverlay(); paint(); showBar(); return; }
            closeOverlay();
            paint();
            api.star();
          },
        }, { scrim: false });
      },

      back() { exit(); return true; },
      refocus() {},
    };

    return api;
  },
});
