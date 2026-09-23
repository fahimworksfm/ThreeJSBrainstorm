import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  NS_W, EW_W, CURB, NX, NZ, colX, rowZ, PITCH_Z, NS_ROADS, EW_ROADS, COMMERCIAL_NS, COMMERCIAL_EW, EL_COL,
} from './config.js';
import { LightKit } from './lightkit.js';
import { isSignalized, signalState } from './signals.js';
import { makeSidewalk, makeStreetSign } from './textures.js';
import { rand, range, chance } from './random.js';

function flat(w, d, x, y, z) {
  const g = new THREE.PlaneGeometry(w, d);
  g.rotateX(-Math.PI / 2);
  g.translate(x, y, z);
  return g;
}

function makeStopTexture() {
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
}

export function buildStreets(layout, shared) {
  const group = new THREE.Group();

  // ---- sidewalks (blocks, promenade); UVs in world space so the flags tile evenly
  const swGeos = layout.blocks.map((b) => {
    const g = new THREE.BoxGeometry(b.x1 - b.x0, CURB, b.z1 - b.z0);
    g.translate((b.x0 + b.x1) / 2, CURB / 2, (b.z0 + b.z1) / 2);
    return g;
  });
  const pr = layout.promenade;
  const prom = new THREE.BoxGeometry(pr.x1 - pr.x0, CURB + 2, pr.z1 - pr.z0);
  prom.translate((pr.x0 + pr.x1) / 2, CURB / 2 - 1, (pr.z0 + pr.z1) / 2);
  swGeos.push(prom);
  const sidewalks = mergeGeometries(swGeos);
  const pos = sidewalks.attributes.position;
  const uv = sidewalks.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / 3, pos.getZ(i) / 3);
  group.add(
    new THREE.Mesh(
      sidewalks,
      new THREE.MeshStandardMaterial({ map: makeSidewalk(), color: 0x9a9aa0, roughness: 0.55, metalness: 0.05 }),
    ),
  );

  // ---- road markings
  const white = [];
  const yellow = [];
  for (let i = 0; i < NX; i++) {
    for (let j = 0; j < NZ; j++) {
      const x = colX(i);
      const z = rowZ(j);
      if (isSignalized(i, j)) {
        for (const s of [-1, 1]) {
          const zc = z + s * (EW_W / 2 + 1.8);
          for (let xx = x - NS_W / 2 + 0.7; xx < x + NS_W / 2 - 0.4; xx += 1.2) white.push(flat(0.6, 3, xx + 0.3, 0.02, zc));
          const xc = x + s * (NS_W / 2 + 1.8);
          for (let zz = z - EW_W / 2 + 0.7; zz < z + EW_W / 2 - 0.4; zz += 1.2) white.push(flat(3, 0.6, xc, 0.02, zz + 0.3));
        }
      }
      // stop bars for the approach lanes (drive on the right)
      white.push(flat(NS_W / 2 - 0.5, 0.4, x + NS_W / 4, 0.02, z + EW_W / 2 + 3.8));
      white.push(flat(NS_W / 2 - 0.5, 0.4, x - NS_W / 4, 0.02, z - EW_W / 2 - 3.8));
      if (isSignalized(i, j)) {
        white.push(flat(0.4, EW_W / 2 - 0.5, x - NS_W / 2 - 3.8, 0.02, z + EW_W / 4));
        white.push(flat(0.4, EW_W / 2 - 0.5, x + NS_W / 2 + 3.8, 0.02, z - EW_W / 4));
      }
    }
  }
  for (let i = 0; i < NX; i++) {
    for (let j = 0; j <= NZ; j++) {
      const a = rowZ(j) + EW_W / 2 + 4;
      const b = rowZ(j + 1) - EW_W / 2 - 4;
      for (const o of [-0.13, 0.13]) yellow.push(flat(0.12, b - a, colX(i) + o, 0.02, (a + b) / 2));
    }
  }
  for (let j = 0; j < NZ; j++) {
    for (let i = 0; i <= NX; i++) {
      const a = colX(i) + NS_W / 2 + 4;
      const b = colX(i + 1) - NS_W / 2 - 4;
      for (const o of [-0.13, 0.13]) yellow.push(flat(b - a, 0.12, (a + b) / 2, 0.02, rowZ(j) + o));
    }
  }
  const paint = (geos, color) =>
    new THREE.Mesh(
      mergeGeometries(geos),
      new THREE.MeshStandardMaterial({ color, roughness: 0.5, emissive: color, emissiveIntensity: 0.05 }),
    );
  group.add(paint(white, 0xd8d8d0), paint(yellow, 0xd9a91c));

  // ---- street lamps and street trees
  const kit = new LightKit();
  const trees = [];
  const kindFor = (commercial) => (commercial ? 'led' : 'sodium');
  for (const b of layout.blocks) {
    const len = b.z1 - b.z0;
    const edges = [
      { x: b.x0 + 0.5, nx: -1, road: b.c, shops: COMMERCIAL_NS.has(b.c) },
      { x: b.x1 - 0.5, nx: 1, road: b.c + 1, shops: COMMERCIAL_NS.has(b.c + 1) },
    ];
    for (const e of edges) {
      const underEl = e.road === EL_COL;
      const lampZ = [];
      for (let k = 0; k < 4; k++) {
        const z = b.z0 + ((k + 0.5) * len) / 4;
        lampZ.push(z);
        kit.add(e.x, z, e.nx, 0, { kind: kindFor(e.shops), height: underEl ? 6.5 : 8.5, arm: underEl ? 1.2 : 2.2 });
      }
      if (!e.shops) {
        for (let z = b.z0 + 5; z < b.z1 - 5; z += 7.5) {
          if (lampZ.some((lz) => Math.abs(lz - z) < 3)) continue;
          if (chance(0.6)) trees.push([e.x - e.nx * 0.8, z, range(0.8, 1.25)]);
        }
      }
    }
    for (const [z, nz, road] of [[b.z0 + 0.5, -1, b.r], [b.z1 - 0.5, 1, b.r + 1]]) {
      const w = b.x1 - b.x0;
      for (let k = 0; k < 2; k++) {
        kit.add(b.x0 + ((k + 0.5) * w) / 2, z, 0, nz, { kind: kindFor(COMMERCIAL_EW.has(road)) });
      }
    }
  }
  // promenade lamps along the river
  for (let z = pr.z0 + 10; z < pr.z1 - 300; z += 24) {
    kit.add(pr.x0 + 3, z, 1, 0, { globe: true, height: 4, kind: 'warm', pool: 6 });
  }
  group.add(kit.build(shared.pool));

  // ---- traffic lights, stop signs, street-name signs, hydrants, trash cans
  const poleGeos = [];
  const lampGeos = { nsR: [], nsA: [], nsG: [], ewR: [], ewA: [], ewG: [] };
  const stopGeos = [];
  const stopBackGeos = [];
  const hydrants = [];
  const baskets = [];
  const signGeos = new Map();
  const addSign = (name, g) => {
    if (!signGeos.has(name)) signGeos.set(name, []);
    signGeos.get(name).push(g);
  };
  const pole = (x, z, h, r = 0.09) => {
    const g = new THREE.CylinderGeometry(r, r * 1.2, h, 6);
    g.translate(x, CURB + h / 2, z);
    poleGeos.push(g);
  };

  for (let i = 0; i < NX; i++) {
    for (let j = 0; j < NZ; j++) {
      const x = colX(i);
      const z = rowZ(j);
      if (isSignalized(i, j)) {
        for (const [cx, cz] of [[1, -1], [-1, 1]]) {
          const px = x + cx * (NS_W / 2 + 0.7);
          const pz = z + cz * (EW_W / 2 + 0.7);
          pole(px, pz, 5.8);
          const head = (hx, hy, hz, faceAxis, prefix) => {
            const box = faceAxis === 'z' ? new THREE.BoxGeometry(0.42, 1.2, 0.34) : new THREE.BoxGeometry(0.34, 1.2, 0.42);
            box.translate(hx, hy, hz);
            poleGeos.push(box);
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
                lampGeos[prefix + key].push(lamp);
              }
            }
          };
          head(px, CURB + 5.2, pz, 'z', 'ns');
          head(px, CURB + 3.8, pz, 'x', 'ew');
        }
      } else {
        // stop signs for traffic on the north-south street
        for (const [cx, cz, face] of [[1, 1, 1], [-1, -1, -1]]) {
          const px = x + cx * (NS_W / 2 + 0.5);
          const pz = z + cz * (EW_W / 2 + 0.5);
          pole(px, pz, 2.6, 0.04);
          const oct = new THREE.CircleGeometry(0.38, 8);
          oct.rotateZ(Math.PI / 8);
          if (face < 0) oct.rotateY(Math.PI);
          oct.translate(px, CURB + 2.4, pz + face * 0.03);
          stopGeos.push(oct);
          const back = new THREE.CircleGeometry(0.38, 8);
          back.rotateZ(Math.PI / 8);
          if (face > 0) back.rotateY(Math.PI);
          back.translate(px, CURB + 2.4, pz + face * 0.02);
          stopBackGeos.push(back);
        }
      }
      // street name blades on the NE corner
      const sx = x + NS_W / 2 + 0.5;
      const sz = z - EW_W / 2 - 2.4;
      pole(sx, sz, 3.7, 0.05);
      const avBlade = new THREE.PlaneGeometry(2.6, 0.48);
      avBlade.translate(sx, CURB + 3.5, sz);
      addSign(EW_ROADS[j], avBlade);
      const stBlade = new THREE.PlaneGeometry(2.6, 0.48);
      stBlade.rotateY(Math.PI / 2);
      stBlade.translate(sx, CURB + 3.05, sz);
      addSign(NS_ROADS[i], stBlade);

      if (chance(0.7)) {
        const hx = x - NS_W / 2 - 0.7;
        const hz = z + EW_W / 2 + range(2, 5);
        const body = new THREE.CylinderGeometry(0.16, 0.18, 0.6, 8);
        body.translate(hx, CURB + 0.3, hz);
        const cap = new THREE.SphereGeometry(0.17, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2);
        cap.translate(hx, CURB + 0.6, hz);
        const nozzle = new THREE.CylinderGeometry(0.06, 0.06, 0.5, 6);
        nozzle.rotateZ(Math.PI / 2);
        nozzle.translate(hx, CURB + 0.42, hz);
        hydrants.push(body, cap, nozzle);
      }
      if (COMMERCIAL_NS.has(i) || COMMERCIAL_EW.has(j)) {
        const bx = x - NS_W / 2 - 0.8;
        const bz = z - EW_W / 2 - 1.2;
        const g = new THREE.CylinderGeometry(0.32, 0.26, 0.9, 10, 1, true);
        g.translate(bx, CURB + 0.45, bz);
        baskets.push(g);
      }
    }
  }
  const add = (geos, mat) => geos.length && group.add(new THREE.Mesh(mergeGeometries(geos), mat));
  add(poleGeos, new THREE.MeshStandardMaterial({ color: 0x1c2024, roughness: 0.5, metalness: 0.6 }));
  add(stopGeos, new THREE.MeshStandardMaterial({ map: makeStopTexture(), emissive: 0x401010, roughness: 0.4 }));
  add(stopBackGeos, new THREE.MeshStandardMaterial({ color: 0x55585c, roughness: 0.6, metalness: 0.5 }));
  add(hydrants, new THREE.MeshStandardMaterial({ color: 0x9a1c14, roughness: 0.5, metalness: 0.3 }));
  add(baskets, new THREE.MeshStandardMaterial({ color: 0x1c3a22, roughness: 0.6, metalness: 0.4, side: THREE.DoubleSide }));

  for (const [name, geos] of signGeos) {
    const tex = makeStreetSign(name);
    add(
      geos,
      new THREE.MeshStandardMaterial({
        map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.3, side: THREE.DoubleSide,
      }),
    );
  }

  const LAMP_ON = {
    R: new THREE.Color(5, 0.25, 0.15),
    A: new THREE.Color(5, 2.4, 0.2),
    G: new THREE.Color(0.3, 4, 1.8),
  };
  const lampMats = {};
  for (const key of Object.keys(lampGeos)) {
    const mat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    lampMats[key] = mat;
    add(lampGeos[key], mat);
  }

  // ---- manholes, some of them steaming
  const manholes = [];
  const steam = [];
  for (let i = 0; i < NX; i++) {
    for (let j = 0; j < NZ - 1; j++) {
      if (!chance(0.4)) continue;
      const mx = colX(i) + range(-2.5, 2.5);
      const mz = rowZ(j) + PITCH_Z / 2 + range(-30, 30);
      const g = new THREE.CircleGeometry(0.45, 14);
      g.rotateX(-Math.PI / 2);
      g.translate(mx, 0.025, mz);
      manholes.push(g);
      if (chance(0.3)) steam.push({ x: mx, y: 0.05, z: mz, strength: range(0.6, 1) });
    }
  }
  add(manholes, new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.4, metalness: 0.8 }));

  const off = new THREE.Color(0.04, 0.02, 0.02);
  function update(t) {
    for (const axis of ['ns', 'ew']) {
      const s = signalState(t, axis);
      for (const k of ['R', 'A', 'G']) lampMats[axis + k].color.copy(s === k ? LAMP_ON[k] : off);
    }
  }

  return { group, update, trees, steam };
}
