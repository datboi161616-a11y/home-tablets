// Family · Night clock (Night.dc.html in the design)
// Dim warm-on-black clock. Tap anywhere to go back home.
import { getLocation } from '../services/location.js';
import { getWeather, describe } from '../services/weather.js';
import { getWeek } from '../services/calendar-data.js';
import { spot } from '../art.js';

let timer, refreshTimer;

const REFRESH_MS = 30 * 60 * 1000;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const isNight = () => { const h = new Date().getHours(); return h >= 22 || h < 6; };

function clockParts() {
  const now = new Date();
  return {
    time: `${((now.getHours() + 11) % 12) + 1}:${String(now.getMinutes()).padStart(2, '0')}`,
    ampm: now.getHours() < 12 ? 'AM' : 'PM',
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

// "Dentist · 9:30 AM  +2 more" for that day, or 'Nothing planned'.
function firstUp(day) {
  const week = getWeek(day);
  const found = week.filter((d) => dayKey(d.date) === dayKey(day))[0];
  const items = found ? found.events : [];
  if (!items.length) return 'Nothing planned';
  const e = items.filter((x) => x.time !== 'All day')[0] || items[0];
  const more = items.length > 1 ? `  +${items.length - 1} more` : '';
  return `${e.title} · ${e.time}${more}`;
}

// That day's forecast from a weather result (live or saved), or ''.
function dayForecast(w, day) {
  const d = w && w.daily;
  if (!d || !d.time) return '';
  const i = d.time.indexOf(dayKey(day));
  if (i < 0) return '';
  return `${describe(d.weather_code[i]).label} · ${Math.round(d.temperature_2m_max[i])}° / ${Math.round(d.temperature_2m_min[i])}°`;
}

function savedWeather() {
  try { return JSON.parse(localStorage.getItem('weather.v1') || 'null'); } catch (e) { return null; }
}

const label = 'color:#8C6450;font-size:16px;letter-spacing:2px;text-transform:uppercase';

export function mount(el) {
  const c = clockParts();

  el.innerHTML = `
  <a href="#/home" aria-label="Back home" style="position:absolute;top:0;right:0;bottom:0;left:0;padding:48px;background:#0B0907;color:#C98A6B;
     display:flex;flex-direction:column;justify-content:space-between;cursor:pointer;overflow:hidden">
    <!-- Hills along the bottom: near-black on black, so the room stays dark. -->
    <div style="position:absolute;left:0;right:0;bottom:0;pointer-events:none">${spot.nightHills()}</div>
    <div style="position:relative;display:flex;justify-content:space-between;font-size:18px;letter-spacing:2px;text-transform:uppercase;color:#8C6450">
      <span data-mode></span><span>Tap anywhere for Home</span>
    </div>
    <div style="position:relative;display:flex;flex-direction:column;align-items:center;gap:12px">
      <div class="display" style="font-size:240px;font-weight:300;line-height:1;letter-spacing:-6px;white-space:nowrap"><span data-time>${c.time}</span><span data-ampm style="font-size:48px;letter-spacing:0;margin-left:16px;font-weight:400;color:#8C6450">${c.ampm}</span></div>
      <div data-date style="font-size:24px">${c.date}</div>
    </div>
    <div style="position:relative;display:flex;justify-content:space-between;align-items:flex-end;gap:32px;font-size:20px">
      <div style="display:flex;flex-direction:column;gap:6px;min-width:0"><span data-day style="${label}">Tomorrow</span><span data-forecast style="white-space:nowrap">—</span></div>
      <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;min-width:0"><span style="${label}">First up</span>
        <span data-first style="max-width:560px;white-space:pre;overflow:hidden;text-overflow:ellipsis"></span></div>
    </div>
  </a>`;

  const $ = (s) => el.querySelector(s);

  // Bottom row: the coming day's weather and first calendar item.
  let lastWeather = null;
  function renderDay() {
    if (!el.isConnected) return;
    const day = comingDay();
    $('[data-mode]').textContent = isNight() ? 'Night mode · dimmed until 6 AM' : 'Night clock';
    $('[data-day]').textContent = day.word;
    $('[data-first]').textContent = firstUp(day.date);
    const f = dayForecast(lastWeather, day.date) || dayForecast(savedWeather(), day.date);
    $('[data-forecast]').textContent = f || (lastWeather ? '—' : 'Forecast unavailable');
  }
  renderDay();

  async function loadWeather() {
    try {
      const w = await getWeather(await getLocation());
      lastWeather = w;
    } catch (err) {
      console.error(err); // offline: renderDay falls back to the last saved forecast
    }
    renderDay();
  }
  loadWeather();

  // Clock every 10s; the bottom row moves on at midnight and noon.
  let word = comingDay().word + new Date().toDateString();
  timer = setInterval(() => {
    const n = clockParts();
    $('[data-time]').textContent = n.time;
    $('[data-ampm]').textContent = n.ampm;
    $('[data-date]').textContent = n.date;
    const w = comingDay().word + new Date().toDateString();
    if (w !== word) { word = w; renderDay(); }
  }, 10000);
  // The clock stays up all night: refresh the forecast and calendar now and then.
  refreshTimer = setInterval(loadWeather, REFRESH_MS);
}

export function unmount() {
  clearInterval(timer);
  clearInterval(refreshTimer);
}
