// Turns raw Overpass JSON into a city model in local meters: streets, buildings, parks, water.
import { makeProjection, dominantAngle, signedArea, bounds, hash01, normName } from './geo.js';

const DRIVE = {
  motorway: 20, trunk: 18, primary: 17, secondary: 15, tertiary: 13, unclassified: 10.5, residential: 10.5,
  living_street: 8, motorway_link: 8, trunk_link: 8, primary_link: 8, secondary_link: 8, tertiary_link: 8,
};
const MINOR = { service: 5.5, pedestrian: 6 };
const RANK = { motorway: 6, trunk: 5, primary: 4, secondary: 3, tertiary: 2, unclassified: 1, residential: 1, living_street: 0 };

const num = (v) => {
  if (v === undefined) return NaN;
  const m = String(v).match(/-?\d+(\.\d+)?/);
  if (!m) return NaN;
  let n = parseFloat(m[0]);
  if (/ft|'/.test(v)) n *= 0.3048;
  return n;
};

function roadWidth(tags, base) {
  const w = num(tags.width);
  if (w > 3 && w < 60) return w;
  const lanes = num(tags.lanes);
  const oneway = tags.oneway === 'yes' || tags.oneway === '1' || tags.junction === 'roundabout';
  if (lanes > 0 && lanes < 12) return Math.max(base * 0.7, lanes * 3.3 + (oneway ? 2.5 : 4.5));
  return oneway && base > 12 ? base * 0.72 : base;
}

/** Join ways (arrays of node ids) into closed rings where their ends meet. */
function joinRings(ways) {
  const rings = [];
  const open = ways.map((w) => w.slice());
  while (open.length) {
    let cur = open.pop();
    let guard = 0;
    while (cur[0] !== cur[cur.length - 1] && guard++ < 500) {
      const end = cur[cur.length - 1];
      const k = open.findIndex((w) => w[0] === end || w[w.length - 1] === end);
      if (k < 0) break;
      const w = open.splice(k, 1)[0];
      cur = cur.concat((w[0] === end ? w : w.slice().reverse()).slice(1));
    }
    if (cur.length > 3 && cur[0] === cur[cur.length - 1]) rings.push(cur);
  }
  return rings;
}

export function parseOSM(data, center) {
  const nodes = new Map();
  const ways = new Map();
  const rels = [];
  for (const e of data.elements) {
    if (e.type === 'node') nodes.set(e.id, e);
    else if (e.type === 'way') ways.set(e.id, e);
    else if (e.type === 'relation') rels.push(e);
  }
  const proj = makeProjection(center[0], center[1]);
  const raw = new Map();
  const P = (id) => {
    let p = raw.get(id);
    if (p) return p;
    const n = nodes.get(id);
    if (!n) return null;
    p = proj.raw(n.lat, n.lon);
    raw.set(id, p);
    return p;
  };
  const line = (ids) => {
    const out = [];
    for (const id of ids) {
      const p = P(id);
      if (p) out.push(p);
    }
    return out;
  };

  // ---- streets first: they decide which way is "north" on the grid
  const roads = [];
  const paths = [];
  for (const w of ways.values()) {
    const t = w.tags;
    if (!t?.highway) continue;
    if (t.tunnel && t.tunnel !== 'no') continue;
    if (t.covered === 'yes' || Number(t.layer) < 0) continue;
    if (t.area === 'yes') continue;
    const hw = t.highway;
    const bridge = !!t.bridge && t.bridge !== 'no';
    if (DRIVE[hw] !== undefined || MINOR[hw] !== undefined) {
      if (hw === 'service' && /parking_aisle|drive-through|driveway/.test(t.service ?? '')) continue;
      if (t.access === 'private' && hw === 'service') continue;
      const pts = line(w.nodes);
      if (pts.length < 2) continue;
      const street = DRIVE[hw] !== undefined;
      roads.push({
        id: w.id, nodes: w.nodes.filter((id) => nodes.has(id)), pts, name: t.name ?? '', norm: normName(t.name), hw, street,
        rank: RANK[hw] ?? 0, width: roadWidth(t, DRIVE[hw] ?? MINOR[hw]), bridge,
        oneway: t.oneway === 'yes' || t.oneway === '1' || t.junction === 'roundabout' ? 1 : t.oneway === '-1' ? -1 : 0,
        lanes: num(t.lanes) || 0,
      });
    } else if (/^(footway|path|cycleway|steps|track)$/.test(hw) && t.footway !== 'sidewalk' && t.footway !== 'crossing') {
      const pts = line(w.nodes);
      if (pts.length >= 2) paths.push({ pts, width: hw === 'steps' ? 2.5 : 2.2 });
    }
  }
  const angle = -dominantAngle(roads.filter((r) => r.street).map((r) => r.pts));
  proj.setAngle(angle);
  for (const [id, p] of raw) raw.set(id, proj.rotate(p));
  for (const r of roads) r.pts = r.nodes.map((id) => raw.get(id));
  for (const p of paths) p.pts = p.pts.map((q) => proj.rotate(q));
  const W = (ids) => line(ids);

  // ---- buildings
  const buildings = [];
  const parks = [];
  const water = [];
  const parkList = () => parks;
  const waterList = () => water;
  const addBuilding = (id, ring, t, holes = []) => {
    if (ring.length > 1 && ring[0] === ring[ring.length - 1]) ring = ring.slice(0, -1);
    const pts = W(ring);
    if (pts.length < 3) return;
    const area = Math.abs(signedArea(pts));
    if (area < 10) return;
    const levels = num(t['building:levels']);
    let h = num(t.height);
    if (!(h > 2)) h = levels > 0 ? levels * 3.4 + 0.8 : NaN;
    const minH = num(t.min_height) || (num(t['building:min_level']) || 0) * 3.4;
    buildings.push({
      id, pts, holes: holes.map(W).filter((hp) => hp.length >= 3), area, h, minH: minH > 0 ? minH : 0, levels,
      type: t.building, name: t.name, shop: !!t.shop || /retail|commercial/.test(t.building ?? ''), amenity: t.amenity,
      roofShape: t['roof:shape'], rand: hash01(id),
    });
  };
  for (const w of ways.values()) {
    const t = w.tags;
    if (!t?.building || t.building === 'no') continue;
    if (w.nodes[0] !== w.nodes[w.nodes.length - 1]) continue;
    if (/^(roof|carport|canopy|construction|ruins)$/.test(t.building)) continue;
    addBuilding(w.id, w.nodes, t);
  }
  for (const r of rels) {
    const t = r.tags ?? {};
    const outers = [];
    const inners = [];
    for (const m of r.members ?? []) {
      if (m.type !== 'way') continue;
      const w = ways.get(m.ref);
      if (!w) continue;
      (m.role === 'inner' ? inners : outers).push(w.nodes);
    }
    const outerRings = joinRings(outers);
    const innerRings = joinRings(inners);
    if (t.building && t.building !== 'no') {
      for (const ring of outerRings) addBuilding(r.id * 7 + ring.length, ring, t, innerRings);
    } else if (t.natural === 'water' || t.leisure === 'park') {
      for (const ring of outerRings) {
        const pts = W(ring.slice(0, -1));
        if (pts.length >= 3) (t.natural === 'water' ? waterList() : parkList()).push({ pts, kind: t.leisure === 'park' ? 'park' : 'water', name: t.name });
      }
    }
  }

  // ---- parks, water, coastline
  const coast = [];
  const rails = [];
  for (const w of ways.values()) {
    const t = w.tags;
    if (!t) continue;
    const closed = w.nodes[0] === w.nodes[w.nodes.length - 1];
    if (t.natural === 'coastline') {
      const pts = W(w.nodes);
      if (pts.length >= 2) coast.push(pts);
      continue;
    }
    if (t.railway && /^(subway|rail|light_rail)$/.test(t.railway)) {
      const elevated = (t.bridge && t.bridge !== 'no') || Number(t.layer) > 0;
      const under = (t.tunnel && t.tunnel !== 'no') || Number(t.layer) < 0;
      const pts = W(w.nodes);
      if (pts.length >= 2) rails.push({ pts, kind: t.railway, elevated, under, name: t.name });
      continue;
    }
    if (!closed) continue;
    const pts = W(w.nodes.slice(0, -1));
    if (pts.length < 3) continue;
    if (t.natural === 'water' || t.waterway === 'riverbank') water.push({ pts, kind: 'water', name: t.name });
    else if (t.leisure || t.landuse || t.natural) {
      const kind = t.landuse === 'cemetery' ? 'cemetery' : t.leisure === 'pitch' ? 'pitch' : t.leisure === 'playground' ? 'playground' : t.natural === 'wood' || t.natural === 'scrub' ? 'wood' : 'park';
      parks.push({ pts, kind, name: t.name, area: Math.abs(signedArea(pts)) });
    }
  }

  // ---- points of interest
  const signals = [];
  const lamps = [];
  const trees = [];
  const stations = [];
  const entrances = [];
  const pois = [];
  for (const n of nodes.values()) {
    const t = n.tags;
    if (!t) continue;
    const p = proj.toWorld(n.lat, n.lon);
    if (t.highway === 'traffic_signals') signals.push({ id: n.id, p });
    else if (t.highway === 'street_lamp') lamps.push(p);
    if (t.natural === 'tree') trees.push(p);
    if (t.railway === 'station') stations.push({ p, name: t.name ?? 'Station' });
    if (t.railway === 'subway_entrance') entrances.push({ p, name: t.name });
    if (t.name && (t.shop || t.amenity)) pois.push({ p, name: t.name, kind: t.shop ? 'shop' : t.amenity });
  }

  const all = [];
  for (const r of roads) all.push(...r.pts);
  for (const b of buildings) all.push(b.pts[0]);
  const box = bounds(all.length ? all : [[0, 0]]);
  return { proj, angle, roads, paths, buildings, parks, water, coast, rails, signals, lamps, trees, stations, entrances, pois, box, nodePos: raw };
}
