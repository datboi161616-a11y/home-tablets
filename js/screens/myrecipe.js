// Family · Add or edit one of your own recipes.
//   #/myrecipe          new recipe
//   #/myrecipe/<id>     edit (with Delete)
// One ingredient per line ("2 cups flour"), one step per line ("Bake 25 minutes").
// Saved on this tablet only. Recipes can also be added from a phone (QR-code page).
import { savedRecipes, saveRecipe, deleteRecipe, parseStep, MEAL_NAMES } from '../services/my-recipes.js';
import { esc, kitchenStyles, kitchenTop, FILL } from './kitchen-ui.js';
import { spot } from '../art.js';

let armTimer;

export function mount(el, { args = [] } = {}) {
  const existing = args[0] ? savedRecipes().find((r) => r.id === args[0]) : null;
  const missing = !!args[0] && !existing; // opened "Edit" on a recipe that has since been deleted
  const r = existing || { title: '', meal: 'dinner', serves: 4, prep: 15, cook: 30, blurb: '', ingredients: [], steps: [] };
  let meal = r.meal;
  let deleteArmed = false;
  let leaveArmed = false;
  let saving = false;

  el.innerHTML = `${kitchenStyles()}
  <style>
    .mr-label{font-size:15px;font-weight:600;color:#4A5363;margin-bottom:6px}
    .mr-in{width:100%;min-height:52px;border-radius:14px;border:2px solid #D9DDE2;background:#FFFFFF;padding:0 16px;font:18px Inter,sans-serif;color:#1D2430;outline:none}
    .mr-in:focus,.mr-ta:focus{border-color:#1D2430}
    .mr-ta{width:100%;flex-grow:1;min-height:0;resize:none;border-radius:16px;border:2px solid #D9DDE2;background:#FFFFFF;padding:14px 16px;font:18px/1.5 Inter,sans-serif;color:#1D2430;outline:none}
    .mr-meal{min-height:48px;padding:0 18px;border-radius:999px;border:2px solid #D9DDE2;background:#FFFFFF;font:600 16px Inter,sans-serif;color:#1D2430;cursor:pointer}
    .mr-meal.on{background:#1D2430;border-color:#1D2430;color:#FFFFFF}
    .mr-hint{font-size:14px;color:#4A5363}
    .mr-msg{font-size:16px;font-weight:600;color:#4A5363;min-height:22px;line-height:1.35}
    .mr-in.bad,.mr-ta.bad{border-color:#B3261E}
    .mr-count{font-size:14px;font-weight:600;color:#4A5363;margin-left:auto}
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
          <div><div class="mr-label">Prep (min)</div><input data-f="prep" class="mr-in" type="number" inputmode="numeric" min="0" max="1440" value="${r.prep}"></div>
          <div><div class="mr-label">Cook (min)</div><input data-f="cook" class="mr-in" type="number" inputmode="numeric" min="0" max="1440" value="${r.cook}"></div>
        </div>
        <div><div class="mr-label">Short description (optional)</div><input data-f="blurb" class="mr-in" maxlength="90" value="${esc(r.blurb || '')}" placeholder="Sunday dinner favorite"></div>
        <div data-msg class="mr-msg">${missing ? 'That recipe was deleted. You can type it in again as a new one.' : ''}</div>
        <div class="k-art" data-art style="min-height:0">${spot.recipeCard().replace(/style="[^"]*"/, `style="display:block;${FILL}max-height:170px"`)}</div>
        <div style="display:flex;gap:10px;margin-top:auto">
          <button data-save class="k-btn solid" style="flex:1">Save recipe</button>
          ${existing ? '<button data-delete class="k-btn line">Delete</button>' : ''}
        </div>
      </div>
      <div class="card" style="padding:22px;display:flex;flex-direction:column;gap:8px;min-height:0">
        <div style="display:flex;align-items:baseline"><div class="mr-label" style="margin:0">Ingredients</div><div data-count="ingredients" class="mr-count"></div></div>
        <div class="mr-hint">One per line, like “2 cups flour” or “1 lb ground beef”</div>
        <textarea data-f="ingredients" class="mr-ta" placeholder="For example:&#10;2 lb chuck roast&#10;1 onion, sliced&#10;3 carrots&#10;2 cups beef broth">${esc((r.ingredients || []).join('\n'))}</textarea>
      </div>
      <div class="card" style="padding:22px;display:flex;flex-direction:column;gap:8px;min-height:0">
        <div style="display:flex;align-items:baseline"><div class="mr-label" style="margin:0">Steps</div><div data-count="steps" class="mr-count"></div></div>
        <div class="mr-hint">One per line. Times like “bake 25 minutes” get a timer.</div>
        <textarea data-f="steps" class="mr-ta" placeholder="For example:&#10;Season the roast and brown it on all sides.&#10;Add the onion, carrots and broth.&#10;Cook on low for 8 hours.">${esc((r.steps || []).join('\n'))}</textarea>
      </div>
    </div>
  </div>`;

  const $ = (s) => el.querySelector(s);
  const val = (f) => $(`[data-f="${f}"]`).value;
  const lines = (f) => val(f).split('\n').map((x) => x.trim()).filter(Boolean);
  const msg = (t, err) => { const m = $('[data-msg]'); m.textContent = t; m.style.color = err ? '#B3261E' : '#4A5363'; };
  const snapshot = () => JSON.stringify([meal].concat(['title', 'serves', 'prep', 'cook', 'blurb', 'ingredients', 'steps'].map(val)));
  const start = snapshot();
  const dirty = () => !saving && snapshot() !== start;

  // "4 ingredients" / "3 steps · 2 with a timer", so it's clear what was understood.
  const counts = () => {
    const ni = lines('ingredients').length;
    const st = lines('steps');
    const nt = st.filter((x) => parseStep(x).timer).length;
    $('[data-count="ingredients"]').textContent = ni ? `${ni} ingredient${ni === 1 ? '' : 's'}` : '';
    $('[data-count="steps"]').textContent = st.length ? `${st.length} step${st.length === 1 ? '' : 's'}${nt ? ` · ${nt} with a timer` : ''}` : '';
  };
  counts();
  el.addEventListener('input', (e) => {
    if (e.target.classList.contains('bad')) { e.target.classList.remove('bad'); msg(''); }
    if (e.target.matches('textarea')) counts();
  });

  // Leaving with unsaved typing (Back or one of the tabs) asks for a second tap first.
  const disarmLeave = () => {
    leaveArmed = false;
    const b = $('[data-back]');
    if (b) { b.textContent = '← Back'; b.style.color = ''; }
  };
  el.addEventListener('click', (e) => {
    const out = e.target.closest('.k-top a[href], [data-back]');
    if (!out) return;
    if (dirty() && !leaveArmed) {
      e.preventDefault();
      leaveArmed = true;
      msg('You haven’t saved this recipe. Tap Save, or tap again to leave without saving.', true);
      if (out.matches('[data-back]')) { out.textContent = 'Leave?'; out.style.color = '#B3261E'; }
      clearTimeout(armTimer);
      armTimer = setTimeout(() => { if (el.isConnected) { disarmLeave(); msg(''); } }, 5000);
      return;
    }
    if (out.matches('[data-back]')) {
      e.preventDefault();
      if (history.length > 1) history.back(); else location.hash = '#/recipes/mine';
    }
  }, true);

  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.meal) {
      meal = b.dataset.meal;
      el.querySelectorAll('[data-meal]').forEach((x) => x.classList.toggle('on', x === b));
    } else if (b.matches('[data-save]')) {
      if (saving) return; // a double tap mustn't save it twice
      // Point at what's missing instead of only saying it.
      const need = !val('title').trim() ? ['title', 'Give it a name']
        : !lines('ingredients').length ? ['ingredients', 'Add at least one ingredient']
          : !lines('steps').length ? ['steps', 'Add at least one step'] : null;
      if (need) {
        const f = $(`[data-f="${need[0]}"]`);
        f.classList.add('bad');
        f.focus();
        msg(need[1], true);
        return;
      }
      saving = true;
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
      } catch (err) { saving = false; msg(err.message, true); }
    } else if (b.matches('[data-delete]')) {
      if (!deleteArmed) {
        deleteArmed = true; b.textContent = 'Tap again to delete'; b.style.color = '#B3261E';
        clearTimeout(armTimer);
        armTimer = setTimeout(() => { if (b.isConnected) { deleteArmed = false; b.textContent = 'Delete'; b.style.color = ''; } }, 4000);
        return;
      }
      saving = true;
      deleteRecipe(existing.id);
      location.replace('#/recipes/mine');
    }
  });
}

export function unmount() { clearTimeout(armTimer); }
