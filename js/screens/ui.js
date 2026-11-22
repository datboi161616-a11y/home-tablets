// The pieces every redesigned screen shares (styles in css/ui.css):
//   topBar()        back button, title, the screen's own buttons
//   phoneCode()     a "scan with your phone" code that opens the phone page on the right tab
//   restful()       a resting screen: its controls fade away when nobody touches it
//   season()        the time of year: holiday colours, a countdown, things drifting down
//   people()        the household's members, each with a colour
import { backHref, backLabel as hubLabel } from '../services/nav.js';
import { getFamily } from '../services/family.js';
import { uploadUrl, qrSvg } from '../services/tablet-photos.js';
import { display } from '../services/display.js';

export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------------------------------------------------------------------------------------
// Top bar
// ---------------------------------------------------------------------------------------
/**
 * tone 'dark': the screen is dark or a photo (see-through buttons, white text).
 * tone 'light': the screen is light (white buttons, dark text).
 * `right` is the screen's own buttons (markup). `back: 'history'` makes a button
 * (data-back) the screen wires itself.
 */
export function topBar({ title = '', back = backHref(), backLabel = hubLabel(), tone = 'dark', right = '' } = {}) {
  const cls = tone === 'dark' ? 'x-btn glass' : 'x-btn white';
  const backBtn = back === 'history'
    ? `<button data-back class="${cls}">${esc(backLabel)}</button>`
    : `<a href="${back}" class="${cls}">${esc(backLabel)}</a>`;
  return `<div class="x-top">${backBtn}<div class="x-title">${esc(title)}</div>${right}</div>`;
}

// ---------------------------------------------------------------------------------------
// The household
// ---------------------------------------------------------------------------------------
const PERSON_COLORS = ['#E2674A', '#3F8F7A', '#5B7FD6', '#C9892B', '#9A62C4', '#3E9BC0', '#D05C8E', '#6E8B3D'];
const hash = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };
/** A steady colour for a name: the household's members get the first colours, in order. */
export function personColor(name) {
  const n = String(name || '').trim();
  const i = getFamily().people.findIndex((p) => String(p).trim().toLowerCase() === n.toLowerCase());
  return PERSON_COLORS[(i >= 0 ? i : hash(n.toLowerCase())) % PERSON_COLORS.length];
}
export const initial = (name) => (String(name || '').trim().charAt(0) || '?').toUpperCase();
/** [{ name, color, initial }] for everyone named in Settings (two for a couple, more for a family). */
export function people() {
  return getFamily().people.map((name) => ({ name, color: personColor(name), initial: initial(name) }));
}
/** A round badge with somebody's initial. */
export function avatar(name, size = 44) {
  return `<span style="flex:none;width:${size}px;height:${size}px;border-radius:${size / 2}px;background:${personColor(name)};color:#fff;`
    + `display:inline-flex;align-items:center;justify-content:center;font:600 ${Math.round(size * 0.44)}px Outfit,sans-serif">${esc(initial(name))}</span>`;
}

// ---------------------------------------------------------------------------------------
// "Scan with your phone"
// ---------------------------------------------------------------------------------------
// The phone page has a tab for each job, and the code can open it on the right one, so
// nobody has to go to the Gallery to find the code for the shopping list.
//   tab: 'photos' | 'note' | 'shopping' | 'recipe' | 'settings'
const CODE_TEXT = {
  photos: ['Send photos from your phone', 'Scan with your phone’s camera. Same Wi-Fi as this screen.'],
  note: ['Leave a note from your phone', 'Scan with your phone’s camera. Same Wi-Fi as this screen.'],
  shopping: ['The list on your phone', 'Scan to add things, or to tick them off at the store.'],
  recipe: ['Send a recipe from your phone', 'Scan with your phone’s camera. Same Wi-Fi as this screen.'],
  settings: ['Set this up from your phone', 'Names, birthdays and calendars are easier to type there.'],
};
/**
 * Markup for a code. Call wirePhoneCodes(el) once after it is on the screen.
 * { tab, size (of the code, px), title, sub, tone: 'dark'|'light', column: true to stack it }
 */
export function phoneCode({ tab = 'photos', size = 132, title, sub, tone = 'dark', column = false } = {}) {
  const text = CODE_TEXT[tab] || CODE_TEXT.photos;
  return `<div class="x-code${tone === 'light' ? ' light' : ''}${column ? ' column' : ''}" data-phone-code="${esc(tab)}" data-size="${size}">
      <div class="x-code-qr" style="width:${size + 12}px;height:${size + 12}px;font:500 14px Inter,sans-serif;text-align:center"></div>
      <div style="min-width:0"><div class="x-code-title">${esc(title || text[0])}</div><div class="x-code-sub" data-code-sub>${esc(sub || text[1])}</div></div>
    </div>`;
}
/** The address a phone opens for a tab: null when this is not a tablet, '' when it has no Wi-Fi. */
export function phoneUrl(tab = 'photos') {
  let url = null;
  try { url = uploadUrl(); } catch (e) { url = null; }
  return url && tab && tab !== 'photos' ? `${url}#${tab}` : url;
}
/** Draws every phoneCode() inside `el`, and again when the Wi-Fi comes or goes. Returns a stop function. */
export function wirePhoneCodes(el) {
  const shown = new Map();
  const draw = () => {
    if (!el.isConnected) return;
    el.querySelectorAll('[data-phone-code]').forEach((box) => {
      const tab = box.dataset.phoneCode;
      const size = +box.dataset.size || 132;
      const url = phoneUrl(tab);
      if (shown.get(box) === url) return; // drawing a code is slow on the tablet: only when it changed
      shown.set(box, url);
      const qr = box.querySelector('.x-code-qr');
      const sub = box.querySelector('[data-code-sub]');
      if (!sub.dataset.usual) sub.dataset.usual = sub.textContent;
      if (url === '') {
        qr.textContent = 'No Wi-Fi';
        sub.textContent = 'The code appears by itself once this screen is on the Wi-Fi.';
      } else {
        // (On a PC there is no screen to send to: a stand-in code, so the page looks as it will.)
        qr.innerHTML = qrSvg(url || `http://kitchen-screen.example/${tab}`, size);
        sub.textContent = sub.dataset.usual;
      }
    });
  };
  draw();
  const again = setInterval(draw, 5000);
  return () => clearInterval(again);
}

// ---------------------------------------------------------------------------------------
// A resting screen
// ---------------------------------------------------------------------------------------
/**
 * After `after` ms untouched, `el` gets the class x-resting: everything inside marked
 * x-chrome fades away, and the picture and the clock are all that is left. The next touch
 * brings it all back; that touch only wakes the screen, it presses nothing.
 * `stay()` may return true to keep the controls up (somebody is typing, say).
 * Returns { stop(), wake(), resting() }.
 */
export function restful(el, { after = 10000, stay = null, onChange = null } = {}) {
  let timer = 0;
  let resting = false;
  let wokeAt = -1e9;
  const set = (rest) => {
    if (rest === resting) return;
    resting = rest;
    el.classList.toggle('x-resting', rest);
    if (onChange) onChange(rest);
  };
  const arm = () => {
    clearTimeout(timer);
    if (after > 0) timer = setTimeout(() => { if (stay && stay()) arm(); else set(true); }, after);
  };
  const touched = () => {
    if (resting) { wokeAt = performance.now(); set(false); }
    arm();
  };
  // The tap that woke it must not also press the button that just appeared under the finger.
  const swallow = (e) => {
    if (performance.now() - wokeAt < 700) { e.preventDefault(); e.stopPropagation(); }
  };
  el.addEventListener('touchstart', touched, { capture: true, passive: true });
  el.addEventListener('pointerdown', touched, true);
  el.addEventListener('click', swallow, true);
  arm();
  return {
    stop() { clearTimeout(timer); el.removeEventListener('touchstart', touched, true); el.removeEventListener('pointerdown', touched, true); el.removeEventListener('click', swallow, true); },
    wake() { set(false); arm(); },
    resting: () => resting,
  };
}

// ---------------------------------------------------------------------------------------
// The time of year
// ---------------------------------------------------------------------------------------
const DAY = 86400000;
const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const nthWeekday = (y, month, weekday, nth) => { // month 0-11
  const first = new Date(y, month, 1);
  return new Date(y, month, 1 + ((weekday - first.getDay() + 7) % 7) + (nth - 1) * 7);
};
function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, month - 1, day);
}
// Each theme: what drifts across the screen, its colours, and the day it counts down to.
//   drift: 'snow' | 'leaves' | 'hearts' | 'petals' | 'clover' | 'sparks' | 'fireflies' | ''
const THEMES = {
  winter: { name: 'Winter', drift: 'snow', accent: '#9CC7F0', glow: '#DCEBFA' },
  valentine: { name: 'Valentine’s Day', drift: 'hearts', accent: '#F27A9B', glow: '#FFD3DE' },
  stpatrick: { name: 'St. Patrick’s Day', drift: 'clover', accent: '#5DBB73', glow: '#CFF0D4' },
  spring: { name: 'Spring', drift: 'petals', accent: '#F4A7C0', glow: '#FFE1EA' },
  summer: { name: 'Summer', drift: 'fireflies', accent: '#F6C760', glow: '#FFEFC2' },
  july4: { name: 'Fourth of July', drift: 'sparks', accent: '#F26A5B', glow: '#FFE2DC' },
  autumn: { name: 'Autumn', drift: 'leaves', accent: '#E8944A', glow: '#FFE0BF' },
  halloween: { name: 'Halloween', drift: 'leaves', accent: '#F28A2E', glow: '#FFD9A8' },
  thanksgiving: { name: 'Thanksgiving', drift: 'leaves', accent: '#D9853B', glow: '#FFDDB5' },
  christmas: { name: 'Christmas', drift: 'snow', accent: '#E0574B', glow: '#FFE7C4' },
  newyear: { name: 'New Year', drift: 'sparks', accent: '#F2CE6B', glow: '#FFF1C9' },
};
/**
 * The theme for a day: { key, name, drift, accent, glow, countdown }.
 * countdown is { days, name, text } ("34 days until Christmas", "Christmas Eve", "Merry
 * Christmas") while the theme's day is still ahead or is today, otherwise null.
 * The owner can switch the whole thing off (Settings → Screen & sound): then key is ''.
 */
export function season(at = new Date()) {
  if (display().holiday === false) return { key: '', name: '', drift: '', accent: '', glow: '', countdown: null };
  const today = midnight(at);
  const y = today.getFullYear();
  const m = today.getMonth() + 1;
  const d = today.getDate();
  const until = (date) => Math.round((midnight(date) - today) / DAY);
  const thanks = nthWeekday(y, 10, 4, 4);
  const east = easter(y);
  let key = 'winter';
  let target = null; // [date, name, words on the day]
  if (m === 12 && d > 25) { key = 'newyear'; target = [new Date(y + 1, 0, 1), 'the New Year', 'Happy New Year']; }
  else if (m === 12 || (m === 11 && today > thanks)) { key = 'christmas'; target = [new Date(y, 11, 25), 'Christmas', 'Merry Christmas']; }
  else if (m === 11) { key = 'thanksgiving'; target = [thanks, 'Thanksgiving', 'Happy Thanksgiving']; }
  else if (m === 10) { key = 'halloween'; target = [new Date(y, 9, 31), 'Halloween', 'Happy Halloween']; }
  else if (m === 9) key = 'autumn';
  else if (m === 8 || m === 6) key = 'summer';
  else if (m === 7) { key = d <= 4 ? 'july4' : 'summer'; if (d <= 4) target = [new Date(y, 6, 4), 'the Fourth of July', 'Happy Fourth of July']; }
  else if (m === 5) key = 'spring';
  else if (m === 4 || (m === 3 && d > 17)) { key = 'spring'; if (until(east) >= 0 && until(east) <= 21) target = [east, 'Easter', 'Happy Easter']; }
  else if (m === 3) { key = 'stpatrick'; target = [new Date(y, 2, 17), 'St. Patrick’s Day', 'Happy St. Patrick’s Day']; }
  else if (m === 2) { key = d <= 14 ? 'valentine' : 'winter'; if (d <= 14) target = [new Date(y, 1, 14), 'Valentine’s Day', 'Happy Valentine’s Day']; }
  else if (m === 1 && d === 1) { key = 'newyear'; target = [today, 'the New Year', 'Happy New Year']; }
  let countdown = null;
  if (target) {
    const days = until(target[0]);
    if (days >= 0) {
      const eve = key === 'christmas' && days === 1;
      countdown = { days, name: target[1], text: days === 0 ? target[2] : eve ? 'Christmas Eve' : `${days} day${days === 1 ? '' : 's'} until ${target[1]}` };
    }
  }
  return Object.assign({ key, countdown }, THEMES[key]);
}

// One of each thing that drifts, as a tiny picture.
const LEAF = (c) => `<svg width="100%" height="100%" viewBox="0 0 24 24"><path d="M12 2C6 6 4 12 6 18c1 2 3 4 6 4s5-2 6-4c2-6 0-12-6-16z" fill="${c}"/><path d="M12 5v15" stroke="rgba(0,0,0,.25)" stroke-width="1.2" fill="none"/></svg>`;
const HEART = (c) => `<svg width="100%" height="100%" viewBox="0 0 24 24"><path d="M12 21C5 15 2 11.5 2 8a5 5 0 0 1 10-1.5A5 5 0 0 1 22 8c0 3.500-3 7-10 13z" fill="${c}"/></svg>`;
const CLOVER = (c) => `<svg width="100%" height="100%" viewBox="0 0 24 24" fill="${c}"><circle cx="8" cy="8" r="5"/><circle cx="16" cy="8" r="5"/><circle cx="12" cy="15" r="5"/><path d="M11 17h2l1 6h-4z"/></svg>`;
const DRIFTS = {
  snow: { n: 16, rise: false, size: [6, 14], secs: [14, 26], draw: () => '<div style="width:100%;height:100%;border-radius:50%;background:#FFFFFF"></div>', alpha: [0.5, 0.95] },
  leaves: { n: 10, rise: false, size: [20, 34], secs: [13, 22], turn: 540, draw: (i) => LEAF(['#E8944A', '#C9552B', '#E5B33A', '#B7602C'][i % 4]), alpha: [0.75, 0.95] },
  petals: { n: 12, rise: false, size: [12, 20], secs: [12, 22], turn: 360, draw: (i) => `<div style="width:100%;height:70%;border-radius:60% 40% 60% 40%;background:${['#FFD3E0', '#F9B7CC', '#FFFFFF'][i % 3]}"></div>`, alpha: [0.7, 0.95] },
  clover: { n: 9, rise: false, size: [18, 28], secs: [14, 24], turn: 300, draw: (i) => CLOVER(['#5DBB73', '#3F9A58', '#8AD49A'][i % 3]), alpha: [0.7, 0.9] },
  hearts: { n: 10, rise: true, size: [16, 30], secs: [14, 24], draw: (i) => HEART(['#F27A9B', '#FFB3C6', '#E0526F'][i % 3]), alpha: [0.6, 0.9] },
  sparks: { n: 14, rise: true, size: [5, 10], secs: [9, 18], draw: (i) => `<div style="width:100%;height:100%;border-radius:50%;background:${['#FFE9A8', '#FFFFFF', '#FFC2B5', '#BFD9FF'][i % 4]}"></div>`, alpha: [0.6, 1] },
  fireflies: { n: 10, rise: true, size: [8, 12], secs: [16, 28], draw: () => '<div style="width:100%;height:100%;border-radius:50%;background:radial-gradient(circle,#FFF6B8 0,#F6D860 40%,rgba(246,216,96,0) 70%)"></div>', alpha: [0.5, 0.9] },
};
// The same "random" numbers every time, so the layer looks the same after a redraw.
const rnd = (i, salt) => { const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453; return x - Math.floor(x); };
/**
 * A see-through layer of the season's drifting things (snow in December, leaves in
 * November, hearts before Valentine's Day...). Put it over the picture, under the text.
 * Only transforms are animated, and there are never more than sixteen things.
 */
export function seasonLayer(s = season(), { quiet = false } = {}) {
  const k = DRIFTS[s && s.drift];
  if (!k) return '';
  const n = quiet ? Math.ceil(k.n / 2) : k.n;
  let out = '';
  for (let i = 0; i < n; i++) {
    const size = Math.round(k.size[0] + rnd(i, 1) * (k.size[1] - k.size[0]));
    const secs = (k.secs[0] + rnd(i, 2) * (k.secs[1] - k.secs[0])).toFixed(1);
    const left = (((i + rnd(i, 3) * 0.8) / n) * 100).toFixed(1);
    const drift = Math.round((rnd(i, 4) - 0.5) * 180);
    const turn = k.turn ? Math.round((rnd(i, 5) - 0.5) * 2 * k.turn) : 0;
    const alpha = (k.alpha[0] + rnd(i, 6) * (k.alpha[1] - k.alpha[0])).toFixed(2);
    out += `<div class="${k.rise ? 'x-rise' : 'x-flake'}" style="left:${left}%;width:${size}px;height:${size}px;`
      + `${k.rise ? `--peak:${alpha};` : `opacity:${alpha};`}--drift:${drift}px;--turn:${turn}deg;`
      + `animation-duration:${secs}s;animation-delay:-${(rnd(i, 7) * secs).toFixed(1)}s">${k.draw(i)}</div>`;
  }
  return `<div class="x-season" aria-hidden="true">${out}</div>`;
}
