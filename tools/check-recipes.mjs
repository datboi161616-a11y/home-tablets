// Checks recipe files in data/recipes/ against the format the tablet expects.
// Usage: node tools/check-recipes.mjs [data/recipes/chinese.json ...]   (no args = all files)
import fs from 'node:fs';
import path from 'node:path';

export const UNITS = ['', 'lb', 'oz', 'cup', 'tbsp', 'tsp', 'clove', 'can', 'jar', 'pkg', 'bunch', 'slice', 'pinch', 'head', 'stalk', 'sprig', 'inch', 'quart', 'pint', 'dash', 'stick', 'piece'];
export const AISLES = ['produce', 'meat', 'seafood', 'dairy', 'bakery', 'pantry', 'spices', 'canned', 'frozen', 'international', 'beverages'];
export const TAGS = ['quick', 'vegetarian', 'vegan', 'spicy', 'kid-friendly', 'slow cooker', 'instant pot', 'one pot', 'sheet pan', 'make ahead', 'grill', 'air fryer', 'gluten-free', 'healthy', 'holiday', 'crowd'];

const dir = 'data/recipes';
const files = process.argv.slice(2).length ? process.argv.slice(2)
  : fs.readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'index.json').map((f) => path.join(dir, f));

const seen = new Map();
let bad = 0;
const err = (f, id, msg) => { bad++; console.log(`${path.basename(f)} ${id || ''}: ${msg}`); };

for (const f of files) {
  let d;
  try { d = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { err(f, '', 'not valid JSON: ' + e.message); continue; }
  if (!/^[a-z-]+$/.test(d.id || '')) err(f, '', 'file needs "id" (lowercase)');
  if (!d.name) err(f, '', 'file needs "name"');
  if (!Array.isArray(d.types) || d.types.length < 3) err(f, '', 'needs 3+ "types"');
  const types = new Set((d.types || []).map((t) => t.id));
  const perType = {};
  for (const r of d.recipes || []) {
    const id = r.id;
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id || '')) err(f, id, 'bad id');
    if (seen.has(id)) err(f, id, 'duplicate id (also in ' + seen.get(id) + ')');
    seen.set(id, path.basename(f));
    if (!r.title || r.title.length > 48) err(f, id, 'title missing or over 48 chars');
    if (!types.has(r.type)) err(f, id, 'type "' + r.type + '" not in file types');
    perType[r.type] = (perType[r.type] || 0) + 1;
    for (const k of ['serves', 'prep', 'cook']) if (!Number.isInteger(r[k]) || r[k] < 0) err(f, id, k + ' must be a whole number');
    if (!r.serves) err(f, id, 'serves must be 1+');
    for (const t of r.tags || []) if (!TAGS.includes(t)) err(f, id, 'unknown tag "' + t + '"');
    if (!Array.isArray(r.ingredients) || r.ingredients.length < 2) err(f, id, 'needs 2+ ingredients');
    for (const i of r.ingredients || []) {
      if (!(i.q === null || (typeof i.q === 'number' && i.q > 0))) err(f, id, 'q must be a number or null: ' + JSON.stringify(i));
      if (!UNITS.includes(i.u)) err(f, id, 'unknown unit "' + i.u + '"');
      if (!i.item || i.item !== i.item.toLowerCase() && !/[A-Z]/.test(i.item[0] + '')) {} // case is free-form
      if (!i.item || i.item.length > 60) err(f, id, 'item missing/too long: ' + JSON.stringify(i));
      if (!AISLES.includes(i.aisle)) err(f, id, 'unknown aisle "' + i.aisle + '" for ' + i.item);
      if (i.note != null && typeof i.note !== 'string') err(f, id, 'note must be text');
      for (const k of Object.keys(i)) if (!['q', 'u', 'item', 'note', 'aisle'].includes(k)) err(f, id, 'unexpected ingredient key ' + k);
    }
    if (!Array.isArray(r.steps) || r.steps.length < 2) err(f, id, 'needs 2+ steps');
    for (const s of r.steps || []) {
      if (!s.text || s.text.length > 170) err(f, id, 'step text missing or over 170 chars: ' + (s.text || '').slice(0, 40));
      if (s.timer != null && (!Number.isInteger(s.timer) || s.timer < 30 || !s.timerLabel)) err(f, id, 'timer must be whole seconds (30+) with a timerLabel');
    }
    for (const k of Object.keys(r)) if (!['id', 'title', 'type', 'serves', 'prep', 'cook', 'tags', 'ingredients', 'steps', 'blurb'].includes(k)) err(f, id, 'unexpected key ' + k);
    if (r.blurb && r.blurb.length > 90) err(f, id, 'blurb over 90 chars');
  }
  console.log(`${path.basename(f)}: ${(d.recipes || []).length} recipes`, JSON.stringify(perType));
}
console.log(bad ? `${bad} problem(s)` : 'all good');
process.exit(bad ? 1 : 0);
