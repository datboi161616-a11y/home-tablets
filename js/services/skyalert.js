// "Sky alert": things worth running outside for, detected from real data.
//   - Space Station: a visible pass starting within 10 minutes (our own prediction)
//   - Rocket launch: any launch with status Go within 10 minutes (Launch Library 2)
//   - Rare plane: B-52, A380, Air Force One... within the 25-mile radar (live ADS-B only)
//   - Plane right over the house: under ~0.6 mi away and below 10,000 ft (live ADS-B only)
//   - Northern lights: NOAA's Kp forecast for tonight high enough for this latitude
//   - Meteor shower: the evening of a major shower's peak
//   (those two only once the sky is properly dark, and not under a forecast overcast)
// The Bridge checks every minute and jumps to #/alert for anything new. An alert put away
// with SEEN IT / DISMISS (dismiss()) is not offered again.
import { getAircraft, getRoutes, RARE, typeName, flightLabel, routeText, fmtAlt, compass } from './aircraft.js';
import { nextVisiblePass, getCrew, brightnessWords } from './iss.js';
import { getCloudCover, getLaunches } from './space.js';
import { sunAlt, moonPhase, position } from './astro.js';

const SEEN_KEY = 'skyalert.seen.v1';
const TEST_KEY = 'skyalert.test';
const KP_KEY = 'skyalert.kp.v1';
const MI = 1.15078;

const SHOWERS = [ // [name, month, peak night day, peak meteors/hour]
  ['QUADRANTIDS', 1, 3, 80], ['LYRIDS', 4, 22, 18], ['ETA AQUARIIDS', 5, 5, 40], ['PERSEIDS', 8, 12, 100],
  ['DRACONIDS', 10, 8, 10], ['ORIONIDS', 10, 21, 20], ['LEONIDS', 11, 17, 15], ['GEMINIDS', 12, 13, 120],
  ['URSIDS', 12, 22, 10],
];

// The evening a night belongs to: before 5 AM it is still last night's sky.
const eveningOf = (now) => {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (now.getHours() <= 4) d.setDate(d.getDate() - 1);
  return d;
};

/**
 * A meteor shower whose peak is close: from 2 nights before to the night after.
 * { name, date (peak evening), rate, nights: peak night minus tonight (-1 = peaked last night) } or null.
 */
export function showerNear(now = new Date()) {
  const eve = eveningOf(now);
  for (const year of [eve.getFullYear() - 1, eve.getFullYear(), eve.getFullYear() + 1]) {
    for (const [name, m, d, rate] of SHOWERS) {
      const date = new Date(year, m - 1, d);
      const nights = Math.round((date - eve) / 86400000);
      if (nights >= -1 && nights <= 2) return { name, date, rate, nights };
    }
  }
  return null;
}

// The next meteor shower peak night from today: { name, date, rate }.
export function nextShower(now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // Before 5 AM it is still last night's sky.
  if (now.getHours() <= 4) today.setDate(today.getDate() - 1);
  for (const year of [today.getFullYear(), today.getFullYear() + 1]) {
    for (const [name, m, d, rate] of SHOWERS) {
      const date = new Date(year, m - 1, d);
      if (date >= today) return { name, date, rate };
    }
  }
  return null;
}

// How high the Space Station climbs, in plain words.
export function heightWords(maxEl) {
  if (maxEl >= 60) return 'passing almost straight overhead';
  if (maxEl >= 35) return 'climbing high in the sky';
  return 'staying low in the sky';
}

async function cachedJSON(key, url, maxAge) {
  let c = null;
  try { c = JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { c = null; }
  if (c && Date.now() - c.at < maxAge) return c.data;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(url);
    const data = await res.json();
    try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), data })); } catch (e) { /* storage full */ }
    return data;
  } catch {
    return c?.data || null;
  }
}

/** Average cloud cover (%) over the next `hours` here, or null when no forecast is kept. */
async function cloudsAhead(loc, hours) {
  try {
    const c = await getCloudCover(loc);
    if (!c) return null;
    const now = Date.now();
    const vals = c.time.map((t, k) => (t >= now - 3600000 && t <= now + hours * 3600000 ? c.cloud[k] : null)).filter((v) => typeof v === 'number');
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  } catch (e) { return null; }
}

/** The Sun's height here now: alerts for night-sky things only go off once it is really dark. */
const sunNow = (loc) => sunAlt(new Date(), loc.lat, loc.lon);

async function issAlert(loc) {
  const p = await nextVisiblePass(loc);
  if (!p) return null;
  const now = Date.now();
  if (p.visStart - now > 10 * 60000 || p.visEnd < now) return null;
  const crew = await getCrew();
  const clouds = await cloudsAhead(loc, 1);
  const mins = Math.max(1, Math.round((p.visEnd - p.visStart) / 60000));
  // Where to look the whole way: where it appears, where it is highest, where it fades.
  const path = p.visMaxAz != null && p.visEndAz != null
    ? `Appears ${compass(p.visAz).toLowerCase()}, highest ${compass(p.visMaxAz).toLowerCase()}, fades ${compass(p.visEndAz).toLowerCase()}`
    : '';
  return {
    id: `iss-${p.visStart}`, kind: 'iss', until: p.visStart, ends: p.visEnd,
    label: 'SPACE STATION OVERHEAD IN',
    nowLabel: 'SPACE STATION OVERHEAD NOW',
    headline: `GO OUTSIDE · LOOK ${compass(p.visAz)}`,
    sub: [`${brightnessWords(p) === 'VERY BRIGHT' ? 'Very bright' : brightnessWords(p) === 'BRIGHT' ? 'Bright' : 'Fainter'} steady light for about ${mins} minute${mins > 1 ? 's' : ''}, ${heightWords(p.visMaxEl)}`,
      path, clouds != null && clouds >= 80 ? 'Cloudy: it may be hidden' : '',
      crew.onIss ? `${crew.onIss} people aboard right now` : ''].filter(Boolean).join(' · '),
    link: { href: '#/sky', label: 'SEE ITS PATH' },
  };
}

// Uses the same launch list as the missions screen (one feed, one set of times): kept for
// hours normally, but checked every 20 minutes when a launch is due within the hour, so a
// scrub or hold is noticed before the screen goes red.
async function launchAlert() {
  const now = Date.now();
  const due = (list) => list.some((l) => Math.abs(Date.parse(l.net) - now) < 3600000);
  let r = await getLaunches();
  if (r.source === 'sample') return null; // never alert on sample data
  if (due(r.launches)) r = await getLaunches({ maxAge: 20 * 60000 });
  const l = (r.launches || []).find((x) => {
    const t = Date.parse(x.net);
    return x.statusAbbrev === 'Go' && ['MIN', 'SEC'].includes(x.precision) && t - now < 10 * 60000 && t - now > -3 * 60000;
  });
  if (!l) return null;
  return {
    id: `launch-${l.id}`, kind: 'launch', until: Date.parse(l.net), ends: Date.parse(l.net) + 10 * 60000,
    label: 'ROCKET LAUNCH IN', nowLabel: 'ROCKET LAUNCHING NOW',
    headline: `${(l.rocket || '').toUpperCase()}${l.name ? ' · ' + l.name.toUpperCase() : ''}`,
    // (There is no live stream on the screen, so don't promise one.)
    sub: [l.site, 'Countdown and details on the space missions screen'].filter(Boolean).join(' · '),
    link: { href: '#/missions', label: 'LAUNCH DETAILS' },
  };
}

async function planeAlert(loc) {
  const data = await getAircraft(loc);
  if (data.sample) return null; // never alert on sample data
  const air = data.list.filter((a) => !a.onGround);
  const rare = air.find((a) => RARE[a.type] || /^(AF1|AF2|SAM\d)/.test(a.callsign));
  const over = air.find((a) => a.dst < 0.55 && a.alt >= 500 && a.alt < 10000);
  const ac = rare || over;
  if (!ac) return null;
  const routes = await getRoutes([ac], 1);
  const route = routes[ac.callsign];
  const miles = (ac.dst * MI).toFixed(1);
  const look = ac.dst < 0.5 ? 'LOOK STRAIGHT UP' : `LOOK ${compass(ac.dir)}`;
  if (rare) {
    return {
      id: `rare-${ac.hex}`, kind: 'rare', big: RARE[ac.type] || 'AF ONE',
      label: 'RARE PLANE OVERHEAD', headline: `GO OUTSIDE · ${look}`,
      sub: `${typeName(ac)} · ${fmtAlt(ac)} · ${miles} miles away · ${flightLabel(ac, route)}`,
      link: { href: '#/flights', label: 'SEE IT ON THE RADAR' },
    };
  }
  return {
    id: `over-${ac.hex}`, kind: 'overhead', big: flightLabel(ac, route),
    label: 'PLANE PASSING RIGHT OVER YOUR HOUSE', headline: `${look} · ${fmtAlt(ac)}`,
    sub: `${typeName(ac)} · ${routeText(ac, route)}`,
    link: { href: '#/flights', label: 'SEE IT ON THE RADAR' },
  };
}

function auroraThreshold(lat) {
  const a = Math.abs(lat);
  return a >= 60 ? 4 : a >= 55 ? 5 : a >= 50 ? 6 : a >= 45 ? 7 : a >= 40 ? 8 : 9;
}

async function auroraAlert(loc) {
  // Only once it is properly dark (Sun 12° down): there is nothing to see before.
  if (sunNow(loc) > -12) return null;
  // A sky full of cloud hides it: not worth sending anyone out.
  const clouds = await cloudsAhead(loc, 4);
  if (clouds != null && clouds >= 90) return null;
  const d = await cachedJSON(KP_KEY, 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json', 3 * 3600000);
  if (!Array.isArray(d)) return null;
  const now = Date.now();
  const tonight = d.filter((r) => {
    const t = Date.parse(r.time_tag + 'Z');
    return t > now - 3 * 3600000 && t < now + 15 * 3600000;
  });
  const kp = Math.max(0, ...tonight.map((r) => Number(r.kp) || 0));
  if (kp < auroraThreshold(loc.lat)) return null;
  // One alert per night: after midnight it is still the same night.
  const day = eveningOf(new Date()).toDateString();
  return {
    id: `aurora-${day}`, kind: 'aurora', big: `KP ${Math.round(kp)}`,
    label: `${loc.lat >= 0 ? 'NORTHERN' : 'SOUTHERN'} LIGHTS POSSIBLE TONIGHT`, headline: `GO OUTSIDE NOW · LOOK ${loc.lat >= 0 ? 'NORTH' : 'SOUTH'}, LOW`,
    sub: 'A strong solar storm is forecast · Get away from street lights and give your eyes 15 minutes · Not certain: it may not show',
    link: { href: '#/sky', label: "TONIGHT'S SKY" },
  };
}

async function meteorAlert(loc) {
  // Only on the peak night, and only while it is properly dark (Sun 12° down).
  if (sunNow(loc) > -12) return null;
  const night = eveningOf(new Date());
  const s = SHOWERS.find(([, m, d]) => m === night.getMonth() + 1 && d === night.getDate());
  if (!s) return null;
  // The small showers (10-20 an hour) are only worth it under a clear sky; none are under overcast.
  const clouds = await cloudsAhead(loc, 4);
  if (clouds != null && clouds >= (s[3] >= 40 ? 90 : 60)) return null;
  // A bright Moon washes out all but the brightest shooting stars: say so.
  const ph = moonPhase(new Date());
  const moonUp = position('moon', new Date(), loc.lat, loc.lon).alt > 0;
  return {
    id: `meteor-${s[0]}-${night.getFullYear()}`, kind: 'meteor', big: s[0],
    label: 'METEOR SHOWER PEAK TONIGHT', headline: 'GO OUTSIDE · LIE BACK AND LOOK UP',
    sub: `Up to ${s[3]} shooting stars an hour from a dark spot · Best after midnight` +
      (ph.fraction > 0.5 && moonUp ? ' · The bright Moon will hide the fainter ones' : ''),
    link: { href: '#/sky', label: "TONIGHT'S SKY" },
  };
}

// Highest-priority alert happening now (or null). Each check fails quietly.
export async function checkAlerts(loc) {
  const checks = [() => issAlert(loc), launchAlert, () => planeAlert(loc), () => auroraAlert(loc), () => meteorAlert(loc)];
  for (const c of checks) {
    try {
      const a = await c();
      if (a && !isDismissed(a.id)) return a;
    } catch (e) { console.warn('sky alert check failed', e); }
  }
  return null;
}

// "Seen it": an alert the owner put away himself stays away (until the next one).
const DISMISSED_KEY = 'skyalert.dismissed.v1';
const readList = (key) => { try { const v = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } };
export const isDismissed = (id) => readList(DISMISSED_KEY).includes(id);
export function dismiss(id) {
  const list = readList(DISMISSED_KEY).filter((x) => x !== id);
  list.push(id);
  try { localStorage.setItem(DISMISSED_KEY, JSON.stringify(list.slice(-50))); } catch (e) { /* storage off */ }
}

// The design's own example: Space Station in 3:00, used by the TEST ALERT button.
export function testAlert() {
  const until = Number(sessionStorage.getItem(TEST_KEY)) || Date.now() + 180000;
  return {
    id: 'test', kind: 'iss', test: true, until, ends: until + 10000,
    label: 'SPACE STATION OVERHEAD IN', nowLabel: 'SPACE STATION OVERHEAD NOW',
    headline: 'GO OUTSIDE · LOOK NORTHWEST',
    sub: 'TEST ALERT · Bright steady light crossing the sky for about 5 minutes',
  };
}
export function startTest() { sessionStorage.setItem(TEST_KEY, String(Date.now() + 180000)); }
export function stopTest() { sessionStorage.removeItem(TEST_KEY); }
export const testActive = () => !!sessionStorage.getItem(TEST_KEY);

export function wasSeen(id) {
  return readList(SEEN_KEY).includes(id);
}
export function markSeen(id) {
  const seen = readList(SEEN_KEY).filter((x) => x !== id);
  seen.push(id);
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(seen.slice(-50))); } catch (e) { /* storage off */ }
}
