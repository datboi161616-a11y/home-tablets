// Tom · Flight deck home screen.
// A thing to leave on, on a nightstand: at rest it is one scene and the time, nothing else.
// A touch brings back the date, one quiet line (the next thing worth looking up for) and a
// dock of big buttons to the pages. Everything that used to be read here (planes, Voyager,
// the Moon, the Space Station, departures) is one tap away in "At a glance", and on its
// own page.
//
// The scene is a choice (the "Scene" button, remembered on the device):
//   photos  real space photographs, full screen, changing slowly with a cross-fade
//           (NASA's picture of the day, the days the Space image page has kept, and the
//           built-in famous pictures from NASA's Image Library)
//   moon    tonight's Moon, painted, at its real phase
//   orbits  the planets where they really are around the Sun today
// With no photograph to show (no internet, none kept) the Moon stands in.
//
// When a feed is down or the Wi-Fi is off, a readout keeps the last real answer it had and
// says how old it is; sample data is always marked SAMPLE and never shown on the home line.
import { getLocation } from '../services/location.js';
import { feature } from '../services/features.js';
import {
  getAircraft, getRoutes, flightLabel, typeName, fmtAlt, compass, compassShort, fmtMiles, trend,
} from '../services/aircraft.js';
import { nextVisiblePass, getCrew, orbitStatus, brightnessWords } from '../services/iss.js';
import { getBoard } from '../services/departures.js';
import { checkAlerts, wasSeen, markSeen, heightWords } from '../services/skyalert.js';
import { getSpaceImage, fallbackImage, SPACE_IMAGES } from '../services/space.js';
import { moonPhase, nextMoonPhase, planetEcliptic, sunEcliptic } from '../services/astro.js';
import { display, clockTime, clockAmPm, timeText } from '../services/display.js';
import { tutorialRunning } from '../services/tutorial.js';
import { restful, esc } from './ui.js';

const GLOWS = ['#5CE1E6', '#7CF29A', '#B69CFF'];
const LAST_PLANES = 'bridge.lastPlanes.v1'; // the last real (not sample) planes readout, for when the feed is down
const LAST_BOARD = 'bridge.lastBoard.v1';   // the same for the departures line
const QOTD_KEY = 'trivia.qotd.v1';          // trivia.js: today's question of the day and whether it's answered
const STATS_KEY = 'trivia.stats.v1';        // trivia.js: wings and the daily streak
const DAYS_KEY = 'deepimage.days.v1';       // deepimage.js: NASA's pictures from earlier days, once fetched
const SCENE_KEY = 'deck.scene.v1';          // 'photos' | 'moon' | 'orbits'
const SHOWN_KEY = 'deck.scene.shown.v1';    // addresses of photographs that have arrived before
const NOCORS_KEY = 'deck.scene.nokeep.v1';  // { host: when } hosts that don't let a page keep their pictures
const NYC = { lat: 40.7128, lon: -74.006, town: 'New York' };
const SCENES = [['photos', 'Photographs'], ['moon', 'Moon'], ['orbits', 'Orbits']];
const HOLD_MS = 4 * 60000;   // how long a photograph stays
const FADE_MS = 2600;        // the cross-fade
const LOAD_MS = 30000;       // a picture that hasn't arrived by then counts as failed
const KEEP_MAX = 8;          // photographs kept on the device
const KEEP_BYTES = 4000000;  // never keep one bigger than this

let timers = [];
let waits = [];   // one-off timeouts
let alive = false;
let onOnline = null;
let rest = null;
let issTimer = 0; // the Space Station readout's next change (start or end of a pass)
let visit = 0;    // counts mounts, so a slow start from an earlier visit doesn't add its timers
let stopScene = () => {};
let moonMemo = null; // vals(): the Moon, worked out once an hour

const pad = (n) => String(n).padStart(2, '0');
const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage full */ } };
const offline = () => navigator.onLine === false;
const dayKey = (d = new Date()) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
const fmtTime = (t) => timeText(new Date(t));
// The same "random" numbers every time, so the stars are where they were yesterday.
const rnd = (i, salt) => { const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453; return x - Math.floor(x); };

/** "JUST NOW", "12 MIN AGO", "3 HR AGO", "2 DAYS AGO" */
function ago(at) {
  const m = Math.max(0, Math.round((Date.now() - at) / 60000));
  if (m < 2) return 'JUST NOW';
  if (m < 90) return `${m} MIN AGO`;
  const h = Math.round(m / 60);
  return h < 36 ? `${h} HR AGO` : `${Math.round(h / 24)} DAYS AGO`;
}

// Voyager 1 and the Moon in words.
function vals() {
  const now = new Date();
  const C = 299792.458;
  const LD = 86400 * C;
  const crossing = Date.UTC(2026, 10, 18, 6, 16, 7);
  const km = LD + ((now.getTime() - crossing) / 1000) * 17;
  const secs = Math.round(km / C);
  const until = crossing - now.getTime();
  const MONTH = 29.530589;
  // The real Moon (astro.js, the same sums as Tonight's sky), worked out once an hour:
  // this runs every second.
  const hour = Math.floor(now.getTime() / 3600000);
  if (!moonMemo || moonMemo.hour !== hour) {
    const ph = moonPhase(now);
    const full = nextMoonPhase('full', now);
    moonMemo = { hour, age: (ph.elongation / 360) * MONTH, lit: Math.round(ph.fraction * 100), toFull: full ? (full.getTime() - now.getTime()) / 86400000 : null };
  }
  const age = moonMemo.age;
  const lit = moonMemo.lit;
  // Named phases (new/quarter/full) only within about a day of the exact moment;
  // the rest of the month is crescent or gibbous, like a printed calendar says.
  const near = (d) => Math.abs(age - d) < 1.1 || Math.abs(age - d - MONTH) < 1.1 || Math.abs(age - d + MONTH) < 1.1;
  const moonName = near(0) ? 'New Moon' : near(MONTH / 4) ? 'First quarter' : near(MONTH / 2) ? 'Full Moon' : near((3 * MONTH) / 4) ? 'Last quarter'
    : age < MONTH / 4 ? 'Waxing crescent' : age < MONTH / 2 ? 'Waxing gibbous' : age < (3 * MONTH) / 4 ? 'Waning gibbous' : 'Waning crescent';
  // Calendar days to the full Moon, the way the sky page's date reads.
  const fullDay = moonMemo.toFull == null ? null : new Date(now.getTime() + moonMemo.toFull * 86400000);
  const toFull = fullDay ? Math.round((new Date(fullDay.getFullYear(), fullDay.getMonth(), fullDay.getDate()) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000)
    : Math.round((((MONTH / 2 - age) % MONTH) + MONTH) % MONTH);
  const moonNext = near(MONTH / 2) ? ''
    : toFull <= 1 ? 'full Moon tomorrow' : `full Moon in ${toFull} days`;
  const years = now.getFullYear() - 1977 - (now < new Date(now.getFullYear(), 8, 5) ? 1 : 0);
  return {
    minute: now.getHours() * 60 + now.getMinutes(),
    time: clockTime(now),
    ampm: clockAmPm(now),
    dateLine: now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
    vgrKm: Math.round(km).toLocaleString('en-US'),
    vgrDelay: Math.floor(secs / 3600) + 'h ' + pad(Math.floor((secs % 3600) / 60)) + 'm ' + pad(secs % 60) + 's',
    vgrStatus: until > 0
      ? 'One light-day from Earth in ' + Math.ceil(until / 3600000) + ' hours'
      : 'One light-day from Earth since Nov 18, 2026',
    moonName,
    moonNext,
    vgrYears: years,
    moonLit: lit,
  };
}

// ---------------------------------------------------------------------------------------
// Photographs kept on the device (IndexedDB), so the scene still has them with no Wi-Fi.
// Only pictures whose host allows a page to read them can be kept this way; the rest come
// from the browser's own short-lived cache (see the report: sw.js could keep those).
// ---------------------------------------------------------------------------------------
function db() {
  return new Promise((done) => {
    try {
      const r = window.indexedDB.open('deck-scenes', 1);
      r.onupgradeneeded = () => { r.result.createObjectStore('pics', { keyPath: 'url' }); };
      r.onsuccess = () => done(r.result);
      r.onerror = () => done(null);
    } catch (e) { done(null); }
  });
}
async function pics(mode, work) {
  const d = await db();
  if (!d) return null;
  return new Promise((done) => {
    try {
      const tx = d.transaction('pics', mode);
      const q = work(tx.objectStore('pics'));
      tx.oncomplete = () => { d.close(); done(q ? q.result : null); };
      tx.onerror = tx.onabort = () => { d.close(); done(null); };
    } catch (e) { done(null); }
  });
}
const keptGet = async (url) => { const row = await pics('readonly', (s) => s.get(url)); return row && row.blob ? row.blob : null; };
const keptUrls = async () => (await pics('readonly', (s) => s.getAllKeys())) || [];
async function keep(url) {
  let host = '';
  try { host = new URL(url).host; } catch (e) { return; }
  const no = read(NOCORS_KEY) || {};
  if (offline() || Date.now() - (no[host] || 0) < 7 * 86400000) return;
  if ((await keptUrls()).includes(url)) return;
  try {
    const res = await fetch(url, { mode: 'cors', signal: AbortSignal.timeout(LOAD_MS) });
    if (!res.ok) return;
    const blob = await res.blob();
    if (!/^image\//.test(blob.type) || blob.size > KEEP_BYTES) return;
    await pics('readwrite', (s) => { s.put({ url, blob, at: Date.now() }); });
    const all = (await pics('readonly', (s) => s.getAll())) || [];
    const old = all.sort((a, b) => b.at - a.at).slice(KEEP_MAX);
    if (old.length) await pics('readwrite', (s) => { old.forEach((o) => s.delete(o.url)); });
  } catch (e) {
    // Refused (this host doesn't share its pictures with pages): don't ask again for a week.
    if (!offline()) { no[host] = Date.now(); write(NOCORS_KEY, no); }
  }
}

// ---------------------------------------------------------------------------------------
// The painted scenes
// ---------------------------------------------------------------------------------------
/** A few stars of varied brightness; six of them breathe slowly. Their own <svg>, so a
 *  twinkle repaints only the stars, not the Moon or the planets drawn over them. */
function starSky(n, salt) {
  return `<svg viewBox="0 0 1280 800" width="1280" height="800" style="position:absolute;left:0;top:0" aria-hidden="true">${stars(n, salt)}</svg>`;
}
function stars(n, salt) {
  let out = '';
  for (let i = 0; i < n; i++) {
    const x = (rnd(i, salt) * 1280).toFixed(1);
    const y = (rnd(i, salt + 1) * 800).toFixed(1);
    const b = rnd(i, salt + 2);
    const r = (b > 0.93 ? 1.5 : b > 0.7 ? 1 : 0.65).toFixed(2);
    const a = (0.16 + b * b * 0.7).toFixed(2);
    const tint = rnd(i, salt + 3) > 0.85 ? '#FFE9CF' : rnd(i, salt + 3) < 0.15 ? '#CFE0FF' : '#FFFFFF';
    out += `<circle cx="${x}" cy="${y}" r="${r}" fill="${tint}" opacity="${a}"${i < 6 ? ` class="fd-tw" style="animation-delay:-${i * 3}s"` : ''}/>`;
  }
  return out;
}

/** Tonight's Moon: its real phase, softly shaded. south: seen from the southern half of the world. */
function moonArt(date, south) {
  const ph = moonPhase(date);
  const R = 240;
  const k = ph.fraction;
  const tx = R * (1 - 2 * k); // where the edge of the shadow crosses the middle (+ = towards the lit limb)
  // The shadow: the unlit limb, then the edge of the shadow back up. Several, each a little
  // smaller, so the edge of night on the Moon is soft without any blurring.
  let shadow = '';
  for (let j = 0; j < 12; j++) {
    const t = tx - j * 3.5;
    if (t <= -R + 1) break;
    const rx = Math.min(R, Math.abs(t)).toFixed(1);
    shadow += `<path d="M0 ${-R - 1}A${R + 1} ${R + 1} 0 0 0 0 ${R + 1}A${rx} ${R + 1} 0 0 ${t > 0 ? 0 : 1} 0 ${-R - 1}Z" fill="#030409" opacity=".24"/>`;
  }
  // The seas: each one several big, faint, overlapping shapes with no edges, so none of
  // them reads as a spot. [x, y, rx, ry, darkness, turn] in Moon radii (north up).
  const seas = [
    [-0.52, -0.1, 0.36, 0.42, 0.2, 10], [-0.6, 0.12, 0.26, 0.34, 0.16, -15], [-0.44, -0.3, 0.3, 0.24, 0.14, 0], // Ocean of Storms
    [-0.24, -0.42, 0.3, 0.26, 0.24, -10], [-0.3, -0.36, 0.2, 0.2, 0.14, 0],   // Sea of Showers
    [0.2, -0.36, 0.19, 0.17, 0.24, 0], [0.3, -0.2, 0.16, 0.12, 0.12, 30],     // Serenity
    [0.4, -0.08, 0.24, 0.18, 0.24, -20], [0.5, 0.06, 0.2, 0.14, 0.16, 35],    // Tranquillity, Fertility
    [0.62, 0.14, 0.12, 0.17, 0.18, 0], [0.7, -0.25, 0.1, 0.12, 0.3, 0],       // Fertility, Crises
    [0.42, 0.27, 0.09, 0.09, 0.2, 0],                                         // Nectar
    [-0.16, 0.36, 0.24, 0.17, 0.18, 15], [-0.3, 0.24, 0.2, 0.12, 0.12, -20],  // Clouds
    [-0.47, 0.4, 0.1, 0.1, 0.22, 0],                                          // Moisture
    [-0.1, -0.68, 0.3, 0.07, 0.07, 6], [0, -0.14, 0.16, 0.1, 0.1, 0],         // Cold, Vapours
  ];
  // Bright ground: the southern highlands, and the young craters with their pale splashes.
  const bright = [[-0.02, 0.62, 0.42, 0.1], [-0.1, 0.72, 0.16, 0.22], [-0.1, 0.72, 0.035, 0.5], [-0.33, -0.1, 0.07, 0.2], [-0.33, -0.1, 0.02, 0.4],
    [-0.62, -0.13, 0.04, 0.22], [-0.7, -0.4, 0.03, 0.36], [0.2, -0.02, 0.2, 0.06], [0.52, 0.42, 0.2, 0.08]];
  // A scatter of small craters: a pale rim-light and a faint dark floor each.
  let craters = '';
  for (let i = 0; i < 30; i++) {
    const a = rnd(i, 21) * Math.PI * 2, d = Math.sqrt(rnd(i, 22)) * 0.93;
    const cx = Math.cos(a) * d * R, cy = Math.sin(a) * d * R + (rnd(i, 25) > 0.5 ? 0.12 * R : 0);
    const cr = 1.5 + rnd(i, 23) * rnd(i, 27) * 5;
    if (Math.hypot(cx, cy) > R * 0.95) continue;
    craters += `<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${cr.toFixed(1)}" fill="#2E323C" opacity="${(0.03 + rnd(i, 24) * 0.05).toFixed(2)}"/>`
      + `<circle cx="${(cx - cr * 0.3).toFixed(1)}" cy="${(cy - cr * 0.3).toFixed(1)}" r="${(cr * 0.75).toFixed(1)}" fill="url(#fd-mr)" opacity="${(0.06 + rnd(i, 26) * 0.1).toFixed(2)}"/>`;
  }
  const flip = ph.waxing ? 1 : -1; // (seen from the south the whole disc is turned over, which swaps the sides by itself)
  const halo = (0.05 + 0.11 * k).toFixed(3);
  return `<div style="position:absolute;left:560px;top:20px;width:760px;height:760px;background:radial-gradient(circle,rgba(196,208,232,${halo}) 0,rgba(196,208,232,${(halo * 0.45).toFixed(3)}) 38%,rgba(196,208,232,0) 68%)"></div>
  ${starSky(70, 3)}
  <svg viewBox="0 0 1280 800" width="1280" height="800" style="position:absolute;left:0;top:0" aria-hidden="true">
    <defs>
      <radialGradient id="fd-mb" cx="46%" cy="42%" r="62%"><stop offset="0" stop-color="#E9E7E1"/><stop offset=".7" stop-color="#D9D6CF"/><stop offset="1" stop-color="#BFBCB5"/></radialGradient>
      <radialGradient id="fd-ms"><stop offset="0" stop-color="#4A4F5A" stop-opacity="1"/><stop offset=".4" stop-color="#4A4F5A" stop-opacity=".8"/><stop offset=".75" stop-color="#4A4F5A" stop-opacity=".3"/><stop offset="1" stop-color="#4A4F5A" stop-opacity="0"/></radialGradient>
      <radialGradient id="fd-mr"><stop offset="0" stop-color="#FFFFFF" stop-opacity="1"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></radialGradient>
      <radialGradient id="fd-ml"><stop offset=".8" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".24"/></radialGradient>
      <clipPath id="fd-mc"><circle r="${R}"/></clipPath>
    </defs>
    <g transform="translate(940 400) rotate(${south ? 180 : -8})">
      <circle r="${R}" fill="url(#fd-mb)"/>
      <g clip-path="url(#fd-mc)">
        ${seas.map((s) => `<ellipse cx="${(s[0] * R).toFixed(0)}" cy="${(s[1] * R).toFixed(0)}" rx="${(s[2] * R * 1.25).toFixed(0)}" ry="${(s[3] * R * 1.25).toFixed(0)}" fill="url(#fd-ms)" opacity="${(s[4] * 1.5).toFixed(2)}" transform="rotate(${s[5]} ${(s[0] * R).toFixed(0)} ${(s[1] * R).toFixed(0)})"/>`).join('')}
        ${bright.map((s) => `<circle cx="${(s[0] * R).toFixed(0)}" cy="${(s[1] * R).toFixed(0)}" r="${(s[2] * R).toFixed(0)}" fill="url(#fd-mr)" opacity="${s[3]}"/>`).join('')}
        ${craters}
        <circle r="${R}" fill="url(#fd-ml)"/>
      </g>
      <g transform="scale(${flip} 1)">${shadow}</g>
    </g>
  </svg>`;
}

/** The planets where they are around the Sun today (their real directions; the spacing is evened out). */
function orbitsArt(date) {
  const RAD = Math.PI / 180;
  const sun = sunEcliptic(date);
  const eLon = sun.lon + 180;
  const ex = sun.au * Math.cos(eLon * RAD), ey = sun.au * Math.sin(eLon * RAD);
  const lonOf = (name) => {
    if (name === 'earth') return eLon;
    const p = planetEcliptic(name, date);
    const d = p.au * Math.cos(p.lat * RAD);
    return Math.atan2(ey + d * Math.sin(p.lon * RAD), ex + d * Math.cos(p.lon * RAD)) / RAD;
  };
  // [name, orbit on screen (px), size (px), light, mid, label]
  const P = [['mercury', 74, 3.2, '#C9C3BA', '#8D877F', 'Mercury'], ['venus', 118, 5.4, '#F1E6C8', '#C2B086', 'Venus'],
    ['earth', 168, 5.8, '#A9C6EA', '#557DB0', 'Earth'], ['mars', 224, 4.2, '#E2A283', '#A65B3D', 'Mars'],
    ['jupiter', 330, 13, '#EBDCC2', '#B89B78', 'Jupiter'], ['saturn', 440, 10.5, '#EFE2BF', '#BFA878', 'Saturn']];
  const CX = 770, CY = 388, TILT = 0.4;
  let defs = '', rings = '', bodies = '', names = '';
  P.forEach(([name, r, size, light, mid, label], i) => {
    const lon = lonOf(name) * RAD;
    const x = CX + r * Math.cos(lon), y = CY - r * TILT * Math.sin(lon);
    // Lit from the Sun's side.
    const dx = CX - x, dy = CY - y, len = Math.hypot(dx, dy) || 1;
    defs += `<radialGradient id="fd-p${i}" cx="${(50 + 34 * (dx / len)).toFixed(0)}%" cy="${(50 + 34 * (dy / len)).toFixed(0)}%" r="78%"><stop offset="0" stop-color="${light}"/><stop offset=".5" stop-color="${mid}"/><stop offset="1" stop-color="#0B0C11"/></radialGradient>`;
    rings += `<ellipse cx="${CX}" cy="${CY}" rx="${r}" ry="${(r * TILT).toFixed(1)}" fill="none" stroke="#FFFFFF" stroke-opacity="${(0.2 - i * 0.012).toFixed(3)}" stroke-width="1"/>`;
    if (name === 'saturn') bodies += `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${size * 2.1}" ry="${size * 0.55}" fill="none" stroke="#D9CBA4" stroke-opacity=".6" stroke-width="2.2" transform="rotate(-14 ${x.toFixed(1)} ${y.toFixed(1)})"/>`;
    bodies += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${size}" fill="url(#fd-p${i})"/>`;
    names += `<text x="${(x + size + 12).toFixed(0)}" y="${(y + 5).toFixed(0)}">${label}</text>`;
  });
  return `<div style="position:absolute;left:${CX - 210}px;top:${CY - 210}px;width:420px;height:420px;background:radial-gradient(circle,rgba(255,214,150,.2) 0,rgba(255,196,120,.07) 30%,rgba(255,196,120,0) 62%)"></div>
  ${starSky(80, 11)}
  <svg viewBox="0 0 1280 800" width="1280" height="800" style="position:absolute;left:0;top:0" aria-hidden="true">
    <defs>${defs}<radialGradient id="fd-sun"><stop offset="0" stop-color="#FFFDF4"/><stop offset=".55" stop-color="#FFE9B8"/><stop offset="1" stop-color="#FFC978" stop-opacity="0"/></radialGradient></defs>
    ${rings}
    <circle cx="${CX}" cy="${CY}" r="17" fill="url(#fd-sun)"/>
    ${bodies}
    <g class="x-chrome" fill="#FFFFFF" fill-opacity=".62" font-family="Inter,sans-serif" font-size="15" letter-spacing="1.5">${names}</g>
  </svg>`;
}

// Thin line pictures for the dock.
const ICON = (d) => `<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICONS = {
  flights: ICON('<path d="M12 3c.8 0 1.4.9 1.4 2v4.2l7.1 4.3v1.8l-7.1-2.1v4.3l2.2 1.6V21L12 20l-3.6 1v-1.900l2.2-1.600v-4.300l-7.1 2.100v-1.800l7.1-4.300V5c0-1.1.6-2 1.4-2z"/>'),
  departures: ICON('<path d="M3 20h18"/><path d="M4 13l3 2.5 12.5-5c1-.4 1.4-1.3 1-2-.4-.8-1.5-1-2.5-.6L14 10 8.5 6.5 7 7l3.5 4.500L7 13l-2-1z"/>'),
  missions: ICON('<path d="M12 2.500c3 2.5 4.5 6 4.5 9.5 0 2-.5 3.8-1.2 5H8.700c-.7-1.2-1.2-3-1.2-5 0-3.5 1.5-7 4.5-9.500z"/><circle cx="12" cy="10" r="1.8"/><path d="M7.6 13.500L5 16.500v3l3.3-2M16.4 13.500l2.6 3v3l-3.3-2M10.5 20v1.500M13.5 20v1.5"/>'),
  sky: ICON('<path d="M19.5 14.500A8 8 0 0 1 9.5 4.500a8 8 0 1 0 10 10z"/><path d="M16.5 4v3M15 5.500h3"/>'),
  deepimage: ICON('<circle cx="12" cy="12" r="8.5"/><ellipse cx="12" cy="12" rx="8.5" ry="3.2" transform="rotate(-28 12 12)"/><circle cx="12" cy="12" r="1.6"/>'),
  trivia: ICON('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.500a2.5 2.5 0 1 1 3.6 2.300c-.7.4-1.1.9-1.1 1.700v.5"/><path d="M12 17v.2"/>'),
  viewscreen: ICON('<path d="M12 3.500l1.6 5 5 1.6-5 1.6-1.6 5-1.6-5-5-1.6 5-1.600z"/><path d="M18.5 15.500v4M16.5 17.500h4M5 16.500v3M3.5 18h3"/>'),
  settings: ICON('<path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="17" r="2"/>'),
  apps: ICON('<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>'),
  camera: ICON('<path d="M4 8h3.500l1.5-2h6l1.5 2H20v11H4z"/><circle cx="12" cy="13.2" r="3.3"/>'),
};

export function mount(el) {
  // Mounted again without being left first (the tour reloads the deck under itself):
  // stop the last visit's timers so nothing is fetched twice over.
  if (alive) unmount();
  alive = true;
  const me = ++visit;
  const live = () => alive && me === visit;
  const later = (fn, ms) => { const t = setTimeout(() => { if (live()) fn(); }, ms); waits.push(t); return t; };
  let glow = GLOWS[0];
  let scene = 'photos';
  try {
    glow = localStorage.getItem('bridge.glow') || GLOWS[0];
    const s = localStorage.getItem(SCENE_KEY);
    if (SCENES.some(([k]) => k === s)) scene = s;
  } catch (e) { /* storage off */ }
  const v = vals();
  const dock = [
    ['flights', 'Planes'], ['departures', 'Departures'], ['missions', 'Missions'], ['sky', 'Tonight’s sky', 'Night sky'],
    ['deepimage', 'Space image'], ['trivia', 'Trivia'], ['viewscreen', 'Starfield'],
    feature('apps') && ['apps', 'Apps'],
    feature('camera') && ['camera', 'Camera'],
    ['settings', 'Settings'],
  ].filter(Boolean);
  const k = 'font:600 15px Inter,sans-serif;letter-spacing:2px;text-transform:uppercase;color:#8FA3B8';
  const big = 'font:300 34px/1.1 Outfit,sans-serif;color:#FFFFFF';
  const sub = 'font:400 16px/1.4 Inter,sans-serif;color:#B9C6D4;letter-spacing:.4px';

  el.innerHTML = `
  <style>
    .fd{position:relative;width:1280px;height:800px;overflow:hidden;background:#04050A;color:#FFFFFF;font-family:Inter,system-ui,sans-serif}
    .fd a{color:inherit;text-decoration:none}
    .fd-fill{position:absolute;top:0;left:0;width:1280px;height:800px}
    .fd-layer{opacity:0;transition:opacity ${FADE_MS}ms ease;will-change:opacity}
    .fd-layer img{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover}
    .fd-layer.on{opacity:1}
    .fd-tw{animation:fd-tw 18s steps(12) infinite}
    @keyframes fd-tw{50%{opacity:.12}}
    .fd-clock{position:absolute;left:64px;top:372px;transition:transform .9s ease;will-change:transform}
    .x-resting .fd-clock{transform:translate3d(0,196px,0)}
    .fd-time{font:200 148px/1 Outfit,sans-serif;letter-spacing:-3px;white-space:nowrap;text-shadow:0 2px 18px rgba(0,0,0,.55)}
    .fd-time small{font:300 34px Outfit,sans-serif;letter-spacing:2px;margin-left:12px;opacity:.82}
    .fd-date{font:300 24px Outfit,sans-serif;letter-spacing:.5px;margin:6px 0 0 6px;text-shadow:0 1px 10px rgba(0,0,0,.7)}
    .fd-line{display:flex;align-items:center;gap:12px;min-height:56px;max-width:760px;margin:2px 0 0 6px;font:500 19px Inter,sans-serif;color:#E8EEF5;text-shadow:0 1px 10px rgba(0,0,0,.8)}
    .fd-line.off{visibility:hidden}
    .fd-line span[data-quiet]{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .fd-dot{flex:none;width:9px;height:9px;border-radius:50%;background:var(--glow)}
    .fd-dock{position:absolute;left:40px;right:40px;bottom:26px;display:flex;gap:12px}
    .fd-tile{flex:1 1 0;min-width:0;height:104px;border-radius:24px;background:rgba(9,11,17,.62);box-shadow:inset 0 0 0 1px rgba(255,255,255,.16);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:9px;font:500 16px Inter,sans-serif;color:#EEF2F7;position:relative;white-space:nowrap}
    .fd-tile:active{background:rgba(40,46,60,.8)}
    .fd-tile svg{color:var(--glow)}
    .fd-badge{position:absolute;top:14px;right:16px;width:11px;height:11px;border-radius:50%;background:#FFB547;display:none}
    .fd-credit{position:absolute;right:40px;bottom:140px;max-width:560px;min-height:56px;display:flex;flex-direction:column;align-items:flex-end;justify-content:center;text-align:right;text-shadow:0 1px 10px rgba(0,0,0,.85)}
    .fd-credit b{font:500 18px Inter,sans-serif;max-width:560px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .fd-credit i{font:400 15px Inter,sans-serif;font-style:normal;color:#C3CEDA;max-width:560px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .fd-sheet{position:absolute;top:0;left:0;width:1280px;height:800px;box-sizing:border-box;padding:26px 40px 30px;background:#06080D;display:flex;flex-direction:column;gap:18px}
    /* Shut, it is still "on the page" (one dot big), so what it says is read the same either way. */
    .fd-sheet.shut{width:1px;height:1px;padding:0;overflow:hidden;opacity:0;pointer-events:none}
    .fd-card{border-radius:26px;background:rgba(255,255,255,.055);box-shadow:inset 0 0 0 1px rgba(255,255,255,.1);padding:20px 24px;display:flex;flex-direction:column;gap:6px;min-width:0;overflow:hidden}
    .fd-card:active{background:rgba(255,255,255,.1)}
    @media (prefers-reduced-motion: reduce){.fd-tw{animation:none}}
  </style>
  <div class="tbb fd" style="--glow:${glow}">
    <div class="fd-fill" data-painted></div>
    <div class="fd-fill" style="z-index:0">
      <div class="fd-fill fd-layer"><img alt="" decoding="async"></div>
      <div class="fd-fill fd-layer"><img alt="" decoding="async"></div>
    </div>
    <div class="fd-fill" style="pointer-events:none;background:radial-gradient(ellipse 720px 420px at 0 100%,rgba(0,0,0,.62) 0,rgba(0,0,0,.3) 50%,rgba(0,0,0,0) 100%)"></div>
    <div class="fd-fill x-chrome" style="pointer-events:none;background:linear-gradient(180deg,rgba(0,0,0,.5) 0,rgba(0,0,0,0) 17%,rgba(0,0,0,0) 44%,rgba(0,0,0,.5) 74%,rgba(0,0,0,.78) 100%)"></div>

    <div class="x-chrome" style="position:absolute;left:46px;right:40px;top:26px;display:flex;align-items:center;gap:12px">
      <div style="flex:1"></div>
      <button data-scene class="x-btn glass sm">Scene · ${SCENES.find(([s]) => s === scene)[1]}</button>
      <button data-glance class="x-btn glass sm">At a glance</button>
    </div>

    <div class="fd-clock">
      <div class="fd-time"><span data-time>${v.time}</span><small data-ampm>${v.ampm}</small></div>
      <div class="x-chrome">
        <div class="fd-date" data-date>${esc(v.dateLine)}</div>
        <a class="fd-line" data-quiet-link href="#/sky"><i class="fd-dot"></i><span data-quiet>${esc(v.moonName)} tonight · ${v.moonLit}% lit</span><span style="opacity:.6">›</span></a>
      </div>
    </div>

    <a class="fd-credit x-chrome" data-credit href="#/deepimage" style="display:none"><b data-credit-title></b><i data-credit-by></i></a>

    <div class="fd-dock x-chrome">
      ${dock.map(([to, text, short]) => `<a class="fd-tile" href="#/${to}"${to === 'trivia' ? ' data-trivia' : ''}>${ICONS[to]}<span>${dock.length > 8 && short ? short : text}</span>${to === 'trivia' ? '<i class="fd-badge" data-trivia-badge></i>' : ''}</a>`).join('')}
    </div>

    <div class="fd-sheet shut" data-sheet>
      <div class="x-top">
        <div class="x-title">At a glance</div>
        <div data-over style="${sub};margin-right:8px"></div>
        <button data-glow class="x-btn glass sm" aria-label="Change deck colour"><i class="fd-dot" style="width:14px;height:14px"></i>Deck colour</button>
        <button data-close class="x-btn white sm">Close</button>
      </div>
      <div style="flex:1;min-height:0;display:grid;grid-template-columns:1fr 1.15fr 1fr;grid-template-rows:1fr 1fr;gap:16px">
        <a class="fd-card" href="#/flights" data-planes>
          <div style="${k}">Over your house now</div>
          <div data-count style="${big}">Scanning…</div>
          <div data-sample style="${sub}">Within 25 miles</div>
          <div style="${k};margin-top:auto;color:var(--glow)">Closest</div>
          <div data-c-flight style="font:500 21px Outfit,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">&nbsp;</div>
          <div data-c-sub style="${sub};white-space:pre-line;overflow-wrap:anywhere">&nbsp;</div>
        </a>
        <a class="fd-card" href="#/missions" style="grid-row:span 2">
          <div style="${k};color:var(--glow)">Voyager 1 · farthest ever</div>
          <div style="${k};margin-top:14px">Distance from Earth (km)</div>
          <div data-vkm style="font:300 50px/1.05 Outfit,sans-serif;color:#FFB547">${v.vgrKm}</div>
          <div style="${k};margin-top:14px">A signal sent now arrives in</div>
          <div data-vdelay style="font:300 40px/1.1 Outfit,sans-serif">${v.vgrDelay}</div>
          <div data-vstatus style="${sub};font-size:18px;margin-top:18px;padding-left:14px;border-left:3px solid #FFB547;color:#E3E9F0">${v.vgrStatus}</div>
          <div style="margin-top:auto;display:grid;grid-template-columns:1.35fr 1fr 1fr;gap:8px;white-space:nowrap;border-top:1px solid rgba(255,255,255,.12);padding-top:16px">
            <div><div style="${k}">Speed</div><div style="font:300 24px Outfit,sans-serif">38,000 mph</div></div>
            <div><div style="${k}">Launched</div><div style="font:300 24px Outfit,sans-serif">Sep 1977</div></div>
            <div><div style="${k}">Flying</div><div style="font:300 24px Outfit,sans-serif"><span data-vyears>${v.vgrYears}</span> years</div></div>
          </div>
        </a>
        <a class="fd-card" href="#/alert">
          <div style="${k};color:var(--glow)">Space Station</div>
          <div data-iss-title style="font:500 21px Outfit,sans-serif">Calculating…</div>
          <div data-iss-time style="${big};color:#FFB547">--:--</div>
          <div data-iss-sub style="${sub}">&nbsp;</div>
          <div style="${sub};margin-top:auto;font-size:15px"><span data-iss-people style="display:none"><b data-iss-crew style="font-weight:600;color:#FFFFFF"></b> aboard · </span>17,500 mph · 250 miles up</div>
        </a>
        <a class="fd-card" href="#/sky">
          <div style="${k}">Moon tonight</div>
          <div data-moon-name style="${big}">${v.moonName}</div>
          <div style="${sub}"><span data-moon-lit>${v.moonLit}</span>% lit</div>
          <div data-moon-next style="${sub};color:#FFB547">${v.moonNext}</div>
        </a>
        <div style="display:flex;flex-direction:column;gap:16px;min-width:0;min-height:0">
          <a class="fd-card" href="#/departures" style="flex:1;min-height:0">
            <div data-dep-title style="${k};color:var(--glow)">Departures</div>
            <div data-dep-line style="${sub};font-size:18px">Loading the board…</div>
          </a>
          <a class="fd-card" href="#/trivia" style="min-height:56px;padding:14px 24px">
            <div style="${k}">Trivia</div>
            <div data-wings style="${sub}">&nbsp;</div>
          </a>
        </div>
      </div>
    </div>
  </div>`;

  const $ = (s) => el.querySelector(s);
  const root = $('.fd');
  const sheet = $('[data-sheet]');
  const painted = $('[data-painted]');
  const layers = Array.from(el.querySelectorAll('.fd-layer'));

  // ---- resting: after a while untouched only the scene and the time are left ----
  const sheetOpen = () => !sheet.classList.contains('shut');
  rest = restful(root, {
    after: Math.max(0, +display().homeHideSecs || 0) * 1000,
    stay: () => tutorialRunning(),
    onChange: (resting) => { if (resting) shutSheet(); },
  });

  $('[data-glow]').addEventListener('click', () => {
    glow = GLOWS[(GLOWS.indexOf(glow) + 1) % GLOWS.length];
    try { localStorage.setItem('bridge.glow', glow); } catch (e) { /* storage off */ }
    root.style.setProperty('--glow', glow);
  });

  // ---- the clock (only what changed is written) ----
  const shownText = {};
  const put = (sel, text) => {
    if (shownText[sel] === text) return;
    shownText[sel] = text;
    $(sel).textContent = text;
  };
  let lastMinute = -1;
  let lastDay = dayKey();
  timers.push(setInterval(() => {
    const n = vals();
    if (sheetOpen()) { put('[data-vkm]', n.vgrKm); put('[data-vdelay]', n.vgrDelay); }
    if (n.minute === lastMinute) return;
    lastMinute = n.minute;
    put('[data-time]', n.time);
    put('[data-ampm]', n.ampm);
    put('[data-date]', n.dateLine);
    put('[data-vstatus]', n.vgrStatus);
    put('[data-moon-name]', n.moonName);
    put('[data-moon-lit]', String(n.moonLit));
    put('[data-moon-next]', n.moonNext);
    put('[data-vyears]', String(n.vgrYears));
    everyMinute();
    // A new day: the painted scenes move on (the Moon's phase, the planets' places).
    if (dayKey() !== lastDay) { lastDay = dayKey(); if (scene !== 'photos') setScene(scene); else if (painted.firstChild) paint('moon'); }
  }, 1000));

  let loc = null;
  let guessed = false; // couldn't find the house: showing New York until it can
  let planesNote = null; // { at, kind: 'live' | 'last' | 'sample' } for the line under the count
  let closest = null;  // { count, text, hex } live planes for the home line (never sample)
  let board = null;    // { at, title, line, live }
  let iss = null;      // { p, orbitOk, ageDays }

  // ---- trivia: a dot on the button while today's question is waiting; wings and streak in the sheet ----
  function triviaBadge() {
    const q = read(QOTD_KEY);
    const waiting = !q || q.day !== dayKey() || !q.answered;
    $('[data-trivia-badge]').style.display = waiting ? 'block' : 'none';
    const st = read(STATS_KEY) || {};
    const wings = +st.wings || 0, streak = +st.streak || 0;
    put('[data-wings]', `${waiting ? 'Today’s question is waiting' : 'Today’s question answered'} · ${wings} wing${wings === 1 ? '' : 's'}${streak ? ` · ${streak}-day streak` : ''}`);
  }

  function everyMinute() {
    if (!alive) return;
    triviaBadge();
    drawPlanesNote();
    drawIss();
    if (board && !board.live) drawBoard();
    drawQuiet();
  }

  // ---- the one quiet line on the home: the next thing worth looking up for ----
  function drawQuiet() {
    const now = Date.now();
    const p = iss && iss.p;
    let text, href;
    const station = (soon) => {
      const start = new Date(p.visStart);
      const today = new Date();
      const same = start.toDateString() === today.toDateString();
      const day = same ? '' : ` ${start.toLocaleDateString('en-US', { weekday: 'long' })}`;
      return soon || same ? `Space Station passes ${fmtTime(p.visStart)} · look ${compass(p.visAz).toLowerCase()}`
        : `Space Station passes${day} ${fmtTime(p.visStart)}`;
    };
    if (p && p.visStart <= now && p.visEnd > now) { text = `Space Station overhead now · look ${compass(p.visAz).toLowerCase()}`; href = '#/alert'; }
    else if (p && p.visStart > now && p.visStart - now < 90 * 60000) { text = station(true); href = '#/alert'; }
    else if (closest && closest.count > 0) {
      text = `${closest.count} aircraft overhead · nearest ${closest.text}`;
      href = closest.hex ? `#/flights/${encodeURIComponent(closest.hex)}` : '#/flights';
    } else if (p && p.visStart > now) { text = station(false); href = '#/alert'; }
    else if (painted.dataset.art === 'moon') text = ''; // the Moon is on screen with its own line
    else {
      const n = vals();
      text = [`${n.moonName} tonight`, `${n.moonLit}% lit`, n.moonNext].filter(Boolean).join(' · ');
      href = '#/sky';
    }
    put('[data-quiet]', text);
    $('[data-quiet-link]').classList.toggle('off', !text);
    if (!text) return;
    if ($('[data-quiet-link]').getAttribute('href') !== href) $('[data-quiet-link]').setAttribute('href', href);
  }

  // The small line under the plane count: where the numbers come from and how old they are.
  function drawPlanesNote() {
    const sm = $('[data-sample]');
    const n = planesNote;
    if (!n) return;
    let text, warn = true;
    if (n.kind === 'sample') text = offline() ? 'SAMPLE · the Wi-Fi is off' : 'SAMPLE · no live feed';
    else if (n.kind === 'last') text = `${offline() ? 'Wi-Fi off' : 'No live feed'} · last seen ${ago(n.at).toLowerCase()}`;
    else if (Date.now() - n.at >= 2 * 60000) text = `Last update ${ago(n.at).toLowerCase()}`;
    else { text = 'Within 25 miles'; warn = false; }
    sm.textContent = text;
    sm.style.color = warn ? '#FFB547' : '#B9C6D4';
  }

  // hex: the closest plane, so a tap opens the radar with that very plane picked.
  function showPlanes(count, flight, subText, hex) {
    $('[data-count]').textContent = `${count} plane${count === 1 ? '' : 's'}`;
    $('[data-c-flight]').textContent = flight;
    $('[data-c-sub]').textContent = subText;
    $('[data-planes]').setAttribute('href', hex ? `#/flights/${encodeURIComponent(hex)}` : '#/flights');
  }

  async function loadPlanes() {
    try {
      const data = await getAircraft(loc);
      if (!live()) return;
      const last = read(LAST_PLANES);
      if (data.sample && last && Date.now() - last.at < 6 * 3600000 && !guessed) {
        // The feed is down: the last real answer, with its age, beats made-up planes.
        planesNote = { at: last.at, kind: 'last' };
        closest = null;
        drawPlanesNote();
        showPlanes(last.count, last.flight, last.sub);
        drawQuiet();
        return;
      }
      const air = data.list.filter((a) => !a.onGround);
      planesNote = { at: data.at, kind: data.sample ? 'sample' : 'live' };
      drawPlanesNote();
      const c = air[0];
      if (!c) {
        closest = null;
        showPlanes(0, 'Clear skies', 'Nothing on radar');
      } else {
        const route = data.sample ? c.sampleRoute : (await getRoutes([c], 1))[c.callsign];
        if (!live()) return;
        const codes = route?.from && route?.to ? ` · ${route.from.iata || route.from.city} → ${route.to.iata || route.to.city}` : '';
        showPlanes(air.length, flightLabel(c, route) + codes, `${typeName(c)}
${fmtAlt(c)}${trend(c) ? ' ' + trend(c) : ''} · ${fmtMiles(c.dst)} ${compassShort(c.dir)}`, c.hex);
        // Sample planes and a guessed town are never put on the home line as if they were his sky.
        closest = data.sample || guessed ? null : { count: air.length, text: flightLabel(c, route) + codes, hex: c.hex };
      }
      if (!data.sample && !guessed) {
        write(LAST_PLANES, { at: data.at, count: air.length, flight: $('[data-c-flight]').textContent, sub: $('[data-c-sub]').textContent });
      }
      drawQuiet();
    } catch (e) {
      console.error(e);
      if (live() && !planesNote) {
        $('[data-count]').textContent = 'Radar offline';
        $('[data-c-sub]').textContent = offline() ? 'The Wi-Fi is off' : 'Trying again shortly';
      }
    }
  }

  // ---- Space Station: worked out on the deck, redrawn each minute so the words stay true ----
  function drawIss() {
    if (!iss || !alive) return;
    const p = iss.p;
    const now = Date.now();
    if (!p && !iss.orbitOk) {
      // No times because the newest orbit is too old to trust, not because there are none.
      $('[data-iss-title]').textContent = 'Pass times unavailable';
      $('[data-iss-time]').textContent = '--:--';
      $('[data-iss-sub]').textContent = `Orbit data ${iss.ageDays} days old` + (offline() ? ' · Wi-Fi off' : '');
      return;
    }
    if (!p) {
      $('[data-iss-title]').textContent = 'Not visible this week';
      $('[data-iss-time]').textContent = '--:--';
      $('[data-iss-sub]').textContent = 'It passes in daylight or too low for now';
      return;
    }
    const start = new Date(p.visStart);
    const today = new Date();
    const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    const mins = Math.max(1, Math.round((p.visEnd - p.visStart) / 60000));
    let title;
    if (p.visStart <= now) title = 'Overhead now · look up';
    else if (start.toDateString() === today.toDateString()) title = start.getHours() >= 17 || start.getHours() < 4 ? 'Visible tonight' : 'Visible today';
    else if (start.toDateString() === tomorrow.toDateString()) title = start.getHours() < 4 && today.getHours() >= 12 ? 'Visible tonight' : start.getHours() < 12 ? 'Visible tomorrow morning' : 'Visible tomorrow';
    else title = 'Visible ' + start.toLocaleDateString('en-US', { weekday: 'long' });
    $('[data-iss-title]').textContent = title;
    $('[data-iss-time]').textContent = fmtTime(p.visStart);
    $('[data-iss-sub]').textContent = `Look ${compass(p.visAz).toLowerCase()} · ${brightnessWords(p).replace(', LOW DOWN', '').toLowerCase()} · ${heightWords(p.visMaxEl || 0)} · ${mins} min`;
  }

  function drawCrew(c) {
    // Never fetched (no Wi-Fi since it was switched on): leave the count out rather than show "--".
    const known = !!(c && c.onIss);
    $('[data-iss-crew]').textContent = known ? String(c.onIss) : '';
    $('[data-iss-people]').style.display = known ? '' : 'none';
  }

  async function loadIss() {
    getCrew().then((c) => { if (live()) drawCrew(c); }).catch(() => { if (live()) drawCrew(null); });
    try {
      // Two days ahead first (the same sums the alert check shares); six days only when
      // those two have nothing to see, which is three times the work.
      const p = await nextVisiblePass(loc, 48) || await nextVisiblePass(loc, 144);
      let st = { ok: true, ageDays: 0 };
      try { st = await orbitStatus(); } catch (err) { /* keep quiet */ }
      if (!live()) return;
      iss = { p, orbitOk: st.ok, ageDays: st.ageDays };
      drawIss();
      drawQuiet();
      // Turn to "overhead now" as it starts, and on to the next pass once it's gone.
      clearTimeout(issTimer);
      if (p) {
        const next = p.visStart > Date.now() ? p.visStart : p.visEnd + 60000;
        if (next - Date.now() < 15 * 60000) issTimer = setTimeout(() => { if (Date.now() > p.visEnd) loadIss(); else { drawIss(); drawQuiet(); } }, Math.max(1000, next - Date.now() + 500));
      }
    } catch (e) {
      console.error(e);
      if (!live()) return;
      // Keep the pass we had if it's still to come; otherwise say so plainly.
      if (iss && iss.p && iss.p.visEnd > Date.now()) return;
      iss = null;
      $('[data-iss-title]').textContent = 'Pass times unavailable';
      $('[data-iss-time]').textContent = '--:--';
      $('[data-iss-sub]').textContent = offline() ? 'The Wi-Fi is off' : 'Trying again shortly';
      drawQuiet();
    }
  }

  // ---- departures: one line in the sheet, fetched while the sheet is open ----
  function drawBoard() {
    if (!board) return;
    $('[data-dep-title]').textContent = board.title;
    const old = !board.live && !board.sample;
    $('[data-dep-line]').textContent = board.line + (old ? ` · ${offline() ? 'Wi-Fi off' : 'no live feed'} · seen ${ago(board.at).toLowerCase()}` : '');
    $('[data-dep-line]').style.color = old ? '#FFB547' : '#E3E9F0';
  }

  async function loadBoard() {
    if (!loc) return;
    try {
      const b = await getBoard(loc);
      if (!live()) return;
      const last = read(LAST_BOARD);
      if (b.sample && last && Date.now() - last.at < 6 * 3600000 && !guessed) {
        board = Object.assign({}, last, { live: false, sample: false });
      } else if (b.sample) {
        const next = b.departures.find((r) => r.s !== 'DEPARTED') || b.departures[0];
        board = { title: 'SAMPLE departures', line: next ? `Next out: ${next.f} to ${next.d} · ${fmtTime(next.time)}` : 'No sample flights', live: true, sample: true, at: Date.now() };
      } else if (!b.airport) {
        // Nothing within 30 miles: name the nearest airport the planes overhead are using.
        const n = (b.nearby || [])[0];
        board = { title: 'Departures', line: n ? `None within 30 mi right now · nearest in use: ${n.city || n.iata} (${n.iata}), ${n.mi} mi ${n.side}` : 'No airport traffic nearby right now', live: true, at: b.at || Date.now() };
      } else {
        const lastOut = b.departures[0];
        board = { title: `${b.airport.iata} departures`, line: lastOut ? `Latest out: ${lastOut.f} to ${lastOut.d} · ${fmtTime(lastOut.time)}` : 'No departures in the air right now', live: true, at: b.at || Date.now() };
      }
      if (board.live && !board.sample && !guessed) write(LAST_BOARD, { title: board.title, line: board.line, at: board.at });
      drawBoard();
    } catch (e) {
      console.error(e);
      if (!live()) return;
      if (board) { board.live = false; drawBoard(); }
      else $('[data-dep-line]').textContent = offline() ? 'Board offline · the Wi-Fi is off' : 'Board offline · trying again shortly';
    }
  }

  // ---- "At a glance": the readouts that used to fill the deck ----
  let boardAt = 0;
  function openSheet() {
    sheet.classList.remove('shut');
    const n = vals();
    put('[data-vkm]', n.vgrKm);
    put('[data-vdelay]', n.vgrDelay);
    if (Date.now() - boardAt > 3 * 60000) { boardAt = Date.now(); loadBoard(); }
  }
  function shutSheet() { sheet.classList.add('shut'); }
  $('[data-glance]').addEventListener('click', openSheet);
  $('[data-close]').addEventListener('click', shutSheet);

  async function watchAlerts() {
    try {
      const a = await checkAlerts(loc);
      if (!live() || !a || wasSeen(a.id)) return;
      // A plane right over the house can be frequent near airports: at most every 30 min.
      if (a.kind === 'overhead') {
        const last = Number(localStorage.getItem('skyalert.lastOverhead') || 0);
        if (Date.now() - last < 30 * 60000) return;
        localStorage.setItem('skyalert.lastOverhead', String(Date.now()));
      }
      markSeen(a.id);
      location.hash = '#/alert';
    } catch (e) {
      console.warn(e);
    }
  }

  function loadAll() {
    loadPlanes();
    loadIss();
    if (sheetOpen()) { boardAt = Date.now(); loadBoard(); }
  }

  async function findHome() {
    try {
      loc = await getLocation();
      guessed = false;
    } catch (e) {
      console.warn('bridge: no location yet', e);
      loc = loc || NYC; // can't find the house: New York so the deck still works, and it says so
      guessed = true;
    }
    if (!live()) return;
    $('[data-over]').textContent = guessed ? 'Town not found yet · showing New York' : '';
    $('[data-over]').style.color = guessed ? '#FFB547' : '#B9C6D4';
    if (painted.dataset.art === 'moon') paint('moon'); // the Moon the right way up for where he lives
  }

  // -------------------------------------------------------------------------------------
  // The scene
  // -------------------------------------------------------------------------------------
  function paint(what) {
    painted.dataset.art = what || '';
    if (!what) { painted.innerHTML = ''; drawQuiet(); return; }
    try {
      painted.innerHTML = what === 'orbits' ? orbitsArt(new Date()) : moonArt(new Date(), !!loc && loc.lat < 0);
    } catch (e) { console.warn('scene', e); painted.innerHTML = ''; }
    drawQuiet();
  }

  function credit(title, by, href) {
    const box = $('[data-credit]');
    box.style.display = title ? '' : 'none';
    $('[data-credit-title]').textContent = title || '';
    $('[data-credit-by]').textContent = by || '';
    box.setAttribute('href', href || '#/deepimage');
  }

  function moonCredit() {
    const n = vals();
    credit(`${n.moonName} · ${n.moonLit}% lit`, n.moonNext ? n.moonNext.charAt(0).toUpperCase() + n.moonNext.slice(1) : '', '#/sky');
  }

  function startPhotos() {
    let list = [];
    let at = -1;
    let front = -1;       // which layer is showing (-1: none yet)
    let timer = 0, loadTimer = 0, clearTimer = 0, standTimer = 0;
    let blobUrls = [null, null];
    let stopped = false;
    const ok = () => live() && !stopped && scene === 'photos';
    const empty = (i) => {
      const img = layers[i].firstElementChild;
      img.onload = img.onerror = null;
      img.removeAttribute('src');
      if (blobUrls[i]) { URL.revokeObjectURL(blobUrls[i]); blobUrls[i] = null; }
    };
    const standIn = () => {
      if (front >= 0 || painted.dataset.art === 'moon') return;
      paint('moon');
      moonCredit();
    };

    async function next(tries) {
      if (!ok()) return;
      clearTimeout(timer);
      clearTimeout(loadTimer);
      let allowed = null;
      if (offline()) {
        // No Wi-Fi: only pictures that are on the device (or may still be in the browser's own cache).
        allowed = {};
        (await keptUrls()).concat(read(SHOWN_KEY) || []).forEach((u) => { allowed[u] = 1; });
        if (!ok()) return;
      }
      let pick = null;
      for (let n = 0; n < list.length && !pick; n++) {
        at = (at + 1) % list.length;
        if (!list[at].bad && (!allowed || allowed[list[at].url])) pick = list[at];
      }
      if (!pick || tries >= 4) {
        standIn();
        timer = setTimeout(() => next(0), HOLD_MS);
        return;
      }
      const back = front === 0 ? 1 : 0;
      const img = layers[back].firstElementChild;
      // Nothing on screen yet and this one is slow: tonight's Moon while it comes.
      if (front < 0 && !standTimer) standTimer = setTimeout(() => { if (ok()) standIn(); }, 6000);
      clearTimeout(clearTimer);
      empty(back);
      const blob = await keptGet(pick.url);
      if (!ok()) return;
      const fail = () => { clearTimeout(loadTimer); empty(back); next(tries + 1); };
      img.onload = () => {
        if (!ok()) return;
        clearTimeout(loadTimer);
        const ar = img.naturalWidth / (img.naturalHeight || 1);
        // A very tall or very wide picture would lose most of itself filling the screen;
        // a tiny one would be a smear. Leave those to the Space image page.
        if (ar < 0.9 || ar > 2.7 || img.naturalWidth < 700) { pick.bad = true; fail(); return; }
        const old = front;
        layers[back].style.zIndex = '2';
        layers[back].classList.add('on');
        if (old >= 0) layers[old].style.zIndex = '1';
        front = back;
        credit(pick.title, `${pick.copyright ? '© ' + pick.copyright : pick.credit ? pick.credit.replace(/\w\S*/g, (w) => (w === 'NASA' ? w : w.charAt(0) + w.slice(1).toLowerCase())) : 'NASA'}${pick.id ? '' : pick.date ? ` · ${new Date(pick.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}`);
        // Once the new one covers it, let the old one (and the painted Moon) go.
        clearTimer = setTimeout(() => {
          if (!ok()) return;
          if (old >= 0) { layers[old].classList.remove('on'); empty(old); }
          paint('');
        }, FADE_MS + 200);
        if (!blob) {
          const shown = (read(SHOWN_KEY) || []).filter((u) => u !== pick.url);
          shown.unshift(pick.url);
          write(SHOWN_KEY, shown.slice(0, 24));
          keep(pick.url);
        }
        timer = setTimeout(() => next(0), HOLD_MS);
      };
      img.onerror = fail;
      loadTimer = setTimeout(() => { img.onload = img.onerror = null; fail(); }, LOAD_MS);
      if (blob) blobUrls[back] = URL.createObjectURL(blob);
      img.src = blob ? blobUrls[back] : pick.url;
    }

    (async () => {
      let today = null;
      try { today = await getSpaceImage(); } catch (e) { today = null; }
      if (!ok()) return;
      const days = read(DAYS_KEY) || {};
      const seen = {};
      const add = (p) => {
        if (!p || !p.url || seen[p.url] || p.video || /youtube|ytimg|vimeo|vumbnail/i.test(p.url)) return;
        seen[p.url] = 1;
        list.push(Object.assign({}, p));
      };
      add(today);
      Object.keys(days).sort().reverse().forEach((d) => add(days[d]));
      SPACE_IMAGES.forEach((_, i) => add(fallbackImage(i)));
      next(0);
    })();

    const again = () => { if (ok() && front < 0) next(0); };
    window.addEventListener('online', again);
    return () => {
      stopped = true;
      clearTimeout(timer); clearTimeout(loadTimer); clearTimeout(clearTimer); clearTimeout(standTimer);
      window.removeEventListener('online', again);
      layers.forEach((l, i) => { l.classList.remove('on'); empty(i); });
    };
  }

  function setScene(name) {
    stopScene();
    stopScene = () => {};
    scene = name;
    $('[data-scene]').textContent = `Scene · ${SCENES.find(([s]) => s === name)[1]}`;
    if (name === 'photos') {
      paint('');
      credit('', '');
      stopScene = startPhotos();
    } else if (name === 'moon') {
      paint('moon');
      moonCredit();
    } else {
      paint('orbits');
      credit('The planets today', '', '#/sky');
    }
  }
  $('[data-scene]').addEventListener('click', () => {
    const i = SCENES.findIndex(([s]) => s === scene);
    const to = SCENES[(i + 1) % SCENES.length][0];
    try { localStorage.setItem(SCENE_KEY, to); } catch (e) { /* storage off */ }
    setScene(to);
  });
  setScene(scene);

  triviaBadge();
  (async () => {
    await findHome();
    if (!live()) return;
    loadAll();
    watchAlerts();
    timers.push(setInterval(loadPlanes, 90 * 1000));
    timers.push(setInterval(() => { if (sheetOpen()) { boardAt = Date.now(); loadBoard(); } }, 3 * 60 * 1000));
    timers.push(setInterval(loadIss, 15 * 60 * 1000));
    timers.push(setInterval(watchAlerts, 60 * 1000));
    // Still guessing where the house is: ask again every 5 minutes, and redo the readouts once found.
    timers.push(setInterval(async () => {
      if (!guessed) return;
      await findHome();
      if (live() && !guessed) loadAll();
    }, 5 * 60 * 1000));
  })();
  later(drawQuiet, 0);

  // The Wi-Fi came back: fresh readouts now rather than in a few minutes.
  onOnline = () => {
    if (!live() || !loc) return;
    if (guessed) findHome().then(() => { if (live()) loadAll(); });
    else loadAll();
  };
  window.addEventListener('online', onOnline);
}

export function unmount() {
  alive = false;
  timers.forEach(clearInterval);
  timers = [];
  waits.forEach(clearTimeout);
  waits = [];
  clearTimeout(issTimer);
  issTimer = 0;
  stopScene();
  stopScene = () => {};
  if (rest) rest.stop();
  rest = null;
  window.removeEventListener('online', onOnline);
  onOnline = null;
}
