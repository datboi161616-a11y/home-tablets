// Tom · Airport departures board (Departures.dc.html in the design)
// Rows come from real planes in the air near the nearest airport — see
// services/departures.js for how, and why there is a sample fallback.
import { getLocation } from '../services/location.js';
import { getBoard, setBoardAirport, boardAirportPin, exampleBoard } from '../services/departures.js';
import { typeName, feedStatus } from '../services/aircraft.js';
import { clockTime, clockAmPm, timeText } from '../services/display.js';

const ROWS = 8;
const COLS = 'grid-template-columns: 150px 180px minmax(0, 1fr) 140px 310px';
const FLIP_MS = 30000;

// "BOEING 737-800" -> "737-800", "EMBRAER 175" -> "E175"; falls back to the code if long.
function shortType(ac, code) {
  if (!ac) return code || '—';
  let n = typeName(ac).replace(/^(BOEING|AIRBUS|BOMBARDIER|CESSNA|PIPER|BEECH|GULFSTREAM) /, '').replace(/^EMBRAER (\d)/, 'E$1').replace(/^EMBRAER /, '');
  if (n.length > 8 || n === 'UNKNOWN TYPE') n = code || ac.type || '—';
  return n;
}

let stopCurrent = null;

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function mount(el) {
  if (stopCurrent) stopCurrent();
  let live = true;
  const alive = () => live && el.isConnected;
  const intervals = [];
  let loadTimer = 0, flipTimer = 0;

  el.innerHTML = `
  <link rel="stylesheet" crossorigin href="https://fonts.googleapis.com/css2?family=Oxanium:wght@300;500;700&family=JetBrains+Mono:wght@400;600&display=swap">
  <style>
    .tbd a{color:#5CE1E6}
    .tbd button{font-family:inherit;cursor:pointer}
    @keyframes tbd-blink{50%{opacity:.3}}
    .tbd .blink{animation:tbd-blink 1.4s steps(2) infinite}
    .tbd-row{display:grid;${COLS};gap:8px;align-items:center;background:#111214;border-top:1px solid #26272B;padding:0 12px;height:56px;box-sizing:border-box;font-size:24px;letter-spacing:2px}
    .tbd-row[data-hex]{cursor:pointer}
    .tbd-tab{min-height:56px;padding:0 18px;box-sizing:border-box;border:1px solid #3A3628;background:#111214;color:#8A8270;font-size:15px;letter-spacing:3px}
    .tbd-tab.on{border-color:#FFD25A;color:#FFD25A;background:#1B1C1F}
    .tbd-tab[disabled]{opacity:.35}
    .tbd-row > span{background:#1B1C1F;padding:3px 8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-height:1.4em;box-sizing:border-box}
    .tbd-sub{display:block;font-size:12px;letter-spacing:2px;color:#8A8270;line-height:14px;overflow:hidden;text-overflow:ellipsis}
  </style>
  <div class="tbd" style="width: 1280px; height: 800px; box-sizing: border-box; padding: 24px 40px 20px; background: #05070D; color: #F4E9C8; font-family: 'JetBrains Mono', monospace; display: flex; flex-direction: column; gap: 12px">
    <div style="display: flex; align-items: center; justify-content: space-between; gap: 16px">
      <div style="display: flex; align-items: center; gap: 16px; min-width: 0">
        <a href="#/bridge" style="min-height: 56px; padding: 0 22px; box-sizing: border-box; border: 1px solid #1E3A4A; text-decoration: none; font-size: 16px; letter-spacing: 3px; display: flex; align-items: center; flex-shrink: 0">◂ DECK</a>
        <div data-title style="font-family: Oxanium, sans-serif; font-size: 24px; font-weight: 700; letter-spacing: 5px; color: #FFD25A; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">DEPARTURES · LOADING…</div>
      </div>
      <div style="display: flex; align-items: center; gap: 16px; flex-shrink: 0">
        <div style="display: flex; gap: 8px">
          <button data-mode="departures" class="tbd-tab">DEPARTURES</button>
          <button data-mode="arrivals" class="tbd-tab">ARRIVALS</button>
        </div>
        <div style="font-family: Oxanium, sans-serif; color: #FFD25A; white-space: nowrap"><span data-time style="font-size: 30px"></span><span data-ampm style="font-size: 16px; margin-left: 4px"></span></div>
      </div>
    </div>
    <div style="display: flex; align-items: center; justify-content: space-between; gap: 16px; border-top: 1px solid #1E3A4A; border-bottom: 1px solid #1E3A4A; padding: 6px 0; min-height: 56px">
      <div data-why style="font-size: 15px; letter-spacing: 2px; color: #C9BE9C; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0">&nbsp;</div>
      <div data-airports style="display: flex; gap: 8px; flex-shrink: 0"></div>
    </div>
    <div data-heads style="display: grid; ${COLS}; gap: 8px; padding: 0 12px; font-size: 13px; letter-spacing: 4px; color: #8A8270"></div>
    <div data-board role="button" aria-label="Switch between departures and arrivals" style="display: flex; flex-direction: column; gap: 5px; cursor: pointer"></div>
    <div style="margin-top: auto; display: flex; align-items: center; justify-content: space-between; gap: 16px">
      <div data-foot style="font-size: 14px; letter-spacing: 2px; color: #8A8270; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">&nbsp;</div>
      <div data-pager style="display: flex; align-items: center; gap: 10px; flex-shrink: 0">
        <button data-prev class="tbd-tab" aria-label="Earlier page">◂</button>
        <span data-page style="font-size: 15px; letter-spacing: 2px; color: #8A8270; min-width: 120px; text-align: center"></span>
        <button data-next class="tbd-tab" aria-label="Next page">▸</button>
      </div>
    </div>
  </div>`;

  const $ = (s) => el.querySelector(s);
  let loc = null;
  let real = null;     // the latest board from the service
  let example = null;  // the example board, while he has asked to see it (only when there's no real one)
  let board = null;    // what is on the screen: example || real
  let failed = false;
  let mode = 'departures';
  let page = 0;
  let gen = 0;
  let nextLook = 0;    // when the board looks again (for "LOOKING AGAIN AT …")

  const setBoard = () => { board = example || real; };
  // A live board with no airport near enough: say so usefully instead of showing empty rows.
  const quiet = () => !!(board && board.live && !board.sample && !board.airport);
  const rowsFor = (m) => (!board ? [] : m === 'departures' ? [...(board.taxiing || []), ...board.departures] : board.arrivals);

  function drawClock() {
    const now = new Date();
    const t = clockTime(now), ap = clockAmPm(now);
    if ($('[data-time]').textContent !== t) $('[data-time]').textContent = t;
    if ($('[data-ampm]').textContent !== ap) $('[data-ampm]').textContent = ap;
  }

  function drawAirportLine() {
    const why = $('[data-why]');
    const box = $('[data-airports]');
    if (!board) { why.textContent = failed ? 'THE BOARD ISN’T ANSWERING · TRYING AGAIN IN A MINUTE' : 'FINDING YOUR NEAREST AIRPORT…'; box.innerHTML = ''; return; }
    if (board.sample) {
      why.textContent = example ? 'AN EXAMPLE BOARD · NOT REAL FLIGHTS · NOTHING NEARBY RIGHT NOW'
        : 'AN EXAMPLE BOARD · NOT REAL FLIGHTS · THE LIVE PLANE FEED ISN’T REACHABLE';
      why.style.color = '#FFB547';
      // Back to the real (empty) board whenever he likes; it also goes back by itself.
      box.innerHTML = example ? '<button class="tbd-tab on" data-live>◂ BACK TO THE LIVE BOARD</button>' : '';
      return;
    }
    why.style.color = loc && loc.guessed ? '#FFB547' : '#C9BE9C';
    const ap = board.airport;
    // Town not found yet: the board is New York's, and it says so first.
    why.textContent = (loc && loc.guessed ? 'TOWN NOT FOUND YET · SHOWING NEW YORK · ' : '') + (ap
      ? `${ap.name ? ap.name.toUpperCase().replace(/ (INTERNATIONAL|INTL|REGIONAL|MUNICIPAL)\b/g, '').replace(/ AIRPORT$/, '') : ap.city} AIRPORT · ${ap.mi < 1 ? 'UNDER 1' : ap.mi} MI ${ap.side} OF YOU · ${ap.why}`
      : 'NO AIRPORT WITH FLIGHTS WITHIN 30 MILES RIGHT NOW');
    // Choose between the nearest few airports seen in the air right now (or go back to automatic).
    const cands = board.candidates || [];
    const pinned = !!boardAirportPin();
    if (cands.length < 2 && !pinned) { box.innerHTML = ''; return; }
    box.innerHTML = cands.map((c) => `<button class="tbd-tab${ap && c.iata === ap.iata ? ' on' : ''}" data-ap="${esc(c.iata)}" aria-label="Show ${esc(c.city)}">${esc(c.iata)}</button>`).join('')
      + `<button class="tbd-tab${pinned ? '' : ' on'}" data-ap="" aria-label="Choose the airport by itself">AUTO</button>`;
  }

  // No airport within 30 miles has flights in the air right now (a small town in the evening,
  // say): what it does know, when it looks again, and somewhere to go meanwhile.
  function drawQuiet() {
    const b = board;
    const h = new Date().getHours();
    const near = (b.nearby || []).map((a) => `<div>${esc((a.city || a.name || a.iata).toUpperCase())} (${esc(a.iata)}) · ${a.mi} MI ${esc(a.side)}</div>`).join('');
    const up = b.overhead || 0;
    $('[data-board]').innerHTML = `<div data-quiet style="background:#111214;border-top:1px solid #26272B;padding:22px 26px;display:flex;flex-direction:column;gap:14px;cursor:default;min-height:483px;box-sizing:border-box">
      <div style="font-family:Oxanium,sans-serif;font-size:30px;letter-spacing:3px;color:#FFD25A">NO FLIGHTS TO SHOW RIGHT NOW</div>
      <div style="font-size:19px;line-height:1.45;color:#F4E9C8">${up ? `NONE OF THE ${up} PLANE${up === 1 ? '' : 'S'} IN THE AIR AROUND YOU ${up === 1 ? 'IS' : 'ARE'} FLYING TO OR FROM AN AIRPORT WITHIN 30 MILES.` : 'NO PLANES ARE IN THE AIR AROUND YOU RIGHT NOW.'}</div>
      ${near ? `<div style="font-size:19px;line-height:1.5;color:#C9BE9C"><div style="font-size:14px;letter-spacing:3px;color:#8A8270">AIRPORTS THE PLANES NEAR YOU ARE USING</div>${near}</div>` : ''}
      ${h >= 19 || h < 6 ? '<div style="font-size:19px;line-height:1.45;color:#C9BE9C">SMALL AIRPORTS GO QUIET IN THE EVENING. FLIGHTS USUALLY PICK UP AGAIN IN THE MORNING.</div>' : ''}
      <div style="font-size:17px;letter-spacing:2px;color:#8A8270">THE BOARD LOOKS AGAIN EVERY MINUTE${nextLook ? ` · NEXT AT ${esc(timeText(new Date(nextLook)))}` : ''}</div>
      <div style="margin-top:auto;display:flex;gap:14px">
        <button class="tbd-tab" data-example style="min-height:64px;font-size:17px">SEE AN EXAMPLE BOARD</button>
        <a href="#/flights" class="tbd-tab" style="min-height:64px;font-size:17px;display:flex;align-items:center;text-decoration:none;color:#5CE1E6;border-color:#1E3A4A">PLANES OVERHEAD ▸</a>
      </div>
    </div>`;
    $('[data-pager]').style.visibility = 'hidden';
    const foot = $('[data-foot]');
    foot.textContent = `LIVE · CHECKED ${timeText(new Date(b.at))}`;
    foot.style.color = '#8A8270';
  }

  function render() {
    if (!alive()) return;
    const dep = mode === 'departures';
    const label = dep ? 'DEPARTURES' : 'ARRIVALS';
    const where = !board ? (failed ? 'NOT ANSWERING' : 'LOADING…')
      : example ? 'EXAMPLE, NOT REAL'
      : board.sample ? 'SAMPLE BOARD'
      : board.airport ? `${board.airport.city} (${board.airport.iata})` : 'NO AIRPORT NEARBY';
    $('[data-title]').textContent = `${label} · ${where}`;
    $('[data-heads]').innerHTML = quiet() ? '' : `<span>TIME</span><span>FLIGHT</span><span>${dep ? 'DESTINATION' : 'FROM'}</span><span>${board?.live ? 'PLANE' : 'GATE'}</span><span>STATUS</span>`;
    el.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
    drawAirportLine();
    if (quiet()) { drawQuiet(); return; }

    const all = rowsFor(mode);
    const pages = Math.max(1, Math.ceil(all.length / ROWS));
    if (page >= pages) page = pages - 1;
    const rows = all.slice(page * ROWS, page * ROWS + ROWS);
    const html = [];
    for (let i = 0; i < ROWS; i++) {
      const r = rows[i];
      if (r) {
        const tm = r.tomorrow ? `${esc(r.t)}<span style="font-size: 12px; color: #FFB547; margin-left: 6px">TMRW</span>` : esc(r.t);
        const dest = `${esc(r.d)}${r.code ? `<span style="font-size: 15px; color: #8A8270; margin-left: 10px">${esc(r.code)}</span>` : ''}`;
        const flight = `<span style="display: block; line-height: 26px">${esc(r.f)}</span>${r.airline ? `<span class="tbd-sub">${esc(r.airline)}</span>` : ''}`;
        // A plane in the air opens on the radar; one still on the ground isn't on it.
        html.push(`<div class="tbd-row"${board.live && r.hex && !(r.ac && r.ac.onGround) ? ` data-hex="${esc(r.hex)}"` : ''}>
          <span>${tm}</span><span style="padding-top: 1px; padding-bottom: 1px">${flight}</span><span>${dest}</span><span>${esc(board.live ? shortType(r.ac, r.g) : r.g)}</span>
          <span class="${r.cls}" style="color: ${r.c}">${esc(r.s)}</span>
        </div>`);
      } else if (i === 0) {
        const msg = !board ? (failed ? 'THE BOARD ISN’T ANSWERING · TRYING AGAIN SHORTLY' : 'LOADING THE BOARD…')
          : board.airport ? `NO ${label} IN THE AIR RIGHT NOW` : 'NO AIRPORT TRAFFIC NEARBY RIGHT NOW';
        html.push(`<div class="tbd-row"><span></span><span></span><span class="${board || failed ? '' : 'blink'}" style="color:#8A8270">${msg}</span><span></span><span></span></div>`);
      } else {
        html.push('<div class="tbd-row"><span></span><span></span><span></span><span></span><span></span></div>');
      }
    }
    // (Looked at again every minute: an unchanged board isn't drawn again.)
    const boardHtml = html.join('');
    const boardEl = $('[data-board]');
    if (boardEl.__html !== boardHtml) { boardEl.__html = boardHtml; boardEl.innerHTML = boardHtml; }
    $('[data-pager]').style.visibility = pages > 1 ? 'visible' : 'hidden';
    $('[data-page]').textContent = `PAGE ${page + 1} OF ${pages}`;
    $('[data-prev]').disabled = page <= 0;
    $('[data-next]').disabled = page >= pages - 1;

    const foot = $('[data-foot]');
    const age = board ? Math.round((Date.now() - board.at) / 60000) : 0;
    const old = board && !board.sample && (age >= 3 || board.stale);
    const fs = feedStatus();
    foot.textContent = !board ? (fs.offline ? 'NO INTERNET RIGHT NOW · THE BOARD WILL FILL IN WHEN IT’S BACK' : 'CHECKING THE PLANES IN THE AIR…')
      : board.sample ? `${example ? 'EXAMPLE BOARD · NOT REAL FLIGHTS' : 'SAMPLE BOARD'} · TAP THE BOARD TO SWITCH DEPARTURES / ARRIVALS`
      : `LIVE · TIMES ARE ESTIMATES · ${old ? `AS OF ${timeText(new Date(board.at))}${fs.offline ? ' · NO INTERNET' : ''}` : `UPDATED ${timeText(new Date(board.at))}`} · TAP A FLIGHT TO SEE IT ON THE RADAR`;
    foot.style.color = old ? '#FFB547' : '#8A8270';
  }

  async function load() {
    const mine = gen;
    try {
      const b = await getBoard(loc);
      if (!alive() || mine !== gen) return;
      real = b;
      // A real airport has flights again (or the feed is gone): the example steps aside.
      if (example && (b.airport || b.sample)) { example = null; page = 0; }
      setBoard();
      failed = false;
      nextLook = Date.now() + 60 * 1000;
      render();
    } catch (e) {
      console.error(e);
      if (!alive() || mine !== gen) return;
      failed = true;
      if (!board) render();
    } finally {
      if (alive() && mine === gen) { clearTimeout(loadTimer); loadTimer = setTimeout(load, 60 * 1000); }
    }
  }

  // The board switches by itself every 30 s; a tap switches now and restarts that wait.
  const show = (m) => {
    if (m !== mode) page = 0;
    mode = m;
    render();
    restartFlip();
  };
  function restartFlip() {
    clearInterval(flipTimer);
    flipTimer = setInterval(() => { page = 0; mode = mode === 'departures' ? 'arrivals' : 'departures'; render(); }, FLIP_MS);
  }
  $('[data-board]').addEventListener('click', (e) => {
    if (e.target.closest('[data-example]')) { example = exampleBoard(); setBoard(); page = 0; render(); restartFlip(); return; }
    if (e.target.closest('[data-quiet]')) return; // the words, or the link to the radar
    const row = e.target.closest('[data-hex]');
    if (row) { location.hash = `#/flights/${encodeURIComponent(row.dataset.hex)}`; return; }
    show(mode === 'departures' ? 'arrivals' : 'departures');
  });
  el.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => show(b.dataset.mode)));
  $('[data-prev]').addEventListener('click', () => { if (page > 0) { page -= 1; render(); restartFlip(); } });
  $('[data-next]').addEventListener('click', () => { page += 1; render(); restartFlip(); });
  $('[data-airports]').addEventListener('click', (e) => {
    if (e.target.closest('[data-live]')) { example = null; setBoard(); page = 0; render(); restartFlip(); return; }
    const b = e.target.closest('[data-ap]');
    if (!b || !board) return;
    const c = (board.candidates || []).find((x) => x.iata === b.dataset.ap);
    setBoardAirport(c || null);
    page = 0;
    gen += 1;
    load();
    restartFlip();
  });

  async function start() {
    const mine = ++gen;
    clearTimeout(loadTimer);
    try {
      loc = await getLocation();
    } catch (e) {
      console.error(e);
      loc = { lat: 40.7128, lon: -74.006, town: 'New York', guessed: true };
    }
    if (!alive() || mine !== gen) return;
    await load();
  }
  // The owner chose another town in Settings: a new nearest airport, chosen by itself again.
  const onPlace = () => { board = real = example = null; failed = false; page = 0; setBoardAirport(null); render(); start(); };
  window.addEventListener('place-changed', onPlace);
  // The owner switched the 12/24-hour clock: the times on the board follow at once.
  const onDisplay = () => { drawClock(); if (board) { gen += 1; load(); } };
  window.addEventListener('display-changed', onDisplay);

  show('departures');
  drawClock();
  // Clock checked every second so the minute changes on time (text only touched when it changes).
  intervals.push(setInterval(drawClock, 1000));
  start();

  stopCurrent = () => {
    live = false;
    gen += 1;
    intervals.forEach(clearInterval);
    clearInterval(flipTimer);
    clearTimeout(loadTimer);
    window.removeEventListener('place-changed', onPlace);
    window.removeEventListener('display-changed', onDisplay);
  };
}

export function unmount() {
  if (stopCurrent) stopCurrent();
  stopCurrent = null;
}
