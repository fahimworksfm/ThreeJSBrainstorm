// Street furniture at real intersections: traffic lights, stop signs, green name blades,
// hydrants, trash baskets, and steaming manholes.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CURB } from '../config.js';
import { signalState } from '../signals.js';
import { hash01 } from './geo.js';

const LAMP_ON = {
  R: new THREE.Color(5, 0.25, 0.15),
  A: new THREE.Color(5, 2.4, 0.2),
  G: new THREE.Color(0.3, 4, 1.8),
};

/** Green street-name blades, one row per name. */
function signAtlas(names) {
  const rows = Math.max(1, names.length);
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 64 * rows;
  const ctx = c.getContext('2d');
  names.forEach((name, i) => {
    const y = i * 64;
    ctx.fillStyle = '#0f6b3a';
    ctx.fillRect(0, y, 512, 64);
    ctx.strokeStyle = '#e8f2ec';
    ctx.lineWidth = 3;
    ctx.strokeRect(4, y + 4, 504, 56);
    ctx.fillStyle = '#f2f7f4';
    ctx.font = 'bold 38px "Helvetica Neue", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, 256, y + 34, 480);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return { tex: t, rows };
}

const all = (geos) => mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g)));

/**
 * junctions: [{ id, p: [x, z], arms: [{ dx, dz, width, name }] }]
 * signalized: Set of junction ids with traffic lights.
 */
export function buildCorners({ junctions, signalized, isRoad, inBuilding, busy, low }) {
  const group = new THREE.Group();
  const poles = [];
  const lamps = { nsR: [], nsA: [], nsG: [], ewR: [], ewA: [], ewG: [] };
  const stops = [];
  const stopBacks = [];
  const hydrants = [];
  const baskets = [];
  const manholes = [];
  const steam = [];
  const colliders = [];
  const blades = [];
  const names = [];
  const nameIndex = new Map();
  const slot = (name) => {
    if (!nameIndex.has(name)) {
      if (names.length >= 60) return -1;
      nameIndex.set(name, names.length);
      names.push(name);
    }
    return nameIndex.get(name);
  };
  const pole = (x, z, h, r = 0.09) => {
    poles.push(new THREE.CylinderGeometry(r, r * 1.2, h, 6).translate(x, CURB + h / 2, z));
    colliders.push({ x0: x - r - 0.05, x1: x + r + 0.05, z0: z - r - 0.05, z1: z + r + 0.05 });
  };
  /** Walk out from the middle of the junction along (dx, dz) until the sidewalk starts. */
  const corner = (p, dx, dz, extra) => {
    const l = Math.hypot(dx, dz);
    dx /= l;
    dz /= l;
    for (let d = 2; d < 30; d += 0.5) {
      const x = p[0] + dx * d;
      const z = p[1] + dz * d;
      if (!isRoad(x, z)) {
        const cx = x + dx * extra;
        const cz = z + dz * extra;
        return inBuilding(cx, cz, 0.3) || isRoad(cx, cz) ? null : [cx, cz];
      }
    }
    return null;
  };
  const head = (hx, hy, hz, faceAxis, prefix) => {
    const box = faceAxis === 'z' ? new THREE.BoxGeometry(0.42, 1.2, 0.34) : new THREE.BoxGeometry(0.34, 1.2, 0.42);
    poles.push(box.translate(hx, hy, hz));
    for (const s of [-1, 1]) {
      for (const [key, dy] of [['R', 0.38], ['A', 0], ['G', -0.38]]) {
        const lamp = new THREE.CircleGeometry(0.13, 12);
        if (faceAxis === 'z') {
          if (s < 0) lamp.rotateY(Math.PI);
          lamp.translate(hx, hy + dy, hz + s * 0.18);
        } else {
          lamp.rotateY((s * Math.PI) / 2);
          lamp.translate(hx + s * 0.18, hy + dy, hz);
        }
        lamps[prefix + key].push(lamp);
      }
    }
  };

  for (const j of junctions) {
    const [x, z] = j.p;
    const lit = signalized.has(j.id);
    if (lit) {
      for (const [cx, cz] of [[1, -1], [-1, 1]]) {
        const c = corner(j.p, cx, cz, 0.7);
        if (!c) continue;
        pole(c[0], c[1], 5.8);
        head(c[0], CURB + 5.2, c[1], 'z', 'ns');
        head(c[0], CURB + 3.8, c[1], 'x', 'ew');
      }
    } else if (j.arms.length >= 3 && hash01(j.id, 2) < 0.8) {
      // all-way stop on the quieter corners
      for (const [cx, cz, face] of [[1, 1, 1], [-1, -1, -1]]) {
        const c = corner(j.p, cx, cz, 0.5);
        if (!c) continue;
        pole(c[0], c[1], 2.6, 0.04);
        const oct = new THREE.CircleGeometry(0.38, 8).rotateZ(Math.PI / 8);
        if (face < 0) oct.rotateY(Math.PI);
        stops.push(oct.translate(c[0], CURB + 2.4, c[1] + face * 0.03));
        const back = new THREE.CircleGeometry(0.38, 8).rotateZ(Math.PI / 8);
        if (face > 0) back.rotateY(Math.PI);
        stopBacks.push(back.translate(c[0], CURB + 2.4, c[1] + face * 0.02));
      }
    }
    // name blades on the north-east corner: one along each street
    const named = [];
    for (const a of j.arms) if (a.name && !named.some((n) => n.name === a.name)) named.push(a);
    if (named.length >= 1) {
      const c = corner(j.p, 1, -1, 0.5);
      if (c) {
        pole(c[0], c[1], 3.7, 0.05);
        named.slice(0, 2).forEach((a, k) => {
          const row = slot(a.name);
          if (row < 0) return;
          const g = new THREE.PlaneGeometry(2.6, 0.48);
          g.userData.row = row;
          g.rotateY(Math.atan2(a.dx, a.dz) + Math.PI / 2);
          blades.push(g.translate(c[0], CURB + 3.5 - k * 0.45, c[1]));
        });
      }
    }
    // a hydrant on a corner, a trash basket on the busy ones
    if (hash01(j.id, 5) < 0.7) {
      const c = corner(j.p, -1, 1, 0.8 + hash01(j.id, 6) * 2);
      if (c) {
        hydrants.push(new THREE.CylinderGeometry(0.16, 0.18, 0.6, 8).translate(c[0], CURB + 0.3, c[1]));
        hydrants.push(new THREE.SphereGeometry(0.17, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2).translate(c[0], CURB + 0.6, c[1]));
        hydrants.push(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 6).rotateZ(Math.PI / 2).translate(c[0], CURB + 0.42, c[1]));
        colliders.push({ x0: c[0] - 0.25, x1: c[0] + 0.25, z0: c[1] - 0.25, z1: c[1] + 0.25 });
      }
    }
    if (busy(x, z)) {
      const c = corner(j.p, -1, -1, 1.2);
      if (c) baskets.push(new THREE.CylinderGeometry(0.32, 0.26, 0.9, 10, 1, true).translate(c[0], CURB + 0.45, c[1]));
    }
    // a manhole in the middle of the crossing, sometimes steaming
    if (hash01(j.id, 8) < 0.6 && isRoad(x + 3, z + 2)) {
      manholes.push(new THREE.CircleGeometry(0.45, 14).rotateX(-Math.PI / 2).translate(x + 3, 0.025, z + 2));
      if (hash01(j.id, 9) < (low ? 0.15 : 0.3)) steam.push({ x: x + 3, y: 0.05, z: z + 2, strength: 0.6 + hash01(j.id, 10) * 0.4 });
    }
  }

  const add = (geos, mat) => {
    if (geos.length) group.add(new THREE.Mesh(all(geos), mat));
  };
  add(poles, new THREE.MeshStandardMaterial({ color: 0x1f2a24, roughness: 0.5, metalness: 0.6 }));
  const lampMats = {};
  for (const key of Object.keys(lamps)) {
    lampMats[key] = new THREE.MeshBasicMaterial({ color: 0x000000 });
    add(lamps[key], lampMats[key]);
  }
  const stopTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#b3121b';
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 40px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('STOP', 64, 66);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  add(stops, new THREE.MeshStandardMaterial({ map: stopTex, roughness: 0.6 }));
  add(stopBacks, new THREE.MeshStandardMaterial({ color: 0x8a8d90, roughness: 0.6 }));
  add(hydrants, new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.6 }));
  add(baskets, new THREE.MeshStandardMaterial({ color: 0x2f5a3a, roughness: 0.7, side: THREE.DoubleSide }));
  add(manholes, new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.4, metalness: 0.8 }));
  if (blades.length) {
    const atlas = signAtlas(names);
    for (const g of blades) {
      const uv = g.attributes.uv;
      // canvas row r (from the top) sits at v in [1 - (r + 1) / rows, 1 - r / rows]
      const r = g.userData.row;
      for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - (r + 1 - uv.getY(i)) / atlas.rows);
    }
    add(blades, new THREE.MeshStandardMaterial({ map: atlas.tex, emissiveMap: atlas.tex, emissive: 0xffffff, emissiveIntensity: 0.3, side: THREE.DoubleSide }));
  }

  const off = new THREE.Color(0.04, 0.02, 0.02);
  function update(t) {
    for (const axis of ['ns', 'ew']) {
      const s = signalState(t, axis);
      for (const k of ['R', 'A', 'G']) lampMats[axis + k].color.copy(s === k ? LAMP_ON[k] : off);
    }
  }
  return { group, update, steam, colliders, trees: [] };
}
