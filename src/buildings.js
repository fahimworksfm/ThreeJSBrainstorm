import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CURB, D } from './config.js';
import {
  TILE_COLS, TILE_ROWS, TILE_W, TILE_H, SHOP_TILE_W,
  makeStorefront, makeNeon,
} from './textures.js';
import { rand, range, pick, chance } from './random.js';
import { FLOOR_H } from './textures.js';
import { fruitStand, crateStack, litter } from './streetprops.js';


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

/** Merge geometries even when some are indexed and some are not. */
function mergeAll(geos) {
  const mixed = geos.some((g) => g.index) && geos.some((g) => !g.index);
  return mergeGeometries(mixed ? geos.map((g) => (g.index ? g.toNonIndexed() : g)) : geos);
}

function place(g, x, y, z, rotY = 0) {
  if (rotY) g.rotateY(rotY);
  g.translate(x, y, z);
  return g;
}

/** Walls of a closed ring from y0 to y1, facade UVs running around the outline. */
function ringWalls(pts, y0, y1, uOff, vOff, tint, outward = true) {
  const pos = [];
  const uv = [];
  const n = pts.length;
  const ccw = ringIsCCW(pts);
  let run = uOff * TILE_W;
  for (let i = 0; i < n; i++) {
    let a = pts[i];
    let b = pts[(i + 1) % n];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    // snap each wall to whole windows so the grid doesn't slice a window at the corners
    const u0 = run / TILE_W;
    const u1 = (run + l) / TILE_W;
    run += Math.max(WIN_STEP, Math.round(l / WIN_STEP) * WIN_STEP);
    const v0 = vOff + y0 / TILE_H;
    const v1 = vOff + y1 / TILE_H;
    let ua = u0;
    let ub = u1;
    if (ccw !== outward) {
      [a, b] = [b, a];
      [ua, ub] = [ub, ua];
    }
    pos.push(a[0], y1, a[1], a[0], y0, a[1], b[0], y0, b[1], a[0], y1, a[1], b[0], y0, b[1], b[0], y1, b[1]);
    uv.push(ua, v1, ua, v0, ub, v0, ua, v1, ub, v0, ub, v1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  paint(g, tint);
  return g;
}

/** Counter-clockwise seen from above (+y), with +x east and +z south. */
function ringIsCCW(pts) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
  // x/z with y up: counter-clockwise from above has negative shoelace in (x, z)
  return a < 0;
}

// washing on the line: whites, faded denim, bright shirts
const LAUNDRY = ['#f4f1e8', '#f4f1e8', '#e8e0cc', '#5a7fb0', '#3d5a8a', '#d8453a', '#f2c230', '#7fbf9a', '#e89ab0', '#ffffff'];

function paint(g, tint) {
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    col[i * 3] = tint.r;
    col[i * 3 + 1] = tint.g;
    col[i * 3 + 2] = tint.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** UVs from world x/z, one unit per 3 m (the texture pack's ground-sheet convention); drops vertex colors. */
function worldUV(g) {
  const p = g.attributes.position;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = p.getX(i) / 3;
    uv[i * 2 + 1] = p.getZ(i) / 3;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (g.attributes.color) g.deleteAttribute('color');
  return g.index ? g.toNonIndexed() : g;
}

/** Flat roof (or floor) cap for a ring with holes, facing up. */
function ringCap(pts, holes, y, tint) {
  const contour = pts.map(([x, z]) => new THREE.Vector2(x, z));
  const hs = (holes ?? []).map((h) => h.map(([x, z]) => new THREE.Vector2(x, z)));
  let tris;
  try {
    tris = THREE.ShapeUtils.triangulateShape(contour, hs);
  } catch {
    return null;
  }
  const all = [...contour, ...hs.flat()];
  const pos = [];
  const uv = [];
  for (const t of tris) {
    const [a, b, c] = t.map((k) => all[k]);
    const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    for (const v of cross > 0 ? [a, c, b] : [a, b, c]) {
      pos.push(v.x, y, v.y);
      uv.push(0.0005, 0.9995);
    }
  }
  if (!pos.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return paint(g, tint);
}

function offsetPts(pts, d) {
  const n = pts.length;
  const ccw = ringIsCCW(pts);
  const out = [];
  const nrm = [];
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    // outward normal for a counter-clockwise (from above) ring is (dz, -dx)
    const s = ccw ? -1 : 1;
    nrm.push([((b[1] - a[1]) / l) * s, (-(b[0] - a[0]) / l) * s]);
  }
  for (let i = 0; i < n; i++) {
    const na = nrm[(i - 1 + n) % n];
    const nb = nrm[i];
    let mx = na[0] + nb[0];
    let mz = na[1] + nb[1];
    const ml = Math.hypot(mx, mz);
    if (ml < 1e-6) [mx, mz] = nb;
    else {
      mx /= ml;
      mz /= ml;
    }
    const k = Math.min(2.5, 1 / Math.max(0.3, mx * nb[0] + mz * nb[1]));
    out.push([pts[i][0] + mx * d * k, pts[i][1] + mz * d * k]);
  }
  return out;
}

const WIN_STEP = 2.4;
const ROOF_TINT = new THREE.Color(0.46, 0.44, 0.42);
const tmpTint = new THREE.Color();

/** A real building footprint: facade walls, a roof, a cornice, and rooftop clutter. */
function polygonLot(lot, tint, byStyle, roofGeos, woodGeos, ironGeos, shingleGeos, tarGeos) {
  const { poly, holes, h, style } = lot;
  const base = lot.base ?? CURB;
  const top = base + h;
  const r = lot.rand;
  const uOff = Math.floor(r * 97 % 1 * TILE_COLS) / TILE_COLS;
  const vOff = Math.floor(r * 13 % 1 * TILE_ROWS) / TILE_ROWS;
  const tile = `${Math.floor((lot.x0 + lot.x1) / 320)},${Math.floor((lot.z0 + lot.z1) / 320)}`;
  const list = (byStyle[`${style}|${tile}`] ??= []);
  roofGeos = byStyle[`__roof|${tile}`] ??= [];
  list.push(ringWalls(poly, lot.minH ? base + lot.minH : base - 0.6, top, uOff, vOff, tint));
  for (const hole of holes ?? []) list.push(ringWalls(hole, base, top, uOff, vOff, tint, false));
  const bx = lot.x1 - lot.x0;
  const bz = lot.z1 - lot.z0;

  if (lot.gable) {
    // a pitched roof over the footprint's bounding box, ridge along the long side
    const { cx, cz, len, wid, ang } = lot.gable;
    const rh = lot.style === 'tudor' ? Math.min(5, wid * 0.6) : Math.min(3.2, wid * 0.35);
    const roof = new THREE.CylinderGeometry(1, 1, len + 0.5, 3, 1, false, Math.PI / 2);
    roof.rotateZ(Math.PI / 2);
    roof.scale(1, rh / 1.5, (wid + 0.6) / 1.732);
    roof.rotateY(-ang);
    shingleGeos.push(roof.translate(cx, top + rh / 3, cz));
    const cap = ringCap(poly, holes, top, tmpTint.copy(ROOF_TINT));
    if (cap) list.push(cap);
    return;
  }
  const cap = ringCap(poly, holes, top, tmpTint.copy(ROOF_TINT).multiplyScalar(0.85 + r * 0.3));
  if (cap && tarGeos) tarGeos.push(worldUV(cap));
  else if (cap) list.push(cap);
  if (lot.kind === 'shed' || lot.outer) return;

  // parapet: a lip that sticks out a little, with its top and inner face
  const out = offsetPts(poly, 0.28);
  const inner = offsetPts(poly, -0.25);
  const lip = [];
  lip.push(ringWalls(out, top - 0.35, top + 0.3, 0, 0, tint));
  lip.push(ringWalls(inner, top, top + 0.3, 0, 0, tint, false));
  const cap2 = ringCap(out, [inner], top + 0.3, tint);
  if (cap2) lip.push(cap2);
  for (const g of lip) {
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.0005, 0.9995);
    roofGeos.push(g.deleteAttribute('color'));
  }

  const inside = (x, z, m) => pointInRing(x, z, poly) && pointInRing(x + m, z, poly) && pointInRing(x - m, z, poly) && pointInRing(x, z + m, poly) && pointInRing(x, z - m, poly);
  const spot = (m, k) => {
    for (let t = 0; t < 8; t++) {
      const x = lot.x0 + hashf(lot.id, k * 17 + t) * bx;
      const z = lot.z0 + hashf(lot.id, k * 31 + t + 5) * bz;
      if (inside(x, z, m)) return [x, z];
    }
    return null;
  };
  // water towers on the classic walk-ups
  if (h > 12 && h < 60 && lot.area > 180 && hashf(lot.id, 3) < 0.6) {
    const s = spot(2.4, 1);
    if (s) {
      const [tx, tz] = s;
      const tr = 1.3 + hashf(lot.id, 4) * 0.5;
      const leg = 2 + hashf(lot.id, 5) * 1.2;
      woodGeos.push(place(new THREE.CylinderGeometry(tr, tr * 1.04, 3.2, 14), tx, top + leg + 1.6, tz));
      woodGeos.push(place(new THREE.ConeGeometry(tr * 1.12, 1.3, 14), tx, top + leg + 3.85, tz));
      for (let k = 0; k < 3; k++) {
        ironGeos.push(place(new THREE.TorusGeometry(tr * 1.05, 0.05, 4, 20).rotateX(Math.PI / 2), tx, top + leg + 0.5 + k * 1.1, tz));
      }
      for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        ironGeos.push(place(new THREE.BoxGeometry(0.16, leg, 0.16), tx + ox * tr * 0.72, top + leg / 2, tz + oz * tr * 0.72));
      }
    }
  }
  // AC units, vents, stair bulkheads
  const n = Math.min(5, Math.floor(lot.area / 90));
  for (let k = 0; k < n; k++) {
    const s = spot(1, 10 + k);
    if (!s) continue;
    const v = hashf(lot.id, 40 + k);
    if (v < 0.5) roofGeos.push(place(new THREE.BoxGeometry(1.1, 0.85, 0.8), s[0], top + 0.42, s[1]));
    else if (v < 0.8) roofGeos.push(place(new THREE.CylinderGeometry(0.22, 0.22, 0.9, 8), s[0], top + 0.45, s[1]));
    else roofGeos.push(place(new THREE.BoxGeometry(2.6, 2.4, 3), s[0], top + 1.2, s[1]));
  }
}

function pointInRing(x, z, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i];
    const [xj, zj] = pts[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function hashf(n, salt) {
  let h = (n * 374761393 + salt * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
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
  const windTime = { value: 0 };
  const tarGeos = shared.roof ? [] : null; // hand-drawn tar roofs, when the texture pack has one

  for (const lot of layout.lots) {
    if (lot.poly) {
      tint.set(lot.tint).multiplyScalar(0.85 + lot.rand * 0.25);
      polygonLot(lot, tint, byStyle, roofGeos, woodGeos, ironGeos, shingleGeos, tarGeos);
      continue;
    }
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
      const rh = style === 'tudor' ? range(4, 5.2) : range(2.2, 3.2); // Tudor roofs pitch steep
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
      // tar paper inside the parapet
      if (tarGeos) tarGeos.push(worldUV(new THREE.PlaneGeometry(w - 0.2, d - 0.2).rotateX(-Math.PI / 2).translate(cx, top + 0.235, cz)));
    }

    if (lot.kind === 'corner' || lot.kind === 'condo' || lot.kind === 'apt') {
      if (chance(0.6)) roofGeos.push(place(new THREE.BoxGeometry(3, 2.8, 3.4), cx + range(-w / 4, w / 4), top + 1.4, cz + range(-d / 4, d / 4)));
    }
    // water towers: wooden tanks on steel legs, iron hoops around them
    if (!lot.outer && ['corner', 'apt', 'mixed', 'condo'].includes(lot.kind) && h > 12 && chance(0.7)) {
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

  const styleMats = {};
  const roofMat = new THREE.MeshStandardMaterial({ color: 0xcfc3a8, roughness: 0.9 }); // cream cornices and roof bits
  for (const [key, geos] of Object.entries(byStyle)) {
    const style = key.split('|')[0];
    if (!geos.length) continue;
    if (style === '__roof') {
      group.add(new THREE.Mesh(mergeAll(geos), roofMat));
      continue;
    }
    if (styleMats[style]) {
      group.add(new THREE.Mesh(mergeAll(geos), styleMats[style]));
      continue;
    }
    const tex = shared.facade[style];
    const glassy = style === 'glass' || style === 'office';
    const mat = styleMats[style] = new THREE.MeshStandardMaterial({
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
    mat.userData.glassy = glassy;
    group.add(new THREE.Mesh(mergeAll(geos), mat));
  }

  const addMerged = (geos, mat) => {
    if (geos.length) group.add(new THREE.Mesh(mergeAll(geos), mat));
  };
  addMerged(roofGeos, roofMat);
  if (tarGeos?.length) addMerged(tarGeos, new THREE.MeshStandardMaterial({ map: shared.roof, roughness: 0.95 }));
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
  const laundryGeos = [];
  const potGeos = [];
  const plantGeos = [];
  for (const f of layout.faces) {
    const lot = f.lot;
    if (lot.outer || !['apt', 'corner', 'mixed'].includes(lot.kind)) continue;
    if (lot.h < 11 || f.w < 8 || !chance(0.72)) continue;
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
      // laundry drying over the rail, and a few potted plants
      if (chance(D.laundry ?? 0.3)) {
        for (let n = 0, u = -fw / 2 + 0.3; n < 4 && u < fw / 2 - 0.5; n++) {
          const cw = range(0.4, 0.9);
          const ch = range(0.35, 0.8);
          if (chance(0.7)) {
            const cloth = new THREE.PlaneGeometry(cw, ch, 1, 2);
            const flap = new Float32Array(cloth.attributes.position.count);
            for (let i = 0; i < flap.length; i++) flap[i] = 0.5 - cloth.attributes.position.getY(i) / ch;
            cloth.setAttribute('aFlap', new THREE.BufferAttribute(flap, 1));
            paint(cloth, tint.set(pick(LAUNDRY)));
            laundryGeos.push(place(cloth.translate(off + u + cw / 2, y + 0.97 - ch / 2, 1.21), f.x, 0, f.z, ang));
          }
          u += cw + range(0.05, 0.3);
        }
      }
      if (chance(0.2)) {
        const pot = new THREE.CylinderGeometry(0.16, 0.12, 0.26, 8).translate(off + range(-fw / 3, fw / 3), y + 0.17, 0.95);
        potGeos.push(place(pot, f.x, 0, f.z, ang));
        const bush = new THREE.IcosahedronGeometry(0.28, 0).scale(1, 0.8, 1);
        const c = pot.boundingBox ?? (pot.computeBoundingBox(), pot.boundingBox);
        plantGeos.push(bush.translate((c.min.x + c.max.x) / 2, c.max.y + 0.15, (c.min.z + c.max.z) / 2));
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
  addMerged(potGeos, new THREE.MeshStandardMaterial({ color: 0xa4553a, roughness: 0.9 }));
  addMerged(plantGeos, new THREE.MeshStandardMaterial({ color: 0x3f7a3a, roughness: 0.9, flatShading: true }));
  const laundryMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide });
  laundryMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windTime;
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'attribute float aFlap;\nuniform float uTime;\nvoid main() {')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          // hems swing in the breeze
          float w = sin(uTime * 2.3 + position.x * 1.3 + position.y * 0.4) + 0.4 * sin(uTime * 4.1 + position.z);
          transformed.x += aFlap * w * 0.07;
          transformed.z += aFlap * w * 0.05;
        }`,
      );
  };
  laundryMat.customProgramCacheKey = () => 'laundry';
  addMerged(laundryGeos, laundryMat);
  const ads = makeAdAtlas();
  const adMat = new THREE.MeshStandardMaterial({ map: ads, emissiveMap: ads, emissive: 0xffffff, emissiveIntensity: 0.3, roughness: 0.7, side: THREE.DoubleSide });
  adMat.userData.billboard = true;
  // Times Square style: facades wrapped in giant lit ads
  const bigGeos = [];
  const frameGeos = [];
  for (const f of layout.faces) {
    const lot = f.lot;
    const big = f.bigSign ?? (D.bigSigns && !lot.poly && (f.shop || lot.kind === 'condo') && lot.h > 14 && chance(D.bigSigns.chance ?? 0.5));
    if (!big || f.w < 6) continue;
    const ang = Math.atan2(f.nx, f.nz);
    const y0 = CURB + 5.4;
    const stack = Math.min(3, Math.floor((Math.min(lot.h, 45) - 6) / 9));
    for (let k = 0; k < stack; k++) {
      const bw = f.w - 1.2;
      const bh = Math.min(8, bw * 0.45);
      const g = new THREE.PlaneGeometry(bw, bh);
      const slot = Math.floor(rand() * AD_COUNT);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setY(i, (slot + uv.getY(i)) / AD_COUNT);
      bigGeos.push(place(g.translate(0, y0 + k * (bh + 1) + bh / 2, 0.35), f.x, 0, f.z, ang));
      // a steel frame behind each screen
      frameGeos.push(place(new THREE.BoxGeometry(bw + 0.3, bh + 0.3, 0.25).translate(0, y0 + k * (bh + 1) + bh / 2, 0.15), f.x, 0, f.z, ang));
    }
  }
  const bigMat = adMat.clone();
  bigMat.emissiveIntensity = 1.1;
  bigMat.userData.billboard = true;
  bigMat.userData.bright = true;
  addMerged(bigGeos, bigMat);
  addMerged(frameGeos, new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.6 }));
  addMerged(billboardGeos, adMat);
  addMerged(
    railGeos,
    new THREE.MeshStandardMaterial({
      map: fenceTex, color: 0x15171a, roughness: 0.6, metalness: 0.6, alphaTest: 0.5, side: THREE.DoubleSide,
    }),
  );

  // ---- storefronts and neon on shopping-strip facades
  const shop = shared.storefront ?? makeStorefront();
  const shopGeos = [];
  const neonGroups = new Map();
  const boardGeos = [];
  const awningGeos = [];
  const fruitGeos = [];
  const litterGeos = [];
  const propColliders = [];
  const generic = D.shops ?? ['DELI', 'PIZZA', 'BAKERY', 'COFFEE'];
  const boardNames = layout.signNames?.length ? layout.signNames : generic;
  const boards = makeSignAtlas(boardNames);
  // real shops (OpenStreetMap) get their own name; other storefronts get a generic trade word
  const slotOf = new Map(boardNames.map((n, i) => [n, i]));
  const realNames = new Set(layout.faces.flatMap((f) => (f.pois ?? []).map((p) => p.name)));
  const genericSlots = boardNames.map((n, i) => (realNames.has(n) ? -1 : i)).filter((i) => i >= 0);
  const usedPois = new Set();
  const signSlot = (f, tx, tz, bw) => {
    let best = null;
    let bd = Math.max(7, bw);
    for (const p of f.pois ?? []) {
      if (usedPois.has(p.poi) || !slotOf.has(p.name)) continue;
      const d = Math.hypot(p.x - tx, p.z - tz);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    if (best) {
      usedPois.add(best.poi);
      return slotOf.get(best.name);
    }
    const pool = genericSlots.length ? genericSlots : boardNames.map((_, i) => i);
    return pool[Math.floor(rand() * pool.length)];
  };
  for (const f of layout.faces) {
    if (!f.shop) {
      if (f.w > 3 && f.lot?.kind !== 'house' && chance(0.4)) litterGeos.push(...litter(f.x, f.z, f.nx, f.nz, 2.6, f.w * 0.8, rand, CURB, Math.floor(range(1, 4))));
      continue;
    }
    // painted sign board over each shop, with a striped awning on many of them
    const faceAng = Math.atan2(f.nx, f.nz);
    for (let off = -f.w / 2 + 0.3; off < f.w / 2 - 3; ) {
      const bw = Math.min(range(5.5, 9), f.w / 2 - 0.3 - off);
      if (bw < 3) break;
      const center = off + bw / 2;
      let stand = false;
      const tx = f.x - f.nz * center + f.nx * 0.12;
      const tz = f.z + f.nx * center + f.nz * 0.12;
      const board = new THREE.PlaneGeometry(bw - 0.3, 0.9);
      const slot = signSlot(f, tx, tz, bw);
      const uv = board.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setY(i, (slot + uv.getY(i)) / boards.count);
      boardGeos.push(place(board, tx, CURB + 5.05, tz, faceAng));
      if (chance(0.65)) {
        const aw = new THREE.PlaneGeometry(bw - 0.5, 1.7, Math.max(1, Math.round(bw / 2)), 2);
        // how free each vertex is to flap: pinned at the wall, loose at the hem
        const ay = aw.attributes.position;
        const flap = new Float32Array(ay.count);
        for (let i = 0; i < ay.count; i++) flap[i] = 0.5 - ay.getY(i) / 1.7;
        aw.setAttribute('aFlap', new THREE.BufferAttribute(flap, 1));
        aw.rotateX(-1.05); // slopes down and out from the wall
        const stripe = Math.floor(rand() * 6);
        const auv = aw.attributes.uv;
        for (let i = 0; i < auv.count; i++) auv.setXY(i, (auv.getX(i) * (bw - 0.5)) / 1.2, (stripe + auv.getY(i)) / 6);
        awningGeos.push(place(aw.translate(0, 4.2, 0.75), f.x - f.nz * center, CURB, f.z + f.nx * center, faceAng));
        // a fruit and vegetable stand out front, under the awning
        if (chance(0.35) && bw > 3.2) {
          stand = true;
          const sw = Math.min(bw - 1, 3.4);
          const fx = f.x - f.nz * center;
          const fz = f.z + f.nx * center;
          fruitGeos.push(...fruitStand(fx, fz, f.nx, f.nz, sw, rand, CURB));
          const cx = fx + f.nx * 0.9;
          const cz = fz + f.nz * 0.9;
          const hx = Math.abs(f.nz) * sw / 2 + Math.abs(f.nx) * 0.5;
          const hz = Math.abs(f.nx) * sw / 2 + Math.abs(f.nz) * 0.5;
          propColliders.push({ x0: cx - hx, x1: cx + hx, z0: cz - hz, z1: cz + hz });
        }
      }
      // milk crates and boxes by the door, and litter blowing along the pavement
      const ex = f.x - f.nz * (off + bw - 0.5);
      const ez = f.z + f.nx * (off + bw - 0.5);
      if (!stand && chance(0.3)) {
        fruitGeos.push(...crateStack(ex, ez, f.nx, f.nz, rand, CURB));
        const cx = ex + f.nx * 0.3;
        const cz = ez + f.nz * 0.3;
        propColliders.push({ x0: cx - 0.7, x1: cx + 0.7, z0: cz - 0.7, z1: cz + 0.7 });
      }
      litterGeos.push(...litter(f.x - f.nz * center, f.z + f.nx * center, f.nx, f.nz, 2.4, bw, rand, CURB, Math.floor(range(2, 7))));
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
  const awningMat = new THREE.MeshStandardMaterial({ map: makeAwningTexture(), roughness: 0.9, side: THREE.DoubleSide });
  awningMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windTime;
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'attribute float aFlap;\nuniform float uTime;\nvoid main() {')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          // canvas ripples in the breeze, gusting now and then
          float gust = 0.6 + 0.4 * sin(uTime * 0.37 + position.x * 0.01);
          float w = sin(uTime * 3.1 + position.x * 0.8 + position.z * 0.6) + 0.5 * sin(uTime * 5.3 + position.x * 1.7);
          transformed.y += aFlap * aFlap * w * 0.07 * gust;
        }`,
      );
  };
  awningMat.customProgramCacheKey = () => 'awning';
  addMerged(awningGeos, awningMat);
  addMerged(fruitGeos, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, flatShading: true }));
  addMerged(litterGeos, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2 }));

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
    if (!entry.flicker && chance(0.4)) {
      // marquee chase: letters light one by one, hold, blink off, blink on
      const seed = { value: rand() };
      const along = entry.blade ? '1.0 - vMapUv.y' : 'vMapUv.x';
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = windTime;
        shader.uniforms.uSeed = seed;
        shader.fragmentShader = shader.fragmentShader
          .replace('void main() {', 'uniform float uTime;\nuniform float uSeed;\nvoid main() {')
          .replace(
            '#include <map_fragment>',
            `#include <map_fragment>
            {
              float p = fract(uTime / 5.0 + uSeed);
              float at = clamp((${along} - 0.08) / 0.84, 0.0, 1.0);
              float lit = p < 0.45 ? step(at, p / 0.4) : p < 0.8 ? 1.0 : p < 0.87 ? 0.0 : p < 0.93 ? 1.0 : p < 0.96 ? 0.0 : 1.0;
              diffuseColor.rgb *= mix(0.07, 1.0, lit);
            }`,
          );
      };
      mat.customProgramCacheKey = () => `chase${entry.blade}`;
    }
    neonMats.push({ mat, base, flicker: entry.flicker, on: true, timer: range(0, 3) });
    group.add(new THREE.Mesh(mergeGeometries(geos), mat));
  }

  function update(t, dt) {
    windTime.value = t;
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

  return { group, update, fireEscapes, colliders: propColliders, realSigns: usedPois.size };
}
