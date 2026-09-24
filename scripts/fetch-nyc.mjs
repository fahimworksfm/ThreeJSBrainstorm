// Pulls NYC Open Data for each neighborhood into public/nyc/<id>.json (run by the OSM data workflow):
// real building heights and construction years, the street tree census, and restaurant inspection grades.
// Never fails the build; a neighborhood it can't fetch simply has no file, and the game falls back to OSM.
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { bboxAround } from '../src/osm/fetch.js';

const RADIUS = 760; // keep in step with FETCH_RADIUS in src/main.js
const out = process.argv[2] ?? 'public/nyc';
const only = process.argv.slice(3);
mkdirSync(out, { recursive: true });
const HOST = 'https://data.cityofnewyork.us/resource';
const DATASETS = { buildings: '5zhs-2jue', trees: 'uvpi-gqnh', restaurants: '43nn-pn8j', bikes: 'mzxg-pwib', films: 'tg4x-b46p' };
// the MTA publishes on the state portal
const NY_HOST = 'https://data.ny.gov/resource';
const ENTRANCES = 'i9wp-a4ja';

const districts = [];
for (const f of readdirSync('src/districts')) {
  if (f === 'index.js') continue;
  const src = readFileSync(`src/districts/${f}`, 'utf8');
  const id = src.match(/\bid: '([^']+)'/)?.[1];
  const ll = src.match(/\bll: \[([-\d.]+), ([-\d.]+)\]/);
  const borough = src.match(/\bborough: '([^']+)'/)?.[1];
  if (id && ll && (!only.length || only.includes(id))) districts.push({ id, lat: Number(ll[1]), lon: Number(ll[2]), boro: borough });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(120000), headers: { accept: 'application/json' } });
      if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
      return await r.json();
    } catch (e) {
      console.log(`  retry ${i + 1}: ${e.message}`);
      await sleep(3000 * (i + 1));
    }
  }
  return null;
}
/** All rows of a query, 50,000 at a time. */
async function all(id, params, host = HOST) {
  const rows = [];
  for (let offset = 0; ; offset += 50000) {
    const q = new URLSearchParams({ ...params, $limit: '50000', $offset: String(offset) });
    const page = await get(`${host}/${id}.json?${q}`);
    if (!page) return rows.length ? rows : null;
    rows.push(...page);
    if (page.length < 50000) return rows;
  }
}
/** Column names change between dataset versions: find them from a sample row. */
const fields = {};
async function schema(key, host = HOST, id = DATASETS[key]) {
  if (fields[key]) return fields[key];
  const [row] = (await get(`${host}/${id}.json?$limit=1`)) ?? [];
  if (!row) return null;
  const keys = Object.keys(row);
  const find = (re) => keys.find((k) => re.test(k));
  const geo = keys.find((k) => row[k] && typeof row[k] === 'object' && row[k].type);
  fields[key] = { keys, geo, find };
  console.log(`nyc: ${key} columns: ${keys.join(', ')}`);
  return fields[key];
}

const r5 = (v) => Math.round(v * 1e5) / 1e5;
function centroid(geom) {
  // the first ring of the (multi)polygon is enough for a building footprint
  let ring = geom?.coordinates;
  while (Array.isArray(ring?.[0]?.[0])) ring = ring[0];
  if (!ring?.length) return null;
  let x = 0;
  let y = 0;
  for (const [lon, lat] of ring) {
    x += lon;
    y += lat;
  }
  return [x / ring.length, y / ring.length];
}

async function buildings(box) {
  const f = await schema('buildings');
  if (!f?.geo) return null;
  const height = f.find(/^height_?roof$/i) ?? f.find(/height/i);
  const year = f.find(/cnstrct|construct/i);
  const [s, w, n, e] = box;
  const rows = await all(DATASETS.buildings, { $select: [f.geo, height, year].filter(Boolean).join(','), $where: `within_box(${f.geo}, ${n}, ${w}, ${s}, ${e})` });
  if (!rows) return null;
  // [lon, lat, roof height in meters, year built]
  return rows
    .map((b) => {
      const c = centroid(b[f.geo]);
      const h = Number(b[height]) * 0.3048;
      return c ? [r5(c[0]), r5(c[1]), Math.round((h || 0) * 10) / 10, Number(b[year]) || 0] : null;
    })
    .filter(Boolean);
}

async function trees(box) {
  const f = await schema('trees');
  if (!f) return null;
  const lat = f.find(/^latitude$/i);
  const lon = f.find(/^longitude$/i);
  const species = f.find(/spc_common/i);
  const dbh = f.find(/tree_dbh/i);
  const status = f.find(/^status$/i);
  const [s, w, n, e] = box;
  const where = lat && lon ? `${lat} between ${s} and ${n} and ${lon} between ${w} and ${e}` : `within_box(${f.geo}, ${n}, ${w}, ${s}, ${e})`;
  const rows = await all(DATASETS.trees, { $select: [lat, lon, species, dbh, status, !lat && f.geo].filter(Boolean).join(','), $where: where });
  if (!rows) return null;
  // [lon, lat, trunk diameter in inches, species]
  return rows
    .filter((t) => !status || t[status] === 'Alive')
    .map((t) => {
      const p = lat ? [Number(t[lon]), Number(t[lat])] : t[f.geo]?.coordinates;
      return p ? [r5(p[0]), r5(p[1]), Number(t[dbh]) || 0, (t[species] ?? '').toLowerCase()] : null;
    })
    .filter(Boolean);
}

async function restaurants(box) {
  const f = await schema('restaurants');
  if (!f) return null;
  const [s, w, n, e] = box;
  const rows = await all(DATASETS.restaurants, {
    $select: 'camis,dba,cuisine_description,grade,grade_date,latitude,longitude',
    $where: `latitude between ${s} and ${n} and longitude between ${w} and ${e} and grade in ('A','B','C')`,
    $order: 'grade_date DESC',
  });
  if (!rows) return null;
  // the latest letter grade per restaurant: [lon, lat, name, grade, cuisine]
  const seen = new Set();
  const list = [];
  for (const r of rows) {
    if (seen.has(r.camis) || !r.latitude) continue;
    seen.add(r.camis);
    list.push([r5(Number(r.longitude)), r5(Number(r.latitude)), r.dba, r.grade, r.cuisine_description ?? '']);
  }
  return list;
}

/** Every line string of a (multi)line geometry as [[lon, lat], ...] lists. */
function lines(geom) {
  if (!geom?.coordinates) return [];
  return geom.type === 'MultiLineString' ? geom.coordinates : geom.type === 'LineString' ? [geom.coordinates] : [];
}

async function entrances(box) {
  const f = await schema('entrances', NY_HOST, ENTRANCES);
  if (!f) return null;
  const lat = f.find(/entrance_latitude|^latitude$/i);
  const lon = f.find(/entrance_longitude|^longitude$/i);
  const name = f.find(/stop_name|station_name/i);
  const type = f.find(/entrance_type/i);
  const routes = f.find(/daytime_routes|routes/i);
  if (!lat || !lon) return null;
  const [s, w, n, e] = box;
  const rows = await all(ENTRANCES, { $where: `${lat} between ${s} and ${n} and ${lon} between ${w} and ${e}` }, NY_HOST);
  // [lon, lat, station, entrance type, routes]
  return rows?.map((r) => [r5(Number(r[lon])), r5(Number(r[lat])), r[name] ?? '', r[type] ?? '', r[routes] ?? '']) ?? null;
}

async function bikes(box) {
  const f = await schema('bikes');
  if (!f?.geo) return null;
  const [s, w, n, e] = box;
  const facility = f.find(/facilitycl|ft_facilit|facility/i);
  const street = f.find(/^street$|street/i);
  const rows = await all(DATASETS.bikes, { $where: `intersects(${f.geo}, 'POLYGON((${w} ${s}, ${e} ${s}, ${e} ${n}, ${w} ${n}, ${w} ${s}))')` });
  if (!rows) return null;
  // { k: facility class (I protected, II painted lane, III shared), s: street, p: [[lon, lat], ...] }
  const out = [];
  for (const r of rows) for (const l of lines(r[f.geo])) out.push({ k: r[facility] ?? '', s: r[street] ?? '', p: l.map(([x, y]) => [r5(x), r5(y)]) });
  return out;
}

async function films(boro) {
  const f = await schema('films');
  if (!f) return null;
  // shoots from two weeks ago to a month ahead, so there is usually one going on
  const from = new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 19);
  const to = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 19);
  const rows = await all(DATASETS.films, { $where: `startdatetime between '${from}' and '${to}' and borough = '${boro}'` });
  // [start, end, category, parking held (street segments)]
  return rows?.map((r) => [r.startdatetime, r.enddatetime, r.subcategoryname ?? r.category ?? '', r.parkingheld ?? '']) ?? null;
}

/** Minimal PNG reader for 8-bit RGB/RGBA, non-interlaced (what the terrain tiles are). */
function readPNG(buf) {
  let p = 8;
  let width = 0;
  let height = 0;
  let channels = 3;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      channels = data[9] === 6 ? 4 : 3;
    } else if (type === 'IDAT') idat.push(data);
    p += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? out[y * stride + x - channels] : 0;
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = x >= channels && y > 0 ? out[(y - 1) * stride + x - channels] : 0;
      let v = line[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const pa = Math.abs(b - c);
        const pb = Math.abs(a - c);
        const pc = Math.abs(a + b - 2 * c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[y * stride + x] = v & 255;
    }
  }
  return { width, height, channels, data: out };
}

/**
 * Ground elevation over the neighborhood from the free AWS terrain tiles (Terrarium encoding,
 * Mapzen/Tilezen; attribution in docs): a 64 x 64 grid of meters above sea level, row 0 at the north.
 */
async function elevation([s, w, n, e]) {
  const Z = 15;
  const tx = (lon) => ((lon + 180) / 360) * 2 ** Z;
  const ty = (lat) => ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** Z;
  const tiles = new Map();
  for (let x = Math.floor(tx(w)); x <= Math.floor(tx(e)); x++) {
    for (let y = Math.floor(ty(n)); y <= Math.floor(ty(s)); y++) {
      try {
        const r = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${Z}/${x}/${y}.png`, { signal: AbortSignal.timeout(30000) });
        if (!r.ok) return null;
        tiles.set(`${x},${y}`, readPNG(Buffer.from(await r.arrayBuffer())));
      } catch (err) {
        console.log(`  elevation tile ${x},${y}: ${err.message}`);
        return null;
      }
    }
  }
  const N = 64;
  const grid = [];
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const lat = n - ((n - s) * j) / (N - 1);
      const lon = w + ((e - w) * i) / (N - 1);
      const fx = tx(lon);
      const fy = ty(lat);
      const t = tiles.get(`${Math.floor(fx)},${Math.floor(fy)}`);
      if (!t) return null;
      const px = Math.min(t.width - 1, Math.floor((fx % 1) * t.width));
      const py = Math.min(t.height - 1, Math.floor((fy % 1) * t.height));
      const o = (py * t.width + px) * t.channels;
      grid.push(Math.round((t.data[o] * 256 + t.data[o + 1] + t.data[o + 2] / 256 - 32768) * 10) / 10);
    }
  }
  return { n: N, box: [s, w, n, e], m: grid };
}

let ok = 0;
for (const d of districts) {
  const box = bboxAround(d.lat, d.lon, RADIUS);
  const t0 = Date.now();
  const data = {
    buildings: await buildings(box), trees: await trees(box), restaurants: await restaurants(box),
    entrances: await entrances(box), bikes: await bikes(box), films: d.boro ? await films(d.boro.replace(/^The /, '')) : null,
    elevation: await elevation(box),
  };
  const got = Object.entries(data).filter(([, v]) => v?.length || v?.m?.length);
  if (!got.length) {
    console.log(`nyc: ${d.id}: nothing (outside the city's data, or the portal is down)`);
    continue;
  }
  writeFileSync(`${out}/${d.id}.json`, JSON.stringify(data));
  ok++;
  console.log(`nyc: ${d.id} ${got.map(([k, v]) => `${v.length ?? v.m.length} ${k}`).join(', ')} in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  await sleep(1000);
}
console.log(`nyc: ${ok}/${districts.length} neighborhoods`);
process.exit(0);
