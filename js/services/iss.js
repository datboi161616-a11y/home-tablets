// Space Station passes over the house, worked out on the tablet.
//
// Orbit elements come from CelesTrak (fallback: wheretheiss.at); both are free,
// keyless and CORS-enabled. We propagate the orbit ourselves (two-body + J2
// drift — good to within a minute or so over the next two days), and call a pass
// "visible" when the station is sunlit, at least 10° up, and the sky at the house
// is dark (sun below -6°). Crew count comes from corquaid's people-in-space JSON.

const TLE_KEY = 'iss.elements.v1';
const CREW_KEY = 'iss.crew.v1';
const TLE_MAX_AGE = 12 * 3600 * 1000;

const MU = 398600.4418, RE = 6378.137, J2 = 1.08262668e-3, AU = 149597870.7;
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

// Last-resort elements (Nov 17 2026) if both sources are unreachable.
const FALLBACK = { epoch: Date.UTC(2026, 10, 17, 8, 1, 45), n: 15.4943095, ndot: 0.00009012, e: 0.0007381, i: 51.6318, raan: 262.2236, argp: 35.3953, M: 324.7525 };

function tleEpoch(yyddd) {
  const yy = Math.floor(yyddd / 1000);
  const day = yyddd - yy * 1000;
  return Date.UTC(yy < 57 ? 2000 + yy : 1900 + yy, 0, 1) + (day - 1) * 86400000;
}

async function fetchElements() {
  try {
    const res = await fetch('https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=json', { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error('celestrak');
    const [o] = await res.json();
    return {
      epoch: Date.parse(o.EPOCH + 'Z'), n: o.MEAN_MOTION, ndot: o.MEAN_MOTION_DOT || 0, e: o.ECCENTRICITY,
      i: o.INCLINATION, raan: o.RA_OF_ASC_NODE, argp: o.ARG_OF_PERICENTER, M: o.MEAN_ANOMALY,
    };
  } catch {
    const res = await fetch('https://api.wheretheiss.at/v1/satellites/25544/tles', { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error('tle');
    const { line1, line2 } = await res.json();
    return {
      epoch: tleEpoch(parseFloat(line1.slice(18, 32))), n: parseFloat(line2.slice(52, 63)),
      ndot: parseFloat(line1.slice(33, 43)), e: parseFloat('0.' + line2.slice(26, 33).trim()),
      i: parseFloat(line2.slice(8, 16)), raan: parseFloat(line2.slice(17, 25)),
      argp: parseFloat(line2.slice(34, 42)), M: parseFloat(line2.slice(43, 51)),
    };
  }
}

export async function getElements() {
  const cached = JSON.parse(localStorage.getItem(TLE_KEY) || 'null');
  if (cached && Date.now() - cached.at < TLE_MAX_AGE) return cached.el;
  try {
    const el = await fetchElements();
    localStorage.setItem(TLE_KEY, JSON.stringify({ at: Date.now(), el }));
    return el;
  } catch {
    return cached?.el || FALLBACK;
  }
}

// ---------- orbit maths ----------
const gmst = (t) => rad((280.46061837 + 360.98564736629 * (t / 86400000 + 2440587.5 - 2451545.0)) % 360);

// Station position, Earth-centred inertial (km)
function satECI(el, t) {
  const dtDays = (t - el.epoch) / 86400000;
  const n = (el.n * 2 * Math.PI) / 86400; // rad/s
  const a = Math.cbrt(MU / (n * n));
  const p = a * (1 - el.e * el.e);
  const i = rad(el.i);
  const k = n * J2 * (RE / p) ** 2 * 86400; // rad/day
  const raan = rad(el.raan) - 1.5 * k * Math.cos(i) * dtDays;
  const argp = rad(el.argp) + 0.75 * k * (5 * Math.cos(i) ** 2 - 1) * dtDays;
  const M = rad(el.M) + 2 * Math.PI * (el.n * dtDays + el.ndot * dtDays * dtDays);
  let E = M;
  for (let j = 0; j < 6; j++) E = E - (E - el.e * Math.sin(E) - M) / (1 - el.e * Math.cos(E));
  const nu = 2 * Math.atan2(Math.sqrt(1 + el.e) * Math.sin(E / 2), Math.sqrt(1 - el.e) * Math.cos(E / 2));
  const r = a * (1 - el.e * Math.cos(E));
  const u = argp + nu;
  const cO = Math.cos(raan), sO = Math.sin(raan), cu = Math.cos(u), su = Math.sin(u), ci = Math.cos(i), si = Math.sin(i);
  return [r * (cO * cu - sO * su * ci), r * (sO * cu + cO * su * ci), r * su * si];
}

function sunECI(t) {
  const n = t / 86400000 + 2440587.5 - 2451545.0;
  const L = rad(280.46 + 0.9856474 * n);
  const g = rad(357.528 + 0.9856003 * n);
  const lam = L + rad(1.915) * Math.sin(g) + rad(0.02) * Math.sin(2 * g);
  const eps = rad(23.439 - 0.0000004 * n);
  return [Math.cos(lam), Math.cos(eps) * Math.sin(lam), Math.sin(eps) * Math.sin(lam)];
}

const toECEF = ([x, y, z], th) => [x * Math.cos(th) + y * Math.sin(th), -x * Math.sin(th) + y * Math.cos(th), z];

function observer(lat, lon) {
  const f = 1 / 298.257223563, e2 = f * (2 - f);
  const phi = rad(lat), lam = rad(lon);
  const N = RE / Math.sqrt(1 - e2 * Math.sin(phi) ** 2);
  return { phi, lam, pos: [N * Math.cos(phi) * Math.cos(lam), N * Math.cos(phi) * Math.sin(lam), N * (1 - e2) * Math.sin(phi)] };
}

function lookAngles(obs, v) {
  const [rx, ry, rz] = [v[0] - obs.pos[0], v[1] - obs.pos[1], v[2] - obs.pos[2]];
  const { phi, lam } = obs;
  const s = Math.sin(phi) * Math.cos(lam) * rx + Math.sin(phi) * Math.sin(lam) * ry - Math.cos(phi) * rz;
  const e = -Math.sin(lam) * rx + Math.cos(lam) * ry;
  const z = Math.cos(phi) * Math.cos(lam) * rx + Math.cos(phi) * Math.sin(lam) * ry + Math.sin(phi) * rz;
  const range = Math.hypot(rx, ry, rz);
  return { el: deg(Math.asin(z / range)), az: (deg(Math.atan2(e, -s)) + 360) % 360, range };
}

export function sky(el, obs, t) {
  const th = gmst(t);
  const sat = satECI(el, t);
  const sun = sunECI(t);
  const look = lookAngles(obs, toECEF(sat, th));
  const sunE = toECEF(sun, th).map((c) => c * AU);
  const sunEl = lookAngles(obs, sunE).el;
  const proj = sat[0] * sun[0] + sat[1] * sun[1] + sat[2] * sun[2];
  const perp = Math.hypot(sat[0] - proj * sun[0], sat[1] - proj * sun[1], sat[2] - proj * sun[2]);
  const sunlit = proj > 0 || perp > RE;
  return { ...look, sunEl, sunlit, visible: look.el >= 10 && sunlit && sunEl < -6 };
}

// All passes above 10° over the next `hours`. Each: { start, end, maxEl, startAz, endAz,
// visible, visStart, visEnd, visAz, visMaxEl }  (times in ms)
export function predictPasses(el, loc, { from = Date.now(), hours = 48, step = 20 } = {}) {
  const obs = observer(loc.lat, loc.lon);
  const passes = [];
  let cur = null;
  for (let t = from; t <= from + hours * 3600000; t += step * 1000) {
    const s = sky(el, obs, t);
    if (s.el >= 10) {
      if (!cur) cur = { start: t, startAz: s.az, maxEl: 0, visible: false, visStart: null, visEnd: null, visAz: null, visMaxEl: 0 };
      cur.end = t; cur.endAz = s.az;
      if (s.el > cur.maxEl) { cur.maxEl = s.el; cur.maxAz = s.az; }
      if (s.visible) {
        cur.visible = true;
        if (!cur.visStart) { cur.visStart = t; cur.visAz = s.az; }
        cur.visEnd = t;
        cur.visMaxEl = Math.max(cur.visMaxEl, s.el);
      }
    } else if (cur) {
      passes.push(cur); cur = null;
    }
  }
  if (cur) passes.push(cur);
  return passes;
}

export async function getPasses(loc, opts) {
  const el = await getElements();
  return predictPasses(el, loc, opts);
}

// Next pass you can actually see with your eyes (or null)
export async function nextVisiblePass(loc) {
  const passes = await getPasses(loc, { from: Date.now() - 10 * 60000 });
  return passes.find((p) => p.visible && p.visEnd > Date.now()) || null;
}

export async function getCrew() {
  const cached = JSON.parse(localStorage.getItem(CREW_KEY) || 'null');
  if (cached && Date.now() - cached.at < 24 * 3600 * 1000) return cached;
  try {
    const res = await fetch('https://corquaid.github.io/international-space-station-APIs/JSON/people-in-space.json', { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error('crew');
    const d = await res.json();
    const out = { at: Date.now(), total: d.number, onIss: (d.people || []).filter((p) => p.iss).length };
    localStorage.setItem(CREW_KEY, JSON.stringify(out));
    return out;
  } catch {
    return cached || { total: null, onIss: null };
  }
}
