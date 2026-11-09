// Bereket Market - building shell, exterior, signage helpers.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { seededRandom, stdMat, boxGeo } from './common.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Collects boxes/geometries per material and merges them into one mesh per material. */
class Merger {
  constructor() { this.map = new Map(); }
  geo(mat, g) {
    let l = this.map.get(mat);
    if (!l) { l = []; this.map.set(mat, l); }
    l.push(g);
  }
  /** Axis-aligned box by extents. */
  box(mat, x0, x1, y0, y1, z0, z1) {
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    this.geo(mat, g);
  }
  /** Vertical cylinder, base at y0. */
  cyl(mat, x, y0, z, r, h, seg = 10) {
    const g = new THREE.CylinderGeometry(r, r, h, seg);
    g.translate(x, y0 + h / 2, z);
    this.geo(mat, g);
  }
  merged(mat) {
    const l = this.map.get(mat);
    return l && l.length ? mergeGeometries(l, false) : null;
  }
  build(parent, name, cast, receive) {
    for (const [mat, list] of this.map) {
      const g = mergeGeometries(list, false);
      list.forEach((x) => x.dispose());
      const m = new THREE.Mesh(g, mat);
      m.name = name;
      m.castShadow = cast; m.receiveShadow = receive;
      parent.add(m);
    }
    this.map.clear();
  }
}

const _tex = new Map();
function canvasTex(key, size, draw) {
  let t = _tex.get(key);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  _tex.set(key, t);
  return t;
}

function speckle(g, size, rng, n, base, range, alpha) {
  for (let i = 0; i < n; i++) {
    const v = Math.floor(base + (rng() - 0.5) * range);
    g.fillStyle = `rgba(${v},${v},${v},${alpha})`;
    g.fillRect(rng() * size, rng() * size, 1 + rng() * 2, 1 + rng() * 2);
  }
}

// Floor: 2x2 tiles of 0.6 m => one texture cell = 1.2 m
const floorTex = () => canvasTex('floor', 512, (g, s) => {
  const rng = seededRandom(11);
  const n = 2, ts = s / n;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const v = 232 + Math.floor((rng() - 0.5) * 8);
    g.fillStyle = `rgb(${v},${v - 1},${v - 5})`;
    g.fillRect(i * ts, j * ts, ts, ts);
    const grd = g.createLinearGradient(i * ts, j * ts, (i + 1) * ts, (j + 1) * ts);
    grd.addColorStop(0, 'rgba(255,255,255,0.35)');
    grd.addColorStop(0.5, 'rgba(255,255,255,0)');
    grd.addColorStop(1, 'rgba(0,0,0,0.05)');
    g.fillStyle = grd; g.fillRect(i * ts, j * ts, ts, ts);
  }
  speckle(g, s, rng, 900, 200, 60, 0.12);
  g.strokeStyle = '#b8b7b0'; g.lineWidth = 5;
  for (let k = 0; k <= n; k++) {
    g.beginPath(); g.moveTo(k * ts, 0); g.lineTo(k * ts, s); g.stroke();
    g.beginPath(); g.moveTo(0, k * ts); g.lineTo(s, k * ts); g.stroke();
  }
});

// Ceiling: one 0.6 m acoustic tile
const ceilingTex = () => canvasTex('ceiling', 256, (g, s) => {
  const rng = seededRandom(5);
  g.fillStyle = '#f1f1ee'; g.fillRect(0, 0, s, s);
  speckle(g, s, rng, 1400, 205, 50, 0.35);
  g.strokeStyle = '#a9adb0'; g.lineWidth = 6; g.strokeRect(0, 0, s, s);
  g.strokeStyle = '#d3d5d6'; g.lineWidth = 2; g.strokeRect(5, 5, s - 10, s - 10);
});

// Sidewalk: one 1.5 m slab
const sidewalkTex = () => canvasTex('sidewalk', 512, (g, s) => {
  const rng = seededRandom(21);
  g.fillStyle = '#bdbab2'; g.fillRect(0, 0, s, s);
  speckle(g, s, rng, 2500, 170, 60, 0.25);
  g.strokeStyle = '#8c8a83'; g.lineWidth = 6;
  g.strokeRect(-3, -3, s + 6, s + 6);
});

const asphaltTex = () => canvasTex('asphalt', 256, (g, s) => {
  const rng = seededRandom(31);
  g.fillStyle = '#3c3f43'; g.fillRect(0, 0, s, s);
  speckle(g, s, rng, 3500, 70, 70, 0.5);
});

const grassTex = () => canvasTex('grass', 256, (g, s) => {
  const rng = seededRandom(41);
  g.fillStyle = '#5c8a47'; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 3000; i++) {
    const a = Math.floor(70 + rng() * 60), b = Math.floor(110 + rng() * 60);
    g.fillStyle = `rgba(${a},${b},${Math.floor(a * 0.6)},0.5)`;
    g.fillRect(rng() * s, rng() * s, 2, 2 + rng() * 3);
  }
});

/** Scale a geometry's UVs so a repeat texture tiles every `cell` metres. */
function scaleUV(g, sx, sy) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * sx, uv.getY(i) * sy);
  uv.needsUpdate = true;
  return g;
}

function planeXZ(w, d, y, up = true) {
  const g = new THREE.PlaneGeometry(w, d);
  g.rotateX(up ? -Math.PI / 2 : Math.PI / 2);
  g.translate(0, y, 0);
  return g;
}

// Sign / banner texture ----------------------------------------------------
const _signTex = new Map();
function signTexture(text, aspect, color, textColor, { px = 1024, sub = null } = {}) {
  const key = [text, aspect.toFixed(3), color, textColor, px, sub].join('|');
  let t = _signTex.get(key);
  if (t) return t;
  const w = px, h = Math.max(64, Math.round(px / aspect));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = color; g.fillRect(0, 0, w, h);
  const grd = g.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, 'rgba(255,255,255,0.18)');
  grd.addColorStop(0.55, 'rgba(255,255,255,0)');
  grd.addColorStop(1, 'rgba(0,0,0,0.18)');
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
  const m = h * 0.09;
  g.strokeStyle = textColor; g.globalAlpha = 0.55; g.lineWidth = Math.max(2, h * 0.025);
  g.strokeRect(m, m, w - 2 * m, h - 2 * m);
  g.globalAlpha = 1;
  g.fillStyle = textColor; g.textAlign = 'center'; g.textBaseline = 'middle';
  const fit = (str, size, maxW, weight = 'bold') => {
    let s = size;
    g.font = `${weight} ${s}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
    const mw = g.measureText(str).width;
    if (mw > maxW) { s = s * maxW / mw; g.font = `${weight} ${s}px "Helvetica Neue", Helvetica, Arial, sans-serif`; }
    return s;
  };
  if (sub) {
    fit(text, h * 0.5, w * 0.84); g.fillText(text, w / 2, h * 0.43);
    fit(sub, h * 0.16, w * 0.7, '600'); g.fillText(sub, w / 2, h * 0.78);
  } else {
    fit(text, h * 0.52, w * 0.86); g.fillText(text, w / 2, h * 0.53);
  }
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  _signTex.set(key, t);
  return t;
}

const _texMat = new Map();
function texMat(tex, opts = {}) {
  const key = tex.uuid + JSON.stringify(opts);
  let m = _texMat.get(key);
  if (!m) { m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, ...opts }); _texMat.set(key, m); }
  return m;
}

// Shared materials -------------------------------------------------------------
const M = {
  paint: stdMat('#f0ede4', { roughness: 0.95 }),
  coping: stdMat('#d9d6cf', { roughness: 0.9 }),
  green: stdMat('#2e7d32', { roughness: 0.55 }),
  rail: stdMat('#f7f5ef', { roughness: 0.6 }),
  skirt: stdMat('#454a4f', { roughness: 0.7 }),
  plinth: stdMat('#585c60', { roughness: 0.85 }),
  alum: stdMat('#c3c9cf', { metalness: 0.7, roughness: 0.35 }),
  dark: stdMat('#30353a', { metalness: 0.6, roughness: 0.4 }),
  glass: stdMat('#a8d4dc', { roughness: 0.05, metalness: 0.0, transparent: true, opacity: 0.22, depthWrite: false }),
  roof: stdMat('#6d7073', { roughness: 0.9 }),
  hvac: stdMat('#9aa1a7', { metalness: 0.4, roughness: 0.55 }),
  concrete: stdMat('#a7a59e', { roughness: 0.95 }),
  white: stdMat('#f2f2ee', { roughness: 0.8 }),
  blue: stdMat('#1f5fa8', { roughness: 0.8 }),
  doorGray: stdMat('#8a9096', { metalness: 0.3, roughness: 0.5 }),
  lamp: stdMat('#fff1c9', { emissive: '#fff1c9', emissiveIntensity: 1.6, roughness: 0.5 }),
  led: stdMat('#ffffff', { emissive: '#fff8e8', emissiveIntensity: 2.2, roughness: 0.5 }),
  ledFrame: stdMat('#c9cccf', { roughness: 0.5, metalness: 0.2 }),
  exit: stdMat('#1faa4b', { emissive: '#1faa4b', emissiveIntensity: 1.4, roughness: 0.5 }),
  cable: stdMat('#2b2e31', { roughness: 0.5, metalness: 0.4 }),
};

// ---------------------------------------------------------------------------
// Building
// ---------------------------------------------------------------------------
export function createBuilding({ width = 40, depth = 30, height = 5, entranceX = 12, entranceWidth = 3.2, ceiling = true, groundSize = 70 } = {}) {
  const group = new THREE.Group();
  group.name = 'Building';
  const T = 0.25;
  const hw = width / 2, hd = depth / 2;
  const z0 = hd + T;                 // outer face of the front wall
  const zc = hd + T / 2;             // centre plane of the front wall
  const W = entranceWidth;
  const e0 = entranceX - W / 2, e1 = entranceX + W / 2;
  const bandH = 1.2, glassTop = height - bandH, glassBot = 0.6, doorH = 2.4;
  const lx0 = -(hw + T), lx1 = hw + T, lotEnd = z0 + 16;

  const S = new Merger();      // structure: casts + receives shadow
  const D = new Merger();      // details: no shadow cast
  const G = new Merger();      // glass

  // ---- Floor ------------------------------------------------------------
  {
    const floorMat = new THREE.MeshStandardMaterial({ map: floorTex(), roughness: 0.35, metalness: 0.0 });
    const g = scaleUV(planeXZ(width, depth, 0, true), width / 1.2, depth / 1.2);
    const f = new THREE.Mesh(g, floorMat);
    f.name = 'Floor'; f.receiveShadow = true;
    group.add(f);
  }

  // ---- Side + back walls (paint) -------------------------------------------
  S.box(M.paint, -hw - T, -hw, 0, height, -hd - T, z0);   // left
  S.box(M.paint, hw, hw + T, 0, height, -hd - T, z0);     // right
  S.box(M.paint, -hw, hw, 0, height, -hd - T, -hd);       // back
  S.box(M.paint, -hw, hw, height - bandH, height, hd, z0); // front solid band

  // Front plinth (dark) either side of the doorway
  S.box(M.plinth, -hw, e0, 0, glassBot, hd, z0);
  S.box(M.plinth, e1, hw, 0, glassBot, hd, z0);

  const P = new Merger();      // parapet (part of the removable top)
  const pH = 0.9;
  // Parapet ring + coping
  P.box(M.paint, -hw - T, -hw, height, height + pH, -hd - T, z0);
  P.box(M.paint, hw, hw + T, height, height + pH, -hd - T, z0);
  P.box(M.paint, -hw, hw, height, height + pH, -hd - T, -hd);
  P.box(M.paint, -hw, hw, height, height + pH, hd, z0);
  const cp = 0.05;
  P.box(M.coping, -hw - T - cp, hw + T + cp, height + pH, height + pH + 0.1, -hd - T - cp, -hd + 0.0);
  P.box(M.coping, -hw - T - cp, hw + T + cp, height + pH, height + pH + 0.1, hd, z0 + cp);
  P.box(M.coping, -hw - T - cp, -hw, height + pH, height + pH + 0.1, -hd, hd);
  P.box(M.coping, hw, hw + T + cp, height + pH, height + pH + 0.1, -hd, hd);

  // Exterior: dark plinth + green stripe on the parapet
  const ex = 0.02;
  S.box(M.plinth, -hw - T - ex, -hw - T, 0, 0.6, -hd - T - ex, z0 + ex);
  S.box(M.plinth, hw + T, hw + T + ex, 0, 0.6, -hd - T - ex, z0 + ex);
  S.box(M.plinth, -hw - T, hw + T, 0, 0.6, -hd - T - ex, -hd - T);
  const sy0 = height + 0.45, sy1 = height + 0.72;
  P.box(M.green, -hw - T - ex, -hw - T, sy0, sy1, -hd - T - ex, z0 + ex);
  P.box(M.green, hw + T, hw + T + ex, sy0, sy1, -hd - T - ex, z0 + ex);
  P.box(M.green, -hw - T, hw + T, sy0, sy1, -hd - T - ex, -hd - T);
  P.box(M.green, -hw - T, hw + T, sy0, sy1, z0, z0 + ex);
  // Corner pilasters
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const cx = sx * (hw + T), cz = sz < 0 ? -hd - T : z0;
    const xa = cx - 0.2, xb = cx + 0.2;
    S.box(M.green, xa, xb, 0, height, cz - 0.2, cz + 0.2);
    P.box(M.green, xa, xb, height, height + 1.12, cz - 0.2, cz + 0.2);
  }

  // ---- Interior wall trim -------------------------------------------------
  const iy0 = 0.1, iy1 = 1.1, tp = 0.02;
  for (const [xa, xb] of [[-hw, -hw + tp], [hw - tp, hw]]) {
    D.box(M.green, xa, xb, iy0, iy1, -hd, hd);
    D.box(M.rail, xa - 0.01 * Math.sign(xa), xb + 0.01 * Math.sign(xa), iy1, iy1 + 0.05, -hd, hd);
  }
  D.box(M.green, -hw, hw, iy0, iy1, -hd, -hd + tp);
  D.box(M.rail, -hw, hw, iy1, iy1 + 0.05, -hd, -hd + 0.03);
  D.box(M.skirt, -hw, -hw + 0.015, 0, iy0, -hd, hd);
  D.box(M.skirt, hw - 0.015, hw, 0, iy0, -hd, hd);
  D.box(M.skirt, -hw, hw, 0, iy0, -hd, -hd + 0.015);

  // ---- Storefront (front wall, z = +depth/2) ----------------------------------
  const gT = 0.03;
  const gLeft = [-hw, e0], gRight = [e1, hw];
  for (const [a, b] of [gLeft, gRight]) {
    G.box(M.glass, a, b, glassBot, glassTop, zc - gT / 2, zc + gT / 2);
    // mullions
    const n = Math.max(1, Math.round((b - a) / 2.2));
    for (let i = 0; i <= n; i++) {
      const x = a + (b - a) * i / n;
      if (i === 0 && a === -hw) continue;      // flush with side wall
      if (i === n && b === hw) continue;
      if (Math.abs(x - e0) < 0.01 || Math.abs(x - e1) < 0.01) continue; // jambs handled below
      D.box(M.alum, x - 0.035, x + 0.035, glassBot, glassTop, zc - 0.07, zc + 0.07);
    }
    // rails
    D.box(M.alum, a, b, glassBot, glassBot + 0.1, zc - 0.08, zc + 0.08);
    D.box(M.alum, a, b, glassTop - 0.1, glassTop, zc - 0.08, zc + 0.08);
  }
  // transom glass over the doorway + header track
  G.box(M.glass, e0, e1, doorH + 0.15, glassTop, zc - gT / 2, zc + gT / 2);
  D.box(M.dark, e0 - W * 0.5, e1 + W * 0.5, doorH, doorH + 0.15, zc - 0.12, zc + 0.12);
  D.box(M.dark, e0 - W * 0.5, e1 + W * 0.5, doorH + 0.15, doorH + 0.2, zc - 0.07, zc + 0.07);
  // jambs
  for (const x of [e0, e1]) D.box(M.dark, x - 0.05, x + 0.05, 0, glassTop, zc - 0.09, zc + 0.09);
  // threshold + sensor
  D.box(M.alum, e0, e1, 0, 0.012, zc - 0.14, zc + 0.14);
  D.box(M.dark, entranceX - 0.18, entranceX + 0.18, doorH + 0.2, doorH + 0.3, z0 + 0.0, z0 + 0.1);

  // ---- Canopy + vestibule wings --------------------------------------------------
  {
    const cx0 = e0 - 1.0, cx1 = e1 + 1.0, cdep = 2.4, cy = 3.1;
    D.box(M.dark, cx0, cx1, cy, cy + 0.15, z0, z0 + cdep);
    D.box(M.green, cx0, cx1, cy - 0.12, cy + 0.3, z0 + cdep - 0.08, z0 + cdep);
    D.box(M.green, cx0, cx0 + 0.08, cy - 0.12, cy + 0.3, z0, z0 + cdep - 0.08);
    D.box(M.green, cx1 - 0.08, cx1, cy - 0.12, cy + 0.3, z0, z0 + cdep - 0.08);
    D.box(M.lamp, cx0 + 0.6, cx1 - 0.6, cy - 0.016, cy, z0 + 0.5, z0 + 0.7);
    D.box(M.lamp, cx0 + 0.6, cx1 - 0.6, cy - 0.016, cy, z0 + 1.5, z0 + 1.7);
    for (const x of [cx0 + 0.16, cx1 - 0.16]) D.box(M.alum, x - 0.05, x + 0.05, 0, cy, z0 + cdep - 0.2, z0 + cdep - 0.1);
    // glass wings
    for (const sx of [-1, 1]) {
      const wx = sx < 0 ? e0 : e1;
      G.box(M.glass, wx - 0.03, wx + 0.03, 0.1, cy, z0, z0 + 1.6);
      D.box(M.alum, wx - 0.04, wx + 0.04, 0, cy, z0 + 1.55, z0 + 1.65);
      D.box(M.alum, wx - 0.04, wx + 0.04, 0, 0.1, z0, z0 + 1.65);
    }
  }

  // ---- Store sign "BEREKET MARKET" ----------------------------------------------
  {
    const sw = Math.min(9, width * 0.5), sh = 1.6;
    const sx = THREE.MathUtils.clamp(entranceX, -hw + sw / 2 + 1, hw - sw / 2 - 1);
    const sy = height - 1.1;
    D.box(M.alum, sx - sw / 2 - 0.1, sx + sw / 2 + 0.1, sy - 0.1, sy + sh + 0.1, z0, z0 + 0.12);
    const tex = signTexture('BEREKET MARKET', sw / sh, '#2e7d32', '#ffffff', { px: 2048, sub: 'TAZE • UYGUN • GÜVENİLİR' });
    const mat = texMat(tex, { emissive: new THREE.Color(0xffffff), emissiveMap: tex, emissiveIntensity: 0.5, roughness: 0.5 });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), mat);
    p.position.set(sx, sy + sh / 2, z0 + 0.13);
    p.name = 'StoreSign';
    group.add(p);
  }

  // ---- Back wall: staff door "PERSONEL" ---------------------------------------------
  {
    const xD = 3, dw = 1.0, dh = 2.1;
    // interior face
    const zi = -hd;
    D.box(M.dark, xD - dw / 2 - 0.07, xD - dw / 2, 0, dh + 0.07, zi + 0.02, zi + 0.08);
    D.box(M.dark, xD + dw / 2, xD + dw / 2 + 0.07, 0, dh + 0.07, zi + 0.02, zi + 0.08);
    D.box(M.dark, xD - dw / 2 - 0.07, xD + dw / 2 + 0.07, dh, dh + 0.07, zi + 0.02, zi + 0.08);
    D.box(M.doorGray, xD - dw / 2, xD + dw / 2, 0, dh, zi + 0.02, zi + 0.06);
    D.box(M.alum, xD - dw / 2, xD + dw / 2, 0, 0.25, zi + 0.06, zi + 0.07);
    D.box(M.alum, xD + dw / 2 - 0.2, xD + dw / 2 - 0.1, 0.95, 1.0, zi + 0.06, zi + 0.12);
    D.box(M.alum, xD + dw / 2 - 0.2, xD + dw / 2 - 0.15, 0.95, 1.1, zi + 0.06, zi + 0.12);
    // exterior face
    const zo = -hd - T;
    D.box(M.dark, xD - dw / 2 - 0.07, xD + dw / 2 + 0.07, 0, dh + 0.07, zo - 0.06, zo);
    D.box(M.doorGray, xD - dw / 2, xD + dw / 2, 0, dh, zo - 0.08, zo - 0.06);
    D.box(M.alum, xD + dw / 2 - 0.2, xD + dw / 2 - 0.1, 0.95, 1.0, zo - 0.14, zo - 0.08);
    D.box(M.alum, xD + dw / 2 - 0.2, xD + dw / 2 - 0.15, 0.95, 1.1, zo - 0.14, zo - 0.08);
    // exit sign (interior)
    D.box(M.exit, xD - 0.3, xD + 0.3, dh + 0.3, dh + 0.5, zi + 0.0, zi + 0.04);
    // PERSONEL labels
    const tex = signTexture('PERSONEL', 1.2 / 0.28, '#2b2e31', '#ffffff', { px: 512 });
    const lm = texMat(tex, { roughness: 0.5 });
    const geo = new THREE.PlaneGeometry(1.2, 0.28);
    const a = new THREE.Mesh(geo, lm); a.position.set(xD, dh + 0.82, zi + 0.012); a.name = 'PersonelLabel';
    group.add(a);
    const b = new THREE.Mesh(geo, lm); b.position.set(xD, dh + 0.3, zo - 0.012); b.rotation.y = Math.PI; b.name = 'PersonelLabelOut';
    group.add(b);
    // exit text strip
    const et = signTexture('ÇIKIŞ', 0.6 / 0.2, '#1faa4b', '#ffffff', { px: 256 });
    const e = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.2), texMat(et, { emissive: new THREE.Color(0xffffff), emissiveMap: et, emissiveIntensity: 0.8 }));
    e.position.set(xD, dh + 0.4, zi + 0.045); e.name = 'ExitSign';
    group.add(e);
  }

  // ---- Roof / ceiling ----------------------------------------------------------------
  const top = new THREE.Object3D();
  top.name = 'CeilingAndRoof';
  group.add(top);
  if (ceiling) {
    P.build(top, 'Parapet', false, true);
    const mat = new THREE.MeshStandardMaterial({ map: ceilingTex(), roughness: 0.95 });
    const g = scaleUV(planeXZ(width, depth, height, false), width / 0.6, depth / 0.6);
    const c = new THREE.Mesh(g, mat);
    c.name = 'Ceiling'; c.receiveShadow = true;
    top.add(c);

    const R = new Merger();
    R.box(M.roof, -hw, hw, height + 0.01, height + 0.25, -hd, hd);
    R.box(M.hvac, -hw * 0.5 - 1.5, -hw * 0.5 + 1.5, height + 0.25, height + 1.4, -2.5, 0);
    R.box(M.hvac, hw * 0.3 - 1.5, hw * 0.3 + 1.5, height + 0.25, height + 1.4, -6, -3.5);
    R.box(M.hvac, hw * 0.3 - 1.5, hw * 0.3 + 1.5, height + 0.25, height + 1.4, -2.5, 0);
    R.build(top, 'Roof', false, true);

    // LED panels (aligned to 0.6 m tile grid)
    const nx = Math.max(1, Math.floor(width / 4.8)), nz = Math.max(1, Math.floor(depth / 3.0));
    const ox = Math.round(((width - nx * 4.8) / 2) / 0.6) * 0.6;
    const oz = Math.round(((depth - nz * 3.0) / 2) / 0.6) * 0.6;
    const count = nx * nz;
    const led = new THREE.InstancedMesh(boxGeo(1.2, 0.03, 0.6), M.led, count);
    const fr = new THREE.InstancedMesh(boxGeo(1.32, 0.03, 0.72), M.ledFrame, count);
    led.name = 'LedPanels'; fr.name = 'LedFrames';
    const m4 = new THREE.Matrix4();
    let k = 0;
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const x = -hw + ox + 2.4 + 4.8 * i;
      const z = -hd + oz + 1.5 + 3.0 * j;
      m4.makeTranslation(x, height - 0.025, z); led.setMatrixAt(k, m4);
      m4.makeTranslation(x, height - 0.015, z); fr.setMatrixAt(k, m4);
      k++;
    }
    led.instanceMatrix.needsUpdate = true; fr.instanceMatrix.needsUpdate = true;
    top.add(fr, led);
  }

  // ---- Exterior ground ---------------------------------------------------------------
  {
    const gw = groundSize, gd = groundSize, gcz = 8;
    const gmat = new THREE.MeshStandardMaterial({ map: grassTex(), roughness: 1 });
    const gg = scaleUV(planeXZ(gw, gd, -0.03, true), gw / 4, gd / 4);
    gg.translate(0, 0, gcz);
    const gm = new THREE.Mesh(gg, gmat); gm.name = 'Ground'; gm.receiveShadow = true;
    group.add(gm);

    // asphalt lot
    const lotW = lx1 - lx0 - 0.3, lotD = lotEnd - 0.15 - (z0 + 2.9);
    const ag = scaleUV(planeXZ(lotW, lotD, 0.012, true), lotW / 3, lotD / 3);
    ag.translate(0, 0, z0 + 2.9 + lotD / 2);
    const am = new THREE.Mesh(ag, new THREE.MeshStandardMaterial({ map: asphaltTex(), roughness: 0.95 }));
    am.name = 'Asphalt'; am.receiveShadow = true;
    group.add(am);

    // sidewalk
    const swW = lx1 - lx0 - 0.3, swD = 2.75;
    const sg = new THREE.BoxGeometry(swW, 0.04, swD);
    scaleUV(sg, swW / 1.5, swD / 1.5);
    sg.translate(0, 0.02, z0 + swD / 2);
    const sm = new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ map: sidewalkTex(), roughness: 0.9 }));
    sm.name = 'Sidewalk'; sm.receiveShadow = true;
    group.add(sm);

    // curbs
    const F = new Merger();
    F.box(M.concrete, lx0, lx1, 0, 0.12, z0 + 2.75, z0 + 2.9);
    F.box(M.concrete, lx0, lx0 + 0.15, 0, 0.12, z0, lotEnd);
    F.box(M.concrete, lx1 - 0.15, lx1, 0, 0.12, z0, lotEnd);
    F.box(M.concrete, lx0, lx1, 0, 0.12, lotEnd - 0.15, lotEnd);

    // parking lines (far row of stalls)
    const innerW = lx1 - lx0 - 0.3;
    const ns = Math.floor(innerW / 2.6), start = -ns * 2.6 / 2;
    const sz0 = lotEnd - 0.15 - 4.85;
    let dis = 0, best = 1e9;
    for (let i = 0; i < ns; i++) {
      const cx = start + 2.6 * (i + 0.5);
      if (Math.abs(cx - entranceX) < best) { best = Math.abs(cx - entranceX); dis = i; }
    }
    for (let i = 0; i <= ns; i++) {
      const x = start + 2.6 * i;
      F.box(M.white, x - 0.05, x + 0.05, 0.012, 0.02, sz0, lotEnd - 0.15);
    }
    F.box(M.white, start - 0.05, start + ns * 2.6 + 0.05, 0.012, 0.02, sz0 - 0.1, sz0);
    // accessible stall marking
    {
      const cx = start + 2.6 * (dis + 0.5), cz = sz0 + 2.4;
      F.box(M.blue, cx - 0.6, cx + 0.6, 0.012, 0.019, cz - 0.6, cz + 0.6);
      F.box(M.white, cx - 0.12, cx + 0.12, 0.019, 0.021, cz - 0.4, cz + 0.4);
      F.box(M.white, cx - 0.4, cx + 0.4, 0.019, 0.021, cz - 0.12, cz + 0.12);
    }
    // zebra crossing in front of the entrance
    for (let z = z0 + 3.3; z < sz0 - 0.8; z += 0.9)
      F.box(M.white, entranceX - 2.0, entranceX + 2.0, 0.012, 0.02, z, z + 0.45);

    // light poles on the sidewalk edge
    const poleZ = z0 + 2.4;
    for (const f of [-0.375, -0.125, 0.125, 0.375]) {
      const px = f * width;
      if (Math.abs(px - entranceX) < 3) continue;
      F.cyl(M.dark, px, 0.04, poleZ, 0.07, 5.5, 8);
      F.box(M.dark, px - 0.05, px + 0.05, 5.4, 5.5, poleZ, poleZ + 1.3);
      F.box(M.lamp, px - 0.3, px + 0.3, 5.34, 5.4, poleZ + 0.85, poleZ + 1.3);
      F.cyl(M.dark, px, 0.04, poleZ, 0.15, 0.25, 8);
    }
    F.build(group, 'Exterior', false, true);
  }

  S.build(group, 'Walls', false, true);
  G.build(group, 'Glass', false, false);
  D.build(group, 'Trim', false, true);

  // ---- Sliding doors -------------------------------------------------------------------
  const lw = W / 2 + 0.04;
  const leafFrameGeo = (() => {
    const L = new Merger();
    L.box(M.alum, -lw / 2, -lw / 2 + 0.08, 0, doorH, -0.03, 0.03);
    L.box(M.alum, lw / 2 - 0.08, lw / 2, 0, doorH, -0.03, 0.03);
    L.box(M.alum, -lw / 2, lw / 2, doorH - 0.12, doorH, -0.03, 0.03);
    L.box(M.alum, -lw / 2, lw / 2, 0, 0.18, -0.03, 0.03);
    return L.merged(M.alum);
  })();
  const leafGlassGeo = new THREE.BoxGeometry(lw - 0.16, doorH - 0.3, 0.02).translate(0, 0.18 + (doorH - 0.3) / 2, 0);
  const leaves = [];
  for (const side of [-1, 1]) {
    const leaf = new THREE.Group();
    leaf.name = side < 0 ? 'DoorLeafL' : 'DoorLeafR';
    const fm = new THREE.Mesh(leafFrameGeo, M.alum); fm.castShadow = false;
    const gm = new THREE.Mesh(leafGlassGeo, M.glass);
    leaf.add(fm, gm);
    const closedX = side < 0 ? e0 + lw / 2 : e1 - lw / 2;
    leaf.position.set(closedX, 0, zc + (side < 0 ? 0.06 : -0.06));
    leaf.userData.closedX = closedX;
    leaf.userData.side = side;
    group.add(leaf);
    leaves.push(leaf);
  }

  let open = 0, openEased = 0;
  const _v = new THREE.Vector3();
  group.userData.update = (dt, ctx) => {
    if (!ctx || !ctx.playerPosition) return;
    _v.copy(ctx.playerPosition);
    group.worldToLocal(_v);
    const near = Math.hypot(_v.x - entranceX, _v.z - zc) < 4;
    const target = near ? 1 : 0;
    const step = Math.min(dt, 0.1) / 0.9;
    open += THREE.MathUtils.clamp(target - open, -step, step);
    const e = open * open * (3 - 2 * open);
    if (e === openEased) return;
    openEased = e;
    for (const leaf of leaves) leaf.position.x = leaf.userData.closedX + leaf.userData.side * (W / 2 - 0.02) * e;
  };

  // ---- Colliders -------------------------------------------------------------------------
  const H = height;
  group.userData.colliders = [
    { min: [-hw - T, 0, -hd - T], max: [-hw, H, z0] },
    { min: [hw, 0, -hd - T], max: [hw + T, H, z0] },
    { min: [-hw, 0, -hd - T], max: [hw, H, -hd] },
    { min: [-hw, 0, hd], max: [e0, H, z0] },
    { min: [e1, 0, hd], max: [hw, H, z0] },
    // vestibule glass wings
    { min: [e0 - 0.08, 0, z0], max: [e0 + 0.08, H, z0 + 1.65] },
    { min: [e1 - 0.08, 0, z0], max: [e1 + 0.08, H, z0 + 1.65] },
    // parking lot boundary (outside the curb)
    { min: [lx0 - 1, 0, lotEnd], max: [lx1 + 1, 3, lotEnd + 1] },
    { min: [lx0 - 1, 0, z0], max: [lx0, 3, lotEnd + 1] },
    { min: [lx1, 0, z0], max: [lx1 + 1, 3, lotEnd + 1] },
  ];
  group.userData.ceiling = top;
  group.userData.entrance = { x: entranceX, z: zc, width: W };
  group.userData.staffDoor = { x: 3, z: -hd, width: 1.0 };
  group.userData.door = group.userData.entrance;
  group.userData.exterior = { x: [lx0, lx1], z: [-hd - T, lotEnd] };
  return group;
}

// ---------------------------------------------------------------------------
// Hanging department sign
// ---------------------------------------------------------------------------
export function createHangingSign(text, { width = 3, height = 0.6, color = '#2e7d32', textColor = '#ffffff', hangHeight = 3.0, ceilingHeight = 5 } = {}) {
  const group = new THREE.Group();
  group.name = 'HangingSign';
  const th = 0.06;
  const cy = hangHeight + height / 2;
  const body = new THREE.Mesh(boxGeo(width, height, th), stdMat(color, { roughness: 0.5 }));
  body.position.set(0, cy, 0);
  body.castShadow = false;
  const tex = signTexture(text, width / height, color, textColor, { px: 1024 });
  const mat = texMat(tex, { roughness: 0.5 });
  const pg = new THREE.PlaneGeometry(width, height);
  const front = new THREE.Mesh(pg, mat); front.position.set(0, cy, th / 2 + 0.001);
  const back = new THREE.Mesh(pg, mat); back.position.set(0, cy, -th / 2 - 0.001); back.rotation.y = Math.PI;
  const cb = new Merger();
  const len = Math.max(0.05, ceilingHeight - hangHeight - height);
  const cx = Math.max(0.1, width / 2 - 0.25);
  for (const s of [-1, 1]) {
    cb.cyl(M.cable, s * cx, hangHeight + height, 0, 0.006, len, 5);
    cb.cyl(M.cable, s * cx, ceilingHeight - 0.02, 0, 0.035, 0.02, 8);
    cb.cyl(M.cable, s * cx, hangHeight + height, 0, 0.02, 0.03, 8);
  }
  group.add(body, front, back);
  cb.build(group, 'Cables', false, false);
  group.userData.noCollide = true;
  return group;
}

// ---------------------------------------------------------------------------
// Wall banner
// ---------------------------------------------------------------------------
export function createWallGraphic(text, { width = 6, height = 1.2, color = '#2e7d32', textColor = '#ffffff' } = {}) {
  const group = new THREE.Group();
  group.name = 'WallGraphic';
  const back = new THREE.Mesh(boxGeo(width, height, 0.02), stdMat(color, { roughness: 0.7 }));
  back.position.set(0, height / 2, 0.01);
  const tex = signTexture(text, width / height, color, textColor, { px: 2048 });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(width, height), texMat(tex, { roughness: 0.7 }));
  face.position.set(0, height / 2, 0.0205);
  group.add(back, face);
  group.userData.noCollide = true;
  return group;
}

// ---------------------------------------------------------------------------
// Showcases
// ---------------------------------------------------------------------------
export function showcase() {
  return createBuilding();
}

export function showcaseInterior() {
  const g = createBuilding({ ceiling: false });
  const s1 = createHangingSign('MEYVE & SEBZE', { width: 3.2 }); s1.position.set(-8, 0, 0);
  const s2 = createHangingSign('SÜT ÜRÜNLERİ', { width: 3.2, color: '#1565c0' }); s2.position.set(4, 0, 4);
  const w1 = createWallGraphic('TAZE MEYVE & SEBZE', { width: 6, height: 1.2 }); w1.position.set(0, 2.2, -15 + 0.012);
  const w2 = createWallGraphic('ŞARKÜTERİ & PEYNİR', { width: 5, height: 1.0, color: '#b3261e' });
  w2.rotation.y = Math.PI / 2; w2.position.set(-20 + 0.012, 2.2, 0);
  g.add(s1, s2, w1, w2);
  return g;
}
