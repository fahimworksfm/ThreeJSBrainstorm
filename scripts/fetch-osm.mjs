// Downloads each neighborhood's OpenStreetMap data once, at deploy time, into dist/osm/<id>.json,
// so players load it from the site instead of waiting on the public Overpass servers.
// Never fails the build: anything it can't fetch falls back to the live download in the browser.
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { query, bboxAround, compact, MIRRORS } from '../src/osm/fetch.js';

const RADIUS = 760; // keep in step with FETCH_RADIUS in src/main.js
const out = process.argv[2] ?? 'dist/osm';
const only = process.argv.slice(3);
mkdirSync(out, { recursive: true });

const districts = [];
for (const f of readdirSync('src/districts')) {
  if (f === 'index.js') continue;
  const src = readFileSync(`src/districts/${f}`, 'utf8');
  const id = src.match(/\bid: '([^']+)'/)?.[1];
  const ll = src.match(/\bll: \[([-\d.]+), ([-\d.]+)\]/);
  if (id && ll && (!only.length || only.includes(id))) districts.push({ id, lat: Number(ll[1]), lon: Number(ll[2]) });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function fetchOne(d) {
  const body = `data=${encodeURIComponent(query(bboxAround(d.lat, d.lon, RADIUS)))}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    for (const url of MIRRORS) {
      const t0 = Date.now();
      try {
        const r = await fetch(url, {
          method: 'POST', body, signal: AbortSignal.timeout(150000),
          headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'night-walker-nyc build (github.com/fahimworksfm/threejsbrainstorm)' },
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        if (!data?.elements?.length) throw new Error('empty');
        return { data: compact(data), ms: Date.now() - t0, url };
      } catch (e) {
        console.log(`  ${d.id}: ${new URL(url).host} failed (${e.message})`);
        await sleep(2000);
      }
    }
    await sleep(10000);
  }
  return null;
}

let ok = 0;
let misses = 0;
for (const d of districts) {
  if (misses >= 3 && ok === 0) {
    console.log('osm: OpenStreetMap looks unreachable from this build; players will download live');
    break;
  }
  const file = `${out}/${d.id}.json`;
  if (existsSync(file)) {
    ok++;
    continue;
  }
  const r = await fetchOne(d);
  if (r) {
    const json = JSON.stringify(r.data);
    writeFileSync(file, json);
    ok++;
    console.log(`osm: ${d.id} ${(json.length / 1e6).toFixed(1)} MB in ${(r.ms / 1000).toFixed(0)} s from ${new URL(r.url).host}`);
  } else {
    misses++;
    console.log(`osm: ${d.id} skipped (players will download it live)`);
  }
  await sleep(1500);
}
console.log(`osm: ${ok}/${districts.length} neighborhoods bundled`);
process.exit(0);
