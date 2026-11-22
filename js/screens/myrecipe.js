// Kitchen · Add or edit one of your own recipes.
//   #/myrecipe          new recipe
//   #/myrecipe/<id>     edit (with Delete)
// One ingredient per line ("2 cups flour"), one step per line ("Bake 25 minutes").
// Saved on this screen only. Recipes can also be sent from a phone: the page shows the code to scan.
//   #/myrecipe/from/<id>  a copy of a library recipe, to change as you like
import { savedRecipes, saveRecipe, deleteRecipe, parseStep, MEAL_NAMES, UNDO_KEY } from '../services/my-recipes.js';
import { getRecipe, ingredientText, loadIndex } from '../services/recipe-data.js';
import { esc, fillCounts, kitchenLinks } from './kitchen-ui.js';
import { topBar, phoneCode, wirePhoneCodes } from './ui.js';

let armTimer, draftTimer;
let stopCodes = null; // stops the phone code being redrawn

// What was being typed, kept as you go: a restart or an update in the middle of typing
// out a long recipe does not lose it. One draft per recipe (or 'new'), for a week.
const DRAFT_KEY = 'myrecipe.draft.v1';
const DRAFT_MS = 7 * 86400000;
function readDraft(key) {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    return d && d.key === key && Date.now() - d.at < DRAFT_MS ? d.fields : null;
  } catch (e) { return null; }
}
const clearDraft = () => { try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* storage off */ } };

export function mount(el, { args = [] } = {}) {
  const copyOf = args[0] === 'from' ? args[1] : '';
  const editId = copyOf ? '' : args[0];
  const existing = editId ? savedRecipes().find((r) => r.id === editId) : null;
  const missing = !!editId && !existing; // opened "Edit" on a recipe that has since been deleted
  const draftKey = existing ? existing.id : copyOf ? `from:${copyOf}` : 'new';
  const draft = readDraft(draftKey);
  const r = Object.assign({ title: '', meal: 'dinner', serves: 4, prep: 15, cook: 30, blurb: '', ingredients: [], steps: [] }, existing || {}, draft || {});
  let meal = r.meal;
  let deleteArmed = false;
  let leaveArmed = false;
  let saving = false;

  el.innerHTML = `
  <style>
    .mr{height:100%;position:relative;overflow:hidden;color:#FFF4EA;font-family:Inter,system-ui,sans-serif;padding:28px 40px 32px;display:flex;flex-direction:column;gap:16px;
      background:radial-gradient(ellipse 1000px 620px at 22% -6%,#5B3320 0%,#2C1B14 52%,#1A110D 100%)}
    .mr-grid{flex:1 1 0;min-height:0;display:grid;grid-template-columns:410px minmax(0,1fr) minmax(0,1fr);grid-template-rows:auto minmax(0,1fr);gap:16px}
    .mr-card{border-radius:28px;background:rgba(255,244,234,.09);box-shadow:inset 0 0 0 1.5px rgba(255,244,234,.1);padding:20px;display:flex;flex-direction:column;gap:10px;min-height:0}
    .mr-fields{flex:1 1 0;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;display:flex;flex-direction:column;gap:10px}
    .mr-label{font:600 16px Inter,sans-serif;color:#FFD696;margin-bottom:6px}
    .mr-in{width:100%;min-height:56px;border-radius:16px;border:2px solid transparent;background:#FFF4EA;padding:0 18px;font:500 20px Inter,sans-serif;color:#2A160C;outline:none}
    .mr-in:focus,.mr-ta:focus{border-color:#FF8A3D}
    .mr-ta{width:100%;flex-grow:1;min-height:0;resize:none;border-radius:18px;border:2px solid transparent;background:#FFF4EA;padding:14px 18px;font:500 20px/1.5 Inter,sans-serif;color:#2A160C;outline:none}
    .mr-in::placeholder,.mr-ta::placeholder{color:#9C8777}
    .mr-step{display:flex;align-items:center;gap:8px}
    .mr-pm{width:56px;height:56px;flex:none;border-radius:18px;border:0;background:rgba(255,244,234,.16);font:600 28px Outfit,sans-serif;color:#FFF4EA;cursor:pointer;padding:0}
    .mr-pm:active,.mr-meal:active{transform:scale(.95)}
    .mr-num{width:92px;flex:none;text-align:center;padding:0 6px}
    .mr-unit{width:34px;font-size:16px;color:#E3CDBB;flex:none}
    .mr-meals{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    .mr-meal{min-height:56px;border-radius:999px;border:0;background:rgba(255,244,234,.14);font:600 18px Inter,sans-serif;color:#FFF4EA;cursor:pointer}
    .mr-meal.on{background:#FFF4EA;color:#3A1D10}
    .mr-hint{font-size:16px;color:#E3CDBB}
    .mr-msg{font-size:17px;font-weight:600;color:#FFE6D6;line-height:1.35}
    .mr-msg:empty{display:none}
    .mr-in.bad,.mr-ta.bad{border-color:#FF6B5E;background:#FFE4DF}
    .mr-count{font-size:16px;font-weight:600;color:#E3CDBB;margin-left:auto}
    .mr-phone{grid-column:2 / 4}
    .mr-phone .x-code{background:rgba(255,244,234,.09);box-shadow:inset 0 0 0 1.5px rgba(255,244,234,.1);border-radius:28px;padding:12px 22px 12px 14px}
  </style>
  <div class="mr">
    ${topBar({ title: existing ? `Edit: ${existing.title}` : copyOf ? 'Make your own version' : 'Add a recipe', back: 'history', backLabel: '← Back', tone: 'dark', right: kitchenLinks() })}
    <div class="mr-grid">
      <div class="mr-card" style="grid-row:1 / 3">
        <div class="mr-fields">
          <div><div class="mr-label">Name</div><input data-f="title" class="mr-in" maxlength="60" value="${esc(r.title)}" placeholder="Sunday pot roast"></div>
          <div><div class="mr-label">Meal</div>
            <div class="mr-meals">${Object.keys(MEAL_NAMES).map((m) => `<button class="mr-meal${m === meal ? ' on' : ''}" data-meal="${m}">${MEAL_NAMES[m]}</button>`).join('')}</div></div>
          <div style="display:flex;flex-direction:column;gap:8px">
            ${[['serves', 'Serves', r.serves, 1, 24, ''], ['prep', 'Prep', r.prep, 0, 1440, 'min'], ['cook', 'Cook', r.cook, 0, 1440, 'min']].map(([f, label, v, lo, hi, unit]) => `
              <div class="mr-step">
                <div class="mr-label" style="margin:0;flex:1">${label}</div>
                <button class="mr-pm" data-pm="${f}" data-d="-1" aria-label="Less">−</button>
                <input data-f="${f}" class="mr-in mr-num" type="number" inputmode="numeric" min="${lo}" max="${hi}" value="${v}">
                <span class="mr-unit">${unit}</span>
                <button class="mr-pm" data-pm="${f}" data-d="1" aria-label="More">+</button>
              </div>`).join('')}
          </div>
          <div><div class="mr-label">Short description (optional)</div><input data-f="blurb" class="mr-in" maxlength="90" value="${esc(r.blurb || '')}" placeholder="A favorite for a slow Sunday"></div>
        </div>
        <div data-msg class="mr-msg">${missing ? 'That recipe was deleted. You can type it in again as a new one.'
          : draft ? 'Here’s what you were typing last time. Tap Save when it’s ready.' : ''}</div>
        <div style="display:flex;gap:10px">
          <button data-save class="x-btn accent" style="flex:1">Save recipe</button>
          ${existing ? '<button data-delete class="x-btn frost">Delete</button>' : ''}
        </div>
      </div>
      ${existing || copyOf ? '<div class="mr-phone" style="display:none"></div>' : `<div class="mr-phone">${phoneCode({ tab: 'recipe', size: 76, title: 'Easier on a phone?', sub: 'Scan to type or paste the recipe there and send it to this screen. Same Wi-Fi as this screen.' })}</div>`}
      <div class="mr-card">
        <div style="display:flex;align-items:baseline"><div class="mr-label" style="margin:0">Ingredients</div><div data-count="ingredients" class="mr-count"></div></div>
        <div class="mr-hint">One per line, like “2 cups flour” or “1 lb ground beef”</div>
        <textarea data-f="ingredients" class="mr-ta" placeholder="For example:&#10;2 lb chuck roast&#10;1 onion, sliced&#10;3 carrots&#10;2 cups beef broth">${esc((r.ingredients || []).join('\n'))}</textarea>
      </div>
      <div class="mr-card">
        <div style="display:flex;align-items:baseline"><div class="mr-label" style="margin:0">Steps</div><div data-count="steps" class="mr-count"></div></div>
        <div class="mr-hint">One per line. Times like “bake 25 minutes” get a timer.</div>
        <textarea data-f="steps" class="mr-ta" placeholder="For example:&#10;Season the roast and brown it on all sides.&#10;Add the onion, carrots and broth.&#10;Cook on low for 8 hours.">${esc((r.steps || []).join('\n'))}</textarea>
      </div>
    </div>
  </div>`;
  if (stopCodes) stopCodes();
  stopCodes = wirePhoneCodes(el);
  fillCounts(el);

  const $ = (s) => el.querySelector(s);
  const val = (f) => $(`[data-f="${f}"]`).value;
  const lines = (f) => val(f).split('\n').map((x) => x.trim()).filter(Boolean);
  const msg = (t, err) => { const m = $('[data-msg]'); m.textContent = t; m.style.color = err ? '#FFB3A8' : '#FFE6D6'; };
  const snapshot = () => JSON.stringify([meal].concat(['title', 'serves', 'prep', 'cook', 'blurb', 'ingredients', 'steps'].map(val)));
  const start = snapshot();
  let restored = !!draft; // typing brought back from last time counts as not saved yet
  const dirty = () => !saving && (restored || snapshot() !== start);

  // Numbers: −/+ instead of the keyboard (the box can still be typed in). Minutes go up
  // in fives, then quarter hours past two hours, so a 4-hour roast is a handful of taps.
  const LIMITS = { serves: [1, 24], prep: [0, 1440], cook: [0, 1440] };
  const clampNum = (f, v) => Math.max(LIMITS[f][0], Math.min(LIMITS[f][1], Math.round(+v || 0)));
  const bump = (f, d) => {
    const box = $(`[data-f="${f}"]`);
    const v = clampNum(f, box.value);
    const step = f === 'serves' ? 1 : (d > 0 ? v >= 120 : v > 120) ? 15 : 5;
    box.value = clampNum(f, d > 0 ? Math.floor(v / step) * step + step : Math.ceil(v / step) * step - step);
    keepDraft();
  };

  const fields = () => ({ title: val('title'), meal, serves: val('serves'), prep: val('prep'), cook: val('cook'), blurb: val('blurb'),
    ingredients: val('ingredients').split('\n'), steps: val('steps').split('\n') });
  function keepDraft() {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => {
      if (saving || !el.isConnected) return;
      if (snapshot() === start && !restored) return;
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ key: draftKey, at: Date.now(), fields: fields() })); } catch (e) { /* storage full */ }
    }, 600);
  }

  // "Make my own version" of a library recipe: its words filled in, ready to change.
  if (copyOf && !draft) {
    Promise.all([getRecipe(copyOf), loadIndex()]).then(([src, ix]) => {
      if (!el.isConnected || !src) return;
      const sec = (ix.cuisines.find((c) => c.id === src.cuisine) || {}).meal;
      const set = (f, v) => { $(`[data-f="${f}"]`).value = v; };
      set('title', `${src.title} (my way)`.slice(0, 60));
      set('serves', src.serves || 4); set('prep', src.prep || 0); set('cook', src.cook || 0);
      set('blurb', (src.blurb || '').slice(0, 90));
      set('ingredients', (src.ingredients || []).map((i) => ingredientText(i)).join('\n'));
      set('steps', (src.steps || []).map((s) => s.text).join('\n'));
      meal = MEAL_NAMES[sec] ? sec : 'dinner';
      el.querySelectorAll('[data-meal]').forEach((x) => x.classList.toggle('on', x.dataset.meal === meal));
      restored = true;
      counts();
      msg('A copy for you to change. Tap Save to keep it in My recipes; the original stays as it is.');
    }).catch(() => { if (el.isConnected) msg('Couldn’t open that recipe to copy. Check the Wi-Fi.', true); });
  }

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
    if (e.target.dataset.f === 'title') { const sb = $('[data-save]'); delete sb.dataset.sure; sb.textContent = 'Save recipe'; }
    keepDraft();
  });
  // A typed number out of range is put right when you leave the box.
  el.addEventListener('change', (e) => {
    const f = e.target.dataset && e.target.dataset.f;
    if (LIMITS[f]) e.target.value = clampNum(f, e.target.value);
  });

  // Leaving with unsaved typing (Back or one of the tabs) asks for a second tap first.
  const disarmLeave = () => {
    leaveArmed = false;
    const b = $('[data-back]');
    if (b) { b.textContent = '← Back'; b.style.color = ''; }
  };
  el.addEventListener('click', (e) => {
    const out = e.target.closest('.x-top a[href], [data-back]');
    if (!out) return;
    if (dirty() && !leaveArmed) {
      e.preventDefault();
      leaveArmed = true;
      msg('You haven’t saved this recipe. Tap Save, or tap again to leave without saving.', true);
      if (out.matches('[data-back]')) { out.textContent = 'Leave?'; out.style.color = '#FFB3A8'; }
      clearTimeout(armTimer);
      armTimer = setTimeout(() => { if (el.isConnected) { disarmLeave(); msg(''); } }, 5000);
      return;
    }
    if (leaveArmed) clearDraft(); // left on purpose without saving
    if (out.matches('[data-back]')) {
      e.preventDefault();
      if (history.length > 1) history.back(); else location.hash = '#/recipes/mine';
    }
  }, true);

  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.pm) {
      bump(b.dataset.pm, +b.dataset.d);
    } else if (b.dataset.meal) {
      meal = b.dataset.meal;
      el.querySelectorAll('[data-meal]').forEach((x) => x.classList.toggle('on', x === b));
      keepDraft();
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
      // Two recipes with the same name are hard to tell apart: check once, then save if they insist.
      const name = val('title').trim();
      const twin = savedRecipes().find((x) => x.title.trim().toLowerCase() === name.toLowerCase() && (!existing || x.id !== existing.id));
      if (twin && !b.dataset.sure) {
        b.dataset.sure = '1';
        b.textContent = 'Save anyway';
        $('[data-f="title"]').classList.add('bad');
        msg(`You already have a recipe called “${twin.title}”. Change the name, or tap Save anyway.`, true);
        return;
      }
      saving = true;
      try {
        const saved = saveRecipe({
          id: existing ? existing.id : '',
          title: name,
          meal,
          serves: clampNum('serves', val('serves') || 4),
          prep: clampNum('prep', val('prep')),
          cook: clampNum('cook', val('cook')),
          blurb: val('blurb').trim(),
          ingredients: lines('ingredients'),
          steps: lines('steps'),
        });
        clearTimeout(draftTimer);
        clearDraft();
        location.replace(`#/dish/${encodeURIComponent(saved.id)}`);
      } catch (err) { saving = false; msg(err.message, true); }
    } else if (b.matches('[data-delete]')) {
      if (!deleteArmed) {
        deleteArmed = true; b.textContent = 'Tap again to delete'; b.style.color = '#FFB3A8';
        clearTimeout(armTimer);
        armTimer = setTimeout(() => { if (b.isConnected) { deleteArmed = false; b.textContent = 'Delete'; b.style.color = ''; } }, 4000);
        return;
      }
      saving = true;
      // Kept for a few minutes so the My recipes list can offer "Undo".
      try { sessionStorage.setItem(UNDO_KEY, JSON.stringify({ at: Date.now(), recipe: existing })); } catch (e) { /* storage off */ }
      clearTimeout(draftTimer);
      clearDraft();
      deleteRecipe(existing.id);
      location.replace('#/recipes/mine');
    }
  });
}

export function unmount() {
  clearTimeout(armTimer);
  clearTimeout(draftTimer);
  if (stopCodes) { stopCodes(); stopCodes = null; }
}
