import { buildJamaicaLandmarks } from '../landmarks/jamaica.js';

const corner = (D, i, j, sx, sz) => [D.colX(i) + sx * (D.nsW / 2 + 2), D.rowZ(j) + sz * (D.ewW / 2 + 2)];

export default {
  id: 'mott-haven',
  name: 'Mott Haven',
  borough: 'The Bronx',
  ll: [40.8095, -73.9215], // real-map center (lat, lon)
  seed: 1841,
  blurb: 'The Hub on 149th St, rowhouses on Alexander Ave, murals and bodegas, and the 6 train under 138th St.',

  nsW: 14,
  ewW: 16,
  blockX: 80,
  blockZ: 70,
  sidewalk: 4.5,
  nsRoads: ['Lincoln Ave', 'Alexander Ave', 'Willis Ave', 'Brook Ave', 'St Anns Ave', 'Cypress Ave'],
  ewRoads: ['E 149th St', 'E 145th St', 'E 143rd St', 'E 141st St', 'E 140th St', 'E 138th St', 'Bruckner Blvd'],
  commercialNS: [2],
  commercialEW: [0, 5],
  signalEW: [3],
  signalNS: [4],
  edges: { north: 'city', west: 'city' },
  residential: (c) => (c === 1 ? 'row' : 'apartments'),
  condoChance: () => 0.03,
  condoFloors: [10, 20],
  busRoute: 'BX15  WILLIS AV',
  shops: ['BODEGA', 'CUCHIFRITOS', 'BARBER', 'PIZZA', 'BOTÁNICA', 'CELL PHONES', 'PANADERÍA', 'CHINESE TAKEOUT', 'SNEAKERS', 'LAUNDROMAT', 'PHARMACY', 'JEWELRY', 'COFFEE', 'MOFONGO', 'DELI', 'BEAUTY SUPPLY'],
  neon: [['BODEGA', '#9dff4a', true], ['OPEN', '#ff2f5f', true], ['PIZZA', '#ff5a36', false], ['BAR', '#ff2f5f', true], ['24 HR', '#39d0ff', false], ['CUCHIFRITOS', '#ffd23b', true], ['BARBER', '#c86bff', false]],

  el: {
    axis: 'ew',
    index: 5,
    underground: true,
    height: 0,
    style: 'subway',
    bullets: [['6', '#00933c']],
    underLabel: '',
    ride: 'the 6 train',
    stations: [{ at: 3, name: 'BROOK AV' }, { at: 5, name: 'CYPRESS AV' }],
  },

  fog: 0.0062,
  fogColor: 0x140f1c,
  sky: { horizon: [0.1, 0.075, 0.12], cloud: [0.17, 0.1, 0.1] },

  start: (D) => ({
    pos: [D.colX(2) + D.nsW / 2 + 2, D.rowZ(5) - D.ewW / 2 - 10],
    look: [D.colX(2) + 2, 6, D.rowZ(2)],
  }),

  memories: [
    {
      id: 'hub', where: (D) => corner(D, 2, 0, 1, 1), title: 'The Hub',
      text: 'Where Third Avenue, Willis and 149th crash together they call it the Hub. It was the Bronx’s Times Square.',
    },
    {
      id: 'alexander', where: (D) => corner(D, 1, 3, 1, 1), title: 'Alexander Ave',
      text: 'Alexander Avenue has rowhouses and churches so pretty they call it Doctors’ Row. The antique shops open late.',
    },
    {
      id: 'mural', where: (D) => corner(D, 3, 4, -1, 1), title: 'The mural',
      text: 'A whole wall painted for somebody’s cousin who passed. Everybody on the block knows the story.',
    },
    {
      id: 'willis', where: (D) => corner(D, 2, 5, 1, -1), title: 'Willis Ave',
      text: 'The Willis Avenue Bridge goes into Manhattan. On marathon day the runners come over it and everybody screams.',
    },
    {
      id: 'stanns', where: (D) => corner(D, 4, 1, -1, 1), title: 'St. Anns Ave',
      text: 'St. Ann’s Church has a graveyard with people buried there before America was a country.',
    },
    {
      id: 'bruckner', where: (D) => corner(D, 5, 6, -1, -1), title: 'Bruckner Blvd',
      text: 'By the Bruckner the old piano factories are lofts now, and the expressway hums all night.',
    },
  ],
  finale: 'The South Bronx: where the whole world’s music got a new beat. Keep walking.',

  landmarks: buildJamaicaLandmarks,
};
