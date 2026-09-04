/* ---------------------------------------------------------------------------
   ClaudeVenture — the interface.

   Everything outside the canvas: the money, the buy buttons, the wardrobe, the
   toasts, the numbers that float up off a sale. It reads the game and calls
   four or five methods on it, and the game does not know this file exists.

   Two things here are worth knowing before you edit it.

   **The DOM is built once and then only written to.** An idle game's numbers
   change every frame; rebuilding a card per frame is how you get a 200 ms
   input delay on a phone. Every card is constructed on first paint, its live
   nodes are kept on the card object, and the update loop assigns to
   `textContent` and toggles two classes. Nothing is created after the first
   frame except toasts.

   **Item icons are rendered, not drawn.** A wardrobe tile shows the garment
   itself — just the hat, just the boots, nothing wearing them — rasterised on
   the CPU by the same code that bakes the sheets in voxel/assets, lazily, once
   each, and cached as a data URL. Fifty-one icons cost about as much as one
   frame of the game.
   --------------------------------------------------------------------------- */

(function (root) {
'use strict';

const CV = root.CV;
const VOX = root.VOX;
if (!CV || !CV.Scene) throw new Error('ClaudeVenture: load 06-scene.js first');

const C = CV.Content;
const People = CV.People;
const doc = root.document;

const el = (tag, className, text) => {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const hex = value => VOX.util.hex(value);

/* Icons are one emoji each. A voxel thumbnail for a machine would be lovely
   and would also be twelve more rasterised images on the critical path. */
const STATION_ICON = {
  juice: '🍋', fryer: '🍟', grill: '🍔', bakery: '🥐', boba: '🧋', smoothie: '🥤',
  donut: '🍩', gelato: '🍦', pizza: '🍕', coffee: '☕', taco: '🌮', sushi: '🍣',
};
const SLOT_ICON = { hat: '🎩', face: '🕶️', top: '👕', bottom: '👖', shoes: '👟', back: '🎒' };

/* --------------------------------------------------------- item icons --- */

const iconCache = new Map();

/** The garment on its own, rasterised once, as a data URL. */
function itemIcon(item) {
  if (iconCache.has(item.id)) return iconCache.get(item.id);
  let url = '';
  try {
    const model = VOX.model(`icon-${item.id}`);
    item.build(model, item.tint || CV.P.white);
    if (model.size) {
      model.ground();
      const image = VOX.Raster.render(VOX.mesh(model), {
        width: 72, height: 72, samples: 2, yaw: 34, pitch: 20, zoom: 0.92,
        projection: 'orthographic',
      });
      const canvas = doc.createElement('canvas');
      canvas.width = 72; canvas.height = 72;
      canvas.getContext('2d').putImageData(new ImageData(image.data, 72, 72), 0, 0);
      url = canvas.toDataURL('image/png');
    }
  } catch (error) {
    url = '';
  }
  iconCache.set(item.id, url);
  return url;
}

/* ================================================================== HUD === */

class Hud {
  constructor(mount, game, scene) {
    this.game = game;
    this.scene = scene;
    this.root = mount;
    this.tab = 'shop';
    this.wardrobeSlot = 'hat';
    this.buyMode = 1;
    this.popNodes = new Map();
    this.toastTimer = 0;
    this.lastPaint = 0;
    this.build();
    this.paint(true);
  }

  /* ------------------------------------------------------------- build */

  build() {
    const mount = this.root;
    mount.innerHTML = '';

    /* ---- top bar ---- */
    const top = el('div', 'cv-top');
    this.cashNode = el('b', 'cv-cash', '0');
    this.gemNode = el('b', 'cv-gems', '0');
    const purse = el('div', 'cv-purse');
    const cashChip = el('div', 'cv-chip cv-chip-cash');
    cashChip.append(el('span', 'cv-chip-icon', '💰'), this.cashNode);
    const gemChip = el('div', 'cv-chip cv-chip-gem');
    gemChip.append(el('span', 'cv-chip-icon', '💎'), this.gemNode);
    purse.append(cashChip, gemChip);

    const place = el('div', 'cv-place');
    this.shopName = el('b', null, '');
    this.shopSub = el('span', 'cv-place-sub', '');
    place.append(this.shopName, this.shopSub);
    this.progressFill = el('i', 'cv-progress-fill');
    const progress = el('div', 'cv-progress');
    progress.append(this.progressFill);
    place.append(progress);

    this.moveButton = el('button', 'cv-move', 'Move on');
    this.moveButton.type = 'button';
    this.moveButton.addEventListener('click', () => this.tryMove());

    top.append(purse, place, this.moveButton);
    mount.append(top);

    /* ---- floating numbers ---- */
    this.popLayer = el('div', 'cv-pops');
    mount.append(this.popLayer);

    /* ---- toasts ---- */
    this.toastLayer = el('div', 'cv-toasts');
    mount.append(this.toastLayer);

    /* ---- the tray ---- */
    const tray = el('div', 'cv-tray');
    const tabs = el('div', 'cv-tabs');
    this.tabButtons = {};
    for (const [id, label, icon] of [['shop', 'Shop', '🏪'], ['crew', 'Upgrades', '⭐'],
      ['wear', 'Wardrobe', '👗'], ['stats', 'Stats', '📈']]) {
      const button = el('button', 'cv-tab');
      button.type = 'button';
      button.append(el('span', 'cv-tab-icon', icon), el('span', 'cv-tab-label', label));
      button.addEventListener('click', () => this.show(id));
      tabs.append(button);
      this.tabButtons[id] = button;
    }
    tray.append(tabs);

    this.panels = {};
    for (const id of ['shop', 'crew', 'wear', 'stats']) {
      const panel = el('div', 'cv-panel');
      panel.dataset.panel = id;
      this.panels[id] = panel;
      tray.append(panel);
    }
    mount.append(tray);

    this.buildShop();
    this.buildUpgrades();
    this.buildWardrobe();
    this.buildStats();
    this.show('shop');

    /* ---- modal ---- */
    this.modal = el('div', 'cv-modal');
    this.modal.hidden = true;
    this.modalCard = el('div', 'cv-modal-card');
    this.modal.append(this.modalCard);
    this.modal.addEventListener('click', event => {
      if (event.target === this.modal) this.closeModal();
    });
    mount.append(this.modal);
  }

  /* --------------------------------------------------------- shop tab */

  buildShop() {
    const panel = this.panels.shop;
    panel.innerHTML = '';

    const modes = el('div', 'cv-modes');
    this.modeButtons = {};
    for (const mode of [1, 10, 'max']) {
      const button = el('button', 'cv-mode', mode === 'max' ? 'MAX' : `×${mode}`);
      button.type = 'button';
      button.addEventListener('click', () => { this.buyMode = mode; this.paint(true); });
      modes.append(button);
      this.modeButtons[mode] = button;
    }
    panel.append(modes);

    this.stationCards = this.game.stations.map(station => {
      const card = el('button', 'cv-card cv-station');
      card.type = 'button';
      const icon = el('span', 'cv-card-icon', STATION_ICON[station.def.machine] || '🍽️');
      const body = el('span', 'cv-card-body');
      const name = el('span', 'cv-card-name', station.def.name);
      const meta = el('span', 'cv-card-meta', '');
      const barTrack = el('span', 'cv-bar');
      const barFill = el('i', 'cv-bar-fill');
      barTrack.append(barFill);
      body.append(name, meta, barTrack);
      const buy = el('span', 'cv-card-buy');
      const price = el('b', null, '');
      const count = el('small', null, '');
      buy.append(price, count);
      card.append(icon, body, buy);
      card.style.setProperty('--tint', hex(station.def.color));
      card.addEventListener('click', () => this.buyStation(station.slot));
      panel.append(card);
      return { station, card, name, meta, price, count, barFill, icon };
    });
  }

  buildUpgrades() {
    const panel = this.panels.crew;
    panel.innerHTML = '';
    panel.append(el('p', 'cv-note', 'Bought once, kept forever — these carry across every shop you ever open.'));
    this.upgradeCards = C.UPGRADES.map(def => {
      const card = el('button', 'cv-card cv-upgrade');
      card.type = 'button';
      const icon = el('span', 'cv-card-icon', def.icon);
      const body = el('span', 'cv-card-body');
      const name = el('span', 'cv-card-name', def.name);
      const meta = el('span', 'cv-card-meta', def.blurb);
      const effect = el('span', 'cv-card-effect', '');
      body.append(name, meta, effect);
      const buy = el('span', 'cv-card-buy');
      const price = el('b', null, '');
      const level = el('small', null, '');
      buy.append(price, level);
      card.append(icon, body, buy);
      card.addEventListener('click', () => {
        if (this.game.buyUpgrade(def.id)) { this.scene.cheer(); this.paint(true); }
      });
      panel.append(card);
      return { def, card, effect, price, level };
    });
  }

  /* ----------------------------------------------------- wardrobe tab */

  buildWardrobe() {
    const panel = this.panels.wear;
    panel.innerHTML = '';

    const head = el('div', 'cv-wear-head');
    this.previewCanvas = el('canvas', 'cv-preview');
    this.previewCanvas.width = 132; this.previewCanvas.height = 132;
    const summary = el('div', 'cv-wear-summary');
    this.boostList = el('ul', 'cv-boosts');
    summary.append(el('h3', null, 'What you are wearing'), this.boostList);
    head.append(this.previewCanvas, summary);
    panel.append(head);

    const chips = el('div', 'cv-chips');
    this.slotChips = {};
    for (const slot of People.SLOTS) {
      const chip = el('button', 'cv-slotchip');
      chip.type = 'button';
      chip.append(el('span', null, SLOT_ICON[slot] || '•'), el('small', null, slot));
      chip.addEventListener('click', () => { this.wardrobeSlot = slot; this.paint(true); });
      chips.append(chip);
      this.slotChips[slot] = chip;
    }
    panel.append(chips);

    this.wearGrid = el('div', 'cv-grid');
    panel.append(this.wearGrid);

    this.wearTiles = People.WEAR.map(item => {
      const tile = el('button', 'cv-wear');
      tile.type = 'button';
      tile.dataset.slot = item.slot;
      tile.dataset.rarity = item.rarity;
      const art = el('span', 'cv-wear-art');
      const image = el('img');
      image.alt = '';
      image.loading = 'lazy';
      art.append(image);
      const name = el('span', 'cv-wear-name', item.name);
      const note = el('span', 'cv-wear-note', '');
      tile.append(art, name, note);
      tile.style.setProperty('--rare', hex(C.RARITY[item.rarity].color));
      tile.addEventListener('click', () => this.pickWear(item));
      this.wearGrid.append(tile);
      return { item, tile, image, note };
    });
  }

  pickWear(item) {
    const game = this.game;
    if (game.owned[item.id]) {
      game.equip(item.slot, game.equipped[item.slot] === item.id ? null : item.id);
    } else if (!game.buyWithGems(item.id)) {
      this.toast(`${C.GEM_PRICE[item.rarity]} gems for ${item.name} — you have ${game.gems}.`, 'warn');
      return;
    }
    this.scene.cheer();
    this.previewDirty = true;
    this.paint(true);
  }

  /* -------------------------------------------------------- stats tab */

  buildStats() {
    const panel = this.panels.stats;
    panel.innerHTML = '';
    this.statRows = {};
    const list = el('dl', 'cv-stats');
    for (const [id, label] of [['life', 'Lifetime takings'], ['rate', 'Takings per second'],
      ['served', 'Guests served'], ['boxes', 'Boxes opened'], ['wear', 'Wardrobe found'],
      ['crew', 'Crew on shift'], ['renderer', 'Renderer']]) {
      const dt = el('dt', null, label);
      const dd = el('dd', null, '—');
      list.append(dt, dd);
      this.statRows[id] = dd;
    }
    panel.append(list);

    const reset = el('button', 'cv-danger', 'Start over');
    reset.type = 'button';
    reset.addEventListener('click', () => this.confirmReset());
    panel.append(el('p', 'cv-note', 'Everything is stored in this browser and nowhere else. '
      + 'Nothing is uploaded, and there is no account.'), reset);
  }

  confirmReset() {
    this.openModal({
      title: 'Start over?',
      body: 'Every shop, every upgrade and the whole wardrobe. There is no undo.',
      accent: CV.P.tomato,
      actions: [
        ['Keep playing', () => this.closeModal()],
        ['Wipe it', () => { this.closeModal(); this.onReset && this.onReset(); }, 'danger'],
      ],
    });
  }

  /* ------------------------------------------------------------ tabs */

  show(id) {
    this.tab = id;
    for (const key of Object.keys(this.panels)) {
      this.panels[key].hidden = key !== id;
      this.tabButtons[key].setAttribute('aria-pressed', String(key === id));
    }
    if (id === 'wear') this.previewDirty = true;
    this.paint(true);
  }

  /* -------------------------------------------------------- purchases */

  buyStation(slot) {
    const game = this.game;
    const before = game.stations[slot].level;
    if (!game.buyStation(slot, game.stations[slot].unlocked ? this.buyMode : 1)) {
      this.pulse(this.stationCards[slot].card);
      return;
    }
    if (game.stations[slot].level > before) this.scene.cheer();
    this.paint(true);
  }

  tryMove() {
    const game = this.game;
    const next = C.SHOPS[game.shopIndex + 1];
    if (!next) return;
    if (!game.canMoveOn()) {
      this.toast(`Take ${C.money(game.shop.target)} lifetime to unlock ${next.name}.`, 'warn');
      return;
    }
    if (game.cash < next.unlock) {
      this.toast(`${C.money(next.unlock)} to move into ${next.name}.`, 'warn');
      return;
    }
    this.openModal({
      title: `Move to ${next.name}?`,
      body: `${next.blurb} Your machines start again at level one — everything you have `
        + 'bought, found and put on comes with you, and the new shop pays far better.',
      accent: next.accent,
      actions: [
        ['Not yet', () => this.closeModal()],
        [`Move in — ${C.money(next.unlock)}`, () => { this.closeModal(); game.moveOn(); }, 'go'],
      ],
    });
  }

  /* ------------------------------------------------------------ modal */

  openModal({ title, body, accent, actions, art }) {
    this.modalCard.innerHTML = '';
    this.modalCard.style.setProperty('--tint', hex(accent || CV.P.bodyMint));
    if (art) this.modalCard.append(art);
    this.modalCard.append(el('h2', null, title), el('p', null, body));
    const row = el('div', 'cv-modal-actions');
    for (const [label, action, kind] of actions) {
      const button = el('button', `cv-modal-button${kind ? ` cv-${kind}` : ''}`, label);
      button.type = 'button';
      button.addEventListener('click', action);
      row.append(button);
    }
    this.modalCard.append(row);
    this.modal.hidden = false;
  }

  closeModal() { this.modal.hidden = true; }

  /* ----------------------------------------------------------- toasts */

  toast(text, kind = '') {
    const node = el('div', `cv-toast${kind ? ` cv-toast-${kind}` : ''}`, text);
    this.toastLayer.append(node);
    root.setTimeout(() => {
      node.classList.add('cv-out');
      root.setTimeout(() => node.remove(), 400);
    }, 3200);
    while (this.toastLayer.children.length > 4) this.toastLayer.firstChild.remove();
  }

  pulse(node) {
    node.classList.remove('cv-nope');
    /* Reading offsetWidth restarts the animation; without it a second failed
       tap on the same button does nothing at all. */
    void node.offsetWidth;
    node.classList.add('cv-nope');
  }

  /* ------------------------------------------------------ game events */

  handle(event) {
    const game = this.game;
    switch (event.type) {
      case 'hint': this.toast(event.detail.text); break;
      case 'evolved':
        this.toast(`${event.detail.station.def.name} levelled up to tier ${event.detail.tier}!`, 'good');
        break;
      case 'box': this.showBox(event.detail); break;
      case 'moved':
        this.toast(`Welcome to ${event.detail.shop.name}. +${event.detail.gems} gems.`, 'good');
        this.buildShop();
        this.paint(true);
        break;
      case 'shop': this.buildShop(); break;
      case 'found': this.toast(`Unlocked ${event.detail.item.name}.`, 'good'); break;
      case 'lost':
        if (game.guests.length > 2) this.toast('A guest gave up waiting. More crew?', 'warn');
        break;
      default: break;
    }
  }

  showBox(detail) {
    const art = el('div', 'cv-prize');
    if (detail.item) {
      const image = el('img');
      image.src = itemIcon(detail.item);
      image.alt = '';
      art.append(image);
    } else {
      art.append(el('span', 'cv-prize-gem', '💎'));
    }
    this.openModal({
      title: detail.item ? detail.item.name : `+${detail.gems} gems`,
      body: detail.item
        ? `${C.RARITY[detail.rarity].name} · ${this.boostLabel(detail.item)} · and ${detail.gems} gems.`
        : `A ${C.RARITY[detail.rarity].name.toLowerCase()} box, and you already own everything in it.`,
      accent: C.RARITY[detail.rarity].color,
      art,
      actions: [
        ['Nice', () => this.closeModal()],
        detail.item ? ['Wear it', () => {
          this.game.equip(detail.item.slot, detail.item.id);
          this.previewDirty = true;
          this.closeModal();
          this.show('wear');
        }, 'go'] : null,
      ].filter(Boolean),
    });
  }

  boostLabel(item) {
    if (!item.boost) return 'purely decorative';
    const [stat, amount] = item.boost;
    return `+${Math.round(amount * 100)}% ${C.BOOSTS[stat].name.toLowerCase()}`;
  }

  /* ------------------------------------------------------------ paint */

  /** Called every frame; does real work at 10 Hz unless something forced it. */
  paint(force) {
    const now = root.performance ? root.performance.now() : Date.now();
    if (!force && now - this.lastPaint < 100) { this.paintPops(); return; }
    this.lastPaint = now;
    const game = this.game;

    this.cashNode.textContent = C.money(game.cash);
    this.gemNode.textContent = C.money(game.gems);
    this.shopName.textContent = game.shop.name;

    const next = C.SHOPS[game.shopIndex + 1];
    const ratio = next ? Math.min(1, game.lifetime / game.shop.target) : 1;
    this.progressFill.style.width = `${(ratio * 100).toFixed(1)}%`;
    this.shopSub.textContent = next
      ? `${C.money(game.lifetime)} / ${C.money(game.shop.target)} lifetime`
      : `${C.money(game.lifetime)} lifetime · the top floor`;
    this.moveButton.hidden = !next;
    const ready = next && game.canMoveOn() && game.cash >= next.unlock;
    this.moveButton.classList.toggle('cv-ready', !!ready);
    this.moveButton.textContent = next
      ? (game.canMoveOn() ? `Move on — ${C.money(next.unlock)}` : 'Move on')
      : 'Top floor';

    for (const mode of [1, 10, 'max']) {
      this.modeButtons[mode].setAttribute('aria-pressed', String(this.buyMode === mode));
    }

    for (const entry of this.stationCards) {
      const station = entry.station;
      const locked = !station.unlocked;
      const price = locked
        ? C.stationCost(station, game.scale)
        : C.bulkCost(station, game.scale,
          this.buyMode === 'max' ? Math.max(1, C.affordableLevels(station, game.scale, game.cash)) : this.buyMode);
      const levels = locked ? 1
        : (this.buyMode === 'max' ? Math.max(1, C.affordableLevels(station, game.scale, game.cash)) : this.buyMode);
      entry.price.textContent = C.money(price);
      entry.count.textContent = locked ? 'unlock' : `+${levels}`;
      entry.card.classList.toggle('cv-locked', locked);
      entry.card.classList.toggle('cv-afford', game.cash >= price);
      entry.meta.textContent = locked
        ? 'Not open yet'
        : `Lv ${station.level} · ${C.money(game.dishValue(station))} a dish · tier ${C.stationTier(station.level)}`;
      const cap = C.stationCapacity(station);
      entry.barFill.style.width = `${Math.min(100, (station.stock / cap) * 100).toFixed(0)}%`;
      entry.barFill.classList.toggle('cv-full', station.stock >= cap);
    }

    for (const entry of this.upgradeCards) {
      const level = game.level(entry.def.id);
      const maxed = level >= entry.def.max;
      const price = C.upgradeCost(entry.def, level);
      entry.effect.textContent = entry.def.effect(level);
      entry.price.textContent = maxed ? 'MAX' : C.money(price);
      entry.level.textContent = `Lv ${level}/${entry.def.max}`;
      entry.card.classList.toggle('cv-afford', !maxed && game.cash >= price);
      entry.card.classList.toggle('cv-locked', maxed);
    }

    if (this.tab === 'wear') this.paintWardrobe();
    if (this.tab === 'stats') this.paintStats();
    this.paintPops();
  }

  paintWardrobe() {
    const game = this.game;
    for (const slot of People.SLOTS) {
      this.slotChips[slot].setAttribute('aria-pressed', String(this.wardrobeSlot === slot));
    }
    for (const entry of this.wearTiles) {
      const item = entry.item;
      const show = item.slot === this.wardrobeSlot;
      entry.tile.hidden = !show;
      if (!show) continue;
      if (!entry.image.src) entry.image.src = itemIcon(item);
      const owned = !!game.owned[item.id];
      const worn = game.equipped[item.slot] === item.id;
      entry.tile.classList.toggle('cv-owned', owned);
      entry.tile.classList.toggle('cv-worn', worn);
      entry.note.textContent = owned
        ? (worn ? 'Wearing' : this.boostLabel(item))
        : `💎 ${C.GEM_PRICE[item.rarity]}`;
    }
    const boosts = game.boosts();
    this.boostList.innerHTML = '';
    let any = false;
    for (const [stat, amount] of Object.entries(boosts)) {
      if (amount <= 0) continue;
      any = true;
      const row = el('li');
      row.append(el('b', null, `+${Math.round(amount * 100)}%`), el('span', null, C.BOOSTS[stat].name));
      this.boostList.append(row);
    }
    if (!any) this.boostList.append(el('li', 'cv-dim', 'Nothing equipped yet.'));
    if (this.previewDirty) this.paintPreview();
  }

  /** The avatar, drawn by the software rasteriser — the one place in the game
      the CPU renderer is used on purpose rather than as a fallback. */
  paintPreview() {
    this.previewDirty = false;
    const game = this.game;
    const look = {
      skin: People.SKINS[2], hair: People.HAIRS[1], hairStyle: 'short', eyes: CV.P.ink,
      shirt: CV.P.white, trouser: CV.P.charcoal, shoe: CV.P.charcoal,
      wear: Object.assign({}, game.equipped), tint: {},
    };
    try {
      const image = VOX.Raster.render(VOX.mesh(People.person(look, 'idle')), {
        width: 132, height: 132, samples: 2, yaw: 26, pitch: 14, zoom: 0.9,
        projection: 'orthographic',
      });
      this.previewCanvas.getContext('2d').putImageData(new ImageData(image.data, 132, 132), 0, 0);
    } catch (error) { /* a preview is not worth throwing over */ }
  }

  paintStats() {
    const game = this.game;
    const set = (id, value) => { this.statRows[id].textContent = value; };
    set('life', C.money(game.lifetime));
    set('rate', `${C.money(game.earnRate)} / s`);
    set('served', C.money(game.served));
    set('boxes', C.money(game.boxesOpened));
    set('wear', `${Object.keys(game.owned).length} / ${People.WEAR.length}`);
    set('crew', `${game.crew.length}`);
    set('renderer', this.scene.stage.renderer);
  }

  /** Floating numbers. One node per popup, pooled by id, removed when the
      simulation drops it — which is what keeps this from leaking on a long run. */
  paintPops() {
    const live = new Set();
    for (const pop of this.scene.popups()) {
      live.add(pop.id);
      let node = this.popNodes.get(pop.id);
      if (!node) {
        node = el('span', `cv-pop cv-pop-${pop.kind}`, pop.text);
        this.popLayer.append(node);
        this.popNodes.set(pop.id, node);
      }
      node.style.transform = `translate(${pop.x.toFixed(1)}px, ${pop.y.toFixed(1)}px)`;
      node.style.opacity = Math.min(1, pop.life * 1.6).toFixed(2);
    }
    for (const [id, node] of this.popNodes) {
      if (live.has(id)) continue;
      node.remove();
      this.popNodes.delete(id);
    }
  }
}

CV.Hud = { Hud, itemIcon, STATION_ICON, SLOT_ICON, create: (mount, game, scene) => new Hud(mount, game, scene) };

})(typeof globalThis !== 'undefined' ? globalThis : this);
