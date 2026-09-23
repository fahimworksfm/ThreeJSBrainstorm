import * as THREE from 'three';
import { D } from './config.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { rand, range, pick } from './random.js';

const SKIN = [0x3b2519, 0x5a3a26, 0x7a4e32, 0x8d5a3b, 0xa8744f, 0xc68e64, 0xe0b08a, 0xf1c9a5];
const TOPS = [0x2b3a55, 0x7a2430, 0x2f4a36, 0x3d3d44, 0xc9a24a, 0x6a3f7a, 0xd8d2c4, 0x1c1c20, 0x9a5a2a, 0x3f6f8f, 0xb5483a, 0x556b2f];
const BOTTOMS = [0x1f2533, 0x2c3a58, 0x121216, 0x6b5a45, 0x3a3a40, 0x4a3b2f];
const HAIR = [0x14100e, 0x2a1a10, 0x3b2616, 0x6b4a2a, 0x8a8a8a, 0xb88a4a];
const VIEW = 120;

/**
 * Sidewalk crowds: each person loops around their block at their own pace, arms and legs
 * swinging. Everything is four InstancedMeshes, so a few hundred people cost four draw calls.
 */
const CAPS = [0x1b2a4a, 0xb3261e, 0x1e1e22, 0x2f4a36, 0xc9a24a, 0x6a3f7a];
const UMBRELLAS = [0x1b1b1f, 0x1b1b1f, 0xb3261e, 0x1d4f9e, 0x2f4a36, 0x6a3f7a, 0xe1a22b];

/** Head accessories, in head-bone space (meters, +y up, +z forward). */
function accessory(kind, color = 0x111111) {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 1 });
  const g = new THREE.Group();
  if (kind === 'cap') {
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.112, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), mat);
    dome.scale.set(1, 0.85, 1.08);
    dome.position.set(0, 0.11, 0);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.012, 16, 1, false, -Math.PI / 2, Math.PI), mat);
    brim.scale.set(1, 1, 1.5);
    brim.position.set(0, 0.11, 0.08);
    g.add(dome, brim);
  } else if (kind === 'beanie') {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.116, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), mat);
    b.scale.set(1, 1.1, 1.08);
    b.position.set(0, 0.1, -0.005);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.118, 0.118, 0.04, 16, 1, true), mat);
    cuff.position.set(0, 0.105, -0.005);
    cuff.scale.set(1, 1, 1.08);
    g.add(b, cuff);
  } else if (kind === 'afro') {
    const a = new THREE.Mesh(new THREE.IcosahedronGeometry(0.15, 2), mat);
    a.scale.set(1.05, 0.95, 1.05);
    a.position.set(0, 0.13, -0.03);
    g.add(a);
  } else if (kind === 'long') {
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.112, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), mat);
    top.scale.set(1.02, 0.95, 1.1);
    top.position.set(0, 0.105, -0.005);
    const back = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.2, 4, 10), mat);
    back.scale.set(1.15, 1, 0.55);
    back.position.set(0, -0.02, -0.075);
    g.add(top, back);
  } else if (kind === 'bun') {
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), mat);
    top.scale.set(1.0, 0.92, 1.08);
    top.position.set(0, 0.105, -0.005);
    const bun = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 8), mat);
    bun.position.set(0, 0.2, -0.06);
    g.add(top, bun);
  } else if (kind === 'buzz') {
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.106, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), mat);
    top.scale.set(0.99, 0.9, 1.06);
    top.position.set(0, 0.1, -0.005);
    g.add(top);
  } else if (kind === 'glasses') {
    const frame = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 });
    for (const x of [-0.035, 0.035]) {
      const lens = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.004, 6, 16), frame);
      lens.position.set(x, 0.075, 0.1);
      g.add(lens);
    }
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.005, 0.005), frame);
    bridge.position.set(0, 0.078, 0.1);
    g.add(bridge);
  } else if (kind === 'beard') {
    const beard = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 10, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.5), mat);
    beard.scale.set(1.1, 0.9, 0.9);
    beard.position.set(0, 0.045, 0.045);
    g.add(beard);
  }
  g.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  return g;
}

/** An open umbrella held just above the right shoulder (in the walker's root space). */
function makeUmbrella(color) {
  const g = new THREE.Group();
  const canopy = new THREE.Mesh(
    new THREE.ConeGeometry(0.62, 0.28, 8, 1, true),
    new THREE.MeshStandardMaterial({ color, roughness: 0.7, side: THREE.DoubleSide }),
  );
  canopy.position.set(0, 2.08, 0);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1.05, 6), new THREE.MeshStandardMaterial({ color: 0x222222 }));
  pole.position.set(0, 1.55, 0);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.008, 5, 10, Math.PI), pole.material);
  handle.position.set(0.03, 1.03, 0);
  handle.rotation.z = Math.PI;
  g.add(canopy, pole, handle);
  g.position.set(-0.18, 0, 0.12);
  g.rotation.z = 0.08;
  g.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  return g;
}

export class Pedestrians {
  /** routes (real-map mode): [{ path: closed Path around a block, busy }]. */
  constructor(routes = null) {
    this.group = new THREE.Group();
    const peds = [];
    const person = () => ({
      dir: rand() < 0.5 ? 1 : -1, speed: range(1.0, 1.7), phase: rand() * 6.28, side: 0, pause: 0,
      skin: pick(SKIN), top: pick(TOPS), bottom: pick(BOTTOMS), hair: pick(HAIR), height: range(0.9, 1.08), talk: rand() < 0.18,
    });
    for (const r of routes ?? []) {
      const n = Math.max(1, Math.round((r.path.len / (r.busy ? 9 : 45)) * range(0.7, 1.2)));
      for (let k = 0; k < n; k++) {
        peds.push({ ...person(), path: r.path, per: r.path.len, s: rand() * r.path.len, cx: r.path.cx, cz: r.path.cz, reach: r.path.radius });
      }
    }
    const inner = (b) => b.c >= 0 && b.r >= 0 && b.c <= D.NX - 2 && b.r <= D.NZ - 2 && !b.park;
    for (const b of routes ? [] : this.blocks()) {
      if (!inner(b)) continue;
      const busy = D.commercialNS.has(b.c) || D.commercialNS.has(b.c + 1) || D.commercialEW.has(b.r) || D.commercialEW.has(b.r + 1);
      const n = busy ? Math.floor(range(16, 24)) : Math.floor(range(3, 6));
      for (let k = 0; k < n; k++) {
        const inset = range(1.9, D.sidewalk - 0.7);
        const rect = { x0: b.x0 + inset, x1: b.x1 - inset, z0: b.z0 + inset, z1: b.z1 - inset };
        const per = 2 * (rect.x1 - rect.x0 + rect.z1 - rect.z0);
        peds.push({
          ...person(), rect, per, s: rand() * per,
          cx: (rect.x0 + rect.x1) / 2, cz: (rect.z0 + rect.z1) / 2, reach: Math.hypot(rect.x1 - rect.x0, rect.z1 - rect.z0) / 2,
        });
      }
    }
    this.peds = peds;
    const N = Math.max(1, peds.length);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.85 });
    // rounded bodies: capsule torso with shoulders, capsule limbs, a head with hair
    const torsoGeo = new THREE.CapsuleGeometry(0.2, 0.34, 4, 12).scale(1, 1, 0.62).translate(0, 1.2, 0);
    const headGeo = mergeGeometries([
      new THREE.SphereGeometry(0.11, 14, 10).scale(0.94, 1.12, 1).translate(0, 1.64, 0),
      new THREE.CylinderGeometry(0.05, 0.055, 0.1, 8).translate(0, 1.5, 0),
    ]);
    const hairGeo = new THREE.SphereGeometry(0.118, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55).scale(0.96, 1.05, 1.02).translate(0, 1.67, -0.01);
    const legGeo = mergeGeometries([
      new THREE.CapsuleGeometry(0.078, 0.7, 4, 8).translate(0, -0.42, 0),
      new THREE.BoxGeometry(0.12, 0.08, 0.26).translate(0, -0.84, 0.05),
    ]);
    const armGeo = new THREE.CapsuleGeometry(0.058, 0.5, 4, 8).translate(0, -0.3, 0);
    const make = (geo, count) => {
      const m = new THREE.InstancedMesh(geo, mat, count);
      m.frustumCulled = false;
      m.castShadow = true;
      this.group.add(m);
      return m;
    };
    this.torso = make(torsoGeo, N);
    this.head = make(headGeo, N);
    this.hair = make(hairGeo, N);
    this.legs = make(legGeo, N * 2);
    this.arms = make(armGeo, N * 2);
    const c = new THREE.Color();
    peds.forEach((p, i) => {
      this.torso.setColorAt(i, c.set(p.top));
      this.head.setColorAt(i, c.set(p.skin));
      this.hair.setColorAt(i, c.set(p.hair));
      for (let s = 0; s < 2; s++) {
        this.legs.setColorAt(i * 2 + s, c.set(p.bottom));
        this.arms.setColorAt(i * 2 + s, c.set(p.top));
      }
    });
    this.m = new THREE.Matrix4();
    this.limb = new THREE.Matrix4();
    this.tmp = new THREE.Matrix4();
    this.tilt = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.p = new THREE.Vector3();
    this.sc = new THREE.Vector3();
    this.zero = new THREE.Matrix4().makeScale(0, 0, 0);
    // "..." speech bubbles over a few people nearby
    const bubble = document.createElement('canvas');
    bubble.width = 128;
    bubble.height = 96;
    const ctx = bubble.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.ellipse(64, 40, 54, 32, 0, 0, Math.PI * 2);
    ctx.moveTo(44, 66);
    ctx.lineTo(34, 90);
    ctx.lineTo(62, 70);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#000';
    for (const x of [40, 64, 88]) {
      ctx.beginPath();
      ctx.arc(x, 40, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    const tex = new THREE.CanvasTexture(bubble);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.bubbles = [];
    for (let k = 0; k < 8; k++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
      sp.scale.set(0.55, 0.41, 1);
      sp.visible = false;
      this.group.add(sp);
      this.bubbles.push(sp);
    }
  }

  /**
   * Upgrade the pedestrians closest to you to full skinned humans with motion-captured
   * walks. They take over from the instanced crowd figure at the same spot.
   */
  setSkinned(templates, count = 10) {
    if (!Array.isArray(templates)) templates = [templates];
    for (const s of this.skinned ?? []) this.group.remove(s.root);
    const JACKETS = [0x2b3a55, 0x7a2430, 0x2f4a36, 0x3d3d44, 0xc9a24a, 0x6a3f7a, 0xd8d2c4, 0x9a5a2a, 0x3f6f8f, 0xb5483a];
    const PANTS = [0x1f2533, 0x2c3a58, 0x121216, 0x6b5a45, 0x3a3a40, 0x4a3b2f];
    const SHOES = [0xf1f1ee, 0x1a1a1a, 0x6b4a2a, 0x8a3a24];
    const SKINS = [0.45, 0.6, 0.75, 0.9, 1.0, 1.1];
    const HAIRS = [0x14100e, 0x2a1a10, 0x3b2616, 0x6b4a2a, 0x8a8a8a];
    this.skinned = [];
    for (let k = 0; k < count; k++) {
      const template = templates[k % templates.length];
      const root = cloneSkinned(template.root);
      const skin = SKINS[k % SKINS.length];
      root.traverse((o) => {
        if (!o.isMesh) return;
        const src = o.material;
        const m = src.clone();
        if (src.userData.outfit) {
          m.onBeforeCompile = src.onBeforeCompile;
          m.customProgramCacheKey = src.customProgramCacheKey;
          const pal = o.name.includes('Top') ? JACKETS : o.name.includes('Bottom') ? PANTS : SHOES;
          m.color.set(pal[(k * 7 + pal.length) % pal.length]).multiplyScalar(1.6);
        } else if (o.name === 'Wolf3D_Body' || o.name === 'Wolf3D_Head') {
          m.color.setScalar(skin);
        } else if (!o.isSkinnedMesh && m.color && o.parent?.isBone && o.parent.name === 'Head') {
          m.color.set(HAIRS[k % HAIRS.length]);
        }
        o.material = m;
        // the backpack only on some of them
        if (o.parent?.isBone && o.parent.name === 'Spine2') o.visible = k % 3 === 0;
      });
      root.traverse((o) => {
        if (o.isGroup && o.parent?.isBone && o.parent.name === 'Spine2') o.visible = k % 3 === 0;
      });
      // variety: build, headwear, glasses, beards
      const boneOf = (name) => {
        let b = null;
        root.traverse((o) => {
          if (!b && o.isBone && o.name.replace(/^mixamorig:?/, '') === name) b = o;
        });
        return b;
      };
      const head = boneOf('Head');
      if (template.kind !== 'michelle' && head) {
        const look = k % 5;
        const hairColor = HAIRS[(k * 3) % HAIRS.length];
        const style = ['short', 'afro', 'long', 'bun', 'buzz', 'short'][k % 6];
        // swap the stock hair for this person's style
        head.children.filter((c) => c.isMesh && !c.isSkinnedMesh).forEach((c) => (c.visible = style === 'short'));
        if (style !== 'short' && look !== 1 && look !== 2) head.add(accessory(style, hairColor));
        if (look === 1) head.add(accessory('cap', CAPS[k % CAPS.length]));
        if (look === 2) head.add(accessory('beanie', CAPS[(k + 2) % CAPS.length]));
        if (k % 4 === 3) head.add(accessory('glasses'));
        if (k % 3 === 1) head.add(accessory('beard', HAIRS[k % HAIRS.length]));
      }
      const girth = [1, 1.12, 0.92, 1.06, 0.96][k % 5];
      root.scale.set(root.scale.x * girth, root.scale.y, root.scale.z * girth);
      // an umbrella for rainy nights
      const umbrella = makeUmbrella(UMBRELLAS[k % UMBRELLAS.length]);
      umbrella.visible = false;
      root.add(umbrella);
      umbrella.scale.divide(root.scale); // keep true size whatever the body scale
      const mixer = new THREE.AnimationMixer(root);
      const walk = mixer.clipAction(template.clips.Walk);
      root.userData.baseScale = root.scale.x;
      root.userData.baseScaleVec = root.scale.clone();
      walk.play();
      walk.time = rand() * walk.getClip().duration;
      let idle = null;
      if (template.clips.Idle) {
        idle = mixer.clipAction(template.clips.Idle);
        idle.play();
        idle.time = rand() * idle.getClip().duration;
        idle.setEffectiveWeight(0);
      }
      root.visible = false;
      this.group.add(root);
      this.skinned.push({ root, mixer, walk, idle, umbrella, ped: null, rainy: k % 5 !== 4 });
    }
  }

  assignSkinned(cam) {
    const near = [];
    this.peds.forEach((p, i) => {
      if (p.hidden || !p.last) return;
      const d = Math.hypot(p.last.x - cam.x, p.last.z - cam.z);
      if (d < 38) near.push([d, i]);
    });
    near.sort((a, b) => a[0] - b[0]);
    const want = new Set(near.slice(0, this.skinned.length).map(([, i]) => i));
    // keep existing assignments where possible so nobody pops
    for (const s of this.skinned) if (s.ped !== null && !want.has(s.ped)) s.ped = null;
    const taken = new Set(this.skinned.map((s) => s.ped).filter((v) => v !== null));
    for (const i of want) {
      if (taken.has(i)) continue;
      const free = this.skinned.find((s) => s.ped === null);
      if (!free) break;
      free.ped = i;
    }
  }

  *blocks() {
    // same block math as the layout, without needing the layout object
    for (let c = D.cMin; c <= D.cMax; c++) {
      for (let r = D.rMin; r <= D.rMax; r++) {
        const park = (D.parkBlocks || []).some(([pc, pr]) => pc === c && pr === r);
        yield {
          c, r, park,
          x0: D.colX(c) + D.nsW / 2, x1: D.colX(c + 1) - D.nsW / 2,
          z0: D.rowZ(r) + D.ewW / 2, z1: D.rowZ(r + 1) - D.ewW / 2,
        };
      }
    }
  }

  /** Position and heading at distance s around the rectangle. */
  at(p, s) {
    if (p.path) return p.path.at(s, [0, 0, 0, 0]);
    const { x0, x1, z0, z1 } = p.rect;
    const w = x1 - x0;
    const h = z1 - z0;
    s = ((s % p.per) + p.per) % p.per;
    if (s < w) return [x0 + s, z0, 1, 0];
    s -= w;
    if (s < h) return [x1, z0 + s, 0, 1];
    s -= h;
    if (s < w) return [x1 - s, z1, -1, 0];
    s -= w;
    return [x0, z1 - s, 0, -1];
  }

  update(dt, cam, player, raining = false) {
    this.raining = raining;
    const { m, limb, q, p: pos, sc, zero } = this;
    const up = new THREE.Vector3(0, 1, 0);
    const px = player.pos.x;
    const pz = player.pos.z;
    const fast = player.mode !== 'walk' && Math.abs(player.speed) > 2;
    this.peds.forEach((p, i) => {
      const near = Math.abs(p.cx - cam.x) < VIEW + p.reach && Math.abs(p.cz - cam.z) < VIEW + p.reach;
      if (!near) {
        if (p.hidden) return;
        p.hidden = true;
        this.torso.setMatrixAt(i, zero);
        this.head.setMatrixAt(i, zero);
        this.hair.setMatrixAt(i, zero);
        for (let s = 0; s < 2; s++) {
          this.legs.setMatrixAt(i * 2 + s, zero);
          this.arms.setMatrixAt(i * 2 + s, zero);
        }
        return;
      }
      p.hidden = false;
      let [x, z, dx, dz] = this.at(p, p.s);
      // step aside for you, and well aside for anything with wheels
      const ddx = x - px;
      const ddz = z - pz;
      const d = Math.hypot(ddx, ddz);
      const clear = fast ? 3.5 : 1.3;
      // now and then people stop: to chat, check a phone, wait for somebody
      p.stopIn = (p.stopIn ?? range(4, 40)) - dt;
      if (p.stopIn <= 0) {
        p.pause = p.talk ? range(5, 12) : range(1.5, 6);
        p.stopIn = range(15, 60);
      }
      p.pause = Math.max(0, (p.pause ?? 0) - dt);
      p.amp = (p.amp ?? 1) + ((p.pause > 0 ? 0 : 1) - (p.amp ?? 1)) * Math.min(1, dt * 5);
      let speed = p.speed * p.amp;
      if (d < clear) {
        p.side += Math.sign(-dz * ddx + dx * ddz || 1) * dt * 3;
        speed *= 0.4;
      } else p.side *= 1 - Math.min(1, dt * 0.8);
      p.side = THREE.MathUtils.clamp(p.side, -1.2, 1.2);
      p.s += speed * p.dir * dt;
      p.phase += speed * p.dir * dt * 3.4;
      x += -dz * p.side;
      z += dx * p.side;
      const yaw = Math.atan2(dx * p.dir, dz * p.dir);
      q.setFromAxisAngle(up, yaw);
      const y = D.sidewalkY + Math.abs(Math.cos(p.phase)) * 0.03;
      m.compose(pos.set(x, y, z), q, sc.set(1, p.height, 1));
      (p.last ??= { x: 0, y: 0, z: 0 }).x = x;
      p.last.y = y;
      p.last.z = z;
      this.torso.setMatrixAt(i, m);
      this.head.setMatrixAt(i, m);
      this.hair.setMatrixAt(i, m);
      const swing = Math.sin(p.phase) * 0.5 * p.amp;
      for (let s = 0; s < 2; s++) {
        const side = s ? 1 : -1;
        limb.makeRotationX(swing * side).setPosition(side * 0.1, 0.9, 0);
        this.legs.setMatrixAt(i * 2 + s, this.tmp.multiplyMatrices(m, limb));
        limb.makeRotationX(-swing * side * 0.8).multiply(this.tilt.makeRotationZ(side * 0.08)).setPosition(side * 0.24, 1.45, 0);
        this.arms.setMatrixAt(i * 2 + s, this.tmp.multiplyMatrices(m, limb));
      }
    });
    for (const mesh of [this.torso, this.head, this.hair, this.legs, this.arms]) mesh.instanceMatrix.needsUpdate = true;
    // skinned stand-ins for the nearest pedestrians
    if (this.skinned) {
      this.assignTimer = (this.assignTimer ?? 0) - dt;
      if (this.assignTimer <= 0) {
        this.assignSkinned(cam);
        this.assignTimer = 0.5;
      }
      for (const s of this.skinned) {
        if (s.ped === null) {
          s.root.visible = false;
          continue;
        }
        const p = this.peds[s.ped];
        const i = s.ped;
        this.torso.setMatrixAt(i, zero);
        this.head.setMatrixAt(i, zero);
        this.hair.setMatrixAt(i, zero);
        for (let k = 0; k < 2; k++) {
          this.legs.setMatrixAt(i * 2 + k, zero);
          this.arms.setMatrixAt(i * 2 + k, zero);
        }
        const [, , dx, dz] = this.at(p, p.s);
        s.root.visible = true;
        s.root.position.set(p.last.x, D.sidewalkY, p.last.z);
        s.root.rotation.y = Math.atan2(dx * p.dir, dz * p.dir);
        s.root.scale.copy(s.root.userData.baseScaleVec).multiplyScalar(p.height * 0.98);
        s.umbrella.visible = this.raining && s.rainy;
        s.walk.timeScale = p.speed / 1.5;
        // standing still: blend into the idle clip
        if (s.idle) {
          s.walk.setEffectiveWeight(p.amp);
          s.idle.setEffectiveWeight(1 - p.amp);
        }
        s.mixer.update(dt);
      }
    }
    // hand out the bubbles to the nearest talkers
    let b = 0;
    for (const p of this.peds) {
      if (b >= this.bubbles.length) break;
      if (!p.talk || !p.last) continue;
      const d = Math.hypot(p.last.x - cam.x, p.last.z - cam.z);
      if (d > 26 || Math.sin(p.phase * 0.05 + p.s) < -0.2) continue;
      const sp = this.bubbles[b++];
      sp.visible = true;
      sp.position.set(p.last.x, p.last.y + 2.15 * p.height, p.last.z);
    }
    for (; b < this.bubbles.length; b++) this.bubbles[b].visible = false;
  }
}
