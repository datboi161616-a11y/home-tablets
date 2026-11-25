// Kitchen · Plan on a budget: meals for the chosen days that fit an amount of money.
//   #/budget        from Recipes (back: Recipes)
//   #/budget/plan   from the Week plan (back: Week plan)
// One page to set it up (on the brown kitchen table, like Recipes), then the suggested week
// (teal, like the Week plan): a price on every meal, tap one to see its recipe, swap one (a
// sheet, cheapest first), keep one (it stays when the rest is shuffled), and "Send to my week
// plan". Over budget: a calm amber panel with the swaps that bring it back, or send anyway.
// Seeing a recipe and coming back puts the week back as it was (sessionStorage).
// How prices and choices are worked out: services/budget-plan.js. Prices are estimates.
import {
  getSetup, saveSetup, setupDays, setupSlots, loadPools, cachedPools, choose, total, priceFor, overSwaps, alternatives,
  leftOutCount, usable, unmatchedLikes, sendToPlan, shownLately, rememberShown, MORE_CHIPS, OUT_CHIPS,
} from '../services/budget-plan.js';
import { planDays } from '../services/meal-plan.js';
import { GROCERY_WORDS } from '../services/grocery-words.js';
import { esc, plateArt } from './kitchen-ui.js';
import { openKeyboard, keyboardStyle } from './keyboard.js';
import { topBar, people } from './ui.js';
import { soften } from '../services/soft-bg.js';

let ctl = null; // stops the recipe sites being asked
let kbClose = null;
let saveState = null; // keeps the week for coming back (see mount)

const STATE_KEY = 'budget.state.v1';
const MEAL_NAMES = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' };
const SAMPLE = { breakfast: 'pancakes', lunch: 'sandwich', dinner: 'spaghetti' }; // the painted plate on each meal button
const money = (x) => `$${(Math.round(x * 100) / 100).toFixed(2)}`;
const whole = (x) => `$${Math.round(x)}`;
const dayName = (d, opt = 'long') => d.date.toLocaleDateString('en-US', { weekday: opt });
const ICON = {
  swap: (c = '#23323A', s = 24) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.5-4.6L4 8"/><path d="M4 3v5h5"/><path d="M4 13a8 8 0 0 0 14.5 4.6L20 16"/><path d="M20 21v-5h-5"/></svg>`,
  open: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#23323A" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V7a4 4 0 0 1 7.6-1.7"/></svg>',
  lock: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2.5" fill="#FFFFFF"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  shuffle: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h3.5c5 0 6 12 11 12H21"/><path d="M3 18h3.5c2 0 3.2-2 4.2-4.5"/><path d="M13.3 9.5C14.3 7.5 15.5 6 17.5 6H21"/><path d="M18 3l3 3-3 3"/><path d="M18 15l3 3-3 3"/></svg>',
  send: '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#23323A" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex:none"><rect x="3" y="5" width="13" height="15" rx="2.5"/><path d="M3 10h13"/><path d="M7 3v4M12 3v4"/><path d="M15 15h6m-3-3l3 3-3 3"/></svg>',
};

const STYLE = `
  <style>
    .bd{position:absolute;left:0;top:0;width:100%;height:100%;overflow:hidden;font-family:Inter,system-ui,sans-serif}
    .bd.set{color:#FFF4EA;background:radial-gradient(ellipse 1000px 620px at 22% -6%,#5B3320 0%,#2C1B14 52%,#1A110D 100%)}
    .bd.wk{color:#FFFFFF;background:radial-gradient(ellipse at 70% 20%,#2E5A6B 0%,#183846 45%,#0E222C 100%)}
    .bd-wrap{position:relative;height:100%;padding:28px 40px 20px;display:flex;flex-direction:column;gap:16px}
    /* ---- setup ---- */
    .bd-cards{display:flex;gap:20px;flex:1 1 0;min-height:0}
    .bd-card{background:#FFF4EA;color:#3A1D10;border-radius:32px;padding:22px 30px;display:flex;flex-direction:column;min-width:0;min-height:0;overflow:hidden}
    .bd-l{font:700 15px Inter,sans-serif;letter-spacing:2px;color:#9A4A22;text-transform:uppercase;flex:none;display:flex;align-items:center}
    .bd-l.gap{margin-top:18px}
    .bd-l small{margin-left:auto;letter-spacing:0;text-transform:none;font:600 15px Inter,sans-serif;color:#9A7A66}
    .bd-sq{width:72px;height:72px;border-radius:20px;border:0;background:#F4DCCB;color:#5A2412;font:600 38px Inter,sans-serif;flex:none;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0}
    .bd-big{flex:1;text-align:center;font:700 96px/1 Outfit,sans-serif;color:#3A1D10}
    .bd-row{display:flex;gap:10px;margin-top:10px;flex:none}
    .bd-pill{min-height:56px;padding:0 20px;border-radius:999px;border:0;background:#F4DCCB;color:#5A2412;font:600 19px Inter,sans-serif;white-space:nowrap;cursor:pointer;flex:1 1 0;display:inline-flex;align-items:center;justify-content:center}
    .bd-pill.on,.bd-opt.on,.bd-meal.on,.bd-chip.on,.bd-pd.on{background:#5A2412;color:#FFF4EA}
    .bd-opt{flex:1 1 0;min-width:0;min-height:72px;border-radius:18px;border:0;background:#F4DCCB;color:#5A2412;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;font:600 19px Inter,sans-serif;padding:0 6px}
    .bd-opt small{font:500 14px Inter,sans-serif;opacity:.85;white-space:nowrap}
    .bd-serve{display:flex;align-items:center;margin-top:10px;padding:8px;border-radius:22px;background:#F8E8DA;flex:none}
    .bd-serve .bd-sq{width:64px;height:64px}
    .bd-dots{display:flex;justify-content:center}
    .bd-dots i{width:18px;height:18px;border-radius:50%;background:#EADBCB;border:2px solid #DCCAB6;margin:0 3px;box-sizing:border-box}
    .bd-dots i.on{background:#E8C27A;border-color:#C99A50}
    .bd-serve b{display:block;font:700 21px Inter,sans-serif;margin-top:4px;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:0 6px}
    .bd-meal{position:relative;flex:1 1 0;min-height:108px;border-radius:22px;border:0;background:#F4DCCB;color:#5A2412;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;font:600 20px Inter,sans-serif;cursor:pointer}
    .bd-tick{position:absolute;right:12px;top:12px;width:30px;height:30px;border-radius:50%;border:3px solid #C9A88E;color:#3A1D10;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:800;box-sizing:border-box}
    .bd-meal.on .bd-tick{border-color:#FFD696;background:#FFD696}
    /* the chips: two rows; more scroll inside */
    .bd-chips{display:flex;flex-wrap:wrap;align-content:flex-start;gap:10px;margin-top:10px;height:122px;overflow-y:auto;-webkit-overflow-scrolling:touch;flex:none}
    .bd-chip{min-height:56px;padding:0 18px;border-radius:999px;border:0;background:#F4DCCB;color:#5A2412;font:600 19px Inter,sans-serif;white-space:nowrap;cursor:pointer;display:inline-flex;align-items:center;gap:10px;max-width:100%;overflow:hidden;text-overflow:ellipsis}
    .bd-chip.add{background:transparent;box-shadow:inset 0 0 0 2px #D9B89E}
    .bd-foot{display:flex;align-items:center;gap:20px;flex:none;min-height:88px}
    .bd-sum{flex:1;min-width:0}
    .bd-sum b{display:block;font:600 22px Inter,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .bd-sum span{display:block;font:500 17px Inter,sans-serif;color:#D9C3B0;margin-top:4px}
    .bd-sum span.warn{color:#FFC9A8;font-weight:600}
    .bd-find{width:440px;min-height:84px;border-radius:24px;border:0;background:#FFD696;color:#3A1D10;font:700 28px Outfit,sans-serif;cursor:pointer;flex:none;position:relative;overflow:hidden}
    .bd-find[disabled]{opacity:.7;cursor:default}
    .bd-find .run{position:absolute;left:0;bottom:0;height:6px;width:30%;background:#B5532F;border-radius:3px;animation:bd-run 1.4s ease-in-out infinite}
    @keyframes bd-run{0%{transform:translate3d(-100%,0,0)}100%{transform:translate3d(340%,0,0)}}
    /* ---- the suggested week ---- */
    .bd-head{display:flex;align-items:center;gap:20px;flex:none;min-height:88px}
    .bd-ttl{flex:1;min-width:0}
    .bd-ttl b{display:block;font:500 34px/1.1 Outfit,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .bd-ttl span{display:block;font:500 17px Inter,sans-serif;color:#BFD6DE;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .bd-ttl span.warn{color:#FFC98F}
    .bd-meter{width:440px;flex:none;padding:10px 22px 14px;border-radius:22px;background:rgba(10,26,34,.62);box-shadow:inset 0 0 0 2px rgba(255,255,255,.16)}
    .bd-meter.over{box-shadow:inset 0 0 0 2px #FFB86B}
    .bd-meter .n{display:flex;align-items:baseline;white-space:nowrap}
    .bd-meter .n b{font:700 42px/1 Outfit,sans-serif}
    .bd-meter .n i{font:500 22px Outfit,sans-serif;font-style:normal;color:rgba(255,255,255,.78);margin-left:8px}
    .bd-meter .n em{margin-left:auto;font:700 20px Inter,sans-serif;font-style:normal;color:#9FE0B5}
    .bd-meter.over .n em{color:#FFB86B}
    .bd-bar{position:relative;height:14px;border-radius:999px;background:rgba(255,255,255,.16);margin-top:10px;overflow:hidden}
    .bd-bar i{position:absolute;left:0;top:0;bottom:0;border-radius:999px;background:#9FE0B5}
    .bd-meter.over .bd-bar i{background:#FFB86B}
    .bd-days{flex:1 1 0;min-height:0;display:flex;gap:10px;justify-content:center}
    .bd-day{flex:1 1 0;min-width:0;max-width:240px;border-radius:22px;background:#FFF8EE;color:#23323A;padding:10px 8px;display:flex;flex-direction:column;gap:6px;overflow-y:auto;-webkit-overflow-scrolling:touch}
    .bd-dh{padding:0 4px;flex:none}
    .bd-dh b{display:block;font:600 22px Outfit,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .bd-dh span{display:flex;font:500 15px Inter,sans-serif;color:#5B6B73}
    .bd-dh em{margin-left:auto;font-style:normal;font-weight:700;color:#23323A}
    .bd-mh{font:700 13px Inter,sans-serif;letter-spacing:1px;color:#C2652D;padding:2px 4px 0;text-transform:uppercase;flex:none}
    .bd-m{position:relative;border-radius:14px;background:#F3E7D3;padding:8px;border-left:6px solid transparent;flex:none;cursor:pointer}
    .bd-m.kept{border-left-color:#23323A}
    .bd-m.try{box-shadow:inset 0 0 0 3px #FFB86B}
    .bd-m .top{display:flex;align-items:center;gap:6px}
    .bd-m .pr{margin-left:auto;text-align:right;min-width:0}
    .bd-m .pr b{display:block;font:700 19px Outfit,sans-serif}
    .bd-m .pr span{font:500 13px Inter,sans-serif;color:#5B6B73}
    .bd-m .t{font:600 16px/1.2 Inter,sans-serif;margin-top:6px;height:39px;overflow:hidden}
    .bd-m .bs{display:flex;gap:6px;margin-top:8px}
    .bd-m .bs button{flex:1;height:56px;border-radius:12px;background:#FFFFFF;border:2px solid #D9C8AD;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0}
    .bd-m .bs button.on{background:#23323A;border-color:#23323A}
    .bd-m .tag{position:absolute;right:-4px;top:-12px;padding:3px 10px;border-radius:999px;background:#FFB86B;color:#23323A;font:700 14px Inter,sans-serif}
    .bd-m .ml{display:none}
    /* three meals a day: the meal's name inside the card, one line of title */
    .bd-wk.three .bd-mh{display:none}
    .bd-wk.three .bd-day{gap:6px}
    .bd-wk.three .bd-m{padding:6px 6px 6px 7px}
    .bd-wk.three .bd-m .ml{display:block;font:700 12px Inter,sans-serif;letter-spacing:1px;color:#C2652D;text-transform:uppercase}
    .bd-wk.three .bd-m .pr b{font-size:18px;display:inline}
    .bd-wk.three .bd-m .top{align-items:flex-start}
    .bd-wk.three .bd-m .t{height:20px;margin-top:4px;white-space:nowrap;text-overflow:ellipsis}
    .bd-wk.three .bd-m .bs{margin-top:6px}
    .bd-low{display:flex;align-items:center;gap:16px;flex:none;min-height:96px}
    .bd-shuf{min-height:72px;padding:0 26px;border-radius:999px;border:0;background:rgba(10,26,34,.55);box-shadow:inset 0 0 0 2px rgba(255,255,255,.28);color:#FFFFFF;display:flex;align-items:center;gap:12px;font:600 20px Inter,sans-serif;cursor:pointer;flex:none}
    .bd-send{margin-left:auto;width:560px;min-height:84px;border-radius:24px;border:0;background:#FFB86B;color:#23323A;display:flex;align-items:center;gap:16px;padding:0 26px;text-align:left;cursor:pointer;flex:none}
    .bd-send b{display:block;font:700 28px/1.1 Outfit,sans-serif}
    .bd-send span{display:block;font:600 16px Inter,sans-serif;opacity:.78;margin-top:3px}
    .bd-send[disabled]{opacity:.6;cursor:default}
    /* over budget */
    .bd-over{flex:none;border-radius:28px;background:#FFF8EE;color:#23323A;padding:14px 18px 14px 26px;display:flex;gap:20px;align-items:center}
    .bd-over .say{width:300px;flex:none}
    .bd-over .say>b{display:block;font:600 26px/1.15 Outfit,sans-serif}
    .bd-over .say span{display:block;font:500 17px/1.4 Inter,sans-serif;color:#5B6B73;margin-top:6px}
    .bd-over .sws{flex:1;min-width:0;display:flex;flex-direction:column;gap:8px}
    .bd-sw{display:flex;align-items:center;gap:10px;min-height:56px;border-radius:16px;background:#F3E7D3;padding:0 14px;font:600 17px Inter,sans-serif}
    .bd-sw .d{color:#C2652D;font-weight:700;width:44px;flex:none}
    .bd-sw .w{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
    .bd-save{margin-left:auto;padding:3px 10px;border-radius:999px;background:#DDF1E2;color:#1E6B3A;font-weight:700;flex:none}
    .bd-over .acts{width:300px;flex:none;display:flex;flex-direction:column;gap:8px}
    .bd-over .acts .go{min-height:72px;border-radius:20px;border:0;background:#FFB86B;color:#23323A;font:700 22px Outfit,sans-serif;cursor:pointer}
    .bd-over .acts .two{display:flex;gap:8px}
    .bd-over .acts .two button{flex:1;min-height:60px;border-radius:18px;border:2px solid #D9C8AD;background:transparent;color:#23323A;font:600 17px Inter,sans-serif;cursor:pointer}
    /* sheets */
    .bd-bg{position:absolute;left:0;top:0;right:0;bottom:0;z-index:5;background:rgba(6,16,21,.55);display:flex;align-items:flex-end}
    .bd-sheet{width:100%;background:#FFF8EE;color:#23323A;border-radius:32px 32px 0 0;padding:22px 40px 28px}
    .bd-sheet.brown{background:#FFF4EA;color:#3A1D10}
    .bd-sheet .hd{display:flex;align-items:center;gap:16px}
    .bd-sheet .hd b{display:block;font:600 30px Outfit,sans-serif}
    .bd-sheet .hd span{display:block;font:500 18px Inter,sans-serif;color:#5B6B73;margin-top:2px}
    .bd-sheet .hd .x-btn:first-of-type{margin-left:auto}
    .bd-alts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-top:18px}
    .bd-alt{position:relative;border-radius:24px;background:#FFFFFF;box-shadow:0 2px 0 #E6D8C0;padding:14px 16px;display:flex;align-items:center;gap:14px;min-height:196px;cursor:pointer;color:#23323A}
    .bd-alt.now{background:#EFE3CF;box-shadow:inset 0 0 0 3px #23323A;cursor:default}
    .bd-alt .w{flex:1;min-width:0}
    .bd-alt .t{padding-right:76px;font:600 22px/1.15 Outfit,sans-serif;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
    .bd-alt .s{font:500 15px Inter,sans-serif;color:#5B6B73;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .bd-alt .p{font:700 26px Outfit,sans-serif;margin-top:8px}
    .bd-alt .p small{font:500 15px Inter,sans-serif;color:#5B6B73}
    .bd-alt .c{display:flex;align-items:center;gap:8px;margin-top:8px;font:600 16px Inter,sans-serif;color:#5B6B73;white-space:nowrap}
    .bd-alt .see{position:absolute;right:12px;top:12px;min-height:56px;padding:0 14px;border-radius:999px;border:0;background:#F3E7D3;color:#23323A;font:600 15px Inter,sans-serif;cursor:pointer}
    .bd-dl{padding:5px 14px;border-radius:999px;background:#DDF1E2;color:#1E6B3A;font:700 18px Inter,sans-serif}
    .bd-dl.up{background:#FFE6C9;color:#8A4A12}
    .bd-dl.now{background:#23323A;color:#FFFFFF}
    .bd-pick{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:10px;margin-top:16px}
    .bd-pd{min-height:84px;border-radius:18px;border:0;background:#F4DCCB;color:#5A2412;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;font:600 18px Inter,sans-serif;cursor:pointer}
    .bd-pd small{font:500 15px Inter,sans-serif;opacity:.8}
    .bd-grid{display:flex;flex-wrap:wrap;gap:12px;margin-top:18px;max-height:420px;overflow-y:auto;-webkit-overflow-scrolling:touch}
    .bd-grid .bd-chip{min-width:180px;justify-content:center}
    .bd-type{position:absolute;left:50%;top:24px;transform:translateX(-50%);width:640px;z-index:6;background:#FFF4EA;color:#3A1D10;border-radius:28px;padding:18px 24px 22px}
    .bd-type .hd{display:flex;align-items:center;justify-content:space-between;font:600 20px Inter,sans-serif}
    .bd-type .hd button{border:0;background:transparent;color:#7A5646;font:600 18px Inter,sans-serif;min-height:56px;padding:0 8px;cursor:pointer}
    .bd-box{margin-top:10px;min-height:64px;border-radius:999px;border:2px solid #E2C2A6;background:#FFFFFF;padding:0 24px;display:flex;align-items:center;font:500 22px Inter,sans-serif}
    .bd-box .car{display:inline-block;width:3px;height:28px;margin-left:2px;background:#9A4A22;border-radius:2px}
    @media (prefers-reduced-motion: reduce){.bd-find .run{animation:none}}
    ${keyboardStyle({ panel: '#1A110D', key: '#FFF4EA', ink: '#3A1D10', go: '#FFD696', goInk: '#3A1D10', space: '#7A5646',
    sug: 'rgba(255,244,234,.14)', sugInk: '#FFF4EA', fn: 'rgba(255,244,234,.16)', fnInk: '#FFF4EA', line: 'rgba(255,244,234,.3)' })}
  </style>`;

export function mount(el, { args = [] } = {}) {
  const fromPlan = args[0] === 'plan';
  const who = people().map((p) => p.name);
  let setup = getSetup(who.length);
  let view = 'setup';
  let pools = null; // { meal: [candidate] }
  let byId = {};
  let week = null; // { slots: [{ key, meal, id, keep, want }], seed, sig }
  let sheet = null; // { type: 'swap', i, skip } | { type: 'days' } | { type: 'list', which } | { type: 'type', which, text }
  let busy = ''; // 'find' | 'send'
  let note = ''; // one line: what went wrong and what to change
  let offline = false;
  el.innerHTML = `${STYLE}<div class="bd set" data-root></div>`;
  const root = el.querySelector('[data-root]');
  const save = () => saveSetup(setup);
  const sig = () => JSON.stringify([setup.budget, setup.days, setup.picked, setup.serves, setup.meals, setup.more, setup.out]);
  try { localStorage.setItem('budget.seen.v1', '1'); } catch (e) { /* the Recipes plate keeps its "New" */ }
  const indexPools = () => { byId = {}; Object.keys(pools).forEach((m) => pools[m].forEach((c) => { byId[c.id] = c; })); };

  // ---- Coming back from a recipe: the week as it was ----------------------------------------
  saveState = (extra = {}) => {
    try {
      const scroll = [].map.call(root.querySelectorAll('.bd-day'), (d) => d.scrollTop);
      sessionStorage.setItem(STATE_KEY, JSON.stringify(Object.assign({ at: Date.now(), view, week, offline, sheet: null, scroll }, extra)));
    } catch (e) { /* full: back to the setup then */ }
  };
  let restoreScroll = null;
  try {
    const st = JSON.parse(sessionStorage.getItem(STATE_KEY) || 'null');
    sessionStorage.removeItem(STATE_KEY);
    if (st && st.back && Date.now() - st.at < 3 * 3600000 && st.week && Array.isArray(st.week.slots)) {
      pools = cachedPools(setup.meals, true);
      indexPools();
      if (st.week.slots.every((x) => byId[x.id])) {
        week = st.week;
        view = st.view === 'week' ? 'week' : 'setup';
        offline = !!st.offline;
        sheet = st.sheet && st.sheet.type === 'swap' && week.slots[st.sheet.i] ? { type: 'swap', i: st.sheet.i, skip: st.sheet.skip || {} } : null;
        restoreScroll = st.scroll || null;
        // (More recipes may come in meanwhile, quietly.)
        loadPools(setup.meals, { likes: setup.more, onGrow: (m, list) => { pools[m] = list; indexPools(); } }).catch(() => {});
      } else { pools = null; byId = {}; }
    }
  } catch (e) { /* start at the setup */ }
  const openRecipe = (id, extra) => { saveState(Object.assign({ back: 1 }, extra)); location.hash = `#/dish/${encodeURIComponent(id)}`; };

  // ---- setup ----------------------------------------------------------------------------
  const daysOf = () => setupDays(setup);
  const span = (days) => (days.length ? `${dayName(days[0], 'short')} ${days[0].sub} – ${dayName(days[days.length - 1], 'short')} ${days[days.length - 1].sub}` : '');
  const mealsText = (list, joiner) => {
    const n = list.map((m) => MEAL_NAMES[m].toLowerCase());
    return n.length > 1 ? `${n.slice(0, -1).join(', ')}${joiner}${n[n.length - 1]}` : n.join('');
  };
  const allChoices = (which) => {
    const list = which === 'more' ? MORE_CHIPS : OUT_CHIPS;
    const added = setup[which === 'more' ? 'addedMore' : 'addedOut'];
    return list.concat(added.filter((w) => !list.some((c) => c[0] === w)).map((w) => [w, w.charAt(0).toUpperCase() + w.slice(1)]));
  };
  const nameOf = (which, id) => (allChoices(which).find((c) => c[0] === id) || [id, id])[1];
  const label = (which, id) => (which === 'out' ? `No ${nameOf(which, id).toLowerCase()}` : nameOf(which, id));
  // The card shows what is chosen, a way to all the choices, and (while few are chosen) a few to tap.
  const chips = (which) => {
    const on = setup[which];
    const all = allChoices(which);
    const few = all.filter((c) => on.indexOf(c[0]) < 0).slice(0, Math.max(0, 5 - on.length));
    // ("+ More" first: with many chosen it must not scroll away.)
    return `<div class="bd-chips" data-chipbox="${which}"><button class="bd-chip add" data-list="${which}">${on.length ? '+ More' : `All ${all.length}…`}</button>
      ${on.map((id) => `<button class="bd-chip on" data-chip="${which}" data-id="${esc(id)}">${esc(label(which, id))}<span aria-hidden="true">×</span></button>`).join('')}
      ${few.map((c) => `<button class="bd-chip" data-chip="${which}" data-id="${esc(c[0])}">${esc(c[1])}</button>`).join('')}</div>`;
  };
  function setupHtml() {
    const days = daysOf();
    const slots = days.length * setup.meals.length;
    const n = setup.serves;
    const names = n === who.length && who.length > 1 && who.length <= 3 ? ` · ${who.join(' & ')}` : '';
    const warn = !setup.meals.length ? 'Pick at least one meal.' : !days.length ? 'Pick at least one day.' : note;
    const next = planDays(1);
    const wk = next.filter((d) => d.date.getDay() > 0 && d.date.getDay() < 6);
    const same = week && week.sig === sig();
    return `
      <div class="bd-wrap">
        ${topBar({ title: 'Plan on a budget', back: fromPlan ? '#/plan' : '#/recipes', backLabel: fromPlan ? '← Week plan' : '← Recipes', tone: 'dark' })}
        <div class="bd-cards">
          <div class="bd-card" style="flex:0 0 580px">
            <div class="bd-l">Spend up to</div>
            <div style="display:flex;align-items:center;margin-top:8px">
              <button class="bd-sq" data-budget="-5" aria-label="$5 less">−</button><div class="bd-big">${whole(setup.budget)}</div><button class="bd-sq" data-budget="5" aria-label="$5 more">+</button></div>
            <div class="bd-row" style="margin-top:14px">${[50, 75, 100, 150, 200].map((b) => `<button class="bd-pill${setup.budget === b ? ' on' : ''}" data-setbudget="${b}" style="padding:0 10px">$${b}</button>`).join('')}</div>
            <div class="bd-l gap">For</div>
            <div class="bd-row">
              <button class="bd-opt${setup.days === 'next' ? ' on' : ''}" data-days="next">Next week<small>${esc(span(next))}</small></button>
              <button class="bd-opt${setup.days === 'weekdays' ? ' on' : ''}" data-days="weekdays">Weekdays<small>${esc(`Mon–Fri · ${wk.length ? `${wk[0].sub}–${wk[wk.length - 1].sub.replace(/^[A-Za-z]+ /, '')}` : ''}`)}</small></button>
              <button class="bd-opt${setup.days === 'pick' ? ' on' : ''}" data-days="pick">Pick days<small>${setup.days === 'pick' && days.length ? `${days.length} day${days.length > 1 ? 's' : ''}` : 'Choose'}</small></button>
            </div>
            <div class="bd-l gap">Serves</div>
            <div class="bd-serve">
              <button class="bd-sq" data-serves="-1" aria-label="Fewer people">−</button>
              <div style="flex:1;min-width:0"><div class="bd-dots">${[1, 2, 3, 4, 5, 6].map((i) => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</div><b>Serves ${n}${esc(names)}</b></div>
              <button class="bd-sq" data-serves="1" aria-label="More people">+</button>
            </div>
          </div>
          <div class="bd-card" style="flex:1 1 0">
            <div class="bd-l">Meals each day</div>
            <div class="bd-row">${['breakfast', 'lunch', 'dinner'].map((m) => {
              const on = setup.meals.indexOf(m) >= 0;
              return `<button class="bd-meal${on ? ' on' : ''}" data-meal="${m}" aria-pressed="${on}">${plateArt({ id: `budget-${m}`, t: SAMPLE[m], ty: m, c: m === 'dinner' ? 'italian' : m }, 56)}<span>${MEAL_NAMES[m]}</span><span class="bd-tick" aria-hidden="true">${on ? '✓' : ''}</span></button>`;
            }).join('')}</div>
            <div class="bd-l gap">More of these${setup.more.length ? `<small>${setup.more.length} chosen</small>` : ''}</div>
            ${chips('more')}
            <div class="bd-l gap">Leave out${setup.out.length ? `<small>${setup.out.length} chosen</small>` : ''}</div>
            ${chips('out')}
          </div>
        </div>
        <div class="bd-foot">
          <div class="bd-sum"><b>${slots} meal${slots === 1 ? '' : 's'}${setup.meals.length ? ` · ${esc(mealsText(setup.meals, ' and '))}` : ''} · serves ${n}</b>
            <span class="${warn ? 'warn' : ''}">${esc(busy === 'find' ? 'Asking the recipe sites…' : warn || 'Prices are estimates from typical store prices')}</span></div>
          <button class="bd-find" data-find${!slots || busy ? ' disabled' : ''}>${busy === 'find' ? 'Finding meals…<span class="run"></span>' : same && view === 'setup' ? 'Back to the week' : `Find meals for ${whole(setup.budget)}`}</button>
        </div>
      </div>`;
  }

  // ---- the suggested week ----------------------------------------------------------------
  const weekTotal = () => total(week.slots, byId, setup.serves);
  function card(x, i, tries) {
    const c = byId[x.id];
    if (!c) return '';
    const tr = tries[i];
    return `<div class="bd-m${x.keep ? ' kept' : ''}${tr ? ' try' : ''}" data-open="${esc(c.id)}">
      <div class="top">${plateArt({ id: c.id, t: c.t, ty: c.meal, c: 'web', img: c.img, alt: c.alt }, setup.meals.length > 2 ? 38 : 44)}<div class="pr"><span class="ml">${MEAL_NAMES[x.meal]}</span><b>${money(priceFor(c, setup.serves))}</b> <span class="e">est.</span></div></div>
      <div class="t">${esc(c.t)}</div>
      <div class="bs"><button data-swap="${i}" aria-label="Swap ${esc(c.t)}">${ICON.swap()}</button><button class="${x.keep ? 'on' : ''}" data-keep="${i}" aria-pressed="${x.keep}" aria-label="${x.keep ? 'Kept' : 'Keep'} ${esc(c.t)}">${x.keep ? ICON.lock : ICON.open}</button></div>
      ${tr ? `<div class="tag">try −${money(tr.save)}</div>` : ''}
    </div>`;
  }
  function weekHtml() {
    const sum = weekTotal();
    const over = sum > setup.budget + 0.004;
    const swaps = over ? overSwaps(week.slots, pools, setup) : [];
    const tries = {};
    swaps.forEach((s) => { tries[s.i] = s; });
    const days = planDays(0).concat(planDays(1));
    const keys = week.slots.map((x) => x.key).filter((k, i, a) => a.indexOf(k) === i);
    const dayList = keys.map((k) => days.find((x) => x.key === k)).filter(Boolean);
    const label = setup.days === 'next' ? 'Next week' : setup.days === 'weekdays' ? 'Weekdays' : `${keys.length} day${keys.length > 1 ? 's' : ''}`;
    const lost = unmatchedLikes(pools, setup);
    const sub = offline ? `${navigator.onLine === false ? 'No internet' : 'The recipe sites didn’t answer'} · recipes kept on this screen`
      : lost.length ? `Nothing found for ${lost.map((id) => `“${nameOf('more', id)}”`).join(', ')} with what’s left out`
        : [span(dayList), `serves ${setup.serves}`].concat(setup.out.slice(0, 2).map((w) => label2(w)), setup.out.length > 2 ? [`${setup.out.length - 2} more left out`] : []).join(' · ');
    const pct = Math.min(100, setup.budget ? (sum / setup.budget) * 100 : 100);
    const n = week.slots.length;
    const after = swaps.length ? Math.round((sum - swaps.reduce((a, s) => a + s.save, 0)) * 100) / 100 : sum;
    const count = ['', 'The swap', 'Both swaps', 'Three swaps'][swaps.length] || '';
    return `
      <div class="bd-wrap bd-wk${setup.meals.length > 2 ? ' three' : ''}">
        <div class="bd-head">
          <button class="x-btn glass" data-change>← Change</button>
          <div class="bd-ttl"><b>${esc(label)} on ${whole(setup.budget)}</b>
            <span class="${offline || lost.length ? 'warn' : ''}">${esc(sub)}</span></div>
          <div class="bd-meter${over ? ' over' : ''}">
            <div class="n"><b>${over ? money(sum) : whole(sum)}</b><i>of ${whole(setup.budget)}</i><em>${over ? `${money(sum - setup.budget)} over` : `${whole(setup.budget - sum)} to spare`}</em></div>
            <div class="bd-bar"><i style="width:${pct.toFixed(1)}%"></i></div>
          </div>
        </div>
        <div class="bd-days">${dayList.map((d) => {
          const mine = week.slots.map((x, i) => ({ x, i })).filter((o) => o.x.key === d.key);
          const dayTotal = mine.reduce((a, o) => a + (byId[o.x.id] ? priceFor(byId[o.x.id], setup.serves) : 0), 0);
          return `<div class="bd-day">
            <div class="bd-dh"><b>${esc(dayName(d))}</b><span>${esc(d.sub)}<em>${money(dayTotal)}</em></span></div>
            ${mine.map((o) => `<div class="bd-mh">${MEAL_NAMES[o.x.meal]}</div>${card(o.x, o.i, tries)}`).join('')}
          </div>`;
        }).join('')}</div>
        ${over ? `<div class="bd-over">
          <div class="say"><b>${sum > setup.budget * 1.2 ? 'Over budget' : 'A little over'}</b>
            <span>${swaps.length ? `${count} bring${swaps.length > 1 ? '' : 's'} it to <strong style="color:#23323A">${money(after)}</strong>.` : 'These are the cheapest choices.'}</span></div>
          <div class="sws">${swaps.map((s) => {
            const d = days.find((x) => x.key === week.slots[s.i].key);
            return `<div class="bd-sw"><span class="d">${esc(d ? d.short : '')}</span><span class="w">${esc(byId[s.from].t)} → <b>${esc(byId[s.to].t)}</b></span><span class="bd-save">−${money(s.save)}</span></div>`;
          }).join('')}</div>
          <div class="acts">
            ${swaps.length ? `<button class="go" data-makeswaps>${swaps.length === 1 ? 'Make the swap' : swaps.length === 2 ? 'Make both swaps' : `Make the ${swaps.length} swaps`}</button>` : ''}
            <div class="two"><button data-raise="${Math.ceil(sum / 10) * 10}">Budget $${Math.ceil(sum / 10) * 10}</button><button data-send${busy ? ' disabled' : ''}>${busy === 'send' ? 'Sending…' : 'Send anyway'}</button></div>
          </div>
        </div>` : `<div class="bd-low">
          <button class="bd-shuf" data-shuffle>${ICON.shuffle} Shuffle the rest</button>
          <button class="bd-send" data-send${busy ? ' disabled' : ''}>${ICON.send}<div><b>${busy === 'send' ? 'Sending…' : 'Send to my week plan'}</b><span>${n} meal${n > 1 ? 's' : ''} to the right days · ingredients to the shopping list</span></div></button>
        </div>`}
        ${note ? `<div style="position:absolute;left:40px;right:640px;bottom:2px;font:600 16px Inter,sans-serif;color:#FFC98F;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(note)}</div>` : ''}
      </div>`;
  }
  const label2 = (w) => `no ${nameOf('out', w).toLowerCase()}`;

  // ---- sheets -------------------------------------------------------------------------------
  function swapSheet() {
    const i = sheet.i;
    const x = week.slots[i];
    const cur = byId[x.id];
    const d = planDays(0).concat(planDays(1)).find((y) => y.key === x.key);
    const sum = weekTotal();
    const now = priceFor(cur, setup.serves);
    let alts = alternatives(week.slots, i, pools, setup, 5, sheet.skip || {});
    if (!alts.length && Object.keys(sheet.skip || {}).length) { sheet.skip = {}; alts = alternatives(week.slots, i, pools, setup, 5); }
    const list = alts.concat([cur]).sort((a, b) => a.p1 - b.p1);
    const gone = leftOutCount(pools[x.meal], setup);
    const why = setup.out.slice(0, 2).map((w) => nameOf('out', w).toLowerCase()).join(' or ');
    return `<div class="bd-bg" data-shut><div class="bd-sheet" role="dialog">
      <div class="hd"><div style="min-width:0"><b>Swap ${esc(d ? dayName(d) : '')} ${MEAL_NAMES[x.meal].toLowerCase()}</b>
        <span>Cheapest first${gone ? ` · ${gone} left out because they have ${esc(why)}` : ''}</span></div>
        <button class="x-btn line" data-morealts>More choices</button>
        <button class="x-btn ink" data-shut>Keep ${esc(cur.t.length > 24 ? `${cur.t.slice(0, 22)}…` : cur.t)}</button></div>
      <div class="bd-alts">${list.map((c) => {
        const p = priceFor(c, setup.serves);
        const diff = Math.round((p - now) * 100) / 100;
        const isNow = c.id === cur.id;
        return `<div class="bd-alt${isNow ? ' now' : ''}" ${isNow ? 'data-shut' : `data-pick="${esc(c.id)}"`} role="button">${plateArt({ id: c.id, t: c.t, ty: c.meal, c: 'web', img: c.img, alt: c.alt }, 112)}
          <div class="w"><div class="t">${esc(c.t)}</div><div class="s">${esc([c.site, c.m ? `${c.m} min` : ''].filter(Boolean).join(' · '))}</div>
          <div class="p">${money(p)} <small>for ${setup.serves} · est.</small></div>
          <div class="c">${isNow ? '<span class="bd-dl now">Now</span>' : `<span class="bd-dl${diff > 0 ? ' up' : ''}">${diff > 0 ? '+' : '−'}${money(Math.abs(diff))}</span>`}<span>week ${money(sum + diff)}</span></div></div>
          <button class="see" data-see="${esc(c.id)}" aria-label="See the recipe for ${esc(c.t)}">Recipe</button></div>`;
      }).join('')}</div>
    </div></div>`;
  }
  function daysSheet() {
    const all = planDays(0).concat(planDays(1));
    return `<div class="bd-bg" data-shut><div class="bd-sheet brown" role="dialog">
      <div class="hd"><b>Pick days</b><button class="x-btn ink" data-shut style="background:#5A2412">Done</button></div>
      <div class="bd-pick">${all.map((d) => `<button class="bd-pd${setup.picked.indexOf(d.key) >= 0 ? ' on' : ''}" data-pickday="${d.key}">${esc(d.n === 0 ? 'Today' : d.short)}<small>${esc(d.sub)}</small></button>`).join('')}</div>
    </div></div>`;
  }
  // Every choice of a list at once, to tap on and off; your own words too.
  function listSheet() {
    const which = sheet.which;
    const on = setup[which];
    return `<div class="bd-bg" data-shut><div class="bd-sheet brown" role="dialog">
      <div class="hd"><b>${which === 'out' ? 'Leave out' : 'More of these'}</b>
        <button class="x-btn line" data-addword="${which}">+ Add your own</button>
        <button class="x-btn ink" data-shut style="background:#5A2412">Done</button></div>
      <div class="bd-grid">${allChoices(which).map((c) => `<button class="bd-chip${on.indexOf(c[0]) >= 0 ? ' on' : ''}" data-chip="${which}" data-id="${esc(c[0])}">${on.indexOf(c[0]) >= 0 ? '✓ ' : ''}${esc(c[1])}</button>`).join('')}</div>
    </div></div>`;
  }
  function typeSheet() {
    return `<div class="bd-bg" data-typebg style="align-items:flex-start"></div><div class="bd-type">
      <div class="hd"><button data-typecancel>Cancel</button><span>${sheet.which === 'out' ? 'Leave out' : 'More of these'}</span><span style="width:70px"></span></div>
      <div class="bd-box"><span>${esc(sheet.text || '')}</span><span class="car"></span></div>
    </div>`;
  }

  function render() {
    const cls = `bd ${view === 'week' ? 'wk' : 'set'}`;
    if (root.className !== cls) {
      // The brown table or the teal evening: the app paints the big background once as a small
      // picture (soft-bg.js), so the new one is painted again.
      root.className = cls;
      root.style.backgroundImage = '';
      try { soften(el); } catch (e) { /* the CSS gradient shows instead */ }
    }
    if (kbClose && !(sheet && sheet.type === 'type')) { kbClose(); }
    // (Each list of chips and each day keeps where it was scrolled.)
    const keep = {};
    root.querySelectorAll('[data-chipbox],.bd-day,.bd-grid').forEach((b, n) => { keep[b.getAttribute('data-chipbox') || `${b.className}${n}`] = b.scrollTop; });
    root.innerHTML = (view === 'week' && week ? weekHtml() : setupHtml())
      + (sheet && sheet.type === 'swap' ? swapSheet() : sheet && sheet.type === 'days' ? daysSheet() : sheet && sheet.type === 'list' ? listSheet() : sheet && sheet.type === 'type' ? typeSheet() : '');
    root.querySelectorAll('[data-chipbox],.bd-day,.bd-grid').forEach((b, n) => { const k = keep[b.getAttribute('data-chipbox') || `${b.className}${n}`]; if (k) b.scrollTop = k; });
    if (restoreScroll) { root.querySelectorAll('.bd-day').forEach((d, n) => { d.scrollTop = restoreScroll[n] || 0; }); restoreScroll = null; }
    if (sheet && sheet.type === 'type') openTyping();
  }

  // Typing a word for "More of these" / "Leave out": the screen's own keyboard.
  function openTyping() {
    const which = sheet.which;
    const pool = allChoices(which).map((c) => c[1].toLowerCase()).concat(GROCERY_WORDS.map((w) => w.toLowerCase()));
    const kb = openKeyboard(root, {
      go: which === 'out' ? 'Leave out' : 'Add', max: 30, slots: 3, text: sheet.text || '',
      suggest: (tx) => {
        const q = tx.trim().toLowerCase();
        if (!q) return [];
        return pool.filter((w, i, a) => a.indexOf(w) === i && w.indexOf(q) === 0).slice(0, 3).map((w) => w.charAt(0).toUpperCase() + w.slice(1));
      },
      onChange: (tx) => { if (sheet) { sheet.text = tx; const b = root.querySelector('.bd-box span'); if (b) b.textContent = tx; } },
      onGo: (pick, k) => {
        const w = (pick || k.text).trim().toLowerCase().replace(/[^a-z' -]/g, '').slice(0, 30);
        if (w) {
          // A word that is one of the choices is that choice ("Mushrooms").
          const hit = allChoices(which).find((c) => c[1].toLowerCase() === w || c[0] === w);
          const id = hit ? hit[0] : w;
          const added = which === 'more' ? 'addedMore' : 'addedOut';
          if (setup[which].indexOf(id) < 0) setup[which].push(id);
          if (!hit && setup[added].indexOf(id) < 0) setup[added].push(id);
          save();
        }
        sheet = { type: 'list', which };
        k.close();
      },
      onClose: () => { kbClose = null; if (sheet && sheet.type === 'type') sheet = { type: 'list', which }; if (el.isConnected) render(); },
    });
    kbClose = () => { kbClose = null; kb.close(); };
  }

  // ---- doing things ----------------------------------------------------------------------
  const showWeek = (slots, seed) => {
    week = { slots, seed, sig: sig() };
    rememberShown(slots.map((x) => x.id));
    view = 'week';
  };
  async function find() {
    const slots = setupSlots(setup);
    if (!slots.length || busy) return;
    if (week && week.sig === sig() && week.slots.every((x) => byId[x.id])) { view = 'week'; note = ''; render(); return; }
    note = '';
    busy = 'find';
    render();
    if (ctl) ctl.abort();
    ctl = new AbortController();
    const mine = ctl;
    const res = await loadPools(setup.meals, { signal: mine.signal, likes: setup.more, onGrow: (m, list) => { if (pools && pools[m]) { pools[m] = list; indexPools(); } } });
    if (mine.signal.aborted || !el.isConnected) return;
    busy = '';
    pools = res.pools;
    offline = res.offline;
    indexPools();
    const empty = setup.meals.find((m) => !(pools[m] || []).length);
    if (empty) {
      note = navigator.onLine === false ? 'No internet, and no recipes kept on this screen yet. Try again when the Wi-Fi is back.' : 'The recipe sites didn’t answer. Try again in a moment.';
      render();
      return;
    }
    const none = setup.meals.find((m) => !usable(pools[m], setup).length);
    if (none) {
      note = `No ${MEAL_NAMES[none].toLowerCase()} recipes without ${setup.out.map((w) => nameOf('out', w).toLowerCase()).join(', ')}. Leave out fewer things.`;
      render();
      return;
    }
    // Meals kept last time stay where they were, if that day and meal are still asked for.
    const keepers = week ? week.slots.filter((x) => x.keep && byId[x.id]) : [];
    const plan = slots.map((x) => Object.assign({}, x, keepers.find((k) => k.key === x.key && k.meal === x.meal) || {}));
    const seed = Math.floor(Math.random() * 1e9);
    showWeek(choose(plan, pools, setup, seed, shownLately()).slots, seed);
    render();
  }
  async function send() {
    if (busy || !week) return;
    busy = 'send';
    render();
    const label = setup.days === 'next' ? 'Next week' : setup.days === 'weekdays' ? 'Weekdays' : 'Your days';
    let res;
    try { res = await sendToPlan(week.slots, byId, setup, label); } catch (e) { res = null; }
    if (!el.isConnected) return;
    busy = '';
    if (!res) { note = 'Couldn’t send. Try again.'; render(); return; }
    const where = setup.days === 'pick' ? 'your days' : setup.days === 'weekdays' ? 'next week’s weekdays' : 'next week';
    const first = `${res.added} meal${res.added === 1 ? '' : 's'} added to ${where}${res.kept ? ` · ${res.kept} already planned stay${res.kept === 1 ? 's' : ''}`
      : res.replaced ? ' · last budget week replaced' : ''}`;
    const second = navigator.onLine === false ? 'The shopping list fills in when the Wi-Fi is back'
      : `${res.things} thing${res.things === 1 ? '' : 's'} on the shopping list · about ${whole(res.total)} of ${whole(setup.budget)}`;
    try {
      sessionStorage.setItem('budget.toast', JSON.stringify({ text: first, sub: second, snap: res.snap, wasNext: res.wasNext, before: res.before || null }));
      sessionStorage.setItem('kitchen.planWeek', res.next ? '1' : '0');
    } catch (e) { /* the plan just shows without the note */ }
    location.hash = '#/plan';
  }

  root.addEventListener('click', (e) => {
    const t = (sel) => e.target.closest(sel);
    let x;
    if (busy === 'send') return;
    // sheets
    if (sheet && sheet.type === 'type') {
      if (t('[data-typecancel]') || t('[data-typebg]')) { sheet = { type: 'list', which: sheet.which }; if (kbClose) kbClose(); else render(); }
      return;
    }
    if (sheet) {
      if ((x = t('[data-see]'))) { openRecipe(x.dataset.see, { sheet }); return; }
      if ((x = t('[data-pick]'))) { week.slots[sheet.i].id = x.dataset.pick; rememberShown([x.dataset.pick]); sheet = null; render(); return; }
      if (t('[data-morealts]')) {
        const skip = sheet.skip || {};
        alternatives(week.slots, sheet.i, pools, setup, 5, skip).forEach((c) => { skip[c.id] = 1; });
        sheet.skip = skip;
        render();
        return;
      }
      if ((x = t('[data-pickday]'))) {
        const k = x.dataset.pickday;
        setup.picked = setup.picked.indexOf(k) >= 0 ? setup.picked.filter((y) => y !== k) : setup.picked.concat(k);
        save();
        render();
        return;
      }
      if ((x = t('[data-chip]'))) {
        const which = x.dataset.chip;
        const id = x.dataset.id;
        setup[which] = setup[which].indexOf(id) >= 0 ? setup[which].filter((y) => y !== id) : setup[which].concat(id);
        save();
        render();
        return;
      }
      if ((x = t('[data-addword]'))) { sheet = { type: 'type', which: x.dataset.addword, text: '' }; render(); return; }
      const shut = t('[data-shut]');
      if (shut && (shut.tagName === 'BUTTON' || e.target === shut || shut.classList.contains('bd-alt'))) { sheet = null; render(); }
      return;
    }
    // setup
    if ((x = t('[data-budget]'))) { setup.budget = Math.max(10, Math.min(1000, setup.budget + Number(x.dataset.budget))); save(); render(); return; }
    if ((x = t('[data-setbudget]'))) { setup.budget = Number(x.dataset.setbudget); save(); render(); return; }
    if ((x = t('[data-days]'))) {
      setup.days = x.dataset.days;
      if (setup.days === 'pick') {
        const keys = planDays(0).concat(planDays(1)).map((d) => d.key);
        setup.picked = setup.picked.filter((k) => keys.indexOf(k) >= 0);
        sheet = { type: 'days' };
      }
      save();
      render();
      return;
    }
    if ((x = t('[data-serves]'))) { setup.serves = Math.max(1, Math.min(12, setup.serves + Number(x.dataset.serves))); save(); render(); return; }
    if ((x = t('[data-meal]'))) {
      const m = x.dataset.meal;
      setup.meals = ['breakfast', 'lunch', 'dinner'].filter((y) => (y === m ? setup.meals.indexOf(y) < 0 : setup.meals.indexOf(y) >= 0));
      save();
      render();
      return;
    }
    if ((x = t('[data-chip]'))) {
      const which = x.dataset.chip;
      const id = x.dataset.id;
      setup[which] = setup[which].indexOf(id) >= 0 ? setup[which].filter((y) => y !== id) : setup[which].concat(id);
      save();
      render();
      return;
    }
    if ((x = t('[data-list]'))) { sheet = { type: 'list', which: x.dataset.list }; render(); return; }
    if (t('[data-find]')) { find(); return; }
    // the week
    if (t('[data-change]')) { view = 'setup'; note = ''; render(); return; }
    if ((x = t('[data-swap]'))) { sheet = { type: 'swap', i: Number(x.dataset.swap), skip: {} }; render(); return; }
    if ((x = t('[data-keep]'))) { const s = week.slots[Number(x.dataset.keep)]; s.keep = !s.keep; render(); return; }
    if (t('[data-shuffle]')) {
      const seed = Math.floor(Math.random() * 1e9);
      showWeek(choose(week.slots, pools, setup, seed, shownLately()).slots, seed);
      render();
      return;
    }
    if (t('[data-makeswaps]')) {
      overSwaps(week.slots, pools, setup).forEach((s) => { week.slots[s.i].id = s.to; });
      render();
      return;
    }
    if ((x = t('[data-raise]'))) { setup.budget = Number(x.dataset.raise); save(); week.sig = sig(); render(); return; }
    if (t('[data-send]')) { send(); return; }
    if ((x = t('[data-open]'))) openRecipe(x.dataset.open);
  });
  // A tap on the keyboard or the box must not move the focus (nothing here takes typing).
  root.addEventListener('mousedown', (e) => { if (e.target.closest('.bd-type')) e.preventDefault(); });

  render();
}

export function unmount() {
  if (ctl) ctl.abort();
  ctl = null;
  if (kbClose) kbClose();
  kbClose = null;
  saveState = null;
}
