// Kitchen · Recipes: recipes from the web (web-recipes.js), every dish a plate on a dark table,
// chosen step by step:
//   #/recipes                              the meals (Dinner, Breakfast, …) + search
//   #/recipes/dinner                       the cuisines
//   #/recipes/dinner/american              the main ingredients
//   #/recipes/dinner/american/beef         the dishes
//   #/recipes/dinner/american/beef/steak   the recipes ("any" at a level: all of them)
//   #/recipes/favorites · /recent · /mine   hearted, cooked lately, the household's own
// Along the top, the choices made so far; tapping one goes back to it. Back goes up one level.
// Search is in the top bar on the first page, typed on the screen's own keyboard (keyboard.js).
// Every card has a heart and "+ Plan". With no internet: the recipes kept on the screen.
// (No links into the Week plan or Shopping list here: those open from the Menu.)
import { backHref, backLabel } from '../services/nav.js';
import { loadKnown, fmtMinutes, cookedList, cookedWhen, cookingNow, clearLoves, cachedRecipe } from '../services/recipe-data.js';
import { getPlan, weekDays, dayIds, favorites, toggleFavorite, addToPlan, removeFromPlan, plannedFor, planDays, dayKey, defaultMeal, MEALS } from '../services/meal-plan.js';
import { saveRecipe, UNDO_KEY, onMyRecipesChanged } from '../services/my-recipes.js';
import { searchWeb, browseWeb, browsePlace, placePicture, fetchPlacePicture, webEntries, webReachable, webRetry, keepWebRecipe, isWebId, WEB_MEALS } from '../services/web-recipes.js';
import { esc, plateArt, tableColors } from './kitchen-ui.js';
import { openKeyboard, keyboardStyle } from './keyboard.js';
import { topBar, phoneCode, wirePhoneCodes } from './ui.js';
import { ADD_DAY_KEY } from './dish.js';

let searchTimer;
let web = null; // the web recipes of the page on screen (see webStart)
let picCtl = null; // stops the choices' pictures being asked for
let stopCodes = null; // stops the "scan with your phone" code being redrawn
let offMine = null; // stops listening for recipes sent from a phone
let favs = [];
let planned = {}; // id -> "Thu" for recipes on this week's plan
let cooking = {}; // id -> step number, for recipes part-way through in cooking mode
let cookedAt = {}; // id -> when last cooked
const MAX_PER_MEAL = 3; // same limit as the week plan

// ---- Filters (the household's own lists: favourites, cooked lately, my recipes) ------------
// Only what the recipe says: its time, and its tags.
// (Allergy-style tags like gluten-free are left out on purpose: a wrong one could hurt.)
const FILTERS = [
  ['m30', '30 min or less', (r) => r.m > 0 && r.m <= 30],
  ['vegetarian', 'Vegetarian'], ['slow cooker', 'Slow cooker'], ['one pot', 'One pot'],
  ['sheet pan', 'Sheet pan'], ['air fryer', 'Air fryer'], ['instant pot', 'Instant Pot'],
  ['kid-friendly', 'Picky eaters'], ['make ahead', 'Make ahead'], ['healthy', 'Lighter'], ['vegan', 'Vegan'],
  ['spicy', 'Spicy'], ['grill', 'Grill'], ['crowd', 'For a crowd'],
];
const passes = (r, id) => {
  const f = FILTERS.find((x) => x[0] === id);
  if (!f) return true;
  return f[2] ? f[2](r) : (r.g || []).indexOf(id) >= 0;
};
// The chips worth showing for a list: those that would leave some recipes, but not all.
function filterChips(list, on) {
  const chips = FILTERS.map(([id, label]) => ({ id, label, n: list.filter((r) => passes(r, id)).length }))
    .filter((c) => c.id === on || (c.n > 0 && c.n < list.length)).slice(0, 8);
  if (!chips.length) return '';
  return `<div class="rb-filters">${chips.map((c) => `<button class="rb-chip${c.id === on ? ' on' : ''}" data-filter="${esc(c.id)}">${c.id === on ? '✓ ' : ''}${esc(c.label)}</button>`).join('')}</div>`;
}

// ---- Searches made lately, as chips (no typing them again) ------------------------
const SEARCHES_KEY = 'recipes.searches.v1';
function recentSearches() {
  try { return (JSON.parse(localStorage.getItem(SEARCHES_KEY) || '[]') || []).filter((x) => typeof x === 'string'); } catch (e) { return []; }
}
function rememberSearch(q) {
  q = String(q || '').trim().toLowerCase();
  if (q.length < 2) return;
  const list = [q].concat(recentSearches().filter((x) => x !== q)).slice(0, 6);
  try { localStorage.setItem(SEARCHES_KEY, JSON.stringify(list)); } catch (e) { /* storage full */ }
}
const IDEAS = ['chicken', 'pasta', 'soup', 'salmon', 'tacos', 'beef', 'curry', 'salad', 'slow cooker', 'cookies'];
// What the keyboard can suggest: the names of every choice there is to browse.
let SUGGEST_POOL = null;
function suggestPool() {
  if (SUGGEST_POOL) return SUGGEST_POOL;
  const names = [];
  const walk = (path, depth) => {
    const p = browsePlace(path);
    (p.choices || []).forEach((c) => {
      if (c.id === 'any') return;
      names.push(c.name.replace(/ & .*/, ''));
      if (depth < 3) walk(path.concat(c.id), depth + 1);
    });
  };
  walk([], 0);
  // (Down the dinner tree once, through one cuisine: the ingredients and dishes are the same for all.)
  walk(['dinner', 'any'], 2);
  SUGGEST_POOL = names.concat(IDEAS.map((w) => w.charAt(0).toUpperCase() + w.slice(1)))
    .filter((t, n, a) => a.indexOf(t) === n)
    .map((t) => ({ t, k: t.toLowerCase(), w: ` ${t.toLowerCase().replace(/[^a-z0-9]+/g, ' ')}` }));
  return SUGGEST_POOL;
}

// Which recipes are being cooked, and when each was last cooked (worked out once per screen).
function readBadges() {
  cooking = {};
  try {
    for (let k = 0; k < localStorage.length; k++) {
      const key = localStorage.key(k);
      if (!key || key.indexOf('recipe.v1.') !== 0) continue;
      const s = JSON.parse(localStorage.getItem(key) || 'null');
      if (s && (s.step > 0 || (s.checked || []).some(Boolean))) cooking[key.slice(10)] = (s.step || 0) + 1;
    }
  } catch (e) { /* storage off */ }
  cookedAt = {};
  cookedList().forEach((x) => { if (!cookedAt[x.id]) cookedAt[x.id] = x.at; });
}

// Coming back from a recipe puts you where you were: the same search, the same scroll spot.
// Kept for a while only, so opening Recipes later in the day starts fresh.
const MEMO_KEY = 'recipes.memo';
const MEMO_MS = 15 * 60 * 1000;
function memo() {
  try {
    const m = JSON.parse(sessionStorage.getItem(MEMO_KEY) || '{}') || {};
    return m.at && Date.now() - m.at < MEMO_MS ? m : {};
  } catch (e) { return {}; }
}
function setMemo(patch) {
  try { sessionStorage.setItem(MEMO_KEY, JSON.stringify(Object.assign(memo(), patch, { at: Date.now() }))); } catch (e) { /* full */ }
}

// "Thu" for recipes already in this week's plan.
function plannedLabels() {
  const plan = getPlan();
  const out = {};
  weekDays().forEach((d) => dayIds(plan, d.key).forEach((id) => { if (!out[id]) out[id] = d.label === 'Today' ? 'Today' : d.short; }));
  return out;
}

// Sent here by the Week plan's "+ Add": the day and meal the next recipe picked is for.
// (Asked by every card: the 14 days' names are worked out once per day and choice, not per card.)
let pendingWas = null;
let pendingIs = null;
function pendingAdd() {
  let raw = '';
  try { raw = String(sessionStorage.getItem(ADD_DAY_KEY) || ''); } catch (e) { raw = ''; }
  const was = `${raw}@${new Date().toDateString()}`;
  if (was === pendingWas) return pendingIs;
  const [key, meal] = raw.split('|');
  const day = key && planDays(0).concat(planDays(1)).find((d) => d.key === key);
  pendingWas = was;
  pendingIs = day ? { key, meal: meal || 'dinner', day } : null;
  return pendingIs;
}
const mealWord = (m) => (MEALS.find((x) => x[0] === m) || ['', 'Dinner'])[1].toLowerCase();

function recipeCard(r, cuisineName) {
  const tags = (r.g || []).filter((t) => t !== 'kid-friendly').slice(0, cuisineName ? 1 : 2);
  const fav = favs.indexOf(r.id) >= 0;
  const p = pendingAdd();
  // A web recipe says which site it is from (small, where the cuisine would be).
  const meta = (r.c === 'web' ? [r.m ? fmtMinutes(r.m) : '', r.site || '']
    : [r.m ? fmtMinutes(r.m) : '', cuisineName || ''].concat(tags)).filter(Boolean).join(' · ');
  const id = esc(r.id);
  return `
    <div class="rb-card" data-card="${id}">
      <a href="#/dish/${encodeURIComponent(r.id)}" class="rb-open">
        ${plateArt(r, 112)}
        <span class="rb-tx">
          ${cooking[r.id] ? `<span class="rb-badge hot">Cooking · step ${cooking[r.id]}</span>`
            : planned[r.id] ? `<span class="rb-badge">Planned · ${esc(planned[r.id])}</span>`
              : cookedAt[r.id] ? `<span class="rb-badge soft">Cooked ${esc(cookedWhen(cookedAt[r.id]).replace(/^on /, ''))}</span>` : ''}
          <span class="rb-t">${esc(r.t)}</span>
          ${r.b ? `<span class="rb-b">${esc(r.b)}</span>` : ''}
          ${meta ? `<span class="rb-m">${esc(meta)}</span>` : ''}
        </span>
      </a>
      <span class="rb-acts">
        <button class="rb-act${fav ? ' on' : ''}" data-heart="${id}" aria-label="${fav ? 'Take out of favorites' : 'Save to favorites'}">${fav ? '♥' : '♡'}</button>
        <button class="rb-act${planned[r.id] && !p ? ' on' : ''}" data-plan="${id}">${p ? `+ ${esc(p.day.label === 'Today' ? 'Today' : p.day.short)}` : planned[r.id] ? `✓ ${esc(planned[r.id])}` : '+ Plan'}</button>
      </span>
    </div>`;
}

const STYLES = `
  <style>
    .rb{height:100%;position:relative;overflow:hidden;color:#FFF4EA;font-family:Inter,system-ui,sans-serif;padding:28px 40px 0;display:flex;flex-direction:column;gap:16px;
      background:radial-gradient(ellipse 1000px 620px at 22% -6%,#5B3320 0%,#2C1B14 52%,#1A110D 100%)}
    .rb-body{flex:1 1 0;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;padding-bottom:28px}
    .rb-wait{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;text-align:center;color:#E8D3BF;font-size:22px;line-height:1.4;padding:48px 40px}
    .rb-search{position:relative;flex:0 1 300px;min-width:0}
    .rb-input{width:100%;min-height:64px;border-radius:999px;border:2px solid rgba(255,255,255,.3);background:rgba(16,10,8,.5);color:#FFFFFF;padding:0 60px 0 26px;
      font:500 20px Inter,sans-serif;outline:none;cursor:pointer;text-align:left;display:flex;align-items:center;white-space:nowrap;overflow:hidden}
    .rb-input .ph{color:#D9C3B0;overflow:hidden;text-overflow:ellipsis}
    .rb-input .tx{overflow:hidden;text-overflow:ellipsis}
    .rb-input.on{border-color:#FFD696}
    .rb-input .car{display:inline-block;width:3px;height:26px;margin-left:2px;background:#FFD696;border-radius:2px;flex:none}
    .rb-input .car.first{margin:0 2px 0 0}
    ${keyboardStyle({ panel: '#1A110D', key: '#FFF4EA', ink: '#3A1D10', go: '#FFD696', goInk: '#3A1D10', space: '#7A5646',
    sug: 'rgba(255,244,234,.14)', sugInk: '#FFF4EA', fn: 'rgba(255,244,234,.16)', fnInk: '#FFF4EA', line: 'rgba(255,244,234,.3)' })}
    .rb-clear{position:absolute;right:4px;top:4px;width:56px;height:56px;border:0;border-radius:50%;background:transparent;font-size:30px;line-height:1;color:#FFF4EA;cursor:pointer;display:none}
    /* The choices made so far, along the top */
    .rb-crumbs{display:flex;align-items:baseline;gap:12px;overflow:hidden}
    .rb-crumbs a{color:#D9C3B0;text-decoration:none;font-size:28px;white-space:nowrap;flex:none;padding:10px 0}
    .rb-crumbs .sep{color:#8F7563;font-size:26px;flex:none}
    .rb-crumbs .on{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    /* The rings: favourites, cooked lately, my recipes */
    .rb-rings{display:flex;overflow-x:auto;-webkit-overflow-scrolling:touch;margin:0 -40px;padding:6px 32px 8px}
    .rb-ring{flex:none;width:112px;text-align:center;text-decoration:none;color:#FFF4EA;position:relative;padding-top:6px}
    .rb-ring .p{position:relative;width:96px;height:96px;margin:0 auto}
    .rb-ring .dash{position:absolute;left:0;top:0}
    .rb-ring .disc{position:absolute;left:10px;top:10px;width:76px;height:76px;border-radius:50%;display:flex;align-items:center;justify-content:center;font:500 32px Outfit,sans-serif;color:#FFFFFF}
    .rb-ring .n{font:600 16px/1.2 Inter,sans-serif;margin-top:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .rb-ring .c{font-size:15px;color:#D9C3B0}
    /* The choices: big plates with the food's photo */
    .rb-picks{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:20px 14px;padding:8px 0 12px}
    .rb-pick{display:flex;flex-direction:column;align-items:center;gap:10px;text-decoration:none;color:#FFF4EA;text-align:center;min-width:0}
    .rb-pick .p{position:relative;width:184px;height:184px}
    .rb-pick .p>svg.k-plate{position:absolute;left:14px;top:14px}
    .rb-pick .dash{position:absolute;left:0;top:0}
    .rb-pick .n{font:500 26px/1.15 Outfit,sans-serif;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .rb-pick.budget{position:relative}
    .rb-pick.budget .n{color:#FFD696;font-weight:600}
    .rb-pick.budget .p>svg.bud{position:absolute;left:14px;top:14px}
    .rb-new{position:absolute;left:50%;top:-4px;margin-left:46px;padding:4px 12px;border-radius:999px;background:#FFD696;color:#3A1D10;font:700 14px Inter,sans-serif;letter-spacing:1px}
    .rb-ring:active .p,.rb-pick:active .p,.rb-card:active{transform:scale(.97)}
    /* Cooking now / tonight */
    .rb-hero{display:flex;gap:16px;margin:10px 0 8px}
    .rb-feat{position:relative;flex:1;min-width:0;height:264px;border-radius:32px;overflow:hidden;color:#FFF4EA}
    .rb-feat .plate{position:absolute;left:-70px;top:-38px;width:340px;height:340px;will-change:transform;animation:rb-turn 150s linear infinite}
    @keyframes rb-turn{to{transform:rotate(360deg)}}
    .rb-feat .tx{position:absolute;left:296px;right:26px;top:22px;bottom:20px;display:flex;flex-direction:column;gap:6px}
    .rb-eyebrow{font:600 15px Inter,sans-serif;letter-spacing:2px;text-transform:uppercase;color:#FFD696}
    .rb-feat .t{font:700 38px/1.04 Outfit,sans-serif;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
    .rb-feat .row{display:flex;gap:10px;margin-top:auto;align-items:center}
    .rb-feat .x-btn{padding:0 22px}
    .rb-h{display:flex;align-items:center;gap:14px;margin:22px 2px 12px;min-height:56px}
    .rb-h .l{font:500 28px Outfit,sans-serif;flex:1;min-width:0}
    /* Recipe cards */
    .rb-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;align-content:start}
    .rb-card{display:flex;align-items:stretch;gap:10px;min-height:148px;border-radius:26px;background:rgba(255,244,234,.09);box-shadow:inset 0 0 0 1.5px rgba(255,244,234,.1);padding:12px 12px 12px 16px}
    .rb-open{flex:1;min-width:0;display:flex;align-items:center;gap:14px;text-decoration:none;color:#FFF4EA}
    .rb-tx{flex:1;min-width:0;display:flex;flex-direction:column;align-items:flex-start;gap:4px}
    .rb-t{font:500 23px/1.14 Outfit,sans-serif;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
    .rb-b{font-size:16px;line-height:1.3;color:#E3CDBB;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .rb-m{font:600 16px Inter,sans-serif;color:#FFD696;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .rb-badge{border-radius:999px;padding:3px 12px;font:600 15px Inter,sans-serif;background:#FFD696;color:#4A2412;white-space:nowrap}
    .rb-badge.hot{background:#FF8A3D;color:#1A0E08}
    .rb-badge.soft{background:rgba(185,240,180,.2);color:#C9F3C4}
    .rb-acts{flex:none;width:104px;display:flex;flex-direction:column;justify-content:center;gap:8px}
    .rb-act{min-height:56px;border-radius:18px;border:0;background:rgba(255,244,234,.12);color:#FFF4EA;font:600 17px Inter,sans-serif;cursor:pointer;padding:0 6px;white-space:nowrap}
    .rb-act[data-heart]{font-size:30px;line-height:1}
    .rb-feat [data-featheart]{font-size:30px;line-height:1}
    .rb-act.on{background:#FFF4EA;color:#B5432A}
    .rb-act[data-plan].on{color:#2E6B45}
    .rb-act:active,.rb-chip:active{transform:scale(.95)}
    /* Chips: the filters, search ideas */
    .rb-filters{display:flex;gap:10px;flex-wrap:wrap;margin:0 0 16px}
    .rb-chip{min-height:56px;padding:0 22px;border-radius:999px;border:0;background:rgba(255,244,234,.12);color:#FFF4EA;font:600 18px Inter,sans-serif;cursor:pointer;
      display:inline-flex;align-items:center;gap:8px;text-decoration:none;white-space:nowrap;flex:none}
    .rb-chip.on{background:#FFF4EA;color:#3A1D10}
    .rb-found{font:600 18px Inter,sans-serif;color:#E8D3BF;margin:2px 2px 14px}
    .rb-bar{display:flex;align-items:center;gap:14px;border-radius:22px;background:#FFD696;color:#3A1D10;padding:8px 10px 8px 24px;font-size:19px;min-height:72px;margin-bottom:14px;flex:none}
    .rb-bar .t{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .rb-suggest{display:flex;flex-direction:column;gap:14px;padding:6px 2px}
    .rb-suggest .h{font:600 15px Inter,sans-serif;color:#FFD696;text-transform:uppercase;letter-spacing:2px}
    /* "Plan it" for a card */
    .rb-sheet{position:absolute;top:0;left:0;right:0;bottom:0;z-index:3;background:rgba(14,8,5,.7);display:flex;align-items:flex-end}
    .rb-panel{width:100%;background:#FFF4EA;color:#3A1D10;border-radius:32px 32px 0 0;padding:26px 40px 32px;display:flex;flex-direction:column;gap:14px}
    .rb-panel h2{font:500 30px Outfit,sans-serif;margin:0;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .rb-row{display:flex;align-items:center;gap:10px}
    .rb-pbtn{min-height:56px;padding:0 24px;border-radius:999px;border:0;background:#F4DCCB;color:#5A2412;font:600 18px Inter,sans-serif;cursor:pointer;flex:none}
    .rb-pbtn.on{background:#5A2412;color:#FFF4EA}
    .rb-days{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:10px}
    .rb-day{min-height:92px;border-radius:18px;border:0;background:#F4DCCB;color:#5A2412;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;font-family:Inter,sans-serif;cursor:pointer}
    .rb-day .l{font-size:18px;font-weight:600}
    .rb-day .s{font-size:15px;opacity:.8}
    .rb-day.on{background:#5A2412;color:#FFF4EA}
    .rb-pnote{font-size:17px;min-height:24px;color:#7A5646}
    .rb-pnote.warn{color:#B3261E;font-weight:600}
    @media (prefers-reduced-motion: reduce){.rb-feat .plate{animation:none}}
  </style>`;

const DASH = (color, size = 96) => `<svg class="dash" width="${size}" height="${size}" viewBox="0 0 96 96" aria-hidden="true"><circle cx="48" cy="48" r="45" fill="none" stroke="${color}" stroke-width="${size > 120 ? 2.4 : 3.5}" stroke-dasharray="40 14"/></svg>`;
const RING_COLORS = ['#E9806A', '#7CC3B2', '#FFD696', '#9DB5E0', '#D9A3C4', '#B8D98A', '#E8B07A', '#A9C7C0'];
const recipesHref = (path) => `#/recipes${path && path.length ? `/${path.map(encodeURIComponent).join('/')}` : ''}`;

export function mount(el, { args = [] } = {}) {
  const first = String(args[0] || '');
  const saved = first === 'favorites' || first === 'recent';
  const mineView = first === 'mine';
  const place = saved || mineView ? null : browsePlace(args);

  el.innerHTML = `${STYLES}<div class="rb" data-root></div>`;
  const root = el.querySelector('[data-root]');
  const here = location.hash;
  let ixNow = null; // the household's recipes + the web recipes kept here, once loaded
  let cardNow = (r) => recipeCard(r); // how this page draws a card (for redrawing one after a tap)
  let sheet = null; // { id, meal, note, warn }: "Plan it" for one card
  let searching = () => false; // somebody is typing or has words in the search box

  const codes = () => {
    if (stopCodes) stopCodes();
    stopCodes = root.querySelector('[data-phone-code]') ? wirePhoneCodes(root) : null;
  };

  // ---- Long lists: a screenful first, the rest a moment later ----
  // (A whole list at once kept a real tablet busy for over half a second before anything showed.)
  const FIRST_CARDS = 12;
  let moreToCome = null;
  const cards = (list, card, spot = here) => {
    const whole = list.length <= FIRST_CARDS || !!(memo().scroll || {})[spot];
    moreToCome = whole ? null : { rest: list.slice(FIRST_CARDS), card };
    return (whole ? list : list.slice(0, FIRST_CARDS)).map(card).join('');
  };
  const restOfCards = (box) => {
    const more = moreToCome;
    moreToCome = null;
    if (!more || !box) return;
    const add = () => {
      if (!box.isConnected) return;
      box.insertAdjacentHTML('beforeend', more.rest.splice(0, 30).map(more.card).join(''));
      if (more.rest.length) setTimeout(add, 40);
    };
    setTimeout(add, 60);
  };

  // ---- The household's own and the web recipes kept on the screen (what works offline) ----
  const keptList = () => {
    const out = webEntries().filter((e) => cachedRecipe(e.id));
    return out.concat((ixNow ? ixNow.recipes : []).filter((r) => r.c === 'mine'));
  };
  const offlineHtml = () => {
    const list = keptList();
    // (Online, but the sites didn't answer: say that, not "No internet".)
    const why = navigator.onLine === false ? 'No internet' : 'The recipe sites didn’t answer';
    return list.length
      ? `<div class="rb-found">${why} · saved recipes <button data-retry class="x-btn sm frost" style="margin-left:12px">Try again</button></div><div class="rb-cards">${list.map(cardNow).join('')}</div>`
      : `<div class="rb-wait">${why}.<button data-retry class="x-btn white">Try again</button></div>`;
  };

  // ---- Recipes from the web: cards with real photos ----
  // webStart() asks the sites (or takes the screen's copy of a recent one, drawn at once, so
  // coming back puts the list where it was); each site's cards are added as they come.
  // 24 to start with; scrolling near the end shows more, then asks for the next page.
  web = null;
  const WEB_FIRST = 24;
  const webBox = () => root.querySelector('[data-webhits]');
  const addWeb = (w, list, pg) => {
    list.forEach((e) => {
      if (w.list.some((x) => x.id === e.id)) return;
      w.list.push(Object.assign({ pg }, e));
      if (ixNow && !ixNow.byId[e.id]) ixNow.byId[e.id] = e;
    });
    // A later page goes after what is already there. In a page: the closest place first, the
    // titles with every word next, then the sites taking turns (one from each, then the next).
    w.list.sort((a, b) => a.pg - b.pg || (a.x || 0) - (b.x || 0) || (b.f || 0) - (a.f || 0) || (a.n || 0) - (b.n || 0));
  };
  function drawWeb() {
    const box = webBox();
    if (!box || !web) return;
    const show = web.list.slice(0, web.shown);
    // More cards after the same ones (scrolling on, a slower site answering): only the new
    // ones are added, not every card (up to 240, each with its plate) made again mid-scroll.
    const had = box.__ids || [];
    const cards = box.firstElementChild;
    if (cards && cards.classList.contains('rb-cards') && show.length > had.length && had.every((id, i) => show[i].id === id)) {
      cards.insertAdjacentHTML('beforeend', show.slice(had.length).map(cardNow).join(''));
      box.__ids = show.map((r) => r.id);
      return;
    }
    box.__ids = show.length ? show.map((r) => r.id) : [];
    if (show.length) box.innerHTML = `<div class="rb-cards">${show.map(cardNow).join('')}</div>`;
    else if (!web.done) box.innerHTML = web.quiet ? '' : '<div class="rb-wait">Loading…</div>';
    else box.innerHTML = web.failed ? offlineHtml() : web.quiet ? '' : '<div class="rb-wait">Nothing here yet.</div>';
  }
  // kind 'b': a place (path of choices); 'q': words searched.
  function webStart(kind, arg, opts = {}) {
    const key = `${kind}|${kind === 'b' ? arg.join('/') : arg}`;
    if (web && web.key === key) { drawWeb(); if (opts.then && web.done) opts.then(web); return; }
    if (web && web.ctl) web.ctl.abort();
    const w = { key, list: [], shown: WEB_FIRST, page: 1, more: [], busy: true, done: false, failed: false, quiet: !!opts.quiet, ctl: new AbortController() };
    w.ask = (page, sources) => {
      const o = { page, sources, signal: w.ctl.signal, onResults: (l) => { if (web === w) { addWeb(w, l, page); drawWeb(); } } };
      return kind === 'b' ? browseWeb(Object.assign({ path: arg }, o)) : searchWeb(Object.assign({ q: arg }, o));
    };
    web = w;
    drawWeb();
    w.ask(1, null).then((res) => {
      if (web !== w) return;
      w.busy = false; w.done = true; w.more = res.more || []; w.failed = !!res.failed;
      drawWeb();
      if (opts.then) opts.then(w);
    });
  }
  function webMore() {
    const w = web;
    if (!w || !webBox()) return;
    if (w.list.length > w.shown) { w.shown += 12; drawWeb(); return; }
    if (!w.more.length || w.busy || w.list.length >= 240) return;
    w.busy = true;
    w.shown += 12;
    const pg = w.page + 1;
    // (Only the sources that had a full page last time.)
    w.ask(pg, w.more).then((res) => {
      if (web !== w) return;
      w.busy = false; w.page = pg; w.more = res.more || [];
    });
  }
  // Near the end of a list: more from the web.
  root.addEventListener('scroll', (e) => {
    const box = e.target;
    if (!box.classList || !box.classList.contains('rb-body')) return;
    if (web && box.scrollTop + box.clientHeight > box.scrollHeight - 500) webMore();
  }, true);

  // Remember how far down the list was scrolled (per page), and put it back on return.
  // `key()` names the spot (the page, plus the search words when searching); null = don't keep.
  const keepScroll = (box, key = () => here) => {
    const at = (memo().scroll || {})[key()];
    if (at) box.scrollTop = at;
    const save = () => { const k = key(); if (k == null) return; const sc = memo().scroll || {}; sc[k] = box.scrollTop; setMemo({ scroll: sc }); };
    let t;
    box.addEventListener('scroll', () => { clearTimeout(t); t = setTimeout(save, 200); });
    box.addEventListener('click', save); // tapping a recipe saves the spot right away
  };

  // ---- A list of the household's recipes with filter chips above it ----
  // The chosen filter is remembered for the page (like the scroll spot).
  let shown = null; // { box, list, card, empty } of the list on screen, to redraw when a chip is tapped
  const filterOn = () => (memo().filters || {})[here] || '';
  const drawList = (box, list, card, empty, spot) => {
    shown = { box, list, card, empty };
    cardNow = card;
    const on = filterOn();
    const pick = on ? list.filter((r) => passes(r, on)) : list;
    box.innerHTML = `${list.length > 6 ? filterChips(list, on) : ''}${pick.length
      ? `<div class="rb-cards">${cards(pick, card, spot)}</div>`
      : list.length ? '<div class="rb-wait">None of these match.</div>' : empty}`;
    restOfCards(box.querySelector('.rb-cards'));
    codes();
  };
  root.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-filter]');
    if (!chip || !shown) return;
    const fl = memo().filters || {};
    fl[here] = fl[here] === chip.dataset.filter ? '' : chip.dataset.filter;
    const sc = memo().scroll || {};
    delete sc[here];
    setMemo({ filters: fl, scroll: sc });
    drawList(shown.box, shown.list, shown.card, shown.empty, '');
    shown.box.scrollTop = 0;
  });

  // "Pick one for me": a recipe at random from what's on screen.
  root.addEventListener('click', (e) => {
    if (!e.target.closest('[data-pick]')) return;
    let pick = web ? web.list : [];
    if (shown) { const on = filterOn(); pick = on ? shown.list.filter((r) => passes(r, on)) : shown.list; }
    if (pick.length) location.hash = `#/dish/${encodeURIComponent(pick[Math.floor(Math.random() * pick.length)].id)}`;
  });

  // ---- The heart and "+ Plan" on every card ----
  const redrawCard = (id) => {
    const r = ixNow && ixNow.byId[id];
    if (!r) return;
    root.querySelectorAll('[data-card]').forEach((n) => { if (n.dataset.card === id) n.outerHTML = cardNow(r); });
    root.querySelectorAll('[data-featheart]').forEach((b) => {
      if (b.dataset.featheart !== id) return;
      const on = favs.indexOf(id) >= 0;
      b.textContent = on ? '♥' : '♡';
      b.className = `x-btn round ${on ? 'white' : 'frost'}`;
    });
  };
  const mealFor = (r) => {
    const c = ixNow.cuisines.find((x) => x.id === r.c) || {};
    return defaultMeal(r.c === 'mine' || r.c === 'web' ? r.ty : c.meal);
  };
  // A web recipe hearted or planned is kept on the screen for good (it works offline then).
  const keep = (id) => { if (isWebId(id) && ixNow && ixNow.byId[id]) keepWebRecipe(ixNow.byId[id]); };
  function drawSheet() {
    let box = root.querySelector('[data-sheet]');
    if (!sheet) { if (box) box.remove(); return; }
    if (!box) { box = document.createElement('div'); box.setAttribute('data-sheet', ''); root.appendChild(box); }
    const r = ixNow.byId[sheet.id];
    const days = planDays(0);
    box.innerHTML = `<div class="rb-sheet" data-shut><div class="rb-panel">
      <div class="rb-row"><h2>Plan “${esc(r.t)}”</h2><button data-shut class="rb-pbtn on">Done</button></div>
      <div class="rb-row">${MEALS.map(([m, name]) => `<button class="rb-pbtn${m === sheet.meal ? ' on' : ''}" data-pmeal="${m}" style="flex:1">${name}</button>`).join('')}</div>
      <div class="rb-days">${days.map((d) => {
        const on = plannedFor(d.key, sheet.meal).indexOf(r.id) >= 0;
        return `<button class="rb-day${on ? ' on' : ''}" data-pday="${d.key}"><span class="l">${d.label === 'Today' ? 'Today' : d.short}</span><span class="s">${on ? '✓ Planned' : d.sub}</span></button>`;
      }).join('')}</div>
      <div class="rb-pnote${sheet.warn ? ' warn' : ''}">${esc(sheet.note || '')}</div>
    </div></div>`;
  }
  root.addEventListener('click', (e) => {
    const heart = e.target.closest('[data-heart],[data-featheart]');
    if (heart) {
      const id = heart.dataset.heart || heart.dataset.featheart;
      // Out of the favourites: nobody's heart stays on it (see the recipe's own page).
      if (!toggleFavorite(id)) clearLoves(id);
      else keep(id);
      favs = favorites();
      redrawCard(id);
      return;
    }
    const plan = e.target.closest('[data-plan]');
    if (plan && ixNow) {
      const r = ixNow.byId[plan.dataset.plan];
      if (!r) return;
      // Sent here to fill a day of the week plan: one tap does it, and back to the plan.
      const p = pendingAdd();
      if (p) {
        if (plannedFor(p.key, p.meal).indexOf(r.id) < 0 && plannedFor(p.key, p.meal).length >= MAX_PER_MEAL) {
          plan.textContent = 'Day is full';
          return;
        }
        addToPlan(p.key, r.id, p.meal);
        keep(r.id);
        try { sessionStorage.removeItem(ADD_DAY_KEY); } catch (er) { /* storage off */ }
        location.hash = '#/plan';
        return;
      }
      sheet = { id: r.id, meal: mealFor(r), note: '', warn: false };
      drawSheet();
      return;
    }
    if (!sheet) return;
    const shut = e.target.closest('[data-shut]');
    if (shut && (shut.tagName === 'BUTTON' || e.target === shut)) {
      const id = sheet.id;
      sheet = null;
      drawSheet();
      planned = plannedLabels();
      redrawCard(id);
      return;
    }
    const pm = e.target.closest('[data-pmeal]');
    if (pm) { sheet.meal = pm.dataset.pmeal; sheet.note = ''; sheet.warn = false; drawSheet(); return; }
    const pd = e.target.closest('[data-pday]');
    if (!pd) return;
    const k = pd.dataset.pday;
    const d = planDays(0).find((x) => x.key === k);
    sheet.note = ''; sheet.warn = false;
    if (plannedFor(k, sheet.meal).indexOf(sheet.id) >= 0) removeFromPlan(k, sheet.id, sheet.meal);
    else if (plannedFor(k, sheet.meal).length >= MAX_PER_MEAL) {
      sheet.warn = true;
      sheet.note = `${d ? d.label : 'That day'} already has ${MAX_PER_MEAL} ${mealWord(sheet.meal)} recipes. Take one off in Week plan first.`;
    } else { addToPlan(k, sheet.id, sheet.meal); keep(sheet.id); }
    drawSheet();
  });

  // Picking a recipe for a day of the week plan: say so along the top.
  const pendingBar = () => {
    const p = pendingAdd();
    return p ? `<div class="rb-bar" data-pendbar><span class="t">Picking for <b>${esc(p.day.label)} ${mealWord(p.meal)}</b></span>
      <button data-pendstop class="x-btn sm ink">Never mind</button></div>` : '';
  };
  root.addEventListener('click', (e) => {
    if (!e.target.closest('[data-pendstop]')) return;
    try { sessionStorage.removeItem(ADD_DAY_KEY); } catch (er) { /* storage off */ }
    load();
  });

  // ---- The choices: a big plate each, with a photo of the food when one is known ----
  const pickPlate = (key, name, meal) => {
    const img = placePicture(key);
    return plateArt({ id: key, t: name, ty: meal, c: 'web', img: img || '' }, 156);
  };
  const picksHtml = (pl) => `<div class="rb-picks" data-picks>${pl.choices.map((c, n) => {
    const path = pl.path.concat(c.id);
    const key = browsePlace(path).key;
    return `<a href="${recipesHref(path)}" class="rb-pick" data-pickkey="${esc(key)}">
      <div class="p">${DASH(RING_COLORS[n % RING_COLORS.length], 184)}${pickPlate(key, c.name, pl.meal || c.id)}</div>
      <div class="n">${esc(c.name)}</div></a>`;
  }).join('')}</div>`;
  // "Plan on a budget" (screens/budget.js): a plate of three meals with a price tag, after the meals.
  const budgetPick = () => {
    let seen = false;
    try { seen = !!localStorage.getItem('budget.seen.v1'); } catch (e) { /* storage off */ }
    const dots = (pts, r, fill) => pts.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`).join('');
    return `<a href="#/budget" class="rb-pick budget">
      <div class="p">${DASH(RING_COLORS[7], 184)}<svg class="bud" width="156" height="156" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
        <circle cx="51.5" cy="52.5" r="47" fill="rgba(0,0,0,.24)"/><circle cx="50" cy="50" r="46" fill="#F4EDE0"/><circle cx="50" cy="50" r="35" fill="#FBF8F2" stroke="#E3D8C4" stroke-width="1"/>
        <path d="M50 50L50 19A31 31 0 0 1 76.8 65.5Z" fill="#B5532F"/>${dots([[58, 30], [66, 40], [61, 50], [70, 55], [56, 41]], 2.2, '#6E2A14')}
        <path d="M50 50L76.8 65.5A31 31 0 0 1 23.2 65.5Z" fill="#6E9B4A"/>${dots([[40, 68], [50, 74], [60, 68], [47, 62], [56, 61]], 2.2, '#A8CF7A')}
        <path d="M50 50L23.2 65.5A31 31 0 0 1 50 19Z" fill="#E9C98A"/>${dots([[33, 36], [41, 30], [30, 48], [40, 44], [44, 55]], 2.6, '#FFE27A')}
        <g stroke="#F6EEDF" stroke-width="2.6"><line x1="50" y1="50" x2="50" y2="18"/><line x1="50" y1="50" x2="77.7" y2="66"/><line x1="50" y1="50" x2="22.3" y2="66"/></g>
        <g transform="translate(74 74) rotate(-18)"><rect x="-13" y="-9" width="26" height="18" rx="4" fill="#FFD696" stroke="#3A1D10" stroke-width="1.4"/><circle cx="-8" cy="0" r="1.8" fill="#3A1D10"/><text x="3" y="5" text-anchor="middle" font-family="Outfit, sans-serif" font-weight="700" font-size="13" fill="#3A1D10">$</text></g>
      </svg></div>
      <div class="n">Plan on a budget</div>${seen ? '' : '<span class="rb-new">NEW</span>'}</a>`;
  };
  // The photos not known yet: three asked at a time; each plate is redrawn as its photo comes.
  function fetchPictures(pl, whenDone) {
    if (picCtl) picCtl.abort();
    picCtl = new AbortController();
    const ctl = picCtl;
    const todo = pl.choices.map((c) => pl.path.concat(c.id)).filter((p) => placePicture(browsePlace(p).key) == null);
    if (!todo.length || navigator.onLine === false) { if (whenDone) whenDone(); return; }
    let running = 0;
    const next = () => {
      if (ctl.signal.aborted || !el.isConnected) return;
      if (!todo.length) { if (!running && whenDone) whenDone(); return; }
      const path = todo.shift();
      running++;
      const used = pl.choices.map((c) => placePicture(browsePlace(pl.path.concat(c.id)).key)).filter(Boolean);
      fetchPlacePicture(path, ctl.signal, used).then((img) => {
        running--;
        const key = browsePlace(path).key;
        const box = img && [].find.call(root.querySelectorAll('[data-pickkey]'), (a) => a.dataset.pickkey === key);
        const old = box && box.querySelector('svg.k-plate');
        if (old) old.outerHTML = pickPlate(key, box.querySelector('.n').textContent, pl.meal || path[0]);
        next();
      });
    };
    for (let k = 0; k < 3; k++) next();
  }

  // The top bar on a page of choices or recipes: the choices made so far, each one a way back.
  const crumbTop = (pl, right = '') => {
    const parent = pl.crumbs.length > 1 ? pl.crumbs[pl.crumbs.length - 2] : null;
    const crumbs = pl.crumbs.map((c, i, a) => (i === a.length - 1 ? `<span class="on">${esc(c.name)}</span>`
      : `<a href="${recipesHref(c.path)}">${esc(c.name)}</a><span class="sep" aria-hidden="true">›</span>`)).join('');
    return topBar({ title: '', back: parent ? recipesHref(parent.path) : '#/recipes', backLabel: '← Back', tone: 'dark', right })
      .replace('<div class="x-title"></div>', `<nav class="x-title rb-crumbs" aria-label="Choices">${crumbs}</nav>`);
  };

  const load = () => {
  sheet = null;
  searching = () => false;
  if (web && web.ctl) web.ctl.abort();
  web = null;
  shown = null;
  root.innerHTML = `${topBar({ title: 'Recipes', tone: 'dark' })}<div class="rb-wait rb-body" data-wait></div>`;

  loadKnown().then((ix) => {
    if (!el.isConnected) return;
    ixNow = ix;
    planned = plannedLabels();
    favs = favorites();
    readBadges();
    const names = {};
    ix.cuisines.forEach((c) => { names[c.id] = c.name; });
    const card = (r) => recipeCard(r, r.c === 'web' ? '' : names[r.c]);
    cardNow = card;

    if (saved) {
      // ---- Hearted recipes, or the ones cooked lately (one tap between the two) ----
      const recent = first === 'recent';
      const list = (recent ? cookedList().map((x) => x.id) : favs).map((id) => ix.byId[id]).filter(Boolean);
      root.innerHTML = `
        ${topBar({ title: recent ? 'Cooked lately' : 'Favorites', back: '#/recipes', backLabel: '← Recipes', tone: 'dark',
          right: `<a href="#/recipes/favorites" class="x-btn sm ${recent ? 'glass' : 'white'}">♥ Favorites</a><a href="#/recipes/recent" class="x-btn sm ${recent ? 'white' : 'glass'}">Cooked lately</a>` })}
        ${pendingBar()}
        <div class="rb-body" data-list></div>`;
      drawList(root.querySelector('[data-list]'), list, card,
        recent ? '<div class="rb-wait">Nothing cooked yet.<a href="#/recipes" class="x-btn white">Browse recipes</a></div>'
          : '<div class="rb-wait">No favorites yet.<a href="#/recipes" class="x-btn white">Browse recipes</a></div>');
      keepScroll(root.querySelector('[data-list]'));
      return;
    }

    if (mineView) {
      // ---- The household's own recipes ----
      const list = ix.recipes.filter((r) => r.c === 'mine');
      root.innerHTML = `
        ${topBar({ title: 'My recipes', tone: 'dark', back: '#/recipes', backLabel: '← Recipes',
          right: `${list.length > 3 ? '<button data-pick class="x-btn sm glass">Pick one for me</button>' : ''}${list.length ? '<a href="#/myrecipe" class="x-btn sm white">+ Add a recipe</a>' : ''}` })}
        ${undoBar()}${pendingBar()}
        <div class="rb-body" data-list></div>`;
      drawList(root.querySelector('[data-list]'), list, card,
        `<div class="rb-wait" style="padding-top:20px">No recipes of your own yet.
          <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap;justify-content:center">${phoneCode({ tab: 'recipe', size: 120, sub: ' ' })}<a href="#/myrecipe" class="x-btn white">+ Type one in</a></div></div>`);
      keepScroll(root.querySelector('[data-list]'));
      return;
    }

    if (place.meal && place.choices) {
      // ---- A step of choices: cuisines, main ingredients, dishes, kinds ----
      root.innerHTML = `${crumbTop(place)}${pendingBar()}<div class="rb-body" data-body>${picksHtml(place)}</div>`;
      keepScroll(root.querySelector('[data-body]'));
      fetchPictures(place);
      return;
    }

    if (place.meal) {
      // ---- The recipes of the place chosen ----
      root.innerHTML = `${crumbTop(place, '<button data-pick class="x-btn sm glass">Pick one for me</button>')}${pendingBar()}
        <div class="rb-body" data-body><div data-webhits></div></div>`;
      webStart('b', place.path);
      keepScroll(root.querySelector('[data-body]'));
      return;
    }

    // ---- The first page: the meals + search ----
    root.innerHTML = `
      ${topBar({ title: 'Recipes', tone: 'dark', back: backHref(), backLabel: backLabel(),
        right: `<div class="rb-search"><button type="button" data-search class="rb-input" aria-label="Search recipes"><span class="ph">Search recipes</span></button><button data-clear class="rb-clear" aria-label="Clear search">×</button></div>` })}
      <div data-body class="rb-body"></div>`;
    const body = root.querySelector('[data-body]');
    const mineCount = ix.recipes.filter((r) => r.c === 'mine').length;

    const ring = (href, name, count, glyph, bg, color) => `
      <a href="${href}" class="rb-ring">
        <div class="p">${DASH(color)}<div class="disc" style="background:${bg}">${glyph}</div></div>
        <div class="n">${esc(name)}</div>${count ? `<div class="c">${count}</div>` : ''}
      </a>`;
    // Part-way through cooking something, or tonight's dinner on the plan: that is the big card.
    const hero = () => {
      const now = cookingNow();
      const nowR = now && ix.byId[now.id];
      const tonightId = plannedFor(dayKey(new Date()), 'dinner').find((id) => ix.byId[id]);
      const feat = nowR || (tonightId && ix.byId[tonightId]) || null;
      if (!feat) return '';
      const tc = tableColors(feat.table || feat.c);
      const featFav = favs.indexOf(feat.id) >= 0;
      return `<div class="rb-hero"><div class="rb-feat" style="background:radial-gradient(ellipse 520px 420px at 14% 50%,${tc[0]} 0%,${tc[1]} 55%,${tc[2]} 100%)">
        <a href="#/dish/${encodeURIComponent(feat.id)}" class="plate" aria-label="${esc(feat.t)}">${plateArt(feat, 340, { detail: true })}</a>
        <div class="tx">
          <div class="rb-eyebrow">${nowR ? `You’re cooking · step ${now.step}` : 'Tonight'}</div>
          <div class="t">${esc(feat.t)}</div>
          <div class="rb-m">${esc([feat.m ? fmtMinutes(feat.m) : '', feat.c === 'web' ? feat.site || '' : names[feat.c] || ''].filter(Boolean).join(' · '))}</div>
          <div class="row">
            ${nowR ? `<a href="#/recipe/${encodeURIComponent(feat.id)}" class="x-btn white">Carry on cooking</a><a href="#/dish/${encodeURIComponent(feat.id)}" class="x-btn frost">The recipe</a>`
              : `<a href="#/dish/${encodeURIComponent(feat.id)}" class="x-btn white">Open the recipe</a>`}
            <button data-featheart="${esc(feat.id)}" class="x-btn round ${featFav ? 'white' : 'frost'}" aria-label="Favorite">${featFav ? '♥' : '♡'}</button>
          </div>
        </div>
      </div></div>`;
    };
    const showHome = () => {
      cardNow = card;
      shown = null;
      const favList = favs.map((id) => ix.byId[id]).filter(Boolean);
      const top = `${pendingBar()}<div class="rb-rings">
          ${ring('#/recipes/favorites', 'Favorites', favList.length, '♥', '#B5432A', '#E9806A')}
          ${ring('#/recipes/recent', 'Cooked lately', cookedList().filter((x) => ix.byId[x.id]).length, '✓', '#3E7C6E', '#7CC3B2')}
          ${ring(mineCount ? '#/recipes/mine' : '#/myrecipe', 'My recipes', mineCount, '+', '#6A5648', '#D9C3B0')}
        </div>${hero()}`;
      // No internet: what is kept on the screen instead of the meals (they'd lead nowhere).
      if (!webReachable()) { body.innerHTML = `${top}<div style="height:24px"></div>${offlineHtml()}`; return; }
      const meals = { path: [], meal: '', choices: WEB_MEALS.map(([id, name]) => ({ id, name })) };
      body.innerHTML = `${top}${picksHtml(meals).replace(/<\/div>$/, `${budgetPick()}</div>`)}`;
      fetchPictures(meals, () => { if (!webReachable() && !query.trim() && el.isConnected && body.querySelector('[data-picks]')) showHome(); });
    };
    const box = root.querySelector('[data-search]');
    const clearBtn = root.querySelector('[data-clear]');
    // ---- The search box and its keyboard (the screen's own: Android's never comes up) ----
    let query = ''; // what is typed
    let kb = null; // the keyboard, while it is up
    const drawBox = () => {
      const q = query;
      box.classList.toggle('on', !!kb);
      box.innerHTML = q ? `<span class="tx">${esc(q)}</span>${kb ? '<span class="car"></span>' : ''}`
        : `${kb ? '<span class="car first"></span>' : ''}<span class="ph">Search recipes</span>`;
      clearBtn.style.display = q.trim() ? 'block' : 'none';
    };
    // Above the keys: kinds of food and dishes that start with (or have a word starting with) what is typed.
    const suggestFor = (text) => {
      const q = text.trim().toLowerCase().replace(/\s+/g, ' ');
      if (!q) return []; // (the last searches and ideas are already above, as chips)
      const hits = [];
      suggestPool().forEach((x) => {
        const r = x.k.indexOf(q) === 0 ? 0 : x.w.indexOf(` ${q}`) >= 0 ? 1 : -1;
        if (r >= 0) hits.push({ x, r });
      });
      hits.sort((a, b) => a.r - b.r || a.x.k.length - b.x.k.length);
      return hits.slice(0, 4).map((h) => h.x.t);
    };
    // "Search", a suggestion, or "Close" with words typed: put the keys away and look on the web.
    const submit = () => {
      clearTimeout(searchTimer);
      rememberSearch(query);
      if (kb) kb.close(); else runSearch(false);
    };
    const openKb = () => {
      if (kb) return;
      body.style.paddingBottom = '450px'; // the end of the results can still be scrolled above the keys
      kb = openKeyboard(root, {
        go: 'Search', slots: 4, text: query, suggest: suggestFor,
        onChange: (t) => {
          const was = query;
          query = t;
          drawBox();
          if (t === was) return;
          clearTimeout(searchTimer);
          searchTimer = setTimeout(() => runSearch(false), 250);
        },
        onGo: (pick, k) => { if (pick) { k.text = pick; query = pick; } submit(); },
        onClose: () => { kb = null; body.style.paddingBottom = ''; drawBox(); clearTimeout(searchTimer); runSearch(false); },
      });
      drawBox();
      if (!query.trim()) showSuggestions();
    };
    box.addEventListener('click', openKb);
    // Before typing: the last few searches and some ideas, one tap each.
    const chipRow = (words) => `<div class="rb-filters" style="margin:0">${words.map((w) => `<button class="rb-chip" data-q="${esc(w)}">${esc(w)}</button>`).join('')}</div>`;
    const showSuggestions = () => {
      if (query.trim()) return;
      const recent = recentSearches();
      shown = null;
      if (web && web.ctl) web.ctl.abort();
      web = null;
      body.innerHTML = `<div class="rb-suggest">
        ${recent.length ? `<div class="h">Searched lately</div>${chipRow(recent)}` : ''}
        <div class="h">Ideas</div>${chipRow(IDEAS.filter((w) => recent.indexOf(w) < 0))}
      </div>`;
    };
    // Nothing in the household's own recipes or (once it has answered) on the web.
    const nothing = (q, w) => {
      if (query.trim() !== q || w.list.length || body.querySelector('[data-minehits] .rb-card')) return;
      const words = q.toLowerCase().split(/\s+/).filter(Boolean);
      const hb = webBox();
      if (!hb) return;
      hb.innerHTML = w.failed ? offlineHtml() : `<div class="rb-wait">Nothing found for “${esc(q)}”.
        ${chipRow((words.length > 1 ? words : []).concat(IDEAS.slice(0, 6)).filter((x, n, a) => a.indexOf(x) === n).slice(0, 8))}
        <button data-clear class="x-btn frost">Clear the search</button></div>`;
    };
    const runSearch = (restoring) => {
      const q = query.trim();
      clearBtn.style.display = q ? 'block' : 'none';
      const qs = memo().qs || {}; qs[here] = q; setMemo({ qs });
      if (!q) { if (web && web.ctl) web.ctl.abort(); web = null; if (kb) showSuggestions(); else showHome(); return; }
      // The household's own recipes with the words, first; then the web's.
      const words = q.toLowerCase().split(/\s+/).filter(Boolean);
      const mine = ix.recipes.filter((r) => r.c === 'mine' && words.every((w) => `${r.t} ${r.b || ''}`.toLowerCase().indexOf(w) >= 0));
      cardNow = card;
      shown = null;
      const keepWeb = web && web.key === `q|${q}`;
      body.innerHTML = `<div data-minehits>${mine.length ? `<div class="rb-found">My recipes</div><div class="rb-cards" style="margin-bottom:22px">${mine.map(card).join('')}</div>` : ''}</div>
        <div data-webhits></div>`;
      // The web, once the words are settled (not on every key): a recent search is drawn at
      // once from the screen's copy, so the spot in the list can be put back.
      if (!kb) webStart('q', q, { then: (w) => nothing(q, w) });
      else if (keepWeb) drawWeb();
      else { if (web && web.ctl) web.ctl.abort(); web = null; }
      if (!restoring) body.scrollTop = 0;
      else { const at = (memo().scroll || {})[`${here}?${q}`]; if (at) body.scrollTop = at; }
    };
    body.addEventListener('click', (e) => {
      const sug = e.target.closest('[data-q]');
      if (sug) {
        query = sug.dataset.q;
        if (kb) kb.set(query); else drawBox();
        submit();
        return;
      }
      // Opening a recipe from the results: the words were worth keeping.
      if (e.target.closest('.rb-open') && query.trim()) rememberSearch(query);
    });
    const clearAll = () => { query = ''; if (kb) kb.set(''); drawBox(); runSearch(false); openKb(); };
    root.querySelector('.x-top').addEventListener('click', (e) => { if (e.target.closest('[data-clear]')) clearAll(); });
    body.addEventListener('click', (e) => { if (e.target.closest('[data-clear]')) clearAll(); });
    // Back from a recipe you found by searching: the search (and the spot in it) is still there.
    keepScroll(body, () => (query.trim() ? `${here}?${query.trim()}` : null));
    const lastQ = (memo().qs || {})[here];
    if (lastQ) { query = lastQ; drawBox(); runSearch(true); } else { drawBox(); showHome(); }
    searching = () => !!kb || !!query.trim();
  }).catch((err) => {
    console.error(err);
    const box = el.isConnected && root.querySelector('[data-wait]');
    if (box) box.innerHTML = '<button data-retry class="x-btn white">Try again</button>';
  });
  };
  // ---- "Undo" for an own recipe deleted a moment ago (see myrecipe.js) ----
  const UNDO_MS = 5 * 60 * 1000;
  const undone = () => {
    try {
      const u = JSON.parse(sessionStorage.getItem(UNDO_KEY) || 'null');
      return u && u.recipe && Date.now() - u.at < UNDO_MS ? u.recipe : null;
    } catch (e) { return null; }
  };
  function undoBar() {
    const x = undone();
    return x ? `<div class="rb-bar" data-undobar><span class="t">“${esc(x.title)}” was deleted.</span>
      <button data-undo class="x-btn sm ink">Undo</button><button data-undoclose class="x-btn sm round line" aria-label="Close">✕</button></div>` : '';
  }
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-undoclose]')) {
      try { sessionStorage.removeItem(UNDO_KEY); } catch (er) { /* storage off */ }
      const bar = root.querySelector('[data-undobar]');
      if (bar) bar.remove();
      return;
    }
    if (!e.target.closest('[data-undo]')) return;
    const x = undone();
    try { sessionStorage.removeItem(UNDO_KEY); } catch (er) { /* storage off */ }
    if (!x) return;
    try { saveRecipe(x); } catch (er) { /* the save explains itself next time */ }
    load();
  });

  root.addEventListener('click', (e) => { if (e.target.closest('[data-retry]')) { webRetry(); load(); } });

  // A recipe sent from a phone (or deleted there) shows up without leaving the page, unless
  // somebody is in the middle of a search or of planning a card.
  if (offMine) offMine();
  offMine = onMyRecipesChanged(() => {
    if (!el.isConnected || sheet) return;
    if (searching()) return;
    if (mineView || (place && !place.meal)) load();
  });
  load();
}

export function unmount() {
  clearTimeout(searchTimer);
  if (web && web.ctl) web.ctl.abort();
  web = null;
  if (picCtl) { picCtl.abort(); picCtl = null; }
  if (stopCodes) { stopCodes(); stopCodes = null; }
  if (offMine) { offMine(); offMine = null; }
}
