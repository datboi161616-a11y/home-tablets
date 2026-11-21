// Tom · Airport departures board (Departures.dc.html in the design)
// Rows come from real planes in the air near the nearest airport — see
// services/departures.js for how, and why there is a sample fallback.
import { getLocation } from '../services/location.js';
import { getBoard, hhmm } from '../services/departures.js';
import { typeName } from '../services/aircraft.js';

const ROWS = 9;
const COLS = 'grid-template-columns: 110px 150px minmax(0, 1fr) 150px 250px';

// "BOEING 737-800" -> "737-800", "EMBRAER 175" -> "E175"; falls back to the code if long.
function shortType(ac, code) {
  if (!ac) return code || '—';
  let n = typeName(ac).replace(/^(BOEING|AIRBUS|BOMBARDIER|CESSNA|PIPER|BEECH|GULFSTREAM) /, '').replace(/^EMBRAER (\d)/, 'E$1').replace(/^EMBRAER /, '');
  if (n.length > 8 || n === 'UNKNOWN TYPE') n = code || ac.type || '—';
  return n;
}

let timers = [];
let alive = false;

const pad = (n) => String(n).padStart(2, '0');
const clock = () => { const n = new Date(); return pad(n.getHours()) + ':' + pad(n.getMinutes()); };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function mount(el) {
  alive = true;
  el.innerHTML = `
  <link rel="stylesheet" crossorigin href="https://fonts.googleapis.com/css2?family=Oxanium:wght@300;500;700&family=JetBrains+Mono:wght@400;600&display=swap">
  <style>
    .tbd a{color:#5CE1E6}.tbd a:hover{color:#A8F2F4}
    @keyframes tbd-blink{50%{opacity:.3}}
    .tbd .blink{animation:tbd-blink 1.4s ease-in-out infinite}
    .tbd-row{display:grid;${COLS};gap:8px;align-items:center;background:#111214;border-top:1px solid #26272B;padding:10px 12px;font-size:24px;letter-spacing:2px}
    .tbd-tab{min-height:44px;padding:8px 16px;box-sizing:border-box;border:1px solid #3A3628;background:#111214;color:#8A8270;font-family:inherit;font-size:14px;letter-spacing:3px;cursor:pointer}
    .tbd-tab.on{border-color:#FFD25A;color:#FFD25A;background:#1B1C1F}
    .tbd-row > span{background:#1B1C1F;padding:4px 8px;white-space:nowrap;overflow:hidden;min-height:1.4em}
  </style>
  <div class="tbd" style="width: 1280px; height: 800px; box-sizing: border-box; padding: 28px 40px; background: #05070D; color: #F4E9C8; font-family: 'JetBrains Mono', monospace; display: flex; flex-direction: column; gap: 18px">
    <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #1E3A4A; padding-bottom: 14px">
      <div style="display: flex; align-items: center; gap: 16px; min-width: 0">
        <a href="#/bridge" style="min-height: 44px; padding: 10px 18px; box-sizing: border-box; border: 1px solid #1E3A4A; text-decoration: none; font-size: 14px; letter-spacing: 3px; display: flex; align-items: center; flex-shrink: 0">◂ DECK</a>
        <div data-title style="font-family: Oxanium, sans-serif; font-size: 24px; font-weight: 700; letter-spacing: 6px; color: #FFD25A; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">DEPARTURES · LOADING…</div>
      </div>
      <div style="display: flex; align-items: center; gap: 16px; flex-shrink: 0">
        <div style="display: flex; gap: 8px">
          <button data-mode="departures" class="tbd-tab">DEPARTURES</button>
          <button data-mode="arrivals" class="tbd-tab">ARRIVALS</button>
        </div>
        <div data-time style="font-family: Oxanium, sans-serif; font-size: 30px; color: #FFD25A">${clock()}</div>
      </div>
    </div>
    <div data-heads style="display: grid; ${COLS}; gap: 8px; padding: 0 12px; font-size: 13px; letter-spacing: 4px; color: #8A8270">
      <span>TIME</span><span>FLIGHT</span><span>DESTINATION</span><span>GATE</span><span>STATUS</span>
    </div>
    <div data-board role="button" aria-label="Switch between departures and arrivals" style="flex-grow: 1; display: flex; flex-direction: column; gap: 6px; cursor: pointer"></div>
    <div data-foot style="font-size: 14px; letter-spacing: 3px; color: #8A8270">UPDATED EVERY MINUTE · ARRIVALS BOARD ALTERNATES EVERY 30 SECONDS</div>
  </div>`;

  const $ = (s) => el.querySelector(s);
  let loc = null;
  let board = null;
  let mode = 'departures';

  function render() {
    if (!alive) return;
    const dep = mode === 'departures';
    const label = dep ? 'DEPARTURES' : 'ARRIVALS';
    const where = !board ? 'LOADING…'
      : board.sample ? 'SAMPLE BOARD'
      : board.airport ? `${board.airport.city} (${board.airport.iata})` : 'NO AIRPORT NEARBY';
    $('[data-title]').textContent = `${label} · ${where}`;
    $('[data-heads]').innerHTML = `<span>TIME</span><span>FLIGHT</span><span>${dep ? 'DESTINATION' : 'FROM'}</span><span>${board?.live ? 'TYPE' : 'GATE'}</span><span>STATUS</span>`;

    const rows = board ? board[mode] : [];
    const html = [];
    for (let i = 0; i < ROWS; i++) {
      const r = rows[i];
      if (r) {
        html.push(`<div class="tbd-row">
          <span>${esc(r.t)}</span><span>${esc(r.f)}</span><span>${esc(r.d)}</span><span>${esc(board.live ? shortType(r.ac, r.g) : r.g)}</span>
          <span class="${r.cls}" style="color: ${r.c}">${esc(r.s)}</span>
        </div>`);
      } else if (i === 0 && !board) {
        html.push('<div class="tbd-row"><span></span><span></span><span class="blink" style="color:#8A8270">LOADING THE BOARD…</span><span></span><span></span></div>');
      } else if (i === 0 && board) {
        const msg = board.airport ? `NO ${label} IN THE AIR RIGHT NOW` : 'NO AIRPORT TRAFFIC NEARBY RIGHT NOW';
        html.push(`<div class="tbd-row"><span></span><span></span><span style="color:#8A8270">${msg}</span><span></span><span></span></div>`);
      } else {
        html.push('<div class="tbd-row"><span></span><span></span><span></span><span></span><span></span></div>');
      }
    }
    $('[data-board]').innerHTML = html.join('');
    el.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
    const age = board ? Math.round((Date.now() - board.at) / 60000) : 0;
    const foot = $('[data-foot]');
    foot.textContent = !board ? 'CHECKING THE PLANES IN THE AIR…'
      : board.sample ? 'SAMPLE BOARD · LIVE PLANE FEED NOT REACHABLE · TAP THE BOARD TO SWITCH'
      : `LIVE FROM PLANES IN THE AIR · TIMES ARE ESTIMATES · ${age >= 3 ? `LAST UPDATE ${age} MIN AGO` : `UPDATED ${hhmm(board.at)}`}`;
    foot.style.color = board && !board.sample && age >= 3 ? '#FFB547' : '#8A8270';
  }

  async function load() {
    try {
      const b = await getBoard(loc);
      if (!alive) return;
      board = b;
      render();
    } catch (e) {
      console.error(e);
    }
  }

  // The board switches by itself every 30 s; a tap switches now and restarts that wait.
  let flipTimer = null;
  const show = (m) => {
    mode = m;
    render();
    clearInterval(flipTimer);
    timers = timers.filter((t) => t !== flipTimer);
    flipTimer = setInterval(() => show(mode === 'departures' ? 'arrivals' : 'departures'), 30000);
    timers.push(flipTimer);
  };
  $('[data-board]').addEventListener('click', () => show(mode === 'departures' ? 'arrivals' : 'departures'));
  el.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => show(b.dataset.mode)));

  show('departures');
  // Clock checked every second so the minute changes on time.
  timers.push(setInterval(() => { const t = clock(); if ($('[data-time]').textContent !== t) $('[data-time]').textContent = t; }, 1000));

  (async () => {
    try {
      loc = await getLocation();
    } catch (e) {
      console.error(e);
      loc = { lat: 40.7128, lon: -74.006, town: '' };
    }
    if (!alive) return;
    await load();
    timers.push(setInterval(load, 60 * 1000));
  })();
}

export function unmount() {
  alive = false;
  timers.forEach(clearInterval);
  timers = [];
}
