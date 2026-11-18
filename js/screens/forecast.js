// Family · Weather forecast (Forecast.dc.html in the design)
import { settings } from '../config.js';
import { getLocation } from '../services/location.js';
import { describe } from '../services/weather.js';
import { getForecast, outlook, advice, fmtTime } from '../services/forecast-data.js';
import { icon } from '../icons.js';
import { getAlerts, untilText, alertColor } from '../services/weather-alerts.js';

let timer;

const dayName = (iso) => new Date(`${iso}T12:00`).toLocaleDateString('en-US', { weekday: 'short' });

export function mount(el) {
  el.innerHTML = `
  <div style="height:100%;padding:40px;display:flex;flex-direction:column;gap:24px">
    <div style="display:flex;align-items:center;gap:16px">
      <a href="#/launcher" class="pill" style="background:#fff">← Menu</a>
      <div data-f-title class="display" style="font-size:40px;font-weight:500">Weather</div>
    </div>

    <div data-f-alert style="display:none;border-radius:20px;padding:16px 24px;color:#fff;flex-direction:column;gap:4px"></div>

    <div data-f-top class="skeleton" style="display:grid;grid-template-columns:1.3fr 1fr;gap:24px">
      <div style="background:var(--ink);color:#fff;border-radius:24px;padding:32px;display:flex;align-items:center;gap:28px">
        <span data-f-icon style="display:flex">${icon('cloud', 120, '#FFFFFF', 1.3)}</span>
        <div style="display:flex;flex-direction:column;gap:6px;min-width:0">
          <div data-f-temp class="display" style="font-size:120px;font-weight:300;line-height:1">--°</div>
          <div data-f-label style="font-size:24px;font-weight:500">Loading weather…</div>
          <div data-f-outlook style="font-size:18px;color:#C9CFD6">Finding your location</div>
        </div>
      </div>
      <div class="card" style="padding:28px;display:flex;flex-direction:column;gap:14px">
        <div class="eyebrow" style="color:${settings.accent}">Before you head out</div>
        <div data-f-advice class="display" style="font-size:30px;font-weight:500;line-height:1.2">&nbsp;</div>
        <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:auto;font-size:16px">
          <div><div class="muted">Sunrise</div><div data-f-sunrise style="font-weight:600;font-size:20px">--</div></div>
          <div><div class="muted">Sunset</div><div data-f-sunset style="font-weight:600;font-size:20px">--</div></div>
          <div><div class="muted">Wind</div><div data-f-wind style="font-weight:600;font-size:20px">--</div></div>
        </div>
      </div>
    </div>

    <div data-f-days class="skeleton" style="flex-grow:1;min-height:0;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:16px">
      ${Array.from({ length: 5 }, () => dayCard({ day: '---', sky: '&nbsp;', hi: '--°', lo: '--°' })).join('')}
    </div>
  </div>`;

  const $ = (s) => el.querySelector(s);

  async function load() {
    try {
      const loc = await getLocation();
      if (!el.isConnected) return;
      if (loc.town) $('[data-f-title]').textContent = `Weather in ${loc.town}`;
      // Watches and warnings from the National Weather Service, most serious first.
      getAlerts(loc).then((list) => {
        if (!el.isConnected || !list.length) return;
        const a = list[0];
        const box = $('[data-f-alert]');
        box.style.display = 'flex';
        box.style.background = alertColor(a);
        const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
        box.innerHTML = `
          <div style="font-size:22px;font-weight:700">⚠ ${esc(a.event)} <span style="font-weight:500;opacity:.9">${esc(untilText(a.until))}</span>${list.length > 1 ? `<span style="font-weight:500;opacity:.8"> · also ${esc(list.slice(1).map((x) => x.event).join(', '))}</span>` : ''}</div>
          ${a.what ? `<div style="font-size:17px;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(a.what)}</div>` : ''}`;
      }).catch(() => {});
      const f = await getForecast(loc);
      if (!el.isConnected) return;
      const now = describe(f.code);
      $('[data-f-top]').classList.remove('skeleton');
      $('[data-f-days]').classList.remove('skeleton');
      $('[data-f-icon]').innerHTML = icon(now.icon, 120, '#FFFFFF', 1.3);
      $('[data-f-temp]').textContent = `${f.temp}°`;
      $('[data-f-label]').textContent = `${now.label} · feels like ${f.feels}°`;
      $('[data-f-outlook]').textContent = outlook(f);
      $('[data-f-advice]').textContent = advice(f);
      $('[data-f-sunrise]').textContent = fmtTime(f.sunrise);
      $('[data-f-sunset]').textContent = fmtTime(f.sunset);
      $('[data-f-wind]').textContent = f.wind;
      // Next five days, starting tomorrow.
      $('[data-f-days]').innerHTML = f.days.slice(1, 6).map((d) => dayCard({
        day: dayName(d.date),
        sky: describe(d.code).label,
        icon: describe(d.code).icon,
        hi: `${d.hi}°`,
        lo: `${d.lo}°`,
      })).join('');
    } catch (err) {
      console.error(err);
      if (!el.isConnected) return;
      $('[data-f-label]').textContent = 'Weather unavailable';
      $('[data-f-outlook]').textContent = 'Check the Wi-Fi connection';
    }
  }

  load();
  timer = setInterval(load, 15 * 60 * 1000);
}

function dayCard(d) {
  return `
    <div class="card" style="padding:24px;display:flex;flex-direction:column;align-items:center;justify-content:space-between">
      <div style="font-size:20px;font-weight:600">${d.day}</div>
      <div style="display:flex;flex-direction:column;align-items:center;gap:8px">
        ${icon(d.icon, 56, 'var(--accent)')}
        <div class="muted" style="font-size:17px;text-align:center">${d.sky}</div>
      </div>
      <div class="display" style="font-size:44px;font-weight:500">${d.hi}</div>
      <div class="muted" style="font-size:18px">Low ${d.lo}</div>
    </div>`;
}

export function unmount() {
  clearInterval(timer);
}
