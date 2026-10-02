// Real food stops: the actual pizzerias, delis, cafés and bakeries on the map (OpenStreetMap). Walk up and
// press E to buy something with what deliveries have earned; for a minute after, running doesn't tire you.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COMIC, JUICE } from './comicfx.js';
import { CURB } from './config.js';

/** A cat loafing by the door: body, head, ears and a tail curled round. */
function catGeometry() {
  const parts = [
    new THREE.SphereGeometry(0.16, 10, 8).scale(1, 0.8, 1.5).translate(0, 0.14, 0),
    new THREE.SphereGeometry(0.1, 10, 8).translate(0, 0.24, 0.2),
    new THREE.ConeGeometry(0.035, 0.08, 4).translate(-0.05, 0.34, 0.2),
    new THREE.ConeGeometry(0.035, 0.08, 4).translate(0.05, 0.34, 0.2),
    new THREE.TorusGeometry(0.14, 0.025, 5, 10, Math.PI).rotateX(Math.PI / 2).translate(0.02, 0.04, -0.12),
  ];
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
}
const CAT_COATS = [0xd9822b, 0x1c1a1c, 0x8a8a90, 0xece6da];

const MENU = [
  { kind: 'pizza', test: (b) => /pizza/i.test(`${b.cuisine ?? ''} ${b.name}`), item: 'a slice', price: 2, word: 'MMM!' },
  { kind: 'coffee', test: (b) => /cafe|coffee/i.test(`${b.trade ?? ''} ${b.cuisine ?? ''} ${b.name}`), item: 'a regular coffee', price: 2, word: 'SLURP' },
  { kind: 'bakery', test: (b) => /bakery|pastry|bagel/i.test(`${b.trade ?? ''} ${b.cuisine ?? ''} ${b.name}`), item: 'a black-and-white cookie', price: 3, word: 'CRUNCH' },
  { kind: 'deli', test: (b) => /convenience|deli|grocery|bodega|supermarket|food/i.test(`${b.trade ?? ''} ${b.name}`), item: 'a chopped cheese', price: 6, word: 'CHOMP!' },
];
const FED = 60; // seconds of tireless running

export class FoodStops {
  /** boards: the real shop signs ({ name, x, z, nx, nz, trade, cuisine }). */
  constructor(boards, store, hud) {
    this.store = store;
    this.hud = hud;
    this.stops = [];
    this.near = null;
    for (const b of boards ?? []) {
      const m = MENU.find((x) => x.test(b));
      if (m) this.stops.push({ ...b, ...m, sx: b.x + b.nx * 1.6, sz: b.z + b.nz * 1.6 });
    }
    // every bodega worth its name has a cat
    this.group = new THREE.Group();
    this.cats = [];
    const delis = this.stops.filter((s, i) => s.kind === 'deli' && (i * 7) % 3 === 0).slice(0, 16);
    if (delis.length) {
      const geo = catGeometry();
      const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.9 }), delis.length);
      const m4 = new THREE.Matrix4();
      const c = new THREE.Color();
      delis.forEach((d, i) => {
        const x = d.x + d.nx * 0.55 - d.nz * 1.3;
        const z = d.z + d.nz * 0.55 + d.nx * 1.3;
        m4.makeRotationY(Math.atan2(d.nx, d.nz) + (i % 2 ? 0.9 : -0.7)).setPosition(x, CURB, z);
        mesh.setMatrixAt(i, m4);
        mesh.setColorAt(i, c.setHex(CAT_COATS[i % CAT_COATS.length]));
        this.cats.push({ x, z, met: false });
      });
      mesh.castShadow = true;
      this.group.add(mesh);
    }
  }

  /** Cash in hand: every tip and errand reward earned, less what's been spent. */
  get cash() {
    return Math.max(0, this.store.get('delivery.tips', 0) + this.store.get('bonus', 0) - this.store.get('spent', 0));
  }

  update(dt, player) {
    this.near = null;
    for (const c of this.cats) {
      if (c.met || Math.hypot(player.pos.x - c.x, player.pos.z - c.z) > 1.8) continue;
      c.met = true;
      this.store.set('cats', this.store.get('cats', 0) + 1);
      COMIC.pop('MRRP', c.x, CURB + 0.8, c.z, { size: 0.6, cooldown: 2 });
    }
    if (player.fed > 0) player.fed = Math.max(0, player.fed - dt);
    if (player.mode !== 'walk' || player.roof) return;
    let bd = 2.4;
    for (const s of this.stops) {
      const d = Math.hypot(player.pos.x - s.sx, player.pos.z - s.sz);
      if (d < bd) {
        bd = d;
        this.near = s;
      }
    }
  }

  get prompt() {
    const s = this.near;
    return s ? `Press E for ${s.item} at ${title(s.name)} ($${s.price}, you have $${this.cash})` : '';
  }

  buy(player) {
    const s = this.near;
    if (!s) return null;
    if (this.cash < s.price) return `💸 Short on cash: do a delivery (J) first`;
    this.store.set('spent', this.store.get('spent', 0) + s.price);
    this.store.set('meals', this.store.get('meals', 0) + 1);
    player.fed = FED;
    player.stamina = 1;
    COMIC.pop(s.word, s.sx, 2.2, s.sz, { size: 1.1, cooldown: 1 });
    JUICE.hit(0.1);
    return `🍕 ${cap(s.item)} from ${title(s.name)}: you won't tire for a minute`;
  }
}

const title = (n) => n.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const cap = (t) => t[0].toUpperCase() + t.slice(1);
