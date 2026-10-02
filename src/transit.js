// Live transit on the real map: walk up to a subway entrance and its countdown board shows the real next
// trains (MTA GTFS-realtime), and the real Citi Bike docks stand on the sidewalk with the bikes free right
// now; press E at one to ride. Both come through our own /api/transit (free feeds, no keys). Wherever that
// isn't there (local dev, the artifact copy), the board and docks simply don't appear.
import * as THREE from 'three';
import { CURB } from './config.js';

const ROUTE_COLORS = {
  1: '#ee352e', 2: '#ee352e', 3: '#ee352e', 4: '#00933c', 5: '#00933c', 6: '#00933c', '6X': '#00933c', 7: '#b933ad', '7X': '#b933ad',
  A: '#0039a6', C: '#0039a6', E: '#0039a6', B: '#ff6319', D: '#ff6319', F: '#ff6319', FX: '#ff6319', M: '#ff6319',
  G: '#6cbe45', J: '#996633', Z: '#996633', L: '#a7a9ac', N: '#fccc0a', Q: '#fccc0a', R: '#fccc0a', W: '#fccc0a',
  S: '#808183', GS: '#808183', FS: '#808183', H: '#808183', SI: '#0078c6', SIR: '#0078c6',
};
const DARK_TEXT = new Set(['N', 'Q', 'R', 'W']);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const bullet = (r) => {
  const name = r === 'GS' || r === 'FS' || r === 'H' ? 'S' : r.replace(/X$/, '');
  return `<i class="bullet" style="background:${ROUTE_COLORS[r] ?? '#808183'};color:${DARK_TEXT.has(name) ? '#111' : '#fff'}">${esc(name)}</i>`;
};

/** A Citi Bike dock: the blue kiosk and a row of docks, a bike in each one that has a bike right now. */
function buildDock(n, mats) {
  const g = new THREE.Group();
  const kiosk = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.7, 0.35).translate(0, 0.85, 0), mats.kiosk);
  kiosk.position.x = -0.9;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.26), mats.screen);
  screen.position.set(-0.9, 1.35, 0.18);
  g.add(kiosk, screen);
  const bikes = [];
  for (let i = 0; i < n; i++) {
    const x = i * 0.75;
    const post = new THREE.Mesh(mats.postGeo, mats.post);
    post.position.set(x, 0, 0);
    const bike = new THREE.Group();
    for (const z of [-0.5, 0.5]) {
      const wheel = new THREE.Mesh(mats.wheelGeo, mats.tire);
      wheel.rotation.y = Math.PI / 2;
      wheel.position.set(0, 0.33, z + 0.55);
      bike.add(wheel);
    }
    const frame = new THREE.Mesh(mats.frameGeo, mats.frame);
    frame.position.set(0, 0.62, 0.55);
    const bar = new THREE.Mesh(mats.barGeo, mats.post);
    bar.position.set(0, 0.95, 0.1);
    bike.add(frame, bar);
    bike.position.x = x;
    bikes.push(bike);
    g.add(post, bike);
  }
  return { group: g, bikes };
}

export class Transit {
  /** entrances: the station stairs in the world; city: the real-map world; def: the neighborhood. */
  constructor(entrances, city, nyc, def, hud) {
    this.hud = hud;
    this.def = def;
    this.city = city;
    this.group = new THREE.Group();
    this.entrances = entrances ?? [];
    this.docks = [];
    this.trains = [];
    this.near = null;
    this.on = !!city && !!def.ll;
    if (!this.on) return;
    // which real station each stair belongs to (the MTA's own entrance list carries the GTFS stop)
    const mta = (nyc?.entrances ?? []).filter((e) => e[5]).map(([lon, lat, name, , routes, stop]) => {
      const [x, z] = city.M.proj.toWorld(lat, lon);
      return { x, z, name, routes: String(routes).split(/\s+/).filter(Boolean), stop: String(stop).trim() };
    });
    for (const e of this.entrances) {
      let best = null;
      let bd = 260;
      for (const m of mta) {
        const d = Math.hypot(m.x - e.x, m.z - e.z);
        if (d < bd) {
          bd = d;
          best = m;
        }
      }
      if (best) Object.assign(e, { stop: best.stop, routes: best.routes, station: best.name });
    }
    this.stops = [...new Set(this.entrances.map((e) => e.stop).filter(Boolean))];
    this.base = new URLSearchParams(location.search).get('api') ?? './api/transit';
    this.timer = 3; // let the first frames settle
    this.fails = 0;
    this.mats = {
      kiosk: new THREE.MeshStandardMaterial({ color: 0x1a63b8, roughness: 0.5, metalness: 0.3 }),
      screen: new THREE.MeshBasicMaterial({ color: 0x9fe0ff }),
      post: new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.5, metalness: 0.6 }),
      frame: new THREE.MeshStandardMaterial({ color: 0x2d7fd6, roughness: 0.45, metalness: 0.2 }),
      tire: new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.9 }),
      postGeo: new THREE.BoxGeometry(0.12, 0.85, 0.12).translate(0, 0.42, 0),
      wheelGeo: new THREE.TorusGeometry(0.3, 0.045, 6, 16),
      frameGeo: new THREE.BoxGeometry(0.07, 0.07, 1.0),
      barGeo: new THREE.BoxGeometry(0.5, 0.05, 0.05),
    };
  }

  async poll() {
    const [lat, lon] = this.def.ll;
    const q = new URLSearchParams({ stops: this.stops.join(','), lat: String(lat), lon: String(lon), r: '900' });
    try {
      const r = await fetch(`${this.base}?${q}`, { signal: AbortSignal.timeout(15000) });
      if (!r.ok || !(r.headers.get('content-type') || '').includes('json')) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      // our clock may be off from the server's: count down from the server's own time
      this.skew = d.t * 1000 - Date.now();
      this.trains = Array.isArray(d.trains) ? d.trains : [];
      if (Array.isArray(d.bikes)) this.placeDocks(d.bikes);
      this.live = true;
      this.fails = 0;
    } catch (e) {
      if (this.live !== false) console.info(`transit: no live service (${e.message})`);
      this.live = false;
      this.timer = this.fails++ ? 120 : 15; // one quick retry, then much later
    }
  }

  placeDocks(list) {
    const { city } = this;
    const b = city.box;
    for (const s of list) {
      const old = this.docks.find((d) => d.id === s.id);
      if (old) {
        Object.assign(old, { bikes: s.bikes, ebikes: s.ebikes, docks: s.docks, renting: s.renting });
        this.fill(old);
        continue;
      }
      const [wx, wz] = city.M.proj.toWorld(s.lat, s.lon);
      if (wx < b.x0 + 8 || wx > b.x1 - 8 || wz < b.z0 + 8 || wz > b.z1 - 8) continue;
      const [x, z] = city.spot(wx, wz);
      // run the row along the street: find which way the road is and turn side-on to it
      let ang = 0;
      search: for (const r of [3, 5, 8]) {
        for (let k = 0; k < 16; k++) {
          const a = (k / 16) * Math.PI * 2;
          if (city.isRoad(x + Math.sin(a) * r, z + Math.cos(a) * r)) {
            ang = a;
            break search;
          }
        }
      }
      const n = Math.max(4, Math.min(10, Math.round((s.capacity || 19) / 3)));
      const dock = buildDock(n, this.mats);
      dock.group.position.set(x, CURB, z);
      dock.group.rotation.y = ang; // the row runs along the curb, bikes nose to the street
      dock.group.position.addScaledVector(new THREE.Vector3(1, 0, 0).applyEuler(dock.group.rotation), -n * 0.37);
      dock.group.traverse((o) => (o.castShadow = o.isMesh));
      this.group.add(dock.group);
      const d = { ...s, x, z, mesh: dock, n };
      this.docks.push(d);
      this.fill(d);
    }
  }

  fill(d) {
    const total = (d.bikes ?? 0) + (d.ebikes ?? 0);
    const shown = Math.round((Math.min(total, d.capacity || total) / Math.max(1, d.capacity || total)) * d.n);
    d.mesh.bikes.forEach((bk, i) => (bk.visible = i < (total ? Math.max(1, shown) : 0)));
  }

  minutes(at) {
    return Math.max(0, Math.round((at * 1000 - (Date.now() + (this.skew ?? 0))) / 60000));
  }

  /** The board for a station: the next two trains each way. */
  board(e) {
    const list = this.trains.filter((a) => a.stop === e.stop && a.at * 1000 > Date.now() + (this.skew ?? 0) - 20000);
    if (!list.length) return null;
    const row = (dir, label) => {
      const next = list.filter((a) => a.dir === dir).slice(0, 3);
      if (!next.length) return '';
      return `<div class="row"><span class="dir">${label}</span>${next.map((a) => `${bullet(a.route)}<b>${this.minutes(a.at) || 'now'}</b><small>${this.minutes(a.at) ? 'min' : ''}</small>`).join('')}</div>`;
    };
    return `<div class="head">${esc(e.station ?? e.name)} <span class="live">● LIVE</span></div>${row('N', '▲ Uptown')}${row('S', '▼ Downtown')}`;
  }

  /** Every frame: poll the feeds now and then, and show the board or the dock you're standing at. */
  update(dt, player, nearEntrance) {
    if (!this.on) return;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 30;
      this.poll();
    }
    this.near = null;
    let html = null;
    // the board of the closest stairs you're standing by
    let ent = nearEntrance?.stop ? nearEntrance : null;
    if (!ent && this.live) {
      let bd = 7;
      for (const e of this.entrances) {
        const d = Math.hypot(player.pos.x - e.x, player.pos.z - e.z);
        if (e.stop && d < bd) {
          bd = d;
          ent = e;
        }
      }
    }
    if (ent && this.live) html = this.board(ent);
    if (!html && player.mode === 'walk' && !player.roof) {
      for (const d of this.docks) {
        if (Math.hypot(player.pos.x - d.x, player.pos.z - d.z) < (d.n * 0.75) / 2 + 2) this.near = d;
      }
      const d = this.near;
      if (d) {
        const free = d.renting === false ? '<b>Closed right now</b>' : `<b>${d.bikes ?? '?'}</b> bikes · <b>${d.ebikes ?? '?'}</b> e-bikes · <b>${d.docks ?? '?'}</b> open docks`;
        html = `<div class="head citi">Citi Bike · ${esc(d.name)} <span class="live">● LIVE</span></div><div class="row">${free}</div>`;
      }
    }
    this.hud.setBoard(html);
  }

  /** E at a dock: unlock a bike if there's one. */
  rent() {
    const d = this.near;
    if (!d) return null;
    const total = (d.bikes ?? 0) + (d.ebikes ?? 0);
    if (!total || d.renting === false) return 'No bikes at this dock right now';
    if (d.bikes > 0) d.bikes--;
    else d.ebikes--;
    this.fill(d);
    return `🚲 Unlocked a Citi Bike at ${d.name}`;
  }
}
