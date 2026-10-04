// Leaves coming down in the fall: from the street trees around you that are dropping theirs today (the
// species calendar in foliage.js), each leaf the color of its own tree, tumbling and drifting with the
// breeze, then lying a while on the sidewalk.
import * as THREE from 'three';

const N = 260;

function leafTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  g.translate(16, 16);
  g.rotate(0.6);
  g.beginPath();
  g.ellipse(0, 0, 13, 7, 0, 0, Math.PI * 2);
  g.fillStyle = '#fff';
  g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.55)';
  g.lineWidth = 2.2;
  g.stroke();
  g.beginPath();
  g.moveTo(-12, 0);
  g.lineTo(12, 0);
  g.lineWidth = 1.2;
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class FallingLeaves {
  /** crowns: the tree crowns InstancedMesh (after setFoliage); groundAt(x, z): the ground height there, hills included. */
  constructor(crowns, groundAt) {
    this.groundAt = groundAt;
    this.group = new THREE.Group();
    this.trees = [];
    const drop = crowns?.userData.dropping ?? [];
    const base = crowns?.userData.base ?? [];
    const v = new THREE.Vector3();
    const c = new THREE.Color();
    for (let i = 0; i < drop.length; i++) {
      if (drop[i] < 0.05 || !base[i]) continue;
      v.setFromMatrixPosition(base[i]);
      crowns.getColorAt(i, c);
      // the crown colors are darkened under leaf cards: lift them back for a single leaf in the light
      if (crowns.userData.cards) c.multiplyScalar(2.2);
      this.trees.push({ x: v.x, y: v.y, z: v.z, w: drop[i], r: c.r, g: c.g, b: c.b });
    }
    if (!this.trees.length) return;
    this.pos = new Float32Array(N * 3);
    this.col = new Float32Array(N * 3);
    this.leaf = Array.from({ length: N }, () => ({ on: false, vy: 0, t: 0, rest: 0, ph: Math.random() * 6 }));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.24, map: leafTexture(), vertexColors: true, alphaTest: 0.5, sizeAttenuation: true, fog: true,
    }));
    this.points.frustumCulled = false;
    this.points.userData.noTerrain = true;
    this.group.add(this.points);
    for (let i = 0; i < N; i++) this.pos[i * 3 + 1] = -1000;
    this.spawnAcc = 0;
  }

  get count() {
    return this.trees.length;
  }

  update(dt, cam) {
    if (!this.points) return;
    // the trees near you (looked up once a second), each shedding as fast as it is today
    this.nearT = (this.nearT ?? 0) - dt;
    if (this.nearT <= 0) {
      this.nearT = 1;
      this.near = this.trees.filter((tr) => Math.hypot(tr.x - cam.x, tr.z - cam.z) < 45);
    }
    if (!this.near.length) this.spawnAcc = 0;
    this.spawnAcc += dt * Math.min(30, this.near.length * 2.5);
    while (this.spawnAcc > 1) {
      this.spawnAcc--;
      const l = this.leaf.find((o) => !o.on);
      if (!l) break;
      const tr = this.near[Math.floor(Math.random() * this.near.length)];
      if (Math.random() > tr.w) continue;
      const i = this.leaf.indexOf(l);
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 2.2;
      this.pos.set([tr.x + Math.cos(a) * r, this.groundAt(tr.x, tr.z) + 4.5 + Math.random() * 2.5, tr.z + Math.sin(a) * r], i * 3);
      const k = 0.85 + Math.random() * 0.3;
      this.col.set([tr.r * k, tr.g * k, tr.b * k], i * 3);
      Object.assign(l, { on: true, vy: 0.5 + Math.random() * 0.4, t: 0, rest: 0, dx: (Math.random() - 0.5) * 0.6, dz: (Math.random() - 0.5) * 0.6 });
    }
    for (let i = 0; i < N; i++) {
      const l = this.leaf[i];
      if (!l.on) continue;
      const p = i * 3;
      l.t += dt;
      if (l.rest > 0) {
        // lying on the sidewalk a while, then gone
        l.rest -= dt;
        if (l.rest <= 0) {
          l.on = false;
          this.pos[p + 1] = -1000;
        }
        continue;
      }
      // tumbling: side to side as it falls
      this.pos[p] += (l.dx + Math.sin(l.t * 2.6 + l.ph) * 0.7) * dt;
      this.pos[p + 2] += (l.dz + Math.cos(l.t * 2.1 + l.ph) * 0.5) * dt;
      this.pos[p + 1] -= l.vy * dt;
      const g = this.groundAt(this.pos[p], this.pos[p + 2]) + 0.03;
      if (this.pos[p + 1] <= g) {
        this.pos[p + 1] = g;
        l.rest = 6 + Math.random() * 8;
      }
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}
