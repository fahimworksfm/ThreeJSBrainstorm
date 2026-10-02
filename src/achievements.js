// Badges for the things you do around the city, worked out from what the game already saves (memories,
// photos, tags, plaques, deliveries, neighborhoods visited), plus a daily "Where am I?" postcard: a snapshot
// of a real storefront somewhere in the neighborhood; walk there to solve it. One a day, with a streak.
import { COMIC, JUICE } from './comicfx.js';

const ALL = 'nightwalker.';

/** Everything the badges count, read from saved progress. */
export function stats(store, districts) {
  const s = { memories: 0, photos: 0, tags: 0, tagHoods: 0, plaques: 0, visited: new Set(store.get('visited', [])) };
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k?.startsWith(ALL)) continue;
    let v;
    try {
      v = JSON.parse(localStorage.getItem(k));
    } catch {
      continue;
    }
    const key = k.slice(ALL.length);
    if (key.endsWith('.collected') && Array.isArray(v)) s.memories += v.length;
    else if (key.startsWith('photos.') && v) s.photos += Object.keys(v).length;
    else if (key.startsWith('tags.') && v) {
      const n = Object.values(v).filter((t) => !t?.crew).length; // walls a crew holds aren't yours
      s.tags += n;
      if (n) s.tagHoods++;
    } else if (key.startsWith('plaques.') && Array.isArray(v)) s.plaques += v.length;
  }
  s.boroughs = new Set([...s.visited].map((id) => districts[id]?.borough).filter(Boolean)).size;
  s.runs = store.get('delivery.runs', 0);
  s.tips = store.get('delivery.tips', 0);
  s.citibike = store.get('citibike', 0);
  s.combo = store.get('bestCombo', 0);
  s.dailies = store.get('daily.count', 0);
  s.streak = store.get('daily.streak', 0);
  s.crews = store.get('crews.covered', 0);
  s.meals = store.get('meals', 0);
  s.cabs = store.get('cabs', 0);
  s.errandDays = store.get('errandDays', 0);
  s.combos3 = store.get('combos3', 0);
  return s;
}

export const BADGES = [
  { id: 'memory', icon: '💙', name: 'First memory', desc: 'Find a memory', test: (s) => s.memories >= 1 },
  { id: 'memory25', icon: '🧠', name: 'Total recall', desc: 'Find 25 memories', test: (s) => s.memories >= 25 },
  { id: 'hoods5', icon: '🗽', name: 'Out and about', desc: 'Walk in 5 neighborhoods', test: (s) => s.visited.size >= 5 },
  { id: 'boroughs', icon: '🌉', name: 'Five boroughs', desc: 'Visit every borough', test: (s) => s.boroughs >= 5 },
  { id: 'plaques', icon: '📜', name: 'Block historian', desc: 'Read 5 landmark plaques', test: (s) => s.plaques >= 5 },
  { id: 'tag', icon: '🎨', name: 'Writer', desc: 'Tag a wall', test: (s) => s.tags >= 1 },
  { id: 'allcity', icon: '🚇', name: 'All-city', desc: 'Get up in 5 neighborhoods', test: (s) => s.tagHoods >= 5 },
  { id: 'crews', icon: '🧯', name: 'King of the block', desc: 'Cover 5 rival crew tags', test: (s) => s.crews >= 5 },
  { id: 'photos', icon: '📸', name: 'Shutterbug', desc: 'Take 10 challenge photos', test: (s) => s.photos >= 10 },
  { id: 'courier', icon: '🛵', name: 'Courier', desc: 'Make 10 deliveries', test: (s) => s.runs >= 10 },
  { id: 'tips', icon: '💵', name: 'Big tipper', desc: 'Earn $100 in tips', test: (s) => s.tips >= 100 },
  { id: 'errands', icon: '✅', name: 'Busy day', desc: "Finish all three of a day's errands", test: (s) => s.errandDays >= 1 },
  { id: 'meals', icon: '🍕', name: 'Regular customer', desc: 'Eat at 5 real spots', test: (s) => s.meals >= 5 },
  { id: 'citibike', icon: '🚲', name: 'Citi Biker', desc: 'Unlock a real Citi Bike', test: (s) => s.citibike >= 1 },
  { id: 'combo', icon: '🤸', name: 'Trick line', desc: 'Land a x5 bike combo', test: (s) => s.combo >= 5 },
  { id: 'daily', icon: '📮', name: 'Where am I?', desc: 'Solve a daily postcard', test: (s) => s.dailies >= 1 },
  { id: 'streak', icon: '🔥', name: 'Regular', desc: 'Solve the postcard 3 days running', test: (s) => s.streak >= 3 },
  { id: 'owl', icon: '🦉', name: 'Night owl', desc: 'Be out walking at 3 a.m.', test: (s, live) => live.minute >= 180 && live.minute < 240 },
  { id: 'golden', icon: '🌇', name: 'Golden hour', desc: 'Catch the sunset on a rooftop', test: (s, live) => live.roof && live.golden },
];

/** Today's date in New York, like "2026-10-02". */
export function nycDate(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(d);
}

export class Achievements {
  constructor(store, hud, districts) {
    this.store = store;
    this.hud = hud;
    this.districts = districts;
    this.got = new Set(store.get('badges', []));
    this.timer = 2;
  }

  visit(id) {
    const v = new Set(this.store.get('visited', []));
    if (!v.has(id)) this.store.set('visited', [...v, id]);
  }

  bump(key, by = 1) {
    this.store.set(key, this.store.get(key, 0) + by);
  }

  /** Check every couple of seconds; live: { minute, roof, golden } right now. */
  update(dt, live) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 2;
    const s = stats(this.store, this.districts);
    for (const b of BADGES) {
      if (this.got.has(b.id) || !b.test(s, live)) continue;
      this.got.add(b.id);
      this.store.set('badges', [...this.got]);
      this.hud.toast(`🏅 Badge: ${b.icon} ${b.name}`);
      JUICE.hit(0.12);
      return; // one at a time
    }
  }

  /** The badge list for the menu. */
  render(el) {
    el.replaceChildren();
    const s = stats(this.store, this.districts);
    for (const b of BADGES) {
      const row = document.createElement('div');
      row.className = `badge${this.got.has(b.id) ? ' got' : ''}`;
      row.innerHTML = '<span class="icon"></span><span><b></b><small></small></span>';
      row.querySelector('.icon').textContent = b.icon;
      row.querySelector('b').textContent = b.name;
      row.querySelector('small').textContent = b.desc;
      el.append(row);
    }
    const p = document.createElement('p');
    p.className = 'badge-sum';
    p.textContent = `${this.got.size} / ${BADGES.length} badges · ${s.visited.size} neighborhoods · postcard streak ${s.streak}`;
    el.prepend(p);
  }
}

/**
 * The daily postcard for this neighborhood: a seeded pick of a real storefront, the same for everyone today.
 * snap(spot) renders the view and returns a data URL; boards: [{ name, x, z, nx, nz }].
 */
export class Daily {
  constructor(store, hud, id, boards, describe) {
    this.store = store;
    this.hud = hud;
    this.today = nycDate();
    this.key = `daily.${this.today}.${id}`;
    this.target = null;
    if (!boards?.length) return;
    const h = [...(this.today + id)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 17);
    const b = boards[h % boards.length];
    this.target = { ...b, where: describe?.(b.x + b.nx * 3, b.z + b.nz * 3) ?? '' };
    this.solved = !!store.get(this.key, false);
    this.heat = '';
  }

  /** The camera spot for the postcard: across the street, looking back at the sign. */
  view() {
    const t = this.target;
    return { from: [t.x + t.nx * 11, 1.75, t.z + t.nz * 11], at: [t.x, 3.2, t.z] };
  }

  update(dt, player) {
    const t = this.target;
    if (!t || this.solved || !this.image) return;
    const d = Math.hypot(player.pos.x - (t.x + t.nx * 2), player.pos.z - (t.z + t.nz * 2));
    this.heat = d < 30 ? '🔥 Hot' : d < 80 ? '♨️ Warm' : d < 180 ? '🌤 Cool' : '🧊 Cold';
    if (d < 9) {
      this.solved = true;
      this.store.set(this.key, true);
      const last = this.store.get('daily.last', '');
      const yesterday = nycDate(new Date(Date.now() - 86400000));
      if (last !== this.today) {
        this.store.set('daily.streak', last === yesterday ? this.store.get('daily.streak', 0) + 1 : 1);
        this.store.set('daily.count', this.store.get('daily.count', 0) + 1);
        this.store.set('daily.last', this.today);
      }
      COMIC.pop('FOUND IT!', t.x + t.nx * 2, 3, t.z + t.nz * 2, { size: 1.3, cooldown: 2 });
      JUICE.hit(0.25);
      this.hud.toast(`📮 Postcard solved${t.name ? `: ${t.name}` : ''}! Streak ${this.store.get('daily.streak', 1)} 🔥`);
      return 'solved';
    }
    return null;
  }
}
