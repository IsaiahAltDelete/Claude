/* ===========================================================================
   Navigation.

   A television has exactly one highlight and five ways to move it, so this is
   a spatial engine rather than a tab order: every focusable is measured, and a
   direction press picks whichever candidate lies that way and costs least to
   reach. Screens therefore never wire up their own arrow handling — they mark
   things with class "f" and the geometry does the rest.

   Anything scrolled out of sight still has a real rectangle (its container is
   overflow:hidden, not display:none), so moving towards it scrolls it in.
   =========================================================================== */

'use strict';

const Focus = {
  el: null,
  /** The element navigation is confined to — the topmost live layer. */
  scope: null,
};

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

/** Everything the remote can land on inside the current scope. */
function focusables(scope = Focus.scope || document) {
  return $$('.f', scope).filter(node => {
    if (node.hasAttribute('data-off')) return false;
    if (node.offsetParent === null && getComputedStyle(node).position !== 'fixed') return false;
    const r = node.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  });
}

/**
 * Cost of moving from `from` to `to` in `dir`. Lower wins; Infinity means the
 * candidate is not in that direction at all.
 *
 * The shape of it: candidates that overlap on the cross axis are strongly
 * preferred (that is what keeps a column feeling like a column), then the gap
 * along the direction of travel, then how far off-axis the centre is.
 */
function navScore(from, to, dir) {
  const fcx = from.left + from.width / 2;
  const fcy = from.top + from.height / 2;
  const tcx = to.left + to.width / 2;
  const tcy = to.top + to.height / 2;

  if (dir === 'left' || dir === 'right') {
    const advance = dir === 'right' ? tcx - fcx : fcx - tcx;
    if (advance <= 4) return Infinity;
    const gap = Math.max(0, dir === 'right' ? to.left - from.right : from.left - to.right);
    const overlap = Math.min(from.bottom, to.bottom) - Math.max(from.top, to.top);
    const off = Math.abs(tcy - fcy);
    const penalty = overlap > 2 ? off * 0.16 : off * 3.2 + 420;
    return gap + advance * 0.12 + penalty;
  }

  const advance = dir === 'down' ? tcy - fcy : fcy - tcy;
  if (advance <= 4) return Infinity;
  const gap = Math.max(0, dir === 'down' ? to.top - from.bottom : from.top - to.bottom);
  const overlap = Math.min(from.right, to.right) - Math.max(from.left, to.left);
  const off = Math.abs(tcx - fcx);
  const penalty = overlap > 2 ? off * 0.14 : off * 2.4 + 340;
  return gap + advance * 0.12 + penalty;
}

/**
 * Bring an element into view inside every scrolling ancestor it sits in.
 * Written by hand rather than with scrollIntoView so the margins can be
 * generous — a TV always shows a slice of the next row.
 */
function ensureVisible(node) {
  const smooth = !reduceMotion.matches;
  let parent = node.parentElement;

  while (parent && parent !== document.body) {
    const canY = parent.scrollHeight - parent.clientHeight > 2;
    const canX = parent.scrollWidth - parent.clientWidth > 2;

    if (canY || canX) {
      const pr = parent.getBoundingClientRect();
      const nr = node.getBoundingClientRect();
      const padY = Math.min(64, parent.clientHeight * 0.18);
      const padX = Math.min(90, parent.clientWidth * 0.2);
      let dy = 0;
      let dx = 0;

      if (canY) {
        if (nr.top - padY < pr.top) dy = nr.top - padY - pr.top;
        else if (nr.bottom + padY > pr.bottom) dy = nr.bottom + padY - pr.bottom;
      }
      if (canX) {
        if (nr.left - padX < pr.left) dx = nr.left - padX - pr.left;
        else if (nr.right + padX > pr.right) dx = nr.right + padX - pr.right;
      }

      if (dy || dx) {
        parent.scrollTo({
          top: parent.scrollTop + dy,
          left: parent.scrollLeft + dx,
          behavior: smooth ? 'smooth' : 'auto',
        });
      }
    }
    parent = parent.parentElement;
  }
}

/** Move the highlight. Fires the screen's onFocus hook, if it has one. */
function setFocus(node, { scroll = true } = {}) {
  if (!node || node === Focus.el) {
    if (node && scroll) ensureVisible(node);
    return node;
  }
  if (Focus.el) Focus.el.classList.remove('on');
  Focus.el = node;
  if (!node) return null;
  node.classList.add('on');
  if (scroll) ensureVisible(node);
  const owner = UI.current();
  if (owner && owner.onFocus) owner.onFocus(node);
  return node;
}

/** First focusable in the scope, or the one marked data-first. */
function focusFirst(scope) {
  const list = focusables(scope);
  const marked = list.find(node => node.hasAttribute('data-first'));
  return setFocus(marked || list[0]);
}

/**
 * Try to move in a direction. Returns true if the highlight moved, so callers
 * can decide what an edge press should mean (the home screen turns a left
 * press at column one into "open the menu", for instance).
 */
function moveFocus(dir) {
  const list = focusables();
  if (!list.length) return false;
  if (!Focus.el || !list.includes(Focus.el)) {
    setFocus(list[0]);
    return true;
  }

  const from = Focus.el.getBoundingClientRect();
  let best = null;
  let bestScore = Infinity;

  list.forEach(node => {
    if (node === Focus.el) return;
    const s = navScore(from, node.getBoundingClientRect(), dir);
    if (s < bestScore) { bestScore = s; best = node; }
  });

  if (!best) return false;
  setFocus(best);
  return true;
}

/**
 * Hand the current element to whichever screen or overlay owns it. Screens
 * implement select(el) and read el.dataset — there is no global action table,
 * because the same data attribute means different things in different places.
 */
function activate(node = Focus.el) {
  if (!node) return;
  const owner = UI.current();
  if (owner && owner.select) owner.select(node);
}

/* ------------------------------------------------------- pointer as a remote */

/* Clicking is a convenience for anyone driving this with a mouse or a finger:
   it moves the highlight there and presses OK, which is exactly what the
   remote would have done in two steps. */
function wirePointer(canvas) {
  canvas.addEventListener('click', event => {
    const node = event.target.closest('.f');
    if (!node || !canvas.contains(node)) return;
    if (!focusables().includes(node)) return;
    setFocus(node, { scroll: false });
    activate(node);
  });

  /* Hovering moves the highlight but does not select, so the screen always
     agrees with what the pointer is over. */
  canvas.addEventListener('pointerover', event => {
    if (event.pointerType === 'touch') return;
    const node = event.target.closest('.f');
    if (!node || node === Focus.el) return;
    if (!focusables().includes(node)) return;
    setFocus(node, { scroll: false });
  });
}
