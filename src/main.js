import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

import { CURB, NS_W, colX, rowZ, FOG_COLOR, PARK_Z1, RIVER_X, EAST_LIMIT, SOUTH_LIMIT } from './config.js';
import { generateLayout, makeGroundQuery } from './layout.js';
import {
  makeFacade, makeRadial, makeBeam, makeHeadlightBeam, makeNoise, makeStripes, makeStreak, FACADE_STYLES,
} from './textures.js';
import { buildBuildings } from './buildings.js';
import { buildStreets } from './streets.js';
import { buildElevated } from './elevated.js';
import { buildSurroundings } from './surroundings.js';
import { buildRoad } from './road.js';
import { Traffic } from './traffic.js';
import { Weather } from './weather.js';
import { Memories } from './memories.js';
import { CityAudio } from './audio.js';
import { HUD, describeLocation } from './hud.js';
import { Player } from './player.js';
import { makeCityEnvironment } from './env.js';
import './style.css';

const params = new URLSearchParams(location.search);

// ---------- renderer ----------
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
const pixelRatio = Math.min(devicePixelRatio, 1.5);
renderer.setPixelRatio(pixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(FOG_COLOR, 0.0062);
scene.background = new THREE.Color(FOG_COLOR);
scene.environment = makeCityEnvironment(renderer);
scene.environmentIntensity = 0.35;

const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.15, 9000);
scene.add(camera);

// warm ground color = street light bouncing up onto the el, awnings and cornices
scene.add(new THREE.HemisphereLight(0x2c3452, 0x7a4a2a, 0.65));
const moon = new THREE.DirectionalLight(0x8090c0, 0.12);
moon.position.set(-1, 2, 1);
scene.add(moon);

// ---------- shared procedural textures ----------
const shared = {
  pool: makeRadial(128, 1.6),
  soft: makeRadial(64, 2.2),
  dot: makeRadial(16, 1),
  beam: makeBeam(),
  headlight: makeHeadlightBeam(),
  noise: makeNoise(256),
  stripes: makeStripes(),
  streak: makeStreak(),
  facade: Object.fromEntries(Object.keys(FACADE_STYLES).map((s) => [s, makeFacade(s)])),
};

// ---------- world ----------
const layout = generateLayout();
const groundAt = makeGroundQuery(layout.groundRects, CURB);
const audio = new CityAudio();
const hud = new HUD();

const buildings = buildBuildings(layout, shared);
const streets = buildStreets(layout, shared);
const elevated = buildElevated(shared);
const surroundings = buildSurroundings(layout, shared, streets.trees);
layout.colliders.push(...elevated.colliders);
scene.add(buildings.group, streets.group, elevated.group, surroundings.group);

const reflectSize = () => new THREE.Vector2(innerWidth * pixelRatio * 0.5, innerHeight * pixelRatio * 0.5);
const road = buildRoad(shared.noise, { x0: RIVER_X, x1: EAST_LIMIT + 800, z0: PARK_Z1 - 1, z1: SOUTH_LIMIT + 800 }, reflectSize());
scene.add(road.reflector, road.plain);

const traffic = new Traffic(shared, audio);
scene.add(traffic.group);
const weather = new Weather(shared, groundAt, streets.steam);
scene.add(weather.group);
const memories = new Memories(shared, audio, hud);
scene.add(memories.group);

const world = {
  groundAt,
  collide(p, r) {
    for (const c of layout.colliders) {
      if (p.x < c.x0 - r || p.x > c.x1 + r || p.z < c.z0 - r || p.z > c.z1 + r) continue;
      const nx = Math.max(c.x0, Math.min(c.x1, p.x));
      const nz = Math.max(c.z0, Math.min(c.z1, p.z));
      const dx = p.x - nx;
      const dz = p.z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 > r * r) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        p.x += (dx / d) * (r - d);
        p.z += (dz / d) * (r - d);
      } else {
        // inside the box: push out along the shallowest side
        const pushes = [
          [c.x0 - r - p.x, 0], [c.x1 + r - p.x, 0], [0, c.z0 - r - p.z], [0, c.z1 + r - p.z],
        ].sort((a, b) => Math.abs(a[0] + a[1]) - Math.abs(b[0] + b[1]));
        p.x += pushes[0][0];
        p.z += pushes[0][1];
      }
    }
  },
};

// start under the el on 31st St, looking north toward the 30 Av station
camera.position.set(colX(3) + NS_W / 2 + 2, CURB + 1.68, rowZ(6) + 30);
camera.lookAt(colX(3) - 1, 7, rowZ(6) - 40);
if (params.has('cam')) {
  const [x, z, yaw = 0, pitch = 0, height = 1.68] = params.get('cam').split(',').map(Number);
  camera.position.set(x, groundAt(x, z) + height, z);
  camera.rotation.set(THREE.MathUtils.degToRad(pitch), THREE.MathUtils.degToRad(yaw), 0, 'YXZ');
}
const player = new Player(camera, renderer.domElement, world, audio);
if (params.has('fly')) player.update = () => {};

// ---------- post-processing ----------
const composer = new EffectComposer(
  renderer,
  new THREE.WebGLRenderTarget(innerWidth * pixelRatio, innerHeight * pixelRatio, { type: THREE.HalfFloatType, samples: 4 }),
);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.8, 0.55, 0.85);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const grain = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, time: { value: 0 } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float time;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      c.rgb += (hash(vUv * 1000.0 + fract(time) * 71.0) - 0.5) * 0.035;
      vec2 d = vUv - 0.5;
      c.rgb *= 1.0 - dot(d, d) * 0.9;
      gl_FragColor = c;
    }`,
});
composer.addPass(grain);

function resize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  bloom.resolution.set(innerWidth, innerHeight);
  const s = reflectSize();
  road.setSize(s.x, s.y);
  weather.setViewport(innerHeight * pixelRatio, camera.fov);
}
addEventListener('resize', resize);
resize();

// ---------- menus and toggles ----------
const overlay = document.getElementById('overlay');
if (params.has('shot')) overlay.classList.add('gone');
document.getElementById('start').addEventListener('click', () => {
  audio.start();
  player.controls.lock();
});
document.getElementById('reset').addEventListener('click', (e) => {
  e.stopPropagation();
  memories.reset();
  hud.toast('Journal cleared');
});
player.controls.addEventListener('lock', () => overlay.classList.add('gone'));
player.controls.addEventListener('unlock', () => overlay.classList.remove('gone'));

let reflections = true;
let bloomOn = true;
let showFps = false;
addEventListener('keydown', (e) => {
  switch (e.code) {
    case 'KeyR': {
      const on = !weather.enabled;
      weather.setEnabled(on);
      audio.setRain(on);
      hud.toast(on ? 'Rain on' : 'Rain off');
      break;
    }
    case 'KeyM':
      hud.toast(audio.toggleMute() ? 'Muted' : 'Sound on');
      break;
    case 'KeyQ':
      reflections = !reflections;
      road.setReflections(reflections);
      hud.toast(reflections ? 'Street reflections on' : 'Street reflections off (faster)');
      break;
    case 'KeyB':
      bloomOn = !bloomOn;
      bloom.enabled = bloomOn;
      hud.toast(bloomOn ? 'Bloom on' : 'Bloom off');
      break;
    case 'KeyH':
      hud.toggle();
      break;
    case 'KeyF':
      showFps = !showFps;
      hud.setFps(0);
      break;
  }
});

// ---------- loop ----------
let t = Number(params.get('t') || 0) + 3;
let last = performance.now();
let frames = 0;
let fpsTime = 0;
// fast-forward the simulation (trains, traffic) when a start time is given
for (let k = 0; k < Math.min(1200, (t - 3) * 10); k++) {
  elevated.update(0.1);
  traffic.update(k * 0.1, 0.1, player, camera);
}

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  t += dt;

  player.update(dt);
  buildings.update(t, dt);
  streets.update(t);
  elevated.update(dt);
  traffic.update(t, dt, player, camera);
  weather.update(dt, camera.position);
  memories.update(t, dt, camera.position);
  surroundings.update(t, camera);
  road.update(t, weather.intensity);
  audio.update(dt, elevated.rumbleAt(camera.position), elevated.events.braking);

  hud.setLocation(describeLocation(camera.position.x, camera.position.z));
  hud.setClock(t);
  grain.uniforms.time.value = t;
  composer.render();

  frames++;
  fpsTime += dt;
  if (fpsTime > 0.5) {
    if (showFps) hud.setFps(Math.round(frames / fpsTime));
    frames = 0;
    fpsTime = 0;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.__nightwalker = { scene, camera, renderer, layout, player };
