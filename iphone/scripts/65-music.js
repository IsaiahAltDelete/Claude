/* ===========================================================================
   Music.

   A real player, minus the audio: a catalogue of albums and tracks, a queue,
   shuffle and repeat, a Now Playing screen with a running timer and a scrubber,
   and a mini player that follows you around the app. Playback advances a
   position counter rather than decoding a file, so nothing has to be shipped
   or fetched.
   =========================================================================== */

/* [album, artist, year, genre, [ [track title, seconds], … ] ] */
const ALBUMS = [
  ['Longer Days', 'Vera Quill', 2024, 'Alternative', [
    ['Morning Signal', 214], ['Longer Days', 248], ['Copper Wire', 191], ['Held Note', 267],
    ['Two Rooms', 203], ['Last Call Home', 289]]],
  ['Night Shift', 'The Bench', 2023, 'Rock', [
    ['Third Floor', 226], ['Night Shift', 241], ['Tape Hiss', 178], ['Runbook', 254],
    ['Escalation', 232], ['Green Light', 198]]],
  ['Quiet Systems', 'Anneke Ford', 2025, 'Electronic', [
    ['Cold Start', 305], ['Quiet Systems', 288], ['Handshake', 246], ['Packet Loss', 262],
    ['Uptime', 331]]],
  ['Field Notes', 'Marisol Vane', 2022, 'Folk', [
    ['Palm Avenue', 187], ['Field Notes', 219], ['Winter Park', 205], ['Ledger', 176],
    ['Long Way Round', 243], ['Small Fixes', 198], ['Closing Ticket', 264]]],
  ['Static Collective', 'Static Collective', 2021, 'Hip-Hop', [
    ['Intake', 158], ['Static', 212], ['Second Opinion', 197], ['Bench Triage', 233],
    ['Reset', 186]]],
  ['Harbor Lights', 'Odessa Bloom', 2020, 'Pop', [
    ['Harbor Lights', 208], ['Ferry', 195], ['Salt Air', 221], ['Bright Room', 189],
    ['Undertow', 246]]],
  ['Analog Tuesday', 'Kit Marlow', 2019, 'Jazz', [
    ['Analog Tuesday', 312], ['Slow Freight', 278], ['Blue Bench', 341], ['After Hours', 296]]],
  ['Signal Chain', 'Vera Quill', 2021, 'Alternative', [
    ['Signal Chain', 232], ['Half Duplex', 208], ['Repeater', 251], ['Ground Loop', 219],
    ['Terminator', 197]]],
];

const PLAYLISTS = [
  ['Chill Mix', 'Updated Monday', ['Quiet Systems', 'Field Notes', 'Analog Tuesday']],
  ['Get Up!', 'Updated Monday', ['Night Shift', 'Static Collective', 'Harbor Lights']],
  ['New Music Mix', 'Updated Friday', ['Longer Days', 'Quiet Systems', 'Signal Chain']],
  ['Late Night', 'Made for you', ['Analog Tuesday', 'Quiet Systems', 'Longer Days']],
  ['Road Trip', 'Yours', ['Harbor Lights', 'Field Notes', 'Night Shift']],
];

const albumByTitle = title => ALBUMS.find(album => album[0] === title);

/** Flat track list: every track with a stable id and its album context. */
function allTracks() {
  return ALBUMS.flatMap(([album, artist, year, genre, tracks]) =>
    tracks.map(([title, seconds], index) => ({
      id: `${album}:${index}`,
      title,
      seconds,
      album,
      artist,
      year,
      genre,
      number: index + 1,
    })));
}

const trackById = id => allTracks().find(track => track.id === id);
const albumTracks = title => allTracks().filter(track => track.album === title);

function MU() {
  return slice('music', () => ({
    library: ['Longer Days', 'Night Shift', 'Field Notes', 'Harbor Lights'],
    loved: [],
    recent: ['Longer Days', 'Quiet Systems', 'Field Notes'],
    queue: [],
    index: 0,
    playing: false,
    position: 0,
    shuffle: false,
    repeat: 'off',   // off | all | one
    volume: 0.7,
    tab: 'Listen Now',
  }));
}

const nowPlaying = () => trackById(MU().queue[MU().index]) || null;

/** Load a queue and start at one track. Everything else follows from state. */
function playQueue(ids, startIndex = 0) {
  const state = MU();
  state.queue = ids;
  state.index = Math.max(0, Math.min(ids.length - 1, startIndex));
  state.position = 0;
  state.playing = true;
  save();
  musicTick();
  paintMusicChrome();
  const track = nowPlaying();
  if (track) island(SF.music, '#e8305f', track.title, `${track.artist} — ${track.album}`, 2200);
}

function musicStep(delta) {
  const state = MU();
  if (!state.queue.length) return;
  if (state.repeat === 'one' && delta > 0) { state.position = 0; save(); paintMusicChrome(); return; }
  let next = state.index + delta;
  if (next >= state.queue.length) {
    if (state.repeat !== 'all') { state.playing = false; state.index = state.queue.length - 1; state.position = 0; save(); paintMusicChrome(); return; }
    next = 0;
  }
  if (next < 0) next = 0;
  state.index = next;
  state.position = 0;
  save();
  paintMusicChrome();
}

/* One global timer drives the position, so the mini player, the Now Playing
   sheet and the island all read from the same clock. */
let musicTimer = null;
function musicTick() {
  if (musicTimer) return;
  musicTimer = setInterval(() => {
    const state = MU();
    if (!state.playing) return;
    const track = nowPlaying();
    if (!track) { state.playing = false; return; }
    state.position += 1;
    if (state.position >= track.seconds) musicStep(1);
    paintMusicChrome(true);
  }, 1000);
}

/* Everything that shows playback state registers a painter here. */
const musicPainters = new Set();
function paintMusicChrome(positionOnly = false) {
  musicPainters.forEach(painter => {
    try { painter(positionOnly); } catch (error) { musicPainters.delete(painter); }
  });
}

function musicArt(title, size) {
  return `<div style="width:${size}px;height:${size}px;border-radius:${size > 90 ? 10 : 5}px;flex:none;
    background-image:url('${artURI(`album:${title}`, { w: 400, h: 400, kind: 'album' })}');background-size:cover;
    box-shadow:0 ${size > 90 ? 14 : 4}px ${size > 90 ? 34 : 10}px rgba(0,0,0,.4)"></div>`;
}

defineApp({
  id: 'music',
  name: 'Music',
  bg: 'linear-gradient(180deg,#fa5f6d,#e8305f)',
  glyph: `<div style="display:grid;place-items:center;height:100%;color:#fff">${sf('<path d="M9 18V6.4l10-2v11.2"/><ellipse cx="6.6" cy="18" rx="2.6" ry="2.2" fill="currentColor" stroke="none"/><ellipse cx="16.6" cy="15.6" rx="2.6" ry="2.2" fill="currentColor" stroke="none"/>', { size: 32 })}</div>`,
  mount(win, inst) {
    MU();
    musicTick();
    const nav = new Nav(win);
    inst.nav = nav;

    /* Mini player sits above the tab bar and is shared across tabs. */
    const mini = el('div');
    mini.style.cssText = `position:absolute;left:10px;right:10px;bottom:96px;height:60px;border-radius:14px;
      background:rgba(58,58,62,.86);backdrop-filter:blur(24px);display:none;align-items:center;gap:10px;
      padding:0 12px;z-index:20;box-shadow:0 6px 20px rgba(0,0,0,.35);cursor:pointer`;
    win.appendChild(mini);

    const tabbar = el('div', 'tabbar');
    const TABS = [['Listen Now', SF.star], ['Browse', SF.grid], ['Library', SF.music], ['Search', SF.magnifier]];
    const setTab = name => {
      MU().tab = name;
      save();
      nav.setRoot(name === 'Listen Now' ? musicListenNowView()
        : name === 'Browse' ? musicBrowseView()
          : name === 'Library' ? musicLibraryView() : musicSearchView());
      nav.top._page.appendChild(tabbar);
      paintTabs();
    };
    const paintTabs = () => {
      tabbar.innerHTML = '';
      TABS.forEach(([name, glyph]) => {
        const button = el('button', MU().tab === name ? 'on' : '', `${glyph}<span>${name}</span>`);
        button.onclick = () => setTab(name);
        tabbar.appendChild(button);
      });
    };

    const paintMini = positionOnly => {
      const state = MU();
      const track = nowPlaying();
      if (!track) { mini.style.display = 'none'; return; }
      mini.style.display = 'flex';
      if (positionOnly && mini.querySelector('.mp-bar')) {
        mini.querySelector('.mp-bar').style.width = `${(state.position / track.seconds) * 100}%`;
        return;
      }
      mini.innerHTML = `${musicArt(track.album, 44)}
        <div style="flex:1;min-width:0">
          <div style="font-size:calc(14px * var(--tsize));font-weight:600;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(track.title)}</div>
          <div style="font-size:calc(12px * var(--tsize));color:rgba(255,255,255,.6);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(track.artist)}</div>
          <div style="height:2px;border-radius:1px;background:rgba(255,255,255,.2);margin-top:4px">
            <div class="mp-bar" style="height:100%;width:${(state.position / track.seconds) * 100}%;background:#fff;border-radius:1px"></div></div>
        </div>`;
      const play = el('button', '', state.playing ? '❚❚' : '▶');
      play.style.cssText = 'color:#fff;font-size:calc(17px * var(--tsize));width:34px;height:34px;flex:none';
      play.onclick = event => { event.stopPropagation(); state.playing = !state.playing; save(); paintMusicChrome(); };
      const next = el('button', '', '⏭');
      next.style.cssText = 'color:#fff;font-size:calc(16px * var(--tsize));width:32px;height:34px;flex:none';
      next.onclick = event => { event.stopPropagation(); musicStep(1); };
      mini.append(play, next);
      mini.onclick = () => nowPlayingSheet();
    };
    musicPainters.add(paintMini);
    inst.paintMini = paintMini;

    setTab(MU().tab || 'Listen Now');
    paintMini();
  },
  onShow(inst) { inst.nav.refresh(); inst.paintMini(); },
});

/* ------------------------------------------------------------- Listen Now */

function musicListenNowView() {
  return {
    title: 'Listen Now',
    largeTitle: true,
    build(body, nav) {
      const state = MU();

      body.appendChild(cardHeader('Top Picks for You'));
      const hero = el('div', 'hscroll');
      PLAYLISTS.slice(0, 3).forEach(([name, subtitle, albums]) => {
        const card2 = el('div', 'hcard');
        card2.style.minWidth = '272px';
        card2.innerHTML = `<div style="height:180px;border-radius:14px;overflow:hidden;position:relative;
            background-image:url('${artURI(`pl:${name}`, { w: 400, h: 300, kind: 'album' })}');background-size:cover">
            <div style="position:absolute;inset:auto 0 0;padding:12px;background:linear-gradient(transparent,rgba(0,0,0,.75));color:#fff">
              <div style="font-size:calc(11px * var(--tsize));opacity:.8;letter-spacing:.06em">${esc(subtitle.toUpperCase())}</div>
              <div style="font-size:calc(19px * var(--tsize));font-weight:700">${esc(name)}</div></div></div>`;
        card2.onclick = () => nav.push(playlistView(name, subtitle, albums));
        hero.appendChild(card2);
      });
      body.appendChild(hero);

      body.appendChild(cardHeader('Recently Played'));
      const recent = el('div', 'hscroll');
      state.recent.map(albumByTitle).filter(Boolean).forEach(album => {
        const tile = el('div', 'hcard');
        tile.style.minWidth = '150px';
        tile.innerHTML = `${musicArt(album[0], 150)}
          <div style="margin-top:8px;font-size:calc(13px * var(--tsize));font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(album[0])}</div>
          <div style="font-size:calc(12px * var(--tsize));color:var(--txt2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(album[1])}</div>`;
        tile.onclick = () => nav.push(albumView(album[0]));
        recent.appendChild(tile);
      });
      body.appendChild(recent);

      group(body, {
        header: 'Made for You',
        rows: PLAYLISTS.map(([name, subtitle, albums]) => ({
          icon: SF.music,
          iconBg: '#e8305f',
          label: name,
          sub: subtitle,
          onClick: () => nav.push(playlistView(name, subtitle, albums)),
        })),
      });
      body.appendChild(h('<div style="height:170px"></div>'));
    },
  };
}

/* ----------------------------------------------------------------- Browse */

function musicBrowseView() {
  return {
    title: 'Browse',
    largeTitle: true,
    build(body, nav) {
      const genres = [...new Set(ALBUMS.map(album => album[3]))];

      body.appendChild(cardHeader('New Releases'));
      const strip = el('div', 'hscroll');
      [...ALBUMS].sort((a, b) => b[2] - a[2]).slice(0, 5).forEach(album => {
        const tile = el('div', 'hcard');
        tile.style.minWidth = '164px';
        tile.innerHTML = `${musicArt(album[0], 164)}
          <div style="margin-top:8px;font-size:calc(13px * var(--tsize));font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(album[0])}</div>
          <div style="font-size:calc(12px * var(--tsize));color:var(--txt2)">${esc(album[1])} · ${album[2]}</div>`;
        tile.onclick = () => nav.push(albumView(album[0]));
        strip.appendChild(tile);
      });
      body.appendChild(strip);

      group(body, {
        header: 'Browse by Category',
        rows: genres.map(genre => ({
          icon: SF.music,
          iconBg: '#e8305f',
          label: genre,
          value: `${ALBUMS.filter(album => album[3] === genre).length}`,
          onClick: () => nav.push({
            title: genre,
            shortTitle: 'Browse',
            build(inner, innerNav) {
              group(inner, {
                rows: ALBUMS.filter(album => album[3] === genre).map(album => ({
                  labelHTML: `<div>${esc(album[0])}</div><div class="sub">${esc(album[1])} · ${album[2]}</div>`,
                  onClick: () => innerNav.push(albumView(album[0])),
                })),
              });
              inner.appendChild(h('<div style="height:170px"></div>'));
            },
          }),
        })),
      });
      body.appendChild(h('<div style="height:170px"></div>'));
    },
  };
}

/* ---------------------------------------------------------------- Library */

function musicLibraryView() {
  return {
    title: 'Library',
    largeTitle: true,
    right: [{ html: SF.plusCircle, onClick: nav => actionSheet('Add to Library', ALBUMS
      .filter(album => !MU().library.includes(album[0]))
      .map(album => ({
        text: `${album[0]} — ${album[1]}`,
        onClick: () => { MU().library.push(album[0]); save(); nav.refresh(); toast(`${album[0]} added`); },
      }))) }],
    build(body, nav) {
      const state = MU();
      group(body, {
        rows: [
          { label: 'Playlists', icon: SF.music, iconBg: '#e8305f', onClick: () => nav.push({
            title: 'Playlists',
            shortTitle: 'Library',
            build(inner, innerNav) {
              group(inner, { rows: PLAYLISTS.map(([name, subtitle, albums]) => ({
                label: name, sub: subtitle, onClick: () => innerNav.push(playlistView(name, subtitle, albums)),
              })) });
              inner.appendChild(h('<div style="height:170px"></div>'));
            },
          }) },
          { label: 'Artists', icon: SF.person, iconBg: '#e8305f', onClick: () => nav.push({
            title: 'Artists',
            shortTitle: 'Library',
            build(inner, innerNav) {
              const artists = [...new Set(ALBUMS.map(album => album[1]))].sort();
              group(inner, { rows: artists.map(artist => ({
                label: artist,
                sub: `${ALBUMS.filter(album => album[1] === artist).length} album(s)`,
                onClick: () => innerNav.push({
                  title: artist,
                  shortTitle: 'Artists',
                  build(pane, paneNav) {
                    group(pane, { rows: ALBUMS.filter(album => album[1] === artist).map(album => ({
                      labelHTML: `<div>${esc(album[0])}</div><div class="sub">${album[2]} · ${esc(album[3])}</div>`,
                      onClick: () => paneNav.push(albumView(album[0])),
                    })) });
                    pane.appendChild(h('<div style="height:170px"></div>'));
                  },
                }),
              })) });
              inner.appendChild(h('<div style="height:170px"></div>'));
            },
          }) },
          { label: 'Songs', icon: SF.music, iconBg: '#e8305f', onClick: () => nav.push({
            title: 'Songs',
            shortTitle: 'Library',
            build(inner) {
              const tracks = allTracks().filter(track => state.library.includes(track.album))
                .sort((a, b) => a.title.localeCompare(b.title));
              group(inner, { rows: tracks.map((track, index) => ({
                labelHTML: `<div>${esc(track.title)}</div><div class="sub">${esc(track.artist)} · ${esc(track.album)}</div>`,
                value: clockDuration(track.seconds),
                chevron: false,
                onClick: () => playQueue(tracks.map(t => t.id), index),
              })) });
              inner.appendChild(h('<div style="height:170px"></div>'));
            },
          }) },
          { label: 'Loved', icon: SF.star, iconBg: '#e8305f', value: String(state.loved.length), onClick: () => nav.push({
            title: 'Loved',
            shortTitle: 'Library',
            build(inner) {
              const tracks = state.loved.map(trackById).filter(Boolean);
              if (!tracks.length) { inner.appendChild(emptyState(SF.star, 'Nothing Loved Yet', 'Tap the star on a song to add it.')); return; }
              group(inner, { rows: tracks.map((track, index) => ({
                labelHTML: `<div>${esc(track.title)}</div><div class="sub">${esc(track.artist)}</div>`,
                value: clockDuration(track.seconds),
                chevron: false,
                onClick: () => playQueue(tracks.map(t => t.id), index),
              })) });
            },
          }) },
        ],
      });

      body.appendChild(cardHeader('Recently Added'));
      const grid = el('div');
      grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:16px 14px;padding:4px 16px';
      state.library.map(albumByTitle).filter(Boolean).forEach(album => {
        const tile = el('div');
        tile.style.cursor = 'pointer';
        tile.innerHTML = `<div style="aspect-ratio:1;border-radius:8px;overflow:hidden;
            background-image:url('${artURI(`album:${album[0]}`, { w: 400, h: 400, kind: 'album' })}');background-size:cover"></div>
          <div style="margin-top:7px;font-size:calc(13px * var(--tsize));font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(album[0])}</div>
          <div style="font-size:calc(12px * var(--tsize));color:var(--txt2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(album[1])}</div>`;
        tile.onclick = () => nav.push(albumView(album[0]));
        tile.oncontextmenu = event => {
          event.preventDefault();
          actionSheet(album[0], [{ text: 'Remove from Library', style: 'red', onClick: () => {
            state.library = state.library.filter(title => title !== album[0]);
            save();
            nav.refresh();
          } }]);
        };
        grid.appendChild(tile);
      });
      body.appendChild(grid);
      body.appendChild(h('<div style="height:170px"></div>'));
    },
  };
}

/* ----------------------------------------------------------------- Search */

function musicSearchView() {
  return {
    title: 'Search',
    largeTitle: true,
    build(body, nav) {
      let query = '';
      const results = el('div');
      body.appendChild(searchField('Artists, Songs, Albums', value => { query = value; render(); }));
      body.appendChild(results);

      function render() {
        results.innerHTML = '';
        const needle = query.trim().toLowerCase();
        if (!needle) {
          const genres = [...new Set(ALBUMS.map(album => album[3]))];
          results.appendChild(cardHeader('Browse Categories'));
          const grid = el('div');
          grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:0 16px';
          genres.forEach((genre, index) => {
            const tile = el('button', '', esc(genre));
            tile.style.cssText = `height:76px;border-radius:12px;color:#fff;font-weight:700;font-size:calc(16px * var(--tsize));
              text-align:left;padding:12px;background:linear-gradient(${index * 47}deg,
              hsl(${index * 53} 78% 56%),hsl(${index * 53 + 40} 68% 38%))`;
            tile.onclick = () => { query = genre; render(); };
            grid.appendChild(tile);
          });
          results.appendChild(grid);
          results.appendChild(h('<div style="height:170px"></div>'));
          return;
        }

        const albums = ALBUMS.filter(album => `${album[0]} ${album[1]} ${album[3]}`.toLowerCase().includes(needle));
        const tracks = allTracks().filter(track => track.title.toLowerCase().includes(needle));
        if (!albums.length && !tracks.length) {
          results.appendChild(emptyState(SF.magnifier, 'No Results', `Nothing in the catalogue matches “${query.trim()}”.`));
          return;
        }
        if (albums.length) {
          group(results, {
            header: 'Albums',
            rows: albums.map(album => ({
              labelHTML: `<div>${esc(album[0])}</div><div class="sub">${esc(album[1])} · ${esc(album[3])} · ${album[2]}</div>`,
              onClick: () => nav.push(albumView(album[0])),
            })),
          });
        }
        if (tracks.length) {
          group(results, {
            header: 'Songs',
            rows: tracks.map((track, index) => ({
              labelHTML: `<div>${esc(track.title)}</div><div class="sub">${esc(track.artist)} · ${esc(track.album)}</div>`,
              value: clockDuration(track.seconds),
              chevron: false,
              onClick: () => playQueue(tracks.map(t => t.id), index),
            })),
          });
        }
        results.appendChild(h('<div style="height:170px"></div>'));
      }
      render();
    },
  };
}

/* ------------------------------------------------------------------ Album */

function albumView(title) {
  const album = albumByTitle(title);
  return {
    title,
    shortTitle: 'Back',
    build(body, nav) {
      const state = MU();
      const tracks = albumTracks(title);
      const total = tracks.reduce((sum, track) => sum + track.seconds, 0);

      body.appendChild(h(`<div style="text-align:center;padding:6px 20px 12px">
        <div style="margin:0 auto">${musicArt(title, 200)}</div>
        <div style="font-size:calc(20px * var(--tsize));font-weight:700;margin-top:14px">${esc(title)}</div>
        <div style="font-size:calc(19px * var(--tsize));color:#e8305f">${esc(album[1])}</div>
        <div style="font-size:calc(12px * var(--tsize));color:var(--txt2);margin-top:4px">${esc(album[3])} · ${album[2]}</div></div>`));

      const buttons = el('div');
      buttons.style.cssText = 'display:flex;gap:10px;padding:0 16px 10px';
      const play = el('button', 'btn-primary', '▶  Play');
      play.style.background = 'color-mix(in srgb,#e8305f 22%,transparent)';
      play.style.color = '#e8305f';
      play.onclick = () => { state.shuffle = false; save(); playQueue(tracks.map(track => track.id), 0); };
      const shuffle = el('button', 'btn-primary', '⤮  Shuffle');
      shuffle.style.background = 'color-mix(in srgb,#e8305f 22%,transparent)';
      shuffle.style.color = '#e8305f';
      shuffle.onclick = () => {
        state.shuffle = true;
        save();
        const shuffled = tracks.map(track => track.id).sort(() => rng(`${title}:${Date.now() % 997}`)() - 0.5);
        playQueue(shuffled, 0);
      };
      buttons.append(play, shuffle);
      body.appendChild(buttons);

      const list = el('div', 'grp');
      tracks.forEach((track, index) => {
        const row = makeRow({
          labelHTML: `<div>${esc(track.title)}</div>`,
          value: clockDuration(track.seconds),
          chevron: false,
          onClick: () => playQueue(tracks.map(t => t.id), index),
        });
        row.insertBefore(h(`<div style="width:22px;color:var(--txt3);font-size:calc(14px * var(--tsize));flex:none">${track.number}</div>`), row.firstChild);
        const current = nowPlaying();
        if (current && current.id === track.id) {
          row.style.background = 'color-mix(in srgb,#e8305f 14%,transparent)';
        }
        const love = el('button', '', state.loved.includes(track.id) ? '★' : '☆');
        love.style.cssText = `color:${state.loved.includes(track.id) ? '#e8305f' : 'var(--txt3)'};font-size:calc(17px * var(--tsize));padding:0 6px`;
        love.onclick = event => {
          event.stopPropagation();
          state.loved = state.loved.includes(track.id)
            ? state.loved.filter(id => id !== track.id)
            : [...state.loved, track.id];
          save();
          nav.refresh();
        };
        row.appendChild(love);
        list.appendChild(row);
      });
      body.appendChild(list);
      body.appendChild(h(`<div class="grp-f">${tracks.length} songs · ${Math.round(total / 60)} minutes</div>`));

      group(body, {
        rows: [{
          label: state.library.includes(title) ? 'Remove from Library' : 'Add to Library',
          cls: state.library.includes(title) ? 'destructive center' : 'center',
          chevron: false,
          onClick: () => {
            state.library = state.library.includes(title)
              ? state.library.filter(entry => entry !== title)
              : [...state.library, title];
            save();
            nav.refresh();
          },
        }],
      });
      body.appendChild(h('<div style="height:170px"></div>'));
    },
  };
}

function playlistView(name, subtitle, albums) {
  const tracks = albums.flatMap(albumTracks);
  return {
    title: name,
    shortTitle: 'Back',
    build(body, nav) {
      body.appendChild(h(`<div style="text-align:center;padding:6px 20px 12px">
        <div style="width:200px;height:200px;margin:0 auto;border-radius:10px;box-shadow:0 14px 34px rgba(0,0,0,.4);
          background-image:url('${artURI(`pl:${name}`, { w: 400, h: 400, kind: 'album' })}');background-size:cover"></div>
        <div style="font-size:calc(20px * var(--tsize));font-weight:700;margin-top:14px">${esc(name)}</div>
        <div style="font-size:calc(13px * var(--tsize));color:var(--txt2)">${esc(subtitle)} · ${tracks.length} songs</div></div>`));
      const buttons = el('div');
      buttons.style.cssText = 'display:flex;gap:10px;padding:0 16px 10px';
      const play = el('button', 'btn-primary', '▶  Play');
      play.onclick = () => playQueue(tracks.map(track => track.id), 0);
      const shuffle = el('button', 'btn-primary', '⤮  Shuffle');
      shuffle.style.background = 'var(--bg3)';
      shuffle.style.color = 'var(--txt)';
      shuffle.onclick = () => {
        MU().shuffle = true;
        save();
        playQueue(tracks.map(track => track.id).sort(() => rng(`${name}:${Date.now() % 991}`)() - 0.5), 0);
      };
      buttons.append(play, shuffle);
      body.appendChild(buttons);
      group(body, {
        rows: tracks.map((track, index) => ({
          labelHTML: `<div>${esc(track.title)}</div><div class="sub">${esc(track.artist)} · ${esc(track.album)}</div>`,
          value: clockDuration(track.seconds),
          chevron: false,
          onClick: () => playQueue(tracks.map(t => t.id), index),
        })),
      });
      body.appendChild(h('<div style="height:170px"></div>'));
      void nav;
    },
  };
}

/* ------------------------------------------------------------ Now Playing */

function nowPlayingSheet() {
  const track = nowPlaying();
  if (!track) { toast('Nothing is playing'); return; }
  const box = sheet(inner => {
    inner.style.cssText += ';padding:14px 20px 26px';
    const art = el('div');
    art.style.cssText = 'display:grid;place-items:center;padding:6px 0 16px';
    inner.appendChild(art);

    const meta = el('div');
    inner.appendChild(meta);
    const scrub = el('div');
    scrub.style.cssText = 'padding:14px 0 0';
    inner.appendChild(scrub);
    const controls = el('div');
    controls.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:14px 6px 4px';
    inner.appendChild(controls);
    const extras = el('div');
    extras.style.cssText = 'display:flex;align-items:center;gap:14px;padding:14px 0 0';
    inner.appendChild(extras);

    const paint = positionOnly => {
      const state = MU();
      const current = nowPlaying();
      if (!current) { closeOverlay(); return; }

      if (positionOnly && scrub.querySelector('.np-bar')) {
        scrub.querySelector('.np-bar').style.width = `${(state.position / current.seconds) * 100}%`;
        scrub.querySelector('.np-elapsed').textContent = clockDuration(state.position);
        scrub.querySelector('.np-left').textContent = `−${clockDuration(Math.max(0, current.seconds - state.position))}`;
        return;
      }

      art.innerHTML = musicArt(current.album, 240);
      meta.innerHTML = `<div style="display:flex;align-items:center;gap:10px">
        <div style="flex:1;min-width:0">
          <div style="font-size:calc(20px * var(--tsize));font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(current.title)}</div>
          <div style="font-size:calc(19px * var(--tsize));color:#e8305f;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(current.artist)} — ${esc(current.album)}</div>
        </div></div>`;

      scrub.innerHTML = `<div class="np-track" style="height:6px;border-radius:3px;background:var(--bg3);cursor:pointer">
          <div class="np-bar" style="height:100%;width:${(state.position / current.seconds) * 100}%;background:var(--txt);border-radius:3px"></div></div>
        <div style="display:flex;justify-content:space-between;font-size:calc(11px * var(--tsize));color:var(--txt2);margin-top:6px">
          <span class="np-elapsed">${esc(clockDuration(state.position))}</span>
          <span class="np-left">−${esc(clockDuration(Math.max(0, current.seconds - state.position)))}</span></div>`;
      /* Tap anywhere on the bar to seek, the way the real scrubber behaves. */
      scrub.querySelector('.np-track').onclick = event => {
        const rect = event.currentTarget.getBoundingClientRect();
        state.position = Math.max(0, Math.min(current.seconds - 1,
          Math.round(((event.clientX - rect.left) / rect.width) * current.seconds)));
        save();
        paintMusicChrome();
      };

      controls.innerHTML = '';
      const button = (label, size, onClick) => {
        const element = el('button', '', label);
        element.style.cssText = `color:var(--txt);font-size:${size}px;width:${size + 26}px;height:${size + 26}px;
          display:grid;place-items:center`;
        element.onclick = onClick;
        return element;
      };
      controls.append(
        button('⏮', 22, () => { if (state.position > 4) { state.position = 0; save(); paintMusicChrome(); } else musicStep(-1); }),
        (() => {
          const play = el('button', '', state.playing ? '❚❚' : '▶');
          play.style.cssText = 'font-size:calc(30px * var(--tsize));width:74px;height:74px;color:var(--txt);display:grid;place-items:center';
          play.onclick = () => { state.playing = !state.playing; save(); paintMusicChrome(); };
          return play;
        })(),
        button('⏭', 22, () => musicStep(1)),
      );

      extras.innerHTML = '';
      const pill = (label, active, onClick) => {
        const element = el('button', '', label);
        element.style.cssText = `flex:1;padding:9px 4px;border-radius:10px;font-size:calc(12px * var(--tsize));
          background:${active ? 'color-mix(in srgb,#e8305f 26%,transparent)' : 'var(--bg3)'};
          color:${active ? '#e8305f' : 'var(--txt2)'}`;
        element.onclick = onClick;
        return element;
      };
      extras.append(
        pill('⤮ Shuffle', state.shuffle, () => {
          state.shuffle = !state.shuffle;
          if (state.shuffle) {
            const rest = state.queue.filter((_, index) => index !== state.index);
            state.queue = [state.queue[state.index], ...rest.sort(() => rng(`shuffle:${Date.now() % 983}`)() - 0.5)];
            state.index = 0;
          }
          save();
          paintMusicChrome();
        }),
        pill(`↻ Repeat${state.repeat === 'off' ? '' : state.repeat === 'one' ? ' 1' : ' All'}`, state.repeat !== 'off', () => {
          state.repeat = state.repeat === 'off' ? 'all' : state.repeat === 'all' ? 'one' : 'off';
          save();
          paintMusicChrome();
        }),
        pill(state.loved.includes(current.id) ? '★ Loved' : '☆ Love', state.loved.includes(current.id), () => {
          state.loved = state.loved.includes(current.id)
            ? state.loved.filter(id => id !== current.id)
            : [...state.loved, current.id];
          save();
          paintMusicChrome();
        }),
        pill('☰ Queue', false, () => queueSheet()),
      );
    };

    musicPainters.add(paint);
    /* The painter set holds a reference, so drop it when the sheet is gone. */
    const watchdog = setInterval(() => {
      if (!inner.isConnected) { musicPainters.delete(paint); clearInterval(watchdog); }
    }, 500);
    paint();
  }, { full: true });
  void box;
}

function queueSheet() {
  sheet(box => {
    const state = MU();
    box.appendChild(h('<div style="font-size:calc(22px * var(--tsize));font-weight:700;margin-bottom:6px">Playing Next</div>'));
    const upcoming = state.queue.slice(state.index).map(trackById).filter(Boolean);
    if (upcoming.length < 2) {
      box.appendChild(emptyState(SF.music, 'Nothing Queued', 'Play an album or a playlist to fill the queue.'));
      return;
    }
    const list = el('div');
    list.style.cssText = 'max-height:48vh;overflow-y:auto;margin:0 -4px';
    upcoming.forEach((track, offset) => {
      const row = makeRow({
        labelHTML: `<div style="${offset === 0 ? 'color:#e8305f' : ''}">${esc(track.title)}</div>
          <div class="sub">${esc(track.artist)} · ${esc(track.album)}</div>`,
        value: clockDuration(track.seconds),
        chevron: false,
        onClick: () => { state.index += offset; state.position = 0; state.playing = true; save(); closeOverlay(); paintMusicChrome(); },
      });
      if (offset > 0) {
        const remove = el('button', '', '−');
        remove.style.cssText = 'color:var(--sysred);font-size:calc(19px * var(--tsize));padding:0 8px';
        remove.onclick = event => {
          event.stopPropagation();
          state.queue.splice(state.index + offset, 1);
          save();
          closeOverlay();
          queueSheet();
        };
        row.appendChild(remove);
      }
      list.appendChild(row);
    });
    box.appendChild(list);
    box.appendChild(primaryButton('Clear Upcoming', () => {
      state.queue = state.queue.slice(0, state.index + 1);
      save();
      closeOverlay();
      paintMusicChrome();
    }));
  }, { full: true });
}

/* Control Centre and the island both benefit from a global entry point. */
function musicToggle() {
  const state = MU();
  if (!state.queue.length) { playQueue(albumTracks('Longer Days').map(track => track.id), 0); return; }
  state.playing = !state.playing;
  save();
  paintMusicChrome();
}
