import {
  NS_W, EW_W, SIDEWALK, NX, NZ, colX, rowZ, COMMERCIAL_NS, COMMERCIAL_EW,
  PARK_Z0, PARK_Z1, RIVER_X, EAST_LIMIT, SOUTH_LIMIT,
} from './config.js';
import { FLOOR_H } from './textures.js';
import { rand, range, pick, chance } from './random.js';

const SIDING_TINTS = ['#d3dfea', '#ece4cf', '#d6e8d4', '#efd6d2', '#dedede', '#efe7c2', '#e0d4ea'];
const BRICK_TINTS = ['#ffffff', '#f0d0c0', '#d8b8a8', '#ffe0cc', '#c8a898'];

const floors = (n) => n * FLOOR_H + 0.6;

/**
 * Generates blocks, lots and street-facing facades.
 * Block (c, r) sits between streets c and c+1 and avenues r and r+1.
 * Houses face the numbered streets; corner buildings also face the avenue.
 */
export function generateLayout() {
  const blocks = [];
  const lots = [];
  const faces = [];
  const colliders = [];
  const groundRects = [];

  for (let c = 0; c <= NX; c++) {
    for (let r = 0; r <= NZ; r++) {
      const x0 = colX(c) + NS_W / 2;
      const x1 = colX(c + 1) - NS_W / 2;
      const z0 = rowZ(r) + EW_W / 2;
      const z1 = rowZ(r + 1) - EW_W / 2;
      const block = { c, r, x0, x1, z0, z1, outer: c >= NX - 1 || r >= NZ - 1 };
      blocks.push(block);
      groundRects.push({ x0, x1, z0, z1 });
      const bx0 = x0 + SIDEWALK;
      const bx1 = x1 - SIDEWALK;
      const bz0 = z0 + SIDEWALK;
      const bz1 = z1 - SIDEWALK;
      colliders.push({ x0: bx0, x1: bx1, z0: bz0, z1: bz1 });

      const northShops = COMMERCIAL_EW.has(r);
      const southShops = COMMERCIAL_EW.has(r + 1);
      const xm = (bx0 + bx1) / 2 + range(-2, 2);

      for (const side of [-1, 1]) {
        const hx0 = side < 0 ? bx0 : xm;
        const hx1 = side < 0 ? xm : bx1;
        const frontX = side < 0 ? bx0 : bx1;
        const frontShops = COMMERCIAL_NS.has(side < 0 ? c : c + 1);

        // split the half-block along z: corner lot, middle lots, corner lot
        const segs = [];
        const northLen = northShops ? range(16, 22) : range(11, 15);
        const southLen = southShops ? range(16, 22) : range(11, 15);
        segs.push({ a: bz0, b: bz0 + northLen, corner: -1 });
        let z = bz0 + northLen;
        const zEnd = bz1 - southLen;
        while (z < zEnd - 0.01) {
          let len = frontShops ? range(8, 14) : range(5.5, 8);
          if (zEnd - (z + len) < 5) len = zEnd - z;
          segs.push({ a: z, b: z + len, corner: 0 });
          z += len;
        }
        segs.push({ a: zEnd, b: bz1, corner: 1 });

        for (const seg of segs) {
          const cornerShops = seg.corner < 0 ? northShops : seg.corner > 0 ? southShops : false;
          const shop = frontShops || cornerShops;
          let kind;
          let h;
          let style;
          let tint = '#ffffff';
          if (seg.corner !== 0 && (shop || chance(0.5))) {
            kind = 'corner';
            h = floors(shop ? Math.floor(range(3, 6)) : Math.floor(range(4, 7)));
            style = pick(['brick', 'brick', 'stone', 'deco']);
            tint = style === 'brick' ? pick(BRICK_TINTS) : '#ffffff';
          } else if (shop) {
            kind = 'mixed';
            h = floors(Math.floor(range(2, 5)));
            style = pick(['brick', 'stone', 'siding', 'deco']);
            tint = style === 'siding' ? pick(SIDING_TINTS) : pick(BRICK_TINTS);
          } else {
            kind = 'row';
            h = floors(chance(0.6) ? 2 : 3);
            style = pick(['siding', 'siding', 'brick', 'brick', 'stone']);
            tint = style === 'siding' ? pick(SIDING_TINTS) : pick(BRICK_TINTS);
          }
          if (shop && chance(0.05)) {
            // a new glassy condo tower
            kind = 'condo';
            h = floors(Math.floor(range(7, 11)));
            style = pick(['glass', 'office']);
            tint = '#ffffff';
          }
          // rowhouses sit behind a small front yard
          const yard = kind === 'row' ? range(2.6, 3.4) : 0;
          const lx0 = side < 0 ? hx0 + yard : hx0;
          const lx1 = side < 0 ? hx1 : hx1 - yard;
          const lot = {
            x0: lx0, x1: lx1, z0: seg.a, z1: seg.b, h, style, tint, kind, yard, side,
            frontX, outer: block.outer,
          };
          lots.push(lot);
          const cz = (seg.a + seg.b) / 2;
          const w = seg.b - seg.a;
          faces.push({
            x: side < 0 ? lx0 : lx1, z: cz, nx: side, nz: 0, w, lot,
            shop: shop && kind !== 'row' && (frontShops || kind === 'corner'),
          });
          if (seg.corner !== 0) {
            faces.push({
              x: (lx0 + lx1) / 2, z: seg.corner < 0 ? seg.a : seg.b, nx: 0, nz: seg.corner,
              w: lx1 - lx0, lot, shop: cornerShops || (frontShops && kind === 'corner'),
            });
          }
        }
      }
    }
  }

  // East River promenade west of 21st St, and Astoria Park north of Ditmars
  const promenade = { x0: RIVER_X - 2, x1: colX(0) - NS_W / 2, z0: PARK_Z0 - 10, z1: SOUTH_LIMIT + 600 };
  const park = { x0: RIVER_X - 2, x1: EAST_LIMIT + 600, z0: PARK_Z0 - 400, z1: PARK_Z1 };
  groundRects.push(promenade, park);

  return { blocks, lots, faces, colliders, groundRects, promenade, park };
}

export function makeGroundQuery(rects, height) {
  return (x, z) => {
    for (const r of rects) {
      if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return height;
    }
    return 0;
  };
}
