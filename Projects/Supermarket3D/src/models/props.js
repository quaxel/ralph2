// Bereket Market - carts, baskets, people and small props.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { seededRandom, pick, stdMat, boxGeo, boxAt, labelTexture, setShadows } from './common.js';

const BRAND = 0x2e7d32;
const BRAND_CSS = '#2e7d32';

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------
const _Y = new THREE.Vector3(0, 1, 0);
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _one = new THREE.Vector3(1, 1, 1);

/** Thin open cylinder from point a to point b (arrays). */
function rodGeo(a, b, r, seg = 5) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const d = B.clone().sub(A);
  const len = d.length();
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1, true);
  _q.setFromUnitVectors(_Y, d.normalize());
  _m4.compose(A.add(B).multiplyScalar(0.5), _q, _one);
  g.applyMatrix4(_m4);
  return g;
}

function capsuleBetween(a, b, r, capSeg = 4, radial = 8) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const d = B.clone().sub(A);
  const len = d.length();
  const g = new THREE.CapsuleGeometry(r, Math.max(0.005, len - 2 * r), capSeg, radial);
  _q.setFromUnitVectors(_Y, d.normalize());
  _m4.compose(A.add(B).multiplyScalar(0.5), _q, _one);
  g.applyMatrix4(_m4);
  return g;
}

function boxG(w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx || ry || rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)));
  g.translate(x, y, z);
  return g;
}

/** Ellipsoid (optionally partial sphere) at a position. */
function ell(rx, ry, rz, x, y, z, ws = 10, hs = 8, ps = 0, pl = Math.PI * 2, ts = 0, tl = Math.PI) {
  const g = new THREE.SphereGeometry(1, ws, hs, ps, pl, ts, tl);
  g.scale(rx, ry, rz);
  g.translate(x, y, z);
  return g;
}

function tint(geo, color) {
  const c = new THREE.Color(color);
  const n = geo.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}

function merge(list) {
  if (!list.length) return null;
  const g = mergeGeometries(list, false);
  list.forEach((x) => x.dispose());
  return g;
}

function mesh(geo, mat, name) {
  const m = new THREE.Mesh(geo, mat);
  if (name) m.name = name;
  return m;
}

const _canvasTex = new Map();
function canvasTex(key, w, h, draw) {
  let t = _canvasTex.get(key);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  _canvasTex.set(key, t);
  return t;
}

const hex = (c) => '#' + new THREE.Color(c).getHexString();

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

const M = {
  chrome: stdMat(0xcfd4d9, { metalness: 0.55, roughness: 0.38 }),
  rubber: stdMat(0x1c1c1e, { roughness: 0.85 }),
  darkPlastic: stdMat(0x2b2f33, { roughness: 0.6 }),
  black: stdMat(0x101214, { roughness: 0.5 }),
  white: stdMat(0xf3f4f2, { roughness: 0.55 }),
  green: stdMat(BRAND, { roughness: 0.55 }),
  metalDark: stdMat(0x4a5057, { metalness: 0.6, roughness: 0.45 }),
};

// ---------------------------------------------------------------------------
// Shopping cart
// ---------------------------------------------------------------------------
const _cartCache = new Map();

function buildCartGeos(color) {
  const key = String(color);
  if (_cartCache.has(key)) return _cartCache.get(key);

  const wire = [], rubber = [], dark = [], acc = [];
  const lerp = THREE.MathUtils.lerp;
  const rod = (a, b, r = 0.0035) => wire.push(rodGeo(a, b, r));
  const Y0 = 0.42, Y1 = 0.9;
  const ring = (t) => ({
    y: lerp(Y0, Y1, t), hw: lerp(0.17, 0.266, t),
    zb: lerp(-0.30, -0.40, t), zf: lerp(0.33, 0.455, t),
  });

  // horizontal rings
  for (const t of [0, 0.35, 0.7, 1]) {
    const r = ring(t), rr = t === 1 ? 0.0065 : 0.0035;
    rod([-r.hw, r.y, r.zb], [r.hw, r.y, r.zb], rr);
    rod([-r.hw, r.y, r.zf], [r.hw, r.y, r.zf], rr);
    rod([-r.hw, r.y, r.zb], [-r.hw, r.y, r.zf], rr);
    rod([r.hw, r.y, r.zb], [r.hw, r.y, r.zf], rr);
    if (t === 1) {
      for (const sx of [-1, 1]) for (const z of [r.zb, r.zf]) {
        const s = new THREE.SphereGeometry(0.0072, 6, 4); s.translate(sx * r.hw, r.y, z); wire.push(s);
      }
    }
  }
  const r0 = ring(0), r1 = ring(1);
  // side wall verticals
  for (let i = 0; i <= 8; i++) {
    const u = i / 8;
    const z0 = lerp(r0.zb, r0.zf, u), z1 = lerp(r1.zb, r1.zf, u);
    for (const sx of [-1, 1]) rod([sx * r0.hw, r0.y, z0], [sx * r1.hw, r1.y, z1], i === 0 || i === 8 ? 0.0045 : 0.003);
  }
  // front / back wall verticals
  for (let i = 1; i < 6; i++) {
    const v = i / 6;
    rod([lerp(-r0.hw, r0.hw, v), r0.y, r0.zb], [lerp(-r1.hw, r1.hw, v), r1.y, r1.zb], 0.003);
    rod([lerp(-r0.hw, r0.hw, v), r0.y, r0.zf], [lerp(-r1.hw, r1.hw, v), r1.y, r1.zf], 0.003);
  }
  // basket floor grid
  for (let i = 0; i <= 6; i++) {
    const x = lerp(-r0.hw, r0.hw, i / 6);
    rod([x, Y0, r0.zb], [x, Y0, r0.zf], 0.003);
  }
  for (let i = 0; i <= 9; i++) {
    const z = lerp(r0.zb, r0.zf, i / 9);
    rod([-r0.hw, Y0, z], [r0.hw, Y0, z], 0.003);
  }

  // chassis
  const ry = 0.17, rx = 0.2;
  rod([-rx, ry, -0.34], [-rx, ry, 0.40], 0.0055);
  rod([rx, ry, -0.34], [rx, ry, 0.40], 0.0055);
  rod([-rx, ry, -0.34], [rx, ry, -0.34], 0.005);
  rod([-rx, ry, 0.40], [rx, ry, 0.40], 0.005);
  rod([-rx, ry, 0.03], [rx, ry, 0.03], 0.004);
  // lower tray
  for (let i = 0; i <= 4; i++) { const x = lerp(-0.16, 0.16, i / 4); rod([x, 0.19, -0.32], [x, 0.19, 0.38], 0.003); }
  for (let i = 0; i <= 8; i++) { const z = lerp(-0.32, 0.38, i / 8); rod([-rx, 0.19, z], [rx, 0.19, z], 0.003); }
  // posts & struts
  for (const sx of [-1, 1]) {
    rod([sx * rx, ry, -0.32], [sx * 0.17, Y0, -0.30], 0.005);
    rod([sx * rx, ry, 0.36], [sx * 0.17, Y0, 0.33], 0.005);
    rod([sx * rx, ry, -0.34], [sx * 0.266, Y1, -0.40], 0.0055);
    rod([sx * rx, ry, 0.40], [sx * 0.266, Y1, 0.455], 0.0055);
  }

  // casters
  const wheelG = new THREE.CylinderGeometry(0.06, 0.06, 0.03, 14); wheelG.rotateZ(Math.PI / 2);
  const hubG = new THREE.CylinderGeometry(0.022, 0.022, 0.034, 8); hubG.rotateZ(Math.PI / 2);
  for (const sx of [-1, 1]) for (const z of [-0.34, 0.40]) {
    const x = sx * rx;
    rubber.push(wheelG.clone().translate(x, 0.06, z));
    wire.push(hubG.clone().translate(x, 0.06, z));
    dark.push(boxG(0.006, 0.1, 0.045, x - 0.021, 0.105, z));
    dark.push(boxG(0.006, 0.1, 0.045, x + 0.021, 0.105, z));
    dark.push(boxG(0.058, 0.012, 0.058, x, 0.158, z));
  }
  wheelG.dispose(); hubG.dispose();

  // handle
  const hy = 0.98, hz = -0.47;
  const bar = new THREE.CylinderGeometry(0.016, 0.016, 0.5, 10); bar.rotateZ(Math.PI / 2); bar.translate(0, hy, hz);
  dark.push(bar);
  const grip = new THREE.CylinderGeometry(0.0195, 0.0195, 0.26, 12); grip.rotateZ(Math.PI / 2); grip.translate(0, hy, hz);
  acc.push(grip);
  for (const sx of [-1, 1]) {
    acc.push(new THREE.SphereGeometry(0.019, 8, 6).translate(sx * 0.25, hy, hz));
    dark.push(rodGeo([sx * 0.266, Y1, -0.40], [sx * 0.25, hy, hz], 0.011, 6));
  }

  // fold-down child seat flap (closed, resting on the rear wall)
  const flap = [];
  flap.push(boxG(0.4, 0.04, 0.012, 0, 0.11, 0));
  flap.push(boxG(0.4, 0.04, 0.012, 0, -0.11, 0));
  for (const x of [-0.18, 0, 0.18]) flap.push(boxG(0.04, 0.26, 0.012, x, 0, 0));
  const flapG = merge(flap);
  flapG.applyMatrix4(new THREE.Matrix4().compose(
    new THREE.Vector3(0, 0.76, -0.362), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.208, 0, 0)), _one));
  acc.push(flapG);

  const out = {
    wire: merge(wire), rubber: merge(rubber), dark: merge(dark), acc: merge(acc),
  };
  _cartCache.set(key, out);
  return out;
}

function cartMaterials(color) {
  return {
    wire: M.chrome, rubber: M.rubber, dark: M.darkPlastic,
    acc: stdMat(color, { roughness: 0.5 }),
  };
}

export function createShoppingCart({ seed = 1, color = 0xd32f2f } = {}) {
  void seed;
  const g = new THREE.Group();
  g.name = 'ShoppingCart';
  const geos = buildCartGeos(color), mats = cartMaterials(color);
  for (const k of ['wire', 'rubber', 'dark', 'acc']) g.add(mesh(geos[k], mats[k], 'cart_' + k));
  setShadows(g, true, true);
  return g;
}

// ---------------------------------------------------------------------------
// Cart corral
// ---------------------------------------------------------------------------
export function createCartCorral({ count = 6, seed = 1 } = {}) {
  const rng = seededRandom(seed);
  const g = new THREE.Group();
  g.name = 'CartCorral';
  const spacing = 0.23;
  const span = 0.95 + (count - 1) * spacing;
  const L = span + 0.16, W = 0.84;
  const zFront = L / 2 - 0.06;           // nose of the first cart
  const cartColor = pick(rng, [0xd32f2f, 0xd32f2f, 0x1565c0]);
  const geos = buildCartGeos(cartColor), mats = cartMaterials(cartColor);
  const lists = { wire: [], rubber: [], dark: [], acc: [] };
  for (let i = 0; i < count; i++) {
    const m = new THREE.Matrix4().makeTranslation(0, i * 0.004, zFront - 0.465 - i * spacing);
    for (const k in lists) lists[k].push(geos[k].clone().applyMatrix4(m));
  }
  for (const k in lists) g.add(mesh(merge(lists[k]), mats[k], 'carts_' + k));

  // rails
  const rails = [];
  const hw = W / 2, top = 0.78, mid = 0.42;
  const post = (x, z, h = top) => rails.push(boxG(0.045, h, 0.045, x, h / 2, z));
  const nPosts = Math.max(2, Math.round(L / 0.9) + 1);
  for (let i = 0; i < nPosts; i++) {
    const z = -L / 2 + (L * i) / (nPosts - 1);
    for (const sx of [-1, 1]) post(sx * hw, z, i === nPosts - 1 ? 1.2 : top);
  }
  for (const y of [top - 0.02, mid]) {
    for (const sx of [-1, 1]) rails.push(rodGeo([sx * hw, y, -L / 2], [sx * hw, y, L / 2], 0.014, 8));
    rails.push(rodGeo([-hw, y, L / 2], [hw, y, L / 2], 0.014, 8));
  }
  // base feet
  for (const sx of [-1, 1]) rails.push(boxG(0.05, 0.02, L, sx * hw, 0.01, 0));
  g.add(mesh(merge(rails), M.metalDark, 'corral_rails'));

  // sign (double sided) between the front posts
  const signW = W - 0.1, signH = 0.2, sy = 1.02;
  const tex = labelTexture('ARABALAR', { width: 512, height: 160, bg: BRAND_CSS, fg: '#ffffff', font: 'bold 96px sans-serif', border: '#ffffff' });
  const signMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 });
  const plane = new THREE.PlaneGeometry(signW, signH);
  const front = mesh(plane, signMat, 'sign_front'); front.position.set(0, sy, L / 2 + 0.024);
  const back = mesh(plane, signMat, 'sign_back'); back.position.set(0, sy, L / 2 - 0.024); back.rotation.y = Math.PI;
  g.add(front, back);
  const sboard = mesh(boxGeo(signW + 0.02, signH + 0.02, 0.04), M.metalDark, 'sign_board');
  sboard.position.set(0, sy, L / 2);
  g.add(sboard);

  setShadows(g, true, true);
  front.castShadow = false; back.castShadow = false;
  return g;
}

// ---------------------------------------------------------------------------
// Baskets
// ---------------------------------------------------------------------------
let _slotTex = null;
function slotTexture() {
  if (_slotTex) return _slotTex;
  const c = document.createElement('canvas');
  c.width = 64; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 64, 256);
  g.fillStyle = '#3a3a3a';
  for (let r = 0; r < 5; r++) {
    roundRect(g, 14, 30 + r * 42, 36, 24, 8); g.fill();
  }
  _slotTex = new THREE.CanvasTexture(c);
  _slotTex.wrapS = _slotTex.wrapT = THREE.RepeatWrapping;
  _slotTex.repeat.set(36, 1);
  _slotTex.colorSpace = THREE.SRGBColorSpace;
  _slotTex.anisotropy = 4;
  return _slotTex;
}
const _basketBodyMat = new Map();
function basketBodyMat(color) {
  let m = _basketBodyMat.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, map: slotTexture(), roughness: 0.45, side: THREE.DoubleSide });
    _basketBodyMat.set(color, m);
  }
  return m;
}

let _basketBodyGeo = null;
function basketBodyGeo() {
  if (_basketBodyGeo) return _basketBodyGeo;
  const g = new THREE.CylinderGeometry(Math.SQRT2, Math.SQRT2 * 0.8, 0.24, 4, 1, true);
  g.rotateY(Math.PI / 4);
  g.scale(0.225, 1, 0.15);
  g.translate(0, 0.13, 0);
  _basketBodyGeo = g;
  return g;
}

const _basketTrim = new Map();
function basketTrimGeo(handles) {
  const key = handles ? 'h' : 'n';
  if (_basketTrim.has(key)) return _basketTrim.get(key);
  const l = [];
  // bottom plate
  l.push(boxG(0.364, 0.02, 0.244, 0, 0.012, 0));
  // top rim ring
  const hx = 0.226, hz = 0.151, th = 0.016, rh = 0.016;
  l.push(boxG(2 * hx + th, rh, th, 0, 0.25, -hz));
  l.push(boxG(2 * hx + th, rh, th, 0, 0.25, hz));
  l.push(boxG(th, rh, 2 * hz, -hx, 0.25, 0));
  l.push(boxG(th, rh, 2 * hz, hx, 0.25, 0));
  // reinforcing band mid height
  if (handles) {
    for (const sx of [-1, 1]) {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(sx * 0.215, 0.245, -0.095),
        new THREE.Vector3(sx * 0.222, 0.29, -0.085),
        new THREE.Vector3(sx * 0.232, 0.318, -0.04),
        new THREE.Vector3(sx * 0.232, 0.318, 0.04),
        new THREE.Vector3(sx * 0.222, 0.29, 0.085),
        new THREE.Vector3(sx * 0.215, 0.245, 0.095),
      ]);
      l.push(new THREE.TubeGeometry(curve, 14, 0.008, 6, false));
    }
  }
  const out = merge(l);
  _basketTrim.set(key, out);
  return out;
}

function basketItems(rng) {
  const l = [];
  const base = 0.022;
  const items = [
    () => tint(boxG(0.07, 0.07, 0.2, 0, 0.035, 0, 0, rng() * 0.6 - 0.3, 0), 0xe8c27a),                    // bread
    () => tint(boxG(0.07, 0.2, 0.07, 0, 0.1, 0, 0, rng() * 1.2, 0), pick(rng, [0xf5f5f5, 0x90caf9])),      // milk
    () => tint(new THREE.CylinderGeometry(0.032, 0.036, 0.22, 10).translate(0, 0.11, 0), 0x6b8e23),        // oil bottle
    () => tint(boxG(0.1, 0.16, 0.04, 0, 0.08, 0, 0, rng() * 0.8 - 0.4, 0), pick(rng, [0xfbc02d, 0xe53935])), // cereal
    () => tint(new THREE.SphereGeometry(0.036, 8, 6).translate(0, 0.036, 0), 0xc62828),                    // apple
    () => tint(new THREE.SphereGeometry(0.036, 8, 6).translate(0, 0.036, 0), 0x7cb342),                    // pear
    () => tint(new THREE.CylinderGeometry(0.034, 0.034, 0.1, 10).translate(0, 0.05, 0), 0xb0bec5),          // can
  ];
  const slots = [[-0.14, -0.06], [-0.07, 0.07], [0.0, -0.05], [0.06, 0.06], [0.13, -0.03], [0.14, 0.07], [-0.02, 0.08], [-0.12, 0.05]];
  const n = 6 + Math.floor(rng() * 2);
  for (let i = 0; i < n; i++) {
    const g = items[i % items.length]();
    g.translate(slots[i][0] + (rng() - 0.5) * 0.02, base, slots[i][1]);
    l.push(g);
  }
  return merge(l);
}

export function createBasket({ color = 0xd32f2f, seed = 1, filled = false } = {}) {
  const g = new THREE.Group();
  g.name = 'Basket';
  g.add(mesh(basketBodyGeo(), basketBodyMat(color), 'basket_body'));
  g.add(mesh(basketTrimGeo(true), stdMat(color, { roughness: 0.45 }), 'basket_trim'));
  if (filled) {
    g.add(mesh(basketItems(seededRandom(seed)), stdMat(0xffffff, { roughness: 0.6, vertexColors: true }), 'basket_items'));
  }
  setShadows(g, true, true);
  return g;
}

export function createBasketStack({ count = 6, color = 0xd32f2f } = {}) {
  const g = new THREE.Group();
  g.name = 'BasketStack';
  const standH = 0.72;
  const stand = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) stand.push(boxG(0.035, standH, 0.035, sx * 0.24, standH / 2, sz * 0.17));
  stand.push(boxG(0.56, 0.03, 0.4, 0, standH, 0));
  stand.push(boxG(0.56, 0.02, 0.4, 0, 0.1, 0));
  // back post carrying the sign
  stand.push(boxG(0.03, 1.5, 0.03, -0.24, 0.75, -0.17));
  stand.push(boxG(0.03, 1.5, 0.03, 0.24, 0.75, -0.17));
  g.add(mesh(merge(stand), M.metalDark, 'stand'));

  const body = [], trim = [];
  const step = 0.034;
  for (let i = 0; i < count; i++) {
    const m = new THREE.Matrix4().makeTranslation(0, standH + 0.015 + i * step, 0.02);
    body.push(basketBodyGeo().clone().applyMatrix4(m));
    trim.push(basketTrimGeo(i === count - 1).clone().applyMatrix4(m));
  }
  g.add(mesh(merge(body), basketBodyMat(color), 'stack_body'));
  g.add(mesh(merge(trim), stdMat(color, { roughness: 0.45 }), 'stack_trim'));

  const tex = labelTexture('SEPET', { width: 384, height: 128, bg: BRAND_CSS, fg: '#ffffff', font: 'bold 84px sans-serif', border: '#ffffff' });
  const sign = mesh(new THREE.PlaneGeometry(0.5, 0.17), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 }), 'sign');
  sign.position.set(0, 1.36, -0.15);
  const board = mesh(boxGeo(0.52, 0.19, 0.02), M.metalDark, 'sign_board');
  board.position.set(0, 1.36, -0.17);
  sign.position.z = -0.158;
  g.add(sign, board);
  setShadows(g, true, true);
  sign.castShadow = false;
  return g;
}

// ---------------------------------------------------------------------------
// Person
// ---------------------------------------------------------------------------
const SKIN = [0xf1c9a5, 0xe0ac86, 0xc68a62, 0xa8693f, 0x7a4a2c, 0xf5d5b8];
const HAIR = [0x16110d, 0x2b1b12, 0x4a2f1c, 0x6b4a2a, 0x9a9a98, 0xa0522d, 0xd8b66a];
const SHIRTS = [0x37474f, 0x1565c0, 0xb71c1c, 0xf5f5f5, 0xf9a825, 0x6a1b9a, 0x00838f, 0x8d6e63, 0xef6c00, 0x455a64];
const JACKETS = [0x263238, 0x4e342e, 0x546e7a, 0x37474f];
const PANTS = [0x263238, 0x1a237e, 0x3b3b3b, 0x5d4037, 0x78909c, 0x2d3e5a];
const SCARVES = [0x7b1fa2, 0x00695c, 0xc2185b, 0x37474f, 0xbf360c, 0x283593];
const NAMES = ['AYŞE', 'MEHMET', 'FATMA', 'ÖMER', 'ZEYNEP', 'ÇAĞLA', 'İBRAHİM', 'GÜL', 'HÜSEYİN', 'ŞÜKRÜ'];

const _badgeMats = new Map();
function badgeMat(name) {
  let m = _badgeMats.get(name);
  if (!m) {
    const tex = labelTexture(name, { width: 256, height: 96, bg: '#ffffff', fg: '#1b5e20', font: 'bold 56px sans-serif', border: BRAND_CSS });
    m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 });
    _badgeMats.set(name, m);
  }
  return m;
}
const _badgeGeo = new THREE.PlaneGeometry(0.075, 0.028);

export function createPerson({ seed = 1, outfit = 'casual', pose = 'stand' } = {}) {
  const rng = seededRandom(seed * 7919 + 13);
  const H = 1.6 + rng() * 0.25;
  const w = 0.92 + rng() * 0.2;
  const sc = H / 1.75;
  const skinC = pick(rng, SKIN);
  const hairC = pick(rng, HAIR);
  const styleList = ['short', 'long', 'bun', 'bald', 'scarf', 'short'];
  let style = pick(rng, styleList);
  const isCashier = outfit === 'cashier', isStaff = outfit === 'staff';
  const uniform = isCashier || isStaff;
  const shirtC = isCashier ? 0xf4f6f4 : isStaff ? pick(rng, [0x37474f, 0x263238, 0xeceff1]) : pick(rng, SHIRTS);
  const pantsC = uniform ? pick(rng, [0x1c2735, 0x2b2b2e]) : pick(rng, PANTS);
  const shoeC = uniform ? 0x151515 : pick(rng, [0xf5f5f5, 0x212121, 0x8d6e63, 0xd32f2f]);
  const longSleeve = outfit === 'casual' ? rng() < 0.4 : (isCashier ? rng() < 0.5 : false);
  const jacket = outfit === 'casual' && longSleeve && rng() < 0.5;
  const topC = jacket ? pick(rng, JACKETS) : shirtC;
  const mustache = rng() < 0.3 && style !== 'long' && style !== 'bun' && style !== 'scarf';
  const withCap = isStaff && rng() < 0.5;
  const scarfC = pick(rng, SCARVES);

  const P = { skin: [], hair: [], scarf: [], top: [], pants: [], shoe: [], sole: [], dark: [], green: [] };

  // leg / pose parameters
  const yHip0 = 0.52 * H;
  const ankleH = 0.075;
  const thighL = 0.235 * H;
  const shinL = yHip0 - ankleH - thighL;
  let legs; // per side {a, b, foot}
  let arms; // per side {a, flex}
  let hipY = yHip0;
  if (pose === 'walk') {
    const lead = rng() < 0.5 ? 1 : -1;
    legs = {
      [lead]: { a: 0.42, b: 0.3, foot: -0.22 },
      [-lead]: { a: -0.32, b: -0.87, foot: 0.5 },
    };
    arms = {
      [lead]: { a: -0.38, flex: 0.25 },
      [-lead]: { a: 0.45, flex: 0.55 },
    };
    const reach = (l) => thighL * Math.cos(l.a) + shinL * Math.cos(l.b) + ankleH;
    hipY = Math.max(reach(legs[1]), reach(legs[-1]));
  } else if (pose === 'sit') {
    legs = { 1: { a: 1.42, b: 0.04, foot: 0 }, [-1]: { a: 1.42, b: 0.04, foot: 0 } };
    arms = { 1: { a: 0.32, flex: 1.1, sit: true }, [-1]: { a: 0.32, flex: 1.1, sit: true } };
    hipY = ankleH + shinL * Math.cos(0.04) + thighL * Math.cos(1.42);
  } else {
    legs = { 1: { a: 0, b: 0, foot: 0 }, [-1]: { a: 0, b: 0, foot: 0 } };
    arms = { 1: { a: 0.04, flex: 0.12 }, [-1]: { a: 0.04, flex: 0.12 } };
  }
  const dy = hipY - yHip0; // shift for everything above the hip

  const yShoulder = 0.81 * H + dy;
  const yNeck = 0.85 * H + dy;

  // ---- legs
  const hipX = 0.09 * w;
  const thR = 0.074 * Math.sqrt(w) * sc, shR = 0.052 * Math.sqrt(w) * sc;
  for (const sx of [-1, 1]) {
    const l = legs[sx];
    const hp = [sx * hipX, hipY, 0];
    const kn = [hp[0], hp[1] - thighL * Math.cos(l.a), hp[2] + thighL * Math.sin(l.a)];
    const an = [kn[0], kn[1] - shinL * Math.cos(l.b), kn[2] + shinL * Math.sin(l.b)];
    P.pants.push(capsuleBetween(hp, kn, thR));
    P.pants.push(new THREE.SphereGeometry(shR * 1.08, 8, 6).translate(...kn));
    P.pants.push(capsuleBetween(kn, an, shR));
    // shoe
    const rotX = l.foot !== 0 ? l.foot : -(l.b) * 0.3;
    const mk = (ry, y0) => {
      const s = new THREE.SphereGeometry(1, 10, 7);
      s.scale(0.055 * Math.sqrt(w), ry, 0.125);
      s.translate(0, y0, 0.04);
      s.rotateX(rotX);
      s.translate(...an);
      return s;
    };
    P.shoe.push(mk(0.048, -0.026));
    P.sole.push(mk(0.02, -0.058));
  }
  // pelvis
  P.pants.push(ell(0.158 * w, 0.1, 0.1, 0, hipY - 0.045, 0, 12, 8));

  // ---- torso (lathe)
  const yHipT = hipY;
  const yWaist = 0.6 * H + dy, yChest = 0.72 * H + dy;
  const belly = rng() < 0.3 ? 1.1 : 1.0;
  const tp = [
    [0.001, yHipT - 0.09], [0.15, yHipT - 0.085], [0.168, yHipT - 0.04], [0.178, yHipT + 0.02], [0.162 * belly, yWaist],
    [0.172, yChest - 0.05], [0.188, yChest + 0.015], [0.182, yShoulder - 0.012], [0.12, yShoulder + 0.012], [0.055, yNeck + 0.004],
  ].map(([r, y]) => new THREE.Vector2(r * w, y));
  const torso = new THREE.LatheGeometry(tp, 16);
  torso.scale(1, 1, 0.62);
  P.top.push(torso);

  if (isCashier || isStaff) {
    if (isCashier) {
      // open vest
      const vp = [
        [0.17, yHipT - 0.04], [0.19, yHipT + 0.02], [0.172 * belly, yWaist],
        [0.18, yChest - 0.05], [0.198, yChest + 0.015], [0.19, yShoulder - 0.03],
      ].map(([r, y]) => new THREE.Vector2(r * w * 1.05, y));
      const vest = new THREE.LatheGeometry(vp, 16, 0.38, Math.PI * 2 - 0.76);
      vest.scale(1, 1, 0.62);
      P.green.push(vest);
    } else {
      // apron: wraps the front of the body
      const top = 0.8 * H + dy;
      const bot = (pose === 'sit' ? 0.5 : 0.44) * H + dy + (pose === 'sit' ? 0.12 : 0);
      const len = top - bot;
      const ap = new THREE.CylinderGeometry(0.17 * w, 0.2 * w, len, 16, 1, true, -1.2, 2.4);
      ap.scale(1, 1, 0.68);
      ap.translate(0, (top + bot) / 2, 0);
      P.green.push(ap);
      // neck strap
      P.green.push(boxG(0.03, 0.12, 0.02, 0.07 * w, top + 0.045, 0.06, 0.3, 0, -0.35));
      P.green.push(boxG(0.03, 0.12, 0.02, -0.07 * w, top + 0.045, 0.06, 0.3, 0, 0.35));
    }
  }

  // ---- neck, head
  const hcy = H + dy - 0.115;
  const hcz = 0.012;
  const rx = 0.092 * Math.sqrt(w), ry = 0.115, rz = 0.1;
  P.skin.push(new THREE.CylinderGeometry(0.044, 0.05, 0.1, 10).translate(0, yNeck - 0.02, 0.005));
  P.skin.push(ell(rx, ry, rz, 0, hcy, hcz, 14, 10));
  for (const sx of [-1, 1]) P.skin.push(ell(0.014, 0.026, 0.02, sx * (rx - 0.002), hcy - 0.005, hcz, 6, 5));
  const frontZ = (x, y) => hcz + rz * Math.sqrt(Math.max(0, 1 - (x / rx) ** 2 - (y / ry) ** 2));
  // nose
  P.skin.push(ell(0.013, 0.016, 0.018, 0, hcy - 0.012, frontZ(0, -0.012) + 0.006, 6, 5));
  // eyes & brows & mouth
  for (const sx of [-1, 1]) {
    const ex = sx * 0.036, ey = 0.012;
    P.dark.push(ell(0.0105, 0.0125, 0.008, ex, hcy + ey, frontZ(ex, ey) - 0.001, 8, 6));
    P.hair.push(boxG(0.03, 0.006, 0.006, ex, hcy + ey + 0.026, frontZ(ex, ey + 0.026) + 0.001, -0.15, 0, sx * -0.12));
  }
  P.dark.push(boxG(0.034, 0.005, 0.006, 0, hcy - 0.05, frontZ(0, -0.05) + 0.001));
  if (mustache) P.hair.push(ell(0.032, 0.008, 0.012, 0, hcy - 0.036, frontZ(0, -0.036) + 0.004, 8, 5));

  // hair / head covering
  const hs = 1.07;
  const capTop = (scl, tl) => ell(rx * scl, ry * scl, rz * scl, 0, hcy, hcz - 0.003, 14, 8, 0, Math.PI * 2, 0, tl);
  const capBack = (scl, tl, gap) => ell(rx * scl, ry * scl, rz * scl, 0, hcy, hcz - 0.003, 14, 10, Math.PI / 2 + gap, Math.PI * 2 - 2 * gap, 0, tl);
  if (style === 'bald') {
    P.hair.push(capTop(1.015, 0.95));
    P.hair.push(capBack(1.015, 1.5, 1.2));
  } else if (style === 'scarf') {
    P.scarf.push(capTop(1.1, 1.0));
    P.scarf.push(capBack(1.1, 2.45, 0.95));
    P.scarf.push(ell(rx * 1.05, 0.07, rz * 1.0, 0, yNeck + 0.01, 0, 12, 6));
  } else {
    P.hair.push(capTop(hs, 1.0));
    P.hair.push(capBack(hs, 1.85, 1.15));
    if (style === 'long') P.hair.push(ell(rx * 1.05, 0.2, 0.075, 0, hcy - 0.11, hcz - 0.06, 12, 8));
    if (style === 'bun') {
      P.hair.push(ell(0.05, 0.05, 0.05, 0, hcy + 0.06, hcz - 0.1, 8, 6));
      P.hair.push(capsuleBetween([0, hcy - 0.02, hcz - 0.1], [0, hcy - 0.14, hcz - 0.13], 0.025));
    }
  }
  if (withCap) {
    P.green.push(ell(rx * 1.13, ry * 1.1, rz * 1.12, 0, hcy + 0.012, hcz - 0.004, 14, 7, 0, Math.PI * 2, 0, 1.35));
    P.green.push(ell(0.085, 0.012, 0.085, 0, hcy + 0.04, frontZ(0, 0.04) + 0.05, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2));
  }

  // ---- arms
  const upL = 0.172 * H, foL = 0.148 * H;
  const upR = 0.05 * Math.sqrt(w) * sc, foR = 0.041 * sc;
  const shoulderX = 0.205 * w;
  for (const sx of [-1, 1]) {
    const ar = arms[sx];
    const S = [sx * shoulderX, yShoulder - 0.025, 0];
    const sp = 0.1;
    const dUp = new THREE.Vector3(sx * sp, -Math.cos(ar.a), Math.sin(ar.a)).normalize();
    const E = [S[0] + dUp.x * upL, S[1] + dUp.y * upL, S[2] + dUp.z * upL];
    const b = ar.a + ar.flex;
    const dFo = new THREE.Vector3(ar.sit ? -sx * 0.08 : sx * 0.03, -Math.cos(b), Math.sin(b)).normalize();
    const Wr = [E[0] + dFo.x * foL, E[1] + dFo.y * foL, E[2] + dFo.z * foL];
    const sleeve = longSleeve ? P.top : P.top;
    sleeve.push(new THREE.SphereGeometry(upR * 1.15, 8, 6).translate(...S));
    sleeve.push(capsuleBetween(S, E, upR));
    const fore = longSleeve ? P.top : P.skin;
    fore.push(new THREE.SphereGeometry(foR * 1.15, 8, 6).translate(...E));
    fore.push(capsuleBetween(E, Wr, foR));
    P.skin.push(ell(0.034, 0.046, 0.026, Wr[0] + dFo.x * 0.035, Wr[1] + dFo.y * 0.035, Wr[2] + dFo.z * 0.035, 8, 6));
  }

  // ---- badge
  let badge = null;
  if (uniform) {
    const nm = NAMES[Math.floor(rng() * NAMES.length)];
    badge = mesh(_badgeGeo, badgeMat(nm), 'badge');
    const bx = 0.075 * w, by = yChest + 0.03;
    const R = 0.198 * w * (isCashier ? 1.05 : 1.0);
    const zf = 0.62 * Math.sqrt(Math.max(0, R * R - bx * bx)) + (isStaff ? 0.05 : 0.0);
    badge.position.set(bx, by, zf + 0.004);
    badge.rotation.y = Math.atan2(bx, R) * 0.45;
  }

  // ---- assemble
  const g = new THREE.Group();
  g.name = 'Person';
  const mats = {
    skin: stdMat(skinC, { roughness: 0.7 }),
    hair: stdMat(hairC, { roughness: 0.8 }),
    scarf: stdMat(scarfC, { roughness: 0.85, side: THREE.DoubleSide }),
    top: stdMat(topC, { roughness: 0.85 }),
    pants: stdMat(pantsC, { roughness: 0.85 }),
    shoe: stdMat(shoeC, { roughness: 0.6 }),
    sole: stdMat(0xe9e9e6, { roughness: 0.7 }),
    dark: stdMat(0x1a1411, { roughness: 0.4 }),
    green: stdMat(BRAND, { roughness: 0.7, side: THREE.DoubleSide }),
  };
  for (const k in P) {
    if (!P[k].length) continue;
    g.add(mesh(merge(P[k]), mats[k], 'p_' + k));
  }
  if (badge) g.add(badge);
  setShadows(g, true, true);
  if (badge) badge.castShadow = false;
  g.userData.height = H;
  g.userData.outfit = outfit;
  g.userData.pose = pose;
  return g;
}

// ---------------------------------------------------------------------------
// Small props
// ---------------------------------------------------------------------------
export function createPottedPlant({ seed = 1 } = {}) {
  const rng = seededRandom(seed * 31 + 5);
  const g = new THREE.Group();
  g.name = 'PottedPlant';
  const ph = 0.46;
  // planter: lathe profile
  const pts = [[0.0, 0], [0.2, 0], [0.23, 0.02], [0.27, ph - 0.05], [0.295, ph - 0.015], [0.295, ph], [0.275, ph], [0.27, ph - 0.03], [0.0, ph - 0.03]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  const pot = new THREE.LatheGeometry(pts, 20);
  const potColor = pick(rng, [0xe8e4dc, 0x3b3f44, 0xb5651d]);
  g.add(mesh(pot, new THREE.MeshStandardMaterial({ color: potColor, roughness: 0.55, side: THREE.DoubleSide }), 'planter'));
  g.add(mesh(new THREE.CircleGeometry(0.26, 18).rotateX(-Math.PI / 2).translate(0, ph - 0.035, 0), stdMat(0x3a2a1e, { roughness: 1 }), 'soil'));

  const stems = [], leaves = [];
  // trunk
  const trunk = new THREE.CylinderGeometry(0.016, 0.028, 0.85, 7, 1, true);
  trunk.translate(0, ph - 0.03 + 0.425, 0);
  stems.push(tint(trunk, 0x6d4c33));
  const leafBase = new THREE.SphereGeometry(1, 7, 4);
  const greens = [0x2e6b34, 0x3a7d3f, 0x2a5e30, 0x4a8c45, 0x1f5428];
  const nLeaves = 46;
  for (let i = 0; i < nLeaves; i++) {
    const t = i / (nLeaves - 1);
    const y = ph + 0.25 + t * 0.6 + (rng() - 0.5) * 0.06;
    const yaw = i * 2.399 + rng() * 0.3;
    const pitch = THREE.MathUtils.lerp(0.5, 1.1, t) + (rng() - 0.5) * 0.3;  // upward angle
    const len = THREE.MathUtils.lerp(0.16, 0.12, t) * (0.85 + rng() * 0.3);
    const wid = len * 0.52;
    const lg = leafBase.clone();
    lg.scale(wid, 0.008, len);
    lg.translate(0, 0, len);                    // pivot at stem
    lg.rotateX(-pitch);                        // tilt upwards
    lg.rotateY(yaw);
    lg.translate(0, y, 0);
    leaves.push(tint(lg, pick(rng, greens)));
    // short stem
    const reach = Math.cos(pitch) * len * 0.3;
    stems.push(tint(rodGeo([0, y - 0.005, 0], [Math.sin(yaw) * reach, y + Math.sin(pitch) * len * 0.3, Math.cos(yaw) * reach], 0.005, 4), 0x5d7a3a));
  }
  leafBase.dispose();
  const vcMat = stdMat(0xffffff, { roughness: 0.6, vertexColors: true, side: THREE.DoubleSide });
  g.add(mesh(merge(leaves), vcMat, 'leaves'));
  g.add(mesh(merge(stems), stdMat(0xffffff, { roughness: 0.8, vertexColors: true }), 'stems'));
  setShadows(g, true, true);
  return g;
}

let _recycleTex = null;
function recycleTexture() {
  return canvasTex('recycle', 256, 320, (c, w, h) => {
    c.fillStyle = '#2e7d32'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#ffffff'; c.lineWidth = 8; c.lineJoin = 'round'; c.lineCap = 'round';
    // three chasing arrows around a triangle
    const cx = w / 2, cy = 100, R = 56;
    const pts = [0, 1, 2].map((i) => {
      const a = -Math.PI / 2 + i * (Math.PI * 2 / 3);
      return [cx + Math.cos(a) * R, cy + Math.sin(a) * R];
    });
    for (let i = 0; i < 3; i++) {
      const a = pts[i], b = pts[(i + 1) % 3];
      const sx = a[0] + (b[0] - a[0]) * 0.18, sy = a[1] + (b[1] - a[1]) * 0.18;
      const ex = a[0] + (b[0] - a[0]) * 0.78, ey = a[1] + (b[1] - a[1]) * 0.78;
      c.beginPath(); c.moveTo(sx, sy); c.lineTo(ex, ey); c.stroke();
      const ang = Math.atan2(ey - sy, ex - sx);
      c.beginPath();
      c.moveTo(ex + Math.cos(ang) * 14, ey + Math.sin(ang) * 14);
      c.lineTo(ex + Math.cos(ang + 2.2) * 18, ey + Math.sin(ang + 2.2) * 18);
      c.lineTo(ex + Math.cos(ang - 2.2) * 18, ey + Math.sin(ang - 2.2) * 18);
      c.closePath(); c.fillStyle = '#fff'; c.fill();
    }
    c.fillStyle = '#ffffff'; c.font = 'bold 84px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('ÇÖP', w / 2, 240);
  });
}

export function createTrashBin() {
  const g = new THREE.Group();
  g.name = 'TrashBin';
  const W = 0.42, D = 0.34, Hh = 0.85;
  g.add(mesh(new RoundedBoxGeometry(W, Hh - 0.08, D, 3, 0.03).translate(0, 0.04 + (Hh - 0.08) / 2 + 0.02, 0), stdMat(0x4c5560, { roughness: 0.5 }), 'body'));
  g.add(mesh(boxGeo(W - 0.04, 0.04, D - 0.04).clone().translate(0, 0.02, 0), M.black, 'plinth'));
  g.add(mesh(new RoundedBoxGeometry(W + 0.02, 0.06, D + 0.02, 3, 0.02).translate(0, Hh - 0.03, 0), stdMat(0x2c333a, { roughness: 0.45 }), 'lid'));
  g.add(mesh(new THREE.CircleGeometry(0.1, 20).rotateX(-Math.PI / 2).translate(0, Hh + 0.001, 0.0), M.black, 'opening'));
  g.add(mesh(new THREE.TorusGeometry(0.105, 0.007, 6, 20).rotateX(Math.PI / 2).translate(0, Hh + 0.002, 0), M.metalDark, 'opening_rim'));
  const lab = mesh(new THREE.PlaneGeometry(0.22, 0.28), new THREE.MeshStandardMaterial({ map: recycleTexture(), roughness: 0.5 }), 'label');
  lab.position.set(0, 0.5, D / 2 + 0.0015 + 0.0);
  g.add(lab);
  setShadows(g, true, true);
  lab.castShadow = false;
  return g;
}

function wetSignTexture() {
  return canvasTex('wetsign', 256, 512, (c, w, h) => {
    c.fillStyle = '#fdd835'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#111'; c.lineWidth = 8; c.strokeRect(6, 6, w - 12, h - 12);
    c.fillStyle = '#111'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = 'bold 58px sans-serif'; c.fillText('DİKKAT!', w / 2, 52, w - 30);
    // slipping figure
    c.strokeStyle = '#111'; c.lineWidth = 12; c.lineCap = 'round';
    c.beginPath(); c.moveTo(w * 0.52, 170); c.lineTo(w * 0.45, 245); c.lineTo(w * 0.62, 300); c.lineTo(w * 0.72, 380); c.stroke();
    c.beginPath(); c.moveTo(w * 0.45, 245); c.lineTo(w * 0.28, 310); c.lineTo(w * 0.22, 385); c.stroke();
    c.beginPath(); c.moveTo(w * 0.5, 195); c.lineTo(w * 0.7, 175); c.stroke();
    c.beginPath(); c.moveTo(w * 0.5, 195); c.lineTo(w * 0.32, 180); c.stroke();
    c.beginPath(); c.arc(w * 0.55, 135, 20, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.moveTo(w * 0.1, 400); c.lineTo(w * 0.9, 400); c.stroke();
    c.font = 'bold 40px sans-serif'; c.fillText('KAYGAN', w / 2, 435, w - 30); c.fillText('ZEMİN', w / 2, 480, w - 30);
  });
}

export function createWetFloorSign() {
  const g = new THREE.Group();
  g.name = 'WetFloorSign';
  const ph = 0.62, pw = 0.3, spread = 0.2;
  const ang = Math.atan2(spread, ph);       // panel tilt
  const len = Math.hypot(spread, ph);
  const slabs = [];
  const decals = [];
  const plastic = stdMat(0xfdd835, { roughness: 0.5 });
  const decalMat = new THREE.MeshStandardMaterial({ map: wetSignTexture(), roughness: 0.5 });
  for (const s of [1, -1]) {
    // panel pivots at top (0, ph, 0) and its bottom ends at z = s*spread
    const slab = boxG(pw, len, 0.012, 0, -len / 2, 0);
    slab.rotateX(-s * ang);
    slab.translate(0, ph, 0);
    slabs.push(slab);
    const d = new THREE.PlaneGeometry(pw - 0.02, len - 0.03);
    d.translate(0, -len / 2, 0.0065);
    if (s === -1) d.rotateY(Math.PI);
    d.translate(0, 0, 0);
    // apply same tilt
    const dd = d; dd.rotateX(-s * ang); dd.translate(0, ph, 0);
    decals.push(dd);
  }
  // top hinge cap
  slabs.push(boxG(pw + 0.01, 0.025, 0.04, 0, ph, 0));
  g.add(mesh(merge(slabs), plastic, 'frame'));
  // two decals as separate meshes (front and back share a material)
  const front = mesh(decals[0], decalMat, 'decal_front');
  const back = mesh(decals[1], decalMat, 'decal_back');
  g.add(front, back);
  setShadows(g, true, true);
  front.castShadow = back.castShadow = false;
  g.userData.noCollide = true;
  return g;
}

function atmScreenTexture() {
  return canvasTex('atmscreen', 512, 400, (c, w, h) => {
    const gr = c.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#1b5e20'); gr.addColorStop(1, '#0d3b13');
    c.fillStyle = gr; c.fillRect(0, 0, w, h);
    c.fillStyle = '#ffffff'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = 'bold 40px sans-serif'; c.fillText('Bereket Market', w / 2, 46);
    c.font = '28px sans-serif'; c.fillText('Hoş geldiniz', w / 2, 90);
    c.fillStyle = 'rgba(255,255,255,0.18)'; c.fillRect(20, 120, w - 40, 3);
    const labels = [['Para Çek', 'Para Yatır'], ['Bakiye Sorgula', 'Fatura Öde']];
    labels.forEach((row, r) => row.forEach((t, i) => {
      const x = 24 + i * (w / 2 - 12), y = 150 + r * 90;
      roundRect(c, x, y, w / 2 - 36, 66, 12); c.fillStyle = '#e8f5e9'; c.fill();
      c.fillStyle = '#1b5e20'; c.font = 'bold 28px sans-serif'; c.fillText(t, x + (w / 2 - 36) / 2, y + 34, w / 2 - 56);
    }));
    c.fillStyle = '#c8e6c9'; c.font = '24px sans-serif'; c.fillText('Lütfen kartınızı takınız', w / 2, 350);
  });
}

export function createATM() {
  const g = new THREE.Group();
  g.name = 'ATM';
  const bodyMat = stdMat(0xdde1e4, { roughness: 0.45, metalness: 0.1 });
  const dkMat = stdMat(0x2a2f35, { roughness: 0.5 });
  const zc = -0.04; // body center z
  g.add(mesh(boxGeo(0.64, 0.06, 0.56).clone().translate(0, 0.03, zc), M.black, 'plinth'));
  g.add(mesh(boxGeo(0.7, 1.56, 0.62).clone().translate(0, 0.06 + 0.78, zc), bodyMat, 'body'));
  // green side accents
  const acc = [boxG(0.012, 1.4, 0.5, -0.356, 0.8, zc), boxG(0.012, 1.4, 0.5, 0.356, 0.8, zc)];
  g.add(mesh(merge(acc), M.green, 'accent'));
  // header lightbox
  g.add(mesh(boxGeo(0.7, 0.18, 0.62).clone().translate(0, 1.71, zc), dkMat, 'header'));
  const hTex = labelTexture('ATM', { width: 512, height: 128, bg: BRAND_CSS, fg: '#ffffff', font: 'bold 96px sans-serif' });
  const hMat = new THREE.MeshStandardMaterial({ map: hTex, emissive: 0xffffff, emissiveMap: hTex, emissiveIntensity: 0.9, roughness: 0.4 });
  const head = mesh(new THREE.PlaneGeometry(0.62, 0.14), hMat, 'header_front');
  head.position.set(0, 1.71, zc + 0.311);
  g.add(head);
  const zf = zc + 0.31;  // front face z = 0.27
  // screen module (tilted slightly)
  const scr = new THREE.Group();
  scr.position.set(0, 1.3, zf); scr.rotation.x = -0.1;
  scr.add(mesh(boxGeo(0.54, 0.42, 0.04), dkMat, 'bezel'));
  const sMat = new THREE.MeshStandardMaterial({ map: atmScreenTexture(), emissive: 0xffffff, emissiveMap: atmScreenTexture(), emissiveIntensity: 0.85, roughness: 0.3 });
  const sp = mesh(new THREE.PlaneGeometry(0.44, 0.344), sMat, 'screen'); sp.position.z = 0.0205;
  scr.add(sp);
  const fdk = [];
  for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) fdk.push(boxG(0.03, 0.025, 0.012, sx * 0.248, 1.3 - 0.0 + (i - 1.5) * 0.075 - 1.3, 0.025));
  scr.add(mesh(merge(fdk), M.metalDark, 'fdk'));
  g.add(scr);
  // keypad shelf
  const kp = new THREE.Group();
  kp.position.set(-0.04, 0.98, zf + 0.02); kp.rotation.x = 0.5;
  kp.add(mesh(boxGeo(0.46, 0.03, 0.2), dkMat, 'keypad_plate'));
  const keys = [], fkeys = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) keys.push(boxG(0.045, 0.012, 0.034, -0.15 + c * 0.055, 0.02, -0.075 + r * 0.045));
  for (let r = 0; r < 4; r++) fkeys.push(tint(boxG(0.05, 0.012, 0.034, 0.09, 0.02, -0.075 + r * 0.045), [0xd32f2f, 0xfbc02d, 0x2e7d32, 0x9e9e9e][r]));
  kp.add(mesh(merge(keys), stdMat(0xc5cacf, { roughness: 0.4 }), 'keys'));
  kp.add(mesh(merge(fkeys), stdMat(0xffffff, { roughness: 0.4, vertexColors: true }), 'fkeys'));
  g.add(kp);
  // card reader (right) with LED
  g.add(mesh(boxGeo(0.14, 0.09, 0.03).clone().translate(0.23, 1.02, zf + 0.015), dkMat, 'card_reader'));
  g.add(mesh(boxGeo(0.1, 0.012, 0.012).clone().translate(0.23, 1.02, zf + 0.031), M.black, 'card_slot'));
  g.add(mesh(boxGeo(0.1, 0.006, 0.006).clone().translate(0.23, 1.055, zf + 0.032), stdMat(0x66ff66, { emissive: 0x33ff55, emissiveIntensity: 1.5 }), 'led'));
  // receipt slot
  g.add(mesh(boxGeo(0.1, 0.05, 0.025).clone().translate(0.23, 0.86, zf + 0.012), dkMat, 'receipt'));
  g.add(mesh(boxGeo(0.07, 0.008, 0.008).clone().translate(0.23, 0.86, zf + 0.026), M.black, 'receipt_slot'));
  // cash dispenser
  g.add(mesh(boxGeo(0.36, 0.14, 0.03).clone().translate(0, 0.62, zf + 0.015), dkMat, 'cash_bezel'));
  g.add(mesh(boxGeo(0.28, 0.035, 0.012).clone().translate(0, 0.62, zf + 0.031), M.black, 'cash_slot'));
  setShadows(g, true, true);
  head.castShadow = false; sp.castShadow = false;
  return g;
}

function promoTexture(text, seed) {
  return canvasTex('promo|' + text + '|' + seed, 512, 1024, (c, w, h) => {
    const rng = seededRandom(seed * 13 + 7);
    const gr = c.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#2e7d32'); gr.addColorStop(1, '#1b5e20');
    c.fillStyle = gr; c.fillRect(0, 0, w, h);
    // header
    c.fillStyle = '#fdd835'; c.fillRect(0, 40, w, 190);
    c.fillStyle = '#b71c1c'; c.textAlign = 'center'; c.textBaseline = 'middle';
    const words = text.split(' ');
    let lines = [text];
    if (words.length > 1) {
      const mid = Math.ceil(words.length / 2);
      lines = [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
    }
    c.font = 'bold 66px sans-serif';
    lines.forEach((l, i) => c.fillText(l, w / 2, 135 + (i - (lines.length - 1) / 2) * 76, w - 40));
    // starburst
    const cx = w / 2, cy = 380, R1 = 120, R0 = 92;
    c.beginPath();
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2, r = i % 2 ? R0 : R1;
      c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    c.closePath(); c.fillStyle = '#d32f2f'; c.fill();
    c.fillStyle = '#ffffff'; c.font = 'bold 74px sans-serif';
    c.fillText('%' + (20 + Math.floor(rng() * 6) * 5), cx, cy - 12);
    c.font = 'bold 32px sans-serif'; c.fillText('İNDİRİM', cx, cy + 48);
    // product rows
    const prods = [['ZEYTİNYAĞI 1 L', 219.9], ['TAM BUĞDAY EKMEĞİ', 12.5], ['ÇAY 1000 g', 169.9], ['SÜT 1 L', 34.9], ['YUMURTA 30’LU', 109.9], ['MERCİMEK 1 kg', 74.9], ['TEREYAĞI 500 g', 189.9]];
    for (let i = 0; i < 3; i++) {
      const p = prods.splice(Math.floor(rng() * prods.length), 1)[0];
      const y = 560 + i * 120;
      roundRect(c, 30, y, w - 60, 100, 16); c.fillStyle = '#f1f8e9'; c.fill();
      c.fillStyle = '#1b5e20'; c.textAlign = 'left'; c.font = 'bold 30px sans-serif'; c.fillText(p[0], 50, y + 36, 260);
      c.fillStyle = '#d32f2f'; c.textAlign = 'right'; c.font = 'bold 44px sans-serif';
      c.fillText((p[1] * 0.8).toFixed(2).replace('.', ',') + ' TL', w - 50, y + 62, 200);
      c.fillStyle = '#777'; c.font = '22px sans-serif'; c.fillText(p[1].toFixed(2).replace('.', ',') + ' TL', w - 50, y + 88);
    }
    c.fillStyle = '#ffffff'; c.textAlign = 'center'; c.font = 'bold 46px sans-serif';
    c.fillText('BEREKET MARKET', w / 2, 960);
  });
}

export function createPromoStand({ text = 'HAFTANIN FIRSATLARI', seed = 1 } = {}) {
  const g = new THREE.Group();
  g.name = 'PromoStand';
  const bw = 0.62, bh = 1.7, by = 0.12;
  const frame = [
    boxG(0.7, 0.07, 0.5, 0, 0.035, 0),
    boxG(bw + 0.04, bh + 0.04, 0.05, 0, by + bh / 2, 0),
    boxG(0.06, 0.12, 0.06, 0, 0.1, 0),
  ];
  g.add(mesh(merge(frame), M.metalDark, 'frame'));
  g.add(mesh(boxGeo(0.66, 0.04, 0.4).clone().translate(0, 0.09, 0), M.green, 'base_plate'));
  const mat = new THREE.MeshStandardMaterial({ map: promoTexture(text, seed), roughness: 0.45 });
  const pf = mesh(new THREE.PlaneGeometry(bw, bh), mat, 'panel_front'); pf.position.set(0, by + bh / 2, 0.026);
  const pb = mesh(new THREE.PlaneGeometry(bw, bh), mat, 'panel_back'); pb.position.set(0, by + bh / 2, -0.026); pb.rotation.y = Math.PI;
  g.add(pf, pb);
  setShadows(g, true, true);
  pf.castShadow = pb.castShadow = false;
  return g;
}

// --- pallet displays
const PALLET_KINDS = {
  water: { dims: [0.4, 0.31, 0.267], layers: 4, price: 'DOĞAL KAYNAK SUYU\n6 x 1,5 L\n54,90 TL' },
  cola: { dims: [0.4, 0.3, 0.267], layers: 4, price: 'BEREKET KOLA\n6 x 1 L\n119,90 TL' },
  flour: { dims: [0.4, 0.11, 0.267], layers: 9, price: 'BUĞDAY UNU 5 kg\nÇOK UYGUN!\n89,90 TL' },
};

function packTexture(kind) {
  return canvasTex('pack_' + kind, 256, 160, (c, w, h) => {
    if (kind === 'flour') {
      c.fillStyle = '#e9d9b4'; c.fillRect(0, 0, w, h);
      c.fillStyle = BRAND_CSS; c.fillRect(0, 44, w, 72);
      c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = 'bold 40px sans-serif'; c.fillText('BEREKET UN', w / 2, 80);
      c.fillStyle = '#6b4a1e'; c.font = 'bold 22px sans-serif'; c.fillText('Çok Amaçlı Buğday Unu', w / 2, 24);
      c.fillText('5 kg', w / 2, 138);
      return;
    }
    const water = kind === 'water';
    c.fillStyle = water ? '#cfe6f5' : '#d9cfc8'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 3; i++) {
      const x = 22 + i * 78;
      c.fillStyle = water ? '#7fbce8' : '#4a2a1d';
      roundRect(c, x, 34, 52, 110, 16); c.fill();
      c.fillRect(x + 14, 14, 24, 28);
      c.fillStyle = water ? '#1565c0' : '#c62828'; c.fillRect(x + 12, 6, 28, 12);
      c.fillStyle = '#fff'; c.fillRect(x, 70, 52, 34);
      c.fillStyle = water ? '#1565c0' : '#c62828'; c.fillRect(x, 78, 52, 18);
    }
    c.fillStyle = water ? '#1565c0' : '#c62828'; c.fillRect(0, 0, w, 6); c.fillRect(0, h - 6, w, 6);
  });
}

function packTopTexture(kind) {
  return canvasTex('packtop_' + kind, 128, 96, (c, w, h) => {
    if (kind === 'flour') {
      c.fillStyle = '#efe0bb'; c.fillRect(0, 0, w, h);
      c.fillStyle = BRAND_CSS; c.fillRect(0, h * 0.32, w, h * 0.36);
      c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = 'bold 26px sans-serif';
      c.fillText('BEREKET UN', w / 2, h / 2);
      c.fillStyle = '#6b4a1e'; c.font = 'bold 14px sans-serif'; c.fillText('5 kg', w / 2, h * 0.86);
      return;
    }
    const water = kind === 'water';
    c.fillStyle = water ? '#d7e9f5' : '#d9cfc8'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
      c.beginPath(); c.arc(21 + i * 43, 24 + j * 48, 14, 0, Math.PI * 2);
      c.fillStyle = water ? '#1565c0' : '#c62828'; c.fill();
      c.beginPath(); c.arc(21 + i * 43, 24 + j * 48, 8, 0, Math.PI * 2);
      c.fillStyle = 'rgba(255,255,255,0.35)'; c.fill();
    }
  });
}

export function createPalletDisplay({ seed = 1, kind = 'water' } = {}) {
  const spec = PALLET_KINDS[kind] || PALLET_KINDS.water;
  const rng = seededRandom(seed * 101 + 3);
  const g = new THREE.Group();
  g.name = 'PalletDisplay';
  // EUR pallet 1.2 x 0.8 x 0.144
  const wood = [];
  const bw = 0.145;
  for (const z of [-0.328, 0, 0.328]) wood.push(boxG(1.2, 0.022, bw, 0, 0.011, z));       // bottom boards (run along x)
  for (const z of [-0.328, 0, 0.328]) for (const x of [-0.527, 0, 0.527]) wood.push(boxG(bw, 0.1, bw, x, 0.022 + 0.05, z)); // blocks
  for (let i = 0; i < 5; i++) wood.push(boxG(0.19, 0.022, 0.8, -0.505 + i * 0.2525, 0.144 - 0.011, 0)); // top boards
  g.add(mesh(merge(wood), stdMat(0xc9a36a, { roughness: 0.9 }), 'pallet'));
  const baseY = 0.144;
  const [dx, dy, dz] = spec.dims;
  const side = new THREE.MeshStandardMaterial({ map: packTexture(kind), roughness: kind === 'flour' ? 0.9 : 0.3 });
  const top = new THREE.MeshStandardMaterial({ map: packTopTexture(kind), roughness: kind === 'flour' ? 0.9 : 0.3 });
  const mats = kind === 'flour' ? [stdMat(0xe3d2a8, { roughness: 0.9 }), stdMat(0xe3d2a8, { roughness: 0.9 }), top, top, stdMat(0xe3d2a8, { roughness: 0.9 }), stdMat(0xe3d2a8, { roughness: 0.9 })]
    : [side, side, top, stdMat(0xd0d0d0, { roughness: 0.6 }), side, side];
  const cells = [];
  const fullLayers = spec.layers - 1;
  for (let l = 0; l < spec.layers; l++) {
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      if (l === spec.layers - 1 && rng() < 0.25) continue; // partly consumed top layer
      cells.push([i * dx, baseY + l * dy + dy / 2, j * dz, (rng() - 0.5) * 0.03]);
    }
  }
  const inst = new THREE.InstancedMesh(boxGeo(dx - 0.004, dy - 0.003, dz - 0.004), mats, cells.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);
  cells.forEach((c, i) => {
    q.setFromAxisAngle(_Y, c[3]); p.set(c[0] + (rng() - 0.5) * 0.004, c[1], c[2]);
    m.compose(p, q, s); inst.setMatrixAt(i, m);
  });
  inst.instanceMatrix.needsUpdate = true;
  inst.name = 'cases';
  g.add(inst);
  // shrink wrap around the full layers
  if (kind !== 'flour') {
    const wh = fullLayers * dy + 0.01;
    const wrap = mesh(boxGeo(1.215, wh, 0.815).clone().translate(0, baseY + wh / 2, 0),
      new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.1, roughness: 0.1, depthWrite: false }), 'wrap');
    g.add(wrap);
  }
  // price card on top
  const topY = baseY + spec.layers * dy;
  const card = mesh(new THREE.PlaneGeometry(0.34, 0.2),
    new THREE.MeshStandardMaterial({ map: labelTexture(spec.price, { width: 512, height: 300, bg: '#fff176', fg: '#b71c1c', font: 'bold 62px sans-serif', border: '#b71c1c' }), roughness: 0.5, side: THREE.DoubleSide }), 'price_card');
  card.position.set(0, topY + 0.115, 0.28); card.rotation.x = -0.25;
  const post = mesh(boxGeo(0.01, 0.1, 0.01), M.metalDark, 'card_stick'); post.position.set(0, topY + 0.05, 0.28);
  g.add(card, post);
  setShadows(g, true, true);
  inst.castShadow = false; card.castShadow = false;
  g.userData.kind = kind;
  return g;
}

export function createSecurityGates({ width = 1.4 } = {}) {
  const g = new THREE.Group();
  g.name = 'SecurityGates';
  const ph = 1.5, pd = 0.46, pt = 0.035;
  const acrylic = new THREE.MeshStandardMaterial({ color: 0xbcd6e0, transparent: true, opacity: 0.5, roughness: 0.1, metalness: 0.0, depthWrite: false });
  const base = [], light = [], panels = [];
  for (const sx of [-1, 1]) {
    const x = sx * width / 2;
    panels.push(new RoundedBoxGeometry(pt, ph, pd, 2, 0.012).translate(x, 0.08 + ph / 2, 0));
    base.push(boxG(0.1, 0.06, 0.58, x, 0.03, 0));            // foot
    base.push(boxG(0.06, 0.04, 0.5, x, 0.08, 0));              // lower cap
    base.push(boxG(0.06, 0.05, 0.5, x, 0.08 + ph + 0.02, 0));  // top cap
    // inner antenna loop (thin frame inside the acrylic)
    base.push(boxG(0.006, ph - 0.2, 0.012, x, 0.08 + ph / 2, -pd / 2 + 0.05));
    base.push(boxG(0.006, ph - 0.2, 0.012, x, 0.08 + ph / 2, pd / 2 - 0.05));
    base.push(boxG(0.006, 0.012, pd - 0.1, x, 0.08 + 0.1, 0));
    base.push(boxG(0.006, 0.012, pd - 0.1, x, 0.08 + ph - 0.1, 0));
    // light strip on the inner side
    light.push(boxG(0.014, 0.7, 0.03, x - sx * (pt / 2 + 0.003), 0.08 + ph * 0.55, pd / 2 - 0.035));
  }
  g.add(mesh(merge(base), stdMat(0xaab2b9, { roughness: 0.45, metalness: 0.2 }), 'bases'));
  g.add(mesh(merge(panels), acrylic, 'acrylic'));
  g.add(mesh(merge(light), stdMat(0x66ff88, { emissive: 0x22dd55, emissiveIntensity: 1.6, roughness: 0.4 }), 'light_strips'));
  setShadows(g, true, true);
  g.children[1].castShadow = false;
  g.userData.noCollide = true;
  return g;
}

// ---------------------------------------------------------------------------
// Showcase
// ---------------------------------------------------------------------------
export function showcase() {
  const root = new THREE.Group();
  root.name = 'PropsShowcase';
  const put = (o, x, z, ry = 0) => { o.position.set(x, o.position.y, z); o.rotation.y = ry; root.add(o); return o; };

  // row 1 (z = 0): carts, corral, baskets
  put(createShoppingCart({ color: 0xd32f2f }), -6.0, 0, 0.4);
  put(createShoppingCart({ color: 0x1565c0 }), -5.0, 0, -0.2);
  put(createShoppingCart({ color: 0x2e7d32 }), -4.0, 0, 0.1);
  put(createCartCorral({ count: 6 }), -1.8, 0.4);
  put(createBasket({ color: 0xd32f2f }), 0.4, 0);
  const fb = createBasket({ color: 0x1565c0, filled: true, seed: 4 });
  put(fb, 1.1, 0, 0.3);
  put(createBasketStack({ count: 6 }), 2.4, 0.3);

  // row 2 (z = 3): people
  const people = [
    ['casual', 'stand', 1], ['casual', 'walk', 2], ['cashier', 'sit', 3], ['cashier', 'stand', 4],
    ['staff', 'stand', 5], ['staff', 'walk', 6], ['casual', 'stand', 7],
  ];
  people.forEach(([o, p, s], i) => put(createPerson({ seed: s, outfit: o, pose: p }), -5 + i * 1.1, 3.2, 0.2 * (i % 3 - 1)));

  // row 3 (z = 6.5): small props
  put(createPottedPlant({ seed: 2 }), -6.5, 6.5);
  put(createTrashBin(), -5.4, 6.5);
  put(createWetFloorSign(), -4.5, 6.5, 0.3);
  put(createATM(), -3.4, 6.5);
  put(createPromoStand({ seed: 3 }), -2.2, 6.5);
  put(createPalletDisplay({ kind: 'water', seed: 1 }), -0.5, 6.5);
  put(createPalletDisplay({ kind: 'cola', seed: 2 }), 1.2, 6.5);
  put(createPalletDisplay({ kind: 'flour', seed: 3 }), 2.9, 6.5);
  put(createSecurityGates({ width: 1.4 }), 5.4, 6.5);
  return root;
}
