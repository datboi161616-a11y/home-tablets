import { profile } from './config.js';
import * as placeholder from './screens/placeholder.js';

const screenEl = document.getElementById('screen');

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
  calendar: 'Calendar', forecast: 'Weather', messages: 'Messages', night: 'Night clock',
  // Tom · Space & Flight
  bridge: 'Flight deck', flights: 'Planes overhead', departures: 'Departures', trivia: 'Trivia',
  alert: 'Sky alert', missions: 'Space missions', sky: "Tonight's sky",
  deepimage: 'Space image', viewscreen: 'Starfield',
};

export const homeRoute = profile === 'tom' ? 'bridge' : 'home';

let current = null;
let navId = 0;

async function navigate() {
  const id = ++navId;
  const name = location.hash.replace(/^#\/?/, '') || homeRoute;
  let mod = placeholder;
  if (SCREENS[name]) {
    try { mod = await import(`./screens/${name}.js`); }
    catch (err) { console.error(`Screen "${name}" failed to load`, err); }
  }
  if (id !== navId) return; // user navigated again while loading

  try { current?.unmount?.(); } catch (err) { console.error(err); }
  screenEl.innerHTML = '';
  current = mod;
  try { mod.mount(screenEl, { name, title: SCREENS[name], homeRoute }); }
  catch (err) {
    console.error(err);
    current = placeholder;
    placeholder.mount(screenEl, { name });
  }
}
addEventListener('hashchange', navigate);
navigate();

// ---- Offline support + pick up pushed updates ----
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');

// Check for a new version every 30 minutes; reload when idle on a fresh deploy.
// version.json is rewritten on each deploy (any change to it triggers a reload).
let knownVersion = null;
async function checkForUpdate() {
  try {
    const v = await (await fetch('./version.json', { cache: 'no-store' })).text();
    if (knownVersion && v !== knownVersion) location.reload();
    knownVersion = v;
  } catch { /* offline: try again later */ }
}
checkForUpdate();
setInterval(checkForUpdate, 30 * 60 * 1000);
