// Kitchen · Shopping list: everything this week's plan needs, plus your own things, by aisle,
// with the list's own phone code right beside it ("Paper planes to a phone").
//
// Tap a row to tick it off (ticked rows sink). "Have it" (rows still to get) moves it to Already
// have. Add your own items by typing ("2 x milk" works) or with one tap on the quick buttons. Undo is offered
// for a few seconds after anything comes off the list.
//
// The code on the right opens the phone page on its list: the phone keeps a copy, so the
// list is still there at the store, and ticks made there come back when the phone is on the
// home Wi-Fi again. When that happens a little paper plane lands on the row. "Who's going?"
// is only a note on this screen: nothing can be pushed to anybody's phone.
import {
  buildShoppingList, onKitchenChanged, setHave, setGot, addExtra, setExtraGot, removeExtra, clearChecked,
  guessAisle, AISLE_NAMES, COMMON_ITEMS, recentExtras, setExtraQty, extraText, splitQty, listSnapshot, restoreList,
  setListNextWeek, listSeen, setListSeen, getGoing, setGoing, onPhoneChange,
} from '../services/meal-plan.js';
import { esc, topBar, phoneCode, wirePhoneCodes, people, avatar } from './ui.js';
import { onFamilyChanged } from '../services/family.js';
import { C } from '../art.js';

let off, offPhone, offFamily, stopCodes, stopTimers;

// The screen's colours (from the board): deep teal evening, cream paper, amber.
const INK = '#23323A';
const CREAM = '#FFF8EE';
const AMBER = '#FFB86B';
const RUST = '#C2652D';
const MIST = '#BFD6DE';
const GREEN = '#2F8F6A';

// Little aisle pictures for the section headings (flat, 32 x 32).
const AISLE_ART = {
  produce: `<path d="M12 12l6 16 6-16z" fill="#E5772F"/><path d="M18 12q-4-6 0-8M18 12q4-7 8-6" stroke="${C.green}" stroke-width="2.5" fill="none" stroke-linecap="round"/>`,
  meat: `<ellipse cx="14" cy="15" rx="8" ry="7" fill="${C.accentSoft}"/><path d="M19 19l6 6" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round"/><circle cx="26" cy="25" r="2.5" fill="#FFFFFF"/>`,
  seafood: `<ellipse cx="14" cy="16" rx="9" ry="6" fill="${C.blue}"/><path d="M22 16l6-5v10z" fill="${C.blue}"/><circle cx="10" cy="15" r="1.6" fill="#FFF"/>`,
  dairy: `<path d="M11 12l3-5h6l3 5v15H11z" fill="#FFF" stroke="${C.cloud}" stroke-width="1.5"/><rect x="11" y="17" width="12" height="6" fill="${C.sky}"/>`,
  bakery: `<path d="M5 20q0-10 13-10t13 10v4H5z" fill="#E2B067"/><path d="M12 13l-2 6M18 12l-1 7M24 13l1 6" stroke="#C98A3E" stroke-width="2" stroke-linecap="round"/>`,
  frozen: `<path d="M16 6v20M7 11l18 10M7 21l18-10" stroke="${C.blue}" stroke-width="2.5" stroke-linecap="round"/>`,
  canned: `<rect x="9" y="8" width="14" height="18" rx="2" fill="${C.cloudDark}"/><rect x="9" y="13" width="14" height="8" fill="${C.accent}"/><ellipse cx="16" cy="8" rx="7" ry="2" fill="${C.cloud}"/>`,
  pantry: `<rect x="9" y="11" width="14" height="16" rx="4" fill="${C.gold}"/><rect x="10" y="6" width="12" height="5" rx="1.5" fill="${C.accent}"/><rect x="12" y="16" width="8" height="6" rx="1" fill="#FFF"/>`,
  international: `<path d="M6 17h20q-1 9-10 9t-10-9z" fill="#FFF" stroke="${C.cloud}" stroke-width="1.5"/><path d="M14 4l6 13M20 4l2 13" stroke="${C.mustard}" stroke-width="2" stroke-linecap="round"/>`,
  spices: `<rect x="10" y="12" width="12" height="15" rx="3" fill="${C.accentSoft}"/><rect x="11" y="7" width="10" height="5" rx="1.5" fill="${C.ink3}"/><circle cx="14" cy="9.5" r=".9" fill="#FFF"/><circle cx="18" cy="9.5" r=".9" fill="#FFF"/>`,
  beverages: `<path d="M13 5h6v5l3 4v13H10V14l3-4z" fill="${C.green}"/><rect x="10" y="16" width="12" height="6" fill="${C.mint}"/>`,
  extra: '<rect x="8" y="6" width="16" height="21" rx="2" fill="#FCE7A6"/><path d="M11 12h10M11 16h10M11 20h6" stroke="#C9A64A" stroke-width="2" stroke-linecap="round"/>',
  other: '<path d="M8 12h16l-2 15H10z" fill="#D9B98C"/><path d="M12 12q0-6 4-6t4 6" stroke="#B8945F" stroke-width="2" fill="none"/>',
};
const aisleIcon = (id) => `<svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true" focusable="false" style="flex:none"><circle cx="16" cy="16" r="16" fill="#F1E4CF"/>${AISLE_ART[id] || AISLE_ART.other}</svg>`;
// A folded paper plane, nose to the right.
const plane = (w = 46, body = CREAM, fold = '#E4D8C6') => `<svg width="${w}" height="${Math.round(w * 0.5)}" viewBox="-20 -10 42 20" aria-hidden="true" focusable="false" style="display:block"><path d="M-18 -8L20 0L-18 8L-10 0Z" fill="${body}"/><path d="M-10 0L20 0L-18 8Z" fill="${fold}"/></svg>`;
const low = (s) => String(s || '').toLowerCase().trim();
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const STYLE = `
  <style>
    .sh{position:absolute;left:0;top:0;width:100%;height:100%;overflow:hidden;color:#FFFFFF;font-family:Inter,system-ui,sans-serif;
      background:radial-gradient(ellipse at 70% 20%,#2E5A6B 0%,#183846 45%,#0E222C 100%)}
    .sh-sky{position:absolute;left:0;top:0;width:100%;height:240px;pointer-events:none;opacity:.5;
      background:radial-gradient(circle at 12% 30%,#FFF 0,#FFF 1.5px,transparent 2px),radial-gradient(circle at 38% 12%,#FFF 0,#FFF 1px,transparent 2px),
        radial-gradient(circle at 58% 44%,#FFF 0,#FFF 1.5px,transparent 2px),radial-gradient(circle at 88% 20%,#FFF 0,#FFF 1px,transparent 2px),
        radial-gradient(circle at 72% 8%,#FFF 0,#FFF 1px,transparent 2px)}
    .sh-wrap{position:relative;height:100%;padding:28px 40px 32px;display:flex;flex-direction:column;gap:18px}
    .sh-stat{font:300 22px Outfit,system-ui,sans-serif;color:${MIST};white-space:nowrap;flex:none}
    .sh-stat b{font-weight:700;font-size:30px;color:#FFFFFF}
    .sh .x-btn.amber{background:${AMBER};color:${INK}}
    .sh-main{flex:1 1 0;min-height:0;display:flex;gap:28px}
    .sh-left{flex:1 1 0;min-width:0;display:flex;flex-direction:column;gap:14px;position:relative}
    .sh-right{flex:none;width:380px;display:flex;flex-direction:column;gap:16px;min-height:0}
    .sh-add{display:flex;gap:12px;margin:0;flex:none}
    .sh-in{flex:1;min-width:0;min-height:64px;border-radius:999px;border:0;box-shadow:inset 0 0 0 2px rgba(255,255,255,.3);background:rgba(8,20,26,.55);
      padding:0 28px;font:400 20px Inter,system-ui,sans-serif;color:#FFFFFF;outline:none}
    .sh-in::placeholder{color:#9DB7C0}
    .sh-in:focus{box-shadow:inset 0 0 0 2.5px ${AMBER}}
    .sh-quick{display:flex;flex-wrap:wrap;gap:10px;max-height:56px;overflow:hidden;flex:none}
    .sh-chip{min-height:56px;padding:0 20px;border-radius:999px;border:0;background:rgba(255,255,255,.12);color:#FFFFFF;font:600 18px Inter,system-ui,sans-serif;
      cursor:pointer;display:inline-flex;align-items:center;flex:none}
    .sh-chip.recent{box-shadow:inset 0 0 0 2px ${AMBER}}
    .sh-chip.paper{background:${CREAM};color:${INK}}
    .sh-note{flex:none;font-size:18px;line-height:1.35;color:${INK};background:${AMBER};border-radius:18px;padding:12px 18px;display:flex;align-items:center;gap:12px}
    .sh-body{flex:1 1 0;min-height:0}
    .sh-cols{column-count:2;column-gap:16px}
    .sh-sec{break-inside:avoid;-webkit-column-break-inside:avoid;background:${CREAM};color:${INK};border-radius:22px;padding:14px 16px 6px;margin-bottom:16px;display:inline-block;width:100%}
    .sh-sec.done{opacity:.62}
    .sh-h{display:flex;align-items:center;gap:10px;font:700 15px Inter,system-ui,sans-serif;letter-spacing:1.5px;text-transform:uppercase;color:${RUST};margin-bottom:4px}
    .sh-h .left{margin-left:auto;letter-spacing:0;text-transform:none;font-weight:600;font-size:16px;color:#6F7E85;white-space:nowrap}
    .sh-sec.done .sh-h .left{color:${GREEN}}
    .sh-row{display:flex;align-items:center;gap:12px;min-height:68px;border-top:1px solid #EADFCC;padding:6px 0;position:relative}
    .sh-row.first{border-top:0}
    .sh-tick{width:46px;height:46px;border-radius:13px;border:2.5px solid #9AAAB0;flex:none;display:flex;align-items:center;justify-content:center;color:#FFFFFF;
      font-size:27px;line-height:1;cursor:pointer;background:#FFFFFF}
    .sh-row.got .sh-tick{background:${GREEN};border-color:${GREEN}}
    .sh-txt{flex:1;min-width:0;cursor:pointer;min-height:56px;display:flex;flex-direction:column;justify-content:center}
    .sh-n{font-size:20px;font-weight:600;line-height:1.2;overflow-wrap:anywhere}
    .sh-nm{position:relative;display:inline}
    .sh-n::first-letter{text-transform:uppercase}
    .sh-a{font-size:15px;color:#5B6B73;line-height:1.3;margin-top:1px}
    .sh-row.got .sh-n{text-decoration:line-through;color:#8A979D}
    .sh-tag{display:inline-block;margin-left:8px;padding:2px 9px;border-radius:999px;background:${RUST};color:#FFFFFF;font-size:13px;font-weight:700;letter-spacing:.5px;vertical-align:3px;text-transform:uppercase;white-space:nowrap}
    .sh-row.got .sh-tag{display:none}
    .sh-have{min-height:56px;padding:0 16px;border-radius:999px;border:0;background:#F1E4CF;color:${INK};font:600 16px Inter,system-ui,sans-serif;cursor:pointer;flex:none}
    .sh-q{width:56px;height:56px;border-radius:50%;border:0;background:#F1E4CF;color:${INK};font:600 27px Inter,system-ui,sans-serif;cursor:pointer;flex:none;display:flex;align-items:center;justify-content:center}
    .sh-sub{font:700 15px Inter,system-ui,sans-serif;letter-spacing:1.5px;text-transform:uppercase;color:${MIST}}
    .sh-week{display:flex;align-items:center;gap:14px;background:rgba(255,255,255,.1);border-radius:22px;padding:10px 12px 10px 22px;margin-bottom:16px;font-size:18px;line-height:1.3}
    .sh-week span{flex:1}
    .sh-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;text-align:center;min-height:100%;padding:12px 24px}
    .sh-empty .big{font:500 34px Outfit,system-ui,sans-serif}
    .sh-empty .say{font-size:19px;line-height:1.45;color:${MIST};max-width:600px}
    .sh [data-codebox] .x-code-sub{display:none}
    .sh-bob{will-change:transform;animation:sh-bob 6s ease-in-out infinite}
    .sh-toast{position:absolute;left:50%;bottom:6px;transform:translateX(-50%);z-index:5;display:flex;align-items:center;gap:18px;background:${CREAM};color:${INK};
      border-radius:999px;padding:8px 8px 8px 26px;font-size:18px;box-shadow:0 10px 24px rgba(0,0,0,.4);max-width:720px;min-height:72px}
    .sh-toast span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
    .sh-who{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .sh-who.one{grid-template-columns:1fr}
    .sh-p{min-height:64px;border-radius:20px;border:0;background:rgba(255,255,255,.1);color:#FFFFFF;font:500 20px Inter,system-ui,sans-serif;cursor:pointer;
      display:flex;align-items:center;gap:10px;padding:0 12px 0 10px;min-width:0;text-align:left}
    .sh-who.many .sh-p{min-height:56px;font-size:18px}
    .sh-p .nm{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .sh-p.on{background:${AMBER};color:${INK};font-weight:600}
    .sh-air{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;overflow:hidden;z-index:6}
    .sh-plane{position:absolute;left:0;top:0;will-change:transform;opacity:0;animation:sh-across 1.5s linear both}
    .sh-plane i{display:block;will-change:transform;animation:sh-arc 1.5s linear both}
    .sh-plane.back svg{transform:scaleX(-1)}
    .sh-row.pop .sh-tick{animation:sh-pop .45s ease-out both}
    .sh-row.phoned .sh-tick{animation:sh-pop .7s ease-out .9s both}
    .sh-row.phoned .sh-nm::after{content:"";position:absolute;left:-2px;right:-2px;top:11px;height:3px;border-radius:2px;background:${RUST};transform-origin:left center;animation:sh-strike 1.6s ease-out .9s both}
    .sh-row.landed{animation:sh-land .6s ease-out 1s both}
    @keyframes sh-bob{0%,100%{transform:translate3d(0,0,0)}50%{transform:translate3d(0,-6px,0)}}
    @keyframes sh-pop{0%{transform:scale(.3)}60%{transform:scale(1.25)}100%{transform:scale(1)}}
    @keyframes sh-strike{0%{transform:scaleX(0);opacity:1}45%{transform:scaleX(1);opacity:1}100%{transform:scaleX(1);opacity:0}}
    @keyframes sh-land{0%{transform:translate3d(60px,0,0);opacity:0}100%{transform:translate3d(0,0,0);opacity:1}}
    @keyframes sh-across{0%{transform:translate3d(var(--x0),var(--y0),0);opacity:0}12%{opacity:1}88%{opacity:1}100%{transform:translate3d(var(--x1),var(--y0),0);opacity:0}}
    @keyframes sh-arc{0%{transform:translate3d(0,0,0) rotate(var(--r0));animation-timing-function:ease-out}
      50%{transform:translate3d(0,var(--peak),0) rotate(0deg);animation-timing-function:ease-in}
      100%{transform:translate3d(0,var(--dy),0) rotate(var(--r1))}}
    @media (prefers-reduced-motion: reduce){
      .sh-bob,.sh-row.pop .sh-tick,.sh-row.phoned .sh-tick,.sh-row.landed{animation:none}
      .sh-plane,.sh-row.phoned .sh-nm::after{display:none}
    }
  </style>`;

export function mount(el) {
  el.innerHTML = `${STYLE}
  <div class="sh" data-root>
    <div class="sh-sky" aria-hidden="true"></div>
    <div class="sh-wrap">
      ${topBar({
        title: 'Shopping list',
        right: '<div class="sh-stat" data-stat></div><span data-clearslot style="flex:none;display:flex"></span>',
      })}
      <div class="sh-main">
        <div class="sh-left">
          <form data-addform class="sh-add">
            <input data-addtext class="sh-in" maxlength="60" placeholder="Add something" autocomplete="off" aria-label="Add to the shopping list">
            <button class="x-btn amber" type="submit">Add</button>
          </form>
          <div data-quick class="sh-quick" aria-label="Quick add"></div>
          <div data-note></div>
          <div data-body class="x-scroll sh-body"><div class="sh-empty"><div class="say">Building your list…</div></div></div>
          <div data-toast></div>
        </div>
        <div class="sh-right">
          <div data-codebox>${phoneCode({
            tab: 'shopping', size: 190, column: true,
            title: 'Take the list with you',
          })}</div>
          <div data-who style="display:flex;flex-direction:column;gap:12px;min-height:0"></div>
        </div>
      </div>
    </div>
    <div class="sh-air" data-air aria-hidden="true"></div>
  </div>`;
  const root = el.querySelector('[data-root]');
  const $ = (sel) => root.querySelector(sel);
  const body = $('[data-body]');
  let drawing = false;
  let note = ''; // e.g. "Milk is already on the list"
  let noteTimer;
  let clearArmed = false; // "Done shopping" needs a second tap
  let clearTimer;
  let toast = null; // { text, snap }: something just came off the list; Undo puts it back
  let toastTimer;
  let fresh = null; // planned items new since the list was last looked at (this visit)
  const fromPhone = {}; // rows a phone added during this visit ("From a phone")
  let flash = { land: {}, tick: {}, pop: {} }; // rows to animate on the next draw only
  const airTimers = [];

  // ---- paper planes -------------------------------------------------------------
  // Where something is on the 1280 x 800 canvas (the whole screen may be scaled to fit).
  function spotOf(node) {
    const r = root.getBoundingClientRect();
    const k = r.width ? 1280 / r.width : 1;
    const b = node.getBoundingClientRect();
    return { x: (b.left - r.left) * k, y: (b.top - r.top) * k, w: b.width * k, h: b.height * k };
  }
  function fly(from, to, { back = false, delay = 0, gold = false } = {}) {
    const air = $('[data-air]');
    if (!air || air.children.length > 8) return;
    const p = document.createElement('div');
    p.className = `sh-plane${back ? ' back' : ''}`;
    const peak = -Math.max(90, Math.min(190, Math.abs(to.x - from.x) * 0.28));
    p.style.cssText = `--x0:${Math.round(from.x)}px;--x1:${Math.round(to.x)}px;--y0:${Math.round(from.y)}px;--dy:${Math.round(to.y - from.y)}px;`
      + `--peak:${Math.round(Math.min(peak, to.y - from.y - 40))}px;--r0:${back ? 28 : -28}deg;--r1:${back ? -24 : 24}deg;animation-delay:${delay}ms`;
    p.innerHTML = `<i style="animation-delay:${delay}ms">${gold ? plane(40, AMBER, '#E89A45') : plane(46)}</i>`;
    air.appendChild(p);
    airTimers.push(setTimeout(() => { if (p.parentNode) p.parentNode.removeChild(p); }, delay + 1700));
  }
  const codeSpot = () => { const c = spotOf($('[data-codebox]')); return { x: c.x + c.w / 2 - 23, y: c.y + 110 }; };
  // The list "takes off" towards the phone code: somebody said they're going.
  function flyOut() {
    const l = spotOf(body);
    const to = codeSpot();
    [0, 260, 520].forEach((delay, i) => fly({ x: l.x + l.w * 0.55, y: l.y + 60 + i * 26 }, to, { delay, gold: i === 2 }));
  }
  // Something a phone did lands on its row.
  function flyTo(row) {
    const b = spotOf(body);
    const r = spotOf(row);
    const y = Math.max(b.y, Math.min(b.y + b.h - 30, r.y + r.h / 2 - 12));
    fly(codeSpot(), { x: r.x + 60, y }, { back: true });
  }

  // ---- the list -------------------------------------------------------------------
  // Ticked-off things sink to the bottom of their aisle, so what's left to get is on top.
  const byGot = (list) => list.filter((x) => !x.got).concat(list.filter((x) => x.got));
  // Aisle card with a "3 left" / "All got" count; cards that are all ticked fade back.
  const section = (id, title, items, rowsHtml) => {
    const n = items.filter((x) => !x.got).length;
    return `<div class="sh-sec${n ? '' : ' done'}"><div class="sh-h">${aisleIcon(id)}<span>${esc(title)}</span><span class="left">${n ? `${n} left` : '✓ All got'}</span></div>${rowsHtml}</div>`;
  };

  const row = (x, i) => {
    const extra = x.kind === 'extra';
    const id = `${x.kind}:${x.key}`;
    const cls = `${x.got ? ' got' : ''}${i ? '' : ' first'}${flash.tick[id] ? ' phoned' : ''}${flash.pop[id] ? ' pop' : ''}${flash.land[id] ? ' landed' : ''}`;
    const tag = x.isNew ? '<span class="sh-tag">New</span>' : fromPhone[id] ? '<span class="sh-tag">From a phone</span>' : '';
    return `
    <div class="sh-row${cls}" data-row="${esc(id)}">
      <div class="sh-tick" data-tick="${esc(x.key)}" data-kind="${x.kind}" role="checkbox" aria-checked="${x.got ? 'true' : 'false'}" aria-label="${esc(x.name)}">${x.got ? '✓' : ''}</div>
      <div class="sh-txt" data-tick="${esc(x.key)}" data-kind="${x.kind}">
        <div class="sh-n"><span class="sh-nm">${esc(x.name)}</span>${tag}</div>
        ${x.sub ? `<div class="sh-a">${esc(x.sub)}</div>` : ''}
      </div>
      ${extra
        ? `<button class="sh-q" data-less="${esc(x.key)}" aria-label="${x.qty > 1 ? 'One fewer' : 'Take off the list'}">${x.qty > 1 ? '−' : '×'}</button><button class="sh-q" data-more="${esc(x.key)}" aria-label="One more">+</button>`
        : x.got ? '' : `<button class="sh-have" data-have="${esc(x.key)}">Have it</button>`}
    </div>`;
  };

  // Planned items and your own items together, by aisle; finished aisles go to the end.
  function aisles(list) {
    const by = {};
    const put = (aisle, item) => { (by[aisle] || (by[aisle] = [])).push(item); };
    list.sections.forEach((s) => s.items.forEach((x) => put(s.id, {
      kind: 'item', key: x.key, name: x.name, sub: x.amount || '', got: x.got,
      isNew: !!(fresh && fresh.indexOf(x.key) >= 0),
    })));
    list.extras.forEach((x) => put(guessAisle(x.text), {
      kind: 'extra', key: x.id, name: extraText(x), sub: '', got: x.got, qty: x.qty || 1,
    }));
    const names = {};
    AISLE_NAMES.forEach(([id, name]) => { names[id] = name; });
    const order = AISLE_NAMES.map((x) => x[0]).concat(['other']);
    const out = order.filter((id) => by[id]).map((id) => ({
      id, name: id === 'other' ? 'Other things' : names[id],
      items: by[id].slice().sort((p, q) => low(p.name.replace(/^\d+ × /, '')).localeCompare(low(q.name.replace(/^\d+ × /, '')))),
    }));
    return out.filter((s) => s.items.some((x) => !x.got)).concat(out.filter((s) => !s.items.some((x) => !x.got)));
  }

  // Quick buttons: things added lately first, then everyday items; none already on the list.
  function quick(list) {
    const on = {};
    list.extras.forEach((x) => { if (!x.got) on[low(x.text)] = 1; });
    list.sections.forEach((s) => s.items.forEach((x) => { if (!x.got) on[low(x.name)] = 1; }));
    const out = [];
    const seen = {};
    recentExtras().forEach((t) => { const k = low(t); if (!on[k] && !seen[k]) { seen[k] = 1; out.push({ t, recent: true }); } });
    COMMON_ITEMS.forEach((t) => { const k = low(t); if (!on[k] && !seen[k]) { seen[k] = 1; out.push({ t }); } });
    return out.slice(0, 12);
  }

  // "Who's going to the store?": the household's names. Only a note on this screen.
  function drawWho() {
    const box = $('[data-who]');
    const ppl = people();
    const going = getGoing();
    const on = going ? low(going.name) : '';
    box.innerHTML = `
      ${ppl.length ? `<div class="sh-sub" style="display:flex;align-items:center;gap:10px"><span class="sh-bob">${plane(34)}</span>Who’s going?</div>
      <div class="sh-who x-scroll${ppl.length > 4 ? ' many' : ''}${ppl.length === 1 ? ' one' : ''}">
        ${ppl.map((p) => `<button class="sh-p${low(p.name) === on ? ' on' : ''}" data-going="${esc(p.name)}" aria-pressed="${low(p.name) === on ? 'true' : 'false'}">${avatar(p.name, ppl.length > 4 ? 40 : 44)}<span class="nm">${esc(p.name)}</span>${low(p.name) === on ? '<span aria-hidden="true">✓</span>' : ''}</button>`).join('')}
      </div>` : ''}`;
  }

  let again = false;
  async function render() {
    if (drawing) { again = true; return; } // redraw once more when this one finishes
    drawing = true;
    try {
      const list = await buildShoppingList();
      if (!el.isConnected) return;
      // What the week plan added since the list was last opened (first visit: nothing is "new").
      if (fresh === null) {
        const keys = [];
        list.sections.forEach((s) => s.items.forEach((x) => keys.push(x.key)));
        const seen = listSeen();
        fresh = seen ? keys.filter((k) => seen.indexOf(k) < 0) : [];
        setListSeen(keys);
        const names = [];
        list.sections.forEach((s) => s.items.forEach((x) => { if (fresh.indexOf(x.key) >= 0 && !x.got) names.push(x.name); }));
        if (names.length) say(`New from the week plan: ${names.slice(0, 4).join(', ')}${names.length > 4 ? ` and ${names.length - 4} more` : ''}.`, 9000, false);
      }
      const scrollTop = body.scrollTop;
      const all = list.sections.reduce((n, s) => n + s.items.length, 0) + list.extras.length;
      const left = list.sections.reduce((n, s) => n + s.items.filter((x) => !x.got).length, 0) + list.extras.filter((x) => !x.got).length;
      const anyGot = left < all;
      const empty = !list.recipes && !list.extras.length;
      const chips = quick(list);
      const now = flash;

      $('[data-stat]').innerHTML = all ? (left ? `<b>${left}</b> to get` : '<b>Got everything!</b>') : '';
      $('[data-clearslot]').innerHTML = anyGot ? `<button data-clear class="x-btn sm ${clearArmed ? 'amber' : 'frost'}">${clearArmed ? 'Tap again to clear' : 'Done shopping'}</button>` : '';
      const q = $('[data-quick]');
      q.style.display = chips.length ? '' : 'none';
      q.innerHTML = chips.map((c) => `<button class="sh-chip${c.recent ? ' recent' : ''}" data-quick="${esc(c.t)}">+ ${esc(cap(c.t))}</button>`).join('');
      $('[data-note]').innerHTML = note ? `<div class="sh-note">${note.phone ? `<span style="flex:none">${plane(34, INK, '#3F545E')}</span>` : ''}<span>${esc(note.text)}</span></div>` : '';

      body.innerHTML = `
        ${list.next || list.nextRecipes ? `<div class="sh-week"><span>${list.next
          ? `With next week’s ${list.nextRecipes} meal${list.nextRecipes === 1 ? '' : 's'}`
          : `Next week: ${list.nextRecipes} meal${list.nextRecipes === 1 ? '' : 's'}`}</span>
          <button class="x-btn sm ${list.next ? 'frost' : 'amber'}" data-nextweek="${list.next ? '0' : '1'}">${list.next ? 'This week only' : 'Add to list'}</button></div>` : ''}
        ${empty ? `
          <div class="sh-empty">
            <div class="sh-bob">${plane(150)}</div>
            <div class="big">The list is empty.</div>
            <a href="#/plan" class="x-btn amber">Plan meals</a>
          </div>` : `
        <div class="sh-cols">
          ${aisles(list).map((s) => section(s.id, s.name, s.items, byGot(s.items).map(row).join(''))).join('')}
        </div>
        ${list.have.length ? `
          <div style="margin-top:4px;display:flex;flex-direction:column;gap:12px">
            <div class="sh-sub">Already have</div>
            <div style="display:flex;flex-wrap:wrap;gap:10px">
              ${list.have.map((x) => `<button class="sh-chip" data-need="${esc(x.key)}">+ ${esc(cap(x.name))}</button>`).join('')}
            </div>
          </div>` : ''}
        ${list.missing ? `<div style="font-size:17px;margin-top:14px;color:${MIST}">${list.missing} planned recipe${list.missing > 1 ? 's' : ''} couldn’t load.</div>` : ''}`}
        ${toast ? '<div style="height:96px"></div>' : ''}`;
      body.scrollTop = scrollTop;
      $('[data-toast]').innerHTML = toast ? `<div class="sh-toast"><span>${esc(toast.text)}</span><button class="x-btn ink sm" data-undo>Undo</button></div>` : '';
      drawWho();

      // A plane for each thing a phone just did (the row is scrolled into view first).
      flash = { land: {}, tick: {}, pop: {} };
      const landed = Object.keys(now.land).concat(Object.keys(now.tick));
      if (landed.length) {
        const rows = [].filter.call(body.querySelectorAll('[data-row]'), (r) => landed.indexOf(r.dataset.row) >= 0).slice(0, 3);
        if (rows[0] && rows[0].scrollIntoView) { try { rows[0].scrollIntoView({ block: 'nearest' }); } catch (e) { /* old engine: leave it */ } }
        rows.forEach(flyTo);
      }
    } finally {
      drawing = false;
      if (again && el.isConnected) { again = false; render(); }
    }
  }

  // Something came off the list: a few seconds to take it back.
  function offered(text, snap) {
    toast = { text, snap };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast = null; if (el.isConnected) render(); }, 8000);
  }
  async function nameOf(kind, key) {
    const l = await buildShoppingList();
    if (kind === 'extra') { const x = l.extras.find((e) => e.id === key); return x ? x.text : 'that'; }
    let n = key;
    l.sections.forEach((s) => s.items.forEach((x) => { if (x.key === key) n = x.name; }));
    return n;
  }
  function say(text, ms = 5000, phone = false) {
    note = text ? { text, phone } : '';
    clearTimeout(noteTimer);
    if (text) noteTimer = setTimeout(() => { note = ''; if (el.isConnected) render(); }, ms);
  }

  root.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-tick],[data-have],[data-need],[data-less],[data-more],[data-clear],[data-quick],[data-undo],[data-nextweek],[data-going]');
    if (!t) return;
    if (t.dataset.tick) {
      const done = !t.closest('.sh-row').classList.contains('got');
      if (done) flash.pop[`${t.dataset.kind}:${t.dataset.tick}`] = 1;
      if (t.dataset.kind === 'extra') setExtraGot(t.dataset.tick, done); else setGot(t.dataset.tick, done);
    } else if (t.dataset.have) {
      const snap = listSnapshot();
      offered(`${cap(await nameOf('item', t.dataset.have))} moved to Already have`, snap);
      setHave(t.dataset.have, true);
    } else if (t.dataset.need) setHave(t.dataset.need, false);
    else if (t.dataset.more || t.dataset.less) {
      const id = t.dataset.more || t.dataset.less;
      const l = await buildShoppingList();
      const x = l.extras.find((z) => z.id === id);
      if (!x) return;
      const n = (x.qty || 1) + (t.dataset.more ? 1 : -1);
      if (n >= 1) { setExtraQty(id, n); return; }
      offered(`Took ${x.text} off the list`, listSnapshot());
      removeExtra(id);
    } else if (t.dataset.quick) {
      const what = addExtra(t.dataset.quick);
      if (what === 'there') say(`${cap(t.dataset.quick)} is already on the list.`);
      else if (what === 'back') say(`${cap(t.dataset.quick)} is back on the list.`);
      else if (what === 'added') say(`Added ${t.dataset.quick.toLowerCase()}.`);
      else if (what === 'unsaved') say('Storage is full: not added.');
      if (what === 'there' || what === 'unsaved') render();
    } else if (t.dataset.nextweek) {
      const on = t.dataset.nextweek === '1';
      const before = await buildShoppingList();
      const keys = {};
      before.sections.forEach((s) => s.items.forEach((x) => { keys[x.key] = 1; }));
      setListNextWeek(on);
      if (!on) { say('The list is back to this week’s meals.'); return; }
      // Say what came onto the list (things already there just get the bigger amount, never a second line).
      const after = await buildShoppingList();
      const names = [];
      after.sections.forEach((s) => s.items.forEach((x) => { if (!keys[x.key] && !x.got) names.push(x.name); }));
      if (!el.isConnected) return;
      say(names.length
        ? `Added for next week: ${names.slice(0, 5).join(', ')}${names.length > 5 ? ` and ${names.length - 5} more` : ''}.`
        : 'Next week needs nothing new.', 10000);
      render();
    } else if (t.matches('[data-undo]')) {
      const u = toast;
      toast = null;
      clearTimeout(toastTimer);
      if (u && u.snap) restoreList(u.snap); else render();
    } else if (t.matches('[data-clear]')) {
      clearTimeout(clearTimer);
      if (clearArmed) {
        clearArmed = false;
        offered('Cleared the ticked things', listSnapshot());
        if (getGoing()) setGoing(null); // the trip is over
        clearChecked();
        return;
      }
      clearArmed = true; // a stray tap shouldn't wipe the ticks
      clearTimer = setTimeout(() => { clearArmed = false; if (el.isConnected) render(); }, 4000);
      render();
    } else if (t.dataset.going) {
      const g = getGoing();
      if (g && low(g.name) === low(t.dataset.going)) { setGoing(null); return; } // tap again: nobody
      setGoing(t.dataset.going);
      flyOut();
    }
  });
  root.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('[data-addtext]');
    const text = input.value.trim();
    if (!text) return;
    input.value = ''; // the box stays where it is, keyboard up, for adding several things in a row
    const what = addExtra(text);
    const p = splitQty(text);
    const name = cap(p.text);
    if (what === 'there') say(`${name} is already on the list.`);
    else if (what === 'more') say(`More ${p.text.toLowerCase()} on the list.`);
    else if (what === 'back') say(`${name} is back on the list.`);
    else if (what === 'unsaved') say('Storage is full: not added.');
    else say('');
    render();
  });

  off = onKitchenChanged(() => { if (el.isConnected) render(); });
  offFamily = onFamilyChanged(() => { if (el.isConnected) drawWho(); });
  // A phone changed the list: say so, and let a plane land on the row.
  offPhone = onPhoneChange((c) => {
    if (!el.isConnected) return;
    const id = `${c.kind}:${c.key}`;
    const name = cap(String(c.name || 'something'));
    if (c.act === 'add') {
      if (c.result === 'there' || !c.result) return;
      if (c.kind === 'extra') fromPhone[id] = 1;
      flash.land[id] = 1;
      say(`${name}: added from a phone.`, 7000, true);
    } else if (c.act === 'got') {
      if (c.got) flash.tick[id] = 1;
      say(c.got ? `${name}: ticked off on a phone.` : `${name}: put back on the list on a phone.`, 7000, true);
    } else if (c.act === 'remove') say(`${name}: taken off the list on a phone.`, 7000, true);
    render();
  });
  stopCodes = wirePhoneCodes(root);
  stopTimers = () => { clearTimeout(noteTimer); clearTimeout(clearTimer); clearTimeout(toastTimer); airTimers.forEach(clearTimeout); };
  render().catch((err) => {
    console.error(err);
    body.innerHTML = '<div class="sh-empty"><div class="say">Couldn’t build the list. Check the Wi-Fi.</div></div>';
  });
}

export function unmount() {
  if (off) off();
  off = null;
  if (offPhone) offPhone();
  offPhone = null;
  if (offFamily) offFamily();
  offFamily = null;
  if (stopCodes) stopCodes();
  stopCodes = null;
  if (stopTimers) stopTimers();
  stopTimers = null;
}
