// Departures / arrivals board for the nearest airport — built only from what is
// really in the air. There is no free, keyless, CORS-friendly airport schedule
// feed, so instead:
//   1. take the live aircraft around the house (aircraft.js)
//   2. look up each flight's route (adsbdb.com)
//   3. the "home airport" is the nearby airport (within ~30 mi) that the most
//      low-flying routes start or end at — unless the owner picked one on the board
//   4. DEPARTURES = flights from that airport still in the air nearby, newest first
//      (planes taxiing out to the runway come separately, in `taxiing`)
//      ARRIVALS   = flights heading into it, soonest first
// Times are estimates (distance from the airport ÷ ground speed). Gates are not
// knowable, so that column shows the aircraft type instead.
// If no live feed is reachable we fall back to the design's sample board (flagged).
import { getAircraft, getRoutes, distBearing, flightLabel, airlineOf, typeName, compass } from './aircraft.js';
import { timeText } from './display.js';

const AIRPORT_KEY = 'departures.airport.v1';
const PIN_KEY = 'departures.pin.v1';
const MAX_ROWS = 18;

const load = (key) => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; } };
const save = (key, v) => { try { if (v == null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* full or off */ } };

const pad = (n) => String(n).padStart(2, '0');
/** 24-hour "15:05" (kept for anything that wants a fixed-width time). */
export const hhmm = (t) => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
// What the board shows: the owner's 12- or 24-hour choice.
const shown = (t) => timeText(new Date(t));
const isTomorrow = (t) => new Date(t).toDateString() !== new Date().toDateString() && t > Date.now();

const G = '#7CF29A', A = '#FFB547', W = '#F4E9C8', X = '#6E6A5E';

/** The airport the owner chose on the board (stays until they go back to automatic), or null. */
export const boardAirportPin = () => load(PIN_KEY);
/** Pin an airport ({ iata, city, lat, lon, … } from a board's `candidates`), or null for automatic. */
export function setBoardAirport(ap) {
  save(PIN_KEY, ap ? { iata: ap.iata, icao: ap.icao, name: ap.name, city: ap.city, lat: ap.lat, lon: ap.lon } : null);
}

const shortAirline = (s) => String(s || '').toUpperCase().replace(/ (AIR ?LINES|AIRWAYS|AIRLINES|AIRLINE)$/, '');

function pickAirport(home, list, routes) {
  const score = {};
  for (const ac of list) {
    const r = routes[ac.callsign];
    if (!r) continue;
    for (const ap of [r.from, r.to]) {
      if (!ap?.iata || ap.lat == null) continue;
      const d = distBearing(home, ap.lat, ap.lon).dst;
      if (d > 26) continue;
      // (Written out rather than with ||=, so the tablets' engine can run this file as it is
      // when the screens are tried straight from a PC: see tools/sim/serve.py.)
      const s = score[ap.iata] || (score[ap.iata] = { ap, d, n: 0 });
      s.n += ac.onGround || ac.alt < 12000 ? 2 : 1;
    }
  }
  const ranked = Object.values(score).sort((a, b) => b.n - a.n || a.d - b.d);
  const best = ranked[0];
  const saved = load(AIRPORT_KEY);
  // The nearest few airports with traffic now, for the owner to choose between.
  const near = Object.values(score).sort((a, b) => a.d - b.d).slice(0, 4).map((s) => s.ap);
  const pin = boardAirportPin();
  let ap, why;
  if (pin && pin.iata && distBearing(home, pin.lat, pin.lon).dst < 60) {
    ap = (score[pin.iata] && score[pin.iata].ap) || pin;
    why = 'THE AIRPORT YOU CHOSE';
  } else if (best && (!saved || best.n >= 3 || saved.iata === best.ap.iata)) {
    save(AIRPORT_KEY, best.ap);
    ap = best.ap;
    why = ranked.length > 1 ? 'THE BUSIEST AIRPORT NEAR YOU RIGHT NOW' : 'THE NEAREST AIRPORT WITH FLIGHTS RIGHT NOW';
  } else {
    ap = saved || best?.ap || null;
    why = 'THE AIRPORT NEAR YOU WITH THE MOST FLIGHTS';
  }
  if (!ap) return null;
  if (!near.some((x) => x.iata === ap.iata)) near.push(ap);
  const where = (x) => { const g = distBearing(home, x.lat, x.lon); return { ...x, dst: g.dst, dir: g.dir, mi: Math.round(g.dst * 1.15078), side: compass(g.dir) }; };
  return { ap: { ...where(ap), why, pinned: !!(pin && pin.iata === ap.iata) }, candidates: near.map(where).sort((a, b) => a.dst - b.dst) };
}

export async function getBoard(loc) {
  const data = await getAircraft(loc);
  if (data.sample) return sampleBoard();

  // airborne first so route lookups go to planes that can be on the board
  const airline = data.list
    .filter((a) => /^[A-Z]{3}\d/.test(a.callsign) && (!a.onGround || a.gs > 5))
    .sort((a, b) => a.onGround - b.onGround || a.dst - b.dst);
  const routes = await getRoutes(airline, 40);
  const picked = pickAirport(loc, airline, routes);
  if (!picked) return { live: true, airport: null, departures: [], arrivals: [], taxiing: [], candidates: [], at: data.at, stale: !!data.stale };
  const ap = picked.ap;

  const now = Date.now();
  const departures = [], arrivals = [], taxiing = [];
  for (const ac of airline) {
    const r = routes[ac.callsign];
    if (!r) continue;
    const fromAp = distBearing({ lat: ap.lat, lon: ap.lon }, ac.lat, ac.lon).dst;
    const mins = fromAp / (Math.max(ac.gs, 140) / 60);
    const m = Math.max(0, Math.round(mins));
    const base = {
      f: flightLabel(ac, r), g: ac.type || '—', ac, hex: ac.hex,
      airline: shortAirline(r.airline || airlineOf(ac)), type: typeName(ac),
    };
    if (r.from?.iata === ap.iata && ac.onGround) {
      if (fromAp < 4) taxiing.push({ ...base, time: now, d: r.to?.city || '—', code: r.to?.iata || '', s: 'TAXIING OUT', c: G, cls: 'blink' });
    } else if (r.from?.iata === ap.iata) {
      const climbing = ac.vrate > 300;
      departures.push({
        ...base, time: now - mins * 60000, d: r.to?.city || '—', code: r.to?.iata || '',
        s: m < 3 ? 'JUST TOOK OFF' : `OFF ${m} MIN AGO`, c: climbing ? G : X, cls: climbing && mins < 4 ? 'blink' : '',
      });
    } else if (r.to?.iata === ap.iata) {
      const landed = ac.onGround;
      const final = !landed && ac.alt < 4000 && ac.vrate < 0;
      arrivals.push({
        ...base, time: landed ? now : now + mins * 60000, d: r.from?.city || '—', code: r.from?.iata || '',
        s: landed ? 'LANDED' : final ? 'LANDING NOW' : m >= 60 ? `DUE ${shown(now + mins * 60000)}` : `DUE IN ${Math.max(1, m)} MIN`,
        c: landed ? X : final ? G : ac.vrate < -300 ? A : W, cls: final ? 'blink' : '',
      });
    }
  }
  departures.sort((a, b) => b.time - a.time);
  arrivals.sort((a, b) => a.time - b.time);
  for (const r of [...departures, ...arrivals, ...taxiing]) { r.t = shown(r.time); r.tomorrow = isTomorrow(r.time); }
  return {
    live: true, airport: ap, candidates: picked.candidates, at: data.at, stale: !!data.stale,
    departures: departures.slice(0, MAX_ROWS), arrivals: arrivals.slice(0, MAX_ROWS), taxiing,
  };
}

// ---- Sample board (TODO: replace if a free schedule feed ever turns up) ----
// The design's rows, shifted so the board always looks current.
function sampleBoard() {
  const now = new Date();
  const base = new Date(now); base.setMinutes(Math.floor(now.getMinutes() / 5) * 5 - 25, 0, 0);
  const at = (m) => shown(base.getTime() + m * 60000);
  const dep = [
    [0, 'DL 2214', 'ATLANTA', 'B4', 'DEPARTED', X, '', 'DELTA'],
    [15, 'AA 1187', 'CHARLOTTE', 'A2', 'DEPARTED', X, '', 'AMERICAN'],
    [30, 'UA 431', 'CHICAGO O’HARE', 'C6', 'BOARDING', G, 'blink', 'UNITED'],
    [45, 'WN 1662', 'ORLANDO', 'B9', 'ON TIME', W, '', 'SOUTHWEST'],
    [65, 'DL 988', 'DETROIT', 'B2', `DELAYED ${at(100)}`, A, '', 'DELTA'],
    [80, 'B6 504', 'FORT LAUDERDALE', 'A5', 'ON TIME', W, '', 'JETBLUE'],
    [95, 'AA 2290', 'DALLAS/FT WORTH', 'A7', 'ON TIME', W, '', 'AMERICAN'],
    [120, 'UA 1702', 'DENVER', 'C3', 'ON TIME', W, '', 'UNITED'],
    [145, 'WN 377', 'PHOENIX', 'B11', 'ON TIME', W, '', 'SOUTHWEST'],
  ];
  const arr = [
    [5, 'UA 1180', 'HOUSTON', 'C2', 'LANDED', X, '', 'UNITED'],
    [20, 'DL 1423', 'ATLANTA', 'B6', 'LANDED', X, '', 'DELTA'],
    [35, 'AA 461', 'MIAMI', 'A4', 'LANDING NOW', G, 'blink', 'AMERICAN'],
    [50, 'WN 2283', 'NASHVILLE', 'B8', 'ON TIME', W, '', 'SOUTHWEST'],
    [70, 'B6 1120', 'BOSTON', 'A1', 'ON TIME', W, '', 'JETBLUE'],
    [85, 'DL 741', 'MINNEAPOLIS', 'B3', `DELAYED ${at(110)}`, A, '', 'DELTA'],
    [100, 'UA 619', 'SAN FRANCISCO', 'C5', 'ON TIME', W, '', 'UNITED'],
    [125, 'AA 3012', 'CHICAGO O’HARE', 'A6', 'ON TIME', W, '', 'AMERICAN'],
    [150, 'WN 455', 'TAMPA', 'B10', 'ON TIME', W, '', 'SOUTHWEST'],
  ];
  const rows = (list) => list.map(([m, f, d, g, s, c, cls, airline]) => {
    const time = base.getTime() + m * 60000;
    return { t: at(m), time, f, d, g, s, c, cls, airline, tomorrow: isTomorrow(time) };
  });
  return { live: false, sample: true, airport: null, candidates: [], departures: rows(dep), arrivals: rows(arr), taxiing: [], at: Date.now() };
}
