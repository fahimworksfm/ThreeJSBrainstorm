import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CURB, D } from './config.js';
import { range } from './random.js';
import { facadeBox } from './buildings.js';

export const TRACK_OFFSET = 2.2;
export const ACCEL = 1.2;

export const STYLES = {
  // NYC subway: stainless R160-style cars, 8 per train
  subway: { carLen: 17.4, cars: 8, vmax: 15, body: 0xb4bac0, stripe: null, dwell: 9, horn: false },
  // Long Island Rail Road: longer M7-style cars with a blue stripe, faster, sounds its horn
  lirr: { carLen: 25.9, cars: 6, vmax: 22, body: 0xc4c8cc, stripe: '#2a55b8', dwell: 14, horn: true },
};

export function box(w, h, d, x, y, z) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

export function latticeTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const ctx = c.getContext('2d');
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, 122, 58);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(64, 64);
  ctx.lineTo(128, 0);
  ctx.moveTo(0, 64);
  ctx.lineTo(64, 0);
  ctx.lineTo(128, 64);
  ctx.stroke();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

export function trainWindowTexture(stripe) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#2a2e33';
  ctx.fillRect(0, 0, 1024, 64);
  const windows = [[20, 170], [230, 380], [440, 590], [640, 790], [850, 1000]];
  for (const [a, b] of windows) {
    const g = ctx.createLinearGradient(0, 4, 0, 60);
    g.addColorStop(0, '#f4f9ff');
    g.addColorStop(1, '#cfe2f5');
    ctx.fillStyle = g;
    ctx.fillRect(a, 6, b - a, stripe ? 44 : 52);
    for (let k = 0; k < 3; k++) {
      if (Math.random() < 0.5) continue;
      const px = a + 15 + Math.random() * (b - a - 40);
      ctx.fillStyle = 'rgba(20,24,30,0.85)';
      ctx.beginPath();
      ctx.arc(px + 10, 26, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(px, 34, 20, 30);
    }
  }
  if (stripe) {
    ctx.fillStyle = stripe;
    ctx.fillRect(0, 54, 1024, 8);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function stationSignTexture(name, bullets, subtitle) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 96;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0c0c0c';
  ctx.fillRect(0, 0, 1024, 96);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 8, 1024, 3);
  ctx.font = 'bold 50px "Helvetica Neue", Arial, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, 24, 54, 700);
  let x = 1024 - 70;
  ctx.textAlign = 'center';
  for (const [letter, color] of [...bullets].reverse()) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, 52, 32, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.font = 'bold 42px "Helvetica Neue", Arial, sans-serif';
    ctx.fillText(letter, x, 55);
    x -= 76;
  }
  if (subtitle) {
    ctx.textAlign = 'right';
    ctx.fillStyle = '#9fb8ff';
    ctx.font = 'bold 30px "Helvetica Neue", Arial, sans-serif';
    ctx.fillText(subtitle, 1000, 55);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/**
 * An elevated rail line over one street of the district, with stations and trains.
 * Everything is built in a local frame where the line runs along +z, then rotated
 * into place for lines that run east-west.
 */
export function buildElevated(shared, kit) {
  const el = D.el;
  const style = STYLES[el.style];
  const CAR_LEN = style.carLen;
  const CAR_GAP = 0.5;
  const TRAIN_LEN = style.cars * (CAR_LEN + CAR_GAP);
  const VMAX = style.vmax;
  const ns = el.axis === 'ns';

  if (el.underground) return buildSubwayEntrances(kit);

  const group = new THREE.Group();
  if (ns) group.position.x = D.colX(el.index);
  else {
    group.rotation.y = Math.PI / 2; // local +z -> world +x, local +x -> world -z
    group.position.z = D.rowZ(el.index);
  }
  group.updateMatrixWorld(true);

  // along-line coordinates of the roads crossing under it
  const crossW = ns ? D.ewW : D.nsW;
  const crossings = [];
  if (ns) for (let j = D.jLo; j <= D.jHi; j++) crossings.push(D.rowZ(j));
  else for (let i = D.iLo; i <= D.iHi; i++) crossings.push(D.colX(i));
  const walkMax = ns ? D.zMax : D.xMax;
  const walkMin = ns ? D.zMin : D.xMin;
  const from = el.terminalStart ? D.rowZ(0) - 10 : walkMin - 900;
  const to = walkMax + 900;
  const len = to - from;
  const mid = (from + to) / 2;
  const deckY = CURB + el.height;

  const toWorldRect = (x0, x1, z0, z1) =>
    ns
      ? { x0: x0 + group.position.x, x1: x1 + group.position.x, z0, z1 }
      : { x0: z0, x1: z1, z0: group.position.z - x1, z1: group.position.z - x0 };
  const toWorld = (x, z) => new THREE.Vector3(x, 0, z).applyMatrix4(group.matrixWorld);

  const steel = [];
  const colliders = [];
  for (let z = from + 4; z < to; z += 15) {
    if (crossings.some((cz) => Math.abs(z - cz) < crossW / 2 + 1.5)) continue;
    for (const s of [-1, 1]) {
      const x = s * 5.6;
      steel.push(box(0.45, deckY - 0.9, 0.45, x, (deckY - 0.9) / 2, z));
      steel.push(box(0.8, 0.3, 0.8, x, 0.15, z));
      steel.push(box(0.9, 0.5, 0.9, x, deckY - 1.1, z));
      if (z > walkMin - 20 && z < walkMax + 20) colliders.push(toWorldRect(x - 0.45, x + 0.45, z - 0.45, z + 0.45));
    }
    steel.push(box(12.4, 0.8, 0.5, 0, deckY - 0.5, z));
  }
  for (const x of [-5.6, -1.8, 1.8, 5.6]) steel.push(box(0.35, 1.3, len, x, deckY - 0.55, mid));
  steel.push(box(12, 0.25, len, 0, deckY, mid));
  const steelMat = new THREE.MeshStandardMaterial({ color: 0x2c3530, roughness: 0.6, metalness: 0.6 });
  group.add(new THREE.Mesh(mergeGeometries(steel), steelMat));

  const rails = [];
  for (const t of [-TRACK_OFFSET, TRACK_OFFSET]) {
    for (const r of [-0.72, 0.72]) rails.push(box(0.1, 0.16, len, t + r, deckY + 0.2, mid));
  }
  for (let z = Math.max(from, walkMin - 300); z < Math.min(to, walkMax + 300); z += 1.1) {
    for (const t of [-TRACK_OFFSET, TRACK_OFFSET]) rails.push(box(2.3, 0.1, 0.22, t, deckY + 0.1, z));
  }
  group.add(new THREE.Mesh(mergeGeometries(rails), new THREE.MeshStandardMaterial({ color: 0x3d3834, roughness: 0.7, metalness: 0.5 })));

  const walls = [];
  for (const s of [-1, 1]) {
    const g = new THREE.PlaneGeometry(len, 1.4);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, (uv.getX(i) * len) / 2.8);
    g.rotateY(Math.PI / 2);
    g.translate(s * 6, deckY + 0.7, mid);
    walls.push(g);
  }
  group.add(
    new THREE.Mesh(
      mergeGeometries(walls),
      new THREE.MeshStandardMaterial({ map: latticeTexture(), color: 0x2c3530, alphaTest: 0.5, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.6 }),
    ),
  );

  // ---- stations
  const stationZ = [];
  const platform = [];
  const tubes = [];
  const glow = [];
  const mezz = [];
  const signs = [];
  const entrances = [];
  const stationLen = TRAIN_LEN + 6;
  const signTex = new Map();
  for (const st of el.stations) {
    const at = ns ? D.rowZ(st.at) : D.colX(st.at);
    const zc = el.terminalStart && st === el.stations[0] ? D.rowZ(0) + TRAIN_LEN / 2 + 2 : at;
    stationZ.push(zc);
    for (const s of [-1, 1]) {
      const px = s * 5.5;
      platform.push(box(3.2, 1.1, stationLen, px, deckY + 0.55, zc));
      platform.push(box(3.6, 0.2, stationLen, px, deckY + 4.3, zc));
      for (let z = zc - stationLen / 2 + 4; z < zc + stationLen / 2; z += 12) {
        platform.push(box(0.15, 3.2, 0.15, px + s * 1.2, deckY + 2.7, z));
      }
      tubes.push(box(0.12, 0.06, stationLen - 6, px, deckY + 4.15, zc));
      const pool = new THREE.PlaneGeometry(3, stationLen);
      pool.rotateX(-Math.PI / 2);
      pool.translate(px, deckY + 1.13, zc);
      glow.push(pool);
      for (const dz of [-30, 30]) {
        const g = new THREE.PlaneGeometry(9, 0.85);
        g.rotateY((s * Math.PI) / 2);
        g.translate(px + s * 1.85, deckY + 3.4, zc + dz);
        if (!signTex.has(st.name)) signTex.set(st.name, []);
        signTex.get(st.name).push(g);
      }
      // street entrances on both sidewalks at the crossing, marked by green globes
      const ex = s * ((ns ? D.nsW : D.ewW) / 2 + 1.4);
      const ez = at - (crossW / 2 + 2.6);
      const w = toWorld(ex, ez);
      const nrm = toWorld(ex + s, ez).sub(w);
      entrances.push({ x: w.x, z: w.z, name: st.name });
      for (const dz of [-1.3, 1.3]) {
        const p = toWorld(ex, ez + dz);
        kit.add(p.x, p.z, nrm.x, nrm.z, { globe: true, height: 2.4, kind: 'green', pool: 3 });
      }
    }
    mezz.push(facadeBox(11, 2.6, 30, 0, deckY - 3.9, at, 0, 0.5, new THREE.Color(0.5, 0.55, 0.5)));
  }
  group.add(new THREE.Mesh(mergeGeometries(platform), new THREE.MeshStandardMaterial({ color: 0x3a3c3e, roughness: 0.8, metalness: 0.3 })));
  group.add(new THREE.Mesh(mergeGeometries(tubes), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xeef6ff).multiplyScalar(6) })));
  group.add(
    new THREE.Mesh(
      mergeGeometries(glow),
      new THREE.MeshBasicMaterial({ map: shared.pool, color: 0x9fbfff, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false }),
    ),
  );
  const mezzTex = shared.facade.office;
  group.add(
    new THREE.Mesh(
      mergeGeometries(mezz),
      new THREE.MeshStandardMaterial({ vertexColors: true, map: mezzTex.map, emissiveMap: mezzTex.emissiveMap, emissive: 0xffffff, emissiveIntensity: 0.8, roughness: 0.7 }),
    ),
  );
  for (const [name, geos] of signTex) {
    const tex = stationSignTexture(name, el.bullets, el.subtitle);
    signs.push(tex);
    group.add(
      new THREE.Mesh(
        mergeGeometries(geos),
        new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.9, side: THREE.DoubleSide }),
      ),
    );
  }

  // ---- trains
  const bodyGeo = new THREE.BoxGeometry(2.9, 3.2, CAR_LEN);
  const winGeo = new THREE.PlaneGeometry(CAR_LEN - 0.6, 1.1);
  const underGeo = new THREE.BoxGeometry(2.4, 0.7, CAR_LEN - 2);
  const lightGeo = new THREE.BoxGeometry(0.3, 0.2, 0.05);
  const bodyMat = new THREE.MeshStandardMaterial({ color: style.body, roughness: 0.3, metalness: 0.9 });
  const underMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.8 });
  const winMat = new THREE.MeshBasicMaterial({ map: trainWindowTexture(style.stripe), color: new THREE.Color(1.8, 1.8, 1.8) });
  const trains = [];
  const makeTrain = (track, z, dir) => {
    const g = new THREE.Group();
    const white = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const red = new THREE.MeshBasicMaterial({ color: 0x000000 });
    for (let k = 0; k < style.cars; k++) {
      const cz = -TRAIN_LEN / 2 + (k + 0.5) * (CAR_LEN + CAR_GAP);
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.set(0, 2.25, cz);
      const under = new THREE.Mesh(underGeo, underMat);
      under.position.set(0, 0.55, cz);
      g.add(body, under);
      for (const s of [-1, 1]) {
        const w = new THREE.Mesh(winGeo, winMat);
        w.rotation.y = (s * Math.PI) / 2;
        w.position.set(s * 1.46, 2.55, cz);
        g.add(w);
      }
    }
    const ends = [];
    for (const e of [1, -1]) {
      const endGroup = [];
      for (const s of [-0.9, 0.9]) {
        const l = new THREE.Mesh(lightGeo, white);
        l.position.set(s, 1.3, e * (TRAIN_LEN / 2 - CAR_GAP / 2 + 0.03));
        g.add(l);
        endGroup.push(l);
      }
      ends.push(endGroup);
    }
    const spillGeo = new THREE.PlaneGeometry(16, TRAIN_LEN + 10);
    spillGeo.rotateX(-Math.PI / 2);
    const spill = new THREE.Mesh(
      spillGeo,
      new THREE.MeshBasicMaterial({ map: shared.pool, color: 0x7c93b8, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    spill.position.set(0, 0.03 - deckY - 0.3, 0);
    g.add(spill);
    g.position.set(track, deckY + 0.3, z);
    group.add(g);
    const train = { g, z, dir: 1, v: 0, mode: 'dwell', timer: range(2, 8), ends, white, red, spill };
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
  makeTrain(-TRACK_OFFSET, stationZ[0], 1);
  const second = makeTrain(TRACK_OFFSET, stationZ[Math.min(3, stationZ.length - 1)] + 60, -1);
  second.mode = 'run';
  if (!el.terminalStart) {
    const third = makeTrain(-TRACK_OFFSET, walkMin - 500, 1);
    third.mode = 'run';
  }

  function nextStop(train) {
    let best = null;
    for (const z of stationZ) {
      const d = (z - train.z) * train.dir;
      if (d > 0.5 && (best === null || d < best)) best = d;
    }
    return best;
  }

  const events = { braking: false, horn: null };
  const terminal = el.terminalStart ? stationZ[0] : null;
  function update(dt) {
    events.braking = false;
    events.horn = null;
    for (const tr of trains) {
      if (tr.mode === 'dwell') {
        tr.timer -= dt;
        if (tr.timer <= 0) {
          tr.mode = 'run';
          if (terminal !== null && tr.dir < 0 && Math.abs(tr.z - terminal) < 2) setDirection(tr, 1);
          if (style.horn) events.horn = tr.g.getWorldPosition(new THREE.Vector3());
        }
      } else {
        const d = nextStop(tr);
        let target = VMAX;
        if (d !== null) target = Math.min(VMAX, Math.sqrt(2 * ACCEL * Math.max(0, d - 0.2)));
        if (tr.v < target) tr.v = Math.min(target, tr.v + ACCEL * dt);
        else {
          tr.v = Math.max(target, tr.v - ACCEL * 1.5 * dt);
          if (tr.v > 2) events.braking = true;
        }
        tr.z += tr.v * tr.dir * dt;
        if (d !== null && d < 0.4 && tr.v < 0.3) {
          tr.v = 0;
          tr.mode = 'dwell';
          tr.timer = terminal !== null && Math.abs(tr.z - terminal) < 2 ? 20 : style.dwell;
        }
        // far away in the fog: turn around
        if (tr.z > walkMax + 650 && tr.dir > 0) {
          setDirection(tr, -1);
          tr.v = VMAX * 0.5;
        }
        if (terminal === null && tr.z < walkMin - 650 && tr.dir < 0) {
          setDirection(tr, 1);
          tr.v = VMAX * 0.5;
        }
      }
      tr.g.position.z = tr.z;
      tr.spill.material.opacity = 0.06 + Math.min(0.14, tr.v * 0.012) + (Math.random() < tr.v * 0.02 ? 0.12 : 0);
    }
  }

  const local = new THREE.Vector3();
  const inverse = new THREE.Matrix4().copy(group.matrixWorld).invert();
  /** Loudness 0..1 of the nearest train, for the rumble. */
  function rumbleAt(p) {
    local.copy(p).applyMatrix4(inverse);
    let best = 0;
    for (const tr of trains) {
      const dz = Math.max(0, Math.abs(local.z - tr.z) - TRAIN_LEN / 2);
      const dist = Math.hypot(local.x - tr.g.position.x, dz, local.y - deckY);
      const loud = (0.25 + Math.min(1, tr.v / VMAX) * 0.75) * Math.max(0, 1 - dist / 220);
      best = Math.max(best, loud);
    }
    return best;
  }

  return { group, update, colliders, rumbleAt, events, entrances };
}

/**
 * A line that runs underground here: just the stair entrances on the sidewalk, with
 * their railings, green globes and a sign, at each station's corners.
 */
function buildSubwayEntrances(kit) {
  const el = D.el;
  const group = new THREE.Group();
  const rail = [];
  const stairs = [];
  const colliders = [];
  const entrances = [];
  const signs = new Map();
  for (const st of el.stations) {
    // stations sit under an avenue (ew) or street (ns) at a crossing
    const i = el.axis === 'ns' ? el.index : st.at;
    const j = el.axis === 'ns' ? st.at : el.index;
    for (const [sx, sz] of [[1, 1], [-1, -1]]) {
      const x = D.colX(i) + sx * (D.nsW / 2 + 2.3);
      const z = D.rowZ(j) + sz * (D.ewW / 2 + 5);
      // stairwell: a dark opening with railings on three sides
      stairs.push(box(1.7, 0.05, 3.6, x, CURB + 0.01, z));
      for (const dx of [-0.9, 0.9]) {
        rail.push(box(0.06, 0.06, 3.6, x + dx, CURB + 1.0, z));
        for (let k = -1.7; k <= 1.7; k += 0.425) rail.push(box(0.035, 1.0, 0.035, x + dx, CURB + 0.5, z + k));
      }
      rail.push(box(1.8, 0.06, 0.06, x, CURB + 1.0, z - sz * 1.8));
      colliders.push({ x0: x - 0.95, x1: x + 0.95, z0: z - 1.85, z1: z + 1.85 });
      entrances.push({ x: x, z: z + sz * 2.4, name: st.name });
      for (const dx of [-0.9, 0.9]) kit.add(x + dx, z + sz * 1.8, 0, sz, { globe: true, height: 1.3, kind: 'green', pool: 2.5, y0: CURB });
      const g = new THREE.PlaneGeometry(1.7, 0.32);
      if (sz < 0) g.rotateY(Math.PI);
      g.translate(x, CURB + 1.35, z + sz * 1.82);
      if (!signs.has(st.name)) signs.set(st.name, []);
      signs.get(st.name).push(g);
    }
  }
  group.add(new THREE.Mesh(mergeGeometries(rail), new THREE.MeshStandardMaterial({ color: 0x1c3a26, roughness: 0.6 })));
  group.add(new THREE.Mesh(mergeGeometries(stairs), new THREE.MeshBasicMaterial({ color: 0x050506 })));
  for (const [name, geos] of signs) {
    const tex = stationSignTexture(name, el.bullets, el.subtitle);
    group.add(new THREE.Mesh(mergeGeometries(geos), new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.9 })));
  }
  return { group, update() {}, colliders, rumbleAt: () => 0, events: { braking: false, horn: null }, entrances };
}
