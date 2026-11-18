import { installCompat } from './compat.js';
import { profile } from './config.js';
import * as placeholder from './screens/placeholder.js';
import { welcomeDone } from './services/welcome-state.js';
import { tutorialRunning } from './services/tutorial.js';

const screenEl = document.getElementById('screen');
installCompat(screenEl);

// ---- Scale the 1280x800 canvas to fill the display (1.5x on the TB-X606F) ----
function fit() {
  const s = Math.min(innerWidth / 1280, innerHeight / 800);
  screenEl.style.transform = `scale(${s})`;
}
addEventListener('resize', fit);
fit();

// ---- Screens, loaded on demand. Add a new screen = add one line here. ----
const SCREENS = {
  // Family
  home: 'Home dashboard', launcher: 'Apps', photos: 'Photo frame', recipe: 'Cooking mode',
  recipes: 'Recipes', dish: 'Recipe', plan: 'Week plan', shopping: 'Shopping list', timers: 'Timers', myrecipe: 'My recipe',
  addphotos: 'Add photos', apps: 'Apps', camera: 'Camera', calendar: 'Calendar', forecast: 'Weather', messages: 'Messages', night: 'Night clock',
  // Tom · Space & Flight
  bridge: 'Flight deck', flights: 'Planes overhead', departures: 'Departures', trivia: 'Trivia',
  alert: 'Sky alert', missions: 'Space missions', sky: "Tonight's sky",
  deepimage: 'Space image', viewscreen: 'Starfield',
  // Both
  welcome: 'Welcome',
};

export const homeRoute = profile === 'tom' ? 'bridge' : 'home';

let current = null;
let navId = 0;
let timerSvc = null; // kitchen timers (family tablets): the countdown chip on every screen

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
  if (SCREENS[name]) {
    try { mod = await import(`./screens/${name}.js`); }
    catch (err) { console.error(`Screen "${name}" failed to load`, err); }
  }
  if (id !== navId) return; // user navigated again while loading
  // Let the Android app know (shown as "Showing now" in the admin dashboard).
  try { window.TabletNative?.screenChanged?.(name); } catch { /* not on a tablet */ }
  // Night screens turn the real backlight down; everything else uses normal brightness.
  const nightScreen = name === (profile === 'tom' ? 'viewscreen' : 'night');
  try { window.TabletNative?.setBrightness?.(nightScreen ? 0.05 : -1); } catch { /* not on a tablet */ }

  try { current?.unmount?.(); } catch (err) { console.error(err); }
  // Each visit gets its own container. When you leave, it's removed, so a screen's
  // late callbacks can check `el.isConnected` and stop touching a screen that's gone.
  screenEl.innerHTML = '';
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;top:0;right:0;bottom:0;left:0';
  screenEl.appendChild(host);
  if (timerSvc && timerSvc.chip) { timerSvc.setRoute(name); screenEl.appendChild(timerSvc.chip); }
  current = mod;
  try { mod.mount(host, { name, args, title: SCREENS[name], homeRoute }); }
  catch (err) {
    console.error(err);
    current = placeholder;
    host.innerHTML = '';
    placeholder.mount(host, { name });
  }
}
addEventListener('hashchange', navigate);
navigate();

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

// Check for a new version every 30 minutes. A new deploy is applied the next time
// the tablet is idle (2 minutes untouched), never in the middle of the camera or a recipe.
let knownVersion = null;
let updateWaiting = false;
async function checkForUpdate() {
  try {
    const v = await (await fetch('./version.json', { cache: 'no-store' })).text();
    if (knownVersion && v !== knownVersion) updateWaiting = true;
    knownVersion = knownVersion || v;
  } catch { /* offline: try again later */ }
}
checkForUpdate();
setInterval(checkForUpdate, 30 * 60 * 1000);

// ---- Night mode: 10 PM to 6 AM ----
// Family tablets move to the night clock, Tom's to the starfield, once nobody has
// touched the screen for 5 minutes. At 6 AM they go back home.
const nightRoute = profile === 'tom' ? 'viewscreen' : 'night';
const isNight = () => { const h = new Date().getHours(); return h >= 22 || h < 6; };

setInterval(() => {
  const here = screenName();
  if (updateWaiting && idleFor(2 * 60 * 1000) && !BUSY.includes(here)) { location.reload(); return; }
  if (isGhost) return; // the hidden admin copy doesn't follow the clock
  if (isNight() && here !== nightRoute && idleFor(5 * 60 * 1000) && !BUSY.includes(here)) {
    location.hash = `#/${nightRoute}`;
  } else if (!isNight() && here === nightRoute && idleFor(5 * 60 * 1000)) {
    location.hash = `#/${homeRoute}`;
  }
}, 30 * 1000);
