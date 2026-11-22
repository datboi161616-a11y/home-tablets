// Family · Weather forecast (Forecast.dc.html in the design)
import { backHref, backLabel } from '../services/nav.js';
import { settings } from '../config.js';
import { getLocation } from '../services/location.js';
import { describe } from '../services/weather.js';
import {
  getForecast, freshen, outlook, advice, rangeLine, fmtTime, deg, uvWord, windFrom, amountText, isoDay,
} from '../services/forecast-data.js';
import { weatherScene, wxIcon, wxTint, wearArt } from '../art.js';
import { getAlertsInfo, whenText, kindText, alertColor } from '../services/weather-alerts.js';

let timer, retry, ticker, onPlace;

const DAYS = 6; // tomorrow and the five after it: the rest of the week
const dayName = (iso) => new Date(`${iso}T12:00`).toLocaleDateString('en-US', { weekday: 'short' });
const longDay = (iso) => new Date(`${iso}T12:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
const weekend = (iso) => { const d = new Date(`${iso}T12:00`).getDay(); return d === 0 || d === 6; };
const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clock = (ms) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const hourOf = (iso) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric' });
const timeOr = (iso) => (iso ? fmtTime(iso) : '--');

/** "just now", "25 minutes ago", "3 hours ago", "yesterday 6:05 PM" */
function ageText(ms) {
  const min = Math.round((Date.now() - ms) / 60000);
  if (min < 2) return 'just now';
  if (min < 60) return `${min} minutes ago`;
  const hrs = Math.round(min / 60);
  if (hrs < 12 || new Date(ms).toDateString() === new Date().toDateString()) return hrs === 1 ? 'an hour ago' : `${hrs} hours ago`;
  const y = new Date(); y.setDate(y.getDate() - 1);
  const day = new Date(ms).toDateString() === y.toDateString() ? 'yesterday' : new Date(ms).toLocaleDateString('en-US', { weekday: 'long' });
  return `${day} ${clock(ms)}`;
}

// The big picture behind the temperature, filling the card (cropped, never squashed;
// the hills stay low so the text sits on open sky).
const scene = (kind, night) => weatherScene(kind, night)
  .replace('preserveAspectRatio="xMidYMid meet"', 'preserveAspectRatio="xMidYMid slice"');

// Text colours over the scene: dark on a daytime sky, light on the night sky.
// (Both stay above 4.5:1 against every sky and the far hills.)
function heroInk(night) {
  return night ? { main: '#FFFFFF', sub: '#DCE3EE' } : { main: '#13202B', sub: '#13202B' };
}

// What to wear, read from the advice line (and the feels-like temperature).
function wearFor(text, f) {
  const t = String(text).toLowerCase();
  const w = [];
  if (/heavy coat|bundle up|coat and boots/.test(t)) w.push('coat');
  else if (/jacket/.test(t)) w.push('jacket');
  if (/umbrella/.test(t)) w.push('umbrella');
  if (/sunglasses|sunscreen/.test(t)) w.push('sunglasses');
  if (!w.length && f && f.feels != null && !/no coat/.test(t)) {
    const cold = settings.units === 'fahrenheit' ? f.feels <= 55 : f.feels <= 13;
    if (cold) w.push('jacket');
  }
  return w;
}

// Sunrise and sunset fall between the hours: little markers in the hour strip.
function sunEvents(f) {
  const out = [];
  (f.days || []).forEach((d) => {
    if (d.sunrise) out.push({ at: new Date(d.sunrise).getTime(), kind: 'Sunrise', iso: d.sunrise });
    if (d.sunset) out.push({ at: new Date(d.sunset).getTime(), kind: 'Sunset', iso: d.sunset });
  });
  return out;
}

/**
 * A row of hours, one column each: time, sky, temperature, chance of rain.
 * Night hours sit on a darker band; a new day is named at midnight.
 */
function hoursHtml(list, f, { firstIsNow = false, markNow = false } = {}) {
  const events = sunEvents(f);
  const cols = [];
  const nowMs = Date.now();
  list.forEach((h, i) => {
    const t = new Date(h.time);
    const midnight = t.getHours() === 0;
    const isNow = markNow && nowMs >= t.getTime() && nowMs < t.getTime() + 3600000;
    const past = markNow && t.getTime() + 3600000 <= nowMs;
    const label = (i === 0 && firstIsNow) || isNow ? 'Now' : midnight && i > 0 ? `${dayName(h.time.slice(0, 10))} ${hourOf(h.time)}` : hourOf(h.time);
    const night = h.isDay === false;
    cols.push(`
      <div class="f-hr${night ? ' f-hr-night' : ''}"${isNow ? ' data-f-now style="box-shadow:inset 0 0 0 3px #2D5BA8"' : past ? ' style="opacity:.45"' : ''}>
        <div class="f-hr-time" style="${midnight && i > 0 ? `color:${settings.accent}` : ''}">${esc(label)}</div>
        ${wxIcon(describe(h.code).icon, 32, night)}
        <div class="display f-hr-temp">${deg(h.temp)}</div>
        <div class="f-hr-rain" style="color:${h.rain >= 30 ? '#2D5BA8' : '#8A93A1'}">${h.rain >= 10 ? `${h.rain}%` : '&nbsp;'}</div>
      </div>`);
    const start = t.getTime();
    events.filter((e) => e.at >= start && e.at < start + 3600000 && (i > 0 || !firstIsNow || e.at > Date.now()))
      .forEach((e) => cols.push(`
        <div class="f-hr f-hr-sun">
          <div class="f-hr-time">${e.kind}</div>
          ${wxIcon('sun', 28, false)}
          <div class="f-hr-suntime">${esc(fmtTime(e.iso))}</div>
          <div class="f-hr-rain">&nbsp;</div>
        </div>`));
  });
  return cols.join('');
}

export function mount(el) {
  el.innerHTML = `
  <style>
    .f-page { height:100%; padding:30px 40px; display:flex; flex-direction:column; gap:18px; }
    .f-top { display:grid; grid-template-columns:1.12fr 1fr; gap:20px; flex:none; height:316px; }
    .f-now { background:#BFD9EA; border-radius:24px; position:relative; overflow:hidden; min-height:0; cursor:pointer; }
    .f-now-text { position:relative; padding:24px 32px; display:flex; flex-direction:column; gap:4px; min-width:0; height:100%; box-sizing:border-box; }
    [data-f-temp] { font-size:116px; font-weight:400; line-height:.95; }
    .f-more { position:absolute; right:18px; bottom:18px; background:rgba(255,255,255,.92); color:#13202B; border-radius:999px; padding:0 20px; height:52px; display:flex; align-items:center; font-size:17px; font-weight:600; }
    .f-advice-card { padding:22px 26px; display:flex; flex-direction:column; gap:10px; min-height:0; }
    [data-f-advice] { font-size:24px; font-weight:500; line-height:1.25; }
    .f-facts { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px 14px; margin-top:auto; }
    .f-fact-l { font-size:15px; color:var(--ink-2); }
    .f-fact-v { font-size:20px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .f-fact-s { font-size:15px; color:var(--ink-2); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; min-height:18px; }
    .f-hours { flex:none; padding:10px 12px; overflow-x:auto; overflow-y:hidden; display:none; -webkit-overflow-scrolling:touch; }
    .f-hours-row { display:flex; gap:4px; }
    .f-hr { flex:none; width:84px; padding:6px 0; border-radius:14px; display:flex; flex-direction:column; align-items:center; gap:3px; }
    .f-hr-night { background:#E6EAF3; }
    .f-hr-sun { background:#FFF4DC; }
    .f-hr-time { font-size:15px; font-weight:600; color:var(--ink-2); white-space:nowrap; }
    .f-hr-temp { font-size:22px; font-weight:500; }
    .f-hr-suntime { font-size:15px; font-weight:600; white-space:nowrap; line-height:26px; }
    .f-hr-rain { font-size:15px; font-weight:600; }
    .f-days { flex-grow:1; min-height:0; display:grid; grid-template-columns:repeat(${DAYS},minmax(0,1fr)); gap:14px; }
    .f-day { padding:12px 14px; display:flex; flex-direction:column; align-items:center; justify-content:space-between; min-height:0; cursor:pointer; }
    .f-day-name { font-size:20px; font-weight:600; padding:2px 12px; border-radius:999px; white-space:nowrap; }
    .f-day-hi { font-size:36px; font-weight:500; line-height:1; }
    .f-bar { position:relative; width:100%; height:8px; border-radius:4px; background:rgba(19,32,43,.10); }
    .f-bar span { position:absolute; top:0; bottom:0; border-radius:4px; background:linear-gradient(90deg,#5B8BD0,#E39B3B); }
    /* While a warning bar is showing, everything below tightens up so the
       week still fits on the screen. */
    .f-tight .f-top { height:252px; }
    .f-tight .f-now-text { padding:18px 28px; }
    .f-tight [data-f-temp] { font-size:88px; }
    .f-tight .f-wear svg { width:72px !important; height:60px !important; }
    .f-tight .f-advice-card { padding:16px 22px; gap:6px; }
    .f-tight [data-f-advice] { font-size:21px; }
    .f-tight .f-fact-s { display:none; }
    .f-tight .f-day svg { width:40px; height:35px; }
    .f-tight .f-day-hi { font-size:30px; }
    .f-tight .f-day-sky { display:none; }
    .f-scene { position:absolute; top:0; right:0; bottom:0; left:0; }
    .f-scene svg { width:100%; height:100%; }
    .f-x { background:var(--ink); color:#fff; border:none; cursor:pointer; min-height:56px; padding:0 28px; font-size:18px; }
  </style>
  <div data-f-page class="f-page">
    <div style="display:flex;align-items:center;gap:16px;flex:none">
      <a href="${backHref()}" class="pill" style="background:#fff">${backLabel()}</a>
      <div data-f-title class="display" style="font-size:38px;font-weight:500;flex-grow:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Weather</div>
      <div data-f-updated class="muted" style="font-size:16px;text-align:right;flex:none;line-height:1.35"></div>
      <button data-f-retry class="pill" style="display:none;background:#fff;border:1px solid var(--line);cursor:pointer;min-height:52px;font-size:17px;flex:none">Try again</button>
    </div>

    <div data-f-alert role="button" style="display:none;border-radius:20px;padding:14px 22px;color:#fff;flex-direction:column;gap:4px;cursor:pointer;flex:none"></div>

    <div data-f-top class="f-top skeleton">
      <div class="f-now" data-f-today>
        <div data-f-scene class="f-scene">${scene('cloud', false)}</div>
        <div data-f-text class="f-now-text" style="color:#13202B">
          <div data-f-temp class="display">--°</div>
          <div data-f-label style="font-size:24px;font-weight:600;margin-top:6px">Loading weather…</div>
          <div data-f-range style="font-size:18px"></div>
          <div data-f-outlook style="font-size:19px;font-weight:600">Finding your location</div>
        </div>
        <div data-f-more class="f-more" style="display:none">Today hour by hour</div>
      </div>
      <div class="card f-advice-card">
        <div class="eyebrow" style="color:${settings.accent}">Before you head out</div>
        <div style="display:flex;gap:16px;align-items:center">
          <div data-f-advice class="display" style="flex:1;min-width:0">&nbsp;</div>
          <span data-f-wear class="f-wear" style="display:flex;flex:none"></span>
        </div>
        <div class="f-facts">
          ${['sunrise', 'sunset', 'wind', 'humid', 'uv', 'rain'].map((k) => `
            <div><div class="f-fact-l" data-f-l-${k}>${{ sunrise: 'Sunrise', sunset: 'Sunset', wind: 'Wind', humid: 'Humidity', uv: 'Sun strength', rain: 'Rain, next 12 hrs' }[k]}</div><div class="f-fact-v" data-f-v-${k}>--</div><div class="f-fact-s" data-f-s-${k}></div></div>`).join('')}
        </div>
      </div>
    </div>

    <div data-f-hours class="card f-hours"><div data-f-hours-row class="f-hours-row"></div></div>

    <div data-f-days class="f-days skeleton">
      ${Array.from({ length: DAYS }, () => dayCard({ day: '---', sky: '&nbsp;', hi: '--°', lo: '--°' })).join('')}
    </div>
  </div>
  <div data-f-detail style="display:none;position:absolute;top:0;right:0;bottom:0;left:0;background:rgba(29,36,48,.45);z-index:5;align-items:center;justify-content:center"></div>`;

  const $ = (s) => el.querySelector(s);
  let alerts = [];
  let alertInfo = null;
  let last = null;        // the forecast on screen, as saved (freshen() works out "now" again)
  let shownHour = -1;     // the hour the strip was drawn for
  let loading = false;
  let gen = 0;            // a newer load (e.g. the town changed) wins over an older one

  const detail = $('[data-f-detail]');
  const closeDetail = () => { detail.style.display = 'none'; detail.innerHTML = ''; };

  el.addEventListener('click', (e) => {
    if (detail.style.display === 'flex') {
      if (e.target === detail || e.target.closest('[data-close]')) closeDetail();
      return;
    }
    if (e.target.closest('[data-f-retry]')) { load({ fresh: true }); return; }
    if (e.target.closest('[data-f-alert]') && alerts.length) { openAlerts(); return; }
    const day = e.target.closest('[data-f-date]');
    if (day && last) { openDay(day.getAttribute('data-f-date')); return; }
    if (e.target.closest('[data-f-today]') && last) openDay(isoDay());
  });

  // Tap the warning bar: every warning in full, with when, what it means and what to do.
  function openAlerts() {
    detail.innerHTML = `
      <div data-f-alerts-open style="background:#fff;border-radius:24px;padding:26px 32px;width:820px;max-height:700px;display:flex;flex-direction:column;gap:14px">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:16px">
          <div class="display" style="font-size:32px;font-weight:500">${alerts.length > 1 ? `${alerts.length} weather warnings` : 'Weather warning'}</div>
          <button data-close class="pill f-x">Close</button>
        </div>
        <div style="overflow-y:auto;display:flex;flex-direction:column;gap:14px">
          ${alerts.map((a) => `
            <div style="border-left:8px solid ${alertColor(a)};padding:4px 0 4px 16px;display:flex;flex-direction:column;gap:6px">
              <div style="font-size:23px;font-weight:700;color:${alertColor(a)}">${esc(a.event)}</div>
              ${whenText(a) ? `<div style="font-size:18px;font-weight:600">${esc(whenText(a).replace(/^./, (c) => c.toUpperCase()))}</div>` : ''}
              ${kindText(a) ? `<div class="muted" style="font-size:17px">${esc(kindText(a))}</div>` : ''}
              ${a.what ? `<div style="font-size:18px;line-height:1.4">${esc(a.what)}</div>` : ''}
              ${a.todo ? `<div style="font-size:18px;line-height:1.4"><span style="font-weight:600">What to do:</span> ${esc(a.todo)}</div>` : ''}
            </div>`).join('')}
          <div class="muted" style="font-size:15px">From the National Weather Service${alertInfo && !alertInfo.ok ? ' · last checked a while ago, the internet is off' : ''}</div>
        </div>
      </div>`;
    detail.style.display = 'flex';
  }

  // Tap a day (or today's picture): that day hour by hour, with everything else known about it.
  function openDay(date) {
    const f = freshen(last);
    const d = (f.days || []).find((x) => x.date === date);
    if (!d) return;
    const isToday = date === isoDay();
    // Today: the whole day, the hours gone by faded and "Now" ringed.
    const hours = (f.hours || []).filter((h) => h.time.slice(0, 10) === date);
    const sky = describe(d.code);
    const rainAmt = amountText(d.wet, f.rainUnit || 'in');
    const snowAmt = amountText(d.snow, f.snowUnit || 'in');
    const fact = (l, v, s) => `<div><div class="f-fact-l">${l}</div><div class="f-fact-v">${v}</div><div class="f-fact-s" style="white-space:normal">${s || ''}</div></div>`;
    detail.innerHTML = `
      <div style="background:#fff;border-radius:24px;padding:26px 30px;width:1160px;max-height:720px;display:flex;flex-direction:column;gap:18px">
        <div style="display:flex;align-items:center;gap:16px">
          ${wxIcon(sky.icon, 64)}
          <div style="flex-grow:1;min-width:0">
            <div class="display" style="font-size:32px;font-weight:500">${isToday ? 'Today' : esc(longDay(date))}</div>
            <div style="font-size:19px;color:var(--ink-2)">${esc(sky.label)} · High ${deg(d.hi)} · Low ${deg(d.lo)}</div>
          </div>
          <button data-close class="pill f-x">Close</button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px">
          ${fact('Chance of rain', `${d.rain || 0}%`, rainAmt && !snowAmt ? `about ${rainAmt}` : '')}
          ${snowAmt ? fact('Snow', esc(snowAmt), '') : fact('Rain amount', rainAmt ? esc(rainAmt) : 'None', '')}
          ${fact('Wind', d.wind != null ? `up to ${d.wind} ${f.windUnit || 'mph'}` : '--', [windFrom(d.dir), d.gusts != null && d.wind != null && d.gusts >= d.wind + 10 ? `gusts ${d.gusts}` : ''].filter(Boolean).join(' · '))}
          ${fact('Sun strength', d.uv != null ? esc(uvWord(d.uv)) : '--', d.uv != null ? `UV ${Math.round(d.uv)}` : '')}
          ${fact('Sunrise', timeOr(d.sunrise), '')}
          ${fact('Sunset', timeOr(d.sunset), '')}
        </div>
        ${hours.length ? `
          <div class="muted" style="font-size:16px">Hour by hour${hours.length > 13 ? ' · slide sideways for more' : ''}</div>
          <div data-f-dayhours class="f-hours" style="display:block;background:#F6F7F9;border-radius:18px"><div class="f-hours-row">${hoursHtml(hours, f, { markNow: isToday })}</div></div>`
    : '<div class="muted" style="font-size:18px">Hour by hour isn’t known for this day yet.</div>'}
      </div>`;
    detail.style.display = 'flex';
    // Start the strip a little before "now" (after layout has settled).
    if (isToday) {
      setTimeout(() => {
        const strip = detail.querySelector('[data-f-dayhours]');
        const now = detail.querySelector('[data-f-now]');
        if (strip && now) strip.scrollLeft = Math.max(0, now.offsetLeft - strip.offsetLeft - 180);
      }, 0);
    }
  }

  function showAlerts(info) {
    alertInfo = info;
    const now = Date.now();
    alerts = (info.list || []).filter((a) => !a.until || a.until > now); // a warning that has ended goes away
    const box = $('[data-f-alert]');
    $('[data-f-page]').classList.toggle('f-tight', alerts.length > 0);
    showUpdated();
    if (!alerts.length) { box.style.display = 'none'; box.innerHTML = ''; if (detail.querySelector('[data-f-alerts-open]')) closeDetail(); return; }
    const a = alerts[0];
    box.style.display = 'flex';
    box.style.background = alertColor(a);
    box.innerHTML = `
      <div style="font-size:22px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">⚠ ${esc(a.event)} <span style="font-weight:500;opacity:.92">${esc(whenText(a))}</span>${alerts.length > 1 ? `<span style="font-weight:500;opacity:.85"> · and ${alerts.length - 1} more</span>` : ''}</div>
      <div style="display:flex;align-items:flex-end;gap:16px">
        <div style="flex-grow:1;min-width:0;font-size:17px;line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(a.what || kindText(a))}</div>
        <div style="flex:none;font-size:16px;font-weight:600;text-decoration:underline">Tap for details</div>
      </div>`;
  }

  // Top right: when this forecast is from, honestly, and whether anyone is watching for warnings.
  function showUpdated(offline) {
    const upd = $('[data-f-updated]');
    const btn = $('[data-f-retry]');
    const lines = [];
    const off = offline || (last && last.stale);
    if (last) {
      if (off) {
        lines.push('<span style="color:#B5701A;font-weight:600">No internet right now</span>');
        lines.push(`Forecast from ${esc(ageText(last.at))}`);
      } else {
        lines.push(`Updated ${esc(clock(last.at))}`);
      }
    } else if (offline) {
      lines.push('<span style="color:#B5701A;font-weight:600">No internet right now</span>');
    }
    if (last && !off && alertInfo && alertInfo.ok && alertInfo.covered && !alerts.length) lines.push('No weather warnings');
    upd.innerHTML = lines.join('<br>');
    btn.style.display = off ? '' : 'none';
    btn.disabled = loading;
    btn.textContent = loading ? 'Checking…' : 'Try again';
  }

  function factSet(k, v, s, l) {
    $(`[data-f-v-${k}]`).textContent = v;
    $(`[data-f-s-${k}]`).textContent = s || '';
    if (l) $(`[data-f-l-${k}]`).textContent = l;
  }

  function render(saved) {
    const f = freshen(saved);
    const now = describe(f.code);
    $('[data-f-top]').classList.remove('skeleton');
    $('[data-f-days]').classList.remove('skeleton');
    const night = f.isDay === false;
    const ink = heroInk(night);
    $('[data-f-scene]').innerHTML = scene(now.icon, night);
    $('[data-f-text]').style.color = ink.main;
    $('[data-f-outlook]').style.color = ink.sub;
    $('[data-f-range]').style.color = ink.sub;
    $('[data-f-more]').style.display = '';
    $('[data-f-temp]').textContent = deg(f.temp);
    $('[data-f-label]').textContent = f.estimated ? `${now.label} · expected about now`
      : f.feels != null ? `${now.label} · feels like ${f.feels}°` : now.label;
    $('[data-f-range]').textContent = rangeLine(f);
    $('[data-f-outlook]').textContent = outlook(f);
    const tip = advice(f) || 'Take a look out of the window before you go.';
    $('[data-f-advice]').textContent = tip;
    $('[data-f-wear]').innerHTML = wearArt(wearFor(tip, f));

    // Once the sun has set, today's sunrise is no use: show tomorrow's sun instead.
    const today = isoDay();
    const tom = new Date(); tom.setDate(tom.getDate() + 1);
    const next = (f.days || []).find((x) => x.date === isoDay(tom));
    const afterDark = f.sunset && Date.now() > new Date(f.sunset).getTime() && next;
    const sun = afterDark ? { sunrise: next.sunrise, sunset: next.sunset, uv: next.uv } : f;
    factSet('sunrise', timeOr(sun.sunrise), '', afterDark ? 'Sunrise tomorrow' : 'Sunrise');
    factSet('sunset', timeOr(sun.sunset), '', afterDark ? 'Sunset tomorrow' : 'Sunset');
    const unit = f.windUnit || 'mph';
    if (f.windSpeed == null) factSet('wind', '--');
    else if (f.windSpeed < 2) factSet('wind', 'Calm', f.gusts >= 15 ? `gusts ${f.gusts} ${unit}` : '');
    else factSet('wind', `${f.windSpeed} ${unit}`, f.gusts != null && f.gusts >= f.windSpeed + 10 ? `gusts ${f.gusts} · ${windFrom(f.windDir).replace('from the ', 'from ')}` : windFrom(f.windDir));
    factSet('humid', f.humidity != null ? `${f.humidity}%` : '--', f.humidity == null ? '' : f.humidity >= 80 ? 'damp' : f.humidity <= 30 ? 'dry air' : '');
    factSet('uv', sun.uv != null ? uvWord(sun.uv) : '--', sun.uv != null ? `UV ${Math.round(sun.uv)} at most${afterDark ? '' : ' today'}` : '', afterDark ? 'Sun tomorrow' : 'Sun strength');
    const n = f.next12 || { chance: 0, wet: 0, snow: 0 };
    if (n.snow > 0) factSet('rain', amountText(n.snow, f.snowUnit || 'in') || 'Some', `snow · ${n.chance}% chance`, 'Snow, next 12 hrs');
    else factSet('rain', n.chance >= 10 ? `${n.chance}% chance` : 'None expected', amountText(n.wet, f.rainUnit || 'in') ? `about ${amountText(n.wet, f.rainUnit || 'in')}` : '', 'Rain, next 12 hrs');

    // The next 24 hours, slid sideways for more.
    const hours = (f.hours || []).filter((h) => new Date(h.time).getTime() > Date.now() - 3600000).slice(0, 24);
    const hrs = $('[data-f-hours]');
    if (hours.length) {
      hrs.style.display = 'block';
      const keep = shownHour === new Date().getHours() ? hrs.scrollLeft : 0;
      $('[data-f-hours-row]').innerHTML = hoursHtml(hours, f, { firstIsNow: true });
      hrs.scrollLeft = keep;
    } else hrs.style.display = 'none';
    shownHour = new Date().getHours();

    // The rest of the week, starting tomorrow (a saved copy may start on an earlier day).
    const days = (f.days || []).filter((d) => d.date > today).slice(0, DAYS);
    const his = days.map((d) => d.hi).filter((v) => v != null);
    const los = days.map((d) => d.lo).filter((v) => v != null);
    const wkLo = Math.min.apply(null, los.length ? los : [0]);
    const wkHi = Math.max.apply(null, his.length ? his : [1]);
    $('[data-f-days]').innerHTML = days.map((d, i) => dayCard({
      date: d.date,
      day: i === 0 && (f.days || []).some((x) => x.date === today) ? 'Tomorrow' : dayName(d.date),
      weekend: weekend(d.date),
      sky: describe(d.code).label,
      icon: describe(d.code).icon,
      hi: deg(d.hi),
      lo: deg(d.lo),
      rain: d.rain,
      bar: d.hi != null && d.lo != null && wkHi > wkLo ? [(d.lo - wkLo) / (wkHi - wkLo), (d.hi - d.lo) / (wkHi - wkLo)] : null,
    })).join('') || '<div class="muted" style="font-size:18px;grid-column:1/-1;text-align:center;align-self:center">The rest of the week will show here once the forecast comes in.</div>';
    showUpdated();
  }

  function showWaiting(label, sub) {
    $('[data-f-temp]').textContent = '--°';
    $('[data-f-label]').textContent = label;
    $('[data-f-range]').textContent = '';
    $('[data-f-outlook]').textContent = sub;
  }

  async function load(opts = {}) {
    const me = ++gen;
    clearTimeout(retry);
    loading = true;
    showUpdated();
    try {
      const loc = await getLocation();
      if (!el.isConnected || me !== gen) return;
      $('[data-f-title]').textContent = loc.town ? `Weather in ${loc.town}` : 'Weather';
      // Watches and warnings from the National Weather Service, most serious first.
      getAlertsInfo(loc).then((info) => { if (el.isConnected && me === gen) showAlerts(info); }).catch(() => {});
      const f = await getForecast(loc, opts);
      if (!el.isConnected || me !== gen) return;
      last = f;
      loading = false;
      render(f);
      if (f.stale) retry = setTimeout(load, 2 * 60 * 1000); // try again soon, not in 15 minutes
    } catch (err) {
      console.error(err);
      if (!el.isConnected || me !== gen) return;
      loading = false;
      // Keep showing what's already on screen; only explain when there's nothing.
      if (!last) {
        showWaiting('Can’t get the weather right now', 'Check the Wi-Fi. Trying again in a minute…');
        $('[data-f-advice]').textContent = 'The forecast will appear here by itself.';
      }
      showUpdated(true);
      $('[data-f-retry]').style.display = '';
      retry = setTimeout(load, 60 * 1000);
    } finally {
      if (me === gen) loading = false;
    }
  }

  // The owner picked another town in Settings: start over for it at once, never
  // showing the old town's weather under the new name.
  onPlace = () => {
    last = null;
    alerts = [];
    alertInfo = null;
    closeDetail();
    showAlerts({ list: [], covered: null, ok: false });
    $('[data-f-title]').textContent = 'Weather';
    $('[data-f-top]').classList.add('skeleton');
    $('[data-f-days]').classList.add('skeleton');
    $('[data-f-hours]').style.display = 'none';
    $('[data-f-more]').style.display = 'none';
    showWaiting('Loading weather…', 'Getting the forecast for the new town');
    $('[data-f-advice]').innerHTML = '&nbsp;';
    load();
  };
  window.addEventListener('place-changed', onPlace);

  // Every half minute: warnings that have ended go, "how old" stays true, and when the
  // hour turns the strip moves on (even with the internet off).
  ticker = setInterval(() => {
    if (alertInfo && alerts.some((a) => a.until && a.until <= Date.now())) showAlerts(alertInfo);
    if (last && new Date().getHours() !== shownHour) render(last);
    else showUpdated();
  }, 30 * 1000);

  load();
  timer = setInterval(load, 15 * 60 * 1000);
}

function dayCard(d) {
  return `
    <div class="card f-day"${d.date ? ` data-f-date="${d.date}" role="button"` : ''} style="background:${d.icon ? wxTint(d.icon) : 'var(--card)'}">
      <div class="f-day-name" style="${d.weekend ? `background:#FBE4DA;color:${settings.accent}` : ''}">${d.day}</div>
      <div style="display:flex;flex-direction:column;align-items:center;gap:2px">
        ${d.icon ? wxIcon(d.icon, 50) : '<div style="height:44px"></div>'}
        <div class="f-day-sky" style="font-size:16px;text-align:center;color:#4A5363;white-space:nowrap">${d.sky}${d.rain >= 20 ? ` · <span style="color:#2D5BA8;font-weight:600">${d.rain}%</span>` : ''}</div>
      </div>
      <div class="display f-day-hi">${d.hi}</div>
      ${d.bar ? (() => { const w = Math.max(6, d.bar[1] * 100); const l = Math.min(d.bar[0] * 100, 100 - w); return `<div class="f-bar"><span style="left:${l.toFixed(1)}%;width:${w.toFixed(1)}%"></span></div>`; })() : '<div style="height:8px"></div>'}
      <div class="muted" style="font-size:17px">Low ${d.lo}</div>
    </div>`;
}

export function unmount() {
  clearInterval(timer);
  clearTimeout(retry);
  clearInterval(ticker);
  if (onPlace) window.removeEventListener('place-changed', onPlace);
  onPlace = null;
}
