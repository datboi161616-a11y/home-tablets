// Tom · Planes over your house, live radar (Flights.dc.html in the design)
//
// The radar is redrawn every few seconds (planes step along their track between feed
// updates); nothing animates continuously except the sweep, which ticks a few times a
// second. The list keeps five fixed rows whose words are only touched when they change.
// `#/flights/<hex>` opens with that aircraft picked (the departures board links here).
import { getLocation } from '../services/location.js';
import { settings } from '../config.js';
import { timeText } from '../services/display.js';
import {
  getAircraft, getRoutes, advance, flightLabel, typeName, airlineOf, routeText, fmtAlt, RADIUS_NM, getAircraftInfo,
  compass, compassShort, fmtMiles, trend, trendWord, kindOf, squawkInfo, interest, fmtDist, fmtSpeed, lookText,
  approachWord, headingText, sentence, placeText, feedStatus, todayLog,
} from '../services/aircraft.js';

const PLANE = '<path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"></path>';
const HELI = '<path d="M3 4h18v1.6h-8.2V8c3 .4 5.2 2.6 5.2 5.4 0 2-1 3.5-2.6 4.4l1.8 2.6h2.3V22H6.5v-1.6h7.3l-1.4-2.1c-.5.1-.9.1-1.4.1-3.2 0-5.9-2-5.9-5 0-2.6 2-4.8 6.1-5.3V5.6H3z"></path>';
const MAX_ON_RADAR = 16;
const PER_PAGE = 4;
const TICK_MS = 4000;              // radar + words refresh
const POLL_MS = 60 * 1000;         // the feed itself (the service also rests it after failures)
const RANGE_KEY = 'flights.range.v1';
const RANGES = { 25: RADIUS_NM, 10: 10 / 1.15078 }; // miles shown -> nautical miles
const RINGS = { 25: [10, 20], 10: [4, 8] };
const SIZE = 520, C = SIZE / 2, EDGE = 246;   // radar size, centre, radius of the range edge (px)
const COL = { pick: '#FFB547', plane: '#5CE1E6', mil: '#7CF29A', sos: '#FF6B6B' };

let stopCurrent = null;

const readRange = () => { try { return localStorage.getItem(RANGE_KEY) === '10' ? 10 : 25; } catch (e) { return 25; } };
const when = (t) => {
  const d = new Date(t);
  const today = new Date();
  const time = timeText(d);
  if (d.toDateString() === today.toDateString()) return time;
  const y = new Date(today); y.setDate(y.getDate() - 1);
  return d.toDateString() === y.toDateString() ? `YESTERDAY ${time}` : `${d.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase()} ${time}`;
};

export function mount(el, ctx = {}) {
  if (stopCurrent) stopCurrent();
  let live = true;
  const intervals = [];
  let pollTimer = 0;
  const alive = () => live && el.isConnected;
  let metric = false;
  try { metric = settings.units === 'celsius'; } catch (e) { /* default: miles */ }

  el.innerHTML = `
  <link rel="stylesheet" crossorigin href="https://fonts.googleapis.com/css2?family=Oxanium:wght@300;500;700&family=JetBrains+Mono:wght@400;600&display=swap">
  <style>
    .tbf a{color:#5CE1E6}
    .tbf button{font-family:inherit;cursor:pointer}
    @keyframes tbf-sweep{to{transform:rotate(360deg)}}
    .tbf .sweep{position:absolute;top:0;right:0;bottom:0;left:0;border-radius:50%;background:conic-gradient(from 0deg,rgba(92,225,230,0) 0deg,rgba(92,225,230,0) 310deg,rgba(92,225,230,.35) 360deg);animation:tbf-sweep 8s steps(32) infinite;will-change:transform}
    .tbf-blip{position:absolute;left:0;top:0;width:56px;height:56px;padding:0;background:none;border:0;transition:transform .5s linear}
    .tbf-blip .ic{position:absolute;left:16px;top:16px;width:24px;height:24px}
    .tbf-blip .ring{position:absolute;left:8px;top:8px;width:36px;height:36px;border:2px solid #FFB547;border-radius:50%;display:none}
    .tbf-blip.on .ring{display:block}
    .tbf-blip .lbl{position:absolute;left:50%;top:44px;transform:translateX(-50%);font-size:13px;white-space:nowrap;pointer-events:none;text-shadow:0 0 3px #070C18,0 0 3px #070C18}
    .tbf-btn{min-height:56px;min-width:56px;padding:0 16px;box-sizing:border-box;border:1px solid #1E3A4A;background:#0A1220;color:#5CE1E6;font-size:15px;letter-spacing:2px}
    .tbf-btn[disabled]{color:#2A4656;border-color:#14283A}
    .tbf-row{width:100%;height:56px;display:grid;grid-template-columns:120px minmax(0,1fr) 112px 128px;gap:10px;align-items:center;padding:0 14px;box-sizing:border-box;text-align:left;color:#D7E6F0;background:#0A1220;border:1px solid #1E3A4A}
    .tbf-row.on{background:#10233A;border-color:#FFB547}
    .tbf-row[hidden]{display:none}
    .tbf-row > span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .tbf-k{color:#7FA6B8;font-size:13px;letter-spacing:1px}
    .tbf-k{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .tbf-v{font-size:17px;line-height:21px;max-height:42px;margin-top:3px;overflow:hidden;white-space:pre-line}
  </style>
  <div class="tbf" style="width: 1280px; height: 800px; box-sizing: border-box; padding: 24px 36px 16px 40px; background: #05070D; color: #D7E6F0; font-family: 'JetBrains Mono', monospace; display: flex; flex-direction: column; gap: 14px">
    <div style="display: flex; align-items: center; justify-content: space-between; gap: 16px; border-bottom: 1px solid #1E3A4A; padding-bottom: 12px">
      <div style="display: flex; align-items: center; gap: 16px; flex-shrink: 0">
        <a href="#/bridge" class="tbf-btn" style="text-decoration: none; display: flex; align-items: center; padding: 0 22px; font-size: 16px; letter-spacing: 3px">◂ DECK</a>
        <div style="font-family: Oxanium, sans-serif; font-size: 24px; font-weight: 700; letter-spacing: 6px; color: #5CE1E6">PLANES OVER YOUR HOUSE</div>
      </div>
      <div data-status style="font-size: 15px; letter-spacing: 2px; color: #7FA6B8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0">SCANNING…</div>
    </div>
    <div style="flex-grow: 1; display: grid; grid-template-columns: 560px minmax(0, 1fr); gap: 24px; min-height: 0">
      <div style="display: flex; flex-direction: column; gap: 10px; min-height: 0">
        <div style="flex-grow: 1; position: relative; border: 1px solid #1E3A4A; background: #0A1220; display: flex; align-items: center; justify-content: center; min-height: 0">
          <button data-range class="tbf-btn" style="position: absolute; left: 10px; top: 10px; z-index: 3" aria-label="Change how far the radar looks">RANGE 25 MI</button>
          <div style="position: absolute; left: 12px; bottom: 10px; display: flex; gap: 14px; font-size: 13px; letter-spacing: 1px; color: #7FA6B8">
            <span><span style="color: ${COL.pick}">■</span> PICKED</span><span><span style="color: ${COL.plane}">■</span> AIRLINE / PRIVATE</span><span><span style="color: ${COL.mil}">■</span> MILITARY</span><span><span style="color: ${COL.sos}">■</span> EMERGENCY</span>
          </div>
          <div data-radar style="position: relative; width: ${SIZE}px; height: ${SIZE}px; border-radius: 50%; border: 2px solid #5CE1E6; box-sizing: border-box; overflow: hidden; background: #070C18">
            <div class="sweep"></div>
            <div style="position: absolute; left: 50%; top: 0; bottom: 0; width: 1px; background: #1E3A4A"></div>
            <div style="position: absolute; top: 50%; left: 0; right: 0; height: 1px; background: #1E3A4A"></div>
            <div data-rings></div>
            <div style="position: absolute; left: 50%; top: 50%; transform: translate(-50%, -6px); display: flex; flex-direction: column; align-items: center; gap: 3px; pointer-events: none">
              <div style="width: 12px; height: 12px; border-radius: 50%; background: #FFFFFF"></div>
              <span data-home style="font-size: 12px; color: #FFFFFF; white-space: nowrap">HOME</span>
            </div>
            <div style="position: absolute; top: 8px; left: 50%; transform: translateX(-50%); font-size: 15px; font-weight: 600; color: #5CE1E6">N</div>
            <div style="position: absolute; bottom: 8px; left: 50%; transform: translateX(-50%); font-size: 13px; color: #3C6478">S</div>
            <div style="position: absolute; left: 9px; top: 50%; transform: translateY(-50%); font-size: 13px; color: #3C6478">W</div>
            <div style="position: absolute; right: 9px; top: 50%; transform: translateY(-50%); font-size: 13px; color: #3C6478">E</div>
            <div data-blips></div>
          </div>
        </div>
        <div style="border: 1px solid #1E3A4A; background: #0A1220; padding: 10px 14px; font-size: 15px; letter-spacing: 1px; display: flex; flex-direction: column; gap: 4px">
          <div data-today style="color: #D7E6F0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">TODAY: COUNTING…</div>
          <div data-best style="color: #7FA6B8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">&nbsp;</div>
        </div>
      </div>
      <div style="display: flex; flex-direction: column; gap: 12px; min-height: 0; min-width: 0">
        <div style="border: 1px solid #FFB547; background: #0A1220; padding: 14px 20px; display: flex; flex-direction: column; gap: 10px">
          <div data-sentence style="font-family: Oxanium, sans-serif; font-size: 20px; line-height: 26px; height: 52px; overflow: hidden; color: #5CE1E6; letter-spacing: 1px">SCANNING THE SKY AROUND YOUR HOUSE…</div>
          <div data-s-sos style="display: none; height: 52px; box-sizing: border-box; font-size: 17px; line-height: 22px; letter-spacing: 1px; color: #05070D; background: #FF6B6B; padding: 4px 10px; overflow: hidden"></div>
          <div style="display: flex; gap: 16px; border-top: 1px solid #1E3A4A; padding-top: 10px">
            <div data-s-photo style="display: none; width: 170px; flex: none; position: relative; background: #070C18 center/cover no-repeat; border: 1px solid #1E3A4A">
              <div data-s-reg style="position: absolute; left: 0; right: 0; bottom: 0; padding: 4px 8px; background: rgba(5,7,13,.75); font-size: 12px; color: #D7E6F0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis"></div>
            </div>
            <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8px">
              <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px">
                <div style="display: flex; align-items: center; gap: 12px; min-width: 0">
                  <div data-s-id style="font-family: Oxanium, sans-serif; font-size: 32px; font-weight: 500; color: #FFB547; white-space: nowrap">—</div>
                  <div data-s-kind style="display: none; font-size: 13px; letter-spacing: 2px; padding: 3px 8px; border: 1px solid #7FA6B8; color: #D7E6F0; white-space: nowrap"></div>
                </div>
                <div data-s-airline style="font-size: 15px; color: #7FA6B8; text-align: right; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0">&nbsp;</div>
              </div>
              <div data-s-route style="font-family: Oxanium, sans-serif; font-size: 22px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">&nbsp;</div>
              <div data-s-where style="font-size: 15px; letter-spacing: 1px; color: #5CE1E6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">&nbsp;</div>
              <div style="display: grid; grid-template-columns: 1.25fr 1fr 1.25fr; gap: 10px; border-top: 1px solid #1E3A4A; padding-top: 8px">
                <div style="min-width: 0"><div class="tbf-k">AIRCRAFT</div><div data-s-type class="tbf-v">—</div></div>
                <div style="min-width: 0"><div class="tbf-k" data-s-trend>ALTITUDE</div><div data-s-alt class="tbf-v">—</div></div>
                <div style="min-width: 0"><div class="tbf-k" data-s-hdg>SPEED</div><div data-s-spd class="tbf-v">—</div></div>
              </div>
            </div>
          </div>
        </div>
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px">
          <div data-list-title style="font-size: 14px; letter-spacing: 3px; color: #7FA6B8">ALL PLANES · CLOSEST FIRST</div>
          <div style="display: flex; align-items: center; gap: 10px">
            <button data-prev class="tbf-btn" aria-label="Closer planes">◂</button>
            <span data-page style="font-size: 15px; color: #7FA6B8; min-width: 110px; text-align: center">&nbsp;</span>
            <button data-next class="tbf-btn" aria-label="Farther planes">▸</button>
          </div>
        </div>
        <div data-rows style="display: flex; flex-direction: column; gap: 8px"></div>
      </div>
    </div>
  </div>`;

  const $ = (s) => el.querySelector(s);
  const setText = (node, s) => { if (node && node.textContent !== s) node.textContent = s; };
  let loc = null;
  let data = null;        // latest feed result
  let routes = {};        // callsign -> route (live only)
  const asked = new Set(); // callsigns whose route has been looked up
  let selHex = ctx.args && ctx.args[0] ? String(ctx.args[0]).toLowerCase() : null;
  let picked = !!selHex;  // the owner (or a link) chose this one: keep it while it's in range
  let page = 0;
  let range = readRange();
  let gen = 0;            // bumps when the place changes, so late answers for the old place are dropped
  let lastList = [];
  const blips = new Map(); // hex -> element

  const routeFor = (a) => (data?.sample ? a.sampleRoute : routes[a.callsign]);
  const colorFor = (a) => (a.hex === selHex ? COL.pick : squawkInfo(a) ? COL.sos : a.military || /^MILITARY/.test(kindOf(a)) ? COL.mil : COL.plane);
  const rangeWord = () => `${range} MI${metric ? ` (${Math.round(range * 1.609)} KM)` : ''}`;

  // ---- rings and labels for the chosen range ----
  function drawRings() {
    const rings = RINGS[range].map((mi, i) => {
      const r = (mi / 1.15078 / RANGES[range]) * EDGE;
      const lbl = `${mi} MI${metric ? `/${Math.round(mi * 1.609)} KM` : ''}`;
      // labels alternate below / above the east line so they never run into each other
      return `<div style="position: absolute; left: ${C - r}px; top: ${C - r}px; width: ${2 * r}px; height: ${2 * r}px; box-sizing: border-box; border-radius: 50%; border: 1px solid #1E3A4A"></div>
        <div style="position: absolute; right: ${SIZE - C - r + 4}px; top: ${i % 2 ? C + 4 : C - 18}px; font-size: 12px; color: #4F7F94; white-space: nowrap">${lbl}</div>`;
    }).join('');
    $('[data-rings]').innerHTML = `${rings}<div style="position: absolute; left: ${C - EDGE}px; top: ${C - EDGE}px; width: ${2 * EDGE}px; height: ${2 * EDGE}px; box-sizing: border-box; border-radius: 50%; border: 1px dashed #1E3A4A"></div>
      <div style="position: absolute; left: ${C + 6}px; top: ${C - EDGE + 4}px; font-size: 12px; color: #4F7F94; white-space: nowrap">${rangeWord()}</div>`;
    setText($('[data-range]'), `RANGE ${range} MI`);
  }

  function current() {
    if (!data || !loc) return [];
    const dt = Math.max(0, (Date.now() - data.at) / 1000);
    return data.list
      .filter((a) => !a.onGround)
      .map((a) => advance(a, loc, Math.min(dt, 600)))
      .filter((a) => a.dst <= RANGES[range])
      .sort((a, b) => a.dst - b.dst)
      .slice(0, MAX_ON_RADAR);
  }

  // The most interesting plane in range (an emergency, a rare visitor, the military…), else the closest.
  function autoPick(list) {
    let best = list[0] || null, score = best ? interest(best) : 0;
    for (const a of list) { const s = interest(a); if (s > score) { best = a; score = s; } }
    return best ? best.hex : null;
  }

  function select(hex, byHand) {
    selHex = hex;
    if (byHand) picked = true;
    const i = lastList.findIndex((a) => a.hex === hex);
    if (i >= 0) page = Math.floor(i / PER_PAGE);
    render();
  }

  // Radar blips are kept as live nodes (keyed by aircraft) so a tap is never lost mid-redraw;
  // they only move by transform.
  function drawRadar(list) {
    const host = $('[data-blips]');
    const keep = new Set();
    for (const a of list) {
      keep.add(a.hex);
      let b = blips.get(a.hex);
      if (!b) {
        b = document.createElement('button');
        b.className = 'tbf-blip';
        b.innerHTML = `<div class="ring"></div><div class="ic"><svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"></svg></div><span class="lbl"></span>`;
        const hex = a.hex;
        b.addEventListener('click', () => select(hex, true));
        host.appendChild(b);
        blips.set(a.hex, b);
      }
      const r = (a.dst / RANGES[range]) * EDGE;
      const x = C + Math.sin((a.dir * Math.PI) / 180) * r;
      const y = C - Math.cos((a.dir * Math.PI) / 180) * r;
      const color = colorFor(a);
      const heli = kindOf(a) === 'HELICOPTER';
      const tf = `translate(${(x - 28).toFixed(0)}px, ${(y - 28).toFixed(0)}px)`;
      if (b.style.transform !== tf) b.style.transform = tf;
      b.style.zIndex = a.hex === selHex ? 2 : 1;
      b.classList.toggle('on', a.hex === selHex);
      const svg = b.querySelector('svg');
      const shape = heli ? 'heli' : 'plane';
      if (svg.dataset.shape !== shape) { svg.innerHTML = heli ? HELI : PLANE; svg.dataset.shape = shape; }
      const rot = heli ? 'none' : `rotate(${Math.round(a.track)}deg)`;
      if (svg.style.transform !== rot) svg.style.transform = rot;
      if (svg.getAttribute('fill') !== color) svg.setAttribute('fill', color);
      const lbl = b.querySelector('.lbl');
      setText(lbl, flightLabel(a, routeFor(a)));
      lbl.style.color = color;
      b.setAttribute('aria-label', `${flightLabel(a, routeFor(a))}, ${fmtMiles(a.dst)} ${compass(a.dir)}`);
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
      // Only a plain web address from the feed becomes a picture (never data: or javascript:).
      if (!alive() || photoHex !== hex || !info || !/^https?:\/\//i.test(info.photo || '')) return;
      const img = new Image();
      img.onload = () => {
        if (!alive() || photoHex !== hex) return;
        box.style.backgroundImage = `url('${encodeURI(info.photo).replace(/['()\\]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}')`;
        setText($('[data-s-reg]'), [info.reg, info.owner].filter(Boolean).join(' · '));
        box.style.display = 'block';
      };
      img.src = info.photo;
    }).catch(() => { /* no photo: the card reads fine without */ });
  }

  // Route words for the card and the rows ("checking" until the lookup has been tried).
  function routeWords(a, long) {
    const r = routeFor(a);
    if (r?.from && r?.to && long) return `${placeText(r.from)} → ${placeText(r.to)}`;
    if (!r && !data?.sample && /^[A-Z]{3}\d/.test(a.callsign || '') && !asked.has(a.callsign)) return 'LOOKING UP THE ROUTE…';
    const t = routeText(a, r);
    return t === 'LOCAL FLIGHT' && kindOf(a) === 'HELICOPTER' ? 'LOCAL HELICOPTER FLIGHT' : t;
  }

  function drawCard(list) {
    const sel = list.find((a) => a.hex === selHex);
    showPhoto(sel);
    const kindEl = $('[data-s-kind]');
    const sos = $('[data-s-sos]');
    if (!sel) {
      kindEl.style.display = 'none';
      sos.style.display = 'none';
      $('[data-sentence]').style.display = 'block';
      setText($('[data-s-id]'), data ? 'CLEAR SKIES' : 'SCANNING…');
      setText($('[data-s-airline]'), '');
      setText($('[data-s-route]'), data ? 'NO PLANES IN RANGE RIGHT NOW' : '');
      setText($('[data-s-where]'), data ? 'THE RADAR KEEPS WATCHING · IT CHECKS EVERY MINUTE' : '');
      let words = 'SCANNING THE SKY AROUND YOUR HOUSE…';
      if (data) {
        const last = todayLog().last;
        words = `NOTHING WITHIN ${range} MILES RIGHT NOW.` + (last && last.at ? ` THE LAST ONE SEEN WAS ${last.label} (${last.type}) AT ${when(last.at)}.` : '');
      }
      setText($('[data-sentence]'), words);
      ['type', 'alt', 'spd'].forEach((k) => setText($(`[data-s-${k}]`), '—'));
      setText($('[data-s-trend]'), 'ALTITUDE');
      setText($('[data-s-hdg]'), 'SPEED');
      return;
    }
    const r = routeFor(sel);
    setText($('[data-s-id]'), flightLabel(sel, r));
    const kind = kindOf(sel);
    const sq = squawkInfo(sel);
    const badge = sq ? sq.short : kind && kind !== 'AIRLINER' ? kind : '';
    kindEl.style.display = badge ? 'block' : 'none';
    setText(kindEl, badge);
    kindEl.style.borderColor = sq ? COL.sos : kind.startsWith('MILITARY') ? COL.mil : '#7FA6B8';
    setText($('[data-s-airline]'), r?.airline || airlineOf(sel) || (sel.reg ? `REG ${sel.reg}` : ''));
    setText($('[data-s-route]'), routeWords(sel, true));
    setText($('[data-s-where]'), `${fmtDist(sel.dst, metric)} ${compassShort(sel.dir)} · ${lookText(sel)}${approachWord(sel) ? ' · ' + approachWord(sel) : ''}`);
    // An emergency code takes the sentence's place, in plain words, in red.
    sos.style.display = sq ? 'block' : 'none';
    $('[data-sentence]').style.display = sq ? 'none' : 'block';
    if (sq) setText(sos, `⚠ ${sq.short}${sq.code ? ' (CODE ' + sq.code + ')' : ''}: ${sq.words}`);
    setText($('[data-sentence]'), (data.sample ? 'SAMPLE: ' : '') + sentence(sel, r, metric) + '.');
    setText($('[data-s-type]'), typeName(sel) + (sel.year && !data.sample ? ` · BUILT ${sel.year}` : ''));
    setText($('[data-s-trend]'), 'ALTITUDE');
    setText($('[data-s-alt]'), `${fmtAlt(sel)} ${trend(sel)}`.trim() + (sel.vrate > 300 || sel.vrate < -300 ? `\n${trendWord(sel)}` : ''));
    setText($('[data-s-hdg]'), headingText(sel) || 'SPEED');
    setText($('[data-s-spd]'), fmtSpeed(sel, metric));
  }

  // ---- the list: five fixed rows, filled by page ----
  const rowEls = [];
  for (let i = 0; i < PER_PAGE; i++) {
    const b = document.createElement('button');
    b.className = 'tbf-row';
    b.hidden = true;
    b.innerHTML = '<span data-f style="font-family: Oxanium, sans-serif; font-size: 20px"></span><span data-r style="font-size: 16px"></span><span data-d style="font-size: 16px; color: #7FA6B8; text-align: right"></span><span data-a style="font-size: 16px; color: #7FA6B8; text-align: right"></span>';
    b.addEventListener('click', () => { if (b.dataset.hex) select(b.dataset.hex, true); });
    $('[data-rows]').appendChild(b);
    rowEls.push(b);
  }

  function drawRows(list) {
    const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
    if (page >= pages) page = pages - 1;
    const slice = list.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE);
    rowEls.forEach((b, i) => {
      const a = slice[i];
      if (!a) {
        if (i === 0 && !list.length) {
          b.hidden = false;
          b.dataset.hex = '';
          b.classList.remove('on');
          setText(b.querySelector('[data-f]'), '');
          setText(b.querySelector('[data-r]'), data ? 'NO PLANES IN RANGE RIGHT NOW' : 'SCANNING…');
          setText(b.querySelector('[data-d]'), '');
          setText(b.querySelector('[data-a]'), '');
        } else b.hidden = true;
        return;
      }
      b.hidden = false;
      if (b.dataset.hex !== a.hex) b.dataset.hex = a.hex;
      b.classList.toggle('on', a.hex === selHex);
      const f = b.querySelector('[data-f]');
      setText(f, flightLabel(a, routeFor(a)));
      f.style.color = colorFor(a);
      setText(b.querySelector('[data-r]'), routeWords(a, false));
      setText(b.querySelector('[data-d]'), `${fmtMiles(a.dst).replace('UNDER 1 MI', '<1 MI')} ${compassShort(a.dir)}`);
      setText(b.querySelector('[data-a]'), `${fmtAlt(a)} ${trend(a) || ' '}`);
    });
    const from = list.length ? page * PER_PAGE + 1 : 0;
    setText($('[data-page]'), list.length ? `${from}–${from + slice.length - 1} OF ${list.length}` : '');
    $('[data-prev]').disabled = page <= 0;
    $('[data-next]').disabled = page >= pages - 1;
  }

  // Header: how many planes, and whether the picture is live, a little old, or sample.
  function drawStatus(list) {
    const st = $('[data-status]');
    const fs = feedStatus();
    if (!data) {
      setText(st, fs.offline ? 'NO INTERNET · WAITING FOR THE WI-FI…' : 'SCANNING…');
      return;
    }
    const k = list.filter((a) => a.dst <= RANGES[range]).length;
    const n = `${k} PLANE${k === 1 ? '' : 'S'} WITHIN ${range} MI`;
    const age = Math.round((Date.now() - data.at) / 60000);
    let words, warn = true;
    // (Kept short: the longer wording ran off the end of the header.)
    const few = `${k} PLANE${k === 1 ? '' : 'S'} IN RANGE`;
    if (data.sample) words = `SAMPLE · ${fs.offline ? 'NO INTERNET' : 'NO LIVE FEED'} · ${few}`;
    else if (age >= 2) words = `AS OF ${timeText(new Date(data.at))} · ${fs.offline ? 'NO INTERNET' : 'FEED DOWN'} · ${few}`;
    else { words = `LIVE · ${n} · TAP A PLANE`; warn = false; }
    setText(st, words);
    st.style.color = warn ? '#FFB547' : '#7FA6B8';
  }

  function drawToday() {
    if (data?.sample && !todayLog().count) {
      setText($('[data-today]'), 'TODAY’S COUNT STARTS WHEN THE LIVE FEED ANSWERS');
      setText($('[data-best]'), 'THE PLANES ON THE RADAR NOW ARE ONLY AN EXAMPLE');
      return;
    }
    const log = todayLog();
    setText($('[data-today]'), `TODAY: ${log.count} AIRCRAFT SEEN FROM HERE`);
    const b = log.best;
    setText($('[data-best]'), b ? `MOST UNUSUAL: ${b.type}${b.why && !b.type.includes(b.why) ? ` (${b.why})` : ''} · ${timeText(new Date(b.at))}` : 'NOTHING OUT OF THE ORDINARY YET TODAY');
  }

  function render() {
    if (!alive()) return;
    const list = current();
    if (data && !list.some((a) => a.hex === selHex)) {
      const raw = selHex && picked && data ? data.list.find((x) => x.hex === selHex && !x.onGround) : null;
      const out = raw ? advance(raw, loc, Math.min(600, (Date.now() - data.at) / 1000)) : null;
      if (out && out.dst <= RADIUS_NM) {
        // picked by hand but outside the 10-mile view: keep it in the list so the card still shows it
        list.push(out);
      } else {
        picked = false;
        selHex = autoPick(list);
      }
    }
    lastList = list;
    drawStatus(list);
    drawRadar(list.filter((a) => a.dst <= RANGES[range]));
    drawCard(list);
    drawRows(list);
  }

  async function poll() {
    const mine = gen;
    try {
      const d = await getAircraft(loc);
      if (!alive() || mine !== gen) return;
      data = d;
      render();
      drawToday();
      if (!d.sample) {
        const want = current().filter((a) => a.callsign && !routes[a.callsign]);
        if (want.length) {
          const got = await getRoutes(want, MAX_ON_RADAR);
          if (!alive() || mine !== gen) return;
          want.forEach((a) => asked.add(a.callsign));
          for (const k in got) if (got[k]) routes[k] = got[k];
          render();
        }
      }
    } catch (e) {
      console.error(e);
      if (alive() && !data) setText($('[data-status]'), 'RADAR NOT ANSWERING · TRYING AGAIN SHORTLY');
    } finally {
      if (alive() && mine === gen) { clearTimeout(pollTimer); pollTimer = setTimeout(poll, POLL_MS); }
    }
  }

  async function start() {
    const mine = ++gen;
    clearTimeout(pollTimer);
    try {
      loc = await getLocation();
    } catch (e) {
      console.error(e);
      loc = { lat: 40.7128, lon: -74.006, town: 'New York', guessed: true };
    }
    if (!alive() || mine !== gen) return;
    // Town not found yet: the radar is centred on New York, and says so rather than "HOME".
    setText($('[data-home]'), loc.guessed ? 'NEW YORK · TOWN NOT FOUND YET' : loc.town ? `HOME · ${String(loc.town).toUpperCase()}` : 'HOME');
    await poll();
  }

  // The owner chose another town in Settings: start over there.
  const onPlace = () => {
    data = null; routes = {}; asked.clear(); selHex = null; picked = false; page = 0;
    render();
    start();
  };
  window.addEventListener('place-changed', onPlace);

  $('[data-range]').addEventListener('click', () => {
    range = range === 25 ? 10 : 25;
    try { localStorage.setItem(RANGE_KEY, String(range)); } catch (e) { /* stays for this visit */ }
    page = 0;
    drawRings();
    render();
  });
  $('[data-prev]').addEventListener('click', () => { if (page > 0) { page -= 1; render(); } });
  $('[data-next]').addEventListener('click', () => { page += 1; render(); });

  drawRings();
  render();
  drawToday();
  intervals.push(setInterval(render, TICK_MS));
  start();

  stopCurrent = () => {
    live = false;
    gen += 1;
    intervals.forEach(clearInterval);
    clearTimeout(pollTimer);
    window.removeEventListener('place-changed', onPlace);
  };
}

export function unmount() {
  if (stopCurrent) stopCurrent();
  stopCurrent = null;
}
