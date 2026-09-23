import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CURB } from './config.js';

const KINDS = {
  sodium: { bulb: 0xffc07a, pool: 0xff9a40 },
  led: { bulb: 0xe6eeff, pool: 0x8da6d8 },
  warm: { bulb: 0xffe0b0, pool: 0xffc890 },
  green: { bulb: 0x3dff7a, pool: 0x2aff66 }, // subway entrance globes
};

/**
 * Collects street lamps and builds them as a few merged meshes.
 * Light pools are fake: additive radial decals on the ground instead of real lights,
 * so hundreds of lamps cost almost nothing.
 */
export class LightKit {
  constructor() {
    this.poles = [];
    this.bulbs = {};
    this.pools = {};
  }

  add(x, z, nx, nz, { height = 8.5, arm = 2.2, kind = 'sodium', pool = 10, y0 = CURB, globe = false } = {}) {
    const ang = Math.atan2(nx, nz);
    const parts = [];
    const pole = new THREE.CylinderGeometry(0.08, 0.13, height, 6);
    pole.translate(0, height / 2, 0);
    parts.push(pole);
    let bulb;
    if (globe) {
      bulb = new THREE.SphereGeometry(0.28, 10, 8);
      bulb.translate(0, height + 0.25, 0);
      const cap = new THREE.CylinderGeometry(0.1, 0.2, 0.18, 6);
      cap.translate(0, height + 0.6, 0);
      parts.push(cap);
    } else {
      const a = new THREE.BoxGeometry(0.1, 0.1, arm);
      a.translate(0, height - 0.1, arm / 2);
      const head = new THREE.BoxGeometry(0.42, 0.18, 0.9);
      head.translate(0, height - 0.02, arm);
      parts.push(a, head);
      bulb = new THREE.PlaneGeometry(0.32, 0.72);
      bulb.rotateX(Math.PI / 2);
      bulb.translate(0, height - 0.12, arm);
    }
    const p = new THREE.PlaneGeometry(pool * 2, pool * 2);
    p.rotateX(-Math.PI / 2);
    p.translate(0, 0.025, globe ? 0 : arm);
    for (const g of [...parts, bulb, p]) {
      g.rotateY(ang);
      g.translate(x, y0, z);
    }
    this.poles.push(...parts);
    (this.bulbs[kind] ??= []).push(bulb);
    (this.pools[kind] ??= []).push(p);
  }

  build(poolTex) {
    const group = new THREE.Group();
    if (this.poles.length) {
      const poleMat = new THREE.MeshStandardMaterial({ color: 0x20262a, roughness: 0.5, metalness: 0.7 });
      group.add(new THREE.Mesh(mergeGeometries(this.poles), poleMat));
    }
    for (const kind of Object.keys(this.bulbs)) {
      const k = KINDS[kind];
      group.add(
        new THREE.Mesh(
          mergeGeometries(this.bulbs[kind]),
          new THREE.MeshBasicMaterial({ color: new THREE.Color(k.bulb).multiplyScalar(7), side: THREE.DoubleSide }),
        ),
      );
      group.add(
        new THREE.Mesh(
          mergeGeometries(this.pools[kind]),
          new THREE.MeshBasicMaterial({
            map: poolTex, color: k.pool, transparent: true, opacity: 0.26,
            blending: THREE.AdditiveBlending, depthWrite: false,
          }),
        ),
      );
    }
    return group;
  }
}
