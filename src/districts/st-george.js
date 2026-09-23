import { buildJamaicaLandmarks } from '../landmarks/jamaica.js';

const corner = (D, i, j, sx, sz) => [D.colX(i) + sx * (D.nsW / 2 + 2), D.rowZ(j) + sz * (D.ewW / 2 + 2)];

export default {
  id: 'st-george',
  name: 'St. George',
  borough: 'Staten Island',
  ll: [40.6425, -74.0790], // real-map center (lat, lon)
  seed: 1661,
  blurb: 'The ferry terminal, Borough Hall on the hill, the ballpark on the water, and Lower Manhattan glittering across the harbor.',

  nsW: 12,
  ewW: 14,
  blockX: 60,
  blockZ: 72,
  sidewalk: 4,
  nsRoads: ['Hamilton Ave', 'Stuyvesant Pl', 'Hyatt St', 'Bay St', 'Wall St'],
  ewRoads: ['Richmond Terrace', 'Schuyler St', 'Central Ave', 'Victory Blvd', 'Monroe Ave'],
  commercialNS: [3], // Bay St
  commercialEW: [0, 3], // Richmond Terrace, Victory Blvd
  signalEW: [],
  signalNS: [],
  edges: { north: 'city', west: 'city' },
  residential: (c, r) => (r >= 3 ? 'detached' : 'apartments'),
  condoChance: () => 0.05,
  condoFloors: [8, 14],
  busRoute: 'S62  VICTORY BLVD',
  shops: [
    'PIZZA', 'DELI', 'BAGELS', 'BAR & GRILL', 'SRI LANKAN', 'COFFEE', 'PHARMACY', 'ICE CREAM',
    'BARBER', 'LIQUORS', 'TACOS', 'BAKERY', 'BAIT SHOP', 'DINER', 'FLOWERS', 'LAUNDROMAT',
  ],
  neon: [
    ['PIZZA', '#ff5a36', false], ['BAR', '#ff2f5f', true], ['OPEN', '#ff2f5f', true], ['DELI', '#9dff4a', true],
    ['LIQUORS', '#39d0ff', true], ['DINER', '#ff3b6b', true], ['COFFEE', '#ffa56b', false], ['TACOS', '#57ff8a', false],
  ],

  el: {
    axis: 'ew',
    index: 0, // the ferry and the Staten Island Railway leave from the terminal on Richmond Terrace
    underground: true,
    height: 0,
    style: 'subway',
    bullets: [['SIR', '#0039a6']],
    underLabel: '',
    ride: 'the ferry',
    stations: [{ at: 3, name: 'ST. GEORGE FERRY' }],
  },

  fog: 0.0056,
  fogColor: 0x131420,
  sky: { horizon: [0.1, 0.085, 0.13], cloud: [0.16, 0.1, 0.1] },

  start: (D) => ({
    pos: [D.colX(3) + D.nsW / 2 + 2.5, D.rowZ(1)],
    look: [D.colX(3) + 3, 4, D.rowZ(0) - 60],
  }),

  memories: [
    {
      id: 'ferry', where: (D) => corner(D, 3, 0, -1, 1), title: 'The ferry',
      text: 'The Staten Island Ferry is free, runs all night, and passes the Statue of Liberty. Best deal in New York.',
    },
    {
      id: 'hall', where: (D) => corner(D, 1, 1, 1, 1), title: 'Borough Hall',
      text: 'Borough Hall has murals inside of the island’s whole history. Outside, the clock tower keeps an eye on the harbor.',
    },
    {
      id: 'ballpark', where: (D) => corner(D, 4, 0, -1, 1), title: 'The ballpark',
      text: 'The minor-league park sits right on the water. Somebody hits a home run and it lands in the harbor, probably.',
    },
    {
      id: 'victory', where: (D) => corner(D, 2, 3, 1, 1), title: 'Victory Blvd',
      text: 'Up Victory Boulevard there is Sri Lankan food as good as anywhere on earth. Little Sri Lanka, right here.',
    },
    {
      id: 'hill', where: (D) => corner(D, 1, 3, -1, 1), title: 'The hill',
      text: 'St. George is all hills and staircases. Climb high enough and Manhattan is lined up like a postcard.',
    },
    {
      id: 'lighthouse', where: (D) => corner(D, 4, 2, 1, -1), title: 'Bay St',
      text: 'Bay Street runs down along the water toward the Verrazzano. At night the bridge looks like a necklace.',
    },
  ],
  finale: 'Staten Island: everybody forgets it’s part of the city, and it likes it that way. Keep walking.',

  landmarks: buildJamaicaLandmarks,
};
