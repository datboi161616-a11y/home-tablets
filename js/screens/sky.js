// Tom · Tonight's sky (Sky.dc.html in the design)
// Everything is worked out on the tablet (js/services/astro.js): planets, the Moon,
// a famous constellation and ISS flyovers. Only the ISS orbit (CelesTrak) and the
// cloud cover (Open-Meteo) come from the network.
//
// The chart is a view looking straight up: the middle is overhead, the edge is the
// horizon, and the rings are 60° and 30° above the horizon. It shows "tonight":
// from dark (Sun 6° below the horizon) until 11 PM (at least 3 hours).
import { getLocation } from '../services/location.js';
import { getIssPasses, getCloudCover, fmtTime } from '../services/space.js';
import { position, sunAlt, moonPhase, compass, CONSTELLATIONS } from '../services/astro.js';

let timer;
let ctx = null; // { el, loc, passes, clouds }

const STEP = 10 * 60000;
const R = 228; // chart radius in px (inside the 2px border)
const PLANETS = [ // brightest first
  { id: 'venus', name: 'VENUS', color: '#FFF3D6', dot: 16, minAlt: 5 },
  { id: 'jupiter', name: 'JUPITER', color: '#FFB547', dot: 16, minAlt: 10 },
  { id: 'mars', name: 'MARS', color: '#FF8A65', dot: 12, minAlt: 10 },
  { id: 'saturn', name: 'SATURN', color: '#E9E4D6', dot: 12, minAlt: 10 },
  { id: 'mercury', name: 'MERCURY', color: '#C9C2B5', dot: 10, minAlt: 5 },
];

// ---------------------------------------------------------------- time helpers
function shortTime(d) {
  const h = d.getHours(), m = d.getMinutes();
  return `${((h + 11) % 12) + 1}${m ? ':' + String(m).padStart(2, '0') : ''}`;
}
const ampm = (d) => (d.getHours() < 12 ? 'AM' : 'PM');
const hr = (d) => `${shortTime(d)} ${ampm(d)}`;
const range = (a, b) => (ampm(a) === ampm(b) ? `${shortTime(a)}–${shortTime(b)} ${ampm(b)}` : `${hr(a)}–${hr(b)}`);
const roundTo = (t, ms) => new Date(Math.round(t / ms) * ms);

/** When "tonight" is: from dark until 11 PM (at least 3 hours), or now until dawn after midnight. */
function tonight(now, lat, lon) {
  const alt = (t) => sunAlt(t, lat, lon);
  const find = (from, hours, pred) => {
    for (let m = 0; m <= hours * 60; m += 5) {
      const t = new Date(from.getTime() + m * 60000);
      if (pred(alt(t))) return t;
    }
    return null;
  };
  const noon = new Date(now); noon.setHours(12, 0, 0, 0);
  const dusk = find(noon, 14, (a) => a < -6);
  let start, end;
  if (now < noon && alt(now) < -6) {
    start = now;
    end = find(now, 12, (a) => a > -6) || new Date(now.getTime() + 3 * 3600000);
  } else {
    start = new Date(Math.max(now, dusk || noon.getTime() + 10 * 3600000));
    const bedtime = new Date(dusk || start); bedtime.setHours(23, 0, 0, 0);
    end = new Date(Math.max(start.getTime() + 3 * 3600000, bedtime));
    const dawn = find(start, 16, (a) => a > -6);
    if (dawn && dawn > start && dawn < end) end = dawn;
  }
  if (end - start < STEP) end = new Date(start.getTime() + 3 * 3600000);
  return { dusk, start, end };
}

// ---------------------------------------------------------------- sky maths
function track(body, times, lat, lon) {
  return times.map((t) => position(body, t, lat, lon));
}

/** Visible stretch of a track: first/last sample above minAlt and the highest one. */
function summarize(trk, minAlt) {
  let a = -1, b = -1, best = -1;
  trk.forEach((p, k) => {
    if (p.alt < minAlt) return;
    if (a < 0) a = k;
    b = k;
    if (best < 0 || p.alt > trk[best].alt) best = k;
  });
  return a < 0 ? null : { a, b, best: trk[best] };
}

function whenText(times, s, night) {
  const n = times.length - 1;
  const ta = roundTo(times[s.a], STEP), tb = roundTo(times[s.b], STEP);
  if (s.a === 0 && s.b === n) return night ? 'ALL NIGHT' : 'ALL EVENING';
  if (s.a === 0) return `UNTIL ${hr(tb)}`;
  if (s.b === n) return `AFTER ${hr(ta)}`;
  return range(ta, tb);
}

function whereText({ alt, az }) {
  if (alt >= 75) return 'OVERHEAD';
  const q = alt >= 55 ? 'HIGH' : alt < 25 ? 'LOW' : '';
  if (!q) return compass(az);
  const long = `${compass(az)}, ${q}`;
  return long.length > 14 ? `${compass(az, true)}, ${q}` : long;
}

function compute(loc, now = new Date()) {
  const { lat, lon } = loc;
  const win = tonight(now, lat, lon);
  const times = [];
  for (let t = win.start.getTime(); t <= win.end.getTime(); t += STEP) times.push(new Date(t));
  const night = win.start.getHours() < 12;
  // The chart shows the sky right now if it's dark, otherwise an hour into the evening.
  const ref = now >= win.start && now <= win.end ? now
    : new Date(Math.min(win.start.getTime() + 3600000, win.end.getTime()));

  const marks = [];
  const planets = [];
  for (const p of PLANETS) {
    const s = summarize(track(p.id, times, lat, lon), p.minAlt);
    if (s) planets.push({ name: p.name, where: whereText(s.best), when: whenText(times, s, night), color: p.color === '#FFB547' ? p.color : '#D7E6F0' });
    const at = position(p.id, ref, lat, lon);
    if (at.alt > 0 && (s || at.alt > 5)) marks.push({ ...at, label: p.name, color: p.color, dot: p.dot, labelColor: p.id === 'jupiter' ? '#FFB547' : '#D7E6F0' });
  }

  const phase = moonPhase(ref);
  let moon = null;
  const ms = summarize(track('moon', times, lat, lon), 5);
  if (ms && phase.fraction > 0.03) {
    moon = { name: 'MOON', where: whereText(ms.best), when: whenText(times, ms, night), color: '#D7E6F0' };
  }
  const mAt = position('moon', ref, lat, lon);
  if (mAt.alt > 0) marks.push({ ...mAt, label: 'MOON', color: '#E9E4D6', dot: 22, labelColor: '#D7E6F0' });

  // Most famous star pattern that climbs well above the horizon tonight.
  let constellation = null;
  for (const c of CONSTELLATIONS) {
    const s = summarize(track(c, times, lat, lon), 20);
    if (!s || s.best.alt < 30) continue;
    constellation = { name: c.name, where: whereText(s.best), when: whenText(times, s, night), color: '#D7E6F0' };
    const at = position(c, ref, lat, lon);
    const later = position(c, new Date(ref.getTime() + 30 * 60000), lat, lon);
    if (at.alt > 3) marks.push({ ...at, label: `${c.name}${later.alt > at.alt && at.alt < 35 ? ' RISING' : ''}`, text: true });
    break;
  }

  return { win, times, ref, marks, planets, moon, constellation, phase };
}

// ---------------------------------------------------------------- rendering
const xy = ({ alt, az }) => {
  const r = ((90 - Math.max(alt, 0)) / 90) * R;
  return [230 + r * Math.sin((az * Math.PI) / 180), 230 - r * Math.cos((az * Math.PI) / 180)];
};

function markHTML(m, placed) {
  const [x, y] = xy(m);
  // Nudge a label down if another one is already right there (e.g. planets in conjunction).
  const near = placed.filter(([px, py]) => Math.abs(px - x) < 90 && Math.abs(py - y) < 18).length;
  placed.push([x, y]);
  const shift = near * 18;
  if (m.text) {
    const left = x > 300;
    return `<div style="position:absolute;${left ? `right:${460 - x}px` : `left:${x}px`};top:${y - 8 + shift}px;font-size:13px;color:#7FA6B8;white-space:nowrap">${m.label}</div>`;
  }
  const left = x > 330; // put the label on the inside so it stays within the circle
  return `<div style="position:absolute;${left ? `right:${460 - x - m.dot / 2}px` : `left:${x - m.dot / 2}px`};top:${y - m.dot / 2}px;display:flex;align-items:center;gap:8px;${left ? 'flex-direction:row-reverse' : ''}">
    <div style="width:${m.dot}px;height:${m.dot}px;border-radius:50%;background:${m.color};flex:none"></div>
    <span style="font-size:14px;color:${m.labelColor};white-space:nowrap;${shift ? `transform:translateY(${shift}px)` : ''}">${m.label}</span></div>`;
}

function issFor(sky, passes) {
  if (!passes?.length) return null;
  const now = Date.now();
  const tonightPass = passes.find((p) => p.end > now && p.start <= sky.win.end);
  if (tonightPass) return { pass: tonightPass, tonight: true };
  const next = passes.find((p) => p.end > now);
  return next ? { pass: next, tonight: false } : null;
}

function rowsFor(sky, iss) {
  let issRow = null;
  if (iss) {
    const p = iss.pass;
    const mins = Math.max(1, Math.round((p.end - p.start) / 60000));
    issRow = {
      name: 'ISS FLYOVER', color: '#5CE1E6',
      where: `${compass(p.startAz, true)} → ${compass(p.endAz, true)}`,
      when: iss.tonight ? `${fmtTime(p.start)} · ${mins} MIN`
        : `${p.start.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()} ${fmtTime(p.start)}`,
    };
  }
  const others = [sky.moon, sky.constellation].filter(Boolean);
  const room = 5 - others.length - (issRow ? 1 : 0);
  return [issRow, ...sky.planets.slice(0, room), ...others].filter(Boolean);
}

function render() {
  const { el, loc, passes, clouds } = ctx;
  const $ = (s) => el.querySelector(s);
  const sky = compute(loc);
  const iss = issFor(sky, passes);

  // Header
  const bits = [sky.win.dusk ? `DARK AFTER ${fmtTime(sky.win.dusk)}` : 'NO FULL DARK TONIGHT'];
  let cloudAvg = null;
  if (clouds) {
    const vals = clouds.time.map((t, k) => (t >= sky.win.start - 1800000 && t <= sky.win.end ? clouds.cloud[k] : null))
      .filter((v) => v != null);
    if (vals.length) cloudAvg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  }
  if (cloudAvg != null) bits.push(`CLOUD COVER ${cloudAvg}%`);
  $('[data-sub]').textContent = bits.join(' · ');

  // Chart
  let path = '';
  if (iss?.tonight) {
    const pts = iss.pass.path.map((p) => xy(p).map((v) => v.toFixed(1)).join(',')).join(' ');
    const [sx, sy] = xy(iss.pass.path[0]);
    const [ex, ey] = xy(iss.pass.path[iss.pass.path.length - 1]);
    path = `<svg width="460" height="460" viewBox="0 0 460 460" style="position:absolute;left:0;top:0;overflow:visible">
        <polyline points="${pts}" fill="none" stroke="#5CE1E6" stroke-width="2"/>
        <circle cx="${ex}" cy="${ey}" r="4" fill="#5CE1E6"/></svg>
      <div style="position:absolute;${sx > 300 ? `right:${460 - sx}px` : `left:${Math.max(4, sx - 10)}px`};top:${sy + (sy < 230 ? 8 : -26)}px;font-size:13px;color:#5CE1E6;white-space:nowrap">ISS PATH ${fmtTime(iss.pass.start)}</div>`;
  }
  const placed = [];
  $('[data-marks]').innerHTML = path + sky.marks.map((m) => markHTML(m, placed)).join('');
  $('[data-ref]').textContent = `SKY AT ${fmtTime(roundTo(sky.ref.getTime(), 5 * 60000))}`;
  $('[data-phase]').textContent = `${sky.phase.name.toUpperCase()} · ${Math.round(sky.phase.fraction * 100)}% LIT`;

  // List
  const rows = rowsFor(sky, iss);
  $('[data-rows]').innerHTML = rows.length ? rows.map((o) => `
    <div class="sk-row">
      <div class="sk-ox sk-ell" style="font-size:24px;font-weight:500;color:${o.color}">${o.name}</div>
      <div class="sk-ell" style="font-size:15px"><span style="color:#7FA6B8">LOOK </span>${o.where}</div>
      <div class="sk-ell" style="font-size:15px"><span style="color:#7FA6B8">BEST </span>${o.when}</div>
    </div>`).join('')
    : '<div class="sk-row" style="grid-template-columns:1fr;font-size:15px;color:#7FA6B8">NOTHING BRIGHT IS UP TONIGHT — TRY STAR-SPOTTING!</div>';

  $('[data-tip]').textContent = cloudAvg != null && cloudAvg >= 70
    ? 'CLOUDY TONIGHT. IF THE CLOUDS BREAK, LOOK FOR THE MOON AND BRIGHT PLANETS FIRST — THEY SHINE THROUGH THIN CLOUD.'
    : 'TIP: GIVE YOUR EYES 15 MINUTES IN THE DARK. THE ISS LOOKS LIKE A BRIGHT, STEADY STAR MOVING FAST WITH NO BLINKING LIGHTS.';
}

export function mount(el) {
  el.innerHTML = `
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Oxanium:wght@300;500;700&family=JetBrains+Mono:wght@400;600&display=swap">
  <style>
    .sk-root{width:1280px;height:800px;box-sizing:border-box;padding:28px 40px;background:#05070D;color:#D7E6F0;font-family:'JetBrains Mono',monospace;display:flex;flex-direction:column;gap:20px}
    .sk-root a{color:#5CE1E6}
    .sk-ox{font-family:Oxanium,sans-serif}
    .sk-nsew{position:absolute;font-family:Oxanium,sans-serif;font-size:18px;color:#5CE1E6}
    .sk-row{border:1px solid #1E3A4A;background:#0A1220;padding:16px 20px;display:grid;grid-template-columns:1.1fr 1fr 1fr;gap:12px;align-items:center}
    .sk-ell{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
  </style>
  <div class="sk-root">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:24px;border-bottom:1px solid #1E3A4A;padding-bottom:14px">
      <div style="display:flex;align-items:center;gap:16px;min-width:0">
        <a href="#/bridge" style="min-height:44px;padding:10px 18px;box-sizing:border-box;border:1px solid #1E3A4A;font-size:14px;letter-spacing:3px;display:flex;align-items:center;flex:none">◂ DECK</a>
        <div data-title class="sk-ox sk-ell" style="font-size:24px;font-weight:700;letter-spacing:6px;color:#5CE1E6">TONIGHT'S SKY</div>
      </div>
      <div data-sub style="font-size:14px;letter-spacing:3px;color:#7FA6B8;flex:none">LOCATING…</div>
    </div>
    <div style="flex-grow:1;display:grid;grid-template-columns:560px minmax(0,1fr);gap:28px;min-height:0">
      <div style="border:1px solid #1E3A4A;background:#0A1220;display:flex;align-items:center;justify-content:center;position:relative">
        <div style="position:relative;width:460px;height:460px;border-radius:50%;border:2px solid #5CE1E6;box-sizing:border-box;background:#070C18">
          <div style="position:absolute;inset:76px;border-radius:50%;border:1px solid #1E3A4A"></div>
          <div style="position:absolute;inset:152px;border-radius:50%;border:1px solid #1E3A4A"></div>
          <div class="sk-nsew" style="left:50%;top:-30px;transform:translateX(-50%)">N</div>
          <div class="sk-nsew" style="left:50%;bottom:-30px;transform:translateX(-50%)">S</div>
          <div class="sk-nsew" style="top:50%;right:-28px;transform:translateY(-50%)">E</div>
          <div class="sk-nsew" style="top:50%;left:-30px;transform:translateY(-50%)">W</div>
          <div data-marks style="position:absolute;inset:-2px"></div>
        </div>
        <div data-ref style="position:absolute;left:16px;bottom:12px;font-size:13px;letter-spacing:2px;color:#7FA6B8"></div>
        <div data-phase style="position:absolute;right:16px;bottom:12px;font-size:13px;letter-spacing:2px;color:#7FA6B8"></div>
      </div>
      <div style="display:flex;flex-direction:column;gap:12px;min-height:0;min-width:0">
        <div style="font-size:13px;letter-spacing:4px;color:#7FA6B8">WHAT TO LOOK FOR · NO TELESCOPE NEEDED</div>
        <div data-rows style="display:flex;flex-direction:column;gap:12px"></div>
        <div data-tip style="margin-top:auto;border-left:4px solid #FFB547;background:#0A1220;padding:16px 20px;font-size:16px;line-height:1.45">TIP: GIVE YOUR EYES 15 MINUTES IN THE DARK. THE ISS LOOKS LIKE A BRIGHT, STEADY STAR MOVING FAST WITH NO BLINKING LIGHTS.</div>
      </div>
    </div>
  </div>`;

  ctx = { el, loc: null, passes: null, clouds: null };
  const mine = ctx;

  (async () => {
    let loc;
    try {
      loc = await getLocation();
    } catch (err) {
      console.warn('location', err);
      loc = { lat: 39.95, lon: -75.17, town: '' }; // sample: Philadelphia
    }
    if (ctx !== mine) return;
    ctx.loc = loc;
    el.querySelector('[data-title]').textContent =
      loc.town ? `TONIGHT'S SKY OVER ${loc.town.toUpperCase()}` : "TONIGHT'S SKY";
    render();
    timer = setInterval(() => ctx === mine && render(), 5 * 60000); // things move: redraw every 5 min

    getCloudCover(loc).then((c) => { if (ctx === mine && c) { ctx.clouds = c; render(); } });
    getIssPasses(loc, 72).then((p) => { if (ctx === mine) { ctx.passes = p; render(); } })
      .catch((err) => console.warn('iss', err));
  })();
}

export function unmount() {
  clearInterval(timer);
  ctx = null;
}
