import { buildJamaicaLandmarks } from '../landmarks/jamaica.js';

const corner = (D, i, j, sx, sz) => [D.colX(i) + sx * (D.nsW / 2 + 2), D.rowZ(j) + sz * (D.ewW / 2 + 2)];

export default {
  id: 'city-island',
  name: 'City Island',
  borough: 'The Bronx',
  ll: [40.847, -73.7865], // real-map center (lat, lon)
  seed: 1761,
  blurb: 'A little fishing village inside New York: seafood shacks, sailboats, clapboard houses, and water at the end of every street.',

  nsW: 12,
  ewW: 10,
  blockX: 70,
  blockZ: 60,
  sidewalk: 3.5,
  nsRoads: ['Minnieford Ave', 'City Island Ave', 'King Ave'],
  ewRoads: ['Fordham St', 'Hawkins St', 'Ditmars St', 'Centre St', 'Schofield St', 'Bay St'],
  commercialNS: [1],
  commercialEW: [],
  signalEW: [],
  signalNS: [],
  edges: { north: 'city', west: 'city' },
  residential: () => 'detached',
  condoChance: () => 0,
  condoFloors: [4, 6],
  busRoute: 'BX29  CITY IS',
  shops: ['LOBSTER', 'CLAM SHACK', 'BAIT & TACKLE', 'MARINA', 'ANTIQUES', 'FRIED SHRIMP', 'ICE CREAM', 'SAILMAKER', 'PIZZA', 'OYSTER BAR', 'BAKERY', 'GALLERY', 'DELI', 'BAR', 'SEAFOOD', 'GIFTS'],
  neon: [['LOBSTER', '#ff5a36', true], ['CLAMS', '#39d0ff', false], ['BAR', '#ff2f5f', true], ['OPEN', '#ff2f5f', true], ['SEAFOOD', '#57ff8a', true], ['ICE CREAM', '#ff9ad8', false]],

  el: {
    axis: 'ns',
    index: 1,
    underground: true,
    bus: true,
    route: 'Bx29',
    height: 0,
    style: 'subway',
    bullets: [['Bx29', '#0f4c9e']],
    underLabel: '',
    ride: 'the Bx29 bus',
    stations: [{ at: 0, name: 'CITY ISLAND AV / FORDHAM ST' }, { at: 4, name: 'CITY ISLAND AV / SCHOFIELD ST' }],
  },

  fog: 0.0062,
  fogColor: 0x140f1c,
  sky: { horizon: [0.1, 0.075, 0.12], cloud: [0.17, 0.1, 0.1] },
  foliage: 'summer',

  start: (D) => ({
    pos: [D.colX(1) + D.nsW / 2 + 2, D.rowZ(2)],
    look: [D.colX(1) + 2, 5, D.rowZ(5) + 40],
  }),

  memories: [
    {
      id: 'shack', where: (D) => corner(D, 1, 5, 1, 1), title: 'The clam shack',
      text: 'At the end of the island the seafood places fry everything, and the gulls wait on the railings for you to drop it.',
    },
    {
      id: 'sails', where: (D) => corner(D, 0, 2, -1, 1), title: 'The marina',
      text: 'The sailmakers here made sails for America’s Cup boats. Now the boats in the marina are mostly somebody’s uncle’s.',
    },
    {
      id: 'bridge', where: (D) => corner(D, 1, 0, 1, -1), title: 'The bridge',
      text: 'One little bridge connects City Island to the Bronx. Cross it and you’re in a New England fishing town.',
    },
    {
      id: 'houses', where: (D) => corner(D, 2, 3, -1, 1), title: 'King Ave',
      text: 'Old clapboard houses with porches and flagpoles. Everybody here was born here, or they’re a “mussel sucker” who moved in.',
    },
    {
      id: 'antiques', where: (D) => corner(D, 1, 3, -1, -1), title: 'City Island Ave',
      text: 'The antique shop on the avenue has ship bells, portholes, and a diving helmet that stares at you.',
    },
    {
      id: 'water', where: (D) => corner(D, 1, 5, -1, -1), title: 'The end of the road',
      text: 'At the end of City Island Avenue it just stops at the water. Long Island Sound, and the lights of the far shore.',
    },
  ],
  finale: 'City Island: New York has a fishing village, and it’s in the Bronx. Keep walking.',

  landmarks: buildJamaicaLandmarks,
};
