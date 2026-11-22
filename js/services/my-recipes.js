// The family's own recipes, typed on the tablet or on a phone (the QR-code page).
// Saved on this tablet only. Kept as typed — one ingredient / one step per line — and
// turned into the same shape as the library's recipes here, so the week plan, shopping
// list, serving sizes and cooking mode all work with them.
//
// Saved shape: { id: 'my-…', title, meal: breakfast|lunch|dinner|dessert, blurb, serves,
//                prep, cook (minutes), ingredients: [lines], steps: [lines], updated }
const LOCAL_KEY = 'my.recipes.v1'; // browser preview only; the tablet keeps them in the app

const native = () => (window.TabletNative && window.TabletNative.myRecipes ? window.TabletNative : null);

/** sessionStorage: { at, recipe } for a just-deleted recipe, so My recipes can offer "Undo". */
export const UNDO_KEY = 'myrecipe.undo';

export const MEAL_NAMES ={ breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', dessert: 'Dessert' };

/** Saved recipes as typed, newest first. */
export function savedRecipes() {
  let list = [];
  try {
    const N = native();
    list = JSON.parse(N ? N.myRecipes() : (localStorage.getItem(LOCAL_KEY) || '[]')) || [];
  } catch (e) { list = []; }
  return list.slice().sort((a, b) => (b.updated || 0) - (a.updated || 0));
}

export function onMyRecipesChanged(cb) {
  window.addEventListener('tablet-recipes', cb);
  return () => window.removeEventListener('tablet-recipes', cb);
}
const changed = () => window.dispatchEvent(new Event('tablet-recipes'));

/** Save (add, or replace by id). Returns the saved recipe; throws with a friendly message. */
export function saveRecipe(r) {
  const N = native();
  let saved;
  if (N) {
    saved = JSON.parse(N.saveMyRecipe(JSON.stringify(r)) || '{}');
    if (!saved || saved.error) throw new Error((saved && saved.error) || 'Couldn’t save');
  } else {
    // Browser preview: same checks as the tablet app.
    if (!String(r.title || '').trim()) throw new Error('Give it a name');
    if (!(r.ingredients || []).length) throw new Error('Add at least one ingredient');
    if (!(r.steps || []).length) throw new Error('Add at least one step');
    saved = Object.assign({}, r, { id: /^my-[a-z0-9]{4,20}$/.test(r.id || '') ? r.id : `my-${Date.now().toString(36)}`, updated: Date.now() });
    const all = savedRecipes().filter((x) => x.id !== saved.id);
    all.push(saved);
    localStorage.setItem(LOCAL_KEY, JSON.stringify(all));
  }
  changed();
  return saved;
}

export function deleteRecipe(id) {
  const N = native();
  if (N) N.deleteMyRecipe(id);
  else localStorage.setItem(LOCAL_KEY, JSON.stringify(savedRecipes().filter((x) => x.id !== id)));
  changed();
}

// ---- Reading typed lines ------------------------------------------------------------------
const UNICODE_FRAC = { '½': 0.5, '⅓': 0.33, '⅔': 0.67, '¼': 0.25, '¾': 0.75, '⅛': 0.125 };
const UNITS = {
  cup: 'cup', cups: 'cup', c: 'cup',
  tablespoon: 'tbsp', tablespoons: 'tbsp', tbsp: 'tbsp', tbs: 'tbsp', tbl: 'tbsp',
  teaspoon: 'tsp', teaspoons: 'tsp', tsp: 'tsp',
  pound: 'lb', pounds: 'lb', lb: 'lb', lbs: 'lb',
  ounce: 'oz', ounces: 'oz', oz: 'oz',
  clove: 'clove', cloves: 'clove', can: 'can', cans: 'can', jar: 'jar', jars: 'jar',
  package: 'pkg', packages: 'pkg', pkg: 'pkg', pkgs: 'pkg', bag: 'pkg', bags: 'pkg', box: 'pkg', boxes: 'pkg',
  bunch: 'bunch', bunches: 'bunch', slice: 'slice', slices: 'slice', pinch: 'pinch', pinches: 'pinch',
  head: 'head', heads: 'head', stalk: 'stalk', stalks: 'stalk', sprig: 'sprig', sprigs: 'sprig',
  quart: 'quart', quarts: 'quart', qt: 'quart', pint: 'pint', pints: 'pint', pt: 'pint',
  stick: 'stick', sticks: 'stick', piece: 'piece', pieces: 'piece', dash: 'dash', dashes: 'dash',
};
// Best guess at the store aisle, so the shopping list groups things sensibly.
const AISLE_WORDS = [
  ['spices', /\b(salt|black pepper|white pepper|pepper flakes|to taste|cinnamon|paprika|cumin|oregano|thyme|rosemary|chili powder|garlic powder|onion powder|nutmeg|seasoning|bay lea|vanilla|allspice|cloves? \(ground\))/],
  ['frozen', /\bfrozen\b/],
  ['canned', /\b(canned|can\b|beans|broth|stock|tomato sauce|tomato paste|diced tomatoes|crushed tomatoes)/],
  ['seafood', /\b(fish|salmon|shrimp|tuna|cod|tilapia|crab|scallop|clam|mussel)/],
  ['meat', /\b(beef|chicken|pork|turkey|bacon|sausage|ham|steak|lamb|ground|roast|ribs?|chops?|hot dogs?|pepperoni|salami)\b/],
  ['dairy', /\b(milk|cheese|butter|cream|yogurt|eggs?|cheddar|mozzarella|parmesan|half-and-half)\b/],
  ['bakery', /\b(bread|buns?|rolls?|tortillas?|bagels?|pitas?|croissants?)\b/],
  ['produce', /\b(onions?|garlic|potato|tomato|lettuce|carrot|celery|bell pepper|jalape|chile|apple|banana|lemon|lime|berr|spinach|kale|broccoli|cucumber|zucchini|squash|mushroom|avocado|cilantro|parsley|basil|ginger|scallion|cabbage|orange|grape|peach|pear)/],
  ['pantry', /\b(flour|sugar|oil|rice|pasta|noodle|vinegar|honey|syrup|sauce|baking|oats|cereal|chocolate|nuts?|peanut|ketchup|mustard|mayo)/],
];
const guessAisle = (item) => (AISLE_WORDS.find(([, re]) => re.test(item)) || ['pantry'])[0];

/** "1 1/2 cups milk, warm" -> { q: 1.5, u: 'cup', item: 'milk', note: 'warm', aisle: 'dairy' } */
export function parseIngredient(line) {
  // "a pinch of salt", "an onion", "half a cup of milk": words for numbers count as numbers.
  let s = String(line).trim().replace(/^[-•*]\s*/, '')
    .replace(/^half an?\s+/i, '½ ').replace(/^an?\s+(?!(few|little|bit|couple|handful|splash|drizzle|knob|squeeze)\b)(?=[a-z])/i, '1 ');
  let q = null;
  const num = s.match(/^(\d+)\s+(\d+)\/(\d+)|^(\d+)\/(\d+)|^(\d*\.?\d+)\s*([½⅓⅔¼¾⅛])?|^([½⅓⅔¼¾⅛])/);
  if (num) {
    if (num[1]) q = +num[1] + num[2] / num[3];
    else if (num[4]) q = num[4] / num[5];
    else if (num[6]) q = +num[6] + (num[7] ? UNICODE_FRAC[num[7]] : 0);
    else q = UNICODE_FRAC[num[8]];
    s = s.slice(num[0].length).replace(/^\s*(-|to)\s*[\d½⅓⅔¼¾⅛/.]+/, '').trim(); // "2-3 cloves": use the first number
  }
  // "1 (14.5 oz) can diced tomatoes": keep the size with the item.
  let size = '';
  const paren = s.match(/^\(([^)]{1,20})\)\s*/);
  if (paren) { size = ` (${paren[1]})`; s = s.slice(paren[0].length); }
  let u = '';
  const w = s.match(/^([A-Za-z]+)\.?\s+(of\s+)?/);
  if (q != null && w && UNITS[w[1].toLowerCase()]) { u = UNITS[w[1].toLowerCase()]; s = s.slice(w[0].length); }
  let note = '';
  const comma = s.indexOf(',');
  if (comma > 0) { note = s.slice(comma + 1).trim(); s = s.slice(0, comma).trim(); }
  const item = ((s || String(line).trim()) + size).slice(0, 60);
  const out = { q: q && q > 0 ? Math.round(q * 1000) / 1000 : null, u, item: q == null ? item : item.toLowerCase(), aisle: guessAisle(item.toLowerCase()) };
  if (note) out.note = note;
  return out;
}

const VERBS = /\b(preheat|bake|roast|broil|grill|simmer|boil|cook|fry|sauté|saute|brown|steam|microwave|rest|chill|cool|freeze|marinate|soak|rise|proof|toast|heat|stir|whisk|knead|blend|steep)\b/;

/** How long a step says to wait, in seconds, or 0: "25 minutes", "1 hour 30 minutes",
 *  "1½ hours", "half an hour", "an hour", "45 seconds", "20-25 min" (the first number). */
export function stepSeconds(text) {
  const t = String(text).toLowerCase().replace(/half an? hour/g, '30 minutes').replace(/\ban hour\b/g, '1 hour')
    .replace(/(\d+)\s*½/g, '$1.5').replace(/½/g, '0.5').replace(/(\d+)\s+1\/2/g, '$1.5');
  const m = t.match(/(\d+(?:\.\d+)?)\s*(?:(?:-|–|to)\s*\d+(?:\.\d+)?\s*)?(minutes?|mins?|hours?|hrs?|seconds?|secs?)\b(?:\s*(?:and\s*)?(\d+)\s*(minutes?|mins?))?/);
  if (!m) return 0;
  const unit = /^h/.test(m[2]) ? 3600 : /^s/.test(m[2]) ? 1 : 60;
  return Math.round(parseFloat(m[1]) * unit + (m[3] && unit === 3600 ? +m[3] * 60 : 0));
}

/** "Bake 25 minutes until golden" -> { text, timer: 1500, timerLabel: 'Bake' } */
export function parseStep(line) {
  const text = String(line).trim().replace(/^(\d+[.)]|step\s*\d+[:.]?)\s*/i, '');
  const step = { text };
  const secs = stepSeconds(text);
  if (secs) {
    if (secs >= 30 && secs <= 24 * 3600) {
      step.timer = secs;
      const verb = (text.toLowerCase().match(VERBS) || ['timer'])[0];
      step.timerLabel = verb.charAt(0).toUpperCase() + verb.slice(1);
    }
  }
  return step;
}

/** A saved recipe in the library's shape (cuisine 'mine', type = its meal). */
export function toRecipe(x) {
  return {
    id: x.id,
    title: x.title,
    blurb: x.blurb || '',
    cuisine: 'mine',
    type: MEAL_NAMES[x.meal] ? x.meal : 'dinner',
    serves: x.serves || 4,
    prep: x.prep || 0,
    cook: x.cook || 0,
    tags: [],
    ingredients: (x.ingredients || []).map(parseIngredient),
    steps: (x.steps || []).map(parseStep),
    mine: true,
  };
}
