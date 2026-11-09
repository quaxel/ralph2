// Shared helpers for all model modules. Keep this file small and stable.
import * as THREE from 'three';

/** Deterministic PRNG (mulberry32). rng() -> [0,1) */
export function seededRandom(seed = 1) {
  let a = (seed >>> 0) || 1;
  return function rng() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pick a random element using a rng from seededRandom */
export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

const _matCache = new Map();
/**
 * Cached MeshStandardMaterial. `opts` must only contain primitive values
 * (roughness, metalness, emissive, emissiveIntensity, transparent, opacity, side, flatShading).
 * For textured materials create and cache your own.
 */
export function stdMat(color, opts = {}) {
  const key = color + '|' + JSON.stringify(opts);
  let m = _matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.0, ...opts });
    _matCache.set(key, m);
  }
  return m;
}

const _boxCache = new Map();
/** Cached BoxGeometry */
export function boxGeo(w, h, d) {
  const key = `${w}|${h}|${d}`;
  let g = _boxCache.get(key);
  if (!g) { g = new THREE.BoxGeometry(w, h, d); _boxCache.set(key, g); }
  return g;
}

/** Mesh helper: box whose BOTTOM-CENTER sits at (x, y, z). */
export function boxAt(w, h, d, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(boxGeo(w, h, d), material);
  m.position.set(x, y + h / 2, z);
  return m;
}

const _texCache = new Map();
/**
 * Cached CanvasTexture with centered text (supports '\n' for multiple lines).
 * opts: { width=512, height=128, bg='#ffffff', fg='#000000', font='bold 72px sans-serif', border=null }
 */
export function labelTexture(text, opts = {}) {
  const o = { width: 512, height: 128, bg: '#ffffff', fg: '#000000', font: 'bold 72px sans-serif', border: null, ...opts };
  const key = text + '|' + JSON.stringify(o);
  let t = _texCache.get(key);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = o.width; c.height = o.height;
  const g = c.getContext('2d');
  if (o.bg) { g.fillStyle = o.bg; g.fillRect(0, 0, o.width, o.height); }
  if (o.border) { g.strokeStyle = o.border; g.lineWidth = Math.max(4, o.height * 0.05); g.strokeRect(0, 0, o.width, o.height); }
  g.fillStyle = o.fg; g.font = o.font; g.textAlign = 'center'; g.textBaseline = 'middle';
  const lines = String(text).split('\n');
  const lh = o.height / (lines.length + 0.4);
  lines.forEach((ln, i) => g.fillText(ln, o.width / 2, lh * (i + 0.7), o.width * 0.94));
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  _texCache.set(key, t);
  return t;
}

/** Set castShadow / receiveShadow on every mesh under obj. */
export function setShadows(obj, cast = true, receive = true) {
  obj.traverse((o) => { if (o.isMesh) { o.castShadow = cast; o.receiveShadow = receive; } });
  return obj;
}
