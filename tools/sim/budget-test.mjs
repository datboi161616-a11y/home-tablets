// node tools/sim/budget-test.mjs
// "Plan on a budget" (js/services/budget-plan.js, grocery-prices.js) against answers worked
// out by hand: what an amount of something costs, staples left out, a whole recipe, and a
// week that stays under its budget (no repeats, nothing left out sneaks in, kept meals stay).
globalThis.location = { search: '', hash: '' };
const store = {};
globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem(k, v) { store[k] = String(v); }, removeItem(k) { delete store[k]; }, key: () => null, length: 0 };
globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.dispatchEvent = () => {};
const gp = await import(new URL('../../js/services/grocery-prices.js', import.meta.url));
const bp = await import(new URL('../../js/services/budget-plan.js', import.meta.url));
const { webIngredient } = await import(new URL('../../js/services/web-recipes.js', import.meta.url));

let bad = 0;
let n = 0;
const near = (a, b) => Math.abs(a - b) < 0.011;
function check(name, got, want) {
  n++;
  const ok = typeof want === 'number' ? near(got, want) : JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { bad++; console.log(`FAIL  ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } else console.log(`ok    ${name}`);
}
// One ingredient line as a site writes it -> its cost.
const cost = (amount, unit, name) => gp.ingredientCost(webIngredient({ amount, unit, name }));

// ---- amounts -> cost (prices from the table: $ per what the store sells) ----
check('1 lb ground beef ($5.49/lb)', cost('1', 'lb', 'ground beef'), 5.49);
check('8 oz ground beef = half of $5.49', cost('8', 'oz', 'ground beef'), 2.75);
check('2 tbsp butter = 1/16 lb of $4.49', cost('2', 'tablespoons', 'unsalted butter'), 0.28);
check('3 cloves garlic (a 9-clove head $0.60)', cost('3', 'cloves', 'garlic, minced'), 0.2);
check('2 large eggs ($3.49 a dozen)', cost('2', '', 'large eggs'), 0.58);
check('1 cup milk ($3.99 a gallon of 16 cups)', cost('1', 'cup', 'whole milk'), 0.25);
check('1 (15 oz) can black beans ($0.99)', cost('1', '15 oz can', 'black beans, drained'), 0.99);
check('2 medium carrots (0.14 lb each at $1.29/lb)', cost('2', '', 'medium carrots, diced'), 0.36);
check('1 red bell pepper ($1.29 each)', cost('1', '', 'red bell pepper, sliced'), 1.29);
check('400 g chicken thighs (made into 14 oz) at $3.49/lb', cost('400', 'g', 'boneless skinless chicken thighs'), 3.05);
check('something nobody listed: $0.75 a line', cost('2', 'tbsp', 'yuzu kosho'), 0.75);
check('something nobody listed, weighed: $4.99/lb', cost('1', 'lb', 'rabbit legs'), 4.99);
check('6 leaves lettuce is not 6 heads', cost('6', '', 'leaves romaine lettuce') < 0.5, true);
check('6 small romaine lettuce leaves is not 6 heads', cost('6', '', 'small romaine lettuce leaves') < 0.5, true);
check('8 pieces butter lettuce is not 8 heads', cost('8', 'pieces', 'butter lettuce') < 1.5, true);
check('4 pork steaks or chops are pork (0.45 lb each at $3.99/lb), not beef steak', cost('4', '', 'pork steaks or chops'), 7.18);
check('2 x 400 g cans butter beans are beans, not butter', cost('2 x 400g/14oz', 'cans', 'butter beans') < 2.5, true);
check('"5 tightly packed cups kale": cups, not 5 bunches', cost('5', 'tightly packed cups', 'kale leaves') < 2, true);
check('1 (3 lb) chicken counted by its size: 3 lb at $1.79', cost('1', '(3 lb)', 'whole chicken'), 5.37);

// ---- staples cost nothing ----
const staple = (name, unit = 'tsp') => gp.isStaple(webIngredient({ amount: '1', unit, name }));
['salt', 'kosher salt', 'black pepper', 'freshly ground black pepper', 'olive oil', 'extra-virgin olive oil', 'vegetable oil', 'water',
  'ground cumin', 'smoked paprika', 'dried oregano', 'garlic powder', 'red pepper flakes', 'bay leaves', 'cooking spray']
  .forEach((s) => check(`staple: ${s}`, staple(s), true));
['red bell pepper', 'garlic cloves', 'chicken thighs', 'sun-dried tomatoes', 'jalapeño pepper', 'salted butter', 'water chestnuts', 'fresh thyme', 'cayenne pepper']
  .forEach((s) => check(`not a staple: ${s}`, staple(s, s === 'fresh thyme' ? 'tbsp' : ''), s === 'cayenne pepper'));
check('a staple costs $0', cost('2', 'tbsp', 'olive oil'), 0);

// ---- a whole recipe ----
// Budget Bytes: its own prices in the notes, staples (oil, salt) left out.
const bb = { title: 'Ham and Bean Soup', serves: 4, cost: '', ingredients: [
  { amount: '1', unit: '', name: 'yellow onion', notes: 'diced $0.95' },
  { amount: '3', unit: '', name: 'carrots', notes: '$0.75' },
  { amount: '1', unit: 'lb.', name: 'cooked ham', notes: 'diced, $5.92*' },
  { amount: '1', unit: 'Tbsp', name: 'cooking oil', notes: '$0.04' },
  { amount: '3', unit: '15.5 oz. cans', name: 'cannellini beans', notes: '$2.76**' },
  { amount: '½', unit: 'tsp', name: 'salt', notes: '$0.02' },
] };
const pbb = bp.priceRecipe(bb);
check('Budget Bytes recipe: its own prices, oil and salt out', pbb.total, 0.95 + 0.75 + 5.92 + 2.76);
check('Budget Bytes recipe: own prices used', pbb.own, true);
// Elsewhere: the table. 1 lb chicken breast 3.99 + 1 onion 0.65 + 2 tbsp butter 0.28 + 1 cup rice 0.66 + salt 0.
const est = { title: 'Chicken and Rice', serves: 4, cost: '', ingredients: [
  { amount: '1', unit: 'lb', name: 'boneless skinless chicken breasts', notes: '' },
  { amount: '1', unit: '', name: 'yellow onion', notes: 'chopped' },
  { amount: '2', unit: 'tablespoons', name: 'butter', notes: '' },
  { amount: '1', unit: 'cup', name: 'long-grain white rice', notes: '' },
  { amount: '1', unit: 'teaspoon', name: 'salt', notes: '' },
  { amount: '1', unit: 'group', name: 'For serving', type: 'group' },
] };
const pest = bp.priceRecipe(est);
check('estimated recipe total', pest.total, 3.99 + 0.65 + 0.28 + 0.66);
const cand = bp.candidate(Object.assign({ id: 'web:x:1', minutes: 30, img: '', alt: '', site: 'Test' }, est), 'dinner');
check('cost for 2 of a recipe for 4 = half', bp.priceFor(cand, 2), Math.round((3.99 + 0.65 + 0.28 + 0.66) / 2 * 100) / 100);
check('a sauce is not a meal', bp.candidate(Object.assign({ id: 'web:x:2', minutes: 10 }, est, { title: 'Enchilada Sauce' }), 'dinner'), null);

// ---- choosing a week ----
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const MAINS = ['chicken', 'beef', 'beans', 'pasta', 'pork', 'eggs', 'fish', 'tofu'];
const pool = (meal, count, lo, hi) => Array.from({ length: count }, (x, i) => {
  const main = MAINS[i % MAINS.length];
  const mush = i % 5 === 0;
  return { id: `web:t:${meal}${i}`, t: `${meal} ${main} ${i}${mush ? ' with mushrooms' : ''}`, meal, m: 20 + (i % 4) * 15, s: 4, p1: Math.round((lo + rnd() * (hi - lo)) * 100) / 100,
    it: {}, w: ` ${meal} ${main} ${mush ? 'mushrooms' : ''} `, main, cu: '' };
});
const pools = { breakfast: pool('breakfast', 30, 0.4, 2.5), dinner: pool('dinner', 40, 1, 6) };
const setup = { budget: 60, days: 'next', picked: [], serves: 2, meals: ['breakfast', 'dinner'], more: [], out: ['mushrooms'], addedMore: [], addedOut: [] };
const slots = bp.setupSlots(setup);
check('next week, breakfast and dinner: 14 meals', slots.length, 14);
const byId = {};
Object.keys(pools).forEach((m) => pools[m].forEach((c) => { byId[c.id] = c; }));
const week = bp.choose(slots, pools, setup, 3).slots;
const sum = bp.total(week, byId, 2);
check(`the week ($${sum}) stays under $60`, sum <= 60, true);
check('every meal has a recipe of its own meal', week.every((x) => byId[x.id] && byId[x.id].meal === x.meal), true);
check('no repeats', new Set(week.map((x) => x.id)).size, 14);
check('nothing with mushrooms', week.some((x) => /mushroom/.test(byId[x.id].w)), false);
check('the leave-out word covers its family ("seafood" finds shrimp)', bp.wordsRe(['seafood']).test(' garlic shrimp '), true);
check('"egg" is not "eggplant"', bp.wordsRe(['eggs']).test(' roasted eggplant '), false);
// Kept meals stay when the rest is shuffled.
week[0].keep = true;
week[5].keep = true;
const again = bp.choose(week, pools, setup, 99).slots;
check('kept meals stay on shuffle', [again[0].id, again[5].id], [week[0].id, week[5].id]);
check('shuffle changes the others', again.filter((x, i) => !x.keep && x.id !== week[i].id).length > 4, true);
// More of these: a nudge, not a takeover. Pasta liked: 2–3 of 7 dinners are pasta, every time.
const big = { breakfast: pool('breakfast', 120, 0.4, 2.5), dinner: pool('dinner', 200, 1, 6) };
const bigById = {};
Object.keys(big).forEach((m) => big[m].forEach((c) => { bigById[c.id] = c; }));
const roomy = Object.assign({}, setup, { budget: 120 });
const counts = (s, test, runs = 40) => Array.from({ length: runs }, (x, r) => bp.choose(slots, big, s, 100 + r).slots.filter((y) => y.meal === 'dinner' && test(bigById[y.id])).length);
const pasta = counts(Object.assign({}, roomy, { more: ['pasta'] }), (c) => c.main === 'pasta');
check(`"more pasta": 2–3 pasta dinners of 7 in each of 40 weeks (got ${Math.min(...pasta)}–${Math.max(...pasta)})`, pasta.every((k) => k >= 2 && k <= 3), true);
const none = counts(roomy, (c) => c.main === 'pasta');
check(`...and without it, pasta only now and then (got ${Math.min(...none)}–${Math.max(...none)})`, Math.max(...none) <= 2, true);
// Several likes: shared out, each at least once, the rest of the week other things.
const three = Array.from({ length: 30 }, (x, r) => bp.choose(slots, big, Object.assign({}, roomy, { more: ['pasta', 'chicken', 'beef'] }), 300 + r).slots.filter((y) => y.meal === 'dinner').map((y) => bigById[y.id].main));
check('three likes: each comes at least once in every week', three.every((w) => ['pasta', 'chicken', 'beef'].every((m) => w.indexOf(m) >= 0)), true);
check('three likes: still at least 2 other dinners in every week', three.every((w) => w.filter((m) => ['pasta', 'chicken', 'beef'].indexOf(m) < 0).length >= 2), true);
// A like nothing matches once something is left out: said so, and the week is still made.
const clash = Object.assign({}, roomy, { more: ['tofu dish'], out: ['mushrooms'] });
check('a like nothing matches is reported', bp.unmatchedLikes(big, clash), ['tofu dish']);
check('...and the week is still made', bp.choose(slots, big, clash, 1).slots.every((x) => x.id), true);
// Shuffle: what was shown lately waits, so five shuffles in a row are mostly new.
let shown = {};
let prev = bp.choose(slots, big, roomy, 7, shown).slots;
const overlaps = [];
for (let r = 0; r < 5; r++) {
  prev.forEach((x) => { shown[x.id] = Date.now(); });
  const next = bp.choose(slots, big, roomy, 1000 + r, shown).slots;
  overlaps.push(next.filter((x) => prev.some((y) => y.id === x.id)).length);
  prev = next;
}
check(`five shuffles in a row: next to nothing repeats (overlaps ${overlaps.join(', ')} of 14)`, overlaps.every((k) => k <= 1), true);
shown = {};

// ---- what suits a meal ----
check('tuna melt is not breakfast', bp.fitsMeal('Classic Tuna Melt', 'breakfast'), false);
check('waldorf salad is not breakfast', bp.fitsMeal('Waldorf Salad', 'breakfast'), false);
check('an omelette is breakfast', bp.fitsMeal('Fluffy Egg White Omelette', 'breakfast'), true);
check('breakfast tacos are breakfast', bp.fitsMeal('Breakfast Tacos', 'breakfast'), true);
check('pancakes are not dinner', bp.fitsMeal('Fluffy Pancakes', 'dinner'), false);
check('cake is not dinner', bp.fitsMeal('Cream Cheese Pound Cake', 'dinner'), false);
check('chicken pot pie is dinner', bp.fitsMeal('Chicken Pot Pie', 'dinner'), true);
check('a latte is no meal', bp.fitsMeal('Iced Latte (Salty Canadian)', 'breakfast'), false);
check('tzatziki is no meal', bp.fitsMeal('Tzatziki', 'lunch'), false);
// ---- leave-out families ----
const out = (ids, text) => !!bp.outTest(ids)(` ${text} `);
check('dairy: cheddar is out', out(['dairy'], 'sharp cheddar'), true);
check('dairy: peanut butter is not dairy', out(['dairy'], 'peanut butter · honey'), false);
check('dairy: coconut milk is not dairy', out(['dairy'], 'coconut milk curry'), false);
check('gluten: soy sauce is out', out(['gluten'], 'soy sauce'), true);
check('gluten: rice noodles are fine', out(['gluten'], 'rice noodles · lime'), false);
check('eggs: eggplant is fine', out(['eggs'], 'roasted eggplant'), false);
check('beans: green beans are fine', out(['beans'], 'green beans almondine'), false);
check('beans: chickpeas are out', out(['beans'], 'chickpeas'), true);
check('onions: onion powder is fine', out(['onions'], 'onion powder'), false);
check('pork: turkey bacon is fine', out(['pork'], 'turkey bacon'), false);
check('seafood covers shrimp', out(['seafood'], 'garlic shrimp'), true);
check('your own word: "kale" finds kale', out(['kale'], 'kale salad'), true);
// A budget too small: the cheapest it can do, and the over-budget swaps are empty then.
const tight = Object.assign({}, setup, { budget: 10 });
const cheap = bp.choose(slots, pools, tight, 3).slots;
const cheapest = [...bp.usable(pools.breakfast, tight)].sort((a, b) => a.p1 - b.p1).slice(0, 7).reduce((a, c) => a + bp.priceFor(c, 2), 0)
  + [...bp.usable(pools.dinner, tight)].sort((a, b) => a.p1 - b.p1).slice(0, 7).reduce((a, c) => a + bp.priceFor(c, 2), 0);
check('too little money: the week is the cheapest it can be', bp.total(cheap, byId, 2), Math.round(cheapest * 100) / 100);
check('...and no swap left to offer', bp.overSwaps(cheap, pools, tight).length, 0);
// A pricey pick by hand: the panel offers a swap that brings it back.
const hand = bp.choose(slots, pools, setup, 3).slots;
const priciest = [...bp.usable(pools.dinner, setup)].sort((a, b) => b.p1 - a.p1).find((c) => !hand.some((x) => x.id === c.id));
hand[1].id = priciest.id;
const tight2 = Object.assign({}, setup, { budget: Math.floor(bp.total(hand, byId, 2)) - 1 });
const sw = bp.overSwaps(hand, pools, tight2);
check('over budget: a swap is offered', sw.length > 0, true);
sw.forEach((s) => { hand[s.i].id = s.to; });
check('...and making it brings the week under', bp.total(hand, byId, 2) <= tight2.budget, true);

console.log(bad ? `\n${bad} of ${n} FAILED` : `${n}/${n} budget sums right`);
process.exit(bad ? 1 : 0);
