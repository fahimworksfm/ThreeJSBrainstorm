import * as THREE from 'three';

/**
 * The one look: an inked, cel-shaded comic. What changes is the time of day.
 * Keyframes are blended by minute of the day, so golden hour slides into a purple dusk
 * and then a deep-blue neon night, and back again at dawn.
 */

// Constant across the day: the "drawing" part of the look.
export const INK = {
  outline: { strength: 1, width: 1.8, color: [0.06, 0.04, 0.05], threshold: [0.025, 0.075], fade: [320, 1100] },
  bands: 4,
  shadowDots: 0.3,
  matte: true,
  env: 0.12,
};

const GOLDEN = {
  sky: {
    top: [0.38, 0.52, 0.76], horizon: [1.0, 0.8, 0.52], cloud: [1.0, 0.95, 0.84], shade: [0.84, 0.68, 0.62],
    sun: [1.0, 0.8, 0.5], sunDir: [-0.8, 0.16, 0.35], sharp: 1, amount: 0.7, stars: 0,
  },
  fog: [0.86, 0.72, 0.56, 0.0017],
  hemiSky: [0.85, 0.83, 0.93], hemiGround: [0.76, 0.56, 0.4], hemi: 1.6,
  sun: [1.0, 0.8, 0.56], sunI: 3.1, sunDir: [-0.7, 0.62, 0.32],
  road: [0.36, 0.33, 0.31],
  exposure: 1.0, albedo: 1.15, windows: 0.3, pools: 0.03, neon: 0.5,
  bloom: [0.25, 0.35, 0.95],
  saturation: 1.2, contrast: 1.05, shadowTint: [0.98, 0.94, 1.0], highlightTint: [1.08, 1.0, 0.88],
};
const DUSK = {
  sky: {
    top: [0.16, 0.16, 0.46], horizon: [0.98, 0.52, 0.42], cloud: [1.0, 0.72, 0.62], shade: [0.46, 0.34, 0.6],
    sun: [1.0, 0.55, 0.35], sunDir: [-0.85, 0.04, 0.35], sharp: 1, amount: 0.8, stars: 0.15,
  },
  fog: [0.6, 0.48, 0.62, 0.0019],
  hemiSky: [0.62, 0.6, 0.95], hemiGround: [0.6, 0.4, 0.42], hemi: 1.45,
  sun: [1.0, 0.62, 0.5], sunI: 1.1, sunDir: [-0.85, 0.3, 0.35],
  road: [0.3, 0.28, 0.33],
  exposure: 1.0, albedo: 0.95, windows: 0.85, pools: 0.25, neon: 0.9,
  bloom: [0.35, 0.4, 0.9],
  saturation: 1.25, contrast: 1.06, shadowTint: [0.9, 0.9, 1.08], highlightTint: [1.06, 1.0, 0.95],
};
const NIGHT = {
  sky: {
    top: [0.01, 0.02, 0.1], horizon: [0.08, 0.13, 0.36], cloud: [0.2, 0.34, 0.66], shade: [0.05, 0.08, 0.22],
    sun: [0, 0, 0], sunDir: [0, 1, 0], sharp: 1, amount: 0.6, stars: 1,
  },
  fog: [0.07, 0.1, 0.24, 0.0032],
  hemiSky: [0.36, 0.42, 0.78], hemiGround: [0.36, 0.2, 0.34], hemi: 1.0,
  sun: [0.6, 0.7, 1.0], sunI: 0.35, sunDir: [0.4, 1, 0.3],
  road: [0.13, 0.13, 0.17],
  exposure: 1.05, albedo: 0.62, windows: 1.25, pools: 0.85, neon: 1.25,
  bloom: [0.5, 0.45, 0.82],
  saturation: 1.35, contrast: 1.1, shadowTint: [0.85, 0.9, 1.2], highlightTint: [1.1, 1.0, 1.02],
};
const DAWN = { ...DUSK, sky: { ...DUSK.sky, sunDir: [0.85, 0.04, -0.2] }, sunDir: [0.85, 0.3, -0.2] };
const MORNING = { ...GOLDEN, sky: { ...GOLDEN.sky, sunDir: [0.8, 0.2, -0.3] }, sunDir: [0.7, 0.7, -0.3] };

// [minute of day, look]
const KEYS = [
  [0, NIGHT],
  [270, NIGHT],
  [360, DAWN],
  [450, MORNING],
  [720, GOLDEN],
  [1050, GOLDEN],
  [1155, DUSK],
  [1260, NIGHT],
  [1440, NIGHT],
];

export const START_TIMES = {
  golden: { label: 'Golden hour', minute: 16 * 60 + 50 },
  dusk: { label: 'Dusk', minute: 19 * 60 + 5 },
  night: { label: 'Night', minute: 22 * 60 + 10 },
};

function lerpDeep(a, b, t) {
  if (typeof a === 'number') return a + (b - a) * t;
  if (Array.isArray(a)) return a.map((v, i) => v + (b[i] - v) * t);
  const out = {};
  for (const k of Object.keys(a)) out[k] = lerpDeep(a[k], b[k], t);
  return out;
}

/** The blended look for a minute of the day (0..1440). */
export function lookAt(minute) {
  const m = ((minute % 1440) + 1440) % 1440;
  for (let i = 0; i < KEYS.length - 1; i++) {
    const [m0, a] = KEYS[i];
    const [m1, b] = KEYS[i + 1];
    if (m >= m0 && m <= m1) {
      const t = THREE.MathUtils.smoothstep(m, m0, m1);
      return lerpDeep(a, b, t);
    }
  }
  return NIGHT;
}

/** 0 = broad daylight, 1 = full night: used for rain chances, neon and headlights. */
export function nightness(minute) {
  return THREE.MathUtils.clamp((lookAt(minute).windows - 0.35) / 0.9, 0, 1);
}
