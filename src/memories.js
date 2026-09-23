import * as THREE from 'three';
import { NS_W, EW_W, CURB, colX, rowZ, RIVER_X, PARK_Z1 } from './config.js';
import { makePostcard } from './textures.js';

const corner = (i, j, sx, sz) => [colX(i) + sx * (NS_W / 2 + 2), rowZ(j) + sz * (EW_W / 2 + 2)];

export const MEMORIES = [
  {
    id: 'el', where: corner(3, 6, 1, 1), title: '31st St & 30th Ave',
    text: 'The N train shakes the whole street every few minutes. After a week you stop hearing it. After a month you miss it when you’re away.',
  },
  {
    id: 'ditmars', where: corner(3, 0, -1, 1), title: 'Astoria–Ditmars Blvd',
    text: 'End of the line. Everybody gets off here eventually, and the train just turns around and goes back for more.',
  },
  {
    id: 'river', where: [RIVER_X + 2.5, rowZ(3)], title: 'The East River',
    text: 'Manhattan looks best from over here. Close enough to see it glitter, far enough that you can’t hear it.',
  },
  {
    id: 'steinway', where: corner(6, 7, -1, 1), title: 'Steinway St',
    text: 'Steinway after midnight: shisha smoke, a song from a car window, a man selling roasted corn. Six languages on one block and nobody needs a translator.',
  },
  {
    id: 'diner', where: corner(4, 8, -1, -1), title: 'Broadway',
    text: 'The diner on Broadway never closes. The waitress calls everyone “sweetheart” and means it about half the time.',
  },
  {
    id: 'park', where: [colX(1) + 3, PARK_Z1 - 60], title: 'Astoria Park',
    text: 'From the park you can see the bridges lit up like jewelry. I’ve never crossed one at this hour. Tonight I don’t need to.',
  },
  {
    id: 'porch', where: corner(1, 2, 1, 1), title: 'Crescent St',
    text: 'Plastic chairs on the stoop, a fig tree wrapped for winter, somebody’s grandmother’s tomatoes. Queens keeps its gardens small and stubborn.',
  },
  {
    id: 'bakery', where: corner(5, 6, 1, -1), title: '30th Ave',
    text: 'A bakery is already lit. At four in the morning the whole block smells like bread and warm sugar.',
  },
];

export const FINALE =
  'Two million stories in this borough, and tonight one of them was mine. The train is still running. Keep walking.';

const STORAGE_KEY = 'nightwalker.queens.collected';

function loadCollected() {
  try {
    return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'));
  } catch {
    return new Set();
  }
}

function saveCollected(set) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    /* private mode: progress just won't persist */
  }
}

/** Glowing postcards with light beams; walk up to one to read it. */
export class Memories {
  constructor(shared, audio, hud) {
    this.audio = audio;
    this.hud = hud;
    this.group = new THREE.Group();
    this.collected = loadCollected();
    const cardTex = makePostcard();
    const cardGeo = new THREE.PlaneGeometry(0.75, 0.5);
    const beamGeo = new THREE.CylinderGeometry(0.3, 0.3, 70, 16, 1, true);
    beamGeo.translate(0, 35, 0);
    const poolGeo = new THREE.PlaneGeometry(5, 5);
    poolGeo.rotateX(-Math.PI / 2);
    this.items = MEMORIES.map((mem) => {
      const g = new THREE.Group();
      g.position.set(mem.where[0], CURB, mem.where[1]);
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
    this.hud.setCount(this.collected.size, MEMORIES.length);
    this.hud.setJournal(this.journal());
  }

  journal() {
    return MEMORIES.filter((m) => this.collected.has(m.id));
  }

  reset() {
    this.collected.clear();
    saveCollected(this.collected);
    for (const it of this.items) {
      it.done = false;
      it.fading = 0;
      it.g.visible = true;
      it.g.scale.setScalar(1);
      it.beam.visible = true;
    }
    this.hud.setCount(0, MEMORIES.length);
    this.hud.setJournal([]);
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
    saveCollected(this.collected);
    this.audio.chime();
    const n = this.collected.size;
    this.hud.setCount(n, MEMORIES.length);
    this.hud.setJournal(this.journal());
    this.hud.showMemory(it.mem.title, it.mem.text);
    if (n === MEMORIES.length) {
      setTimeout(() => this.hud.showMemory('Astoria, Queens', FINALE, 14000), 11000);
    }
  }
}
