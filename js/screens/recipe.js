// Family · Cooking mode (Recipe.dc.html in the design)
// Step-by-step with big buttons, tickable ingredients, and real countdown timers.
// Progress (step, ticks, timers) is saved per recipe id so leaving the screen or
// switching recipes doesn't lose it; timers keep counting in the background via their end time.
// "All recipes" goes to the recipe browser; the recipe being cooked is remembered in localStorage.
// #/recipe/<id> opens that recipe; plain #/recipe opens the one in progress, else tonight's.
import { settings } from '../config.js';
import { alarmBeep } from '../services/timers.js';
import { display } from '../services/display.js';
import { getRecipe as getRecipeRaw, ingredientText, metaLine, withStepTimers, markCooked } from '../services/recipe-data.js';
import { tonight, servingsFor, scaleFor } from '../services/meal-plan.js';
import { recipeArt, cropFood, FILL } from './kitchen-ui.js';

const esc = (x) => String(x == null ? '' : x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Steps that say "rest 10 minutes" get a timer too, here as on the recipe page.
const getRecipe = (id) => getRecipeRaw(id).then(withStepTimers);

// An alarm nobody stops rings as long as the owner chose for the kitchen timers (Settings).
const alarmMaxMs = () => Math.max(1, +display().alarmMinutes || 2) * 60 * 1000;
const CURRENT_KEY = 'recipe.current';
// Progress left alone longer than this is from another day's cooking: ask before carrying on.
const STALE_MS = 6 * 60 * 60 * 1000;
let tickTimer;

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
    at: s.at || 0, // last saved (to spot yesterday's half-finished cooking)
  };
}
const save = (r, s) => {
  s.at = Date.now();
  try { localStorage.setItem(keyFor(r.id), JSON.stringify(s)); } catch (e) { /* storage full: keeps going on screen */ }
};

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

// ---- Alarm sound -------------------------------------------------------------
// The same alarm as the kitchen timers: the one the owner picked in Settings. (It used
// to ring only after a button on this screen had been tapped, so coming back here from
// the timer chip and waiting left a finished step timer silent.)
function beep() { alarmBeep(); }

// Short name for chips about another recipe's timer ("Slow-cooker white…").
const shortTitle = (t) => (t.length > 18 ? `${t.slice(0, 17)}…` : t);
// What a step's timer is for ("Crisp the pork"), or "Step 3" when the recipe doesn't say.
const timerName = (step, i) => step.timerLabel || `Step ${i + 1}`;
// Long steps get slightly smaller type so they always fit the card.
const stepSize = (text) => (text.length <= 90 ? 46 : text.length <= 130 ? 40 : 34);

// Which ingredients a step mentions ("Add the beef, onion and garlic" -> beef, onion, garlic),
// so the list can point them out. Describing words are skipped so "brown sugar" matches "sugar", not "brown".
const PLAIN = ['fresh', 'large', 'small', 'medium', 'ground', 'lean', 'whole', 'chopped', 'sliced', 'diced', 'minced',
  'unsalted', 'salted', 'boneless', 'skinless', 'black', 'white', 'brown', 'yellow', 'green', 'dried', 'extra',
  'virgin', 'light', 'dark', 'sauce', 'powder', 'leaves', 'cooked', 'frozen', 'canned', 'low-sodium', 'plain', 'sweet'];
function ingredientWords(ing) {
  if (!ing || typeof ing === 'string') return [];
  return String(ing.item).toLowerCase().replace(/\([^)]*\)/g, ' ').split(/[^a-z-]+/)
    .filter((w) => w.length >= 3 && PLAIN.indexOf(w) < 0)
    .map((w) => w.replace(/oes$/, 'o').replace(/([^s])s$/, '$1')); // "eggs" -> "egg", "tomatoes" -> "tomato"
}
// A word several ingredients share ("oil" in vegetable oil and sesame oil) only points at
// one of them when nothing more telling does: "sesame oil" in a step lights up the sesame
// oil, not the vegetable oil as well.
function usedIn(r, stepText) {
  const text = ` ${String(stepText).toLowerCase()} `;
  const lists = r.ingredients.map(ingredientWords);
  const owners = {};
  lists.forEach((ws) => ws.forEach((w) => { owners[w] = (owners[w] || 0) + 1; }));
  const said = (w) => new RegExp(`[^a-z]${w}(es|s)?[^a-z]`).test(text);
  const hits = lists.map((ws) => ws.filter(said));
  const sure = lists.map((ws, i) => hits[i].length > 0 && (hits[i].length === ws.length || hits[i].some((w) => owners[w] === 1)));
  const claimed = {};
  lists.forEach((ws, i) => { if (sure[i]) hits[i].forEach((w) => { claimed[w] = true; }); });
  return lists.map((ws, i) => sure[i] || hits[i].some((w) => !claimed[w]));
}

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
  if (args[0]) {
    r = await getRecipe(args[0]);
    // A recipe that has gone (your own, deleted): say so, rather than quietly opening another one.
    if (!r) {
      if (el.isConnected) {
        el.innerHTML = `<div style="height:100%;display:flex;flex-direction:column;gap:24px;align-items:center;justify-content:center;font-size:24px;color:#4A5363;text-align:center;padding:40px">
          That recipe isn’t here any more.
          <a href="#/recipes" class="pill" style="background:#1D2430;color:#fff;min-height:56px;padding:0 32px;display:inline-flex;align-items:center">All recipes</a></div>`;
      }
      try { if (localStorage.getItem(CURRENT_KEY) === args[0]) localStorage.removeItem(CURRENT_KEY); } catch (e) { /* storage off */ }
      return;
    }
  }
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
    .rc-ing{display:flex;align-items:center;gap:14px;font-size:19px;min-height:52px;cursor:pointer;line-height:1.3}
    .rc-ing input{width:28px;height:28px;accent-color:${a};flex:none;margin:0}
    .rc-ing.on span{color:#4A5363;text-decoration:line-through}
    .rc-ing{border-radius:12px;margin:0 -12px;padding:0 12px;flex:none}
    .rc-ing.use{background:${a}1A;font-weight:600}
    .rc-dots{display:flex;align-items:center;flex:1;min-width:0;justify-content:flex-end}
    .rc-dot{flex:0 1 44px;min-width:24px;height:56px;border:none;background:transparent;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0}
    .rc-dot i{width:14px;height:14px;border-radius:50%;background:#D9DDE2;display:block}
    .rc-dot.past i{background:${a};opacity:.45}
    .rc-dot.on i{background:${a};width:20px;height:20px}
    .rc-next{font-size:20px;color:#4A5363;line-height:1.35;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
    .rc-next b{color:#1D2430;font-weight:600}
    .rc-timer{display:flex;align-items:center;gap:20px;border-radius:20px;background:#F4F5F7;padding:18px 18px 18px 26px}
    /* Two-frame blink (steps), not a smooth 60-frames-a-second pulse the slow chip can't keep up with. */
    .rc-timer.done{background:${a};color:#FFFFFF;animation:rc-pulse 1s steps(1) infinite}
    @keyframes rc-pulse{0%{opacity:1}50%{opacity:.8}}
    .rc-done{position:absolute;top:0;right:0;bottom:0;left:0;background:var(--bg);padding:40px;z-index:2;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;text-align:center}
    .rc-done .big{font-size:64px;font-weight:500;line-height:1.1}
    .rc-done .sub{font-size:24px;color:#4A5363;max-width:820px;line-height:1.35}
    .rc-done .row{display:flex;gap:18px;flex-wrap:wrap;justify-content:center;margin-top:8px}
    .rc-scale{font-size:16px;color:#4A5363}
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
  let armed = false; // "Start over" needs a second tap, so a stray tap doesn't wipe everything
  let armTimer;
  function showIngCount() {
    const n = s.checked.filter(Boolean).length;
    $('[data-ingcount]').textContent = n ? `Ingredients · ${n} of ${r.ingredients.length} ready` : 'Ingredients';
  }

  function renderCook() {
    sideHtml = '';
    $('[data-cook]').innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:16px">
      <a href="#/home" class="pill" style="background:#FFFFFF;flex:none">← Home</a>
      <div class="display" style="font-size:34px;font-weight:500;flex:1;min-width:0;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(r.title)}</div>
      <div class="muted" style="font-size:18px;flex:none">${esc(metaLine(r, servingsFor(r)))}</div>
      <a href="#/convert" class="pill rc-pillbtn" style="flex:none">Conversions</a>
      <a href="#/recipes" class="pill rc-pillbtn">All recipes</a>
    </div>
    <div style="flex-grow:1;display:grid;grid-template-columns:380px minmax(0,1fr);gap:24px;min-height:0">
      <div data-ings class="card" style="padding:28px;display:flex;flex-direction:column;gap:14px;overflow:auto">
        <div data-ingcount class="eyebrow muted"></div>
        ${servingsFor(r) !== r.serves ? `<div class="rc-scale">Amounts below are for ${servingsFor(r)}. Amounts in the steps are for ${r.serves}, as the recipe was written.</div>` : ''}
        ${r.ingredients.map((ing, i) => `
          <label class="rc-ing${s.checked[i] ? ' on' : ''}">
            <input type="checkbox" data-ing="${i}"${s.checked[i] ? ' checked' : ''}><span>${esc(ingredientText(ing, scaleFor(r)))}</span>
          </label>`).join('')}
      </div>
      <div data-stepcard class="card" style="padding:40px;display:flex;flex-direction:column;justify-content:space-between;gap:24px;min-width:0;min-height:0;overflow:hidden">
        <div style="display:flex;flex-direction:column;gap:14px">
          <div style="display:flex;align-items:center;gap:16px;margin:-12px 0 -6px">
            <div data-stepnum style="font-size:18px;font-weight:600;color:${a};flex:none"></div>
            <div data-dots class="rc-dots">${r.steps.map((_, j) => `<button class="rc-dot" data-goto="${j}" aria-label="Step ${j + 1}"><i></i></button>`).join('')}</div>
          </div>
          <div data-steptext class="display" style="font-size:46px;font-weight:500;line-height:1.2"></div>
        </div>
        <div data-art style="position:relative;flex:1 1 0;min-height:0;display:none">${cropFood(recipeArt(r, `${FILL}max-height:230px`))}</div>
        <div data-timerbox></div>
        <div style="display:flex;flex-direction:column;gap:20px">
          <div data-nextup class="rc-next"></div>
          <div style="display:flex;align-items:center;gap:16px">
            <button data-prev class="rc-btn rc-ghost">Back</button>
            <button data-next class="rc-btn rc-solid"></button>
            <button data-finish class="rc-btn rc-solid" style="display:none">Done cooking</button>
            <div data-side style="margin-left:auto;display:flex;gap:10px;align-items:center;justify-content:flex-end;flex-wrap:wrap;min-width:0"></div>
          </div>
        </div>
      </div>
    </div>`;
    showIngCount();
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
    armed = false;
    clearTimeout(armTimer);
    // The last step: "Done cooking" is the big button, "Start over" the quiet one.
    $('[data-next]').textContent = last ? 'Start over' : 'Next step';
    $('[data-next]').className = last ? 'rc-btn rc-ghost' : 'rc-btn rc-solid';
    $('[data-finish]').style.display = last ? '' : 'none';
    // Where you are: a dot per step (tap one to jump there).
    el.querySelectorAll('[data-goto]').forEach((d, j) => { d.className = `rc-dot${j === i ? ' on' : j < i ? ' past' : ''}`; });
    // A peek at what's coming, so nobody gets caught out.
    $('[data-nextup]').innerHTML = last ? '<b>Last step.</b> Enjoy!' : `<b>Next:</b> ${esc(r.steps[i + 1].text)}`;
    // Point out the ingredients this step uses, and bring the first one into view.
    const use = usedIn(r, step.text);
    let first = null;
    el.querySelectorAll('[data-ing]').forEach((cb) => {
      const on = use[+cb.dataset.ing];
      cb.parentElement.classList.toggle('use', on);
      if (on && !first) first = cb.parentElement;
    });
    const box = $('[data-ings]');
    if (first && (first.offsetTop < box.scrollTop || first.offsetTop + first.offsetHeight > box.scrollTop + box.clientHeight)) {
      box.scrollTop = Math.max(0, first.offsetTop - 70);
    }
    $('[data-timerbox]').innerHTML = step.timer ? `
      <div class="rc-timer" data-timer>
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M10 2h4"/></svg>
        <div style="display:flex;flex-direction:column;gap:2px;min-width:0">
          <div data-tlabel style="font-size:16px;font-weight:600"></div>
          <div data-tclock class="display" style="font-size:52px;font-weight:500;line-height:1;font-variant-numeric:tabular-nums"></div>
        </div>
        <div style="margin-left:auto;display:flex;gap:10px">
          <button data-tplus class="rc-tbtn light" aria-label="One more minute">+1 min</button>
          <button data-treset class="rc-tbtn light">Reset</button>
          <button data-ttoggle class="rc-tbtn"></button>
        </div>
      </div>` : '';
    // Steps without a timer leave a gap: the dish fills it (unless the step text needs the room).
    const art = $('[data-art]');
    art.style.display = step.timer ? 'none' : '';
    art.style.visibility = !step.timer && art.clientHeight < 110 ? 'hidden' : '';
    tick();
    // A very long step (or one with a timer and the next-step line under it) could run
    // past the bottom of the card: make the words smaller until everything fits.
    Promise.resolve().then(() => {
      const card = $('[data-stepcard]');
      if (!card || s.step !== i || text.textContent !== step.text) return;
      let size = stepSize(step.text);
      while (card.scrollHeight > card.clientHeight + 1 && size > 26) {
        size -= 4;
        text.style.fontSize = `${size}px`;
      }
      art.style.visibility = !step.timer && art.clientHeight < 110 ? 'hidden' : '';
    });
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
      const name = timerName(step, i);
      $('[data-tlabel]').textContent = st === 'done'
        ? (s.timers[i].ack ? `${name} · finished` : `${name} · Time’s up!`)
        : st === 'paused' ? `${name} · paused` : name;
      const toggle = $('[data-ttoggle]');
      const label = st === 'running' ? 'Pause' : st === 'paused' ? 'Resume' : st === 'done' ? (s.timers[i].ack ? 'Restart' : 'Stop') : 'Start';
      if (toggle.textContent !== label) toggle.textContent = label;
      $('[data-treset]').style.display = st === 'idle' ? 'none' : '';
      // "Just one more minute": while it counts, or the moment it rings.
      $('[data-tplus]').style.display = st === 'running' || st === 'paused' || (st === 'done' && !s.timers[i].ack) ? '' : 'none';
    }

    // Chips for timers on other steps (tap to jump there), named for what they time.
    let chips = r.steps.map((stp, j) => {
      if (j === i || !stp.timer || !isActive(s, j)) return '';
      const st = status(s, j);
      const done = st === 'done';
      return `<button class="rc-chip${done ? ' done' : ''}" data-jump="${j}">${esc(shortTitle(timerName(stp, j)))} · ${done ? 'Time’s up!' : fmt(remaining(r, s, j))}${st === 'paused' ? ' (paused)' : ''}</button>`;
    }).join('');
    // ...and for timers still going in other recipes (tap to switch back).
    others.forEach((o) => {
      activeTimers(o.r, o.s).forEach((j) => {
        const st = status(o.s, j);
        const done = st === 'done';
        chips += `<button class="rc-chip${done ? ' done' : ''}" data-other="${o.r.id}" data-ostep="${j}">${shortTitle(o.r.title)} · ${done ? 'Time’s up!' : fmt(remaining(o.r, o.s, j))}${st === 'paused' ? ' (paused)' : ''}</button>`;
        if (done && Date.now() - o.s.timers[j].end < alarmMaxMs()) ringing = true;
      });
    });
    const side = $('[data-side]');
    const html = chips || '<span class="muted" style="font-size:18px">Big buttons for messy hands</span>';
    if (sideHtml !== html) { sideHtml = html; side.innerHTML = html; }

    // Ring while any finished timer hasn't been acknowledged.
    r.steps.forEach((stp, j) => {
      if (stp.timer && status(s, j) === 'done' && !s.timers[j].ack) {
        if (Date.now() - s.timers[j].end < alarmMaxMs()) ringing = true;
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

  // "Done cooking": a clear finish instead of being dropped on Home, with the ways on from here.
  function showDone() {
    const still = activeTimers(r, s).length;
    const panel = document.createElement('div');
    panel.className = 'rc-done';
    panel.setAttribute('data-donepanel', '');
    panel.innerHTML = `
      <div style="width:260px;height:150px;position:relative">${cropFood(recipeArt(r, `${FILL}`))}</div>
      <div class="big display">Enjoy your meal!</div>
      <div class="sub">${esc(r.title)} is done.${still ? ` ${still === 1 ? 'A timer is' : `${still} timers are`} still going: you’ll hear ${still === 1 ? 'it' : 'them'} on any screen.` : ''}</div>
      <div class="row">
        <a href="#/recipes" class="rc-btn rc-solid" style="text-decoration:none">Back to recipes</a>
        <button data-again class="rc-btn rc-ghost">Cook it again</button>
        <a href="#/home" class="rc-btn rc-ghost" style="text-decoration:none">Home</a>
      </div>`;
    $('[data-root]').appendChild(panel);
  }

  // Coming back to half-finished cooking from hours ago (yesterday's dinner?): ask, don't assume.
  function askIfStale() {
    if (!s.at || Date.now() - s.at < STALE_MS || !inProgress(r, s) || activeTimers(r, s).length) return;
    const panel = document.createElement('div');
    panel.className = 'rc-done';
    panel.setAttribute('data-stale', '');
    const when = new Date(s.at).toDateString() === new Date().toDateString() ? 'earlier today' : 'on an earlier day';
    panel.innerHTML = `
      <div class="big display" style="font-size:52px">${esc(r.title)}</div>
      <div class="sub">This was left at step ${s.step + 1} of ${r.steps.length} ${when}.</div>
      <div class="row">
        <button data-fresh class="rc-btn rc-solid">Start from the beginning</button>
        <button data-carry class="rc-btn rc-ghost">Carry on from step ${s.step + 1}</button>
      </div>`;
    $('[data-root]').appendChild(panel);
  }

  const root = $('[data-root]');
  function onClick(e) {
    const t = e.target.closest('button');
    if (!t) return;
    const i = s.step;
    if (t.matches('[data-other]')) {
      const j = +t.dataset.ostep;
      openRecipe(t.dataset.other, true);
      if (status(s, j) === 'done') { s.timers[j].ack = true; save(r, s); }
      setStep(j);
    } else if (t.matches('[data-prev]')) setStep(i - 1);
    else if (t.matches('[data-next]')) {
      if (i === r.steps.length - 1) {
        if (!armed) {
          armed = true;
          t.textContent = 'Tap again to start over';
          clearTimeout(armTimer);
          armTimer = setTimeout(() => { armed = false; if (el.isConnected && s.step === i) t.textContent = 'Start over'; }, 4000);
          return;
        }
        // Start over: clear ticks and timers.
        s.checked = s.checked.map(() => false);
        s.timers = {};
        el.querySelectorAll('[data-ing]').forEach((cb) => { cb.checked = false; cb.parentElement.classList.remove('on'); });
        showIngCount();
        setStep(0);
      } else setStep(i + 1);
    } else if (t.matches('[data-finish]')) {
      // Finished: put the recipe away, so the week plan stops saying "Continue · step 5".
      // Timers still going stay (and still ring, on any screen).
      if (activeTimers(r, s).length) {
        s.step = 0;
        s.checked = s.checked.map(() => false);
        save(r, s);
      } else {
        localStorage.removeItem(keyFor(r.id));
      }
      if (localStorage.getItem(CURRENT_KEY) === r.id) localStorage.removeItem(CURRENT_KEY);
      markCooked(r.id); // for "Cooked lately" in Recipes
      showDone();
    } else if (t.matches('[data-again]')) {
      // Same recipe from the top (timers still going are kept).
      $('[data-donepanel]').remove();
      s = load(r);
      s.step = 0;
      save(r, s);
      localStorage.setItem(CURRENT_KEY, r.id);
      renderCook();
    } else if (t.matches('[data-carry]')) {
      $('[data-stale]').remove();
    } else if (t.matches('[data-fresh]')) {
      // Yesterday's half-finished cooking: start this recipe from the top.
      $('[data-stale]').remove();
      s.checked = s.checked.map(() => false);
      s.timers = {};
      s.step = 0;
      save(r, s);
      renderCook();
    } else if (t.matches('[data-tplus]')) {
      const tm = s.timers[i];
      if (tm && tm.end != null) { tm.end = Math.max(tm.end, Date.now()) + 60000; delete tm.ack; }
      else if (tm && tm.left != null) tm.left += 60000;
      save(r, s); tick();
    } else if (t.matches('[data-goto]')) {
      setStep(+t.dataset.goto);
    } else if (t.matches('[data-ttoggle]')) {
      const st = status(s, i);
      // The name goes along so the timer chip on the other screens can say what is ready.
      const label = `${r.steps[i].timerLabel || `Step ${i + 1}`} · ${shortTitle(r.title)}`;
      if (st === 'running') s.timers[i] = { left: remaining(r, s, i), label };
      else if (st === 'paused') s.timers[i] = { end: Date.now() + s.timers[i].left, label };
      else if (st === 'done' && !s.timers[i].ack) s.timers[i].ack = true;
      else s.timers[i] = { end: Date.now() + r.steps[i].timer * 1000, label };
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
    showIngCount();
  }
  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);

  renderCook();
  askIfStale();
  clearInterval(tickTimer);
  tickTimer = setInterval(() => { if (el.isConnected) tick(); }, 250);
}

export function unmount() {
  clearInterval(tickTimer);
  tickTimer = null;
}
