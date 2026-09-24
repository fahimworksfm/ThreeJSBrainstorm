import * as THREE from 'three';
import { CURB, D } from './config.js';
import { DISTRICTS } from './districts/index.js';
import { makePostcard } from './textures.js';
import { JUICE } from './comicfx.js';

const storageKey = (id) => `nightwalker.${id}.collected`;

/** A MetroCard: earned with your first memory anywhere; it opens the trains between neighborhoods. */
export function hasMetroCard() {
  try {
    if (localStorage.getItem('nightwalker.metrocard')) return true;
    // players from before the card existed already earned it
    return Object.keys(DISTRICTS).some((id) => loadCollected(id).size > 0);
  } catch {
    return true;
  }
}

function loadCollected(id) {
  try {
    return new Set(JSON.parse(localStorage.getItem(storageKey(id)) || '[]'));
  } catch {
    return new Set();
  }
}

function saveCollected(id, set) {
  try {
    localStorage.setItem(storageKey(id), JSON.stringify([...set]));
  } catch {
    /* private mode: progress just won't persist */
  }
}

/** Collected memories for every district, for the journal. */
export function journalAll() {
  return Object.values(DISTRICTS).map((def) => {
    const got = loadCollected(def.id);
    const texts = def.memories;
    return { name: `${def.name}, ${def.borough}`, entries: texts.filter((m) => got.has(m.id)), total: texts.length };
  });
}

/** Glowing postcards with light beams; walk up to one to read it. */
export class Memories {
  /** place (real-map mode): turns a memory's grid placement into a spot on the real streets. */
  constructor(shared, audio, hud, place = null) {
    this.audio = audio;
    this.hud = hud;
    this.id = D.id;
    this.list = D.memories;
    this.finale = D.finale;
    this.group = new THREE.Group();
    this.collected = loadCollected(this.id);
    const cardTex = makePostcard();
    const cardGeo = new THREE.PlaneGeometry(0.75, 0.5);
    const beamGeo = new THREE.CylinderGeometry(0.3, 0.3, 70, 16, 1, true);
    beamGeo.translate(0, 35, 0);
    const poolGeo = new THREE.PlaneGeometry(5, 5);
    poolGeo.rotateX(-Math.PI / 2);
    this.items = this.list.map((mem) => {
      const g = new THREE.Group();
      const [wx, wz] = place ? place(mem.where) : mem.where(D);
      g.position.set(wx, CURB, wz);
      const card = new THREE.Mesh(
        cardGeo,
        new THREE.MeshBasicMaterial({ map: cardTex, color: new THREE.Color(1.6, 1.5, 1.3), side: THREE.DoubleSide, transparent: true }),
      );
      card.position.y = 1.35;
      const beam = new THREE.Mesh(
        beamGeo,
        new THREE.MeshBasicMaterial({
          map: shared.beam, color: 0x6fe3ff, transparent: true, opacity: 0.4,
          blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide,
        }),
      );
      const pool = new THREE.Mesh(
        poolGeo,
        new THREE.MeshBasicMaterial({
          map: shared.pool, color: 0x6fe3ff, transparent: true, opacity: 0.8,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }),
      );
      pool.position.y = 0.03;
      g.add(card, beam, pool);
      this.group.add(g);
      const done = this.collected.has(mem.id);
      g.visible = !done;
      return { mem, g, card, beam, fading: 0, done };
    });
    this.hud.setCount(this.collected.size, this.list.length);
    this.hud.setJournal(journalAll());
  }

  reset() {
    for (const id of Object.keys(DISTRICTS)) saveCollected(id, new Set());
    this.collected.clear();
    for (const it of this.items) {
      it.done = false;
      it.fading = 0;
      it.g.visible = true;
      it.g.scale.setScalar(1);
      it.beam.visible = true;
    }
    this.hud.setCount(0, this.list.length);
    this.hud.setJournal(journalAll());
  }

  update(t, dt, pos) {
    for (const it of this.items) {
      if (it.fading > 0) {
        it.fading -= dt;
        const k = Math.max(0, it.fading / 1.2);
        it.g.scale.setScalar(k);
        it.card.position.y = 1.35 + (1 - k) * 1.5;
        if (it.fading <= 0) it.g.visible = false;
        continue;
      }
      if (it.done) continue;
      it.card.rotation.y = t * 0.8;
      it.card.position.y = 1.35 + Math.sin(t * 2 + it.g.position.x) * 0.08;
      it.beam.material.opacity = 0.2 + Math.sin(t * 1.5) * 0.06;
      const d = Math.hypot(pos.x - it.g.position.x, pos.z - it.g.position.z);
      if (d < 2.3) this.collect(it);
    }
  }

  collect(it) {
    it.done = true;
    it.fading = 1.2;
    it.beam.visible = false; // you're standing in it
    this.collected.add(it.mem.id);
    saveCollected(this.id, this.collected);
    this.audio.chime();
    JUICE.hit(0.3, 0.09);
    const firstCard = !hasMetroCard();
    try {
      localStorage.setItem('nightwalker.metrocard', '1');
    } catch {
      /* private mode: the card lasts the session */
    }
    if (firstCard) setTimeout(() => this.hud.toast('🎫 MetroCard earned! The trains are open: find a green-globe subway entrance'), 5500);
    const n = this.collected.size;
    this.hud.setCount(n, this.list.length);
    this.hud.setJournal(journalAll());
    this.hud.showMemory(it.mem.title, it.mem.text);
    this.hud.banner(n === this.list.length ? 'NEIGHBORHOOD COMPLETE!' : 'MEMORY FOUND!', `${n} / ${this.list.length}`);
    if (n === this.list.length) {
      const title = `${D.name}, ${D.borough}`;
      const id = this.id;
      setTimeout(() => D.id === id && this.hud.showMemory(title, this.finale, 14000), 11000);
    }
  }
}
