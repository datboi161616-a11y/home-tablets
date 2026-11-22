import { installCompat } from './compat.js';
import { profile } from './config.js';
import * as placeholder from './screens/placeholder.js';
import { welcomeDone } from './services/welcome-state.js';
import { tutorialRunning } from './services/tutorial.js';
import { siteAnswers } from './services/online.js';
import { BUILD } from './build.js';
import { cameFrom } from './services/nav.js';
import { display, isNightNow, dayBrightness, nightBrightness } from './services/display.js';
import * as notices from './services/notices.js';
import { noteTrouble } from './services/trouble.js';
import { wiping } from './services/wipe.js';

// Whatever goes wrong is written in the screen's own diary (Settings → Wi-Fi & about), so
// whoever looks after it can see what happened and when.
addEventListener('error', (e) => { if (e.message) noteTrouble(`${e.message}${e.filename ? ` (${String(e.filename).split('/').pop()}:${e.lineno})` : ''}`, location.hash.replace(/^#\/?/, '').split('/')[0]); });
addEventListener('unhandledrejection', (e) => { noteTrouble(`${(e.reason && (e.reason.message || e.reason)) || 'A request failed'}`, location.hash.replace(/^#\/?/, '').split('/')[0]); });

// Was sw.js already keeping copies when this page started? (Not on the very first start.)
const startedWithCopies = !!(navigator.serviceWorker && navigator.serviceWorker.controller);

const screenEl = document.getElementById('screen');
installCompat(screenEl);

// ---- Scale the 1280x800 canvas to fill the display (1.5x on the TB-X606F) ----
function fit() {
  const s = Math.min(innerWidth / 1280, innerHeight / 800);
  screenEl.style.transform = `scale(${s})`;
}
addEventListener('resize', fit);
fit();

// ---- Touch: every tap is felt, and every tap counts ----
// 1. Whatever can be tapped reacts the moment a finger lands on it (css/base.css,
//    .is-pressed), so nobody wonders whether the tap was felt while the next screen is
//    being put together.
// 2. The browser only counts a tap when the finger hardly moves (about 1.5 mm on this
//    screen) and lifts within half a second. A firm press on a kitchen screen often does
//    neither, and the tap was simply lost: measured on a real tablet, nothing happened at
//    all. Those taps are counted here instead.
const PRESS_MIN_MS = 180; // even the quickest tap shows for this long
const PRESS_WAIT_MS = 70; // inside a list that scrolls: wait a moment, it may be a swipe
const TAP_MAX_MS = 1500;  // held longer than this it is no tap (the grown-up menu is a 5 s hold)
const TAP_ROOM_PX = 24;   // how far the finger may roll; inside a list that scrolls, 8
let pressed = null;       // the element showing as pressed
let pressedAt = 0;
let pressTimer = 0;
let finger = null;        // the touch in progress: { el, target, x, y, at, room, scrollers }
let lastRealClick = 0;    // when the browser last delivered a click of its own
let stoodIn = false;      // we clicked for the browser: should its own click still turn up, drop it

// The thing a tap on `target` would work: a link or button, or whatever was given the
// pointing-hand cursor (that is inherited, so climb to the element that set it).
function tappable(target) {
  let found = null;
  for (let el = target instanceof Element ? target : null; el && el !== screenEl && el !== document.body; el = el.parentElement) {
    if (el.matches('a[href], button, summary, label, select, [role="button"]')) { found = el; break; }
    if (getComputedStyle(el).cursor === 'pointer') found = el;
    else if (found) break;
  }
  if (!found || found.disabled || found.getAttribute('aria-disabled') === 'true') return null;
  // Not a whole screen: the night clock and the photo frame are one big "tap anywhere".
  const r = found.getBoundingClientRect();
  return r.width * r.height > innerWidth * innerHeight * 0.45 ? null : found;
}
// The lists around `el` that can scroll, with where each one is now.
function scrollersOf(el) {
  const list = [];
  for (let p = el.parentElement; p && p !== screenEl && p !== document.body; p = p.parentElement) {
    if (p.scrollHeight <= p.clientHeight + 4 && p.scrollWidth <= p.clientWidth + 4) continue;
    const style = getComputedStyle(p);
    if (/auto|scroll/.test(style.overflowY + style.overflowX)) list.push([p, p.scrollTop, p.scrollLeft]);
  }
  return list;
}
// Is this colour dark? ("rgb(29, 36, 48)" yes, white or see-through no.)
function isDark(color) {
  const m = /rgba?\((\d+), ?(\d+), ?(\d+)(?:, ?([\d.]+))?/.exec(color);
  if (!m || (m[4] !== undefined && +m[4] < 0.5)) return false;
  return 0.299 * m[1] + 0.587 * m[2] + 0.114 * m[3] < 90;
}
function showPress(el) {
  pressed = el;
  pressedAt = performance.now();
  const style = getComputedStyle(el);
  el.classList.add('is-pressed');
  // Dark buttons light up instead of going darker, or nothing would show.
  if (isDark(style.backgroundColor)) el.classList.add('is-pressed-dark');
  // And it sinks in, unless it is already placed with a transform of its own.
  if (style.transform === 'none') el.classList.add(Math.max(el.offsetWidth, el.offsetHeight) > 260 ? 'is-pressed-big' : 'is-pressed-small');
}
function endPress(atOnce) {
  clearTimeout(pressTimer);
  const el = pressed;
  pressed = null;
  if (!el) return;
  const off = () => el.classList.remove('is-pressed', 'is-pressed-dark', 'is-pressed-big', 'is-pressed-small');
  if (atOnce) off(); else setTimeout(off, Math.max(0, PRESS_MIN_MS - (performance.now() - pressedAt)));
}
function dropFinger() { finger = null; endPress(true); }
const QUIET = { capture: true, passive: true }; // only watching: never holds up scrolling

addEventListener('touchstart', (e) => {
  dropFinger();
  stoodIn = false;
  if (e.touches.length !== 1) return;
  const el = tappable(e.target);
  if (!el) return;
  const t = e.touches[0];
  const scrollers = scrollersOf(el);
  finger = { el, target: e.target, x: t.clientX, y: t.clientY, at: performance.now(), room: scrollers.length ? 8 : TAP_ROOM_PX, scrollers };
  if (!scrollers.length) showPress(el);
  else pressTimer = setTimeout(() => { if (finger && finger.el === el) showPress(el); }, PRESS_WAIT_MS);
}, QUIET);
addEventListener('touchmove', (e) => {
  if (!finger) return;
  const t = e.touches[0];
  if (e.touches.length !== 1 || Math.hypot(t.clientX - finger.x, t.clientY - finger.y) > finger.room) dropFinger(); // a swipe
}, QUIET);
addEventListener('touchend', (e) => {
  const f = finger;
  if (!f) return;
  finger = null;
  const t = e.changedTouches[0];
  const tap = e.touches.length === 0 && performance.now() - f.at <= TAP_MAX_MS
    && Math.hypot(t.clientX - f.x, t.clientY - f.y) <= f.room
    && f.scrollers.every(([list, top, left]) => list.scrollTop === top && list.scrollLeft === left);
  if (!tap) { endPress(true); return; }
  if (pressed !== f.el) showPress(f.el); // lifted before the wait was over: a tap after all
  endPress(false);
  // The browser's own click normally follows at once. When it doesn't (see 2. above), click for it.
  setTimeout(() => {
    if (lastRealClick >= f.at || !f.target.isConnected) return;
    stoodIn = true;
    f.target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, clientX: f.x, clientY: f.y }));
  }, 80);
}, QUIET);
addEventListener('touchcancel', dropFinger, QUIET);
addEventListener('click', (e) => {
  if (!e.isTrusted) return;
  if (stoodIn) { stoodIn = false; e.preventDefault(); e.stopImmediatePropagation(); return; } // already done
  lastRealClick = performance.now();
}, true);
// A long press is a tap here, not a request for the browser's own menu (typing boxes keep theirs).
addEventListener('contextmenu', (e) => { if (!(e.target instanceof Element && e.target.closest('input, textarea'))) e.preventDefault(); }, true);
// With a mouse (previewing on a PC): only the pressed look.
addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'mouse' || e.button !== 0) return;
  endPress(true);
  const el = tappable(e.target);
  if (el) showPress(el);
}, true);
addEventListener('pointerup', (e) => { if (e.pointerType === 'mouse') endPress(false); }, true);

// ---- Screens, loaded on demand. Add a new screen = add one line here. ----
const FAMILY = {
  home: 'Home', launcher: 'Menu', recipes: 'Recipes', calendar: 'Calendar', forecast: 'Weather',
  messages: 'Messages', shopping: 'Shopping list', timers: 'Timers', plan: 'Week plan', dish: 'Recipe',
  recipe: 'Cooking mode', myrecipe: 'My recipe', night: 'Night clock', settings: 'Settings', convert: 'Conversions',
};
// Tom · Space & Flight
const TOM = {
  bridge: 'Flight deck', flights: 'Planes overhead', departures: 'Departures', trivia: 'Trivia',
  alert: 'Sky alert', missions: 'Space missions', sky: "Tonight's sky",
  deepimage: 'Space image', viewscreen: 'Starfield', settings: 'Settings',
};
// Both (Tom's only when its extras are switched on)
const BOTH = { photos: 'Photo frame', apps: 'Apps', camera: 'Camera', addphotos: 'Add photos', welcome: 'Welcome', whatsnew: 'What’s new' };
const SCREENS = { ...FAMILY, ...TOM, ...BOTH };
// The screens this tablet can get to, most used first (see "Keep every screen on the device").
const OWN_SCREENS = Object.keys({ ...(profile === 'tom' ? TOM : FAMILY), ...BOTH });

export const homeRoute = profile === 'tom' ? 'bridge' : 'home';
// The hidden copy used for remote help shows nothing of its own and follows no clock.
function isGhostCopy() { try { return !!(window.TabletNative && window.TabletNative.isGhost && window.TabletNative.isGhost()); } catch (e) { return false; } }

let current = null;
let shownName = null; // the screen that is up now
let navId = 0;
let timerSvc = null; // kitchen timers (family tablets): the countdown chip on every screen
let lastBrightness = null; // what the backlight was last asked for

// The backlight for a screen: the owner's choices (Settings), night screens dimmed.
// A timer ringing on the night clock brings the light up enough to find the screen and
// read which one it is; it goes back down when the alarm is stopped.
function setBacklight(name) {
  const nightScreen = name === (profile === 'tom' ? 'viewscreen' : 'night');
  let brightness = nightScreen ? nightBrightness() : dayBrightness();
  if (nightScreen && timerSvc && timerSvc.ringingNames().length) brightness = Math.max(0.3, brightness);
  if (brightness === lastBrightness) return;
  lastBrightness = brightness;
  try { window.TabletNative?.setBrightness?.(brightness); } catch { /* not on a tablet */ }
}
addEventListener('alarm-changed', () => setBacklight(location.hash.replace(/^#\/?/, '').split('/')[0] || homeRoute));

async function navigate() {
  const id = ++navId;
  // "#/recipes/chinese/noodles" -> screen "recipes", args ['chinese', 'noodles']
  const parts = location.hash.replace(/^#\/?/, '').split('/').map((x) => { try { return decodeURIComponent(x); } catch (e) { return x; } });
  let name = parts[0] || homeRoute;
  // A brand-new tablet opens the welcome tour instead of Home until it's finished or skipped
  // (never in the hidden admin copy).
  const ghost = (() => { try { return !!(window.TabletNative && window.TabletNative.isGhost && window.TabletNative.isGhost()); } catch (e) { return false; } })();
  if (name === homeRoute && !ghost && !welcomeDone() && !tutorialRunning()) name = 'welcome';
  const args = parts.slice(1).filter(Boolean);
  let mod = placeholder;
  let failed = false; // its code couldn't be fetched: the placeholder says so and brings it back
  if (SCREENS[name]) {
    try { mod = await import(`./screens/${name}.js`); }
    catch (err) { console.error(`Screen "${name}" failed to load`, err); failed = true; noteTrouble(`The ${SCREENS[name]} screen couldn’t be fetched`, name); }
  }
  // A tap brought us here: let its pressed look reach the screen before the next screen is
  // built (building one keeps the tablet busy, and nothing is drawn meanwhile).
  if (performance.now() - pressedAt < 50) {
    await new Promise((done) => {
      const giveUp = setTimeout(done, 80); // no frames while the screen is off
      requestAnimationFrame(() => setTimeout(() => { clearTimeout(giveUp); done(); }, 0));
    });
  }
  if (id !== navId) return; // user navigated again while loading
  // Let the Android app know (shown as "Showing now" in the admin dashboard).
  try { window.TabletNative?.screenChanged?.(name); } catch { /* not on a tablet */ }
  // Night screens turn the real backlight down; everything else uses normal brightness.
  // (Only when it changes: every call makes Android lay the whole window out again.)
  setBacklight(name);

  cameFrom(shownName); // so "back" on the next screen leads to where they came from
  shownName = name;
  try { current?.unmount?.(); } catch (err) { console.error(err); }
  // Each visit gets its own container. When you leave, it's removed, so a screen's
  // late callbacks can check `el.isConnected` and stop touching a screen that's gone.
  screenEl.innerHTML = '';
  lifted = 0; // (see "Typing": the new screen starts where it belongs)
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;top:0;right:0;bottom:0;left:0';
  screenEl.appendChild(host);
  if (timerSvc && timerSvc.chip) { timerSvc.setRoute(name); screenEl.appendChild(timerSvc.chip); }
  if (notices.bar) { notices.setRoute(name); screenEl.appendChild(notices.bar); }
  current = mod;
  try { mod.mount(host, { name, args, title: SCREENS[name], homeRoute, failed }); }
  catch (err) {
    console.error(err);
    noteTrouble(`The ${SCREENS[name] || name} screen stopped while opening: ${(err && err.message) || err}`, name);
    // It stopped part-way: let it put away whatever it had already started.
    try { if (mod.unmount) mod.unmount(); } catch (e) { /* it never got that far */ }
    current = placeholder;
    host.innerHTML = '';
    placeholder.mount(host, { name, title: SCREENS[name], homeRoute, broken: true });
  }
  // A screen opened, so the next one that can't may start the page over again (placeholder.js).
  if (current !== placeholder) { try { sessionStorage.removeItem('screen-retry'); } catch (e) { /* storage off */ } }
}
addEventListener('hashchange', navigate);
navigate();

// ---- Typing: keep the box above the on-screen keyboard ----
// The tablet's keyboard slides up over the lower half of the screen, and nothing tells
// the page (seen on a real tablet: a new note's text box and its Post button were both
// underneath it). So when a box to type in gets the cursor, the whole screen is moved up
// until that box, and room for a row of buttons under it, sit in the part that stays visible.
const KEYBOARD = /Android/.test(navigator.userAgent); // only where a keyboard covers the screen
const KEYBOARD_CLEAR = 0.46; // the share of the screen's height that stays visible above it
let lifted = 0;              // how far up the screen has been moved, in its own pixels
function placeForTyping() {
  const host = screenEl.firstElementChild;
  if (!host) return;
  const at = document.activeElement;
  const typingIn = KEYBOARD && at && host.contains(at)
    && (at.tagName === 'TEXTAREA' || (at.tagName === 'INPUT' && !/^(range|checkbox|radio|button|file)$/.test(at.type)));
  let want = 0;
  if (typingIn) {
    const scale = screenEl.getBoundingClientRect().height / 800 || 1;
    const box = at.getBoundingClientRect();
    // Where the box would be with the screen in its usual place, in the screen's own pixels.
    const top = box.top / scale + lifted;
    const bottom = box.bottom / scale + lifted;
    const clear = (innerHeight * KEYBOARD_CLEAR) / scale;
    // Up far enough to show the box and about one row of buttons below it, but never so
    // far that the top of the box leaves the screen.
    want = Math.max(0, Math.min(top - 12, bottom + 130 - clear));
  }
  if (Math.abs(want - lifted) < 1) return;
  lifted = want;
  // (At once, no sliding: the keyboard is already on its way up.)
  host.style.transform = lifted ? `translateY(${-Math.round(lifted)}px)` : '';
}
addEventListener('focusin', placeForTyping);
addEventListener('focusout', () => setTimeout(placeForTyping, 80)); // the cursor may be moving to another box

// Settings were just saved on a phone (the family's name, degrees C or F...): draw the
// screens that show them again, so the phone's "updates right away" is true.
addEventListener('tablet-family', () => {
  if (['home', 'launcher', 'forecast', 'photos'].includes(screenName())) setTimeout(navigate, 50);
});

// The charger came out, or the Wi-Fi has been gone a while: a quiet word in the corner.
if (!isGhostCopy()) {
  notices.startNotices({ settingsRoute: 'settings', homeRoutes: [homeRoute, 'launcher'] });
  notices.setRoute(location.hash.replace(/^#\/?/, '').split('/')[0] || homeRoute);
  screenEl.appendChild(notices.bar);
}

// A note arrived from a phone: two soft notes, so somebody in the kitchen looks up
// (Settings → Screen & sound; never in the night clock's hours, never on Tom's deck).
if (profile !== 'tom' && !isGhostCopy()) {
  let unread = -1;
  const countUnread = () => import('./services/messages-data.js').then((m) => m.unreadCount()).catch(() => -1);
  countUnread().then((n) => { unread = n; });
  addEventListener('tablet-notes', () => {
    countUnread().then((n) => {
      const more = unread >= 0 && n > unread;
      unread = n;
      if (more && display().noteChime && !isNightNow() && timerSvc && timerSvc.softChime) timerSvc.softChime();
    });
  });
}

// The screens updated themselves since last time: a line in the diary, so "it changed on
// Tuesday" can be matched to a version by whoever looks after it.
try {
  const was = localStorage.getItem('build.last');
  if (BUILD !== 'dev' && was !== BUILD) {
    if (was) noteTrouble(`The screens updated themselves to version ${BUILD} (from ${was}). Nothing is wrong: this is only for the record.`, '');
    localStorage.setItem('build.last', BUILD);
  }
} catch (e) { /* storage off */ }

// Once a day: put away what is finished with in the screen's own storage (services/tidy.js).
if (!isGhostCopy()) import('./services/tidy.js').then((m) => m.startTidying()).catch(() => {});

// Family tablets: kitchen timers that ring on any screen.
if (profile !== 'tom') import('./services/timers.js').then((m) => {
  m.startTimers();
  timerSvc = m;
  m.setRoute(screenName());
  screenEl.appendChild(m.chip);
}).catch(() => {});
// Family tablets keep a copy of the shopping list for the phone page.
if (profile !== 'tom') import('./services/meal-plan.js').then((m) => m.startShoppingSync()).catch(() => {});
// ...and keep every recipe on the tablet, for when the Wi-Fi is down.
if (profile !== 'tom') setTimeout(() => import('./services/recipe-data.js').then((m) => m.prefetchAll()).catch(() => {}), 60 * 1000);

// ---- Offline support + pick up pushed updates ----
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');

// ---- Idle tracking (nobody touching the screen) ----
let lastTouch = Date.now();
['pointerdown', 'touchstart', 'keydown'].forEach((t) => addEventListener(t, () => { lastTouch = Date.now(); }, true));
const idleFor = (ms) => Date.now() - lastTouch > ms;
const screenName = () => location.hash.replace(/^#\/?/, '').split('/')[0] || homeRoute;
const isGhost = (() => { try { return !!(window.TabletNative && window.TabletNative.isGhost && window.TabletNative.isGhost()); } catch { return false; } })();
// Never yank someone out of these.
const BUSY = ['camera', 'recipe', 'myrecipe'];

// ---- Keep every screen on the device ----
// A screen's code is fetched the first time it is opened, and sw.js keeps a copy of
// whatever was fetched. Fetching the rest quietly after every start means each screen
// opens at once, opens when the Wi-Fi is down, and matches the version that is running.
const pause = (ms) => new Promise((done) => setTimeout(done, ms));
const LOOK_AGAIN_MS = 5 * 60 * 1000;

// The very first start ran before sw.js was keeping copies, so nothing it loaded was
// kept: the page, the styles, the fonts, the first screen. Fetch those once more.
async function keepFirstFiles() {
  if (startedWithCopies || !window.caches || !navigator.serviceWorker || !navigator.serviceWorker.controller) return;
  const urls = [location.href.split('#')[0]];
  for (const entry of performance.getEntriesByType('resource')) urls.push(entry.name);
  for (const url of new Set(urls)) {
    try {
      const u = new URL(url);
      const ours = u.origin === location.origin ? !u.pathname.includes('/__tablet/') : u.host.includes('fonts.g');
      if (/^https?:$/.test(u.protocol) && ours && !(await caches.match(url))) await fetch(url);
    } catch (err) { /* it is fetched and kept on the next start anyway */ }
  }
}

async function keepScreens() {
  // Only while the site answers. A screen that fails to fetch stays failed until the
  // page starts over, so with the Wi-Fi down it is better not to ask at all.
  if (!(await siteAnswers())) { setTimeout(keepScreens, LOOK_AGAIN_MS); return; }
  await keepFirstFiles();
  for (const name of OWN_SCREENS) {
    while (!idleFor(4000)) await pause(2000); // someone is using the screen: stay out of the way
    try { await import(`./screens/${name}.js`); }
    catch (err) {
      // The Wi-Fi went mid-way? Then stop here and pick it up again later.
      if (!(await siteAnswers())) { setTimeout(keepScreens, LOOK_AGAIN_MS); return; }
    }
    await pause(1500);
  }
  // ...and the letters: a font is only fetched when some screen first shows it.
  const fonts = new Set();
  for (const face of document.fonts) fonts.add(`${String(face.weight).split(' ')[0]} 16px "${face.family.replace(/["']/g, '')}"`);
  for (const font of fonts) { try { await document.fonts.load(font); } catch (err) { /* next start */ } }
}
if (!isGhost) setTimeout(keepScreens, 20 * 1000);

// Family tablets keep the forecast too. The Weather screen shows its last one when the
// Wi-Fi is down (and says from when), but only had one if somebody opened it lately.
function keepForecast() {
  Promise.all([import('./services/location.js'), import('./services/forecast-data.js')])
    .then(([place, forecast]) => place.getLocation().then((loc) => forecast.getForecast(loc)))
    .catch(() => { /* offline: the one it has stays */ });
}
if (profile !== 'tom' && !isGhost) {
  setTimeout(keepForecast, 90 * 1000);
  setInterval(keepForecast, 3 * 60 * 60 * 1000);
}

// ---- Picking up a published update ----
// Every 30 minutes: does the site have a newer version (version.json) than the code that
// is running here (js/build.js)? If so the page starts over once the tablet has been left
// alone for 2 minutes, never in the middle of the camera or a recipe.
//
// It used to remember the version it had last *seen* instead. Seen on a real tablet: for
// a few minutes after publishing, a page that starts over can still be handed old files.
// It had then "seen" the new version, so it stayed on the old code until the next one
// came out. Comparing with what is really running fixes that: still old means try again.
// And it waits ten minutes after first noticing, so it rarely starts over too early.
const SETTLE_MS = 10 * 60 * 1000;
const TRIES_KEY = 'update-tries'; // { n, at }: how often this page has started over for an update
let updateWaiting = false;
let updateSeenAt = 0;
function updateTries() {
  try { return JSON.parse(sessionStorage.getItem(TRIES_KEY) || 'null') || { n: 0, at: 0 }; } catch (e) { return { n: 0, at: 0 }; }
}
async function checkForUpdate() {
  try {
    const live = JSON.parse(await (await fetch('./version.json', { cache: 'no-store' })).text()).version;
    // ('dev' is the project folder on a PC: nothing to update to.)
    const newer = BUILD !== 'dev' && !!live && live !== BUILD;
    if (newer && !updateWaiting) updateSeenAt = Date.now();
    if (!newer) { try { sessionStorage.removeItem(TRIES_KEY); } catch (e) { /* storage off */ } }
    updateWaiting = newer;
  } catch { /* offline: try again later */ }
}
/** Start the page over for the update, if this is a good moment. */
function applyUpdate(here) {
  if (!updateWaiting || Date.now() - updateSeenAt < SETTLE_MS || !idleFor(2 * 60 * 1000) || BUSY.includes(here)) return false;
  // Should the files simply not arrive, don't start over every ten minutes for ever:
  // six goes, then once every six hours.
  const tries = updateTries();
  if (tries.n >= 6 && Date.now() - tries.at < 6 * 60 * 60 * 1000) return false;
  try { sessionStorage.setItem(TRIES_KEY, JSON.stringify({ n: tries.n + 1, at: Date.now() })); } catch (e) { /* storage off */ }
  location.reload();
  return true;
}
checkForUpdate();
setInterval(checkForUpdate, 30 * 60 * 1000);

// ---- Night mode (10 PM to 6 AM unless the owner chose other hours in Settings) ----
// Family tablets move to the night clock, Tom's to the starfield, once nobody has
// touched the screen for 5 minutes. In the morning they go back to what was up before.
const nightRoute = profile === 'tom' ? 'viewscreen' : 'night';
// What the night interrupted. Remembered through a restart in the small hours (below), so
// the photo frame still comes back in the morning.
let beforeNight = null;
try { beforeNight = sessionStorage.getItem('before-night'); } catch (e) { /* storage off */ }
function rememberBeforeNight(name) {
  beforeNight = name;
  try { if (name) sessionStorage.setItem('before-night', name); else sessionStorage.removeItem('before-night'); } catch (e) { /* storage off */ }
}

// ---- A fresh start in the small hours ----
// A screen that is never switched off runs the same page for weeks, and small things add
// up (memory, a request that never came back). Once a night, between 3 and 5, when it has
// been left alone for half an hour and is only showing the night clock, Home or the photo
// frame, the page starts over. It comes back on the same screen, dimmed the same.
const pageStarted = Date.now();
const FRESH_KEY = 'fresh-start-day';
function freshStart(here) {
  const now = new Date();
  if (now.getHours() < 3 || now.getHours() >= 5) return false;
  if (Date.now() - pageStarted < 12 * 60 * 60 * 1000 || !idleFor(30 * 60 * 1000)) return false;
  if (![nightRoute, homeRoute, 'photos'].includes(here) || tutorialRunning() || wiping()) return false;
  if (timerSvc && (timerSvc.ringing() || timerSvc.timers().some((t) => timerSvc.state(t) === 'running'))) return false;
  const today = now.toDateString();
  try {
    if (sessionStorage.getItem(FRESH_KEY) === today) return false; // once a night is enough
    sessionStorage.setItem(FRESH_KEY, today);
  } catch (e) { return false; }
  location.reload();
  return true;
}

// ---- Back to the resting screen after a while ----
// A menu, the calendar or the shopping list that somebody looked at and walked away
// from shouldn't stay up all day: after ten untouched minutes (Settings: 5, 10, 30 or
// never) it is Home again, or the photo frame if the owner prefers that. Screens people
// watch without touching (a recipe, timers, cooking) are left alone.
function restingScreen() {
  // (Tom's flight deck is its own resting screen.)
  return profile !== 'tom' && display().restScreen === 'photos' ? 'photos' : homeRoute;
}
// A half-written note or calendar entry is never thrown away by the clock: not while the
// cursor is in a box, and not while a box on the screen has something typed in it.
const typing = () => {
  const at = document.activeElement;
  if (at && (at.tagName === 'INPUT' || at.tagName === 'TEXTAREA')) return true;
  return Array.from(screenEl.querySelectorAll('textarea, input[type="text"], input:not([type])')).some((box) => box.value.trim());
};
const WANDERED = ['launcher', 'calendar', 'forecast', 'messages', 'recipes', 'plan', 'shopping', 'apps', 'addphotos', 'settings', 'whatsnew', 'convert'];

setInterval(() => {
  const here = screenName();
  if (applyUpdate(here)) return;
  if (isGhost) return; // the hidden admin copy doesn't follow the clock
  if (wiping()) return; // somebody is cleaning the glass: nothing changes underneath
  if (freshStart(here)) return;
  const night = isNightNow();
  if (night && here !== nightRoute && idleFor(5 * 60 * 1000) && !BUSY.includes(here)) {
    rememberBeforeNight(here);
    location.hash = `#/${nightRoute}`;
  } else if (!night && here === nightRoute && idleFor(5 * 60 * 1000)) {
    // Morning: the photo frame again if that is what the night interrupted, otherwise Home.
    location.hash = `#/${beforeNight === 'photos' ? 'photos' : homeRoute}`;
    rememberBeforeNight(null);
  } else {
    const rest = restingScreen();
    const after = display().restMinutes * 60 * 1000;
    // With the photo frame as the resting screen, Home gives way to it too.
    const wandered = WANDERED.includes(here) || (rest !== homeRoute && here === homeRoute);
    if (after > 0 && wandered && here !== rest && idleFor(after) && !tutorialRunning() && !typing()) location.hash = `#/${rest}`;
  }
}, 30 * 1000);

// The owner moved the brightness slider (Settings): apply it now, not at the next screen.
addEventListener('display-changed', () => setBacklight(screenName()));
