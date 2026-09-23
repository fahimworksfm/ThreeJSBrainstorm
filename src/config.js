// Astoria, Queens. Numbered streets run north-south, avenues run east-west.
// World axes: -z is north, +x is east, units are meters.
// Geography is compressed and lightly fictionalized, but the names and their order are real.

export const NS_W = 14; // north-south streets (constant x)
export const EW_W = 16; // east-west avenues (constant z)
export const BLOCK_X = 62;
export const BLOCK_Z = 100;
export const SIDEWALK = 4;
export const CURB = 0.15;

export const NS_ROADS = ['21st St', 'Crescent St', '29th St', '31st St', '33rd St', '35th St', 'Steinway St'];
export const EW_ROADS = [
  'Ditmars Blvd', '23rd Ave', '24th Ave', '25th Ave', 'Astoria Blvd', '28th Ave',
  '30th Ave', '31st Ave', 'Broadway', '34th Ave', '35th Ave', '36th Ave',
];
export const NX = NS_ROADS.length;
export const NZ = EW_ROADS.length;

export const PITCH_X = BLOCK_X + NS_W;
export const PITCH_Z = BLOCK_Z + EW_W;
const OX = -((NX - 1) * PITCH_X) / 2;
const OZ = -((NZ - 1) * PITCH_Z) / 2;

/** Centerline x of north-south street i (can extrapolate past the named ones). */
export const colX = (i) => OX + i * PITCH_X;
/** Centerline z of east-west avenue j. */
export const rowZ = (j) => OZ + j * PITCH_Z;

// Shopping strips: storefronts and neon on every facade facing these
export const COMMERCIAL_NS = new Set([3, 6]); // 31st St (under the el), Steinway St
export const COMMERCIAL_EW = new Set([0, 6, 8]); // Ditmars Blvd, 30th Ave, Broadway

// The elevated N/W line runs above 31st St
export const EL_COL = 3;
export const EL_HEIGHT = 9.2;
export const EL_STATIONS = [
  { j: 0, name: 'ASTORIA–DITMARS BLVD' },
  { j: 4, name: 'ASTORIA BLVD' },
  { j: 6, name: '30 AV' },
  { j: 8, name: 'BROADWAY' },
  { j: 11, name: '36 AV' },
];

// Edges of the walkable world
export const PARK_Z1 = rowZ(0) - EW_W / 2; // Astoria Park begins north of Ditmars
export const PARK_Z0 = PARK_Z1 - 160;
export const RIVER_X = colX(0) - NS_W / 2 - 18; // East River railing
export const EAST_LIMIT = colX(NX - 1) + NS_W / 2 + 8;
export const SOUTH_LIMIT = rowZ(NZ - 1) + EW_W / 2 + 8;

export const FOG_COLOR = 0x120f1b;
