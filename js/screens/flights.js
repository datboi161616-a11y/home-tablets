// Tom · Planes over your house, live radar (Flights.dc.html in the design)
import { getLocation } from '../services/location.js';
import {
  getAircraft, getRoutes, advance, flightLabel, typeName, airlineOf, routeText, fmtAlt, fmtSpd, RADIUS_NM, getAircraftInfo,
  compass, fmtMiles, trend, trendWord,
} from '../services/aircraft.js';

const PLANE = '<path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"></path>';
const MAX_ON_RADAR = 16;
const MAX_ROWS = 7;

let timers = [];
let alive = false;

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function mount(el) {
  alive = true;
  el.innerHTML = `
  <link rel="stylesheet" crossorigin href="https://fonts.googleapis.com/css2?family=Oxanium:wght@300;500;700&family=JetBrains+Mono:wght@400;600&display=swap">
  <style>
    .tbf a{color:#5CE1E6}.tbf a:hover{color:#A8F2F4}
    @keyframes tbf-sweep{to{transform:rotate(360deg)}}
    .tbf .sweep{position:absolute;top:0;right:0;bottom:0;left:0;border-radius:50%;background:conic-gradient(from 0deg,rgba(92,225,230,0) 0deg,rgba(92,225,230,0) 310deg,rgba(92,225,230,.35) 360deg);animation:tbf-sweep 5s linear infinite}
    .tbf-blip{position:absolute;display:flex;flex-direction:column;align-items:center;gap:2px;padding:10px;margin:-10px;background:none;border:0;font-family:inherit;cursor:pointer;transition:left 1s linear,top 1s linear}
    .tbf-row{width:100%;min-height:44px;display:grid;grid-template-columns:120px minmax(0,1fr) 130px;gap:10px;align-items:center;padding:6px 14px;text-align:left;font-family:inherit;color:#D7E6F0;cursor:pointer;background:#0A1220;border:1px solid #1E3A4A}
    .tbf-row.on{background:#10233A;border-color:#FFB547}
    .tbf-row > span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  </style>
  <div class="tbf" style="width: 1280px; height: 800px; box-sizing: border-box; padding: 28px 40px; background: #05070D; color: #D7E6F0; font-family: 'JetBrains Mono', monospace; display: flex; flex-direction: column; gap: 20px">
    <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #1E3A4A; padding-bottom: 14px">
      <div style="display: flex; align-items: center; gap: 16px">
        <a href="#/bridge" style="min-height: 44px; padding: 10px 18px; box-sizing: border-box; border: 1px solid #1E3A4A; text-decoration: none; font-size: 14px; letter-spacing: 3px; display: flex; align-items: center">◂ DECK</a>
        <div style="font-family: Oxanium, sans-serif; font-size: 24px; font-weight: 700; letter-spacing: 6px; color: #5CE1E6">PLANES OVER YOUR HOUSE</div>
      </div>
      <div data-status style="font-size: 14px; letter-spacing: 2px; color: #7FA6B8; white-space: nowrap">SCANNING · 25-MILE RADIUS</div>
    </div>
    <div style="flex-grow: 1; display: grid; grid-template-columns: 600px minmax(0, 1fr); gap: 28px; min-height: 0">
      <div style="position: relative; border: 1px solid #1E3A4A; background: #0A1220; display: flex; align-items: center; justify-content: center">
        <div style="position: absolute; left: 14px; bottom: 12px; display: flex; gap: 18px; font-size: 12px; letter-spacing: 1px; color: #7FA6B8">
          <span><span style="color: #FFB547">■</span> PICKED</span><span><span style="color: #5CE1E6">■</span> AIRLINE / PRIVATE</span><span><span style="color: #7CF29A">■</span> MILITARY</span>
        </div>
        <div data-radar style="position: relative; width: 560px; height: 560px; border-radius: 50%; border: 2px solid #5CE1E6; box-sizing: border-box; overflow: hidden; background: #070C18">
          <div class="sweep"></div>
          <div style="position: absolute; top:93px;right:93px;bottom:93px;left:93px; border-radius: 50%; border: 1px solid #1E3A4A"></div>
          <div style="position: absolute; top:186px;right:186px;bottom:186px;left:186px; border-radius: 50%; border: 1px solid #1E3A4A"></div>
          <div style="position: absolute; left: 50%; top: 0; bottom: 0; width: 1px; background: #1E3A4A"></div>
          <div style="position: absolute; top: 50%; left: 0; right: 0; height: 1px; background: #1E3A4A"></div>
          <div style="position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); display: flex; flex-direction: column; align-items: center; gap: 4px"><div style="width: 12px; height: 12px; border-radius: 50%; background: #FFFFFF"></div><span style="font-size: 12px; color: #FFFFFF">HOME</span></div>
          <div style="position: absolute; top: 284px; left: 378px; font-size: 11px; color: #3C6478">9 MI</div>
          <div style="position: absolute; top: 284px; left: 471px; font-size: 11px; color: #3C6478">18 MI</div>
          <div data-blips></div>
          <div style="position: absolute; top: 14px; left: 50%; transform: translateX(-50%); font-size: 13px; color: #5CE1E6">N</div>
        </div>
      </div>
      <div style="display: flex; flex-direction: column; gap: 14px; min-height: 0; min-width: 0">
        <div style="border: 1px solid #FFB547; background: #0A1220; padding: 22px 24px; display: flex; gap: 18px">
          <div data-s-photo style="display: none; width: 190px; flex: none; position: relative; background: #070C18 center/cover no-repeat; border: 1px solid #1E3A4A">
            <div data-s-reg style="position: absolute; left: 0; right: 0; bottom: 0; padding: 4px 8px; background: rgba(5,7,13,.75); font-size: 12px; color: #D7E6F0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis"></div>
          </div>
          <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 10px">
          <div style="display: flex; justify-content: space-between; align-items: baseline; gap: 12px">
            <div data-s-id style="font-family: Oxanium, sans-serif; font-size: 34px; font-weight: 500; color: #FFB547; white-space: nowrap">SCANNING…</div>
            <div data-s-airline style="font-size: 14px; color: #7FA6B8; text-align: right">&nbsp;</div>
          </div>
          <div data-s-route style="font-family: Oxanium, sans-serif; font-size: 28px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">&nbsp;</div>
          <div data-s-where style="font-size: 15px; letter-spacing: 1px; color: #5CE1E6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">&nbsp;</div>
          <div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; font-size: 14px; border-top: 1px solid #1E3A4A; padding-top: 12px">
            <div><div style="color: #7FA6B8">AIRCRAFT</div><div data-s-type style="font-size: 16px; margin-top: 2px">—</div></div>
            <div><div style="color: #7FA6B8">ALTITUDE</div><div data-s-alt style="font-size: 16px; margin-top: 2px">—</div></div>
            <div><div style="color: #7FA6B8">SPEED</div><div data-s-spd style="font-size: 16px; margin-top: 2px">—</div></div>
          </div>
          </div>
        </div>
        <div data-rows style="display: flex; flex-direction: column; gap: 14px"></div>
      </div>
    </div>
  </div>`;

  const $ = (s) => el.querySelector(s);
  let loc = null;
  let data = null;        // latest feed
  let routes = {};        // callsign -> route
  let selHex = null;
  const blips = new Map(); // hex -> element

  const routeFor = (a) => (data?.sample ? a.sampleRoute : routes[a.callsign]);
  const colorFor = (a) => (a.hex === selHex ? '#FFB547' : a.military ? '#7CF29A' : '#5CE1E6');

  function current() {
    if (!data) return [];
    const dt = (Date.now() - data.at) / 1000;
    return data.list
      .filter((a) => !a.onGround)
      .map((a) => advance(a, loc, dt))
      .filter((a) => a.dst <= RADIUS_NM)
      .sort((a, b) => a.dst - b.dst)
      .slice(0, MAX_ON_RADAR);
  }

  function select(hex) {
    selHex = hex;
    render(true);
  }

  // Radar blips are kept as live nodes (keyed by aircraft) so a tap is never lost mid-redraw.
  function drawRadar(list) {
    const host = $('[data-blips]');
    const keep = new Set();
    for (const a of list) {
      keep.add(a.hex);
      let b = blips.get(a.hex);
      if (!b) {
        b = document.createElement('button');
        b.className = 'tbf-blip';
        b.setAttribute('aria-label', 'Select flight');
        b.innerHTML = `<div data-rot style="width: 24px; height: 24px"><svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">${PLANE}</svg></div><span data-lbl style="font-size: 12px; white-space: nowrap"></span>`;
        b.addEventListener('click', () => select(a.hex));
        host.appendChild(b);
        blips.set(a.hex, b);
      }
      const r = (a.dst / RADIUS_NM) * 268;
      const x = 280 + Math.sin((a.dir * Math.PI) / 180) * r;
      const y = 280 - Math.cos((a.dir * Math.PI) / 180) * r;
      const color = colorFor(a);
      b.style.left = `${(x - 12).toFixed(1)}px`;
      b.style.top = `${(y - 12).toFixed(1)}px`;
      b.style.zIndex = a.hex === selHex ? 2 : 1;
      b.querySelector('[data-rot]').style.transform = `rotate(${Math.round(a.track)}deg)`;
      b.querySelector('svg').setAttribute('fill', color);
      const lbl = b.querySelector('[data-lbl]');
      lbl.textContent = flightLabel(a, routeFor(a));
      lbl.style.color = color;
    }
    for (const [hex, b] of blips) if (!keep.has(hex)) { b.remove(); blips.delete(hex); }
  }

  // Photo of the selected aircraft itself (when one is on file).
  let photoHex = null;
  function showPhoto(sel) {
    const hex = sel && !data?.sample ? sel.hex : null;
    if (hex === photoHex) return;
    photoHex = hex;
    const box = $('[data-s-photo]');
    box.style.display = 'none';
    if (!hex) return;
    getAircraftInfo(hex).then((info) => {
      if (!alive || photoHex !== hex || !info || !info.photo) return;
      const img = new Image();
      img.onload = () => {
        if (!alive || photoHex !== hex) return;
        box.style.backgroundImage = `url('${encodeURI(info.photo)}')`;
        $('[data-s-reg]').textContent = [info.reg, info.owner].filter(Boolean).join(' · ');
        box.style.display = 'block';
      };
      img.src = info.photo;
    });
  }

  function drawPanel(list, rebuildRows) {
    const sel = list.find((a) => a.hex === selHex);
    showPhoto(sel);
    if (!sel) {
      $('[data-s-id]').textContent = data ? 'CLEAR SKIES' : 'SCANNING…';
      $('[data-s-airline]').textContent = '';
      $('[data-s-route]').textContent = data ? 'NO PLANES IN RANGE RIGHT NOW' : '';
      $('[data-s-where]').textContent = data ? 'THE RADAR KEEPS WATCHING · CHECKS EVERY MINUTE' : '';
      ['type', 'alt', 'spd'].forEach((k) => { $(`[data-s-${k}]`).textContent = '—'; });
    } else {
      const r = routeFor(sel);
      $('[data-s-id]').textContent = flightLabel(sel, r);
      $('[data-s-airline]').textContent = r?.airline || airlineOf(sel) || (sel.reg ? `REG ${sel.reg}` : '');
      $('[data-s-route]').textContent = routeText(sel, r);
      $('[data-s-type]').textContent = typeName(sel);
      $('[data-s-alt]').textContent = `${fmtAlt(sel)} ${trend(sel)}`.trim();
      $('[data-s-where]').textContent = `${fmtMiles(sel.dst)} ${compass(sel.dir)} OF YOU · ${trendWord(sel)}`;
      $('[data-s-spd]').textContent = fmtSpd(sel);
    }
    if (!rebuildRows) return;
    const rows = list.slice(0, MAX_ROWS);
    if (sel && !rows.includes(sel)) rows[rows.length - 1] = sel;
    $('[data-rows]').innerHTML = rows.map((a) => {
      const r = routeFor(a);
      return `<button class="tbf-row${a.hex === selHex ? ' on' : ''}" data-hex="${esc(a.hex)}">
        <span style="font-family: Oxanium, sans-serif; font-size: 18px; color: ${colorFor(a)}">${esc(flightLabel(a, r))}</span>
        <span style="font-size: 14px">${esc(routeText(a, r))}</span>
        <span style="font-size: 14px; color: #7FA6B8; text-align: right">${esc(fmtAlt(a))}<span style="display: inline-block; width: 1.2em; text-align: center; color: #D7E6F0">${trend(a)}</span></span>
      </button>`;
    }).join('');
  }

  $('[data-rows]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-hex]');
    if (b) select(b.dataset.hex);
  });

  // Header: how many planes, and whether the picture is live, a little old, or sample.
  function drawStatus(list) {
    if (!data) return;
    const n = `${list.length} PLANE${list.length === 1 ? '' : 'S'} WITHIN 25 MI`;
    const age = Math.round((Date.now() - data.at) / 60000);
    const st = $('[data-status]');
    if (data.sample) { st.textContent = `SAMPLE DATA (NO LIVE FEED) · ${n}`; st.style.color = '#FFB547'; }
    else if (age >= 2) { st.textContent = `LAST UPDATE ${age} MIN AGO · ${n}`; st.style.color = '#FFB547'; }
    else { st.textContent = `LIVE · ${n} · TAP A FLIGHT`; st.style.color = '#7FA6B8'; }
  }

  function render(rebuildRows) {
    if (!alive) return;
    const list = current();
    if (rebuildRows) drawStatus(list);
    if (!list.some((a) => a.hex === selHex)) selHex = list[0]?.hex ?? null;
    drawRadar(list);
    drawPanel(list, rebuildRows);
  }

  async function poll() {
    try {
      const d = await getAircraft(loc);
      if (!alive) return;
      data = d;
      render(true);
      if (!d.sample) {
        routes = { ...routes, ...(await getRoutes(current().slice(0, 10), 10)) };
        render(true);
      }
    } catch (e) {
      console.error(e);
    }
  }

  (async () => {
    try {
      loc = await getLocation();
    } catch (e) {
      console.error(e);
      loc = { lat: 40.7128, lon: -74.006, town: '' };
    }
    if (!alive) return;
    await poll();
    timers.push(setInterval(() => render(false), 1000));
    timers.push(setInterval(() => render(true), 10000));
    timers.push(setInterval(poll, 60 * 1000));
  })();
}

export function unmount() {
  alive = false;
  timers.forEach(clearInterval);
  timers = [];
}
