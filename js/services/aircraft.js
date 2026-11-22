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

// Storage that never throws: a full or switched-off store just means "nothing kept".
const load = (key, dflt) => { try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v == null ? dflt : v; } catch (e) { return dflt; } };
const save = (key, v) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* full or off */ } };
const num = (x, dflt = 0) => { const n = Number(x); return Number.isFinite(n) ? n : dflt; };

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
  QXE: ['QX', 'HORIZON'], CPZ: ['CP', 'COMPASS'], VXP: ['XP', 'AVELO'], KAP: ['9K', 'CAPE AIR'],
  CJT: ['W8', 'CARGOJET'], ABX: ['GB', 'ABX AIR CARGO'], ATN: ['8C', 'AIR TRANSPORT INTL'], CKS: ['K4', 'KALITTA AIR'],
  POE: ['PD', 'PORTER'], TAP: ['TP', 'TAP AIR PORTUGAL'], SAS: ['SK', 'SAS'], FIN: ['AY', 'FINNAIR'],
  ICE: ['FI', 'ICELANDAIR'], AUA: ['OS', 'AUSTRIAN'], BEL: ['SN', 'BRUSSELS AIRLINES'], ITY: ['AZ', 'ITA AIRWAYS'],
  CCA: ['CA', 'AIR CHINA'], CES: ['MU', 'CHINA EASTERN'], CSN: ['CZ', 'CHINA SOUTHERN'], EVA: ['BR', 'EVA AIR'],
  AIC: ['AI', 'AIR INDIA'], SVA: ['SV', 'SAUDIA'], RAM: ['AT', 'ROYAL AIR MAROC'], ETH: ['ET', 'ETHIOPIAN'],
  LAN: ['LA', 'LATAM'], TAM: ['JJ', 'LATAM BRASIL'], GLO: ['G3', 'GOL'], AZU: ['AD', 'AZUL'], WEN: ['WR', 'WESTJET ENCORE'],
  TSC: ['TS', 'AIR TRANSAT'], ROU: ['RV', 'AIR CANADA ROUGE'], XOJ: ['', 'XO JETS'], TWY: ['', 'SOLAIRUS'],
  JRE: ['', 'JETSUITE'], VJT: ['', 'VISTAJET'],
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
  A310: 'AIRBUS A310', A337: 'AIRBUS BELUGA XL', A400: 'AIRBUS A400M ATLAS', A342: 'AIRBUS A340-200', A346: 'AIRBUS A340-600',
  A338: 'AIRBUS A330-800', B733: 'BOEING 737-300', B734: 'BOEING 737-400', B735: 'BOEING 737-500', B736: 'BOEING 737-600',
  B703: 'BOEING 707', B722: 'BOEING 727', B77F: 'BOEING 777 FREIGHTER', B48F: 'BOEING 747-8 FREIGHTER', B762F: 'BOEING 767 FREIGHTER',
  DC10: 'McDONNELL DOUGLAS DC-10', KC10: 'KC-10 EXTENDER', MD80: 'MD-80', MD82: 'MD-82', MD83: 'MD-83', MD88: 'MD-88', MD90: 'MD-90',
  E295: 'EMBRAER E195-E2', E275: 'EMBRAER E175-E2', CL60: 'BOMBARDIER CHALLENGER 600', CL35: 'BOMBARDIER CHALLENGER 350',
  GLF2: 'GULFSTREAM II', GLF3: 'GULFSTREAM III', G150: 'GULFSTREAM G150', GA5C: 'GULFSTREAM G500', GA6C: 'GULFSTREAM G600',
  GA7C: 'GULFSTREAM G700', HDJT: 'HONDAJET', SF50: 'CIRRUS VISION JET', BE58: 'BEECH BARON', C150: 'CESSNA 150',
  C170: 'CESSNA 170', C177: 'CESSNA CARDINAL', C185: 'CESSNA SKYWAGON', C310: 'CESSNA 310', C340: 'CESSNA 340', M20P: 'MOONEY M20',
  C40: 'C-40 CLIPPER', C12: 'C-12 HURON', C2: 'C-2 GREYHOUND', E6: 'E-6 MERCURY', F16: 'F-16 FIGHTING FALCON', F15: 'F-15 EAGLE',
  F18H: 'F/A-18 SUPER HORNET', F18S: 'F/A-18 SUPER HORNET', F35: 'F-35 LIGHTNING II', F22: 'F-22 RAPTOR', A10: 'A-10 WARTHOG',
  T38: 'T-38 TALON', T6: 'T-6 TEXAN II', B1: 'B-1 LANCER', B2: 'B-2 SPIRIT', U2: 'U-2 DRAGON LADY', E2: 'E-2 HAWKEYE',
  H47: 'CHINOOK HELICOPTER', UH1: 'HUEY HELICOPTER', H64: 'APACHE HELICOPTER', H53: 'SEA STALLION HELICOPTER', H53S: 'SEA DRAGON HELICOPTER',
  A109: 'LEONARDO AW109 HELICOPTER', A119: 'LEONARDO AW119 HELICOPTER', A169: 'LEONARDO AW169 HELICOPTER', AS65: 'DAUPHIN HELICOPTER',
  B212: 'BELL 212 HELICOPTER', B412: 'BELL 412 HELICOPTER', B505: 'BELL 505 HELICOPTER', EC30: 'AIRBUS H130 HELICOPTER',
  EC55: 'AIRBUS H155 HELICOPTER', EC20: 'AIRBUS H120 HELICOPTER', R66: 'ROBINSON R66 HELICOPTER', MD52: 'MD 520 HELICOPTER',
  BALL: 'HOT-AIR BALLOON', GLID: 'GLIDER', ZZZZ: 'UNLISTED AIRCRAFT',
};

// What kind of aircraft, in a word or two (an adsb "category" code helps when the type doesn't).
// Each pattern matches a WHOLE ICAO type code (anchored both ends): "C17" is the C-17
// Globemaster and must never catch "C172", the Cessna 172.
const HEAVY = /^(B74[0-9A-Z]|B77[0-9A-Z]|B78[0-9A-Z]|A33[0-9]|A34[0-9]|A35[0-9K]|A38[0-9]|A30[06B]|A310|B76[0-9]F?|MD11F?|DC10|KC10|C17|C5M|A124|A400|BLCF|A3ST|A337|E3TF|K35R|KC46|VC25|B52|B703|E6)$/;
const BIZJET = /^(GLF[2-6]|GA[5-7]C|G150|G280|GLEX|GL5T|CL30|CL35|CL60|C25[A-C]|C5[0-9][0-9A-Z]|C68A|C700|C750|E55P|E545|E50P|F2TH|F900|FA[78]X|LJ[0-9]{2}|H25B|PC24|BE40|HDJT|SF50)$/;
const LIGHT = /^(C1[5-9][0-9]|C2[01][0-9]|C310|C340|P28[A-Z]|PA[0-9]{2}|SR2[0-2]|BE36|BE58|BE9L|DA4[0-2]|M20[A-Z]|TBM[0-9]|PC12|BE20|B350)$/;
const FIGHTER = /^(F1[568]|F18[HS]?|F22|F35|A10|T38|T6|B1|B2|U2)$/;
const HELI_TYPE = /HELICOPTER/;

// ADS-B emitter category (the feed's `category`, e.g. "A1"), used only when the type code is
// unknown: A1 light, A2 small, A3 large, A4 B757-size, A5 heavy, A6 high performance,
// A7 rotorcraft, B1 glider, B2 balloon/airship, B4 ultralight, B6 drone, C* ground vehicles.
const BY_CATEGORY = { A1: 'SMALL PLANE', A2: 'SMALL PLANE', A5: 'HEAVY JET', A6: 'FAST JET', A7: 'HELICOPTER', B1: 'GLIDER', B2: 'BALLOON', B4: 'ULTRALIGHT', B6: 'DRONE' };

/** "HEAVY JET", "HELICOPTER", "BUSINESS JET", "MILITARY", "SMALL PLANE", "CARGO", "AIRLINER", or "". */
export function kindOf(ac) {
  const t = String(ac.type || '').toUpperCase();
  const known = !!TYPES[t];
  const cat = String(ac.category || '').toUpperCase();
  // 1. What the type code itself says always wins.
  if (t === 'BALL') return 'BALLOON';
  if (t === 'GLID') return 'GLIDER';
  if ((known && HELI_TYPE.test(TYPES[t])) || t === 'V22') return 'HELICOPTER';
  if (FIGHTER.test(t)) return 'MILITARY JET';
  if (ac.military) return 'MILITARY';
  if (HEAVY.test(t)) return 'HEAVY JET';
  if (BIZJET.test(t)) return 'BUSINESS JET';
  if (LIGHT.test(t)) return 'SMALL PLANE';
  if (/CARGO|ATLAS AIR|KALITTA|ABX|CARGOJET|AIR TRANSPORT/.test(airlineOf(ac))) return 'CARGO';
  // 2. An unlisted type: the feed's own description, then its emitter category.
  if (!known && HELI_TYPE.test(String(ac.desc || '').toUpperCase())) return 'HELICOPTER';
  if (!known && BY_CATEGORY[cat]) return BY_CATEGORY[cat];
  if (/^[A-Z]{3}\d/.test(ac.callsign || '')) return 'AIRLINER';
  return '';
}

/** A plain-words warning for an emergency code, or null. */
export function squawkInfo(ac) {
  const sq = String(ac.squawk || '');
  const em = ac.emergency || '';
  if (sq === '7700' || em === 'general') return { code: '7700', short: 'EMERGENCY', words: 'THE PILOTS HAVE DECLARED AN EMERGENCY' };
  if (sq === '7600' || em === 'nordo') return { code: '7600', short: 'RADIO FAILURE', words: 'THE PILOTS HAVE LOST RADIO CONTACT AND ARE FOLLOWING THE SET PLAN' };
  if (sq === '7500' || em === 'unlawful') return { code: '7500', short: 'HIJACK CODE', words: 'THE CREW SENT THE HIJACK CODE (SOMETIMES A MISTAKE)' };
  if (em === 'minfuel') return { code: sq, short: 'LOW ON FUEL', words: 'THE PILOTS HAVE SAID THEY ARE LOW ON FUEL' };
  if (em === 'lifeguard') return { code: sq, short: 'MEDICAL FLIGHT', words: 'A MEDICAL FLIGHT, GIVEN PRIORITY BY AIR TRAFFIC CONTROL' };
  return null;
}

/** How worth a look a plane is (higher = more interesting); used to pick one out. */
export function interest(ac) {
  if (squawkInfo(ac)) return 100;
  if (RARE[ac.type] || /^(AF1|AF2|SAM\d)/.test(ac.callsign || '')) return 80;
  const k = kindOf(ac);
  if (k === 'SMALL PLANE') return 0; // a light plane is everyday, whatever else the feed says
  return { 'MILITARY JET': 70, MILITARY: 60, BALLOON: 50, 'FAST JET': 45, GLIDER: 40, DRONE: 30, 'HEAVY JET': 30, HELICOPTER: 25, ULTRALIGHT: 15, 'BUSINESS JET': 12, CARGO: 10 }[k] || (ac.interesting ? 20 : 0);
}

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
  // Our own list first: the feeds' descriptions are spelled unevenly ("AIRBUS A-320").
  return (TYPES[ac.type] || ac.desc || ac.type || 'UNKNOWN TYPE').toUpperCase();
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

// ---- Words for the screens (metric = the owner chose Celsius, so add km and km/h) ----
/** "3 MI", or "3 MI (5 KM)" for a metric-minded owner. */
export function fmtDist(nm, metric) {
  const mi = fmtMiles(nm);
  return metric ? `${mi} (${nm * 1.852 < 1 ? 'UNDER 1' : Math.round(nm * 1.852)} KM)` : mi;
}
/** "512 MPH · 445 KNOTS" (+ "· 824 KM/H"); a helicopter standing still says so. */
export function fmtSpeed(ac, metric) {
  if (ac.onGround) return ac.gs > 5 ? `TAXIING ${Math.round(ac.gs * 1.15078)} MPH` : 'PARKED';
  if (!(ac.gs > 1)) return kindOf(ac) === 'HELICOPTER' || kindOf(ac) === 'BALLOON' ? 'HOVERING' : 'SPEED NOT SENT';
  const mph = `${Math.round(ac.gs * 1.15078)} MPH`;
  return metric ? `${mph} · ${Math.round(ac.gs * 1.852)} KM/H` : `${mph} · ${Math.round(ac.gs)} KNOTS`;
}
/** How high it looks from the ground, in degrees above the horizon (0 = horizon, 90 = straight up). */
export function skyAngle(ac) {
  if (ac.onGround) return 0;
  return deg(Math.atan2(Math.max(0, ac.alt), Math.max(1, ac.dst * 6076.12)));
}
/** Where in the sky to look, in plain words. */
export function skyWords(ac) {
  if (ac.onGround) return 'ON THE GROUND';
  const a = skyAngle(ac);
  return a >= 75 ? 'STRAIGHT UP' : a >= 50 ? 'HIGH UP' : a >= 28 ? 'HALFWAY UP THE SKY' : a >= 10 ? 'LOW IN THE SKY' : 'JUST ABOVE THE HORIZON';
}
/** "LOOK NORTHEAST, HIGH UP" / "LOOK STRAIGHT UP". */
export function lookText(ac) {
  const w = skyWords(ac);
  return w === 'STRAIGHT UP' ? 'LOOK STRAIGHT UP' : `LOOK ${compass(ac.dir)}, ${w}`;
}
/** Is it coming this way, going away, or passing by? (from its track and where it is) */
export function approachWord(ac) {
  if (ac.onGround || !(ac.gs > 1)) return '';
  if (ac.dst < 0.6) return 'RIGHT OVER YOU';
  const toHome = (ac.dir + 180) % 360;
  const diff = Math.abs((((ac.track - toHome) % 360) + 540) % 360 - 180);
  return diff < 40 ? 'COMING YOUR WAY' : diff > 140 ? 'MOVING AWAY' : 'PASSING BY';
}
/** "HEADING SOUTHWEST" */
export const headingText = (ac) => (ac.onGround || !(ac.gs > 1) ? '' : `HEADING ${compass(ac.track)}`);

/** One sentence about a plane: "A DELTA BOEING 737-900 FROM ATLANTA TO BOSTON IS PASSING 3 MILES NORTHEAST AT 34,000 FT". */
export function sentence(ac, route, metric) {
  const r = route || ac.sampleRoute;
  let type = typeName(ac);
  if (type === 'UNKNOWN TYPE' || type === 'UNLISTED AIRCRAFT') type = kindOf(ac) === 'HELICOPTER' ? 'HELICOPTER' : 'PLANE';
  const airline = airlineOf(ac) || (r?.airline || '').replace(/ (AIR ?LINES|AIRWAYS|AIRLINES)$/, '');
  const what = `${airline && airline !== 'MILITARY' ? airline + ' ' : ''}${type}`;
  const art = /^([AEIO]|U(?!S\b|NI|PS)|MD|F-|F\/A|L-|S-)/.test(what) ? 'AN' : 'A';
  const fromTo = r?.from?.city && r?.to?.city ? ` FROM ${r.from.city} TO ${r.to.city}` : r?.to?.city ? ` TO ${r.to.city}` : '';
  if (ac.onGround) return `${art} ${what}${fromTo} IS ON THE GROUND ${fmtMiles(ac.dst)} ${compass(ac.dir)}`;
  const verb = ac.vrate > 300 ? 'IS CLIMBING' : ac.vrate < -300 ? 'IS COMING DOWN' : 'IS PASSING';
  const mi = ac.dst * 1.15078;
  const km = metric ? ` (${Math.max(1, Math.round(ac.dst * 1.852))} KM)` : '';
  const where = ac.dst < 0.6 ? 'RIGHT OVER YOUR HOUSE'
    : mi < 1.5 ? `ABOUT A MILE${km} ${compass(ac.dir)}` : `${Math.round(mi)} MILES${km} ${compass(ac.dir)}`;
  return `${art} ${what}${fromTo} ${verb} ${where} AT ${fmtAlt(ac)}`;
}

// ---------- fetching ----------
// Feeds sometimes send odd values (a missing speed, "ground" for height, a blank code):
// everything is turned into a plain number or string here so no screen ever shows "NaN".
function normalize(a, home, i) {
  const lat = Number(a.lat), lon = Number(a.lon);
  if (a.lat == null || a.lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (/^C\d/.test(String(a.category || ''))) return null; // airport fire trucks and tugs, not aircraft
  const onGround = a.alt_baro === 'ground';
  const ac = {
    hex: String(a.hex || `x${i}`).toLowerCase(),
    callsign: String(a.flight || '').trim().toUpperCase(),
    reg: String(a.r || ''),
    type: String(a.t || '').toUpperCase(),
    desc: String(a.desc || ''),
    alt: onGround ? 0 : num(a.alt_baro, num(a.alt_geom, 0)),
    onGround,
    gs: Math.max(0, num(a.gs, 0)),
    track: num(a.track, num(a.true_heading, 0)),
    vrate: num(a.baro_rate, num(a.geom_rate, 0)),
    lat, lon,
    military: !!(a.dbFlags & 1),
    interesting: !!(a.dbFlags & 2),
    squawk: String(a.squawk || ''),
    emergency: a.emergency && a.emergency !== 'none' ? String(a.emergency) : '',
    category: String(a.category || ''),
    owner: String(a.ownOp || ''),
    year: String(a.year || ''),
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
      if (!res.ok) {
        const err = new Error(`${res.status}`);
        err.status = res.status;
        err.retryAfter = num(res.headers.get('Retry-After'), 0); // seconds, when the feed says so
        throw err;
      }
      return await res.json();
    } catch (e) { err = e; }
  }
  throw err;
}

const SOURCES = [
  { name: 'adsb.lol', url: (l, r) => `https://api.adsb.lol/v2/point/${l.lat.toFixed(4)}/${l.lon.toFixed(4)}/${r}` },
  { name: 'adsb.fi', url: (l, r) => `https://opendata.adsb.fi/api/v2/lat/${l.lat.toFixed(4)}/lon/${l.lon.toFixed(4)}/dist/${r}` },
];

// Being a good guest of free feeds: after a failed round the feeds are left alone for a
// while (1, 2, 4, 8 then 10 minutes), longer if a feed asks us to slow down (HTTP 429),
// and not tried at all while the Wi-Fi is off. Several screens asking at once share one request.
const feed = { fails: 0, restUntil: 0, lastTry: 0, lastOk: 0, inflight: null, key: '' };
const samePlace = (a, b) => a && b && Math.abs(a.lat - b.lat) < 1e-4 && Math.abs(a.lon - b.lon) < 1e-4;
const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

/** How the live feed is doing: { offline, failing, retryAt, lastOk } for the screens' wording. */
export function feedStatus() {
  return { offline: isOffline(), failing: feed.fails > 0, retryAt: feed.restUntil > Date.now() ? feed.restUntil : 0, lastOk: feed.lastOk };
}

async function fetchFeeds(loc) {
  let slowDown = 0;
  for (const s of SOURCES) {
    try {
      const d = await getJSON(s.url(loc, RADIUS_NM));
      const raw = Array.isArray(d?.ac) ? d.ac : Array.isArray(d?.aircraft) ? d.aircraft : null;
      if (!raw) throw new Error('no aircraft list');
      const list = raw.map((a, i) => normalize(a, loc, i)).filter(Boolean).sort((a, b) => a.dst - b.dst);
      return { at: Date.now(), lat: loc.lat, lon: loc.lon, source: s.name, sample: false, list };
    } catch (e) {
      if (e && e.status === 429) slowDown = Math.max(slowDown, e.retryAfter || 300);
    }
  }
  return { failed: true, slowDown };
}

// Returns { at, source, sample, list } — list sorted closest first.
// (Also `stale: true` when it is older live data kept because the feed isn't answering.)
export async function getAircraft(loc, { fresh = false } = {}) {
  const cached = load(CACHE_KEY, null);
  const here = cached && samePlace(cached, loc) ? cached : null;
  if (!fresh && here && Date.now() - here.at < MAX_AGE) return here;
  const key = `${loc.lat},${loc.lon}`;
  if (!isOffline() && (fresh || Date.now() >= feed.restUntil)) {
    if (!feed.inflight || feed.key !== key) {
      feed.key = key;
      const mine = fetchFeeds(loc).then((got) => {
        if (feed.inflight === mine) feed.inflight = null;
        if (got.failed) {
          feed.fails += 1;
          const rest = Math.min(10 * 60, 60 * 2 ** (feed.fails - 1));
          feed.restUntil = Date.now() + Math.max(rest, got.slowDown || 0) * 1000;
        } else {
          feed.fails = 0;
          feed.restUntil = 0;
          feed.lastOk = got.at;
          save(CACHE_KEY, got);
          noteSightings(got.list);
        }
        return got;
      });
      feed.inflight = mine;
    }
    const got = await feed.inflight;
    if (!got.failed && samePlace(got, loc)) return got;
  }
  // Last good live data for THIS place, up to 10 minutes old, beats sample data.
  if (here && !here.sample && Date.now() - here.at < 10 * 60 * 1000) return { ...here, stale: true };
  return sampleAircraft(loc);
}

// ---------- the day's log, kept on this display only ----------
// How many different aircraft were seen today, the most unusual one, and the last one seen
// (so "nothing overhead" can say when there last was something). Live data only.
const DAY_KEY = 'aircraft.today.v1';
const LAST_KEY = 'aircraft.lastseen.v1';
const dayStamp = (d = new Date()) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

function noteSightings(list) {
  const air = list.filter((a) => !a.onGround && a.dst <= RADIUS_NM);
  if (!air.length) return;
  const today = dayStamp();
  let log = load(DAY_KEY, null);
  if (!log || log.day !== today || !Array.isArray(log.seen)) log = { day: today, seen: [], best: null };
  else log.best = todayLog().best; // judged by today's rules before anything new is compared with it
  const seen = new Set(log.seen);
  for (const a of air) {
    if (seen.has(a.hex)) continue;
    seen.add(a.hex);
    const score = interest(a);
    if (score > 0 && (!log.best || score > log.best.score)) log.best = bestEntry(a, score);
  }
  log.seen = [...seen].slice(-3000);
  save(DAY_KEY, log);
  const c = air[0];
  save(LAST_KEY, { at: Date.now(), label: flightLabel(c), type: typeName(c) });
}

// The day's "most unusual" keeps the raw codes, so it can be judged again by today's rules.
const BEST_VERSION = 2;
function bestEntry(a, score) {
  const sq = squawkInfo(a);
  return {
    v: BEST_VERSION, score, hex: a.hex, at: Date.now(), label: flightLabel(a), type: typeName(a), kind: kindOf(a), airline: airlineOf(a),
    why: sq ? sq.short : RARE[a.type] ? 'RARE VISITOR' : kindOf(a),
    raw: { type: a.type, desc: a.desc, category: a.category, military: a.military, interesting: a.interesting, callsign: a.callsign, squawk: a.squawk, emergency: a.emergency },
  };
}

/** { count, best: { label, type, kind, airline, why, at } | null, last: { at, label, type } | null } */
export function todayLog() {
  const log = load(DAY_KEY, null);
  const ok = log && log.day === dayStamp() && Array.isArray(log.seen);
  let best = ok ? log.best : null;
  if (best) {
    // Re-judge what was stored (a pick from older rules, e.g. a Cessna 172 once taken for a
    // heavy jet, must not stay "most unusual" all day). Without its codes it can't be checked: drop it.
    const again = best.v === BEST_VERSION && best.raw ? { ...best.raw, hex: best.hex } : null;
    const score = again ? interest(again) : 0;
    if (score <= 0) best = null;
    else best = { ...best, score, kind: kindOf(again), why: squawkInfo(again) ? squawkInfo(again).short : RARE[again.type] ? 'RARE VISITOR' : kindOf(again) };
    if (!best || best.why !== log.best.why || best.score !== log.best.score) save(DAY_KEY, { ...log, best });
  }
  return { count: ok ? log.seen.length : 0, best, last: load(LAST_KEY, null) };
}

// ---------- routes (adsbdb.com, CORS-enabled) ----------
const routeCache = () => load(ROUTE_KEY, {});
const inflight = new Map();
// adsbdb down or busy: leave it alone for 5 minutes instead of asking for every plane every minute.
let routeRestUntil = 0;

function airport(a) {
  return a && {
    iata: a.iata_code, icao: a.icao_code, name: a.name, city: (a.municipality || a.name || '').toUpperCase(),
    lat: a.latitude, lon: a.longitude, country: (a.country_name || '').toUpperCase(), countryCode: a.country_iso_name || '',
  };
}

/** "BOSTON (BOS)"; abroad also the country: "LONDON (LHR), UNITED KINGDOM". */
export function placeText(ap, homeCountry = 'US') {
  if (!ap) return '';
  const city = ap.city || (ap.name || '').toUpperCase();
  const code = ap.iata ? ` (${ap.iata})` : '';
  const abroad = ap.countryCode && ap.country && ap.countryCode !== homeCountry && !city.includes(ap.country);
  return `${city}${code}${abroad ? `, ${ap.country}` : ''}`;
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
  if (Date.now() < routeRestUntil || isOffline()) return null;
  const p = (async () => {
    let route = null;
    try {
      const res = await fetch(`https://api.adsbdb.com/v0/callsign/${encodeURIComponent(callsign)}`, { signal: AbortSignal.timeout(10000) });
      if (res.status === 429 || res.status >= 500) routeRestUntil = Date.now() + 5 * 60000;
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
      if (Date.now() >= routeRestUntil) routeRestUntil = Date.now() + 2 * 60000; // offline or timed out
      return null; // network trouble: don't cache, try again later
    }
    const all = routeCache();
    all[callsign] = { at: Date.now(), route };
    // keep the cache small
    const keys = Object.keys(all);
    if (keys.length > 400) keys.sort((a, b) => all[a].at - all[b].at).slice(0, keys.length - 400).forEach((k) => delete all[k]);
    save(ROUTE_KEY, all);
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
