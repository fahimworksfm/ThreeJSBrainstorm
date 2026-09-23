import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CURB, NX, colX, rowZ, PARK_Z0, PARK_Z1, RIVER_X, EAST_LIMIT } from './config.js';
import { facadeBox } from './buildings.js';
import { LightKit } from './lightkit.js';
import { TILE_COLS, TILE_ROWS, makeNeon } from './textures.js';
import { rand, range, pick, chance } from './random.js';

const WATER_Y = -1.4;

function box(w, h, d, x, y, z) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

export function buildTrees(positions) {
  const trunkGeo = new THREE.CylinderGeometry(0.1, 0.16, 1, 5);
  trunkGeo.translate(0, 0.5, 0);
  const crownGeo = new THREE.IcosahedronGeometry(1, 1);
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x1d1612, roughness: 1 }), positions.length);
  const crowns = new THREE.InstancedMesh(
    crownGeo,
    new THREE.MeshStandardMaterial({ color: 0x1a3321, roughness: 1, flatShading: true }),
    positions.length,
  );
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const col = new THREE.Color();
  positions.forEach(([x, z, sc, y = CURB], i) => {
    const h = 3 * sc;
    m.compose(p.set(x, y, z), q.identity(), s.set(sc, h, sc));
    trunks.setMatrixAt(i, m);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * 6.28);
    m.compose(p.set(x, y + h + 1.2 * sc, z), q, s.set(2.2 * sc, 2 * sc, 2.2 * sc));
    crowns.setMatrixAt(i, m);
    crowns.setColorAt(i, col.setHSL(range(0.28, 0.38), 0.4, range(0.6, 1.1)));
  });
  const g = new THREE.Group();
  g.add(trunks, crowns);
  return g;
}

export function buildSurroundings(layout, shared, streetTrees) {
  const group = new THREE.Group();

  // ---- Astoria Park
  const pk = layout.park;
  const ground = box(pk.x1 - pk.x0, CURB, pk.z1 - pk.z0, (pk.x0 + pk.x1) / 2, CURB / 2, (pk.z0 + pk.z1) / 2);
  const gp = ground.attributes.position;
  const guv = ground.attributes.uv;
  for (let i = 0; i < gp.count; i++) guv.setXY(i, gp.getX(i) / 40, gp.getZ(i) / 40);
  group.add(
    new THREE.Mesh(ground, new THREE.MeshStandardMaterial({ color: 0x0e1a10, map: shared.noise, roughness: 1 })),
  );
  const paths = [];
  const pathXs = [];
  for (let i = 0; i < NX; i += 2) pathXs.push(colX(i));
  const crossZ = [PARK_Z1 - 60, PARK_Z1 - 125];
  for (const x of pathXs) paths.push(box(4, 0.02, PARK_Z1 - PARK_Z0, x, CURB + 0.01, (PARK_Z0 + PARK_Z1) / 2));
  for (const z of crossZ) paths.push(box(colX(NX - 1) - colX(0) + 4, 0.02, 4, (colX(0) + colX(NX - 1)) / 2, CURB + 0.01, z));
  paths.push(box(pk.x1 - pk.x0, 0.02, 4, (pk.x0 + pk.x1) / 2, CURB + 0.01, PARK_Z1 - 2));
  group.add(new THREE.Mesh(mergeGeometries(paths), new THREE.MeshStandardMaterial({ color: 0x3a3a3c, roughness: 0.7 })));

  const kit = new LightKit();
  for (const x of pathXs) {
    for (let z = PARK_Z1 - 12; z > PARK_Z0; z -= 24) kit.add(x + 2.6, z, -1, 0, { globe: true, height: 4, kind: 'warm', pool: 7 });
  }
  for (const z of crossZ) {
    for (let x = colX(0) + 12; x < colX(NX - 1); x += 26) kit.add(x, z - 2.6, 0, 1, { globe: true, height: 4, kind: 'warm', pool: 7 });
  }
  group.add(kit.build(shared.pool));

  const trees = [...streetTrees];
  for (let k = 0; k < 520; k++) {
    const x = range(RIVER_X + 4, EAST_LIMIT + 80);
    const z = range(PARK_Z0 - 120, PARK_Z1 - 7);
    if (pathXs.some((px) => Math.abs(px - x) < 4.5) || crossZ.some((cz) => Math.abs(cz - z) < 4.5)) continue;
    trees.push([x, z, range(1.1, 2.2)]);
  }
  group.add(buildTrees(trees));

  // ---- East River
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(6000, 8000),
    new THREE.MeshLambertMaterial({ color: 0x070b12 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(RIVER_X - 3000, WATER_Y, 0);
  group.add(water);

  // railing
  const rail = [];
  const pr = layout.promenade;
  for (let z = pr.z0; z < pr.z1; z += 2.5) rail.push(box(0.06, 1.1, 0.06, RIVER_X, CURB + 0.55, z));
  rail.push(box(0.08, 0.08, pr.z1 - pr.z0, RIVER_X, CURB + 1.1, (pr.z0 + pr.z1) / 2));
  rail.push(box(0.05, 0.05, pr.z1 - pr.z0, RIVER_X, CURB + 0.6, (pr.z0 + pr.z1) / 2));
  group.add(new THREE.Mesh(mergeGeometries(rail), new THREE.MeshStandardMaterial({ color: 0x202428, metalness: 0.8, roughness: 0.4 })));

  // ---- Manhattan across the water (no fog so it glows through the haze)
  const skyline = {};
  const streaks = [];
  const skyTint = new THREE.Color();
  const shoreX = RIVER_X - 480;
  for (let k = 0; k < 420; k++) {
    const z = range(-1800, 2200);
    const x = shoreX - range(0, 900);
    const midtown = Math.max(0, Math.min(1, (z - 300) / 1200)); // taller toward Midtown (south-west)
    let h = range(25, 70) + Math.pow(rand(), 2) * (60 + 220 * midtown);
    if (chance(0.03 + 0.06 * midtown)) h = range(250, 420);
    const w = range(18, 45);
    const d = range(18, 45);
    const style = h > 150 ? pick(['glass', 'office', 'deco']) : pick(['office', 'stone', 'brick', 'glass']);
    skyTint.setScalar(range(0.5, 0.9));
    (skyline[style] ??= []).push(
      facadeBox(w, h, d, x, WATER_Y, z, Math.floor(rand() * TILE_COLS) / TILE_COLS, Math.floor(rand() * TILE_ROWS) / TILE_ROWS, skyTint),
    );
    if (x > shoreX - 250 && h > 60 && chance(0.6)) {
      const L = Math.min(260, h * 0.9);
      const g = new THREE.PlaneGeometry(L, w * 0.7);
      g.rotateX(-Math.PI / 2);
      g.translate(shoreX + L / 2 + 5, WATER_Y + 0.05, z);
      streaks.push(g);
    }
  }
  for (const [style, geos] of Object.entries(skyline)) {
    const tex = shared.facade[style];
    group.add(
      new THREE.Mesh(
        mergeGeometries(geos),
        new THREE.MeshStandardMaterial({
          map: tex.map, emissiveMap: tex.emissiveMap, emissive: 0xffffff, emissiveIntensity: 1.8,
          vertexColors: true, fog: false, roughness: 0.8, color: 0x444444,
        }),
      ),
    );
  }
  if (streaks.length) {
    group.add(
      new THREE.Mesh(
        mergeGeometries(streaks),
        new THREE.MeshBasicMaterial({
          map: shared.streak, color: 0xffd6a0, transparent: true, opacity: 0.8,
          blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
        }),
      ),
    );
  }
  // Empire-style landmark far down in Midtown with a color-cycling crown
  const esb = [];
  const ex = shoreX - 1600;
  const ez = 3200;
  for (const [w, top] of [[70, 25], [55, 90], [42, 300], [30, 330], [20, 350], [12, 368]]) {
    esb.push(facadeBox(w, top, w * 0.8, ex, WATER_Y, ez, 0, 0, new THREE.Color(0.6, 0.6, 0.6)));
  }
  group.add(
    new THREE.Mesh(
      mergeGeometries(esb),
      new THREE.MeshStandardMaterial({
        map: shared.facade.deco.map, emissiveMap: shared.facade.deco.emissiveMap, emissive: 0xffffff,
        emissiveIntensity: 1.6, vertexColors: true, fog: false, color: 0x444444,
      }),
    ),
  );
  const crownMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
  const crown = new THREE.Mesh(
    mergeGeometries([box(21, 18, 17, ex, 340, ez), box(13, 20, 11, ex, 360, ez), box(4, 50, 4, ex, 393, ez)]),
    crownMat,
  );
  group.add(crown);

  // ---- bridges to the north: an arch (Hell Gate) and a suspension span (Triborough)
  const steel = [];
  const necklace = [];
  const archZ = PARK_Z0 - 60;
  const archA = RIVER_X + 30;
  const archB = RIVER_X - 330;
  const archPts = [];
  for (let k = 0; k <= 40; k++) {
    const t = k / 40;
    archPts.push(new THREE.Vector3(archA + (archB - archA) * t, 22 + Math.sin(Math.PI * t) * 55, archZ));
  }
  const archCurve = new THREE.CatmullRomCurve3(archPts);
  steel.push(new THREE.TubeGeometry(archCurve, 60, 1.6, 6, false));
  const lowerPts = archPts.map((p) => new THREE.Vector3(p.x, 22 + (p.y - 22) * 0.78, p.z));
  steel.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(lowerPts), 60, 1.0, 6, false));
  steel.push(box(Math.abs(archB - archA) + 60, 2.5, 12, (archA + archB) / 2, 22, archZ));
  for (const x of [archA + 12, archB - 12]) steel.push(box(22, 75, 18, x, 22, archZ));
  for (let k = 1; k < 20; k++) {
    const p = archCurve.getPoint(k / 20);
    steel.push(box(0.6, p.y - 22, 0.6, p.x, 22 + (p.y - 22) / 2, archZ));
  }
  const suspZ = PARK_Z0 - 260;
  const tA = RIVER_X - 120;
  const tB = RIVER_X - 700;
  const deckY = 40;
  steel.push(box(1200, 3, 26, (tA + tB) / 2 - 100, deckY, suspZ));
  for (const tx of [tA, tB]) {
    for (const s of [-1, 1]) steel.push(box(4, 105, 4, tx, 52.5, suspZ + s * 11));
    steel.push(box(4, 4, 26, tx, 102, suspZ));
    steel.push(box(4, 4, 26, tx, 60, suspZ));
  }
  for (const s of [-1, 1]) {
    const pts = [];
    for (let k = 0; k <= 60; k++) {
      const t = k / 60;
      const x = tA + (tB - tA) * t;
      const y = deckY + 6 + (104 - deckY - 6) * Math.pow(2 * t - 1, 2);
      pts.push(new THREE.Vector3(x, y, suspZ + s * 11));
      if (k % 2 === 0) {
        const bulb = new THREE.SphereGeometry(0.9, 6, 4);
        bulb.translate(x, y, suspZ + s * 11);
        necklace.push(bulb);
      }
      if (k % 3 === 0) steel.push(box(0.3, y - deckY, 0.3, x, deckY + (y - deckY) / 2, suspZ + s * 11));
    }
    steel.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.6, 5, false));
    for (let x = tB - 300; x < tA + 200; x += 25) {
      const lamp = new THREE.SphereGeometry(0.7, 6, 4);
      lamp.translate(x, deckY + 4, suspZ + s * 13);
      necklace.push(lamp);
    }
  }
  group.add(new THREE.Mesh(mergeGeometries(steel.map((g) => g.index ? g.toNonIndexed() : g).map(stripUv)), new THREE.MeshStandardMaterial({ color: 0x2a2226, roughness: 0.7, metalness: 0.5 })));
  group.add(new THREE.Mesh(mergeGeometries(necklace), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.85, 0.6).multiplyScalar(5), fog: false })));

  // ---- power plant stacks to the north-east, with blinking aviation lights
  const stacks = [];
  const beacons = [];
  for (let k = 0; k < 4; k++) {
    const x = colX(4) + k * 45;
    const z = PARK_Z0 - 420;
    const g = new THREE.CylinderGeometry(3.2, 5, 150, 16);
    g.translate(x, 75, z);
    stacks.push(g);
    for (const y of [75, 148]) {
      const b = new THREE.SphereGeometry(1.2, 8, 6);
      b.translate(x, y, z - 5);
      beacons.push(b);
    }
  }
  group.add(new THREE.Mesh(mergeGeometries(stacks), new THREE.MeshStandardMaterial({ map: shared.stripes, color: 0x555555, roughness: 0.9 })));
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff0000, fog: false });
  group.add(new THREE.Mesh(mergeGeometries(beacons), beaconMat));

  // ---- the big red rooftop-style sign by the river
  const { tex: signTex, aspect } = makeNeon('ASTORIA', '#ff3030');
  const signH = 7;
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(signH * aspect, signH),
    new THREE.MeshBasicMaterial({ map: signTex, color: new THREE.Color(3.5, 3.5, 3.5), transparent: true, depthWrite: false, side: THREE.DoubleSide }),
  );
  const signZ = rowZ(7);
  sign.position.set(RIVER_X - 8, 17, signZ);
  sign.rotation.y = Math.PI / 2;
  group.add(sign);
  const scaffold = [];
  for (let z = signZ - (signH * aspect) / 2; z <= signZ + (signH * aspect) / 2 + 0.1; z += 4) {
    scaffold.push(box(0.3, 20, 0.3, RIVER_X - 8.4, 10 + WATER_Y, z));
  }
  scaffold.push(box(0.3, 0.3, signH * aspect, RIVER_X - 8.4, 13.2, signZ));
  scaffold.push(box(0.3, 0.3, signH * aspect, RIVER_X - 8.4, 20.8, signZ));
  group.add(new THREE.Mesh(mergeGeometries(scaffold), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.7, roughness: 0.5 })));

  // ---- sky: gradient dome with a city-lit cloud deck
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(6000, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { tNoise: { value: shared.noise }, time: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tNoise;
        uniform float time;
        varying vec3 vDir;
        void main() {
          float h = max(vDir.y, 0.0);
          vec3 horizon = vec3(0.095, 0.07, 0.11);
          vec3 zenith = vec3(0.008, 0.01, 0.02);
          vec3 col = mix(horizon, zenith, pow(h, 0.45));
          vec2 uv = vDir.xz / (vDir.y + 0.08) * 0.08 + vec2(time * 0.002, time * 0.0012);
          float n = texture2D(tNoise, uv).r * 0.65 + texture2D(tNoise, uv * 2.7).g * 0.35;
          float cloud = smoothstep(0.42, 0.75, n) * smoothstep(0.0, 0.25, h);
          col += vec3(0.16, 0.09, 0.08) * cloud * (1.0 - h * 0.7);
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }),
  );
  sky.renderOrder = -1;
  group.add(sky);

  function update(t, camera) {
    sky.position.copy(camera.position);
    sky.material.uniforms.time.value = t;
    crownMat.color.setHSL((t * 0.01) % 1, 0.7, 0.55).multiplyScalar(1.6);
    beaconMat.color.setRGB(t % 2 < 0.6 ? 6 : 0.2, 0, 0);
  }

  return { group, update };
}

function stripUv(g) {
  // tubes and boxes merge cleanly once they share the same attribute set
  for (const name of Object.keys(g.attributes)) {
    if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
  }
  return g;
}
