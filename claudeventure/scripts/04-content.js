/* ---------------------------------------------------------------------------
   ClaudeVenture — the content, and the arithmetic under it.

   Everything a designer would want to move lives in this file and nothing
   else: what the shops are, what the machines cost, how fast a level makes
   them, how the boosts stack, how a gift box rolls. The simulation next door
   reads all of it and hardcodes none of it.

   The curves are the ones idle games run on, and they are here written out
   rather than tuned by feel:

     value(level)  = base · 1.16^level      what one dish sells for
     cost(level)   = unlock · 1.19^level    what the next level costs
     prep(level)   = base / (1 + 0.05·lvl)  how long one dish takes

   Value climbs faster than cost divided by output, so a station always pays
   its upgrade back — the question the player is answering is only ever *which*
   station to feed, never whether upgrading is worth it. The ratio between
   those two exponents is the entire pacing of the game; treat it gently.
   --------------------------------------------------------------------------- */

(function (root) {
'use strict';

const CV = root.CV;
if (!CV) throw new Error('ClaudeVenture: load 01-props.js first');
const P = CV.P;
const { mix } = root.VOX.util;

/* Each shop's walls are the house wall tinted a quarter of the way towards
   that shop's accent, so five rooms read as five rooms and still as one game. */
const wallOf = tint => mix(P.wall, tint, 0.25);

/* ------------------------------------------------------------- numbers --- */

const SUFFIX = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc', 'Ud', 'Dd'];

/** 1234 -> "1.23K". Three significant figures, which is what a tap-to-buy
    button has room for and about as much as anyone reads. */
function money(value) {
  if (!Number.isFinite(value)) return '∞';
  const sign = value < 0 ? '-' : '';
  let n = Math.abs(value);
  if (n < 1000) return sign + (n < 10 && n % 1 ? n.toFixed(1) : Math.floor(n).toString());
  let tier = 0;
  while (n >= 1000 && tier < SUFFIX.length - 1) { n /= 1000; tier++; }
  const dp = n < 10 ? 2 : n < 100 ? 1 : 0;
  return `${sign}${n.toFixed(dp)}${SUFFIX[tier]}`;
}

/** "2m 14s", for patience bars and away-time. */
function duration(seconds) {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  const h = Math.floor(s / 3600);
  return `${h}h ${Math.floor((s % 3600) / 60)}m`;
}

/* --------------------------------------------------------------- curves --- */

const GROWTH_VALUE = 1.16;
const GROWTH_COST = 1.19;

const rankValue = (slot, scale) => RANKS[Math.min(slot, RANKS.length - 1)].value * scale;
const rankUnlock = (slot, scale) => RANKS[Math.min(slot, RANKS.length - 1)].unlock * scale;

const stationValue = (station, scale) => rankValue(station.slot, scale) * Math.pow(GROWTH_VALUE, station.level);
const stationCost = (station, scale) => Math.ceil(rankUnlock(station.slot, scale) * Math.pow(GROWTH_COST, station.level));
const stationPrep = (station) => Math.max(0.22, station.def.prep / (1 + station.level * 0.05));
const stationCapacity = (station) => station.def.capacity + Math.floor(station.level / 6);
/* Three looks per machine, and you earn the second and third. */
const stationTier = level => (level >= 24 ? 3 : level >= 10 ? 2 : 1);
const NEXT_TIER_AT = [10, 24];

/** How many levels you can afford in one go, so "buy max" is one calculation
    rather than a loop that could run ten thousand times. */
function affordableLevels(station, scale, cash, cap = 500) {
  const first = stationCost(station, scale);
  if (cash < first) return 0;
  /* Geometric series: first·(rⁿ−1)/(r−1) ≤ cash. */
  const r = GROWTH_COST;
  const n = Math.floor(Math.log((cash * (r - 1)) / first + 1) / Math.log(r));
  return Math.max(1, Math.min(cap, n));
}

function bulkCost(station, scale, count) {
  const r = GROWTH_COST;
  const first = stationCost(station, scale);
  return Math.ceil(first * (Math.pow(r, count) - 1) / (r - 1));
}

/* ------------------------------------------------------------- stations --- */

/* A station's price and payout come from its *slot*, not from its identity.
   Every shop has four slots and every shop's four slots cost the same relative
   amounts, multiplied by that shop's `scale`. The first version of this typed
   an absolute price onto each machine, which fell apart the moment two shops
   wanted the same machine: a gelato cart priced for the second shop was free
   in the fourth, and the whole run stalled around it.

   So: RANKS is the shape of a shop, SCALE is which shop, and a machine is only
   ever a name, a dish and a speed. */
const RANKS = [
  { unlock: 12, value: 3 },
  { unlock: 140, value: 14 },
  { unlock: 1800, value: 90 },
  { unlock: 24000, value: 620 },
];

const STATIONS = {
  juice: { name: 'Lemonade Stand', machine: 'juice', dish: 'lemonade', prep: 1.5, capacity: 3, color: P.bodyLime },
  fryer: { name: 'Fry Basket', machine: 'fryer', dish: 'fries', prep: 2.1, capacity: 3, color: P.bodyCream },
  grill: { name: 'Burger Grill', machine: 'grill', dish: 'burger', prep: 2.8, capacity: 2, color: P.bodySky },
  bakery: { name: 'Bakery Case', machine: 'bakery', dish: 'croissant', prep: 2.4, capacity: 3, color: P.bodyCream },
  boba: { name: 'Boba Bar', machine: 'boba', dish: 'bobacup', prep: 1.9, capacity: 4, color: P.bodyGrape },
  smoothie: { name: 'Smoothie Wall', machine: 'smoothie', dish: 'smoothiecup', prep: 2.2, capacity: 3, color: P.bodyMint },
  donut: { name: 'Donut Case', machine: 'donut', dish: 'donutbox', prep: 2.6, capacity: 3, color: P.bodyTeal },
  gelato: { name: 'Gelato Cart', machine: 'gelato', dish: 'cone', prep: 2.3, capacity: 4, color: P.bodyBlush },
  pizza: { name: 'Pizza Oven', machine: 'pizza', dish: 'slice', prep: 3.0, capacity: 2, color: P.tomato },
  coffee: { name: 'Espresso Bar', machine: 'coffee', dish: 'espresso', prep: 1.7, capacity: 4, color: P.bodyCoral },
  taco: { name: 'Taco Griddle', machine: 'taco', dish: 'tacoplate', prep: 2.4, capacity: 3, color: P.bodyCoral },
  sushi: { name: 'Sushi Counter', machine: 'sushi', dish: 'sushiplate', prep: 2.7, capacity: 3, color: P.cloth },
};

/* -------------------------------------------------------------- shops --- */

/* Five shops. `scale` is the only economic difference between them, and each
   is 250x the last — which is roughly what one shop's worth of upgrading is
   worth, so arriving somewhere new feels like a promotion rather than a demotion.

   `target` is the lifetime takings that unlock the move, and `unlock` is what
   the move costs. Both are derived from the scale rather than typed, so a shop
   cannot be accidentally cheaper than the one before it. */
const SHOP_SCALE = [1, 250, 6.3e4, 1.6e7, 4e9];
const TARGET_MULTIPLE = 6;       // lifetime takings needed, in top-slot unlocks
const MOVE_MULTIPLE = 0.4;       // cash the move itself costs, likewise

const SHOPS = [
  {
    id: 'sunny', name: 'Sunny Street', blurb: 'A corner stand with a good pavement and no competition.',
    accent: P.bodyLime, wall: P.wall, floorA: P.floorA, floorB: P.floorB,
    stations: ['juice', 'fryer', 'grill', 'bakery'],
  },
  {
    id: 'boba', name: 'Boba Alley', blurb: 'Half a shopping arcade, permanently queued out of the door.',
    accent: P.bodyGrape, wall: wallOf(P.bodyGrape), floorA: P.floorB, floorB: P.floorEdge,
    stations: ['boba', 'smoothie', 'donut', 'gelato'],
  },
  {
    id: 'piazza', name: 'Piazza Nova', blurb: 'Tables outside, a wood oven inside, and everyone in a hurry.',
    accent: P.tomato, wall: wallOf(P.bodyCream), floorA: P.stonePale, floorB: P.stone,
    stations: ['pizza', 'coffee', 'bakery', 'gelato'],
  },
  {
    id: 'night', name: 'Night Market', blurb: 'Strip lights, folding stools, and a queue that never ends.',
    accent: P.neonPink, wall: wallOf(P.neonPink), floorA: P.slate, floorB: P.charcoal,
    stations: ['taco', 'sushi', 'boba', 'grill'],
  },
  {
    id: 'sky', name: 'Sky Diner', blurb: 'Forty floors up. The coffee is famous and so are you.',
    accent: P.bodySky, wall: wallOf(P.bodySky), floorA: P.silver, floorB: P.ash,
    stations: ['coffee', 'donut', 'smoothie', 'sushi'],
  },
];

SHOPS.forEach((shop, i) => {
  shop.index = i;
  shop.scale = SHOP_SCALE[i];
  shop.target = RANKS[3].unlock * shop.scale * TARGET_MULTIPLE;
  shop.unlock = i === 0 ? 0 : RANKS[3].unlock * SHOP_SCALE[i - 1] * MOVE_MULTIPLE;
  if (i === SHOPS.length - 1) shop.target = Infinity;
});

/* ---------------------------------------------------------- the crew --- */

/* Bought with cash, kept forever, and the only upgrades that are not a
   station. Each is a curve of its own so a run has more than one thing to
   spend on at any moment. */
const UPGRADES = [
  {
    id: 'crew', name: 'Hire Crew', blurb: 'One more pair of hands carrying orders.',
    icon: '👥', base: 240, growth: 6.4, max: 5,
    effect: level => `${level + 1} on shift`,
  },
  {
    id: 'legs', name: 'Faster Legs', blurb: 'The crew move 12% quicker each level.',
    icon: '👟', base: 180, growth: 2.4, max: 30,
    effect: level => `+${Math.round(level * 12)}% crew speed`,
  },
  {
    id: 'trays', name: 'Bigger Trays', blurb: 'Carry another dish per trip.',
    icon: '🍽️', base: 900, growth: 9, max: 4,
    effect: level => `${level + 1} dishes per trip`,
  },
  {
    id: 'tips', name: 'Tip Jar', blurb: 'Every sale pays 15% more per level.',
    icon: '🫙', base: 500, growth: 3.1, max: 40,
    effect: level => `+${Math.round(level * 15)}% takings`,
  },
  {
    id: 'sign', name: 'Street Sign', blurb: 'Guests arrive 10% more often per level.',
    icon: '🪧', base: 260, growth: 2.8, max: 25,
    effect: level => `+${Math.round(level * 10)}% footfall`,
  },
  {
    id: 'seats', name: 'Comfier Seats', blurb: 'Guests wait 20% longer before giving up.',
    icon: '🪑', base: 400, growth: 2.6, max: 15,
    effect: level => `+${Math.round(level * 20)}% patience`,
  },
  {
    id: 'till', name: 'Auto Till', blurb: 'Money sweeps itself up faster.',
    icon: '🧾', base: 1400, growth: 4.2, max: 10,
    effect: level => (level ? `collects in ${(3.5 / (1 + level * 0.55)).toFixed(1)}s` : 'collect by hand'),
  },
];
const UPGRADE_BY_ID = new Map(UPGRADES.map(u => [u.id, u]));
const upgradeCost = (def, level) => Math.ceil(def.base * Math.pow(def.growth, level));

/* --------------------------------------------------------- gift boxes --- */

const RARITY = {
  common: { name: 'Common', weight: 62, color: P.silver, gems: [1, 2] },
  rare: { name: 'Rare', weight: 26, color: P.bodySky, gems: [2, 5] },
  epic: { name: 'Epic', weight: 10, color: P.bodyGrape, gems: [5, 12] },
  legendary: { name: 'Legendary', weight: 2, color: P.gold, gems: [15, 40] },
};
const RARITY_ORDER = ['common', 'rare', 'epic', 'legendary'];

/* What a guest leaves behind, and how often. Luck from the wardrobe pushes the
   chance up; nothing pushes it past a quarter, because a box every four guests
   stops being a surprise. */
const BOX_CHANCE = 0.06;
const BOX_CHANCE_MAX = 0.25;

/* Buying an item outright, for the one you want and did not find. */
const GEM_PRICE = { common: 25, rare: 60, epic: 160, legendary: 420 };

/* ------------------------------------------------------------- boosts --- */

/* What a garment's boost actually does. Every one of them is additive within
   its stat and multiplicative against the base, which keeps a full wardrobe
   worth about +40% rather than about +4000%. */
const BOOSTS = {
  tips: { name: 'Takings', apply: (v, b) => v * (1 + b) },
  value: { name: 'Dish value', apply: (v, b) => v * (1 + b) },
  speed: { name: 'Crew speed', apply: (v, b) => v * (1 + b) },
  prep: { name: 'Prep speed', apply: (v, b) => v * (1 + b) },
  patience: { name: 'Guest patience', apply: (v, b) => v * (1 + b) },
  luck: { name: 'Box luck', apply: (v, b) => v * (1 + b) },
};

/* Sixteen faces in the crowd. Enough that a queue is never four of the same
   person, few enough that the model cache has a ceiling — every look costs a
   model per pose, and on the software path each of those is a baked sprite. */
const GUEST_LOOKS = 16;

/* --------------------------------------------------------------- floor --- */

/* The shop floor, in voxels. Everything the simulation places is a coordinate
   in here, so moving a counter is one number rather than a hunt. */
const FLOOR = {
  cols: 8, rows: 6, tile: CV.TILE,
  get width() { return this.cols * this.tile; },
  get depth() { return this.rows * this.tile; },
  stationZ: -26,
  stationX: [-36, -12, 12, 36],
  counterZ: -4,
  counterX: [-37, -22, -7, 8, 23, 38],
  crewLaneZ: -15,
  queueZ: 8,
  queueX: [-30, -15, 0, 15, 30],
  tables: [{ x: -32, z: 24 }, { x: 0, z: 26 }, { x: 32, z: 24 }],
  door: { x: 40, z: 36 },
  outside: { x: 54, z: 44 },
};

/* -------------------------------------------------------------- tutorial --- */

/* Six lines, shown once each, in order, when their condition first holds. A
   tutorial that fires on state rather than on a timer never tells you to do
   something you have already done. */
const HINTS = [
  { id: 'welcome', text: 'Tap a machine to hurry it along. Tap the money on the floor to sweep it up.' },
  { id: 'upgrade', text: 'Upgrades are the game. Feed the cheapest machine first — it pays back quickest.' },
  { id: 'crew', text: 'Hire crew from the Shop tab. One pair of hands can only carry so much.' },
  { id: 'box', text: 'A gift box! Open it for gems and something to wear.' },
  { id: 'wear', text: 'Everything you wear does something. Check the Wardrobe.' },
  { id: 'move', text: 'You can move on to a bigger shop. The machines reset; everything you own comes with you.' },
];

CV.Content = {
  money, duration, SUFFIX,
  GROWTH_VALUE, GROWTH_COST, stationValue, stationCost, stationPrep,
  stationCapacity, stationTier, NEXT_TIER_AT, affordableLevels, bulkCost,
  STATIONS, SHOPS, RANKS, SHOP_SCALE, rankValue, rankUnlock,
  UPGRADES, UPGRADE_BY_ID, upgradeCost,
  RARITY, RARITY_ORDER, BOX_CHANCE, BOX_CHANCE_MAX, GEM_PRICE, BOOSTS,
  FLOOR, HINTS, GUEST_LOOKS,
};

})(typeof globalThis !== 'undefined' ? globalThis : this);
