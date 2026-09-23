import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { D } from './config.js';
import { isSignalized, signalState } from './signals.js';
import { sedanGeometry } from './models.js';
import { rand, range, pick, chance } from './random.js';
import { Path } from './osm/geo.js';
import { COMIC } from './comicfx.js';

const BODY_COLORS = [0x3f5a3c, 0xc9a24a, 0x8a2a24, 0xd9d0b4, 0x6f8aa8, 0x3a3d44, 0x1d1e22, 0xb8bcc2, 0x6b7a3a, 0xa0522d, 0x2f4f6f];
const BORO_TAXI = 0x7cc242;
const YELLOW_CAB = 0xf2b705;

/**
 * Cars as a handful of InstancedMeshes (body, cabin, lights...), so a hundred cars
 * cost the same draw calls as one. Moving cars follow lanes, stop at red lights,
 * queue behind each other and wait (and honk) for pedestrians. Parked cars line the curbs.
 */
function busSide() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f3f3ef';
  ctx.fillRect(0, 0, 1024, 256);
  ctx.fillStyle = '#23303e';
  ctx.fillRect(40, 58, 944, 92);
  for (let x = 40; x < 984; x += 118) {
    ctx.fillStyle = '#f3f3ef';
    ctx.fillRect(x, 58, 6, 92);
    if (Math.random() < 0.6) {
      ctx.fillStyle = '#56657a';
      ctx.beginPath();
      ctx.arc(x + 50, 100, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(x + 36, 112, 28, 38);
    }
  }
  ctx.fillStyle = '#1f5fae';
  ctx.fillRect(0, 178, 1024, 26);
  ctx.fillStyle = '#2b2b2b';
  ctx.fillRect(160, 58, 70, 180);
  ctx.fillRect(720, 58, 70, 180);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function busFront(route) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f3f3ef';
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = '#111';
  ctx.fillRect(14, 12, 228, 36);
  ctx.fillStyle = '#ffb020';
  ctx.font = 'bold 28px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(route, 128, 40);
  ctx.fillStyle = '#23303e';
  ctx.fillRect(14, 56, 228, 110);
  ctx.fillStyle = '#1f5fae';
  ctx.fillRect(0, 180, 256, 20);
  ctx.fillStyle = '#fff6d8';
  ctx.fillRect(22, 208, 40, 18);
  ctx.fillRect(194, 208, 40, 18);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeBusMaterials() {
  const side = new THREE.MeshStandardMaterial({ map: busSide(), roughness: 0.6 });
  const roof = new THREE.MeshStandardMaterial({ color: 0xe8e8e4, roughness: 0.7 });
  const front = new THREE.MeshStandardMaterial({ map: busFront(D.busRoute ?? 'Q69  LOCAL'), roughness: 0.6 });
  const back = new THREE.MeshStandardMaterial({ color: 0xe8e8e4, roughness: 0.7 });
  // BoxGeometry groups: +x, -x, +y, -y, +z (front), -z (back)
  return [side, side, roof, roof, front, back];
}

export class Traffic {
  /**
   * spec (real-map mode): { lanes: [{ pts, crossings: [{ s, axis, half }], busy }], parked: [{ x, z, rot }] }.
   * Without it, lanes come from the district's street grid.
   */
  constructor(shared, audio, spec = null) {
    this.audio = audio;
    this.group = new THREE.Group();
    this.lanes = [];
    this.cars = [];
    this.parked = [];

    if (spec) {
      for (const l of spec.lanes) {
        const lane = { path: new Path(l.pts), crossings: l.crossings ?? [], cars: [] };
        if (lane.path.len < 30) continue;
        this.lanes.push(lane);
        const n = Math.max(1, Math.round((lane.path.len / (l.busy ? 70 : 150)) * (0.6 + rand() * 0.6)));
        for (let k = 0; k < n; k++) this.addCar(lane, l.busy);
      }
      for (const p of spec.parked) this.parked.push({ ...p, color: pick(BODY_COLORS) });
    } else this.gridLanes();
    for (const lane of this.lanes) {
      const span = lane.path.len;
      lane.cars.forEach((c, k) => (c.s = ((k + rand() * 0.5) * span) / lane.cars.length));
    }
    this.buildMeshes(shared);
  }

  gridLanes() {
    const { nsW: NS_W, ewW: EW_W, NX, NZ, colX, rowZ } = D;
    const elNS = D.el?.axis === 'ns' && !D.el.underground ? D.el.index : null;
    // two-way roads: drive on the right
    const addLane = (pts, crossings, busy, n) => {
      const lane = { path: new Path(pts), crossings, cars: [] };
      this.lanes.push(lane);
      for (let k = 0; k < n; k++) this.addCar(lane, busy);
    };
    for (let i = 0; i < NX; i++) {
      for (const dir of [-1, 1]) {
        // heading south (+z) means driving on the west side
        const x = colX(i) + (dir > 0 ? -3.2 : 3.2);
        const [a, b] = dir > 0 ? [D.laneZ0, D.laneZ1] : [D.laneZ1, D.laneZ0];
        const crossings = [...Array(NZ).keys()].filter((j) => isSignalized(i, j)).map((j) => ({ s: (rowZ(j) - a) * dir, axis: 'ns', half: EW_W / 2 }));
        const busy = D.commercialNS.has(i);
        addLane([[x, a], [x, b]], crossings, busy, busy ? 4 : 2);
      }
    }
    for (let j = 0; j < NZ; j++) {
      for (const dir of [-1, 1]) {
        const z = rowZ(j) + (dir > 0 ? 3.5 : -3.5);
        const [a, b] = dir > 0 ? [D.laneX0, D.laneX1] : [D.laneX1, D.laneX0];
        const crossings = [...Array(NX).keys()].filter((i) => isSignalized(i, j)).map((i) => ({ s: (colX(i) - a) * dir, axis: 'ew', half: NS_W / 2 }));
        const busy = D.commercialEW.has(j);
        addLane([[a, z], [b, z]], crossings, busy, busy ? 3 : 1);
      }
    }

    // parked cars along the curbs of the north-south streets
    for (let i = Math.max(D.iLo, -1); i <= Math.min(D.iHi, NX); i++) {
      if (i === elNS) continue;
      for (let j = Math.max(D.rMin, -1); j <= Math.min(D.rMax - 1, NZ - 1); j++) {
        const a = rowZ(j) + EW_W / 2 + 6;
        const b = rowZ(j + 1) - EW_W / 2 - 6;
        for (const side of [-1, 1]) {
          for (let z = a; z < b - 5; z += range(5.6, 7.5)) {
            if (!chance(0.72)) continue;
            this.parked.push({ x: colX(i) + side * (NS_W / 2 - 1.1), z, rot: side < 0 ? 0 : Math.PI, color: pick(BODY_COLORS) });
          }
        }
      }
    }
  }

  addCar(lane, busy = false) {
    const r = rand();
    const kind = busy && rand() < 0.14 ? 'bus' : r < 0.12 ? 'yellow' : r < 0.3 ? 'boro' : 'car';
    const car = {
      lane, s: 0, v: range(6, 10), vmax: range(9, 13), kind,
      color: kind === 'yellow' ? YELLOW_CAB : kind === 'boro' ? BORO_TAXI : pick(BODY_COLORS),
      wait: 0, honked: false, braking: false, hidden: false, len: kind === 'bus' ? 12 : 4.7,
    };
    if (kind === 'bus') car.vmax = range(7, 9);
    lane.cars.push(car);
    this.cars.push(car);
  }

  buildMeshes(shared) {
    const N = this.cars.length + this.parked.length;
    this.count = N;
    const sedan = sedanGeometry();
    const body = sedan.body;
    const cabin = sedan.glass;
    const wheels = [];
    for (const [x, z] of [[-0.82, 1.45], [0.82, 1.45], [-0.82, -1.45], [0.82, -1.45]]) {
      const w = new THREE.CylinderGeometry(0.34, 0.34, 0.26, 12);
      w.rotateZ(Math.PI / 2);
      w.translate(x, 0.34, z);
      wheels.push(w);
      const hub = new THREE.CylinderGeometry(0.2, 0.2, 0.28, 10);
      hub.rotateZ(Math.PI / 2);
      hub.translate(x, 0.34, z);
      wheels.push(hub);
    }
    const head = mergeGeometries([0.6, -0.6].map((x) => new THREE.BoxGeometry(0.38, 0.14, 0.06).translate(x, 0.7, 2.4)));
    const tail = mergeGeometries([0.66, -0.66].map((x) => new THREE.BoxGeometry(0.34, 0.16, 0.06).translate(x, 0.75, -2.42)));
    const roofSign = new THREE.BoxGeometry(0.8, 0.26, 0.3).translate(0, 1.55, -0.2);
    const beam = new THREE.PlaneGeometry(3.2, 11);
    beam.rotateX(-Math.PI / 2);
    beam.translate(0, 0.04, 2.3 + 5.5);
    // texture runs bright near the car
    const buv = beam.attributes.uv;
    for (let i = 0; i < buv.count; i++) buv.setY(i, 1 - buv.getY(i));

    const inst = (geo, mat) => {
      const m = new THREE.InstancedMesh(geo, mat, N);
      m.frustumCulled = false;
      this.group.add(m);
      return m;
    };
    this.mBody = inst(body, new THREE.MeshStandardMaterial({ roughness: 0.25, metalness: 0.7 }));
    this.mCabin = inst(cabin, new THREE.MeshStandardMaterial({ color: 0x2a3a4e, roughness: 0.3 }));
    this.mWheels = inst(mergeGeometries(wheels), new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.9 }));
    this.mHead = inst(head, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    this.mTail = inst(tail, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    this.mSign = inst(roofSign, new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.6, 1.6) }));
    // checkered band along the doors of yellow cabs
    const checkerCanvas = document.createElement('canvas');
    checkerCanvas.width = 64;
    checkerCanvas.height = 8;
    const cx = checkerCanvas.getContext('2d');
    for (let x = 0; x < 16; x++) {
      for (let y = 0; y < 2; y++) {
        cx.fillStyle = (x + y) % 2 ? '#111' : '#f4f1e8';
        cx.fillRect(x * 4, y * 4, 4, 4);
      }
    }
    const checkerTex = new THREE.CanvasTexture(checkerCanvas);
    checkerTex.colorSpace = THREE.SRGBColorSpace;
    checkerTex.magFilter = THREE.NearestFilter;
    const checker = mergeGeometries([-1, 1].map((sx) => new THREE.BoxGeometry(0.02, 0.14, 2.2).translate(sx * 1.0, 0.78, -0.2)));
    this.mChecker = inst(checker, new THREE.MeshStandardMaterial({ map: checkerTex, roughness: 0.5 }));
    this.mBeam = inst(
      beam,
      new THREE.MeshBasicMaterial({
        map: shared.headlight, color: 0xfff1d8, transparent: true, opacity: 0.4,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );

    // buses: white and blue, route sign up front
    this.buses = this.cars.filter((c) => c.kind === 'bus');
    this.buses.forEach((b, k) => (b.busIdx = k));
    const nb = Math.max(1, this.buses.length);
    const busGeo = new THREE.BoxGeometry(2.55, 2.9, 12);
    busGeo.translate(0, 1.8, 0);
    const busMats = makeBusMaterials();
    this.mBus = new THREE.InstancedMesh(busGeo, busMats, nb);
    this.mBus.frustumCulled = false;
    this.group.add(this.mBus);
    const bw = [];
    for (const [x, z] of [[-1.15, 4], [1.15, 4], [-1.15, -3.6], [1.15, -3.6]]) {
      bw.push(new THREE.CylinderGeometry(0.5, 0.5, 0.35, 12).rotateZ(Math.PI / 2).translate(x, 0.5, z));
    }
    this.mBusWheels = new THREE.InstancedMesh(mergeGeometries(bw), new THREE.MeshStandardMaterial({ color: 0x141416 }), nb);
    this.mBusWheels.frustumCulled = false;
    this.group.add(this.mBusWheels);

    const c = new THREE.Color();
    const m = new THREE.Matrix4();
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    this.cars.forEach((car, k) => {
      this.mBody.setColorAt(k, c.set(car.color));
      this.mHead.setColorAt(k, c.setRGB(5, 4.7, 4.1));
    });
    this.parked.forEach((p, n) => {
      const k = this.cars.length + n;
      m.makeRotationY(p.rot).setPosition(p.x, 0, p.z);
      for (const mesh of [this.mBody, this.mCabin, this.mWheels, this.mHead, this.mTail]) mesh.setMatrixAt(k, m);
      this.mSign.setMatrixAt(k, zero);
      this.mChecker.setMatrixAt(k, zero);
      this.mBeam.setMatrixAt(k, zero);
      this.mBody.setColorAt(k, c.set(p.color));
      this.mHead.setColorAt(k, c.setRGB(0.05, 0.05, 0.05));
      this.mTail.setColorAt(k, c.setRGB(0.25, 0.02, 0.02));
    });
    for (const mesh of [this.mBody, this.mHead, this.mTail]) mesh.instanceColor.needsUpdate = true;
    this._m = m;
    this._zero = zero;
    this._c = c;
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3(1, 1, 1);
  }

  update(t, dt, player, camera) {
    const pp = player.position;
    const onRoad = player.onRoad;
    const tmp = [0, 0, 0, 0];
    for (const lane of this.lanes) {
      const path = lane.path;
      for (const car of lane.cars) {
        if (car.hidden) {
          const [sx, sz] = path.at(0, tmp);
          const clear = lane.cars.every((o) => o === car || o.hidden || o.s > 12);
          if (Math.hypot(sx - pp.x, sz - pp.z) > 70 && clear) {
            car.hidden = false;
            car.s = 0;
          } else continue;
        }
        let target = car.vmax;
        for (const cr of lane.crossings) {
          const d = cr.s - (cr.half + 4.2) - car.s;
          if (d < -0.5 || d > 45) continue;
          const light = signalState(t, cr.axis);
          if (light !== 'G' && (light === 'R' || d > 7)) {
            target = Math.min(target, Math.sqrt(2 * 5 * Math.max(0, d - 0.3)));
            break;
          }
        }
        for (const o of lane.cars) {
          if (o === car || o.hidden) continue;
          const gap = o.s - car.s;
          if (gap > 0 && gap < 50) target = Math.min(target, Math.sqrt(2 * 5 * Math.max(0, gap - (car.len + o.len) / 2 - 2.3)));
        }
        let waiting = false;
        if (onRoad && car.x !== undefined) {
          const rx = pp.x - car.x;
          const rz = pp.z - car.z;
          const d = rx * car.dx + rz * car.dz - car.len / 2;
          const lateral = Math.abs(rx * car.dz - rz * car.dx);
          if (lateral < 1.8 && d > -1.5 && d < 22) {
            target = Math.min(target, Math.sqrt(2 * 7 * Math.max(0, d - 1.8)));
            waiting = d < 9;
          }
        }
        if (waiting && car.v < 0.5) {
          car.wait += dt;
          if (car.wait > 1.4 && !car.honked) {
            car.honked = true;
            this.audio?.honk(this.panFor(camera, lane, car), 0.16);
            if (car.x !== undefined) COMIC.pop(car.kind === 'bus' ? 'HOOOONK!' : 'HONK!', car.x, 2.2, car.z, { cooldown: 3, key: 'honk' });
          }
        } else if (!waiting) {
          car.wait = 0;
          car.honked = false;
        }
        car.braking = target < car.v - 0.2;
        const v0 = car.v;
        if (car.v < target) car.v = Math.min(target, car.v + 3 * dt);
        else car.v = Math.max(target, car.v - 8 * dt);
        car.s += car.v * dt;
        if (car.s > path.len) {
          car.hidden = true;
          continue;
        }
        // body pitch follows acceleration (nose dips when braking), roll follows turning
        const accel = dt > 0 ? (car.v - v0) / dt : 0;
        car.pitch = (car.pitch ?? 0) + (THREE.MathUtils.clamp(-accel * 0.012, -0.045, 0.06) - (car.pitch ?? 0)) * Math.min(1, dt * 6);
        const heading0 = car.dx === undefined ? 0 : Math.atan2(car.dx, car.dz);
        path.at(car.s, tmp);
        car.x = tmp[0];
        car.z = tmp[1];
        // ease the heading through corners instead of snapping per segment
        if (car.dx === undefined) {
          car.dx = tmp[2];
          car.dz = tmp[3];
        } else {
          const k = Math.min(1, dt * (2 + car.v * 0.5));
          car.dx += (tmp[2] - car.dx) * k;
          car.dz += (tmp[3] - car.dz) * k;
          const l = Math.hypot(car.dx, car.dz) || 1;
          car.dx /= l;
          car.dz /= l;
          const turn = Math.atan2(Math.sin(Math.atan2(car.dx, car.dz) - heading0), Math.cos(Math.atan2(car.dx, car.dz) - heading0)) / Math.max(dt, 1e-3);
          car.roll = (car.roll ?? 0) + (THREE.MathUtils.clamp(turn * car.v * 0.006, -0.05, 0.05) - (car.roll ?? 0)) * Math.min(1, dt * 5);
        }
      }
    }

    const { _m: m, _q: q, _p: p, _s: s, _zero: zero, _c: c } = this;
    const up = new THREE.Vector3(0, 1, 0);
    this.cars.forEach((car, k) => {
      if (car.kind === 'bus') {
        for (const mesh of [this.mBody, this.mCabin, this.mWheels, this.mHead, this.mTail, this.mSign, this.mChecker, this.mBeam]) mesh.setMatrixAt(k, zero);
        if (car.hidden) {
          this.mBus.setMatrixAt(car.busIdx, zero);
          this.mBusWheels.setMatrixAt(car.busIdx, zero);
          return;
        }
        if (car.x === undefined) return;
        q.setFromAxisAngle(up, Math.atan2(car.dx, car.dz));
        p.set(car.x, 0, car.z);
        m.compose(p, q, s);
        this.mBus.setMatrixAt(car.busIdx, m);
        this.mBusWheels.setMatrixAt(car.busIdx, m);
        return;
      }
      if (car.hidden || car.x === undefined) {
        for (const mesh of [this.mBody, this.mCabin, this.mWheels, this.mHead, this.mTail, this.mSign, this.mChecker, this.mBeam]) mesh.setMatrixAt(k, zero);
        return;
      }
      this._e.set(car.pitch ?? 0, Math.atan2(car.dx, car.dz), car.roll ?? 0, 'YXZ');
      q.setFromEuler(this._e);
      p.set(car.x, 0, car.z);
      m.compose(p, q, s);
      for (const mesh of [this.mBody, this.mCabin, this.mWheels, this.mHead, this.mTail, this.mBeam]) mesh.setMatrixAt(k, m);
      this.mSign.setMatrixAt(k, car.kind === 'car' ? zero : m);
      this.mChecker.setMatrixAt(k, car.kind === 'yellow' ? m : zero);
      this.mTail.setColorAt(k, car.braking || car.v < 0.3 ? c.setRGB(7, 0.3, 0.2) : c.setRGB(2.4, 0.1, 0.08));
    });
    for (const mesh of [this.mBody, this.mCabin, this.mWheels, this.mHead, this.mTail, this.mSign, this.mChecker, this.mBeam]) {
      mesh.instanceMatrix.needsUpdate = true;
    }
    this.mTail.instanceColor.needsUpdate = true;
    this.mBus.instanceMatrix.needsUpdate = true;
    this.mBusWheels.instanceMatrix.needsUpdate = true;
  }

  panFor(camera, lane, car) {
    const x = car.x ?? 0;
    const z = car.z ?? 0;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const to = new THREE.Vector3(x - camera.position.x, 0, z - camera.position.z).normalize();
    return Math.max(-1, Math.min(1, right.dot(to)));
  }
}

