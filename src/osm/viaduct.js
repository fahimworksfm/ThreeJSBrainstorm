// The elevated line on real streets: the same steel, stations and trains as the grid version,
// built along a straight local frame and then bent onto the street's real centerline.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CURB, D } from '../config.js';
import { range } from '../random.js';
import { facadeBox } from '../buildings.js';
import { STYLES, TRACK_OFFSET, ACCEL, box, latticeTexture, trainWindowTexture, stationSignTexture } from '../elevated.js';
import { Path, resample } from './geo.js';
import { buildBusStops } from '../busstop.js';

/** Smooth a polyline with a moving average (ends stay put). */
function smooth(pts, k) {
  const out = pts.map((p) => p.slice());
  for (let i = 1; i < pts.length - 1; i++) {
    let x = 0;
    let z = 0;
    let n = 0;
    for (let j = Math.max(0, i - k); j <= Math.min(pts.length - 1, i + k); j++) {
      x += pts[j][0];
      z += pts[j][1];
      n++;
    }
    out[i] = [x / n, z / n];
  }
  return out;
}

/** Bend geometry built with x = sideways, z = distance along the line onto the path. */
function bend(g, path) {
  const pos = g.attributes.position;
  const nrm = g.attributes.normal;
  const f = [0, 0, 0, 0];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const s = pos.getZ(i);
    path.at(s, f);
    // local +x is the left of travel, (dz, -dx), so the mapping stays a rotation (no mirror)
    const lx = f[3];
    const lz = -f[2];
    pos.setXYZ(i, f[0] + lx * x, pos.getY(i), f[1] + lz * x);
    if (nrm) {
      const nx = nrm.getX(i);
      const nz = nrm.getZ(i);
      nrm.setXYZ(i, lx * nx + f[2] * nz, nrm.getY(i), lz * nx + f[3] * nz);
    }
  }
  pos.needsUpdate = true;
  return g;
}

/** A long box cut into short pieces so it can follow a curve. */
function longBox(w, h, x, y, s0, s1, step = 4) {
  const out = [];
  for (let s = s0; s < s1; s += step) {
    const e = Math.min(s1, s + step);
    out.push(box(w, h, e - s + 0.02, x, y, (s + e) / 2));
  }
  return out;
}

/**
 * line: centerline points of the street the el runs over.
 * stations: [{ s, name }] along it; crossings: [s] where other streets cross under.
 * spot(x, z): nearest walkable sidewalk point, used for the stair entrances.
 */
export function buildViaduct({ line, stations, crossings, streetW, shared, kit, spot }) {
  const el = D.el;
  const style = STYLES[el.style] ?? STYLES.subway;
  const CAR_LEN = style.carLen;
  const CAR_GAP = 0.5;
  const TRAIN_LEN = style.cars * (CAR_LEN + CAR_GAP);
  const VMAX = style.vmax;
  const group = new THREE.Group();
  const path = new Path(smooth(resample(line, 2), 6));
  const len = path.len;
  const colliders = [];
  const entrances = [];
  const f = [0, 0, 0, 0];
  const toWorld = (x, s) => {
    path.at(s, f);
    return [f[0] + f[3] * x, f[1] - f[2] * x];
  };
  const crossHalf = 7;

  if (el.underground && el.bus) {
    const stops = [];
    for (const st of stations) {
      for (const side of [1, -1]) {
        const [wx, wz] = toWorld(side * (streetW / 2 + 1.2), st.s + side * (crossHalf + 6));
        const [x, z] = spot(wx, wz);
        // face the shelter's pole toward the street's centerline
        const [cx, cz] = toWorld(0, st.s + side * (crossHalf + 6));
        stops.push({ x, z, ang: Math.atan2(cx - x, cz - z), name: st.name });
      }
    }
    const b = buildBusStops(stops, el.route ?? 'BUS', kit);
    return { group: b.group, update() {}, colliders: b.colliders, rumbleAt: () => 0, events: { braking: false, horn: null }, entrances: b.entrances, path };
  }
  if (el.underground) {
    // stair entrances on the corners at each station
    const rail = [];
    const stairs = [];
    const signs = new Map();
    for (const st of stations) {
      for (const side of [1, -1]) {
        const lat = side * (streetW / 2 + 2.3);
        const s = st.s + side * (crossHalf + 5);
        const [wx, wz] = toWorld(lat, s);
        const [ex, ez] = spot(wx, wz);
        const dx = ex - wx;
        const dz = ez - wz;
        const pieces = [box(1.7, 0.05, 3.6, lat, CURB + 0.01, s)];
        const railPieces = [];
        for (const ox of [-0.9, 0.9]) {
          railPieces.push(box(0.06, 0.06, 3.6, lat + ox, CURB + 1.0, s));
          for (let k = -1.7; k <= 1.7; k += 0.425) railPieces.push(box(0.035, 1.0, 0.035, lat + ox, CURB + 0.5, s + k));
        }
        railPieces.push(box(1.8, 0.06, 0.06, lat, CURB + 1.0, s - side * 1.8));
        const shift = (g) => bend(g, path).translate(dx, 0, dz);
        for (const g of pieces) stairs.push(shift(g));
        for (const g of railPieces) rail.push(shift(g));
        const [cx, cz] = toWorld(lat, s);
        colliders.push({ x0: cx + dx - 1, x1: cx + dx + 1, z0: cz + dz - 1, z1: cz + dz + 1 });
        const [nx, nz] = toWorld(lat, s + side * 2.4);
        entrances.push({ x: nx + dx, z: nz + dz, name: st.name });
        for (const ox of [-0.9, 0.9]) {
          const [gx, gz] = toWorld(lat + ox, s + side * 1.8);
          kit.add(gx + dx, gz + dz, f[2] * side, f[3] * side, { globe: true, height: 1.3, kind: 'green', pool: 2.5 });
        }
        const sg = new THREE.PlaneGeometry(1.7, 0.32);
        if (side < 0) sg.rotateY(Math.PI);
        sg.translate(lat, CURB + 1.35, s + side * 1.82);
        if (!signs.has(st.name)) signs.set(st.name, []);
        signs.get(st.name).push(shift(sg));
      }
    }
    if (rail.length) group.add(new THREE.Mesh(mergeGeometries(rail), new THREE.MeshStandardMaterial({ color: 0x1c3a26, roughness: 0.6 })));
    if (stairs.length) group.add(new THREE.Mesh(mergeGeometries(stairs), new THREE.MeshBasicMaterial({ color: 0x050506 })));
    for (const [name, geos] of signs) {
      const tex = stationSignTexture(name, el.bullets, el.subtitle);
      group.add(new THREE.Mesh(mergeGeometries(geos), new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.9, side: THREE.DoubleSide })));
    }
    return { group, update() {}, colliders, rumbleAt: () => 0, events: { braking: false, horn: null }, entrances, path };
  }

  const deckY = CURB + el.height;
  const steel = [];
  const nearCrossing = (s) => crossings.some((c) => Math.abs(s - c) < crossHalf + 1.5);
  for (let s = 4; s < len - 2; s += 15) {
    if (nearCrossing(s)) continue;
    for (const side of [-1, 1]) {
      const x = side * 5.6;
      steel.push(box(0.45, deckY - 0.9, 0.45, x, (deckY - 0.9) / 2, s));
      steel.push(box(0.8, 0.3, 0.8, x, 0.15, s));
      steel.push(box(0.9, 0.5, 0.9, x, deckY - 1.1, s));
      const [cx, cz] = toWorld(x, s);
      colliders.push({ x0: cx - 0.45, x1: cx + 0.45, z0: cz - 0.45, z1: cz + 0.45 });
    }
    steel.push(box(12.4, 0.8, 0.5, 0, deckY - 0.5, s));
  }
  for (const x of [-5.6, -1.8, 1.8, 5.6]) steel.push(...longBox(0.35, 1.3, x, deckY - 0.55, 0, len));
  steel.push(...longBox(12, 0.25, 0, deckY, 0, len));
  group.add(new THREE.Mesh(bend(mergeGeometries(steel), path), new THREE.MeshStandardMaterial({ color: 0x2c3530, roughness: 0.6, metalness: 0.6 })));

  const rails = [];
  for (const t of [-TRACK_OFFSET, TRACK_OFFSET]) for (const r of [-0.72, 0.72]) rails.push(...longBox(0.1, 0.16, t + r, deckY + 0.2, 0, len, 6));
  for (let s = 0; s < len; s += 1.1) for (const t of [-TRACK_OFFSET, TRACK_OFFSET]) rails.push(box(2.3, 0.1, 0.22, t, deckY + 0.1, s));
  group.add(new THREE.Mesh(bend(mergeGeometries(rails), path), new THREE.MeshStandardMaterial({ color: 0x3d3834, roughness: 0.7, metalness: 0.5 })));

  const walls = [];
  for (const side of [-1, 1]) {
    for (let s = 0; s < len; s += 4) {
      const e = Math.min(len, s + 4);
      const g = new THREE.PlaneGeometry(e - s, 1.4);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setX(i, (s + uv.getX(i) * (e - s)) / 2.8);
      g.rotateY(Math.PI / 2);
      g.translate(side * 6, deckY + 0.7, (s + e) / 2);
      walls.push(g);
    }
  }
  group.add(
    new THREE.Mesh(
      bend(mergeGeometries(walls), path),
      new THREE.MeshStandardMaterial({ map: latticeTexture(), color: 0x2c3530, alphaTest: 0.5, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.6 }),
    ),
  );

  // ---- stations
  const stationS = [];
  const platform = [];
  const tubes = [];
  const glow = [];
  const mezz = [];
  const signTex = new Map();
  const stationLen = TRAIN_LEN + 6;
  for (const st of stations) {
    const zc = Math.max(stationLen / 2 + 2, Math.min(len - stationLen / 2 - 2, st.s));
    stationS.push(zc);
    for (const side of [-1, 1]) {
      const px = side * 5.5;
      platform.push(box(3.2, 1.1, stationLen, px, deckY + 0.55, zc));
      platform.push(box(3.6, 0.2, stationLen, px, deckY + 4.3, zc));
      for (let z = zc - stationLen / 2 + 4; z < zc + stationLen / 2; z += 12) platform.push(box(0.15, 3.2, 0.15, px + side * 1.2, deckY + 2.7, z));
      tubes.push(box(0.12, 0.06, stationLen - 6, px, deckY + 4.15, zc));
      const pool = new THREE.PlaneGeometry(3, stationLen);
      pool.rotateX(-Math.PI / 2);
      pool.translate(px, deckY + 1.13, zc);
      glow.push(pool);
      for (const dz of [-30, 30]) {
        const g = new THREE.PlaneGeometry(9, 0.85);
        g.rotateY((side * Math.PI) / 2);
        g.translate(px + side * 1.85, deckY + 3.4, zc + dz);
        if (!signTex.has(st.name)) signTex.set(st.name, []);
        signTex.get(st.name).push(g);
      }
      // street stairs on both sidewalks just before the crossing, with green globes
      const ex = side * (streetW / 2 + 1.4);
      const ez = st.s - (crossHalf + 2.6);
      const [wx, wz] = toWorld(ex, ez);
      const [sx, sz] = spot(wx, wz);
      entrances.push({ x: sx, z: sz, name: st.name });
      path.at(ez, f);
      for (const dz of [-1.3, 1.3]) {
        kit.add(sx + f[2] * dz, sz + f[3] * dz, f[3] * side, -f[2] * side, { globe: true, height: 2.4, kind: 'green', pool: 3 });
      }
    }
    mezz.push(facadeBox(11, 2.6, 30, 0, deckY - 3.9, st.s, 0, 0.5, new THREE.Color(0.5, 0.55, 0.5)));
  }
  const stationMesh = (geos, mat) => {
    if (geos.length) group.add(new THREE.Mesh(bend(mergeGeometries(geos), path), mat));
  };
  stationMesh(platform, new THREE.MeshStandardMaterial({ color: 0x3a3c3e, roughness: 0.8, metalness: 0.3 }));
  stationMesh(tubes, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xeef6ff).multiplyScalar(6) }));
  stationMesh(glow, new THREE.MeshBasicMaterial({ map: shared.pool, color: 0x9fbfff, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false }));
  const mezzTex = shared.facade.office;
  stationMesh(mezz, new THREE.MeshStandardMaterial({ vertexColors: true, map: mezzTex.map, emissiveMap: mezzTex.emissiveMap, emissive: 0xffffff, emissiveIntensity: 0.8, roughness: 0.7 }));
  for (const [name, geos] of signTex) {
    const tex = stationSignTexture(name, el.bullets, el.subtitle);
    stationMesh(geos, new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.9, side: THREE.DoubleSide }));
  }

  // ---- trains: each car placed on the curve on its own
  const bodyGeo = new THREE.BoxGeometry(2.9, 3.2, CAR_LEN);
  const winGeo = new THREE.PlaneGeometry(CAR_LEN - 0.6, 1.1);
  const underGeo = new THREE.BoxGeometry(2.4, 0.7, CAR_LEN - 2);
  const lightGeo = new THREE.BoxGeometry(0.3, 0.2, 0.05);
  const bodyMat = new THREE.MeshStandardMaterial({ color: style.body, roughness: 0.3, metalness: 0.9 });
  const underMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.8 });
  const winMat = new THREE.MeshBasicMaterial({ map: trainWindowTexture(style.stripe), color: new THREE.Color(1.8, 1.8, 1.8) });
  const trains = [];
  const makeTrain = (track, s, dir) => {
    const cars = [];
    const white = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const red = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const ends = [[], []];
    for (let k = 0; k < style.cars; k++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.y = 2.25;
      g.add(body);
      const under = new THREE.Mesh(underGeo, underMat);
      under.position.y = 0.55;
      g.add(under);
      for (const side of [-1, 1]) {
        const w = new THREE.Mesh(winGeo, winMat);
        w.rotation.y = (side * Math.PI) / 2;
        w.position.set(side * 1.46, 2.55, 0);
        g.add(w);
      }
      if (k === 0 || k === style.cars - 1) {
        const e = k === style.cars - 1 ? 1 : -1;
        for (const sx of [-0.9, 0.9]) {
          const l = new THREE.Mesh(lightGeo, white);
          l.position.set(sx, 1.3, e * (CAR_LEN / 2 + 0.03));
          g.add(l);
          ends[e > 0 ? 0 : 1].push(l);
        }
      }
      group.add(g);
      cars.push({ g, off: -TRAIN_LEN / 2 + (k + 0.5) * (CAR_LEN + CAR_GAP) });
    }
    const spillGeo = new THREE.PlaneGeometry(16, TRAIN_LEN + 10);
    spillGeo.rotateX(-Math.PI / 2);
    const spill = new THREE.Mesh(
      spillGeo,
      new THREE.MeshBasicMaterial({ map: shared.pool, color: 0x7c93b8, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    group.add(spill);
    const train = { cars, track, s, dir: 1, v: 0, mode: 'dwell', timer: range(2, 8), ends, white, red, spill, pos: new THREE.Vector3() };
    setDirection(train, dir);
    trains.push(train);
    return train;
  };
  function setDirection(train, dir) {
    train.dir = dir;
    const front = dir > 0 ? 0 : 1;
    for (let e = 0; e < 2; e++) for (const l of train.ends[e]) l.material = e === front ? train.white : train.red;
    train.white.color.setRGB(6, 5.6, 4.8);
    train.red.color.setRGB(4, 0.2, 0.1);
  }
  function place(train) {
    for (const c of train.cars) {
      const s = train.s + c.off;
      path.at(s, f);
      c.g.position.set(f[0] + f[3] * train.track, deckY + 0.3, f[1] - f[2] * train.track);
      c.g.rotation.y = Math.atan2(f[2], f[3]);
    }
    path.at(train.s, f);
    train.pos.set(f[0], deckY, f[1]);
    train.spill.position.set(f[0], 0.03, f[1]);
    train.spill.rotation.y = Math.atan2(f[2], f[3]);
  }
  const first = stationS[0] ?? len / 2;
  makeTrain(-TRACK_OFFSET, first, 1);
  if (len > TRAIN_LEN * 3) {
    const second = makeTrain(TRACK_OFFSET, Math.min(len - TRAIN_LEN, (stationS[Math.min(3, stationS.length - 1)] ?? len * 0.7) + 60), -1);
    second.mode = 'run';
  }
  for (const tr of trains) place(tr);

  function nextStop(train) {
    let best = null;
    for (const z of stationS) {
      const d = (z - train.s) * train.dir;
      if (d > 0.5 && (best === null || d < best)) best = d;
    }
    return best;
  }

  const events = { braking: false, horn: null };
  const turnAt = TRAIN_LEN / 2 + 4;
  function update(dt) {
    events.braking = false;
    events.horn = null;
    for (const tr of trains) {
      if (tr.mode === 'dwell') {
        tr.timer -= dt;
        if (tr.timer <= 0) {
          tr.mode = 'run';
          if (style.horn) events.horn = tr.pos.clone();
        }
      } else {
        // the line's end counts as a stop: brake, pause, and head back
        let d = nextStop(tr);
        const end = tr.dir > 0 ? len - turnAt - tr.s : tr.s - turnAt;
        const atEnd = d === null || end < d;
        if (atEnd) d = Math.max(0, end);
        let target = Math.min(VMAX, Math.sqrt(2 * ACCEL * Math.max(0, d - 0.2)));
        if (tr.v < target) tr.v = Math.min(target, tr.v + ACCEL * dt);
        else {
          tr.v = Math.max(target, tr.v - ACCEL * 1.5 * dt);
          if (tr.v > 2) events.braking = true;
        }
        tr.s += tr.v * tr.dir * dt;
        if (d < 0.4 && tr.v < 0.3) {
          tr.v = 0;
          tr.mode = 'dwell';
          tr.timer = atEnd ? 12 : style.dwell;
          if (atEnd) setDirection(tr, -tr.dir);
        }
      }
      place(tr);
      tr.spill.material.opacity = 0.06 + Math.min(0.14, tr.v * 0.012) + (Math.random() < tr.v * 0.02 ? 0.12 : 0);
    }
  }

  function rumbleAt(p) {
    let best = 0;
    for (const tr of trains) {
      const dist = Math.max(0, tr.pos.distanceTo(p) - TRAIN_LEN / 2);
      best = Math.max(best, (0.25 + Math.min(1, tr.v / VMAX) * 0.75) * Math.max(0, 1 - dist / 220));
    }
    return best;
  }

  return { group, update, colliders, rumbleAt, events, entrances, path };
}
