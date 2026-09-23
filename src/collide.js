const CELL = 24;

/**
 * Axis-aligned boxes bucketed in a coarse grid, so collision checks only look at
 * the handful of boxes near you instead of every building and parked car in town.
 */
export class ColliderGrid {
  constructor(boxes) {
    this.cells = new Map();
    for (const b of boxes) {
      const i0 = Math.floor(b.x0 / CELL);
      const i1 = Math.floor(b.x1 / CELL);
      const j0 = Math.floor(b.z0 / CELL);
      const j1 = Math.floor(b.z1 / CELL);
      for (let i = i0; i <= i1; i++) {
        for (let j = j0; j <= j1; j++) {
          const k = `${i},${j}`;
          if (!this.cells.has(k)) this.cells.set(k, []);
          this.cells.get(k).push(b);
        }
      }
    }
    this.stamp = 0;
  }

  /** Boxes whose cells overlap the circle (x, z, r). */
  near(x, z, r) {
    const out = [];
    const s = ++this.stamp;
    for (let i = Math.floor((x - r) / CELL); i <= Math.floor((x + r) / CELL); i++) {
      for (let j = Math.floor((z - r) / CELL); j <= Math.floor((z + r) / CELL); j++) {
        const list = this.cells.get(`${i},${j}`);
        if (!list) continue;
        for (const b of list) {
          if (b._s === s) continue;
          b._s = s;
          out.push(b);
        }
      }
    }
    return out;
  }

  /** Push a circle at p (x, z) out of any boxes. Returns true if it hit something. */
  collide(p, r) {
    let hit = false;
    for (const c of this.near(p.x, p.z, r)) {
      if (p.x < c.x0 - r || p.x > c.x1 + r || p.z < c.z0 - r || p.z > c.z1 + r) continue;
      const nx = Math.max(c.x0, Math.min(c.x1, p.x));
      const nz = Math.max(c.z0, Math.min(c.z1, p.z));
      const dx = p.x - nx;
      const dz = p.z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 > r * r) continue;
      hit = true;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        p.x += (dx / d) * (r - d);
        p.z += (dz / d) * (r - d);
      } else {
        // inside the box: push out along the shallowest side
        const pushes = [
          [c.x0 - r - p.x, 0], [c.x1 + r - p.x, 0], [0, c.z0 - r - p.z], [0, c.z1 + r - p.z],
        ].sort((a, b) => Math.abs(a[0] + a[1]) - Math.abs(b[0] + b[1]));
        p.x += pushes[0][0];
        p.z += pushes[0][1];
      }
    }
    return hit;
  }

  /** Is the point inside any box (grown by pad)? Used to keep the chase camera out of walls. */
  inside(x, z, pad = 0) {
    for (const c of this.near(x, z, pad)) {
      if (x > c.x0 - pad && x < c.x1 + pad && z > c.z0 - pad && z < c.z1 + pad) return true;
    }
    return false;
  }
}
