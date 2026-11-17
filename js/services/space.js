// Live space data for Tom's screens. Every source is free and sends CORS headers:
//   - Launch Library 2 (thespacedevs.com): upcoming rocket launches. ~15 calls/hour limit.
//   - NASA APOD (api.nasa.gov): picture of the day. DEMO_KEY allows ~30/hour, 50/day.
//   - NASA Image Library (images-assets.nasa.gov): fallback deep-space pictures.
//   - CelesTrak: ISS orbit elements, used to work out flyovers locally (astro.js).
//   - corquaid "people in space" JSON on GitHub Pages: ISS crew count.
//   - Open-Meteo: tonight's cloud cover.
// Everything is cached in localStorage. When a source fails we use the last
// cached copy (however old), and if there is none, built-in sample data.
import { issPasses } from './astro.js';

// Swap in a free personal key from https://api.nasa.gov for higher limits.
export const NASA_API_KEY = 'DEMO_KEY';

const HOUR = 3600000;

function readCache(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
}
function writeCache(key, data, extra = {}) {
  try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), data, ...extra })); } catch { /* storage full */ }
}

/** Fresh cache -> network -> stale cache -> fallback(). Returns { data, source }. */
async function cachedFetch(key, maxAge, load, fallback, valid = () => true) {
  const c = readCache(key);
  if (c && Date.now() - c.at < maxAge && valid(c)) return { data: c.data, source: 'cache' };
  try {
    const data = await load();
    writeCache(key, data);
    return { data, source: 'live' };
  } catch (err) {
    console.warn(key, err);
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
    net: t.toISOString(), precision: 'MIN', status: 'Sample data · offline' }];
};

export async function getLaunches() {
  const r = await cachedFetch('space.launches.v1', 3 * HOUR, async () => {
    const d = await getJSON('https://ll.thespacedevs.com/2.3.0/launches/upcoming/?limit=10&mode=normal');
    return d.results.map((l) => {
      const [rocketPart, missionPart] = (l.name || '').split('|').map((s) => s.trim());
      return {
        name: l.mission?.name || missionPart || l.name,
        rocket: l.rocket?.configuration?.name || rocketPart || '',
        site: l.pad?.location?.name || l.pad?.name || '',
        net: l.net,
        precision: l.net_precision?.abbrev || 'MIN',
        status: l.status?.name || '',
      };
    });
  }, SAMPLE_LAUNCHES,
  // Refetch early if every cached launch has already gone.
  (c) => c.data.some((l) => new Date(l.net) > Date.now()));
  return { ...r, launches: r.data };
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

async function getIssElements() {
  const r = await cachedFetch('space.isstle.v1', 12 * HOUR, async () => {
    const d = await getJSON('https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=json');
    if (!d?.[0]?.MEAN_MOTION) throw new Error('bad TLE');
    return d[0];
  }, () => null);
  // Elements older than ~10 days are too stale to predict passes.
  if (r.data && Date.now() - new Date(r.data.EPOCH + 'Z').getTime() > 10 * 24 * HOUR) return null;
  return r.data;
}

/** Visible ISS flyovers for the next `hours`. Returns [] if the orbit is unavailable. */
export async function getIssPasses(loc, hours = 72) {
  const omm = await getIssElements();
  if (!omm) return [];
  return issPasses(omm, loc.lat, loc.lon, new Date(), hours);
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
/** Hourly cloud cover (%) from Open-Meteo. Returns { time: [...ms], cloud: [...] } or null. */
export async function getCloudCover(loc) {
  const key = 'space.clouds.v1';
  const c = readCache(key);
  if (c && Date.now() - c.at < HOUR && c.lat === loc.lat) return c.data;
  try {
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.search = new URLSearchParams({
      latitude: loc.lat, longitude: loc.lon, timezone: 'UTC',
      hourly: 'cloud_cover', forecast_days: 3,
    });
    const d = await getJSON(url);
    const data = { time: d.hourly.time.map((t) => new Date(t + 'Z').getTime()), cloud: d.hourly.cloud_cover };
    writeCache(key, data, { lat: loc.lat });
    return data;
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

const todayKey = () => {
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
  // A real APOD is kept all day; a fallback picture only 3 hours, then APOD is retried.
  if (c && c.day === todayKey() && (!c.data.id || Date.now() - c.at < 3 * HOUR)) return c.data;
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
      date: d.date,
    };
  } catch (err) {
    console.warn('apod', err);
    data = fallbackImage();
  }
  try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), day: todayKey(), data })); } catch { /* full */ }
  return data;
}
