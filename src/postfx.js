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
        time: { value: 0 },
        wobble: { value: 1.2 }, // how far the pen wanders, in pixels
        boil: { value: 12 }, // redraws per second: hand-drawn lines "boil" like animation on twos
        broken: { value: 0.35 }, // how much the ink skips, like a dry brush on rough paper
        resolution: { value: new THREE.Vector2(1, 1) },
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
        uniform float time, wobble, boil, broken;
        uniform vec2 resolution;
        varying vec2 vUv;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vnoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
        }
        float inv(vec2 uv) {
          float z = texture2D(tDepth, uv).x;
          return 1.0 / max(-perspectiveDepthToViewZ(z, near, far), 1e-3);
        }
        void main() {
          vec4 base = texture2D(tDiffuse, vUv);
          // the pen: a new hand-drawn pass every 1/boil seconds, wandering a little off the true edge
          float frame = floor(time * boil);
          vec2 px = vUv * resolution;
          vec2 seed = vec2(frame * 17.0, frame * 31.0);
          vec2 jitter = (vec2(vnoise(px / 45.0 + seed), vnoise(px / 45.0 + seed + 9.1)) - 0.5) * 2.0 * wobble * texel;
          vec2 uv = vUv + jitter;
          float c = inv(uv);
          // brush weight: heavy lines up close, fine lines in the distance, swelling and thinning along the stroke
          float swell = 0.7 + 0.6 * vnoise(px / 30.0 + seed * 0.5);
          vec2 o = texel * width * swell * mix(1.7, 1.0, smoothstep(4.0, 30.0, 1.0 / c));
          float lap = inv(uv + vec2(o.x, 0.0)) + inv(uv - vec2(o.x, 0.0))
                    + inv(uv + vec2(0.0, o.y)) + inv(uv - vec2(0.0, o.y)) - 4.0 * c;
          float edge = smoothstep(threshold.x, threshold.y, abs(lap) / c);
          edge *= 1.0 - smoothstep(fade.x, fade.y, 1.0 / c);
          // dry-brush breaks in the ink
          edge *= 1.0 - broken * smoothstep(0.55, 0.8, vnoise(px / 6.0 + seed * 1.7));
          gl_FragColor = vec4(mix(base.rgb, color, edge * strength), base.a);
        }`,
    });
    this.fsQuad = new FullScreenQuad(this.material);
  }

  render(renderer, writeBuffer, readBuffer) {
    const u = this.material.uniforms;
    u.tDiffuse.value = readBuffer.texture;
    u.tDepth.value = (this.depthSource && this.depthSource()) || readBuffer.depthTexture;
    u.near.value = this.camera.near;
    u.far.value = this.camera.far;
    u.texel.value.set(1 / readBuffer.width, 1 / readBuffer.height);
    u.resolution.value.set(readBuffer.width, readBuffer.height);
    u.time.value = performance.now() / 1000;
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
    lensRain: { value: 0 },
    hatch: { value: 0 },
    printShift: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float time, saturation, contrast, bands, pixel, levels, chroma, ink, grain, vignette, speed, shadowDots, misprint, lensRain, hatch, printShift;
    uniform vec3 shadowTint, highlightTint;
    varying vec2 vUv;
    const vec3 LUMA = vec3(0.299, 0.587, 0.114);
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    float bayer4(vec2 p) {
      int i = int(mod(p.x, 4.0)) + int(mod(p.y, 4.0)) * 4;
      float m[16] = float[16](0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.);
      return m[i] / 16.0 - 0.5;
    }
    /** Raindrops on the lens: beads that sit, grow, then run down, bending the image behind them. */
    vec2 lensDrops(vec2 uv, float scale, float speed, float seed, out float wet) {
      vec2 a = uv * vec2(resolution.x / resolution.y, 1.0) * scale;
      vec2 id = floor(a);
      vec2 f = fract(a) - 0.5;
      float n = hash(id + seed);
      float t = fract(time * speed * (0.6 + n) + n * 7.0);
      // hang still for a while, then slide down and off the cell
      float slide = smoothstep(0.55, 1.0, t);
      vec2 c = vec2((hash(id + seed + 3.1) - 0.5) * 0.6, 0.3 - slide * 1.1);
      vec2 d = f - c;
      d.y *= 1.0 + slide * 0.8;
      float r = (0.1 + hash(id + seed + 7.7) * 0.12) * smoothstep(0.0, 0.2, t);
      float drop = smoothstep(r, r * 0.55, length(d)) * step(0.5, n);
      wet = drop;
      return d * drop;
    }

    void main() {
      vec2 uv = vUv;
      float lensWet = 0.0;
      if (lensRain > 0.001) {
        float w1;
        float w2;
        vec2 big = lensDrops(vUv, 5.0, 0.07, 0.0, w1);
        vec2 small = lensDrops(vUv, 13.0, 0.03, 19.0, w2);
        uv -= (big * 0.09 + small * 0.035) * lensRain;
        lensWet = max(w1, w2 * 0.7) * lensRain;
      }
      vec2 cell = gl_FragCoord.xy;
      if (pixel > 1.0) {
        vec2 px = resolution / pixel;
        uv = (floor(uv * px) + 0.5) / px;
        cell = floor(gl_FragCoord.xy / pixel);
      }
      vec3 c;
      if (printShift > 0.0) {
        // Spider-Verse print: the cyan and magenta plates slip out of register toward the frame
        // edges (where a camera would go out of focus) and more at speed
        vec2 d = uv - 0.5;
        float r2 = dot(d, d);
        vec2 off = normalize(d + 1e-5) * printShift * (0.25 + 3.0 * r2) * (1.0 + speed * 2.0);
        vec3 base = texture2D(tDiffuse, uv).rgb;
        float rr = texture2D(tDiffuse, uv + off).r;
        float bb = texture2D(tDiffuse, uv - off).b;
        c = vec3(rr, base.g, bb);
      } else if (misprint > 0.0) {
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
      if (hatch > 0.0) {
        // pen hatching in the darkest areas, cross-hatched where it's darker still
        float L = dot(c, LUMA);
        vec2 g = gl_FragCoord.xy;
        float h1 = step(0.55, fract((g.x + g.y) / 5.0));
        float h2 = step(0.55, fract((g.x - g.y) / 5.0));
        float dark1 = 1.0 - smoothstep(0.05, 0.16, L);
        float dark2 = 1.0 - smoothstep(0.02, 0.07, L);
        c *= 1.0 - hatch * (h1 * dark1 * 0.35 + h2 * dark2 * 0.35);
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
      // a drop catches a little light at its rim
      c += lensWet * 0.05;
      c += (hash(vUv * 1000.0 + fract(time) * 71.0) - 0.5) * grain;
      vec2 d = vUv - 0.5;
      c *= 1.0 - dot(d, d) * vignette;
      gl_FragColor = vec4(c, 1.0);
    }`,
};

/**
 * Sun shafts: the bright sky is smeared toward the sun on screen, so light pours between the
 * buildings and under the el at golden hour. One pass, depth-masked, half-cost on phones.
 */
export class GodRaysPass extends Pass {
  constructor(camera, samples = 40) {
    super();
    this.camera = camera;
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tDepth: { value: null },
        sun: { value: new THREE.Vector2(0.5, 0.5) },
        color: { value: new THREE.Color(1, 0.75, 0.45) },
        strength: { value: 0 },
        aspect: { value: 1 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        uniform sampler2D tDepth;
        uniform vec2 sun;
        uniform vec3 color;
        uniform float strength, aspect;
        varying vec2 vUv;
        const int N = ${samples};
        float skyLight(vec2 uv) {
          if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
          float open = step(0.99999, texture2D(tDepth, uv).x);
          vec3 c = texture2D(tDiffuse, uv).rgb;
          // only the bright part of the sky casts shafts, strongest around the sun itself
          vec2 d = (uv - sun) * vec2(aspect, 1.0);
          float halo = exp(-dot(d, d) * 9.0);
          return open * (smoothstep(0.35, 1.2, max(c.r, max(c.g, c.b))) * 0.6 + halo);
        }
        void main() {
          vec4 base = texture2D(tDiffuse, vUv);
          vec2 dstep = (sun - vUv) / float(N) * 0.85;
          vec2 uv = vUv;
          float decay = 1.0;
          float acc = 0.0;
          // start at a per-pixel offset so the banding turns into grain
          float j = fract(sin(dot(vUv, vec2(12.9898, 78.233))) * 43758.5453);
          uv += dstep * j;
          for (int i = 0; i < N; i++) {
            acc += skyLight(uv) * decay;
            decay *= 0.965;
            uv += dstep;
          }
          acc /= float(N);
          gl_FragColor = vec4(base.rgb + color * acc * strength, base.a);
        }`,
    });
    this.fsQuad = new FullScreenQuad(this.material);
    this._v = new THREE.Vector3();
  }

  /** Aim at the sun (a world-space direction); fades out when it's behind you. */
  setSun(dir, strength, color) {
    const v = this._v.copy(dir).multiplyScalar(4000).add(this.camera.position).project(this.camera);
    const u = this.material.uniforms;
    u.sun.value.set(v.x * 0.5 + 0.5, v.y * 0.5 + 0.5);
    const facing = this._v.copy(dir).dot(this.camera.getWorldDirection(new THREE.Vector3()));
    const off = Math.max(Math.abs(v.x), Math.abs(v.y));
    u.strength.value = strength * THREE.MathUtils.smoothstep(facing, 0.0, 0.35) * (1 - THREE.MathUtils.smoothstep(off, 1.2, 2.2));
    u.color.value.copy(color);
    u.aspect.value = this.camera.aspect;
    this.enabled = u.strength.value > 0.01;
  }

  render(renderer, writeBuffer, readBuffer) {
    const u = this.material.uniforms;
    u.tDiffuse.value = readBuffer.texture;
    u.tDepth.value = (this.depthSource && this.depthSource()) || readBuffer.depthTexture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.fsQuad.render(renderer);
  }
}
