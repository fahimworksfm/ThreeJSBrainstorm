import * as THREE from 'three';
import { range } from './random.js';

const RAIN_W = 70;
const RAIN_H = 34;

/** Rain streaks that follow the camera, ground splashes, and manhole steam. */
export class Weather {
  constructor(shared, groundAt, steamSources) {
    this.group = new THREE.Group();
    this.enabled = true;
    this.intensity = 1;
    this.groundAt = groundAt;

    const N = (this.N = 7000);
    this.drops = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      this.drops[i * 3] = range(-RAIN_W / 2, RAIN_W / 2);
      this.drops[i * 3 + 1] = range(0, RAIN_H);
      this.drops[i * 3 + 2] = range(-RAIN_W / 2, RAIN_W / 2);
    }
    this.rainPos = new Float32Array(N * 6);
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.rain = new THREE.LineSegments(
      rg,
      new THREE.LineBasicMaterial({ color: 0xa5b6d6, transparent: true, opacity: 0.3, depthWrite: false }),
    );
    this.rain.frustumCulled = false;
    this.group.add(this.rain);

    const S = (this.S = 500);
    this.splash = new Float32Array(S * 4); // x, y, z, life
    this.splashPos = new Float32Array(S * 3);
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(this.splashPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.splashes = new THREE.Points(
      sg,
      new THREE.PointsMaterial({
        size: 0.09, map: shared.dot, color: 0x9fb0d0, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.splashes.frustumCulled = false;
    this.group.add(this.splashes);

    // steam: per-particle size and alpha via a tiny shader
    this.emitters = steamSources;
    const PER = 36;
    const M = (this.M = steamSources.length * PER);
    this.per = PER;
    this.sp = new Float32Array(M * 3);
    this.sv = new Float32Array(M * 3);
    this.sAge = new Float32Array(M);
    this.sLife = new Float32Array(M);
    this.sSize = new Float32Array(M);
    this.sAlpha = new Float32Array(M);
    for (let k = 0; k < M; k++) {
      this.sLife[k] = range(3, 6);
      this.sAge[k] = range(0, this.sLife[k]);
      this.respawnSteam(k);
    }
    const stg = new THREE.BufferGeometry();
    stg.setAttribute('position', new THREE.BufferAttribute(this.sp, 3).setUsage(THREE.DynamicDrawUsage));
    stg.setAttribute('aSize', new THREE.BufferAttribute(this.sSize, 1).setUsage(THREE.DynamicDrawUsage));
    stg.setAttribute('aAlpha', new THREE.BufferAttribute(this.sAlpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.steamMat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        { map: { value: shared.soft }, color: { value: new THREE.Color(0.55, 0.57, 0.62) }, uScale: { value: 400 } },
      ]),
      vertexShader: /* glsl */ `
        attribute float aSize;
        attribute float aAlpha;
        uniform float uScale;
        varying float vAlpha;
        #include <fog_pars_vertex>
        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uScale / -mvPosition.z;
          gl_Position = projectionMatrix * mvPosition;
          vAlpha = aAlpha;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D map;
        uniform vec3 color;
        varying float vAlpha;
        #include <fog_pars_fragment>
        void main() {
          float a = texture2D(map, gl_PointCoord).a * vAlpha;
          gl_FragColor = vec4(color, a);
          #include <fog_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      fog: true,
    });
    this.steam = new THREE.Points(stg, this.steamMat);
    this.steam.frustumCulled = false;
    this.group.add(this.steam);
  }

  respawnSteam(k) {
    const e = this.emitters[Math.floor(k / this.per)];
    this.sp[k * 3] = e.x + range(-0.3, 0.3);
    this.sp[k * 3 + 1] = e.y;
    this.sp[k * 3 + 2] = e.z + range(-0.3, 0.3);
    this.sv[k * 3] = range(-0.15, 0.35);
    this.sv[k * 3 + 1] = range(0.7, 1.5);
    this.sv[k * 3 + 2] = range(-0.15, 0.15);
  }

  setEnabled(on) {
    this.enabled = on;
    this.rain.visible = on;
    this.splashes.visible = on;
  }

  setViewport(height, fov) {
    this.steamMat.uniforms.uScale.value = height / 2 / Math.tan(THREE.MathUtils.degToRad(fov) / 2);
  }

  update(dt, cam) {
    const target = this.enabled ? 1 : 0;
    this.intensity += (target - this.intensity) * Math.min(1, dt * 0.5);
    const cx = cam.x;
    const cz = cam.z;
    if (this.enabled) {
      const d = this.drops;
      const p = this.rainPos;
      const fall = 24 * dt;
      const wind = 1.6 * dt;
      const half = RAIN_W / 2;
      for (let i = 0; i < this.N; i++) {
        const i3 = i * 3;
        let y = d[i3 + 1] - fall;
        if (y < 0) y += RAIN_H;
        d[i3 + 1] = y;
        let rx = ((((d[i3] + wind - cx + half) % RAIN_W) + RAIN_W) % RAIN_W) - half;
        let rz = ((((d[i3 + 2] - cz + half) % RAIN_W) + RAIN_W) % RAIN_W) - half;
        d[i3] = cx + rx;
        d[i3 + 2] = cz + rz;
        const i6 = i * 6;
        p[i6] = d[i3];
        p[i6 + 1] = y;
        p[i6 + 2] = d[i3 + 2];
        p[i6 + 3] = d[i3] - 0.04;
        p[i6 + 4] = y - 0.6;
        p[i6 + 5] = d[i3 + 2];
      }
      this.rain.geometry.attributes.position.needsUpdate = true;

      const s = this.splash;
      const sp = this.splashPos;
      for (let i = 0; i < this.S; i++) {
        const i4 = i * 4;
        s[i4 + 3] -= dt;
        if (s[i4 + 3] <= 0) {
          const a = Math.random() * Math.PI * 2;
          const r = Math.sqrt(Math.random()) * 20;
          s[i4] = cx + Math.cos(a) * r;
          s[i4 + 2] = cz + Math.sin(a) * r;
          s[i4 + 1] = this.groundAt(s[i4], s[i4 + 2]) + 0.04;
          s[i4 + 3] = range(0.05, 0.25);
        }
        sp[i * 3] = s[i4];
        sp[i * 3 + 1] = s[i4 + 1] + (0.25 - s[i4 + 3]) * 0.3;
        sp[i * 3 + 2] = s[i4 + 2];
      }
      this.splashes.geometry.attributes.position.needsUpdate = true;
    }

    for (let e = 0; e < this.emitters.length; e++) {
      const em = this.emitters[e];
      const near = Math.hypot(em.x - cx, em.z - cz) < 140;
      for (let j = 0; j < this.per; j++) {
        const k = e * this.per + j;
        if (!near) {
          this.sAlpha[k] = 0;
          continue;
        }
        this.sAge[k] += dt;
        if (this.sAge[k] > this.sLife[k]) {
          this.sAge[k] = 0;
          this.sLife[k] = range(3, 6);
          this.respawnSteam(k);
        }
        const k3 = k * 3;
        this.sp[k3] += this.sv[k3] * dt;
        this.sp[k3 + 1] += this.sv[k3 + 1] * dt;
        this.sp[k3 + 2] += this.sv[k3 + 2] * dt;
        const t = this.sAge[k] / this.sLife[k];
        this.sSize[k] = 0.5 + t * 4;
        this.sAlpha[k] = Math.pow(Math.sin(Math.PI * t), 1.3) * 0.2 * em.strength;
      }
    }
    const a = this.steam.geometry.attributes;
    a.position.needsUpdate = a.aSize.needsUpdate = a.aAlpha.needsUpdate = true;
  }
}
