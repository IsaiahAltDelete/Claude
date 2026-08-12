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

  function select(id) {
    for (const p of panels) {
      const on = p.id === id;
      p.box.classList.toggle("on", on);
      p.tab.setAttribute("aria-selected", String(on));
    }
    if (isSmall()) {
      const rail = $(".rail");
      if (rail.dataset.sheet === "peek") rail.dataset.sheet = "half";
    }
    railBody.scrollTop = 0;
  }

  select(panels[0].id);
  return { select, panels };
}

/** Rows whose parent option is off collapse instead of sitting there greyed. */
function refreshDeps() {
  const s = State.data;
  for (const d of deps) d.node.classList.toggle("on", !!d.test(s));
}

/* ------------------------------------------------------------- the sheet */

function setupSheet(rail, handle) {
  const set = (mode) => { rail.dataset.sheet = mode; };
  set("peek");

  let startY = 0, startMode = "peek", moved = 0;
  handle.addEventListener("pointerdown", (e) => {
    handle.setPointerCapture(e.pointerId);
    startY = e.clientY;
    startMode = rail.dataset.sheet;
    moved = 0;
  });
  handle.addEventListener("pointermove", (e) => {
    if (!handle.hasPointerCapture?.(e.pointerId)) return;
    moved = e.clientY - startY;
  });
  handle.addEventListener("pointerup", () => {
    const order = ["peek", "half", "full"];
    let i = order.indexOf(startMode);
    if (moved < -30) i = Math.min(order.length - 1, i + 1);
    else if (moved > 30) i = Math.max(0, i - 1);
    else i = startMode === "full" ? 0 : i + 1;
    set(order[clamp(i, 0, 2)]);
  });
  handle.addEventListener("click", (e) => e.preventDefault());

  return set;
}

window.ISO.Rail = { buildRail, refreshDeps, setupSheet };
})();
