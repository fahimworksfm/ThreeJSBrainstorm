// Small 2D geometry helpers for the real-map mode. Points are [x, z] arrays in meters.

/** Equirectangular projection around a center, rotated so the local street grid lines up with the axes. */
export function makeProjection(lat0, lon0) {
  const kx = Math.cos((lat0 * Math.PI) / 180) * 111320;
  const kz = 110540;
  const proj = {
    center: [lat0, lon0],
    angle: 0,
    cos: 1,
    sin: 0,
    /** lat/lon -> world [x, z]: +x east, -z north (before the grid rotation). */
    raw(lat, lon) {
      return [(lon - lon0) * kx, -(lat - lat0) * kz];
    },
    rotate([x, z]) {
      return [x * proj.cos - z * proj.sin, x * proj.sin + z * proj.cos];
    },
    unrotate([x, z]) {
      return [x * proj.cos + z * proj.sin, -x * proj.sin + z * proj.cos];
    },
    toWorld(lat, lon) {
      return proj.rotate(proj.raw(lat, lon));
    },
    setAngle(a) {
      proj.angle = a;
      proj.cos = Math.cos(a);
      proj.sin = Math.sin(a);
    },
  };
  return proj;
}

/** Dominant street direction (mod 90 degrees), weighted by segment length. */
export function dominantAngle(lines) {
  let c = 0;
  let s = 0;
  for (const pts of lines) {
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i][0] - pts[i - 1][0];
      const dz = pts[i][1] - pts[i - 1][1];
      const len = Math.hypot(dx, dz);
      const a = Math.atan2(dz, dx) * 4;
      c += Math.cos(a) * len;
      s += Math.sin(a) * len;
    }
  }
  if (Math.hypot(c, s) < 1e-6) return 0;
  return Math.atan2(s, c) / 4;
}

const ABBREV = [
  [/\bstreet\b/g, 'st'], [/\bavenue\b/g, 'ave'], [/\bboulevard\b/g, 'blvd'], [/\broad\b/g, 'rd'],
  [/\bplace\b/g, 'pl'], [/\bdrive\b/g, 'dr'], [/\bparkway\b/g, 'pkwy'], [/\blane\b/g, 'ln'],
  [/\bterrace\b/g, 'ter'], [/\bcourt\b/g, 'ct'], [/\bexpressway\b/g, 'expy'], [/\bhighway\b/g, 'hwy'],
  [/\bnorth\b/g, 'n'], [/\bsouth\b/g, 's'], [/\beast\b/g, 'e'], [/\bwest\b/g, 'w'], [/\bsaint\b/g, 'st'],
];

// names New Yorkers use vs. what's on the map
const ALIASES = {
  'ave of the americas': '6th ave',
  'adam clayton powell jr blvd': '7th ave',
  'frederick douglass blvd': '8th ave',
  'malcolm x blvd': 'lenox ave',
  'continental ave': '71st ave',
};

/** "31st Street" and "31st St" both become "31st st". */
export function normName(name) {
  if (!name) return '';
  let n = name.toLowerCase().replace(/[.'’]/g, '').replace(/\s+/g, ' ').trim();
  for (const [re, to] of ABBREV) n = n.replace(re, to);
  return ALIASES[n] ?? n;
}

/** "WEST 44 STREET" and "West 44th Street" both become "w 44 st" (ordinals dropped). */
export const streetKey = (n) => normName(n ?? '').replace(/\b(\d+)(st|nd|rd|th)\b/g, '$1');

const SHORT = [
  [/\bStreet\b/g, 'St'], [/\bAvenue\b/g, 'Ave'], [/\bBoulevard\b/g, 'Blvd'], [/\bRoad\b/g, 'Rd'],
  [/\bPlace\b/g, 'Pl'], [/\bDrive\b/g, 'Dr'], [/\bParkway\b/g, 'Pkwy'], [/\bExpressway\b/g, 'Expy'],
];
/** Street-sign style: "31st Street" -> "31st St". */
export function shortName(name) {
  let n = name ?? '';
  for (const [re, to] of SHORT) n = n.replace(re, to);
  return n;
}

export function signedArea(pts) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j][0] - pts[i][0]) * (pts[j][1] + pts[i][1]);
  return a / 2;
}

export function centroid(pts) {
  let x = 0;
  let z = 0;
  for (const p of pts) {
    x += p[0];
    z += p[1];
  }
  return [x / pts.length, z / pts.length];
}

export function bounds(pts) {
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const [x, z] of pts) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (z < z0) z0 = z;
    if (z > z1) z1 = z;
  }
  return { x0, x1, z0, z1 };
}

export function pointInPoly(x, z, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i];
    const [xj, zj] = pts[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Closest point on segment ab to p: returns [x, z, t, dist2]. */
export function closestOnSegment(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  const x = ax + dx * t;
  const z = az + dz * t;
  return [x, z, t, (px - x) ** 2 + (pz - z) ** 2];
}

/** Distance from a point to a closed polygon's outline, and the nearest edge's outward normal. */
export function nearestEdge(x, z, pts) {
  let best = Infinity;
  let bx = 0;
  let bz = 0;
  let bi = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const r = closestOnSegment(x, z, pts[j][0], pts[j][1], pts[i][0], pts[i][1]);
    if (r[3] < best) {
      best = r[3];
      bx = r[0];
      bz = r[1];
      bi = j;
    }
  }
  return { d: Math.sqrt(best), x: bx, z: bz, i: bi };
}

/** Douglas-Peucker simplification of an open polyline. */
export function simplify(pts, tol) {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  const t2 = tol * tol;
  while (stack.length) {
    const [a, b] = stack.pop();
    let best = -1;
    let bi = -1;
    for (let i = a + 1; i < b; i++) {
      const d = closestOnSegment(pts[i][0], pts[i][1], pts[a][0], pts[a][1], pts[b][0], pts[b][1])[3];
      if (d > best) {
        best = d;
        bi = i;
      }
    }
    if (best > t2) {
      keep[bi] = 1;
      stack.push([a, bi], [bi, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/** Simplify a closed ring (no repeated end point). */
export function simplifyRing(pts, tol) {
  if (pts.length < 5) return pts.slice();
  // split at the point farthest from the first so both halves are proper polylines
  let far = 0;
  let fd = -1;
  for (let i = 1; i < pts.length; i++) {
    const d = (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2;
    if (d > fd) {
      fd = d;
      far = i;
    }
  }
  const a = simplify(pts.slice(0, far + 1), tol);
  const b = simplify([...pts.slice(far), pts[0]], tol);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}

/**
 * Offset a closed ring by d (positive grows a counter-clockwise ring in x/z screen terms,
 * i.e. moves edges along their outward normal as computed by ringNormals). Miters are clamped.
 */
export function offsetRing(pts, d) {
  const n = pts.length;
  const out = [];
  const normals = ringNormals(pts);
  for (let i = 0; i < n; i++) {
    const na = normals[(i - 1 + n) % n];
    const nb = normals[i];
    let mx = na[0] + nb[0];
    let mz = na[1] + nb[1];
    const ml = Math.hypot(mx, mz);
    if (ml < 1e-6) {
      mx = nb[0];
      mz = nb[1];
    } else {
      mx /= ml;
      mz /= ml;
    }
    const cos = mx * nb[0] + mz * nb[1];
    const k = Math.min(3, 1 / Math.max(0.2, cos));
    out.push([pts[i][0] + mx * d * k, pts[i][1] + mz * d * k]);
  }
  return out;
}

/** Outward unit normal of each edge i -> i+1 of a closed ring, whatever its winding. */
export function ringNormals(pts) {
  const sign = signedArea(pts) > 0 ? 1 : -1;
  const n = pts.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    // signedArea > 0 means clockwise when viewed with +z down the screen... pick the side that points out
    out.push([(-dz / l) * sign, (dx / l) * sign]);
  }
  // make sure: a point just outside the first edge along its normal is outside the polygon
  const a = pts[0];
  const b = pts[1 % n];
  const mx = (a[0] + b[0]) / 2 + out[0][0] * 0.01;
  const mz = (a[1] + b[1]) / 2 + out[0][1] * 0.01;
  if (pointInPoly(mx, mz, pts)) for (const v of out) {
    v[0] = -v[0];
    v[1] = -v[1];
  }
  return out;
}

/** A polyline with cumulative lengths, sampled by distance. */
export class Path {
  constructor(pts, closed = false) {
    this.pts = closed ? [...pts, pts[0]] : pts;
    this.closed = closed;
    this.cum = [0];
    for (let i = 1; i < this.pts.length; i++) {
      this.cum.push(this.cum[i - 1] + Math.hypot(this.pts[i][0] - this.pts[i - 1][0], this.pts[i][1] - this.pts[i - 1][1]));
    }
    this.len = this.cum[this.cum.length - 1];
    this._i = 1;
    const b = bounds(this.pts);
    this.cx = (b.x0 + b.x1) / 2;
    this.cz = (b.z0 + b.z1) / 2;
    this.radius = Math.hypot(b.x1 - b.x0, b.z1 - b.z0) / 2;
  }

  /** [x, z, dx, dz] at distance s (clamped, or wrapped when closed). */
  at(s, out = [0, 0, 0, 0]) {
    const { cum, pts } = this;
    if (this.closed) s = ((s % this.len) + this.len) % this.len;
    else s = Math.max(0, Math.min(this.len, s));
    let i = this._i;
    if (i >= cum.length || cum[i - 1] > s) i = 1;
    while (i < cum.length - 1 && cum[i] < s) i++;
    this._i = i;
    const seg = cum[i] - cum[i - 1] || 1;
    const t = (s - cum[i - 1]) / seg;
    const a = pts[i - 1];
    const b = pts[i];
    out[0] = a[0] + (b[0] - a[0]) * t;
    out[1] = a[1] + (b[1] - a[1]) * t;
    out[2] = (b[0] - a[0]) / seg;
    out[3] = (b[1] - a[1]) / seg;
    return out;
  }
}

/** Resample a polyline every `step` meters (keeps the corners). */
export function resample(pts, step) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1];
    const [bx, bz] = pts[i];
    const l = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(l / step));
    for (let k = 1; k <= n; k++) out.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
  }
  return out;
}

/** Offset an open polyline sideways by d (positive = right of travel direction, with -z north). */
export function offsetLine(pts, d) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    let dx = b[0] - a[0];
    let dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    out.push([pts[i][0] - dz * d, pts[i][1] + dx * d]);
  }
  return out;
}

/** Deterministic 0..1 hash from an integer id, so a building looks the same on every visit. */
export function hash01(n, salt = 0) {
  let h = (n * 374761393 + salt * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
