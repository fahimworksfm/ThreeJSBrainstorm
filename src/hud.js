import { D } from './config.js';

const clampI = (v, a, b) => Math.max(a, Math.min(b, v));

/** "31st St & 30th Ave", "Crescent St · 24th Ave – 25th Ave", ... */
export function describeLocation(x, z, opts = {}) {
  const { nsW, ewW, sidewalk, NX, NZ, colX, rowZ, PITCH_X, PITCH_Z, nsRoads, ewRoads } = D;
  if (D.parkZ1 !== null && z < D.parkZ1) return D.parkName;
  if (D.riverX !== null && x < colX(0) - nsW / 2) return D.riverName;
  const i = clampI(Math.round((x - colX(0)) / PITCH_X), 0, NX - 1);
  const j = clampI(Math.round((z - rowZ(0)) / PITCH_Z), 0, NZ - 1);
  const onStreet = Math.abs(x - colX(i)) < nsW / 2 + sidewalk + 0.5;
  const onAve = Math.abs(z - rowZ(j)) < ewW / 2 + sidewalk + 0.5;
  const el = D.el;
  const under = !el.underground && (el.axis === 'ns' ? onStreet && i === el.index : onAve && j === el.index) ? `  ·  ${el.underLabel}` : '';
  if (onStreet && onAve) return `${nsRoads[i]} & ${ewRoads[j]}${under}`;
  if (onStreet) {
    const j0 = Math.floor((z - rowZ(0)) / PITCH_Z);
    const a = ewRoads[j0];
    const b = ewRoads[j0 + 1];
    const between = a && b ? `${a} – ${b}` : j0 < 0 ? `north of ${ewRoads[0]}` : `south of ${ewRoads[NZ - 1]}`;
    return `${nsRoads[i]}  ·  ${between}${under}`;
  }
  if (onAve) {
    const i0 = Math.floor((x - colX(0)) / PITCH_X);
    const a = nsRoads[i0];
    const b = nsRoads[i0 + 1];
    const between = a && b ? `${a} – ${b}` : i0 < 0 ? `west of ${nsRoads[0]}` : `east of ${nsRoads[NX - 1]}`;
    return `${ewRoads[j]}  ·  ${between}${under}`;
  }
  if (opts.roof) return `Rooftop over ${nsRoads[i]} & ${ewRoads[j]}`;
  const c = Math.floor((x - colX(0)) / PITCH_X);
  const r = Math.floor((z - rowZ(0)) / PITCH_Z);
  const pb = (D.parkBlocks || []).findIndex(([pc, pr]) => pc === c && pr === r);
  if (pb >= 0) return D.parkBlockNames[pb];
  return D.name;
}

export class HUD {
  constructor() {
    this.el = {
      location: document.getElementById('location'),
      clock: document.getElementById('clock'),
      count: document.getElementById('count'),
      subtitle: document.getElementById('subtitle'),
      subtitleTitle: document.getElementById('subtitle-title'),
      subtitleText: document.getElementById('subtitle-text'),
      toast: document.getElementById('toast'),
      journal: document.getElementById('journal'),
      fps: document.getElementById('fps'),
      hud: document.getElementById('hud'),
      district: document.getElementById('district'),
      prompt: document.getElementById('prompt'),
      ride: document.getElementById('ride'),
      rideName: document.getElementById('ride-name'),
      rideSpeed: document.getElementById('ride-speed'),
    };
    this.lastLocation = '';
    this.lastClock = '';
    this.subTimer = null;
    this.toastTimer = null;
  }

  setDistrict(name) {
    this.el.district.textContent = name;
    this.lastLocation = '';
  }

  setPrompt(text) {
    if (text === this.lastPrompt) return;
    this.lastPrompt = text;
    // "Press E to ..." gets a key cap, like a console help box
    const safe = (text || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    this.el.prompt.innerHTML = safe.replace(/^Press (\w+) /, '<kbd>$1</kbd> ');
    this.el.prompt.classList.toggle('show', !!text);
  }

  /** Which ride you're on, for the HUD chip. */
  setRide(name, mode) {
    if (this.el.ride.dataset.mode === mode && this.el.rideName.textContent === name) return;
    this.el.ride.dataset.mode = mode;
    this.el.rideName.textContent = name;
  }

  setSpeed(mph) {
    const v = mph > 0.5 ? `${Math.round(mph)} mph` : '';
    if (v === this.lastSpeed) return;
    this.lastSpeed = v;
    this.el.rideSpeed.textContent = v;
  }

  /** Big street name, with the cross streets and extras on a smaller line under it. */
  setLocation(text) {
    if (text === this.lastLocation) return;
    this.lastLocation = text;
    const [main, ...rest] = text.split('·').map((t) => t.trim()).filter(Boolean);
    this.el.location.textContent = main ?? '';
    const sub = document.getElementById('sublocation');
    if (sub) sub.textContent = rest.join('  ·  ');
  }

  /** Game clock: one minute passes every six seconds. t is in seconds. */
  setClock(t) {
    const minutes = Math.floor(t / 6);
    const h = Math.floor(minutes / 60) % 24;
    const m = minutes % 60;
    const text = `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
    if (text !== this.lastClock) {
      this.lastClock = text;
      this.el.clock.textContent = text;
    }
  }

  setCount(n, total) {
    this.el.count.textContent = `${n} / ${total}`;
    document.getElementById('objective-count').textContent = `${n} / ${total}`;
    // one segment per memory
    const bar = document.getElementById('progress');
    if (bar) {
      if (bar.children.length !== total) {
        bar.replaceChildren(...Array.from({ length: total }, () => document.createElement('span')));
        bar.style.setProperty('--n', total);
      }
      [...bar.children].forEach((seg, k) => seg.classList.toggle('on', k < n));
    }
  }

  showMemory(title, text, ms = 10000) {
    this.el.subtitleTitle.textContent = title;
    this.el.subtitleText.textContent = text;
    this.el.subtitle.classList.add('show');
    clearTimeout(this.subTimer);
    this.subTimer = setTimeout(() => this.el.subtitle.classList.remove('show'), ms);
  }

  /** Big comic splash in the middle of the screen: MEMORY FOUND, 3 / 8. */
  banner(title, sub = '') {
    const b = document.getElementById('banner');
    if (!b) return;
    b.querySelector('.b-title').textContent = title;
    const s = b.querySelector('.b-sub');
    s.textContent = sub;
    s.style.display = sub ? '' : 'none';
    b.classList.remove('show');
    void b.offsetWidth; // restart the animation
    b.classList.add('show');
  }

  toast(msg) {
    this.el.toast.textContent = msg;
    this.el.toast.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.el.toast.classList.remove('show'), 1600);
  }

  /** groups: [{ name, entries: [{title, text}], total }] */
  setJournal(groups) {
    const j = this.el.journal;
    j.replaceChildren();
    for (const g of groups) {
      const h = document.createElement('h5');
      h.textContent = `${g.name}  ·  ${g.entries.length} / ${g.total}`;
      j.append(h);
      if (!g.entries.length) {
        const p = document.createElement('p');
        p.className = 'empty';
        p.textContent = 'Nothing here yet. Follow the blue lights.';
        j.append(p);
      }
      for (const e of g.entries) {
        const item = document.createElement('div');
        item.className = 'entry';
        const t = document.createElement('h4');
        t.textContent = e.title;
        const p = document.createElement('p');
        p.textContent = e.text;
        item.append(t, p);
        j.append(item);
      }
    }
  }

  setFps(v) {
    this.el.fps.textContent = v ? `${v} fps` : '';
  }

  toggle() {
    this.el.hud.classList.toggle('hidden');
  }
}
