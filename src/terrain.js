// Real hills. Everything is simulated flat (physics, crowds, traffic); only drawing adds the ground's
// height. A shared vertex-shader patch lifts every vertex by the terrain under it, so buildings, streets,
// props and people all follow the slope together, and the camera and sun are lifted to match.
import * as THREE from 'three';

const N = 96; // texels across the height texture
const uniforms = {
  uTerrain: { value: null },
  uTerrainBox: { value: new THREE.Vector4(0, 0, 1, 1) }, // x0, z0, 1 / width, 1 / depth
};
let grid = null; // Float32Array N*N of meters, or null when the ground is flat
let box = null;
// flat ground: an all-zero texture, so anything lifted in a hilly neighborhood sits right in a flat one
const flat = new THREE.DataTexture(new Uint16Array(4), 2, 2, THREE.RedFormat, THREE.HalfFloatType);
flat.needsUpdate = true;
uniforms.uTerrain.value = flat;

// the shader side: sampled with the same bilinear filter the heightAt() below uses
THREE.ShaderChunk.common += /* glsl */ `
#ifdef USE_TERRAIN
uniform sampler2D uTerrain;
uniform vec4 uTerrainBox;
float terrainAt(vec2 p) { return texture2D(uTerrain, clamp((p - uTerrainBox.xy) * uTerrainBox.zw, 0.0, 1.0)).r; }
#endif
`;
THREE.ShaderChunk.project_vertex = THREE.ShaderChunk.project_vertex.replace(
  'mvPosition = modelViewMatrix * mvPosition;',
  `#ifdef USE_TERRAIN
	{ vec4 terrainW = modelMatrix * mvPosition; terrainW.y += terrainAt(terrainW.xz); mvPosition = viewMatrix * terrainW; }
#else
	mvPosition = modelViewMatrix * mvPosition;
#endif`,
);
THREE.ShaderChunk.worldpos_vertex = THREE.ShaderChunk.worldpos_vertex.replace(
  'worldPosition = modelMatrix * worldPosition;',
  `worldPosition = modelMatrix * worldPosition;
	#ifdef USE_TERRAIN
		worldPosition.y += terrainAt(worldPosition.xz);
	#endif`,
);

/** Ground height in meters at world (x, z); 0 when the neighborhood is flat. */
export function heightAt(x, z) {
  if (!grid) return 0;
  const u = Math.min(N - 1, Math.max(0, ((x - box.x0) / box.w) * N - 0.5));
  const v = Math.min(N - 1, Math.max(0, ((z - box.z0) / box.d) * N - 0.5));
  const i = Math.min(N - 2, Math.floor(u));
  const j = Math.min(N - 2, Math.floor(v));
  const fu = u - i;
  const fv = v - j;
  const h = (a, b) => grid[b * N + a];
  return (h(i, j) * (1 - fu) + h(i + 1, j) * fu) * (1 - fv) + (h(i, j + 1) * (1 - fu) + h(i + 1, j + 1) * fu) * fv;
}

export const terrainOn = () => !!grid;

/**
 * Build the height field for a real neighborhood. elevation: { n, box: [s, w, n, e], m: meters row by row
 * from the north }; proj: the map projection; R: half-size of the playable square. Returns false if flat.
 */
export function setTerrain(elevation, proj, R) {
  grid = null;
  if (uniforms.uTerrain.value !== flat) uniforms.uTerrain.value.dispose();
  uniforms.uTerrain.value = flat;
  if (!elevation?.m?.length) return false;
  const G = elevation.n;
  const [s, w, n, e] = elevation.box;
  // the grid is in lat/lon; the world is rotated to the streets: sample world points back to lat/lon
  const kx = Math.cos((((s + n) / 2) * Math.PI) / 180) * 111320;
  const kz = 110540;
  const [lat0, lon0] = proj.center;
  const sample = (lat, lon) => {
    const fx = ((lon - w) / (e - w)) * (G - 1);
    const fy = ((n - lat) / (n - s)) * (G - 1);
    const i = Math.max(0, Math.min(G - 2, Math.floor(fx)));
    const j = Math.max(0, Math.min(G - 2, Math.floor(fy)));
    const a = Math.max(0, Math.min(1, fx - i));
    const b = Math.max(0, Math.min(1, fy - j));
    // tiles report the water's depth, or nonsense, offshore: treat anything below sea level as sea level
    const at = (ii, jj) => Math.max(0, elevation.m[jj * G + ii]);
    return (at(i, j) * (1 - a) + at(i + 1, j) * a) * (1 - b) + (at(i, j + 1) * (1 - a) + at(i + 1, j + 1) * a) * b;
  };
  const M = R + 400; // past the edge too: the outer skyline sits on the same hills
  box = { x0: -M, z0: -M, w: 2 * M, d: 2 * M };
  let g = new Float32Array(N * N);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = box.x0 + ((i + 0.5) / N) * box.w;
      const z = box.z0 + ((j + 0.5) / N) * box.d;
      const [rx, rz] = proj.unrotate([x, z]);
      g[j * N + i] = sample(lat0 - rz / kz, lon0 + rx / kx);
    }
  }
  // soften: a few blur passes so streets tilt instead of stepping
  for (let pass = 0; pass < 3; pass++) {
    const o = new Float32Array(N * N);
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        let sum = 0;
        let c = 0;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          const ii = i + di;
          const jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue;
          sum += g[jj * N + ii];
          c++;
        }
        o[j * N + i] = sum / c;
      }
    }
    g = o;
  }
  // the lowest ground in play sits at 0, where the flat world always was
  let low = Infinity;
  let high = -Infinity;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = box.x0 + ((i + 0.5) / N) * box.w;
    const z = box.z0 + ((j + 0.5) / N) * box.d;
    if (Math.abs(x) > R || Math.abs(z) > R) continue;
    low = Math.min(low, g[j * N + i]);
    high = Math.max(high, g[j * N + i]);
  }
  if (!(high - low > 1.5)) return false; // flat enough: skip the whole thing
  for (let k = 0; k < g.length; k++) g[k] -= low;
  grid = g;
  const data = new Uint16Array(N * N);
  for (let k = 0; k < g.length; k++) data[k] = THREE.DataUtils.toHalfFloat(g[k]);
  const tex = new THREE.DataTexture(data, N, N, THREE.RedFormat, THREE.HalfFloatType);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  uniforms.uTerrain.value = tex;
  uniforms.uTerrainBox.value.set(box.x0, box.z0, 1 / box.w, 1 / box.d);
  return { low, high };
}

const depthCache = new Map();
/** Opt a material into the terrain lift (and give its mesh a matching shadow caster). */
function lift(material) {
  if (material.userData.terrain || material.isShaderMaterial || material.isRawShaderMaterial) return;
  material.userData.terrain = true;
  material.defines = { ...(material.defines ?? {}), USE_TERRAIN: '' };
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, r) => {
    prev?.call(material, shader, r);
    shader.uniforms.uTerrain = uniforms.uTerrain;
    shader.uniforms.uTerrainBox = uniforms.uTerrainBox;
  };
  material.needsUpdate = true;
}
function depthFor(material) {
  const key = `${material.map?.uuid ?? ''}|${material.alphaTest ?? 0}`;
  let d = depthCache.get(key);
  if (!d) {
    d = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: material.alphaTest ? material.map : null, alphaTest: material.alphaTest ?? 0 });
    lift(d);
    depthCache.set(key, d);
  }
  return d;
}

/** Lift everything under root that isn't lifted yet (cheap to call again after new things appear). */
export function liftAll(root) {
  if (!grid) return;
  root.traverse((o) => {
    if (!o.material || o.userData.noTerrain) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) lift(m);
    if (o.isMesh && o.castShadow && !o.customDepthMaterial && !Array.isArray(o.material)) o.customDepthMaterial = depthFor(o.material);
  });
}
