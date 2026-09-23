import { buildJamaicaLandmarks } from '../landmarks/jamaica.js';

const corner = (D, i, j, sx, sz) => [D.colX(i) + sx * (D.nsW / 2 + 2), D.rowZ(j) + sz * (D.ewW / 2 + 2)];

export default {
  id: 'les',
  name: 'Lower East Side',
  borough: 'Manhattan',
  ll: [40.7195, -73.988], // real-map center (lat, lon)
  seed: 1903,
  blurb: 'Tenements and fire escapes, Katz’s pastrami, Orchard St shops, dive bars on Ludlow, and the F under Essex St.',

  nsW: 12,
  ewW: 15,
  blockX: 58,
  blockZ: 75,
  sidewalk: 3.8,
  nsRoads: ['Allen St', 'Orchard St', 'Ludlow St', 'Essex St', 'Norfolk St', 'Suffolk St', 'Clinton St'],
  ewRoads: ['E Houston St', 'Stanton St', 'Rivington St', 'Delancey St', 'Broome St', 'Grand St'],
  commercialNS: [1, 2, 3],
  commercialEW: [0, 3],
  signalEW: [5],
  signalNS: [6],
  edges: { north: 'city', west: 'city' },
  laundry: 0.55, // washing on the fire escapes
  residential: () => 'apartments',
  condoChance: () => 0.06,
  condoFloors: [8, 20],
  busRoute: 'M15  1 AV',
  shops: ['PASTRAMI', 'PICKLES', 'BAGELS & LOX', 'DIVE BAR', 'VINTAGE', 'KNISHES', 'TATTOO', 'GALLERY', 'RECORDS', 'DUMPLINGS', 'PIZZA', 'SNEAKERS', 'BODEGA', 'COCKTAILS', 'TACOS', 'LAUNDROMAT'],
  neon: [['KATZ’S', '#ff2f5f', true], ['BAR', '#ff2f5f', true], ['PICKLES', '#57ff8a', false], ['OPEN', '#ff2f5f', true], ['DELI', '#9dff4a', true], ['TATTOO', '#c86bff', true], ['LIVE MUSIC', '#39d0ff', false], ['PIZZA', '#ff5a36', false]],

  el: {
    axis: 'ns',
    index: 3,
    underground: true,
    height: 0,
    style: 'subway',
    bullets: [['F', '#ff6319'], ['J', '#996633'], ['M', '#ff6319'], ['Z', '#996633']],
    underLabel: '',
    ride: 'the F train',
    stations: [{ at: 3, name: 'DELANCEY ST–ESSEX ST' }],
  },

  fog: 0.0062,
  fogColor: 0x140f1c,
  sky: { horizon: [0.1, 0.075, 0.12], cloud: [0.17, 0.1, 0.1] },

  start: (D) => ({
    pos: [D.colX(2) + D.nsW / 2 + 2, D.rowZ(0) + D.ewW / 2 + 8],
    look: [D.colX(2) + 2, 6, D.rowZ(2)],
  }),

  memories: [
    {
      id: 'katz', where: (D) => corner(D, 2, 0, -1, 1), title: 'Katz’s',
      text: 'At Katz’s they hand you a ticket at the door. Lose it and it costs you. The pastrami is worth the risk.',
    },
    {
      id: 'orchard', where: (D) => corner(D, 1, 2, 1, 1), title: 'Orchard St',
      text: 'My great-grandparents lived in a tenement on Orchard Street, six people in two rooms. Now there’s a museum in one.',
    },
    {
      id: 'essex', where: (D) => corner(D, 3, 3, 1, -1), title: 'Essex Market',
      text: 'The Essex Market has cheese, fish, empanadas and a guy who has sold pickles here for forty years.',
    },
    {
      id: 'ludlow', where: (D) => corner(D, 2, 1, 1, 1), title: 'Ludlow St',
      text: 'Ludlow Street on Friday night: every bar has a band, every band thinks it’s about to make it. Some of them did.',
    },
    {
      id: 'williamsburgbridge', where: (D) => corner(D, 6, 3, -1, 1), title: 'Delancey St',
      text: 'Delancey runs straight onto the Williamsburg Bridge. The J train rumbles over it like a thunderstorm on rails.',
    },
    {
      id: 'fire', where: (D) => corner(D, 4, 4, -1, -1), title: 'Fire escapes',
      text: 'Every tenement has a fire escape, and every fire escape has somebody’s tomato plants on it.',
    },
  ],
  finale: 'The Lower East Side: everybody’s family started here, one way or another. Keep walking.',

  landmarks: buildJamaicaLandmarks,
};
