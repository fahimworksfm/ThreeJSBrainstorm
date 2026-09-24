// Ghost multiplayer: other players in the same neighborhood appear as see-through walkers. No chat, just
// waving (G). Peer to peer through free public relays (Trystero, Nostr), no server of ours. Off by default:
// a direct connection shows your IP address to the other players; only an in-game position is ever sent.
import * as THREE from 'three';
import { buildGuy, poseGuy } from './models.js';
import { COMIC } from './comicfx.js';
import { CURB } from './config.js';

const APP = 'night-walker-nyc';

export class Ghosts {
  constructor(parent, hud) {
    this.parent = parent;
    this.hud = hud;
    this.group = new THREE.Group();
    parent.add(this.group);
    this.peers = new Map();
    this.room = null;
    this.sendT = 0;
  }

  get count() {
    return this.peers.size;
  }

  async join(district) {
    this.leave();
    this.district = district;
    let joinRoom;
    try {
      ({ joinRoom } = await import('trystero/nostr'));
    } catch {
      return;
    }
    if (this.district !== district) return; // changed neighborhoods while loading
    const room = (this.room = joinRoom({ appId: APP }, district));
    const [sendPos, getPos] = room.makeAction('pos');
    const [sendWave, getWave] = room.makeAction('wave');
    this.sendPos = sendPos;
    this.sendWave = sendWave;
    getPos((d, id) => {
      if (!Array.isArray(d) || d.length < 4 || !d.every((v) => typeof v === 'number' && Number.isFinite(v))) return;
      let p = this.peers.get(id);
      if (!p) {
        p = this.make();
        this.peers.set(id, p);
        this.hud.toast(`👻 Another walker is in ${district.replace(/-/g, ' ')}`);
      }
      [p.tx, p.tz, p.tyaw, p.speed] = d;
      p.seen = performance.now();
    });
    getWave((_, id) => {
      const p = this.peers.get(id);
      if (p) COMIC.pop('👋 HEY!', p.x, 2.3, p.z, { size: 1, cooldown: 1, key: `wave${id}` });
    });
    room.onPeerLeave((id) => this.drop(id));
  }

  leave() {
    this.room?.leave();
    this.room = null;
    for (const id of [...this.peers.keys()]) this.drop(id);
  }

  make() {
    const g = buildGuy();
    g.root.traverse((o) => {
      if (!o.isMesh) return;
      o.material = new THREE.MeshStandardMaterial({ color: 0x8fe8ff, emissive: 0x2a8fb0, emissiveIntensity: 0.6, transparent: true, opacity: 0.45, depthWrite: false });
    });
    this.group.add(g.root);
    return { g, x: 0, z: 0, yaw: 0, tx: 0, tz: 0, tyaw: 0, speed: 0, phase: 0, seen: performance.now(), fresh: true };
  }

  drop(id) {
    const p = this.peers.get(id);
    if (!p) return;
    this.group.remove(p.g.root);
    this.peers.delete(id);
  }

  wave() {
    if (!this.room) return false;
    this.sendWave?.(1);
    return true;
  }

  update(dt, player) {
    if (!this.room) return;
    // send where you are five times a second (in-game coordinates only)
    this.sendT -= dt;
    if (this.sendT <= 0) {
      this.sendT = 0.2;
      const speed = player.mode === 'walk' ? Math.hypot(player.vel.x, player.vel.z) : Math.abs(player.speed);
      this.sendPos([Math.round(player.pos.x * 10) / 10, Math.round(player.pos.z * 10) / 10, Math.round(player.facing * 100) / 100, Math.round(speed * 10) / 10]);
    }
    const now = performance.now();
    for (const [id, p] of this.peers) {
      if (now - p.seen > 8000) {
        this.drop(id);
        continue;
      }
      if (p.fresh) {
        p.x = p.tx;
        p.z = p.tz;
        p.fresh = false;
      }
      // glide toward the latest report
      const k = Math.min(1, dt * 8);
      p.x += (p.tx - p.x) * k;
      p.z += (p.tz - p.z) * k;
      p.yaw += Math.atan2(Math.sin(p.tyaw - p.yaw), Math.cos(p.tyaw - p.yaw)) * k;
      p.phase += dt * p.speed * 3.4;
      poseGuy(p.g, 'walk', p.phase, Math.min(1, p.speed / 3), p.speed > 4.5);
      p.g.root.position.set(p.x, CURB, p.z);
      p.g.root.rotation.y = p.yaw;
    }
  }
}
