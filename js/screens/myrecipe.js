// Kitchen · Add or edit one of your own recipes, one question at a time.
//   #/myrecipe          new recipe: name → meal → size and times → ingredients → steps → check it over
//   #/myrecipe/<id>     edit (opens on "check it over", with Delete)
//   #/myrecipe/from/<id>  a copy of a library recipe, to change as you like (opens on "check it over")
// Each ingredient is filled in as blanks (how much / unit / what) and each step gets its own
// timer choice, so nothing has to be typed in any particular format. Saved as lines of text
// ("2 cups flour", "Bake (25 min)"), the same as recipes sent from a phone.
import { savedRecipes, saveRecipe, deleteRecipe, parseStep, parseIngredient, stepSeconds, MEAL_NAMES, UNDO_KEY } from '../services/my-recipes.js';
import { getRecipe, ingredientText, loadIndex } from '../services/recipe-data.js';
import { GROCERY_WORDS } from '../services/grocery-words.js';
import { esc } from './kitchen-ui.js';
import { topBar, phoneCode, wirePhoneCodes } from './ui.js';
import { keyFields } from './keyboard.js';

const AMOUNTS = ['¼', '⅓', '½', '1', '1½', '2', '3', '4', '5', '6'];
const UNITS = ['cup', 'tbsp', 'tsp', 'lb', 'oz', 'can', 'clove', 'pinch'];
const PLURAL = { cup: 'cups', can: 'cans', clove: 'cloves', pinch: 'pinches' };
const UNIT_OF = { cups: 'cup', cans: 'can', cloves: 'clove', pinches: 'pinch', tablespoon: 'tbsp', tablespoons: 'tbsp', teaspoon: 'tsp',
  teaspoons: 'tsp', pound: 'lb', pounds: 'lb', lbs: 'lb', ounce: 'oz', ounces: 'oz' };
const TIMERS = [0, 5, 10, 15, 20, 25, 30, 45, 60, 90, 120];
const FIRST_THINGS = ['salt', 'pepper', 'butter', 'eggs', 'flour', 'sugar'];
const ING_WORDS = ['chopped', 'diced', 'sliced', 'minced', 'melted', 'softened', 'shredded', 'grated', 'peeled', 'fresh', 'frozen',
  'salt', 'pepper', 'salt and pepper', 'olive oil', 'vegetable oil', 'flour', 'sugar', 'brown sugar', 'baking powder', 'baking soda',
  'vanilla', 'cinnamon', 'water', 'broth'];
const STEP_FIRST = ['Preheat the oven to', 'Add', 'Mix', 'Stir', 'Bake', 'Cook'];
const STEP_WORDS = ['preheat', 'bake', 'roast', 'broil', 'grill', 'simmer', 'boil', 'cook', 'fry', 'brown', 'steam', 'microwave',
  'rest', 'chill', 'cool', 'freeze', 'marinate', 'toast', 'heat', 'stir', 'whisk', 'knead', 'blend', 'mix', 'add', 'pour', 'combine',
  'season', 'serve', 'drain', 'chop', 'slice', 'spread', 'sprinkle', 'place', 'remove', 'cover', 'flip', 'until', 'golden', 'tender',
  'bubbly', 'done', 'oven', 'pan', 'skillet', 'pot', 'bowl', 'baking dish', 'baking sheet', 'medium heat', 'high heat', 'low heat',
  'the', 'with', 'and', 'into', 'over', 'together', 'then', 'each side', 'degrees'];
const isNum = (w) => /^[\d½¼¾⅓⅔/.-]+$/.test(w);
const amountValue = (a) => {
  const m = /^(\d*)\s*([½¼¾⅓⅔])?/.exec(a) || [];
  return (+m[1] || 0) + ({ '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 0.33, '⅔': 0.67 }[m[2]] || 0);
};
const timerText = (m) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} hr${m % 60 ? ` ${m % 60} min` : ''}`);
const TIMER_END = /\s*\((\d+ hr(?: \d+ min)?|\d+ min)\)$/;

let armTimer, draftTimer;
let stopCodes = null; // stops the phone code being redrawn
let stopKeys = null;

// What was being filled in, kept as you go: a restart or an update in the middle of a long
// recipe does not lose it. One draft per recipe (or 'new'), for a week.
const DRAFT_KEY = 'myrecipe.draft.v1';
const DRAFT_MS = 7 * 86400000;
function readDraft(key) {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    return d && d.key === key && Date.now() - d.at < DRAFT_MS ? d.fields : null;
  } catch (e) { return null; }
}
const clearDraft = () => { try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* storage off */ } };

export function mount(el, { args = [] } = {}) {
  const copyOf = args[0] === 'from' ? args[1] : '';
  const editId = copyOf ? '' : args[0];
  const existing = editId ? savedRecipes().find((r) => r.id === editId) : null;
  const missing = !!editId && !existing; // opened "Edit" on a recipe that has since been deleted
  const draftKey = existing ? existing.id : copyOf ? `from:${copyOf}` : 'new';
  const draft = readDraft(draftKey);
  const clean = (a) => (a || []).map((x) => String(x).trim()).filter(Boolean);
  const S = Object.assign({ title: '', meal: 'dinner', serves: 4, prep: 15, cook: 30, blurb: '', ingredients: [], steps: [] }, existing || {}, draft || {});
  S.ingredients = clean(S.ingredients);
  S.steps = clean(S.steps);
  if (!MEAL_NAMES[S.meal]) S.meal = 'dinner';
  // The blanks being filled in, and which listed one they replace (-1: a new one).
  const B = Object.assign({ amt: '', unit: '', what: '', step: '', timer: 0, at: -1 }, (draft && draft.blanks) || {});
  let stage = existing || draft || copyOf ? 'check' : 'name';
  let deleteArmed = false;
  let leaveArmed = false;
  let saving = false;
  let note = missing ? 'That recipe was deleted. You can type it in again as a new one.' : draft ? 'Your unsaved recipe is back.' : '';

  el.innerHTML = `
  <style>
    .mr{height:100%;position:relative;overflow:hidden;color:#FFF4EA;font-family:Inter,system-ui,sans-serif;padding:28px 40px 32px;display:flex;flex-direction:column;gap:16px;
      background:radial-gradient(ellipse 1000px 620px at 22% -6%,#5B3320 0%,#2C1B14 52%,#1A110D 100%)}
    .wz{flex:1 1 0;min-height:0;display:grid;gap:16px;grid-template-columns:minmax(0,1fr) 380px;grid-template-rows:minmax(0,1fr)}
    .wz.one{grid-template-columns:minmax(0,1fr)}
    .wz.one .wz-btns{margin-top:12px}
    .wz.three{grid-template-columns:410px minmax(0,1fr) minmax(0,1fr)}
    .mr-card{border-radius:28px;background:rgba(255,244,234,.09);box-shadow:inset 0 0 0 1.5px rgba(255,244,234,.1);padding:24px;display:flex;flex-direction:column;gap:12px;min-height:0}
    .wz-q{font:600 34px/1.15 Outfit,sans-serif;color:#FFF4EA}
    .mr-label{font:600 17px Inter,sans-serif;color:#FFD696}
    .mr-in{width:100%;min-height:60px;border-radius:16px;border:2px solid transparent;background:#FFF4EA;padding:0 18px;font:500 22px Inter,sans-serif;color:#2A160C;outline:none}
    .mr-in.kb-on{border-color:#FF8A3D}
    .mr-in.bad{border-color:#FF6B5E;background:#FFE4DF}
    .wz-big{min-height:120px;align-items:flex-start;padding:14px 18px;line-height:1.4}
    .wz-chips{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
    .wz-chip{min-height:56px;min-width:64px;padding:0 18px;border-radius:999px;border:0;background:rgba(255,244,234,.14);font:600 20px Inter,sans-serif;color:#FFF4EA;cursor:pointer}
    .wz-chip.on{background:#FFF4EA;color:#3A1D10}
    .wz-chip.big{min-height:96px;font-size:26px}
    .wz-chip:active,.mr-pm:active{transform:scale(.95)}
    .wz-amt{width:130px;min-height:56px;font-size:20px}
    .wz-preview{font:600 26px Inter,sans-serif;color:#FFD696;min-height:34px}
    .wz-btns{display:flex;gap:10px;margin-top:auto;flex-wrap:wrap;align-items:center}
    .wz-list{flex:1 1 0;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;display:flex;flex-direction:column;gap:8px}
    .wz-item{display:flex;align-items:center;border-radius:16px;background:rgba(255,244,234,.1);min-height:56px;font:500 19px/1.35 Inter,sans-serif;color:#FFF4EA;cursor:pointer;flex:none}
    .wz-item>span{flex:1;min-width:0;padding:10px 0 10px 16px}
    .wz-item.on{box-shadow:inset 0 0 0 2px #FF8A3D}
    .wz-x{width:56px;height:56px;flex:none;border:0;background:transparent;color:#E3CDBB;font-size:22px;cursor:pointer}
    .wz-empty{font-size:18px;color:#C9B2A1;line-height:1.4}
    .wz-head{display:flex;align-items:baseline;gap:12px}
    .wz-head .x-btn{margin-left:auto}
    .wz-steps{display:flex;gap:6px;margin-left:auto}
    .wz-steps span{padding:8px 14px;border-radius:999px;font:600 15px Inter,sans-serif;color:#C9B2A1}
    .wz-steps span.on{background:rgba(255,244,234,.16);color:#FFF4EA}
    .mr-step{display:flex;align-items:center;gap:10px}
    .mr-pm{width:64px;height:64px;flex:none;border-radius:18px;border:0;background:rgba(255,244,234,.16);font:600 30px Outfit,sans-serif;color:#FFF4EA;cursor:pointer;padding:0}
    .mr-num{width:110px;flex:none;justify-content:center;padding:0 6px}
    .mr-msg{font-size:18px;font-weight:600;color:#FFE6D6;line-height:1.35}
    .mr-msg:empty{display:none}
    .mr-phone .x-code{background:rgba(255,244,234,.09);box-shadow:inset 0 0 0 1.5px rgba(255,244,234,.1);border-radius:28px;padding:12px 22px 12px 14px}
    .mr.kb-typing .wz-hide,.mr.kb-typing .x-top{display:none}
  </style>
  <div class="mr"><div data-top></div><div data-stage class="wz"></div></div>`;
  const root = el.querySelector('.mr');
  const box = el.querySelector('[data-stage]');
  const $ = (s) => el.querySelector(s);

  // Words above the keys: things to cook with in "What is it?", cooking words in a step.
  const ownItems = [];
  savedRecipes().forEach((x) => (x.ingredients || []).forEach((l) => {
    const it = parseIngredient(l).item.toLowerCase();
    if (it && ownItems.indexOf(it) < 0) ownItems.push(it);
  }));
  const groceries = GROCERY_WORDS.map((w) => w.toLowerCase());
  function suggest(f, text) {
    const kind = f.dataset.f;
    if (kind !== 'what' && kind !== 'step') return [];
    const words = text.split(' ');
    const part = words.pop().toLowerCase();
    const before = words.filter(Boolean);
    const first = !before.length;
    if (!part) {
      if (kind === 'what') return first ? ownItems.concat(FIRST_THINGS).filter((w, i, a) => a.indexOf(w) === i).slice(0, 6) : [];
      return first ? STEP_FIRST : [];
    }
    if (isNum(part)) return [];
    const pools = kind === 'what' ? [ownItems, ING_WORDS, groceries]
      : [S.ingredients.map((l) => parseIngredient(l).item.toLowerCase()), STEP_WORDS, groceries];
    const out = [];
    const add = (w) => { const t = first && kind === 'step' ? w.charAt(0).toUpperCase() + w.slice(1) : w; if (w !== part && out.indexOf(t) < 0) out.push(t); };
    // Words that start with what's typed, then ones with a later word that does ("bre": chicken breasts).
    pools.forEach((p) => p.forEach((w) => { if (out.length < 6 && w.indexOf(part) === 0) add(w); }));
    pools.forEach((p) => p.forEach((w) => { if (out.length < 6 && w.indexOf(` ${part}`) > 0) add(w); }));
    return out;
  }
  // Typing with the screen's own keys (the boxes are plain boxes: Android's keyboard never comes up).
  if (stopKeys) stopKeys();
  stopKeys = keyFields(el, { room: root, look: { panel: '#2C1B14', go: '#FF8A3D', goInk: '#2A160C' }, suggest });

  const snapshot = () => JSON.stringify([S, B]);
  const start = snapshot();
  let restored = !!draft; // a draft brought back from last time counts as not saved yet
  const dirty = () => !saving && (restored || snapshot() !== start);
  function keepDraft() {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => {
      if (saving || !el.isConnected) return;
      if (snapshot() === start && !restored) return;
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ key: draftKey, at: Date.now(), fields: Object.assign({}, S, { blanks: B }) })); } catch (e) { /* storage full */ }
    }, 600);
  }
  const msg = (t, err) => { const m = $('[data-msg]'); if (!m) return; m.textContent = t; m.style.color = err ? '#FFB3A8' : '#FFE6D6'; };
  const msgBox = () => `<div data-msg class="mr-msg">${esc(note)}</div>`;

  // ---- the blanks -------------------------------------------------------------------
  const ingredientLine = () => {
    const unit = B.unit && amountValue(B.amt) > 1 && PLURAL[B.unit] ? PLURAL[B.unit] : B.unit;
    return [B.amt.trim(), unit, B.what.trim()].filter(Boolean).join(' ');
  };
  // A listed one back into the blanks: "2 cups flour" -> 2 / cup / flour.
  function loadIngredient(line) {
    const w = line.split(' ');
    B.amt = isNum(w[0]) ? w.shift() : '';
    const u = B.amt && w[0] ? (UNIT_OF[w[0].toLowerCase()] || w[0].toLowerCase()) : '';
    B.unit = UNITS.indexOf(u) >= 0 ? (w.shift(), u) : '';
    B.what = w.join(' ');
  }
  const stepLine = () => {
    const t = B.step.trim().replace(/\s+/g, ' ');
    return B.timer && !stepSeconds(t) ? `${t} (${timerText(B.timer)})` : t;
  };
  function loadStep(line) {
    const m = TIMER_END.exec(line);
    B.step = m ? line.slice(0, m.index) : line;
    B.timer = m ? Math.round(stepSeconds(m[1]) / 60) : 0;
  }
  const clearBlanks = () => Object.assign(B, { amt: '', unit: '', what: '', step: '', timer: 0, at: -1 });
  // Put the blanks on the list (or back where they came from). False when there's nothing to add.
  function addBlanks(list, line) {
    if (!line) return false;
    if (B.at >= 0 && B.at < list.length) list[B.at] = line; else list.push(line);
    clearBlanks();
    keepDraft();
    return true;
  }

  // ---- the pages ----------------------------------------------------------------------
  const ORDER = ['name', 'meal', 'size', 'ingredients', 'steps', 'check'];
  const LABEL = { name: 'Name', meal: 'Meal', size: 'Size', ingredients: 'Ingredients', steps: 'Steps', check: 'Check' };
  let reviewed = stage === 'check'; // after the first time through, "Next" goes back to the check page
  const next = (from) => (reviewed ? 'check' : ORDER[ORDER.indexOf(from) + 1]);
  const prev = (from) => ORDER[Math.max(0, ORDER.indexOf(from) - 1)];
  const itemList = (list, kind, numbered) => (list.length ? list.map((x, i) => `
      <div class="wz-item${B.at === i && stage === kind ? ' on' : ''}" data-edit="${kind}" data-i="${i}"><span>${numbered ? `${i + 1}. ` : ''}${esc(x)}</span>
        <button class="wz-x" data-del="${kind}" data-i="${i}" aria-label="Remove">✕</button></div>`).join('')
    : `<div class="wz-empty">${kind === 'ingredients' ? 'Nothing yet. Each one you add shows up here.' : 'No steps yet. Each one you add shows up here.'}</div>`);
  const navBtns = (s, nextWord) => `<div class="wz-btns wz-hide">
      ${s !== 'name' && !reviewed ? '<button data-prev class="x-btn frost">← Back a page</button>' : ''}
      ${nextWord ? `<button data-next class="x-btn accent" style="margin-left:auto">${esc(nextWord)}</button>` : ''}</div>`;

  function render() {
    const title = existing ? `Edit: ${existing.title}` : copyOf ? 'Make your own version' : 'Add a recipe';
    const dots = reviewed ? '' : `<div class="wz-steps">${ORDER.map((s) => `<span class="${s === stage ? 'on' : ''}">${LABEL[s]}</span>`).join('')}</div>`;
    $('[data-top]').innerHTML = topBar({ title, back: 'history', backLabel: '← Back', tone: 'dark', right: dots });
    leaveArmed = false;
    deleteArmed = false;
    box.className = `wz${stage === 'check' ? ' three' : stage === 'ingredients' || stage === 'steps' ? '' : ' one'}`;
    if (stage === 'name') {
      box.innerHTML = `<div class="mr-card" style="justify-content:center;padding:40px 80px">
          <div class="wz-q">What is the recipe called?</div>
          <div data-f="title" class="mr-in" data-kbf="text" data-max="60" data-gokey="Next" data-ph="Grandma’s pot roast">${esc(S.title)}</div>
          ${msgBox()}
          ${navBtns('name', 'Next →')}
          ${existing || copyOf ? '' : `<div class="mr-phone wz-hide" style="margin-top:24px">${phoneCode({ tab: 'recipe', size: 76, title: 'Or send it from your phone', sub: ' ' })}</div>`}
        </div>`;
    } else if (stage === 'meal') {
      box.innerHTML = `<div class="mr-card" style="justify-content:center;padding:40px 80px">
          <div class="wz-q">Which meal is it?</div>
          <div class="wz-chips" style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px">
            ${Object.keys(MEAL_NAMES).map((m) => `<button class="wz-chip big${m === S.meal ? ' on' : ''}" data-meal="${m}">${MEAL_NAMES[m]}</button>`).join('')}</div>
          ${msgBox()}
          ${navBtns('meal', reviewed ? 'Done' : '')}
        </div>`;
    } else if (stage === 'size') {
      box.innerHTML = `<div class="mr-card" style="justify-content:center;padding:40px 80px">
          <div class="wz-q">How many does it feed, and how long does it take?</div>
          <div style="display:flex;flex-direction:column;gap:12px;max-width:560px">
            ${[['serves', 'Feeds', ''], ['prep', 'Getting it ready', 'min'], ['cook', 'Cooking', 'min']].map(([f, label, unit]) => `
              <div class="mr-step">
                <div class="mr-label" style="flex:1;font-size:21px;color:#FFF4EA">${label}</div>
                <button class="mr-pm" data-pm="${f}" data-d="-1" aria-label="Less">−</button>
                <div data-f="${f}" class="mr-in mr-num" data-kbf="number" data-max="4">${S[f]}</div>
                <span style="width:40px;font-size:18px;color:#E3CDBB">${unit}</span>
                <button class="mr-pm" data-pm="${f}" data-d="1" aria-label="More">+</button>
              </div>`).join('')}
          </div>
          <div style="font-size:17px;color:#C9B2A1">Not sure? Leave it as it is: you can change it later.</div>
          ${msgBox()}
          ${navBtns('size', reviewed ? 'Done' : 'Next →')}
        </div>`;
    } else if (stage === 'ingredients') {
      const n = B.at >= 0 ? B.at + 1 : S.ingredients.length + 1;
      box.innerHTML = `<div class="mr-card">
          <div class="wz-q">Ingredient ${n}${B.at >= 0 ? ' (changing it)' : ''}</div>
          <div class="wz-hide"><div class="mr-label" style="margin-bottom:6px">How much?</div>
            <div class="wz-chips">${AMOUNTS.map((a) => `<button class="wz-chip${B.amt === a ? ' on' : ''}" data-amt="${a}">${a}</button>`).join('')}
              <div data-f="amt" class="mr-in wz-amt" data-kbf="text" data-max="8" data-caps="none" data-ph="other">${AMOUNTS.indexOf(B.amt) < 0 ? esc(B.amt) : ''}</div></div></div>
          <div class="wz-hide"><div class="mr-label" style="margin-bottom:6px">Measured in? <span style="color:#C9B2A1;font-weight:500">(skip it for “2 eggs”)</span></div>
            <div class="wz-chips">${UNITS.map((u) => `<button class="wz-chip${B.unit === u ? ' on' : ''}" data-unit="${u}">${u}</button>`).join('')}</div></div>
          <div><div class="mr-label" style="margin-bottom:6px">What is it?</div>
            <div data-f="what" class="mr-in" data-kbf="text" data-max="60" data-caps="none" data-gokey="Add it" data-ph="flour, an onion, chopped…">${esc(B.what)}</div></div>
          <div data-preview class="wz-preview">${esc(ingredientLine())}</div>
          ${msgBox()}
          <div class="wz-btns wz-hide">
            ${S.ingredients.length || reviewed ? '' : '<button data-prev class="x-btn frost">← Back a page</button>'}
            <button data-add="ingredients" class="x-btn accent">${B.at >= 0 ? 'Save the change' : '+ Add it'}</button>
            <button data-next class="x-btn white" style="margin-left:auto">${reviewed ? 'Done' : 'That’s all → Steps'}</button>
          </div>
        </div>
        <div class="mr-card wz-hide"><div class="mr-label">Ingredients so far · tap one to change it</div><div class="wz-list">${itemList(S.ingredients, 'ingredients', false)}</div></div>`;
    } else if (stage === 'steps') {
      const n = B.at >= 0 ? B.at + 1 : S.steps.length + 1;
      box.innerHTML = `<div class="mr-card">
          <div class="wz-q">Step ${n}${B.at >= 0 ? ' (changing it)' : ''}: what do you do?</div>
          <div data-f="step" class="mr-in wz-big" data-kbf="para" data-max="240" data-ph="Mix the flour and the eggs in a big bowl.">${esc(B.step)}</div>
          <div class="wz-hide" data-timer>${timerRow()}</div>
          ${msgBox()}
          <div class="wz-btns wz-hide">
            ${S.steps.length || reviewed ? '' : '<button data-prev class="x-btn frost">← Back a page</button>'}
            <button data-add="steps" class="x-btn accent">${B.at >= 0 ? 'Save the change' : '+ Add this step'}</button>
            <button data-next class="x-btn white" style="margin-left:auto">${reviewed ? 'Done' : 'That’s all → Check it'}</button>
          </div>
        </div>
        <div class="mr-card wz-hide"><div class="mr-label">Steps so far · tap one to change it</div><div class="wz-list">${itemList(S.steps, 'steps', true)}</div></div>`;
    } else {
      const timed = S.steps.filter((x) => parseStep(x).timer).length;
      box.innerHTML = `<div class="mr-card">
          <div class="wz-head"><div class="mr-label">Name</div><button data-go="name" class="x-btn sm frost">Change</button></div>
          <div style="font:600 28px/1.2 Outfit,sans-serif">${esc(S.title) || '<span style="color:#FFB3A8">No name yet</span>'}</div>
          <div class="wz-head"><div style="font-size:19px">${MEAL_NAMES[S.meal]}</div><button data-go="meal" class="x-btn sm frost">Change</button></div>
          <div class="wz-head"><div style="font-size:19px">Feeds ${S.serves} · ${S.prep} min to get ready · ${S.cook} min cooking</div><button data-go="size" class="x-btn sm frost">Change</button></div>
          <div><div class="mr-label" style="margin-bottom:6px">A few words about it (optional)</div>
            <div data-f="blurb" class="mr-in" data-kbf="text" data-max="90" data-ph="A favorite for a slow Sunday">${esc(S.blurb || '')}</div></div>
          ${msgBox()}
          <div class="wz-btns wz-hide">
            <button data-save class="x-btn accent" style="flex:1">Save recipe</button>
            ${existing ? '<button data-delete class="x-btn frost">Delete</button>' : ''}
          </div>
        </div>
        <div class="mr-card wz-hide">
          <div class="wz-head"><div class="mr-label">${S.ingredients.length} ingredient${S.ingredients.length === 1 ? '' : 's'}</div><button data-go="ingredients" class="x-btn sm frost">Change</button></div>
          <div class="wz-list">${S.ingredients.map((x) => `<div style="font-size:19px;line-height:1.35">${esc(x)}</div>`).join('') || '<div class="wz-empty">None yet.</div>'}</div>
        </div>
        <div class="mr-card wz-hide">
          <div class="wz-head"><div class="mr-label">${S.steps.length} step${S.steps.length === 1 ? '' : 's'}${timed ? ` · ${timed} with a timer` : ''}</div><button data-go="steps" class="x-btn sm frost">Change</button></div>
          <div class="wz-list">${S.steps.map((x, i) => `<div style="font-size:19px;line-height:1.35">${i + 1}. ${esc(x)}</div>`).join('') || '<div class="wz-empty">None yet.</div>'}</div>
        </div>`;
    }
    note = '';
    if (stopKeys) stopKeys.rewire();
    if (stopCodes) stopCodes();
    stopCodes = wirePhoneCodes(el);
  }
  // The timer question for a step (or the time the words already give).
  function timerRow() {
    const said = stepSeconds(B.step);
    if (said) return `<div class="mr-label">Timer: ${esc(timerText(Math.round(said / 60)))}, from what you wrote</div>`;
    return `<div class="mr-label" style="margin-bottom:6px">Does this step need a timer?</div>
      <div class="wz-chips">${TIMERS.map((m) => `<button class="wz-chip${B.timer === m ? ' on' : ''}" data-timer-m="${m}">${m ? timerText(m) : 'No timer'}</button>`).join('')}</div>`;
  }
  const go = (s) => {
    if (s === 'check') reviewed = true;
    stage = s;
    render();
  };

  // Numbers: −/+ (the box can still be typed in). Minutes go up in fives, then quarter hours past two hours.
  const LIMITS = { serves: [1, 24], prep: [0, 1440], cook: [0, 1440] };
  const clampNum = (f, v) => Math.max(LIMITS[f][0], Math.min(LIMITS[f][1], Math.round(+v || 0)));
  const bump = (f, d) => {
    const v = clampNum(f, S[f]);
    const step = f === 'serves' ? 1 : (d > 0 ? v >= 120 : v > 120) ? 15 : 5;
    S[f] = clampNum(f, d > 0 ? Math.floor(v / step) * step + step : Math.ceil(v / step) * step - step);
    $(`[data-f="${f}"]`).value = S[f];
    keepDraft();
  };

  // Typing: keep what's typed, and show the ingredient as it will read.
  el.addEventListener('input', (e) => {
    const f = e.target.dataset && e.target.dataset.f;
    if (!f) return;
    if (e.target.classList.contains('bad')) { e.target.classList.remove('bad'); msg(''); }
    const v = e.target.value;
    if (f === 'title' || f === 'blurb') S[f] = v;
    else if (LIMITS[f]) S[f] = v === '' ? S[f] : clampNum(f, v);
    else if (f === 'amt') { B.amt = v.trim(); el.querySelectorAll('[data-amt]').forEach((x) => x.classList.remove('on')); } else if (f === 'what') B.what = v;
    else if (f === 'step') {
      const had = !!stepSeconds(B.step);
      B.step = v;
      if (had !== !!stepSeconds(v)) $('[data-timer]').innerHTML = timerRow();
    }
    if (f === 'title') { const sb = $('[data-save]'); if (sb) { delete sb.dataset.sure; sb.textContent = 'Save recipe'; } }
    const pv = $('[data-preview]');
    if (pv) pv.textContent = ingredientLine();
    keepDraft();
  });
  el.addEventListener('change', (e) => {
    const f = e.target.dataset && e.target.dataset.f;
    if (LIMITS[f]) { S[f] = clampNum(f, e.target.value); e.target.value = S[f]; }
  });
  // The big key: Next on the name, "Add it" on an ingredient.
  el.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const f = e.target.dataset && e.target.dataset.f;
    if (f === 'title') setTimeout(() => tryNext(), 0);
    if (f === 'what') setTimeout(() => tryAdd('ingredients'), 0);
  });

  function tryAdd(kind) {
    const list = S[kind];
    const line = kind === 'ingredients' ? (B.what.trim() ? ingredientLine() : '') : stepLine();
    if (!line) {
      const f = $(`[data-f="${kind === 'ingredients' ? 'what' : 'step'}"]`);
      f.classList.add('bad');
      msg(kind === 'ingredients' ? 'Fill in “What is it?” first' : 'Say what to do in this step first', true);
      return false;
    }
    addBlanks(list, line);
    render();
    return true;
  }
  function tryNext() {
    if (stage === 'name' && !S.title.trim()) {
      $('[data-f="title"]').classList.add('bad');
      msg('Give it a name first', true);
      return;
    }
    // Something filled in but not added yet is added, not lost.
    if (stage === 'ingredients' && B.what.trim()) addBlanks(S.ingredients, ingredientLine());
    if (stage === 'steps' && B.step.trim()) addBlanks(S.steps, stepLine());
    if (stage === 'ingredients' && !S.ingredients.length) { $('[data-f="what"]').classList.add('bad'); msg('Add at least one ingredient', true); return; }
    if (stage === 'steps' && !S.steps.length) { $('[data-f="step"]').classList.add('bad'); msg('Add at least one step', true); return; }
    if (stage === 'ingredients' || stage === 'steps') clearBlanks();
    go(next(stage));
  }

  // "Make my own version" of a library recipe: its words filled in, ready to change.
  if (copyOf && !draft) {
    Promise.all([getRecipe(copyOf), loadIndex()]).then(([src, ix]) => {
      if (!el.isConnected || !src) return;
      const sec = (ix.cuisines.find((c) => c.id === src.cuisine) || {}).meal;
      Object.assign(S, {
        title: `${src.title} (my way)`.slice(0, 60),
        serves: src.serves || 4, prep: src.prep || 0, cook: src.cook || 0,
        blurb: (src.blurb || '').slice(0, 90),
        ingredients: (src.ingredients || []).map((i) => ingredientText(i)),
        steps: (src.steps || []).map((s) => s.text),
        meal: MEAL_NAMES[sec] ? sec : 'dinner',
      });
      restored = true;
      note = 'A copy to change. The original stays as it is.';
      render();
    }).catch(() => { if (el.isConnected) msg('Couldn’t open that recipe to copy. Check the Wi-Fi.', true); });
  }

  // Leaving with unsaved work asks for a second tap first.
  el.addEventListener('click', (e) => {
    const out = e.target.closest('.x-top a[href], [data-back]');
    if (!out) return;
    if (dirty() && !leaveArmed) {
      e.preventDefault();
      leaveArmed = true;
      msg('Not saved. Tap again to leave without saving.', true);
      if (out.matches('[data-back]')) { out.textContent = 'Leave?'; out.style.color = '#FFB3A8'; }
      clearTimeout(armTimer);
      armTimer = setTimeout(() => {
        if (!el.isConnected || !leaveArmed) return;
        leaveArmed = false;
        const b = $('[data-back]');
        if (b) { b.textContent = '← Back'; b.style.color = ''; }
        msg('');
      }, 5000);
      return;
    }
    if (leaveArmed) clearDraft(); // left on purpose without saving
    if (out.matches('[data-back]')) {
      e.preventDefault();
      if (history.length > 1) history.back(); else location.hash = '#/recipes/mine';
    }
  }, true);

  el.addEventListener('click', (e) => {
    const t = e.target.closest('button, [data-edit]');
    if (!t || !box.contains(t)) return;
    const d = t.dataset;
    if (d.pm) bump(d.pm, +d.d);
    else if (d.meal) { S.meal = d.meal; keepDraft(); go(next('meal')); } else if (d.amt) {
      B.amt = B.amt === d.amt ? '' : d.amt;
      render();
    } else if (d.unit) {
      B.unit = B.unit === d.unit ? '' : d.unit;
      render();
    } else if (d.timerM != null) {
      B.timer = +d.timerM;
      el.querySelectorAll('[data-timer-m]').forEach((x) => x.classList.toggle('on', x === t));
      keepDraft();
    } else if (d.add) tryAdd(d.add);
    else if (t.matches('[data-next]')) tryNext();
    else if (t.matches('[data-prev]')) go(prev(stage));
    else if (d.go) go(d.go);
    else if (d.del) {
      e.stopPropagation();
      const i = +d.i;
      S[d.del].splice(i, 1);
      if (B.at === i) clearBlanks(); else if (B.at > i) B.at -= 1;
      keepDraft();
      render();
    } else if (d.edit) {
      // Back into the blanks to change, staying in its place on the list.
      if (B.at < 0 && (d.edit === 'ingredients' ? B.what.trim() : B.step.trim())) { msg('Add the one you are filling in first (or clear it)', true); return; }
      clearBlanks();
      if (d.edit === 'ingredients') loadIngredient(S.ingredients[+d.i]); else loadStep(S.steps[+d.i]);
      B.at = +d.i;
      render();
    } else if (t.matches('[data-save]')) save(t);
    else if (t.matches('[data-delete]')) remove(t);
  });

  function save(b) {
    if (saving) return; // a double tap mustn't save it twice
    const need = !S.title.trim() ? ['name', 'Give it a name'] : !S.ingredients.length ? ['ingredients', 'Add at least one ingredient']
      : !S.steps.length ? ['steps', 'Add at least one step'] : null;
    if (need) { note = need[1]; go(need[0]); msg(need[1], true); return; }
    // Two recipes with the same name are hard to tell apart: check once, then save if they insist.
    const name = S.title.trim();
    const twin = savedRecipes().find((x) => x.title.trim().toLowerCase() === name.toLowerCase() && (!existing || x.id !== existing.id));
    if (twin && !b.dataset.sure) {
      b.dataset.sure = '1';
      b.textContent = 'Save anyway';
      msg(`You already have “${twin.title}”. Tap Change by the name to rename it.`, true);
      return;
    }
    saving = true;
    try {
      const saved = saveRecipe({
        id: existing ? existing.id : '',
        title: name,
        meal: S.meal,
        serves: clampNum('serves', S.serves || 4),
        prep: clampNum('prep', S.prep),
        cook: clampNum('cook', S.cook),
        blurb: String(S.blurb || '').trim(),
        ingredients: S.ingredients.slice(),
        steps: S.steps.slice(),
      });
      clearTimeout(draftTimer);
      clearDraft();
      location.replace(`#/dish/${encodeURIComponent(saved.id)}`);
    } catch (err) { saving = false; msg(err.message, true); }
  }
  function remove(b) {
    if (!deleteArmed) {
      deleteArmed = true; b.textContent = 'Tap again to delete'; b.style.color = '#FFB3A8';
      clearTimeout(armTimer);
      armTimer = setTimeout(() => { if (b.isConnected) { deleteArmed = false; b.textContent = 'Delete'; b.style.color = ''; } }, 4000);
      return;
    }
    saving = true;
    // Kept for a few minutes so the My recipes list can offer "Undo".
    try { sessionStorage.setItem(UNDO_KEY, JSON.stringify({ at: Date.now(), recipe: existing })); } catch (e) { /* storage off */ }
    clearTimeout(draftTimer);
    clearDraft();
    deleteRecipe(existing.id);
    location.replace('#/recipes/mine');
  }

  render();
}

export function unmount() {
  clearTimeout(armTimer);
  clearTimeout(draftTimer);
  if (stopCodes) { stopCodes(); stopCodes = null; }
  if (stopKeys) { stopKeys(); stopKeys = null; }
}
