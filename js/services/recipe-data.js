// The recipe library: cuisines -> types -> recipes, loaded from data/recipes/*.json.
// index.json is a small list for browsing; a cuisine's full recipes load when opened.
// Files are cached by the service worker, so browsing works offline after the first visit.

import { savedRecipes, toRecipe, MEAL_NAMES } from './my-recipes.js';

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
  const res = await fetch(BASE + name);
  if (!res.ok) throw new Error(`${name}: ${res.status}`);
  return res.json();
}

/** { cuisines: [{id,name,count,types:[{id,name,count}]}], recipes: [{id,t,c,ty,m,g,b,s}] }
 *  The family's own recipes are added as the 'mine' cuisine (always present, maybe empty). */
export function loadIndex() {
  if (!indexP) {
    indexP = getJson('index.json');
    indexP.catch(() => { indexP = null; }); // try again next time (offline first run)
  }
  return indexP.then(withMine);
}

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
  if (byId[id]) return byId[id];
  const ix = await loadIndex();
  const e = ix.byId[id];
  if (!e) return null;
  await loadCuisine(e.c);
  return byId[id] || null;
}
/** Already-loaded recipe, or undefined. */
export const cachedRecipe = (id) => byId[id];

// ---- Text helpers -----------------------------------------------------------
const FRACS = [[0, ''], [0.25, '¼'], [0.33, '⅓'], [0.5, '½'], [0.67, '⅔'], [0.75, '¾'], [1, '']];
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

/** "2 cloves garlic, minced". `scale` multiplies the amount (serving size changed). */
export function ingredientText(i, scale = 1) {
  if (typeof i === 'string') return i;
  const q = i.q == null ? null : i.q * scale;
  const amt = q == null ? '' : `${fmtQty(q)} ${unitText(i.u, q)}`.trim();
  const base = amt ? `${amt} ${i.item}` : i.item.charAt(0).toUpperCase() + i.item.slice(1);
  return i.note ? `${base}, ${i.note}` : base;
}

/** "45 min" / "1 hr 30 min" */
export function fmtMinutes(m) {
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
// Changes once a day (local date), same all day. Dinners only (no desserts/breakfast).
export async function dinnerIdea(date = new Date()) {
  const ix = await loadIndex();
  const dinner = {};
  ix.cuisines.forEach((c) => { dinner[c.id] = (c.meal || 'dinner') === 'dinner'; });
  const list = ix.recipes.filter((r) => dinner[r.c]);
  if (!list.length) return null;
  const day = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
  // Step through the list with a stride so neighbouring days aren't the same cuisine.
  return list[(day * 37) % list.length];
}

// Lower-case, accents off ("sauté" -> "saute"), punctuation to spaces.
const plain = (s) => String(s || '').toLowerCase().replace(/[àáâä]/g, 'a').replace(/[èéêë]/g, 'e').replace(/[ìíîï]/g, 'i')
  .replace(/[òóôö]/g, 'o').replace(/[ùúûü]/g, 'u').replace(/ñ/g, 'n').replace(/ç/g, 'c').replace(/[^a-z0-9]+/g, ' ');
// "tacos" also finds "taco", "potatoes" finds "potato", "berries" finds "berry".
const stem = (w) => (w.length > 4 && /ies$/.test(w) ? `${w.slice(0, -3)}y`
  : w.length > 4 && /oes$/.test(w) ? w.slice(0, -2)
    : w.length > 3 && /[^s]s$/.test(w) ? w.slice(0, -1) : w);

/** Search over titles, blurbs, tags and cuisine names. Title matches come first. */
export async function searchRecipes(text, limit = 200) {
  const ix = await loadIndex();
  const words = plain(text).split(' ').filter(Boolean);
  if (!words.length) return [];
  const names = {};
  ix.cuisines.forEach((c) => { names[c.id] = c.name; });
  const hits = [];
  ix.recipes.forEach((r, n) => {
    const title = plain(r.t);
    const hay = ` ${title} ${plain(r.b)} ${plain((r.g || []).join(' '))} ${plain(names[r.c])} ${plain(r.ty)}`;
    const has = (h, w) => h.indexOf(w) >= 0 || h.indexOf(stem(w)) >= 0;
    if (!words.every((w) => has(hay, w))) return;
    // Every word in the title > some words in the title > found elsewhere; then the library's order.
    const inTitle = words.filter((w) => has(title, w)).length;
    hits.push({ r, rank: (inTitle === words.length ? 0 : inTitle ? 1 : 2) * 1e6 + n });
  });
  return hits.sort((a, b) => a.rank - b.rank).slice(0, limit).map((h) => h.r);
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
      await fetch(BASE + `${c.id}.json`).catch(() => null);
      await new Promise((r) => setTimeout(r, 1500));
    }
    localStorage.setItem('recipes.prefetched', today);
  } catch (e) { /* offline: try again next time */ }
}
