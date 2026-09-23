import { buildJamaicaLandmarks } from '../landmarks/jamaica.js';

const corner = (D, i, j, sx, sz) => [D.colX(i) + sx * (D.nsW / 2 + 2), D.rowZ(j) + sz * (D.ewW / 2 + 2)];

export default {
  id: 'jamaica',
  name: 'Jamaica',
  borough: 'Queens',
  seed: 4321,
  blurb: 'Jamaica Ave’s patty shops and sneaker stores, the LIRR hub, King Manor, and planes sliding down toward JFK.',

  nsW: 14,
  ewW: 18,
  blockX: 64,
  blockZ: 92,
  sidewalk: 4.5,
  nsRoads: ['Sutphin Blvd', '148th St', '150th St', 'Parsons Blvd', '160th St', 'Guy R Brewer Blvd', '165th St', '168th St'],
  ewRoads: [
    'Hillside Ave', '87th Ave', '88th Ave', '89th Ave', 'Jamaica Ave',
    'Archer Ave', '94th Ave', 'Liberty Ave', '97th Ave', 'South Rd',
  ],
  commercialNS: [0, 3, 6], // Sutphin Blvd, Parsons Blvd, 165th St
  commercialEW: [0, 4, 5, 7], // Hillside, Jamaica Ave, Archer Ave, Liberty Ave
  signalEW: [],
  signalNS: [5],
  parkBlockNames: ['Rufus King Park'],
  edges: { north: 'city', west: 'city' },
  // downtown mid-rises between 89th Ave and 94th Ave, houses north and south of it
  residential: (c, r) => (r >= 3 && r <= 6 ? 'apartments' : r === 2 ? 'row' : 'detached'),
  // new towers going up around the station
  condoChance: (c, r) => (c <= 1 && r >= 4 && r <= 6 ? 0.35 : 0.03),
  condoFloors: [10, 24],
  parkBlocks: [[2, 3]], // Rufus King Park
  manor: true, // King Manor stands in it
  reserved: [{ c: 6, r: 3, part: 'south', depth: 30 }], // the old Valencia theater

  busRoute: 'Q44  SELECT BUS',
  shops: [
    'PATTIES', 'ROTI SHOP', 'JERK CHICKEN', 'BRAIDING', 'SNEAKERS', '99¢ STORE', 'GOLD & SILVER', 'BAKERY',
    'PHARMACY', 'CELL PHONES', 'TAX SERVICE', 'DELI', 'HAIR SALON', 'FISH MARKET', 'DISCOUNT', 'CARIBBEAN FOOD',
  ],
  neon: [
    ['PATTIES', '#ffb03b', true], ['JERK CHICKEN', '#ff5a36', false], ['ROTI', '#ffd23b', true],
    ['OXTAIL', '#ff9a3b', false], ['BRAIDING', '#ff7ad9', false], ['SNEAKERS', '#39d0ff', false],
    ['99¢', '#9dff4a', true], ['CHECKS CASHED', '#57ff8a', false], ['WIGS', '#c86bff', true],
    ['HALAL', '#4aff9d', false], ['GOLD', '#ffd23b', true], ['PHARMACY', '#4aff9d', false],
    ['BAKERY', '#ff9a3b', false], ['OPEN', '#ff2f5f', true], ['24 HR', '#39d0ff', false],
    ['JESUS SAVES', '#ff2f2f', false], ['CELL PHONES', '#39d0ff', false], ['TAX SERVICE', '#ffd23b', false],
    ['LIQUORS', '#57ff8a', false], ['DELI', '#9dff4a', true],
  ],

  el: {
    axis: 'ew',
    index: 6, // LIRR viaduct over 94th Ave
    height: 8.4,
    terminalStart: false,
    style: 'lirr',
    underLabel: 'under the LIRR',
    ride: 'the train',
    bullets: [],
    subtitle: 'LIRR · AIRTRAIN JFK',
    stations: [{ at: 0, name: 'JAMAICA' }],
  },

  fog: 0.0068,
  fogColor: 0x15101a,
  sky: { horizon: [0.12, 0.075, 0.08], cloud: [0.2, 0.1, 0.06] },

  start: (D) => ({
    pos: [D.colX(3) + D.nsW / 2 + 2.5, D.rowZ(4) - D.ewW / 2 - 2],
    look: [D.colX(6), 4, D.rowZ(4) - 3],
  }),

  memories: [
    {
      id: 'station', where: (D) => [D.colX(0) + D.nsW / 2 + 2.5, D.rowZ(6) - D.ewW / 2 - 2], title: 'Jamaica Station',
      text: 'Jamaica Station at three in the morning: the last trains out to the Island, the first ones back. Everybody here is either going home or just getting off work.',
    },
    {
      id: 'avenue', where: (D) => corner(D, 4, 4, -1, -1), title: 'Jamaica Ave',
      text: 'Jamaica Avenue sleeps with one eye open. Gates down, but the patty shop light is still on, and there’s music coming from somewhere.',
    },
    {
      id: 'manor', where: (D) => [(D.colX(2) + D.colX(3)) / 2, D.rowZ(4) - D.ewW / 2 - 3], title: 'King Manor',
      text: 'There’s a farmhouse from the 1700s in the middle of all this. A founding father lived in it. Now it’s squirrels, a chess table, and me.',
    },
    {
      id: 'valencia', where: (D) => corner(D, 6, 4, 1, -1), title: 'The Valencia',
      text: 'The old movie palace is a church now. They kept the lights. Some things were always going to be for Sundays.',
    },
    {
      id: 'planes', where: (D) => corner(D, 4, 9, 1, 1), title: 'South Rd',
      text: 'Every few minutes a plane comes down toward JFK, low and slow, full of people landing in a city they think is only Manhattan.',
    },
    {
      id: 'liberty', where: (D) => corner(D, 5, 7, 1, 1), title: 'Liberty Ave',
      text: 'Liberty Avenue smells like curry and fried bake. Guyana, Trinidad and Punjab, all on one block, all still open.',
    },
    {
      id: 'houses', where: (D) => corner(D, 4, 1, 1, 1), title: '87th Ave',
      text: 'Little gates, porch furniture under plastic, a string of Christmas lights nobody took down. It’s still blinking in September.',
    },
    {
      id: 'hillside', where: (D) => corner(D, 3, 0, -1, 1), title: 'Hillside Ave',
      text: 'Hillside Avenue, where the F train ends underground and the buses take over. In Queens everybody is one transfer away from somewhere.',
    },
  ],
  finale: 'Jamaica isn’t the end of the line. It’s where all the lines meet. Keep walking.',

  landmarks: buildJamaicaLandmarks,
};
