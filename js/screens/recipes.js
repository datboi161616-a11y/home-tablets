// Kitchen · Recipes: every dish is a painted plate on a dark table.
//   #/recipes                    a ring of plates (the kinds of food), tonight's dish, ideas
//   #/recipes/dinner             the dinner cuisines
//   #/recipes/chinese            every Chinese recipe
//   #/recipes/chinese/noodles    just the noodles
//   #/recipes/favorites          hearted recipes
//   #/recipes/recent             cooked lately (from cooking mode's "Done cooking")
// Search is in the top bar on the first page. Every card has a heart and "+ Plan".
// (No links into the Week plan or Shopping list here: those open from the Menu.)
import { backHref, backLabel } from '../services/nav.js';
import { loadIndex, searchRecipes, searchIngredients, fmtMinutes, cookedList, cookedWhen, cookingNow, clearLoves } from '../services/recipe-data.js';
import { getPlan, weekDays, dayIds, favorites, toggleFavorite, tonight, addToPlan, removeFromPlan, plannedFor, planDays, dayKey, defaultMeal, MEALS } from '../services/meal-plan.js';
import { saveRecipe, UNDO_KEY, onMyRecipesChanged } from '../services/my-recipes.js';
import { esc, plateArt, tableColors } from './kitchen-ui.js';
import { topBar, phoneCode, wirePhoneCodes } from './ui.js';
import { ADD_DAY_KEY } from './dish.js';

let searchTimer, blurTimer;
let stopCodes = null; // stops the "scan with your phone" code being redrawn
let offMine = null; // stops listening for recipes sent from a phone
let favs = [];
let planned = {}; // id -> "Thu" for recipes on this week's plan
let cooking = {}; // id -> step number, for recipes part-way through in cooking mode
let cookedAt = {}; // id -> when last cooked
const MAX_PER_MEAL = 3; // same limit as the week plan

// ---- Filters a kitchen cares about -------------------------------------------------
// Only what the recipe data really says: its time, and the tags the library gives it.
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
function pendingAdd() {
  let raw = '';
  try { raw = String(sessionStorage.getItem(ADD_DAY_KEY) || ''); } catch (e) { raw = ''; }
  const [key, meal] = raw.split('|');
  const day = key && planDays(0).concat(planDays(1)).find((d) => d.key === key);
  return day ? { key, meal: meal || 'dinner', day } : null;
}
const mealWord = (m) => (MEALS.find((x) => x[0] === m) || ['', 'Dinner'])[1].toLowerCase();

function recipeCard(r, cuisineName) {
  const tags = (r.g || []).filter((t) => t !== 'kid-friendly').slice(0, cuisineName ? 1 : 2);
  const fav = favs.indexOf(r.id) >= 0;
  const p = pendingAdd();
  const meta = [r.m ? fmtMinutes(r.m) : '', cuisineName || ''].concat(tags).filter(Boolean).join(' · ');
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
      font:500 20px Inter,sans-serif;outline:none}
    .rb-input::placeholder{color:#D9C3B0}
    .rb-input:focus{border-color:#FFD696}
    .rb-clear{position:absolute;right:4px;top:4px;width:56px;height:56px;border:0;border-radius:50%;background:transparent;font-size:30px;line-height:1;color:#FFF4EA;cursor:pointer;display:none}
    /* The ring of plates: one for each kind of food */
    .rb-rings{display:flex;overflow-x:auto;-webkit-overflow-scrolling:touch;margin:0 -40px;padding:6px 32px 8px}
    .rb-ring{flex:none;width:112px;text-align:center;text-decoration:none;color:#FFF4EA;position:relative;padding-top:6px}
    .rb-ring .p{position:relative;width:96px;height:96px;margin:0 auto}
    .rb-ring .p>svg.k-plate{position:absolute;left:10px;top:10px}
    .rb-ring .dash{position:absolute;left:0;top:0}
    .rb-ring.spin .dash{will-change:transform;animation:rb-turn 14s linear infinite}
    @keyframes rb-turn{to{transform:rotate(360deg)}}
    .rb-ring .disc{position:absolute;left:10px;top:10px;width:76px;height:76px;border-radius:50%;display:flex;align-items:center;justify-content:center;font:500 32px Outfit,sans-serif;color:#FFFFFF}
    .rb-ring .n{font:600 16px/1.2 Inter,sans-serif;margin-top:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .rb-ring .c{font-size:15px;color:#D9C3B0}
    .rb-ring:active .p,.rb-card:active,.rb-tile:active{transform:scale(.97)}
    /* Tonight */
    .rb-hero{display:flex;gap:16px;margin-top:10px}
    .rb-feat{position:relative;flex:1;min-width:0;height:264px;border-radius:32px;overflow:hidden;color:#FFF4EA}
    .rb-feat .plate{position:absolute;left:-70px;top:-38px;width:340px;height:340px;will-change:transform;animation:rb-turn 150s linear infinite}
    .rb-feat .tx{position:absolute;left:296px;right:26px;top:22px;bottom:20px;display:flex;flex-direction:column;gap:6px}
    .rb-eyebrow{font:600 15px Inter,sans-serif;letter-spacing:2px;text-transform:uppercase;color:#FFD696}
    .rb-feat .t{font:700 38px/1.04 Outfit,sans-serif;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
    .rb-feat .row{display:flex;gap:10px;margin-top:auto;align-items:center}
    .rb-feat .x-btn{padding:0 22px}
    .rb-own{flex:none;width:400px;height:264px;border-radius:32px;background:rgba(16,10,8,.5);box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.14);padding:16px;display:flex;flex-direction:column;gap:10px}
    .rb-own .x-code{background:transparent;padding:4px 6px 4px 4px}
    .rb-own .x-code-title{font-size:19px}
    .rb-own .row{display:flex;gap:10px;margin-top:auto}
    .rb-own .row .x-btn{flex:1;padding:0 12px}
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
    /* Chips: the types of a cuisine, the filters, search ideas */
    .rb-types{display:flex;gap:10px;overflow-x:auto;-webkit-overflow-scrolling:touch;flex:none;margin:0 -40px;padding:0 40px 2px}
    .rb-filters{display:flex;gap:10px;flex-wrap:wrap;margin:0 0 16px}
    .rb-chip{min-height:56px;padding:0 22px;border-radius:999px;border:0;background:rgba(255,244,234,.12);color:#FFF4EA;font:600 18px Inter,sans-serif;cursor:pointer;
      display:inline-flex;align-items:center;gap:8px;text-decoration:none;white-space:nowrap;flex:none}
    .rb-chip span{color:#D9C3B0;font-weight:500}
    .rb-chip.on{background:#FFF4EA;color:#3A1D10}
    .rb-chip.on span{color:#7A5646}
    .rb-found{font:600 18px Inter,sans-serif;color:#E8D3BF;margin:2px 2px 14px}
    .rb-bar{display:flex;align-items:center;gap:14px;border-radius:22px;background:#FFD696;color:#3A1D10;padding:8px 10px 8px 24px;font-size:19px;min-height:72px;margin-bottom:14px;flex:none}
    .rb-bar .t{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .rb-suggest{display:flex;flex-direction:column;gap:14px;padding:6px 2px}
    .rb-suggest .h{font:600 15px Inter,sans-serif;color:#FFD696;text-transform:uppercase;letter-spacing:2px}
    /* The dinner cuisines */
    .rb-tiles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}
    .rb-tile{position:relative;height:176px;border-radius:26px;overflow:hidden;padding:18px 20px;color:#FFFFFF;text-decoration:none;display:flex;flex-direction:column;justify-content:space-between}
    .rb-tile svg.k-plate{position:absolute;right:-26px;bottom:-30px}
    .rb-tile .n{font:500 27px/1.1 Outfit,sans-serif;position:relative}
    .rb-tile .c{font-size:16px;line-height:1.3;max-width:58%;position:relative}
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
    @media (prefers-reduced-motion: reduce){.rb-ring.spin .dash,.rb-feat .plate{animation:none}}
  </style>`;

const DASH = (color) => `<svg class="dash" width="96" height="96" viewBox="0 0 96 96" aria-hidden="true"><circle cx="48" cy="48" r="45" fill="none" stroke="${color}" stroke-width="3.5" stroke-dasharray="40 14"/></svg>`;

export function mount(el, { args = [] } = {}) {
  const [cuisineId, typeId] = args;

  el.innerHTML = `${STYLES}<div class="rb" data-root></div>`;
  const root = el.querySelector('[data-root]');
  const here = location.hash;
  let ixNow = null; // the library, once loaded
  let cardNow = (r) => recipeCard(r); // how this page draws a card (for redrawing one after a tap)
  let sheet = null; // { id, meal, note, warn }: "Plan it" for one card

  const codes = () => {
    if (stopCodes) stopCodes();
    stopCodes = root.querySelector('[data-phone-code]') ? wirePhoneCodes(root) : null;
  };

  // ---- Long lists: a screenful first, the rest a moment later ----
  // All 125 cards of a cuisine at once kept a real tablet busy for over half a second
  // before anything showed. Now the first dozen are drawn, and the rest are added right
  // after. (Going back to a spot far down the list still builds it whole, so the list
  // can be put back where it was.)
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

  // ---- A list of recipe cards with filter chips above it ----
  // The chosen filter is remembered for the page (like the scroll spot), so coming back
  // from a recipe shows the same short list.
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

  // "Pick one for me": a recipe at random from what's on screen (after the filter).
  root.addEventListener('click', (e) => {
    if (!e.target.closest('[data-pick]') || !shown) return;
    const on = filterOn();
    const pick = on ? shown.list.filter((r) => passes(r, on)) : shown.list;
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
    return defaultMeal(r.c === 'mine' ? r.ty : c.meal);
  };
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
    } else addToPlan(k, sheet.id, sheet.meal);
    drawSheet();
  });

  // Picking a recipe for a day of the week plan: say so along the top of the list.
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

  const load = () => {
  sheet = null;
  root.innerHTML = `${topBar({ title: 'Recipes', tone: 'dark' })}<div class="rb-wait rb-body" data-wait>Loading recipes…</div>`;

  Promise.all([loadIndex(), tonight().catch(() => null)]).then(([ix, tn]) => {
    if (!el.isConnected) return;
    ixNow = ix;
    planned = plannedLabels();
    const cuisine = ix.cuisines.find((c) => c.id === cuisineId);
    const dinnerView = cuisineId === 'dinner';
    favs = favorites();
    readBadges();
    const names = {};
    ix.cuisines.forEach((c) => { names[c.id] = c.name; });
    if (cuisineId === 'favorites' || cuisineId === 'recent') {
      // ---- Hearted recipes, or the ones cooked lately (one tap between the two) ----
      const recent = cuisineId === 'recent';
      const list = (recent ? cookedList().map((x) => x.id) : favs).map((id) => ix.byId[id]).filter(Boolean);
      root.innerHTML = `
        ${topBar({ title: recent ? 'Cooked lately' : 'Favorites', back: '#/recipes', backLabel: '← Recipes', tone: 'dark',
          right: `<a href="#/recipes/favorites" class="x-btn sm ${recent ? 'glass' : 'white'}">♥ Favorites</a><a href="#/recipes/recent" class="x-btn sm ${recent ? 'white' : 'glass'}">Cooked lately</a>` })}
        ${pendingBar()}
        <div class="rb-body" data-list></div>`;
      drawList(root.querySelector('[data-list]'), list, (r) => recipeCard(r, names[r.c]),
        recent ? '<div class="rb-wait">Nothing cooked yet.<a href="#/recipes" class="x-btn white">Browse recipes</a></div>'
          : '<div class="rb-wait">No favorites yet.<a href="#/recipes" class="x-btn white">Browse recipes</a></div>');
      keepScroll(root.querySelector('[data-list]'));
      return;
    }
    const byMeal = (m) => ix.cuisines.filter((c) => (c.meal || 'dinner') === m);
    const firstOf = (c) => ix.recipes.find((r) => r.c === c.id) || { c: c.id, t: c.name };

    if (!cuisine) {
      // ---- The first page (or the dinner cuisines) + search ----
      root.innerHTML = `
        ${topBar({ title: dinnerView ? 'Dinner' : 'Recipes', tone: 'dark',
          back: dinnerView ? '#/recipes' : backHref(), backLabel: dinnerView ? '← Recipes' : backLabel(),
          right: `<div class="rb-search"><input data-search class="rb-input" placeholder="Search ${ix.recipes.length} recipes" autocomplete="off" enterkeyhint="search"><button data-clear class="rb-clear" aria-label="Clear search">×</button></div>` })}
        <div data-body class="rb-body"></div>`;
      const body = root.querySelector('[data-body]');
      const mineCount = (ix.cuisines.find((c) => c.id === 'mine') || { count: 0 }).count;
      const card = (r) => recipeCard(r, names[r.c]);

      // The ring of plates: favourites, cooked lately, your own, then every kind of food.
      const ring = (href, name, count, inner, color, spin) => `
        <a href="${href}" class="rb-ring${spin ? ' spin' : ''}">
          <div class="p">${DASH(color)}${inner}</div>
          <div class="n">${esc(name)}</div>${count ? `<div class="c">${count}</div>` : ''}
        </a>`;
      const disc = (bg, glyph) => `<div class="disc" style="background:${bg}">${glyph}</div>`;
      const showHome = () => {
        // Part-way through cooking something: that is the big card. Else tonight's dinner, or today's idea.
        const now = cookingNow();
        const nowR = now && ix.byId[now.id];
        const feat = nowR || (tn && tn.entry) || null;
        const tc = feat ? tableColors(feat.c) : null;
        const featFav = feat && favs.indexOf(feat.id) >= 0;
        const p = pendingAdd();
        const today = dayKey(new Date());
        const canPlanTonight = feat && !nowR && !(tn && tn.planned) && !p && plannedFor(today, 'dinner').length < MAX_PER_MEAL;
        // A few ideas, new every day, from all over the library.
        const dayNo = Math.floor(Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()) / 86400000);
        const pool = ix.recipes.filter((r) => r.c !== 'mine');
        const ideas = [];
        for (let k = 0; k < 12 && ideas.length < 6 && pool.length; k++) {
          const r = pool[(dayNo * 37 + k * 173 + 11) % pool.length];
          if (ideas.indexOf(r) < 0 && (!feat || r.id !== feat.id)) ideas.push(r);
        }
        const favList = favs.map((id) => ix.byId[id]).filter(Boolean);
        const order = byMeal('breakfast').concat(byMeal('lunch'), byMeal('dinner'), byMeal('dessert'));
        cardNow = card;
        shown = null;
        body.innerHTML = `
          ${pendingBar()}
          <div class="rb-rings">
            ${ring('#/recipes/favorites', 'Favorites', favList.length, disc('#B5432A', '♥'), '#E9806A')}
            ${ring('#/recipes/recent', 'Cooked lately', cookedList().length, disc('#3E7C6E', '✓'), '#7CC3B2')}
            ${ring(mineCount ? '#/recipes/mine' : '#/myrecipe', 'My recipes', mineCount, disc('#6A5648', '+'), '#D9C3B0')}
            ${order.map((c) => ring(`#/recipes/${c.id}`, (c.name === 'Easy weeknight' ? 'Weeknight' : c.name.split(' & ')[0]), c.count, plateArt(firstOf(c), 76), tableColors(c.id)[0], feat && feat.c === c.id)).join('')}
          </div>
          <div class="rb-hero">
            ${feat ? `<div class="rb-feat" style="background:radial-gradient(ellipse 520px 420px at 14% 50%,${tc[0]} 0%,${tc[1]} 55%,${tc[2]} 100%)">
              <a href="#/dish/${encodeURIComponent(feat.id)}" class="plate" aria-label="${esc(feat.t)}">${plateArt(feat, 340, { detail: true })}</a>
              <div class="tx">
                <div class="rb-eyebrow">${nowR ? `You’re cooking · step ${now.step}` : tn && tn.planned ? 'Tonight · on the plan' : 'Today’s idea for dinner'}</div>
                <div class="t">${esc(feat.t)}</div>
                <div class="rb-m">${esc([feat.m ? fmtMinutes(feat.m) : '', names[feat.c] || ''].filter(Boolean).join(' · '))}</div>
                <div class="row">
                  ${nowR ? `<a href="#/recipe/${encodeURIComponent(feat.id)}" class="x-btn white">Carry on cooking</a><a href="#/dish/${encodeURIComponent(feat.id)}" class="x-btn frost">The recipe</a>`
                    : `<a href="#/dish/${encodeURIComponent(feat.id)}" class="x-btn white">Open the recipe</a>`}
                  ${canPlanTonight ? `<button data-plantonight="${esc(feat.id)}" class="x-btn frost">+ Tonight</button>` : ''}
                  <button data-featheart="${esc(feat.id)}" class="x-btn round ${featFav ? 'white' : 'frost'}" aria-label="Favorite">${featFav ? '♥' : '♡'}</button>
                </div>
              </div>
            </div>` : ''}
            <div class="rb-own"${feat ? '' : ' style="flex:1"'}>
              ${phoneCode({ tab: 'recipe', size: 104, title: 'Add your own recipe', sub: ' ' })}
              <div class="row">
                <a href="#/myrecipe" class="x-btn sm white">+ Type one in</a>
              </div>
            </div>
          </div>
          ${favList.length ? `<div class="rb-h"><div class="l">Your favorites</div></div>
            <div class="rb-cards">${favList.slice(0, 4).map(card).join('')}</div>` : ''}
          <div class="rb-h"><div class="l">Ideas for today</div></div>
          <div class="rb-cards">${ideas.map(card).join('')}</div>`;
        codes();
      };
      const showGrid = () => {
        if (!dinnerView) { showHome(); return; }
        shown = null;
        body.innerHTML = `${pendingBar()}<div class="rb-tiles">${byMeal('dinner').map((c) => {
          const tc = tableColors(c.id);
          return `<a href="#/recipes/${c.id}" class="rb-tile" style="background:linear-gradient(135deg,${tc[1]},${tc[2]})">
            <div class="n">${esc(c.name)}</div>
            ${plateArt(firstOf(c), 150)}
            <div class="c">${c.count} recipes<br>${esc(c.types.slice(0, 2).map((t) => t.name).join(', '))}</div>
          </a>`;
        }).join('')}</div>`;
      };
      const input = root.querySelector('[data-search]');
      const clearBtn = root.querySelector('[data-clear]');
      // Before typing: the last few searches and some ideas, one tap each.
      const chipRow = (words) => `<div class="rb-filters" style="margin:0">${words.map((w) => `<button class="rb-chip" data-q="${esc(w)}">${esc(w)}</button>`).join('')}</div>`;
      const showSuggestions = () => {
        if (input.value.trim()) return;
        const recent = recentSearches();
        shown = null;
        body.innerHTML = `<div class="rb-suggest">
          ${recent.length ? `<div class="h">Searched lately</div>${chipRow(recent)}` : ''}
          <div class="h">Ideas</div>${chipRow(IDEAS.filter((w) => recent.indexOf(w) < 0))}
        </div>`;
      };
      const runSearch = async (restoring) => {
        const q = input.value.trim();
        clearBtn.style.display = q ? 'block' : 'none';
        const qs = memo().qs || {}; qs[here] = q; setMemo({ qs });
        if (!q) { if (document.activeElement === input) showSuggestions(); else showGrid(); return; }
        const hits = await searchRecipes(q, 120);
        if (!el.isConnected || input.value.trim() !== q) return;
        const words = q.toLowerCase().split(/\s+/).filter(Boolean);
        cardNow = card;
        shown = null;
        body.innerHTML = hits.length
          ? `<div class="rb-found">${hits.partial
            ? `No recipe has all of “${esc(q)}”. These have some of it:`
            : `${hits.length >= 120 ? 'Over 100' : hits.length} recipe${hits.length === 1 ? '' : 's'} found for “${esc(q)}”`}</div>
             <div class="rb-cards">${cards(hits, card, restoring ? `${here}?${q}` : '')}</div><div data-inghits></div>`
          : `<div data-inghits><div class="rb-wait">Looking in the ingredients too…</div></div>`;
        restOfCards(body.querySelector('.rb-cards'));
        if (!restoring) body.scrollTop = 0;
        else { const at = (memo().scroll || {})[`${here}?${q}`]; if (at) body.scrollTop = at; }
        // Not much in the names? Look through what the recipes use ("chicken rice", "spinach feta").
        if (hits.length >= 30 && !hits.partial) return;
        const skip = {};
        if (!hits.partial) hits.forEach((r) => { skip[r.id] = true; });
        let more = [];
        // (30 at most: built in one go, and more than that is a list nobody reads.)
        try { more = await searchIngredients(q, skip, 30); } catch (e) { more = []; }
        const box = el.isConnected && input.value.trim() === q && body.querySelector('[data-inghits]');
        if (!box) return;
        if (more.length) {
          box.innerHTML = `<div class="rb-found" style="margin-top:${hits.length && !hits.partial ? 22 : 0}px">${more.length >= 30 ? 'Recipes' : `${more.length} recipe${more.length === 1 ? '' : 's'}`} that use ${esc(words.join(' and '))}</div>
            <div class="rb-cards">${more.map(card).join('')}</div>`;
          if (hits.partial) {
            // Real ingredient matches beat "some of it" name matches: put them first.
            body.insertBefore(box, body.firstChild);
          }
        } else if (!hits.length) {
          box.innerHTML = `<div class="rb-wait">Nothing found for “${esc(q)}”.
            ${chipRow((words.length > 1 ? words : []).concat(IDEAS.slice(0, 6)).filter((w, n, a) => a.indexOf(w) === n).slice(0, 8))}
            <button data-clear class="x-btn frost">Clear the search</button></div>`;
        } else box.innerHTML = '';
      };
      input.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => runSearch(false), 250);
      });
      // "Search" on the keyboard: put the keyboard away so the results can be seen.
      input.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        rememberSearch(input.value);
        input.blur();
      });
      input.addEventListener('focus', () => { clearTimeout(blurTimer); showSuggestions(); });
      // Wait a moment on blur, so a tap on a suggestion still lands before the first page comes back.
      input.addEventListener('blur', () => {
        clearTimeout(blurTimer);
        blurTimer = setTimeout(() => { if (el.isConnected && !input.value.trim() && document.activeElement !== input) showGrid(); }, 300);
      });
      body.addEventListener('click', (e) => {
        const sug = e.target.closest('[data-q]');
        if (sug) {
          clearTimeout(blurTimer);
          input.value = sug.dataset.q;
          rememberSearch(sug.dataset.q);
          input.blur();
          runSearch(false);
          return;
        }
        // Opening a recipe from the results: the words were worth keeping.
        if (e.target.closest('.rb-open') && input.value.trim()) rememberSearch(input.value);
        // "+ Tonight" on the big card: straight onto today's dinner.
        const pt = e.target.closest('[data-plantonight]');
        if (pt) { addToPlan(dayKey(new Date()), pt.dataset.plantonight, 'dinner'); load(); }
      });
      root.querySelector('.x-top').addEventListener('click', (e) => { if (e.target.closest('[data-clear]')) { input.value = ''; runSearch(false); input.focus(); } });
      body.addEventListener('click', (e) => { if (e.target.closest('[data-clear]')) { input.value = ''; runSearch(false); input.focus(); } });
      // Back from a recipe you found by searching: the search (and the spot in it) is still there.
      keepScroll(body, () => (input.value.trim() ? `${here}?${input.value.trim()}` : null));
      const lastQ = (memo().qs || {})[here];
      if (lastQ) { input.value = lastQ; runSearch(true); } else showGrid();
    } else {
      // ---- One cuisine, optionally one type ----
      const type = cuisine.types.find((t) => t.id === typeId);
      const list = ix.recipes.filter((r) => r.c === cuisine.id && (!type || r.ty === type.id));
      const mine = cuisine.id === 'mine';
      root.innerHTML = `
        ${topBar({ title: type ? `${cuisine.name} · ${type.name}` : cuisine.name, tone: 'dark', back: '#/recipes', backLabel: '← Recipes',
          right: `${list.length > 3 ? '<button data-pick class="x-btn sm glass">Pick one for me</button>' : ''}${mine && list.length ? '<a href="#/myrecipe" class="x-btn sm white">+ Add a recipe</a>' : ''}` })}
        ${cuisine.types.length ? `<div class="rb-types">
          <a href="#/recipes/${cuisine.id}" class="rb-chip${type ? '' : ' on'}">All <span>${cuisine.count}</span></a>
          ${cuisine.types.map((t) => `<a href="#/recipes/${cuisine.id}/${t.id}" class="rb-chip${type && type.id === t.id ? ' on' : ''}">${esc(t.name)} <span>${t.count}</span></a>`).join('')}
        </div>` : ''}
        ${mine ? undoBar() : ''}${pendingBar()}
        <div class="rb-body" data-list></div>`;
      drawList(root.querySelector('[data-list]'), list, (r) => recipeCard(r),
        mine ? `<div class="rb-wait" style="padding-top:20px">No recipes of your own yet.
            <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap;justify-content:center">${phoneCode({ tab: 'recipe', size: 120, sub: ' ' })}<a href="#/myrecipe" class="x-btn white">+ Type one in</a></div></div>`
          : '<div class="rb-wait">Nothing here yet.</div>');
      keepScroll(root.querySelector('[data-list]'));
      // The chosen type is brought into view in its row of chips.
      const onChip = root.querySelector('.rb-types .on');
      if (onChip && onChip.offsetLeft > 900) root.querySelector('.rb-types').scrollLeft = onChip.offsetLeft - 400;
    }
  }).catch((err) => {
    console.error(err);
    const box = el.isConnected && root.querySelector('[data-wait]');
    if (box) box.innerHTML = 'Recipes need the internet the first time. Check the Wi-Fi.<button data-retry class="x-btn white">Try again</button>';
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

  root.addEventListener('click', (e) => { if (e.target.closest('[data-retry]')) load(); });

  // A recipe sent from a phone (or deleted there) shows up without leaving the page, unless
  // somebody is in the middle of a search or of planning a card.
  if (offMine) offMine();
  offMine = onMyRecipesChanged(() => {
    if (!el.isConnected || sheet) return;
    const input = root.querySelector('[data-search]');
    if (input && (input.value.trim() || document.activeElement === input)) return;
    if (!cuisineId || cuisineId === 'mine') load();
  });
  load();
}

export function unmount() {
  clearTimeout(searchTimer);
  clearTimeout(blurTimer);
  if (stopCodes) { stopCodes(); stopCodes = null; }
  if (offMine) { offMine(); offMine = null; }
}
