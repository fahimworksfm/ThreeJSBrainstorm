// The real calendar on the street: the season picks the trees (bare in winter, blossom in spring, orange in
// the fall), and the holidays put decorations out: jack-o'-lanterns on the stoops all October, strings of
// lights on the shop fronts from December into the new year, flags for the Fourth.
import * as THREE from 'three';
import { CURB } from './config.js';

/** Month and day in New York. */
function nyDate(d = new Date()) {
  const [m, day] = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'numeric', day: 'numeric' }).format(d).split('/').map(Number);
  return { m, day };
}

/** 'bare' | 'spring' | 'summer' | 'autumn' for today in New York. */
export function season(d = new Date()) {
  const { m, day } = nyDate(d);
  if (m === 12 || m <= 2 || (m === 3 && day < 20)) return 'bare';
  if (m === 3 || m === 4) return 'spring';
  if (m >= 5 && m <= 9) return 'summer';
  return m === 11 && day > 20 ? 'bare' : 'autumn';
}

/** Which decorations are up today: 'halloween' | 'winter' | 'july4' | null. */
export function holiday(d = new Date()) {
  const { m, day } = nyDate(d);
  if (m === 10) return 'halloween';
  if (m === 12 || (m === 1 && day <= 6)) return 'winter';
  if ((m === 6 && day >= 28) || (m === 7 && day <= 5)) return 'july4';
  return null;
}

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A jack-o'-lantern: ribbed orange skin, and a carved face that glows at night (an emissive map). */
function pumpkinMaterial() {
  const map = canvasTex(256, 128, (x, w, h) => {
    x.fillStyle = '#e8741c';
    x.fillRect(0, 0, w, h);
    x.strokeStyle = '#a8460c';
    x.lineWidth = 6;
    for (let i = 0; i < 8; i++) {
      x.beginPath();
      x.moveTo((i / 8) * w, 0);
      x.lineTo((i / 8) * w, h);
      x.stroke();
    }
    x.fillStyle = '#2a1204';
    face(x, w, h);
  });
  const emissiveMap = canvasTex(256, 128, (x, w, h) => {
    x.fillStyle = '#000';
    x.fillRect(0, 0, w, h);
    x.fillStyle = '#ffb22e';
    face(x, w, h);
  });
  const m = new THREE.MeshStandardMaterial({ map, emissiveMap, emissive: 0xffffff, emissiveIntensity: 1.6, roughness: 0.8 });
  m.userData.bright = true; // the time-of-day pass lights it up at night
  return m;
}
function face(x, w, h) {
  // the front of the sphere is the middle of the texture
  const cx = w * 0.75;
  const tri = (ax, ay, bx, by, cxx, cy) => {
    x.beginPath();
    x.moveTo(ax, ay);
    x.lineTo(bx, by);
    x.lineTo(cxx, cy);
    x.fill();
  };
  tri(cx - 26, 52, cx - 10, 52, cx - 18, 36);
  tri(cx + 10, 52, cx + 26, 52, cx + 18, 36);
  x.beginPath();
  x.moveTo(cx - 30, 72);
  for (let k = 0; k <= 6; k++) x.lineTo(cx - 30 + k * 10, k % 2 ? 80 : 90);
  x.lineTo(cx + 30, 72);
  x.quadraticCurveTo(cx, 84, cx - 30, 72);
  x.fill();
}

/**
 * Decorations for today along the street-facing walls.
 * faces: [{ x, z, nx, nz, w, shop, lot }]; returns { group, kind } (an empty group most of the year).
 */
export function buildDecor(faces, kind = holiday()) {
  const group = new THREE.Group();
  if (!kind || !faces?.length) return { group, kind: null };
  let seed = 12345;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const homes = faces.filter((f) => !f.shop && f.lot && !f.lot.outer && /row|house|apt|walk/.test(f.lot.kind ?? 'row'));
  const shops = faces.filter((f) => f.shop && f.w > 4);

  if (kind === 'halloween') {
    // one to three jack-o'-lanterns by the door of about a third of the homes
    const spots = [];
    for (const f of homes) {
      if (rnd() > 0.35 || spots.length > 160) continue;
      const n = 1 + Math.floor(rnd() * 3);
      for (let k = 0; k < n; k++) spots.push([f.x + f.nx * 0.8 - f.nz * (k * 0.45 - 0.4), f.z + f.nz * 0.8 + f.nx * (k * 0.45 - 0.4), 0.7 + rnd() * 0.5, Math.atan2(f.nx, f.nz)]);
    }
    const geo = new THREE.SphereGeometry(0.2, 14, 10).scale(1, 0.82, 1).translate(0, 0.16, 0);
    const stem = new THREE.CylinderGeometry(0.02, 0.03, 0.08, 5).translate(0, 0.34, 0);
    const pumpkins = new THREE.InstancedMesh(geo, pumpkinMaterial(), spots.length);
    const stems = new THREE.InstancedMesh(stem, new THREE.MeshStandardMaterial({ color: 0x4a5a1c, roughness: 1 }), spots.length);
    spots.forEach(([x, z, k, yaw], i) => {
      // the face looks out at the street (the texture's middle is at +x of the sphere)
      q.setFromAxisAngle(up, yaw - Math.PI / 2 + (rnd() - 0.5) * 0.6);
      m.compose(p.set(x, CURB, z), q, s.setScalar(k));
      pumpkins.setMatrixAt(i, m);
      stems.setMatrixAt(i, m);
    });
    group.add(pumpkins, stems);
  }

  if (kind === 'winter' || kind === 'halloween') {
    // strings of bulbs swagged along the shop fronts above the windows
    const bulbs = [];
    const palette = kind === 'winter' ? [0xff3b30, 0x34c759, 0x0a84ff, 0xffd60a, 0xff9f0a] : [0xff7a00, 0x9b30ff];
    for (const f of shops) {
      if (rnd() > (kind === 'winter' ? 0.6 : 0.25) || bulbs.length > 4000) continue;
      const n = Math.floor(f.w / 0.35);
      for (let k = 0; k <= n; k++) {
        const t = k / n - 0.5;
        const sag = Math.abs(Math.sin(k * 0.35)) * 0.18;
        bulbs.push([f.x + f.nx * 0.12 - f.nz * t * f.w * 0.92, 3.55 - sag, f.z + f.nz * 0.12 + f.nx * t * f.w * 0.92, palette[k % palette.length]]);
      }
    }
    if (bulbs.length) {
      const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.045, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }), bulbs.length);
      const c = new THREE.Color();
      bulbs.forEach(([x, y, z, col], i) => {
        m.makeTranslation(x, CURB + y, z);
        mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, c.setHex(col).multiplyScalar(2.2)); // over 1: the bloom makes them glow
      });
      mesh.userData.noShadow = true;
      group.add(mesh);
    }
  }

  if (kind === 'july4') {
    // little flags out front
    const flagTex = canvasTex(96, 64, (x, w, h) => {
      for (let i = 0; i < 13; i++) {
        x.fillStyle = i % 2 ? '#fff' : '#b22234';
        x.fillRect(0, (i * h) / 13, w, h / 13 + 1);
      }
      x.fillStyle = '#3c3b6e';
      x.fillRect(0, 0, w * 0.42, h * 0.54);
    });
    const spots = homes.filter(() => rnd() < 0.3).slice(0, 120);
    const flags = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.6, 0.4).translate(0.3, 0, 0), new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide, roughness: 0.9 }), spots.length);
    spots.forEach((f, i) => {
      q.setFromAxisAngle(up, Math.atan2(f.nx, f.nz) + Math.PI / 2);
      m.compose(p.set(f.x + f.nx * 0.1, CURB + 2.6, f.z + f.nz * 0.1), q, s.setScalar(1));
      flags.setMatrixAt(i, m);
    });
    group.add(flags);
  }
  return { group, kind };
}
