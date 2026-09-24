// Bodega delivery runs: pick up an order at a shop, then race it to a doorstep across the neighborhood.
// J starts a run (or the pause menu); a beam marks where to go; the tip depends on how fast you were.
import * as THREE from 'three';
import { COMIC, JUICE } from './comicfx.js';
import { CURB } from './config.js';

const ORDERS = [
  'a bacon egg and cheese', 'two coffees, light and sweet', 'a chopped cheese', 'a quart of milk and a lotto ticket',
  'a pastrami on rye', 'three slices, one plain', 'a bag of plantain chips and a Malta', 'a dozen bagels',
  'cat food and paper towels', 'a large pie, extra cheese', 'an order of dumplings', 'two chicken over rice',
];

export class Deliveries {
  /** faces: street-facing walls; describe(x, z): the street name there; beamTex: the memory beam texture. */
  constructor(faces, describe, beamTex, store) {
    this.store = store;
    this.describe = describe;
    this.shops = faces.filter((f) => f.shop);
    this.doors = faces.filter((f) => !f.shop && f.lot && !f.lot.outer && /apt|row|house|mixed|corner/.test(f.lot.kind ?? ''));
    this.group = new THREE.Group();
    this.beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.5, 60, 14, 1, true).translate(0, 30, 0),
      new THREE.MeshBasicMaterial({ map: beamTex, color: 0xffb21c, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }),
    );
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(1.2, 1.6, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffb21c, transparent: true, opacity: 0.8, depthWrite: false }),
    );
    this.group.add(this.beam, this.ring);
    this.group.visible = false;
    this.run = null;
  }

  get tips() {
    return this.store.get('delivery.tips', 0);
  }

  spot(f) {
    return { x: f.x + f.nx * 2.2, z: f.z + f.nz * 2.2, where: this.name(f.x + f.nx * 3, f.z + f.nz * 3) };
  }

  name(x, z) {
    const d = this.describe(x, z);
    return (typeof d === 'string' ? d : d?.main ?? '').split('·')[0].trim();
  }

  /** A new order from a shop near you. Returns the text to announce, or null. */
  start(px, pz) {
    if (!this.shops.length || !this.doors.length) return null;
    const near = this.shops.filter((f) => {
      const d = Math.hypot(f.x - px, f.z - pz);
      return d > 25 && d < 180;
    });
    const shop = (near.length ? near : this.shops)[Math.floor(Math.random() * (near.length || this.shops.length))];
    const far = this.doors.filter((f) => {
      const d = Math.hypot(f.x - shop.x, f.z - shop.z);
      return d > 180 && d < 520;
    });
    if (!far.length) return null;
    const door = far[Math.floor(Math.random() * far.length)];
    const order = ORDERS[Math.floor(Math.random() * ORDERS.length)];
    const from = this.spot(shop);
    const to = this.spot(door);
    const dist = Math.hypot(to.x - from.x, to.z - from.z);
    this.run = { stage: 'pickup', from, to, order, shopName: shop.names?.[0] ?? 'the corner store', time: 0, limit: 25 + dist / 5.5 };
    this.mark(from);
    return `🛵 Order up: ${order}. Pick it up at ${this.run.shopName} on ${from.where}`;
  }

  cancel() {
    this.run = null;
    this.group.visible = false;
  }

  mark(p) {
    this.group.visible = true;
    this.beam.position.set(p.x, CURB, p.z);
    this.ring.position.set(p.x, CURB + 0.04, p.z);
  }

  /** Returns a message when something happens (picked up, delivered, too late). */
  update(dt, t, player) {
    const r = this.run;
    if (!r) return null;
    this.ring.scale.setScalar(1 + Math.sin(t * 4) * 0.08);
    const goal = r.stage === 'pickup' ? r.from : r.to;
    const d = Math.hypot(player.pos.x - goal.x, player.pos.z - goal.z);
    if (r.stage === 'drop') r.time += dt;
    if (r.stage === 'pickup' && d < 3.5) {
      r.stage = 'drop';
      this.mark(r.to);
      COMIC.pop('GOT IT!', goal.x, 2.2, goal.z, { size: 0.9, cooldown: 1 });
      return `Picked up. Deliver to ${r.to.where}: ${Math.round(r.limit)} seconds!`;
    }
    if (r.stage === 'drop' && d < 3.5) {
      const left = r.limit - r.time;
      const stars = left > r.limit * 0.35 ? 3 : left > 0 ? 2 : 1;
      const tip = stars === 3 ? 10 : stars === 2 ? 5 : 1;
      this.store.set('delivery.tips', this.tips + tip);
      this.store.set('delivery.runs', this.store.get('delivery.runs', 0) + 1);
      COMIC.pop('DELIVERED!', goal.x, 2.4, goal.z, { size: 1.2, cooldown: 1 });
      JUICE.hit(0.25, 0.08);
      this.cancel();
      return `${'★'.repeat(stars)}${'☆'.repeat(3 - stars)} Delivered ${left > 0 ? `with ${Math.round(left)} s to spare` : 'late'}: $${tip} tip (total $${this.tips})`;
    }
    return null;
  }

  /** The mission line under the objective while a run is on. */
  hint(player) {
    const r = this.run;
    if (!r) return null;
    const goal = r.stage === 'pickup' ? r.from : r.to;
    const d = Math.hypot(player.pos.x - goal.x, player.pos.z - goal.z);
    if (r.stage === 'pickup') return `🛵 Pick up at ${r.shopName} · ${Math.round(d / 10) * 10} m`;
    const left = Math.max(0, r.limit - r.time);
    return `🛵 Deliver to ${r.to.where} · ${Math.round(d / 10) * 10} m · ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
  }
}
