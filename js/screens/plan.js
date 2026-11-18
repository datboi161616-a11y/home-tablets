// Family · Week plan: breakfast, lunch and dinner for the next 7 days.
import { loadIndex, fmtMinutes, cuisineColor } from '../services/recipe-data.js';
import { weekDays, getPlan, removeFromPlan, onKitchenChanged, weekRecipeIds, MEALS } from '../services/meal-plan.js';
import { esc, kitchenStyles, kitchenTop, fillCounts } from './kitchen-ui.js';
import { ADD_DAY_KEY } from './dish.js';

let off;

export function mount(el) {
  el.innerHTML = `${kitchenStyles()}
  <style>
    .wp-days{flex-grow:1;min-height:0;display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:12px}
    .wp-day{background:#FFFFFF;border-radius:20px;padding:14px 10px 10px;display:flex;flex-direction:column;gap:8px;min-height:0;min-width:0}
    .wp-day.today{box-shadow:inset 0 0 0 3px var(--accent)}
    .wp-dl{font-size:18px;font-weight:600;padding-left:2px}
    .wp-ds{font-size:14px;color:#4A5363;margin-top:-6px;padding-left:2px}
    .wp-meals{display:flex;flex-direction:column;gap:8px;flex-grow:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch}
    .wp-mh{font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#8A93A3;padding:4px 2px 0}
    .wp-meal{border-radius:12px;background:#F4F5F7;padding:8px 4px 2px 10px;display:flex;flex-direction:column;gap:2px;border-left:5px solid #1D2430}
    .wp-meal .t{font-size:15px;font-weight:600;line-height:1.25;padding-right:4px;overflow-wrap:break-word;word-break:normal;hyphens:auto}
    .wp-meal .m{font-size:13px;color:#4A5363;display:flex;align-items:center;justify-content:space-between}
    .wp-x{width:38px;height:36px;border:none;background:transparent;font-size:20px;color:#4A5363;cursor:pointer;margin-right:-2px}
    .wp-add{min-height:40px;border-radius:12px;border:2px dashed #D3D8DE;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;color:#4A5363;flex:none}
    .wp-cook{min-height:36px;border-radius:999px;background:#1D2430;color:#FFFFFF;font-size:13px;font-weight:600;display:flex;align-items:center;justify-content:center;margin:2px 6px 6px 0}
  </style>
  <div class="k-wrap" data-root>${kitchenTop({ title: 'Week plan', active: 'plan' })}<div class="k-empty k-scroll">Loading…</div></div>`;
  const root = el.querySelector('[data-root]');

  // Where "+ Add" goes for each meal.
  function browseFor(ix, meal) {
    const files = ix.cuisines.filter((c) => (c.meal || 'dinner') === meal);
    return files.length === 1 ? `#/recipes/${files[0].id}` : `#/recipes/${meal}`;
  }

  function render(ix) {
    const plan = getPlan();
    const days = weekDays();
    const total = weekRecipeIds().length;
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
                ${ids.map((id) => {
                  const r = ix.byId[id];
                  return `
                  <div class="wp-meal" style="border-left-color:${cuisineColor(r.c)}">
                    <a href="#/dish/${encodeURIComponent(id)}" class="t">${esc(r.t)}</a>
                    <div class="m">${fmtMinutes(r.m)}<button class="wp-x" data-remove="${id}" data-day="${d.key}" data-meal="${meal}" aria-label="Remove">×</button></div>
                    ${n === 0 ? `<a href="#/recipe/${encodeURIComponent(id)}" class="wp-cook">Cook</a>` : ''}
                  </div>`;
                }).join('')}
                ${ids.length < 3 ? `<a href="${browseFor(ix, meal)}" class="wp-add" data-add="${d.key}|${meal}">+ Add</a>` : ''}`;
              }).join('')}
            </div>
          </div>`;
        }).join('')}
      </div>
      ${total ? '' : '<div class="muted" style="font-size:18px;text-align:center">Tap “+ Add” under a meal, pick a recipe, and it lands here. Your shopping list builds itself.</div>'}`;
    fillCounts(root);
  }

  loadIndex().then((ix) => {
    if (!el.isConnected) return;
    render(ix);
    root.addEventListener('click', (e) => {
      const x = e.target.closest('[data-remove]');
      if (x) { e.preventDefault(); removeFromPlan(x.dataset.day, x.dataset.remove, x.dataset.meal); return; }
      const add = e.target.closest('[data-add]');
      if (add) sessionStorage.setItem(ADD_DAY_KEY, add.dataset.add); // the link then opens the recipes
    });
    off = onKitchenChanged(() => { if (el.isConnected) render(ix); });
  }).catch((err) => {
    console.error(err);
    if (el.isConnected) root.querySelector('.k-empty').textContent = 'Recipes need the internet the first time. Check the Wi-Fi.';
  });
}

export function unmount() { if (off) off(); off = null; }
