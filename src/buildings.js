import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CURB, D } from './config.js';
import {
  TILE_COLS, TILE_ROWS, TILE_W, TILE_H, SHOP_TILE_W,
  makeStorefront, makeNeon,
} from './textures.js';
import { rand, range, pick, chance } from './random.js';


/** Box with facade UVs in world units so window grids line up across buildings. */
export function facadeBox(w, h, d, x, y, z, uOff, vOff, tint) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  // face order: +x, -x, +y, -y, +z, -z (4 verts each)
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      if (f === 2 || f === 3) {
        uv.setXY(i, 0.0005, 0.9995); // roof: plain wall texel
        continue;
      }
      const fw = f < 2 ? d : w;
      uv.setXY(i, uOff + (uv.getX(i) * fw) / TILE_W, vOff + (uv.getY(i) * h) / TILE_H);
    }
  }
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    col[i * 3] = tint.r;
    col[i * 3 + 1] = tint.g;
    col[i * 3 + 2] = tint.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.translate(x, y + h / 2, z);
  return g;
}

function makeFenceTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  for (let x = 2; x < 64; x += 16) ctx.fillRect(x, 4, 4, 60);
  ctx.fillRect(0, 2, 64, 5);
  ctx.fillRect(0, 54, 64, 4);
  for (let x = 2; x < 64; x += 16) {
    ctx.beginPath();
    ctx.moveTo(x - 3, 4);
    ctx.lineTo(x + 2, -4);
    ctx.lineTo(x + 7, 4);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

function place(g, x, y, z, rotY = 0) {
  if (rotY) g.rotateY(rotY);
  g.translate(x, y, z);
  return g;
}

export function buildBuildings(layout, shared) {
  const group = new THREE.Group();
  const byStyle = {};
  const roofGeos = [];
  const woodGeos = [];
  const shingleGeos = [];
  const fenceGeos = [];
  const stoneGeos = [];
  const porchBulbs = [];
  const porchPools = [];
  const tint = new THREE.Color();

  for (const lot of layout.lots) {
    const { x0, x1, z0, z1, h, style } = lot;
    const w = x1 - x0;
    const d = z1 - z0;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    tint.set(lot.tint).multiplyScalar(range(0.85, 1.1));
    const uOff = Math.floor(rand() * TILE_COLS) / TILE_COLS;
    const vOff = Math.floor(rand() * TILE_ROWS) / TILE_ROWS;
    (byStyle[style] ??= []).push(facadeBox(w, h, d, cx, CURB, cz, uOff, vOff, tint));
    const top = CURB + h;

    if (lot.kind === 'house') {
      // gable roof: a triangular prism with its ridge running away from the street
      const rh = range(2.2, 3.2);
      const roof = new THREE.CylinderGeometry(1, 1, w + 0.6, 3, 1, false, Math.PI / 2);
      roof.rotateZ(Math.PI / 2);
      roof.scale(1, rh / 1.5, (d + 0.7) / 1.732);
      shingleGeos.push(place(roof, cx, top + rh / 3, cz));
    } else {
      // cornice / parapet lip
      const lip = new THREE.BoxGeometry(w + 0.3, 0.45, d + 0.3);
      roofGeos.push(place(lip, cx, top - 0.1, cz));
    }

    if (lot.kind === 'corner' || lot.kind === 'condo' || lot.kind === 'apt') {
      if (chance(0.6)) roofGeos.push(place(new THREE.BoxGeometry(3, 2.8, 3.4), cx + range(-w / 4, w / 4), top + 1.4, cz + range(-d / 4, d / 4)));
      if ((lot.kind === 'corner' || lot.kind === 'apt') && h > 14 && chance(0.45)) {
        const tx = cx + range(-w / 5, w / 5);
        const tz = cz + range(-d / 5, d / 5);
        woodGeos.push(place(new THREE.CylinderGeometry(1.5, 1.5, 3, 12), tx, top + 3.4, tz));
        woodGeos.push(place(new THREE.ConeGeometry(1.7, 1.2, 12), tx, top + 5.5, tz));
        for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          woodGeos.push(place(new THREE.BoxGeometry(0.18, 1.9, 0.18), tx + ox * 1.05, top + 0.95, tz + oz * 1.05));
        }
      }
    }
    if (lot.kind === 'row' && chance(0.3)) {
      const dish = new THREE.CylinderGeometry(0.45, 0.45, 0.06, 10);
      dish.rotateZ(0.9 * lot.side);
      roofGeos.push(place(dish, cx, top + 0.7, cz + range(-d / 3, d / 3)));
    }

    // front yard: iron fence, stoop, porch light
    if (lot.kind === 'row' || lot.kind === 'house') {
      const faceX = lot.side < 0 ? x0 : x1;
      const fenceX = lot.frontX + lot.side * 0.15;
      const stoopZ = chance(0.5) ? z0 + 1.2 : z1 - 1.2;
      const gate = [stoopZ - 0.7, stoopZ + 0.7];
      for (const [a, b] of [[lot.lotZ0 + 0.1, gate[0]], [gate[1], lot.lotZ1 - 0.1]]) {
        if (b - a < 0.3) continue;
        const fence = new THREE.PlaneGeometry(b - a, 1.05);
        const uv = fence.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setX(i, (uv.getX(i) * (b - a)) / 0.6);
        fenceGeos.push(place(fence, fenceX, CURB + 0.55, (a + b) / 2, Math.PI / 2));
      }
      const steps = lot.kind === 'house' ? 2 : 3;
      for (let s = 0; s < steps; s++) {
        const depth = (steps - s) * 0.45;
        const step = new THREE.BoxGeometry(depth, 0.32, 1.5);
        stoneGeos.push(place(step, faceX + (lot.side * depth) / 2, CURB + 0.16 + s * 0.32, stoopZ));
      }
      if (chance(0.65)) {
        const bulb = new THREE.SphereGeometry(0.12, 6, 4);
        porchBulbs.push(place(bulb, faceX + lot.side * 0.2, CURB + 2.6, stoopZ + 0.9));
        const pool = new THREE.PlaneGeometry(6, 6);
        pool.rotateX(-Math.PI / 2);
        porchPools.push(place(pool, faceX + lot.side * 1.5, CURB + 0.03, stoopZ + 0.9));
      }
    }
  }

  for (const [style, geos] of Object.entries(byStyle)) {
    const tex = shared.facade[style];
    const glassy = style === 'glass' || style === 'office';
    const mat = new THREE.MeshStandardMaterial({
      map: tex.map,
      emissiveMap: tex.emissiveMap,
      emissive: 0xffffff,
      emissiveIntensity: 1.35,
      vertexColors: true,
      roughness: glassy ? 0.35 : 0.9,
      metalness: glassy ? 0.5 : 0,
    });
    group.add(new THREE.Mesh(mergeGeometries(geos), mat));
  }

  const addMerged = (geos, mat) => {
    if (geos.length) group.add(new THREE.Mesh(mergeGeometries(geos), mat));
  };
  addMerged(roofGeos, new THREE.MeshStandardMaterial({ color: 0x3a3a3e, roughness: 0.9 }));
  addMerged(shingleGeos, new THREE.MeshStandardMaterial({ color: 0x2b2624, roughness: 0.9, flatShading: true }));
  addMerged(woodGeos, new THREE.MeshStandardMaterial({ color: 0x3b2a1d, roughness: 1 }));
  addMerged(
    fenceGeos,
    new THREE.MeshStandardMaterial({
      map: makeFenceTexture(), color: 0x1a1a1a, roughness: 0.5, metalness: 0.7,
      alphaTest: 0.5, side: THREE.DoubleSide,
    }),
  );
  addMerged(stoneGeos, new THREE.MeshStandardMaterial({ color: 0x5c5650, roughness: 0.9 }));
  addMerged(porchBulbs, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc88a).multiplyScalar(6) }));
  addMerged(
    porchPools,
    new THREE.MeshBasicMaterial({
      map: shared.pool, color: 0xffb870, transparent: true, opacity: 0.3,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }),
  );

  // ---- storefronts and neon on shopping-strip facades
  const shop = makeStorefront();
  const shopGeos = [];
  const neonGroups = new Map();
  for (const f of layout.faces) {
    if (!f.shop) continue;
    const g = new THREE.PlaneGeometry(f.w, 4.6);
    const uv = g.attributes.uv;
    const uo = Math.floor(rand() * 8) / 8;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uo + (uv.getX(i) * f.w) / SHOP_TILE_W);
    shopGeos.push(place(g, f.x + f.nx * 0.06, CURB + 2.3, f.z + f.nz * 0.06, Math.atan2(f.nx, f.nz)));

    if (!chance(0.55)) continue;
    const [word, color, canBlade] = pick(D.neon);
    const blade = canBlade && f.lot.h > 9 && chance(0.4);
    const flicker = chance(0.15);
    const key = `${word}|${blade}|${flicker}`;
    if (!neonGroups.has(key)) neonGroups.set(key, { word, color, blade, flicker, geos: [] });
    const entry = neonGroups.get(key);
    const ang = Math.atan2(f.nx, f.nz);
    if (blade) {
      const hgt = 4.2;
      entry.geos.push({ x: f.x + f.nx * 0.9, y: CURB + 5 + hgt / 2, z: f.z + f.nz * 0.9, ang: ang + Math.PI / 2, blade: true, hgt, offset: range(-f.w / 3, f.w / 3), nx: f.nx, nz: f.nz });
    } else {
      entry.geos.push({ x: f.x + f.nx * 0.1, y: CURB + 5.4, z: f.z + f.nz * 0.1, ang, blade: false, maxW: f.w - 1, nx: f.nx, nz: f.nz });
    }
  }
  const shopMat = new THREE.MeshStandardMaterial({
    map: shop.map, emissiveMap: shop.emissiveMap, emissive: 0xffffff, emissiveIntensity: 0.75, roughness: 0.6,
  });
  addMerged(shopGeos, shopMat);

  const neonMats = [];
  for (const entry of neonGroups.values()) {
    const { tex, aspect } = makeNeon(entry.word, entry.color, entry.blade);
    const geos = [];
    for (const s of entry.geos) {
      let g;
      if (s.blade) {
        g = new THREE.PlaneGeometry(s.hgt * aspect, s.hgt);
        // slide along the facade
        const tx = -s.nz * s.offset;
        const tz = s.nx * s.offset;
        geos.push(place(g, s.x + tx, s.y, s.z + tz, s.ang));
      } else {
        let hgt = 1.3;
        let wid = hgt * aspect;
        if (wid > s.maxW) {
          wid = s.maxW;
          hgt = wid / aspect;
        }
        if (wid < 1.5) continue;
        g = new THREE.PlaneGeometry(wid, hgt);
        geos.push(place(g, s.x, s.y, s.z, s.ang));
      }
    }
    if (!geos.length) continue;
    const base = new THREE.Color(entry.color).multiplyScalar(3.2);
    const mat = new THREE.MeshBasicMaterial({
      map: tex, color: base.clone(), transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    neonMats.push({ mat, base, flicker: entry.flicker, on: true, timer: range(0, 3) });
    group.add(new THREE.Mesh(mergeGeometries(geos), mat));
  }

  function update(t, dt) {
    for (const n of neonMats) {
      if (!n.flicker) continue;
      n.timer -= dt;
      if (n.timer <= 0) {
        n.on = !n.on;
        n.timer = n.on ? range(0.05, 2.5) : range(0.03, 0.25);
        n.mat.color.copy(n.base).multiplyScalar(n.on ? 1 : 0.06);
      }
    }
  }

  return { group, update };
}
