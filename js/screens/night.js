// Family · Night clock (Night.dc.html in the design)
// Dim warm-on-black clock. Tap anywhere to go back home.
import { getLocation } from '../services/location.js';
import { getWeather, describe } from '../services/weather.js';
import { firstTomorrow } from '../services/calendar-data.js';

let timer;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function clockParts() {
  const now = new Date();
  return {
    time: `${((now.getHours() + 11) % 12) + 1}:${String(now.getMinutes()).padStart(2, '0')}`,
    date: now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
  };
}

const label = 'color:#8C6450;font-size:16px;letter-spacing:2px;text-transform:uppercase';

export function mount(el) {
  const c = clockParts();
  const ev = firstTomorrow();

  el.innerHTML = `
  <a href="#/home" aria-label="Back home" style="position:absolute;top:0;right:0;bottom:0;left:0;padding:48px;background:#0B0907;color:#C98A6B;
     display:flex;flex-direction:column;justify-content:space-between;cursor:pointer">
    <div style="font-size:18px;letter-spacing:2px;text-transform:uppercase;color:#8C6450">Night mode · dimmed until 6 AM</div>
    <div style="display:flex;flex-direction:column;align-items:center;gap:12px">
      <div data-time class="display" style="font-size:240px;font-weight:300;line-height:1;letter-spacing:-6px">${c.time}</div>
      <div data-date style="font-size:24px">${c.date}</div>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:flex-end;font-size:20px">
      <div style="display:flex;flex-direction:column;gap:6px"><span style="${label}">Tomorrow</span><span data-tomorrow>—</span></div>
      <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end"><span style="${label}">First up</span>
        <span style="max-width:560px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${ev ? esc(`${ev.title} · ${ev.time}`) : 'Nothing planned'}</span></div>
    </div>
  </a>`;

  const $ = (s) => el.querySelector(s);

  timer = setInterval(() => {
    const n = clockParts();
    $('[data-time]').textContent = n.time;
    $('[data-date]').textContent = n.date;
  }, 10000);

  (async () => {
    try {
      const w = await getWeather(await getLocation());
      if (!el.isConnected) return;
      const d = w.daily;
      $('[data-tomorrow]').textContent =
        `${describe(d.weather_code[1]).label} · ${Math.round(d.temperature_2m_max[1])}° / ${Math.round(d.temperature_2m_min[1])}°`;
    } catch (err) {
      console.error(err);
      $('[data-tomorrow]').textContent = 'Forecast unavailable';
    }
  })();
}

export function unmount() {
  clearInterval(timer);
}
