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

/**
 * Sky dome: gradient, sun glow and a cloud deck. Soft clouds glow orange from the city
 * at night; with sharp = 1 they become flat, two-tone cartoon clouds lit by the sun.
 */
export function buildSky(shared) {
  const v3 = () => ({ value: new THREE.Vector3() });
  const uniforms = {
    tNoise: { value: shared.noise },
    time: { value: 0 },
    uTop: v3(),
    uHorizon: v3(),
    uCloud: v3(),
    uShade: v3(),
    uSun: v3(),
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSharp: { value: 0 },
    uAmount: { value: 1 },
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(6000, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tNoise;
        uniform float time, uSharp, uAmount;
        uniform vec3 uTop, uHorizon, uCloud, uShade, uSun, uSunDir;
        varying vec3 vDir;
        float clouds(vec2 uv) {
          return texture2D(tNoise, uv).r * 0.65 + texture2D(tNoise, uv * 2.7).g * 0.35;
        }
        void main() {
          vec3 dir = normalize(vDir);
          float h = max(dir.y, 0.0);
          vec3 col = mix(uHorizon, uTop, pow(h, 0.4));
          float sd = max(dot(dir, normalize(uSunDir)), 0.0);
          col += uSun * (pow(sd, 6.0) * 0.45 + smoothstep(0.9985, 0.9992, sd) * 1.5);
          vec2 uv = dir.xz / (dir.y + 0.1) * 0.07 + vec2(time * 0.002, time * 0.0012);
          float n = clouds(uv);
          float lo = mix(0.42, 0.56, uSharp);
          float hi = mix(0.75, 0.585, uSharp);
          float cover = smoothstep(lo, hi, n) * smoothstep(0.0, 0.2, h) * uAmount;
          // light from the sun side: compare with a sample shifted toward the sun
          float n2 = clouds(uv + normalize(uSunDir.xz + 1e-4) * 0.025);
          float lit = clamp((n2 - n) * 10.0 + 0.55, 0.0, 1.0);
          lit = mix(lit, step(0.5, lit), uSharp);
          vec3 cc = mix(uShade, uCloud, lit);
          col = mix(col, cc, cover);
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }),
  );
  sky.renderOrder = -1;

  return {
    mesh: sky,
    /** colors: { top, horizon, cloud, shade, sun, sunDir, sharp, amount } */
    set(c) {
      uniforms.uTop.value.set(...c.top);
      uniforms.uHorizon.value.set(...c.horizon);
      uniforms.uCloud.value.set(...c.cloud);
      uniforms.uShade.value.set(...c.shade);
      uniforms.uSun.value.set(...c.sun);
      uniforms.uSunDir.value.set(...c.sunDir);
      uniforms.uSharp.value = c.sharp;
      uniforms.uAmount.value = c.amount;
    },
    update(t, camera) {
      sky.position.copy(camera.position);
      uniforms.time.value = t;
    },
  };
}

/** The night sky for a district's own colors: city glow on low clouds. */
export function nightSky(d) {
  const [r, g, b] = d.horizon;
  return {
    top: [0.008, 0.01, 0.02],
    horizon: d.horizon,
    cloud: [r + d.cloud[0], g + d.cloud[1], b + d.cloud[2]],
    shade: [r * 0.7, g * 0.7, b * 0.7],
    sun: [0, 0, 0],
    sunDir: [0, 1, 0],
    sharp: 0,
    amount: 1,
  };
}
