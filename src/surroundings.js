import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CURB } from './config.js';
import { rand, range } from './random.js';

export function buildTrees(positions) {
  const trunkGeo = new THREE.CylinderGeometry(0.1, 0.18, 1, 6);
  trunkGeo.translate(0, 0.5, 0);
  // a clumpy crown: several leaf masses, like the trees in a comic panel
  const blobs = [[0, 0.1, 0, 1], [0.7, -0.2, 0.2, 0.72], [-0.65, -0.1, -0.25, 0.75], [0.15, 0.55, -0.45, 0.68], [-0.2, -0.35, 0.6, 0.62], [0.35, 0.4, 0.55, 0.55]];
  const crownGeo = mergeGeometries(blobs.map(([x, y, z, r]) => new THREE.IcosahedronGeometry(r, 1).translate(x, y, z)));
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
    m.compose(p.set(x, y + h + 1.0 * sc, z), q, s.set(1.9 * sc, 1.6 * sc, 1.9 * sc));
    crowns.setMatrixAt(i, m);
    crowns.setColorAt(i, col.setHSL(range(0.28, 0.38), 0.4, range(0.6, 1.1)));
  });
  crowns.userData.foliage = true;
  const g = new THREE.Group();
  g.add(trunks, crowns);
  return g;
}

const AUTUMN = [0xd9822b, 0xe3a531, 0xc4542a, 0xe8c547, 0xb86420, 0x9aa03a, 0xd06a2a];
/** Recolor tree crowns: summer greens or autumn oranges. */
export function setFoliage(crowns, kind) {
  const c = new THREE.Color();
  for (let i = 0; i < crowns.count; i++) {
    const h = (Math.sin(i * 12.9898) * 43758.5453) % 1;
    const r = Math.abs(h);
    if (kind === 'autumn') c.set(AUTUMN[Math.floor(r * AUTUMN.length)]).multiplyScalar(0.55 + r * 0.25);
    else c.setHSL(0.28 + r * 0.1, 0.4, 0.6 + r * 0.5);
    crowns.setColorAt(i, c);
  }
  crowns.instanceColor.needsUpdate = true;
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
    uStars: { value: 0 },
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
        uniform float time, uSharp, uAmount, uStars;
        uniform vec3 uTop, uHorizon, uCloud, uShade, uSun, uSunDir;
        varying vec3 vDir;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
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
          // stars between the clouds
          vec2 sp = vec2(atan(dir.z, dir.x), asin(dir.y)) * 160.0;
          float hs = hash(floor(sp));
          float star = step(0.986, hs) * smoothstep(0.32, 0.0, length(fract(sp) - 0.5)) * smoothstep(0.02, 0.25, h);
          col += vec3(0.9, 0.95, 1.0) * star * uStars * (0.6 + 0.4 * sin(time * 2.0 + hs * 40.0));
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
      uniforms.uStars.value = c.stars ?? 0;
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

/**
 * Soften fog for far-away landmarks: they sit in the haze instead of vanishing in it.
 * haze scales the fog density, maxHaze caps how washed out they can get.
 */
export function hazy(material, haze = 0.08, maxHaze = 0.8) {
  material.fog = true;
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <fog_fragment>',
      `#ifdef USE_FOG
        #ifdef FOG_EXP2
          float hazeFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth * ${haze.toFixed(4)} );
        #else
          float hazeFactor = smoothstep( fogNear, fogFar, vFogDepth );
        #endif
        gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, min( hazeFactor, ${maxHaze.toFixed(3)} ) );
      #endif`,
    );
  };
  material.customProgramCacheKey = () => `hazy${haze}${maxHaze}`;
  return material;
}

function tier(w, d, y0, y1, x, z) {
  const g = new THREE.BoxGeometry(w, y1 - y0, d);
  g.translate(x, (y0 + y1) / 2, z);
  return g;
}

/** Empire State and Chrysler silhouettes with lit crowns. */
export function buildIcons(shared, x, z, groundY = 0) {
  const group = new THREE.Group();
  const body = [];
  // Empire State: stepped tiers and a mast
  for (const [w, y0, y1] of [[70, 0, 25], [56, 25, 90], [44, 90, 300], [32, 300, 330], [22, 330, 350], [12, 350, 368]]) body.push(tier(w, w * 0.78, groundY + y0, groundY + y1, x, z));
  // Chrysler: slimmer shaft, terraced crown, needle spire
  const cx = x + 240;
  const cz = z - 160;
  for (const [w, y0, y1] of [[48, 0, 60], [38, 60, 230], [30, 230, 250]]) body.push(tier(w, w, groundY + y0, groundY + y1, cx, cz));
  const tex = shared.facade.deco;
  const mat = hazy(new THREE.MeshStandardMaterial({
    map: tex.map, emissiveMap: tex.emissiveMap, emissive: 0xffffff, emissiveIntensity: 1.5, color: 0x6d6a78,
  }));
  group.add(new THREE.Mesh(mergeGeometries(body), mat));
  const crownMat = hazy(new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.45, 1.2) }), 0.05, 0.6);
  const crown = [];
  crown.push(tier(21, 17, groundY + 332, groundY + 352, x, z), tier(13, 11, groundY + 352, groundY + 370, x, z));
  crown.push(new THREE.CylinderGeometry(1.5, 2.2, 48, 8).translate(x, groundY + 394, z));
  for (let k = 0; k < 5; k++) {
    const r = 15 - k * 2.7;
    crown.push(new THREE.CylinderGeometry(r * 0.75, r, 11, 8).translate(cx, groundY + 256 + k * 10, cz));
  }
  crown.push(new THREE.ConeGeometry(2.2, 60, 8).translate(cx, groundY + 335, cz));
  group.add(new THREE.Mesh(mergeGeometries(crown.map((g) => (g.index ? g.toNonIndexed() : g)).map(onlyPos)), crownMat));
  return { group, crownMat };
}

function onlyPos(g) {
  for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
  return g;
}

/** A band of distant Manhattan towers along a line of constant x, plus the icons. */
export function buildSkyline(shared, { x, z0, z1, depth = 700, groundY = 0 }) {
  const group = new THREE.Group();
  const byStyle = {};
  const tint = new THREE.Color();
  for (let k = 0; k < 260; k++) {
    const z = range(z0, z1);
    const bx = x - range(0, depth);
    let h = range(40, 110) + Math.pow(rand(), 2) * 220;
    if (rand() < 0.05) h = range(260, 420);
    const w = range(20, 45);
    const style = h > 160 ? (rand() < 0.5 ? 'glass' : 'office') : rand() < 0.5 ? 'stone' : 'brick';
    tint.setScalar(range(0.75, 1));
    const g = new THREE.BoxGeometry(w, h, range(20, 45));
    g.translate(bx, groundY + h / 2, z);
    const n = g.attributes.position.count;
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(tint.r), 3));
    (byStyle[style] ??= []).push(g);
  }
  for (const [style, geos] of Object.entries(byStyle)) {
    const tex = shared.facade[style];
    group.add(
      new THREE.Mesh(
        mergeGeometries(geos),
        hazy(new THREE.MeshStandardMaterial({
          map: tex.map, emissiveMap: tex.emissiveMap, emissive: 0xffffff, emissiveIntensity: 1.6, vertexColors: true, color: 0x6d6a78,
        })),
      ),
    );
  }
  const icons = buildIcons(shared, x - depth * 0.5, (z0 + z1) / 2 + 200, groundY);
  group.add(icons.group);
  return { group, crownMat: icons.crownMat };
}

/** A painted cumulus: overlapping puffs, lit tops, shaded bellies, an ink outline. */
function paintCloud(seedPuffs) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext('2d');
  const puffs = [];
  const n = seedPuffs;
  for (let k = 0; k < n; k++) {
    const t = k / (n - 1);
    const x = 70 + t * 372 + range(-20, 20);
    const r = range(40, 70) * (1 - Math.abs(t - 0.5) * 0.9);
    puffs.push([x, 185 - r * range(0.6, 1.0), r]);
  }
  for (let k = 0; k < 4; k++) puffs.push([range(160, 350), range(80, 120), range(45, 70)]);
  const drawAll = () => {
    ctx.beginPath();
    for (const [x, y, r] of puffs) {
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }
    ctx.rect(70, 150, 372, 45);
  };
  // ink outline
  ctx.lineWidth = 9;
  ctx.strokeStyle = 'rgba(40,30,45,0.55)';
  drawAll();
  ctx.stroke();
  // body: light top, shaded belly
  const g = ctx.createLinearGradient(0, 40, 0, 200);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.55, '#f4eef2');
  g.addColorStop(1, '#b9adc6');
  ctx.fillStyle = g;
  drawAll();
  ctx.fill();
  // a few drawn contour strokes inside
  ctx.strokeStyle = 'rgba(120,100,140,0.35)';
  ctx.lineWidth = 3;
  for (const [x, y, r] of puffs.slice(0, 4)) {
    ctx.beginPath();
    ctx.arc(x, y + 6, r * 0.8, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Big painted clouds on a ring far away; tinted by the time of day. */
export function buildClouds() {
  const group = new THREE.Group();
  const textures = [6, 7, 8, 5].map(paintCloud);
  const mats = [];
  for (let k = 0; k < 16; k++) {
    const mat = new THREE.SpriteMaterial({ map: textures[k % textures.length], transparent: true, depthWrite: false, fog: false });
    const s = new THREE.Sprite(mat);
    const a = (k / 16) * Math.PI * 2 + range(-0.15, 0.15);
    const d = range(2600, 3600);
    s.position.set(Math.cos(a) * d, range(380, 950), Math.sin(a) * d);
    const w = range(900, 1700);
    s.scale.set(w, w * 0.5, 1);
    s.renderOrder = -0.5;
    group.add(s);
    mats.push(mat);
  }
  return {
    group,
    set(cloud, shade, amount) {
      for (const m of mats) {
        m.color.setRGB(cloud[0] * 0.55 + shade[0] * 0.45, cloud[1] * 0.55 + shade[1] * 0.45, cloud[2] * 0.55 + shade[2] * 0.45);
        m.opacity = Math.min(1, amount * 1.2);
      }
    },
    update(camera) {
      group.position.set(camera.position.x, 0, camera.position.z);
    },
  };
}
