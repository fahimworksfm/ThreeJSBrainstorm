import { COMMERCIAL_NS, COMMERCIAL_EW } from './config.js';

export const CYCLE = 34;

/** Traffic lights only at busy corners; side streets get stop signs. */
export const isSignalized = (i, j) => COMMERCIAL_NS.has(i) || COMMERCIAL_EW.has(j) || j === 4;

/** 'G' | 'A' | 'R' for traffic moving along north-south streets ('ns') or avenues ('ew'). */
export function signalState(t, axis) {
  const p = t % CYCLE;
  if (axis === 'ns') return p < 14 ? 'G' : p < 17 ? 'A' : 'R';
  return p < 17 ? 'R' : p < 31 ? 'G' : 'A';
}
