import { buildJamaicaLandmarks } from '../landmarks/jamaica.js';

const corner = (D, i, j, sx, sz) => [D.colX(i) + sx * (D.nsW / 2 + 2), D.rowZ(j) + sz * (D.ewW / 2 + 2)];

export default {
  id: 'williamsburg',
  name: 'Williamsburg',
  borough: 'Brooklyn',
  ll: [40.7185, -73.9585], // real-map center (lat, lon)
  seed: 2112,
  blurb: 'Bedford Ave and the L train, murals on every wall, rooftop bars, and the Manhattan skyline across the East River.',

  nsW: 13,
  ewW: 14,
  blockX: 58,
  blockZ: 76,
  sidewalk: 4.5,
  nsRoads: ['Kent Ave', 'Wythe Ave', 'Berry St', 'Bedford Ave', 'Driggs Ave', 'Roebling St', 'Havemeyer St'],
  ewRoads: ['N 12th St', 'N 10th St', 'N 8th St', 'N 7th St', 'N 6th St', 'N 4th St', 'Metropolitan Ave', 'Grand St'],
  commercialNS: [1, 3], // Wythe Ave, Bedford Ave
  commercialEW: [3, 6], // N 7th St, Metropolitan Ave
  signalEW: [5],
  signalNS: [5],
  edges: { north: 'city', west: 'city' },
  residential: (c) => (c <= 1 ? 'apartments' : 'row'),
  condoChance: (c) => (c <= 1 ? 0.4 : 0.06),
  condoFloors: [8, 16],
  busRoute: 'B62  BEDFORD AV',
  shops: [
    'VINTAGE', 'RECORDS', 'COFFEE', 'TATTOO', 'BAGELS', 'PIZZA', 'BIKE SHOP', 'TACOS',
    'BOOKS', 'BREWERY', 'PLANTS', 'RAMEN', 'THRIFT', 'BAKERY', 'WINE BAR', 'DELI',
  ],
  neon: [
    ['BAR', '#ff2f5f', true], ['COFFEE', '#ffa56b', false], ['TATTOO', '#c86bff', true], ['RECORDS', '#57ff8a', false],
    ['PIZZA', '#ff5a36', false], ['OPEN', '#ff2f5f', true], ['BEER', '#ffd23b', true], ['TACOS', '#57ff8a', false],
    ['VINTAGE', '#ff4fd8', false], ['LIVE MUSIC', '#39d0ff', true],
  ],

  el: {
    axis: 'ns',
    index: 3, // the L under Bedford Ave
    underground: true,
    height: 0,
    style: 'subway',
    bullets: [['L', '#a7a9ac']],
    underLabel: '',
    ride: 'the L train',
    stations: [{ at: 3, name: 'BEDFORD AV' }],
  },

  fog: 0.006,
  fogColor: 0x140f1c,
  sky: { horizon: [0.1, 0.07, 0.12], cloud: [0.17, 0.1, 0.1] },

  start: (D) => ({
    pos: [D.colX(3) + D.nsW / 2 + 2.5, D.rowZ(3) + D.ewW / 2 + 10],
    look: [D.colX(3) + 3, 5, D.rowZ(3) + 60],
  }),

  memories: [
    {
      id: 'bedford', where: (D) => corner(D, 3, 3, 1, 1), title: 'Bedford Ave',
      text: 'Bedford and North 7th: the L spits out a crowd every four minutes and they all look like they’re in a band.',
    },
    {
      id: 'waterfront', where: (D) => corner(D, 0, 5, 1, 1), title: 'The waterfront',
      text: 'From Kent Avenue Manhattan looks close enough to touch. On summer weekends there is a flea market right on the water.',
    },
    {
      id: 'mural', where: (D) => corner(D, 2, 1, 1, -1), title: 'The mural wall',
      text: 'Every few months somebody paints over the big wall with something new. I take a picture every time.',
    },
    {
      id: 'rooftop', where: (D) => corner(D, 1, 4, -1, 1), title: 'Wythe Ave',
      text: 'The old factories are hotels now, with rooftop bars where the water tanks used to be. The view is the same.',
    },
    {
      id: 'metropolitan', where: (D) => corner(D, 5, 6, -1, -1), title: 'Metropolitan Ave',
      text: 'On Metropolitan Avenue there is a bagel shop older than my grandparents. The line moves fast. Know your order.',
    },
    {
      id: 'bridge', where: (D) => corner(D, 4, 7, 1, -1), title: 'Grand St',
      text: 'South of here the Williamsburg Bridge carries the J over the river. It rumbles like a storm that never lands.',
    },
  ],
  finale: 'Williamsburg: factories turned into studios, studios turned into everything. Keep walking.',

  landmarks: buildJamaicaLandmarks,
};
