// node tools/sim/astro-test.mjs
//
// Checks the sky maths Tom's deck shows (js/services/astro.js, js/services/iss.js) against
// figures from elsewhere. Prints PASS/FAIL per case; exits 1 if anything fails.
//
// Reference sources (all independent of the code under test):
//  - Equinox/solstice instants: USNO "Earth's Seasons" table (UTC).
//  - New/full Moon instants: the eclipse dates of 2024-2026 (NASA eclipse pages; an eclipse
//    can only happen at a new or full Moon, and those instants are published to the minute).
//  - Planet oppositions, conjunctions and Venus's greatest elongation: the dates every
//    almanac lists (e.g. Sky & Telescope, In-The-Sky.org); magnitudes rounded as published.
//  - Sunrise/sunset: NOAA's "General Solar Position Calculations" formulas, implemented
//    below from scratch (a different method from astro.js; NOAA quotes ~1 minute accuracy).
//  - Polar day/night: Utqiagvik (Barrow), Alaska has no sunrise from about Nov 18 to Jan 22
//    and no sunset from about May 10 to Aug 2; Tromsø has polar night from ~Nov 27 to Jan 15.
//  - Space Station: the two separate orbit codes in the repo (astro.js and iss.js) must agree,
//    and the orbit must have the ISS's well-known height (~420 km) and period (~92-93 min).
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

process.env.TZ = 'America/New_York'; // local days and daylight saving are tested in New York time
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const A = await import(pathToFileURL(resolve(ROOT, 'js/services/astro.js')).href);
// iss.js touches localStorage only inside its network helpers; the maths needs none of it.
const I = await import(pathToFileURL(resolve(ROOT, 'js/services/iss.js')).href);

let fails = 0, count = 0;
function check(name, ok, detail) {
  count++;
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
}
const D = (s) => new Date(s);
const n360 = (x) => ((x % 360) + 360) % 360;
const adiff = (a, b) => { const x = n360(a - b); return x > 180 ? x - 360 : x; };
const minutes = (a, b) => (a - b) / 60000;

// ---- Sun longitude at the seasons (USNO)
for (const [t, L] of [['2024-03-20T03:06Z', 0], ['2024-06-20T20:51Z', 90], ['2024-09-22T12:44Z', 180], ['2024-12-21T09:20Z', 270], ['2026-06-21T08:24Z', 90], ['2026-12-21T20:50Z', 270]]) {
  const e = adiff(A.sunEcliptic(D(t)).lon, L);
  check(`sun longitude ${L}° at ${t}`, Math.abs(e) < 0.05, `off by ${e.toFixed(3)}°`);
}

// ---- Moon phase at eclipse instants
for (const [t, el, what] of [['2024-04-08T18:21Z', 0, 'new (total solar eclipse)'], ['2024-10-02T18:49Z', 0, 'new (annular eclipse)'],
  ['2025-03-14T06:55Z', 180, 'full (total lunar eclipse)'], ['2025-09-07T18:09Z', 180, 'full (total lunar eclipse)'],
  ['2026-03-03T11:38Z', 180, 'full (total lunar eclipse)'], ['2026-08-12T17:37Z', 0, 'new (total solar eclipse)']]) {
  const p = A.moonPhase(D(t));
  const e = adiff(p.elongation, el);
  check(`moon ${what} ${t}`, Math.abs(e) < 1 && (el ? p.fraction > 0.99 : p.fraction < 0.01), `elongation off ${e.toFixed(2)}°, ${Math.round(p.fraction * 100)}% lit`);
}

// ---- Next full/new Moon search
for (const [from, kind, want] of [['2026-02-20T00:00Z', 'full', '2026-03-03T11:38Z'], ['2026-07-30T00:00Z', 'new', '2026-08-12T17:37Z'],
  ['2025-09-01T00:00Z', 'full', '2025-09-07T18:09Z'], ['2024-03-25T00:00Z', 'new', '2024-04-08T18:21Z']]) {
  const got = A.nextMoonPhase(kind, D(from));
  const m = got ? minutes(got, D(want)) : Infinity;
  check(`next ${kind} moon after ${from.slice(0, 10)} = ${want}`, Math.abs(m) < 150, got ? `got ${got.toISOString()}, ${Math.round(m)} min off` : 'none found');
}

// ---- Planets
for (const [name, t] of [['jupiter', '2024-12-07T12:00Z'], ['mars', '2025-01-16T02:00Z'], ['saturn', '2025-09-21T04:00Z'], ['jupiter', '2026-01-10T08:00Z']]) {
  const s = A.sunDistance(name, D(t));
  check(`${name} at opposition ${t.slice(0, 10)}`, s > 174, `${s.toFixed(1)}° from the Sun`);
}
{
  const j = A.planetEcliptic('jupiter', D('2020-12-21T18:00Z')), s = A.planetEcliptic('saturn', D('2020-12-21T18:00Z'));
  const sep = Math.acos(Math.sin(j.lat * Math.PI / 180) * Math.sin(s.lat * Math.PI / 180) + Math.cos(j.lat * Math.PI / 180) * Math.cos(s.lat * Math.PI / 180) * Math.cos((j.lon - s.lon) * Math.PI / 180)) * 180 / Math.PI;
  check('Jupiter-Saturn great conjunction 2020-12-21 (0.1° apart)', sep < 0.5, `${sep.toFixed(2)}° apart`);
}
{
  const s = A.sunDistance('venus', D('2025-01-10T12:00Z'));
  check('Venus greatest evening elongation 2025-01-10 (47.2°)', Math.abs(s - 47.2) < 1, `${s.toFixed(1)}°`);
}
for (const [name, t, mag] of [['venus', '2025-01-10T12:00Z', -4.6], ['jupiter', '2024-12-07T12:00Z', -2.8], ['mars', '2025-01-16T02:00Z', -1.4], ['saturn', '2025-09-21T04:00Z', 0.6]]) {
  const m = A.planetEcliptic(name, D(t)).mag;
  check(`${name} brightness ${t.slice(0, 10)} ≈ ${mag}`, Math.abs(m - mag) < 0.4, `magnitude ${m.toFixed(2)}`);
}

// ---- Sunrise / sunset against NOAA's formulas
function noaa(y, mo, d, lat, lon) { // returns UTC Date of sunrise, sunset (NOAA general solar position)
  const doy = Math.round((Date.UTC(y, mo - 1, d) - Date.UTC(y, 0, 1)) / 86400000) + 1;
  const out = [];
  for (const sign of [1, -1]) {
    let t = 12 - sign * 6; // first guess, hours UTC-ish, refined twice
    for (let k = 0; k < 3; k++) {
      const g = (2 * Math.PI / 365) * (doy - 1 + (t - 12) / 24);
      const eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
      const dec = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
      const r = Math.PI / 180;
      const ha = Math.acos(Math.cos(90.833 * r) / (Math.cos(lat * r) * Math.cos(dec)) - Math.tan(lat * r) * Math.tan(dec)) / r;
      t = (720 - 4 * (lon + sign * ha) - eqt) / 60;
    }
    out.push(new Date(Date.UTC(y, mo - 1, d) + t * 3600000));
  }
  return out; // [rise, set]
}
// Places west of Greenwich at their own local dates (the test runs in New York time, so the
// local calendar day is right for New York and close enough elsewhere in the Americas).
for (const [where, lat, lon, y, mo, d] of [
  ['New York, winter solstice', 40.7128, -74.006, 2026, 12, 21],
  ['New York, DST starts', 40.7128, -74.006, 2026, 3, 8],
  ['New York, DST ends', 40.7128, -74.006, 2026, 11, 1],
  ['New York, today', 40.7128, -74.006, 2026, 11, 21],
  ['Washington DC, summer solstice', 38.9072, -77.0369, 2026, 6, 21],
  ['Philadelphia, equinox', 39.95, -75.17, 2026, 9, 22],
  ['Miami', 25.76, -80.19, 2026, 1, 15],
]) {
  const rs = A.riseSet('sun', new Date(y, mo - 1, d, 12), lat, lon);
  const [r, s] = noaa(y, mo, d, lat, lon);
  const dr = minutes(rs.rise, r), ds = minutes(rs.set, s);
  // NOAA's simplified formulas themselves drift up to ~2 minutes near the equinoxes (their
  // declination comes from a 3-term series in the fraction of the year), hence 2.5.
  check(`sunrise/sunset ${where}`, Math.abs(dr) < 2.5 && Math.abs(ds) < 2.5,
    `rise ${rs.rise.toLocaleTimeString('en-US')} (${dr.toFixed(1)} min vs NOAA), set ${rs.set.toLocaleTimeString('en-US')} (${ds.toFixed(1)} min)`);
}
{ // the rise found for a local day is on that local day, also on daylight-saving change days
  const rs = A.riseSet('sun', new Date(2026, 2, 8, 0, 30), 40.7128, -74.006);
  check('DST day: sunrise found is on March 8 local time, after 7 AM EDT', rs.rise.getDate() === 8 && rs.rise.getHours() === 7, rs.rise.toString());
}

// ---- Polar cases
{
  const nov = A.riseSet('sun', new Date(2026, 10, 21, 12), 71.29, -156.79);
  check('Utqiagvik, Nov 21: the Sun never rises', nov.neverUp && !nov.rise && !nov.set, JSON.stringify({ rise: nov.rise, set: nov.set }));
  const jun = A.riseSet('sun', new Date(2026, 5, 21, 12), 71.29, -156.79);
  check('Utqiagvik, Jun 21: the Sun never sets', jun.alwaysUp && !jun.rise && !jun.set);
  const t = A.sunTimes(new Date(2026, 5, 21, 12), 51.48, 0);
  check('London, Jun 21: never fully dark (no astronomical night)', !t.darkStart && !t.darkEnd && t.sunrise && t.sunset);
  const tw = A.sunTimes(new Date(2026, 10, 21, 12), 40.7128, -74.006);
  check('New York, Nov 21: twilights in order', tw.sunset < tw.civilDusk && tw.civilDusk < tw.nauticalDusk && tw.nauticalDusk < tw.darkStart
    && tw.darkEnd < tw.nauticalDawn && tw.nauticalDawn < tw.civilDawn && tw.civilDawn < tw.sunrise,
  `sunset ${tw.sunset.toLocaleTimeString('en-US')}, fully dark ${tw.darkStart.toLocaleTimeString('en-US')}`);
}

// ---- Moon rising and setting: self-consistency
{
  const lat = 40.7128, lon = -74.006;
  const rs = A.riseSet('moon', new Date(2026, 2, 3, 12), lat, lon); // full moon day
  const sun = A.riseSet('sun', new Date(2026, 2, 3, 12), lat, lon);
  check('full moon (Mar 3 2026) rises within 1.5 h of sunset', rs.rise && Math.abs(minutes(rs.rise, sun.set)) < 90,
    rs.rise ? `moonrise ${rs.rise.toLocaleTimeString('en-US')}, sunset ${sun.set.toLocaleTimeString('en-US')}` : 'no rise');
  const alt = A.position('moon', rs.rise, lat, lon).alt;
  check('moonrise is when the Moon is at the horizon', Math.abs(alt + 0.833) < 0.05, `altitude ${alt.toFixed(3)}°`);
  // Over a month the Moon skips exactly one rise (it rises ~50 min later each day).
  let skipped = 0;
  for (let k = 0; k < 30; k++) if (!A.riseSet('moon', new Date(2026, 10, 1 + k, 12), lat, lon).rise) skipped++;
  check('Moon skips one rise in a month (Nov 2026, New York)', skipped === 1, `${skipped} days with no moonrise`);
}

// ---- Space Station: the two orbit codes agree, and the orbit is the ISS's
{
  // A real ISS element set (CelesTrak, epoch 2026-11-17 08:01:45 UTC; the same one iss.js keeps as its fallback).
  const omm = { EPOCH: '2026-11-17T08:01:45.000', MEAN_MOTION: 15.4943095, MEAN_MOTION_DOT: 0.00009012, ECCENTRICITY: 0.0007381,
    INCLINATION: 51.6318, RA_OF_ASC_NODE: 262.2236, ARG_OF_PERICENTER: 35.3953, MEAN_ANOMALY: 324.7525 };
  const el = { epoch: Date.UTC(2026, 10, 17, 8, 1, 45), n: omm.MEAN_MOTION, ndot: omm.MEAN_MOTION_DOT, e: omm.ECCENTRICITY,
    i: omm.INCLINATION, raan: omm.RA_OF_ASC_NODE, argp: omm.ARG_OF_PERICENTER, M: omm.MEAN_ANOMALY };
  const pos = A.makeOrbit(omm);
  const h = Math.hypot(...pos(D('2026-11-18T00:00Z'))) - 6371;
  check('ISS height about 420 km', h > 380 && h < 450, `${h.toFixed(0)} km`);
  check('ISS orbit period 92-93 min', 1440 / omm.MEAN_MOTION > 92 && 1440 / omm.MEAN_MOTION < 93.5, `${(1440 / omm.MEAN_MOTION).toFixed(1)} min`);
  const loc = { lat: 40.7128, lon: -74.006 };
  const from = D('2026-11-17T12:00Z');
  const a = A.issPasses(omm, loc.lat, loc.lon, from, 48, 10);
  const b = I.predictPasses(el, loc, { from: from.getTime(), hours: 48, step: 10 }).filter((p) => p.visible);
  check('both orbit codes find the same number of visible passes', a.length === b.length && a.length > 0, `${a.length} vs ${b.length}`);
  const worst = Math.max(...a.map((p, k) => (b[k] ? Math.abs(minutes(p.start, b[k].visStart)) : 99)));
  check('both orbit codes agree on visible pass start times (within 1 min)', worst <= 1, `worst ${worst.toFixed(2)} min`);
  for (const p of b) {
    const t = p.visStart + 30000;
    const sunAlt = A.sunAlt(new Date(t), loc.lat, loc.lon);
    if (!(sunAlt < -6)) { check('visible passes happen in a dark sky', false, new Date(t).toISOString()); break; }
  }
  check('visible passes happen in a dark sky (Sun 6° down or more)', b.every((p) => A.sunAlt(new Date(p.visStart + 30000), loc.lat, loc.lon) < -5.9));
  // The bug this guards: iss.js used to count a 30-second, 11°-high glimpse (2026-11-17 23:50 UTC
  // over New York) as a visible pass, so the deck could go red for it; astro.js never did.
  const all = I.predictPasses(el, loc, { from: from.getTime(), hours: 48, step: 10 });
  check('no "visible" pass shorter than a minute', all.every((p) => !p.visible || p.visEnd - p.visStart >= 60000));
  // Passes from an orbit more than 10 days old are not offered at all. (No network here:
  // iss.js falls back to its built-in elements, which are the ones above.)
  globalThis.fetch = () => Promise.reject(new Error('offline in the test'));
  const old = await I.getPasses(loc, { from: el.epoch + 11 * 86400000, hours: 24 }).catch((e) => String(e));
  check('no passes from an orbit 11 days old', Array.isArray(old) && old.length === 0, Array.isArray(old) ? `${old.length} passes` : old);
}

// ---- Space Station brightness words
check('ISS overhead (430 km) is VERY BRIGHT, low (1,600 km) is fainter',
  I.brightnessWords({ visRange: 430 }) === 'VERY BRIGHT' && I.brightnessWords({ visRange: 1600 }) === 'FAINTER, LOW DOWN');

// ---- Words
check('compass words', A.compass(0) === 'NORTH' && A.compass(316) === 'NORTHWEST' && A.compass(359) === 'NORTH' && A.compass(135, true) === 'SE');
check('height words', A.altWords(10) === 'LOW' && A.altWords(45) === 'HALFWAY UP' && A.altWords(80) === 'OVERHEAD');

console.log(`\n${count - fails}/${count} passed`);
process.exit(fails ? 1 : 0);
