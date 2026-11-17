// Family · App menu (Launcher.dc.html in the design)
import { settings } from '../config.js';
import { getLocation } from '../services/location.js';
import { getWeather, describe } from '../services/weather.js';
import { newPhotoCount, thisWeekCount, unreadNotes } from '../services/family-sample.js';
import { isTablet, getPhotos } from '../services/tablet-photos.js';
import { getApps } from '../services/apps.js';

let timer;

function clockParts() {
  const now = new Date();
  return {
    time: `${((now.getHours() + 11) % 12) + 1}:${String(now.getMinutes()).padStart(2, '0')}`,
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

function photosSub() {
  if (!isTablet()) return `${newPhotoCount} new from the family`;
  const n = getPhotos().length;
  return n ? `${n} photo${n === 1 ? '' : 's'}` : 'Add from your phone';
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
  const week = thisWeekCount();

  // style: 'dark' | 'accent' | 'light'
  const tiles = [
    { href: '#/home', icon: 'home', title: 'Home', sub: 'Today at a glance', style: 'dark' },
    { href: '#/photos', icon: 'photos', title: 'Photos', sub: photosSub() },
    { href: '#/calendar', icon: 'calendar', title: 'Calendar', sub: week ? `${plural(week, 'thing', 'things')} this week` : 'Nothing this week' },
    { href: '#/forecast', icon: 'weather', title: 'Weather', sub: 'Loading…', data: 'data-weather' },
    { href: '#/recipe', icon: 'recipe', title: 'Recipes', sub: 'Family favorites', style: 'accent' },
    { href: '#/messages', icon: 'messages', title: 'Messages', sub: unreadNotes ? `${plural(unreadNotes, 'new note', 'new notes')}` : 'No new notes' },
    // The design's "Grocery list" tile (no grocery screen yet) is now the Apps tile.
    { href: '#/apps', icon: 'apps', title: 'Apps', sub: appsSub() },
    { href: '#/camera', icon: 'camera', title: 'Camera', sub: 'Take a photo or video' },
    { href: '#/night', icon: 'night', title: 'Night clock', sub: 'Starts at 10 PM' },
  ];

  const tile = (t) => {
    const bg = t.style === 'dark' ? '#1D2430' : t.style === 'accent' ? a : '#FFFFFF';
    const fg = t.style ? '#FFFFFF' : '#1D2430';
    const subColor = t.style === 'dark' ? '#C9CFD6' : t.style === 'accent' ? '#FFFFFF' : '#4A5363';
    const iconColor = t.style ? 'currentColor' : a;
    const tag = t.href ? 'a' : 'div';
    return `<${tag} ${t.href ? `href="${t.href}"` : ''} class="ln-tile" style="background:${bg};color:${fg}">
      ${svg(ICONS[t.icon], iconColor)}
      <div>
        <div class="display" style="font-size:30px;font-weight:500">${t.title}</div>
        <div ${t.data || ''} style="font-size:17px;color:${subColor};margin-top:4px">${t.sub}</div>
      </div>
    </${tag}>`;
  };

  el.innerHTML = `
  <style>
    .ln-tile{border-radius:24px;padding:26px;display:flex;flex-direction:column;justify-content:space-between;
      min-width:0;transition:transform .12s ease}
    a.ln-tile:active{transform:scale(.97)}
  </style>
  <div style="height:100%;padding:40px;display:flex;flex-direction:column;gap:28px">
    <div style="display:flex;align-items:flex-end;justify-content:space-between">
      <div style="display:flex;flex-direction:column;gap:4px">
        <div data-date class="muted" style="font-size:20px">${c.date}</div>
        <div class="display" style="font-size:48px;font-weight:500">What would you like to see?</div>
      </div>
      <div data-time class="display" style="font-size:56px;font-weight:300">${c.time}</div>
    </div>
    <div style="flex-grow:1;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr));gap:20px">
      ${tiles.map(tile).join('')}
    </div>
  </div>`;

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
      // e.g. "34° · snow later": say what's coming if it differs from now.
      const now = describe(w.code).label;
      const later = w.hours.map((h) => describe(h.code)).find((d) => d.label !== now);
      const sub = later && later.icon !== describe(w.code).icon
        ? `${later.label.toLowerCase()} later` : now.toLowerCase();
      $('[data-weather]').textContent = `${w.temp}° · ${sub}`;
    } catch (err) {
      console.error(err);
      $('[data-weather]').textContent = 'Forecast';
    }
  })();
}

export function unmount() {
  clearInterval(timer);
}
