import * as THREE from 'three';
import { wetGround } from './fx.js';
import { steamStack, stackMaterial } from './streetprops.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CURB, D } from './config.js';
import { LightKit } from './lightkit.js';
import { isSignalized, signalState } from './signals.js';
import { makeSidewalk, makeStreetSign } from './textures.js';
import { rand, range, chance, pick } from './random.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

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
  const {
    nsW: NS_W, ewW: EW_W, NX, NZ, colX, rowZ, PITCH_Z,
    nsRoads: NS_ROADS, ewRoads: EW_ROADS, commercialNS: COMMERCIAL_NS, commercialEW: COMMERCIAL_EW,
  } = D;
  const elNS = D.el?.axis === 'ns' && !D.el.underground ? D.el.index : null;
  const elEW = D.el?.axis === 'ew' && !D.el.underground ? D.el.index : null;

  // ---- sidewalks (blocks, promenade); UVs in world space so the flags tile evenly
  const swGeos = layout.blocks.map((b) => {
    const g = new THREE.BoxGeometry(b.x1 - b.x0, CURB, b.z1 - b.z0);
    g.translate((b.x0 + b.x1) / 2, CURB / 2, (b.z0 + b.z1) / 2);
    return g;
  });
  const pr = layout.promenade;
  if (pr) {
    const prom = new THREE.BoxGeometry(pr.x1 - pr.x0, CURB + 2, pr.z1 - pr.z0);
    prom.translate((pr.x0 + pr.x1) / 2, CURB / 2 - 1, (pr.z0 + pr.z1) / 2);
    swGeos.push(prom);
  }
  const sidewalks = mergeGeometries(swGeos);
  const pos = sidewalks.attributes.position;
  const uv = sidewalks.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / 3, pos.getZ(i) / 3);
  group.add(
    new THREE.Mesh(
      sidewalks,
      wetGround(new THREE.MeshStandardMaterial({ map: shared.sidewalk ?? makeSidewalk(), color: shared.sidewalk ? 0xffffff : 0x9a9aa0, roughness: 0.55, metalness: 0.05 })),
    ),
  );

  // ---- road markings
  const white = [];
  const yellow = [];
  for (let i = D.iLo; i <= D.iHi; i++) {
    for (let j = D.jLo; j <= D.jHi; j++) {
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
  for (let i = D.iLo; i <= D.iHi; i++) {
    for (let j = D.rMin; j <= D.rMax; j++) {
      const a = rowZ(j) + EW_W / 2 + 4;
      const b = rowZ(j + 1) - EW_W / 2 - 4;
      for (const o of [-0.13, 0.13]) yellow.push(flat(0.12, b - a, colX(i) + o, 0.02, (a + b) / 2));
    }
  }
  for (let j = D.jLo; j <= D.jHi; j++) {
    for (let i = D.cMin; i <= D.cMax; i++) {
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
      const underEl = e.road === elNS;
      const lampZ = [];
      for (let k = 0; k < 4; k++) {
        const z = b.z0 + ((k + 0.5) * len) / 4;
        lampZ.push(z);
        kit.add(e.x, z, e.nx, 0, { kind: kindFor(e.shops), height: underEl ? 6.5 : 8.5, arm: underEl ? 1.2 : 2.2 });
      }
      // street trees: dense on side streets, sparser on shopping streets
      for (let z = b.z0 + 5; z < b.z1 - 5; z += e.shops ? 13 : 7.5) {
        if (lampZ.some((lz) => Math.abs(lz - z) < 3)) continue;
        if (chance(e.shops ? 0.4 : 0.6)) trees.push([e.x - e.nx * 0.8, z, range(1.35, 1.9)]);
      }
    }
    for (const [z, nz, road] of [[b.z0 + 0.5, -1, b.r], [b.z1 - 0.5, 1, b.r + 1]]) {
      const w = b.x1 - b.x0;
      const underEl = road === elEW;
      for (let k = 0; k < 2; k++) {
        kit.add(b.x0 + ((k + 0.5) * w) / 2, z, 0, nz, {
          kind: kindFor(COMMERCIAL_EW.has(road)), height: underEl ? 6 : 8.5, arm: underEl ? 1.2 : 2.2,
        });
      }
    }
  }
  // promenade lamps along the river
  if (pr) {
    for (let z = pr.z0 + 10; z < pr.z1 - 300; z += 24) {
      kit.add(pr.x0 + 3, z, 1, 0, { globe: true, height: 4, kind: 'warm', pool: 6 });
    }
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
  // merge anything: mixed indexed / non-indexed inputs are normalized first
  const add = (geos, mat) => {
    if (!geos.length) return;
    const mixed = geos.some((g) => g.index) && geos.some((g) => !g.index);
    group.add(new THREE.Mesh(mergeGeometries(mixed ? geos.map((g) => (g.index ? g.toNonIndexed() : g)) : geos), mat));
  };
  const steam = [];
  const stackGeos = [];

  // ---- food carts with striped umbrellas on the busy corners
  const cartMetal = [];
  const cartGlass = [];
  const umbrellas = [];
  const colliders = [];
  const UMB = [[0xf2c230, 0x1d4f9e], [0xd63a2a, 0xf4ecd8], [0x1e7a44, 0xf4ecd8], [0xe4661c, 0x2b6cb0]];
  const col = new THREE.Color();
  for (let i = 0; i < NX; i++) {
    for (let j = 0; j < NZ; j++) {
      if (!(COMMERCIAL_NS.has(i) || COMMERCIAL_EW.has(j)) || !chance(0.55)) continue;
      const sx = chance(0.5) ? 1 : -1;
      const sz = chance(0.5) ? 1 : -1;
      const x = colX(i) + sx * (NS_W / 2 + 1.6);
      const z = rowZ(j) + sz * (EW_W / 2 + range(6, 10));
      cartMetal.push(new RoundedBoxGeometry(0.95, 1.0, 1.7, 2, 0.06).translate(x, CURB + 0.75, z));
      cartMetal.push(new THREE.CylinderGeometry(0.2, 0.2, 0.1, 10).rotateZ(Math.PI / 2).translate(x - 0.5, CURB + 0.2, z - 0.5));
      cartMetal.push(new THREE.CylinderGeometry(0.2, 0.2, 0.1, 10).rotateZ(Math.PI / 2).translate(x + 0.5, CURB + 0.2, z - 0.5));
      cartMetal.push(new THREE.CylinderGeometry(0.03, 0.03, 1.4, 6).translate(x, CURB + 2.0, z + 0.3));
      cartGlass.push(new RoundedBoxGeometry(0.85, 0.5, 1.2, 2, 0.04).translate(x, CURB + 1.5, z - 0.1));
      // umbrella: an 8-panel cone, alternating colors
      const umb = new THREE.ConeGeometry(1.35, 0.55, 8, 1, true).toNonIndexed();
      const [c1, c2] = pick(UMB);
      const n = umb.attributes.position.count;
      const colors = new Float32Array(n * 3);
      for (let v = 0; v < n; v++) {
        col.set(Math.floor(v / 3) % 2 ? c1 : c2);
        colors.set([col.r, col.g, col.b], v * 3);
      }
      umb.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      umb.deleteAttribute('uv');
      umbrellas.push(umb.translate(x, CURB + 2.85, z + 0.3));
      steam.push({ x, y: CURB + 1.8, z: z - 0.3, strength: 0.45 });
      colliders.push({ x0: x - 0.6, x1: x + 0.6, z0: z - 1, z1: z + 1 });
    }
  }
  add(cartMetal, new THREE.MeshStandardMaterial({ color: 0xc9cdd3, roughness: 0.5 }));
  add(cartGlass, new THREE.MeshStandardMaterial({ color: 0xf2d9a8, emissive: 0xffc070, emissiveIntensity: 0.25, roughness: 0.4 }));
  add(umbrellas, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }));

  // ---- trash bags at the curb, newspaper boxes, bus shelters, sidewalk grates
  const bags = [];
  const boxes = [];
  const shelter = [];
  const shelterGlass = [];
  const grates = [];
  const tint = (g, hex) => {
    const n = g.attributes.position.count;
    const c = new THREE.Color(hex);
    const arr = new Float32Array(n * 3);
    for (let v = 0; v < n; v++) arr.set([c.r, c.g, c.b], v * 3);
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    g.deleteAttribute('uv');
    return g;
  };
  for (const b of layout.blocks) {
    if (b.outer || b.park) continue;
    // a pile of bags on one or two curbs
    for (let k = 0; k < (chance(0.5) ? 2 : 1); k++) {
      const alongX = chance(0.5);
      const t = range(0.2, 0.8);
      const x = alongX ? b.x0 + t * (b.x1 - b.x0) : chance(0.5) ? b.x0 + 0.7 : b.x1 - 0.7;
      const z = alongX ? (chance(0.5) ? b.z0 + 0.7 : b.z1 - 0.7) : b.z0 + t * (b.z1 - b.z0);
      const n = Math.floor(range(3, 8));
      for (let i = 0; i < n; i++) {
        const r = range(0.28, 0.42);
        const g = new THREE.IcosahedronGeometry(r, 1).scale(1, 0.8, 1).toNonIndexed();
        g.translate(x + range(-0.7, 0.7), CURB + r * 0.7 + (i > 4 ? 0.4 : 0), z + range(-0.7, 0.7));
        bags.push(tint(g, pick([0x1a1a1c, 0x1a1a1c, 0x22302a, 0xe8e6de, 0x3a3a3e])));
      }
    }
  }
  for (let i = 0; i < NX; i++) {
    for (let j = 0; j < NZ; j++) {
      if (!(COMMERCIAL_NS.has(i) || COMMERCIAL_EW.has(j))) continue;
      // newspaper boxes in a row near the corner
      if (chance(0.6)) {
        const x = colX(i) - NS_W / 2 - 0.9;
        const z0 = rowZ(j) - EW_W / 2 - 3.5;
        for (let k = 0; k < Math.floor(range(2, 5)); k++) {
          const g = new THREE.BoxGeometry(0.5, 1.05, 0.45).toNonIndexed();
          g.translate(x, CURB + 0.52, z0 - k * 0.55);
          boxes.push(tint(g, pick([0xc0392b, 0x1d4f9e, 0xf2c230, 0x1e7a44, 0xf4f1e8, 0x6b2a5a])));
        }
      }
      // sidewalk grates
      if (chance(0.5)) {
        const g = new THREE.PlaneGeometry(1.4, 3.2).rotateX(-Math.PI / 2);
        g.translate(colX(i) + NS_W / 2 + 2.2, CURB + 0.012, rowZ(j) + EW_W / 2 + range(8, 20));
        grates.push(g);
      }
    }
  }
  // bus shelters on the busy avenues
  for (let j = 0; j < NZ; j++) {
    if (!COMMERCIAL_EW.has(j)) continue;
    for (let i = 0; i < NX - 1; i += 2) {
      const x = (colX(i) + colX(i + 1)) / 2 + range(-10, 10);
      const z = rowZ(j) + EW_W / 2 + 1.1;
      shelter.push(new THREE.BoxGeometry(4.2, 0.12, 1.6).translate(x, CURB + 2.5, z + 0.5));
      for (const dx of [-2, 2]) shelter.push(new THREE.BoxGeometry(0.08, 2.5, 0.08).translate(x + dx, CURB + 1.25, z + 1.2));
      shelter.push(new THREE.BoxGeometry(2.6, 0.1, 0.4).translate(x, CURB + 0.5, z + 1.1));
      shelterGlass.push(new THREE.PlaneGeometry(4, 2.2).translate(x, CURB + 1.3, z + 1.25));
      shelterGlass.push(new THREE.PlaneGeometry(1.4, 2.2).rotateY(Math.PI / 2).translate(x - 2, CURB + 1.3, z + 0.55));
      colliders.push({ x0: x - 2.1, x1: x + 2.1, z0: z + 1.1, z1: z + 1.35 });
    }
  }
  add(bags, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, flatShading: true }));
  add(boxes, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }));
  add(shelter, new THREE.MeshStandardMaterial({ color: 0x3a4048, roughness: 0.6 }));
  add(shelterGlass, new THREE.MeshStandardMaterial({ color: 0x9fc3de, transparent: true, opacity: 0.28, roughness: 0.2, side: THREE.DoubleSide }));
  const grateCanvas = document.createElement('canvas');
  grateCanvas.width = grateCanvas.height = 64;
  const gc = grateCanvas.getContext('2d');
  gc.fillStyle = '#2a2a2c';
  gc.fillRect(0, 0, 64, 64);
  gc.fillStyle = '#0c0c0d';
  for (let y = 4; y < 64; y += 8) gc.fillRect(4, y, 56, 4);
  add(grates, new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(grateCanvas), roughness: 0.5 }));

  // ---- fallen leaves along the curbs
  const leafCanvas = document.createElement('canvas');
  leafCanvas.width = leafCanvas.height = 64;
  const lc = leafCanvas.getContext('2d');
  lc.fillStyle = '#fff';
  lc.beginPath();
  lc.moveTo(32, 4);
  lc.quadraticCurveTo(58, 26, 32, 60);
  lc.quadraticCurveTo(6, 26, 32, 4);
  lc.fill();
  lc.strokeStyle = 'rgba(0,0,0,0.35)';
  lc.lineWidth = 2;
  lc.beginPath();
  lc.moveTo(32, 8);
  lc.lineTo(32, 58);
  lc.stroke();
  const leafTex = new THREE.CanvasTexture(leafCanvas);
  const LEAVES = 2600;
  const leaves = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(0.22, 0.22).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ map: leafTex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1 }),
    LEAVES,
  );
  leaves.userData.leaves = true;
  const lm = new THREE.Matrix4();
  const lq = new THREE.Quaternion();
  const lpos = new THREE.Vector3();
  const lsc = new THREE.Vector3();
  const LEAF_COLORS = [0xd9822b, 0xe3a531, 0xc4542a, 0xe8c547, 0xb86420, 0x8a5a2a];
  let placed = 0;
  for (const b of layout.blocks) {
    if (b.outer || placed >= LEAVES) continue;
    for (let k = 0; k < 26 && placed < LEAVES; k++) {
      // mostly in the gutters, some on the sidewalk
      const edge = Math.floor(rand() * 4);
      const along = rand();
      const off = chance(0.6) ? range(-1.2, 0.2) : range(0.3, 3);
      let x;
      let z;
      if (edge < 2) {
        x = edge === 0 ? b.x0 - off : b.x1 + off;
        z = b.z0 + along * (b.z1 - b.z0);
      } else {
        z = edge === 2 ? b.z0 - off : b.z1 + off;
        x = b.x0 + along * (b.x1 - b.x0);
      }
      const onWalk = off > 0.05;
      lq.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * 6.28);
      lm.compose(lpos.set(x, (onWalk ? CURB : 0) + 0.03 + rand() * 0.01, z), lq, lsc.setScalar(range(0.7, 1.4)));
      leaves.setMatrixAt(placed, lm);
      leaves.setColorAt(placed, col.set(pick(LEAF_COLORS)));
      placed++;
    }
  }
  leaves.count = placed;
  leaves.receiveShadow = true;
  group.add(leaves);
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
  for (let i = 0; i < NX; i++) {
    for (let j = 0; j < NZ - 1; j++) {
      if (!chance(0.4) || j === elEW || j + 1 === elEW) continue;
      const mx = colX(i) + range(-2.5, 2.5);
      const mz = rowZ(j) + PITCH_Z / 2 + range(-30, 30);
      const g = new THREE.CircleGeometry(0.45, 14);
      g.rotateX(-Math.PI / 2);
      g.translate(mx, 0.025, mz);
      manholes.push(g);
      if (chance(0.3)) steam.push({ x: mx, y: 0.05, z: mz, strength: range(0.6, 1) });
      else if (chance(0.08)) {
        // a Con Ed stack over the street work, pumping a plume
        const st = steamStack(mx + 1.2, mz);
        stackGeos.push(...st.geos);
        steam.push(st.emitter);
        colliders.push({ x0: mx + 0.7, x1: mx + 1.7, z0: mz - 0.5, z1: mz + 0.5 });
      }
    }
  }
  if (stackGeos.length) add(stackGeos, stackMaterial());
  add(manholes, new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.4, metalness: 0.8 }));

  const off = new THREE.Color(0.04, 0.02, 0.02);
  function update(t) {
    for (const axis of ['ns', 'ew']) {
      const s = signalState(t, axis);
      for (const k of ['R', 'A', 'G']) lampMats[axis + k].color.copy(s === k ? LAMP_ON[k] : off);
    }
  }

  return { group, update, trees, steam, colliders };
}
