// "Plan on a budget": meals for chosen days that fit an amount of money (screens/budget.js).
//
// Prices. What a recipe costs = what its ingredients cost for the amount it uses (a tablespoon
// of butter, not the pound), pantry staples left out (salt, pepper, oil, water, common dried
// spices), then scaled to the people it is planned for. Budget Bytes writes each ingredient's
// price in its notes ("$0.74"): those are used as they are. Everything else is an estimate from
// grocery-prices.js (typical US store-brand prices). The screens always say "est." / "about".
//
// Choosing. For each day × meal: recipes of that meal (the sites' own courses, tidied by title:
// no tuna melt for breakfast, no cake for dinner), none with a "leave out" word in the title or
// ingredients (with their families: "seafood" is shrimp, salmon…). "More of these" is a nudge:
// about a third of a meal's slots go to what was liked (spread over the likes), the rest are
// anything else. Mains are spread over the week, nothing repeats, and recipes shown lately are
// left for later while there are others. A greedy fill aims each meal at its share of the
// budget; then, while the week is over, the priciest picks give way to cheaper ones of the same
// kind. Kept meals never change.
//
// The recipes to choose from grow: the first few dozen of each meal come at once, then more
// pages (a different page each time) and searches for the liked things, a few at a time, in the
// background. Kept on the screen: each meal's recipes (budget.pool.v2), the recipes shown lately
// (budget.shown.v1), the last setup (budget.setup.v1), and what was last sent to the Week plan
// (budget.sent.v1) for the Shopping list's banner and prices.
import { mealRecipes, mealSites, webIngredient, plainText, keepWebRecipe, loadWebRecipe, cachedWebRecipe } from './web-recipes.js';
import { ingredientCost, isStaple, findPrice, round2 } from './grocery-prices.js';
import {
  itemKey, getPlan, planDays, addToPlan, removeFromPlan, setMealServings, snapshotDays, getListState, setListNextWeek, buildShoppingList,
} from './meal-plan.js';

const POOL_KEY = 'budget.pool.v2';
const SHOWN_KEY = 'budget.shown.v1';
const SETUP_KEY = 'budget.setup.v1';
const SENT_KEY = 'budget.sent.v1';

const read = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch (e) { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
const online = () => !(typeof navigator !== 'undefined' && navigator.onLine === false);

// ---- Words: what can be liked, what can be left out -------------------------------------------
const MEAT = /(?:^|[^a-z])(meat|beef|steak|chicken|pork|bacon|ham|sausages?|turkey|lamb|chorizo|prosciutto|pancetta|salami|pepperoni|meatballs?|brisket|duck|veal|shrimp|prawns?|salmon|tuna|cod|tilapia|fish|crab|lobster|scallops?|mussels?|clams?|anchov\w*|sardines?|halibut)(?![a-z])/;
const SEAFOOD = 'seafood|fish|shrimp|prawns?|salmon|tuna|cod|tilapia|halibut|haddock|crab|lobster|scallops?|mussels?|clams?|oysters?|anchov\\w*|sardines?|mahi|calamari|squid|swai|pollock|trout|shellfish';
const t = (re) => (c, tl) => re.test(tl);
/**
 * "More of these": [id, label, test(candidate, ' title in lower case '), title words to search
 * the sites for]. Tests read the title (and the cuisine the site gives), so "pasta" means pasta
 * dishes, not every recipe with a little pasta in it.
 */
export const LIKES = [
  ['chicken', 'Chicken', t(/[^a-z]chicken[^a-z]/), ['chicken']],
  ['beef', 'Beef', (c, tl) => /[^a-z](beef|steak|brisket|meatballs?|meatloaf|burgers?|sirloin|short ribs?|bulgogi|stroganoff|bolognese|cheesesteaks?|pot roast|sloppy joes?)[^a-z]/.test(tl)
    && !/turkey|chicken|veggie|vegetarian|bean|salmon|tuna|lentil|tofu|portobello|mushroom burger|cauliflower|vegan/.test(tl), ['beef', 'steak']],
  ['pork', 'Pork', t(/[^a-z](pork|bacon|ham|sausages?|chorizo|carnitas|prosciutto|pancetta|ribs|porchetta|kielbasa)[^a-z]/), ['pork', 'sausage']],
  ['seafood', 'Seafood', t(new RegExp(`[^a-z](${SEAFOOD})[^a-z]`)), ['shrimp', 'salmon', 'fish']],
  ['pasta', 'Pasta', t(/[^a-z](pasta|spaghetti|penne|noodles?|macaroni|mac and cheese|mac n cheese|lasagna|lasagne|gnocchi|orzo|linguine|fettuccine|ziti|rigatoni|tortellini|ravioli|carbonara|alfredo|bolognese|lo mein|pad thai|cacio e pepe|bucatini|pappardelle|tetrazzini)[^a-z]/), ['pasta', 'spaghetti']],
  ['rice', 'Rice', t(/[^a-z](rice|risotto|paella|jambalaya|biryani|pilaf|burrito bowls?|congee|nasi goreng)[^a-z]/), ['rice']],
  ['vegetarian', 'Vegetarian', (c) => !MEAT.test(c.w), ['vegetarian', 'vegetable']],
  ['soup', 'Soup & stew', t(/[^a-z](soups?|stews?|chili|chowder|bisque|pho|ramen|gumbo|minestrone|pozole)[^a-z]/), ['soup', 'stew']],
  ['salad', 'Salads', t(/[^a-z](salads?|slaw)[^a-z]/), ['salad']],
  ['mexican', 'Mexican', (c, tl) => /mexican|tex-mex/.test(c.cu) || /[^a-z](tacos?|burritos?|enchiladas?|quesadillas?|fajitas?|nachos|tamales?|carnitas|tostadas?|chilaquiles|huevos|mexican|taquitos|pozole|birria|chimichangas?|elote)[^a-z]/.test(tl), ['taco', 'enchilada']],
  ['italian', 'Italian', (c, tl) => /italian/.test(c.cu) || /[^a-z](italian|lasagna|parmesan|parmigiana|marsala|piccata|cacciatore|risotto|gnocchi|carbonara|bolognese|pizza|calzone|stromboli|ziti|alfredo|tuscan|caprese|minestrone|puttanesca|arrabbiata)[^a-z]/.test(tl), ['italian', 'parmesan']],
  ['asian', 'Asian', (c, tl) => /chinese|japanese|thai|korean|vietnamese|asian|indian|indonesian/.test(c.cu) || /[^a-z](stir.?fry|teriyaki|lo mein|fried rice|pad thai|ramen|bulgogi|kung pao|orange chicken|sesame|general tso|curry|katsu|pho|banh mi|bibimbap|dumplings?|potstickers|satay|mapo|udon|miso|tikka|masala|korma|dal|tandoori|laksa|larb|egg rolls?|hoisin|mongolian|thai|chinese|korean|japanese|vietnamese)[^a-z]/.test(tl), ['stir fry', 'curry']],
  ['slow cooker', 'Slow cooker', t(/slow cooker|crock ?pot|crockpot/), ['slow cooker', 'crockpot']],
  ['one pot', 'One pot', t(/one.?pot|one.?pan|skillet/), ['one pot', 'skillet']],
  ['sheet pan', 'Sheet pan', t(/sheet.?pan|tray ?bake/), ['sheet pan']],
  ['quick', 'Quick · under 30 min', (c) => c.m > 0 && c.m <= 30, ['easy', 'quick']],
  ['kid', 'Kid-friendly', t(/[^a-z](mac and cheese|pizzas?|nuggets?|tenders|grilled cheese|sloppy joes?|tacos?|meatballs?|quesadillas?|pancakes?|waffles?|burgers?|spaghetti|french toast|sliders|hot dogs?|corn dogs?|chicken fingers|fish sticks|tater tots?|cheesy)[^a-z]/), ['cheesy', 'pizza']],
  ['healthy', 'Healthy & light', t(/[^a-z](healthy|light|skinny|lean|salads?|bowls?|quinoa|lentils?|veggie|vegetables?|grilled|zucchini noodles|zoodles|cauliflower rice|power|protein)[^a-z]/), ['healthy', 'bowl']],
  ['comfort', 'Comfort food', t(/[^a-z](casseroles?|pot pie|mac and cheese|meatloaf|stews?|chili|lasagna|shepherd.?s pie|cottage pie|dumplings|mashed|stroganoff|pot roast|chicken and rice|bake|biscuits and gravy|gravy|grilled cheese|chowder|cheesy|creamy|smothered)[^a-z]/), ['casserole', 'creamy']],
  ['grill', 'Grill & BBQ', t(/[^a-z](grill|grilled|bbq|barbecue|kebabs?|kabobs?|skewers|smoked|pulled)[^a-z]/), ['grilled', 'bbq']],
  ['eggs', 'Eggs', t(/[^a-z](eggs?|frittata|quiche|omelets?|omelettes?|shakshuka|scramble|benedict|strata)[^a-z]/), ['egg', 'frittata']],
  ['pancakes', 'Pancakes & waffles', t(/[^a-z](pancakes?|waffles?|french toast|crepes?)[^a-z]/), ['pancake', 'waffle']],
  ['oats', 'Oats & granola', t(/[^a-z](oats|oatmeal|granola|porridge|muesli|chia pudding|overnight)[^a-z]/), ['oat']],
  ['sandwich', 'Sandwiches & wraps', t(/[^a-z](sandwich(es)?|wraps?|melts?|subs?|paninis?|sliders|burgers?|grilled cheese|banh mi|pitas?|hoagies?)[^a-z]/), ['sandwich', 'wrap']],
];
const LIKE_BY = {};
LIKES.forEach((l) => { LIKE_BY[l[0]] = l; });
/**
 * "Leave out": [id, label, words found anywhere in the title or ingredients (a regex source;
 * plurals are found too), phrases that don't count ("peanut butter" isn't dairy)]. Word matching,
 * not a promise: the screens never call it allergy-safe.
 */
export const DISLIKES = [
  ['mushrooms', 'Mushrooms', 'mushrooms?|portobellos?|shiitakes?|creminis?|porcini|chanterelles?'],
  ['seafood', 'Seafood', SEAFOOD],
  ['shellfish', 'Shellfish', 'shellfish|shrimp|prawns?|crab|lobster|scallops?|mussels?|clams?|oysters?|calamari|squid'],
  ['fish', 'Fish', 'fish|salmon|tuna|cod|tilapia|halibut|haddock|anchov\\w*|sardines?|mahi|swai|pollock|trout|fish sauce'],
  ['pork', 'Pork', 'pork|bacon|ham|sausages?|chorizo|prosciutto|pancetta|salami|pepperoni|andouille|kielbasa|carnitas|hot dogs?|lard|porchetta', 'chicken sausage|turkey sausage|turkey bacon|veggie sausage|vegan sausage'],
  ['beef', 'Beef', 'beef|steaks?|brisket|sirloin|ribeye|chuck|short ribs?|ground beef|veal|oxtail', 'beefsteak tomato|beef stock cube|cauliflower steak'],
  ['chicken', 'Chicken', 'chicken', 'chicken of the woods'],
  ['lamb', 'Lamb', 'lamb|mutton'],
  ['spicy', 'Spicy', 'spicy|jalape\\w*|chipotles?|sriracha|cayenne|hot sauce|chil(?:i|li) flakes|red pepper flakes|crushed red pepper|gochujang|habaneros?|sambal|buffalo|serranos?|harissa|cajun|thai chil\\w*|chili garlic|hot peppers?|bird.?s eye'],
  ['cilantro', 'Cilantro', 'cilantro|coriander leaves|fresh coriander'],
  ['olives', 'Olives', 'olives?|tapenade', 'olive oil'],
  ['onions', 'Onions', 'onions?|shallots?|scallions?|leeks?|green onions?|spring onions?|chives', 'onion powder'],
  ['tomatoes', 'Tomatoes', 'tomato(?:es)?|marinara|passata|pasta sauce|pizza sauce|salsa|ketchup|bolognese|tomatillos?'],
  ['eggs', 'Eggs', 'eggs?|egg yolks?|egg whites?|frittata|quiche|omelets?|mayonnaise|mayo|aioli', 'eggplants?'],
  ['dairy', 'Dairy', 'milk|cheese|cream|butter|yogurt|yoghurt|parmesan|parmigiano|mozzarella|cheddar|feta|ricotta|ghee|buttermilk|half and half|sour cream|cream cheese|mascarpone|gruyere|halloumi|queso|paneer|alfredo',
    'peanut butter|almond butter|cashew butter|nut butter|coconut milk|coconut cream|almond milk|oat milk|soy milk|cream of tartar|butternut|butter beans|apple butter|cocoa butter|vegan butter|vegan cheese|ice cream maker'],
  ['cheese', 'Cheese', 'cheese|cheesy|parmesan|parmigiano|mozzarella|cheddar|feta|ricotta|gouda|brie|provolone|gruyere|pecorino|queso|halloumi|mascarpone|cotija|monterey jack|colby|paneer|burrata', 'vegan cheese'],
  ['nuts', 'Nuts', 'nuts|almonds?|walnuts?|pecans?|cashews?|pistachios?|hazelnuts?|pine nuts|macadamias?|peanuts?|peanut butter|almond butter|almond milk|almond flour|pesto|praline|satay'],
  ['peanuts', 'Peanuts', 'peanuts?|peanut butter|peanut sauce|satay'],
  ['gluten', 'Gluten (wheat)', 'flour|bread|breadcrumbs?|panko|pasta|noodles?|spaghetti|penne|macaroni|lasagna|tortillas?|soy sauce|wheat|barley|couscous|buns?|rolls|pizza|pie crust|puff pastry|biscuits?|crackers?|croutons|beer|pitas?|naan|bagels?|orzo|ramen|udon|seitan|dumplings?|gnocchi|wraps?|sandwich(?:es)?|baguette|brioche|crumbs|farro|bulgur|semolina|graham'
    + '|fettuccine|linguine|tortellini|pastina|ditalini|orecchiette|alphabet pasta|ravioli|rigatoni|ziti|fusilli|farfalle|rotini|shells|bucatini|pappardelle|tagliatelle|vermicelli|lo mein|sourdough|ciabatta|focaccia|croissants?|english muffins?|sliders|hoagies?|subs|stuffing|batter|breaded|tempura|pastry|pie|cake|cookies?|muffins?|pancakes?|waffles?|french toast|crepes?|scones?|stromboli|calzone|panini|toast|biscuit|roux|gravy',
    'gluten.free|rice noodles|corn tortillas?|rice flour|almond flour|coconut flour|tamari|cauliflower rice|rice paper|tortilla chips'],
  ['beans', 'Beans & lentils', 'beans?|chickpeas?|garbanzos?|lentils?|black.eyed peas|edamame|refried|hummus|cannellini|pintos?|falafel|dal', 'green beans?|string beans|vanilla beans?|coffee beans?|jelly beans'],
  ['eggplant', 'Eggplant', 'eggplants?|aubergines?|baba ganoush|moussaka'],
  ['coconut', 'Coconut', 'coconut'],
  ['mayo', 'Mayo', 'mayo|mayonnaise|aioli|miracle whip'],
  ['tofu', 'Tofu', 'tofu|tempeh|seitan'],
  ['peppers', 'Bell peppers', 'bell peppers?|red peppers?|green peppers?|yellow peppers?|capsicums?|sweet peppers?|roasted red peppers?|fajitas?', 'red pepper flakes'],
  ['avocado', 'Avocado', 'avocados?|guacamole'],
  ['pineapple', 'Pineapple', 'pineapples?'],
  ['raisins', 'Raisins', 'raisins?|currants?|sultanas?'],
];
const DIS_BY = {};
DISLIKES.forEach((d) => { DIS_BY[d[0]] = d; });
const reEsc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordRe = (src) => new RegExp(`(?:^|[^a-z])(?:${src})(?:s|es)?(?![a-z])`);
const outRes = {};
/** A test for leave-out words (list ids or anyone's own words): true when a text has one. */
export function outTest(list) {
  const tests = (list || []).map((w) => {
    w = String(w || '').toLowerCase().trim();
    if (!w) return null;
    const d = DIS_BY[w];
    if (d) {
      const key = `d:${w}`;
      if (!outRes[key]) outRes[key] = { re: wordRe(d[2]), unless: d[3] ? new RegExp(`(?:${d[3]})`, 'g') : null };
      return outRes[key];
    }
    const one = w.length > 3 ? w.replace(/(es|s)$/, '') : w;
    return { re: wordRe(reEsc(one)), unless: null };
  }).filter(Boolean);
  return tests.length ? (text) => tests.some((x) => x.re.test(x.unless ? text.replace(x.unless, ' ') : text)) : null;
}
/** Kept for older callers and the tests: a regex for words (whole words, plurals too). */
export function wordsRe(list) {
  const parts = (list || []).map((w) => { w = String(w || '').toLowerCase().trim(); const d = DIS_BY[w]; return d ? d[2] : w ? reEsc(w.length > 3 ? w.replace(/(es|s)$/, '') : w) : ''; }).filter(Boolean);
  return parts.length ? wordRe(parts.join('|')) : null;
}
// A like: one of LIKES, or anyone's own word (in the title, else in the ingredients).
function likeTest(id) {
  if (LIKE_BY[id]) return LIKE_BY[id][2];
  const re = wordRe(reEsc(id.length > 3 ? id.replace(/(es|s)$/, '') : id));
  return (c, tl) => re.test(tl);
}
const likeSearch = (id) => (LIKE_BY[id] ? LIKE_BY[id][3] : [id]);

// ---- The setup --------------------------------------------------------------------------
/** The chips: [id, label] (MORE_CHIPS = what can be liked, OUT_CHIPS = left out). */
export const MORE_CHIPS = LIKES.map((l) => [l[0], l[1]]);
export const OUT_CHIPS = DISLIKES.map((d) => [d[0], d[1]]);
// (Old saved setups used these ids.)
const OLD_IDS = { 'vegetarian nights': 'vegetarian' };
const DEFAULT_SETUP = { budget: 100, days: 'next', picked: [], serves: 2, meals: ['breakfast', 'dinner'], more: [], out: [], addedMore: [], addedOut: [] };
const words = (a) => (Array.isArray(a) ? a.filter((x) => typeof x === 'string' && x.trim()).map((x) => OLD_IDS[x.trim().toLowerCase()] || x.trim().toLowerCase().slice(0, 30))
  .filter((x, i, l) => l.indexOf(x) === i).slice(0, 40) : []);
/** The last setup (or the first one: $100, next week, breakfast and dinner, for the household). */
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
  // (Picked days that have gone by are let go.)
  const keys = planDays(0).concat(planDays(1)).map((d) => d.key);
  out.picked = out.picked.filter((k) => keys.indexOf(k) >= 0);
  if (out.days === 'pick' && !out.picked.length) out.days = 'next';
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

// ---- What fits a meal (by title: the sites' courses are loose) ----------------------------------
const NOT_A_MEAL = /^(?!.*\b(with|and|in|over|on)\b).*\b(sauce|dressing|vinaigrette|seasoning|spice mix|spice blend|rub|marinade|broth|stock|dip|salsa|guacamole|hummus|tzatziki|raita|syrup|jam|compote|frosting|glaze|gravy|pesto|aioli|mayo|croutons|smoothies?|latte|coffee|tea|lemonade|juice|cocktail|mix|substitute|butter)$/i;
const PART = /^(homemade |easy |basic |the best |perfect |simple )?(fresh )?(pasta|pasta dough|pizza dough|bread|tortillas?|flour tortillas|granola|stock|broth|yogurt|butter|ricotta|croutons|bread ?crumbs|noodles|naan|pita bread|biscuits|dinner rolls|rice|white rice|brown rice|quinoa|mashed potatoes|english muffins|bagels|crepes?|pikelets|biscotti|(italian |breakfast )?sausage meat|breakfast sausage)$/i;
const DRINK = /\b(latte|coffee|tea|smoothies?|shakes?|juice|lemonade|cocktails?|punch|cider|hot chocolate|frappuccino|chai|mocktail|spritz|sangria)\b/i;
const DESSERT = /\b(cakes?|cupcakes?|cookies?|brownies?|blondies|bars|biscotti|fudge|pies?|tarts?|cobbler|crisp|crumble|pudding|ice cream|cheesecake|truffles|candy|frosting|poached pears|baked apples|sorbet|mousse|macarons?|doughnuts?|donuts?|bark|parfait|trifle|tiramisu|cannoli|eclairs?|baklava|meringues?|panna cotta|flan|jello|pavlova|tartlets|sticky buns)\b/i;
const SAVOURY_PIE = /pot pie|shepherd|cottage pie|tomato pie|spinach pie|pizza|meat pie|chicken pie|savou?ry|quiche|pork pie|fish pie|tamale pie|crisp(y|ier|iest)|crispy|rice pudding|bread pudding|yorkshire|corn pudding/i;
const BREAKFASTY = /\b(breakfast|brunch|morning|eggs?|omelets?|omelettes?|frittatas?|quiches?|pancakes?|waffles?|french toast|oats|oatmeal|granola|muffins?|scones?|toast|bagels?|hash|hash browns|bacon|sausage|yogurt|crepes?|biscuits|shakshuka|benedict|burritos?|chia|cinnamon rolls?|coffee cake|porridge|strata|scramble|breakfast potatoes|chilaquiles|huevos|kaiserschmarrn|muesli|bread pudding|dutch baby|babka|congee|grits|croissants?)\b/i;
const DINNERISH = /\b(tuna|lobster|shrimp|prawns?|salmon|crab|steak|burgers?|pizza|curry|soup|stew|chili|pasta|spaghetti|lasagna|sliders|meatballs|roast|stir.?fry|noodles|risotto|tacos?|enchiladas?|wings|salad|pot pie|sandwich|wraps?|melt|pears|apples|ribs|chops|meatloaf|casserole)\b/i;
const BREAKFAST_ONLY = /\b(pancakes?|waffles?|french toast|oatmeal|overnight oats|granola|muffins?|scones?|cinnamon rolls?|porridge|crepes?|chia pudding|coffee cake|muesli|breakfast|brunch|dutch baby)\b/i;
const NIBBLE = /\b(bites|crostini|bruschetta|deviled eggs|dip|fries|chips|crackers|popcorn|appetizers?|canap[eé]s|hors d|cheese board|charcuterie|nuts|trail mix|energy balls|snack)\b/i;
/** Whether a title suits a meal ('breakfast', 'lunch', 'dinner'). */
export function fitsMeal(title, meal) {
  const tl = String(title || '');
  if (NOT_A_MEAL.test(tl) || PART.test(tl) || /\b(how to|recipes|ideas)\b/i.test(tl) || /sausage meat$/i.test(tl)
    || /^\w+ butter\b(?! chicken| beans| noodles| pasta| shrimp| salmon| chicken)/i.test(tl)) return false; // ("Cowboy Butter - for steak": a butter)
  if (DRINK.test(tl) && !/\b(cake|bread|sandwich|rubbed|glazed|braised|brined|marinated|beer.?battered)\b/i.test(tl)) return false;
  if (DESSERT.test(tl) && !SAVOURY_PIE.test(tl) && !(meal === 'breakfast' && /coffee cake|pancake|cheesecake pancakes|breakfast/i.test(tl))) return false;
  if (meal === 'breakfast') return BREAKFASTY.test(tl) && (!DINNERISH.test(tl) || /breakfast|brunch|egg/i.test(tl));
  if (NIBBLE.test(tl) && !/\b(bowl|salad|tacos?|sandwich|wraps?|pasta|soup)\b/i.test(tl)) return false;
  // A side on its own isn't lunch or dinner ("Easy Creamy Coleslaw").
  if (/^(easy |classic |creamy |the best |simple |homemade |perfect |quick )*(cole ?slaw|slaw|mashed potatoes|roasted potatoes|garlic bread|rice pilaf|corn on the cob|green beans|roasted broccoli|baked beans|applesauce|dinner rolls|cornbread|french fries|potato wedges)$/i.test(tl)) return false;
  return !BREAKFAST_ONLY.test(tl) || /breakfast for dinner|brinner/i.test(tl);
}

// ---- One recipe, priced ------------------------------------------------------------------------
// The main thing in a dish, for spreading the week out.
const MAINS = [
  ['chicken', /chicken/], ['beef', /beef|steak|brisket|meatball|meatloaf/], ['pork', /pork|bacon|ham\b|sausage|chorizo/],
  ['turkey', /turkey/], ['fish', /shrimp|prawn|salmon|tuna|cod|tilapia|fish|crab|scallop/], ['beans', /bean|lentil|chickpea|dal\b/],
  ['tofu', /tofu|tempeh/], ['eggs', /\beggs?\b|frittata|quiche|omelet|shakshuka/], ['pancakes', /pancake|waffle|french toast|crepe/],
  ['oats', /oat|granola|porridge/], ['bread', /muffin|scone|biscuit|bread|bagel|toast/], ['pasta', /pasta|spaghetti|penne|noodle|macaroni|lasagna|gnocchi|orzo/],
  ['rice', /rice|risotto/], ['potato', /potato/], ['soup', /soup|stew|chili/], ['salad', /salad/],
];
const mainOf = (title, ings) => {
  const tl = title.toLowerCase();
  const hit = MAINS.find(([, re]) => re.test(tl)) || MAINS.find(([, re]) => re.test(ings));
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

/** A recipe row -> the small candidate kept on the screen, or null when it doesn't suit the meal. */
export function candidate(row, meal) {
  const ings = (row.ingredients || []).filter((x) => x && x.type !== 'group');
  if (ings.length < 3 || !fitsMeal(row.title, meal)) return null;
  // (Not an everyday meal: a whole day's work, unless it is the slow cooker doing it.)
  if (row.minutes > 240 && !/slow cooker|crock ?pot|crockpot/i.test(row.title)) return null;
  const p = priceRecipe(row);
  const per = p.total / row.serves;
  // (Next to nothing a serving is a side or a part of a meal: "Homemade Pasta" is flour and eggs.)
  if (!(per >= (meal === 'dinner' ? 0.5 : 0.3)) || per > 25) return null;
  const names = ings.map((x) => plainText(x.name)).join(' · ').toLowerCase().slice(0, 700);
  return {
    id: row.id, t: row.title, img: row.img, alt: row.alt, site: row.site, m: row.minutes, s: row.serves, meal,
    p1: Math.round(per * 1000) / 1000, w: ` ${row.title.toLowerCase()} · ${names} `, main: mainOf(row.title, names), cu: row.cuisine || '',
  };
}
/** What a candidate costs for `serves` people ($, to the cent). */
export const priceFor = (c, serves) => round2(c.p1 * serves);

// ---- Recipes to choose from (they grow) -----------------------------------------------------------
const FIRST_PER = 30; // a page: 30 recipes a site
const CAP = { breakfast: 250, lunch: 250, dinner: 400 }; // the most kept for a meal
const FRESH_MS = 6 * 3600000; // younger than this: no new pages this time
function poolStore() {
  try { localStorage.removeItem('budget.pool.v1'); } catch (e) { /* the first version's copy: not used now */ }
  const p = read(POOL_KEY, {});
  return p && typeof p === 'object' ? p : {};
}
function savePool(meal, entry) {
  const all = poolStore();
  all[meal] = entry;
  if (write(POOL_KEY, all)) return;
  // Storage full: keep fewer of each meal.
  Object.keys(all).forEach((m) => { all[m].list = all[m].list.slice(-Math.round(all[m].list.length / 2)); });
  write(POOL_KEY, all);
}
/**
 * The recipes kept for each meal, no network ({ meal: [candidate] }); offline: only those that
 * open offline, unless `every` (putting back a week that was already shown).
 */
export function cachedPools(meals, every = false) {
  const all = poolStore();
  const out = {};
  meals.forEach((m) => { out[m] = ((all[m] && all[m].list) || []).filter((c) => every || online() || cachedWebRecipe(c.id)); });
  return out;
}
function merge(list, rows, meal) {
  const seen = {};
  list.forEach((c) => { seen[c.id] = 1; seen[c.t.toLowerCase().replace(/[^a-z]+/g, '')] = 1; });
  let n = 0;
  rows.forEach((row) => {
    const same = row.title.toLowerCase().replace(/[^a-z]+/g, '');
    if (seen[row.id] || seen[same]) return;
    const c = candidate(row, meal);
    if (!c) return;
    seen[c.id] = 1; seen[same] = 1;
    list.push(c);
    n++;
  });
  return n;
}
/**
 * The recipes for each meal, as soon as there are enough to choose from: { pools, offline }.
 * The first time, a page of each site (what has come after a few seconds, the rest joins in
 * a moment); with recipes kept from before, at once. Then, in the background, more: another page
 * of each site (a different one each time) and title searches for the liked things; each time
 * more have come, onGrow(meal, list). Never throws.
 */
export async function loadPools(meals, { signal, likes = [], onGrow = () => {} } = {}) {
  const all = poolStore();
  const out = {};
  let offline = !online();
  if (offline) return { pools: cachedPools(meals), offline: true };
  await Promise.all(meals.map(async (meal) => {
    const have = all[meal] || { at: 0, list: [], pg: {} };
    const entry = { at: have.at || 0, list: (have.list || []).slice(), pg: have.pg || {} };
    if (entry.list.length >= 40) { out[meal] = entry.list; return; }
    // First time: page 1 of every site; settle for what came within 6 s.
    await new Promise((done) => {
      let left = mealSites(meal).length;
      let timer = null;
      const finish = () => { clearTimeout(timer); done(); };
      mealRecipes(meal, { per: FIRST_PER, page: 1, signal, onSite: (site, rows, full) => {
        merge(entry.list, rows, meal);
        entry.pg[site] = { max: full ? 0 : 1, got: [1] };
        left--;
        if (!timer && entry.list.length) timer = setTimeout(finish, 3500);
        if (!left) finish();
      } }).then(finish);
      setTimeout(finish, 9000);
    });
    if (signal && signal.aborted) return;
    if (entry.list.length) { entry.at = Date.now(); savePool(meal, entry); } else offline = true;
    out[meal] = entry.list.length ? entry.list : (have.list || []).filter((c) => cachedWebRecipe(c.id));
  }));
  if (!(signal && signal.aborted)) grow(meals, likes, signal, onGrow);
  return { pools: out, offline };
}
// More recipes in the background: a couple of rounds a visit.
async function grow(meals, likes, signal, onGrow) {
  for (const meal of meals) {
    if (signal && signal.aborted) return;
    const entry = poolStore()[meal];
    if (!entry) continue;
    entry.pg = entry.pg || {};
    const asks = [];
    // A page not seen yet on each site (a random one of those there are, so each visit brings others).
    if (Date.now() - (entry.grown || 0) > FRESH_MS || entry.list.length < 120) {
      const pages = {};
      mealSites(meal).forEach((site) => {
        const p = entry.pg[site] || { max: 0, got: [] };
        const max = p.max || 12; // (not known yet: a guess; past the end a site gives nothing)
        const open = [];
        for (let i = 1; i <= max; i++) if ((p.got || []).indexOf(i) < 0) open.push(i);
        if (open.length) pages[site] = open[Math.floor(Math.random() * Math.min(open.length, 6))];
      });
      if (Object.keys(pages).length) asks.push({ pages, sites: Object.keys(pages) });
    }
    // The liked things this meal has few of: searched for by title.
    const use = entry.list;
    likes.forEach((id) => {
      const test = likeTest(id);
      const n = use.filter((c) => test(c, ` ${c.t.toLowerCase()} `)).length;
      if (n < 25) likeSearch(id).forEach((word) => asks.push({ search: word, page: 1 }));
    });
    for (const a of asks.slice(0, 5)) {
      if (signal && signal.aborted) return;
      const cur = poolStore()[meal] || entry;
      cur.pg = cur.pg || {};
      const res = await mealRecipes(meal, { per: FIRST_PER, page: a.page || 1, pages: a.pages || null, sites: a.sites || null, search: a.search || '', signal });
      if (signal && signal.aborted) return;
      if (a.pages) {
        Object.keys(a.pages).forEach((site) => {
          const p = cur.pg[site] || { max: 0, got: [] };
          p.got = (p.got || []).concat(a.pages[site]).slice(-40);
          if (res.full[site] === false) p.max = p.max ? Math.min(p.max, a.pages[site]) : a.pages[site]; // (the last page, or past it)
          cur.pg[site] = p;
        });
        cur.grown = Date.now();
      }
      const n = merge(cur.list, res.list, meal);
      if (cur.list.length > CAP[meal]) cur.list = cur.list.slice(-CAP[meal]);
      savePool(meal, cur);
      if (n) onGrow(meal, cur.list);
    }
  }
}

// ---- Recipes shown lately ----------------------------------------------------------------------
const SHOWN_DAYS = 21;
/** { id: when it was last shown in a suggested week }. */
export function shownLately() {
  const s = read(SHOWN_KEY, {});
  return s && typeof s === 'object' ? s : {};
}
/** Remember the recipes of a week that was shown (so the next ones are others). */
export function rememberShown(ids) {
  const s = shownLately();
  const now = Date.now();
  ids.forEach((id) => { if (id) s[id] = now; });
  const keys = Object.keys(s).filter((k) => now - s[k] < SHOWN_DAYS * 86400000).sort((a, b) => s[b] - s[a]).slice(0, 1500);
  const out = {};
  keys.forEach((k) => { out[k] = s[k]; });
  write(SHOWN_KEY, out);
}

// ---- Choosing ----------------------------------------------------------------------------------
// A small seeded random: the same week again for the same seed.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
const tlOf = (c) => ` ${c.t.toLowerCase()} `;
/** The candidates a setup allows for one meal (leave-out words gone). */
export function usable(pool, s) {
  const out = outTest(s.out);
  return (pool || []).filter((c) => !(out && out(c.w)));
}
/** How many of a meal's candidates the leave-out words took away. */
export const leftOutCount = (pool, s) => (pool || []).length - usable(pool, s).length;
/** The likes that match a candidate (ids). */
export function likesOf(c, more) {
  const tl = tlOf(c);
  return (more || []).filter((id) => likeTest(id)(c, tl));
}
/** Likes nothing can be found for (with what is left out): ids. */
export function unmatchedLikes(pools, s) {
  return (s.more || []).filter((id) => !s.meals.some((m) => usable(pools[m], s).some((c) => likeTest(id)(c, tlOf(c)))));
}

/**
 * Pick a recipe for every slot. slots: [{ key, meal, id?, keep? }] (kept ones stay); pools:
 * { meal: [candidate] }; avoid: { id: when shown } (left for later while there are others).
 * Returns { slots: [{ key, meal, id, keep, want }], missing: [meal] } (want: the like a slot was
 * given to, '' for none).
 */
export function choose(slots, pools, s, seed = 1, avoid = {}) {
  const rand = rng(seed);
  const use = {};
  const byId = {};
  Object.keys(pools).forEach((m) => { use[m] = usable(pools[m], s); pools[m].forEach((c) => { byId[c.id] = c; }); });
  const missing = s.meals.filter((m) => !(use[m] || []).length);
  const out = slots.map((x) => ({ key: x.key, meal: x.meal, id: x.keep && byId[x.id] ? x.id : '', keep: !!(x.keep && byId[x.id]), want: '' }));
  if (missing.length) return { slots: out, missing };
  const likesBy = {};
  const likeOf = (c) => likesBy[c.id] || (likesBy[c.id] = likesOf(c, s.more));
  // ---- "More of these": a share of each meal's slots, spread over the likes and the days ----
  s.meals.forEach((m) => {
    const open = out.filter((x) => x.meal === m && !x.keep);
    const likes = (s.more || []).filter((id) => use[m].some((c) => likeOf(c).indexOf(id) >= 0));
    if (!likes.length || !open.length) return;
    const all = out.filter((x) => x.meal === m).length;
    const share = Math.min(0.6, 0.35 + 0.1 * (likes.length - 1));
    const keptLiked = out.filter((x) => x.meal === m && x.keep && likeOf(byId[x.id]).length).length;
    let n = Math.round(all * share + (rand() - 0.5) * 0.9) - keptLiked;
    n = Math.max(Math.min(likes.length, open.length, all >= 2 ? 1 : 0), Math.min(n, open.length));
    // Every like at least once when there's room, in a shuffled order, spread over the days.
    const order = likes.slice().sort(() => rand() - 0.5);
    const step = open.length / n;
    const start = rand() * step;
    for (let k = 0; k < n; k++) open[Math.min(open.length - 1, Math.floor(start + k * step))].want = order[k % order.length];
  });
  // Each meal's share of the money: a typical price of that meal (its median), so breakfast gets less than dinner.
  const median = {};
  Object.keys(use).forEach((m) => { const ps = use[m].map((c) => c.p1).sort((a, b) => a - b); median[m] = ps[Math.floor(ps.length / 2)] || 1; });
  const keptCost = out.reduce((n, x) => n + (x.keep ? priceFor(byId[x.id], s.serves) : 0), 0);
  const weight = out.filter((x) => !x.keep).reduce((n, x) => n + median[x.meal], 0) || 1;
  const left = Math.max(0, s.budget - keptCost);
  const used = {};
  const mains = {};
  out.forEach((x) => { if (x.keep) { used[x.id] = 1; const c = byId[x.id]; mains[c.main] = (mains[c.main] || 0) + 1; } });
  const prevMain = (i) => { for (let j = i - 1; j >= 0; j--) if (out[j].meal === out[i].meal && out[j].id) return byId[out[j].id].main; return ''; };
  const now = Date.now();
  // What a slot may have: its like (or nothing liked, so the likes don't take over).
  const kindOk = (x, c) => (x.want ? likeOf(c).indexOf(x.want) >= 0 : !likeOf(c).length);
  out.forEach((x, i) => {
    if (x.keep) return;
    const target = (left * median[x.meal]) / weight;
    let list = use[x.meal].filter((c) => !used[c.id] && kindOk(x, c));
    if (list.length < 2) list = use[x.meal].filter((c) => !used[c.id] && (!x.want || likeOf(c).indexOf(x.want) >= 0));
    if (!list.length) list = use[x.meal].filter((c) => !used[c.id]);
    if (!list.length) list = use[x.meal]; // too few recipes: repeats are allowed
    // Shown lately: left for later while there are others (the longest ago first after that).
    const fresh = list.filter((c) => !avoid[c.id]);
    if (fresh.length >= 2) list = fresh;
    const pm = prevMain(i);
    let best = null;
    let bestScore = -1e9;
    list.forEach((c) => {
      const price = priceFor(c, s.serves);
      const age = avoid[c.id] ? Math.min(1, (now - avoid[c.id]) / (14 * 86400000)) : 1;
      const score = rand() * 2 - Math.abs(price - target) / Math.max(1, target) * 0.8 - (1 - age) * 2
        - (mains[c.main] || 0) * 0.6 - (c.main === pm && c.main !== 'other' ? 1 : 0);
      if (score > bestScore) { bestScore = score; best = c; }
    });
    x.id = best.id;
    used[best.id] = 1;
    mains[best.main] = (mains[best.main] || 0) + 1;
  });
  // Over: the priciest picks give way to cheaper ones of the same kind, the biggest saving first.
  const kinds = { kindOk, avoid };
  for (let n = 0; n < 80 && total(out, byId, s.serves) > s.budget; n++) {
    const sw = cheaperSwaps(out, use, byId, s, 1, kinds)[0];
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
// one per meal, none for kept meals, never a recipe already in the week (and, when choosing,
// one of the same kind: a liked meal for a liked one).
function cheaperSwaps(slots, use, byId, s, max, kinds = {}) {
  const inWeek = {};
  slots.forEach((x) => { inWeek[x.id] = 1; });
  const out = [];
  slots.forEach((x, i) => {
    const c = byId[x.id];
    if (x.keep || !c) return;
    const now = priceFor(c, s.serves);
    let best = null;
    (use[x.meal] || []).forEach((o) => {
      if (inWeek[o.id] || priceFor(o, s.serves) >= now || (kinds.kindOk && !kinds.kindOk(x, o))) return;
      // (The cheapest, but one not shown lately before one that was.)
      const cost = (y) => priceFor(y, s.serves) + (kinds.avoid && kinds.avoid[y.id] ? 1.5 : 0);
      if (!best || cost(o) < cost(best)) best = o;
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
 * cheapest few, and the nearest few that cost more, so there is a choice both ways. `skip`:
 * ids to pass over ("More choices" shows the next ones).
 */
export function alternatives(slots, i, pools, s, max = 5, skip = {}) {
  const x = slots[i];
  const now = pools[x.meal].find((c) => c.id === x.id);
  const others = {};
  slots.forEach((y, j) => { if (j !== i) others[y.id] = 1; });
  const list = usable(pools[x.meal], s).filter((c) => c.id !== x.id && !others[c.id] && !skip[c.id]).sort((a, b) => a.p1 - b.p1);
  const cheaper = list.filter((c) => !now || c.p1 < now.p1);
  const dearer = list.filter((c) => now && c.p1 >= now.p1);
  const nDear = Math.min(dearer.length, Math.max(2, max - cheaper.length));
  return cheaper.slice(0, max - nDear).concat(dearer.slice(0, nDear)).sort((a, b) => a.p1 - b.p1);
}

// ---- Send to the Week plan ----------------------------------------------------------------------
// What the plan and the recipe pages need to know about a recipe before it has loaded.
export const entryOf = (c) => ({ id: c.id, t: c.t, c: 'web', ty: c.meal, m: c.m, g: c.m > 0 && c.m <= 30 ? ['quick'] : [], b: '', s: c.s, img: c.img, alt: c.alt || '', site: c.site, table: c.meal === 'breakfast' ? 'breakfast' : c.meal === 'lunch' ? 'lunch' : 'american' });
// The shopping-list things of a whole recipe and what each costs, scaled to `cost` (for the
// Shopping list's prices: they add up to what the meal was said to cost).
function itemsOf(r, cost) {
  const items = {};
  let sum = 0;
  ((r && r.ingredients) || []).forEach((i) => {
    if (!i || typeof i === 'string' || isStaple(i)) return;
    const c = ingredientCost(i);
    if (!c) return;
    const k = itemKey(i);
    items[k] = (items[k] || 0) + c;
    sum += c;
  });
  Object.keys(items).forEach((k) => { items[k] = round2(sum > 0 ? (items[k] * cost) / sum : 0); });
  return items;
}

/**
 * Put the week on the plan: only meals with nothing planned get a recipe (what the household
 * planned stays; meals the last budget week put there are replaced), each for `serves` people;
 * next week's meals go on the shopping list too. The recipes are kept on the screen for good.
 * Resolves { added, kept, replaced, total, things, snap, wasNext, next }: snap + wasNext put
 * everything back (undoSend).
 */
export async function sendToPlan(slots, byId, s, label) {
  const keys = slots.map((x) => x.key).filter((k, i, a) => a.indexOf(k) === i);
  const snap = snapshotDays(keys);
  const wasNext = !!getListState().next;
  const nextKeys = planDays(1).map((d) => d.key);
  // A budget week sent before for these days: its meals make way for this one.
  const before = read(SENT_KEY, null);
  let replaced = 0;
  if (before && Array.isArray(before.slots)) {
    const plan0 = getPlan();
    before.slots.forEach((x) => {
      if (x && keys.indexOf(x.key) >= 0 && ((plan0[x.key] || {})[x.meal] || []).indexOf(x.id) >= 0) { removeFromPlan(x.key, x.id, x.meal); replaced++; }
    });
  }
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
    sent.push({ key: x.key, meal: x.meal, id: c.id, cost: priceFor(c, s.serves), items: {} });
  });
  const next = sent.some((x) => nextKeys.indexOf(x.key) >= 0);
  if (next && !wasNext) setListNextWeek(true);
  // The whole recipes, so the shopping list has their ingredients (and they open offline).
  const recipes = await Promise.all(sent.map((x) => loadWebRecipe(x.id).catch(() => null)));
  recipes.forEach((r, n) => { if (r) sent[n].items = itemsOf(r, sent[n].cost); });
  write(SENT_KEY, { at: Date.now(), budget: s.budget, label, slots: sent });
  const titles = recipes.filter(Boolean).map((r) => r.title);
  let things = 0;
  try {
    const list = await buildShoppingList();
    list.sections.forEach((sec) => sec.items.forEach((it) => { if (it.from.some((x) => titles.indexOf(x) >= 0)) things++; }));
  } catch (e) { /* the count is only for the toast */ }
  return { added: sent.length, kept, replaced, total: round2(sent.reduce((n, x) => n + x.cost, 0)), things, snap, wasNext, next, before };
}
/** Undo a send: the plan's days come back (restoreDays(snap)) and this puts back the rest. */
export function undoSend(wasNext, before) {
  setListNextWeek(!!wasNext);
  if (before && Array.isArray(before.slots)) write(SENT_KEY, before);
  else { try { localStorage.removeItem(SENT_KEY); } catch (e) { /* storage off */ } }
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
