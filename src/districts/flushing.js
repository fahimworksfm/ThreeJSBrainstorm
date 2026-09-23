import { buildJamaicaLandmarks } from '../landmarks/jamaica.js';

const corner = (D, i, j, sx, sz) => [D.colX(i) + sx * (D.nsW / 2 + 2), D.rowZ(j) + sz * (D.ewW / 2 + 2)];

export default {
  id: 'flushing',
  name: 'Flushing',
  borough: 'Queens',
  ll: [40.7585, -73.8305], // real-map center (lat, lon)
  seed: 8888,
  blurb: 'The end of the 7: Main St crowds, dumpling windows, bubble tea, karaoke signs stacked three stories high.',

  nsW: 15,
  ewW: 18,
  blockX: 70,
  blockZ: 90,
  sidewalk: 5,
  nsRoads: ['College Point Blvd', 'Prince St', 'Main St', 'Union St', 'Bowne St', 'Parsons Blvd'],
  ewRoads: ['Northern Blvd', '37th Ave', '38th Ave', '39th Ave', 'Roosevelt Ave', '41st Ave', 'Sanford Ave', 'Maple Ave'],
  commercialNS: [2, 3], // Main St, Union St
  commercialEW: [0, 3, 4], // Northern Blvd, 39th Ave, Roosevelt Ave
  signalEW: [1, 5],
  signalNS: [1, 4],
  edges: { north: 'city', west: 'city' },
  residential: (c, r) => (r >= 6 ? 'detached' : 'apartments'),
  condoChance: (c, r) => (r <= 4 && c >= 1 && c <= 3 ? 0.3 : 0.05),
  condoFloors: [10, 22],
  busRoute: 'Q44  MAIN ST',
  shops: [
    'DUMPLING HOUSE', 'BUBBLE TEA', 'HOT POT', 'NOODLE BAR', 'BAKERY', 'HERBAL MEDICINE', 'KARAOKE', 'JEWELRY',
    'SUPERMARKET', 'PHONE REPAIR', 'MALATANG', 'KOREAN BBQ', 'TEA HOUSE', 'PHARMACY', 'BOOKSTORE', 'DIM SUM',
  ],
  neon: [
    ['KARAOKE', '#c86bff', true], ['DUMPLINGS', '#ffd23b', false], ['BUBBLE TEA', '#57ff8a', false], ['HOT POT', '#ff3b3b', true],
    ['NOODLES', '#ffb03b', false], ['OPEN', '#ff2f5f', true], ['BBQ', '#ff5a36', true], ['TEA', '#39d0ff', false],
    ['24 HR', '#39d0ff', false], ['DIM SUM', '#ff9a3b', true], ['JEWELRY', '#ffd23b', true], ['SPA', '#ff4fd8', false],
  ],

  el: {
    axis: 'ew',
    index: 4, // the 7 ends under Roosevelt Ave at Main St
    underground: true,
    height: 0,
    style: 'subway',
    bullets: [['7', '#b933ad']],
    underLabel: '',
    ride: 'the 7 train',
    stations: [{ at: 2, name: 'FLUSHING–MAIN ST' }],
  },

  fog: 0.0064,
  fogColor: 0x160f1c,
  sky: { horizon: [0.11, 0.07, 0.11], cloud: [0.18, 0.1, 0.09] },

  start: (D) => ({
    pos: [D.colX(2) + D.nsW / 2 + 2.5, D.rowZ(4) - D.ewW / 2 - 14],
    look: [D.colX(2) + 3, 6, D.rowZ(4) - 60],
  }),

  memories: [
    {
      id: 'mainroosevelt', where: (D) => corner(D, 2, 4, 1, -1), title: 'Main St & Roosevelt',
      text: 'The busiest corner in Queens. The crosswalk fills up like a subway car, and everybody makes the light.',
    },
    {
      id: 'dumplings', where: (D) => corner(D, 2, 3, -1, 1), title: 'The dumpling window',
      text: 'Twelve dumplings for a few dollars, handed out of a window in a paper boat. The steam fogs my glasses every time.',
    },
    {
      id: 'bubbletea', where: (D) => corner(D, 3, 5, 1, -1), title: 'Union St',
      text: 'On Union Street the signs switch to Korean. Bubble tea on one corner, barbecue smoke on the next.',
    },
    {
      id: 'library', where: (D) => corner(D, 2, 5, 1, 1), title: 'Queens Library',
      text: 'The Flushing library is the busiest in the country. At closing time the whole block spills out onto Main St.',
    },
    {
      id: 'quaker', where: (D) => corner(D, 1, 3, 1, 1), title: 'The old meeting house',
      text: 'There is a Quaker meeting house here from 1694. The Flushing Remonstrance was about letting everybody in. Still true.',
    },
    {
      id: 'northernfl', where: (D) => corner(D, 4, 0, -1, 1), title: 'Northern Blvd',
      text: 'Northern Boulevard at night: car dealers lit like stadiums, and a church choir practicing through an open door.',
    },
  ],
  finale: 'The 7 starts here. Every ride into Manhattan begins with somebody’s dumplings. Keep walking.',

  landmarks: buildJamaicaLandmarks,
};
