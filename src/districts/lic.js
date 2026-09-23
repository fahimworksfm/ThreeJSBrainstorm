import { buildLicLandmarks } from '../landmarks/lic.js';

const corner = (D, i, j, sx, sz) => [D.colX(i) + sx * (D.nsW / 2 + 2), D.rowZ(j) + sz * (D.ewW / 2 + 2)];

export default {
  id: 'lic',
  name: 'Long Island City',
  borough: 'Queens',
  seed: 7077,
  blurb: 'Glass towers on the old docks, the LONG ISLAND gantries, and all of Midtown lit up across the river.',

  nsW: 14,
  ewW: 15,
  blockX: 58,
  blockZ: 84,
  sidewalk: 5,
  nsRoads: ['Center Blvd', '2nd St', '5th St', 'Vernon Blvd', '10th St', '11th St', '21st St'],
  ewRoads: ['44th Dr', '45th Ave', '46th Ave', '47th Ave', '48th Ave', '49th Ave', '50th Ave', 'Borden Ave'],
  commercialNS: [3], // Vernon Blvd
  commercialEW: [5], // 49th Ave
  signalEW: [2],
  signalNS: [0, 6],
  parkName: 'Gantry Plaza',
  riverName: 'Gantry Plaza State Park',
  edges: { north: 'city', west: 'river' },
  // towers on the waterfront, walk-ups and rowhouses further in
  residential: (c) => (c <= 1 ? 'apartments' : c >= 5 ? 'row' : 'apartments'),
  condoChance: (c) => (c <= 1 ? 0.75 : c <= 3 ? 0.25 : 0.04),
  condoFloors: [14, 40],
  busRoute: 'Q103  VERNON BLVD',
  shops: [
    'VERNON WINE', 'BAGELS', 'PIZZA', 'COFFEE', 'TACOS', 'RAMEN', 'BAKERY', 'PHARMACY',
    'DELI', 'FLOWERS', 'BIKE SHOP', 'DINER', 'BAR & GRILL', 'DRY CLEANERS', 'SUSHI', 'GROCERY',
  ],
  neon: [
    ['BAR', '#ff2f5f', true], ['PIZZA', '#ff5a36', false], ['COFFEE', '#ffa56b', false], ['OPEN', '#ff2f5f', true],
    ['RAMEN', '#ffd23b', true], ['TACOS', '#57ff8a', false], ['WINE', '#c86bff', true], ['DINER', '#ff3b6b', true],
    ['24 HR', '#39d0ff', false], ['BAGELS', '#ffb03b', false], ['DELI', '#9dff4a', true],
  ],

  el: {
    axis: 'ns',
    index: 3, // the 7 runs under Vernon Blvd here
    underground: true,
    height: 0,
    style: 'subway',
    bullets: [['7', '#b933ad']],
    underLabel: '',
    ride: 'the 7 train',
    stations: [{ at: 2, name: 'VERNON BLVD–JACKSON AV' }],
  },

  fog: 0.0055,
  fogColor: 0x121a2a,
  sky: { horizon: [0.09, 0.08, 0.13], cloud: [0.15, 0.1, 0.1] },

  start: (D) => ({
    pos: [D.riverX + 4, D.rowZ(2) + 18],
    look: [D.riverX - 600, 60, D.rowZ(2) - 40],
  }),

  memories: [
    {
      id: 'gantries', where: (D) => [D.riverX + 3, D.rowZ(2) + 17], title: 'Gantry Plaza',
      text: 'The gantries used to lift whole railroad cars onto barges. Now they lift nothing but the view.',
    },
    {
      id: 'vernon', where: (D) => corner(D, 3, 5, 1, 1), title: 'Vernon Blvd',
      text: 'Vernon Boulevard still feels like a small town that forgot to tell the towers.',
    },
    {
      id: 'towers', where: (D) => corner(D, 1, 3, 1, -1), title: 'Center Blvd',
      text: 'Forty floors of glass, and every window has somebody looking at Manhattan instead of at Queens.',
    },
    {
      id: 'seven', where: (D) => corner(D, 3, 2, 1, 1), title: 'Vernon Blvd–Jackson Av',
      text: 'One stop on the 7 and you’re under the river. One stop back and you’re home.',
    },
    {
      id: 'sign', where: (D) => [D.riverX + 3, D.rowZ(5)], title: 'The red sign',
      text: 'The red sign by the water has been glowing longer than any of these buildings have stood.',
    },
    {
      id: 'rowhouses', where: (D) => corner(D, 5, 1, 1, 1), title: '11th St',
      text: 'Two blocks from the towers the rowhouses begin again, with their stoops and their dogs and their opinions.',
    },
    {
      id: 'borden', where: (D) => corner(D, 4, 7, -1, -1), title: 'Borden Ave',
      text: 'Borden Avenue runs straight at the Midtown Tunnel. Everybody here is on their way to somewhere else.',
    },
    {
      id: 'dock', where: (D) => [D.riverX + 3, D.rowZ(6) + 20], title: 'The ferry dock',
      text: 'The last ferry’s lights are still out on the water. It takes its time. So do I.',
    },
  ],
  finale: 'Long Island City looks at Manhattan all night long. Tonight Manhattan looked back. Keep walking.',

  landmarks: buildLicLandmarks,
};
