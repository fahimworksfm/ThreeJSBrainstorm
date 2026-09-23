import * as THREE from 'three';
import { D } from './config.js';
import { loadHero, animateHero, poseHeroRiding } from './hero.js';
import { buildGuy, poseGuy, buildBicycle, buildMotorcycle, buildSUV, buildCockpits, makeSpeedo } from './models.js';

export const MODES = {
  walk: { name: 'On foot', eye: 1.68, radius: 0.35, walk: 3.6, run: 7.5, chase: [3.2, 2.35] },
  bike: { name: 'Bicycle', eye: 1.72, radius: 0.5, max: 9, accel: 2.6, brake: 6, reverse: 1.5, wheelbase: 1.05, steerMax: 0.6, lean: 0.35, chase: [4.2, 2.3] },
  moto: { name: 'Motorcycle', eye: 1.45, radius: 0.6, max: 27, accel: 7.5, brake: 11, reverse: 2, wheelbase: 1.45, steerMax: 0.42, lean: 0.55, chase: [4.8, 2.1] },
  suv: { name: 'SUV', eye: 1.78, radius: 1.2, max: 23, accel: 5, brake: 10, reverse: 5, wheelbase: 2.9, steerMax: 0.55, lean: 0, chase: [7.5, 3.2] },
};
export const MODE_ORDER = ['walk', 'bike', 'moto', 'suv'];

const MOUSE = 0.0022;
const MPH = 2.23694;

/**
 * The guy and his rides. First person by default, third-person chase camera on toggle.
 * Vehicles use a simple kinematic bicycle model: heading changes with speed and steering.
 */
export class Player {
  constructor(camera, scene, world, audio, input, shared) {
    this.camera = camera;
    this.world = world;
    this.audio = audio;
    this.input = input;
    this.mode = 'walk';
    this.view = 'chase'; // over the shoulder by default, C / View for first person
    this.pos = new THREE.Vector3();
    this.ground = 0;
    this.yaw = 0;
    this.pitch = 0;
    this.lookOffset = 0; // free look while riding
    this.lookIdle = 0;
    this.heading = 0;
    this.speed = 0;
    this.steer = 0;
    this.vel = new THREE.Vector3();
    this.phase = 0;
    this.roll = 0;
    this.shake = 0;
    this.onRoad = false;
    this.atEdge = false;
    this.facing = 0;
    this.bump = 0;
    this.roof = null; // the rooftop you're standing on, if any

    this.root = new THREE.Group();
    scene.add(this.root);
    this.guy = buildGuy();
    this.root.add(this.guy.root);
    this.vehicles = { bike: buildBicycle(), moto: buildMotorcycle(shared), suv: buildSUV(shared) };
    for (const [id, veh] of Object.entries(this.vehicles)) {
      veh.parked = null; // where you left it
      veh.root.visible = false;
      veh.id = id;
      this.root.add(veh.root);
    }
    this.root.traverse((o) => {
      if (o.isMesh && !o.material.transparent && !o.material.isMeshBasicMaterial) o.castShadow = o.receiveShadow = true;
    });
    // swap in the skinned, motion-captured hero once he has loaded
    this.hero = null;
    this.heroPose = null;
    loadHero()
      .then((hero) => {
        this.hero = hero;
        this.root.add(hero.root);
        this.guy.root.visible = false;
        this.onHero?.(hero);
      })
      .catch((err) => console.warn('Hero model unavailable, using the built-in figure', err));
    this.speedo = makeSpeedo();
    this.cockpits = buildCockpits(this.speedo);
    camera.add(this.cockpits.bike, this.cockpits.moto, this.cockpits.suv);

    this.camPos = new THREE.Vector3();
    this.camTarget = new THREE.Vector3();
    this.euler = new THREE.Euler(0, 0, 0, 'YXZ');
  }

  get position() {
    return this.camera.position;
  }

  get cfg() {
    return MODES[this.mode];
  }

  get mph() {
    return Math.abs(this.mode === 'walk' ? Math.hypot(this.vel.x, this.vel.z) : this.speed) * MPH;
  }

  /** 0..1, how fast relative to the current mode's top speed (for speed lines and FOV). */
  get rush() {
    const s = this.mode === 'walk' ? Math.hypot(this.vel.x, this.vel.z) : Math.abs(this.speed);
    return Math.max(0, Math.min(1, (s - 7) / 16));
  }

  spawn(x, z, look) {
    this.pos.set(x, 0, z);
    this.ground = this.world.groundAt(x, z);
    this.yaw = Math.atan2(-(look[0] - x), -(look[2] - z));
    this.heading = this.yaw;
    this.facing = this.yaw + Math.PI; // the model faces +z, the camera looks down -z
    this.pitch = 0;
    this.speed = 0;
    this.vel.set(0, 0, 0);
    for (const veh of Object.values(this.vehicles)) {
      veh.parked = null;
      veh.root.visible = false;
    }
    this.setMode('walk', true);
    this.placeCamera(1, true);
  }

  setMode(mode, silent = false) {
    if (mode === this.mode && !silent) return;
    if (this.roof && mode !== 'walk') return;
    const old = this.vehicles[this.mode];
    if (old && mode !== this.mode) {
      // leave it parked where you got off
      old.parked = { x: this.pos.x, z: this.pos.z, heading: this.heading };
      old.root.visible = true;
      for (const c of old.root.children) c.visible = true;
      this.setVehicleTransform(old, old.parked.x, old.parked.z, old.parked.heading, 0);
      // step off to the side
      const side = new THREE.Vector3(Math.cos(this.heading), 0, -Math.sin(this.heading));
      this.pos.addScaledVector(side, this.cfg.radius + 0.6);
    }
    const next = this.vehicles[mode];
    if (next) {
      next.parked = null;
      next.root.visible = true;
      this.heading = this.mode === 'walk' ? this.yaw : this.heading;
      this.speed = 0;
    } else {
      this.yaw = this.heading + this.lookOffset;
      this.facing = this.heading + Math.PI;
    }
    this.lookOffset = 0;
    this.mode = mode;
    this.vel.set(0, 0, 0);
    this.steer = 0;
    this.audio.setEngine?.(mode);
  }

  /** Up a fire escape to the roof, or back down to the sidewalk. */
  climb(fe) {
    if (this.roof) {
      this.roof = null;
      this.pos.set(fe.x, 0, fe.z);
    } else {
      const r = this.world.roofAt(fe.roofX, fe.roofZ, 0);
      if (!r) return false;
      this.roof = r;
      this.pos.set(fe.roofX, 0, fe.roofZ);
    }
    this.ground = this.roof ? this.roof.top : this.world.groundAt(this.pos.x, this.pos.z);
    this.vel.set(0, 0, 0);
    this.placeCamera(1, true);
    return true;
  }

  toggleView() {
    this.view = this.view === 'fpv' ? 'chase' : 'fpv';
    this.placeCamera(1, true);
    return this.view;
  }

  setVehicleTransform(veh, x, z, heading, roll) {
    const y = this.world.groundAt(x, z);
    veh.root.position.set(x, y, z);
    // models face +z, heading 0 means driving toward -z
    veh.root.rotation.set(0, heading + Math.PI, -roll, 'YXZ');
  }

  update(dt) {
    const input = this.input;
    const look = input.consumeLook();
    const axes = input.active ? input.axes() : { x: 0, y: 0 };
    const cfg = this.cfg;

    if (this.mode === 'walk') {
      this.yaw -= look.x * MOUSE;
      this.pitch = THREE.MathUtils.clamp(this.pitch - look.y * MOUSE, -1.45, 1.45);
      const sprint = input.sprint;
      const speed = sprint ? cfg.run : cfg.walk;
      const fx = -Math.sin(this.yaw);
      const fz = -Math.cos(this.yaw);
      let wx = fx * axes.y - fz * axes.x;
      let wz = fz * axes.y + fx * axes.x;
      const len = Math.hypot(wx, wz);
      if (len > 1) {
        wx /= len;
        wz /= len;
      }
      const a = 1 - Math.exp(-10 * dt);
      this.vel.x += (wx * speed - this.vel.x) * a;
      this.vel.z += (wz * speed - this.vel.z) * a;
      const px = this.pos.x;
      const pz = this.pos.z;
      this.pos.x += this.vel.x * dt;
      this.pos.z += this.vel.z * dt;
      if (this.roof) {
        // on the roofs: walk anywhere a roof continues at about the same height
        const r = this.world.roofAt(this.pos.x, this.pos.z, 0.35);
        if (!r || Math.abs(r.top - this.roof.top) > 1.3) {
          this.pos.x = px;
          this.pos.z = pz;
          this.vel.set(0, 0, 0);
        } else this.roof = r;
      } else {
        this.world.collide(this.pos, cfg.radius);
      }
      const v = Math.hypot(this.vel.x, this.vel.z);
      if (v > 0.3) this.facing = Math.atan2(this.vel.x, this.vel.z);
      const before = Math.floor(this.phase / Math.PI);
      this.phase += v * dt * (sprint ? 1.55 : 1.9);
      if (Math.floor(this.phase / Math.PI) !== before && v > 0.8) this.audio.footstep(true, sprint);
      this.heading = this.yaw;
      this.roll += (0 - this.roll) * Math.min(1, dt * 6);
    } else {
      // free look relative to the direction of travel, easing back when you stop moving the mouse
      this.lookOffset = THREE.MathUtils.clamp(this.lookOffset - look.x * MOUSE, -2.6, 2.6);
      this.pitch = THREE.MathUtils.clamp(this.pitch - look.y * MOUSE, -1.1, 0.9);
      this.lookIdle = look.x || look.y ? 0 : this.lookIdle + dt;
      if (this.lookIdle > 1.2 && Math.abs(this.speed) > 2) {
        this.lookOffset *= 1 - Math.min(1, dt * 2);
        this.pitch *= 1 - Math.min(1, dt * 1.5);
      }
      const throttle = axes.y;
      const boost = input.sprint && this.mode !== 'bike' ? 1.2 : 1;
      if (throttle > 0) {
        if (this.speed < -0.2) this.speed += cfg.brake * dt;
        else this.speed += cfg.accel * throttle * boost * dt * (1 - (this.speed / (cfg.max * boost)) ** 2);
      } else if (throttle < 0) {
        if (this.speed > 0.2) this.speed -= cfg.brake * -throttle * dt;
        else this.speed = Math.max(-cfg.reverse, this.speed + cfg.accel * 0.5 * throttle * dt);
      } else {
        this.speed *= 1 - Math.min(1, dt * (this.mode === 'bike' ? 0.25 : 0.45));
        if (Math.abs(this.speed) < 0.05) this.speed = 0;
      }
      if (input.brake) this.speed *= 1 - Math.min(1, dt * 3);
      // steering gets gentler at speed so you can still thread traffic at 50 mph
      const steerLimit = cfg.steerMax / (1 + Math.abs(this.speed) * 0.06);
      this.steer += (-axes.x * steerLimit - this.steer) * Math.min(1, dt * 5);
      this.heading += (this.speed / cfg.wheelbase) * Math.tan(this.steer) * dt;
      this.pos.x += -Math.sin(this.heading) * this.speed * dt;
      this.pos.z += -Math.cos(this.heading) * this.speed * dt;
      if (this.world.collide(this.pos, cfg.radius) && Math.abs(this.speed) > 1) {
        this.shake = Math.min(1, Math.abs(this.speed) / 12);
        this.audio.thud?.(this.shake);
        this.speed *= -0.25;
      }
      this.yaw = this.heading + this.lookOffset;
      // two wheels lean into the turn
      const lat = this.speed * this.speed * Math.tan(this.steer) / cfg.wheelbase;
      const targetRoll = THREE.MathUtils.clamp(-lat * 0.05, -1, 1) * cfg.lean;
      this.roll += (targetRoll - this.roll) * Math.min(1, dt * 4);
      this.phase += this.speed * dt * 2.2;
    }

    // stay inside the neighborhood
    const cx = Math.max(D.xMin, Math.min(D.xMax, this.pos.x));
    const cz = Math.max(D.zMin, Math.min(D.zMax, this.pos.z));
    const riverside = D.riverX !== null && cx === D.xMin;
    const pushing = axes.x || axes.y;
    this.atEdge = !!pushing && ((cx !== this.pos.x && !riverside) || cz !== this.pos.z);
    if (cx !== this.pos.x || cz !== this.pos.z) this.speed *= 0.5;
    this.pos.x = cx;
    this.pos.z = cz;

    const g = this.roof ? this.roof.top : this.world.groundAt(this.pos.x, this.pos.z);
    if (Math.abs(g - this.ground) > 0.05 && this.mode !== 'walk') this.bump = 0.06; // curb hop
    this.ground += (g - this.ground) * Math.min(1, dt * 14);
    this.bump *= 1 - Math.min(1, dt * 8);
    this.shake *= 1 - Math.min(1, dt * 5);
    this.onRoad = !this.roof && g < 0.05;

    this.updateModels(dt);
    this.placeCamera(dt);
    this.audio.engine?.(this.mode, Math.abs(this.speed) / (cfg.max || 1), axes.y);
  }

  updateModels(dt) {
    const veh = this.vehicles[this.mode];
    const chase = this.view === 'chase';
    this.guy.root.visible = chase && !this.hero;
    if (this.hero) this.updateHero(dt, veh, chase);
    for (const [id, c] of Object.entries(this.cockpits)) {
      if (id === 'bike' || id === 'moto' || id === 'suv') c.visible = !chase && this.mode === id;
    }
    if (veh) {
      // from the driver's seat the cockpit replaces the outside of the vehicle
      for (const c of veh.root.children) c.visible = chase || c === veh.beam;
      this.setVehicleTransform(veh, this.pos.x, this.pos.z, this.heading, this.roll);
      veh.root.position.y += this.bump;
      for (const w of veh.wheels) w.rotation.x += (this.speed / veh.radius) * dt;
      if (veh.steer) veh.steer.rotation.y = this.steer;
      if (veh.steerGroups) for (const s of veh.steerGroups) s.rotation.y = this.steer;
      if (veh.crank) veh.crank.rotation.x = this.phase * 0.5;
      // the guy rides along
      veh.root.add(this.guy.root);
      this.guy.root.position.set(0, 0, 0);
      this.guy.root.rotation.set(0, 0, 0);
      poseGuy(this.guy, this.mode, this.phase * 0.5, 1, false);
      this.speedo.draw(Math.abs(this.speed) * MPH, this.mode === 'bike' ? 30 : 100);
      this.cockpits.bikeBars.rotation.y = this.steer * 0.9;
      this.cockpits.motoBars.rotation.y = this.steer * 0.8;
      this.cockpits.suvWheel.rotation.y = this.steer * 4;
    } else {
      this.root.add(this.guy.root);
      this.guy.root.position.set(this.pos.x, this.ground, this.pos.z);
      this.guy.root.rotation.set(0, this.facing, 0);
      const v = Math.hypot(this.vel.x, this.vel.z);
      poseGuy(this.guy, 'walk', this.phase, v / 3.6, this.input.sprint && v > 4);
    }
  }

  updateHero(dt, veh, chase) {
    const h = this.hero;
    h.root.visible = chase;
    if (veh) {
      // sit on the seat: hips land where the rider's hips go
      const seat = { bike: [0, -0.1, -0.22], moto: [0, -0.06, -0.35], suv: [-0.45, -0.34, -0.25] }[this.mode];
      if (h.root.parent !== veh.root) veh.root.add(h.root);
      h.root.position.set(...seat);
      h.root.rotation.set(0, 0, 0);
      if (this.heroPose !== this.mode) {
        poseHeroRiding(h, this.mode);
        this.heroPose = this.mode;
      }
    } else {
      if (h.root.parent !== this.root) this.root.add(h.root);
      if (this.heroPose) {
        h.root.traverse((o) => o.isSkinnedMesh && o.skeleton.pose());
        this.heroPose = null;
      }
      h.root.position.set(this.pos.x, this.ground, this.pos.z);
      h.root.rotation.set(0, this.facing, 0);
      animateHero(h, dt, Math.hypot(this.vel.x, this.vel.z));
    }
  }

  placeCamera(dt, snap = false) {
    const cfg = this.cfg;
    const cam = this.camera;
    if (this.view === 'fpv') {
      let bob = 0;
      if (this.mode === 'walk') {
        const v = Math.hypot(this.vel.x, this.vel.z);
        bob = Math.abs(Math.sin(this.phase)) * Math.min(1, v / 3.6) * (this.input.sprint ? 0.07 : 0.045);
      } else if (this.mode === 'moto') {
        bob = Math.sin(performance.now() * 0.09) * 0.004; // engine buzz
      }
      const shake = this.shake * 0.08;
      let x = this.pos.x;
      let z = this.pos.z;
      let eye = cfg.eye;
      if (this.mode === 'suv') {
        // driver's seat is left of center
        x += Math.cos(this.heading) * -0.45 + -Math.sin(this.heading) * 0.2;
        z += -Math.sin(this.heading) * -0.45 + -Math.cos(this.heading) * 0.2;
      }
      if (this.mode === 'bike' || this.mode === 'moto') {
        // lean the camera with the bike, pivoting at the tires
        x += Math.cos(this.heading) * Math.sin(this.roll) * eye * -1;
        z += -Math.sin(this.heading) * Math.sin(this.roll) * eye * -1;
        eye *= Math.cos(this.roll);
      }
      cam.position.set(x + (Math.random() - 0.5) * shake, this.ground + eye + bob + this.bump + (Math.random() - 0.5) * shake, z);
      this.euler.set(this.pitch, this.yaw, this.mode === 'walk' ? 0 : this.roll, 'YXZ');
      cam.quaternion.setFromEuler(this.euler);
      return;
    }
    // chase camera: behind and above, pulled in so it never ends up inside a building
    const [dist, height] = cfg.chase;
    const yaw = this.yaw;
    const pitch = THREE.MathUtils.clamp(this.pitch, -0.6, 0.5);
    const target = this.camTarget.set(this.pos.x, this.ground + (this.mode === 'suv' ? 1.6 : 1.4), this.pos.z);
    let d = dist * Math.cos(pitch * 0.8);
    const bx = Math.sin(yaw);
    const bz = Math.cos(yaw);
    for (let s = 0.5; s <= d; s += 0.4) {
      if (!this.roof && this.world.inside(target.x + bx * s, target.z + bz * s, 0.4)) {
        d = Math.max(0.8, s - 0.5);
        break;
      }
    }
    const want = new THREE.Vector3(target.x + bx * d, target.y + height - 1.2 - pitch * dist * 0.6, target.z + bz * d);
    if (snap) this.camPos.copy(want);
    else this.camPos.lerp(want, 1 - Math.exp(-dt * 10));
    cam.position.copy(this.camPos);
    cam.lookAt(target.x - bx * 2, target.y + 0.3, target.z - bz * 2);
  }
}
