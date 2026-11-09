// Store floor plan. Interior: x ∈ [-20, 20], z ∈ [-15, 15], ceiling 5 m, front wall at z = +15.
// Every model faces +Z by default; rotY rotates it (π/2 → faces +X, -π/2 → faces -X, π → faces -Z).
import * as THREE from 'three';

export const STORE = { width: 40, depth: 30, height: 5, entranceX: 12, entranceWidth: 3.2 };

const PI = Math.PI;
const HALF = PI / 2;

/** Named areas for the HUD location indicator: [name, xMin, xMax, zMin, zMax] (first match wins). */
export const AREAS = [
  ['Kasalar', -15.5, 2.5, 5.0, 10.4],
  ['Meyve & Sebze', 6.0, 20, -1.8, 10.4],
  ['Şarküteri', 5.5, 11.5, -15, -10.6],
  ['Fırın', 11.5, 20, -15, -9.2],
  ['Et & Şarküteri Reyonu', 17.0, 20, -9.2, -1.8],
  ['Donuk Gıda', 5.0, 17.0, -10.6, -1.8],
  ['Soğuk Reyon', -20, 5.0, -15, -12.0],
  ['Reyonlar', -20, 5.0, -12.0, -1.8],
  ['Kampanya Alanı', -20, 6.0, -1.8, 5.0],
  ['Giriş', -20, 20, 10.4, 15],
  ['Otopark', -60, 60, 15, 80],
];

// Rows of double-sided gondolas (long axis along Z).
const GONDOLA_ROWS = [
  { x: -16, cat: ['beverages', 'beverages'] },
  { x: -13, cat: ['snacks', 'snacks'] },
  { x: -10, cat: ['cereal', 'cereal'] },
  { x: -7, cat: ['pasta', 'pasta'] },
  { x: -4, cat: ['canned', 'grocery'] },
  { x: -1, cat: ['cleaning', 'cleaning'] },
  { x: 2, cat: ['personal', 'personal'] },
];
const CAT_TR = {
  beverages: 'İçecekler', snacks: 'Atıştırmalık', cereal: 'Kahvaltılık', pasta: 'Makarna & Bakliyat',
  canned: 'Konserve', grocery: 'Gıda', cleaning: 'Temizlik', personal: 'Kişisel Bakım',
};

export const LANES = [-13.4, -10.8, -8.2, -5.6, -3.0];
export const LANE_Z = 7.6;

/**
 * Builds the store. `mods` is a map of loaded model modules (missing modules/factories are skipped).
 * Returns { root, building, placed: [{obj, kind}], people: [] }
 */
export function buildStore(mods, log = console.warn) {
  const root = new THREE.Group();
  root.name = 'Store';
  const placed = [];

  const fn = (mod, name) => (mods[mod] && typeof mods[mod][name] === 'function' ? mods[mod][name] : null);
  function place(mod, name, args, x, z, rotY = 0, y = 0, kind = mod) {
    const f = fn(mod, name);
    if (!f) { log(`[layout] missing ${mod}.${name}`); return null; }
    let obj;
    try { obj = Array.isArray(args) ? f(...args) : f(args); }
    catch (e) { log(`[layout] ${mod}.${name} failed: ${e.message}`); return null; }
    obj.position.set(x, y, z);
    obj.rotation.y = rotY;
    root.add(obj);
    placed.push({ obj, kind, name });
    return obj;
  }

  // ---------- Building ----------
  const building = place('building', 'createBuilding', { ...STORE }, 0, 0, 0, 0, 'building');

  // ---------- Back wall: reach-in coolers (z = -15) ----------
  const coolers = [['frozen', -18.15], ['frozen', -14.9], ['drinks', -11.65], ['drinks', -8.4], ['dairy', -5.15], ['dairy', -1.9]];
  coolers.forEach(([category, x], i) => place('refrigeration', 'createReachInCooler', { doors: 4, category, seed: 11 + i }, x, -15 + 0.425));

  // Deli + bakery at the back right
  place('refrigeration', 'createDeliCounter', { length: 4, seed: 3 }, 8.5, -12.6);
  place('produce', 'createBakeryCase', { length: 2.4, seed: 4 }, 15.0, -12.75);
  place('produce', 'createBreadRack', { length: 2.0, seed: 5 }, 20 - 0.3, -12.4, -HALF);
  place('produce', 'createBreadRack', { length: 2.0, seed: 6 }, 20 - 0.3, -10.3, -HALF);

  // Right wall: open multidecks (meat / deli)
  place('refrigeration', 'createOpenMultideck', { length: 2.5, category: 'meat', seed: 7 }, 20 - 0.475, -7.0, -HALF);
  place('refrigeration', 'createOpenMultideck', { length: 2.5, category: 'dairy', seed: 8 }, 20 - 0.475, -4.4, -HALF);

  // Frozen island freezers
  [7.5, 11.5, 15.5].forEach((x, i) => {
    place('refrigeration', 'createChestFreezer', { category: 'icecream', seed: 20 + i }, x, -8.4);
    place('refrigeration', 'createChestFreezer', { category: 'icecream', seed: 30 + i }, x, -5.2);
  });

  // ---------- Center: gondola rows ----------
  GONDOLA_ROWS.forEach((row, r) => {
    place('shelving', 'createGondola', { length: 4, category: row.cat[0], seed: 100 + r * 2 }, row.x, -8.1, HALF);
    place('shelving', 'createGondola', { length: 4, category: row.cat[1], seed: 101 + r * 2 }, row.x, -4.1, HALF);
    place('shelving', 'createEndCap', { category: r % 2 ? 'snacks' : 'beverages', seed: 200 + r, promoText: r % 2 ? 'KAMPANYA' : '2 AL 1 ÖDE' }, row.x, -10.35, PI);
    place('shelving', 'createEndCap', { category: ['snacks', 'cereal', 'beverages', 'cleaning'][r % 4], seed: 210 + r, promoText: ['İNDİRİM', 'KAMPANYA', '%25 İNDİRİM', 'SÜPER FİYAT'][r % 4] }, row.x, -1.85, 0);
  });
  // Aisle signs (between rows, plus the left aisle by the wall)
  const aisles = [[-18.0, ['Su & Meşrubat', CAT_TR.beverages]]];
  for (let i = 0; i < GONDOLA_ROWS.length - 1; i++) {
    const a = GONDOLA_ROWS[i], b = GONDOLA_ROWS[i + 1];
    aisles.push([(a.x + b.x) / 2, [CAT_TR[a.cat[0]], CAT_TR[b.cat[0]]]]);
  }
  aisles.forEach(([x, lines], i) => place('shelving', 'createAisleSign', { number: i + 1, lines, hangHeight: 2.75, ceilingHeight: STORE.height }, x, -6.1, HALF, 0, 'sign'));

  // Left wall shelves (face +X)
  [['beverages', -9], ['beverages', -5], ['cleaning', -1], ['personal', 3]].forEach(([category, z], i) =>
    place('shelving', 'createWallShelf', { length: 4, category, seed: 300 + i }, -20 + 0.275, z, HALF));

  // ---------- Produce (right front) ----------
  const prodItems = [
    ['apple_red', 'apple_green', 'pear', 'peach'],
    ['orange', 'lemon', 'banana', 'grapes'],
    ['tomato', 'cucumber', 'pepper_green', 'eggplant'],
    ['potato', 'onion', 'carrot', 'lettuce'],
    ['banana', 'apple_red', 'orange', 'grapes'],
    ['tomato', 'pepper_green', 'lettuce', 'cucumber'],
  ];
  let pi = 0;
  for (const z of [1.0, 4.4]) for (const x of [8.4, 12.0, 15.6]) {
    place('produce', 'createProduceTable', { length: 2.4, items: prodItems[pi % prodItems.length], seed: 400 + pi }, x, z);
    pi++;
  }
  [['tomato', 'cucumber', 'pepper_green', 'eggplant', 'lettuce', 'carrot'],
   ['apple_red', 'orange', 'banana', 'lemon', 'grapes', 'pear'],
   ['potato', 'onion', 'carrot', 'peach', 'apple_green', 'tomato']].forEach((items, i) =>
    place('produce', 'createProduceWallRack', { length: 3.0, items, seed: 420 + i }, 20 - 0.475, 0.2 + i * 3.1, -HALF));
  place('produce', 'createBulkBin', { item: 'watermelon', seed: 430 }, 8.6, 8.2);
  place('produce', 'createBulkBin', { item: 'potato', seed: 431 }, 15.8, 8.2);
  place('produce', 'createScaleStand', [], 18.9, 9.0, -HALF);

  // ---------- Checkouts ----------
  LANES.forEach((x, i) => place('checkout', 'createCheckoutLane', { laneNumber: i + 1, seed: 500 + i, open: i < 3 }, x, LANE_Z));
  [[-0.2, 6.7], [1.2, 6.7], [-0.2, 8.7], [1.2, 8.7]].forEach(([x, z], i) => place('checkout', 'createSelfCheckout', { seed: 520 + i }, x, z));
  place('checkout', 'createCustomerServiceDesk', { length: 3.0 }, -20 + 0.8, 12.2, HALF);

  // ---------- Action alley / promo ----------
  place('props', 'createPalletDisplay', { seed: 600, kind: 'water' }, -14.5, 1.6);
  place('props', 'createPalletDisplay', { seed: 601, kind: 'cola' }, -8.5, 1.6, HALF);
  place('props', 'createPalletDisplay', { seed: 602, kind: 'flour' }, -2.5, 1.6);
  place('props', 'createPromoStand', { text: 'HAFTANIN FIRSATLARI', seed: 603 }, -11.5, 1.8, 0);
  place('props', 'createPromoStand', { text: 'TAZE VE UYGUN', seed: 604 }, 14.2, 12.6, PI / 6);
  place('props', 'createWetFloorSign', [], -5.5, -7.0, 0.4);

  // ---------- Entrance ----------
  place('props', 'createSecurityGates', { width: 2.6 }, STORE.entranceX, 13.6, 0, 0, 'gates');
  place('props', 'createCartCorral', { count: 7, seed: 610 }, 18.4, 11.6);
  place('props', 'createBasketStack', { count: 6 }, 9.6, 13.7);
  place('props', 'createPottedPlant', { seed: 620 }, 7.6, 14.4);
  place('props', 'createPottedPlant', { seed: 621 }, 16.6, 14.4);
  place('props', 'createPottedPlant', { seed: 622 }, -19.3, 7.0);
  place('props', 'createATM', [], -15.6, 14.45, PI);
  place('props', 'createTrashBin', [], 15.2, 16.0);
  place('props', 'createTrashBin', [], 4.0, 12.8);

  // Parking lot carts
  place('props', 'createShoppingCart', { seed: 630, color: 0x2e7d32 }, 6.5, 21.0, 0.6);
  place('props', 'createShoppingCart', { seed: 631, color: 0xd32f2f }, 19.0, 25.5, -1.9);

  // ---------- Hanging department signs & wall graphics ----------
  const hs = (text, x, z, rotY, width = 3.2, color = '#2e7d32') =>
    place('building', 'createHangingSign', [text, { width, height: 0.65, color, hangHeight: 3.1, ceilingHeight: STORE.height }], x, z, rotY, 0, 'sign');
  hs('MEYVE & SEBZE', 12.0, 2.7, 0, 3.6);
  hs('DONUK GIDA', 11.5, -6.8, 0, 3.0, '#1565c0');
  hs('FIRIN', 15.0, -10.6, 0, 2.2, '#8d5524');
  hs('KASALAR', -8.2, 4.6, 0, 3.0, '#c62828');
  hs('SÜT ÜRÜNLERİ', -3.5, -12.6, 0, 3.4, '#1565c0');
  hs('İÇECEKLER', -10.0, -12.6, 0, 3.0, '#1565c0');

  const wg = (text, x, y, z, rotY, width, color) => place('building', 'createWallGraphic', [text, { width, height: 1.0, color }], x, z, rotY, y, 'sign');
  wg('TAZE MEYVE & SEBZE', 19.95, 2.7, 3.3, -HALF, 7.5, '#2e7d32');
  wg('ŞARKÜTERİ', 8.5, 2.9, -14.97, 0, 4.0, '#8e2424');
  wg('TAZE EKMEK', 19.95, 2.7, -11.35, -HALF, 4.0, '#8d5524');
  wg('HOŞ GELDİNİZ', -3.0, 3.3, 14.95, PI, 6.0, '#2e7d32');

  return { root, building, placed };
}

/** People: placed after store so they can reference lane positions. */
export function populate(root, mods, placed, log = console.warn) {
  const P = mods.props;
  if (!P || typeof P.createPerson !== 'function') { log('[layout] createPerson missing'); return []; }
  const people = [];
  const add = (opts, x, z, rotY, y = 0) => {
    try {
      const p = P.createPerson(opts);
      p.position.set(x, y, z); p.rotation.y = rotY;
      root.add(p); people.push(p); placed.push({ obj: p, kind: 'person' });
      return p;
    } catch (e) { log('[layout] person failed: ' + e.message); return null; }
  };
  // Cashiers at open lanes (seated in the cashier zone on +X side, facing -X)
  LANES.slice(0, 3).forEach((x, i) => add({ seed: 700 + i, outfit: 'cashier', pose: 'sit' }, x + CASHIER_OFFSET.x, LANE_Z + CASHIER_OFFSET.z, -HALF));
  // Staff
  add({ seed: 710, outfit: 'staff', pose: 'stand' }, 8.5, -13.75, 0);
  add({ seed: 711, outfit: 'staff', pose: 'stand' }, 15.0, -14.0, 0);
  add({ seed: 712, outfit: 'staff', pose: 'stand' }, -19.0 + 0.9, 12.2, HALF);
  add({ seed: 713, outfit: 'staff', pose: 'walk' }, -5.5, -12.8, HALF);
  // Customers
  add({ seed: 720, outfit: 'casual', pose: 'stand' }, 12.0, 2.75, PI);
  add({ seed: 721, outfit: 'casual', pose: 'walk' }, 5.0, -3.0, -PI * 0.75);
  add({ seed: 722, outfit: 'casual', pose: 'stand' }, -11.5, -6.6, -HALF);
  add({ seed: 723, outfit: 'casual', pose: 'stand' }, 8.5, -11.25, PI);
  add({ seed: 724, outfit: 'casual', pose: 'walk' }, -6.0, 3.4, HALF);
  add({ seed: 725, outfit: 'casual', pose: 'stand' }, LANES[0] + WALKWAY_OFFSET, LANE_Z - 0.6, 0.0);
  add({ seed: 726, outfit: 'casual', pose: 'stand' }, LANES[1] + WALKWAY_OFFSET, LANE_Z - 0.3, 0.0);
  add({ seed: 727, outfit: 'casual', pose: 'stand' }, 0.5, 9.4, PI);
  add({ seed: 728, outfit: 'casual', pose: 'walk' }, 13.0, 19.0, PI * 0.9);
  add({ seed: 729, outfit: 'casual', pose: 'stand' }, 19.0, -5.6, HALF);
  return people;
}

// Offsets (relative to lane origin) – tuned to checkout.js geometry.
export const CASHIER_OFFSET = { x: 0.45, z: 0.0 };
export const WALKWAY_OFFSET = -1.35;
