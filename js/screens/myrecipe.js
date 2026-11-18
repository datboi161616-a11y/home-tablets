// Family · Add or edit one of your own recipes.
//   #/myrecipe          new recipe
//   #/myrecipe/<id>     edit (with Delete)
// One ingredient per line ("2 cups flour"), one step per line ("Bake 25 minutes").
// Saved on this tablet only. Recipes can also be added from a phone (QR-code page).
import { savedRecipes, saveRecipe, deleteRecipe, MEAL_NAMES } from '../services/my-recipes.js';
import { esc, kitchenStyles, kitchenTop, wireBack } from './kitchen-ui.js';

export function mount(el, { args = [] } = {}) {
  const existing = args[0] ? savedRecipes().find((r) => r.id === args[0]) : null;
  const r = existing || { title: '', meal: 'dinner', serves: 4, prep: 15, cook: 30, blurb: '', ingredients: [], steps: [] };
  let meal = r.meal;
  let deleteArmed = false;

  el.innerHTML = `${kitchenStyles()}
  <style>
    .mr-label{font-size:15px;font-weight:600;color:#4A5363;margin-bottom:6px}
    .mr-in{width:100%;min-height:52px;border-radius:14px;border:2px solid #D9DDE2;background:#FFFFFF;padding:0 16px;font:18px Inter,sans-serif;color:#1D2430;outline:none}
    .mr-in:focus,.mr-ta:focus{border-color:#1D2430}
    .mr-ta{width:100%;flex-grow:1;min-height:0;resize:none;border-radius:16px;border:2px solid #D9DDE2;background:#FFFFFF;padding:14px 16px;font:18px/1.5 Inter,sans-serif;color:#1D2430;outline:none}
    .mr-meal{min-height:48px;padding:0 18px;border-radius:999px;border:2px solid #D9DDE2;background:#FFFFFF;font:600 16px Inter,sans-serif;color:#1D2430;cursor:pointer}
    .mr-meal.on{background:#1D2430;border-color:#1D2430;color:#FFFFFF}
    .mr-hint{font-size:14px;color:#4A5363}
  </style>
  <div class="k-wrap">
    ${kitchenTop({ title: existing ? `Edit: ${existing.title}` : 'Add a recipe', back: 'history', backLabel: '← Back', active: 'recipes' })}
    <div style="flex-grow:1;min-height:0;display:grid;grid-template-columns:400px minmax(0,1fr) minmax(0,1fr);gap:20px">
      <div class="card" style="padding:22px;display:flex;flex-direction:column;gap:16px;overflow-y:auto">
        <div><div class="mr-label">Name</div><input data-f="title" class="mr-in" maxlength="60" value="${esc(r.title)}" placeholder="Grandma's pot roast"></div>
        <div><div class="mr-label">Meal</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">${Object.keys(MEAL_NAMES).map((m) => `<button class="mr-meal${m === meal ? ' on' : ''}" data-meal="${m}">${MEAL_NAMES[m]}</button>`).join('')}</div></div>
        <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px">
          <div><div class="mr-label">Serves</div><input data-f="serves" class="mr-in" type="number" inputmode="numeric" min="1" max="24" value="${r.serves}"></div>
          <div><div class="mr-label">Prep min</div><input data-f="prep" class="mr-in" type="number" inputmode="numeric" min="0" max="1440" value="${r.prep}"></div>
          <div><div class="mr-label">Cook min</div><input data-f="cook" class="mr-in" type="number" inputmode="numeric" min="0" max="1440" value="${r.cook}"></div>
        </div>
        <div><div class="mr-label">Short description (optional)</div><input data-f="blurb" class="mr-in" maxlength="90" value="${esc(r.blurb || '')}" placeholder="Sunday dinner favorite"></div>
        <div data-msg class="mr-hint" style="min-height:20px"></div>
        <div style="display:flex;gap:10px;margin-top:auto">
          <button data-save class="k-btn solid" style="flex:1">Save recipe</button>
          ${existing ? '<button data-delete class="k-btn line">Delete</button>' : ''}
        </div>
      </div>
      <div class="card" style="padding:22px;display:flex;flex-direction:column;gap:8px;min-height:0">
        <div class="mr-label" style="margin:0">Ingredients</div>
        <div class="mr-hint">One per line, like “2 cups flour” or “1 lb ground beef”</div>
        <textarea data-f="ingredients" class="mr-ta" placeholder="2 lb chuck roast&#10;1 onion, sliced&#10;3 carrots&#10;2 cups beef broth">${esc((r.ingredients || []).join('\n'))}</textarea>
      </div>
      <div class="card" style="padding:22px;display:flex;flex-direction:column;gap:8px;min-height:0">
        <div class="mr-label" style="margin:0">Steps</div>
        <div class="mr-hint">One per line. Times like “bake 25 minutes” get a timer.</div>
        <textarea data-f="steps" class="mr-ta" placeholder="Season the roast and brown it on all sides.&#10;Add the onion, carrots and broth.&#10;Cook on low for 8 hours.">${esc((r.steps || []).join('\n'))}</textarea>
      </div>
    </div>
  </div>`;
  wireBack(el, '#/recipes/mine');

  const $ = (s) => el.querySelector(s);
  const val = (f) => $(`[data-f="${f}"]`).value;
  const lines = (f) => val(f).split('\n').map((x) => x.trim()).filter(Boolean);
  const msg = (t, err) => { const m = $('[data-msg]'); m.textContent = t; m.style.color = err ? '#B3261E' : '#4A5363'; };

  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.meal) {
      meal = b.dataset.meal;
      el.querySelectorAll('[data-meal]').forEach((x) => x.classList.toggle('on', x === b));
    } else if (b.matches('[data-save]')) {
      try {
        const saved = saveRecipe({
          id: existing ? existing.id : '',
          title: val('title').trim(),
          meal,
          serves: +val('serves') || 4,
          prep: +val('prep') || 0,
          cook: +val('cook') || 0,
          blurb: val('blurb').trim(),
          ingredients: lines('ingredients'),
          steps: lines('steps'),
        });
        location.replace(`#/dish/${encodeURIComponent(saved.id)}`);
      } catch (err) { msg(err.message, true); }
    } else if (b.matches('[data-delete]')) {
      if (!deleteArmed) { deleteArmed = true; b.textContent = 'Tap again to delete'; b.style.color = '#B3261E'; return; }
      deleteRecipe(existing.id);
      location.replace('#/recipes/mine');
    }
  });
}

export function unmount() {}
