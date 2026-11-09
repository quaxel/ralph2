# Model sözleşmesi (Model contract)

All 3D models are procedural Three.js (r170) code — no external model/texture files.

## Conventions
- **Units:** meters. **Y up.** Floor is `y = 0`.
- **Origin:** every factory returns a `THREE.Group` whose origin is the **center of its floor footprint** (x/z centered, bottom at y=0) unless the brief says otherwise.
- **Front:** the customer-facing side points to **+Z**.
- **Imports allowed:** `three`, `three/addons/...` (e.g. `three/addons/utils/BufferGeometryUtils.js`, `three/addons/geometries/RoundedBoxGeometry.js`) and `./common.js`. Nothing else.
- **Textures:** only procedural (`CanvasTexture`, e.g. `labelTexture()` from `common.js`). Cache them at module level.
- **Determinism:** randomness must come from `seededRandom(seed)` in `common.js`, never `Math.random()`.
- **Naming:** set `group.name` to something descriptive (e.g. `"Gondola"`).

## Performance budget (the whole store has ~60–100 of these objects)
- Share geometries and materials at module level (create once, reuse).
- Repeated small things (products, fruits, bottles, cans) **must** use `THREE.InstancedMesh`
  (use `setColorAt` for per-instance color variety) or `mergeGeometries`.
- Rough budget: ≤ 40 draw calls and ≤ 60k triangles per typical unit (e.g. one 4 m shelf run).
  Keep segment counts low (cylinders 8–16 radial segments, spheres 8–12).
- Shadows: `castShadow = true` only on large structural meshes; `receiveShadow = true` on surfaces.
  Never cast shadows from instanced products.

## Animation (optional)
If a model is animated, set `group.userData.update = (dt, ctx) => { ... }` where
`ctx = { time, playerPosition /* THREE.Vector3, world space */ }`.
The app calls it every frame for every object that has it.

## Collision (optional)
By default the app uses the world-space bounding box of each top-level object as a solid obstacle.
If that is wrong (e.g. the building shell), set `group.userData.colliders = [{ min:[x,y,z], max:[x,y,z] }, ...]`
in the group's **local** space. Set `group.userData.noCollide = true` for walk-through objects.

## Viewer / verification
Each module exports `showcase()` returning a group that displays its models side by side.

```
node tools/shot.cjs --model <module> --views iso,front,top [--fn createX] [--zoom 1.5] --out <dir>
```
Prints bbox size, draw calls, triangles and any console errors; writes PNG screenshots.
Red axis = +X, blue axis = +Z (front). Grid squares = 1 m.
