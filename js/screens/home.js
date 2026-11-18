// Family · Home dashboard (Main.dc.html in the design)
import { settings } from '../config.js';
import { getLocation } from '../services/location.js';
import { getWeather, describe } from '../services/weather.js';
import { icon } from '../icons.js';
import { isTablet, getPhotos, onPhotosChanged } from '../services/tablet-photos.js';
import { upcoming, refreshCalendars } from '../services/calendar-data.js';
import { fmtMinutes } from '../services/recipe-data.js';
import { tonight } from '../services/meal-plan.js';
import { unreadCount, onMessagesChanged } from '../services/messages-data.js';
import { getAlerts, untilText, alertColor } from '../services/weather-alerts.js';

let timer, photoTimer, refreshTimer, offPhotos, onCalendar, offNotes;

const REFRESH_MS = 15 * 60 * 1000; // weather, "Coming up" and dinner stay fresh all day

const fmtHour = (d) => d.toLocaleTimeString('en-US', { hour: 'numeric' });
// "3 PM" or "3:30 PM"
const fmtClock = (d) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: d.getMinutes() ? '2-digit' : undefined });

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// The last weather this tablet downloaded today (for when the Wi-Fi is down), or null.
function savedWeather() {
  try {
    const w = JSON.parse(localStorage.getItem('weather.v1') || 'null');
    if (!w || !w.at || new Date(w.at).toDateString() !== new Date().toDateString()) return null;
    w.hours = (w.hours || []).filter((h) => new Date(h.time).getTime() > Date.now());
    return w;
  } catch (e) { return null; }
}

// "Today 3 PM", "Tomorrow", "Saturday", "8 days"
function whenText(e) {
  const d = e.date instanceof Date ? e.date : new Date(e.date);
  const timed = d.getHours() || d.getMinutes();
  if (e.days === 0) return timed ? `Today ${fmtClock(d)}` : 'Today';
  if (e.days === 1) return 'Tomorrow';
  if (e.days < 7) return d.toLocaleDateString('en-US', { weekday: 'long' });
  return `${e.days} days`;
}

// "Coming up" rows: next three things from the calendar, birthdays and holidays.
function comingUpRows() {
  const list = upcoming(3);
  if (!list.length) return '<div class="muted" style="font-size:18px">Nothing coming up</div>';
  return list.map((e) => `
            <div style="display:flex;justify-content:space-between;gap:12px;font-size:18px">
              <span style="min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(e.name)}</span>
              <span style="font-weight:600;flex:none">${whenText(e)}</span>
            </div>`).join('');
}


function clockParts() {
  const now = new Date();
  const h = now.getHours();
  return {
    time: `${((h + 11) % 12) + 1}:${String(now.getMinutes()).padStart(2, '0')}`,
    ampm: h < 12 ? 'AM' : 'PM',
    date: now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
    greeting: h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening',
  };
}

export function mount(el) {
  const c = clockParts();

  el.innerHTML = `
  <div style="height:100%;padding:40px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px">
    <div style="display:flex;flex-direction:column;gap:24px;min-width:0">
      <div style="display:flex;flex-direction:column;gap:4px;padding:8px 8px 0">
        <div style="display:flex;align-items:center;gap:14px;font-size:22px;font-weight:500">
          <span data-date class="muted">${c.date}</span>
          <a href="#/messages" data-notes style="display:none;color:${settings.accent};font-weight:600;padding:9px 8px;margin:-9px -8px"></a>
        </div>
        <div class="display" style="font-weight:300;font-size:168px;line-height:1;letter-spacing:-6px">
          <span data-time>${c.time}</span><span data-ampm class="muted" style="font-size:40px;letter-spacing:0;margin-left:12px;font-weight:500">${c.ampm}</span>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:8px">
          <div data-hello class="display" style="font-size:30px;font-weight:500;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"><span data-greeting>${c.greeting}</span>, ${esc(settings.familyName)}</div>
          <div style="display:flex;gap:10px;flex:none">
          <a href="#/timers" class="pill" style="background:var(--card);color:var(--ink);gap:8px">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M10 2h4"/></svg>
            Timers
          </a>
          <a href="#/launcher" class="pill" style="background:var(--card);color:var(--ink);gap:8px">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></svg>
            All apps
          </a>
          </div>
        </div>
      </div>

      <a href="#/forecast" data-weather class="card skeleton" style="padding:28px;display:flex;flex-direction:column;gap:22px">
        <div data-w-alert style="display:none;margin:-8px -8px 0;border-radius:14px;padding:10px 16px;color:#fff;font-size:17px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"></div>
        <div style="display:flex;align-items:center;gap:20px">
          <span data-w-icon>${icon('cloud', 72, settings.accent)}</span>
          <div data-w-temp class="display" style="font-size:80px;font-weight:500;line-height:1">--°</div>
          <div style="display:flex;flex-direction:column;gap:4px;margin-left:8px;min-width:0">
            <div data-w-label style="font-size:22px;font-weight:600">Loading weather…</div>
            <div data-w-sub class="muted" style="font-size:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Finding your location</div>
            <div data-w-note class="muted" style="display:none;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"></div>
          </div>
        </div>
        <div data-w-hours style="display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;border-top:1px solid var(--line);padding-top:18px;min-height:82px"></div>
      </a>
    </div>

    <div style="display:flex;flex-direction:column;gap:24px;min-width:0">
      <div style="flex-grow:1;border-radius:var(--radius);background:#C9CFD6;display:flex;align-items:flex-end;justify-content:space-between;padding:24px;position:relative;overflow:hidden">
        <div data-photo-bg style="position:absolute;top:0;right:0;bottom:0;left:0;background-position:center;background-size:cover;transition:opacity .8s"></div>
        <div data-photo-empty style="position:absolute;top:0;right:0;bottom:0;left:0;display:flex;flex-direction:column;gap:16px;align-items:center;justify-content:center;font-size:20px;color:#3A4352;text-align:center;padding:40px">
          <div>Family photos will show here</div>
          <a href="#/addphotos" class="pill" style="background:var(--ink);color:#fff">Add photos from a phone</a>
        </div>
        <div data-photo-label style="position:relative;background:rgba(255,255,255,.92);border-radius:999px;padding:10px 18px;font-size:16px;font-weight:500;max-width:60%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Photo frame</div>
        <a data-photo-full href="#/photos" class="pill" style="position:relative;background:var(--ink);color:#fff;margin-left:auto">Full screen</a>
      </div>

      <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px">
        <a data-dinner href="#/recipes" style="background:${settings.accent};color:#fff;border-radius:var(--radius);padding:24px;display:flex;flex-direction:column;gap:8px">
          <div data-d-eyebrow class="eyebrow">Tonight's dinner idea</div>
          <div data-d-title class="display" style="font-size:28px;font-weight:500;line-height:1.15;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden">Pick a recipe</div>
          <div data-d-sub style="font-size:16px">Tap to browse recipes</div>
        </a>
        <a href="#/calendar" class="card" style="padding:24px;display:flex;flex-direction:column;gap:12px;min-width:0">
          <div class="eyebrow muted">Coming up</div>
          <div data-coming style="display:flex;flex-direction:column;gap:12px">${comingUpRows()}</div>
        </a>
      </div>
    </div>
  </div>`;

  const $ = (s) => el.querySelector(s);

  // "2 new notes" next to the date, until someone opens the message board.
  const showNotes = () => {
    if (!el.isConnected) return;
    const n = unreadCount();
    const a = $('[data-notes]');
    a.style.display = n ? '' : 'none';
    a.textContent = n === 1 ? '· 1 new note' : `· ${n} new notes`;
  };
  showNotes();
  offNotes = onMessagesChanged(showNotes);

  // Dinner card: what's planned tonight, else the daily idea.
  const loadDinner = () => tonight().then((t) => {
    if (!el.isConnected || !t) return;
    const id = encodeURIComponent(t.entry.id);
    $('[data-dinner]').setAttribute('href', t.planned ? `#/recipe/${id}` : `#/dish/${id}`);
    $('[data-d-eyebrow]').textContent = t.planned ? "Tonight's dinner" : "Tonight's dinner idea";
    $('[data-d-title]').textContent = t.entry.t;
    $('[data-d-sub]').textContent = `${fmtMinutes(t.entry.m)} · ${t.planned ? 'Tap to cook' : 'Tap to see it'}`;
  }).catch(() => {});
  loadDinner();

  // Calendar links download in the background; redraw "Coming up" when they arrive.
  const renderComing = () => { if (el.isConnected) $('[data-coming]').innerHTML = comingUpRows(); };
  onCalendar = renderComing;
  window.addEventListener('calendar-updated', onCalendar);
  refreshCalendars();

  // Photo card: this tablet's newest photos, changing every 30 seconds.
  // The next picture is loaded first, so the card never flashes grey mid-change.
  let photoIndex = 0;
  const showEmpty = (empty) => {
    $('[data-photo-empty]').style.display = empty ? 'flex' : 'none';
    $('[data-photo-label]').style.display = empty ? 'none' : '';
  };
  function renderPhoto() {
    const list = getPhotos().filter((p) => !p.video).slice(0, 20); // the card shows stills only
    const bg = $('[data-photo-bg]');
    showEmpty(!list.length);
    $('[data-photo-full]').style.display = list.length ? '' : 'none'; // nothing to show full screen yet
    if (!list.length) { bg.style.backgroundImage = ''; return; }
    const p = list[photoIndex % list.length];
    const show = () => {
      if (!el.isConnected) return;
      bg.style.backgroundImage = `url('${encodeURI(p.src)}')`;
      $('[data-photo-label]').textContent = p.line ? `${p.title} · ${p.line}` : p.title;
    };
    const img = new Image();
    img.onload = show;
    img.onerror = show;
    img.src = p.src;
  }
  if (isTablet()) {
    renderPhoto();
    photoTimer = setInterval(() => { photoIndex++; renderPhoto(); }, 30000);
    offPhotos = onPhotosChanged(() => { photoIndex = 0; renderPhoto(); });
  } else {
    // Previewing in a normal browser: no tablet album here (Full screen shows samples).
    showEmpty(true);
  }

  // "Good afternoon, Family" stays on one line: shrink the text a little if it's too long.
  const fitGreeting = () => {
    const h = $('[data-hello]');
    for (let size = 30; size >= 22; size -= 2) {
      h.style.fontSize = `${size}px`;
      if (h.scrollWidth <= h.clientWidth) break;
    }
  };
  fitGreeting();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (el.isConnected) fitGreeting(); });

  // Clock: tick every 10s. At midnight, the day's cards move on too.
  let day = new Date().toDateString();
  timer = setInterval(() => {
    const n = clockParts();
    $('[data-time]').textContent = n.time;
    $('[data-ampm]').textContent = n.ampm;
    $('[data-date]').textContent = n.date;
    if ($('[data-greeting]').textContent !== n.greeting) { $('[data-greeting]').textContent = n.greeting; fitGreeting(); }
    if (new Date().toDateString() !== day) {
      day = new Date().toDateString();
      renderComing();
      loadDinner();
    }
  }, 10000);

  // Weather: location -> forecast. Fetched again every 15 minutes (the dashboard stays
  // up all day); when the Wi-Fi is down, today's last forecast is shown instead.
  let shown = false;
  function showWeather(w, loc, offline) {
    const d = describe(w.code);
    $('[data-weather]').classList.remove('skeleton');
    $('[data-w-icon]').innerHTML = icon(d.icon, 72, settings.accent);
    $('[data-w-temp]').textContent = `${w.temp}°`;
    $('[data-w-label]').textContent = d.label;
    $('[data-w-sub]').textContent = `H ${w.high}° · L ${w.low}°${loc && loc.town ? ` · ${loc.town}` : ''}`;
    const note = $('[data-w-note]');
    note.style.display = offline ? '' : 'none';
    note.textContent = offline ? `No internet · as of ${fmtClock(new Date(w.at))}` : '';
    $('[data-w-hours]').innerHTML = w.hours.map((h) => `
        <div style="display:flex;flex-direction:column;align-items:center;gap:6px">
          <div class="muted" style="font-size:16px">${fmtHour(new Date(h.time))}</div>
          <div class="display" style="font-size:26px;font-weight:500">${h.temp}°</div>
        </div>`).join('');
    shown = true;
  }
  async function loadWeather() {
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
      $('[data-w-label]').textContent = 'Weather unavailable';
      $('[data-w-sub]').textContent = 'Check the Wi-Fi connection';
    }
  }
  loadWeather();
  refreshTimer = setInterval(() => {
    loadWeather();
    renderComing(); // drops things that are over, e.g. this morning's appointment
    refreshCalendars(); // picks up new events from calendar links (redraws when they arrive)
  }, REFRESH_MS);
}

export function unmount() {
  clearInterval(timer);
  clearInterval(photoTimer);
  clearInterval(refreshTimer);
  offPhotos?.();
  offNotes?.();
  window.removeEventListener('calendar-updated', onCalendar);
}
