// Family · App menu (Launcher.dc.html in the design)
import { display, hourText, clockTime, clockAmPm, timeText } from '../services/display.js';
import { settings } from '../config.js';
import { getLocation, manualPlace, knownPlace } from '../services/location.js';
import { getWeather, describe } from '../services/weather.js';
import { getAlerts, alertColor } from '../services/weather-alerts.js';
import { photos as samplePhotos } from '../services/family-sample.js';
import { thisWeekCount, upcoming } from '../services/calendar-data.js';
import { loadMessages, onMessagesChanged } from '../services/messages-data.js';
import { tonight, weekRecipeIds, shoppingCount, getPlan, markFor, dayKey, onKitchenChanged } from '../services/meal-plan.js';
import { isTablet, getPhotos, onPhotosChanged } from '../services/tablet-photos.js';
import { getApps } from '../services/apps.js';
import { feature } from '../services/features.js';
import { wipeScreen } from '../services/wipe.js';
import { tileArt, C } from '../art.js';

let timer, offNotes, offPhotos, offKitchen, onWake, onOnline;

function clockParts() {
  const now = new Date();
  return {
    time: clockTime(now),
    ampm: clockAmPm(now),
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

// "New note from Mom", "3 new notes · newest from Ava", or when they have all been
// read, who wrote last: "No new notes · last from Dad".
function notesSub() {
  const list = loadMessages();
  const unread = list.filter((m) => !m.seen);
  if (unread.length === 1) return unread[0].who ? `New note from ${unread[0].who}` : '1 new note';
  if (unread.length) return `${unread.length} new notes${unread[0].who ? ` · newest from ${unread[0].who}` : ''}`;
  return list.length && list[0].who ? `No new notes · last from ${list[0].who}` : 'No new notes';
}

function photosSub() {
  if (!isTablet()) return plural(samplePhotos.length, 'photo', 'photos'); // browser preview
  const n = getPhotos().length;
  return n ? `${n} photo${n === 1 ? '' : 's'}` : 'Add from your phone';
}
// With no photos yet, the tile goes where they are added rather than to an empty frame.
const photosHref = () => (isTablet() && !getPhotos().length ? '#/addphotos' : '#/photos');

// When the next thing is: "now", "today 3 PM", "tomorrow 9 AM", "Thursday", "in 8 days".
function whenWords(e) {
  const d = e.date instanceof Date ? e.date : new Date(e.date);
  const timed = d.getHours() || d.getMinutes();
  const at = () => (d.getMinutes() ? timeText(d) : hourText(d.getHours()));
  if (e.days === 0) return timed ? (d.getTime() <= Date.now() ? 'now' : `today ${at()}`) : 'today';
  if (e.days === 1) return timed ? `tomorrow ${at()}` : 'tomorrow';
  if (e.days < 7) return d.toLocaleDateString('en-US', { weekday: 'long' });
  return `in ${e.days} days`;
}

// What's next and when ("Next: Dentist tomorrow 9 AM"), with how busy the week is.
function calendarSub() {
  const week = thisWeekCount();
  const next = upcoming(1)[0];
  if (!next) return week ? `${plural(week, 'thing', 'things')} this week` : 'Nothing coming up';
  const line = `Next: ${next.name} ${whenWords(next)}`;
  return week > 1 ? `${line} · ${week} this week` : line;
}

// The last weather downloaded today (for when the Wi-Fi is down), or null. Only in the
// degrees the family chose, and for the place the weather is for now.
function savedWeather() {
  try {
    const w = JSON.parse(localStorage.getItem('weather.v1') || 'null');
    if (!w || !w.at || new Date(w.at).toDateString() !== new Date().toDateString()) return null;
    if (w.units && w.units !== settings.units) return null;
    const place = manualPlace() || knownPlace();
    if (place && typeof place.lat === 'number' && typeof w.lat === 'number' && Math.abs(place.lat - w.lat) > 0.05) return null;
    return w;
  } catch (e) { return null; }
}

// e.g. "34° · snow later": say what's coming if it differs from now.
function weatherSub(w) {
  const now = describe(w.code);
  const later = (w.hours || []).filter((h) => new Date(h.time).getTime() > Date.now())
    .map((h) => describe(h.code)).find((d) => d.label !== now.label);
  const sub = later && later.icon !== now.icon ? `${later.label.toLowerCase()} later` : now.label.toLowerCase();
  return `${w.temp}° · ${sub}`;
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
  const notes = loadMessages().filter((m) => !m.seen).length;
  const early = savedWeather(); // shown at once; the fresh one follows

  // style: 'dark' | 'accent' | 'light'
  const tiles = [
    { href: '#/home', icon: 'home', title: 'Home', sub: 'Today at a glance', style: 'dark' },
    { href: photosHref(), icon: 'photos', title: 'Photos', sub: photosSub(), data: 'data-photos' },
    { href: '#/calendar', icon: 'calendar', title: 'Calendar', sub: calendarSub(), data: 'data-calendar' },
    { href: '#/forecast', icon: 'weather', title: 'Weather', sub: early ? weatherSub(early) : 'Loading…', data: 'data-weather' },
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
    const art = t.icon === 'weather' ? ' data-weather-art' : '';
    return `<${tag} ${t.href ? `href="${t.href}"` : ''} class="ln-tile"${t.icon === 'photos' ? ' data-photos-tile' : ''} style="background:${bg};color:${fg};position:relative">
      <div class="ln-art"${art}>${t.icon === 'weather' && early ? tileArt.weather(describe(early.code).icon, isNight()) : artFor(t.icon)}</div>${badge}
      <div class="ln-text">
        <div class="display" style="font-size:30px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${t.title}</div>
        <div ${t.data || ''} class="ln-sub" style="color:${subColor}">${esc(t.sub)}</div>
      </div>
    </${tag}>`;
  };

  const pill = 'class="pill ln-pill"';
  el.innerHTML = `
  <style>
    .ln-tile{border-radius:24px;padding:0;display:flex;flex-direction:column;overflow:hidden;
      min-width:0;transition:transform .12s ease}
    /* The picture gives up some height when a hint needs a second line. */
    .ln-art{height:170px;flex:0 1 auto;min-height:118px;overflow:hidden}
    .ln-art svg{width:100%;height:100%}
    .ln-text{min-width:0;padding:0 26px 22px;margin-top:auto;flex:none}
    /* Two lines rather than "Idea: Cajun stuffed bell pe…" */
    .ln-sub{font-size:17px;line-height:1.3;margin-top:4px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow-wrap:anywhere}
    a.ln-tile:active{transform:scale(.97)}
    .ln-badge{position:absolute;top:18px;right:18px;min-width:40px;height:40px;padding:0 12px;border-radius:999px;
      color:#fff;font:600 20px Inter,sans-serif;align-items:center;justify-content:center}
    .ln-pill{background:#fff;color:var(--ink);min-height:52px;padding:0 20px;font-size:17px;white-space:nowrap;border:none;font-family:inherit;cursor:pointer}
  </style>
  <div style="height:100%;padding:40px;display:flex;flex-direction:column;gap:24px">
    <div style="display:flex;flex-direction:column;gap:2px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:20px">
        <div data-date class="muted" style="font-size:20px;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c.date}</div>
        <!-- Quick ways to what the eight tiles don't reach. -->
        <div style="display:flex;gap:10px;flex:none">
          <a href="#/timers" ${pill}>Timers</a>
          ${feature('camera') ? `<a href="#/camera" ${pill}>Camera</a>` : ''}
          ${feature('apps') ? `<a href="#/night" ${pill}>Night clock</a>` : ''}
          <button type="button" data-wipe ${pill}>Wipe the screen</button>
          <a href="#/settings" ${pill}>Settings</a>
          <a href="#/welcome" ${pill} aria-label="Show the welcome tour again">Tour</a>
        </div>
      </div>
      <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:20px">
        <div class="display" style="font-size:48px;font-weight:500;white-space:nowrap">What would you like to see?</div>
        <div class="display" style="font-size:56px;font-weight:300;white-space:nowrap"><span data-time>${c.time}</span><span data-ampm class="muted" style="font-size:24px;font-weight:500;margin-left:8px${c.ampm ? '' : ';display:none'}">${c.ampm}</span></div>
      </div>
    </div>
    <div style="flex-grow:1;min-height:0;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr));gap:20px">
      ${tiles.map(tile).join('')}
    </div>
  </div>`;

  const $ = (s) => el.querySelector(s);

  // Wipe the screen: touches off for half a minute so the glass can be cleaned.
  $('[data-wipe]').addEventListener('click', () => wipeScreen(30));

  // Recipes: tonight's dinner (or "eating out" / "leftovers" from the week plan);
  // Shopping list: how many things to get.
  const showRecipes = () => tonight().then((t) => {
    if (!el.isConnected) return;
    const box = $('[data-recipes]');
    if (t && t.planned) { box.textContent = `Tonight: ${t.entry.t}`; return; }
    const mark = markFor(getPlan(), dayKey(new Date()), 'dinner');
    if (mark === 'out') box.textContent = 'Tonight: eating out';
    else if (mark === 'leftovers') box.textContent = 'Tonight: leftovers';
    else if (t && !weekRecipeIds().length) box.textContent = `Idea: ${t.entry.t}`;
    else box.textContent = planSub();
  }).catch(() => {});
  const showShopping = () => shoppingCount().then((n) => {
    if (el.isConnected) $('[data-grocery]').textContent = n ? plural(n, 'thing to get', 'things to get') : 'Nothing on the list';
  }).catch(() => {});
  showRecipes();
  showShopping();
  // Something was added from a phone while the menu is open: the count follows.
  // (A few changes in a row are counted once.)
  let kitchenWait = 0;
  const offChanges = onKitchenChanged(() => {
    clearTimeout(kitchenWait);
    kitchenWait = setTimeout(() => { if (el.isConnected) { showShopping(); showRecipes(); } }, 300);
  });
  offKitchen = () => { clearTimeout(kitchenWait); offChanges(); };

  // The clock turns over exactly on the minute. At midnight the date and the tiles'
  // hints (what's next on the calendar, tonight's dinner) move on too.
  let day = new Date().toDateString();
  const tick = () => {
    clearTimeout(timer);
    if (!el.isConnected) return;
    const n = clockParts();
    const ampm = $('[data-ampm]');
    $('[data-time]').textContent = n.time;
    ampm.textContent = n.ampm;
    ampm.style.display = n.ampm ? '' : 'none'; // 24-hour clock: no empty gap after the time
    $('[data-date]').textContent = n.date;
    if (new Date().toDateString() !== day) {
      day = new Date().toDateString();
      $('[data-calendar]').textContent = calendarSub();
      showRecipes();
      showShopping();
    }
    timer = setTimeout(tick, 60000 - (Date.now() % 60000) + 30);
  };
  timer = setTimeout(tick, 60000 - (Date.now() % 60000) + 30);
  onWake = () => { if (!document.hidden) tick(); };
  document.addEventListener('visibilitychange', onWake);

  // Notes and photos arrive from phones while the menu is open: keep the counts current.
  offNotes = onMessagesChanged(() => {
    if (!el.isConnected) return;
    const n = loadMessages().filter((m) => !m.seen).length;
    $('[data-notes]').textContent = notesSub();
    const b = $('[data-badge]');
    b.textContent = n;
    b.style.display = n ? 'flex' : 'none';
  });
  offPhotos = onPhotosChanged(() => {
    if (!el.isConnected) return;
    $('[data-photos]').textContent = photosSub();
    $('[data-photos-tile]').setAttribute('href', photosHref());
  });

  let loading = false;
  async function loadWeather() {
    if (loading) return;
    loading = true;
    try {
      const loc = await getLocation();
      const w = await getWeather(loc);
      if (!el.isConnected) return;
      $('[data-weather-art]').innerHTML = tileArt.weather(describe(w.code).icon, isNight());
      const alerts = await getAlerts(loc).catch(() => []);
      if (!el.isConnected) return;
      const box = $('[data-weather]');
      if (alerts.length) {
        // Keep the temperature, and make a warning stand out in red.
        box.textContent = `${w.temp}° · ⚠ ${alerts[0].event}`;
        box.style.color = alertColor(alerts[0]);
        box.style.fontWeight = '600';
        return;
      }
      box.style.color = '';
      box.style.fontWeight = '';
      box.textContent = weatherSub(w);
    } catch (err) {
      console.error(err);
      if (!el.isConnected) return;
      // No internet: today's last forecast beats a blank tile (and says from when).
      const old = savedWeather();
      if (old) $('[data-weather-art]').innerHTML = tileArt.weather(describe(old.code).icon, isNight());
      $('[data-weather]').textContent = old ? `${old.temp}° at ${timeText(new Date(old.at))}` : 'No internet right now';
    } finally {
      loading = false;
    }
  }
  loadWeather();
  // The Wi-Fi came back (or another town was chosen): try again at once.
  onOnline = () => { if (el.isConnected) loadWeather(); };
  window.addEventListener('online', onOnline);
  window.addEventListener('place-changed', onOnline);
}

export function unmount() {
  clearTimeout(timer);
  offNotes?.();
  offPhotos?.();
  offKitchen?.();
  offKitchen = null;
  if (onWake) document.removeEventListener('visibilitychange', onWake);
  if (onOnline) { window.removeEventListener('online', onOnline); window.removeEventListener('place-changed', onOnline); }
  onWake = onOnline = null;
}
