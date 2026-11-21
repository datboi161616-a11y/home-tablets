// First-start showcase: a quick "look what it can do" on the REAL screens, the way you'd
// show off a gift. It hops between the best features, spotlights the good bit, and says
// one punchy line; the person just taps Next. Taps elsewhere are blocked so the demo
// doesn't wander off; "Skip the tour" is always there.
//
// A beat: { go: 'route' | fn (jump to that screen when the beat starts), route: /regex on the hash/,
//           target: 'css selector' | fn -> element (spotlight it) | corner: true (whole screen, caption in the corner)
//           | center: true (a card in the middle), say: 'html', wait: 'next' | fn -> true when done,
//           optional: true (skip the beat if its target never appears) }
import { profile, settings } from '../config.js';
import { setWelcomeDone } from './welcome-state.js';
import { myEvents } from './my-events.js';

let script = null, idx = 0, root = null, tick = null, waitingSince = 0, startCount = 0, goneFor = -1;
export const tutorialRunning = () => !!script;

const hash = () => location.hash.replace(/^#\/?/, '');
const q = (s) => document.querySelector(s);
const visible = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return r.width > 2 && r.height > 2 ? el : null; };
const find = (t) => visible(typeof t === 'function' ? t() : q(t));
const formTitle = () => q('[data-detail] [data-title]');

// ---------------- The showcase scripts ----------------
// Not a lesson: a quick "look what it can do" on the real screens. Each beat jumps to a
// screen (go), points at the best bit (target) or lets the whole screen show (corner),
// and says one punchy thing. The person just taps Next (or the thing itself).
const H = (title, line) => `<div class="tu-h">${title}</div><div class="tu-l">${line}</div>`;
const dinnerHref = () => { const d = q('[data-dinner]'); const h = d && d.getAttribute('href'); return h && h.indexOf('#/dish/') === 0 ? h.replace('#/dish/', 'recipe/') : 'recipes'; };

const FAMILY = [
  { center: true, wait: 'start',
    say: H(festiveHello(), 'This isn’t a tablet. It’s your new kitchen screen: photos, weather, recipes, the family calendar and more, all in one place. Here’s what it can do.') },
  { route: /^home/, go: 'home', target: '[data-weather]', wait: 'next',
    say: H('Weather, at a glance', 'Live for your town, hour by hour, and it even tells you when to grab a jacket.') },
  { route: /^home/, target: () => { const b = q('[data-photo-bg]'); return b && b.parentNode; }, wait: 'next',
    say: H('Every photo, from everyone', 'Pictures the family sends from their phones play right here, all day long.') },
  { route: /^addphotos/, go: 'addphotos', target: '[data-qr]', optional: true, wait: 'next',
    say: H('No apps. No accounts.', 'Point any phone’s camera at this code and send. Grandma can do it. Try it right now!') },
  { route: /^home/, go: 'home', target: '[data-dinner]', wait: 'next',
    say: H('“What’s for dinner?” Solved.', 'A new idea every night, from over 1,000 recipes built right in.') },
  { route: /^recipe\//, go: () => dinnerHref(), corner: true, wait: 'next',
    say: H('Cooking mode', 'Big steps you can read from across the kitchen, and timers that ring on any screen.') },
  { route: /^recipes/, go: 'recipes', corner: true, wait: 'next',
    say: H('Plan the week, skip the list', 'Tap dinners onto the week and the shopping list writes itself, sorted by aisle. It even goes to the store with you on your phone.') },
  { route: /^calendar/, go: 'calendar', corner: true, wait: 'next',
    say: H('The family calendar', 'Birthdays, holidays and plans in one place. Google and iPhone calendars show up here too.') },
  { route: /^messages/, go: 'messages', corner: true, wait: 'next',
    say: H('Notes on the fridge, upgraded', 'Leave a message for whoever walks by next, from here or from any phone.') },
  { route: /^night/, go: 'night', corner: true, wait: 'next',
    say: H('Goodnight mode', 'At night it dims to a soft clock, then wakes up with you in the morning.') },
  { center: true, go: 'home', wait: 'finish',
    say: H('And it keeps getting better', 'New features show up on their own, no updates to install. Enjoy! (Want to see this again? All apps → Tour.)') },
];

const TOM = [
  { center: true, wait: 'start',
    say: H('Welcome aboard, Captain Tom', 'This is your own flight deck: real planes, real rockets, the real night sky. Here’s what it can do.') },
  { route: /^bridge/, go: 'bridge', target: '.tbb a[href="#/flights"]', wait: 'next',
    say: H('Real planes. Right now.', 'Every plane flying over your house, live on the radar.') },
  { route: /^flights/, go: 'flights', corner: true, wait: 'next',
    say: H('Know every flight', 'The airline, where it came from, where it’s going, how high, and a photo of the actual plane.') },
  { route: /^bridge/, go: 'bridge', target: '.tbb a[href="#/missions"]', wait: 'next',
    say: H('Voyager 1, live', 'The farthest thing humans ever built, counting away from Earth as you watch.') },
  { route: /^sky/, go: 'sky', corner: true, wait: 'next',
    say: H('Tonight’s sky', 'The moon, the planets, and exactly when the space station flies over your house.') },
  { route: /^missions/, go: 'missions', corner: true, wait: 'next',
    say: H('Launch countdowns', 'Real rocket launches, counting down to liftoff.') },
  { route: /^trivia/, go: 'trivia', corner: true, wait: 'next',
    say: H('Earn your wings', 'Over 300 space and flight questions. How far can you get?') },
  { route: /^viewscreen/, go: 'viewscreen', corner: true, wait: 'next',
    say: H('Night watch', 'After dark, the deck turns into a drifting starfield.') },
  { center: true, go: 'bridge', wait: 'finish',
    say: H('All systems go', 'New missions show up on their own. Clear skies, Captain! (TOUR on the deck runs this again.)') },
];

function festiveHello() {
  const d = new Date();
  return d.getMonth() === 11 || (d.getMonth() === 0 && d.getDate() <= 6) ? 'Merry Christmas!' : 'Say hello to your kitchen screen';
}

// ---------------- Drawing ----------------
const tom = () => profile === 'tom';
function styles() {
  const t = tom();
  return `
  .tu{position:absolute;top:0;left:0;width:1280px;height:800px;z-index:50;pointer-events:none;font-family:${t ? "'JetBrains Mono',monospace" : 'Inter,sans-serif'}}
  .tu-dim{position:absolute;background:rgba(10,14,22,${t ? '.78' : '.62'});pointer-events:auto}
  .tu-ring{position:absolute;border:4px solid ${t ? '#5CE1E6' : '#FFFFFF'};border-radius:${t ? '4px' : '18px'};box-shadow:0 0 0 6px ${t ? 'rgba(92,225,230,.35)' : 'rgba(255,255,255,.35)'};animation:tu-pulse 1.6s ease-in-out infinite;pointer-events:none}
  @keyframes tu-pulse{50%{box-shadow:0 0 0 14px ${t ? 'rgba(92,225,230,0)' : 'rgba(255,255,255,0)'}}}
  .tu-bub{position:absolute;width:440px;box-sizing:border-box;padding:22px 24px;pointer-events:auto;
    background:${t ? '#0A1220' : '#FFFFFF'};color:${t ? '#D7E6F0' : '#1D2430'};border:${t ? '1px solid #5CE1E6' : '0'};border-radius:${t ? '2px' : '22px'};
    box-shadow:0 18px 50px rgba(0,0,0,.35);font-size:21px;line-height:1.45}
  .tu-bub.center{width:620px;left:330px;top:210px;font-size:22px;text-align:center;padding:36px 40px}
  .tu-row{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:16px}
  .tu-btn{min-height:56px;padding:0 26px;border:0;border-radius:${t ? '0' : '28px'};font:600 19px ${t ? 'Oxanium,sans-serif' : 'Inter,sans-serif'};cursor:pointer;
    background:${t ? '#5CE1E6' : settings.accent};color:${t ? '#05070D' : '#FFFFFF'};${t ? 'letter-spacing:2px;text-transform:uppercase;' : ''}}
  .tu-end{background:none;border:0;color:${t ? '#7FA6B8' : '#4A5363'};font-size:16px;min-height:44px;cursor:pointer;padding:0 6px;text-decoration:underline}
  .tu-step{font-size:14px;color:${t ? '#7FA6B8' : '#4A5363'};letter-spacing:1px}
  .tu-h{font:${t ? "500 30px Oxanium,sans-serif" : "500 30px Outfit,sans-serif"};line-height:1.15;color:${t ? '#5CE1E6' : '#1D2430'};margin-bottom:8px}
  .tu-bub.center .tu-h{font-size:40px}
  .tu-l{font-size:20px;line-height:1.45}
  .tu-bub.corner{left:auto;right:28px;top:auto;bottom:28px;width:460px}`;
}

function ensureRoot() {
  const screen = document.getElementById('screen');
  if (!screen) return null;
  if (!root || !root.isConnected) {
    root = document.createElement('div');
    root.className = 'tu';
    root.innerHTML = `<style>${styles()}</style><div data-tu-dims></div><div class="tu-ring" data-tu-ring style="display:none"></div><div class="tu-bub" data-tu-bub style="display:none"></div>`;
    root.addEventListener('click', onClick);
    screen.appendChild(root);
    lastKey = ''; // a fresh box: draw the bubble again
    dimsHtml = null; ringCss = null;
  } else if (root !== screen.lastElementChild) {
    screen.appendChild(root); // stay on top of anything a screen adds later
  }
  return root;
}

function rectOf(el) {
  const screen = document.getElementById('screen').getBoundingClientRect();
  const s = screen.width / 1280 || 1;
  const r = el.getBoundingClientRect();
  return { x: (r.left - screen.left) / s, y: (r.top - screen.top) / s, w: r.width / s, h: r.height / s };
}

// The dimming is looked at five times a second but only written when it changes: writing
// it again makes the tablet redraw the whole screen each time, for nothing.
let dimsHtml = null, ringCss = null;
function setDims(html) {
  if (html === dimsHtml) return;
  dimsHtml = html;
  root.querySelector('[data-tu-dims]').innerHTML = html;
}
function dims(hole) {
  if (!hole) { setDims('<div class="tu-dim" style="left:0;top:0;width:1280px;height:800px"></div>'); return; }
  const p = 10, x = Math.max(0, hole.x - p), y = Math.max(0, hole.y - p), r = Math.min(1280, hole.x + hole.w + p), b = Math.min(800, hole.y + hole.h + p);
  setDims(`<div class="tu-dim" style="left:0;top:0;width:1280px;height:${y}px"></div>
    <div class="tu-dim" style="left:0;top:${b}px;width:1280px;height:${800 - b}px"></div>
    <div class="tu-dim" style="left:0;top:${y}px;width:${x}px;height:${b - y}px"></div>
    <div class="tu-dim" style="left:${r}px;top:${y}px;width:${1280 - r}px;height:${b - y}px"></div>`);
  const css = `display:block;left:${x - 4}px;top:${y - 4}px;width:${r - x}px;height:${b - y}px`;
  if (css !== ringCss) { ringCss = css; root.querySelector('[data-tu-ring]').style.cssText = css; }
}
function hideRing() {
  if (ringCss === 'none') return;
  ringCss = 'none';
  root.querySelector('[data-tu-ring]').style.display = 'none';
}

let lastKey = '';
function bubble(step, hole, extra) {
  const bub = root.querySelector('[data-tu-bub]');
  const n = script.length;
  const showNext = extra === 'next';
  const key = `${idx}|${extra}|${hole ? [hole.x, hole.y, hole.w, hole.h].map(Math.round).join(',') : 'c'}`;
  if (key === lastKey) return;
  lastKey = key;
  const isStart = step.wait === 'start', isFinish = step.wait === 'finish';
  bub.className = `tu-bub${hole ? '' : ' center'}`;
  bub.innerHTML = `${!isStart && !isFinish ? `<div class="tu-step">${idx} / ${n - 2}</div>` : ''}
    <div style="margin-top:${isStart || isFinish ? 0 : 6}px">${step.say}</div>
    <div class="tu-row" style="${hole ? '' : 'justify-content:center;gap:24px'}">
      ${isFinish ? '' : `<button class="tu-end" data-tu="end">${isStart ? 'Skip for now' : 'Skip the tour'}</button>`}
      ${isStart ? '<button class="tu-btn" data-tu="next">Show me</button>' : isFinish ? '<button class="tu-btn" data-tu="done">Start using it</button>' : showNext ? '<button class="tu-btn" data-tu="next">Next →</button>' : '<span></span>'}
    </div>`;
  bub.style.display = 'block';
  if (!hole) { bub.style.left = ''; bub.style.top = ''; return; }
  // Beside the spotlight: below it if there's room, else above, else to the side.
  const W = 440, H = bub.offsetHeight || 190, gap = 26;
  let left = Math.min(1280 - W - 20, Math.max(20, hole.x + hole.w / 2 - W / 2)), top;
  if (hole.y + hole.h + gap + H < 790) top = hole.y + hole.h + gap;
  else if (hole.y - gap - H > 10) top = hole.y - gap - H;
  else {
    top = Math.min(800 - H - 20, Math.max(20, hole.y + hole.h / 2 - H / 2));
    left = hole.x + hole.w + gap + W < 1270 ? hole.x + hole.w + gap : Math.max(20, hole.x - gap - W);
  }
  bub.style.left = `${left}px`;
  bub.style.top = `${top}px`;
}

// A paused tutorial (they went somewhere else): a small bar to get back on track.
function paused(step) {
  setDims('');
  hideRing();
  const bub = root.querySelector('[data-tu-bub]');
  const key = `paused${idx}`;
  if (lastKey === key) return;
  lastKey = key;
  bub.className = 'tu-bub';
  bub.innerHTML = `<div>The tutorial is waiting for you.</div><div class="tu-row"><button class="tu-end" data-tu="end">End tutorial</button><button class="tu-btn" data-tu="resume">Carry on</button></div>`;
  bub.style.display = 'block'; bub.style.left = '820px'; bub.style.top = '600px';
  bub.dataset.resume = step.resume || '';
}

function onClick(e) {
  const b = e.target.closest('[data-tu]');
  if (!b) return;
  const a = b.dataset.tu;
  if (a === 'end' || a === 'done') { stop(true); const home = tom() ? 'bridge' : 'home'; if (hash() !== home) location.hash = `#/${home}`; }
  else if (a === 'next') advance();
  else if (a === 'resume') {
    // Go back to where this step happens.
    const r = script[idx].route;
    const guess = { '^home': 'home', '^launcher': 'launcher', '^calendar': 'calendar', '^shopping': 'shopping', '^addphotos': 'addphotos', '^bridge': 'bridge', '^flights': 'flights', '^trivia': 'trivia' };
    const src = r ? r.source : '';
    const k = Object.keys(guess).find((g) => src.indexOf(g) === 0);
    location.hash = `#/${k ? guess[k] : (tom() ? 'bridge' : 'home')}`;
  }
}

function advance() {
  idx++;

  waitingSince = Date.now();
  lastKey = '';
  if (idx >= script.length) stop(true);
}

function update() {
  if (!script) return;
  if (!ensureRoot()) return;
  const step = script[idx];
  if (step.go && goneFor !== idx) {
    goneFor = idx;
    const to = typeof step.go === 'function' ? step.go() : step.go;
    if (to && hash() !== to) { location.hash = `#/${to}`; return; }
  }
  if (step.center && !step.route) { dims(null); hideRing(); bubble(step, null); return; }
  // Done already? (A tap that opens another screen finishes its step before anything else.)
  if (typeof step.wait === 'function' && step.wait() === true) { advance(); update(); return; }
  if (step.route && !step.route.test(hash())) {
    // Optional steps for a screen we're not on are simply passed.
    if (step.optional) { advance(); return; }
    paused(step);
    return;
  }
  if (step.corner) {
    setDims('<div class="tu-dim" style="left:0;top:0;width:1280px;height:800px;background:transparent"></div>');
    hideRing();
    bubble(step, null, 'next');
    root.querySelector('[data-tu-bub]').className = 'tu-bub corner';
    return;
  }
  if (step.center) {
    dims(null); hideRing();
    bubble(step, null, step.wait === 'next' ? 'next' : '');
    if (typeof step.wait === 'function' && step.wait()) advance();
    return;
  }
  const el = find(step.target);
  if (!el) {
    if (step.optional && Date.now() - waitingSince > 3000) { advance(); return; }
    setDims('');
    hideRing();
    root.querySelector('[data-tu-bub]').style.display = 'none';
    lastKey = '';
    return;
  }
  const hole = rectOf(el);
  dims(hole);
  let state = '';
  if (step.wait === 'next') state = 'next';
  else if (typeof step.wait === 'function') {
    const w = step.wait();
    if (w === true) { advance(); update(); return; }
    if (w === 'next') state = 'next';
  }
  bubble(step, hole, state);
}

/** Start from the beginning (the welcome route calls this). */
export function startTutorial() {
  script = tom() ? TOM : FAMILY;
  idx = 0;
  goneFor = -1;
  lastKey = '';
  waitingSince = Date.now();
  startCount = myEvents().length;
  clearInterval(tick);
  tick = setInterval(update, 200);
  update();
}

export function stop(markDone) {
  if (markDone) setWelcomeDone(true);
  script = null;
  clearInterval(tick);
  if (root) root.remove();
  root = null;
}
