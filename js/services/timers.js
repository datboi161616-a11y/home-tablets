// Kitchen timers that run on any screen (separate from cooking-mode step timers).
// Saved with their end time, so they keep counting through screen changes and reloads.
//   { id, label, secs, end }                    running
//   { id, label, secs, left }                   paused (ms left)
//   { id, label, secs, end }  end in the past   finished: rings for a while, then waits ("missed")
//   { id, label, secs, end, ack: true, ackAt }  finished and stopped (removed a few minutes later)
// `named: true` marks a timer someone gave a name ("Pasta"), not just "5 min timer".
import { display, timeText } from './display.js';

const KEY = 'kitchen.timers.v1';
// An alarm nobody stops rings for two minutes, or as long as the owner chose (Settings).
const ringMs = () => Math.max(1, +display().alarmMinutes || 2) * 60 * 1000;
export const MAX = 8;
// A stopped timer stays on the Timers screen this long after it was stopped, so "+1 min"
// and "Again" are still there when someone comes back to the counter.
const KEEP_STOPPED = 3 * 60 * 1000;
// A finished timer nobody stopped is cleared away after half a day.
const KEEP_MISSED = 12 * 60 * 60 * 1000;

const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]') || []; } catch (e) { return []; } };
function write(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) { /* storage off: still counts until reload */ }
  window.dispatchEvent(new Event('timers-changed'));
}

export function onTimersChanged(cb) {
  window.addEventListener('timers-changed', cb);
  return () => window.removeEventListener('timers-changed', cb);
}

/** Timers to show: stopped ones disappear a few minutes after they're stopped. */
export function timers() {
  const now = Date.now();
  let fixed = false;
  const list = read().filter((t) => t && t.id && !(t.ack && now - Math.max(t.end || 0, t.ackAt || 0) > KEEP_STOPPED)
    && !(!t.ack && t.end != null && now - t.end > KEEP_MISSED))
    .map((t) => {
      // The clock was put back (the screen set its time after starting up): a timer can never
      // have more time left than it was set for, so it doesn't suddenly run for hours.
      if (t.end != null && t.end - now > (t.secs || 0) * 1000 + 5000) { fixed = true; return Object.assign({}, t, { end: now + t.secs * 1000 }); }
      return t;
    });
  if (fixed) { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) { /* storage off */ } }
  return list;
}
export const left = (t) => (t.end != null ? Math.max(0, t.end - Date.now()) : t.left);
export const state = (t) => (t.end == null ? 'paused' : t.end <= Date.now() ? (t.ack ? 'stopped' : 'done') : 'running');
/** Finished, nobody stopped it, and it has stopped ringing on its own (or ended while the screen was off). */
export const missed = (t) => state(t) === 'done' && Date.now() - t.end >= ringMs();
const ringingNow = () => timers().filter((t) => state(t) === 'done' && Date.now() - t.end < ringMs());
export const ringing = () => ringingNow().length > 0;
/** The timers ringing right now (for saying which ones). */
export const ringingTimers = ringingNow;

/** "25 min", "1 hr", "1 hr 30 min" */
export function minutesText(m) {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} hr ${r} min` : `${h} hr`;
}
export const labelFor = (secs) => `${minutesText(Math.round(secs / 60))} timer`;

/** "6:40 PM", "tomorrow 7:05 AM", "Sat 9:00 AM" (follows the owner's 12/24-hour clock). */
export function whenText(ms) {
  const d = new Date(ms);
  const today = new Date();
  const days = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(today.getFullYear(), today.getMonth(), today.getDate())) / 864e5);
  if (days === 0) return timeText(d);
  if (days === 1) return `tomorrow ${timeText(d)}`;
  if (days === -1) return `yesterday ${timeText(d)}`;
  return `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${timeText(d)}`;
}
/** "just now", "3 min ago", "1 hr 20 min ago" */
export function agoText(ms) {
  const m = Math.floor((Date.now() - ms) / 60000);
  return m < 1 ? 'just now' : `${minutesText(m)} ago`;
}

let fullUntil = 0; // the chip says "all 8 are in use" until then
/** Start a timer. Returns false if all MAX timers are still going (nothing is dropped). */
export function addTimer(secs, label) {
  const list = timers();
  // Make room by clearing finished timers, oldest first: stopped ones, then ones that rang
  // out with nobody there. Never drop one that's still counting, paused or ringing.
  while (list.length >= MAX) {
    let i = list.findIndex((t) => state(t) === 'stopped');
    if (i < 0) i = list.findIndex((t) => missed(t));
    if (i < 0) {
      // Say so on every screen too: a recipe's "Start timer" button can't show it itself.
      fullUntil = Date.now() + 6000;
      window.dispatchEvent(new Event('timers-changed'));
      return false;
    }
    list.splice(i, 1);
  }
  const t = { id: `t${Date.now()}${Math.floor(Math.random() * 1000)}`, label: label || labelFor(secs), secs, end: Date.now() + secs * 1000 };
  if (label) t.named = true;
  list.push(t);
  write(list);
  return true;
}
/** How many more timers can start now (finished ones make room). */
export const room = () => MAX - timers().filter((t) => state(t) !== 'stopped' && !missed(t)).length;

const base = (t) => (t.named ? { id: t.id, label: t.label, secs: t.secs, named: true } : { id: t.id, label: t.label, secs: t.secs });
function change(id, fn) { write(timers().map((t) => (t.id === id ? fn(Object.assign({}, t)) : t))); }
export const pauseTimer = (id) => change(id, (t) => (state(t) === 'running' ? Object.assign(base(t), { left: left(t) }) : t));
export const resumeTimer = (id) => change(id, (t) => (t.end == null ? Object.assign(base(t), { end: Date.now() + t.left }) : t));
/** Pause every running timer (someone is called away from the stove). */
export const pauseAll = () => write(timers().map((t) => (state(t) === 'running' ? Object.assign(base(t), { left: left(t) }) : t)));
/** Start every paused timer again. */
export const resumeAll = () => write(timers().map((t) => (t.end == null ? Object.assign(base(t), { end: Date.now() + t.left }) : t)));
// +1 min also works on a ringing or finished timer ("just one more minute"): it counts again.
// `secs` grows too, so the progress bar stays right.
export const addMinute = (id) => change(id, (t) => (t.end != null
  ? Object.assign(base(t), { secs: Math.max(t.secs, Math.ceil(left(t) / 1000)) + 60, end: Math.max(t.end, Date.now()) + 60000 })
  : Object.assign(t, { left: t.left + 60000, secs: t.secs + 60 })));
/** Run a finished timer again for its full time. */
export const restartTimer = (id) => change(id, (t) => Object.assign(base(t), { end: Date.now() + t.secs * 1000 }));

// ---- Taking it back ------------------------------------------------------------------------
// The last timers removed, kept for a little while so a mistaken "Cancel" can be undone.
let removed = [];
let removedAt = 0;
const UNDO_MS = 10000;
export const removeTimer = (id) => {
  const list = timers();
  const gone = list.filter((t) => t.id === id);
  if (gone.length) { removed = gone; removedAt = Date.now(); }
  write(list.filter((t) => t.id !== id));
};
/** Clear every finished timer (stopped, ringing or missed) at once. Returns how many. */
export function clearFinished() {
  const list = timers();
  const gone = list.filter((t) => state(t) === 'done' || state(t) === 'stopped');
  if (!gone.length) return 0;
  removed = gone.map((t) => (state(t) === 'done' ? Object.assign({}, t, { ack: true, ackAt: Date.now() }) : t));
  removedAt = Date.now();
  write(list.filter((t) => gone.indexOf(t) < 0));
  return gone.length;
}
/** What can still be taken back: the removed timers, or [] once the moment has passed. */
export const undoable = () => (Date.now() - removedAt < UNDO_MS ? removed : []);
/** Put the last removed timers back, just as they were (a running one kept counting). */
export function undoRemove() {
  const back = undoable();
  if (!back.length) return false;
  const list = timers();
  back.forEach((t) => { if (list.length < MAX && !list.some((x) => x.id === t.id)) list.push(t); });
  removed = [];
  removedAt = 0;
  write(list);
  return true;
}

/** Stop the timer that's ringing (or every one that is, with no id). */
export function stopRinging(id) {
  const now = Date.now();
  write(timers().map((t) => (state(t) === 'done' && (id == null || t.id === id) ? Object.assign(t, { ack: true, ackAt: now }) : t)));
}

export function fmt(ms) {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

// ---- Alarm sound (Web Audio, no files needed) ---------------------------------------
let audio;
function ensureAudio() {
  try {
    if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') {
      // Refused until somebody touches the screen: quietly, it is tried again at the next touch.
      const p = audio.resume();
      if (p && p.catch) p.catch(() => {});
    }
  } catch (e) { /* no audio */ }
}
// One note: it swells in a blink and dies away over `len` seconds.
function note(at, hz, len, peak) {
  const o = audio.createOscillator();
  const g = audio.createGain();
  o.type = 'sine';
  o.frequency.value = hz;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, at + len);
  o.connect(g);
  g.connect(audio.destination);
  o.start(at);
  o.stop(at + len + 0.02);
}
// The three alarms an owner can pick from (Settings → Timers). Each is about two seconds
// long, because a ringing alarm plays it again every two and a half.
const SOUNDS = {
  // Two bursts of three sharp pips: the classic kitchen timer.
  beeps: (t0) => [0, 0.22, 0.44, 0.9, 1.12, 1.34].forEach((d) => note(t0 + d, 988, 0.16, 0.45)),
  // Three rising notes, twice: gentler, like a doorbell.
  chime: (t0) => [[0, 784], [0.26, 988], [0.52, 1175], [1.1, 784], [1.36, 988], [1.62, 1175]].forEach(([d, hz]) => note(t0 + d, hz, 0.5, 0.36)),
  // Two struck bells with their overtones ringing out.
  bell: (t0) => [0, 1.05].forEach((d) => { note(t0 + d, 660, 1.0, 0.4); note(t0 + d, 1320, 0.7, 0.16); note(t0 + d, 1980, 0.4, 0.08); }),
};
function beep(sound) {
  ensureAudio();
  if (!audio) return;
  try { (SOUNDS[sound || display().alarmSound] || SOUNDS.beeps)(audio.currentTime); } catch (e) { /* no sound this time */ }
}

/** Two soft notes: a note has arrived, or a timer is about to run out. Never mistaken for an alarm. */
export function softChime() {
  ensureAudio();
  if (!audio) return;
  try {
    const t0 = audio.currentTime;
    note(t0, 880, 0.35, 0.2);
    note(t0 + 0.18, 1175, 0.55, 0.18);
  } catch (e) { /* no sound this time */ }
}
const headsUpGiven = {}; // timer id + end time -> already chimed

/** The alarm once, so someone setting the volume (or choosing a sound) can hear it. */
export function testBeep(sound) { beep(sound); }
/** The owner's alarm, for anything else that rings (cooking mode's step timers). */
export function alarmBeep() { beep(); }

// ---- Cooking mode's step timers ----------------------------------------------------------
// They are kept with each recipe's progress (recipe.v1.<id>, see screens/recipe.js), and
// only that screen used to look at them: leave it, and a finished timer never rang. The
// chip below counts and rings them too, on every screen except cooking mode itself.
const COOK_KEY = 'recipe.v1.';
let cook = [];
let cookAt = 0;
function cookingTimers() {
  if (Date.now() - cookAt < 1000) return cook; // looked a moment ago
  cookAt = Date.now();
  cook = [];
  try {
    for (let k = 0; k < localStorage.length; k++) {
      const key = localStorage.key(k);
      if (!key || key.indexOf(COOK_KEY) !== 0) continue;
      const saved = JSON.parse(localStorage.getItem(key) || 'null');
      const steps = (saved && saved.timers) || {};
      Object.keys(steps).forEach((i) => {
        const t = steps[i];
        // Running or finished and not yet stopped (paused ones just wait).
        if (t && t.end != null && !t.ack) cook.push({ recipe: key.slice(COOK_KEY.length), step: i, end: t.end, label: t.label || 'Cooking timer' });
      });
    }
  } catch (e) { cook = []; }
  return cook;
}
/** Stop the finished cooking timers ringing (the recipe shows them as finished). */
function stopCooking() {
  try {
    cook.filter((c) => c.end <= Date.now()).forEach((c) => {
      const saved = JSON.parse(localStorage.getItem(COOK_KEY + c.recipe) || 'null');
      if (!saved || !saved.timers || !saved.timers[c.step]) return;
      saved.timers[c.step].ack = true;
      localStorage.setItem(COOK_KEY + c.recipe, JSON.stringify(saved));
    });
  } catch (e) { /* storage off */ }
  cookAt = 0;
}

// ---- The little countdown chip shown on every screen ------------------------------------
// app.js puts `chip` back on the screen after each screen change.
export let chip = null;
let lastBeep = 0;
let route = '';
let placeTimer = 0;
let wasHidden = true;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// "Pasta", "Pasta and Oven", "Pasta, Oven and 2 more"
function namesText(names) {
  if (names.length <= 1) return names[0] || '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} more`;
}

// The chip sits in a bottom corner. Some screens have a button just there, so it moves to the
// other bottom corner (or the top right) when it would cover one. Checked when a screen opens
// and when the chip appears, not every tick: measuring is slow on the tablet.
const SPOTS = [
  { right: '24px', left: 'auto', bottom: '24px', top: 'auto', maxWidth: '620px' },
  { right: 'auto', left: '24px', bottom: '24px', top: 'auto', maxWidth: '620px' },
  { right: '24px', left: 'auto', bottom: 'auto', top: '24px', maxWidth: '620px' },
];
// Home has no free corner (every card there is a way in), so it keeps a strip free for the
// chip under the weather card, as wide as that column (see screens/home.js).
const HOME_SPOT = { right: 'auto', left: '40px', bottom: '40px', top: 'auto', maxWidth: '588px' };
// (`reserved`: a spot the screen keeps free for the chip. The notice bar along the bottom
// steps up out of the chip's way by itself, so only the screen's own buttons count there.)
function covers(r, reserved) {
  const host = chip && chip.parentNode;
  if (!host) return false;
  const els = host.querySelectorAll('button,a[href],input,select,textarea,[data-tap],[role="button"]');
  for (let i = 0; i < els.length; i++) {
    const e = els[i];
    if (e === chip || chip.contains(e) || (reserved && e.hasAttribute('data-notice'))) continue;
    const b = e.getBoundingClientRect();
    if (!b.width || !b.height) continue;
    if (b.left < r.right - 4 && b.right > r.left + 4 && b.top < r.bottom - 4 && b.bottom > r.top + 4) return true;
  }
  return false;
}
function place() {
  if (!chip || chip.style.display === 'none' || !chip.isConnected) return;
  // On the Timers screen the list of timers (and their buttons) fills the right-hand side.
  const order = route === 'timers' ? [SPOTS[1], SPOTS[0], SPOTS[2]] : route === 'home' ? [HOME_SPOT].concat(SPOTS) : SPOTS;
  for (let i = 0; i < order.length; i++) {
    Object.assign(chip.style, order[i]);
    if (!covers(chip.getBoundingClientRect(), order[i] === HOME_SPOT)) return;
  }
  Object.assign(chip.style, order[0]); // covers something everywhere: the usual corner
}
function placeSoon(ms) { clearTimeout(placeTimer); placeTimer = setTimeout(place, ms); }

// What cooking mode has going, when it isn't on screen to show and ring it itself.
function cookingNow(on = route) {
  const now = Date.now();
  return on === 'recipe' ? [] : cookingTimers().filter((c) => c.end > now || now - c.end < ringMs());
}
// The kitchen timers the chip talks about (one that finished with nobody there is mentioned
// for an hour; the Timers screen keeps it longer).
const chipTimers = (now) => timers().filter((t) => state(t) !== 'stopped' && !(missed(t) && now - t.end > 60 * 60 * 1000));
// Is there nothing for the chip to say on screen `on`? The Timers screen shows the kitchen
// timers itself, and cooking mode its own, so the chip only appears there for what they
// don't show, or when something is ringing.
function chipHidden(on) {
  const now = Date.now();
  const cooks = cookingNow(on);
  const ring = ringingNow().length > 0 || cooks.some((c) => c.end <= now);
  const full = now < fullUntil && on !== 'timers';
  const count = chipTimers(now).length + cooks.length;
  return !full && (!count || (on === 'recipe' && !ring) || (on === 'timers' && !ring && !cooks.length));
}
/** Will the chip be up on screen `name` (e.g. 'home') right now? For a screen that keeps room for it. */
export const chipShowsOn = (name) => !chipHidden(name);
/** Calls cb() when the chip comes or goes. Returns an unsubscribe function. */
export function onChipChanged(cb) {
  window.addEventListener('timer-chip-changed', cb);
  return () => window.removeEventListener('timer-chip-changed', cb);
}
/** The names of everything ringing right now, kitchen timers and cooking steps alike ([] when quiet). */
export function ringingNames() {
  const now = Date.now();
  return ringingNow().map((t) => t.label).concat(cookingNow().filter((c) => c.end <= now).map((c) => c.label));
}
/** ...worded for a person: "Pasta", "Pasta and Oven", "Pasta, Oven and 1 more". */
export const ringingText = () => namesText(ringingNames());
/** Stop all of it. */
export function stopAllRinging() { stopRinging(); stopCooking(); }

let wasRinging = false;

// How often a ringing alarm plays (ms). One nobody has stopped after half a minute comes
// faster, so it is harder to miss from the next room (Settings → Timers can switch that off).
const RING_GAP = 2500, RING_GAP_INSISTENT = 1500, INSIST_AFTER = 30 * 1000;
function ringGap(rung, cookDone) {
  if (!display().alarmInsist) return RING_GAP;
  const ends = rung.map((t) => t.end).concat(cookDone.map((c) => c.end));
  const first = ends.length ? Math.min.apply(null, ends) : Date.now();
  return Date.now() - first >= INSIST_AFTER ? RING_GAP_INSISTENT : RING_GAP;
}

export function startTimers() {
  chip = document.createElement('button');
  chip.setAttribute('data-timer-chip', '');
  // Big enough to read from across the kitchen.
  chip.style.cssText = 'position:absolute;right:24px;bottom:24px;z-index:50;display:none;align-items:center;gap:12px;'
    + 'min-height:64px;max-width:620px;padding:0 26px;border:none;border-radius:999px;font:600 22px Inter,sans-serif;cursor:pointer;'
    + 'box-shadow:0 6px 20px rgba(0,0,0,.18);font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden';
  const cooking = cookingNow;
  chip.addEventListener('click', () => {
    ensureAudio();
    const cooks = cooking();
    const cookRing = cooks.some((c) => c.end <= Date.now());
    if (ringing() || cookRing) { stopRinging(); stopCooking(); }
    else if (timers().some((t) => state(t) !== 'stopped') || Date.now() < fullUntil) location.hash = '#/timers';
    else if (cooks.length) location.hash = `#/recipe/${encodeURIComponent(cooks[0].recipe)}`;
  });
  // Unlock sound on the first touch anywhere, so alarms can play later.
  addEventListener('pointerdown', ensureAudio, true);

  const big = (s) => `<span style="font-size:28px;font-weight:700">${s}</span>`;
  const small = (s) => `<span style="opacity:.85;overflow:hidden;text-overflow:ellipsis">${esc(s)}</span>`;
  const tick = () => {
    const now = Date.now();
    const list = chipTimers(now);
    const cooks = cooking();
    const cookDone = cooks.filter((c) => c.end <= now);
    const rung = ringingNow();
    const ring = rung.length > 0 || cookDone.length > 0;
    // A heads-up a minute before a longer timer runs out (Settings → Timers): time to get to the stove.
    if (display().alarmHeadsUp && !ring) {
      list.forEach((t) => {
        const togo = t.end - now;
        const key = `${t.id}:${t.end}`;
        if (state(t) === 'running' && t.secs >= 300 && togo <= 60000 && togo > 40000 && !headsUpGiven[key]) { headsUpGiven[key] = 1; softChime(); }
      });
    }
    const full = now < fullUntil && route !== 'timers'; // (the Timers screen says it itself)
    const count = list.length + cooks.length;
    const hide = chipHidden(route);
    chip.style.display = hide ? 'none' : 'inline-flex';
    // A screen that keeps room for the chip (Home) makes it now, before the chip finds its spot.
    if (hide !== wasHidden) window.dispatchEvent(new Event('timer-chip-changed'));
    if (!hide) {
      if (wasHidden) placeSoon(0);
      // Whatever runs out first, kitchen timer or cooking step.
      const running = list.filter((t) => state(t) === 'running').map((t) => ({ end: t.end, label: t.named ? t.label : '' }))
        .concat(cooks.filter((c) => c.end > now).map((c) => ({ end: c.end, label: c.label }))).sort((a, b) => a.end - b.end);
      const paused = list.filter((t) => state(t) === 'paused');
      const done = list.filter((t) => state(t) === 'done'); // rang out with nobody there
      const more = (n) => (n > 0 ? small(`· ${n} more`) : '');
      let html;
      if (ring) {
        // Say which one: with three timers going, "time's up" alone sends people to look.
        const names = rung.map((t) => t.label).concat(cookDone.map((c) => c.label));
        html = `<span>⏰ Time’s up!</span>${small(namesText(names))}<span>· Tap to stop</span>`;
      } else if (full) {
        html = `<span>All ${MAX} timers are in use.</span>${small('Tap to see them')}`;
      } else if (running.length) {
        html = `<span>⏱</span>${big(fmt(running[0].end - now))}${running[0].label ? small(running[0].label) : ''}${more(count - 1)}`;
      } else if (paused.length) {
        html = `<span>⏸</span>${big(fmt(left(paused[0])))}${small(paused[0].named ? `${paused[0].label} · paused` : 'paused')}${more(count - 1)}`;
      } else if (done.length) {
        html = `<span>✓</span><span>${esc(done[0].named ? done[0].label : 'Timer')} finished at ${esc(whenText(done[0].end))}</span>${more(count - 1)}`;
      } else html = '';
      if (chip.__html !== html) {
        const longer = !chip.__html || html.length !== chip.__html.length;
        chip.__html = html;
        chip.innerHTML = html;
        if (longer && !/^<span>⏱/.test(html)) placeSoon(50); // its width changed: check its corner again
      }
      // On the night clock a countdown is the brightest thing in a dark room: warm and dim there.
      const dim = route === 'night' && !ring && !full;
      chip.style.background = ring || full ? 'var(--accent)' : dim ? '#231B12' : '#1D2430';
      chip.style.color = dim ? '#D2B48C' : '#FFFFFF';
      chip.style.boxShadow = dim ? 'none' : '0 6px 20px rgba(0,0,0,.18)';
      chip.style.opacity = ring && Math.floor(Date.now() / 500) % 2 ? '.75' : '1';
    }
    wasHidden = hide;
    if (ring !== wasRinging) { wasRinging = ring; window.dispatchEvent(new Event('alarm-changed')); }
    if (ring && Date.now() - lastBeep > ringGap(rung, cookDone)) { lastBeep = Date.now(); beep(); }
  };
  setInterval(tick, 250);
  onTimersChanged(tick);
  tick();
}
/** app.js tells us which screen is showing. */
export function setRoute(name) {
  route = name;
  // The new screen is built just after this: look for buttons under the chip once it's there.
  placeSoon(500);
}
