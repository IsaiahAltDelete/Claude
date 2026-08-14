/* ---------------------------------------------------------------------------
   The rail: tabs, sections and the mobile sheet.

   Nothing here knows what any individual control does — it walks the schema,
   instantiates the matching custom element and keeps dependent rows in sync.
   --------------------------------------------------------------------------- */

(() => {
const { $, el, clamp, isSmall } = window.ISO;
const State = window.ISO.State;
const TAG = window.ISO.CONTROL_TAG;

const deps = [];          // { node, test } pairs re-evaluated on every change

function makeControl(c) {
  const tag = TAG[c.t];
  if (!tag) return null;
  const node = document.createElement(tag);
  node.config = c;
  if (!c.dep) return node;
  const wrap = el("div", { class: "dep" }, node);
  deps.push({ node: wrap, test: c.dep });
  return wrap;
}

function buildRail(railBody, tabsRoot) {
  const panels = [];
  for (const panel of State.SCHEMA) {
    const box = el("div", { class: "panel", id: `panel-${panel.id}`, role: "tabpanel",
      "aria-labelledby": `tab-${panel.id}` });

    for (const sec of panel.sections) {
      const body = el("div", { class: "sec-body" });
      for (const c of sec.controls) {
        const node = makeControl(c);
        if (node) body.append(node);
      }
      const secNode = el("section", { class: "sec" },
        el("div", { class: "sec-head" }, el("h2", { text: sec.title })),
        body);
      if (sec.dep) {
        const wrap = el("div", { class: "dep" }, secNode);
        deps.push({ node: wrap, test: sec.dep });
        box.append(wrap);
      } else {
        box.append(secNode);
      }
    }

    railBody.append(box);
    const tab = el("button", {
      class: "tab", type: "button", role: "tab", id: `tab-${panel.id}`,
      "aria-controls": `panel-${panel.id}`,
      onclick: () => select(panel.id),
    }, panel.label);
    tabsRoot.append(tab);
    panels.push({ id: panel.id, box, tab });
  }

  // Each panel remembers where you left it, so flicking between tabs to
  // compare two settings does not throw you back to the top every time.
  const scrollMemory = new Map();
  let current = null;

  function select(id) {
    if (current === id) {
      // Tapping the open tab on a phone is the natural "put it away" gesture.
      if (isSmall()) {
        const rail = $(".rail");
        rail.dataset.sheet = rail.dataset.sheet === "peek" ? "half" : "peek";
      }
      return;
    }
    if (current) scrollMemory.set(current, railBody.scrollTop);
    current = id;
    for (const p of panels) {
      const on = p.id === id;
      p.box.classList.toggle("on", on);
      p.tab.setAttribute("aria-selected", String(on));
      p.tab.tabIndex = on ? 0 : -1;
    }
    if (isSmall()) {
      const rail = $(".rail");
      if (rail.dataset.sheet === "peek") rail.dataset.sheet = "half";
    }
    railBody.scrollTop = scrollMemory.get(id) || 0;
    window.ISO.store.set("isaiart.design.panel", id);
  }

  // Left/right arrows walk the tab strip, as a tablist should.
  tabsRoot.addEventListener("keydown", (e) => {
    const i = panels.findIndex((p) => p.tab === document.activeElement);
    if (i < 0) return;
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = panels[(i + step + panels.length) % panels.length];
    next.tab.focus();
    select(next.id);
  });

  const remembered = window.ISO.store.get("isaiart.design.panel", null);
  select(panels.some((p) => p.id === remembered) ? remembered : panels[0].id);
  return { select, panels };
}

/** Rows whose parent option is off collapse instead of sitting there greyed. */
function refreshDeps() {
  const s = State.data;
  for (const d of deps) d.node.classList.toggle("on", !!d.test(s));
}

/* ------------------------------------------------------------- the sheet */

function setupSheet(rail, handle) {
  const set = (mode) => {
    rail.dataset.sheet = mode;
    rail.style.transform = "";
  };
  set("peek");

  /* How much of the sheet stays on screen is the handle plus the tab strip —
     measured, not guessed, because the token also drives the stage padding
     and every wrong pixel is artboard that nobody gets to use. */
  let dragging = false;
  const measurePeek = () => {
    if (dragging) return;              // never move a stop under a finger
    const tabs = $("#tabs");
    const px = handle.offsetHeight + (tabs ? tabs.offsetHeight : 0);
    if (px > 20) document.documentElement.style.setProperty("--sheet-peek", `${px}px`);
  };
  measurePeek();
  addEventListener("resize", measurePeek);
  document.fonts?.ready.then(measurePeek);   // the tab strip is set in a webfont

  /** Where each state sits, in pixels of downward offset from fully open. */
  const stops = () => {
    const h = rail.offsetHeight || 1;
    const peek = parseFloat(getComputedStyle(document.documentElement)
      .getPropertyValue("--sheet-peek")) || 116;
    return { full: 0, half: h * 0.42, peek: Math.max(0, h - peek) };
  };

  let startY = 0, startOffset = 0, moved = 0, lastY = 0, lastT = 0, velocity = 0;

  handle.addEventListener("pointerdown", (e) => {
    handle.setPointerCapture(e.pointerId);
    dragging = true;
    moved = 0;
    velocity = 0;
    startY = lastY = e.clientY;
    lastT = e.timeStamp;
    startOffset = stops()[rail.dataset.sheet] ?? 0;
    rail.classList.add("dragging");
  });

  handle.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    moved = e.clientY - startY;
    const dt = e.timeStamp - lastT;
    if (dt > 0) velocity = velocity * 0.6 + ((e.clientY - lastY) / dt) * 0.4;
    lastY = e.clientY;
    lastT = e.timeStamp;
    const s = stops();
    // Follow the finger, with a little resistance past the ends.
    const raw = startOffset + moved;
    const y = raw < 0 ? raw * 0.3 : raw > s.peek ? s.peek + (raw - s.peek) * 0.3 : raw;
    rail.style.transform = `translateY(${y}px)`;
  });

  const release = () => {
    if (!dragging) return;
    dragging = false;
    rail.classList.remove("dragging");
    const s = stops();
    const at = startOffset + moved;

    // A flick beats proximity: throw it and it goes where you threw it.
    if (Math.abs(velocity) > 0.55 && Math.abs(moved) > 8) {
      const order = ["full", "half", "peek"];
      const here = order.indexOf(rail.dataset.sheet);
      const step = velocity > 0 ? 1 : -1;
      set(order[clamp(here + step, 0, order.length - 1)]);
      return;
    }
    if (Math.abs(moved) < 6) {
      // A tap cycles: closed opens, open closes.
      set(rail.dataset.sheet === "peek" ? "half" : rail.dataset.sheet === "half" ? "full" : "peek");
      return;
    }
    const nearest = Object.entries(s)
      .sort((a, b) => Math.abs(a[1] - at) - Math.abs(b[1] - at))[0][0];
    set(nearest);
  };

  handle.addEventListener("pointerup", release);
  handle.addEventListener("pointercancel", release);
  handle.addEventListener("click", (e) => e.preventDefault());

  return set;
}

window.ISO.Rail = { buildRail, refreshDeps, setupSheet };
})();
