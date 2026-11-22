// A quiet word in the corner of whatever screen is up, for the two things that stop a
// kitchen screen working and that nobody would otherwise notice until too late:
//   - the charger has come out (it runs for a few hours on its battery, then goes dark), and
//   - the Wi-Fi or the internet has been gone for a while (weather and calendars go stale).
// app.js puts `bar` back on the screen after each screen change, like the timer chip.
import { worthAWord } from './whatsnew.js';
import { noteTrouble } from './trouble.js';
import { timeText } from './display.js';

const N = () => window.TabletNative;
const ON_A_SCREEN = /Android/.test(navigator.userAgent); // a laptop on its battery is not news
const UNPLUGGED_AFTER = 10 * 60 * 1000; // moved to another socket? no need to say anything yet
const OFFLINE_AFTER = 3 * 60 * 1000;    // routers restart; a short gap isn't worth a word
const LOW = 0.2;
const QUIET_SCREENS = ['night', 'viewscreen', 'photos']; // only a really low battery speaks up here

// Worth a line in the screen's diary afterwards: "the weather was old all afternoon" and
// "it was dead this morning" both have their answer there for whoever looks after it.
const WORTH_NOTING = 10 * 60 * 1000;
const span = (ms) => { const m = Math.round(ms / 60000); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} hr${m % 60 ? ` ${m % 60} min` : ''}`; };
let lowest = 1; // how far the battery got down while unplugged

export let bar = null;
let route = '';
let battery = null;
let unpluggedAt = 0;
let offlineAt = 0;
let offlineKind = 'off';
let hushedUntil = 0; // "I know" was tapped
let showing = '';
let homeRoutes = []; // where a word about new things may show (the home screens only)

function what() {
  const now = Date.now();
  if (battery && !battery.charging && ON_A_SCREEN) {
    const pct = Math.round(battery.level * 100);
    if (battery.level <= LOW) return { kind: 'low', text: `Plug me in · ${pct}% left`, urgent: true };
    if (unpluggedAt && now - unpluggedAt > UNPLUGGED_AFTER && now > hushedUntil && !QUIET_SCREENS.includes(route)) {
      return { kind: 'unplugged', text: `Not plugged in · ${pct}% left` };
    }
  }
  if (offlineAt && now - offlineAt > OFFLINE_AFTER && !QUIET_SCREENS.includes(route)) {
    return { kind: 'offline', text: offlineKind === 'connected' ? 'The internet isn’t answering · showing what was saved' : 'No Wi-Fi · showing what was saved' };
  }
  // Nothing wrong: then, on the home screen only and for a week, a word about new things.
  if (homeRoutes.indexOf(route) >= 0 && worthAWord()) return { kind: 'new', text: '✨ New things have arrived · See what’s new', fresh: true };
  return null;
}

function render() {
  if (!bar) return;
  const n = what();
  const key = n ? `${n.kind}|${n.text}` : '';
  if (key === showing) return;
  showing = key;
  bar.style.display = n ? 'inline-flex' : 'none';
  if (!n) return;
  bar.dataset.kind = n.kind;
  bar.textContent = n.text;
  bar.style.background = n.urgent ? '#C2491F' : n.fresh ? '#2F6B4F' : '#1D2430';
  makeRoom();
}

// The timer chip sometimes sits in this corner too (it moves away from buttons): go above it.
function makeRoom() {
  if (!bar || bar.style.display === 'none') return;
  bar.style.bottom = '24px';
  const chip = document.querySelector('[data-timer-chip]');
  if (!chip || chip.style.display === 'none') return;
  const a = bar.getBoundingClientRect();
  const b = chip.getBoundingClientRect();
  if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) bar.style.bottom = '104px';
}

function lookAtNetwork() {
  let state = navigator.onLine === false ? 'off' : 'online';
  try { if (N() && N().network) state = N().network(); } catch (e) { /* keep the guess */ }
  if (state === 'online') {
    if (offlineAt && Date.now() - offlineAt > WORTH_NOTING) {
      noteTrouble(`${offlineKind === 'connected' ? 'The internet didn’t answer' : 'No Wi-Fi'} for ${span(Date.now() - offlineAt)}, from ${timeText(new Date(offlineAt))}. It is back.`, '');
    }
    offlineAt = 0;
  } else { offlineKind = state; if (!offlineAt) offlineAt = Date.now(); }
  render();
  makeRoom();
}

/** `settingsRoute`: where a tap on "No Wi-Fi" leads (the screen that shows the Wi-Fi), or '' for nowhere. */
export function startNotices({ settingsRoute = '', homeRoutes: homes = [] } = {}) {
  homeRoutes = homes;
  bar = document.createElement('button');
  bar.setAttribute('data-notice', '');
  bar.style.cssText = 'position:absolute;left:24px;bottom:24px;z-index:50;display:none;align-items:center;'
    + 'min-height:52px;padding:0 22px;border:none;border-radius:999px;font:600 18px Inter,sans-serif;color:#fff;'
    + 'cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.18)';
  bar.addEventListener('click', () => {
    if (bar.dataset.kind === 'offline' && settingsRoute) {
      try { sessionStorage.setItem('settings.section', 'about'); } catch (e) { /* storage off */ }
      location.hash = `#/${settingsRoute}`;
    } else if (bar.dataset.kind === 'new') {
      location.hash = '#/whatsnew'; // (opening it is what puts the word away)
    } else if (bar.dataset.kind === 'unplugged') {
      hushedUntil = Date.now() + 60 * 60 * 1000; // seen: not again for an hour
      render();
    }
  });

  if (navigator.getBattery) {
    navigator.getBattery().then((b) => {
      battery = b;
      const plug = () => {
        if (b.charging) {
          if (ON_A_SCREEN && unpluggedAt && Date.now() - unpluggedAt > WORTH_NOTING) {
            noteTrouble(`Ran on its battery for ${span(Date.now() - unpluggedAt)}, from ${timeText(new Date(unpluggedAt))}, down to ${Math.round(Math.min(lowest, b.level) * 100)}%. It is plugged in again.`, '');
          }
          unpluggedAt = 0;
          lowest = 1;
        } else {
          unpluggedAt = unpluggedAt || Date.now();
          lowest = Math.min(lowest, b.level);
        }
        render();
      };
      b.addEventListener('chargingchange', plug);
      b.addEventListener('levelchange', () => { if (!b.charging) lowest = Math.min(lowest, b.level); render(); });
      plug();
    }).catch(() => { /* this engine doesn't say */ });
  }
  // The timer chip came or went (timers.js says so): step out of its way at once.
  addEventListener('timer-chip-changed', () => setTimeout(makeRoom, 80));
  addEventListener('online', lookAtNetwork);
  addEventListener('offline', lookAtNetwork);
  setInterval(lookAtNetwork, 60 * 1000);
  lookAtNetwork();
}

/** app.js tells us which screen is showing. */
export function setRoute(name) { route = name; render(); setTimeout(makeRoom, 600); }

/** For Settings: { level: 0-1, charging } or null when the engine doesn't say. */
export const batteryNow = () => (battery ? { level: battery.level, charging: battery.charging } : null);
