import * as THREE from 'three';
import './toon.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutlinePass, GradeShader, GodRaysPass } from './postfx.js';
import { RIM, rimLight, setWet } from './fx.js';
import { COMIC, ComicWords } from './comicfx.js';
import { BigMap, RideWheel } from './menus.js';
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
import { buildSky, buildTrees, setFoliage, buildClouds, buildSkyline, buildIcons } from './surroundings.js';
import { loadOSM } from './osm/fetch.js';
import { buildCity } from './osm/city.js';
import { buildViaduct } from './osm/viaduct.js';
import { Pedestrians } from './peds.js';
import { LightKit, CONES } from './lightkit.js';
import { buildRoad } from './road.js';
import { Traffic } from './traffic.js';
import { Weather } from './weather.js';
import { Memories } from './memories.js';
import { CityAudio } from './audio.js';
import { HUD, describeLocation } from './hud.js';
import { Player, MODES, MODE_ORDER } from './player.js';
import { loadMichelle } from './hero.js';
import { Input, IS_TOUCH } from './input.js';
import { ColliderGrid } from './collide.js';
import { makeCityEnvironment } from './env.js';
import { Minimap, Compass } from './minimap.js';
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
// a bigger, sharper shadow box that sits ahead of the camera (see the loop)
const SHADOW_HALF = 115;
const SHADOW_RES = 3072;
sun.shadow.mapSize.set(SHADOW_RES, SHADOW_RES);
Object.assign(sun.shadow.camera, { left: -SHADOW_HALF, right: SHADOW_HALF, top: SHADOW_HALF, bottom: -SHADOW_HALF, near: 1, far: 700 });
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
let comicWords = null; // created once the camera exists
const hud = new HUD();
const minimap = new Minimap(document.getElementById('minimap'));
const compass = new Compass(document.getElementById('compass'));
const staminaBar = document.querySelector('#stamina i');
const settings = {
  startAt: START_TIMES[params.get('time')] ? params.get('time') : store.get('startAt', 'golden'),
  rainOverride: null, // R forces rain on or off; otherwise it rains on some nights
  rain: true,
  reflections: store.get('reflections', !LOW),
  bloom: true,
  comicWords: true,
};

// ---------- the current neighborhood ----------
let W = null;
// extra characters for the sidewalk crowd, loaded in the background
let crowdExtras = null;
loadMichelle()
  .then((m) => {
    crowdExtras = [m];
    if (W && player.hero) {
      W.peds.setSkinned([player.hero, m], LOW ? 6 : 12);
      addRims();
    }
  })
  .catch((e) => console.warn('Crowd character unavailable', e));
/** Keep out of the river: step back to the nearest dry spot. */
function stayDry(p, r) {
  if (!W.isWater || !W.isWater(p.x, p.z)) return false;
  for (let d = 0.5; d < 6; d += 0.5) {
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const x = p.x + Math.cos(a) * d;
      const z = p.z + Math.sin(a) * d;
      if (!W.isWater(x, z)) {
        p.x = x + Math.cos(a) * r * 0.5;
        p.z = z + Math.sin(a) * r * 0.5;
        return true;
      }
    }
  }
  return false;
}
const worldProxy = {
  groundAt: (x, z) => (W ? W.groundAt(x, z) : 0),
  collide: (p, r) => (W ? W.grid.collide(p, r) || stayDry(p, r) : false),
  inside: (x, z, pad) => (W ? W.grid.inside(x, z, pad) : false),
  roofAt: (x, z, pad) => (W ? W.roofs.at(x, z, pad) : null),
};
comicWords = new ComicWords(camera);
const bigMap = new BigMap();
const rideWheel = new RideWheel();
let bigMapTimer = 0;
function toggleMap() {
  camEuler.setFromQuaternion(camera.quaternion, 'YXZ');
  const open = bigMap.toggle(W, player, camEuler.y);
  document.getElementById('hud').classList.toggle('under-map', open);
}
COMIC.pop = (...a) => settings.comicWords && comicWords.pop(...a);
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

// real OpenStreetMap streets, fetched in the browser; the drawn grid is the fallback
const FETCH_RADIUS = LOW ? 600 : 760;
const osmCache = new Map();
settings.realMap = params.has('realmap') ? params.get('realmap') !== '0' : store.get('realMap', true);

const bar = document.querySelector('#load-card .bar i');
/** The comic title card shown while a neighborhood loads. */
function showCard(def) {
  document.getElementById('load-boro').textContent = def.borough;
  document.getElementById('load-name').textContent = def.name;
  document.getElementById('load-blurb').textContent = def.blurb;
  fade.classList.add('card');
}

async function fetchRealMap(def, onStatus) {
  if (!settings.realMap || !def.ll) return null;
  if (osmCache.has(def.id)) return osmCache.get(def.id);
  const controller = new AbortController();
  const skip = document.getElementById('skip-real');
  skip.onclick = (e) => {
    e.stopPropagation();
    controller.abort();
  };
  fade.classList.add('fetching');
  let mb = 0;
  const onBytes = (n) => {
    const now = n / 1e6;
    if (now - mb < 0.05) return;
    mb = now;
    // most neighborhoods are 2-8 MB; fill toward a soft guess so the bar keeps moving
    fade.classList.add('known');
    bar.style.width = `${Math.min(96, (1 - Math.exp(-now / 4)) * 100)}%`;
    onStatus(`Loading real streets · ${now.toFixed(1)} MB`);
  };
  try {
    const data = await loadOSM({
      id: def.id, lat: def.ll[0], lon: def.ll[1], radius: FETCH_RADIUS, override: params.get('osm'), onStatus, onBytes, signal: controller.signal,
    });
    bar.style.width = '100%';
    osmCache.set(def.id, data);
    return data;
  } catch (e) {
    console.warn('OpenStreetMap unavailable, using the drawn map', e);
    return null;
  } finally {
    fade.classList.remove('fetching', 'known');
    bar.style.width = '';
  }
}

/** The procedural street grid (always available, even offline). */
function buildGridWorld(def) {
  const layout = generateLayout();
  const groundAt = makeGroundQuery(layout.groundRects, CURB);
  const buildings = buildBuildings(layout, shared);
  const streets = buildStreets(layout, shared);
  const kit = new LightKit();
  const elevated = buildElevated(shared, kit);
  const landmarks = def.landmarks(layout, shared);
  const traffic = new Traffic(shared, audio);
  // parked cars are solid too
  const parked = traffic.parked.map((c) => ({ x0: c.x - 1, x1: c.x + 1, z0: c.z - 2.35, z1: c.z + 2.35 }));
  // walkable roofs: flat-topped buildings, standing on the parapet lip
  const roofs = new ColliderGrid(
    layout.lots.filter((l) => l.kind !== 'house' && !l.outer).map((l) => ({ x0: l.x0, x1: l.x1, z0: l.z0, z1: l.z1, top: CURB + l.h + 0.225 })),
  );
  const grid = new ColliderGrid([...layout.colliders, ...elevated.colliders, ...landmarks.colliders, ...streets.colliders, ...parked]);
  return {
    layout, groundAt, buildings, streets, kit, elevated, landmarks, traffic, roofs, grid,
    trees: [...streets.trees, ...landmarks.trees], parts: [buildings.group, streets.group, elevated.group, landmarks.group],
    peds: new Pedestrians(), steam: streets.steam, start: () => def.start(D),
  };
}

/** A neighborhood built from real OpenStreetMap data. */
function buildRealWorld(def, data) {
  const city = buildCity(data, def, shared, { low: LOW, radius: FETCH_RADIUS });
  const b = city.box;
  Object.assign(D, {
    xMin: b.x0 + 4, xMax: b.x1 - 4, zMin: b.z0 + 4, zMax: b.z1 - 4, riverX: null, parkZ1: null, parkZ0: null,
    roadRect: { x0: b.x0 - 500, x1: b.x1 + 500, z0: b.z0 - 500, z1: b.z1 + 500 },
  });
  const kit = new LightKit();
  for (const l of city.kitLamps) kit.add(l.x, l.z, l.nx, l.nz, { kind: l.kind, height: l.underEl ? 6.5 : 8.5, arm: l.underEl ? 1.2 : 2.2 });
  const buildings = buildBuildings({ lots: city.lots, faces: city.faces, signNames: [...city.signNames, ...(def.shops ?? [])].slice(0, 44) }, shared);
  let elevated = city.elevated ? buildViaduct({ ...city.elevated, shared, kit, spot: city.spot }) : null;
  if (!elevated || !elevated.entrances.length) {
    for (const e of city.looseEntrances) kit.add(e.x, e.z, 1, 0, { globe: true, height: 2.4, kind: 'green', pool: 3 });
    elevated = { group: elevated?.group ?? new THREE.Group(), update: elevated?.update ?? (() => {}), colliders: elevated?.colliders ?? [], rumbleAt: elevated?.rumbleAt ?? (() => 0), events: elevated?.events ?? { braking: false, horn: null }, entrances: city.looseEntrances };
  }
  if (!elevated.entrances.length) {
    const s = city.start();
    elevated.entrances.push({ x: s.pos[0] + 2, z: s.pos[1], name: def.name });
  }
  // Manhattan's towers on the horizon, in their real direction
  const landmarks = { group: new THREE.Group(), colliders: [], trees: [], update() {} };
  if (city.midtown) {
    const [mx, mz] = city.midtown;
    const d = Math.hypot(mx, mz);
    const k = Math.min(1, 2600 / d);
    if (mx < 0 && Math.abs(mx) > Math.abs(mz) * 0.6) {
      landmarks.group.add(buildSkyline(shared, { x: mx * k + 350, z0: mz * k - 1100, z1: mz * k + 900, depth: 650 }).group);
    } else landmarks.group.add(buildIcons(shared, mx * k, mz * k).group);
  }
  const traffic = new Traffic(shared, audio, { lanes: city.lanes, parked: city.parked });
  const parked = traffic.parked.map((c) => {
    const cs = Math.cos(c.rot);
    const sn = Math.sin(c.rot);
    const poly = [[-1, -2.35], [1, -2.35], [1, 2.35], [-1, 2.35]].map(([x, z]) => [c.x + x * cs + z * sn, c.z - x * sn + z * cs]);
    const xs = poly.map((p) => p[0]);
    const zs = poly.map((p) => p[1]);
    return { poly, x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
  });
  const grid = new ColliderGrid([...city.colliders, ...elevated.colliders, ...parked]);
  const roofs = new ColliderGrid(city.roofs);
  const streets = city.corners;
  return {
    layout: null, groundAt: city.groundAt, buildings, streets, kit, elevated, landmarks, traffic, roofs, grid,
    trees: city.trees, parts: [city.group, buildings.group, elevated.group, landmarks.group],
    peds: new Pedestrians(city.routes), steam: city.corners.steam, start: city.start, place: city.place,
    describe: city.describe, mapImage: city.mapImage, isWater: city.isWater, real: city.counts, city,
  };
}

/** Comic rim light on everybody (hero, crowd) and every car. */
function addRims() {
  const touch = (root, scale) => root?.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m.isMeshStandardMaterial) rimLight(m, scale);
  });
  touch(player.hero?.root, 1);
  touch(W?.peds.group, 0.8);
  touch(W?.traffic.group, 0.6);
}

async function loadDistrict(id, { arrive = false, onStatus = () => {} } = {}) {
  const def = DISTRICTS[id] ?? DISTRICTS.astoria;
  const data = await fetchRealMap(def, onStatus);
  if (data) onStatus(`Building ${def.name} from real streets…`);
  await new Promise((r) => setTimeout(r, 30));
  if (W) {
    scene.remove(W.root);
    W.road.reflector.dispose();
    disposeTree(W.root);
  }
  activateDistrict(def);
  reseed(def.seed);

  let P = null;
  if (data) {
    try {
      P = buildRealWorld(def, data);
    } catch (e) {
      console.error('Real map failed to build, using the drawn map', e);
      activateDistrict(def);
      reseed(def.seed);
    }
  }
  P ??= buildGridWorld(def);
  const root = new THREE.Group();
  const sky = buildSky(shared);
  const clouds = buildClouds();
  root.add(...P.parts, P.kit.build(shared.pool), sky.mesh, clouds.group, buildTrees(P.trees));

  const road = buildRoad(shared.noise, D.roadRect, reflectSize());
  road.setReflections(settings.reflections);
  root.add(road.reflector, road.plain);
  const weather = new Weather(shared, P.groundAt, P.steam, quality.rain);
  weather.setViewport(innerHeight * pixelRatio, camera.fov);
  const memories = new Memories(shared, audio, hud, P.place ?? null);
  const peds = P.peds;
  root.add(P.traffic.group, weather.group, memories.group, peds.group);
  // opaque things cast and catch sun shadows
  root.traverse((o) => {
    if (!o.isMesh || o.material.transparent || o.material.isShaderMaterial) return;
    o.castShadow = true;
    o.receiveShadow = !o.material.isMeshBasicMaterial;
  });
  scene.add(root);

  W = {
    def, root, layout: P.layout, groundAt: P.groundAt, grid: P.grid, roofs: P.roofs, peds, clouds, buildings: P.buildings,
    streets: P.streets, elevated: P.elevated, landmarks: P.landmarks, sky, road, traffic: P.traffic, weather, memories,
    describe: P.describe ?? null, mapImage: P.mapImage ?? null, isWater: P.isWater ?? null, real: P.real ?? null, city: P.city ?? null,
  };
  // far building tiles can be skipped once the fog has swallowed them
  W.cullables = [];
  if (W.real) {
    W.buildings.group.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry.computeBoundingSphere();
      W.cullables.push(o);
    });
  }
  applyTime(true);
  minimap.setWorld(W);
  hud.setDistrict(`${def.name}, ${def.borough}`);
  store.set('district', def.id);
  renderMenus();

  const s = P.start();
  if (arrive) {
    // step out of the station entrance
    const e = W.elevated.entrances[0];
    player.spawn(e.x, e.z, [s.pos[0], 1.7, s.pos[1]]);
    hud.showMemory(`${def.name}, ${def.borough}`, def.blurb, 6000);
  } else {
    player.spawn(s.pos[0], s.pos[1], s.look);
  }
  if (W.real) hud.toast(`Real streets of ${def.name} · © OpenStreetMap contributors`);
  hud.setRide(MODES.walk.name, 'walk');
  const crowd = () => {
    const templates = [player.hero, ...(crowdExtras ?? [])];
    W.peds.setSkinned(templates, LOW ? 6 : 12);
    addRims();
  };
  if (player.hero) crowd();
  else player.onHero = crowd;
  return W;
}

// ---------- the look: one inked comic style, lit by the time of day ----------
const MINUTES_PER_SECOND = 0.5; // a full day takes 48 real minutes
let minute = START_TIMES[settings.startAt].minute;
let materialTimer = 0;
let rainyNight = Math.random() < 0.5;
let wasNight = false;
const tmpColor = new THREE.Color();
const skySun = new THREE.Vector3(0, 1, 0);
const raysColor = new THREE.Color(1, 0.8, 0.5);
let raysLevel = 0;

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
  g.hatch.value = INK.hatch ?? 0;
  g.printShift.value = INK.printShift ?? 0;
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
  // sun shafts: strongest with a low sun, gone at night
  skySun.set(...L.sky.sunDir).normalize();
  const low = skySun.y;
  raysLevel = THREE.MathUtils.smoothstep(low, -0.04, 0.06) * (0.35 + 1.05 * (1 - THREE.MathUtils.smoothstep(low, 0.2, 0.6)));
  raysColor.setRGB(...L.sun);
  // rim light: warm sunlight by day, cool neon-blue at night
  const nite = nightness(minute);
  RIM.color.value.setRGB(...L.sun).lerp(tmpColor.setRGB(0.55, 0.7, 1.25), nite);
  RIM.strength.value = 0.6 + nite * 0.15;
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
    setWet(W.root, rain && settings.reflections);
  }
  W.wet = rain ? 1 : 0.05;
  CONES.strength.value = L.pools * (rain ? 1.7 : 0.8);

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
      // office floors are mostly lit at once: keep glass towers from glaring at night
      const glow = m.userData.storefront ? 0.5 + L.windows * 0.6 : m.userData.glassy ? Math.min(L.windows, 0.55) : L.windows;
      m.emissiveIntensity = m.userData.baseEmissive * glow;
    } else if (m.blending === THREE.AdditiveBlending && m.map === shared.pool) {
      m.userData.baseOpacity ??= m.opacity;
      m.opacity = m.userData.baseOpacity * L.pools;
    } else if (m.userData.billboard) {
      m.emissiveIntensity = m.userData.bright ? 0.6 + L.windows * 1.4 : 0.12 + L.windows * 0.75;
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
    aoRadius: 1.1, distanceFalloff: 0.5, intensity: 2.2, aoSamples: 12, denoiseSamples: 6, denoiseRadius: 10,
    halfRes: true, depthAwareUpsampling: true, gammaCorrection: false, color: new THREE.Color(0.12, 0.06, 0.1),
  });
  composer.addPass(ao);
} else {
  composer.addPass(new RenderPass(scene, camera));
}
const outline = new OutlinePass(camera);
if (ao) outline.depthSource = () => ao.beautyRenderTarget.depthTexture;
composer.addPass(outline);
const godRays = new GodRaysPass(camera, LOW ? 20 : 40);
if (ao) godRays.depthSource = () => ao.beautyRenderTarget.depthTexture;
composer.addPass(godRays);
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
    const playable = b.places.filter((p) => p.id);
    if (!playable.length) continue;
    const h = document.createElement('h4');
    h.className = 'boro';
    h.textContent = b.name;
    picker.append(h);
    for (const p of playable) picker.append(placeButton(p, (id) => id !== W.def.id && goTo(id, false)));
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
  fade.querySelector('span').textContent = arrive ? `Taking ${W.def.el.ride} to ${def.name}…` : '';
  showCard(def);
  fade.classList.add('show');
  // give the fade a frame to paint before the heavy rebuild
  setTimeout(async () => {
    await loadDistrict(id, { arrive, onStatus: (text) => (fade.querySelector('span').textContent = text) });
    setTimeout(() => fade.classList.remove('show', 'card'), 350);
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
    case 'map':
      toggleMap();
      break;
    case 'action':
      if (W.nearEntrance) openTravel();
      else if (W.nearEscape) climbEscape();
      break;
  }
});

addEventListener('keyup', (e) => {
  if (e.code === 'KeyV' && rideWheel.open) {
    const mode = rideWheel.hide();
    if (mode) ride(mode);
  }
});

addEventListener('keydown', (e) => {
  if (e.code === 'Tab') {
    e.preventDefault();
    if (input.active || bigMap.open) toggleMap();
    return;
  }
  if (e.code === 'KeyV' && !e.repeat && input.active && !player.roof) {
    rideWheel.show(player.mode);
    return;
  }
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
    case 'KeyO':
      settings.realMap = !settings.realMap;
      store.set('realMap', settings.realMap);
      hud.toast(settings.realMap ? 'Real OpenStreetMap streets' : 'Drawn street grid');
      goTo(W.def.id, false);
      break;
    case 'KeyQ':
      settings.reflections = !settings.reflections;
      W.road.setReflections(settings.reflections && settings.rain);
      setWet(W.root, settings.reflections && settings.rain);
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
const firstDistrict = params.get('district') || store.get('district', 'astoria');
fade.querySelector('span').textContent = settings.realMap ? 'Loading real streets…' : '';
showCard(DISTRICTS[firstDistrict] ?? DISTRICTS.astoria);
fade.classList.add('show');
loadDistrict(firstDistrict, { onStatus: (text) => (fade.querySelector('span').textContent = text) }).then(() => {
  if (params.has('cam')) {
    const [x, z, yaw = 0, pitch = 0, height = 1.68] = params.get('cam').split(',').map(Number);
    camera.position.set(x, W.groundAt(x, z) + height, z);
    camera.rotation.set(THREE.MathUtils.degToRad(pitch), THREE.MathUtils.degToRad(yaw), 0, 'YXZ');
  }
  resize();
  for (let k = 0; k < Math.min(1200, (t - 3) * 10); k++) {
    W.elevated.update(0.1);
    W.traffic.update(k * 0.1, 0.1, player, camera);
    W.landmarks.update(k * 0.1, camera, 0.1);
  }
  last = performance.now();
  fade.classList.remove('show', 'card');
  requestAnimationFrame(frame);
});

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
let last = performance.now();
let frames = 0;
let fpsTime = 0;
let edgeCooldown = 0;
let portraitDone = false;

/** Snap the hero's face once for the HUD badge. */
function renderPortrait() {
  const head = player.hero?.bones.Head;
  if (!head || !player.hero.root.visible) return false;
  const size = 128;
  const rt = new THREE.WebGLRenderTarget(size, size);
  const cam = new THREE.PerspectiveCamera(28, 1, 0.05, 50);
  const hp = head.getWorldPosition(new THREE.Vector3());
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(player.hero.root.getWorldQuaternion(new THREE.Quaternion()));
  cam.position.copy(hp).addScaledVector(fwd, 0.62).add(new THREE.Vector3(0.12, 0.08, 0));
  cam.lookAt(hp.x, hp.y + 0.06, hp.z);
  const oldBg = scene.background;
  scene.background = new THREE.Color(0xf5c518);
  const fog = scene.fog;
  scene.fog = null;
  renderer.setRenderTarget(rt);
  renderer.render(scene, cam);
  renderer.setRenderTarget(null);
  scene.background = oldBg;
  scene.fog = fog;
  const px = new Uint8Array(size * size * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, size, size, px);
  rt.dispose();
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const img = new ImageData(size, size);
  for (let y = 0; y < size; y++) img.data.set(px.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
  c.getContext('2d').putImageData(img, 0, 0);
  document.getElementById('portrait').src = c.toDataURL();
  return true;
}
let shadowFrame = 0;
const shadowFwd = new THREE.Vector3();
const shadowCenter = new THREE.Vector3();
const shadowRight = new THREE.Vector3();
const shadowUp = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
let cullTimer = 0;
const camEuler = new THREE.Euler();

let lastSpeed = 0;
let lastLand = 0;
/** Pop comic sound effects for the loud moments. */
function comicSounds(dt) {
  if (!settings.comicWords) return;
  const p = camera.position;
  camera.getWorldDirection(tmpDir);
  const ahead = (d, up) => [p.x + tmpDir.x * d, p.y + up, p.z + tmpDir.z * d];
  // a train thundering overhead
  if (W.elevated.rumbleAt(p) > 0.78) COMIC.pop('RUMBLE', ...ahead(9, 5), { size: 1.3, cooldown: 9 });
  if (W.elevated.events.horn) {
    const hp = W.elevated.events.horn;
    COMIC.pop('HOOOONK!', hp.x, hp.y + 3, hp.z, { size: 1.2, cooldown: 8 });
  }
  // landing a jump in the rain
  if (player.land > 0.45 && lastLand <= 0.45) COMIC.pop(settings.rain ? 'SPLASH!' : 'THUD', player.pos.x, player.ground + 0.4, player.pos.z, { size: 0.8, cooldown: 1.5 });
  lastLand = player.land;
  // engines and brakes
  const sp = Math.abs(player.speed);
  if (player.mode !== 'walk' && player.mode !== 'bike') {
    if (sp > 6 && sp - lastSpeed > 5.5 * dt && player.input.axes?.().y > 0.5) COMIC.pop('VROOM!', player.pos.x, player.ground + 1.6, player.pos.z, { cooldown: 7 });
    if (lastSpeed - sp > 9 * dt && lastSpeed > 9) COMIC.pop('SKRRT!', player.pos.x, player.ground + 0.8, player.pos.z, { cooldown: 4 });
  }
  lastSpeed = sp;
  comicWords.update();
}
const tmpDir = new THREE.Vector3();

function frame(now) {
  // rAF can hand us a timestamp from before a long rebuild; never run time backwards
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
  last = now;
  t += dt;

  minute = (minute + dt * MINUTES_PER_SECOND) % 1440;
  applyTime();
  // the ride wheel takes the mouse while it's open
  if (rideWheel.open) {
    const d = input.consumeLook();
    rideWheel.steer(d.x, d.y);
  }
  if (bigMap.open) {
    bigMapTimer -= dt;
    if (bigMapTimer <= 0) {
      bigMapTimer = 0.25;
      camEuler.setFromQuaternion(camera.quaternion, 'YXZ');
      bigMap.draw(W, player, camEuler.y);
    }
  }
  player.update(dt);
  W.buildings.update(t, dt);
  W.streets.update(t);
  W.elevated.update(dt);
  W.traffic.update(t, dt, player, camera);
  W.weather.update(dt, camera.position);
  W.memories.update(t, dt, camera.position);
  W.peds.update(dt, camera.position, player, settings.rain);
  heroLight.position.set(camera.position.x, player.ground + 2.4, camera.position.z);
  if (sun.castShadow) {
    // center the shadows ahead of where you look, snapped to shadow texels so edges don't crawl
    camera.getWorldDirection(shadowFwd);
    shadowFwd.y = 0;
    shadowFwd.normalize();
    shadowCenter.set(player.pos.x, 0, player.pos.z).addScaledVector(shadowFwd, SHADOW_HALF * 0.55);
    shadowRight.crossVectors(UP, sunDir).normalize();
    shadowUp.crossVectors(sunDir, shadowRight).normalize();
    const texel = (SHADOW_HALF * 2) / SHADOW_RES;
    const a = Math.round(shadowCenter.dot(shadowRight) / texel) * texel;
    const b = Math.round(shadowCenter.dot(shadowUp) / texel) * texel;
    const c = shadowCenter.dot(sunDir);
    shadowCenter.copy(shadowRight).multiplyScalar(a).addScaledVector(shadowUp, b).addScaledVector(sunDir, c);
    sun.target.position.copy(shadowCenter);
    sun.position.copy(shadowCenter).addScaledVector(sunDir, 300);
    shadowFrame = (shadowFrame + 1) % 2;
    if (shadowFrame === 0) renderer.shadowMap.needsUpdate = true;
  }
  W.landmarks.update(t, camera, dt);
  cullTimer -= dt;
  if (cullTimer <= 0 && W.cullables.length) {
    cullTimer = 0.4;
    // distance where exp2 fog is ~98.5% opaque
    const far = 2.05 / Math.max(1e-4, scene.fog.density) + 40;
    for (const o of W.cullables) {
      const bs = o.geometry.boundingSphere;
      o.visible = Math.hypot(bs.center.x - camera.position.x, bs.center.z - camera.position.z) - bs.radius < far;
    }
  }
  W.sky.update(t, camera);
  W.clouds.update(camera);
  W.road.update(t, W.weather.intensity * W.wet);

  const pos = camera.position;
  comicSounds(dt);
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
  compass.update(camEuler.y, player.pos, W);
  staminaBar.style.width = `${Math.round(player.stamina * 100)}%`;
  staminaBar.parentElement.classList.toggle('low', player.stamina < 0.25);
  if (player.hero && !portraitDone && frames > 5) portraitDone = renderPortrait();
  hud.setLocation((W.describe ?? describeLocation)(player.pos.x, player.pos.z, { roof: !!player.roof }));
  hud.setClock(minute * 6);
  grade.uniforms.time.value = t;
  godRays.setSun(skySun, raysLevel * (settings.rain ? 0.3 : 1), raysColor);
  // drops on the lens when it's raining and you're out in it (not in the SUV)
  const lensTarget = settings.rain && player.mode !== 'suv' && !player.roofCovered ? 1 : 0;
  grade.uniforms.lensRain.value += (lensTarget - grade.uniforms.lensRain.value) * Math.min(1, dt * 0.6);
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
window.__nightwalker = { scene, camera, renderer, player, input, quality, minimap, hud, get world() { return W; }, loadDistrict, setMinute: (m) => { minute = m; applyTime(true); } };
