/* ===========================================================================
   Artwork.

   Channel logos and key art are composed out of a brand gradient, a CSS
   texture, a geometric mark and set type — never fetched. That keeps the whole
   simulator offline, keeps the wordmarks crisp at every size the interface
   draws them at, and means a tile, a store listing and a remote shortcut
   button are all the same logo rather than three different pictures.
   =========================================================================== */

'use strict';

const TEXTURES = ['tex-rays', 'tex-grid', 'tex-dots', 'tex-diag', 'tex-arc', 'tex-glow', 'tex-none'];

/**
 * A channel logo.
 * @param {object} ch    entry from the catalogue
 * @param {string} extra extra classes for the wrapper (sizing, mostly)
 */
function channelArt(ch, extra = '') {
  const layout = ch.layout || 'stack';
  const ink = ch.ink || '#fff';

  /* Fit the wordmark to the tile. The tile is 8% padded on each side, so the
     type has about 6.05 em-widths to play with; anything longer is stepped
     down rather than allowed to overflow. */
  const plain = ch.word.replace(/<[^>]*>/g, '');
  const cw = plain === plain.toUpperCase() ? 0.63 : 0.56;
  const denom = layout === 'inline' ? cw * plain.length + 2.1
    : layout === 'box' ? cw * plain.length + 1.3
    : layout === 'word' ? cw * 1.24 * plain.length
    : cw * plain.length;
  const fit = Math.min(1, 5.85 / Math.max(1, denom));
  const mark = layout === 'word' || layout === 'box' ? '' : ICON(ch.mark || 'mPlay', 'mark');
  const tag = ch.tag ? `<span class="tag">${esc(ch.tag)}</span>` : '';
  const stripe = ch.stripe ? '<span class="stripe"></span>' : '';

  return `<div class="art lay-${layout} ${extra}" style="--c1:${ch.c1};--c2:${ch.c2};--ink:${ink};--fit:${fit.toFixed(3)}">
      <span class="tex ${ch.tex || 'tex-none'}"></span>
      ${stripe}
      <span class="inner">${mark}<span class="wordwrap"><span class="word">${ch.word}</span>${tag}</span></span>
    </div>`;
}

/* --------------------------------------------------------------- key art */

/* Poster palettes. Deliberately filmic rather than brand-bright, so key art
   never competes with the channel logos sitting next to it. */
const KEY_PALETTES = [
  ['#4c3a8a', '#100c26'], ['#7a2b4a', '#1c0b14'], ['#17635f', '#051d22'],
  ['#7a4f18', '#1e1005'], ['#3a5390', '#090f1e'], ['#63297a', '#16072a'],
  ['#28643a', '#05190e'], ['#8b4b22', '#210f06'], ['#3a3a48', '#0d0d12'],
  ['#583278', '#12081f'], ['#154d78', '#041424'], ['#822c4c', '#1d0814'],
];

/**
 * Key art for one title. `shape` picks the crop: 'tall', 'wide' or 'sq'.
 * The title is set over the picture the way a real poster carries it, and a
 * gradient scrim keeps it readable whatever the palette landed on.
 */
function keyArt(item, { withText = true, sub = '' } = {}) {
  const random = rng(`key:${item.id || item.title}`);
  const [c1, c2] = KEY_PALETTES[Math.floor(random() * KEY_PALETTES.length)];
  const tex = TEXTURES[Math.floor(random() * TEXTURES.length)];

  /* A couple of soft shapes give the frame some depth without looking like a
     pattern swatch. */
  const shapes = `
    <span style="position:absolute;left:${Math.round(random() * 60)}%;top:${Math.round(random() * 40 - 10)}%;
      width:${Math.round(50 + random() * 60)}%;aspect-ratio:1;border-radius:50%;
      background:radial-gradient(circle,rgba(255,255,255,.3),transparent 66%)"></span>
    <span style="position:absolute;left:-14%;bottom:-${Math.round(random() * 22)}%;
      width:128%;height:${Math.round(30 + random() * 30)}%;
      background:linear-gradient(180deg,transparent,rgba(0,0,0,.55));
      transform:rotate(${(random() * 8 - 4).toFixed(1)}deg)"></span>`;

  const text = withText
    ? `<span class="kt">${esc(item.title)}</span>${sub ? `<span class="ks">${esc(sub)}</span>` : ''}`
    : '';

  return `<div class="key" style="--c1:${c1};--c2:${c2}">
      <span class="tex ${tex}"></span>${shapes}<span class="shade"></span>${text}
    </div>`;
}

/* ------------------------------------------------------------------ scenes */

/**
 * A generated "frame" behind the player, so playback is visibly playing
 * something: sky, a low sun, three ridges and a foreground band. Layers only —
 * no video, no canvas and no request.
 */
function sceneArt(seed) {
  const random = rng(`scene:${seed}`);
  const [c1, c2] = KEY_PALETTES[Math.floor(random() * KEY_PALETTES.length)];
  const horizon = 58 + Math.round(random() * 12);
  const sunX = 14 + Math.round(random() * 66);
  const sunY = horizon - 14 - Math.round(random() * 22);

  /* Ridges: wide, very flat ellipses stacked towards the viewer, each one
     darker than the last so the frame reads as depth rather than stripes. */
  let ridges = '';
  for (let i = 0; i < 3; i += 1) {
    const top = horizon + i * 7 + random() * 3;
    const w = 90 + random() * 70;
    const left = -20 + random() * 40;
    ridges += `<span style="position:absolute;left:${left.toFixed(1)}%;top:${top.toFixed(1)}%;
      width:${w.toFixed(1)}%;height:${(34 + random() * 22).toFixed(1)}%;
      border-radius:50% 50% 0 0 / ${(46 + random() * 30).toFixed(0)}% ${(40 + random() * 30).toFixed(0)}% 0 0;
      background:rgba(0,0,0,${(0.26 + i * 0.19).toFixed(2)})"></span>`;
  }

  return `<div class="scene">
      <span class="sky" style="background:linear-gradient(${Math.round(160 + random() * 40)}deg,${c1},${c2})"></span>
      <span style="position:absolute;inset:0;background:linear-gradient(0deg,
        rgba(255,255,255,.12) 0%,transparent ${horizon - 6}%,transparent 100%)"></span>
      <span style="position:absolute;left:${sunX}%;top:${sunY}%;
        width:${Math.round(9 + random() * 8)}%;aspect-ratio:1;border-radius:50%;
        background:radial-gradient(circle,rgba(255,246,224,.96) 26%,rgba(255,206,138,.34) 52%,transparent 72%);
        filter:blur(0.4px)"></span>
      ${ridges}
      <span style="position:absolute;left:0;right:0;top:${(horizon + 26).toFixed(0)}%;bottom:0;
        background:linear-gradient(180deg,rgba(0,0,0,.55),rgba(0,0,0,.9))"></span>
      <span style="position:absolute;inset:0;background:radial-gradient(130% 95% at 50% 55%,transparent 42%,rgba(0,0,0,.62))"></span>
    </div>`;
}

/* ------------------------------------------------------- small helpers */

/** The logo squeezed onto a remote shortcut button. */
function remoteAppArt(ch) {
  return `<span class="rk-app" data-app="${ch.id}"
      style="background:linear-gradient(140deg,${ch.c1},${ch.c2});color:${ch.ink || '#fff'}"
      title="${esc(ch.name)}">${esc(ch.short || ch.name)}</span>`;
}

/** A themed swatch for Settings > Theme. */
function themeSwatch(theme) {
  return `<div class="swatch" style="background:${theme.preview}"><span>${esc(theme.name)}</span></div>`;
}
