// Family · One recipe (#/dish/<id>): ingredients, steps, add to the week plan, cook it.
import { getRecipe, loadIndex, ingredientText, fmtMinutes, cuisineColor } from '../services/recipe-data.js';
import { weekDays, daysPlanned, addToPlan, removeFromPlan, plannedFor, MEALS, defaultMeal, isFavorite, toggleFavorite, servingsFor, scaleFor, setServings } from '../services/meal-plan.js';
import { addTimer } from '../services/timers.js';
import { esc, kitchenStyles, kitchenTop, wireBack, fillCounts } from './kitchen-ui.js';

// Set by the Week plan's "+ Add" ("2026-11-20|lunch") so the next recipe picked goes
// straight onto that day and meal.
export const ADD_DAY_KEY = 'kitchen.addDay';
const MAX_PER_MEAL = 3; // same limit as the week plan

// Ingredients ticked off while gathering them, per recipe (kept while the tablet is on).
const ticked = {};

const pending = () => { const [key, meal] = String(sessionStorage.getItem(ADD_DAY_KEY) || '').split('|'); return key ? { key, meal: meal || 'dinner' } : null; };

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
    .dz-meal{min-height:44px;padding:0 18px;border-radius:999px;border:2px solid #D9DDE2;background:#FFFFFF;font-size:16px;font-weight:600;
      font-family:Inter,sans-serif;color:#1D2430;cursor:pointer}
    .dz-meal.on{background:#1D2430;border-color:#1D2430;color:#FFFFFF}
    .dz-meal:disabled{opacity:.35;cursor:default}
    .dz-ing{cursor:pointer;min-height:44px;align-items:flex-start}
    .dz-ing.got{color:#8A93A3;text-decoration:line-through}
    .dz-ing.got::before{content:'✓';width:12px;height:auto;border-radius:0;background:none;color:#2E6B45;font-weight:700;margin-top:0;font-size:16px}
    .dz-timer{display:inline-flex;align-items:center;gap:6px;min-height:44px;margin-top:6px;padding:0 16px;border-radius:999px;border:2px solid #D9DDE2;background:#FFFFFF;
      font:600 16px Inter,sans-serif;color:#1D2430;cursor:pointer}
    .dz-timer.on{background:#2E6B45;border-color:#2E6B45;color:#FFFFFF}
    .dz-note{font-size:15px;line-height:1.35;color:#4A5363}
    .dz-note.warn{color:#B3261E;font-weight:600}
  </style>
  <div class="k-wrap" data-root>
    ${kitchenTop({ title: 'Recipe', back: 'history', backLabel: '← Back', active: 'recipes' })}
    <div class="k-empty k-scroll">Loading…</div>
  </div>`;
  const root = el.querySelector('[data-root]');
  wireBack(el, '#/recipes');

  const load = () => Promise.all([getRecipe(id), loadIndex()]).then(([r, ix]) => {
    if (!el.isConnected) return;
    if (!r) {
      root.querySelector('.k-empty').innerHTML = 'That recipe isn’t here any more.<a href="#/recipes" class="k-btn solid">Browse recipes</a>';
      return;
    }
    const cuisine = ix.cuisines.find((c) => c.id === r.cuisine) || { name: '', types: [] };
    const type = cuisine.types.find((t) => t.id === r.type);
    const p0 = pending();
    let meal = p0 ? p0.meal : defaultMeal(r.mine ? r.type : cuisine.meal);
    const mealName = (m) => MEALS.find((x) => x[0] === m)[1].toLowerCase();
    const got = ticked[r.id] || (ticked[r.id] = {});
    let note = null; // { text, warn } shown under the days after a tap that couldn't be done
    const timeLine = r.meta || [r.prep ? `${fmtMinutes(r.prep)} prep` : '', r.cook ? `${fmtMinutes(r.cook)} cook` : ''].filter(Boolean).join(' · ');
    const secsText = (secs) => (secs < 60 ? `${secs} sec` : fmtMinutes(Math.round(secs / 60)));
    const dayWord = (d) => (d.label === 'Today' || d.label === 'Tomorrow' ? d.label : d.short);
    // "Also on the week plan: Fri lunch" for the other meals (the day buttons show only the chosen meal).
    const elsewhere = () => {
      const days = weekDays();
      const out = [];
      MEALS.forEach(([m]) => {
        if (m === meal) return;
        daysPlanned(r.id, m).forEach((k) => {
          const i = days.findIndex((x) => x.key === k);
          if (i >= 0) out.push({ i, t: `${dayWord(days[i])} ${mealName(m)}` });
        });
      });
      return out.sort((a, b) => a.i - b.i).map((x) => x.t);
    };

    function render() {
      const p = pending();
      const days = weekDays();
      const on = daysPlanned(r.id, meal);
      const target = p && days.find((d) => d.key === p.key);
      root.innerHTML = `
        ${kitchenTop({ title: r.title, back: 'history', backLabel: '← Back', active: 'recipes',
          extra: `${r.mine ? `<a href="#/myrecipe/${encodeURIComponent(r.id)}" class="k-btn">Edit</a>` : ''}<button data-fav class="k-btn" style="color:#C2491F">${isFavorite(r.id) ? '♥ Saved' : '♡ Save'}</button>` })}
        <div style="flex-grow:1;min-height:0;display:grid;grid-template-columns:400px minmax(0,1fr);gap:24px">
          <div class="card" style="padding:26px 28px;display:flex;flex-direction:column;gap:12px;min-height:0">
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <a href="#/recipes/${r.cuisine}" class="k-tag" style="background:${cuisineColor(r.cuisine)};color:#fff">${esc(cuisine.name)}</a>
              ${type ? `<a href="#/recipes/${r.cuisine}/${type.id}" class="k-tag">${esc(type.name)}</a>` : ''}
              ${(r.tags || []).slice(0, 3).map((t) => `<span class="k-tag">${esc(t)}</span>`).join('')}
            </div>
            ${r.blurb ? `<div style="font-size:18px;color:#4A5363;line-height:1.35">${esc(r.blurb)}</div>` : ''}
            ${timeLine ? `<div style="font-size:17px;font-weight:600">${esc(timeLine)}</div>` : ''}
            <div style="display:flex;align-items:center;gap:10px;margin-top:4px">
              <div class="eyebrow muted" style="flex:1">Ingredients</div>
              <button class="dz-meal" data-serves="-1" aria-label="Fewer servings"${servingsFor(r) <= 1 ? ' disabled' : ''}>−</button>
              <div style="font-size:16px;font-weight:600;min-width:84px;text-align:center">Serves ${servingsFor(r)}</div>
              <button class="dz-meal" data-serves="1" aria-label="More servings"${servingsFor(r) >= 24 ? ' disabled' : ''}>+</button>
            </div>
            ${servingsFor(r) !== r.serves ? `<div class="dz-note" style="margin-top:-4px">Amounts changed for ${servingsFor(r)} (the recipe makes ${r.serves}).</div>` : ''}
            <div class="k-scroll" data-ings>${r.ingredients.map((i, n) => `<div class="dz-ing${got[n] ? ' got' : ''}" data-ing="${n}">${esc(ingredientText(i, scaleFor(r)))}</div>`).join('')}</div>
            ${r.ingredients.length > 1 ? `<div class="dz-note" style="display:flex;align-items:center;gap:10px;min-height:44px">${Object.keys(got).length
              ? `<span style="flex:1">${Object.keys(got).length} of ${r.ingredients.length} ticked off</span><button data-untick class="k-btn sm line">Untick all</button>`
              : 'Tap an ingredient to tick it off as you get it out.'}</div>` : ''}
          </div>
          <div style="display:flex;flex-direction:column;gap:20px;min-height:0;min-width:0">
            <div class="card" style="padding:26px 30px;flex-grow:1;min-height:0;display:flex;flex-direction:column;gap:10px">
              <div class="eyebrow muted">Steps · ${fmtMinutes(r.prep + r.cook)} total</div>
              <div class="k-scroll" data-steps>${r.steps.map((s, n) => `<div class="dz-step"><b>${n + 1}</b><span>${esc(s.text)}${s.timer ? `<br><button class="dz-timer" data-timer="${n}">⏱ Start ${secsText(s.timer)} timer</button>` : ''}</span></div>`).join('')}</div>
            </div>
            <div class="card" style="padding:20px 24px;display:flex;flex-direction:column;gap:14px">
              <div style="display:flex;align-items:center;gap:12px">
                <div style="font-size:18px;font-weight:600;white-space:nowrap">Plan it for</div>
                ${MEALS.map(([m, name]) => `<button class="dz-meal${m === meal ? ' on' : ''}" data-meal="${m}">${name}</button>`).join('')}
                <div style="flex:1"></div>
                <a href="#/recipe/${encodeURIComponent(r.id)}" class="k-btn dark">Cook now</a>
              </div>
              ${target && daysPlanned(r.id, p.meal).indexOf(target.key) < 0 ? `<button data-addto="${target.key}" data-addmeal="${p.meal}" class="k-btn solid" style="width:100%">Add to ${esc(target.label)} ${mealName(p.meal)}</button>` : ''}
              <div style="display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:10px">
                ${days.map((d) => `
                  <button class="dz-day${on.indexOf(d.key) >= 0 ? ' on' : ''}" data-day="${d.key}">
                    <span class="l">${d.label === 'Today' || d.label === 'Tomorrow' ? d.label : d.short}</span><span class="s">${on.indexOf(d.key) >= 0 ? '✓ Planned' : d.sub}</span>
                  </button>`).join('')}
              </div>
              ${(() => {
                if (note) return `<div class="dz-note${note.warn ? ' warn' : ''}">${esc(note.text)}</div>`;
                const other = elsewhere();
                return other.length ? `<div class="dz-note">Also on the week plan: ${esc(other.join(' · '))}</div>` : '';
              })()}
            </div>
          </div>
        </div>`;
      fillCounts(root);
    }
    render();

    root.addEventListener('click', (e) => {
      const add = e.target.closest('[data-addto]');
      if (add) {
        addToPlan(add.dataset.addto, r.id, add.dataset.addmeal);
        sessionStorage.removeItem(ADD_DAY_KEY);
        location.hash = '#/plan';
        return;
      }
      if (e.target.closest('[data-fav]')) { toggleFavorite(r.id); render(); return; }
      const ing = e.target.closest('[data-ing]');
      if (ing) {
        const n = ing.dataset.ing;
        if (got[n]) delete got[n]; else got[n] = true;
        const sc = root.querySelector('[data-ings]').scrollTop;
        render();
        root.querySelector('[data-ings]').scrollTop = sc;
        return;
      }
      if (e.target.closest('[data-untick]')) { Object.keys(got).forEach((k) => { delete got[k]; }); render(); return; }
      const tb = e.target.closest('[data-timer]');
      if (tb) {
        const st = r.steps[+tb.dataset.timer];
        const name = r.title.length > 22 ? `${r.title.slice(0, 21)}…` : r.title;
        addTimer(st.timer, `${st.timerLabel || 'Step'} · ${name}`);
        tb.classList.add('on');
        tb.textContent = '✓ Timer started';
        setTimeout(() => { if (tb.isConnected) { tb.classList.remove('on'); tb.textContent = `⏱ Start ${secsText(st.timer)} timer`; } }, 3000);
        return;
      }
      const sv = e.target.closest('[data-serves]');
      if (sv) { setServings(r, servingsFor(r) + +sv.dataset.serves); render(); return; }
      const m = e.target.closest('[data-meal]');
      if (m) { meal = m.dataset.meal; render(); return; }
      const day = e.target.closest('[data-day]');
      if (!day) return;
      const k = day.dataset.day;
      const d = weekDays().find((x) => x.key === k);
      note = null;
      if (daysPlanned(r.id, meal).indexOf(k) >= 0) removeFromPlan(k, r.id, meal);
      else if (plannedFor(k, meal).length >= MAX_PER_MEAL) {
        // The plan holds up to 3 recipes per meal; say so instead of silently doing nothing.
        note = { warn: true, text: `${d ? d.label : 'That day'} already has ${MAX_PER_MEAL} ${mealName(meal)} recipes. Take one off in Week plan first.` };
      } else addToPlan(k, r.id, meal);
      const pd = pending();
      if (pd && pd.key === k && pd.meal === meal) sessionStorage.removeItem(ADD_DAY_KEY);
      render();
    });
  }).catch((err) => {
    console.error(err);
    const box = el.isConnected && root.querySelector('.k-empty');
    if (box) box.innerHTML = 'Couldn’t load this recipe. Check the Wi-Fi.<button data-retry class="k-btn solid">Try again</button>';
  });
  root.addEventListener('click', (e) => {
    if (!e.target.closest('[data-retry]')) return;
    root.querySelector('.k-empty').textContent = 'Loading…';
    load();
  });
  load();
}

export function unmount() {}
