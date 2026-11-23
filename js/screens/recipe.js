// Kitchen · Cooking mode: "across-the-room step, pot timer".
// One giant step readable from across the room, a pot bubbling on its flame inside the
// timer's ring, huge Back and Next buttons with a peek at what comes next. The ingredients
// (tickable) open beside the step; the step itself names the ones it needs.
// Progress (step, ticks, timers) is saved per recipe id so leaving the screen or
// switching recipes doesn't lose it; timers keep counting in the background via their end time.
// Back goes to the recipe page it was opened from; the recipe being cooked is remembered in localStorage.
// #/recipe/<id> opens that recipe; plain #/recipe opens the one in progress, else tonight's.
import { alarmBeep, whenText } from '../services/timers.js';
import { display } from '../services/display.js';
import { getRecipe as getRecipeRaw, ingredientText, metaLine, withStepTimers, markCooked } from '../services/recipe-data.js';
import { tonight, servingsFor, scaleFor } from '../services/meal-plan.js';
import { plateArt } from './kitchen-ui.js';
import { topBar } from './ui.js';

const esc = (x) => String(x == null ? '' : x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Steps that say "rest 10 minutes" get a timer too, here as on the recipe page.
const getRecipe = (id) => getRecipeRaw(id).then(withStepTimers);

// An alarm nobody stops rings as long as the owner chose for the kitchen timers (Settings).
const alarmMaxMs = () => Math.max(1, +display().alarmMinutes || 2) * 60 * 1000;
const CURRENT_KEY = 'recipe.current';
// Progress left alone longer than this is from another day's cooking: ask before carrying on.
const STALE_MS = 6 * 60 * 60 * 1000;
let tickTimer;
// Back (and "Done" at the end) return to where cooking mode was opened from: the recipe
// page, the week plan, Home... (the recipe page when there is nothing to go back to).
const goBack = (r) => { if (history.length > 1) history.back(); else location.hash = r ? `#/dish/${encodeURIComponent(r.id)}` : '#/recipes'; };

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
// Short steps are giant; long ones start smaller (and are fitted to the room after that).
const stepSize = (text) => (text.length <= 40 ? 84 : text.length <= 70 ? 68 : text.length <= 110 ? 56 : text.length <= 160 ? 46 : 40);

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

// ---- The look -------------------------------------------------------------------
// One giant step, a pot on a flame inside the timer's ring, and Back / Next big enough
// for an elbow. Only transforms and opacity move: three bubbles, the lid, the flame, the glow.
const HOT = '#FF8A3D';
const RING = 2 * Math.PI * 200; // the ring's length, for drawing how much of the time has gone
const STYLES = `
  <style>
    .rc{height:100%;position:relative;overflow:hidden;background:#110D0B;color:#FFF3E6;font-family:Inter,system-ui,sans-serif}
    .rc-ember{position:absolute;right:-120px;bottom:-200px;width:900px;height:900px;border-radius:50%;pointer-events:none;opacity:.72;
      background:radial-gradient(closest-side,rgba(255,110,40,.32),rgba(255,110,40,0))}
    .rc-top{position:absolute;left:40px;right:40px;top:28px}
    .rc-top .x-title{font-size:30px;color:#E8D3BF}
    .rc-segs{display:flex;flex:0 1 300px;min-width:0}
    .rc-seg{flex:1 1 0;min-width:14px;height:56px;border:0;background:transparent;padding:0 3px;cursor:pointer;display:flex;align-items:center}
    .rc-seg i{display:block;width:100%;height:10px;border-radius:5px;background:#3A2A22}
    .rc-seg.past i{background:${HOT};opacity:.5}
    .rc-seg.on{flex-grow:2}
    .rc-seg.on i{background:${HOT};height:14px;border-radius:7px}
    .rc-left{position:absolute;left:40px;top:112px;width:716px;bottom:150px;display:flex;flex-direction:column;gap:12px}
    .rc-num{font:700 26px Outfit,sans-serif;color:${HOT};letter-spacing:1px;text-transform:uppercase;flex:none}
    .rc-text{flex:1 1 0;min-height:0;overflow:hidden;font:700 84px/1.04 Outfit,sans-serif;letter-spacing:-1px}
    .rc-uses{flex:none;display:flex;flex-wrap:wrap;align-items:center;max-height:80px;overflow:hidden;margin-bottom:-6px}
    .rc-uses .l{font:600 15px Inter,sans-serif;letter-spacing:2px;text-transform:uppercase;color:#CDB8A4;margin:0 12px 6px 0}
    .rc-use{padding:7px 14px;border-radius:12px;background:rgba(255,138,61,.16);color:#FFE2C8;font:500 18px Inter,sans-serif;margin:0 8px 6px 0;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis}
    .rc-side{flex:none;display:flex;flex-wrap:wrap;gap:10px}
    .rc-chip{min-height:56px;padding:0 20px;border-radius:16px;border:0;background:rgba(255,255,255,.1);color:#FFF3E6;font:600 18px Inter,sans-serif;cursor:pointer;
      display:inline-flex;align-items:center;gap:8px;font-variant-numeric:tabular-nums}
    .rc-chip.done{background:${HOT};color:#1A0E08}
    /* The pot in its ring */
    .rc-pot{position:absolute;right:44px;top:100px;width:440px;height:440px}
    .rc-ring{position:absolute;left:0;top:0}
    .rc-pot.done .rc-ring{animation:rc-blink 1s steps(1) infinite}
    @keyframes rc-blink{0%{opacity:1}50%{opacity:.55}}
    .rc-stove{position:absolute;left:79px;top:58px;width:282px;height:270px;transform:scale(.74);transform-origin:50% 0}
    .rc-stove>*{position:absolute}
    .rc-bub{border-radius:50%;background:#FFD9B8;opacity:0}
    @keyframes rc-bub{0%{transform:translateY(0) scale(.6);opacity:0}20%{opacity:.8}100%{transform:translateY(-70px) scale(1);opacity:0}}
    .rc-lid{left:34px;top:40px;transform-origin:50% 92%}
    .rc-flame{left:66px;top:232px;transform-origin:50% 100%;transform:scaleY(.78)}
    @keyframes rc-flame-hot{0%,100%{transform:scaleY(1)}50%{transform:scaleY(1.2)}}
    @keyframes rc-lid-fast{0%,100%{transform:translateY(0) rotate(0)}30%{transform:translateY(-7px) rotate(-3deg)}60%{transform:translateY(-2px) rotate(2deg)}}
    .rc-pot.run .rc-bub,.rc-pot.done .rc-bub{animation:rc-bub 2.4s ease-out infinite}
    .rc-pot.run .rc-flame,.rc-pot.done .rc-flame{animation:rc-flame-hot 1.2s ease-in-out infinite}
    .rc-pot.done .rc-bub{animation-duration:1.6s}
    .rc-pot.done .rc-lid{animation:rc-lid-fast .7s ease-in-out infinite}
    .rc-clockbox{position:absolute;left:60px;right:60px;top:268px;text-align:center}
    .rc-clock{font:700 62px/1 Outfit,sans-serif;font-variant-numeric:tabular-nums}
    .rc-tlabel{font-size:17px;color:#CDB8A4;margin:4px 6px 0;line-height:1.25;max-height:46px;overflow:hidden}
    .rc-pot.done .rc-tlabel{color:#FFC15E;font-weight:600}
    .rc-tbtns{position:absolute;right:44px;top:556px;width:440px;display:flex;justify-content:center;gap:10px}
    .rc-tbtn{min-height:64px;min-width:64px;padding:0 24px;border-radius:18px;border:0;background:rgba(255,255,255,.1);color:#FFF3E6;font:600 20px Inter,sans-serif;cursor:pointer}
    .rc-tbtn.main{background:${HOT};color:#1A0E08;min-width:150px;font-weight:700}
    .rc-meta{position:absolute;right:44px;top:566px;width:440px;text-align:center;font-size:18px;color:#CDB8A4;line-height:1.35}
    /* Back, what comes next, Next */
    .rc-bar{position:absolute;left:40px;right:40px;bottom:32px;display:flex;align-items:stretch;gap:16px}
    .rc-big{min-height:100px;border-radius:26px;border:0;font:700 30px Outfit,sans-serif;cursor:pointer;display:flex;align-items:center;justify-content:center;flex:none}
    .rc-big:active,.rc-tbtn:active,.rc-chip:active{transform:scale(.97)}
    .rc-prev{width:200px;background:rgba(255,255,255,.1);color:#FFF3E6}
    .rc-prev[disabled]{opacity:.3;pointer-events:none}
    .rc-next{width:310px;background:${HOT};color:#1A0E08;font-size:34px}
    .rc-peek{flex:1;min-width:0;border-radius:26px;border:2px solid #3A2A22;display:flex;align-items:center;gap:16px;padding:0 24px}
    .rc-peek .l{font:700 18px Outfit,sans-serif;color:${HOT};letter-spacing:1px;flex:none}
    .rc-peek .t{font-size:23px;line-height:1.3;color:#E8D3BF;flex:1;min-width:0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
    .rc-again{min-height:64px;padding:0 22px;border-radius:18px;border:0;background:rgba(255,255,255,.1);color:#FFF3E6;font:600 19px Inter,sans-serif;cursor:pointer;flex:none}
    /* The ingredients, when asked for: beside the step, over the pot */
    .rc-panel{position:absolute;right:0;top:0;bottom:150px;width:510px;z-index:2;background:#1D1512;border-radius:0 0 0 32px;padding:28px 40px 22px 30px;display:flex;flex-direction:column;gap:12px}
    .rc-panel .h{display:flex;align-items:center;gap:12px}
    .rc-panel .h div{flex:1;min-width:0;font:600 15px Inter,sans-serif;letter-spacing:2px;text-transform:uppercase;color:${HOT}}
    .rc-list{flex:1 1 0;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch}
    .rc-ing{position:relative;display:flex;align-items:center;gap:14px;font-size:20px;min-height:56px;cursor:pointer;line-height:1.25;border-radius:14px;padding:6px 12px}
    .rc-ing input{position:absolute;opacity:0;width:1px;height:1px}
    .rc-ing i{flex:none;width:30px;height:30px;border-radius:9px;border:2px solid #8A7566;display:flex;align-items:center;justify-content:center;font:normal 700 20px Inter,sans-serif;color:transparent}
    .rc-ing input:checked+i{background:${HOT};border-color:${HOT};color:#1A0E08}
    .rc-ing.on span{color:#9C8777;text-decoration:line-through}
    .rc-ing.use{background:rgba(255,138,61,.16);font-weight:600}
    .rc-scale{font-size:16px;color:#CDB8A4;line-height:1.35}
    /* Finished, or left half-way on another day */
    .rc-over{position:absolute;top:0;right:0;bottom:0;left:0;z-index:3;background:#110D0B;padding:40px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;text-align:center}
    .rc-over .big{font:700 64px/1.05 Outfit,sans-serif}
    .rc-over .sub{font-size:24px;color:#E8D3BF;max-width:860px;line-height:1.35}
    .rc-over .row{display:flex;gap:16px;flex-wrap:wrap;justify-content:center;margin-top:10px}
    .rc-over .rc-big{padding:0 36px;min-height:84px;font-size:26px;text-decoration:none}
    .rc-ghost{background:rgba(255,255,255,.1);color:#FFF3E6}
    .rc-plain{height:100%;background:#110D0B;color:#E8D3BF;display:flex;flex-direction:column;gap:24px;align-items:center;justify-content:center;font-size:24px;text-align:center;padding:40px}
    @media (prefers-reduced-motion: reduce){.rc-bub,.rc-flame,.rc-pot .rc-lid,.rc-pot .rc-ring{animation:none!important}}
  </style>`;

// The pot: each moving part is its own small picture, so only that part is redrawn.
const POT = `
  <div class="rc-stove" aria-hidden="true">
    <div class="rc-bub" style="left:98px;top:62px;width:16px;height:16px"></div>
    <div class="rc-bub" style="left:140px;top:60px;width:12px;height:12px;animation-delay:-1.4s"></div>
    <div class="rc-bub" style="left:171px;top:65px;width:14px;height:14px;animation-delay:-2.8s"></div>
    <svg class="rc-lid" width="214" height="52" viewBox="118 120 214 52"><path d="M118 172Q225 120 332 172Z" fill="#9E2A1A"/><rect x="205" y="132" width="40" height="14" rx="7" fill="#2A1E18"/></svg>
    <svg style="left:0;top:92px" width="282" height="140" viewBox="84 172 282 140">
      <defs><linearGradient id="rcPotFill" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7A1E14"/><stop offset=".45" stop-color="#C53A22"/><stop offset="1" stop-color="#6E1A10"/></linearGradient></defs>
      <rect x="112" y="172" width="226" height="22" rx="8" fill="#8A2416"/>
      <path d="M120 190H330V280Q330 310 300 310H150Q120 310 120 280Z" fill="url(#rcPotFill)"/>
      <rect x="84" y="206" width="40" height="18" rx="9" fill="#2A1E18"/><rect x="326" y="206" width="40" height="18" rx="9" fill="#2A1E18"/>
      <ellipse cx="180" cy="232" rx="24" ry="40" fill="#FFFFFF" opacity=".1"/>
    </svg>
    <svg class="rc-flame" width="150" height="28" viewBox="150 312 150 28">
      <defs><radialGradient id="rcFire" cx=".5" cy="1" r="1"><stop offset="0" stop-color="#FFE7A0"/><stop offset=".5" stop-color="#FF9A3A"/><stop offset="1" stop-color="#E2421E" stop-opacity="0"/></radialGradient></defs>
      <path d="M150 340Q160 318 170 340Q182 314 196 340Q210 312 225 340Q240 312 254 340Q268 314 280 340Q290 318 300 340Z" fill="url(#rcFire)"/>
    </svg>
    <div style="left:46px;top:258px;width:190px;height:8px;border-radius:4px;background:#3A2A22"></div>
  </div>`;

// ---- Screen -----------------------------------------------------------------
export function mount(el, ctx) {
  el.innerHTML = `${STYLES}<div class="rc-plain">Loading recipe…</div>`;
  start(el, (ctx && ctx.args) || []).catch((err) => {
    console.error(err);
    if (el.isConnected) el.innerHTML = `${STYLES}<div class="rc-plain">Couldn’t load the recipe. Check the Wi-Fi.<a href="#/recipes" class="x-btn white">All recipes</a></div>`;
  });
}

async function start(el, args) {
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
      if (el.isConnected) el.innerHTML = `${STYLES}<div class="rc-plain">That recipe isn’t here any more.<a href="#/recipes" class="x-btn white">All recipes</a></div>`;
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
  let ringAt = -1; // what the ring shows now (so it is only redrawn when it moves)
  let panelOpen = false; // the ingredients, beside the step

  el.innerHTML = `${STYLES}
  <div class="rc" data-root>
    <div class="rc-ember" aria-hidden="true"></div>
    <div data-cook></div>
  </div>`;

  const $ = (sel) => el.querySelector(sel);

  // ---- Cooking mode ----
  let armed = false; // "Start over" needs a second tap, so a stray tap doesn't wipe everything
  let armTimer;
  function showIngCount() {
    const n = s.checked.filter(Boolean).length;
    const words = n ? `Ingredients · ${n} of ${r.ingredients.length} ready` : `Ingredients · ${r.ingredients.length}`;
    $('[data-ingcount]').textContent = words;
    $('[data-ingbtn]').textContent = panelOpen ? 'Hide ingredients' : n ? `Ingredients · ${n}/${r.ingredients.length}` : 'Ingredients';
  }
  function showPanel() {
    $('[data-panel]').style.display = panelOpen ? '' : 'none';
    showIngCount();
  }

  function renderCook() {
    sideHtml = '';
    ringAt = -1;
    $('[data-cook]').innerHTML = `
    <div class="rc-top">${topBar({ title: r.title, back: 'history', backLabel: '← Back', tone: 'dark',
      right: `<div data-segs class="rc-segs">${r.steps.map((_, j) => `<button class="rc-seg" data-goto="${j}" aria-label="Step ${j + 1}"><i></i></button>`).join('')}</div>
        <button data-ingbtn class="x-btn sm frost"></button>` })}</div>
    <div class="rc-left" data-stepcard>
      <div data-stepnum class="rc-num"></div>
      <div data-steptext class="rc-text"></div>
      <div data-uses class="rc-uses"></div>
      <div data-side class="rc-side"></div>
    </div>
    <div class="rc-pot" data-pot>
      <svg class="rc-ring" width="440" height="440" viewBox="0 0 440 440" aria-hidden="true">
        <defs><linearGradient id="rcRingFill" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFC15E"/><stop offset="1" stop-color="#FF6A2A"/></linearGradient></defs>
        <circle cx="220" cy="220" r="200" fill="none" stroke="#2A1E18" stroke-width="18"/>
        <circle data-ring cx="220" cy="220" r="200" fill="none" stroke="url(#rcRingFill)" stroke-width="18" stroke-linecap="round"
          stroke-dasharray="${RING.toFixed(1)}" stroke-dashoffset="${RING.toFixed(1)}" transform="rotate(-90 220 220)" style="display:none"/>
      </svg>
      ${POT}
      <div class="rc-clockbox"><div data-tclock class="rc-clock"></div><div data-tlabel class="rc-tlabel"></div></div>
    </div>
    <div data-tbtns class="rc-tbtns">
      <button data-tplus class="rc-tbtn" aria-label="One more minute">+1 min</button>
      <button data-treset class="rc-tbtn">Reset</button>
      <button data-ttoggle class="rc-tbtn main"></button>
    </div>
    <div data-meta class="rc-meta">${esc(metaLine(r, servingsFor(r)))}</div>
    <div class="rc-panel" data-panel style="display:none">
      <div class="h"><div data-ingcount></div><button data-ingclose class="x-btn sm frost">Close</button></div>
      ${servingsFor(r) !== r.serves ? `<div class="rc-scale">Amounts here are for ${servingsFor(r)}; in the steps, for ${r.serves}.</div>` : ''}
      <div data-ings class="rc-list">
        ${r.ingredients.map((ing, i) => `
          <label class="rc-ing${s.checked[i] ? ' on' : ''}">
            <input type="checkbox" data-ing="${i}"${s.checked[i] ? ' checked' : ''}><i>✓</i><span>${esc(ingredientText(ing, scaleFor(r)))}</span>
          </label>`).join('')}
      </div>
      <div style="display:flex;align-items:center;gap:12px">
        <div class="rc-scale" style="flex:1;min-width:0">${esc(metaLine(r, servingsFor(r)))}</div>
        <a href="#/convert" class="x-btn sm glass">Conversions</a>
      </div>
    </div>
    <div class="rc-bar">
      <button data-prev class="rc-big rc-prev">← Back</button>
      <div class="rc-peek"><span data-peeklabel class="l">NEXT</span><span data-nextup class="t"></span><button data-restart class="rc-again" style="display:none">Start over</button></div>
      <button data-next class="rc-big rc-next">Next step →</button>
      <button data-finish class="rc-big rc-next" style="display:none">Done cooking</button>
    </div>`;
    showPanel();
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
    $('[data-next]').style.display = last ? 'none' : '';
    $('[data-finish]').style.display = last ? '' : 'none';
    const again = $('[data-restart]');
    again.style.display = last ? '' : 'none';
    again.textContent = 'Start over';
    // Where you are: a bar per step (tap one to jump there).
    el.querySelectorAll('[data-goto]').forEach((d, j) => { d.className = `rc-seg${j === i ? ' on' : j < i ? ' past' : ''}`; });
    // A peek at what's coming, so nobody gets caught out.
    $('[data-peeklabel]').textContent = last ? 'LAST STEP' : 'NEXT';
    $('[data-nextup]').textContent = last ? '' : r.steps[i + 1].text;
    // Point out the ingredients this step uses: named under the step, and lit up in the list.
    const use = usedIn(r, step.text);
    let first = null;
    el.querySelectorAll('[data-ing]').forEach((cb) => {
      const on = use[+cb.dataset.ing];
      cb.parentElement.classList.toggle('use', on);
      if (on && !first) first = cb.parentElement;
    });
    const box = $('[data-ings]');
    if (first && panelOpen && (first.offsetTop < box.scrollTop || first.offsetTop + first.offsetHeight > box.scrollTop + box.clientHeight)) {
      box.scrollTop = Math.max(0, first.offsetTop - 70);
    }
    const used = r.ingredients.filter((_, n) => use[n]);
    $('[data-uses]').innerHTML = used.length
      ? `<span class="l">You need</span>${used.map((ing) => `<span class="rc-use">${esc(ingredientText(ing, scaleFor(r)))}</span>`).join('')}` : '';
    // The pot shows this step's timer when it has one; without one it just simmers.
    $('[data-tbtns]').style.display = step.timer ? '' : 'none';
    $('[data-meta]').style.display = step.timer ? 'none' : '';
    $('[data-ring]').style.display = step.timer ? '' : 'none';
    ringAt = -1;
    tick();
    fitText(i);
  }

  // A long step is made smaller until all of it fits above the buttons.
  function fitText(i) {
    Promise.resolve().then(() => {
      const text = $('[data-steptext]');
      const step = r.steps[i];
      if (!text || s.step !== i || text.textContent !== step.text) return;
      let size = stepSize(step.text);
      text.style.fontSize = `${size}px`;
      while (text.scrollHeight > text.clientHeight + 1 && size > 26) {
        size -= size > 48 ? 6 : 3;
        text.style.fontSize = `${size}px`;
      }
    });
  }

  // Updates the countdown, the ring, the "other timers" chips and the alarm.
  function tick() {
    const i = s.step;
    const step = r.steps[i];
    let ringing = false;
    const pot = $('[data-pot]');

    if (step.timer) {
      const st = status(s, i);
      const ringingHere = st === 'done' && !s.timers[i].ack;
      const cls = `rc-pot${ringingHere ? ' done' : st === 'running' ? ' run' : st === 'paused' ? ' paused' : ''}`;
      if (pot.className !== cls) pot.className = cls;
      const left = remaining(r, s, i);
      const clock = fmt(left);
      if ($('[data-tclock]').textContent !== clock) $('[data-tclock]').textContent = clock;
      const name = timerName(step, i);
      const label = st === 'done' ? (s.timers[i].ack ? `${name} · finished` : `${name} · Time’s up!`)
        : st === 'paused' ? `${name} · paused` : st === 'running' ? `${name} · done at ${whenText(s.timers[i].end)}` : name;
      if ($('[data-tlabel]').textContent !== label) $('[data-tlabel]').textContent = label;
      // The ring fills as the time goes (a minute added makes the whole longer).
      const whole = Math.max(step.timer * 1000, left);
      const done = st === 'idle' ? 0 : Math.round((1 - left / whole) * 500) / 500;
      if (done !== ringAt) {
        ringAt = done;
        $('[data-ring]').setAttribute('stroke-dashoffset', (RING * (1 - done)).toFixed(1));
        $('[data-ring]').style.display = done > 0 ? '' : 'none';
      }
      const toggle = $('[data-ttoggle]');
      const word = st === 'running' ? 'Pause' : st === 'paused' ? 'Resume' : st === 'done' ? (s.timers[i].ack ? 'Restart' : 'Stop') : 'Start';
      if (toggle.textContent !== word) toggle.textContent = word;
      $('[data-treset]').style.display = st === 'idle' ? 'none' : '';
      // "Just one more minute": while it counts, or the moment it rings.
      $('[data-tplus]').style.display = st === 'running' || st === 'paused' || ringingHere ? '' : 'none';
    } else {
      if (pot.className !== 'rc-pot') pot.className = 'rc-pot';
      if ($('[data-tclock]').textContent) { $('[data-tclock]').textContent = ''; $('[data-tlabel]').textContent = ''; }
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
        chips += `<button class="rc-chip${done ? ' done' : ''}" data-other="${esc(o.r.id)}" data-ostep="${j}">${esc(shortTitle(o.r.title))} · ${done ? 'Time’s up!' : fmt(remaining(o.r, o.s, j))}${st === 'paused' ? ' (paused)' : ''}</button>`;
        if (done && Date.now() - o.s.timers[j].end < alarmMaxMs()) ringing = true;
      });
    });
    const side = $('[data-side]');
    if (sideHtml !== chips) {
      const had = !!sideHtml;
      sideHtml = chips;
      side.innerHTML = chips ? `<span class="rc-uses" style="margin:0"><span class="l" style="margin-bottom:0">Also going</span></span>${chips}` : '';
      // The chips' row takes room from the step: fit its words again when it comes or goes.
      if (had !== !!chips) fitText(i);
    }

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
    panel.className = 'rc-over';
    panel.setAttribute('data-donepanel', '');
    panel.innerHTML = `
      ${plateArt(r, 250, { detail: true })}
      <div class="big">Enjoy your meal!</div>
      ${still ? `<div class="sub">${still === 1 ? 'A timer is' : `${still} timers are`} still going.</div>` : ''}
      <div class="row">
        <button data-leave class="rc-big rc-next" style="width:auto;padding:0 56px">Done</button>
        <button data-again class="rc-big rc-ghost">Cook it again</button>
      </div>`;
    $('[data-root]').appendChild(panel);
  }

  // Coming back to half-finished cooking from hours ago (yesterday's dinner?): ask, don't assume.
  function askIfStale() {
    if (!s.at || Date.now() - s.at < STALE_MS || !inProgress(r, s) || activeTimers(r, s).length) return;
    const panel = document.createElement('div');
    panel.className = 'rc-over';
    panel.setAttribute('data-stale', '');
    const when = new Date(s.at).toDateString() === new Date().toDateString() ? 'earlier today' : 'on an earlier day';
    panel.innerHTML = `
      ${plateArt(r, 200, { detail: true })}
      <div class="big" style="font-size:52px">${esc(r.title)}</div>
      <div class="sub">This was left at step ${s.step + 1} of ${r.steps.length} ${when}.</div>
      <div class="row">
        <button data-fresh class="rc-big rc-next" style="width:auto">Start from the beginning</button>
        <button data-carry class="rc-big rc-ghost">Carry on from step ${s.step + 1}</button>
      </div>`;
    $('[data-root]').appendChild(panel);
  }

  const root = $('[data-root]');
  function onClick(e) {
    const t = e.target.closest('button');
    if (!t) return;
    const i = s.step;
    if (t.matches('[data-back],[data-leave]')) goBack(r);
    else if (t.matches('[data-ingbtn],[data-ingclose]')) {
      panelOpen = t.matches('[data-ingbtn]') ? !panelOpen : false;
      showPanel();
      if (panelOpen) renderStep(); // brings this step's first ingredient into view
    } else if (t.matches('[data-other]')) {
      const j = +t.dataset.ostep;
      openRecipe(t.dataset.other, true);
      if (status(s, j) === 'done') { s.timers[j].ack = true; save(r, s); }
      setStep(j);
    } else if (t.matches('[data-prev]')) setStep(i - 1);
    else if (t.matches('[data-next]')) setStep(i + 1);
    else if (t.matches('[data-restart]')) {
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
