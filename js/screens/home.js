// Family · Home dashboard (Main.dc.html in the design)
import { clockTime, clockAmPm, timeText, hourText } from '../services/display.js';
import { settings } from '../config.js';
import { getLocation, manualPlace, knownPlace } from '../services/location.js';
import { getWeather, describe } from '../services/weather.js';
import { wxIcon, homeLandscape, framesArt, foodArt, foodFor, eventIcon, C } from '../art.js';
import { isTablet, getPhotos, onPhotosChanged } from '../services/tablet-photos.js';
import { upcoming, refreshCalendars } from '../services/calendar-data.js';
import { fmtMinutes, loadIndex } from '../services/recipe-data.js';
import { tonight, getPlan, markFor, plannedFor, dayKey } from '../services/meal-plan.js';
import { loadMessages, onMessagesChanged } from '../services/messages-data.js';
import { getAlerts, untilText, alertColor } from '../services/weather-alerts.js';

let timer, photoTimer, refreshTimer, offPhotos, onCalendar, offNotes, offFonts, onWake, onOnline;

const REFRESH_MS = 15 * 60 * 1000; // weather, "Coming up" and dinner stay fresh all day
const COMING_MS = 5 * 60 * 1000;   // "Coming up" is looked at again this often (redrawn only if it changed)

// What the dinner card showed last time, so coming back to Home shows it at once
// instead of "Pick a recipe" for a moment. { at: 'day|evening', info }
let lastDinner = null;

// "3 PM" or "3:30 PM" (or "15:00" / "15:30" with the 24-hour clock)
const fmtClock = (d) => (d.getMinutes() ? timeText(d) : hourText(d.getHours()));

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// The last weather this screen downloaded today (for when the Wi-Fi is down), or null.
// Only in the degrees the family chose, and only for the place the weather is for now.
function savedWeather() {
  try {
    const w = JSON.parse(localStorage.getItem('weather.v1') || 'null');
    if (!w || !w.at || new Date(w.at).toDateString() !== new Date().toDateString()) return null;
    if (w.units && w.units !== settings.units) return null;
    const place = manualPlace() || knownPlace();
    if (place && typeof place.lat === 'number' && typeof w.lat === 'number' && Math.abs(place.lat - w.lat) > 0.05) return null;
    w.hours = (w.hours || []).filter((h) => new Date(h.time).getTime() > Date.now());
    return w;
  } catch (e) { return null; }
}

// Is it dark out? Today's sunrise/sunset from the Weather screen's saved forecast
// when there is one, otherwise a rough guess from the clock.
function isNight() {
  const now = Date.now();
  try {
    const f = JSON.parse(localStorage.getItem('forecast.v2') || 'null');
    if (f && f.sunrise && f.sunset && new Date(f.sunset).toDateString() === new Date().toDateString()) {
      return now < new Date(f.sunrise).getTime() || now > new Date(f.sunset).getTime();
    }
  } catch (e) { /* no saved forecast */ }
  const h = new Date().getHours();
  return h < 6 || h >= 18;
}

// Rain, snow or a storm in the next few hours (or the rain stopping), in a few words:
// "Rain around 4 PM", "Snow around 11 PM", "Dry by 6 PM". '' when nothing changes.
const WET = { rain: 'Rain', snow: 'Snow', storm: 'Storms' };
function rainSoon(w) {
  const wet = (code) => WET[describe(code).icon] || '';
  const hours = (w.hours || []).filter((h) => new Date(h.time).getTime() > Date.now());
  if (!wet(w.code)) {
    const h = hours.find((x) => wet(x.code));
    return h ? `${wet(h.code)} around ${hourText(new Date(h.time).getHours())}` : '';
  }
  const dry = hours.find((x) => !wet(x.code));
  return dry ? `Dry by ${hourText(new Date(dry.time).getHours())}` : '';
}

// Tomorrow from the daily forecast weather.js keeps: { icon, high, low, label } or null.
function tomorrowWeather(w) {
  const d = w.daily;
  if (!d || !d.time) return null;
  const now = new Date();
  const key = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  const i = d.time.indexOf(key);
  if (i < 0 || !d.temperature_2m_max || d.temperature_2m_max[i] == null) return null;
  const desc = describe(d.weather_code ? d.weather_code[i] : null);
  return { icon: desc.icon, label: desc.label, high: Math.round(d.temperature_2m_max[i]), low: Math.round(d.temperature_2m_min[i]) };
}

// Picture on the dinner card: a steaming bowl, or the matching food scene when the
// dish's name says it's really a breakfast, a sandwich or a bake.
function dinnerArt(title) {
  const kind = foodFor('dinner', title);
  const soft = settings.accent.toUpperCase() === C.accent ? C.accentSoft : 'rgba(255,255,255,.12)';
  if (kind === 'dinner') return `<div class="h-dish-art" style="width:150px;height:150px;right:-30px;bottom:-30px">${foodArt.bowl(soft)}</div>`;
  return `<div class="h-dish-art" style="width:190px;height:104px;right:-28px;bottom:-6px">${foodArt[kind](soft, 'rgba(0,0,0,.16)')}</div>`;
}

// What the dinner card should say right now:
//   planned  tonight's dinner from the week plan
//   tomorrow in the evening (from 8 PM), tomorrow's planned dinner, so it can be thawed or prepared
//   out / leftovers  the week plan says so for tonight (no recipe idea pushed on top)
//   idea     the daily idea when nothing is planned
const evening = () => new Date().getHours() >= 20;
const dinnerSlot = () => `${new Date().toDateString()}|${evening() ? 'evening' : 'day'}`;
async function dinnerInfo() {
  const now = new Date();
  if (evening()) {
    const ids = plannedFor(dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)), 'dinner');
    if (ids.length) {
      const ix = await loadIndex();
      const e = ids.map((id) => ix.byId[id]).filter(Boolean)[0];
      if (e) return { kind: 'tomorrow', id: e.id, t: e.t, m: e.m };
    }
  }
  const t = await tonight();
  if (t && t.planned) return { kind: 'planned', id: t.entry.id, t: t.entry.t, m: t.entry.m };
  const mark = markFor(getPlan(), dayKey(now), 'dinner');
  if (mark === 'out' || mark === 'leftovers') return { kind: mark };
  return t ? { kind: 'idea', id: t.entry.id, t: t.entry.t, m: t.entry.m } : null;
}

// "Today 3 PM", "Now", "Tomorrow 9 AM", "Saturday", "8 days". `short` gives the weekday as
// "Sat" (and "Tomorrow" without the time), for when a long name needs the room (see fitComing).
function whenText(e, short) {
  const d = e.date instanceof Date ? e.date : new Date(e.date);
  const timed = d.getHours() || d.getMinutes();
  if (e.days === 0) {
    if (timed && d.getTime() <= Date.now()) return 'Now'; // under way (finished ones are left out)
    return timed ? `Today ${fmtClock(d)}` : 'Today';
  }
  if (e.days === 1) return timed && !short ? `Tomorrow ${fmtClock(d)}` : 'Tomorrow';
  if (e.days < 7) return d.toLocaleDateString('en-US', { weekday: short ? 'short' : 'long' });
  return `${e.days} days`;
}

// "Coming up" rows: next three things from the calendar, birthdays and holidays.
function comingUpRows(list) {
  if (!list.length) return '<div class="muted" style="font-size:18px">Nothing coming up</div>';
  return list.map((e) => `
            <div style="display:flex;align-items:center;gap:10px;font-size:18px">
              ${eventIcon(e.name)}
              <span data-name style="flex-grow:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(e.name)}</span>
              <span data-when data-short="${esc(whenText(e, true))}" style="font-weight:600;flex:none">${esc(whenText(e))}</span>
            </div>`).join('');
}

// ---- The greeting ----
// On a birthday or a holiday it says so ("Happy birthday, Ava!", "Happy Thanksgiving,
// Family"); otherwise good morning / afternoon / evening.
const HOLIDAY_WORDS = {
  "new year's": 'Happy New Year', "valentine's": 'Happy Valentine’s Day', "st patrick's": 'Happy St. Patrick’s Day',
  easter: 'Happy Easter', "mother's": 'Happy Mother’s Day', "father's": 'Happy Father’s Day',
  independence: 'Happy Fourth of July', halloween: 'Happy Halloween', thanksgiving: 'Happy Thanksgiving',
  christmas: 'Merry Christmas', "new year's eve": 'Happy New Year’s Eve',
};
const holidayKey = (s) => String(s).toLowerCase().replace(/[’`]/g, "'").replace(/\./g, '').replace(/\s+/g, ' ').trim()
  .replace(/ (day|sunday)$/, '');
// "Ava’s birthday" / "Alex birthday" -> "Ava" / "Alex"; anything else -> ''
const birthdayName = (s) => { const m = /^([^’'\d]+?)(?:[’']s)?\s+(?:birthday|bday)$/i.exec(String(s).trim()); return m ? m[1].trim() : ''; };

function greetingFor(list) {
  const today = list.filter((e) => e.days === 0);
  const birthdays = today.filter((e) => e.kind === 'birthday');
  if (birthdays.length) {
    const names = birthdays.map((e) => birthdayName(e.name)).filter(Boolean);
    if (names.length) return { text: `Happy birthday, ${names.slice(0, 2).join(' and ')}!`, special: true };
    return { text: `${birthdays[0].name} today`, special: true };
  }
  for (let i = 0; i < today.length; i++) {
    if (/observed/i.test(today[i].name)) continue;
    const words = HOLIDAY_WORDS[holidayKey(today[i].name)];
    if (words) return { text: `${words}, ${settings.familyName}`, special: true };
  }
  const h = new Date().getHours();
  return { text: `${h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'}, ${settings.familyName}`, special: false };
}

function clockParts() {
  const now = new Date();
  return {
    time: clockTime(now),
    ampm: clockAmPm(now),
    date: now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
  };
}

export function mount(el) {
  const c = clockParts();
  let coming = upcoming(3);
  let greet = greetingFor(coming);

  el.innerHTML = `
  <style>
    .h-dish-art{position:absolute;pointer-events:none}
    .h-dish-art svg{width:100%;height:100%}
    .h-pill{min-height:52px;padding:0 22px;font-size:18px;background:var(--card);color:var(--ink);gap:8px}
  </style>
  <div style="height:100%;padding:40px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px">
    <div style="display:flex;flex-direction:column;gap:24px;min-width:0">
      <div style="display:flex;flex-direction:column;gap:4px;padding:8px 8px 0">
        <div style="display:flex;align-items:center;gap:14px;font-size:22px;font-weight:500;min-width:0">
          <span data-date class="muted" style="flex:none">${c.date}</span>
          <a href="#/messages" data-notes style="display:none;color:${settings.accent};font-weight:600;padding:13px 8px;margin:-13px -8px;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"></a>
        </div>
        <div class="display" style="font-weight:300;font-size:168px;line-height:1;letter-spacing:-6px">
          <span data-time>${c.time}</span><span data-ampm class="muted" style="font-size:40px;letter-spacing:0;margin-left:12px;font-weight:500${c.ampm ? '' : ';display:none'}">${c.ampm}</span>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:8px">
          <div data-hello class="display" style="font-size:30px;font-weight:500;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis${greet.special ? `;color:${settings.accent}` : ''}">${esc(greet.text)}</div>
          <div style="display:flex;gap:10px;flex:none">
          <a href="#/timers" class="pill h-pill">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M10 2h4"/></svg>
            Timers
          </a>
          <a href="#/launcher" class="pill h-pill">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></svg>
            Menu
          </a>
          </div>
        </div>
      </div>

      <a href="#/forecast" data-weather class="card skeleton" style="flex-grow:1;min-height:0;padding:0;display:flex;flex-direction:column;overflow:hidden">
        <div data-w-alert style="display:none;margin:20px 20px 0;border-radius:14px;padding:10px 16px;color:#fff;font-size:17px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"></div>
        <div style="display:flex;align-items:center;gap:20px;padding:26px 28px 0">
          <span data-w-icon style="display:flex;flex:none">${wxIcon('cloud', 80)}</span>
          <div data-w-temp class="display" style="font-size:80px;font-weight:500;line-height:1">--°</div>
          <div style="display:flex;flex-direction:column;gap:4px;margin-left:8px;min-width:0">
            <div data-w-label style="font-size:22px;font-weight:600">Loading weather…</div>
            <div data-w-sub class="muted" style="font-size:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Finding your location</div>
            <div data-w-note class="muted" style="display:none;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"></div>
          </div>
        </div>
        <div data-w-hours style="display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;padding:18px 28px 0;min-height:80px"></div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;padding:10px 28px 0;min-height:44px;font-size:18px">
          <span data-w-soon style="font-weight:600;color:${settings.accent};min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"></span>
          <span data-w-tom style="display:none;align-items:center;gap:8px;flex:none"></span>
        </div>
        <div data-w-land style="margin-top:auto;flex:none">${homeLandscape(isNight())}</div>
      </a>
    </div>

    <div style="display:grid;grid-template-rows:minmax(0,1fr) 168px;gap:24px;min-width:0">
      <div data-photo-card style="border-radius:var(--radius);background:#F6EFE7;display:flex;align-items:flex-end;justify-content:space-between;padding:24px;position:relative;overflow:hidden">
        <div data-photo-bg style="position:absolute;top:0;right:0;bottom:0;left:0;background-position:center;background-size:cover;transition:opacity .8s"></div>
        <div data-photo-empty style="position:absolute;top:0;right:0;bottom:0;left:0;display:flex;flex-direction:column;gap:14px;align-items:center;justify-content:center;font-size:22px;color:#4A5363;text-align:center;padding:32px">
          ${framesArt()}
          <div style="margin-top:4px">Family photos will show here</div>
          <a href="#/addphotos" class="pill" style="background:var(--ink);color:#fff;min-height:52px;padding:0 24px;font-size:18px">Add photos from a phone</a>
        </div>
        <div data-photo-label style="position:relative;background:rgba(255,255,255,.92);border-radius:999px;padding:10px 18px;font-size:16px;font-weight:500;max-width:60%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Photo frame</div>
        <a data-photo-full href="#/photos" class="pill" style="position:relative;background:var(--ink);color:#fff;margin-left:auto;min-height:52px;padding:0 24px;font-size:18px">Full screen</a>
      </div>

      <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px;min-height:0">
        <a data-dinner href="#/recipes" style="background:${settings.accent};color:#fff;border-radius:var(--radius);padding:22px 24px;display:flex;flex-direction:column;gap:6px;position:relative;overflow:hidden;min-width:0">
          <span data-d-art>${dinnerArt('')}</span>
          <div data-d-eyebrow class="eyebrow" style="position:relative">Tonight's dinner idea</div>
          <div data-d-title class="display" style="position:relative;max-width:150px;font-size:26px;font-weight:500;line-height:1.15;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">Pick a recipe</div>
          <div data-d-sub style="position:relative;max-width:150px;font-size:15px;color:#FBE3D8;margin-top:auto">Tap to browse recipes</div>
        </a>
        <a href="#/calendar" class="card" style="padding:22px 24px;display:flex;flex-direction:column;gap:10px;min-width:0;overflow:hidden">
          <div class="eyebrow muted">Coming up</div>
          <div data-coming style="display:flex;flex-direction:column;gap:10px">${comingUpRows(coming)}</div>
        </a>
      </div>
    </div>
  </div>`;

  const $ = (s) => el.querySelector(s);

  // "New note from Mom" (or "3 new notes") next to the date, until someone opens the board.
  const showNotes = () => {
    if (!el.isConnected) return;
    const unread = loadMessages().filter((m) => !m.seen);
    const n = unread.length;
    const a = $('[data-notes]');
    a.style.display = n ? '' : 'none';
    a.textContent = n === 1 ? (unread[0].who ? `· New note from ${unread[0].who}` : '· 1 new note') : `· ${n} new notes`;
  };
  showNotes();
  offNotes = onMessagesChanged(showNotes);

  // Dinner card: what's planned tonight (or tomorrow, late in the evening), "Eating out" or
  // "Leftovers" when the week plan says so, else the daily idea.
  let dinnerShown = '';
  const showDinner = (info) => {
    if (!info || !el.isConnected) return;
    const sig = JSON.stringify(info);
    if (sig === dinnerShown) return; // same as on screen: nothing to redraw
    dinnerShown = sig;
    const id = info.id ? encodeURIComponent(info.id) : '';
    const set = (href, eyebrow, title, sub, art) => {
      $('[data-dinner]').setAttribute('href', href);
      $('[data-d-eyebrow]').textContent = eyebrow;
      $('[data-d-title]').textContent = title;
      $('[data-d-sub]').textContent = sub;
      $('[data-d-art]').innerHTML = dinnerArt(art);
    };
    if (info.kind === 'planned') set(`#/recipe/${id}`, "Tonight's dinner", info.t, `${fmtMinutes(info.m)} · Tap to cook`, info.t);
    else if (info.kind === 'tomorrow') set(`#/dish/${id}`, "Tomorrow's dinner", info.t, `${fmtMinutes(info.m)} · Tap to see it`, info.t);
    else if (info.kind === 'out') set('#/plan', "Tonight's dinner", 'Eating out', 'Tap for the week plan', '');
    else if (info.kind === 'leftovers') set('#/plan', "Tonight's dinner", 'Leftovers', 'Tap for the week plan', '');
    else set(`#/dish/${id}`, "Tonight's dinner idea", info.t, `${fmtMinutes(info.m)} · Tap to see it`, info.t);
    soon(fitDinner);
  };
  const loadDinner = () => {
    const slot = dinnerSlot();
    return dinnerInfo().then((info) => {
      if (!info) return;
      lastDinner = { at: slot, info };
      showDinner(info);
    }).catch(() => {});
  };

  // Long dish names: a smaller size on three lines rather than cut off.
  function fitDinner() {
    const d = $('[data-d-title]');
    d.style.fontSize = '26px';
    d.style.webkitLineClamp = '2';
    d.style.maxWidth = '150px';
    if (d.scrollHeight > d.clientHeight + 2) {
      d.style.fontSize = '21px';
      d.style.webkitLineClamp = '3';
      d.style.maxWidth = '160px';
    }
  }

  // "Thanksgiving" beside "Thursday" does not fit the card: a name that would be cut
  // off gets the short day ("Thu") instead.
  // (All the measuring first, then the changes: changing one row between two measurements
  // made the tablet lay the whole card out again each time.)
  const fitComing = () => {
    const cut = [...el.querySelectorAll('[data-coming] [data-when]')].filter((when) => {
      const name = when.parentElement.querySelector('[data-name]');
      return name && name.scrollWidth > name.clientWidth;
    });
    cut.forEach((when) => { when.textContent = when.dataset.short; });
  };
  // Measuring has to wait a beat. On the tablets' older browser the gaps between things
  // are put in by compat.js right after the screen is built; measured before that there
  // is more room than there will be, and the name was cut off after all (seen on a real
  // tablet). "Soon" is still before anything is drawn.
  const soon = (fit) => Promise.resolve().then(() => { if (el.isConnected) fit(); });
  soon(fitComing);

  // The same dinner as last time is put up at once (it is checked again just after).
  if (lastDinner && lastDinner.at === dinnerSlot()) showDinner(lastDinner.info);
  loadDinner();

  // "Good afternoon, Family" stays on one line: shrink the text a little if it's too long.
  // Measured with the cut-off switched off and by where the buttons end up: with it on,
  // the tablet's older browser says the text fits while it is showing "Good afternoon, Fam...".
  const fitGreeting = () => {
    const h = $('[data-hello]');
    const row = h.parentElement;
    h.style.overflow = 'visible';
    h.style.flexShrink = '0';
    for (let size = 30; size >= 20; size -= 2) {
      h.style.fontSize = `${size}px`;
      if (row.lastElementChild.getBoundingClientRect().right <= row.getBoundingClientRect().right + 0.5) break;
    }
    h.style.overflow = 'hidden';
    h.style.flexShrink = '';
  };
  soon(fitGreeting);
  const showGreeting = () => {
    const g = greetingFor(coming);
    const h = $('[data-hello]');
    if (h.textContent === g.text) return;
    h.textContent = g.text;
    h.style.color = g.special ? settings.accent : '';
    fitGreeting();
  };

  // "Coming up" is worked out again now and then (a finished appointment drops off, one
  // that has started says "Now"), but only drawn again when it really changed.
  let comingHtml = comingUpRows(coming);
  const renderComing = (force) => {
    if (!el.isConnected) return;
    coming = upcoming(3);
    const html = comingUpRows(coming);
    showGreeting();
    if (html === comingHtml && force !== true) return;
    comingHtml = html;
    $('[data-coming]').innerHTML = html;
    soon(fitComing);
  };
  // Calendar links download in the background; redraw "Coming up" when they arrive.
  onCalendar = () => renderComing();
  window.addEventListener('calendar-updated', onCalendar);
  refreshCalendars();

  // Photo card: this display's newest photos, changing every 30 seconds.
  // The next picture is loaded first, so the card never flashes grey mid-change; a photo
  // that won't load (removed meanwhile) is skipped instead of leaving the card blank.
  let photoIndex = 0;
  let photoCount = 0;
  const showEmpty = (empty) => {
    $('[data-photo-empty]').style.display = empty ? 'flex' : 'none';
    $('[data-photo-label]').style.display = empty ? 'none' : '';
  };
  function renderPhoto(tries = 0) {
    const list = getPhotos().filter((p) => !p.video).slice(0, 20); // the card shows stills only
    const bg = $('[data-photo-bg]');
    photoCount = list.length;
    showEmpty(!list.length);
    $('[data-photo-full]').style.display = list.length ? '' : 'none'; // nothing to show full screen yet
    $('[data-photo-card]').style.cursor = list.length ? 'pointer' : '';
    if (!list.length) { bg.style.backgroundImage = ''; return; }
    const p = list[photoIndex % list.length];
    const show = () => {
      if (!el.isConnected) return;
      bg.style.backgroundImage = `url('${encodeURI(p.src)}')`;
      $('[data-photo-label]').textContent = p.line ? `${p.title} · ${p.line}` : p.title;
    };
    const img = new Image();
    img.onload = show;
    img.onerror = () => {
      if (!el.isConnected) return;
      if (tries + 1 < list.length) { photoIndex++; renderPhoto(tries + 1); } else show();
    };
    img.src = p.src;
  }
  // The whole photo is a way into the photo frame, not just the small button.
  $('[data-photo-card]').addEventListener('click', (e) => {
    if (!photoCount || (e.target instanceof Element && e.target.closest('a'))) return;
    location.hash = '#/photos';
  });
  if (isTablet()) {
    renderPhoto();
    photoTimer = setInterval(() => { photoIndex++; renderPhoto(); }, 30000);
    offPhotos = onPhotosChanged(() => { photoIndex = 0; renderPhoto(); });
  } else {
    // Previewing in a normal browser: no album here (Full screen shows samples).
    showEmpty(true);
  }

  // Again once the real letters are in (they are wider than the stand-in font).
  // Seen on a real tablet: Home is drawn before its fonts have arrived, the fit was made
  // with the stand-in font, and "Thanksgivi..." stayed cut off until the next visit. So it
  // is fitted again every time a font finishes loading while Home is up.
  if (document.fonts && document.fonts.ready) {
    const refit = () => { if (el.isConnected) { fitGreeting(); renderComing(true); } };
    document.fonts.ready.then(refit);
    if (document.fonts.addEventListener) {
      document.fonts.addEventListener('loadingdone', refit);
      offFonts = () => document.fonts.removeEventListener('loadingdone', refit);
    }
  }

  // Clock: turns over exactly on the minute (not up to ten seconds late). At midnight
  // the day's cards move on too; at 8 PM the dinner card looks ahead to tomorrow.
  let day = new Date().toDateString();
  let hour = new Date().getHours();
  let comingAt = Date.now();
  const tick = () => {
    clearTimeout(timer);
    if (!el.isConnected) return;
    const n = clockParts();
    const ampm = $('[data-ampm]');
    $('[data-time]').textContent = n.time;
    ampm.textContent = n.ampm;
    ampm.style.display = n.ampm ? '' : 'none'; // 24-hour clock: no empty gap after the time
    $('[data-date]').textContent = n.date;
    const now = new Date();
    if (now.toDateString() !== day) {
      day = now.toDateString();
      renderComing(true);
      loadDinner();
      comingAt = Date.now();
    } else if (Date.now() - comingAt >= COMING_MS) {
      renderComing();
      comingAt = Date.now();
    } else showGreeting();
    if (now.getHours() !== hour) { hour = now.getHours(); loadDinner(); }
    timer = setTimeout(tick, 60000 - (Date.now() % 60000) + 30);
  };
  timer = setTimeout(tick, 60000 - (Date.now() % 60000) + 30);
  // The screen was off (timers sleep then): put the right time up the moment it's back.
  onWake = () => { if (!document.hidden) tick(); };
  document.addEventListener('visibilitychange', onWake);

  // Weather: location -> forecast. Fetched again every 15 minutes (the dashboard stays
  // up all day); when the Wi-Fi is down, today's last forecast is shown instead.
  let shown = false;
  let nightShown = isNight();
  function showWeather(w, loc, offline) {
    const d = describe(w.code);
    $('[data-weather]').classList.remove('skeleton');
    const night = isNight();
    $('[data-w-icon]').innerHTML = wxIcon(d.icon, 80, night);
    if (night !== nightShown) { nightShown = night; $('[data-w-land]').innerHTML = homeLandscape(night); }
    $('[data-w-temp]').textContent = `${w.temp}°`;
    $('[data-w-label]').textContent = d.label;
    $('[data-w-sub]').textContent = `H ${w.high}° · L ${w.low}°${loc && loc.town ? ` · ${loc.town}` : ''}`;
    const note = $('[data-w-note]');
    // Honest about old numbers: say from when, if the Wi-Fi is down or they are over an hour old.
    const old = offline || Date.now() - w.at > 60 * 60 * 1000;
    note.style.display = old ? '' : 'none';
    note.textContent = old ? `${offline ? 'No internet · ' : ''}as of ${timeText(new Date(w.at))}` : '';
    const hours = (w.hours || []).filter((h) => new Date(h.time).getTime() > Date.now());
    $('[data-w-hours]').innerHTML = hours.map((h) => `
        <div style="display:flex;flex-direction:column;align-items:center;gap:6px">
          <div class="muted" style="font-size:16px">${hourText(new Date(h.time).getHours())}</div>
          <div class="display" style="font-size:26px;font-weight:500">${h.temp}°</div>
        </div>`).join('');
    $('[data-w-soon]').textContent = rainSoon(w);
    const tom = tomorrowWeather(w);
    const tomBox = $('[data-w-tom]');
    tomBox.style.display = tom ? 'flex' : 'none';
    if (tom) {
      tomBox.innerHTML = `<span class="muted">Tomorrow</span><span style="display:flex">${wxIcon(tom.icon, 30)}</span>`
        + `<span style="font-weight:600">${tom.high}°</span><span class="muted">/ ${tom.low}°</span>`;
      tomBox.title = tom.label;
    }
    shown = true;
  }
  // Coming back to Home: the weather it already has goes up at once (no "Loading weather…").
  const early = savedWeather();
  if (early) showWeather(early, manualPlace() || knownPlace(), false);

  let loading = false;
  async function loadWeather() {
    if (loading) return;
    loading = true;
    let loc = null;
    try {
      loc = await getLocation();
      getAlerts(loc).then((list) => {
        if (!el.isConnected) return;
        const box = $('[data-w-alert]');
        box.style.display = list.length ? 'block' : 'none'; // a warning that ended goes away
        if (!list.length) return;
        box.style.background = alertColor(list[0]);
        box.textContent = `⚠ ${list[0].event} ${untilText(list[0].until)}`;
      }).catch(() => {});
      const w = await getWeather(loc);
      if (!el.isConnected) return;
      showWeather(w, loc, false);
    } catch (err) {
      console.error(err);
      if (!el.isConnected) return;
      const old = savedWeather();
      if (old) { showWeather(old, loc, true); return; }
      if (shown) return; // keep what's on screen
      $('[data-weather]').classList.remove('skeleton');
      $('[data-w-label]').textContent = 'No weather right now';
      $('[data-w-sub]').textContent = 'It comes back with the Wi-Fi';
    } finally {
      loading = false;
    }
  }
  loadWeather();
  // The Wi-Fi came back, or the owner chose another town: fresh weather now, not in 15 minutes.
  onOnline = () => { if (el.isConnected) { loadWeather(); refreshCalendars(); } };
  window.addEventListener('online', onOnline);
  window.addEventListener('place-changed', onOnline);
  refreshTimer = setInterval(() => {
    loadWeather();
    refreshCalendars(); // picks up new events from calendar links (redraws when they arrive)
  }, REFRESH_MS);
}

export function unmount() {
  clearTimeout(timer);
  clearInterval(photoTimer);
  clearInterval(refreshTimer);
  offPhotos?.();
  offNotes?.();
  offFonts?.();
  offFonts = null;
  window.removeEventListener('calendar-updated', onCalendar);
  if (onWake) document.removeEventListener('visibilitychange', onWake);
  if (onOnline) { window.removeEventListener('online', onOnline); window.removeEventListener('place-changed', onOnline); }
  onWake = onOnline = null;
}
