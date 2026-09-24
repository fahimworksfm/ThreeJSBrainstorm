// Pulls NYC Open Data for each neighborhood into public/nyc/<id>.json (run by the OSM data workflow):
// real building heights and construction years, the street tree census, and restaurant inspection grades.
// Never fails the build; a neighborhood it can't fetch simply has no file, and the game falls back to OSM.
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { bboxAround } from '../src/osm/fetch.js';

const RADIUS = 760; // keep in step with FETCH_RADIUS in src/main.js
const out = process.argv[2] ?? 'public/nyc';
const only = process.argv.slice(3);
mkdirSync(out, { recursive: true });
const HOST = 'https://data.cityofnewyork.us/resource';
const DATASETS = { buildings: '5zhs-2jue', trees: 'uvpi-gqnh', restaurants: '43nn-pn8j' };

const districts = [];
for (const f of readdirSync('src/districts')) {
  if (f === 'index.js') continue;
  const src = readFileSync(`src/districts/${f}`, 'utf8');
  const id = src.match(/\bid: '([^']+)'/)?.[1];
  const ll = src.match(/\bll: \[([-\d.]+), ([-\d.]+)\]/);
  if (id && ll && (!only.length || only.includes(id))) districts.push({ id, lat: Number(ll[1]), lon: Number(ll[2]) });
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
async function all(id, params) {
  const rows = [];
  for (let offset = 0; ; offset += 50000) {
    const q = new URLSearchParams({ ...params, $limit: '50000', $offset: String(offset) });
    const page = await get(`${HOST}/${id}.json?${q}`);
    if (!page) return rows.length ? rows : null;
    rows.push(...page);
    if (page.length < 50000) return rows;
  }
}
/** Column names change between dataset versions: find them from a sample row. */
const fields = {};
async function schema(key) {
  if (fields[key]) return fields[key];
  const [row] = (await get(`${HOST}/${DATASETS[key]}.json?$limit=1`)) ?? [];
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

let ok = 0;
for (const d of districts) {
  const box = bboxAround(d.lat, d.lon, RADIUS);
  const t0 = Date.now();
  const data = { buildings: await buildings(box), trees: await trees(box), restaurants: await restaurants(box) };
  const got = Object.entries(data).filter(([, v]) => v?.length);
  if (!got.length) {
    console.log(`nyc: ${d.id}: nothing (outside the city's data, or the portal is down)`);
    continue;
  }
  writeFileSync(`${out}/${d.id}.json`, JSON.stringify(data));
  ok++;
  console.log(`nyc: ${d.id} ${got.map(([k, v]) => `${v.length} ${k}`).join(', ')} in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  await sleep(1000);
}
console.log(`nyc: ${ok}/${districts.length} neighborhoods`);
process.exit(0);
