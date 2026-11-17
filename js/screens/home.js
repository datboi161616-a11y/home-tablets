// Family · Home dashboard (Main.dc.html in the design)
import { settings, events } from '../config.js';
import { getLocation } from '../services/location.js';
import { getWeather, describe } from '../services/weather.js';
import { icon } from '../icons.js';
import { isTablet, getPhotos, onPhotosChanged } from '../services/tablet-photos.js';

let timer, photoTimer, offPhotos;

const fmtHour = (d) => d.toLocaleTimeString('en-US', { hour: 'numeric' });

function daysUntil({ month, day }) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let next = new Date(today.getFullYear(), month - 1, day);
  if (next < today) next = new Date(today.getFullYear() + 1, month - 1, day);
  return Math.round((next - today) / 86400000);
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
  const upcoming = events
    .map((e) => ({ ...e, days: daysUntil(e) }))
    .sort((a, b) => a.days - b.days)
    .slice(0, 3);

  el.innerHTML = `
  <div style="height:100%;padding:40px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px">
    <div style="display:flex;flex-direction:column;gap:24px;min-width:0">
      <div style="display:flex;flex-direction:column;gap:4px;padding:8px 8px 0">
        <div data-date class="muted" style="font-size:22px;font-weight:500">${c.date}</div>
        <div class="display" style="font-weight:300;font-size:168px;line-height:1;letter-spacing:-6px">
          <span data-time>${c.time}</span><span data-ampm class="muted" style="font-size:40px;letter-spacing:0;margin-left:12px;font-weight:500">${c.ampm}</span>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:8px">
          <div class="display" style="font-size:30px;font-weight:500"><span data-greeting>${c.greeting}</span>, ${settings.familyName}</div>
          <a href="#/launcher" class="pill" style="background:var(--card);color:var(--ink);gap:8px;flex:none">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></svg>
            All apps
          </a>
        </div>
      </div>

      <a href="#/forecast" data-weather class="card skeleton" style="padding:28px;display:flex;flex-direction:column;gap:22px">
        <div style="display:flex;align-items:center;gap:20px">
          <span data-w-icon>${icon('cloud', 72, settings.accent)}</span>
          <div data-w-temp class="display" style="font-size:80px;font-weight:500;line-height:1">--°</div>
          <div style="display:flex;flex-direction:column;gap:4px;margin-left:8px">
            <div data-w-label style="font-size:22px;font-weight:600">Loading weather…</div>
            <div data-w-sub class="muted" style="font-size:18px">Finding your location</div>
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
        <a href="#/photos" class="pill" style="position:relative;background:var(--ink);color:#fff">Full screen</a>
      </div>

      <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px">
        <a href="#/recipe" style="background:${settings.accent};color:#fff;border-radius:var(--radius);padding:24px;display:flex;flex-direction:column;gap:8px">
          <div class="eyebrow">Tonight's dinner idea</div>
          <div class="display" style="font-size:28px;font-weight:500;line-height:1.15">Slow-cooker white chicken chili</div>
          <div style="font-size:16px">20 min prep · Tap to cook</div>
        </a>
        <a href="#/calendar" class="card" style="padding:24px;display:flex;flex-direction:column;gap:12px">
          <div class="eyebrow muted">Coming up</div>
          ${upcoming.map((e) => `
            <div style="display:flex;justify-content:space-between;font-size:18px">
              <span>${e.name}</span>
              <span style="font-weight:600">${e.days === 0 ? 'Today!' : e.days === 1 ? 'Tomorrow' : `${e.days} days`}</span>
            </div>`).join('')}
        </a>
      </div>
    </div>
  </div>`;

  const $ = (s) => el.querySelector(s);

  // Photo card: this tablet's newest photos, changing every 30 seconds.
  let photoIndex = 0;
  function renderPhoto() {
    const list = getPhotos().slice(0, 20);
    const bg = $('[data-photo-bg]');
    $('[data-photo-empty]').style.display = list.length ? 'none' : 'flex';
    $('[data-photo-label]').style.display = list.length ? '' : 'none';
    if (!list.length) { bg.style.backgroundImage = ''; return; }
    const p = list[photoIndex % list.length];
    bg.style.backgroundImage = `url('${encodeURI(p.src)}')`;
    $('[data-photo-label]').textContent = p.line ? `${p.title} · ${p.line}` : p.title;
  }
  if (isTablet()) {
    renderPhoto();
    photoTimer = setInterval(() => { photoIndex++; renderPhoto(); }, 30000);
    offPhotos = onPhotosChanged(() => { photoIndex = 0; renderPhoto(); });
  } else {
    // Previewing in a normal browser: no tablet album here.
    $('[data-photo-empty]').firstElementChild.textContent = 'Family photos will show here';
  }

  // Clock: tick every 10s
  timer = setInterval(() => {
    const n = clockParts();
    $('[data-time]').textContent = n.time;
    $('[data-ampm]').textContent = n.ampm;
    $('[data-date]').textContent = n.date;
    $('[data-greeting]').textContent = n.greeting;
  }, 10000);

  // Weather: location -> forecast
  (async () => {
    try {
      const loc = await getLocation();
      const w = await getWeather(loc);
      const d = describe(w.code);
      if (!el.isConnected) return;
      $('[data-weather]').classList.remove('skeleton');
      $('[data-w-icon]').innerHTML = icon(d.icon, 72, settings.accent);
      $('[data-w-temp]').textContent = `${w.temp}°`;
      $('[data-w-label]').textContent = d.label;
      $('[data-w-sub]').textContent = `H ${w.high}° · L ${w.low}°${loc.town ? ` · ${loc.town}` : ''}`;
      $('[data-w-hours]').innerHTML = w.hours.map((h) => `
        <div style="display:flex;flex-direction:column;align-items:center;gap:6px">
          <div class="muted" style="font-size:16px">${fmtHour(new Date(h.time))}</div>
          <div class="display" style="font-size:26px;font-weight:500">${h.temp}°</div>
        </div>`).join('');
    } catch (err) {
      console.error(err);
      $('[data-w-label]').textContent = 'Weather unavailable';
      $('[data-w-sub]').textContent = 'Check the Wi-Fi connection';
    }
  })();
}

export function unmount() {
  clearInterval(timer);
  clearInterval(photoTimer);
  offPhotos?.();
}
