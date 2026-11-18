// "Sky alert": things worth running outside for, detected from real data.
//   - Space Station: a visible pass starting within 10 minutes (our own prediction)
//   - Rocket launch: any launch with status Go within 10 minutes (Launch Library 2)
//   - Rare plane: B-52, A380, Air Force One... within the 25-mile radar (live ADS-B only)
//   - Plane right over the house: under ~0.6 mi away and below 10,000 ft (live ADS-B only)
//   - Northern lights: NOAA's Kp forecast for tonight high enough for this latitude
//   - Meteor shower: the evening of a major shower's peak
// The Bridge checks every minute and jumps to #/alert for anything new.
import { getAircraft, getRoutes, RARE, typeName, flightLabel, routeText, fmtAlt, compass } from './aircraft.js';
import { nextVisiblePass, getCrew } from './iss.js';

const SEEN_KEY = 'skyalert.seen.v1';
const TEST_KEY = 'skyalert.test';
const LAUNCH_KEY = 'skyalert.launches.v1';
const KP_KEY = 'skyalert.kp.v1';
const MI = 1.15078;

const SHOWERS = [ // [name, month, peak night day, peak meteors/hour]
  ['QUADRANTIDS', 1, 3, 80], ['LYRIDS', 4, 22, 18], ['ETA AQUARIIDS', 5, 5, 40], ['PERSEIDS', 8, 12, 100],
  ['DRACONIDS', 10, 8, 10], ['ORIONIDS', 10, 21, 20], ['LEONIDS', 11, 17, 15], ['GEMINIDS', 12, 13, 120],
  ['URSIDS', 12, 22, 10],
];

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
  const c = JSON.parse(localStorage.getItem(key) || 'null');
  if (c && Date.now() - c.at < maxAge) return c.data;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(url);
    const data = await res.json();
    localStorage.setItem(key, JSON.stringify({ at: Date.now(), data }));
    return data;
  } catch {
    return c?.data || null;
  }
}

async function issAlert(loc) {
  const p = await nextVisiblePass(loc);
  if (!p) return null;
  const now = Date.now();
  if (p.visStart - now > 10 * 60000 || p.visEnd < now) return null;
  const crew = await getCrew();
  const mins = Math.max(1, Math.round((p.visEnd - p.visStart) / 60000));
  return {
    id: `iss-${p.visStart}`, kind: 'iss', until: p.visStart, ends: p.visEnd,
    label: 'SPACE STATION OVERHEAD IN',
    nowLabel: 'SPACE STATION OVERHEAD NOW',
    headline: `GO OUTSIDE · LOOK ${compass(p.visAz)}`,
    sub: `Bright steady light for about ${mins} minute${mins > 1 ? 's' : ''}, ${heightWords(p.visMaxEl)}` +
      (crew.onIss ? ` · ${crew.onIss} people aboard right now` : ''),
  };
}

async function launchAlert() {
  const d = await cachedJSON(LAUNCH_KEY, 'https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=5&mode=list', 20 * 60000);
  const now = Date.now();
  const l = (d?.results || []).find((r) => {
    const t = Date.parse(r.net);
    return r.status?.abbrev === 'Go' && t - now < 10 * 60000 && t - now > -3 * 60000;
  });
  if (!l) return null;
  const [rocket, mission] = l.name.split('|').map((s) => s.trim().toUpperCase());
  return {
    id: `launch-${l.id}`, kind: 'launch', until: Date.parse(l.net), ends: Date.parse(l.net) + 10 * 60000,
    label: 'ROCKET LAUNCH IN', nowLabel: 'ROCKET LAUNCHING NOW',
    headline: `${rocket}${mission ? ' · ' + mission : ''}`,
    // (There is no live stream on the tablet, so don't promise one.)
    sub: [l.location || l.pad, 'Countdown and details on the space missions screen'].filter(Boolean).join(' · '),
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
  const h = new Date().getHours();
  if (h < 15 && h > 4) return null; // only from mid-afternoon through the night
  const d = await cachedJSON(KP_KEY, 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json', 3 * 3600000);
  if (!Array.isArray(d)) return null;
  const now = Date.now();
  const tonight = d.filter((r) => {
    const t = Date.parse(r.time_tag + 'Z');
    return t > now - 3 * 3600000 && t < now + 15 * 3600000;
  });
  const kp = Math.max(0, ...tonight.map((r) => Number(r.kp) || 0));
  if (kp < auroraThreshold(loc.lat)) return null;
  const day = new Date().toDateString();
  return {
    id: `aurora-${day}`, kind: 'aurora', big: `KP ${Math.round(kp)}`,
    label: 'NORTHERN LIGHTS POSSIBLE TONIGHT', headline: `GO OUTSIDE AFTER DARK · LOOK ${loc.lat >= 0 ? 'NORTH' : 'SOUTH'}`,
    sub: 'A strong solar storm is forecast · Get away from street lights and give your eyes 15 minutes',
  };
}

function meteorAlert() {
  const now = new Date();
  const h = now.getHours();
  if (h < 19 && h > 4) return null;
  // after midnight still counts as the previous evening's peak night
  const night = new Date(now.getTime() - (h <= 4 ? 86400000 : 0));
  const s = SHOWERS.find(([, m, d]) => m === night.getMonth() + 1 && d === night.getDate());
  if (!s) return null;
  return {
    id: `meteor-${s[0]}-${night.getFullYear()}`, kind: 'meteor', big: s[0],
    label: 'METEOR SHOWER PEAK TONIGHT', headline: 'GO OUTSIDE · LIE BACK AND LOOK UP',
    sub: `Up to ${s[3]} shooting stars an hour from a dark spot · Best after midnight`,
  };
}

// Highest-priority alert happening now (or null). Each check fails quietly.
export async function checkAlerts(loc) {
  const checks = [() => issAlert(loc), launchAlert, () => planeAlert(loc), () => auroraAlert(loc), meteorAlert];
  for (const c of checks) {
    try {
      const a = await c();
      if (a) return a;
    } catch (e) { console.warn('sky alert check failed', e); }
  }
  return null;
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
  return (JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')).includes(id);
}
export function markSeen(id) {
  const seen = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]').filter((x) => x !== id);
  seen.push(id);
  localStorage.setItem(SEEN_KEY, JSON.stringify(seen.slice(-50)));
}
