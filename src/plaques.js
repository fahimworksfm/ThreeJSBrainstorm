// Real landmarks (Wikipedia) as blue historic-marker plaques on the real map. Walk up to one to read it,
// and hear it read aloud when the site has a recording. Text: Wikipedia, CC BY-SA.
import * as THREE from 'three';
import { CURB } from './config.js';

function plaqueTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 96;
  const x = c.getContext('2d');
  x.fillStyle = '#1d4f9e';
  x.fillRect(0, 0, 128, 96);
  x.strokeStyle = '#f2e6b8';
  x.lineWidth = 5;
  x.strokeRect(6, 6, 116, 84);
  x.fillStyle = '#f2e6b8';
  x.font = 'bold 18px Georgia, serif';
  x.textAlign = 'center';
  x.fillText('HISTORIC', 64, 36);
  x.fillText('NEW YORK', 64, 58);
  x.font = '11px Georgia, serif';
  x.fillText('✦ read me ✦', 64, 78);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Plaques {
  /** list: [{ title, lat, lon, summary, story, voice }]; city: the real-map world (projection, spots). */
  constructor(list, city, store, id, hud) {
    this.store = store;
    this.key = `plaques.${id}`;
    this.hud = hud;
    this.group = new THREE.Group();
    this.items = [];
    if (!list?.length || !city) return;
    const post = new THREE.CylinderGeometry(0.04, 0.04, 1.7, 6).translate(0, 0.85, 0);
    const board = new THREE.PlaneGeometry(0.62, 0.46).translate(0, 1.7, 0.03);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x1b2a44, roughness: 0.5, metalness: 0.5 });
    const boardMat = new THREE.MeshStandardMaterial({ map: plaqueTexture(), roughness: 0.6, emissive: 0x223355, emissiveIntensity: 0.3, side: THREE.DoubleSide });
    const seen = new Set();
    for (const it of list) {
      const [wx, wz] = city.M.proj.toWorld(it.lat, it.lon);
      const b = city.box;
      if (wx < b.x0 + 5 || wx > b.x1 - 5 || wz < b.z0 + 5 || wz > b.z1 - 5) continue;
      const [x, z] = city.spot(wx, wz);
      if (this.items.some((o) => Math.hypot(o.x - x, o.z - z) < 12) || seen.has(it.title)) continue;
      seen.add(it.title);
      const g = new THREE.Group();
      g.position.set(x, CURB, z);
      // face the landmark itself, back to the street
      g.rotation.y = Math.atan2(wx - x, wz - z) + Math.PI;
      g.add(new THREE.Mesh(post, postMat), new THREE.Mesh(board, boardMat));
      g.traverse((o) => (o.castShadow = true));
      this.group.add(g);
      this.items.push({ ...it, x, z });
    }
    this.read = new Set(store.get(this.key, []));
    this.near = null;
    this.audio = null;
  }

  update(player, voices) {
    let near = null;
    for (const it of this.items) if (Math.hypot(player.pos.x - it.x, player.pos.z - it.z) < 3.2) near = it;
    if (near && near !== this.near) this.open(near, voices);
    this.near = near;
  }

  open(it, voices) {
    const text = it.story ? `${it.story}\n\n${it.summary.split(/(?<=\.)\s/)[0]}` : it.summary;
    this.hud.showMemory(it.title.replace(/\s*\([^)]*\)$/, ''), `${text}  (Wikipedia)`, 16000);
    if (it.voice && voices) {
      this.audio?.pause();
      this.audio = new Audio(`./voices/${it.voice}`);
      this.audio.volume = 0.9;
      this.audio.play().catch(() => {});
    }
    if (!this.read.has(it.title)) {
      this.read.add(it.title);
      this.store.set(this.key, [...this.read]);
      setTimeout(() => this.hud.toast(`📜 Landmark ${this.read.size} / ${this.items.length} read`), 1500);
    }
  }
}
