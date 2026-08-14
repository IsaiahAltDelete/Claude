/* ===========================================================================
   The streaming store, and the channel page it opens.

   Categories down the left, a grid of channels beside them, and a full page
   for whatever you select — the same page the * menu's "About this channel"
   opens. Adding a channel really does add it to the home grid, and it lands
   at the end with a "New" flag until you open it once.
   =========================================================================== */

'use strict';

/* --------------------------------------------------------------- PIN entry */

/**
 * The four-digit keypad Roku puts in front of purchases and parental
 * controls. Resolves true when the PIN matches, false when it is wrong or the
 * screen is dismissed.
 */
function promptPin(title, expected) {
  return new Promise(resolve => {
    let entered = '';
    const node = el('div', 'modal-wrap');
    const card = el('div', 'modal');
    node.appendChild(card);

    const paint = () => {
      card.innerHTML = `
        <h2>${esc(title)}</h2>
        <p>Enter your 4-digit PIN.</p>
        <span class="code">${'•'.repeat(entered.length)}${'_'.repeat(4 - entered.length)}</span>
        <div class="modal-actions" style="justify-content:center;gap:10px;flex-wrap:wrap">
          ${['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'OK'].map((k, i) => `
            <button class="btn slim f" style="min-width:76px" data-fid="pin-${k}" data-pin="${k}"${i === 0 ? ' data-first' : ''}>${k}</button>`).join('')}
        </div>`;
    };

    let done = false;
    const finish = value => {
      if (done) return;
      done = true;
      closeOverlay();
      resolve(value);
    };

    paint();
    openOverlay(node, {
      select(target) {
        const k = target.dataset.pin;
        if (k === '⌫') { entered = entered.slice(0, -1); paint(); focusFirst(); return; }
        if (k === 'OK') { finish(entered === expected); return; }
        if (entered.length < 4) entered += k;
        paint();
        focusFirst();
        if (entered.length === 4) finish(entered === expected);
      },
      back() { finish(false); return true; },
    }, { scrim: false });
  });
}

/* ----------------------------------------------------------------- store */

defineScreen('store', {
  render(host, arg) {
    let cat = (arg && arg.cat) || 'featured';

    function channelsIn(catId) {
      if (catId === 'featured') return seededOrder(CHANNELS, 'featured').slice(0, 16);
      if (catId === 'free') return CHANNELS.filter(c => c.kind === 'avod');
      return CHANNELS.filter(c => c.cat === catId);
    }

    host.innerHTML = `
      <div class="store">
        <div class="wall"></div>
        ${topbarHTML()}
        ${sideRailHTML('store')}
        <div class="store-cats" id="st-cats">
          <div class="t-micro" style="padding:0 20px 8px">Streaming Channels</div>
          ${STORE_CATEGORIES.map((c, i) => `
            <div class="row f" data-fid="cat-${c.id}" data-cat="${c.id}"${i === 0 ? ' data-first' : ''}>${esc(c.name)}</div>`).join('')}
          <div class="row f" data-fid="cat-search" data-storesearch="1">Search Channels</div>
        </div>
        <div class="store-main scroll-y">
          <h2 class="rail-title" id="st-title"></h2>
          <div class="store-grid" id="st-grid"></div>
        </div>
      </div>`;

    const rail = wireSideRail(host);
    const grid = host.querySelector('#st-grid');
    const heading = host.querySelector('#st-title');

    function paint() {
      $$('[data-cat]', host).forEach(row => row.classList.toggle('here', row.dataset.cat === cat));
      const list = channelsIn(cat);
      const name = (STORE_CATEGORIES.find(c => c.id === cat) || {}).name || 'Featured';
      heading.innerHTML = `${esc(name)} <span class="rt-more">${list.length} channels</span>`;
      grid.innerHTML = list.map((ch, i) => `
        <div class="store-tile f lift" data-fid="sc-${ch.id}" data-chan="${ch.id}"${i === 0 ? '' : ''}>
          ${channelArt(ch)}
          ${State.installed.includes(ch.id) ? '<span class="owned">Added</span>' : ''}
        </div>`).join('');
    }

    paint();

    return {
      onFocus(node) { rail.onFocus(node); },
      select(node) {
        if (rail.select(node)) return;
        if (node.dataset.storesearch) { go('search'); return; }
        if (node.dataset.cat) {
          cat = node.dataset.cat;
          paint();
          const first = grid.querySelector('.store-tile');
          if (first) setFocus(first);
          return;
        }
        if (node.dataset.chan) go('channel', { id: node.dataset.chan, cat });
      },
      refocus() { paint(); if (!Focus.el || !focusables().includes(Focus.el)) focusFirst(host); },
    };
  },
});

/* --------------------------------------------------------- channel page */

defineScreen('channel', {
  render(host, arg) {
    const ch = CH[arg.id];
    const added = State.installed.includes(ch.id);
    const rated = State.ratings[ch.id];
    const titles = titlesOn(ch.id);

    host.innerHTML = `
      <div class="page">
        <div class="wall"></div>
        ${topbarHTML()}
        ${sideRailHTML('store')}
        <div class="chpage">
          <div class="cp-art">${channelArt(ch)}</div>
          <div style="min-width:0;flex:1">
            <h1>${esc(ch.name)}</h1>
            <div class="cp-meta">
              ${STARS(ch.rating)}<span>${ch.rating.toFixed(1)}</span>
              <span>&middot;</span><span>${esc(ch.reviews)} ratings</span>
              <span class="pill ${ch.kind === 'avod' ? 'free' : 'sub'}">${ch.kind === 'avod' ? 'Free with ads' : 'Subscription may be required'}</span>
            </div>
            <div class="cp-desc">${esc(ch.desc)}</div>

            <div class="cp-actions">
              ${added
                ? `<button class="btn f wide" data-fid="open" data-act="open" data-first>Go to channel</button>
                   ${ch.built ? '' : '<button class="btn f" data-fid="rm" data-act="remove">Remove channel</button>'}`
                : '<button class="btn f wide" data-fid="add" data-act="add" data-first>Add channel</button>'}
              <button class="btn f" data-fid="rate" data-act="rate">${rated ? `Rated ${rated}★` : 'Rate this channel'}</button>
            </div>

            <div class="cp-facts">
              <span><b>Developer</b>${esc(ch.dev)}</span>
              <span><b>Version</b>${esc(ch.ver)}</span>
              <span><b>Size</b>${esc(ch.size)}</span>
              <span><b>Category</b>${esc((STORE_CATEGORIES.find(c => c.id === ch.cat) || {}).name || 'Featured')}</span>
              <span><b>Titles here</b>${titles.length}</span>
              <span><b>On this device</b>${added ? 'Added' : 'Not added'}</span>
            </div>
          </div>
        </div>
      </div>`;

    const rail = wireSideRail(host);

    return {
      onFocus(node) { rail.onFocus(node); },
      select(node) {
        if (rail.select(node)) return;
        const act = node.dataset.act;
        if (act === 'open') { launchChannel(ch.id); return; }
        if (act === 'add') { addChannel(ch); return; }
        if (act === 'remove') { confirmRemove(ch).then(() => renderTop()); return; }
        if (act === 'rate') rateChannel(ch);
      },
      refocus() { if (!Focus.el || !focusables().includes(Focus.el)) focusFirst(host); },
    };
  },
});

/* ----------------------------------------------------------- adding one */

async function addChannel(ch) {
  if (State.parental.pinScope === 'all' && State.parental.pin) {
    const ok = await promptPin(`PIN required to add ${ch.name}`, State.parental.pin);
    if (!ok) { toast('Incorrect PIN'); return; }
  }

  if (!State.network.connected || !State.network.internet) {
    await dialog({
      title: 'Cannot reach the channel store',
      body: `<p>This device is not connected to the internet, so channels cannot be
        added right now.</p><p>Check <b>Settings &rsaquo; Network</b> and try again.</p>`,
      actions: [{ id: 'ok', label: 'OK' }],
    });
    return;
  }

  const busy = busyDialog({ title: `Adding ${ch.name}`, body: '<p>Downloading and installing.</p>' });
  await sleep(1700);
  busy.close();

  if (!State.installed.includes(ch.id)) State.installed.push(ch.id);
  State.seenNew = State.seenNew.filter(id => id !== ch.id);
  save();

  const answer = await dialog({
    title: 'Channel added',
    body: `<p>${esc(ch.name)} has been added to the end of your home screen.</p>`,
    actions: [{ id: 'go', label: 'Go to channel' }, { id: 'ok', label: 'OK' }],
  });
  if (answer === 'go') launchChannel(ch.id);
  else renderTop();
}
