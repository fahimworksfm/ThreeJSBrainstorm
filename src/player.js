import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { D } from './config.js';

const EYE = 1.68;
const RADIUS = 0.35;
const WALK = 3.6;
const RUN = 7.5;

/** First-person walker: pointer-lock look, WASD, collisions against block footprints. */
export class Player {
  constructor(camera, dom, world, audio) {
    this.camera = camera;
    this.world = world;
    this.audio = audio;
    this.controls = new PointerLockControls(camera, dom);
    this.controls.pointerSpeed = 0.8;
    this.keys = {};
    this.vel = new THREE.Vector3();
    this.phase = 0;
    this.ground = 0;
    this.atEdge = false;
    this.onRoad = false;
    this._fwd = new THREE.Vector3();
    addEventListener('keydown', (e) => (this.keys[e.code] = true));
    addEventListener('keyup', (e) => (this.keys[e.code] = false));
    addEventListener('blur', () => (this.keys = {}));
  }

  /** Place the player at a spot, looking at a target. */
  spawn(x, z, look) {
    this.ground = this.world.groundAt(x, z);
    this.camera.position.set(x, this.ground + EYE, z);
    this.camera.lookAt(look[0], look[1], look[2]);
    this.vel.set(0, 0, 0);
  }

  get position() {
    return this.camera.position;
  }

  update(dt) {
    const k = this.keys;
    const locked = this.controls.isLocked;
    const f = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
    const r = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
    const sprint = k.ShiftLeft || k.ShiftRight;
    const fwd = this.camera.getWorldDirection(this._fwd);
    fwd.y = 0;
    fwd.normalize();
    let wx = fwd.x * f - fwd.z * r;
    let wz = fwd.z * f + fwd.x * r;
    const len = Math.hypot(wx, wz);
    const speed = locked && len > 0 ? (sprint ? RUN : WALK) : 0;
    if (len > 0) {
      wx /= len;
      wz /= len;
    }
    const a = 1 - Math.exp(-10 * dt);
    this.vel.x += (wx * speed - this.vel.x) * a;
    this.vel.z += (wz * speed - this.vel.z) * a;

    const p = this.camera.position;
    p.x += this.vel.x * dt;
    p.z += this.vel.z * dt;
    this.world.collide(p, RADIUS);
    const cx = Math.max(D.xMin, Math.min(D.xMax, p.x));
    const cz = Math.max(D.zMin, Math.min(D.zMax, p.z));
    // pushing against the edge of the neighborhood (not just brushing it)
    const riverside = D.riverX !== null && cx === D.xMin;
    this.atEdge = len > 0 && ((cx !== p.x && !riverside) || cz !== p.z);
    p.x = cx;
    p.z = cz;

    const g = this.world.groundAt(p.x, p.z);
    this.onRoad = g < 0.05;
    this.ground += (g - this.ground) * Math.min(1, dt * 14);

    const v = Math.hypot(this.vel.x, this.vel.z);
    const before = Math.floor(this.phase / Math.PI);
    this.phase += v * dt * 1.75;
    if (Math.floor(this.phase / Math.PI) !== before && v > 0.8) this.audio.footstep(true, sprint);
    const bob = Math.abs(Math.sin(this.phase)) * Math.min(1, v / WALK) * (sprint ? 0.07 : 0.045);
    p.y = this.ground + EYE + bob;
  }
}
