// Hands-on tutorial: a spotlight on the REAL screens. Each step points at something,
// says what to do, and waits until the person has actually done it (tapped it, typed,
// saved...). Everything outside the spotlight is dimmed and can't be tapped, so nobody
// wanders off by accident; "End tutorial" is always there.
//
// A step: { route: /regex on the hash/, target: 'css selector' | fn -> element,
//           say: 'html', wait: fn -> true when done | 'next' (shows a Next button),
//           optional: true (skip the step if its target never appears), center: true (no target) }
import { profile, settings } from '../config.js';
import { setWelcomeDone } from './welcome-state.js';
import { myEvents } from './my-events.js';

let script = null, idx = 0, root = null, tick = null, waitingSince = 0, startCount = 0;
export const tutorialRunning = () => !!script;

const hash = () => location.hash.replace(/^#\/?/, '');
const q = (s) => document.querySelector(s);
const visible = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return r.width > 2 && r.height > 2 ? el : null; };
const find = (t) => visible(typeof t === 'function' ? t() : q(t));
const formTitle = () => q('[data-detail] [data-title]');

// ---------------- The family script ----------------
const FAMILY = [
  { center: true, wait: 'start',
    say: '<b style="font-size:30px">Hi! Let’s learn your kitchen screen by using it.</b><br>You’ll put something on the calendar, plan a dinner and see where family photos go. It takes about three minutes.' },
  { route: /^home/, target: 'a[href="#/launcher"]', say: 'This is your home screen. Tap <b>All apps</b> to see everything it can do.', wait: () => /^launcher/.test(hash()) },
  { route: /^launcher/, target: 'a[href="#/calendar"]', say: 'Tap <b>Calendar</b>.', wait: () => /^calendar/.test(hash()) },
  { route: /^calendar/, target: '.pill[data-add=""]', say: 'Let’s put something on it. Tap <b>+ Add</b>.', wait: () => !!q('[data-form]') },
  { route: /^calendar/, target: () => formTitle(), say: 'Type something that’s coming up, like <b>Pizza night</b>.',
    wait: () => { const t = formTitle(); return t && t.value.trim().length >= 2 ? 'next' : false; } },
  { route: /^calendar/, target: () => { const b = q('[data-f="date+1"]'); return b && b.parentNode; }, say: 'Pick the day with the <b>‹ ›</b> arrows. (Times and repeats are just below.)', wait: 'next' },
  { route: /^calendar/, target: '[data-f="save"]', say: 'Tap <b>Add to calendar</b>.', wait: () => !q('[data-form]') && myEvents().length > startCount },
  { route: /^calendar/, target: () => { const c = q('[data-detail] [data-close]'); return c && c.closest('[data-detail] > div'); },
    say: 'There it is! Tap any event like this later to change it or remove it.', wait: 'next' },
  { route: /^calendar/, target: '[data-detail] [data-close]', say: 'Tap <b>Close</b>.', wait: () => { const b = q('[data-detail]'); return !b || b.style.display !== 'flex'; } },
  { route: /^calendar/, target: 'a[href="#/launcher"]', say: 'Tap <b>Menu</b> to go back.', wait: () => /^launcher/.test(hash()) },
  { route: /^launcher/, target: 'a[href="#/recipes"]', say: 'Now let’s plan a dinner. Tap <b>Recipes</b>.', wait: () => hash() === 'recipes' },
  { route: /^recipes$/, target: '.rb-meal[href="#/recipes/dinner"]', say: 'Tap <b>Dinner</b>.', wait: () => /^recipes\/dinner$/.test(hash()), optional: true },
  { route: /^recipes\/dinner$/, target: '.rb-cuisine', say: 'Pick any kind of food you like.', wait: () => /^recipes\/(?!dinner$)[^/]+/.test(hash()) },
  { route: /^recipes\/./, target: '.rb-card', say: 'Tap a recipe that looks good.', wait: () => /^dish\//.test(hash()) },
  { route: /^dish\//, target: () => { const d = q('.dz-day'); return d && d.parentNode; }, say: 'Tap a day to have it for dinner that night.', wait: () => !!q('.dz-day.on') },
  { route: /^dish\//, target: 'a.k-tab[href="#/shopping"]', say: 'Nice! Its ingredients just went on the shopping list. Tap <b>Shopping list</b>.', wait: () => /^shopping/.test(hash()) },
  { route: /^shopping/, center: true, say: 'Everything you need for the week’s dinners, sorted by aisle. Tap things off as they go in the cart.', wait: 'next' },
  { route: /^shopping/, target: 'a.k-btn[href="#/home"]', say: 'Tap <b>Home</b>.', wait: () => /^home/.test(hash()) },
  { route: /^home/, target: '[data-photo-empty] a[href="#/addphotos"]', optional: true,
    say: 'Family photos play right here. Tap <b>Add photos from a phone</b> to see how they get here.', wait: () => /^addphotos/.test(hash()) },
  { route: /^addphotos/, target: '[data-qr]', optional: true, say: 'Anyone on your Wi-Fi can point their phone’s camera at this code and send photos. Nothing goes on the internet.', wait: 'next' },
  { route: /^addphotos/, target: 'a[href="#/home"]', optional: true, say: 'Tap <b>Home</b>.', wait: () => /^home/.test(hash()) },
  { center: true, wait: 'finish',
    say: '<b style="font-size:30px">You’re all set!</b><br>That event and dinner are real, so keep them or remove them. To do this again, open <b>All apps</b> and tap <b>Tour</b>.' },
];

// ---------------- Tom's script ----------------
const TOM = [
  { center: true, wait: 'start', say: '<b style="font-size:30px">Welcome aboard, Captain Tom.</b><br>Quick flight check: you’ll find the planes over your house and take on a trivia question.' },
  { route: /^bridge/, target: '.tbb a[href="#/flights"]', say: 'Tap the radar to see the real planes flying over your house right now.', wait: () => /^flights/.test(hash()) },
  { route: /^flights/, target: '[data-radar]', say: 'Every dot is a real plane. Tap one to see where it’s going and how high it is.', wait: 'next' },
  { route: /^flights/, target: 'a[href="#/bridge"]', say: 'Tap <b>DECK</b> to head back.', wait: () => /^bridge/.test(hash()) },
  { route: /^bridge/, target: 'a[href="#/trivia"]', say: 'Tap <b>TRIVIA</b>.', wait: () => /^trivia/.test(hash()) },
  { route: /^trivia/, target: '[data-opts]', say: 'Pick an answer. No pressure!', wait: () => { const n = q('[data-next]'); return n && !/SHOW ANSWER/.test(n.textContent); } },
  { route: /^trivia/, target: 'a[href="#/bridge"]', say: 'Tap <b>DECK</b> to go back to the flight deck.', wait: () => /^bridge/.test(hash()) },
  { center: true, wait: 'finish', say: '<b style="font-size:30px">All systems go.</b><br>Tonight’s sky, launches and departures are all on the deck. To run this again, tap <b>TOUR</b>.' },
];

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
  .tu-step{font-size:14px;color:${t ? '#7FA6B8' : '#4A5363'};letter-spacing:1px}`;
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

function dims(hole) {
  const box = root.querySelector('[data-tu-dims]');
  if (!hole) { box.innerHTML = '<div class="tu-dim" style="left:0;top:0;width:1280px;height:800px"></div>'; return; }
  const p = 10, x = Math.max(0, hole.x - p), y = Math.max(0, hole.y - p), r = Math.min(1280, hole.x + hole.w + p), b = Math.min(800, hole.y + hole.h + p);
  box.innerHTML = `<div class="tu-dim" style="left:0;top:0;width:1280px;height:${y}px"></div>
    <div class="tu-dim" style="left:0;top:${b}px;width:1280px;height:${800 - b}px"></div>
    <div class="tu-dim" style="left:0;top:${y}px;width:${x}px;height:${b - y}px"></div>
    <div class="tu-dim" style="left:${r}px;top:${y}px;width:${1280 - r}px;height:${b - y}px"></div>`;
  const ring = root.querySelector('[data-tu-ring]');
  ring.style.cssText = `display:block;left:${x - 4}px;top:${y - 4}px;width:${r - x}px;height:${b - y}px`;
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
  bub.innerHTML = `${!isStart && !isFinish ? `<div class="tu-step">STEP ${idx} OF ${n - 2}</div>` : ''}
    <div style="margin-top:${isStart || isFinish ? 0 : 6}px">${step.say}</div>
    <div class="tu-row" style="${hole ? '' : 'justify-content:center;gap:24px'}">
      ${isFinish ? '' : `<button class="tu-end" data-tu="end">${isStart ? 'Skip for now' : 'End tutorial'}</button>`}
      ${isStart ? '<button class="tu-btn" data-tu="next">Let’s go</button>' : isFinish ? '<button class="tu-btn" data-tu="done">Done</button>' : showNext ? '<button class="tu-btn" data-tu="next">Next →</button>' : '<span></span>'}
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
  dims(null);
  root.querySelector('[data-tu-dims]').innerHTML = '';
  root.querySelector('[data-tu-ring]').style.display = 'none';
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
  if (a === 'end' || a === 'done') stop(true);
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
  // "Let's go" on the first card moves on to the home screen.
  const wasStart = script && script[idx] && script[idx].wait === 'start';
  idx++;
  if (wasStart) { const home = tom() ? 'bridge' : 'home'; if (hash() !== home) location.hash = `#/${home}`; }
  waitingSince = Date.now();
  lastKey = '';
  if (idx >= script.length) stop(true);
}

function update() {
  if (!script) return;
  if (!ensureRoot()) return;
  const step = script[idx];
  if (step.center && !step.route) { dims(null); root.querySelector('[data-tu-ring]').style.display = 'none'; bubble(step, null); return; }
  // Done already? (A tap that opens another screen finishes its step before anything else.)
  if (typeof step.wait === 'function' && step.wait() === true) { advance(); update(); return; }
  if (step.route && !step.route.test(hash())) {
    // Optional steps for a screen we're not on are simply passed.
    if (step.optional) { advance(); return; }
    paused(step);
    return;
  }
  if (step.center) {
    dims(null); root.querySelector('[data-tu-ring]').style.display = 'none';
    bubble(step, null, step.wait === 'next' ? 'next' : '');
    if (typeof step.wait === 'function' && step.wait()) advance();
    return;
  }
  const el = find(step.target);
  if (!el) {
    if (step.optional && Date.now() - waitingSince > 3000) { advance(); return; }
    root.querySelector('[data-tu-dims]').innerHTML = '';
    root.querySelector('[data-tu-ring]').style.display = 'none';
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
