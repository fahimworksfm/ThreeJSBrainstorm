import * as THREE from 'three';
import { CURB } from './config.js';
import { rand, range } from './random.js';

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

/** Gradient dome with a cloud deck lit orange from below by the city. */
export function buildSky(shared, colors) {
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(6000, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        tNoise: { value: shared.noise },
        time: { value: 0 },
        uHorizon: { value: new THREE.Vector3(...colors.horizon) },
        uCloud: { value: new THREE.Vector3(...colors.cloud) },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tNoise;
        uniform float time;
        uniform vec3 uHorizon;
        uniform vec3 uCloud;
        varying vec3 vDir;
        void main() {
          float h = max(vDir.y, 0.0);
          vec3 zenith = vec3(0.008, 0.01, 0.02);
          vec3 col = mix(uHorizon, zenith, pow(h, 0.45));
          vec2 uv = vDir.xz / (vDir.y + 0.08) * 0.08 + vec2(time * 0.002, time * 0.0012);
          float n = texture2D(tNoise, uv).r * 0.65 + texture2D(tNoise, uv * 2.7).g * 0.35;
          float cloud = smoothstep(0.42, 0.75, n) * smoothstep(0.0, 0.25, h);
          col += uCloud * cloud * (1.0 - h * 0.7);
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }),
  );
  sky.renderOrder = -1;

  return {
    mesh: sky,
    update(t, camera) {
      sky.position.copy(camera.position);
      sky.material.uniforms.time.value = t;
    },
  };
}
