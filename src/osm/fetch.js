// Live OpenStreetMap data from the Overpass API, fetched in the player's browser and cached.

export const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const CACHE = 'nightwalker-osm-v1';

/** The only tags the game reads; everything else is dropped from bundled copies. */
export const KEEP_TAGS = new Set([
  'highway', 'name', 'building', 'height', 'building:levels', 'min_height', 'building:min_level', 'shop', 'amenity',
  'roof:shape', 'leisure', 'landuse', 'natural', 'waterway', 'railway', 'bridge', 'tunnel', 'layer', 'covered', 'area',
  'service', 'access', 'oneway', 'junction', 'lanes', 'width', 'footway', 'type',
  'cuisine', 'opening_hours', 'brand', // shop signs
]);

/** Shrink an Overpass response: fewer tags, fewer digits. */
export function compact(data) {
  const elements = data.elements.map((e) => {
    const o = { type: e.type, id: e.id };
    if (e.type === 'node') {
      o.lat = Math.round(e.lat * 1e6) / 1e6;
      o.lon = Math.round(e.lon * 1e6) / 1e6;
    }
    if (e.nodes) o.nodes = e.nodes;
    if (e.members) o.members = e.members.map((m) => ({ type: m.type, ref: m.ref, role: m.role }));
    if (e.tags) {
      const t = {};
      for (const [k, v] of Object.entries(e.tags)) if (KEEP_TAGS.has(k)) t[k] = v;
      if (Object.keys(t).length) o.tags = t;
    }
    return o;
  });
  return { elements };
}

export function bboxAround(lat, lon, radius) {
  const dLat = radius / 110540;
  const dLon = radius / (111320 * Math.cos((lat * Math.PI) / 180));
  return [lat - dLat, lon - dLon, lat + dLat, lon + dLon];
}

/** Amenities that hang a sign over the sidewalk. */
export const AMENITIES = 'restaurant|cafe|bar|fast_food|pharmacy|bank|pub|ice_cream|laundry|dentist|doctors|clinic|cinema|theatre|post_office|library|nightclub|bureau_de_change|money_transfer';

export function query([s, w, n, e]) {
  const b = `${s.toFixed(6)},${w.toFixed(6)},${n.toFixed(6)},${e.toFixed(6)}`;
  return `[out:json][timeout:90];
(
  way["highway"]["highway"!~"^(footway|path|steps|cycleway|corridor|elevator|platform|proposed|construction|bridleway)$"](${b});
  way["highway"~"^(footway|path|steps)$"]["footway"!~"^(sidewalk|crossing)$"]["area"!="yes"](${b});
  way["building"](${b});
  relation["building"]["type"="multipolygon"](${b});
  way["leisure"~"^(park|playground|pitch|garden|dog_park)$"](${b});
  way["landuse"~"^(grass|cemetery|recreation_ground|village_green)$"](${b});
  way["natural"~"^(water|wood|scrub|coastline|beach|sand)$"](${b});
  relation["natural"="beach"](${b});
  relation["natural"="water"](${b});
  relation["leisure"="park"](${b});
  way["railway"~"^(subway|rail|light_rail)$"](${b});
  node["highway"~"^(traffic_signals|street_lamp)$"](${b});
  node["natural"="tree"](${b});
  node["railway"~"^(station|subway_entrance)$"](${b});
  node["shop"]["name"](${b});
  way["shop"]["name"](${b});
  node["amenity"~"^(${AMENITIES})$"]["name"](${b});
  way["amenity"~"^(${AMENITIES})$"]["name"](${b});
);
out body;
>;
out skel qt;`;
}

async function withTimeout(promise, ms, controller) {
  let timer;
  const t = new Promise((_, rej) => {
    timer = setTimeout(() => {
      controller?.abort();
      rej(new Error('timeout'));
    }, ms);
  });
  try {
    return await Promise.race([promise, t]);
  } finally {
    clearTimeout(timer);
  }
}

async function cacheGet(key) {
  try {
    if (!('caches' in self)) return null;
    const c = await caches.open(CACHE);
    const r = await c.match(key);
    return r ? await r.json() : null;
  } catch {
    return null;
  }
}

async function cachePut(key, data) {
  try {
    if (!('caches' in self)) return;
    const c = await caches.open(CACHE);
    await c.put(key, new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } }));
  } catch {
    // storage full or blocked: fine, we fetch again next time
  }
}

/**
 * Real streets and buildings around (lat, lon). Tries, in order: a bundled file
 * (./osm/<id>.json, if the site ships one), the browser cache, then the Overpass mirrors.
 */
export async function loadOSM({ id, lat, lon, radius, override, onStatus = () => {}, onBytes = () => {}, signal }) {
  if (override) {
    const r = await fetch(override);
    if (!r.ok) throw new Error(`override ${r.status}`);
    return r.json();
  }
  const key = `https://nightwalker.local/osm/${id}/${lat.toFixed(5)},${lon.toFixed(5)},${radius}`;
  try {
    const r = await withTimeout(fetch(`./osm/${id}.json`), 6000);
    if (r.ok && (r.headers.get('content-type') || '').includes('json')) return JSON.parse(await readText(r, onBytes));
  } catch {
    // no bundled copy
  }
  const cached = await cacheGet(key);
  if (cached) return cached;
  const body = `data=${encodeURIComponent(query(bboxAround(lat, lon, radius)))}`;
  onStatus('Downloading real streets from OpenStreetMap…');
  const data = await raceMirrors(body, signal, onBytes);
  cachePut(key, data);
  return data;
}

/** Read a response body, reporting bytes as they arrive. */
async function readText(r, onBytes) {
  if (!r.body?.getReader) return r.text();
  const reader = r.body.getReader();
  const chunks = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    n += value.length;
    onBytes(n);
  }
  const all = new Uint8Array(n);
  let o = 0;
  for (const c of chunks) {
    all.set(c, o);
    o += c.length;
  }
  return new TextDecoder().decode(all);
}

/**
 * Ask one Overpass server; if it hasn't answered in a few seconds, ask the next one too,
 * and take whichever answers first. Busy servers are common, so this beats waiting in line.
 */
function raceMirrors(body, signal, onBytes) {
  return new Promise((resolve, reject) => {
    const controllers = [];
    let started = 0;
    let failed = 0;
    let done = false;
    let best = 0;
    let lastErr = null;
    const finish = (fn, v) => {
      if (done) return;
      done = true;
      for (const c of controllers) c.abort();
      fn(v);
    };
    const start = () => {
      if (done || started >= MIRRORS.length) return;
      const url = MIRRORS[started++];
      const c = new AbortController();
      controllers.push(c);
      const timer = setTimeout(() => c.abort(), 90000);
      (async () => {
        const r = await fetch(url, { method: 'POST', body, headers: { 'content-type': 'application/x-www-form-urlencoded' }, signal: c.signal });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const text = await readText(r, (n) => {
          if (n > best) onBytes((best = n));
        });
        const data = JSON.parse(text);
        if (!data?.elements?.length) throw new Error('empty');
        return data;
      })().then(
        (data) => {
          clearTimeout(timer);
          controllers.splice(controllers.indexOf(c), 1);
          finish(resolve, data);
        },
        (e) => {
          clearTimeout(timer);
          lastErr = e;
          failed++;
          if (started < MIRRORS.length) start();
          else if (failed >= started) finish(reject, lastErr);
        },
      );
    };
    signal?.addEventListener('abort', () => finish(reject, new Error('skipped')));
    start();
    setTimeout(start, 6000);
    setTimeout(start, 15000);
  });
}
