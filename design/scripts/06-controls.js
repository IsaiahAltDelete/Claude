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
const { el, icon, clamp, fmtNum, drag, hexToRgba, rgbToHex, rgbToHsv, hsvToRgb } = window.ISO;
const State = window.ISO.State;

/* Non-linear response for ranges where the low end needs the resolution. */
const CURVE = { count: 2.2, size: 1.6, dist: 1.5, depth: 1.4, radius: 1.3 };

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
}

/* ----------------------------------------------------------------- slider */

class Slider extends Base {
  draw() {
    const c = this.cfg;
    this.valueEl = el("button", { class: "row-value", type: "button", title: "Click to type a value" });
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

    this.append(this.head(c.l, this.valueEl), this.slider);

    const curve = CURVE[c.k] || 1;
    const toValue = (t) => c.min + (c.max - c.min) * Math.pow(clamp(t, 0, 1), curve);
    const toT = (v) => Math.pow(clamp((v - c.min) / (c.max - c.min), 0, 1), 1 / curve);
    this.toT = toT;

    let startT = 0, startX = 0, fine = false;
    drag(this.slider, {
      onStart: (e) => {
        this.slider.classList.add("live");
        const r = this.slider.getBoundingClientRect();
        fine = e.shiftKey;
        startX = e.clientX;
        startT = fine ? toT(State.get(c.k)) : clamp((e.clientX - r.left) / r.width, 0, 1);
        if (!fine) this.commit(toValue(startT));
      },
      onMove: (e) => {
        const r = this.slider.getBoundingClientRect();
        const scale = e.shiftKey ? 0.25 : 1;
        const t = fine || e.shiftKey
          ? startT + ((e.clientX - startX) / r.width) * scale
          : clamp((e.clientX - r.left) / r.width, 0, 1);
        this.commit(toValue(t));
      },
      onEnd: () => this.slider.classList.remove("live"),
    });

    this.slider.addEventListener("dblclick", () => this.commit(c.d));
    this.slider.addEventListener("keydown", (e) => {
      const step = (c.step || 0.01) * (e.shiftKey ? 10 : 1);
      const v = State.get(c.k);
      if (e.key === "ArrowLeft" || e.key === "ArrowDown") this.commit(v - step);
      else if (e.key === "ArrowRight" || e.key === "ArrowUp") this.commit(v + step);
      else if (e.key === "Home") this.commit(c.min);
      else if (e.key === "End") this.commit(c.max);
      else return;
      e.preventDefault();
    });

    this.valueEl.addEventListener("click", () => this.editValue());
  }

  editValue() {
    const c = this.cfg;
    const input = el("input", { class: "row-value editing", value: String(State.get(c.k)) });
    this.valueEl.replaceWith(input);
    input.focus();
    input.select();
    const done = (save) => {
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
    let n = Math.round(v / step) * step;
    n = clamp(n, c.min, c.max);
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
      const mid = this.toT(0);
      this.fill.style.left = `${Math.min(mid, t) * 100}%`;
      this.fill.style.width = `${Math.abs(t - mid) * 100}%`;
    } else {
      this.fill.style.left = "0";
      this.fill.style.width = `${t * 100}%`;
    }
    this.valueEl.textContent = fmtNum(v, c.step) + (c.unit || "");
    this.slider.setAttribute("aria-valuenow", String(v));
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
    this.append(this.head(c.l), group);
  }
  sync() {
    if (!this.buttons) return;
    const v = String(State.get(this.cfg.k));
    this.buttons.forEach((b, i) =>
      b.setAttribute("aria-checked", String(String(this.cfg.opts[i][0]) === v)));
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
    this.append(el("div", { class: "tgl-row" },
      el("label", { class: "row-label", text: c.l }), this.btn));
  }
  sync() {
    this.btn?.setAttribute("aria-checked", String(!!State.get(this.cfg.k)));
  }
}

/* ------------------------------------------------------------- popovers */

let openPop = null;

function placePop(pop, anchor) {
  document.body.append(pop);
  const a = anchor.getBoundingClientRect();
  const p = pop.getBoundingClientRect();
  let left = a.left;
  let top = a.bottom + 4;
  if (left + p.width > innerWidth - 8) left = innerWidth - p.width - 8;
  if (top + p.height > innerHeight - 8) top = Math.max(8, a.top - p.height - 4);
  pop.style.left = `${Math.max(8, left)}px`;
  pop.style.top = `${top}px`;
  pop.style.minWidth = `${Math.max(a.width, 160)}px`;
}

function showPop(pop, anchor, onClose) {
  closePop();
  placePop(pop, anchor);
  const off = (e) => {
    if (!pop.contains(e.target) && !anchor.contains(e.target)) closePop();
  };
  const key = (e) => { if (e.key === "Escape") closePop(); };
  setTimeout(() => {
    addEventListener("pointerdown", off, true);
    addEventListener("keydown", key, true);
  }, 0);
  openPop = () => {
    removeEventListener("pointerdown", off, true);
    removeEventListener("keydown", key, true);
    pop.remove();
    onClose?.();
    openPop = null;
  };
}

function closePop() { openPop?.(); }

/* ----------------------------------------------------------------- select */

class Select extends Base {
  draw() {
    const c = this.cfg;
    this.label = el("span", { class: "select-val" });
    this.btn = el("button", { class: "select", type: "button", "aria-haspopup": "listbox",
      onclick: () => this.open() }, this.label, icon("chevron"));
    this.append(this.head(c.l), this.btn);
  }
  open() {
    const c = this.cfg;
    const cur = State.get(c.k);
    const pop = el("div", { class: "pop", role: "listbox" });
    for (const [value, label, tag] of c.opts) {
      const item = el("button", {
        class: "pop-item", type: "button", role: "option",
        "aria-selected": String(value === cur),
        onclick: () => { State.set(c.k, value); closePop(); },
      }, el("span", { text: label }), tag ? el("span", { class: "pop-tag", text: tag }) : null);
      if (c.preview) {
        const face = State.FONT_BY_ID[value];
        if (face) item.firstChild.style.cssText = `font-family:${face.css};font-size:15px;`;
      }
      pop.append(item);
    }
    showPop(pop, this.btn);
    pop.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "center" });
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

class ColorField extends Base {
  draw() {
    const c = this.cfg;
    this.valueEl = el("span", { class: "row-value" });
    this.chip = el("span", { class: "swatch-chip" });
    this.btn = el("button", { class: "swatch", type: "button", "aria-label": c.l,
      onclick: () => this.open() }, this.chip);
    this.append(this.head(c.l, this.valueEl), this.btn);
  }

  open() {
    const c = this.cfg;
    const rgba = hexToRgba(State.get(c.k));
    let { h, s, v } = rgbToHsv(rgba.r, rgba.g, rgba.b);
    let a = rgba.a;

    const sv = el("div", { class: "picker-sv" }, el("div", { class: "picker-dot" }));
    const hue = el("div", { class: "picker-strip hue" }, el("div", { class: "picker-mark" }));
    const alpha = el("div", { class: "picker-strip alpha" }, el("div", { class: "picker-mark" }));
    const hex = el("input", { class: "picker-hex", spellcheck: "false" });
    const swatches = el("div", { class: "picker-swatches" },
      SWATCHES.map((sw) => el("button", {
        type: "button", title: sw,
        style: `background:${sw === "#00000000" ? "transparent" : sw};${sw === "#00000000" ? "background-image:repeating-conic-gradient(var(--bg-4) 0 25%, transparent 0 50%);background-size:8px 8px;" : ""}`,
        onclick: () => { apply(sw); refresh(); },
      })));
    const pop = el("div", { class: "pop picker" }, sv, hue, alpha, hex, swatches);

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

    showPop(pop, this.btn);
    paint();
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
    this.append(this.head(c.l, this.valueEl), this.pad);

    const set = (e) => {
      const r = this.pad.getBoundingClientRect();
      const x = clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1);
      const y = clamp(1 - ((e.clientY - r.top) / r.height) * 2, -1, 1);
      State.patch({ [c.keys[0]]: +x.toFixed(3), [c.keys[1]]: +y.toFixed(3) });
    };
    drag(this.pad, { onStart: set, onMove: set });
    this.pad.addEventListener("dblclick", () =>
      State.patch({ [c.keys[0]]: c.d[0], [c.keys[1]]: c.d[1] }));
  }
  sync() {
    if (!this.pad) return;
    const [kx, ky] = this.cfg.keys;
    const x = State.get(kx), y = State.get(ky);
    this.dot.style.left = `${((x + 1) / 2) * 100}%`;
    this.dot.style.top = `${((1 - y) / 2) * 100}%`;
    this.valueEl.textContent = `${x.toFixed(2)} / ${y.toFixed(2)}`;
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
      return input;
    });
    this.append(this.head(c.l, el("span", { class: "row-value", text: c.unit || "" })),
      el("div", { class: "vec" }, this.inputs));
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
    this.input.addEventListener("input", () => State.set(c.k, this.input.value));
    this.append(this.head(c.l), this.input);
  }
  sync() {
    if (this.input && document.activeElement !== this.input) this.input.value = State.get(this.cfg.k);
  }
}

/* ------------------------------------------------------------------ emoji */

class EmojiRow extends Base {
  draw() {
    const c = this.cfg;
    const grid = el("div", { class: "picker-swatches", style: "grid-template-columns:repeat(10,1fr);margin-top:5px" },
      State.EMOJI.map((glyph) => el("button", {
        type: "button", title: `Insert ${glyph}`,
        style: "background:var(--bg-2);font-size:13px;line-height:1;border-color:var(--line)",
        onclick: () => {
          const cur = State.get("text");
          State.set("text", cur + (cur && !cur.endsWith(" ") && !cur.endsWith("\n") ? " " : "") + glyph);
        },
      }, glyph)));
    this.append(this.head(c.l, el("span", { class: "row-value", text: "tap to append" })), grid);
  }
}

/* ---------------------------------------------------------------- buttons */

const ACTION_ICON = {
  png1: "image", png2: "image", copy: "copy", rec: "record",
  share: "link", save: "save", load: "load", reset: "reset",
};

class Buttons extends Base {
  draw() {
    const c = this.cfg;
    this.append(this.head(c.l),
      el("div", { class: "btn-row", style: "margin-top:5px" },
        c.items.map(([id, label]) => el("button", {
          class: "btn", type: "button", "data-action": id,
          onclick: () => this.dispatchEvent(new CustomEvent("iso-action", { detail: id, bubbles: true })),
        }, ACTION_ICON[id] ? icon(ACTION_ICON[id]) : null, el("span", { text: label })))));
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
    this.append(this.head(c.l, el("span", { class: "row-value", text: `${State.PRESETS.length}` })), grid);
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

window.ISO.closePop = closePop;
window.ISO.CONTROL_TAG = {
  slider: "iso-slider", seg: "iso-seg", toggle: "iso-toggle", select: "iso-select",
  color: "iso-color", pad: "iso-pad", vec: "iso-vec", text: "iso-text",
  emoji: "iso-emoji", buttons: "iso-buttons", presets: "iso-presets",
};
})();
