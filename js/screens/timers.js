// Family · Kitchen timers: big presets, several at once, ring on any screen.
import { settings } from '../config.js';
import {
  timers, state, left, fmt, addTimer, pauseTimer, resumeTimer, addMinute, restartTimer, removeTimer, stopRinging,
  onTimersChanged, minutesText,
} from '../services/timers.js';
import { spot } from '../art.js';

const PRESETS = [1, 2, 3, 5, 10, 15, 20, 30, 45, 60]; // minutes
let tickTimer, off, fullTimer;

// Nothing running: the kitchen timer picture on a soft halo instead of the tile's square background.
const idleArt = () => spot.timer().replace(/<rect width="285" height="170"[^>]*\/>/, '<circle cx="143" cy="92" r="78" fill="#FBF3EE"/>');

const presetLabel = minutesText; // "25 min", "1 hr", "1 hr 30 min"
const clockText = (ms) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
// Ringing first, then the one finishing soonest, then paused, then finished.
const ORDER = { done: 0, running: 1, paused: 2, stopped: 3 };
const sorted = (list) => list.slice().sort((a, b) => (ORDER[state(a)] - ORDER[state(b)]) || (left(a) - left(b)));

export function mount(el) {
  const a = settings.accent;
  let custom = 25;
  el.innerHTML = `
  <style>
    .tm-wrap{height:100%;padding:32px 40px 40px;display:grid;grid-template-columns:minmax(0,1fr) 520px;gap:24px}
    .tm-presets{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:14px}
    .tm-p{min-height:104px;border-radius:22px;border:none;background:#FFFFFF;color:#1D2430;font-family:Outfit,sans-serif;font-size:34px;font-weight:500;cursor:pointer;transition:transform .1s ease}
    .tm-p:active,.tm-b:active{transform:scale(.96)}
    .tm-b{min-height:56px;padding:0 22px;border-radius:999px;border:none;font:600 18px Inter,sans-serif;cursor:pointer;background:#F1F2F4;color:#1D2430;transition:transform .1s ease}
    .tm-b.dark{background:#1D2430;color:#FFFFFF}
    .tm-b.solid{background:${a};color:#FFFFFF}
    .tm-card{background:#FFFFFF;border-radius:22px;padding:20px 22px;display:flex;flex-direction:column;gap:12px}
    .tm-card.done{background:${a};color:#FFFFFF;animation:tm-pulse 1s ease-in-out infinite alternate}
    .tm-card.done .tm-b{background:#FFFFFF;color:${a}}
    @keyframes tm-pulse{from{opacity:1}to{opacity:.8}}
    .tm-clock{font-family:Outfit,sans-serif;font-size:64px;font-weight:500;line-height:1;font-variant-numeric:tabular-nums}
    .tm-bar{height:8px;border-radius:999px;background:#EEF0F2;overflow:hidden;margin-top:-2px}
    .tm-bar i{display:block;height:100%;border-radius:999px;background:${a};transition:width .25s linear}
    .tm-card.paused .tm-bar i{background:#8A93A3}
    .tm-card.done .tm-bar,.tm-card.stopped .tm-bar{display:none}
    .tm-full{font-size:17px;font-weight:600;color:${a}}
  </style>
  <div class="tm-wrap">
    <div style="display:flex;flex-direction:column;gap:22px;min-width:0">
      <div style="display:flex;align-items:center;gap:16px">
        <a href="#/home" class="pill" style="background:#FFFFFF">← Home</a>
        <div class="display" style="font-size:34px;font-weight:500">Timers</div>
      </div>
      <div class="eyebrow muted">Tap to start</div>
      <div class="tm-presets">${PRESETS.map((m) => `<button class="tm-p" data-start="${m}">${presetLabel(m)}</button>`).join('')}</div>
      <div class="card" style="padding:20px 24px;display:flex;align-items:center;gap:14px">
        <div style="font-size:19px;font-weight:600;flex:1">Other time</div>
        <button class="tm-b" data-custom="-5">−5</button>
        <button class="tm-b" data-custom="-1">−1</button>
        <div data-custom-val class="display" style="font-size:34px;font-weight:500;min-width:120px;max-width:160px;text-align:center;line-height:1.05"></div>
        <button class="tm-b" data-custom="1">+1</button>
        <button class="tm-b" data-custom="5">+5</button>
        <button class="tm-b solid" data-start-custom>Start</button>
      </div>
      <div class="muted" style="font-size:17px">Timers keep running on every screen. When one finishes it rings until you tap it.</div>
      <div data-full class="tm-full"></div>
    </div>
    <div data-list style="display:flex;flex-direction:column;gap:14px;overflow-y:auto;min-height:0"></div>
  </div>`;

  const $ = (s) => el.querySelector(s);
  const showCustom = () => {
    const v = $('[data-custom-val]');
    v.textContent = presetLabel(custom);
    v.style.fontSize = custom >= 60 && custom % 60 ? '26px' : '34px'; // "1 hr 10 min" on two short lines
  };
  showCustom();

  let lastHtml = '';
  function render() {
    const list = sorted(timers());
    const pct = (t) => `${Math.max(0, Math.min(100, (left(t) / Math.max(1000, t.secs * 1000)) * 100)).toFixed(1)}%`;
    const html = list.length ? list.map((t) => {
      const st = state(t);
      const done = st === 'done';
      // Running timers say when they'll ring, so you know without doing sums.
      const note = st === 'paused' ? 'Paused' : done ? 'Time’s up!' : st === 'stopped' ? 'Finished' : `Rings at ${clockText(t.end)}`;
      return `
      <div class="tm-card ${st}">
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:18px;font-weight:600;gap:12px">
          <span>${t.label}</span><span style="opacity:.75;white-space:nowrap">${note}</span>
        </div>
        <div class="tm-clock" data-clock="${t.id}">${fmt(left(t))}</div>
        <div class="tm-bar"><i data-bar="${t.id}" style="width:${pct(t)}"></i></div>
        <div style="display:flex;gap:10px">
          ${done ? `<button class="tm-b" data-stop>Stop</button><button class="tm-b" data-plus="${t.id}">1 more min</button>`
            : st === 'stopped' ? `<button class="tm-b dark" data-again="${t.id}">Start again</button>` : `
            <button class="tm-b dark" data-${st === 'paused' ? 'resume' : 'pause'}="${t.id}">${st === 'paused' ? 'Resume' : 'Pause'}</button>
            <button class="tm-b" data-plus="${t.id}">+1 min</button>`}
          <button class="tm-b" data-remove="${t.id}" style="margin-left:auto">${st === 'stopped' || done ? 'Clear' : 'Cancel'}</button>
        </div>
      </div>`;
    }).join('') : `<div class="card" style="flex-grow:1;padding:28px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;text-align:center">
        ${idleArt()}
        <div class="display" style="font-size:28px;font-weight:500">No timers running</div>
        <div class="muted" style="font-size:18px;line-height:1.4;max-width:340px">Tap a time on the left to start one. You can run up to 8 at once.</div>
      </div>`;
    // Rebuild only when the set of buttons changes; otherwise just update the clocks and bars.
    const shape = html.replace(/data-clock="([^"]+)">[^<]*</g, 'data-clock="$1"><').replace(/width:[\d.]+%/g, '');
    if (shape !== lastHtml) { lastHtml = shape; $('[data-list]').innerHTML = html; }
    else {
      list.forEach((t) => {
        const c = el.querySelector(`[data-clock="${t.id}"]`);
        if (c) c.textContent = fmt(left(t));
        const b = el.querySelector(`[data-bar="${t.id}"]`);
        if (b) b.style.width = pct(t);
      });
    }
  }
  function tooMany() {
    $('[data-full]').textContent = 'That’s 8 timers going already. Cancel one to start another.';
    clearTimeout(fullTimer);
    fullTimer = setTimeout(() => { if (el.isConnected) $('[data-full]').textContent = ''; }, 5000);
  }

  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const d = b.dataset;
    if (d.start) { if (!addTimer(+d.start * 60)) tooMany(); }
    else if (d.custom) { custom = Math.min(600, Math.max(1, custom + +d.custom)); showCustom(); }
    else if (b.matches('[data-start-custom]')) { if (!addTimer(custom * 60)) tooMany(); }
    else if (d.again) restartTimer(d.again);
    else if (d.pause) pauseTimer(d.pause);
    else if (d.resume) resumeTimer(d.resume);
    else if (d.plus) addMinute(d.plus);
    else if (d.remove) removeTimer(d.remove);
    else if (b.matches('[data-stop]')) stopRinging();
  });

  render();
  off = onTimersChanged(render);
  tickTimer = setInterval(() => { if (el.isConnected) render(); }, 250);
}

export function unmount() { clearInterval(tickTimer); clearTimeout(fullTimer); if (off) off(); off = null; }
