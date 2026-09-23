import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CURB, D } from '../config.js';
import { facadeBox } from '../buildings.js';
import { LightKit } from '../lightkit.js';
import { makeNeon } from '../textures.js';
import { range } from '../random.js';

function box(w, h, d, x, y, z) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

function marqueeTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 160;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff7e0';
  ctx.fillRect(0, 0, 1024, 160);
  ctx.fillStyle = '#1a1208';
  ctx.textAlign = 'center';
  ctx.font = 'bold 64px Georgia, "Times New Roman", serif';
  ctx.fillText('THE VALENCIA', 512, 72);
  ctx.font = 'bold 40px Georgia, "Times New Roman", serif';
  ctx.fillText('ALL ARE WELCOME  ·  SUNDAY 11 AM', 512, 132);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Rufus King Park and King Manor, the Valencia's marquee, and planes on approach to JFK. */
export function buildJamaicaLandmarks(layout, shared) {
  const group = new THREE.Group();
  const colliders = [];
  const trees = [];
  const kit = new LightKit();

  // ---- Rufus King Park with King Manor
  const pb = layout.blocks.find((b) => b.park);
  if (pb) {
    const s = D.sidewalk;
    const px0 = pb.x0 + s;
    const px1 = pb.x1 - s;
    const pz0 = pb.z0 + s;
    const pz1 = pb.z1 - s;
    const pcx = (px0 + px1) / 2;
    const pcz = (pz0 + pz1) / 2;
    const grass = box(px1 - px0, 0.02, pz1 - pz0, pcx, CURB + 0.01, pcz);
    const gp = grass.attributes.position;
    const guv = grass.attributes.uv;
    for (let i = 0; i < gp.count; i++) guv.setXY(i, gp.getX(i) / 30, gp.getZ(i) / 30);
    group.add(new THREE.Mesh(grass, new THREE.MeshStandardMaterial({ color: 0x0f1c11, map: shared.noise, roughness: 1 })));
    const paths = [
      box(3, 0.02, pz1 - pz0, pcx, CURB + 0.02, pcz),
      box(px1 - px0, 0.02, 3, pcx, CURB + 0.02, pz1 - 12),
    ];
    group.add(new THREE.Mesh(mergeGeometries(paths), new THREE.MeshStandardMaterial({ color: 0x3b3935, roughness: 0.8 })));
    // low fence around the park with gates on the paths
    const fence = [];
    for (const [a, b, z] of [[px0, pcx - 2, pz0], [pcx + 2, px1, pz0], [px0, pcx - 2, pz1], [pcx + 2, px1, pz1]]) {
      fence.push(box(b - a, 0.08, 0.08, (a + b) / 2, CURB + 1.0, z), box(b - a, 0.06, 0.06, (a + b) / 2, CURB + 0.3, z));
      for (let x = a; x <= b; x += 2.5) fence.push(box(0.1, 1.1, 0.1, x, CURB + 0.55, z));
    }
    for (const x of [px0, px1]) {
      for (const [a, b] of [[pz0, pz1 - 14], [pz1 - 10, pz1]]) {
        fence.push(box(0.08, 0.08, b - a, x, CURB + 1.0, (a + b) / 2));
        for (let z = a; z <= b; z += 2.5) fence.push(box(0.1, 1.1, 0.1, x, CURB + 0.55, z));
      }
    }
    group.add(new THREE.Mesh(mergeGeometries(fence), new THREE.MeshStandardMaterial({ color: 0x141414, metalness: 0.7, roughness: 0.5 })));

    // King Manor: a white clapboard farmhouse with a gambrel-ish roof
    const mx = pcx;
    const mz = pz0 + 22;
    const mw = 22;
    const md = 10;
    const mh = 7.8;
    const white = new THREE.Color(1.25, 1.22, 1.15);
    const house = facadeBox(mw, mh, md, mx, CURB + 0.6, mz, 0.25, 0.5, white);
    const plinth = box(mw + 0.6, 0.6, md + 0.6, mx, CURB + 0.3, mz);
    group.add(
      new THREE.Mesh(
        house,
        new THREE.MeshStandardMaterial({
          map: shared.facade.siding.map, emissiveMap: shared.facade.siding.emissiveMap, emissive: 0xffffff,
          emissiveIntensity: 1.2, vertexColors: true, roughness: 0.9,
        }),
      ),
    );
    // a square prism turned on its edge; the lower half hides inside the house
    const roof = new THREE.CylinderGeometry(1, 1, mw + 0.8, 4, 1, false, 0);
    roof.rotateZ(Math.PI / 2);
    roof.scale(1, 4.2, (md + 1.4) / 2);
    roof.translate(mx, CURB + 0.6 + mh, mz);
    const stone = [plinth];
    for (const dx of [-mw / 2 + 2, mw / 2 - 2]) stone.push(box(1.2, 5, 1.2, mx + dx, CURB + mh + 2.2, mz));
    for (let k = -2; k <= 2; k++) stone.push(box(0.35, 3.4, 0.35, mx + k * 2.4, CURB + 2.3, mz + md / 2 + 1.6));
    stone.push(box(12.5, 0.3, 2.4, mx, CURB + 4.1, mz + md / 2 + 1.3));
    group.add(new THREE.Mesh(roof, new THREE.MeshStandardMaterial({ color: 0x2b2a2c, roughness: 0.9, flatShading: true })));
    group.add(new THREE.Mesh(mergeGeometries(stone), new THREE.MeshStandardMaterial({ color: 0xd8d4cc, roughness: 0.9 })));
    colliders.push({ x0: mx - mw / 2 - 0.3, x1: mx + mw / 2 + 0.3, z0: mz - md / 2 - 0.3, z1: mz + md / 2 + 2.8 });

    for (let z = pz0 + 8; z < pz1; z += 18) kit.add(pcx + 2.2, z, -1, 0, { globe: true, height: 4, kind: 'warm', pool: 7 });
    for (let x = px0 + 8; x < px1; x += 18) kit.add(x, pz1 - 14.2, 0, 1, { globe: true, height: 4, kind: 'warm', pool: 7 });
    for (let k = 0; k < 40; k++) {
      const x = range(px0 + 2, px1 - 2);
      const z = range(pz0 + 2, pz1 - 2);
      if (Math.abs(x - pcx) < 3.5 || Math.abs(z - (pz1 - 12)) < 3.5) continue;
      if (Math.abs(x - mx) < mw / 2 + 4 && Math.abs(z - mz) < md / 2 + 6) continue;
      trees.push([x, z, range(1.2, 2)]);
    }
  }

  // ---- the Valencia: a 1929 movie palace, now a church, marquee still blazing
  const res = D.reserved?.[0];
  const bulbs = [];
  if (res) {
    const b = layout.blocks.find((bl) => bl.c === res.c && bl.r === res.r);
    const s = D.sidewalk;
    const x0 = b.x0 + s;
    const x1 = b.x1 - s;
    const faceZ = b.z1 - s; // facing Jamaica Ave
    const z0 = faceZ - res.depth;
    const cx = (x0 + x1) / 2;
    const h = 20;
    const terracotta = new THREE.Color(1.35, 0.85, 0.62);
    const shell = facadeBox(x1 - x0, h, res.depth, cx, CURB, (z0 + faceZ) / 2, 0.5, 0.25, terracotta);
    group.add(
      new THREE.Mesh(
        shell,
        new THREE.MeshStandardMaterial({
          map: shared.facade.deco.map, emissiveMap: shared.facade.deco.emissiveMap, emissive: 0xffffff,
          emissiveIntensity: 0.5, vertexColors: true, roughness: 0.8,
        }),
      ),
    );
    // ornate parapet
    const orn = [box(x1 - x0 + 0.8, 1.2, 1.2, cx, CURB + h + 0.2, faceZ - 0.3)];
    for (let x = x0 + 2; x < x1 - 1; x += 4) orn.push(box(0.8, 2.4, 0.8, x, CURB + h + 1.4, faceZ - 0.3));
    orn.push(box(8, 4, 1, cx, CURB + h + 2, faceZ - 0.3));
    group.add(new THREE.Mesh(mergeGeometries(orn), new THREE.MeshStandardMaterial({ color: 0x9a6a4a, roughness: 0.8 })));
    // warm floodlights washing up the facade
    const wash = [];
    for (let x = x0 + 4; x < x1 - 2; x += 7) {
      const g = new THREE.PlaneGeometry(7, 16);
      g.translate(x, CURB + 8, faceZ + 0.08);
      wash.push(g);
    }
    const washTex = shared.beam;
    group.add(
      new THREE.Mesh(
        mergeGeometries(wash),
        new THREE.MeshBasicMaterial({ map: washTex, color: 0xffb070, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }),
      ),
    );

    // marquee: a lit letter board under a canopy ringed with chasing bulbs
    const mw = 18;
    const my = CURB + 5.2;
    const mdp = 3.2;
    const canopy = [box(mw, 0.5, mdp, cx, my - 0.9, faceZ + mdp / 2), box(mw, 0.4, mdp, cx, my + 1.1, faceZ + mdp / 2)];
    group.add(new THREE.Mesh(mergeGeometries(canopy), new THREE.MeshStandardMaterial({ color: 0x3a1a10, roughness: 0.6, metalness: 0.4 })));
    const boardTex = marqueeTexture();
    const boardMat = new THREE.MeshBasicMaterial({ map: boardTex, color: new THREE.Color(2.2, 2.1, 1.9) });
    const front = new THREE.Mesh(new THREE.PlaneGeometry(mw - 0.4, 1.6), boardMat);
    front.position.set(cx, my + 0.1, faceZ + mdp + 0.02);
    group.add(front);
    const underGlow = new THREE.Mesh(new THREE.PlaneGeometry(mw, mdp), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.6, 1.9) }));
    underGlow.rotation.x = Math.PI / 2;
    underGlow.position.set(cx, my - 1.16, faceZ + mdp / 2);
    group.add(underGlow);
    const spill = new THREE.PlaneGeometry(26, 16);
    spill.rotateX(-Math.PI / 2);
    spill.translate(cx, CURB + 0.03, faceZ + 5);
    group.add(
      new THREE.Mesh(
        spill,
        new THREE.MeshBasicMaterial({ map: shared.pool, color: 0xffc070, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }),
      ),
    );
    for (const y of [my - 0.62, my + 0.86]) {
      for (let x = cx - mw / 2 + 0.3; x <= cx + mw / 2 - 0.2; x += 0.45) bulbs.push([x, y, faceZ + mdp + 0.1]);
      for (let z = faceZ + 0.4; z <= faceZ + mdp; z += 0.45) {
        bulbs.push([cx - mw / 2 - 0.05, y, z], [cx + mw / 2 + 0.05, y, z]);
      }
    }
    // tall vertical blade sign
    const { tex, aspect } = makeNeon('VALENCIA', '#ffcf4a', true);
    const bh = 11;
    const blade = new THREE.Mesh(
      new THREE.PlaneGeometry(bh * aspect, bh),
      new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(3, 3, 3), transparent: true, depthWrite: false, side: THREE.DoubleSide }),
    );
    blade.position.set(cx, my + 2 + bh / 2, faceZ + 1.4);
    blade.rotation.y = Math.PI / 2;
    group.add(blade);
    group.add(new THREE.Mesh(box(0.25, bh + 0.6, 2.4, cx, my + 2 + bh / 2, faceZ + 1.2), new THREE.MeshStandardMaterial({ color: 0x2a1410, roughness: 0.6 })));
  }
  const bulbMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }), Math.max(1, bulbs.length));
  const m4 = new THREE.Matrix4();
  bulbs.forEach(([x, y, z], i) => bulbMesh.setMatrixAt(i, m4.makeTranslation(x, y, z)));
  bulbMesh.count = bulbs.length;
  const bulbColor = new THREE.Color();
  if (bulbs.length) {
    for (let i = 0; i < bulbs.length; i++) bulbMesh.setColorAt(i, bulbColor.setRGB(1, 1, 1));
    group.add(bulbMesh);
  }

  // ---- planes descending toward JFK, one after another
  const planes = [];
  const planeGeo = mergeGeometries([
    new THREE.CylinderGeometry(1.9, 1.9, 38, 10).rotateX(Math.PI / 2),
    new THREE.ConeGeometry(1.9, 5, 10).rotateX(Math.PI / 2).translate(0, 0, 21.5),
    new THREE.BoxGeometry(36, 0.5, 5.5).translate(0, -0.6, 1),
    new THREE.BoxGeometry(12, 0.4, 3).translate(0, 0.5, -17),
    new THREE.BoxGeometry(0.4, 6, 4).translate(0, 3.4, -17.5),
  ]);
  const planeBody = new THREE.MeshStandardMaterial({ color: 0x3a3e44, roughness: 0.5, metalness: 0.6, fog: false });
  const lampGeo = new THREE.SphereGeometry(0.6, 6, 4);
  const glowMat = (color, size) =>
    new THREE.SpriteMaterial({ map: shared.pool, color, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true, sizeAttenuation: true, opacity: size });
  for (let k = 0; k < 2; k++) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(planeGeo, planeBody));
    const lights = [
      { pos: [-18, -0.6, 1], color: new THREE.Color(5, 0.2, 0.2), blink: false },
      { pos: [18, -0.6, 1], color: new THREE.Color(0.2, 5, 0.6), blink: false },
      { pos: [0, 2.2, -2], color: new THREE.Color(6, 0.3, 0.2), blink: 'beacon' },
      { pos: [0, -2, 0], color: new THREE.Color(6, 0.3, 0.2), blink: 'beacon' },
      { pos: [-18, -0.6, 0], color: new THREE.Color(8, 8, 8), blink: 'strobe' },
      { pos: [18, -0.6, 0], color: new THREE.Color(8, 8, 8), blink: 'strobe' },
    ];
    const blinkers = [];
    for (const l of lights) {
      const mat = new THREE.MeshBasicMaterial({ color: l.color, fog: false });
      const mesh = new THREE.Mesh(lampGeo, mat);
      mesh.position.set(...l.pos);
      g.add(mesh);
      if (l.blink) blinkers.push({ mat, base: l.color.clone(), kind: l.blink });
    }
    // landing lights: the thing you actually see from the street
    for (const x of [-3, 3]) {
      const sprite = new THREE.Sprite(glowMat(0xfff4e0, 1));
      sprite.scale.setScalar(26);
      sprite.position.set(x, -1, 12);
      g.add(sprite);
    }
    g.visible = false;
    group.add(g);
    planes.push({ g, blinkers, t: k * 50 - 20 });
  }
  const P0 = new THREE.Vector3(D.xMin - 250, 620, D.zMin - 3200);
  const P1 = new THREE.Vector3(D.xMax + 250, 40, D.zMax + 3600);
  const FLIGHT = 95; // seconds from the horizon to past the edge of town
  const dirV = new THREE.Vector3().subVectors(P1, P0).normalize();

  group.add(kit.build(shared.pool));

  function update(t, camera, dt) {
    if (bulbs.length) {
      // chase: every third bulb lit, marching along
      const step = Math.floor(t * 8);
      for (let i = 0; i < bulbs.length; i++) {
        const on = (i + step) % 3 === 0;
        bulbMesh.setColorAt(i, bulbColor.setRGB(on ? 7 : 1.4, on ? 5.6 : 1, on ? 3 : 0.6));
      }
      bulbMesh.instanceColor.needsUpdate = true;
    }
    for (const p of planes) {
      p.t += dt;
      if (p.t > FLIGHT) p.t -= FLIGHT + range(0, 20);
      p.g.visible = p.t > 0;
      if (!p.g.visible) continue;
      p.g.position.lerpVectors(P0, P1, p.t / FLIGHT);
      p.g.lookAt(p.g.position.clone().add(dirV));
      for (const b of p.blinkers) {
        const on = b.kind === 'strobe' ? (t * 1.1) % 1 < 0.06 : (t * 1.2) % 1 < 0.25;
        b.mat.color.copy(b.base).multiplyScalar(on ? 1 : 0);
      }
    }
  }

  /** How loud the nearest jet is at this spot (0..1). */
  function planeLevel(pos) {
    let best = 0;
    for (const p of planes) {
      if (!p.g.visible) continue;
      const d = p.g.position.distanceTo(pos);
      best = Math.max(best, Math.max(0, 1 - d / 1600));
    }
    return best;
  }

  return { group, update, trees, colliders, planeLevel };
}
