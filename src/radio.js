// The radio: "Night Walker FM" (lo-fi jazz made on the spot with Web Audio, no files, no licenses)
// and New York public radio, streamed straight from the stations while you listen.

const STATIONS = [
  { name: 'Radio off' },
  { name: 'Night Walker FM · lo-fi', synth: true },
  { name: 'WNYC 93.9 FM · New York Public Radio', url: 'https://fm939.wnyc.org/wnycfm-web' },
  { name: 'WQXR 105.9 FM · Classical', url: 'https://stream.wqxr.org/wqxr-web' },
  { name: 'WBGO 88.3 FM · Jazz', url: 'https://wbgo.streamguys1.com/wbgo128' },
];

// a slow ii-V-I-VI loop in F, as MIDI note numbers (root in the bass, the rest voiced up top)
const CHORDS = [
  [50, 60, 64, 65, 69], // Dm9
  [43, 59, 62, 64, 65], // G13
  [48, 59, 62, 64, 67], // Cmaj9
  [45, 58, 61, 64, 67], // A7b9
];
const hz = (m) => 440 * 2 ** ((m - 69) / 12);

export class Radio {
  constructor(audio) {
    this.audio = audio;
    this.index = 0;
    this.el = null;
    this.timer = null;
  }

  get station() {
    return STATIONS[this.index];
  }

  /** Next station; returns its name for the HUD. */
  next() {
    return this.tune((this.index + 1) % STATIONS.length);
  }

  tune(i) {
    this.stop();
    this.index = i;
    const st = STATIONS[i];
    if (st.synth) this.startSynth();
    else if (st.url) {
      this.el = new Audio(st.url);
      this.el.volume = 0.55 * (this.audio.muted ? 0 : this.audio.volume);
      this.el.play().catch(() => {
        // offline or blocked: skip to the next station
        if (this.index === i) this.next();
      });
    }
    return st.name;
  }

  stop() {
    if (this.el) {
      this.el.pause();
      this.el.src = '';
      this.el = null;
    }
    clearInterval(this.timer);
    this.timer = null;
    this.hiss?.stop(this.audio.ctx.currentTime + 1.5);
    this.hiss = null;
    if (this.bus) {
      const b = this.bus;
      b.gain.setTargetAtTime(0, this.audio.ctx.currentTime, 0.3);
      setTimeout(() => b.disconnect(), 1500);
      this.bus = null;
    }
  }

  setVolume(v) {
    if (this.el) this.el.volume = 0.55 * v;
  }

  /** Lo-fi: electric piano chords, a lazy bass, brushed drums and vinyl crackle, through a warm filter. */
  startSynth() {
    const a = this.audio;
    a.start();
    const ctx = a.ctx;
    if (!ctx) return;
    const bus = (this.bus = ctx.createGain());
    bus.gain.value = 0.0001;
    bus.gain.setTargetAtTime(0.55, ctx.currentTime, 0.5);
    const warm = ctx.createBiquadFilter();
    warm.type = 'lowpass';
    warm.frequency.value = 2400;
    bus.connect(warm).connect(a.master);
    // vinyl: a quiet hiss with pops
    const hiss = ctx.createBufferSource();
    hiss.buffer = a.white;
    hiss.loop = true;
    const hissGain = ctx.createGain();
    hissGain.gain.value = 0.012;
    const hissFilter = ctx.createBiquadFilter();
    hissFilter.type = 'bandpass';
    hissFilter.frequency.value = 3000;
    hiss.connect(hissFilter).connect(hissGain).connect(bus);
    hiss.start();
    this.hiss = hiss;

    const beat = 60 / 76;
    let next = ctx.currentTime + 0.1;
    let step = 0;
    const note = (f, t, len, vol, type = 'sine') => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.value = f;
      o.detune.value = (Math.random() - 0.5) * 12; // a slightly warped tape
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(g).connect(bus);
      o.start(t);
      o.stop(t + len + 0.05);
    };
    const hit = (t, len, vol, freq) => {
      const s = ctx.createBufferSource();
      s.buffer = a.white;
      const f = ctx.createBiquadFilter();
      f.type = freq < 500 ? 'lowpass' : 'highpass';
      f.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      s.connect(f).connect(g).connect(bus);
      s.start(t, Math.random() * 2);
      s.stop(t + len);
    };
    // schedule a little ahead, one eighth note at a time
    this.timer = setInterval(() => {
      while (next < ctx.currentTime + 0.3) {
        const bar = Math.floor(step / 8);
        const chord = CHORDS[Math.floor(bar / 2) % CHORDS.length];
        const e = step % 8;
        const swing = e % 2 ? beat * 0.08 : 0;
        const t = next + swing;
        if (e === 0 && bar % 2 === 0) chord.slice(1).forEach((m, k) => note(hz(m), t + k * 0.03, beat * 7, 0.035, 'triangle'));
        if (e === 0 || e === 5) note(hz(chord[0]), t, beat * 1.6, 0.12); // bass
        if (e === 0 || e === 4) note(55, t, 0.25, 0.25); // kick
        if (e === 2 || e === 6) hit(t, 0.18, 0.07, 1800); // brushed snare
        hit(t, 0.05, 0.025, 7000); // hat
        if (Math.random() < 0.18) note(hz(chord[1 + Math.floor(Math.random() * 4)] + 12), t + beat * 0.25, beat, 0.02, 'sine');
        if (Math.random() < 0.05) hit(t, 0.02, 0.05, 5000); // a vinyl pop
        next += beat / 2;
        step++;
      }
    }, 100);
  }
}
