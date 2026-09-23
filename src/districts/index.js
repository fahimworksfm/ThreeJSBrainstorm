import astoria from './astoria.js';
import jamaica from './jamaica.js';

/** Playable neighborhoods. Add a district file here to add a place to the map. */
export const DISTRICTS = { astoria, jamaica };

/** The whole map, including places that aren't built yet. */
export const BOROUGHS = [
  {
    name: 'Queens',
    places: [
      { id: 'astoria' },
      { id: 'jamaica' },
      { name: 'Long Island City' },
      { name: 'Jackson Heights' },
      { name: 'Flushing' },
      { name: 'Rockaway Beach' },
    ],
  },
  { name: 'Manhattan', places: [{ name: 'Midtown' }, { name: 'Harlem' }, { name: 'Chinatown' }, { name: 'Lower East Side' }] },
  { name: 'Brooklyn', places: [{ name: 'Williamsburg' }, { name: 'Bed-Stuy' }, { name: 'Coney Island' }] },
  { name: 'The Bronx', places: [{ name: 'Mott Haven' }, { name: 'Fordham' }, { name: 'City Island' }] },
  { name: 'Staten Island', places: [{ name: 'St. George' }] },
];
