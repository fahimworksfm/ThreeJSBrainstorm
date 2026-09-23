import astoria from './astoria.js';
import jamaica from './jamaica.js';
import lic from './lic.js';
import jacksonHeights from './jackson-heights.js';
import flushing from './flushing.js';
import sunnyside from './sunnyside.js';
import forestHills from './forest-hills.js';
import rockaway from './rockaway.js';
import midtown from './midtown.js';
import williamsburg from './williamsburg.js';
import fordham from './fordham.js';
import stGeorge from './st-george.js';
import harlem from './harlem.js';
import chinatown from './chinatown.js';
import les from './les.js';
import bedStuy from './bed-stuy.js';
import coney from './coney.js';
import mottHaven from './mott-haven.js';
import cityIsland from './city-island.js';

/** Playable neighborhoods. Add a district file here to add a place to the map. */
export const DISTRICTS = {
  astoria, jamaica, lic, 'jackson-heights': jacksonHeights, flushing, sunnyside, 'forest-hills': forestHills, rockaway,
  midtown, williamsburg, fordham, 'st-george': stGeorge,
  harlem, chinatown, les, 'bed-stuy': bedStuy, coney, 'mott-haven': mottHaven, 'city-island': cityIsland,
};

/** The whole map, including places that aren't built yet. */
export const BOROUGHS = [
  {
    name: 'Queens',
    places: [
      { id: 'astoria' },
      { id: 'jamaica' },
      { id: 'lic' },
      { id: 'sunnyside' },
      { id: 'jackson-heights' },
      { id: 'flushing' },
      { id: 'forest-hills' },
      { id: 'rockaway' },
    ],
  },
  { name: 'Manhattan', places: [{ id: 'midtown' }, { id: 'harlem' }, { id: 'chinatown' }, { id: 'les' }] },
  { name: 'Brooklyn', places: [{ id: 'williamsburg' }, { id: 'bed-stuy' }, { id: 'coney' }] },
  { name: 'The Bronx', places: [{ id: 'mott-haven' }, { id: 'fordham' }, { id: 'city-island' }] },
  { name: 'Staten Island', places: [{ id: 'st-george' }] },
];
