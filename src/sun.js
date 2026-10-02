// Where the real sun is over New York (NOAA's solar position approximation, good to a fraction of a degree),
// and when it rises and sets today. Live mode uses it so golden hour comes at the real hour and the light
// falls down the real streets from the real direction (Manhattanhenge included, on its days).

const RAD = Math.PI / 180;

function solar(date) {
  // fractional year, then the equation of time and the sun's declination
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  const day = (date.getTime() - start) / 86400000;
  const g = (2 * Math.PI / 365) * day;
  const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g)
    - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  return { eqTime, decl };
}

/** The sun right now: azimuth (degrees clockwise from north) and elevation (degrees above the horizon). */
export function sunPosition(date, lat, lon) {
  const { eqTime, decl } = solar(date);
  const utcMin = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
  const trueSolar = utcMin + eqTime + 4 * lon;
  const ha = (trueSolar / 4 - 180) * RAD;
  const phi = lat * RAD;
  const cosZen = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(ha);
  const zen = Math.acos(Math.max(-1, Math.min(1, cosZen)));
  // measured from south toward west, then turned to clockwise from north
  const az = (Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(phi) - Math.tan(decl) * Math.cos(phi)) / RAD + 540) % 360;
  return { az, el: 90 - zen / RAD };
}

/** Today's sunrise and sunset as minutes of the day, New York time. */
export function sunTimes(date, lat, lon) {
  const { eqTime, decl } = solar(date);
  const phi = lat * RAD;
  // the sun's center 0.833 degrees below the horizon (refraction and the disc's radius)
  const cosH = (Math.cos(90.833 * RAD) - Math.sin(phi) * Math.sin(decl)) / (Math.cos(phi) * Math.cos(decl));
  const H = Math.acos(Math.max(-1, Math.min(1, cosH))) / RAD;
  const noonUtc = 720 - 4 * lon - eqTime;
  // the UTC offset of New York on that date (daylight saving or not)
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23', minute: 'numeric' }).formatToParts(date);
  const nyMin = Number(parts.find((p) => p.type === 'hour').value) * 60 + Number(parts.find((p) => p.type === 'minute').value);
  const utcMin = date.getUTCHours() * 60 + date.getUTCMinutes();
  const offset = ((nyMin - utcMin + 1440 + 720) % 1440) - 720;
  return { rise: noonUtc - 4 * H + offset, set: noonUtc + 4 * H + offset };
}

// the look's own timeline: the sun is up at 6:30 and down at 7:00 pm there (see KEYS in look.js)
const LOOK_RISE = 390;
const LOOK_SET = 1140;
/** Real New York minute to the minute of the look's timeline, so dawn and dusk land on the real ones. */
export function lookMinuteFor(minute, times) {
  const { rise, set } = times;
  if (minute < rise) return (minute / rise) * LOOK_RISE;
  if (minute < set) return LOOK_RISE + ((minute - rise) / (set - rise)) * (LOOK_SET - LOOK_RISE);
  return LOOK_SET + ((minute - set) / (1440 - set)) * (1440 - LOOK_SET);
}
