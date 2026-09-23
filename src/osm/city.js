// Builds a whole neighborhood out of real OpenStreetMap data: curbs and sidewalks traced
// from the street network, extruded building footprints with the comic facades, lamps,
// trees, traffic on the real streets, crowds around the real blocks, and the el.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CURB, D } from '../config.js';
import { FLOOR_H, makeSidewalk } from '../textures.js';
import { parseOSM } from './parse.js';
import { GroundMask, tracePolygons, traceLoops, loopsToPolygons, flatPolygons, curbWalls } from './ground.js';
import {
  Path, offsetLine, resample, pointInPoly, bounds, signedArea, normName, shortName, closestOnSegment,
  offsetRing, ringNormals, simplifyRing, hash01,
} from './geo.js';
import { buildViaduct } from './viaduct.js';
import { buildCorners } from './props.js';

const SIDING_TINTS = ['#d3dfea', '#ece4cf', '#d6e8d4', '#efd6d2', '#dedede', '#efe7c2', '#e0d4ea'];
const BRICK_TINTS = ['#ffffff', '#f0d0c0', '#d8b8a8', '#ffe0cc', '#c8a898'];
const HOUSE_TYPES = /^(house|detached|semidetached_house|bungalow|terrace|residential)$/;
const pickBy = (list, r) => list[Math.floor(r * list.length) % list.length];

/** Spatial buckets for points or segments. */
class Buckets {
  constructor(cell) {
    this.cell = cell;
    this.map = new Map();
  }
  key(i, j) {
    return i * 100003 + j;
  }
  add(x0, z0, x1, z1, item) {
    const c = this.cell;
    for (let i = Math.floor(Math.min(x0, x1) / c); i <= Math.floor(Math.max(x0, x1) / c); i++) {
      for (let j = Math.floor(Math.min(z0, z1) / c); j <= Math.floor(Math.max(z0, z1) / c); j++) {
        const k = this.key(i, j);
        let l = this.map.get(k);
        if (!l) this.map.set(k, (l = []));
        l.push(item);
      }
    }
  }
  near(x, z, r) {
    const c = this.cell;
    const out = new Set();
    for (let i = Math.floor((x - r) / c); i <= Math.floor((x + r) / c); i++) {
      for (let j = Math.floor((z - r) / c); j <= Math.floor((z + r) / c); j++) {
        const l = this.map.get(this.key(i, j));
        if (l) for (const it of l) out.add(it);
      }
    }
    return out;
  }
}

/** Join same-named ways that meet end to end into long polylines (node ids kept for junctions). */
function chainRoads(roads) {
  const groups = new Map();
  for (const r of roads) {
    const key = r.norm || `#${r.id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  const chains = [];
  for (const list of groups.values()) {
    const open = list.map((r) => ({ nodes: r.nodes.slice(), pts: r.pts.slice(), road: r, oneway: r.oneway }));
    while (open.length) {
      const cur = open.pop();
      let grew = true;
      while (grew) {
        grew = false;
        for (let k = 0; k < open.length; k++) {
          const o = open[k];
          const a0 = cur.nodes[0];
          const a1 = cur.nodes[cur.nodes.length - 1];
          const b0 = o.nodes[0];
          const b1 = o.nodes[o.nodes.length - 1];
          if (a0 === a1) break;
          let nodes;
          let pts;
          if (a1 === b0) {
            nodes = cur.nodes.concat(o.nodes.slice(1));
            pts = cur.pts.concat(o.pts.slice(1));
          } else if (a1 === b1) {
            nodes = cur.nodes.concat(o.nodes.slice().reverse().slice(1));
            pts = cur.pts.concat(o.pts.slice().reverse().slice(1));
          } else if (a0 === b1) {
            nodes = o.nodes.concat(cur.nodes.slice(1));
            pts = o.pts.concat(cur.pts.slice(1));
          } else if (a0 === b0) {
            nodes = o.nodes.slice().reverse().concat(cur.nodes.slice(1));
            pts = o.pts.slice().reverse().concat(cur.pts.slice(1));
          } else continue;
          // keep oneway only if the pieces agree
          const flipped = a1 === b1 || a0 === b0;
          const ow = flipped ? -o.oneway : o.oneway;
          if (ow !== cur.oneway) cur.oneway = cur.oneway && ow ? cur.oneway : cur.oneway || ow;
          cur.nodes = nodes;
          cur.pts = pts;
          open.splice(k, 1);
          grew = true;
          break;
        }
      }
      chains.push({ ...cur, name: cur.road.name, norm: cur.road.norm, hw: cur.road.hw, rank: cur.road.rank, width: cur.road.width, street: cur.road.street });
    }
  }
  return chains;
}

/** Closest approach between two polylines: point and distance. */
function closestApproach(a, b) {
  let best = Infinity;
  let bp = null;
  for (let i = 1; i < a.length; i++) {
    for (let j = 1; j < b.length; j++) {
      // sample a's segment ends against b's segment and vice versa (good enough for crossing streets)
      for (const [p, q0, q1] of [[a[i - 1], b[j - 1], b[j]], [a[i], b[j - 1], b[j]], [b[j - 1], a[i - 1], a[i]], [b[j], a[i - 1], a[i]]]) {
        const r = closestOnSegment(p[0], p[1], q0[0], q0[1], q1[0], q1[1]);
        if (r[3] < best) {
          best = r[3];
          bp = [(p[0] + r[0]) / 2, (p[1] + r[1]) / 2];
        }
      }
    }
  }
  // true crossings: intersect segments exactly
  for (let i = 1; i < a.length; i++) {
    for (let j = 1; j < b.length; j++) {
      const p = segIntersect(a[i - 1], a[i], b[j - 1], b[j]);
      if (p) return { p, d: 0 };
    }
  }
  return { p: bp, d: Math.sqrt(best) };
}

function segIntersect(p1, p2, p3, p4) {
  const d = (p2[0] - p1[0]) * (p4[1] - p3[1]) - (p2[1] - p1[1]) * (p4[0] - p3[0]);
  if (Math.abs(d) < 1e-9) return null;
  const t = ((p3[0] - p1[0]) * (p4[1] - p3[1]) - (p3[1] - p1[1]) * (p4[0] - p3[0])) / d;
  const u = ((p3[0] - p1[0]) * (p2[1] - p1[1]) - (p3[1] - p1[1]) * (p2[0] - p1[0])) / d;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return [p1[0] + (p2[0] - p1[0]) * t, p1[1] + (p2[1] - p1[1]) * t];
}

/** Distance along a path of the point nearest to (x, z). */
function project(path, x, z) {
  let best = Infinity;
  let bs = 0;
  const { pts, cum } = path;
  for (let i = 1; i < pts.length; i++) {
    const r = closestOnSegment(x, z, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
    if (r[3] < best) {
      best = r[3];
      bs = cum[i - 1] + (cum[i] - cum[i - 1]) * r[2];
    }
  }
  return { s: bs, d: Math.sqrt(best) };
}

/** Keep the parts of a polyline inside a box (split where it leaves). */
function clipToBox(pts, box) {
  const inside = ([x, z]) => x >= box.x0 && x <= box.x1 && z >= box.z0 && z <= box.z1;
  const out = [];
  let cur = [];
  const dense = resample(pts, 5);
  for (const p of dense) {
    if (inside(p)) cur.push(p);
    else if (cur.length) {
      out.push(cur);
      cur = [];
    }
  }
  if (cur.length) out.push(cur);
  return out.filter((c) => c.length >= 2);
}

export function buildCity(data, def, shared, { low = false, radius = 620 } = {}) {
  const center = data.center ?? def.ll;
  const M = parseOSM(data, center);
  const a = Math.abs(M.angle);
  // the fetched square turns with the grid; keep to the part that's fully covered
  const R = radius / (Math.cos(a) + Math.sin(a));
  const box = { x0: -R, x1: R, z0: -R, z1: R };
  const res = low ? 0.8 : 0.5;
  const mask = new GroundMask({ x0: box.x0 - 4, x1: box.x1 + 4, z0: box.z0 - 4, z1: box.z1 + 4 }, res);
  const status = [];

  // ---------- rasters: streets, water, grass, shopping streets
  const commercialNames = new Set([
    ...(def.commercialNS ?? []).map((i) => normName(def.nsRoads[i])),
    ...(def.commercialEW ?? []).map((j) => normName(def.ewRoads[j])),
  ]);
  const drivable = M.roads.filter((r) => !r.bridge && r.hw !== 'pedestrian');
  let ctx = mask.begin();
  for (const r of drivable) mask.stroke(r.pts, r.width);
  const road = mask.read();

  ctx = mask.begin();
  for (const w of M.water) mask.fill(w.pts);
  const water = mask.read();
  if (M.coast.length) {
    ctx = mask.begin();
    ctx.lineCap = 'butt';
    for (const c of M.coast) mask.stroke(c, res * 2.2);
    const wall = mask.read();
    const seeds = [];
    for (const c of M.coast) {
      for (let i = 1; i < c.length; i++) {
        const dx = c[i][0] - c[i - 1][0];
        const dz = c[i][1] - c[i - 1][1];
        const l = Math.hypot(dx, dz) || 1;
        // OSM coastlines keep the land on the left, so the water is on the right
        const mx = (c[i][0] + c[i - 1][0]) / 2 + (-dz / l) * res * 4;
        const mz = (c[i][1] + c[i - 1][1]) / 2 + (dx / l) * res * 4;
        const k = mask.index(mx, mz);
        if (k >= 0 && !road[k]) seeds.push(k);
      }
    }
    const before = water.slice();
    if (!mask.flood(seeds, wall, water, mask.w * mask.h * 0.55)) water.set(before);
    else for (let i = 0; i < water.length; i++) if (wall[i] && !road[i]) water[i] = 255;
  }

  ctx = mask.begin();
  for (const p of M.parks) mask.fill(p.pts);
  ctx.globalCompositeOperation = 'destination-out';
  for (const p of M.paths) mask.stroke(p.pts, p.width);
  ctx.globalCompositeOperation = 'source-over';
  const grass = mask.read();

  ctx = mask.begin();
  for (const r of drivable) if (r.rank >= 2 || commercialNames.has(r.norm)) mask.stroke(r.pts, r.width + 1);
  const shopping = mask.read();
  mask.canvas.width = mask.canvas.height = 1; // free the big canvas

  const at = (arr, x, z) => {
    const k = mask.index(x, z);
    return k < 0 ? 0 : arr[k];
  };
  const isRoad = (x, z) => at(road, x, z) > 127;
  const isWater = (x, z) => at(water, x, z) > 127 && !isRoad(x, z);
  const inBox = (x, z, m = 0) => x > box.x0 + m && x < box.x1 - m && z > box.z0 + m && z < box.z1 - m;

  // ---------- ground: sidewalks with curbs, grass, water
  const group = new THREE.Group();
  const groundPolys = tracePolygons(
    mask,
    (i) => 1 - Math.max(road[i], water[i]) / 255,
    (x, z) => !isRoad(x, z) && !isWater(x, z),
    res * 0.45,
  );
  const sidewalkMat = new THREE.MeshStandardMaterial({ map: makeSidewalk(), color: 0x9a9aa0, roughness: 0.55, metalness: 0.05 });
  group.add(new THREE.Mesh(flatPolygons(groundPolys, CURB, 3), sidewalkMat));
  group.add(new THREE.Mesh(curbWalls(groundPolys, CURB, -0.4), new THREE.MeshStandardMaterial({ color: 0x8b8b8e, roughness: 0.8, side: THREE.DoubleSide })));
  const grassPolys = tracePolygons(
    mask,
    (i) => Math.min(grass[i], 255 - road[i], 255 - water[i]) / 255,
    (x, z) => at(grass, x, z) > 127 && !isRoad(x, z),
    res * 0.6,
  );
  if (grassPolys.length) {
    group.add(new THREE.Mesh(flatPolygons(grassPolys, CURB + 0.025, 4), new THREE.MeshStandardMaterial({ color: 0x5f7f3c, roughness: 1 })));
  }
  const waterPolys = tracePolygons(
    mask,
    (i) => Math.min(water[i], 255 - road[i]) / 255,
    (x, z) => isWater(x, z),
    res * 0.6,
  );
  if (waterPolys.length) {
    const wm = new THREE.MeshStandardMaterial({ color: 0x1f3c4c, roughness: 0.25, metalness: 0.2 });
    group.add(new THREE.Mesh(flatPolygons(waterPolys, 0.04, 8), wm));
  }
  const groundAt = (x, z) => (isRoad(x, z) ? 0 : CURB);
  // beyond the edge: plain pavement under the far buildings
  {
    const E = 700;
    const ring = [
      [box.x0 - E, box.x1 + E, box.z0 - E, box.z0 - 3.5],
      [box.x0 - E, box.x1 + E, box.z1 + 3.5, box.z1 + E],
      [box.x0 - E, box.x0 - 3.5, box.z0 - 3.5, box.z1 + 3.5],
      [box.x1 + 3.5, box.x1 + E, box.z0 - 3.5, box.z1 + 3.5],
    ].map(([x0, x1, z0, z1]) => {
      const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
      g.rotateX(-Math.PI / 2);
      g.translate((x0 + x1) / 2, CURB - 0.01, (z0 + z1) / 2);
      const uv = g.attributes.uv;
      const pos = g.attributes.position;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / 3, pos.getZ(i) / 3);
      return g;
    });
    group.add(new THREE.Mesh(mergeGeometries(ring), sidewalkMat));
  }

  // ---------- buildings
  const lots = [];
  const colliders = [];
  const roofs = [];
  for (const b of M.buildings) {
    const bb = bounds(b.pts);
    const cx = (bb.x0 + bb.x1) / 2;
    const cz = (bb.z0 + bb.z1) / 2;
    const outer = !inBox(cx, cz, 2);
    // just past the edge: keep the real skyline, as plain shells you can't reach
    if (outer && !inBox(cx, cz, -380)) continue;
    const pts = b.pts.length > 12 ? simplifyRing(b.pts, 0.25) : b.pts;
    if (pts.length < 3) continue;
    const r = b.rand;
    const type = b.type ?? 'yes';
    let floors;
    let h = b.h;
    if (h > 2) floors = Math.max(1, Math.round((h - 0.6) / FLOOR_H));
    else {
      if (/^(garage|garages|shed|hut|kiosk|carport)$/.test(type)) floors = 1;
      else if (HOUSE_TYPES.test(type) && type !== 'residential') floors = r < 0.25 ? 1 : r < 0.85 ? 2 : 3;
      else if (/^(apartments|residential|dormitory)$/.test(type)) floors = b.area < 200 ? 3 : b.area < 700 ? 4 + Math.floor(r * 3) : 5 + Math.floor(r * 3);
      else if (/^(commercial|retail|supermarket)$/.test(type)) floors = r < 0.6 ? 1 : 2;
      else if (/^(industrial|warehouse|manufacture)$/.test(type)) floors = 2;
      else if (/^(office|hotel)$/.test(type)) floors = 6 + Math.floor(r * 8);
      else if (/^(school|church|hospital|civic|public|university)$/.test(type)) floors = 3 + Math.floor(r * 2);
      else floors = b.area < 110 ? 2 : b.area < 260 ? (r < 0.6 ? 2 : 3) : b.area < 900 ? 3 + Math.floor(r * 3) : 3 + Math.floor(r * 4);
      h = floors * FLOOR_H + 0.6;
    }
    let kind;
    let style;
    let tint = '#ffffff';
    const r2 = hash01(b.id, 7);
    if (floors === 1 && /^(garage|garages|shed|hut|kiosk|carport)$/.test(type)) {
      kind = 'shed';
      style = 'brick';
      tint = pickBy(BRICK_TINTS, r2);
    } else if (h > 38 || /^(office|hotel)$/.test(type) && floors > 6) {
      kind = 'condo';
      style = r2 < 0.5 ? 'glass' : 'office';
    } else if (floors <= 2 && b.area < 220 && (HOUSE_TYPES.test(type) || type === 'yes')) {
      kind = b.shop ? 'mixed' : type === 'yes' || type === 'terrace' ? 'row' : 'house';
      style = pickBy(['siding', 'siding', 'brick', 'brick', 'stone'], r2);
      tint = style === 'siding' ? pickBy(SIDING_TINTS, hash01(b.id, 8)) : pickBy(BRICK_TINTS, hash01(b.id, 8));
    } else if (/^(commercial|retail|supermarket)$/.test(type) || b.shop) {
      kind = 'mixed';
      style = pickBy(['brick', 'stone', 'siding', 'deco'], r2);
      tint = style === 'siding' ? pickBy(SIDING_TINTS, hash01(b.id, 8)) : pickBy(BRICK_TINTS, hash01(b.id, 8));
    } else if (/^(industrial|warehouse|manufacture)$/.test(type)) {
      kind = 'apt';
      style = 'brick';
      tint = pickBy(BRICK_TINTS, r2);
    } else {
      kind = 'apt';
      style = pickBy(['brick', 'brick', 'stone', 'deco'], r2);
      tint = pickBy(BRICK_TINTS, hash01(b.id, 8));
    }
    const lot = {
      poly: pts, holes: b.holes, h, minH: b.minH, style, tint, kind, rand: r, id: b.id, area: b.area, floors,
      x0: bb.x0, x1: bb.x1, z0: bb.z0, z1: bb.z1, outer, base: CURB,
    };
    if (outer) {
      lots.push(lot);
      continue;
    }
    // a pitched roof on small four-sided houses
    if (kind === 'house' && pts.length >= 4 && pts.length <= 6 && b.area < 260 && hash01(b.id, 9) < 0.75) {
      let best = 0;
      let ang = 0;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const q = pts[(i + 1) % pts.length];
        const l = Math.hypot(q[0] - p[0], q[1] - p[1]);
        if (l > best) {
          best = l;
          ang = Math.atan2(q[1] - p[1], q[0] - p[0]);
        }
      }
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      let u0 = Infinity;
      let u1 = -Infinity;
      let v0 = Infinity;
      let v1 = -Infinity;
      for (const [x, z] of pts) {
        const u = x * c + z * s;
        const v = -x * s + z * c;
        u0 = Math.min(u0, u);
        u1 = Math.max(u1, u);
        v0 = Math.min(v0, v);
        v1 = Math.max(v1, v);
      }
      const um = (u0 + u1) / 2;
      const vm = (v0 + v1) / 2;
      lot.gable = { cx: um * c - vm * s, cz: um * s + vm * c, len: u1 - u0, wid: v1 - v0, ang };
    }
    lots.push(lot);
    if (!b.minH) colliders.push({ poly: pts, x0: bb.x0, x1: bb.x1, z0: bb.z0, z1: bb.z1 });
    if (!lot.gable && !b.minH) roofs.push({ poly: pts, x0: bb.x0, x1: bb.x1, z0: bb.z0, z1: bb.z1, top: CURB + h + 0.3 });
  }

  // ---------- street faces: storefronts where a facade looks onto a shopping street
  const poiBuckets = new Buckets(20);
  for (const p of M.pois) poiBuckets.add(p.p[0], p.p[1], p.p[0], p.p[1], p);
  const faces = [];
  const signNames = [];
  const signSeen = new Set();
  for (const lot of lots) {
    if (lot.kind === 'shed' || lot.outer) continue;
    const pts = lot.poly;
    const normals = ringNormals(pts);
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const q = pts[(i + 1) % pts.length];
      const w = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (w < 3.5) continue;
      const [nx, nz] = normals[i];
      const mx = (p[0] + q[0]) / 2;
      const mz = (p[1] + q[1]) / 2;
      let hit = 0;
      for (let d = 1; d <= 14; d += 1) {
        if (isRoad(mx + nx * d, mz + nz * d)) {
          hit = d;
          break;
        }
      }
      if (!hit) continue;
      const commercial = at(shopping, mx + nx * hit, mz + nz * hit) > 127;
      const names = [];
      for (const poi of poiBuckets.near(mx, mz, 16)) {
        if (Math.hypot(poi.p[0] - mx, poi.p[1] - mz) < Math.max(12, w / 2 + 4)) names.push(poi.name);
      }
      const shop = lot.kind !== 'house' && lot.floors <= 7 && hit <= 10 && (lot.kind === 'mixed' ? commercial || names.length > 0 : (commercial && hash01(lot.id, i) < 0.8) || names.length > 0);
      if (shop && lot.kind === 'apt') lot.kind = 'mixed';
      for (const n of names) {
        if (!signSeen.has(n) && signNames.length < 40) {
          signSeen.add(n);
          signNames.push(n.toUpperCase().slice(0, 22));
        }
      }
      faces.push({ x: mx, z: mz, nx, nz, w, lot, shop, names: names.map((n) => n.toUpperCase().slice(0, 22)) });
    }
  }

  // ---------- chains of streets: traffic, lamps, parked cars, names
  const streets = M.roads.filter((r) => r.street && !r.bridge);
  const chains = chainRoads(streets);
  // junctions: nodes where 3+ street edges meet
  const degree = new Map();
  for (const r of streets) {
    for (let i = 0; i < r.nodes.length; i++) {
      const id = r.nodes[i];
      let set = degree.get(id);
      if (!set) degree.set(id, (set = new Set()));
      if (i > 0) set.add(r.nodes[i - 1]);
      if (i < r.nodes.length - 1) set.add(r.nodes[i + 1]);
    }
  }
  const junctions = [];
  for (const [id, set] of degree) {
    if (set.size < 3) continue;
    const p = M.nodePos.get(id);
    if (p && inBox(p[0], p[1], -20)) junctions.push({ id, p, names: new Set() });
  }
  const juncById = new Map(junctions.map((j) => [j.id, j]));
  const juncBuckets = new Buckets(30);
  for (const j of junctions) juncBuckets.add(j.p[0], j.p[1], j.p[0], j.p[1], j);
  const nearJunction = (x, z, r) => {
    for (const j of juncBuckets.near(x, z, r)) if (Math.hypot(j.p[0] - x, j.p[1] - z) < r) return j;
    return null;
  };
  const segBuckets = new Buckets(25);
  for (const c of chains) {
    for (let i = 1; i < c.pts.length; i++) {
      const p = c.pts[i - 1];
      const q = c.pts[i];
      segBuckets.add(p[0], p[1], q[0], q[1], { c, p, q });
    }
    if (!c.name) continue;
    for (const id of c.nodes) {
      const set = degree.get(id);
      if (set && set.size >= 3) {
        const j = juncById.get(id);
        if (j) j.names.add(shortName(c.name));
      }
    }
  }
  const nearestStreet = (x, z, pad = 6) => {
    let best = null;
    let bd = Infinity;
    for (const s of segBuckets.near(x, z, 20)) {
      const r = closestOnSegment(x, z, s.p[0], s.p[1], s.q[0], s.q[1]);
      const d = Math.sqrt(r[3]) - s.c.width / 2;
      if (d < bd) {
        bd = d;
        best = s.c;
      }
    }
    return bd < pad ? best : null;
  };

  const colliderIndex = new Buckets(24);
  for (const c of colliders) colliderIndex.add(c.x0, c.z0, c.x1, c.z1, c);
  const inBuilding = (x, z, pad = 0) => {
    for (const c of colliderIndex.near(x, z, pad + 1)) {
      if (x < c.x0 - pad || x > c.x1 + pad || z < c.z0 - pad || z > c.z1 + pad) continue;
      if (pointInPoly(x, z, c.poly)) return true;
    }
    return false;
  };
  const walkable = (x, z) => inBox(x, z, 3) && !isRoad(x, z) && !isWater(x, z) && !inBuilding(x, z, 0.6);
  const spot = (x, z) => {
    if (walkable(x, z)) return [x, z];
    for (let r = 1; r <= 60; r += 1) {
      const n = Math.max(8, Math.round(r * 3));
      for (let k = 0; k < n; k++) {
        const a2 = (k / n) * Math.PI * 2;
        const px = x + Math.cos(a2) * r;
        const pz = z + Math.sin(a2) * r;
        if (walkable(px, pz)) return [px, pz];
      }
    }
    return [x, z];
  };

  // the el's street, found by name
  const elName = def.el ? normName(def.el.axis === 'ns' ? def.nsRoads[def.el.index] : def.ewRoads[def.el.index]) : '';
  const chainsNamed = (norm) => chains.filter((c) => c.norm === norm);
  const elChain = elName ? chainsNamed(elName).sort((p, q) => new Path(q.pts).len - new Path(p.pts).len)[0] : null;

  const lanes = [];
  const parked = [];
  const kitLamps = [];
  const trees = [];
  const signals = M.signals.filter((s) => inBox(s.p[0], s.p[1], -30));
  for (const c of chains) {
    const pieces = clipToBox(c.pts, { x0: box.x0 - 40, x1: box.x1 + 40, z0: box.z0 - 40, z1: box.z1 + 40 });
    const busy = c.rank >= 2 || commercialNames.has(c.norm);
    const underEl = elChain && c.norm === elChain.norm;
    for (const pts of pieces) {
      const path = new Path(pts);
      if (path.len < 40) continue;
      const half = c.width / 2;
      const crossingsFor = (lanePath) => {
        const out = [];
        for (const sg of signals) {
          const pr = project(lanePath, sg.p[0], sg.p[1]);
          if (pr.d > half + 4) continue;
          const f = lanePath.at(pr.s);
          out.push({ s: pr.s, axis: Math.abs(f[3]) > Math.abs(f[2]) ? 'ns' : 'ew', half: 6 });
        }
        return out.sort((p, q) => p.s - q.s);
      };
      const addLane = (lp) => {
        const lanePath = new Path(lp);
        lanes.push({ pts: lp, crossings: crossingsFor(lanePath), busy });
      };
      if (c.oneway === 1) addLane(offsetLine(pts, c.width * 0.12));
      else if (c.oneway === -1) addLane(offsetLine(pts.slice().reverse(), c.width * 0.12));
      else if (c.width >= 7) {
        addLane(offsetLine(pts, Math.min(3.4, c.width / 4)));
        addLane(offsetLine(pts.slice().reverse(), Math.min(3.4, c.width / 4)));
      }

      // walk the street every couple of meters for lamps, trees and parked cars
      const f = [0, 0, 0, 0];
      const phase = hash01(c.road.id, 1) * 30;
      for (let s = 4; s < path.len - 4; s += 2) {
        path.at(s, f);
        const [x, z, dx, dz] = f;
        if (!inBox(x, z, 2)) continue;
        const nearJ = nearJunction(x, z, half + 9);
        for (const side of [1, -1]) {
          // right-hand normal is (-dz, dx)
          const nx = -dz * side;
          const nz = dx * side;
          const lx = x + nx * (half + 0.8);
          const lz = z + nz * (half + 0.8);
          const lampSlot = Math.abs(((s + phase + (side > 0 ? 0 : 17)) % 34) - 0) < 2;
          if (lampSlot && !nearJ && !isRoad(lx, lz) && !isWater(lx, lz) && !inBuilding(lx, lz, 0.4) && c.hw !== 'motorway') {
            kitLamps.push({ x: lx, z: lz, nx: -nx, nz: -nz, kind: busy ? 'led' : 'sodium', underEl });
            continue;
          }
          const treeSlot = ((s + phase * 1.7 + (side > 0 ? 5 : 0)) % (busy ? 14 : 8)) < 2;
          if (treeSlot && !nearJ && !underEl && c.rank <= 2 && hash01(c.road.id + Math.round(s), side) < (busy ? 0.35 : 0.6)) {
            const tx = x + nx * (half + 1.5);
            const tz = z + nz * (half + 1.5);
            if (!isRoad(tx, tz) && !isWater(tx, tz) && !inBuilding(tx, tz, 1.2)) trees.push([tx, tz, 1.3 + hash01(Math.round(tx * 7), Math.round(tz * 3)) * 0.6]);
          }
          // parked cars along the curb on the quieter streets
          const carSlot = (s + phase) % 6.5 < 2;
          if (carSlot && !nearJ && !underEl && c.rank <= 3 && c.hw !== 'motorway' && c.width >= 8.5 && hash01(Math.round(s * 13) + c.road.id, side + 3) < 0.7) {
            const px = x + nx * (half - 1.1);
            const pz = z + nz * (half - 1.1);
            const curbSide = x + nx * (half + 1.2);
            const curbSideZ = z + nz * (half + 1.2);
            if (isRoad(px, pz) && !isRoad(curbSide, curbSideZ) && isRoad(x + nx * (half - 2.6), z + nz * (half - 2.6))) {
              parked.push({ x: px, z: pz, rot: Math.atan2(dx * side, dz * side) });
            }
          }
        }
      }
    }
  }
  // trees mapped in OSM (street tree census) replace the guesses when there are plenty
  const mappedTrees = M.trees.filter(([x, z]) => inBox(x, z, 2) && !isRoad(x, z) && !inBuilding(x, z, 0.8));
  if (mappedTrees.length > 150) {
    trees.length = 0;
    for (const [x, z] of mappedTrees) trees.push([x, z, 1.3 + hash01(Math.round(x * 7), Math.round(z * 3)) * 0.6]);
  }
  // park trees
  for (const g of grassPolys) {
    if (g.area < 1500) continue;
    const n = Math.min(160, Math.floor(g.area / 260));
    for (let k = 0; k < n; k++) {
      const x = g.box.x0 + hash01(k, Math.round(g.area)) * (g.box.x1 - g.box.x0);
      const z = g.box.z0 + hash01(k + 991, Math.round(g.area)) * (g.box.z1 - g.box.z0);
      if (pointInPoly(x, z, g.pts) && !isRoad(x, z) && !inBuilding(x, z, 1)) trees.push([x, z, 1.5 + hash01(k, 5) * 0.8]);
    }
  }
  if (trees.length > (low ? 1500 : 3500)) trees.length = low ? 1500 : 3500;
  if (parked.length > (low ? 500 : 1400)) parked.length = low ? 500 : 1400;

  // ---------- paint: center lines and crosswalks
  const white = [];
  const yellow = [];
  const strip = (x, z, along, across, ang) => {
    const g = new THREE.PlaneGeometry(across, along);
    g.rotateX(-Math.PI / 2);
    g.rotateY(ang);
    return g.translate(x, 0.02, z);
  };
  for (const c of chains) {
    if (c.oneway || c.width < 9.5) continue;
    for (const pts of clipToBox(c.pts, box)) {
      const path = new Path(pts);
      const f = [0, 0, 0, 0];
      for (let s = 0; s < path.len; s += 3) {
        path.at(s + 1.5, f);
        if (nearJunction(f[0], f[1], c.width / 2 + 8)) continue;
        const ang = Math.atan2(f[2], f[3]);
        for (const o of [-0.13, 0.13]) yellow.push(strip(f[0] - f[3] * o, f[1] + f[2] * o, 3.02, 0.12, ang));
      }
    }
  }
  const streetAt = new Map(); // junction id -> incident street directions
  for (const r of streets) {
    for (let i = 0; i < r.nodes.length; i++) {
      const id = r.nodes[i];
      const set = degree.get(id);
      if (!set || set.size < 3) continue;
      for (const k of [i - 1, i + 1]) {
        if (k < 0 || k >= r.nodes.length) continue;
        const p = r.pts[i];
        const q = r.pts[k];
        const l = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
        if (!streetAt.has(id)) streetAt.set(id, []);
        streetAt.get(id).push({ dx: (q[0] - p[0]) / l, dz: (q[1] - p[1]) / l, width: r.width, len: l, name: r.name ? shortName(r.name) : '' });
      }
    }
  }
  for (const j of junctions) {
    const arms = streetAt.get(j.id) ?? [];
    if (arms.length < 3) continue;
    for (const arm of arms) {
      const cross = Math.max(...arms.filter((o) => o !== arm).map((o) => o.width));
      const dist = cross / 2 + 2.2;
      if (arm.len < dist + 3) continue;
      const cx = j.p[0] + arm.dx * dist;
      const cz = j.p[1] + arm.dz * dist;
      const ang = Math.atan2(arm.dx, arm.dz);
      // right-hand normal of the arm direction
      const rx = -arm.dz;
      const rz = arm.dx;
      for (let o = -arm.width / 2 + 0.8; o < arm.width / 2 - 0.4; o += 1.2) {
        const x = cx + rx * o;
        const z = cz + rz * o;
        if (isRoad(x, z)) white.push(strip(x, z, 3, 0.6, ang));
      }
      // stop bar across the lanes heading into the junction (on the left of the outward arm)
      const bx = j.p[0] + arm.dx * (dist + 2.1) - rx * (arm.width / 4);
      const bz = j.p[1] + arm.dz * (dist + 2.1) - rz * (arm.width / 4);
      white.push(strip(bx, bz, 0.4, arm.width / 2 - 0.5, ang));
    }
  }
  const paint = (geos, color) => {
    if (!geos.length) return;
    group.add(new THREE.Mesh(mergeGeometries(geos), new THREE.MeshStandardMaterial({ color, roughness: 0.5, emissive: color, emissiveIntensity: 0.05 })));
  };
  paint(white, 0xd8d8d0);
  paint(yellow, 0xd9a91c);

  // ---------- corners: lights, stop signs, name blades
  const signalized = new Set();
  for (const j of junctions) {
    j.arms = streetAt.get(j.id) ?? [];
    for (const sg of signals) if (Math.hypot(sg.p[0] - j.p[0], sg.p[1] - j.p[1]) < 16) signalized.add(j.id);
  }
  const corners = buildCorners({
    junctions: junctions.filter((j) => inBox(j.p[0], j.p[1], 3)), signalized, isRoad, inBuilding, low,
    busy: (x, z) => at(shopping, x, z) > 127 || [...poiBuckets.near(x, z, 25)].length > 0,
  });
  group.add(corners.group);

  // ---------- crowds: loops around each block, a couple of meters in from the curb
  const routes = [];
  const blocks = loopsToPolygons(
    traceLoops(mask, (i) => 1 - Math.max(road[i], water[i]) / 255),
    (x, z) => !isRoad(x, z) && !isWater(x, z),
    res * 1.2,
  );
  for (const p of blocks) {
    if (p.area < 400 || p.area > 250000) continue;
    const ring = offsetRing(p.pts, -2.1);
    if (Math.abs(signedArea(ring)) < 100) continue;
    const path = new Path(ring, true);
    const busy = faces.some((f) => f.shop && f.x > p.box.x0 && f.x < p.box.x1 && f.z > p.box.z0 && f.z < p.box.z1 && pointInPoly(f.x, f.z, p.pts));
    routes.push({ path, busy });
  }

  // ---------- where things are
  const named = (norm) => chains.filter((c) => c.norm === norm && c.pts.length > 1);
  const meanCoord = (norm, axis) => {
    let sum = 0;
    let n = 0;
    for (const c of named(norm)) {
      for (const p of c.pts) {
        if (!inBox(p[0], p[1], -60)) continue;
        sum += p[axis];
        n++;
      }
    }
    return n ? sum / n : null;
  };
  const colCache = new Map();
  const rowCache = new Map();
  const colX = (i) => {
    if (!colCache.has(i)) {
      const name = def.nsRoads[i];
      const v = name ? meanCoord(normName(name), 0) : null;
      colCache.set(i, v ?? box.x0 + ((i + 1) / (def.nsRoads.length + 1)) * (box.x1 - box.x0));
    }
    return colCache.get(i);
  };
  const rowZ = (j) => {
    if (!rowCache.has(j)) {
      const name = def.ewRoads[j];
      const v = name ? meanCoord(normName(name), 1) : null;
      rowCache.set(j, v ?? box.z0 + ((j + 1) / (def.ewRoads.length + 1)) * (box.z1 - box.z0));
    }
    return rowCache.get(j);
  };
  const crossing = (nameA, nameB) => {
    let best = null;
    for (const a2 of named(normName(nameA))) {
      for (const b2 of named(normName(nameB))) {
        const r = closestApproach(a2.pts, b2.pts);
        if (r.p && (!best || r.d < best.d)) best = r;
      }
    }
    return best && best.d < 30 ? best.p : null;
  };
  /** Run a district's grid-based placement (corner of street i and avenue j...) against the real map. */
  const resolve = (fn) => {
    const calls = { i: null, j: null };
    const proxy = Object.create(D);
    Object.assign(proxy, {
      colX: (i) => ((calls.i = i), colX(i)),
      rowZ: (j) => ((calls.j = j), rowZ(j)),
      riverX: box.x0 + 20,
      parkZ1: box.z0 + 80,
      parkZ0: box.z0,
    });
    const out = fn(proxy);
    let dx = 0;
    let dz = 0;
    if (calls.i !== null && calls.j !== null && def.nsRoads[calls.i] && def.ewRoads[calls.j]) {
      const p = crossing(def.nsRoads[calls.i], def.ewRoads[calls.j]);
      if (p) {
        dx = p[0] - colX(calls.i);
        dz = p[1] - rowZ(calls.j);
      }
    }
    return { out, dx, dz };
  };
  const place = (whereFn) => {
    const { out, dx, dz } = resolve(whereFn);
    return spot(out[0] + dx, out[1] + dz);
  };
  const start = () => {
    const { out, dx, dz } = resolve(def.start);
    const [x, z] = spot(out.pos[0] + dx, out.pos[1] + dz);
    const look = out.look ? [out.look[0] + dx, out.look[1], out.look[2] + dz] : [x, 1.7, z - 10];
    return { pos: [x, z], look };
  };

  // ---------- the el
  let elevated = null;
  if (def.el && elChain) {
    const line = clipToBox(elChain.pts, { x0: box.x0 - 250, x1: box.x1 + 250, z0: box.z0 - 250, z1: box.z1 + 250 }).sort((p, q) => q.length - p.length)[0];
    if (line) {
      const tmpPath = new Path(resample(line, 2));
      const stations = [];
      for (const st of def.el.stations) {
        const cross = def.el.axis === 'ns' ? def.ewRoads[st.at] : def.nsRoads[st.at];
        const p = cross ? crossing(def.el.axis === 'ns' ? def.nsRoads[def.el.index] : def.ewRoads[def.el.index], cross) : null;
        if (!p) continue;
        const pr = project(tmpPath, p[0], p[1]);
        if (pr.d < 25) stations.push({ s: pr.s, name: st.name });
      }
      const crossings = [];
      for (const id of elChain.nodes) {
        const set = degree.get(id);
        const pos = M.nodePos.get(id);
        if (!set || set.size < 3 || !pos) continue;
        const pr = project(tmpPath, pos[0], pos[1]);
        if (pr.d < 6) crossings.push(pr.s);
      }
      if (stations.length) {
        elevated = { line, stations, crossings, streetW: elChain.width };
      }
    }
  }

  // ---------- minimap picture
  const MAP_RES = 1;
  const mapCanvas = document.createElement('canvas');
  mapCanvas.width = Math.ceil((box.x1 - box.x0) / MAP_RES);
  mapCanvas.height = Math.ceil((box.z1 - box.z0) / MAP_RES);
  const mc = mapCanvas.getContext('2d');
  mc.fillStyle = '#2f3a47';
  mc.fillRect(0, 0, mapCanvas.width, mapCanvas.height);
  mc.setTransform(1 / MAP_RES, 0, 0, 1 / MAP_RES, -box.x0 / MAP_RES, -box.z0 / MAP_RES);
  const fillPoly = (pts, holes = []) => {
    mc.beginPath();
    for (const ring of [pts, ...holes]) {
      mc.moveTo(ring[0][0], ring[0][1]);
      for (let i = 1; i < ring.length; i++) mc.lineTo(ring[i][0], ring[i][1]);
      mc.closePath();
    }
    mc.fill('evenodd');
  };
  mc.fillStyle = '#c9d4de';
  for (const p of groundPolys) fillPoly(p.pts, p.holes);
  mc.fillStyle = '#7aa870';
  for (const p of grassPolys) fillPoly(p.pts, p.holes);
  mc.fillStyle = '#4f86b8';
  for (const p of waterPolys) fillPoly(p.pts, p.holes);
  mc.fillStyle = '#a9bdd0';
  for (const l of lots) if (!l.outer) fillPoly(l.poly);
  if (elevated) {
    mc.strokeStyle = '#9b7fd1';
    mc.lineWidth = 3;
    mc.setLineDash(def.el.underground ? [10, 8] : []);
    mc.beginPath();
    mc.moveTo(elevated.line[0][0], elevated.line[0][1]);
    for (const p of elevated.line) mc.lineTo(p[0], p[1]);
    mc.stroke();
  }
  const mapImage = { canvas: mapCanvas, x0: box.x0, z0: box.z0, w: box.x1 - box.x0, h: box.z1 - box.z0 };

  // ---------- names for the HUD
  const parksNamed = M.parks.filter((p) => p.name && p.area > 800);
  const describe = (x, z, opts = {}) => {
    const j = nearJunction(x, z, 16);
    if (j && j.names.size >= 2) {
      const [n1, n2] = [...j.names];
      return `${n1} & ${n2}`;
    }
    const s = nearestStreet(x, z, 7);
    if (s?.name) {
      const t = shortName(s.name);
      return opts.roof ? `Rooftop over ${t}` : t;
    }
    for (const p of parksNamed) if (pointInPoly(x, z, p.pts)) return p.name;
    if (isWater(x, z)) return 'The waterfront';
    return def.name;
  };

  // ---------- station entrances when the el couldn't be placed: the mapped subway stairs
  const looseEntrances = [];
  const stationName = (x, z) => {
    let best = null;
    let bd = 400;
    for (const st of M.stations) {
      const d = Math.hypot(st.p[0] - x, st.p[1] - z);
      if (d < bd) {
        bd = d;
        best = st.name;
      }
    }
    return best;
  };
  for (const e of M.entrances) {
    if (!inBox(e.p[0], e.p[1], 10) || looseEntrances.length >= 12) continue;
    const [x, z] = spot(e.p[0], e.p[1]);
    looseEntrances.push({ x, z, name: stationName(x, z) ?? e.name ?? def.name });
  }
  if (!looseEntrances.length) {
    for (const st of M.stations) {
      if (!inBox(st.p[0], st.p[1], 10) || looseEntrances.length >= 6) continue;
      const [x, z] = spot(st.p[0], st.p[1]);
      looseEntrances.push({ x, z, name: st.name });
    }
  }

  // ---------- Manhattan on the horizon, in its real direction
  const midtown = M.proj.toWorld(40.754, -73.984);
  const toMid = Math.hypot(midtown[0], midtown[1]);

  return {
    M, box, group, mask, groundAt, isRoad, isWater, walkable, spot, inBuilding,
    lots, faces, signNames, colliders: [...colliders, ...corners.colliders], roofs, corners, lanes, parked, routes, trees, kitLamps,
    elevated, looseEntrances, mapImage, describe, place, start, midtown: toMid > 1200 ? midtown : null,
    counts: { buildings: lots.length, streets: chains.length, trees: trees.length, lanes: lanes.length, blocks: groundPolys.length },
  };
}
