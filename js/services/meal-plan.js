// This tablet's week plan and shopping list. Saved on this tablet only (localStorage).
//
// Plan:  { '2026-11-18': { breakfast: [ids], lunch: [ids], dinner: ['chinese-dan-dan-noodles'],
//          mark: { lunch: 'leftovers' }, serves: { 'dinner|<id>': 6 } }, ... }
//   mark (optional): a meal with no recipe that is still decided: leftovers, eating out, nothing.
//   serves (optional): how many people one planned meal is for (else the recipe's own choice).
// List:  { have: {item: true|false}, got: {item: true}, extras: [{id, text, got, qty?}], next? }
//   have[item] = "we already have it" (left off the list). Pantry basics like salt and
//   oil start as "have" until someone says they need them. qty (optional, 2-99) = "2 x milk".
//   next = true: next week's planned meals are on the list too.
import { getRecipe, cachedRecipe, loadIndex, fmtQty, unitText } from './recipe-data.js';

const PLAN_KEY = 'kitchen.plan.v1';
const LIST_KEY = 'kitchen.list.v1';
const FAV_KEY = 'kitchen.favorites.v1';
const SERVES_KEY = 'kitchen.servings.v1';
const RECENT_KEY = 'kitchen.listrecent.v1';
const SEEN_KEY = 'kitchen.listseen.v1';
const USE_KEY = 'kitchen.listuse.v1';

const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || 'null') || d; } catch (e) { return d; } };
// A full or broken storage must not stop the screen: keep going and still tell the screens.
const write = (k, v) => {
  let ok = true;
  try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { ok = false; /* full: nothing we can do */ }
  window.dispatchEvent(new Event('kitchen-changed'));
  return ok;
};
const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);

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

/**
 * Seven days of the plan: week 0 = today and the next six (same as weekDays()),
 * week 1 = the seven after that. Same fields as weekDays(), plus past/today flags.
 */
export function planDays(week = 0) {
  const now = new Date();
  const out = [];
  for (let i = 0; i < 7; i++) {
    const n = week * 7 + i;
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + n);
    out.push({
      key: dayKey(d), date: d, n,
      label: n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : d.toLocaleDateString('en-US', { weekday: 'long' }),
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
export const MAX_MEALS = MAX_PER_MEAL;
/** A meal decided without a recipe. */
export const MARKS = [['leftovers', 'Leftovers'], ['out', 'Eating out'], ['none', 'Nothing planned']];
const MARK_IDS = MARKS.map((m) => m[0]);

/** The meal a recipe goes to by default (from its section of the library). */
export const defaultMeal = (section) => (section === 'breakfast' || section === 'lunch' ? section : 'dinner');

// One saved day, tidied: old formats, odd values and unknown fields are dropped.
function cleanDay(d) {
  if (Array.isArray(d)) d = { dinner: d }; // plans saved before meals existed were all dinners
  if (!isObj(d)) return null;
  const day = {};
  MEAL_IDS.forEach((m) => {
    day[m] = Array.isArray(d[m]) ? d[m].filter((x, i, a) => typeof x === 'string' && x && a.indexOf(x) === i).slice(0, MAX_PER_MEAL) : [];
  });
  if (isObj(d.mark)) {
    MEAL_IDS.forEach((m) => {
      if (MARK_IDS.indexOf(d.mark[m]) >= 0 && !day[m].length) (day.mark || (day.mark = {}))[m] = d.mark[m];
    });
  }
  if (isObj(d.serves)) {
    Object.keys(d.serves).forEach((k) => {
      const n = Math.round(Number(d.serves[k]));
      const [m, id] = k.split('|');
      if (n >= 1 && n <= 24 && day[m] && day[m].indexOf(id) >= 0) (day.serves || (day.serves = {}))[k] = n;
    });
  }
  return day;
}
const dayEmpty = (d) => !d || (!MEAL_IDS.some((m) => d[m].length) && !d.mark);

export function getPlan() {
  let plan = read(PLAN_KEY, {});
  if (!isObj(plan)) plan = {};
  // Forget days more than a week old.
  const cutoff = dayKey(new Date(Date.now() - 8 * 86400000));
  Object.keys(plan).forEach((k) => {
    const day = /^\d{4}-\d\d-\d\d$/.test(k) && k >= cutoff ? cleanDay(plan[k]) : null;
    if (dayEmpty(day)) delete plan[k]; else plan[k] = day;
  });
  return plan;
}
const emptyDay = () => ({ breakfast: [], lunch: [], dinner: [] });
/** Ids planned for one meal of one day. */
export const plannedFor = (key, meal = 'dinner') => (getPlan()[key] || emptyDay())[meal];
/** Every id planned on a day, breakfast first. */
export const dayIds = (plan, key) => { const d = plan[key] || emptyDay(); return [].concat(d.breakfast, d.lunch, d.dinner); };
const savePlan = (plan) => {
  Object.keys(plan).forEach((k) => { if (dayEmpty(plan[k])) delete plan[k]; });
  write(PLAN_KEY, plan);
};

export function addToPlan(key, id, meal = 'dinner') {
  const plan = getPlan();
  const day = plan[key] || emptyDay();
  if (day[meal].indexOf(id) < 0 && day[meal].length < MAX_PER_MEAL) {
    day[meal].push(id);
    if (day.mark) { delete day.mark[meal]; if (!Object.keys(day.mark).length) delete day.mark; } // a recipe replaces "Leftovers"
  }
  plan[key] = day;
  savePlan(plan);
}
export function removeFromPlan(key, id, meal = 'dinner') {
  const plan = getPlan();
  const day = plan[key] || emptyDay();
  day[meal] = day[meal].filter((x) => x !== id);
  if (day.serves) delete day.serves[`${meal}|${id}`];
  plan[key] = day;
  savePlan(plan);
}

/** Mark a meal "leftovers", "out" or "none" (null takes the mark away). Only for meals with no recipe. */
export function setMark(key, meal, mark) {
  const plan = getPlan();
  const day = plan[key] || emptyDay();
  if (mark && MARK_IDS.indexOf(mark) >= 0) {
    day[meal] = []; // "Eating out" instead of what was planned
    (day.mark || (day.mark = {}))[meal] = mark;
  } else if (day.mark) {
    delete day.mark[meal];
    if (!Object.keys(day.mark).length) delete day.mark;
  }
  plan[key] = day;
  savePlan(plan);
}
/** The mark on a meal, or ''. */
export const markFor = (plan, key, meal) => ((plan[key] || {}).mark || {})[meal] || '';

/**
 * Move one planned recipe to another day (and meal). Resolves 'moved', 'there' (already
 * planned there) or 'full' (that meal already has three).
 */
export function moveMeal(fromKey, fromMeal, id, toKey, toMeal = fromMeal) {
  const plan = getPlan();
  const from = plan[fromKey];
  if (!from || from[fromMeal].indexOf(id) < 0) return 'gone';
  if (fromKey === toKey && fromMeal === toMeal) return 'moved';
  const to = plan[toKey] || emptyDay();
  if (to[toMeal].indexOf(id) >= 0) return 'there';
  if (to[toMeal].length >= MAX_PER_MEAL) return 'full';
  const sk = `${fromMeal}|${id}`;
  const serves = from.serves && from.serves[sk];
  from[fromMeal] = from[fromMeal].filter((x) => x !== id);
  if (from.serves) delete from.serves[sk];
  to[toMeal].push(id);
  if (to.mark) { delete to.mark[toMeal]; if (!Object.keys(to.mark).length) delete to.mark; }
  if (serves) (to.serves || (to.serves = {}))[`${toMeal}|${id}`] = serves;
  plan[fromKey] = from;
  plan[toKey] = to;
  savePlan(plan);
  return 'moved';
}

/** Swap everything planned on two days (moving a day to an empty day is the same thing). */
export function swapDays(a, b) {
  if (a === b) return;
  const plan = getPlan();
  const da = plan[a], db = plan[b];
  if (db) plan[a] = db; else delete plan[a];
  if (da) plan[b] = da; else delete plan[b];
  savePlan(plan);
}

/** What these days hold now, to put back with restoreDays() (for Undo). */
export function snapshotDays(keys) {
  const plan = getPlan();
  const out = {};
  keys.forEach((k) => { out[k] = plan[k] ? JSON.parse(JSON.stringify(plan[k])) : null; });
  return out;
}
export function restoreDays(snap) {
  const plan = getPlan();
  Object.keys(snap || {}).forEach((k) => { if (snap[k]) plan[k] = cleanDay(snap[k]); else delete plan[k]; });
  savePlan(plan);
}
/** Empty these days completely (meals, marks, serving sizes). */
export function clearDays(keys) {
  const plan = getPlan();
  keys.forEach((k) => { delete plan[k]; });
  savePlan(plan);
}
/**
 * "Same again": copy the meals of `fromKeys` onto `toKeys` (day by day), only into meals
 * that have nothing planned yet. Resolves how many recipes were copied.
 */
export function copyDays(fromKeys, toKeys) {
  const plan = getPlan();
  let n = 0;
  fromKeys.forEach((fk, i) => {
    const tk = toKeys[i];
    const f = plan[fk];
    if (!f || !tk) return;
    const t = plan[tk] || emptyDay();
    MEAL_IDS.forEach((m) => {
      if (t[m].length || (t.mark && t.mark[m])) return;
      if (f[m].length) {
        t[m] = f[m].slice();
        n += f[m].length;
        f[m].forEach((id) => { const s = f.serves && f.serves[`${m}|${id}`]; if (s) (t.serves || (t.serves = {}))[`${m}|${id}`] = s; });
      } else if (f.mark && f.mark[m]) (t.mark || (t.mark = {}))[m] = f.mark[m];
    });
    plan[tk] = t;
  });
  savePlan(plan);
  return n;
}

/** People one planned meal is for: its own choice, else the recipe's (r = index entry or recipe). */
export function mealServings(plan, key, meal, id, r) {
  const own = ((plan[key] || {}).serves || {})[`${meal}|${id}`];
  if (own) return own;
  return r ? (read(SERVES_KEY, {})[id] || r.serves || r.s || 0) : 0;
}
export function setMealServings(key, meal, id, n) {
  const plan = getPlan();
  const day = plan[key];
  if (!day || day[meal].indexOf(id) < 0) return;
  n = Math.max(1, Math.min(24, Math.round(n)));
  (day.serves || (day.serves = {}))[`${meal}|${id}`] = n;
  savePlan(plan);
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
/** Recipe ids planned next week (days 8-14). */
export function nextWeekRecipeIds() {
  const plan = getPlan();
  const ids = [];
  planDays(1).forEach((d) => dayIds(plan, d.key).forEach((id) => ids.push(id)));
  return ids;
}
// Every planned meal the shopping list covers: this week, plus next week when asked.
function listEntries(withNext) {
  const plan = getPlan();
  const out = [];
  planDays(0).concat(withNext ? planDays(1) : []).forEach((d) => {
    const day = plan[d.key];
    if (day) MEAL_IDS.forEach((m) => day[m].forEach((id) => out.push({ id, key: d.key, meal: m, serves: (day.serves || {})[`${m}|${id}`] || 0 })));
  });
  return out;
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

export const AISLE_NAMES = AISLES;

// Where your own items usually are in a shop (first match wins; checked as whole words).
const GUESS = [
  // Phrases that would otherwise be caught by a word further down ("peanut BUTTER").
  ['pantry', 'peanut butter|almond butter|apple butter|buttermilk pancake mix|corn flakes|cornflakes|corn starch|cornstarch'],
  ['canned', 'canned [a-z ]+|tinned [a-z ]+|coconut milk|evaporated milk|condensed milk|tomato paste'],
  ['spices', 'black pepper|peppercorns|pepper flakes|garlic powder|onion powder|ground ginger'],
  ['other', 'toilet paper|paper towels?|dish soap|soap|shampoo|detergent|laundry [a-z ]+|toothpaste|tissues|foil|plastic wrap|trash bags|bin bags|batteries|light bulbs?|napkins|sponges?|diapers|wipes|dog food|cat food|cat litter'],
  ['frozen', 'frozen|ice cream|popsicles?|ice pops?|fish sticks|tater tots|frozen peas'],
  ['beverages', 'coffee|tea|tea bags|juice|soda|pop|water|sparkling water|seltzer|beer|wine|lemonade|cola|kombucha|drinks?'],
  ['dairy', 'milk|half and half|cream|butter|cheese|cheddar|mozzarella|parmesan|yogurt|yoghurt|eggs?|sour cream|cottage cheese|cream cheese|margarine'],
  ['bakery', 'bread|bagels?|buns?|rolls?|muffins?|croissants?|tortillas?|pita|cake|donuts?|english muffins'],
  ['meat', 'chicken|beef|pork|ham|bacon|sausages?|turkey|lamb|steak|mince|ground beef|hot dogs?|salami|deli meat|ribs'],
  ['seafood', 'fish|salmon|tuna steak|shrimp|prawns|cod|tilapia|crab|scallops|mussels'],
  ['produce', 'apples?|bananas?|oranges?|lemons?|limes?|grapes|berries|strawberries|blueberries|raspberries|pears?|peaches|plums|melon|watermelon|pineapple|mango|avocados?|tomato(es)?|potato(es)?|sweet potato(es)?|onions?|garlic|carrots?|celery|lettuce|salad|spinach|kale|broccoli|cauliflower|cucumbers?|peppers?|zucchini|mushrooms?|corn|green beans|cabbage|herbs|parsley|cilantro|basil|ginger|fruit|vegetables|veggies|squash'],
  ['canned', 'canned|beans|chickpeas|soup|broth|stock|tuna|tomato sauce|diced tomatoes|coconut milk'],
  ['spices', 'salt|pepper|spices?|cinnamon|paprika|cumin|oregano|chili powder|vanilla|seasoning'],
  ['pantry', 'rice|pasta|spaghetti|noodles|flour|sugar|oil|olive oil|vinegar|cereal|oats|oatmeal|peanut butter|jam|jelly|honey|syrup|ketchup|mustard|mayo|mayonnaise|crackers|chips|cookies|snacks|nuts|baking soda|baking powder'],
];
const GUESS_RE = GUESS.map(([aisle, words]) => [aisle, new RegExp(`(^|\\s)(${words})(\\s|$)`)]);
/** Best guess at the shop aisle for something typed in ("paper towels" -> 'other'). */
export function guessAisle(text) {
  const t = String(text || '').toLowerCase().replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim();
  for (const [aisle, re] of GUESS_RE) if (re.test(t)) return aisle;
  return 'other';
}

// Things most households buy (kept for older callers; the list's keyboard uses grocery-words.js).
export const COMMON_ITEMS = ['Milk', 'Bread', 'Eggs', 'Bananas', 'Butter', 'Coffee', 'Cheese', 'Apples', 'Yogurt',
  'Chicken', 'Potatoes', 'Onions', 'Tomatoes', 'Orange juice', 'Toilet paper', 'Paper towels', 'Dish soap'];

// (An item saved without an id gets one from its place in the list, so it stays the same on every read.)
const cleanExtra = (x, i) => {
  if (!isObj(x) || typeof x.text !== 'string' || !x.text.trim()) return null;
  const out = { id: String(x.id || `xo${i}`), text: x.text.trim().slice(0, 60), got: !!x.got };
  const q = Math.round(Number(x.qty));
  if (q > 1) out.qty = Math.min(99, q);
  return out;
};
export function getListState() {
  let s = read(LIST_KEY, {});
  if (!isObj(s)) s = {};
  const out = {
    have: isObj(s.have) ? s.have : {},
    got: isObj(s.got) ? s.got : {},
    extras: (Array.isArray(s.extras) ? s.extras : []).map(cleanExtra).filter(Boolean),
  };
  if (s.next) out.next = true;
  return out;
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
export const itemKey = (i) => (/^(can|jar|pkg)$/.test(i.u) ? i.item.toLowerCase().trim() : norm(i.item));

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
 * Resolves { sections: [{id, name, items}], have: [items], extras, recipes: n, missing: n,
 *            next: bool (next week included), nextRecipes: n (planned next week) }
 * item: { key, name, amount, from: ['Recipe', ...], got, have }
 */
export async function buildShoppingList() {
  const st = getListState();
  const entries = listEntries(!!st.next);
  const ids = entries.map((x) => x.id);
  const items = {};
  let missing = 0;
  const recipes = await Promise.all(ids.map((id) => getRecipe(id).catch(() => null)));
  recipes.forEach((r, n) => {
    if (!r) { if (!/^my-/.test(ids[n])) missing++; return; } // a deleted own recipe just drops off
    // Amounts follow the people that meal is for (set on the Week plan), else the recipe's choice.
    const scale = entries[n].serves && r.serves ? entries[n].serves / r.serves : scaleFor(r);
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
      const q = i.q * scale;
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
  return {
    sections, have: list.filter((x) => x.have), extras: st.extras, recipes: ids.length, missing,
    next: !!st.next, nextRecipes: nextWeekRecipeIds().length,
  };
}

/** Put next week's planned meals on the list too (or take them off again). */
export function setListNextWeek(on) {
  const s = getListState();
  if (on) s.next = true; else delete s.next;
  saveList(s);
}

/** Planned-ingredient keys seen on the Shopping list before (to point out what's new). */
export function listSeen() { const s = read(SEEN_KEY, null); return Array.isArray(s) ? s : null; }
export function setListSeen(keys) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(keys.slice(0, 1000))); } catch (e) { /* full */ }
}

/** Number of things still to buy (for badges). */
export async function shoppingCount() {
  const l = await buildShoppingList();
  return l.sections.reduce((n, s) => n + s.items.filter((x) => !x.got).length, 0)
    + l.extras.filter((x) => !x.got).length;
}

export function setHave(key, have) { const s = getListState(); s.have[key] = have; if (have) delete s.got[key]; saveList(s); }
export function setGot(key, got) { const s = getListState(); if (got) s.got[key] = true; else delete s.got[key]; saveList(s); }

// Words that make a leading number an amount ("5 tbsp butter"), not a count of things.
const MEASURE = /^(?:tsp|teaspoons?|tbsp|tablespoons?|cups?|oz|ounces?|lbs?|pounds?|g|grams?|kg|ml|l|lit(?:er|re)s?|pints?|quarts?|gallons?|fl|cans?|cloves?|sticks?|slices?|pieces?|bunch(?:es)?|heads?|sprigs?|stalks?|packages?|pkgs?|packs?|packets?|jars?|bottles?|bags?|box(?:es)?|dozen|pinch(?:es)?|dash(?:es)?|inch(?:es)?|cm)\b/i;

/** "2 x milk", "milk x2", "3 lemons" -> { qty: 2, text: 'milk' }; plain text -> qty 0. */
export function splitQty(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  // "2 x milk", "2x milk": said outright.
  let m = t.match(/^(\d{1,2})\s*(?:x|×|\*)\s*(\S.*)$/i);
  if (m && Number(m[1]) > 0) return { qty: Number(m[1]), text: m[2] };
  // "3 lemons" is three of something; "5 tbsp butter" or "1 1/2 cups milk" (a recipe's
  // ingredient, sent over from a dish's page) is an amount and stays as it is written.
  m = t.match(/^(\d{1,2})\s+(\S.*)$/);
  if (m && Number(m[1]) > 0 && !MEASURE.test(m[2]) && !/^[\d½⅓⅔¼¾⅛⅜⅝⅞]/.test(m[2])) return { qty: Number(m[1]), text: m[2] };
  m = t.match(/^(.*\S)\s*(?:x|×|\*)\s*(\d{1,2})$/i);
  if (m && Number(m[2]) > 0) return { qty: Number(m[2]), text: m[1] };
  return { qty: 0, text: t };
}

/** Your own items added lately (newest first), for one-tap adding again. */
export function recentExtras() {
  const r = read(RECENT_KEY, []);
  return Array.isArray(r) ? r.filter((x) => typeof x === 'string' && x).slice(0, 12) : [];
}
function rememberExtra(text) {
  const k = norm(text);
  const r = [text].concat(recentExtras().filter((x) => norm(x) !== k)).slice(0, 12);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(r)); } catch (e) { /* full */ }
  // How often each thing was added (the 60 most recent), for the keyboard's suggestions.
  const u = read(USE_KEY, {});
  const use = isObj(u) ? u : {};
  const was = isObj(use[k]) ? use[k] : { n: 0 };
  delete use[k];
  use[k] = { t: String(text).slice(0, 60), n: Math.min(9999, (Number(was.n) || 0) + 1) };
  const keys = Object.keys(use);
  keys.slice(0, Math.max(0, keys.length - 60)).forEach((x) => { delete use[x]; });
  try { localStorage.setItem(USE_KEY, JSON.stringify(use)); } catch (e) { /* full */ }
}
/** Your own items, most often added first (ties: the newest first): [{ text, n }]. */
export function usedExtras() {
  const u = read(USE_KEY, {});
  if (!isObj(u)) return [];
  const out = [];
  Object.keys(u).forEach((k, i) => { const x = u[k]; if (isObj(x) && typeof x.t === 'string' && x.t) out.push({ text: x.t, n: Number(x.n) || 1, i }); });
  return out.sort((a, b) => b.n - a.n || b.i - a.i).map((x) => ({ text: x.text, n: x.n }));
}

/**
 * Add your own item ("2 x milk" sets how many). If it's already known, don't add it twice:
 * resolves 'back' (it was in "Already have" or ticked off: back on the list),
 * 'there' (already on the list), 'more' (already there and a number was given: added to it),
 * or 'added'. Returns '' for empty text.
 */
export function addExtra(text) {
  const parts = splitQty(String(text || '').slice(0, 60));
  const t = parts.text.slice(0, 60);
  if (!t) return '';
  const s = getListState();
  const key = norm(t);
  const same = s.extras.filter((x) => norm(x.text) === key)[0];
  rememberExtra(t);
  if (same) {
    if (!same.got) {
      if (!parts.qty) return 'there';
      same.qty = Math.min(99, (same.qty || 1) + parts.qty);
      saveList(s);
      return 'more';
    }
    same.got = false;
    if (parts.qty > 1) same.qty = parts.qty; else delete same.qty;
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
  const x = { id: `x${Date.now()}${Math.random().toString(36).slice(2, 5)}`, text: t, got: false };
  if (parts.qty > 1) x.qty = Math.min(99, parts.qty);
  s.extras.push(x);
  return saveList(s) ? 'added' : 'unsaved'; // 'unsaved': storage full, nothing changed
}
/** How many of one of your own items (1-99; below 1 is not allowed: remove it instead). */
export function setExtraQty(id, n) {
  const s = getListState();
  n = Math.max(1, Math.min(99, Math.round(n)));
  s.extras.forEach((x) => { if (x.id === id) { if (n > 1) x.qty = n; else delete x.qty; } });
  saveList(s);
}
/** "2 × Milk" / "Milk": how an own item reads on the list. */
export const extraText = (x) => (x.qty > 1 ? `${x.qty} × ${x.text}` : x.text);

/** The whole list as it is now, to put back with restoreList() (for Undo). */
export const listSnapshot = () => JSON.stringify(getListState());
export function restoreList(snap) {
  try { const s = JSON.parse(snap); if (isObj(s)) { localStorage.setItem(LIST_KEY, JSON.stringify(s)); } } catch (e) { /* keep what's there */ }
  window.dispatchEvent(new Event('kitchen-changed'));
}
// List keys the planned recipes need (only recipes already loaded; good enough to avoid doubles).
function plannedKeys() {
  const out = [];
  listEntries(!!getListState().next).forEach(({ id }) => {
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

// ---- Who said they'd go to the store ----------------------------------------------------
// Only a note on this screen ("Alex is going"): nothing is sent anywhere. It is forgotten
// after eighteen hours, or when "Done shopping" clears the ticks.
const GOING_KEY = 'kitchen.listgoing.v1';
const GOING_MS = 18 * 60 * 60 * 1000;
/** { name, at } or null. */
export function getGoing() {
  const g = read(GOING_KEY, null);
  return isObj(g) && typeof g.name === 'string' && g.name && Date.now() - Number(g.at) < GOING_MS && Number(g.at) <= Date.now() + 60000
    ? { name: g.name.slice(0, 40), at: Number(g.at) } : null;
}
/** Say who is going (a name), or nobody (null / ''). */
export function setGoing(name) {
  if (name) { write(GOING_KEY, { name: String(name).slice(0, 40), at: Date.now() }); return; }
  try { localStorage.removeItem(GOING_KEY); } catch (e) { /* nothing to forget */ }
  window.dispatchEvent(new Event('kitchen-changed'));
}

// ---- Changes that came from a phone ----------------------------------------------------
const phoneSubs = [];
/**
 * Hear about each change a phone makes to the list, just after it is saved:
 * cb({ act: 'add'|'got'|'remove', kind: 'extra'|'item', key, name, got, result? }).
 * Returns a function that stops it.
 */
export function onPhoneChange(cb) {
  phoneSubs.push(cb);
  return () => { const i = phoneSubs.indexOf(cb); if (i >= 0) phoneSubs.splice(i, 1); };
}

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
          // The phone shows `text`: "2 × Milk" says how many.
          extras: l.extras.map((x) => ({ id: x.id, text: extraText(x), got: x.got })),
        }));
      } catch (e) { /* try again on the next change */ }
    }, 400);
  };
  onKitchenChanged(push);
  window.addEventListener('tablet-shopping', (e) => {
    const a = e.detail || {};
    // What changed, in words the Shopping list screen can show ("Limes came from a phone").
    const told = { act: a.act, kind: a.kind === 'extra' ? 'extra' : 'item', key: String(a.key || ''), got: !!a.got, name: '' };
    const extraNamed = (id) => (getListState().extras.filter((x) => x.id === id)[0] || {}).text || '';
    if (a.act === 'got') {
      told.name = a.kind === 'extra' ? extraNamed(a.key) : String(a.key || '');
      if (a.kind === 'extra') setExtraGot(a.key, !!a.got); else setGot(a.key, !!a.got);
    } else if (a.act === 'add') {
      const t = splitQty(String(a.text || '').slice(0, 60)).text;
      told.result = addExtra(a.text);
      const k = norm(t);
      const x = getListState().extras.filter((y) => norm(y.text) === k)[0];
      told.kind = x ? 'extra' : 'item';
      told.key = x ? x.id : k;
      told.name = t;
    } else if (a.act === 'remove') {
      told.kind = 'extra';
      told.name = extraNamed(a.key) || String(a.text || '');
      removeExtra(a.key);
    } else return;
    phoneSubs.forEach((cb) => { try { cb(told); } catch (err) { /* a screen's own trouble */ } });
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
