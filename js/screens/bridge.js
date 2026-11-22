// Tom · Flight deck home screen (Bridge.dc.html in the design)
// Live panels: planes over the house, Voyager 1, the Moon, the Space Station's next pass,
// the nearest airport's departures. When a feed is down or the Wi-Fi is off, a panel keeps
// the last real answer it had and says how old it is; sample data is always marked SAMPLE.
import { getLocation } from '../services/location.js';
import { feature } from '../services/features.js';
import {
  getAircraft, getRoutes, advance, flightLabel, typeName, fmtAlt, compass, compassShort, fmtMiles, trend, RADIUS_NM,
} from '../services/aircraft.js';
import { nextVisiblePass, getCrew, orbitStatus, brightnessWords } from '../services/iss.js';
import { getBoard } from '../services/departures.js';
import { checkAlerts, wasSeen, markSeen, heightWords } from '../services/skyalert.js';

const GLOWS = ['#5CE1E6', '#7CF29A', '#B69CFF'];
const PLANE = '<path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"></path>';
const LAST_PLANES = 'bridge.lastPlanes.v1'; // the last real (not sample) planes panel, for when the feed is down
const LAST_BOARD = 'bridge.lastBoard.v1';   // the same for the departures line
const QOTD_KEY = 'trivia.qotd.v1';          // trivia.js: today's question of the day and whether it's answered
const NYC = { lat: 40.7128, lon: -74.006, town: 'New York' };

let timers = [];
let alive = false;
let onOnline = null;
let issTimer = 0; // the Space Station panel's next change (start or end of a pass)
let visit = 0;    // counts mounts, so a slow start from an earlier visit doesn't add its timers

const pad = (n) => String(n).padStart(2, '0');
// Times in words follow the owner's 12/24-hour choice (compat.js); the big clock is 24-hour on purpose.
const fmtTime = (t) => new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toUpperCase();
const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage full */ } };
const offline = () => navigator.onLine === false;
const dayKey = (d = new Date()) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

/** "JUST NOW", "12 MIN AGO", "3 HR AGO", "2 DAYS AGO" */
function ago(at) {
  const m = Math.max(0, Math.round((Date.now() - at) / 60000));
  if (m < 2) return 'JUST NOW';
  if (m < 90) return `${m} MIN AGO`;
  const h = Math.round(m / 60);
  return h < 36 ? `${h} HR AGO` : `${Math.round(h / 24)} DAYS AGO`;
}

// Clock, Voyager and Moon maths straight from the design.
function vals() {
  const now = new Date();
  const C = 299792.458;
  const LD = 86400 * C;
  const crossing = Date.UTC(2026, 10, 18, 6, 16, 7);
  const km = LD + ((now.getTime() - crossing) / 1000) * 17;
  const secs = Math.round(km / C);
  const until = crossing - now.getTime();
  const age = ((now.getTime() - Date.UTC(2000, 0, 6, 18, 14)) / 86400000) % 29.530589;
  const p = age / 29.530589;
  const lit = Math.round(((1 - Math.cos(2 * Math.PI * p)) / 2) * 100);
  // Named phases (new/quarter/full) only within about a day of the exact moment;
  // the rest of the month is crescent or gibbous, like a printed calendar says.
  const MONTH = 29.530589;
  const near = (d) => Math.abs(age - d) < 1.1 || Math.abs(age - d - MONTH) < 1.1 || Math.abs(age - d + MONTH) < 1.1;
  const moonName = near(0) ? 'NEW MOON' : near(MONTH / 4) ? 'FIRST QUARTER' : near(MONTH / 2) ? 'FULL MOON' : near((3 * MONTH) / 4) ? 'LAST QUARTER'
    : age < MONTH / 4 ? 'WAXING CRESCENT' : age < MONTH / 2 ? 'WAXING GIBBOUS' : age < (3 * MONTH) / 4 ? 'WANING GIBBOUS' : 'WANING CRESCENT';
  const toFull = Math.round((((MONTH / 2 - age) % MONTH) + MONTH) % MONTH);
  const moonNext = near(MONTH / 2) ? 'BRIGHTEST NIGHTS OF THE MONTH'
    : toFull <= 1 ? 'FULL MOON TOMORROW' : `FULL MOON IN ${toFull} DAYS`;
  const years = now.getFullYear() - 1977 - (now < new Date(now.getFullYear(), 8, 5) ? 1 : 0);
  const shift = (p < 0.5 ? -1 : 1) * Math.round((lit / 100) * 84);
  return {
    time: pad(now.getHours()) + ':' + pad(now.getMinutes()),
    dateLine: now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase(),
    vgrKm: Math.round(km).toLocaleString('en-US'),
    vgrDelay: Math.floor(secs / 3600) + 'H ' + pad(Math.floor((secs % 3600) / 60)) + 'M ' + pad(secs % 60) + 'S',
    vgrStatus: until > 0
      ? 'IN ' + Math.ceil(until / 3600000) + ' HOURS IT BECOMES THE FIRST HUMAN-MADE OBJECT ONE LIGHT-DAY FROM EARTH.'
      : 'CROSSED ONE LIGHT-DAY FROM EARTH ON NOV 18, 2026. NOTHING WE HAVE BUILT HAS GONE FARTHER.',
    moonName,
    moonNext,
    vgrYears: years,
    moonLit: lit,
    moonShift: shift,
  };
}

export function mount(el) {
  // Mounted again without being left first (the tour reloads the deck under itself):
  // stop the last visit's timers so the panels aren't fetched twice over.
  if (alive) unmount();
  alive = true;
  const me = ++visit;
  let glow = GLOWS[0];
  try { glow = localStorage.getItem('bridge.glow') || GLOWS[0]; } catch (e) { /* storage off */ }
  const v = vals();
  // The header always has the design's DEEP IMAGE + VIEWSCREEN and SETTINGS. Apps and Camera
  // (switched on from the dashboard) join the big buttons at the bottom instead, so the
  // header never runs out of room and Settings can always be reached.
  const headerLinks = [['#/deepimage', 'DEEP IMAGE'], ['#/viewscreen', 'VIEWSCREEN'], ['#/settings', 'SETTINGS']];
  const navLinks = [
    ['#/flights', 'PLANES OVERHEAD'], ['#/departures', 'DEPARTURES'], ['#/sky', "TONIGHT'S SKY"],
    ['#/missions', 'SPACE MISSIONS'], ['#/trivia', 'TRIVIA'],
    feature('apps') && ['#/apps', 'APPS'],
    feature('camera') && ['#/camera', 'CAMERA'],
  ].filter(Boolean);
  const navBtn = 'min-height: 64px; padding: 6px 8px; box-sizing: border-box; border: 1px solid #1E3A4A; background: #0A1220; text-decoration: none; font-family: Oxanium, sans-serif; font-size: 15px; font-weight: 700; letter-spacing: 3px; line-height: 1.25; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center';
  const chip = 'min-height: 52px; padding: 0 14px; box-sizing: border-box; border: 1px solid #1E3A4A; font-size: 14px; letter-spacing: 2px; display: flex; align-items: center; white-space: nowrap; text-decoration: none';
  const label = 'font-size: 14px; letter-spacing: 2px; color: #8FB0C0';

  el.innerHTML = `
  <link rel="stylesheet" crossorigin href="https://fonts.googleapis.com/css2?family=Oxanium:wght@300;500;700&family=JetBrains+Mono:wght@400;600&display=swap">
  <style>
    .tbb a{color:#5CE1E6}.tbb a:active{color:#A8F2F4}
    @keyframes tbb-blink{50%{opacity:.25}}
    @keyframes tbb-sweep{to{transform:rotate(360deg)}}
    /* Stepped, not smooth: these run for as long as the deck is up, and a smooth
       animation keeps the slow chip drawing 60 times a second. */
    .tbb .blink{animation:tbb-blink 2.4s steps(3) infinite}
    .tbb .sweep{position:absolute;top:0;right:0;bottom:0;left:0;border-radius:50%;background:conic-gradient(from 0deg,rgba(92,225,230,0) 0deg,rgba(92,225,230,0) 300deg,rgba(92,225,230,.4) 360deg);animation:tbb-sweep 5s steps(40) infinite}
    .tbb .glow-c{color:var(--glow)}
    .tbb-dim{opacity:.55}
    .tbb .tbb-q{display:block;margin-top:4px;font-family:'JetBrains Mono',monospace;font-size:13px;font-weight:400;letter-spacing:1px;color:#FFB547}
  </style>
  <div class="tbb" style="--glow:${glow};width: 1280px; height: 800px; box-sizing: border-box; padding: 24px 40px 26px; background: #05070D; color: #D7E6F0; font-family: 'JetBrains Mono', monospace; display: flex; flex-direction: column; gap: 18px">
    <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #1E3A4A; padding-bottom: 12px">
      <div style="display: flex; align-items: center; gap: 12px">
        <button data-glow aria-label="Change deck colour" style="width:52px;height:52px;margin:-14px -8px -14px -18px;padding:0;border:0;background:none;cursor:pointer;display:flex;align-items:center;justify-content:center">
          <span class="blink" style="width: 12px; height: 12px; border-radius: 50%; background: var(--glow)"></span>
        </button>
        <div class="glow-c" style="font-family: Oxanium, sans-serif; font-size: 24px; font-weight: 700; letter-spacing: 6px; white-space: nowrap">CAPTAIN TOM · FLIGHT DECK</div>
      </div>
      <div style="display: flex; gap: 18px; align-items: center">
        <div style="display: flex; gap: 8px; margin: -10px 0">
          ${headerLinks.map(([href, text]) => `<a href="${href}" style="${chip}">${text}</a>`).join('')}
        </div>
        <div data-date style="font-size: 16px; letter-spacing: 3px; color: #8FB0C0; white-space: nowrap">${v.dateLine}</div>
        <div data-time style="font-family: Oxanium, sans-serif; font-size: 34px; font-weight: 300; color: #FFB547">${v.time}</div>
      </div>
    </div>

    <div style="flex-grow: 1; display: grid; grid-template-columns: 1fr 1.35fr 1fr; gap: 20px; min-height: 0">
      <a href="#/flights" data-planes style="border: 1px solid #1E3A4A; background: #0A1220; padding: 20px 22px; text-decoration: none; color: #D7E6F0; display: flex; flex-direction: column; gap: 12px; min-width: 0">
        <div data-over style="${label}">OVER YOUR HOUSE NOW</div>
        <div style="align-self: center; position: relative; width: 200px; height: 200px; border-radius: 50%; border: 2px solid var(--glow); box-sizing: border-box; overflow: hidden; flex-shrink: 0">
          <div class="sweep"></div>
          <div style="position: absolute; top:50px;right:50px;bottom:50px;left:50px; border-radius: 50%; border: 1px solid #1E3A4A"></div>
          <div style="position: absolute; left: 50%; top: 50%; width: 8px; height: 8px; border-radius: 50%; background: #FFFFFF; transform: translate(-50%, -50%)"></div>
          <div data-blips></div>
        </div>
        <div data-count style="font-family: Oxanium, sans-serif; font-size: 40px; text-align: center; color: #FFB547; line-height: 1">— PLANES</div>
        <div data-sample style="font-size: 14px; letter-spacing: 1px; text-align: center; color: #8FB0C0; margin-top: -4px; line-height: 1.35">WITHIN 25 MILES</div>
        <div style="margin-top: auto; border-top: 1px solid #1E3A4A; padding-top: 10px; display: flex; flex-direction: column; gap: 4px; min-width: 0">
          <div class="glow-c" style="font-size: 14px; letter-spacing: 3px">CLOSEST</div>
          <div data-c-flight style="font-family: Oxanium, sans-serif; font-size: 20px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">SCANNING…</div>
          <div data-c-sub style="font-size: 15px; color: #9FBFCF; line-height: 1.35; overflow-wrap: anywhere; white-space: pre-line">&nbsp;</div>
        </div>
      </a>

      <a href="#/missions" style="border: 1px solid var(--glow); background: #0A1220; color: #D7E6F0; text-decoration: none; clip-path: polygon(0 0, calc(100% - 32px) 0, 100% 32px, 100% 100%, 32px 100%, 0 calc(100% - 32px)); padding: 26px 32px; display: flex; flex-direction: column; gap: 12px">
        <div class="glow-c" style="font-size: 14px; letter-spacing: 4px; white-space: nowrap">VOYAGER 1 · FARTHEST EVER</div>
        <div style="${label}; letter-spacing: 3px; margin-top: 8px">DISTANCE FROM EARTH (KM)</div>
        <div data-vkm style="font-family: Oxanium, sans-serif; font-size: 56px; font-weight: 500; line-height: 1; color: #FFB547">${v.vgrKm}</div>
        <div style="${label}; letter-spacing: 3px; margin-top: 10px">A SIGNAL SENT NOW ARRIVES IN</div>
        <div data-vdelay style="font-family: Oxanium, sans-serif; font-size: 44px; font-weight: 300; line-height: 1">${v.vgrDelay}</div>
        <div style="margin-top: auto; border-top: 1px solid #1E3A4A; padding-top: 14px; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px">
          <div><div style="${label}; font-size: 13px">SPEED (MPH)</div><div style="font-family: Oxanium, sans-serif; font-size: 24px">38,000</div></div>
          <div><div style="${label}; font-size: 13px">LAUNCHED</div><div style="font-family: Oxanium, sans-serif; font-size: 24px">SEP 1977</div></div>
          <div><div style="${label}; font-size: 13px">YEARS FLYING</div><div data-vyears style="font-family: Oxanium, sans-serif; font-size: 24px">${v.vgrYears}</div></div>
        </div>
        <div data-vstatus style=" background: rgba(255,181,71,0.12); border-left: 4px solid #FFB547; padding: 12px 16px; font-size: 16px; line-height: 1.4">${v.vgrStatus}</div>
      </a>

      <div style="display: flex; flex-direction: column; gap: 16px; min-height: 0">
        <a href="#/sky" style="border: 1px solid #1E3A4A; background: #0A1220; color: #D7E6F0; text-decoration: none; padding: 16px 22px; display: flex; align-items: center; gap: 18px">
          <div style="position: relative; width: 84px; height: 84px; flex-shrink: 0; border-radius: 50%; background: #E9E4D6; overflow: hidden"><div data-moon style="position: absolute; top: 0; width: 84px; height: 84px; border-radius: 50%; background: #0A1220; left: ${v.moonShift}px"></div></div>
          <div style="display: flex; flex-direction: column; gap: 4px">
            <div style="${label}">MOON TONIGHT</div>
            <div data-moon-name style="font-family: Oxanium, sans-serif; font-size: 21px">${v.moonName}</div>
            <div style="font-size: 15px; color: #9FBFCF"><span data-moon-lit>${v.moonLit}</span>% LIT</div>
            <div data-moon-next style="font-size: 15px; color: #FFB547">${v.moonNext}</div>
          </div>
        </a>
        <a href="#/alert" style="flex-grow: 1; min-height: 0; border: 1px solid #1E3A4A; background: #0A1220; color: #D7E6F0; text-decoration: none; padding: 16px 22px; display: flex; flex-direction: column; gap: 6px; overflow: hidden">
          <div class="glow-c" style="font-size: 14px; letter-spacing: 3px">SPACE STATION</div>
          <div data-iss-title style="font-family: Oxanium, sans-serif; font-size: 22px">CALCULATING…</div>
          <div data-iss-time style="font-family: Oxanium, sans-serif; font-size: 38px; color: #FFB547; line-height: 1">--:--</div>
          <div data-iss-sub style="font-size: 15px; color: #9FBFCF; line-height: 1.35">&nbsp;</div>
          <div data-iss-tip style="font-size: 14px; line-height: 1.4; color: #D7E6F0; border-left: 3px solid var(--glow); padding-left: 10px; margin-top: 4px; display: none">LOOKS LIKE A BRIGHT, STEADY STAR GLIDING ACROSS THE SKY. NO BLINKING LIGHTS, NO SOUND.</div>
          <div style="margin-top: auto; border-top: 1px solid #1E3A4A; padding-top: 10px; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px">
            <div><div style="${label}; font-size: 13px">ABOARD</div><div data-iss-crew style="font-family: Oxanium, sans-serif; font-size: 21px">--</div></div>
            <div><div style="${label}; font-size: 13px">MPH</div><div style="font-family: Oxanium, sans-serif; font-size: 21px">17,500</div></div>
            <div><div style="${label}; font-size: 13px">MILES UP</div><div style="font-family: Oxanium, sans-serif; font-size: 21px">250</div></div>
          </div>
        </a>
        <a href="#/departures" style="border: 1px solid #1E3A4A; background: #0A1220; padding: 12px 22px; text-decoration: none; color: #D7E6F0; display: flex; flex-direction: column; gap: 4px">
          <div data-dep-title class="glow-c" style="font-size: 14px; letter-spacing: 3px">DEPARTURES</div>
          <div data-dep-line style="font-size: 15px; line-height: 1.35; max-height: 61px; overflow: hidden">LOADING BOARD…</div>
        </a>
      </div>
    </div>

    <div style="display: grid; grid-template-columns: repeat(${navLinks.length}, minmax(0, 1fr)); gap: 12px">
      ${navLinks.map(([href, text]) => `<a href="${href}" style="${navBtn}"${href === '#/trivia' ? ' data-trivia' : ''}>${text}</a>`).join('')}
    </div>
  </div>`;

  const $ = (s) => el.querySelector(s);
  const root = $('.tbb');

  $('[data-glow]').addEventListener('click', () => {
    glow = GLOWS[(GLOWS.indexOf(glow) + 1) % GLOWS.length];
    try { localStorage.setItem('bridge.glow', glow); } catch (e) { /* storage off */ }
    root.style.setProperty('--glow', glow);
  });

  // ---- clock / Voyager / Moon: every second, like the design (only what changed is written) ----
  const shownText = {};
  const put = (sel, text) => {
    if (shownText[sel] === text) return;
    shownText[sel] = text;
    $(sel).textContent = text;
  };
  let lastMinute = '';
  timers.push(setInterval(() => {
    const n = vals();
    put('[data-vkm]', n.vgrKm);
    put('[data-vdelay]', n.vgrDelay);
    if (n.time === lastMinute) return;
    lastMinute = n.time;
    put('[data-time]', n.time);
    put('[data-date]', n.dateLine);
    put('[data-vstatus]', n.vgrStatus);
    $('[data-moon]').style.left = n.moonShift + 'px';
    put('[data-moon-name]', n.moonName);
    put('[data-moon-lit]', String(n.moonLit));
    put('[data-moon-next]', n.moonNext);
    put('[data-vyears]', String(n.vgrYears));
    everyMinute();
  }, 1000));

  let loc = null;
  let guessed = false; // couldn't find the house: showing New York until it can
  let planes = null;   // { at, list } live planes for the radar (null = nothing current to draw)
  let planesNote = null; // { at, kind: 'live' | 'last' | 'sample' } for the line under the count
  let board = null;    // { at, title, line, live }
  let iss = null;      // { p, oldOrbit }

  // ---- trivia: show on the TRIVIA button when today's question is still waiting ----
  function triviaBadge() {
    const btn = $('[data-trivia]');
    const q = read(QOTD_KEY);
    const waiting = !q || q.day !== dayKey() || !q.answered;
    const want = waiting ? 'TRIVIA<span class="tbb-q">★ TODAY’S QUESTION</span>' : 'TRIVIA';
    if (btn.innerHTML !== want) btn.innerHTML = want;
  }

  function everyMinute() {
    if (!alive) return;
    triviaBadge();
    drawPlanesNote();
    drawIss();
    if (board && !board.live) drawBoard();
  }

  function drawRadar() {
    if (!alive) return;
    if (!planes) { $('[data-blips]').innerHTML = ''; return; }
    const dt = (Date.now() - planes.at) / 1000;
    const list = planes.list.map((a) => advance(a, loc, dt)).filter((a) => !a.onGround && a.dst <= RADIUS_NM);
    $('[data-blips]').innerHTML = list.slice(0, 12).map((a) => {
      const r = (Math.min(a.dst, RADIUS_NM) / RADIUS_NM) * 90;
      const x = 100 + Math.sin((a.dir * Math.PI) / 180) * r - 10;
      const y = 100 - Math.cos((a.dir * Math.PI) / 180) * r - 10;
      return `<div style="position: absolute; left: ${x.toFixed(1)}px; top: ${y.toFixed(1)}px; width: 20px; height: 20px; transform: rotate(${Math.round(a.track)}deg)"><svg width="20" height="20" viewBox="0 0 24 24" fill="#FFB547" aria-hidden="true">${PLANE}</svg></div>`;
    }).join('');
  }

  // The small line under the plane count: where the numbers come from and how old they are.
  function drawPlanesNote() {
    const sm = $('[data-sample]');
    const n = planesNote;
    if (!n) return;
    let text, warn = true;
    if (n.kind === 'sample') text = offline() ? 'SAMPLE · THE WI-FI IS OFF' : 'SAMPLE · NO LIVE FEED';
    else if (n.kind === 'last') text = `${offline() ? 'WI-FI OFF' : 'NO LIVE FEED'} · LAST SEEN ${ago(n.at)}`;
    else if (Date.now() - n.at >= 2 * 60000) text = `LAST UPDATE ${ago(n.at)}`;
    else { text = 'WITHIN 25 MILES'; warn = false; }
    sm.textContent = text;
    sm.style.color = warn ? '#FFB547' : '#8FB0C0';
  }

  // hex: the closest plane, so a tap opens the radar with that very plane picked.
  function showPlanes(count, flight, sub, hex) {
    $('[data-count]').textContent = `${count} PLANE${count === 1 ? '' : 'S'}`;
    $('[data-c-flight]').textContent = flight;
    $('[data-c-sub]').textContent = sub;
    $('[data-planes]').setAttribute('href', hex ? `#/flights/${encodeURIComponent(hex)}` : '#/flights');
  }

  async function loadPlanes() {
    try {
      const data = await getAircraft(loc);
      if (!alive) return;
      const last = read(LAST_PLANES);
      if (data.sample && last && Date.now() - last.at < 6 * 3600000 && !guessed) {
        // The feed is down: the last real answer, with its age, beats made-up planes.
        // (The planes have moved on since, so the radar is left empty.)
        planes = null;
        planesNote = { at: last.at, kind: 'last' };
        drawRadar();
        drawPlanesNote();
        showPlanes(last.count, last.flight, last.sub);
        return;
      }
      const air = data.list.filter((a) => !a.onGround);
      planes = { at: data.at, list: air };
      planesNote = { at: data.at, kind: data.sample ? 'sample' : 'live' };
      drawPlanesNote();
      drawRadar();
      const c = air[0];
      if (!c) {
        showPlanes(0, 'CLEAR SKIES', 'NOTHING ON RADAR');
      } else {
        const route = data.sample ? c.sampleRoute : (await getRoutes([c], 1))[c.callsign];
        if (!alive) return;
        const codes = route?.from && route?.to ? ` · ${route.from.iata || route.from.city} → ${route.to.iata || route.to.city}` : '';
        showPlanes(air.length, flightLabel(c, route) + codes, `${typeName(c)}
${fmtAlt(c)}${trend(c) ? ' ' + trend(c) : ''} · ${fmtMiles(c.dst)} ${compassShort(c.dir)}`, c.hex);
      }
      if (!data.sample && !guessed) {
        write(LAST_PLANES, { at: data.at, count: air.length, flight: $('[data-c-flight]').textContent, sub: $('[data-c-sub]').textContent });
      }
    } catch (e) {
      console.error(e);
      if (alive && !planesNote) {
        $('[data-c-flight]').textContent = 'RADAR OFFLINE';
        $('[data-c-sub]').textContent = offline() ? 'THE WI-FI IS OFF' : 'TRYING AGAIN SHORTLY';
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
      $('[data-iss-title]').textContent = 'PASS TIMES UNAVAILABLE';
      $('[data-iss-time]').textContent = '--:--';
      $('[data-iss-sub]').textContent = `ITS LATEST ORBIT IS ${iss.ageDays} DAYS OLD, TOO OLD TO GIVE TIMES · `
        + (offline() ? 'THE WI-FI IS OFF' : 'CHECKING AGAIN EVERY 15 MIN');
      $('[data-iss-tip]').style.display = 'none';
      return;
    }
    if (!p) {
      $('[data-iss-title]').textContent = 'NOT VISIBLE THIS WEEK';
      $('[data-iss-time]').textContent = '--:--';
      $('[data-iss-sub]').textContent = 'IT PASSES IN DAYLIGHT OR TOO LOW FOR NOW';
      $('[data-iss-tip]').style.display = 'none';
      return;
    }
    const start = new Date(p.visStart);
    const today = new Date();
    const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    const mins = Math.max(1, Math.round((p.visEnd - p.visStart) / 60000));
    let title;
    if (p.visStart <= now) title = 'OVERHEAD NOW · LOOK UP';
    else if (start.toDateString() === today.toDateString()) title = start.getHours() >= 17 || start.getHours() < 4 ? 'VISIBLE TONIGHT' : 'VISIBLE TODAY';
    else if (start.toDateString() === tomorrow.toDateString()) title = start.getHours() < 4 && today.getHours() >= 12 ? 'VISIBLE TONIGHT' : start.getHours() < 12 ? 'VISIBLE TOMORROW MORNING' : 'VISIBLE TOMORROW';
    else title = 'VISIBLE ' + start.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
    $('[data-iss-title]').textContent = title;
    $('[data-iss-time]').textContent = fmtTime(p.visStart);
    $('[data-iss-sub]').textContent = `LOOK ${compass(p.visAz)} · ${brightnessWords(p).replace(', LOW DOWN', '')} ·${heightWords(p.visMaxEl || 0).toUpperCase()} · ${mins} MIN`;
    $('[data-iss-tip]').style.display = 'block';
  }

  function drawCrew(c) {
    const cell = $('[data-iss-crew]');
    if (c && c.onIss) { cell.textContent = String(c.onIss); cell.style.fontSize = '21px'; return; }
    // Never fetched (no Wi-Fi since it was switched on): say so instead of a bare "--".
    cell.textContent = offline() ? 'NO WI-FI' : 'NOT YET';
    cell.style.fontSize = '15px';
  }

  async function loadIss() {
    getCrew().then((c) => { if (alive) drawCrew(c); }).catch(() => { if (alive) drawCrew(null); });
    try {
      // Look up to 6 days ahead (the day name is only clear within a week).
      // Two days ahead first (the same sums the alert check shares); six days only when
      // those two have nothing to see, which is three times the work.
      const p = await nextVisiblePass(loc, 48) || await nextVisiblePass(loc, 144);
      let st = { ok: true, ageDays: 0 };
      try { st = await orbitStatus(); } catch (err) { /* keep quiet */ }
      if (!alive) return;
      iss = { p, orbitOk: st.ok, ageDays: st.ageDays };
      drawIss();
      // Turn to "OVERHEAD NOW" as it starts, and on to the next pass once it's gone.
      clearTimeout(issTimer);
      if (p) {
        const next = p.visStart > Date.now() ? p.visStart : p.visEnd + 60000;
        if (next - Date.now() < 15 * 60000) issTimer = setTimeout(() => { if (Date.now() > p.visEnd) loadIss(); else drawIss(); }, Math.max(1000, next - Date.now() + 500));
      }
    } catch (e) {
      console.error(e);
      if (!alive) return;
      // Keep the pass we had if it's still to come; otherwise say so plainly.
      if (iss && iss.p && iss.p.visEnd > Date.now()) return;
      iss = null;
      $('[data-iss-title]').textContent = 'PASS TIMES UNAVAILABLE';
      $('[data-iss-time]').textContent = '--:--';
      $('[data-iss-sub]').textContent = offline() ? 'THE WI-FI IS OFF' : 'TRYING AGAIN SHORTLY';
      $('[data-iss-tip]').style.display = 'none';
    }
  }

  // ---- departures: one line on the deck ----
  function drawBoard() {
    if (!board) return;
    $('[data-dep-title]').textContent = board.title;
    const old = !board.live && !board.sample;
    $('[data-dep-line]').textContent = board.line + (old ? ` · ${offline() ? 'WI-FI OFF' : 'NO LIVE FEED'} · SEEN ${ago(board.at)}` : '');
    $('[data-dep-line]').style.color = old ? '#FFB547' : '#D7E6F0';
  }

  async function loadBoard() {
    try {
      const b = await getBoard(loc);
      if (!alive) return;
      const last = read(LAST_BOARD);
      if (b.sample && last && Date.now() - last.at < 6 * 3600000 && !guessed) {
        board = Object.assign({}, last, { live: false, sample: false });
      } else if (b.sample) {
        const next = b.departures.find((r) => r.s !== 'DEPARTED') || b.departures[0];
        board = { title: 'SAMPLE DEPARTURES', line: next ? `NEXT OUT: ${next.f} TO ${next.d} · ${fmtTime(next.time)}` : 'NO SAMPLE FLIGHTS', live: true, sample: true, at: Date.now() };
      } else if (!b.airport) {
        // Nothing within 30 miles: name the nearest airport the planes overhead are using.
        const n = (b.nearby || [])[0];
        board = { title: 'DEPARTURES', line: n ? `NONE WITHIN 30 MI RIGHT NOW · NEAREST IN USE: ${(n.city || n.iata).toUpperCase()} (${n.iata}), ${n.mi} MI ${n.side}` : 'NO AIRPORT TRAFFIC NEARBY RIGHT NOW', live: true, at: b.at || Date.now() };
      } else {
        const lastOut = b.departures[0];
        board = { title: `${b.airport.iata} DEPARTURES`, line: lastOut ? `LATEST OUT: ${lastOut.f} TO ${lastOut.d} · ${fmtTime(lastOut.time)}` : 'NO DEPARTURES IN THE AIR RIGHT NOW', live: true, at: b.at || Date.now() };
      }
      if (board.live && !board.sample && !guessed) write(LAST_BOARD, { title: board.title, line: board.line, at: board.at });
      drawBoard();
    } catch (e) {
      console.error(e);
      if (!alive) return;
      if (board) { board.live = false; drawBoard(); }
      else $('[data-dep-line]').textContent = offline() ? 'BOARD OFFLINE · THE WI-FI IS OFF' : 'BOARD OFFLINE · TRYING AGAIN SHORTLY';
    }
  }

  async function watchAlerts() {
    try {
      const a = await checkAlerts(loc);
      if (!alive || !a || wasSeen(a.id)) return;
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
    loadBoard();
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
    if (!alive) return;
    $('[data-over]').textContent = guessed ? 'TOWN NOT FOUND YET · SHOWING NEW YORK' : 'OVER YOUR HOUSE NOW';
    $('[data-over]').style.color = guessed ? '#FFB547' : '#8FB0C0';
  }

  triviaBadge();
  (async () => {
    await findHome();
    if (!alive || me !== visit) return;
    loadAll();
    watchAlerts();
    timers.push(setInterval(drawRadar, 2000));
    timers.push(setInterval(loadPlanes, 90 * 1000));
    timers.push(setInterval(loadBoard, 3 * 60 * 1000));
    timers.push(setInterval(loadIss, 15 * 60 * 1000));
    timers.push(setInterval(watchAlerts, 60 * 1000));
    // Still guessing where the house is: ask again every 5 minutes, and redo the panels once found.
    timers.push(setInterval(async () => {
      if (!guessed) return;
      await findHome();
      if (alive && !guessed) loadAll();
    }, 5 * 60 * 1000));
  })();

  // The Wi-Fi came back: fresh panels now rather than in a few minutes.
  onOnline = () => {
    if (!alive || !loc) return;
    if (guessed) findHome().then(() => { if (alive) loadAll(); });
    else loadAll();
  };
  window.addEventListener('online', onOnline);
}

export function unmount() {
  alive = false;
  timers.forEach(clearInterval);
  timers = [];
  clearTimeout(issTimer);
  issTimer = 0;
  window.removeEventListener('online', onOnline);
  onOnline = null;
}
