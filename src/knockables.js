// Loose street things you can knock over: dented metal trash cans and traffic cones.
// Bump into one (or ride through it) and it slides, wobbles and topples; it rights itself after a while.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COMIC } from './comicfx.js';
import { D } from './config.js';

const TYPES = {
  can: { count: 26, radius: 0.32, height: 0.95, mass: 1, word: 'CLANG!' },
  cone: { count: 18, radius: 0.22, height: 0.72, mass: 0.35, word: 'BONK!' },
};

function canGeometry() {
  const body = new THREE.CylinderGeometry(0.3, 0.27, 0.9, 14, 1, true).translate(0, 0.45, 0);
  const lid = new THREE.CylinderGeometry(0.33, 0.33, 0.06, 14).translate(0, 0.92, 0);
  const handle = new THREE.TorusGeometry(0.08, 0.018, 4, 10, Math.PI).translate(0, 0.95, 0);
  const ribs = [0.2, 0.7].map((y) => new THREE.TorusGeometry(0.29, 0.015, 4, 16).rotateX(Math.PI / 2).translate(0, y, 0));
  return mergeGeometries([body, lid, handle, ...ribs].map((g) => g.toNonIndexed()));
}
function coneGeometry() {
  const base = new THREE.BoxGeometry(0.42, 0.04, 0.42).translate(0, 0.02, 0);
  const cone = new THREE.ConeGeometry(0.17, 0.68, 12, 1, true).translate(0, 0.38, 0);
  return mergeGeometries([base, cone].map((g) => g.toNonIndexed()));
}
/** White stripes on the cones: a canvas band down the middle of the cone's UVs. */
function coneTexture() {
  const c = document.createElement('canvas');
  c.width = 8;
  c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#ff6a14';
  x.fillRect(0, 0, 8, 64);
  x.fillStyle = '#f4f4f0';
  x.fillRect(0, 22, 8, 10);
  x.fillRect(0, 40, 8, 7);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Knockables {
  /** peds: the crowd, whose walking routes are all sidewalk; grid: the solid-things grid. */
  constructor(peds, grid, audio) {
    this.audio = audio;
    this.group = new THREE.Group();
    this.items = [];
    const meshes = {
      can: new THREE.InstancedMesh(canGeometry(), new THREE.MeshStandardMaterial({ color: 0x8d9296, roughness: 0.5, metalness: 0.5, side: THREE.DoubleSide }), TYPES.can.count),
      cone: new THREE.InstancedMesh(coneGeometry(), new THREE.MeshStandardMaterial({ map: coneTexture(), roughness: 0.7 }), TYPES.cone.count),
    };
    this.meshes = meshes;
    let seed = 99;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const list = peds.peds ?? [];
    for (const [type, spec] of Object.entries(TYPES)) {
      const mesh = meshes[type];
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(mesh);
      let placed = 0;
      for (let tries = 0; placed < spec.count && tries < spec.count * 20 && list.length; tries++) {
        const p = list[Math.floor(rnd() * list.length)];
        const [x0, z0, dx, dz] = peds.at(p, rnd() * (p.path?.len ?? p.per ?? 100));
        // step off the walking line toward one side of the sidewalk
        const side = (rnd() < 0.5 ? -1 : 1) * (0.9 + rnd() * 0.6);
        const x = x0 - dz * side;
        const z = z0 + dx * side;
        if (grid.inside(x, z, spec.radius + 0.1)) continue;
        // cones come in little groups, like around a manhole job
        const n = type === 'cone' ? Math.min(spec.count - placed, 2 + Math.floor(rnd() * 3)) : 1;
        for (let k = 0; k < n; k++) {
          this.items.push({
            type, index: placed++, spec, x: x + dx * k * 0.9, z: z + dz * k * 0.9, vx: 0, vz: 0,
            yaw: rnd() * 6.28, tilt: 0, tiltDir: 0, spin: 0, down: 0, home: [x + dx * k * 0.9, z + dz * k * 0.9],
          });
        }
      }
      for (let i = placed; i < spec.count; i++) mesh.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0));
    }
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler();
    this.v = new THREE.Vector3();
    this.one = new THREE.Vector3(1, 1, 1);
    this.write();
  }

  /** player: pos, vel (on foot) or speed + heading (riding); radius: how wide you are. */
  update(dt, player, radius) {
    const riding = player.mode !== 'walk';
    const vx = riding ? -Math.sin(player.heading) * player.speed : player.vel.x;
    const vz = riding ? -Math.cos(player.heading) * player.speed : player.vel.z;
    const speed = Math.hypot(vx, vz);
    let moved = false;
    for (const it of this.items) {
      const dx = it.x - player.pos.x;
      const dz = it.z - player.pos.z;
      const d = Math.hypot(dx, dz);
      const reach = radius + it.spec.radius;
      if (d < reach && speed > 0.6) {
        // shoved along your motion and out of your way, harder the faster you go
        const push = Math.min(12, speed * (riding ? 1.3 : 0.9)) / it.spec.mass;
        const nx = dx / (d || 1);
        const nz = dz / (d || 1);
        it.vx = vx * 0.7 + nx * push * 0.5;
        it.vz = vz * 0.7 + nz * push * 0.5;
        it.spin = (Math.random() - 0.5) * 8;
        if (speed > 2.2 && it.down < 0.5) {
          it.down = 1;
          it.tiltDir = Math.atan2(it.vx, it.vz);
          COMIC.pop(it.spec.word, it.x, 1.4, it.z, { size: 0.8, cooldown: 1.2, key: `knock${it.type}` });
          this.audio?.thud?.(Math.min(1, speed / 10) * (it.type === 'can' ? 0.6 : 0.3));
        }
      }
      if (it.vx || it.vz || it.spin || it.tilt !== it.down * Math.PI / 2 * 0.98) moved = true;
      // slide with friction; topple toward the way it was hit, and after a while stand back up
      it.x += it.vx * dt;
      it.z += it.vz * dt;
      const f = Math.exp(-dt * (it.down ? 3.5 : 6));
      it.vx *= f;
      it.vz *= f;
      it.spin *= f;
      it.yaw += it.spin * dt;
      if (Math.abs(it.vx) + Math.abs(it.vz) < 0.02) it.vx = it.vz = 0;
      if (Math.abs(it.spin) < 0.02) it.spin = 0;
      const target = it.down ? (Math.PI / 2) * 0.98 : 0;
      it.tilt += (target - it.tilt) * Math.min(1, dt * (it.down ? 9 : 3));
      if (it.down) {
        it.down -= dt / 25; // someone sets it back up
        if (it.down <= 0.5) {
          it.down = 0;
          [it.x, it.z] = it.home;
        }
      }
    }
    if (moved) this.write();
  }

  write() {
    const { m, q, e, v, one } = this;
    for (const it of this.items) {
      // tip over around the base edge in the direction it was hit
      e.set(0, it.tiltDir, 0, 'YXZ');
      q.setFromEuler(e);
      const lean = new THREE.Quaternion().setFromAxisAngle(v.set(1, 0, 0), it.tilt);
      const spin = new THREE.Quaternion().setFromAxisAngle(v.set(0, 1, 0), it.yaw - it.tiltDir);
      q.multiply(lean).multiply(spin);
      const lift = Math.sin(it.tilt) * it.spec.radius; // lying down, it rests on its side
      m.compose(v.set(it.x, (D.sidewalkY ?? 0.15) + lift * 0.9, it.z), q, one);
      this.meshes[it.type].setMatrixAt(it.index, m);
    }
    for (const mesh of Object.values(this.meshes)) mesh.instanceMatrix.needsUpdate = true;
  }
}
