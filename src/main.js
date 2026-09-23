import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutlinePass, GradeShader } from './postfx.js';
import { STYLES, STYLE_ORDER } from './styles.js';

import { CURB, D, activateDistrict } from './config.js';
import { DISTRICTS, BOROUGHS } from './districts/index.js';
import { reseed } from './random.js';
import { generateLayout, makeGroundQuery } from './layout.js';
import {
  makeFacade, makeRadial, makeBeam, makeHeadlightBeam, makeNoise, makeStripes, makeStreak, FACADE_STYLES,
} from './textures.js';
import { buildBuildings } from './buildings.js';
import { buildStreets } from './streets.js';
import { buildElevated } from './elevated.js';
import { buildSky, buildTrees, nightSky } from './surroundings.js';
import { LightKit } from './lightkit.js';
import { buildRoad } from './road.js';
import { Traffic } from './traffic.js';
import { Weather } from './weather.js';
import { Memories } from './memories.js';
import { CityAudio } from './audio.js';
import { HUD, describeLocation } from './hud.js';
import { Player } from './player.js';
import { makeCityEnvironment } from './env.js';
import { Minimap } from './minimap.js';
import './style.css';

const params = new URLSearchParams(location.search);
const store = {
  get(k, fallback) {
    try {
      return JSON.parse(localStorage.getItem(`nightwalker.${k}`)) ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(`nightwalker.${k}`, JSON.stringify(v));
    } catch {
      /* storage unavailable */
    }
  },
};

// ---------- renderer ----------
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
const pixelRatio = Math.min(devicePixelRatio, 1.5);
renderer.setPixelRatio(pixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x120f1b, 0.0062);
scene.background = new THREE.Color(0x120f1b);
scene.environment = makeCityEnvironment(renderer);
scene.environmentIntensity = 0.35;

const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.15, 9000);
scene.add(camera);
// at night the warm ground color stands in for street light bouncing up onto the el and cornices
const hemi = new THREE.HemisphereLight(0x2c3452, 0x7a4a2a, 0.65);
const sun = new THREE.DirectionalLight(0x8090c0, 0.12);
scene.add(hemi, sun);

// ---------- textures shared by every neighborhood ----------
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
const sharedTextures = new Set([shared.pool, shared.soft, shared.dot, shared.beam, shared.headlight, shared.noise, shared.stripes, shared.streak]);
for (const f of Object.values(shared.facade)) sharedTextures.add(f.map).add(f.emissiveMap);

const audio = new CityAudio();
const hud = new HUD();
const minimap = new Minimap(document.getElementById('minimap'));
const settings = {
  style: STYLES[params.get('style')] ? params.get('style') : store.get('style', 'comic'),
  rain: true,
  reflections: store.get('reflections', true),
  bloom: true,
};

// ---------- the current neighborhood ----------
let W = null;
const worldProxy = {
  groundAt: (x, z) => (W ? W.groundAt(x, z) : 0),
  collide(p, r) {
    for (const c of W.colliders) {
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
const player = new Player(camera, renderer.domElement, worldProxy, audio);
if (params.has('fly')) player.update = () => {};

const reflectSize = () => new THREE.Vector2(innerWidth * pixelRatio * 0.5, innerHeight * pixelRatio * 0.5);

function disposeTree(root) {
  root.traverse((o) => {
    o.geometry?.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      for (const v of Object.values(m)) if (v?.isTexture && !sharedTextures.has(v)) v.dispose();
      if (m.uniforms) for (const u of Object.values(m.uniforms)) if (u.value?.isTexture && !sharedTextures.has(u.value)) u.value.dispose();
      m.dispose();
    }
  });
}

function loadDistrict(id, { arrive = false } = {}) {
  const def = DISTRICTS[id] ?? DISTRICTS.astoria;
  if (W) {
    scene.remove(W.root);
    W.road.reflector.dispose();
    disposeTree(W.root);
  }
  activateDistrict(def);
  reseed(def.seed);

  const root = new THREE.Group();
  const layout = generateLayout();
  const groundAt = makeGroundQuery(layout.groundRects, CURB);
  const buildings = buildBuildings(layout, shared);
  const streets = buildStreets(layout, shared);
  const kit = new LightKit();
  const elevated = buildElevated(shared, kit);
  const landmarks = def.landmarks(layout, shared);
  const sky = buildSky(shared);
  root.add(
    buildings.group, streets.group, elevated.group, landmarks.group, kit.build(shared.pool), sky.mesh,
    buildTrees([...streets.trees, ...landmarks.trees]),
  );
  const colliders = [...layout.colliders, ...elevated.colliders, ...landmarks.colliders];

  const road = buildRoad(shared.noise, D.roadRect, reflectSize());
  road.setReflections(settings.reflections);
  root.add(road.reflector, road.plain);
  const traffic = new Traffic(shared, audio);
  const weather = new Weather(shared, groundAt, streets.steam);
  weather.setViewport(innerHeight * pixelRatio, camera.fov);
  const memories = new Memories(shared, audio, hud);
  root.add(traffic.group, weather.group, memories.group);
  scene.add(root);

  W = { def, root, layout, groundAt, colliders, buildings, streets, elevated, landmarks, sky, road, traffic, weather, memories };
  applyStyle(settings.style, { keepRain: true });
  minimap.setWorld(W);
  hud.setDistrict(`${def.name}, ${def.borough}`);
  store.set('district', def.id);
  renderMenus();

  if (arrive) {
    // step out of the station entrance
    const e = elevated.entrances[0];
    const s = def.start(D);
    player.spawn(e.x, e.z, [s.pos[0], 1.7, s.pos[1]]);
    hud.showMemory(`${def.name}, ${def.borough}`, def.blurb, 6000);
  } else {
    const s = def.start(D);
    player.spawn(s.pos[0], s.pos[1], s.look);
  }
  return W;
}

// ---------- visual styles ----------
let clockStart = 0;
function applyStyle(id, { keepRain = false } = {}) {
  const st = STYLES[id] ?? STYLES.comic;
  settings.style = id;
  store.set('style', id);
  const def = W.def;
  const fogColor = st.fog?.color ?? def.fogColor;
  scene.fog.color.set(fogColor);
  scene.fog.density = st.fog?.density ?? def.fog;
  scene.background.set(fogColor);
  hemi.color.set(st.light.hemiSky);
  hemi.groundColor.set(st.light.hemiGround);
  hemi.intensity = st.light.hemi;
  sun.color.set(st.light.sun);
  sun.intensity = st.light.sunI;
  sun.position.set(...st.light.sunDir);
  renderer.toneMappingExposure = st.exposure;
  scene.environmentIntensity = st.env ?? 0.35;
  W.sky.set(st.sky ?? nightSky(def.sky));

  [bloom.strength, bloom.radius, bloom.threshold] = st.bloom;
  outline.enabled = !!st.outline;
  if (st.outline) {
    const u = outline.material.uniforms;
    u.strength.value = st.outline.strength;
    u.width.value = st.outline.width;
    u.color.value.setRGB(...st.outline.color);
    u.threshold.value.set(...st.outline.threshold);
    u.fade.value.set(...st.outline.fade);
  }
  const g = grade.uniforms;
  const gr = st.grade;
  g.saturation.value = gr.saturation ?? 1;
  g.contrast.value = gr.contrast ?? 1;
  g.shadowTint.value.set(...(gr.shadowTint ?? [1, 1, 1]));
  g.highlightTint.value.set(...(gr.highlightTint ?? [1, 1, 1]));
  g.bands.value = gr.bands ?? 0;
  g.pixel.value = gr.pixel ?? 1;
  g.levels.value = gr.levels ?? 0;
  g.chroma.value = gr.chroma ?? 0;
  g.ink.value = gr.ink ?? 0;
  g.grain.value = gr.grain ?? 0.035;
  g.vignette.value = gr.vignette ?? 0.9;

  if (!keepRain || settings.rainStyle !== id) {
    settings.rain = st.rain;
    settings.rainStyle = id;
  }
  W.weather.setEnabled(settings.rain);
  audio.setRain(settings.rain);
  W.road.setReflections(st.reflections && settings.reflections);
  W.road.setColor(st.road);
  W.wet = st.wet;
  clockStart = st.clock;

  // per-material tweaks: brighter facades by day, dimmer light pools
  W.root.traverse((o) => {
    const m = o.material;
    if (!m || Array.isArray(m)) return;
    if (m.isMeshStandardMaterial) {
      // cel styles have no specular highlights
      m.userData.baseRough ??= m.roughness;
      m.userData.baseMetal ??= m.metalness;
      m.roughness = st.matte ? 1 : m.userData.baseRough;
      m.metalness = st.matte ? 0 : m.userData.baseMetal;
    }
    if (m.isMeshStandardMaterial && m.map && m.emissiveMap) {
      m.userData.baseColor ??= m.color.clone();
      m.userData.baseEmissive ??= m.emissiveIntensity;
      m.color.copy(m.userData.baseColor).multiplyScalar(st.albedo);
      m.emissiveIntensity = m.userData.baseEmissive * st.windows;
    } else if (m.blending === THREE.AdditiveBlending && m.map === shared.pool) {
      m.userData.baseOpacity ??= m.opacity;
      m.opacity = m.userData.baseOpacity * st.pools;
    }
  });
  renderMenus();
}

function cycleStyle() {
  const next = STYLE_ORDER[(STYLE_ORDER.indexOf(settings.style) + 1) % STYLE_ORDER.length];
  applyStyle(next);
  hud.toast(`Style: ${STYLES[next].name}, ${STYLES[next].desc}`);
}

// ---------- post-processing ----------
const target = new THREE.WebGLRenderTarget(innerWidth * pixelRatio, innerHeight * pixelRatio, { type: THREE.HalfFloatType, samples: 4 });
target.depthTexture = new THREE.DepthTexture(innerWidth * pixelRatio, innerHeight * pixelRatio);
const composer = new EffectComposer(renderer, target);
composer.addPass(new RenderPass(scene, camera));
const outline = new OutlinePass(camera);
composer.addPass(outline);
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.8, 0.55, 0.85);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const grade = new ShaderPass(GradeShader);
composer.addPass(grade);

function resize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  bloom.resolution.set(innerWidth, innerHeight);
  grade.uniforms.resolution.value.set(innerWidth * pixelRatio, innerHeight * pixelRatio);
  if (W) {
    const s = reflectSize();
    W.road.setSize(s.x, s.y);
    W.weather.setViewport(innerHeight * pixelRatio, camera.fov);
  }
}
addEventListener('resize', resize);

// ---------- menus ----------
const overlay = document.getElementById('overlay');
const travel = document.getElementById('travel');
const fade = document.getElementById('fade');
let travelOpen = false;

function placeButton(place, onPick) {
  const def = place.id ? DISTRICTS[place.id] : null;
  const b = document.createElement('button');
  b.className = 'place';
  if (!def) {
    b.disabled = true;
    b.innerHTML = `<span class="pname"></span><span class="soon">coming soon</span>`;
    b.querySelector('.pname').textContent = place.name;
    return b;
  }
  const here = W?.def.id === def.id;
  b.classList.toggle('here', here);
  b.innerHTML = `<span class="pname"></span><span class="blurb"></span>`;
  b.querySelector('.pname').textContent = here ? `${def.name}  ·  you are here` : def.name;
  b.querySelector('.blurb').textContent = def.blurb;
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    onPick(def.id);
  });
  return b;
}

function renderMenus() {
  // title screen: playable neighborhoods
  const picker = document.getElementById('picker');
  picker.replaceChildren();
  for (const b of BOROUGHS) {
    for (const p of b.places) {
      if (!p.id) continue;
      picker.append(placeButton(p, (id) => id !== W.def.id && goTo(id, false)));
    }
  }
  // title screen: visual styles
  const stylePicker = document.getElementById('styles');
  stylePicker.replaceChildren();
  for (const id of STYLE_ORDER) {
    const st = STYLES[id];
    const b = document.createElement('button');
    b.className = 'place';
    b.classList.toggle('here', id === settings.style);
    b.innerHTML = '<span class="pname"></span><span class="blurb"></span>';
    b.querySelector('.pname').textContent = st.name;
    b.querySelector('.blurb').textContent = st.desc;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      applyStyle(id);
    });
    stylePicker.append(b);
  }
  // the train map: every borough
  const map = document.getElementById('map');
  map.replaceChildren();
  for (const b of BOROUGHS) {
    const col = document.createElement('section');
    const h = document.createElement('h3');
    h.textContent = b.name;
    col.append(h);
    for (const p of b.places) col.append(placeButton(p, (id) => goTo(id, true)));
    map.append(col);
  }
}

function goTo(id, arrive) {
  const def = DISTRICTS[id];
  if (arrive) {
    closeTravel(false);
    player.controls.lock();
  }
  fade.querySelector('span').textContent = arrive ? `Taking ${W.def.el.ride} to ${def.name}…` : `${def.name}, ${def.borough}`;
  fade.classList.add('show');
  // give the fade a frame to paint before the heavy rebuild
  setTimeout(() => {
    loadDistrict(id, { arrive });
    setTimeout(() => fade.classList.remove('show'), 350);
  }, 450);
}

function openTravel() {
  travelOpen = true;
  renderMenus();
  player.controls.unlock();
  travel.classList.add('show');
}
function closeTravel(relock) {
  travelOpen = false;
  travel.classList.remove('show');
  if (relock) player.controls.lock();
}
document.getElementById('travel-close').addEventListener('click', () => closeTravel(true));

if (params.has('shot')) overlay.classList.add('gone');
document.getElementById('start').addEventListener('click', () => {
  audio.start();
  player.controls.lock();
});
document.getElementById('reset').addEventListener('click', (e) => {
  e.stopPropagation();
  W.memories.reset();
  hud.toast('Journal cleared');
});
player.controls.addEventListener('lock', () => {
  audio.start();
  overlay.classList.add('gone');
});
player.controls.addEventListener('unlock', () => {
  if (!travelOpen) overlay.classList.remove('gone');
});

addEventListener('keydown', (e) => {
  switch (e.code) {
    case 'KeyE':
      if (W.nearEntrance && player.controls.isLocked) openTravel();
      break;
    case 'KeyV':
      cycleStyle();
      break;
    case 'KeyR': {
      settings.rain = !settings.rain;
      W.weather.setEnabled(settings.rain);
      audio.setRain(settings.rain);
      hud.toast(settings.rain ? 'Rain on' : 'Rain off');
      break;
    }
    case 'KeyM':
      hud.toast(audio.toggleMute() ? 'Muted' : 'Sound on');
      break;
    case 'KeyQ':
      settings.reflections = !settings.reflections;
      W.road.setReflections(settings.reflections && STYLES[settings.style].reflections);
      store.set('reflections', settings.reflections);
      hud.toast(settings.reflections ? 'Street reflections on' : 'Street reflections off (faster)');
      break;
    case 'KeyB':
      settings.bloom = !settings.bloom;
      bloom.enabled = settings.bloom;
      hud.toast(settings.bloom ? 'Bloom on' : 'Bloom off');
      break;
    case 'KeyH':
      hud.toggle();
      break;
    case 'KeyF':
      settings.fps = !settings.fps;
      hud.setFps(0);
      break;
  }
});

// ---------- start ----------
loadDistrict(params.get('district') || store.get('district', 'astoria'));
if (params.has('cam')) {
  const [x, z, yaw = 0, pitch = 0, height = 1.68] = params.get('cam').split(',').map(Number);
  camera.position.set(x, W.groundAt(x, z) + height, z);
  camera.rotation.set(THREE.MathUtils.degToRad(pitch), THREE.MathUtils.degToRad(yaw), 0, 'YXZ');
}
resize();

// ---------- loop ----------
let t = Number(params.get('t') || 0) + 3;
for (let k = 0; k < Math.min(1200, (t - 3) * 10); k++) {
  W.elevated.update(0.1);
  W.traffic.update(k * 0.1, 0.1, player, camera);
  W.landmarks.update(k * 0.1, camera, 0.1);
}
let last = performance.now();
let frames = 0;
let fpsTime = 0;
let edgeCooldown = 0;
const camEuler = new THREE.Euler();

function frame(now) {
  // rAF can hand us a timestamp from before a long rebuild; never run time backwards
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
  last = now;
  t += dt;

  player.update(dt);
  W.buildings.update(t, dt);
  W.streets.update(t);
  W.elevated.update(dt);
  W.traffic.update(t, dt, player, camera);
  W.weather.update(dt, camera.position);
  W.memories.update(t, dt, camera.position);
  W.landmarks.update(t, camera, dt);
  W.sky.update(t, camera);
  W.road.update(t, W.weather.intensity * W.wet);

  const pos = camera.position;
  const horn = W.elevated.events.horn;
  if (horn) audio.horn(Math.max(0, 1 - horn.distanceTo(pos) / 500));
  audio.update(dt, {
    rumble: W.elevated.rumbleAt(pos),
    braking: W.elevated.events.braking,
    plane: W.landmarks.planeLevel ? W.landmarks.planeLevel(pos) : 0,
  });

  // station entrances: offer a ride
  let near = null;
  for (const e of W.elevated.entrances) if (Math.hypot(e.x - pos.x, e.z - pos.z) < 3.2) near = e;
  W.nearEntrance = near;
  hud.setPrompt(near && player.controls.isLocked ? `Press E to take ${W.def.el.ride} from ${near.name.replace(/–/g, '-')}` : '');

  edgeCooldown -= dt;
  if (player.atEdge && edgeCooldown <= 0) {
    hud.toast(`Edge of ${W.def.name}. Find a station to go further.`);
    edgeCooldown = 4;
  }

  camEuler.setFromQuaternion(camera.quaternion, 'YXZ');
  minimap.update(dt, pos, camEuler.y);
  hud.setLocation(describeLocation(pos.x, pos.z));
  hud.setClock(t + clockStart * 6);
  grade.uniforms.time.value = t;
  composer.render();

  frames++;
  fpsTime += dt;
  if (fpsTime > 0.5) {
    if (settings.fps) hud.setFps(Math.round(frames / fpsTime));
    frames = 0;
    fpsTime = 0;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.__nightwalker = { scene, camera, renderer, player, minimap, get world() { return W; }, loadDistrict, applyStyle };
