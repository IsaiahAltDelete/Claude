/* ===========================================================================
   Shared foundations for the extension apps.

   Everything here is deterministic and local: artwork is generated as inline
   SVG data URIs rather than fetched, so the phone looks the same offline as it
   does online and never waits on the network.
   =========================================================================== */

/** Small deterministic PRNG, so generated artwork and data never flicker. */
function rng(seed) {
  let value = (typeof seed === 'string'
    ? [...seed].reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) | 0, 7)
    : seed) || 1;
  return () => {
    value = (value * 1103515245 + 12345) & 0x7fffffff;
    return value / 0x7fffffff;
  };
}

const PALETTES = [
  ['#ff9f0a', '#ff375f'], ['#5ac8fa', '#0a63e8'], ['#30d158', '#0a7d3c'],
  ['#bf5af2', '#5e2ca5'], ['#ffd60a', '#ff9f0a'], ['#64d2ff', '#5e5ce6'],
  ['#ff6482', '#c9346b'], ['#a3e635', '#3f8f2f'], ['#f4a4c0', '#8e4b7a'],
  ['#8e8e93', '#2c2c2e'], ['#40c8e0', '#1c6f8c'], ['#ffb340', '#c76a12'],
];

/**
 * A generated "photo": layered gradient plus a few soft shapes. Encoded as a
 * data URI so it works in <img> and as a CSS background, with no requests.
 */
function artURI(seed, { w = 400, h = 400, kind = 'photo' } = {}) {
  const random = rng(seed);
  const [a, b] = PALETTES[Math.floor(random() * PALETTES.length)];
  const angle = Math.floor(random() * 360);
  let shapes = '';

  if (kind === 'photo') {
    // A horizon plus a sun and a couple of hills reads as a landscape.
    const horizon = 0.52 + random() * 0.22;
    shapes += `<rect y="${h * horizon}" width="${w}" height="${h}" fill="#000" opacity=".22"/>`;
    shapes += `<circle cx="${w * (0.2 + random() * 0.6)}" cy="${h * horizon * 0.5}" r="${w * 0.09}" fill="#fff" opacity=".5"/>`;
    for (let i = 0; i < 3; i += 1) {
      const cx = w * random();
      shapes += `<ellipse cx="${cx}" cy="${h * horizon}" rx="${w * (0.2 + random() * 0.3)}" ry="${h * (0.1 + random() * 0.14)}" fill="#000" opacity="${0.1 + random() * 0.16}"/>`;
    }
  } else if (kind === 'album') {
    for (let i = 0; i < 4; i += 1) {
      shapes += `<circle cx="${w * random()}" cy="${h * random()}" r="${w * (0.1 + random() * 0.26)}" fill="#fff" opacity="${0.06 + random() * 0.14}"/>`;
    }
  } else if (kind === 'book') {
    shapes += `<rect x="0" width="${w * 0.07}" height="${h}" fill="#000" opacity=".28"/>`;
    shapes += `<rect x="${w * 0.16}" y="${h * 0.16}" width="${w * 0.68}" height="${h * 0.5}" fill="#fff" opacity=".12" rx="4"/>`;
  } else if (kind === 'map') {
    shapes += `<rect width="${w}" height="${h}" fill="#dfeede"/>`;
    for (let i = 0; i < 7; i += 1) {
      const y = h * random();
      shapes += `<rect y="${y}" width="${w}" height="${3 + random() * 4}" fill="#fff" opacity=".85"/>`;
      shapes += `<rect x="${w * random()}" width="${3 + random() * 4}" height="${h}" fill="#fff" opacity=".7"/>`;
    }
    shapes += `<circle cx="${w * 0.5}" cy="${h * 0.5}" r="${w * 0.16}" fill="#a8dca8" opacity=".8"/>`;
  }

  const base = kind === 'map'
    ? ''
    : `<defs><linearGradient id="g" gradientTransform="rotate(${angle} .5 .5)">
        <stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
       <rect width="${w}" height="${h}" fill="url(#g)"/>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${base}${shapes}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** A generated tile as a DOM element, matching the look of .ph-cell. */
function artCell(seed, opts) {
  const cell = el('div', 'ph-cell');
  cell.style.backgroundImage = `url("${artURI(seed, opts)}")`;
  cell.style.backgroundSize = 'cover';
  cell.style.backgroundPosition = 'center';
  return cell;
}

/* --------------------------------------------------------------- chart bits */

/** Closed activity ring, drawn with a dash offset so any fraction works. */
function ringSVG(fraction, colour, { size = 120, width = 13, track = 'rgba(255,255,255,.16)' } = {}) {
  const radius = (size - width) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = Math.min(1, fraction) * circumference;
  return `<svg viewBox="0 0 ${size} ${size}" style="width:${size}px;height:${size}px;transform:rotate(-90deg)">
    <circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="none" stroke="${track}" stroke-width="${width}"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="none" stroke="${colour}" stroke-width="${width}"
      stroke-linecap="round" stroke-dasharray="${filled} ${circumference}"/></svg>`;
}

/** Bar chart used by Health, Fitness and Screen Time style panes. */
function barsSVG(values, { labels = [], colour = 'var(--sysblue)', height = 110 } = {}) {
  const peak = Math.max(...values, 1);
  const wrap = el('div');
  wrap.style.cssText = `display:flex;align-items:flex-end;gap:6px;height:${height}px;padding:10px 2px 0`;
  values.forEach((value, index) => {
    const column = el('div');
    column.style.cssText = 'flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:5px;height:100%';
    const bar = el('div');
    bar.style.cssText = `width:100%;border-radius:4px 4px 2px 2px;background:${colour};height:${Math.max(2, (value / peak) * (height - 26))}px`;
    column.appendChild(bar);
    if (labels[index]) {
      column.appendChild(h(`<div style="font-size:10px;color:var(--txt3)">${esc(labels[index])}</div>`));
    }
    wrap.appendChild(column);
  });
  return wrap;
}

/** Smooth line for Stocks and Health trends. */
function lineSVG(values, { colour = '#30d158', w = 300, h = 70, fill = true } = {}) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((value, index) => [
    (index / (values.length - 1)) * w,
    h - ((value - min) / span) * (h - 6) - 3,
  ]);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('');
  const area = `${path}L${w} ${h}L0 ${h}Z`;
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="width:100%;height:${h}px;display:block">
    ${fill ? `<path d="${area}" fill="${colour}" opacity=".14"/>` : ''}
    <path d="${path}" fill="none" stroke="${colour}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

/* ------------------------------------------------------------ layout pieces */

/** Rounded card matching the grouped-list material. */
function card(parent, build, { pad = '14px 16px', bg = 'var(--group)' } = {}) {
  const box = el('div');
  box.style.cssText = `background:${bg};border-radius:14px;padding:${pad};margin:10px 16px`;
  build(box);
  parent.appendChild(box);
  return box;
}

/** Small caps section label used above cards. */
function cardHeader(text, trailing = '') {
  return h(`<div style="display:flex;align-items:center;justify-content:space-between;
    margin:18px 20px 4px;font-size:13px;font-weight:600;color:var(--txt3);text-transform:uppercase;letter-spacing:.04em">
    <span>${esc(text)}</span><span style="text-transform:none;letter-spacing:0;color:var(--sysblue);font-weight:400">${trailing}</span></div>`);
}

/** Centred placeholder for empty lists. */
function emptyState(glyph, title, sub) {
  return h(`<div style="text-align:center;padding:64px 32px;color:var(--txt3)">
    <div style="opacity:.4;display:grid;place-items:center;margin-bottom:12px">${glyph}</div>
    <div style="font-size:17px;font-weight:600;color:var(--txt2)">${esc(title)}</div>
    ${sub ? `<div style="font-size:13px;margin-top:5px;line-height:1.4">${esc(sub)}</div>` : ''}</div>`);
}

/** iOS-style search field that filters as you type. */
function searchField(placeholder, onInput) {
  const wrap = el('div');
  wrap.style.cssText = 'padding:6px 16px 10px';
  const box = el('div');
  box.style.cssText = `display:flex;align-items:center;gap:7px;height:36px;padding:0 10px;border-radius:10px;
    background:var(--bg3);color:var(--txt3)`;
  box.innerHTML = `<span style="display:grid;place-items:center;opacity:.7">${SF.magnifier}</span>`;
  const input = el('input');
  input.placeholder = placeholder;
  input.style.cssText = 'flex:1;min-width:0;border:0;outline:0;background:transparent;color:var(--txt);font-size:16px';
  input.oninput = () => onInput(input.value);
  box.appendChild(input);
  wrap.appendChild(box);
  return wrap;
}

/**
 * Full-width action button. .btn-primary is width:100%, so the inset comes
 * from a wrapper — a margin on the button itself would push the page 32px
 * wider than its container and make the whole view scroll sideways.
 */
function primaryButton(label, onClick) {
  const wrap = el('div');
  wrap.style.padding = '16px';
  const button = el('button', 'btn-primary', esc(label));
  button.onclick = onClick;
  wrap.appendChild(button);
  return wrap;
}

/* ------------------------------------------------------------------- format */

const shortDay = date => date.toLocaleDateString(undefined, { weekday: 'short' });
const shortDate = date => date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const timeStr = date => date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

/** "Today", "Yesterday", then a weekday, then a date. */
function relativeDay(date) {
  const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(date).setHours(0, 0, 0, 0)) / 864e5);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days > 1 && days < 7) return shortDay(new Date(date));
  return shortDate(new Date(date));
}

function clockDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Lazily create and return a slice of persisted state. */
function slice(key, build) {
  if (!State[key]) {
    State[key] = build();
    save();
  }
  return State[key];
}
