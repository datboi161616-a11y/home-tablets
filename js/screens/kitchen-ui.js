// Shared bits for the kitchen screens: Recipes, a recipe, Week plan, Shopping list.
import { settings } from '../config.js';
import { weekRecipeIds, shoppingCount } from '../services/meal-plan.js';
import { foodArt, foodFor } from '../art.js';

export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Food pictures for white cards: the same scenes as the Recipes tiles, on a soft halo
// (the tiles' dark halos are too heavy on white). [halo, plate shadow] per scene.
const SOFT = {
  breakfast: ['#F6E3C8', '#EBCB9A'], lunch: ['#D6E6E1', '#B5D1C8'],
  dinner: ['#F6D9C8', '#E9BFA6'], dessert: ['#F6DCE6', '#E9B9CB'],
};
/** <svg> food scene for a meal slot or a recipe ("hint" = cuisine, type and title). */
export function mealArt(meal, hint = '', style = '') {
  // foodFor reads "cake"/"bak" as dessert; pancakes, crab cakes and baked dinners aren't.
  const h = String(hint).toLowerCase().replace(/pancakes?/g, 'breakfast')
    .replace(/\b(crab|fish|salmon|rice|potato|corn) ?cakes?\b/g, '').replace(/\bbaked?\b/g, '');
  const k = foodFor(meal, h);
  const svg = foodArt[k](SOFT[k][0], SOFT[k][1]);
  return style ? svg.replace('style="display:block;', `style="display:block;${style}`) : svg;
}
/** Same, for a full recipe (its cuisine file says breakfast/lunch/desserts; your own recipes keep the meal in type). */
export const recipeArt = (r, style) => mealArt(r.mine ? r.type : r.cuisine, `${r.cuisine || ''} ${r.type || ''} ${r.title || ''}`, style);
/** Tighter framing of a food scene (just the dish and its halo), for small spots. */
export const cropFood = (svg) => svg.replace('viewBox="0 0 386 210"', 'viewBox="56 16 274 204"');
/** A picture that fills whatever room is left in a flex column (put it in a .k-art box). */
export const FILL = 'position:absolute;left:0;right:0;top:0;bottom:0;margin:auto;width:100%;height:100%;';

export function kitchenStyles() {
  const a = settings.accent;
  return `
  <style>
    .k-wrap{height:100%;padding:32px 40px 40px;display:flex;flex-direction:column;gap:22px}
    .k-top{display:flex;align-items:center;gap:16px;min-height:56px}
    .k-title{font-size:34px;font-weight:500;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .k-tabs{display:flex;gap:6px;background:#FFFFFF;border-radius:999px;padding:6px;flex:none}
    .k-tab{min-height:48px;padding:0 20px;border-radius:999px;font-size:17px;font-weight:600;display:inline-flex;align-items:center;gap:8px;color:#1D2430}
    .k-tab.on{background:#1D2430;color:#FFFFFF}
    .k-count{min-width:26px;height:26px;padding:0 8px;border-radius:999px;background:${a};color:#FFFFFF;font-size:14px;display:inline-flex;align-items:center;justify-content:center}
    .k-btn{min-height:52px;padding:0 24px;border-radius:999px;border:none;font-size:18px;font-weight:600;font-family:Inter,sans-serif;
      cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;background:#FFFFFF;color:#1D2430;flex:none;transition:transform .1s ease}
    .k-btn:active{transform:scale(.96)}
    .k-btn.solid{background:${a};color:#FFFFFF}
    .k-btn.dark{background:#1D2430;color:#FFFFFF}
    .k-btn.line{background:transparent;border:2px solid #D9DDE2}
    .k-btn.sm{min-height:44px;padding:0 16px;font-size:16px}
    .k-scroll{flex-grow:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch}
    .k-tag{display:inline-flex;align-items:center;border-radius:999px;padding:4px 12px;font-size:14px;font-weight:600;background:#F1F2F4;color:#1D2430;white-space:nowrap}
    .k-badge{display:inline-flex;align-items:center;border-radius:999px;padding:4px 12px;font-size:14px;font-weight:600;background:${a};color:#FFFFFF;white-space:nowrap}
    .k-input{min-height:56px;border-radius:999px;border:2px solid #D9DDE2;background:#FFFFFF;padding:0 24px;font-size:19px;
      font-family:Inter,sans-serif;color:#1D2430;outline:none;min-width:0}
    .k-input:focus{border-color:#1D2430}
    .k-art{position:relative;flex:1 1 0;min-height:0}
    .k-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;text-align:center;color:#4A5363;font-size:20px;padding:40px}
  </style>`;
}

/** Top bar: back link, title, and the three kitchen tabs. */
export function kitchenTop({ title, back = '#/home', backLabel = '← Home', active = '', extra = '' }) {
  const tab = (id, href, label) => `<a href="${href}" class="k-tab${active === id ? ' on' : ''}">${label}<span data-kcount="${id}" style="display:none" class="k-count"></span></a>`;
  return `
    <div class="k-top">
      ${back === 'history'
        ? `<button data-back class="k-btn">${esc(backLabel)}</button>`
        : `<a href="${back}" class="k-btn">${esc(backLabel)}</a>`}
      <div class="k-title display">${esc(title)}</div>
      ${extra}
      <nav class="k-tabs">
        ${tab('recipes', '#/recipes', 'Recipes')}
        ${tab('plan', '#/plan', 'Week plan')}
        ${tab('shopping', '#/shopping', 'Shopping list')}
      </nav>
    </div>`;
}

/** "← Back" buttons made with kitchenTop({back:'history'}) go back, or to fallback. */
export function wireBack(el, fallback) {
  el.addEventListener('click', (e) => {
    if (!e.target.closest('[data-back]')) return;
    if (history.length > 1) history.back(); else location.hash = fallback;
  });
}

/** Fill the little number badges on the Week plan / Shopping list tabs. */
export async function fillCounts(el) {
  const set = (id, n) => {
    const b = el.querySelector(`[data-kcount="${id}"]`);
    if (!b) return;
    b.textContent = n;
    b.style.display = n ? '' : 'none';
  };
  set('plan', weekRecipeIds().length);
  try { const n = await shoppingCount(); if (el.isConnected) set('shopping', n); } catch (e) { /* offline */ }
}
