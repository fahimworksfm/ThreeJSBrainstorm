// Neighborhood regulars: a shopkeeper out front, an old-timer on a stoop, a musician on the corner, a kid by
// the hydrant. They're always in the same spot; walk up and they talk, with different lines by day and night,
// voiced by the browser's own speech (free, nothing to download).
import * as THREE from 'three';
import { buildGuy, poseGuy, COLORS } from './models.js';
import { CURB } from './config.js';

const NAMES = {
  shop: ['Sal', 'Mrs. Kim', 'Rafi', 'Carmen', 'Dimitri', 'Nadia', 'Hector', 'Ming'],
  elder: ['Mr. Delgado', 'Miss Pearl', 'Old Stan', 'Auntie Rose', 'Mr. Okafor', 'Grandpa Joe'],
  music: ['Jay on sax', 'Luz with the guitar', 'Big Mike on the bucket drums', 'Theo on trumpet'],
  kid: ['Dre', 'Maya', 'Little Tony', 'Priya'],
};
const LINES = {
  shop: {
    day: ['Mornin\'! Coffee\'s fresh, and the rolls just came in.', 'You again? Take a banana, it\'s on me.', 'Everybody on {HOOD} comes through here sooner or later.', 'Watch the step, I just mopped.'],
    night: ['Still open, still here. Grab something for the walk.', 'Long day? Sit, sit. The cat won\'t mind.', 'Lights stay on till the last bus. Always.', 'Careful out there. Say hi to your mother.'],
  },
  elder: {
    day: ['I\'ve lived on this block forty years. {HOOD} changes, the pigeons don\'t.', 'See that window up there? I was born behind it.', 'In summer we\'d open the hydrant and the whole street came out.', 'You walk around like you\'re looking for something. Good.'],
    night: ['Go home, kid, it\'s late. Or don\'t. I never did.', 'This hour the city talks to you, if you listen.', 'The trains sound different at night. Softer.', 'Stars? Nah. We got the windows.'],
  },
  music: {
    day: ['This one\'s for the lunch crowd.', 'Drop a dollar, request a song. Any song. Almost any song.', 'Acoustics under here are better than Carnegie Hall. Don\'t tell them.'],
    night: ['Late set. Just me and the moon.', 'Night people tip better. It\'s a fact.', 'Stick around, the good part\'s coming.'],
  },
  kid: {
    day: ['Wanna get soaked? Stand right there!', 'My mom says I gotta be home when the streetlights come on.', 'I found a quarter in the grate. A QUARTER.'],
    night: ['I\'m not supposed to be out. Don\'t tell nobody.', 'The pigeons sleep on the fire escapes. I counted forty.', 'You got a MetroCard? Where you going?'],
  },
};
const OUTFITS = {
  shop: [0xf2efe4, 0x2f5a3a], elder: [0x6b4a2a, 0x3a3a44], music: [0x1d3a6b, 0x111111], kid: [0xd8261e, 0x2a5fb0],
};

export class Regulars {
  /** faces: street-facing walls; hydrants: open hydrant spots; nightness(): 0 by day, 1 at night. */
  constructor(faces, hydrants, hood, nightness, hud, audio) {
    this.hood = hood;
    this.nightness = nightness;
    this.hud = hud;
    this.audio = audio;
    this.group = new THREE.Group();
    this.people = [];
    let h = [...hood].reduce((a, c) => a * 31 + c.charCodeAt(0), 3);
    const rnd = () => ((h = (h * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const pick = (list) => list[Math.floor(rnd() * list.length)];
    const shops = faces.filter((f) => f.shop && f.w > 6);
    const homes = faces.filter((f) => !f.shop && f.lot && /row|house|apt/.test(f.lot.kind ?? ''));
    const out = (f, d) => [f.x + f.nx * d, f.z + f.nz * d, Math.atan2(f.nx, f.nz)];
    const add = (role, spot, extra = '') => {
      if (!spot) return;
      const [x, z, yaw] = spot;
      const g = buildGuy();
      // recolor the jacket and pants for the role
      const [top, bottom] = OUTFITS[role];
      g.root.traverse((o) => {
        if (!o.isMesh) return;
        o.material = o.material.clone();
        const hex = o.material.color.getHex();
        if (hex === COLORS.jacket) o.material.color.setHex(top);
        else if (hex === COLORS.jeans) o.material.color.setHex(bottom);
        o.castShadow = true;
      });
      g.root.position.set(x, CURB, z);
      g.root.rotation.y = yaw;
      if (role === 'kid') g.root.scale.setScalar(0.72);
      this.group.add(g.root);
      this.people.push({ role, g, x, z, yaw, name: pick(NAMES[role]) + extra, last: -99, said: 0, phase: rnd() * 6 });
    };
    // the shopkeeper outside a real shop when the map has one
    const shop = shops.find((f) => f.names?.length) ?? (shops.length ? pick(shops) : null);
    if (shop) add('shop', out(shop, 1.1), shop.names?.[0] ? ` of ${shop.names[0].toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}` : '');
    if (homes.length) add('elder', out(pick(homes), 1.4));
    if (shops.length > 3) add('music', out(pick(shops), 2.4));
    if (hydrants.length) {
      const hy = hydrants[0];
      add('kid', [hy.x - hy.dz * 1.6, hy.z + hy.dx * 1.6, Math.atan2(hy.dx, hy.dz)]);
    }
  }

  /** Idle sway, turning to face you, and a line when you walk up. */
  update(dt, t, player) {
    for (const p of this.people) {
      const d = Math.hypot(player.pos.x - p.x, player.pos.z - p.z);
      // look at you when you're close, otherwise back to the street
      const want = d < 6 ? Math.atan2(player.pos.x - p.x, player.pos.z - p.z) : p.yaw;
      const cur = p.g.root.rotation.y;
      p.g.root.rotation.y = cur + Math.atan2(Math.sin(want - cur), Math.cos(want - cur)) * Math.min(1, dt * 3);
      poseGuy(p.g, 'walk', t * 2 + p.phase, 0.05, false);
      if (p.role === 'music') p.g.shoulders.forEach((s, i) => (s.rotation.x = -0.9 + Math.sin(t * 6 + i) * 0.15));
      if (d < 3 && t - p.last > 25) {
        p.last = t;
        this.say(p);
      }
    }
  }

  say(p) {
    const night = this.nightness() > 0.5;
    const lines = LINES[p.role][night ? 'night' : 'day'];
    const line = lines[p.said++ % lines.length].replace('{HOOD}', this.hood);
    this.hud.showMemory(p.name, line, 7000);
    if (this.audio?.muted || !window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(line);
    const voices = speechSynthesis.getVoices().filter((v) => /^en[-_]US/i.test(v.lang));
    if (voices.length) u.voice = voices[[...p.name].reduce((a, c) => a + c.charCodeAt(0), 0) % voices.length];
    u.pitch = p.role === 'kid' ? 1.5 : p.role === 'elder' ? 0.8 : 1;
    u.rate = p.role === 'elder' ? 0.9 : 1.02;
    u.volume = 0.9 * (this.audio?.volume ?? 1);
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }
}
