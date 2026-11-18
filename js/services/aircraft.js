// Live aircraft near the house (Tom's flight deck).
//
// Sources, tried in order — all free, no API key:
//   1. adsb.lol      https://api.adsb.lol/v2/point/{lat}/{lon}/{nm}
//   2. adsb.fi       https://opendata.adsb.fi/api/v2/lat/{lat}/lon/{lon}/dist/{nm}
//   3. the same two through a CORS proxy, if one is configured (see below)
//   4. sample data (flagged `sample: true`) so the screens are never empty.
//
// NOTE: as of Nov 2026 neither ADS-B feed sends Access-Control-Allow-Origin,
// so a normal browser blocks steps 1-2. To get live planes, run any tiny
// pass-through proxy (e.g. a Cloudflare Worker) and store its prefix once on
// the tablet:  localStorage.setItem('aircraft.proxy', 'https://my-proxy.example/?url=')
// The target URL is appended URL-encoded.
//
// Flight routes (origin/destination) come from adsbdb.com, which does send CORS.

const CACHE_KEY = 'aircraft.v1';
const ROUTE_KEY = 'aircraft.routes.v1';
const MAX_AGE = 60 * 1000;           // adsb.lol allows ~500 requests/day per IP
const ROUTE_MAX_AGE = 3 * 24 * 3600 * 1000;
export const RADIUS_NM = 22;         // ≈ 25 statute miles
const NM_PER_DEG = 60;

// ---------- names ----------
const AIRLINES = {
  AAL: ['AA', 'AMERICAN'], DAL: ['DL', 'DELTA'], UAL: ['UA', 'UNITED'], SWA: ['WN', 'SOUTHWEST'],
  JBU: ['B6', 'JETBLUE'], ASA: ['AS', 'ALASKA'], NKS: ['NK', 'SPIRIT'], FFT: ['F9', 'FRONTIER'],
  AAY: ['G4', 'ALLEGIANT'], HAL: ['HA', 'HAWAIIAN'], SKW: ['OO', 'SKYWEST'], RPA: ['YX', 'REPUBLIC'],
  ENY: ['MQ', 'ENVOY'], EDV: ['9E', 'ENDEAVOR'], JIA: ['OH', 'PSA'], PDT: ['PT', 'PIEDMONT'],
  ASH: ['YV', 'MESA'], GJS: ['G7', 'GOJET'], AWI: ['ZW', 'AIR WISCONSIN'], MXY: ['MX', 'BREEZE'],
  SCX: ['SY', 'SUN COUNTRY'], FDX: ['FX', 'FEDEX CARGO'], UPS: ['5X', 'UPS CARGO'], GTI: ['5Y', 'ATLAS AIR'],
  ACA: ['AC', 'AIR CANADA'], JZA: ['QK', 'AIR CANADA JAZZ'], WJA: ['WS', 'WESTJET'], BAW: ['BA', 'BRITISH AIRWAYS'],
  VIR: ['VS', 'VIRGIN ATLANTIC'], DLH: ['LH', 'LUFTHANSA'], AFR: ['AF', 'AIR FRANCE'], KLM: ['KL', 'KLM'],
  IBE: ['IB', 'IBERIA'], EIN: ['EI', 'AER LINGUS'], UAE: ['EK', 'EMIRATES'], QTR: ['QR', 'QATAR'],
  ETD: ['EY', 'ETIHAD'], THY: ['TK', 'TURKISH'], ELY: ['LY', 'EL AL'], SWR: ['LX', 'SWISS'],
  AMX: ['AM', 'AEROMEXICO'], VOI: ['Y4', 'VOLARIS'], CMP: ['CM', 'COPA'], AVA: ['AV', 'AVIANCA'],
  JAL: ['JL', 'JAPAN AIRLINES'], ANA: ['NH', 'ALL NIPPON'], KAL: ['KE', 'KOREAN AIR'], CPA: ['CX', 'CATHAY PACIFIC'],
  QFA: ['QF', 'QANTAS'], SIA: ['SQ', 'SINGAPORE'], EJA: ['', 'NETJETS'], LXJ: ['', 'FLEXJET'],
  RCH: ['', 'US AIR FORCE'], CNV: ['', 'US NAVY'], PAT: ['', 'US ARMY'], SAM: ['', 'US AIR FORCE'],
};

const TYPES = {
  A19N: 'AIRBUS A319NEO', A20N: 'AIRBUS A320NEO', A21N: 'AIRBUS A321NEO', A318: 'AIRBUS A318',
  A319: 'AIRBUS A319', A320: 'AIRBUS A320', A321: 'AIRBUS A321', A332: 'AIRBUS A330-200',
  A333: 'AIRBUS A330-300', A339: 'AIRBUS A330-900', A343: 'AIRBUS A340-300', A359: 'AIRBUS A350-900',
  A35K: 'AIRBUS A350-1000', A388: 'AIRBUS A380', BCS1: 'AIRBUS A220-100', BCS3: 'AIRBUS A220-300',
  B712: 'BOEING 717', B737: 'BOEING 737-700', B738: 'BOEING 737-800', B739: 'BOEING 737-900',
  B37M: 'BOEING 737 MAX 7', B38M: 'BOEING 737 MAX 8', B39M: 'BOEING 737 MAX 9', B3XM: 'BOEING 737 MAX 10',
  B744: 'BOEING 747-400', B748: 'BOEING 747-8', B74F: 'BOEING 747 FREIGHTER', B752: 'BOEING 757-200',
  B753: 'BOEING 757-300', B762: 'BOEING 767-200', B763: 'BOEING 767-300', B764: 'BOEING 767-400',
  B772: 'BOEING 777-200', B77L: 'BOEING 777-200LR', B77W: 'BOEING 777-300ER', B778: 'BOEING 777-8',
  B788: 'BOEING 787-8', B789: 'BOEING 787-9', B78X: 'BOEING 787-10', MD11: 'MD-11',
  CRJ2: 'BOMBARDIER CRJ200', CRJ7: 'BOMBARDIER CRJ700', CRJ9: 'BOMBARDIER CRJ900', CRJX: 'BOMBARDIER CRJ1000',
  E135: 'EMBRAER ERJ-135', E145: 'EMBRAER ERJ-145', E170: 'EMBRAER 170', E75L: 'EMBRAER 175',
  E75S: 'EMBRAER 175', E190: 'EMBRAER 190', E195: 'EMBRAER 195', E290: 'EMBRAER E190-E2',
  DH8D: 'DASH 8-400', AT76: 'ATR 72-600', AT75: 'ATR 72-500', C172: 'CESSNA 172', C152: 'CESSNA 152',
  C182: 'CESSNA 182', C208: 'CESSNA CARAVAN', P28A: 'PIPER CHEROKEE', PA28: 'PIPER CHEROKEE', SR22: 'CIRRUS SR22',
  SR20: 'CIRRUS SR20', BE36: 'BEECH BONANZA', PC12: 'PILATUS PC-12', C25B: 'CESSNA CITATION CJ3',
  C68A: 'CESSNA CITATION LATITUDE', C700: 'CESSNA CITATION LONGITUDE', C750: 'CESSNA CITATION X',
  E55P: 'EMBRAER PHENOM 300', E545: 'EMBRAER LEGACY 450', GLF4: 'GULFSTREAM IV', GLF5: 'GULFSTREAM V',
  GLF6: 'GULFSTREAM G650', GLEX: 'BOMBARDIER GLOBAL EXPRESS', GL5T: 'BOMBARDIER GLOBAL 5000',
  CL30: 'BOMBARDIER CHALLENGER 300', G280: 'GULFSTREAM G280', BE40: 'BEECHJET 400', R44: 'ROBINSON R44 HELICOPTER',
  R22: 'ROBINSON R22 HELICOPTER', B407: 'BELL 407 HELICOPTER', EC35: 'AIRBUS H135 HELICOPTER',
  S76: 'SIKORSKY S-76 HELICOPTER', H60: 'BLACK HAWK HELICOPTER', GA7: 'GRUMMAN COUGAR',
  C17: 'C-17 GLOBEMASTER', C130: 'C-130 HERCULES', C30J: 'C-130J SUPER HERCULES', C5M: 'C-5 GALAXY',
  K35R: 'KC-135 STRATOTANKER', KC46: 'KC-46 PEGASUS', E3TF: 'E-3 AWACS', B52: 'B-52 STRATOFORTRESS',
  VC25: 'AIR FORCE ONE (VC-25)', C32: 'C-32 (AIR FORCE TWO)', P8: 'P-8 POSEIDON', V22: 'V-22 OSPREY',
  BLCF: '747 DREAMLIFTER', A3ST: 'AIRBUS BELUGA', A124: 'ANTONOV AN-124', CONC: 'CONCORDE',
  F900: 'DASSAULT FALCON 900', F2TH: 'DASSAULT FALCON 2000', FA7X: 'DASSAULT FALCON 7X', FA8X: 'DASSAULT FALCON 8X',
  H25B: 'HAWKER 800', LJ45: 'LEARJET 45', LJ60: 'LEARJET 60', C56X: 'CESSNA CITATION EXCEL', C560: 'CESSNA CITATION V',
  C510: 'CESSNA CITATION MUSTANG', C525: 'CESSNA CITATIONJET', PC24: 'PILATUS PC-24', BE20: 'BEECH KING AIR 200',
  B350: 'BEECH KING AIR 350', BE9L: 'BEECH KING AIR 90', DA40: 'DIAMOND DA40', DA42: 'DIAMOND TWIN STAR', PA32: 'PIPER SARATOGA',
  PA34: 'PIPER SENECA', P28R: 'PIPER ARROW', PA46: 'PIPER MALIBU', C206: 'CESSNA 206', C210: 'CESSNA 210', TBM9: 'DAHER TBM 900',
  AS50: 'AIRBUS H125 HELICOPTER', EC45: 'AIRBUS H145 HELICOPTER', A139: 'LEONARDO AW139 HELICOPTER', B06: 'BELL 206 HELICOPTER',
  B429: 'BELL 429 HELICOPTER', S92: 'SIKORSKY S-92 HELICOPTER', MD11F: 'MD-11 FREIGHTER', A306: 'AIRBUS A300', A30B: 'AIRBUS A300',
  P51: 'P-51 MUSTANG', B17: 'B-17 FLYING FORTRESS', B25: 'B-25 MITCHELL', SPIT: 'SPITFIRE', DC3: 'DOUGLAS DC-3',
};

// Types worth running outside for. Short label is what the alert shows in huge type.
export const RARE = {
  B52: 'B-52', A388: 'A380', VC25: 'AF ONE', C5M: 'C-5', BLCF: 'DREAMLIFTER', A3ST: 'BELUGA',
  A124: 'AN-124', E3TF: 'AWACS', V22: 'OSPREY', CONC: 'CONCORDE', P51: 'P-51', B17: 'B-17',
  B25: 'B-25', SPIT: 'SPITFIRE', B748: '747-8', B744: '747', U2: 'U-2', C17: 'C-17',
};

export function airlineOf(ac) {
  return AIRLINES[(ac.callsign || '').slice(0, 3)]?.[1] || (ac.military ? 'MILITARY' : '');
}

export function typeName(ac) {
  return (ac.desc || TYPES[ac.type] || ac.type || 'UNKNOWN TYPE').toUpperCase();
}

// "DAL1423" -> "DL 1423"; tail numbers and unknown codes are left alone.
export function flightLabel(ac, route) {
  if (route?.flight) return route.flight;
  const cs = (ac.callsign || '').trim();
  const m = cs.match(/^([A-Z]{3})(\d[0-9A-Z]*)$/);
  if (m && AIRLINES[m[1]]?.[0]) return `${AIRLINES[m[1]][0]} ${m[2]}`;
  if (m) return `${m[1]} ${m[2]}`;
  return cs || ac.reg || ac.hex.toUpperCase();
}

export const fmtAlt = (ac) => (ac.onGround ? 'ON GROUND' : `${Math.max(0, Math.round(ac.alt / 100) * 100)}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' FT');
export const fmtSpd = (ac) => `${Math.round(ac.gs * 1.15078)} MPH`;

// ---------- geometry ----------
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

export function distBearing(from, lat, lon) {
  const dLat = rad(lat - from.lat), dLon = rad(lon - from.lon);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(from.lat)) * Math.cos(rad(lat)) * Math.sin(dLon / 2) ** 2;
  const dst = 2 * Math.asin(Math.sqrt(a)) * deg(1) * NM_PER_DEG;
  const y = Math.sin(dLon) * Math.cos(rad(lat));
  const x = Math.cos(rad(from.lat)) * Math.sin(rad(lat)) - Math.sin(rad(from.lat)) * Math.cos(rad(lat)) * Math.cos(dLon);
  return { dst, dir: (deg(Math.atan2(y, x)) + 360) % 360 };
}

// Move a plane along its track (dead reckoning) so the radar glides between polls.
export function advance(ac, home, seconds) {
  if (ac.onGround || !ac.gs) return ac;
  const d = (ac.gs * seconds) / 3600 / NM_PER_DEG; // degrees of arc
  const lat = ac.lat + d * Math.cos(rad(ac.track));
  const lon = ac.lon + (d * Math.sin(rad(ac.track))) / Math.cos(rad(ac.lat));
  return { ...ac, lat, lon, ...distBearing(home, lat, lon) };
}

export const COMPASS = ['NORTH', 'NORTHEAST', 'EAST', 'SOUTHEAST', 'SOUTH', 'SOUTHWEST', 'WEST', 'NORTHWEST'];
export const compass = (az) => COMPASS[Math.round((((az % 360) + 360) % 360) / 45) % 8];
const SHORT = { NORTH: "N", NORTHEAST: "NE", EAST: "E", SOUTHEAST: "SE", SOUTH: "S", SOUTHWEST: "SW", WEST: "W", NORTHWEST: "NW" };
export const compassShort = (az) => SHORT[compass(az)];

// Distance from the house in everyday miles (feed distances are nautical miles).
export const fmtMiles = (nm) => { const mi = nm * 1.15078; return mi < 1 ? "UNDER 1 MI" : `${Math.round(mi)} MI`; };

// "↑" climbing, "↓" descending, "" level (vertical rate in ft/min).
export const trend = (ac) => (ac.onGround ? "" : ac.vrate > 300 ? "↑" : ac.vrate < -300 ? "↓" : "");
export const trendWord = (ac) => (ac.onGround ? "ON THE GROUND" : ac.vrate > 300 ? "CLIMBING" : ac.vrate < -300 ? "DESCENDING" : "FLYING LEVEL");

// ---------- fetching ----------
function normalize(a, home) {
  if (a.lat == null || a.lon == null) return null;
  const onGround = a.alt_baro === 'ground';
  const ac = {
    hex: a.hex,
    callsign: (a.flight || '').trim(),
    reg: a.r || '',
    type: a.t || '',
    desc: a.desc || '',
    alt: onGround ? 0 : Number(a.alt_baro ?? a.alt_geom ?? 0),
    onGround,
    gs: Number(a.gs || 0),
    track: Number(a.track ?? a.true_heading ?? 0),
    vrate: Number(a.baro_rate ?? a.geom_rate ?? 0),
    lat: a.lat, lon: a.lon,
    military: !!(a.dbFlags & 1),
    interesting: !!(a.dbFlags & 2),
  };
  return { ...ac, ...distBearing(home, ac.lat, ac.lon) };
}

// On the tablets, the Android launcher app exposes window.TabletNative, which can
// fetch the aircraft feeds directly (apps aren't subject to browser CORS rules).
function nativeFetch(url) {
  return new Promise((resolve, reject) => {
    const id = `nf${Date.now()}${Math.random().toString(36).slice(2)}`;
    const timer = setTimeout(() => { delete window[id]; reject(new Error('native timeout')); }, 12000);
    window[id] = (ok, body) => {
      clearTimeout(timer);
      delete window[id];
      if (!ok) return reject(new Error(body));
      try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
    };
    window.TabletNative.fetchText(url, id);
  });
}

async function getJSON(url) {
  if (window.TabletNative?.fetchText) {
    try { return await nativeFetch(url); } catch (e) { console.warn('native fetch failed', e); }
  }
  const proxy = localStorage.getItem('aircraft.proxy');
  const tries = [url];
  if (proxy) tries.push(proxy + encodeURIComponent(url));
  let err;
  for (const u of tries) {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 10000);
      const res = await fetch(u, { signal: ctl.signal });
      clearTimeout(t);
      if (!res.ok) throw new Error(`${res.status}`);
      return await res.json();
    } catch (e) { err = e; }
  }
  throw err;
}

const SOURCES = [
  { name: 'adsb.lol', url: (l, r) => `https://api.adsb.lol/v2/point/${l.lat.toFixed(4)}/${l.lon.toFixed(4)}/${r}` },
  { name: 'adsb.fi', url: (l, r) => `https://opendata.adsb.fi/api/v2/lat/${l.lat.toFixed(4)}/lon/${l.lon.toFixed(4)}/dist/${r}` },
];

// Returns { at, source, sample, list } — list sorted closest first.
export async function getAircraft(loc, { fresh = false } = {}) {
  const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
  if (!fresh && cached && Date.now() - cached.at < MAX_AGE && cached.lat === loc.lat && cached.lon === loc.lon) {
    return cached;
  }
  for (const s of SOURCES) {
    try {
      const d = await getJSON(s.url(loc, RADIUS_NM));
      const raw = d.ac || d.aircraft || [];
      const list = raw.map((a) => normalize(a, loc)).filter(Boolean).sort((a, b) => a.dst - b.dst);
      const result = { at: Date.now(), lat: loc.lat, lon: loc.lon, source: s.name, sample: false, list };
      localStorage.setItem(CACHE_KEY, JSON.stringify(result));
      return result;
    } catch (e) { /* try next */ }
  }
  // Last good live data up to 10 minutes old beats sample data.
  if (cached && !cached.sample && Date.now() - cached.at < 10 * 60 * 1000) return cached;
  return sampleAircraft(loc);
}

// ---------- routes (adsbdb.com, CORS-enabled) ----------
const routeCache = () => JSON.parse(localStorage.getItem(ROUTE_KEY) || '{}');
const inflight = new Map();

function airport(a) {
  return a && { iata: a.iata_code, icao: a.icao_code, name: a.name, city: (a.municipality || a.name || '').toUpperCase(), lat: a.latitude, lon: a.longitude };
}

export function cachedRoute(callsign) {
  const r = routeCache()[callsign];
  return r && Date.now() - r.at < ROUTE_MAX_AGE ? r.route : undefined;
}

export async function getRoute(callsign) {
  if (!callsign || !/^[A-Z]{3}\d/.test(callsign)) return null; // tail numbers have no route
  const hit = cachedRoute(callsign);
  if (hit !== undefined) return hit;
  if (inflight.has(callsign)) return inflight.get(callsign);
  const p = (async () => {
    let route = null;
    try {
      const res = await fetch(`https://api.adsbdb.com/v0/callsign/${encodeURIComponent(callsign)}`, { signal: AbortSignal.timeout(10000) });
      if (res.ok) {
        const fr = (await res.json())?.response?.flightroute;
        if (fr) {
          route = {
            flight: fr.callsign_iata ? fr.callsign_iata.replace(/^([A-Z0-9]{2})(\d)/, '$1 $2') : null,
            airline: (fr.airline?.name || '').toUpperCase(),
            from: airport(fr.origin),
            to: airport(fr.destination),
          };
        }
      } else if (res.status !== 404) {
        throw new Error('adsbdb ' + res.status);
      }
    } catch (e) {
      inflight.delete(callsign);
      return null; // network trouble: don't cache, try again later
    }
    const all = routeCache();
    all[callsign] = { at: Date.now(), route };
    // keep the cache small
    const keys = Object.keys(all);
    if (keys.length > 400) keys.sort((a, b) => all[a].at - all[b].at).slice(0, keys.length - 400).forEach((k) => delete all[k]);
    localStorage.setItem(ROUTE_KEY, JSON.stringify(all));
    inflight.delete(callsign);
    return route;
  })();
  inflight.set(callsign, p);
  return p;
}

// adsbdb's route for a callsign is sometimes stale. A plane low down (taking off or
// landing) must be near one end of its route, otherwise we don't trust it.
function plausible(ac, route) {
  if (!route || ac.alt >= 10000 || ac.lat == null) return route;
  const near = [route.from, route.to].some((ap) => ap?.lat != null && distBearing(ac, ap.lat, ap.lon).dst < 150);
  return near ? route : null;
}

// Look up routes for a list, a few at a time. Resolves to { callsign: route }.
export async function getRoutes(list, max = 25) {
  const out = {};
  const todo = list.filter((a) => a.callsign).slice(0, max);
  for (let i = 0; i < todo.length; i += 5) {
    await Promise.all(todo.slice(i, i + 5).map(async (a) => { out[a.callsign] = plausible(a, await getRoute(a.callsign)); }));
  }
  return out;
}

// ---------- sample data (shown only when no live feed is reachable) ----------
// The seven planes from the design, placed around the house.
const sap = (s) => s && { city: s.split('/')[0], iata: s.split('/')[1] };
function sampleAircraft(loc) {
  const raw = [
    ['DAL1423', 'B739', 34000, 445, 40, 2.6, 52, { flight: 'DL 1423', airline: 'DELTA', from: 'ATLANTA/ATL', to: 'BOSTON/BOS' }],
    ['UAL88', 'B78X', 37000, 488, 70, 14.1, 300, { flight: 'UA 88', airline: 'UNITED', from: 'NEWARK/EWR', to: 'TEL AVIV/TLV' }],
    ['FDX1207', 'B763', 28000, 424, 340, 9.8, 120, { flight: 'FDX 1207', airline: 'FEDEX CARGO', from: 'MEMPHIS/MEM', to: 'NEWARK/EWR' }],
    ['N172TM', 'C172', 3500, 104, 160, 7.2, 200, null],
    ['AAL2310', 'A321', 31000, 433, 290, 16.9, 255, { flight: 'AA 2310', airline: 'AMERICAN', from: 'CHARLOTTE/CLT', to: 'DETROIT/DTW' }],
    ['SWA908', 'B38M', 22000, 382, 200, 13.6, 160, { flight: 'WN 908', airline: 'SOUTHWEST', from: 'BALTIMORE/BWI', to: 'NASHVILLE/BNA' }],
    ['RCH451', 'C17', 26000, 408, 110, 15.5, 40, { flight: 'RCH 451', airline: 'US AIR FORCE', from: null, to: null }],
  ];
  // a few climbing / descending so the up/down arrows show in the preview too
  const VRATE = { FDX1207: -1500, SWA908: 1800, N172TM: 0 };
  const list = raw.map(([callsign, type, alt, gs, track, dst, dir, route]) => {
    const lat = loc.lat + (dst / NM_PER_DEG) * Math.cos(rad(dir));
    const lon = loc.lon + ((dst / NM_PER_DEG) * Math.sin(rad(dir))) / Math.cos(rad(loc.lat));
    return {
      hex: callsign.toLowerCase(), callsign, reg: '', type, desc: '', alt, onGround: false, gs, track,
      vrate: VRATE[callsign] || 0, lat, lon, dst, dir, military: callsign.startsWith('RCH'), interesting: false,
      sampleRoute: route && { flight: route.flight, airline: route.airline, from: sap(route.from), to: sap(route.to) },
    };
  });
  return { at: Date.now(), lat: loc.lat, lon: loc.lon, source: 'sample', sample: true, list };
}

// Route for display: live lookup result, or the sample's built-in route.
export function routeText(ac, route) {
  const r = route || ac.sampleRoute;
  if (r?.from?.city && r?.to?.city) return `${r.from.city} → ${r.to.city}`;
  if (ac.military) return 'MILITARY';
  if (!/^[A-Z]{3}\d/.test(ac.callsign || '')) return 'LOCAL FLIGHT';
  return 'ROUTE UNKNOWN';
}

// ---------- A photo of the actual aircraft (adsbdb.com, from airport-data.com) ----------
const INFO_KEY = 'aircraft.info.v1';
const INFO_MAX_AGE = 14 * 24 * 3600 * 1000;
const MISS_MAX_AGE = 24 * 3600 * 1000;

/** { photo, reg, owner, model } for an aircraft (by its hex code), or null. Remembered. */
export async function getAircraftInfo(hex) {
  if (!hex || !/^[0-9a-f]{6}$/i.test(hex)) return null;
  let all = {};
  try { all = JSON.parse(localStorage.getItem(INFO_KEY) || '{}'); } catch (e) { all = {}; }
  const hit = all[hex];
  if (hit && Date.now() - hit.at < (hit.info ? INFO_MAX_AGE : MISS_MAX_AGE)) return hit.info;
  let info = null;
  try {
    const res = await fetch(`https://api.adsbdb.com/v0/aircraft/${hex}`, { signal: AbortSignal.timeout(10000) });
    if (res.ok || res.status === 404) {
      const a = res.ok ? (await res.json()).response?.aircraft : null;
      if (a) info = { photo: a.url_photo || '', reg: a.registration || '', owner: a.registered_owner || '', model: [a.manufacturer, a.type].filter(Boolean).join(' ') };
    } else return null; // busy or offline: try again next time
  } catch (e) { return null; }
  all[hex] = { at: Date.now(), info };
  const keys = Object.keys(all);
  if (keys.length > 400) keys.sort((x, y) => all[x].at - all[y].at).slice(0, keys.length - 400).forEach((k) => delete all[k]);
  try { localStorage.setItem(INFO_KEY, JSON.stringify(all)); } catch (e) { /* full */ }
  return info;
}
