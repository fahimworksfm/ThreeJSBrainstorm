// The "Where to?" map: a schematic subway map like the one in every car. Each neighborhood you can ride to
// is a stop, roughly where it really is but spaced out so every name reads, and the real lines that serve
// them run between the stops in their own colors (the 7 out Queens Blvd to Flushing, the N/W from Astoria
// through Midtown and down to Coney Island, and so on). The Staten Island Ferry is the dashed line.
const W = 1000;
const H = 1000;

// stop: [x, y, label side]
const STOPS = {
  'city-island': [890, 120, 'l'],
  fordham: [600, 110, 'r'],
  'mott-haven': [520, 240, 'r'],
  harlem: [360, 250, 'l'],
  astoria: [560, 360, 'r'],
  midtown: [330, 440, 'l'],
  lic: [450, 500, 'l'],
  sunnyside: [610, 470, 'b'],
  'jackson-heights': [730, 440, 'b'],
  flushing: [880, 400, 'b'],
  'forest-hills': [770, 570, 'r'],
  jamaica: [890, 650, 'b'],
  les: [380, 600, 't'],
  chinatown: [270, 650, 'l'],
  williamsburg: [520, 640, 'r'],
  'bed-stuy': [560, 740, 'r'],
  rockaway: [840, 900, 'b'],
  coney: [460, 910, 'r'],
  'st-george': [130, 860, 'r'],
};
// the lines, in stop order
const LINES = [
  { c: '#b933ad', stops: ['midtown', 'lic', 'sunnyside', 'jackson-heights', 'flushing'] }, // 7
  { c: '#fccc0a', stops: ['astoria', 'midtown', 'chinatown', 'coney'] }, // N W (Q)
  { c: '#ee352e', stops: ['harlem', 'midtown'] }, // 1 2 3
  { c: '#00933c', stops: ['fordham', 'mott-haven', 'harlem', 'chinatown'] }, // 4 5 6
  { c: '#996633', stops: ['jamaica', 'les', 'chinatown'] }, // J Z
  { c: '#ff6319', stops: ['forest-hills', 'les', 'coney'] }, // F M
  { c: '#0039a6', stops: ['harlem', 'midtown', 'bed-stuy', 'rockaway'] }, // A C
  { c: '#a7a9ac', stops: ['williamsburg', 'les'] }, // L
];
const DASHED = [
  { c: '#f26c1a', stops: ['st-george', 'chinatown'], label: 'Staten Island Ferry' },
  { c: '#6d8fb3', stops: ['fordham', 'city-island'], label: 'Bx29 bus' },
];
// the borough names, faint, where each borough is on the map
const BOROS = [
  ['THE BRONX', 640, 60],
  ['MANHATTAN', 170, 330],
  ['QUEENS', 700, 330],
  ['BROOKLYN', 560, 985],
  ['STATEN ISLAND', 170, 800],
];

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const DARK = new Set(['#fccc0a', '#a7a9ac', '#808183']);

/** A metro-style path through the stops: straight runs joined by 45° bends. */
let STOP_AT = (id) => STOPS[id];
function route(ids) {
  const pts = ids.filter((id) => STOPS[id]).map((id) => STOP_AT(id));
  if (pts.length < 2) return '';
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const dx = x1 - x0;
    const dy = y1 - y0;
    // go diagonal for the shorter side, then straight for the rest
    const m = Math.min(Math.abs(dx), Math.abs(dy));
    const mx = x0 + Math.sign(dx) * m;
    const my = y0 + Math.sign(dy) * m;
    d += ` L${mx},${my} L${x1},${y1}`;
  }
  return d;
}

/**
 * Draw the map into el. districts: id -> def ({ name, el.bullets }); here: the id you're in; pick(id): ride there.
 */
export function drawSubwayMap(el, districts, here, pick) {
  // a tall screen (a phone held upright) gets the map stretched tall: same stops, more room between them
  const tall = el.clientHeight > el.clientWidth * 1.25;
  const sy = tall ? 1.55 : 1;
  const P = (id) => {
    const [x, y, side] = STOPS[id];
    return [x, Math.round(30 + (y - 30) * sy), side];
  };
  STOP_AT = P;
  const boros = BOROS.map(([n, x, y]) => `<text class="boro-name" x="${x}" y="${Math.round(30 + (y - 30) * sy)}">${n}</text>`).join('');
  const lines = LINES.map((l) => `<path class="line" d="${route(l.stops)}" stroke="${l.c}"/>`).join('');
  const dashed = DASHED.map((l) => `<path class="line dash" d="${route(l.stops)}" stroke="${l.c}"><title>${esc(l.label)}</title></path>`).join('');
  const stops = Object.keys(STOPS).filter((id) => districts[id]).map((id) => {
    const [x, y, side] = P(id);
    const d = districts[id];
    const isHere = id === here;
    const bullets = (d.el?.bullets ?? []).filter(([b]) => b.length <= 3).slice(0, 4);
    const chips = bullets.map(([b, c], i) => `<g transform="translate(${i * 21},0)"><circle r="9.5" fill="${c}"/><text class="bul" fill="${DARK.has(c) ? '#111' : '#fff'}" y="4">${esc(b)}</text></g>`).join('');
    const cw = bullets.length * 21;
    // name and bullets beside the stop: right, left, above or below
    let nx = 0;
    let ny = 0;
    let anchor = 'start';
    let bx = 0;
    let by = 0;
    if (side === 'r') { nx = 18; ny = 6; bx = nx + 10; by = 26; }
    else if (side === 'l') { nx = -18; ny = 6; anchor = 'end'; bx = -18 - cw + 10; by = 26; }
    else if (side === 't') { ny = -30; anchor = 'middle'; bx = -cw / 2 + 10; by = -18 + 2; ny = -36; }
    else { ny = 34; anchor = 'middle'; bx = -cw / 2 + 10; by = 50; }
    return `<g class="stop${isHere ? ' here' : ''}" data-id="${id}" transform="translate(${x},${y})" tabindex="0" role="button" aria-label="${esc(d.name)}${isHere ? ' (you are here)' : ''}">
      <circle class="hit" r="26"/>
      <circle class="dot" r="${isHere ? 12 : 10}"/>
      <text class="name" x="${nx}" y="${ny}" text-anchor="${anchor}">${esc(d.name)}</text>
      <g transform="translate(${bx},${by})">${chips}</g>
      ${isHere ? `<text class="you" x="${nx}" y="${side === 't' ? ny - 18 : by + 26}" text-anchor="${anchor}">YOU ARE HERE</text>` : ''}
    </g>`;
  }).join('');
  el.innerHTML = `<svg class="subway" viewBox="20 ${tall ? 0 : 30} 960 ${tall ? Math.round(1000 * sy) : 980}" preserveAspectRatio="xMidYMid meet">
    <rect width="${W}" height="${H}" class="water"/>
    ${boros}${dashed}${lines}${stops}
  </svg>`;
  const go = (g) => {
    if (g.dataset.id !== here) pick(g.dataset.id);
  };
  for (const g of el.querySelectorAll('.stop')) {
    g.addEventListener('click', (e) => {
      e.stopPropagation();
      go(g);
    });
    g.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        go(g);
      }
    });
  }
}
