// Family · Recipes: browse by cuisine -> type -> recipe, or search.
//   #/recipes                    Breakfast / Lunch / Dinner (+ desserts)
//   #/recipes/dinner             dinner cuisines
//   #/recipes/chinese            every Chinese recipe
//   #/recipes/chinese/noodles    just the noodles
import { backHref, backLabel } from '../services/nav.js';
import { loadIndex, searchRecipes, cuisineColor, fmtMinutes } from '../services/recipe-data.js';
import { getPlan, weekDays, dayIds, favorites } from '../services/meal-plan.js';
import { esc, kitchenStyles, kitchenTop, fillCounts } from './kitchen-ui.js';
import { foodArt, foodFor, C } from '../art.js';

let searchTimer;
let favs = [];

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

// "Planned Thu" for recipes already in this week's plan.
function plannedLabels() {
  const plan = getPlan();
  const out = {};
  weekDays().forEach((d) => dayIds(plan, d.key).forEach((id) => { if (!out[id]) out[id] = d.label === 'Today' ? 'Today' : d.short; }));
  return out;
}

// Small cake for the Desserts & baking bar (a cut of art.js's dessert scene, no halo).
const dessertBarArt = () => `<svg viewBox="0 0 150 120" width="150" height="120" aria-hidden="true" focusable="false" style="display:block;flex:none">
  <ellipse cx="75" cy="108" rx="60" ry="9" fill="#8C3D5D"/>
  <path d="M28 100V60l94-16v56z" fill="${C.cream}"/><path d="M28 60l94-16v12L28 72z" fill="#FFF"/>
  <path d="M28 80l94-12v8l-94 12z" fill="${C.pink}"/><path d="M28 60l66-42 28 26z" fill="#FFF"/>
  <circle cx="96" cy="16" r="9" fill="${C.accent}"/><path d="M96 7q4-8 10-6" stroke="${C.green}" stroke-width="3" fill="none" stroke-linecap="round"/></svg>`;

// A food picture for a cuisine's own colour: breakfast, lunch and dessert scenes as drawn;
// dinner cuisines get a bowl or a pot on a soft see-through halo that suits any tile colour.
const BOWL_CUISINES = /chinese|japanese|thai|korean|indian|mexican|viet|asian|mine/;
function cuisineArt(c) {
  const meal = c.meal || 'dinner';
  if (meal === 'breakfast') return foodArt.breakfast();
  if (meal === 'lunch') return foodArt.lunch();
  if (meal === 'dessert') return foodArt.dessert();
  const halo = 'rgba(255,255,255,.14)';
  if (BOWL_CUISINES.test(c.id)) return foodArt.bowl(halo);
  const kind = foodFor('dinner', c.name);
  return foodArt[kind](halo, 'rgba(0,0,0,.18)');
}

function recipeCard(r, planned, cuisineName) {
  const tags = r.g.filter((t) => t !== 'kid-friendly').slice(0, 2);
  return `
    <a href="#/dish/${encodeURIComponent(r.id)}" class="card rb-card">
      <div style="display:flex;gap:8px;align-items:center;min-height:28px">
        ${planned[r.id] ? `<span class="k-badge">Planned · ${esc(planned[r.id])}</span>` : ''}
        ${favs.indexOf(r.id) >= 0 ? '<span style="color:#C2491F;font-size:20px;margin-left:auto" aria-label="Favorite">♥</span>' : ''}
        ${cuisineName ? `<span class="k-tag" style="background:${cuisineColor(r.c)};color:#fff">${esc(cuisineName)}</span>` : ''}
      </div>
      <div class="display rb-t">${esc(r.t)}</div>
      ${r.b ? `<div class="rb-b">${esc(r.b)}</div>` : ''}
      <div style="flex-grow:1"></div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        ${r.m ? `<span style="font-size:16px;font-weight:600">${fmtMinutes(r.m)}</span>` : ''}
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
      transition:transform .1s ease;overflow:hidden}
    .rb-cuisine{position:relative}
    .rb-cuisine .n,.rb-cuisine .c{position:relative}
    .rb-cuisine .c{max-width:62%}
    .rb-cuisine .art{position:absolute;right:-12px;bottom:-14px;width:118px;height:118px;pointer-events:none}
    .rb-cuisine .art.wide{right:-26px;bottom:-4px;width:160px;height:88px}
    .rb-cuisine .art svg{width:100%;height:100%}
    .rb-cuisine:active,.rb-card:active{transform:scale(.97)}
    .rb-cuisine .n{font-size:28px;font-weight:500;line-height:1.1}
    .rb-cuisine .c{font-size:16px;opacity:.9}
    .rb-meals{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));grid-template-rows:minmax(0,1fr) 120px;gap:20px;height:100%}
    .rb-meal{border-radius:var(--radius);padding:32px;color:#fff;display:flex;flex-direction:column;justify-content:space-between;transition:transform .1s ease;overflow:hidden;min-height:0}
    .rb-meal .art{flex:1 1 0;min-height:0;margin:8px -32px}
    .rb-meal .art svg{width:100%;height:100%}
    .rb-meal:active{transform:scale(.98)}
    .rb-meal .n{font-size:52px;font-weight:500;line-height:1}
    .rb-meal .c{font-size:18px;line-height:1.4}
    .rb-meal .c .ty{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
    .rb-meal.small{grid-column:1 / 3;flex-direction:row;align-items:center;justify-content:flex-start;gap:24px;padding:0 32px}
    .rb-meal.small .n{margin-right:auto}
    .rb-meal.mine{grid-column:3 / 4;flex-direction:row;align-items:center;justify-content:flex-start;gap:18px;padding:0 26px;background:#FFFFFF;color:#1D2430;border:2px dashed #C9CFD6}
    .rb-meal.mine .mine-art{width:56px;height:64px;flex:none}
    .rb-meal.mine .mine-art svg{width:100%;height:100%}
    .rb-meal.mine .n{font-size:28px}
    .rb-meal.small .n{font-size:32px}
    .rb-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;align-content:start;padding-bottom:4px}
    .rb-card{padding:20px 22px;min-height:178px;display:flex;flex-direction:column;gap:8px;transition:transform .1s ease}
    .rb-t{font-size:23px;font-weight:500;line-height:1.15}
    .rb-b{font-size:16px;color:#4A5363;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
    .rb-types{display:flex;flex-direction:column;gap:8px;width:250px;flex:none;overflow-y:auto}
    .rb-types .rb-type{flex:none}
    .rb-types-art{flex:1 1 0;min-height:0;max-height:220px;margin-top:auto;border-radius:18px;padding:8px;overflow:hidden;position:relative}
    .rb-types-art svg{position:absolute;top:8px;left:8px;width:calc(100% - 16px);height:calc(100% - 16px)}
    .rb-type{min-height:56px;padding:0 20px;border-radius:18px;background:#FFFFFF;display:flex;align-items:center;justify-content:space-between;gap:10px;
      font-size:18px;font-weight:600;color:#1D2430}
    .rb-type span{color:#4A5363;font-weight:500;font-size:16px}
    .rb-type.on{background:#1D2430;color:#FFFFFF}
    .rb-type.on span{color:#C9CFD6}
    .rb-search{position:relative;flex:none}
    .rb-search .k-input{width:240px;padding-right:56px}
    .rb-clear{position:absolute;right:4px;top:50%;margin-top:-24px;width:48px;height:48px;border:none;border-radius:50%;background:transparent;
      font-size:26px;line-height:1;color:#4A5363;cursor:pointer;display:none}
    .rb-found{font-size:17px;font-weight:600;color:#4A5363;margin:0 2px 14px}
  </style>
  <div class="k-wrap" data-root></div>`;

  const root = el.querySelector('[data-root]');
  const here = location.hash;

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
      box.insertAdjacentHTML('beforeend', more.rest.splice(0, 45).map(more.card).join(''));
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

  const load = () => {
  root.innerHTML = `${kitchenTop({ title: 'Recipes', active: 'recipes' })}<div class="k-empty k-scroll">Loading recipes…</div>`;

  loadIndex().then((ix) => {
    if (!el.isConnected) return;
    const planned = plannedLabels();
    const cuisine = ix.cuisines.find((c) => c.id === cuisineId);
    const dinnerView = cuisineId === 'dinner';
    favs = favorites();
    if (cuisineId === 'favorites') {
      // ---- Hearted recipes ----
      const names = {};
      ix.cuisines.forEach((c) => { names[c.id] = c.name; });
      const list = favs.map((id) => ix.byId[id]).filter(Boolean);
      root.innerHTML = `
        ${kitchenTop({ title: 'Favorites', back: '#/recipes', backLabel: '← Recipes', active: 'recipes' })}
        <div class="k-scroll">${list.length
          ? `<div class="rb-cards">${cards(list, (r) => recipeCard(r, planned, names[r.c]))}</div>`
          : '<div class="k-empty">Tap the ♡ on any recipe to keep it here.</div>'}</div>`;
      restOfCards(root.querySelector('.rb-cards'));
      keepScroll(root.querySelector('.k-scroll'));
      fillCounts(root);
      return;
    }
    const byMeal = (m) => ix.cuisines.filter((c) => (c.meal || 'dinner') === m);
    const count = (list) => list.reduce((n, c) => n + c.count, 0);

    if (!cuisine) {
      // ---- Breakfast / Lunch / Dinner (or the dinner cuisines) + search ----
      root.innerHTML = `
        ${kitchenTop({ title: dinnerView ? 'Dinner' : 'Recipes', active: 'recipes',
          back: dinnerView ? '#/recipes' : backHref(), backLabel: dinnerView ? '← Recipes' : backLabel(),
          extra: `<a href="#/recipes/favorites" class="k-btn" style="color:#C2491F">♥ Favorites${favs.length ? ` · ${favs.length}` : ''}</a><div class="rb-search"><input data-search class="k-input" placeholder="Search recipes" autocomplete="off"><button data-clear class="rb-clear" aria-label="Clear search">×</button></div>` })}
        <div data-body class="k-scroll"></div>`;
      const body = root.querySelector('[data-body]');
      const names = {};
      ix.cuisines.forEach((c) => { names[c.id] = c.name; });
      const mealArt = { breakfast: () => foodArt.breakfast(), lunch: () => foodArt.lunch(), dinner: () => foodArt.dinner() };
      const mealTile = (id, name, list, href, color, small) => (list.length ? `
          <a href="${href}" class="rb-meal${small ? ' small' : ''}" style="background:${color}">
            ${small ? dessertBarArt() : ''}
            <div class="n display">${esc(name)}</div>
            ${!small && mealArt[id] ? `<div class="art">${mealArt[id]()}</div>` : ''}
            <div class="c">${small ? `${count(list)} recipes` : `<div style="font-weight:600">${count(list)} recipes</div><div class="ty">${esc((list.length > 1 ? list.map((c) => c.name.split(' & ')[0]) : list[0].types.map((t) => t.name)).slice(0, 5).join(' · '))}</div>`}</div>
          </a>` : '');
      const mineCount = (ix.cuisines.find((c) => c.id === 'mine') || { count: 0 }).count;
      const showMeals = () => {
        const one = (m) => { const l = byMeal(m); return l.length === 1 ? `#/recipes/${l[0].id}` : `#/recipes/${m}`; };
        body.style.overflow = 'hidden';
        body.innerHTML = `<div class="rb-meals">
          ${mealTile('breakfast', 'Breakfast', byMeal('breakfast'), one('breakfast'), cuisineColor('breakfast'))}
          ${mealTile('lunch', 'Lunch', byMeal('lunch'), one('lunch'), cuisineColor('lunch'))}
          ${mealTile('dinner', 'Dinner', byMeal('dinner'), '#/recipes/dinner', '#1D2430')}
          ${mealTile('dessert', 'Desserts & baking', byMeal('dessert'), one('dessert'), cuisineColor('desserts'), true)}
          <a href="${mineCount ? '#/recipes/mine' : '#/myrecipe'}" class="rb-meal mine">
            <span class="mine-art">${foodArt.myRecipe()}</span>
            <div style="min-width:0">
              <div class="n display">My recipes</div>
              <div class="c" style="font-size:16px;color:#4A5363;margin-top:2px">${mineCount ? `${mineCount} saved` : '+ Add your own'}</div>
            </div>
          </a>
        </div>`;
      };
      const showGrid = () => {
        if (!dinnerView) { showMeals(); return; }
        body.style.overflow = '';
        body.innerHTML = `<div class="rb-grid">${byMeal('dinner').map((c) => `
          <a href="#/recipes/${c.id}" class="rb-cuisine" style="background:${cuisineColor(c.id)}">
            <div class="n display">${esc(c.name)}</div>
            <div class="art${BOWL_CUISINES.test(c.id) ? '' : ' wide'}">${cuisineArt(c)}</div>
            <div class="c">${c.count} recipes · ${esc(c.types.slice(0, 3).map((t) => t.name).join(', '))}</div>
          </a>`).join('')}</div>`;
      };
      const input = root.querySelector('[data-search]');
      const clearBtn = root.querySelector('[data-clear]');
      const runSearch = async (restoring) => {
        const q = input.value.trim();
        clearBtn.style.display = q ? 'block' : 'none';
        const qs = memo().qs || {}; qs[here] = q; setMemo({ qs });
        if (!q) { showGrid(); return; }
        body.style.overflow = '';
        const hits = await searchRecipes(q, 120);
        if (!el.isConnected || input.value.trim() !== q) return;
        body.innerHTML = hits.length
          ? `<div class="rb-found">${hits.length >= 120 ? 'Over 100' : hits.length} recipe${hits.length === 1 ? '' : 's'} found for “${esc(q)}”</div>
             <div class="rb-cards">${cards(hits, (r) => recipeCard(r, planned, names[r.c]), restoring ? `${here}?${q}` : '')}</div>`
          : `<div class="k-empty">Nothing found for “${esc(q)}”.<br>Try one simple word, like “chicken” or “soup”.
               <button data-clear class="k-btn line">Clear the search</button></div>`;
        restOfCards(body.querySelector('.rb-cards'));
        if (!restoring) { body.scrollTop = 0; return; }
        else { const at = (memo().scroll || {})[`${here}?${q}`]; if (at) body.scrollTop = at; }
      };
      input.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => runSearch(false), 250);
      });
      root.addEventListener('click', (e) => {
        if (!e.target.closest('[data-clear]')) return;
        input.value = '';
        runSearch(false);
        input.focus();
      });
      // Back from a recipe you found by searching: the search (and the spot in it) is still there.
      keepScroll(body, () => (input.value.trim() ? `${here}?${input.value.trim()}` : null));
      const lastQ = (memo().qs || {})[here];
      if (lastQ) { input.value = lastQ; runSearch(true); } else showGrid();
    } else {
      // ---- One cuisine, optionally one type ----
      const type = cuisine.types.find((t) => t.id === typeId);
      const list = ix.recipes.filter((r) => r.c === cuisine.id && (!type || r.ty === type.id));
      root.innerHTML = `
        ${kitchenTop({ title: type ? `${cuisine.name} · ${type.name}` : cuisine.name, active: 'recipes',
          back: (cuisine.meal || 'dinner') === 'dinner' ? '#/recipes/dinner' : '#/recipes',
          backLabel: (cuisine.meal || 'dinner') === 'dinner' ? '← Dinner' : '← Recipes',
          extra: cuisine.id === 'mine' ? '<a href="#/myrecipe" class="k-btn solid">+ Add a recipe</a>' : '' })}
        <div style="flex-grow:1;min-height:0;display:flex;gap:24px">
          <div class="rb-types">
            <a href="#/recipes/${cuisine.id}" class="rb-type${type ? '' : ' on'}">All ${esc(cuisine.name)}<span>${cuisine.count}</span></a>
            ${cuisine.types.map((t) => `
              <a href="#/recipes/${cuisine.id}/${t.id}" class="rb-type${type && type.id === t.id ? ' on' : ''}">${esc(t.name)}<span>${t.count}</span></a>`).join('')}
            <div class="rb-types-art" style="background:${cuisineColor(cuisine.id)}">${cuisineArt(cuisine)}</div>
          </div>
          <div class="k-scroll">${list.length
            ? `<div class="rb-cards">${cards(list, (r) => recipeCard(r, planned))}</div>`
            : `<div class="k-empty">${cuisine.id === 'mine' ? 'Your own recipes live here.<a href="#/myrecipe" class="k-btn solid">+ Add a recipe</a>' : 'Nothing here yet.'}</div>`}</div>
        </div>`;
      restOfCards(root.querySelector('.rb-cards'));
      keepScroll(root.querySelector('.k-scroll'));
      // The picture only fills spare room under a short list; a long list keeps it all.
      const pic = root.querySelector('.rb-types-art');
      if (pic && pic.clientHeight < 110) pic.style.display = 'none';
    }
    fillCounts(root);
  }).catch((err) => {
    console.error(err);
    const box = el.isConnected && root.querySelector('.k-empty');
    if (box) box.innerHTML = 'Recipes need the internet the first time. Check the Wi-Fi.<button data-retry class="k-btn solid">Try again</button>';
  });
  };
  root.addEventListener('click', (e) => { if (e.target.closest('[data-retry]')) load(); });
  load();
}

export function unmount() { clearTimeout(searchTimer); }
