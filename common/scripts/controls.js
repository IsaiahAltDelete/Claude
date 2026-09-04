/* ---------------------------------------------------------------------------
   Custom elements.

   Every control in the rail is a real custom element that renders into light
   DOM and talks to the state store directly. They all share one base class,
   so keyboard support, value formatting, live sync and teardown are written
   once.

   Interaction rules, applied consistently:
     · press anywhere on a slider to jump there, then drag;
     · hold Shift while dragging for quarter-speed;
     · double-press a control to restore its default;
     · click a value to type it.
   --------------------------------------------------------------------------- */

(() => {
const { el, icon, clamp, fmtNum, drag, hexToRgba, rgbToHex, rgbToHsv, hsvToRgb, isSmall, store } = window.ISO;
const State = window.ISO.State;

/* Non-linear response for ranges where the low end needs the resolution. */
const CURVE = { count: 2.2, size: 1.6, dist: 1.5, depth: 1.4, radius: 1.3 };

/* ------------------------------------------------------------------- wheel

   A wheel gesture belongs to whatever sat under the pointer when it started,
   and keeps that owner until the wheel goes quiet. So: park on a slider and
   scroll, and you adjust it; flick through the panel and pass over a slider
   on the way, and the panel keeps scrolling. Without this rule, wheel support
   either hijacks the rail or has to be opted into with a modifier — both
   worse. */

let wheelOwner = null;
let wheelAt = -Infinity;
const WHEEL_GESTURE_MS = 280;

addEventListener("wheel", (e) => {
  const now = performance.now();
  if (now - wheelAt > WHEEL_GESTURE_MS) {
    wheelOwner = e.target instanceof Element
      ? e.target.closest(".slider, .pad, .vec input, .pop")
      : null;
  }
  wheelAt = now;
}, { capture: true, passive: true });

/** Normalise a wheel event to notches, whatever the device reports. */
function notches(e) {
  const horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY);
  let d = horizontal ? e.deltaX : e.deltaY;
  if (e.deltaMode === 1) d *= 16;            // lines
  else if (e.deltaMode === 2) d *= 400;      // pages
  // Up and right both mean "more". Cap one event so a flick cannot slam an
  // endpoint, while a trackpad's stream of small deltas still adds up.
  const n = clamp(d / 100, -2.5, 2.5);
  return horizontal ? n : -n;
}

/* ---------------------------------------------------------------- tooltips

   The browser's own title tooltip waits about a second, cannot be styled to
   match anything around it, and under a finger never appears at all. Every
   control descriptor already carries a sentence explaining what it does, so
   that sentence is drawn here instead.

   One element serves the whole page. A node is tipped by attribute rather
   than by subscription — data-tip, plus an optional data-hint — so hover and
   focus are watched once at the window and anything built later is covered
   without registering anything.

   The timing is the convention every desktop interface settled on: a pause
   before the first tooltip, none at all for the next one. Reading down a rail
   of sliders should not mean waiting once per slider, and the wait should
   come back once the hand has been still for a moment. */

const TIP_DELAY = 380;      // pause before the first tooltip of a sweep
const TIP_GRACE = 500;      // how long the sweep stays warm after one closes
const TIP_MARGIN = 8;       // clearance from every edge of the viewport
const TIP_GAP = 6;          // clearance from the control being described

/* The gestures a label cannot carry. A control offers one of these about
   itself only when the schema has not written a better one. */
const SLIDER_HINT = "Scroll to adjust · Shift for fine · double-click to reset";

// Under a finger there is no hover to read intent from, and a tooltip would
// only be something in the way of the tap, so the whole system stands down.
const coarsePointer = matchMedia("(pointer: coarse)");

let tipNode = null, tipLine = null, tipHint = null;
let tipTarget = null;       // the node the visible or pending tooltip describes
let tipTimer = 0;
let tipOn = false;
let tipHidAt = -Infinity;   // when the last tooltip came down, for the grace period
let tipPointerAt = -Infinity;   // when a pointer last went down, to spot focus from a click

function tipRoot() {
  if (tipNode) return tipNode;
  tipLine = el("span", { class: "tip-line" });
  tipHint = el("span", { class: "tip-hint" });
  // Every control keeps its own accessible name, so this element would only
  // read the same thing twice. It is decoration for the eye alone.
  tipNode = el("div", { class: "tip", "aria-hidden": "true" }, tipLine, tipHint);
  document.body.append(tipNode);
  return tipNode;
}

/* Above the control and centred on it, flipped below when the room above has
   run out. Whichever side wins, the tooltip is clamped into the viewport but
   never laid over its own subject: a tooltip that covers the control it
   describes answers the question by hiding the answer. */
function placeTip(target) {
  const a = target.getBoundingClientRect();
  const t = tipNode.getBoundingClientRect();
  const above = a.top - TIP_GAP - TIP_MARGIN;
  const below = innerHeight - a.bottom - TIP_GAP - TIP_MARGIN;
  const top = t.height <= above || above >= below
    ? a.top - TIP_GAP - t.height
    : a.bottom + TIP_GAP;
  const left = a.left + a.width / 2 - t.width / 2;
  const room = Math.max(TIP_MARGIN, innerWidth - t.width - TIP_MARGIN);
  tipNode.style.left = `${Math.round(clamp(left, TIP_MARGIN, room))}px`;
  tipNode.style.top = `${Math.round(top)}px`;
}

function showTip(target) {
  const text = target.getAttribute("data-tip");
  if (!text) return;
  const node = tipRoot();
  tipLine.textContent = text;
  tipHint.textContent = target.getAttribute("data-hint") || "";
  // Measure from the corner. A fixed box still parked near an edge is
  // squeezed by the viewport and would report a width it will not have once
  // it has been placed.
  node.style.left = "0px";
  node.style.top = "0px";
  placeTip(target);
  node.classList.add("on");
  tipOn = true;
  tipTarget = target;
}

function hideTip() {
  clearTimeout(tipTimer);
  tipTimer = 0;
  tipTarget = null;
  if (!tipOn) return;
  tipOn = false;
  tipHidAt = performance.now();
  tipNode.classList.remove("on");
}

function armTip(target, immediate) {
  if (coarsePointer.matches || target === tipTarget) return;
  hideTip();
  tipTarget = target;
  // Warm, so the tooltip before this one closed a moment ago and the hand is
  // still moving: waiting again would only make the rail feel sticky.
  if (immediate || performance.now() - tipHidAt < TIP_GRACE) showTip(target);
  else tipTimer = setTimeout(() => showTip(target), TIP_DELAY);
}

const tippedNode = (node) => (node instanceof Element ? node.closest("[data-tip]") : null);

addEventListener("pointerover", (e) => {
  const target = tippedNode(e.target);
  if (target) armTip(target, false);
  else if (tipTarget) hideTip();
}, true);

addEventListener("pointerout", (e) => {
  // Crossing into a child of the same control is not leaving it.
  if (!tipTarget) return;
  const to = e.relatedTarget;
  if (to instanceof Node && tipTarget.contains(to)) return;
  hideTip();
}, true);

addEventListener("focusin", (e) => {
  // Focus that arrived with a click already has a pointer resting on the
  // control, and that path is the hover one with its pause in front of it.
  if (performance.now() - tipPointerAt < 400) return;
  const target = tippedNode(e.target);
  if (target) armTip(target, true);
}, true);

addEventListener("focusout", hideTip, true);
addEventListener("pointerdown", () => {
  tipPointerAt = performance.now();
  hideTip();
}, true);
addEventListener("scroll", hideTip, { capture: true, passive: true });
addEventListener("resize", hideTip);
addEventListener("keydown", (e) => {
  if (e.key === "Escape") hideTip();
}, true);

/** Tip any node: a plain sentence, or { tip, hint } for a second line. */
function attachTip(node, content) {
  if (!node) return node;
  const c = typeof content === "string" ? { tip: content } : content || {};
  if (!c.tip) {
    node.removeAttribute("data-tip");
    node.removeAttribute("data-hint");
    return node;
  }
  node.setAttribute("data-tip", c.tip);
  if (c.hint) node.setAttribute("data-hint", c.hint);
  else node.removeAttribute("data-hint");
  // A node cannot carry both, or the browser's tooltip turns up underneath
  // ours a second later.
  node.removeAttribute("title");
  return node;
}

class Base extends HTMLElement {
  set config(v) {
    this._cfg = v;
    if (this.isConnected) this.build();
  }
  get cfg() { return this._cfg; }

  connectedCallback() {
    if (this._cfg && !this._built) this.build();
    this._off = State.on(() => this.sync());
  }
  disconnectedCallback() {
    this._off?.();
    this.closePop?.();
  }
  build() {
    this._built = true;
    this.textContent = "";
    this.draw();
    this.sync();
  }
  draw() {}
  sync() {}

  head(labelText, valueNode) {
    return el("div", { class: "row" },
      el("label", { class: "row-label", text: labelText }),
      valueNode || null);
  }

  /* The descriptor's tip, put on the parts of the control a pointer actually
     rests on: the label row always, and the body wherever the body is the
     larger and more obvious target. A hint written into the schema wins over
     whatever the control offers about its own gestures. */
  tip(hint, ...nodes) {
    const c = this.cfg;
    if (!c || !c.tip) return;
    const content = { tip: c.tip, hint: c.hint || hint || "" };
    for (const node of nodes) attachTip(node, content);
  }
}

/* ----------------------------------------------------------------- slider */

class Slider extends Base {
  draw() {
    const c = this.cfg;
    this.valueEl = el("button", {
      class: "row-value", type: "button",
      "data-tip": "Click to type a value",
      "data-hint": "Or drag it sideways to scrub",
    });
    this.slider = el("div", {
      class: "slider" + (c.bipolar ? " bipolar" : ""),
      tabindex: "0",
      role: "slider",
      "aria-label": c.l,
      "aria-valuemin": c.min,
      "aria-valuemax": c.max,
    },
      el("div", { class: "slider-track" }, this.fill = el("div", { class: "slider-fill" })),
      this.knob = el("div", { class: "slider-knob" }));

    const row = this.head(c.l, this.valueEl);
    this.append(row, this.slider);
    this.tip(SLIDER_HINT, row, this.slider);

    const curve = CURVE[c.k] || 1;
    const toValue = (t) => c.min + (c.max - c.min) * Math.pow(clamp(t, 0, 1), curve);
    const toT = (v) => Math.pow(clamp((v - c.min) / (c.max - c.min), 0, 1), 1 / curve);
    this.toT = toT;

    /* Dragging is absolute on the press and relative from then on. The press
       jumps to where you pressed; every move after that is measured from an
       anchor, and the anchor is re-seated whenever Shift goes down or up so
       reaching for fine control mid-drag refines the value instead of
       teleporting it. The anchor is also re-seated at the ends of the range,
       so overshooting by 300px does not leave 300px of dead travel. */
    let startT = 0, startX = 0, wasFine = false, pending = null;

    drag(this.slider, {
      onStart: (e) => {
        this.slider.classList.add("live");
        const r = this.slider.getBoundingClientRect();
        wasFine = e.shiftKey;
        startX = e.clientX;
        startT = wasFine ? toT(State.get(c.k)) : clamp((e.clientX - r.left) / r.width, 0, 1);
        if (wasFine) return;
        // On touch the browser may still claim this gesture for scrolling, so
        // hold the jump until we know it is a drag or a tap.
        if (e.pointerType === "touch") pending = toValue(startT);
        else this.commit(toValue(startT));
      },
      onMove: (e) => {
        if (pending !== null) { this.commit(pending); pending = null; }
        const r = this.slider.getBoundingClientRect();
        const nowFine = e.shiftKey;
        if (nowFine !== wasFine) {
          startT = toT(State.get(c.k));
          startX = e.clientX;
          wasFine = nowFine;
        }
        let t = startT + ((e.clientX - startX) / r.width) * (nowFine ? 0.25 : 1);
        if (t < 0 || t > 1) {           // re-anchor at the ends, no dead zone
          t = clamp(t, 0, 1);
          startT = t;
          startX = e.clientX;
        }
        this.commit(toValue(t));
      },
      onEnd: (e, moved) => {
        // pointercancel means the browser took the gesture for scrolling —
        // a swipe that became a scroll must not leave a value behind.
        if (e.type !== "pointercancel" && !moved && pending !== null) this.commit(pending);
        pending = null;
        this.slider.classList.remove("live");
      },
    });

    // Wheel and trackpad, in curve space so every range feels the same.
    this.slider.addEventListener("wheel", (e) => {
      if (wheelOwner !== this.slider) return;
      const n = notches(e);
      if (!n) return;
      e.preventDefault();
      const stepT = e.shiftKey ? 0.005 : 0.025;
      this.commit(toValue(toT(State.get(c.k)) + n * stepT));
      this.flash();
    }, { passive: false });

    this.slider.addEventListener("dblclick", () => this.commit(c.d));

    /* Keyboard mirrors the pointer: Shift refines, as it does on drag, and
       Page steps cover a hundredth of the range so wide ranges like Copies
       (1–3000) are crossable without holding a key down for a minute. */
    const coarse = Math.max(c.step || 0.01, (c.max - c.min) / 100);
    this.slider.addEventListener("keydown", (e) => {
      const step = (c.step || 0.01) * (e.shiftKey ? 1 : 4);
      const v = State.get(c.k);
      const key = e.key;
      if (key === "ArrowLeft" || key === "ArrowDown") this.commit(v - step);
      else if (key === "ArrowRight" || key === "ArrowUp") this.commit(v + step);
      else if (key === "PageDown") this.commit(v - coarse);
      else if (key === "PageUp") this.commit(v + coarse);
      else if (key === "Home") this.commit(c.min);
      else if (key === "End") this.commit(c.max);
      else if (key === "Backspace" || key === "Delete") this.commit(c.d);
      else return;
      e.preventDefault();
    });

    // The readout is styled ew-resize, so it had better scrub. A press that
    // never moves falls through to the number editor instead.
    let scrubT = 0;
    drag(this.valueEl, {
      onStart: () => { scrubT = toT(State.get(c.k)); this.slider.classList.add("live"); },
      onMove: (e, start) => {
        const per = e.shiftKey ? 0.0012 : 0.005;
        this.commit(toValue(scrubT + (e.clientX - start.x) * per));
      },
      onEnd: (e, moved) => {
        this.slider.classList.remove("live");
        if (!moved) this.editValue();
      },
    });
  }

  /** Brief highlight so a wheel adjustment is visible without a pointer. */
  flash() {
    this.slider.classList.add("live");
    clearTimeout(this._flash);
    this._flash = setTimeout(() => this.slider.classList.remove("live"), 320);
  }

  editValue() {
    const c = this.cfg;
    const input = el("input", { class: "row-value editing", value: fmtNum(State.get(c.k), c.step) });
    this.valueEl.replaceWith(input);
    input.focus();
    input.select();
    // Escape swaps the editor out, and the blur it causes would swap it out
    // again — so the first exit wins and the second is a no-op.
    let finished = false;
    const done = (save) => {
      if (finished) return;
      finished = true;
      if (save) {
        const n = parseFloat(input.value);
        if (Number.isFinite(n)) this.commit(n);
      }
      input.replaceWith(this.valueEl);
      this.sync();
    };
    input.addEventListener("blur", () => done(true));
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") done(true);
      else if (e.key === "Escape") done(false);
    });
  }

  commit(v) {
    const c = this.cfg;
    const step = c.step || 0.001;
    // Snap to the step, then trim the float dirt: 0.30000000000000004 is not
    // something anyone should meet when they click a value to type over it.
    const dp = (String(step).split(".")[1] || "").length;
    const n = clamp(+(Math.round(v / step) * step).toFixed(dp), c.min, c.max);
    State.set(c.k, n);
    this.sync();
  }

  sync() {
    const c = this.cfg;
    if (!this.slider) return;
    const v = State.get(c.k);
    const t = this.toT(v);
    this.knob.style.left = `${t * 100}%`;
    if (c.bipolar) {
      // Zero is not always the middle: tracking runs -0.08..0.8, so the tick
      // has to sit where zero really is or the fill reads backwards.
      const mid = this.toT(0);
      this.slider.style.setProperty("--mid", `${mid * 100}%`);
      this.fill.style.left = `${Math.min(mid, t) * 100}%`;
      this.fill.style.width = `${Math.abs(t - mid) * 100}%`;
    } else {
      this.fill.style.left = "0";
      this.fill.style.width = `${t * 100}%`;
    }
    const text = fmtNum(v, c.step) + (c.unit || "");
    this.valueEl.textContent = text;
    this.slider.setAttribute("aria-valuenow", String(v));
    this.slider.setAttribute("aria-valuetext", text);
  }
}

/* ---------------------------------------------------------------- segment */

class Segment extends Base {
  draw() {
    const c = this.cfg;
    this.buttons = c.opts.map(([value, label]) =>
      el("button", {
        class: "seg-b", type: "button", role: "radio",
        onclick: () => State.set(c.k, value),
      }, label));
    const group = el("div", {
      class: "seg" + (c.wrap ? " wrap" : ""),
      role: "radiogroup",
      "aria-label": c.l,
      style: c.wrap ? `--cols:${c.wrap}` : "",
    }, this.buttons);

    // A radiogroup is one tab stop and arrows move within it — otherwise the
    // rail costs a hundred presses of Tab to cross.
    group.addEventListener("keydown", (e) => {
      const i = this.buttons.indexOf(document.activeElement);
      if (i < 0) return;
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (!step) return;
      e.preventDefault();
      const next = this.buttons[(i + step + this.buttons.length) % this.buttons.length];
      next.focus();
      next.click();
    });

    const row = this.head(c.l);
    this.append(row, group);
    this.tip(null, row, group);
  }
  sync() {
    if (!this.buttons) return;
    const v = String(State.get(this.cfg.k));
    this.buttons.forEach((b, i) => {
      const on = String(this.cfg.opts[i][0]) === v;
      b.setAttribute("aria-checked", String(on));
      b.tabIndex = on ? 0 : -1;
    });
    // A value outside the options still needs to leave one tab stop behind.
    if (!this.buttons.some((b) => b.tabIndex === 0) && this.buttons[0]) this.buttons[0].tabIndex = 0;
  }
}

/* ----------------------------------------------------------------- toggle */

class Toggle extends Base {
  draw() {
    const c = this.cfg;
    this.btn = el("button", {
      class: "tgl", type: "button", role: "switch", "aria-label": c.l,
      onclick: () => State.set(c.k, !State.get(c.k)),
    }, el("span", { class: "tgl-dot" }));
    const row = el("div", { class: "tgl-row" },
      el("label", { class: "row-label", text: c.l }), this.btn);
    this.append(row);
    this.tip(null, row, this.btn);
  }
  sync() {
    this.btn?.setAttribute("aria-checked", String(!!State.get(this.cfg.k)));
  }
}

/* ------------------------------------------------------------- popovers */

let openPop = null;

function placePop(pop, anchor) {
  const a = anchor.getBoundingClientRect();
  // Width first, from the anchor only — measuring before it is set clamps
  // against the wrong number, and deriving it from the pop makes it ratchet
  // wider every time the reflow handler re-places it.
  pop.style.minWidth = `${Math.max(a.width, 160)}px`;
  pop.style.visibility = "hidden";
  if (!pop.isConnected) document.body.append(pop);

  const p = pop.getBoundingClientRect();
  let left = a.left;
  let top = a.bottom + 4;
  if (left + p.width > innerWidth - 8) left = innerWidth - p.width - 8;
  if (top + p.height > innerHeight - 8) top = Math.max(8, a.top - p.height - 4);
  pop.style.left = `${Math.max(8, left)}px`;
  pop.style.top = `${top}px`;
  pop.style.visibility = "";
}

function showPop(pop, anchor, onClose) {
  closePop();
  hideTip();
  placePop(pop, anchor);

  // Dismiss on pointerdown so it feels immediate, but swallow the click that
  // follows — otherwise closing a menu also presses the control underneath.
  let swallow = false;
  const off = (e) => {
    if (pop.contains(e.target) || anchor.contains(e.target)) return;
    swallow = true;
    closePop();
  };
  const eat = (e) => {
    if (!swallow) return;
    swallow = false;
    e.stopPropagation();
    e.preventDefault();
  };
  const key = (e) => {
    if (e.key === "Escape") { e.stopPropagation(); closePop(); }
  };
  // A popover pinned to a control that has scrolled away is worse than none.
  const reflow = () => {
    if (!pop.isConnected) return;
    const a = anchor.getBoundingClientRect();
    if (a.bottom < 0 || a.top > innerHeight) closePop();
    else placePop(pop, anchor);
  };

  setTimeout(() => {
    addEventListener("pointerdown", off, true);
    addEventListener("click", eat, true);
    addEventListener("keydown", key, true);
    addEventListener("scroll", reflow, true);
    addEventListener("resize", reflow);
  }, 0);

  openPop = () => {
    removeEventListener("pointerdown", off, true);
    setTimeout(() => removeEventListener("click", eat, true), 0);
    removeEventListener("keydown", key, true);
    removeEventListener("scroll", reflow, true);
    removeEventListener("resize", reflow);
    pop.remove();
    onClose?.();
    openPop = null;
  };
}

function closePop() { openPop?.(); }

/** Move roving focus through a popover's enabled items. */
function focusItem(items, index) {
  const list = items.filter((n) => !n.hidden);
  if (!list.length) return;
  const node = list[clamp(index, 0, list.length - 1)];
  node.focus({ preventScroll: true });
  node.scrollIntoView({ block: "nearest" });
}

/* ----------------------------------------------------------------- select */

class Select extends Base {
  draw() {
    const c = this.cfg;
    this.label = el("span", { class: "select-val" });
    this.btn = el("button", {
      class: "select", type: "button", "aria-haspopup": "listbox", "aria-expanded": "false",
      onclick: () => this.open(),
      onkeydown: (e) => {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); this.open(); }
      },
    }, this.label, icon("chevron"));
    const row = this.head(c.l);
    this.append(row, this.btn);
    // Long lists open with a filter field; short ones jump on a letter.
    this.tip(c.opts.length > 10
      ? "Type to filter · arrows to move · Enter to pick"
      : "Arrows to move · type a letter to jump", row, this.btn);
  }

  open() {
    const c = this.cfg;
    const cur = State.get(c.k);
    const pop = el("div", { class: "pop", role: "listbox", "aria-label": c.l });

    const pick = (value) => { State.set(c.k, value); closePop(); };

    const items = c.opts.map(([value, label, tag]) => {
      const item = el("button", {
        class: "pop-item", type: "button", role: "option", tabindex: "-1",
        "aria-selected": String(value === cur),
        "data-label": String(label).toLowerCase(),
        onclick: () => pick(value),
      }, el("span", { text: label }), tag ? el("span", { class: "pop-tag", text: tag }) : null);
      if (c.preview) {
        const face = State.FONT_BY_ID[value];
        if (face) item.firstChild.style.cssText = `font-family:${face.css};font-size:15px;`;
      }
      return item;
    });

    // Long lists get a filter. Short ones would only gain a row of chrome.
    const long = c.opts.length > 10;
    const filter = long ? el("input", {
      class: "pop-filter", type: "text", spellcheck: "false", placeholder: "Filter…",
      "aria-label": `Filter ${c.l}`,
    }) : null;

    const apply = () => {
      const q = (filter?.value || "").trim().toLowerCase();
      let shown = 0;
      for (const item of items) {
        const hit = !q || item.dataset.label.includes(q);
        item.hidden = !hit;
        if (hit) shown++;
      }
      empty.hidden = shown > 0;
    };
    const empty = el("p", { class: "pop-empty", text: "No match", hidden: true });

    filter?.addEventListener("input", apply);

    const list = el("div", { class: "pop-list" }, items, empty);
    if (filter) pop.append(filter);
    pop.append(list);

    pop.addEventListener("keydown", (e) => {
      // While a list is open it owns every key: otherwise typing "r" to find
      // a typeface randomises the composition you were about to apply it to.
      e.stopPropagation();
      const visible = items.filter((n) => !n.hidden);
      const here = visible.indexOf(document.activeElement);
      if (e.key === "ArrowDown") { e.preventDefault(); focusItem(items, here + 1); }
      else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (here <= 0 && filter) filter.focus();
        else focusItem(items, here - 1);
      } else if (e.key === "Home") { e.preventDefault(); focusItem(items, 0); }
      else if (e.key === "End") { e.preventDefault(); focusItem(items, visible.length - 1); }
      else if (e.key === "Enter") {
        e.preventDefault();
        if (here >= 0) visible[here].click();
        else visible[0]?.click();          // Enter in the filter takes the top hit
      } else if (e.key === "Tab") {
        e.preventDefault();                 // the list is the whole world while open
      } else if (!filter && e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
        // No filter field: jump to the next option starting with that letter.
        const ch = e.key.toLowerCase();
        const from = here + 1;
        const next = visible.slice(from).concat(visible.slice(0, from))
          .find((n) => n.dataset.label.startsWith(ch));
        if (next) { next.focus({ preventScroll: true }); next.scrollIntoView({ block: "nearest" }); }
      }
    });

    this.btn.setAttribute("aria-expanded", "true");
    showPop(pop, this.btn, () => {
      this.btn.setAttribute("aria-expanded", "false");
      this.btn.focus({ preventScroll: true });
    });

    const selected = items.find((n) => n.getAttribute("aria-selected") === "true");
    selected?.scrollIntoView({ block: "center" });
    // On a phone, focusing the filter throws up the keyboard over the list.
    if (filter && !isSmall()) filter.focus();
    else (selected || items[0])?.focus({ preventScroll: true });
  }
  sync() {
    if (!this.label) return;
    const v = State.get(this.cfg.k);
    const opt = this.cfg.opts.find((o) => o[0] === v);
    this.label.textContent = opt ? opt[1] : String(v);
    if (this.cfg.preview) {
      const face = State.FONT_BY_ID[v];
      this.label.style.fontFamily = face ? face.css : "";
    }
  }
}

/* ----------------------------------------------------------------- colour */

const SWATCHES = [
  "#ffffff", "#e6e6e8", "#c4c4c9", "#9a9aa1", "#6f6f76", "#48484e", "#2a2a2f", "#141416", "#000000",
  "#ff4b2b", "#ffb020", "#ffe66d", "#5ad07a", "#39c5cf", "#5b8cff", "#a06bff", "#ff6bd6", "#00000000",
];

const RECENT_KEY = "isaiart.design.recent-colours";

function recentColours() {
  const list = store.get(RECENT_KEY, []);
  return Array.isArray(list) ? list.filter((c) => typeof c === "string").slice(0, 9) : [];
}

function rememberColour(hex) {
  if (!hex) return;
  const list = recentColours().filter((c) => c.toLowerCase() !== hex.toLowerCase());
  list.unshift(hex);
  store.set(RECENT_KEY, list.slice(0, 9));
}

class ColorField extends Base {
  draw() {
    const c = this.cfg;
    this.valueEl = el("span", { class: "row-value" });
    this.chip = el("span", { class: "swatch-chip" });
    this.btn = el("button", { class: "swatch", type: "button", "aria-label": c.l,
      onclick: () => this.open() }, this.chip);
    const row = this.head(c.l, this.valueEl);
    this.append(row, this.btn);
    this.tip("EyeDropper" in window
      ? "The dropper in the picker samples any colour on screen"
      : null, row, this.btn);
  }

  open() {
    const c = this.cfg;
    const rgba = hexToRgba(State.get(c.k));
    let { h, s, v } = rgbToHsv(rgba.r, rgba.g, rgba.b);
    let a = rgba.a;

    const sv = el("div", { class: "picker-sv" }, el("div", { class: "picker-dot" }));
    const hue = el("div", { class: "picker-strip hue" }, el("div", { class: "picker-mark" }));
    const alpha = el("div", { class: "picker-strip alpha" }, el("div", { class: "picker-mark" }));
    const hex = el("input", { class: "picker-hex", spellcheck: "false", "aria-label": "Hex value" });

    const chip = (sw) => el("button", {
      type: "button",
      "aria-label": sw === "#00000000" ? "Transparent" : sw.toUpperCase(),
      "data-tip": sw === "#00000000" ? "Transparent" : sw.toUpperCase(),
      style: `background:${sw === "#00000000" ? "transparent" : sw};${sw === "#00000000" ? "background-image:repeating-conic-gradient(var(--bg-4) 0 25%, transparent 0 50%);background-size:8px 8px;" : ""}`,
      onclick: () => { apply(sw); refresh(); },
    });

    const swatches = el("div", { class: "picker-swatches" }, SWATCHES.map(chip));
    const recent = recentColours();
    const recents = recent.length
      ? el("div", { class: "picker-swatches recent" }, recent.map(chip))
      : null;

    // Sampling a colour from anywhere on screen, where the browser allows it.
    const dropper = "EyeDropper" in window ? el("button", {
      class: "btn icon", type: "button",
      "aria-label": "Pick a colour from the screen",
      "data-tip": "Pick a colour from the screen",
      onclick: async () => {
        try {
          const res = await new window.EyeDropper().open();
          apply(res.sRGBHex);
          refresh();
        } catch { /* the user pressed Escape */ }
      },
    }, icon("dropper")) : null;

    const hexRow = el("div", { class: "picker-row" }, hex, dropper);
    const pop = el("div", { class: "pop picker" }, sv, hue, alpha, hexRow, recents, swatches);

    const write = () => {
      const rgb = hsvToRgb(h, s, v);
      State.set(c.k, rgbToHex(rgb.r, rgb.g, rgb.b, a));
      paint();
    };
    const paint = () => {
      const pure = hsvToRgb(h, 1, 1);
      const now = hsvToRgb(h, s, v);
      sv.style.setProperty("--hue", rgbToHex(pure.r, pure.g, pure.b));
      alpha.style.setProperty("--solid", rgbToHex(now.r, now.g, now.b));
      sv.firstChild.style.left = `${s * 100}%`;
      sv.firstChild.style.top = `${(1 - v) * 100}%`;
      hue.firstChild.style.left = `${(h / 360) * 100}%`;
      alpha.firstChild.style.left = `${a * 100}%`;
      hex.value = State.get(c.k).toUpperCase();
    };
    const apply = (value) => {
      const p = hexToRgba(value);
      const hsv = rgbToHsv(p.r, p.g, p.b);
      h = hsv.h; s = hsv.s; v = hsv.v; a = p.a;
      State.set(c.k, value);
    };
    const refresh = () => paint();

    const track = (node, fn) => drag(node, {
      onStart: (e) => fn(e, node.getBoundingClientRect()),
      onMove: (e) => fn(e, node.getBoundingClientRect()),
    });

    track(sv, (e, r) => {
      s = clamp((e.clientX - r.left) / r.width, 0, 1);
      v = 1 - clamp((e.clientY - r.top) / r.height, 0, 1);
      write();
    });
    track(hue, (e, r) => { h = clamp((e.clientX - r.left) / r.width, 0, 1) * 360; write(); });
    track(alpha, (e, r) => { a = clamp((e.clientX - r.left) / r.width, 0, 1); write(); });

    hex.addEventListener("change", () => {
      const value = hex.value.trim().startsWith("#") ? hex.value.trim() : "#" + hex.value.trim();
      apply(value);
      paint();
    });

    // Arrow keys drive the plane and the strips, so a colour is reachable
    // without a pointer.
    const nudge = (node, fn) => {
      node.tabIndex = 0;
      node.addEventListener("keydown", (e) => {
        const big = e.shiftKey ? 10 : 1;
        const dx = (e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0) * big;
        const dy = (e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0) * big;
        if (!dx && !dy) return;
        e.preventDefault();
        fn(dx, dy);
        write();
      });
    };
    nudge(sv, (dx, dy) => {
      s = clamp(s + dx * 0.01, 0, 1);
      v = clamp(v - dy * 0.01, 0, 1);
    });
    nudge(hue, (dx) => { h = (h + dx * 2 + 360) % 360; });
    nudge(alpha, (dx) => { a = clamp(a + dx * 0.02, 0, 1); });

    showPop(pop, this.btn, () => {
      rememberColour(State.get(c.k));
      this.btn.focus({ preventScroll: true });
    });
    paint();
    sv.focus({ preventScroll: true });
  }

  sync() {
    if (!this.chip) return;
    const v = State.get(this.cfg.k);
    this.chip.style.setProperty("--chip", v);
    this.valueEl.textContent = v.toUpperCase();
  }
}

/* -------------------------------------------------------------------- pad */

class Pad extends Base {
  draw() {
    const c = this.cfg;
    this.valueEl = el("span", { class: "row-value" });
    this.dot = el("span", { class: "pad-dot" });
    this.pad = el("div", { class: "pad", role: "application", "aria-label": c.l }, this.dot);
    const row = this.head(c.l, this.valueEl);
    this.append(row, this.pad);
    this.tip("Drag anywhere · arrows when focused · double-click to reset", row, this.pad);

    const put = (x, y) => State.patch({
      [c.keys[0]]: +clamp(x, -1, 1).toFixed(3),
      [c.keys[1]]: +clamp(y, -1, 1).toFixed(3),
    });
    const nudge = (dx, dy) => put(State.get(c.keys[0]) + dx, State.get(c.keys[1]) + dy);

    const set = (e) => {
      const r = this.pad.getBoundingClientRect();
      put(((e.clientX - r.left) / r.width) * 2 - 1, 1 - ((e.clientY - r.top) / r.height) * 2);
    };
    drag(this.pad, {
      onStart: (e) => { this.pad.classList.add("live"); set(e); },
      onMove: set,
      onEnd: () => this.pad.classList.remove("live"),
    });

    this.pad.addEventListener("dblclick", () =>
      State.patch({ [c.keys[0]]: c.d[0], [c.keys[1]]: c.d[1] }));

    // The pad drives framing and drift, so it gets the same treatment as the
    // sliders: arrows, a fine modifier, a reset key and the wheel latch.
    this.pad.tabIndex = 0;
    this.pad.addEventListener("keydown", (e) => {
      const d = e.shiftKey ? 0.005 : 0.02;
      if (e.key === "ArrowLeft") nudge(-d, 0);
      else if (e.key === "ArrowRight") nudge(d, 0);
      else if (e.key === "ArrowUp") nudge(0, d);
      else if (e.key === "ArrowDown") nudge(0, -d);
      else if (e.key === "Home" || e.key === "Backspace" || e.key === "Delete") put(c.d[0], c.d[1]);
      else return;
      e.preventDefault();
    });

    this.pad.addEventListener("wheel", (e) => {
      if (wheelOwner !== this.pad) return;
      const n = notches(e);
      if (!n) return;
      e.preventDefault();
      const d = n * (e.altKey ? 0.01 : 0.04);
      if (e.shiftKey) nudge(d, 0); else nudge(0, d);
    }, { passive: false });
  }
  sync() {
    if (!this.pad) return;
    const [kx, ky] = this.cfg.keys;
    const x = State.get(kx), y = State.get(ky);
    this.dot.style.left = `${((x + 1) / 2) * 100}%`;
    this.dot.style.top = `${((1 - y) / 2) * 100}%`;
    const text = `${x.toFixed(2)} / ${y.toFixed(2)}`;
    this.valueEl.textContent = text;
    this.pad.setAttribute("aria-valuetext", text);
  }
}

/* -------------------------------------------------------------------- vec */

class Vec extends Base {
  draw() {
    const c = this.cfg;
    this.inputs = c.keys.map((key, i) => {
      const input = el("input", {
        type: "number", min: c.min, max: c.max, inputmode: "numeric",
        "aria-label": `${c.l} ${i ? "height" : "width"}`,
      });
      input.addEventListener("change", () => State.set(key, parseFloat(input.value)));
      input.addEventListener("wheel", (e) => {
        if (wheelOwner !== input) return;
        const n = notches(e);
        if (!n) return;
        e.preventDefault();
        const step = e.shiftKey ? 1 : 10;
        State.set(key, Math.round(State.get(key) + n * step));
      }, { passive: false });
      return input;
    });
    const row = this.head(c.l, el("span", { class: "row-value", text: c.unit || "" }));
    const group = el("div", { class: "vec" }, this.inputs);
    this.append(row, group);
    this.tip("Type a number, or scroll over a field · Shift for single steps", row, group);
  }
  sync() {
    this.inputs?.forEach((input, i) => {
      if (document.activeElement !== input) input.value = String(State.get(this.cfg.keys[i]));
    });
  }
}

/* ------------------------------------------------------------------- text */

class TextField extends Base {
  draw() {
    const c = this.cfg;
    this.input = c.area
      ? el("textarea", { class: "field", rows: "3", spellcheck: "false", placeholder: c.ph || "" })
      : el("input", { class: "field", spellcheck: "false", placeholder: c.ph || "" });
    /* Undo and Clear are deliberately allowed to fire while the caret is in
       this field, so the field cannot simply refuse to update while focused —
       it would go stale and the next keystroke would put the old words back.
       Instead, remember what this input last emitted: an echo of our own
       typing is ignored (the caret is safe), anything else is a real change
       from outside and gets written. */
    this.mine = null;

    this.input.addEventListener("compositionstart", () => { this.composing = true; });
    this.input.addEventListener("compositionend", () => {
      this.composing = false;
      this.mine = this.input.value;
      State.set(c.k, this.input.value);
    });
    this.input.addEventListener("input", () => {
      if (this.composing) return;
      this.mine = this.input.value;
      State.set(c.k, this.input.value);
    });

    this.clear = el("button", {
      class: "field-clear", type: "button", "data-tip": "Clear", "aria-label": `Clear ${c.l}`,
      onclick: () => {
        State.patch({ [c.k]: "" }, { source: "clear" });
        this.input.focus();
      },
    }, icon("close"));

    const row = this.head(c.l, this.clear);
    this.append(row, this.input);
    this.tip(null, row, this.input);
  }
  sync() {
    const value = String(State.get(this.cfg.k) ?? "");
    if (this.input && !this.composing && value !== this.mine) {
      this.input.value = value;
      this.mine = value;
      if (document.activeElement === this.input) {
        this.input.setSelectionRange(value.length, value.length);
      }
    }
    if (this.clear) this.clear.hidden = !value.length;
  }
}

/* ------------------------------------------------------------------ emoji */

class EmojiRow extends Base {
  draw() {
    const c = this.cfg;
    const grid = el("div", { class: "picker-swatches", style: "grid-template-columns:repeat(10,1fr);margin-top:5px" },
      State.EMOJI.map((glyph) => el("button", {
        type: "button",
        "aria-label": `Insert ${glyph}`,
        "data-tip": `Insert ${glyph}`,
        style: "background:var(--bg-2);font-size:13px;line-height:1;border-color:var(--line)",
        onclick: () => {
          const cur = State.get("text");
          State.set("text", cur + (cur && !cur.endsWith(" ") && !cur.endsWith("\n") ? " " : "") + glyph);
        },
      }, glyph)));
    const row = this.head(c.l, el("span", { class: "row-value", text: "tap to append" }));
    this.append(row, grid);
    this.tip(null, row, grid);
  }
}

/* ---------------------------------------------------------------- buttons */

const ACTION_ICON = {
  png1: "image", png2: "image", copy: "copy", rec: "record",
  share: "link", save: "save", load: "load", reset: "reset",
  clear: "close", undo: "undo", redo: "redo",
  // The image page's own actions. A button row where half the buttons carry
  // an icon and half do not reads as unfinished, so every action either has
  // one here or the whole row goes without.
  open: "open", paste: "copy", sample: "image",
  detect: "target", invertMask: "swap", clearMask: "close", box: "crop",
};

class Buttons extends Base {
  draw() {
    const c = this.cfg;
    const row = this.head(c.l);
    const group = el("div", { class: "btn-row", style: "margin-top:5px" },
      c.items.map(([id, label]) => el("button", {
        class: "btn", type: "button", "data-action": id,
        onclick: () => this.dispatchEvent(new CustomEvent("iso-action", { detail: id, bubbles: true })),
      }, ACTION_ICON[id] ? icon(ACTION_ICON[id]) : null, el("span", { text: label }))));
    this.append(row, group);
    this.tip(null, row, group);
  }
}

/* ---------------------------------------------------------------- presets */

class Presets extends Base {
  draw() {
    const c = this.cfg;
    const grid = el("div", { style: "display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:5px" },
      State.PRESETS.map((p) => el("button", {
        class: "btn", type: "button", style: "justify-content:flex-start",
        onclick: () => this.dispatchEvent(new CustomEvent("iso-preset", { detail: p.id, bubbles: true })),
      }, p.name)));
    const row = this.head(c.l, el("span", { class: "row-value", text: `${State.PRESETS.length}` }));
    this.append(row, grid);
    this.tip(null, row, grid);
  }
}

customElements.define("iso-slider", Slider);
customElements.define("iso-seg", Segment);
customElements.define("iso-toggle", Toggle);
customElements.define("iso-select", Select);
customElements.define("iso-color", ColorField);
customElements.define("iso-pad", Pad);
customElements.define("iso-vec", Vec);
customElements.define("iso-text", TextField);
customElements.define("iso-emoji", EmojiRow);
customElements.define("iso-buttons", Buttons);
customElements.define("iso-presets", Presets);

window.ISO.tip = { attach: attachTip, hide: hideTip };
window.ISO.closePop = closePop;
window.ISO.showPop = showPop;
window.ISO.CONTROL_TAG = {
  slider: "iso-slider", seg: "iso-seg", toggle: "iso-toggle", select: "iso-select",
  color: "iso-color", pad: "iso-pad", vec: "iso-vec", text: "iso-text",
  emoji: "iso-emoji", buttons: "iso-buttons", presets: "iso-presets",
};
})();
