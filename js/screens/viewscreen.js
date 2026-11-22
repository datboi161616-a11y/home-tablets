// Tom · Viewscreen night mode (Viewscreen.dc.html in the design)
// Big clock over a slowly drifting starfield. It stays up all night with the backlight
// turned right down, so it must cost the slow chip almost nothing: the stars are drawn on
// one canvas only four times a second (they move just 5-9 px a second), with plain timers
// (no animation loop running 60 times a second), and the words change once a minute.
// In the night hours chosen in Settings the whole screen is dimmed as well.
// Under the clock: the date, the next sunrise/sunset and the Moon's phase, and on a line of
// its own the next Space Station flyover (if one is coming soon).
// A tap anywhere goes back to the deck.
import { clockTime, clockAmPm, isNightNow, display, hourText } from '../services/display.js';
import { getLocation } from '../services/location.js';
import { sunAlt, moonPhase, compass } from '../services/astro.js';
import { getIssPasses, passDay, fmtTime } from '../services/space.js';
import { tutorialRunning } from '../services/tutorial.js';

let starTimer = 0;
let clock = 0;
let infoTimer = 0;
let live = null; // this visit's token, so late async results can tell they're stale
let onTap = null;
let onDisplay = null;

const W = 1280, H = 800;
const FRAME_MS = 250; // four small steps a second: still reads as a slow drift

// Two layers like the design: small stars drift 640px per 120s, big ones per 70s.
function makeStars() {
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const colors = ['#ffffff', '#ffffff', '#ffffff', '#99ffbb', '#ccddee', '#aabbcc'];
  const stars = [];
  for (let k = 0; k < 80; k++) {
    stars.push({ x: rand() * W, y: rand() * H, s: 2, v: 640 / 120, c: colors[Math.floor(rand() * colors.length)], a: 0.55 + rand() * 0.45 });
  }
  for (let k = 0; k < 14; k++) {
    stars.push({ x: rand() * W, y: rand() * H, s: 3, v: 640 / 70, c: '#ffffff', a: 1 });
  }
  return stars;
}

function clockVals() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const frac = (now - start) / (new Date(now.getFullYear() + 1, 0, 1) - start);
  return {
    stardate: ((now.getFullYear() - 2000) * 1000 + frac * 1000).toFixed(1),
    // The same clock as the rest of the screens: "6:05" + "PM", or "18:05".
    time: clockTime(now),
    ampm: clockAmPm(now),
    date: now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase(),
    night: isNightNow(now),
  };
}

/** The line at the bottom: the night hours as chosen in Settings. */
function watchLine() {
  const s = display();
  return s.night ? `NIGHT WATCH · SCREEN DIMMED ${hourText(s.nightFrom)}–${hourText(s.nightTo)}` : 'NIGHT WATCH · NIGHT DIMMING SWITCHED OFF IN SETTINGS';
}

/** Next sunrise or sunset in the coming day (Sun's upper edge at the horizon). */
function nextSunEvent(now, lat, lon) {
  const up = (t) => sunAlt(t, lat, lon) > -0.833;
  const was = up(now);
  for (let m = 2; m <= 26 * 60; m += 2) {
    const t = new Date(now.getTime() + m * 60000);
    if (up(t) !== was) return { name: was ? 'SUNSET' : 'SUNRISE', t };
  }
  return null; // midnight sun / polar night
}

// Work the lines out again in 15 minutes, or just after the next thing they mention
// happens (the sun comes up, the Space Station has been over), whichever is sooner.
function again(token, at) {
  clearTimeout(infoTimer);
  const wait = Math.max(60000, Math.min(15 * 60000, (at || Infinity) - Date.now() + 30000));
  infoTimer = setTimeout(() => skyLine(token), wait);
}

async function skyLine(token) {
  let loc;
  try { loc = await getLocation(); } catch { if (live === token) again(token); return; } // no location: leave the lines out for now
  if (live !== token) return;
  const now = new Date();
  const parts = [];
  const sun = nextSunEvent(now, loc.lat, loc.lon);
  if (sun) parts.push(`${sun.name} ${fmtTime(sun.t)}`);
  const ph = moonPhase(now);
  parts.push(ph.name.toUpperCase().replace(/ MOON$/, '') + ` MOON · ${Math.round(ph.fraction * 100)}% LIT`);
  const info = token.el.querySelector('[data-info]');
  const iss = token.el.querySelector('[data-iss]');
  if (!info || !iss) return;
  info.textContent = parts.join(' · ');
  let next = sun ? sun.t.getTime() : 0;
  try {
    const passes = await getIssPasses(loc, 12);
    if (live !== token) return;
    const p = passes.find((x) => x.end > Date.now());
    iss.textContent = !p ? ''
      : p.start <= Date.now() ? `SPACE STATION GOING OVER NOW · LOOK ${compass(p.endAz, true)}`
        : `SPACE STATION FLYOVER ${passDay(new Date(p.start))} · LOOK ${compass(p.startAz, true)}`;
    if (p) next = Math.min(next || Infinity, p.start > Date.now() ? p.start : p.end);
  } catch (err) { console.warn('iss', err); }
  if (live === token) again(token, next);
}

export function mount(el) {
  const c = clockVals();
  el.innerHTML = `
  <link rel="stylesheet" crossorigin href="https://fonts.googleapis.com/css2?family=Oxanium:wght@300;500;700&family=JetBrains+Mono:wght@400;600&display=swap">
  <style>
    .vs-root{width:1280px;height:800px;box-sizing:border-box;background:#020308;color:#D7E6F0;font-family:'JetBrains Mono',monospace;position:relative;overflow:hidden;cursor:pointer}
    .vs-root a{color:#5CE1E6}
    .vs-dim{position:absolute;top:0;right:0;bottom:0;left:0;background:#000;opacity:0;pointer-events:none;transition:opacity 2s}
    .vs-root.vs-night .vs-dim{opacity:.45}
  </style>
  <div class="vs-root${c.night ? ' vs-night' : ''}">
    <canvas data-stars aria-hidden="true" style="position:absolute;left:0;top:0;width:1280px;height:800px"></canvas>
    <div style="position:absolute;top:0;right:0;bottom:0;left:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px">
      <div style="display:flex;align-items:baseline;gap:18px;font-family:Oxanium,sans-serif;font-weight:300;color:#C9D6E0">
        <div data-time style="font-size:200px;line-height:1;letter-spacing:4px">${c.time}</div>
        <div data-ampm style="font-size:56px;letter-spacing:4px;color:#7FA6B8">${c.ampm}</div>
      </div>
      <div data-date style="font-family:Oxanium,sans-serif;font-size:30px;letter-spacing:8px;color:#C9D6E0">${c.date}</div>
      <div style="font-size:18px;letter-spacing:6px;color:#8FB0C0">STARDATE <span data-stardate>${c.stardate}</span> · ALL DECKS QUIET</div>
      <div data-info style="margin-top:18px;font-size:18px;letter-spacing:3px;color:#8FB0C0;white-space:nowrap;min-height:24px"></div>
      <div data-iss style="font-size:18px;letter-spacing:3px;color:#FFB547;white-space:nowrap;min-height:24px"></div>
    </div>
    <div data-watch style="position:absolute;left:40px;bottom:36px;font-size:16px;letter-spacing:3px;color:#6F8FA0">${watchLine()}</div>
    <div class="vs-dim"></div>
    <a href="#/bridge" style="position:absolute;right:32px;bottom:22px;min-height:56px;padding:0 24px;box-sizing:border-box;border:1px solid #1E3A4A;font-size:16px;letter-spacing:3px;display:flex;align-items:center;text-decoration:none">RETURN TO CONSOLE</a>
  </div>`;

  const root = el.querySelector('.vs-root');
  // A tap anywhere wakes the deck (not while the tour is showing this screen).
  onTap = (e) => {
    if (e.target.closest('a') || tutorialRunning()) return;
    location.hash = '#/bridge';
  };
  root.addEventListener('click', onTap);

  const paintClock = () => {
    const v = clockVals();
    el.querySelector('[data-time]').textContent = v.time;
    el.querySelector('[data-ampm]').textContent = v.ampm;
    el.querySelector('[data-date]').textContent = v.date;
    el.querySelector('[data-stardate]').textContent = v.stardate;
    el.querySelector('[data-watch]').textContent = watchLine();
    root.classList.toggle('vs-night', v.night);
  };
  // Tick right on the minute.
  const tick = () => {
    paintClock();
    const d = new Date();
    clock = setTimeout(tick, 60000 - (d.getSeconds() * 1000 + d.getMilliseconds()) + 50);
  };
  const d0 = new Date();
  clock = setTimeout(tick, 60000 - (d0.getSeconds() * 1000 + d0.getMilliseconds()) + 50);
  // 12/24-hour clock or night hours changed: show it now, not at the next minute.
  const token = { el };
  live = token;
  onDisplay = () => { paintClock(); skyLine(token); };
  window.addEventListener('display-changed', onDisplay);
  skyLine(token);

  // ---- Starfield
  const canvas = el.querySelector('[data-stars]');
  const g = canvas.getContext('2d');
  // Match the real pixel size (the canvas is scaled 1.5x on the tablet) but never above 1.5x.
  const k = Math.min(1.5, Math.max(1, (el.getBoundingClientRect().width / W) * (window.devicePixelRatio || 1)));
  canvas.width = Math.round(W * k);
  canvas.height = Math.round(H * k);
  g.setTransform(k, 0, 0, k, 0, 0);
  const stars = makeStars();
  const t0 = Date.now();

  const draw = () => {
    if (live !== token) return;
    starTimer = setTimeout(draw, FRAME_MS);
    if (document.hidden) return; // screen off: nothing to draw
    const t = (Date.now() - t0) / 1000;
    g.clearRect(0, 0, W, H);
    for (const s of stars) {
      const x = (((s.x - s.v * t) % W) + W) % W;
      g.globalAlpha = s.a;
      g.fillStyle = s.c;
      g.fillRect(Math.round(x), s.y, s.s, s.s);
    }
    g.globalAlpha = 1;
  };
  draw();
}

export function unmount() {
  clearTimeout(starTimer);
  clearTimeout(clock);
  clearTimeout(infoTimer);
  window.removeEventListener('display-changed', onDisplay);
  live = null;
  starTimer = 0;
  onTap = null;
  onDisplay = null;
}
