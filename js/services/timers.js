// Kitchen timers that run on any screen (separate from cooking-mode step timers).
// Saved with their end time, so they keep counting through screen changes and reloads.
//   { id, label, secs, end }            running
//   { id, label, secs, left }           paused (ms left)
//   { id, label, secs, end, ack: true } finished and stopped (removed shortly after)
const KEY = 'kitchen.timers.v1';
const RING_MS = 2 * 60 * 1000; // ring for up to 2 minutes if nobody taps
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
export const ringing = () => timers().some((t) => state(t) === 'done' && Date.now() - t.end < RING_MS);

export function labelFor(secs) {
  const m = Math.round(secs / 60);
  return m >= 60 && m % 60 === 0 ? `${m / 60} hr timer` : `${m} min timer`;
}

export function addTimer(secs, label) {
  const list = timers().slice(-(MAX - 1));
  list.push({ id: `t${Date.now()}`, label: label || labelFor(secs), secs, end: Date.now() + secs * 1000 });
  write(list);
}
function change(id, fn) { write(timers().map((t) => (t.id === id ? fn(Object.assign({}, t)) : t))); }
export const pauseTimer = (id) => change(id, (t) => ({ id: t.id, label: t.label, secs: t.secs, left: left(t) }));
export const resumeTimer = (id) => change(id, (t) => ({ id: t.id, label: t.label, secs: t.secs, end: Date.now() + t.left }));
export const addMinute = (id) => change(id, (t) => (t.end != null
  ? { id: t.id, label: t.label, secs: t.secs, end: Math.max(t.end, Date.now()) + 60000 }
  : Object.assign(t, { left: t.left + 60000 })));
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
function beep() {
  ensureAudio();
  if (!audio) return;
  const t0 = audio.currentTime;
  [0, 0.22, 0.44, 0.9, 1.12, 1.34].forEach((d) => {
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.type = 'sine';
    o.frequency.value = 988;
    g.gain.setValueAtTime(0.0001, t0 + d);
    g.gain.exponentialRampToValueAtTime(0.45, t0 + d + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.16);
    o.connect(g).connect(audio.destination);
    o.start(t0 + d);
    o.stop(t0 + d + 0.18);
  });
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
  chip.addEventListener('click', () => {
    ensureAudio();
    if (ringing()) stopRinging();
    else location.hash = '#/timers';
  });
  // Unlock sound on the first touch anywhere, so alarms can play later.
  addEventListener('pointerdown', ensureAudio, true);

  const tick = () => {
    const list = timers().filter((t) => state(t) !== 'stopped');
    const ring = ringing();
    // The Timers screen shows everything itself; cooking mode has its own timers,
    // so the chip only appears there when something is ringing.
    const hide = !list.length || ((route === 'timers' || route === 'recipe') && !ring);
    chip.style.display = hide ? 'none' : 'inline-flex';
    if (!hide) {
      const soonest = list.filter((t) => state(t) === 'running').sort((a, b) => a.end - b.end)[0] || list[0];
      const more = list.length > 1 ? ` · +${list.length - 1}` : '';
      const text = ring ? '⏰ Time’s up! Tap to stop' : `⏱ ${fmt(left(soonest))}${state(soonest) === 'paused' ? ' (paused)' : ''}${more}`;
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
