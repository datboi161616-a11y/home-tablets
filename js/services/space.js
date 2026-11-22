// Live space data for Tom's screens. Every source is free and sends CORS headers:
//   - Launch Library 2 (thespacedevs.com): upcoming rocket launches. ~15 calls/hour limit.
//   - NASA APOD (api.nasa.gov): picture of the day. DEMO_KEY allows ~30/hour, 50/day.
//   - NASA Image Library (images-assets.nasa.gov): fallback deep-space pictures.
//   - ISS orbit elements via iss.js (CelesTrak / wheretheiss.at), flyovers worked out locally (astro.js).
//   - corquaid "people in space" JSON on GitHub Pages: ISS crew count.
//   - Open-Meteo: tonight's cloud cover.
// Everything is cached in localStorage. When a source fails we use the last
// cached copy (however old), and if there is none, built-in sample data.
import { issPasses } from './astro.js';
import { getElements } from './iss.js';

// Swap in a free personal key from https://api.nasa.gov for higher limits.
export const NASA_API_KEY = 'DEMO_KEY';

const HOUR = 3600000;

function readCache(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
}
function writeCache(key, data, extra = {}) {
  try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), data, ...extra })); } catch { /* storage full */ }
}

// When a feed fails it is left alone for 5 minutes: several screens ask every minute, and
// asking a busy server again and again (Launch Library allows ~15 calls an hour) only
// keeps it refusing.
const failedAt = {};
const RETRY_MS = 5 * 60000;

/** Fresh cache -> network -> stale cache -> fallback(). Returns { data, source }. */
async function cachedFetch(key, maxAge, load, fallback, valid = () => true) {
  const c = readCache(key);
  if (c && Date.now() - c.at < maxAge && valid(c)) return { data: c.data, source: 'cache' };
  try {
    if (Date.now() - (failedAt[key] || 0) < RETRY_MS) throw new Error('failed a moment ago; waiting before asking again');
    const data = await load();
    writeCache(key, data);
    delete failedAt[key];
    return { data, source: 'live' };
  } catch (err) {
    if (!failedAt[key] || Date.now() - failedAt[key] >= RETRY_MS) { failedAt[key] = Date.now(); console.warn(key, err); }
    if (c) return { data: c.data, source: 'stale' };
    return { data: fallback(), source: 'sample' };
  }
}

async function getJSON(url) {
  // Give up after 8s so a hanging server falls back instead of loading forever.
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

// ------------------------------------------------------------ Launches
const SAMPLE_LAUNCHES = () => {
  const t = new Date(); t.setDate(t.getDate() + 1); t.setHours(14, 30, 0, 0);
  return [{ name: 'Starlink Group', rocket: 'Falcon 9', site: 'Cape Canaveral, FL, USA',
    net: t.toISOString(), precision: 'MIN', status: 'Sample, not a real launch', sample: true }];
};

// People are aboard: said only when the name makes it certain.
const CREWED = /\b(crew-\d|crew flight|shenzhou|soyuz ms|axiom|ax-\d|artemis ii|polaris|gaganyaan h)/i;
const NET_KEY = 'space.launchnet.v1'; // { [launch id]: { net, was } } to notice a date that moved

function mapLaunch(l) {
  const [rocketPart, missionPart] = (l.name || '').split('|').map((s) => s.trim());
  const lat = Number(l.pad?.latitude), lon = Number(l.pad?.longitude);
  const name = l.mission?.name || missionPart || l.name;
  return {
    id: l.id || null,
    name,
    rocket: l.rocket?.configuration?.name || rocketPart || '',
    site: l.pad?.location?.name || l.pad?.name || '',
    net: l.net,
    precision: l.net_precision?.abbrev || 'MIN',
    status: l.status?.name || '',
    // Added fields (older cached copies may not have them):
    statusAbbrev: l.status?.abbrev || '',       // Go, TBC, TBD, Hold, Success, Failure, Partial Failure, In Flight
    provider: l.launch_service_provider?.name || '',
    mission: (l.mission?.description || '').replace(/\s+/g, ' ').trim(),
    orbit: l.mission?.orbit?.name || '',
    type: l.mission?.type || '',
    crewed: CREWED.test(`${l.name || ''} ${name || ''}`) && !/tianzhou|cargo|crs-/i.test(l.name || ''),
    padLat: Number.isFinite(lat) ? lat : null,
    padLon: Number.isFinite(lon) ? lon : null,
    windowEnd: l.window_end || null,
    probability: typeof l.probability === 'number' && l.probability >= 0 ? l.probability : null, // weather chance, %
    failReason: l.failreason || '',
  };
}

/** Remembers each launch's date between checks, so a launch that slipped can say "WAS ...". */
function noteSlips(list) {
  let seen = {};
  try { seen = JSON.parse(localStorage.getItem(NET_KEY) || '{}') || {}; } catch { seen = {}; }
  const next = {};
  for (const l of list) {
    if (!l.id) continue;
    const old = seen[l.id];
    let was = old?.was || null;
    if (old && Math.abs(Date.parse(old.net) - Date.parse(l.net)) > 30 * 60000) was = old.net;
    if (was && Math.abs(Date.parse(was) - Date.parse(l.net)) <= 30 * 60000) was = null; // moved back again
    next[l.id] = { net: l.net, was };
    l.slippedFrom = was;
  }
  try { localStorage.setItem(NET_KEY, JSON.stringify(next)); } catch { /* full */ }
  return list;
}

/** maxAge: how old a kept list may be (default 3 hours; the screen asks sooner near a launch). */
export async function getLaunches({ maxAge = 3 * HOUR } = {}) {
  const r = await cachedFetch('space.launches.v1', Math.max(10 * 60000, maxAge), async () => {
    const d = await getJSON('https://ll.thespacedevs.com/2.3.0/launches/upcoming/?limit=10&mode=normal');
    return noteSlips(d.results.map(mapLaunch));
  }, SAMPLE_LAUNCHES,
  // Refetch early if every cached launch has already gone.
  (c) => c.data.some((l) => new Date(l.net) > Date.now()));
  // at: when this list was fetched (for "AS OF 3:05 PM"); null for the sample.
  const c = r.source === 'sample' ? null : readCache('space.launches.v1');
  return { ...r, launches: r.data, at: c ? c.at : null };
}

/**
 * The most recent launch that has happened, with how it went:
 * { name, rocket, site, net, status, result: 'success' | 'failure' | 'partial' | null } or null.
 */
export async function getLastLaunch() {
  const r = await cachedFetch('space.lastlaunch.v1', 3 * HOUR, async () => {
    const d = await getJSON('https://ll.thespacedevs.com/2.3.0/launches/previous/?limit=1&mode=normal');
    const l = d.results && d.results[0];
    if (!l) throw new Error('no previous launch');
    return mapLaunch(l);
  }, () => null);
  const l = r.data;
  if (!l) return null;
  const a = (l.statusAbbrev || l.status || '').toLowerCase();
  const result = /partial/.test(a) ? 'partial' : /fail/.test(a) ? 'failure' : /success/.test(a) ? 'success' : null;
  return { ...l, result, source: r.source };
}

/** First launch that hasn't happened yet (keeps one for 30 min after T-0 for a "LIFTOFF" moment). */
export function nextLaunch(launches, now = Date.now()) {
  return launches.find((l) => new Date(l.net).getTime() > now - 30 * 60000) || null;
}

// ------------------------------------------------------------ ISS
export async function getIssCrew() {
  const r = await cachedFetch('space.crew.v1', 12 * HOUR, async () => {
    const d = await getJSON('https://corquaid.github.io/international-space-station-APIs/JSON/people-in-space.json');
    return d.people.filter((p) => p.iss).length;
  }, () => 7);
  return r.data;
}

const epochMs = (omm) => new Date(String(omm.EPOCH).replace(/(\.\d{3})\d*/, '$1') + 'Z').getTime();

// The orbit comes from the Space Station service (iss.js): CelesTrak, then wheretheiss.at,
// then a built-in one. One orbit for every screen, so the sky chart, the deck and the
// alerts all give the same pass times (they used to fetch and keep separate copies).
async function getIssElements() {
  let omm = null;
  try {
    const el = await getElements();
    omm = { EPOCH: new Date(el.epoch).toISOString().slice(0, 23), MEAN_MOTION: el.n, MEAN_MOTION_DOT: el.ndot,
      ECCENTRICITY: el.e, INCLINATION: el.i, RA_OF_ASC_NODE: el.raan, ARG_OF_PERICENTER: el.argp, MEAN_ANOMALY: el.M };
  } catch (e) { return null; }
  // Elements older than ~10 days are too stale to predict passes.
  if (Date.now() - epochMs(omm) > 10 * 24 * HOUR) return null;
  return omm;
}

/** Visible ISS flyovers for the next `hours`. Returns [] if the orbit is unavailable. */
export async function getIssPasses(loc, hours = 72) {
  return (await getIssPassInfo(loc, hours)).passes;
}

/**
 * Same, with whether the orbit was known at all: { passes, known }. known = false means
 * "we can't say" (no recent orbit), which is different from "none you can see".
 */
export async function getIssPassInfo(loc, hours = 72) {
  const omm = await getIssElements();
  if (!omm) return { passes: [], known: false };
  return { passes: issPasses(omm, loc.lat, loc.lon, new Date(), hours), known: true };
}

/** "TONIGHT 6:42 PM", "TOMORROW 7:05 PM", "THU 6:42 PM" */
export function passDay(date, now = new Date()) {
  const day = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((day(date) - day(now)) / 86400000);
  const time = fmtTime(date);
  if (diff === 0) return `${date.getHours() >= 17 ? 'TONIGHT' : 'TODAY'} ${time}`;
  if (diff === 1 && date.getHours() < 6 && now.getHours() >= 12) return `TONIGHT ${time}`;
  if (diff === 1) return `TOMORROW ${time}`;
  return `${date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()} ${time}`;
}

export const fmtTime = (d) =>
  d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toUpperCase();

// ------------------------------------------------------------ Cloud cover
/**
 * Hourly cloud cover (%) from Open-Meteo. Returns { time: [...ms], cloud: [...], at } or null
 * (at: when the forecast was fetched). A forecast kept for another place is never used:
 * after the town is changed in Settings it would describe someone else's sky.
 */
export async function getCloudCover(loc) {
  const key = 'space.clouds.v1';
  const raw = readCache(key);
  const c = raw && raw.lat === loc.lat && raw.lon === loc.lon ? raw : null;
  if (c) c.data.at = c.at;
  if (c && Date.now() - c.at < HOUR) return c.data;
  try {
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.search = new URLSearchParams({
      latitude: loc.lat, longitude: loc.lon, timezone: 'UTC',
      hourly: 'cloud_cover', forecast_days: 3,
    });
    const d = await getJSON(url);
    const data = { time: d.hourly.time.map((t) => new Date(t + 'Z').getTime()), cloud: d.hourly.cloud_cover };
    writeCache(key, data, { lat: loc.lat, lon: loc.lon });
    return { ...data, at: Date.now() };
  } catch (err) {
    console.warn('clouds', err);
    return c?.data || null;
  }
}

// ------------------------------------------------------------ Image of the day
// Fallback pictures, all from NASA's Image Library (public domain). One per day.
export const SPACE_IMAGES = [
  { id: 'carina_nebula', title: 'The Cosmic Cliffs · Carina Nebula',
    text: 'Webb’s infrared camera sees the glowing edge of a giant bubble of gas. The “mountains” are clouds of gas and dust where new stars are being born.',
    distance: '7,600 LIGHT-YEARS' },
  { id: 'webb_first_deep_field', title: 'Webb’s First Deep Field',
    text: 'Almost every speck of light here is a whole galaxy. A huge galaxy cluster bends light like a magnifying glass, showing galaxies from over 13 billion years ago.',
    distance: '4.6 BILLION LIGHT-YEARS' },
  { id: 'PIA03606', title: 'The Crab Nebula',
    text: 'The leftovers of a star that exploded. People on Earth saw the blast in the year 1054 — it was bright enough to see in the daytime for weeks.',
    distance: '6,500 LIGHT-YEARS' },
  { id: 'PIA04921', title: 'The Andromeda Galaxy',
    text: 'Our closest big neighbor galaxy: a spiral of about a trillion stars. On a very dark night you can see it with no telescope as a faint, fuzzy smudge.',
    distance: '2.5 MILLION LIGHT-YEARS' },
  { id: 'GSFC_20171208_Archive_e001518', title: 'The Horsehead Nebula',
    text: 'A dark cloud of dust shaped like a horse’s head, just below Orion’s Belt. It blocks the light of the glowing gas behind it.',
    distance: '1,500 LIGHT-YEARS' },
  { id: 'PIA15426', title: 'The Sombrero Galaxy',
    text: 'A galaxy we see almost edge-on. Its bright middle and thick ring of dark dust make it look like a wide-brimmed hat.',
    distance: '28 MILLION LIGHT-YEARS' },
  { id: 'PIA15658', title: 'The Helix Nebula',
    text: 'What’s left when a star like our Sun runs out of fuel: it puffs its outer layers into a glowing ring. Our Sun will do this in about 5 billion years.',
    distance: '650 LIGHT-YEARS' },
  { id: 'GSFC_20171208_Archive_e001955', title: 'The Lagoon Nebula',
    text: 'Hubble peeks into the heart of a huge cloud of gas, lit up and carved by a young, extremely hot star.',
    distance: '4,000 LIGHT-YEARS' },
  { id: 'PIA25433', title: 'The Eagle Nebula',
    text: 'Home of the famous Pillars of Creation, tall towers of gas where new stars form. This telescope sees the warm glow of the dust.',
    distance: '5,700 LIGHT-YEARS' },
  { id: 'PIA01322', title: 'The Heart of the Orion Nebula',
    text: 'The closest big star nursery to Earth. Look just below Orion’s Belt on a winter night and you can see it as a fuzzy patch with your own eyes.',
    distance: '1,350 LIGHT-YEARS' },
];

export const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Today's pick from the built-in list. offset lets the screen skip a broken image. */
export function fallbackImage(offset = 0) {
  const d = new Date();
  const dayNum = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
  const img = SPACE_IMAGES[(dayNum + offset) % SPACE_IMAGES.length];
  return {
    ...img,
    url: `https://images-assets.nasa.gov/image/${img.id}/${img.id}~large.jpg`,
    credit: 'NASA IMAGE LIBRARY',
  };
}

function firstSentences(text, max = 230) {
  const clean = text.replace(/\s+/g, ' ').trim();
  const parts = clean.match(/[^.!?]+[.!?]+/g) || [clean];
  let out = '';
  for (const p of parts) {
    if ((out + p).length > max) break;
    out += p;
  }
  return (out || clean.slice(0, max - 1) + '…').trim();
}

/** NASA's Astronomy Picture of the Day, or a built-in deep-space picture. Cached per day. */
export async function getSpaceImage() {
  const key = 'space.image.v1';
  const c = readCache(key);
  // Today's APOD is kept all day; a fallback picture, or NASA's previous day (today's not
  // posted yet), only 3 hours, then APOD is asked again.
  const isToday = (d) => !d.id && (!d.date || d.date >= todayKey());
  if (c && c.day === todayKey() && (isToday(c.data) || Date.now() - c.at < 3 * HOUR)) return c.data;
  let data;
  try {
    const d = await getJSON(`https://api.nasa.gov/planetary/apod?api_key=${NASA_API_KEY}&thumbs=true`);
    const url = d.media_type === 'video' ? d.thumbnail_url : d.url;
    // In late 2026 the API sometimes returns a NASA logo instead of the real picture — reject that.
    const ok = url && /\.(jpe?g|png|gif|webp)(\?|$)/i.test(url) && !/logo/i.test(url) && d.title && d.title !== 'NASA Science';
    if (!ok) throw new Error('APOD returned no usable image');
    const ly = (d.explanation || '').match(/([\d.,]+(?:\s+(?:thousand|million|billion))?)\s+light[- ]years?/i);
    data = {
      title: d.title,
      text: firstSentences(d.explanation || ''),
      url,
      distance: ly ? `${ly[1].toUpperCase()} LIGHT-YEARS` : null,
      credit: 'NASA PICTURE OF THE DAY',
      // Many APOD pictures are taken by amateur astronomers: name them.
      copyright: (d.copyright || '').replace(/\s+/g, ' ').trim() || null,
      date: d.date,
    };
  } catch (err) {
    console.warn('apod', err);
    // NASA didn't answer: an earlier answer from today (even yesterday's picture) beats a
    // built-in one.
    data = c && c.day === todayKey() && !c.data.id ? c.data : fallbackImage();
  }
  try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), day: todayKey(), data })); } catch { /* full */ }
  return data;
}
