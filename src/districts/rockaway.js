import { buildJamaicaLandmarks } from '../landmarks/jamaica.js';

const corner = (D, i, j, sx, sz) => [D.colX(i) + sx * (D.nsW / 2 + 2), D.rowZ(j) + sz * (D.ewW / 2 + 2)];

export default {
  id: 'rockaway',
  name: 'Rockaway Beach',
  borough: 'Queens',
  ll: [40.5865, -73.8165], // real-map center (lat, lon)
  seed: 9090,
  blurb: 'The A train over the bay to the ocean: surf shops, taco stands on the boardwalk, and the Atlantic at the end of every street.',

  nsW: 12,
  ewW: 16,
  blockX: 56,
  blockZ: 70,
  sidewalk: 4,
  nsRoads: ['Beach 98th St', 'Beach 96th St', 'Beach 94th St', 'Beach 92nd St', 'Beach 90th St', 'Beach 88th St', 'Beach 86th St', 'Beach 84th St'],
  ewRoads: ['Beach Channel Dr', 'Rockaway Freeway', 'Rockaway Beach Blvd', 'Shore Front Pkwy'],
  commercialNS: [1, 4], // Beach 96th, Beach 90th
  commercialEW: [2], // Rockaway Beach Blvd
  signalEW: [0],
  signalNS: [],
  edges: { north: 'city', west: 'city' },
  residential: () => 'detached',
  condoChance: () => 0.05,
  condoFloors: [6, 12],
  busRoute: 'Q22  BEACH CHANNEL',
  shops: [
    'SURF SHOP', 'TACOS', 'ICE CREAM', 'BAIT & TACKLE', 'PIZZA', 'BEACH BAR', 'BIKE RENTAL', 'DELI',
    'FISH FRY', 'LEMON ICE', 'COFFEE', 'LIQUORS', 'SWIMWEAR', 'LAUNDROMAT', 'BAKERY', 'CLAM SHACK',
  ],
  neon: [
    ['SURF', '#39d0ff', true], ['TACOS', '#57ff8a', false], ['BAR', '#ff2f5f', true], ['ICE CREAM', '#ff9ad8', false],
    ['OPEN', '#ff2f5f', true], ['LIQUORS', '#39d0ff', true], ['PIZZA', '#ff5a36', false], ['CLAMS', '#ffd23b', true],
  ],

  el: {
    axis: 'ew',
    index: 1, // the A and the Rockaway shuttle over Rockaway Freeway
    height: 8.6,
    terminalStart: false,
    style: 'subway',
    bullets: [['A', '#0039a6'], ['S', '#808183']],
    underLabel: 'under the A',
    ride: 'the A train',
    stations: [
      { at: 0, name: 'BEACH 98 ST' },
      { at: 4, name: 'BEACH 90 ST' },
    ],
  },

  fog: 0.0055,
  fogColor: 0x131521,
  sky: { horizon: [0.1, 0.09, 0.13], cloud: [0.16, 0.11, 0.1] },
  foliage: 'summer',

  start: (D) => ({
    pos: [D.colX(4) + D.nsW / 2 + 2.5, D.rowZ(2) - D.ewW / 2 - 8],
    look: [D.colX(4) + 3, 4, D.rowZ(3) + 60],
  }),

  memories: [
    {
      id: 'boardwalk', where: (D) => corner(D, 5, 3, 1, 1), title: 'The boardwalk',
      text: 'At the end of the street there’s just the ocean, all the way to Portugal. It sounds like the el, only slower.',
    },
    {
      id: 'surf', where: (D) => corner(D, 1, 2, 1, 1), title: 'Beach 96th St',
      text: 'Surfers riding the A train with their boards, dripping on the seats. Nobody says a word. It’s Rockaway.',
    },
    {
      id: 'tacos', where: (D) => corner(D, 1, 3, -1, -1), title: 'Taco line',
      text: 'The taco line on the boardwalk is forty people long and worth every minute.',
    },
    {
      id: 'aline', where: (D) => corner(D, 4, 1, 1, 1), title: 'Beach 90th St',
      text: 'The A train crosses Jamaica Bay on a bridge that feels like flying low over the water. Best ride in the system.',
    },
    {
      id: 'bay', where: (D) => corner(D, 6, 0, -1, -1), title: 'Beach Channel Dr',
      text: 'On the bay side the sunset goes orange and pink over the marshes, and the planes line up for JFK.',
    },
    {
      id: 'bungalows', where: (D) => corner(D, 3, 2, 1, -1), title: 'The bungalows',
      text: 'Old summer bungalows packed in tight, with porches and flags and a grill going on every one.',
    },
  ],
  finale: 'Rockaway: the only place in New York where the subway takes you to the beach. Keep walking.',

  landmarks: buildJamaicaLandmarks,
};
