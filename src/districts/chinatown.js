import { buildJamaicaLandmarks } from '../landmarks/jamaica.js';

const corner = (D, i, j, sx, sz) => [D.colX(i) + sx * (D.nsW / 2 + 2), D.rowZ(j) + sz * (D.ewW / 2 + 2)];

export default {
  id: 'chinatown',
  name: 'Chinatown',
  borough: 'Manhattan',
  ll: [40.7165, -73.9985], // real-map center (lat, lon)
  seed: 8686,
  blurb: 'Canal Street’s crowds, Mott Street’s dumpling houses and red lanterns, fish markets, and the J train under Centre St.',

  nsW: 12,
  ewW: 13,
  blockX: 60,
  blockZ: 70,
  sidewalk: 3.8,
  nsRoads: ['Centre St', 'Baxter St', 'Mulberry St', 'Mott St', 'Elizabeth St', 'Bowery'],
  ewRoads: ['Grand St', 'Hester St', 'Canal St', 'Bayard St', 'Worth St'],
  commercialNS: [2, 3, 5],
  commercialEW: [1, 2, 3],
  signalEW: [],
  signalNS: [0],
  edges: { north: 'city', west: 'city' },
  residential: () => 'apartments',
  condoChance: () => 0.04,
  condoFloors: [8, 14],
  busRoute: 'M103  BOWERY',
  shops: ['DUMPLINGS', 'ROAST DUCK', 'BAKERY', 'TEA', 'FISH MARKET', 'HERBS', 'JEWELRY', 'NOODLES', 'DIM SUM', 'BUBBLE TEA', 'SOUVENIRS', 'FRUIT', 'BBQ PORK', 'BOOKS', 'KARAOKE', 'PHARMACY'],
  neon: [['DIM SUM', '#ff9a3b', true], ['NOODLES', '#ffd23b', false], ['KARAOKE', '#c86bff', true], ['BAR', '#ff2f5f', true], ['OPEN', '#ff2f5f', true], ['TEA', '#57ff8a', false], ['DUMPLINGS', '#ffb03b', true], ['JEWELRY', '#ffd23b', true]],

  el: {
    axis: 'ns',
    index: 0,
    underground: true,
    height: 0,
    style: 'subway',
    bullets: [['J', '#996633'], ['Z', '#996633']],
    underLabel: '',
    ride: 'the J train',
    stations: [{ at: 2, name: 'CANAL ST' }],
  },

  fog: 0.0062,
  fogColor: 0x140f1c,
  sky: { horizon: [0.1, 0.075, 0.12], cloud: [0.17, 0.1, 0.1] },

  start: (D) => ({
    pos: [D.colX(3) + D.nsW / 2 + 2, D.rowZ(2) + D.ewW / 2 + 10],
    look: [D.colX(3) + 2, 5, D.rowZ(3) + 40],
  }),

  memories: [
    {
      id: 'canal', where: (D) => corner(D, 0, 2, 1, 1), title: 'Canal St',
      text: 'Canal Street sells everything: watches, crabs, phone cases, and fake designer bags with the name spelled wrong.',
    },
    {
      id: 'mott', where: (D) => corner(D, 3, 3, 1, -1), title: 'Mott St',
      text: 'Mott Street at night: red lanterns strung across the road and steam rolling out of the kitchens.',
    },
    {
      id: 'doyers', where: (D) => corner(D, 4, 3, -1, 1), title: 'Doyers St',
      text: 'Doyers Street bends like an elbow. They called it the Bloody Angle once. Now it’s cocktail bars and a barbershop.',
    },
    {
      id: 'columbus', where: (D) => corner(D, 1, 4, 1, -1), title: 'Columbus Park',
      text: 'In Columbus Park the old men play Chinese chess and cards at folding tables, and the crowd watching is bigger than the game.',
    },
    {
      id: 'bakery', where: (D) => corner(D, 5, 1, -1, 1), title: 'The bakery',
      text: 'Egg tarts, still warm, a dollar each. The line is out the door and nobody minds.',
    },
    {
      id: 'mulberry', where: (D) => corner(D, 2, 0, 1, 1), title: 'Mulberry St',
      text: 'Up Mulberry Street Chinatown turns into Little Italy for two blocks. The waiters try to call you in with a menu.',
    },
  ],
  finale: 'Chinatown: the oldest streets in the city and the loudest kitchens. Keep walking.',

  landmarks: buildJamaicaLandmarks,
};
