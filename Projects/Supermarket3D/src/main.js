// Bereket Market 3D — app entry: renderer, lighting, store assembly, navigation modes, collisions, HUD.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { createRenderer, applyEnvironment } from './env.js';
import { buildStore, populate, STORE, AREAS, LANES, LANE_Z, WALKWAY_OFFSET } from './layout.js';

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot'); // automated screenshot preset (see PRESETS)
const EYE = 1.65;
const PLAYER_R = 0.28;

window.__errors = [];
addEventListener('error', (e) => window.__errors.push(String(e.message)));
addEventListener('unhandledrejection', (e) => window.__errors.push(String(e.reason && e.reason.stack || e.reason)));

const $ = (id) => document.getElementById(id);
const isTouch = matchMedia('(pointer: coarse)').matches;
if (isTouch) document.body.classList.add('touch');

// ---------------------------------------------------------------- renderer / scene
const renderer = createRenderer(document.body);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
const SKY = new THREE.Color(0xb7d3ea);
scene.background = SKY;
scene.fog = new THREE.Fog(SKY, 60, 160);
applyEnvironment(renderer, scene, 0.45);

const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.05, 400);

// Lighting: soft hemisphere fill + one overhead directional light for contact shadows.
scene.add(new THREE.HemisphereLight(0xfffdf7, 0xb8b2a6, 1.35));
const keyLight = new THREE.DirectionalLight(0xfff6e8, 1.6);
keyLight.position.set(6, 40, 12);
keyLight.target.position.set(0, 0, 4);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(4096, 4096);
Object.assign(keyLight.shadow.camera, { left: -26, right: 26, top: 30, bottom: -30, near: 10, far: 70 });
keyLight.shadow.bias = -0.0004;
keyLight.shadow.normalBias = 0.02;
scene.add(keyLight, keyLight.target);

// ---------------------------------------------------------------- loading
const MODULES = ['building', 'shelving', 'refrigeration', 'checkout', 'produce', 'props'];
const bar = $('bar').firstElementChild;
async function loadModules() {
  const mods = {};
  let n = 0;
  await Promise.all(MODULES.map(async (m) => {
    try { mods[m] = await import(`./models/${m}.js`); }
    catch (e) { console.error(`[main] models/${m}.js failed to load`, e); window.__errors.push(`load ${m}: ${e.message}`); }
    bar.style.width = `${(++n / MODULES.length) * 70}%`;
  }));
  return mods;
}

// ---------------------------------------------------------------- collisions
const colliders = []; // THREE.Box3 (world)
function collectColliders(placed) {
  const tmp = new THREE.Box3();
  for (const { obj } of placed) {
    obj.updateWorldMatrix(true, true);
    if (obj.userData.noCollide) continue;
    if (Array.isArray(obj.userData.colliders)) {
      for (const c of obj.userData.colliders) {
        tmp.set(new THREE.Vector3(...c.min), new THREE.Vector3(...c.max)).applyMatrix4(obj.matrixWorld);
        colliders.push(tmp.clone());
      }
      continue;
    }
    const b = new THREE.Box3().setFromObject(obj);
    if (b.isEmpty() || b.min.y > 1.7 || b.max.y < 0.15) continue; // overhead or flat objects
    colliders.push(b);
  }
}
function blocked(x, z) {
  for (const b of colliders) {
    if (b.min.y > 1.8 || b.max.y < 0.1) continue;
    if (x > b.min.x - PLAYER_R && x < b.max.x + PLAYER_R && z > b.min.z - PLAYER_R && z < b.max.z + PLAYER_R) return true;
  }
  return false;
}

// ---------------------------------------------------------------- controls & modes
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true;
orbit.dampingFactor = 0.08;
const fps = new PointerLockControls(camera, document.body);

let mode = 'outside';
let building = null;
const player = new THREE.Vector3(STORE.entranceX, EYE, 24);
const playerQuat = new THREE.Quaternion(); // identity = looking toward -Z (into the store)
const keys = new Set();
const joy = { x: 0, y: 0 };
let bob = 0;

function setCeiling(visible) {
  if (building && building.userData.ceiling) building.userData.ceiling.visible = visible;
}

function setMode(m) {
  if (mode === 'walk' && m !== 'walk') { player.copy(camera.position); playerQuat.copy(camera.quaternion); fps.unlock(); }
  mode = m;
  document.body.classList.toggle('walking', m === 'walk');
  for (const [id, mm] of [['btnWalk', 'walk'], ['btnDoll', 'doll'], ['btnOutside', 'outside'], ['btnTour', 'tour']]) $(id).classList.toggle('active', mm === m);
  $('start').classList.remove('show');
  orbit.enabled = m === 'doll' || m === 'outside';
  setCeiling(m !== 'doll');
  scene.fog.near = m === 'doll' ? 200 : 60;

  if (m === 'walk') {
    camera.position.copy(player);
    camera.position.y = EYE;
    camera.quaternion.copy(playerQuat);
    if (!isTouch) $('start').classList.add('show');
  } else if (m === 'doll') {
    camera.position.set(-6, 34, 36);
    orbit.target.set(0, 0, -1);
    orbit.minDistance = 8; orbit.maxDistance = 90;
    orbit.maxPolarAngle = THREE.MathUtils.degToRad(80);
  } else if (m === 'outside') {
    camera.position.set(30, 9, 46);
    orbit.target.set(4, 3, 12);
    orbit.minDistance = 6; orbit.maxDistance = 110;
    orbit.maxPolarAngle = THREE.MathUtils.degToRad(86);
  } else if (m === 'tour') {
    tourT = 0;
  }
  orbit.update();
}

$('btnWalk').onclick = () => setMode('walk');
$('btnDoll').onclick = () => setMode('doll');
$('btnOutside').onclick = () => setMode('outside');
$('btnTour').onclick = () => setMode('tour');
$('start').onclick = () => fps.lock();
fps.addEventListener('lock', () => $('start').classList.remove('show'));
fps.addEventListener('unlock', () => { if (mode === 'walk' && !isTouch) $('start').classList.add('show'); });

addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'Digit1') setMode('walk');
  if (e.code === 'Digit2') setMode('doll');
  if (e.code === 'Digit3') setMode('outside');
  if (e.code === 'KeyT') setMode('tour');
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

// Touch: joystick to move, drag elsewhere to look.
if (isTouch) {
  const pad = $('joy'), knob = pad.firstElementChild;
  let jid = null, lookId = null, lx = 0, ly = 0;
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  pad.addEventListener('pointerdown', (e) => { jid = e.pointerId; pad.setPointerCapture(jid); });
  pad.addEventListener('pointermove', (e) => {
    if (e.pointerId !== jid) return;
    const r = pad.getBoundingClientRect();
    let dx = (e.clientX - r.left - r.width / 2) / (r.width / 2), dy = (e.clientY - r.top - r.height / 2) / (r.height / 2);
    const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
    joy.x = dx; joy.y = dy;
    knob.style.transform = `translate(${dx * 34}px, ${dy * 34}px)`;
  });
  const end = (e) => { if (e.pointerId === jid) { jid = null; joy.x = joy.y = 0; knob.style.transform = ''; } };
  pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end);
  renderer.domElement.addEventListener('pointerdown', (e) => { if (mode === 'walk') { lookId = e.pointerId; lx = e.clientX; ly = e.clientY; } });
  renderer.domElement.addEventListener('pointermove', (e) => {
    if (mode !== 'walk' || e.pointerId !== lookId) return;
    euler.setFromQuaternion(camera.quaternion);
    euler.y -= (e.clientX - lx) * 0.005; euler.x -= (e.clientY - ly) * 0.005;
    euler.x = THREE.MathUtils.clamp(euler.x, -1.4, 1.4);
    camera.quaternion.setFromEuler(euler); lx = e.clientX; ly = e.clientY;
  });
  renderer.domElement.addEventListener('pointerup', (e) => { if (e.pointerId === lookId) lookId = null; });
}

const fwd = new THREE.Vector3(), right = new THREE.Vector3();
function updateWalk(dt) {
  let mx = 0, mz = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) mz += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) mz -= 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1;
  mx += joy.x; mz -= joy.y;
  const len = Math.hypot(mx, mz);
  const speed = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 5.0 : 2.6;
  if (len > 0.05) {
    camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
    right.crossVectors(fwd, camera.up).normalize();
    const s = (speed * dt) / Math.max(1, len);
    const dx = (fwd.x * mz + right.x * mx) * s, dz = (fwd.z * mz + right.z * mx) * s;
    const p = camera.position;
    if (!blocked(p.x + dx, p.z)) p.x += dx;
    if (!blocked(p.x, p.z + dz)) p.z += dz;
    bob += dt * speed * 3.2;
  }
  camera.position.y = EYE + Math.sin(bob) * 0.025;
}

// Guided tour along a spline at eye height
let tourT = 0;
const W = (x, z) => new THREE.Vector3(x, EYE, z);
const laneWalkX = LANES[3] + WALKWAY_OFFSET;
const tourCurve = new THREE.CatmullRomCurve3([
  W(STORE.entranceX, 30), W(STORE.entranceX, 18), W(STORE.entranceX, 11), W(13.8, 6.3), W(13.8, 2.7), W(10.2, -0.4),
  W(5.0, -2.5), W(9.5, -6.8), W(13.5, -10.0), W(8.5, -10.8), W(3.5, -12.5), W(-5.5, -12.8), W(-11.5, -12.0),
  W(-11.5, -6.0), W(-11.5, -0.6), W(-6.0, 3.0), W(laneWalkX, 4.8), W(laneWalkX, 10.6), W(2.0, 12.4), W(STORE.entranceX, 12.0),
  W(STORE.entranceX, 18), W(STORE.entranceX + 2, 30),
], false, 'centripetal');
const tourLen = tourCurve.getLength();
const lookTmp = new THREE.Vector3();
function updateTour(dt) {
  tourT += (dt * 1.7) / tourLen;
  if (tourT >= 1) { setMode('outside'); return; }
  const p = tourCurve.getPointAt(tourT);
  camera.position.copy(p);
  tourCurve.getPointAt(Math.min(1, tourT + 0.012), lookTmp);
  lookTmp.y = EYE - 0.12;
  const m = new THREE.Matrix4().lookAt(camera.position, lookTmp, camera.up);
  const q = new THREE.Quaternion().setFromRotationMatrix(m);
  camera.quaternion.slerp(q, 1 - Math.exp(-dt * 2.5));
}

// ---------------------------------------------------------------- HUD area indicator
let lastArea = '';
function updateArea() {
  const p = camera.position;
  let name = 'Bereket Market';
  if (mode === 'doll') name = 'Mağaza planı';
  else for (const [n, x0, x1, z0, z1] of AREAS) if (p.x >= x0 && p.x <= x1 && p.z >= z0 && p.z <= z1) { name = n; break; }
  if (name !== lastArea) { $('area').textContent = '📍 ' + name; lastArea = name; }
}

// ---------------------------------------------------------------- presets for automated screenshots
const PRESETS = {
  exterior: { mode: 'outside' },
  doll: { mode: 'doll' },
  dolltop: { mode: 'doll', pos: [0, 52, 6], target: [0, 0, 0] },
  entrance: { pos: [12, EYE, 12.2], look: [8, 1.3, 4] },
  produce: { pos: [17.8, EYE, 9.8], look: [12, 0.8, 2.5] },
  aisle: { pos: [-11.5, EYE, -0.2], look: [-11.5, 1.2, -10] },
  checkout: { pos: [-1.0, 2.2, 3.0], look: [-9, 0.9, 8.5] },
  deli: { pos: [6.0, EYE, -6.6], look: [10, 1.0, -13] },
  coolers: { pos: [-6.0, EYE, -10.8], look: [-12, 1.1, -14.6] },
  bakery: { pos: [12.5, EYE, -7.5], look: [18, 1.0, -12.5] },
};

// ---------------------------------------------------------------- frame loop
const updaters = [];
const clock = new THREE.Clock();
const ctx = { time: 0, playerPosition: camera.position };
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  ctx.time += dt;
  if (mode === 'walk') updateWalk(dt);
  else if (mode === 'tour') updateTour(dt);
  else if (mode !== 'shot') orbit.update();
  for (const o of updaters) o.userData.update(dt, ctx);
  updateArea();
  renderer.render(scene, camera);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------------------------------------------------------------- boot
(async function boot() {
  const mods = await loadModules();
  const { root, building: b, placed } = buildStore(mods, (m) => console.warn(m));
  building = b;
  scene.add(root);
  populate(root, mods, placed, (m) => console.warn(m));
  bar.style.width = '85%';

  // The building shell must not block the overhead key light.
  if (building) building.traverse((o) => { if (o.isMesh) o.castShadow = false; });

  // Static optimisation: freeze matrices of objects without animation.
  root.updateMatrixWorld(true);
  for (const { obj } of placed) {
    let animated = false;
    obj.traverse((o) => { if (typeof o.userData.update === 'function') { animated = true; updaters.push(o); } });
    if (!animated) obj.traverse((o) => { o.matrixAutoUpdate = false; });
  }
  collectColliders(placed);

  // Shadows are static: render the shadow map once.
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;

  if (SHOT) {
    const p = PRESETS[SHOT] || PRESETS.exterior;
    setMode(p.mode || 'tour');
    if (p.pos) {
      mode = 'shot'; orbit.enabled = false; setCeiling(true);
      camera.position.set(...p.pos);
      camera.lookAt(new THREE.Vector3(...p.look));
    } else if (p.target) { camera.position.set(...p.pos); orbit.target.set(...p.target); orbit.update(); }
    document.querySelectorAll('#hud,#help,#area').forEach((el) => (el.style.display = params.has('hud') ? '' : 'none'));
  } else {
    setMode('outside');
  }

  // Compile shaders before revealing.
  renderer.compile(scene, camera);
  bar.style.width = '100%';
  frame();
  renderer.setAnimationLoop(frame);
  $('loading').classList.add('done');

  let calls = 0, tris = 0;
  renderer.info.autoReset = false; renderer.info.reset(); renderer.render(scene, camera);
  calls = renderer.info.render.calls; tris = renderer.info.render.triangles; renderer.info.autoReset = true;
  window.__stats = { drawCalls: calls, triangles: tris, colliders: colliders.length, objects: placed.length, updaters: updaters.length };
  window.__ready = true;
})().catch((e) => { console.error(e); window.__errors.push(String(e.stack || e)); window.__ready = true; });
