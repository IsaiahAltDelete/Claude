/* ---------------------------------------------------------------------------
   The parameter store.

   Both pages describe themselves as a schema of panels and controls, and both
   need the same machinery around it: defaults, validation, change
   notification, an undo history, a compact diff for links and files. That
   machinery is here, and each page supplies only its own schema, presets and
   randomiser.

   A store is created once per page and published as window.ISO.State, which
   is what the shared controls and rail read.
   --------------------------------------------------------------------------- */

(() => {
const { clamp, encodeState, decodeState } = window.ISO;

const HISTORY_LIMIT = 80;
const COALESCE_MS = 650;

/**
 * @param SCHEMA      array of panels: { id, label, sections: [{ title, dep, controls }] }
 * @param extras      merged onto the returned store (PRESETS, enumerations, …)
 * @param noRandom    keys the randomiser must never touch
 * @param randomize   fn(helpers) -> patch object, or omitted for no randomiser
 * @param clearPatch  what State.clear() applies
 */
function createStore({ SCHEMA, extras = {}, noRandom = [], randomize, clearPatch = {} }) {
  /* ------------------------------------------------- flatten + defaults */

  const FIELDS = new Map();     // key → control descriptor
  const DEFAULTS = {};

  for (const panel of SCHEMA) {
    for (const sec of panel.sections) {
      for (const c of sec.controls) {
        c.panel = panel.id;
        if (c.t === "pad" || c.t === "vec") {
          // Two-axis controls carry one descriptor but two state keys.
          c.keys.forEach((key, i) => {
            FIELDS.set(key, { ...c, k: key, t: c.t === "pad" ? "padAxis" : "vecAxis", index: i });
            DEFAULTS[key] = c.d[i];
          });
        } else if (c.d !== undefined) {
          FIELDS.set(c.k, c);
          DEFAULTS[c.k] = c.d;
        }
      }
    }
  }

  const NO_RANDOM = new Set(noRandom);
  const state = { ...DEFAULTS };
  const listeners = new Set();

  /* ------------------------------------------------------------ history

     Randomise, presets and Reset can wipe out a composition in one keystroke,
     so every change is undoable. Snapshots are whole states — a few dozen
     numbers — which is trivial next to being able to get your work back.

     Consecutive edits to the same control coalesce: dragging a slider for
     three seconds leaves one undo step, not three hundred. A pause longer
     than the window, or touching a different control, starts a new step. */

  const past = [];
  const future = [];
  let restoring = false;
  let notifying = 0;
  let lastMark = "";
  let lastMarkAt = -Infinity;

  function record(keys, source) {
    const now = performance.now();
    if (source === "app") {
      const mark = keys.slice().sort().join(",");
      const continuing = mark === lastMark && now - lastMarkAt < COALESCE_MS;
      lastMark = mark;
      lastMarkAt = now;
      if (continuing) return;
    } else {
      // Randomise, presets, reset and file loads are always their own step.
      lastMark = "";
      lastMarkAt = now;
    }
    past.push({ ...state });
    if (past.length > HISTORY_LIMIT) past.shift();
    future.length = 0;
  }

  /* --------------------------------------------------------- validation */

  function normalise(k, v) {
    const f = FIELDS.get(k);
    if (!f) return v;
    if (f.t === "slider" || f.t === "vecAxis" || f.t === "padAxis") {
      const min = f.min ?? -Infinity, max = f.max ?? Infinity;
      let n = Number(v);
      if (!Number.isFinite(n)) n = DEFAULTS[k];
      if (f.int) n = Math.round(n);
      return clamp(n, min, max);
    }
    if (f.t === "toggle") return !!v;
    if (f.t === "seg" && f.opts) {
      const hit = f.opts.find((o) => String(o[0]) === String(v));
      return hit ? hit[0] : DEFAULTS[k];
    }
    if (f.t === "select" && f.opts) {
      return f.opts.some((o) => o[0] === v) ? v : DEFAULTS[k];
    }
    return v;
  }

  function fxOf(keys) {
    const fx = new Set();
    for (const k of keys) {
      const f = FIELDS.get(k);
      if (f?.fx) fx.add(f.fx);
    }
    return fx;
  }

  /* ------------------------------------------------------------- helpers

     Handed to the page's randomiser so every page rolls dice the same way. */

  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const rand = (a, b) => a + Math.random() * (b - a);
  const chance = (p) => Math.random() < p;

  const State = {
    SCHEMA, FIELDS, DEFAULTS,
    data: state,
    ...extras,

    get: (k) => state[k],

    /** Apply one or many keys. `silent` skips notification (used on load). */
    patch(obj, { silent = false, source = "app", history = true } = {}) {
      const pending = [];
      for (const [k, raw] of Object.entries(obj)) {
        if (!(k in DEFAULTS)) continue;
        const v = normalise(k, raw);
        if (state[k] === v) continue;
        pending.push([k, v]);
      }
      if (!pending.length) return [];

      /* Snapshot before mutating, so undo lands on the state you could see.
         A patch raised from inside a notification — a weight clamped to one
         the new typeface actually has, a canvas size following a ratio — is a
         consequence of the change already recorded, not a step of its own;
         folding it in is what makes one undo reverse one user action. */
      if (history && !restoring && !silent && notifying === 0) {
        record(pending.map(([k]) => k), source);
      }

      const changed = [];
      for (const [k, v] of pending) {
        state[k] = v;
        changed.push(k);
      }
      if (!silent) {
        const payload = { keys: changed, fx: fxOf(changed), source };
        notifying++;
        try {
          listeners.forEach((fn) => fn(payload));
        } finally {
          notifying--;
        }
      }
      return changed;
    },

    set(k, v, opts) { return State.patch({ [k]: v }, opts); },

    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,

    undo() {
      if (!past.length) return false;
      future.push({ ...state });
      const snapshot = past.pop();
      restoring = true;
      lastMark = "";
      State.patch(snapshot, { source: "undo" });
      restoring = false;
      return true;
    },

    redo() {
      if (!future.length) return false;
      past.push({ ...state });
      const snapshot = future.pop();
      restoring = true;
      lastMark = "";
      State.patch(snapshot, { source: "redo" });
      restoring = false;
      return true;
    },

    /** Only the keys that differ from defaults — keeps links and saves short. */
    diff() {
      const out = {};
      for (const [k, v] of Object.entries(state)) if (v !== DEFAULTS[k]) out[k] = v;
      return out;
    },

    encode: () => encodeState(State.diff()),

    applyEncoded(str, opts) {
      const obj = decodeState(str);
      if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
      State.patch({ ...DEFAULTS, ...obj }, opts);
      return true;
    },

    /** Both return the keys they changed, so callers can tell you the truth. */
    reset(opts) { return State.patch({ ...DEFAULTS }, { source: "reset", ...opts }); },

    clear() { return State.patch({ ...clearPatch }, { source: "clear" }); },

    randomize() {
      if (!randomize) return [];
      const patch = randomize({
        pick, rand, chance,
        DEFAULTS, FIELDS, data: state,
        PRESETS: extras.PRESETS || [],
      });
      for (const k of NO_RANDOM) delete patch[k];
      return State.patch(patch, { source: "random" });
    },

    applyPreset(id) {
      const p = (extras.PRESETS || []).find((x) => x.id === id);
      if (!p) return [];
      return State.patch({ ...DEFAULTS, ...p.patch }, { source: "preset" });
    },
  };

  return State;
}

window.ISO.createStore = createStore;
})();
