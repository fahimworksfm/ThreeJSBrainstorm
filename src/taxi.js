// Hail a yellow cab (T): stand on the sidewalk and wave, a cab pulls up at the curb, and E rides you to
// the next memory you haven't found (or today's postcard spot). The fare comes out of delivery money.
import * as THREE from 'three';
import { sedanGeometry } from './models.js';
import { COMIC } from './comicfx.js';

function buildCab() {
  const g = new THREE.Group();
  const sedan = sedanGeometry();
  const yellow = new THREE.MeshStandardMaterial({ color: 0xf5b800, roughness: 0.35, metalness: 0.2 });
  g.add(new THREE.Mesh(sedan.body, yellow));
  g.add(new THREE.Mesh(sedan.glass, new THREE.MeshStandardMaterial({ color: 0x1d2a38, roughness: 0.2 })));
  g.add(new THREE.Mesh(sedan.chrome, new THREE.MeshStandardMaterial({ color: 0xd9dde2, roughness: 0.25, metalness: 0.9 })));
  // the roof light: lit means it's free
  const sign = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.26, 0.3).translate(0, 1.55, -0.2), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.6, 1.6) }));
  g.add(sign);
  for (const [x, z] of [[-0.82, 1.45], [0.82, 1.45], [-0.82, -1.45], [0.82, -1.45]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.26, 10).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.9 }));
    w.position.set(x, 0.34, z);
    g.add(w);
  }
  g.traverse((o) => (o.castShadow = o.isMesh));
  return g;
}

export class Taxi {
  /** isRoad(x, z) from the map; where(): the destination { x, z, label } or null. */
  constructor(parent, isRoad, store, hud) {
    this.isRoad = isRoad;
    this.store = store;
    this.hud = hud;
    this.cab = buildCab();
    this.cab.visible = false;
    parent.add(this.cab);
    this.state = 'idle';
  }

  /** Wave one down. Returns a message for the HUD, or null when one is already coming. */
  hail(player) {
    if (this.state !== 'idle') return null;
    if (player.mode !== 'walk' || player.roof) return 'Hop off first: cabs stop for people on foot';
    // the nearest curb: step out in eight directions until the road starts
    let best = null;
    for (let r = 2; r <= 12 && !best; r += 1) {
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        const x = player.pos.x + Math.sin(a) * r;
        const z = player.pos.z + Math.cos(a) * r;
        if (this.isRoad(x, z)) {
          best = { x: x + Math.sin(a) * 1.4, z: z + Math.cos(a) * 1.4, a };
          break;
        }
      }
    }
    if (!best) return 'No street close enough: walk to the curb and try again';
    // park along the curb: the cab's length runs across the direction to the road
    const heading = best.a + Math.PI / 2;
    this.stop = { x: best.x, z: best.z, heading };
    this.from = { x: best.x - Math.sin(heading) * 40, z: best.z - Math.cos(heading) * 40 };
    this.t = 0;
    this.state = 'coming';
    this.cab.visible = true;
    COMIC.pop('TAXI!', player.pos.x, player.ground + 2.3, player.pos.z, { size: 1.1, cooldown: 1 });
    return '🚕 You wave down a cab…';
  }

  get waiting() {
    return this.state === 'waiting';
  }

  update(dt, player) {
    if (this.state === 'idle') return;
    this.t += dt;
    const s = this.stop;
    if (this.state === 'coming' || this.state === 'leaving') {
      // ease in to the curb, or pull away
      const k = this.state === 'coming' ? 1 - (1 - Math.min(1, this.t / 4)) ** 3 : Math.min(1, this.t / 3) ** 2;
      const [a, b] = this.state === 'coming' ? [this.from, s] : [s, { x: s.x + Math.sin(s.heading) * 60, z: s.z + Math.cos(s.heading) * 60 }];
      this.cab.position.set(a.x + (b.x - a.x) * k, 0, a.z + (b.z - a.z) * k);
      this.cab.rotation.y = s.heading;
      if (this.state === 'coming' && this.t >= 4) {
        this.state = 'waiting';
        this.t = 0;
      }
      if (this.state === 'leaving' && this.t >= 3) {
        this.state = 'idle';
        this.cab.visible = false;
      }
    } else if (this.state === 'waiting') {
      // nobody got in: it drives off after a while
      const far = Math.hypot(player.pos.x - s.x, player.pos.z - s.z) > 25;
      if (this.t > 40 || far) this.drive();
    }
  }

  drive() {
    this.state = 'leaving';
    this.t = 0;
  }

  /** Price of a ride: a flag drop plus a little per block. */
  fare(dest) {
    const d = Math.hypot(dest.x - this.stop.x, dest.z - this.stop.z);
    return Math.round(3 + d / 80);
  }
}
