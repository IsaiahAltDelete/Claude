/* ---------------------------------------------------------------------------
   ClaudeVenture — dressing the stage.

   The simulation knows where everything is and nothing about what it looks
   like; the stage knows how to draw a mesh and nothing about shops. This file
   is the join: it builds the room for the shop you are in, keeps one model per
   thing-that-can-appear, and every frame hands the stage a list of placements.

   Two ideas do most of the work here.

   **Everything is keyed, nothing is rebuilt.** A machine at tier 2 is the key
   `st:grill:2`. Ask for it twice and you get the same mesh, uploaded once.
   Upgrade past level 24 and the key becomes `st:grill:3`, which is a different
   mesh, built the first time it is asked for and then never again.

   **A walk is two frames and a bob.** Every character is built in the handful
   of poses it can hold, and walking flips between two of them on a phase that
   advances with distance travelled rather than with time — so a crew member
   with better shoes takes quicker steps rather than gliding faster.
   --------------------------------------------------------------------------- */

(function (root) {
'use strict';

const CV = root.CV;
const VOX = root.VOX;
if (!CV || !CV.Game) throw new Error('ClaudeVenture: load 05-game.js first');

const C = CV.Content;
const F = C.FLOOR;
const People = CV.People;

class Scene {
  constructor(stage, game) {
    this.stage = stage;
    this.game = game;
    this.shopId = null;
    this.avatar = {
      x: F.counterX[2], z: F.crewLaneZ, yaw: 180, pose: 'idle',
      phase: 0, tx: F.counterX[2], tz: F.crewLaneZ, wait: 2, cheer: 0,
    };
    this.equipKey = '';
    this.avatarKeys = [];
    this.build();
  }

  /* ------------------------------------------------------------ models */

  /** Register `model` under `key` if nothing is there yet. */
  ensure(key, make) {
    if (!this.stage.has(key)) this.stage.define(key, make());
    return key;
  }

  stationKey(station) {
    const tier = C.stationTier(station.level);
    return this.ensure(`st:${station.def.machine}:${tier}`,
      () => VOX.build(`cv-${station.def.machine}-${tier}`));
  }

  propKey(name) { return this.ensure(`p:${name}`, () => VOX.build(name)); }

  guestKey(seed, pose) {
    return this.ensure(`g:${seed}:${pose}`, () => People.person(People.guest(seed), pose));
  }

  crewKey(index, pose) {
    return this.ensure(`c:${this.shopId}:${index}:${pose}`,
      () => People.person(People.crew(this.game.shop.accent, index + 1), pose));
  }

  avatarKey(pose) {
    const game = this.game;
    const look = {
      skin: People.SKINS[2], hair: People.HAIRS[1], hairStyle: 'short', eyes: CV.P.ink,
      shirt: CV.P.white, trouser: CV.P.charcoal, shoe: CV.P.charcoal,
      wear: Object.assign({}, game.equipped), tint: {},
    };
    const key = `me:${this.equipKey}:${pose}`;
    if (!this.stage.has(key)) this.avatarKeys.push(key);
    return this.ensure(key, () => People.person(look, pose));
  }

  /** The room, the counter, the fittings — everything that never moves. */
  build() {
    const shop = this.game.shop;
    this.shopId = shop.id;
    this.stage.reset();
    this.stage.clear = tintToLinear(VOX.util.mix(CV.P.ink, shop.accent, 0.22), 0.62);

    this.ensure(`room:${shop.id}`, () => CV.Props.room({
      cols: F.cols, rows: F.rows, wall: shop.wall,
      floorA: shop.floorA, floorB: shop.floorB, accent: shop.accent,
    }));

    /* Fixed dressing, resolved once into a placement list so the frame loop
       is a walk over an array rather than a pile of literals. */
    this.fittings = [];
    for (const x of F.counterX) this.fittings.push({ key: this.propKey('cv-counter'), x, y: 0, z: F.counterZ, yaw: 0 });
    this.fittings.push({ key: this.propKey('cv-register'), x: F.counterX[0], y: 9, z: F.counterZ, yaw: 12 });
    this.fittings.push({ key: this.propKey('cv-tip-jar'), x: F.counterX[5], y: 9, z: F.counterZ, yaw: -8 });
    this.fittings.push({ key: this.propKey('cv-menu-board'), x: 0, y: 13, z: -35, yaw: 0 });
    this.fittings.push({ key: this.propKey('cv-neon-sign'), x: -47, y: 20, z: 4, yaw: 90 });
    this.fittings.push({ key: this.propKey('cv-planter'), x: -43, y: 0, z: 30, yaw: 0 });
    this.fittings.push({ key: this.propKey('cv-planter'), x: 43, y: 0, z: -30, yaw: 0 });
    this.fittings.push({ key: this.propKey('cv-bin'), x: -43, y: 0, z: 12, yaw: 0 });
    this.fittings.push({ key: this.propKey('cv-crate-stack'), x: 42, y: 0, z: -12, yaw: 18 });
    this.fittings.push({ key: this.propKey('cv-floor-mat'), x: F.door.x, y: 0, z: 30, yaw: 0 });
    for (const table of F.tables) {
      this.fittings.push({ key: this.propKey('cv-cafe-table'), x: table.x, y: 0, z: table.z, yaw: 0 });
      for (const side of [-1, 1]) {
        this.fittings.push({ key: this.propKey('cv-stool'), x: table.x + side * 9, y: 0, z: table.z, yaw: 0 });
      }
    }
    this.propKey('cv-lot');
    this.propKey('cv-cash-pile');
    this.propKey('cv-gift-box');
    this.propKey('cv-arrow');
  }

  /* ------------------------------------------------------------- avatar */

  /**
   * You, wandering the service side of the counter. Entirely cosmetic — the
   * simulation neither knows nor cares — but it is the only place the wardrobe
   * is ever *seen*, which makes it the reason the wardrobe exists.
   */
  stepAvatar(dt) {
    const a = this.avatar;
    a.cheer = Math.max(0, a.cheer - dt);
    if (a.cheer > 0) { a.pose = 'cheer'; return; }
    a.wait -= dt;
    if (a.wait <= 0 && Math.hypot(a.tx - a.x, a.tz - a.z) < 1) {
      const spots = F.stationX.concat(F.counterX);
      a.tx = spots[Math.floor(Math.random() * spots.length)];
      a.tz = F.crewLaneZ + (Math.random() * 8 - 4);
      a.wait = 2 + Math.random() * 4;
    }
    const dx = a.tx - a.x, dz = a.tz - a.z;
    const length = Math.hypot(dx, dz);
    if (length > 1) {
      const stride = Math.min(length, 13 * dt);
      a.x += (dx / length) * stride;
      a.z += (dz / length) * stride;
      a.yaw = (Math.atan2(dx, dz) * 180) / Math.PI;
      a.phase += stride * 0.28;
      a.pose = 'walk';
    } else {
      a.pose = 'idle';
      a.yaw = 180;
    }
  }

  cheer() { this.avatar.cheer = 1.4; }

  /* -------------------------------------------------------------- frame */

  /** Walk cycle: two poses, flipped on a phase that counts distance. */
  static walkPose(entity, carrying) {
    if (entity.pose === 'sit') return 'sit';
    if (entity.pose === 'cheer') return 'cheer';
    const stepping = entity.pose === 'walk';
    const flip = Math.floor(entity.phase) % 2 === 0;
    if (carrying) return stepping ? (flip ? 'carryA' : 'carryB') : 'carry';
    if (!stepping) return 'idle';
    return flip ? 'stepA' : 'stepB';
  }

  static bob(entity) {
    return entity.pose === 'walk' ? Math.abs(Math.sin(entity.phase * Math.PI)) * 0.9 : 0;
  }

  draw(dt) {
    const game = this.game;
    const stage = this.stage;
    if (this.shopId !== game.shop.id) this.build();
    const equipKey = People.SLOTS.map(slot => game.equipped[slot] || '-').join('|');
    if (equipKey !== this.equipKey) {
      /* A change of outfit is a new set of model keys. Without dropping the old
         ones a player who tries on thirty hats leaves thirty dressed avatars —
         and, on the software path, thirty baked sprites — in the cache. */
      for (const key of this.avatarKeys) this.stage.drop(key);
      this.avatarKeys.length = 0;
      this.equipKey = equipKey;
    }
    this.stepAvatar(dt);

    stage.add(`room:${game.shop.id}`, { x: 0, y: 0, z: 0, back: true });
    for (const fitting of this.fittings) {
      stage.add(fitting.key, { x: fitting.x, y: fitting.y, z: fitting.z, yaw: fitting.yaw });
    }

    /* Machines, and an arrow over the next one you can afford. */
    for (const station of game.stations) {
      if (station.unlocked) {
        const lift = station.boost > 0 ? Math.sin(game.time * 22) * 0.6 : 0;
        stage.add(this.stationKey(station), { x: station.x, y: lift, z: station.z });
        stage.shadow(station.x, station.z, 9, 0.24);
      } else {
        stage.add(this.propKey('cv-lot'), { x: station.x, y: 0, z: station.z });
        stage.shadow(station.x, station.z, 9, 0.2);
        if (game.cash >= C.stationCost(station, game.scale)) {
          const hop = 3 + Math.sin(game.time * 3 + station.slot) * 2;
          stage.add(this.propKey('cv-arrow'), { x: station.x, y: 16 + hop, z: station.z, yaw: 45 });
        }
      }
    }

    /* The dishes waiting on each counter, so a full machine reads as full. */
    for (const station of game.stations) {
      if (!station.unlocked || !station.stock) continue;
      const dish = this.ensure(`dish:${station.def.dish}`, () => VOX.build(`cv-dish-${station.def.dish}`));
      for (let i = 0; i < Math.min(4, station.stock); i++) {
        stage.add(dish, { x: station.x - 6 + i * 4, y: 8, z: station.z + 6, yaw: i * 37 });
      }
    }

    for (const guest of game.guests) {
      const pose = Scene.walkPose(guest, false);
      stage.add(this.guestKey(guest.seed, pose), {
        x: guest.x, y: Scene.bob(guest), z: guest.z, yaw: guest.yaw,
      });
      stage.shadow(guest.x, guest.z, 4.4, 0.2);
    }

    for (let i = 0; i < game.crew.length; i++) {
      const member = game.crew[i];
      const carrying = member.carrying.length > 0;
      const pose = Scene.walkPose(member, carrying);
      stage.add(this.crewKey(i, pose), {
        x: member.x, y: Scene.bob(member), z: member.z, yaw: member.yaw,
      });
      stage.shadow(member.x, member.z, 4.4, 0.2);
      if (carrying && member.holding) {
        const dish = this.ensure(`dish:${member.holding}`, () => VOX.build(`cv-dish-${member.holding}`));
        const yaw = (member.yaw * Math.PI) / 180;
        stage.add(dish, {
          x: member.x + Math.sin(yaw) * 6, y: 11 + Scene.bob(member),
          z: member.z + Math.cos(yaw) * 6, yaw: member.yaw,
        });
      }
    }

    const a = this.avatar;
    stage.add(this.avatarKey(Scene.walkPose(a, false)), {
      x: a.x, y: Scene.bob(a), z: a.z, yaw: a.yaw,
    });
    stage.shadow(a.x, a.z, 4.8, 0.22);

    for (const drop of game.drops) {
      const hop = Math.abs(Math.sin(drop.age * 3.4)) * 1.6;
      const key = drop.kind === 'box' ? this.propKey('cv-gift-box') : this.propKey('cv-cash-pile');
      stage.add(key, { x: drop.x, y: hop, z: drop.z, yaw: drop.age * 40 });
      stage.shadow(drop.x, drop.z, drop.kind === 'box' ? 5 : 4, 0.18);
    }
  }

  /** Where the floating numbers should be, in canvas pixels. */
  popups() {
    const out = [];
    for (const pop of this.game.pops) {
      const at = this.stage.toScreen(pop.x, pop.y, pop.z);
      out.push({ id: pop.id, x: at.x, y: at.y, text: pop.text, kind: pop.kind, life: pop.life });
    }
    return out;
  }

  /** Where a station's tap target is, so the HUD can pin a card over it. */
  stationScreen(station) {
    return this.stage.toScreen(station.x, 22, station.z);
  }
}

/** A voxel colour -> the [0..1] triple the stage clears to, darkened. */
function tintToLinear(color, amount) {
  const c = VOX.util.rgb(color);
  return [((c >> 16) & 255) / 255 * amount, ((c >> 8) & 255) / 255 * amount, (c & 255) / 255 * amount];
}

CV.Scene = { Scene, create: (stage, game) => new Scene(stage, game) };

})(typeof globalThis !== 'undefined' ? globalThis : this);
