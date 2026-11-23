// Kitchen · Week plan: breakfast, lunch and dinner for this week and next.
// Tap a meal for its choices (recipe, cook, people, add another, move, remove). Tap a day's
// name to mark a meal "Leftovers" / "Eating out", move or swap the day, or clear it.
// Moving never needs dragging: tap "Move", then tap the day.
import { loadIndex, fmtMinutes, cuisineColor, searchRecipes } from '../services/recipe-data.js';
import {
  getPlan, addToPlan, removeFromPlan, onKitchenChanged, MEALS, dayKey,
  planDays, dayIds, MARKS, markFor, setMark, moveMeal, swapDays, snapshotDays, restoreDays, clearDays, copyDays,
  mealServings, setMealServings, favorites, MAX_MEALS, getListState, setListNextWeek,
  shoppingCount,
} from '../services/meal-plan.js';
import * as KUI from './kitchen-ui.js'; // (its painted plates are used when it has them)
import { esc, topBar } from './ui.js';
import { spot, C } from '../art.js';
import { ADD_DAY_KEY } from './dish.js';

let off, dayTimer, undoTimer, armTimer, searchTimer;

// Empty plate colour for each meal slot nobody has picked yet.
const PLATE = { breakfast: C.cream, lunch: C.mint, dinner: C.peach };
// After these hours today's meal is over and fades back.
const OVER_AT = { breakfast: 11, lunch: 15, dinner: 21 };
// The same evening-teal, cream-paper world as the Shopping list.
const INK = '#23323A';
const CREAM = '#FFF8EE';
const AMBER = '#FFB86B';
const RUST = '#C2652D';
const MIST = '#BFD6DE';
// The dish on its plate, when the kitchen's shared art has painted plates (else nothing).
const plate = (r, size) => (r && typeof KUI.plateArt === 'function' ? KUI.plateArt(r, size) : '');
const WEEK_KEY = 'kitchen.planWeek'; // which week was showing (so coming back from a recipe keeps it)

const DINNER_HOUR = 18; // "Start by" times for long dinners aim for dinner at 6 pm
const timeText = (d) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const mealName = (m) => (MEALS.find((x) => x[0] === m) || [])[1] || '';
const markName = (k) => (MARKS.find((x) => x[0] === k) || [])[1] || '';

// Cooking mode saves each recipe's progress as recipe.v1.<id> (see recipe.js).
function cookingStep(id) {
  try {
    const s = JSON.parse(localStorage.getItem(`recipe.v1.${id}`) || 'null');
    return s && s.step > 0 ? s.step + 1 : 0;
  } catch (e) { return 0; }
}

// Little pictures for the marked meals (flat, 32 x 32).
const MARK_ART = {
  leftovers: `<rect x="6" y="13" width="20" height="13" rx="3" fill="${C.sky}"/><rect x="5" y="9" width="22" height="5" rx="2" fill="${C.blue}"/>`,
  out: `<path d="M9 5v9a3 3 0 0 0 6 0V5M12 5v22" stroke="${C.ink3}" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M22 5q-4 5 0 11v11" stroke="${C.ink3}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`,
  none: `<circle cx="16" cy="16" r="10" fill="none" stroke="${C.cloudDark}" stroke-width="2.4"/><path d="M11 16h10" stroke="${C.cloudDark}" stroke-width="2.4" stroke-linecap="round"/>`,
};
const markIcon = (k, s = 30) => `<svg width="${s}" height="${s}" viewBox="0 0 32 32" aria-hidden="true" focusable="false" style="flex:none">${MARK_ART[k] || ''}</svg>`;

export function mount(el) {
  el.innerHTML = `
  <style>
    .wp{position:absolute;left:0;top:0;width:100%;height:100%;overflow:hidden;color:#FFFFFF;font-family:Inter,system-ui,sans-serif;
      background:radial-gradient(ellipse at 70% 20%,#2E5A6B 0%,#183846 45%,#0E222C 100%)}
    .wp-wrap{position:relative;height:100%;padding:28px 40px 32px;display:flex;flex-direction:column;gap:18px}
    .wp .x-btn.amber{background:${AMBER};color:${INK}}
    .wp .x-btn.soft{background:#F1E4CF;color:${INK}}
    .wp-weeks{display:flex;gap:4px;background:rgba(8,20,26,.55);box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.3);border-radius:999px;padding:4px;flex:none}
    .wp-weeks button{min-height:56px;padding:0 18px;border-radius:999px;border:none;background:transparent;font:600 18px Inter,system-ui,sans-serif;color:#FFFFFF;cursor:pointer}
    .wp-weeks button.on{background:${AMBER};color:${INK}}
    .wp-days{flex-grow:1;min-height:0;display:grid;grid-template-columns:minmax(0,1.5fr) repeat(6,minmax(0,1fr));gap:12px}
    .wp-days.even{grid-template-columns:repeat(7,minmax(0,1fr))}
    .wp-day{background:${CREAM};color:${INK};border-radius:22px;padding:6px 8px 10px;display:flex;flex-direction:column;gap:6px;min-height:0;min-width:0;position:relative}
    .wp-day.today{box-shadow:inset 0 0 0 4px ${AMBER}}
    .wp-dh{display:block;width:100%;text-align:left;border:none;background:transparent;border-radius:14px;padding:8px 6px 6px 6px;cursor:pointer;font-family:Inter,system-ui,sans-serif;color:${INK};min-height:60px}
    .wp-dl{font:500 22px Outfit,system-ui,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .wp-day.today .wp-dl{font-weight:700;font-size:26px;color:${RUST}}
    .wp-ds{font-size:16px;color:#5B6B73;margin-top:2px;white-space:nowrap;overflow:hidden;display:flex;align-items:center;gap:4px}
    .wp-ds .dots{margin-left:auto;font-size:16px;color:#8A979D;letter-spacing:1px;flex:none}
    .wp-meals{display:flex;flex-direction:column;gap:6px;flex-grow:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch}
    .wp-slot{display:flex;flex-direction:column;gap:6px}
    .wp-slot.over{opacity:.5}
    .wp-mh{font-size:15px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:${RUST};padding:4px 4px 0}
    .wp-meal{border-radius:14px;background:#F3E7D3;padding:8px 6px 8px 10px;display:flex;flex-direction:column;gap:2px;border-left:6px solid ${INK};cursor:pointer}
    .wp-meal .hd{display:flex;align-items:center;gap:10px;padding-right:6px}
    .wp-meal .t{font-size:17px;font-weight:600;line-height:1.25;padding-right:4px;overflow-wrap:break-word;word-break:normal;hyphens:auto;min-width:0}
    .wp-day.today .wp-meal .t{font-size:19px}
    .wp-meal .m{font-size:16px;color:#5B6B73;display:flex;align-items:center;justify-content:space-between;gap:4px}
    .wp-meal .by{font-size:16px;font-weight:600;color:${RUST}}
    .wp-meal .pp{font-size:15px;color:#5B6B73;font-weight:600}
    .wp-add{min-height:56px;border-radius:14px;border:2px dashed #D9C8AD;background:transparent;display:flex;align-items:center;justify-content:center;font:600 17px Inter,system-ui,sans-serif;color:#5B6B73;flex:none;cursor:pointer;width:100%}
    .wp-add.empty{flex-direction:column;gap:2px;padding:6px 0 6px}
    .wp-mark{min-height:60px;border-radius:14px;background:#E3ECEC;display:flex;align-items:center;gap:8px;padding:0 10px;font:600 16px Inter,system-ui,sans-serif;color:${INK};border:none;width:100%;text-align:left;cursor:pointer}
    .wp-cook{flex:1;min-width:0;min-height:56px;padding:0 12px;border-radius:999px;background:${INK};color:#FFFFFF;font-size:17px;font-weight:600;
      display:flex;align-items:center;justify-content:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-decoration:none}
    .wp-cook.go{background:${RUST}}
    .wp-days.moving .wp-day{box-shadow:inset 0 0 0 4px #7FB3C4;cursor:pointer}
    .wp-days.moving .wp-day.from{box-shadow:inset 0 0 0 4px ${INK};background:#EBDFCB}
    .wp-toast{position:absolute;left:50%;bottom:26px;transform:translateX(-50%);z-index:40;display:flex;align-items:center;gap:18px;
      background:${INK};color:#FFFFFF;border-radius:999px;padding:8px 8px 8px 28px;font-size:19px;box-shadow:0 10px 24px rgba(0,0,0,.4),inset 0 0 0 2px ${AMBER};max-width:900px;min-height:72px}
    .wp-toast span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
    .wp-toast.plain{padding-right:28px}
    .wp-bg{position:absolute;left:0;top:0;right:0;bottom:0;z-index:50;background:rgba(6,16,21,.62);display:flex;align-items:center;justify-content:center}
    .wp-sheet{background:${CREAM};color:${INK};border-radius:30px;padding:28px 32px;width:720px;max-height:744px;display:flex;flex-direction:column;gap:16px;box-shadow:0 20px 40px rgba(0,0,0,.4)}
    .wp-sheet.wide{width:1040px}
    .wp-sheet .x-btn{font-size:19px;padding:0 20px}
    .wp-sheet .x-btn.line{box-shadow:inset 0 0 0 2px rgba(35,50,58,.3)}
    .wp-sh{font:500 30px/1.2 Outfit,system-ui,sans-serif}
    .wp-ss{font-size:18px;color:#5B6B73;margin-top:-10px}
    .wp-row{display:flex;gap:12px;flex-wrap:wrap;align-items:center}
    .wp-row .x-btn{flex:1 1 0}
    .wp-step{display:flex;align-items:center;gap:14px;font-size:19px}
    .wp-step button{width:64px;height:64px;border-radius:50%;border:2px solid #D9C8AD;background:#FFFFFF;font:600 28px Inter,system-ui,sans-serif;color:${INK};cursor:pointer}
    .wp-step b{min-width:44px;text-align:center;font:700 28px Outfit,system-ui,sans-serif}
    .wp-mrow{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:8px 0;border-top:1px solid #EADFCC}
    .wp-mrow .nm{width:112px;font-size:18px;font-weight:600}
    .wp-chip{min-height:56px;padding:0 16px;border-radius:999px;border:2px solid #D9C8AD;background:#FFFFFF;font:600 17px Inter,system-ui,sans-serif;color:${INK};cursor:pointer;display:inline-flex;align-items:center;gap:6px}
    .wp-chip.on{background:${INK};border-color:${INK};color:#FFFFFF}
    .wp-in{min-height:64px;border-radius:999px;border:2px solid #D9C8AD;background:#FFFFFF;padding:0 26px;font:400 20px Inter,system-ui,sans-serif;color:${INK};outline:none;min-width:0;flex:none}
    .wp-in:focus{border-color:${INK}}
    .wp-pick{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
    .wp-tile{min-height:76px;border-radius:16px;border:none;background:#F3E7D3;text-align:left;padding:8px 12px 8px 10px;font-family:Inter,system-ui,sans-serif;color:${INK};cursor:pointer;
      border-left:6px solid ${INK};display:flex;align-items:center;gap:10px}
    .wp-tile .w{display:flex;flex-direction:column;justify-content:center;gap:2px;min-width:0}
    .wp-tile .t{font-size:17px;font-weight:600;line-height:1.2;overflow:hidden;max-height:41px}
    .wp-tile .s{font-size:15px;color:#5B6B73}
    .wp-ph{font-size:15px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:${RUST};margin-top:6px}
    .wp-hint{font-size:19px;text-align:center;color:${MIST};flex:none}
    .wp-sheet .wp-hint{color:#5B6B73}
    .wp-load{flex-grow:1;display:flex;align-items:center;justify-content:center;font-size:20px;color:${MIST};text-align:center}
  </style>
  <div class="wp" data-root><div class="wp-wrap" data-wrap>${topBar({ title: 'Week plan' })}<div class="wp-load" data-load>Loading…</div></div></div>`;
  const root = el.querySelector('[data-wrap]');
  let shownDay = '';
  let week = 0;
  try { week = sessionStorage.getItem(WEEK_KEY) === '1' ? 1 : 0; } catch (e) { /* private */ }
  let sheet = null; // { type: 'meal'|'day'|'week'|'pick', key, meal, id }
  let moving = null; // { kind: 'meal'|'day', key, meal, id, title }
  let toast = null; // { text, snap?: days to put back on Undo, list?: shopping list choice to put back }
  let armed = ''; // a "clear" button waiting for its second tap
  let ixRef = null;
  let listCount = 0;

  // Where "Browse all recipes" goes for each meal.
  function browseFor(ix, meal) {
    const files = ix.cuisines.filter((c) => (c.meal || 'dinner') === meal);
    return files.length === 1 ? `#/recipes/${files[0].id}` : `#/recipes/${meal}`;
  }
  const mealOfCuisine = (ix) => { const o = {}; ix.cuisines.forEach((c) => { o[c.id] = c.meal || 'dinner'; }); return o; };

  // Long dinners today: when to start so it's ready by 6 pm (only while there's still time).
  function startBy(minutes) {
    if (!minutes || minutes < 90) return '';
    const now = new Date();
    const at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), DINNER_HOUR, 0, 0);
    at.setMinutes(at.getMinutes() - minutes);
    return at > now ? `Start by ${timeText(at)}` : '';
  }
  const allDays = () => planDays(0).concat(planDays(1));
  const dayOf = (key) => allDays().find((d) => d.key === key);
  const dayWords = (key) => { const d = dayOf(key); return d ? (d.n < 2 ? d.label : `${d.label} ${d.sub}`) : 'that day'; };

  function mealCard(ix, plan, id, d, meal) {
    const r = ix.byId[id];
    const own = ((plan[d.key] || {}).serves || {})[`${meal}|${id}`];
    const pp = own ? `<div class="pp">For ${own}</div>` : '';
    const open = `data-open="${d.key}|${meal}|${esc(id)}"`;
    if (d.n !== 0) {
      return `
      <div class="wp-meal" ${open} style="border-left-color:${cuisineColor(r.c)}">
        <div class="t">${esc(r.t)}</div>${pp}
        <div class="m"><span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${fmtMinutes(r.m)}</span></div>
      </div>`;
    }
    // Today: the Cook button carries the time, and says where you got to if you've started.
    const step = cookingStep(id);
    const by = meal === 'dinner' ? startBy(r.m) : '';
    return `
      <div class="wp-meal" ${open} style="border-left-color:${cuisineColor(r.c)}">
        <div class="hd">${plate(r, 56)}<div style="min-width:0"><div class="t">${esc(r.t)}</div>${pp}
        ${by ? `<div class="by">${by}</div>` : ''}</div></div>
        <div class="m">
          <a href="#/recipe/${encodeURIComponent(id)}" class="wp-cook${step ? ' go' : ''}">${step ? `Continue · step ${step}` : `Cook · ${fmtMinutes(r.m)}`}</a>
        </div>
      </div>`;
  }

  function dayColumn(ix, plan, d) {
    const hour = new Date().getHours();
    return `
      <div class="wp-day${d.n === 0 ? ' today' : ''}${moving && moving.key === d.key ? ' from' : ''}" data-daycol="${d.key}">
        <button class="wp-dh" data-dayhead="${d.key}" aria-label="Choices for ${esc(d.label)}">
          <div class="wp-dl">${esc(d.label)}</div>
          <div class="wp-ds"><span>${d.n < 2 ? esc(`${d.short} ${d.sub}`) : esc(d.sub)}</span><span class="dots" aria-hidden="true">•••</span></div>
        </button>
        <div class="wp-meals">
          ${MEALS.map(([meal, name]) => {
            const ids = ((plan[d.key] || {})[meal] || []).filter((id) => ix.byId[id]);
            const mark = !ids.length && markFor(plan, d.key, meal);
            const over = d.n === 0 && hour >= OVER_AT[meal];
            return `<div class="wp-slot${over ? ' over' : ''}">
              <div class="wp-mh">${name}</div>
              ${ids.map((id) => mealCard(ix, plan, id, d, meal)).join('')}
              ${mark ? `<button class="wp-mark" data-dayhead="${d.key}">${markIcon(mark)}<span>${esc(markName(mark))}</span></button>`
                : !ids.length ? `<button class="wp-add empty" data-add="${d.key}|${meal}" aria-label="Add ${esc(name.toLowerCase())}">${spot.plate(PLATE[meal], 40)}</button>` : ''}
            </div>`;
          }).join('')}
        </div>
      </div>`;
  }

  // ---- sheets ----------------------------------------------------------------
  function mealSheet(ix, plan) {
    const { key, meal, id } = sheet;
    const r = ix.byId[id];
    if (!r || ((plan[key] || {})[meal] || []).indexOf(id) < 0) { sheet = null; return ''; }
    const n = mealServings(plan, key, meal, id, r);
    return `
      <div style="display:flex;align-items:center;gap:18px">${plate(r, 104)}<div style="min-width:0;display:flex;flex-direction:column;gap:16px">
        <div class="wp-sh">${esc(r.t)}</div>
        <div class="wp-ss">${esc(dayWords(key))} · ${esc(mealName(meal).toLowerCase())} · ${fmtMinutes(r.m)}</div></div></div>
      <div class="wp-row">
        <a href="#/dish/${encodeURIComponent(id)}" class="x-btn line">See the recipe</a>
        <a href="#/recipe/${encodeURIComponent(id)}" class="x-btn ink">Start cooking</a>
      </div>
      ${n ? `<div class="wp-step"><span style="flex:1">People</span>
        <button data-serves="-1" aria-label="Fewer people">−</button><b>${n}</b><button data-serves="1" aria-label="More people">+</button></div>` : ''}
      <div class="wp-row">
        ${((plan[key] || {})[meal] || []).length < MAX_MEALS ? `<button class="x-btn line" data-addmore>Add another</button>` : ''}
        <button class="x-btn line" data-movemeal>Move</button>
        <button class="x-btn line" data-removesheet>Remove</button>
      </div>
      <button class="x-btn soft" data-close>Close</button>`;
  }

  function daySheet(ix, plan) {
    const d = dayOf(sheet.key);
    if (!d) { sheet = null; return ''; }
    const has = dayIds(plan, d.key).length || (plan[d.key] || {}).mark;
    return `
      <div class="wp-sh">${esc(d.n < 2 ? `${d.label}, ${d.date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}` : d.date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }))}</div>
      <div>
        ${MEALS.map(([meal, name]) => {
          const ids = ((plan[d.key] || {})[meal] || []).filter((id) => ix.byId[id]);
          const mark = markFor(plan, d.key, meal);
          return `<div class="wp-mrow"><div class="nm">${name}</div>
            ${ids.length ? `<div style="font-size:17px;color:#5B6B73;flex:1;min-width:0">${esc(ids.map((id) => ix.byId[id].t).join(', '))}</div>`
              : MARKS.map(([k, label]) => `<button class="wp-chip${mark === k ? ' on' : ''}" data-mark="${k}" data-meal="${meal}">${markIcon(k, 24)}${esc(label)}</button>`).join('')}
          </div>`;
        }).join('')}
      </div>
      ${has ? `<div class="wp-row">
        <button class="x-btn line" data-moveday>Move or swap</button>
        <button class="x-btn ${armed === `day:${d.key}` ? 'amber' : 'line'}" data-clearday>${armed === `day:${d.key}` ? 'Tap again to clear' : 'Clear day'}</button>
      </div>` : ''}
      <button class="x-btn soft" data-close>Done</button>`;
  }

  function weekSheet() {
    const keys = planDays(week).map((d) => d.key);
    const plan = getPlan();
    const has = keys.some((k) => plan[k]);
    const thisHas = planDays(0).some((d) => dayIds(plan, d.key).length);
    const next = !!getListState().next;
    const which = week ? 'next week' : 'this week';
    return `
      <div class="wp-sh">${week ? 'Next week' : 'This week'}</div>
      ${thisHas ? `<button class="x-btn line" data-copyweek>${week ? 'Copy this week here' : 'Repeat next week'}</button>` : ''}
      <div class="wp-mrow" style="border-top:none"><div class="nm" style="width:auto;margin-right:8px">Shopping list for</div>
        <button class="wp-chip${next ? '' : ' on'}" data-listnext="0">This week</button>
        <button class="wp-chip${next ? ' on' : ''}" data-listnext="1">This week and next</button></div>
      ${has ? `<button class="x-btn ${armed === 'week' ? 'amber' : 'line'}" data-clearweek>${armed === 'week' ? `Tap again to clear ${which}` : `Clear ${which}`}</button>` : ''}
      <button class="x-btn soft" data-close>Done</button>`;
  }

  const tile = (ix, id) => {
    const r = ix.byId[id];
    return r ? `<button class="wp-tile" data-pickid="${esc(id)}" style="border-left-color:${cuisineColor(r.c)}">${plate(r, 56)}<span class="w"><span class="t">${esc(r.t)}</span><span class="s">${fmtMinutes(r.m)}</span></span></button>` : '';
  };
  function pickLists(ix, meal, key) {
    const mc = mealOfCuisine(ix);
    // (A recipe from the web says its own meal: breakfast, lunch, else dinner.)
    const webMeal = (r) => (r.ty === 'breakfast' || r.ty === 'lunch' ? r.ty : 'dinner');
    const fits = (id) => ix.byId[id] && (mc[ix.byId[id].c] === meal || (ix.byId[id].c === 'mine' && (ix.byId[id].ty || 'dinner') === meal)
      || (ix.byId[id].c === 'web' && webMeal(ix.byId[id]) === meal));
    const taken = ((getPlan()[key] || {})[meal]) || [];
    const fresh = (id) => taken.indexOf(id) < 0;
    const fav = favorites().filter((id) => fits(id) && fresh(id)).slice(0, 9);
    // Planned lately: anything on the plan for this meal (newest days first), not already a favourite.
    const plan = getPlan();
    const lately = [];
    Object.keys(plan).sort().reverse().forEach((k) => (plan[k][meal] || []).forEach((id) => {
      if (fresh(id) && fav.indexOf(id) < 0 && lately.indexOf(id) < 0 && ix.byId[id]) lately.push(id);
    }));
    // A few ideas that change by day.
    const pool = ix.recipes.filter((r) => mc[r.c] === meal && fresh(r.id) && fav.indexOf(r.id) < 0 && lately.indexOf(r.id) < 0);
    const seed = Number(key.replace(/-/g, '')) % 997;
    const ideas = [];
    for (let i = 0; i < pool.length && ideas.length < 6; i++) {
      const r = pool[(seed * 31 + i * (pool.length % 101 ? 101 : 103)) % pool.length]; // a prime stride spreads the picks
      if (ideas.indexOf(r.id) < 0) ideas.push(r.id);
    }
    return { fav, lately: lately.slice(0, 6), ideas };
  }
  function pickSheet(ix) {
    const { key, meal } = sheet;
    const d = dayOf(key);
    const l = pickLists(ix, meal, key);
    const part = (title, ids) => (ids.length ? `<div class="wp-ph">${title}</div><div class="wp-pick">${ids.map((id) => tile(ix, id)).join('')}</div>` : '');
    return `
      <div style="display:flex;align-items:center;gap:16px">
        <div style="flex:1;min-width:0"><div class="wp-sh">${esc(mealName(meal))} for ${esc(d ? (d.n < 2 ? d.label : `${d.label} ${d.sub}`) : '')}</div></div>
        ${week === 0 ? `<a href="${browseFor(ix, meal)}" class="x-btn amber" data-browse>All recipes</a>` : ''}
        <button class="x-btn soft" data-close>Close</button>
      </div>
      <input data-picksearch class="wp-in" maxlength="40" placeholder="Search: chicken, soup, pasta…" autocomplete="off" aria-label="Search the recipes">
      <div data-pickbody class="x-scroll" style="display:flex;flex-direction:column;gap:8px;min-height:200px;flex-grow:1">
        ${part('Your favourites', l.fav)}${part('Planned lately', l.lately)}${part('Ideas', l.ideas)}
        ${!l.fav.length && !l.lately.length && !l.ideas.length ? '<div class="wp-hint">No ideas yet.</div>' : ''}
      </div>`;
  }

  function sheetHtml(ix, plan) {
    if (!sheet) return '';
    const inner = sheet.type === 'meal' ? mealSheet(ix, plan) : sheet.type === 'day' ? daySheet(ix, plan)
      : sheet.type === 'week' ? weekSheet() : pickSheet(ix);
    return sheet ? `<div class="wp-bg" data-bg><div class="wp-sheet${sheet.type === 'pick' ? ' wide' : ''}" role="dialog">${inner}</div></div>` : '';
  }

  function render(ix) {
    const plan = getPlan();
    const days = planDays(week);
    const sameDay = shownDay === planDays(0)[0].key;
    shownDay = planDays(0)[0].key;
    const scrolls = [].map.call(root.querySelectorAll('.wp-meals'), (m) => m.scrollTop); // keep each day's place
    const what = moving && (moving.kind === 'meal' ? moving.title : `${dayWords(moving.key)}’s meals`);
    root.innerHTML = `
      ${topBar({
        title: 'Week plan',
        right: `<div class="wp-weeks"><button data-week="0" class="${week ? '' : 'on'}" aria-pressed="${week ? 'false' : 'true'}">This week</button><button data-week="1" class="${week ? 'on' : ''}" aria-pressed="${week ? 'true' : 'false'}">Next week</button></div>
          <button class="x-btn frost sm" data-weeksheet>Week •••</button>
          <a href="#/shopping" class="x-btn glass sm">Shopping list<span data-listcount class="x-badge" style="display:none">${listCount || ''}</span></a>`,
      })}
      <div class="wp-days${week ? ' even' : ''}${moving ? ' moving' : ''}">
        ${days.map((d) => dayColumn(ix, plan, d)).join('')}
      </div>
      ${moving ? `<div class="wp-toast"><span>Move ${esc(what)} to…</span><button class="x-btn white sm" data-cancelmove>Cancel</button></div>`
        : toast ? `<div class="wp-toast${toast.snap || toast.list != null ? '' : ' plain'}"><span>${esc(toast.text)}</span>${toast.snap || toast.list != null ? '<button class="x-btn white sm" data-undo>Undo</button>' : ''}</div>`
          : ''}
      ${sheetHtml(ix, plan)}`;
    if (sameDay) root.querySelectorAll('.wp-meals').forEach((m, i) => { m.scrollTop = scrolls[i] || 0; });
    fillCount();
  }
  // The number on the "Shopping list" button: things still to buy.
  function fillCount() {
    const show = () => { const b = root.querySelector('[data-listcount]'); if (b) { b.textContent = listCount || ''; b.style.display = listCount ? '' : 'none'; } };
    show();
    shoppingCount().then((n) => { listCount = n; if (el.isConnected) show(); }).catch(() => { /* offline: keep the last number */ });
  }

  function say(text, extra = {}) {
    toast = Object.assign({ text }, extra);
    clearTimeout(undoTimer);
    undoTimer = setTimeout(() => { toast = null; if (el.isConnected && ixRef) render(ixRef); }, extra.snap || extra.list != null ? 8000 : 5000);
  }
  function arm(what) {
    armed = what;
    clearTimeout(armTimer);
    armTimer = setTimeout(() => { armed = ''; if (el.isConnected && ixRef) render(ixRef); }, 4000);
  }
  const setWeek = (w) => { week = w; try { sessionStorage.setItem(WEEK_KEY, String(w)); } catch (e) { /* private */ } };

  // Search in the recipe picker: only the results area changes, so the keyboard stays up.
  function pickSearch(ix, text) {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
      const body = root.querySelector('[data-pickbody]');
      if (!body) return;
      if (!text.trim()) { render(ix); const i = root.querySelector('[data-picksearch]'); if (i) i.focus(); return; }
      const hits = await searchRecipes(text, 15).catch(() => []);
      if (!el.isConnected || !root.querySelector('[data-pickbody]')) return;
      root.querySelector('[data-pickbody]').innerHTML = hits.length
        ? `<div class="wp-pick">${hits.map((r) => tile(ix, r.id)).join('')}</div>`
        : `<div class="wp-hint">No recipe called “${esc(text.trim())}”.</div>`;
    }, 250);
  }

  function onClick(ix, e) {
    const t = (sel) => e.target.closest(sel);
    let x;
    // Moving: the next tap on a day decides where.
    if (moving) {
      if (t('[data-cancelmove]')) { moving = null; render(ix); return; }
      if ((x = t('[data-week]'))) { setWeek(Number(x.dataset.week)); render(ix); return; }
      const col = t('[data-daycol]');
      if (!col) return;
      e.preventDefault();
      const to = col.dataset.daycol;
      const m = moving;
      moving = null;
      if (to === m.key) { render(ix); return; }
      const snap = snapshotDays([m.key, to]);
      if (m.kind === 'day') {
        swapDays(m.key, to);
        say(`${dayWords(m.key)} and ${dayWords(to)} swapped`, { snap });
      } else {
        const res = moveMeal(m.key, m.meal, m.id, to, m.meal);
        if (res === 'moved') say(`Moved ${m.title} to ${dayWords(to)}`, { snap });
        else if (res === 'full') say(`${dayWords(to)} already has ${MAX_MEALS} ${mealName(m.meal).toLowerCase()} recipes`);
        else if (res === 'there') say(`${m.title} is already on ${dayWords(to)}`);
      }
      render(ix);
      return;
    }
    if ((x = t('[data-undo]'))) {
      const u = toast;
      toast = null;
      clearTimeout(undoTimer);
      if (u && u.snap) restoreDays(u.snap);
      else if (u && u.list != null) setListNextWeek(u.list);
      else render(ix);
      return;
    }
    if ((x = t('[data-week]'))) { setWeek(Number(x.dataset.week)); sheet = null; render(ix); return; }
    if (t('[data-weeksheet]')) { sheet = { type: 'week' }; armed = ''; render(ix); return; }
    // Inside a sheet
    if (sheet) {
      if (t('[data-close]') || (e.target.matches && e.target.matches('[data-bg]'))) { sheet = null; armed = ''; render(ix); return; }
      if ((x = t('[data-pickid]'))) {
        const { key, meal } = sheet;
        const id = x.dataset.pickid;
        sheet = null;
        say(`Added ${(ix.byId[id] || {}).t || 'it'} to ${dayWords(key)} ${mealName(meal).toLowerCase()}`, { snap: snapshotDays([key]) });
        addToPlan(key, id, meal);
        return;
      }
      if (t('[data-browse]')) { sessionStorage.setItem(ADD_DAY_KEY, `${sheet.key}|${sheet.meal}`); sheet = null; return; } // the link opens the recipes
      if ((x = t('[data-serves]'))) {
        const plan = getPlan();
        const n = mealServings(plan, sheet.key, sheet.meal, sheet.id, ix.byId[sheet.id]);
        setMealServings(sheet.key, sheet.meal, sheet.id, n + Number(x.dataset.serves));
        return;
      }
      if (t('[data-addmore]')) { sheet = { type: 'pick', key: sheet.key, meal: sheet.meal }; render(ix); return; }
      if (t('[data-movemeal]')) {
        moving = { kind: 'meal', key: sheet.key, meal: sheet.meal, id: sheet.id, title: (ix.byId[sheet.id] || {}).t || 'that meal' };
        sheet = null;
        render(ix);
        return;
      }
      if (t('[data-removesheet]')) {
        const { key, meal, id } = sheet;
        sheet = null;
        say(`Took ${(ix.byId[id] || {}).t || 'that meal'} off ${dayWords(key)} ${mealName(meal).toLowerCase()}`, { snap: snapshotDays([key]) });
        removeFromPlan(key, id, meal);
        return;
      }
      if ((x = t('[data-mark]'))) {
        const on = markFor(getPlan(), sheet.key, x.dataset.meal) === x.dataset.mark;
        setMark(sheet.key, x.dataset.meal, on ? null : x.dataset.mark);
        return;
      }
      if (t('[data-moveday]')) { moving = { kind: 'day', key: sheet.key }; sheet = null; render(ix); return; }
      if (t('[data-clearday]')) {
        const key = sheet.key;
        if (armed !== `day:${key}`) { arm(`day:${key}`); render(ix); return; }
        armed = '';
        sheet = null;
        say(`Cleared ${dayWords(key)}`, { snap: snapshotDays([key]) });
        clearDays([key]);
        return;
      }
      if (t('[data-clearweek]')) {
        if (armed !== 'week') { arm('week'); render(ix); return; }
        armed = '';
        sheet = null;
        const keys = planDays(week).map((d) => d.key);
        say(`Cleared ${week ? 'next week' : 'this week'}`, { snap: snapshotDays(keys) });
        clearDays(keys);
        return;
      }
      if (t('[data-copyweek]')) {
        const to = planDays(1).map((d) => d.key);
        const snap = snapshotDays(to);
        sheet = null;
        setWeek(1);
        const n = copyDays(planDays(0).map((d) => d.key), to);
        if (n) say(`Copied ${n} meal${n > 1 ? 's' : ''} into next week`, { snap });
        else say('Next week already has those meals filled in');
        render(ix);
        return;
      }
      if ((x = t('[data-listnext]'))) {
        const on = x.dataset.listnext === '1';
        const was = !!getListState().next;
        if (on === was) return;
        sheet = null;
        say(on ? 'Next week’s meals are on the shopping list too' : 'The shopping list is back to this week only', { list: was });
        setListNextWeek(on);
        return;
      }
      return;
    }
    if ((x = t('[data-add]'))) { sheet = { type: 'pick', key: x.dataset.add.split('|')[0], meal: x.dataset.add.split('|')[1] }; render(ix); return; }
    if ((x = t('[data-dayhead]'))) { sheet = { type: 'day', key: x.dataset.dayhead }; armed = ''; render(ix); return; }
    if (t('a,button')) return; // Cook and the other links do their own thing
    if ((x = t('[data-open]'))) {
      const [key, meal, id] = x.dataset.open.split('|');
      sheet = { type: 'meal', key, meal, id };
      render(ix);
    }
  }

  loadIndex().then((ix) => {
    if (!el.isConnected) return;
    ixRef = ix;
    render(ix);
    root.addEventListener('click', (e) => onClick(ix, e));
    root.addEventListener('input', (e) => { if (e.target.matches('[data-picksearch]')) pickSearch(ix, e.target.value); });
    root.addEventListener('submit', (e) => e.preventDefault());
    off = onKitchenChanged(() => {
      if (!el.isConnected) return;
      if (sheet && sheet.type === 'pick') return; // don't wipe what's being typed; it redraws on close
      render(ix);
    });
    // Left open overnight: move on to the new day. Also keeps "Start by" times current.
    dayTimer = setInterval(() => {
      if (!el.isConnected || sheet || moving) return;
      if (dayKey(new Date()) !== shownDay || new Date().getMinutes() % 5 === 0) render(ix);
    }, 60 * 1000);
  }).catch((err) => {
    console.error(err);
    if (el.isConnected) root.querySelector('[data-load]').textContent = 'Recipes need the internet the first time. Check the Wi-Fi.';
  });
}

export function unmount() {
  if (off) off();
  off = null;
  clearInterval(dayTimer);
  dayTimer = null;
  clearTimeout(undoTimer);
  undoTimer = null;
  clearTimeout(armTimer);
  armTimer = null;
  clearTimeout(searchTimer);
  searchTimer = null;
}
