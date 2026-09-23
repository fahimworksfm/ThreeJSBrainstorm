import { range } from './random.js';

/**
 * All sound is synthesized with Web Audio: no files to download.
 * Rain, city hum, footsteps, the el's rumble, distant sirens and horns, a chime.
 */
export class CityAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.rainOn = true;
    this.sirenT = range(15, 30);
    this.hornT = range(6, 14);
  }

  start() {
    if (this.ctx) {
      this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    this.master.connect(ctx.destination);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(3, 2.4);
    const wet = ctx.createGain();
    wet.gain.value = 0.45;
    this.reverb.connect(wet).connect(this.master);

    this.white = this.noise(3, false);
    const brown = this.noise(4, true);

    const rain = ctx.createBufferSource();
    rain.buffer = this.white;
    rain.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 600;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 7000;
    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = this.rainOn ? 0.16 : 0;
    rain.connect(hp).connect(lp).connect(this.rainGain).connect(this.master);
    rain.start();

    const hum = ctx.createBufferSource();
    hum.buffer = brown;
    hum.loop = true;
    const hl = ctx.createBiquadFilter();
    hl.type = 'lowpass';
    hl.frequency.value = 200;
    const hg = ctx.createGain();
    hg.gain.value = 0.35;
    hum.connect(hl).connect(hg).connect(this.master);
    hum.start();

    // elevated train: low rumble plus metallic clatter, both driven by proximity
    const rumble = ctx.createBufferSource();
    rumble.buffer = brown;
    rumble.loop = true;
    const rl = ctx.createBiquadFilter();
    rl.type = 'lowpass';
    rl.frequency.value = 320;
    this.rumbleGain = ctx.createGain();
    this.rumbleGain.gain.value = 0;
    rumble.connect(rl).connect(this.rumbleGain).connect(this.master);
    this.rumbleGain.connect(this.reverb);
    rumble.start();
    const clatter = ctx.createBufferSource();
    clatter.buffer = this.white;
    clatter.loop = true;
    const cb = ctx.createBiquadFilter();
    cb.type = 'bandpass';
    cb.frequency.value = 1800;
    cb.Q.value = 0.8;
    this.clatterGain = ctx.createGain();
    this.clatterGain.gain.value = 0;
    clatter.connect(cb).connect(this.clatterGain).connect(this.master);
    clatter.start();
    this.clatterPhase = 0;

    // brake squeal
    this.squeal = ctx.createOscillator();
    this.squeal.type = 'sine';
    this.squeal.frequency.value = 2400;
    this.squealGain = ctx.createGain();
    this.squealGain.gain.value = 0;
    this.squeal.connect(this.squealGain).connect(this.master);
    this.squealGain.connect(this.reverb);
    this.squeal.start();

    // jet engines overhead: a low roar plus a thin turbine whine
    const jet = ctx.createBufferSource();
    jet.buffer = brown;
    jet.loop = true;
    const jl = ctx.createBiquadFilter();
    jl.type = 'lowpass';
    jl.frequency.value = 700;
    this.jetGain = ctx.createGain();
    this.jetGain.gain.value = 0;
    jet.connect(jl).connect(this.jetGain).connect(this.master);
    this.jetGain.connect(this.reverb);
    jet.start();
    const whine = ctx.createOscillator();
    whine.type = 'sine';
    whine.frequency.value = 3100;
    this.whineGain = ctx.createGain();
    this.whineGain.gain.value = 0;
    whine.connect(this.whineGain).connect(this.master);
    whine.start();
  }

  /** Engine note for the motorcycle and SUV, freewheel ticking for the bicycle. */
  setEngine(mode) {
    this.engineMode = mode;
  }

  engine(mode, load, throttle) {
    const ctx = this.ctx;
    if (!ctx) return;
    if (!this.engineOsc) {
      this.engineOsc = [ctx.createOscillator(), ctx.createOscillator()];
      this.engineOsc[0].type = 'sawtooth';
      this.engineOsc[1].type = 'square';
      this.engineFilter = ctx.createBiquadFilter();
      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.value = 600;
      this.engineGain = ctx.createGain();
      this.engineGain.gain.value = 0;
      for (const o of this.engineOsc) {
        o.connect(this.engineFilter);
        o.start();
      }
      this.engineFilter.connect(this.engineGain).connect(this.master);
      this.tick = 0;
    }
    const now = ctx.currentTime;
    const on = mode === 'moto' || mode === 'suv';
    const base = mode === 'moto' ? 42 : 28;
    const top = mode === 'moto' ? 170 : 85;
    // fake gear changes: rpm climbs then drops back within each gear
    const gear = (load * 4) % 1;
    const rpm = base + (top - base) * (0.25 + 0.75 * (load < 0.05 ? 0 : 0.35 + gear * 0.65));
    this.engineOsc[0].frequency.setTargetAtTime(rpm, now, 0.08);
    this.engineOsc[1].frequency.setTargetAtTime(rpm * 0.5, now, 0.08);
    this.engineFilter.frequency.setTargetAtTime(300 + Math.max(0, throttle) * 900 + load * 600, now, 0.1);
    this.engineGain.gain.setTargetAtTime(on ? (mode === 'moto' ? 0.05 : 0.035) * (0.6 + Math.max(0, throttle) * 0.6) : 0, now, 0.15);
    if (mode === 'bike' && load > 0.05 && throttle <= 0) {
      this.tick += load * 30 * 0.016;
      if (this.tick > 1) {
        this.tick = 0;
        this.click(0.02);
      }
    }
  }

  click(vol) {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.white;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 4200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);
    src.connect(bp).connect(g).connect(this.master);
    src.start(now, Math.random(), 0.04);
  }

  /** Bumping into a wall. */
  thud(amount) {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(90, now);
    o.frequency.exponentialRampToValueAtTime(40, now + 0.25);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.25 * amount, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
    o.connect(g).connect(this.master);
    g.connect(this.reverb);
    o.start(now);
    o.stop(now + 0.35);
    this.click(0.15 * amount);
  }

  /** Long Island Rail Road style chime horn: two long blasts. */
  horn(level) {
    const ctx = this.ctx;
    if (!ctx || level <= 0.02) return;
    const now = ctx.currentTime;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2200;
    const g = ctx.createGain();
    g.gain.value = 0;
    for (const [a, b] of [[0, 1.3], [1.6, 2.4]]) {
      g.gain.setValueAtTime(0, now + a);
      g.gain.linearRampToValueAtTime(0.05 * level, now + a + 0.08);
      g.gain.setValueAtTime(0.05 * level, now + b - 0.1);
      g.gain.linearRampToValueAtTime(0, now + b);
    }
    for (const f of [311, 370, 415, 494, 622]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.connect(lp);
      o.start(now);
      o.stop(now + 2.6);
    }
    lp.connect(g).connect(this.master);
    g.connect(this.reverb);
  }

  noise(seconds, brown) {
    const ctx = this.ctx;
    const len = Math.floor(seconds * ctx.sampleRate);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else d[i] = w;
    }
    return buf;
  }

  impulse(seconds, decay) {
    const ctx = this.ctx;
    const len = Math.floor(seconds * ctx.sampleRate);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  footstep(wet, sprint) {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.white;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = wet ? range(1400, 2200) : range(700, 1000);
    bp.Q.value = 1.1;
    const g = ctx.createGain();
    const peak = (sprint ? 0.32 : 0.22) * (wet ? 1.1 : 1);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(peak, now + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, now + (wet ? 0.16 : 0.1));
    src.connect(bp).connect(g).connect(this.master);
    g.connect(this.reverb);
    src.start(now, Math.random() * 2, 0.2);
  }

  honk(pan = 0, vol = 0.1) {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1800;
    const g = ctx.createGain();
    g.gain.value = 0;
    const pattern = Math.random() < 0.5 ? [[0, 0.35]] : [[0, 0.14], [0.22, 0.5]];
    for (const [a, b] of pattern) {
      g.gain.setValueAtTime(0, now + a);
      g.gain.linearRampToValueAtTime(vol, now + a + 0.02);
      g.gain.setValueAtTime(vol, now + b - 0.03);
      g.gain.linearRampToValueAtTime(0, now + b);
    }
    for (const f of [405, 510]) {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = f;
      o.connect(lp);
      o.start(now);
      o.stop(now + 0.8);
    }
    lp.connect(g).connect(panner).connect(this.master);
    panner.connect(this.reverb);
  }

  siren() {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    const dur = range(8, 13);
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = 950;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = range(0.18, 0.3);
    const depth = ctx.createGain();
    depth.gain.value = 380;
    lfo.connect(depth).connect(o.frequency);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1300;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.03, now + dur * 0.45);
    g.gain.linearRampToValueAtTime(0, now + dur);
    const p = ctx.createStereoPanner();
    const from = range(-1, 1);
    p.pan.setValueAtTime(from, now);
    p.pan.linearRampToValueAtTime(-from * 0.6, now + dur);
    o.connect(lp).connect(g).connect(p);
    p.connect(this.master);
    p.connect(this.reverb);
    o.start(now);
    lfo.start(now);
    o.stop(now + dur);
    lfo.stop(now + dur);
  }

  chime() {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    [659.3, 784, 987.8, 1318.5].forEach((f, k) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = ctx.createGain();
      const t0 = now + k * 0.14;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.1, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.8);
      o.connect(g).connect(this.master);
      g.connect(this.reverb);
      o.start(t0);
      o.stop(t0 + 2);
    });
  }

  setRain(on) {
    this.rainOn = on;
    if (this.ctx) this.rainGain.gain.setTargetAtTime(on ? 0.16 : 0, this.ctx.currentTime, 0.8);
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.8, this.ctx.currentTime, 0.1);
    return this.muted;
  }

  update(dt, { rumble = 0, braking = false, plane = 0 } = {}) {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    this.jetGain.gain.setTargetAtTime(plane * plane * 0.9, now, 0.4);
    this.whineGain.gain.setTargetAtTime(plane * plane * 0.006, now, 0.4);
    this.rumbleGain.gain.setTargetAtTime(rumble * 1.1, now, 0.15);
    this.clatterPhase += dt * 7;
    const clack = Math.pow(Math.max(0, Math.sin(this.clatterPhase)), 12);
    this.clatterGain.gain.setTargetAtTime(rumble * (0.02 + clack * 0.12), now, 0.01);
    this.squealGain.gain.setTargetAtTime(braking ? rumble * 0.025 : 0, now, 0.3);
    this.squeal.frequency.setTargetAtTime(2200 + Math.sin(now * 3) * 250, now, 0.1);

    this.sirenT -= dt;
    if (this.sirenT <= 0) {
      this.siren();
      this.sirenT = range(45, 110);
    }
    this.hornT -= dt;
    if (this.hornT <= 0) {
      this.honk(range(-1, 1), range(0.015, 0.04));
      this.hornT = range(8, 25);
    }
  }
}
