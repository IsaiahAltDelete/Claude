/* ===========================================================================
   The home screen.

   A menu down the left, a grid of channel tiles to the right of it, and the
   options panel the * button opens over a highlighted tile. The menu expands
   when the highlight is in it and collapses to icons when the highlight is out
   in the grid, which is the single most recognisable thing about this screen.
   =========================================================================== */

'use strict';

/** The channels on the home grid, in the order the box has them. */
function installedChannels() {
  return State.installed.map(id => CH[id]).filter(Boolean);
}

function tileHTML(ch, index) {
  const isNew = !State.seenNew.includes(ch.id) && !PREINSTALLED.includes(ch.id);
  /* The box opens with the highlight on the first tile, not in the menu. */
  return `<div class="tile f lift" data-fid="app-${ch.id}" data-app="${ch.id}" data-index="${index}"${index === 0 ? ' data-first' : ''}
      role="button" aria-label="${esc(ch.name)}">
      ${isNew ? '<span class="new-flag">New</span>' : ''}
      ${channelArt(ch)}
    </div>`;
}

defineScreen('home', {
  render(host) {
    let moving = null;          /* id of the tile being carried by Move channel */

    host.innerHTML = `
      <div class="hs" data-focus="grid">
        <div class="wall"></div>
        <div class="brandmark">
          <span class="bm-logo">${ICON('home')}</span>
          <span><span class="bm-text">${esc(State.deviceName)}</span>
            <span class="bm-sub">${State.account.linked ? esc(State.account.name) : 'Not linked'}</span></span>
        </div>
        ${topbarHTML()}
        <nav class="side" aria-label="Main menu">
          <div class="side-list">
            ${visibleMenu().map(item => `
              <div class="mrow f${item.id === 'home' ? ' here' : ''}" data-fid="menu-${item.id}" data-menu="${item.id}">
                ${ICON(item.icon)}<span class="mrow-t">${esc(item.name)}</span>
              </div>`).join('')}
          </div>
        </nav>
        <div class="gridwrap scroll-y">
          <div class="grid" id="home-grid">
            ${installedChannels().map(tileHTML).join('')}
          </div>
        </div>
      </div>`;

    const hs = host.querySelector('.hs');
    const grid = host.querySelector('#home-grid');

    /* The menu keeps a faint highlight on Home while the grid has focus, so
       you can always see which section you came from. */
    function paintMenu() {
      $$('.mrow', host).forEach(row => row.classList.toggle('here', row.dataset.menu === 'home'));
    }

    function redrawGrid(keepId) {
      grid.innerHTML = installedChannels().map(tileHTML).join('');
      const target = keepId ? grid.querySelector(`[data-app="${keepId}"]`) : null;
      if (target) {
        setFocus(target);
        if (moving) target.classList.add('moving');
      }
    }

    const api = {
      onFocus(node) {
        hs.dataset.focus = node.dataset.menu ? 'menu' : 'grid';
      },

      select(node) {
        if (moving) { api.dropMove(); return; }

        if (node.dataset.menu) {
          const id = node.dataset.menu;
          if (id === 'home') {
            const first = grid.querySelector('.tile');
            if (first) setFocus(first);
            return;
          }
          const [screen, arg] = MENU_TARGET[id];
          State.lastMenu = id;
          save();
          go(screen, arg);
          return;
        }

        if (node.dataset.app) launchChannel(node.dataset.app);
      },

      star() {
        if (moving) return;
        const node = Focus.el;
        if (!node || !node.dataset.app) return;
        openChannelOptions(node.dataset.app, api);
      },

      /* Move channel: the tile follows the arrows until OK or Back. */
      startMove(id) {
        moving = id;
        redrawGrid(id);
        toast('Use the arrows to move the channel, then press OK');
      },

      dropMove() {
        moving = null;
        save();
        redrawGrid(Focus.el && Focus.el.dataset.app);
        toast('Channel moved');
      },

      key(k) {
        if (!moving) return false;
        if (k === 'back') { moving = null; redrawGrid(Focus.el && Focus.el.dataset.app); return true; }
        if (k === 'ok') { api.dropMove(); return true; }
        if (['left', 'right', 'up', 'down'].includes(k)) {
          const order = State.installed;
          const from = order.indexOf(moving);
          const cols = 5;
          let to = from;
          if (k === 'left') to = from - 1;
          if (k === 'right') to = from + 1;
          if (k === 'up') to = from - cols;
          if (k === 'down') to = from + cols;
          to = clamp(to, 0, order.length - 1);
          if (to !== from) {
            order.splice(from, 1);
            order.splice(to, 0, moving);
            redrawGrid(moving);
          }
          return true;
        }
        return false;
      },

      back() {
        if (moving) { moving = null; redrawGrid(); return true; }
        /* Back on the home screen moves the highlight into the menu, the way
           it does on the box, rather than doing nothing. */
        if (Focus.el && Focus.el.dataset.app) {
          setFocus(host.querySelector('[data-menu="home"]'));
          return true;
        }
        return true;
      },

      refocus() { if (!Focus.el || !focusables().includes(Focus.el)) focusFirst(host); },
    };

    paintMenu();
    return api;
  },
});

/* ------------------------------------------------- the * options panel */

/**
 * What * offers over a channel tile. Built-in channels cannot be removed,
 * which is why the row is absent rather than greyed out.
 */
function openChannelOptions(id, homeApi) {
  const ch = CH[id];
  if (!ch) return;
  const rated = State.ratings[id];

  const rows = [
    { id: 'open', label: 'Open channel' },
    ch.built ? null : { id: 'remove', label: 'Remove channel' },
    { id: 'move', label: 'Move channel' },
    { id: 'rate', label: rated ? `Rated ${rated} of 5` : 'Rate channel' },
    { id: 'update', label: 'Check for updates' },
    { id: 'about', label: 'About this channel' },
  ].filter(Boolean);

  const panel = el('div', 'optpanel');
  panel.innerHTML = `
    <h2>${esc(ch.name)}</h2>
    <div class="sub">Version ${esc(ch.ver)} &middot; ${esc(ch.size)}</div>
    ${rows.map((r, i) => `<div class="row f" data-fid="opt-${r.id}" data-opt="${r.id}"${i === 0 ? ' data-first' : ''}>${esc(r.label)}</div>`).join('')}
    <div class="hintline">Press <b>Back</b> to close.</div>`;

  openOverlay(panel, {
    select(node) {
      const act = node.dataset.opt;
      if (act === 'open') { closeOverlay(); launchChannel(id); return; }
      if (act === 'move') { closeOverlay(); homeApi.startMove(id); return; }
      if (act === 'remove') { closeOverlay(); confirmRemove(ch); return; }
      if (act === 'rate') { closeOverlay(); rateChannel(ch); return; }
      if (act === 'update') { closeOverlay(); checkChannelUpdate(ch); return; }
      if (act === 'about') { closeOverlay(); go('channel', { id, from: 'home' }); }
    },
  });
}

async function confirmRemove(ch) {
  const answer = await dialog({
    title: `Remove ${ch.name}?`,
    body: `<p>The channel will be removed from your home screen. Any subscription
      you bought through it keeps running until you cancel it separately.</p>`,
    actions: [{ id: 'cancel', label: 'Keep channel' }, { id: 'remove', label: 'Remove channel' }],
  });
  if (answer !== 'remove') return;
  State.installed = State.installed.filter(id => id !== ch.id);
  save();
  renderTop();
  toast(`${ch.name} removed`);
}

function rateChannel(ch) {
  const panel = el('div', 'optpanel');
  panel.innerHTML = `
    <h2>Rate ${esc(ch.name)}</h2>
    <div class="sub">Ratings help other people find good channels.</div>
    ${[5, 4, 3, 2, 1].map((n, i) => `
      <div class="row f" data-fid="rate-${n}" data-rate="${n}"${i === 0 ? ' data-first' : ''}>
        <span class="stars">${'★'.repeat(n)}<span class="off">${'★'.repeat(5 - n)}</span></span>
      </div>`).join('')}`;
  openOverlay(panel, {
    select(node) {
      State.ratings[ch.id] = Number(node.dataset.rate);
      save();
      closeOverlay();
      toast('Thanks — your rating was sent');
    },
  });
}

async function checkChannelUpdate(ch) {
  const busy = busyDialog({ title: `Checking ${ch.name}`, body: '<p>Looking for a newer version.</p>' });
  await sleep(1500);
  busy.close();
  await dialog({
    title: 'No update available',
    body: `<p>${esc(ch.name)} is up to date at version ${esc(ch.ver)}.</p>`,
    actions: [{ id: 'ok', label: 'OK' }],
  });
}
