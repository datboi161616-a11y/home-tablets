// Kitchen display · App menu ("Live card carousel", board IdeaKH10)
//
// A row of big cards to swipe through sideways; each card is an app already showing what
// it has right now (the first things on the shopping list, timers counting down, today's
// weather, what's next on the calendar, tonight's dinner, the newest note, the newest
// photo). A tap on a card opens that app. Below the cards: every app as a big button.
//
// The weak graphics chip: the row is the browser's own sideways scrolling with snapping
// (no 3D), the card in the middle is a little bigger (a transform on two cards at a time),
// and the only things that move by themselves are the rain or snow on the weather card.
import { display, hourText, clockTime, clockAmPm, timeText } from '../services/display.js';
import { settings } from '../config.js';
import { getLocation, manualPlace, knownPlace } from '../services/location.js';
import { getWeather, describe } from '../services/weather.js';
import { getAlerts } from '../services/weather-alerts.js';
import { photos as samplePhotos } from '../services/family-sample.js';
import { thisWeekCount, upcoming } from '../services/calendar-data.js';
import { loadMessages, onMessagesChanged, when as noteWhen } from '../services/messages-data.js';
import { tonight, weekRecipeIds, buildShoppingList, extraText, getPlan, markFor, dayKey, onKitchenChanged } from '../services/meal-plan.js';
import { isTablet, getPhotos, onPhotosChanged, thumbnail } from '../services/tablet-photos.js';
import { getApps } from '../services/apps.js';
import { feature } from '../services/features.js';
import * as timerSvc from '../services/timers.js';
import { wxIcon, foodArt, spot } from '../art.js';
import { topBar, avatar, esc } from './ui.js';

let timer, secTimer, offNotes, offPhotos, offKitchen, offTimers, onWake, onOnline, raf;

const CARD_W = 340;
const CARD_GAP = 24;
const STEP = CARD_W + CARD_GAP;

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

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// When something is: "Now", "Today 3 PM", "Tomorrow 9 AM", "Thursday", "In 8 days".
function whenWords(e) {
  const d = e.date instanceof Date ? e.date : new Date(e.date);
  const timed = d.getHours() || d.getMinutes();
  const at = () => (d.getMinutes() ? timeText(d) : hourText(d.getHours()));
  if (e.days === 0) return timed ? (d.getTime() <= Date.now() ? 'Now' : `Today ${at()}`) : 'Today';
  if (e.days === 1) return timed ? `Tomorrow ${at()}` : 'Tomorrow';
  if (e.days < 7) return `${d.toLocaleDateString('en-US', { weekday: 'long' })}${timed ? ` ${at()}` : ''}`;
  return `In ${e.days} days`;
}

// The last weather downloaded today (for when the Wi-Fi is down), or null. Only in the
// degrees chosen in Settings, and for the place the weather is for now.
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

// e.g. "Cloudy · rain later": say what's coming if it differs from now.
function weatherLine(w) {
  const now = describe(w.code);
  const later = (w.hours || []).filter((h) => new Date(h.time).getTime() > Date.now())
    .map((h) => describe(h.code)).find((d) => d.label !== now.label);
  return later && later.icon !== now.icon ? `${now.label} · ${later.label.toLowerCase()} later` : now.label;
}

// ---- What each card shows -------------------------------------------------------------
const head = (title, side = '') => `<div class="lc-head"><span class="lc-name">${title}</span>${side ? `<span class="lc-side">${side}</span>` : ''}</div>`;
// A card whose app has nothing yet: a picture and a friendly word, never made-up content.
const invite = (line, button, art = '') => `<div class="lc-invite">${art ? `<div class="lc-invite-art">${art}</div>` : ''}<div class="x-serif lc-invite-line">${line}</div></div>
  <div class="lc-go">${button}</div>`;

function calendarCard() {
  const week = thisWeekCount();
  const next = upcoming(4);
  if (!next.length) return head('Calendar') + invite('Nothing coming up yet.', 'Add the first thing', spot.quietDay());
  return `${head('Calendar', week ? `${week} this week` : '')}
    <div class="lc-sub">Coming up</div>
    <div class="lc-rows">${next.map((e) => `<div class="lc-ev"><b>${esc(whenWords(e))}</b><span>${esc(e.name)}</span></div>`).join('')}</div>`;
}

// The sky behind the weather card, and whether its text is dark or light.
function weatherLook(kind, night) {
  if (night) return { bg: 'linear-gradient(180deg,#232C48 0%,#3A4668 100%)', ink: '#FFFFFF', soft: '#C9D2E8' };
  switch (kind) {
    case 'sun': return { bg: 'linear-gradient(180deg,#5FA8E0 0%,#A9D3F0 70%,#DDEEF8 100%)', ink: '#FFFFFF', soft: '#F0F8FF' };
    case 'partly': return { bg: 'linear-gradient(180deg,#6C9FCB 0%,#A8C8E2 70%,#D5E3EE 100%)', ink: '#FFFFFF', soft: '#F0F6FB' };
    case 'snow': return { bg: 'linear-gradient(180deg,#7C8FA8 0%,#AEBDCE 60%,#DCE4EC 100%)', ink: '#FFFFFF', soft: '#EEF3F8' };
    case 'storm': return { bg: 'linear-gradient(180deg,#444E62 0%,#6C778A 100%)', ink: '#FFFFFF', soft: '#D5DBE5' };
    default: return { bg: 'linear-gradient(180deg,#5E6E88 0%,#93A2B6 60%,#B9C4D2 100%)', ink: '#FFFFFF', soft: '#E8EDF3' };
  }
}
// Rain or snow falling under the cloud: one group that moves, nothing else.
function falling(kind) {
  if (kind === 'rain' || kind === 'storm') {
    return `<svg class="lc-fall" width="150" height="60" viewBox="0 0 150 60" aria-hidden="true"><g class="lc-drops" stroke="#DCEBFA" stroke-width="4" stroke-linecap="round"><line x1="24" y1="6" x2="18" y2="20"/><line x1="58" y1="10" x2="52" y2="24"/><line x1="92" y1="6" x2="86" y2="20"/><line x1="126" y1="10" x2="120" y2="24"/></g></svg>`;
  }
  if (kind === 'snow') {
    return `<svg class="lc-fall" width="150" height="60" viewBox="0 0 150 60" aria-hidden="true"><g class="lc-drops slow" fill="#FFFFFF"><circle cx="22" cy="10" r="4.5"/><circle cx="58" cy="18" r="4"/><circle cx="92" cy="8" r="4.5"/><circle cx="126" cy="16" r="4"/></g></svg>`;
  }
  return '';
}
// w: a weather result; note: a word under it ("from 3:40 PM"); alert: a warning's name.
function weatherCard(w, { note = '', alert = '' } = {}) {
  const kind = describe(w.code).icon;
  const night = isNight();
  return {
    look: weatherLook(kind, night),
    html: `${head('Weather')}
      <div class="lc-temp">${esc(w.temp)}°</div>
      <div class="lc-line">${esc(weatherLine(w))}</div>
      ${typeof w.high === 'number' && typeof w.low === 'number' ? `<div class="lc-sub">High ${w.high}° · low ${w.low}°${note ? ` · ${esc(note)}` : ''}</div>` : note ? `<div class="lc-sub">${esc(note)}</div>` : ''}
      ${alert ? `<div class="lc-alert">⚠ ${esc(alert)}</div>` : `<div class="lc-wx">${wxIcon(kind, 150, night)}${falling(kind)}</div>`}`,
  };
}

// The timers worth showing: ringing first, then the ones still going.
function liveTimers() {
  const rank = { done: 0, running: 1, paused: 2 };
  return timerSvc.timers().filter((t) => timerSvc.state(t) !== 'stopped' && !timerSvc.missed(t))
    .sort((a, b) => (rank[timerSvc.state(a)] - rank[timerSvc.state(b)]) || (timerSvc.left(a) - timerSvc.left(b)));
}
const RING = 2 * Math.PI * 54;
const ringOffset = (t) => {
  const whole = (t.secs || 0) * 1000;
  const part = whole ? Math.max(0, Math.min(1, timerSvc.left(t) / whole)) : 0;
  return (RING * (1 - part)).toFixed(1);
};
const ringText = (t) => (timerSvc.state(t) === 'done' ? 'Done' : timerSvc.fmt(timerSvc.left(t)));
function timersCard() {
  const list = liveTimers();
  if (!list.length) return head('Timers') + invite('Nothing ticking right now.', '+ New timer', spot.timer());
  const going = list.filter((t) => timerSvc.state(t) === 'running').length;
  const ringing = list.filter((t) => timerSvc.state(t) === 'done').length;
  const side = ringing ? 'Time’s up!' : going ? `${going} running` : 'Paused';
  const shown = list.slice(0, 2);
  return `${head('Timers', side)}
    <div class="lc-rings${shown.length === 1 ? ' one' : ''}">${shown.map((t) => {
    const st = timerSvc.state(t);
    const color = st === 'done' ? '#F0553A' : st === 'paused' ? '#B9A9A0' : '#F2A64A';
    return `<div class="lc-ring" data-timer="${esc(t.id)}">
        <svg width="130" height="130" viewBox="0 0 130 130" aria-hidden="true"><circle cx="65" cy="65" r="54" fill="none" stroke="rgba(255,255,255,.15)" stroke-width="12"/>
          <circle data-arc cx="65" cy="65" r="54" fill="none" stroke="${color}" stroke-width="12" stroke-linecap="round" stroke-dasharray="${RING.toFixed(1)}" stroke-dashoffset="${st === 'done' ? 0 : ringOffset(t)}" transform="rotate(-90 65 65)"/></svg>
        <div class="lc-ring-time" data-left>${ringText(t)}</div>
        <div class="lc-ring-name">${esc(t.label || 'Timer')}${st === 'paused' ? ' · paused' : ''}</div>
      </div>`;
  }).join('')}</div>
    <div class="lc-go">${list.length > 2 ? `+${list.length - 2} more · see them all` : '+ New timer'}</div>`;
}

function shoppingCard(l) {
  const items = l.extras.filter((x) => !x.got).map((x) => extraText(x));
  l.sections.forEach((s) => s.items.forEach((x) => { if (!x.got) items.push(x.name); }));
  const got = l.extras.filter((x) => x.got).length + l.sections.reduce((n, s) => n + s.items.filter((x) => x.got).length, 0);
  if (!items.length) {
    return head('Shopping list') + invite(got ? 'Everything is ticked off.' : 'Nothing on the list yet.', '+ Add something', spot.groceryBag());
  }
  const room = 6;
  const shown = items.length > room ? items.slice(0, room - 1) : items;
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  return `${head('Shopping list', `${items.length} to get`)}
    <div class="lc-sub">${l.recipes ? `With what ${plural(l.recipes, 'planned meal needs', 'planned meals need')}` : got ? `${got} ticked off so far` : 'Added by hand'}</div>
    <div class="lc-rows">${shown.map((t) => `<div class="lc-item"><i></i><span>${esc(cap(String(t)))}</span></div>`).join('')}
      ${items.length > room ? `<div class="lc-item more">and ${items.length - shown.length} more</div>` : ''}</div>`;
}

function planSub() {
  const n = weekRecipeIds().length;
  return n ? plural(n, 'meal planned this week', 'meals planned this week') : 'Browse and plan the week';
}
// t: what tonight() found (or null).
function recipesCard(t) {
  let label = 'Tonight';
  let title = '';
  const mark = markFor(getPlan(), dayKey(new Date()), 'dinner');
  if (t && t.planned) title = t.entry.t;
  else if (mark === 'out') title = 'Eating out';
  else if (mark === 'leftovers') title = 'Leftovers';
  else if (t) { label = 'An idea for tonight'; title = t.entry.t; }
  if (!title) return head('Recipes') + invite('What’s for dinner?', 'Browse the recipes', foodArt.dinner('#B5502E', '#8E3A1C'));
  return `${head('Recipes')}
    <div class="lc-sub">${label}</div>
    <div class="lc-dish">${esc(title)}</div>
    <div class="lc-sub" style="margin-top:8px">${esc(planSub())}</div>
    <div class="lc-food">${foodArt.dinner('#B5502E', '#8E3A1C')}</div>`;
}

function messagesCard() {
  const list = loadMessages();
  if (!list.length) return head('Messages') + invite('No notes yet.', 'Leave the first one', spot.noteBoard());
  const unread = list.filter((m) => !m.seen).length;
  const m = list[0];
  const text = String(m.text || '').trim() || (m.photo ? 'Sent a photo' : '');
  return `${head('Messages', unread ? `${unread} new` : '')}
    <div class="lc-who">${m.who ? avatar(m.who, 44) : ''}<div style="min-width:0"><div class="lc-who-name">${esc(m.who || 'A note')}</div><div class="lc-who-when">${esc(noteWhen(m.at))}</div></div></div>
    <div class="lc-note">${esc(text)}</div>
    ${list.length > 1 ? `<div class="lc-foot">${plural(list.length, 'note', 'notes')} on the board</div>` : ''}`;
}

// With no photos yet, the card goes where they are added rather than to an empty Gallery.
const galleryHref = () => (isTablet() && !getPhotos().length ? '#/addphotos' : '#/photos');
function galleryCard() {
  if (!isTablet()) {
    // A PC preview has no album: the sample pictures, and it says so.
    const p = samplePhotos[0];
    return `<div class="lc-photo" style="background:${p ? p.art : '#222'}"></div>
      <div class="lc-photo-text">${head('Gallery', plural(samplePhotos.length, 'photo', 'photos'))}<div class="lc-sub">Sample pictures (preview on a computer)</div></div>`;
  }
  const all = getPhotos();
  if (!all.length) return head('Gallery') + invite('Your photos will live here.', 'Add from your phone', spot.phoneToTablet());
  const p = all.filter((x) => !x.video)[0];
  return `<div class="lc-photo" data-photo="${p ? esc(p.src) : ''}"></div>
    <div class="lc-photo-text">${head('Gallery', plural(all.length, 'photo', 'photos'))}<div class="lc-sub">Newest: ${esc(all[0].caption || `added ${String(all[0].day || '').toLowerCase()}`)}</div></div>`;
}

function appsSub() {
  const apps = getApps();
  if (!apps.length) return 'YouTube, Spotify & more';
  const names = apps.slice(0, 2).map((a) => a.label).join(', ');
  return apps.length > 2 ? `${names} & ${apps.length - 2} more` : names;
}

// The apps that only need a door: a big picture of what they are and one line.
const ICON = {
  plan: '<rect x="3.5" y="4" width="17" height="16" rx="3"/><path d="M3.5 9h17M9 9v11M15 9v11"/>',
  camera: '<path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  convert: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>',
  apps: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.8"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.8"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.8"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.8"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
};
const doorCard = (name, icon, line) => `${head(name)}
    <div class="lc-door"><svg width="150" height="150" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[icon]}</svg></div>
    ${line ? `<div class="lc-door-line">${esc(line)}</div>` : ''}`;
function planLine() {
  const n = weekRecipeIds().length;
  return n ? plural(n, 'meal planned this week', 'meals planned this week') : 'Plan the week’s meals';
}

const CARDS = [
  { id: 'calendar', href: '#/calendar', bg: '#F4F0FA', ink: '#2A2440', soft: '#6A5E86' },
  { id: 'weather', href: '#/forecast', bg: 'linear-gradient(180deg,#5E6E88 0%,#93A2B6 60%,#B9C4D2 100%)', ink: '#FFFFFF', soft: '#E8EDF3' },
  { id: 'shopping', href: '#/shopping', bg: '#FFFDF6', ink: '#23301E', soft: '#5E7A4E' },
  { id: 'timers', href: '#/timers', bg: 'linear-gradient(180deg,#3A2A2A,#24181A)', ink: '#FFFFFF', soft: '#E8C8B8' },
  { id: 'recipes', href: '#/recipes', bg: 'linear-gradient(180deg,#E2703A,#A8401E)', ink: '#FFFFFF', soft: '#FFE2C8' },
  { id: 'messages', href: '#/messages', bg: '#FCEBB0', ink: '#3A2E10', soft: '#7A6222' },
  { id: 'photos', href: '#/photos', bg: '#15171E', ink: '#FFFFFF', soft: '#C9CFD6' },
  { id: 'plan', href: '#/plan', bg: '#2F6B4F', ink: '#FFFFFF', soft: '#CDE8D8', door: () => doorCard('Week plan', 'plan', planLine()) },
  { id: 'camera', href: '#/camera', bg: '#2C2C30', ink: '#FFFFFF', soft: '#C9C9CF', feature: 'camera', door: () => doorCard('Camera', 'camera', '') },
  { id: 'convert', href: '#/convert', bg: '#4B4A9E', ink: '#FFFFFF', soft: '#D8D7F5', door: () => doorCard('Conversions', 'convert', 'Cups, grams, oven') },
  { id: 'apps', href: '#/apps', bg: '#1E1E22', ink: '#FFFFFF', soft: '#C9C9CF', feature: 'apps', door: () => doorCard('Apps', 'apps', appsSub()) },
  { id: 'settings', href: '#/settings', bg: '#E9E9EE', ink: '#1C1C1E', soft: '#6E6E73', door: () => doorCard('Settings', 'settings', '') },
];

export function mount(el) {
  const c = clockParts();
  const unread = loadMessages().filter((m) => !m.seen).length;
  const night = display().night;

  const shown = CARDS.filter((k) => !k.feature || feature(k.feature));

  el.innerHTML = `
  <style>
    .lc-root{position:absolute;top:0;right:0;bottom:0;left:0;color:#FFFFFF;display:flex;flex-direction:column;
      background:radial-gradient(1200px 700px at 50% 30%,#4A3A5E 0%,#231B30 70%)}
    .lc-top{padding:26px 40px 0;flex:none}
    .lc-hint{font-size:20px;color:#D9CDE8;white-space:nowrap}
    .lc-clock{text-align:right;flex:none;margin-left:10px}
    .lc-clock .d{font:500 16px Inter,sans-serif;color:#D9CDE8;white-space:nowrap}
    .lc-clock .t{font:500 30px/1.1 Outfit,sans-serif;white-space:nowrap}
    .lc-clock .t span+span{font-size:17px;margin-left:6px;color:#D9CDE8}

    /* The row of cards. It is moved by a finger here (not the browser's own scrolling, which
       on the tablets flung past several cards at once): one swipe, one card. */
    .lc-row{flex:1;min-height:0;display:flex;align-items:center;overflow:hidden;touch-action:pan-y}
    .lc-track{display:flex;align-items:center}
    .lc-track.moving{will-change:transform}
    .lc-card.far{visibility:hidden}
    .lc-track.glide{transition:transform .32s cubic-bezier(.2,.8,.2,1)}
    .lc-pad{flex:none;width:${(1280 - CARD_W) / 2}px;height:1px}
    .lc-card{flex:none;width:${CARD_W}px;height:500px;margin-right:${CARD_GAP}px;border-radius:32px;position:relative;overflow:hidden;
      box-sizing:border-box;padding:24px 26px;text-decoration:none;display:flex;flex-direction:column;
      box-shadow:0 4px 10px rgba(0,0,0,.25);transform:scale(.9);opacity:.72;transition:transform .25s ease,opacity .25s ease}
    .lc-card.on{transform:scale(1);opacity:1}
    .lc-card:last-of-type{margin-right:0}
    .lc-head{display:flex;align-items:baseline;flex:none}
    .lc-name{font:700 27px Outfit,sans-serif;white-space:nowrap}
    .lc-side{margin-left:auto;padding-left:10px;font:600 17px Inter,sans-serif;color:var(--soft);white-space:nowrap}
    .lc-sub{font:500 16px/1.3 Inter,sans-serif;color:var(--soft);margin-top:3px;flex:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .lc-rows{margin-top:12px;min-height:0;flex:1;overflow:hidden}
    .lc-go{position:absolute;left:26px;right:26px;bottom:24px;min-height:58px;border-radius:18px;display:flex;align-items:center;justify-content:center;
      font:600 18px Inter,sans-serif;background:rgba(127,127,127,.2)}
    .lc-invite{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding-bottom:70px;min-height:0}
    .lc-invite-art{width:190px;height:120px;display:flex;align-items:center;justify-content:center;overflow:hidden;border-radius:22px}
    .lc-invite-art svg{width:190px !important;height:120px !important}
    .lc-invite-line{font-size:23px;line-height:1.25;margin-top:12px}

    .lc-ev{display:flex;flex-direction:column;justify-content:center;height:64px;border-top:1.5px solid rgba(42,36,64,.12)}
    .lc-ev:first-child{border-top:0}
    .lc-ev b{font:600 15px Inter,sans-serif;letter-spacing:.4px;color:#B5502E;white-space:nowrap}
    .lc-ev span{font:500 20px Inter,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

    .lc-temp{font:300 104px/1 Outfit,sans-serif;margin-top:12px;flex:none}
    .lc-line{font:500 21px/1.25 Inter,sans-serif;margin-top:6px;flex:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .lc-wx{position:absolute;left:26px;bottom:8px;width:150px;height:140px}
    .lc-fall{position:absolute;left:0;top:84px;overflow:hidden}
    .lc-drops{animation:lc-drop 1.4s linear infinite}
    .lc-drops.slow{animation-duration:4s}
    .lc-alert{position:absolute;left:26px;right:26px;bottom:24px;min-height:58px;border-radius:18px;background:#C2331F;color:#FFFFFF;
      display:flex;align-items:center;justify-content:center;text-align:center;padding:8px 14px;box-sizing:border-box;font:600 18px/1.25 Inter,sans-serif}
    @keyframes lc-drop{from{transform:translateY(-16px)}to{transform:translateY(34px)}}

    .lc-rings{display:flex;justify-content:space-between;margin-top:20px}
    .lc-rings.one{justify-content:center}
    .lc-ring{position:relative;width:136px;text-align:center}
    .lc-ring-time{position:absolute;left:0;right:0;top:48px;font:700 26px Outfit,sans-serif;font-variant-numeric:tabular-nums}
    .lc-ring-name{font:600 17px Inter,sans-serif;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

    .lc-item{display:flex;align-items:center;height:42px;font:500 20px Inter,sans-serif}
    .lc-item i{flex:none;width:26px;height:26px;border-radius:8px;border:2.5px solid #A8B89A;box-sizing:border-box;margin-right:14px}
    .lc-item span{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .lc-item.more{color:#5E7A4E;font-weight:600;font-size:18px;padding-left:40px}

    .lc-dish{font:700 30px/1.15 Outfit,sans-serif;margin-top:4px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow-wrap:anywhere}
    .lc-food{position:absolute;left:50px;right:50px;bottom:-14px;height:132px}
    .lc-food svg{width:100%;height:100%}

    .lc-who{display:flex;align-items:center;margin-top:16px;flex:none}
    .lc-who>span{margin-right:12px}
    .lc-who-name{font:600 20px Inter,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .lc-who-when{font:500 15px Inter,sans-serif;color:var(--soft)}
    .lc-note{font-family:Fraunces,Georgia,serif;font-style:italic;font-size:25px;line-height:1.3;margin-top:16px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:5;-webkit-box-orient:vertical;overflow-wrap:anywhere}
    .lc-foot{position:absolute;left:26px;right:26px;bottom:22px;font:500 16px Inter,sans-serif;color:var(--soft)}

    .lc-photo{position:absolute;top:0;right:0;left:0;height:278px;background-size:cover;background-position:center;background-color:#262A35}
    .lc-photo-text{position:absolute;left:26px;right:26px;top:292px}

    .lc-dots{flex:none;height:26px;display:flex;justify-content:center;align-items:center}
    .lc-dots span{width:10px;height:10px;border-radius:5px;background:rgba(255,255,255,.35);margin:0 5px}
    .lc-dots span.on{width:34px;background:#FFFFFF}

    .lc-door{flex:1;display:flex;align-items:center;justify-content:center;color:var(--soft);min-height:0}
    .lc-door-line{flex:none;font:500 20px Inter,sans-serif;color:var(--soft);text-align:center;padding-bottom:6px}
    @media (prefers-reduced-motion: reduce){.lc-drops{animation:none}.lc-card{transition:none}}
  </style>
  <div class="lc-root">
    <div class="lc-top">${topBar({
    title: 'Apps', back: '#/home', backLabel: '← Home', tone: 'dark',
    right: `<div class="lc-clock"><div class="d" data-date>${c.date}</div><div class="t"><span data-time>${c.time}</span><span data-ampm${c.ampm ? '' : ' style="display:none"'}>${c.ampm}</span></div></div>`,
  })}</div>
    <div class="lc-row" data-row><div class="lc-track" data-track>
      <div class="lc-pad"></div>
      ${shown.map((k) => `<a class="lc-card" data-card="${k.id}" href="${k.href}" style="background:${k.bg};color:${k.ink};--soft:${k.soft}"></a>`).join('')}
      <div class="lc-pad"></div>
    </div></div>
    <div class="lc-dots" data-dots>${shown.map(() => '<span></span>').join('')}</div>
  </div>`;

  const $ = (s) => el.querySelector(s);
  const card = (id) => $(`[data-card="${id}"]`);
  const fill = (id, html) => { const box = card(id); if (box) box.innerHTML = html; };

  // ---- The carousel: which card is in the middle ----
  const row = $('[data-row]');
  const cards = Array.prototype.slice.call(el.querySelectorAll('.lc-card'));
  const dots = Array.prototype.slice.call($('[data-dots]').children);
  let middle = -1;
  const setMiddle = (i) => {
    i = Math.max(0, Math.min(cards.length - 1, i));
    if (i === middle) return;
    if (middle >= 0) { cards[middle].classList.remove('on'); dots[middle].classList.remove('on'); }
    middle = i;
    cards[i].classList.add('on');
    dots[i].classList.add('on');
    // Only the cards on screen (and the next one each side) are drawn: the tablet was
    // painting all twelve every time the menu opened.
    cards.forEach((c, k) => c.classList.toggle('far', Math.abs(k - i) > 3));
  };
  // Timers going? Start there. Otherwise the shopping list, with a card either side.
  const startAt = liveTimers().length ? 3 : 2;
  const track = $('[data-track]');
  let still = 0;
  const place = (x, glide) => {
    track.classList.toggle('glide', !!glide);
    // A layer of its own only while it moves (a layer four screens wide costs a lot to keep).
    track.classList.add('moving');
    clearTimeout(still);
    still = setTimeout(() => track.classList.remove('moving'), 450);
    track.style.transform = `translate3d(${Math.round(x)}px,0,0)`;
  };
  const goTo = (i, glide = true) => { setMiddle(i); place(-middle * STEP, glide); };
  goTo(startAt, false);
  // A finger on the row: the cards follow it; let go and they settle one card along (or
  // back, for a short drag). Up and down is left to the screen.
  let drag = null;
  let draggedAt = 0;
  row.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) { drag = null; return; }
    drag = { x: e.touches[0].clientX, y: e.touches[0].clientY, at: Date.now(), dx: 0, side: null };
  }, { passive: true });
  row.addEventListener('touchmove', (e) => {
    if (!drag) return;
    const scale = row.getBoundingClientRect().width / row.offsetWidth || 1; // the screen is scaled up 1.5x on the tablet
    const dx = (e.touches[0].clientX - drag.x) / scale;
    const dy = (e.touches[0].clientY - drag.y) / scale;
    if (!drag.side) { if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return; drag.side = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'; }
    if (drag.side !== 'x') return;
    e.preventDefault();
    // At either end the row gives a little, then stops.
    const edge = (middle === 0 && dx > 0) || (middle === cards.length - 1 && dx < 0);
    drag.dx = edge ? dx / 3 : dx;
    place(-middle * STEP + drag.dx, false);
  }, { passive: false });
  const letGo = () => {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (d.side !== 'x') return;
    draggedAt = Date.now();
    const quick = Date.now() - d.at < 250 && Math.abs(d.dx) > 30; // a flick
    const step = Math.abs(d.dx) > STEP / 4 || quick ? (d.dx < 0 ? 1 : -1) : 0;
    goTo(middle + step);
  };
  row.addEventListener('touchend', letGo, { passive: true });
  row.addEventListener('touchcancel', letGo, { passive: true });
  // A swipe is not a tap: the card under the finger doesn't open. A tap on a side card
  // brings it to the middle first.
  row.addEventListener('click', (e) => {
    const c = e.target instanceof Element ? e.target.closest('.lc-card') : null;
    if (Date.now() - draggedAt < 400) { e.preventDefault(); e.stopPropagation(); return; }
    const i = cards.indexOf(c);
    if (c && i !== middle) { e.preventDefault(); goTo(i); }
  }, true);
  // The dots: tap one to go there.
  $('[data-dots]').addEventListener('click', (e) => {
    const i = dots.indexOf(e.target);
    if (i >= 0) goTo(i);
  });

  // Wipe the screen: touches off for half a minute so the glass can be cleaned.
  // The cards that are only a door are drawn once.
  shown.forEach((k) => { if (k.door) fill(k.id, k.door()); });

  // ---- Calendar, notes, photos: read straight from this screen's own storage ----
  const showCalendar = () => fill('calendar', calendarCard());
  const showNotes = () => {
    fill('messages', messagesCard());
  };
  const showGallery = () => {
    const box = card('photos');
    box.innerHTML = galleryCard();
    box.setAttribute('href', galleryHref());
    // The newest photo, as a small copy (the full picture is far too big for a card).
    const pic = box.querySelector('[data-photo]');
    const src = pic && pic.getAttribute('data-photo');
    if (src) {
      thumbnail(src, { w: 340, h: 278, wanted: () => el.isConnected && pic.isConnected }).then((url) => {
        if (url && pic.isConnected) pic.style.backgroundImage = `url("${url}")`;
      }).catch(() => {});
    }
  };
  showCalendar();
  showNotes();
  showGallery();

  // ---- Recipes and the shopping list ----
  const showRecipes = () => tonight().catch(() => null).then((t) => { if (el.isConnected) fill('recipes', recipesCard(t)); });
  const showShopping = () => buildShoppingList().then((l) => { if (el.isConnected) fill('shopping', shoppingCard(l)); })
    .catch(() => { if (el.isConnected) fill('shopping', head('Shopping list') + invite('The list is one tap away.', 'Open the list', spot.groceryBag())); });
  fill('recipes', head('Recipes'));
  fill('shopping', head('Shopping list'));
  showRecipes();
  showShopping();
  // Something was added from a phone while the menu is open: the cards follow.
  // (A few changes in a row are counted once.)
  let kitchenWait = 0;
  const offChanges = onKitchenChanged(() => {
    clearTimeout(kitchenWait);
    kitchenWait = setTimeout(() => { if (el.isConnected) { showShopping(); showRecipes(); } }, 300);
  });
  offKitchen = () => { clearTimeout(kitchenWait); offChanges(); };

  // ---- Timers: the rings count down once a second, only while something is going ----
  let timerShape = '';
  const shapeNow = () => liveTimers().map((t) => `${t.id}:${timerSvc.state(t)}`).join(',');
  const showTimers = () => { timerShape = shapeNow(); fill('timers', timersCard()); };
  const second = () => {
    if (!el.isConnected || document.hidden) return;
    if (shapeNow() !== timerShape) { showTimers(); return; } // one finished, or dropped off
    if (!timerShape) return;
    const box = card('timers');
    liveTimers().slice(0, 2).forEach((t) => {
      const ring = box.querySelector(`[data-timer="${t.id}"]`);
      if (!ring || timerSvc.state(t) !== 'running') return;
      ring.querySelector('[data-left]').textContent = ringText(t);
      ring.querySelector('[data-arc]').setAttribute('stroke-dashoffset', ringOffset(t));
    });
  };
  showTimers();
  secTimer = setInterval(second, 1000);
  offTimers = timerSvc.onTimersChanged(() => { if (el.isConnected) showTimers(); });

  // ---- The clock turns over exactly on the minute. At midnight the date and the cards
  // (what's next on the calendar, tonight's dinner) move on too. ----
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
      showCalendar();
      showNotes();
      showRecipes();
      showShopping();
    }
    timer = setTimeout(tick, 60000 - (Date.now() % 60000) + 30);
  };
  timer = setTimeout(tick, 60000 - (Date.now() % 60000) + 30);
  onWake = () => { if (!document.hidden) { tick(); second(); } };
  document.addEventListener('visibilitychange', onWake);

  // Notes and photos arrive from phones while the menu is open: keep the cards current.
  offNotes = onMessagesChanged(() => { if (el.isConnected) showNotes(); });
  offPhotos = onPhotosChanged(() => { if (el.isConnected) showGallery(); });

  // ---- Weather: today's saved one at once, the fresh one when it arrives ----
  const showWeather = (w, more) => {
    const k = weatherCard(w, more);
    const box = card('weather');
    box.style.background = k.look.bg;
    box.style.color = k.look.ink;
    box.style.setProperty('--soft', k.look.soft);
    box.innerHTML = k.html;
  };
  const early = savedWeather();
  if (early) showWeather(early);
  else fill('weather', `${head('Weather')}<div class="lc-invite"><div class="x-serif lc-invite-line">Looking outside…</div></div>`);
  let loading = false;
  async function loadWeather() {
    if (loading) return;
    loading = true;
    try {
      const loc = await getLocation();
      const w = await getWeather(loc);
      if (!el.isConnected) return;
      showWeather(w);
      const alerts = await getAlerts(loc).catch(() => []);
      if (!el.isConnected) return;
      // A warning takes the picture's place, in red: easy to spot from across the kitchen.
      if (alerts.length) showWeather(w, { alert: alerts[0].event });
    } catch (err) {
      console.error(err);
      if (!el.isConnected) return;
      // No internet: today's last forecast beats an empty card (and says from when).
      const old = savedWeather();
      if (old) showWeather(old, { note: `from ${timeText(new Date(old.at))}` });
      else fill('weather', head('Weather') + invite('No internet right now.', 'Open Weather', wxIcon('cloud', 120)));
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
  clearInterval(secTimer);
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  offNotes?.();
  offPhotos?.();
  offKitchen?.();
  offTimers?.();
  offNotes = offPhotos = offKitchen = offTimers = null;
  if (onWake) document.removeEventListener('visibilitychange', onWake);
  if (onOnline) { window.removeEventListener('online', onOnline); window.removeEventListener('place-changed', onOnline); }
  onWake = onOnline = null;
}
