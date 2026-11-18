// Builds data/recipes/index.json (the small list the browse screens use) from the
// cuisine files. Run after adding or editing recipes:  node tools/build-recipe-index.mjs
import fs from 'node:fs';

// Which part of the day each file belongs to (the first screen: Breakfast / Lunch / Dinner).
const MEAL = { breakfast: 'breakfast', lunch: 'lunch', desserts: 'dessert' }; // everything else: dinner
const ORDER = ['breakfast', 'lunch', 'american', 'italian', 'mexican', 'chinese', 'japanese', 'thai', 'indian',
  'mediterranean', 'korean', 'southern', 'breakfast', 'desserts'];
const dir = 'data/recipes';
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'index.json')
  .map((f) => f.replace('.json', ''))
  .sort((a, b) => ((ORDER.indexOf(a) + 1) || 99) - ((ORDER.indexOf(b) + 1) || 99));

const cuisines = [];
const recipes = [];
for (const id of files) {
  const d = JSON.parse(fs.readFileSync(`${dir}/${id}.json`, 'utf8'));
  const count = {};
  for (const r of d.recipes) {
    count[r.type] = (count[r.type] || 0) + 1;
    recipes.push({ id: r.id, t: r.title, c: d.id, ty: r.type, m: r.prep + r.cook, g: r.tags || [], b: r.blurb || '', s: r.serves });
  }
  cuisines.push({ id: d.id, name: d.name, meal: MEAL[d.id] || 'dinner', count: d.recipes.length,
    types: d.types.map((t) => ({ id: t.id, name: t.name, count: count[t.id] || 0 })).filter((t) => t.count) });
}
fs.writeFileSync(`${dir}/index.json`, JSON.stringify({ cuisines, recipes }));
console.log(`${recipes.length} recipes in ${cuisines.length} cuisines`);
