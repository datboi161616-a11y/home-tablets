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

export async function getWeather(loc) {
  const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
  if (cached && Date.now() - cached.at < MAX_AGE && cached.lat === loc.lat) return cached;

  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.search = new URLSearchParams({
    latitude: loc.lat, longitude: loc.lon, timezone: 'auto',
    temperature_unit: settings.units,
    current: 'temperature_2m,weather_code,is_day',
    hourly: 'temperature_2m,weather_code',
    daily: 'temperature_2m_max,temperature_2m_min,weather_code',
    forecast_days: 7,
  });
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error('weather failed');
  const d = await res.json();

  // Next 5 hours starting with the coming hour
  const now = Date.now();
  const start = d.hourly.time.findIndex((t) => new Date(t).getTime() > now);
  const hours = d.hourly.time.slice(start, start + 5).map((t, i) => ({
    time: new Date(t),
    temp: Math.round(d.hourly.temperature_2m[start + i]),
    code: d.hourly.weather_code[start + i],
  }));

  const result = {
    at: Date.now(),
    lat: loc.lat,
    temp: Math.round(d.current.temperature_2m),
    code: d.current.weather_code,
    high: Math.round(d.daily.temperature_2m_max[0]),
    low: Math.round(d.daily.temperature_2m_min[0]),
    hours,
    daily: d.daily,
  };
  localStorage.setItem(CACHE_KEY, JSON.stringify(result));
  return result;
}
