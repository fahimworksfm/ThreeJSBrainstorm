import { buildJamaicaLandmarks } from '../landmarks/jamaica.js';

const corner = (D, i, j, sx, sz) => [D.colX(i) + sx * (D.nsW / 2 + 2), D.rowZ(j) + sz * (D.ewW / 2 + 2)];

export default {
  id: 'sunnyside',
  name: 'Sunnyside',
  borough: 'Queens',
  ll: [40.7435, -73.9205], // real-map center (lat, lon)
  seed: 4646,
  blurb: 'The 7 on its steel arches over Queens Blvd, the SUNNYSIDE sign, Irish pubs and Romanian bakeries.',

  nsW: 14,
  ewW: 16,
  blockX: 62,
  blockZ: 88,
  sidewalk: 4.5,
  nsRoads: ['39th St', '40th St', '41st St', '43rd St', '44th St', '45th St', '46th St', '47th St', '48th St'],
  ewRoads: ['39th Ave', 'Skillman Ave', '43rd Ave', 'Queens Blvd', 'Greenpoint Ave', '47th Ave', '48th Ave'],
  commercialNS: [1, 6], // 40th St, 46th St
  commercialEW: [1, 3, 4], // Skillman, Queens Blvd, Greenpoint Ave
  signalEW: [],
  signalNS: [3],
  edges: { north: 'city', west: 'city' },
  residential: (c, r) => (r <= 1 && c >= 3 && c <= 6 ? 'row' : 'apartments'),
  condoChance: () => 0.04,
  condoFloors: [8, 14],
  busRoute: 'Q32  QUEENS BLVD',
  shops: [
    'IRISH PUB', 'BAKERY', 'DELI', 'PIZZA', 'TAQUERÍA', 'TURKISH GRILL', 'ROMANIAN MARKET', 'COFFEE',
    'LAUNDROMAT', 'BARBER', 'HARDWARE', 'THAI', 'FLOWERS', 'PHARMACY', 'LIQUORS', 'DINER',
  ],
  neon: [
    ['PUB', '#57ff8a', true], ['GUINNESS', '#ffd23b', false], ['PIZZA', '#ff5a36', false], ['OPEN', '#ff2f5f', true],
    ['BAKERY', '#ff9a3b', false], ['LIQUORS', '#39d0ff', true], ['DINER', '#ff3b6b', true], ['BAR', '#ff2f5f', true],
    ['TACOS', '#57ff8a', false], ['24 HR', '#39d0ff', false], ['THAI', '#ffd23b', true],
  ],

  el: {
    axis: 'ew',
    index: 3, // the 7 over Queens Blvd
    height: 9.8,
    terminalStart: false,
    style: 'subway',
    bullets: [['7', '#b933ad']],
    underLabel: 'under the 7',
    ride: 'the 7 train',
    stations: [
      { at: 1, name: '40 ST–LOWERY ST' },
      { at: 6, name: '46 ST–BLISS ST' },
    ],
  },

  fog: 0.0062,
  fogColor: 0x140f1b,
  sky: { horizon: [0.1, 0.075, 0.11], cloud: [0.17, 0.1, 0.09] },

  start: (D) => ({
    pos: [D.colX(6) + D.nsW / 2 + 2.5, D.rowZ(3) + D.ewW / 2 + 12],
    look: [D.colX(6) - 40, 7, D.rowZ(3)],
  }),

  memories: [
    {
      id: 'sign', where: (D) => corner(D, 6, 3, 1, -1), title: 'The Sunnyside sign',
      text: 'The old SUNNYSIDE sign hangs off the el at 46th Street. It has been saying good morning since before I was born.',
    },
    {
      id: 'pub', where: (D) => corner(D, 4, 1, 1, 1), title: 'Skillman Ave',
      text: 'An Irish pub with the football on, a Colombian bakery next door, and everybody standing outside both.',
    },
    {
      id: 'gardens', where: (D) => corner(D, 4, 0, 1, 1), title: 'Sunnyside Gardens',
      text: 'Behind these rowhouses the blocks open up into shared gardens. It was built that way on purpose, in 1924.',
    },
    {
      id: 'arches', where: (D) => corner(D, 1, 3, 1, 1), title: '40th St',
      text: 'Under the 7 the concrete arches go on forever, like a church somebody built for trains.',
    },
    {
      id: 'greenpoint', where: (D) => corner(D, 5, 4, -1, 1), title: 'Greenpoint Ave',
      text: 'Greenpoint Avenue bends away toward Brooklyn. The bus is always either gone or three of them at once.',
    },
    {
      id: 'skyline', where: (D) => corner(D, 0, 2, 1, -1), title: 'The view west',
      text: 'From the platform you can see the whole Manhattan skyline over the rail yards. Commuters stop looking. I never do.',
    },
  ],
  finale: 'Sunnyside: the neighborhood with the name everybody else wishes they had. Keep walking.',

  landmarks: buildJamaicaLandmarks,
};
