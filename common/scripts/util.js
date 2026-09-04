/* ---------------------------------------------------------------------------
   Small shared helpers. No dependencies anywhere in this project, so anything
   that would normally come from a library lands here.
   --------------------------------------------------------------------------- */

const ID = (window.ISO = window.ISO || {});

/* ------------------------------------------------------------------- dom */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function el(tag, props, ...kids) {
  const node = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else if (k === "html") node.innerHTML = v;
      else if (k === "style") node.style.cssText = v;
      else if (k.startsWith("on")) node.addEventListener(k.slice(2).toLowerCase(), v);
      else node.setAttribute(k, v === true ? "" : v);
    }
  }
  for (const kid of kids.flat()) {
    if (kid == null) continue;
    node.append(kid.nodeType ? kid : document.createTextNode(kid));
  }
  return node;
}

/** An icon from the sprite baked into the document. */
function icon(name, cls = "ico") {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", cls);
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", "#i-" + name);
  svg.append(use);
  return svg;
}

/* ------------------------------------------------------------------ math */

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const TAU = Math.PI * 2;

/** Deterministic hash → [0,1). Used for anything that must survive a reload. */
function hash01(n) {
  let x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function fmtNum(v, step) {
  if (step >= 1) return String(Math.round(v));
  const dp = Math.min(3, String(step).split(".")[1]?.length || 2);
  return v.toFixed(dp);
}

/* ---------------------------------------------------------------- colour */

/** "#rgb" | "#rrggbb" | "#rrggbbaa" → {r,g,b,a} with channels in 0..1. */
function hexToRgba(hex) {
  let h = String(hex || "").trim().replace("#", "");
  if (h.length === 3 || h.length === 4) h = h.split("").map((c) => c + c).join("");
  if (h.length !== 6 && h.length !== 8) h = "ffffff";
  const n = parseInt(h.slice(0, 6), 16);
  return {
    r: ((n >> 16) & 255) / 255,
    g: ((n >> 8) & 255) / 255,
    b: (n & 255) / 255,
    a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
  };
}

const rgbaToCss = (c) => `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${c.a})`;
const toCss = (hex) => rgbaToCss(hexToRgba(hex));

function rgbToHex(r, g, b, a) {
  const p = (v) => Math.round(clamp(v, 0, 1) * 255).toString(16).padStart(2, "0");
  return "#" + p(r) + p(g) + p(b) + (a != null && a < 1 ? p(a) : "");
}

function rgbToHsv(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max ? d / max : 0, v: max };
}

function hsvToRgb(h, s, v) {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  const t = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor((h % 360) / 60)];
  return { r: t[0] + m, g: t[1] + m, b: t[2] + m };
}

/* ------------------------------------------------------------------ time */

function debounce(fn, ms) {
  let t = 0;
  const wrapped = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  wrapped.cancel = () => clearTimeout(t);
  return wrapped;
}

/* --------------------------------------------------------------- storage */

const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },
  del(key) {
    try { localStorage.removeItem(key); } catch { /* private mode */ }
  },
};

/* ------------------------------------------------------- url compression */

function encodeState(obj) {
  const json = JSON.stringify(obj);
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeState(str) {
  try {
    const bin = atob(str.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ misc */

let toastTimer = 0;
function toast(msg) {
  const node = $("#toast");
  if (!node) return;
  node.textContent = msg;
  node.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove("on"), 1900);
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = el("a", { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Pointer drag with automatic capture and cleanup. */
function drag(target, { onStart, onMove, onEnd } = {}) {
  target.addEventListener("pointerdown", (e) => {
    if (e.button != null && e.button !== 0) return;
    target.setPointerCapture(e.pointerId);
    const start = { x: e.clientX, y: e.clientY };
    let moved = false;
    onStart?.(e, start);

    const move = (ev) => {
      moved = true;
      onMove?.(ev, start);
    };
    const up = (ev) => {
      target.releasePointerCapture?.(ev.pointerId);
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
      onEnd?.(ev, moved);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
  });
}

const isSmall = () => matchMedia("(max-width: 900px)").matches;

Object.assign(ID, {
  $, $$, el, icon, clamp, TAU, hash01, fmtNum,
  hexToRgba, rgbaToCss, toCss, rgbToHex, rgbToHsv, hsvToRgb,
  debounce, store, encodeState, decodeState, toast, download, drag, isSmall,
});
