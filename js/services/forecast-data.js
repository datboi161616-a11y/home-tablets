// Detailed forecast for the Weather screen (Forecast.dc.html), from Open-Meteo:
// free, no API key, CORS-enabled. Asks for more fields than weather.js
// (feels-like, wind, sunrise/sunset, snow and rain totals). Cached 15 minutes.
import { settings } from '../config.js';
import { describe } from './weather.js';

const CACHE_KEY = 'forecast.v2';
const MAX_AGE = 15 * 60 * 1000;

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const compass = (deg) => COMPASS[Math.round(((deg % 360) + 360) % 360 / 45) % 8];

// Offline (or Open-Meteo down): the last saved forecast for this place, up to
// two days old, marked stale so the screen can say when it is from.
const STALE_MAX = 2 * 24 * 3600 * 1000;

export async function getForecast(loc) {
  let cached = null;
  try { cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch (e) { cached = null; }
  const samePlace = cached && cached.lat === loc.lat && cached.lon === loc.lon && cached.units === settings.units;
  if (samePlace && Date.now() - cached.at < MAX_AGE) return cached;
  try {
    return await download(loc);
  } catch (err) {
    if (samePlace && Date.now() - cached.at < STALE_MAX) return Object.assign({}, cached, { stale: true });
    throw err;
  }
}

async function download(loc) {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.search = new URLSearchParams({
    latitude: loc.lat, longitude: loc.lon, timezone: 'auto',
    temperature_unit: settings.units,
    wind_speed_unit: 'mph',
    precipitation_unit: 'inch',
    current: 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,is_day',
    hourly: 'temperature_2m,weather_code,precipitation_probability,snowfall,precipitation,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max,snowfall_sum,precipitation_sum,wind_speed_10m_max',
    forecast_days: 7,
  });
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error('forecast failed');
  const d = await res.json();

  // What's still to come today (from now until midnight, local time).
  const now = Date.now();
  const today = d.daily.time[0];
  let snowLeft = 0, rainLeft = 0, rainChance = 0, slickFrom = null, rainFrom = null;
  d.hourly.time.forEach((t, i) => {
    if (!t.startsWith(today) || new Date(t).getTime() < now - 3600000) return;
    snowLeft += d.hourly.snowfall[i] || 0;
    rainLeft += d.hourly.precipitation[i] || 0;
    rainChance = Math.max(rainChance, d.hourly.precipitation_probability[i] || 0);
    const freezing = settings.units === 'fahrenheit' ? 32 : 0;
    if (slickFrom == null && d.hourly.temperature_2m[i] <= freezing && (d.hourly.precipitation[i] > 0 || d.hourly.snowfall[i] > 0)) slickFrom = new Date(t);
    if (rainFrom == null && d.hourly.precipitation_probability[i] >= 50) rainFrom = new Date(t);
  });

  const result = {
    at: Date.now(),
    lat: loc.lat,
    lon: loc.lon,
    units: settings.units,
    temp: Math.round(d.current.temperature_2m),
    feels: Math.round(d.current.apparent_temperature),
    code: d.current.weather_code,
    isDay: !!d.current.is_day,
    wind: `${compass(d.current.wind_direction_10m)} ${Math.round(d.current.wind_speed_10m)} mph`,
    windSpeed: Math.round(d.current.wind_speed_10m),
    sunrise: d.daily.sunrise[0],
    sunset: d.daily.sunset[0],
    high: Math.round(d.daily.temperature_2m_max[0]),
    low: Math.round(d.daily.temperature_2m_min[0]),
    // Snowfall comes back in whatever unit hourly_units says (cm or inch).
    snowInches: /cm/.test(d.hourly_units?.snowfall || 'cm') ? snowLeft / 2.54 : snowLeft,
    rainInches: rainLeft,
    rainChance,
    slickFrom: slickFrom && slickFrom.toISOString(),
    rainFrom: rainFrom && rainFrom.toISOString(),
    // The next 12 hours, starting with this one.
    // (A saved copy keeps all of them so it can still show the right hours later.)
    hours: d.hourly.time.map((t, i) => ({ time: t, temp: Math.round(d.hourly.temperature_2m[i]), code: d.hourly.weather_code[i], rain: d.hourly.precipitation_probability[i] || 0, isDay: d.hourly.is_day ? !!d.hourly.is_day[i] : true }))
      .filter((h) => new Date(h.time).getTime() > now - 3600000).slice(0, 48),
    days: d.daily.time.map((t, i) => ({
      date: t,
      code: d.daily.weather_code[i],
      hi: Math.round(d.daily.temperature_2m_max[i]),
      lo: Math.round(d.daily.temperature_2m_min[i]),
      rain: d.daily.precipitation_probability_max[i],
    })),
  };
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(result)); } catch (e) { /* storage full: still show it */ }
  return result;
}

const fmtTime = (iso) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const fmtHour = (iso) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric' });
export { fmtTime };

// One line under the big temperature, e.g. "1–2 in. expected by tonight".
export function outlook(f) {
  if (f.snowInches >= 0.25) {
    const lo = Math.floor(f.snowInches), hi = Math.ceil(f.snowInches + 0.01);
    return lo >= 1 ? `${lo}–${hi} in. of snow expected by tonight` : 'Up to 1 in. of snow expected by tonight';
  }
  if (f.snowInches > 0) return 'A dusting of snow possible today';
  if (f.rainFrom) return `${f.rainChance}% chance of rain from ${fmtHour(f.rainFrom)}`;
  if (f.rainChance >= 20) return `${f.rainChance}% chance of rain later today`;
  return `High ${f.high}° · Low ${f.low}° · Dry today`;
}

// "Before you head out" advice from the conditions.
export function advice(f) {
  const cold = settings.units === 'fahrenheit'
    ? [f.feels <= 20, f.feels <= 40, f.feels <= 55, f.feels >= 85]
    : [f.feels <= -7, f.feels <= 4, f.feels <= 13, f.feels >= 29];
  const sky = describe(f.code).icon;
  const parts = [];
  if (f.snowInches >= 0.25 || sky === 'snow') parts.push('Heavy coat and boots today.');
  else if (cold[0]) parts.push('Bundle up: hats and gloves today.');
  else if (cold[1]) parts.push('Heavy coat today.');
  else if (cold[2]) parts.push('Grab a jacket on the way out.');
  else if (cold[3]) parts.push('Hot one. Bring water and sunscreen.');
  else parts.push('Nice out. No coat needed.');

  if (f.slickFrom) parts.push(`Roads may be slick after ${fmtHour(f.slickFrom)}.`);
  else if (f.rainFrom || f.rainChance >= 50 || sky === 'rain' || sky === 'storm') parts.push('Take an umbrella.');
  else if (f.windSpeed >= 20) parts.push('Very windy, hold on to your hat.');
  else if (sky === 'sun' && f.isDay) parts.push('Sunglasses weather.');
  return parts.join(' ');
}
