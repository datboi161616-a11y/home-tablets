// The recipe library: cuisines -> types -> recipes, loaded from data/recipes/*.json.
// index.json is a small list for browsing; a cuisine's full recipes load when opened.
// Files are cached by the service worker, so browsing works offline after the first visit.

import { savedRecipes, toRecipe, parseStep, MEAL_NAMES } from './my-recipes.js';
import { isWebId, webEntries, loadWebRecipe, cachedWebRecipe, webIdeas } from './web-recipes.js';

const BASE = './data/recipes/';

// Tile colours for each cuisine (anything new falls back to ink).
export const CUISINE_COLORS = {
  american: '#35557F', italian: '#2E6B45', mexican: '#C2491F', chinese: '#A8322A',
  japanese: '#3F4F6B', thai: '#4F7A3A', indian: '#B5701A', mediterranean: '#2C6E8A',
  mine: '#1D2430', korean: '#8A3B5C', southern: '#7A4A2A', breakfast: '#C98A1E', lunch: '#3E7C6E', desserts: '#A84E73', weeknight: '#6B5B95',
};
export const cuisineColor = (id) => CUISINE_COLORS[id] || '#1D2430';

let indexP = null;
const cuisineP = {};
const byId = {}; // id -> full recipe, filled as cuisine files load

async function getJson(name) {
  // (A time limit: on a connection that neither answers nor fails, "Loading recipes…" would
  // stay up for ever; this way the screen says it couldn't, and offers to try again.)
  const res = await fetch(BASE + name, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`${name}: ${res.status}`);
  return res.json();
}

/** { cuisines: [{id,name,count,types:[{id,name,count}]}], recipes: [{id,t,c,ty,m,g,b,s}], byId }
 *  The family's own recipes are added as the 'mine' cuisine (always present, maybe empty).
 *  Recipes from the web kept on this screen (web-recipes.js) are in byId only (c: 'web',
 *  img = their photo), so the plan, favourites and Home find them by id like any other. */
export function loadIndex() {
  if (!indexP) {
    indexP = getJson('index.json');
    indexP.catch(() => { indexP = null; }); // try again next time (offline first run)
  }
  return indexP.then(withMine);
}

/** loadIndex(), or with no library file (offline on the very first start) the household's own
 *  recipes and the web recipes kept here: never fails. */
export const loadKnown = () => loadIndex().catch(() => withMine({ cuisines: [], recipes: [] }));

function withMine(base) {
  const mine = savedRecipes().map(toRecipe);
  const types = Object.keys(MEAL_NAMES)
    .map((m) => ({ id: m, name: MEAL_NAMES[m], count: mine.filter((r) => r.type === m).length }))
    .filter((t) => t.count);
  const entries = mine.map((r) => ({ id: r.id, t: r.title, c: 'mine', ty: r.type, m: r.prep + r.cook, g: [], b: r.blurb, s: r.serves }));
  const ix = {
    cuisines: base.cuisines.concat([{ id: 'mine', name: 'My recipes', meal: 'mine', count: mine.length, types }]),
    recipes: base.recipes.concat(entries),
    byId: {},
  };
  webEntries().forEach((r) => { ix.byId[r.id] = r; });
  ix.recipes.forEach((r) => { ix.byId[r.id] = r; });
  return ix;
}

/** All recipes of one cuisine (full detail). */
export function loadCuisine(id) {
  if (!cuisineP[id]) {
    cuisineP[id] = getJson(`${id}.json`).then((d) => {
      d.recipes.forEach((r) => { r.cuisine = d.id; byId[r.id] = r; });
      return d;
    });
    cuisineP[id].catch(() => { delete cuisineP[id]; });
  }
  return cuisineP[id];
}

/** One recipe by id (loads its cuisine file if needed). Resolves null if unknown. */
export async function getRecipe(id) {
  if (!id) return null;
  if (/^my-/.test(id)) { const x = savedRecipes().find((r) => r.id === id); return x ? toRecipe(x) : null; }
  if (/^web:/.test(id)) return isWebId(id) ? loadWebRecipe(id) : null;
  if (byId[id]) return byId[id];
  const ix = await loadIndex();
  const e = ix.byId[id];
  if (!e) return null;
  await loadCuisine(e.c);
  return byId[id] || null;
}
/** Already-loaded recipe, or undefined. */
export const cachedRecipe = (id) => byId[id] || (isWebId(id) ? cachedWebRecipe(id) : undefined);

/**
 * The recipe with a timer on every step whose words give a time ("Rest 10 minutes") but
 * that has none written in (about 350 library steps). Returns a copy; steps that already
 * have a timer are left as they are, and a step's place never changes, so timers saved by
 * cooking mode (by step number) stay right. Under a minute isn't worth a timer.
 */
export function withStepTimers(r) {
  if (!r || !r.steps || r.stepTimersAdded) return r;
  const steps = r.steps.map((s, n) => {
    if (s.timer || typeof s.text !== 'string') return s;
    const p = parseStep(s.text);
    if (!p.timer || p.timer < 60) return s;
    return Object.assign({}, s, { timer: p.timer, timerLabel: p.timerLabel === 'Timer' ? `Step ${n + 1}` : p.timerLabel, guessed: true });
  });
  return Object.assign({}, r, { steps, stepTimersAdded: true });
}

// ---- Text helpers -----------------------------------------------------------
const FRACS = [[0, ''], [0.125, '⅛'], [0.25, '¼'], [0.33, '⅓'], [0.5, '½'], [0.67, '⅔'], [0.75, '¾'], [1, '']];
/** 1.5 -> "1½", 0.33 -> "⅓", 2 -> "2" */
export function fmtQty(q) {
  if (q == null) return '';
  let w = Math.floor(q);
  const f = q - w;
  let best = FRACS[0];
  FRACS.forEach((x) => { if (Math.abs(x[0] - f) < Math.abs(best[0] - f)) best = x; });
  if (best[0] === 1) { w += 1; best = FRACS[0]; }
  if (!w && !best[1]) return String(Math.round(q * 100) / 100);
  return `${w || ''}${best[1]}`;
}
const PLURAL = { clove: 'cloves', can: 'cans', jar: 'jars', pkg: 'pkgs', bunch: 'bunches', slice: 'slices',
  pinch: 'pinches', head: 'heads', stalk: 'stalks', sprig: 'sprigs', inch: 'inches', quart: 'quarts',
  pint: 'pints', dash: 'dashes', stick: 'sticks', piece: 'pieces', cup: 'cups' };
export const unitText = (u, q) => (q != null && q > 1 && PLURAL[u] ? PLURAL[u] : u);

// Things you count (eggs, cloves, cans): a changed serving size rounds them to what you can
// really use, so 3 eggs for 2 people reads "1½", never "1⅓ large eggs".
const COUNTED = /^(|clove|can|jar|pkg|bunch|slice|head|stalk|sprig|stick|piece)$/;
/** An amount for a changed serving size, in a measure that reads naturally:
 *  6 tsp -> 2 tbsp, 8 tbsp -> ½ cup, 0.1 lb -> 1½ oz. Unscaled amounts stay as written. */
export function scaledAmount(q, u, scale = 1) {
  if (q == null || scale === 1) return [q, u];
  let n = q * scale;
  if (COUNTED.test(u || '')) return [n < 3 ? Math.max(0.5, Math.round(n * 2) / 2) : Math.round(n), u];
  // Only into a bigger measure when it comes out even (6 tsp = 2 tbsp; 4 tsp stays 4 tsp).
  const even = (x, step) => Math.abs(x / step - Math.round(x / step)) < 0.04;
  if (u === 'tsp' && n >= 3 && even(n, 1.5)) { n /= 3; u = 'tbsp'; }
  if (u === 'tbsp' && n >= 4 && (even(n, 4) || n >= 12)) { n /= 16; u = 'cup'; }
  if (u === 'tbsp' && n < 1) { n *= 3; u = 'tsp'; }
  if (u === 'lb' && n < 0.25) { n *= 16; u = 'oz'; }
  if (u === 'oz' && n >= 16) { n /= 16; u = 'lb'; }
  return [n, u];
}

// The last word of a counted item made to agree with its new amount (bracketed notes kept).
function countNoun(item, q, was) {
  const m = String(item).match(/^(.*?)([a-z]+)(\s*\(.*\))?$/i);
  if (!m) return item;
  let w = m[2];
  if (q <= 1 && was > 1) {
    if (/ies$/.test(w) && w.length > 4) w = `${w.slice(0, -3)}y`;
    else if (/(oes|ches|shes|xes)$/.test(w)) w = w.slice(0, -2);
    else if (/[^s]s$/.test(w)) w = w.slice(0, -1);
  } else if (q > 1 && was <= 1 && !/s$/.test(w)) {
    w = /[^aeiou]y$/.test(w) ? `${w.slice(0, -1)}ies` : /(o|ch|sh|x)$/.test(w) ? `${w}es` : `${w}s`;
  }
  return m[1] + w + (m[3] || '');
}

/** "2 cloves garlic, minced". `scale` multiplies the amount (serving size changed). */
export function ingredientText(i, scale = 1) {
  if (typeof i === 'string') return i;
  const [q, u] = i.q == null ? [null, i.u] : scaledAmount(i.q, i.u, scale);
  const amt = q == null ? '' : `${fmtQty(q)} ${unitText(u, q)}`.trim();
  // A changed amount of things counted by name: "1 large egg", "2 onions" (not "1 large eggs").
  let item = i.item;
  if (q != null && !u && scale !== 1) item = countNoun(item, q, i.q);
  const base = amt ? `${amt} ${item}` : item.charAt(0).toUpperCase() + item.slice(1);
  return i.note ? `${base}, ${i.note}` : base;
}

/** "45 min" / "1 hr 30 min" */
export function fmtMinutes(m) {
  m = Math.round(+m || 0);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} hr ${r} min` : `${h} hr`;
}

/** "Serves 4 · 15 min prep · 30 min cook" */
export function metaLine(r, serves) {
  if (r.meta) return r.meta;
  return [`Serves ${serves || r.serves}`, r.prep ? `${fmtMinutes(r.prep)} prep` : '', r.cook ? `${fmtMinutes(r.cook)} cook` : '']
    .filter(Boolean).join(' · ');
}

// ---- Tonight's idea ------------------------------------------------------------
// A dinner from the web this screen already knows (kept, or seen while browsing Recipes): no
// network. Chosen once a day (local date) and kept, so it is the same all day. null when
// none is known yet.
const IDEA_KEY = 'recipes.idea.v1';
export async function dinnerIdea(date = new Date()) {
  const day = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
  let kept = null;
  try { kept = JSON.parse(localStorage.getItem(IDEA_KEY) || 'null'); } catch (e) { kept = null; }
  if (kept && kept.day === day && kept.e && isWebId(kept.e.id)) return kept.e;
  const list = webIdeas('dinner');
  if (!list.length) return null;
  // (A stride through the list, so neighbouring days aren't the same kind of dish.)
  const e = list[(day * 37) % list.length];
  try { localStorage.setItem(IDEA_KEY, JSON.stringify({ day, e })); } catch (er) { /* storage full */ }
  return e;
}

// ---- Cooked lately ---------------------------------------------------------------
// "Done cooking" in cooking mode writes the recipe here, newest first, so Recipes can show
// what the family has made lately and a dish can say when it was last cooked.
const COOKED_KEY = 'recipes.cooked.v1';
/** [{ id, at }] newest first, one entry per recipe. */
export function cookedList() {
  try { return (JSON.parse(localStorage.getItem(COOKED_KEY) || '[]') || []).filter((x) => x && x.id && x.at); } catch (e) { return []; }
}
export function markCooked(id) {
  if (!id) return;
  const list = cookedList().filter((x) => x.id !== id);
  list.unshift({ id, at: Date.now() });
  try { localStorage.setItem(COOKED_KEY, JSON.stringify(list.slice(0, 60))); } catch (e) { /* storage full */ }
}
/** When a recipe was last cooked (ms), or 0. */
export const lastCooked = (id) => (cookedList().find((x) => x.id === id) || { at: 0 }).at;
/** "today", "yesterday", "on Tuesday" (this week), "on Nov 3". */
export function cookedWhen(at, now = new Date()) {
  const d = new Date(at);
  const days = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `on ${d.toLocaleDateString('en-US', { weekday: 'long' })}`;
  return `on ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

// ---- Cooking in progress ------------------------------------------------------------
// Cooking mode keeps each recipe's progress as recipe.v1.<id> (see screens/recipe.js).
/** { step (1-based), at } for a recipe someone is part-way through, else null. */
export function cookingProgress(id) {
  try {
    const s = JSON.parse(localStorage.getItem(`recipe.v1.${id}`) || 'null');
    if (!s) return null;
    const ticked = (s.checked || []).some(Boolean);
    return s.step > 0 || ticked ? { step: (s.step || 0) + 1, at: s.at || 0 } : null;
  } catch (e) { return null; }
}
/** The recipe being cooked right now (cooking mode's last one, if it has progress). */
export function cookingNow() {
  try {
    const id = localStorage.getItem('recipe.current');
    const p = id && cookingProgress(id);
    return p ? { id, step: p.step } : null;
  } catch (e) { return null; }
}

/**
 * Download every recipe file once a day in the background, so the service worker has
 * them all and recipes still open when the Wi-Fi is down. One file at a time, gently.
 */
export async function prefetchAll() {
  const today = new Date().toDateString();
  try { if (localStorage.getItem('recipes.prefetched') === today) return; } catch (e) { return; }
  try {
    const ix = await loadIndex();
    for (const c of ix.cuisines) {
      if (c.id === 'mine') continue; // kept on the tablet, not a file
      await fetch(BASE + `${c.id}.json`, { signal: AbortSignal.timeout(30000) }).catch(() => null);
      await new Promise((r) => setTimeout(r, 1500));
    }
    localStorage.setItem('recipes.prefetched', today);
  } catch (e) { /* offline: try again next time */ }
}

// ---- Who loves it ---------------------------------------------------------------------
// A heart per person of the household on a recipe's page. Kept on this screen only, by name.
const LOVES_KEY = 'recipes.loves.v1';
function readLoves() {
  try { const all = JSON.parse(localStorage.getItem(LOVES_KEY) || '{}'); return all && typeof all === 'object' ? all : {}; } catch (e) { return {}; }
}
/** The names of the people who gave a recipe a heart. */
export const lovedBy = (id) => (readLoves()[id] || []).filter((n) => typeof n === 'string');
/** Give or take back one person's heart. Returns the names that love it now. */
export function toggleLove(id, name) {
  const all = readLoves();
  const was = (all[id] || []).filter((n) => typeof n === 'string');
  const now = was.indexOf(name) >= 0 ? was.filter((n) => n !== name) : was.concat([name]);
  if (now.length) all[id] = now; else delete all[id];
  try { localStorage.setItem(LOVES_KEY, JSON.stringify(all)); } catch (e) { /* storage full */ }
  return now;
}
/** Nobody's hearts on a recipe any more (it was taken out of the favourites). */
export function clearLoves(id) {
  const all = readLoves();
  if (!all[id]) return;
  delete all[id];
  try { localStorage.setItem(LOVES_KEY, JSON.stringify(all)); } catch (e) { /* storage full */ }
}
