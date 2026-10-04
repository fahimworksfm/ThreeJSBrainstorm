// Roll-down security gates: when a real shop is shut (its mapped opening hours, or the usual hours for its
// trade), the corrugated steel gate is down over the window, half of them tagged. All-night delis stay open.
import * as THREE from 'three';
import { CURB } from './config.js';
import { isOpen } from './hours.js';

const TAGS = ['ZEPHYR', 'REVS', 'KR', 'SANE', 'COPE2', 'NYC', 'DASH', 'JA', 'SKUF', 'EASY'];
const INKS = ['#e3262e', '#2d7fd6', '#2ecc71', '#f5c518', '#ff4fd8', '#111', '#ffffff'];

/** A sheet of gate looks: plain steel, and tagged ones, side by side (variant per shop). */
function gateTexture(variants = 4) {
  const W = 256;
  const H = 256;
  const c = document.createElement('canvas');
  c.width = W * variants;
  c.height = H;
  const g = c.getContext('2d');
  for (let v = 0; v < variants; v++) {
    const x0 = v * W;
    // corrugated slats
    for (let y = 0; y < H; y += 8) {
      const grad = g.createLinearGradient(0, y, 0, y + 8);
      grad.addColorStop(0, '#8d929a');
      grad.addColorStop(0.5, '#b7bcc3');
      grad.addColorStop(1, '#6b7078');
      g.fillStyle = grad;
      g.fillRect(x0, y, W, 8);
    }
    // grime toward the bottom, a lock plate at the foot
    const dirt = g.createLinearGradient(0, H * 0.5, 0, H);
    dirt.addColorStop(0, 'rgba(40,30,20,0)');
    dirt.addColorStop(1, 'rgba(40,30,20,0.45)');
    g.fillStyle = dirt;
    g.fillRect(x0, 0, W, H);
    g.fillStyle = '#3a3d42';
    g.fillRect(x0 + W / 2 - 14, H - 18, 28, 14);
    // ink outline, like everything else
    g.strokeStyle = '#111';
    g.lineWidth = 6;
    g.strokeRect(x0 + 3, 3, W - 6, H - 6);
    if (v === 0) continue;
    // a throw-up or two
    for (let k = 0; k < (v === 3 ? 2 : 1); k++) {
      const tag = TAGS[(v * 3 + k * 5) % TAGS.length];
      g.save();
      g.translate(x0 + W * (k ? 0.68 : 0.42), H * (k ? 0.72 : 0.45));
      g.rotate(-0.12 + k * 0.18);
      g.font = `bold ${k ? 34 : 54}px Impact, "Arial Black", sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineJoin = 'round';
      g.lineWidth = 10;
      g.strokeStyle = '#111';
      g.strokeText(tag, 0, 0);
      g.fillStyle = INKS[(v + k * 2) % INKS.length];
      g.fillText(tag, 0, 0);
      g.restore();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Gates {
  /** boards: the real shop signs ({ x, z, nx, nz, w, trade, hours, allNight }). */
  constructor(boards) {
    this.group = new THREE.Group();
    this.shops = (boards ?? []).filter((b) => b.w > 1.5);
    this.last = null;
    if (!this.shops.length) return;
    const V = 4;
    const geo = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
    // a per-instance offset into the sheet of looks
    const look = new Float32Array(this.shops.length);
    this.shops.forEach((b, i) => (look[i] = (i * 7 + Math.round(b.x)) % V));
    geo.setAttribute('aLook', new THREE.InstancedBufferAttribute(look, 1));
    const mat = new THREE.MeshStandardMaterial({ map: gateTexture(V), roughness: 0.55, metalness: 0.15 });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('void main() {', `attribute float aLook;\nvoid main() {`)
        .replace('#include <uv_vertex>', `#include <uv_vertex>\n#ifdef USE_MAP\n vMapUv.x = (vMapUv.x + aLook) / ${V}.0;\n#endif`);
    };
    mat.customProgramCacheKey = () => 'gate';
    this.mesh = new THREE.InstancedMesh(geo, mat, this.shops.length);
    this.mesh.castShadow = false;
    this.mesh.frustumCulled = false; // spread over the whole map: its bounds are the unit plane's
    this.mesh.receiveShadow = true;
    this.mats = this.shops.map((b) => {
      const m = new THREE.Matrix4();
      const w = Math.max(1.4, b.w - 0.4);
      const ang = Math.atan2(b.nx, b.nz);
      m.compose(
        new THREE.Vector3(b.x + b.nx * 0.16, CURB, b.z + b.nz * 0.16),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ang),
        new THREE.Vector3(w, 3.3, 1),
      );
      return m;
    });
    this.zero = new THREE.Matrix4().makeScale(0, 0, 0);
    this.group.add(this.mesh);
  }

  /** How many are shut right now (for the tests and the almanac). */
  get shut() {
    return this.state ? this.state.filter(Boolean).length : 0;
  }

  /** Lift or drop each gate for the clock (weekday 0 = Sunday); checked when the minute changes. */
  update(weekday, minute) {
    if (!this.mesh) return;
    const key = `${weekday}|${Math.floor(minute)}`;
    if (key === this.last) return;
    this.last = key;
    this.state = this.shops.map((b) => !isOpen(b, weekday, minute));
    this.state.forEach((closed, i) => this.mesh.setMatrixAt(i, closed ? this.mats[i] : this.zero));
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
