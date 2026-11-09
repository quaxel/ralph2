// Bereket Market - produce & bakery models (meyve/sebze tezgahlari, firin, pastane vitrini).
// All geometry is procedural; fruit/veg/bread are InstancedMesh (one per item type per object).
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { seededRandom, pick, stdMat, boxGeo, labelTexture } from './common.js';

/* ------------------------------------------------------------------ */
/* small math / colour helpers                                         */
/* ------------------------------------------------------------------ */
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const C = (hex) => new THREE.Color(hex);
const mixC = (a, b, t) => a.clone().lerp(b, clamp(t, 0, 1));
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const ONE = new THREE.Vector3(1, 1, 1);

function mat4(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, order = 'XYZ') {
  _e.set(rx, ry, rz, order);
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e), ONE);
}
const rotX = (a) => new THREE.Matrix4().makeRotationX(a);
const rotY = (a) => new THREE.Matrix4().makeRotationY(a);
const trans = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);

function paintAll(g, color) {
  const c = color.isColor ? color : C(color);
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

/* ------------------------------------------------------------------ */
/* procedural textures (lazy: need document)                           */
/* ------------------------------------------------------------------ */
let _wood = null, _wicker = null;
function woodTex() {
  if (_wood) return _wood;
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  const rng = seededRandom(77);
  g.fillStyle = '#efe2cc'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 70; i++) {
    const y = rng() * 256, a = 0.04 + rng() * 0.12, w = 0.6 + rng() * 2.2;
    g.strokeStyle = `rgba(110,75,40,${a})`; g.lineWidth = w; g.beginPath();
    const ph = rng() * 6, amp = 1 + rng() * 3;
    for (let x = 0; x <= 256; x += 16) { const yy = y + Math.sin(x * 0.03 + ph) * amp; x === 0 ? g.moveTo(x, yy) : g.lineTo(x, yy); }
    g.stroke();
  }
  for (let i = 0; i < 4; i++) {
    const x = rng() * 256, y = rng() * 256;
    g.fillStyle = 'rgba(100,66,34,0.28)'; g.beginPath(); g.ellipse(x, y, 7 + rng() * 5, 3 + rng() * 2, 0, 0, 6.28); g.fill();
  }
  _wood = new THREE.CanvasTexture(c);
  _wood.wrapS = _wood.wrapT = THREE.RepeatWrapping; _wood.colorSpace = THREE.SRGBColorSpace; _wood.anisotropy = 4;
  return _wood;
}
function wickerTex() {
  if (_wicker) return _wicker;
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  const rng = seededRandom(31);
  for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
    const horiz = (i + j) % 2 === 0;
    const l = 150 + rng() * 40;
    g.fillStyle = `rgb(${l},${l * 0.78 | 0},${l * 0.5 | 0})`;
    g.fillRect(i * 16, j * 16, 16, 16);
    g.fillStyle = 'rgba(70,40,15,0.45)';
    if (horiz) { g.fillRect(i * 16, j * 16 + 7, 16, 2); } else { g.fillRect(i * 16 + 7, j * 16, 2, 16); }
    g.fillStyle = 'rgba(40,20,5,0.5)'; g.fillRect(i * 16, j * 16, 16, 1); g.fillRect(i * 16, j * 16, 1, 16);
  }
  _wicker = new THREE.CanvasTexture(c);
  _wicker.wrapS = _wicker.wrapT = THREE.RepeatWrapping; _wicker.colorSpace = THREE.SRGBColorSpace; _wicker.anisotropy = 4;
  return _wicker;
}
let _woodMat = null, _wickerMat = null;
const woodMat = () => _woodMat || (_woodMat = new THREE.MeshStandardMaterial({ map: woodTex(), vertexColors: true, roughness: 0.82 }));
const wickerMat = () => _wickerMat || (_wickerMat = new THREE.MeshStandardMaterial({ map: wickerTex(), vertexColors: true, roughness: 0.9 }));
const solidMat = (opts = {}) => stdMat('#ffffff', { vertexColors: true, ...opts });

const _bannerCache = new Map();
/** Header banner texture with simple decorations. */
function bannerMat(text, w, h, c1, c2, fg, deco) {
  const key = [text, w, h, c1, c2, fg, deco].join('|');
  let m = _bannerCache.get(key);
  if (m) return m;
  const cw = 1536, ch = Math.round(cw * h / w);
  const c = document.createElement('canvas'); c.width = cw; c.height = ch;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, ch); gr.addColorStop(0, c1); gr.addColorStop(1, c2);
  g.fillStyle = gr; g.fillRect(0, 0, cw, ch);
  g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(0, 0, cw, ch * 0.06);
  g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, ch * 0.94, cw, ch * 0.06);
  // decorations left/right
  const icons = deco === 'bread'
    ? [['#d9a04a', 0.9], ['#c4852e', 0.7], ['#e8c27a', 0.8]]
    : [['#e43a2f', 0.9], ['#ff9a1f', 0.8], ['#8fcf4a', 0.9], ['#f7d83a', 0.7]];
  const r0 = ch * 0.28;
  for (let k = 0; k < 2; k++) {
    for (let i = 0; i < icons.length; i++) {
      const x = k === 0 ? cw * 0.06 + i * r0 * 2.3 : cw * 0.94 - i * r0 * 2.3;
      const y = ch * 0.5 + (i % 2 ? -1 : 1) * ch * 0.06;
      g.fillStyle = icons[i][0]; g.beginPath(); g.ellipse(x, y, r0 * icons[i][1], r0 * icons[i][1] * (deco === 'bread' ? 0.7 : 1), 0, 0, 6.28); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.ellipse(x - r0 * 0.25, y - r0 * 0.25, r0 * 0.22, r0 * 0.14, -0.6, 0, 6.28); g.fill();
      if (deco !== 'bread') { g.fillStyle = '#2f7d32'; g.beginPath(); g.ellipse(x + r0 * 0.15, y - r0 * icons[i][1] * 0.95, r0 * 0.28, r0 * 0.12, -0.5, 0, 6.28); g.fill(); }
    }
  }
  g.fillStyle = fg; g.font = `bold ${Math.round(ch * 0.62)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = 'rgba(0,0,0,0.35)'; g.shadowBlur = 6; g.shadowOffsetY = 3;
  g.fillText(text, cw / 2, ch * 0.54, cw * 0.5);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 });
  _bannerCache.set(key, m);
  return m;
}

/* ------------------------------------------------------------------ */
/* merge builder for static structure (wood, metal)                    */
/* ------------------------------------------------------------------ */
function boxUV(w, h, d, tile) {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  const uv = g.attributes.uv;
  // faces: px,nx,py,ny,pz,nz  (6 verts each after toNonIndexed)
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 6; k++) {
    const i = f * 6 + k;
    uv.setXY(i, uv.getX(i) * dims[f][0] / tile, uv.getY(i) * dims[f][1] / tile);
  }
  return g;
}

/** Extrude a (z,y) polygon along X (centered), result keeps uv. */
function prismX(pts, width) {
  const sh = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: width, bevelEnabled: false });
  g.translate(0, 0, -width / 2);
  g.rotateY(-Math.PI / 2);
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2.2, uv.getY(i) * 2.2);
  return g.index ? g.toNonIndexed() : g;
}

class Build {
  constructor(tile = 0.45) { this.parts = []; this.base = new THREE.Matrix4(); this.tile = tile; }
  setBase(m) { this.base = m.clone(); return this; }
  add(geo, local, color) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(local ? this.base.clone().multiply(local) : this.base);
    paintAll(g, color);
    this.parts.push(g);
    return this;
  }
  box(w, h, d, x, y, z, color, rx = 0, ry = 0, rz = 0) {
    return this.add(boxUV(w, h, d, this.tile), mat4(x, y, z, rx, ry, rz), color);
  }
  cyl(rt, rb, h, seg, x, y, z, color, rx = 0, ry = 0, rz = 0) {
    return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), mat4(x, y, z, rx, ry, rz), color);
  }
  prism(pts, width, x, y, z, color) { return this.add(prismX(pts, width), mat4(x, y, z), color); }
  build() { return this.parts.length ? mergeGeometries(this.parts, false) : null; }
}

function structMesh(geo, mat, name, cast = true) {
  const m = new THREE.Mesh(geo, mat);
  m.name = name; m.castShadow = cast; m.receiveShadow = true;
  return m;
}

/* ------------------------------------------------------------------ */
/* fruit & vegetable geometry                                          */
/* ------------------------------------------------------------------ */
function finishItem(parts) {
  const g = parts.length > 1 ? mergeGeometries(parts, false) : parts[0];
  g.computeBoundingSphere();
  return g;
}
function cylPart(rt, rb, h, seg, color, x, y, z, rx = 0, ry = 0, rz = 0) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1);
  g.deleteAttribute('uv');
  g.applyMatrix4(mat4(x, y, z, rx, ry, rz));
  return paintAll(g, color);
}
function spherePart(r, w, h, color, x, y, z, sx = 1, sy = 1, sz = 1) {
  const g = new THREE.SphereGeometry(r, w, h);
  g.deleteAttribute('uv');
  g.scale(sx, sy, sz); g.translate(x, y, z);
  return paintAll(g, color);
}

/** Deformed sphere with poles along Y and per-vertex colours. */
function blob({ sx, sy, sz, wSeg = 8, hSeg = 6, prof = null, dimple = 0, dimpleBot = 0, nip = 0, lobes = 0, lobeAmt = 0, noise = 0, nseed = 1, colorFn }) {
  let g = new THREE.SphereGeometry(1, wSeg, hSeg);
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  g = mergeVertices(g, 1e-5);
  const p = g.attributes.position, n = p.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const ang = Math.atan2(z, x);
    let rad = prof ? prof(y) : 1;
    if (lobes) rad *= 1 + lobeAmt * Math.cos(lobes * ang) * (1 - y * y);
    if (noise) rad *= 1 + noise * (Math.sin(x * 3.1 + nseed * 1.7) * Math.cos(y * 2.7 + nseed) + 0.5 * Math.sin(z * 3.7 + x * 1.3 + nseed));
    let Y = y * sy;
    if (dimple) Y -= dimple * sy * smooth(0.55, 1, y);
    if (dimpleBot) Y += dimpleBot * sy * smooth(0.7, 1, -y);
    if (nip) Y += nip * sy * Math.pow(smooth(0.8, 1, Math.abs(y)), 2) * Math.sign(y);
    p.setXYZ(i, x * rad * sx, Y, z * rad * sz);
    const c = colorFn ? colorFn(y, ang, x, z) : C('#888');
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/** Swept tube along X (spine bends in y/z); radius(s), color(s,a). Radius 0 at an end closes it; >0 gets a flat cap. */
function tube({ len, segs = 8, radial = 7, spine = () => [0, 0], radius, color, flatZ = 1 }) {
  const pts = [];
  for (let i = 0; i <= segs; i++) { const s = i / segs; const [sy, sz] = spine(s); pts.push(new THREE.Vector3((s - 0.5) * len, sy, sz)); }
  const pos = [], col = [], idx = [];
  const t = new THREE.Vector3(), nrm = new THREE.Vector3(), sec = new THREE.Vector3(), ref = new THREE.Vector3(0, 0, 1);
  for (let i = 0; i <= segs; i++) {
    const s = i / segs;
    t.subVectors(pts[Math.min(i + 1, segs)], pts[Math.max(i - 1, 0)]).normalize();
    nrm.crossVectors(ref, t).normalize(); sec.crossVectors(t, nrm).normalize();
    const r = radius(s);
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      pos.push(pts[i].x + (nrm.x * ca + sec.x * sa * flatZ) * r, pts[i].y + (nrm.y * ca + sec.y * sa * flatZ) * r, pts[i].z + (nrm.z * ca + sec.z * sa * flatZ) * r);
      const c = color(s, a); col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < radial; j++) {
    const a = i * radial + j, b = i * radial + (j + 1) % radial, c = (i + 1) * radial + j, d = (i + 1) * radial + (j + 1) % radial;
    idx.push(a, b, c, b, d, c);
  }
  for (const [ring, end] of [[0, 0], [segs, 1]]) {
    if (radius(ring / segs) < 5e-4) continue;
    const ci = pos.length / 3;
    pos.push(pts[ring].x, pts[ring].y, pts[ring].z);
    const cc = color(ring / segs, 0); col.push(cc.r, cc.g, cc.b);
    for (let j = 0; j < radial; j++) {
      const a = ring * radial + j, b = ring * radial + (j + 1) % radial;
      if (end === 0) idx.push(ci, b, a); else idx.push(ci, a, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const endCap = (s, k = 0.06) => (s < k ? Math.sqrt(s / k) : s > 1 - k ? Math.sqrt((1 - s) / k) : 1);

/* ---- individual items ---- */
function appleGeo(green) {
  const sx = 0.038, sy = 0.034;
  const g = blob({
    sx, sy, sz: sx, wSeg: 9, hSeg: 7, prof: (y) => 1 + 0.1 * y - 0.05 * y * y, dimple: 0.2, dimpleBot: 0.07, lobes: 5, lobeAmt: 0.025,
    colorFn: (y, a) => {
      if (green) {
        let c = mixC(C('#7fbf2f'), C('#c9de55'), 0.5 + 0.5 * Math.sin(a * 5 + y * 3));
        return mixC(c, C('#e3e875'), smooth(-0.1, -1, y) * 0.5);
      }
      let c = mixC(C('#b01418'), C('#dc3c26'), (0.5 + 0.5 * Math.sin(a * 6 + y * 4)) * 0.6);
      c = mixC(c, C('#d9b04a'), smooth(-0.3, -1, y) * 0.5);
      return mixC(c, C('#7a0c10'), smooth(0.6, 1, y) * 0.4);
    },
  });
  return finishItem([g, cylPart(0.0035, 0.0035, 0.018, 4, '#5a3b20', 0, sy * 0.8 + 0.004, 0)]);
}
function orangeGeo() {
  const g = blob({
    sx: 0.04, sy: 0.037, sz: 0.04, wSeg: 9, hSeg: 7, noise: 0.012, nseed: 3, dimple: 0.05,
    colorFn: (y, a) => mixC(C('#ee8410'), C('#ffa42c'), 0.5 + 0.5 * Math.sin(a * 3 + y * 5)),
  });
  return finishItem([g, cylPart(0.007, 0.007, 0.004, 6, '#5d7b2a', 0, 0.037 * 0.95, 0)]);
}
function lemonGeo() {
  const g = blob({
    sx: 0.03, sy: 0.045, sz: 0.03, wSeg: 9, hSeg: 8, nip: 0.12, noise: 0.01, nseed: 5,
    colorFn: (y, a) => mixC(C('#efcc14'), C('#f8e43a'), 0.5 + 0.5 * Math.sin(a * 4 + y * 3)),
  });
  g.rotateZ(Math.PI / 2);
  return finishItem([g]);
}
function tomatoGeo() {
  const sy = 0.031;
  const g = blob({
    sx: 0.037, sy, sz: 0.037, wSeg: 9, hSeg: 7, lobes: 5, lobeAmt: 0.035, dimple: 0.16,
    colorFn: (y, a) => mixC(mixC(C('#cf2418'), C('#e8452a'), 0.5 + 0.5 * Math.sin(a * 5 + 1)), C('#a8b43e'), smooth(0.75, 1, y) * 0.45),
  });
  const calyx = cylPart(0.014, 0.012, 0.004, 5, '#3f7d2b', 0, sy * 0.86, 0);
  return finishItem([g, calyx, cylPart(0.0025, 0.0025, 0.012, 4, '#4c7a2a', 0, sy * 0.86 + 0.007, 0)]);
}
function pearGeo() {
  const sy = 0.056;
  const g = blob({
    sx: 0.034, sy, sz: 0.034, wSeg: 8, hSeg: 8, dimple: 0.08,
    prof: (y) => { const t = (y + 1) / 2; return lerp(1.0, 0.45, smooth(0.35, 0.98, t)) * (1 - 0.1 * smooth(0.3, 0, t)); },
    colorFn: (y, a) => mixC(mixC(C('#b5c534'), C('#dcd95a'), smooth(-1, 0.6, y)), C('#a8794a'), (Math.sin(a * 9 + y * 13) > 0.85 ? 0.35 : 0)),
  });
  return finishItem([g, cylPart(0.0032, 0.0032, 0.022, 4, '#5a3b20', 0.003, sy * 0.92 + 0.008, 0, 0, 0, -0.25)]);
}
function peachGeo() {
  const g = blob({
    sx: 0.037, sy: 0.035, sz: 0.036, wSeg: 9, hSeg: 7, dimple: 0.1, lobes: 2, lobeAmt: 0.02,
    colorFn: (y, a, x) => mixC(mixC(C('#f2b04e'), C('#df4f3e'), smooth(-0.2, 0.8, x * 1.2 + y * 0.3)), C('#f7d46a'), smooth(-0.2, -1, y) * 0.5),
  });
  return finishItem([g, cylPart(0.003, 0.003, 0.01, 4, '#5a3b20', 0, 0.035 * 0.82, 0)]);
}
function potatoGeo() {
  const g = blob({
    sx: 0.052, sy: 0.033, sz: 0.037, wSeg: 8, hSeg: 6, noise: 0.11, nseed: 7,
    colorFn: (y, a, x, z) => mixC(C('#c9a36a'), C('#a9824a'), 0.5 + 0.5 * Math.sin(x * 9 + z * 7 + y * 5)),
  });
  return finishItem([g]);
}
function onionGeo() {
  const sy = 0.04;
  const g = blob({
    sx: 0.043, sy, sz: 0.043, wSeg: 9, hSeg: 7, nip: 0.55, dimpleBot: 0.1,
    prof: (y) => 1 - 0.55 * smooth(0.5, 1, y),
    colorFn: (y, a) => mixC(mixC(C('#c27a2a'), C('#a65c18'), 0.5 + 0.5 * Math.sin(a * 6)), C('#e6c883'), smooth(0.62, 1, y)),
  });
  return finishItem([g, cylPart(0.0015, 0.006, 0.01, 5, '#d9c9a0', 0, -sy * 0.95, 0)]);
}
function watermelonGeo() {
  const g = blob({
    sx: 0.105, sy: 0.14, sz: 0.105, wSeg: 14, hSeg: 9, prof: (y) => 1 - 0.1 * y * y * y * y,
    colorFn: (y, a) => {
      const st = smooth(-0.15, 0.35, Math.sin(a * 7 + Math.sin(y * 4) * 0.8));
      return mixC(C('#17501f'), C('#5c9a38'), st);
    },
  });
  g.rotateZ(Math.PI / 2);
  return finishItem([g, cylPart(0.006, 0.006, 0.02, 5, '#6b5a2a', 0.14, 0, 0, 0, 0, Math.PI / 2)]);
}
function lettuceGeo() {
  const g = blob({
    sx: 0.088, sy: 0.062, sz: 0.088, wSeg: 10, hSeg: 6, lobes: 7, lobeAmt: 0.14, noise: 0.06, nseed: 4, dimple: 0.12,
    colorFn: (y, a) => mixC(mixC(C('#2f7a22'), C('#6fb23c'), smooth(-0.3, 0.9, y)), C('#b4d86a'), smooth(0.8, 1, y) * 0.5),
  });
  return finishItem([g]);
}
function grapesGeo() {
  const parts = [];
  const rng = seededRandom(19);
  const N = 22;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const R = 0.045 * Math.pow(1 - t, 0.85);
    const a = i * 2.39996;
    const c = mixC(C('#3a1f52'), C('#6a3a86'), rng() * 0.7);
    parts.push(spherePart(0.0135, 6, 4, c, -0.02 + t * 0.12, Math.sin(a) * R * 0.9, Math.cos(a) * R, 1, 1, 1));
  }
  parts.push(cylPart(0.004, 0.004, 0.04, 4, '#6b5a2a', -0.04, 0.012, 0, 0, 0, Math.PI / 2 + 0.2));
  const g = finishItem(parts);
  g.translate(-0.025, 0, 0);
  return g;
}
function cucumberGeo() {
  return finishItem([tube({
    len: 0.21, segs: 6, radial: 7, spine: (s) => [0.01 * Math.sin(Math.PI * s), 0],
    radius: (s) => 0.0215 * endCap(s, 0.08) * (1 - 0.15 * Math.abs(2 * s - 1)),
    color: (s, a) => mixC(mixC(C('#2a6a28'), C('#5d9b3a'), 0.5 + 0.5 * Math.sin(a * 3 + s * 20)), C('#b8c860'), smooth(0.85, 1, s) * 0.6),
  })]);
}
function pepperGeo() {
  return finishItem([tube({
    len: 0.16, segs: 6, radial: 6, spine: (s) => [0.012 * s * s, 0.01 * Math.sin(s * 3)],
    radius: (s) => (0.0115 * (1 - 0.82 * smooth(0.1, 1, s))) * (s < 0.04 ? Math.sqrt(s / 0.04) : 1) + 0.0012,
    color: (s, a) => mixC(C('#5ba530'), C('#8fd04a'), 0.5 + 0.5 * Math.sin(a * 2 + 1)),
  }), cylPart(0.009, 0.007, 0.006, 6, '#3f7a26', -0.08, 0, 0, 0, 0, Math.PI / 2), cylPart(0.0028, 0.0028, 0.022, 4, '#477d2a', -0.092, 0.003, 0, 0, 0, Math.PI / 2 + 0.3)]);
}
function eggplantGeo() {
  return finishItem([tube({
    len: 0.18, segs: 8, radial: 8, spine: (s) => [0.022 * Math.sin(Math.PI * s) * (1 - s * 0.4), 0],
    radius: (s) => (0.016 + 0.027 * smooth(0.0, 0.62, s)) * endCap(s, 0.14) * (s > 0.14 ? 1 : 1),
    color: (s, a) => mixC(C('#2c1040'), C('#5a2a7e'), 0.5 + 0.5 * Math.sin(a + 1.5)),
  }), cylPart(0.02, 0.018, 0.012, 7, '#3d7a2a', -0.088, 0, 0, 0, 0, Math.PI / 2), cylPart(0.004, 0.004, 0.02, 4, '#3d7a2a', -0.1, 0.002, 0, 0, 0, Math.PI / 2 + 0.2)]);
}
function carrotGeo() {
  return finishItem([tube({
    len: 0.19, segs: 6, radial: 7, spine: (s) => [0, 0.004 * Math.sin(s * 3)],
    radius: (s) => 0.0185 * Math.pow(1 - s, 0.85) * (s > 0.92 ? 0.6 : 1) + 0.0015,
    color: (s, a) => mixC(mixC(C('#e8701a'), C('#f59a34'), 0.5 + 0.5 * Math.sin(a * 2 + s * 15)), C('#4f8f2a'), smooth(0.06, 0.0, s)),
  }), cylPart(0.006, 0.01, 0.035, 5, '#3f8a2a', -0.105, 0, 0, 0, 0, Math.PI / 2)]);
}
function bananaGeo() {
  const parts = [];
  const one = (yo, zo, yaw, flip) => {
    const g = tube({
      len: 0.18, segs: 7, radial: 5,
      spine: (s) => [0.045 * (1 - Math.cos((s - 0.5) * 1.5)) * 3.2 - 0.0, 0],
      radius: (s) => 0.0165 * (s < 0.12 ? 0.42 + 0.58 * smooth(0, 0.12, s) : 1) * (s > 0.93 ? 0.4 : 1) * endCap(s, 0.03),
      color: (s, a) => (s < 0.1 ? C('#8a8a3a') : s > 0.95 ? C('#3d2c16') : mixC(C('#f4d03a'), C('#e2b724'), 0.5 + 0.5 * Math.sin(a * 5)) ),
    });
    g.applyMatrix4(mat4(-0.0, yo, zo, 0, yaw, flip ? 0.12 : 0));
    return g;
  };
  parts.push(one(0.0, -0.034, 0.1, 0), one(0.003, -0.011, 0.03, 0), one(0.003, 0.011, -0.03, 0), one(0.0, 0.034, -0.1, 0), one(0.026, 0.0, 0, 1));
  parts.push(cylPart(0.014, 0.011, 0.035, 6, '#6e6a2e', -0.095, 0.012, 0, 0, 0, Math.PI / 2));
  const g = finishItem(parts);
  g.translate(0, -0.02, 0);
  return g;
}

/* breads */
function somunGeo() {
  return finishItem([blob({
    sx: 0.12, sy: 0.034, sz: 0.12, wSeg: 11, hSeg: 6, noise: 0.015, nseed: 2,
    colorFn: (y, a) => {
      if (y < 0) return mixC(C('#d6ae6c'), C('#e6c890'), 0.4);
      const sc = Math.sin(a * 6) > 0.85 && y > 0.5 ? 0.5 : 0;
      return mixC(mixC(C('#a05a1c'), C('#cc8a38'), smooth(1, 0.1, y)), C('#ecd098'), sc);
    },
  })]);
}
function baguetteGeo() {
  return finishItem([tube({
    len: 0.38, segs: 14, radial: 7, spine: (s) => [0, 0.004 * Math.sin(s * 5)],
    radius: (s) => 0.029 * Math.pow(endCap(s, 0.1), 0.9) * (0.95 + 0.05 * Math.sin(s * 40)),
    color: (s, a) => {
      const top = Math.cos(a) > -0.1;
      const slash = top && ((s * 6 + 0.12 * Math.sin(a)) % 1) < 0.28;
      const base = mixC(C('#b27228'), C('#cf9444'), 0.5 + 0.5 * Math.sin(a * 2));
      return slash ? mixC(base, C('#f2dca0'), 0.7) : (Math.cos(a) < -0.3 ? mixC(base, C('#e6c488'), 0.5) : base);
    },
  })]);
}
function simitGeo() {
  const g = new THREE.TorusGeometry(0.048, 0.017, 5, 13);
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  let m = mergeVertices(g, 1e-5);
  m.scale(1, 1, 0.85); m.rotateX(Math.PI / 2);
  const p = m.attributes.position, col = new Float32Array(p.count * 3), rng = seededRandom(23);
  for (let i = 0; i < p.count; i++) {
    const c = mixC(C('#b8702a'), C('#d79a44'), 0.5 + 0.5 * Math.sin(p.getX(i) * 40 + p.getZ(i) * 30));
    const cc = rng() < 0.45 ? mixC(c, C('#f3deaa'), 0.75) : c;
    col[i * 3] = cc.r; col[i * 3 + 1] = cc.g; col[i * 3 + 2] = cc.b;
  }
  m.setAttribute('color', new THREE.BufferAttribute(col, 3));
  m.computeVertexNormals();
  return finishItem([m]);
}
function pogacaGeo() {
  const rng = seededRandom(29);
  return finishItem([blob({
    sx: 0.054, sy: 0.034, sz: 0.046, wSeg: 9, hSeg: 6, lobes: 6, lobeAmt: 0.06, noise: 0.02, nseed: 9,
    colorFn: (y, a) => {
      if (y < -0.1) return C('#d7ab62');
      let c = mixC(C('#b8782e'), C('#e0a248'), smooth(0.1, 0.95, y) * (0.6 + 0.4 * Math.sin(a * 3)));
      const r = rng();
      if (y > 0.35 && r < 0.2) c = mixC(c, C('#2c2118'), 0.8);
      else if (y > 0.35 && r < 0.35) c = mixC(c, C('#f4e0b0'), 0.7);
      return c;
    },
  })]);
}

/* pastries */
function baklavaGeo() {
  const body = new THREE.BoxGeometry(0.04, 0.016, 0.04); body.deleteAttribute('uv'); body.rotateY(Math.PI / 4);
  paintAll(body, mixC(C('#cf8a22'), C('#e8b04a'), 0.35));
  const layer = new THREE.BoxGeometry(0.03, 0.004, 0.03); layer.deleteAttribute('uv'); layer.rotateY(Math.PI / 4); layer.translate(0, 0.009, 0);
  paintAll(layer, C('#f0c25a'));
  const pist = new THREE.BoxGeometry(0.014, 0.006, 0.014); pist.deleteAttribute('uv'); pist.rotateY(Math.PI / 4); pist.translate(0, 0.013, 0);
  paintAll(pist, C('#8cc03a'));
  body.translate(0, 0.008, 0);
  return finishItem([body, layer, pist]);
}
function cakeGeo() {
  const parts = [];
  parts.push(cylPart(0.082, 0.085, 0.032, 14, C('#8a5530'), 0, 0.016, 0));
  parts.push(cylPart(0.083, 0.083, 0.014, 14, C('#fff6ea'), 0, 0.039, 0));
  parts.push(cylPart(0.083, 0.083, 0.03, 14, C('#a8683a'), 0, 0.061, 0));
  parts.push(cylPart(0.086, 0.086, 0.02, 14, C('#ffffff'), 0, 0.086, 0));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    parts.push(spherePart(0.012, 6, 4, C('#ffffff'), Math.cos(a) * 0.066, 0.104, Math.sin(a) * 0.066, 1, 0.8, 1));
  }
  parts.push(spherePart(0.014, 6, 5, C('#d6283a'), 0, 0.104, 0));
  return finishItem(parts);
}
function cookieGeo() {
  const g = new THREE.CylinderGeometry(0.027, 0.025, 0.011, 10); g.deleteAttribute('uv'); g.translate(0, 0.0055, 0);
  const p = g.attributes.position, col = new Float32Array(p.count * 3), rng = seededRandom(41);
  for (let i = 0; i < p.count; i++) {
    const c = rng() < 0.2 ? C('#4b2c18') : mixC(C('#d6a35c'), C('#c28a42'), rng());
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return finishItem([g]);
}
function borekGeo() {
  const rng = seededRandom(43);
  const g = new THREE.BoxGeometry(0.085, 0.03, 0.06, 2, 1, 2); g.deleteAttribute('uv'); g.translate(0, 0.015, 0);
  const p = g.attributes.position, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const top = p.getY(i) > 0.02;
    const c = top ? (rng() < 0.25 ? C('#f2dfa8') : mixC(C('#c98a30'), C('#e2ae52'), rng())) : C('#d6a24e');
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return finishItem([g]);
}

/* ------------------------------------------------------------------ */
/* item registry                                                       */
/* ------------------------------------------------------------------ */
const T_WARM = ['#ffffff', '#f4ece0', '#ebe0d0'];
const T_RED = ['#ffffff', '#f6d6cc', '#ecbcb0', '#ffe8e0'];
const ITEMS = {
  apple_red:   { name: 'Elma',        price: '34,90 ₺/kg', geo: () => appleGeo(false), fx: 0.074, fz: 0.074, th: 0.07, orient: 'free', rough: 0.35, tints: T_RED, fill: '#6a1a16' },
  apple_green: { name: 'Yeşil Elma',  price: '39,90 ₺/kg', geo: () => appleGeo(true), fx: 0.074, fz: 0.074, th: 0.07, orient: 'free', rough: 0.35, tints: ['#ffffff', '#f0f5d8', '#e2eab8'], fill: '#3d5a1c' },
  orange:      { name: 'Portakal',    price: '29,90 ₺/kg', geo: orangeGeo, fx: 0.08, fz: 0.08, th: 0.075, orient: 'free', rough: 0.6, tints: ['#ffffff', '#fff0d8', '#f6dcb6'], fill: '#7a3c0a' },
  lemon:       { name: 'Limon',       price: '44,90 ₺/kg', geo: lemonGeo, fx: 0.09, fz: 0.06, th: 0.06, orient: 'yaw', rough: 0.5, tints: ['#ffffff', '#fff6c8', '#f4e8a0'], fill: '#8a7410' },
  banana:      { name: 'Muz',         price: '79,90 ₺/kg', geo: bananaGeo, fx: 0.18, fz: 0.1, th: 0.07, orient: 'long', rough: 0.55, tints: ['#ffffff', '#fff2c8', '#f0e0a0'], fill: '#6e5a14', layers: [{ d: 0, p: 1 }, { d: 0.8, p: 0.7 }] },
  tomato:      { name: 'Domates',     price: '49,90 ₺/kg', geo: tomatoGeo, fx: 0.076, fz: 0.076, th: 0.062, orient: 'yaw', rough: 0.3, tints: T_RED, fill: '#5a1810' },
  cucumber:    { name: 'Salatalık',   price: '39,90 ₺/kg', geo: cucumberGeo, fx: 0.2, fz: 0.046, th: 0.044, orient: 'long', rough: 0.3, tints: ['#ffffff', '#e8f2d8', '#d4e8b8'], fill: '#1e4a1c', layers: [{ d: 0, p: 1 }, { d: 0.9, p: 0.5 }] },
  pepper_green: { name: 'Sivri Biber', price: '69,90 ₺/kg', geo: pepperGeo, fx: 0.15, fz: 0.03, th: 0.026, orient: 'long', rough: 0.3, tints: ['#ffffff', '#eaf4d0', '#d8ecb0'], fill: '#3a6a20', layers: [{ d: 0, p: 1 }, { d: 1.2, p: 0.8 }, { d: 2.4, p: 0.5 }] },
  eggplant:    { name: 'Patlıcan',    price: '44,90 ₺/kg', geo: eggplantGeo, fx: 0.175, fz: 0.088, th: 0.084, orient: 'long', rough: 0.22, tints: ['#ffffff', '#e8d8f4', '#d4c0e8'], fill: '#1f0e30', layers: [{ d: 0, p: 1 }, { d: 0.8, p: 0.5 }] },
  potato:      { name: 'Patates',     price: '24,90 ₺/kg', geo: potatoGeo, fx: 0.1, fz: 0.074, th: 0.066, orient: 'yaw', rough: 0.9, tints: ['#ffffff', '#f2e4cc', '#e4d0ac', '#d6bc94'], fill: '#4a3820' },
  onion:       { name: 'Soğan',       price: '19,90 ₺/kg', geo: onionGeo, fx: 0.086, fz: 0.086, th: 0.08, orient: 'yaw', rough: 0.55, tints: ['#ffffff', '#f4dcc0', '#e8c8a0'], fill: '#5a2e10' },
  carrot:      { name: 'Havuç',       price: '22,90 ₺/kg', geo: carrotGeo, fx: 0.19, fz: 0.04, th: 0.038, orient: 'long', rough: 0.55, tints: ['#ffffff', '#ffe8d0', '#f8d4b0'], fill: '#7a3a08', layers: [{ d: 0, p: 1 }, { d: 1.0, p: 0.6 }, { d: 2, p: 0.5 }] },
  watermelon:  { name: 'Karpuz',      price: '14,90 ₺/kg', geo: watermelonGeo, fx: 0.29, fz: 0.22, th: 0.21, orient: 'yaw', rough: 0.45, tints: ['#ffffff', '#e8f4e0', '#d4e8c8'], fill: '#1a4a22', layers: [{ d: 0, p: 1 }, { d: 0.85, p: 0.8 }] },
  lettuce:     { name: 'Marul',       price: '42,50 ₺/adet', geo: lettuceGeo, fx: 0.17, fz: 0.17, th: 0.1, orient: 'yaw', rough: 0.8, tints: ['#ffffff', '#e8f0d0', '#d4e4b0'], fill: '#2e6a20', layers: [{ d: 0, p: 1 }, { d: 0.7, p: 0.4 }] },
  grapes:      { name: 'Üzüm',        price: '89,90 ₺/kg', geo: grapesGeo, fx: 0.13, fz: 0.1, th: 0.05, orient: 'long', rough: 0.3, tints: ['#ffffff', '#e8d8f4', '#d0b8e8'], fill: '#2a1438', layers: [{ d: 0, p: 1 }, { d: 0.8, p: 0.6 }] },
  pear:        { name: 'Armut',       price: '54,90 ₺/kg', geo: pearGeo, fx: 0.07, fz: 0.07, th: 0.065, orient: 'free', rough: 0.5, tints: ['#ffffff', '#f4f0c8', '#e8e0a0'], fill: '#5a6a18' },
  peach:       { name: 'Şeftali',     price: '64,90 ₺/kg', geo: peachGeo, fx: 0.075, fz: 0.075, th: 0.068, orient: 'free', rough: 0.75, tints: ['#ffffff', '#ffe4d0', '#f8d0b0'], fill: '#8a3a1a' },
  /* breads & pastries (used by rack / case) */
  somun:       { name: 'Somun Ekmek', price: '12,00 ₺', geo: somunGeo, fx: 0.24, fz: 0.24, th: 0.042, pad: 0.22, orient: 'flat', rough: 0.85, tints: T_WARM, fill: '#a87838', layers: [{ d: 0, p: 1 }, { d: 1, p: 1 }, { d: 2, p: 1 }] },
  baguette:    { name: 'Baget Ekmek', price: '18,00 ₺', geo: baguetteGeo, fx: 0.38, fz: 0.062, th: 0.056, orient: 'long', rough: 0.8, tints: T_WARM, fill: '#a87838', layers: [{ d: 0, p: 1 }, { d: 1, p: 1 }, { d: 2, p: 0.9 }] },
  simit:       { name: 'Simit', price: '15,00 ₺', geo: simitGeo, fx: 0.125, fz: 0.125, th: 0.036, pad: 0.4, orient: 'flat', rough: 0.7, tints: T_WARM, fill: '#a87838', layers: [{ d: 0, p: 1 }, { d: 1, p: 1 }, { d: 2, p: 1 }] },
  pogaca:      { name: 'Poğaça', price: '22,00 ₺', geo: pogacaGeo, fx: 0.105, fz: 0.095, th: 0.04, orient: 'yaw', rough: 0.55, tints: T_WARM, fill: '#a87838', layers: [{ d: 0, p: 1 }, { d: 1, p: 1 }, { d: 2, p: 1 }] },
  baklava:     { name: 'Baklava', price: '', geo: baklavaGeo, rough: 0.35, tints: ['#ffffff', '#f4e4c8', '#ffeed0'] },
  cake:        { name: 'Pasta', price: '', geo: cakeGeo, rough: 0.5, tints: ['#ffffff', '#ffc4d4', '#e2b894', '#fff2b8'] },
  cookie:      { name: 'Kurabiye', price: '', geo: cookieGeo, rough: 0.8, tints: ['#ffffff', '#f6e8d0', '#e8cca0'] },
  borek:       { name: 'Börek', price: '', geo: borekGeo, rough: 0.6, tints: ['#ffffff', '#f6e8d0'] },
};
for (const [id, s] of Object.entries(ITEMS)) s.id = id;
export const PRODUCE_ITEM_IDS = ['apple_red', 'apple_green', 'orange', 'lemon', 'banana', 'tomato', 'cucumber', 'pepper_green', 'eggplant', 'potato', 'onion', 'carrot', 'watermelon', 'lettuce', 'grapes', 'pear', 'peach'];

const _geoCache = new Map();
function itemGeo(id) {
  let g = _geoCache.get(id);
  if (!g) { g = ITEMS[id].geo(); _geoCache.set(id, g); }
  return g;
}
const itemMat = (id) => solidMat({ roughness: ITEMS[id].rough ?? 0.6 });
const specOf = (id) => ITEMS[id] || ITEMS.apple_red;

/* ------------------------------------------------------------------ */
/* instance collector                                                  */
/* ------------------------------------------------------------------ */
class Stock {
  constructor() { this.map = new Map(); }
  add(id, matrix) { (this.map.get(id) || this.map.set(id, []).get(id)).push(matrix); }
  build(group, rng) {
    for (const [id, mats] of this.map) {
      const spec = specOf(id);
      const mesh = new THREE.InstancedMesh(itemGeo(id), itemMat(id), mats.length);
      const col = new THREE.Color();
      for (let i = 0; i < mats.length; i++) {
        mesh.setMatrixAt(i, mats[i]);
        col.set(pick(rng, spec.tints || T_WARM)).multiplyScalar(0.88 + rng() * 0.17);
        mesh.setColorAt(i, col);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
      mesh.castShadow = false; mesh.receiveShadow = true;
      mesh.name = 'Items_' + id;
      group.add(mesh);
    }
  }
}

function orientQuat(rng, mode, q) {
  if (mode === 'free') _e.set(rng() * 6.283, rng() * 6.283, rng() * 6.283, 'XYZ');
  else if (mode === 'long') _e.set((rng() - 0.5) * 0.2, (rng() < 0.5 ? 0 : Math.PI) + (rng() - 0.5) * 0.8, (rng() - 0.5) * 0.18, 'YXZ');
  else _e.set((rng() - 0.5) * 0.25, rng() * 6.283, (rng() - 0.5) * 0.25, 'YXZ'); // yaw / flat
  return q.setFromEuler(_e);
}

/**
 * Heap items in a rectangular tray whose floor is at local y=0 (x: length, z: depth, +z = front).
 * o: { hFront, hBack, dome, margin, step, layers, scale }
 */
function heap(rng, stock, base, L, D, spec, o) {
  const pad = spec.pad ?? 0.4;
  const mx = Math.max(o.margin ?? 0.03, spec.fx * (spec.orient === 'long' ? 0.46 : pad) - 0.005);
  const mz = Math.max(o.margin ?? 0.03, spec.fz * pad - 0.005);
  const ix = L / 2 - mx, iz = D / 2 - mz;
  const step = o.step ?? 1.0;
  const cols = Math.max(1, Math.round(2 * ix / (spec.fx * step)));
  const rows = Math.max(1, Math.round(2 * iz / (spec.fz * step)));
  const stx = 2 * ix / cols, stz = 2 * iz / rows;
  const layers = o.layers || spec.layers || [{ d: 0, p: 1 }, { d: 0.8, p: 0.4 }];
  const q = new THREE.Quaternion();
  layers.forEach((ly, li) => {
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (ly.p < 1 && rng() > ly.p) continue;
      let x = -ix + (c + 0.5) * stx + (((r + li) & 1) ? 0.22 : -0.22) * stx + (rng() - 0.5) * 0.35 * stx;
      let z = -iz + (r + 0.5) * stz + (rng() - 0.5) * 0.35 * stz;
      x = clamp(x, -ix, ix); z = clamp(z, -iz, iz);
      const u = x / ix, v = z / iz, pw = 2.4;
      const s = Math.max(0, 1 - Math.pow(Math.pow(Math.abs(u), pw) + Math.pow(Math.abs(v), pw), 1 / pw));
      const t = (z + D / 2) / D;
      const h = lerp(o.hBack, o.hFront, t) + o.dome * Math.pow(s, 0.8);
      const y = h - spec.th / 2 - ly.d * spec.th * 0.78 + (rng() - 0.5) * 0.1 * spec.th;
      if (y < spec.th * 0.42) continue;
      const sc = (o.scale ?? 1) * (0.93 + rng() * 0.14);
      orientQuat(rng, spec.orient, q);
      const m = new THREE.Matrix4().compose(_p.set(x, y, z), q, _s.set(sc, sc * (0.96 + rng() * 0.08), sc));
      stock.add(spec.id, base.clone().multiply(m));
    }
  });
}

/* ------------------------------------------------------------------ */
/* crates, baskets, signs                                              */
/* ------------------------------------------------------------------ */
const CRATE_COLORS = ['#e8c894', '#dcb882', '#d0a874', '#e2c08a'];
const DARK_WOOD = '#8a5a34';
/** Open wooden crate in local frame: floor top at y=0, back at -z (tall), front +z (low). */
function addCrate(B, rng, { L, D, hb, hf, fill = null, fillH = 0 }) {
  const col = pick(rng, CRATE_COLORS);
  const t = 0.014;
  B.box(L, 0.02, D, 0, -0.01, 0, col);
  // back wall: two slats with a gap
  B.box(L, hb * 0.46, t, 0, hb * 0.24, -D / 2 + t / 2, col);
  B.box(L, hb * 0.38, t, 0, hb * 0.8, -D / 2 + t / 2, col);
  // front board (sign side)
  B.box(L, hf, t, 0, hf / 2, D / 2 - t / 2, col);
  // trapezoid side boards
  const pts = [[-D / 2, 0], [D / 2, 0], [D / 2, hf], [-D / 2, hb]];
  B.prism(pts, t, L / 2 - t / 2, 0, 0, col);
  B.prism(pts, t, -L / 2 + t / 2, 0, 0, col);
  // corner posts
  for (const sx of [-1, 1]) {
    B.box(0.03, hb + 0.004, 0.03, sx * (L / 2 - 0.015), (hb + 0.004) / 2, -D / 2 + 0.015, DARK_WOOD);
    B.box(0.03, hf + 0.004, 0.03, sx * (L / 2 - 0.015), (hf + 0.004) / 2, D / 2 - 0.015, DARK_WOOD);
  }
  if (fill && fillH > 0) B.box(L - 0.03, fillH, D - 0.03, 0, fillH / 2, 0, fill);
}

const _signMats = new Map();
function chalkMat(name, price) {
  const key = name + '|' + price;
  let m = _signMats.get(key);
  if (!m) {
    const tex = labelTexture(price ? `${name}\n${price}` : name, { width: 512, height: 218, bg: '#26332c', fg: '#f6f2e4', font: 'bold 70px sans-serif', border: '#d8b26a' });
    m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 });
    _signMats.set(key, m);
  }
  return m;
}
function addSign(group, matrix, name, price, w = 0.2, h = 0.085) {
  const mesh = new THREE.Mesh(boxGeo(w, h, 0.008), chalkMat(name, price));
  matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
  mesh.name = 'Sign_' + name; mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}
const _hdrGeoCache = new Map();
function addBanner(group, text, w, h, x, y, z, c1, c2, fg, deco) {
  const key = `${w}|${h}`;
  let geo = _hdrGeoCache.get(key);
  if (!geo) { geo = new THREE.BoxGeometry(w, h, 0.05); _hdrGeoCache.set(key, geo); }
  const mats = [stdMat('#555', {}), stdMat('#555', {}), stdMat('#555', {}), stdMat('#555', {}), bannerMat(text, w, h, c1, c2, fg, deco), stdMat('#555', {})];
  const m = new THREE.Mesh(geo, mats);
  m.position.set(x, y, z); m.name = 'Header_' + text; m.castShadow = true; m.receiveShadow = true;
  group.add(m);
  return m;
}

/* ------------------------------------------------------------------ */
/* 1. Produce island table                                             */
/* ------------------------------------------------------------------ */
export function createProduceTable({ length = 2.4, width = 1.3, height = 0.95, items = ['apple_red', 'orange', 'lemon', 'apple_green'], seed = 1 } = {}) {
  const g = new THREE.Group(); g.name = 'ProduceTable';
  const rng = seededRandom(seed);
  const list = items.filter((id) => ITEMS[id]);
  if (!list.length) list.push('apple_red');
  const wood = new Build(), stock = new Stock();
  const th = THREE.MathUtils.degToRad(16);
  const ridgeHalf = 0.05;
  const zo = width / 2 - 0.02;                 // outer slope edge
  const run = zo - ridgeHalf;
  const rise = run * Math.tan(th);
  const yRidge = height - 0.235;
  const yEdge = yRidge - rise;

  // frame
  const legH = yEdge - 0.07;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) wood.box(0.07, legH, 0.07, sx * (length / 2 - 0.06), legH / 2, sz * (width / 2 - 0.08), DARK_WOOD);
  wood.box(length - 0.1, 0.03, width - 0.14, 0, 0.14, 0, '#c9a46c');                // lower shelf
  for (const sz of [-1, 1]) wood.box(length - 0.1, 0.11, 0.03, 0, yEdge - 0.11, sz * (width / 2 - 0.08), DARK_WOOD);
  for (const sx of [-1, 1]) wood.box(0.03, 0.11, width - 0.14, sx * (length / 2 - 0.06), yEdge - 0.11, 0, DARK_WOOD);
  // lower shelf rails
  for (const sz of [-1, 1]) wood.box(length - 0.1, 0.04, 0.03, 0, 0.12, sz * (width / 2 - 0.08), DARK_WOOD);
  // gable top
  wood.prism([[-zo, yEdge - 0.08], [-zo, yEdge], [-ridgeHalf, yRidge], [ridgeHalf, yRidge], [zo, yEdge], [zo, yEdge - 0.08]], length, 0, 0, 0, '#b88a56');
  g.add(structMesh(wood.build(), woodMat(), 'TableFrame'));

  // crates
  const nSide = clamp(Math.ceil(list.length / 2), 1, 3);
  const gap = 0.025;
  const Lc = (length - 0.08 - gap * (nSide - 1)) / nSide;
  const Dc = run / Math.cos(th) - 0.01;
  const hb = 0.22, hf = 0.11;
  const yc = (yRidge + yEdge) / 2, zc = (ridgeHalf + zo) / 2;
  const crates = new Build();
  let slot = 0;
  for (const side of [1, -1]) {
    const M = (side > 0 ? trans(0, yc, zc) : trans(0, yc, -zc).multiply(rotY(Math.PI))).multiply(rotX(th));
    for (let i = 0; i < nSide; i++) {
      const id = list[slot++ % list.length];
      const spec = specOf(id);
      const x = -length / 2 + 0.04 + Lc / 2 + i * (Lc + gap);
      const loc = trans(x, 0, 0);
      crates.setBase(M.clone().multiply(loc));
      addCrate(crates, rng, { L: Lc, D: Dc, hb, hf, fill: spec.fill, fillH: hf * 0.9 });
      heap(rng, stock, M.clone().multiply(loc), Lc, Dc, spec, { hFront: hf * 1.0, hBack: hb * 1.0, dome: 0.15, step: 1.1, margin: 0.035, layers: spec.layers && spec.layers.length > 2 ? spec.layers : [{ d: 0, p: 1 }, { d: 0.9, p: 0.5 }] });
      addSign(g, M.clone().multiply(loc).multiply(trans(0, hf / 2 + 0.002, Dc / 2 + 0.004)), spec.name, spec.price);
    }
  }
  g.add(structMesh(crates.build(), woodMat(), 'Crates'));
  stock.build(g, rng);
  return g;
}

/* ------------------------------------------------------------------ */
/* 2. Wall rack                                                        */
/* ------------------------------------------------------------------ */
export function createProduceWallRack({ length = 3.0, height = 1.9, depth = 0.95, items = ['tomato', 'cucumber', 'pepper_green', 'eggplant', 'lettuce', 'carrot'], seed = 1 } = {}) {
  const g = new THREE.Group(); g.name = 'ProduceWallRack';
  const rng = seededRandom(seed);
  const list = items.filter((id) => ITEMS[id]);
  if (!list.length) list.push('tomato');
  const wood = new Build(), crates = new Build(), stock = new Stock(), metal = new Build();
  const th = THREE.MathUtils.degToRad(14);
  const sc = height / 1.9;
  const run = (depth - 0.08) / 3;
  const rise = run * Math.tan(th);
  const zf0 = depth / 2 - 0.01;
  const yf = [0.46 * sc, 0.74 * sc, 1.02 * sc];

  // stepped solid body (profile in z,y), plinth set back
  const pts = [[-depth / 2, 0], [depth / 2 - 0.06, 0], [depth / 2 - 0.06, 0.09], [zf0, 0.09], [zf0, yf[0]], [zf0 - run, yf[0] + rise],
    [zf0 - run, yf[1]], [zf0 - 2 * run, yf[1] + rise], [zf0 - 2 * run, yf[2]], [zf0 - 3 * run, yf[2] + rise], [-depth / 2, yf[2] + rise]];
  wood.prism(pts, length, 0, 0, 0, '#c19a62');
  // back panel & posts, header beam
  wood.box(length, height, 0.03, 0, height / 2, -depth / 2 + 0.015, '#efe6d4');
  for (const sx of [-1, 1]) wood.box(0.07, height, 0.12, sx * (length / 2 - 0.035), height / 2, -depth / 2 + 0.06, DARK_WOOD);
  wood.box(length, 0.1, 0.1, 0, height - 0.05, -depth / 2 + 0.08, DARK_WOOD);
  g.add(structMesh(wood.build(), woodMat(), 'RackBody'));

  // crates
  const n = clamp(Math.ceil(list.length / 3), 1, 3);
  const gap = 0.025;
  const Lc = (length - 0.14 - gap * (n - 1)) / n;
  const Dc = run / Math.cos(th) - 0.012;
  const hb = 0.17, hf = 0.1;
  let slot = 0;
  for (let tier = 0; tier < 3; tier++) {
    const zc = zf0 - run * (tier + 0.5);
    const yc = yf[tier] + rise / 2 - rise * 0 - 0.0;
    const yMid = yf[tier] + rise / 2;
    const M = trans(0, yMid, zc).multiply(rotX(th));
    for (let i = 0; i < n; i++) {
      const id = list[slot++ % list.length];
      const spec = specOf(id);
      const x = -length / 2 + 0.07 + Lc / 2 + i * (Lc + gap);
      const base = M.clone().multiply(trans(x, 0, 0));
      crates.setBase(base);
      addCrate(crates, rng, { L: Lc, D: Dc, hb, hf, fill: spec.fill, fillH: hf * 0.7 });
      heap(rng, stock, base, Lc, Dc, spec, { hFront: hf * 0.92, hBack: hb * 0.9, dome: 0.075, step: 1.06, margin: 0.03, layers: spec.layers && spec.layers.length > 2 ? spec.layers : [{ d: 0, p: 1 }, { d: 0.8, p: 0.3 }] });
      addSign(g, base.clone().multiply(trans(0, hf / 2 + 0.002, Dc / 2 + 0.004)), spec.name, spec.price, 0.2, 0.085);
    }
    void yc;
  }
  g.add(structMesh(crates.build(), woodMat(), 'Crates'));
  stock.build(g, rng);

  // mirror band + misting bar + header
  const yMir = height - 0.2 - 0.14 * sc;
  const mirror = new THREE.Mesh(boxGeo(length - 0.2, 0.3 * sc, 0.012), new THREE.MeshStandardMaterial({ color: '#b7d4e0', roughness: 0.06, metalness: 0.35, emissive: '#6f98aa', emissiveIntensity: 0.22 }));
  mirror.position.set(0, yMir, -depth / 2 + 0.036); mirror.name = 'MirrorBand'; g.add(mirror);
  const frame = new Build();
  frame.box(length - 0.16, 0.025, 0.02, 0, yMir + 0.15 * sc + 0.012, -depth / 2 + 0.04, '#9aa3a8');
  frame.box(length - 0.16, 0.025, 0.02, 0, yMir - 0.15 * sc - 0.012, -depth / 2 + 0.04, '#9aa3a8');
  const pipeY = yMir - 0.15 * sc - 0.05, pipeZ = -depth / 2 + 0.12;
  metal.cyl(0.011, 0.011, length - 0.24, 8, 0, pipeY, pipeZ, '#c5ccd1', 0, 0, Math.PI / 2);
  for (let x = -length / 2 + 0.22; x < length / 2 - 0.2; x += 0.24) {
    metal.cyl(0.0035, 0.007, 0.02, 5, x, pipeY - 0.014, pipeZ, '#e0e6ea');
    metal.cyl(0.004, 0.004, 0.05, 4, x, pipeY + 0.02, pipeZ - 0.02, '#9aa3a8', 0, 0, 0);
  }
  for (const sx of [-1, 1]) metal.box(0.02, 0.1, 0.1, sx * (length / 2 - 0.1), pipeY + 0.03, pipeZ - 0.03, '#9aa3a8');
  const fm = structMesh(frame.build(), solidMat({ metalness: 0.5, roughness: 0.35 }), 'MirrorFrame', false); g.add(fm);
  g.add(structMesh(metal.build(), solidMat({ metalness: 0.55, roughness: 0.3 }), 'MistBar', false));
  addBanner(g, 'MEYVE & SEBZE', length - 0.14, 0.2, 0, height - 0.1, -depth / 2 + 0.13, '#2f9a45', '#1b6a2c', '#ffffff', 'fruit');
  return g;
}

/* ------------------------------------------------------------------ */
/* 3. Bulk bin                                                         */
/* ------------------------------------------------------------------ */
export function createBulkBin({ item = 'watermelon', seed = 1 } = {}) {
  const g = new THREE.Group(); g.name = 'BulkBin';
  const rng = seededRandom(seed);
  const id = ITEMS[item] ? item : 'watermelon';
  const spec = specOf(id);
  const W = 1.2, Dp = 0.8;
  const wood = new Build(), stock = new Stock();
  const pal = 0.1;
  // pallet
  wood.box(W, 0.03, Dp, 0, pal - 0.015, 0, '#b89460');
  for (const x of [-W / 2 + 0.07, 0, W / 2 - 0.07]) wood.box(0.1, pal - 0.03, Dp - 0.04, x, (pal - 0.03) / 2, 0, '#9a7646');
  // walls: 4 slats each side, with gaps
  const wallH = 0.54, n = 4, sh = wallH / n - 0.012;
  const t = 0.022;
  for (let i = 0; i < n; i++) {
    const y = pal + 0.006 + sh / 2 + i * (sh + 0.012);
    const col = i % 2 ? '#dcb882' : '#e4c490';
    wood.box(W, sh, t, 0, y, Dp / 2 - t / 2, col);
    wood.box(W, sh, t, 0, y, -Dp / 2 + t / 2, col);
    wood.box(t, sh, Dp - 2 * t, W / 2 - t / 2, y, 0, col);
    wood.box(t, sh, Dp - 2 * t, -W / 2 + t / 2, y, 0, col);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) wood.box(0.05, wallH + 0.02, 0.05, sx * (W / 2 - 0.025), pal + (wallH + 0.02) / 2, sz * (Dp / 2 - 0.025), DARK_WOOD);
  // interior fill (hidden gaps)
  const fillTop = 0.34;
  wood.box(W - 0.05, fillTop, Dp - 0.05, 0, pal + fillTop / 2, 0, spec.fill || '#444');
  g.add(structMesh(wood.build(), woodMat(), 'BinBody'));

  const base = trans(0, pal, 0);
  heap(rng, stock, base, W - 0.04, Dp - 0.04, spec, { hFront: 0.44, hBack: 0.46, dome: 0.2, step: 1.0, margin: 0.04 });
  stock.build(g, rng);
  // sign on front wall (slightly tilted label hung on top slat)
  addSign(g, trans(0, pal + 0.17, Dp / 2 + 0.006).multiply(rotX(-0.04)), spec.name, spec.price, 0.4, 0.17);
  return g;
}

/* ------------------------------------------------------------------ */
/* 4. Scale stand                                                      */
/* ------------------------------------------------------------------ */
export function createScaleStand() {
  const g = new THREE.Group(); g.name = 'ScaleStand';
  const frame = new Build(), alu = new Build();
  // base plate & pole (dark powder-coated)
  frame.cyl(0.04, 0.04, 0.012, 14, 0, 0.006, 0, '#2c3136');
  frame.box(0.5, 0.03, 0.4, 0, 0.015, 0, '#30363c');
  frame.box(0.44, 0.012, 0.34, 0, 0.036, 0, '#3d454c');
  frame.cyl(0.026, 0.026, 0.88, 12, 0, 0.45, -0.08, '#4a525a');
  frame.cyl(0.042, 0.042, 0.03, 12, 0, 0.045, -0.08, '#2c3136');
  g.add(structMesh(frame.build(), solidMat({ roughness: 0.45, metalness: 0.4 }), 'StandBase'));
  // scale head: stainless platform + body
  alu.box(0.3, 0.07, 0.3, 0, 0.945, -0.02, '#d9dde0');
  alu.box(0.34, 0.016, 0.34, 0, 0.99, -0.02, '#e4e8eb');
  alu.box(0.36, 0.01, 0.36, 0, 0.9, -0.02, '#bfc5c9');
  g.add(structMesh(alu.build(), solidMat({ roughness: 0.28, metalness: 0.75 }), 'ScalePlatform'));
  // display column behind the platform, tilted back
  const col = new THREE.Mesh(boxGeo(0.28, 0.2, 0.06), stdMat('#cfd5da', { roughness: 0.4, metalness: 0.4 }));
  col.position.set(0, 1.1, -0.17); col.rotation.x = -0.18; col.castShadow = true; col.name = 'ScaleHead'; g.add(col);
  const scr = new THREE.Mesh(boxGeo(0.23, 0.11, 0.006), new THREE.MeshStandardMaterial({
    map: labelTexture('TERAZİ\n0,000 kg', { width: 384, height: 200, bg: '#12351f', fg: '#7dff8c', font: 'bold 62px monospace', border: '#cfd5da' }), emissive: '#1a5a30', emissiveMap: labelTexture('TERAZİ\n0,000 kg', { width: 384, height: 200, bg: '#12351f', fg: '#7dff8c', font: 'bold 62px monospace', border: '#cfd5da' }), emissiveIntensity: 0.6, roughness: 0.3,
  }));
  scr.position.set(0, 1.115, -0.17 + 0.0335 * Math.cos(0.18) + 0.001); scr.rotation.x = -0.18; scr.name = 'ScaleScreen'; g.add(scr);
  // bag roll holder: arm + roll + hanging bags
  const arm = new Build();
  arm.cyl(0.008, 0.008, 0.12, 6, 0, 1.32, -0.12, '#8a9298', Math.PI / 2, 0, 0);
  arm.box(0.34, 0.012, 0.012, 0, 1.38, -0.17, '#8a9298');
  arm.cyl(0.006, 0.006, 0.3, 6, 0, 1.31, -0.07, '#8a9298', 0, 0, Math.PI / 2);
  arm.cyl(0.01, 0.01, 0.1, 6, 0, 1.345, -0.15, '#8a9298');
  g.add(structMesh(arm.build(), solidMat({ roughness: 0.4, metalness: 0.5 }), 'BagArm', false));
  const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.28, 16), new THREE.MeshStandardMaterial({ color: '#f2f6f8', transparent: true, opacity: 0.55, roughness: 0.25, depthWrite: false }));
  roll.rotation.z = Math.PI / 2; roll.position.set(0, 1.31, -0.07); roll.name = 'BagRoll'; g.add(roll);
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.29, 10), stdMat('#d9b78a', { roughness: 0.8 }));
  core.rotation.z = Math.PI / 2; core.position.copy(roll.position); g.add(core);
  const sheetMat = new THREE.MeshStandardMaterial({ color: '#eef3f6', transparent: true, opacity: 0.4, roughness: 0.2, side: THREE.DoubleSide, depthWrite: false });
  for (let i = 0; i < 3; i++) {
    const sh = new THREE.Mesh(boxGeo(0.26, 0.2, 0.002), sheetMat);
    sh.position.set(0, 1.19 - i * 0.003, -0.01 + i * 0.012); sh.rotation.x = 0.08 + i * 0.03; sh.name = 'BagSheet'; g.add(sh);
  }
  // top sign
  const sign = addBanner(g, 'TERAZİ', 0.34, 0.07, 0, 1.43 - 0.035, -0.08, '#d62f2f', '#a61e1e', '#ffffff', 'none');
  sign.scale.set(1, 1, 0.5);
  // tiny price-per-kg hint plate on platform front
  return g;
}

/* ------------------------------------------------------------------ */
/* 5. Bread rack                                                       */
/* ------------------------------------------------------------------ */
function addBasket(B, { L, D, hb, hf }) {
  const t = 0.012;
  B.box(L, 0.016, D, 0, -0.008, 0, '#d6b27a');
  B.box(L, hb, t, 0, hb / 2, -D / 2 + t / 2, '#d6b27a');
  B.box(L, hf, t, 0, hf / 2, D / 2 - t / 2, '#d6b27a');
  const pts = [[-D / 2, 0], [D / 2, 0], [D / 2, hf], [-D / 2, hb]];
  B.prism(pts, t, L / 2 - t / 2, 0, 0, '#d6b27a');
  B.prism(pts, t, -L / 2 + t / 2, 0, 0, '#d6b27a');
  // rim
  B.box(L + 0.016, 0.014, 0.018, 0, hb + 0.004, -D / 2 + 0.009, '#a8793a');
  B.box(L + 0.016, 0.014, 0.018, 0, hf + 0.004, D / 2 - 0.009, '#a8793a');
}
export function createBreadRack({ length = 2.0, height = 1.9, depth = 0.6, seed = 1 } = {}) {
  const g = new THREE.Group(); g.name = 'BreadRack';
  const rng = seededRandom(seed);
  const wood = new Build(), wick = new Build(0.22), stock = new Stock();
  const t = 0.04;
  // carcass
  wood.box(length, height - 0.2, 0.025, 0, (height - 0.2) / 2, -depth / 2 + 0.0125, '#e8dcc4');
  for (const sx of [-1, 1]) wood.box(t, height - 0.2, depth, sx * (length / 2 - t / 2), (height - 0.2) / 2, 0, '#b88a56');
  wood.box(length, 0.1, depth, 0, 0.05, 0, '#8a5a34');          // plinth block
  const shelfY = [0.2, 0.58, 0.96, 1.34].map((y) => y * height / 1.9);
  const top = height - 0.2;
  for (const y of shelfY) wood.box(length - 2 * t, 0.03, depth - 0.03, 0, y, 0.0, '#c99d62');
  wood.box(length, 0.04, depth, 0, top - 0.02, 0, '#b88a56');   // top board
  // header box
  wood.box(length, 0.2, 0.2, 0, height - 0.1, -depth / 2 + 0.1, '#7a4d28');
  const types = ['somun', 'baguette', 'simit', 'pogaca'];
  const n = 4, gap = 0.02;
  const Lc = (length - 2 * t - 0.04 - gap * (n - 1)) / n;
  const Dc = depth - 0.12;
  const hb = 0.13, hf = 0.075, tilt = THREE.MathUtils.degToRad(9);
  const lift = (Dc / 2) * Math.sin(tilt) + 0.01;
  types.forEach((id, row) => {
    const spec = specOf(id);
    const yTop = shelfY[row] + 0.015;
    for (let i = 0; i < n; i++) {
      const x = -length / 2 + t + 0.02 + Lc / 2 + i * (Lc + gap);
      const base = trans(x, yTop + lift, 0.0).multiply(rotX(tilt));
      wick.setBase(base);
      addBasket(wick, { L: Lc, D: Dc, hb, hf });
      wood.setBase(trans(x, yTop, 0));
      wood.prism([[-Dc / 2, 0], [Dc / 2 - 0.02, 0], [-Dc / 2, 2 * lift]], Lc - 0.04, 0, 0, 0, '#8a5a34');
      heap(rng, stock, base, Lc, Dc, spec, { hFront: hf * 0.9, hBack: hb * 0.9, dome: 0.045, step: 1.0, margin: 0.025 });
    }
    // chalk tag on shelf edge
    addSign(g, trans(0, yTop - 0.025, depth / 2 - 0.012), spec.name, spec.price, 0.22, 0.05).rotation.x = -0.1;
  });
  wood.setBase(new THREE.Matrix4());
  g.add(structMesh(wood.build(), woodMat(), 'RackFrame'));
  g.add(structMesh(wick.build(), wickerMat(), 'Baskets', false));
  stock.build(g, rng);
  addBanner(g, 'FIRIN', length - 0.06, 0.2, 0, height - 0.1, -depth / 2 + 0.1 + 0.125, '#b8662a', '#8a431a', '#fff3d6', 'bread');
  return g;
}

/* ------------------------------------------------------------------ */
/* 6. Bakery case                                                      */
/* ------------------------------------------------------------------ */
export function createBakeryCase({ length = 2.0, depth = 0.9, height = 1.3, seed = 1 } = {}) {
  const g = new THREE.Group(); g.name = 'BakeryCase';
  const rng = seededRandom(seed);
  const body = new Build(), chrome = new Build(), glass = new Build(), trays = new Build(), stock = new Stock();
  const baseH = 0.7;
  // cabinet
  body.box(length, baseH - 0.1, depth - 0.04, 0, 0.1 + (baseH - 0.1) / 2, 0, '#f1ebe0');
  body.box(length - 0.06, 0.1, depth - 0.1, 0, 0.05, 0, '#2d2a28');
  body.box(length + 0.02, 0.035, depth + 0.02, 0, baseH - 0.0175, 0, '#c9ab78');
  for (const sx of [-1, 1]) body.box(0.05, height - baseH, 0.05, sx * (length / 2 - 0.0), baseH + (height - baseH) / 2, depth / 2 - 0.025, '#c0c6ca');
  // display deck (marble-ish)
  body.box(length - 0.04, 0.012, depth - 0.06, 0, baseH + 0.006, 0, '#efe9df');
  g.add(structMesh(body.build(), solidMat({ roughness: 0.5 }), 'CaseBody'));
  // chrome frame
  const yTop = height;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) chrome.box(0.03, height - baseH, 0.03, sx * (length / 2 - 0.015), baseH + (height - baseH) / 2, sz * (depth / 2 - 0.015), '#c0c6ca');
  chrome.box(length, 0.03, depth, 0, yTop - 0.015, 0, '#c0c6ca');
  chrome.box(length - 0.04, 0.02, 0.02, 0, 1.0 - 0.01, depth / 2 - 0.02, '#c0c6ca');
  chrome.box(length - 0.04, 0.02, 0.02, 0, 1.0 - 0.01, -depth / 2 + 0.02, '#c0c6ca');
  g.add(structMesh(chrome.build(), solidMat({ metalness: 0.7, roughness: 0.25 }), 'CaseFrame', false));
  // glass: front (slightly tilted), back, ends, upper shelf
  const gH = height - baseH - 0.03;
  glass.box(length - 0.04, gH, 0.004, 0, baseH + 0.012 + gH / 2, depth / 2 - 0.015, '#cfe6ee');
  glass.box(length - 0.04, gH, 0.004, 0, baseH + 0.012 + gH / 2, -depth / 2 + 0.015, '#cfe6ee');
  for (const sx of [-1, 1]) glass.box(0.004, gH, depth - 0.04, sx * (length / 2 - 0.015), baseH + 0.012 + gH / 2, 0, '#cfe6ee');
  glass.box(length - 0.05, 0.006, depth - 0.05, 0, 1.0, 0, '#cfe6ee');
  const glassMesh = new THREE.Mesh(glass.build(), new THREE.MeshStandardMaterial({ color: '#d6eef6', transparent: true, opacity: 0.2, roughness: 0.05, metalness: 0, depthWrite: false, side: THREE.DoubleSide, vertexColors: true }));
  glassMesh.name = 'Glass'; glassMesh.renderOrder = 2; g.add(glassMesh);
  // light strip
  const light = new THREE.Mesh(boxGeo(length - 0.12, 0.012, 0.04), new THREE.MeshStandardMaterial({ color: '#fff7e0', emissive: '#ffefc0', emissiveIntensity: 0.9 }));
  light.position.set(0, yTop - 0.036, depth / 2 - 0.14); light.name = 'LightStrip'; g.add(light);
  const light2 = light.clone(); light2.position.z = -depth / 2 + 0.14; g.add(light2);
  // front sign panel
  addBanner(g, 'PASTA  ·  BAKLAVA  ·  BÖREK', length - 0.3, 0.14, 0, 0.4, depth / 2 - 0.012, '#7a4a2a', '#5a3118', '#ffe9b8', 'bread').scale.z = 0.2;

  // trays
  const slots = 4, tw = (length - 0.1) / slots - 0.03, td = depth - 0.2;
  const layout = [
    [{ t: 'baklava', tag: ['Fıstıklı Baklava', '680 ₺/kg'] }, { t: 'borek', tag: ['Su Böreği', '320 ₺/kg'] }, { t: 'baklava', tag: ['Cevizli Baklava', '640 ₺/kg'] }, { t: 'cookie', tag: ['Kurabiye', '290 ₺/kg'] }],
    [{ t: 'cake', tag: ['Meyveli Pasta', '95 ₺/dilim'] }, { t: 'cake', tag: ['Çikolatalı Pasta', '95 ₺/dilim'] }, { t: 'cookie', tag: ['Un Kurabiyesi', '280 ₺/kg'] }, { t: 'baklava', tag: ['Şöbiyet', '720 ₺/kg'] }],
  ];
  const levels = [baseH + 0.012, 1.0 + 0.003];
  layout.forEach((row, li) => {
    const y = levels[li];
    row.forEach((cell, i) => {
      const x = -length / 2 + 0.05 + (tw + 0.03) * (i + 0.5);
      trays.setBase(trans(x, y, 0));
      trays.box(tw, 0.01, td, 0, 0.005, 0, '#d8dde0');
      trays.box(tw, 0.025, 0.01, 0, 0.0125, td / 2 - 0.005, '#c0c6ca');
      trays.box(tw, 0.025, 0.01, 0, 0.0125, -td / 2 + 0.005, '#c0c6ca');
      trays.box(0.01, 0.025, td, tw / 2 - 0.005, 0.0125, 0, '#c0c6ca');
      trays.box(0.01, 0.025, td, -tw / 2 + 0.005, 0.0125, 0, '#c0c6ca');
      const ix = tw / 2 - 0.03, iz = td / 2 - 0.03, ty = y + 0.01;
      if (cell.t === 'baklava') {
        const pitch = 0.048;
        const cx = Math.floor(2 * ix / pitch), cz = Math.floor(2 * iz / pitch);
        for (let a = 0; a < cx; a++) for (let b = 0; b < cz; b++) {
          const px = x - ix + (a + 0.5) * (2 * ix / cx), pz = -iz + (b + 0.5) * (2 * iz / cz);
          stock.add('baklava', trans(px, ty, pz));
        }
      } else if (cell.t === 'cookie') {
        const pitch = 0.062;
        const cx = Math.floor(2 * ix / pitch), cz = Math.floor(2 * iz / pitch);
        for (let a = 0; a < cx; a++) for (let b = 0; b < cz; b++) {
          const px = x - ix + (a + 0.5) * (2 * ix / cx) + (rng() - 0.5) * 0.01, pz = -iz + (b + 0.5) * (2 * iz / cz) + (rng() - 0.5) * 0.01;
          stock.add('cookie', mat4(px, ty, pz, 0, rng() * 6, 0));
          if (rng() < 0.5) stock.add('cookie', mat4(px + 0.004, ty + 0.011, pz, 0, rng() * 6, 0));
        }
      } else if (cell.t === 'borek') {
        const cx = Math.floor(2 * ix / 0.1), cz = Math.floor(2 * iz / 0.075);
        for (let a = 0; a < cx; a++) for (let b = 0; b < cz; b++) {
          const px = x - ix + (a + 0.5) * (2 * ix / cx), pz = -iz + (b + 0.5) * (2 * iz / cz);
          stock.add('borek', mat4(px, ty, pz, 0, (rng() - 0.5) * 0.12, 0));
        }
      } else {
        const cx = Math.max(1, Math.floor(2 * ix / 0.19)), cz = Math.max(1, Math.floor(2 * iz / 0.19));
        for (let a = 0; a < cx; a++) for (let b = 0; b < cz; b++) {
          const px = x - ix + (a + 0.5) * (2 * ix / cx), pz = -iz + (b + 0.5) * (2 * iz / cz);
          stock.add('cake', mat4(px, ty, pz, 0, rng() * 6, 0));
        }
      }
      addSign(g, trans(x, y + 0.036, td / 2 + 0.012).multiply(rotX(-0.45)), cell.tag[0], cell.tag[1], 0.15, 0.058);
    });
  });
  trays.setBase(new THREE.Matrix4());
  g.add(structMesh(trays.build(), solidMat({ metalness: 0.6, roughness: 0.3 }), 'Trays', false));
  stock.build(g, rng);
  return g;
}

/* ------------------------------------------------------------------ */
/* showcase                                                            */
/* ------------------------------------------------------------------ */
export function showcase() {
  const g = new THREE.Group(); g.name = 'ProduceShowcase';
  const put = (o, x, z, ry = 0) => { o.position.set(x, 0, z); o.rotation.y = ry; g.add(o); return o; };
  // back row (fronts face +Z)
  put(createProduceWallRack({ seed: 3 }), -2.2, -2.6);
  put(createBreadRack({ seed: 4 }), 1.0, -2.6);
  put(createBakeryCase({ seed: 5 }), 3.6, -2.6);
  // front row
  put(createProduceTable({ seed: 2 }), -2.2, 0.6);
  put(createBulkBin({ item: 'watermelon', seed: 6 }), -0.35, 0.6);
  put(createBulkBin({ item: 'potato', seed: 7 }), 1.0, 0.6);
  put(createScaleStand(), 2.3, 0.6);
  return g;
}

/** Extra views to verify that every item id renders (not part of the store layout). */
export function showcaseItems() {
  const g = new THREE.Group(); g.name = 'ProduceItems';
  const sets = [
    ['banana', 'tomato', 'cucumber', 'pepper_green'],
    ['eggplant', 'potato', 'onion', 'carrot'],
    ['watermelon', 'lettuce', 'grapes', 'pear'],
    ['peach', 'apple_red', 'lemon', 'orange'],
  ];
  sets.forEach((s, i) => { const t = createProduceTable({ items: s, seed: 10 + i }); t.position.set((i % 2) * 2.8 - 1.4, 0, Math.floor(i / 2) * 1.8 - 0.9); g.add(t); });
  ['onion', 'lettuce', 'pear'].forEach((id, i) => { const b = createBulkBin({ item: id, seed: 20 + i }); b.position.set(-2.4 + i * 1.4, 0, 3); g.add(b); });
  return g;
}
