// Standalone model viewer: viewer.html?model=<module>&fn=<exportName>&view=iso|front|side|top|back
// Loads ./models/<module>.js and renders its `showcase()` export (or another factory via &fn=).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createRenderer, applyEnvironment, addStudioLights } from './env.js';

const params = new URLSearchParams(location.search);
const modelName = params.get('model') || 'common';
const fnName = params.get('fn') || 'showcase';
const view = params.get('view') || 'iso';
const zoom = parseFloat(params.get('zoom') || '1');
const info = document.getElementById('info');

window.__errors = [];
window.addEventListener('error', (e) => window.__errors.push(String(e.message)));
window.addEventListener('unhandledrejection', (e) => window.__errors.push(String(e.reason && e.reason.stack || e.reason)));

const renderer = createRenderer(document.body);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd9dde2);
applyEnvironment(renderer, scene, 0.5);

const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.01, 500);
const controls = new OrbitControls(camera, renderer.domElement);

async function main() {
  const mod = await import(`./models/${modelName}.js`);
  const factory = mod[fnName];
  if (typeof factory !== 'function') throw new Error(`models/${modelName}.js has no export "${fnName}"`);
  const obj = factory();
  scene.add(obj);

  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const radius = Math.max(size.length() / 2, 0.2);

  // floor + 1 m grid for scale reference
  const floorSize = Math.max(4, Math.ceil(radius * 4));
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(floorSize, floorSize), new THREE.MeshStandardMaterial({ color: 0xbfc4c9, roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.001; floor.receiveShadow = true;
  floor.position.x = center.x; floor.position.z = center.z;
  scene.add(floor);
  const grid = new THREE.GridHelper(floorSize, floorSize, 0x666666, 0x999999);
  grid.position.set(center.x, 0.001, center.z);
  scene.add(grid);
  const axes = new THREE.AxesHelper(0.5); // red=+X green=+Y blue=+Z (front)
  axes.position.y = 0.002;
  scene.add(axes);

  addStudioLights(scene, radius);

  const dist = (radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.05 / zoom;
  const dirs = {
    iso: new THREE.Vector3(0.75, 0.6, 1),
    front: new THREE.Vector3(0, 0.15, 1),
    back: new THREE.Vector3(0, 0.25, -1),
    side: new THREE.Vector3(1, 0.15, 0),
    top: new THREE.Vector3(0, 1, 0.0001),
  };
  const dir = (dirs[view] || dirs.iso).clone().normalize();
  camera.position.copy(center).addScaledVector(dir, dist);
  camera.near = dist / 100; camera.far = dist * 10; camera.updateProjectionMatrix();
  controls.target.copy(center);
  controls.update();

  // Run one update tick if the model is animated
  obj.traverse((o) => { if (o.userData && typeof o.userData.update === 'function') o.userData.update(0.016, { time: 0, playerPosition: new THREE.Vector3(0, 1.6, 50) }); });

  renderer.render(scene, camera);
  const r = renderer.info.render;
  let meshes = 0, instanced = 0;
  obj.traverse((o) => { if (o.isInstancedMesh) instanced++; else if (o.isMesh) meshes++; });
  const stats = {
    model: modelName, fn: fnName, view,
    size: [size.x, size.y, size.z].map((v) => +v.toFixed(3)),
    min: [box.min.x, box.min.y, box.min.z].map((v) => +v.toFixed(3)),
    max: [box.max.x, box.max.y, box.max.z].map((v) => +v.toFixed(3)),
    drawCalls: r.calls, triangles: r.triangles, meshes, instancedMeshes: instanced,
  };
  info.textContent = `${modelName}.${fnName}()  view=${view}\nsize  x=${stats.size[0]} y=${stats.size[1]} z=${stats.size[2]} m\ncalls=${r.calls} tris=${r.triangles} meshes=${meshes} inst=${instanced}`;
  window.__stats = stats;

  let last = performance.now();
  renderer.setAnimationLoop((t) => {
    const dt = Math.min(0.05, (t - last) / 1000); last = t;
    obj.traverse((o) => { if (o.userData && typeof o.userData.update === 'function') o.userData.update(dt, { time: t / 1000, playerPosition: camera.position }); });
    controls.update();
    renderer.render(scene, camera);
  });
  window.__ready = true;
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

main().catch((e) => { window.__errors.push(String(e.stack || e)); info.textContent = 'HATA: ' + e.message; window.__ready = true; });
