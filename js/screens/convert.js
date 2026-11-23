// Kitchen conversions: the sums people do with floury hands, in three big modes.
//   Cups & grams  one sentence that is also the control: "[1] [cup] of [flour] = about 120 g";
//                 each bracketed word opens a small picker (any spoon/cup/ml or weight measure).
//                 A measuring jug pours, a kitchen scale's needle swings; one line of the
//                 same amount in the other measures; the butter stick when it's butter.
//   Oven          a huge oven knob to turn: °F outside, °C inside, gas mark in the readout;
//                 sheets for roasting times, "is it done?" and the oven table.
//   Halve & double  scaling a recipe's measure.
// Everything by tapping; nothing to type.
//
// US kitchen measures: 1 tbsp = 3 tsp, 1 fl oz = 2 tbsp, 1 cup = 16 tbsp = 8 fl oz,
// 1 pint = 2 cups, 1 quart = 4 cups; 1 tsp = 4.929 ml. 1 oz = 28.35 g, 1 lb = 16 oz.
// A stick of butter = 8 tbsp = 4 oz = 113 g.
import { backHref } from '../services/nav.js';
import { topBar, esc } from './ui.js';

// ---- numbers the way a recipe writes them
const FRACTIONS = [[0, ''], [1 / 8, '⅛'], [1 / 4, '¼'], [1 / 3, '⅓'], [3 / 8, '⅜'], [1 / 2, '½'], [5 / 8, '⅝'], [2 / 3, '⅔'], [3 / 4, '¾'], [7 / 8, '⅞'], [1, '']];
/** 1.5 -> "1½", 0.333 -> "⅓"; null when it isn't close to a kitchen fraction. */
function fraction(x) {
  const whole = Math.floor(x + 1e-9);
  const rest = x - whole;
  for (let i = 0; i < FRACTIONS.length; i++) {
    if (Math.abs(rest - FRACTIONS[i][0]) < 0.012) {
      const w = whole + (FRACTIONS[i][0] === 1 ? 1 : 0);
      return `${w || ''}${FRACTIONS[i][1]}` || '0';
    }
  }
  return null;
}
/** A fraction when it is one, otherwise a short decimal. */
const amount = (x) => fraction(x) || (x >= 100 ? String(Math.round(x)) : x >= 10 ? String(Math.round(x * 10) / 10) : String(Math.round(x * 100) / 100));
const plural = (n, one, many) => (Math.abs(n - 1) < 0.012 || n < 1 ? one : many);
const metric = (ml) => (ml >= 1000 ? `${Math.round(ml / 10) / 100} ${Math.round(ml / 10) === 100 ? 'litre' : 'litres'}` : ml >= 10 ? `${Math.round(ml)} ml` : `${Math.round(ml * 10) / 10} ml`);
const grams = (g) => (g >= 1000 ? `${Math.round(g / 10) / 100} kg` : `${Math.round(g)} g`);

// ---- volume, everything in teaspoons
const VOLUME = [
  ['tsp', 'teaspoon', 'teaspoons', 1], ['tbsp', 'tablespoon', 'tablespoons', 3], ['floz', 'fl oz', 'fl oz', 6],
  ['cup', 'cup', 'cups', 48], ['pint', 'pint', 'pints', 96], ['quart', 'quart', 'quarts', 192],
];
const ML_PER_TSP = 4.92892;
const VOLUME_AMOUNTS = [0.25, 1 / 3, 0.5, 2 / 3, 0.75, 1, 1.5, 2, 3, 4];
const METRIC_VOLUMES = [5, 15, 50, 100, 125, 250, 500, 1000]; // ml, for "what is 250 ml in cups"

/** Teaspoons in the most natural measure: "6 tablespoons", "⅓ cup", "2 tablespoons + 2 teaspoons". */
function natural(tsp) {
  const cups = tsp / 48;
  if (cups >= 0.25 - 1e-9 && fraction(cups) && !/[⅛⅜⅝⅞]/.test(fraction(cups))) return `${fraction(cups)} ${plural(cups, 'cup', 'cups')}`;
  // More than a cup and not a tidy fraction of one: whole cups, then the rest ("1 cup + 2 tablespoons").
  if (cups > 1) {
    const whole = Math.floor(cups + 1e-9);
    return `${whole} ${plural(whole, 'cup', 'cups')} + ${natural(tsp - whole * 48)}`;
  }
  const tbsp = tsp / 3;
  if (tbsp >= 1 - 1e-9 && fraction(tbsp) && !/[⅛⅜⅝⅞⅓⅔¼¾]/.test(fraction(tbsp))) return `${fraction(tbsp)} ${plural(tbsp, 'tablespoon', 'tablespoons')}`;
  if (tbsp >= 1) {
    const whole = Math.floor(tbsp + 1e-9);
    const rest = tsp - whole * 3;
    return `${whole} ${plural(whole, 'tablespoon', 'tablespoons')}${rest > 0.05 ? ` + ${amount(rest)} ${plural(rest, 'teaspoon', 'teaspoons')}` : ''}`;
  }
  return `${amount(tsp)} ${plural(tsp, 'teaspoon', 'teaspoons')}`;
}

// ---- weight, everything in grams
const WEIGHT = [['oz', 'oz', 28.3495], ['lb', 'lb', 453.592], ['g', 'g', 1], ['kg', 'kg', 1000]];
const WEIGHT_AMOUNTS = { oz: [1, 2, 4, 6, 8, 12, 16], lb: [0.25, 0.5, 1, 1.5, 2, 3, 5], g: [25, 50, 100, 200, 250, 500, 750], kg: [0.5, 1, 1.5, 2, 2.5, 3, 5] };

// ---- what a US cup of each thing weighs (grams). The usual baking-chart figures: a guide,
// because a cup of flour or oats weighs more or less with how it is scooped.
//   [id, name, as said after "1 cup of", grams per cup, colour in the cup, colour of its shade]
const INGREDIENTS = [
  ['flour', 'Flour', 'flour', 120, '#FFFFFF', '#EFE6D4'],
  ['sugar', 'Sugar', 'sugar', 200, '#FFFFFF', '#E9EEF2'],
  ['brown', 'Brown sugar', 'brown sugar, packed', 213, '#C99A62', '#A9773F'],
  ['butter', 'Butter', 'butter', 227, '#FFF0A8', '#F1D667'],
  ['rice', 'Rice', 'uncooked rice', 185, '#FBF6E8', '#E8DDBF'],
  ['oats', 'Oats', 'rolled oats', 90, '#E9D6B0', '#CDB383'],
  ['cocoa', 'Cocoa', 'cocoa powder', 85, '#7A4B2E', '#553018'],
  ['milk', 'Milk', 'milk', 245, '#FFFFFF', '#EEF0EE'],
  ['water', 'Water', 'water', 237, '#CFE7F5', '#A9D2EA'],
  ['yogurt', 'Yogurt', 'yogurt', 245, '#FFFDF4', '#EFE9D6'],
  ['oil', 'Oil', 'cooking oil', 218, '#F4D25A', '#DDB22E'],
  ['honey', 'Honey', 'honey', 340, '#EDA83A', '#C97F14'],
];
const CUP_AMOUNTS = [0.25, 1 / 3, 0.5, 2 / 3, 0.75, 1, 1.5, 2];
const CUP_TOP = 2.25; // cups the drawn jug holds to its brim
const CUP_H = 300; // the jug's inside height, px

// ---- the oven: °F, °C, a fan oven (20 °C less), gas mark, and the word recipes use
const OVEN = [
  [250, 120, '½', 'Very slow'], [275, 140, '1', 'Very slow'], [300, 150, '2', 'Slow'], [325, 165, '3', 'Moderately slow'],
  [350, 180, '4', 'Moderate'], [375, 190, '5', 'Moderately hot'], [400, 200, '6', 'Hot'], [425, 220, '7', 'Hot'],
  [450, 230, '8', 'Very hot'], [475, 245, '9', 'Very hot'],
];
// The knob: 200 °F at its far left, 350 °F straight up, 500 °F at its far right.
const F_MIN = 200, F_MAX = 500, C_MIN = 100, C_MAX = 260;
const angleOf = (f) => Math.max(-135, Math.min(135, (f - 350) * 0.9));
const F_CHIPS = [300, 325, 350, 375, 400, 425, 450];
const C_CHIPS = [150, 160, 180, 190, 200, 220, 230];

// Cooked through: the US food-safety minimums (USDA), on a thermometer in the thickest part.
const DONE = [
  ['Chicken, turkey and other poultry', 'whole, pieces or ground', 165, 74, ''],
  ['Ground beef, pork, lamb or veal', 'burgers, meatballs, meatloaf', 160, 71, ''],
  ['Beef, pork, lamb or veal', 'steaks, chops and roasts', 145, 63, 'then rest 3 minutes'],
  ['Fish and shellfish', 'or until it turns opaque and flakes', 145, 63, ''],
  ['Egg dishes', 'quiche, breakfast casseroles', 160, 71, ''],
  ['Leftovers and casseroles', 'reheated all the way through', 165, 74, ''],
];

// ---- the roast helper: the USDA's roasting charts (meat straight from the fridge).
// Each: oven °F, done °F / °C, the weights it covers (lb), and either the chart's rows
// ([up to lb, minutes from, minutes to]) or minutes per pound.
const ROASTS = [
  { id: 'turkey', name: 'Turkey', what: 'Whole turkey, not stuffed', oven: 325, done: 165, doneC: 74, rest: '', min: 8, max: 24, start: 14,
    rows: [[12, 165, 180], [14, 180, 225], [18, 225, 255], [20, 255, 270], [24, 270, 300]] },
  { id: 'chicken', name: 'Chicken', what: 'Whole chicken', oven: 350, done: 165, doneC: 74, rest: '', min: 3, max: 7, start: 4,
    rows: [[4, 75, 90], [7, 120, 135]] },
  { id: 'beef', name: 'Beef rib roast', what: 'Rib roast on the bone', oven: 325, done: 145, doneC: 63, rest: 'then rest 3 minutes', min: 4, max: 6, start: 5, perLb: [23, 25] },
  { id: 'pork', name: 'Pork loin', what: 'Pork loin roast', oven: 350, done: 145, doneC: 63, rest: 'then rest 3 minutes', min: 2, max: 5, start: 3, perLb: [20, 20] },
];
/** [minutes from, minutes to] for a roast of `lb` pounds. */
function roastMinutes(r, lb) {
  if (r.perLb) return [r.perLb[0] * lb, r.perLb[1] * lb];
  const row = r.rows.filter((x) => lb <= x[0])[0] || r.rows[r.rows.length - 1];
  return [row[1], row[2]];
}
/** 165 -> "2¾ hours", 75 -> "1¼ hours", 60 -> "1 hour" (to the nearest five minutes when it isn't a quarter). */
function hoursText(mins) {
  const m = Math.round(mins / 5) * 5;
  if (m < 60) return `${m} minutes`;
  if (m % 15 === 0) return `${amount(m / 60)} ${m === 60 ? 'hour' : 'hours'}`;
  return `${Math.floor(m / 60)} hr ${m % 60} min`;
}
function roastTime(r, lb) {
  const [a, b] = roastMinutes(r, lb);
  if (Math.round(a / 5) === Math.round(b / 5)) return `about ${hoursText(a)}`;
  // "3 to 3¾ hours" when both are in hours
  const ta = hoursText(a), tb = hoursText(b);
  return / hours?$/.test(ta) && / hours?$/.test(tb) ? `${ta.replace(/ hours?$/, '')} to ${tb}` : `${ta} to ${tb}`;
}


// ---- what "1 [cup] of flour" can be measured in: spoons and cups, millilitres, or a weight
//   [id, one, many]
const MEASURES = [
  ['cup', 'cup', 'cups'], ['tbsp', 'tbsp', 'tbsp'], ['tsp', 'tsp', 'tsp'], ['floz', 'fl oz', 'fl oz'],
  ['pint', 'pint', 'pints'], ['quart', 'quart', 'quarts'], ['ml', 'ml', 'ml'],
  ['oz', 'oz', 'oz'], ['lb', 'lb', 'lb'], ['g', 'g', 'g'], ['kg', 'kg', 'kg'],
];
const SHORT = { tsp: ['tsp', 'tsp'], tbsp: ['tbsp', 'tbsp'], floz: ['fl oz', 'fl oz'], cup: ['cup', 'cups'], pint: ['pint', 'pints'], quart: ['quart', 'quarts'] };
const volumeOf = (id) => VOLUME.filter((u) => u[0] === id)[0];
const weightOf = (id) => WEIGHT.filter((u) => u[0] === id)[0];
const amountsFor = (id) => (id === 'ml' ? METRIC_VOLUMES : weightOf(id) ? WEIGHT_AMOUNTS[id] : VOLUME_AMOUNTS);
const TIDY_CUPS = [0.25, 1 / 3, 0.5, 2 / 3, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4];
/** natural(), in the short words a recipe card uses. */
const naturalShort = (tsp) => natural(tsp).replace(/tablespoons?/g, 'tbsp').replace(/teaspoons?/g, 'tsp');
/** Teaspoons as the nearest thing measuring cups and spoons can do: "about ⅔ cup", "about 3 tbsp + ¾ tsp". */
function scoopSaid(tsp) {
  const tidy = TIDY_CUPS.filter((c) => Math.abs(c - tsp / 48) / (tsp / 48) < 0.05)[0];
  if (tidy) return `about ${amount(tidy)} ${plural(tidy, 'cup', 'cups')}`;
  return `about ${naturalShort(tsp >= 12 ? Math.round(tsp) : Math.max(0.25, Math.round(tsp * 4) / 4))}`;
}

const MODES = [['cups', 'Cups & grams'], ['oven', 'Oven'], ['halve', 'Halve & double']];
const SHEETS = { roast: 'Roasting times', done: 'Is it done?', table: 'Oven table' };
const KEY = 'convert.v1'; // which mode and what was last picked, for next time
let stopDrag = null;

export function mount(el) {
  let s = { mode: 'cups', hAmt: 0.75, hUnit: 'cup', ing: 'flour', cAmt: 1, cUnit: 'cup', unit: 'F', deg: 350, meat: 'turkey', lb: 14 };
  try { s = Object.assign(s, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* the usual start */ }
  // The old "More" mode: its converters now live in the main modes.
  if (s.mode === 'more') s.mode = s.tab === 'halve' ? 'halve' : s.tab === 'oven' || s.tab === 'done' ? 'oven' : 'cups';
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* storage off */ } };
  // Where the cup and the needle were, so they move from there to the new answer.
  let fromLevel = CUP_H, fromNeedle = -135;
  let pick = null; // the open picker in Cups & grams: 'amt', 'unit' or 'ing'
  let sheet = null; // the open sheet in Oven: 'roast', 'done' or 'table'

  el.innerHTML = `
  <style>
    .cv{height:100%;box-sizing:border-box;position:relative;overflow:hidden;padding:24px 36px;display:flex;flex-direction:column;gap:16px;font-family:Inter,system-ui,sans-serif}
    .cv.light{color:#2A2622;background:linear-gradient(180deg,#FBF6EC 0%,#F4ECDD 70%,#E9DCC6 100%)}
    .cv.dark{color:#F6EEE3;background:linear-gradient(180deg,#2B3A4A 0%,#22303D 60%,#1A242E 100%)}
    .cv-counter{position:absolute;left:0;right:0;top:620px;bottom:0;background:repeating-linear-gradient(90deg,#E2D2B8 0,#E2D2B8 2px,rgba(0,0,0,0) 2px,rgba(0,0,0,0) 160px),linear-gradient(180deg,#EADBC2,#DCC8A8)}
    .cv .x-top,.cv-body{position:relative}
    .cv-modes{display:flex;gap:10px}
    .cv.light .cv-modes .x-btn{background:#FFFFFF;color:#2A2622}
    .cv.light .cv-modes .x-btn.on{background:#3F7F6E;color:#FFFFFF}
    .cv.dark .cv-modes .x-btn{background:rgba(246,238,227,.12);color:#F6EEE3}
    .cv.dark .cv-modes .x-btn.on{background:#FFB25B;color:#1A242E}
    .cv-body{flex:1;min-height:0}
    .cv-eyebrow{font:600 15px Inter,sans-serif;letter-spacing:3px;text-transform:uppercase;color:#3F7F6E}
    .cv.dark .cv-eyebrow{color:#FFB25B}

    /* ---- cups & grams: the question is the control ---- */
    .cg{height:100%;position:relative}
    .cg-ask{display:flex;align-items:center;justify-content:center;gap:12px;white-space:nowrap;font-family:Outfit,sans-serif;font-weight:500;line-height:1.1}
    .cg-w{min-height:72px;border:0;border-radius:18px;background:#FFFFFF;color:#3F7F6E;font:600 1em/1 Outfit,sans-serif;padding:0 18px;cursor:pointer;box-shadow:0 3px 0 #E4DCCB}
    .cg-w i{font-style:normal;font-size:.5em;margin-left:8px;vertical-align:middle;opacity:.7}
    .cg-w.open{background:#3F7F6E;color:#FFFFFF;box-shadow:none}
    .cg-res{color:#C2452D;font-weight:600}
    .cg-pop{position:absolute;top:88px;z-index:5;background:#FFFFFF;border-radius:28px;padding:20px;box-shadow:0 12px 28px rgba(60,45,20,.22)}
    .cg-grid{display:grid;gap:10px}
    .cg-pb{min-height:84px;min-width:100px;border:0;border-radius:18px;background:#F4ECDD;color:#2A2622;font:600 34px Outfit,sans-serif;cursor:pointer;padding:0 14px}
    .cg-pb.on{background:#2A2622;color:#FBF6EC}
    .cg-pb.unit{font-size:26px}
    .cg-pb.ing{display:flex;align-items:center;gap:12px;min-width:190px;text-align:left;font:500 22px Inter,sans-serif}
    .cg-pb .dot{width:32px;height:32px;border-radius:50%;flex:none;box-shadow:inset 0 0 0 2px rgba(0,0,0,.12)}
    .cg-pop .cv-eyebrow{margin:4px 0 10px}
    .cg-stage{position:absolute;left:50%;top:92px;width:626px;height:400px;margin-left:-313px;transform:scale(1.2);transform-origin:50% 0}
    .cg-cupwrap{position:absolute;left:0;top:22px;width:290px;height:${CUP_H + 60}px}
    .cg-jug{position:absolute;left:0;top:44px;width:226px;height:${CUP_H + 10}px;box-sizing:border-box;border:5px solid #9FB8C2;border-top:0;border-radius:0 0 26px 26px;overflow:hidden;background:rgba(200,225,235,.35)}
    .cg-fill{position:absolute;left:0;top:0;width:100%;height:100%;will-change:transform;transition:transform 1.1s cubic-bezier(.3,.7,.4,1)}
    .cg-stream{position:absolute;left:104px;top:0;width:14px;height:100%;opacity:0;animation:cg-pour 1.3s ease-in-out both}
    .cg-stream.above{left:109px;top:0;height:46px;border-radius:7px 7px 0 0}
    .cg-lip{position:absolute;left:-8px;top:38px;width:242px;height:10px;border-radius:5px;background:#9FB8C2}
    .cg-handle{position:absolute;left:222px;top:84px;width:52px;height:150px;box-sizing:border-box;border:13px solid #9FB8C2;border-left:0;border-radius:0 60px 60px 0}
    .cg-tick{position:absolute;left:5px;display:flex;align-items:center;gap:8px;font:700 17px Inter,sans-serif;color:#C2452D;line-height:1;margin-top:-9px}
    .cg-tick i{display:block;width:34px;height:3px;background:#C2452D}
    .cg-arrow{position:absolute;left:288px;top:200px}
    .cg-scale{position:absolute;left:356px;top:0;width:270px;height:400px}
    .cg-pan{position:absolute;left:25px;top:0;width:220px;height:28px;border-radius:12px;background:linear-gradient(180deg,#D9DEE2,#AEB6BC)}
    .cg-neck{position:absolute;left:125px;top:28px;width:20px;height:30px;background:#9AA3AA}
    .cg-bodyy{position:absolute;left:0;top:56px;width:270px;height:344px;border-radius:56px 56px 30px 30px;background:linear-gradient(180deg,#4F8E7C,#3F7F6E 60%,#346B5C);box-shadow:0 16px 30px rgba(40,60,50,.3)}
    .cg-dial{position:absolute;left:20px;top:22px;width:230px;height:230px;border-radius:50%;background:#FFFDF6;box-shadow:inset 0 4px 12px rgba(0,0,0,.2)}
    .cg-needle{position:absolute;left:112px;top:27px;width:6px;height:92px;border-radius:3px;background:#C2452D;transform-origin:50% 88px;will-change:transform;transition:transform 1.3s cubic-bezier(.3,1.55,.5,1)}
    .cg-hub{position:absolute;left:103px;top:103px;width:24px;height:24px;border-radius:50%;background:#2A2622}
    .cg-grams{position:absolute;left:0;right:0;top:258px;text-align:center;color:#FFFFFF;font:700 40px/1 Outfit,sans-serif}
    .cg-grams small{display:block;font:500 18px Inter,sans-serif;opacity:.9;margin-top:6px}
    .cg-same{position:absolute;left:0;right:0;top:590px;text-align:center;font:500 27px/1.2 Outfit,sans-serif;color:#2A2622;white-space:nowrap}
    .cg-note{position:absolute;left:0;right:0;top:630px;text-align:center;font-size:16px;color:#5A544C}
    .cg-butter{position:absolute;right:0;top:300px;width:200px}
    .cg-stick{position:relative;height:56px;margin-top:10px;border-radius:8px;overflow:hidden;background:#EFE6D0;box-shadow:0 6px 12px rgba(0,0,0,.12)}
    .cg-stick .fill{position:absolute;left:0;top:0;height:100%;background:linear-gradient(180deg,#FFF3B8,#F6DE78)}
    .cg-stick .marks{position:absolute;left:0;top:0;width:100%;height:100%;display:flex}
    .cg-stick .marks i{flex:1;border-right:2px solid rgba(120,90,20,.45);font:600 15px Inter,sans-serif;font-style:normal;color:rgba(90,65,10,.8);display:flex;align-items:flex-end;justify-content:center;padding-bottom:4px}
    .cg-stick .marks i:last-child{border-right:0}
    @keyframes cg-pour{0%{opacity:0}20%,70%{opacity:1}100%{opacity:0}}

    /* ---- oven ---- */
    .ov{height:100%;position:relative}
    .ov-window{position:absolute;left:14px;width:520px;bottom:-8px;height:56px;border-radius:18px;background:#1A1310;border:3px solid #3A4654;overflow:hidden}
    .ov-heat{position:absolute;left:0;top:0;width:100%;height:100%}
    .ov-heat i{position:absolute;left:0;top:0;width:100%;height:100%;animation:ov-heat 4s ease-in-out infinite;
      background:radial-gradient(ellipse at 50% 100%,rgba(255,140,50,.85) 0,rgba(255,90,30,.2) 55%,rgba(0,0,0,0) 78%)}
    .ov-heat b{position:absolute;left:30px;right:30px;bottom:12px;height:6px;border-radius:3px;background:#FF7A2E}
    .ov-plate{position:absolute;left:0;top:0;width:548px;height:548px}
    .ov-knob{position:absolute;left:154px;top:154px;width:240px;height:240px;border-radius:50%;will-change:transform;cursor:pointer;touch-action:none;
      background:radial-gradient(circle at 38% 32%,#F4F1EA 0,#C9C3B8 60%,#8F887C 100%);box-shadow:0 0 0 3px #6E675C,0 14px 26px rgba(0,0,0,.45)}
    .ov-knob.ease{transition:transform .5s cubic-bezier(.25,.8,.3,1)}
    .ov-grip{position:absolute;left:103px;top:8px;width:34px;height:224px;border-radius:17px;background:#DCD6CB;box-shadow:0 0 0 2px #9A9387}
    .ov-tip{position:absolute;left:107px;top:18px;width:0;height:0;border-left:13px solid transparent;border-right:13px solid transparent;border-bottom:30px solid #E0582A}
    .ov-hit{position:absolute;left:0;top:0;width:548px;height:548px;border-radius:50%;touch-action:none}
    .ov-right{position:absolute;left:588px;right:0;top:0}
    .ov-seg{display:inline-flex;background:rgba(10,16,22,.5);border-radius:999px;padding:4px}
    .ov-seg button{min-height:56px;min-width:72px;border:0;border-radius:999px;background:none;color:#F6EEE3;font:600 20px Inter,sans-serif;cursor:pointer}
    .ov-seg button.on{background:#F6EEE3;color:#1A242E}
    .ov-big{font:700 96px/1 Outfit,sans-serif;font-variant-numeric:tabular-nums}
    .ov-step{width:76px;min-height:76px;border:0;border-radius:50%;background:rgba(246,238,227,.14);color:#F6EEE3;font:500 44px/1 Outfit,sans-serif;cursor:pointer;flex:none}
    .ov-other{font:500 36px/1.15 Outfit,sans-serif;color:#9CC4EE;margin-top:4px}
    .ov-other small{font:500 19px Inter,sans-serif;color:#C9D3DD;margin-left:8px}
    .ov-line{font-size:22px;line-height:1.35;margin-top:4px}
    .ov-chips{display:flex;gap:8px;margin-top:14px}
    .ov-chip{flex:1;min-height:58px;border:0;border-radius:16px;background:rgba(246,238,227,.1);color:#F6EEE3;font:600 21px Inter,sans-serif;cursor:pointer}
    .ov-chip.on{background:#FFB25B;color:#1A242E;font-weight:700}
    .ov-more{display:flex;gap:10px;margin-top:40px}
    .ov-more .x-btn{flex:1;padding:0 10px}
    .ov-sheet{position:absolute;left:588px;right:0;top:0;bottom:0;z-index:3;box-sizing:border-box;padding:16px 22px 18px;border-radius:22px;background:#1A242E;box-shadow:inset 0 0 0 1px #3A4654;display:flex;flex-direction:column}
    .ov-sheet-top{display:flex;align-items:center;gap:12px;flex:none;margin-bottom:6px}
    .ov-meats{display:flex;gap:8px;margin-top:10px}
    .ov-meats .ov-chip{font-size:18px;min-height:56px;white-space:nowrap;padding:0 6px}
    .ov-meats .ov-chip.on{background:#F6EEE3}
    .ov-row{display:flex;align-items:center;gap:12px;margin-top:18px}
    .ov-row .ov-step{width:58px;min-height:58px;font-size:34px}
    .ov-lb{font:700 38px/1 Outfit,sans-serif;min-width:92px;text-align:center;white-space:nowrap}
    .ov-ans{flex:1;min-width:0;font-size:20px;line-height:1.3}
    .ov-ans b{display:block;font:500 25px/1.2 Outfit,sans-serif}
    .ov-bar{position:relative;height:16px;border-radius:8px;margin-top:22px;background:linear-gradient(90deg,#6FA8DC,#F2C462 55%,#E0582A)}
    .ov-bar i{position:absolute;top:-5px;width:5px;height:26px;border-radius:3px;background:#F6EEE3;margin-left:-2px}
    .ov-done{display:flex;align-items:center;gap:12px;margin-top:18px;font-size:19px;line-height:1.3}
    .ov-guide{font-size:15px;line-height:1.35;color:#C9D3DD;margin-top:auto}
    .ov-sheet .cv-oven{font-size:20px}
    .ov-sheet .cv-oven th{color:#C9D3DD}
    .ov-sheet .cv-oven td{border-top-color:#3A4654}
    .ov-sheet .cv-oven td:last-child,.ov-sheet .cv-oven .sub{color:#C9D3DD}
    @keyframes ov-heat{0%,100%{opacity:.6}50%{opacity:1}}

    /* ---- halve & double ---- */
    .mo-body{height:100%;display:grid;grid-template-columns:minmax(0,5fr) minmax(0,6fr);gap:20px}
    .cv-card{background:#FFFFFF;border-radius:28px;padding:24px 30px;display:flex;flex-direction:column;gap:16px;min-width:0;min-height:0;box-sizing:border-box}
    .cv-label{font-size:15px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:#5A544C}
    .cv-chips{display:flex;flex-wrap:wrap;gap:10px}
    .cv-chip{min-width:64px;min-height:56px;padding:0 18px;border:2px solid #E4DCCB;border-radius:16px;background:#fff;font-family:inherit;font-size:22px;font-weight:600;color:#2A2622;cursor:pointer}
    .cv-chip.on{background:#2A2622;border-color:#2A2622;color:#fff}
    .cv-ask{font-family:Outfit,system-ui,sans-serif;font-size:44px;font-weight:500;line-height:1.1}
    .cv-line{display:flex;align-items:baseline;gap:14px;font-size:30px;font-weight:600;line-height:1.25}
    .cv-oven{width:100%;border-collapse:collapse;font-size:23px}
    .cv-oven th{font-size:15px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:#5A544C;text-align:left;padding:0 0 8px}
    .cv-oven td{padding:7px 0;border-top:1px solid #E4DCCB;font-weight:600}
    .cv-oven td:last-child{font-weight:500;font-size:18px;color:#5A544C}
    .cv-oven .sub{font-size:16px;font-weight:500}
    @media (prefers-reduced-motion: reduce){
      .cg-fill,.cg-needle,.ov-knob.ease{transition:none}
      .cg-stream,.ov-heat i{animation:none}
    }
  </style>
  <div data-root style="height:100%"></div>`;

  const root = el.querySelector('[data-root]');
  const $ = (q) => root.querySelector(q);
  const chips = (name, list, chosen) => `<div class="cv-chips" data-pick="${name}">${list.map((v) => `<button class="cv-chip${v[0] === chosen ? ' on' : ''}" data-v="${esc(String(v[0]))}">${esc(v[1])}</button>`).join('')}</div>`;

  // =====================================================================================
  // Cups & grams: "[1] [cup] of [flour] = about 120 g", the jug pours it, the scale weighs it
  // =====================================================================================
  const near = (a, b) => Math.abs(a - b) < 1e-6;
  function cupsView() {
    const ing = INGREDIENTS.filter((i) => i[0] === s.ing)[0] || INGREDIENTS[0];
    s.ing = ing[0];
    if (!MEASURES.some((m) => m[0] === s.cUnit)) s.cUnit = 'cup';
    const unit = MEASURES.filter((m) => m[0] === s.cUnit)[0];
    const vol = volumeOf(unit[0]), wt = weightOf(unit[0]), isMl = unit[0] === 'ml';
    const list = amountsFor(unit[0]);
    if (!list.some((v) => near(v, +s.cAmt))) s.cAmt = isMl ? 250 : wt ? list[2] : 1;
    const amt = +s.cAmt;
    let tsp, g;
    if (wt) { g = amt * wt[2]; tsp = g / ing[3] * 48; } else { tsp = isMl ? amt / ML_PER_TSP : amt * vol[3]; g = tsp / 48 * ing[3]; }
    const cups = tsp / 48;
    const oz = g / 28.3495;
    const answer = wt ? scoopSaid(tsp) : `about ${grams(g)}`;

    // The one line under the pictures: the same amount in the other measures.
    let same = [];
    if (vol) {
      same = ['tbsp', 'tsp', 'floz', 'cup', 'pint', 'quart'].filter((id) => id !== vol[0]).map((id) => [tsp / volumeOf(id)[3], id])
        .filter(([n]) => n >= 0.124 && n <= 200 && (fraction(n) || n >= 1))
        .map(([n, id]) => `${fraction(n) ? '' : 'about '}${amount(n)} ${plural(n, SHORT[id][0], SHORT[id][1])}`)
        .concat([metric(tsp * ML_PER_TSP)]);
    } else if (isMl) {
      // From millilitres nothing comes out even: "about", in the measures worth saying, and the easy way to measure it.
      const about = (n, step, id) => { const r = Math.round(n / step) * step; return `about ${amount(r)} ${plural(r, SHORT[id][0], SHORT[id][1])}`; };
      const tidy = TIDY_CUPS.filter((c) => Math.abs(c - cups) / cups < 0.06)[0];
      same = [tidy ? `about ${amount(tidy)} ${plural(tidy, 'cup', 'cups')}` : '',
        tsp / 6 >= 1 ? about(tsp / 6, 0.5, 'floz') : '',
        tsp / 3 >= 1 && tsp / 3 <= 8.2 ? about(tsp / 3, 0.5, 'tbsp') : '',
        tsp <= 6.2 ? about(tsp, 0.25, 'tsp') : '',
        `measure ${naturalShort(tsp >= 12 ? Math.round(tsp) : Math.round(tsp * 4) / 4)}`].filter(Boolean);
    } else {
      if (wt[0] !== 'oz' && oz > 16 && oz <= 80) same.push(`${Math.floor(oz / 16)} lb ${amount(Math.round((oz % 16) * 2) / 2)} oz`);
      if (wt[0] !== 'lb' && oz >= 4) same.push(`${amount(Math.round((oz / 16) * 8) / 8)} lb`);
      if (wt[0] !== 'g' && wt[0] !== 'kg') same.push(grams(g));
      if (wt[0] === 'g' && g >= 500) same.push(`${Math.round(g / 10) / 100} kg`);
      if (wt[0] === 'kg') same.push(`${Math.round(g)} g`);
    }

    // The scale's dial goes as far as it needs to; so does the jug.
    const top = [300, 600, 900, 1500, 3000, 6000].filter((t) => g <= t)[0] || 6000;
    const needle = Math.min(135, -135 + (g / top) * 270);
    let cap = CUP_TOP;
    while (cups > cap && cap < 36) cap *= 2;
    const level = CUP_H - Math.min(1, cups / cap) * CUP_H;
    const k = cap / CUP_TOP;
    const marks = [[2 * k, `${amount(2 * k)} cups`], [1.5 * k, amount(1.5 * k)], [k, k === 1 ? '1 cup' : amount(k)], [0.5 * k, amount(0.5 * k)]];
    const dial = [0, 1, 2, 3, 4, 5, 6].map((n) => {
      const a = (-135 + n * 45) * Math.PI / 180;
      const x = (r) => (115 + r * Math.sin(a)).toFixed(1), y = (r) => (115 - r * Math.cos(a)).toFixed(1);
      return `<line x1="${x(100)}" y1="${y(100)}" x2="${x(84)}" y2="${y(84)}" stroke="#2A2622" stroke-width="2"/>`
        + `<text x="${x(66)}" y="${(+y(66) + 5).toFixed(1)}" font-family="Inter,sans-serif" font-size="15" font-weight="600" fill="#2A2622" text-anchor="middle">${Math.round((top / 6) * n)}</text>`;
    }).join('');
    const sticks = tsp / 24;
    const butter = ing[0] !== 'butter' ? '' : `
      <div class="cg-butter">
        <div class="cv-eyebrow">Sticks of butter</div>
        <div class="cg-stick" aria-hidden="true">
          <div class="fill" style="width:${Math.min(100, sticks * 100).toFixed(1)}%"></div>
          <div class="marks">${[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `<i>${n}</i>`).join('')}</div>
        </div>
        <div style="font-size:21px;font-weight:600;margin-top:10px">${esc(`${amount(Math.round(sticks * 8) / 8)} ${plural(sticks, 'stick', 'sticks')}`)}</div>
        <div style="font-size:16px;color:#5A544C;margin-top:4px">1 stick = 8 tbsp = 113 g</div>
      </div>`;
    const word = (which, text) => `<button class="cg-w${pick === which ? ' open' : ''}" data-w="${which}">${esc(text)}<i>▾</i></button>`;
    const sentence = `${amount(amt)} ${unit[2]} of ${ing[2]} = ${answer}`;
    const size = sentence.length <= 30 ? 48 : sentence.length <= 38 ? 42 : 36;
    const html = `
      <div class="cg">
        <div class="cg-ask" style="font-size:${size}px">
          ${word('amt', isMl ? String(amt) : amount(amt))}${word('unit', plural(amt, unit[1], unit[2]))}<span>of</span>${word('ing', ing[2])}<span>=</span><span class="cg-res">${esc(answer)}</span>
        </div>
        <div class="cg-stage" aria-hidden="true">
          <div class="cg-cupwrap">
            <div class="cg-stream above" style="background:${ing[4]}"></div>
            <div class="cg-jug">
              <div class="cg-stream" style="background:${ing[4]}"></div>
              <div class="cg-fill" data-fill style="transform:translate3d(0,${fromLevel.toFixed(1)}px,0);background:linear-gradient(180deg,${ing[4]},${ing[5]})"></div>
              ${marks.map(([c, t]) => `<div class="cg-tick" style="top:${(CUP_H - (c / cap) * CUP_H).toFixed(1)}px"><i></i>${t}</div>`).join('')}
            </div>
            <div class="cg-lip"></div><div class="cg-handle"></div>
          </div>
          <svg class="cg-arrow" width="60" height="34" viewBox="0 0 80 40"><path d="M4 20 H66 M50 6 L70 20 L50 34" fill="none" stroke="#3F7F6E" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <div class="cg-scale">
            <div class="cg-pan"></div><div class="cg-neck"></div>
            <div class="cg-bodyy">
              <div class="cg-dial">
                <svg width="230" height="230" viewBox="0 0 230 230">${dial}<text x="115" y="192" font-family="Inter,sans-serif" font-size="15" fill="#7A746C" text-anchor="middle">grams</text></svg>
                <div class="cg-needle" data-needle style="transform:rotate(${fromNeedle.toFixed(1)}deg)"></div>
                <div class="cg-hub"></div>
              </div>
              <div class="cg-grams">${esc(grams(g))}<small>${esc(`${amount(Math.round(oz * 4) / 4)} oz`)}</small></div>
            </div>
          </div>
        </div>
        ${butter}
        <div class="cg-same">${esc(same.join('  ·  '))}</div>
        ${vol || isMl ? '<div class="cg-note">US cup · a metric cup is 250 ml</div>' : ''}
        <div data-pop></div>
      </div>`;
    return { html, level, needle };
  }

  /** The small picker under a word of the sentence: big buttons, closes on a choice. */
  function popHtml(which) {
    if (which === 'amt') {
      const isMl = s.cUnit === 'ml';
      const list = amountsFor(s.cUnit);
      return `<div class="cg-grid" style="grid-template-columns:repeat(5,auto)">${list.map((v) => `<button class="cg-pb${near(v, +s.cAmt) ? ' on' : ''}" data-pk="amt" data-v="${v}">${esc(isMl ? metric(v) : amount(v))}</button>`).join('')}</div>`;
    }
    if (which === 'unit') {
      const btn = (m) => `<button class="cg-pb unit${m[0] === s.cUnit ? ' on' : ''}" data-pk="unit" data-v="${m[0]}">${esc(m[2])}</button>`;
      const vols = MEASURES.filter((m) => !weightOf(m[0]));
      return `<div class="cv-eyebrow">Spoons &amp; cups</div><div class="cg-grid" style="grid-template-columns:repeat(${vols.length},auto)">${vols.map(btn).join('')}</div>`
        + `<div class="cv-eyebrow" style="margin-top:16px">Weight</div><div class="cg-grid" style="grid-template-columns:repeat(4,auto);justify-content:start">${MEASURES.filter((m) => weightOf(m[0])).map(btn).join('')}</div>`;
    }
    return `<div class="cg-grid" style="grid-template-columns:repeat(4,auto)">${INGREDIENTS.map((i) => `<button class="cg-pb ing${i[0] === s.ing ? ' on' : ''}" data-pk="ing" data-v="${i[0]}"><span class="dot" style="background:linear-gradient(180deg,${i[4]},${i[5]})"></span>${esc(i[1])}</button>`).join('')}</div>`;
  }
  function showPick(which) {
    pick = which;
    root.querySelectorAll('[data-w]').forEach((b) => b.classList.toggle('open', b.dataset.w === pick));
    const box = $('[data-pop]');
    if (!box) return;
    if (!pick) { box.innerHTML = ''; return; }
    box.innerHTML = `<div class="cg-pop">${popHtml(pick)}</div>`;
    // Under the word that was tapped, kept on the screen (offsets, so the tablet's zoom doesn't matter).
    const pop = box.firstElementChild, w = $(`[data-w="${pick}"]`), cg = $('.cg');
    const left = w.offsetLeft + w.offsetWidth / 2 - pop.offsetWidth / 2;
    pop.style.left = `${Math.max(0, Math.min(cg.offsetWidth - pop.offsetWidth, left))}px`;
  }

  // =====================================================================================
  // Oven
  // =====================================================================================
  // The knob's temperature as °F (the dial's own unit), whichever unit it is being set in.
  const ovenF = () => (s.unit === 'C' ? s.deg * 1.8 + 32 : s.deg);
  function ovenFacts() {
    const f = ovenF();
    const c = (f - 32) / 1.8;
    // A temperature every oven dial has: the round number recipes print, with the exact one beside it.
    const row = OVEN.filter((r) => (s.unit === 'C' ? r[1] === s.deg : r[0] === s.deg))[0];
    const big = `${s.deg}°${s.unit}`;
    let other, exact = '';
    if (s.unit === 'F') { other = `${row ? row[1] : Math.round(c)}°C`; if (row && Math.round(c) !== row[1]) exact = `${Math.round(c)} exactly`; }
    else { other = `${row ? row[0] : Math.round(f)}°F`; if (row && Math.round(f) !== row[0]) exact = `${Math.round(f)} exactly`; }
    // Gas mark: the one this heat is, or the two it sits between.
    let gas;
    const nearest = OVEN.slice().sort((a, b) => Math.abs(a[0] - f) - Math.abs(b[0] - f))[0];
    if (row || Math.abs(nearest[0] - f) <= 6) gas = `Gas mark ${(row || nearest)[2]} · ${(row || nearest)[3].toLowerCase()}`;
    else if (f < OVEN[0][0]) gas = 'Below gas mark ½ · very slow';
    else if (f > OVEN[OVEN.length - 1][0]) gas = 'Above gas mark 9 · very hot';
    else {
      const below = OVEN.filter((r) => r[0] < f).pop(), above = OVEN.filter((r) => r[0] > f)[0];
      gas = `Between gas mark ${below[2]} and ${above[2]}`;
    }
    const fan = s.unit === 'F' ? `${s.deg - 25}°F` : `${s.deg - 20}°C`;
    return { f, big, other, exact, gas, fan };
  }
  function roastHtml() {
    const r = ROASTS.filter((x) => x.id === s.meat)[0] || ROASTS[0];
    const lb = Math.max(r.min, Math.min(r.max, Math.round(+s.lb) || r.start));
    s.lb = lb;
    const at = (r.done - 120) / 60 * 100; // the bar runs from 120 °F to 180 °F
    return `
      <div class="ov-meats">${ROASTS.map((x) => `<button class="ov-chip${x.id === r.id ? ' on' : ''}" data-meat="${x.id}">${esc(x.name)}</button>`).join('')}</div>
      <div class="ov-row">
        <button class="ov-step" data-lb="-1" aria-label="One pound less"${lb <= r.min ? ' disabled style="opacity:.4"' : ''}>−</button>
        <div class="ov-lb">${lb} lb</div>
        <button class="ov-step" data-lb="1" aria-label="One pound more"${lb >= r.max ? ' disabled style="opacity:.4"' : ''}>+</button>
        <div class="ov-ans">${esc(r.what)}<b>${esc(roastTime(r, lb))}</b></div>
      </div>
      <div class="ov-bar" aria-hidden="true"><i style="left:${at.toFixed(1)}%"></i></div>
      <div class="ov-done">
        <div style="flex:1;min-width:0">Done at <b>${r.done}°F · ${r.doneC}°C</b> in the thickest part${r.rest ? `, ${esc(r.rest)}` : ''}.</div>
        <button class="x-btn sm frost" data-set-oven="${r.oven}">Set knob to ${r.oven}°F</button>
      </div>
      <div class="ov-guide">USDA chart, meat from the fridge.</div>`;
  }
  const SHEET_BODY = {
    roast: roastHtml,
    table: () => `
      <table class="cv-oven">
        <tr><th>°F</th><th>°C</th><th>Fan</th><th>Gas</th><th>Recipes say</th></tr>
        ${OVEN.map(([f, c, gas, word]) => `<tr><td>${f} °F</td><td>${c} °C</td><td>${c - 20} °C</td><td>${gas}</td><td>${word}</td></tr>`).join('')}
      </table>`,
    done: () => `
      <table class="cv-oven">
        ${DONE.map(([what, which, f, c, rest]) => `<tr><td>${esc(what)}<div class="sub">${esc(which)}</div></td><td style="white-space:nowrap;padding-left:12px">${f} °F<div class="sub">${c} °C</div></td><td style="padding-left:12px">${esc(rest)}</td></tr>`).join('')}
      </table>
      <div class="ov-guide" style="margin-top:10px">US food-safety minimums, in the thickest part, away from the bone.</div>`,
  };
  function showSheet(which) {
    sheet = which;
    const box = $('[data-sheet]');
    if (!box) return;
    box.innerHTML = !sheet ? '' : `
      <div class="ov-sheet">
        <div class="ov-sheet-top"><div class="cv-eyebrow" style="flex:1">${esc(SHEETS[sheet])}</div><button class="x-btn sm frost round" data-close aria-label="Close">✕</button></div>
        <div class="x-scroll" style="flex:1;display:flex;flex-direction:column" data-sheet-body>${SHEET_BODY[sheet]()}</div>
      </div>`;
  }
  function ovenView() {
    const dialF = [];
    for (let f = F_MIN; f <= F_MAX; f += 25) {
      const major = f % 50 === 0;
      dialF.push(`<line x1="300" y1="22" x2="300" y2="${major ? 50 : 40}" transform="rotate(${angleOf(f)} 300 300)"/>`);
    }
    const at = (deg, r) => { const a = deg * Math.PI / 180; return `x="${(300 + r * Math.sin(a)).toFixed(1)}" y="${(300 - r * Math.cos(a)).toFixed(1)}"`; };
    const labelsF = [200, 250, 300, 350, 400, 450, 500].map((f) => `<text ${at(angleOf(f), 212)} dy="9">${f}${f === 350 ? '°F' : ''}</text>`).join('');
    const labelsC = [100, 120, 150, 180, 200, 230, 260].map((c) => `<text ${at(angleOf(c * 1.8 + 32), 166)} dy="7">${c}${c === 180 ? '°C' : ''}</text>`).join('');
    return `
      <div class="ov">
        <div class="ov-window" aria-hidden="true"><div class="ov-heat" data-heat><i></i><b></b></div></div>
        <div class="ov-plate">
          <svg width="548" height="548" viewBox="0 0 600 600" aria-hidden="true">
            <defs><radialGradient id="cvPlate" cx="0.4" cy="0.35" r="0.7"><stop offset="0" stop-color="#3B4D60"/><stop offset="1" stop-color="#1C2733"/></radialGradient></defs>
            <circle cx="300" cy="300" r="290" fill="url(#cvPlate)" stroke="#4A5C70" stroke-width="3"/>
            <g stroke="#F6EEE3" stroke-width="4" stroke-linecap="round">${dialF.join('')}</g>
            <g font-family="Outfit,sans-serif" font-size="27" font-weight="700" fill="#F6EEE3" text-anchor="middle">${labelsF}</g>
            <circle cx="300" cy="300" r="190" fill="none" stroke="rgba(246,238,227,.18)" stroke-width="2"/>
            <g font-family="Inter,sans-serif" font-size="19" font-weight="600" fill="#9CC4EE" text-anchor="middle">${labelsC}</g>
          </svg>
          <div class="ov-hit" data-hit></div>
          <div class="ov-knob" data-knob style="transform:rotate(${angleOf(ovenF()).toFixed(1)}deg)"><div class="ov-grip"></div><div class="ov-tip"></div></div>
        </div>
        <div class="ov-right">
          <div style="text-align:right"><div class="ov-seg" data-units><button data-unit="F">°F</button><button data-unit="C">°C</button></div></div>
          <div style="display:flex;align-items:center;gap:14px;margin-top:2px">
            <div class="ov-big" data-big style="flex:1"></div>
            <button class="ov-step" data-step="-1" aria-label="Cooler">−</button>
            <button class="ov-step" data-step="1" aria-label="Hotter">+</button>
          </div>
          <div class="ov-other" data-other></div>
          <div class="ov-line" data-gas></div>
          <div class="ov-chips" data-chips></div>
          <div class="ov-more">${Object.keys(SHEETS).map((id) => `<button class="x-btn sm frost" data-sheet-open="${id}">${SHEETS[id]}</button>`).join('')}</div>
        </div>
        <div data-sheet></div>
      </div>`;
  }
  /** The oven's numbers, the knob and the glow, without rebuilding the screen (it runs while a finger turns the knob). */
  function showOven(ease) {
    const k = $('[data-knob]');
    if (!k) return;
    const o = ovenFacts();
    k.classList.toggle('ease', !!ease);
    k.style.transform = `rotate(${angleOf(o.f).toFixed(1)}deg)`;
    $('[data-big]').textContent = o.big;
    $('[data-other]').innerHTML = `${esc(o.other)}${o.exact ? `<small>${esc(o.exact)}</small>` : ''}`;
    $('[data-gas]').textContent = `${o.gas} · fan oven ${o.fan}`;
    $('[data-heat]').style.opacity = (0.3 + 0.7 * (o.f - F_MIN) / (F_MAX - F_MIN)).toFixed(2);
    const list = s.unit === 'F' ? F_CHIPS : C_CHIPS;
    const html = list.map((v) => `<button class="ov-chip${v === s.deg ? ' on' : ''}" data-deg="${v}">${v}</button>`).join('');
    const box = $('[data-chips]');
    if (box.__html !== html) { box.__html = html; box.innerHTML = html; }
    root.querySelectorAll('[data-unit]').forEach((b) => b.classList.toggle('on', b.dataset.unit === s.unit));
  }
  const clampDeg = (v) => (s.unit === 'F' ? Math.max(F_MIN, Math.min(F_MAX, v)) : Math.max(C_MIN, Math.min(C_MAX, v)));
  function setUnit(u) {
    if (u === s.unit) return;
    const row = OVEN.filter((r) => (s.unit === 'C' ? r[1] === s.deg : r[0] === s.deg))[0];
    const f = ovenF();
    s.unit = u;
    // 350 °F becomes 180 °C, as recipes print it; anything else, the nearest five.
    s.deg = row ? (u === 'F' ? row[0] : row[1]) : clampDeg(Math.round((u === 'F' ? f : (f - 32) / 1.8) / 5) * 5);
  }

  // ---- turning the knob with a finger
  let turning = false;
  function turnTo(e) {
    const k = $('[data-hit]');
    if (!k) return;
    const b = k.getBoundingClientRect();
    const dx = e.clientX - (b.left + b.width / 2), dy = e.clientY - (b.top + b.height / 2);
    if (dx * dx + dy * dy < 400) return; // right on the middle: no direction to speak of
    let a = Math.atan2(dx, -dy) * 180 / Math.PI; // 0 = straight up, clockwise
    a = Math.max(-135, Math.min(135, a)); // the gap at the bottom: stay at the nearer end
    const f = 350 + a / 0.9;
    const v = clampDeg(Math.round((s.unit === 'F' ? f : (f - 32) / 1.8) / 5) * 5);
    if (v !== s.deg) { s.deg = v; showOven(false); }
  }
  const onMove = (e) => { if (turning) { e.preventDefault(); turnTo(e); } };
  const onUp = () => { if (turning) { turning = false; save(); } };
  root.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('[data-knob],[data-hit]')) return;
    turning = true;
    e.preventDefault();
    turnTo(e);
  });
  window.addEventListener('pointermove', onMove, { passive: false });
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  stopDrag = () => {
    window.removeEventListener('pointermove', onMove, { passive: false });
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
  };

  // =====================================================================================
  // Halve & double
  // =====================================================================================
  function halveView() {
    const unit = VOLUME.filter((u) => u[0] === s.hUnit)[0] || VOLUME[3];
    if (VOLUME_AMOUNTS.indexOf(s.hAmt) < 0) s.hAmt = 0.75;
    const tsp = s.hAmt * unit[3];
    const row = (label, t) => `<div class="cv-line"><span style="flex:none;width:170px;font-size:22px;color:#5A544C;font-weight:500">${label}</span><span>${esc(natural(t))}</span></div>`;
    return `
      <div class="mo-body">
        <div class="cv-card">
          <div class="cv-label">The recipe says</div>
          ${chips('hAmt', VOLUME_AMOUNTS.map((v) => [v, amount(v)]), s.hAmt)}
          <div class="cv-label">Of what</div>
          ${chips('hUnit', [['tsp', 'teaspoons'], ['tbsp', 'tablespoons'], ['cup', 'cups']], unit[0])}
        </div>
        <div class="cv-card">
          <div class="cv-ask">${esc(`${amount(s.hAmt)} ${plural(s.hAmt, unit[1], unit[2])}`)}</div>
          ${row('Half is', tsp / 2)}
          ${row('A third is', tsp / 3)}
          ${row('One and a half', tsp * 1.5)}
          ${row('Double is', tsp * 2)}
          ${row('Three times', tsp * 3)}
        </div>
      </div>`;
  }

  // =====================================================================================
  function draw() {
    if (!MODES.some((m) => m[0] === s.mode)) s.mode = 'cups';
    if (s.unit !== 'C') s.unit = 'F';
    s.deg = clampDeg(Math.round((+s.deg || 350) / 5) * 5);
    pick = null; sheet = null;
    const dark = s.mode === 'oven';
    const modes = `<div class="cv-modes">${MODES.map(([id, name]) => `<button class="x-btn${id === s.mode ? ' on' : ''}" data-mode="${id}">${name}</button>`).join('')}</div>`;
    let body, after = null;
    if (s.mode === 'cups') { const v = cupsView(); body = v.html; after = v; } else if (s.mode === 'oven') body = ovenView(); else body = halveView();
    root.innerHTML = `
      <div class="cv ${dark ? 'dark' : 'light'}">
        ${dark ? '' : '<div class="cv-counter" aria-hidden="true"></div>'}
        ${topBar({ title: 'Conversions', back: 'history', backLabel: '← Back', tone: dark ? 'dark' : 'light', right: modes })}
        <div class="cv-body">${body}</div>
      </div>`;
    if (s.mode === 'oven') showOven(false);
    if (after) {
      // Drawn where they were; a moment later they move to the new answer (the cup pours, the needle swings).
      fromLevel = after.level; fromNeedle = after.needle;
      const go = () => {
        const fill = $('[data-fill]'), needle = $('[data-needle]');
        if (fill) fill.style.transform = `translate3d(0,${after.level.toFixed(1)}px,0)`;
        if (needle) needle.style.transform = `rotate(${after.needle.toFixed(1)}deg)`;
      };
      setTimeout(go, 60);
    } else { fromLevel = CUP_H; fromNeedle = -135; }
  }

  root.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    // A tap anywhere outside an open picker closes it.
    if (pick && !(b && (b.dataset.pk || b.dataset.w)) && !e.target.closest('.cg-pop')) { showPick(null); return; }
    if (!b) return;
    const d = b.dataset;
    if (b.hasAttribute('data-back')) {
      // Back to wherever they came from (a recipe half-way through, usually).
      if (history.length > 1) history.back(); else location.hash = backHref();
      return;
    }
    if (d.w) { showPick(pick === d.w ? null : d.w); return; }
    if (d.sheetOpen) { showSheet(d.sheetOpen); return; }
    if (b.hasAttribute('data-close')) { showSheet(null); return; }
    if (d.mode) { if (d.mode === s.mode) return; s.mode = d.mode; }
    else if (d.pk === 'amt') s.cAmt = Number(d.v);
    else if (d.pk === 'unit') {
      // A new measure keeps the amount when it has it ("2 cups" -> "2 tbsp"), else its usual one.
      if (d.v === s.cUnit) { showPick(null); return; }
      s.cUnit = d.v;
    } else if (d.pk === 'ing') s.ing = d.v;
    else if (b.classList.contains('cv-chip')) {
      const name = b.parentElement.dataset.pick;
      s[name] = /Unit$/.test(name) ? d.v : Number(d.v);
    } else if (d.unit || d.step || d.deg || d.setOven) {
      // The oven's own buttons: only the numbers and the knob change.
      if (d.unit) setUnit(d.unit);
      else if (d.step) s.deg = clampDeg(s.deg + 5 * Number(d.step));
      else if (d.deg) s.deg = Number(d.deg);
      else { s.unit = 'F'; s.deg = Number(d.setOven); showSheet(null); }
      save(); showOven(true);
      return;
    } else if (d.meat || d.lb) {
      if (d.meat) { s.meat = d.meat; s.lb = (ROASTS.filter((x) => x.id === d.meat)[0] || ROASTS[0]).start; }
      else s.lb = (+s.lb || 0) + Number(d.lb);
      const box = $('[data-sheet-body]');
      if (box) box.innerHTML = roastHtml();
      save();
      return;
    } else return;
    save(); draw();
  });
  draw();
}

export function unmount() {
  if (stopDrag) stopDrag();
  stopDrag = null;
}

// For the tests (tools/sim/convert-test.mjs).
export const _test = { fraction, amount, natural, metric, grams };
