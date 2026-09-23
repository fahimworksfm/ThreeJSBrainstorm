// Street details from the reference art: Con Ed steam stacks and bodega fruit stands.
import * as THREE from 'three';

let stripeTex = null;
/** Orange and white stripes, like the real Con Ed chimneys. */
function stripes() {
  if (stripeTex) return stripeTex;
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 64;
  const ctx = c.getContext('2d');
  for (let k = 0; k < 4; k++) {
    ctx.fillStyle = k % 2 ? '#f4efe6' : '#ff6a1a';
    ctx.fillRect(0, k * 16, 16, 16);
  }
  stripeTex = new THREE.CanvasTexture(c);
  stripeTex.colorSpace = THREE.SRGBColorSpace;
  stripeTex.wrapS = stripeTex.wrapT = THREE.RepeatWrapping;
  return stripeTex;
}

/** A steam stack standing in the road at (x, z); push the returned emitter into the steam list. */
export function steamStack(x, z) {
  const g = new THREE.CylinderGeometry(0.26, 0.42, 2.1, 12, 1, true);
  g.translate(x, 1.05, z);
  const cap = new THREE.CylinderGeometry(0.3, 0.3, 0.08, 12).translate(x, 2.12, z);
  const uvCap = cap.attributes.uv;
  for (let i = 0; i < uvCap.count; i++) uvCap.setXY(i, 0.5, 0.05);
  return { geos: [g, cap], emitter: { x, y: 2.2, z, strength: 1.6 } };
}

export function stackMaterial() {
  return new THREE.MeshStandardMaterial({ map: stripes(), roughness: 0.7, side: THREE.DoubleSide });
}

const FRUIT = [0xff8a1a, 0xd8261e, 0x7fbf2a, 0xf2d024, 0xa8203a, 0xff5a2a, 0x4f9a2a];

function colored(g, hex) {
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g.index ? g.toNonIndexed() : g;
}

/**
 * A fruit stand against a shop front: a slanted table of crates heaped with produce.
 * (x, z) is the facade point, (nx, nz) its outward normal. Returns vertex-colored geometries.
 */
export function fruitStand(x, z, nx, nz, width, rnd, y0) {
  const geos = [];
  const ang = Math.atan2(nx, nz);
  const place = (g) => g.rotateY(ang).translate(x, y0, z);
  // table
  geos.push(place(colored(new THREE.BoxGeometry(width, 0.75, 0.9).translate(0, 0.375, 0.9), 0x5a3a22)));
  const crates = Math.max(2, Math.floor(width / 0.6));
  for (let k = 0; k < crates; k++) {
    const cx = -width / 2 + (k + 0.5) * (width / crates);
    // crates tilt toward the street so you can see what's in them
    const crate = new THREE.BoxGeometry(width / crates - 0.06, 0.22, 0.8).rotateX(0.28).translate(cx, 0.86, 0.9);
    geos.push(place(colored(crate, 0xb88a4a)));
    const heap = new THREE.SphereGeometry(0.34, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2)
      .scale((width / crates) / 0.72, 0.5, 1.05)
      .rotateX(0.28)
      .translate(cx, 0.95, 0.88);
    geos.push(place(colored(heap, FRUIT[Math.floor(rnd() * FRUIT.length)])));
  }
  return geos;
}

const CRATES = [0xc8322a, 0x2a5fb0, 0xe8b820, 0x2f8a4a, 0xd8d4c8];
const CARDBOARD = [0xa77b48, 0x8f6a3e, 0xb98f5a];

/**
 * Milk crates and cardboard boxes stacked against a shop wall.
 * (x, z) is the facade point, (nx, nz) its outward normal. Returns vertex-colored geometries.
 */
export function crateStack(x, z, nx, nz, rnd, y0) {
  const geos = [];
  const ang = Math.atan2(nx, nz);
  const place = (g) => g.rotateY(ang).translate(x, y0, z);
  const cols = 1 + Math.floor(rnd() * 3);
  for (let c = 0; c < cols; c++) {
    const high = 1 + Math.floor(rnd() * 3);
    const cardboard = rnd() < 0.35;
    for (let k = 0; k < high; k++) {
      const w = cardboard ? 0.5 + rnd() * 0.2 : 0.36;
      const h = cardboard ? 0.35 + rnd() * 0.15 : 0.28;
      const box = new THREE.BoxGeometry(w, h, cardboard ? 0.5 : 0.36)
        .rotateY((rnd() - 0.5) * 0.3)
        .translate((c - (cols - 1) / 2) * 0.46 + (rnd() - 0.5) * 0.06, h / 2 + k * h, 0.3);
      const pal = cardboard ? CARDBOARD : CRATES;
      geos.push(place(colored(box, pal[Math.floor(rnd() * pal.length)])));
    }
  }
  return geos;
}

const LITTER = [0xf2efe4, 0xe8e2cc, 0xb8b4a8, 0xd8261e, 0xf2d024, 0x7a756a];

/**
 * Litter on the pavement: paper scraps, flattened cups and newspaper pages, lying flat.
 * Scattered from (x, z) out along (nx, nz) by up to `reach` meters, `across` meters wide.
 */
export function litter(x, z, nx, nz, reach, across, rnd, y0, count = 5) {
  const geos = [];
  for (let k = 0; k < count; k++) {
    const out = 0.4 + rnd() * reach;
    const side = (rnd() - 0.5) * across;
    const px = x + nx * out - nz * side;
    const pz = z + nz * out + nx * side;
    const s = rnd() < 0.2 ? 0.45 + rnd() * 0.25 : 0.1 + rnd() * 0.18; // now and then a whole newspaper page
    const g = new THREE.PlaneGeometry(s, s * (0.6 + rnd() * 0.5))
      .rotateX(-Math.PI / 2)
      .rotateY(rnd() * Math.PI)
      .translate(px, y0 + 0.015 + k * 0.001, pz);
    g.deleteAttribute('uv');
    geos.push(colored(g, LITTER[Math.floor(rnd() * LITTER.length)]));
  }
  return geos;
}

const remapV = (g, v0, v1) => {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setY(i, v0 + uv.getY(i) * (v1 - v0));
  return g;
};

/**
 * A 70s sidewalk payphone: a steel post, a phone box with a keypad, and a blue TELEPHONE
 * sign box on top. (x, z) is its spot on the sidewalk, `ang` the way the phone faces.
 */
export function payphone(x, z, ang, y0) {
  const geos = [];
  const put = (g) => geos.push(g.rotateY(ang).translate(x, y0, z));
  const post = remapV(new THREE.BoxGeometry(0.12, 2.1, 0.12), 0.02, 0.04).translate(0, 1.05, 0);
  put(post);
  put(remapV(new THREE.BoxGeometry(0.46, 0.6, 0.28), 0, 0.5).translate(0, 1.35, 0.16));
  put(remapV(new THREE.BoxGeometry(0.64, 0.05, 0.4), 0.02, 0.04).translate(0, 1.68, 0.16)); // hood
  put(remapV(new THREE.BoxGeometry(0.62, 0.3, 0.3), 0.5, 1).translate(0, 2.25, 0.02));
  return geos;
}

let phoneTex = null;
/** Shared payphone material: the top half of the texture is the sign, the bottom the keypad face. */
export function payphoneMaterial() {
  if (!phoneTex) {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const x = c.getContext('2d');
    x.fillStyle = '#1d4f9e';
    x.fillRect(0, 0, 128, 64);
    x.fillStyle = '#f4f1e8';
    x.fillRect(0, 26, 128, 14);
    x.fillStyle = '#1d4f9e';
    x.font = 'bold 13px Arial, sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText('TELEPHONE', 64, 34);
    x.fillStyle = '#a9adb2';
    x.fillRect(0, 64, 128, 64);
    x.fillStyle = '#2a2c30';
    x.fillRect(22, 70, 22, 50); // handset
    for (let r = 0; r < 4; r++) for (let k = 0; k < 3; k++) x.fillRect(64 + k * 14, 76 + r * 11, 9, 7);
    phoneTex = new THREE.CanvasTexture(c);
    phoneTex.colorSpace = THREE.SRGBColorSpace;
  }
  const mat = new THREE.MeshStandardMaterial({ map: phoneTex, roughness: 0.5, metalness: 0.3 });
  mat.name = 'payphone';
  return mat;
}
