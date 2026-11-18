// This tablet's week plan and shopping list. Saved on this tablet only (localStorage).
//
// Plan:  { '2026-11-18': { breakfast: [ids], lunch: [ids], dinner: ['chinese-dan-dan-noodles'] }, ... }
// List:  { have: {item: true|false}, got: {item: true}, extras: [{id, text, got}] }
//   have[item] = "we already have it" (left off the list). Pantry basics like salt and
//   oil start as "have" until someone says they need them.
import { getRecipe, cachedRecipe, loadIndex, fmtQty, unitText } from './recipe-data.js';

const PLAN_KEY = 'kitchen.plan.v1';
const LIST_KEY = 'kitchen.list.v1';
const FAV_KEY = 'kitchen.favorites.v1';
const SERVES_KEY = 'kitchen.servings.v1';

const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || 'null') || d; } catch (e) { return d; } };
const write = (k, v) => { localStorage.setItem(k, JSON.stringify(v)); window.dispatchEvent(new Event('kitchen-changed')); };

export function onKitchenChanged(cb) {
  window.addEventListener('kitchen-changed', cb);
  return () => window.removeEventListener('kitchen-changed', cb);
}

// ---- Days ---------------------------------------------------------------------
const pad = (n) => String(n).padStart(2, '0');
export const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** The 7 days the plan shows: today and the next six. */
export function weekDays(from = new Date()) {
  const out = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
    out.push({
      key: dayKey(d), date: d,
      label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString('en-US', { weekday: 'long' }),
      short: d.toLocaleDateString('en-US', { weekday: 'short' }),
      sub: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    });
  }
  return out;
}

// ---- Plan -----------------------------------------------------------------------
// Each day has three meals: { breakfast: [ids], lunch: [ids], dinner: [ids] }.
export const MEALS = [['breakfast', 'Breakfast'], ['lunch', 'Lunch'], ['dinner', 'Dinner']];
const MEAL_IDS = MEALS.map((m) => m[0]);
const MAX_PER_MEAL = 3;

/** The meal a recipe goes to by default (from its section of the library). */
export const defaultMeal = (section) => (section === 'breakfast' || section === 'lunch' ? section : 'dinner');

export function getPlan() {
  const plan = read(PLAN_KEY, {});
  // Forget days more than a week old.
  const cutoff = dayKey(new Date(Date.now() - 8 * 86400000));
  Object.keys(plan).forEach((k) => {
    let d = plan[k];
    if (Array.isArray(d)) d = { dinner: d }; // plans saved before meals existed were all dinners
    if (k < cutoff || !d || typeof d !== 'object') { delete plan[k]; return; }
    const day = {};
    MEAL_IDS.forEach((m) => { day[m] = Array.isArray(d[m]) ? d[m] : []; });
    plan[k] = day;
  });
  return plan;
}
const emptyDay = () => ({ breakfast: [], lunch: [], dinner: [] });
/** Ids planned for one meal of one day. */
export const plannedFor = (key, meal = 'dinner') => (getPlan()[key] || emptyDay())[meal];
/** Every id planned on a day, breakfast first. */
export const dayIds = (plan, key) => { const d = plan[key] || emptyDay(); return [].concat(d.breakfast, d.lunch, d.dinner); };

export function addToPlan(key, id, meal = 'dinner') {
  const plan = getPlan();
  const day = plan[key] || emptyDay();
  if (day[meal].indexOf(id) < 0 && day[meal].length < MAX_PER_MEAL) day[meal].push(id);
  plan[key] = day;
  write(PLAN_KEY, plan);
}
export function removeFromPlan(key, id, meal = 'dinner') {
  const plan = getPlan();
  const day = plan[key] || emptyDay();
  day[meal] = day[meal].filter((x) => x !== id);
  plan[key] = day;
  if (!dayIds(plan, key).length) delete plan[key];
  write(PLAN_KEY, plan);
}
/** Days this week a recipe is planned for a meal, e.g. ['2026-11-18'] */
export function daysPlanned(id, meal = 'dinner') {
  const plan = getPlan();
  return weekDays().map((d) => d.key).filter((k) => plan[k] && plan[k][meal].indexOf(id) >= 0);
}
/** Recipe ids planned this week, in day order (repeats kept: cooked twice = buy twice). */
export function weekRecipeIds() {
  const plan = getPlan();
  const ids = [];
  weekDays().forEach((d) => dayIds(plan, d.key).forEach((id) => ids.push(id)));
  return ids;
}

/** Tonight: the first dinner planned for today, else the daily idea. */
export async function tonight() {
  const ids = plannedFor(dayKey(new Date()), 'dinner');
  const ix = await loadIndex();
  for (const id of ids) if (ix.byId[id]) return { entry: ix.byId[id], planned: true };
  const { dinnerIdea } = await import('./recipe-data.js');
  const e = await dinnerIdea();
  return e ? { entry: e, planned: false } : null;
}

// ---- Shopping list ----------------------------------------------------------------
const AISLES = [
  ['produce', 'Produce'], ['meat', 'Meat'], ['seafood', 'Seafood'], ['dairy', 'Dairy & eggs'],
  ['bakery', 'Bakery'], ['frozen', 'Frozen'], ['canned', 'Canned goods'], ['pantry', 'Pantry'],
  ['international', 'International'], ['spices', 'Spices & seasonings'], ['beverages', 'Drinks'],
];
// Most kitchens already have these; they start in "Already have".
const STAPLES = ['salt', 'black pepper', 'olive oil', 'vegetable oil', 'cooking spray', 'sugar', 'all-purpose flour'];
const SKIP = ['water', 'ice', 'hot water', 'cold water', 'warm water', 'boiling water', 'ice water'];

const VOL = { tsp: 1, tbsp: 3, cup: 48, pint: 96, quart: 192 }; // in teaspoons
const WT = { oz: 1, lb: 16 }; // in ounces

export function getListState() {
  const s = read(LIST_KEY, {});
  return { have: s.have || {}, got: s.got || {}, extras: s.extras || [] };
}
const saveList = (s) => write(LIST_KEY, s);

// Same thing, different words: merged into one line on the list.
const ALIASES = {
  scallions: 'green onions', scallion: 'green onions', 'green onion': 'green onions',
  'yellow onions': 'yellow onion', onion: 'yellow onion', onions: 'yellow onion',
  'large egg': 'large eggs', eggs: 'large eggs', egg: 'large eggs',
  'garlic cloves': 'garlic', 'cloves garlic': 'garlic', 'kosher salt': 'salt',
  'ground black pepper': 'black pepper', pepper: 'black pepper', butter: 'unsalted butter',
  milk: 'whole milk', 'flour': 'all-purpose flour', 'granulated sugar': 'sugar',
  'canola oil': 'vegetable oil', 'cilantro leaves': 'cilantro', 'fresh cilantro': 'cilantro',
  'limes': 'lime', 'lemons': 'lemon', 'fresh ginger': 'ginger',
};
const norm = (s) => {
  const k = String(s).toLowerCase().replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
  return ALIASES[k] || k;
};
// Keep the size on cans and jars ("diced tomatoes (14.5 oz)"); drop other notes in brackets.
const itemKey = (i) => (/^(can|jar|pkg)$/.test(i.u) ? i.item.toLowerCase().trim() : norm(i.item));

// "1 cup + 2 tbsp", "1½ lb", "3 cloves"
function amountText(parts) {
  const out = [];
  if (parts.vol) {
    const t = parts.vol;
    if (t >= 12) out.push(`${fmtQty(Math.round(t / 48 * 4) / 4)} ${t / 48 > 1 ? 'cups' : 'cup'}`);
    else if (t >= 3) out.push(`${fmtQty(Math.round(t / 3 * 2) / 2)} tbsp`);
    else out.push(`${fmtQty(t)} tsp`);
  }
  if (parts.wt) {
    const o = parts.wt;
    out.push(o >= 16 ? `${fmtQty(Math.round(o / 16 * 4) / 4)} lb` : `${fmtQty(Math.round(o * 2) / 2)} oz`);
  }
  Object.keys(parts.other).forEach((u) => {
    const q = parts.other[u];
    out.push(`${fmtQty(q)}${u ? ` ${unitText(u, q)}` : ''}`);
  });
  return out.join(' + ');
}

/**
 * The shopping list for this week's plan.
 * Resolves { sections: [{id, name, items}], have: [items], extras, recipes: n, missing: n }
 * item: { key, name, amount, from: ['Recipe', ...], got, have }
 */
export async function buildShoppingList() {
  const ids = weekRecipeIds();
  const st = getListState();
  const items = {};
  let missing = 0;
  const recipes = await Promise.all(ids.map((id) => getRecipe(id).catch(() => null)));
  recipes.forEach((r, n) => {
    if (!r) { if (!/^my-/.test(ids[n])) missing++; return; } // a deleted own recipe just drops off
    (r.ingredients || []).forEach((i) => {
      if (typeof i === 'string') return;
      const key = itemKey(i);
      if (!key || SKIP.indexOf(key) >= 0) return;
      const it = items[key] || (items[key] = {
        key, name: key, aisle: i.aisle || 'pantry', from: [],
        parts: { vol: 0, wt: 0, other: {} },
      });
      if (it.from.indexOf(r.title) < 0) it.from.push(r.title);
      if (i.q == null) return;
      const q = i.q * scaleFor(r);
      if (VOL[i.u]) it.parts.vol += q * VOL[i.u];
      else if (WT[i.u]) it.parts.wt += q * WT[i.u];
      else it.parts.other[i.u] = (it.parts.other[i.u] || 0) + q;
    });
  });

  const list = Object.keys(items).map((k) => {
    const it = items[k];
    const have = k in st.have ? !!st.have[k] : STAPLES.indexOf(k) >= 0;
    return { key: k, name: it.name, aisle: it.aisle, amount: amountText(it.parts), from: it.from, got: !!st.got[k], have };
  }).sort((a, b) => a.name.localeCompare(b.name));

  const sections = AISLES.map(([id, name]) => ({ id, name, items: list.filter((x) => !x.have && x.aisle === id) }))
    .filter((s) => s.items.length);
  const known = AISLES.map((a) => a[0]);
  const other = list.filter((x) => !x.have && known.indexOf(x.aisle) < 0);
  if (other.length) sections.push({ id: 'other', name: 'Other', items: other });
  return { sections, have: list.filter((x) => x.have), extras: st.extras, recipes: ids.length, missing };
}

/** Number of things still to buy (for badges). */
export async function shoppingCount() {
  const l = await buildShoppingList();
  return l.sections.reduce((n, s) => n + s.items.filter((x) => !x.got).length, 0)
    + l.extras.filter((x) => !x.got).length;
}

export function setHave(key, have) { const s = getListState(); s.have[key] = have; if (have) delete s.got[key]; saveList(s); }
export function setGot(key, got) { const s = getListState(); if (got) s.got[key] = true; else delete s.got[key]; saveList(s); }

/**
 * Add your own item. If it's already known, don't add it twice:
 * resolves 'back' (it was in "Already have" or ticked off: back on the list),
 * 'there' (already on the list), or 'added'. Returns '' for empty text.
 */
export function addExtra(text) {
  const t = String(text || '').trim().slice(0, 60);
  if (!t) return '';
  const s = getListState();
  const key = norm(t);
  const same = s.extras.filter((x) => norm(x.text) === key)[0];
  if (same) {
    if (!same.got) return 'there';
    same.got = false;
    saveList(s);
    return 'back';
  }
  if (plannedKeys().indexOf(key) >= 0) {
    // A planned recipe already needs it: use that line instead of adding a second one.
    const markedHave = key in s.have ? !!s.have[key] : STAPLES.indexOf(key) >= 0;
    if (!markedHave && !s.got[key]) return 'there';
    s.have[key] = false;
    delete s.got[key];
    saveList(s);
    return 'back';
  }
  s.extras.push({ id: `x${Date.now()}`, text: t, got: false });
  saveList(s);
  return 'added';
}
// List keys the planned recipes need (only recipes already loaded; good enough to avoid doubles).
function plannedKeys() {
  const out = [];
  weekRecipeIds().forEach((id) => {
    const r = cachedRecipe(id);
    ((r && r.ingredients) || []).forEach((i) => { if (typeof i !== 'string') out.push(itemKey(i)); });
  });
  return out;
}
export function setExtraGot(id, got) { const s = getListState(); s.extras.forEach((x) => { if (x.id === id) x.got = got; }); saveList(s); }
export function removeExtra(id) { const s = getListState(); s.extras = s.extras.filter((x) => x.id !== id); saveList(s); }

/** Done shopping: clear ticks and the extra items (keeps what you marked "have"). */
export function clearChecked() {
  const s = getListState();
  s.got = {};
  s.extras = s.extras.filter((x) => !x.got);
  saveList(s);
}
/** Fresh list: forget ticks, extras and "have" choices. */
export function resetList() { saveList({ have: {}, got: {}, extras: [] }); }

// ---- The phone's copy of the list ----------------------------------------------------
// The phone page (QR code on the tablet) shows this list so you can take it to the store.
// The tablet saves a copy whenever the list changes; ticks and new items made on the
// phone come back here as 'tablet-shopping' events. Only this tablet and your own phone.
let syncTimer;
export function startShoppingSync() {
  const N = window.TabletNative;
  if (!N || !N.setShoppingList) return;
  const push = () => {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(async () => {
      try {
        const l = await buildShoppingList();
        N.setShoppingList(JSON.stringify({
          updated: Date.now(),
          recipes: l.recipes,
          sections: l.sections.map((s) => ({ name: s.name, items: s.items.map((x) => ({ key: x.key, name: x.name, amount: x.amount, got: x.got })) })),
          extras: l.extras,
        }));
      } catch (e) { /* try again on the next change */ }
    }, 400);
  };
  onKitchenChanged(push);
  window.addEventListener('tablet-shopping', (e) => {
    const a = e.detail || {};
    if (a.act === 'got') { if (a.kind === 'extra') setExtraGot(a.key, !!a.got); else setGot(a.key, !!a.got); }
    else if (a.act === 'add') addExtra(a.text);
  });
  push();
  setInterval(push, 60 * 60 * 1000); // the week moves on by itself
}

// ---- Favourite recipes (hearted on the recipe page) ------------------------------------
export const favorites = () => read(FAV_KEY, []);
export const isFavorite = (id) => favorites().indexOf(id) >= 0;
export function toggleFavorite(id) {
  const f = favorites().filter((x) => x !== id);
  if (f.length === favorites().length) f.unshift(id); // newest first
  write(FAV_KEY, f.slice(0, 500));
  return f.indexOf(id) >= 0;
}

// ---- Serving size chosen for a recipe (used everywhere: recipe page, cooking, list) -------
export function servingsFor(r) {
  const n = read(SERVES_KEY, {})[r.id];
  return n && n > 0 ? n : r.serves;
}
export const scaleFor = (r) => (r.serves ? servingsFor(r) / r.serves : 1);
export function setServings(r, n) {
  const all = read(SERVES_KEY, {});
  n = Math.max(1, Math.min(24, Math.round(n)));
  if (n === r.serves) delete all[r.id]; else all[r.id] = n;
  write(SERVES_KEY, all);
}
