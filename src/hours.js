// Whether a shop is open: its real opening hours from OpenStreetMap (the common forms of the opening_hours
// tag: "24/7", "Mo-Sa 06:00-01:00; Su 07:00-00:00", "Mo,Th 11:00-19:00", hours past midnight), and for
// shops nobody has mapped hours for, the usual hours of that kind of place in New York.

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const toMin = (s) => {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + (m || 0);
};

/** Parse an opening_hours value into [day (0 Sun..6 Sat), from minute, to minute] spans, or null if unreadable. */
export function parseHours(text) {
  if (!text) return null;
  // a comment, a fallback ("||"), public holidays: the main rule is all we read
  let s = String(text).split('||')[0].replace(/"[^"]*"/g, '').replace(/\bPH\b[^;]*;?/g, '').trim();
  if (/^24\/7/.test(s)) return 'always';
  const spans = [];
  for (const rule of s.split(';').map((r) => r.trim()).filter(Boolean)) {
    const m = rule.match(/^((?:(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:\s*-\s*(?:Mo|Tu|We|Th|Fr|Sa|Su))?\s*,?\s*)*)\s*(.*)$/);
    if (!m) return null;
    const dayPart = m[1].trim();
    const timePart = m[2].trim();
    let days = [0, 1, 2, 3, 4, 5, 6];
    if (dayPart) {
      days = [];
      for (const piece of dayPart.split(',').map((x) => x.trim()).filter(Boolean)) {
        const [a, b] = piece.split('-').map((x) => DAYS.indexOf(x.trim()));
        if (a < 0) return null;
        if (b === undefined || b < 0) days.push(a);
        else for (let d = a; ; d = (d + 1) % 7) {
          days.push(d);
          if (d === b) break;
        }
      }
    }
    // a later rule for the same days replaces an earlier one (that's how the tag works)
    for (let i = spans.length - 1; i >= 0; i--) if (days.includes(spans[i][0])) spans.splice(i, 1);
    if (/^(off|closed)$/i.test(timePart)) continue;
    const times = [...timePart.matchAll(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/g)];
    if (!times.length) return null;
    for (const d of days) for (const [, a, b] of times) spans.push([d, toMin(a), toMin(b)]);
  }
  return spans.length ? spans : null;
}

/** Usual hours by kind of place, [opens, closes] in minutes (closes past 1440 means after midnight). */
const TYPICAL = [
  [/^(convenience|deli|kiosk|newsagent)$/, [6 * 60, 24 * 60 + 60]], // bodegas: early till late
  [/^(bar|pub|nightclub)$/, [16 * 60, 24 * 60 + 240]],
  [/^(restaurant|fast_food|ice_cream)$/, [11 * 60, 23 * 60]],
  [/^(cafe|bakery|coffee)$/, [6 * 60 + 30, 19 * 60]],
  [/^(pharmacy|chemist|supermarket|greengrocer)$/, [8 * 60, 22 * 60]],
  [/^(laundry|dry_cleaning)$/, [7 * 60, 22 * 60]],
  [/^(bank|post_office|doctors|dentist|clinic|library|bureau_de_change|money_transfer)$/, [9 * 60, 17 * 60]],
  [/^(cinema|theatre)$/, [11 * 60, 24 * 60]],
];

/** Is this place (a sign's { trade, hours, allNight }) open at minute of the day on weekday (0 Sunday)? */
export function isOpen(poi, weekday, minute) {
  if (poi.allNight) return true;
  const spans = poi._spans === undefined ? (poi._spans = parseHours(poi.hours)) : poi._spans;
  if (spans === 'always') return true;
  if (spans) {
    const prev = (weekday + 6) % 7;
    for (const [d, a, b] of spans) {
      const end = b <= a ? b + 1440 : b; // runs past midnight (or "00:00" meaning midnight)
      if (d === weekday && minute >= a && minute < end) return true;
      if (d === prev && end > 1440 && minute < end - 1440) return true;
    }
    return false;
  }
  // nobody mapped its hours: the usual ones for its trade (shops, by default, 10 to 8)
  const [a, b] = TYPICAL.find(([re]) => re.test(poi.trade ?? ''))?.[1] ?? [10 * 60, 20 * 60];
  return (minute >= a && minute < b) || minute < b - 1440;
}
