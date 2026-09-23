import { D } from './config.js';
import { FLOOR_H } from './textures.js';
import { range, pick, chance } from './random.js';

const SIDING_TINTS = ['#d3dfea', '#ece4cf', '#d6e8d4', '#efd6d2', '#dedede', '#efe7c2', '#e0d4ea'];
const BRICK_TINTS = ['#ffffff', '#f0d0c0', '#d8b8a8', '#ffe0cc', '#c8a898'];

const floors = (n) => n * FLOOR_H + 0.6;

/**
 * Generates blocks, lots and street-facing facades for the active district.
 * Block (c, r) sits between streets c and c+1 and avenues r and r+1.
 * Buildings face the north-south streets; corner buildings also face the avenue.
 */
export function generateLayout() {
  const { nsW, ewW, sidewalk } = D;
  const blocks = [];
  const lots = [];
  const faces = [];
  const colliders = [];
  const groundRects = [];
  const isPark = (c, r) => (D.parkBlocks || []).some(([pc, pr]) => pc === c && pr === r);

  for (let c = D.cMin; c <= D.cMax; c++) {
    for (let r = D.rMin; r <= D.rMax; r++) {
      const x0 = D.colX(c) + nsW / 2;
      const x1 = D.colX(c + 1) - nsW / 2;
      const z0 = D.rowZ(r) + ewW / 2;
      const z1 = D.rowZ(r + 1) - ewW / 2;
      const block = { c, r, x0, x1, z0, z1, outer: c < 0 || r < 0 || c >= D.NX - 1 || r >= D.NZ - 1 };
      blocks.push(block);
      groundRects.push({ x0, x1, z0, z1 });
      if (isPark(c, r)) {
        block.park = true;
        continue;
      }
      const bx0 = x0 + sidewalk;
      const bx1 = x1 - sidewalk;
      const bz0 = z0 + sidewalk;
      const bz1 = z1 - sidewalk;
      colliders.push({ x0: bx0, x1: bx1, z0: bz0, z1: bz1 });

      const reserved = (D.reserved || []).find((v) => v.c === c && v.r === r);
      const northShops = D.commercialEW.has(r);
      const southShops = D.commercialEW.has(r + 1);
      const mode = D.residential(c, r);
      const xm = (bx0 + bx1) / 2 + range(-2, 2);

      for (const side of [-1, 1]) {
        const hx0 = side < 0 ? bx0 : xm;
        const hx1 = side < 0 ? xm : bx1;
        const frontX = side < 0 ? bx0 : bx1;
        const frontShops = D.commercialNS.has(side < 0 ? c : c + 1);

        // split the half-block along z: corner lot, middle lots, corner lot
        let northLen = northShops ? range(16, 22) : range(11, 15);
        let southLen = southShops ? range(16, 22) : range(11, 15);
        if (reserved?.part === 'north') northLen = reserved.depth;
        if (reserved?.part === 'south') southLen = reserved.depth;
        const segs = [{ a: bz0, b: bz0 + northLen, corner: -1 }];
        let z = bz0 + northLen;
        const zEnd = bz1 - southLen;
        const midLen = () =>
          frontShops ? range(8, 14) : mode === 'detached' ? range(9, 13) : mode === 'apartments' ? range(12, 20) : range(5.5, 8);
        while (z < zEnd - 0.01) {
          let len = midLen();
          if (zEnd - (z + len) < 5) len = zEnd - z;
          segs.push({ a: z, b: z + len, corner: 0 });
          z += len;
        }
        segs.push({ a: zEnd, b: bz1, corner: 1 });

        for (const seg of segs) {
          if (reserved && ((reserved.part === 'north' && seg.corner < 0) || (reserved.part === 'south' && seg.corner > 0))) continue;
          const cornerShops = seg.corner < 0 ? northShops : seg.corner > 0 ? southShops : false;
          const shop = frontShops || cornerShops;
          let kind;
          let h;
          let style;
          let tint = '#ffffff';
          const cornerBuilding = seg.corner !== 0 && (shop || chance(mode === 'detached' ? 0.2 : 0.5));
          if (cornerBuilding) {
            kind = 'corner';
            h = floors(shop ? Math.floor(range(3, 6)) : Math.floor(range(4, 7)));
            style = pick(['brick', 'brick', 'stone', 'deco']);
            tint = style === 'brick' ? pick(BRICK_TINTS) : '#ffffff';
          } else if (shop) {
            kind = 'mixed';
            h = floors(Math.floor(range(2, 5)));
            style = pick(['brick', 'stone', 'siding', 'deco']);
            tint = style === 'siding' ? pick(SIDING_TINTS) : pick(BRICK_TINTS);
          } else if (mode === 'apartments') {
            kind = 'apt';
            h = floors(Math.floor(range(4, 9)));
            style = pick(['brick', 'brick', 'stone', 'deco']);
            tint = pick(BRICK_TINTS);
          } else if (mode === 'detached') {
            kind = 'house';
            h = floors(chance(0.7) ? 2 : 1);
            style = pick(['siding', 'siding', 'siding', 'brick']);
            tint = style === 'siding' ? pick(SIDING_TINTS) : pick(BRICK_TINTS);
          } else {
            kind = 'row';
            h = floors(chance(0.6) ? 2 : 3);
            style = pick(['siding', 'siding', 'brick', 'brick', 'stone']);
            tint = style === 'siding' ? pick(SIDING_TINTS) : pick(BRICK_TINTS);
          }
          if ((shop || kind === 'apt') && chance(D.condoChance(c, r))) {
            kind = 'condo';
            h = floors(Math.floor(range(D.condoFloors[0], D.condoFloors[1])));
            style = pick(['glass', 'office']);
            tint = '#ffffff';
          }
          const yard = kind === 'row' ? range(2.6, 3.4) : kind === 'house' ? range(4, 6) : 0;
          const gap = kind === 'house' ? range(1.2, 2) : 0; // side yards / driveways
          const lx0 = side < 0 ? hx0 + yard : hx0;
          const lx1 = side < 0 ? hx1 : hx1 - yard;
          const lot = {
            x0: lx0, x1: lx1, z0: seg.a + gap, z1: seg.b - gap, h, style, tint, kind, yard, side,
            frontX, outer: block.outer, lotZ0: seg.a, lotZ1: seg.b,
          };
          lots.push(lot);
          const cz = (seg.a + seg.b) / 2;
          faces.push({
            x: side < 0 ? lx0 : lx1, z: cz, nx: side, nz: 0, w: seg.b - seg.a - 2 * gap, lot,
            shop: shop && (frontShops || kind === 'corner') && kind !== 'row' && kind !== 'house',
          });
          if (seg.corner !== 0) {
            faces.push({
              x: (lx0 + lx1) / 2, z: seg.corner < 0 ? seg.a + gap : seg.b - gap, nx: 0, nz: seg.corner,
              w: lx1 - lx0, lot, shop: cornerShops || (frontShops && kind === 'corner'),
            });
          }
        }
      }
    }
  }

  let promenade = null;
  let park = null;
  if (D.riverX !== null) {
    promenade = { x0: D.riverX - 2, x1: D.colX(0) - nsW / 2, z0: D.zMin - 10, z1: D.zMax + 600 };
    groundRects.push(promenade);
  }
  if (D.parkZ1 !== null) {
    park = { x0: (D.riverX ?? D.xMin) - 2, x1: D.xMax + 600, z0: D.parkZ0 - 400, z1: D.parkZ1 };
    groundRects.push(park);
  }
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
