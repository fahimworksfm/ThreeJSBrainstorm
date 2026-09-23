// The active district. Every neighborhood is a compressed street grid described by a
// definition in ./districts; activateDistrict() derives the geometry helpers below.
// World axes: -z is north, +x is east, units are meters.

export const CURB = 0.15;

/** Active district: definition fields plus derived helpers (colX, rowZ, bounds...). */
export const D = {};

export function activateDistrict(def) {
  for (const k of Object.keys(D)) delete D[k];
  Object.assign(D, def);
  const NX = def.nsRoads.length;
  const NZ = def.ewRoads.length;
  const PITCH_X = def.blockX + def.nsW;
  const PITCH_Z = def.blockZ + def.ewW;
  const OX = -((NX - 1) * PITCH_X) / 2;
  const OZ = -((NZ - 1) * PITCH_Z) / 2;
  Object.assign(D, {
    NX,
    NZ,
    PITCH_X,
    PITCH_Z,
    /** Centerline x of north-south street i (extrapolates past the named ones). */
    colX: (i) => OX + i * PITCH_X,
    /** Centerline z of east-west avenue j. */
    rowZ: (j) => OZ + j * PITCH_Z,
    commercialNS: new Set(def.commercialNS),
    commercialEW: new Set(def.commercialEW),
  });

  const riverWest = def.edges.west === 'river';
  const parkNorth = def.edges.north === 'park';
  D.riverX = riverWest ? D.colX(0) - def.nsW / 2 - 18 : null;
  D.parkZ1 = parkNorth ? D.rowZ(0) - def.ewW / 2 : null;
  D.parkZ0 = parkNorth ? D.parkZ1 - 160 : null;

  // blocks c sit between streets c and c+1; a ring of extra blocks hides the edges
  D.cMin = riverWest ? 0 : -2;
  D.cMax = NX;
  D.rMin = parkNorth ? 0 : -2;
  D.rMax = NZ;
  // roads that exist (get paint and intersections)
  D.iLo = riverWest ? 0 : D.cMin + 1;
  D.iHi = D.cMax;
  D.jLo = parkNorth ? 0 : D.rMin + 1;
  D.jHi = D.rMax;

  // where you can walk
  D.xMin = riverWest ? D.riverX + 0.6 : D.colX(0) - def.nsW / 2 - 6;
  D.xMax = D.colX(NX - 1) + def.nsW / 2 + 6;
  D.zMin = parkNorth ? D.parkZ0 : D.rowZ(0) - def.ewW / 2 - 6;
  D.zMax = D.rowZ(NZ - 1) + def.ewW / 2 + 6;

  // where cars drive (they appear and vanish out in the fog)
  D.laneX0 = riverWest ? D.colX(0) - 2 : D.xMin - 260;
  D.laneX1 = D.xMax + 260;
  D.laneZ0 = parkNorth ? D.parkZ1 + 2 : D.zMin - 260;
  D.laneZ1 = D.zMax + 260;

  // the wet road plane
  D.roadRect = {
    x0: riverWest ? D.riverX : D.xMin - 900,
    x1: D.xMax + 900,
    z0: parkNorth ? D.parkZ1 - 1 : D.zMin - 900,
    z1: D.zMax + 900,
  };
  return D;
}
