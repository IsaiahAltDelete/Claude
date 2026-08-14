/* ===========================================================================
   The left menu.

   The home screen owns the full-height version; every other screen that hangs
   off the menu keeps the collapsed icon rail so Left always takes you back to
   where you came from. The rail expands over the content while the highlight
   is inside it, then collapses again — the same behaviour as on home.
   =========================================================================== */

'use strict';

const MENU = [
  { id: 'home',     name: 'Home',                icon: 'home' },
  { id: 'watch',    name: 'What to Watch',       icon: 'sparkle' },
  { id: 'live',     name: 'Live TV',             icon: 'livetv' },
  { id: 'sports',   name: 'Sports',              icon: 'sports' },
  { id: 'free',     name: 'Featured Free',       icon: 'tag' },
  { id: 'movies',   name: 'Movie Store',         icon: 'film' },
  { id: 'tvstore',  name: 'TV Store',            icon: 'monitor' },
  { id: 'search',   name: 'Search',              icon: 'search' },
  { id: 'store',    name: 'Streaming Channels',  icon: 'store' },
  { id: 'settings', name: 'Settings',            icon: 'gear' },
];

/** Where each menu entry goes. Home is a screen of its own. */
const MENU_TARGET = {
  home: ['home', null],
  watch: ['rails', 'watch'],
  live: ['live', null],
  sports: ['rails', 'sports'],
  free: ['rails', 'free'],
  movies: ['rails', 'movies'],
  tvstore: ['rails', 'tvstore'],
  search: ['search', null],
  store: ['store', null],
  settings: ['settings', null],
};

/** The menu as it is currently configured — Settings > Home screen hides rows. */
function visibleMenu() {
  return MENU.filter(item => !State.hiddenMenu.includes(item.id));
}

/** Markup for the collapsed rail used by every non-home menu screen. */
function sideRailHTML(activeId) {
  return `<nav class="siderail" aria-label="Main menu">
      <div class="side-list">
        ${visibleMenu().map(item => `
          <div class="mrow f${item.id === activeId ? ' here' : ''}" data-fid="menu-${item.id}" data-menu="${item.id}">
            ${ICON(item.icon)}<span class="mrow-t">${esc(item.name)}</span>
          </div>`).join('')}
      </div>
    </nav>`;
}

/**
 * Wire the rail into a screen. Returns the two hooks a screen composes into
 * its own API: one to expand or collapse on focus, one that handles a press
 * on a rail row and reports whether it did.
 */
function wireSideRail(host) {
  const rail = host.querySelector('.siderail');
  return {
    onFocus(node) {
      if (!rail) return;
      rail.classList.toggle('open', !!(node && node.dataset.menu));
    },
    select(node) {
      if (!node.dataset.menu) return false;
      const [screen, arg] = MENU_TARGET[node.dataset.menu];
      State.lastMenu = node.dataset.menu;
      save();
      if (screen === 'home') goHome();
      else go(screen, arg, { replace: true });
      return true;
    },
  };
}
