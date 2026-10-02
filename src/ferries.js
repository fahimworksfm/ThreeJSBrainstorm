// Ferries on the real ferry routes (OpenStreetMap route=ferry): the orange Staten Island Ferry out of
// St George, and NYC Ferry boats along the East River and out to the Rockaways. Each route has a boat
// heading each way, crossing at about real speed and waiting a while at the landings.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Path, resample } from './osm/geo.js';

const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

function statenIslandFerry() {
  // the big orange double-ender: hull, three white-trimmed decks, a pilot house at each end
  const hull = mergeGeometries([box(21, 4, 90, 0, 0.5, 0), box(17, 2.5, 82, 0, 3.6, 0), box(15, 2.5, 74, 0, 6.1, 0)]);
  const white = mergeGeometries([box(17.2, 0.5, 82.2, 0, 4.9, 0), box(15.2, 0.5, 74.2, 0, 7.4, 0), box(5, 3, 5, 0, 8.8, 33), box(5, 3, 5, 0, 8.8, -33)]);
  const windows = mergeGeometries([box(17.4, 0.9, 78, 0, 3.6, 0), box(15.4, 0.9, 70, 0, 6.1, 0)]);
  const g = new THREE.Group();
  g.add(new THREE.Mesh(hull, new THREE.MeshStandardMaterial({ color: 0xf26c1a, roughness: 0.6 })));
  g.add(new THREE.Mesh(white, new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.7 })));
  const glass = new THREE.MeshStandardMaterial({ color: 0x1b2430, emissive: 0xffd9a0, emissiveIntensity: 0.6, roughness: 0.3 });
  glass.userData.bright = true;
  g.add(new THREE.Mesh(windows, glass));
  return { g, len: 90, speed: 7 };
}

function nycFerry() {
  // a sleek white catamaran with a blue band and a wide cabin
  const g = new THREE.Group();
  g.add(new THREE.Mesh(mergeGeometries([box(2.4, 2.2, 26, -3, 0.4, 0), box(2.4, 2.2, 26, 3, 0.4, 0), box(8.4, 1.2, 25, 0, 1.6, 0)]), new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.5 })));
  g.add(new THREE.Mesh(box(8.5, 0.5, 25.1, 0, 2.3, 0), new THREE.MeshStandardMaterial({ color: 0x1f5fb8, roughness: 0.5 })));
  const glass = new THREE.MeshStandardMaterial({ color: 0x1b2430, emissive: 0xcfe6ff, emissiveIntensity: 0.5, roughness: 0.3 });
  glass.userData.bright = true;
  g.add(new THREE.Mesh(box(7.6, 2.2, 17, 0, 3.6, -1), glass));
  g.add(new THREE.Mesh(box(7.8, 0.4, 17.4, 0, 4.9, -1), new THREE.MeshStandardMaterial({ color: 0xf4f4f0 })));
  return { g, len: 26, speed: 9 };
}

/**
 * Past the edge of the map there is no water drawn (just the plain ground), so lay a wide strip of harbor
 * under each route wherever it runs outside the map box.
 */
function harbor(path, box, width = 220) {
  const pos = [];
  const f = [0, 0, 0, 0];
  const g = [0, 0, 0, 0];
  const out = (x, z) => x < box.x0 + 20 || x > box.x1 - 20 || z < box.z0 + 20 || z > box.z1 - 20;
  // above the ground ring (CURB) everywhere; split across into strips so the hills' lift follows it closely
  const y = 0.4;
  const N = 10;
  for (let s = 0; s + 20 <= path.len; s += 20) {
    path.at(s, f);
    path.at(s + 20, g);
    if (!out(f[0], f[1]) && !out(g[0], g[1])) continue;
    for (let k = 0; k < N; k++) {
      const u0 = (k / N - 0.5) * width;
      const u1 = ((k + 1) / N - 0.5) * width;
      const a = [f[0] + f[3] * u0, f[1] - f[2] * u0];
      const b = [f[0] + f[3] * u1, f[1] - f[2] * u1];
      const c = [g[0] + g[3] * u0, g[1] - g[2] * u0];
      const d = [g[0] + g[3] * u1, g[1] - g[2] * u1];
      pos.push(a[0], y, a[1], b[0], y, b[1], c[0], y, c[1], b[0], y, b[1], d[0], y, d[1], c[0], y, c[1]);
    }
  }
  if (!pos.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x1f3c4c, roughness: 0.25, metalness: 0.2, side: THREE.DoubleSide }));
  mesh.userData.noShadow = true;
  return mesh;
}

export function buildFerries(routes, box = null) {
  const group = new THREE.Group();
  const boats = [];
  // the longest few routes (the map splits some into pieces)
  for (const r of [...(routes ?? [])].sort((a, b) => b.pts.length - a.pts.length).slice(0, 4)) {
    const path = new Path(resample(r.pts, 8));
    if (path.len < 300) continue;
    const sif = /staten island/i.test(`${r.name} ${r.operator}`);
    const water = box && harbor(path, box);
    if (water) group.add(water);
    for (const k of [0, 1]) {
      const b = sif ? statenIslandFerry() : nycFerry();
      b.g.traverse((o) => (o.castShadow = o.isMesh));
      group.add(b.g);
      // one boat each way, starting at opposite ends
      boats.push({ ...b, path, s: k ? path.len - b.len : b.len, dir: k ? -1 : 1, wait: k * 30, t: Math.random() * 10 });
    }
  }
  const f = [0, 0, 0, 0];
  function update(dt) {
    for (const b of boats) {
      b.t += dt;
      if (b.wait > 0) b.wait -= dt;
      else {
        b.s += b.speed * b.dir * dt;
        // at a landing: tie up for a bit, then head back
        const end = b.dir > 0 ? b.path.len - b.len / 2 : b.len / 2;
        if ((b.s - end) * b.dir >= 0) {
          b.s = end;
          b.dir = -b.dir;
          b.wait = 45;
        }
      }
      b.path.at(b.s, f);
      b.g.position.set(f[0], 0.45 + Math.sin(b.t * 0.7) * 0.15, f[1]);
      b.g.rotation.set(Math.sin(b.t * 0.5) * 0.01, Math.atan2(f[2] * b.dir, f[3] * b.dir), Math.sin(b.t * 0.6) * 0.015);
    }
  }
  return { group, update, count: boats.length };
}
