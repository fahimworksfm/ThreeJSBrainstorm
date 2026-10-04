// Rats, after dark, where New Yorkers actually reported them: the last month of 311 rodent complaints
// (NYC Open Data, pooled into ~50 m cells by scripts/fetch-nyc.mjs). They dart along the curb in stops and
// starts and bolt for the nearest drain when you come close. No data, no rats: nothing is made up.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COMIC } from './comicfx.js';
import { D } from './config.js';

const N = 24;

function colored(g, hex) {
  g = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(hex);
  const col = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < col.length; i += 3) col.set([c.r, c.g, c.b], i);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.deleteAttribute('uv');
  return g;
}

/** A rat facing +z, feet at y = 0: about 22 cm of rat and 18 of tail. */
function ratGeometry() {
  const tail = new THREE.CylinderGeometry(0.006, 0.012, 0.2, 5).rotateX(Math.PI / 2 - 0.25).translate(0, 0.04, -0.19);
  return mergeGeometries([
    colored(new THREE.SphereGeometry(0.06, 9, 6).scale(0.85, 0.7, 1.9).translate(0, 0.055, 0), 0x4b4340), // body
    colored(new THREE.ConeGeometry(0.035, 0.09, 7).rotateX(Math.PI / 2).translate(0, 0.06, 0.135), 0x554b47), // snout
    colored(new THREE.SphereGeometry(0.018, 6, 4).translate(0.03, 0.095, 0.085), 0xb98a86), // ears
    colored(new THREE.SphereGeometry(0.018, 6, 4).translate(-0.03, 0.095, 0.085), 0xb98a86),
    colored(new THREE.SphereGeometry(0.008, 4, 3).translate(0, 0.06, 0.18), 0x1a1214), // nose
    colored(tail, 0x9a7d78),
  ]);
}

export class Rats {
  /**
   * cells: [[lon, lat, count]] (311 rodent complaints); proj: the real-map projection; peds: the crowd, whose
   * routes are all sidewalk; store: saved progress (rats spotted).
   */
  constructor(cells, proj, peds, store) {
    this.store = store;
    this.group = new THREE.Group();
    this.spots = [];
    this.rats = [];
    this.peds = peds;
    // the complaint cells on the map; snapped to the sidewalk once the crowd has its routes
    this.cells = cells?.length && proj ? cells.map(([lon, lat, count]) => [...proj.toWorld(lat, lon), Math.min(5, count)]) : [];
    if (!this.cells.length) return;
    this.mesh = new THREE.InstancedMesh(ratGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }), N);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = false;
    this.mesh.count = N;
    this.group.add(this.mesh);
    for (let i = 0; i < N; i++) this.rats.push({ on: false, x: 0, z: 0, yaw: 0, run: 0, pause: 0, flee: 0, t: Math.random() * 10 });
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler();
    this.v = new THREE.Vector3();
    this.s = new THREE.Vector3(1, 1, 1);
    this.zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < N; i++) this.mesh.setMatrixAt(i, this.zero);
    this.spawnTimer = 0;
    this.tries = 0;
  }

  /** Each complaint cell onto the nearest sidewalk (a rat by the curb, not inside a building). */
  snap() {
    const list = this.peds?.peds;
    if (!list?.length) return false;
    const walk = [];
    for (let k = 0; k < 800; k++) {
      const p = list[k % list.length];
      walk.push(this.peds.at(p, Math.random() * (p.path?.len ?? p.per ?? 100)));
    }
    const left = [];
    for (const [x, z, w] of this.cells) {
      let best = null;
      let bd = 30 * 30;
      for (const [wx, wz] of walk) {
        const d = (wx - x) ** 2 + (wz - z) ** 2;
        if (d < bd) {
          bd = d;
          best = [wx, wz];
        }
      }
      if (best) this.spots.push({ x: best[0], z: best[1], w });
      else left.push([x, z, w]);
    }
    // the crowd fills in over the first seconds: try the rest again in a bit, a few times
    this.cells = ++this.tries < 8 ? left : [];
    return this.spots.length > 0;
  }

  /** Complaint spots (before the sidewalk snap, the cells). */
  get count() {
    return this.spots.length || this.cells.length;
  }

  /** A complaint spot near (px, pz), picked by how many complaints it has. */
  pick(px, pz) {
    const near = this.spots.filter((s) => {
      const d = Math.hypot(s.x - px, s.z - pz);
      return d > 10 && d < 55;
    });
    if (!near.length) return null;
    let r = Math.random() * near.reduce((a, s) => a + s.w, 0);
    for (const s of near) if ((r -= s.w) <= 0) return s;
    return near[0];
  }

  update(t, dt, player, night) {
    if (!this.mesh) return;
    this.snapTimer = (this.snapTimer ?? 0) - dt;
    if (this.cells.length && this.snapTimer <= 0) {
      this.snapTimer = 4;
      this.snap();
    }
    if (!this.spots.length) return;
    const px = player.pos.x;
    const pz = player.pos.z;
    const out = night > 0.6; // they come out once it's properly dark
    this.spawnTimer -= dt;
    if (out && this.spawnTimer <= 0) {
      this.spawnTimer = 1.5 + Math.random() * 3;
      const r = this.rats.find((o) => !o.on);
      const s = r && this.pick(px, pz);
      if (s) Object.assign(r, { on: true, x: s.x + (Math.random() - 0.5) * 3, z: s.z + (Math.random() - 0.5) * 3, yaw: Math.random() * Math.PI * 2, run: 0, pause: Math.random(), flee: 0, home: s });
    }
    const y0 = D.sidewalkY ?? 0;
    const fast = Math.abs(player.speed ?? 0) > 3;
    const { m, q, e, v, s } = this;
    this.rats.forEach((r, i) => {
      if (!r.on) {
        this.mesh.setMatrixAt(i, this.zero);
        return;
      }
      r.t += dt;
      const d = Math.hypot(r.x - px, r.z - pz);
      if (!out || d > 70) r.on = false;
      if (r.flee) {
        // bolting for a drain: fast, straight away from you, gone in a second or two
        r.flee -= dt;
        r.x += Math.sin(r.yaw) * dt * 4.2;
        r.z += Math.cos(r.yaw) * dt * 4.2;
        if (r.flee <= 0) r.on = false;
      } else if (d < (fast ? 7 : 3.2)) {
        r.flee = 1.1 + Math.random() * 0.6;
        r.yaw = Math.atan2(r.x - px, r.z - pz) + (Math.random() - 0.5) * 0.6;
        COMIC.pop('SKRRT!', r.x, y0 + 0.7, r.z, { size: 0.55, cooldown: 4, key: 'rats' });
        this.store?.set('rats', (this.store.get('rats', 0) ?? 0) + 1);
      } else if (r.pause > 0) {
        r.pause -= dt;
        if (r.pause <= 0) {
          r.run = 0.4 + Math.random() * 0.9;
          r.yaw += (Math.random() - 0.5) * 2.2;
          // never wander far from the spot
          if (Math.hypot(r.x - r.home.x, r.z - r.home.z) > 5) r.yaw = Math.atan2(r.home.x - r.x, r.home.z - r.z);
        }
      } else {
        // a short scurry, then a sniff
        r.run -= dt;
        r.x += Math.sin(r.yaw) * dt * 1.8;
        r.z += Math.cos(r.yaw) * dt * 1.8;
        if (r.run <= 0) r.pause = 0.5 + Math.random() * 2;
      }
      const moving = r.flee > 0 || (r.pause <= 0 && r.run > 0);
      const bob = moving ? Math.abs(Math.sin(r.t * 30)) * 0.012 : 0;
      e.set(moving ? 0 : Math.sin(r.t * 6) * 0.08, r.yaw + (moving ? Math.sin(r.t * 22) * 0.12 : 0), 0, 'YXZ');
      q.setFromEuler(e);
      m.compose(v.set(r.x, y0 + bob, r.z), q, s);
      this.mesh.setMatrixAt(i, m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
