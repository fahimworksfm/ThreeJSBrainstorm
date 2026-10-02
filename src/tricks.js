// Bike tricks: bunny hop (Space), spin in the air (steer while airborne), manual (hold Shift). Chain them
// within two seconds of each other for a combo; land a spin crooked and you bail.
import { COMIC, JUICE } from './comicfx.js';

const SPINS = { 1: '360!', 2: '720!!', 3: '1080!!!' };

export class Tricks {
  constructor(hud, store) {
    this.hud = hud;
    this.store = store;
    this.combo = 0;
    this.points = 0;
    this.chain = 0;
    this.manualT = 0;
    this.manualBanked = 0;
  }

  add(name, pts, p) {
    this.combo++;
    this.points += pts;
    this.chain = 2;
    COMIC.pop(this.combo > 1 ? `${name} x${this.combo}` : name, p.pos.x, p.ground + 2.2, p.pos.z, { size: 0.8 + Math.min(0.6, this.combo * 0.08), cooldown: 0.2, key: 'trick' });
  }

  hop(p) {
    this.add('HOP', 50, p);
  }

  /** Touchdown with the bike turned by spin radians in the air (and air seconds of hang time). */
  land(p, spin, hang) {
    const turns = Math.round(spin / (Math.PI * 2));
    const off = Math.abs(spin - turns * Math.PI * 2);
    if (off > 0.8) {
      this.bail(p);
      return false;
    }
    if (turns) this.add(SPINS[Math.min(3, Math.abs(turns))], 300 * Math.abs(turns), p);
    else if (hang > 0.75) this.add('BIG AIR', 150, p);
    if (turns) JUICE.hit(0.15);
    return true;
  }

  manual(p, dt, on) {
    if (!on) {
      this.manualT = 0;
      this.manualBanked = 0;
      return;
    }
    this.manualT += dt;
    this.chain = Math.max(this.chain, 0.6); // keeps the combo alive while you hold it
    const whole = Math.floor(this.manualT / 1.2);
    if (whole > this.manualBanked) {
      this.manualBanked = whole;
      this.add('MANUAL', 100, p);
    }
  }

  bail(p) {
    COMIC.pop('BAIL!', p.pos.x, p.ground + 1.6, p.pos.z, { size: 1.2, cooldown: 0.5, key: 'trick' });
    JUICE.hit(0.6, 0.12);
    if (this.combo > 1) this.hud.toast(`💥 Bailed: lost a x${this.combo} combo`);
    this.combo = 0;
    this.points = 0;
    this.chain = 0;
  }

  update(dt) {
    if (this.chain <= 0) return;
    this.chain -= dt;
    if (this.chain > 0) return;
    if (this.combo >= 2) {
      const total = this.points * this.combo;
      const best = this.store.get('bestCombo', 0);
      if (this.combo > best) this.store.set('bestCombo', this.combo);
      if (this.combo >= 3) this.store.set('combos3', this.store.get('combos3', 0) + 1);
      this.hud.toast(`🤸 Combo x${this.combo}: ${total.toLocaleString()} pts${this.combo > best ? ' · new best!' : ''}`);
    }
    this.combo = 0;
    this.points = 0;
  }
}
