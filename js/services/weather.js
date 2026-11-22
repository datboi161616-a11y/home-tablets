// Live weather from Open-Meteo: free, no API key, no account.
import { settings } from '../config.js';

const CACHE_KEY = 'weather.v1';
const MAX_AGE = 15 * 60 * 1000;

// WMO weather codes -> label + icon name
const CODES = {
  0: ['Clear', 'sun'], 1: ['Mostly clear', 'sun'], 2: ['Partly cloudy', 'partly'],
  3: ['Cloudy', 'cloud'], 45: ['Fog', 'fog'], 48: ['Freezing fog', 'fog'],
  51: ['Light drizzle', 'rain'], 53: ['Drizzle', 'rain'], 55: ['Heavy drizzle', 'rain'],
  56: ['Freezing drizzle', 'rain'], 57: ['Freezing drizzle', 'rain'],
  61: ['Light rain', 'rain'], 63: ['Rain', 'rain'], 65: ['Heavy rain', 'rain'],
  66: ['Freezing rain', 'rain'], 67: ['Freezing rain', 'rain'],
  71: ['Light snow', 'snow'], 73: ['Snow', 'snow'], 75: ['Heavy snow', 'snow'],
  77: ['Snow grains', 'snow'], 80: ['Rain showers', 'rain'], 81: ['Rain showers', 'rain'],
  82: ['Heavy showers', 'rain'], 85: ['Snow showers', 'snow'], 86: ['Snow showers', 'snow'],
  95: ['Thunderstorm', 'storm'], 96: ['Thunderstorm', 'storm'], 99: ['Thunderstorm', 'storm'],
};

export function describe(code) {
  const [label, icon] = CODES[code] || ['—', 'cloud'];
  return { label, icon };
}

function zone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'auto'; } catch (e) { return 'auto'; }
}

export async function getWeather(loc) {
  // A damaged saved copy (or storage switched off) must not stop the weather showing.
  let cached = null;
  try { cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch (e) { cached = null; }
  if (cached && Date.now() - cached.at < MAX_AGE && cached.lat === loc.lat
    && (cached.lon === undefined || cached.lon === loc.lon) && cached.units === settings.units) return cached;

  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.search = new URLSearchParams({
    // Times in the display's own zone, so "tomorrow" and the hours match its clock.
    latitude: loc.lat, longitude: loc.lon, timezone: zone(),
    temperature_unit: settings.units,
    current: 'temperature_2m,weather_code,is_day',
    hourly: 'temperature_2m,weather_code',
    daily: 'temperature_2m_max,temperature_2m_min,weather_code',
    forecast_days: 7,
  });
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error('weather failed');
  const d = await res.json();
  // A reply with the temperature missing would otherwise read "0°": treat it as no answer,
  // so the screens keep what they had.
  if (!d || !d.current || typeof d.current.temperature_2m !== 'number' || !d.hourly || !d.daily) throw new Error('weather incomplete');

  // Next 5 hours starting with the coming hour (none if the list has run out)
  const now = Date.now();
  const start = d.hourly.time.findIndex((t) => new Date(t).getTime() > now);
  const hours = start < 0 ? [] : d.hourly.time.slice(start, start + 5)
    .map((t, i) => ({ t, raw: d.hourly.temperature_2m[start + i], code: d.hourly.weather_code[start + i] }))
    .filter((h) => typeof h.raw === 'number') // an hour with no temperature is left out, not shown as 0°
    .map((h) => ({ time: new Date(h.t), temp: Math.round(h.raw), code: h.code }));

  const result = {
    at: Date.now(),
    lat: loc.lat,
    lon: loc.lon,
    units: settings.units,
    temp: Math.round(d.current.temperature_2m),
    code: d.current.weather_code,
    high: Math.round(d.daily.temperature_2m_max[0]),
    low: Math.round(d.daily.temperature_2m_min[0]),
    hours,
    daily: d.daily,
  };
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(result)); } catch (e) { /* storage full: still show it */ }
  return result;
}
