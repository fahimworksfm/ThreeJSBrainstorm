import { buildJamaicaLandmarks } from '../landmarks/jamaica.js';

const corner = (D, i, j, sx, sz) => [D.colX(i) + sx * (D.nsW / 2 + 2), D.rowZ(j) + sz * (D.ewW / 2 + 2)];

export default {
  id: 'jackson-heights',
  name: 'Jackson Heights',
  borough: 'Queens',
  seed: 7474,
  blurb: 'The 7 roaring over Roosevelt Ave, saris and sweets on 74th St, momos, arepas and a hundred languages.',

  nsW: 14,
  ewW: 18,
  blockX: 60,
  blockZ: 96,
  sidewalk: 4.5,
  nsRoads: ['72nd St', '74th St', '75th St', '76th St', '78th St', '80th St', '82nd St', 'Junction Blvd'],
  ewRoads: ['Northern Blvd', '34th Ave', '35th Ave', '37th Ave', 'Roosevelt Ave', '41st Ave', 'Elmhurst Ave'],
  commercialNS: [1, 6], // 74th St, 82nd St
  commercialEW: [0, 3, 4], // Northern Blvd, 37th Ave, Roosevelt Ave
  signalEW: [],
  signalNS: [7],
  parkBlocks: [[4, 1]], // Travers Park
  parkBlockNames: ['Travers Park'],
  edges: { north: 'city', west: 'city' },
  // garden co-ops and walk-ups north of Roosevelt, rowhouses south
  residential: (c, r) => (r <= 3 ? 'apartments' : 'row'),
  condoChance: () => 0.02,
  condoFloors: [8, 12],
  busRoute: 'Q33  LAGUARDIA',
  shops: [
    'SARI PALACE', 'SWEETS & CHAAT', 'MOMO HOUSE', 'ARPAS & MÁS', 'TAQUERÍA', 'JOYERÍA', 'BIRYANI', 'GROCERY',
    'CELL PHONES', 'TRAVEL AGENCY', 'PANADERÍA', 'PHARMACY', 'SPICE BAZAAR', 'BARBER', '99¢ STORE', 'EMPANADAS',
  ],
  neon: [
    ['SWEETS', '#ff9a3b', true], ['SARI PALACE', '#ff4fd8', false], ['TAQUERÍA', '#57ff8a', false], ['MOMO', '#ffd23b', true],
    ['BIRYANI', '#ff5a36', false], ['JOYERÍA', '#ffd23b', true], ['EMPANADAS', '#ff9a3b', false], ['PHARMACY', '#4aff9d', false],
    ['99¢', '#9dff4a', true], ['BAKERY', '#ff9a3b', false], ['OPEN', '#ff2f5f', true], ['24 HR', '#39d0ff', false],
    ['BAR', '#ff2f5f', true], ['KARAOKE', '#c86bff', false],
  ],

  el: {
    axis: 'ew',
    index: 4, // the 7 over Roosevelt Ave
    height: 9.4,
    terminalStart: false,
    style: 'subway',
    bullets: [['7', '#b933ad']],
    underLabel: 'under the 7',
    ride: 'the 7 train',
    stations: [
      { at: 1, name: '74 ST–BROADWAY' },
      { at: 6, name: '82 ST–JACKSON HTS' },
    ],
  },

  fog: 0.0064,
  fogColor: 0x16111c,
  sky: { horizon: [0.11, 0.075, 0.1], cloud: [0.18, 0.1, 0.08] },

  start: (D) => ({
    pos: [D.colX(1) + D.nsW / 2 + 2.5, D.rowZ(4) - D.ewW / 2 - 12],
    look: [D.colX(1) + 3, 5, D.rowZ(4) + 40],
  }),

  memories: [
    {
      id: 'roosevelt', where: (D) => corner(D, 1, 4, 1, -1), title: 'Roosevelt Ave',
      text: 'Under the 7 the whole avenue shakes, and nobody stops talking. They just talk louder.',
    },
    {
      id: 'sweets', where: (D) => corner(D, 1, 3, 1, 1), title: '74th St',
      text: 'The sweet shop on 74th has trays of jalebi glowing like neon. I get one every time. I pretend I won’t.',
    },
    {
      id: 'momo', where: (D) => corner(D, 3, 4, -1, 1), title: 'Momo Crawl',
      text: 'Momos from a cart, eaten standing up in the rain. Some of the best meals in the city come in a paper tray.',
    },
    {
      id: 'travers', where: (D) => [(D.colX(4) + D.colX(5)) / 2, D.rowZ(1) + 30], title: 'Travers Park',
      text: 'Kids playing cricket at midnight in the park, somebody’s uncle umpiring from a folding chair.',
    },
    {
      id: 'coops', where: (D) => corner(D, 5, 2, 1, 1), title: 'The garden co-ops',
      text: 'Behind these buildings there are secret gardens, whole blocks of them, locked up like treasure.',
    },
    {
      id: 'northern', where: (D) => corner(D, 6, 0, -1, 1), title: 'Northern Blvd',
      text: 'Northern Boulevard never sleeps. It just idles, like a car outside a bodega.',
    },
    {
      id: 'junction', where: (D) => corner(D, 7, 4, -1, 1), title: 'Junction Blvd',
      text: 'At Junction Boulevard, Jackson Heights turns into Corona. Nobody hands you a map. You just know.',
    },
    {
      id: 'planes', where: (D) => corner(D, 5, 6, 1, -1), title: 'Elmhurst Ave',
      text: 'The planes into LaGuardia fly so low here you can read the airline on the tail.',
    },
  ],
  finale: 'They say you can hear a hundred and sixty languages in Jackson Heights. Tonight I heard every one. Keep walking.',

  landmarks: buildJamaicaLandmarks,
};
