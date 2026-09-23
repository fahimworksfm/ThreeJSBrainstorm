import { buildJamaicaLandmarks } from '../landmarks/jamaica.js';

const corner = (D, i, j, sx, sz) => [D.colX(i) + sx * (D.nsW / 2 + 2), D.rowZ(j) + sz * (D.ewW / 2 + 2)];

export default {
  id: 'forest-hills',
  name: 'Forest Hills',
  borough: 'Queens',
  ll: [40.7195, -73.8445], // real-map center (lat, lon)
  seed: 7171,
  blurb: 'Austin St shopping, Tudor towers at Station Square, the Gardens’ brick lanes, and Queens Blvd twelve lanes wide.',

  nsW: 15,
  ewW: 22,
  blockX: 66,
  blockZ: 92,
  sidewalk: 5,
  nsRoads: ['67th Ave', '68th Ave', '69th Ave', '70th Ave', '71st Ave', '72nd Ave', '75th Ave'],
  ewRoads: ['Booth St', 'Queens Blvd', 'Austin St', 'Burns St', 'Greenway Terrace'],
  commercialNS: [4], // 71st Ave (Continental)
  commercialEW: [1, 2], // Queens Blvd, Austin St
  signalEW: [],
  signalNS: [0, 2, 6],
  edges: { north: 'city', west: 'city' },
  residential: (c, r) => (r >= 3 ? 'detached' : 'apartments'),
  condoChance: (c, r) => (r <= 1 ? 0.35 : 0.03),
  condoFloors: [10, 20],
  busRoute: 'Q23  71 AV',
  shops: [
    'BAGELS', 'BOOKSTORE', 'CINEMA', 'SUSHI', 'GELATO', 'BOUTIQUE', 'SHOE STORE', 'PHARMACY',
    'KNISHES', 'COFFEE', 'WINE BAR', 'OPTICIAN', 'BAKERY', 'DELI', 'TOY STORE', 'FLORIST',
  ],
  neon: [
    ['CINEMA', '#ffd23b', true], ['BAGELS', '#ffb03b', false], ['OPEN', '#ff2f5f', true], ['SUSHI', '#39d0ff', false],
    ['WINE', '#c86bff', true], ['GELATO', '#ff9ad8', false], ['COFFEE', '#ffa56b', false], ['BAR', '#ff2f5f', true],
    ['DELI', '#9dff4a', true], ['24 HR', '#39d0ff', false],
  ],

  el: {
    axis: 'ew',
    index: 1, // the E/F/M/R run under Queens Blvd
    underground: true,
    height: 0,
    style: 'subway',
    bullets: [['E', '#0039a6'], ['F', '#ff6319'], ['M', '#ff6319'], ['R', '#fccc0a']],
    underLabel: '',
    ride: 'the E train',
    stations: [
      { at: 4, name: '71 AV–FOREST HILLS' },
      { at: 6, name: '75 AV' },
    ],
  },

  fog: 0.006,
  fogColor: 0x140f1a,
  sky: { horizon: [0.1, 0.075, 0.11], cloud: [0.17, 0.1, 0.09] },
  foliage: 'autumn',

  start: (D) => ({
    pos: [D.colX(4) + D.nsW / 2 + 2.5, D.rowZ(2) + D.ewW / 2 + 10],
    look: [D.colX(4) + 3, 6, D.rowZ(2) + 60],
  }),

  memories: [
    {
      id: 'continental', where: (D) => corner(D, 4, 1, 1, 1), title: 'Continental Ave',
      text: 'Everybody still calls it Continental Avenue, whatever the sign says. The express stops here and the whole platform exhales.',
    },
    {
      id: 'austin', where: (D) => corner(D, 3, 2, 1, 1), title: 'Austin St',
      text: 'Austin Street on a Saturday: strollers, shopping bags, a guy playing saxophone outside the bagel place.',
    },
    {
      id: 'station', where: (D) => corner(D, 4, 3, -1, -1), title: 'Station Square',
      text: 'Station Square looks like a village in England that got lost and ended up next to the LIRR. The bricks are a hundred years old.',
    },
    {
      id: 'stadium', where: (D) => corner(D, 5, 4, 1, -1), title: 'The old stadium',
      text: 'The U.S. Open was played around the corner once. The Beatles and Hendrix played the stadium too. Now it’s all concerts again.',
    },
    {
      id: 'qbl', where: (D) => corner(D, 1, 1, -1, -1), title: 'Queens Blvd',
      text: 'Queens Boulevard is twelve lanes wide. Crossing it is a whole plan. You learn the lights like a song.',
    },
    {
      id: 'gardens', where: (D) => corner(D, 2, 4, 1, 1), title: 'The Gardens',
      text: 'In Forest Hills Gardens the streets curve on purpose and the lamps look like lanterns. It’s very quiet. Too quiet for me.',
    },
  ],
  finale: 'Forest Hills: Tudor roofs, the E train underneath, and somewhere a kid practicing tennis against a wall. Keep walking.',

  landmarks: buildJamaicaLandmarks,
};
