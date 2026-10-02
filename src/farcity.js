// The rest of the city past the edge of the map: every real building out to ~2.6 km (NYC Open Data,
// pooled into a coarse grid by scripts/fetch-nyc.mjs) as one instanced draw of hazy blocks with lit windows.
// Cheap, but the skyline on the horizon is the real one.
import * as THREE from 'three';
import { hazy } from './surroundings.js';

export function buildFarCity(far, proj, box) {
  const group = new THREE.Group();
  if (!far?.c?.length) return { group, count: 0 };
  // the world may be turned to line the streets up: find north and east, in world units per meter
  const kx = 111320 * Math.cos((far.lat * Math.PI) / 180);
  const [ox, oz] = proj.toWorld(far.lat, far.lon);
  const [ex, ez] = proj.toWorld(far.lat, far.lon + 1 / kx);
  const [nx, nz] = proj.toWorld(far.lat + 1 / 110540, far.lon);
  const east = [ex - ox, ez - oz];
  const north = [nx - ox, nz - oz];
  const yaw = Math.atan2(-east[1], east[0]); // turns the blocks so their sides face east and north
  const pad = 6;
  const cells = far.c.filter(([i, j]) => {
    const x = ox + (east[0] * i + north[0] * j) * far.cell;
    const z = oz + (east[1] * i + north[1] * j) * far.cell;
    return x < box.x0 - pad || x > box.x1 + pad || z < box.z0 - pad || z > box.z1 + pad;
  });
  const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  geo.deleteAttribute('uv');
  const uniforms = { uNight: { value: 0 } };
  const mat = hazy(new THREE.MeshLambertMaterial({ color: 0xffffff }), 0.22, 0.85);
  const fogPatch = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader) => {
    fogPatch(shader);
    shader.uniforms.uNight = uniforms.uNight;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFarPos;\nvarying vec3 vFarN;\nvarying float vFarSeed;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 farWorld = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vFarPos = farWorld.xyz;
        vFarN = normal;
        vFarSeed = instanceMatrix[3].x * 0.013 + instanceMatrix[3].z * 0.029;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNight;\nvarying vec3 vFarPos;\nvarying vec3 vFarN;\nvarying float vFarSeed;\nfloat farHash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        // windows: a grid of floors and bays on the walls, some lit at night
        if (abs(vFarN.y) < 0.5) {
          float along = abs(vFarN.x) > 0.5 ? vFarPos.z : vFarPos.x;
          vec2 cell = vec2(along / 3.6, vFarPos.y / 3.3);
          vec2 f = fract(cell);
          float win = step(0.22, f.x) * step(f.x, 0.78) * step(0.3, f.y) * step(f.y, 0.8) * step(2.0, vFarPos.y);
          float lit = step(1.0 - uNight * 0.55, farHash(floor(cell) + vFarSeed));
          diffuseColor.rgb *= 1.0 - win * 0.35;
          totalEmissiveRadiance += win * lit * vec3(1.0, 0.72, 0.38) * 1.6;
        }`);
  };
  mat.customProgramCacheKey = () => 'farcity';
  mat.userData.onLight = (L) => (uniforms.uNight.value = L.windows);
  const mesh = new THREE.InstancedMesh(geo, mat, cells.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const c = new THREE.Color();
  // brick, brownstone, limestone and glass, a little darker for the tall ones
  const tones = [0x9a5a44, 0x7d5848, 0xb9ab95, 0x8f9aa6, 0xa77a5c, 0x6f7783];
  cells.forEach(([i, j, h, cover], k) => {
    p.set(ox + (east[0] * i + north[0] * j) * far.cell, 0, oz + (east[1] * i + north[1] * j) * far.cell);
    const w = far.cell * Math.min(0.95, Math.max(0.45, Math.sqrt(cover / 100) * 1.1));
    s.set(w, Math.max(4, h), w);
    m.compose(p, q, s);
    mesh.setMatrixAt(k, m);
    c.setHex(tones[(i * 7 + j * 13 + (h > 60 ? 3 : 0)) % tones.length]).multiplyScalar(h > 80 ? 0.85 : 1);
    mesh.setColorAt(k, c);
  });
  mesh.computeBoundingSphere();
  mesh.frustumCulled = true;
  mesh.userData.noShadow = true; // kilometers away: never in the sun's shadow box
  group.add(mesh);
  return { group, count: cells.length };
}
