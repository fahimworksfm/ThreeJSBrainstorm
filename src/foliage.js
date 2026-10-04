// The street trees through the year, species by species, on New York's calendar: when each kind of tree
// turns, what color, how long it keeps its leaves, and which ones flower in spring. The species come from
// the city's street tree census (NYC Open Data). Dates are typical New York ones (days of the year); a
// warm fall runs a little later, but the order holds: green ash and cherries first, Callery pears and pin
// oaks last, and ginkgos drop every leaf within a day or two.

// [fall color, starts turning, peak color, bare]  (days of the year: Oct 1 = 274, Nov 1 = 305, Dec 1 = 335)
const FALL = {
  honeylocust: [0xe6c43a, 274, 290, 312],
  'london planetree': [0xb98a3e, 293, 314, 340],
  'callery pear': [0x9c2a3a, 305, 324, 345],
  'pin oak': [0xa2482a, 298, 318, 355], // russet, and many hang on, brown, into winter
  'japanese zelkova': [0xd06a2a, 288, 305, 330],
  'littleleaf linden': [0xdcc04a, 283, 298, 320],
  'american linden': [0xd8bb48, 283, 298, 320],
  'silver linden': [0xd6c25a, 285, 300, 322],
  ginkgo: [0xf2d231, 298, 316, 322], // bright butter yellow, then everything falls at once
  sophora: [0xb9b14a, 298, 314, 334],
  cherry: [0xd8582a, 268, 285, 306],
  'norway maple': [0xe2bb33, 293, 309, 330],
  'green ash': [0xc9a838, 266, 283, 303],
  'northern red oak': [0xa83a24, 293, 312, 336],
  'american elm': [0xd9b83c, 278, 298, 320],
  'swamp white oak': [0xa8772e, 298, 316, 340],
  'chinese elm': [0xc79a36, 296, 315, 338],
  'red maple': [0xd2321e, 278, 295, 316],
  sweetgum: [0x8e2346, 293, 312, 336],
  'kentucky coffeetree': [0xd2b448, 275, 290, 308],
  maple: [0xd8662a, 283, 300, 322],
  'purple-leaf plum': [0x6a2a3a, 280, 298, 318],
  'golden raintree': [0xd4a63a, 285, 300, 320],
  'dawn redwood': [0xb85a2a, 300, 320, 340], // a conifer that goes rust-orange and drops its needles
  'sawtooth oak': [0xb08a3a, 300, 320, 345],
  'willow oak': [0xc0903a, 300, 320, 345],
};
const DEFAULT_FALL = [0xd8822b, 285, 302, 325];
// spring: leaves out around mid-April; these flower first, white or pink, before their leaves
const BLOOM = {
  'callery pear': [0xf4f2ea, 84, 104], // white, late March into early April
  cherry: [0xf2b8cf, 95, 115],
  'purple-leaf plum': [0xf0c4d6, 85, 102],
  "'schubert' chokecherry": [0xf2efe6, 115, 128],
  'japanese tree lilac': [0xf4efdc, 158, 172], // June
};
const LEAF_OUT = 105; // the canopy fills in over the next three weeks

/** Day of the year in New York (1 = Jan 1). */
export function dayOfYear(d = new Date()) {
  const [y, m, day] = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(d).split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, day) - Date.UTC(y, 0, 1)) / 864e5) + 1;
}

const green = (k, light) => [0.27 + k * 0.06, 0.45 + (light ? 0.1 : 0), (light ? 0.4 : 0.28) + k * 0.1];
const tmp = { r: 0, g: 0, b: 0 };
function hex(c, out) {
  out.r = ((c >> 16) & 255) / 255;
  out.g = ((c >> 8) & 255) / 255;
  out.b = (c & 255) / 255;
  return out;
}

/**
 * A tree of this species on this day: leaf (0 bare to 1 full canopy), color ([r, g, b] in sRGB 0..1) and
 * dropping (how fast its leaves are coming down right now, 0..1). k: 0..1, this tree's own variation.
 */
export function treeState(species, doy, k) {
  const sp = String(species ?? '').toLowerCase();
  // each tree a few days off its neighbors, so a block turns over a week or two, not all on one morning
  const d = doy + (k - 0.5) * 8;
  const bloom = BLOOM[sp];
  if (bloom && d >= bloom[1] && d < bloom[2]) {
    hex(bloom[0], tmp);
    return { leaf: 0.85, color: [tmp.r, tmp.g, tmp.b], dropping: 0, bloom: true };
  }
  const [fc, start, peak, bare] = FALL[sp] ?? DEFAULT_FALL;
  const hsl = (h, s, l) => {
    const c = new Float32Array(3);
    const a = s * Math.min(l, 1 - l);
    const f = (n) => {
      const q = (n + h * 12) % 12;
      return l - a * Math.max(-1, Math.min(q - 3, 9 - q, 1));
    };
    c[0] = f(0);
    c[1] = f(8);
    c[2] = f(4);
    return [...c];
  };
  // winter, and early spring before the leaves
  if (d >= bare || d < LEAF_OUT - 5) {
    // a pin oak keeps a lot of dry brown leaves till spring
    if (sp === 'pin oak' && (d >= bare || d < 70)) return { leaf: 0.35, color: [0.42, 0.27, 0.16], dropping: 0 };
    return { leaf: 0, color: [0, 0, 0], dropping: 0 };
  }
  // leafing out: a thin, light green canopy filling in
  if (d < LEAF_OUT + 20) {
    const t = (d - LEAF_OUT + 5) / 25;
    return { leaf: 0.3 + 0.7 * t, color: hsl(...green(k, true)), dropping: 0 };
  }
  // summer
  if (d < start) return { leaf: 1, color: hsl(...green(k, false)), dropping: 0 };
  // turning: green into the fall color, full canopy until the peak
  hex(fc, tmp);
  const g = hsl(...green(k, false));
  if (d < peak) {
    const t = (d - start) / (peak - start);
    return { leaf: 1, color: g.map((v, i) => v + ([tmp.r, tmp.g, tmp.b][i] * (0.85 + k * 0.3) - v) * t), dropping: t * 0.25 };
  }
  // past the peak: leaves coming down, browning a little as they go
  const t = (d - peak) / (bare - peak);
  const c = [tmp.r, tmp.g, tmp.b].map((v, i) => (v * (0.85 + k * 0.3)) * (1 - t * 0.35) + [0.35, 0.24, 0.14][i] * t * 0.35);
  return { leaf: 1 - t * 0.9, color: c, dropping: 0.4 + 0.6 * Math.sin(Math.PI * Math.min(1, t * 1.15)) };
}

/** The ?season= override (a season, or a day of the year) as a day of the year. */
export function seasonDay(kind) {
  if (kind != null && /^\d+$/.test(kind)) return Number(kind);
  return { spring: 100, summer: 200, autumn: 305, bare: 15 }[kind] ?? null;
}

/** What the street trees are doing today, for the almanac: the species at peak color, turning, or shedding. */
export function foliageNow(speciesList, doy) {
  const count = new Map();
  for (const sp of speciesList) if (sp) count.set(sp, (count.get(sp) ?? 0) + 1);
  const peak = [];
  const turning = [];
  const bloom = [];
  for (const [sp, n] of [...count].sort((a, b) => b[1] - a[1])) {
    if (n < 3) continue;
    const b = BLOOM[sp];
    if (b && doy >= b[1] && doy < b[2]) bloom.push(sp);
    const [, start, pk, bare] = FALL[sp] ?? DEFAULT_FALL;
    if (doy >= pk - 4 && doy < bare - 3) peak.push(sp);
    else if (doy >= start && doy < pk - 4) turning.push(sp);
  }
  return { peak: peak.slice(0, 4), turning: turning.slice(0, 4), bloom: bloom.slice(0, 3) };
}
