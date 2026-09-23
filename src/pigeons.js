// Pigeons: small flocks pecking on the sidewalk that burst into the air when you come close.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COMIC } from './comicfx.js';
import { D } from './config.js';

const FLOCKS = 7;
const PER = 8;
const N = FLOCKS * PER;

function colored(g, hex) {
  g = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(hex);
  const col = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < col.length; i += 3) col.set([c.r, c.g, c.b], i);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.deleteAttribute('uv');
  return g;
}

/** A pigeon facing +z, feet at y = 0. */
function bodyGeometry() {
  return mergeGeometries([
    colored(new THREE.SphereGeometry(0.1, 8, 6).scale(0.9, 0.85, 1.5).translate(0, 0.14, 0), 0x7d8594),
    colored(new THREE.SphereGeometry(0.06, 8, 6).translate(0, 0.25, 0.13), 0x5d6a7a), // head
    colored(new THREE.SphereGeometry(0.055, 8, 6).scale(1, 1, 0.8).translate(0, 0.2, 0.1), 0x4f8a7a), // green neck sheen
    colored(new THREE.ConeGeometry(0.015, 0.05, 5).rotateX(Math.PI / 2).translate(0, 0.25, 0.2), 0x2b2b2b), // beak
    colored(new THREE.BoxGeometry(0.1, 0.02, 0.12).translate(0, 0.14, -0.18), 0x3a404a), // tail
    colored(new THREE.CylinderGeometry(0.008, 0.008, 0.07, 4).translate(0.03, 0.035, 0), 0xc4574a), // legs
    colored(new THREE.CylinderGeometry(0.008, 0.008, 0.07, 4).translate(-0.03, 0.035, 0), 0xc4574a),
  ]);
}

/** One wing reaching out along +x from the shoulder; mirror for the other side. */
function wingGeometry(side) {
  const g = new THREE.BufferGeometry();
  const s = side;
  const v = [0, 0, 0.07, s * 0.3, 0, 0.02, s * 0.26, 0, -0.08, 0, 0, -0.07];
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setIndex(s > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]);
  g.computeVertexNormals();
  return colored(g, 0x9aa2ae);
}

export class Pigeons {
  /** peds: the Pedestrians crowd; flocks land along its walking routes, which are all sidewalk. */
  constructor(peds) {
    this.peds = peds;
    this.group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, flatShading: true, side: THREE.DoubleSide });
    this.body = new THREE.InstancedMesh(bodyGeometry(), mat, N);
    this.wingL = new THREE.InstancedMesh(wingGeometry(-1), mat, N);
    this.wingR = new THREE.InstancedMesh(wingGeometry(1), mat, N);
    for (const m of [this.body, this.wingL, this.wingR]) {
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(m);
    }
    this.flocks = [];
    for (let f = 0; f < FLOCKS; f++) {
      const birds = [];
      for (let b = 0; b < PER; b++) birds.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, phase: Math.random() * 10, peck: 0 });
      this.flocks.push({ state: 'gone', wait: Math.random() * 3, x: 0, z: 0, t: 0, birds });
    }
    this.m = new THREE.Matrix4();
    this.w = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler();
    this.v = new THREE.Vector3();
    this.one = new THREE.Vector3(1, 1, 1);
    this.zero = new THREE.Matrix4().makeScale(0, 0, 0);
  }

  /** A sidewalk spot 18-60 m from (px, pz), taken from a pedestrian route. */
  landing(px, pz) {
    const list = this.peds.peds;
    if (!list?.length) return null;
    for (let k = 0; k < 12; k++) {
      const p = list[Math.floor(Math.random() * list.length)];
      const [x, z] = this.peds.at(p, Math.random() * (p.path?.len ?? p.per ?? 100));
      const d = Math.hypot(x - px, z - pz);
      if (d > 18 && d < 60) return [x, z];
    }
    return null;
  }

  update(t, dt, player) {
    const px = player.pos.x;
    const pz = player.pos.z;
    const fast = Math.abs(player.speed ?? 0) > 3;
    const y0 = D.sidewalkY ?? 0;
    const { m, w, q, e, v, one } = this;
    this.flocks.forEach((f, fi) => {
      const d = Math.hypot(f.x - px, f.z - pz);
      if (f.state === 'gone') {
        f.wait -= dt;
        if (f.wait > 0) return;
        const at = this.landing(px, pz);
        if (!at) return;
        [f.x, f.z] = at;
        f.state = 'ground';
        for (const b of f.birds) {
          b.x = f.x + (Math.random() - 0.5) * 2.4;
          b.z = f.z + (Math.random() - 0.5) * 2.4;
          b.y = y0;
          b.yaw = Math.random() * Math.PI * 2;
        }
      } else if (f.state === 'ground') {
        if (d > 90) f.state = 'gone';
        else if (d < (fast ? 9 : 4.5)) {
          // spooked: everybody up and away from you at once
          f.state = 'flying';
          f.t = 0;
          for (const b of f.birds) {
            const ax = b.x - px;
            const az = b.z - pz;
            const l = Math.hypot(ax, az) || 1;
            const sp = 3.5 + Math.random() * 3;
            b.vx = (ax / l) * sp + (Math.random() - 0.5) * 2;
            b.vz = (az / l) * sp + (Math.random() - 0.5) * 2;
            b.vy = 3 + Math.random() * 2.5;
            b.yaw = Math.atan2(b.vx, b.vz);
          }
          COMIC.pop('FLAP FLAP', f.x, y0 + 1.6, f.z, { size: 0.9, cooldown: 6, key: 'pigeons' });
        }
      } else if (f.state === 'flying') {
        f.t += dt;
        if (f.t > 5) {
          f.state = 'gone';
          f.wait = 6 + Math.random() * 10;
        }
      }

      f.birds.forEach((b, bi) => {
        const k = fi * PER + bi;
        if (f.state === 'gone') {
          this.body.setMatrixAt(k, this.zero);
          this.wingL.setMatrixAt(k, this.zero);
          this.wingR.setMatrixAt(k, this.zero);
          return;
        }
        let flap;
        let pitch = 0;
        if (f.state === 'flying') {
          b.vy = Math.max(b.vy - dt * 0.6, 1.2);
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          b.z += b.vz * dt;
          flap = Math.sin((t + b.phase) * 38) * 1.1;
          pitch = -0.35;
        } else {
          // waddle and peck
          b.peck -= dt;
          if (b.peck < 0) {
            b.peck = 0.4 + Math.random() * 1.8;
            if (Math.random() < 0.4) b.yaw += (Math.random() - 0.5) * 2;
          }
          const walking = b.peck > 1.2;
          if (walking) {
            b.x += Math.sin(b.yaw) * dt * 0.35;
            b.z += Math.cos(b.yaw) * dt * 0.35;
          }
          pitch = !walking && b.peck < 0.25 ? 0.5 : Math.sin((t + b.phase) * 9) * 0.06;
          flap = null;
        }
        e.set(pitch, b.yaw, 0, 'YXZ');
        q.setFromEuler(e);
        m.compose(v.set(b.x, b.y, b.z), q, one);
        this.body.setMatrixAt(k, m);
        // folded wings lie back along the body; in flight they beat up and down
        if (flap === null) w.makeRotationY(1.53).setPosition(0.075, 0.18, 0.05);
        else w.makeRotationZ(flap).setPosition(0.06, 0.17, 0.02);
        this.wingR.setMatrixAt(k, w.premultiply(m));
        if (flap === null) w.makeRotationY(-1.53).setPosition(-0.075, 0.18, 0.05);
        else w.makeRotationZ(-flap).setPosition(-0.06, 0.17, 0.02);
        this.wingL.setMatrixAt(k, w.premultiply(m));
      });
    });
    for (const mesh of [this.body, this.wingL, this.wingR]) mesh.instanceMatrix.needsUpdate = true;
  }
}
