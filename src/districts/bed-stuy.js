import { buildJamaicaLandmarks } from '../landmarks/jamaica.js';

const corner = (D, i, j, sx, sz) => [D.colX(i) + sx * (D.nsW / 2 + 2), D.rowZ(j) + sz * (D.ewW / 2 + 2)];

export default {
  id: 'bed-stuy',
  name: 'Bed-Stuy',
  borough: 'Brooklyn',
  ll: [40.685, -73.9445], // real-map center (lat, lon)
  seed: 1611,
  blurb: 'Brownstone blocks under big trees, stoop sales and block parties, Fulton Street shops, and the A train underneath.',

  nsW: 12,
  ewW: 12,
  blockX: 66,
  blockZ: 62,
  sidewalk: 4.5,
  nsRoads: ['Bedford Ave', 'Nostrand Ave', 'Marcy Ave', 'Tompkins Ave', 'Throop Ave', 'Marcus Garvey Blvd', 'Lewis Ave'],
  ewRoads: ['Lafayette Ave', 'Greene Ave', 'Gates Ave', 'Quincy St', 'Lexington Ave', 'Monroe St', 'Madison St', 'Putnam Ave', 'Halsey St', 'Macon St', 'Fulton St'],
  commercialNS: [1, 3],
  commercialEW: [2, 10],
  signalEW: [5],
  signalNS: [5],
  edges: { north: 'city', west: 'city' },
  residential: () => 'row',
  condoChance: () => 0.02,
  condoFloors: [6, 10],
  busRoute: 'B44  NOSTRAND AV',
  shops: ['BROWNSTONE CAFE', 'WEST INDIAN', 'JERK CHICKEN', 'BARBER', 'BEAUTY', 'BAKERY', 'WINE', 'BOOKS', 'BODEGA', 'PATTIES', 'LAUNDROMAT', 'SOUL FOOD', 'PHARMACY', 'PLANTS', 'RECORDS', 'COFFEE'],
  neon: [['PATTIES', '#ffd23b', true], ['BAR', '#ff2f5f', true], ['OPEN', '#ff2f5f', true], ['JERK', '#ff5a36', false], ['WINE', '#c86bff', true], ['DELI', '#9dff4a', true], ['COFFEE', '#ffa56b', false]],

  el: {
    axis: 'ew',
    index: 10,
    underground: true,
    height: 0,
    style: 'subway',
    bullets: [['A', '#0039a6'], ['C', '#0039a6']],
    underLabel: '',
    ride: 'the A train',
    stations: [{ at: 1, name: 'NOSTRAND AV' }, { at: 4, name: 'KINGSTON–THROOP AVS' }],
  },

  fog: 0.0062,
  fogColor: 0x140f1c,
  sky: { horizon: [0.1, 0.075, 0.12], cloud: [0.17, 0.1, 0.1] },
  foliage: 'summer',

  start: (D) => ({
    pos: [D.colX(3) + D.nsW / 2 + 2, D.rowZ(5) + D.ewW / 2 + 12],
    look: [D.colX(3) + 2, 5, D.rowZ(8)],
  }),

  memories: [
    {
      id: 'stoop', where: (D) => corner(D, 3, 4, 1, 1), title: 'The stoop',
      text: 'Summer nights on the stoop: somebody brings a speaker, somebody brings a cooler, and the whole block shows up.',
    },
    {
      id: 'block', where: (D) => corner(D, 4, 6, -1, 1), title: 'Block party',
      text: 'Once a year they close the street, open the hydrant, and grill for everybody. Bed-Stuy, do or die.',
    },
    {
      id: 'fulton', where: (D) => corner(D, 1, 10, 1, -1), title: 'Fulton St',
      text: 'Fulton Street: patties, braids, sneakers, church hats, and a DJ outside the record store.',
    },
    {
      id: 'brownstones', where: (D) => corner(D, 2, 2, 1, 1), title: 'The brownstones',
      text: 'These brownstones have carved doorways and stained glass. Every one has a story and a grandmother.',
    },
    {
      id: 'herbert', where: (D) => corner(D, 5, 7, -1, -1), title: 'Marcus Garvey Blvd',
      text: 'The trees on these blocks are older than anybody alive, and in the summer they meet over the middle of the street.',
    },
    {
      id: 'nostrand', where: (D) => corner(D, 1, 3, 1, 1), title: 'Nostrand Ave',
      text: 'Down Nostrand Avenue the smell changes from bakery to jerk smoke to hair salon every twenty feet.',
    },
  ],
  finale: 'Bed-Stuy: brownstone Brooklyn, loud and proud. Keep walking.',

  landmarks: buildJamaicaLandmarks,
};
