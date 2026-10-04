// Live NYC transit for the neighborhood you're in (a Vercel serverless function, free, no keys):
// next subway arrivals from the MTA's GTFS-realtime feeds, service alerts on those lines, and Citi Bike docks
// with bikes free right now. GET /api/transit?stops=R01,R03&routes=N,W&lat=40.77&lon=-73.91
import { arrivals } from './_gtfs.js';

const MTA = 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs';
const FEEDS = ['', '-ace', '-bdfm', '-g', '-jz', '-nqrw', '-l', '-si'];
const GBFS = 'https://gbfs.citibikenyc.com/gbfs/en';
const ALERTS = 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/camsys%2Fsubway-alerts.json';

// a warm function instance keeps the feeds for a little while, so many players cost the MTA one fetch
const cache = new Map();
async function cached(key, ttl, load) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < ttl) return hit.v;
  try {
    const v = await load();
    cache.set(key, { t: Date.now(), v });
    return v;
  } catch {
    return hit?.v ?? null; // stale beats nothing
  }
}
async function get(url, as) {
  const r = await fetch(url, { signal: AbortSignal.timeout(6000), headers: { 'user-agent': 'NightWalkerNYC/1.0' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return as === 'json' ? r.json() : new Uint8Array(await r.arrayBuffer());
}

async function trains(stops) {
  if (!stops.size) return [];
  const feeds = await Promise.all(FEEDS.map((f) => cached(`mta${f}`, 25000, () => get(MTA + f))));
  const now = Date.now() / 1000;
  const out = [];
  for (const buf of feeds) {
    if (!buf) continue;
    try {
      for (const a of arrivals(buf, stops)) if (a.at > now - 30 && a.at < now + 3600) out.push(a);
    } catch {
      /* one bad feed doesn't sink the rest */
    }
  }
  return out.sort((a, b) => a.at - b.at).slice(0, 80);
}

/**
 * Service alerts in effect right now for these subway lines (the MTA's alerts feed, as JSON): the kind of
 * alert ("Delays", "Part Suspended", ...), the lines, and the MTA's own short headline.
 */
async function alerts(routes) {
  if (!routes.size) return [];
  const feed = await cached('mta-alerts', 60000, () => get(ALERTS, 'json'));
  const now = Date.now() / 1000;
  const text = (t) => (t?.translation ?? []).find((x) => x.language === 'en')?.text ?? t?.translation?.[0]?.text ?? '';
  const out = [];
  for (const e of feed?.entity ?? []) {
    const a = e.alert;
    if (!a) continue;
    const on = (a.active_period ?? []).some((p) => (!p.start || p.start <= now) && (!p.end || p.end > now));
    if (a.active_period?.length && !on) continue;
    const lines = [...new Set((a.informed_entity ?? []).map((i) => i.route_id).filter((r) => r && routes.has(r)))];
    if (!lines.length) continue;
    const kind = a['transit_realtime.mercury_alert']?.alert_type ?? '';
    const head = text(a.header_text).replace(/\s+/g, ' ').trim();
    if (head) out.push({ kind, lines, text: head.length > 220 ? `${head.slice(0, 217)}…` : head });
  }
  // what changes your trip first: suspensions and delays, then reroutes and the rest
  const rank = (k) => (/suspend/i.test(k) ? 0 : /delay/i.test(k) ? 1 : /reroute|express|local|skip/i.test(k) ? 2 : 3);
  return out.sort((a, b) => rank(a.kind) - rank(b.kind)).slice(0, 8);
}

async function bikes(lat, lon, radius) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
  const [info, status] = await Promise.all([
    cached('gbfs-info', 3600000, () => get(`${GBFS}/station_information.json`, 'json')),
    cached('gbfs-status', 30000, () => get(`${GBFS}/station_status.json`, 'json')),
  ]);
  if (!info?.data?.stations) return [];
  const live = new Map((status?.data?.stations ?? []).map((s) => [s.station_id, s]));
  const kx = 111320 * Math.cos((lat * Math.PI) / 180);
  const out = [];
  for (const s of info.data.stations) {
    const d = Math.hypot((s.lon - lon) * kx, (s.lat - lat) * 110540);
    if (d > radius) continue;
    const st = live.get(s.station_id);
    out.push({
      id: s.station_id, name: s.name, lat: s.lat, lon: s.lon, capacity: s.capacity ?? 0,
      bikes: st ? Math.max(0, (st.num_bikes_available ?? 0) - (st.num_ebikes_available ?? 0)) : null,
      ebikes: st?.num_ebikes_available ?? null, docks: st?.num_docks_available ?? null, renting: st ? !!st.is_renting : null,
    });
  }
  return out.slice(0, 60);
}

export default async function handler(req, res) {
  const q = new URL(req.url, 'http://x').searchParams;
  const stops = new Set((q.get('stops') ?? '').split(',').map((s) => s.trim()).filter((s) => /^[A-Z0-9]{2,4}$/.test(s)).slice(0, 24));
  const radius = Math.min(1500, Number(q.get('r')) || 900);
  const routes = new Set((q.get('routes') ?? '').split(',').map((s) => s.trim().toUpperCase()).filter((s) => /^[A-Z0-9]{1,3}$/.test(s)).slice(0, 16));
  const [t, b, a] = await Promise.all([trains(stops), bikes(Number(q.get('lat')), Number(q.get('lon')), radius), alerts(routes).catch(() => [])]);
  res.setHeader('content-type', 'application/json');
  res.setHeader('cache-control', 'public, s-maxage=20, stale-while-revalidate=40');
  res.setHeader('access-control-allow-origin', '*');
  res.end(JSON.stringify({ t: Math.round(Date.now() / 1000), trains: t, bikes: b, alerts: a }));
}
