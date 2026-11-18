// Tom · Flight deck home screen (Bridge.dc.html in the design)
import { getLocation } from '../services/location.js';
import { feature } from '../services/features.js';
import {
  getAircraft, getRoutes, advance, flightLabel, typeName, fmtAlt, compass, RADIUS_NM,
} from '../services/aircraft.js';
import { nextVisiblePass, getCrew } from '../services/iss.js';
import { getBoard } from '../services/departures.js';
import { checkAlerts, wasSeen, markSeen } from '../services/skyalert.js';

const GLOWS = ['#5CE1E6', '#7CF29A', '#B69CFF'];
const PLANE = '<path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"></path>';

let timers = [];
let alive = false;

const pad = (n) => String(n).padStart(2, '0');
const fmt12 = (t) => new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

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
  const names = ['NEW MOON', 'WAXING CRESCENT', 'FIRST QUARTER', 'WAXING GIBBOUS', 'FULL MOON', 'WANING GIBBOUS', 'LAST QUARTER', 'WANING CRESCENT'];
  const shift = (p < 0.5 ? -1 : 1) * Math.round((lit / 100) * 84);
  return {
    time: pad(now.getHours()) + ':' + pad(now.getMinutes()),
    dateLine: now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase(),
    vgrKm: Math.round(km).toLocaleString('en-US'),
    vgrDelay: Math.floor(secs / 3600) + 'H ' + pad(Math.floor((secs % 3600) / 60)) + 'M ' + pad(secs % 60) + 'S',
    vgrStatus: until > 0
      ? 'IN ' + Math.ceil(until / 3600000) + ' HOURS IT BECOMES THE FIRST HUMAN-MADE OBJECT ONE LIGHT-DAY FROM EARTH.'
      : 'CROSSED ONE LIGHT-DAY FROM EARTH ON NOV 18, 2026. NOTHING WE HAVE BUILT HAS GONE FARTHER.',
    moonName: names[Math.round(p * 8) % 8],
    moonLit: lit,
    moonShift: shift,
  };
}

export function mount(el) {
  alive = true;
  let glow = localStorage.getItem('bridge.glow') || GLOWS[0];
  const v = vals();
  const navBtn = 'min-height: 60px; border: 1px solid #1E3A4A; background: #0A1220; text-decoration: none; font-family: Oxanium, sans-serif; font-size: 15px; font-weight: 700; letter-spacing: 3px; display: flex; align-items: center; justify-content: center';
  // The design's chips are DEEP IMAGE + VIEWSCREEN. Apps/Camera appear only if you
  // switch them on from the dashboard (max three chips so the header stays one line).
  const extraChips = [
    feature('apps') && ['#/apps', 'APPS'],
    feature('camera') && ['#/camera', 'CAMERA'],
    ['#/deepimage', 'DEEP IMAGE'],
    ['#/viewscreen', 'VIEWSCREEN'],
  ].filter(Boolean).slice(0, 3);
  const chip = 'min-height: 44px; padding: 10px 12px; box-sizing: border-box; border: 1px solid #1E3A4A; font-size: 13px; letter-spacing: 2px; display: flex; align-items: center; white-space: nowrap';

  el.innerHTML = `
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Oxanium:wght@300;500;700&family=JetBrains+Mono:wght@400;600&display=swap">
  <style>
    .tbb a{color:#5CE1E6}.tbb a:hover{color:#A8F2F4}
    @keyframes tbb-blink{50%{opacity:.25}}
    @keyframes tbb-sweep{to{transform:rotate(360deg)}}
    .tbb .blink{animation:tbb-blink 2.4s ease-in-out infinite}
    .tbb .sweep{position:absolute;top:0;right:0;bottom:0;left:0;border-radius:50%;background:conic-gradient(from 0deg,rgba(92,225,230,0) 0deg,rgba(92,225,230,0) 300deg,rgba(92,225,230,.4) 360deg);animation:tbb-sweep 5s linear infinite}
    .tbb .glow-c{color:var(--glow)}
    .tbb-dim{opacity:.55}
  </style>
  <div class="tbb" style="--glow:${glow};width: 1280px; height: 800px; box-sizing: border-box; padding: 28px 40px; background: #05070D; color: #D7E6F0; font-family: 'JetBrains Mono', monospace; display: flex; flex-direction: column; gap: 20px">
    <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #1E3A4A; padding-bottom: 14px">
      <div style="display: flex; align-items: center; gap: 14px">
        <button data-glow aria-label="Change deck colour" style="width:44px;height:44px;margin:-16px -8px -16px -16px;padding:0;border:0;background:none;cursor:pointer;display:flex;align-items:center;justify-content:center">
          <span class="blink" style="width: 12px; height: 12px; border-radius: 50%; background: var(--glow)"></span>
        </button>
        <div class="glow-c" style="font-family: Oxanium, sans-serif; font-size: 24px; font-weight: 700; letter-spacing: 6px; white-space: nowrap">CAPTAIN TOM · FLIGHT DECK</div>
      </div>
      <div style="display: flex; gap: 20px; align-items: center">
        <div style="display: flex; gap: 8px; margin: -8px 0">
          ${extraChips.map(([href, label]) => `<a href="${href}" style="${chip}">${label}</a>`).join('')}
        </div>
        <div data-date style="font-size: 16px; letter-spacing: 3px; color: #7FA6B8; white-space: nowrap">${v.dateLine}</div>
        <div data-time style="font-family: Oxanium, sans-serif; font-size: 34px; font-weight: 300; color: #FFB547">${v.time}</div>
      </div>
    </div>

    <div style="flex-grow: 1; display: grid; grid-template-columns: 1fr 1.35fr 1fr; gap: 20px; min-height: 0">
      <a href="#/flights" style="border: 1px solid #1E3A4A; background: #0A1220; padding: 22px; text-decoration: none; color: #D7E6F0; display: flex; flex-direction: column; gap: 14px; min-width: 0">
        <div style="font-size: 13px; letter-spacing: 4px; color: #7FA6B8; display:flex; justify-content:space-between">OVER YOUR HOUSE RIGHT NOW<span data-sample style="color:#FFB547"></span></div>
        <div style="align-self: center; position: relative; width: 210px; height: 210px; border-radius: 50%; border: 2px solid var(--glow); box-sizing: border-box; overflow: hidden; flex-shrink: 0">
          <div class="sweep"></div>
          <div style="position: absolute; top:52px;right:52px;bottom:52px;left:52px; border-radius: 50%; border: 1px solid #1E3A4A"></div>
          <div style="position: absolute; left: 50%; top: 50%; width: 8px; height: 8px; border-radius: 50%; background: #FFFFFF; transform: translate(-50%, -50%)"></div>
          <div data-blips></div>
        </div>
        <div data-count style="font-family: Oxanium, sans-serif; font-size: 40px; text-align: center; color: #FFB547; line-height: 1">— PLANES</div>
        <div style="margin-top: auto; border-top: 1px solid #1E3A4A; padding-top: 12px; display: flex; flex-direction: column; gap: 4px; min-width: 0">
          <div class="glow-c" style="font-size: 12px; letter-spacing: 3px">CLOSEST</div>
          <div data-c-flight style="font-family: Oxanium, sans-serif; font-size: 20px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">SCANNING…</div>
          <div data-c-sub style="font-size: 14px; color: #7FA6B8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">&nbsp;</div>
        </div>
      </a>

      <a href="#/missions" style="border: 1px solid var(--glow); background: #0A1220; color: #D7E6F0; text-decoration: none; clip-path: polygon(0 0, calc(100% - 32px) 0, 100% 32px, 100% 100%, 32px 100%, 0 calc(100% - 32px)); padding: 28px 32px; display: flex; flex-direction: column; gap: 12px">
        <div style="display: flex; justify-content: space-between; font-size: 13px; letter-spacing: 4px"><span class="glow-c">VOYAGER 1 · FARTHEST EVER</span><span style="color: #7FA6B8">LAUNCHED 1977</span></div>
        <div style="font-size: 14px; letter-spacing: 3px; color: #7FA6B8; margin-top: 8px">DISTANCE FROM EARTH (KM)</div>
        <div data-vkm style="font-family: Oxanium, sans-serif; font-size: 56px; font-weight: 500; line-height: 1; color: #FFB547">${v.vgrKm}</div>
        <div style="font-size: 14px; letter-spacing: 3px; color: #7FA6B8; margin-top: 10px">A SIGNAL SENT NOW ARRIVES IN</div>
        <div data-vdelay style="font-family: Oxanium, sans-serif; font-size: 44px; font-weight: 300; line-height: 1">${v.vgrDelay}</div>
        <div data-vstatus style="margin-top: auto; background: rgba(255,181,71,0.12); border-left: 4px solid #FFB547; padding: 12px 16px; font-size: 15px; line-height: 1.4">${v.vgrStatus}</div>
      </a>

      <div style="display: flex; flex-direction: column; gap: 20px; min-height: 0">
        <a href="#/sky" style="border: 1px solid #1E3A4A; background: #0A1220; color: #D7E6F0; text-decoration: none; padding: 20px 22px; display: flex; align-items: center; gap: 18px">
          <div style="position: relative; width: 84px; height: 84px; flex-shrink: 0; border-radius: 50%; background: #E9E4D6; overflow: hidden"><div data-moon style="position: absolute; top: 0; width: 84px; height: 84px; border-radius: 50%; background: #0A1220; left: ${v.moonShift}px"></div></div>
          <div style="display: flex; flex-direction: column; gap: 4px">
            <div style="font-size: 12px; letter-spacing: 3px; color: #7FA6B8">MOON TONIGHT</div>
            <div data-moon-name style="font-family: Oxanium, sans-serif; font-size: 20px">${v.moonName}</div>
            <div style="font-size: 13px; color: #7FA6B8"><span data-moon-lit>${v.moonLit}</span>% LIT</div>
          </div>
        </a>
        <a href="#/alert" style="flex-grow: 1; border: 1px solid #1E3A4A; background: #0A1220; color: #D7E6F0; text-decoration: none; padding: 20px 22px; display: flex; flex-direction: column; gap: 8px">
          <div class="glow-c" style="font-size: 12px; letter-spacing: 3px">SPACE STATION</div>
          <div data-iss-title style="font-family: Oxanium, sans-serif; font-size: 22px">CALCULATING…</div>
          <div data-iss-time style="font-family: Oxanium, sans-serif; font-size: 36px; color: #FFB547; line-height: 1">--:--</div>
          <div data-iss-sub style="font-size: 14px; color: #7FA6B8">&nbsp;</div>
          <div style="margin-top: auto; border-top: 1px solid #1E3A4A; padding-top: 12px; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px">
            <div><div style="font-size: 11px; letter-spacing: 2px; color: #7FA6B8">ABOARD</div><div data-iss-crew style="font-family: Oxanium, sans-serif; font-size: 20px">--</div></div>
            <div><div style="font-size: 11px; letter-spacing: 2px; color: #7FA6B8">MPH</div><div style="font-family: Oxanium, sans-serif; font-size: 20px">17,500</div></div>
            <div><div style="font-size: 11px; letter-spacing: 2px; color: #7FA6B8">MILES UP</div><div style="font-family: Oxanium, sans-serif; font-size: 20px">250</div></div>
          </div>
        </a>
        <a href="#/departures" style="border: 1px solid #1E3A4A; background: #0A1220; padding: 16px 22px; text-decoration: none; color: #D7E6F0; display: flex; flex-direction: column; gap: 4px">
          <div data-dep-title class="glow-c" style="font-size: 12px; letter-spacing: 3px">DEPARTURES</div>
          <div data-dep-line style="font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">LOADING BOARD…</div>
        </a>
      </div>
    </div>

    <div style="display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px">
      <a href="#/flights" style="${navBtn}">PLANES OVERHEAD</a>
      <a href="#/departures" style="${navBtn}">DEPARTURES</a>
      <a href="#/sky" style="${navBtn}">TONIGHT'S SKY</a>
      <a href="#/missions" style="${navBtn}">SPACE MISSIONS</a>
      <a href="#/trivia" style="${navBtn}">TRIVIA</a>
    </div>
  </div>`;

  const $ = (s) => el.querySelector(s);
  const root = $('.tbb');

  $('[data-glow]').addEventListener('click', () => {
    glow = GLOWS[(GLOWS.indexOf(glow) + 1) % GLOWS.length];
    localStorage.setItem('bridge.glow', glow);
    root.style.setProperty('--glow', glow);
  });

  // ---- clock / Voyager / Moon: every second, like the design ----
  timers.push(setInterval(() => {
    const n = vals();
    $('[data-time]').textContent = n.time;
    $('[data-date]').textContent = n.dateLine;
    $('[data-vkm]').textContent = n.vgrKm;
    $('[data-vdelay]').textContent = n.vgrDelay;
    $('[data-vstatus]').textContent = n.vgrStatus;
    $('[data-moon]').style.left = n.moonShift + 'px';
    $('[data-moon-name]').textContent = n.moonName;
    $('[data-moon-lit]').textContent = n.moonLit;
  }, 1000));

  let loc = null;
  let planes = null; // { at, list, sample }

  function drawRadar() {
    if (!planes || !alive) return;
    const dt = (Date.now() - planes.at) / 1000;
    const list = planes.list.map((a) => advance(a, loc, dt)).filter((a) => !a.onGround && a.dst <= RADIUS_NM);
    $('[data-blips]').innerHTML = list.slice(0, 12).map((a) => {
      const r = (Math.min(a.dst, RADIUS_NM) / RADIUS_NM) * 95;
      const x = 105 + Math.sin((a.dir * Math.PI) / 180) * r - 10;
      const y = 105 - Math.cos((a.dir * Math.PI) / 180) * r - 10;
      return `<div style="position: absolute; left: ${x.toFixed(1)}px; top: ${y.toFixed(1)}px; width: 20px; height: 20px; transform: rotate(${Math.round(a.track)}deg)"><svg width="20" height="20" viewBox="0 0 24 24" fill="#FFB547" aria-hidden="true">${PLANE}</svg></div>`;
    }).join('');
  }

  async function loadPlanes() {
    try {
      const data = await getAircraft(loc);
      if (!alive) return;
      const air = data.list.filter((a) => !a.onGround);
      planes = { at: data.at, list: air, sample: data.sample };
      $('[data-sample]').textContent = data.sample ? 'SAMPLE' : '';
      $('[data-count]').textContent = `${air.length} PLANE${air.length === 1 ? '' : 'S'}`;
      drawRadar();
      const c = air[0];
      if (!c) {
        $('[data-c-flight]').textContent = 'CLEAR SKIES';
        $('[data-c-sub]').textContent = 'NOTHING ON RADAR';
        return;
      }
      const route = data.sample ? c.sampleRoute : (await getRoutes([c], 1))[c.callsign];
      if (!alive) return;
      const codes = route?.from && route?.to ? ` · ${route.from.iata || route.from.city} → ${route.to.iata || route.to.city}` : '';
      $('[data-c-flight]').textContent = flightLabel(c, route) + codes;
      $('[data-c-sub]').textContent = `${typeName(c)} · ${fmtAlt(c)}`;
    } catch (e) {
      console.error(e);
    }
  }

  async function loadIss() {
    try {
      getCrew().then((c) => { if (alive && c.onIss) $('[data-iss-crew]').textContent = String(c.onIss); }).catch(() => {});
      // Look up to 6 days ahead (the day name below is only clear within a week).
      const p = await nextVisiblePass(loc, 144);
      if (!alive) return;
      if (!p) {
        $('[data-iss-title]').textContent = 'NOT VISIBLE THIS WEEK';
        $('[data-iss-time]').textContent = '--:--';
        $('[data-iss-sub]').textContent = 'IT PASSES IN DAYLIGHT OR TOO LOW FOR NOW';
        return;
      }
      const now = Date.now();
      const start = new Date(p.visStart);
      const today = new Date();
      const tomorrow = new Date(today.getTime() + 86400000);
      const mins = Math.max(1, Math.round((p.visEnd - p.visStart) / 60000));
      let title;
      if (p.visStart <= now) title = 'OVERHEAD NOW';
      else if (start.toDateString() === today.toDateString()) title = start.getHours() >= 17 || start.getHours() < 4 ? 'VISIBLE TONIGHT' : 'VISIBLE TODAY';
      else if (start.toDateString() === tomorrow.toDateString()) title = start.getHours() < 12 ? 'VISIBLE TOMORROW AM' : 'VISIBLE TOMORROW';
      else title = 'VISIBLE ' + start.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
      $('[data-iss-title]').textContent = title;
      $('[data-iss-time]').textContent = fmt12(p.visStart);
      $('[data-iss-sub]').textContent = `LOOK ${compass(p.visAz)} · ${mins} MIN`;
    } catch (e) {
      console.error(e);
      $('[data-iss-title]').textContent = 'PASS DATA OFFLINE';
    }
  }

  async function loadBoard() {
    try {
      const b = await getBoard(loc);
      if (!alive) return;
      if (b.sample) {
        const next = b.departures.find((r) => r.s !== 'DEPARTED') || b.departures[0];
        $('[data-dep-title]').textContent = 'SAMPLE DEPARTURES';
        $('[data-dep-line]').textContent = `NEXT OUT: ${next.f} TO ${next.d} · ${fmt12(next.time)}`;
      } else if (!b.airport) {
        $('[data-dep-title]').textContent = 'DEPARTURES';
        $('[data-dep-line]').textContent = 'NO AIRPORT TRAFFIC NEARBY RIGHT NOW';
      } else {
        const last = b.departures[0];
        $('[data-dep-title]').textContent = `${b.airport.iata} DEPARTURES`;
        $('[data-dep-line]').textContent = last ? `LATEST OUT: ${last.f} TO ${last.d} · ${fmt12(last.time)}` : 'NO DEPARTURES IN THE AIR RIGHT NOW';
      }
    } catch (e) {
      console.error(e);
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

  (async () => {
    try {
      loc = await getLocation();
    } catch (e) {
      console.error(e);
      loc = { lat: 40.7128, lon: -74.006, town: '' }; // can't find the house: fall back so the deck still works
    }
    if (!alive) return;
    loadPlanes();
    loadIss();
    loadBoard();
    watchAlerts();
    timers.push(setInterval(drawRadar, 2000));
    timers.push(setInterval(loadPlanes, 90 * 1000));
    timers.push(setInterval(loadBoard, 3 * 60 * 1000));
    timers.push(setInterval(loadIss, 15 * 60 * 1000));
    timers.push(setInterval(watchAlerts, 60 * 1000));
  })();
}

export function unmount() {
  alive = false;
  timers.forEach(clearInterval);
  timers = [];
}
