// Departures / arrivals board for the nearest airport — built only from what is
// really in the air. There is no free, keyless, CORS-friendly airport schedule
// feed, so instead:
//   1. take the live aircraft around the house (aircraft.js)
//   2. look up each flight's route (adsbdb.com)
//   3. the "home airport" is the nearby airport (within ~30 mi) that the most
//      low-flying routes start or end at
//   4. DEPARTURES = flights from that airport still in the air nearby, newest first
//      ARRIVALS   = flights heading into it, soonest first
// Times are estimates (distance from the airport ÷ ground speed). Gates are not
// knowable, so that column shows the aircraft type instead.
// If no live feed is reachable we fall back to the design's sample board (flagged).
import { getAircraft, getRoutes, distBearing, flightLabel } from './aircraft.js';

const AIRPORT_KEY = 'departures.airport.v1';

const pad = (n) => String(n).padStart(2, '0');
export const hhmm = (t) => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

const G = '#7CF29A', A = '#FFB547', W = '#F4E9C8', X = '#6E6A5E';

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
  const best = Object.values(score).sort((a, b) => b.n - a.n || a.d - b.d)[0];
  const saved = JSON.parse(localStorage.getItem(AIRPORT_KEY) || 'null');
  if (best && (!saved || best.n >= 3 || saved.iata === best.ap.iata)) {
    localStorage.setItem(AIRPORT_KEY, JSON.stringify(best.ap));
    return best.ap;
  }
  return saved || best?.ap || null;
}

export async function getBoard(loc) {
  const data = await getAircraft(loc);
  if (data.sample) return sampleBoard();

  // airborne first so route lookups go to planes that can be on the board
  const airline = data.list
    .filter((a) => /^[A-Z]{3}\d/.test(a.callsign) && (!a.onGround || a.gs > 5))
    .sort((a, b) => a.onGround - b.onGround || a.dst - b.dst);
  const routes = await getRoutes(airline, 40);
  const ap = pickAirport(loc, airline, routes);
  if (!ap) return { live: true, airport: null, departures: [], arrivals: [], at: data.at };

  const now = Date.now();
  const departures = [], arrivals = [];
  for (const ac of airline) {
    const r = routes[ac.callsign];
    if (!r) continue;
    const fromAp = distBearing({ lat: ap.lat, lon: ap.lon }, ac.lat, ac.lon).dst;
    const mins = fromAp / (Math.max(ac.gs, 140) / 60);
    const base = { f: flightLabel(ac, r), g: ac.type || '—', ac };
    if (r.from?.iata === ap.iata && !ac.onGround) {
      const climbing = ac.vrate > 300;
      departures.push({
        ...base, time: now - mins * 60000, d: r.to?.city || '—',
        s: climbing ? 'CLIMBING' : 'DEPARTED', c: climbing ? G : X, cls: climbing && mins < 4 ? 'blink' : '',
      });
    } else if (r.to?.iata === ap.iata) {
      const landed = ac.onGround;
      const final = !landed && ac.alt < 4000 && ac.vrate < 0;
      arrivals.push({
        ...base, time: landed ? now : now + mins * 60000, d: r.from?.city || '—',
        s: landed ? 'LANDED' : final ? 'LANDING' : ac.vrate < -300 ? 'DESCENDING' : 'EN ROUTE',
        c: landed ? X : final ? G : ac.vrate < -300 ? A : W, cls: final ? 'blink' : '',
      });
    }
  }
  departures.sort((a, b) => b.time - a.time);
  arrivals.sort((a, b) => a.time - b.time);
  for (const r of [...departures, ...arrivals]) r.t = hhmm(r.time);
  return { live: true, airport: ap, departures: departures.slice(0, 9), arrivals: arrivals.slice(0, 9), at: data.at };
}

// ---- Sample board (TODO: replace if a free schedule feed ever turns up) ----
// The design's rows, shifted so the board always looks current.
function sampleBoard() {
  const now = new Date();
  const base = new Date(now); base.setMinutes(Math.floor(now.getMinutes() / 5) * 5 - 25, 0, 0);
  const at = (m) => hhmm(base.getTime() + m * 60000);
  const dep = [
    [0, 'DL 2214', 'ATLANTA', 'B4', 'DEPARTED', X, ''],
    [15, 'AA 1187', 'CHARLOTTE', 'A2', 'DEPARTED', X, ''],
    [30, 'UA 431', 'CHICAGO O’HARE', 'C6', 'BOARDING', G, 'blink'],
    [45, 'WN 1662', 'ORLANDO', 'B9', 'ON TIME', W, ''],
    [65, 'DL 988', 'DETROIT', 'B2', `DELAYED ${at(100)}`, A, ''],
    [80, 'B6 504', 'FORT LAUDERDALE', 'A5', 'ON TIME', W, ''],
    [95, 'AA 2290', 'DALLAS/FT WORTH', 'A7', 'ON TIME', W, ''],
    [120, 'UA 1702', 'DENVER', 'C3', 'ON TIME', W, ''],
    [145, 'WN 377', 'PHOENIX', 'B11', 'ON TIME', W, ''],
  ];
  const arr = [
    [5, 'UA 1180', 'HOUSTON', 'C2', 'LANDED', X, ''],
    [20, 'DL 1423', 'ATLANTA', 'B6', 'LANDED', X, ''],
    [35, 'AA 461', 'MIAMI', 'A4', 'LANDING', G, 'blink'],
    [50, 'WN 2283', 'NASHVILLE', 'B8', 'ON TIME', W, ''],
    [70, 'B6 1120', 'BOSTON', 'A1', 'ON TIME', W, ''],
    [85, 'DL 741', 'MINNEAPOLIS', 'B3', `DELAYED ${at(110)}`, A, ''],
    [100, 'UA 619', 'SAN FRANCISCO', 'C5', 'ON TIME', W, ''],
    [125, 'AA 3012', 'CHICAGO O’HARE', 'A6', 'ON TIME', W, ''],
    [150, 'WN 455', 'TAMPA', 'B10', 'ON TIME', W, ''],
  ];
  const rows = (list) => list.map(([m, f, d, g, s, c, cls]) => ({ t: at(m), time: base.getTime() + m * 60000, f, d, g, s, c, cls }));
  return { live: false, sample: true, airport: null, departures: rows(dep), arrivals: rows(arr), at: Date.now() };
}
