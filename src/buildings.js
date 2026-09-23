import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CURB, D } from './config.js';
import {
  TILE_COLS, TILE_ROWS, TILE_W, TILE_H, SHOP_TILE_W,
  makeStorefront, makeNeon,
} from './textures.js';
import { rand, range, pick, chance } from './random.js';
import { FLOOR_H } from './textures.js';


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

const lot_h_ok = (f) => f.lot.h > 8;

const AD_COUNT = 6;
/** Painted rooftop ads, one per row: bold shapes and a word, comic-poster style. */
function makeAdAtlas() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 460 * AD_COUNT;
  const ctx = c.getContext('2d');
  const ads = [
    ['#d62d20', '#ffd23b', 'SUNNY COLA', 'circle'],
    ['#1b2a6b', '#ff4fd8', 'NEW YORK', 'bolt'],
    ['#ffcc00', '#1d1d1d', "TONY'S PIZZA", 'slice'],
    ['#0f6b6b', '#f7e7b0', 'QUEENS FM 98.1', 'wave'],
    ['#6b2a8a', '#39d0ff', 'NIGHT RIDER', 'bolt'],
    ['#f4ecd8', '#c0392b', 'THE DAILY', 'circle'],
  ];
  ads.forEach(([bg, fg, text, motif], i) => {
    const y = i * 460;
    ctx.fillStyle = bg;
    ctx.fillRect(0, y, 1024, 460);
    ctx.fillStyle = fg;
    ctx.globalAlpha = 0.9;
    if (motif === 'circle') {
      ctx.beginPath();
      ctx.arc(820, y + 230, 170, 0, Math.PI * 2);
      ctx.fill();
    } else if (motif === 'bolt') {
      ctx.beginPath();
      ctx.moveTo(700, y + 40);
      ctx.lineTo(980, y + 200);
      ctx.lineTo(840, y + 230);
      ctx.lineTo(990, y + 420);
      ctx.lineTo(690, y + 260);
      ctx.lineTo(830, y + 230);
      ctx.closePath();
      ctx.fill();
    } else if (motif === 'slice') {
      ctx.beginPath();
      ctx.moveTo(700, y + 60);
      ctx.lineTo(990, y + 60);
      ctx.lineTo(845, y + 420);
      ctx.closePath();
      ctx.fill();
    } else {
      for (let k = 0; k < 5; k++) ctx.fillRect(660, y + 80 + k * 64, 340, 26);
    }
    ctx.globalAlpha = 1;
    ctx.font = 'bold 110px "Arial Black", Impact, sans-serif';
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillText(text, 46, y + 276, 620);
    ctx.fillStyle = fg;
    ctx.fillText(text, 40, y + 270, 620);
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 14;
    ctx.strokeRect(7, y + 7, 1010, 446);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

const BOARD_COLORS = [
  ['#b3261e', '#fff3d6'], ['#1f5f3a', '#f7e7b0'], ['#1d3a6b', '#ffe08a'], ['#f2c230', '#2a1a0e'],
  ['#efe6d2', '#8a1f1a'], ['#6b2a5a', '#ffe6f2'], ['#0f6b6b', '#f1f7e8'], ['#e46a1c', '#fff8e8'],
];

/** One texture with a painted sign board per row: bold letters, a thin border, a shadow. */
function makeSignAtlas(names) {
  const rows = names.length;
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 128 * rows;
  const ctx = c.getContext('2d');
  names.forEach((name, i) => {
    const [bg, fg] = BOARD_COLORS[i % BOARD_COLORS.length];
    const y = i * 128;
    ctx.fillStyle = bg;
    ctx.fillRect(0, y, 1024, 128);
    ctx.strokeStyle = fg;
    ctx.lineWidth = 6;
    ctx.strokeRect(10, y + 10, 1004, 108);
    ctx.font = 'bold 84px "Arial Black", Impact, "Helvetica Neue", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillText(name, 516, y + 70, 940);
    ctx.fillStyle = fg;
    ctx.fillText(name, 512, y + 66, 940);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  // rows are flipped by the texture's flipY: slot k lives at v in [k/rows, (k+1)/rows] from the bottom
  return { tex, count: rows };
}

/** Six striped awning fabrics stacked in one texture. */
function makeAwningTexture() {
  const pairs = [['#c0392b', '#f4ecd8'], ['#1e6b44', '#f4ecd8'], ['#1d3a6b', '#f4ecd8'], ['#e1a22b', '#fff5dc'], ['#7a2a5a', '#f6e6ee'], ['#b3261e', '#1f1f1f']];
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64 * pairs.length;
  const ctx = c.getContext('2d');
  pairs.forEach(([a, b], i) => {
    for (let x = 0; x < 128; x += 32) {
      ctx.fillStyle = a;
      ctx.fillRect(x, i * 64, 16, 64);
      ctx.fillStyle = b;
      ctx.fillRect(x + 16, i * 64, 16, 64);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0, i * 64 + 56, 128, 8);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
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
  const ironGeos = [];
  const billboardGeos = [];
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
      const lip = new THREE.BoxGeometry(w + 0.5, 0.55, d + 0.5);
      roofGeos.push(place(lip, cx, top - 0.05, cz));
      const band = new THREE.BoxGeometry(w + 0.3, 0.25, d + 0.3);
      roofGeos.push(place(band, cx, top - 0.65, cz));
    }

    if (lot.kind === 'corner' || lot.kind === 'condo' || lot.kind === 'apt') {
      if (chance(0.6)) roofGeos.push(place(new THREE.BoxGeometry(3, 2.8, 3.4), cx + range(-w / 4, w / 4), top + 1.4, cz + range(-d / 4, d / 4)));
    }
    // water towers: wooden tanks on steel legs, iron hoops around them
    if (!lot.outer && ['corner', 'apt', 'mixed', 'condo'].includes(lot.kind) && h > 12 && chance(0.55)) {
      const tx = cx + range(-w / 5, w / 5);
      const tz = cz + range(-d / 5, d / 5);
      const tr = range(1.3, 1.8);
      const leg = range(2, 3.2);
      woodGeos.push(place(new THREE.CylinderGeometry(tr, tr * 1.04, 3.2, 14), tx, top + leg + 1.6, tz));
      woodGeos.push(place(new THREE.ConeGeometry(tr * 1.12, 1.3, 14), tx, top + leg + 3.85, tz));
      for (let k = 0; k < 3; k++) {
        const hoop = new THREE.TorusGeometry(tr * 1.05, 0.05, 4, 20).rotateX(Math.PI / 2);
        ironGeos.push(place(hoop, tx, top + leg + 0.5 + k * 1.1, tz));
      }
      for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        ironGeos.push(place(new THREE.BoxGeometry(0.16, leg, 0.16), tx + ox * tr * 0.72, top + leg / 2, tz + oz * tr * 0.72));
      }
      const brace = new THREE.BoxGeometry(tr * 1.9, 0.08, 0.08);
      ironGeos.push(place(brace.clone().rotateZ(0.5), tx, top + leg / 2, tz - tr * 0.72));
      ironGeos.push(place(brace.clone().rotateZ(-0.5), tx, top + leg / 2, tz + tr * 0.72));
    }
    // lit billboards on some corner roofs, facing the street
    if (!lot.outer && lot.kind === 'corner' && h > 13 && chance(0.28)) {
      const bw = Math.min(9, d - 1);
      const bx = lot.side < 0 ? x0 + 1 : x1 - 1;
      const g = new THREE.PlaneGeometry(bw, bw * 0.45);
      const slot = Math.floor(rand() * AD_COUNT);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setY(i, (slot + uv.getY(i)) / AD_COUNT);
      billboardGeos.push(place(g.translate(0, top + 2.6 + bw * 0.225, 0), bx + lot.side * 0.3, 0, cz, lot.side > 0 ? Math.PI / 2 : -Math.PI / 2));
      for (const oz of [-bw / 2 + 0.4, bw / 2 - 0.4]) ironGeos.push(place(new THREE.BoxGeometry(0.18, 2.6 + bw * 0.45, 0.18), bx, top + (2.6 + bw * 0.45) / 2, cz + oz));
      ironGeos.push(place(new THREE.BoxGeometry(0.14, 0.14, bw), bx, top + 2.4, cz));
    }
    // rooftop clutter: AC units, vents, skylights
    if (!lot.outer && lot.kind !== 'house') {
      const n = Math.floor(range(0, lot.kind === 'row' ? 2 : 4));
      for (let k = 0; k < n; k++) {
        const ax = cx + range(-w / 2 + 1.2, w / 2 - 1.2);
        const az = cz + range(-d / 2 + 1.2, d / 2 - 1.2);
        if (chance(0.6)) roofGeos.push(place(new THREE.BoxGeometry(1.1, 0.85, 0.8), ax, top + 0.65, az));
        else roofGeos.push(place(new THREE.CylinderGeometry(0.22, 0.22, 0.9, 8), ax, top + 0.65, az));
      }
      if (chance(0.3)) roofGeos.push(place(new THREE.ConeGeometry(0.9, 0.6, 4), cx + range(-w / 4, w / 4), top + 0.5, cz + range(-d / 4, d / 4)));
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
      normalMap: tex.normalMap,
      normalScale: new THREE.Vector2(1.4, 1.4),
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
  addMerged(roofGeos, new THREE.MeshStandardMaterial({ color: 0xcfc3a8, roughness: 0.9 })); // cream cornices and roof bits
  addMerged(shingleGeos, new THREE.MeshStandardMaterial({ color: 0x2b2624, roughness: 0.9, flatShading: true }));
  addMerged(woodGeos, new THREE.MeshStandardMaterial({ color: 0x3b2a1d, roughness: 1 }));
  const fenceTex = makeFenceTexture();
  const railGeos = [];
  addMerged(
    fenceGeos,
    new THREE.MeshStandardMaterial({
      map: fenceTex, color: 0x1a1a1a, roughness: 0.5, metalness: 0.7,
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

  // ---- cornice brackets under the rooflines, pilasters between the shops
  const trimGeos = [];
  for (const f of layout.faces) {
    const lot = f.lot;
    if (lot.outer || lot.kind === 'house' || lot.kind === 'condo' || f.w < 5) continue;
    const ang = Math.atan2(f.nx, f.nz);
    const top = CURB + lot.h;
    if (['brick', 'stone', 'deco'].includes(lot.style) && chance(0.7)) {
      for (let o = -f.w / 2 + 0.5; o <= f.w / 2 - 0.4; o += 1.25) {
        trimGeos.push(place(new THREE.BoxGeometry(0.22, 0.42, 0.34).translate(o, top - 0.55, 0.17), f.x, 0, f.z, ang));
      }
    }
    if (f.shop) {
      for (let o = -f.w / 2 + 0.15; o <= f.w / 2; o += Math.max(4.5, f.w / Math.ceil(f.w / 7))) {
        trimGeos.push(place(new THREE.BoxGeometry(0.35, 4.7, 0.16).translate(o, CURB + 2.35, 0.08), f.x, 0, f.z, ang));
      }
      trimGeos.push(place(new THREE.BoxGeometry(f.w, 0.18, 0.3).translate(0, CURB + 4.65, 0.15), f.x, 0, f.z, ang));
    }
  }
  addMerged(trimGeos, new THREE.MeshStandardMaterial({ color: 0xd8ccb2, roughness: 0.9 }));

  // ---- fire escapes on the walk-ups
  const fireEscapes = [];
  for (const f of layout.faces) {
    const lot = f.lot;
    if (lot.outer || !['apt', 'corner', 'mixed'].includes(lot.kind)) continue;
    if (lot.h < 11 || f.w < 8 || !chance(0.45)) continue;
    const ang = Math.atan2(f.nx, f.nz);
    const fw = Math.min(5.5, f.w - 2.5);
    const off = range(-(f.w - fw) / 2 + 0.5, (f.w - fw) / 2 - 0.5);
    const floorsUp = Math.floor((lot.h - 0.6) / FLOOR_H);
    const pieces = [];
    const first = f.shop ? 2 : 1; // keep clear of the storefront
    const tx = f.x - f.nz * off;
    const tz = f.z + f.nx * off;
    fireEscapes.push({ x: tx + f.nx * 1.4, z: tz + f.nz * 1.4, nx: f.nx, nz: f.nz, lot, roofX: tx - f.nx * 1.2, roofZ: tz - f.nz * 1.2 });
    for (let k = first; k < floorsUp; k++) {
      const y = CURB + k * FLOOR_H + 0.15;
      pieces.push(new THREE.BoxGeometry(fw, 0.08, 1.15).translate(off, y, 0.6));
      const rail = new THREE.PlaneGeometry(fw, 0.95);
      const uv = rail.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setX(i, (uv.getX(i) * fw) / 0.6);
      railGeos.push(place(rail.translate(off, y + 0.5, 1.18), f.x, 0, f.z, ang));
      for (const sx of [-1, 1]) {
        const end = new THREE.PlaneGeometry(1.15, 0.95).rotateY(Math.PI / 2);
        railGeos.push(place(end.translate(off + (sx * fw) / 2, y + 0.5, 0.6), f.x, 0, f.z, ang));
      }
      if (k < floorsUp - 1) {
        // zig-zag stair up to the next landing
        const run = fw * 0.6;
        const L = Math.hypot(run, FLOOR_H);
        const dir = k % 2 ? 1 : -1;
        const stair = new THREE.BoxGeometry(L, 0.06, 0.5).rotateZ(dir * Math.atan2(FLOOR_H, run));
        pieces.push(stair.translate(off, y + FLOOR_H / 2, 0.85));
      }
    }
    for (const g of pieces) ironGeos.push(place(g, f.x, 0, f.z, ang));
  }
  addMerged(ironGeos, new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.6, metalness: 0.6 }));
  const ads = makeAdAtlas();
  const adMat = new THREE.MeshStandardMaterial({ map: ads, emissiveMap: ads, emissive: 0xffffff, emissiveIntensity: 0.3, roughness: 0.7, side: THREE.DoubleSide });
  adMat.userData.billboard = true;
  addMerged(billboardGeos, adMat);
  addMerged(
    railGeos,
    new THREE.MeshStandardMaterial({
      map: fenceTex, color: 0x15171a, roughness: 0.6, metalness: 0.6, alphaTest: 0.5, side: THREE.DoubleSide,
    }),
  );

  // ---- storefronts and neon on shopping-strip facades
  const shop = makeStorefront();
  const shopGeos = [];
  const neonGroups = new Map();
  const boardGeos = [];
  const awningGeos = [];
  const boards = makeSignAtlas(D.shops ?? ['DELI', 'PIZZA', 'BAKERY', 'COFFEE']);
  for (const f of layout.faces) {
    if (!f.shop) continue;
    // painted sign board over each shop, with a striped awning on many of them
    const faceAng = Math.atan2(f.nx, f.nz);
    for (let off = -f.w / 2 + 0.3; off < f.w / 2 - 3; ) {
      const bw = Math.min(range(5.5, 9), f.w / 2 - 0.3 - off);
      if (bw < 3) break;
      const center = off + bw / 2;
      const tx = f.x - f.nz * center + f.nx * 0.12;
      const tz = f.z + f.nx * center + f.nz * 0.12;
      const board = new THREE.PlaneGeometry(bw - 0.3, 0.9);
      const slot = Math.floor(rand() * boards.count);
      const uv = board.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setY(i, (slot + uv.getY(i)) / boards.count);
      boardGeos.push(place(board, tx, CURB + 5.05, tz, faceAng));
      if (chance(0.65)) {
        const aw = new THREE.PlaneGeometry(bw - 0.5, 1.7);
        aw.rotateX(-1.05); // slopes down and out from the wall
        const stripe = Math.floor(rand() * 6);
        const auv = aw.attributes.uv;
        for (let i = 0; i < auv.count; i++) auv.setXY(i, (auv.getX(i) * (bw - 0.5)) / 1.2, (stripe + auv.getY(i)) / 6);
        awningGeos.push(place(aw.translate(0, 4.2, 0.75), f.x - f.nz * center, CURB, f.z + f.nx * center, faceAng));
      }
      off += bw;
    }
    if (!chance(0.3)) continue;
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
      if (lot_h_ok(f)) entry.geos.push({ x: f.x + f.nx * 0.1, y: CURB + 6.5, z: f.z + f.nz * 0.1, ang, blade: false, maxW: f.w - 1, nx: f.nx, nz: f.nz });
    }
  }
  const shopMat = new THREE.MeshStandardMaterial({
    map: shop.map, emissiveMap: shop.emissiveMap, emissive: 0xffffff, emissiveIntensity: 0.75, roughness: 0.6,
  });
  shopMat.userData.storefront = true;
  addMerged(shopGeos, shopMat);
  const boardMat = new THREE.MeshStandardMaterial({ map: boards.tex, roughness: 0.8, emissive: 0xffffff, emissiveMap: boards.tex, emissiveIntensity: 0.12 });
  addMerged(boardGeos, boardMat);
  addMerged(awningGeos, new THREE.MeshStandardMaterial({ map: makeAwningTexture(), roughness: 0.9, side: THREE.DoubleSide }));

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
    mat.userData.neonBase = base.clone();
    mat.userData.flicker = entry.flicker;
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
        n.mat.color.copy(n.base).multiplyScalar((n.on ? 1 : 0.06) * (n.mat.userData.neonScale ?? 1));
      }
    }
  }

  return { group, update, fireEscapes };
}
