// Family · Week plan: what's for dinner the next 7 days.
import { loadIndex, fmtMinutes, cuisineColor } from '../services/recipe-data.js';
import { weekDays, getPlan, removeFromPlan, onKitchenChanged, weekRecipeIds } from '../services/meal-plan.js';
import { esc, kitchenStyles, kitchenTop, fillCounts } from './kitchen-ui.js';
import { ADD_DAY_KEY } from './dish.js';

let off;

export function mount(el) {
  el.innerHTML = `${kitchenStyles()}
  <style>
    .wp-days{flex-grow:1;min-height:0;display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:14px}
    .wp-day{background:#FFFFFF;border-radius:20px;padding:16px 10px;display:flex;flex-direction:column;gap:10px;min-height:0;min-width:0}
    .wp-day.today{box-shadow:inset 0 0 0 3px var(--accent)}
    .wp-dl{font-size:18px;font-weight:600}
    .wp-ds{font-size:14px;color:#4A5363;margin-top:-6px}
    .wp-meal{border-radius:14px;background:#F4F5F7;padding:10px 6px 4px 12px;display:flex;flex-direction:column;gap:6px;border-left:6px solid #1D2430}
    .wp-meal .t{font-size:16px;font-weight:600;line-height:1.25;padding-right:4px;overflow-wrap:break-word;word-break:normal;hyphens:auto}
    .wp-meal .m{font-size:14px;color:#4A5363;display:flex;align-items:center;justify-content:space-between}
    .wp-x{width:40px;height:40px;margin-right:-4px;border:none;background:transparent;font-size:22px;color:#4A5363;cursor:pointer}
    .wp-add{min-height:52px;border-radius:14px;border:2px dashed #C9CFD6;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:600;color:#4A5363}
    .wp-cook{min-height:40px;border-radius:999px;background:#1D2430;color:#FFFFFF;font-size:14px;font-weight:600;display:flex;align-items:center;justify-content:center}
  </style>
  <div class="k-wrap" data-root>${kitchenTop({ title: 'Week plan', active: 'plan' })}<div class="k-empty k-scroll">Loading…</div></div>`;
  const root = el.querySelector('[data-root]');

  function render(ix) {
    const plan = getPlan();
    const days = weekDays();
    const total = weekRecipeIds().length;
    root.innerHTML = `
      ${kitchenTop({ title: 'Week plan', active: 'plan', extra: total ? `<a href="#/shopping" class="k-btn solid">Shopping list →</a>` : '' })}
      <div class="wp-days">
        ${days.map((d, n) => {
          const ids = (plan[d.key] || []).filter((id) => ix.byId[id]);
          return `
          <div class="wp-day${n === 0 ? ' today' : ''}">
            <div class="wp-dl">${esc(d.label)}</div>
            <div class="wp-ds">${n < 2 ? esc(`${d.short} ${d.sub}`) : esc(d.sub)}</div>
            <div class="k-scroll" style="display:flex;flex-direction:column;gap:10px">
              ${ids.map((id) => {
                const r = ix.byId[id];
                return `
                <div class="wp-meal" style="border-left-color:${cuisineColor(r.c)}">
                  <a href="#/dish/${encodeURIComponent(id)}" class="t">${esc(r.t)}</a>
                  <div class="m">${fmtMinutes(r.m)}<button class="wp-x" data-remove="${id}" data-day="${d.key}" aria-label="Remove">×</button></div>
                  ${n === 0 ? `<a href="#/recipe/${encodeURIComponent(id)}" class="wp-cook" style="margin-bottom:6px">Cook</a>` : ''}
                </div>`;
              }).join('')}
              ${ids.length < 4 ? `<a href="#/recipes" class="wp-add" data-add="${d.key}">+ Add</a>` : ''}
            </div>
          </div>`;
        }).join('')}
      </div>
      ${total ? '' : '<div class="muted" style="font-size:18px;text-align:center">Tap “+ Add” on a day, pick a recipe, and it lands here. Your shopping list builds itself.</div>'}`;
    fillCounts(root);
  }

  loadIndex().then((ix) => {
    if (!el.isConnected) return;
    render(ix);
    root.addEventListener('click', (e) => {
      const x = e.target.closest('[data-remove]');
      if (x) { e.preventDefault(); removeFromPlan(x.dataset.day, x.dataset.remove); return; }
      const add = e.target.closest('[data-add]');
      if (add) sessionStorage.setItem(ADD_DAY_KEY, add.dataset.add); // the link then opens Recipes
    });
    off = onKitchenChanged(() => { if (el.isConnected) render(ix); });
  }).catch((err) => {
    console.error(err);
    if (el.isConnected) root.querySelector('.k-empty').textContent = 'Recipes need the internet the first time. Check the Wi-Fi.';
  });
}

export function unmount() { if (off) off(); off = null; }
