// Family · One recipe (#/dish/<id>): ingredients, steps, add to the week plan, cook it.
import { getRecipe, loadIndex, ingredientText, metaLine, fmtMinutes, cuisineColor } from '../services/recipe-data.js';
import { weekDays, daysPlanned, addToPlan, removeFromPlan } from '../services/meal-plan.js';
import { esc, kitchenStyles, kitchenTop, wireBack, fillCounts } from './kitchen-ui.js';

// Set by the Week plan's "+ Add" so the next recipe picked goes straight onto that day.
export const ADD_DAY_KEY = 'kitchen.addDay';

export function mount(el, { args = [] } = {}) {
  const id = args[0];
  el.innerHTML = `${kitchenStyles()}
  <style>
    .dz-ing{display:flex;gap:12px;font-size:19px;line-height:1.35;padding:6px 0}
    .dz-ing::before{content:'';width:8px;height:8px;border-radius:50%;background:#C9CFD6;flex:none;margin-top:10px}
    .dz-step{display:flex;gap:16px;font-size:19px;line-height:1.4;padding:8px 0}
    .dz-step b{flex:none;width:34px;height:34px;border-radius:50%;background:#F1F2F4;display:flex;align-items:center;justify-content:center;font-size:16px}
    .dz-day{min-height:72px;border-radius:18px;border:2px solid #D9DDE2;background:#FFFFFF;display:flex;flex-direction:column;align-items:center;justify-content:center;
      gap:2px;font-family:Inter,sans-serif;color:#1D2430;cursor:pointer;padding:0 6px}
    .dz-day .l{font-size:16px;font-weight:600}
    .dz-day .s{font-size:14px;color:#4A5363}
    .dz-day.on{background:#1D2430;border-color:#1D2430;color:#FFFFFF}
    .dz-day.on .s{color:#C9CFD6}
  </style>
  <div class="k-wrap" data-root>
    ${kitchenTop({ title: 'Recipe', back: 'history', backLabel: '← Back', active: 'recipes' })}
    <div class="k-empty k-scroll">Loading…</div>
  </div>`;
  const root = el.querySelector('[data-root]');
  wireBack(el, '#/recipes');

  Promise.all([getRecipe(id), loadIndex()]).then(([r, ix]) => {
    if (!el.isConnected) return;
    if (!r) { root.querySelector('.k-empty').textContent = 'That recipe isn’t here any more.'; return; }
    const cuisine = ix.cuisines.find((c) => c.id === r.cuisine) || { name: '', types: [] };
    const type = cuisine.types.find((t) => t.id === r.type);

    function render() {
      const addDay = sessionStorage.getItem(ADD_DAY_KEY);
      const days = weekDays();
      const on = daysPlanned(r.id);
      const target = addDay && days.find((d) => d.key === addDay);
      root.innerHTML = `
        ${kitchenTop({ title: r.title, back: 'history', backLabel: '← Back', active: 'recipes' })}
        <div style="flex-grow:1;min-height:0;display:grid;grid-template-columns:400px minmax(0,1fr);gap:24px">
          <div class="card" style="padding:26px 28px;display:flex;flex-direction:column;gap:12px;min-height:0">
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <a href="#/recipes/${r.cuisine}" class="k-tag" style="background:${cuisineColor(r.cuisine)};color:#fff">${esc(cuisine.name)}</a>
              ${type ? `<a href="#/recipes/${r.cuisine}/${type.id}" class="k-tag">${esc(type.name)}</a>` : ''}
              ${(r.tags || []).slice(0, 3).map((t) => `<span class="k-tag">${esc(t)}</span>`).join('')}
            </div>
            ${r.blurb ? `<div style="font-size:18px;color:#4A5363;line-height:1.35">${esc(r.blurb)}</div>` : ''}
            <div style="font-size:17px;font-weight:600">${esc(metaLine(r))}</div>
            <div class="eyebrow muted" style="margin-top:6px">Ingredients</div>
            <div class="k-scroll">${r.ingredients.map((i) => `<div class="dz-ing">${esc(ingredientText(i))}</div>`).join('')}</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:20px;min-height:0;min-width:0">
            <div class="card" style="padding:26px 30px;flex-grow:1;min-height:0;display:flex;flex-direction:column;gap:10px">
              <div class="eyebrow muted">Steps · ${fmtMinutes(r.prep + r.cook)} total</div>
              <div class="k-scroll">${r.steps.map((s, n) => `<div class="dz-step"><b>${n + 1}</b><span>${esc(s.text)}</span></div>`).join('')}</div>
            </div>
            <div class="card" style="padding:20px 24px;display:flex;flex-direction:column;gap:14px">
              <div style="display:flex;align-items:center;gap:12px">
                <div style="font-size:18px;font-weight:600;flex:1">${on.length ? 'On the week plan — tap a day to change' : 'Add to the week plan'}</div>
                ${target && on.indexOf(target.key) < 0 ? `<button data-addto="${target.key}" class="k-btn solid">Add to ${esc(target.label)}</button>` : ''}
                <a href="#/recipe/${encodeURIComponent(r.id)}" class="k-btn dark">Cook now</a>
              </div>
              <div style="display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:10px">
                ${days.map((d) => `
                  <button class="dz-day${on.indexOf(d.key) >= 0 ? ' on' : ''}" data-day="${d.key}">
                    <span class="l">${d.label === 'Today' || d.label === 'Tomorrow' ? d.label : d.short}</span><span class="s">${on.indexOf(d.key) >= 0 ? '✓ Planned' : d.sub}</span>
                  </button>`).join('')}
              </div>
            </div>
          </div>
        </div>`;
      fillCounts(root);
    }
    render();

    root.addEventListener('click', (e) => {
      const add = e.target.closest('[data-addto]');
      if (add) {
        addToPlan(add.dataset.addto, r.id);
        sessionStorage.removeItem(ADD_DAY_KEY);
        location.hash = '#/plan';
        return;
      }
      const day = e.target.closest('[data-day]');
      if (!day) return;
      const k = day.dataset.day;
      if (daysPlanned(r.id).indexOf(k) >= 0) removeFromPlan(k, r.id); else addToPlan(k, r.id);
      if (sessionStorage.getItem(ADD_DAY_KEY) === k) sessionStorage.removeItem(ADD_DAY_KEY);
      render();
    });
  }).catch((err) => {
    console.error(err);
    if (el.isConnected) root.querySelector('.k-empty').textContent = 'Couldn’t load this recipe. Check the Wi-Fi.';
  });
}

export function unmount() {}
