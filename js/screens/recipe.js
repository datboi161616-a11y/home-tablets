// Family · Cooking mode (Recipe.dc.html in the design)
// Step-by-step with big buttons, tickable ingredients, and real countdown timers.
// Progress (step, ticks, timers) is saved so leaving the screen doesn't lose it;
// timers keep counting in the background via their end time.
import { settings } from '../config.js';
import { recipes, defaultRecipe } from '../services/recipe-data.js';

const ALARM_MAX_MS = 2 * 60 * 1000; // stop ringing after 2 minutes if nobody taps
let tickTimer, audio;

// ---- Saved state ----------------------------------------------------------
const keyFor = (id) => `recipe.v1.${id}`;
function load(r) {
  const s = JSON.parse(localStorage.getItem(keyFor(r.id)) || 'null') || {};
  return {
    step: Math.min(Math.max(0, s.step || 0), r.steps.length - 1),
    checked: r.ingredients.map((_, i) => !!s.checked?.[i]),
    // timers[i]: { end } running · { left } paused · { end, ack } finished and dismissed
    timers: s.timers || {},
  };
}
const save = (r, s) => localStorage.setItem(keyFor(r.id), JSON.stringify(s));

// ---- Timer helpers --------------------------------------------------------
function remaining(r, s, i) {
  const t = s.timers[i];
  if (!t) return r.steps[i].timer * 1000;
  if (t.end != null) return Math.max(0, t.end - Date.now());
  return t.left;
}
function status(s, i) {
  const t = s.timers[i];
  if (!t) return 'idle';
  if (t.end != null) return t.end <= Date.now() ? 'done' : 'running';
  return 'paused';
}
function fmt(ms) {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

// ---- Alarm sound (Web Audio, no files needed) ------------------------------
function ensureAudio() {
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
  } catch { /* no audio available */ }
}
function beep() {
  if (!audio) return;
  const t0 = audio.currentTime;
  [0, 0.25, 0.5].forEach((d) => {
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.type = 'sine';
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, t0 + d);
    g.gain.exponentialRampToValueAtTime(0.4, t0 + d + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.18);
    o.connect(g).connect(audio.destination);
    o.start(t0 + d);
    o.stop(t0 + d + 0.2);
  });
}

// ---- Screen -----------------------------------------------------------------
export function mount(el) {
  const a = settings.accent;
  const r = recipes[defaultRecipe];
  const s = load(r);
  let lastBeep = 0;
  let sideHtml = '';

  el.innerHTML = `
  <style>
    .rc-btn{min-height:64px;border-radius:999px;font-size:20px;font-weight:600;font-family:Inter,sans-serif;cursor:pointer;
      display:inline-flex;align-items:center;justify-content:center;gap:10px;transition:transform .1s ease}
    .rc-btn:active{transform:scale(.96)}
    .rc-btn[disabled]{opacity:.35;pointer-events:none}
    .rc-ghost{padding:0 32px;border:2px solid #1D2430;background:#FFFFFF;color:#1D2430}
    .rc-solid{padding:0 40px;border:none;background:${a};color:#FFFFFF}
    .rc-ing{display:flex;align-items:center;gap:12px;font-size:19px;min-height:44px;cursor:pointer}
    .rc-ing input{width:22px;height:22px;accent-color:${a};flex:none;margin:0}
    .rc-ing.on span{color:#4A5363;text-decoration:line-through}
    .rc-timer{display:flex;align-items:center;gap:20px;border-radius:20px;background:#F4F5F7;padding:18px 18px 18px 26px}
    .rc-timer.done{background:${a};color:#FFFFFF;animation:rc-pulse 1s ease-in-out infinite alternate}
    @keyframes rc-pulse{from{opacity:1}to{opacity:.8}}
    .rc-tbtn{min-height:56px;min-width:56px;padding:0 24px;border-radius:999px;border:none;font-size:18px;font-weight:600;
      font-family:Inter,sans-serif;cursor:pointer;background:#1D2430;color:#FFFFFF}
    .rc-tbtn.light{background:#FFFFFF;color:#1D2430;border:2px solid #D9DDE2}
    .rc-timer.done .rc-tbtn{background:#FFFFFF;color:${a}}
    .rc-chip{min-height:44px;padding:0 18px;border-radius:999px;border:none;background:#F4F5F7;color:#1D2430;
      font-size:16px;font-weight:600;font-family:Inter,sans-serif;cursor:pointer;display:inline-flex;align-items:center;gap:8px}
    .rc-chip.done{background:${a};color:#FFFFFF}
  </style>
  <div data-root style="height:100%;padding:40px;display:flex;flex-direction:column;gap:24px">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:16px">
      <a href="#/home" class="pill" style="background:#FFFFFF">← Home</a>
      <div class="display" style="font-size:34px;font-weight:500">${r.title}</div>
      <div class="muted" style="font-size:18px">${r.meta}</div>
    </div>
    <div style="flex-grow:1;display:grid;grid-template-columns:380px minmax(0,1fr);gap:24px;min-height:0">
      <div class="card" style="padding:28px;display:flex;flex-direction:column;gap:14px;overflow:auto">
        <div class="eyebrow muted">Ingredients</div>
        ${r.ingredients.map((ing, i) => `
          <label class="rc-ing${s.checked[i] ? ' on' : ''}">
            <input type="checkbox" data-ing="${i}"${s.checked[i] ? ' checked' : ''}><span>${ing}</span>
          </label>`).join('')}
      </div>
      <div class="card" style="padding:40px;display:flex;flex-direction:column;justify-content:space-between;gap:24px;min-width:0">
        <div style="display:flex;flex-direction:column;gap:20px">
          <div data-stepnum style="font-size:18px;font-weight:600;color:${a}"></div>
          <div data-steptext class="display" style="font-size:46px;font-weight:500;line-height:1.2"></div>
        </div>
        <div data-timerbox></div>
        <div style="display:flex;align-items:center;gap:16px">
          <button data-prev class="rc-btn rc-ghost">Back</button>
          <button data-next class="rc-btn rc-solid"></button>
          <div data-side style="margin-left:auto;display:flex;gap:10px;align-items:center;justify-content:flex-end;flex-wrap:wrap;min-width:0"></div>
        </div>
      </div>
    </div>
  </div>`;

  const $ = (sel) => el.querySelector(sel);

  function renderStep() {
    const i = s.step;
    const step = r.steps[i];
    const last = i === r.steps.length - 1;
    $('[data-stepnum]').textContent = `Step ${i + 1} of ${r.steps.length}`;
    $('[data-steptext]').textContent = step.text;
    $('[data-prev]').disabled = i === 0;
    $('[data-next]').textContent = last ? 'Start over' : 'Next step';
    $('[data-timerbox]').innerHTML = step.timer ? `
      <div class="rc-timer" data-timer>
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M10 2h4"/></svg>
        <div style="display:flex;flex-direction:column;gap:2px;min-width:0">
          <div data-tlabel style="font-size:16px;font-weight:600"></div>
          <div data-tclock class="display" style="font-size:52px;font-weight:500;line-height:1;font-variant-numeric:tabular-nums"></div>
        </div>
        <div style="margin-left:auto;display:flex;gap:10px">
          <button data-treset class="rc-tbtn light">Reset</button>
          <button data-ttoggle class="rc-tbtn"></button>
        </div>
      </div>` : '';
    tick();
  }

  // Updates the countdowns, the "other timers" chips and the alarm.
  function tick() {
    const i = s.step;
    const step = r.steps[i];
    let ringing = false;

    if (step.timer) {
      const st = status(s, i);
      const box = $('[data-timer]');
      box.classList.toggle('done', st === 'done' && !s.timers[i].ack);
      $('[data-tclock]').textContent = fmt(remaining(r, s, i));
      $('[data-tlabel]').textContent = st === 'done'
        ? (s.timers[i].ack ? `${step.timerLabel} · finished` : `${step.timerLabel} · Time’s up!`)
        : st === 'paused' ? `${step.timerLabel} · paused` : step.timerLabel;
      const toggle = $('[data-ttoggle]');
      const label = st === 'running' ? 'Pause' : st === 'paused' ? 'Resume' : st === 'done' ? (s.timers[i].ack ? 'Restart' : 'Stop') : 'Start';
      if (toggle.textContent !== label) toggle.textContent = label;
      $('[data-treset]').style.display = st === 'idle' ? 'none' : '';
    }

    // Chips for timers on other steps (tap to jump there).
    const chips = r.steps.map((stp, j) => {
      if (j === i || !stp.timer) return '';
      const st = status(s, j);
      if (st === 'idle' || (st === 'done' && s.timers[j].ack)) return '';
      const done = st === 'done';
      return `<button class="rc-chip${done ? ' done' : ''}" data-jump="${j}">Step ${j + 1} · ${done ? 'Time’s up!' : fmt(remaining(r, s, j))}${st === 'paused' ? ' (paused)' : ''}</button>`;
    }).join('');
    const side = $('[data-side]');
    const html = chips || '<span class="muted" style="font-size:18px">Big buttons for messy hands</span>';
    if (sideHtml !== html) { sideHtml = html; side.innerHTML = html; }

    // Ring while any finished timer hasn't been acknowledged.
    r.steps.forEach((stp, j) => {
      if (stp.timer && status(s, j) === 'done' && !s.timers[j].ack) {
        if (Date.now() - s.timers[j].end < ALARM_MAX_MS) ringing = true;
      }
    });
    if (ringing && Date.now() - lastBeep > 2500) { lastBeep = Date.now(); beep(); }
  }

  function setStep(i) {
    s.step = Math.min(Math.max(0, i), r.steps.length - 1);
    save(r, s);
    renderStep();
  }

  const root = $('[data-root]');
  root.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    ensureAudio(); // unlock sound on the first tap so alarms can play later
    const i = s.step;
    if (t.matches('[data-prev]')) setStep(i - 1);
    else if (t.matches('[data-next]')) {
      if (i === r.steps.length - 1) {
        // Start over: clear ticks and timers.
        s.checked = s.checked.map(() => false);
        s.timers = {};
        el.querySelectorAll('[data-ing]').forEach((cb) => { cb.checked = false; cb.parentElement.classList.remove('on'); });
        setStep(0);
      } else setStep(i + 1);
    } else if (t.matches('[data-ttoggle]')) {
      const st = status(s, i);
      if (st === 'running') s.timers[i] = { left: remaining(r, s, i) };
      else if (st === 'paused') s.timers[i] = { end: Date.now() + s.timers[i].left };
      else if (st === 'done' && !s.timers[i].ack) s.timers[i].ack = true;
      else s.timers[i] = { end: Date.now() + r.steps[i].timer * 1000 };
      save(r, s); tick();
    } else if (t.matches('[data-treset]')) {
      delete s.timers[i];
      save(r, s); tick();
    } else if (t.matches('[data-jump]')) {
      const j = +t.dataset.jump;
      if (status(s, j) === 'done') { s.timers[j].ack = true; save(r, s); }
      setStep(j);
    }
  });

  root.addEventListener('change', (e) => {
    const cb = e.target.closest('[data-ing]');
    if (!cb) return;
    s.checked[+cb.dataset.ing] = cb.checked;
    cb.parentElement.classList.toggle('on', cb.checked);
    save(r, s);
  });

  renderStep();
  tickTimer = setInterval(tick, 250);
}

export function unmount() {
  clearInterval(tickTimer);
}
