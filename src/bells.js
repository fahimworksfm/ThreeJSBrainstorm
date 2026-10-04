// Church bells from the real churches on the map (OpenStreetMap places of worship): the nearest one within
// earshot strikes the hours in the daytime, and on Sunday mornings the bells ring for the service. Only
// churches ring (no bells at a mosque, a temple or a Kingdom Hall); each church gets its own bell pitch.
import { COMIC } from './comicfx.js';

/** Does this place of worship have bells? Its religion tag when mapped, otherwise its name. */
function rings(c) {
  if (c.religion && c.religion !== 'christian') return false;
  if (/kingdom hall|jehovah|masjid|mosque|islamic|temple|synagogue|sikh|gurdwara|buddhist|hindu|mandir|beth|shul/i.test(c.name)) return false;
  return c.religion === 'christian' || /church|cathedral|basilica|chapel|parish|st\.? |saint|our lady|holy|trinity/i.test(c.name);
}

export class Bells {
  /** churches: [{ p: [x, z], name, religion }] in world space; audio: CityAudio; hud for a word now and then. */
  constructor(churches, audio, hud) {
    this.audio = audio;
    this.hud = hud;
    this.list = (churches ?? []).filter(rings).map((c, i) => ({ ...c, pitch: [262, 294, 233, 330, 196, 349][i % 6] }));
    this.lastHour = null;
    this.queue = [];
  }

  get count() {
    return this.list.length;
  }

  /** Every frame: minute (game clock), weekday (0 Sunday), where you are. */
  update(minute, weekday, pos) {
    if (!this.list.length) return;
    const hour = Math.floor(minute / 60) % 24;
    const m = minute % 60;
    // a fresh hour (or the Sunday peal at quarter to ten and quarter to twelve)
    const sundayPeal = weekday === 0 && (hour === 9 || hour === 11) && m >= 45;
    const key = sundayPeal ? `peal${hour}` : `${hour}`;
    if (key === this.lastHour) return;
    const fresh = this.lastHour !== null;
    this.lastHour = key;
    if (!fresh || (!sundayPeal && m > 2)) return; // only right on the hour, not when the clock jumps in mid-hour
    if (!sundayPeal && (hour < 8 || hour > 21)) return; // quiet at night
    let best = null;
    let bd = 750;
    for (const c of this.list) {
      const d = Math.hypot(c.p[0] - pos.x, c.p[1] - pos.z);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    if (!best) return;
    const gain = Math.min(1, 60 / Math.max(60, bd)) ** 0.8;
    if (sundayPeal) {
      // three bells rung down the scale, over and over, about twenty seconds
      const scale = [1, 0.891, 0.794];
      for (let k = 0; k < 24; k++) this.audio.bell(gain * 0.8, best.pitch * scale[k % 3], k * 0.85);
    } else {
      const strikes = hour % 12 || 12;
      for (let k = 0; k < strikes; k++) this.audio.bell(gain, best.pitch, k * 2.4);
    }
    if (bd < 220) {
      COMIC.pop(sundayPeal ? 'DING DONG' : 'BONG', best.p[0], 22, best.p[1], { size: 1.1, cooldown: 30, key: 'bells' });
      if (best.name) this.hud.toast(`🔔 ${best.name}${sundayPeal ? ': bells for the Sunday service' : ` strikes ${hour % 12 || 12}`}`);
    }
  }
}
