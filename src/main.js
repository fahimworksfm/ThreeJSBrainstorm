import * as THREE from 'three';
import './toon.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutlinePass, GradeShader } from './postfx.js';
import { N8AOPass } from 'n8ao';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { INK, lookAt, nightness, START_TIMES } from './look.js';

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
import { buildSky, buildTrees, setFoliage, buildClouds } from './surroundings.js';
import { Pedestrians } from './peds.js';
import { LightKit } from './lightkit.js';
import { buildRoad } from './road.js';
import { Traffic } from './traffic.js';
import { Weather } from './weather.js';
import { Memories } from './memories.js';
import { CityAudio } from './audio.js';
import { HUD, describeLocation } from './hud.js';
import { Player, MODES, MODE_ORDER } from './player.js';
import { Input, IS_TOUCH } from './input.js';
import { ColliderGrid } from './collide.js';
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

// ---------- quality ----------
// Phones get a lighter setup; everyone gets dynamic resolution that follows the frame rate.
const LOW = IS_TOUCH || params.get('quality') === 'low';
const quality = {
  maxRatio: LOW ? Math.min(devicePixelRatio, 1.25) : Math.min(devicePixelRatio, 1.5),
  scale: 1, // dynamic resolution multiplier, 0.5..1
  samples: LOW ? 0 : 4,
  rain: LOW ? 2500 : 7000,
};
const pixelRatioNow = () => quality.maxRatio * quality.scale;

// ---------- renderer ----------
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
let pixelRatio = pixelRatioNow();
renderer.setPixelRatio(pixelRatio);
renderer.setSize(innerWidth, innerHeight);
// neutral tone mapping keeps the illustration's hues saturated (ACES washes them out)
renderer.toneMapping = THREE.NeutralToneMapping;
// sun shadows (desktop): a shadow box that follows you, refreshed every other frame
renderer.shadowMap.enabled = !LOW;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false;
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
scene.add(hemi, sun, sun.target);
// a soft fill that follows the hero at night, so he never turns into a silhouette
const heroLight = new THREE.PointLight(0xb8c8ff, 0, 9, 1.6);
scene.add(heroLight);
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -75, right: 75, top: 75, bottom: -75, near: 1, far: 600 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.05;
const sunDir = new THREE.Vector3(-1, 2, 1).normalize();

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
  startAt: START_TIMES[params.get('time')] ? params.get('time') : store.get('startAt', 'golden'),
  rainOverride: null, // R forces rain on or off; otherwise it rains on some nights
  rain: true,
  reflections: store.get('reflections', !LOW),
  bloom: true,
};

// ---------- the current neighborhood ----------
let W = null;
const worldProxy = {
  groundAt: (x, z) => (W ? W.groundAt(x, z) : 0),
  collide: (p, r) => (W ? W.grid.collide(p, r) : false),
  inside: (x, z, pad) => (W ? W.grid.inside(x, z, pad) : false),
  roofAt: (x, z, pad) => {
    if (!W) return null;
    for (const r of W.roofs.near(x, z, pad)) if (x >= r.x0 - pad && x <= r.x1 + pad && z >= r.z0 - pad && z <= r.z1 + pad) return r;
    return null;
  },
};
const input = new Input(renderer.domElement);
const player = new Player(camera, scene, worldProxy, audio, input, shared);
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
  const clouds = buildClouds();
  root.add(
    buildings.group, streets.group, elevated.group, landmarks.group, kit.build(shared.pool), sky.mesh, clouds.group,
    buildTrees([...streets.trees, ...landmarks.trees]),
  );

  const road = buildRoad(shared.noise, D.roadRect, reflectSize());
  road.setReflections(settings.reflections);
  root.add(road.reflector, road.plain);
  const traffic = new Traffic(shared, audio);
  // parked cars are solid too
  const parked = traffic.parked.map((c) => ({ x0: c.x - 1, x1: c.x + 1, z0: c.z - 2.35, z1: c.z + 2.35 }));
  // walkable roofs: flat-topped buildings, standing on the parapet lip
  const roofs = new ColliderGrid(
    layout.lots.filter((l) => l.kind !== 'house' && !l.outer).map((l) => ({ x0: l.x0, x1: l.x1, z0: l.z0, z1: l.z1, top: CURB + l.h + 0.225 })),
  );
  const grid = new ColliderGrid([...layout.colliders, ...elevated.colliders, ...landmarks.colliders, ...streets.colliders, ...parked]);
  const weather = new Weather(shared, groundAt, streets.steam, quality.rain);
  weather.setViewport(innerHeight * pixelRatio, camera.fov);
  const memories = new Memories(shared, audio, hud);
  const peds = new Pedestrians();
  root.add(traffic.group, weather.group, memories.group, peds.group);
  // opaque things cast and catch sun shadows
  root.traverse((o) => {
    if (!o.isMesh || o.material.transparent || o.material.isShaderMaterial) return;
    o.castShadow = true;
    o.receiveShadow = !o.material.isMeshBasicMaterial;
  });
  scene.add(root);

  W = { def, root, layout, groundAt, grid, roofs, peds, clouds, buildings, streets, elevated, landmarks, sky, road, traffic, weather, memories };
  applyTime(true);
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
  hud.setRide(MODES.walk.name, 'walk');
  if (player.hero) peds.setSkinned(player.hero, LOW ? 6 : 12);
  else player.onHero = (hero) => W.peds.setSkinned(hero, LOW ? 6 : 12);
  return W;
}

// ---------- the look: one inked comic style, lit by the time of day ----------
const MINUTES_PER_SECOND = 0.5; // a full day takes 48 real minutes
let minute = START_TIMES[settings.startAt].minute;
let materialTimer = 0;
let rainyNight = Math.random() < 0.5;
let wasNight = false;
const tmpColor = new THREE.Color();

function applyInk() {
  const u = outline.material.uniforms;
  u.strength.value = INK.outline.strength;
  u.width.value = INK.outline.width;
  u.color.value.setRGB(...INK.outline.color);
  u.threshold.value.set(...INK.outline.threshold);
  u.fade.value.set(...INK.outline.fade);
  const g = grade.uniforms;
  g.bands.value = INK.bands;
  g.shadowDots.value = INK.shadowDots;
  g.misprint.value = 0;
  g.chroma.value = 0;
  g.ink.value = 0;
  g.pixel.value = 1;
  g.levels.value = 0;
  g.grain.value = 0.01;
  g.vignette.value = 0.3;
  scene.environmentIntensity = INK.env;
}

function applyTime(force = false) {
  const L = lookAt(minute);
  const [fr, fg, fb, density] = L.fog;
  scene.fog.color.setRGB(fr, fg, fb);
  scene.fog.density = density;
  scene.background.setRGB(fr, fg, fb);
  hemi.color.setRGB(...L.hemiSky);
  hemi.groundColor.setRGB(...L.hemiGround);
  hemi.intensity = L.hemi;
  sun.color.setRGB(...L.sun);
  sun.intensity = L.sunI;
  sunDir.set(...L.sunDir).normalize();
  const castNow = renderer.shadowMap.enabled && L.sunI > 0.7;
  if (castNow !== sun.castShadow) {
    sun.castShadow = castNow;
    renderer.shadowMap.needsUpdate = true;
  }
  renderer.toneMappingExposure = L.exposure;
  [bloom.strength, bloom.radius, bloom.threshold] = L.bloom;
  const g = grade.uniforms;
  g.saturation.value = L.saturation;
  g.contrast.value = L.contrast;
  g.shadowTint.value.set(...L.shadowTint);
  g.highlightTint.value.set(...L.highlightTint);
  heroLight.intensity = nightness(minute) * 5;
  W.sky.set({ ...L.sky, amount: L.sky.amount * 0.45 });
  W.clouds.set(L.sky.cloud, L.sky.shade, L.sky.amount);
  W.road.setColor(tmpColor.setRGB(...L.road));

  // weather: some nights it rains
  const night = nightness(minute) > 0.75;
  if (night && !wasNight) rainyNight = Math.random() < 0.5;
  wasNight = night;
  const rain = settings.rainOverride ?? (night && rainyNight);
  if (rain !== settings.rain || force) {
    settings.rain = rain;
    W.weather.setEnabled(rain);
    audio.setRain(rain);
    W.road.setReflections(rain && settings.reflections);
  }
  W.wet = rain ? 1 : 0.05;

  materialTimer -= 1;
  if (force || materialTimer <= 0) {
    materialTimer = 30; // every ~half second is plenty for slow light changes
    updateMaterials(L, force);
  }
}

/** Facades brighter by day, windows and neon brighter by night, no specular anywhere. */
function updateMaterials(L, first) {
  W.root.traverse((o) => {
    if (first && o.userData.foliage) setFoliage(o, W.def.foliage ?? 'autumn');
    const m = o.material;
    if (!m || Array.isArray(m)) return;
    if (first && m.isMeshStandardMaterial) {
      m.roughness = 1; // no glints in a drawing
      m.metalness = 0;
    }
    if (m.isMeshStandardMaterial && m.map && m.emissiveMap) {
      m.userData.baseColor ??= m.color.clone();
      m.userData.baseEmissive ??= m.emissiveIntensity;
      m.color.copy(m.userData.baseColor).multiplyScalar(m.userData.storefront ? Math.min(L.albedo, 1.1) : L.albedo);
      m.emissiveIntensity = m.userData.baseEmissive * (m.userData.storefront ? 0.5 + L.windows * 0.6 : L.windows);
    } else if (m.blending === THREE.AdditiveBlending && m.map === shared.pool) {
      m.userData.baseOpacity ??= m.opacity;
      m.opacity = m.userData.baseOpacity * L.pools;
    } else if (m.userData.billboard) {
      m.emissiveIntensity = 0.12 + L.windows * 0.75;
    } else if (m.userData.neonBase) {
      m.userData.neonScale = L.neon;
      if (!m.userData.flicker) m.color.copy(m.userData.neonBase).multiplyScalar(L.neon);
    }
  });
}

// ---------- post-processing ----------
const target = new THREE.WebGLRenderTarget(innerWidth * pixelRatio, innerHeight * pixelRatio, { type: THREE.HalfFloatType, samples: quality.samples });
target.depthTexture = new THREE.DepthTexture(innerWidth * pixelRatio, innerHeight * pixelRatio);
const composer = new EffectComposer(renderer, target);
// desktop: N8AO renders the scene and adds soft contact shadows; phones use a plain render pass
let ao = null;
if (!LOW) {
  ao = new N8AOPass(scene, camera, innerWidth, innerHeight);
  Object.assign(ao.configuration, {
    aoRadius: 3.2, distanceFalloff: 1.2, intensity: 2.6, aoSamples: 12, denoiseSamples: 6, denoiseRadius: 10,
    halfRes: true, depthAwareUpsampling: true, gammaCorrection: false, color: new THREE.Color(0.12, 0.06, 0.1),
  });
  composer.addPass(ao);
} else {
  composer.addPass(new RenderPass(scene, camera));
}
const outline = new OutlinePass(camera);
if (ao) outline.depthSource = () => ao.beautyRenderTarget.depthTexture;
composer.addPass(outline);
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.8, 0.55, 0.85);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const grade = new ShaderPass(GradeShader);
composer.addPass(grade);
const smaa = new SMAAPass();
composer.addPass(smaa);

let baseFov = 72;
function resize() {
  const w = innerWidth;
  const h = innerHeight;
  pixelRatio = pixelRatioNow();
  renderer.setPixelRatio(pixelRatio);
  composer.setPixelRatio(pixelRatio);
  camera.aspect = w / h;
  // portrait phones: widen the vertical FOV so you still see a sensible slice of street
  const minHorizontal = THREE.MathUtils.degToRad(68);
  const needed = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(minHorizontal / 2) / camera.aspect));
  baseFov = THREE.MathUtils.clamp(needed, 72, 100);
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
  bloom.resolution.set(w / (LOW ? 2 : 1), h / (LOW ? 2 : 1));
  grade.uniforms.resolution.value.set(w * pixelRatio, h * pixelRatio);
  if (W) {
    W.road.setSize(w * pixelRatio * 0.5, h * pixelRatio * 0.5);
    W.weather.setViewport(h * pixelRatio, camera.fov);
  }
}
addEventListener('resize', resize);
visualViewport?.addEventListener('resize', resize);

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
  // title screen: what time to start
  const timePicker = document.getElementById('styles');
  timePicker.replaceChildren();
  for (const [id, st] of Object.entries(START_TIMES)) {
    const b = document.createElement('button');
    b.className = 'place';
    b.classList.toggle('here', id === settings.startAt);
    b.innerHTML = '<span class="pname"></span>';
    b.querySelector('.pname').textContent = st.label;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      settings.startAt = id;
      store.set('startAt', id);
      minute = st.minute;
      applyTime(true);
      renderMenus();
    });
    timePicker.append(b);
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
    input.start();
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
  input.pause();
  travel.classList.add('show');
}
function closeTravel(relock) {
  travelOpen = false;
  travel.classList.remove('show');
  if (relock) input.start();
}
document.getElementById('travel-close').addEventListener('click', () => closeTravel(true));

if (params.has('shot')) overlay.classList.add('gone');
document.getElementById('start').addEventListener('click', () => {
  audio.start();
  if (IS_TOUCH) document.documentElement.requestFullscreen?.().catch(() => {});
  input.start();
});
document.getElementById('start').textContent = IS_TOUCH ? 'Tap to play' : 'Click to play';
document.getElementById('fullscreen').addEventListener('click', (e) => {
  e.stopPropagation();
  if (document.fullscreenElement) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen?.().catch(() => hud.toast('Fullscreen not supported here. Try Add to Home Screen.'));
});
document.getElementById('reset').addEventListener('click', (e) => {
  e.stopPropagation();
  W.memories.reset();
  hud.toast('Journal cleared');
});
input.addEventListener('start', () => {
  audio.start();
  overlay.classList.add('gone');
});
input.addEventListener('pause', () => {
  if (!travelOpen) overlay.classList.remove('gone');
});

function climbEscape() {
  fade.querySelector('span').textContent = '';
  fade.classList.add('show');
  setTimeout(() => {
    player.climb(W.nearEscape);
    fade.classList.remove('show');
    hud.toast(player.roof ? 'On the roof' : 'Back on the street');
  }, 250);
}

function ride(mode) {
  if (player.roof && mode !== 'walk') {
    hud.toast('Climb down first');
    return;
  }
  if (mode === player.mode) return;
  player.setMode(mode);
  hud.setRide(MODES[mode].name, player.mode);
  hud.toast(MODES[mode].name);
}
input.addEventListener('button', (e) => {
  switch (e.detail) {
    case 'vehicle':
      ride(MODE_ORDER[(MODE_ORDER.indexOf(player.mode) + 1) % MODE_ORDER.length]);
      break;
    case 'camera':
      hud.toast(player.toggleView() === 'fpv' ? 'First person' : 'Third person');
      break;
    case 'action':
      if (W.nearEntrance) openTravel();
      else if (W.nearEscape) climbEscape();
      break;
  }
});

addEventListener('keydown', (e) => {
  switch (e.code) {
    case 'Escape':
      if (input.dragLook && input.active) input.pause();
      break;
    case 'KeyE':
      if (!input.active) break;
      if (W.nearEntrance) openTravel();
      else if (W.nearEscape) climbEscape();
      break;
    case 'Digit1':
    case 'Digit2':
    case 'Digit3':
    case 'Digit4':
      if (input.active) ride(MODE_ORDER[Number(e.code.slice(5)) - 1]);
      break;
    case 'KeyC':
      if (input.active) hud.toast(player.toggleView() === 'fpv' ? 'First person' : 'Third person');
      break;
    case 'KeyR': {
      settings.rainOverride = !settings.rain;
      applyTime(true);
      hud.toast(settings.rain ? 'Rain on' : 'Rain off');
      break;
    }
    case 'KeyM':
      hud.toast(audio.toggleMute() ? 'Muted' : 'Sound on');
      break;
    case 'KeyQ':
      settings.reflections = !settings.reflections;
      W.road.setReflections(settings.reflections && settings.rain);
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
applyInk();
loadDistrict(params.get('district') || store.get('district', 'astoria'));
if (params.has('cam')) {
  const [x, z, yaw = 0, pitch = 0, height = 1.68] = params.get('cam').split(',').map(Number);
  camera.position.set(x, W.groundAt(x, z) + height, z);
  camera.rotation.set(THREE.MathUtils.degToRad(pitch), THREE.MathUtils.degToRad(yaw), 0, 'YXZ');
}
resize();

// ---------- dynamic resolution: keep it smooth ----------
let slowTime = 0;
let fastTime = 0;
let smoothDt = 1 / 60;
function adaptResolution(dt) {
  if (dt <= 0) return;
  smoothDt += (dt - smoothDt) * 0.05;
  const fps = 1 / smoothDt;
  if (fps < 45) {
    slowTime += dt;
    fastTime = 0;
  } else if (fps > 57) {
    fastTime += dt;
    slowTime = 0;
  } else {
    slowTime = fastTime = 0;
  }
  if (slowTime > 1.5 && quality.scale > 0.5) {
    quality.scale = Math.max(0.5, quality.scale - 0.1);
    slowTime = 0;
    resize();
  } else if (fastTime > 5 && quality.scale < 1) {
    quality.scale = Math.min(1, quality.scale + 0.1);
    fastTime = 0;
    resize();
  }
}

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
let shadowFrame = 0;
const camEuler = new THREE.Euler();

function frame(now) {
  // rAF can hand us a timestamp from before a long rebuild; never run time backwards
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
  last = now;
  t += dt;

  minute = (minute + dt * MINUTES_PER_SECOND) % 1440;
  applyTime();
  player.update(dt);
  W.buildings.update(t, dt);
  W.streets.update(t);
  W.elevated.update(dt);
  W.traffic.update(t, dt, player, camera);
  W.weather.update(dt, camera.position);
  W.memories.update(t, dt, camera.position);
  W.peds.update(dt, camera.position, player);
  heroLight.position.set(camera.position.x, player.ground + 2.4, camera.position.z);
  if (sun.castShadow) {
    sun.target.position.set(player.pos.x, 0, player.pos.z);
    sun.position.copy(sun.target.position).addScaledVector(sunDir, 250);
    shadowFrame = (shadowFrame + 1) % 2;
    if (shadowFrame === 0) renderer.shadowMap.needsUpdate = true;
  }
  W.landmarks.update(t, camera, dt);
  W.sky.update(t, camera);
  W.clouds.update(camera);
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
  if (!player.roof) for (const e of W.elevated.entrances) if (Math.hypot(e.x - pos.x, e.z - pos.z) < 3.2) near = e;
  W.nearEntrance = near;
  // fire escapes: climb up from the sidewalk, or back down from the roof
  let fe = null;
  if (!near && player.mode === 'walk') {
    for (const f of W.buildings.fireEscapes) {
      const [fx, fz] = player.roof ? [f.roofX, f.roofZ] : [f.x, f.z];
      if (Math.hypot(fx - player.pos.x, fz - player.pos.z) < 2.6) fe = f;
    }
  }
  W.nearEscape = fe;
  const stationName = near?.name.replace(/–/g, '-');
  hud.setPrompt(near && input.active && !IS_TOUCH ? `Press E to take ${W.def.el.ride} from ${stationName}` : '');
  const climbLabel = fe ? (player.roof ? 'Climb down' : 'Climb') : '';
  input.setAction(near && input.active ? `Take ${W.def.el.ride}` : climbLabel);
  if (fe && !IS_TOUCH && input.active) hud.setPrompt(`Press E to ${player.roof ? 'climb down' : 'climb the fire escape'}`);
  hud.setSpeed(player.mode === 'walk' ? 0 : player.mph);
  hud.setRide(MODES[player.mode].name, player.mode);

  // comic-movie touches: speed lines and a wider lens as you pick up speed
  const rush = player.rush;
  grade.uniforms.speed.value += (rush - grade.uniforms.speed.value) * Math.min(1, dt * 4);
  const fov = baseFov + rush * 12;
  if (Math.abs(camera.fov - fov) > 0.05) {
    camera.fov += (fov - camera.fov) * Math.min(1, dt * 3);
    camera.updateProjectionMatrix();
  }
  adaptResolution(dt);

  edgeCooldown -= dt;
  if (player.atEdge && edgeCooldown <= 0) {
    hud.toast(`Edge of ${W.def.name}. Find a station to go further.`);
    edgeCooldown = 4;
  }

  camEuler.setFromQuaternion(camera.quaternion, 'YXZ');
  minimap.update(dt, pos, camEuler.y);
  hud.setLocation(describeLocation(player.pos.x, player.pos.z, { roof: !!player.roof }));
  hud.setClock(minute * 6);
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

window.__nightwalker = { scene, camera, renderer, player, input, quality, minimap, get world() { return W; }, loadDistrict, setMinute: (m) => { minute = m; applyTime(true); } };
