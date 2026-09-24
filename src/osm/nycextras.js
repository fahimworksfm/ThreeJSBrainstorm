// Street details from NYC Open Data on the real map: painted bike lanes where the city's bike routes run,
// and film crews (trucks, balloon lights, NO PARKING signs) on the blocks with a real film permit.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { normName } from './geo.js';

/** "WEST 44 STREET" and "West 44th Street" both become "w 44 st". */
export const streetKey = (n) => normName(n ?? '').replace(/\b(\d+)(st|nd|rd|th)\b/g, '$1');

function quad(ax, az, bx, bz, w, y) {
  const dx = bx - ax;
  const dz = bz - az;
  const l = Math.hypot(dx, dz) || 1;
  const nx = (-dz / l) * (w / 2);
  const nz = (dx / l) * (w / 2);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([
    ax + nx, y, az + nz, ax - nx, y, az - nz, bx + nx, y, bz + nz, bx - nx, y, bz - nz,
  ], 3));
  g.setIndex([0, 2, 1, 1, 2, 3]);
  g.computeVertexNormals();
  return g;
}

function signTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 160;
  const x = c.getContext('2d');
  x.fillStyle = '#f7d21c';
  x.fillRect(0, 0, 128, 160);
  x.strokeStyle = '#111';
  x.lineWidth = 6;
  x.strokeRect(5, 5, 118, 150);
  x.fillStyle = '#111';
  x.textAlign = 'center';
  x.font = 'bold 22px Arial, sans-serif';
  x.fillText('NO', 64, 38);
  x.fillText('PARKING', 64, 62);
  x.font = 'bold 15px Arial, sans-serif';
  x.fillText('FILMING', 64, 92);
  x.fillText('IN PROGRESS', 64, 112);
  x.font = '11px Arial, sans-serif';
  x.fillText('NYC MAYOR\'S OFFICE', 64, 140);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function sharrowTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const x = c.getContext('2d');
  x.strokeStyle = '#f2f2ee';
  x.fillStyle = '#f2f2ee';
  x.lineWidth = 5;
  // two chevrons over a bicycle
  for (const y of [14, 34]) {
    x.beginPath();
    x.moveTo(12, y + 14);
    x.lineTo(32, y);
    x.lineTo(52, y + 14);
    x.stroke();
  }
  x.beginPath();
  x.arc(18, 100, 11, 0, Math.PI * 2);
  x.arc(46, 100, 11, 0, Math.PI * 2);
  x.stroke();
  x.beginPath();
  x.moveTo(18, 100);
  x.lineTo(30, 78);
  x.lineTo(46, 100);
  x.moveTo(30, 78);
  x.lineTo(42, 78);
  x.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * nyc: the neighborhood's NYC Open Data; proj: world projection; chains: named street polylines;
 * isRoad(x, z): on the roadway; inBox(x, z, pad): inside the playable square.
 */
export function buildNycExtras({ nyc, proj, chains, isRoad, inBox, curb }) {
  const group = new THREE.Group();
  const colliders = [];
  const crews = [];
  const toW = ([lon, lat]) => proj.toWorld(lat, lon);

  // ---------- bike lanes, 1.3 m in from the right-hand curb of the route's street
  const green = [];
  const white = [];
  const sharrows = [];
  const edgeRight = (x, z, nx, nz) => {
    for (let d = 1; d <= 14; d += 0.5) if (!isRoad(x + nx * d, z + nz * d)) return d;
    return 0;
  };
  for (const route of nyc.bikes ?? []) {
    const k = String(route.k);
    const cls = /III|share|sharrow|signed|route/i.test(k) ? 3 : /II|standard|buffer|conventional|lane/i.test(k) ? 2 : 1;
    const pts = route.p.map(toW);
    let sinceMark = 12;
    for (let i = 1; i < pts.length; i++) {
      const [ax, az] = pts[i - 1];
      const [bx, bz] = pts[i];
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 0.5) continue;
      const tx = (bx - ax) / L;
      const tz = (bz - az) / L;
      // cut long segments so the lane follows the curb as the street changes width
      for (let s = 0; s < L; s += 6) {
        const e = Math.min(L, s + 6);
        const mx = ax + tx * (s + e) / 2;
        const mz = az + tz * (s + e) / 2;
        if (!inBox(mx, mz, 4) || !isRoad(mx, mz)) continue;
        const d = edgeRight(mx, mz, -tz, tx);
        if (d < 3) continue;
        const off = d - 1.3;
        const x0 = ax + tx * s - tz * off;
        const z0 = az + tz * s + tx * off;
        const x1 = ax + tx * e - tz * off;
        const z1 = az + tz * e + tx * off;
        if (cls === 3) {
          sinceMark += e - s;
          if (sinceMark >= 25) {
            sinceMark = 0;
            const g = new THREE.PlaneGeometry(0.9, 1.8).rotateX(-Math.PI / 2).rotateY(Math.atan2(-tx, -tz));
            sharrows.push(g.translate((x0 + x1) / 2, 0.025, (z0 + z1) / 2));
          }
          continue;
        }
        green.push(quad(x0, z0, x1, z1, 1.6, 0.02));
        if (cls === 2) {
          for (const side of [-0.85, 0.85]) white.push(quad(x0 - tz * side, z0 + tx * side, x1 - tz * side, z1 + tx * side, 0.12, 0.022));
        }
      }
    }
  }
  const flat = (geos, mat) => geos.length && group.add(Object.assign(new THREE.Mesh(mergeGeometries(geos), mat), { receiveShadow: true }));
  flat(green, new THREE.MeshStandardMaterial({ color: 0x3f9a4a, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 }));
  flat(white, new THREE.MeshStandardMaterial({ color: 0xeeeeea, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -3 }));
  flat(sharrows, new THREE.MeshStandardMaterial({ map: sharrowTexture(), transparent: true, alphaTest: 0.4, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -3 }));

  // ---------- film crews on the blocks named in real permits
  const byKey = new Map();
  for (const c of chains) {
    const k = streetKey(c.name);
    if (!k) continue;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(c);
  }
  /** Where street a crosses street b (closest pair of points), or null. */
  const crossing = (as, bs) => {
    let best = null;
    let bd = 12;
    for (const a of as) for (const b of bs) for (const p of a.pts) for (const q of b.pts) {
      const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
      if (d < bd) {
        bd = d;
        best = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
      }
    }
    return best;
  };
  const now = Date.now();
  // shooting today first, then the nearest in time
  const films = (nyc.films ?? [])
    .map(([start, end, what, held]) => ({ when: Date.parse(start ?? end) || Date.parse(end) || 0, what, held }))
    .sort((a, b) => Math.abs(a.when - now) - Math.abs(b.when - now));
  const trucks = [];
  const poles = [];
  const lights = [];
  const signs = [];
  for (const f of films) {
    if (crews.length >= 2) break;
    for (const seg of String(f.held).split(',')) {
      const m = seg.match(/^\s*(.+?)\s+between\s+(.+?)\s+and\s+(.+?)\s*$/i);
      if (!m) continue;
      const street = byKey.get(streetKey(m[1]));
      if (!street) continue;
      const a = crossing(street, byKey.get(streetKey(m[2])) ?? []);
      const b = crossing(street, byKey.get(streetKey(m[3])) ?? []);
      if (!a || !b) continue;
      const cx = (a[0] + b[0]) / 2;
      const cz = (a[1] + b[1]) / 2;
      if (!inBox(cx, cz, 20)) continue;
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const tx = (b[0] - a[0]) / L;
      const tz = (b[1] - a[1]) / L;
      const d = edgeRight(cx, cz, -tz, tx);
      if (d < 3) continue;
      const ang = Math.atan2(tx, tz);
      // two or three production trucks nose to tail at the curb
      for (let k = -1; k <= 1; k++) {
        const along = k * 9;
        const x = cx + tx * along - tz * (d - 1.5);
        const z = cz + tz * along + tx * (d - 1.5);
        trucks.push(new THREE.BoxGeometry(2.4, 2.9, 7.2).translate(0, 1.75, -0.8).rotateY(ang).translate(x, 0, z));
        trucks.push(new THREE.BoxGeometry(2.3, 2.0, 1.8).translate(0, 1.3, 3.6).rotateY(ang).translate(x, 0, z));
        colliders.push({ poly: [[-1.25, -4.4], [1.25, -4.4], [1.25, 4.6], [-1.25, 4.6]].map(([u, v]) => [x + u * Math.cos(ang) + v * Math.sin(ang), z - u * Math.sin(ang) + v * Math.cos(ang)]), x0: x - 5, x1: x + 5, z0: z - 5, z1: z + 5 });
      }
      // balloon lights on tall stands at each end, and NO PARKING signs along the curb
      for (const [px, pz] of [a, b]) {
        const x = px + (cx - px) * 0.25 - tz * (d + 1.2);
        const z = pz + (cz - pz) * 0.25 + tx * (d + 1.2);
        poles.push(new THREE.CylinderGeometry(0.05, 0.08, 7, 6).translate(x, curb + 3.5, z));
        lights.push(new THREE.SphereGeometry(0.9, 14, 10).scale(1, 0.8, 1).translate(x, curb + 7.6, z));
      }
      for (let s = -L / 2 + 4; s < L / 2 - 4; s += 11) {
        const x = cx + tx * s - tz * (d + 0.35);
        const z = cz + tz * s + tx * (d + 0.35);
        poles.push(new THREE.CylinderGeometry(0.03, 0.03, 2.3, 5).translate(x, curb + 1.15, z));
        signs.push(new THREE.PlaneGeometry(0.34, 0.42).rotateY(ang + Math.PI / 2).translate(x, curb + 2.0, z));
      }
      crews.push({ x: cx, z: cz, what: f.what, street: m[1] });
      break;
    }
  }
  if (trucks.length) {
    group.add(new THREE.Mesh(mergeGeometries(trucks.map((g) => g.toNonIndexed())), new THREE.MeshStandardMaterial({ color: 0xe8e8e2, roughness: 0.6 })));
    group.add(new THREE.Mesh(mergeGeometries(poles.map((g) => g.toNonIndexed())), new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.5, metalness: 0.5 })));
    const balloon = new THREE.MeshStandardMaterial({ color: 0xfff6e0, emissive: 0xfff2d8, emissiveIntensity: 1.6, roughness: 0.4 });
    balloon.userData.filmLight = true;
    group.add(new THREE.Mesh(mergeGeometries(lights.map((g) => g.toNonIndexed())), balloon));
    group.add(new THREE.Mesh(mergeGeometries(signs), new THREE.MeshStandardMaterial({ map: signTexture(), roughness: 0.7, side: THREE.DoubleSide })));
  }
  return { group, colliders, crews };
}
