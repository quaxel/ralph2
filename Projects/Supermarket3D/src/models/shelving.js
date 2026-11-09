// Shelving: gondolas, end caps, wall shelves and hanging aisle signs for "Bereket Market".
// Products are InstancedMesh (one per product type per unit) sharing ONE packaging atlas material.
// Per-instance brand cell is packed into the (otherwise unused) bottom row of each instance matrix
// (elements 3 and 7) and decoded in the vertex shader (see patchInstancedUV).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { seededRandom, pick, stdMat, labelTexture, setShadows } from './common.js';

/* ------------------------------------------------------------------ */
/* Palette / categories                                               */
/* ------------------------------------------------------------------ */
const C = {
  red: '#e53935', orange: '#fb8c00', yellow: '#fdd835', green: '#43a047', lime: '#9ccc3a',
  blue: '#1e88e5', navy: '#3f5fd0', purple: '#8e24aa', teal: '#00acc1', pink: '#ec407a',
  brown: '#8d5a3b', cream: '#f3e3b5', silver: '#cfd8dc', black: '#546270', white: '#f4f4f4',
};
const P = (...k) => k.map((x) => C[x]);

const CATS = {
  snacks:   { name: 'ATIŞTIRMALIK',       color: '#e8710a', types: ['chips', 'chips', 'chips', 'cookie', 'cookie', 'choco', 'choco', 'wafer'] },
  beverages:{ name: 'İÇECEKLER',          color: '#1b6fb5', types: ['pet05', 'pet05', 'pet15', 'pet15', 'can', 'can', 'canTall', 'juice', 'juice'] },
  canned:   { name: 'KONSERVE',           color: '#b3261e', types: ['tin', 'tin', 'tinTall', 'jar', 'jar', 'jarTall'] },
  pasta:    { name: 'MAKARNA & BAKLİYAT', color: '#c0830a', types: ['pasta', 'pasta', 'riceBag', 'flour', 'lentil', 'lentil', 'paste'] },
  cereal:   { name: 'KAHVALTILIK',        color: '#2e8b57', types: ['cereal', 'cereal', 'tea', 'tea', 'coffee', 'honey', 'honey', 'jam'] },
  cleaning: { name: 'TEMİZLİK',           color: '#0e8fa8', types: ['jug', 'jug', 'jugBig', 'spray', 'spray', 'tp'] },
  personal: { name: 'KİŞİSEL BAKIM',      color: '#8e44ad', types: ['shampoo', 'shampoo', 'shampooB', 'paste2', 'paste2', 'soap', 'deo'] },
  grocery:  { name: 'GIDA',               color: '#c62f2f', types: ['chips', 'cookie', 'pet15', 'can', 'juice', 'tin', 'jar', 'pasta', 'riceBag', 'cereal', 'honey', 'tea', 'spray', 'lentil'] },
};

const BRANDS = [
  ['Lezzet', 'Tam Lezzet'], ['Doğa', '%100 Doğal'], ['Anadolu', 'Geleneksel'], ['Sofra', 'Her Sofraya'],
  ['Bereket', 'Bereketli'], ['Yayla', 'Taze & Süzme'], ['Ege', 'Akdeniz Tadı'], ['Çiftlik', 'Çiftlikten'],
];

/* ------------------------------------------------------------------ */
/* Textures (lazy, shared)                                            */
/* ------------------------------------------------------------------ */
const PLAIN = [0.955, 0.5];   // tinted plain texel
const METAL = [0.985, 0.5];   // untinted silver texel
let _atlas = null, _tagAtlas = null, _peg = null;

function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

function drawCell(g, mode, b, wrap, ox, oy, S) {
  const A = (art, mask) => (mode === 'art' ? art : (mask ? '#ffffff' : '#000000'));
  g.save();
  g.translate(ox, oy);
  g.beginPath(); g.rect(0, 0, S, S); g.clip();
  g.fillStyle = A('#ffffff', 1); g.fillRect(0, 0, S, S);
  g.fillStyle = A('#b4b4b4', 1); g.fillRect(0, 0, S, S * 0.13); g.fillRect(0, S * 0.87, S, S * 0.13);
  const cx = wrap ? S * 0.5 : S * 0.47;
  const lw = wrap ? S * 0.44 : S * 0.80;
  const style = b % 4;
  const sx = wrap ? 0.55 : 1.25;
  if (style === 2) {
    g.fillStyle = A('#c4c4c4', 1);
    g.beginPath(); g.moveTo(0, S * 0.87); g.lineTo(S * 0.55, S * 0.87); g.lineTo(0, S * 0.35); g.closePath(); g.fill();
  }
  if (style === 1 || style === 3) {
    g.fillStyle = A('#8f8f8f', 1);
    g.fillRect(0, S * 0.25, S, S * 0.05); g.fillRect(0, S * 0.70, S, S * 0.05);
  }
  g.fillStyle = A('#ffffff', 0);
  if (style === 0 || style === 2) {
    g.beginPath(); g.ellipse(cx, S * 0.5, lw / 2, S * 0.2, 0, 0, Math.PI * 2); g.fill();
  } else {
    const x = cx - lw / 2, y = S * 0.32, w = lw, h = S * 0.36, r = S * 0.05;
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); g.fill();
    if (style === 3) { g.strokeStyle = A('#7a7a7a', 1); g.lineWidth = S * 0.015; g.stroke(); }
  }
  // brand text
  const drawText = (txt, y, size, fill, maxW) => {
    g.save(); g.translate(cx, y); g.scale(sx, 1);
    let s = size; g.font = `bold ${s}px "DejaVu Sans", Arial, sans-serif`;
    let w = g.measureText(txt).width * sx;
    if (w > maxW) { s *= maxW / w; g.font = `bold ${s}px "DejaVu Sans", Arial, sans-serif`; }
    g.fillStyle = fill; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, 0, 0); g.restore();
  };
  drawText(BRANDS[b][0], S * 0.45, S * 0.15, A('#1b1b1b', 0), lw * 0.86);
  drawText(BRANDS[b][1], S * 0.59, S * 0.07, A('#444444', 0), lw * 0.78);
  if (b % 2 === 0) {
    const bx = cx + (wrap ? S * 0.17 : S * 0.3);
    g.fillStyle = A('#e53935', 0);
    g.beginPath(); g.ellipse(bx, S * 0.27, S * (wrap ? 0.045 : 0.075), S * 0.075, 0, 0, Math.PI * 2); g.fill();
    g.save(); g.translate(bx, S * 0.27); g.scale(sx, 1);
    g.font = `bold ${S * 0.05}px "DejaVu Sans", Arial, sans-serif`; g.fillStyle = A('#ffffff', 0);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('YENİ', 0, 0, wrap ? S * 0.07 : S * 0.1); g.restore();
  }
  // plain strip at the right edge: tinted plain, then untinted silver
  g.fillStyle = A('#ffffff', 1); g.fillRect(S * 0.94, 0, S * 0.03, S);
  g.fillStyle = A('#c9ced3', 0); g.fillRect(S * 0.97, 0, S * 0.03, S);
  g.restore();
}

function getAtlas() {
  if (_atlas) return _atlas;
  const SZ = 1024, S = 256;
  const make = (mode) => {
    const c = makeCanvas(SZ, SZ); const g = c.getContext('2d');
    for (let b = 0; b < 8; b++) {
      const col = b % 4, row = Math.floor(b / 4);
      drawCell(g, mode, b, false, col * S, row * S, S);
      drawCell(g, mode, b, true, col * S, (row + 2) * S, S);
    }
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = 4;
    return t;
  };
  const map = make('art'); map.colorSpace = THREE.SRGBColorSpace;
  const mask = make('mask'); mask.colorSpace = THREE.NoColorSpace;
  _atlas = { map, mask };
  return _atlas;
}

const PRICES = ['4,95', '7,50', '9,95', '12,90', '14,75', '17,50', '19,90', '24,90', '27,95', '32,50', '39,90', '44,95', '54,90', '64,50', '79,90', '129,00'];
function getTagAtlas() {
  if (_tagAtlas) return _tagAtlas;
  const c = makeCanvas(512, 512); const g = c.getContext('2d'); const S = 128;
  PRICES.forEach((p, i) => {
    const ox = (i % 4) * S, oy = Math.floor(i / 4) * S;
    g.fillStyle = '#ffffff'; g.fillRect(ox, oy, S, S);
    g.strokeStyle = '#b8b8b8'; g.lineWidth = 3; g.strokeRect(ox + 2, oy + 2, S - 4, S - 4);
    g.save(); g.translate(ox + S / 2, oy + S * 0.5); g.scale(0.72, 1);
    g.fillStyle = '#111'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 56px "DejaVu Sans", Arial, sans-serif'; g.fillText(p, -4, 4, 150);
    g.restore();
    g.fillStyle = '#222'; g.font = 'bold 16px "DejaVu Sans", Arial, sans-serif'; g.textAlign = 'right'; g.fillText('TL', ox + S - 8, oy + 20);
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  _tagAtlas = t; return t;
}

function getPeg() {
  if (_peg) return _peg;
  const c = makeCanvas(128, 128); const g = c.getContext('2d');
  g.fillStyle = '#8a97a4'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#3a4550';
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.beginPath(); g.arc(16 + x * 32, 16 + y * 32, 4.5, 0, Math.PI * 2); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  _peg = t; return t;
}

/* ------------------------------------------------------------------ */
/* Shared materials                                                   */
/* ------------------------------------------------------------------ */
const FIX = (chunk) => chunk.split('instanceMatrix * ').join('bkIM * ');

function patchInstancedUV(mat, key, maskTex) {
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <uv_vertex>', `#include <uv_vertex>
#ifdef USE_INSTANCING
  mat4 bkIM = mat4( vec4( instanceMatrix[0].xyz, 0.0 ), vec4( instanceMatrix[1].xyz, 0.0 ), vec4( instanceMatrix[2].xyz, 0.0 ), instanceMatrix[3] );
  vMapUv = vMapUv * 0.25 + vec2( instanceMatrix[0].w, instanceMatrix[1].w );
#endif`)
      .replace('#include <project_vertex>', FIX(THREE.ShaderChunk.project_vertex))
      .replace('#include <worldpos_vertex>', FIX(THREE.ShaderChunk.worldpos_vertex));
    if (maskTex) {
      shader.uniforms.maskMap = { value: maskTex };
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D maskMap;')
        .replace('#include <color_fragment>', `float bkMask = texture2D( maskMap, vMapUv ).r;
  #if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )
  diffuseColor.rgb *= mix( vec3( 1.0 ), vColor.rgb, bkMask );
  #endif`);
    }
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}

let _productMat = null, _tagMat = null, _pegMat = null;
function productMat() {
  if (!_productMat) {
    const a = getAtlas();
    _productMat = new THREE.MeshStandardMaterial({ map: a.map, vertexColors: true, roughness: 0.55, metalness: 0.05 });
    patchInstancedUV(_productMat, 'bk-product', a.mask);
  }
  return _productMat;
}
function tagMat() {
  if (!_tagMat) {
    _tagMat = new THREE.MeshStandardMaterial({ map: getTagAtlas(), roughness: 0.5 });
    patchInstancedUV(_tagMat, 'bk-tag', null);
  }
  return _tagMat;
}
function pegMat() { return _pegMat || (_pegMat = new THREE.MeshStandardMaterial({ map: getPeg(), roughness: 0.7, metalness: 0.1 })); }

const MAT = {
  shelf: () => stdMat('#d5d9dd', { roughness: 0.4, metalness: 0.35 }),
  up: () => stdMat('#4b5560', { roughness: 0.5, metalness: 0.3 }),
  base: () => stdMat('#2d343c', { roughness: 0.6 }),
  strip: () => stdMat('#f1f1ec', { roughness: 0.5 }),
  peg: pegMat,
  cable: () => stdMat('#2a2a2a', { roughness: 0.5, metalness: 0.5 }),
};

/* ------------------------------------------------------------------ */
/* Product geometries                                                 */
/* ------------------------------------------------------------------ */
function paintAll(g, r, gr, b) {
  const n = g.attributes.position.count; const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = r; a[i * 3 + 1] = gr; a[i * 3 + 2] = b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
}
function paintY(g, fn) {
  const p = g.attributes.position, n = p.count; const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const c = fn(p.getY(i)); a[i * 3] = c; a[i * 3 + 1] = c; a[i * 3 + 2] = c; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
}
function plainAll(g, pt) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pt[0], pt[1]);
}
/** Maps the +Z face of a (segmented) BoxGeometry to the label area; every other face gets the plain texel. */
function mapFront(g, w, h, sx = 1, sy = 1, sz = 1) {
  const uv = g.attributes.uv;
  const nPx = (sz + 1) * (sy + 1), nPy = (sx + 1) * (sz + 1), nPz = (sx + 1) * (sy + 1);
  const start = nPx * 2 + nPy * 2, end = start + nPz;
  const a = w / h, A = 0.8;
  let u0 = 0.02, u1 = 0.92, v0 = 0.02, v1 = 0.98;
  if (a < A) { const cu = a / A, c = 0.47, hw = 0.45 * cu; u0 = c - hw; u1 = c + hw; }
  else { const cv = A / a, hh = 0.48 * cv; v0 = 0.5 - hh; v1 = 0.5 + hh; }
  for (let i = 0; i < uv.count; i++) {
    if (i >= start && i < end) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
    else uv.setXY(i, PLAIN[0], PLAIN[1]);
  }
}
function boxPart(w, h, d, x, y, z, col, label) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y + h / 2, z);
  paintAll(g, col, col, col);
  if (label) mapFront(g, w, h); else plainAll(g, PLAIN);
  return g;
}
function pillow(w, h, d, sx = 4, sy = 4) {
  const g = new THREE.BoxGeometry(w, h, d, sx, sy, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const nx = Math.abs(p.getX(i) / (w / 2)), ny = Math.abs(p.getY(i) / (h / 2));
    const t = (1 - 0.72 * Math.pow(nx, 2.2)) * (1 - 0.88 * Math.pow(ny, 4));
    p.setZ(i, p.getZ(i) * Math.max(t, 0.06));
  }
  g.computeVertexNormals();
  g.translate(0, h / 2, 0);
  paintAll(g, 1, 1, 1);
  mapFront(g, w, h, sx, sy, 1);
  return g;
}
function lathe(pts, seg = 10) {
  const g = new THREE.LatheGeometry(pts.map((q) => new THREE.Vector2(q[0], q[1])), seg);
  g.rotateY(Math.PI);
  return g;
}
/** label wraps y in [y0,y1]; elsewhere plain/metal. */
function wrapUV(g, y0, y1, other) {
  const p = g.attributes.position, uv = g.attributes.uv, e = 1e-5;
  for (let i = 0; i < uv.count; i++) {
    const y = p.getY(i);
    if (y >= y0 - e && y <= y1 + e) uv.setXY(i, uv.getX(i) * 0.92 + 0.01, 0.03 + 0.94 * (y - y0) / (y1 - y0));
    else uv.setXY(i, other[0], other[1]);
  }
}
function canGeo(r, h, seg = 10) {
  const g = lathe([[0, 0], [r * 0.94, 0], [r, 0.005], [r, h - 0.005], [r * 0.94, h], [0, h]], seg);
  wrapUV(g, 0.005, h - 0.005, METAL); paintAll(g, 1, 1, 1); return g;
}
function jarGeo(r, hb, lidH, lidCol, seg = 10, lidR = 0.9) {
  const g = lathe([[0, 0], [r * 0.9, 0], [r, 0.006], [r, hb], [r * lidR, hb + 0.004], [r * lidR, hb + lidH], [0, hb + lidH]], seg);
  wrapUV(g, 0.006, hb, PLAIN);
  paintY(g, (y) => (y > hb + 0.003 ? lidCol : 1));
  return g;
}
function petGeo(r, H, seg = 10) {
  const hb = H * 0.7;
  const g = lathe([[0, 0], [r * 0.9, 0], [r, 0.01], [r, hb], [r * 0.42, hb + 0.05], [r * 0.4, H - 0.02], [r * 0.47, H - 0.02], [r * 0.47, H], [0, H]], seg);
  wrapUV(g, 0.01, hb, PLAIN);
  paintY(g, (y) => (y > H - 0.0205 ? 0.35 : 1));
  return g;
}
function merge(list) { return mergeGeometries(list, false); }

// type table: w/h/d = native size (m), wrap = cylindrical label, rows = max depth rows, low = prefers bottom shelf
const TYPES = {
  chips:   { w: 0.20, h: 0.28, d: 0.07, rows: 2, pal: P('red', 'orange', 'yellow', 'green', 'blue', 'purple', 'teal', 'pink'), build: () => pillow(0.20, 0.28, 0.07) },
  cookie:  { w: 0.17, h: 0.21, d: 0.05, rows: 3, pal: P('brown', 'red', 'blue', 'yellow', 'orange', 'pink', 'cream'), build: () => boxPart(0.17, 0.21, 0.05, 0, 0, 0, 1, true) },
  choco:   { w: 0.085, h: 0.18, d: 0.02, rows: 4, pal: P('brown', 'red', 'purple', 'blue', 'pink', 'orange', 'green'), build: () => boxPart(0.085, 0.18, 0.02, 0, 0, 0, 1, true) },
  wafer:   { w: 0.22, h: 0.085, d: 0.10, rows: 3, stack: 3, pal: P('yellow', 'red', 'brown', 'orange', 'pink'), build: () => boxPart(0.22, 0.085, 0.10, 0, 0, 0, 1, true) },
  pet05:   { w: 0.07, h: 0.22, d: 0.07, wrap: 1, rows: 2, pal: P('blue', 'teal', 'red', 'green', 'orange', 'yellow', 'purple'), build: () => petGeo(0.035, 0.22) },
  pet15:   { w: 0.095, h: 0.31, d: 0.095, wrap: 1, rows: 2, low: 1, pal: P('blue', 'red', 'green', 'orange', 'teal', 'purple', 'yellow'), build: () => petGeo(0.0475, 0.31) },
  can:     { w: 0.066, h: 0.122, d: 0.066, wrap: 1, rows: 3, pal: P('red', 'silver', 'blue', 'green', 'black', 'yellow', 'orange'), build: () => canGeo(0.033, 0.122) },
  canTall: { w: 0.058, h: 0.17, d: 0.058, wrap: 1, rows: 2, pal: P('black', 'teal', 'lime', 'pink', 'orange', 'navy'), build: () => canGeo(0.029, 0.17) },
  juice:   { w: 0.095, h: 0.21, d: 0.065, rows: 3, pal: P('orange', 'red', 'green', 'yellow', 'purple', 'pink', 'lime'),
    build: () => merge([boxPart(0.095, 0.185, 0.065, 0, 0, 0, 1, true), boxPart(0.095, 0.02, 0.03, 0, 0.185, 0, 0.9, false), boxPart(0.03, 0.012, 0.012, 0.022, 0.205, 0, 0.35, false)]) },
  tin:     { w: 0.08, h: 0.10, d: 0.08, wrap: 1, rows: 3, pal: P('red', 'green', 'silver', 'yellow', 'brown', 'orange'), build: () => canGeo(0.04, 0.10, 12) },
  tinTall: { w: 0.085, h: 0.12, d: 0.085, wrap: 1, rows: 2, pal: P('orange', 'green', 'red', 'yellow', 'cream'), build: () => canGeo(0.0425, 0.12, 12) },
  jar:     { w: 0.078, h: 0.12, d: 0.078, wrap: 1, rows: 2, pal: P('red', 'green', 'yellow', 'orange', 'brown', 'purple'), build: () => jarGeo(0.039, 0.10, 0.02, 0.5, 10) },
  jarTall: { w: 0.07, h: 0.18, d: 0.07, wrap: 1, rows: 2, pal: P('green', 'lime', 'red', 'orange', 'yellow'), build: () => jarGeo(0.035, 0.15, 0.03, 0.55, 10) },
  pasta:   { w: 0.12, h: 0.24, d: 0.04, rows: 2, pal: P('yellow', 'red', 'orange', 'cream', 'brown', 'green', 'white'), build: () => pillow(0.12, 0.24, 0.04, 3, 4) },
  riceBag: { w: 0.17, h: 0.28, d: 0.075, rows: 2, low: 1, pal: P('white', 'cream', 'blue', 'green', 'yellow', 'orange'), build: () => pillow(0.17, 0.28, 0.075) },
  flour:   { w: 0.15, h: 0.26, d: 0.09, rows: 2, low: 1, pal: P('white', 'cream', 'blue', 'yellow', 'red'), build: () => boxPart(0.15, 0.26, 0.09, 0, 0, 0, 1, true) },
  lentil:  { w: 0.13, h: 0.21, d: 0.05, rows: 2, pal: P('orange', 'red', 'green', 'brown', 'yellow', 'cream'), build: () => pillow(0.13, 0.21, 0.05, 3, 4) },
  paste:   { w: 0.09, h: 0.10, d: 0.09, wrap: 1, rows: 3, pal: P('red', 'orange', 'green', 'brown'), build: () => jarGeo(0.045, 0.085, 0.02, 0.9, 10, 0.95) },
  cereal:  { w: 0.20, h: 0.29, d: 0.07, rows: 3, pal: P('orange', 'yellow', 'blue', 'red', 'green', 'brown', 'pink'), build: () => boxPart(0.20, 0.29, 0.07, 0, 0, 0, 1, true) },
  tea:     { w: 0.075, h: 0.12, d: 0.07, rows: 3, pal: P('red', 'green', 'brown', 'teal', 'purple', 'orange', 'black'), build: () => boxPart(0.075, 0.12, 0.07, 0, 0, 0, 1, true) },
  coffee:  { w: 0.085, h: 0.14, d: 0.085, wrap: 1, rows: 2, pal: P('brown', 'red', 'black', 'orange', 'cream'), build: () => jarGeo(0.0425, 0.115, 0.025, 0.2, 10, 0.95) },
  honey:   { w: 0.08, h: 0.11, d: 0.08, wrap: 1, rows: 2, pal: P('yellow', 'orange', 'red', 'pink', 'purple', 'green'), build: () => jarGeo(0.04, 0.09, 0.02, 0.95, 10) },
  jam:     { w: 0.07, h: 0.10, d: 0.07, wrap: 1, rows: 2, pal: P('red', 'purple', 'orange', 'pink', 'green'), build: () => jarGeo(0.035, 0.08, 0.018, 0.4, 10) },
  jug:     { w: 0.17, h: 0.27, d: 0.10, rows: 2, pal: P('blue', 'green', 'teal', 'purple', 'orange', 'pink', 'red'),
    build: () => merge([boxPart(0.17, 0.21, 0.10, 0, 0, 0, 1, true), boxPart(0.09, 0.03, 0.075, 0.03, 0.21, 0, 1, false), boxPart(0.05, 0.03, 0.05, 0.04, 0.24, 0, 0.35, false), boxPart(0.03, 0.15, 0.07, -0.065, 0.2, 0, 1, false)]) },
  jugBig:  { w: 0.22, h: 0.33, d: 0.12, rows: 2, low: 1, pal: P('blue', 'green', 'teal', 'purple', 'orange', 'red'),
    build: () => merge([boxPart(0.22, 0.26, 0.12, 0, 0, 0, 1, true), boxPart(0.12, 0.04, 0.09, 0.04, 0.26, 0, 1, false), boxPart(0.06, 0.03, 0.06, 0.05, 0.30, 0, 0.35, false)]) },
  spray:   { w: 0.07, h: 0.27, d: 0.07, wrap: 1, rows: 2, pal: P('teal', 'green', 'blue', 'yellow', 'pink', 'orange'),
    build: () => {
      const b = lathe([[0, 0], [0.03, 0], [0.034, 0.006], [0.034, 0.17], [0.017, 0.2], [0.015, 0.22], [0, 0.22]], 10);
      wrapUV(b, 0.006, 0.17, PLAIN); paintY(b, (y) => (y > 0.215 ? 0.3 : 1));
      const head = boxPart(0.03, 0.04, 0.085, 0, 0.225, 0.02, 0.3, false);
      return merge([b, head]);
    } },
  tp:      { w: 0.34, h: 0.20, d: 0.13, rows: 2, low: 1, pal: P('white', 'blue', 'pink', 'green', 'yellow'), build: () => pillow(0.34, 0.20, 0.13, 4, 3) },
  shampoo: { w: 0.075, h: 0.20, d: 0.045, wrap: 1, rows: 2, pal: P('pink', 'teal', 'purple', 'blue', 'green', 'orange'),
    build: () => { const g = lathe([[0, 0], [0.032, 0], [0.037, 0.008], [0.037, 0.15], [0.018, 0.18], [0.016, 0.195], [0.02, 0.195], [0.02, 0.2], [0, 0.2]], 10); wrapUV(g, 0.008, 0.15, PLAIN); paintY(g, (y) => (y > 0.194 ? 0.3 : 1)); g.scale(1, 1, 0.6); return g; } },
  shampooB:{ w: 0.09, h: 0.25, d: 0.055, wrap: 1, rows: 2, low: 1, pal: P('blue', 'purple', 'pink', 'green', 'orange'),
    build: () => { const g = lathe([[0, 0], [0.039, 0], [0.045, 0.008], [0.045, 0.19], [0.02, 0.225], [0.018, 0.245], [0.025, 0.245], [0.025, 0.25], [0, 0.25]], 10); wrapUV(g, 0.008, 0.19, PLAIN); paintY(g, (y) => (y > 0.244 ? 0.3 : 1)); g.scale(1, 1, 0.6); return g; } },
  paste2:  { w: 0.05, h: 0.17, d: 0.04, rows: 4, pal: P('red', 'blue', 'green', 'teal', 'white', 'orange', 'purple'), build: () => boxPart(0.05, 0.17, 0.04, 0, 0, 0, 1, true) },
  soap:    { w: 0.15, h: 0.04, d: 0.09, rows: 3, stack: 4, pal: P('pink', 'white', 'green', 'blue', 'yellow', 'orange'), build: () => boxPart(0.15, 0.04, 0.09, 0, 0, 0, 1, true) },
  deo:     { w: 0.055, h: 0.16, d: 0.055, wrap: 1, rows: 2, pal: P('blue', 'teal', 'black', 'pink', 'white', 'purple'),
    build: () => { const g = lathe([[0, 0], [0.025, 0], [0.027, 0.005], [0.027, 0.12], [0.024, 0.125], [0.02, 0.13], [0.02, 0.158], [0, 0.158]], 10); wrapUV(g, 0.005, 0.12, METAL); paintY(g, (y) => (y > 0.126 ? 0.3 : 1)); return g; } },
};
for (const id in TYPES) TYPES[id].id = id;
const _geo = {};
function typeGeo(t) { return _geo[t.id] || (_geo[t.id] = t.build()); }

let _tagGeo = null;
function tagGeo() { return _tagGeo || (_tagGeo = new THREE.PlaneGeometry(0.045, 0.028)); }

/* ------------------------------------------------------------------ */
/* Struct (merged static geometry per material)                       */
/* ------------------------------------------------------------------ */
class Struct {
  constructor() { this.parts = new Map(); }
  _push(key, g) { if (!this.parts.has(key)) this.parts.set(key, []); this.parts.get(key).push(g); }
  box(key, w, h, d, x, y, z, uvScale) {
    const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y + h / 2, z);
    if (uvScale) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * uvScale[0], uv.getY(i) * uvScale[1]); }
    this._push(key, g);
  }
  plane(key, w, h, x, y, z, flip) {
    const g = new THREE.PlaneGeometry(w, h); if (flip) g.rotateY(Math.PI); g.translate(x, y, z); this._push(key, g);
  }
  build(group, matOf) {
    for (const [key, list] of this.parts) {
      const m = new THREE.Mesh(mergeGeometries(list, false), matOf(key));
      m.name = key; setShadows(m, true, true); group.add(m);
      list.forEach((g) => g.dispose());
    }
  }
}

/* ------------------------------------------------------------------ */
/* Shelf stocking                                                     */
/* ------------------------------------------------------------------ */
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

class Stock {
  constructor(rng, category) {
    this.rng = rng;
    this.cat = CATS[category] || CATS.grocery;
    this.items = new Map(); // type id -> records
    this.tags = [];
    this.lowTypes = this.cat.types.filter((id) => TYPES[id].low);
  }
  chooseType(level) {
    const r = this.rng;
    if (level === 0 && this.lowTypes.length && r() < 0.65) return TYPES[pick(r, this.lowTypes)];
    return TYPES[pick(r, this.cat.types)];
  }
  add(type, x, y, z, yaw, s, color, brand) {
    _q.setFromAxisAngle(_up, yaw); _p.set(x, y, z); _s.set(s, s, s);
    _m.compose(_p, _q, _s);
    let l = this.items.get(type.id); if (!l) { l = []; this.items.set(type.id, l); }
    const row = Math.floor(brand / 4) + (type.wrap ? 2 : 0);
    l.push({ m: _m.toArray(), c: color, u: (brand % 4) * 0.25, v: 1 - (row + 1) * 0.25 });
  }
  addTag(x, y, z, sg, color, cell) {
    _q.setFromAxisAngle(_up, sg < 0 ? Math.PI : 0); _p.set(x, y, z); _s.set(1, 1, 1);
    _m.compose(_p, _q, _s);
    this.tags.push({ m: _m.toArray(), c: color, u: (cell % 4) * 0.25, v: 1 - (Math.floor(cell / 4) + 1) * 0.25 });
  }
  /** o: x0,x1 (usable range), y (shelf top), sg (+1/-1), F (front edge |z|), D (shelf depth), clear, level */
  shelf(o) {
    const rng = this.rng, GAP = 0.004;
    let cx = o.x0, guard = 0;
    while (o.x1 - cx > 0.05 && guard++ < 40) {
      if (rng() < 0.05) { cx += 0.04 + rng() * 0.09; continue; }
      let type = null;
      for (let t = 0; t < 4; t++) { const c = this.chooseType(o.level); if (c.w * 0.95 <= o.x1 - cx) { type = c; break; } }
      if (!type) break;
      const k0 = type.stack ? 1 + Math.floor(rng() * type.stack) : 1;
      const s = Math.min(o.clear * 0.96 / (type.h * k0), 0.97 + rng() * 0.08);
      const w = type.w * s, d = type.d * s, h = type.h * s;
      const k = type.stack ? Math.max(1, Math.min(k0, Math.floor(o.clear * 0.96 / h))) : 1;
      const nMax = Math.floor((o.x1 - cx + GAP) / (w + GAP));
      const facingMax = w < 0.08 ? 5 : w < 0.12 ? 4 : w < 0.2 ? 3 : 2;
      const n = Math.max(1, Math.min(nMax, 1 + Math.ceil(rng() * facingMax)));
      const col = new THREE.Color(pick(rng, type.pal));
      const brand = Math.floor(rng() * 8);
      const rows = Math.max(1, Math.min(type.rows, Math.floor((o.D - 0.05) / d)));
      for (let i = 0; i < n; i++) {
        const x = cx + w / 2 + i * (w + GAP);
        for (let r = 0; r < rows; r++) {
          if (r > 0 && rng() < 0.1) continue;
          if (r === 0 && rng() < 0.02) continue;
          const pull = r === 0 && rng() < 0.1 ? 0.008 + rng() * 0.02 : 0;
          const z = o.sg * (o.F - 0.04 - d * (r + 0.5) - r * 0.004 + pull);
          const yaw = (o.sg < 0 ? Math.PI : 0) + (rng() < 0.12 ? (rng() - 0.5) * Math.min(0.3, 0.03 / w) : (rng() - 0.5) * 0.04);
          const kk = r === 0 ? k : Math.max(1, k - (rng() < 0.4 ? 1 : 0));
          for (let j = 0; j < kk; j++) this.add(type, x, o.y + j * h, z, yaw, s, col, brand);
        }
      }
      const tc = rng() < 0.8 ? '#ffffff' : (rng() < 0.6 ? '#ffe135' : '#ff5a48');
      this.addTag(cx + (n * (w + GAP) - GAP) / 2, o.y - 0.013, o.sg * (o.F + 0.0108), o.sg, new THREE.Color(tc), Math.floor(rng() * 16));
      cx += n * (w + GAP) + 0.003;
    }
  }
  build(group) {
    const make = (geo, mat, recs, name) => {
      const mesh = new THREE.InstancedMesh(geo, mat, recs.length);
      const col = new THREE.Color();
      recs.forEach((r, i) => { _m.fromArray(r.m); mesh.setMatrixAt(i, _m); mesh.setColorAt(i, col.copy(r.c)); });
      mesh.computeBoundingBox(); mesh.computeBoundingSphere();   // before the uv-offset packing below
      const a = mesh.instanceMatrix.array;
      recs.forEach((r, i) => { a[i * 16 + 3] = r.u; a[i * 16 + 7] = r.v; });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.name = name; mesh.castShadow = false; mesh.receiveShadow = true;
      group.add(mesh);
    };
    for (const [id, recs] of this.items) if (recs.length) make(typeGeo(TYPES[id]), productMat(), recs, 'prod_' + id);
    if (this.tags.length) make(tagGeo(), tagMat(), this.tags, 'priceTags');
  }
}

/* ------------------------------------------------------------------ */
/* Generic shelving unit builder                                      */
/* ------------------------------------------------------------------ */
const _headerMats = new Map();
function textMat(text, w, h, bg, fg, fontPx) {
  const key = `${text}|${w}|${h}|${bg}|${fg}`;
  let m = _headerMats.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ map: labelTexture(text, { width: w, height: h, bg, fg, font: `bold ${fontPx}px "DejaVu Sans", Arial, sans-serif` }), roughness: 0.55 });
    _headerMats.set(key, m);
  }
  return m;
}

function buildUnit(o) {
  const { length, height, depth, double, category, seed } = o;
  const group = new THREE.Group();
  const rng = seededRandom((seed | 0) * 1009 + 17);
  const cat = CATS[category] || CATS.grocery;
  const st = new Struct();
  const stock = new Stock(rng, category);
  const accentKey = 'acc:' + (o.accent || cat.color);
  const panelT = 0.03, baseH = 0.14, headerH = o.headerH;
  const panelZ = double ? 0 : -depth / 2 + panelT / 2;
  const bays = Math.max(1, Math.round(length / 1.2));
  const bayW = length / bays;
  const topShelfClear = height - headerH;
  const n = Math.max(3, Math.floor((topShelfClear - 0.17) / 0.30));
  const pitch = (topShelfClear - 0.17) / n;
  const clear = pitch - 0.03;
  const F = depth / 2 - 0.01;
  const sides = double ? [1, -1] : [1];
  const Bz = double ? 0.02 : (panelZ + panelT / 2 + 0.005) * 1;   // back limit of shelves (signed z for +side)
  const D = F - Bz;

  // base plinth + accent line
  const baseD = depth - 0.06;
  st.box('base', length - 0.0, baseH - 0.025, baseD, 0, 0, double ? 0 : -0.01);
  st.box(accentKey, length + 0.0, 0.025, baseD + 0.006, 0, baseH - 0.025, double ? 0 : -0.01);
  // end panels
  const endD = depth * (double ? 0.985 : 1);
  for (const sx of [-1, 1]) st.box('base', 0.03, height - headerH - baseH, endD, sx * (length / 2 - 0.015), baseH, 0);
  // uprights
  for (let k = 1; k < bays; k++) st.box('up', 0.04, height - headerH - baseH, 0.075, -length / 2 + k * bayW, baseH, panelZ);
  // back panel (pegboard) per bay
  for (let k = 0; k < bays; k++) {
    const ph = height - headerH - baseH;
    st.box('peg', bayW - 0.04, ph, panelT, -length / 2 + (k + 0.5) * bayW, baseH, panelZ, [(bayW - 0.04) / 0.1, ph / 0.1]);
  }
  // header body
  st.box(accentKey, length, headerH, o.headerD, 0, height - headerH, o.headerZ);

  // shelves, strips, products
  for (let k = 0; k < bays; k++) {
    const xl = -length / 2 + k * bayW, xr = xl + bayW;
    const x0 = xl + (k === 0 ? 0.03 : 0.02) + 0.006, x1 = xr - (k === bays - 1 ? 0.03 : 0.02) - 0.006;
    for (let lv = 0; lv < n; lv++) {
      const ys = 0.17 + lv * pitch;
      for (const sg of sides) {
        const zc = sg * (F + Bz) / 2;
        st.box('shelf', x1 - x0 + 0.01, 0.022, D, (x0 + x1) / 2, ys - 0.022, zc);
        st.box('strip', x1 - x0 + 0.01, 0.034, 0.01, (x0 + x1) / 2, ys - 0.03, sg * (F + 0.005));
        stock.shelf({ x0, x1, y: ys, sg, F, D, clear, level: lv });
      }
    }
  }
  st.build(group, (key) => {
    if (key.startsWith('acc:')) return stdMat(key.slice(4), { roughness: 0.5 });
    return MAT[key]();
  });

  // header text planes
  const hm = o.headerText(group, { bays, bayW, length, height, headerH, st });
  void hm;

  stock.build(group);
  group.userData.shelfLevels = n;
  group.userData.category = category;
  return group;
}

function headerTextPlanes(group, { text, zFront, bays, bayW, height, headerH, length, w, h, fontPx, back }) {
  const geos = [];
  const mat = textMat(text, w, h, CATS_COLOR_CACHE.c, '#ffffff', fontPx);
  void length;
  for (let k = 0; k < bays; k++) {
    const x = -length / 2 + (k + 0.5) * bayW;
    const g = new THREE.PlaneGeometry(bayW - 0.06, headerH - 0.03); g.translate(x, height - headerH / 2, zFront + 0.0015); geos.push(g);
    if (back) { const g2 = new THREE.PlaneGeometry(bayW - 0.06, headerH - 0.03); g2.rotateY(Math.PI); g2.translate(x, height - headerH / 2, -zFront - 0.0015); geos.push(g2); }
  }
  const mesh = new THREE.Mesh(mergeGeometries(geos, false), mat);
  mesh.name = 'headerText'; mesh.receiveShadow = true; group.add(mesh);
  geos.forEach((g) => g.dispose());
}
const CATS_COLOR_CACHE = { c: '#ffffff' };

/* ------------------------------------------------------------------ */
/* Public factories                                                   */
/* ------------------------------------------------------------------ */
export function createGondola({ length = 4.0, height = 1.9, depth = 1.0, category = 'grocery', seed = 1 } = {}) {
  const cat = CATS[category] || CATS.grocery;
  const g = buildUnit({
    length, height, depth, category, seed, double: true, headerH: 0.16, headerD: 0.09, headerZ: 0,
    headerText: (grp, c) => {
      CATS_COLOR_CACHE.c = cat.color;
      headerTextPlanes(grp, { text: cat.name, zFront: 0.045, bays: c.bays, bayW: c.bayW, height: c.height, headerH: c.headerH, length: c.length, w: 1536, h: 160, fontPx: 128, back: true });
    },
  });
  g.name = 'Gondola';
  return g;
}

export function createWallShelf({ length = 4.0, height = 2.2, depth = 0.55, category = 'beverages', seed = 1 } = {}) {
  const cat = CATS[category] || CATS.grocery;
  const headerD = Math.min(depth, 0.25);
  const g = buildUnit({
    length, height, depth, category, seed, double: false, headerH: 0.26, headerD, headerZ: -depth / 2 + headerD / 2,
    headerText: (grp, c) => {
      CATS_COLOR_CACHE.c = cat.color;
      headerTextPlanes(grp, { text: cat.name, zFront: -depth / 2 + headerD, bays: c.bays, bayW: c.bayW, height: c.height, headerH: c.headerH, length: c.length, w: 1024, h: 208, fontPx: 118, back: false });
    },
  });
  g.name = 'WallShelf';
  return g;
}

let _burstMat = null;
function burstMat() {
  if (_burstMat) return _burstMat;
  const c = makeCanvas(512, 512); const g = c.getContext('2d');
  const pts = 16, cx = 256, cy = 256;
  g.beginPath();
  for (let i = 0; i < pts * 2; i++) {
    const a = (i / (pts * 2)) * Math.PI * 2, r = i % 2 ? 205 : 250;
    g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  g.closePath(); g.fillStyle = '#ffe14d'; g.fill(); g.lineWidth = 12; g.strokeStyle = '#c62828'; g.stroke();
  g.fillStyle = '#c62828'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'bold 92px "DejaVu Sans", Arial, sans-serif'; g.fillText('SÜPER', cx, cy - 62, 330);
  g.font = 'bold 118px "DejaVu Sans", Arial, sans-serif'; g.fillText('FİYAT', cx, cy + 52, 340);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  _burstMat = new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.4, roughness: 0.5 });
  return _burstMat;
}

export function createEndCap({ width = 1.0, depth = 0.5, height = 1.8, category = 'snacks', seed = 1, promoText = 'KAMPANYA' } = {}) {
  const headerH = 0.34;
  const g = buildUnit({
    length: width, height, depth, category, seed, double: false, headerH, headerD: depth, headerZ: 0, accent: '#d62828',
    headerText: (grp, c) => {
      const tw = width - 0.42;
      const mat = textMat(promoText, 768, 192, '#d62828', '#ffe14d', 120);
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(tw, Math.min(0.26, tw / 4)), mat);
      pl.position.set(-width / 2 + 0.04 + tw / 2, height - headerH / 2, depth / 2 + 0.0015);
      pl.name = 'promoText'; grp.add(pl);
      const burst = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.36), burstMat());
      burst.position.set(width / 2 - 0.2, height - 0.19, depth / 2 + 0.004); burst.rotation.z = 0.12; burst.name = 'priceBurst'; grp.add(burst);
      void c;
    },
  });
  g.name = 'EndCap';
  return g;
}

/* ------------------------------------------------------------------ */
/* Aisle sign                                                         */
/* ------------------------------------------------------------------ */
const _signMats = new Map();
function signMat(number, lines) {
  const key = number + '|' + lines.join('|');
  let m = _signMats.get(key); if (m) return m;
  const W = 1024, H = 400; const c = makeCanvas(W, H); const g = c.getContext('2d');
  g.fillStyle = '#12355b'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#ffc83d'; g.fillRect(0, 0, W, 14); g.fillRect(0, H - 14, W, 14);
  g.fillStyle = '#ffc83d'; g.fillRect(28, 40, 330, 320);
  g.fillStyle = '#12355b'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'bold 64px "DejaVu Sans", Arial, sans-serif'; g.fillText('REYON', 193, 100, 290);
  g.font = 'bold 210px "DejaVu Sans", Arial, sans-serif'; g.fillText(String(number), 193, 244, 290);
  g.fillStyle = '#ffffff'; g.textAlign = 'left';
  const ls = lines.slice(0, 3), fs = ls.length === 1 ? 120 : ls.length === 2 ? 96 : 76;
  const lh = 300 / ls.length;
  ls.forEach((t, i) => { g.font = `bold ${fs}px "DejaVu Sans", Arial, sans-serif`; g.fillText(t, 400, 60 + lh * (i + 0.5) + 20, 590); });
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.25 });
  _signMats.set(key, m); return m;
}

export function createAisleSign({ number = 1, lines = ['Atıştırmalık', 'İçecekler'], hangHeight = 2.7, ceilingHeight = 5 } = {}) {
  const group = new THREE.Group(); group.name = 'AisleSign';
  const W = 1.6, H = 0.625, T = 0.06;
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, T), stdMat('#0d2742', { roughness: 0.5 }));
  body.position.set(0, hangHeight + H / 2, 0); body.castShadow = true; group.add(body);
  const mat = signMat(number, lines);
  const f = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.04, H - 0.04), mat); f.position.set(0, hangHeight + H / 2, T / 2 + 0.001); group.add(f);
  const b = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.04, H - 0.04), mat); b.rotation.y = Math.PI; b.position.set(0, hangHeight + H / 2, -T / 2 - 0.001); group.add(b);
  const cableLen = ceilingHeight - (hangHeight + H);
  const cg = new THREE.CylinderGeometry(0.006, 0.006, cableLen, 6);
  for (const sx of [-0.6, 0.6]) {
    const c = new THREE.Mesh(cg, MAT.cable()); c.position.set(sx, hangHeight + H + cableLen / 2, 0); group.add(c);
    const pl = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.08), MAT.cable()); pl.position.set(sx, ceilingHeight - 0.01, 0); group.add(pl);
    const clamp = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.07), MAT.cable()); clamp.position.set(sx, hangHeight + H + 0.015, 0); group.add(clamp);
  }
  group.userData.noCollide = true;
  return group;
}

/* ------------------------------------------------------------------ */
/* Showcases                                                          */
/* ------------------------------------------------------------------ */
export function showcase() {
  const g = new THREE.Group(); g.name = 'ShelvingShowcase';
  const a = createGondola({ category: 'snacks', seed: 3 }); a.position.set(0, 0, -1.6); g.add(a);
  const b = createGondola({ category: 'beverages', seed: 5 }); b.position.set(0, 0, 1.6); g.add(b);
  const e = createEndCap({ category: 'snacks', seed: 9 }); e.position.set(-2.0 - 0.25, 0, -1.6); e.rotation.y = -Math.PI / 2; g.add(e);
  const w = createWallShelf({ category: 'cereal', seed: 7 }); w.position.set(0, 0, -4.8); g.add(w);
  const s = createAisleSign({ number: 3, lines: ['Atıştırmalık', 'İçecekler'] }); s.position.set(3.4, 0, 0); g.add(s);
  return g;
}

export function showcaseCategories() {
  const g = new THREE.Group();
  const ids = Object.keys(CATS);
  ids.forEach((id, i) => {
    const m = createGondola({ category: id, seed: i + 1 });
    m.position.set(0, 0, i * 2.6 - (ids.length - 1) * 1.3); g.add(m);
  });
  return g;
}
