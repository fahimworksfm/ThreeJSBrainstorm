import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CURB, D } from '../config.js';
import { LightKit } from '../lightkit.js';
import { makeNeon } from '../textures.js';
import { buildSkyline } from '../surroundings.js';

const WATER_Y = -1.4;

function box(w, h, d, x, y, z) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

function gantrySign() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 160;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#1b1b1d';
  ctx.fillRect(0, 0, 1024, 160);
  ctx.fillStyle = '#f2ece0';
  ctx.font = 'bold 120px "Arial Black", Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('LONG ISLAND', 512, 86, 980);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Gantry Plaza: the river, the old rail-barge gantries with their LONG ISLAND signs, piers, and Midtown across the water. */
export function buildLicLandmarks(layout, shared) {
  const group = new THREE.Group();
  const kit = new LightKit();
  const rx = D.riverX;

  // the East River
  const water = new THREE.Mesh(new THREE.PlaneGeometry(6000, 8000), new THREE.MeshLambertMaterial({ color: 0x0a1624 }));
  water.rotation.x = -Math.PI / 2;
  water.position.set(rx - 3000, WATER_Y, 0);
  group.add(water);

  // railing along the promenade
  const pr = layout.promenade;
  const iron = [];
  for (let z = pr.z0; z < pr.z1; z += 2.5) iron.push(box(0.06, 1.1, 0.06, rx, CURB + 0.55, z));
  iron.push(box(0.08, 0.08, pr.z1 - pr.z0, rx, CURB + 1.1, (pr.z0 + pr.z1) / 2));
  iron.push(box(0.05, 0.05, pr.z1 - pr.z0, rx, CURB + 0.6, (pr.z0 + pr.z1) / 2));

  // two gantries, standing over the water at the end of short piers
  const steel = [];
  const wood = [];
  const signs = [];
  for (const [k, zc] of [[0, D.rowZ(2)], [1, D.rowZ(2) + 34]]) {
    const gx = rx - 22 - k * 3;
    // pier deck out to the gantry
    wood.push(box(26, 0.4, 9, rx - 13, CURB - 0.2, zc));
    for (let x = rx - 25; x <= rx - 1; x += 4) for (const dz of [-4, 4]) wood.push(box(0.4, 3, 0.4, x, WATER_Y + 0.5, zc + dz));
    // four legs, an upper frame, cross bracing, the sign up top
    const H = 18;
    for (const dx of [-5, 5]) for (const dz of [-4.5, 4.5]) steel.push(box(0.7, H, 0.7, gx + dx, H / 2 + WATER_Y, zc + dz));
    for (const dz of [-4.5, 4.5]) steel.push(box(11, 0.9, 0.7, gx, H + WATER_Y, zc + dz));
    for (const dx of [-5, 5]) steel.push(box(0.7, 0.9, 9.7, gx + dx, H + WATER_Y, zc));
    for (const dz of [-4.5, 4.5]) {
      for (const [y0, dir] of [[2, 1], [9, -1]]) {
        const brace = new THREE.BoxGeometry(12.2, 0.35, 0.35);
        brace.rotateZ(dir * 0.55);
        brace.translate(gx, y0 + 3.3 + WATER_Y, zc + dz);
        steel.push(brace);
      }
    }
    steel.push(box(10, 0.6, 9, gx, 6 + WATER_Y, zc));
    const sign = new THREE.PlaneGeometry(9.5, 1.5);
    sign.rotateY(Math.PI / 2);
    sign.translate(gx + 5.4, H + WATER_Y + 1.6, zc);
    signs.push(sign);
    steel.push(box(0.3, 1.8, 9.8, gx + 5.2, H + WATER_Y + 1.6, zc));
  }
  group.add(new THREE.Mesh(mergeGeometries(iron), new THREE.MeshStandardMaterial({ color: 0x202428, roughness: 0.5 })));
  group.add(new THREE.Mesh(mergeGeometries(steel), new THREE.MeshStandardMaterial({ color: 0x2c2724, roughness: 0.8 })));
  group.add(new THREE.Mesh(mergeGeometries(wood), new THREE.MeshStandardMaterial({ color: 0x5a4432, roughness: 1 })));
  const st = gantrySign();
  group.add(new THREE.Mesh(mergeGeometries(signs), new THREE.MeshStandardMaterial({ map: st, emissiveMap: st, emissive: 0xffffff, emissiveIntensity: 0.25, side: THREE.DoubleSide })));

  // a big red script sign on a scaffold by the water, lit at night
  const { tex, aspect } = makeNeon('Hunters Point', '#ff3030');
  const sh = 6;
  const neon = new THREE.Mesh(
    new THREE.PlaneGeometry(sh * aspect, sh),
    new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(3.2, 3.2, 3.2), transparent: true, depthWrite: false, side: THREE.DoubleSide }),
  );
  const nz = D.rowZ(5);
  neon.position.set(rx - 6, 14, nz);
  neon.rotation.y = Math.PI / 2;
  neon.material.userData.neonBase = neon.material.color.clone();
  group.add(neon);
  const scaf = [];
  for (let z = nz - (sh * aspect) / 2; z <= nz + (sh * aspect) / 2 + 0.1; z += 4) scaf.push(box(0.3, 17, 0.3, rx - 6.4, 8.5 + WATER_Y, z));
  scaf.push(box(0.3, 0.3, sh * aspect, rx - 6.4, 11, nz));
  group.add(new THREE.Mesh(mergeGeometries(scaf), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6 })));

  // Midtown, straight across the river
  const skyline = buildSkyline(shared, { x: rx - 420, z0: D.zMin - 900, z1: D.zMax + 900, depth: 650, groundY: WATER_Y });
  group.add(skyline.group);

  group.add(kit.build(shared.pool));
  return { group, update() {}, trees: [], colliders: [] };
}
