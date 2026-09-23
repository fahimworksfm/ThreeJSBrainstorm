import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { D } from './config.js';
import { isSignalized, signalState } from './signals.js';
import { rand, range, pick, chance } from './random.js';

const BODY_COLORS = [0x0b0c0f, 0x1a1c20, 0x2a2d33, 0x6b6e73, 0xb8bbbf, 0x3a0d10, 0x0f1d33, 0x223322];
const BORO_TAXI = 0x7cc242;
const YELLOW_CAB = 0xf2b705;

/**
 * Cars as a handful of InstancedMeshes (body, cabin, lights...), so a hundred cars
 * cost the same draw calls as one. Moving cars follow lanes, stop at red lights,
 * queue behind each other and wait (and honk) for pedestrians. Parked cars line the curbs.
 */
export class Traffic {
  constructor(shared, audio) {
    this.audio = audio;
    this.group = new THREE.Group();
    this.lanes = [];
    this.cars = [];
    this.parked = [];

    const { nsW: NS_W, ewW: EW_W, NX, NZ, colX, rowZ } = D;
    const elNS = D.el?.axis === 'ns' ? D.el.index : null;
    // two-way roads: drive on the right
    for (let i = 0; i < NX; i++) {
      for (const dir of [-1, 1]) {
        const lane = {
          // heading south (+z) means driving on the west side
          axis: 'z', fixed: colX(i) + (dir > 0 ? -3.2 : 3.2), dir, min: D.laneZ0, max: D.laneZ1,
          crossings: [...Array(NZ).keys()].filter((j) => isSignalized(i, j)).map((j) => rowZ(j)), half: EW_W / 2, cars: [],
        };
        this.lanes.push(lane);
        const busy = D.commercialNS.has(i);
        for (let k = 0; k < (busy ? 4 : 2); k++) this.addCar(lane);
      }
    }
    for (let j = 0; j < NZ; j++) {
      for (const dir of [-1, 1]) {
        const lane = {
          axis: 'x', fixed: rowZ(j) + (dir > 0 ? 3.5 : -3.5), dir, min: D.laneX0, max: D.laneX1,
          crossings: [...Array(NX).keys()].filter((i) => isSignalized(i, j)).map((i) => colX(i)), half: NS_W / 2, cars: [],
        };
        this.lanes.push(lane);
        const busy = D.commercialEW.has(j);
        for (let k = 0; k < (busy ? 3 : 1); k++) this.addCar(lane);
      }
    }
    for (const lane of this.lanes) {
      lane.cars.sort((a, b) => a.s - b.s);
      const span = lane.max - lane.min;
      lane.cars.forEach((c, k) => (c.s = lane.min + ((k + rand() * 0.5) * span) / lane.cars.length));
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

    this.buildMeshes(shared);
  }

  addCar(lane) {
    const r = rand();
    const kind = r < 0.12 ? 'yellow' : r < 0.3 ? 'boro' : 'car';
    const car = {
      lane, s: 0, v: range(6, 10), vmax: range(9, 13), kind,
      color: kind === 'yellow' ? YELLOW_CAB : kind === 'boro' ? BORO_TAXI : pick(BODY_COLORS),
      wait: 0, honked: false, braking: false, hidden: false,
    };
    lane.cars.push(car);
    this.cars.push(car);
  }

  buildMeshes(shared) {
    const N = this.cars.length + this.parked.length;
    this.count = N;
    const body = new THREE.BoxGeometry(1.9, 0.75, 4.6);
    body.translate(0, 0.72, 0);
    const cabin = new THREE.BoxGeometry(1.7, 0.6, 2.4);
    cabin.translate(0, 1.4, -0.2);
    const wheels = [];
    for (const [x, z] of [[-0.85, 1.45], [0.85, 1.45], [-0.85, -1.45], [0.85, -1.45]]) {
      const w = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 7);
      w.rotateZ(Math.PI / 2);
      w.translate(x, 0.34, z);
      wheels.push(w);
    }
    const head = mergeGeometries([0.62, -0.62].map((x) => new THREE.BoxGeometry(0.4, 0.16, 0.05).translate(x, 0.8, 2.31)));
    const tail = mergeGeometries([0.66, -0.66].map((x) => new THREE.BoxGeometry(0.34, 0.14, 0.05).translate(x, 0.85, -2.31)));
    const roofSign = new THREE.BoxGeometry(0.8, 0.26, 0.3).translate(0, 1.83, -0.2);
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
    this.mCabin = inst(cabin, new THREE.MeshStandardMaterial({ color: 0x07090c, roughness: 0.1, metalness: 0.9 }));
    this.mWheels = inst(mergeGeometries(wheels), new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.9 }));
    this.mHead = inst(head, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    this.mTail = inst(tail, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    this.mSign = inst(roofSign, new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.6, 1.6) }));
    this.mBeam = inst(
      beam,
      new THREE.MeshBasicMaterial({
        map: shared.headlight, color: 0xfff1d8, transparent: true, opacity: 0.4,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );

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
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3(1, 1, 1);
  }

  update(t, dt, player, camera) {
    const pp = player.position;
    for (const lane of this.lanes) {
      const axisKey = lane.axis === 'z' ? 'ns' : 'ew';
      const light = signalState(t, axisKey);
      const pAlong = lane.axis === 'z' ? pp.z : pp.x;
      const pLateral = lane.axis === 'z' ? pp.x : pp.z;
      const playerInLane = Math.abs(pLateral - lane.fixed) < 1.8 && player.onRoad;
      for (const car of lane.cars) {
        if (car.hidden) {
          const start = lane.dir > 0 ? lane.min : lane.max;
          const sx = lane.axis === 'z' ? lane.fixed : start;
          const sz = lane.axis === 'z' ? start : lane.fixed;
          const clear = lane.cars.every((o) => o === car || o.hidden || Math.abs(o.s - start) > 12);
          if (Math.hypot(sx - pp.x, sz - pp.z) > 70 && clear) {
            car.hidden = false;
            car.s = start;
          } else continue;
        }
        let target = car.vmax;
        if (light !== 'G') {
          for (const cz of lane.crossings) {
            const stop = cz - lane.dir * (lane.half + 4.2);
            const d = (stop - car.s) * lane.dir;
            if (d > -0.5 && d < 45 && (light === 'R' || d > 7)) {
              target = Math.min(target, Math.sqrt(2 * 5 * Math.max(0, d - 0.3)));
              break;
            }
          }
        }
        for (const o of lane.cars) {
          if (o === car || o.hidden) continue;
          const gap = (o.s - car.s) * lane.dir;
          if (gap > 0 && gap < 40) target = Math.min(target, Math.sqrt(2 * 5 * Math.max(0, gap - 7)));
        }
        let waiting = false;
        if (playerInLane) {
          const d = (pAlong - car.s) * lane.dir - 2.4;
          if (d > -1.5 && d < 22) {
            target = Math.min(target, Math.sqrt(2 * 7 * Math.max(0, d - 1.8)));
            waiting = d < 9;
          }
        }
        if (waiting && car.v < 0.5) {
          car.wait += dt;
          if (car.wait > 1.4 && !car.honked) {
            car.honked = true;
            this.audio?.honk(this.panFor(camera, lane, car), 0.16);
          }
        } else if (!waiting) {
          car.wait = 0;
          car.honked = false;
        }
        car.braking = target < car.v - 0.2;
        if (car.v < target) car.v = Math.min(target, car.v + 3 * dt);
        else car.v = Math.max(target, car.v - 8 * dt);
        car.s += car.v * lane.dir * dt;
        if ((lane.dir > 0 && car.s > lane.max) || (lane.dir < 0 && car.s < lane.min)) car.hidden = true;
      }
    }

    const { _m: m, _q: q, _p: p, _s: s, _zero: zero, _c: c } = this;
    const up = new THREE.Vector3(0, 1, 0);
    this.cars.forEach((car, k) => {
      if (car.hidden) {
        for (const mesh of [this.mBody, this.mCabin, this.mWheels, this.mHead, this.mTail, this.mSign, this.mBeam]) mesh.setMatrixAt(k, zero);
        return;
      }
      const lane = car.lane;
      const yaw = lane.axis === 'z' ? (lane.dir > 0 ? 0 : Math.PI) : lane.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      q.setFromAxisAngle(up, yaw);
      if (lane.axis === 'z') p.set(lane.fixed, 0, car.s);
      else p.set(car.s, 0, lane.fixed);
      m.compose(p, q, s);
      for (const mesh of [this.mBody, this.mCabin, this.mWheels, this.mHead, this.mTail, this.mBeam]) mesh.setMatrixAt(k, m);
      this.mSign.setMatrixAt(k, car.kind === 'car' ? zero : m);
      this.mTail.setColorAt(k, car.braking || car.v < 0.3 ? c.setRGB(7, 0.3, 0.2) : c.setRGB(2.4, 0.1, 0.08));
    });
    for (const mesh of [this.mBody, this.mCabin, this.mWheels, this.mHead, this.mTail, this.mSign, this.mBeam]) {
      mesh.instanceMatrix.needsUpdate = true;
    }
    this.mTail.instanceColor.needsUpdate = true;
  }

  panFor(camera, lane, car) {
    const x = lane.axis === 'z' ? lane.fixed : car.s;
    const z = lane.axis === 'z' ? car.s : lane.fixed;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const to = new THREE.Vector3(x - camera.position.x, 0, z - camera.position.z).normalize();
    return Math.max(-1, Math.min(1, right.dot(to)));
  }
}

