// Shared bits for the kitchen screens: Recipes, a recipe, Week plan, Shopping list.
import { backHref, backLabel as hubLabel } from '../services/nav.js';
import { settings } from '../config.js';
import { weekRecipeIds, shoppingCount } from '../services/meal-plan.js';
import { foodArt, foodFor } from '../art.js';

export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Food pictures for white cards: the same scenes as the Recipes tiles, on a soft halo
// (the tiles' dark halos are too heavy on white). [halo, plate shadow] per scene.
const SOFT = {
  breakfast: ['#F6E3C8', '#EBCB9A'], lunch: ['#D6E6E1', '#B5D1C8'],
  dinner: ['#F6D9C8', '#E9BFA6'], dessert: ['#F6DCE6', '#E9B9CB'],
};
/** <svg> food scene for a meal slot or a recipe ("hint" = cuisine, type and title). */
export function mealArt(meal, hint = '', style = '') {
  // foodFor reads "cake"/"bak" as dessert; pancakes, crab cakes and baked dinners aren't.
  const h = String(hint).toLowerCase().replace(/pancakes?/g, 'breakfast')
    .replace(/\b(crab|fish|salmon|rice|potato|corn) ?cakes?\b/g, '').replace(/\bbaked?\b/g, '');
  const k = foodFor(meal, h);
  const svg = foodArt[k](SOFT[k][0], SOFT[k][1]);
  return style ? svg.replace('style="display:block;', `style="display:block;${style}`) : svg;
}
/** Same, for a full recipe (its cuisine file says breakfast/lunch/desserts; your own recipes keep the meal in type). */
export const recipeArt = (r, style) => mealArt(r.mine ? r.type : r.cuisine, `${r.cuisine || ''} ${r.type || ''} ${r.title || ''}`, style);
/** Tighter framing of a food scene (just the dish and its halo), for small spots. */
export const cropFood = (svg) => svg.replace('viewBox="0 0 386 210"', 'viewBox="56 16 274 204"');
/** A picture that fills whatever room is left in a flex column (put it in a .k-art box). */
export const FILL = 'position:absolute;left:0;right:0;top:0;bottom:0;margin:auto;width:100%;height:100%;';

export function kitchenStyles() {
  const a = settings.accent;
  return `
  <style>
    .k-wrap{height:100%;padding:32px 40px 40px;display:flex;flex-direction:column;gap:22px}
    .k-top{display:flex;align-items:center;gap:16px;min-height:56px}
    .k-title{font-size:34px;font-weight:500;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .k-tabs{display:flex;gap:6px;background:#FFFFFF;border-radius:999px;padding:6px;flex:none}
    .k-tab{min-height:48px;padding:0 20px;border-radius:999px;font-size:17px;font-weight:600;display:inline-flex;align-items:center;gap:8px;color:#1D2430}
    .k-tab.on{background:#1D2430;color:#FFFFFF}
    .k-count{min-width:26px;height:26px;padding:0 8px;border-radius:999px;background:${a};color:#FFFFFF;font-size:14px;display:inline-flex;align-items:center;justify-content:center}
    .k-btn{min-height:52px;padding:0 24px;border-radius:999px;border:none;font-size:18px;font-weight:600;font-family:Inter,sans-serif;
      cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;background:#FFFFFF;color:#1D2430;flex:none;transition:transform .1s ease}
    .k-btn:active{transform:scale(.96)}
    .k-btn.solid{background:${a};color:#FFFFFF}
    .k-btn.dark{background:#1D2430;color:#FFFFFF}
    .k-btn.line{background:transparent;border:2px solid #D9DDE2}
    .k-btn.sm{min-height:44px;padding:0 16px;font-size:16px}
    .k-scroll{flex-grow:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch}
    .k-tag{display:inline-flex;align-items:center;border-radius:999px;padding:4px 12px;font-size:14px;font-weight:600;background:#F1F2F4;color:#1D2430;white-space:nowrap}
    /* A tag that is a link keeps its small look but takes a finger-sized touch. */
    a.k-tag{position:relative}
    a.k-tag::after{content:"";position:absolute;top:-9px;bottom:-9px;left:-4px;right:-4px}
    .k-badge{display:inline-flex;align-items:center;border-radius:999px;padding:4px 12px;font-size:14px;font-weight:600;background:${a};color:#FFFFFF;white-space:nowrap}
    .k-input{min-height:56px;border-radius:999px;border:2px solid #D9DDE2;background:#FFFFFF;padding:0 24px;font-size:19px;
      font-family:Inter,sans-serif;color:#1D2430;outline:none;min-width:0}
    .k-input:focus{border-color:#1D2430}
    .k-art{position:relative;flex:1 1 0;min-height:0}
    .k-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;text-align:center;color:#4A5363;font-size:20px;padding:40px}
  </style>`;
}

/** Top bar: back link, title, and the three kitchen tabs. */
export function kitchenTop({ title, back = backHref(), backLabel = hubLabel(), active = '', extra = '' }) {
  const tab = (id, href, label) => `<a href="${href}" class="k-tab${active === id ? ' on' : ''}">${label}<span data-kcount="${id}" style="display:none" class="k-count"></span></a>`;
  return `
    <div class="k-top">
      ${back === 'history'
        ? `<button data-back class="k-btn">${esc(backLabel)}</button>`
        : `<a href="${back}" class="k-btn">${esc(backLabel)}</a>`}
      <div class="k-title display">${esc(title)}</div>
      ${extra}
      <nav class="k-tabs">
        ${tab('recipes', '#/recipes', 'Recipes')}
        ${tab('plan', '#/plan', 'Week plan')}
        ${tab('shopping', '#/shopping', 'Shopping list')}
      </nav>
    </div>`;
}

/** "← Back" buttons made with kitchenTop({back:'history'}) go back, or to fallback. */
export function wireBack(el, fallback) {
  el.addEventListener('click', (e) => {
    if (!e.target.closest('[data-back]')) return;
    if (history.length > 1) history.back(); else location.hash = fallback;
  });
}

/** Fill the little number badges on the Week plan / Shopping list tabs. */
export async function fillCounts(el) {
  const set = (id, n) => {
    const b = el.querySelector(`[data-kcount="${id}"]`);
    if (!b) return;
    b.textContent = n;
    b.style.display = n ? '' : 'none';
  };
  set('plan', weekRecipeIds().length);
  try { const n = await shoppingCount(); if (el.isConnected) set('shopping', n); } catch (e) { /* offline */ }
}

// ---------------------------------------------------------------------------------------
// The painted plate: a dish seen from straight above, painted from what the recipe says
// (its cuisine, its type and the words in its name). No photos: shapes and colours only.
// Used by the recipe page (big, slowly turning), the recipe browser's cards and cooking mode.
// ---------------------------------------------------------------------------------------
const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0; return h; };
// The same "random" number every time for a recipe, so its plate never changes.
const rr = (seed, i) => { const x = Math.sin((seed % 9973) * 12.9898 + i * 78.233) * 43758.5453; return x - Math.floor(x); };
const P = (n) => Math.round(n * 10) / 10;
const circ = (x, y, r, f, more = '') => `<circle cx="${P(x)}" cy="${P(y)}" r="${r}" fill="${f}"${more}/>`;
const ell = (x, y, rx, ry, f, rot = 0) => `<ellipse cx="${P(x)}" cy="${P(y)}" rx="${rx}" ry="${ry}" fill="${f}"${rot ? ` transform="rotate(${Math.round(rot)} ${P(x)} ${P(y)})"` : ''}/>`;
const sq = (x, y, s, f, rot = 0) => `<rect x="${P(x - s / 2)}" y="${P(y - s / 2)}" width="${s}" height="${s}" rx="${P(s * 0.22)}" fill="${f}"${rot ? ` transform="rotate(${Math.round(rot)} ${P(x)} ${P(y)})"` : ''}/>`;
// n things scattered inside a circle of radius R (around ox, oy).
const scatter = (seed, n, R, fn, ox = 0, oy = 0) => {
  let out = '';
  for (let i = 0; i < n; i++) {
    const a = rr(seed, i) * 6.283;
    const d = Math.sqrt(rr(seed, i + 40)) * R;
    out += fn(ox + Math.cos(a) * d, oy + Math.sin(a) * d, i);
  }
  return out;
};
const GREEN = ['#4F8A36', '#6FAE45', '#3E7A2E'];
const lime = (x, y, rot) => `<g transform="translate(${x} ${y}) rotate(${rot})"><path d="M-12 0A12 12 0 0 0 12 0Z" fill="#5E9A2A"/><path d="M-9 0A9 9 0 0 0 9 0Z" fill="#D7EFA0"/></g>`;
const lemon = (x, y) => circ(x, y, 14, '#F2D24B') + circ(x, y, 10.5, '#FBEFA0');
const sides = (seed, d) => circ(-34, 36, 13, GREEN[0]) + circ(-19, 46, 11, GREEN[1]) + circ(-45, 49, 9, GREEN[2])
  + circ(31, 38, 21, '#F6EBCF') + (d ? sq(29, 34, 9, '#FFE38A', 20) + circ(-36, 33, 4, '#7DBB55') : '');

/** Which plate to paint for a recipe (a full recipe or an entry of the index). */
export function plateKind(r) {
  const c = String((r && (r.cuisine || r.c)) || '');
  const ty = String((r && (r.type || r.ty)) || '');
  const s = ` ${c} ${ty} ${(r && (r.title || r.t)) || ''} `.toLowerCase();
  const has = (re) => re.test(s);
  if (c === 'desserts' || ty === 'dessert') {
    return has(/pie\b|tart\b|cobbler|crisp\b|galette/) ? 'pie'
      : has(/cookie|brownie|\bbars?\b|blondie|fudge|\bbark\b|truffle|snickerdoodle|macaroon|biscotti|shortbread/) ? 'cookies' : 'cake';
  }
  if (has(/soup|stew|chowder|bisque/)) return 'soup';
  if (c !== 'breakfast' && has(/sandwich|panini|grilled cheese|\bsubs?\b|hoagie|banh mi|po.?boy|cheesesteak/)) return 'sandwich';
  if (has(/salad|slaw|tabbouleh|fattoush/)) return 'salad';
  if (has(/taco|tostada|quesadilla|fajita|burrito|enchilada|taquito|gyro|\bwraps?\b|shawarma/)) return 'taco';
  if (c === 'breakfast' || ty === 'breakfast') {
    return has(/pancake|waffle|french toast|crepe/) ? 'pancakes'
      : has(/sandwich|bagel|biscuit|croissant/) ? 'sandwich'
        : has(/oat|granola|parfait|smoothie|yogurt|chia|muffin|scone|bread\b/) ? 'oats' : 'eggs';
  }
  if (has(/pizza|calzone|flatbread/)) return 'pizza';
  if (has(/dumpling|potsticker|gyoza|wonton|mandu|egg roll|spring roll|samosa|empanada|pierogi/)) return 'dumplings';
  if (has(/burger|slider|sloppy joe/)) return 'burger';
  if (has(/noodle|ramen|udon|soba|pad thai|lo mein|chow mein|\bpho\b|japchae|yakisoba|pad see/)) return 'noodles';
  if (has(/pasta|spaghetti|penne|lasagna|macaroni|mac and|mac &|fettuccine|linguine|ziti|rigatoni|gnocchi|ravioli|tortellini|carbonara|alfredo|bolognese|orzo|stroganoff|\bscampi/)) return 'pasta';
  if (has(/curry|curries|masala|korma|vindaloo|butter chicken|paneer/)) return 'curry';
  if (has(/soup|stew|chowder|bisque|gumbo|\bdal\b|broth|jjigae|pozole|hummus|\bdips?\b|tzatziki|guacamole|queso|etouffee/)
    || (has(/\bchili\b/) && !has(/chili[- ](lime|garlic|sauce|oil|crisp|glazed|rubbed)|sweet chili/))) return 'soup';
  if (has(/sandwich|panini|\bmelt\b|\bblt\b|\bsubs?\b|hoagie|grilled cheese|\bclub\b|po.?boy|banh mi|toast\b|hot dog|cheesesteak/)) return 'sandwich';
  if (has(/rice|stir-fry|stir fry|bibimbap|risotto|paella|biryani|jambalaya|pilaf|bowl|teriyaki|donburi|katsu|\bpoke\b/)) return 'rice';
  if (has(/shrimp|prawn/)) return 'shrimp';
  if (has(/salmon|fish|\bcod\b|tilapia|tuna|halibut|trout|mahi|seafood|scallop|crab|lobster/)) return 'fish';
  if (has(/chicken|turkey|wing|drumstick/)) return 'chicken';
  const tags = (r && (r.tags || r.g)) || [];
  if (ty === 'sides' || ty === 'veg' || tags.indexOf('vegetarian') >= 0 || tags.indexOf('vegan') >= 0) return 'veg';
  return 'steak';
}

// Each painter returns the food, drawn around (0,0) inside a circle of about 64.
// `s` is the recipe's words (lower case), `d` asks for the small extra touches (big plates).
const PLATES = {
  taco(seed, d, s) {
    const meat = /chicken|turkey/.test(s) ? '#C98A4B' : /fish|shrimp|cod/.test(s) ? '#E9B48A' : /bean|veg|potato/.test(s) ? '#5B3A2A' : '#7A3B1E';
    const one = (rot) => `<g transform="rotate(${rot}) translate(0 -38)">${ell(0, 0, 36, 25, '#EBC983')}<path d="M-24-2Q-18-10-6-6Q3-11 12-5Q23-8 25 1Q18 8 6 6Q-6 9-15 6Q-25 6-24-2Z" fill="${meat}"/>${ell(-8, -3, 4, 2.5, '#4E9A3A')}${ell(10, 3, 4, 2.5, '#4E9A3A')}${d ? sq(-14, 2, 4, '#FFF') + sq(3, -4, 4, '#FFF') + ell(17, -1, 3, 2, '#D9432B') : ''}</g>`;
    return one(-30) + one(90) + one(210) + circ(0, 0, 14, '#FFFFFF') + circ(0, 0, 11, '#C4391F') + (d ? lime(60, 58, 30) + lime(-62, -52, -150) : '');
  },
  pasta(seed, d, s) {
    const white = /alfredo|carbonara|mac|cheese|cream|cacio|scampi|garlic|lemon|stroganoff/.test(s);
    const sauce = /pesto/.test(s) ? '#5E8A2E' : white ? '#F6E7BD' : '#B5351F';
    return circ(0, 0, 58, '#EBC56F')
      + '<g fill="none" stroke="#D2A247" stroke-width="5" stroke-linecap="round"><path d="M-44-8Q-20-44 22-36Q52-24 44 10"/><path d="M-36 20Q-10 52 28 36"/><path d="M-46 8Q-40 34-18 44"/></g>'
      + `<path d="M-26-6Q-22-28 2-26Q26-26 28-4Q30 18 8 24Q-18 28-26-6Z" fill="${sauce}"/>`
      + (white ? scatter(seed, 5, 18, (x, y) => circ(x, y, 2, '#4A3A2A')) : '')
      + ell(-4, -6, 8, 4, '#3E8A3A', -30) + ell(8, 4, 7, 3.5, '#4E9A3A', 40)
      + (d ? scatter(seed + 3, 9, 40, (x, y) => circ(x, y, 1.8, '#FFFDF2')) : '');
  },
  noodles(seed, d, s) {
    const dry = /pad thai|lo mein|chow mein|japchae|yakisoba|pad see|stir|sesame|peanut|cold/.test(s);
    return circ(0, 0, 78, dry ? '#E2B25C' : '#B9722F')
      + `<g fill="none" stroke="${dry ? '#F0CD7E' : '#F5E3A6'}" stroke-width="5" stroke-linecap="round"><path d="M-52-10Q-24-52 20-44Q56-30 50 8"/><path d="M-44 22Q-12 58 34 40"/><path d="M-30-8Q-6-30 20-14Q34 6 10 22Q-18 26-30 4"/></g>`
      + ell(26, -24, 15, 19, '#FFFDF6', 20) + circ(27, -24, 8, '#F2A93B')
      + ell(-30, 22, 17, 10, dry ? '#C98A4B' : '#C9785A', -25)
      + scatter(seed, 6, 50, (x, y, i) => ell(x, y, 5, 2.5, GREEN[i % 3], rr(seed, i) * 180))
      + (d ? scatter(seed + 5, 4, 46, (x, y) => circ(x, y, 3, '#D9432B')) + '<rect x="-52" y="-34" width="22" height="26" rx="3" fill="#24332A" transform="rotate(-18 -41 -21)"/>' : '');
  },
  soup(seed, d, s) {
    const col = /hummus/.test(s) ? '#E3CC9A' : /tzatziki/.test(s) ? '#F2F0E2' : /guacamole|pea\b|broccoli|spinach|verde/.test(s) ? '#8FAE4E'
      : /queso|cheese|corn|potato|chowder|cream|cauliflower/.test(s) ? '#EFDDA8' : /tomato|chili|minestrone|tortilla|pozole|salsa|jjigae|kimchi|taco/.test(s) ? '#B8432A'
        : /dal\b|lentil|squash|pumpkin|carrot|sweet potato/.test(s) ? '#D9952B' : /beef|gumbo|french onion|mushroom|bean/.test(s) ? '#7A4A26' : '#D2A04A';
    const thick = /hummus|dip|guacamole|queso|tzatziki/.test(s);
    return circ(0, 0, 78, col)
      + `<path d="M-38 8Q-22-34 16-30Q50-20 38 14" fill="none" stroke="rgba(255,255,255,${thick ? '.38' : '.5'})" stroke-width="${thick ? 9 : 6}" stroke-linecap="round"/>`
      + (thick ? circ(4, 6, 12, 'rgba(160,110,20,.45)') + (d ? '<path d="M52 40L84 52L60 76Z" fill="#E9C685"/><path d="M-80 30L-54 50L-78 66Z" fill="#E9C685"/>' : '')
        : scatter(seed, 5, 50, (x, y, i) => sq(x, y, 9, ['#E8C27A', '#D9772B', '#F4EBD0'][i % 3], rr(seed, i) * 90)))
      + scatter(seed + 2, d ? 8 : 5, 54, (x, y, i) => circ(x, y, 2.6, GREEN[i % 3]));
  },
  salad(seed, d) {
    return circ(0, 0, 78, '#5C9440')
      + scatter(seed, 7, 46, (x, y, i) => ell(x, y, 24, 14, ['#7DB24F', '#4F8A36', '#95C465'][i % 3], rr(seed, i + 9) * 180))
      + scatter(seed + 1, 4, 50, (x, y) => circ(x, y, 8, '#D9432B') + (d ? circ(x - 2, y - 2, 3, '#F08A6E') : ''))
      + scatter(seed + 2, 3, 48, (x, y) => circ(x, y, 8, '#D6EBB0', ' stroke="#5E9A2A" stroke-width="2"'))
      + scatter(seed + 3, 4, 44, (x, y, i) => sq(x, y, 8, '#FFFDF6', rr(seed, i) * 90))
      + (d ? scatter(seed + 4, 3, 40, (x, y) => circ(x, y, 9, 'none', ' stroke="#9A62A8" stroke-width="2.5"')) : '');
  },
  rice(seed, d, s) {
    const sauce = /green curry|basil|pesto/.test(s) ? '#8FA94B' : /curry|masala|korma|butter chicken|paneer|vindaloo|biryani|paella|jambalaya/.test(s) ? '#D17F2A'
      : /teriyaki|bulgogi|beef|pork|katsu/.test(s) ? '#6B3418' : '#8A4B25';
    const bits = [[26, -24], [40, 2], [26, 26], [16, -4], [42, -16], [32, 40], [14, 14]];
    return circ(-14, 0, 52, '#FBF5E8')
      + scatter(seed, d ? 12 : 6, 40, (x, y, i) => ell(x, y, 3, 1.4, '#E1D6C0', rr(seed, i) * 180), -22, 0)
      + `<path d="M4-52Q54-46 58 0Q56 48 6 54Q-10 28 4 0Q-12-28 4-52Z" fill="${sauce}"/>`
      + bits.slice(0, d ? 7 : 5).map(([x, y], i) => ell(x, y, 7, 4.5, ['#4E9A3A', '#D9432B', '#F2A43A', '#6FAE45'][i % 4], rr(seed, i + 3) * 180)).join('')
      + (/bibimbap|donburi|egg|katsu|fried rice/.test(s) ? ell(-6, -2, 17, 15, '#FFFDF6') + circ(-6, -2, 7.5, '#F2A93B') : '')
      + (d ? scatter(seed + 6, 6, 20, (x, y) => circ(x, y, 1.4, '#FFF6D8'), 30, 4) : '');
  },
  curry(seed, d, s) { return PLATES.rice(seed, d, /curry|masala|korma|paneer|vindaloo|butter/.test(s) ? s : `${s} curry`); },
  pizza(seed, d, s) {
    const white = /white|alfredo|bianca|garlic/.test(s);
    return circ(0, 0, 66, '#D39A4E') + circ(0, 0, 57, white ? '#F4E6C0' : '#C4432B') + circ(0, 0, 53, '#F3D27F')
      + (/margherita|veg|caprese/.test(s) ? scatter(seed, 5, 40, (x, y) => circ(x, y, 9, '#D9432B'))
        : scatter(seed, 6, 40, (x, y) => circ(x, y, 8.5, '#A8321F')))
      + scatter(seed + 2, 4, 42, (x, y, i) => ell(x, y, 8, 4, '#3E8A3A', rr(seed, i) * 180))
      + '<path d="M0-66V66M-57-33L57 33M-57 33L57-33" stroke="rgba(110,55,15,.28)" stroke-width="1.6" fill="none"/>';
  },
  burger(seed, d) {
    const fries = [[30, 26, 20], [42, 34, -30], [34, 44, 60], [50, 22, 80], [26, 38, -60], [46, 46, 10]];
    return fries.slice(0, d ? 6 : 4).map(([x, y, a]) => `<rect x="${x - 16}" y="${y - 3.5}" width="32" height="7" rx="3" fill="#F2C24B" transform="rotate(${a} ${x} ${y})"/>`).join('')
      + circ(-14, -8, 39, '#6FAE45') + circ(-14, -8, 34, '#D08A35') + ell(-23, -19, 17, 10, 'rgba(255,255,255,.22)', -30)
      + scatter(seed, 6, 22, (x, y, i) => ell(x, y, 3, 1.6, '#FFF3CF', rr(seed, i) * 180), -14, -8)
      + circ(46, -32, 12, '#FFFFFF') + circ(46, -32, 9, '#C4391F');
  },
  sandwich(seed, d, s) {
    const fill = /egg|cheese|grilled cheese|melt/.test(s) ? '#F2C24B' : /tuna|chicken|turkey/.test(s) ? '#E9D9B8' : '#D9432B';
    return '<path d="M-52-32L12-32L-52 32Z" fill="#E9C685" stroke="#B67F3C" stroke-width="4" stroke-linejoin="round"/>'
      + `<path d="M-46 36L18-28" stroke="#6FAE45" stroke-width="7" stroke-linecap="round"/><path d="M-40 40L22-22" stroke="${fill}" stroke-width="5" stroke-linecap="round"/>`
      + '<path d="M-34 46L52-40L52 46Z" fill="#E9C685" stroke="#B67F3C" stroke-width="4" stroke-linejoin="round"/>'
      + (d ? circ(-30, -14, 3, '#D9B36E') + circ(30, 30, 3, '#D9B36E') + circ(40, 12, 2.5, '#D9B36E') + ell(40, -46, 13, 6, '#7DA13C', 30) : '');
  },
  eggs(seed, d) {
    return '<path d="M-52-30Q-40-52-18-44Q6-46 6-22Q8 0-16 2Q-44 6-52-30Z" fill="#FFFDF6"/>' + circ(-22, -22, 11, '#F2A93B')
      + '<path d="M-34 6Q-12-6 6 8Q18 30-4 40Q-32 44-34 6Z" fill="#FFFDF6"/>' + circ(-14, 22, 10, '#F2A93B')
      + '<path d="M14 26q8-9 16 0t16 0t14 0" stroke="#A8432B" stroke-width="10" fill="none" stroke-linecap="round"/><path d="M14 26q8-9 16 0t16 0t14 0" stroke="#E7A07A" stroke-width="3" fill="none" stroke-linecap="round"/>'
      + '<path d="M10 46q8-9 16 0t16 0t12 0" stroke="#98391F" stroke-width="10" fill="none" stroke-linecap="round"/>'
      + '<rect x="16" y="-54" width="42" height="42" rx="9" fill="#E2B15F" stroke="#B67F3C" stroke-width="4" transform="rotate(14 37 -33)"/>'
      + (d ? sq(38, -34, 11, '#FFE38A', 30) + scatter(seed, 6, 12, (x, y) => circ(x, y, 1.5, '#4E9A3A'), -22, 0) : '');
  },
  pancakes(seed, d, s) {
    const waffle = /waffle/.test(s);
    return circ(5, 6, 47, '#C98A3D') + circ(0, 0, 47, '#E3A652') + circ(-3, -4, 44, '#EDBA6A')
      + (waffle ? '<path d="M-34-4H28M-3-36V28M-25-26L20 18M20-26L-25 18" stroke="#C98A3D" stroke-width="3" fill="none" opacity=".7"/>' : '')
      + '<path d="M-30-10Q-22-34 2-30Q30-30 28-6Q40 14 20 14Q14 30 2 16Q-22 24-30-10Z" fill="#7A3B12" opacity=".82"/>'
      + sq(-3, -8, 15, '#FFE38A', 12)
      + scatter(seed, d ? 7 : 4, 16, (x, y, i) => circ(x, y, 6, i % 2 ? '#3F4F9A' : '#C4324A'), 46, 40);
  },
  oats(seed, d) {
    return circ(0, 0, 78, '#E9D9B8')
      + scatter(seed, 5, 30, (x, y) => circ(x, y, 11, '#F7E08A') + circ(x, y, 3, '#E2C45A'), -18, -14)
      + scatter(seed + 1, d ? 9 : 6, 26, (x, y, i) => circ(x, y, 6.5, i % 3 ? '#3F4F9A' : '#C4324A'), 26, 24)
      + '<path d="M-44 30Q-10 10 20-30Q34-44 48-38" fill="none" stroke="#C98A2B" stroke-width="4" stroke-linecap="round" opacity=".7"/>'
      + (d ? scatter(seed + 2, 10, 60, (x, y, i) => ell(x, y, 3, 1.6, '#B98F54', rr(seed, i) * 180)) : '');
  },
  cake(seed, d, s) {
    const top = /chocolate|mocha|devil|brownie|oreo|coffee|tiramisu/.test(s) ? '#6B3A22' : /lemon|banana|pineapple/.test(s) ? '#F5DA6B'
      : /carrot|spice|pumpkin|caramel|pecan/.test(s) ? '#E0A552' : /cheesecake|vanilla|coconut|angel|pudding|cream/.test(s) ? '#FBF1D6' : '#F2A6BC';
    return '<path d="M-52 40L36-50Q62-12 48 40Z" fill="#F7E7C6"/>'
      + `<path d="M-40 34L34-40Q52-10 42 34Z" fill="${top}"/>`
      + '<path d="M36-50Q62-12 48 40" stroke="#E2CFA4" stroke-width="5" fill="none" stroke-linecap="round"/>'
      + circ(24, 10, 9, '#C4324A') + '<path d="M24 2q4-10 12-9" stroke="#4E9A3A" stroke-width="2.5" fill="none" stroke-linecap="round"/>'
      + (d ? scatter(seed, 8, 16, (x, y, i) => circ(x, y, 1.8, ['#F7E7C6', '#E2CFA4'][i % 2]), -44, -30) + circ(6, -8, 4, '#FFFDF6') + circ(-8, 14, 4, '#FFFDF6') : '');
  },
  cookies(seed, d, s) {
    const dark = /chocolate cookie|brownie|double chocolate|fudge|truffle|oreo/.test(s);
    const squares = /brownie|\bbars?\b|blondie|fudge|shortbread/.test(s);
    const dough = dark ? '#6B3A22' : /sugar|shortbread|snickerdoodle|lemon|blondie/.test(s) ? '#EBCB8B' : '#C98F4E';
    return [[-26, -20], [28, -12], [-4, 30]].map(([x, y], n) => (squares ? `<rect x="${x - 23}" y="${y - 23}" width="46" height="46" rx="6" fill="${dough}" transform="rotate(${n * 17 - 10} ${x} ${y})"/>` : circ(x, y, 25, dough))
      + scatter(seed + n, d ? 6 : 4, 17, (cx, cy) => circ(cx, cy, 3, dark ? '#F4E3C4' : '#4A2814'), x, y)).join('');
  },
  pie(seed, d, s) {
    const fill = /cherry|berry|raspberr|strawberr/.test(s) ? '#A8324A' : /pumpkin|sweet potato/.test(s) ? '#D97F2B' : /pecan|caramel|peanut/.test(s) ? '#8A5226'
      : /lemon|lime|banana|coconut|custard|cream/.test(s) ? '#F1E08A' : /chocolate|mud/.test(s) ? '#5A3220' : '#E0A04A';
    const lattice = /apple|cherry|berry|peach|cobbler/.test(s);
    return circ(0, 0, 64, '#D9A557') + circ(0, 0, 52, fill)
      + (lattice ? '<path d="M-30-42V42M0-52V52M30-42V42M-42-30H42M-52 0H52M-42 30H42" stroke="#E8C27A" stroke-width="8" fill="none"/>'
        : circ(0, 0, 20, '#FFFDF6') + circ(-8, -6, 9, '#FFFFFF') + circ(8, 5, 8, '#FFFFFF'))
      + '<circle r="58" fill="none" stroke="#C58F45" stroke-width="5" stroke-dasharray="7 5"/>';
  },
  dumplings(seed, d, s) {
    const fried = /samosa|empanada|egg roll|spring roll|fried|potsticker|gyoza/.test(s);
    let out = '';
    for (let k = 0; k < 6; k++) out += `<g transform="rotate(${k * 60 + 10}) translate(0 -46)"><path d="M-22 7Q0-22 22 7Q0 14-22 7Z" fill="${fried ? '#E8B766' : '#F6E9C8'}" stroke="${fried ? '#C58F45' : '#D9C08F'}" stroke-width="2"/>${d ? '<path d="M-10-3l2 6M0-7v7M10-3l-2 6" stroke="#C9A96A" stroke-width="1.6" fill="none"/>' : ''}</g>`;
    return out + circ(0, 0, 17, '#FFFFFF') + circ(0, 0, 13, '#3A2414') + (d ? scatter(seed, 5, 9, (x, y) => circ(x, y, 1.6, '#6FAE45')) : '');
  },
  fish(seed, d, s) {
    const white = /cod|tilapia|halibut|fish|mahi|trout|crab|scallop|lobster/.test(s) && !/salmon|tuna/.test(s);
    return `<g transform="rotate(-20)"><rect x="-46" y="-30" width="80" height="42" rx="19" fill="${white ? '#F1DDB4' : '#F08F6E'}"/>`
      + `<path d="M-26-26v34M-8-28v38M10-28v38" stroke="${white ? '#DDBF86' : '#F6B49A'}" stroke-width="3" fill="none"/></g>`
      + lemon(40, 30)
      + '<path d="M-56 22L-14 44M-52 34L-12 54M-44 44L-10 62" stroke="#5E9A3A" stroke-width="6" fill="none" stroke-linecap="round"/>'
      + (d ? scatter(seed, 7, 22, (x, y) => circ(x, y, 1.8, '#3E8A3A'), -8, -12) + '<path d="M40 16v28M26 30h28" stroke="#E2C23A" stroke-width="1.5" fill="none"/>' : '');
  },
  shrimp(seed, d) {
    const spots = [[-22, -22, 20], [20, -26, 110], [30, 14, 200], [-6, 28, 290], [-34, 10, 330], [0, -2, 60]];
    return circ(0, 0, 54, '#F6EBCF')
      + spots.slice(0, d ? 6 : 5).map(([x, y, a]) => `<path d="M-8 6A10 10 0 1 1 8 6" stroke="#F0876B" stroke-width="7.5" fill="none" stroke-linecap="round" transform="translate(${x} ${y}) rotate(${a})"/>`).join('')
      + scatter(seed, d ? 9 : 5, 46, (x, y, i) => circ(x, y, 2.2, GREEN[i % 3])) + lime(50, 44, 40);
  },
  chicken(seed, d) {
    return '<path d="M-40-28Q-34-58 0-56Q34-54 40-26Q44 4 10 12Q-30 16-40-28Z" fill="#D9963F"/>' + ell(-12, -36, 18, 9, 'rgba(255,255,255,.2)', -15)
      + (d ? '<path d="M-22-14l14-30M-4-8l14-34M14-6l12-28" stroke="#A8662A" stroke-width="3" fill="none" stroke-linecap="round" opacity=".7"/>' : '')
      + sides(seed, d);
  },
  steak(seed, d, s) {
    const pork = /pork|ham\b|sausage|bratwurst/.test(s);
    return `<path d="M-42-26Q-38-58 -2-56Q36-56 42-28Q46 2 12 12Q-32 18-42-26Z" fill="${pork ? '#B96A48' : '#7A3B1E'}"/>`
      + `<path d="M-24-12l16-32M-6-6l16-36M12-4l14-30" stroke="${pork ? '#8A4526' : '#4A2210'}" stroke-width="4" fill="none" stroke-linecap="round"/>`
      + sides(seed, d);
  },
  veg(seed, d) {
    const cols = ['#E08A2B', '#6FAE45', '#D9432B', '#F2C24B', '#8A4B8F', '#4F8A36'];
    return scatter(seed, d ? 16 : 11, 50, (x, y, i) => (i % 3 === 2 ? sq(x, y, 15, cols[i % 6], rr(seed, i) * 90) : circ(x, y, 9, cols[i % 6]) + circ(x, y, 4, 'rgba(255,255,255,.22)')))
      + scatter(seed + 4, 6, 50, (x, y) => circ(x, y, 2, '#3E7A2E'));
  },
};
const BOWLS = { noodles: 1, soup: 1, salad: 1, oats: 1 };
// The bowl's own colour, by cuisine.
const BOWL_COLOR = { japanese: '#27323F', korean: '#2B2B2E', thai: '#2F5D62', indian: '#8A5A2A', mexican: '#B5532F', mediterranean: '#2C6E8A' };

// A recipe from the web (web-recipes.js) has a real photo: it goes inside the same plate, a
// round crop over the painted dish. The painting stays underneath, so with no internet (or
// before the photo has come) the plate still shows the dish. Big plates get the small square
// copy first (usually already loaded by the card) and the bigger photo over it.
const okPic = (u) => (typeof u === 'string' && /^https:\/\/[a-z0-9.-]+\/[^\s"'<>()\\]+$/i.test(u) ? u : '');
let clips = 0;
const badPics = {}; // photos that didn't come this visit (not asked for again)
function photoLayer(r, size) {
  let small = okPic(r && (r.thumb || r.img));
  let alt = okPic(r && (r.thumbAlt || r.alt));
  if (badPics[small]) { small = badPics[alt] ? '' : alt; alt = ''; }
  const big = size >= 200 && !badPics[r && r.photo] ? okPic(r && r.photo) : '';
  const pics = [small, big].filter((u, n, a) => u && a.indexOf(u) === n);
  if (!pics.length) return '';
  const id = `kph${++clips}`;
  return `<clipPath id="${id}"><circle r="77"/></clipPath>`
    + pics.map((u) => `<image data-kph${u === small && alt ? ` data-alt="${esc(alt)}"` : ''} href="${esc(u)}" x="-77" y="-77" width="154" height="154" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/>`).join('')
    + '<circle r="77" fill="none" stroke="rgba(60,30,10,.18)" stroke-width="2"/>';
}
// A photo that doesn't come (no internet, an old photo without its square copy): try the
// other copy once, else take it away so the painted dish shows instead of a broken picture.
if (typeof document !== 'undefined') {
  document.addEventListener('error', (e) => {
    const t = e.target;
    if (!t || !t.hasAttribute || !t.hasAttribute('data-kph')) return;
    badPics[t.getAttribute('href')] = 1;
    const alt = t.getAttribute('data-alt');
    if (alt && navigator.onLine !== false) { t.removeAttribute('data-alt'); t.setAttribute('href', alt); } else if (t.parentNode) t.parentNode.removeChild(t);
  }, true);
}

/**
 * <svg> of the dish on its plate, seen from above. `r` is a recipe (or an index entry);
 * `size` in px. Big plates (200 px and up) get the small touches; small ones stay light,
 * because a long list draws a hundred of them. A web recipe's photo fills the plate.
 */
export function plateArt(r, size = 120, { detail = size >= 200, style = '' } = {}) {
  const photo = photoLayer(r, size);
  const kind = plateKind(r);
  const c = String((r && (r.cuisine || r.c)) || '');
  const words = ` ${c} ${(r && (r.type || r.ty)) || ''} ${(r && (r.title || r.t)) || ''} `.toLowerCase();
  const seed = hashStr(String((r && r.id) || words));
  const turn = seed % 360;
  const dish = BOWLS[kind] && !photo
    ? circ(0, 0, 93, BOWL_COLOR[c] || '#F4EDE0') + circ(0, 0, 81, 'rgba(0,0,0,.16)')
    : circ(0, 0, 96, '#F4EDE0') + circ(0, 0, 73, '#FBF8F2', ' stroke="#E3D8C4" stroke-width="2"');
  return `<svg class="k-plate" data-plate="${kind}" width="${size}" height="${size}" viewBox="-104 -104 208 208" aria-hidden="true" focusable="false" style="display:block;flex:none;${style}">`
    + `${circ(3, 5, 97, 'rgba(0,0,0,.24)')}${dish}<g transform="rotate(${turn})">${PLATES[kind](seed, detail && !photo, words)}</g>${photo}</svg>`;
}

// The table under the plate, by cuisine: [light, mid, dark]. Rich and dark enough for white words.
const TABLES = {
  mexican: ['#CF6A3E', '#B5532F', '#8E3C20'], italian: ['#4E8A5E', '#2E6B45', '#1B4A2E'], american: ['#4C6FA0', '#35557F', '#22395A'],
  chinese: ['#C24A40', '#A8322A', '#73201A'], japanese: ['#5A6C8E', '#3F4F6B', '#28344A'], thai: ['#6A9A4E', '#4F7A3A', '#345426'],
  indian: ['#CF8A2E', '#B5701A', '#7E4C10'], mediterranean: ['#3F8AA8', '#2C6E8A', '#1B4C62'], korean: ['#A8507A', '#8A3B5C', '#5E2640'],
  southern: ['#96623A', '#7A4A2A', '#52301A'], breakfast: ['#C98F2C', '#A9741A', '#7A520E'], lunch: ['#55998A', '#3E7C6E', '#28564C'],
  desserts: ['#C2668C', '#A84E73', '#76334F'], weeknight: ['#8272AE', '#6B5B95', '#473C68'], mine: ['#6A5648', '#4A3A30', '#2C221C'],
};
/** [light, mid, dark] of the table a cuisine's plates sit on. */
export const tableColors = (cuisineId) => TABLES[cuisineId] || TABLES.mexican;

/** "Week plan" and "Shopping list" buttons for a dark top bar (fillCounts fills the numbers). */
export function kitchenLinks(active = '') {
  const one = (id, href, label) => `<a href="${href}" class="x-btn sm ${active === id ? 'white' : 'glass'}">${label}<span data-kcount="${id}" style="display:none" class="x-badge"></span></a>`;
  return one('plan', '#/plan', 'Week plan') + one('shopping', '#/shopping', 'Shopping list');
}
