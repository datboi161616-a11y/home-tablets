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

function planetAltAz(name, date, lat, lon) {
  const p = helio(name, date);
  const g = helio('earth', date);
  const x = p[0] - g[0], y = p[1] - g[1], z = p[2] - g[2];
  const T = dJ2000(date) / 36525;
  const elon = Math.atan2(y, x) * DEG + 1.396971 * T; // + precession since J2000
  const elat = Math.atan2(z, Math.hypot(x, y)) * DEG;
  return altAz(eclToEq(elon, elat, date), date, lat, lon);
}

/** Where a body is in the sky. body: 'sun' | 'moon' | planet name | {ra, dec} star/constellation */
export function position(body, date, lat, lon) {
  if (body === 'sun') { const s = sunEcliptic(date); return altAz(eclToEq(s.lon, 0, date), date, lat, lon); }
  if (body === 'moon') return moonAltAz(date, lat, lon);
  if (typeof body === 'string') return planetAltAz(body, date, lat, lon);
  return altAz(body, date, lat, lon);
}

// Famous, easy-to-find star patterns: RA (degrees) / Dec of their middle.
export const CONSTELLATIONS = [
  { name: 'ORION', ra: 83.8, dec: -1 },
  { name: 'BIG DIPPER', ra: 178, dec: 55 },
  { name: 'CASSIOPEIA', ra: 15, dec: 60 },
  { name: 'PLEIADES', ra: 56.8, dec: 24.1 },
  { name: 'SUMMER TRIANGLE', ra: 295, dec: 30 },
  { name: 'SCORPIUS', ra: 253, dec: -30 },
  { name: 'LEO', ra: 160, dec: 15 },
  { name: 'GEMINI', ra: 108, dec: 23 },
  { name: 'PEGASUS SQUARE', ra: 354, dec: 22 },
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
  return { alt: Math.asin(z / Math.hypot(...r)) * DEG, az: norm360(Math.atan2(ea, -s) * DEG) };
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
 * (Sun below -6°). Returns [{start, end, maxAlt, startAz, endAz, path:[{alt,az}]}].
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
      if (!cur) cur = { start: t, path: [], maxAlt: 0, startAz: la.az };
      cur.end = t; cur.endAz = la.az;
      cur.maxAlt = Math.max(cur.maxAlt, la.alt);
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
