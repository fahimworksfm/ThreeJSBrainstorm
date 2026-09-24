// Graffiti: a few blank walls per neighborhood are marked as tag spots. Walk up, press E, and a
// piece goes up (bubble letters, outline, drips) and stays there between visits.
import * as THREE from 'three';
import { COMIC, JUICE } from './comicfx.js';

const WORDS = ['NITE', 'WALKR', 'QNS', 'BKLYN', 'ZEPH', 'KAZE', 'DUST', 'LUX', 'SOHO', 'BX', 'RIDE', 'SLICE', 'ECHO', 'NOVA', 'HYPE'];
const PALETTES = [
  ['#ff4fd8', '#ffd23b', '#1b1b6b'], ['#39d0ff', '#ffffff', '#0b2a6b'], ['#9dff4a', '#ffd23b', '#0f3b1a'],
  ['#ff5a36', '#ffd23b', '#2a0b0b'], ['#c86bff', '#39d0ff', '#1a0b2a'], ['#ffd23b', '#ff4fd8', '#111111'],
];

/** A tag as a transparent canvas: fat letters with a fill gradient, a thick outline, a 3D drop, drips. */
function paintTag(word, seed) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const x = c.getContext('2d');
  const [fillA, fillB, line] = PALETTES[seed % PALETTES.length];
  x.translate(256, 138);
  x.rotate(((seed % 7) - 3) * 0.02);
  x.font = `900 ${Math.min(210, 1050 / word.length)}px "Bangers", "Arial Black", Impact, sans-serif`;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.lineJoin = 'round';
  // 3D drop behind the letters
  x.fillStyle = line;
  for (let k = 8; k > 0; k--) x.fillText(word, k * 1.5, k * 1.5);
  x.lineWidth = 22;
  x.strokeStyle = line;
  x.strokeText(word, 0, 0);
  const g = x.createLinearGradient(0, -70, 0, 70);
  g.addColorStop(0, fillA);
  g.addColorStop(1, fillB);
  x.fillStyle = g;
  x.fillText(word, 0, 0);
  // highlights and drips
  x.lineWidth = 4;
  x.strokeStyle = 'rgba(255,255,255,0.8)';
  x.strokeText(word, -3, -3);
  x.fillStyle = fillB;
  for (let k = 0; k < 6; k++) {
    const dx = -170 + ((seed * 37 + k * 71) % 340);
    const len = 20 + ((seed * 13 + k * 29) % 45);
    x.fillRect(dx, 40, 5, len);
    x.beginPath();
    x.arc(dx + 2.5, 40 + len, 4, 0, Math.PI * 2);
    x.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function outlineTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const x = c.getContext('2d');
  x.setLineDash([14, 10]);
  x.lineWidth = 6;
  x.strokeStyle = '#ffd23b';
  x.strokeRect(6, 6, 244, 116);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Graffiti {
  /** faces: street-facing walls { x, z, nx, nz, w, lot, shop }; store: saved state; id: neighborhood. */
  constructor(faces, store, id, audio) {
    this.store = store;
    this.key = `tags.${id}`;
    this.audio = audio;
    this.group = new THREE.Group();
    const done = store.get(this.key, {});
    // up to eight blank walls, spread out over the neighborhood
    let h = [...id].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 11);
    const rnd = () => ((h = (h * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const walls = faces.filter((f) => !f.shop && f.w > 7 && f.lot && !f.lot.outer && f.lot.kind !== 'house' && f.lot.h > 6);
    const spots = [];
    for (let tries = 0; tries < 400 && spots.length < 8 && walls.length; tries++) {
      const f = walls[Math.floor(rnd() * walls.length)];
      if (spots.some((s) => Math.hypot(s.x - f.x, s.z - f.z) < 45)) continue;
      spots.push({ x: f.x + f.nx * 0.07, z: f.z + f.nz * 0.07, nx: f.nx, nz: f.nz, id: `${Math.round(f.x)},${Math.round(f.z)}` });
    }
    this.spots = spots;
    const outline = new THREE.MeshBasicMaterial({ map: outlineTexture(), transparent: true, depthWrite: false });
    const can = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 0.32, 10).translate(0, 0, 0),
      new THREE.MeshStandardMaterial({ color: 0xff4fd8, emissive: 0x551144, roughness: 0.4, metalness: 0.4 }),
    );
    spots.forEach((s, i) => {
      const ang = Math.atan2(s.nx, s.nz);
      s.y = 1.9;
      if (done[s.id]) {
        this.paint(s, done[s.id].word, done[s.id].seed);
      } else {
        s.marker = new THREE.Group();
        const frame = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.8), outline);
        frame.rotation.y = ang;
        frame.position.set(s.x, s.y, s.z);
        const c = can.clone();
        c.position.set(s.x + s.nx * 0.9, 1.2, s.z + s.nz * 0.9);
        s.can = c;
        s.marker.add(frame, c);
        this.group.add(s.marker);
      }
      s.index = i;
    });
    this.near = null;
    this.spraying = null;
  }

  get count() {
    return Object.keys(this.store.get(this.key, {})).length;
  }

  paint(s, word, seed) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(3.6, 1.8),
      new THREE.MeshStandardMaterial({ map: paintTag(word, seed), transparent: true, depthWrite: false, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2 }),
    );
    mesh.rotation.y = Math.atan2(s.nx, s.nz);
    mesh.position.set(s.x, s.y, s.z);
    this.group.add(mesh);
    s.tag = mesh;
    return mesh;
  }

  /** Call every frame on foot: which spot you're at (for the prompt), and the spraying animation. */
  update(dt, t, player) {
    this.near = null;
    for (const s of this.spots) {
      if (s.can) {
        s.can.rotation.y = t * 1.5;
        s.can.position.y = 1.2 + Math.sin(t * 2 + s.index) * 0.08;
      }
      if (s.tag || player.mode !== 'walk') continue;
      if (Math.hypot(player.pos.x - s.x, player.pos.z - s.z) < 3) this.near = s;
    }
    const sp = this.spraying;
    if (sp) {
      sp.t += dt;
      const k = Math.min(1, sp.t / 1.4);
      // the piece fades in stroke by stroke, left to right
      sp.mesh.material.opacity = k;
      sp.mesh.scale.x = 0.2 + k * 0.8;
      if (k >= 1) {
        this.spraying = null;
        COMIC.pop('TSSSS!', sp.s.x + sp.s.nx, 2.4, sp.s.z + sp.s.nz, { size: 1, cooldown: 1 });
        JUICE.hit(0.1);
      }
    }
  }

  /** Put a piece up at the spot you're standing at. Returns how many walls this neighborhood has now. */
  spray() {
    const s = this.near;
    if (!s || this.spraying) return null;
    const word = WORDS[Math.floor(Math.random() * WORDS.length)];
    const seed = Math.floor(Math.random() * 1000);
    if (s.marker) {
      this.group.remove(s.marker);
      s.marker = null;
      s.can = null;
    }
    const mesh = this.paint(s, word, seed);
    mesh.material.opacity = 0;
    this.spraying = { s, mesh, t: 0 };
    this.audio?.spray?.();
    const done = this.store.get(this.key, {});
    done[s.id] = { word, seed };
    this.store.set(this.key, done);
    return { count: Object.keys(done).length, total: this.spots.length };
  }
}
