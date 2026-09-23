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
