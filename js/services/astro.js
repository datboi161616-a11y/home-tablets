// Small, library-free astronomy for Tom's "Tonight's sky" and missions screens.
//
// Accuracy goal: good enough to point a kid at the right part of the sky.
//   Sun, planets: ~0.5-1°   Moon: ~1-2°   ISS pass times: about a minute
// Sources of the formulas:
//   - Sun: the low-precision solar position from the Astronomical Almanac.
//   - Moon: mean elements plus the 5 biggest periodic terms (Meeus, ch. 47 "lite").
//   - Planets: JPL "Keplerian elements for approximate positions" (Standish),
//     table valid 1800-2050, J2000 ecliptic, plus a simple precession correction.
//   - ISS: two-body orbit from the CelesTrak mean elements, with the J2
//     (Earth's equatorial bulge) drift of the node and perigee. Not SGP4, but
//     fine for predicting passes a day or two ahead.
// All angles in degrees unless a name says otherwise. Times are JS Dates (UTC inside).

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const norm360 = (x) => ((x % 360) + 360) % 360;
const sin = (d) => Math.sin(d * RAD);
const cos = (d) => Math.cos(d * RAD);

/** Days since the J2000.0 epoch (2000-01-01 12:00 UT). */
export const dJ2000 = (date) => date.getTime() / 86400000 + 2440587.5 - 2451545.0;

/** Greenwich mean sidereal time, degrees. */
export const gmst = (date) => norm360(280.46061837 + 360.98564736629 * dJ2000(date));

const obliquity = (date) => 23.439 - 0.00000036 * dJ2000(date);

/** Ecliptic longitude/latitude (of date) -> right ascension/declination. */
export function eclToEq(lon, lat, date) {
  const e = obliquity(date);
  const x = cos(lat) * cos(lon);
  const y = cos(e) * cos(lat) * sin(lon) - sin(e) * sin(lat);
  const z = sin(e) * cos(lat) * sin(lon) + cos(e) * sin(lat);
  return { ra: norm360(Math.atan2(y, x) * DEG), dec: Math.asin(z) * DEG };
}

/** RA/Dec -> altitude above the horizon and azimuth (0 = north, 90 = east). */
export function altAz({ ra, dec }, date, lat, lon) {
  const H = gmst(date) + lon - ra; // hour angle
  const alt = Math.asin(sin(lat) * sin(dec) + cos(lat) * cos(dec) * cos(H)) * DEG;
  const az = Math.atan2(-cos(dec) * sin(H), sin(dec) * cos(lat) - cos(dec) * sin(lat) * cos(H)) * DEG;
  return { alt, az: norm360(az) };
}

// ---------------------------------------------------------------- Sun
export function sunEcliptic(date) {
  const d = dJ2000(date);
  const g = 357.529 + 0.98560028 * d; // mean anomaly
  const q = 280.459 + 0.98564736 * d; // mean longitude
  const lon = norm360(q + 1.915 * sin(g) + 0.020 * sin(2 * g));
  const au = 1.00014 - 0.01671 * cos(g) - 0.00014 * cos(2 * g);
  return { lon, lat: 0, au };
}

export const sunAlt = (date, lat, lon) => {
  const s = sunEcliptic(date);
  return altAz(eclToEq(s.lon, 0, date), date, lat, lon).alt;
};

// ---------------------------------------------------------------- Moon
export function moonEcliptic(date) {
  const d = dJ2000(date);
  const L = 218.316 + 13.176396 * d; // mean longitude
  const M = 134.963 + 13.064993 * d; // Moon's mean anomaly
  const F = 93.272 + 13.229350 * d; // argument of latitude
  const D = 297.850 + 12.190749 * d; // mean elongation from the Sun
  const Ms = 357.529 + 0.98560028 * d; // Sun's mean anomaly
  const lon = L + 6.289 * sin(M) + 1.274 * sin(2 * D - M) + 0.658 * sin(2 * D)
    + 0.214 * sin(2 * M) - 0.186 * sin(Ms);
  const lat = 5.128 * sin(F);
  const km = 385001 - 20905 * cos(M);
  return { lon: norm360(lon), lat, km };
}

/** Moon phase from the Sun-Moon elongation. fraction = share of the disc lit. */
export function moonPhase(date) {
  const e = norm360(moonEcliptic(date).lon - sunEcliptic(date).lon);
  const fraction = (1 - cos(e)) / 2;
  const name = e < 12 || e > 348 ? 'New moon'
    : e < 80 ? 'Waxing crescent' : e < 100 ? 'First quarter'
    : e < 168 ? 'Waxing gibbous' : e < 192 ? 'Full moon'
    : e < 260 ? 'Waning gibbous' : e < 280 ? 'Last quarter' : 'Waning crescent';
  return { elongation: e, fraction, name, waxing: e < 180 };
}

function moonAltAz(date, lat, lon) {
  const m = moonEcliptic(date);
  const p = altAz(eclToEq(m.lon, m.lat, date), date, lat, lon);
  // The Moon is close enough that our spot on Earth shifts it (parallax, up to ~1°).
  p.alt -= Math.asin((6378 / m.km) * cos(p.alt)) * DEG;
  return p;
}

// ---------------------------------------------------------------- Planets
// [a (AU), e, I, L, long. perihelion, long. node] and their rates per century.
const EL = {
  mercury: [[0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593],
    [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081]],
  venus: [[0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255],
    [0.00000390, -0.00004107, -0.00078890, 58517.81538729, 0.00268329, -0.27769418]],
  earth: [[1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0],
    [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0]],
  mars: [[1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891],
    [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343]],
  jupiter: [[5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909],
    [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106]],
  saturn: [[9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448],
    [-0.00125060, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794]],
};

function solveKepler(Mrad, e) {
  let E = Mrad + e * Math.sin(Mrad);
  for (let k = 0; k < 6; k++) E -= (E - e * Math.sin(E) - Mrad) / (1 - e * Math.cos(E));
  return E;
}

/** Heliocentric ecliptic x,y,z (AU, J2000) of a planet. */
function helio(name, date) {
  const T = dJ2000(date) / 36525;
  const [a, e, I, L, wbar, node] = EL[name][0].map((v, k) => v + EL[name][1][k] * T);
  const w = wbar - node; // argument of perihelion
  const E = solveKepler(norm360(L - wbar) * RAD, e);
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  return [
    (cos(w) * cos(node) - sin(w) * sin(node) * cos(I)) * xp + (-sin(w) * cos(node) - cos(w) * sin(node) * cos(I)) * yp,
    (cos(w) * sin(node) + sin(w) * cos(node) * cos(I)) * xp + (-sin(w) * sin(node) + cos(w) * cos(node) * cos(I)) * yp,
    sin(w) * sin(I) * xp + cos(w) * sin(I) * yp,
  ];
}

/**
 * Where a planet is as seen from Earth: ecliptic longitude/latitude (of date, degrees),
 * its distance from Earth and from the Sun (AU), and its brightness (magnitude: smaller
 * is brighter; Venus about -4, Jupiter about -2, Saturn about +1).
 */
export function planetEcliptic(name, date) {
  const p = helio(name, date);
  const g = helio('earth', date);
  const x = p[0] - g[0], y = p[1] - g[1], z = p[2] - g[2];
  const T = dJ2000(date) / 36525;
  const lon = norm360(Math.atan2(y, x) * DEG + 1.396971 * T); // + precession since J2000
  const lat = Math.atan2(z, Math.hypot(x, y)) * DEG;
  const delta = Math.hypot(x, y, z), r = Math.hypot(p[0], p[1], p[2]), R = Math.hypot(g[0], g[1], g[2]);
  // Phase angle (Sun-planet-Earth) and the simple magnitude formulas (Meeus, Astronomical
  // Algorithms ch. 41; Saturn without its rings, which are nearly edge-on in 2025-2027).
  const i = Math.acos(Math.max(-1, Math.min(1, (r * r + delta * delta - R * R) / (2 * r * delta)))) * DEG;
  const k = 5 * Math.log10(r * delta);
  const mag = {
    mercury: -0.42 + k + 0.0380 * i - 0.000273 * i * i + 0.000002 * i * i * i,
    venus: -4.40 + k + 0.0009 * i + 0.000239 * i * i - 0.00000065 * i * i * i,
    mars: -1.52 + k + 0.016 * i,
    jupiter: -9.40 + k + 0.005 * i,
    saturn: -8.88 + k,
  }[name];
  return { lon, lat, au: delta, sunAu: r, mag };
}

function planetAltAz(name, date, lat, lon) {
  const e = planetEcliptic(name, date);
  return altAz(eclToEq(e.lon, e.lat, date), date, lat, lon);
}

/** Angle between a planet (or the Moon) and the Sun, degrees: under ~15° it is lost in the glare. */
export function sunDistance(body, date) {
  const s = sunEcliptic(date);
  const b = body === 'moon' ? moonEcliptic(date) : planetEcliptic(body, date);
  return Math.acos(Math.max(-1, Math.min(1, cos(b.lat) * cos(b.lon - s.lon)))) * DEG;
}

/** Where a body is in the sky. body: 'sun' | 'moon' | planet name | {ra, dec} star/constellation */
export function position(body, date, lat, lon) {
  if (body === 'sun') { const s = sunEcliptic(date); return altAz(eclToEq(s.lon, 0, date), date, lat, lon); }
  if (body === 'moon') return moonAltAz(date, lat, lon);
  if (typeof body === 'string') return planetAltAz(body, date, lat, lon);
  return altAz(body, date, lat, lon);
}

// ---------------------------------------------------------------- Rising and setting
// The altitude of a body's middle at the moment it rises or sets (refraction lifts things
// about half a degree; the Sun and Moon also count from their top edge).
const HORIZON = { sun: -0.833, moon: -0.833 };
const horizonFor = (body) => (typeof body === 'string' && HORIZON[body] != null ? HORIZON[body] : -0.567);

/**
 * Every time between `from` and `to` when the body crosses altitude h (degrees), going up
 * (rise) or down (set): [{ t: Date, up: boolean }]. Scans every 10 minutes, then narrows
 * each crossing to a few seconds.
 */
export function crossings(body, from, to, lat, lon, h = horizonFor(body)) {
  const f = (ms) => position(body, new Date(ms), lat, lon).alt - h;
  const out = [];
  const STEPMS = 10 * 60000;
  let t0 = from.getTime(), f0 = f(t0);
  const end = to.getTime();
  while (t0 < end) {
    const t1 = Math.min(end, t0 + STEPMS), f1 = f(t1);
    if ((f0 < 0) !== (f1 < 0)) {
      let a = t0, b = t1, fa = f0;
      while (b - a > 5000) {
        const m = (a + b) / 2, fm = f(m);
        if ((fa < 0) === (fm < 0)) { a = m; fa = fm; } else b = m;
      }
      out.push({ t: new Date(Math.round((a + b) / 2)), up: f0 < 0 });
    }
    t0 = t1; f0 = f1;
  }
  return out;
}

/** Local midnight at the start of the calendar day that holds `date` (daylight saving safe). */
export const dayStart = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const nextDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);

/**
 * Rise, set and highest point of a body on the local calendar day that holds `date`.
 * { rise, set, transit, transitAlt, alwaysUp, neverUp } — rise/set are null when it
 * doesn't happen that day (the Moon skips one rise or set each month; near the poles the
 * Sun can stay up or down all day: then alwaysUp / neverUp says which).
 */
export function riseSet(body, date, lat, lon) {
  const a = dayStart(date), b = nextDay(date);
  const xs = crossings(body, a, b, lat, lon);
  const rise = xs.find((x) => x.up)?.t || null;
  const set = xs.find((x) => !x.up)?.t || null;
  // Highest point: the best 10-minute sample, then narrowed by golden-section search.
  let best = a.getTime(), bestAlt = -99;
  for (let t = a.getTime(); t <= b.getTime(); t += 10 * 60000) {
    const alt = position(body, new Date(t), lat, lon).alt;
    if (alt > bestAlt) { bestAlt = alt; best = t; }
  }
  let lo = Math.max(a.getTime(), best - 10 * 60000), hi = Math.min(b.getTime(), best + 10 * 60000);
  while (hi - lo > 5000) {
    const m1 = lo + (hi - lo) * 0.382, m2 = lo + (hi - lo) * 0.618;
    if (position(body, new Date(m1), lat, lon).alt > position(body, new Date(m2), lat, lon).alt) hi = m2; else lo = m1;
  }
  const transit = new Date(Math.round((lo + hi) / 2));
  const transitAlt = position(body, transit, lat, lon).alt;
  const h = horizonFor(body);
  const upAtStart = position(body, a, lat, lon).alt > h;
  return {
    rise, set, transit, transitAlt,
    alwaysUp: !xs.length && upAtStart,
    neverUp: !xs.length && !upAtStart,
  };
}

/** The next time after `from` (within `hours`) the body rises, and the next time it sets. */
export function nextRiseSet(body, from, lat, lon, hours = 30) {
  const xs = crossings(body, from, new Date(from.getTime() + hours * 3600000), lat, lon);
  return { rise: xs.find((x) => x.up)?.t || null, set: xs.find((x) => !x.up)?.t || null };
}

/**
 * The Sun's day and its twilights for the local calendar day holding `date`.
 * Each is a Date or null when it doesn't happen (summer nights far north never get dark):
 *   sunrise / sunset          the top edge of the Sun on the horizon
 *   civilDawn / civilDusk     Sun 6° down: too dark to read outside, bright planets show
 *   nauticalDusk              Sun 12° down: most stars are out
 *   darkStart / darkEnd       Sun 18° down: the sky is fully dark (astronomical twilight ends)
 */
export function sunTimes(date, lat, lon) {
  const a = dayStart(date), b = nextDay(date);
  const at = (h) => {
    const xs = crossings('sun', a, b, lat, lon, h);
    return { up: xs.find((x) => x.up)?.t || null, down: xs.find((x) => !x.up)?.t || null };
  };
  const r = at(-0.833), c = at(-6), n = at(-12), d = at(-18);
  return {
    sunrise: r.up, sunset: r.down,
    civilDawn: c.up, civilDusk: c.down,
    nauticalDawn: n.up, nauticalDusk: n.down,
    darkEnd: d.up, darkStart: d.down,
  };
}

// ---------------------------------------------------------------- Moon phases ahead
const PHASES = { new: 0, first: 90, full: 180, last: 270 };

/** When the Moon next reaches a phase ('new' | 'first' | 'full' | 'last') after `from`. */
export function nextMoonPhase(kind, from = new Date()) {
  const target = PHASES[kind];
  const off = (ms) => { const x = norm360(moonPhase(new Date(ms)).elongation - target); return x > 180 ? x - 360 : x; };
  let t0 = from.getTime(), f0 = off(t0);
  for (let k = 0; k < 4 * 32; k++) { // 6-hour steps, at most 32 days
    const t1 = t0 + 6 * 3600000, f1 = off(t1);
    if (f0 < 0 && f1 >= 0) { // crossing upwards (not the jump from +180 to -180)
      let a = t0, b = t1;
      while (b - a > 30000) { const m = (a + b) / 2; if (off(m) < 0) a = m; else b = m; }
      return new Date(Math.round((a + b) / 2));
    }
    t0 = t1; f0 = f1;
  }
  return null;
}

/** How high something is, in words a person can use: LOW, A THIRD UP, HALFWAY UP, HIGH, OVERHEAD. */
export function altWords(alt) {
  if (alt >= 75) return 'OVERHEAD';
  if (alt >= 55) return 'HIGH UP';
  if (alt >= 35) return 'HALFWAY UP';
  if (alt >= 18) return 'A THIRD UP';
  return 'LOW';
}

// Famous, easy-to-find star patterns: RA (degrees) / Dec of their middle, and a
// short "how to recognise it" hint for people who don't know the sky.
export const CONSTELLATIONS = [
  { name: 'ORION', ra: 83.8, dec: -1, hint: 'THREE STARS IN A ROW: HIS BELT' },
  { name: 'BIG DIPPER', ra: 178, dec: 55, hint: 'SEVEN STARS SHAPED LIKE A LADLE' },
  { name: 'CASSIOPEIA', ra: 15, dec: 60, hint: 'FIVE STARS MAKING A BIG W' },
  { name: 'PLEIADES', ra: 56.8, dec: 24.1, hint: 'A TINY, MISTY CLUMP OF STARS' },
  { name: 'SUMMER TRIANGLE', ra: 295, dec: 30, hint: 'THREE BRIGHT STARS, BIG TRIANGLE' },
  { name: 'SCORPIUS', ra: 253, dec: -30, hint: 'A HOOK OF STARS, RED STAR AT HEART' },
  { name: 'LEO', ra: 160, dec: 15, hint: 'A BACKWARDS QUESTION MARK' },
  { name: 'GEMINI', ra: 108, dec: 23, hint: 'TWO BRIGHT "TWIN" STARS SIDE BY SIDE' },
  { name: 'PEGASUS SQUARE', ra: 354, dec: 22, hint: 'A GIANT SQUARE OF FOUR STARS' },
];

// ---------------------------------------------------------------- ISS passes
const MU = 398600.4418; // km^3/s^2
const RE = 6378.137; // km
const J2 = 1.08262668e-3;
const F_WGS = 1 / 298.257223563;
const AU_KM = 149597870.7;

/** Builds a position function (ECI, km) from a CelesTrak OMM JSON record. */
export function makeOrbit(omm) {
  const epoch = new Date(omm.EPOCH.replace(/(\.\d{3})\d*/, '$1') + 'Z').getTime();
  const e = omm.ECCENTRICITY;
  const i = omm.INCLINATION * RAD;
  const n0 = omm.MEAN_MOTION; // rev/day
  const ndot = omm.MEAN_MOTION_DOT || 0; // (dn/dt)/2, rev/day^2
  return (date) => {
    const dt = (date.getTime() - epoch) / 86400000; // days
    const nRev = n0 + 2 * ndot * dt;
    const nRadS = (nRev * 2 * Math.PI) / 86400;
    const a = Math.cbrt(MU / (nRadS * nRadS));
    const p = a * (1 - e * e);
    const k = 1.5 * J2 * (RE / p) ** 2 * nRev * 2 * Math.PI; // rad/day
    const node = omm.RA_OF_ASC_NODE * RAD - k * Math.cos(i) * dt;
    const w = omm.ARG_OF_PERICENTER * RAD + k * (2 - 2.5 * Math.sin(i) ** 2) * dt;
    const revs = omm.MEAN_ANOMALY / 360 + n0 * dt + ndot * dt * dt;
    const E = solveKepler((revs % 1) * 2 * Math.PI, e);
    const xp = a * (Math.cos(E) - e);
    const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
    const cw = Math.cos(w), sw = Math.sin(w), cn = Math.cos(node), sn = Math.sin(node), ci = Math.cos(i), si = Math.sin(i);
    return [
      (cw * cn - sw * sn * ci) * xp + (-sw * cn - cw * sn * ci) * yp,
      (cw * sn + sw * cn * ci) * xp + (-sw * sn + cw * cn * ci) * yp,
      sw * si * xp + cw * si * yp,
    ];
  };
}

function lookAngles(sat, date, lat, lon) {
  const th = (gmst(date) + lon) * RAD;
  const C = 1 / Math.sqrt(1 + F_WGS * (F_WGS - 2) * sin(lat) ** 2);
  const S = (1 - F_WGS) ** 2 * C;
  const o = [RE * C * cos(lat) * Math.cos(th), RE * C * cos(lat) * Math.sin(th), RE * S * sin(lat)];
  const r = [sat[0] - o[0], sat[1] - o[1], sat[2] - o[2]];
  const s = sin(lat) * Math.cos(th) * r[0] + sin(lat) * Math.sin(th) * r[1] - cos(lat) * r[2];
  const ea = -Math.sin(th) * r[0] + Math.cos(th) * r[1];
  const z = cos(lat) * Math.cos(th) * r[0] + cos(lat) * Math.sin(th) * r[1] + sin(lat) * r[2];
  const range = Math.hypot(...r);
  return { alt: Math.asin(z / range) * DEG, az: norm360(Math.atan2(ea, -s) * DEG), range };
}

function sunlit(sat, date) {
  const s = sunEcliptic(date), e = obliquity(date);
  const v = [cos(s.lon), cos(e) * sin(s.lon), sin(e) * sin(s.lon)]; // unit vector to Sun
  const proj = sat[0] * v[0] + sat[1] * v[1] + sat[2] * v[2];
  if (proj > 0) return true;
  const perp = Math.hypot(sat[0] - proj * v[0], sat[1] - proj * v[1], sat[2] - proj * v[2]);
  return perp > RE; // outside Earth's (cylindrical) shadow
}

/**
 * Visible ISS passes: ISS above 10°, lit by the Sun, while the sky is dark
 * (Sun below -6°). Returns [{start, end, maxAlt, maxAz, startAz, endAz, minRange, path:[{alt,az,range}]}]
 * (minRange: the closest it comes while visible, km; closer = brighter).
 */
export function issPasses(omm, lat, lon, from = new Date(), hours = 72, stepSec = 30) {
  const pos = makeOrbit(omm);
  const passes = [];
  let cur = null;
  const steps = (hours * 3600) / stepSec;
  for (let k = 0; k <= steps; k++) {
    const t = new Date(from.getTime() + k * stepSec * 1000);
    const sat = pos(t);
    const la = lookAngles(sat, t, lat, lon);
    const visible = la.alt > 10 && sunlit(sat, t) && sunAlt(t, lat, lon) < -6;
    if (visible) {
      if (!cur) cur = { start: t, path: [], maxAlt: 0, maxAz: la.az, startAz: la.az, minRange: la.range };
      cur.end = t; cur.endAz = la.az;
      if (la.alt > cur.maxAlt) { cur.maxAlt = la.alt; cur.maxAz = la.az; }
      cur.minRange = Math.min(cur.minRange, la.range);
      cur.path.push(la);
    } else if (cur) {
      if (cur.end - cur.start >= 60000) passes.push(cur);
      cur = null;
    }
  }
  if (cur && cur.end - cur.start >= 60000) passes.push(cur);
  return passes;
}

// ---------------------------------------------------------------- Words
const POINTS = ['NORTH', 'NORTHEAST', 'EAST', 'SOUTHEAST', 'SOUTH', 'SOUTHWEST', 'WEST', 'NORTHWEST'];
const SHORT = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export const compass = (az, short = false) => (short ? SHORT : POINTS)[Math.round(norm360(az) / 45) % 8];
