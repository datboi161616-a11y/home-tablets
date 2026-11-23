// Kitchen · One recipe (#/dish/<id>): "the plate from above".
// The dish, painted from above, turns slowly on its table beside the recipe. A recipe from the
// web (web-recipes.js) has its real photo in the plate instead, and its site's name as a
// label (nothing opens outside: this is a kitchen screen). Servings are
// little plates you tap, every ingredient is a chip that goes on the shopping list with a
// tap, and each person at home has a heart to give. The steps and the week plan open as
// sheets from the buttons at the bottom; "Start cooking" goes to cooking mode.
import { getRecipe, loadIndex, ingredientText, fmtMinutes, withStepTimers, lastCooked, cookedWhen, cookingProgress, lovedBy, toggleLove, clearLoves } from '../services/recipe-data.js';
import { planDays, addToPlan, removeFromPlan, plannedFor, MEALS, defaultMeal, isFavorite, toggleFavorite, servingsFor, scaleFor, setServings, addExtra, removeExtra,
  weekRecipeIds, getListState, splitQty, dayKey } from '../services/meal-plan.js';
import { addTimer, MAX } from '../services/timers.js';
import { keepWebRecipe, entryOf } from '../services/web-recipes.js';
import { esc, plateArt, tableColors } from './kitchen-ui.js';
import { people } from './ui.js';

// Set by the Week plan's "+ Add" ("2026-11-20|lunch") so the next recipe picked goes
// straight onto that day and meal.
export const ADD_DAY_KEY = 'kitchen.addDay';
const MAX_PER_MEAL = 3; // same limit as the week plan
const MOST_PLATES = 12; // little plates in the servings row (more than that is a number)

const pending = () => { const [key, meal] = String(sessionStorage.getItem(ADD_DAY_KEY) || '').split('|'); return key ? { key, meal: meal || 'dinner' } : null; };

// How the shopping list names one of its own items: the words without "2 x" in front.
const listKey = (t) => splitQty(String(t || '').slice(0, 60)).text.slice(0, 60).toLowerCase().replace(/\s+/g, ' ').trim();
// Tap water, salt and pepper aren't things anyone needs reminding to buy.
const NO_NEED = /^(water|ice|hot water|cold water|warm water|salt|black pepper|salt and pepper|kosher salt)$/i;

const STYLES = `
  <style>
    .dz{height:100%;position:relative;overflow:hidden;color:#FFF4EA;font-family:Inter,system-ui,sans-serif}
    .dz-plate{position:absolute;left:-96px;top:64px;width:700px;height:700px;will-change:transform;animation:dz-spin 180s linear infinite}
    @keyframes dz-spin{to{transform:rotate(360deg)}}
    .dz-back{position:absolute;left:40px;top:32px}
    .dz-col{position:absolute;left:624px;right:40px;top:32px;bottom:32px;display:flex;flex-direction:column;gap:12px}
    .dz-row{display:flex;align-items:center;gap:10px;flex:none}
    .dz-pill{min-height:56px;padding:0 20px;border-radius:999px;background:rgba(30,12,4,.34);color:#FFF4EA;display:inline-flex;align-items:center;
      font:600 17px Inter,sans-serif;text-decoration:none;border:0;cursor:pointer;flex:none;white-space:nowrap}
    .dz-heart{width:56px;height:56px;border-radius:50%;border:0;background:#FFF4EA;color:#B5532F;font-size:28px;line-height:1;cursor:pointer;flex:none;
      display:flex;align-items:center;justify-content:center}
    .dz-heart.off{background:rgba(30,12,4,.34);color:#FFF4EA}
    .dz-eyebrow{font:600 15px Inter,sans-serif;letter-spacing:2px;text-transform:uppercase;color:#FFD696}
    .dz-title{font:700 54px/1.02 Outfit,sans-serif;margin:-2px 0 0;flex:none;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
    .dz-stats{display:flex;gap:8px;flex:none}
    .dz-stat{flex:1;min-width:0;padding:9px 14px;border-radius:18px;background:rgba(30,12,4,.3)}
    .dz-stat .l{font:600 15px Inter,sans-serif;letter-spacing:1px;color:#FFD6BC;text-transform:uppercase}
    .dz-stat .v{font:500 23px Outfit,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .dz-serve{display:flex;align-items:center;gap:6px;padding:8px;border-radius:22px;background:#FFF4EA;color:#5A2412;flex:none}
    .dz-pm{width:60px;height:60px;border-radius:16px;border:0;background:#F4DCCB;color:#5A2412;font:700 32px Outfit,sans-serif;cursor:pointer;flex:none}
    .dz-pm[disabled]{opacity:.35}
    .dz-plates{flex:1;min-width:0;display:flex;flex-direction:column;align-items:center}
    .dz-dots{display:flex;justify-content:center}
    .dz-dot{width:32px;height:38px;border:0;background:transparent;padding:0;cursor:pointer;display:flex;align-items:center;justify-content:center}
    .dz-dot i{width:22px;height:22px;border-radius:50%;background:#F4E6DA;box-shadow:inset 0 0 0 2px #E2C9B4;display:block}
    .dz-dot.on i{background:#E8B45E;box-shadow:inset 0 0 0 5px #F6DDA8,inset 0 0 0 6px #D79B43}
    .dz-serves{font:600 18px Inter,sans-serif;margin-top:-2px;display:flex;align-items:center;gap:10px}
    .dz-reset{border:0;background:transparent;color:#A0471F;font:600 16px Inter,sans-serif;text-decoration:underline;cursor:pointer;padding:6px 4px}
    .dz-inghead{display:flex;align-items:baseline;gap:12px;flex:none;margin-top:2px}
    .dz-note{font:500 16px/1.3 Inter,sans-serif;color:#FFE6D6;flex:1;min-width:0;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .dz-chips{flex:1 1 0;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;display:flex;flex-wrap:wrap;align-content:flex-start;margin:-2px -8px 0 0}
    .dz-chip{min-height:56px;max-width:100%;padding:6px 16px;margin:0 8px 8px 0;border-radius:16px;border:2px dashed #FFD696;background:transparent;color:#FFE6C0;
      font:500 18px/1.2 Inter,sans-serif;text-align:left;cursor:pointer;display:inline-flex;align-items:center;gap:8px}
    .dz-chip b{font:700 20px Outfit,sans-serif;flex:none}
    .dz-chip.on{border:2px solid transparent;background:rgba(255,244,234,.2);color:#FFFFFF}
    .dz-chip.on b{color:#B9F0B4}
    .dz-chip:active,.dz-pill:active,.dz-go:active,.dz-face:active{transform:scale(.97)}
    .dz-loves{display:flex;align-items:center;gap:8px;flex:none;min-height:56px}
    .dz-face{position:relative;width:56px;height:56px;border-radius:50%;border:2px dashed rgba(255,244,234,.6);background:transparent;color:#FFF4EA;
      font:600 22px Outfit,sans-serif;cursor:pointer;flex:none;padding:0}
    .dz-face.on{border:3px solid #FFF4EA}
    .dz-face i{position:absolute;right:-5px;bottom:-5px;width:24px;height:24px;border-radius:50%;background:#FFF4EA;color:#C2371F;font:normal 15px/24px Inter,sans-serif;text-align:center;display:none}
    .dz-face.on i{display:block}
    .dz-lovetext{font-size:17px;line-height:1.3;color:#FFE6D6;min-width:0;margin-left:6px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
    .dz-foot{display:flex;gap:10px;flex:none}
    .dz-go{position:relative;flex:1;min-width:0;min-height:76px;border-radius:22px;background:#FFF4EA;color:#7A2F16;display:flex;align-items:center;justify-content:center;
      text-decoration:none;font:700 25px Outfit,sans-serif;border:0;cursor:pointer;padding:0 18px;white-space:nowrap}
    .dz-go::after{content:'';position:absolute;top:0;left:0;right:0;bottom:0;border-radius:22px;border:3px solid #FFD696;animation:dz-pulse 3s ease-out infinite;pointer-events:none}
    @keyframes dz-pulse{0%{transform:scale(1);opacity:.9}70%,100%{transform:scale(1.06,1.22);opacity:0}}
    .dz-side{min-height:76px;padding:0 20px;border-radius:22px;background:rgba(30,12,4,.4);color:#FFF4EA;display:flex;align-items:center;justify-content:center;
      font:600 19px Inter,sans-serif;border:0;cursor:pointer;flex:none;text-decoration:none;white-space:nowrap}
    .dz-side.hot{background:#FFD696;color:#5A2412}
    .dz-empty{position:absolute;left:624px;right:40px;top:0;bottom:0;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:20px;font-size:24px;line-height:1.35}
    /* The sheets: the steps, and the days of the week plan */
    .dz-sheet{position:absolute;top:0;left:0;right:0;bottom:0;z-index:3;background:rgba(20,8,4,.66);display:flex;justify-content:flex-end}
    .dz-panel{width:760px;height:100%;background:#FFF4EA;color:#3A1D10;padding:28px 32px 32px;display:flex;flex-direction:column;gap:14px}
    .dz-panel h2{font:500 34px Outfit,sans-serif;margin:0;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .dz-panel .sub{font-size:17px;color:#7A5646;line-height:1.35}
    .dz-btn{min-height:56px;padding:0 22px;border-radius:999px;border:0;background:#F4DCCB;color:#5A2412;font:600 18px Inter,sans-serif;cursor:pointer;flex:none;
      display:inline-flex;align-items:center;justify-content:center;text-decoration:none;white-space:nowrap}
    .dz-btn.on,.dz-btn.dark{background:#5A2412;color:#FFF4EA}
    .dz-btn[disabled]{opacity:.35}
    .dz-steps{flex:1 1 0;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch}
    .dz-step{display:flex;gap:16px;font-size:20px;line-height:1.4;padding:10px 0}
    .dz-step>b{flex:none;width:40px;height:40px;border-radius:50%;background:#F4DCCB;display:flex;align-items:center;justify-content:center;font:600 18px Outfit,sans-serif}
    .dz-timer{display:inline-flex;align-items:center;gap:6px;min-height:56px;margin-top:8px;padding:0 20px;border-radius:999px;border:2px solid #E2C9B4;background:#FFFFFF;
      font:600 17px Inter,sans-serif;color:#3A1D10;cursor:pointer}
    .dz-timer.on{background:#2E6B45;border-color:#2E6B45;color:#FFFFFF}
    .dz-timer.full{border-color:#B3261E;color:#B3261E}
    .dz-days{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px}
    .dz-day{min-height:92px;border-radius:18px;border:0;background:#F4DCCB;color:#5A2412;display:flex;flex-direction:column;align-items:center;justify-content:center;
      gap:4px;font-family:Inter,sans-serif;cursor:pointer;padding:0 4px}
    .dz-day .l{font-size:17px;font-weight:600}
    .dz-day .s{font-size:15px;opacity:.8}
    .dz-day.on{background:#5A2412;color:#FFF4EA}
    .dz-warn{color:#B3261E;font-weight:600}
    @media (prefers-reduced-motion: reduce){.dz-plate,.dz-go::after{animation:none}}
  </style>`;

export function mount(el, { args = [] } = {}) {
  const id = args[0];
  el.innerHTML = `${STYLES}
  <div class="dz" data-root style="background:#8E3C20">
    <div class="dz-empty" data-wait>Loading…</div>
    <button data-back class="x-btn glass dz-back">← Back</button>
  </div>`;
  const root = el.querySelector('[data-root]');
  const goBack = () => { if (history.length > 1) history.back(); else location.hash = '#/recipes'; };
  root.addEventListener('click', (e) => { if (e.target.closest('[data-back]')) goBack(); });

  const load = () => Promise.all([getRecipe(id), loadIndex()]).then(([r0, ix]) => {
    if (!el.isConnected) return;
    if (!r0) {
      root.querySelector('[data-wait]').innerHTML = 'That recipe isn’t here any more.<a href="#/recipes" class="x-btn white">Browse recipes</a>';
      return;
    }
    // Steps that say "rest 10 minutes" get a timer button too.
    const r = withStepTimers(r0);
    const cuisine = ix.cuisines.find((c) => c.id === r.cuisine) || { name: '', types: [] };
    const type = cuisine.types.find((t) => t.id === r.type);
    const p0 = pending();
    let meal = p0 ? p0.meal : defaultMeal(r.mine || r.web ? r.type : cuisine.meal);
    // Hearted or planned: a web recipe is kept on the screen for good.
    const keep = () => { if (r.web) keepWebRecipe(entryOf(r)); };
    const mealName = (m) => MEALS.find((x) => x[0] === m)[1].toLowerCase();
    let note = null; // { text, warn } shown in the plan sheet after a tap that couldn't be done
    let listNote = ''; // what the last tap did to the shopping list
    let sheet = ''; // '' | 'steps' | 'plan'
    const there = {}; // ingredients the list said it had already (another planned recipe needs them)
    const total = (r.prep || 0) + (r.cook || 0);
    const cooked = lastCooked(r.id);
    const secsText = (secs) => (secs < 60 ? `${secs} sec` : fmtMinutes(Math.round(secs / 60)));
    // Next week's days say their date too ("Mon Nov 30"): "Mon" alone would mean this week.
    const dayWord = (d) => (d.label === 'Today' || d.label === 'Tomorrow' ? d.label : d.n >= 7 ? `${d.short} ${d.sub}` : d.short);
    // Both weeks the plan holds: today and the next six, then the seven after (meal-plan.js).
    const bothWeeks = () => planDays(0).concat(planDays(1));
    // The days (of those) a meal has this recipe on.
    const plannedOn = (days, m) => days.filter((d) => plannedFor(d.key, m).indexOf(r.id) >= 0).map((d) => d.key);
    // Which week the day buttons show: this one, or next ("Next week ▸").
    // (Sent here by the Week plan's "+ Add" for a day next week: start on that week.)
    let page = p0 && planDays(1).some((d) => d.key === p0.key) ? 1 : 0;
    // Every place the plan has it, in order: "Thu dinner · Mon Nov 30 lunch".
    const allPlanned = (skipMeal) => {
      const days = bothWeeks();
      const out = [];
      MEALS.forEach(([m]) => {
        if (m === skipMeal) return;
        plannedOn(days, m).forEach((k) => {
          const i = days.findIndex((x) => x.key === k);
          out.push({ i, t: `${dayWord(days[i])} ${mealName(m)}` });
        });
      });
      return out.sort((a, b) => a.i - b.i).map((x) => x.t);
    };

    // ---- The scene: the table, the plate (it keeps turning while the rest redraws) ----
    const tc = tableColors(r.table || r.cuisine);
    root.style.background = `radial-gradient(ellipse 700px 600px at 26% 56%, ${tc[0]} 0%, ${tc[1]} 55%, ${tc[2]} 100%)`;
    root.innerHTML = `
      <div class="dz-plate">${plateArt(r, 700, { detail: true })}</div>
      <button data-back class="x-btn glass dz-back">← Back</button>
      <div class="dz-col" data-col></div>
      <div data-sheet></div>`;
    const col = root.querySelector('[data-col]');
    const sheetBox = root.querySelector('[data-sheet]');

    // ---- What is on the shopping list already ----
    const onPlan = () => weekRecipeIds().indexOf(r.id) >= 0;
    const ingText = (n) => ingredientText(r.ingredients[n], scaleFor(r));
    const listed = () => { const m = {}; getListState().extras.forEach((x) => { if (!x.got) m[listKey(x.text)] = x.id; }); return m; };
    const skip = (ing) => typeof ing !== 'string' && NO_NEED.test(String(ing.item).trim());

    function renderCol() {
      const p = pending();
      const target = p && bothWeeks().find((d) => d.key === p.key);
      const canAdd = target && plannedFor(target.key, p.meal).indexOf(r.id) < 0;
      const serves = servingsFor(r);
      const who = people();
      const loves = lovedBy(r.id);
      const fav = isFavorite(r.id);
      const prog = cookingProgress(r.id);
      const planned = allPlanned('');
      const tonightOn = plannedFor(dayKey(new Date()), 'dinner').indexOf(r.id) >= 0;
      const eyebrow = [tonightOn ? 'Tonight’s dinner' : planned.length ? `On the plan · ${planned[0]}${planned.length > 1 ? ` +${planned.length - 1}` : ''}` : '']
        .concat(tonightOn || planned.length ? [] : (r.tags || []).filter((t) => t !== 'kid-friendly').slice(0, 1)).filter(Boolean).join(' · ');
      const titleSize = r.title.length <= 20 ? 58 : r.title.length <= 34 ? 50 : r.title.length <= 48 ? 42 : 36;
      const stats = r.meta ? [['Time', r.meta]] : [total ? ['Total', fmtMinutes(total)] : null, r.prep ? ['Prep', fmtMinutes(r.prep)] : null, r.cook ? ['Cook', fmtMinutes(r.cook)] : null].filter(Boolean);
      const dots = Math.min(MOST_PLATES, Math.max(8, serves, r.serves || 0));
      const on = listed();
      const whole = onPlan();
      const state = r.ingredients.map((ing, n) => (whole || there[n] || on[listKey(ingText(n))] ? 'on' : ''));
      const missing = r.ingredients.filter((ing, n) => !state[n] && !skip(ing)).length;
      const names = loves.length === 1 ? loves[0] : loves.length === 2 ? `${loves[0]} and ${loves[1]}` : loves.length ? `${loves.slice(0, -1).join(', ')} and ${loves[loves.length - 1]}` : '';
      const loveText = [names ? `${names} ${loves.length === 1 ? 'loves' : 'love'} it` : '',
        cooked ? `last cooked ${cookedWhen(cooked)}` : ''].filter(Boolean).join(' · ');
      const faces = who.map((x) => `<button class="dz-face${loves.indexOf(x.name) >= 0 ? ' on' : ''}" data-love="${esc(x.name)}" aria-label="${esc(x.name)}"${loves.indexOf(x.name) >= 0 ? ` style="background:${x.color}"` : ''}>${esc(x.initial)}<i>♥</i></button>`).join('');
      const sc = (col.querySelector('[data-chips]') || {}).scrollTop || 0;
      col.innerHTML = `
        <div class="dz-row">
          ${r.web ? `<span class="dz-pill">${esc(r.site)}</span>` : ''}
          ${cuisine.name ? `<a href="#/recipes/${r.cuisine}" class="dz-pill">${esc(cuisine.name)}</a>` : ''}
          ${type ? `<a href="#/recipes/${r.cuisine}/${type.id}" class="dz-pill">${esc(type.name)}</a>` : ''}
          <div style="flex:1"></div>
          ${who.length <= 3 ? faces : ''}
          ${r.mine ? `<a href="#/myrecipe/${encodeURIComponent(r.id)}" class="dz-pill">Edit</a>` : ''}
          <button data-fav class="dz-heart${fav ? '' : ' off'}" aria-label="${fav ? 'Take out of favorites' : 'Save to favorites'}">${fav ? '♥' : '♡'}</button>
        </div>
        <div class="dz-inghead" style="margin:0">
          <div class="dz-eyebrow" style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(eyebrow)}</div>
          ${who.length <= 3 && loveText ? `<div class="dz-note" style="flex:none;max-width:62%">${esc(loveText)}</div>` : ''}
        </div>
        <div class="dz-title" style="font-size:${titleSize}px">${esc(r.title)}</div>
        <div class="dz-stats">${stats.map(([l, v]) => `<div class="dz-stat"><div class="l">${l}</div><div class="v">${esc(v)}</div></div>`).join('')}</div>
        <div class="dz-serve">
          <button class="dz-pm" data-serves="-1" aria-label="Fewer servings"${serves <= 1 ? ' disabled' : ''}>−</button>
          <div class="dz-plates">
            <div class="dz-dots">${Array.from({ length: dots }, (_, n) => `<button class="dz-dot${n < serves ? ' on' : ''}" data-plates="${n + 1}" aria-label="Serves ${n + 1}"><i></i></button>`).join('')}</div>
            <div class="dz-serves">Serves ${serves}${serves !== r.serves ? `<button data-sreset class="dz-reset">Reset to ${r.serves}</button>` : ''}</div>
          </div>
          <button class="dz-pm" data-serves="1" aria-label="More servings"${serves >= 24 ? ' disabled' : ''}>+</button>
        </div>
        <div class="dz-inghead">
          <div class="dz-eyebrow">${r.ingredients.length} ingredient${r.ingredients.length === 1 ? '' : 's'}</div>
          <div class="dz-note">${esc(listNote)}</div>
        </div>
        <div class="dz-chips" data-chips>${r.ingredients.length
          ? r.ingredients.map((ing, n) => `<button class="dz-chip${state[n] ? ' on' : ''}" data-ing="${n}"><b>${state[n] ? '✓' : '+'}</b>${esc(ingText(n))}</button>`).join('')
          : '<div style="font-size:18px;color:#FFE6D6">This recipe doesn’t list its ingredients.</div>'}</div>
        ${who.length > 3 ? `<div class="dz-loves">${faces}<div class="dz-lovetext">${esc(loveText)}</div></div>` : ''}
        <div class="dz-foot">
          ${canAdd ? `<button data-addto="${target.key}" data-addmeal="${p.meal}" class="dz-go">Add to ${esc(target.n >= 7 ? `${target.short} ${target.sub}` : target.label)} ${mealName(p.meal)}</button>
            <a href="#/recipe/${encodeURIComponent(r.id)}" class="dz-side">${prog ? `Step ${prog.step}` : 'Cook now'}</a>`
            : `<a href="#/recipe/${encodeURIComponent(r.id)}" class="dz-go">${prog ? `Continue · step ${prog.step}` : 'Start cooking'}</a>`}
          <button data-open="steps" class="dz-side">Steps</button>
          <button data-open="plan" class="dz-side">${planned.length ? '✓ Planned' : 'Plan it'}</button>
          ${missing && !whole ? `<button data-tolist class="dz-side hot">+ ${missing === r.ingredients.length ? 'All' : missing} to list</button>` : ''}
        </div>`;
      const chips = col.querySelector('[data-chips]');
      if (chips) chips.scrollTop = sc;
    }

    function renderSheet() {
      if (!sheet) { sheetBox.innerHTML = ''; return; }
      const sc = (sheetBox.querySelector('.dz-steps') || {}).scrollTop || 0;
      if (sheet === 'steps') {
        sheetBox.innerHTML = `<div class="dz-sheet" data-shut><div class="dz-panel">
          <div class="dz-row"><h2>${r.steps.length} step${r.steps.length === 1 ? '' : 's'}${total ? ` · ${fmtMinutes(total)} in all` : ''}</h2><button data-shut class="dz-btn dark">Close</button></div>
          ${servingsFor(r) !== r.serves ? `<div class="sub">Amounts in the steps are for ${r.serves}.</div>` : ''}
          <div class="dz-steps">${r.steps.map((s, n) => `<div class="dz-step"><b>${n + 1}</b><span>${esc(s.text)}${s.timer ? `<br><button class="dz-timer" data-timer="${n}">⏱ Start ${secsText(s.timer)} timer</button>` : ''}</span></div>`).join('')}</div>
          <div class="dz-row">
            <a href="#/recipe/${encodeURIComponent(r.id)}" class="dz-btn dark" style="flex:1;min-height:64px;font-size:20px">Start cooking</a>
            ${r.mine ? '' : `<a href="#/myrecipe/from/${encodeURIComponent(r.id)}" class="dz-btn" style="min-height:64px">Make my version</a>`}
          </div>
        </div></div>`;
        sheetBox.querySelector('.dz-steps').scrollTop = sc;
        return;
      }
      const p = pending();
      const days = planDays(page);
      const on = plannedOn(days, meal);
      const target = p && bothWeeks().find((d) => d.key === p.key);
      const otherWeek = plannedOn(planDays(1 - page), meal).length;
      const other = allPlanned(meal);
      sheetBox.innerHTML = `<div class="dz-sheet" data-shut><div class="dz-panel">
        <div class="dz-row"><h2>Plan “${esc(r.title)}”</h2><button data-shut class="dz-btn dark">Done</button></div>
        <div class="dz-row">${MEALS.map(([m, name]) => `<button class="dz-btn${m === meal ? ' on' : ''}" data-meal="${m}" style="flex:1">${name}</button>`).join('')}</div>
        ${target && plannedFor(target.key, p.meal).indexOf(r.id) < 0 ? `<button data-addto="${target.key}" data-addmeal="${p.meal}" class="dz-btn dark" style="min-height:64px;font-size:20px">Add to ${esc(target.n >= 7 ? `${target.label} ${target.sub}` : target.label)} ${mealName(p.meal)}</button>` : ''}
        <div class="dz-days">
          ${days.map((d) => `
            <button class="dz-day${on.indexOf(d.key) >= 0 ? ' on' : ''}" data-day="${d.key}">
              <span class="l">${d.label === 'Today' ? 'Today' : d.short}</span><span class="s">${on.indexOf(d.key) >= 0 ? '✓ Planned' : d.sub}</span>
            </button>`).join('')}
        </div>
        <div class="dz-row" style="min-height:56px">
          <div class="sub${note && note.warn ? ' dz-warn' : ''}" style="flex:1;min-width:0">${note ? esc(note.text) : other.length ? `Also on the week plan: ${esc(other.join(' · '))}` : ''}</div>
          <button data-page class="dz-btn">${page ? '◂ This week' : 'Next week ▸'}${otherWeek ? ` · ${otherWeek} planned` : ''}</button>
        </div>
        <div style="flex:1"></div>
        <a href="#/plan" class="dz-btn" style="min-height:64px">Open the week plan</a>
      </div></div>`;
    }
    const render = () => { renderCol(); renderSheet(); };
    render();

    root.addEventListener('click', (e) => {
      // A sheet closes on its Close button, or a tap on the dark part beside it.
      const shut = e.target.closest('[data-shut]');
      if (shut && (shut.tagName === 'BUTTON' || e.target === shut)) { sheet = ''; note = null; render(); return; }
      const open = e.target.closest('[data-open]');
      if (open) { sheet = open.dataset.open; renderSheet(); return; }
      const add = e.target.closest('[data-addto]');
      if (add) {
        addToPlan(add.dataset.addto, r.id, add.dataset.addmeal);
        keep();
        sessionStorage.removeItem(ADD_DAY_KEY);
        location.hash = '#/plan';
        return;
      }
      if (e.target.closest('[data-fav]')) {
        // Out of the favourites: nobody's heart stays on it.
        if (!toggleFavorite(r.id)) clearLoves(r.id);
        else keep();
        renderCol();
        return;
      }
      const love = e.target.closest('[data-love]');
      if (love) {
        // A heart from anyone makes it a favourite (the Favorites list is everybody's).
        const now = toggleLove(r.id, love.dataset.love);
        if (now.length && !isFavorite(r.id)) { toggleFavorite(r.id); keep(); }
        renderCol();
        return;
      }
      const ing = e.target.closest('[data-ing]');
      if (ing) {
        const n = +ing.dataset.ing;
        const text = ingText(n);
        if (onPlan()) listNote = 'On the week plan: the list has these already.';
        else {
          const had = listed()[listKey(text)];
          if (had) { removeExtra(had); delete there[n]; listNote = ''; }
          else if (there[n]) listNote = 'Already on the list for another planned meal.';
          else {
            const res = addExtra(text);
            if (res === 'there' || (res === 'back' && !listed()[listKey(text)])) there[n] = true;
            listNote = res === 'added' || res === 'back' ? '' : res === 'unsaved' ? 'Couldn’t save it: this screen’s storage is full.' : 'Already on the shopping list.';
          }
        }
        renderCol();
        return;
      }
      if (e.target.closest('[data-sreset]')) { setServings(r, r.serves); listNote = ''; render(); return; }
      if (e.target.closest('[data-tolist]')) {
        // A recipe on this week's plan is on the shopping list already, amounts and all.
        if (onPlan()) {
          listNote = 'On the week plan: the list has these already.';
        } else {
          let added = 0;
          let had = 0;
          const on = listed();
          r.ingredients.forEach((x, n) => {
            if (skip(x) || there[n] || on[listKey(ingText(n))]) return;
            const res = addExtra(ingText(n));
            if (res === 'added' || res === 'back') added++; else if (res === 'there') { had++; there[n] = true; }
          });
          listNote = added ? (had ? `${had} ${had === 1 ? 'was' : 'were'} on the list already.` : '')
            : 'All on the shopping list already.';
        }
        renderCol();
        return;
      }
      const tb = e.target.closest('[data-timer]');
      if (tb) {
        const st = r.steps[+tb.dataset.timer];
        const name = r.title.length > 22 ? `${r.title.slice(0, 21)}…` : r.title;
        const ok = addTimer(st.timer, `${st.timerLabel || 'Step'} · ${name}`);
        // All the kitchen timers busy: say so, instead of claiming one started.
        if (ok === false) {
          tb.classList.add('full');
          tb.textContent = `All ${MAX} timers are in use.`;
        } else {
          tb.classList.add('on');
          tb.textContent = '✓ Timer started';
        }
        setTimeout(() => {
          if (!tb.isConnected) return;
          tb.classList.remove('on'); tb.classList.remove('full');
          tb.textContent = `⏱ Start ${secsText(st.timer)} timer`;
        }, ok === false ? 5000 : 3000);
        return;
      }
      const sv = e.target.closest('[data-serves]');
      if (sv) { setServings(r, servingsFor(r) + +sv.dataset.serves); listNote = ''; renderCol(); return; }
      const pl = e.target.closest('[data-plates]');
      if (pl) { setServings(r, +pl.dataset.plates); listNote = ''; renderCol(); return; }
      const m = e.target.closest('[data-meal]');
      if (m) { meal = m.dataset.meal; note = null; renderSheet(); return; }
      if (e.target.closest('[data-page]')) { page = 1 - page; note = null; renderSheet(); return; }
      const day = e.target.closest('[data-day]');
      if (!day) return;
      const k = day.dataset.day;
      const d = bothWeeks().find((x) => x.key === k);
      note = null;
      if (plannedFor(k, meal).indexOf(r.id) >= 0) removeFromPlan(k, r.id, meal);
      else if (plannedFor(k, meal).length >= MAX_PER_MEAL) {
        // The plan holds up to 3 recipes per meal; say so instead of silently doing nothing.
        note = { warn: true, text: `${d ? dayWord(d) : 'That day'} already has ${MAX_PER_MEAL} ${mealName(meal)} recipes. Take one off in Week plan first.` };
      } else { addToPlan(k, r.id, meal); keep(); }
      const pd = pending();
      if (pd && pd.key === k && pd.meal === meal) sessionStorage.removeItem(ADD_DAY_KEY);
      render();
    });
  }).catch((err) => {
    console.error(err);
    const box = el.isConnected && root.querySelector('[data-wait]');
    if (box) box.innerHTML = 'Couldn’t load this recipe. Check the Wi-Fi.<button data-retry class="x-btn white">Try again</button>';
  });
  root.addEventListener('click', (e) => {
    if (!e.target.closest('[data-retry]')) return;
    root.querySelector('[data-wait]').textContent = 'Loading…';
    load();
  });
  load();
}

export function unmount() {}
