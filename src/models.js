import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Low-poly, flat-colored models: they take the ink outlines and cel banding well.
const std = (color, roughness = 0.75, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
const glow = (r, g, b) => new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b) });

function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}

/** A cylinder from a to b. */
function tube(a, b, r, mat, segs = 8) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, dir.length(), segs), mat);
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return m;
}
const v = (x, y, z) => new THREE.Vector3(x, y, z);

/** A rounded limb (capsule) from a to b. */
function limb(a, b, r, mat) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = Math.max(0.01, dir.length() - r);
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 10), mat);
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return m;
}
const rbox = (w, h, d, r, mat, x = 0, y = 0, z = 0) => mesh(new RoundedBoxGeometry(w, h, d, 3, r), mat, x, y, z);

// olive bomber, cream tee, dark jeans, white sneakers, brown backpack
const COLORS = {
  skin: 0x8d5a3b,
  jacket: 0x4a5a36,
  tee: 0xe9dfc6,
  rib: 0x2a2f24,
  jeans: 0x1f2533,
  shoe: 0xf1f1ee,
  sole: 0xd9d6cf,
  hair: 0x16110e,
  pack: 0x6b4a2f,
  strap: 0x3b2a1c,
};

/** The guy. Origin at his feet, facing +z. Joints are groups so we can pose him. */
export function buildGuy() {
  const skin = std(COLORS.skin, 0.7);
  const jacket = std(COLORS.jacket, 0.8);
  const rib = std(COLORS.rib);
  const tee = std(COLORS.tee, 0.9);
  const jeans = std(COLORS.jeans, 0.9);
  const shoe = std(COLORS.shoe, 0.6);
  const sole = std(COLORS.sole, 0.6);
  const hair = std(COLORS.hair, 1);
  const pack = std(COLORS.pack, 0.85);
  const strap = std(COLORS.strap, 0.85);

  const root = new THREE.Group();
  const hips = new THREE.Group();
  hips.position.y = 0.95;
  root.add(hips);
  hips.add(rbox(0.34, 0.22, 0.22, 0.08, jeans, 0, 0.02, 0));
  const torso = new THREE.Group();
  torso.position.y = 0.1;
  hips.add(torso);
  torso.add(rbox(0.46, 0.52, 0.27, 0.11, jacket, 0, 0.28, 0));
  torso.add(rbox(0.45, 0.08, 0.26, 0.035, rib, 0, 0.03, 0)); // ribbed waistband
  torso.add(rbox(0.16, 0.42, 0.02, 0.008, tee, 0, 0.29, 0.133)); // open jacket, tee showing
  torso.add(mesh(new THREE.BoxGeometry(0.24, 0.05, 0.2), rib, 0, 0.55, 0)); // collar
  // backpack with straps
  torso.add(rbox(0.34, 0.42, 0.17, 0.06, pack, 0, 0.3, -0.21));
  torso.add(rbox(0.27, 0.16, 0.08, 0.03, pack, 0, 0.18, -0.31));
  torso.add(mesh(new THREE.BoxGeometry(0.34, 0.05, 0.16), strap, 0, 0.49, -0.2));
  for (const s of [-1, 1]) torso.add(mesh(new THREE.BoxGeometry(0.05, 0.42, 0.02), strap, s * 0.12, 0.3, 0.13));
  torso.add(mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.09, 8), skin, 0, 0.57, 0));
  const head = new THREE.Group();
  head.position.y = 0.66;
  torso.add(head);
  const skull = mesh(new THREE.SphereGeometry(0.125, 14, 10), skin, 0, 0.07, 0);
  skull.scale.set(0.95, 1.12, 1.02);
  head.add(skull);
  const top = mesh(new THREE.SphereGeometry(0.133, 14, 8, 0, Math.PI * 2, 0, Math.PI / 1.9), hair, 0, 0.08, -0.008);
  top.scale.set(0.98, 1.05, 1.02);
  head.add(top);
  head.add(mesh(new THREE.BoxGeometry(0.035, 0.05, 0.04), skin, 0, 0.05, 0.125)); // nose

  const shoulders = [];
  const elbows = [];
  const legs = [];
  const knees = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Group();
    sh.position.set(s * 0.27, 0.46, 0);
    torso.add(sh);
    sh.add(limb(v(0, 0, 0), v(0, -0.3, 0), 0.066, jacket));
    const el = new THREE.Group();
    el.position.y = -0.3;
    sh.add(el);
    el.add(limb(v(0, 0, 0), v(0, -0.25, 0), 0.058, jacket));
    el.add(rbox(0.07, 0.1, 0.05, 0.022, skin, 0, -0.3, 0));
    shoulders.push(sh);
    elbows.push(el);

    const hip = new THREE.Group();
    hip.position.set(s * 0.1, -0.02, 0);
    hips.add(hip);
    hip.add(limb(v(0, 0, 0), v(0, -0.44, 0), 0.085, jeans));
    const kn = new THREE.Group();
    kn.position.y = -0.44;
    hip.add(kn);
    kn.add(limb(v(0, 0, 0), v(0, -0.42, 0), 0.072, jeans));
    kn.add(rbox(0.12, 0.09, 0.28, 0.04, shoe, 0, -0.44, 0.06));
    kn.add(rbox(0.13, 0.03, 0.29, 0.012, sole, 0, -0.485, 0.06));
    legs.push(hip);
    knees.push(kn);
  }
  return { root, hips, torso, head, shoulders, elbows, legs, knees };
}

/** Pose the guy for walking, riding or driving. phase drives the cycle. */
export function poseGuy(g, mode, phase, amount, running) {
  for (const j of [...g.shoulders, ...g.elbows, ...g.legs, ...g.knees, g.torso, g.head]) j.rotation.set(0, 0, 0);
  g.hips.position.set(0, 0.95, 0);
  g.hips.rotation.set(0, 0, 0);
  if (mode === 'walk') {
    const a = Math.min(1, amount) * (running ? 1.35 : 1);
    const sw = Math.sin(phase);
    g.legs[0].rotation.x = sw * 0.55 * a;
    g.legs[1].rotation.x = -sw * 0.55 * a;
    g.knees[0].rotation.x = Math.max(0, Math.sin(phase - 1.2)) * 1.1 * a;
    g.knees[1].rotation.x = Math.max(0, Math.sin(phase + Math.PI - 1.2)) * 1.1 * a;
    g.shoulders[0].rotation.x = -sw * 0.5 * a;
    g.shoulders[1].rotation.x = sw * 0.5 * a;
    g.elbows[0].rotation.x = g.elbows[1].rotation.x = -0.3 - 0.4 * a * (running ? 1 : 0.4);
    g.hips.position.y = 0.95 + Math.abs(Math.cos(phase)) * 0.04 * a - 0.02 * a;
    g.torso.rotation.x = 0.06 * a + (running ? 0.12 : 0);
    g.torso.rotation.y = sw * 0.08 * a;
    g.shoulders[0].rotation.z = -0.08;
    g.shoulders[1].rotation.z = 0.08;
  } else if (mode === 'bike') {
    g.hips.position.set(0, 0.9, -0.2);
    g.torso.rotation.x = 0.5;
    g.head.rotation.x = -0.35;
    g.shoulders[0].rotation.x = g.shoulders[1].rotation.x = -1.2;
    g.elbows[0].rotation.x = g.elbows[1].rotation.x = -0.25;
    for (let i = 0; i < 2; i++) {
      const p = phase + i * Math.PI;
      g.legs[i].rotation.x = -1.05 + Math.sin(p) * 0.4;
      g.knees[i].rotation.x = 1.25 + Math.cos(p) * 0.4;
    }
  } else if (mode === 'moto') {
    g.hips.position.set(0, 0.93, -0.28);
    g.torso.rotation.x = 0.55;
    g.head.rotation.x = -0.4;
    g.shoulders[0].rotation.x = g.shoulders[1].rotation.x = -1.2;
    g.shoulders[0].rotation.z = -0.25;
    g.shoulders[1].rotation.z = 0.25;
    g.elbows[0].rotation.x = g.elbows[1].rotation.x = -0.3;
    for (let i = 0; i < 2; i++) {
      g.legs[i].rotation.x = -1.3;
      g.legs[i].rotation.z = (i ? 1 : -1) * 0.18;
      g.knees[i].rotation.x = 1.75;
    }
  } else if (mode === 'suv') {
    g.hips.position.set(-0.45, 0.62, -0.25);
    g.shoulders[0].rotation.x = g.shoulders[1].rotation.x = -0.95;
    g.elbows[0].rotation.x = g.elbows[1].rotation.x = -0.55;
    for (let i = 0; i < 2; i++) {
      g.legs[i].rotation.x = -1.45;
      g.knees[i].rotation.x = 1.4;
    }
  }
}

function wheel(r, tubeR, tireMat, rimMat, spokes) {
  const w = new THREE.Group();
  const tire = new THREE.Mesh(new THREE.TorusGeometry(r, tubeR, 8, 28), tireMat);
  tire.rotation.y = Math.PI / 2;
  w.add(tire);
  if (spokes) {
    for (let k = 0; k < 8; k++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.01, r * 2 - tubeR, 0.01), rimMat);
      s.rotation.x = (k / 8) * Math.PI;
      w.add(s);
    }
  } else {
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.72, r * 0.72, tubeR * 1.2, 16), rimMat);
    rim.rotation.z = Math.PI / 2;
    w.add(rim);
  }
  return w;
}

/** Headlight throw on the road, like the traffic uses. */
function beam(shared, z, w = 3.2, l = 11) {
  const g = new THREE.PlaneGeometry(w, l);
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0.05, z + l / 2);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
  return new THREE.Mesh(
    g,
    new THREE.MeshBasicMaterial({ map: shared.headlight, color: 0xfff1d8, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
}

export function buildBicycle() {
  const frameMat = std(0x16b39a, 0.45, 0.3);
  const dark = std(0x16181b, 0.8);
  const metal = std(0xb8bcc2, 0.3, 0.8);
  const root = new THREE.Group();
  const rear = v(0, 0.34, -0.525);
  const bb = v(0, 0.3, -0.05);
  const seat = v(0, 0.82, -0.2);
  const headTop = v(0, 0.9, 0.36);
  const headBot = v(0, 0.72, 0.4);
  for (const [a, b, r] of [[bb, seat, 0.02], [bb, headBot, 0.024], [seat, headTop, 0.02], [bb, rear, 0.014], [seat, rear, 0.013], [headBot, headTop, 0.026]]) {
    root.add(tube(a, b, r, frameMat));
  }
  root.add(mesh(new THREE.BoxGeometry(0.14, 0.05, 0.26), dark, 0, 0.87, -0.23));
  root.add(tube(seat, v(0, 0.87, -0.22), 0.012, metal));
  const back = wheel(0.34, 0.025, dark, metal, true);
  back.position.copy(rear);
  root.add(back);
  const steer = new THREE.Group();
  steer.position.copy(headTop);
  root.add(steer);
  const front = wheel(0.34, 0.025, dark, metal, true);
  front.position.set(0, 0.34 - headTop.y, 0.525 - headTop.z);
  steer.add(front);
  steer.add(tube(v(0, -0.18, 0.04), front.position, 0.016, frameMat));
  steer.add(tube(v(0, 0, 0), v(0, 0.1, -0.04), 0.014, metal));
  steer.add(tube(v(-0.29, 0.1, -0.06), v(0.29, 0.1, -0.06), 0.013, dark));
  const crank = new THREE.Group();
  crank.position.copy(bb);
  root.add(crank);
  crank.add(mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.01, 16).rotateZ(Math.PI / 2), metal, 0.05, 0, 0));
  for (const s of [-1, 1]) {
    const arm = mesh(new THREE.BoxGeometry(0.02, 0.17, 0.03), metal, s * 0.07, s * 0.08, 0);
    crank.add(arm);
    crank.add(mesh(new THREE.BoxGeometry(0.1, 0.02, 0.06), dark, s * 0.12, s * 0.16, 0));
  }
  return { root, wheels: [back, front], steer, crank, radius: 0.34 };
}

export function buildMotorcycle(shared) {
  const paint = std(0x111214, 0.35, 0.4);
  const accent = std(0xf07a18, 0.35, 0.3);
  const dark = std(0x0d0d0f, 0.9);
  const chrome = std(0xd8dde2, 0.2, 0.9);
  const root = new THREE.Group();
  const back = wheel(0.31, 0.085, dark, chrome, false);
  back.position.set(0, 0.36, -0.72);
  root.add(back);
  const tank = mesh(new THREE.SphereGeometry(0.3, 16, 10), accent, 0, 0.97, 0.12);
  tank.scale.set(0.62, 0.45, 1);
  root.add(tank);
  root.add(mesh(new THREE.BoxGeometry(0.3, 0.09, 0.62), dark, 0, 0.9, -0.36));
  root.add(mesh(new THREE.BoxGeometry(0.24, 0.13, 0.42), paint, 0, 0.92, -0.72));
  root.add(mesh(new THREE.BoxGeometry(0.16, 0.06, 0.03), glow(5, 0.2, 0.1), 0, 0.92, -0.94));
  root.add(mesh(new THREE.BoxGeometry(0.32, 0.36, 0.46), std(0x3b3f45, 0.4, 0.7), 0, 0.53, 0.02));
  for (let k = 0; k < 4; k++) root.add(mesh(new THREE.BoxGeometry(0.36, 0.02, 0.4), chrome, 0, 0.42 + k * 0.07, 0.02));
  root.add(tube(v(0.18, 0.38, 0.12), v(0.2, 0.5, -0.9), 0.045, chrome));
  root.add(tube(v(0, 0.5, -0.1), v(0, 0.36, -0.72), 0.03, paint));
  root.add(tube(v(0, 0.95, 0.4), v(0, 0.55, 0.2), 0.035, paint));
  const steer = new THREE.Group();
  steer.position.set(0, 0.98, 0.5);
  steer.rotation.x = -0.35; // raked fork
  root.add(steer);
  const front = wheel(0.31, 0.085, dark, chrome, false);
  front.position.set(0, -0.72, 0.28);
  front.rotation.x = 0.35;
  steer.add(front);
  for (const s of [-1, 1]) steer.add(tube(v(s * 0.1, 0.05, 0), v(s * 0.1, -0.72, 0.28), 0.028, chrome));
  steer.add(tube(v(-0.36, 0.2, -0.08), v(0.36, 0.2, -0.08), 0.017, dark));
  const lamp = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.08, 16).rotateX(Math.PI / 2), glow(6, 5.6, 4.8), 0, 0.02, 0.12);
  steer.add(lamp);
  const b = beam(shared, 0.9);
  root.add(b);
  return { root, wheels: [back, front], steer, radius: 0.31, beam: b };
}

export function buildSUV(shared) {
  const paint = std(0x0c0d10, 0.3, 0.6);
  const dark = std(0x08080a, 0.9);
  const chrome = std(0xcfd4da, 0.25, 0.9);
  const glass = new THREE.MeshStandardMaterial({ color: 0x0a1018, roughness: 0.1, metalness: 0.6, transparent: true, opacity: 0.55 });
  const root = new THREE.Group();
  root.add(mesh(new THREE.BoxGeometry(2.0, 0.85, 5.1), paint, 0, 0.82, 0));
  root.add(mesh(new THREE.BoxGeometry(1.86, 0.74, 3.05), glass, 0, 1.6, -0.4));
  root.add(mesh(new THREE.BoxGeometry(1.92, 0.08, 3.1), paint, 0, 2.0, -0.4));
  for (const x of [-0.93, 0.93]) {
    for (const z of [1.08, -0.4, -1.9]) root.add(mesh(new THREE.BoxGeometry(0.06, 0.74, 0.12), paint, x, 1.6, z));
    root.add(mesh(new THREE.BoxGeometry(0.04, 0.04, 2.6), chrome, x * 0.8, 2.07, -0.4));
  }
  root.add(mesh(new THREE.BoxGeometry(1.3, 0.36, 0.06), chrome, 0, 0.98, 2.56));
  root.add(mesh(new THREE.BoxGeometry(2.04, 0.22, 0.2), dark, 0, 0.48, 2.52));
  root.add(mesh(new THREE.BoxGeometry(2.04, 0.22, 0.2), dark, 0, 0.48, -2.52));
  for (const s of [-1, 1]) {
    root.add(mesh(new THREE.BoxGeometry(0.34, 0.14, 0.05), glow(6, 5.7, 5), s * 0.78, 1.02, 2.56));
    root.add(mesh(new THREE.BoxGeometry(0.14, 0.3, 0.05), glow(4, 0.15, 0.1), s * 0.9, 1.05, -2.56));
  }
  const wheels = [];
  const steerL = new THREE.Group();
  const steerR = new THREE.Group();
  for (const [x, z, parent] of [[-0.98, -1.6, root], [0.98, -1.6, root], [-0.98, 1.6, steerL], [0.98, 1.6, steerR]]) {
    const w = new THREE.Group();
    const tire = mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 18).rotateZ(Math.PI / 2), dark);
    const rim = mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.32, 12).rotateZ(Math.PI / 2), chrome);
    w.add(tire, rim);
    if (parent === root) {
      w.position.set(x, 0.42, z);
      root.add(w);
    } else {
      parent.position.set(x, 0.42, z);
      root.add(parent);
      parent.add(w);
    }
    wheels.push(w);
  }
  const b = beam(shared, 2.6, 4, 14);
  root.add(b);
  return { root, wheels, steerGroups: [steerL, steerR], radius: 0.42, beam: b };
}

// ---------- first-person cockpits (children of the camera: -z is forward) ----------

/** A round speedometer drawn on a canvas. */
export function makeSpeedo() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  let last = -1;
  return {
    tex,
    draw(mph, max) {
      const v = Math.round(mph);
      if (v === last) return;
      last = v;
      ctx.clearRect(0, 0, 256, 256);
      ctx.fillStyle = '#0c0d10';
      ctx.beginPath();
      ctx.arc(128, 128, 124, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#f07a18';
      ctx.lineWidth = 6;
      ctx.stroke();
      const a0 = Math.PI * 0.75;
      const span = Math.PI * 1.5;
      ctx.strokeStyle = '#e8eef5';
      ctx.lineWidth = 4;
      for (let k = 0; k <= 10; k++) {
        const a = a0 + (k / 10) * span;
        ctx.beginPath();
        ctx.moveTo(128 + Math.cos(a) * 100, 128 + Math.sin(a) * 100);
        ctx.lineTo(128 + Math.cos(a) * 116, 128 + Math.sin(a) * 116);
        ctx.stroke();
      }
      const a = a0 + Math.min(1, mph / max) * span;
      ctx.strokeStyle = '#ff3b30';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(128, 128);
      ctx.lineTo(128 + Math.cos(a) * 96, 128 + Math.sin(a) * 96);
      ctx.stroke();
      ctx.fillStyle = '#e8eef5';
      ctx.font = 'bold 56px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(v), 128, 196);
      ctx.font = 'bold 20px system-ui, sans-serif';
      ctx.fillText('MPH', 128, 222);
      tex.needsUpdate = true;
    },
  };
}

function hands(parent, points, sleeveFrom) {
  const skin = std(COLORS.skin, 0.7);
  const jacket = std(COLORS.jacket, 0.8);
  points.forEach((p, i) => {
    parent.add(mesh(new THREE.SphereGeometry(0.042, 10, 8), skin, p.x, p.y, p.z));
    parent.add(tube(sleeveFrom[i], p, 0.05, jacket));
  });
}

export function buildCockpits(speedo) {
  const dark = std(0x16181b, 0.8);
  const metal = std(0xb8bcc2, 0.3, 0.8);
  const gauge = new THREE.MeshBasicMaterial({ map: speedo.tex, transparent: true, color: new THREE.Color(1.4, 1.4, 1.4) });

  // bicycle: bars, stem, hands
  const bike = new THREE.Group();
  const bikeBars = new THREE.Group();
  bikeBars.position.set(0, -0.42, -0.55);
  bike.add(bikeBars);
  bikeBars.add(tube(v(-0.29, 0, 0), v(0.29, 0, 0), 0.014, dark));
  bikeBars.add(tube(v(0, 0, 0), v(0, -0.3, -0.06), 0.02, std(0x16b39a, 0.45, 0.3)));
  for (const s of [-1, 1]) bikeBars.add(tube(v(s * 0.2, 0, 0), v(s * 0.29, 0, 0), 0.02, dark));
  hands(bikeBars, [v(-0.25, 0.02, 0), v(0.25, 0.02, 0)], [v(-0.32, -0.35, 0.5), v(0.32, -0.35, 0.5)]);

  // motorcycle: tank, clip-ons, mirrors, gauge, hands
  const moto = new THREE.Group();
  const tank = mesh(new THREE.SphereGeometry(0.3, 16, 10), std(0xf07a18, 0.35, 0.3), 0, -0.78, -0.42);
  tank.scale.set(0.62, 0.4, 1);
  moto.add(tank);
  const motoBars = new THREE.Group();
  motoBars.position.set(0, -0.4, -0.52);
  moto.add(motoBars);
  motoBars.add(tube(v(-0.36, 0, 0.04), v(0.36, 0, 0.04), 0.017, dark));
  motoBars.add(mesh(new THREE.BoxGeometry(0.3, 0.14, 0.12), std(0x111214, 0.35, 0.4), 0, 0.02, -0.12));
  const dial = mesh(new THREE.CircleGeometry(0.075, 24), gauge, 0, 0.1, -0.07);
  dial.rotation.x = -0.6;
  motoBars.add(dial);
  for (const s of [-1, 1]) {
    motoBars.add(tube(v(s * 0.26, 0, 0.02), v(s * 0.3, 0.2, -0.02), 0.008, metal));
    const mirror = mesh(new THREE.CircleGeometry(0.05, 16), std(0x9fb0c8, 0.1, 0.9), s * 0.31, 0.22, -0.02);
    motoBars.add(mirror);
  }
  hands(motoBars, [v(-0.31, 0.02, 0.04), v(0.31, 0.02, 0.04)], [v(-0.34, -0.3, 0.52), v(0.34, -0.3, 0.52)]);

  // SUV: dashboard, wheel, pillars, hood (the driver sits left of center)
  const suv = new THREE.Group();
  const plastic = std(0x1b1c20, 0.85);
  suv.add(mesh(new THREE.BoxGeometry(1.95, 0.3, 0.6), plastic, 0.45, -0.55, -0.82));
  suv.add(mesh(new THREE.BoxGeometry(0.5, 0.12, 0.26), plastic, 0, -0.36, -0.72));
  const cluster = mesh(new THREE.CircleGeometry(0.09, 24), gauge, 0, -0.39, -0.6);
  cluster.rotation.x = -0.25;
  suv.add(cluster);
  suv.add(mesh(new THREE.BoxGeometry(1.95, 0.1, 1.9), std(0x0c0d10, 0.3, 0.6), 0.45, -0.72, -2.0));
  suv.add(tube(v(-0.52, -0.4, -0.95), v(-0.44, 0.44, -0.36), 0.045, plastic));
  suv.add(tube(v(1.42, -0.4, -0.95), v(1.34, 0.44, -0.36), 0.045, plastic));
  suv.add(mesh(new THREE.BoxGeometry(1.95, 0.08, 0.35), plastic, 0.45, 0.48, -0.28));
  suv.add(mesh(new THREE.BoxGeometry(0.26, 0.07, 0.02), std(0x9fb0c8, 0.1, 0.9), 0.45, 0.33, -0.62));
  suv.add(mesh(new THREE.BoxGeometry(0.08, 0.1, 1.2), plastic, -0.52, -0.42, -0.2));
  const wheelTilt = new THREE.Group();
  wheelTilt.position.set(0, -0.42, -0.5);
  wheelTilt.rotation.x = 1.15;
  suv.add(wheelTilt);
  const suvWheel = new THREE.Group();
  wheelTilt.add(suvWheel);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.022, 8, 28), dark);
  rim.rotation.x = Math.PI / 2;
  suvWheel.add(rim);
  for (const a of [0, 2.1, 4.2]) {
    const spoke = mesh(new THREE.BoxGeometry(0.02, 0.012, 0.19), plastic, Math.sin(a) * 0.09, 0, Math.cos(a) * 0.09);
    spoke.rotation.y = a;
    suvWheel.add(spoke);
  }
  suvWheel.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 12), plastic));
  hands(suvWheel, [v(-0.17, 0.02, -0.08), v(0.17, 0.02, -0.08)], [v(-0.3, 0.5, 0.2), v(0.3, 0.5, 0.2)]);

  for (const g of [bike, moto, suv]) g.visible = false;
  return { bike, moto, suv, bikeBars, motoBars, suvWheel };
}

/**
 * A 70s-90s sedan from its side profile: sloped hood and trunk, a cabin, wheel arches.
 * Returns body and glass geometries, car pointing +z, 4.7 m long, 1.84 m wide.
 */
export function sedanGeometry() {
  const W = 1.84;
  const arch = (s, cz) => {
    // walk the wheel arch as a half circle, from front to back along the underside
    for (let k = 0; k <= 8; k++) {
      const a = (k / 8) * Math.PI;
      s.lineTo(cz + Math.cos(a) * 0.42, 0.34 + Math.sin(a) * 0.42);
    }
  };
  // a 70s New York sedan: square nose, long flat hood and trunk, upright glass, flat roof
  const body = new THREE.Shape();
  body.moveTo(2.4, 0.3);
  body.lineTo(2.43, 0.78);
  body.lineTo(2.33, 0.87);
  body.lineTo(0.95, 0.93); // long flat hood
  body.lineTo(0.38, 1.37); // upright windshield
  body.lineTo(-0.95, 1.39); // flat roof
  body.lineTo(-1.42, 1.0); // rear window
  body.lineTo(-2.3, 0.96); // long trunk
  body.lineTo(-2.43, 0.84);
  body.lineTo(-2.4, 0.3);
  arch(body, -1.5);
  body.lineTo(1.1, 0.3);
  arch(body, 1.5);
  body.lineTo(2.4, 0.3);
  const bodyGeo = new THREE.ExtrudeGeometry(body, {
    depth: W - 0.16, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 1, curveSegments: 4,
  });
  // shape x runs along the car: rotate so it points +z and center the width
  bodyGeo.rotateY(-Math.PI / 2);
  bodyGeo.translate((W - 0.16) / 2, 0, 0);

  const glass = new THREE.Shape();
  glass.moveTo(0.93, 0.95);
  glass.lineTo(0.4, 1.33);
  glass.lineTo(-0.93, 1.35);
  glass.lineTo(-1.37, 1.0);
  glass.lineTo(0.93, 0.95);
  const glassGeo = new THREE.ExtrudeGeometry(glass, { depth: W - 0.06, bevelEnabled: false });
  glassGeo.rotateY(-Math.PI / 2);
  glassGeo.translate((W - 0.06) / 2, 0.005, 0);

  // chrome: wraparound bumpers, a grille, and trim along the flanks
  const chrome = mergeGeometries([
    new THREE.BoxGeometry(W + 0.08, 0.17, 0.2).translate(0, 0.42, 2.46),
    new THREE.BoxGeometry(W + 0.08, 0.17, 0.2).translate(0, 0.42, -2.46),
    new THREE.BoxGeometry(1.1, 0.24, 0.05).translate(0, 0.66, 2.46),
    new THREE.BoxGeometry(0.03, 0.05, 3.9).translate(W / 2 + 0.02, 0.72, 0),
    new THREE.BoxGeometry(0.03, 0.05, 3.9).translate(-W / 2 - 0.02, 0.72, 0),
  ]);
  // drop the uv/extra attributes differences between the two
  return { body: bodyGeo, glass: glassGeo, chrome };
}
