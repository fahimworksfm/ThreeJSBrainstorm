// Manhattanhenge for every street: the days the real sunrise or sunset lines up with the street you're on.
// Manhattan's grid runs 29 degrees off true north, so twice a year the setting sun sits right at the end of
// every cross street; the same thing happens on any long straight street whose bearing the sun can reach.
import { sunPosition } from './sun.js';

/** The difference between two bearings, in degrees (0 to 180). */
const gap = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

/**
 * The next henge days for a street with compass bearing az (degrees clockwise from north; either end works)
 * at (lat, lon): [{ when: Date, kind: 'sunset' | 'sunrise', off: degrees }], soonest first, within a year.
 */
export function nextHenges(az, lat, lon, from = new Date(), tol = 0.6) {
  const ends = [az % 360, (az + 180) % 360];
  const out = [];
  const day0 = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  // the moment that counts: the disc just over the horizon at the end of the street, which in the city is a
  // skyline (New Jersey's, across the Hudson), not the sea. Half a degree up matches the Hayden Planetarium's
  // published Manhattanhenge dates.
  const H = 0.5;
  for (let d = 0; d < 370; d++) {
    for (const kind of ['sunrise', 'sunset']) {
      // New York's sunrise is between 9:30 and 12:30 UTC, sunset between 20:30 and 01:30 UTC the next day
      const [h0, h1] = kind === 'sunrise' ? [9, 13] : [20, 26];
      let prev = null;
      for (let m = h0 * 60; m <= h1 * 60; m += 2) {
        const t = new Date(day0 + d * 864e5 + m * 60000);
        const p = sunPosition(t, lat, lon);
        if (prev && (kind === 'sunrise' ? prev.el < H && p.el >= H : prev.el > H && p.el <= H)) {
          const off = Math.min(...ends.map((e) => gap(e, p.az)));
          if (off < tol && t > from) out.push({ when: t, kind, off });
          break;
        }
        prev = p;
      }
    }
  }
  // a henge spans two neighboring evenings or so: keep the best of each run
  const best = [];
  let prev = null;
  for (const h of out) {
    const last = best[best.length - 1];
    if (last && prev && prev.kind === h.kind && h.when - prev.when < 2.5 * 864e5) {
      if (h.off < last.off) best[best.length - 1] = h;
    } else best.push(h);
    prev = h;
  }
  return best.slice(0, 6);
}

/** Whether the sun right now sits low at the end of a street with bearing az: how far off, in degrees, or null. */
export function hengeNow(az, lat, lon, now = new Date()) {
  const p = sunPosition(now, lat, lon);
  if (p.el < -0.8 || p.el > 4) return null;
  return Math.min(gap(az, p.az), gap((az + 180) % 360, p.az));
}

/** "Fri, May 29, 8:12 PM" in New York time. */
export function nycWhen(t) {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(t);
}
