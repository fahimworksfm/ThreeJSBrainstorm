// Open fire hydrants on a hot day: an arc of water across the street, a wet patch where it lands.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COMIC } from './comicfx.js';

const ACTIVE = 4; // hydrants sprayed at once, the ones nearest the camera
const PER = 220;

export class HydrantSpray {
  /** hydrants: [{ x, y, z, dx, dz }] nozzle position and the way it points. */
  constructor(shared, hydrants) {
    this.hydrants = hydrants;
    this.group = new THREE.Group();
    const n = ACTIVE * PER;
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.slot = new Array(ACTIVE).fill(null);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.points = new THREE.Points(
      g,
      new THREE.PointsMaterial({
        map: shared.soft, color: 0xe8f4ff, size: 0.34, transparent: true, opacity: 0.85, depthWrite: false, sizeAttenuation: true,
      }),
    );
    this.points.frustumCulled = false;
    this.group.add(this.points);
    // dark wet patches on the asphalt where the water lands
    const wet = [];
    for (const h of hydrants) {
      wet.push(new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2).scale(2.6, 1, 1.6)
        .rotateY(Math.atan2(h.dx, h.dz) + Math.PI / 2).translate(h.x + h.dx * 3.2, 0.02, h.z + h.dz * 3.2));
    }
    if (wet.length) {
      const m = new THREE.Mesh(mergeGeometries(wet), new THREE.MeshStandardMaterial({
        color: 0x10141c, transparent: true, opacity: 0.45, roughness: 0.05, metalness: 0.4, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -3,
      }));
      m.receiveShadow = true;
      this.group.add(m);
    }
  }

  respawn(k, h) {
    const k3 = k * 3;
    this.pos[k3] = h.x + h.dx * 0.3;
    this.pos[k3 + 1] = h.y;
    this.pos[k3 + 2] = h.z + h.dz * 0.3;
    const sp = 5.5 + Math.random() * 1.8;
    const side = (Math.random() - 0.5) * 0.8;
    this.vel[k3] = h.dx * sp - h.dz * side;
    this.vel[k3 + 1] = 2.2 + Math.random() * 1.6;
    this.vel[k3 + 2] = h.dz * sp + h.dx * side;
  }

  update(dt, cam, player) {
    if (!this.hydrants.length) return;
    // keep the nearest few spraying
    this.near ??= 0;
    this.near -= dt;
    if (this.near <= 0) {
      this.near = 1;
      const pick = this.hydrants
        .map((h) => [h, Math.hypot(h.x - cam.x, h.z - cam.z)])
        .filter(([, d]) => d < 80)
        .sort((a, b) => a[1] - b[1])
        .slice(0, ACTIVE)
        .map(([h]) => h);
      for (let s = 0; s < ACTIVE; s++) {
        if (this.slot[s] && pick.includes(this.slot[s])) continue;
        this.slot[s] = pick.find((h) => !this.slot.includes(h)) ?? null;
        for (let j = 0; j < PER; j++) {
          const k = s * PER + j;
          if (this.slot[s]) {
            this.respawn(k, this.slot[s]);
            // spread the first batch along the arc so it doesn't start as one clump
            const t = Math.random() * 0.8;
            for (let a = 0; a < 3; a++) this.pos[k * 3 + a] += this.vel[k * 3 + a] * t;
            this.pos[k * 3 + 1] -= 4.9 * t * t;
            this.vel[k * 3 + 1] -= 9.8 * t;
          } else this.pos[k * 3 + 1] = -50;
        }
      }
    }
    for (let s = 0; s < ACTIVE; s++) {
      const h = this.slot[s];
      if (!h) continue;
      for (let j = 0; j < PER; j++) {
        const k3 = (s * PER + j) * 3;
        this.vel[k3 + 1] -= 9.8 * dt;
        this.pos[k3] += this.vel[k3] * dt;
        this.pos[k3 + 1] += this.vel[k3 + 1] * dt;
        this.pos[k3 + 2] += this.vel[k3 + 2] * dt;
        if (this.pos[k3 + 1] < 0.02) this.respawn(k3 / 3, h);
      }
      // run through it and you get soaked
      const wx = h.x + h.dx * 3;
      const wz = h.z + h.dz * 3;
      if (Math.hypot(player.pos.x - wx, player.pos.z - wz) < 2.4) COMIC.pop('SPLOOSH!', wx, 1.8, wz, { size: 1.1, cooldown: 4, key: `hyd${wx | 0}` });
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}
