// Detailed forecast for the Weather screen (Forecast.dc.html), from Open-Meteo:
// free, no API key, CORS-enabled. Asks for more fields than weather.js
// (feels-like, wind and gusts, humidity, UV, sunrise/sunset, rain and snow amounts).
// Cached 15 minutes.
//
// Wind, rain and snow follow the owner's units: mph and inches with Fahrenheit,
// km/h, mm and cm with Celsius.
//
// The saved copy keeps every hour of the week, and everything that depends on "now"
// (what is still to come today, tonight's low, the hour strip) is worked out again
// each time it is read: an old copy shown while the Wi-Fi is down still talks about
// the right hours.
import { settings } from '../config.js';
import { describe } from './weather.js';

const CACHE_KEY = 'forecast.v2'; // (home.js reads sunrise/sunset from it too)
const VERSION = 3;
const MAX_AGE = 15 * 60 * 1000;

// Offline (or Open-Meteo down): the last saved forecast for this place, up to
// two days old, marked stale so the screen can say when it is from.
const STALE_MAX = 2 * 24 * 3600 * 1000;

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const COMPASS_WORDS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
const point = (deg) => Math.round(((deg % 360) + 360) % 360 / 45) % 8;
const compass = (deg) => COMPASS[point(deg)];

/** A number, or null when the forecast left it out (never NaN, never a made-up 0). */
const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
const round = (v) => (num(v) == null ? null : Math.round(v));
const pick = (arr, i) => (arr ? num(arr[i]) : null);

/**
 * The display's own time zone, so every time in the forecast ("rain from 3 PM", sunrise,
 * which day is "today") matches the clock on the screen, even for a town chosen by hand
 * in another zone. Open-Meteo's "auto" (the town's zone) if the browser can't say.
 */
export function zone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'auto'; } catch (e) { return 'auto'; }
}

/** Is the owner on Celsius (and so km/h, mm and cm)? */
export const metric = () => settings.units === 'celsius';

/** Today's date as Open-Meteo writes it ("2026-11-18", local time). */
export function isoDay(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * The forecast for this place. `fresh: true` skips the 15-minute saved copy (the
 * "Try again" button). Offline: the last saved one with `stale: true`.
 */
export async function getForecast(loc, { fresh = false } = {}) {
  let cached = null;
  try { cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch (e) { cached = null; }
  const samePlace = cached && cached.lat === loc.lat && cached.lon === loc.lon && cached.units === settings.units
    && (!cached.tz || cached.tz === zone());
  if (!fresh && samePlace && cached.v === VERSION && Date.now() - cached.at < MAX_AGE) return freshen(cached);
  try {
    return freshen(await download(loc));
  } catch (err) {
    if (samePlace && Date.now() - cached.at < STALE_MAX) return freshen(Object.assign({}, cached, { stale: true }));
    throw err;
  }
}

async function download(loc) {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.search = new URLSearchParams({
    latitude: loc.lat, longitude: loc.lon, timezone: zone(),
    temperature_unit: settings.units,
    wind_speed_unit: metric() ? 'kmh' : 'mph',
    precipitation_unit: metric() ? 'mm' : 'inch',
    current: 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,relative_humidity_2m,is_day',
    hourly: 'temperature_2m,apparent_temperature,weather_code,precipitation_probability,snowfall,precipitation,is_day,wind_speed_10m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max,snowfall_sum,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant,uv_index_max,daylight_duration',
    forecast_days: 7,
  });
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error('forecast failed');
  const d = await res.json();
  if (!d || !d.current || !d.hourly || !d.daily || !d.daily.time || !d.daily.time.length) throw new Error('forecast incomplete');

  const H = d.hourly, D = d.daily, C = d.current;
  const units = d.hourly_units || {};
  const metricNow = metric();
  const windSpeed = round(C.wind_speed_10m);
  const windUnit = metricNow ? 'km/h' : 'mph';
  const result = {
    v: VERSION,
    at: Date.now(),
    lat: loc.lat,
    lon: loc.lon,
    units: settings.units,
    tz: zone(),
    windUnit,
    rainUnit: /mm/.test(units.precipitation || (metricNow ? 'mm' : 'inch')) ? 'mm' : 'in',
    snowUnit: /cm/.test(units.snowfall || (metricNow ? 'cm' : 'inch')) ? 'cm' : 'in',
    temp: round(C.temperature_2m),
    feels: round(C.apparent_temperature),
    code: C.weather_code,
    isDay: !!C.is_day,
    windSpeed,
    windDir: num(C.wind_direction_10m),
    gusts: round(C.wind_gusts_10m),
    humidity: round(C.relative_humidity_2m),
    // Today's sun and range at the top too (home.js and launcher.js read sunrise/sunset
    // straight from the saved copy to know if it is dark out).
    sunrise: D.sunrise ? D.sunrise[0] : null,
    sunset: D.sunset ? D.sunset[0] : null,
    high: round(pick(D.temperature_2m_max, 0)),
    low: round(pick(D.temperature_2m_min, 0)),
    wind: windSpeed == null ? '--' :`${C.wind_direction_10m != null ? `${compass(C.wind_direction_10m)} ` : ''}${windSpeed} ${windUnit}`,
    // Every hour from the start of today, so a saved copy can still show the right
    // ones later and each day can be opened hour by hour.
    hours: (H.time || []).map((t, i) => ({
      time: t,
      temp: round(pick(H.temperature_2m, i)),
      code: H.weather_code ? H.weather_code[i] : null,
      rain: pick(H.precipitation_probability, i) || 0,
      isDay: H.is_day ? !!H.is_day[i] : true,
      wet: pick(H.precipitation, i) || 0,   // rain + melted snow, in rainUnit
      snow: pick(H.snowfall, i) || 0,       // in snowUnit
      wind: round(pick(H.wind_speed_10m, i)),
      feels: round(pick(H.apparent_temperature, i)), // (null in a copy saved before this was asked for)
    })),
    days: D.time.map((t, i) => ({
      date: t,
      code: D.weather_code ? D.weather_code[i] : null,
      hi: round(pick(D.temperature_2m_max, i)),
      lo: round(pick(D.temperature_2m_min, i)),
      rain: pick(D.precipitation_probability_max, i) || 0,
      wet: pick(D.precipitation_sum, i) || 0,
      snow: pick(D.snowfall_sum, i) || 0,
      sunrise: D.sunrise ? D.sunrise[i] : null,
      sunset: D.sunset ? D.sunset[i] : null,
      wind: round(pick(D.wind_speed_10m_max, i)),
      gusts: round(pick(D.wind_gusts_10m_max, i)),
      dir: pick(D.wind_direction_10m_dominant, i),
      uv: pick(D.uv_index_max, i),
      light: pick(D.daylight_duration, i),  // seconds of daylight, to the second (may be missing)
    })),
  };
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(result)); } catch (e) { /* storage full: still show it */ }
  return result;
}

/**
 * Everything that depends on the clock, worked out for right now from the saved hours
 * (so it is right for a copy from this morning too). Safe to call again later, e.g.
 * when the hour changes with the screen left open.
 */
export function freshen(saved) {
  const f = Object.assign({}, saved);
  const now = Date.now();
  const today = isoDay();
  const metricNow = f.units === 'celsius';
  const freezing = metricNow ? 0 : 32;
  const hours = (f.hours || []).filter((h) => h && h.time);
  const ms = (h) => new Date(h.time).getTime();
  const ahead = hours.filter((h) => ms(h) > now - 3600000); // this hour onwards

  // Today's own numbers (a copy saved yesterday has today further down the list).
  const day = (f.days || []).find((x) => x.date === today);
  if (day) {
    f.high = day.hi; f.low = day.lo;
    f.sunrise = day.sunrise || f.sunrise; f.sunset = day.sunset || f.sunset;
    f.uv = day.uv;
    f.dayGusts = day.gusts;
  }
  // When today's high and low come (from the whole day's hours).
  const todays = hours.filter((h) => h.time.slice(0, 10) === today && h.temp != null);
  if (todays.length) {
    const hiH = todays.reduce((a, b) => (b.temp > a.temp ? b : a));
    const loH = todays.reduce((a, b) => (b.temp < a.temp ? b : a));
    f.highAt = hiH.time; f.lowAt = loH.time;
  }

  // An old copy: the "now" numbers in it are from when it was saved. Use what that
  // forecast expected for this hour instead, and say so.
  if (f.stale && now - f.at > 90 * 60 * 1000 && ahead.length && ahead[0].temp != null) {
    const h = ahead[0];
    f.temp = h.temp; f.code = h.code; f.isDay = h.isDay; f.feels = null;
    if (h.wind != null) { f.windSpeed = h.wind; f.wind = `${h.wind} ${f.windUnit || 'mph'}`; }
    f.gusts = null; f.humidity = null; f.windDir = null;
    f.estimated = true;
  }

  // What's still to come today (from this hour until midnight).
  let snowLeft = 0, rainLeft = 0, rainChance = 0, slickFrom = null, rainFrom = null;
  ahead.forEach((h) => {
    if (h.time.slice(0, 10) !== today) return;
    snowLeft += h.snow || 0;
    rainLeft += h.wet || 0;
    rainChance = Math.max(rainChance, h.rain || 0);
    if (slickFrom == null && h.temp != null && h.temp <= freezing && ((h.wet || 0) > 0 || (h.snow || 0) > 0)) slickFrom = h.time;
    if (rainFrom == null && h.rain >= 50) rainFrom = h.time;
  });
  f.snowLeft = snowLeft;
  f.rainLeft = rainLeft;
  f.snowInches = f.snowUnit === 'cm' ? snowLeft / 2.54 : snowLeft;
  f.rainInches = f.rainUnit === 'mm' ? rainLeft / 25.4 : rainLeft;
  f.rainChance = rainChance;
  f.slickFrom = slickFrom;

  // Raining right now? Then "from 9 PM" is no use: say until when instead.
  const sky = describe(f.code).icon;
  const first = ahead[0];
  f.rainNow = sky === 'rain' || sky === 'storm' || !!(first && first.rain >= 50 && first.wet > 0 && !first.snow);
  f.rainUntil = null;
  if (f.rainNow) {
    const dry = ahead.slice(1, 13).find((h) => h.rain < 30 && !h.wet);
    f.rainUntil = dry ? dry.time : null;
    rainFrom = null;
  }
  f.rainFrom = rainFrom;

  // The next twelve hours (in the evening that is tomorrow morning too).
  const next12 = ahead.slice(0, 12);
  const wet = next12.find((h) => h.rain >= 50);
  f.wetFrom = wet ? wet.time : null;
  f.next12 = {
    chance: next12.reduce((m, h) => Math.max(m, h.rain || 0), 0),
    wet: next12.reduce((s, h) => s + (h.wet || 0), 0),
    snow: next12.reduce((s, h) => s + (h.snow || 0), 0),
  };

  // Tonight: from now until 8 the next morning, asked from mid-afternoon on.
  const hourNow = new Date().getHours();
  f.evening = hourNow >= 17 || hourNow < 4;
  const morning = new Date(); if (hourNow >= 4) morning.setDate(morning.getDate() + 1); morning.setHours(8, 0, 0, 0);
  const night = ahead.filter((h) => ms(h) <= morning.getTime() && h.temp != null);
  f.tonightLow = hourNow >= 15 || hourNow < 4 ? (night.length ? Math.min.apply(null, night.map((h) => h.temp)) : null) : null;
  f.frostTonight = f.tonightLow != null && f.tonightLow <= freezing + (metricNow ? 1 : 2) && !night.some((h) => (h.wet || 0) > 0 && h.temp > freezing);
  return f;
}

const fmtTime = (iso) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const fmtHour = (iso) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric' });
export { fmtTime, fmtHour };

/** "3 PM", or "6 AM tomorrow" when it is not today. */
function whenHour(iso) {
  if (new Date(iso).getHours() === 0) return 'midnight';
  return `${fmtHour(iso)}${String(iso).slice(0, 10) !== isoDay() ? ' tomorrow' : ''}`;
}

/** "45°", or "--°" when the number is missing: never "undefined°". */
export const deg = (v) => (num(v) == null ? '--°' : `${v}°`);

/** UV index in a plain word. */
export function uvWord(uv) {
  if (num(uv) == null) return '';
  if (uv < 3) return 'Low';
  if (uv < 6) return 'Moderate';
  if (uv < 8) return 'High';
  if (uv < 11) return 'Very high';
  return 'Extreme';
}

/** "from the southeast" */
export const windFrom = (deg) => (num(deg) == null ? '' : `from the ${COMPASS_WORDS[point(deg)]}`);

/** A rain or snow amount in the owner's units: "0.4 in", "12 mm", "3 cm", "a trace". */
export function amountText(value, unit) {
  if (!value || value <= 0) return '';
  if (unit === 'in') return value < 0.01 ? 'a trace' : `${value < 1 ? value.toFixed(2) : value.toFixed(1)} in`;
  if (unit === 'mm') return value < 0.5 ? 'a trace' : `${value < 10 ? Math.round(value * 10) / 10 : Math.round(value)} mm`;
  return value < 0.5 ? 'a dusting' : `${value < 10 ? Math.round(value * 10) / 10 : Math.round(value)} cm`; // snow in cm
}

/** Is it windy enough to mention? (20 mph / 32 km/h, or gusts of 40 mph / 64 km/h) */
export function windy(f) {
  const m = f.windUnit === 'km/h';
  return { windy: (f.windSpeed || 0) >= (m ? 32 : 20), gusty: (f.gusts || 0) >= (m ? 64 : 40) };
}

// One plain line under the big temperature, e.g. "Rain likely from about 3 PM",
// "1–2 in. of snow expected by tonight", "Dry tonight · frost likely".
export function outlook(f) {
  const cm = f.snowUnit === 'cm';
  const snow = f.snowLeft != null ? f.snowLeft : f.snowInches || 0;
  if (snow >= (cm ? 0.5 : 0.25)) {
    const lo = Math.floor(snow), hi = Math.ceil(snow + 0.01);
    const unit = cm ? 'cm' : 'in.';
    return lo >= 1 ? `${lo}–${hi} ${unit} of snow expected by tonight` : `Up to 1 ${unit} of snow expected by tonight`;
  }
  if (snow > 0) return 'A dusting of snow possible today';
  if (f.rainNow) return f.rainUntil ? `Rain until about ${whenHour(f.rainUntil)}` : 'Rain on and off for a while yet';
  if (f.rainFrom) return `Rain likely from about ${fmtHour(f.rainFrom)} (${f.rainChance}%)`;
  if (f.evening && f.wetFrom) return `Dry for now · rain likely by ${whenHour(f.wetFrom)}`;
  if (f.rainChance >= 20) return `${f.rainChance}% chance of a shower later today`;
  if (f.evening) return f.frostTonight ? 'Dry tonight · frost likely' : 'Dry tonight';
  return 'Dry all day';
}

/** Today's high and low, said the useful way round for the time of day. */
export function rangeLine(f) {
  const later = new Date().getHours() >= 15 || new Date().getHours() < 4;
  if (later && f.tonightLow != null) return [f.high != null ? `Today’s high ${f.high}°` : '', `Tonight’s low ${f.tonightLow}°`].filter(Boolean).join(' · ');
  const at = f.highAt && new Date(f.highAt).getTime() > Date.now() - 3600000 ? ` around ${fmtHour(f.highAt)}` : '';
  return [f.high != null ? `High ${f.high}°${at}` : '', f.low != null ? `Low ${f.low}°` : ''].filter(Boolean).join(' · ');
}

// "Before you head out" advice from the conditions: what to wear, then the one other
// thing most worth knowing (ice, frost, rain, wind, sun).
export function advice(f) {
  const feels = num(f.feels) != null ? f.feels : f.temp;
  const m = f.units === 'celsius' || (f.units == null && metric());
  const cold = num(feels) == null ? [false, false, false, false]
    : m ? [feels <= -7, feels <= 4, feels <= 13, feels >= 29]
      : [feels <= 20, feels <= 40, feels <= 55, feels >= 85];
  const sky = describe(f.code).icon;
  const parts = [];
  if ((f.snowInches || 0) >= 0.25 || sky === 'snow') parts.push('Heavy coat and boots today.');
  else if (cold[0]) parts.push('Bundle up: hat and gloves.');
  else if (cold[1]) parts.push('Heavy coat today.');
  else if (cold[2]) parts.push('Grab a jacket.');
  else if (cold[3]) parts.push('Hot: water and sunscreen.');
  else if (num(feels) != null) parts.push('Nice out. No coat needed.'); // (no temperature: no guessing)

  const w = windy(f);
  const strongSun = f.isDay && (f.uv || 0) >= 6 && new Date().getHours() < 16 && sky !== 'rain' && sky !== 'storm';
  if (f.slickFrom) parts.push(`Roads may be slick after ${fmtHour(f.slickFrom)}.`);
  else if (f.rainNow || f.rainFrom || f.rainChance >= 50) parts.push('Take an umbrella.');
  else if (f.evening && f.wetFrom) parts.push(String(f.wetFrom).slice(0, 10) !== isoDay() ? 'Umbrella for the morning.' : 'Take an umbrella.');
  else if (f.evening && f.frostTonight) parts.push('Frost tonight.');
  else if (w.gusty) parts.push('Strong gusts.');
  else if (w.windy) parts.push('Very windy.');
  else if (strongSun && !cold[3]) parts.push('Strong sun: wear sunscreen.');
  else if (sky === 'sun' && f.isDay) parts.push('Sunglasses weather.');
  return parts.join(' ');
}

// ---------------------------------------------------------------------------------------
// Daylight (the Weather screen's sun panel): all of it from the forecast's own sunrise
// and sunset times, so it is right for the town the forecast is for.
// ---------------------------------------------------------------------------------------
const MIN = 60000;
const stamp = (iso) => (iso ? new Date(iso).getTime() : NaN);
/** Seconds of daylight on a forecast day (the precise figure when the forecast has it). */
export function dayLight(d) {
  if (!d) return null;
  if (num(d.light) != null && d.light > 0) return d.light;
  const a = stamp(d.sunrise), b = stamp(d.sunset);
  return isFinite(a) && isFinite(b) && b > a ? (b - a) / 1000 : null;
}

/** "9 h 41 min", "12 min", "1 h" */
export function spanText(ms) {
  const min = Math.max(0, Math.round(ms / MIN));
  const h = Math.floor(min / 60), m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

// The next solstice (Meeus' mean formula: right to within a quarter of an hour).
function nextSolstice(now) {
  const of = (year, june) => {
    const y = (year - 2000) / 1000;
    const jde = june
      ? 2451716.56767 + 365241.62603 * y + 0.00325 * y * y + 0.00888 * y * y * y - 0.0003 * y * y * y * y
      : 2451900.05952 + 365242.74049 * y - 0.06223 * y * y - 0.00823 * y * y * y + 0.00032 * y * y * y * y;
    return { at: (jde - 2440587.5) * 86400000, june };
  };
  const y = new Date(now).getFullYear();
  // (Still "ahead" on the day itself.)
  return [of(y, true), of(y, false), of(y + 1, true)].find((s) => s.at > now - 12 * 3600000);
}

/**
 * Where the sun is in its day, from the saved forecast:
 * {
 *   up            is the sun up right now
 *   sunrise, sunset   today's (ISO), and `next`: { sunrise, sunset } for tomorrow if known
 *   frac          0..1 of the way from sunrise to sunset (below 0 before, above 1 after)
 *   left          ms of daylight left (while up), untilRise: ms until the next sunrise (while down; null if unknown)
 *   golden        the last hour of light
 *   light         seconds of daylight today
 *   perDay        seconds each day gains (+) or loses (-), averaged over the forecast's days; null if unknown
 *   week          [{ date, light }] for the little bars
 *   solstice      { at (ms), days, shortest (true: the shortest day, false: the longest) }
 * }
 * or null when the forecast has no sun times for today.
 */
export function sunInfo(f, now = Date.now()) {
  const today = isoDay(new Date(now));
  const days = (f && f.days) || [];
  const i = days.findIndex((d) => d.date === today);
  const d = i >= 0 ? days[i] : null;
  const rise = stamp(d ? d.sunrise : f && f.sunrise), set = stamp(d ? d.sunset : f && f.sunset);
  if (!isFinite(rise) || !isFinite(set) || set <= rise || isoDay(new Date(set)) !== today) return null;
  const next = i >= 0 && days[i + 1] && days[i + 1].sunrise ? days[i + 1] : null;
  const up = now >= rise && now < set;
  const untilRise = now < rise ? rise - now : next && isFinite(stamp(next.sunrise)) ? stamp(next.sunrise) - now : null;
  const week = days.slice(Math.max(0, i)).map((x) => ({ date: x.date, light: dayLight(x) })).filter((x) => x.light != null);
  const perDay = week.length >= 2 ? (week[week.length - 1].light - week[0].light) / (week.length - 1) : null;
  const sol = nextSolstice(now);
  const north = !(f && typeof f.lat === 'number' && f.lat < 0);
  const midnight = new Date(now); midnight.setHours(0, 0, 0, 0);
  const solDay = new Date(sol.at); solDay.setHours(0, 0, 0, 0);
  return {
    up,
    sunrise: d ? d.sunrise : f.sunrise,
    sunset: d ? d.sunset : f.sunset,
    next: next ? { sunrise: next.sunrise, sunset: next.sunset } : null,
    frac: (now - rise) / (set - rise),
    left: up ? set - now : 0,
    untilRise: up ? null : untilRise,
    golden: up && set - now <= 60 * MIN,
    light: dayLight(d || { sunrise: f.sunrise, sunset: f.sunset }),
    perDay,
    week,
    solstice: { at: sol.at, days: Math.round((solDay - midnight) / 86400000), shortest: sol.june !== north },
  };
}
