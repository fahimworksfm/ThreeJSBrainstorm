import { buildJamaicaLandmarks } from '../landmarks/jamaica.js';

const corner = (D, i, j, sx, sz) => [D.colX(i) + sx * (D.nsW / 2 + 2), D.rowZ(j) + sz * (D.ewW / 2 + 2)];

export default {
  id: 'midtown',
  name: 'Times Square',
  borough: 'Manhattan',
  ll: [40.7575, -73.9855], // real-map center (lat, lon)
  seed: 4242,
  blurb: 'Midtown Manhattan: billboards stacked to the sky, yellow cabs bumper to bumper, towers in every direction.',

  nsW: 18,
  ewW: 12,
  blockX: 150,
  blockZ: 62,
  sidewalk: 5,
  nsRoads: ['9th Ave', '8th Ave', '7th Ave', '6th Ave', '5th Ave', 'Madison Ave'],
  ewRoads: ['W 50th St', 'W 49th St', 'W 48th St', 'W 47th St', 'W 46th St', 'W 45th St', 'W 44th St', 'W 43rd St', 'W 42nd St', 'W 41st St'],
  commercialNS: [0, 1, 2, 3, 4, 5],
  commercialEW: [0, 3, 8],
  signalEW: [1, 2, 4, 5, 6, 7, 9],
  signalNS: [],
  edges: { north: 'city', west: 'city' },
  residential: () => 'apartments',
  condoChance: (c) => (c >= 1 && c <= 4 ? 0.75 : 0.35),
  condoFloors: [18, 60],
  busRoute: 'M42  CROSSTOWN',
  shops: [
    'THEATER', 'DELI', 'PIZZA', 'SOUVENIRS', 'HALAL CART', 'PHARMACY', 'STEAKHOUSE', 'BAGELS',
    'COFFEE', 'ELECTRONICS', 'BROADWAY TIX', 'DINER', 'CAMERAS', 'SHOES', 'BAR & GRILL', 'NEWSSTAND',
  ],
  neon: [
    ['BROADWAY', '#ffd23b', true], ['THEATER', '#ff2f5f', true], ['PIZZA', '#ff5a36', false], ['OPEN 24 HR', '#39d0ff', false],
    ['BAR', '#ff2f5f', true], ['DELI', '#9dff4a', true], ['HOTEL', '#c86bff', true], ['TIX', '#ff4fd8', false],
    ['DINER', '#ff3b6b', true], ['STEAKS', '#ffb03b', false], ['LIVE MUSIC', '#57ff8a', false], ['CAMERAS', '#39d0ff', true],
  ],

  // the billboards: every facade around the crossroads wrapped in lit ads
  bigSigns: { ll: [40.7580, -73.9855], radius: 170, chance: 0.75 },

  el: {
    axis: 'ns',
    index: 2, // the 1/2/3 under 7th Ave
    underground: true,
    height: 0,
    style: 'subway',
    bullets: [['1', '#ee352e'], ['2', '#ee352e'], ['3', '#ee352e']],
    underLabel: '',
    ride: 'the 1 train',
    stations: [
      { at: 8, name: 'TIMES SQ–42 ST' },
      { at: 0, name: '50 ST' },
    ],
  },

  fog: 0.0058,
  fogColor: 0x150f1d,
  sky: { horizon: [0.11, 0.07, 0.12], cloud: [0.18, 0.1, 0.1] },

  start: (D) => ({
    pos: [D.colX(2) + D.nsW / 2 + 2.5, D.rowZ(5) + D.ewW / 2 + 20],
    look: [D.colX(2) + 3, 12, D.rowZ(2)],
  }),

  memories: [
    {
      id: 'crossroads', where: (D) => corner(D, 2, 5, 1, -1), title: 'The Crossroads',
      text: 'Times Square at midnight is brighter than noon. The billboards make their own weather.',
    },
    {
      id: 'steps', where: (D) => corner(D, 2, 3, -1, 1), title: 'The red steps',
      text: 'Everybody sits on the red steps and looks the same way, like the whole city is one big movie.',
    },
    {
      id: 'shows', where: (D) => corner(D, 1, 4, 1, 1), title: 'Theater Row',
      text: 'Stage doors on 45th Street. After the show the actors come out in hoodies and sign programs in the rain.',
    },
    {
      id: 'library', where: (D) => corner(D, 4, 8, 1, -1), title: '5th Ave & 42nd',
      text: 'The library lions are called Patience and Fortitude. That’s basically the whole guide to living here.',
    },
    {
      id: 'cart', where: (D) => corner(D, 3, 0, -1, 1), title: 'The halal cart',
      text: 'The line at the cart on 6th Avenue goes around the corner at 2 a.m. White sauce, hot sauce, no regrets.',
    },
    {
      id: 'port', where: (D) => corner(D, 1, 8, -1, 1), title: '8th Ave & 42nd',
      text: 'Port Authority: every bus from everywhere, and everybody arriving with a suitcase and a plan.',
    },
  ],
  finale: 'The crossroads of the world. Everybody ends up here once. Keep walking.',

  landmarks: buildJamaicaLandmarks,
};
