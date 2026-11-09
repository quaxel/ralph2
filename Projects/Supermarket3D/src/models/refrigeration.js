// Refrigeration: reach-in coolers, open multidecks, chest freezers, deli counter.
// Products are InstancedMesh (one per product type, vertex-colour * instance-colour),
// static structure is merged per material to keep draw calls low.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { seededRandom, pick, stdMat, boxGeo, labelTexture } from './common.js';

/* ------------------------------------------------------------------ */
/* small helpers                                                       */
/* ------------------------------------------------------------------ */
const _v = new THREE.Vector3(), _s = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _c = new THREE.Color(), _m = new THREE.Matrix4();
const WHITE = new THREE.Color(1, 1, 1);

function M4(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q.clone(), new THREE.Vector3(sx, sy, sz));
}
const mulM = (a, b) => new THREE.Matrix4().multiplyMatrices(a, b);

/** Collects static geometry per material and merges it into one mesh per material. */
class Statics {
  constructor() { this.map = new Map(); }
  add(mat, geo, m, own = false) {
    let g = own ? geo : geo.clone();
    if (g.index) g = g.toNonIndexed();
    if (m) g.applyMatrix4(m);
    let arr = this.map.get(mat);
    if (!arr) { arr = []; this.map.set(mat, arr); }
    arr.push(g);
  }
  /** box centred at (x,y,z) */
  box(mat, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) { this.add(mat, boxGeo(w, h, d), M4(x, y, z, rx, ry, rz)); }
  cyl(mat, rt, rb, h, seg, x, y, z, rx = 0, ry = 0, rz = 0) {
    this.add(mat, new THREE.CylinderGeometry(rt, rb, h, seg, 1), M4(x, y, z, rx, ry, rz), true);
  }
  build(parent) {
    for (const [mat, arr] of this.map) {
      const geo = mergeGeometries(arr, false);
      arr.forEach((g) => g.dispose());
      const mesh = new THREE.Mesh(geo, mat);
      if (mat.transparent) { mesh.renderOrder = 2; mesh.castShadow = false; mesh.receiveShadow = false; }
      else { mesh.castShadow = true; mesh.receiveShadow = true; }
      parent.add(mesh);
    }
  }
}

/* ------------------------------------------------------------------ */
/* shared materials                                                    */
/* ------------------------------------------------------------------ */
const MAT = {
  steel: stdMat('#b8bec5', { roughness: 0.32, metalness: 0.85 }),
  darkSteel: stdMat('#33373c', { roughness: 0.4, metalness: 0.75 }),
  black: stdMat('#1b1d20', { roughness: 0.65 }),
  white: stdMat('#eef1f3', { roughness: 0.5 }),
  interior: stdMat('#e9eef1', { roughness: 0.65 }),
  shelf: stdMat('#9aa1a8', { roughness: 0.45, metalness: 0.65 }),
  tile: stdMat('#f3f3ef', { roughness: 0.35 }),
  led: stdMat('#ffffff', { emissive: '#ffffff', emissiveIntensity: 2.2, roughness: 0.5 }),
  warmLed: stdMat('#fff3d6', { emissive: '#ffe9b8', emissiveIntensity: 2.0, roughness: 0.5 }),
  glass: stdMat('#d3ebf2', { transparent: true, opacity: 0.17, roughness: 0.05, metalness: 0.25, depthWrite: false }),
  glassFrost: stdMat('#e6f2f8', { transparent: true, opacity: 0.19, roughness: 0.12, metalness: 0.15, depthWrite: false }),
  priceStrip: stdMat('#ffd21f', { roughness: 0.5 }),
  frost: stdMat('#d9e7ee', { roughness: 0.9 }),
  wood: stdMat('#b98a55', { roughness: 0.7 }),
};

const _signCache = new Map();
/** Emissive sign material with a text texture. */
function signMat(text, w, h, { bg = '#c01f1f', fg = '#ffffff', border = null, glow = 0.65, px = null } = {}) {
  const key = [text, w.toFixed(2), h.toFixed(2), bg, fg, border, glow].join('|');
  let m = _signCache.get(key);
  if (!m) {
    const th = 128, tw = Math.min(2048, Math.round(th * (w / h)));
    const map = labelTexture(text, { width: tw, height: th, bg, fg, border, font: `bold ${px || Math.round(th * 0.62)}px sans-serif` });
    m = new THREE.MeshStandardMaterial({ map, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: glow, roughness: 0.55 });
    _signCache.set(key, m);
  }
  return m;
}
function signPlane(parent, text, w, h, x, y, z, ry, opts) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), signMat(text, w, h, opts));
  mesh.position.set(x, y, z); mesh.rotation.y = ry || 0;
  parent.add(mesh);
  return mesh;
}

/* ------------------------------------------------------------------ */
/* product catalogue (instanced, vertex colour baked * instance colour) */
/* ------------------------------------------------------------------ */
const PMAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.48, metalness: 0.06 });

function part(geo, c, x = 0, y = 0, z = 0, rx = 0, rz = 0) {
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.applyMatrix4(M4(x, y, z, rx, 0, rz));
  const n = g.attributes.position.count;
  const col = Array.isArray(c) ? c : [c, c, c];
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = col[0]; arr[i * 3 + 1] = col[1]; arr[i * 3 + 2] = col[2]; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}
const cylG = (rt, rb, h, seg = 8, open = false) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
const bx = (w, h, d) => boxGeo(w, h, d);
const HP = Math.PI / 2;

const PROD = {};
const DIM = {}; // [w, d, h] footprint & height of one unit
function def(name, parts, dims) {
  PROD[name] = mergeGeometries(parts, false);
  parts.forEach((g) => g.dispose());
  DIM[name] = dims;
}
let _built = false;
function buildCatalogue() {
  if (_built) return; _built = true;
  // drinks
  def('pet', [
    part(cylG(0.04, 0.04, 0.2, 8, true), 1, 0, 0.1, 0),
    part(cylG(0.0425, 0.0425, 0.085, 8, true), 0.55, 0, 0.095, 0),
    part(cylG(0.0428, 0.0428, 0.014, 8, true), 0.9, 0, 0.115, 0),
    part(cylG(0.016, 0.04, 0.05, 8, true), 1, 0, 0.225, 0),
    part(cylG(0.016, 0.016, 0.018, 6, true), 1, 0, 0.259, 0),
    part(cylG(0.018, 0.018, 0.022, 6), 0.28, 0, 0.279, 0),
  ], [0.088, 0.088, 0.29]);
  def('can', [
    part(cylG(0.033, 0.033, 0.115, 8), 1, 0, 0.0575, 0),
    part(cylG(0.03, 0.03, 0.008, 8), 0.75, 0, 0.119, 0),
    part(cylG(0.0336, 0.0336, 0.05, 8, true), 0.55, 0, 0.06, 0),
  ], [0.068, 0.068, 0.123]);
  def('ayran', [
    part(cylG(0.036, 0.029, 0.085, 8), 1, 0, 0.0425, 0),
    part(cylG(0.037, 0.037, 0.01, 8), 0.92, 0, 0.09, 0),
    part(cylG(0.0335, 0.031, 0.045, 8, true), 0.6, 0, 0.04, 0),
  ], [0.076, 0.076, 0.1]);
  def('carton', [
    part(bx(0.07, 0.17, 0.07), 1, 0, 0.085, 0),
    part(bx(0.07, 0.03, 0.035), 0.82, 0, 0.185, 0),
    part(bx(0.0715, 0.07, 0.0715), 0.62, 0, 0.07, 0),
  ], [0.074, 0.074, 0.2]);
  // dairy
  def('yogTub', [
    part(cylG(0.075, 0.062, 0.11, 8), 1, 0, 0.055, 0),
    part(cylG(0.077, 0.077, 0.012, 8), 0.8, 0, 0.116, 0),
    part(cylG(0.069, 0.064, 0.055, 8, true), 0.58, 0, 0.04, 0),
  ], [0.156, 0.156, 0.128]);
  def('cheesePack', [
    part(bx(0.16, 0.03, 0.11), 1, 0, 0.015, 0),
    part(bx(0.1, 0.004, 0.06), 0.55, 0, 0.032, 0),
    part(bx(0.162, 0.012, 0.112), 0.75, 0, 0.012, 0),
  ], [0.166, 0.116, 0.034]);
  def('butter', [
    part(bx(0.1, 0.03, 0.065), 1, 0, 0.015, 0),
    part(bx(0.102, 0.02, 0.067), 0.62, 0, 0.015, 0),
  ], [0.106, 0.07, 0.03]);
  // frozen
  def('frozenBox', [
    part(bx(0.17, 0.24, 0.05), 1, 0, 0.12, 0),
    part(bx(0.172, 0.07, 0.052), 0.55, 0, 0.15, 0),
  ], [0.176, 0.056, 0.24]);
  def('frozenBag', [
    part(bx(0.2, 0.26, 0.05), 1, 0, 0.13, 0),
    part(bx(0.2, 0.02, 0.025), 0.75, 0, 0.255, 0),
    part(bx(0.202, 0.07, 0.052), 0.6, 0, 0.12, 0),
  ], [0.206, 0.056, 0.275]);
  def('iceTub', [
    part(cylG(0.075, 0.065, 0.12, 8), 1, 0, 0.06, 0),
    part(cylG(0.077, 0.077, 0.012, 8), 0.55, 0, 0.126, 0),
    part(cylG(0.07, 0.066, 0.06, 8, true), 0.78, 0, 0.06, 0),
  ], [0.156, 0.156, 0.132]);
  def('pizzaBox', [
    part(bx(0.32, 0.035, 0.32), 1, 0, 0.0175, 0),
    part(cylG(0.11, 0.11, 0.002, 10), 0.62, 0, 0.0356, 0),
  ], [0.326, 0.326, 0.036]);
  // meat trays: white tray, meat, sticker (meat colour baked)
  const tray = (meat) => [
    part(bx(0.2, 0.02, 0.14), 0.94, 0, 0.01, 0),
    part(bx(0.17, 0.018, 0.11), meat, 0, 0.026, 0),
    part(bx(0.05, 0.002, 0.06), 0.97, 0.05, 0.036, 0),
  ];
  def('trayBeef', tray([0.62, 0.09, 0.11]), [0.206, 0.146, 0.038]);
  def('trayChicken', tray([0.93, 0.7, 0.5]), [0.206, 0.146, 0.038]);
  def('trayMince', tray([0.72, 0.17, 0.19]), [0.206, 0.146, 0.038]);
  def('trayLamb', tray([0.48, 0.07, 0.09]), [0.206, 0.146, 0.038]);
  def('sucukPack', [
    part(bx(0.28, 0.012, 0.1), 0.94, 0, 0.006, 0),
    part(cylG(0.022, 0.022, 0.26, 8), [0.42, 0.17, 0.1], 0, 0.034, 0.025, 0, HP),
    part(cylG(0.022, 0.022, 0.26, 8), [0.38, 0.14, 0.09], 0, 0.034, -0.025, 0, HP),
    part(cylG(0.0225, 0.0225, 0.025, 8, true), 0.92, 0.06, 0.034, 0.025, 0, HP),
    part(cylG(0.0225, 0.0225, 0.025, 8, true), 0.92, 0.06, 0.034, -0.025, 0, HP),
  ], [0.29, 0.11, 0.06]);
  // deli
  const jar = (body) => [
    part(cylG(0.045, 0.045, 0.12, 8), body, 0, 0.06, 0),
    part(cylG(0.047, 0.047, 0.016, 8), [0.78, 0.64, 0.2], 0, 0.128, 0),
    part(cylG(0.0455, 0.0455, 0.06, 8, true), [0.9, 0.86, 0.72], 0, 0.06, 0),
  ];
  def('jarGreen', jar([0.33, 0.42, 0.12]), [0.095, 0.095, 0.138]);
  def('jarBlack', jar([0.13, 0.1, 0.09]), [0.095, 0.095, 0.138]);
  def('cheeseBlock', [
    part(bx(0.12, 0.08, 0.2), [0.97, 0.96, 0.87], 0, 0.04, 0),
    part(bx(0.122, 0.006, 0.202), [0.9, 0.86, 0.72], 0, 0.002, 0),
  ], [0.12, 0.2, 0.08]);
  def('kasar', [
    part(cylG(0.14, 0.14, 0.09, 12), [0.98, 0.8, 0.34], 0, 0.045, 0),
    part(cylG(0.1415, 0.1415, 0.014, 12, true), [0.88, 0.58, 0.2], 0, 0.03, 0),
    part(cylG(0.1415, 0.1415, 0.014, 12, true), [0.88, 0.58, 0.2], 0, 0.065, 0),
  ], [0.28, 0.28, 0.09]);
  def('sucukLink', [
    part(cylG(0.03, 0.03, 0.4, 8), [0.4, 0.15, 0.1], 0, 0.03, 0, 0, HP),
    part(cylG(0.0306, 0.0306, 0.012, 8, true), [0.92, 0.86, 0.7], 0.12, 0.03, 0, 0, HP),
    part(cylG(0.0306, 0.0306, 0.012, 8, true), [0.92, 0.86, 0.7], -0.12, 0.03, 0, 0, HP),
  ], [0.4, 0.062, 0.06]);
  def('pastirma', [
    part(bx(0.24, 0.022, 0.08), [0.4, 0.07, 0.06], 0, 0.011, 0),
    part(bx(0.243, 0.008, 0.083), [0.28, 0.2, 0.1], 0, 0.004, 0),
  ], [0.24, 0.08, 0.022]);
  def('meatCut', [
    part(bx(0.14, 0.06, 0.1), [0.72, 0.09, 0.11], 0, 0.03, 0),
    part(bx(0.142, 0.01, 0.102), [0.96, 0.9, 0.85], 0, 0.055, 0),
  ], [0.14, 0.1, 0.06]);
  def('olive', [part(new THREE.SphereGeometry(0.013, 6, 4), 1, 0, 0, 0)], [0.026, 0.026, 0.026]);
  def('heap', [part(new THREE.SphereGeometry(1, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), 1, 0, 0, 0)], [1, 1, 1]);
  def('tag', [
    part(bx(0.06, 0.04, 0.004), 1, 0, 0.02, 0),
    part(bx(0.06, 0.012, 0.0045), [0.85, 0.12, 0.1], 0, 0.034, 0),
  ], [0.06, 0.01, 0.04]);
}

/** Collects instances per product type and builds InstancedMeshes. */
class Pack {
  constructor() { this.items = new Map(); }
  add(type, parent, x, y, z, ry, sx, sy, sz, color, rx = 0, rz = 0) {
    let it = this.items.get(type);
    if (!it) { it = { m: [], c: [] }; this.items.set(type, it); }
    const local = M4(x, y, z, rx, ry, rz, sx, sy, sz);
    it.m.push(parent ? mulM(parent, local) : local);
    it.c.push(color ? color.clone() : WHITE.clone());
  }
  build(parent) {
    for (const [type, it] of this.items) {
      const mesh = new THREE.InstancedMesh(PROD[type], PMAT, it.m.length);
      for (let i = 0; i < it.m.length; i++) { mesh.setMatrixAt(i, it.m[i]); mesh.setColorAt(i, it.c[i]); }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.castShadow = false; mesh.receiveShadow = true;
      mesh.name = 'products_' + type;
      parent.add(mesh);
    }
  }
}

/** Fill a rectangular lane with a grid of one product. Local frame = parent matrix P. */
function fillLane(pack, rng, P, o) {
  const dim = DIM[o.type];
  const s = o.s || [1, 1, 1];
  const w = dim[0] * s[0] * (o.gapX || 1.03), d = dim[1] * s[2] * (o.gapZ || 1.03), h = dim[2] * s[1];
  const cols = Math.max(1, Math.floor((o.x1 - o.x0 + 1e-6) / w));
  const rows = Math.max(1, Math.min(o.rows || 3, Math.floor((o.zFront - o.zBack + 1e-6) / d)));
  const stack = o.stack || 1;
  const wx = o.noStretch ? w : Math.max(w, (o.x1 - o.x0) / cols);   // spread columns across the lane
  const xs = (o.x0 + o.x1) / 2 - (cols * wx) / 2 + wx / 2;
  const base = new THREE.Color(o.color);
  for (let r = 0; r < rows; r++) {
    const z = o.zFront - d / 2 - r * d;
    for (let c = 0; c < cols; c++) {
      if (r > 0 && rng() < 0.05) continue;
      _c.copy(base).multiplyScalar(0.9 + 0.2 * rng());
      for (let k = 0; k < stack; k++) {
        pack.add(o.type, P, xs + c * wx + (rng() - 0.5) * 0.004, (o.y || 0) + k * h, z + (rng() - 0.5) * 0.004,
          (rng() - 0.5) * (o.jit === undefined ? 0.1 : o.jit), s[0], s[1], s[2], _c);
      }
    }
  }
}

const TAGCOLS = ['#ffffff', '#ffd23a', '#ffffff', '#ffe27a'].map((c) => new THREE.Color(c));
/** Stock one shelf (frame P, local z from 0 = back to dep = front) with several lanes. */
function stockShelf(pack, rng, P, level, o) {
  const n = level.n[Math.floor(rng() * level.n.length)];
  const lw = (o.x1 - o.x0) / n;
  let prev = null;
  for (let i = 0; i < n; i++) {
    let sku = pick(rng, level.skus);
    if (sku === prev && level.skus.length > 1) sku = pick(rng, level.skus);
    prev = sku;
    const col = new THREE.Color(pick(rng, sku.pal));
    if (o.tint) col.lerp(WHITE, o.tint);
    const x0 = o.x0 + i * lw + 0.008, x1 = o.x0 + (i + 1) * lw - 0.008;
    fillLane(pack, rng, P, { type: sku.t, s: sku.s, stack: sku.stack, rows: sku.rows || o.rows || 3, x0, x1, zFront: o.zFront, zBack: o.zBack, y: o.y || 0, color: col, jit: sku.jit });
    pack.add('tag', P, (x0 + x1) / 2, o.tagY, o.zTag, 0, 1, 1, 1, pick(rng, TAGCOLS));
  }
}

/* SKU tables ------------------------------------------------------- */
const PETS = ['#4b2a1c', '#f08a1c', '#9ad24b', '#cfe8f3', '#b71f2b', '#f3b24a', '#c98a30', '#7a3fa0'];
const CANS = ['#c9202c', '#1f5fb0', '#cfd4d9', '#2f9a52', '#f0c52c', '#2b2b2f', '#f27c1d'];
const WATERS = ['#cfe8f3', '#bfe0ee', '#d9eef5'];
const DAIRYW = ['#f6f4ee', '#8dbbe8', '#f2d06a', '#93d08a', '#f0929f', '#f6f4ee'];
const DRINK_LEVELS = [
  { n: [2, 3], skus: [{ t: 'pet', s: [1, 1, 1], pal: PETS, rows: 3 }] },
  { n: [3], skus: [{ t: 'pet', s: [0.88, 0.8, 0.88], pal: PETS, rows: 3 }, { t: 'pet', s: [0.85, 0.85, 0.85], pal: WATERS, rows: 3 }] },
  { n: [4], skus: [{ t: 'can', s: [1, 1, 1], stack: 2, pal: CANS, rows: 4 }] },
  { n: [3], skus: [{ t: 'ayran', s: [1.1, 1.2, 1.1], pal: DAIRYW, rows: 3 }, { t: 'carton', s: [1, 1, 1], pal: ['#f08c1a', '#d12f2f', '#f2c230', '#7ab648'], rows: 3 }] },
  { n: [3, 4], skus: [{ t: 'pet', s: [0.7, 0.75, 0.7], pal: WATERS.concat(['#9ad24b', '#f08a1c']), rows: 3 }, { t: 'can', s: [1, 1, 1], stack: 2, pal: CANS, rows: 4 }] },
];
const DAIRY_LEVELS = [
  { n: [2, 3], skus: [{ t: 'yogTub', s: [1.15, 1.15, 1.15], pal: DAIRYW.concat(['#f2dfae']), rows: 3 }] },
  { n: [3], skus: [{ t: 'carton', s: [1.05, 1.05, 1.05], pal: DAIRYW, rows: 3 }, { t: 'pet', s: [0.78, 0.72, 0.78], pal: ['#f4f4f0', '#e4eef8'], rows: 3 }] },
  { n: [3], skus: [{ t: 'yogTub', s: [0.8, 0.85, 0.8], pal: ['#f6f4ee', '#e9748c', '#f2c14e', '#6cbf6a', '#6aa6e0'], rows: 4 }, { t: 'ayran', s: [1, 1, 1], pal: DAIRYW, rows: 3 }] },
  { n: [3, 4], skus: [{ t: 'cheesePack', s: [1, 1, 1], stack: 4, pal: ['#f6f2e2', '#f0d27a', '#e9e1c8', '#c8e0c0', '#f4c868'], rows: 4 }] },
  { n: [3, 4], skus: [{ t: 'butter', s: [1, 1, 1], stack: 5, pal: ['#f2d36b', '#f6e08a', '#e8e2c8'], rows: 4 }, { t: 'cheesePack', s: [1, 1, 1], stack: 4, pal: ['#f6f2e2', '#d9b25a'], rows: 4 }] },
];
const FROZEN_LEVELS = [
  { n: [2, 3], skus: [{ t: 'pizzaBox', s: [0.9, 1, 0.9], stack: 3, pal: ['#e8b04a', '#c9482c', '#4d8f3a', '#d86a3a'], rows: 2 }] },
  { n: [3], skus: [{ t: 'iceTub', s: [1, 1, 1], pal: ['#e83a5a', '#f3d36a', '#6a4a2c', '#4cb5d9', '#8bd16a'], rows: 3 }] },
  { n: [3, 4], skus: [{ t: 'frozenBox', s: [1, 1, 1], pal: ['#3f87c9', '#e6a23c', '#6fb84a', '#c9482c'], rows: 5 }] },
  { n: [3], skus: [{ t: 'frozenBag', s: [1, 1, 1], pal: ['#3aa05a', '#e9c13a', '#d8603a', '#5aa6d9'], rows: 5 }] },
  { n: [3, 4], skus: [{ t: 'frozenBox', s: [0.9, 0.85, 0.9], pal: ['#c9482c', '#3f87c9', '#f0c040'], rows: 5 }, { t: 'iceTub', s: [0.8, 0.8, 0.8], pal: ['#e83a5a', '#4cb5d9', '#f3d36a'], rows: 3 }] },
];
const COOLERS = {
  drinks: { sign: 'İÇECEKLER', color: '#0b57a4', levels: DRINK_LEVELS, glass: MAT.glass, tint: 0 },
  dairy: { sign: 'SÜT ÜRÜNLERİ', color: '#1c7a4a', levels: DAIRY_LEVELS, glass: MAT.glass, tint: 0 },
  frozen: { sign: 'DONUK GIDA', color: '#12599b', levels: FROZEN_LEVELS, glass: MAT.glassFrost, tint: 0.08 },
};

/* ------------------------------------------------------------------ */
/* 1. reach-in cooler bank                                             */
/* ------------------------------------------------------------------ */
export function createReachInCooler({ doors = 4, height = 2.2, depth = 0.85, category = 'drinks', seed = 1 } = {}) {
  buildCatalogue();
  const cat = COOLERS[category] || COOLERS.drinks;
  const rng = seededRandom(seed * 7919 + 11);
  const g = new THREE.Group(); g.name = 'ReachInCooler_' + category;
  const S = new Statics(), pack = new Pack();

  const DW = 0.78, FR = 0.05;
  const W = doors * DW + 2 * FR, hx = W / 2, hz = depth / 2;
  const kick = 0.18, header = 0.3;
  const y0 = kick + 0.03, y1 = height - header;     // door opening bottom/top
  const ym = (y0 + y1) / 2, hOpen = y1 - y0;
  const zD = hz - 0.035;                            // door plane

  // kick plate + vent grill
  S.box(MAT.black, W - 0.1, kick, depth - 0.06, 0, kick / 2, -0.03);
  for (let i = 0; i < 6; i++) S.box(MAT.steel, W - 0.4, 0.012, 0.012, 0, 0.035 + i * 0.023, hz - 0.06 + 0.005);
  S.box(MAT.steel, W - 0.1, 0.035, 0.05, 0, y0 - 0.0175, hz - 0.05);
  // side panels (full height), header block
  for (const sx of [-1, 1]) S.box(MAT.steel, 0.05, height, depth, sx * (hx - 0.025), height / 2, 0);
  S.box(MAT.darkSteel, W - 0.1, header, depth, 0, height - header / 2, 0);
  S.box(MAT.steel, W - 0.1, 0.012, 0.02, 0, y1 + 0.006, hz - 0.01);
  // cabinet interior shell
  S.box(MAT.interior, W - 0.1, hOpen + 0.03, 0.02, 0, ym - 0.015 + 0.015, -hz + 0.01);   // back
  S.box(MAT.interior, W - 0.1, 0.03, depth - 0.06, 0, y0 - 0.015, -0.03);               // floor
  S.box(MAT.interior, W - 0.1, 0.03, depth - 0.02, 0, y1 - 0.015, 0);                    // ceiling
  for (const sx of [-1, 1]) S.box(MAT.interior, 0.012, hOpen, depth - 0.04, sx * (hx - 0.056), ym, -0.01);
  // ceiling LED + mullion LEDs
  S.box(MAT.led, W - 0.2, 0.01, 0.03, 0, y1 - 0.035, zD - 0.07);
  // mullions, door frames, glass, handles
  const glassMat = cat.glass;
  for (let k = 0; k <= doors; k++) {
    const xk = -hx + FR + k * DW;
    if (k > 0 && k < doors) S.box(MAT.darkSteel, 0.04, hOpen, 0.05, xk, ym, zD);
    S.box(MAT.led, 0.012, hOpen - 0.12, 0.012, xk, ym, zD - 0.04);
  }
  for (let k = 0; k < doors; k++) {
    const xc = -hx + FR + (k + 0.5) * DW;
    S.box(MAT.darkSteel, DW - 0.03, 0.035, 0.045, xc, y1 - 0.0175, zD + 0.003);
    S.box(MAT.darkSteel, DW - 0.03, 0.035, 0.045, xc, y0 + 0.0175, zD + 0.003);
    for (const sx of [-1, 1]) S.box(MAT.darkSteel, 0.03, hOpen, 0.045, xc + sx * (DW / 2 - 0.02), ym, zD + 0.003);
    S.box(glassMat, DW - 0.04, hOpen - 0.06, 0.008, xc, ym, zD + 0.005);
    // vertical handle
    const hxp = xc + DW / 2 - 0.065;
    S.box(MAT.steel, 0.024, 0.74, 0.024, hxp, ym, zD + 0.058);
    S.box(MAT.steel, 0.018, 0.018, 0.04, hxp, ym + 0.32, zD + 0.035);
    S.box(MAT.steel, 0.018, 0.018, 0.04, hxp, ym - 0.32, zD + 0.035);
  }

  // shelves + products
  const lvl = 5;
  const sBase = y0 + 0.03, sp = (y1 - 0.03 - sBase) / lvl;
  const zBack = -hz + 0.025, zFront = zD - 0.03, ds = zFront - zBack;
  for (let k = 0; k < doors; k++) {
    const xc = -hx + FR + (k + 0.5) * DW;
    for (let i = 0; i < lvl; i++) {
      const sy = sBase + i * sp;
      S.box(MAT.shelf, DW - 0.05, 0.012, ds - 0.02, xc, sy - 0.006, zBack + ds / 2);
      S.box(MAT.white, DW - 0.05, 0.026, 0.01, xc, sy + 0.013, zFront - 0.005);
      const P = M4(xc, sy, zBack);
      stockShelf(pack, rng, P, cat.levels[i], {
        x0: -(DW / 2 - 0.045), x1: DW / 2 - 0.045, zFront: ds - 0.022, zBack: 0.02, y: 0.0,
        zTag: ds - 0.002 + 0.004, tagY: 0.002, tint: cat.tint, rows: 3,
      });
    }
  }
  S.build(g); pack.build(g);

  // header sign
  signPlane(g, cat.sign, W - 0.12, header - 0.06, 0, height - header / 2, hz + 0.002, 0, { bg: cat.color, fg: '#ffffff', border: '#ffffff', glow: 0.8 });
  return g;
}

/* ------------------------------------------------------------------ */
/* 2. open multideck                                                   */
/* ------------------------------------------------------------------ */
const MD_DAIRY = [
  { n: [2, 3, 3], skus: [{ t: 'yogTub', s: [1.1, 1.1, 1.1], pal: DAIRYW, rows: 4 }, { t: 'ayran', s: [1.1, 1.2, 1.1], pal: DAIRYW, rows: 4 }] },
  { n: [4, 5], skus: [{ t: 'carton', s: [1.0, 1.0, 1.0], pal: DAIRYW, rows: 4 }, { t: 'pet', s: [0.75, 0.72, 0.75], pal: ['#f4f4f0', '#e4eef8'], rows: 4 }] },
  { n: [5, 6], skus: [{ t: 'yogTub', s: [0.62, 0.7, 0.62], pal: ['#f6f4ee', '#e9a3b4', '#f4e0a0', '#a9d3a0', '#b9d6ee'], rows: 5 }, { t: 'ayran', s: [1, 1, 1], pal: DAIRYW, rows: 5 }] },
  { n: [5, 6], skus: [{ t: 'cheesePack', s: [1, 1, 1], stack: 4, pal: ['#f6f2e2', '#f0d27a', '#e9e1c8', '#c8e0c0', '#f4c868'], rows: 4 }, { t: 'butter', s: [1, 1, 1], stack: 5, pal: ['#f2d36b', '#f6e08a'], rows: 4 }] },
];
const MD_MEAT = [
  { n: [4, 5], skus: [{ t: 'trayBeef', stack: 2, pal: ['#fbf3ee', '#f3f6f4'], rows: 4 }, { t: 'trayMince', stack: 2, pal: ['#fbf3ee', '#f3f6f4'], rows: 4 }, { t: 'trayLamb', stack: 2, pal: ['#fbf3ee'], rows: 4 }] },
  { n: [4, 5], skus: [{ t: 'trayChicken', stack: 2, pal: ['#fbf3ee', '#f3f6f4'], rows: 4 }, { t: 'trayMince', stack: 2, pal: ['#fbf3ee'], rows: 4 }] },
  { n: [5, 6], skus: [{ t: 'trayBeef', stack: 1, pal: ['#fbf3ee', '#f3f6f4'], rows: 4 }, { t: 'trayChicken', stack: 1, pal: ['#fbf3ee'], rows: 4 }, { t: 'trayLamb', stack: 1, pal: ['#fbf3ee'], rows: 4 }] },
  { n: [4, 5], skus: [{ t: 'sucukPack', stack: 3, pal: ['#fff4ea', '#f4e8dc', '#ffffff'], rows: 4, s: [1, 1, 1] }] },
];
const MD_DELI = [
  { n: [4, 5], skus: [{ t: 'yogTub', s: [0.95, 0.95, 0.95], pal: ['#f4f4ef', '#fdf3d0', '#f0f6ec'], rows: 4 }, { t: 'jarGreen', s: [1.1, 1.1, 1.1], pal: ['#ffffff', '#e8f0d0'], rows: 4 }] },
  { n: [5, 6], skus: [{ t: 'jarGreen', s: [1, 1, 1], pal: ['#ffffff', '#f0f4dc'], rows: 4 }, { t: 'jarBlack', s: [1, 1, 1], pal: ['#ffffff', '#e8e4e0'], rows: 4 }] },
  { n: [4, 5], skus: [{ t: 'cheesePack', stack: 4, pal: ['#f6f2e2', '#f0d27a', '#e9e1c8', '#f4c868', '#d4a24e'], rows: 4 }] },
  { n: [4, 5], skus: [{ t: 'cheesePack', stack: 4, pal: ['#f6f2e2', '#f0d27a', '#e8c070'], rows: 4 }, { t: 'butter', stack: 5, pal: ['#f2d36b', '#f6e08a'], rows: 4 }] },
];
const MULTIDECKS = {
  dairy: { sign: 'SÜT ÜRÜNLERİ', color: '#1c6fb3', levels: MD_DAIRY },
  meat: { sign: 'ET & TAVUK', color: '#b3262b', levels: MD_MEAT },
  deli: { sign: 'PEYNİR & ZEYTİN', color: '#2e7d3a', levels: MD_DELI },
};

function endProfile(D, H) {
  const s = new THREE.Shape();
  s.moveTo(-D / 2, 0); s.lineTo(D / 2, 0); s.lineTo(D / 2, 0.84); s.lineTo(D / 2 - 0.12, 0.9);
  s.lineTo(D / 2 - 0.12, H - 0.26); s.lineTo(D / 2 - 0.08, H - 0.26); s.lineTo(D / 2 - 0.08, H); s.lineTo(-D / 2, H);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: false });
  geo.translate(0, 0, -0.025);
  geo.applyMatrix4(M4(0, 0, 0, 0, -HP, 0));
  return geo;
}

export function createOpenMultideck({ length = 2.5, height = 2.0, depth = 0.95, category = 'dairy', seed = 1 } = {}) {
  buildCatalogue();
  const cat = MULTIDECKS[category] || MULTIDECKS.dairy;
  const rng = seededRandom(seed * 104729 + 5);
  const g = new THREE.Group(); g.name = 'OpenMultideck_' + category;
  const S = new Statics(), pack = new Pack();
  const L = length, H = height, D = depth;
  const accent = stdMat(cat.color, { roughness: 0.45 });
  const canopyH = 0.24, canopyBot = H - canopyH;

  // end panels
  const prof = endProfile(D, H);
  for (const sx of [-1, 1]) S.add(MAT.white, prof, M4(sx * (L / 2 - 0.025), 0, 0), false);
  prof.dispose();
  for (const sx of [-1, 1]) S.box(accent, 0.006, 0.34, D * 0.62, sx * (L / 2 + 0.002), 0.45, -0.1);
  // plinth + base body
  S.box(MAT.black, L - 0.1, 0.1, D - 0.1, 0, 0.05, 0);
  S.box(MAT.white, L - 0.1, 0.68, D, 0, 0.44, 0);
  S.box(accent, L - 0.1, 0.3, 0.006, 0, 0.32, D / 2 + 0.002);
  S.box(MAT.white, L - 0.1, 0.012, 0.008, 0, 0.5, D / 2 + 0.004);
  S.box(MAT.steel, L - 0.1, 0.05, 0.14, 0, 0.805, D / 2 - 0.07);
  S.cyl(MAT.steel, 0.022, 0.022, L - 0.1, 10, 0, 0.84, D / 2 - 0.03, 0, 0, HP);
  // air curtain grill
  S.box(MAT.black, L - 0.3, 0.1, 0.008, 0, 0.62, D / 2 + 0.003);
  for (let i = 0; i < 5; i++) S.box(MAT.darkSteel, L - 0.34, 0.006, 0.01, 0, 0.585 + i * 0.02, D / 2 + 0.006);
  // back panel + uprights
  S.box(MAT.interior, L - 0.1, canopyBot - 0.78, 0.03, 0, (canopyBot + 0.78) / 2, -D / 2 + 0.015);
  const nUp = Math.round(L / 0.45);
  for (let i = 0; i <= nUp; i++) {
    const x = -(L / 2 - 0.1) + (i * (L - 0.2)) / nUp;
    S.box(MAT.darkSteel, 0.022, canopyBot - 0.8, 0.02, x, (canopyBot + 0.8) / 2, -D / 2 + 0.04);
  }
  // canopy with sign + lighting
  S.box(MAT.darkSteel, L - 0.1, canopyH, D - 0.1, 0, H - canopyH / 2, -0.05);
  S.box(MAT.steel, L - 0.1, 0.02, D - 0.08, 0, H + 0.0, -0.05);
  S.box(MAT.led, L - 0.24, 0.012, 0.05, 0, canopyBot - 0.005, D / 2 - 0.2);
  S.box(MAT.led, L - 0.24, 0.012, 0.05, 0, canopyBot - 0.005, -0.05);

  // shelves
  const levelY = [0.8, 1.05, 1.3, 1.545];
  const depths = [0.76, 0.64, 0.57, 0.5];
  const tilts = [0.05, 0.11, 0.11, 0.11];
  const zBack = -D / 2 + 0.05;
  levelY.forEach((ly, i) => {
    const P = M4(0, ly, zBack, tilts[i], 0, 0);
    const dep = depths[i];
    S.add(MAT.shelf, boxGeo(L - 0.14, 0.016, dep), mulM(P, M4(0, -0.008, dep / 2)));
    S.add(MAT.priceStrip, boxGeo(L - 0.14, 0.036, 0.012), mulM(P, M4(0, 0.012, dep + 0.004)));
    stockShelf(pack, rng, P, cat.levels[i], {
      x0: -(L / 2 - 0.1), x1: L / 2 - 0.1, zFront: dep - 0.02, zBack: 0.02, y: 0, zTag: dep + 0.012, tagY: 0.002, rows: 4,
    });
  });
  S.build(g); pack.build(g);

  const sw = L - 0.4;
  signPlane(g, cat.sign, sw, Math.min(0.2, sw / 8), 0, H - canopyH / 2, D / 2 - 0.1 + 0.003, 0, { bg: cat.color, border: '#ffffff', glow: 0.8 });
  return g;
}

/* ------------------------------------------------------------------ */
/* 3. chest freezer                                                    */
/* ------------------------------------------------------------------ */
export function createChestFreezer({ length = 2.4, width = 0.95, height = 0.9, category = 'icecream', seed = 1 } = {}) {
  buildCatalogue();
  const rng = seededRandom(seed * 31337 + 3);
  const g = new THREE.Group(); g.name = 'ChestFreezer_' + category;
  const S = new Statics(), pack = new Pack();
  const L = length, Wd = width, H = height;
  const wallTop = H - 0.08, floorY = 0.12;
  const brand = stdMat('#0e5aa7', { roughness: 0.45 });

  S.box(MAT.black, L - 0.12, 0.08, Wd - 0.12, 0, 0.04, 0);
  // hollow cabinet
  for (const sz of [-1, 1]) S.box(MAT.white, L, wallTop - 0.08, 0.08, 0, (wallTop + 0.08) / 2, sz * (Wd / 2 - 0.04));
  for (const sx of [-1, 1]) S.box(MAT.white, 0.08, wallTop - 0.08, Wd - 0.16, sx * (L / 2 - 0.04), (wallTop + 0.08) / 2, 0);
  S.box(MAT.interior, L - 0.16, floorY - 0.08, Wd - 0.16, 0, (floorY + 0.08) / 2, 0);
  for (const sz of [-1, 1]) S.box(MAT.interior, L - 0.16, wallTop - floorY, 0.012, 0, (wallTop + floorY) / 2, sz * (Wd / 2 - 0.086));
  for (const sx of [-1, 1]) S.box(MAT.interior, 0.012, wallTop - floorY, Wd - 0.18, sx * (L / 2 - 0.086), (wallTop + floorY) / 2, 0);
  // stainless rim / glass tracks
  const rimY = wallTop + 0.02;
  for (const sz of [-1, 1]) S.box(MAT.steel, L, 0.04, 0.095, 0, rimY, sz * (Wd / 2 - 0.0475));
  for (const sx of [-1, 1]) S.box(MAT.steel, 0.095, 0.04, Wd, sx * (L / 2 - 0.0475), rimY, 0);
  for (const sz of [-1, 1]) S.box(MAT.darkSteel, L - 0.2, 0.012, 0.014, 0, rimY + 0.026, sz * (Wd / 2 - 0.1));
  // LEDs
  for (const sz of [-1, 1]) S.box(MAT.led, L - 0.4, 0.014, 0.014, 0, wallTop - 0.04, sz * (Wd / 2 - 0.1));
  // sliding glass lids (two layers, overlap in the middle)
  const pl = L / 2 + 0.1, pw = Wd - 0.19;
  const lids = [[-L / 2 + 0.05 + pl / 2, rimY + 0.03], [L / 2 - 0.05 - pl / 2, rimY + 0.047]];
  for (const [cx, cy] of lids) {
    S.box(MAT.glass, pl - 0.04, 0.006, pw - 0.04, cx, cy, 0);
    S.box(MAT.steel, pl, 0.014, 0.03, cx, cy, pw / 2);
    S.box(MAT.steel, pl, 0.014, 0.03, cx, cy, -pw / 2);
    for (const sx of [-1, 1]) S.box(MAT.steel, 0.03, 0.014, pw, cx + sx * (pl / 2 - 0.015), cy, 0);
  }
  S.box(MAT.black, 0.1, 0.016, 0.03, lids[0][0] + pl / 2 - 0.1, lids[0][1] + 0.004, 0);
  S.box(MAT.black, 0.1, 0.016, 0.03, lids[1][0] - pl / 2 + 0.1, lids[1][1] + 0.004, 0);
  // side trim bands
  for (const sz of [-1, 1]) {
    S.box(MAT.steel, L, 0.015, 0.006, 0, 0.62, sz * (Wd / 2 + 0.002));
    S.box(MAT.steel, L, 0.015, 0.006, 0, 0.28, sz * (Wd / 2 + 0.002));
  }
  for (const sx of [-1, 1]) {
    S.box(MAT.steel, 0.006, 0.015, Wd, sx * (L / 2 + 0.002), 0.62, 0);
    S.box(MAT.steel, 0.006, 0.015, Wd, sx * (L / 2 + 0.002), 0.28, 0);
  }

  // compartments with products
  const iw = L - 0.2, id = Wd - 0.2;
  const nx = Math.max(2, Math.round(iw / 0.56)), nz = 2;
  const cw = iw / nx, cd = id / nz;
  const top = wallTop - 0.02;
  const mixes = category === 'frozen'
    ? ['pizzaBox', 'frozenBag', 'frozenBox', 'frozenBag', 'pizzaBox', 'frozenBox']
    : ['iceTub', 'frozenBox', 'iceTub', 'iceTub', 'frozenBox', 'iceTub'];
  const pals = {
    iceTub: ['#e83a5a', '#f3d36a', '#6a4a2c', '#4cb5d9', '#8bd16a', '#f08a1c', '#a56ad0'],
    frozenBox: ['#3f87c9', '#e6a23c', '#6fb84a', '#c9482c', '#e8567a'],
    frozenBag: ['#3aa05a', '#e9c13a', '#d8603a', '#5aa6d9'],
    pizzaBox: ['#e8b04a', '#c9482c', '#4d8f3a', '#d86a3a'],
  };
  for (let ix = 0; ix < nx; ix++) {
    for (let iz = 0; iz < nz; iz++) {
      const type = mixes[(ix * 2 + iz + Math.floor(rng() * 3)) % mixes.length];
      const dim = DIM[type];
      const stack = type === 'pizzaBox' ? 3 : 1;
      const sy = type === 'frozenBox' ? 0.8 : 1;
      const itemH = dim[2] * sy * stack;
      const pileTop = top - itemH;
      const cx = -iw / 2 + (ix + 0.5) * cw, cz = -id / 2 + (iz + 0.5) * cd;
      S.box(MAT.frost, cw - 0.03, pileTop - floorY, cd - 0.03, cx, (pileTop + floorY) / 2, cz);
      const P = M4(cx, pileTop, cz);
      const col = new THREE.Color(pick(rng, pals[type])).lerp(WHITE, 0.0);
      fillLane(pack, rng, P, {
        type, s: [1, sy, 1], stack, rows: type === 'iceTub' ? 3 : 8, x0: -cw / 2 + 0.025, x1: cw / 2 - 0.025, zFront: cd / 2 - 0.025, zBack: -cd / 2 + 0.025, y: 0,
        color: col, gapX: 1.0, gapZ: 1.0,
      });
    }
  }
  // basket dividers
  for (let ix = 1; ix < nx; ix++) S.box(MAT.white, 0.014, top - floorY, id, -iw / 2 + ix * cw, (top + floorY) / 2, 0);
  S.box(MAT.white, iw, top - floorY, 0.014, 0, (top + floorY) / 2, 0);
  S.build(g); pack.build(g);

  // branding stripes (DONDURMA) on all four sides
  const bandH = 0.28, bandY = 0.45;
  const lw = L - 0.3;
  for (const sz of [-1, 1]) {
    const stripe = new THREE.Mesh(boxGeo(L - 0.02, bandH + 0.03, 0.004), brand);
    stripe.position.set(0, bandY, sz * (Wd / 2 + 0.001)); g.add(stripe);
    signPlane(g, 'DONDURMA', lw, bandH - 0.04, 0, bandY, sz * (Wd / 2 + 0.004), sz < 0 ? Math.PI : 0, { bg: '#0e5aa7', border: '#ffd23a', glow: 0.35 });
  }
  for (const sx of [-1, 1]) {
    const stripe = new THREE.Mesh(boxGeo(0.004, bandH + 0.03, Wd - 0.02), brand);
    stripe.position.set(sx * (L / 2 + 0.001), bandY, 0); g.add(stripe);
    signPlane(g, 'DONDURMA', Wd - 0.2, bandH - 0.04, sx * (L / 2 + 0.004), bandY, 0, sx * HP, { bg: '#0e5aa7', border: '#ffd23a', glow: 0.35 });
  }
  return g;
}

/* ------------------------------------------------------------------ */
/* 4. deli counter                                                     */
/* ------------------------------------------------------------------ */
export function createDeliCounter({ length = 4.0, depth = 1.2, height = 1.35, seed = 1 } = {}) {
  buildCatalogue();
  const rng = seededRandom(seed * 6151 + 17);
  const g = new THREE.Group(); g.name = 'DeliCounter';
  const S = new Statics(), pack = new Pack();
  const L = length, D = depth, H = height;
  const zB = -D / 2, zF = D / 2;                 // staff side / customer side
  const zS = zB + 0.48;                          // start of the display case
  const facade = stdMat('#8a2323', { roughness: 0.5 });
  const gcol = (c) => new THREE.Color(c);

  // plinth + cabinets
  S.box(MAT.black, L - 0.1, 0.08, D - 0.1, 0, 0.04, 0);
  S.box(MAT.white, L, 0.85, zS - zB, 0, 0.08 + 0.425, (zB + zS) / 2);            // staff-side cabinet
  S.box(MAT.white, L, 0.62, zF - zS, 0, 0.08 + 0.31, (zS + zF) / 2);              // display base
  S.box(MAT.steel, L + 0.02, 0.03, zS - zB + 0.03, 0, 0.945, (zB + zS) / 2 - 0.005); // stainless work top
  S.box(MAT.steel, L + 0.02, 0.045, 0.04, 0, 0.9, zB - 0.005);                    // splash lip... staff edge
  S.box(facade, L - 0.02, 0.48, 0.012, 0, 0.4, zF + 0.002);                        // customer facade
  for (let i = 0; i <= 8; i++) S.box(MAT.steel, 0.012, 0.48, 0.008, -L / 2 + 0.06 + (i * (L - 0.12)) / 8, 0.4, zF + 0.01);
  S.box(MAT.steel, L, 0.05, 0.1, 0, 0.7, zF - 0.01);                               // front rail
  S.box(MAT.steel, L - 0.02, 0.025, 0.02, 0, 0.14, zF + 0.004);
  // staff side cupboard lines
  for (let i = 0; i <= 6; i++) S.box(MAT.darkSteel, 0.01, 0.7, 0.006, -L / 2 + 0.1 + (i * (L - 0.2)) / 6, 0.5, zB - 0.002);
  // display floor, riser
  S.box(MAT.tile, L - 0.08, 0.012, zF - zS - 0.05, 0, 0.706, (zS + zF) / 2 - 0.02);
  S.box(MAT.tile, L - 0.08, 0.12, 0.3, 0, 0.76, zS + 0.18);
  const yFront = 0.712, yBack = 0.82;

  // canopy, back glass, end glass, front glass
  const y1 = H - 0.05;
  S.box(MAT.steel, L, 0.05, 0.5, 0, H - 0.025, zS + 0.25);
  S.box(MAT.warmLed, L - 0.3, 0.012, 0.05, 0, y1 - 0.007, zS + 0.2);
  S.box(MAT.warmLed, L - 0.3, 0.012, 0.05, 0, y1 - 0.007, zS + 0.42);
  S.box(MAT.steel, L, 0.03, 0.03, 0, 0.95 + 0.07, zS);                             // back lower rail
  S.box(MAT.steel, L, 0.025, 0.03, 0, y1 - 0.0, zS);                               // back upper rail
  S.box(MAT.steel, L, 0.045, 0.02, 0, 0.945 + 0.02, zS);
  S.box(MAT.glass, L - 0.06, y1 - 1.0, 0.008, 0, (y1 + 1.0) / 2, zS);              // back sliding glass
  S.box(MAT.steel, 0.025, y1 - 0.95, 0.03, 0, (y1 + 0.95) / 2, zS);               // centre stile
  // curved front: lower vertical + angled upper
  const zv = zF - 0.04, yLow = 0.72, yMid = 0.92, zTop = zF - 0.2;
  const dz = zv - zTop, dy = y1 - yMid, len = Math.hypot(dz, dy), ang = -Math.atan2(dz, dy);
  S.box(MAT.glass, L - 0.08, yMid - yLow, 0.008, 0, (yMid + yLow) / 2, zv);
  S.box(MAT.glass, L - 0.08, len, 0.008, 0, (yMid + y1) / 2, (zv + zTop) / 2, ang, 0, 0);
  S.box(MAT.steel, L - 0.04, 0.025, 0.03, 0, yMid, zv);
  S.box(MAT.steel, L - 0.04, 0.025, 0.03, 0, y1, zTop);
  S.box(MAT.steel, L - 0.04, 0.025, 0.03, 0, yLow + 0.0125, zv);
  for (const sx of [-1, 1]) {
    // end glass: quad between back and front glass
    S.box(MAT.glass, 0.008, y1 - 0.95, zv - zS, sx * (L / 2 - 0.02), (y1 + 0.95) / 2, (zv + zS) / 2);
    S.box(MAT.steel, 0.03, y1 - 0.72, 0.03, sx * (L / 2 - 0.02), (y1 + 0.72) / 2, zv);
    S.box(MAT.steel, 0.03, y1 - 0.95, 0.03, sx * (L / 2 - 0.02), (y1 + 0.95) / 2, zS);
  }

  // pans + products
  const nSec = Math.round((L - 0.2) / 0.48), pw = (L - 0.2) / nSec - 0.025;
  const frontTypes = ['olivesG', 'cheese', 'kasar', 'olivesB', 'feta', 'sucuk', 'olivesG', 'pastirma', 'olivesB', 'cheese'];
  const backTypes = ['sucuk', 'pastirma', 'meat', 'kasar', 'cheese', 'meat', 'sucuk', 'feta', 'pastirma', 'meat'];
  const rot = Math.floor(rng() * 4);
  const panMat = MAT.steel;
  function pan(cx, cy, cz, pwid, pdep, ph) {
    S.box(panMat, pwid, 0.006, pdep, cx, cy + 0.003, cz);
    S.box(panMat, pwid, ph, 0.006, cx, cy + ph / 2, cz + pdep / 2 - 0.003);
    S.box(panMat, pwid, ph, 0.006, cx, cy + ph / 2, cz - pdep / 2 + 0.003);
    S.box(panMat, 0.006, ph, pdep, cx - pwid / 2 + 0.003, cy + ph / 2, cz);
    S.box(panMat, 0.006, ph, pdep, cx + pwid / 2 - 0.003, cy + ph / 2, cz);
  }
  const oliveCols = { G: [gcol('#5f7a1f'), gcol('#7c9a2a'), gcol('#4e6a1a')], B: [gcol('#17100f'), gcol('#241a1a'), gcol('#0f0b0b')] };
  function stock(kind, cx, base, cz, pwid, pdep, tier) {
    const white = new THREE.Color(1, 1, 1);
    const jit = (o) => (rng() - 0.5) * o;
    if (kind.startsWith('olives')) {
      const pal = oliveCols[kind === 'olivesG' ? 'G' : 'B'];
      const rx = pwid / 2 - 0.03, rz = pdep / 2 - 0.03, hh = 0.07;
      pack.add('heap', null, cx, base, cz, 0, rx, hh, rz, kind === 'olivesG' ? gcol('#4a6416') : gcol('#120d0c'));
      for (let i = 0; i < 38; i++) {
        const a = rng() * 6.283, r = Math.sqrt(rng()) * 0.94;
        const nx = Math.cos(a) * r, nz = Math.sin(a) * r;
        const y = hh * Math.sqrt(Math.max(0, 1 - nx * nx - nz * nz)) - 0.004;
        pack.add('olive', null, cx + nx * rx, base + y, cz + nz * rz, rng() * 3, 1, 1.2, 1, pick(rng, pal));
      }
    } else if (kind === 'cheese' || kind === 'feta') {
      const s = kind === 'feta' ? 0.72 : 1;
      const cols = kind === 'feta' ? 4 : 3, rows = kind === 'feta' ? 2 : 1;
      const w = 0.12 * s + 0.012, d = 0.2 * s + 0.01;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const x = cx + (c - (cols - 1) / 2) * w, z = cz + (r - (rows - 1) / 2) * d + jit(0.01);
        const tint = kind === 'feta' ? gcol('#fbfaf2') : gcol(pick(rng, ['#fffdf0', '#f8efc4', '#fff6d6']));
        pack.add('cheeseBlock', null, x, base, z, jit(0.1), s, s, s, tint);
        if (kind === 'cheese' && c !== 1) pack.add('cheeseBlock', null, x + jit(0.01), base + 0.08, z, jit(0.1), s, s, s, tint);
      }
    } else if (kind === 'kasar') {
      const s = 0.85, r = 0.14 * s;
      for (let i = 0; i < 3; i++) pack.add('kasar', null, cx + (i - 1) * 0.02, base + r * 0.98, cz + (i - 1) * 0.085, jit(0.2), s, s, s, gcol('#ffffff'), HP, jit(0.1));
    } else if (kind === 'sucuk') {
      const rowsN = [4, 3, 2];
      rowsN.forEach((n, layer) => {
        for (let i = 0; i < n; i++) pack.add('sucukLink', null, cx + jit(0.01), base + 0.003 + layer * 0.052, cz + (i - (n - 1) / 2) * 0.062, jit(0.04), 1, 1, 1, gcol(pick(rng, ['#ffffff', '#f0d8c8', '#ffe8d8'])));
      });
    } else if (kind === 'pastirma') {
      for (let i = 0; i < 7; i++) pack.add('pastirma', null, cx + jit(0.04), base + i * 0.022, cz + (i - 3) * 0.035, jit(0.25), 1, 1, 1, gcol(pick(rng, ['#ffffff', '#ffe0d0'])));
    } else if (kind === 'meat') {
      for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
        pack.add('meatCut', null, cx + (c - 1) * 0.15, base, cz + (r - 0.5) * 0.12, jit(0.2), 1, 1, 1, gcol(pick(rng, ['#ffffff', '#ffd8d0', '#ffeeee'])));
        if (rng() < 0.6) pack.add('meatCut', null, cx + (c - 1) * 0.15, base + 0.06, cz + (r - 0.5) * 0.12, jit(0.2), 1, 1, 1, gcol('#ffffff'));
      }
    }
    // price tag leaning at the front of the pan
    pack.add('tag', null, cx + pwid / 2 - 0.07, base - 0.002, cz + pdep / 2 - 0.02, 0, 1, 1, 1, pick(rng, TAGCOLS), -0.25);
  }
  for (let i = 0; i < nSec; i++) {
    const cx = -(L - 0.2) / 2 + (i + 0.5) * ((L - 0.2) / nSec);
    // back tier
    const bz = zS + 0.17, bd = 0.28;
    pan(cx, yBack, bz, pw, bd, 0.05);
    stock(backTypes[(i + rot) % backTypes.length], cx, yBack + 0.008, bz, pw, bd, 'b');
    // front tier
    const fz = zS + 0.33 + 0.17, fd = 0.34;
    pan(cx, yFront, fz, pw, fd, 0.05);
    stock(frontTypes[(i + rot * 2) % frontTypes.length], cx, yFront + 0.008, fz, pw, fd, 'f');
  }

  // staff-side items
  // digital scale
  const sx0 = L / 2 - 0.55, sz0 = zB + 0.25, wy = 0.96;
  S.box(MAT.white, 0.36, 0.05, 0.36, sx0, wy + 0.025, sz0);
  S.box(MAT.steel, 0.32, 0.012, 0.3, sx0, wy + 0.056, sz0 - 0.01);
  S.box(MAT.white, 0.06, 0.2, 0.05, sx0, wy + 0.1, sz0 + 0.15);
  S.box(MAT.white, 0.24, 0.12, 0.04, sx0, wy + 0.21, sz0 + 0.15, -0.35, 0, 0);
  // cutting board + slicer-ish block + paper roll
  S.box(MAT.wood, 0.55, 0.03, 0.34, -L / 2 + 0.7, wy + 0.015, zB + 0.24);
  S.box(MAT.steel, 0.2, 0.012, 0.1, -L / 2 + 0.55, wy + 0.036, zB + 0.24, 0, 0.3, 0);
  S.box(MAT.black, 0.05, 0.012, 0.1, -L / 2 + 0.66, wy + 0.036, zB + 0.24, 0, 0.3, 0);
  S.cyl(MAT.white, 0.07, 0.07, 0.3, 14, -0.4, wy + 0.15, zB + 0.18, 0, 0, HP);
  S.box(MAT.steel, 0.4, 0.02, 0.05, -0.4, wy + 0.01, zB + 0.18);
  pack.add('meatCut', null, -L / 2 + 0.76, wy + 0.03, zB + 0.25, 0.4, 1.3, 1.3, 1.3, gcol('#ffffff'));
  pack.add('cheeseBlock', null, -L / 2 + 0.88, wy + 0.03, zB + 0.2, 0.2, 0.9, 0.9, 0.9, gcol('#fff3c8'));

  // sign posts + sign (kept inside the footprint)
  const postX = Math.min(L / 2 - 0.25, 1.6), postZ = zB + 0.2;
  for (const sx of [-1, 1]) S.box(MAT.darkSteel, 0.06, 2.1 - 0.95, 0.06, sx * postX, (2.1 + 0.95) / 2, postZ);
  S.box(MAT.darkSteel, postX * 2 + 0.06, 0.4, 0.09, 0, 1.92, postZ);
  S.build(g); pack.build(g);
  const signW = postX * 2 - 0.1;
  signPlane(g, 'ŞARKÜTERİ', signW, 0.34, 0, 1.92, postZ + 0.047, 0, { bg: '#b3201f', border: '#ffd23a', glow: 0.8 });
  signPlane(g, 'ŞARKÜTERİ', signW, 0.34, 0, 1.92, postZ - 0.047, Math.PI, { bg: '#b3201f', border: '#ffd23a', glow: 0.8 });
  // scale display
  const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.09), signMat('0,342 kg', 0.2, 0.09, { bg: '#0f2b16', fg: '#7dff9a', glow: 0.9, px: 70 }));
  disp.position.set(sx0, wy + 0.21 + 0.0, sz0 + 0.15 - 0.021);
  disp.rotation.set(-0.35, Math.PI, 0);
  disp.position.set(sx0, wy + 0.2145, sz0 + 0.15 - 0.0215);
  g.add(disp);
  return g;
}

/* ------------------------------------------------------------------ */
/* showcases                                                           */
/* ------------------------------------------------------------------ */
function row(items, gap = 0.8, z = 0) {
  const g = new THREE.Group();
  const widths = items.map(([o]) => { const b = new THREE.Box3().setFromObject(o); return b.max.x - b.min.x; });
  const total = widths.reduce((a, b) => a + b, 0) + gap * (items.length - 1);
  let x = -total / 2;
  items.forEach(([o, rotY], i) => {
    o.position.x = x + widths[i] / 2; o.position.z = z; if (rotY) o.rotation.y = rotY;
    x += widths[i] + gap; g.add(o);
  });
  return g;
}

export function showcase() {
  const g = row([
    [createReachInCooler({ doors: 4, category: 'drinks', seed: 1 })],
    [createOpenMultideck({ category: 'dairy', seed: 2 })],
    [createChestFreezer({ seed: 3 })],
    [createDeliCounter({ seed: 4 })],
  ], 1.0);
  g.name = 'RefrigerationShowcase';
  return g;
}

/** Every category of every factory (verification helpers). */
export function showcaseCoolers() {
  return row([
    [createReachInCooler({ doors: 3, category: 'drinks', seed: 1 })],
    [createReachInCooler({ doors: 3, category: 'dairy', seed: 2 })],
    [createReachInCooler({ doors: 3, category: 'frozen', seed: 3 })],
  ], 0.6);
}
export function showcaseDecks() {
  return row([
    [createOpenMultideck({ category: 'dairy', seed: 2 })],
    [createOpenMultideck({ category: 'meat', seed: 3 })],
    [createOpenMultideck({ category: 'deli', seed: 4 })],
  ], 0.6);
}
export function showcaseChests() {
  return row([
    [createChestFreezer({ category: 'icecream', seed: 3 })],
    [createChestFreezer({ category: 'frozen', seed: 5 })],
  ], 0.6);
}
