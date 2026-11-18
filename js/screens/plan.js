// Family · Week plan: breakfast, lunch and dinner for the next 7 days.
import { loadIndex, fmtMinutes, cuisineColor } from '../services/recipe-data.js';
import {
  weekDays, getPlan, addToPlan, removeFromPlan, onKitchenChanged, weekRecipeIds, MEALS, dayKey,
} from '../services/meal-plan.js';
import { esc, kitchenStyles, kitchenTop, fillCounts, mealArt, cropFood } from './kitchen-ui.js';
import { spot, C } from '../art.js';
import { ADD_DAY_KEY } from './dish.js';

let off, dayTimer, undoTimer;

// Empty plate colour for each meal slot nobody has picked yet.
const PLATE = { breakfast: C.cream, lunch: C.mint, dinner: C.peach };

const DINNER_HOUR = 18; // "Start by" times for long dinners aim for dinner at 6 pm
const timeText = (d) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

// Cooking mode saves each recipe's progress as recipe.v1.<id> (see recipe.js).
function cookingStep(id) {
  try {
    const s = JSON.parse(localStorage.getItem(`recipe.v1.${id}`) || 'null');
    return s && s.step > 0 ? s.step + 1 : 0;
  } catch (e) { return 0; }
}

export function mount(el) {
  el.innerHTML = `${kitchenStyles()}
  <style>
    .wp-days{flex-grow:1;min-height:0;display:grid;grid-template-columns:minmax(0,1.45fr) repeat(6,minmax(0,1fr));gap:12px}
    .wp-day{background:#FFFFFF;border-radius:20px;padding:14px 10px 10px;display:flex;flex-direction:column;gap:8px;min-height:0;min-width:0}
    .wp-day.today{box-shadow:inset 0 0 0 3px var(--accent)}
    .wp-dl{font-size:18px;font-weight:600;padding-left:2px}
    .wp-ds{font-size:14px;color:#4A5363;margin-top:-6px;padding-left:2px}
    .wp-meals{display:flex;flex-direction:column;gap:8px;flex-grow:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch}
    .wp-mh{font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#8A93A3;padding:4px 2px 0}
    .wp-meal{border-radius:12px;background:#F4F5F7;padding:8px 2px 0 10px;display:flex;flex-direction:column;gap:2px;border-left:5px solid #1D2430}
    .wp-meal .t{font-size:15px;font-weight:600;line-height:1.25;padding-right:4px;overflow-wrap:break-word;word-break:normal;hyphens:auto}
    .wp-meal .m{font-size:13px;color:#4A5363;display:flex;align-items:center;justify-content:space-between;gap:4px}
    .wp-meal .by{font-size:13px;font-weight:600;color:var(--accent)}
    .wp-x{width:44px;height:44px;flex:none;border:none;background:transparent;font-size:22px;color:#4A5363;cursor:pointer}
    .wp-add{min-height:44px;border-radius:12px;border:2px dashed #D3D8DE;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;color:#4A5363;flex:none}
    .wp-add.empty{flex-direction:column;gap:2px;padding:8px 0 6px}
    .wp-cook{flex:1;min-width:0;min-height:40px;padding:0 12px;border-radius:999px;background:#1D2430;color:#FFFFFF;font-size:13px;font-weight:600;
      display:flex;align-items:center;justify-content:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .wp-cook.go{background:var(--accent)}
    .wp-undo{position:absolute;left:50%;bottom:28px;transform:translateX(-50%);z-index:40;display:flex;align-items:center;gap:18px;
      background:#1D2430;color:#FFFFFF;border-radius:999px;padding:8px 8px 8px 26px;font-size:17px;box-shadow:0 6px 20px rgba(0,0,0,.18);max-width:760px}
    .wp-undo span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
    .wp-undo button{min-height:48px;padding:0 24px;border-radius:999px;border:none;background:#FFFFFF;color:#1D2430;font:600 17px Inter,sans-serif;cursor:pointer;flex:none}
  </style>
  <div class="k-wrap" data-root style="position:relative">${kitchenTop({ title: 'Week plan', active: 'plan' })}<div class="k-empty k-scroll">Loading…</div></div>`;
  const root = el.querySelector('[data-root]');
  let shownDay = '';
  let undo = null; // { key, id, meal, title, when }: the meal just taken off

  // Where "+ Add" goes for each meal.
  function browseFor(ix, meal) {
    const files = ix.cuisines.filter((c) => (c.meal || 'dinner') === meal);
    return files.length === 1 ? `#/recipes/${files[0].id}` : `#/recipes/${meal}`;
  }

  // Long dinners today: when to start so it's ready by 6 pm (only while there's still time).
  function startBy(minutes) {
    if (!minutes || minutes < 90) return '';
    const now = new Date();
    const at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), DINNER_HOUR, 0, 0);
    at.setMinutes(at.getMinutes() - minutes);
    return at > now ? `Start by ${timeText(at)}` : '';
  }

  function mealCard(ix, id, d, n, meal) {
    const r = ix.byId[id];
    const rm = `<button class="wp-x" data-remove="${esc(id)}" data-day="${d.key}" data-meal="${meal}" aria-label="Remove ${esc(r.t)}">×</button>`;
    if (n !== 0) {
      return `
      <div class="wp-meal" style="border-left-color:${cuisineColor(r.c)}">
        <a href="#/dish/${encodeURIComponent(id)}" class="t">${esc(r.t)}</a>
        <div class="m"><span style="white-space:nowrap">${fmtMinutes(r.m)}</span>${cropFood(mealArt(meal, `${r.c} ${r.ty || ''} ${r.t}`, 'width:34px;height:26px;flex:none;margin:0 auto 0 4px'))}${rm}</div>
      </div>`;
    }
    // Today: the Cook button carries the time, and says where you got to if you've started.
    const step = cookingStep(id);
    const by = meal === 'dinner' ? startBy(r.m) : '';
    return `
      <div class="wp-meal" style="border-left-color:${cuisineColor(r.c)};padding-bottom:2px">
        <a href="#/dish/${encodeURIComponent(id)}" class="t">${esc(r.t)}</a>
        ${by ? `<div class="by">${by}</div>` : ''}
        <div class="m">
          <a href="#/recipe/${encodeURIComponent(id)}" class="wp-cook${step ? ' go' : ''}">${step ? `Continue · step ${step}` : `Cook · ${fmtMinutes(r.m)}`}</a>${rm}
        </div>
      </div>`;
  }

  function render(ix) {
    const plan = getPlan();
    const days = weekDays();
    const sameDay = shownDay === days[0].key;
    shownDay = days[0].key;
    const total = weekRecipeIds().length;
    const scrolls = [].map.call(root.querySelectorAll('.wp-meals'), (m) => m.scrollTop); // keep each day's place
    root.innerHTML = `
      ${kitchenTop({ title: 'Week plan', active: 'plan', extra: total ? `<a href="#/shopping" class="k-btn solid">Shopping list →</a>` : '' })}
      <div class="wp-days">
        ${days.map((d, n) => {
          const day = plan[d.key] || {};
          return `
          <div class="wp-day${n === 0 ? ' today' : ''}">
            <div class="wp-dl">${esc(d.label)}</div>
            <div class="wp-ds">${n < 2 ? esc(`${d.short} ${d.sub}`) : esc(d.sub)}</div>
            <div class="wp-meals">
              ${MEALS.map(([meal, name]) => {
                const ids = (day[meal] || []).filter((id) => ix.byId[id]);
                return `
                <div class="wp-mh">${name}</div>
                ${ids.map((id) => mealCard(ix, id, d, n, meal)).join('')}
                ${!ids.length ? `<a href="${browseFor(ix, meal)}" class="wp-add empty" data-add="${d.key}|${meal}">${spot.plate(PLATE[meal], 44)}<span>+ Add</span></a>`
                  : ids.length < 3 ? `<a href="${browseFor(ix, meal)}" class="wp-add" data-add="${d.key}|${meal}">+ Add</a>` : ''}`;
              }).join('')}
            </div>
          </div>`;
        }).join('')}
      </div>
      ${total ? '' : '<div class="muted" style="font-size:18px;text-align:center">Tap “+ Add” under a meal, pick a recipe, and it lands here. Your shopping list builds itself.</div>'}
      ${undo ? `<div class="wp-undo"><span>Took ${esc(undo.title)} off ${esc(undo.when)}</span><button data-undo>Undo</button></div>` : ''}`;
    if (sameDay) root.querySelectorAll('.wp-meals').forEach((m, i) => { m.scrollTop = scrolls[i] || 0; });
    fillCounts(root);
  }

  loadIndex().then((ix) => {
    if (!el.isConnected) return;
    render(ix);
    root.addEventListener('click', (e) => {
      const x = e.target.closest('[data-remove]');
      if (x) {
        e.preventDefault();
        const d = weekDays().find((w) => w.key === x.dataset.day);
        const mealName = (MEALS.find((m) => m[0] === x.dataset.meal) || [])[1] || '';
        undo = {
          key: x.dataset.day, id: x.dataset.remove, meal: x.dataset.meal,
          title: (ix.byId[x.dataset.remove] || {}).t || 'that meal',
          when: `${d ? d.label : ''} ${mealName.toLowerCase()}`.trim(),
        };
        clearTimeout(undoTimer);
        undoTimer = setTimeout(() => { undo = null; if (el.isConnected) render(ix); }, 8000);
        removeFromPlan(x.dataset.day, x.dataset.remove, x.dataset.meal); // redraws via kitchen-changed
        return;
      }
      if (e.target.closest('[data-undo]')) {
        const u = undo;
        undo = null;
        clearTimeout(undoTimer);
        if (u) addToPlan(u.key, u.id, u.meal); else render(ix);
        return;
      }
      const add = e.target.closest('[data-add]');
      if (add) sessionStorage.setItem(ADD_DAY_KEY, add.dataset.add); // the link then opens the recipes
    });
    off = onKitchenChanged(() => { if (el.isConnected) render(ix); });
    // Left open overnight: move on to the new day. Also keeps "Start by" times current.
    dayTimer = setInterval(() => {
      if (!el.isConnected) return;
      if (dayKey(new Date()) !== shownDay || new Date().getMinutes() % 5 === 0) render(ix);
    }, 60 * 1000);
  }).catch((err) => {
    console.error(err);
    if (el.isConnected) root.querySelector('.k-empty').textContent = 'Recipes need the internet the first time. Check the Wi-Fi.';
  });
}

export function unmount() {
  if (off) off();
  off = null;
  clearInterval(dayTimer);
  dayTimer = null;
  clearTimeout(undoTimer);
  undoTimer = null;
}
