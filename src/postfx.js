import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

/**
 * Ink outlines from the depth buffer. Works on reciprocal depth, which is linear across
 * any flat surface in screen space, so its Laplacian is ~0 on walls and streets and
 * spikes at silhouettes and creases: exactly where a comic artist draws a line.
 */
export class OutlinePass extends Pass {
  constructor(camera) {
    super();
    this.camera = camera;
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tDepth: { value: null },
        texel: { value: new THREE.Vector2() },
        near: { value: 0.1 },
        far: { value: 1000 },
        width: { value: 1 },
        strength: { value: 1 },
        threshold: { value: new THREE.Vector2(0.04, 0.12) },
        fade: { value: new THREE.Vector2(220, 700) },
        color: { value: new THREE.Color(0.06, 0.04, 0.08) },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        #include <packing>
        uniform sampler2D tDiffuse;
        uniform sampler2D tDepth;
        uniform vec2 texel;
        uniform float near, far, width, strength;
        uniform vec2 threshold, fade;
        uniform vec3 color;
        varying vec2 vUv;
        float inv(vec2 uv) {
          float z = texture2D(tDepth, uv).x;
          return 1.0 / max(-perspectiveDepthToViewZ(z, near, far), 1e-3);
        }
        void main() {
          vec4 base = texture2D(tDiffuse, vUv);
          float c = inv(vUv);
          // brush weight: heavy lines up close, fine lines in the distance
          vec2 o = texel * width * mix(1.7, 1.0, smoothstep(4.0, 30.0, 1.0 / c));
          float lap = inv(vUv + vec2(o.x, 0.0)) + inv(vUv - vec2(o.x, 0.0))
                    + inv(vUv + vec2(0.0, o.y)) + inv(vUv - vec2(0.0, o.y)) - 4.0 * c;
          float edge = smoothstep(threshold.x, threshold.y, abs(lap) / c);
          edge *= 1.0 - smoothstep(fade.x, fade.y, 1.0 / c);
          gl_FragColor = vec4(mix(base.rgb, color, edge * strength), base.a);
        }`,
    });
    this.fsQuad = new FullScreenQuad(this.material);
  }

  render(renderer, writeBuffer, readBuffer) {
    const u = this.material.uniforms;
    u.tDiffuse.value = readBuffer.texture;
    u.tDepth.value = this.depthSource ? this.depthSource() : readBuffer.depthTexture;
    u.near.value = this.camera.near;
    u.far.value = this.camera.far;
    u.texel.value.set(1 / readBuffer.width, 1 / readBuffer.height);
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.fsQuad.render(renderer);
  }

  dispose() {
    this.material.dispose();
    this.fsQuad.dispose();
  }
}

/** Final look: color grade, cel banding, halftone ink, PS1 pixels and dither, grain, vignette. */
export const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    resolution: { value: new THREE.Vector2(1, 1) },
    time: { value: 0 },
    saturation: { value: 1 },
    contrast: { value: 1 },
    shadowTint: { value: new THREE.Vector3(1, 1, 1) },
    highlightTint: { value: new THREE.Vector3(1, 1, 1) },
    bands: { value: 0 },
    pixel: { value: 1 },
    levels: { value: 0 },
    chroma: { value: 0 },
    ink: { value: 0 },
    grain: { value: 0.035 },
    vignette: { value: 0.9 },
    speed: { value: 0 },
    shadowDots: { value: 0 },
    misprint: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float time, saturation, contrast, bands, pixel, levels, chroma, ink, grain, vignette, speed, shadowDots, misprint;
    uniform vec3 shadowTint, highlightTint;
    varying vec2 vUv;
    const vec3 LUMA = vec3(0.299, 0.587, 0.114);
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    float bayer4(vec2 p) {
      int i = int(mod(p.x, 4.0)) + int(mod(p.y, 4.0)) * 4;
      float m[16] = float[16](0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.);
      return m[i] / 16.0 - 0.5;
    }
    void main() {
      vec2 uv = vUv;
      vec2 cell = gl_FragCoord.xy;
      if (pixel > 1.0) {
        vec2 px = resolution / pixel;
        uv = (floor(uv * px) + 0.5) / px;
        cell = floor(gl_FragCoord.xy / pixel);
      }
      vec3 c;
      if (misprint > 0.0) {
        // comic print: the color plates are slightly out of register
        c = vec3(texture2D(tDiffuse, uv + vec2(misprint, 0.0)).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - vec2(0.0, misprint)).b);
      } else if (chroma > 0.0) {
        vec2 d = (uv - 0.5) * chroma;
        c = vec3(texture2D(tDiffuse, uv + d).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - d).b);
      } else {
        c = texture2D(tDiffuse, uv).rgb;
      }
      float l = dot(c, LUMA);
      c = mix(vec3(l), c, saturation);
      c = (c - 0.5) * contrast + 0.5;
      c *= mix(shadowTint, highlightTint, smoothstep(0.05, 0.8, l));
      c = max(c, 0.0);

      if (bands > 0.0) {
        // cel shading: snap brightness to a few flat bands, keep the hue
        float L = max(dot(c, LUMA), 1e-4);
        float q = (floor(L * bands) + 0.5) / bands;
        float soft = smoothstep(0.0, 0.08, fract(L * bands)) * smoothstep(1.0, 0.92, fract(L * bands));
        c *= mix(1.0, clamp(q / L, 0.0, 3.0), 0.8 * soft + 0.2);
      }
      if (shadowDots > 0.0) {
        // halftone dots in the shadows, like a printed comic
        float L = dot(c, LUMA);
        float a = 0.26;
        vec2 q = mat2(cos(a), -sin(a), sin(a), cos(a)) * gl_FragCoord.xy / 6.0;
        float dist = length(fract(q) - 0.5);
        float r = clamp((0.42 - L) / 0.42, 0.0, 1.0) * 0.55;
        float dots = 1.0 - smoothstep(r - 0.06, r + 0.06, dist);
        c *= 1.0 - dots * shadowDots * 0.6;
      }
      if (speed > 0.001) {
        // speed lines streaking out from the center
        vec2 p = vUv - 0.5;
        p.x *= resolution.x / resolution.y;
        float ang = atan(p.y, p.x);
        float r = length(p);
        float n = hash(vec2(floor(ang * 70.0), floor(time * 14.0)));
        float line = step(0.82, n) * smoothstep(0.28, 0.75, r) * speed;
        c = mix(c, vec3(1.0, 0.98, 0.94), line * 0.55);
      }
      if (levels > 0.0) {
        c += bayer4(cell) / levels;
        c = floor(c * levels + 0.5) / levels;
      }
      if (ink > 0.0) {
        float L = dot(c, LUMA);
        float a = 0.785;
        vec2 q = mat2(cos(a), -sin(a), sin(a), cos(a)) * gl_FragCoord.xy / 5.0;
        float dist = length(fract(q) - 0.5);
        float r = sqrt(clamp(1.0 - L, 0.0, 1.0)) * 0.62;
        float dotInk = 1.0 - smoothstep(r - 0.07, r + 0.07, dist);
        float v = L > 0.7 ? 1.0 : (L < 0.09 ? 0.0 : 1.0 - dotInk);
        c = mix(c, mix(vec3(0.05, 0.05, 0.06), vec3(0.96, 0.95, 0.92), v), ink);
      }
      c += (hash(vUv * 1000.0 + fract(time) * 71.0) - 0.5) * grain;
      vec2 d = vUv - 0.5;
      c *= 1.0 - dot(d, d) * vignette;
      gl_FragColor = vec4(c, 1.0);
    }`,
};
