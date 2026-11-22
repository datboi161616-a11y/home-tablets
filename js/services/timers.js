// Kitchen timers that run on any screen (separate from cooking-mode step timers).
// Saved with their end time, so they keep counting through screen changes and reloads.
//   { id, label, secs, end }            running
//   { id, label, secs, left }           paused (ms left)
//   { id, label, secs, end, ack: true } finished and stopped (removed shortly after)
import { display } from './display.js';

const KEY = 'kitchen.timers.v1';
// An alarm nobody stops rings for two minutes, or as long as the owner chose (Settings).
const ringMs = () => Math.max(1, +display().alarmMinutes || 2) * 60 * 1000;
const MAX = 8;

const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]') || []; } catch (e) { return []; } };
function write(list) {
  localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new Event('timers-changed'));
}

export function onTimersChanged(cb) {
  window.addEventListener('timers-changed', cb);
  return () => window.removeEventListener('timers-changed', cb);
}

/** Timers to show: finished ones disappear a minute after they're stopped. */
export function timers() {
  const now = Date.now();
  return read().filter((t) => !(t.ack && now - t.end > 60 * 1000));
}
export const left = (t) => (t.end != null ? Math.max(0, t.end - Date.now()) : t.left);
export const state = (t) => (t.end == null ? 'paused' : t.end <= Date.now() ? (t.ack ? 'stopped' : 'done') : 'running');
const ringingNow = () => timers().filter((t) => state(t) === 'done' && Date.now() - t.end < ringMs());
export const ringing = () => ringingNow().length > 0;

/** "25 min", "1 hr", "1 hr 30 min" */
export function minutesText(m) {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} hr ${r} min` : `${h} hr`;
}
export const labelFor = (secs) => `${minutesText(Math.round(secs / 60))} timer`;

/** Start a timer. Returns false if all MAX timers are still going (nothing is dropped). */
export function addTimer(secs, label) {
  const list = timers();
  // Make room by clearing finished-and-stopped timers, oldest first; never drop one that's
  // still counting or ringing.
  while (list.length >= MAX) {
    const i = list.findIndex((t) => state(t) === 'stopped');
    if (i < 0) return false;
    list.splice(i, 1);
  }
  list.push({ id: `t${Date.now()}${Math.floor(Math.random() * 1000)}`, label: label || labelFor(secs), secs, end: Date.now() + secs * 1000 });
  write(list);
  return true;
}
function change(id, fn) { write(timers().map((t) => (t.id === id ? fn(Object.assign({}, t)) : t))); }
export const pauseTimer = (id) => change(id, (t) => ({ id: t.id, label: t.label, secs: t.secs, left: left(t) }));
export const resumeTimer = (id) => change(id, (t) => ({ id: t.id, label: t.label, secs: t.secs, end: Date.now() + t.left }));
// +1 min also works on a ringing or finished timer ("just one more minute"): it counts again.
// `secs` grows too, so the progress bar stays right.
export const addMinute = (id) => change(id, (t) => (t.end != null
  ? { id: t.id, label: t.label, secs: Math.max(t.secs, Math.ceil(left(t) / 1000)) + 60, end: Math.max(t.end, Date.now()) + 60000 }
  : Object.assign(t, { left: t.left + 60000, secs: t.secs + 60 })));
/** Run a finished timer again for its full time. */
export const restartTimer = (id) => change(id, (t) => ({ id: t.id, label: t.label, secs: t.secs, end: Date.now() + t.secs * 1000 }));
export const removeTimer = (id) => write(timers().filter((t) => t.id !== id));
/** Stop every timer that's ringing. */
export function stopRinging() {
  write(timers().map((t) => (state(t) === 'done' ? Object.assign(t, { ack: true }) : t)));
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
    if (audio.state === 'suspended') audio.resume();
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

export function startTimers() {
  chip = document.createElement('button');
  chip.setAttribute('data-timer-chip', '');
  chip.style.cssText = 'position:absolute;right:24px;bottom:24px;z-index:50;display:none;align-items:center;gap:10px;'
    + 'min-height:56px;padding:0 22px;border:none;border-radius:999px;font:600 20px Inter,sans-serif;cursor:pointer;'
    + 'box-shadow:0 6px 20px rgba(0,0,0,.18);font-variant-numeric:tabular-nums';
  // What cooking mode has going, when it isn't on screen to show and ring it itself.
  const cooking = () => {
    const now = Date.now();
    return route === 'recipe' ? [] : cookingTimers().filter((c) => c.end > now || now - c.end < ringMs());
  };
  chip.addEventListener('click', () => {
    ensureAudio();
    const cooks = cooking();
    const cookRing = cooks.some((c) => c.end <= Date.now());
    if (ringing() || cookRing) { stopRinging(); stopCooking(); }
    else if (timers().some((t) => state(t) !== 'stopped')) location.hash = '#/timers';
    else if (cooks.length) location.hash = `#/recipe/${encodeURIComponent(cooks[0].recipe)}`;
  });
  // Unlock sound on the first touch anywhere, so alarms can play later.
  addEventListener('pointerdown', ensureAudio, true);

  const tick = () => {
    const now = Date.now();
    const list = timers().filter((t) => state(t) !== 'stopped');
    const cooks = cooking();
    const cookDone = cooks.filter((c) => c.end <= now);
    const ring = ringing() || cookDone.length > 0;
    const count = list.length + cooks.length;
    // The Timers screen shows the kitchen timers itself, and cooking mode its own, so the
    // chip only appears there for what they don't show, or when something is ringing.
    const hide = !count || (route === 'recipe' && !ring) || (route === 'timers' && !ring && !cooks.length);
    chip.style.display = hide ? 'none' : 'inline-flex';
    if (!hide) {
      // Whatever runs out first, kitchen timer or cooking step.
      const running = list.filter((t) => state(t) === 'running').map((t) => t.end)
        .concat(cooks.filter((c) => c.end > now).map((c) => c.end)).sort((a, b) => a - b);
      const more = count > 1 ? ` · +${count - 1}` : '';
      // Say which one: with three timers going, "time's up" alone sends people to look.
      const rung = ringingNow();
      const text = ring
        ? (rung.length === 1 ? `⏰ Time’s up! ${rung[0].label} · Tap to stop`
          : cookDone.length && !rung.length ? `⏰ Time’s up! ${cookDone[0].label} · Tap to stop` : '⏰ Time’s up! Tap to stop')
        : running.length ? `⏱ ${fmt(running[0] - now)}${more}` : `⏱ ${fmt(left(list[0]))} (paused)${more}`;
      if (chip.textContent !== text) chip.textContent = text;
      chip.style.background = ring ? 'var(--accent)' : '#1D2430';
      chip.style.color = '#FFFFFF';
      chip.style.opacity = ring && Math.floor(Date.now() / 500) % 2 ? '.75' : '1';
    }
    if (ring && Date.now() - lastBeep > 2500) { lastBeep = Date.now(); beep(); }
  };
  setInterval(tick, 250);
  onTimersChanged(tick);
  tick();
}
/** app.js tells us which screen is showing. */
export function setRoute(name) { route = name; }
