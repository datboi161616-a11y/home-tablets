// Family · Kitchen timers: big presets, several at once, ring on any screen.
import { settings } from '../config.js';
import {
  timers, state, left, fmt, addTimer, pauseTimer, resumeTimer, addMinute, removeTimer, stopRinging, onTimersChanged,
} from '../services/timers.js';

const PRESETS = [1, 2, 3, 5, 10, 15, 20, 30, 45, 60]; // minutes
let tickTimer, off;

const presetLabel = (m) => (m >= 60 ? `${m / 60} hr` : `${m} min`);

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
        <div data-custom-val class="display" style="font-size:34px;font-weight:500;min-width:120px;text-align:center"></div>
        <button class="tm-b" data-custom="1">+1</button>
        <button class="tm-b" data-custom="5">+5</button>
        <button class="tm-b solid" data-start-custom>Start</button>
      </div>
      <div class="muted" style="font-size:17px">Timers keep running on every screen. When one finishes it rings until you tap it.</div>
    </div>
    <div data-list style="display:flex;flex-direction:column;gap:14px;overflow-y:auto;min-height:0"></div>
  </div>`;

  const $ = (s) => el.querySelector(s);
  const showCustom = () => { $('[data-custom-val]').textContent = presetLabel(custom); };
  showCustom();

  let lastHtml = '';
  function render() {
    const list = timers();
    const html = list.length ? list.map((t) => {
      const st = state(t);
      const done = st === 'done';
      return `
      <div class="tm-card${done ? ' done' : ''}">
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:18px;font-weight:600">
          <span>${t.label}</span><span style="opacity:.75">${st === 'paused' ? 'Paused' : done ? 'Time’s up!' : st === 'stopped' ? 'Finished' : ''}</span>
        </div>
        <div class="tm-clock" data-clock="${t.id}">${fmt(left(t))}</div>
        <div style="display:flex;gap:10px">
          ${done ? '<button class="tm-b" data-stop>Stop</button>' : st === 'stopped' ? '' : `
            <button class="tm-b dark" data-${st === 'paused' ? 'resume' : 'pause'}="${t.id}">${st === 'paused' ? 'Resume' : 'Pause'}</button>
            <button class="tm-b" data-plus="${t.id}">+1 min</button>`}
          <button class="tm-b" data-remove="${t.id}" style="margin-left:auto">${st === 'stopped' || done ? 'Clear' : 'Cancel'}</button>
        </div>
      </div>`;
    }).join('') : '<div class="card muted" style="padding:28px;font-size:19px;text-align:center">No timers running</div>';
    // Rebuild only when the set of buttons changes; otherwise just update the clocks.
    const shape = html.replace(/data-clock="([^"]+)">[^<]*</g, 'data-clock="$1"><');
    if (shape !== lastHtml) { lastHtml = shape; $('[data-list]').innerHTML = html; }
    else list.forEach((t) => { const c = el.querySelector(`[data-clock="${t.id}"]`); if (c) c.textContent = fmt(left(t)); });
  }

  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const d = b.dataset;
    if (d.start) addTimer(+d.start * 60);
    else if (d.custom) { custom = Math.min(600, Math.max(1, custom + +d.custom)); showCustom(); }
    else if (b.matches('[data-start-custom]')) addTimer(custom * 60);
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

export function unmount() { clearInterval(tickTimer); if (off) off(); off = null; }
