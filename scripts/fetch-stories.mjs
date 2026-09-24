// Real landmarks for each neighborhood from Wikipedia (free, no key): title, position, a short summary.
// With a GROQ_API_KEY secret, a free LLM also turns each summary into a two-line memory in the hero's
// voice, grounded only on that summary. Output: public/wiki/<id>.json. Never fails the build.
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

const out = process.argv[2] ?? 'public/wiki';
const only = process.argv.slice(3);
mkdirSync(out, { recursive: true });
const KEY = process.env.GROQ_API_KEY;
const UA = 'NightWalkerNYC/1.0 (https://github.com/fahimworksfm/threejsbrainstorm; game build)';

const districts = [];
for (const f of readdirSync('src/districts')) {
  if (f === 'index.js') continue;
  const src = readFileSync(`src/districts/${f}`, 'utf8');
  const id = src.match(/\bid: '([^']+)'/)?.[1];
  const name = src.match(/\bname: '([^']+)'/)?.[1];
  const ll = src.match(/\bll: \[([-\d.]+), ([-\d.]+)\]/);
  if (id && ll && (!only.length || only.includes(id))) districts.push({ id, name, lat: Number(ll[1]), lon: Number(ll[2]) });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wiki(params) {
  const q = new URLSearchParams({ format: 'json', formatversion: '2', ...params });
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(`https://en.wikipedia.org/w/api.php?${q}`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(30000) });
      if (r.ok) return await r.json();
      console.log(`  wikipedia HTTP ${r.status}`);
    } catch (e) {
      console.log(`  wikipedia: ${e.message}`);
    }
    await sleep(2000 * (i + 1));
  }
  return null;
}

async function story(place, summary, hood) {
  if (!KEY) return null;
  const body = {
    model: 'llama-3.1-8b-instant',
    temperature: 0.8,
    max_tokens: 120,
    messages: [
      { role: 'system', content: 'You write captions for a comic-book walking game set in New York City. Write exactly two short sentences in first person, as a young New Yorker walking past this place at golden hour, remembering it. Use ONLY facts from the summary given; never invent names, dates or events. No hashtags, no quotes, no emojis.' },
      { role: 'user', content: `Neighborhood: ${hood}\nPlace: ${place}\nSummary: ${summary}` },
    ],
  };
  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST', headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000),
    });
    if (r.status === 429) {
      await sleep(8000);
      return null;
    }
    if (!r.ok) return null;
    return (await r.json()).choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}

let ok = 0;
for (const d of districts) {
  const geo = await wiki({ action: 'query', list: 'geosearch', gscoord: `${d.lat}|${d.lon}`, gsradius: '750', gslimit: '40' });
  const hits = geo?.query?.geosearch ?? [];
  if (!hits.length) {
    console.log(`wiki: ${d.id}: nothing`);
    continue;
  }
  const ext = await wiki({ action: 'query', prop: 'extracts|pageprops', exintro: '1', explaintext: '1', exsentences: '3', pageids: hits.map((h) => h.pageid).join('|'), ppprop: 'disambiguation' });
  const pages = new Map((ext?.query?.pages ?? []).map((p) => [p.pageid, p]));
  const list = [];
  for (const h of hits) {
    const p = pages.get(h.pageid);
    if (!p?.extract || p.pageprops?.disambiguation !== undefined) continue;
    // lists, neighborhoods-as-a-whole and districts make poor plaques
    if (/^(List of|Timeline of)|(historic district)$|, (Queens|Brooklyn|Manhattan|Bronx|Staten Island)$/i.test(h.title)) continue;
    const summary = p.extract.replace(/\s+/g, ' ').trim().slice(0, 420);
    list.push({ title: h.title, lat: h.lat, lon: h.lon, summary, url: `https://en.wikipedia.org/wiki/${encodeURIComponent(h.title.replace(/ /g, '_'))}`, pageid: h.pageid });
    if (list.length >= 12) break;
  }
  // keep stories (and so their recordings) from earlier runs; only write the new ones
  const before = existsSync(`${out}/${d.id}.json`) ? JSON.parse(readFileSync(`${out}/${d.id}.json`, 'utf8')) : [];
  const old = new Map(before.map((b) => [b.pageid, b]));
  for (const it of list) {
    const prev = old.get(it.pageid);
    if (prev?.story && prev.summary === it.summary) {
      it.story = prev.story;
      it.voice = prev.voice;
      continue;
    }
    it.story = await story(it.title, it.summary, d.name);
    if (KEY) await sleep(2200); // stay well under the free tier's 30 requests a minute
  }
  writeFileSync(`${out}/${d.id}.json`, JSON.stringify(list));
  ok++;
  console.log(`wiki: ${d.id} ${list.length} landmarks${KEY ? `, ${list.filter((x) => x.story).length} stories` : ''}`);
  await sleep(1000);
}
console.log(`wiki: ${ok}/${districts.length} neighborhoods`);
process.exit(0);
