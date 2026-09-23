import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EW_W, CURB, colX, rowZ, EL_COL, EL_HEIGHT, EL_STATIONS, NZ, SOUTH_LIMIT } from './config.js';
import { range } from './random.js';
import { facadeBox } from './buildings.js';

const CAR_LEN = 17.4;
const CAR_GAP = 0.5;
const CARS = 8;
const TRAIN_LEN = CARS * (CAR_LEN + CAR_GAP);
const TRACK_OFFSET = 2.2;
const VMAX = 15;
const ACCEL = 1.2;

function box(w, h, d, x, y, z) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

function latticeTexture() {
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

function trainWindowTexture() {
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
    ctx.fillRect(a, 6, b - a, 52);
    // a few riders
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
  // door windows
  for (const x of [200, 410, 615, 820]) {
    ctx.fillStyle = '#dfeaf5';
    ctx.fillRect(x, 10, 12, 30);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function stationSignTexture(name) {
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
  ctx.fillText(name, 24, 54, 780);
  let x = 1024 - 70;
  for (const letter of ['W', 'N']) {
    ctx.fillStyle = '#fccc0a';
    ctx.beginPath();
    ctx.arc(x, 52, 32, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.font = 'bold 42px "Helvetica Neue", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(letter, x, 55);
    ctx.textAlign = 'left';
    x -= 76;
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function buildElevated(shared) {
  const group = new THREE.Group();
  const cx = colX(EL_COL);
  const zN = rowZ(0) - 10;
  const zS = SOUTH_LIMIT + 900;
  const len = zS - zN;
  const zMid = (zN + zS) / 2;
  const deckY = CURB + EL_HEIGHT;

  const steel = [];
  const colliders = [];
  // columns every 15m, kept out of the intersections
  for (let z = zN + 4; z < zS; z += 15) {
    const nearCross = [...Array(NZ).keys()].some((j) => Math.abs(z - rowZ(j)) < EW_W / 2 + 1.5);
    if (nearCross) continue;
    for (const s of [-1, 1]) {
      const x = cx + s * 5.6;
      steel.push(box(0.45, deckY - 0.9, 0.45, x, (deckY - 0.9) / 2, z));
      steel.push(box(0.8, 0.3, 0.8, x, 0.15, z));
      steel.push(box(0.9, 0.5, 0.9, x, deckY - 1.1, z));
      if (z < SOUTH_LIMIT + 20) colliders.push({ x0: x - 0.45, x1: x + 0.45, z0: z - 0.45, z1: z + 0.45 });
    }
    steel.push(box(12.4, 0.8, 0.5, cx, deckY - 0.5, z));
  }
  for (const x of [-5.6, -1.8, 1.8, 5.6]) steel.push(box(0.35, 1.3, len, cx + x, deckY - 0.55, zMid));
  steel.push(box(12, 0.25, len, cx, deckY, zMid)); // deck
  const steelMat = new THREE.MeshStandardMaterial({ color: 0x2c3530, roughness: 0.6, metalness: 0.6 });
  group.add(new THREE.Mesh(mergeGeometries(steel), steelMat));

  const rails = [];
  for (const t of [-TRACK_OFFSET, TRACK_OFFSET]) {
    for (const r of [-0.72, 0.72]) rails.push(box(0.1, 0.16, len, cx + t + r, deckY + 0.2, zMid));
  }
  for (let z = zN; z < zS - 600; z += 1.1) {
    for (const t of [-TRACK_OFFSET, TRACK_OFFSET]) rails.push(box(2.3, 0.1, 0.22, cx + t, deckY + 0.1, z));
  }
  group.add(new THREE.Mesh(mergeGeometries(rails), new THREE.MeshStandardMaterial({ color: 0x3d3834, roughness: 0.7, metalness: 0.5 })));

  // lattice side walls
  const lattice = latticeTexture();
  const walls = [];
  for (const s of [-1, 1]) {
    const g = new THREE.PlaneGeometry(len, 1.4);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, (uv.getX(i) * len) / 2.8);
    g.rotateY(Math.PI / 2);
    g.translate(cx + s * 6, deckY + 0.7, zMid);
    walls.push(g);
  }
  group.add(
    new THREE.Mesh(
      mergeGeometries(walls),
      new THREE.MeshStandardMaterial({ map: lattice, color: 0x2c3530, alphaTest: 0.5, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.6 }),
    ),
  );

  // ---- stations
  const stationZ = [];
  const platform = [];
  const tubes = [];
  const glow = [];
  const mezz = [];
  const stationLen = TRAIN_LEN + 6;
  for (const st of EL_STATIONS) {
    const zc = st.j === 0 ? rowZ(0) + TRAIN_LEN / 2 + 2 : rowZ(st.j);
    stationZ.push(zc);
    for (const s of [-1, 1]) {
      const px = cx + s * 5.5;
      platform.push(box(3.2, 1.1, stationLen, px, deckY + 0.55, zc));
      platform.push(box(3.6, 0.2, stationLen, px, deckY + 4.3, zc)); // canopy
      for (let z = zc - stationLen / 2 + 4; z < zc + stationLen / 2; z += 12) {
        platform.push(box(0.15, 3.2, 0.15, px + s * 1.2, deckY + 2.7, z));
      }
      tubes.push(box(0.12, 0.06, stationLen - 6, px, deckY + 4.15, zc));
      const pool = new THREE.PlaneGeometry(3, stationLen);
      pool.rotateX(-Math.PI / 2);
      pool.translate(px, deckY + 1.13, zc);
      glow.push(pool);
      // station name boards facing the street
      const sign = new THREE.PlaneGeometry(9, 0.85);
      sign.rotateY((s * Math.PI) / 2);
      for (const dz of [-30, 30]) {
        const g = sign.clone();
        g.translate(px + s * 1.85, deckY + 3.4, zc + dz);
        (st.signs ??= []).push(g);
      }
    }
    // mezzanine under the tracks with lit windows
    mezz.push(facadeBox(11, 2.6, 30, cx, deckY - 3.9, zc, 0, 0.5, new THREE.Color(0.5, 0.55, 0.5)));
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
  for (const st of EL_STATIONS) {
    const tex = stationSignTexture(st.name);
    group.add(
      new THREE.Mesh(
        mergeGeometries(st.signs),
        new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.9, side: THREE.DoubleSide }),
      ),
    );
  }

  // ---- trains
  const bodyGeo = new THREE.BoxGeometry(2.9, 3.2, CAR_LEN);
  const winGeo = new THREE.PlaneGeometry(CAR_LEN - 0.6, 1.1);
  const underGeo = new THREE.BoxGeometry(2.4, 0.7, CAR_LEN - 2);
  const lightGeo = new THREE.BoxGeometry(0.3, 0.2, 0.05);
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xb4bac0, roughness: 0.3, metalness: 0.9 });
  const underMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.8 });
  const winMat = new THREE.MeshBasicMaterial({ map: trainWindowTexture(), color: new THREE.Color(1.8, 1.8, 1.8) });
  const trains = [];
  const makeTrain = (track, z, dir) => {
    const g = new THREE.Group();
    const white = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const red = new THREE.MeshBasicMaterial({ color: 0x000000 });
    for (let k = 0; k < CARS; k++) {
      const cz = -TRAIN_LEN / 2 + (k + 0.5) * (CAR_LEN + CAR_GAP);
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.set(0, 2.25, cz);
      g.add(body);
      const under = new THREE.Mesh(underGeo, underMat);
      under.position.set(0, 0.55, cz);
      g.add(under);
      for (const s of [-1, 1]) {
        const w = new THREE.Mesh(winGeo, winMat);
        w.rotation.y = (s * Math.PI) / 2;
        w.position.set(s * 1.46, 2.55, cz);
        g.add(w);
      }
    }
    // end lights: [front-of-train when dir=+1, other end]
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
    // the train's light spilling onto the street below
    const spillGeo = new THREE.PlaneGeometry(16, TRAIN_LEN + 10);
    spillGeo.rotateX(-Math.PI / 2);
    const spill = new THREE.Mesh(
      spillGeo,
      new THREE.MeshBasicMaterial({ map: shared.pool, color: 0x7c93b8, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    spill.position.set(cx + track, 0.03 - deckY, 0);
    g.add(spill);
    g.position.set(cx + track, deckY + 0.3, z);
    group.add(g);
    const train = { g, z, dir, v: 0, mode: 'dwell', timer: range(2, 8), ends, white, red, spill };
    setDirection(train, dir);
    trains.push(train);
    return train;
  };
  function setDirection(train, dir) {
    train.dir = dir;
    const front = dir > 0 ? 0 : 1;
    for (let e = 0; e < 2; e++) {
      for (const l of train.ends[e]) l.material = e === front ? train.white : train.red;
    }
    train.white.color.setRGB(6, 5.6, 4.8);
    train.red.color.setRGB(4, 0.2, 0.1);
  }
  makeTrain(-TRACK_OFFSET, stationZ[0], 1);
  makeTrain(TRACK_OFFSET, stationZ[3] + 40, -1).mode = 'run';

  function nextStop(train) {
    let best = null;
    for (const z of stationZ) {
      const d = (z - train.z) * train.dir;
      if (d > 0.5 && (best === null || d < best)) best = d;
    }
    return best;
  }

  const events = { braking: false };
  function update(dt) {
    events.braking = false;
    for (const tr of trains) {
      if (tr.mode === 'dwell') {
        tr.timer -= dt;
        if (tr.timer <= 0) {
          tr.mode = 'run';
          // Ditmars is the end of the line: turn back south
          if (tr.dir < 0 && Math.abs(tr.z - stationZ[0]) < 2) setDirection(tr, 1);
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
          tr.timer = Math.abs(tr.z - stationZ[0]) < 2 ? 20 : 9;
        }
        // far south, out of sight: turn around
        if (tr.z > SOUTH_LIMIT + 650 && tr.dir > 0) {
          setDirection(tr, -1);
          tr.v = VMAX * 0.5;
        }
      }
      tr.g.position.z = tr.z;
      tr.spill.material.opacity = 0.06 + Math.min(0.14, tr.v * 0.012) + (Math.random() < tr.v * 0.02 ? 0.12 : 0);
    }
  }

  /** Loudness 0..1 of the nearest train, for the rumble. */
  function rumbleAt(p) {
    let best = 0;
    for (const tr of trains) {
      const dz = Math.max(0, Math.abs(p.z - tr.z) - TRAIN_LEN / 2);
      const dx = p.x - tr.g.position.x;
      const dist = Math.hypot(dx, dz, p.y - deckY);
      const loud = (0.25 + Math.min(1, tr.v / VMAX) * 0.75) * Math.max(0, 1 - dist / 220);
      best = Math.max(best, loud);
    }
    return best;
  }

  return { group, update, colliders, rumbleAt, events };
}
