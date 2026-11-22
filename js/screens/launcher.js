// Family · App menu (Launcher.dc.html in the design)
import { display, hourText } from '../services/display.js';
import { settings } from '../config.js';
import { getLocation } from '../services/location.js';
import { getWeather, describe } from '../services/weather.js';
import { getAlerts, alertColor } from '../services/weather-alerts.js';
import { photos as samplePhotos } from '../services/family-sample.js';
import { thisWeekCount, upcoming } from '../services/calendar-data.js';
import { unreadCount, onMessagesChanged } from '../services/messages-data.js';
import { tonight, weekRecipeIds, shoppingCount } from '../services/meal-plan.js';
import { isTablet, getPhotos, onPhotosChanged } from '../services/tablet-photos.js';
import { getApps } from '../services/apps.js';
import { feature } from '../services/features.js';
import { tileArt, C } from '../art.js';

let timer, offNotes, offPhotos;

function clockParts() {
  const now = new Date();
  return {
    time: `${((now.getHours() + 11) % 12) + 1}:${String(now.getMinutes()).padStart(2, '0')}`,
    ampm: now.getHours() < 12 ? 'AM' : 'PM',
    date: now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
  };
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

// The picture at the top of each tile (art.js). The night clock has no scene of its
// own, so it borrows the weather one with the moon out.
function artFor(icon) {
  switch (icon) {
    case 'recipe': {
      const a = tileArt.recipes();
      // The halo is drawn for the house orange; on any other accent, keep it subtle.
      return settings.accent.toUpperCase() === C.accent ? a : a.replace(`fill="${C.accentSoft}"`, 'fill="rgba(255,255,255,.12)"');
    }
    case 'weather': return tileArt.weather('sun', isNight());
    case 'night': return tileArt.weather('sun', true);
    default: return (tileArt[icon] || tileArt.apps)();
  }
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function planSub() {
  const n = weekRecipeIds().length;
  return n ? plural(n, 'meal planned', 'meals planned') : 'Browse and plan the week';
}

function notesSub() {
  const n = unreadCount();
  return n ? plural(n, 'new note', 'new notes') : 'No new notes';
}

function photosSub() {
  if (!isTablet()) return plural(samplePhotos.length, 'photo', 'photos'); // browser preview
  const n = getPhotos().length;
  return n ? `${n} photo${n === 1 ? '' : 's'}` : 'Add from your phone';
}

// Nothing this week: say what's next instead, e.g. "Next: Thanksgiving in 8 days".
function calendarSub() {
  const week = thisWeekCount();
  if (week) return `${plural(week, 'thing', 'things')} this week`;
  const next = upcoming(1)[0];
  if (!next) return 'Nothing this week';
  return `Next: ${next.name} ${next.days === 1 ? 'tomorrow' : `in ${next.days} days`}`;
}

// The last weather downloaded today (for when the Wi-Fi is down), or null.
function savedWeather() {
  try {
    const w = JSON.parse(localStorage.getItem('weather.v1') || 'null');
    return w && w.at && new Date(w.at).toDateString() === new Date().toDateString() ? w : null;
  } catch (e) { return null; }
}

function appsSub() {
  const apps = getApps();
  if (!apps.length) return 'YouTube, Spotify & more';
  const names = apps.slice(0, 2).map((a) => a.label).join(', ');
  return apps.length > 2 ? `${names} & ${apps.length - 2} more` : names;
}

export function mount(el) {
  const a = settings.accent;
  const c = clockParts();
  const notes = unreadCount();

  // style: 'dark' | 'accent' | 'light'
  const tiles = [
    { href: '#/home', icon: 'home', title: 'Home', sub: 'Today at a glance', style: 'dark' },
    { href: '#/photos', icon: 'photos', title: 'Photos', sub: photosSub(), data: 'data-photos' },
    { href: '#/calendar', icon: 'calendar', title: 'Calendar', sub: calendarSub() },
    { href: '#/forecast', icon: 'weather', title: 'Weather', sub: 'Loading…', data: 'data-weather' },
    { href: '#/recipes', icon: 'recipe', title: 'Recipes', sub: planSub(), style: 'accent', data: 'data-recipes' },
    { href: '#/messages', icon: 'messages', title: 'Messages', sub: notesSub(), data: 'data-notes', badge: true },
    { href: '#/shopping', icon: 'grocery', title: 'Shopping list', sub: 'From your week plan', data: 'data-grocery' },
    // The night clock comes on by itself at 10 PM, so its tile gives way to Apps when Apps is on.
    feature('apps')
      ? { href: '#/apps', icon: 'apps', title: 'Apps', sub: appsSub() }
      : { href: '#/night', icon: 'night', title: 'Night clock', sub: display().night ? `Starts at ${hourText(display().nightFrom)}` : 'Tap to show it' },
  ];

  const tile = (t) => {
    const bg = t.style === 'dark' ? '#1D2430' : t.style === 'accent' ? a : '#FFFFFF';
    const fg = t.style ? '#FFFFFF' : '#1D2430';
    const subColor = t.style === 'dark' ? '#C9CFD6' : t.style === 'accent' ? '#FFFFFF' : '#4A5363';
    const tag = t.href ? 'a' : 'div';
    // New notes: a number badge on the tile, easy to spot from across the kitchen.
    const badge = t.badge ? `<span data-badge class="ln-badge" style="background:${a};display:${notes ? 'flex' : 'none'}">${notes}</span>` : '';
    return `<${tag} ${t.href ? `href="${t.href}"` : ''} class="ln-tile" style="background:${bg};color:${fg};position:relative">
      <div class="ln-art"${t.icon === 'weather' ? ' data-weather-art' : ''}>${artFor(t.icon)}</div>${badge}
      <div class="ln-text">
        <div class="display" style="font-size:30px;font-weight:500">${t.title}</div>
        <div ${t.data || ''} style="font-size:17px;color:${subColor};margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(t.sub)}</div>
      </div>
    </${tag}>`;
  };

  el.innerHTML = `
  <style>
    .ln-tile{border-radius:24px;padding:0;display:flex;flex-direction:column;overflow:hidden;
      min-width:0;transition:transform .12s ease}
    .ln-art{height:170px;flex:none}
    .ln-art svg{width:100%;height:100%}
    .ln-text{min-width:0;padding:0 26px 24px;margin-top:auto}
    a.ln-tile:active{transform:scale(.97)}
    .ln-badge{position:absolute;top:18px;right:18px;min-width:40px;height:40px;padding:0 12px;border-radius:999px;
      color:#fff;font:600 20px Inter,sans-serif;align-items:center;justify-content:center}
  </style>
  <div style="height:100%;padding:40px;display:flex;flex-direction:column;gap:28px">
    <div style="display:flex;flex-direction:column;gap:2px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:20px">
        <div data-date class="muted" style="font-size:20px">${c.date}</div>
        <!-- Quick ways to what the eight tiles don't reach. -->
        <div style="display:flex;gap:10px;flex:none">
          <a href="#/timers" class="pill" style="background:#fff;color:var(--ink)">Timers</a>
          ${feature('camera') ? '<a href="#/camera" class="pill" style="background:#fff;color:var(--ink)">Camera</a>' : ''}
          ${feature('apps') ? '<a href="#/night" class="pill" style="background:#fff;color:var(--ink)">Night clock</a>' : ''}
          <a href="#/settings" class="pill" style="background:#fff;color:var(--ink)">Settings</a>
          <a href="#/welcome" class="pill" style="background:#fff;color:var(--ink)" aria-label="Show the welcome tour again">Tour</a>
        </div>
      </div>
      <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:20px">
        <div class="display" style="font-size:48px;font-weight:500;white-space:nowrap">What would you like to see?</div>
        <div class="display" style="font-size:56px;font-weight:300;white-space:nowrap"><span data-time>${c.time}</span><span data-ampm class="muted" style="font-size:24px;font-weight:500;margin-left:8px">${c.ampm}</span></div>
      </div>
    </div>
    <div style="flex-grow:1;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr));gap:20px">
      ${tiles.map(tile).join('')}
    </div>
  </div>`;

  const $ = (s) => el.querySelector(s);

  // Recipes: tonight's dinner; Shopping list: how many things to get.
  tonight().then((t) => {
    if (!el.isConnected || !t) return;
    if (t.planned || !weekRecipeIds().length) $('[data-recipes]').textContent = `${t.planned ? 'Tonight' : 'Idea'}: ${t.entry.t}`;
  }).catch(() => {});
  shoppingCount().then((n) => {
    if (el.isConnected) $('[data-grocery]').textContent = n ? plural(n, 'thing to get', 'things to get') : 'Nothing on the list';
  }).catch(() => {});

  timer = setInterval(() => {
    const n = clockParts();
    $('[data-time]').textContent = n.time;
    $('[data-ampm]').textContent = n.ampm;
    $('[data-date]').textContent = n.date;
  }, 10000);

  // Notes and photos arrive from phones while the menu is open: keep the counts current.
  offNotes = onMessagesChanged(() => {
    if (!el.isConnected) return;
    const n = unreadCount();
    $('[data-notes]').textContent = notesSub();
    const b = $('[data-badge]');
    b.textContent = n;
    b.style.display = n ? 'flex' : 'none';
  });
  offPhotos = onPhotosChanged(() => { if (el.isConnected) $('[data-photos]').textContent = photosSub(); });

  (async () => {
    try {
      const loc = await getLocation();
      const w = await getWeather(loc);
      if (!el.isConnected) return;
      $('[data-weather-art]').innerHTML = tileArt.weather(describe(w.code).icon, isNight());
      const alerts = await getAlerts(loc).catch(() => []);
      if (!el.isConnected) return;
      if (alerts.length) {
        // Keep the temperature, and make a warning stand out in red.
        const box = $('[data-weather]');
        box.textContent = `${w.temp}° · ⚠ ${alerts[0].event}`;
        box.style.color = alertColor(alerts[0]);
        box.style.fontWeight = '600';
        return;
      }
      // e.g. "34° · snow later": say what's coming if it differs from now.
      const now = describe(w.code).label;
      const later = w.hours.map((h) => describe(h.code)).find((d) => d.label !== now);
      const sub = later && later.icon !== describe(w.code).icon
        ? `${later.label.toLowerCase()} later` : now.toLowerCase();
      $('[data-weather]').textContent = `${w.temp}° · ${sub}`;
    } catch (err) {
      console.error(err);
      if (!el.isConnected) return;
      // No internet: today's last forecast beats a blank tile.
      const old = savedWeather();
      if (old) $('[data-weather-art]').innerHTML = tileArt.weather(describe(old.code).icon, isNight());
      $('[data-weather]').textContent = old
        ? `${old.temp}° at ${new Date(old.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
        : 'No internet right now';
    }
  })();
}

export function unmount() {
  clearInterval(timer);
  offNotes?.();
  offPhotos?.();
}
