// Family · Cooking mode (Recipe.dc.html in the design)
// Step-by-step with big buttons, tickable ingredients, and real countdown timers.
// Progress (step, ticks, timers) is saved per recipe id so leaving the screen or
// switching recipes doesn't lose it; timers keep counting in the background via their end time.
// "All recipes" goes to the recipe browser; the recipe being cooked is remembered in localStorage.
// #/recipe/<id> opens that recipe; plain #/recipe opens the one in progress, else tonight's.
import { settings } from '../config.js';
import { getRecipe, ingredientText, metaLine } from '../services/recipe-data.js';
import { tonight } from '../services/meal-plan.js';

const esc = (x) => String(x == null ? '' : x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ALARM_MAX_MS = 2 * 60 * 1000; // stop ringing after 2 minutes if nobody taps
const CURRENT_KEY = 'recipe.current';
let tickTimer, audio;

// ---- Saved state ----------------------------------------------------------
const keyFor = (id) => `recipe.v1.${id}`;
function load(r) {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(keyFor(r.id)) || 'null'); } catch (e) { s = null; }
  s = s || {};
  const checked = s.checked || [];
  return {
    step: Math.min(Math.max(0, s.step || 0), r.steps.length - 1),
    checked: r.ingredients.map((_, i) => !!checked[i]),
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
// Running, paused, or finished but not yet dismissed.
function isActive(s, i) {
  const st = status(s, i);
  return st === 'running' || st === 'paused' || (st === 'done' && !s.timers[i].ack);
}
function activeTimers(r, s) {
  return r.steps.map((_, i) => i).filter((i) => r.steps[i].timer && isActive(s, i));
}
// Someone has started cooking this recipe.
function inProgress(r, s) {
  return s.step > 0 || s.checked.some(Boolean) || activeTimers(r, s).length > 0;
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
    if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
  } catch (e) { /* no audio available */ }
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

// Short name for chips about another recipe's timer ("Slow-cooker white…").
const shortTitle = (t) => (t.length > 18 ? `${t.slice(0, 17)}…` : t);
// Long steps get slightly smaller type so they always fit the card.
const stepSize = (text) => (text.length <= 90 ? 46 : text.length <= 130 ? 40 : 34);

// ---- Screen -----------------------------------------------------------------
export function mount(el, ctx) {
  el.innerHTML = '<div class="k-empty" style="height:100%;display:flex;align-items:center;justify-content:center;font-size:22px;color:#4A5363">Loading recipe…</div>';
  start(el, (ctx && ctx.args) || []).catch((err) => {
    console.error(err);
    if (el.isConnected) el.innerHTML = '<div style="height:100%;display:flex;flex-direction:column;gap:20px;align-items:center;justify-content:center;font-size:22px;color:#4A5363">Couldn’t load the recipe. Check the Wi-Fi.<a href="#/recipes" class="pill" style="background:#1D2430;color:#fff">All recipes</a></div>';
  });
}

async function start(el, args) {
  const a = settings.accent;

  // Every recipe with saved progress (so running timers in other recipes keep showing).
  const savedIds = [];
  for (let k = 0; k < localStorage.length; k++) {
    const key = localStorage.key(k);
    if (key && key.indexOf('recipe.v1.') === 0) savedIds.push(key.slice(10));
  }
  const loaded = await Promise.all(savedIds.map((id) => getRecipe(id).catch(() => null)));
  const recipes = {};
  loaded.forEach((x) => { if (x) recipes[x.id] = x; });
  const list = loaded.filter(Boolean);

  // The recipe asked for, else the one in progress, else tonight's.
  let r = null;
  let s = null;
  if (args[0]) r = await getRecipe(args[0]);
  if (!r) {
    r = await getRecipe(localStorage.getItem(CURRENT_KEY));
    s = r ? load(r) : null;
    if (!r || !inProgress(r, s)) {
      const t = await tonight();
      r = (t && await getRecipe(t.entry.id)) || r;
    }
  }
  if (!el.isConnected) return;
  if (!r) { location.hash = '#/recipes'; return; }
  recipes[r.id] = r;
  s = load(r);
  localStorage.setItem(CURRENT_KEY, r.id);

  // Other recipes with timers still going (so switching never loses a running timer).
  let others = [];
  function loadOthers() {
    others = list.filter((x) => x.id !== r.id)
      .map((x) => ({ r: x, s: load(x) }))
      .filter((o) => activeTimers(o.r, o.s).length > 0);
  }
  loadOthers();

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
    .rc-pillbtn{border:none;background:#FFFFFF;color:#1D2430;font-family:Inter,sans-serif;cursor:pointer;flex:none}
    .rc-chooser{position:absolute;top:0;right:0;bottom:0;left:0;background:var(--bg);padding:40px;
      display:flex;flex-direction:column;gap:24px;z-index:2}
    .rc-grid{flex-grow:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;display:grid;
      grid-template-columns:repeat(4,minmax(0,1fr));gap:20px;align-content:start;padding-bottom:4px}
    .rc-card{border:3px solid transparent;background:#FFFFFF;border-radius:var(--radius);padding:22px;min-height:168px;
      display:flex;flex-direction:column;gap:10px;text-align:left;font-family:Inter,sans-serif;color:#1D2430;cursor:pointer;
      transition:transform .1s ease}
    .rc-card:active{transform:scale(.97)}
    .rc-card.tonight{border-color:${a}}
    .rc-card .t{font-size:24px;font-weight:500;line-height:1.15}
    .rc-card .m{font-size:15px;color:#4A5363}
    .rc-tag{align-self:flex-start;border-radius:999px;padding:5px 12px;font-size:14px;font-weight:600;background:#F4F5F7;color:#1D2430}
    .rc-badge{align-self:flex-start;border-radius:999px;padding:5px 12px;font-size:14px;font-weight:600;background:${a};color:#FFFFFF}
    .rc-badge.now{background:#1D2430}
  </style>
  <div data-root style="height:100%;position:relative">
    <div data-cook style="height:100%;padding:40px;display:flex;flex-direction:column;gap:24px"></div>
  </div>`;

  const $ = (sel) => el.querySelector(sel);

  // ---- Cooking mode ----
  function renderCook() {
    sideHtml = '';
    $('[data-cook]').innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:16px">
      <a href="#/home" class="pill" style="background:#FFFFFF;flex:none">← Home</a>
      <div class="display" style="font-size:34px;font-weight:500;flex:1;min-width:0;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(r.title)}</div>
      <div class="muted" style="font-size:18px;flex:none">${esc(metaLine(r))}</div>
      <a href="#/recipes" class="pill rc-pillbtn">All recipes</a>
    </div>
    <div style="flex-grow:1;display:grid;grid-template-columns:380px minmax(0,1fr);gap:24px;min-height:0">
      <div class="card" style="padding:28px;display:flex;flex-direction:column;gap:14px;overflow:auto">
        <div class="eyebrow muted">Ingredients</div>
        ${r.ingredients.map((ing, i) => `
          <label class="rc-ing${s.checked[i] ? ' on' : ''}">
            <input type="checkbox" data-ing="${i}"${s.checked[i] ? ' checked' : ''}><span>${esc(ingredientText(ing))}</span>
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
    </div>`;
    renderStep();
  }

  function renderStep() {
    const i = s.step;
    const step = r.steps[i];
    const last = i === r.steps.length - 1;
    $('[data-stepnum]').textContent = `Step ${i + 1} of ${r.steps.length}`;
    const text = $('[data-steptext]');
    text.textContent = step.text;
    text.style.fontSize = `${stepSize(step.text)}px`;
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
    let chips = r.steps.map((stp, j) => {
      if (j === i || !stp.timer || !isActive(s, j)) return '';
      const st = status(s, j);
      const done = st === 'done';
      return `<button class="rc-chip${done ? ' done' : ''}" data-jump="${j}">Step ${j + 1} · ${done ? 'Time’s up!' : fmt(remaining(r, s, j))}${st === 'paused' ? ' (paused)' : ''}</button>`;
    }).join('');
    // ...and for timers still going in other recipes (tap to switch back).
    others.forEach((o) => {
      activeTimers(o.r, o.s).forEach((j) => {
        const st = status(o.s, j);
        const done = st === 'done';
        chips += `<button class="rc-chip${done ? ' done' : ''}" data-other="${o.r.id}" data-ostep="${j}">${shortTitle(o.r.title)} · ${done ? 'Time’s up!' : fmt(remaining(o.r, o.s, j))}${st === 'paused' ? ' (paused)' : ''}</button>`;
        if (done && Date.now() - o.s.timers[j].end < ALARM_MAX_MS) ringing = true;
      });
    });
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

  // Switch cooking mode to another recipe. Its own saved progress is kept only if
  // `keep` (going back to a recipe with timers running); otherwise it starts fresh.
  function openRecipe(id, keep) {
    const next = recipes[id];
    if (!next) return;
    if (next.id !== r.id) {
      if (!keep && !activeTimers(next, load(next)).length) localStorage.removeItem(keyFor(next.id));
      r = next;
      s = load(r);
      localStorage.setItem(CURRENT_KEY, r.id);
      loadOthers();
      renderCook();
    }
  }

  const root = $('[data-root]');
  function onClick(e) {
    const t = e.target.closest('button');
    if (!t) return;
    ensureAudio(); // unlock sound on the first tap so alarms can play later
    const i = s.step;
    if (t.matches('[data-other]')) {
      const j = +t.dataset.ostep;
      openRecipe(t.dataset.other, true);
      if (status(s, j) === 'done') { s.timers[j].ack = true; save(r, s); }
      setStep(j);
    } else if (t.matches('[data-prev]')) setStep(i - 1);
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
  }
  function onChange(e) {
    const cb = e.target.closest('[data-ing]');
    if (!cb) return;
    s.checked[+cb.dataset.ing] = cb.checked;
    cb.parentElement.classList.toggle('on', cb.checked);
    save(r, s);
  }
  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);

  renderCook();
  clearInterval(tickTimer);
  tickTimer = setInterval(() => { if (el.isConnected) tick(); }, 250);
}

export function unmount() {
  clearInterval(tickTimer);
  tickTimer = null;
}
