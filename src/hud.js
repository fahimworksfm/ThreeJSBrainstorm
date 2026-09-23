import {
  NS_W, EW_W, SIDEWALK, NX, NZ, colX, rowZ, PITCH_X, PITCH_Z, NS_ROADS, EW_ROADS, PARK_Z1, EL_COL,
} from './config.js';

const clampI = (v, a, b) => Math.max(a, Math.min(b, v));

/** "31st St & 30th Ave", "Crescent St · 24th Ave – 25th Ave", ... */
export function describeLocation(x, z) {
  if (z < PARK_Z1) return 'Astoria Park';
  if (x < colX(0) - NS_W / 2) return 'East River Promenade';
  const i = clampI(Math.round((x - colX(0)) / PITCH_X), 0, NX - 1);
  const j = clampI(Math.round((z - rowZ(0)) / PITCH_Z), 0, NZ - 1);
  const onStreet = Math.abs(x - colX(i)) < NS_W / 2 + SIDEWALK + 0.5;
  const onAve = Math.abs(z - rowZ(j)) < EW_W / 2 + SIDEWALK + 0.5;
  const el = onStreet && i === EL_COL ? '  ·  under the el' : '';
  if (onStreet && onAve) return `${NS_ROADS[i]} & ${EW_ROADS[j]}${el}`;
  if (onStreet) {
    const j0 = Math.floor((z - rowZ(0)) / PITCH_Z);
    const a = EW_ROADS[j0];
    const b = EW_ROADS[j0 + 1];
    return `${NS_ROADS[i]}  ·  ${a && b ? `${a} – ${b}` : `south of ${EW_ROADS[NZ - 1]}`}${el}`;
  }
  if (onAve) {
    const i0 = Math.floor((x - colX(0)) / PITCH_X);
    const a = NS_ROADS[i0];
    const b = NS_ROADS[i0 + 1];
    return `${EW_ROADS[j]}  ·  ${a && b ? `${a} – ${b}` : `east of ${NS_ROADS[NX - 1]}`}`;
  }
  return 'Astoria';
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
    };
    this.lastLocation = '';
    this.lastClock = '';
    this.subTimer = null;
    this.toastTimer = null;
  }

  setLocation(text) {
    if (text === this.lastLocation) return;
    this.lastLocation = text;
    this.el.location.textContent = text;
  }

  /** Game clock: starts at 2:13 AM, one minute passes every six seconds. */
  setClock(t) {
    const minutes = 2 * 60 + 13 + Math.floor(t / 6);
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
  }

  showMemory(title, text, ms = 10000) {
    this.el.subtitleTitle.textContent = title;
    this.el.subtitleText.textContent = text;
    this.el.subtitle.classList.add('show');
    clearTimeout(this.subTimer);
    this.subTimer = setTimeout(() => this.el.subtitle.classList.remove('show'), ms);
  }

  toast(msg) {
    this.el.toast.textContent = msg;
    this.el.toast.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.el.toast.classList.remove('show'), 1600);
  }

  setJournal(entries) {
    const j = this.el.journal;
    j.replaceChildren();
    if (!entries.length) {
      const p = document.createElement('p');
      p.className = 'empty';
      p.textContent = 'Nothing yet. Follow the blue lights.';
      j.append(p);
      return;
    }
    for (const e of entries) {
      const item = document.createElement('div');
      item.className = 'entry';
      const h = document.createElement('h4');
      h.textContent = e.title;
      const p = document.createElement('p');
      p.textContent = e.text;
      item.append(h, p);
      j.append(item);
    }
  }

  setFps(v) {
    this.el.fps.textContent = v ? `${v} fps` : '';
  }

  toggle() {
    this.el.hud.classList.toggle('hidden');
  }
}
