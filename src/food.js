// Real food stops: the actual pizzerias, delis, cafés and bakeries on the map (OpenStreetMap). Walk up and
// press E to buy something with what deliveries have earned; for a minute after, running doesn't tire you.
import { COMIC, JUICE } from './comicfx.js';

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
  }

  /** Cash in hand: every tip earned, less what's been spent. */
  get cash() {
    return Math.max(0, this.store.get('delivery.tips', 0) - this.store.get('spent', 0));
  }

  update(dt, player) {
    this.near = null;
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
