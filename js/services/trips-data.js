// Trips and countdowns: what the Trips screen keeps (on this screen only, nothing syncs).
//
// Saved under one key:
//   { v: 1, who: name ('' = nobody chosen), trips: [{
//       id, name, where (as typed or picked), place: { lat, lon } | null (found from `where`),
//       start: 'YYYY-MM-DD', end: 'YYYY-MM-DD', art: 'cabin'|'house'|'ski'|'beach',
//       items: [{ id, text, cat: one of CATS, done, by: name (who packed it), listed (sent to the shopping list) }] }] }
// A trip stays until 30 days after it ended; the screens only show the ones not over yet.
// The destination's forecast (Open-Meteo, free) is kept under a second key and only asked
// for when the trip's days are within its reach (today + 15 days).
import { settings } from '../config.js';
import { describe } from './weather.js';
import { findPlaces } from './location.js';

const KEY = 'trips.v1';
const WX_KEY = 'trips.wx.v1';
const EVENT = 'trips-changed';
const MAX_TRIPS = 24;
const MAX_ITEMS = 80;
const WX_AGE = 3 * 3600 * 1000;
/** How far ahead the forecast reaches (days from today, today = 0). */
export const REACH = 15;
/** Home shows the countdown line from this many days before a trip. */
export const HOME_DAYS = 14;

export const CATS = ['Clothes', 'Toiletries', 'Food', 'Gear', 'Papers'];
const list = (cat, words) => words.split(', ').map((text) => ({ text, cat }));
/** The packing lists a new trip can start from. */
export const TEMPLATES = [
  { id: 'weekend', name: 'Weekend', art: 'cabin', items: [].concat(
    list('Clothes', 'Shirts, Pants, Underwear, Socks, Pajamas, Sweater, Jacket, Shoes'),
    list('Toiletries', 'Toothbrushes, Toothpaste, Shampoo, Deodorant, Medicine'),
    list('Food', 'Coffee, Snacks, Breakfast, Water bottles'),
    list('Gear', 'Phone chargers, Headphones, Books, Board games, Flashlight'),
    list('Papers', 'Wallets, Keys')) },
  { id: 'beach', name: 'Beach', art: 'beach', items: [].concat(
    list('Clothes', 'Swimsuits, Cover-ups, Shorts, T-shirts, Underwear, Sandals, Sun hats, Sunglasses, Pajamas'),
    list('Toiletries', 'Sunscreen, After-sun lotion, Toothbrushes, Toothpaste, Shampoo, Medicine'),
    list('Food', 'Snacks, Water bottles, Cooler, Drinks'),
    list('Gear', 'Beach towels, Beach bag, Umbrella, Phone chargers, Books, Goggles'),
    list('Papers', 'Passports, Wallets, Tickets')) },
  { id: 'ski', name: 'Ski', art: 'ski', items: [].concat(
    list('Clothes', 'Ski jacket, Snow pants, Base layers, Wool socks, Sweaters, Gloves, Hats, Neck warmers, Snow boots, Pajamas, Underwear'),
    list('Gear', 'Goggles, Helmets, Hand warmers, Skis, Ski boots, Poles, Phone chargers, Swimsuits, Board games'),
    list('Toiletries', 'Lip balm, Sunscreen, Toothbrushes, Toothpaste, Medicine'),
    list('Food', 'Snacks, Hot chocolate, Coffee, Water bottles'),
    list('Papers', 'Lift tickets, Wallets, Keys')) },
  { id: 'family', name: 'Family', art: 'house', items: [].concat(
    list('Clothes', 'Shirts, Pants, Underwear, Socks, Pajamas, Nice outfit, Shoes'),
    list('Toiletries', 'Toothbrushes, Toothpaste, Shampoo, Medicine'),
    list('Food', 'Snacks, Dish to share, Wine'),
    list('Gear', 'Gifts, Phone chargers, Books, Pillow'),
    list('Papers', 'Wallets, Keys')) },
  { id: 'empty', name: 'Empty', art: 'cabin', items: [] },
];
export const template = (id) => TEMPLATES.find((t) => t.id === id) || TEMPLATES[TEMPLATES.length - 1];

// ---------------------------------------------------------------------------------------
// Days
// ---------------------------------------------------------------------------------------
const pad = (n) => String(n).padStart(2, '0');
export const isoDay = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromIso = (s) => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
const isIso = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && isoDay(fromIso(s)) === s;
/** Whole days from one date to another ('2026-11-25' → '2026-12-04' = 9), whatever the clocks do. */
export function daysBetween(a, b) {
  const x = fromIso(a), y = fromIso(b);
  return Math.round((Date.UTC(y.getFullYear(), y.getMonth(), y.getDate()) - Date.UTC(x.getFullYear(), x.getMonth(), x.getDate())) / 86400000);
}
export function addDays(iso, n) { const d = fromIso(iso); return isoDay(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)); }

/**
 * The countdown for a trip: { n (days to go; 0 today, below 0 once it has started), big, unit }.
 * "9 days", "1 day", "Today", and "Now" while away.
 */
export function countdown(trip, today = isoDay()) {
  const n = daysBetween(today, trip.start);
  if (n > 0) return { n, big: String(n), unit: n === 1 ? 'day' : 'days' };
  if (n === 0) return { n, big: 'Today', unit: '' };
  return { n, big: 'Now', unit: '' };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const dayName = (iso) => DAYS[fromIso(iso).getDay()];
/**
 * A trip's days in words. Long: "Fri Dec 4 – Sun Dec 6"; short: "Dec 23 – 26",
 * "Jan 30 – Feb 2"; one day: "Sat Dec 5" / "Dec 5".
 */
export function rangeText(start, end, long = false) {
  const a = fromIso(start), b = fromIso(end);
  const md = (d) => `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  if (long) return start === end ? `${DAYS[a.getDay()]} ${md(a)}` : `${DAYS[a.getDay()]} ${md(a)} – ${DAYS[b.getDay()]} ${md(b)}`;
  if (start === end) return md(a);
  return a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear() ? `${md(a)} – ${b.getDate()}` : `${md(a)} – ${md(b)}`;
}

/** The days of a trip the forecast can reach, the first three still to come: ['YYYY-MM-DD']. */
export function forecastDays(trip, today = isoDay()) {
  const out = [];
  const first = trip.start > today ? trip.start : today;
  const last = addDays(today, REACH);
  for (let d = first; d <= trip.end && d <= last && out.length < 3; d = addDays(d, 1)) out.push(d);
  return out;
}

// ---------------------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------------------
/** The painting for a trip: by its name first ("Ski week", "Christmas at Mom's"), then its packing list. */
export function artFor(name, templateId, otherwise) {
  const n = String(name || '').toLowerCase();
  if (/\bski|snowboard/.test(n)) return 'ski';
  if (/beach|island|cruise|aruba|hawaii|florida|mexico|caribbean|shore|coast/.test(n)) return 'beach';
  if (/christmas|xmas|thanksgiving|holiday|easter|mom|dad|grand|parents|family|wedding|birthday/.test(n)) return 'house';
  if (/cabin|lake|camp|mountain|hik/.test(n)) return 'cabin';
  return otherwise || template(templateId).art;
}

const FOOD = /coffee|tea\b|snack|food|breakfast|lunch|dinner|drink|water|wine|beer|juice|milk|bread|egg|cereal|fruit|marshmallow|pancake|chocolate|cheese|chips|cracker|cookie|pasta|sauce|butter|sugar|soda|granola|bars?\b|hot dogs?|burger|meat|chicken|bacon|ketchup|mustard/;
const CLOTHES = /shirt|pants|sock|underwear|pajama|sweater|jacket|coat|shoe|boot|sandal|hat\b|hats\b|glove|mitten|scarf|swimsuit|shorts|dress|jeans|hoodie|outfit|suit\b|layers|sunglasses|belt/;
const WASH = /tooth|shampoo|soap|deodorant|medicine|pills|sunscreen|lotion|razor|brush|lip balm|makeup|contacts|floss|vitamin|first aid|bandage/;
const PAPERS = /passport|wallet|ticket|keys?\b|license|cash|card\b|cards\b|papers|documents|insurance|boarding|reservation/;
/** Where a typed packing item belongs. */
export function guessCat(text) {
  const t = String(text || '').toLowerCase();
  if (PAPERS.test(t)) return 'Papers';
  if (WASH.test(t)) return 'Toiletries';
  if (CLOTHES.test(t)) return 'Clothes';
  if (FOOD.test(t)) return 'Food';
  return 'Gear';
}

const STATES = { Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA', Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE',
  Florida: 'FL', Georgia: 'GA', Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL', Indiana: 'IN', Iowa: 'IA', Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA',
  Maine: 'ME', Maryland: 'MD', Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN', Mississippi: 'MS', Missouri: 'MO', Montana: 'MT', Nebraska: 'NE',
  Nevada: 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH',
  Oklahoma: 'OK', Oregon: 'OR', Pennsylvania: 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC', 'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX',
  Utah: 'UT', Vermont: 'VT', Virginia: 'VA', Washington: 'WA', 'West Virginia': 'WV', Wisconsin: 'WI', Wyoming: 'WY', 'District of Columbia': 'DC' };
/** A found place in few words: "Stowe, VT", "Oranjestad, Aruba". (p: one of location.js findPlaces' answers.) */
export function placeLabel(p) {
  const parts = String(p.label || '').split(', ');
  const country = parts.length > 1 ? parts[parts.length - 1] : '';
  const tail = STATES[p.region] && /^United States/.test(country) ? STATES[p.region] : (country || p.region || '');
  return tail && tail !== p.town ? `${p.town}, ${tail}` : String(p.town || '');
}
/** Of the places found for a typed "Portland, ME", the one meant (else the first). */
export function matchPlace(results, typed) {
  const rest = String(typed || '').split(',').slice(1).join(',').trim().toLowerCase();
  if (!rest) return results[0] || null;
  return results.find((p) => {
    const short = placeLabel(p).split(', ')[1] || '';
    return short.toLowerCase() === rest || String(p.region || '').toLowerCase() === rest || String(p.label || '').toLowerCase().split(', ').indexOf(rest) >= 0;
  }) || results[0] || null;
}
/** The town alone: "Lake George, NY" → "Lake George". */
export const town = (where) => String(where || '').split(',')[0].trim();

// ---------------------------------------------------------------------------------------
// What is saved
// ---------------------------------------------------------------------------------------
const clean = (s, max) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, max);
const newId = (p) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function tidyItem(x) {
  if (!x || typeof x !== 'object') return null;
  const text = clean(x.text, 40);
  if (!text) return null;
  const it = { id: clean(x.id, 24) || newId('i'), text, cat: CATS.indexOf(x.cat) >= 0 ? x.cat : 'Gear', done: !!x.done };
  if (it.done && x.by) it.by = clean(x.by, 40);
  if (x.listed) it.listed = true;
  return it;
}
function tidyTrip(t) {
  if (!t || typeof t !== 'object') return null;
  const name = clean(t.name, 40);
  if (!name || !isIso(t.start) || !isIso(t.end) || t.end < t.start) return null;
  const p = t.place;
  return {
    id: clean(t.id, 24) || newId('t'), name, where: clean(t.where, 40),
    place: p && typeof p.lat === 'number' && typeof p.lon === 'number' ? { lat: p.lat, lon: p.lon } : null,
    start: t.start, end: t.end,
    art: ['cabin', 'house', 'ski', 'beach'].indexOf(t.art) >= 0 ? t.art : 'cabin',
    items: (Array.isArray(t.items) ? t.items : []).map(tidyItem).filter(Boolean).slice(0, MAX_ITEMS),
  };
}

let seen = { raw: null, data: null };
function load() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch (e) { raw = null; }
  if (seen.data && raw === seen.raw) return seen.data;
  let d = null;
  try { d = JSON.parse(raw || 'null'); } catch (e) { d = null; }
  const data = { v: 1, who: clean(d && d.who, 40), trips: (d && Array.isArray(d.trips) ? d.trips : []).map(tidyTrip).filter(Boolean).slice(0, MAX_TRIPS) };
  seen = { raw, data };
  return data;
}
function save(data, quiet) {
  // Trips over for a month go; so do forecasts for trips that are gone.
  const cutoff = addDays(isoDay(), -30);
  data.trips = data.trips.filter((t) => t.end >= cutoff);
  const raw = JSON.stringify(data);
  try { localStorage.setItem(KEY, raw); } catch (e) { return false; }
  seen = { raw, data };
  if (!quiet) window.dispatchEvent(new Event(EVENT));
  return true;
}
/** Calls cb() when a trip or its packing list changes (or a forecast arrives). Returns an unsubscribe function. */
export function onChanged(cb) {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}

/** The trips not over yet, the nearest first. */
export function trips(today = isoDay()) {
  return load().trips.filter((t) => t.end >= today).sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.name < b.name ? -1 : 1));
}
export const getTrip = (id) => load().trips.find((t) => t.id === id) || null;
/** For the calendar: the trips that touch the days from..to (ISO days or Dates): [{ id, name, start, end }]. */
export function tripsBetween(from, to) {
  const a = from instanceof Date ? isoDay(from) : String(from);
  const b = to instanceof Date ? isoDay(to) : String(to);
  return load().trips.filter((t) => t.start <= b && t.end >= a)
    .sort((x, y) => (x.start < y.start ? -1 : x.start > y.start ? 1 : 0))
    .map((t) => ({ id: t.id, name: t.name, start: t.start, end: t.end }));
}
/** { done, total } of a trip's packing list. */
export const packed = (trip) => ({ done: trip.items.filter((i) => i.done).length, total: trip.items.length });

/**
 * Add a trip, or change one (by id: its packing list stays). A new one starts from
 * `template`'s list. Returns the saved trip, or null (no name, no days, or no room).
 */
export function saveTrip(t) {
  const data = load();
  const old = t.id ? data.trips.find((x) => x.id === t.id) : null;
  // (`place`: { lat, lon } when `where` was picked from the places found; else it is looked up later.)
  const trip = tidyTrip({
    id: old ? old.id : '', name: t.name, where: t.where, start: t.start, end: t.end, place: t.place,
    art: artFor(t.name, t.template, old && old.art),
    items: old ? old.items : template(t.template).items.map((i) => ({ text: i.text, cat: i.cat })),
  });
  if (!trip) return null;
  if (!old && data.trips.length >= MAX_TRIPS) return null;
  data.trips = data.trips.filter((x) => x.id !== trip.id).concat([trip]);
  return save(data) ? trip : null;
}
/** Take a trip away. Returns it as it was (for Undo: restoreTrip). */
export function removeTrip(id) {
  const data = load();
  const was = data.trips.find((t) => t.id === id) || null;
  data.trips = data.trips.filter((t) => t.id !== id);
  save(data);
  return was;
}
export function restoreTrip(was) {
  const trip = tidyTrip(was);
  if (!trip) return;
  const data = load();
  data.trips = data.trips.filter((t) => t.id !== trip.id).concat([trip]);
  save(data);
}

function change(tripId, fn) {
  const data = load();
  const trip = data.trips.find((t) => t.id === tripId);
  if (!trip) return null;
  const out = fn(trip);
  return save(data) ? out : null;
}
/** Add something to pack. Returns the item, or null (nothing typed, already there, or the list is full). */
export function addItem(tripId, text, cat) {
  const words = clean(text, 40);
  if (!words) return null;
  const trip = getTrip(tripId);
  if (!trip || trip.items.length >= MAX_ITEMS || trip.items.some((i) => i.text.toLowerCase() === words.toLowerCase())) return null;
  const item = tidyItem({ text: words.charAt(0).toUpperCase() + words.slice(1), cat: cat || guessCat(words) });
  return change(tripId, (t) => { t.items.push(item); return item; });
}
/** Tick something as packed (by `by`, a name or ''), or untick it. */
export function toggleItem(tripId, itemId, by = '') {
  return change(tripId, (t) => {
    const it = t.items.find((i) => i.id === itemId);
    if (!it) return null;
    it.done = !it.done;
    delete it.by;
    if (it.done && by) it.by = clean(by, 40);
    return it;
  });
}
/** Take an item off. Returns { item, index } (for Undo: restoreItem). */
export function removeItem(tripId, itemId) {
  return change(tripId, (t) => {
    const index = t.items.findIndex((i) => i.id === itemId);
    if (index < 0) return null;
    return { item: t.items.splice(index, 1)[0], index };
  });
}
export function restoreItem(tripId, was) {
  if (was && was.item) change(tripId, (t) => { t.items.splice(Math.min(was.index, t.items.length), 0, was.item); });
}
/** A food item was sent to the shopping list. */
export function markListed(tripId, itemId) {
  change(tripId, (t) => { const it = t.items.find((i) => i.id === itemId); if (it) it.listed = true; });
}
/** Who is packing right now (their ticks carry their name); '' when nobody is chosen. */
export const packer = () => load().who;
export function setPacker(name) { const d = load(); d.who = clean(name, 40); save(d); }

// ---------------------------------------------------------------------------------------
// The destination's forecast
// ---------------------------------------------------------------------------------------
function readWx() {
  try { const w = JSON.parse(localStorage.getItem(WX_KEY) || '{}'); return w && typeof w === 'object' && !Array.isArray(w) ? w : {}; } catch (e) { return {}; }
}
const sig = (trip) => `${trip.where}|${trip.place ? `${trip.place.lat},${trip.place.lon}` : ''}|${settings.units}`;
const round = (v) => (typeof v === 'number' && isFinite(v) ? Math.round(v) : null);

/** What a day's forecast says in a word or two: "Snow 70%", "Clear". */
export function dayWords(d) {
  const w = describe(d.code);
  return (w.icon === 'rain' || w.icon === 'snow' || w.icon === 'storm') && d.rain >= 20 ? `${w.icon === 'storm' ? 'Storms' : w.icon === 'snow' ? 'Snow' : 'Rain'} ${d.rain}%` : w.label;
}
/**
 * The saved forecast for a trip's coming days (none when it is too far off, nothing was
 * ever fetched, or the place isn't known): [{ date, day: 'Fri', icon, hi, lo, rain, words }].
 */
export function tripForecast(trip, today = isoDay()) {
  const saved = readWx()[trip.id];
  if (!saved || saved.sig !== sig(trip) || !Array.isArray(saved.days)) return [];
  return forecastDays(trip, today).map((date) => saved.days.find((d) => d && d.date === date))
    .filter((d) => d && typeof d.hi === 'number')
    .map((d) => ({ date: d.date, day: dayName(d.date), icon: describe(d.code).icon, hi: d.hi, lo: d.lo, rain: d.rain || 0, words: dayWords(d) }));
}

const asking = {};
/**
 * Fetch the forecast for a trip if its days are in reach and the saved one is old.
 * Resolves true when something new was saved (onChanged fires too). Never throws.
 */
export function loadForecast(trip, today = isoDay()) {
  if (!trip || !trip.where || !forecastDays(trip, today).length) return Promise.resolve(false);
  const saved = readWx()[trip.id];
  if (saved && saved.sig === sig(trip) && Date.now() - saved.at < WX_AGE) return Promise.resolve(false);
  if (asking[trip.id]) return asking[trip.id];
  const run = (async () => {
    let place = trip.place;
    if (!place) {
      const found = matchPlace(await findPlaces(town(trip.where)), trip.where);
      if (!found) return false;
      place = { lat: found.lat, lon: found.lon };
      const data = load();
      const mine = data.trips.find((t) => t.id === trip.id);
      if (!mine || mine.where !== trip.where) return false;
      mine.place = place;
      save(data, true);
      trip = mine;
    }
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.search = new URLSearchParams({
      latitude: place.lat, longitude: place.lon, timezone: 'auto', temperature_unit: settings.units,
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max', forecast_days: REACH + 1,
    });
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return false;
    const D = (await res.json()).daily;
    if (!D || !Array.isArray(D.time)) return false;
    const days = D.time.map((date, i) => ({
      date, code: D.weather_code ? D.weather_code[i] : null, hi: round(D.temperature_2m_max[i]), lo: round(D.temperature_2m_min[i]),
      rain: round(D.precipitation_probability_max ? D.precipitation_probability_max[i] : 0) || 0,
    })).filter((d) => d.date >= trip.start && d.date <= trip.end && d.hi != null);
    const all = readWx();
    const keep = {};
    load().trips.forEach((t) => { if (all[t.id]) keep[t.id] = all[t.id]; });
    keep[trip.id] = { at: Date.now(), sig: sig(trip), days };
    try { localStorage.setItem(WX_KEY, JSON.stringify(keep)); } catch (e) { return false; }
    window.dispatchEvent(new Event(EVENT));
    return true;
  })().catch(() => false);
  asking[trip.id] = run;
  const done = () => { delete asking[trip.id]; };
  run.then(done, done);
  return run;
}

// ---------------------------------------------------------------------------------------
// Pictures (inline SVG; `w`×`h` px, cropped to fill)
// ---------------------------------------------------------------------------------------
let artN = 0;
const pine = (x, y, s, fill) => { const k = (n) => Math.round(n * s * 10) / 10; return `<path d="M${x} ${y}l${k(22)} ${k(38)}h${k(-10)}l${k(15)} ${k(32)}h${k(-56)}l${k(15)} ${k(-32)}h${k(-10)}z" fill="${fill}"/>`; };
const ART = {
  // A cabin by a lake at dusk, its window lit.
  cabin: (u) => `<defs><linearGradient id="${u}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2D2F63"/><stop offset=".55" stop-color="#B86E86"/><stop offset="1" stop-color="#F6B98A"/></linearGradient>
    <linearGradient id="${u}l" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#C98A8E"/><stop offset="1" stop-color="#3B3E72"/></linearGradient>
    <radialGradient id="${u}g" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#FFD38A" stop-opacity=".9"/><stop offset="1" stop-color="#FFD38A" stop-opacity="0"/></radialGradient></defs>
    <rect width="400" height="260" fill="url(#${u}s)"/><circle cx="318" cy="52" r="16" fill="#FFF1D6" opacity=".9"/>
    <path d="M0 150L60 100 110 130 170 84 240 140 300 96 360 130 400 110V170H0z" fill="#5A4C80"/>
    <path d="M0 170L50 140 120 160 190 128 260 162 330 136 400 158V180H0z" fill="#3F3A6A"/>
    <rect y="176" width="400" height="84" fill="url(#${u}l)"/><path d="M0 176h400v6H0z" fill="#E9E3F2" opacity=".8"/>
    ${[22, 52, 300, 340, 372].map((x) => pine(x, 108, 1, '#1E2440')).join('')}
    <path d="M168 180V146l36-28 36 28v34z" fill="#6A3B2A"/><path d="M160 148l44-36 44 36" fill="none" stroke="#F4F0F8" stroke-width="7" stroke-linecap="round"/>
    <rect x="224" y="114" width="9" height="20" fill="#4A2A1F"/><path d="M228 108c-6-10 8-14 2-26" fill="none" stroke="#E9E3F2" stroke-width="3" opacity=".5"/>
    <circle cx="204" cy="158" r="26" fill="url(#${u}g)"/><rect x="194" y="150" width="20" height="16" rx="2" fill="#FFC56B"/><path d="M204 150v16M194 158h20" stroke="#6A3B2A" stroke-width="2"/>
    <rect x="196" y="190" width="16" height="40" fill="#FFC56B" opacity=".35"/>
    ${[90, 120, 270].map((x) => pine(x, 144, 0.67, '#151B33')).join('')}`,
  // A house in the snow with lights along the roof.
  house: (u) => `<defs><linearGradient id="${u}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#14244A"/><stop offset="1" stop-color="#3C5A8C"/></linearGradient></defs>
    <rect width="400" height="260" fill="url(#${u}s)"/>
    <g fill="#FFFFFF" opacity=".75"><circle cx="40" cy="40" r="2"/><circle cx="90" cy="70" r="1.6"/><circle cx="320" cy="30" r="2"/><circle cx="360" cy="80" r="1.5"/><circle cx="270" cy="56" r="1.4"/></g>
    <rect y="190" width="400" height="70" fill="#E8EEF7"/>
    <path d="M140 190v-74l60-40 60 40v74z" fill="#B44A3E"/><path d="M130 118l70-48 70 48" fill="none" stroke="#F4F8FF" stroke-width="9" stroke-linecap="round"/>
    <circle cx="150" cy="112" r="2.6" fill="#FF6B6B"/><circle cx="166" cy="101" r="2.6" fill="#FFD36B"/><circle cx="182" cy="90" r="2.6" fill="#7BE0A0"/><circle cx="200" cy="82" r="2.6" fill="#6BB8FF"/><circle cx="218" cy="90" r="2.6" fill="#FF6B6B"/><circle cx="234" cy="101" r="2.6" fill="#FFD36B"/><circle cx="250" cy="112" r="2.6" fill="#7BE0A0"/>
    <rect x="186" y="150" width="28" height="40" rx="3" fill="#4C2A22"/><circle cx="200" cy="140" r="11" fill="none" stroke="#2F7A4A" stroke-width="6"/><circle cx="200" cy="150" r="3" fill="#E14B4B"/>
    <rect x="152" y="132" width="24" height="22" rx="2" fill="#FFCF7A"/><rect x="224" y="132" width="24" height="22" rx="2" fill="#FFCF7A"/>
    ${[40, 80, 330, 366].map((x) => pine(x, 122, 1.07, '#1F3B3A')).join('')}`,
  // White peaks and a lift line.
  ski: (u) => `<defs><linearGradient id="${u}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3F86D6"/><stop offset="1" stop-color="#BFE0FA"/></linearGradient></defs>
    <rect width="400" height="260" fill="url(#${u}s)"/>
    <path d="M0 200L110 60 170 120 240 30 400 190V260H0z" fill="#F7FBFF"/><path d="M240 30l-30 50 18-6 12 20 14-22 18 10z" fill="#C8DAEE"/><path d="M110 60l-24 40 16-6 10 14z" fill="#C8DAEE"/>
    <path d="M60 250L330 70" stroke="#3A4B63" stroke-width="2"/><rect x="150" y="186" width="14" height="12" rx="2" fill="#E2553F"/><rect x="230" y="133" width="14" height="12" rx="2" fill="#E2553F"/>
    ${[30, 58, 350, 380].map((x) => pine(x, 202, 0.86, '#2E5A4C')).join('')}`,
  // Sea, sand and a palm.
  beach: (u) => `<defs><linearGradient id="${u}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7FD3F0"/><stop offset="1" stop-color="#E6F7FB"/></linearGradient></defs>
    <rect width="400" height="260" fill="url(#${u}s)"/><circle cx="300" cy="60" r="28" fill="#FFE07A"/>
    <rect y="140" width="400" height="60" fill="#1FB5C4"/><path d="M0 150c40-6 80 6 120 0s80-6 120 0 80 6 160 0" stroke="#BDF2F5" stroke-width="3" fill="none"/>
    <path d="M0 190c80-14 240-14 400 0V260H0z" fill="#F4DDA8"/>
    <path d="M92 200c4-50 10-80 26-110" stroke="#7A5532" stroke-width="7" fill="none"/>
    <g fill="#2F9A5A"><path d="M118 90c-30-10-54 0-66 16 22-10 44-8 66-16z"/><path d="M118 90c24-22 50-22 66-10-24-2-44 2-66 10z"/><path d="M118 90c-6-24 6-44 20-52-6 20-10 34-20 52z"/><path d="M118 90c20 2 40 16 46 34-16-14-30-22-46-34z"/></g>`,
};
/** A trip's painting. */
export function tripArt(kind, w, h) {
  const u = `tpa${++artN}`;
  return `<svg width="${w}" height="${h}" viewBox="0 0 400 260" preserveAspectRatio="xMidYMid slice" aria-hidden="true" style="display:block">${(ART[kind] || ART.cabin)(u)}</svg>`;
}

const WX = {
  sun: '<circle cx="24" cy="24" r="9" fill="#FFC94D"/><g stroke="#FFC94D" stroke-width="3" stroke-linecap="round"><path d="M24 6v5M24 37v5M6 24h5M37 24h5M11 11l3.5 3.5M33.5 33.5L37 37M11 37l3.5-3.5M33.5 14.5L37 11"/></g>',
  partly: '<circle cx="30" cy="16" r="8" fill="#FFC94D"/><path d="M12 36a8 8 0 0 1 1-16 11 11 0 0 1 21 3 7 7 0 0 1-1 13z" fill="#DDE6F3"/>',
  cloud: '<path d="M13 34a8 8 0 0 1 1-16 11 11 0 0 1 21 3 7 7 0 0 1-1 13z" fill="#DDE6F3"/>',
  fog: '<path d="M14 26a8 8 0 0 1 1-16 11 11 0 0 1 21 3 7 7 0 0 1-1 13z" fill="#DDE6F3"/><g stroke="#DDE6F3" stroke-width="2.6" stroke-linecap="round"><path d="M10 33h28M14 40h20"/></g>',
  rain: '<path d="M14 28a8 8 0 0 1 1-16 11 11 0 0 1 21 3 7 7 0 0 1-1 13z" fill="#DDE6F3"/><g stroke="#8CC4F2" stroke-width="2.8" stroke-linecap="round"><path d="M17 33l-3 8M25 33l-3 8M33 33l-3 8"/></g>',
  snow: '<path d="M14 28a8 8 0 0 1 1-16 11 11 0 0 1 21 3 7 7 0 0 1-1 13z" fill="#DDE6F3"/><g stroke="#FFFFFF" stroke-width="2.4" stroke-linecap="round"><path d="M16 34v8M12 38h8M28 34v8M24 38h8"/></g>',
  storm: '<path d="M14 28a8 8 0 0 1 1-16 11 11 0 0 1 21 3 7 7 0 0 1-1 13z" fill="#C9D2E2"/><path d="M26 30l-6 8h5l-3 7 8-10h-5z" fill="#FFC94D"/>',
};
/** A forecast picture in the Trips screen's own style ('sun' | 'partly' | 'cloud' | 'fog' | 'rain' | 'snow' | 'storm'). */
export const wxArt = (icon, size) => `<svg width="${size}" height="${size}" viewBox="0 0 48 48" aria-hidden="true" style="flex:none">${WX[icon] || WX.cloud}</svg>`;

// ---------------------------------------------------------------------------------------
// For Home and the menu
// ---------------------------------------------------------------------------------------
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * The one line Home may show: the nearest trip, from 14 days before it until the day it
 * starts. { text: '9 days · Cabin weekend', href, tone: 'info', label: '9 DAYS', title: 'Cabin weekend',
 * icon + temp: that first day's forecast when it is known (else absent) }, or null.
 */
export function homeLine(today = isoDay()) {
  const next = trips(today).filter((t) => t.start >= today)[0];
  if (!next) return null;
  const c = countdown(next, today);
  if (c.n > HOME_DAYS) return null;
  loadForecast(next, today);
  const when = c.unit ? `${c.big} ${c.unit}` : c.big;
  const line = { text: `${when} · ${next.name}`, href: `#/trips/${encodeURIComponent(next.id)}`, tone: 'info', label: when.toUpperCase(), title: next.name };
  const wx = tripForecast(next, today)[0];
  if (wx && wx.date === next.start) { line.icon = wx.icon; line.temp = wx.hi; }
  return line;
}

/** What the menu's Trips card says. */
export function menuCard(today = isoDay()) {
  const next = trips(today)[0];
  if (!next) return { title: 'Trips', lines: ['No trips yet'], badge: 0, action: { label: 'New trip', href: '#/trips/add' } };
  loadForecast(next, today);
  const c = countdown(next, today);
  const p = packed(next);
  const lines = [c.unit ? `${c.big} ${c.unit}` : c.big, next.name, [town(next.where), c.n > 0 ? dayName(next.start) : ''].filter(Boolean).join(' · ')];
  if (p.total) lines.push(`Packed ${p.done}/${p.total}`);
  return { title: 'Trips', lines: lines.filter(Boolean), badge: 0 };
}
/** The same card drawn as on the board: the trip's painting, the big number, the forecast, the packing bar. */
export function menuCardHtml(today = isoDay()) {
  const next = trips(today)[0];
  const fill = 'position:absolute;left:0;top:0;width:100%;height:100%';
  const title = '<div style="position:absolute;left:26px;top:22px;font:700 27px Outfit,sans-serif;color:#FFFFFF">Trips</div>';
  if (!next) {
    return `<div style="${fill};background:#22224A">${tripArt('cabin', 340, 500)}</div>
      <div style="${fill};background:linear-gradient(180deg,rgba(20,18,44,.35) 0%,rgba(20,18,44,0) 30%,rgba(20,18,44,.2) 50%,rgba(20,18,44,.92) 78%)"></div>${title}
      <div class="x-serif" style="position:absolute;left:26px;right:26px;bottom:104px;font-size:26px;color:#FFFFFF">No trips yet</div>
      <div style="position:absolute;left:26px;right:26px;bottom:24px;min-height:58px;border-radius:18px;background:#FF9A4D;color:#2A1505;display:flex;align-items:center;justify-content:center;font:600 19px Inter,sans-serif">+ New trip</div>`;
  }
  const c = countdown(next, today);
  const p = packed(next);
  const wx = tripForecast(next, today)[0];
  const sub = [town(next.where), c.n > 0 ? dayName(next.start) : ''].filter(Boolean).join(' · ');
  return `<div style="${fill};background:#22224A">${tripArt(next.art, 340, 500)}</div>
    <div style="${fill};background:linear-gradient(180deg,rgba(20,18,44,.35) 0%,rgba(20,18,44,0) 30%,rgba(20,18,44,.2) 50%,rgba(20,18,44,.92) 78%)"></div>${title}
    <div style="position:absolute;left:26px;right:26px;bottom:${p.total ? 104 : 30}px;color:#FFFFFF">
      <div style="display:flex;align-items:baseline;gap:10px;white-space:nowrap"><span style="font:700 ${c.unit ? 96 : 68}px/1 Outfit,sans-serif">${c.big}</span><span style="font:500 32px Outfit,sans-serif">${c.unit}</span></div>
      <div style="display:flex;align-items:center;margin-top:8px"><div style="min-width:0;flex:1">
        <div style="font:700 27px Outfit,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(next.name)}</div>
        ${sub ? `<div style="font:500 18px Inter,sans-serif;color:rgba(255,255,255,.8);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(sub)}</div>` : ''}</div>
        ${wx ? `<div style="flex:none;display:flex;align-items:center;gap:4px;font:500 22px Outfit,sans-serif">${wxArt(wx.icon, 38)}${wx.hi}°</div>` : ''}</div></div>
    ${p.total ? `<div style="position:absolute;left:26px;right:26px;bottom:24px;min-height:60px;border-radius:18px;background:rgba(255,255,255,.16);box-shadow:inset 0 0 0 2px rgba(255,255,255,.3);display:flex;align-items:center;padding:0 20px;font:600 19px Inter,sans-serif;color:#FFFFFF;box-sizing:border-box">Packed
      <div style="flex:1;margin:0 14px;height:10px;border-radius:999px;background:rgba(255,255,255,.2);overflow:hidden"><div style="width:${Math.round(p.done / p.total * 100)}%;height:100%;border-radius:999px;background:#FF9A4D"></div></div>${p.done}/${p.total}</div>` : ''}`;
}
