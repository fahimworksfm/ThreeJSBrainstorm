import { buildJamaicaLandmarks } from '../landmarks/jamaica.js';

const corner = (D, i, j, sx, sz) => [D.colX(i) + sx * (D.nsW / 2 + 2), D.rowZ(j) + sz * (D.ewW / 2 + 2)];

export default {
  id: 'coney',
  name: 'Coney Island',
  borough: 'Brooklyn',
  ll: [40.576, -73.981], // real-map center (lat, lon)
  seed: 1927,
  blurb: 'The Cyclone and the Wonder Wheel, Nathan’s hot dogs, the boardwalk and the Atlantic, at the end of four subway lines.',

  nsW: 14,
  ewW: 16,
  blockX: 90,
  blockZ: 80,
  sidewalk: 5,
  nsRoads: ['W 16th St', 'W 15th St', 'Stillwell Ave', 'W 12th St', 'W 10th St', 'W 8th St'],
  ewRoads: ['Neptune Ave', 'Mermaid Ave', 'Surf Ave', 'Bowery'],
  commercialNS: [2, 3],
  commercialEW: [2, 3],
  signalEW: [1],
  signalNS: [],
  edges: { north: 'city', west: 'city' },
  residential: () => 'apartments',
  condoChance: () => 0.05,
  condoFloors: [10, 20],
  busRoute: 'B36  SURF AV',
  shops: ['HOT DOGS', 'CLAMS', 'FUNNEL CAKE', 'ARCADE', 'SIDESHOW', 'BEER', 'CANDY', 'SOUVENIRS', 'CORN DOGS', 'BUMPER CARS', 'SEAFOOD', 'ICE CREAM', 'PIZZA', 'SWIMWEAR', 'T-SHIRTS', 'TACOS'],
  neon: [['HOT DOGS', '#ffd23b', true], ['ARCADE', '#c86bff', true], ['CLAMS', '#39d0ff', false], ['BEER', '#ffb03b', true], ['OPEN', '#ff2f5f', true], ['FREAKS', '#ff2f5f', true], ['RIDES', '#57ff8a', false], ['CANDY', '#ff9ad8', false]],
  bigSigns: { ll: [40.5752, -73.9810], radius: 80, chance: 0.3 },

  el: {
    axis: 'ns',
    index: 2,
    height: 8,
    terminalStart: false,
    style: 'subway',
    bullets: [['D', '#ff6319'], ['F', '#ff6319'], ['N', '#fccc0a'], ['Q', '#fccc0a']],
    underLabel: 'under the tracks',
    ride: 'the Q train',
    stations: [{ at: 2, name: 'CONEY ISLAND–STILLWELL AV' }],
  },

  fog: 0.0062,
  fogColor: 0x140f1c,
  sky: { horizon: [0.1, 0.075, 0.12], cloud: [0.17, 0.1, 0.1] },
  foliage: 'summer',

  start: (D) => ({
    pos: [D.colX(2) + D.nsW / 2 + 2.5, D.rowZ(2) + D.ewW / 2 + 6],
    look: [D.colX(2) + 3, 8, D.rowZ(3) + 60],
  }),

  memories: [
    {
      id: 'nathans', where: (D) => corner(D, 2, 2, 1, 1), title: 'Nathan’s',
      text: 'A hot dog at Nathan’s on the corner of Surf and Stillwell. On the Fourth of July somebody eats seventy of them.',
    },
    {
      id: 'cyclone', where: (D) => corner(D, 3, 3, 1, -1), title: 'The Cyclone',
      text: 'The Cyclone is made of wood and it’s almost a hundred years old. It rattles like it’s going to fall apart. It never does.',
    },
    {
      id: 'wheel', where: (D) => corner(D, 4, 3, -1, -1), title: 'The Wonder Wheel',
      text: 'Ride the swinging cars on the Wonder Wheel. At the top the car slides and the whole ocean tips sideways.',
    },
    {
      id: 'boardwalk', where: (D) => corner(D, 1, 3, 1, 1), title: 'The boardwalk',
      text: 'Walk the boardwalk at sunset: roller skaters, fishermen, a mermaid in a wig, and the Parachute Jump lit up red.',
    },
    {
      id: 'mermaid', where: (D) => corner(D, 3, 1, 1, 1), title: 'Mermaid Ave',
      text: 'The Mermaid Parade comes through every June. Everybody in glitter and fishtails, even the cops kind of.',
    },
    {
      id: 'terminal', where: (D) => corner(D, 2, 1, -1, 1), title: 'Stillwell Ave',
      text: 'Four subway lines end right here at the beach. The ride from the Bronx takes two hours. People do it every weekend.',
    },
  ],
  finale: 'Coney Island: the city’s playground, sand in everything. Keep walking.',

  landmarks: buildJamaicaLandmarks,
};
