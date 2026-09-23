import { buildJamaicaLandmarks } from '../landmarks/jamaica.js';

const corner = (D, i, j, sx, sz) => [D.colX(i) + sx * (D.nsW / 2 + 2), D.rowZ(j) + sz * (D.ewW / 2 + 2)];

export default {
  id: 'fordham',
  name: 'Fordham',
  borough: 'The Bronx',
  ll: [40.8615, -73.9005], // real-map center (lat, lon)
  seed: 1874,
  blurb: 'Fordham Road’s sneaker stores and street vendors, the 4 train rattling over Jerome Ave, and the Grand Concourse.',

  nsW: 14,
  ewW: 20,
  blockX: 80,
  blockZ: 95,
  sidewalk: 5,
  nsRoads: ['Jerome Ave', 'Creston Ave', 'Grand Concourse', 'Valentine Ave', 'Webster Ave'],
  ewRoads: ['E Kingsbridge Rd', 'E 192nd St', 'E Fordham Rd', 'E 188th St', 'E 184th St', 'E 183rd St'],
  commercialNS: [0, 2], // Jerome Ave, Grand Concourse
  commercialEW: [0, 2], // Kingsbridge Rd, Fordham Rd
  signalEW: [5],
  signalNS: [3, 4],
  edges: { north: 'city', west: 'city' },
  residential: () => 'apartments',
  condoChance: () => 0.03,
  condoFloors: [8, 14],
  busRoute: 'BX12  FORDHAM RD',
  shops: [
    'SNEAKERS', 'JEWELRY', 'CELL PHONES', 'PIZZA', 'CHICKEN & WAFFLES', 'BODEGA', 'BEAUTY SUPPLY', 'PHARMACY',
    'BARBER', 'CUCHIFRITOS', 'DISCOUNT', 'PANADERÍA', 'MOFONGO', 'FURNITURE', 'CHECK CASHING', 'DELI',
  ],
  neon: [
    ['SNEAKERS', '#39d0ff', true], ['OPEN', '#ff2f5f', true], ['PIZZA', '#ff5a36', false], ['JEWELRY', '#ffd23b', true],
    ['DELI', '#9dff4a', true], ['BAR', '#ff2f5f', true], ['24 HR', '#39d0ff', false], ['BARBER', '#c86bff', false],
    ['CHICKEN', '#ffb03b', false], ['PANADERÍA', '#ff9a3b', true],
  ],

  el: {
    axis: 'ns',
    index: 0, // the 4 over Jerome Ave
    height: 10,
    terminalStart: false,
    style: 'subway',
    bullets: [['4', '#00933c']],
    underLabel: 'under the 4',
    ride: 'the 4 train',
    stations: [
      { at: 0, name: 'KINGSBRIDGE RD' },
      { at: 2, name: 'FORDHAM RD' },
      { at: 5, name: '183 ST' },
    ],
  },

  fog: 0.0062,
  fogColor: 0x140f1b,
  sky: { horizon: [0.1, 0.075, 0.11], cloud: [0.17, 0.1, 0.09] },

  start: (D) => ({
    pos: [D.colX(0) + D.nsW / 2 + 2.5, D.rowZ(2) + D.ewW / 2 + 12],
    look: [D.colX(0) + 2, 7, D.rowZ(2) + 70],
  }),

  memories: [
    {
      id: 'fordhamrd', where: (D) => corner(D, 2, 2, 1, 1), title: 'Fordham Rd',
      text: 'Fordham Road on a Saturday is a parade with no floats. Speakers outside every store, all playing different songs.',
    },
    {
      id: 'concourse', where: (D) => corner(D, 2, 4, -1, -1), title: 'The Grand Concourse',
      text: 'The Concourse was built to be the Champs-Élysées of the Bronx. The Art Deco buildings still dress up for it.',
    },
    {
      id: 'jerome', where: (D) => corner(D, 0, 3, 1, 1), title: 'Under the 4',
      text: 'Under the 4 train on Jerome Avenue there are tire shops and cuchifritos and the sun comes through in stripes.',
    },
    {
      id: 'poe', where: (D) => corner(D, 3, 0, 1, 1), title: 'Poe Cottage',
      text: 'Edgar Allan Poe lived in a tiny cottage up here. Wrote Annabel Lee in it. Now it sits in a park by the Concourse.',
    },
    {
      id: 'webster', where: (D) => corner(D, 4, 2, -1, -1), title: 'Webster Ave',
      text: 'Past Webster Avenue is the university and the Botanical Garden. From here you can hear Metro-North passing through.',
    },
    {
      id: 'kingsbridge', where: (D) => corner(D, 1, 0, 1, 1), title: 'The Armory',
      text: 'The Kingsbridge Armory looks like a castle somebody forgot to finish. It’s one of the biggest buildings in the world.',
    },
  ],
  finale: 'The Bronx: where hip-hop was born and everybody’s abuela knows your business. Keep walking.',

  landmarks: buildJamaicaLandmarks,
};
