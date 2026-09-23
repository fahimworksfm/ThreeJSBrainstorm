import { D } from './config.js';

export const CYCLE = 34;

/** Traffic lights only at busy named corners; side streets get stop signs. */
export function isSignalized(i, j) {
  if (i < 0 || j < 0 || i >= D.NX || j >= D.NZ) return false;
  return D.commercialNS.has(i) || D.commercialEW.has(j) || D.signalEW.includes(j) || D.signalNS.includes(i);
}

/** 'G' | 'A' | 'R' for traffic moving along north-south streets ('ns') or avenues ('ew'). */
export function signalState(t, axis) {
  const p = t % CYCLE;
  if (axis === 'ns') return p < 14 ? 'G' : p < 17 ? 'A' : 'R';
  return p < 17 ? 'R' : p < 31 ? 'G' : 'A';
}
