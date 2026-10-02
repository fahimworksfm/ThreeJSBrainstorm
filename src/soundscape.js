// The neighborhood's real soundscape, from the last month of NYC 311 noise complaints (pooled into ~50 m
// cells by scripts/fetch-nyc.mjs): a party thumping behind the windows where people called one in, a
// jackhammer on the blocks with construction complaints (by day), horns, dogs, an ice cream truck's chimes.
// Every sound is synthesized like the rest of the game's audio, so there's nothing to download.

const HEAR = 110; // meters
// when each sound happens: [from, to] minute of the day (wrapping past midnight)
const HOURS = {
  party: [20 * 60, 3 * 60], construction: [7 * 60, 18 * 60], horn: [6 * 60, 23 * 60], dog: [6 * 60, 23 * 60],
  icecream: [12 * 60, 20 * 60], talk: [17 * 60, 2 * 60], engine: [0, 1440],
};
const awake = (kind, m) => {
  const [a, b] = HOURS[kind] ?? [0, 1440];
  return a <= b ? m >= a && m < b : m >= a || m < b;
};

export class Soundscape {
  /** noise: [[kind, lon, lat, count]]; proj: the real-map projection; audio: CityAudio. */
  constructor(noise, proj, audio) {
    this.audio = audio;
    this.spots = [];
    this.timer = 3;
    if (!noise?.length || !proj) return;
    for (const [kind, lon, lat, count] of noise) {
      const [x, z] = proj.toWorld(lat, lon);
      this.spots.push({ kind, x, z, w: Math.min(6, count) });
    }
  }

  get count() {
    return this.spots.length;
  }

  /** Every few seconds, maybe a sound from a nearby spot that's "on" at this hour. */
  update(dt, camera, minute) {
    const a = this.audio;
    if (!this.spots.length || !a.ctx || a.muted) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 3 + Math.random() * 5;
    const p = camera.position;
    const near = [];
    let total = 0;
    for (const s of this.spots) {
      const d = Math.hypot(s.x - p.x, s.z - p.z);
      if (d > HEAR || !awake(s.kind, minute)) continue;
      const w = s.w * (1 - d / HEAR);
      near.push([s, d, w]);
      total += w;
    }
    if (!near.length) return;
    let r = Math.random() * total;
    const [s, d] = near.find(([, , w]) => (r -= w) <= 0) ?? near[0];
    // left/right from where the camera looks
    const yaw = Math.atan2(-camera.matrixWorld.elements[8], -camera.matrixWorld.elements[10]);
    const ang = Math.atan2(s.x - p.x, s.z - p.z);
    const pan = Math.max(-1, Math.min(1, Math.sin(ang - yaw) * -1));
    const vol = Math.pow(1 - d / HEAR, 2);
    this[s.kind]?.(pan, vol);
  }

  out(pan, vol, muffle = 20000) {
    const ctx = this.audio.ctx;
    const g = ctx.createGain();
    g.gain.value = vol;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = muffle;
    const pn = ctx.createStereoPanner();
    pn.pan.value = pan;
    lp.connect(g).connect(pn).connect(this.audio.master);
    pn.connect(this.audio.reverb);
    return lp;
  }

  /** A party through the walls: a kick and a bass line, muffled, for a few bars. */
  party(pan, vol) {
    const ctx = this.audio.ctx;
    const dest = this.out(pan, vol * 0.5, 380);
    const t0 = ctx.currentTime;
    const beat = 60 / 118;
    const bass = [55, 55, 65.4, 49];
    for (let i = 0; i < 16; i++) {
      const t = t0 + i * beat;
      const k = ctx.createOscillator();
      const kg = ctx.createGain();
      k.frequency.setValueAtTime(110, t);
      k.frequency.exponentialRampToValueAtTime(40, t + 0.12);
      kg.gain.setValueAtTime(0.9, t);
      kg.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      k.connect(kg).connect(dest);
      k.start(t);
      k.stop(t + 0.3);
      const b = ctx.createOscillator();
      const bg = ctx.createGain();
      b.type = 'sawtooth';
      b.frequency.value = bass[Math.floor(i / 4) % 4];
      bg.gain.setValueAtTime(0.25, t + beat / 2);
      bg.gain.exponentialRampToValueAtTime(0.001, t + beat * 0.95);
      b.connect(bg).connect(dest);
      b.start(t + beat / 2);
      b.stop(t + beat);
    }
  }

  /** A jackhammer: bursts of hammering noise. */
  construction(pan, vol) {
    const a = this.audio;
    const ctx = a.ctx;
    const dest = this.out(pan, vol * 0.35, 3000);
    const t0 = ctx.currentTime;
    for (let burst = 0; burst < 3; burst++) {
      const start = t0 + burst * 1.3;
      for (let i = 0; i < 16; i++) {
        const t = start + i * 0.055;
        const src = ctx.createBufferSource();
        src.buffer = a.white;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 900 + Math.random() * 400;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.8, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
        src.connect(bp).connect(g).connect(dest);
        src.start(t, Math.random() * 2, 0.05);
      }
    }
  }

  horn(pan, vol) {
    this.audio.honk(pan, 0.12 * vol);
  }

  /** A dog: two or three barks. */
  dog(pan, vol) {
    const ctx = this.audio.ctx;
    const dest = this.out(pan, vol * 0.4, 2500);
    const t0 = ctx.currentTime;
    const n = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) {
      const t = t0 + i * 0.32;
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(520, t);
      o.frequency.exponentialRampToValueAtTime(260, t + 0.12);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 900;
      bp.Q.value = 1.4;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.001, t);
      g.gain.exponentialRampToValueAtTime(0.9, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      o.connect(bp).connect(g).connect(dest);
      o.start(t);
      o.stop(t + 0.2);
    }
  }

  /** An ice cream truck's music-box chimes, a few streets off. */
  icecream(pan, vol) {
    const ctx = this.audio.ctx;
    const dest = this.out(pan, vol * 0.18, 5000);
    const t0 = ctx.currentTime;
    const notes = [784, 659, 784, 880, 784, 659, 587, 659, 784, 659, 523];
    notes.forEach((f, i) => {
      const t = t0 + i * 0.22;
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.6, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      o.connect(g).connect(dest);
      o.start(t);
      o.stop(t + 0.4);
    });
  }

  /** People talking on the stoop: a murmur of voices. */
  talk(pan, vol) {
    const a = this.audio;
    const ctx = a.ctx;
    const dest = this.out(pan, vol * 0.3, 1800);
    const t0 = ctx.currentTime;
    for (let i = 0; i < 10; i++) {
      const t = t0 + i * 0.18 + Math.random() * 0.1;
      const src = ctx.createBufferSource();
      src.buffer = a.white;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 500 + Math.random() * 700;
      bp.Q.value = 6;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.001, t);
      g.gain.exponentialRampToValueAtTime(0.7, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      src.connect(bp).connect(g).connect(dest);
      src.start(t, Math.random() * 2, 0.25);
    }
  }

  /** An idling engine or a car alarm chirp. */
  engine(pan, vol) {
    const ctx = this.audio.ctx;
    const dest = this.out(pan, vol * 0.25, 1200);
    const t0 = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = 38;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, t0);
    g.gain.exponentialRampToValueAtTime(0.5, t0 + 0.4);
    g.gain.setValueAtTime(0.5, t0 + 2.6);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 3.2);
    o.connect(g).connect(dest);
    o.start(t0);
    o.stop(t0 + 3.3);
  }
}
