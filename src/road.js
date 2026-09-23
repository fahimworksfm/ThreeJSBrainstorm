import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { makeAsphalt } from './textures.js';

/**
 * Wet asphalt: a planar reflection of the whole scene, smeared vertically like
 * light on a rainy street, sharper in puddles, and stronger at grazing angles.
 */
const WetRoadShader = {
  name: 'WetRoadShader',
  uniforms: THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      color: { value: null },
      tDiffuse: { value: null },
      textureMatrix: { value: null },
      tNoise: { value: null },
      time: { value: 0 },
      wetness: { value: 1 },
      tAsphalt: { value: null },
      uUseMap: { value: 0 },
      uMeters: { value: 9 },
      uGain: { value: 1 },
    },
  ]),
  vertexShader: /* glsl */ `
    uniform mat4 textureMatrix;
    varying vec4 vUv;
    varying vec3 vWorld;
    #include <common>
    #include <fog_pars_vertex>
    void main() {
      vUv = textureMatrix * vec4(position, 1.0);
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      vWorld = worldPos.xyz;
      vec4 mvPosition = viewMatrix * worldPos;
      gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 color;
    uniform sampler2D tDiffuse;
    uniform sampler2D tNoise;
    uniform float time;
    uniform float wetness;
    uniform sampler2D tAsphalt;
    uniform float uUseMap;
    uniform float uMeters;
    uniform float uGain;
    varying vec4 vUv;
    varying vec3 vWorld;
    #include <common>
    #include <fog_pars_fragment>
    void main() {
      vec2 w = vWorld.xz;
      float big = texture2D(tNoise, w * 0.012).r;
      float grain = texture2D(tNoise, w * 0.45).b;
      float puddle = smoothstep(0.5, 0.6, big) * wetness;
      vec2 ripple = texture2D(tNoise, w * 0.9 + vec2(time * 0.07, time * 0.05)).rg - 0.5;

      vec4 uv = vUv;
      uv.x += ripple.x * mix(0.012, 0.004, puddle) * uv.w;
      float spread = mix(0.02, 0.003, puddle) * uv.w;
      vec3 refl = vec3(0.0);
      float total = 0.0;
      for (int k = 0; k < 7; k++) {
        float o = float(k) - 3.0;
        float wgt = 1.0 - abs(o) / 4.0;
        refl += texture2DProj(tDiffuse, uv + vec4(0.0, o * spread, 0.0, 0.0)).rgb * wgt;
        total += wgt;
      }
      refl /= total;

      vec3 viewDir = normalize(cameraPosition - vWorld);
      float fresnel = pow(1.0 - clamp(viewDir.y, 0.0, 1.0), 3.0);
      float amount = mix(0.12, 0.75, puddle) * mix(0.3, 1.0, fresnel) * mix(0.25, 1.0, wetness);
      // the sky is dim in a puddle; lamps and neon stay bright
      refl *= smoothstep(0.0, 1.2, max(refl.r, max(refl.g, refl.b)));
      // a hand-drawn asphalt sheet, normalized to the same average brightness as the procedural grain
      vec3 base = uUseMap > 0.5 ? texture2D(tAsphalt, w / uMeters).rgb * uGain : vec3(0.55 + 0.9 * grain);
      vec3 asphalt = color * base * (1.0 - puddle * 0.5);
      gl_FragColor = vec4(asphalt + refl * amount, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      #include <fog_fragment>
    }`,
};

/** sheet: optional hand-drawn asphalt texture (texture pack), mapped in world meters. */
export function buildRoad(noiseTex, rect, pixelSize, sheet = null) {
  const geo = new THREE.PlaneGeometry(rect.x1 - rect.x0, rect.z1 - rect.z0);
  const reflector = new Reflector(geo, {
    shader: WetRoadShader,
    color: 0x0c0d11,
    textureWidth: pixelSize.x,
    textureHeight: pixelSize.y,
    clipBias: 0.003,
    multisample: 0,
  });
  reflector.material.fog = true;
  reflector.material.uniforms.tNoise.value = noiseTex;
  reflector.rotation.x = -Math.PI / 2;
  reflector.position.set((rect.x0 + rect.x1) / 2, 0, (rect.z0 + rect.z1) / 2);

  let asphalt;
  let plainGain = 2.2; // the procedural asphalt is mid-grey
  if (sheet) {
    const u = reflector.material.uniforms;
    u.tAsphalt.value = sheet;
    u.uUseMap.value = 1;
    u.uMeters.value = sheet.userData.meters;
    u.uGain.value = Math.min(12, 1 / sheet.userData.mean);
    asphalt = sheet.clone();
    asphalt.repeat.set((rect.x1 - rect.x0) / sheet.userData.meters, (rect.z1 - rect.z0) / sheet.userData.meters);
    asphalt.needsUpdate = true;
    plainGain = Math.min(12, 1 / sheet.userData.mean);
  } else {
    asphalt = makeAsphalt();
    asphalt.repeat.set((rect.x1 - rect.x0) / 16, (rect.z1 - rect.z0) / 16);
  }
  const plain = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: asphalt, color: 0x14151a, roughness: 1 }));
  plain.rotation.copy(reflector.rotation);
  plain.position.copy(reflector.position);
  plain.visible = false;

  return {
    reflector,
    plain,
    setReflections(on) {
      reflector.visible = on;
      plain.visible = !on;
    },
    setColor(hex) {
      reflector.material.uniforms.color.value.copy(hex);
      // lift the plain road's tint to make up for the texture's own darkness
      plain.material.color.copy(hex).multiplyScalar(plainGain);
    },
    setSize(w, h) {
      reflector.getRenderTarget().setSize(w, h);
    },
    update(t, wetness) {
      reflector.material.uniforms.time.value = t;
      reflector.material.uniforms.wetness.value = wetness;
    },
  };
}
