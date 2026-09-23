// Comic sound effects that pop up in the world: HONK! RUMBLE SPLASH! SKRRT!
// Anything can call COMIC.pop(word, x, y, z); main.js wires it to the screen.
import * as THREE from 'three';

export const COMIC = { pop() {} };

const COLORS = [
  ['#ffd23b', '#e0301e'], ['#ff4fd8', '#1b1b6b'], ['#39d0ff', '#0b2a6b'], ['#ff5a36', '#ffd23b'], ['#9dff4a', '#0f3b1a'],
];

export class ComicWords {
  constructor(camera, parent = document.body) {
    this.camera = camera;
    this.layer = document.createElement('div');
    this.layer.id = 'comic-words';
    parent.appendChild(this.layer);
    this.live = [];
    this.v = new THREE.Vector3();
    this.cool = new Map();
  }

  /** Show a word at a world position; `key` limits how often the same kind can fire. */
  pop(word, x, y, z, { size = 1, cooldown = 2.5, key = word } = {}) {
    const now = performance.now() / 1000;
    if ((this.cool.get(key) ?? 0) > now) return;
    this.cool.set(key, now + cooldown);
    if (this.live.length > 6) this.live.shift().el.remove();
    const el = document.createElement('div');
    el.className = 'sfx';
    const [fill, shade] = COLORS[Math.floor(Math.random() * COLORS.length)];
    el.style.setProperty('--fill', fill);
    el.style.setProperty('--shade', shade);
    el.style.setProperty('--rot', `${(Math.random() - 0.5) * 24}deg`);
    el.style.setProperty('--size', `${size}`);
    el.textContent = word;
    this.layer.appendChild(el);
    this.live.push({ el, pos: new THREE.Vector3(x, y, z), born: now });
  }

  update() {
    const now = performance.now() / 1000;
    const w = innerWidth;
    const h = innerHeight;
    this.live = this.live.filter((it) => {
      const age = now - it.born;
      if (age > 1.2) {
        it.el.remove();
        return false;
      }
      const v = this.v.copy(it.pos).project(this.camera);
      const behind = v.z > 1;
      // words drift up a little as they fade
      const x = (v.x * 0.5 + 0.5) * w;
      const y = (-v.y * 0.5 + 0.5) * h - age * 30;
      it.el.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
      it.el.style.visibility = behind ? 'hidden' : 'visible';
      return true;
    });
  }
}
