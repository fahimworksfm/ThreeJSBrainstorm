// Today's errands: three small things to do around the city, the same three for everyone on a given New York
// day, picked from what the game already keeps count of. Each pays $10 into the wallet (food, cabs).
import { stats, nycDate } from './achievements.js';
import { JUICE } from './comicfx.js';

const POOL = [
  { id: 'eat', text: 'Grab a bite at a real food spot', stat: 'meals', need: 1 },
  { id: 'cab', text: 'Ride a yellow cab (T)', stat: 'cabs', need: 1 },
  { id: 'tag', text: 'Put up a piece on a wall', stat: 'tags', need: 1 },
  { id: 'plaques', text: 'Read 2 landmark plaques', stat: 'plaques', need: 2 },
  { id: 'memory', text: 'Find a memory', stat: 'memories', need: 1 },
  { id: 'deliver', text: 'Make a delivery (J)', stat: 'runs', need: 1 },
  { id: 'photo', text: 'Take a challenge photo (P)', stat: 'photos', need: 1 },
  { id: 'combo', text: 'Land a x3 bike combo', stat: 'combos3', need: 1 },
  { id: 'postcard', text: "Solve today's postcard (K)", stat: 'dailies', need: 1 },
];
const REWARD = 10;

export class Errands {
  constructor(store, hud, districts) {
    this.store = store;
    this.hud = hud;
    this.districts = districts;
    this.next = 0;
    this.load();
  }

  /** Today's three, with where every count stood when the day began. */
  load() {
    this.today = nycDate();
    const key = `errands.${this.today}`;
    let day = this.store.get(key, null);
    if (!day) {
      let h = [...this.today].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 5);
      const pool = [...POOL];
      const picks = [];
      while (picks.length < 3) {
        h = (h * 1103515245 + 12345) >>> 0;
        picks.push(pool.splice(h % pool.length, 1)[0].id);
      }
      const s = stats(this.store, this.districts);
      day = { picks, base: Object.fromEntries(picks.map((id) => [id, s[POOL.find((q) => q.id === id).stat] ?? 0])), done: [] };
      this.store.set(key, day);
    }
    this.key = key;
    this.day = day;
  }

  /** [{ text, have, need, done }] for the menu. */
  list() {
    const s = stats(this.store, this.districts);
    return this.day.picks.map((id) => {
      const q = POOL.find((x) => x.id === id);
      const have = Math.min(q.need, Math.max(0, (s[q.stat] ?? 0) - (this.day.base[id] ?? 0)));
      return { id, text: q.text, have, need: q.need, done: this.day.done.includes(id) };
    });
  }

  /** Every couple of seconds: pay out what's newly done (and roll over at midnight). */
  update(dt, el) {
    // a real-time clock: errands are about the day, not game time (which pauses and slows)
    const now = performance.now();
    if (now < this.next) return;
    this.next = now + 2000;
    if (nycDate() !== this.today) this.load();
    if (el) this.render(el);
    for (const q of this.list()) {
      if (q.done || q.have < q.need) continue;
      this.day.done.push(q.id);
      this.store.set('bonus', this.store.get('bonus', 0) + REWARD);
      const all = this.day.done.length === this.day.picks.length;
      if (all) this.store.set('errandDays', this.store.get('errandDays', 0) + 1);
      this.store.set(this.key, this.day);
      this.hud.toast(all ? `✅ All of today's errands done! +$${REWARD}` : `✅ Errand done: ${q.text} (+$${REWARD})`);
      JUICE.hit(0.08);
      return;
    }
  }

  render(el) {
    el.replaceChildren();
    for (const q of this.list()) {
      const row = document.createElement('div');
      row.className = `errand${q.done ? ' done' : ''}`;
      row.textContent = `${q.done ? '✅' : '⬜'} ${q.text}${q.need > 1 ? ` (${q.have}/${q.need})` : ''}`;
      el.append(row);
    }
  }
}
