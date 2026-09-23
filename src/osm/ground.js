// Rasterizes streets, water and grass into masks, then traces smooth curb lines out of them
// (marching squares), so real intersections, medians and odd corners all come out right.
import * as THREE from 'three';
import { CURB } from '../config.js';
import { signedArea, simplifyRing, pointInPoly, bounds } from './geo.js';

export class GroundMask {
  constructor(box, res) {
    this.res = res;
    this.x0 = box.x0;
    this.z0 = box.z0;
    this.w = Math.ceil((box.x1 - box.x0) / res) + 1;
    this.h = Math.ceil((box.z1 - box.z0) / res) + 1;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.w;
    this.canvas.height = this.h;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
  }

  begin() {
    const { ctx } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.setTransform(1 / this.res, 0, 0, 1 / this.res, -this.x0 / this.res, -this.z0 / this.res);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#fff';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    return ctx;
  }

  /** Current canvas as one byte per pixel. */
  read() {
    const d = this.ctx.getImageData(0, 0, this.w, this.h).data;
    const out = new Uint8Array(this.w * this.h);
    for (let i = 0; i < out.length; i++) out[i] = d[i * 4];
    return out;
  }

  stroke(pts, width) {
    const { ctx } = this;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
  }

  fill(pts) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fill();
  }

  index(x, z) {
    const i = Math.round((x - this.x0) / this.res);
    const j = Math.round((z - this.z0) / this.res);
    if (i < 0 || j < 0 || i >= this.w || j >= this.h) return -1;
    return j * this.w + i;
  }

  /** Flood fill `into` from seed pixels, stopped by `wall` (both one byte per pixel). */
  flood(seeds, wall, into, limit) {
    const { w, h } = this;
    const stack = [];
    let count = 0;
    for (const s of seeds) if (s >= 0 && !wall[s] && !into[s]) stack.push(s);
    while (stack.length) {
      const k = stack.pop();
      if (into[k] || wall[k]) continue;
      into[k] = 255;
      if (++count > limit) return false;
      const x = k % w;
      if (x > 0) stack.push(k - 1);
      if (x < w - 1) stack.push(k + 1);
      if (k >= w) stack.push(k - w);
      if (k < w * (h - 1)) stack.push(k + w);
    }
    return true;
  }
}

/**
 * Iso-contours (at 0.5) of a field where `inside(i)` is true, traced into closed loops of
 * world-space points. The border counts as outside so every loop closes.
 */
export function traceLoops(mask, value, rect = null) {
  const { res } = mask;
  const i0 = rect ? rect.i0 : 0;
  const j0 = rect ? rect.j0 : 0;
  const w = rect ? rect.i1 - rect.i0 + 1 : mask.w;
  const h = rect ? rect.j1 - rect.j0 + 1 : mask.h;
  const x0 = mask.x0 + i0 * res;
  const z0 = mask.z0 + j0 * res;
  // padded grid of corner values in 0..1 (1 = inside)
  const W = w + 2;
  const H = h + 2;
  const f = new Float32Array(W * H);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) f[(j + 1) * W + i + 1] = value((j + j0) * mask.w + i + i0);
  const hId = (i, j) => (j * W + i) * 2;
  const vId = (i, j) => (j * W + i) * 2 + 1;
  const adj = new Map();
  const link = (a, b) => {
    let la = adj.get(a);
    if (!la) adj.set(a, (la = []));
    la.push(b);
    let lb = adj.get(b);
    if (!lb) adj.set(b, (lb = []));
    lb.push(a);
  };
  for (let j = 0; j < H - 1; j++) {
    for (let i = 0; i < W - 1; i++) {
      const a = f[j * W + i];
      const b = f[j * W + i + 1];
      const c = f[(j + 1) * W + i + 1];
      const d = f[(j + 1) * W + i];
      const code = (a >= 0.5 ? 1 : 0) | (b >= 0.5 ? 2 : 0) | (c >= 0.5 ? 4 : 0) | (d >= 0.5 ? 8 : 0);
      if (code === 0 || code === 15) continue;
      const e0 = hId(i, j);
      const e1 = vId(i + 1, j);
      const e2 = hId(i, j + 1);
      const e3 = vId(i, j);
      const center = (a + b + c + d) / 4 >= 0.5;
      switch (code) {
        case 1: case 14: link(e3, e0); break;
        case 2: case 13: link(e0, e1); break;
        case 3: case 12: link(e3, e1); break;
        case 4: case 11: link(e1, e2); break;
        case 6: case 9: link(e0, e2); break;
        case 7: case 8: link(e3, e2); break;
        case 5:
          if (center) { link(e0, e1); link(e2, e3); } else { link(e3, e0); link(e1, e2); }
          break;
        case 10:
          if (center) { link(e3, e0); link(e1, e2); } else { link(e0, e1); link(e2, e3); }
          break;
      }
    }
  }
  const point = (id) => {
    const k = id >> 1;
    const i = k % W;
    const j = (k - i) / W;
    const va = f[k];
    let t;
    let pi = i;
    let pj = j;
    if (id & 1) {
      const vb = f[k + W];
      t = (0.5 - va) / (vb - va || 1e-6);
      pj = j + t;
    } else {
      const vb = f[k + 1];
      t = (0.5 - va) / (vb - va || 1e-6);
      pi = i + t;
    }
    // back to world (undo the one-pixel pad)
    return [x0 + (pi - 1) * res, z0 + (pj - 1) * res];
  };
  const seen = new Set();
  const loops = [];
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    const loop = [];
    let prev = -1;
    let cur = start;
    let guard = 0;
    while (guard++ < 2e6) {
      seen.add(cur);
      loop.push(point(cur));
      const nb = adj.get(cur);
      let next = nb[0] !== prev ? nb[0] : nb[1];
      if (nb.length > 2) {
        // a pixel-touching knot: take any unvisited way out
        next = nb.find((n) => n !== prev && !seen.has(n)) ?? start;
      }
      if (next === undefined || next === start) break;
      if (seen.has(next)) break;
      prev = cur;
      cur = next;
    }
    if (loop.length >= 4) loops.push(loop);
  }
  return loops;
}

/**
 * Trace in tiles that overlap by one sample, so each polygon stays small enough to
 * triangulate reliably; the overlap hides the seams (and the curb walls along them).
 */
export function tracePolygons(mask, value, isInside, tol, tile = 256) {
  const out = [];
  for (let j0 = 0; j0 < mask.h - 1; j0 += tile) {
    for (let i0 = 0; i0 < mask.w - 1; i0 += tile) {
      const rect = { i0, j0, i1: Math.min(mask.w - 1, i0 + tile), j1: Math.min(mask.h - 1, j0 + tile) };
      out.push(...loopsToPolygons(traceLoops(mask, value, rect), isInside, tol));
    }
  }
  return out;
}

/**
 * Loops -> polygons with holes. A loop is an outer boundary when the inside region lies
 * inside it; holes go to the smallest outer that contains them.
 */
export function loopsToPolygons(loops, isInside, tol) {
  const outers = [];
  const holes = [];
  for (const raw of loops) {
    const pts = simplifyRing(raw, tol);
    if (pts.length < 3) continue;
    const area = signedArea(pts);
    if (Math.abs(area) < 2) continue;
    // step a little into the polygon from the middle of its longest edge and look
    let best = 0;
    let bi = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (l > best) {
        best = l;
        bi = i;
      }
    }
    const a = pts[bi];
    const b = pts[(bi + 1) % pts.length];
    const mx = (a[0] + b[0]) / 2;
    const mz = (a[1] + b[1]) / 2;
    const nx = -(b[1] - a[1]) / best;
    const nz = (b[0] - a[0]) / best;
    const probe = pointInPoly(mx + nx * 0.3, mz + nz * 0.3, pts) ? [mx + nx * 0.6, mz + nz * 0.6] : [mx - nx * 0.6, mz - nz * 0.6];
    const poly = { pts, area: Math.abs(area), holes: [], box: bounds(pts) };
    if (isInside(probe[0], probe[1])) outers.push(poly);
    else holes.push(poly);
  }
  outers.sort((p, q) => p.area - q.area);
  for (const hole of holes) {
    const [hx, hz] = hole.pts[0];
    const owner = outers.find((o) => o.area > hole.area && hx >= o.box.x0 && hx <= o.box.x1 && hz >= o.box.z0 && hz <= o.box.z1 && pointInPoly(hx, hz, o.pts));
    if (owner) owner.holes.push(hole.pts);
  }
  return outers;
}

/** Flat triangulated polygons at height y, UVs in world meters / uvScale. */
export function flatPolygons(polys, y, uvScale = 3) {
  const pos = [];
  const uv = [];
  for (const p of polys) {
    const contour = p.pts.map(([x, z]) => new THREE.Vector2(x, z));
    const holes = p.holes.map((h) => h.map(([x, z]) => new THREE.Vector2(x, z)));
    let tris;
    try {
      tris = THREE.ShapeUtils.triangulateShape(contour, holes);
    } catch {
      continue;
    }
    const all = [...contour, ...holes.flat()];
    for (const t of tris) {
      // counter-clockwise from above: +y normal
      const [a, b, c] = t.map((k) => all[k]);
      const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      const order = cross > 0 ? [a, c, b] : [a, b, c];
      for (const v of order) {
        pos.push(v.x, y, v.y);
        uv.push(v.x / uvScale, v.y / uvScale);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** Vertical curb faces along polygon outlines, facing out of the raised area. */
export function curbWalls(polys, top, bottom) {
  const pos = [];
  const uv = [];
  const ring = (pts, outward) => {
    const n = pts.length;
    const cw = signedArea(pts) > 0;
    for (let i = 0; i < n; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % n];
      // keep the face pointing away from the raised side
      const flip = cw !== outward;
      const [p, q] = flip ? [b, a] : [a, b];
      const l = Math.hypot(q[0] - p[0], q[1] - p[1]);
      pos.push(p[0], top, p[1], p[0], bottom, p[1], q[0], bottom, q[1]);
      pos.push(p[0], top, p[1], q[0], bottom, q[1], q[0], top, q[1]);
      uv.push(0, 1, 0, 0, l / 3, 0, 0, 1, l / 3, 0, l / 3, 1);
    }
  };
  for (const p of polys) {
    ring(p.pts, true);
    for (const h of p.holes) ring(h, false);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

export { CURB };
