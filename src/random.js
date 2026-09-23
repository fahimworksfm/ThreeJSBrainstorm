// Seeded RNG so the city is identical on every visit.
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const rand = mulberry32(1987);
export const range = (a, b) => a + (b - a) * rand();
export const pick = (arr) => arr[Math.floor(rand() * arr.length)];
export const chance = (p) => rand() < p;
