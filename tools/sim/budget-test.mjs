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
// More of these: chicken is chosen more often when asked for.
const chick = (s) => bp.choose(slots, pools, s, 5).slots.filter((x) => byId[x.id].main === 'chicken').length;
check('"more chicken" picks more chicken', chick(Object.assign({}, setup, { more: ['chicken'] })) > chick(setup), true);
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
