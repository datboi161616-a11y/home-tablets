// Family · App menu (Launcher.dc.html in the design)
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

let timer, offNotes, offPhotos;

function clockParts() {
  const now = new Date();
  return {
    time: `${((now.getHours() + 11) % 12) + 1}:${String(now.getMinutes()).padStart(2, '0')}`,
    ampm: now.getHours() < 12 ? 'AM' : 'PM',
    date: now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
  };
}

const svg = (paths, color) => `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.6"
  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

const ICONS = {
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
  photos: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-8 8"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  weather: '<path d="M17.5 17H7a5 5 0 1 1 .9-9.9A6 6 0 0 1 19 9.5a3.75 3.75 0 0 1-1.5 7.5z"/>',
  recipe: '<path d="M4 11h16a8 8 0 0 1-16 0z"/><path d="M9 7c0-1.5 1-2 1-3M13 7c0-1.5 1-2 1-3"/>',
  messages: '<path d="M4 5h16v11H9l-5 4z"/>',
  grocery: '<path d="M5 7h14M5 12h14M5 17h9"/>',
  apps: '<rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/>',
  camera: '<rect x="3" y="7" width="18" height="13" rx="2"/><circle cx="12" cy="13.5" r="3.5"/><path d="M8 7l1.5-2.5h5L16 7"/>',
  night: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
};

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
    { href: '#/shopping', icon: 'grocery', title: 'Grocery list', sub: 'From your week plan', data: 'data-grocery' },
    // The night clock comes on by itself at 10 PM, so its tile gives way to Apps when Apps is on.
    feature('apps')
      ? { href: '#/apps', icon: 'apps', title: 'Apps', sub: appsSub() }
      : { href: '#/night', icon: 'night', title: 'Night clock', sub: 'Starts at 10 PM' },
  ];

  const tile = (t) => {
    const bg = t.style === 'dark' ? '#1D2430' : t.style === 'accent' ? a : '#FFFFFF';
    const fg = t.style ? '#FFFFFF' : '#1D2430';
    const subColor = t.style === 'dark' ? '#C9CFD6' : t.style === 'accent' ? '#FFFFFF' : '#4A5363';
    const iconColor = t.style ? 'currentColor' : a;
    const tag = t.href ? 'a' : 'div';
    // New notes: a number badge on the tile, easy to spot from across the kitchen.
    const badge = t.badge ? `<span data-badge class="ln-badge" style="background:${a};display:${notes ? 'flex' : 'none'}">${notes}</span>` : '';
    return `<${tag} ${t.href ? `href="${t.href}"` : ''} class="ln-tile" style="background:${bg};color:${fg};position:relative">
      ${svg(ICONS[t.icon], iconColor)}${badge}
      <div style="min-width:0">
        <div class="display" style="font-size:30px;font-weight:500">${t.title}</div>
        <div ${t.data || ''} style="font-size:17px;color:${subColor};margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(t.sub)}</div>
      </div>
    </${tag}>`;
  };

  el.innerHTML = `
  <style>
    .ln-tile{border-radius:24px;padding:26px;display:flex;flex-direction:column;justify-content:space-between;
      min-width:0;transition:transform .12s ease}
    a.ln-tile:active{transform:scale(.97)}
    .ln-badge{position:absolute;top:22px;right:22px;min-width:40px;height:40px;padding:0 12px;border-radius:999px;
      color:#fff;font:600 20px Inter,sans-serif;align-items:center;justify-content:center}
  </style>
  <div style="height:100%;padding:40px;display:flex;flex-direction:column;gap:28px">
    <div style="display:flex;align-items:flex-end;justify-content:space-between">
      <div style="display:flex;flex-direction:column;gap:4px">
        <div data-date class="muted" style="font-size:20px">${c.date}</div>
        <div class="display" style="font-size:48px;font-weight:500">What would you like to see?</div>
      </div>
      <div class="display" style="font-size:56px;font-weight:300;white-space:nowrap"><span data-time>${c.time}</span><span data-ampm class="muted" style="font-size:24px;font-weight:500;margin-left:8px">${c.ampm}</span></div>
    </div>
    <div style="flex-grow:1;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr));gap:20px">
      ${tiles.map(tile).join('')}
    </div>
  </div>`;

  const $ = (s) => el.querySelector(s);

  // Recipes: tonight's dinner; Grocery list: how many things to get.
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
