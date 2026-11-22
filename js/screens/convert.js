// Family · Kitchen conversions: the sums people do with floury hands. How many
// tablespoons in a third of a cup, what 200 °C is on an American oven, what 6 oz of butter
// is in grams, what half of ¾ cup comes to. Everything by tapping; nothing to type.
//
// US kitchen measures: 1 tbsp = 3 tsp, 1 fl oz = 2 tbsp, 1 cup = 16 tbsp = 8 fl oz,
// 1 pint = 2 cups, 1 quart = 4 cups; 1 tsp = 4.929 ml. 1 oz = 28.35 g, 1 lb = 16 oz.
// A stick of butter = 8 tbsp = 4 oz = 113 g.
import { backHref } from '../services/nav.js';
import { settings } from '../config.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

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

// ---- the oven: °F, °C, a fan oven (20 °C less), gas mark, and the word recipes use
const OVEN = [
  [250, 120, '½', 'Very slow'], [275, 140, '1', 'Very slow'], [300, 150, '2', 'Slow'], [325, 165, '3', 'Moderately slow'],
  [350, 180, '4', 'Moderate'], [375, 190, '5', 'Moderately hot'], [400, 200, '6', 'Hot'], [425, 220, '7', 'Hot'],
  [450, 230, '8', 'Very hot'], [475, 245, '9', 'Very hot'],
];

// Cooked through: the US food-safety minimums (USDA), on a thermometer in the thickest part.
const DONE = [
  ['Chicken, turkey and other poultry', 'whole, pieces or ground', 165, 74, ''],
  ['Ground beef, pork, lamb or veal', 'burgers, meatballs, meatloaf', 160, 71, ''],
  ['Beef, pork, lamb or veal', 'steaks, chops and roasts', 145, 63, 'then rest 3 minutes'],
  ['Fish and shellfish', 'or until it turns opaque and flakes', 145, 63, ''],
  ['Egg dishes', 'quiche, breakfast casseroles', 160, 71, ''],
  ['Leftovers and casseroles', 'reheated all the way through', 165, 74, ''],
];

const TABS = [['volume', 'Cups & spoons'], ['weight', 'Weights & butter'], ['oven', 'Oven'], ['halve', 'Halve & double'], ['done', 'Is it done?']];
const KEY = 'convert.v1'; // which tab and what was last picked, for next time

export function mount(el) {
  const a = settings.accent;
  let s = { tab: 'volume', vAmt: 1, vUnit: 'cup', wAmt: 8, wUnit: 'oz', hAmt: 0.75, hUnit: 'cup' };
  try { s = Object.assign(s, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* the usual start */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* storage off */ } };

  el.innerHTML = `
  <style>
    .cv{height:100%;box-sizing:border-box;padding:36px 40px;display:flex;flex-direction:column;gap:20px}
    .cv-top{display:flex;align-items:center;gap:16px;flex:none}
    .cv-tabs{margin-left:auto;display:inline-flex;background:#fff;border-radius:999px;padding:5px}
    .cv-tabs button{min-height:52px;padding:0 22px;border:0;border-radius:999px;background:none;font-family:inherit;font-size:18px;font-weight:600;color:var(--ink-2);cursor:pointer;white-space:nowrap}
    .cv-tabs button.on{background:var(--ink);color:#fff}
    .cv-body{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,5fr) minmax(0,6fr);gap:24px}
    .cv-card{padding:28px 32px;display:flex;flex-direction:column;gap:18px;min-width:0;min-height:0}
    .cv-label{font-size:15px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:var(--ink-2)}
    .cv-chips{display:flex;flex-wrap:wrap;gap:10px}
    .cv-chip{min-width:64px;min-height:56px;padding:0 18px;border:2px solid var(--line);border-radius:16px;background:#fff;font-family:inherit;font-size:22px;font-weight:600;color:var(--ink);cursor:pointer}
    .cv-chip.on{background:var(--ink);border-color:var(--ink);color:#fff}
    .cv-ask{font-family:Outfit,system-ui,sans-serif;font-size:44px;font-weight:500;line-height:1.1}
    .cv-line{display:flex;align-items:baseline;gap:14px;font-size:30px;font-weight:600;line-height:1.25}
    .cv-line small{font-size:19px;font-weight:500;color:var(--ink-2)}
    .cv-eq{color:${a};font-weight:700}
    .cv-note{font-size:17px;line-height:1.4;color:var(--ink-2);margin-top:auto}
    .cv-oven{width:100%;border-collapse:collapse;font-size:24px}
    .cv-oven th{font-size:15px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:var(--ink-2);text-align:left;padding:0 0 10px}
    .cv-oven td{padding:9px 0;border-top:1px solid var(--line);font-weight:600}
    .cv-oven td:last-child{font-weight:500;font-size:20px;color:var(--ink-2)}
  </style>
  <div class="cv">
    <div class="cv-top">
      <button data-back class="pill" style="background:#fff;border:0;font-family:inherit;cursor:pointer">← Back</button>
      <div class="display" style="font-size:40px;font-weight:500">Conversions</div>
      <div class="cv-tabs" data-tabs>${TABS.map(([id, name]) => `<button data-tab="${id}">${name}</button>`).join('')}</div>
    </div>
    <div class="cv-body" data-body></div>
  </div>`;

  const body = el.querySelector('[data-body]');
  const chips = (name, list, chosen, label) => `<div class="cv-chips" data-pick="${name}">${list.map((v) => `<button class="cv-chip${v[0] === chosen ? ' on' : ''}" data-v="${esc(String(v[0]))}">${esc(v[1])}</button>`).join('')}</div>${label ? '' : ''}`;
  const line = (text, small) => `<div class="cv-line"><span class="cv-eq">=</span><span>${esc(text)}</span>${small ? `<small>${esc(small)}</small>` : ''}</div>`;

  const VIEWS = {
    volume() {
      const isMl = s.vUnit === 'ml';
      const unit = VOLUME.filter((u) => u[0] === s.vUnit)[0];
      const amounts = isMl ? METRIC_VOLUMES : VOLUME_AMOUNTS;
      if (amounts.indexOf(s.vAmt) < 0) s.vAmt = isMl ? 250 : 1;
      const tsp = isMl ? s.vAmt / ML_PER_TSP : s.vAmt * unit[3];
      const asked = isMl ? metric(s.vAmt) : `${amount(s.vAmt)} ${plural(s.vAmt, unit[1], unit[2])}`;
      // From millilitres nothing comes out even: say "about", in the measures worth saying.
      const about = (n, step, u) => { const r = Math.round(n / step) * step; return line(`about ${amount(r)} ${plural(r, u[1], u[2])}`); };
      const tidyCups = [0.25, 1 / 3, 0.5, 2 / 3, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4].filter((c) => Math.abs(c - tsp / 48) / (tsp / 48) < 0.06)[0];
      const others = isMl
        ? [tidyCups ? line(`about ${amount(tidyCups)} ${plural(tidyCups, 'cup', 'cups')}`) : '',
          tsp / 6 >= 1 ? about(tsp / 6, 0.5, VOLUME[2]) : '',
          tsp / 3 >= 1 && tsp / 3 <= 8.2 ? about(tsp / 3, 0.5, VOLUME[1]) : '',
          tsp <= 6.2 ? about(tsp, 0.25, VOLUME[0]) : '']
        : VOLUME.filter((u) => u[0] !== s.vUnit).map((u) => [tsp / u[3], u])
          .filter(([n]) => n >= 0.124 && n <= 200 && (fraction(n) || n >= 1))
          .map(([n, u]) => line(`${amount(n)} ${plural(n, u[1], u[2])}`, fraction(n) ? '' : 'about'));
      // The nearest thing a set of measuring spoons and cups can do.
      const scoop = tsp >= 12 ? Math.round(tsp) : Math.round(tsp * 4) / 4;
      return `
        <div class="card cv-card">
          <div class="cv-label">How much</div>
          ${chips('vAmt', amounts.map((v) => [v, isMl ? metric(v) : amount(v)]), s.vAmt)}
          <div class="cv-label">Of what</div>
          ${chips('vUnit', VOLUME.map((u) => [u[0], u[2]]).concat([['ml', 'ml']]), s.vUnit)}
          <div class="cv-note">American kitchen measures. A “cup” here is 8 fl oz (237 ml); a metric cup is 250 ml.</div>
        </div>
        <div class="card cv-card">
          <div class="cv-ask">${esc(asked)}</div>
          ${others.join('')}
          ${isMl ? `<div class="cv-label" style="margin-top:8px">The easy way to measure it</div>${line(natural(scoop))}` : line(metric(tsp * ML_PER_TSP))}
        </div>`;
    },
    weight() {
      const unit = WEIGHT.filter((u) => u[0] === s.wUnit)[0];
      const amounts = WEIGHT_AMOUNTS[s.wUnit];
      if (amounts.indexOf(s.wAmt) < 0) s.wAmt = amounts[2];
      const g = s.wAmt * unit[2];
      const oz = g / 28.3495;
      const sticks = g / 113.4;
      const lines = [];
      if (s.wUnit !== 'oz' && oz <= 80) lines.push(line(`${amount(Math.round(oz * 4) / 4)} oz`, oz > 16 ? `${Math.floor(oz / 16)} lb ${amount(Math.round((oz % 16) * 2) / 2)} oz` : ''));
      if (s.wUnit !== 'lb' && oz >= 4) lines.push(line(`${amount(Math.round((oz / 16) * 8) / 8)} lb`));
      if (s.wUnit !== 'g' && s.wUnit !== 'kg') lines.push(line(grams(g)));
      if (s.wUnit === 'g' && g >= 500) lines.push(line(`${Math.round(g / 10) / 100} kg`));
      if (s.wUnit === 'kg') lines.push(line(`${Math.round(g)} g`));
      const butter = sticks >= 0.24 && sticks <= 8.1
        ? line(`${amount(Math.round(sticks * 4) / 4)} ${plural(sticks, 'stick', 'sticks')} of butter`, `${amount(Math.round(sticks * 8))} tbsp`) : '';
      return `
        <div class="card cv-card">
          <div class="cv-label">How much</div>
          ${chips('wAmt', amounts.map((v) => [v, amount(v)]), s.wAmt)}
          <div class="cv-label">Of what</div>
          ${chips('wUnit', WEIGHT.map((u) => [u[0], u[1]]), s.wUnit)}
          <div class="cv-note">Butter: one stick is 8 tablespoons, 4 oz, or 113 g. Two sticks make a cup.</div>
        </div>
        <div class="card cv-card">
          <div class="cv-ask">${esc(`${amount(s.wAmt)} ${unit[1]}`)}</div>
          ${lines.join('')}
          ${butter ? `<div class="cv-label" style="margin-top:8px">If it’s butter</div>${butter}` : ''}
        </div>`;
    },
    oven() {
      return `
        <div class="card cv-card" style="grid-column:1 / -1;overflow-y:auto">
          <table class="cv-oven">
            <tr><th>Fahrenheit</th><th>Celsius</th><th>Fan oven</th><th>Gas mark</th><th>Recipes call it</th></tr>
            ${OVEN.map(([f, c, gas, word]) => `<tr><td>${f} °F</td><td>${c} °C</td><td>${c - 20} °C</td><td>${gas}</td><td>${word}</td></tr>`).join('')}
          </table>
          <div class="cv-note">A fan (convection) oven cooks hotter: set it about 20 °C (25 °F) lower than the recipe says.</div>
        </div>`;
    },
    done() {
      return `
        <div class="card cv-card" style="grid-column:1 / -1;overflow-y:auto">
          <table class="cv-oven">
            <tr><th>What you’re cooking</th><th>It’s done at</th><th></th><th></th></tr>
            ${DONE.map(([what, which, f, c, rest]) => `<tr><td>${esc(what)}<div style="font-size:18px;font-weight:500;color:var(--ink-2)">${esc(which)}</div></td><td>${f} °F</td><td>${c} °C</td><td>${esc(rest)}</td></tr>`).join('')}
          </table>
          <div class="cv-note">On a food thermometer, in the thickest part and away from the bone. These are the US food-safety minimums; many cooks take steak and roasts off earlier by choice.</div>
        </div>`;
    },
    halve() {
      const unit = VOLUME.filter((u) => u[0] === s.hUnit)[0] || VOLUME[3];
      if (VOLUME_AMOUNTS.indexOf(s.hAmt) < 0) s.hAmt = 0.75;
      const tsp = s.hAmt * unit[3];
      const row = (label, t) => `<div class="cv-line"><span style="flex:none;width:170px;font-size:22px;color:var(--ink-2);font-weight:500">${label}</span><span>${esc(natural(t))}</span></div>`;
      return `
        <div class="card cv-card">
          <div class="cv-label">The recipe says</div>
          ${chips('hAmt', VOLUME_AMOUNTS.map((v) => [v, amount(v)]), s.hAmt)}
          <div class="cv-label">Of what</div>
          ${chips('hUnit', [['tsp', 'teaspoons'], ['tbsp', 'tablespoons'], ['cup', 'cups']], unit[0])}
          <div class="cv-note">For making half a recipe, or twice as much. Answers are in the measures you can actually scoop.</div>
        </div>
        <div class="card cv-card">
          <div class="cv-ask">${esc(`${amount(s.hAmt)} ${plural(s.hAmt, unit[1], unit[2])}`)}</div>
          ${row('Half is', tsp / 2)}
          ${row('A third is', tsp / 3)}
          ${row('One and a half', tsp * 1.5)}
          ${row('Double is', tsp * 2)}
          ${row('Three times', tsp * 3)}
        </div>`;
    },
  };

  function draw() {
    if (!VIEWS[s.tab]) s.tab = 'volume';
    el.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === s.tab));
    body.innerHTML = VIEWS[s.tab]();
  }
  el.querySelector('[data-tabs]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (!b || b.dataset.tab === s.tab) return;
    s.tab = b.dataset.tab; save(); draw();
  });
  body.addEventListener('click', (e) => {
    const b = e.target.closest('.cv-chip');
    if (!b) return;
    const name = b.parentElement.dataset.pick;
    s[name] = /Unit$/.test(name) ? b.dataset.v : Number(b.dataset.v);
    save(); draw();
  });
  // Back to wherever they came from (a recipe half-way through, usually).
  el.querySelector('[data-back]').addEventListener('click', () => {
    if (history.length > 1) history.back(); else location.hash = backHref();
  });
  draw();
}

export function unmount() {}

// For the tests (tools/sim/convert-test.mjs).
export const _test = { fraction, amount, natural, metric, grams };
