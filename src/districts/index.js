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

/** Playable neighborhoods. Add a district file here to add a place to the map. */
export const DISTRICTS = {
  astoria, jamaica, lic, 'jackson-heights': jacksonHeights, flushing, sunnyside, 'forest-hills': forestHills, rockaway,
  midtown, williamsburg, fordham, 'st-george': stGeorge,
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
  { name: 'Manhattan', places: [{ id: 'midtown' }, { name: 'Harlem' }, { name: 'Chinatown' }, { name: 'Lower East Side' }] },
  { name: 'Brooklyn', places: [{ id: 'williamsburg' }, { name: 'Bed-Stuy' }, { name: 'Coney Island' }] },
  { name: 'The Bronx', places: [{ name: 'Mott Haven' }, { id: 'fordham' }, { name: 'City Island' }] },
  { name: 'Staten Island', places: [{ id: 'st-george' }] },
];
