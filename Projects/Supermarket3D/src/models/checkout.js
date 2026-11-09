// Bereket Market - checkout lane, self checkout kiosk, customer service desk.
// Units: meters, Y up, front (customer side) = +Z unless noted.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { seededRandom, pick, stdMat, boxGeo, labelTexture } from './common.js';

/* ------------------------------------------------------------------ */
/* Shared materials                                                    */
/* ------------------------------------------------------------------ */
const GREEN = '#1f7a3a';
const M = {
  lam: stdMat('#e3dfd5', { roughness: 0.45 }),
  lamEdge: stdMat('#cfcac0', { roughness: 0.5 }),
  green: stdMat(GREEN, { roughness: 0.4 }),
  greenLight: stdMat('#2f9a4f', { roughness: 0.5 }),
  steel: stdMat('#c6cacf', { metalness: 0.85, roughness: 0.32 }),
  dark: stdMat('#2a2b2e', { roughness: 0.6 }),
  black: stdMat('#141416', { roughness: 0.45 }),
  plastic: stdMat('#34363a', { roughness: 0.5 }),
  fabric: stdMat('#2d3640', { roughness: 0.9 }),
  white: stdMat('#f1f1ee', { roughness: 0.5 }),
  orange: stdMat('#ee8a1e', { roughness: 0.5 }),
  glass: stdMat('#0b1015', { roughness: 0.06, metalness: 0.4 }),
  laser: stdMat('#ff2a1a', { emissive: '#ff2a1a', emissiveIntensity: 1.6 }),
  ringOpen: stdMat('#3df06a', { emissive: '#2bd95a', emissiveIntensity: 1.8 }),
  ringClosed: stdMat('#ff3b30', { emissive: '#ff2a20', emissiveIntensity: 1.8 }),
  lampGreen: stdMat('#3df06a', { emissive: '#2bd95a', emissiveIntensity: 1.8 }),
  rubber: stdMat('#1b1b1d', { roughness: 0.95 }),
  kraft: stdMat('#b58b5a', { roughness: 0.85 }),
  paper: stdMat('#f7f7f2', { roughness: 0.9 }),
  bag: stdMat('#ffffff', { roughness: 0.55 }), // tinted per instance
  prod: stdMat('#ffffff', { roughness: 0.6 }), // tinted per instance
};

/* ------------------------------------------------------------------ */
/* Geometry / texture helpers                                          */
/* ------------------------------------------------------------------ */
const _rb = new Map();
function rbGeo(w, h, d, r = 0.01, seg = 2) {
  const k = [w, h, d, r, seg].join('|');
  let g = _rb.get(k);
  if (!g) { g = new RoundedBoxGeometry(w, h, d, seg, r); _rb.set(k, g); }
  return g;
}
const _cyl = new Map();
function cylGeo(rt, rb, h, seg = 12) {
  const k = [rt, rb, h, seg].join('|');
  let g = _cyl.get(k);
  if (!g) { g = new THREE.CylinderGeometry(rt, rb, h, seg); _cyl.set(k, g); }
  return g;
}
const _pl = new Map();
function planeGeo(w, h) {
  const k = w + '|' + h;
  let g = _pl.get(k);
  if (!g) { g = new THREE.PlaneGeometry(w, h); _pl.set(k, g); }
  return g;
}
const _tex = new Map();
function canvasTex(key, w, h, draw) {
  let t = _tex.get(key);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  _tex.set(key, t);
  return t;
}
const _scr = new Map();
/** Emissive "screen" material from a texture. */
function screenMat(tex) {
  let m = _scr.get(tex.uuid);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.95, roughness: 0.25 });
    _scr.set(tex.uuid, m);
  }
  return m;
}
const _lbl = new Map();
function flatMat(tex) {
  let m = _lbl.get(tex.uuid);
  if (!m) { m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55 }); _lbl.set(tex.uuid, m); }
  return m;
}
function plane(w, h, mat, x, y, z, ry = 0, rx = 0) {
  const m = new THREE.Mesh(planeGeo(w, h), mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, 0, 'YXZ');
  return m;
}

/** Collects many small parts and merges them per material (few draw calls). */
class Batch {
  constructor() { this.items = new Map(); }
  _push(mat, geo, m4) {
    let a = this.items.get(mat); if (!a) { a = []; this.items.set(mat, a); }
    a.push([geo, m4]);
  }
  _mat(x, y, z, o = {}) {
    const m = new THREE.Matrix4();
    m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(o.rx || 0, o.ry || 0, o.rz || 0, 'YXZ')), new THREE.Vector3(1, 1, 1));
    return m;
  }
  /** box, bottom-center at (x,y,z) */
  box(mat, w, h, d, x, y, z, o) { this._push(mat, boxGeo(w, h, d), this._mat(x, y + h / 2, z, o)); return this; }
  rbox(mat, w, h, d, r, x, y, z, o) { this._push(mat, rbGeo(w, h, d, r), this._mat(x, y + h / 2, z, o)); return this; }
  cyl(mat, rt, rb, h, seg, x, y, z, o) { this._push(mat, cylGeo(rt, rb, h, seg), this._mat(x, y + h / 2, z, o)); return this; }
  /** arbitrary geometry, geometry origin at (x,y,z) */
  geo(mat, g, x, y, z, o) { this._push(mat, g, this._mat(x, y, z, o)); return this; }
  flush(parent, cast = true) {
    for (const [mat, list] of this.items) {
      const gs = list.map(([g, m]) => (g.index ? g.toNonIndexed() : g.clone()).applyMatrix4(m));
      const merged = mergeGeometries(gs, false);
      gs.forEach((g) => g.dispose());
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = cast; mesh.receiveShadow = true;
      parent.add(mesh);
    }
    this.items.clear();
  }
}

/** InstancedMesh from a list of {p:[x,y,z], r:[rx,ry,rz], s:[sx,sy,sz], c:color} */
function instanced(geo, mat, list, cast = false) {
  const im = new THREE.InstancedMesh(geo, mat, list.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
  list.forEach((it, i) => {
    e.set(...(it.r || [0, 0, 0]), 'YXZ'); q.setFromEuler(e);
    s.set(...(it.s || [1, 1, 1])); p.set(...it.p);
    m.compose(p, q, s); im.setMatrixAt(i, m);
    im.setColorAt(i, c.set(it.c || '#ffffff'));
  });
  im.instanceMatrix.needsUpdate = true;
  if (im.instanceColor) im.instanceColor.needsUpdate = true;
  im.castShadow = cast; im.receiveShadow = false;
  return im;
}

/* ------------------------------------------------------------------ */
/* Shared sub-models                                                   */
/* ------------------------------------------------------------------ */
// Cashier swivel chair; faces +Z (backrest at -Z). Returns Group centered on its column.
function makeChair(seatH = 0.6) {
  const g = new THREE.Group(); g.name = 'Sandalye';
  const b = new Batch();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    b.box(M.black, 0.30, 0.03, 0.05, Math.sin(a) * 0.15, 0.06, Math.cos(a) * 0.15, { ry: a + Math.PI / 2 });
    b.cyl(M.black, 0.022, 0.022, 0.05, 8, Math.sin(a) * 0.29, 0.0, Math.cos(a) * 0.29);
  }
  b.cyl(M.steel, 0.025, 0.03, seatH - 0.14, 10, 0, 0.09, 0);
  b.cyl(M.black, 0.06, 0.06, 0.06, 12, 0, seatH - 0.1, 0);
  b.rbox(M.fabric, 0.44, 0.07, 0.42, 0.025, 0, seatH - 0.04, 0);
  // backrest on a curved-ish stalk
  b.box(M.black, 0.04, 0.24, 0.03, 0, seatH + 0.02, -0.22);
  b.rbox(M.fabric, 0.40, 0.30, 0.06, 0.025, 0, seatH + 0.2, -0.24, { rx: -0.08 });
  b.flush(g, true);
  return g;
}

function makeScreenUnit(w, h, tex, depth = 0.025) {
  // thin monitor shell facing +Z with emissive screen on its front
  const g = new THREE.Group();
  const shell = new THREE.Mesh(rbGeo(w, h, depth, 0.008), M.black);
  shell.castShadow = true;
  g.add(shell);
  g.add(plane(w - 0.025, h - 0.025, screenMat(tex), 0, 0, depth / 2 + 0.0008));
  return g;
}

/* ------------------------------------------------------------------ */
/* Textures                                                            */
/* ------------------------------------------------------------------ */
function posTexture(open) {
  return canvasTex('pos|' + open, 512, 320, (g, w, h) => {
    g.fillStyle = open ? '#0f1a24' : '#0a0d10'; g.fillRect(0, 0, w, h);
    if (!open) {
      g.fillStyle = '#7a8591'; g.font = 'bold 40px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('KASA KAPALI', w / 2, h / 2 - 10);
      g.font = '22px sans-serif'; g.fillText('Bereket Market', w / 2, h / 2 + 34);
      return;
    }
    g.fillStyle = GREEN; g.fillRect(0, 0, w, 40);
    g.fillStyle = '#fff'; g.font = 'bold 24px sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText('Bereket Market', 14, 21);
    g.textAlign = 'right'; g.font = '20px sans-serif'; g.fillText('Kasa 1  14:32', w - 14, 21);
    const rows = [['Ekmek', '1', '12,50'], ['Süt 1 L', '2', '38,90'], ['Domates 1,2 kg', '1', '54,00'], ['Zeytinyağı 750 ml', '1', '129,90'], ['Çay 500 g', '1', '10,60']];
    g.font = '21px sans-serif';
    rows.forEach((r, i) => {
      const y = 62 + i * 30;
      if (i % 2 === 0) { g.fillStyle = '#16252f'; g.fillRect(0, y - 14, w, 30); }
      g.fillStyle = '#dce6ee'; g.textAlign = 'left'; g.fillText(r[0], 14, y);
      g.textAlign = 'center'; g.fillStyle = '#8fa3b3'; g.fillText('x' + r[1], 330, y);
      g.textAlign = 'right'; g.fillStyle = '#dce6ee'; g.fillText(r[2] + ' ₺', w - 14, y);
    });
    g.fillStyle = '#1b2d3b'; g.fillRect(0, 226, w, 4);
    g.fillStyle = '#ffd23f'; g.font = 'bold 44px sans-serif'; g.textAlign = 'center';
    g.fillText('TOPLAM 245,90 ₺', w / 2, 262);
    g.fillStyle = '#2f9a4f'; g.fillRect(14, 288, 150, 26); g.fillRect(w - 164, 288, 150, 26);
    g.fillStyle = '#fff'; g.font = 'bold 15px sans-serif'; g.fillText('NAKİT', 89, 302); g.fillText('KREDİ KARTI', w - 89, 302);
  });
}
function custDisplayTexture(open) {
  return canvasTex('cust|' + open, 256, 128, (g, w, h) => {
    g.fillStyle = '#0a1a10'; g.fillRect(0, 0, w, h);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (!open) { g.fillStyle = '#6a7a70'; g.font = 'bold 30px sans-serif'; g.fillText('KASA KAPALI', w / 2, h / 2); return; }
    g.fillStyle = '#9fe5b3'; g.font = 'bold 22px sans-serif'; g.fillText('TOPLAM', w / 2, 30);
    g.fillStyle = '#fff'; g.font = 'bold 40px sans-serif'; g.fillText('245,90 ₺', w / 2, 76);
    g.fillStyle = '#9fe5b3'; g.font = '16px sans-serif'; g.fillText('Bereket Market\'e hoş geldiniz', w / 2, 112);
  });
}
function termTexture(open) {
  return canvasTex('term|' + open, 128, 192, (g, w, h) => {
    g.fillStyle = '#0d1b2a'; g.fillRect(0, 0, w, h);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#8fd0ff'; g.font = 'bold 18px sans-serif'; g.fillText('TUTAR', w / 2, 24);
    g.fillStyle = '#fff'; g.font = 'bold 28px sans-serif'; g.fillText(open ? '245,90 ₺' : '--,-- ₺', w / 2, 58);
    g.strokeStyle = '#8fd0ff'; g.lineWidth = 3; g.strokeRect(34, 84, 60, 40);
    g.fillStyle = '#8fd0ff'; g.font = '15px sans-serif';
    g.fillText('KARTINIZI', w / 2, 150); g.fillText('OKUTUN', w / 2, 170);
  });
}
function keyboardTexture() {
  return canvasTex('keys', 256, 96, (g, w, h) => {
    g.fillStyle = '#1b1c1f'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#3d4046';
    for (let r = 0; r < 5; r++) for (let c = 0; c < 16; c++) g.fillRect(6 + c * 15.4, 6 + r * 17.6, 12.5, 14);
  });
}
function beltTexture() {
  return canvasTex('belt', 64, 64, (g, w, h) => {
    g.fillStyle = '#1c1c1f'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#2b2b2f'; g.fillRect(0, 0, w, 5); g.fillRect(0, 32, w, 3);
    g.fillStyle = '#151517'; g.fillRect(0, 5, w, 2);
    g.strokeStyle = '#252528'; g.lineWidth = 2;
    for (let x = 0; x < w; x += 8) { g.beginPath(); g.moveTo(x, 8); g.lineTo(x + 4, 30); g.stroke(); }
  });
}
function laneSignTexture(n, open) {
  return canvasTex('lane|' + n + '|' + open, 256, 256, (g, w, h) => {
    g.fillStyle = open ? '#0c1c12' : '#1c0c0c'; g.fillRect(0, 0, w, h);
    g.fillStyle = open ? '#ffffff' : '#ff8a80'; g.font = 'bold 170px sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(n), w / 2, h / 2 + 8);
  });
}

/* ------------------------------------------------------------------ */
/* Impulse merchandiser (candy / gum / batteries)                      */
/* ------------------------------------------------------------------ */
const CANDY_COLS = ['#e53935', '#fdd835', '#43a047', '#1e88e5', '#8e24aa', '#fb8c00', '#ec407a', '#26c6da'];
const BATT_COLS = ['#d32f2f', '#fbc02d', '#212121', '#1565c0'];
function buildImpulseRack(rng) {
  const g = new THREE.Group(); g.name = 'Kasa Önü Reyonu';
  const D = 0.2, W = 0.55, H = 1.2;
  const b = new Batch();
  b.box(M.dark, D, 0.09, W, 0, 0, 0);                      // plinth
  b.box(M.steel, 0.02, H - 0.09, W, D / 2 - 0.01, 0.09, 0); // back panel (+X side)
  b.box(M.steel, D, 0.02, 0.02, 0, 0.09, W / 2 - 0.01).box(M.steel, D, 0.02, 0.02, 0, 0.09, -W / 2 + 0.01);
  const shelfY = [0.2, 0.46, 0.72, 0.98];
  shelfY.forEach((y) => {
    b.box(M.white, D - 0.02, 0.012, W - 0.02, -0.01, y, 0, { rz: 0.1 });
    b.box(M.steel, 0.012, 0.045, W - 0.02, -D / 2 + 0.006, y - 0.012, 0);
  });
  b.box(M.green, D + 0.02, 0.17, W + 0.02, 0, H - 0.0, 0); // header
  b.flush(g, true);
  // header text on -X face
  g.add(plane(W, 0.14, flatMat(labelTexture('ŞEKER · SAKIZ · PİL', { width: 512, height: 128, bg: GREEN, fg: '#fff', font: 'bold 52px sans-serif' })), -D / 2 - 0.0125, H + 0.085, 0, -Math.PI / 2));
  // products
  const cand = [], batt = [];
  shelfY.forEach((y, ri) => {
    const baseY = y + 0.012;
    for (let i = 0; i < 9; i++) {
      const z = -W / 2 + 0.04 + i * ((W - 0.08) / 8);
      const x = -0.04;
      if (ri === 3) { // batteries: blister cards
        for (let k = 0; k < 2; k++) cand.push({ p: [x + k * 0.02 + 0.03, baseY + 0.09 + 0.002, z], r: [0, 0, 0.1 - 0.0], s: [0.012, 0.15, 0.052], c: pick(rng, BATT_COLS) });
        for (let k = 0; k < 2; k++) batt.push({ p: [x + k * 0.02 + 0.021, baseY + 0.06, z + (k - 0.5) * 0.02], r: [0, 0, 0.1], s: [1, 1, 1], c: k ? '#c0c4c8' : '#222' });
      } else if (ri === 2) { // gum packs
        for (let k = 0; k < 2; k++) cand.push({ p: [x + k * 0.05 + 0.0, baseY + 0.045, z], r: [0, 0, 0.1], s: [0.035, 0.09, 0.045], c: pick(rng, CANDY_COLS) });
      } else { // candy bars / boxes
        for (let k = 0; k < 3; k++) cand.push({ p: [x + k * 0.045 - 0.01, baseY + 0.0225, z], r: [0, (rng() - 0.5) * 0.2, 0.1], s: [0.04, 0.045, 0.045], c: pick(rng, CANDY_COLS) });
      }
    }
  });
  g.add(instanced(boxGeo(1, 1, 1), M.prod, cand));
  g.add(instanced(cylGeo(0.0075, 0.0075, 0.05, 8), M.prod, batt));
  return g;
}

/* ------------------------------------------------------------------ */
/* Groceries on the belt & plastic bags                                */
/* ------------------------------------------------------------------ */
const BAGGREEN = '#1f8a3f';
let _bagGeo = null, _handleGeo = null;
function bagGeo() {
  if (!_bagGeo) { _bagGeo = new THREE.CylinderGeometry(0.115, 0.085, 0.3, 4, 1); _bagGeo.rotateY(Math.PI / 4); _bagGeo.translate(0, 0.15, 0); }
  return _bagGeo;
}
function handleGeo() {
  if (!_handleGeo) { _handleGeo = new THREE.TorusGeometry(0.045, 0.004, 4, 10, Math.PI); }
  return _handleGeo;
}
function bagInstances(list) { // list of {p:[x,y,z], ry, sc, c}
  const bags = [], handles = [];
  list.forEach((l) => {
    const sc = l.sc || 1;
    bags.push({ p: l.p, r: [0, l.ry || 0, l.tilt || 0], s: [1 * sc, (l.h || 1) * sc, 0.62 * sc], c: l.c || BAGGREEN });
    const hy = 0.3 * (l.h || 1) * sc;
    const ca = Math.cos(l.ry || 0), sa = Math.sin(l.ry || 0);
    [-1, 1].forEach((side) => {
      handles.push({ p: [l.p[0] + sa * side * 0.0 + ca * 0 + 0 * side, l.p[1] + hy, l.p[2]], r: [0, (l.ry || 0) + Math.PI / 2 + side * 0.0, 0], s: [sc, sc, sc], c: BAGGREEN });
    });
  });
  return [instanced(bagGeo(), M.bag, bags), instanced(handleGeo(), M.bag, handles.filter((_, i) => i % 2 === 0))];
}

/* ------------------------------------------------------------------ */
/* CHECKOUT LANE                                                       */
/* ------------------------------------------------------------------ */
// Counter body X range: -0.85 .. +0.05 (0.90 wide). Cashier zone: +0.05 .. +0.85.
export function createCheckoutLane({ laneNumber = 1, seed = 1, open = true } = {}) {
  const rng = seededRandom(seed * 7919 + laneNumber);
  const g = new THREE.Group(); g.name = 'Kasa Şeridi ' + laneNumber;
  const XL = -0.85, XR = 0.05, CX = (XL + XR) / 2, CW = XR - XL;
  const ZB0 = -2.0, ZB1 = -0.6, ZM1 = 1.1, ZE = 2.0;
  const b = new Batch();

  // plinth
  b.box(M.dark, CW - 0.06, 0.08, ZE - ZB0 - 0.06, CX, 0, 0);
  // belt section cabinet + top
  b.box(M.lam, CW, 0.68, ZB1 - ZB0, CX, 0.08, (ZB0 + ZB1) / 2);
  b.box(M.lamEdge, CW, 0.04, ZB1 - ZB0, CX, 0.76, (ZB0 + ZB1) / 2);
  // mid cabinet + top
  const zmid = (ZB1 + ZM1) / 2, lm = ZM1 - ZB1;
  b.box(M.lam, CW, 0.80, lm, CX, 0.08, zmid);
  b.box(M.lamEdge, CW + 0.0, 0.04, lm, CX, 0.88, zmid);
  // bagging well cabinet + stainless deck
  const zw = (ZM1 + ZE) / 2, lw = ZE - ZM1;
  b.box(M.lam, CW, 0.60, lw, CX, 0.08, zw);
  b.box(M.steel, CW + 0.01, 0.025, lw + 0.01, CX, 0.68, zw);
  // rim around well (-X, +X, +Z)
  b.box(M.steel, 0.02, 0.09, lw, XL + 0.01, 0.705, zw);
  b.box(M.steel, 0.02, 0.09, lw, XR - 0.01, 0.705, zw);
  b.box(M.steel, CW, 0.09, 0.02, CX, 0.705, ZE - 0.01);
  // stainless trim on the top edges of the mid and belt sections
  b.box(M.steel, 0.018, 0.05, lm + 0.004, XL - 0.004, 0.875, zmid);
  b.box(M.steel, 0.018, 0.05, lm + 0.004, XR + 0.004 - 0.018 + 0.018, 0.875, zmid);
  b.box(M.steel, CW + 0.02, 0.05, 0.018, CX, 0.875, ZM1 + 0.004);
  b.box(M.steel, 0.018, 0.045, ZB1 - ZB0, XL - 0.004, 0.757, (ZB0 + ZB1) / 2);
  b.box(M.steel, 0.018, 0.045, ZB1 - ZB0, XR + 0.004, 0.757, (ZB0 + ZB1) / 2);
  b.box(M.steel, CW + 0.02, 0.045, 0.018, CX, 0.757, ZB0 - 0.004);

  // belt assembly: deck, rails, rollers
  const BX0 = -0.79, BX1 = -0.11, BZ0 = -1.93, BZ1 = -0.64, BY = 0.842;
  b.box(M.dark, BX1 - BX0 + 0.04, 0.045, BZ1 - BZ0 + 0.04, (BX0 + BX1) / 2, 0.80, (BZ0 + BZ1) / 2);
  b.box(M.steel, 0.035, 0.07, BZ1 - BZ0 + 0.04, BX0 - 0.0175 - 0.002, 0.80, (BZ0 + BZ1) / 2);
  b.box(M.steel, 0.035, 0.07, BZ1 - BZ0 + 0.04, BX1 + 0.0175 + 0.002, 0.80, (BZ0 + BZ1) / 2);
  [BZ0, BZ1].forEach((z) => b.geo(M.steel, cylGeo(0.022, 0.022, BX1 - BX0, 12), (BX0 + BX1) / 2, BY - 0.022, z, { rz: Math.PI / 2 }));
  // control: stop-switch button and photocell post
  b.box(M.dark, 0.02, 0.03, 0.02, BX1 + 0.0175, 0.872, BZ1 - 0.1);
  b.box(M.dark, 0.012, 0.012, 0.012, BX0 - 0.0175, 0.87, BZ1 - 0.18).box(M.laser, 0.006, 0.006, 0.006, BX0 - 0.0175, 0.88, BZ1 - 0.18);

  // scanner: frame + glass + laser line, flush with counter top (y 0.92)
  const SX = -0.47, SZ = 0.06, SW = 0.3, SD = 0.22;
  b.box(M.steel, SW + 0.04, 0.003, SD + 0.04, SX, 0.92, SZ);
  b.box(M.glass, SW, 0.004, SD, SX, 0.921, SZ);
  b.box(M.laser, SW - 0.06, 0.002, 0.004, SX, 0.925, SZ - 0.03);
  // scanner mini-tower in front (speaker / scale cap)
  b.box(M.black, 0.04, 0.022, SD, SX + SW / 2 + 0.05, 0.92, SZ);

  // cashier ledge (+X side): keyboard tray & support panels
  const LX0 = XR, LX1 = 0.32, LZ0 = -0.35, LZ1 = 1.0, LY = 0.74;
  b.box(M.lam, LX1 - LX0, 0.03, LZ1 - LZ0, (LX0 + LX1) / 2, LY, (LZ0 + LZ1) / 2);
  b.box(M.steel, 0.015, 0.035, LZ1 - LZ0, LX1 + 0.0075, LY - 0.003, (LZ0 + LZ1) / 2);
  b.box(M.lam, LX1 - LX0, LY - 0.08, 0.03, (LX0 + LX1) / 2, 0.08, LZ0 + 0.015);
  b.box(M.lam, LX1 - LX0, LY - 0.08, 0.03, (LX0 + LX1) / 2, 0.08, LZ1 - 0.015);
  // cash drawer on the ledge
  b.rbox(M.dark, 0.21, 0.09, 0.36, 0.01, 0.185, LY + 0.03, -0.05);
  b.box(M.steel, 0.004, 0.012, 0.1, 0.0795 + 0.0, LY + 0.075, -0.05).box(M.black, 0.01, 0.01, 0.012, 0.29, LY + 0.1, -0.2);
  // anti-fatigue mat for the cashier
  b.box(M.rubber, 0.62, 0.012, 1.1, 0.56, 0, 0.45);

  // receipt printer + paper + customer-side items on counter top
  b.rbox(M.plastic, 0.2, 0.11, 0.17, 0.01, -0.2, 0.92, 0.9, { ry: 0.0 });
  b.box(M.paper, 0.06, 0.07, 0.005, -0.2 + 0.0, 1.025, 0.9 - 0.045);
  b.box(M.black, 0.15, 0.012, 0.05, -0.2, 1.03, 0.9 + 0.0, { rx: 0 });
  // monitor stand (on the counter at the +X edge)
  b.cyl(M.black, 0.07, 0.08, 0.015, 14, -0.07, 0.92, 0.55);
  b.box(M.black, 0.035, 0.2, 0.03, -0.07, 0.92, 0.55);
  b.box(M.black, 0.07, 0.04, 0.05, -0.07, 1.1, 0.55);
  // customer display + card terminal stalks
  b.cyl(M.black, 0.04, 0.045, 0.012, 12, -0.58, 0.92, 0.5);
  b.cyl(M.black, 0.011, 0.011, 0.19, 8, -0.58, 0.92, 0.5);
  b.cyl(M.black, 0.045, 0.05, 0.012, 12, -0.6, 0.92, 0.82);
  b.cyl(M.steel, 0.012, 0.012, 0.045, 8, -0.6, 0.93, 0.82);
  // keyboard
  b.rbox(M.black, 0.14, 0.018, 0.42, 0.005, 0.19, LY + 0.03, 0.55);
  // chair mat edge and PC unit under ledge (hint of cabling)
  b.box(M.black, 0.15, 0.3, 0.06, 0.12, 0.08, 0.95);
  // green side panels
  b.box(M.green, 0.012, 0.42, 0.8, XL - 0.006, 0.18, -1.0);
  b.box(M.green, 0.012, 0.42, 1.55, XL - 0.006, 0.18, 0.34);
  b.box(M.green, 0.012, 0.28, 0.82, XL - 0.006, 0.18, 1.55);

  // belt surface (animated scrolling)
  const bt = beltTexture().clone();
  bt.needsUpdate = true;
  bt.wrapS = bt.wrapT = THREE.RepeatWrapping;
  bt.repeat.set(1, (BZ1 - BZ0) / 0.1);
  const beltMat = new THREE.MeshStandardMaterial({ map: bt, roughness: 0.92, color: '#ffffff' });
  const belt = plane(BX1 - BX0, BZ1 - BZ0, beltMat, (BX0 + BX1) / 2, BY, (BZ0 + BZ1) / 2, 0, -Math.PI / 2);
  belt.receiveShadow = true;
  g.add(belt);

  // labels: brand on cabinet
  const brandTex = labelTexture('BEREKET MARKET', { width: 512, height: 96, bg: GREEN, fg: '#fff', font: 'bold 52px sans-serif' });
  g.add(plane(0.76, 0.2, flatMat(brandTex), XL - 0.0125, 0.4, -1.0, -Math.PI / 2));
  g.add(plane(0.85, 0.16, flatMat(labelTexture('KASA ' + laneNumber, { width: 512, height: 96, bg: GREEN, fg: '#fff', font: 'bold 62px sans-serif' })), XL - 0.0125, 0.4, 0.34, -Math.PI / 2));
  g.add(plane(0.5, 0.1, flatMat(labelTexture('POŞET 1 ₺', { width: 512, height: 96, bg: GREEN, fg: '#fff', font: 'bold 52px sans-serif' })), XL - 0.0125, 0.3, 1.55, -Math.PI / 2));

  // next customer divider bar (lying on the belt)
  const dz = -1.0;
  const dv = b;
  dv.box(M.orange, 0.62, 0.035, 0.075, (BX0 + BX1) / 2, BY, dz);
  g.add(plane(0.6, 0.065, flatMat(labelTexture('SONRAKİ MÜŞTERİ', { width: 640, height: 64, bg: '#ee8a1e', fg: '#1a1a1a', font: 'bold 42px sans-serif' })), (BX0 + BX1) / 2, BY + 0.0365, dz, 0, -Math.PI / 2));

  // keyboard keys texture
  g.add(plane(0.4, 0.125, flatMat(keyboardTexture()), 0.19, LY + 0.0485, 0.55, Math.PI / 2, -Math.PI / 2));

  // POS monitor (faces +X, toward the cashier)
  const pos = makeScreenUnit(0.38, 0.24, posTexture(open), 0.03);
  pos.position.set(-0.07, 1.26, 0.55);
  pos.rotation.set(0, Math.PI / 2, 0); pos.rotateX(-0.1);
  g.add(pos);
  // customer facing display (faces -X)
  const cd = makeScreenUnit(0.2, 0.1, custDisplayTexture(open), 0.02);
  cd.position.set(-0.58, 1.14, 0.5);
  cd.rotation.set(0, -Math.PI / 2, 0); cd.rotateX(-0.12);
  g.add(cd);
  // card terminal (tilted, facing -X / up)
  const tm = makeScreenUnit(0.085, 0.16, termTexture(open), 0.03);
  tm.position.set(-0.6, 1.0, 0.82);
  tm.rotation.set(0, -Math.PI / 2, 0); tm.rotateX(-0.55);
  g.add(tm);
  // terminal key pad block under screen would be too fine; give neck
  b.cyl(M.black, 0.012, 0.012, 0.07, 8, -0.6, 0.94, 0.82);

  // chair
  const chair = makeChair(0.62);
  chair.position.set(open ? 0.55 : 0.78, 0, open ? 0.5 : 0.7);
  chair.rotation.y = open ? -Math.PI / 2 + 0.12 : -Math.PI / 2 - 0.5;
  g.add(chair);

  // light pole (+X / -Z corner)
  const pb = b;
  const PX = 0.2, PZ = -1.88, PH = 2.25;
  pb.cyl(M.steel, 0.11, 0.12, 0.02, 14, PX, 0, PZ);
  pb.cyl(M.steel, 0.022, 0.022, PH, 10, PX, 0.02, PZ);
  pb.rbox(M.black, 0.34, 0.34, 0.08, 0.02, PX, PH + 0.0, PZ);
  const ringM = open ? M.ringOpen : M.ringClosed;
  const ringGeo = new THREE.TorusGeometry(0.145, 0.016, 6, 28);
  pb.geo(ringM, ringGeo, PX, PH + 0.17, PZ + 0.04).geo(ringM, ringGeo, PX, PH + 0.17, PZ - 0.04);
  const sm = screenMat(laneSignTexture(laneNumber, open));
  const circ = new THREE.CircleGeometry(0.13, 28);
  [1, -1].forEach((s) => {
    const m = new THREE.Mesh(circ, sm);
    m.position.set(PX, PH + 0.17, PZ + s * 0.0415);
    m.rotation.y = s > 0 ? 0 : Math.PI;
    g.add(m);
  });

  // impulse merchandiser (-X side at -Z end)
  const rack = buildImpulseRack(rng);
  rack.position.set(XL - 0.1 - 0.02, 0, -1.7);
  g.add(rack);

  // groceries on the belt
  if (open) {
    const boxes = [], cans = [];
    const bc = ['#e8c547', '#d9534f', '#4aa3df', '#f08a1e', '#7cb342'];
    boxes.push({ p: [-0.62, BY + 0.11, -1.62], r: [0, 0.2, 0], s: [0.2, 0.22, 0.09], c: bc[0] });
    boxes.push({ p: [-0.38, BY + 0.09, -1.38], r: [0, -0.3, 0], s: [0.13, 0.18, 0.13], c: bc[1] });
    boxes.push({ p: [-0.5, BY + 0.07, -1.22], r: [0, 0.5, 0], s: [0.22, 0.14, 0.12], c: bc[3] });
    boxes.push({ p: [-0.62, BY + 0.2, -1.62], r: [0, 0.2, 0], s: [0.18, 0.18, 0.08], c: bc[2] });
    boxes.push({ p: [-0.3, BY + 0.065, -1.0 - 0.28], r: [0, 0.1, 0], s: [0.1, 0.13, 0.08], c: bc[4] });
    const cc = ['#c62828', '#2e7d32', '#f9a825', '#1565c0'];
    for (let i = 0; i < 5; i++) cans.push({ p: [-0.65 + (i % 3) * 0.075 + rng() * 0.02, BY + 0.055, -1.8 + Math.floor(i / 3) * 0.09], r: [0, 0, 0], s: [1, 1, 1], c: cc[i % 4] });
    cans.push({ p: [-0.28, BY + 0.14, -1.55], r: [0, 0, 0], s: [0.8, 2.3, 0.8], c: '#8ecae6' }); // bottle
    g.add(instanced(boxGeo(1, 1, 1), M.prod, boxes));
    g.add(instanced(cylGeo(0.033, 0.033, 0.11, 10), M.prod, cans));
  }

  // bags in the well
  const bagList = [
    { p: [-0.62, 0.705, 1.45], ry: 0.2, c: '#1f8a3f' },
    { p: [-0.46, 0.705, 1.6], ry: -0.15, sc: 1.05, c: '#23954a' },
    { p: [-0.28, 0.705, 1.75], ry: 0.35, c: '#1f8a3f' },
    { p: [-0.55, 0.705, 1.82], ry: 0.1, sc: 0.95, h: 0.95, c: '#1a7a36' },
    { p: [-0.18, 0.705, 1.4], ry: -0.4, sc: 0.9, c: '#23954a' },
  ];
  bagInstances(bagList).forEach((m) => g.add(m));
  // bag dispenser arm with hanging bags at +X side of the well
  const bd = b;
  bd.cyl(M.steel, 0.015, 0.015, 0.5, 8, -0.02, 0.705, 1.75);
  bd.box(M.steel, 0.3, 0.015, 0.015, -0.17, 1.17, 1.75);
  const hang = [];
  for (let i = 0; i < 6; i++) hang.push({ p: [-0.28 + i * 0.012, 0.83 + 0.0, 1.75], r: [0, Math.PI / 2, 0], s: [1, 1.15, 0.05], c: BAGGREEN });
  g.add(instanced(bagGeo(), M.bag, hang));

  b.flush(g, true);

  // animation: scrolling belt
  g.userData.open = open;
  if (open) g.userData.update = (dt) => { bt.offset.y = (bt.offset.y + dt * 0.12) % 1; };

  g.traverse((o) => { if (o.isMesh && o.material === beltMat) o.castShadow = false; });
  return g;
}

/* ------------------------------------------------------------------ */
/* SELF CHECKOUT                                                       */
/* ------------------------------------------------------------------ */
function selfScreenTexture() {
  return canvasTex('self-screen', 512, 360, (g, w, h) => {
    g.fillStyle = '#f4f7f5'; g.fillRect(0, 0, w, h);
    g.fillStyle = GREEN; g.fillRect(0, 0, w, 62);
    g.fillStyle = '#fff'; g.font = 'bold 40px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('Kendi Kasan', w / 2, 33);
    g.fillStyle = '#1b2b22'; g.font = 'bold 56px sans-serif'; g.fillText('Ürünü okutun', w / 2, 150);
    g.fillStyle = '#58645d'; g.font = '26px sans-serif'; g.fillText('Barkodu tarayıcıya doğru tutun', w / 2, 200);
    // scan icon
    g.strokeStyle = GREEN; g.lineWidth = 6; g.strokeRect(w / 2 - 50, 222, 100, 50);
    g.strokeStyle = '#e53935'; g.lineWidth = 3; g.beginPath(); g.moveTo(w / 2 - 40, 247); g.lineTo(w / 2 + 40, 247); g.stroke();
    const btn = (x, label, col) => {
      g.fillStyle = col; g.beginPath(); g.roundRect(x, 292, 150, 54, 10); g.fill();
      g.fillStyle = '#fff'; g.font = 'bold 22px sans-serif'; g.fillText(label, x + 75, 320);
    };
    btn(18, 'Poşet Ekle', '#5f6b64'); btn(181, 'Yardım', '#5f6b64'); btn(344, 'Ödemeye Geç', GREEN);
  });
}
export function createSelfCheckout({ seed = 1 } = {}) {
  void seed;
  const g = new THREE.Group(); g.name = 'Self Servis Kasa';
  const b = new Batch();
  const W = 0.9, D = 0.75;
  // cabinet
  b.box(M.dark, W - 0.06, 0.07, D - 0.06, 0, 0, 0);
  b.box(M.lam, W, 0.82, D, 0, 0.07, 0);
  b.box(M.lamEdge, 0.44, 0.04, D, -0.23, 0.89, 0);       // scanner counter
  b.box(M.steel, 0.46, 0.012, 0.02, -0.23, 0.93, D / 2 - 0.01);
  b.box(M.steel, 0.46, 0.012, 0.02, -0.23, 0.93, -D / 2 + 0.01);
  b.box(M.steel, 0.01, 0.012, D - 0.04, -0.455, 0.93, 0);
  // bagging scale platform (recessed) with rim
  b.box(M.steel, 0.42, 0.03, D - 0.04, 0.23, 0.87, 0.0);
  b.box(M.dark, 0.38, 0.012, D - 0.1, 0.23, 0.90, 0.0);
  b.box(M.steel, 0.02, 0.07, D - 0.04, 0.435, 0.9, 0);
  b.box(M.steel, 0.41, 0.07, 0.02, 0.23, 0.9, -D / 2 + 0.03);
  // front: receipt slot + green panel
  b.box(M.green, W + 0.002, 0.30, 0.006, 0, 0.2, D / 2 + 0.003);
  b.box(M.black, 0.16, 0.025, 0.012, 0.0, 0.62, D / 2 + 0.006);
  b.box(M.paper, 0.1, 0.05, 0.006, 0.0, 0.64, D / 2 + 0.014);
  // scanner
  b.box(M.steel, 0.28, 0.004, 0.2, -0.24, 0.93, 0.05);
  b.box(M.glass, 0.24, 0.006, 0.16, -0.24, 0.934, 0.05);
  b.box(M.laser, 0.2, 0.002, 0.004, -0.24, 0.94, 0.03);
  // screen pillar
  b.box(M.black, 0.1, 0.55, 0.08, -0.15, 0.93, -0.3);
  b.box(M.black, 0.5, 0.045, 0.045, -0.15, 1.43, -0.3, {});
  // card terminal on bracket
  b.cyl(M.black, 0.04, 0.045, 0.012, 12, -0.05, 0.93, 0.26);
  b.cyl(M.black, 0.012, 0.012, 0.09, 8, -0.05, 0.93, 0.26);
  // bag hook post (right rear) with two hook arms
  b.box(M.steel, 0.025, 0.55, 0.025, 0.42, 0.93, -0.28);
  b.box(M.steel, 0.2, 0.014, 0.014, 0.32, 1.38, -0.28);
  b.box(M.steel, 0.014, 0.05, 0.014, 0.23, 1.35, -0.28);
  b.box(M.steel, 0.2, 0.014, 0.014, 0.32, 1.22, -0.28);
  b.box(M.steel, 0.014, 0.05, 0.014, 0.23, 1.19, -0.28);
  // status light pole on top of screen housing
  b.cyl(M.steel, 0.012, 0.012, 0.27, 8, -0.36, 1.46, -0.3);
  b.flush(g, true);
  // lamp (status light)
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.09, 12), M.lampGreen);
  lamp.position.set(-0.36, 1.78, -0.3); g.add(lamp);
  // screen (tilted toward +Z / up)
  const scr = makeScreenUnit(0.5, 0.36, selfScreenTexture(), 0.04);
  scr.position.set(-0.15, 1.62, -0.28); scr.rotateX(-0.22);
  g.add(scr);
  // card terminal head
  const tm = makeScreenUnit(0.085, 0.14, termTexture(true), 0.03);
  tm.position.set(-0.05, 1.05, 0.26); tm.rotation.set(0, 0.0, 0); tm.rotateX(-0.6);
  g.add(tm);
  // label on front panel
  g.add(plane(0.7, 0.1, flatMat(labelTexture('KENDİ KASAN', { width: 512, height: 80, bg: GREEN, fg: '#fff', font: 'bold 54px sans-serif' })), 0, 0.2, D / 2 + 0.0065 + 0.002));
  // a bag hanging on the hook
  const bags = bagInstances([{ p: [0.235, 1.33 - 0.05, -0.28], ry: Math.PI / 2, sc: 0.95, c: BAGGREEN }]);
  bags.forEach((m) => g.add(m));
  return g;
}

/* ------------------------------------------------------------------ */
/* CUSTOMER SERVICE DESK                                               */
/* ------------------------------------------------------------------ */
export function createCustomerServiceDesk({ length = 3.0 } = {}) {
  const L = length;
  const g = new THREE.Group(); g.name = 'Müşteri Hizmetleri Masası';
  const b = new Batch();
  const ZW = -0.76;
  // backdrop wall
  b.box(M.lam, L, 2.5, 0.08, 0, 0, ZW);
  b.box(M.green, L, 0.22, 0.09, 0, 0, ZW);                 // dado
  b.box(M.steel, L, 0.02, 0.1, 0, 2.5, ZW);
  // back counter with shelf
  b.box(M.dark, L - 0.4, 0.07, 0.36, 0, 0, -0.52);
  b.box(M.lam, L - 0.4, 0.78, 0.4, 0, 0.07, -0.54);
  b.box(M.lamEdge, L - 0.36, 0.035, 0.44, 0, 0.85, -0.54);
  b.box(M.steel, 0.02, 0.8, 0.02, -L / 2 + 0.25, 0.9, -0.7).box(M.steel, 0.02, 0.8, 0.02, L / 2 - 0.25, 0.9, -0.7);
  b.box(M.white, L - 0.5, 0.02, 0.3, 0, 1.3, -0.6);
  b.box(M.white, L - 0.5, 0.02, 0.3, 0, 1.65, -0.6);
  // front desk: staff work surface + raised customer ledge
  const zf0 = 0.0, zf1 = 0.78;
  b.box(M.dark, L - 0.1, 0.07, zf1 - zf0 - 0.05, 0, 0, (zf0 + zf1) / 2 - 0.02);
  b.box(M.lam, L, 0.69, zf1 - zf0, 0, 0.07, (zf0 + zf1) / 2);
  b.box(M.lamEdge, L, 0.04, zf1 - zf0, 0, 0.76, (zf0 + zf1) / 2);          // work surface (0.80)
  b.box(M.lam, L, 0.30, 0.34, 0, 0.8, zf1 - 0.17);                         // raised block to 1.10
  b.box(M.green, L + 0.02, 0.05, 0.38, 0, 1.1, zf1 - 0.17);
  b.box(M.steel, L + 0.03, 0.018, 0.4, 0, 1.15, zf1 - 0.17);
  b.box(M.green, L - 0.04, 0.62, 0.008, 0, 0.18, zf1 + 0.004);
  // end gables
  b.box(M.lam, 0.04, 1.15, 0.8, -L / 2 + 0.02, 0, 0.4).box(M.lam, 0.04, 1.15, 0.8, L / 2 - 0.02, 0, 0.4);
  // monitor stand, keyboard, printer, bell, brochure holder
  const mx = 0.55;
  b.cyl(M.black, 0.08, 0.09, 0.015, 14, mx, 0.8, 0.28);
  b.box(M.black, 0.04, 0.17, 0.03, mx, 0.8, 0.27);
  b.rbox(M.black, 0.14, 0.018, 0.44, 0.005, mx, 0.8, 0.46, {});
  b.rbox(M.plastic, 0.2, 0.12, 0.2, 0.01, -0.5, 0.8, 0.28);
  b.cyl(M.steel, 0.05, 0.055, 0.04, 14, 0.2, 1.168, 0.74);
  b.box(M.steel, 0.014, 0.02, 0.014, 0.2, 1.208, 0.74);
  b.box(M.steel, 0.2, 0.012, 0.1, -0.7, 1.168, 0.72).box(M.white, 0.19, 0.12, 0.012, -0.7, 1.18, 0.7, { rx: -0.2 });
  b.rbox(M.plastic, 0.3, 0.02, 0.28, 0.01, 0.0, 0.8, 0.5).box(M.black, 0.1, 0.012, 0.012, -0.0, 0.82, 0.37);
  b.flush(g, true);
  // texture-printed items
  const signW = Math.min(L - 0.4, 2.4);
  g.add(plane(signW, 0.4, flatMat(labelTexture('MÜŞTERİ HİZMETLERİ', { width: 1024, height: 160, bg: GREEN, fg: '#fff', font: 'bold 100px sans-serif', border: '#ffffff' })), 0, 2.1, ZW + 0.0415 + 0.005));
  const pq = [['BİLGİ', 0], ['İADE & DEĞİŞİM', 1], ['FATURA', 2]];
  const pw = Math.min(0.8, (L - 0.5) / 3 - 0.08);
  pq.forEach(([t, i]) => g.add(plane(pw, 0.16, flatMat(labelTexture(t, { width: 320, height: 64, bg: '#f1f1ee', fg: '#1b4d2b', font: 'bold 36px sans-serif', border: GREEN })), (i - 1) * (pw + 0.1), 1.82, ZW + 0.0415 + 0.005)));
  g.add(plane(L - 0.04, 0.12, flatMat(labelTexture('BEREKET MARKET · Alışverişin Bereketli Hali', { width: 1024, height: 96, bg: GREEN, fg: '#fff', font: 'bold 56px sans-serif' })), 0, 0.17 + 0.62 - 0.1, zf1 + 0.0085));
  // monitor (faces +Z, toward customer? no: toward staff -> screen faces -Z side is staff; we show it facing the staff i.e. -Z, back to customer)
  const mon = makeScreenUnit(0.5, 0.31, canvasTex('desk-mon', 512, 320, (c, w, h) => {
    c.fillStyle = '#12202b'; c.fillRect(0, 0, w, h);
    c.fillStyle = GREEN; c.fillRect(0, 0, w, 44);
    c.fillStyle = '#fff'; c.font = 'bold 26px sans-serif'; c.textBaseline = 'middle'; c.textAlign = 'left'; c.fillText('Müşteri Hizmetleri', 16, 23);
    c.fillStyle = '#dce6ee'; c.font = '24px sans-serif';
    ['İade / Değişim', 'Fatura Sorgulama', 'Hediye Kartı', 'Kayıp Eşya'].forEach((s, i) => { c.fillStyle = i % 2 ? '#1a2d3b' : '#16252f'; c.fillRect(0, 70 + i * 56, w, 50); c.fillStyle = '#dce6ee'; c.fillText(s, 20, 96 + i * 56); });
  }), 0.03);
  mon.position.set(mx, 1.065, 0.27); mon.rotation.y = Math.PI; mon.rotateX(-0.08);
  g.add(mon);
  g.add(plane(0.15, 0.14, flatMat(labelTexture('ZİL', { width: 128, height: 128, bg: '#f2b705', fg: '#111', font: 'bold 56px sans-serif' })), 0.2, 1.214, 0.74, 0, -Math.PI / 2));
  // parcels on the shelves (instanced)
  const rng = seededRandom(11);
  const parcels = [];
  const n = Math.max(4, Math.floor((L - 0.7) / 0.32));
  for (let i = 0; i < n; i++) {
    const w = 0.2 + rng() * 0.1, h = 0.12 + rng() * 0.12, d = 0.18 + rng() * 0.08;
    parcels.push({ p: [-L / 2 + 0.4 + i * ((L - 0.8) / Math.max(1, n - 1)), 1.31 + h / 2, -0.6], r: [0, (rng() - 0.5) * 0.3, 0], s: [w, h, d], c: pick(rng, ['#b58b5a', '#a67c4e', '#c79a68', '#e8e1d2']) });
  }
  for (let i = 0; i < n - 1; i++) {
    const w = 0.16 + rng() * 0.08, h = 0.14 + rng() * 0.1;
    parcels.push({ p: [-L / 2 + 0.55 + i * ((L - 1.1) / Math.max(1, n - 2)), 1.66 + h / 2, -0.6], r: [0, (rng() - 0.5) * 0.3, 0], s: [w, h, 0.2], c: pick(rng, ['#2f9a4f', '#e8e1d2', '#b58b5a', '#1565c0']) });
  }
  g.add(instanced(boxGeo(1, 1, 1), M.prod, parcels));
  // staff stool
  const ch = makeChair(0.62);
  ch.position.set(-0.5, 0, -0.1); ch.rotation.y = 0.5;
  g.add(ch);
  return g;
}

/* ------------------------------------------------------------------ */
export function showcase() {
  const g = new THREE.Group(); g.name = 'Kasalar Showcase';
  const l1 = createCheckoutLane({ laneNumber: 1, seed: 1, open: true }); l1.position.set(-1.3, 0, 0);
  const l2 = createCheckoutLane({ laneNumber: 2, seed: 2, open: false }); l2.position.set(1.3, 0, 0);
  const sc = createSelfCheckout({ seed: 1 }); sc.position.set(3.8, 0, 0.5);
  const dk = createCustomerServiceDesk({ length: 3.0 }); dk.position.set(7.0, 0, 0.3);
  g.add(l1, l2, sc, dk);
  g.userData.update = (dt, ctx) => { l1.userData.update && l1.userData.update(dt, ctx); };
  return g;
}
