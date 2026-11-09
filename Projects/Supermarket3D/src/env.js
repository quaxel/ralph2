// Renderer / environment setup shared by the main app and the model viewer.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export function createRenderer(canvasParent = document.body, { shadows = true } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  canvasParent.appendChild(renderer.domElement);
  return renderer;
}

/** Image-based lighting so metals / glass look right. */
export function applyEnvironment(renderer, scene, intensity = 0.6) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  scene.environmentIntensity = intensity;
  pmrem.dispose();
  return env;
}

/** Simple neutral studio lights used by the viewer. */
export function addStudioLights(scene, radius = 5) {
  const hemi = new THREE.HemisphereLight(0xffffff, 0x8a8170, 1.2);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(radius * 0.8, radius * 1.6, radius * 1.1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const s = radius * 1.5;
  Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 0.1, far: radius * 6 });
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  return { hemi, sun };
}
