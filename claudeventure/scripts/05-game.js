/* ---------------------------------------------------------------------------
   ClaudeVenture — the simulation.

   A shop is a queue problem wearing a hat. Guests arrive, want a dish, and
   leave (with money, or in a huff). Machines turn time into dishes. Crew turn
   dishes into money by walking them across the room. Everything the player
   does is buying a better constant in one of those three sentences.

   The loop is fixed-step at 20 Hz with an accumulator, deliberately: an idle
   game that runs its economy off the render frame pays out differently on a
   144 Hz monitor than on a 60 Hz one, and pays nothing at all in a background
   tab. Rendering interpolates; the economy does not.

   Nothing in here knows what anything looks like. Entities carry a position, a
   pose name and a model key; the stage in 03-stage.js turns that into pixels
   and the HUD in 06-hud.js turns the numbers into buttons.
   --------------------------------------------------------------------------- */

(function (root) {
'use strict';

const CV = root.CV;
const VOX = root.VOX;
if (!CV || !CV.Content) throw new Error('ClaudeVenture: load 04-content.js first');

const C = CV.Content;
const F = C.FLOOR;
const People = CV.People;
const { rng } = VOX.util;

const STEP = 1 / 20;
const MAX_CATCHUP = 0.5;          // never simulate more than half a second at once
const OFFLINE_CAP = 8 * 3600;     // eight hours of away time counts
const OFFLINE_RATE = 0.4;         // and it counts at 40%, so being here is better

let nextId = 1;
const uid = () => nextId++;

/* ============================================================== the game === */

class Game {
  constructor() {
    this.rand = rng(Date.now() >>> 0);
    this.time = 0;
    this.accumulator = 0;
    this.events = [];              // drained by the HUD each frame

    this.cash = 12;
    this.gems = 0;
    this.shopIndex = 0;
    this.lifetime = 0;
    this.served = 0;
    this.boxesOpened = 0;

    this.upgrades = {};            // id -> level
    this.progress = {};            // shop id -> { levels: {station: level} }
    this.owned = {};               // wardrobe id -> true
    this.equipped = { hat: 'chef-toque', top: 'apron', bottom: 'jeans', shoes: 'sneakers', face: null, back: null };
    this.owned['chef-toque'] = true; this.owned.apron = true;
    this.owned.jeans = true; this.owned.sneakers = true;
    this.seenHints = {};

    this.stations = [];
    this.guests = [];
    this.crew = [];
    this.drops = [];
    this.pops = [];
    this.spawnTimer = 2;
    this.boostCache = null;
    this.earnRate = 0;
    this.rateEarned = 0;
    this.rateWindow = 0;

    this.enterShop(0, { fresh: true });
  }

  /* ------------------------------------------------------------- events */

  emit(type, detail) { this.events.push({ type, detail }); }

  drain() { const out = this.events; this.events = []; return out; }

  hint(id) {
    if (this.seenHints[id]) return;
    const found = C.HINTS.find(h => h.id === id);
    if (!found) return;
    this.seenHints[id] = true;
    this.emit('hint', found);
  }

  /* -------------------------------------------------------------- shops */

  get shop() { return C.SHOPS[this.shopIndex]; }

  /** Everything in this shop is priced and paid in multiples of this. */
  get scale() { return this.shop.scale; }

  enterShop(index, options = {}) {
    this.shopIndex = Math.max(0, Math.min(C.SHOPS.length - 1, index));
    const shop = this.shop;
    const saved = this.progress[shop.id] || (this.progress[shop.id] = { levels: {} });
    this.stations = shop.stations.map((id, slot) => {
      const def = C.STATIONS[id];
      const level = saved.levels[id] || 0;
      return {
        id, def, slot, level,
        unlocked: slot === 0 || level > 0,
        stock: 0, progress: 0, boost: 0,
        x: F.stationX[slot], z: F.stationZ,
      };
    });
    if (!this.stations.some(s => s.unlocked)) this.stations[0].unlocked = true;
    this.guests.length = 0;
    this.drops.length = 0;
    this.pops.length = 0;
    this.rebuildCrew();
    this.boostCache = null;
    this.emit('shop', { shop, fresh: !!options.fresh });
  }

  canMoveOn() {
    const next = C.SHOPS[this.shopIndex + 1];
    return !!next && this.lifetime >= this.shop.target;
  }

  moveOn() {
    const next = C.SHOPS[this.shopIndex + 1];
    if (!next || this.cash < next.unlock) return false;
    this.cash -= next.unlock;
    const bonus = 20 + this.shopIndex * 25;
    this.gems += bonus;
    this.enterShop(this.shopIndex + 1);
    this.emit('moved', { shop: this.shop, gems: bonus });
    return true;
  }

  /* ------------------------------------------------------------- boosts */

  /** Everything the wardrobe is doing, summed per stat and cached until it
      changes — this is read several times per tick and never varies within one. */
  boosts() {
    if (this.boostCache) return this.boostCache;
    const out = { tips: 0, value: 0, speed: 0, prep: 0, patience: 0, luck: 0 };
    for (const slot of People.SLOTS) {
      const id = this.equipped[slot];
      const item = id && People.BY_ID.get(id);
      if (!item || !item.boost) continue;
      out[item.boost[0]] += item.boost[1];
    }
    this.boostCache = out;
    return out;
  }

  level(id) { return this.upgrades[id] || 0; }

  /* Derived rates, all in one place so a balance change is one line. */
  get crewCount() { return 1 + this.level('crew'); }
  get crewSpeed() { return (22 + this.level('legs') * 2.6) * (1 + this.boosts().speed); }
  get trayCapacity() { return 1 + this.level('trays'); }
  get takings() { return (1 + this.level('tips') * 0.15) * (1 + this.boosts().tips); }
  get footfall() { return 1 + this.level('sign') * 0.1; }
  get patience() { return 26 * (1 + this.level('seats') * 0.2) * (1 + this.boosts().patience); }
  get sweepDelay() { return 3.5 / (1 + this.level('till') * 0.55); }
  get prepRate() { return 1 + this.boosts().prep; }
  get boxChance() { return Math.min(C.BOX_CHANCE_MAX, C.BOX_CHANCE * (1 + this.boosts().luck * 3)); }

  dishValue(station) {
    return C.stationValue(station, this.scale) * this.takings * (1 + this.boosts().value);
  }

  /* --------------------------------------------------------- purchasing */

  buyStation(slot, count = 1) {
    const station = this.stations[slot];
    if (!station) return false;
    if (!station.unlocked) {
      const price = C.stationCost(station, this.scale);
      if (this.cash < price) return false;
      this.cash -= price;
      station.unlocked = true;
      station.level = 1;
      this.saveLevels();
      this.emit('bought', { station, levels: 1, tier: C.stationTier(1) });
      this.hint('upgrade');
      return true;
    }
    const want = count === 'max' ? C.affordableLevels(station, this.scale, this.cash) : count;
    if (want < 1) return false;
    const price = C.bulkCost(station, this.scale, want);
    if (this.cash < price) return false;
    const before = C.stationTier(station.level);
    this.cash -= price;
    station.level += want;
    this.saveLevels();
    const after = C.stationTier(station.level);
    this.emit('bought', { station, levels: want, tier: after, evolved: after !== before });
    if (after !== before) this.emit('evolved', { station, tier: after });
    return true;
  }

  saveLevels() {
    const saved = this.progress[this.shop.id];
    for (const station of this.stations) saved.levels[station.id] = station.level;
  }

  buyUpgrade(id) {
    const def = C.UPGRADE_BY_ID.get(id);
    if (!def) return false;
    const level = this.level(id);
    if (level >= def.max) return false;
    const price = C.upgradeCost(def, level);
    if (this.cash < price) return false;
    this.cash -= price;
    this.upgrades[id] = level + 1;
    if (id === 'crew') this.rebuildCrew();
    this.emit('upgraded', { def, level: level + 1 });
    return true;
  }

  /* ---------------------------------------------------------- wardrobe */

  equip(slot, id) {
    if (id && !this.owned[id]) return false;
    this.equipped[slot] = id || null;
    this.boostCache = null;
    this.emit('dressed', { slot, id });
    this.hint('wear');
    return true;
  }

  buyWithGems(id) {
    const item = People.BY_ID.get(id);
    if (!item || this.owned[id]) return false;
    const price = C.GEM_PRICE[item.rarity];
    if (this.gems < price) return false;
    this.gems -= price;
    this.owned[id] = true;
    this.emit('found', { item, bought: true });
    return true;
  }

  /** Roll a box: gems always, and a garment you do not already have if the
      rarity roll lands somewhere with anything left in it. */
  openBox(drop) {
    const roll = this.rand();
    let acc = 0, rarity = 'common';
    const total = C.RARITY_ORDER.reduce((sum, key) => sum + C.RARITY[key].weight, 0);
    for (const key of C.RARITY_ORDER) {
      acc += C.RARITY[key].weight / total;
      if (roll <= acc) { rarity = key; break; }
    }
    const band = C.RARITY[rarity];
    const gems = band.gems[0] + Math.floor(this.rand() * (band.gems[1] - band.gems[0] + 1));
    this.gems += gems;
    this.boxesOpened++;
    const pool = People.WEAR.filter(item => item.rarity === rarity && !this.owned[item.id]);
    let item = null;
    if (pool.length) {
      item = pool[Math.floor(this.rand() * pool.length)];
      this.owned[item.id] = true;
    }
    this.emit('box', { rarity, gems, item, x: drop ? drop.x : 0, z: drop ? drop.z : 0 });
    this.hint('wear');
    return { rarity, gems, item };
  }

  /* -------------------------------------------------------------- crew */

  rebuildCrew() {
    const accent = this.shop.accent;
    while (this.crew.length > this.crewCount) this.crew.pop();
    while (this.crew.length < this.crewCount) {
      const index = this.crew.length;
      this.crew.push({
        id: uid(),
        look: People.crew(accent, index + 1),
        x: F.counterX[Math.min(index, F.counterX.length - 1)], z: F.crewLaneZ,
        tx: 0, tz: 0, yaw: 180, pose: 'idle', phase: this.rand() * 6,
        state: 'idle', carrying: [], target: null, wait: 0,
      });
    }
    for (const member of this.crew) member.look = People.crew(accent, this.crew.indexOf(member) + 1);
    this.emit('crew', { count: this.crew.length });
  }

  /* ------------------------------------------------------------- guests */

  spawnGuest() {
    const slot = F.queueX.findIndex((x, i) => !this.guests.some(g => g.slot === i));
    if (slot === -1) return null;
    const open = this.stations.filter(s => s.unlocked);
    if (!open.length) return null;
    const wants = open[Math.floor(this.rand() * open.length)];
    const seed = Math.floor(this.rand() * C.GUEST_LOOKS);
    const guest = {
      id: uid(), seed,
      look: People.guest(seed),
      x: F.outside.x, z: F.outside.z,
      slot, yaw: 180, pose: 'idle', phase: this.rand() * 6,
      state: 'entering',
      wants: wants.id,
      need: 1 + (this.rand() < 0.34 ? 1 : 0),
      held: 0,
      patience: this.patience,
      maxPatience: this.patience,
      eat: 0,
      seat: null,
    };
    this.guests.push(guest);
    return guest;
  }

  freeSeat() {
    for (let i = 0; i < F.tables.length; i++) {
      for (const side of [-1, 1]) {
        const key = `${i}:${side}`;
        if (!this.guests.some(g => g.seat === key)) return { key, x: F.tables[i].x + side * 9, z: F.tables[i].z };
      }
    }
    return null;
  }

  /* --------------------------------------------------------------- tick */

  update(dt) {
    this.accumulator += Math.min(dt, MAX_CATCHUP);
    let steps = 0;
    while (this.accumulator >= STEP && steps < 12) {
      this.step(STEP);
      this.accumulator -= STEP;
      steps++;
    }
  }

  step(dt) {
    this.time += dt;
    /* A rolling measure of what the shop actually makes per second. Every
       attempt to model this from prep times and dish values overestimated it
       several-fold, because the bottleneck is nearly always a crew member's
       legs rather than a machine's timer. Measuring costs two additions. */
    this.rateWindow += dt;
    if (this.rateWindow >= 10) {
      const observed = this.rateEarned / this.rateWindow;
      this.earnRate = this.earnRate ? this.earnRate * 0.5 + observed * 0.5 : observed;
      this.rateEarned = 0;
      this.rateWindow = 0;
    }
    this.stepStations(dt);
    this.stepGuests(dt);
    this.stepCrew(dt);
    this.stepDrops(dt);
    this.stepSpawn(dt);
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const pop = this.pops[i];
      pop.life -= dt;
      pop.y += dt * 14;
      if (pop.life <= 0) this.pops.splice(i, 1);
    }
  }

  stepStations(dt) {
    for (const station of this.stations) {
      if (!station.unlocked) continue;
      station.boost = Math.max(0, station.boost - dt);
      const cap = C.stationCapacity(station);
      if (station.stock >= cap) { station.progress = 0; continue; }
      const speed = this.prepRate * (station.boost > 0 ? 2.4 : 1);
      station.progress += (dt * speed) / C.stationPrep(station);
      while (station.progress >= 1 && station.stock < cap) {
        station.progress -= 1;
        station.stock++;
      }
      if (station.stock >= cap) station.progress = 0;
    }
  }

  stepSpawn(dt) {
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    const busy = this.guests.length;
    this.spawnTimer = (1.5 + this.rand() * 1.2) / this.footfall + busy * 0.18;
    this.spawnGuest();
  }

  /** Straight-line steering. A shop this open does not need pathfinding, and a
      guest who walks the diagonal looks more alive than one on rails. */
  move(entity, tx, tz, speed, dt) {
    const dx = tx - entity.x, dz = tz - entity.z;
    const length = Math.hypot(dx, dz);
    if (length < 0.6) { entity.x = tx; entity.z = tz; return true; }
    const stride = Math.min(length, speed * dt);
    entity.x += (dx / length) * stride;
    entity.z += (dz / length) * stride;
    entity.yaw = (Math.atan2(dx, dz) * 180) / Math.PI;
    entity.phase += stride * 0.28;
    return false;
  }

  stepGuests(dt) {
    const speed = 15;
    for (let i = this.guests.length - 1; i >= 0; i--) {
      const guest = this.guests[i];
      switch (guest.state) {
        case 'entering': {
          const target = { x: F.queueX[guest.slot], z: F.queueZ };
          guest.pose = 'walk';
          if (this.move(guest, target.x, target.z, speed, dt)) {
            guest.state = 'waiting';
            guest.yaw = 180;
            guest.pose = 'idle';
          }
          break;
        }
        case 'waiting': {
          guest.patience -= dt;
          if (guest.held >= guest.need) {
            const seat = this.freeSeat();
            guest.seat = seat ? seat.key : null;
            guest.seatAt = seat;
            guest.state = seat ? 'seating' : 'eating';
            guest.eat = 3.2;
          } else if (guest.patience <= 0) {
            guest.state = 'leaving';
            guest.angry = true;
            guest.slot = -1;
            this.emit('lost', { guest });
          }
          break;
        }
        case 'seating': {
          guest.pose = 'walk';
          guest.slot = -1;
          if (this.move(guest, guest.seatAt.x, guest.seatAt.z, speed, dt)) {
            guest.state = 'eating';
            guest.yaw = guest.seatAt.x < 0 ? 90 : -90;
            guest.pose = 'sit';
          }
          break;
        }
        case 'eating': {
          guest.slot = -1;
          guest.eat -= dt;
          if (guest.eat <= 0) {
            this.pay(guest);
            guest.state = 'leaving';
            guest.seat = null;
            guest.pose = 'walk';
          }
          break;
        }
        case 'leaving': {
          guest.pose = 'walk';
          if (this.move(guest, F.outside.x, F.outside.z, speed * 1.15, dt)) {
            this.guests.splice(i, 1);
          }
          break;
        }
        default: break;
      }
    }
  }

  pay(guest) {
    const station = this.stations.find(s => s.id === guest.wants);
    if (!station) return;
    const amount = this.dishValue(station) * guest.need;
    this.served++;
    const boxes = this.drops.reduce((n, d) => n + (d.kind === 'box' ? 1 : 0), 0);
    if (boxes < 3 && this.rand() < this.boxChance) {
      /* Boxes never expire — one that vanished while you were reading a tooltip
         is a gift you were told about and never got. Three on the floor is the
         cap, so an idle shop does not turn into a warehouse. */
      this.drops.push({ id: uid(), kind: 'box', x: guest.x, z: guest.z, y: 0, age: 0, life: Infinity, value: 0 });
      this.hint('box');
    } else {
      this.drops.push({ id: uid(), kind: 'cash', x: guest.x, z: guest.z, y: 0, age: 0, life: 60, value: amount });
    }
  }

  stepDrops(dt) {
    const sweep = this.sweepDelay;
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const drop = this.drops[i];
      drop.age += dt;
      if (drop.kind === 'cash' && drop.age >= sweep) {
        this.collect(drop, 1);
        this.drops.splice(i, 1);
      } else if (drop.age > drop.life) {
        if (drop.kind === 'cash') this.collect(drop, 1);
        this.drops.splice(i, 1);
      }
    }
  }

  collect(drop, factor = 1) {
    const amount = drop.value * factor;
    this.cash += amount;
    this.lifetime += amount;
    this.rateEarned += amount;
    this.pops.push({ id: uid(), x: drop.x, z: drop.z, y: 10, text: `+${C.money(amount)}`, life: 1.1, kind: 'cash' });
    if (this.lifetime > 260) this.hint('crew');
    if (this.canMoveOn()) this.hint('move');
    return amount;
  }

  /** A tap on the floor: money is swept, boxes are opened, machines are hurried
      and anything else is a miss. One handler, because on a phone it is one
      gesture. */
  tap(x, z) {
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const drop = this.drops[i];
      if (Math.hypot(drop.x - x, drop.z - z) > 11) continue;
      this.drops.splice(i, 1);
      if (drop.kind === 'box') { this.openBox(drop); return { hit: 'box' }; }
      /* A swept-by-hand pile pays a fifth more than one the till sweeps. */
      this.collect(drop, 1.2);
      return { hit: 'cash' };
    }
    for (const station of this.stations) {
      if (!station.unlocked) continue;
      if (Math.hypot(station.x - x, station.z - z) > 14) continue;
      station.boost = 4;
      this.pops.push({ id: uid(), x: station.x, z: station.z, y: 26, text: 'Rush!', life: 0.9, kind: 'rush' });
      this.hint('welcome');
      return { hit: 'station', station };
    }
    return { hit: null };
  }

  stepCrew(dt) {
    const speed = this.crewSpeed;
    for (const member of this.crew) {
      switch (member.state) {
        case 'idle': {
          member.pose = 'idle';
          const job = this.findJob(member);
          if (job) {
            member.target = job;
            member.state = 'fetch';
          } else {
            /* Nothing to do: drift back to the middle of the line rather than
               standing wherever the last order left you. */
            const home = F.counterX[Math.min(this.crew.indexOf(member), F.counterX.length - 1)];
            if (Math.abs(member.x - home) > 2) {
              this.move(member, home, F.crewLaneZ, speed * 0.7, dt);
              member.pose = 'walk';
            } else {
              member.yaw = 180;
            }
          }
          break;
        }
        case 'fetch': {
          const station = this.stations[member.target.slot];
          member.pose = 'walk';
          if (this.move(member, station.x, station.z + 10, speed, dt)) {
            const take = Math.min(this.trayCapacity, station.stock, member.target.guests.length);
            if (take <= 0) { member.state = 'idle'; member.target = null; break; }
            station.stock -= take;
            member.carrying = member.target.guests.slice(0, take);
            member.holding = station.def.dish;
            member.state = 'deliver';
          }
          break;
        }
        case 'deliver': {
          const guestId = member.carrying[0];
          const guest = this.guests.find(g => g.id === guestId && g.state === 'waiting');
          if (!guest) {
            member.carrying.shift();
            if (!member.carrying.length) { member.state = 'idle'; member.holding = null; member.target = null; }
            break;
          }
          member.pose = 'carry';
          const stand = { x: F.queueX[guest.slot], z: F.counterZ - 8 };
          if (this.move(member, stand.x, stand.z, speed, dt)) {
            guest.held++;
            guest.patience = Math.min(guest.maxPatience, guest.patience + 4);
            member.carrying.shift();
            if (!member.carrying.length) {
              member.state = 'idle';
              member.holding = null;
              member.target = null;
            }
          }
          break;
        }
        default: member.state = 'idle';
      }
    }
  }

  /**
   * What a free crew member should do next: the station with stock whose
   * waiting guests have been waiting longest. Claimed guests are excluded so
   * two crew never carry the same order.
   */
  findJob(member) {
    const claimed = new Set();
    for (const other of this.crew) for (const id of other.carrying) claimed.add(id);
    let best = null;
    for (const station of this.stations) {
      if (!station.unlocked || station.stock <= 0) continue;
      const guests = this.guests
        .filter(g => g.state === 'waiting' && g.wants === station.id && g.held < g.need && !claimed.has(g.id))
        .sort((a, b) => a.patience - b.patience)
        .slice(0, this.trayCapacity)
        .map(g => g.id);
      if (!guests.length) continue;
      const urgency = this.guests.find(g => g.id === guests[0]).patience;
      if (!best || urgency < best.urgency) best = { slot: station.slot, guests, urgency };
    }
    return best;
  }

  /* ------------------------------------------------------------ offline */

  /** What the shop made while the tab was shut. Estimated from throughput
      rather than replayed, because replaying eight hours at 20 Hz is 576,000
      steps and nobody has that long to wait for a title screen. */
  awayEarnings(seconds) {
    const away = Math.min(OFFLINE_CAP, Math.max(0, seconds));
    if (away < 30 || !this.earnRate) return { seconds: away, amount: 0 };
    return { seconds: away, amount: this.earnRate * away * OFFLINE_RATE };
  }

  claimAway(result) {
    if (!result || result.amount <= 0) return;
    this.cash += result.amount;
    this.lifetime += result.amount;
  }

  /* --------------------------------------------------------------- save */

  toJSON() {
    this.saveLevels();
    return {
      format: 'claudeventure/1',
      at: Date.now(),
      cash: this.cash, gems: this.gems, lifetime: this.lifetime,
      served: this.served, boxesOpened: this.boxesOpened,
      shopIndex: this.shopIndex,
      upgrades: this.upgrades,
      progress: this.progress,
      owned: this.owned,
      equipped: this.equipped,
      seenHints: this.seenHints,
      earnRate: this.earnRate,
    };
  }

  load(data) {
    if (!data || data.format !== 'claudeventure/1') return false;
    const num = (value, fallback) => (Number.isFinite(value) ? value : fallback);
    this.cash = num(data.cash, 12);
    this.gems = num(data.gems, 0);
    this.lifetime = num(data.lifetime, 0);
    this.served = num(data.served, 0);
    this.boxesOpened = num(data.boxesOpened, 0);
    this.upgrades = Object.assign({}, data.upgrades);
    this.progress = data.progress && typeof data.progress === 'object' ? data.progress : {};
    this.owned = Object.assign({}, data.owned);
    this.seenHints = Object.assign({}, data.seenHints);
    /* A save from a build with a garment this one no longer has must not leave
       an empty slot pointing at nothing. */
    for (const slot of People.SLOTS) {
      const id = data.equipped && data.equipped[slot];
      this.equipped[slot] = id && People.BY_ID.get(id) && this.owned[id] ? id : null;
    }
    this.boostCache = null;
    this.enterShop(num(data.shopIndex, 0));
    this.earnRate = num(data.earnRate, 0);
    this.rebuildCrew();
    return true;
  }
}

CV.Game = { Game, STEP, OFFLINE_CAP, OFFLINE_RATE, create: () => new Game() };

})(typeof globalThis !== 'undefined' ? globalThis : this);
