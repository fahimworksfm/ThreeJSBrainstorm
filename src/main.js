import * as THREE from 'three';
import './toon.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutlinePass, PaintPass, GradeShader, GodRaysPass } from './postfx.js';
import { RIM, rimLight, setWet, SNOW, snowCover } from './fx.js';
import { COMIC, ComicWords, JUICE } from './comicfx.js';
import { BigMap, RideWheel } from './menus.js';
import { PRESETS, DEFAULTS, buildSettings } from './settingsui.js';
import { loadTexturePack } from './texturepack.js';
import { N8AOPass } from 'n8ao';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { LUTPass } from 'three/addons/postprocessing/LUTPass.js';
import { INK, lookAt, nightness, START_TIMES } from './look.js';

import { CURB, D, activateDistrict } from './config.js';
import { DISTRICTS, BOROUGHS } from './districts/index.js';
import { reseed, chance } from './random.js';
import { Pigeons } from './pigeons.js';
import { Rats } from './rats.js';
import { nycMinute, liveWeather, aqiLabel } from './live.js';
import { PhotoChallenges } from './photos.js';
import { Knockables } from './knockables.js';
import { Radio } from './radio.js';
import { Graffiti } from './graffiti.js';
import { Deliveries } from './deliveries.js';
import { setTerrain, liftAll, heightAt, terrainOn } from './terrain.js';
import { Plaques } from './plaques.js';
import { Regulars } from './regulars.js';
import { Transit } from './transit.js';
import { Achievements, Daily, nycDate } from './achievements.js';
import { Tricks } from './tricks.js';
import { Errands } from './quests.js';
import { buildFarCity } from './farcity.js';
import { sunPosition, sunTimes, lookMinuteFor } from './sun.js';
import { Moon, moonPosition, phaseName } from './moon.js';
import { dayOfYear, seasonDay, foliageNow } from './foliage.js';
import { FallingLeaves } from './leaves.js';
import { nextHenges, hengeNow, nycWhen } from './henge.js';
import { season, holiday, buildDecor } from './holidays.js';
import { Soundscape } from './soundscape.js';
import { FoodStops } from './food.js';
import { Taxi } from './taxi.js';
import { buildFerries } from './ferries.js';
import { Ghosts } from './ghosts.js';
import { HydrantSpray } from './spray.js';
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
import { Memories, hasMetroCard } from './memories.js';
import { CityAudio } from './audio.js';
import { HUD, describeLocation } from './hud.js';
import { Player, MODES, MODE_ORDER, LOOK } from './player.js';
import { loadMichelle, POSE_STEP } from './hero.js';
import { Input, IS_TOUCH } from './input.js';
import { ColliderGrid } from './collide.js';
import { makeCityEnvironment } from './env.js';
import { Minimap, Compass } from './minimap.js';
import { show as showClip, hide as hideClip, clipTexture, pauseAll as pauseClips } from './media.js';
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
let SHADOW_RES = 3072;
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
const radio = new Radio(audio);
let ghosts = null; // created once the HUD exists
let comicWords = null; // created once the camera exists
const hud = new HUD();
const achievements = new Achievements(store, hud, DISTRICTS);
const errands = new Errands(store, hud, DISTRICTS);
const errandsEl = document.getElementById('errands');
errands.render(errandsEl);
const minimap = new Minimap(document.getElementById('minimap'));
const compass = new Compass(document.getElementById('compass'));
const staminaBar = document.querySelector('#stamina i');
const settings = {
  startAt: START_TIMES[params.get('time')] ? params.get('time') : store.get('startAt', 'golden'),
  rainOverride: null, // R forces rain on or off; otherwise it rains on some nights
  rain: true,
  reflections: !LOW,
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
player.tricks = new Tricks(hud, store);
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

const bar = document.querySelector('#load-card .bar i');
/** The comic title card shown while a neighborhood loads. */
const TIPS = [
  'Tip: hold V for the ride wheel.',
  'Tip: Tab opens the map. Yellow diamonds are memories.',
  'Tip: press R to make it rain. The streets turn to mirrors.',
  'Tip: press P for photo mode, then Enter to save a picture.',
  'Tip: Space jumps. Land in a puddle for a SPLASH!',
  'Tip: green globes are subway entrances. Press E to ride.',
  'Tip: climb a fire escape (E) and walk the rooftops.',
  'Tip: press C to switch between first and third person.',
  'Tip: Settings has graphics presets if things feel slow.',
];
// on this day in New York: Wikipedia's on-this-day events that happened in the city (fetched once a day)
let onThisDay = null;
async function loadOnThisDay() {
  const [, m, d] = nycDate().split('-');
  const key = `otd.${m}${d}`;
  const saved = store.get(key, null);
  if (saved) return (onThisDay = saved);
  try {
    const r = await fetch(`https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/${m}/${d}`, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const NYC = /New York City|Manhattan|Brooklyn|the Bronx|Queens, New York|Staten Island|Harlem|Coney Island|Times Square|Central Park|Broadway|Wall Street|Empire State|Statue of Liberty|Brooklyn Bridge|subway/i;
    const list = ((await r.json()).events ?? [])
      .filter((e) => NYC.test(e.text) || (e.pages ?? []).some((p) => NYC.test(`${p.title} ${p.description ?? ''}`) && /New York|Manhattan|Brooklyn|Bronx|Queens|Staten/.test(p.description ?? '')))
      .map((e) => ({ year: e.year, text: e.text.length > 170 ? `${e.text.slice(0, 167)}…` : e.text }));
    store.set(key, list);
    return (onThisDay = list);
  } catch {
    return null;
  }
}
loadOnThisDay();

function showCard(def, arrive = false) {
  // a moving picture up top: the view from the train when riding there, the Wonder Wheel for Coney Island
  const vid = document.getElementById('load-vid');
  if (arrive) showClip(vid, 'subway-window');
  else if (def.id === 'coney') showClip(vid, 'card-coney');
  else hideClip(vid);
  // half the time, if Wikipedia has one, something that happened in New York on this date instead of a tip
  const otd = onThisDay?.length && Math.random() < 0.5 ? onThisDay[Math.floor(Math.random() * onThisDay.length)] : null;
  document.getElementById('load-tip').textContent = otd ? `📅 On this day in ${otd.year}: ${otd.text} (Wikipedia)` : TIPS[Math.floor(Math.random() * TIPS.length)];
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
    // NYC Open Data (real heights, the tree census, restaurant grades), when the site ships it
    try {
      const r = await fetch(`./nyc/${def.id}.json`);
      if (r.ok && (r.headers.get('content-type') || '').includes('json')) data.nyc = await r.json();
    } catch {
      /* the map works without it */
    }
    // real landmarks (Wikipedia), for the historic plaques
    try {
      const r = await fetch(`./wiki/${def.id}.json`);
      if (r.ok && (r.headers.get('content-type') || '').includes('json')) data.wiki = await r.json();
    } catch {
      /* no plaques then */
    }
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
  const traffic = new Traffic(shared, audio, null, driveways(layout), streets.openHydrants);
  // parked cars are solid too
  const parked = traffic.parked.map((c) => {
    const across = Math.abs(Math.sin(c.rot)) > 0.7; // driveway cars sit crosswise
    const hx = across ? 2.35 : 1;
    const hz = across ? 1 : 2.35;
    return { x0: c.x - hx, x1: c.x + hx, z0: c.z - hz, z1: c.z + hz };
  });
  // walkable roofs: flat-topped buildings, standing on the parapet lip
  const roofs = new ColliderGrid(
    layout.lots.filter((l) => l.kind !== 'house' && !l.outer).map((l) => ({ x0: l.x0, x1: l.x1, z0: l.z0, z1: l.z1, top: CURB + l.h + 0.225 })),
  );
  const grid = new ColliderGrid([...layout.colliders, ...elevated.colliders, ...landmarks.colliders, ...streets.colliders, ...parked, ...buildings.colliders]);
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
  const buildings = buildBuildings({ lots: city.lots, faces: city.faces, signNames: city.signNames }, shared);
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
  const traffic = new Traffic(shared, audio, { lanes: city.lanes, parked: city.parked }, [], city.corners.openHydrants);
  const parked = traffic.parked.map((c) => {
    const cs = Math.cos(c.rot);
    const sn = Math.sin(c.rot);
    const poly = [[-1, -2.35], [1, -2.35], [1, 2.35], [-1, 2.35]].map(([x, z]) => [c.x + x * cs + z * sn, c.z - x * sn + z * cs]);
    const xs = poly.map((p) => p[0]);
    const zs = poly.map((p) => p[1]);
    return { poly, x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
  });
  const grid = new ColliderGrid([...city.colliders, ...elevated.colliders, ...parked, ...buildings.colliders]);
  const roofs = new ColliderGrid(city.roofs);
  const streets = city.corners;
  return {
    layout: null, groundAt: city.groundAt, buildings, streets, kit, elevated, landmarks, traffic, roofs, grid,
    trees: city.trees, parts: [city.group, buildings.group, elevated.group, landmarks.group],
    peds: new Pedestrians(city.routes), steam: city.corners.steam, start: city.start, place: city.place,
    describe: city.describe, mapImage: city.mapImage, isWater: city.isWater, real: city.counts, city,
  };
}

/** Cars in the side yards between neighboring houses, nose to the street. */
function driveways(layout) {
  const houses = layout.lots.filter((l) => l.kind === 'house' && !l.outer);
  const byStart = new Map(houses.map((l) => [`${l.frontX}|${l.lotZ0.toFixed(2)}`, l]));
  const out = [];
  for (const l of houses) {
    const next = byStart.get(`${l.frontX}|${l.lotZ1.toFixed(2)}`);
    if (!next || next.z0 - l.z1 < 2.4 || !chance(0.45)) continue;
    const nx = l.side;
    const face = nx < 0 ? l.x0 : l.x1;
    out.push({ x: face - nx * 1.4, y: CURB, z: (l.z1 + next.z0) / 2, rot: nx < 0 ? -Math.PI / 2 : Math.PI / 2 });
  }
  return out;
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
    pauseClips(['title', 'subway-window', 'card-coney']); // the city's screens start again as they're rebuilt
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
  root.add(...P.parts, P.kit.build(shared.pool), sky.mesh, clouds.group, buildTrees(P.trees, shared.leaves ?? null));
  // the real city past the edge of the map, on the horizon
  if (P.city && data?.nyc?.far) {
    const far = buildFarCity(data.nyc.far, P.city.M.proj, P.city.box);
    root.add(far.group);
    console.info(`skyline: ${far.count} far blocks`);
  }

  const road = buildRoad(shared.noise, D.roadRect, reflectSize(), shared.asphalt ?? null);
  road.setReflections(settings.reflections);
  root.add(road.reflector, road.plain);
  // smoke off the grill at the real kebab, barbecue and halal spots, rising past the sign from the kitchen
  const grills = (P.buildings.realBoards ?? [])
    .filter((b) => /bbq|barbecue|kebab|grill|burger|steak|chicken|korean|halal|souvlaki|yakitori|shawarma|gyro|jerk/i.test(`${b.cuisine ?? ''} ${b.name ?? ''}`))
    .slice(0, 8)
    .map((b) => ({ x: b.x + b.nx * 0.5, y: CURB + 5.6, z: b.z + b.nz * 0.5, strength: 0.3, kind: 'grill' }));
  const weather = new Weather(shared, P.groundAt, [...P.steam, ...grills], quality.rain);
  weather.setViewport(innerHeight * pixelRatio, camera.fov);
  const memories = new Memories(shared, audio, hud, P.place ?? null);
  const peds = P.peds;
  peds.camera = camera; // draw only the people in view
  const pigeons = new Pigeons(peds);
  const rats = new Rats(data?.nyc?.rats, P.city?.M.proj, peds, store);
  if (rats.count) console.info(`rats: ${rats.count} spots from 311`);
  const spray = new HydrantSpray(shared, P.streets.openHydrants ?? []);
  const knock = new Knockables(peds, P.grid, audio);
  const graffiti = new Graffiti(P.layout?.faces ?? P.city?.faces ?? [], store, def.id, audio);
  graffiti.tagName = gfx.tag || '';
  const plaques = new Plaques(data?.wiki, P.city ?? null, store, def.id, hud);
  const regulars = new Regulars(P.layout?.faces ?? P.city?.faces ?? [], P.streets.openHydrants ?? [], def.name, () => nightness(lookMin()), hud, audio);
  const transit = new Transit(P.elevated.entrances, P.city ?? null, data?.nyc, def, hud);
  // the trains on the el keep to the real timetable when the live arrivals are in
  P.elevated.setDispatcher?.((i, dir) => transit.eta(P.elevated.stations[i], dir));
  // the real calendar: today's season on the trees, and the holiday's decorations out
  const decor = buildDecor(P.layout?.faces ?? P.city?.faces ?? [], params.get('holiday') ?? holiday());
  const deliveries = new Deliveries(P.layout?.faces ?? P.city?.faces ?? [], P.describe ?? describeLocation, shared.beam, store);
  root.add(P.traffic.group, weather.group, memories.group, peds.group, pigeons.group, rats.group, spray.group, knock.group, graffiti.group, deliveries.group, plaques.group, regulars.group, transit.group, decor.group);
  decor.group.name = 'decor';
  // opaque things cast and catch sun shadows
  root.traverse((o) => {
    if (!o.isMesh || o.material.transparent || o.material.isShaderMaterial || o.userData.noShadow) return;
    o.castShadow = true;
    o.receiveShadow = !o.material.isMeshBasicMaterial;
  });
  scene.add(root);
  // real hills (NYC elevation): everything is drawn lifted by the ground under it
  const hills = gfx.hills !== false && P.city ? setTerrain(data?.nyc?.elevation, P.city.M.proj, P.city.box.x1) : setTerrain(null);
  if (hills) {
    liftAll(scene);
    for (const e of weather.emitters ?? []) e.y += heightAt(e.x, e.z); // steam is its own shader
    console.info(`terrain: ${def.name} ${hills.low.toFixed(1)}-${hills.high.toFixed(1)} m`);
  }

  W = {
    def, root, layout: P.layout, groundAt: P.groundAt, grid: P.grid, roofs: P.roofs, peds, pigeons, rats, spray, knock, graffiti, deliveries, plaques, regulars, transit, clouds, buildings: P.buildings,
    streets: P.streets, elevated: P.elevated, landmarks: P.landmarks, sky, road, traffic: P.traffic, weather, memories,
    describe: P.describe ?? null, mapImage: P.mapImage ?? null, isWater: P.isWater ?? null, real: P.real ?? null, city: P.city ?? null,
  };
  W.season = params.get('season') ?? season();
  if (params.get('weather') === 'snow') SNOW.amount.value = 0.85; // trying it out: start with a snowy street
  // what the blocks really sound like (311 noise complaints)
  W.soundscape = new Soundscape(data?.nyc?.noise, P.city?.M.proj, audio);
  W.food = new FoodStops(P.buildings.realBoards, store, hud);
  root.add(W.food.group); // the bodega cats
  // ferries on the real ferry routes
  W.ferries = buildFerries(P.city?.M.ferries, P.city?.box);
  root.add(W.ferries.group);
  W.taxi = new Taxi(root, P.city?.isRoad ?? ((x, z) => P.groundAt(x, z) < 0.05), store, hud);
  // the daily postcard: a real storefront somewhere in this neighborhood
  const faces = P.layout?.faces ?? P.city?.faces ?? [];
  const boards = P.buildings.realBoards?.length ? P.buildings.realBoards : faces.filter((f) => f.shop && !f.lot?.outer && f.w > 5).map((f) => ({ x: f.x, z: f.z, nx: f.nx, nz: f.nz, name: f.names?.[0] ?? null }));
  W.daily = new Daily(store, hud, def.id, boards, P.describe ?? describeLocation);
  postcardIn = W.daily.target ? 40 : -1;
  achievements.visit(def.id);
  if (graffiti.news) setTimeout(() => hud.toast(graffiti.news), 6000);
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
  // a shared link (?at=x,z,facing) drops you where your friend was standing
  const at = params.get('at')?.split(',').map(Number);
  if (at?.length >= 2 && at.every(Number.isFinite) && def.id === params.get('district') && !sharedSpotUsed) {
    sharedSpotUsed = true;
    const yaw = Number.isFinite(at[2]) ? at[2] : 0;
    player.spawn(at[0], at[1], [at[0] - Math.sin(yaw) * 5, 1.7, at[1] - Math.cos(yaw) * 5]);
    setTimeout(() => hud.toast('📍 A friend sent you to this spot'), 2500);
  }
  if (W.real) hud.toast(`Real streets of ${def.name} · © OpenStreetMap contributors`);
  challenges.setWorld(W);
  ghosts ??= new Ghosts(scene, hud);
  if (gfx.ghosts) ghosts.join(def.id);
  else ghosts.leave();
  const crew = W.city?.crews?.[0];
  const titled = (t) => t.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  if (crew) setTimeout(() => hud.toast(`🎬 A film crew is shooting on ${titled(crew.street)} (real NYC film permit)`), 6000);
  // today's real street events, or the next one coming up
  const fair = W.city?.fairs?.[0];
  const soon = W.city?.upcoming;
  if (fair) setTimeout(() => hud.toast(`🎪 ${titled(fair.type)} on ${titled(fair.street)} today${fair.name ? `: ${fair.name}` : ''} (real NYC permit)`), 11000);
  else if (soon) setTimeout(() => hud.toast(`🎪 Coming up ${new Date(`${soon.start}T12:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}: ${titled(soon.type)}${soon.name ? `, ${soon.name}` : ''}`), 11000);
  refreshLive(isLive());
  document.body.classList.toggle('realmap', !!W.real); // keeps the OpenStreetMap credit under the map
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
let minute = START_TIMES[settings.startAt].live ? nycMinute() : START_TIMES[settings.startAt].minute;
// Live NYC: the weather reading for the current neighborhood, refreshed every ten minutes
let live = null;
let liveTimer = 0;
const isLive = () => !!START_TIMES[settings.startAt].live;
async function refreshLive(announce = false) {
  liveTimer = 600;
  if (!isLive() || !W?.def.ll) {
    live = null;
    return;
  }
  const w = await liveWeather(...W.def.ll);
  if (!w) return;
  live = w;
  applyTime(true);
  const air = w.aqi != null ? ` · air ${aqiLabel(w.aqi)} (AQI ${w.aqi})` : '';
  const sky = moonNow && moonNow.el > 0 ? ` · ${phaseName(moonNow)} up` : '';
  if (announce) hud.toast(`Live: ${w.temp}°F, ${w.label} in ${W.def.name}${air}${sky} · Open-Meteo.com`);
  if (w.smoke > 0.15) setTimeout(() => hud.toast('🌫️ Smoke in the air today: the haze is real (PM2.5 from Open-Meteo)'), 2200);
}
// live mode: the look follows today's real sunrise and sunset, and the sun shines from its real direction
let sunCache = null;
function realSun() {
  if (!isLive() || !W?.def.ll) return null;
  const now = new Date();
  const key = `${W.def.id}|${now.toDateString()}`;
  if (sunCache?.key !== key) sunCache = { key, times: sunTimes(now, ...W.def.ll) };
  return sunCache.times;
}
/** The minute of the look's timeline for the clock's minute: the same, unless live. */
function lookMin() {
  const times = realSun();
  return times ? lookMinuteFor(minute, times) : minute;
}
/** Turn a look's sun direction to the real sun's compass bearing, keeping its height. */
function aimRealSun(v) {
  if (!realSun()) return;
  const h = bearing(sunPosition(new Date(), ...W.def.ll).az);
  if (!h) return;
  const flat = Math.hypot(v.x, v.z);
  v.set(h[0] * flat, v.y, h[1] * flat);
}
/** A compass bearing (degrees clockwise from north) as a unit [x, z] on the real map; null on the drawn one. */
function bearing(az) {
  const proj = W?.city?.M.proj;
  if (!proj || !W.def.ll) return null;
  const [lat, lon] = W.def.ll;
  const kx = 111320 * Math.cos((lat * Math.PI) / 180);
  const [ox, oz] = proj.toWorld(lat, lon);
  const [ex, ez] = proj.toWorld(lat, lon + 1 / kx);
  const [nx, nz] = proj.toWorld(lat + 1 / 110540, lon);
  const a = (az * Math.PI) / 180;
  const hx = (ex - ox) * Math.sin(a) + (nx - ox) * Math.cos(a);
  const hz = (ez - oz) * Math.sin(a) + (nz - oz) * Math.cos(a);
  const l = Math.hypot(hx, hz) || 1;
  return [hx / l, hz / l];
}
// the real moon, at the clock's time (the real time in live mode; today at the chosen hour otherwise)
const moon = new Moon();
scene.add(moon.group);
const moonDir = new THREE.Vector3();
let moonNow = null;
let moonTimer = 0;
let moonMinute = -999;
function updateMoon(dt) {
  moonTimer -= dt;
  // every few seconds, and at once when the clock jumps (a new start time, a train ride)
  if (moonTimer <= 0 || !moonNow || Math.abs(minute - moonMinute) > 3) {
    moonTimer = 5;
    moonMinute = minute;
    const ll = W?.def.ll ?? [40.73, -73.99];
    const when = new Date(Date.now() + (minute - nycMinute()) * 60000);
    moonNow = moonPosition(when, ...ll);
  }
  // on the drawn map north is -z
  const h = bearing(moonNow.az) ?? [Math.sin((moonNow.az * Math.PI) / 180), -Math.cos((moonNow.az * Math.PI) / 180)];
  const el = (Math.max(moonNow.el, 2) * Math.PI) / 180; // just over the rooftops when it's low
  moonDir.set(h[0] * Math.cos(el), Math.sin(el), h[1] * Math.cos(el));
  const clear = live ? 1 - Math.max(0, live.cloud - 0.4) * 1.4 : settings.rain ? 0.2 : 1;
  moon.update(camera, moonNow, moonDir, nightness(lookMin()), Math.max(0, clear));
}
let materialTimer = 0;
let rainyNight = Math.random() < 0.5;
let wasNight = false;
const tmpColor = new THREE.Color();
const tmpVec = new THREE.Vector3();
const snowRoad = new THREE.Color(0.42, 0.44, 0.48);
// thunderstorms: lightning now and then, thunder a few seconds behind it
let flash = 0;
let boltIn = 6;
// the drawn bolt itself (public/media/lightning-strike.jpg, on black: added onto the sky), out past the rooftops
const bolt = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 872 / 1024).translate(0, 0.42, 0),
  new THREE.MeshBasicMaterial({ blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false, toneMapped: false }),
);
bolt.visible = false;
bolt.frustumCulled = false;
bolt.userData.noTerrain = true;
new THREE.TextureLoader().load('media/lightning-strike.jpg', (t) => {
  t.colorSpace = THREE.SRGBColorSpace;
  bolt.material.map = t;
  bolt.material.needsUpdate = true;
});
scene.add(bolt);
/** A strike somewhere around you: farther ones lower on the horizon and smaller. */
function strike(near) {
  if (!bolt.material.map) return;
  const a = Math.random() * Math.PI * 2;
  const d = 260 + (1 - near) * 340;
  bolt.position.set(camera.position.x + Math.sin(a) * d, -20, camera.position.z + Math.cos(a) * d);
  bolt.scale.setScalar(d * 1.1);
  bolt.scale.x *= Math.random() < 0.5 ? -1 : 1; // forks lean either way
  bolt.lookAt(camera.position.x, -20, camera.position.z);
  bolt.visible = true;
  // a close one gets the comic treatment too
  if (near > 0.75 && !gfx.calm) {
    const el = document.getElementById('boltpop');
    el.classList.remove('go');
    void el.offsetWidth;
    el.classList.add('go');
  }
}
const stormy = () => params.get('weather') === 'storm' || !!live?.storm;
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
  const L = lookAt(lookMin());
  const [fr, fg, fb, density] = L.fog;
  scene.fog.color.setRGB(fr, fg, fb);
  scene.fog.density = density * (live?.haze ?? 1);
  // wildfire smoke: the whole sky goes a dirty amber, and the sun with it
  const smoke = params.get('weather') === 'smoke' ? 0.6 : (live?.smoke ?? 0);
  if (smoke) scene.fog.color.lerp(tmpColor.setRGB(0.55, 0.4, 0.24).multiplyScalar(0.8 - 0.4 * nightness(lookMin())), smoke);
  if (smoke) scene.fog.density = Math.max(scene.fog.density, 0.004) * (1 + smoke * 3.5);
  scene.background.copy(scene.fog.color);
  hemi.color.setRGB(...L.hemiSky);
  hemi.groundColor.setRGB(...L.hemiGround);
  hemi.intensity = L.hemi;
  sun.color.setRGB(...L.sun);
  if (smoke) sun.color.lerp(tmpColor.setRGB(1, 0.55, 0.25), smoke);
  sun.intensity = L.sunI * (1 - smoke * 0.5);
  sunDir.set(...L.sunDir);
  aimRealSun(sunDir);
  sunDir.normalize();
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
  if (smoke) {
    // everything seen through it goes sepia
    g.highlightTint.value.lerp(tmpVec.set(1.12, 0.86, 0.6), smoke);
    g.shadowTint.value.lerp(tmpVec.set(0.75, 0.55, 0.38), smoke * 0.6);
    g.saturation.value *= 1 - smoke * 0.35;
  }
  heroLight.intensity = nightness(lookMin()) * 5;
  // sun shafts: strongest with a low sun, gone at night
  skySun.set(...L.sky.sunDir);
  aimRealSun(skySun);
  skySun.normalize();
  // smoke: a flat amber-brown sky down to the horizon, the stars gone
  const smokeSky = (c, k = 1) => c.map((v, i) => v + ([0.6, 0.42, 0.24][i] * (0.75 - 0.45 * nightness(lookMin())) - v) * smoke * k);
  W.sky.set({
    ...L.sky, sunDir: [skySun.x, skySun.y, skySun.z], amount: L.sky.amount * 0.45,
    ...(smoke ? { top: smokeSky(L.sky.top, 0.85), horizon: smokeSky(L.sky.horizon), cloud: smokeSky(L.sky.cloud), sun: smokeSky(L.sky.sun, 0.5), stars: (L.sky.stars ?? 0) * (1 - smoke) } : {}),
  });
  const low = skySun.y;
  raysLevel = THREE.MathUtils.smoothstep(low, -0.04, 0.06) * (0.35 + 1.05 * (1 - THREE.MathUtils.smoothstep(low, 0.2, 0.6)));
  raysColor.setRGB(...L.sun);
  // rim light: warm sunlight by day, cool neon-blue at night
  const nite = nightness(lookMin());
  RIM.color.value.setRGB(...L.sun).lerp(tmpColor.setRGB(0.55, 0.7, 1.25), nite);
  RIM.strength.value = 0.6 + nite * 0.15;
  W.clouds.set(L.sky.cloud, L.sky.shade, L.sky.amount * (live ? 0.35 + live.cloud * 1.1 : 1));
  // plowed streets go a slushy grey under snow
  W.road.setColor(tmpColor.setRGB(...L.road).lerp(snowRoad, SNOW.amount.value * 0.55));

  // weather: some nights it rains
  const night = nightness(lookMin()) > 0.75;
  if (night && !wasNight) rainyNight = Math.random() < 0.5;
  wasNight = night;
  // snow: on real snowy days (Live NYC), or ?weather=snow; it falls instead of rain
  const snow = params.get('weather') === 'snow' || (!!live?.snow && settings.rainOverride == null);
  if (snow !== W.weather.snowing) {
    W.weather.setSnow(snow);
    if (snow) {
      for (const g of [W.peds.group, W.regulars.group]) g.traverse((o) => (o.userData.noSnow = true));
      snowCover(W.root);
    }
  }
  const rain = !snow && (stormy() || (settings.rainOverride ?? (live ? live.rain : night && rainyNight)));
  if (rain !== settings.rain || force) {
    settings.rain = rain;
    W.weather.setEnabled(rain);
    audio.setRain(rain);
    W.road.setReflections(rain && settings.reflections);
    setWet(W.root, rain && settings.reflections);
  }
  W.wet = rain ? 1 : 0.05;
  CONES.strength.value = gfx.cones ? L.pools * (rain ? 1.7 : 0.8) : 0;

  materialTimer -= 1;
  if (force || materialTimer <= 0) {
    materialTimer = 30; // every ~half second is plenty for slow light changes
    updateMaterials(L, force);
  }
}

/** Facades brighter by day, windows and neon brighter by night, no specular anywhere. */
function updateMaterials(L, first) {
  W.root.traverse((o) => {
    if (first && o.userData.foliage) {
      setFoliage(o, seasonDay(params.get('season')) ?? dayOfYear());
      // the trees shedding today let their leaves go around you
      if (!W.leaves) {
        W.leaves = new FallingLeaves(o, (x, z) => W.groundAt(x, z) + heightAt(x, z));
        if (W.leaves.count) W.root.add(W.leaves.group);
      }
    }
    const m = o.material;
    if (!m || Array.isArray(m)) return;
    m.userData.onLight?.(L);
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
// N8AO renders the scene with soft contact shadows; without it a plain render pass does the job
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);
let ao = null;
function setAO(on) {
  if (on && !ao) {
    ao = new N8AOPass(scene, camera, innerWidth, innerHeight);
    Object.assign(ao.configuration, {
      aoRadius: 1.1, distanceFalloff: 0.5, intensity: 2.2, aoSamples: 12, denoiseSamples: 6, denoiseRadius: 10,
      halfRes: true, depthAwareUpsampling: true, gammaCorrection: false, color: new THREE.Color(0.12, 0.06, 0.1),
    });
    composer.insertPass(ao, 0);
  }
  if (ao) ao.enabled = on;
  renderPass.enabled = !on;
}
const aoDepth = () => (ao?.enabled ? ao.beautyRenderTarget.depthTexture : null);
// far streets and the sky as brush strokes (High and Ultra), before the ink goes on top
const paint = new PaintPass(camera, 3);
paint.depthSource = aoDepth;
paint.enabled = false;
composer.addPass(paint);
const outline = new OutlinePass(camera);
outline.depthSource = aoDepth;
composer.addPass(outline);
const godRays = new GodRaysPass(camera, LOW ? 20 : 40);
godRays.depthSource = aoDepth;
composer.addPass(godRays);
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.8, 0.55, 0.85);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const grade = new ShaderPass(GradeShader);
composer.addPass(grade);
// the texture pack's color grade (a LUT), applied to the finished picture the way it was graded in a photo editor
const lutPass = new LUTPass({ intensity: 1 });
lutPass.enabled = false;
composer.addPass(lutPass);
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
  // (the cinematic camera settles for a narrower slice, like a phone held up to film the street)
  const cine = gfx.camera !== 'classic';
  const minHorizontal = THREE.MathUtils.degToRad(cine ? 48 : 68);
  const needed = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(minHorizontal / 2) / camera.aspect));
  baseFov = THREE.MathUtils.clamp(needed, settings.fov ?? 58, cine ? 88 : 110);
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
      minute = st.live ? nycMinute() : st.minute;
      refreshLive(true);
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
  showCard(def, arrive);
  fade.classList.add('show');
  // give the fade a frame to paint before the heavy rebuild
  setTimeout(async () => {
    await loadDistrict(id, { arrive, onStatus: (text) => (fade.querySelector('span').textContent = text) });
    renderAlmanac();
    setTimeout(() => fade.classList.remove('show', 'card'), 350);
  }, 450);
}

function toggleDelivery() {
  if (W.deliveries.run) {
    W.deliveries.cancel();
    hud.toast('Delivery cancelled');
    return;
  }
  const msg = W.deliveries.start(player.pos.x, player.pos.z);
  hud.toast(msg ?? 'No orders around here right now');
  if (msg && player.mode === 'walk') setTimeout(() => W.deliveries.run && hud.toast('Tip: grab the bike (2) to get there in time'), 4500);
}
function tagWall() {
  const r = W.graffiti.spray();
  if (r) setTimeout(() => hud.toast(r.count === r.total ? `🎨 Every wall in ${W.def.name} is yours!` : `🎨 ${r.buffed ? `Went over ${r.buffed}. ` : ''}Walls: ${r.count} / ${r.total} in ${W.def.name}`), 1500);
}
/** Where a cab goes: the nearest memory not found yet, else today's postcard spot. */
function cabDestination() {
  let best = null;
  let bd = Infinity;
  for (const it of W.memories.items ?? []) {
    if (it.done) continue;
    const d = Math.hypot(it.g.position.x - player.pos.x, it.g.position.z - player.pos.z);
    if (d > 40 && d < bd) {
      bd = d;
      best = { x: it.g.position.x, z: it.g.position.z, label: 'the next memory' };
    }
  }
  const t = W.daily?.target;
  if (!best && t && !W.daily.solved) best = { x: t.x + t.nx * 3, z: t.z + t.nz * 3, label: "today's postcard spot" };
  return best;
}
function takeCab() {
  const dest = cabDestination();
  if (!dest) return;
  const fare = W.taxi.fare(dest);
  if (W.food.cash < fare) {
    hud.toast(`💸 The fare's about $${fare}: do a delivery (J) first`);
    return;
  }
  store.set('spent', store.get('spent', 0) + fare);
  store.set('cabs', store.get('cabs', 0) + 1);
  fade.querySelector('span').textContent = '🚕';
  fade.classList.add('show');
  setTimeout(() => {
    // out on the sidewalk a few steps from where you asked to go
    const [x, z] = W.city?.spot ? W.city.spot(dest.x + 2, dest.z + 2) : [dest.x + 2, dest.z + 2];
    player.pos.set(x, 0, z);
    player.vel?.set(0, 0, 0);
    W.taxi.drive();
    fade.classList.remove('show');
    fade.querySelector('span').textContent = '';
    hud.toast(`🚕 $${fare} with tip. Here's ${dest.label}.`);
  }, 900);
}
let sharedSpotUsed = false;
/** A link that opens the game right where you're standing. */
async function shareSpot() {
  const u = new URL(location.href);
  u.search = '';
  u.searchParams.set('district', W.def.id);
  u.searchParams.set('at', [player.pos.x.toFixed(1), player.pos.z.toFixed(1), player.yaw.toFixed(2)].join(','));
  const link = u.toString();
  try {
    await navigator.clipboard.writeText(link);
    hud.toast(`📍 Link copied: send it to a friend to meet here in ${W.def.name}`);
  } catch {
    hud.toast(`📍 ${link}`);
  }
}
function rentBike() {
  const msg = W.transit.rent();
  if (msg) hud.toast(msg);
  if (msg?.startsWith('🚲')) {
    ride('bike');
    achievements.bump('citibike');
  }
}

// ---------- the daily postcard ----------
let postcardIn = -1;
const postcardEl = document.getElementById('postcard');
/** Render the postcard view once, from across the street, then put the camera back. */
function snapPostcard() {
  const v = W.daily.view();
  const keep = { p: camera.position.clone(), q: camera.quaternion.clone() };
  camera.position.set(v.from[0], v.from[1] + heightAt(v.from[0], v.from[2]), v.from[2]);
  camera.lookAt(v.at[0], v.at[1] + heightAt(v.at[0], v.at[2]), v.at[2]);
  camera.updateMatrixWorld();
  composer.render();
  const src = renderer.domElement;
  const c = document.createElement('canvas');
  c.width = 360;
  c.height = 240;
  const ctx = c.getContext('2d');
  const sw = Math.min(src.width, src.height * 1.5);
  const sh = sw / 1.5;
  ctx.drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, 0, 0, c.width, c.height);
  camera.position.copy(keep.p);
  camera.quaternion.copy(keep.q);
  W.daily.image = c.toDataURL('image/jpeg', 0.85);
  postcardEl.querySelector('img').src = W.daily.image;
  showPostcard(true, 9000);
}
let postcardTimer = null;
function showPostcard(on, ms = 0) {
  if (!W.daily?.image) {
    if (on) hud.toast('📮 No postcard in this neighborhood today');
    return;
  }
  postcardEl.classList.toggle('show', on);
  postcardEl.classList.toggle('solved', !!W.daily.solved);
  clearTimeout(postcardTimer);
  if (on && ms) postcardTimer = setTimeout(() => postcardEl.classList.remove('show'), ms);
}
function openTravel() {
  if (!hasMetroCard()) {
    hud.toast('🎫 No MetroCard yet: find a memory in this neighborhood to earn one');
    return;
  }
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
// back up / restore everything the game saves in this browser (memories, walls, badges, settings...)
document.getElementById('backup').addEventListener('click', async (e) => {
  e.stopPropagation();
  const data = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith('nightwalker.')) data[k] = localStorage.getItem(k);
  }
  const json = JSON.stringify({ game: 'night-walker-nyc', saved: new Date().toISOString(), data });
  const name = `night-walker-progress-${new Date().toISOString().slice(0, 10)}.json`;
  const saver = await downloadsReady;
  if (saver) {
    saver.save({ filename: name, data: json }).catch((err) => err?.code !== 'declined' && hud.toast('Backing up isn\'t available here'));
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
});
const restoreFile = document.getElementById('restorefile');
document.getElementById('restore').addEventListener('click', (e) => {
  e.stopPropagation();
  restoreFile.click();
});
restoreFile.addEventListener('change', async () => {
  const f = restoreFile.files?.[0];
  restoreFile.value = '';
  if (!f) return;
  try {
    const backup = JSON.parse(await f.text());
    if (backup?.game !== 'night-walker-nyc' || typeof backup.data !== 'object') throw new Error('not a Night Walker backup');
    let n = 0;
    for (const [k, v] of Object.entries(backup.data)) {
      if (!k.startsWith('nightwalker.') || typeof v !== 'string') continue;
      localStorage.setItem(k, v);
      n++;
    }
    hud.toast(`Restored ${n} saved items. Reloading…`);
    setTimeout(() => location.reload(), 1200);
  } catch (err) {
    hud.toast(`Couldn't restore: ${err.message}`);
  }
});
document.getElementById('reset').addEventListener('click', (e) => {
  e.stopPropagation();
  W.memories.reset();
  hud.toast('Journal cleared');
});
input.addEventListener('start', () => {
  audio.start();
  overlay.classList.add('gone');
  // from now on the menu is the pause screen: a smaller logo, where you are, and Resume
  overlay.classList.add('paused');
  document.getElementById('start').textContent = 'Resume';
  // the title loop is for the first screen only; the pause menu shows the city itself
  if (overlay.classList.contains('intro')) {
    overlay.classList.remove('intro');
    setTimeout(() => hideClip(document.getElementById('titlevid')), 600);
  }
});
input.addEventListener('pause', () => {
  renderAlmanac();
  document.getElementById('eyebrow').textContent = `Paused · ${W?.def.name ?? 'New York'}`;
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
    case 'taxi': {
      const msg = W.taxi.hail(player);
      if (msg) hud.toast(msg);
      break;
    }
    case 'postcard':
      showPostcard(!postcardEl.classList.contains('show'));
      break;
    case 'action':
      if (W.atCab) takeCab();
      else if (W.nearEntrance) openTravel();
      else if (W.graffiti.near) tagWall();
      else if (W.nearEscape) climbEscape();
      else if (W.food.near) hud.toast(W.food.buy(player));
      else if (W.transit.near) rentBike();
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
  if (e.code === 'KeyP' && !e.repeat && (input.active || photo)) {
    togglePhoto();
    return;
  }
  if (photo) {
    if (e.code === 'Enter') captureNext = true;
    return;
  }
  if (e.code === 'KeyG' && !e.repeat && input.active) {
    hud.toast(ghosts?.wave() ? `👋 You waved${ghosts.count ? '' : ' (nobody else here right now)'}` : 'Turn on Ghost players in Settings to wave at other walkers');
    return;
  }
  if (e.code === 'KeyJ' && !e.repeat && input.active) {
    toggleDelivery();
    return;
  }
  if (e.code === 'KeyT' && !e.repeat && input.active) {
    const msg = W.taxi.hail(player);
    if (msg) hud.toast(msg);
    return;
  }
  if (e.code === 'KeyK' && !e.repeat && input.active) {
    showPostcard(!postcardEl.classList.contains('show'));
    return;
  }
  if (e.code === 'KeyN' && !e.repeat && input.active) {
    hud.toast(`📻 ${radio.next()}`);
    radioBtn.querySelector('.pname').textContent = `📻 ${radio.station.name}`;
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
      if (W.atCab) takeCab();
      else if (W.nearEntrance) openTravel();
      else if (W.graffiti.near) tagWall();
      else if (W.nearEscape) climbEscape();
      else if (W.food.near) hud.toast(W.food.buy(player));
      else if (W.transit.near) rentBike();
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
      hud.toast(!settings.realMap ? 'Real OpenStreetMap streets' : 'Drawn street grid');
      changeSetting('realMap', !settings.realMap);
      settingsUI.render();
      break;
    case 'KeyQ':
      changeSetting('reflections', !settings.reflections);
      settingsUI.render();
      hud.toast(settings.reflections ? 'Street reflections on' : 'Street reflections off (faster)');
      break;
    case 'KeyB':
      changeSetting('bloom', !settings.bloom);
      settingsUI.render();
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

// ---------- settings ----------
const savedGfx = store.get('gfx', {});
// v2: the cinematic camera came with a narrower default view; older saves keep their other choices
if ((savedGfx.v ?? 1) < 2) delete savedGfx.fov;
const gfx = { ...DEFAULTS, ...(LOW ? { preset: 'low', ...PRESETS.low } : {}), ...savedGfx, v: 2 };
settings.realMap = params.has('realmap') ? params.get('realmap') !== '0' : gfx.realMap;
function applyGfx() {
  quality.maxRatio = Math.min(devicePixelRatio, gfx.ratio);
  if (renderer.shadowMap.enabled !== gfx.shadows) {
    renderer.shadowMap.enabled = gfx.shadows;
    if (!gfx.shadows) sun.castShadow = false;
    scene.traverse((o) => {
      for (const m of [].concat(o.material ?? [])) m.needsUpdate = true;
    });
  }
  if (SHADOW_RES !== gfx.shadowRes) {
    SHADOW_RES = gfx.shadowRes;
    sun.shadow.mapSize.set(SHADOW_RES, SHADOW_RES);
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
  }
  setAO(gfx.ao);
  settings.reflections = gfx.reflections;
  if (W) {
    W.road.setReflections(settings.reflections && settings.rain);
    setWet(W.root, settings.reflections && settings.rain);
  }
  settings.bloom = gfx.bloom;
  bloom.enabled = gfx.bloom;
  grade.uniforms.printShift.value = gfx.print ? INK.printShift ?? 0 : 0;
  grade.uniforms.hatch.value = gfx.hatch ? INK.hatch ?? 0 : 0;
  grade.uniforms.shadowDots.value = gfx.hatch ? INK.shadowDots : 0;
  settings.comicWords = gfx.words;
  // reduce motion: calm camera, steady lines
  JUICE.calm = !!gfx.calm;
  if (W) W.graffiti.tagName = gfx.tag || '';
  outline.material.uniforms.wobble.value = gfx.boil && !gfx.calm ? 1.2 : 0;
  outline.material.uniforms.broken.value = gfx.boil && !gfx.calm ? 0.35 : 0;
  lutPass.enabled = !!shared.lut && gfx.lut !== false;
  paint.enabled = !!gfx.paint && !LOW;
  if (ghosts && W) {
    if (gfx.ghosts && !ghosts.room) ghosts.join(W.def.id);
    if (!gfx.ghosts && ghosts.room) ghosts.leave();
  }
  POSE_STEP.value = gfx.twos ? 1 / 12 : 0;
  LOOK.sensitivity = gfx.sensitivity;
  settings.fov = gfx.fov;
  player.cinematic = gfx.camera !== 'classic';
  audio.setVolume(gfx.volume);
  radio.setVolume(gfx.volume);
  document.body.classList.toggle('panels', !!gfx.panels);
  resize();
}
function changeSetting(key, value) {
  gfx[key] = value;
  if (key === 'preset') Object.assign(gfx, PRESETS[value]);
  else if (key in PRESETS.low) gfx.preset = 'custom';
  store.set('gfx', gfx);
  applyGfx();
  if (key === 'realMap' && W && settings.realMap !== value) {
    settings.realMap = value;
    goTo(W.def.id, false);
  }
}
const settingsUI = buildSettings(document.getElementById('settings'), gfx, changeSetting);
// menu tabs
for (const tab of document.querySelectorAll('.tabs button')) {
  tab.addEventListener('click', (e) => {
    e.stopPropagation();
    for (const t of document.querySelectorAll('.tabs button')) t.classList.toggle('on', t === tab);
    for (const p of document.querySelectorAll('.pane')) p.hidden = p.dataset.pane !== tab.dataset.tab;
    if (tab.dataset.tab === 'badges') achievements.render(document.getElementById('badges'));
    if (tab.dataset.tab === 'play') renderAlmanac();
  });
}

// ---------- start ----------
// the title screen: the hand-drawn logo and a looping street scene behind the menu
{
  const h1 = overlay.querySelector('h1');
  const logo = new Image();
  logo.alt = 'Night Walker';
  logo.onload = () => {
    h1.classList.add('logo');
    h1.replaceChildren(logo);
  };
  logo.src = 'media/logo.png';
  const tv = document.getElementById('titlevid');
  if (!params.has('shot')) {
    tv.addEventListener('playing', () => overlay.classList.add('ready'), { once: true });
    showClip(tv, 'title');
  }
}
applyInk();
applyGfx();
const firstDistrict = params.get('district') || store.get('district', 'astoria');
fade.querySelector('span').textContent = settings.realMap ? 'Loading real streets…' : '';
showCard(DISTRICTS[firstDistrict] ?? DISTRICTS.astoria);
fade.classList.add('show');
loadTexturePack(shared, './textures/', { small: LOW, renderer })
  .then((n) => {
    if (!n) return;
    console.info(`texture pack: ${n} hand-drawn sheets`);
    if (shared.lut) {
      lutPass.lut = shared.lut.texture;
      lutPass.intensity = shared.lut.intensity;
      lutPass.enabled = gfx.lut !== false;
    }
    // keep them across neighborhood changes
    for (const f of Object.values(shared.facade)) sharedTextures.add(f.map).add(f.emissiveMap);
    for (const t of [shared.storefront?.map, shared.storefront?.emissiveMap, shared.sidewalk, shared.asphalt, shared.roof, ...Object.values(shared.leaves ?? {})]) if (t) sharedTextures.add(t);
  })
  .then(() => loadDistrict(firstDistrict, { onStatus: (text) => (fade.querySelector('span').textContent = text) }))
  .then(() => {
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
  renderAlmanac();
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
  const now = performance.now() / 1000;
  if (slowTime > 1.5 && quality.scale > 0.5) {
    // dropping right after going up: this machine sits on the edge, so hold here for longer each time
    // (every change resizes the frame, which flickers; flipping up and down every few seconds was worse)
    if (now - resUp < 12) resHold = Math.min(600, resHold * 2);
    quality.scale = Math.max(0.5, quality.scale - 0.1);
    slowTime = 0;
    resDown = now;
    resize();
  } else if (fastTime > 5 && quality.scale < 1 && now - resDown > resHold) {
    quality.scale = Math.min(1, quality.scale + 0.05);
    fastTime = 0;
    resUp = now;
    resize();
  }
}
let resUp = -1e9;
let resDown = -1e9;
let resHold = 15;

// ---------- loop ----------
let t = Number(params.get('t') || 0) + 3;
let last = performance.now();
let frames = 0;
let fpsTime = 0;
let edgeCooldown = 0;
let portraitDone = false;
// how far you've walked: real meters on the real map (one unit is a meter), saved every few seconds
let walked = store.get('walked', 0);
let walkedSaved = walked;
const lastStep = new THREE.Vector3(NaN, 0, NaN);
let lastStepAt = 0;
addEventListener('pagehide', () => store.set('walked', Math.round(walked)));
function countSteps() {
  const p = player.pos;
  const now = performance.now();
  // real time since the last frame (the game's own step is clamped on slow frames)
  const real = Math.min(1, (now - lastStepAt) / 1000);
  lastStepAt = now;
  if (player.mode === 'walk' && !player.roof && Number.isFinite(lastStep.x)) {
    const d = Math.hypot(p.x - lastStep.x, p.z - lastStep.z);
    if (d < 10 * real + 0.05) walked += d; // faster than a sprint is a train or a cab, not walking
  }
  lastStep.set(p.x, 0, p.z);
  if (walked - walkedSaved > 25) {
    store.set('walked', Math.round(walked));
    walkedSaved = walked;
  }
}
// the drawn face from the character sheet (public/media/portrait.png); the 3D snapshot below is the fallback
{
  const face = new Image();
  face.onload = () => {
    document.getElementById('portrait').src = face.src;
    portraitDone = true;
  };
  face.src = 'media/portrait.png';
}

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

// ---------- what the hero glances at: an uncollected memory nearby, or someone passing close ----------
let interestTimer = 0;
// ---------- the almanac on the menu: tonight's real sky, air and trees for the neighborhood you're in
let manhattanhenge = null;
const fmtMin = (m) => {
  const h = Math.floor(m / 60) % 24;
  return `${((h + 11) % 12) + 1}:${String(Math.floor(m % 60)).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};
function renderAlmanac() {
  const el = document.getElementById('almanac');
  if (!el || !W) return;
  const ll = W.def.ll ?? [40.73, -73.99];
  const now = new Date();
  const rows = [];
  const { rise, set } = sunTimes(now, ...ll);
  rows.push(['☀️', `Sunrise ${fmtMin(rise)} · sunset ${fmtMin(set)}`]);
  const m = moonPosition(now, ...ll);
  rows.push(['🌙', `${phaseName(m)[0].toUpperCase()}${phaseName(m).slice(1)}, ${Math.round(m.lit * 100)}% lit · ${m.el > 0 ? 'up now' : 'below the horizon now'}`]);
  if (live) {
    const air = live.aqi != null ? ` · air ${aqiLabel(live.aqi)} (AQI ${live.aqi})` : '';
    rows.push(['🌡️', `${live.temp}°F, ${live.label}${air}`]);
  }
  // the trees on this map, by species
  let crowns = null;
  W.root.traverse((o) => {
    if (o.userData.foliage) crowns = o;
  });
  const f = crowns?.userData.species?.some(Boolean) ? foliageNow(crowns.userData.species, seasonDay(params.get('season')) ?? dayOfYear()) : null;
  const names = (l) => l.map((s) => s.replace(/\b(\w)/g, (c) => c.toUpperCase())).join(', ');
  if (f?.bloom.length) rows.push(['🌸', `In bloom on these streets: ${names(f.bloom)}`]);
  if (f?.peak.length) rows.push(['🍂', `Peak color here: ${names(f.peak)}`]);
  else if (f?.turning.length) rows.push(['🍁', `Turning here: ${names(f.turning)}`]);
  manhattanhenge ??= nextHenges(299, 40.758, -73.985).find((h) => h.kind === 'sunset');
  if (manhattanhenge) rows.push(['🌇', `Next Manhattanhenge: ${nycWhen(manhattanhenge.when)}`]);
  el.replaceChildren(...rows.map(([icon, text]) => {
    const r = document.createElement('div');
    r.className = 'a-row';
    r.innerHTML = '<b></b><span></span>';
    r.querySelector('b').textContent = icon;
    r.querySelector('span').textContent = text;
    return r;
  }));
  const src = document.createElement('small');
  src.textContent = 'The real sun and moon for this spot; trees from the NYC street tree census.';
  el.append(src);
}

// ---------- street-henge: the real sun lined up with the street you're on
const henge = { next: 0, still: 0, shown: new Set(), seen: new Set(), cache: new Map(), last: null, toastAt: -1e9, stillSince: null };
/** A direction on the real map (unit [x, z]) as a compass bearing, degrees clockwise from north. */
function compassOf(dir) {
  const n = bearing(0);
  const e = bearing(90);
  if (!n || !e) return null;
  return ((Math.atan2(dir[0] * e[0] + dir[1] * e[1], dir[0] * n[0] + dir[1] * n[1]) * 180) / Math.PI + 360) % 360;
}
function updateHenge() {
  if (!W.city?.streetHere || !W.def.ll) return;
  // in real seconds (slow frames still count)
  const now = performance.now() / 1000;
  if (Math.hypot(player.vel.x, player.vel.z) >= 0.3) henge.stillSince = now;
  henge.stillSince ??= now;
  if (now < henge.next) return;
  henge.next = now + 1;
  henge.still = now - henge.stillSince;
  const st = player.roof ? null : W.city.streetHere(player.pos.x, player.pos.z);
  if (!st || st.straight < 180) return;
  const az = compassOf(st.dir);
  if (az == null) return;
  const name = st.name;
  const big = W.def.borough === 'Manhattan' ? 'MANHATTANHENGE' : 'STREETHENGE';
  // right now (Live time: the real sun): the sun sitting at the end of the street
  const off = isLive() ? hengeNow(az, ...W.def.ll) : null;
  const today = new Date().toDateString();
  if (off != null && off < 1.2 && !henge.seen.has(`${name}|${today}`)) {
    henge.seen.add(`${name}|${today}`);
    hud.banner(`${big}!`, `The sun, right down ${name}`);
    hud.toast(`☀️ The real sun is lined up with ${name} right now: look down the street`, 6000);
    store.set('henge', store.get('henge', 0) + 1);
    JUICE.hit(0.2);
    return;
  }
  // standing still on a long straight street: when does the sun line up with it?
  if (henge.still < 3 || henge.shown.has(name) || now - henge.toastAt < 90) return;
  const key = `${name}|${Math.round(az)}`;
  if (!henge.cache.has(key)) henge.cache.set(key, nextHenges(az, ...W.def.ll));
  const list = henge.cache.get(key);
  henge.shown.add(name);
  if (!list.length) return;
  const sunset = list.find((h) => h.kind === 'sunset') ?? list[0];
  henge.toastAt = now;
  hud.toast(`☀️ ${name} lines up with the ${sunset.kind}: next on ${nycWhen(sunset.when)}`, 6000);
}

function pickInterest(dt) {
  interestTimer -= dt;
  if (interestTimer > 0) return;
  interestTimer = 0.3;
  const px = player.pos.x;
  const pz = player.pos.z;
  let best = null;
  let bd = 9;
  for (const it of W.memories.items) {
    if (it.done) continue;
    const d = Math.hypot(it.g.position.x - px, it.g.position.z - pz);
    if (d < bd) {
      bd = d;
      best = { x: it.g.position.x, z: it.g.position.z };
    }
  }
  if (!best) {
    bd = 4;
    for (const p of W.peds.peds) {
      if (!p.last || p.hidden) continue;
      const d = Math.hypot(p.last.x - px, p.last.z - pz);
      if (d < bd && d > 0.6) {
        bd = d;
        best = { x: p.last.x, z: p.last.z };
      }
    }
  }
  player.interest = player.mode === 'walk' ? best : null;
}

document.getElementById('deliverybtn').addEventListener('click', (e) => {
  e.stopPropagation();
  toggleDelivery();
});
document.getElementById('sharebtn').addEventListener('click', (e) => {
  e.stopPropagation();
  shareSpot();
});
const radioBtn = document.getElementById('radiobtn');
radioBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  radioBtn.querySelector('.pname').textContent = `📻 ${radio.next()}`;
});
let liftTimer = 0;

// ---------- photo mode ----------
let photo = null;
let captureNext = false;
const challenges = new PhotoChallenges(store);
const photoList = document.getElementById('photolist');
function renderPhotoList() {
  photoList.replaceChildren();
  const h = document.createElement('h4');
  h.textContent = challenges.complete ? `${W.def.name}: all shot!` : `Shoot ${W.def.name}`;
  photoList.append(h);
  for (const c of challenges.list) {
    const row = document.createElement('div');
    const st = document.createElement('span');
    st.className = 'stars';
    st.textContent = '★'.repeat(c.stars) + '☆'.repeat(3 - c.stars);
    const t = document.createElement('span');
    t.textContent = c.label;
    if (c.stars === 3) t.className = 'done';
    row.append(st, t);
    photoList.append(row);
  }
}
document.getElementById('snap').addEventListener('click', (e) => {
  e.stopPropagation();
  if (photo) captureNext = true;
});
document.getElementById('photoexit').addEventListener('click', (e) => {
  e.stopPropagation();
  if (photo) togglePhoto();
});
function togglePhoto() {
  if (photo) {
    photo = null;
    document.body.classList.remove('photo');
    return;
  }
  camEuler.setFromQuaternion(camera.quaternion, 'YXZ');
  photo = {
    yaw: camEuler.y, pitch: THREE.MathUtils.clamp(camEuler.x, -1.2, 0.5), dist: 4,
    target: new THREE.Vector3(player.pos.x, player.ground + 1.3, player.pos.z),
  };
  document.body.classList.add('photo');
  renderPhotoList();
}
addEventListener('wheel', (e) => {
  if (photo) photo.dist = THREE.MathUtils.clamp(photo.dist * (e.deltaY > 0 ? 1.1 : 0.9), 1.2, 40);
}, { passive: true });
const photoMove = new THREE.Vector3();
function photoFrame(dt) {
  const look = input.consumeLook();
  photo.yaw -= look.x * 0.004;
  photo.pitch = THREE.MathUtils.clamp(photo.pitch - look.y * 0.004, -1.45, 1.2);
  // slide the focus point around with WASD
  const a = input.axes();
  photoMove.set(-Math.sin(photo.yaw) * a.y + Math.cos(photo.yaw) * a.x, 0, -Math.cos(photo.yaw) * a.y - Math.sin(photo.yaw) * a.x);
  photo.target.addScaledVector(photoMove, dt * 6);
  const cp = Math.cos(photo.pitch);
  camera.position.set(
    photo.target.x + Math.sin(photo.yaw) * cp * photo.dist,
    Math.max(0.3, photo.target.y - Math.sin(photo.pitch) * photo.dist),
    photo.target.z + Math.cos(photo.yaw) * cp * photo.dist,
  );
  const ht = heightAt(photo.target.x, photo.target.z);
  camera.position.y += ht;
  camera.lookAt(photo.target.x, photo.target.y + ht, photo.target.z);
}
/** Save the frame that was just drawn as a comic panel: a white border, an ink frame, a caption box. */
// the claude.ai viewer's save prompt, when the page runs there (null everywhere else)
// offline play (built site only; not inside the claude.ai viewer, which hosts its own copy)
if (import.meta.env.PROD && 'serviceWorker' in navigator && !window.claude && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
const downloadsReady = window.claude?.use ? window.claude.use('downloads').catch(() => null) : Promise.resolve(null);
function savePhoto() {
  // the challenges look at exactly what this frame shows
  const got = challenges.shoot(camera);
  if (got.length) {
    const best = got.map((c) => `${c.label} ${'★'.repeat(c.stars)}`).join(' · ');
    hud.toast(challenges.complete ? `Photo set complete! ${best}` : `Got it: ${best}`);
    renderPhotoList();
  }
  const src = renderer.domElement;
  const pad = Math.round(src.width * 0.025);
  const panel = document.createElement('canvas');
  panel.width = src.width + pad * 2;
  panel.height = src.height + pad * 2;
  const ctx = panel.getContext('2d');
  ctx.fillStyle = '#f7f1df';
  ctx.fillRect(0, 0, panel.width, panel.height);
  ctx.drawImage(src, pad, pad);
  ctx.lineWidth = Math.max(4, pad * 0.25);
  ctx.strokeStyle = '#111';
  ctx.strokeRect(pad, pad, src.width, src.height);
  const caption = `${W.def.name}, ${W.def.borough} · ${document.getElementById('clock')?.textContent ?? ''}`.toUpperCase();
  const fs = Math.round(src.height * 0.032);
  ctx.font = `600 ${fs}px Oswald, "Arial Narrow", sans-serif`;
  const cw = ctx.measureText(caption).width + fs;
  ctx.fillStyle = '#f5c518';
  ctx.fillRect(pad * 1.6, pad * 1.6, cw, fs * 1.6);
  ctx.strokeRect(pad * 1.6, pad * 1.6, cw, fs * 1.6);
  ctx.fillStyle = '#111';
  ctx.textBaseline = 'middle';
  ctx.fillText(caption, pad * 1.6 + fs / 2, pad * 1.6 + fs * 0.82);
  panel.toBlob(async (blob) => {
    if (!blob) return;
    const name = `night-walker-${W.def.id}-${Date.now()}.png`;
    // inside the claude.ai viewer a page can't download by itself: it asks the viewer to save the file
    const saver = await downloadsReady;
    if (saver) {
      try {
        await saver.save({ filename: name, data: blob });
      } catch (e) {
        if (e?.code !== 'declined') hud.toast('📷 Saving photos isn\'t available here');
      }
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }, 'image/png');
  const f = document.getElementById('flash');
  f.classList.remove('go');
  void f.offsetWidth;
  f.classList.add('go');
  audio.chime?.();
}

// ---------- ride dial and mission hint ----------
const dialEl = document.getElementById('dial');
const dialIcon = document.getElementById('dial-icon');
const RIDE_ICONS = { walk: '🚶', bike: '🚲', moto: '🏍️', suv: '🚙' };
let hintTimer = 0;
function updateDial(dt) {
  const v = player.mode === 'walk' ? Math.hypot(player.vel.x, player.vel.z) : Math.abs(player.speed);
  const max = player.mode === 'walk' ? 7 : MODES[player.mode].max;
  dialEl.style.setProperty('--spd', Math.min(1, v / max).toFixed(3));
  dialEl.style.setProperty('--nrg', player.stamina.toFixed(3));
  const icon = RIDE_ICONS[player.mode];
  if (dialIcon.textContent !== icon) dialIcon.textContent = icon;
  // the mission line under the objective: the nearest memory and how far
  hintTimer -= dt;
  if (hintTimer > 0) return;
  hintTimer = 0.5;
  let best = null;
  let bd = Infinity;
  for (const it of W.memories.items) {
    if (it.done) continue;
    const d = Math.hypot(it.g.position.x - player.pos.x, it.g.position.z - player.pos.z);
    if (d < bd) {
      bd = d;
      best = it;
    }
  }
  const hint = document.getElementById('hint');
  const text = W.deliveries.hint(player) ?? (best ? `Nearest: ${best.mem.title} · ${bd < 1000 ? `${Math.round(bd / 10) * 10} m` : `${(bd / 1000).toFixed(1)} km`}` : 'All memories found. Take the train somewhere new.');
  if (hint.textContent !== text) hint.textContent = text;
}
document.getElementById('pausebtn').addEventListener('click', (e) => {
  e.stopPropagation();
  input.pause();
});

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
let lastDoors = -1e9;

function frame(now) {
  // rAF can hand us a timestamp from before a long rebuild; never run time backwards
  const raw = Math.max(0, Math.min(0.05, (now - last) / 1000));
  // hitstop: the world all but stops for a beat
  let dt = raw;
  if (JUICE.hitstop > 0) {
    JUICE.hitstop -= raw;
    dt = raw * 0.05;
  }
  last = now;
  t += dt;

  if (photo) {
    // the world holds still; only the camera moves
    photoFrame(dt);
    W.sky.update(t, camera);
    W.clouds.update(camera);
    updateMoon(0);
    composer.render();
    if (captureNext) {
      captureNext = false;
      savePhoto();
    }
    requestAnimationFrame(frame);
    return;
  }
  if (isLive()) {
    minute = nycMinute();
    liveTimer -= dt;
    if (liveTimer <= 0) refreshLive();
  } else minute = (minute + dt * MINUTES_PER_SECOND) % 1440;
  applyTime();
  if (stormy() && settings.rain) {
    boltIn -= dt;
    if (boltIn <= 0) {
      boltIn = 7 + Math.random() * 18;
      flash = 1;
      const near = Math.random();
      audio.thunder(0.6 + (1 - near) * 3.5, near);
      strike(near);
    }
  }
  if (flash > 0) {
    // a double flicker, like a real strike
    const f = flash > 0.7 || (flash > 0.35 && flash < 0.5) ? flash : flash * 0.3;
    renderer.toneMappingExposure *= 1 + f * (gfx.calm ? 0.5 : 2.2); // gentler flashes with Reduce motion
    flash = Math.max(0, flash - dt * 3.5);
    bolt.material.opacity = f > 0.3 ? 1 : f * 2;
    bolt.visible = flash > 0;
  }
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
  player.tricks.update(dt);
  if (terrainOn()) {
    // the world is drawn on the hills; the camera rides up with the hero, and never under the ground
    // (in fly mode the camera is placed by hand, so leave it be)
    if (!params.has('fly')) {
      camera.position.y += heightAt(player.pos.x, player.pos.z);
      const under = heightAt(camera.position.x, camera.position.z) + 0.5;
      if (camera.position.y < under) camera.position.y = under;
    }
    liftTimer -= dt;
    if (liftTimer <= 0) {
      liftTimer = 1;
      liftAll(scene); // things made since (a new graffiti piece, a delivery beam)
    }
  }
  W.buildings.update(t, dt);
  W.streets.update(t);
  W.elevated.update(dt);
  W.traffic.update(t, dt, player, camera);
  W.weather.update(dt, camera.position);
  W.memories.update(t, dt, camera.position);
  W.peds.update(dt, camera.position, player, settings.rain);
  W.pigeons.update(t, dt, player);
  W.rats.update(t, dt, player, nightness(lookMin()));
  W.leaves?.update(dt, camera.position);
  updateHenge();
  countSteps();
  W.spray.update(dt, camera.position, player);
  if (!player.roof) W.knock.update(dt, player, MODES[player.mode].radius);
  pickInterest(dt);
  W.graffiti.update(dt, t, player);
  W.plaques.update(player, !audio.muted);
  W.regulars.update(dt, t, player);
  W.soundscape.update(dt, camera, minute);
  // snow settles over a minute or so, and melts off slower
  SNOW.amount.value += ((W.weather.snowing ? 0.85 : 0) - SNOW.amount.value) * Math.min(1, dt * (W.weather.snowing ? 0.03 : 0.01));
  W.food.update(dt, player);
  W.taxi.update(dt, player);
  W.ferries.update(dt);
  ghosts?.update(dt, player);
  const delivered = W.deliveries.update(dt, t, player);
  if (delivered) hud.toast(delivered);
  heroLight.position.set(camera.position.x, player.ground + 2.4, camera.position.z);
  if (sun.castShadow) {
    // center the shadows ahead of where you look, snapped to shadow texels so edges don't crawl
    camera.getWorldDirection(shadowFwd);
    shadowFwd.y = 0;
    shadowFwd.normalize();
    shadowCenter.set(player.pos.x, heightAt(player.pos.x, player.pos.z), player.pos.z).addScaledVector(shadowFwd, SHADOW_HALF * 0.55);
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
  updateMoon(dt);
  W.road.update(t, W.weather.intensity * W.wet);

  const pos = camera.position;
  comicSounds(dt);
  // the doors closing at the station you're standing by: the chime and the announcement
  const dep = W.elevated.events.departed;
  if (dep && dep.distanceTo(pos) < 45 && !audio.muted) {
    audio.doors();
    if (window.speechSynthesis && performance.now() - lastDoors > 20000) {
      lastDoors = performance.now();
      const u = new SpeechSynthesisUtterance('Stand clear of the closing doors, please.');
      const us = speechSynthesis.getVoices().filter((v) => /^en[-_]US/i.test(v.lang));
      if (us.length) u.voice = us[0];
      u.rate = 1.05;
      u.volume = 0.7 * audio.volume;
      setTimeout(() => speechSynthesis.speak(u), 400);
    }
  }
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
  W.transit.update(dt, player, near);
  if (postcardIn > 0 && --postcardIn === 0 && !photo) snapPostcard();
  if (W.daily.update(dt, player) === 'solved') showPostcard(true, 6000);
  postcardEl.querySelector('.heat').textContent = W.daily.solved ? '✅ Solved, come back tomorrow' : W.daily.heat;
  errands.update(dt, errandsEl);
  achievements.update(dt, {
    minute, roof: !!player.roof, golden: lookMin() >= 1050 && lookMin() <= 1170 && !settings.rain,
    // a real full moon, up, on a real night out (live mode)
    fullMoon: isLive() && moonNow?.lit > 0.97 && moonNow.el > 5 && nightness(lookMin()) > 0.6,
  });
  const stationName = near?.name.replace(/–/g, '-');
  const card = hasMetroCard();
  hud.setPrompt(near && input.active && !IS_TOUCH ? (card ? `Press E to take ${W.def.el.ride} from ${stationName}` : 'Find a memory to earn a MetroCard for the trains') : '');
  const climbLabel = fe ? (player.roof ? 'Climb down' : 'Climb') : '';
  input.setAction(near && input.active ? `Take ${W.def.el.ride}` : climbLabel);
  if (fe && !IS_TOUCH && input.active) hud.setPrompt(`Press E to ${player.roof ? 'climb down' : 'climb the fire escape'}`);
  if (!near && W.graffiti.near && input.active) {
    input.setAction('Tag');
    if (!IS_TOUCH) hud.setPrompt(W.graffiti.near.rival ? `Press E to go over ${W.graffiti.near.rival}` : 'Press E to tag this wall');
  }
  const atCab = W.taxi.waiting && Math.hypot(player.pos.x - W.taxi.stop.x, player.pos.z - W.taxi.stop.z) < W.taxi.reach;
  W.atCab = atCab;
  if (atCab && input.active) {
    const dest = cabDestination();
    input.setAction('Ride');
    if (!IS_TOUCH) hud.setPrompt(dest ? `Press E to ride to ${dest.label} ($${W.taxi.fare(dest)})` : 'Nowhere left to go: every memory here is found');
  }
  if (!near && !fe && !W.graffiti.near && !atCab && W.food.near && input.active) {
    input.setAction('Eat');
    if (!IS_TOUCH) hud.setPrompt(W.food.prompt);
  }
  if (!near && !fe && W.transit.near && input.active) {
    input.setAction('Citi Bike');
    if (!IS_TOUCH) hud.setPrompt('Press E to unlock a Citi Bike');
  }
  hud.setSpeed(player.mode === 'walk' ? 0 : player.mph);
  hud.setRide(MODES[player.mode].name, player.mode);

  // comic-movie touches: speed lines and a wider lens as you pick up speed
  const rush = gfx.calm ? 0 : player.rush; // no speed lines or lens kick with Reduce motion
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
  updateDial(dt);
  staminaBar.parentElement.classList.toggle('low', player.stamina < 0.25);
  if (player.hero && !portraitDone && frames > 5) portraitDone = renderPortrait();
  hud.setLocation((W.describe ?? describeLocation)(player.pos.x, player.pos.z, { roof: !!player.roof }));
  hud.setClock(minute * 6);
  grade.uniforms.time.value = t;
  godRays.setSun(skySun, gfx.shafts ? raysLevel * (settings.rain ? 0.3 : 1) : 0, raysColor);
  // drops on the lens when it's raining and you're out in it (not in the SUV)
  const lensTarget = gfx.lensRain && settings.rain && player.mode !== 'suv' && !player.roofCovered ? 1 : 0;
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
window.__nightwalker = { scene, camera, renderer, player, input, quality, minimap, hud, heightAt, audio, moon: () => ({ ...moonNow, name: moonNow && phaseName(moonNow), canvas: moon.canvas, group: moon.group }), get world() { return W; }, loadDistrict, challenges, setMinute: (m) => { minute = m; applyTime(true); } };
