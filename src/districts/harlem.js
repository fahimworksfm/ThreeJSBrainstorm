import { buildJamaicaLandmarks } from '../landmarks/jamaica.js';

const corner = (D, i, j, sx, sz) => [D.colX(i) + sx * (D.nsW / 2 + 2), D.rowZ(j) + sz * (D.ewW / 2 + 2)];

export default {
  id: 'harlem',
  name: 'Harlem',
  borough: 'Manhattan',
  ll: [40.8085, -73.9465], // real-map center (lat, lon)
  seed: 1250,
  blurb: '125th Street and the Apollo marquee, brownstones on Strivers’ Row, soul food and jazz, the 2/3 under Lenox Ave.',

  nsW: 18,
  ewW: 14,
  blockX: 150,
  blockZ: 62,
  sidewalk: 4.5,
  nsRoads: ['Frederick Douglass Blvd', 'Adam Clayton Powell Jr Blvd', 'Malcolm X Blvd', '5th Ave', 'Madison Ave'],
  ewRoads: ['W 130th St', 'W 129th St', 'W 128th St', 'W 127th St', 'W 126th St', 'W 125th St', 'W 124th St', 'W 123rd St', 'W 122nd St'],
  commercialNS: [1, 2],
  commercialEW: [5],
  signalEW: [0],
  signalNS: [0, 3],
  edges: { north: 'city', west: 'city' },
  laundry: 0.55, // washing on the fire escapes
  residential: (c, r) => (r === 5 ? 'apartments' : 'row'),
  condoChance: (c, r) => (r === 5 ? 0.2 : 0.02),
  condoFloors: [10, 16],
  busRoute: 'M101  125 ST',
  shops: ['SOUL FOOD', 'JAZZ CLUB', 'BARBER', 'CHURCH', 'RECORDS', 'FISH FRY', 'HAT SHOP', 'BAKERY', 'AFRICAN BRAIDS', 'SNEAKERS', 'PHARMACY', 'BBQ', 'BOOKS', 'DELI', 'WINGS', 'COFFEE'],
  neon: [['APOLLO', '#ff2f5f', true], ['JAZZ', '#39d0ff', true], ['SOUL FOOD', '#ffb03b', false], ['BAR', '#ff2f5f', true], ['OPEN', '#ff2f5f', true], ['LOUNGE', '#c86bff', false], ['WINGS', '#ffd23b', false], ['24 HR', '#39d0ff', false]],
  bigSigns: { ll: [40.8100, -73.9500], radius: 60, chance: 0.4 },

  el: {
    axis: 'ns',
    index: 2,
    underground: true,
    height: 0,
    style: 'subway',
    bullets: [['2', '#ee352e'], ['3', '#ee352e']],
    underLabel: '',
    ride: 'the 2 train',
    stations: [{ at: 5, name: '125 ST' }],
  },

  fog: 0.0062,
  fogColor: 0x140f1c,
  sky: { horizon: [0.1, 0.075, 0.12], cloud: [0.17, 0.1, 0.1] },

  start: (D) => ({
    pos: [D.colX(1) + D.nsW / 2 + 2.5, D.rowZ(5) + D.ewW / 2 + 8],
    look: [D.colX(1) + 60, 6, D.rowZ(5) + 2],
  }),

  memories: [
    {
      id: 'apollo', where: (D) => corner(D, 1, 5, 1, -1), title: 'The Apollo',
      text: 'Amateur Night at the Apollo: rub the Tree of Hope stump and go out there. The crowd will tell you the truth.',
    },
    {
      id: 'strivers', where: (D) => corner(D, 0, 1, 1, 1), title: 'Strivers’ Row',
      text: 'The rowhouses on Strivers’ Row still have signs on the gates: walk your horses. Nobody has had a horse in a hundred years.',
    },
    {
      id: 'lenox', where: (D) => corner(D, 2, 3, -1, 1), title: 'Lenox Ave',
      text: 'Lenox Avenue after church lets out: hats, suits, and a line out the door at the soul food spot.',
    },
    {
      id: '125th', where: (D) => corner(D, 2, 5, 1, 1), title: '125th St',
      text: 'On 125th Street somebody is always selling incense, somebody is always preaching, and somebody is always dancing.',
    },
    {
      id: 'park', where: (D) => corner(D, 3, 7, 1, -1), title: 'Marcus Garvey Park',
      text: 'In Marcus Garvey Park there is an old fire watchtower, and on Saturdays the drummers circle up under the trees.',
    },
    {
      id: 'jazz', where: (D) => corner(D, 1, 3, -1, -1), title: 'The jazz spot',
      text: 'A basement club where the band plays till 4 a.m. and the drummer’s grandfather played the same room.',
    },
  ],
  finale: 'Harlem: the renaissance never really ended, it just kept the lights on. Keep walking.',

  landmarks: buildJamaicaLandmarks,
};
