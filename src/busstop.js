// Bus stops for places the subway doesn't reach: a pole with the blue MTA sign, and a glass shelter.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CURB } from './config.js';

function signTexture(route) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0f4c9e';
  ctx.fillRect(0, 0, 128, 256);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 44px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('BUS', 64, 60);
  ctx.fillStyle = '#e8eef8';
  ctx.fillRect(10, 90, 108, 64);
  ctx.fillStyle = '#0f4c9e';
  ctx.font = 'bold 38px Arial, sans-serif';
  ctx.fillText(route, 64, 136, 100);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 22px Arial, sans-serif';
  ctx.fillText('STOP', 64, 200);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const all = (geos) => mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g)));

/** stops: [{ x, z, ang (facing the street), name }]. Returns the travel entrances too. */
export function buildBusStops(stops, route, kit) {
  const group = new THREE.Group();
  const steel = [];
  const glass = [];
  const signs = [];
  const colliders = [];
  const entrances = [];
  for (const s of stops) {
    const put = (g) => g.rotateY(s.ang).translate(s.x, 0, s.z);
    // sign pole at the curb
    steel.push(put(new THREE.CylinderGeometry(0.05, 0.05, 3, 6).translate(0, CURB + 1.5, 0.8)));
    signs.push(put(new THREE.PlaneGeometry(0.5, 1).translate(0, CURB + 2.5, 0.83)));
    signs.push(put(new THREE.PlaneGeometry(0.5, 1).rotateY(Math.PI).translate(0, CURB + 2.5, 0.77)));
    // shelter: a roof, glass back and sides, a bench
    steel.push(put(new THREE.BoxGeometry(3.6, 0.12, 1.5).translate(2.4, CURB + 2.5, -0.4)));
    for (const x of [0.7, 4.1]) steel.push(put(new THREE.BoxGeometry(0.08, 2.5, 0.08).translate(x, CURB + 1.25, -1.1)));
    glass.push(put(new THREE.PlaneGeometry(3.4, 2.1).translate(2.4, CURB + 1.3, -1.12)));
    for (const x of [0.66, 4.14]) glass.push(put(new THREE.PlaneGeometry(1.3, 2.1).rotateY(Math.PI / 2).translate(x, CURB + 1.3, -0.45)));
    steel.push(put(new THREE.BoxGeometry(2.6, 0.08, 0.45).translate(2.4, CURB + 0.48, -0.85)));
    const c = new THREE.Vector3(2.4, 0, -0.6).applyAxisAngle(new THREE.Vector3(0, 1, 0), s.ang);
    colliders.push({ x0: s.x + c.x - 1.3, x1: s.x + c.x + 1.3, z0: s.z + c.z - 1.3, z1: s.z + c.z + 1.3 });
    entrances.push({ x: s.x, z: s.z, name: s.name });
    const lamp = new THREE.Vector3(2.4, 0, -0.4).applyAxisAngle(new THREE.Vector3(0, 1, 0), s.ang);
    kit.add(s.x + lamp.x, s.z + lamp.z, 0, 1, { globe: true, height: 2.35, kind: 'led', pool: 3.5 });
  }
  if (!stops.length) return { group, colliders, entrances };
  group.add(new THREE.Mesh(all(steel), new THREE.MeshStandardMaterial({ color: 0x2a3036, roughness: 0.5, metalness: 0.6 })));
  group.add(new THREE.Mesh(all(glass), new THREE.MeshStandardMaterial({ color: 0x9fc4d8, transparent: true, opacity: 0.25, roughness: 0.1, side: THREE.DoubleSide, depthWrite: false })));
  const tex = signTexture(route);
  group.add(new THREE.Mesh(all(signs), new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.4 })));
  return { group, colliders, entrances };
}
