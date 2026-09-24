// Photo challenges: each neighborhood asks for three shots of things that are really there.
// A shot counts when the subject is in frame, near enough, and not behind a building.
import * as THREE from 'three';
import { heightAt } from './terrain.js';

const KINDS = {
  waterTower: { label: 'a rooftop water tower', range: 90 },
  laundry: { label: 'laundry on a fire escape', range: 40 },
  sign: { label: 'a shop sign', range: 35 },
  pigeons: { label: 'a flock of pigeons', range: 25 },
  hydrant: { label: 'an open fire hydrant', range: 35 },
  steam: { label: 'steam rising from the street', range: 45 },
  film: { label: 'a film shoot on location', range: 60 },
};

/** Where each kind of subject is in this world right now: [x, y, z] lists. */
function gather(W) {
  const s = W.buildings.subjects ?? {};
  return {
    waterTower: s.waterTower ?? [],
    laundry: s.laundry ?? [],
    sign: s.sign ?? [],
    pigeons: W.pigeons.flocks.filter((f) => f.state !== 'gone').map((f) => [f.birds[0].x, f.birds[0].y + 0.2, f.birds[0].z]),
    hydrant: W.spray.hydrants.map((h) => [h.x + h.dx * 2, 0.8, h.z + h.dz * 2]),
    steam: (W.weather.emitters ?? []).filter((e) => e.strength > 0.5).map((e) => [e.x, e.y + 1.2, e.z]),
    film: (W.city?.crews ?? []).map((c) => [c.x, 3, c.z]),
  };
}

export class PhotoChallenges {
  constructor(store) {
    this.store = store;
    this.list = [];
    this.v = new THREE.Vector3();
  }

  /** Pick three things this neighborhood actually has; remember what was already shot. */
  setWorld(W) {
    this.W = W;
    const have = gather(W);
    const done = this.store.get(`photos.${W.def.id}`, {});
    const kinds = Object.keys(KINDS).filter((k) => have[k].length || k === 'pigeons');
    // a stable pick per neighborhood, so the list doesn't change between visits
    let h = [...W.def.id].reduce((a, c) => a * 31 + c.charCodeAt(0), 7);
    const pick = [];
    while (pick.length < 3 && kinds.length) {
      h = (h * 1103515245 + 12345) & 0x7fffffff;
      pick.push(kinds.splice(h % kinds.length, 1)[0]);
    }
    this.list = pick.map((k) => ({ kind: k, label: KINDS[k].label, stars: done[k] ?? 0 }));
  }

  /**
   * Score the frame the camera sees: for each challenge, the best-framed subject in view.
   * 1 star in frame, 2 near the middle, 3 near the middle and close. Returns what improved.
   */
  shoot(camera) {
    const have = gather(this.W);
    const got = [];
    for (const c of this.list) {
      let best = 0;
      for (const q of have[c.kind]) {
        const p = [q[0], q[1] + heightAt(q[0], q[2]), q[2]]; // drawn on the hills
        const d = camera.position.distanceTo(this.v.set(p[0], p[1], p[2]));
        if (d > KINDS[c.kind].range) continue;
        this.v.project(camera);
        if (this.v.z > 1 || Math.abs(this.v.x) > 0.85 || Math.abs(this.v.y) > 0.85) continue;
        if (this.blocked(camera.position, p)) continue;
        const centered = Math.hypot(this.v.x, this.v.y) < 0.4;
        const stars = 1 + (centered ? 1 : 0) + (centered && d < KINDS[c.kind].range * 0.45 ? 1 : 0);
        best = Math.max(best, stars);
      }
      if (best > c.stars) {
        c.stars = best;
        got.push(c);
      }
    }
    if (got.length) {
      const done = Object.fromEntries(this.list.map((c) => [c.kind, c.stars]));
      this.store.set(`photos.${this.W.def.id}`, done);
    }
    return got;
  }

  /** A building between the camera and the subject? Walk the line on the ground plan. */
  blocked(from, p) {
    const dx = p[0] - from.x;
    const dz = p[2] - from.z;
    const d = Math.hypot(dx, dz);
    // rooftop things are seen over the building they stand on: stop short of it
    const stop = p[1] > 8 ? Math.max(0, d - 14) : d - 1.5;
    for (let s = 1.5; s < stop; s += 1.5) {
      const y = from.y + ((p[1] - from.y) * s) / d;
      if (y > 30) break; // above the walk-ups
      if (this.W.grid.inside(from.x + (dx * s) / d, from.z + (dz * s) / d, 0)) return true;
    }
    return false;
  }

  get complete() {
    return this.list.length > 0 && this.list.every((c) => c.stars > 0);
  }
}
