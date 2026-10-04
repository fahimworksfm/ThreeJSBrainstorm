// "Live NYC": the clock follows real New York time and the weather follows Open-Meteo's current
// reading for the neighborhood, and the air its air-quality reading (free, no key; data by Open-Meteo.com,
// CC BY 4.0).

/** Minutes past midnight right now in New York. */
export function nycMinute() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' })
    .formatToParts(new Date());
  const get = (t) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return get('hour') * 60 + get('minute') + get('second') / 60;
}

// WMO weather codes: https://open-meteo.com/en/docs
const WET = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]);
const SNOW = new Set([71, 73, 75, 77, 85, 86]);
const LABEL = {
  0: 'clear', 1: 'mostly clear', 2: 'partly cloudy', 3: 'overcast', 45: 'fog', 48: 'fog',
  51: 'drizzle', 53: 'drizzle', 55: 'drizzle', 61: 'light rain', 63: 'rain', 65: 'heavy rain',
  71: 'light snow', 73: 'snow', 75: 'heavy snow', 80: 'showers', 81: 'showers', 82: 'downpour', 95: 'thunderstorm', 96: 'thunderstorm with hail', 99: 'thunderstorm with hail',
};

/** The air right now at (lat, lon): fine particles (PM2.5, µg/m³) and the US AQI, or null. */
async function liveAir(lat, lon) {
  const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=pm2_5,us_aqi`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const c = (await r.json()).current;
    return Number.isFinite(c?.pm2_5) ? { pm25: c.pm2_5, aqi: c.us_aqi ?? null } : null;
  } catch {
    return null;
  }
}

/** The AQI's own words for a reading. */
export function aqiLabel(aqi) {
  if (aqi == null) return '';
  return aqi <= 50 ? 'good' : aqi <= 100 ? 'moderate' : aqi <= 150 ? 'unhealthy for some' : aqi <= 200 ? 'unhealthy' : aqi <= 300 ? 'very unhealthy' : 'hazardous';
}

/** The weather right now at (lat, lon), or null if Open-Meteo can't be reached. */
export async function liveWeather(lat, lon) {
  const air = liveAir(lat, lon);
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
    + '&current=temperature_2m,precipitation,weather_code,cloud_cover,visibility,wind_speed_10m&temperature_unit=fahrenheit&timezone=America%2FNew_York';
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const c = (await r.json()).current;
    const code = c.weather_code;
    const a = await air;
    // fine particles thicken the haze; wildfire smoke (PM2.5 well past 35) turns the air amber
    const pm = a?.pm25 ?? 0;
    return {
      aqi: a?.aqi ?? null,
      pm25: a?.pm25 ?? null,
      smoke: Math.min(0.7, Math.max(0, (pm - 35) / 120)),
      rain: WET.has(code) || c.precipitation > 0.05,
      snow: SNOW.has(code),
      storm: code >= 95, // thunderstorm (with or without hail)
      cloud: (c.cloud_cover ?? 30) / 100,
      // thick fog below ~1 km, a little haze below ~10 km
      haze: Math.min(3.5, (c.visibility ? Math.min(3, Math.max(1, 10000 / c.visibility)) : 1) * (1 + Math.max(0, pm - 12) / 60)),
      temp: Math.round(c.temperature_2m),
      label: LABEL[code] ?? 'cloudy',
    };
  } catch {
    return null;
  }
}
