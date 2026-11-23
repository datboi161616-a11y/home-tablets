// Recipes from the web: a handful of big recipe sites, asked directly from the screen.
// They run WordPress with the WP Recipe Maker plugin, and its public REST API answers any
// browser (CORS open, no key, no quota): free and unlimited, no server of our own.
//
//   search:  GET <site>/wp-json/wp/v2/wprm_recipe?search=<words>&search_columns=post_title
//            (titles only: the plain full-text search ranks badly, "butter chicken" found
//            Beurre Blanc). All sites at once, each with its own time limit; each site's
//            results are handed over as they arrive. Thin results (fewer than 3) are topped
//            up with the full-text search.
//   a kind:  GET <site>/wp-json/wp/v2/wprm_cuisine?search=Indian (once per site, kept),
//            then wprm_recipe?wprm_cuisine=<term id>  (wprm_course for breakfast/desserts).
//   recipe:  GET <site>/wp-json/wp/v2/wprm_recipe/<id>, turned into the library's own shape
//            (tools/RECIPE-FORMAT.md) so the recipe page, cooking mode, the week plan and the
//            shopping list treat it like any other recipe. Id: "web:<site>:<recipe id>".
//
// Pictures: the recipe's own photo. Cards use the plugin's square 500 px copy (made for every
// recipe photo, "<name>-500x500.jpg"); the recipe page a bigger one.
//
// Kept on the screen (localStorage): searches for a few days, the last 60 recipes opened, and
// for good every recipe that was hearted, planned or cooked (up to 300), so it still opens
// with no internet and never drops off the week plan.
//
// Everything from these sites is outside text: tags are stripped and entities decoded here,
// and the screens put it on the page through esc() only. Never any of the sites' HTML.
import { parseIngredient } from './my-recipes.js';
import { favorites, getPlan } from './meal-plan.js';

export const SITES = {
  rte: { name: 'RecipeTin Eats', base: 'https://www.recipetineats.com' },
  bb: { name: 'Budget Bytes', base: 'https://www.budgetbytes.com' },
  nk: { name: 'Natasha’s Kitchen', base: 'https://natashaskitchen.com' },
  ll: { name: 'Love and Lemons', base: 'https://www.loveandlemons.com' },
  ouac: { name: 'Once Upon a Chef', base: 'https://www.onceuponachef.com' },
};
const SITE_IDS = Object.keys(SITES);
export const isWebId = (id) => /^web:[a-z]+:\d+$/.test(String(id || ''));
const API = '/wp-json/wp/v2/';
const LIST_FIELDS = '_fields=id,recipe.name,recipe.image_url,recipe.total_time,recipe.prep_time,recipe.cook_time';
const FULL_FIELDS = '_fields=id,link,recipe.name,recipe.image_url,recipe.summary,recipe.servings,recipe.prep_time,recipe.cook_time,'
  + 'recipe.total_time,recipe.tags,recipe.ingredients_flat,recipe.instructions_flat';
const PER_SITE = 6; // 5 sites x 6 = up to 30 a page; the screen shows 24 at first
const SEARCH_MS = 9000;
const RECIPE_MS = 15000;

// ---- Small helpers ----------------------------------------------------------------------
const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', deg: '°',
  frac12: '½', frac14: '¼', frac34: '¾', frac13: '⅓', frac23: '⅔', frac18: '⅛', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“',
  eacute: 'é', egrave: 'è', ntilde: 'ñ', times: '×', reg: '®', trade: '™', copy: '©', bull: '•', middot: '·' };
const decode = (s) => String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z0-9]+);/gi, (m, e) => {
  if (e[0] === '#') {
    const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : '';
  }
  return NAMED[e.toLowerCase()] != null ? NAMED[e.toLowerCase()] : m;
});
/** Site HTML -> plain text: tags out (a break or paragraph is a space), entities decoded. */
export function plainText(html) {
  return decode(String(html == null ? '' : html)
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, ' '))
    .replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
}
// "(Note 3)", "see note 2", "Note 4" point at notes the page doesn't show: dropped.
const noNotes = (s) => s.replace(/\(?\s*\b(see )?(the )?notes?( \d+(\s*(&|and|,)\s*\d+)*| below| above)?\s*\)/gi, ' ')
  .replace(/\(?\s*\b(see )?notes? \d+(\s*(&|and|,)\s*\d+)*\s*\)?/gi, ' ').replace(/\(\s*\)/g, ' ')
  .replace(/\s+([,.;:)])/g, '$1').replace(/\s+/g, ' ').trim();
const tidyTitle = (s) => plainText(s).replace(/\s+recipe(?=\s*(\(|$))/i, '').slice(0, 80);

function read(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v == null ? fallback : v; } catch (e) { return fallback; }
}
function write(key, v) {
  try { localStorage.setItem(key, JSON.stringify(v)); return true; } catch (e) { return false; }
}
const online = () => !(typeof navigator !== 'undefined' && navigator.onLine === false);

async function getJson(url, ms, signal) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  const stop = () => ctl.abort();
  if (signal) { if (signal.aborted) ctl.abort(); else signal.addEventListener('abort', stop); }
  try {
    const res = await fetch(url, { signal: ctl.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!res.ok) throw new Error(String(res.status));
    return await res.json();
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', stop);
  }
}

// ---- Pictures -----------------------------------------------------------------------------
// The square copy the plugin makes of every recipe photo; RecipeTin Eats resizes on request.
function cleanImage(u) {
  u = String(u || '');
  return /^https:\/\/[a-z0-9.-]+\/[^\s"'<>()\\]+$/i.test(u) ? u : '';
}
export function thumbUrl(u) {
  u = cleanImage(u);
  if (!u) return '';
  if (/\/tachyon\//.test(u)) return `${u.replace(/\?.*$/, '')}?resize=400%2C400`;
  const p = u.replace(/\?.*$/, '').replace(/-scaled(\.[a-z]+)$/i, '$1');
  return /\.(jpe?g|png|webp)$/i.test(p) ? p.replace(/(-\d+x\d+)?\.(jpe?g|png|webp)$/i, '-500x500.$2') : u;
}
// When the square copy isn't there (an old photo): WordPress's own free resizer makes one.
export function altThumb(u) {
  u = cleanImage(u);
  if (!u || /\/tachyon\//.test(u)) return '';
  return `https://i0.wp.com/${u.replace(/^https:\/\//, '').replace(/\?.*$/, '')}?resize=400%2C400`;
}
export function photoUrl(u) {
  u = cleanImage(u);
  if (!u) return '';
  if (/\/tachyon\//.test(u)) return `${u.replace(/\?.*$/, '')}?resize=800%2C800`;
  // "-scaled" photos are 2560 px (far too heavy here): WordPress's own resizer makes an 800.
  if (/-scaled\.[a-z]+$/i.test(u)) return `https://i0.wp.com/${u.replace(/^https:\/\//, '').replace(/\?.*$/, '')}?resize=800%2C800`;
  return u;
}

// ---- Which kind of food (for the table colour and the plan's meal) -------------------------
const KINDS = [
  ['indian', /indian|curry|masala|tikka|korma|dal\b|biryani|tandoori|naan|paneer/],
  ['thai', /thai|vietnam|pho\b|pad thai|banh mi|laksa/],
  ['chinese', /chinese|stir.?fry|lo mein|chow mein|dumpling|kung pao|szechuan|sichuan|wonton|fried rice/],
  ['japanese', /japanese|teriyaki|ramen|udon|sushi|katsu|miso|tempura/],
  ['korean', /korean|bulgogi|kimchi|gochujang|bibimbap/],
  ['mexican', /mexican|tex.?mex|taco|burrito|enchilada|quesadilla|fajita|salsa|carnitas|birria|tamale|nacho/],
  ['italian', /italian|pasta|lasagna|risotto|pizza|gnocchi|parmigiana|parmesan|carbonara|bolognese|spaghetti|penne/],
  ['mediterranean', /greek|mediterranean|middle eastern|lebanese|turkish|moroccan|israeli|souvlaki|gyro|falafel|hummus|shawarma|tzatziki/],
  ['southern', /southern|cajun|creole|bbq|barbecue|gumbo|jambalaya|cornbread|biscuits?\b/],
];
function kindOf(words, course) {
  if (/dessert|cake|cookie|baking|sweet|brownie|pie\b|tart\b|candy|cupcake|muffin/.test(course)) return { type: 'dessert', table: 'desserts' };
  if (/breakfast|brunch/.test(course)) return { type: 'breakfast', table: 'breakfast' };
  const k = KINDS.find(([, re]) => re.test(words));
  if (/lunch|sandwich|salad/.test(course) && !k) return { type: 'lunch', table: 'lunch' };
  return { type: 'dinner', table: k ? k[0] : 'american' };
}

// ---- Amounts: "1 1/2", "½", "1.2 kg/ 2.4lb", "2-3", metric made into US measures ---------
const FRAC = { '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875 };
const NUM = '(\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d*\\.?\\d+\\s*[½⅓⅔¼¾⅛⅜⅝⅞]?|[½⅓⅔¼¾⅛⅜⅝⅞])';
const MEASURE = new RegExp(`${NUM}(?:\\s*(?:-|–|to)\\s*${NUM})?(?:\\s*-?\\s*)(fl\\.?\\s*oz|[a-zA-Z]+\\.?)?`, 'g');
function num(t) {
  t = String(t).trim();
  let m = t.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (m) return +m[1] + m[2] / m[3];
  m = t.match(/^(\d+)\/(\d+)$/);
  if (m) return m[2] > 0 ? m[1] / m[2] : 0;
  m = t.match(/^(\d*\.?\d+)?\s*([½⅓⅔¼¾⅛⅜⅝⅞])?$/);
  if (m) return (m[1] ? parseFloat(m[1]) : 0) + (m[2] ? FRAC[m[2]] : 0);
  return 0;
}
const US = { cup: 'cup', cups: 'cup', c: 'cup', tablespoon: 'tbsp', tablespoons: 'tbsp', tbsp: 'tbsp', tbs: 'tbsp', tbl: 'tbsp', tbsps: 'tbsp',
  teaspoon: 'tsp', teaspoons: 'tsp', tsp: 'tsp', tsps: 'tsp', pound: 'lb', pounds: 'lb', lb: 'lb', lbs: 'lb', ounce: 'oz', ounces: 'oz', oz: 'oz',
  quart: 'quart', quarts: 'quart', qt: 'quart', pint: 'pint', pints: 'pint', pt: 'pint' };
const METRIC = { g: 'g', gram: 'g', grams: 'g', gr: 'g', kg: 'kg', kilo: 'kg', kilos: 'kg', kilogram: 'kg', kilograms: 'kg',
  ml: 'ml', millilitre: 'ml', milliliter: 'ml', millilitres: 'ml', milliliters: 'ml', l: 'l', litre: 'l', liter: 'l', litres: 'l', liters: 'l' };
const round = (x, step) => Math.max(step, Math.round(x / step) * step);
function toUS(q, unit) {
  if (unit === 'kg') { q *= 1000; unit = 'g'; }
  if (unit === 'l') { q *= 1000; unit = 'ml'; }
  if (unit === 'g') { const oz = q / 28.35; return oz >= 16 ? [round(oz / 16, 0.25), 'lb'] : [round(oz, oz < 4 ? 0.5 : 1), 'oz']; }
  const tsp = q / 4.93;
  if (tsp < 3) return [round(tsp, 0.25), 'tsp'];
  if (tsp < 12) return [round(tsp / 3, 0.5), 'tbsp'];
  return [round(tsp / 48, 0.25), 'cup'];
}
/** amount + unit as the site writes them -> "1½ lb" style text for parseIngredient, plus leftovers. */
function measureText(amount, unit) {
  const s = plainText(`${amount || ''} ${unit || ''}`).replace(/([a-z.])\s*\/\s*(?=\d)/gi, '$1 / ');
  const found = [];
  let m;
  MEASURE.lastIndex = 0;
  while ((m = MEASURE.exec(s))) {
    if (!m[0].trim()) { MEASURE.lastIndex++; continue; }
    const word = (m[3] || '').toLowerCase().replace(/\.$/, '').replace(/^fl\.?\s*oz$/, 'floz');
    found.push({ q: num(m[1]), word, at: m.index, len: m[0].length });
  }
  const us = found.find((f) => US[f.word] || f.word === 'floz');
  const metric = found.find((f) => METRIC[f.word]);
  let pick = us || metric || found[0];
  if (!pick || !(pick.q > 0)) return { text: '', rest: s };
  let qty = pick.q;
  let u = '';
  if (pick === us) {
    if (pick.word === 'floz') { [qty, u] = toUS(pick.q * 29.57, 'ml'); } else u = US[pick.word];
  } else if (pick === metric) [qty, u] = toUS(pick.q, METRIC[pick.word]);
  // What is left ("(6 pieces)", "large", "cloves") stays with the item.
  let rest = s;
  found.filter((f) => f === pick || f === us || f === metric).sort((a, b) => b.at - a.at).forEach((f) => {
    rest = rest.slice(0, f.at) + rest.slice(f.at + f.len);
  });
  rest = rest.replace(/^[\s/,]+|[\s/,]+$/g, '').replace(/\(\s*\)/g, '').trim();
  if (pick !== us && pick !== metric) { u = pick.word; pick = null; }
  const q = Math.round(qty * 1000) / 1000;
  // "400g / 14oz can": one can, its size kept with the item ("1 (14 oz) can" for parseIngredient).
  const tin = rest.match(/^(?:x\s+)?(cans?|tins?|jars?)\b\s*/i);
  const count = pick && found.find((f) => f !== us && f !== metric && (!f.word || f.word === 'x'));
  if (pick && tin) {
    return { text: `${count ? count.q : 1} (${q} ${u}) ${/^j/i.test(tin[1]) ? 'jar' : 'can'}`, rest: rest.slice(tin[0].length).trim() };
  }
  // "1" + "15 oz.": one of something that size ("1 (15 oz)": the size stays with the item).
  if (count && count.at < pick.at && count.q > 0) {
    rest = rest.replace(/^\s*x?\s*\d+(\.\d+)?\s*(x\s*)?/i, '').trim();
    return { text: `${count.q} (${q} ${u})`, rest, sized: true };
  }
  return { text: `${q} ${u}`.trim(), rest };
}

// Where things are in a US supermarket, beyond what parseIngredient knows.
const MORE_AISLES = [
  ['international', /\b(soy sauce|fish sauce|oyster sauce|hoisin|sriracha|sesame oil|mirin|rice vinegar|curry paste|gochujang|miso|sambal|tahini|coconut aminos|rice noodles|nori|wonton wrappers?|kecap|shaoxing|chipotles? in adobo|harissa|panko)\b/],
  ['spices', /\b(turmeric|garam masala|curry powder|cardamom|cayenne|chilli powder|chili flakes|red pepper flakes|coriander seeds?|ground coriander|cumin|fennel seeds?|mustard seeds?|smoked paprika|italian seasoning|cajun seasoning|taco seasoning|bay leaf|bay leaves|dried \w+|star anise|cloves? ground|ground \w+|sesame seeds)\b/],
  ['dairy', /\b(yoghurt|ghee|heavy cream|thickened cream|creme fraiche|crème fraîche|ricotta|feta|halloumi|mascarpone|gruyere|egg yolks?|egg whites?)\b/],
  ['produce', /\b(shallots?|leeks?|scallions?|green onions?|spring onions?|eggplants?|aubergine|courgettes?|chillies|chiles|jalapeños?|coriander|cilantro|mint|dill|chives|thyme|rosemary|sage|lemongrass|bok choy|snow peas|sweet potato(es)?|pumpkin|beetroot|beets?|radish(es)?|asparagus|peas|corn on the cob|fresh \w+)\b/],
];
function aisleFor(item, guess, unit) {
  const t = String(item).toLowerCase();
  if (unit === 'can') return 'canned';
  if (/\b(water|ice)\b/.test(t) && !/watermelon|water chestnut/.test(t)) return 'pantry';
  // Stock and broth are on the canned shelf, whatever is in them.
  if (/\b(stock|broth)\b/.test(t) && !/cube|powder/.test(t)) return 'canned';
  const hit = MORE_AISLES.find(([, re]) => re.test(t));
  return hit ? hit[0] : guess;
}

/** One ingredient of the site's list -> the library's { q, u, item, note, aisle }. */
// "finely chopped fresh ginger" is bought as "fresh ginger": how it is cut goes in the note,
// so the shopping list says what to buy (and the same thing from two recipes adds up).
const PREP = /^((?:finely|roughly|coarsely|thinly|freshly|lightly|firmly)\s+)?(chopped|minced|diced|sliced|grated|crushed|shredded|peeled|packed|softened|melted|cubed|torn|ground(?= (?:black|white) pepper))(\s+and)?\s+/i;
// A note: its first part only, never cut in the middle of a word or a bracket.
function shortNote(t) {
  t = String(t || '').trim();
  if (t.length <= 60) return t;
  let cut = t.slice(0, 60);
  const at = Math.max(cut.lastIndexOf(','), cut.lastIndexOf(';'), cut.lastIndexOf(' ('), cut.lastIndexOf(' or '));
  cut = at > 20 ? cut.slice(0, at) : cut.replace(/\s+\S*$/, '');
  if ((cut.match(/\(/g) || []).length > (cut.match(/\)/g) || []).length) cut = cut.replace(/\s*\([^)]*$/, '');
  return cut.replace(/[\s,;:-]+$/, '');
}

/** One ingredient of the site's list -> the library's { q, u, item, note, aisle }. */
export function webIngredient(x) {
  let name = noNotes(plainText(x.name));
  // (Budget Bytes puts each thing's price in its note: "$0.74", "$1.00**".)
  let notes = noNotes(plainText(x.notes).replace(/\$\s?\d+(\.\d+)?\s*\**/g, ' ').replace(/\*+/g, ' '))
    .replace(/^[\s,;:-]+|[\s,;:-]+$/g, '').replace(/^\(([^()]*)\)$/, '$1').trim();
  if (!name) return null;
  const prep = [];
  let p;
  // ("crushed tomatoes", "diced tomatoes" are what the can says: those stay.)
  while ((p = name.match(PREP)) && name.length > p[0].length && !/^tomato/i.test(name.slice(p[0].length))) {
    prep.push(p[0].replace(/\s+and\s*$/i, '').trim());
    name = name.slice(p[0].length);
  }
  const m = measureText(x.amount, x.unit);
  // "1 (15 oz)" with "one can" in the note: a 15 oz can.
  if (m.sized && /\b(one |a )?(can|tin)\b/i.test(notes)) {
    m.text += ' can';
    notes = notes.replace(/\b(one |a )?(can|tin)\b,?\s*/i, '').replace(/^[\s,;:-]+|[\s,;:-]+$/g, '');
  }
  const line = `${m.text} ${m.rest && !/^\(/.test(m.rest) ? `${m.rest} ` : ''}${name}`.trim();
  const out = parseIngredient(line.replace(/,/g, ' '));
  const extra = [prep.join(' and ').toLowerCase(), m.rest && /^\(/.test(m.rest) ? m.rest.replace(/^\(|\)$/g, '') : '', notes].filter(Boolean).join(', ');
  if (extra) out.note = shortNote(extra);
  out.item = String(out.item).toLowerCase().slice(0, 60);
  out.aisle = aisleFor(out.item, out.aisle, out.u);
  return out;
}

// Steps written as one long paragraph read badly at cooking-mode size: split at sentences
// into pieces of about 200 letters (a timer stays with the sentence that gives its time).
function splitStep(text) {
  if (text.length <= 230) return [text];
  // (At a full stop and a space before a capital: "1.5 lb" and "e.g. this" stay whole.)
  const sentences = text.split(/(?<=[.!?;])\s+(?=[A-Z0-9(])/);
  const out = [];
  let cur = '';
  sentences.forEach((x) => {
    x = x.trim();
    if (!x) return;
    if (cur && (cur + ' ' + x).length > 200) { out.push(cur); cur = x; } else cur = cur ? `${cur} ${x}` : x;
  });
  if (cur) {
    // A short tail joins the step before it.
    if (out.length && cur.length < 60 && (out[out.length - 1] + ' ' + cur).length <= 250) out[out.length - 1] += ` ${cur}`;
    else out.push(cur);
  }
  return out.map((x) => x.slice(0, 600));
}

/** How well a title fits the words searched: 2 = every word whole, 1 = some, 0 = none. */
export function titleFit(title, q) {
  const words = String(q || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(' ').filter((w) => w.length > 1);
  if (!words.length) return 2;
  const t = ` ${String(title).toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `;
  const stem = (w) => (w.length > 4 && /oes$/.test(w) ? w.slice(0, -2) : w.length > 3 && /[^s]s$/.test(w) ? w.slice(0, -1) : w);
  const whole = (w) => new RegExp(` ${stem(w)}(s|es)? `).test(t);
  const n = words.filter(whole).length;
  return n === words.length ? 2 : n ? 1 : 0;
}

// ---- A full recipe in the library's shape --------------------------------------------------
function toRecipe(site, data) {
  const R = data.recipe || {};
  const id = `web:${site}:${data.id}`;
  const title = tidyTitle(R.name) || 'Recipe';
  const names = (list) => (Array.isArray(list) ? list.map((t) => plainText(t && t.name)).join(' ') : '');
  const course = names((R.tags || {}).course).toLowerCase();
  const kind = kindOf(`${title} ${names((R.tags || {}).cuisine)} ${course}`.toLowerCase(), `${course} ${title.toLowerCase()}`);
  const prep = Math.max(0, Math.round(+R.prep_time || 0));
  const total = Math.max(0, Math.round(+R.total_time || 0));
  const cook = Math.max(Math.round(+R.cook_time || 0), total - prep, 0);
  const ingredients = [];
  (R.ingredients_flat || []).forEach((x) => {
    if (!x || x.type === 'group') return;
    const ing = webIngredient(x);
    if (ing) ingredients.push(ing);
  });
  const steps = [];
  let group = '';
  (R.instructions_flat || []).forEach((x) => {
    if (!x) return;
    if (x.type === 'group') { group = plainText(x.name).replace(/[:\s]+$/, ''); return; }
    const text = noNotes(plainText(x.text));
    if (!text) return;
    const first = group && !steps.some((s) => s.group === group);
    splitStep(first ? `${group}: ${text}` : text).forEach((t) => steps.push({ text: t, group }));
  });
  steps.forEach((s) => { delete s.group; });
  const blurb = plainText(R.summary).replace(/^recipe video (above|below)\.?\s*/i, '').split(/(?<=[.!?])\s/)[0] || '';
  const link = String(data.link || '');
  const r = {
    id, title, blurb: blurb.length <= 120 ? blurb : '', cuisine: 'web', type: kind.type, table: kind.table,
    serves: Math.min(24, Math.max(1, Math.round(parseFloat(R.servings) || 4))), prep, cook,
    tags: prep + cook > 0 && prep + cook <= 30 ? ['quick'] : [],
    ingredients, steps, web: true, site: SITES[site].name,
    source: { site: SITES[site].name, url: /^https:\/\//.test(link) ? link : SITES[site].base },
    thumb: thumbUrl(R.image_url), thumbAlt: altThumb(R.image_url), photo: photoUrl(R.image_url),
  };
  return r;
}
/** The small index entry (like data/recipes/index.json's) of a full web recipe. */
export const entryOf = (r) => ({ id: r.id, t: r.title, c: 'web', ty: r.type, m: (r.prep || 0) + (r.cook || 0), g: r.tags || [],
  b: '', s: r.serves, img: r.thumb, alt: r.thumbAlt || '', site: r.site, table: r.table });

// ---- Kept on the screen --------------------------------------------------------------------
// web.index.v1: [{ ...entry, at, keep }] newest first; web.r.<id>: the full recipe.
const INDEX_KEY = 'web.index.v1';
const RECENT_MAX = 60;
const KEPT_MAX = 300;
let index = null;
const loadIndexList = () => {
  if (!index) index = (read(INDEX_KEY, []) || []).filter((x) => x && isWebId(x.id) && typeof x.t === 'string');
  return index;
};
const saveIndex = () => write(INDEX_KEY, index);
const memo = {}; // id -> full recipe, this visit

// Recipes the household made its own: hearted, on the plan, cooked, or being cooked.
let refsAt = 0;
let refs = {};
function references() {
  if (Date.now() - refsAt < 5000) return refs;
  refsAt = Date.now();
  refs = {};
  const add = (id) => { if (isWebId(id)) refs[id] = 1; };
  try { favorites().forEach(add); } catch (e) { /* storage off */ }
  try { const plan = getPlan(); Object.keys(plan).forEach((k) => ['breakfast', 'lunch', 'dinner'].forEach((m) => (plan[k][m] || []).forEach(add))); } catch (e) { /* storage off */ }
  (read('recipes.cooked.v1', []) || []).forEach((x) => add(x && x.id));
  try {
    for (let k = 0; k < localStorage.length; k++) {
      const key = localStorage.key(k);
      if (key && key.indexOf('recipe.v1.web:') === 0) add(key.slice(10));
    }
  } catch (e) { /* storage off */ }
  return refs;
}
// Mark what is the household's now (for good), and let the rest age out.
function tidy() {
  const list = loadIndexList();
  const now = references();
  let changed = false;
  list.forEach((x) => { if (now[x.id] && !x.keep) { x.keep = 1; changed = true; } });
  let recent = 0;
  let kept = 0;
  const out = list.filter((x) => {
    const stay = x.keep ? (++kept <= KEPT_MAX || now[x.id]) : ++recent <= RECENT_MAX;
    if (!stay) { try { localStorage.removeItem(`web.r.${x.id}`); } catch (e) { /* storage off */ } delete memo[x.id]; changed = true; }
    return stay;
  });
  index = out;
  if (changed) saveIndex();
}
function remember(entry, full) {
  const list = loadIndexList().filter((x) => x.id !== entry.id);
  const old = loadIndexList().find((x) => x.id === entry.id);
  list.unshift(Object.assign({}, entry, { at: Date.now(), keep: (old && old.keep) || entry.keep || 0 }));
  index = list;
  if (full) {
    memo[entry.id] = full;
    if (!write(`web.r.${entry.id}`, full)) {
      // Storage full: the older recipes nobody kept go first, then try once more.
      index = list.filter((x, i) => {
        if (x.keep || i < 10) return true;
        try { localStorage.removeItem(`web.r.${x.id}`); } catch (e) { /* storage off */ }
        return false;
      });
      write(`web.r.${entry.id}`, full);
    }
  }
  tidy();
  saveIndex();
}

/** Index entries of every web recipe kept on this screen (for loadIndex's byId). */
export function webEntries() {
  tidy();
  return loadIndexList();
}
/** A web recipe already on this screen (no network), or undefined. */
export function cachedWebRecipe(id) {
  if (memo[id]) return memo[id];
  const r = read(`web.r.${id}`, null);
  if (r && r.id === id && Array.isArray(r.ingredients)) { memo[id] = r; return r; }
  return undefined;
}

const loading = {};
/** The full recipe for "web:<site>:<id>" (kept copy first, then the site). Resolves null if unknown. */
export function loadWebRecipe(id) {
  const have = cachedWebRecipe(id);
  if (have) {
    // Opened again: it moves to the front, so it is the last to age out.
    const e = loadIndexList().find((x) => x.id === id);
    if (e && Date.now() - (e.at || 0) > 60000) remember(entryOf(have), null);
    return Promise.resolve(have);
  }
  const m = String(id).match(/^web:([a-z]+):(\d+)$/);
  if (!m || !SITES[m[1]]) return Promise.resolve(null);
  if (!loading[id]) {
    loading[id] = getJson(`${SITES[m[1]].base}${API}wprm_recipe/${m[2]}?${FULL_FIELDS}`, RECIPE_MS)
      .then((data) => {
        if (!data || !data.recipe) return null;
        const r = toRecipe(m[1], data);
        remember(entryOf(r), r);
        return r;
      })
      .finally(() => { delete loading[id]; });
  }
  return loading[id];
}

/** Hearted or planned from a list (maybe never opened): keep its card now, the recipe soon. */
export function keepWebRecipe(entry) {
  if (!entry || !isWebId(entry.id)) return;
  const known = loadIndexList().find((x) => x.id === entry.id);
  if (!known) remember(Object.assign({}, entry, { keep: 1 }), null);
  else if (!known.keep) { known.keep = 1; saveIndex(); }
  if (!cachedWebRecipe(entry.id) && online()) loadWebRecipe(entry.id).catch(() => null);
}

// ---- Searching -------------------------------------------------------------------------------
// Searches made lately are kept a few days, so going back (or searching it again) is instant.
const SEARCH_KEY = 'web.searches.v1';
const SEARCH_DAYS = 3;
const SEARCHES_KEPT = 20;
function searchCache() { const c = read(SEARCH_KEY, {}); return c && typeof c === 'object' ? c : {}; }
const cacheKey = (kind, q, page) => `${kind}|${String(q).toLowerCase().trim()}|${page}`;
/** A search done lately, from the screen's own copy (no network): { list, more } or null. */
export function cachedWebSearch(kind, q, page = 1) {
  const hit = searchCache()[cacheKey(kind, q, page)];
  return hit && Date.now() - hit.at < SEARCH_DAYS * 86400000 && Array.isArray(hit.list) ? hit : null;
}
function keepSearch(key, list, more) {
  const c = searchCache();
  c[key] = { at: Date.now(), list, more };
  const keys = Object.keys(c).sort((a, b) => c[b].at - c[a].at);
  keys.slice(SEARCHES_KEPT).forEach((k) => { delete c[k]; });
  if (!write(SEARCH_KEY, c)) { try { localStorage.removeItem(SEARCH_KEY); } catch (e) { /* storage off */ } }
}

function listEntry(site, x, q) {
  const R = (x && x.recipe) || {};
  const t = tidyTitle(R.name);
  if (!t || !x.id) return null;
  const total = Math.round(+R.total_time || 0) || (Math.round(+R.prep_time || 0) + Math.round(+R.cook_time || 0));
  const k = kindOf(t.toLowerCase(), t.toLowerCase());
  return { id: `web:${site}:${x.id}`, t, f: titleFit(t, q), c: 'web', ty: k.type, m: total > 0 && total < 2000 ? total : 0, g: total > 0 && total <= 30 ? ['quick'] : [],
    b: '', s: 0, img: thumbUrl(R.image_url), alt: altThumb(R.image_url), site: SITES[site].name, table: k.table };
}

// Term ids ("Indian" is cuisine 544 on one site, 1077 on another), kept for good.
const TERMS_KEY = 'web.terms.v1';
async function termId(site, tax, names, signal) {
  const all = read(TERMS_KEY, {}) || {};
  const k = `${site}|${tax}|${names.join('/')}`;
  if (k in all) return all[k];
  const found = await getJson(`${SITES[site].base}${API}${tax}?search=${encodeURIComponent(names[0])}&per_page=20&_fields=id,name,count`, SEARCH_MS, signal);
  const low = names.map((n) => n.toLowerCase());
  const hits = (Array.isArray(found) ? found : []).filter((t) => t && low.indexOf(plainText(t.name).toLowerCase()) >= 0 && t.count > 0);
  const id = hits.length ? hits.sort((a, b) => b.count - a.count)[0].id : 0;
  const now = read(TERMS_KEY, {}) || {};
  now[k] = id;
  write(TERMS_KEY, now);
  return id;
}

// The kinds of food of the library's first page, as the sites name them.
const KIND_TERMS = {
  breakfast: ['wprm_course', ['Breakfast']], lunch: ['wprm_course', ['Lunch']], desserts: ['wprm_course', ['Dessert', 'Desserts']],
  weeknight: ['wprm_course', ['Dinner', 'Main Course', 'Main', 'Main Dish']], american: ['wprm_cuisine', ['American']],
  italian: ['wprm_cuisine', ['Italian']], mexican: ['wprm_cuisine', ['Mexican', 'Tex-Mex']], southern: ['wprm_cuisine', ['Southern', 'Cajun']],
  chinese: ['wprm_cuisine', ['Chinese']], japanese: ['wprm_cuisine', ['Japanese']], thai: ['wprm_cuisine', ['Thai', 'Vietnamese']],
  indian: ['wprm_cuisine', ['Indian']], mediterranean: ['wprm_cuisine', ['Mediterranean', 'Greek', 'Middle Eastern']], korean: ['wprm_cuisine', ['Korean']],
};
/** Whether a kind of food (a cuisine id of the library) has web recipes to show. */
export const hasWebKind = (kind) => !!KIND_TERMS[kind];

async function siteSearch(site, { q, kind, page }, signal) {
  const base = `${SITES[site].base}${API}wprm_recipe?per_page=${PER_SITE}&page=${page}&${LIST_FIELDS}`;
  let filter = '';
  if (kind) {
    const [tax, names] = KIND_TERMS[kind];
    const id = await termId(site, tax, names, signal);
    if (!id) return { list: [], more: false };
    filter = `&${tax}=${id}`;
  }
  const words = q ? `&search=${encodeURIComponent(q)}` : '';
  const ask = (cols) => getJson(`${base}${filter}${words}${cols}`, SEARCH_MS, signal)
    .catch((e) => (/^400$/.test(e.message) ? [] : Promise.reject(e))); // past the last page
  let raw = await ask(q ? '&search_columns=post_title' : '');
  raw = Array.isArray(raw) ? raw : [];
  const more = raw.length >= PER_SITE;
  // Few titles have the words: the recipes that mention them fill in.
  if (q && page === 1 && raw.length < 3) {
    const wide = await ask('').catch(() => []);
    // (Only those with a searched word in the title: the rest of a full-text search is noise.)
    (Array.isArray(wide) ? wide : []).forEach((x) => {
      if (x && x.recipe && !raw.some((y) => y.id === x.id) && titleFit(plainText(x.recipe.name), q) > 0) raw.push(x);
    });
  }
  const seen = {};
  const list = raw.map((x) => listEntry(site, x, q)).filter((e) => {
    if (!e) return false;
    const key = e.t.toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (seen[key]) return false;
    seen[key] = 1;
    return true;
  });
  list.sort((a, b) => b.f - a.f); // every word whole first ("butter chicken" before "buttermilk chicken")
  list.forEach((e, i) => { e.n = (page - 1) * PER_SITE + i; }); // its place on its site (to take turns)
  return { list, more };
}

/**
 * Recipes on the web for `q` (words), or for `kind` (a cuisine id of the library, e.g.
 * 'indian', optionally with words: Indian + "chicken"). Every site at once; `onResults(list)`
 * is called with each site's new cards as they arrive. Resolves { list, more } once all
 * have answered or given up (more = the sites with another page: pass them as `sites` with
 * the next `page`); nothing at all offline (never throws).
 */
export async function searchWeb({ q = '', kind = '', page = 1, sites = SITE_IDS, onResults = () => {}, signal } = {}) {
  q = String(q || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  if ((!q && !kind) || (kind && !KIND_TERMS[kind])) return { list: [], more: [] };
  const key = cacheKey(kind || 'q', `${q}`, page);
  const hit = cachedWebSearch(kind || 'q', q, page);
  if (hit) {
    // (No Wi-Fi: only the cards whose recipe is kept here, the others couldn't open.)
    const list = online() ? hit.list.slice() : hit.list.filter((e) => cachedWebRecipe(e.id));
    if (list.length) onResults(list);
    return { list, more: online() && Array.isArray(hit.more) ? hit.more : [] };
  }
  if (!online()) return { list: [], more: [] };
  const all = [];
  const ids = {};
  const more = []; // the sites that have another page
  let answered = 0;
  await Promise.all(sites.filter((x) => SITES[x]).map((site) => siteSearch(site, { q, kind, page }, signal).then((res) => {
    answered++;
    if (res.more) more.push(site);
    const fresh = res.list.filter((e) => !ids[e.id]);
    fresh.forEach((e) => { ids[e.id] = 1; all.push(e); });
    if (fresh.length && !(signal && signal.aborted)) onResults(fresh);
  }).catch(() => null)));
  if (answered && !(signal && signal.aborted)) keepSearch(key, all, more);
  return { list: all, more };
}
