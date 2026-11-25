// "Plan on a budget": meals for chosen days that fit an amount of money (screens/budget.js).
//
// Prices. What a recipe costs = what its ingredients cost for the amount it uses (a tablespoon
// of butter, not the pound), pantry staples left out (salt, pepper, oil, water, common dried
// spices), then scaled to the people it is planned for. Budget Bytes writes each ingredient's
// price in its notes ("$0.74"): those are used as they are. Everything else is an estimate from
// grocery-prices.js (typical US store-brand prices). The screens always say "est." / "about".
//
// Choosing. For each day × meal: recipes of that meal (the sites' own courses), none with a
// "leave out" word in the title or ingredients (families too: "seafood" is shrimp, salmon…),
// "more of these" preferred, mains and cuisines spread over the week, no repeats while there
// are enough. A greedy fill aims each meal at its share of the budget; then, while the week
// is over, the priciest picks are swapped for cheaper ones. Kept meals never change.
//
// Kept on the screen: each meal's candidates (budget.pool.v1, a few days), the last setup
// (budget.setup.v1), and what was last sent to the Week plan (budget.sent.v1) for the
// Shopping list's banner and prices.
import { mealRecipes, webIngredient, plainText, keepWebRecipe, loadWebRecipe, cachedWebRecipe } from './web-recipes.js';
import { ingredientCost, isStaple, findPrice, round2 } from './grocery-prices.js';
import {
  itemKey, getPlan, planDays, addToPlan, setMealServings, snapshotDays, getListState, setListNextWeek, buildShoppingList,
} from './meal-plan.js';

const POOL_KEY = 'budget.pool.v1';
const SETUP_KEY = 'budget.setup.v1';
const SENT_KEY = 'budget.sent.v1';
const POOL_DAYS = 3;

const read = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch (e) { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };

// ---- The setup --------------------------------------------------------------------------
export const MORE_CHIPS = [['chicken', 'Chicken'], ['quick', 'Quick · under 30 min'], ['pasta', 'Pasta'], ['vegetarian', 'Vegetarian nights'], ['slow cooker', 'Slow cooker']];
export const OUT_CHIPS = [['mushrooms', 'Mushrooms'], ['seafood', 'Seafood'], ['pork', 'Pork'], ['spicy', 'Spicy'], ['cilantro', 'Cilantro']];
const DEFAULT_SETUP = { budget: 100, days: 'next', picked: [], serves: 2, meals: ['breakfast', 'dinner'], more: [], out: [], addedMore: [], addedOut: [] };
const words = (a) => (Array.isArray(a) ? a.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim().toLowerCase().slice(0, 30)).slice(0, 12) : []);
/** The last setup (or the first one: $100, next week, breakfast and dinner). */
export function getSetup(people = 2) {
  const s = read(SETUP_KEY, null);
  const out = Object.assign({}, DEFAULT_SETUP, { serves: Math.max(1, Math.min(12, people || 2)) });
  if (!s || typeof s !== 'object') return out;
  if (s.budget >= 10 && s.budget <= 1000) out.budget = Math.round(s.budget);
  if (['next', 'weekdays', 'pick'].indexOf(s.days) >= 0) out.days = s.days;
  out.picked = Array.isArray(s.picked) ? s.picked.filter((k) => /^\d{4}-\d\d-\d\d$/.test(k)) : [];
  if (s.serves >= 1 && s.serves <= 12) out.serves = Math.round(s.serves);
  const meals = Array.isArray(s.meals) ? s.meals.filter((m) => ['breakfast', 'lunch', 'dinner'].indexOf(m) >= 0) : [];
  if (meals.length) out.meals = ['breakfast', 'lunch', 'dinner'].filter((m) => meals.indexOf(m) >= 0);
  ['more', 'out', 'addedMore', 'addedOut'].forEach((k) => { out[k] = words(s[k]); });
  return out;
}
export const saveSetup = (s) => write(SETUP_KEY, s);

/** The days a setup covers: [{ key, date, label, short, sub, n }] (planDays' days, none past). */
export function setupDays(s) {
  const next = planDays(1);
  if (s.days === 'next') return next;
  if (s.days === 'weekdays') return next.filter((d) => d.date.getDay() > 0 && d.date.getDay() < 6);
  const all = planDays(0).concat(next);
  return all.filter((d) => s.picked.indexOf(d.key) >= 0);
}
/** Day × meal, day by day: [{ key, meal }]. */
export const setupSlots = (s) => {
  const out = [];
  setupDays(s).forEach((d) => s.meals.forEach((meal) => out.push({ key: d.key, meal })));
  return out;
};

// ---- Words: leave out, more of these --------------------------------------------------------
// A word stands for its family too.
const FAMILY = {
  seafood: 'seafood|fish|shrimp|prawn|salmon|tuna|cod|tilapia|halibut|haddock|crab|lobster|scallop|mussel|clam|oyster|anchov\\w*|sardine|mahi|calamari|squid|swai|pollock|trout|shellfish',
  fish: 'fish|salmon|tuna|cod|tilapia|halibut|haddock|anchov\\w*|sardine|mahi|swai|pollock|trout',
  shellfish: 'shellfish|shrimp|prawn|crab|lobster|scallop|mussel|clam|oyster',
  pork: 'pork|bacon|ham|sausage|chorizo|prosciutto|pancetta|salami|pepperoni|andouille|kielbasa|carnitas|hot dog',
  beef: 'beef|steak|brisket|meatball|meatloaf|burger|sirloin|ribeye|chuck|short rib',
  chicken: 'chicken',
  turkey: 'turkey',
  meat: 'meat|beef|steak|chicken|pork|bacon|ham|sausage|turkey|lamb|chorizo|prosciutto|pancetta|salami|pepperoni|meatball|brisket|duck',
  spicy: 'spicy|jalape\\w*|chipotle|sriracha|cayenne|hot sauce|chili flake|chilli flake|red pepper flake|crushed red pepper|gochujang|habanero|sambal|buffalo|serrano|harissa|cajun|thai chil\\w*|chili garlic|hot pepper',
  mushrooms: 'mushroom|portobello|shiitake|cremini|porcini',
  cilantro: 'cilantro|coriander leaves|fresh coriander',
  dairy: 'milk|cheese|cream|butter|yogurt|yoghurt|parmesan|mozzarella|cheddar|feta|ricotta',
  nuts: 'nut|peanut|almond|walnut|pecan|cashew|pistachio|hazelnut',
  eggs: 'egg',
  onions: 'onion|shallot|scallion|leek',
  olives: 'olive(?! oil)',
};
const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A regex for words (and their families): whole words, plurals too ("mushroom" finds "mushrooms"). */
export function wordsRe(list) {
  const parts = [];
  (list || []).forEach((w) => {
    w = String(w || '').toLowerCase().trim();
    if (!w) return;
    const one = w.length > 3 ? w.replace(/(es|s)$/, '') : w;
    parts.push(FAMILY[w] || FAMILY[one] || esc(one));
  });
  return parts.length ? new RegExp(`(?:^|[^a-z])(?:${parts.join('|')})(?:s|es)?(?![a-z])`) : null;
}
const MEATY = wordsRe(['meat', 'seafood']);

// ---- One recipe, priced ------------------------------------------------------------------------
// Not a meal: sauces, dips, spice mixes, drinks (the sites file some under breakfast or dinner).
// (A title ending in one of these words, with no "with" or "and" before it: "Spaghetti with Meat
// Sauce" is a meal, "Enchilada Sauce" isn't.)
const NOT_A_MEAL = /^(?!.*\b(with|and|in|over|on)\b).*\b(sauce|dressing|vinaigrette|seasoning|spice mix|spice blend|rub|marinade|broth|stock|dip|salsa|guacamole|hummus|syrup|jam|compote|frosting|glaze|gravy|pesto|aioli|mayo|croutons|smoothies?|latte|coffee|tea|lemonade|juice|cocktail|mix|substitute)$/i;
// A part of a meal made from scratch ("Homemade Pasta", "Easy Pizza Dough").
const PART = /^(homemade |easy |basic |the best |perfect )?(fresh )?(pasta|pasta dough|pizza dough|bread|tortillas?|flour tortillas|granola|stock|broth|yogurt|butter|ricotta|croutons|bread ?crumbs|noodles|naan|pita bread|biscuits|dinner rolls)$/i;
// The main thing in a dish, for spreading the week out.
const MAINS = [
  ['chicken', /chicken/], ['beef', /beef|steak|brisket|meatball|meatloaf/], ['pork', /pork|bacon|ham\b|sausage|chorizo/],
  ['turkey', /turkey/], ['fish', /shrimp|prawn|salmon|tuna|cod|tilapia|fish|crab|scallop/], ['beans', /bean|lentil|chickpea|dal\b/],
  ['tofu', /tofu|tempeh/], ['eggs', /\beggs?\b|frittata|quiche|omelet|shakshuka/], ['pancakes', /pancake|waffle|french toast|crepe/],
  ['oats', /oat|granola|porridge/], ['bread', /muffin|scone|biscuit|bread|bagel|toast/], ['pasta', /pasta|spaghetti|penne|noodle|macaroni|lasagna|gnocchi|orzo/],
  ['rice', /rice|risotto/], ['potato', /potato/], ['soup', /soup|stew|chili/], ['salad', /salad/],
];
const mainOf = (title, ings) => {
  const t = title.toLowerCase();
  const hit = MAINS.find(([, re]) => re.test(t)) || MAINS.find(([, re]) => re.test(ings));
  return hit ? hit[0] : 'other';
};
const PRICE_NOTE = /\$\s?(\d+(?:\.\d{1,2})?)/;
const SITE_COST = /\$\s?(\d+(?:\.\d{1,2})?)\s*(?:per\s+)?recipe/i;

/**
 * A recipe as mealRecipes gives it -> { total (whole recipe, $), items: { listKey: $ } } with
 * staples left out. Budget Bytes' own prices when it gives them, else the table's estimates.
 */
export function priceRecipe(row) {
  const items = {};
  let total = 0;
  let own = 0;
  (row.ingredients || []).forEach((x) => {
    if (!x || x.type === 'group') return;
    const ing = webIngredient(x);
    if (!ing || isStaple(ing)) return;
    const note = PRICE_NOTE.exec(plainText(x.notes));
    // (Priced by its name as the site wrote it too: "4 medium boneless, skinless chicken breasts".)
    // (Some sites put the thing itself in the note: "4 medium boneless" + "skinless chicken breasts".)
    let named = `${ing.item} ${plainText(x.name).toLowerCase()}`;
    if (!findPrice(named)) named += ` ${plainText(x.notes).toLowerCase()}`;
    const cost = note ? Math.min(30, +note[1]) : ingredientCost(Object.assign({}, ing, { item: named }));
    if (note) own++;
    const key = itemKey(ing);
    items[key] = round2((items[key] || 0) + cost);
    total += cost;
  });
  // The site's own total for the recipe, when it has one and no prices per ingredient.
  const site = !own && SITE_COST.exec(String(row.cost || ''));
  if (site && total > 0) {
    const k = +site[1] / total;
    Object.keys(items).forEach((key) => { items[key] = round2(items[key] * k); });
    total = +site[1];
  }
  return { total: round2(total), items, own: own > 0 };
}

/** A recipe row -> the small candidate kept on the screen, or null when it is no meal. */
export function candidate(row, meal) {
  const ings = (row.ingredients || []).filter((x) => x && x.type !== 'group');
  if (ings.length < 3 || NOT_A_MEAL.test(row.title) || /\b(how to|smoothie|recipes)\b/i.test(row.title) || PART.test(row.title)) return null;
  // (Not an everyday meal: a whole day's work, unless it is the slow cooker doing it.)
  if (row.minutes > 240 && !/slow cooker|crock ?pot|crockpot/i.test(row.title)) return null;
  const p = priceRecipe(row);
  const per = p.total / row.serves;
  // (Next to nothing a serving is a side or a part of a meal: "Homemade Pasta" is flour and eggs.)
  if (!(per >= (meal === 'dinner' ? 0.75 : 0.35))) return null;
  const it = {};
  Object.keys(p.items).forEach((k) => { if (p.items[k] > 0) it[k] = Math.round(p.items[k] / row.serves * 1000) / 1000; });
  const names = ings.map((x) => plainText(x.name)).join(' · ').toLowerCase().slice(0, 600);
  return {
    id: row.id, t: row.title, img: row.img, alt: row.alt, site: row.site, m: row.minutes, s: row.serves, meal,
    p1: Math.round(per * 1000) / 1000, it, w: ` ${row.title.toLowerCase()} · ${names} `, main: mainOf(row.title, names), cu: row.cuisine || '',
  };
}
/** What a candidate costs for `serves` people ($, to the cent). */
export const priceFor = (c, serves) => round2(c.p1 * serves);

// ---- Candidates for each meal -------------------------------------------------------------------
function pools() { const p = read(POOL_KEY, {}); return p && typeof p === 'object' ? p : {}; }
const online = () => !(typeof navigator !== 'undefined' && navigator.onLine === false);
/**
 * Candidates for each meal: { pools: { meal: [candidate] }, offline } — from the sites (two
 * pages of each, one request per site a page), kept a few days. With no internet, or when no
 * site answers: what was kept, only the recipes kept whole on the screen (they open offline).
 */
export async function loadPools(meals, signal) {
  const all = pools();
  const out = {};
  let offline = false;
  for (const meal of meals) {
    const have = all[meal];
    if (!online()) { offline = true; out[meal] = ((have && have.list) || []).filter((c) => cachedWebRecipe(c.id)); continue; }
    if (have && Date.now() - have.at < POOL_DAYS * 86400000 && have.list.length) { out[meal] = have.list; continue; }
    const res = await Promise.all([1, 2].map((page) => mealRecipes(meal, { per: 20, page, signal })));
    if (signal && signal.aborted) return { pools: out, offline: false };
    const list = [];
    const seen = {};
    res.forEach((r) => r.list.forEach((row) => {
      const c = candidate(row, meal);
      const same = row.title.toLowerCase().replace(/[^a-z]+/g, '');
      if (c && !seen[c.id] && !seen[same]) { seen[c.id] = 1; seen[same] = 1; list.push(c); }
    }));
    if (res.some((r) => r.answered) && list.length) {
      all[meal] = { at: Date.now(), list };
      if (!write(POOL_KEY, all)) { delete all[meal]; write(POOL_KEY, { [meal]: { at: Date.now(), list } }); }
      out[meal] = list;
    } else {
      offline = true;
      out[meal] = ((have && have.list) || []).filter((c) => cachedWebRecipe(c.id));
    }
  }
  return { pools: out, offline: offline || !online() };
}

// ---- Choosing ----------------------------------------------------------------------------------
// A small seeded random: the same week again for the same seed (coming back to the screen).
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** How much a candidate is what was asked for more of (0 = not at all). */
function liked(c, more) {
  let n = 0;
  (more || []).forEach((w) => {
    if (w === 'quick') { if (c.m > 0 && c.m <= 30) n++; } else if (w === 'vegetarian') { if (!MEATY.test(c.w)) n++; } else if (w === 'slow cooker') {
      if (/slow cooker|crock ?pot|crockpot/.test(c.w)) n++;
    } else {
      const re = wordsRe([w]);
      if (re && re.test(` ${c.t.toLowerCase()} `)) n += 1; else if (re && re.test(c.w)) n += 0.5;
    }
  });
  return n;
}
/** The candidates a setup allows for one meal (leave-out words gone). */
export function usable(pool, s) {
  const out = wordsRe(s.out);
  return (pool || []).filter((c) => !(out && out.test(c.w)));
}
/** How many of a meal's candidates the leave-out words took away. */
export const leftOutCount = (pool, s) => (pool || []).length - usable(pool, s).length;

/**
 * Pick a recipe for every slot. slots: [{ key, meal, id?, keep? }] (kept ones stay);
 * pools: { meal: [candidate] }. Returns { slots: [{ key, meal, id, keep }], missing: [meal] }.
 */
export function choose(slots, pools, s, seed = 1) {
  const rand = rng(seed);
  const use = {};
  const byId = {};
  Object.keys(pools).forEach((m) => { use[m] = usable(pools[m], s); pools[m].forEach((c) => { byId[c.id] = c; }); });
  const missing = s.meals.filter((m) => !(use[m] || []).length);
  const out = slots.map((x) => ({ key: x.key, meal: x.meal, id: x.keep && byId[x.id] ? x.id : '', keep: !!(x.keep && byId[x.id]) }));
  if (missing.length) return { slots: out, missing };
  // Each meal's share: a typical price of that meal (its median), so breakfast gets less than dinner.
  const median = {};
  Object.keys(use).forEach((m) => { const ps = use[m].map((c) => c.p1).sort((a, b) => a - b); median[m] = ps[Math.floor(ps.length / 2)] || 1; });
  const keptCost = out.reduce((n, x) => n + (x.keep ? priceFor(byId[x.id], s.serves) : 0), 0);
  const open = out.filter((x) => !x.keep);
  const weight = open.reduce((n, x) => n + median[x.meal], 0) || 1;
  const left = Math.max(0, s.budget - keptCost);
  const used = {};
  const mains = {};
  out.forEach((x) => { if (x.keep) { used[x.id] = 1; const c = byId[x.id]; mains[c.main] = (mains[c.main] || 0) + 1; } });
  const prevMain = (i) => { for (let j = i - 1; j >= 0; j--) if (out[j].meal === out[i].meal && out[j].id) return byId[out[j].id].main; return ''; };
  out.forEach((x, i) => {
    if (x.keep) return;
    const target = (left * median[x.meal]) / weight;
    let fresh = use[x.meal].filter((c) => !used[c.id]);
    if (!fresh.length) fresh = use[x.meal]; // too few recipes: repeats are allowed
    const pm = prevMain(i);
    let best = null;
    let bestScore = -1e9;
    fresh.forEach((c) => {
      const price = priceFor(c, s.serves);
      const score = liked(c, s.more) * 1.5 + rand() * 1.2 - Math.abs(price - target) / Math.max(1, target)
        - (mains[c.main] || 0) * 0.5 - (c.main === pm && c.main !== 'other' ? 1 : 0);
      if (score > bestScore) { bestScore = score; best = c; }
    });
    x.id = best.id;
    used[best.id] = 1;
    mains[best.main] = (mains[best.main] || 0) + 1;
  });
  // Over: the priciest picks give way to cheaper ones, the biggest saving first.
  for (let n = 0; n < 60 && total(out, byId, s.serves) > s.budget; n++) {
    const sw = cheaperSwaps(out, use, byId, s, 1)[0];
    if (!sw) break;
    out[sw.i].id = sw.to;
  }
  return { slots: out, missing: [] };
}

/** What the slots come to ($). */
export function total(slots, byId, serves) {
  return round2(slots.reduce((n, x) => n + (byId[x.id] ? priceFor(byId[x.id], serves) : 0), 0));
}
// The best swaps for an over-budget week: [{ i, from, to, save }], the biggest saving first,
// one per meal, none for kept meals, never a recipe already in the week.
function cheaperSwaps(slots, use, byId, s, max) {
  const inWeek = {};
  slots.forEach((x) => { inWeek[x.id] = 1; });
  const out = [];
  slots.forEach((x, i) => {
    const c = byId[x.id];
    if (x.keep || !c) return;
    const now = priceFor(c, s.serves);
    // The cheapest of the meal's recipes, among those not in the week; a bit of liking counts.
    let best = null;
    (use[x.meal] || []).forEach((o) => {
      if (inWeek[o.id] || priceFor(o, s.serves) >= now) return;
      if (!best || priceFor(o, s.serves) - liked(o, s.more) * 0.5 < priceFor(best, s.serves) - liked(best, s.more) * 0.5) best = o;
    });
    if (best) out.push({ i, from: c.id, to: best.id, save: round2(now - priceFor(best, s.serves)) });
  });
  return out.sort((a, b) => b.save - a.save).slice(0, max);
}
/**
 * Over budget: the few swaps that bring the week under (or as near as they can), for the amber
 * panel. [{ i, from, to, save }].
 */
export function overSwaps(slots, pools, s) {
  const use = {};
  const byId = {};
  Object.keys(pools).forEach((m) => { use[m] = usable(pools[m], s); pools[m].forEach((c) => { byId[c.id] = c; }); });
  let over = total(slots, byId, s.serves) - s.budget;
  if (over <= 0) return [];
  const out = [];
  cheaperSwaps(slots, use, byId, s, 8).some((sw) => {
    out.push(sw);
    over -= sw.save;
    return over <= 0 || out.length >= 3;
  });
  return out;
}
/**
 * Other recipes for one slot, cheapest first (not ones already elsewhere in the week): the
 * cheapest few, and the nearest few that cost more, so there is a choice both ways.
 */
export function alternatives(slots, i, pools, s, max = 5) {
  const x = slots[i];
  const now = pools[x.meal].find((c) => c.id === x.id);
  const others = {};
  slots.forEach((y, j) => { if (j !== i) others[y.id] = 1; });
  const list = usable(pools[x.meal], s).filter((c) => c.id !== x.id && !others[c.id]).sort((a, b) => a.p1 - b.p1);
  const cheaper = list.filter((c) => !now || c.p1 < now.p1);
  const dearer = list.filter((c) => now && c.p1 >= now.p1);
  const nDear = Math.min(dearer.length, Math.max(2, max - cheaper.length));
  return cheaper.slice(0, max - nDear).concat(dearer.slice(0, nDear)).sort((a, b) => a.p1 - b.p1);
}

// ---- Send to the Week plan ----------------------------------------------------------------------
// What the plan and the recipe pages need to know about a recipe before it has loaded.
const entryOf = (c) => ({ id: c.id, t: c.t, c: 'web', ty: c.meal, m: c.m, g: c.m > 0 && c.m <= 30 ? ['quick'] : [], b: '', s: c.s, img: c.img, alt: c.alt || '', site: c.site, table: c.meal === 'breakfast' ? 'breakfast' : c.meal === 'lunch' ? 'lunch' : 'american' });

/**
 * Put the week on the plan: only meals with nothing planned get a recipe (what is planned
 * stays), each for `serves` people; next week's meals go on the shopping list too. The recipes
 * are kept on the screen for good. Resolves { added, kept, total, things, snap, wasNext, next }:
 * snap + wasNext put everything back (undoSend).
 */
export async function sendToPlan(slots, byId, s, label) {
  const keys = slots.map((x) => x.key).filter((k, i, a) => a.indexOf(k) === i);
  const snap = snapshotDays(keys);
  const wasNext = !!getListState().next;
  const nextKeys = planDays(1).map((d) => d.key);
  const plan = getPlan();
  const sent = [];
  let kept = 0;
  slots.forEach((x) => {
    const c = byId[x.id];
    const day = plan[x.key];
    if (!c) return;
    if (day && (day[x.meal].length || (day.mark && day.mark[x.meal]))) { kept++; return; }
    keepWebRecipe(entryOf(c));
    addToPlan(x.key, c.id, x.meal);
    setMealServings(x.key, x.meal, c.id, s.serves);
    const items = {};
    Object.keys(c.it || {}).forEach((k) => { items[k] = round2(c.it[k] * s.serves); });
    sent.push({ key: x.key, meal: x.meal, id: c.id, cost: priceFor(c, s.serves), items });
  });
  const next = sent.some((x) => nextKeys.indexOf(x.key) >= 0);
  if (next && !wasNext) setListNextWeek(true);
  write(SENT_KEY, { at: Date.now(), budget: s.budget, label, slots: sent });
  // The whole recipes, so the shopping list has their ingredients (and they open offline).
  const recipes = await Promise.all(sent.map((x) => loadWebRecipe(x.id).catch(() => null)));
  const titles = recipes.filter(Boolean).map((r) => r.title);
  let things = 0;
  try {
    const list = await buildShoppingList();
    list.sections.forEach((sec) => sec.items.forEach((it) => { if (it.from.some((t) => titles.indexOf(t) >= 0)) things++; }));
  } catch (e) { /* the count is only for the toast */ }
  return { added: sent.length, kept, total: round2(sent.reduce((n, x) => n + x.cost, 0)), things, snap, wasNext, next };
}
/** Undo a send: the plan's days come back (restoreDays(snap)) and this puts back the rest. */
export function undoSend(wasNext) {
  setListNextWeek(!!wasNext);
  try { localStorage.removeItem(SENT_KEY); } catch (e) { /* storage off */ }
}

/**
 * For the Shopping list: the budget meals still on the plan and on the list ({ label, meals,
 * total, budget, prices: { listKey: $ } }), or null when no budget plan was sent for them.
 */
export function budgetOnList() {
  const rec = read(SENT_KEY, null);
  if (!rec || !Array.isArray(rec.slots)) return null;
  const plan = getPlan();
  const days = planDays(0).concat(getListState().next ? planDays(1) : []).map((d) => d.key);
  const live = rec.slots.filter((x) => x && days.indexOf(x.key) >= 0 && ((plan[x.key] || {})[x.meal] || []).indexOf(x.id) >= 0);
  if (!live.length) return null;
  const prices = {};
  live.forEach((x) => Object.keys(x.items || {}).forEach((k) => { prices[k] = round2((prices[k] || 0) + (+x.items[k] || 0)); }));
  return { label: String(rec.label || ''), meals: live.length, total: round2(live.reduce((n, x) => n + (+x.cost || 0), 0)), budget: +rec.budget || 0, prices };
}
