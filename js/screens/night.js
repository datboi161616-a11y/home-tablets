// Family · Night clock (Night.dc.html in the design)
// Dim warm-on-black clock. Tap anywhere to go back home.
//
// app.js brings this up by itself at night and turns the backlight right down (2-15 %), so
// everything here is large, warm and high-contrast, with no bright patches to light up a
// dark room. It stays up for eight hours: nothing animates, and the text changes once a
// minute. The bottom corners are kept free for the timer chip and the "plug me in" word.
import { isNightNow, hourText, display, clockTime, clockAmPm } from '../services/display.js';
import { getLocation } from '../services/location.js';
import { getWeather, describe } from '../services/weather.js';
import { getWeek } from '../services/calendar-data.js';
import * as timerSvc from '../services/timers.js';
import { spot } from '../art.js';

let tickTimer, refreshTimer, ringTimer, backTimer, offVisible;

const REFRESH_MS = 30 * 60 * 1000;
// Burn-in: an LCD left on one picture all night can keep a faint ghost of it. The clock
// moves to the next of these spots (px) every few minutes; small enough nobody notices.
const SHIFT = [[0, 0], [14, -8], [-12, 10], [10, 12], [-14, -10], [6, -14], [-6, 14], [16, 4], [-16, -4]];
const SHIFT_MINUTES = 3;

const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const isNight = () => isNightNow(); // the hours are the owner's choice (Settings)

function clockParts() {
  const now = new Date();
  return {
    time: clockTime(now),
    ampm: clockAmPm(now),
    date: now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
  };
}

// The day the bottom row is about: after midnight (or in the morning) that's today,
// in the evening it's tomorrow.
function comingDay() {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (now.getHours() < 12 ? 0 : 1));
  return { date: d, word: now.getHours() < 12 ? 'Today' : 'Tomorrow' };
}

// "Dentist · 9:30 AM  +2 more" for that day, or a plain word when there's nothing.
// For today, things that are already over are left out: at 10 AM "Dentist 8:00" is old news.
function firstUp(day, today) {
  let items = [];
  try {
    const week = getWeek(day);
    const found = week.filter((d) => dayKey(d.date) === dayKey(day))[0];
    items = found ? found.events : [];
  } catch (e) { console.error(e); } // a calendar that can't be read: say nothing is planned
  if (today) {
    const now = new Date();
    items = items.filter((x) => {
      const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i.exec(x.endTime || x.time || '');
      if (!m) return true; // all day, "Until …": keep
      let h = +m[1] % 12;
      if (m[3]) { if (/pm/i.test(m[3])) h += 12; } else h = +m[1];
      return h * 60 + +m[2] > now.getHours() * 60 + now.getMinutes();
    });
  }
  if (!items.length) return { title: today ? 'Nothing else planned' : 'Nothing planned', time: '', more: '' };
  const e = items.filter((x) => x.time !== 'All day')[0] || items[0];
  // The time first and the "+2 more" kept apart: a long name is cut short, never those.
  return { title: e.title, time: `${e.time} · `, more: items.length > 1 ? `+${items.length - 1} more` : '' };
}

// That day's forecast from a weather result (live or saved), or ''.
function dayForecast(w, day) {
  const d = w && w.daily;
  if (!d || !d.time) return '';
  const i = d.time.indexOf(dayKey(day));
  if (i < 0) return '';
  return `${describe(d.weather_code[i]).label} · high ${Math.round(d.temperature_2m_max[i])}° · low ${Math.round(d.temperature_2m_min[i])}°`;
}

function savedWeather() {
  try { return JSON.parse(localStorage.getItem('weather.v1') || 'null'); } catch (e) { return null; }
}

// Is a kitchen or cooking timer ringing? The timers service knows both kinds, and their names.
function ringingNow() {
  return timerSvc.ringingNames().length ? { names: timerSvc.ringingText() } : null;
}

// Warm on black. Labels are a little dimmer than the clock but never thin grey: at 2 %
// backlight anything darker than this disappears.
const INK = '#D89A78';
const INK_2 = '#B98262';

export function mount(el) {
  const c = clockParts();
  // "Clock only" (Settings → Clock & night): no weather or calendar lines, for a screen that
  // faces a bed. A ringing timer still says so.
  const clockOnly = display().nightStyle === 'clock';
  // Opened by hand in the daytime (Settings → "See the night clock"): a tap goes back there.
  const byHand = !isNight();
  const cameFrom = location.hash;

  el.innerHTML = `
  <style>
    .nt-root{position:absolute;top:0;right:0;bottom:0;left:0;background:#0B0907;color:${INK};cursor:pointer;overflow:hidden;
      -webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none}
    .nt-wrap{position:absolute;top:0;right:0;bottom:0;left:0;padding:40px 48px;display:flex;flex-direction:column;align-items:center}
    .nt-top{align-self:stretch;display:flex;justify-content:space-between;gap:24px;font-size:20px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:${INK_2}}
    .nt-mid{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;min-height:0}
    .nt-time{font-size:240px;font-weight:400;line-height:1;letter-spacing:-6px;white-space:nowrap;font-variant-numeric:tabular-nums}
    .nt-ampm{font-size:56px;letter-spacing:0;margin-left:18px;font-weight:500;color:${INK_2}}
    .nt-date{font-size:36px;font-weight:500}
    .nt-day{margin-top:26px;height:118px;display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center;max-width:1040px}
    .nt-label{font-size:20px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:${INK_2}}
    .nt-line{font-size:30px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:1040px;line-height:1.2}
    .nt-ring{display:none;margin-top:26px;height:118px;box-sizing:border-box;padding:0 48px;border-radius:28px;background:#C2491F;color:#FFFFFF;
      flex-direction:column;align-items:center;justify-content:center;text-align:center;max-width:1040px}
    .nt-ring b{font-size:40px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:940px}
    .nt-ring span{font-size:24px;font-weight:600}
    .nt-hills{position:absolute;left:0;right:0;bottom:0;pointer-events:none}
  </style>
  <div class="nt-root display" data-tap-anywhere aria-label="Night clock">
    <!-- Hills along the bottom: near-black on black, so the room stays dark. -->
    <div class="nt-hills">${spot.nightHills()}</div>
    <div class="nt-wrap" data-shift>
      <div class="nt-top"><span data-mode></span><span data-hint></span></div>
      <div class="nt-mid">
        <div class="nt-time"><span data-time>${c.time}</span><span data-ampm class="nt-ampm">${c.ampm}</span></div>
        <div class="nt-date" data-date>${c.date}</div>
        <div class="nt-day" data-daybox${clockOnly ? ' style="display:none"' : ''}>
          <span class="nt-label" data-day>Tomorrow</span>
          <span class="nt-line" data-forecast>&nbsp;</span>
          <span class="nt-line" style="display:flex;justify-content:center;gap:14px;max-width:1040px"><span data-first-time style="flex:none"></span><span data-first style="min-width:0;overflow:hidden;text-overflow:ellipsis">&nbsp;</span><span data-first-more style="flex:none;color:${INK_2}"></span></span>
        </div>
        <div class="nt-ring" data-ring><b data-ring-names>Time’s up!</b><span>Tap anywhere to stop it</span></div>
      </div>
    </div>
  </div>`;

  const $ = (s) => el.querySelector(s);
  if (!c.ampm) $('[data-ampm]').style.display = 'none';

  // Top row: what this screen is doing, and what a tap does.
  function renderTop() {
    const s = display();
    const h = new Date().getHours();
    let mode;
    if (isNight()) mode = `Dimmed until ${hourText(s.nightTo)}`;
    else if (!byHand && h >= 4 && h < 12) mode = 'Good morning'; // the night just ended; Home follows shortly
    else mode = s.night ? `Night clock · comes on at ${hourText(s.nightFrom)}` : 'Night clock · switched off in Settings';
    $('[data-mode]').textContent = mode;
    $('[data-hint]').textContent = ringingNow() ? '' : byHand ? 'Tap anywhere to go back' : 'Tap anywhere for Home';
  }

  // The coming day's weather and first calendar item.
  let lastWeather = null;
  function renderDay() {
    if (!el.isConnected) return;
    const day = comingDay();
    $('[data-day]').textContent = day.word;
    const first = firstUp(day.date, day.word === 'Today');
    $('[data-first-time]').textContent = first.time;
    $('[data-first]').textContent = first.title;
    $('[data-first-more]').textContent = first.more;
    const f = dayForecast(lastWeather, day.date) || dayForecast(savedWeather(), day.date);
    $('[data-forecast]').textContent = f || 'No forecast just now';
  }

  // Burn-in: nudge the whole picture to the next spot every few minutes.
  function shift() {
    const n = Math.floor(Date.now() / (SHIFT_MINUTES * 60 * 1000)) % SHIFT.length;
    $('[data-shift]').style.transform = `translate(${SHIFT[n][0]}px,${SHIFT[n][1]}px)`;
  }

  // A timer ringing in the night must be impossible to miss, and a tap must stop it rather
  // than walking off to Home and leaving it ringing.
  let ringShown = false;
  function renderRing() {
    if (!el.isConnected) return;
    const r = ringingNow();
    const on = !!r;
    if (on) $('[data-ring-names]').textContent = r.names ? `Time’s up · ${r.names}` : 'Time’s up!';
    if (on === ringShown) return;
    ringShown = on;
    $('[data-ring]').style.display = on ? 'flex' : 'none';
    $('[data-daybox]').style.display = on || clockOnly ? 'none' : 'flex';
    renderTop();
  }

  let word = '';
  function tick() {
    if (!el.isConnected) return;
    const n = clockParts();
    $('[data-time]').textContent = n.time;
    $('[data-ampm]').textContent = n.ampm;
    $('[data-date]').textContent = n.date;
    shift();
    renderTop();
    // Midnight and noon: the bottom row moves on to the next day.
    const w = comingDay().word + new Date().toDateString();
    if (w !== word) { word = w; renderDay(); }
  }
  // On the minute, not every few seconds: the screen is up all night, and the clock should
  // never be up to ten seconds late either.
  function schedule() {
    clearTimeout(tickTimer);
    const now = new Date();
    tickTimer = setTimeout(() => { tick(); schedule(); }, (60 - now.getSeconds()) * 1000 - now.getMilliseconds() + 50);
  }
  tick();
  schedule();
  renderRing();
  // A ringing timer has no event of its own: look every few seconds (reading, not drawing).
  ringTimer = setInterval(renderRing, 3000);

  // The screen was switched off or the page sat in the background: catch up at once.
  offVisible = () => { if (document.visibilityState === 'visible' && el.isConnected) { tick(); schedule(); renderRing(); } };
  document.addEventListener('visibilitychange', offVisible);

  // Tap anywhere: stop a ringing timer, otherwise leave.
  $('[data-tap-anywhere]').addEventListener('click', () => {
    const r = ringingNow();
    if (r) { timerSvc.stopAllRinging(); setTimeout(renderRing, 60); return; }
    if (byHand && history.length > 1) {
      history.back();
      // Nothing to go back to (opened straight from a link): Home instead.
      clearTimeout(backTimer);
      backTimer = setTimeout(() => { if (location.hash === cameFrom) location.hash = '#/home'; }, 400);
    } else location.hash = '#/home';
  });

  async function loadWeather() {
    try {
      const w = await getWeather(await getLocation());
      lastWeather = w;
    } catch (err) {
      console.error(err); // offline: renderDay falls back to the last saved forecast
    }
    renderDay();
  }
  // The clock stays up all night: refresh the forecast and calendar now and then.
  // (Nothing to fetch when only the clock is shown.)
  if (!clockOnly) {
    loadWeather();
    refreshTimer = setInterval(loadWeather, REFRESH_MS);
  }
}

export function unmount() {
  clearTimeout(tickTimer);
  clearInterval(refreshTimer);
  clearInterval(ringTimer);
  clearTimeout(backTimer);
  if (offVisible) document.removeEventListener('visibilitychange', offVisible);
  offVisible = null;
}
