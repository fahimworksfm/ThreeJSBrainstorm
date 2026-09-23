import { buildAstoriaLandmarks } from '../landmarks/astoria.js';

const corner = (D, i, j, sx, sz) => [D.colX(i) + sx * (D.nsW / 2 + 2), D.rowZ(j) + sz * (D.ewW / 2 + 2)];

export default {
  id: 'astoria',
  name: 'Astoria',
  borough: 'Queens',
  ll: [40.7688, -73.9205], // real-map center (lat, lon)
  seed: 1987,
  blurb: 'The N/W rumbling over 31st St, tavernas on 30th Ave, Manhattan glittering across the East River.',

  nsW: 14,
  ewW: 16,
  blockX: 62,
  blockZ: 100,
  sidewalk: 4,
  // west to east / north to south
  nsRoads: ['21st St', 'Crescent St', '29th St', '31st St', '33rd St', '35th St', 'Steinway St'],
  ewRoads: [
    'Ditmars Blvd', '23rd Ave', '24th Ave', '25th Ave', 'Astoria Blvd', '28th Ave',
    '30th Ave', '31st Ave', 'Broadway', '34th Ave', '35th Ave', '36th Ave',
  ],
  commercialNS: [3, 6], // 31st St, Steinway St
  commercialEW: [0, 6, 8], // Ditmars Blvd, 30th Ave, Broadway
  signalEW: [4], // Astoria Blvd
  signalNS: [],
  parkName: 'Astoria Park',
  riverName: 'East River Promenade',
  edges: { north: 'park', west: 'river' },
  laundry: 0.55, // washing on the fire escapes
  residential: () => 'row',
  condoChance: () => 0.05,
  condoFloors: [7, 11],

  // painted sign boards over the shops
  busRoute: 'Q69  LONG IS CITY',
  shops: [
    'GYRO HOUSE', 'TAVERNA', 'PIZZA & SUB', 'DELI', 'BAKERY', 'COFFEE', 'LAUNDROMAT', 'PHARMACY',
    'MINI MART', 'FLOWERS', 'HARDWARE', 'ΚΑΦΕΝΕΙΟ', 'BARBER', 'NAIL SALON', 'DINER', 'SWEETS',
  ],
  // [word, color, can be a vertical blade sign]
  neon: [
    ['TAVERNA', '#57a8ff', false], ['ΚΑΦΕ', '#ffd23b', true], ['BAKERY', '#ff9a3b', false],
    ['DINER', '#ff3b6b', true], ['PIZZA', '#ff5a36', false], ['DELI', '#9dff4a', true],
    ['24 HR', '#39d0ff', false], ['HOOKAH', '#c86bff', false], ['LAUNDROMAT', '#42f5e6', false],
    ['PANADERÍA', '#ffb03b', false], ['GYRO', '#ff4fd8', true], ['BAR', '#ff2f5f', true],
    ['OPEN', '#ff2f5f', true], ['LIQUORS', '#57ff8a', false], ['PHARMACY', '#4aff9d', false],
    ['NAIL SALON', '#ff7ad9', false], ['MINI MART', '#ffd23b', false], ['ΨΗΤΟΠΩΛΕΙΟ', '#6bd6ff', false],
  ],

  el: {
    axis: 'ns',
    index: 3, // above 31st St
    height: 9.2,
    terminalStart: true, // Ditmars is the end of the line
    style: 'subway',
    underLabel: 'under the el',
    ride: 'the N train',
    bullets: [['N', '#fccc0a'], ['W', '#fccc0a']],
    stations: [
      { at: 0, name: 'ASTORIA–DITMARS BLVD' },
      { at: 4, name: 'ASTORIA BLVD' },
      { at: 6, name: '30 AV' },
      { at: 8, name: 'BROADWAY' },
      { at: 11, name: '36 AV' },
    ],
  },

  fog: 0.0062,
  fogColor: 0x120f1b,
  sky: { horizon: [0.095, 0.07, 0.11], cloud: [0.16, 0.09, 0.08] },

  start: (D) => ({
    pos: [D.colX(3) + D.nsW / 2 + 2, D.rowZ(6) + 30],
    look: [D.colX(3) - 1, 7, D.rowZ(6) - 40],
  }),

  memories: [
    {
      id: 'el', where: (D) => corner(D, 3, 6, 1, 1), title: '31st St & 30th Ave',
      text: 'The N train shakes the whole street every few minutes. After a week you stop hearing it. After a month you miss it when you’re away.',
    },
    {
      id: 'ditmars', where: (D) => corner(D, 3, 0, -1, 1), title: 'Astoria–Ditmars Blvd',
      text: 'End of the line. Everybody gets off here eventually, and the train just turns around and goes back for more.',
    },
    {
      id: 'river', where: (D) => [D.riverX + 2.5, D.rowZ(3)], title: 'The East River',
      text: 'Manhattan looks best from over here. Close enough to see it glitter, far enough that you can’t hear it.',
    },
    {
      id: 'steinway', where: (D) => corner(D, 6, 7, -1, 1), title: 'Steinway St',
      text: 'Steinway after midnight: shisha smoke, a song from a car window, a man selling roasted corn. Six languages on one block and nobody needs a translator.',
    },
    {
      id: 'diner', where: (D) => corner(D, 4, 8, -1, -1), title: 'Broadway',
      text: 'The diner on Broadway never closes. The waitress calls everyone “sweetheart” and means it about half the time.',
    },
    {
      id: 'park', where: (D) => [D.colX(1) + 3, D.parkZ1 - 60], title: 'Astoria Park',
      text: 'From the park you can see the bridges lit up like jewelry. I’ve never crossed one at this hour. Tonight I don’t need to.',
    },
    {
      id: 'porch', where: (D) => corner(D, 1, 2, 1, 1), title: 'Crescent St',
      text: 'Plastic chairs on the stoop, a fig tree wrapped for winter, somebody’s grandmother’s tomatoes. Queens keeps its gardens small and stubborn.',
    },
    {
      id: 'bakery', where: (D) => corner(D, 5, 6, 1, -1), title: '30th Ave',
      text: 'A bakery is already lit. At four in the morning the whole block smells like bread and warm sugar.',
    },
  ],
  finale: 'Two million stories in this borough, and tonight one of them was mine. The train is still running. Keep walking.',

  landmarks: buildAstoriaLandmarks,
};
