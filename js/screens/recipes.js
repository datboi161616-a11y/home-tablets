// Family · Recipes: browse by cuisine -> type -> recipe, or search.
//   #/recipes                    all cuisines
//   #/recipes/chinese            every Chinese recipe
//   #/recipes/chinese/noodles    just the noodles
import { loadIndex, searchRecipes, cuisineColor, fmtMinutes } from '../services/recipe-data.js';
import { getPlan, weekDays } from '../services/meal-plan.js';
import { esc, kitchenStyles, kitchenTop, fillCounts } from './kitchen-ui.js';

let searchTimer;

// "Planned Thu" for recipes already in this week's plan.
function plannedLabels() {
  const plan = getPlan();
  const out = {};
  weekDays().forEach((d) => (plan[d.key] || []).forEach((id) => { if (!out[id]) out[id] = d.label === 'Today' ? 'Tonight' : d.short; }));
  return out;
}

function recipeCard(r, planned, cuisineName) {
  const tags = r.g.filter((t) => t !== 'kid-friendly').slice(0, 2);
  return `
    <a href="#/dish/${encodeURIComponent(r.id)}" class="card rb-card">
      <div style="display:flex;gap:8px;align-items:center;min-height:28px">
        ${planned[r.id] ? `<span class="k-badge">Planned · ${esc(planned[r.id])}</span>` : ''}
        ${cuisineName ? `<span class="k-tag" style="background:${cuisineColor(r.c)};color:#fff">${esc(cuisineName)}</span>` : ''}
      </div>
      <div class="display rb-t">${esc(r.t)}</div>
      ${r.b ? `<div class="rb-b">${esc(r.b)}</div>` : ''}
      <div style="flex-grow:1"></div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <span style="font-size:16px;font-weight:600">${fmtMinutes(r.m)}</span>
        ${tags.map((t) => `<span class="k-tag">${esc(t)}</span>`).join('')}
      </div>
    </a>`;
}

export function mount(el, { args = [] } = {}) {
  const [cuisineId, typeId] = args;

  el.innerHTML = `${kitchenStyles()}
  <style>
    .rb-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));grid-auto-rows:minmax(150px,1fr);gap:20px;min-height:100%}
    .rb-cuisine{border-radius:var(--radius);padding:24px;min-height:150px;color:#fff;display:flex;flex-direction:column;justify-content:space-between;
      transition:transform .1s ease}
    .rb-cuisine:active,.rb-card:active{transform:scale(.97)}
    .rb-cuisine .n{font-size:28px;font-weight:500;line-height:1.1}
    .rb-cuisine .c{font-size:16px;opacity:.9}
    .rb-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;align-content:start;padding-bottom:4px}
    .rb-card{padding:20px 22px;min-height:178px;display:flex;flex-direction:column;gap:8px;transition:transform .1s ease}
    .rb-t{font-size:23px;font-weight:500;line-height:1.15}
    .rb-b{font-size:16px;color:#4A5363;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
    .rb-types{display:flex;flex-direction:column;gap:8px;width:250px;flex:none;overflow-y:auto}
    .rb-type{min-height:56px;padding:0 20px;border-radius:18px;background:#FFFFFF;display:flex;align-items:center;justify-content:space-between;gap:10px;
      font-size:18px;font-weight:600;color:#1D2430}
    .rb-type span{color:#4A5363;font-weight:500;font-size:16px}
    .rb-type.on{background:#1D2430;color:#FFFFFF}
    .rb-type.on span{color:#C9CFD6}
  </style>
  <div class="k-wrap" data-root></div>`;

  const root = el.querySelector('[data-root]');
  root.innerHTML = `${kitchenTop({ title: 'Recipes', active: 'recipes' })}<div class="k-empty k-scroll">Loading recipes…</div>`;

  loadIndex().then((ix) => {
    if (!el.isConnected) return;
    const planned = plannedLabels();
    const cuisine = ix.cuisines.find((c) => c.id === cuisineId);

    if (!cuisine) {
      // ---- All cuisines + search ----
      root.innerHTML = `
        ${kitchenTop({ title: 'Recipes', active: 'recipes', extra: `<input data-search class="k-input" style="width:300px" placeholder="Search ${ix.recipes.length} recipes" autocomplete="off">` })}
        <div data-body class="k-scroll"></div>`;
      const body = root.querySelector('[data-body]');
      const names = {};
      ix.cuisines.forEach((c) => { names[c.id] = c.name; });
      const showGrid = () => {
        body.innerHTML = `<div class="rb-grid">${ix.cuisines.map((c) => `
          <a href="#/recipes/${c.id}" class="rb-cuisine" style="background:${cuisineColor(c.id)}">
            <div class="n display">${esc(c.name)}</div>
            <div class="c">${c.count} recipes · ${esc(c.types.slice(0, 3).map((t) => t.name).join(', '))}</div>
          </a>`).join('')}</div>`;
      };
      showGrid();
      const input = root.querySelector('[data-search]');
      input.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(async () => {
          const q = input.value.trim();
          if (!q) { showGrid(); return; }
          const hits = await searchRecipes(q, 120);
          if (!el.isConnected || input.value.trim() !== q) return;
          body.innerHTML = hits.length
            ? `<div class="rb-cards">${hits.map((r) => recipeCard(r, planned, names[r.c])).join('')}</div>`
            : `<div class="k-empty">Nothing found for “${esc(q)}”</div>`;
          body.scrollTop = 0;
        }, 250);
      });
    } else {
      // ---- One cuisine, optionally one type ----
      const type = cuisine.types.find((t) => t.id === typeId);
      const list = ix.recipes.filter((r) => r.c === cuisine.id && (!type || r.ty === type.id));
      root.innerHTML = `
        ${kitchenTop({ title: type ? `${cuisine.name} · ${type.name}` : cuisine.name, back: '#/recipes', backLabel: '← All cuisines', active: 'recipes' })}
        <div style="flex-grow:1;min-height:0;display:flex;gap:24px">
          <div class="rb-types">
            <a href="#/recipes/${cuisine.id}" class="rb-type${type ? '' : ' on'}">All ${esc(cuisine.name)}<span>${cuisine.count}</span></a>
            ${cuisine.types.map((t) => `
              <a href="#/recipes/${cuisine.id}/${t.id}" class="rb-type${type && type.id === t.id ? ' on' : ''}">${esc(t.name)}<span>${t.count}</span></a>`).join('')}
          </div>
          <div class="k-scroll"><div class="rb-cards">${list.map((r) => recipeCard(r, planned)).join('')}</div></div>
        </div>`;
    }
    fillCounts(root);
  }).catch((err) => {
    console.error(err);
    if (el.isConnected) root.querySelector('.k-empty').textContent = 'Recipes need the internet the first time. Check the Wi-Fi.';
  });
}

export function unmount() { clearTimeout(searchTimer); }
