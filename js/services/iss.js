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
    const res = await fetch('https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=json', { signal: AbortSignal.timeout(7000) });
    if (!res.ok) throw new Error('celestrak');
    const [o] = await res.json();
    return {
      epoch: Date.parse(o.EPOCH + 'Z'), n: o.MEAN_MOTION, ndot: o.MEAN_MOTION_DOT || 0, e: o.ECCENTRICITY,
      i: o.INCLINATION, raan: o.RA_OF_ASC_NODE, argp: o.ARG_OF_PERICENTER, M: o.MEAN_ANOMALY,
    };
  } catch {
    const res = await fetch('https://api.wheretheiss.at/v1/satellites/25544/tles', { signal: AbortSignal.timeout(7000) });
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

const readJSON = (key) => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } };
const writeJSON = (key, v) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage off or full */ } };

// The station is slowed by the thin air up there and fired back up now and then, so an
// orbit more than ~10 days old can put a pass minutes out, or show one that won't happen.
const TOO_OLD_MS = 10 * 86400000;

let fetching = null; // one network fetch at a time, shared by every screen asking

function refreshElements() {
  if (!fetching) {
    fetching = fetchElements().then((el) => {
      if (!(el.n > 14 && el.n < 17) || !Number.isFinite(el.epoch)) throw new Error('bad elements');
      writeJSON(TLE_KEY, { at: Date.now(), el });
      return el;
    }).finally(() => { fetching = null; });
  }
  return fetching;
}

export async function getElements() {
  const cached = readJSON(TLE_KEY);
  const age = cached && cached.el && cached.el.n ? Date.now() - cached.at : Infinity;
  if (age < TLE_MAX_AGE) return cached.el;
  // A copy up to 3 days old is still good to about a minute: use it straight away and
  // fetch a fresh one in the background, instead of keeping the screen waiting (the
  // two sources can take 20 seconds to give up when the internet is down).
  if (age < 3 * 86400000) {
    refreshElements().catch(() => {});
    return cached.el;
  }
  try {
    return await refreshElements();
  } catch {
    return cached?.el || FALLBACK;
  }
}

/** Can pass times be trusted? { ok, ageDays } — ok is false when the newest orbit we have is too old. */
export async function orbitStatus() {
  const el = await getElements();
  const age = Date.now() - el.epoch;
  return { ok: age < TOO_OLD_MS, ageDays: Math.max(0, Math.floor(age / 86400000)) };
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

// A glimpse shorter than this (the station slipping into Earth's shadow just above the
// trees, say) isn't worth going outside for, so it doesn't count as a visible pass.
const MIN_VISIBLE_MS = 60000;

// All passes above 10° over the next `hours`. Each: { start, end, maxEl, startAz, endAz,
// visible, visStart, visEnd, visAz, visMaxEl, visMaxAz, visEndAz, visRange }  (times in ms;
// visRange = the closest it comes while visible, km — closer means brighter)
export function predictPasses(el, loc, { from = Date.now(), hours = 48, step = 20 } = {}) {
  const obs = observer(loc.lat, loc.lon);
  const passes = [];
  let cur = null;
  const finish = (p) => {
    if (p.visible && p.visEnd - p.visStart < MIN_VISIBLE_MS) {
      Object.assign(p, { visible: false, visStart: null, visEnd: null, visAz: null, visMaxEl: 0, visMaxAz: null, visEndAz: null, visRange: null });
    }
    passes.push(p);
  };
  for (let t = from; t <= from + hours * 3600000; t += step * 1000) {
    const s = sky(el, obs, t);
    if (s.el >= 10) {
      if (!cur) cur = { start: t, startAz: s.az, maxEl: 0, visible: false, visStart: null, visEnd: null, visAz: null, visMaxEl: 0, visMaxAz: null, visEndAz: null, visRange: null };
      cur.end = t; cur.endAz = s.az;
      if (s.el > cur.maxEl) { cur.maxEl = s.el; cur.maxAz = s.az; }
      if (s.visible) {
        cur.visible = true;
        if (!cur.visStart) { cur.visStart = t; cur.visAz = s.az; }
        cur.visEnd = t; cur.visEndAz = s.az;
        if (s.el > cur.visMaxEl) { cur.visMaxEl = s.el; cur.visMaxAz = s.az; }
        cur.visRange = Math.min(cur.visRange || Infinity, s.range);
      }
    } else if (cur) {
      finish(cur); cur = null;
    }
  }
  if (cur) finish(cur);
  return passes;
}

/**
 * How bright a visible pass looks, in plain words, from how close the station comes
 * while sunlit: overhead it is ~420 km away and among the brightest things in the sky; low
 * down it is 1,500+ km away and several times fainter.
 */
export function brightnessWords(p) {
  const km = p.visRange || 1500;
  return km < 700 ? 'VERY BRIGHT' : km < 1100 ? 'BRIGHT' : 'FAINTER, LOW DOWN';
}

// Passes worked out from an orbit too old to trust are not shown at all (empty list):
// better no time than a wrong one that sends someone out into the cold.
export async function getPasses(loc, opts) {
  const el = await getElements();
  const from = (opts && opts.from) || Date.now();
  if (from - el.epoch > TOO_OLD_MS) return [];
  return predictPasses(el, loc, opts);
}

// The predictions take a moment on the slow chip and several screens ask for the same
// thing, so the last answer is kept for 10 minutes (per place and look-ahead).
let passMemo = null;

// Next pass you can actually see with your eyes (or null), looking `hours` ahead.
export async function nextVisiblePass(loc, hours = 48) {
  return (await visiblePasses(loc, hours))[0] || null;
}

/** Every visible pass still to come (or under way) in the next `hours`, soonest first. */
export async function visiblePasses(loc, hours = 48) {
  const key = `${loc.lat.toFixed(3)},${loc.lon.toFixed(3)},${hours}`;
  let list;
  if (passMemo && passMemo.key === key && Date.now() - passMemo.at < 10 * 60000) list = passMemo.list;
  else {
    const all = await getPasses(loc, { from: Date.now() - 10 * 60000, hours });
    list = all.filter((p) => p.visible);
    passMemo = { key, at: Date.now(), list };
  }
  return list.filter((p) => p.visEnd > Date.now());
}

export async function getCrew() {
  const cached = readJSON(CREW_KEY);
  if (cached && Date.now() - cached.at < 24 * 3600 * 1000 && cached.names) return cached;
  try {
    const res = await fetch('https://corquaid.github.io/international-space-station-APIs/JSON/people-in-space.json', { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error('crew');
    const d = await res.json();
    const aboard = (d.people || []).filter((p) => p.iss);
    // names: who is up there right now, for the screens that have room to say so.
    const out = { at: Date.now(), total: d.number, onIss: aboard.length, names: aboard.map((p) => String(p.name || '')).filter(Boolean) };
    writeJSON(CREW_KEY, out);
    return out;
  } catch {
    return cached || { total: null, onIss: null, names: [] };
  }
}
