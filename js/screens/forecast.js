// Family · Weather forecast (Forecast.dc.html in the design)
import { settings } from '../config.js';
import { getLocation } from '../services/location.js';
import { describe } from '../services/weather.js';
import { getForecast, outlook, advice, fmtTime } from '../services/forecast-data.js';
import { icon } from '../icons.js';
import { getAlerts, untilText, alertColor } from '../services/weather-alerts.js';

let timer, retry;

const dayName = (iso) => new Date(`${iso}T12:00`).toLocaleDateString('en-US', { weekday: 'short' });
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// Today's date as Open-Meteo writes it ("2026-11-18", local time).
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const clock = (ms) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

// After dark a clear sky gets a moon, not a sun (same 24x24 line style as icons.js).
const NIGHT = {
  sun: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  partly: '<path d="M11.5 3.2A4.2 4.2 0 1 0 15.6 9 3.3 3.3 0 0 1 11.5 3.2z"/><path d="M18 20H8.5a4 4 0 1 1 .8-7.9 5 5 0 0 1 9.2 1.9A3 3 0 0 1 18 20z"/>',
};
function skyIcon(code, isDay, size, color, stroke = 1.5) {
  const name = describe(code).icon;
  if (isDay !== false || !NIGHT[name]) return icon(name, size, color, stroke);
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}"
    stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${NIGHT[name]}</svg>`;
}

export function mount(el) {
  el.innerHTML = `
  <style>
    /* While a warning bar is showing, everything below tightens up so the
       five days still fit on the screen. */
    .f-tight .f-now { padding:22px 32px !important; }
    .f-tight .f-now [data-f-icon] svg { width:92px; height:92px; }
    .f-tight [data-f-temp] { font-size:92px !important; }
    .f-tight .f-advice-card { padding:22px 28px !important; gap:10px !important; }
    .f-tight [data-f-advice] { font-size:26px !important; }
    .f-tight [data-f-hours] { padding:10px 20px !important; }
    .f-tight .f-day { padding:12px 18px !important; }
    .f-tight .f-day svg { width:36px; height:36px; }
    .f-tight .f-day-hi { font-size:32px !important; }
  </style>
  <div data-f-page style="height:100%;padding:40px;display:flex;flex-direction:column;gap:24px">
    <div style="display:flex;align-items:center;gap:16px">
      <a href="#/launcher" class="pill" style="background:#fff">← Menu</a>
      <div data-f-title class="display" style="font-size:40px;font-weight:500;flex-grow:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Weather</div>
      <div data-f-updated class="muted" style="font-size:16px;text-align:right;flex:none"></div>
    </div>

    <div data-f-alert style="display:none;border-radius:20px;padding:16px 24px;color:#fff;flex-direction:column;gap:4px;cursor:pointer"></div>

    <div data-f-top class="skeleton" style="display:grid;grid-template-columns:1.3fr 1fr;gap:24px">
      <div class="f-now" style="background:var(--ink);color:#fff;border-radius:24px;padding:32px;display:flex;align-items:center;gap:28px">
        <span data-f-icon style="display:flex">${icon('cloud', 120, '#FFFFFF', 1.3)}</span>
        <div style="display:flex;flex-direction:column;gap:6px;min-width:0">
          <div data-f-temp class="display" style="font-size:120px;font-weight:300;line-height:1">--°</div>
          <div data-f-label style="font-size:24px;font-weight:500">Loading weather…</div>
          <div data-f-outlook style="font-size:18px;color:#C9CFD6">Finding your location</div>
        </div>
      </div>
      <div class="card f-advice-card" style="padding:28px;display:flex;flex-direction:column;gap:14px">
        <div class="eyebrow" style="color:${settings.accent}">Before you head out</div>
        <div data-f-advice class="display" style="font-size:30px;font-weight:500;line-height:1.2">&nbsp;</div>
        <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:auto;font-size:16px">
          <div><div class="muted">Sunrise</div><div data-f-sunrise style="font-weight:600;font-size:20px">--</div></div>
          <div><div class="muted">Sunset</div><div data-f-sunset style="font-weight:600;font-size:20px">--</div></div>
          <div><div class="muted">Wind</div><div data-f-wind style="font-weight:600;font-size:20px">--</div></div>
        </div>
      </div>
    </div>

    <div data-f-hours class="card" style="padding:16px 20px;display:none;grid-template-columns:repeat(12,minmax(0,1fr));gap:4px"></div>

    <div data-f-days class="skeleton" style="flex-grow:1;min-height:0;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:16px">
      ${Array.from({ length: 5 }, () => dayCard({ day: '---', sky: '&nbsp;', hi: '--°', lo: '--°' })).join('')}
    </div>
  </div>
  <div data-f-detail style="display:none;position:absolute;top:0;right:0;bottom:0;left:0;background:rgba(29,36,48,.45);z-index:5;align-items:center;justify-content:center"></div>`;

  const $ = (s) => el.querySelector(s);
  let alerts = [];
  let loaded = false;

  // Tap the warning bar: every warning in full, with what to do about it.
  el.addEventListener('click', (e) => {
    const detail = $('[data-f-detail]');
    if (detail.style.display === 'flex') {
      if (e.target === detail || e.target.closest('[data-close]')) detail.style.display = 'none';
      return;
    }
    if (!e.target.closest('[data-f-alert]') || !alerts.length) return;
    detail.innerHTML = `
      <div style="background:#fff;border-radius:24px;padding:28px 32px;width:760px;max-height:660px;display:flex;flex-direction:column;gap:16px">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:16px">
          <div class="display" style="font-size:32px;font-weight:500">Weather warnings</div>
          <button data-close class="pill" style="background:var(--ink);color:#fff;border:none;cursor:pointer">Close</button>
        </div>
        <div style="overflow-y:auto;display:flex;flex-direction:column;gap:14px">
          ${alerts.map((a) => `
            <div style="border-top:1px solid var(--line);padding-top:14px;display:flex;flex-direction:column;gap:6px">
              <div style="font-size:22px;font-weight:700;color:${alertColor(a)}">${esc(a.event)} <span class="muted" style="font-weight:500;font-size:18px">${esc(untilText(a.until))}</span></div>
              ${a.what ? `<div style="font-size:18px;line-height:1.4">${esc(a.what)}</div>` : ''}
              ${a.todo ? `<div style="font-size:18px;line-height:1.4"><span style="font-weight:600">What to do:</span> ${esc(a.todo)}</div>` : ''}
            </div>`).join('')}
          <div class="muted" style="font-size:15px">From the National Weather Service</div>
        </div>
      </div>`;
    detail.style.display = 'flex';
  });

  function showAlerts(list) {
    alerts = list;
    const box = $('[data-f-alert]');
    $('[data-f-page]').classList.toggle('f-tight', list.length > 0);
    if (!list.length) { box.style.display = 'none'; box.innerHTML = ''; return; } // a warning that has ended goes away
    const a = list[0];
    box.style.display = 'flex';
    box.style.background = alertColor(a);
    box.innerHTML = `
      <div style="font-size:22px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">⚠ ${esc(a.event)} <span style="font-weight:500;opacity:.9">${esc(untilText(a.until))}</span>${list.length > 1 ? `<span style="font-weight:500;opacity:.8"> · also ${esc(list.slice(1).map((x) => x.event).join(', '))}</span>` : ''}</div>
      <div style="display:flex;align-items:flex-end;gap:16px">
        <div style="flex-grow:1;min-width:0;font-size:17px;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(a.what || '')}</div>
        <div style="flex:none;font-size:16px;font-weight:600;text-decoration:underline">Tap for details</div>
      </div>`;
  }

  async function load() {
    clearTimeout(retry);
    try {
      const loc = await getLocation();
      if (!el.isConnected) return;
      if (loc.town) $('[data-f-title]').textContent = `Weather in ${loc.town}`;
      // Watches and warnings from the National Weather Service, most serious first.
      getAlerts(loc).then((list) => { if (el.isConnected) showAlerts(list); }).catch(() => {});
      const f = await getForecast(loc);
      if (!el.isConnected) return;
      const now = describe(f.code);
      $('[data-f-top]').classList.remove('skeleton');
      $('[data-f-days]').classList.remove('skeleton');
      $('[data-f-icon]').innerHTML = skyIcon(f.code, f.isDay, 120, '#FFFFFF', 1.3);
      loaded = true;
      // When this forecast is from, and a plain warning if it's an old saved copy.
      const upd = $('[data-f-updated]');
      if (f.stale) {
        const sameDay = new Date(f.at).toDateString() === new Date().toDateString();
        upd.innerHTML = `<span style="color:#B5701A;font-weight:600">No internet right now</span><br>Showing the forecast from ${sameDay ? '' : `${new Date(f.at).toLocaleDateString('en-US', { weekday: 'short' })} `}${clock(f.at)}`;
        retry = setTimeout(load, 2 * 60 * 1000); // try again soon, not in 15 minutes
      } else {
        upd.textContent = `Updated ${clock(f.at)}`;
      }
      $('[data-f-temp]').textContent = `${f.temp}°`;
      $('[data-f-label]').textContent = `${now.label} · feels like ${f.feels}°`;
      $('[data-f-outlook]').textContent = outlook(f);
      $('[data-f-advice]').textContent = advice(f);
      $('[data-f-sunrise]').textContent = fmtTime(f.sunrise);
      $('[data-f-sunset]').textContent = fmtTime(f.sunset);
      $('[data-f-wind]').textContent = f.wind;
      // Next 12 hours: time, sky, temperature, chance of rain or snow.
      const hours = (f.hours || []).filter((h) => new Date(h.time).getTime() > Date.now() - 3600000).slice(0, 12);
      if (hours.length) {
        const hrs = $('[data-f-hours]');
        hrs.style.display = 'grid';
        hrs.innerHTML = hours.map((h, i) => `
          <div style="display:flex;flex-direction:column;align-items:center;gap:4px">
            <div class="muted" style="font-size:15px;font-weight:600">${i === 0 ? 'Now' : new Date(h.time).toLocaleTimeString('en-US', { hour: 'numeric' })}</div>
            ${skyIcon(h.code, h.isDay, 30, 'var(--accent)')}
            <div class="display" style="font-size:22px;font-weight:500">${h.temp}°</div>
            <div style="font-size:13px;font-weight:600;color:${h.rain >= 30 ? '#2D5BA8' : '#B7BEC8'}">${h.rain >= 10 ? `${h.rain}%` : '&nbsp;'}</div>
          </div>`).join('');
      }
      // Next five days, starting tomorrow (a saved copy may start on an earlier day).
      const today = todayIso();
      $('[data-f-days]').innerHTML = f.days.filter((d) => d.date > today).slice(0, 5).map((d, i) => dayCard({
        day: i === 0 && f.days.some((x) => x.date === today) ? 'Tomorrow' : dayName(d.date),
        sky: describe(d.code).label,
        icon: describe(d.code).icon,
        hi: `${d.hi}°`,
        lo: `${d.lo}°`,
        rain: d.rain,
      })).join('');
    } catch (err) {
      console.error(err);
      if (!el.isConnected) return;
      // Keep showing what's already on screen; only explain when there's nothing.
      if (!loaded) {
        $('[data-f-label]').textContent = 'Can’t get the weather right now';
        $('[data-f-outlook]').textContent = 'Check the Wi-Fi. Trying again in a minute…';
        $('[data-f-advice]').textContent = 'The forecast will appear here by itself.';
      } else {
        $('[data-f-updated]').innerHTML = '<span style="color:#B5701A;font-weight:600">No internet right now</span>';
      }
      retry = setTimeout(load, 60 * 1000);
    }
  }

  load();
  timer = setInterval(load, 15 * 60 * 1000);
}

function dayCard(d) {
  return `
    <div class="card f-day" style="padding:18px 24px;display:flex;flex-direction:column;align-items:center;justify-content:space-between;min-height:0">
      <div style="font-size:20px;font-weight:600">${d.day}</div>
      <div style="display:flex;flex-direction:column;align-items:center;gap:4px">
        ${icon(d.icon, 48, 'var(--accent)')}
        <div class="muted" style="font-size:17px;text-align:center">${d.sky}${d.rain >= 20 ? ` · <span style="color:#2D5BA8;font-weight:600">${d.rain}%</span>` : ''}</div>
      </div>
      <div class="display f-day-hi" style="font-size:40px;font-weight:500;line-height:1">${d.hi}</div>
      <div class="muted" style="font-size:18px">Low ${d.lo}</div>
    </div>`;
}

export function unmount() {
  clearInterval(timer);
  clearTimeout(retry);
}
