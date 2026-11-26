// Date night: a glass jar of folded slips under a string of lights.
//   #/datenight        the jar: Where and Cost switches, "Pick one" (or tap the jar), the date nights lately
//   #/datenight/pick   straight to a slip pulled out (the menu card's button)
//   #/datenight/all    every idea in the jar: tap one to read it, ✕ takes it out (Undo)
//   #/datenight/add    the "New idea" sheet, typed on the screen's own keyboard
// A pulled slip unfolds into a paper card: "Put it on the calendar" saves a real event on the
// next free evening (services/datenight-data.js), "Pick again" pulls another.
import { topBar, esc } from './ui.js';
import { openKeyboard, keyboardStyle } from './keyboard.js';
import * as jar from '../services/datenight-data.js';

const PINK = '#F4A3B4';
const PLUM = '#3A1526';
const ICON = {
  home: (c) => `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/></svg>`,
  pin: (c) => `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>`,
  spark: `<svg width="38" height="38" viewBox="0 0 24 24" fill="${PLUM}" aria-hidden="true"><path d="M12 2l2.2 6.3L20.5 10l-6.3 2.2L12 18.5l-2.2-6.3L3.5 10l6.3-1.7z"/><path d="M19 15l.9 2.4 2.4.9-2.4.9L19 21.6l-.9-2.4-2.4-.9 2.4-.9z"/></svg>`,
  cal: (c) => `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>`,
  again: `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.5-4.6L4 8"/><path d="M4 3v5h5"/><path d="M4 13a8 8 0 0 0 14.5 4.6L20 16"/><path d="M20 21v-5h-5"/></svg>`,
};
const WHERE = { in: 'Stay in', out: 'Go out' };
const COST = { cheap: 'Cheap', fancy: 'Fancy' };
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// The string of lights along the top: one sagging wire, seventeen bulbs.
function stringLights() {
  let bulbs = '';
  for (let x = 40; x < 1280; x += 74) {
    const t = (x + 10) / 1300;
    const y = (92 + 88 * t * (1 - t) + 2.7).toFixed(1);
    bulbs += `<circle cx="${x}" cy="${+y + 8}" r="20" fill="url(#dnBulb)"/><rect x="${x - 3}" y="${(+y - 2).toFixed(1)}" width="6" height="5" fill="#3A2A20"/><ellipse cx="${x}" cy="${(+y + 9).toFixed(1)}" rx="5" ry="7" fill="#FFE6A8"/>`;
  }
  return `<svg class="dn-lights" width="1280" height="194" viewBox="0 0 1280 194" aria-hidden="true"><defs><radialGradient id="dnBulb"><stop offset="0" stop-color="#FFD98A" stop-opacity=".55"/><stop offset="1" stop-color="#FFD98A" stop-opacity="0"/></radialGradient></defs>
    <path d="M-10 92 Q640 136 1290 92" fill="none" stroke="rgba(30,15,20,.9)" stroke-width="2"/>${bulbs}</svg>`;
}

const STYLE = `
  .dn{position:absolute;left:0;top:0;width:1280px;height:800px;overflow:hidden;font-family:Inter,system-ui,sans-serif;color:#FFF3EC;
    background:radial-gradient(ellipse 820px 620px at 30% 58%,#7A2E45 0%,#44182C 46%,#1F0A15 100%)}
  .dn button{font-family:inherit;border:0;cursor:pointer;-webkit-tap-highlight-color:transparent}
  .dn-lights{position:absolute;left:0;top:0;pointer-events:none}
  .dn-top{position:absolute;left:40px;right:40px;top:24px;z-index:2}
  .dn-top .x-title{font-weight:600;margin-left:8px}
  .dn-add{min-height:64px;padding:0 28px;border-radius:999px;background:${PINK};color:${PLUM};font:700 20px Inter,sans-serif;white-space:nowrap;flex:none}
  .dn-glow{position:absolute;left:60px;top:150px;width:560px;height:560px;border-radius:50%;pointer-events:none;
    background:radial-gradient(closest-side,rgba(255,200,120,.34),rgba(255,170,120,.10) 60%,rgba(255,170,120,0))}
  .dn-jar{position:absolute;left:140px;top:136px;padding:0;background:none;transform-origin:50% 90%}
  .dn-jar.shake{animation:dn-shake .4s ease-in-out 1}
  @keyframes dn-shake{0%,100%{transform:rotate(0)}20%{transform:rotate(-5deg)}45%{transform:rotate(4deg)}70%{transform:rotate(-3deg)}88%{transform:rotate(1.5deg)}}
  .dn-col{position:absolute;left:680px;top:150px;width:560px}
  .dn-lab{font:600 16px Inter,sans-serif;letter-spacing:1.6px;color:#F0BFCB;margin:26px 0 10px 6px}
  .dn-lab:first-child{margin-top:0}
  .dn-seg{display:flex;height:72px;border-radius:22px;background:rgba(20,6,12,.45);border:2px solid rgba(255,255,255,.16);padding:5px;box-sizing:border-box}
  .dn-seg button{flex:1;margin-right:5px;border-radius:16px;display:flex;align-items:center;justify-content:center;font:600 21px Inter,sans-serif;white-space:nowrap;background:none;color:#FFE7EC}
  .dn-seg button:last-child{margin-right:0}
  .dn-seg button svg{margin-right:10px}
  .dn-seg button.on{background:#FFF3EC;color:${PLUM}}
  .dn-seg button.on svg{stroke:${PLUM}}
  .dn-pick{margin-top:34px;width:100%;height:104px;border-radius:28px;background:linear-gradient(180deg,#FFC2CE,#F08EA3);color:${PLUM};display:flex;align-items:center;justify-content:center;
    box-shadow:0 6px 14px rgba(0,0,0,.35);text-align:left}
  .dn-pick svg{margin-right:16px}
  .dn-pick[disabled]{opacity:.5}
  .dn-pick-t{font:700 34px/1 Outfit,sans-serif}
  .dn-pick-n{font:600 17px Inter,sans-serif;opacity:.75;margin-top:6px}
  .dn-dates{display:flex}
  .dn-date{flex:1;min-width:0;margin-right:10px;border-radius:16px;background:rgba(255,243,236,.10);border:1.5px solid rgba(255,255,255,.14);padding:12px 14px;box-sizing:border-box;
    text-decoration:none;color:#FFF3EC;display:block;min-height:70px}
  .dn-date:last-child{margin-right:0}
  .dn-date.next{border-color:${PINK};background:rgba(244,163,180,.16)}
  .dn-date b{display:block;font:600 15px Inter,sans-serif;color:#F0BFCB}
  .dn-date span{display:block;font:600 18px Inter,sans-serif;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .dn-empty{position:absolute;left:680px;top:300px;width:560px}
  .dn-empty-line{font-size:34px;line-height:1.25;margin-bottom:28px}

  .dn-glow2{position:absolute;left:-40px;top:230px;width:520px;height:520px;border-radius:50%;pointer-events:none;
    background:radial-gradient(closest-side,rgba(255,200,120,.34),rgba(255,170,120,.10) 60%,rgba(255,170,120,0))}
  .dn-open{position:absolute;left:40px;top:300px;transform:rotate(-8deg);transform-origin:50% 100%;opacity:.92;pointer-events:none}
  .dn-lid{position:absolute;left:250px;top:712px;pointer-events:none}
  .dn-slip{position:absolute;left:430px;top:92px;width:790px;height:470px;transform:rotate(-1.5deg);border-radius:10px;
    background:linear-gradient(180deg,#FFEEDD 0%,#FFE6D2 49.6%,#F3D6BF 50%,#FFE9D8 52%,#FFEEDF 100%);box-shadow:0 10px 22px rgba(0,0,0,.4);color:#3A1A10}
  .dn-slip.pull{animation:dn-pull .4s cubic-bezier(.2,.8,.2,1) 1 both}
  @keyframes dn-pull{0%{transform:translate(-360px,260px) rotate(-14deg) scale(.18);opacity:0}55%{opacity:1}100%{transform:rotate(-1.5deg);opacity:1}}
  .dn-slip-in{position:absolute;left:52px;right:52px;top:50px}
  .dn-by{font:600 18px Inter,sans-serif;color:#9A5A48;min-height:34px;display:flex;align-items:center}
  .dn-title{font:700 60px/1.05 Outfit,sans-serif;margin-top:22px}
  .dn-title.long{font-size:46px}
  .dn-note{font:italic 500 29px/1.35 Fraunces,Georgia,serif;color:#6A3424;margin-top:18px;max-width:640px}
  .dn-chips{position:absolute;left:52px;bottom:44px;display:flex}
  .dn-chip{min-height:48px;padding:0 18px;margin-right:12px;border-radius:999px;background:#F6DCCB;color:#5A2A1A;display:inline-flex;align-items:center;font:600 19px Inter,sans-serif;white-space:nowrap}
  .dn-chip svg{margin-right:8px}
  .dn-acts{position:absolute;left:430px;right:40px;top:596px;display:flex}
  .dn-act{height:96px;border-radius:28px;display:flex;align-items:center;justify-content:center;text-decoration:none;box-sizing:border-box;white-space:nowrap}
  .dn-act svg{margin-right:14px;flex:none}
  .dn-act.main{flex:1.45;margin-right:18px;background:linear-gradient(180deg,#FFC2CE,#F08EA3);color:${PLUM};font:700 30px Outfit,sans-serif;box-shadow:0 6px 14px rgba(0,0,0,.35)}
  .dn-act.side{flex:1;background:rgba(20,6,12,.45);border:2px solid rgba(255,255,255,.3) !important;color:#FFFFFF;font:600 28px Outfit,sans-serif}
  .dn-act.when{flex:1.45;margin-right:18px;background:rgba(244,163,180,.16);border:2px solid ${PINK};color:#FFF3EC;font:600 28px Outfit,sans-serif}
  .dn-act.side + .dn-act.side{margin-left:18px;flex:.6}

  .dn-list{position:absolute;left:40px;right:40px;top:150px;bottom:0;overflow-y:auto;-webkit-overflow-scrolling:touch;padding-bottom:110px;box-sizing:border-box;
    display:flex;flex-wrap:wrap;align-content:flex-start;justify-content:space-between}
  .dn-row{width:592px;height:76px;margin-bottom:12px;border-radius:20px;background:rgba(20,6,12,.45);border:1.5px solid rgba(255,255,255,.14);box-sizing:border-box;display:flex;align-items:center}
  .dn-row-open{flex:1;min-width:0;height:100%;padding:0 0 0 22px;background:none;color:#FFF3EC;text-align:left}
  .dn-row-open b{display:block;font:600 21px Inter,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .dn-row-open span{display:block;font:500 15px Inter,sans-serif;color:#F0BFCB;margin-top:3px}
  .dn-row-btn{flex:none;height:60px;min-width:60px;padding:0 14px;margin-right:6px;border-radius:16px;background:none;color:#F0BFCB;font:600 17px Inter,sans-serif}
  .dn-row-btn.x{font-size:24px}

  .dn-shade{position:absolute;left:0;top:0;width:100%;height:100%;background:rgba(20,6,12,.5);z-index:6}
  .dn-sheet{position:absolute;left:190px;top:18px;width:900px;height:318px;border-radius:30px;background:#FFF3EA;color:${PLUM};box-shadow:0 10px 24px rgba(0,0,0,.45);overflow:hidden;z-index:7}
  .dn-sheet-top{display:flex;align-items:center;height:72px;padding:0 12px;border-bottom:2px solid #F0DCCF}
  .dn-cancel{min-height:56px;min-width:110px;background:none;font:600 20px Inter,sans-serif;color:#8A5A4A}
  .dn-sheet-name{flex:1;text-align:center;font:600 24px Outfit,sans-serif;margin-right:110px}
  .dn-box{margin:18px 22px 0;height:80px;border-radius:20px;background:#FFFFFF;border:3px solid #F08EA3;box-sizing:border-box;display:flex;align-items:center;padding:0 24px;
    font:600 30px Outfit,sans-serif;white-space:pre;overflow:hidden}
  .dn-box i{flex:none;width:3px;height:36px;background:#D2445E;margin-left:2px}
  .dn-sw{display:flex;margin:18px 22px 0}
  .dn-two{flex:1;display:flex;height:64px;border-radius:18px;background:#F6DCCB;padding:4px;box-sizing:border-box}
  .dn-two:first-child{margin-right:16px}
  .dn-two button{flex:1;border-radius:14px;font:600 20px Inter,sans-serif;white-space:nowrap;background:none;color:#6A3424}
  .dn-two button.on{background:${PLUM};color:#FFF3EC}
  ${keyboardStyle({ panel: '#10222C', key: '#FFF5E9', ink: '#23323A', fn: '#3A4E58', sug: '#2E3F48', go: PINK, goInk: PLUM, space: '#8A8F93', line: 'rgba(255,255,255,.4)' })}

  .dn-toast{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);z-index:5;display:flex;align-items:center;background:#FFF3EA;color:${PLUM};
    border-radius:999px;padding:8px 8px 8px 26px;font:600 18px Inter,sans-serif;box-shadow:0 6px 14px rgba(0,0,0,.4);max-width:720px;min-height:72px;box-sizing:border-box}
  .dn-toast span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;margin-right:18px}
  @media (prefers-reduced-motion: reduce){.dn-jar.shake,.dn-slip.pull{animation:none}}`;

let root = null;
let stopListening = null;
let waits = [];

export function mount(el, ctx) {
  root = el;
  let view = 'jar'; // 'jar' | 'idea' | 'all'
  let shown = null; // the idea on the card
  let justPlanned = null; // a plan made a moment ago (its Undo is still offered)
  let toast = null; // { text, undo }
  let kb = null;
  let sheet = null; // { id, where, cost, back } while "New idea" is open

  el.innerHTML = `<style>${STYLE}</style><div class="dn">${stringLights()}<div data-view></div><div data-toast></div><div data-sheet></div></div>`;
  const host = el.querySelector('.dn');
  const $ = (sel) => host.querySelector(sel);
  const later = (fn, ms) => { const t = setTimeout(fn, ms); waits.push(t); return t; };

  // ---- the jar ----
  const seg = (name, now, opts) => `<div class="dn-seg" data-seg="${name}">${opts.map((o) => `<button type="button" data-v="${o[0]}"${o[0] === now ? ' class="on"' : ''}>${o[2] || ''}${o[1]}</button>`).join('')}</div>`;
  function countWords() {
    const all = jar.ideas().length;
    const fit = jar.fitting().length;
    const f = jar.filter();
    if (!fit) return 'None like that';
    return f.where === 'any' && f.cost === 'any' ? `${all} ${all === 1 ? 'idea' : 'ideas'}` : `${fit} of ${all} ideas`;
  }
  function datesHtml() {
    const next = jar.upcoming().slice(0, 1);
    const past = jar.lately().slice(0, 3 - next.length);
    if (!next.length && !past.length) return '';
    return `<div class="dn-lab" style="margin-top:40px">${next.length ? 'DATE NIGHTS' : 'LATELY'}</div><div class="dn-dates">
      ${next.map((p) => `<a class="dn-date next" href="#/calendar"><b>${esc(jar.whenWords(p))}</b><span>${esc(p.title)}</span></a>`).join('')}
      ${past.map((p) => `<div class="dn-date"><b>${esc(jar.dayWords(p.date))}</b><span>${esc(p.title)}</span></div>`).join('')}</div>`;
  }
  function drawJar() {
    view = 'jar';
    const n = jar.ideas().length;
    const f = jar.filter();
    const top = `<div class="dn-top">${topBar({ title: 'Date night', right: n ? '<button type="button" class="x-btn glass" data-all>All ideas</button><button type="button" class="dn-add" data-add>+ Add an idea</button>' : '' })}</div>`;
    const art = `<div class="dn-glow"></div><button type="button" class="dn-jar" ${n ? 'data-pick' : 'data-add'} aria-label="${n ? 'Pick one' : 'Add an idea'}">${jar.jarSvg({ slips: n })}</button>`;
    if (!n) {
      $('[data-view]').innerHTML = `${top}${art}<div class="dn-empty"><div class="x-serif dn-empty-line">The jar is empty.</div><button type="button" class="dn-add" data-add>+ Add an idea</button></div>`;
      return;
    }
    $('[data-view]').innerHTML = `${top}${art}<div class="dn-col">
      <div class="dn-lab">WHERE</div>${seg('where', f.where, [['in', 'Stay in', ICON.home('#FFE7EC')], ['out', 'Go out', ICON.pin('#FFE7EC')], ['any', 'Either']])}
      <div class="dn-lab">COST</div>${seg('cost', f.cost, [['cheap', 'Cheap'], ['fancy', 'Fancy'], ['any', 'Either']])}
      <button type="button" class="dn-pick" data-pick${jar.fitting().length ? '' : ' disabled'}>${ICON.spark}<div><div class="dn-pick-t">Pick one</div><div class="dn-pick-n" data-count>${esc(countWords())}</div></div></button>
      <div data-dates>${datesHtml()}</div></div>`;
  }
  // A switch moved: only the switch, the count and the button change.
  function setSeg(box, v) {
    jar.setFilter({ [box.dataset.seg]: v });
    const btns = box.querySelectorAll('button');
    for (let i = 0; i < btns.length; i++) btns[i].classList.toggle('on', btns[i].dataset.v === v);
    $('[data-count]').textContent = countWords();
    $('.dn-pick').disabled = !jar.fitting().length;
  }
  let picking = false;
  function pickOne() {
    if (picking) return;
    const idea = jar.pick();
    if (!idea) return;
    const j = $('.dn-jar');
    if (!j) { showIdea(idea, true); return; }
    picking = true;
    j.classList.add('shake');
    later(() => { picking = false; if (root === el) showIdea(idea, true); }, 400);
  }

  // ---- the slip, unfolded ----
  function cardHtml(idea, pull) {
    const by = idea.mine ? `Your idea${idea.at ? ` · from ${MONTH[new Date(idea.at).getMonth()]}` : ''}` : '';
    const hours = idea.mins ? (idea.mins % 60 ? `${idea.mins} min` : `${idea.mins / 60} hr`) : '';
    return `<div class="dn-slip${pull ? ' pull' : ''}"><div class="dn-slip-in">
        <div class="dn-by">${esc(by)}</div>
        <div class="dn-title${idea.title.length > 26 ? ' long' : ''}">${esc(idea.title)}</div>
        ${idea.note ? `<div class="dn-note">${esc(idea.note)}</div>` : ''}</div>
      <div class="dn-chips"><span class="dn-chip">${idea.where === 'in' ? ICON.home('#5A2A1A') : ICON.pin('#5A2A1A')}${WHERE[idea.where]}</span><span class="dn-chip">${COST[idea.cost]}</span>${hours ? `<span class="dn-chip">About ${hours}</span>` : ''}</div></div>`;
  }
  function actsHtml(idea) {
    const plan = jar.plannedFor(idea.id);
    if (plan) {
      return `<div class="dn-acts"><div class="dn-act when">${ICON.cal('#FFF3EC')}${esc(jar.longDayWords(plan.date))} · ${esc(jar.timeWords(plan.time))}</div>
        <a class="dn-act side" href="#/calendar">See it</a>${justPlanned === plan.id ? '<button type="button" class="dn-act side" data-unplan>Undo</button>' : ''}</div>`;
    }
    return `<div class="dn-acts"><button type="button" class="dn-act main" data-plan>${ICON.cal(PLUM)}Put it on the calendar</button>
      <button type="button" class="dn-act side" data-again${jar.fitting().length > 1 ? '' : ' disabled style="opacity:.45"'}>${ICON.again}Pick again</button></div>`;
  }
  function showIdea(idea, pull) {
    const fresh = view !== 'idea';
    view = 'idea';
    shown = idea;
    if (fresh) {
      $('[data-view]').innerHTML = `<div class="dn-top"><button type="button" class="x-btn glass" data-jar>← Jar</button></div>
        <div class="dn-glow2"></div><div class="dn-open">${jar.jarSvg({ width: 300, slips: jar.ideas().length, lid: false })}</div>
        <svg class="dn-lid" width="160" height="60" viewBox="0 0 160 60" aria-hidden="true"><ellipse cx="80" cy="48" rx="70" ry="9" fill="rgba(0,0,0,.35)"/><rect x="10" y="12" width="140" height="34" rx="10" fill="#C8904A"/><rect x="10" y="12" width="140" height="10" rx="5" fill="#F2CB7E"/><path d="M16 30H144" stroke="rgba(90,50,10,.35)" stroke-width="2"/></svg>
        <div data-card></div>`;
    }
    $('[data-card]').innerHTML = cardHtml(idea, pull) + actsHtml(idea);
  }

  // ---- every idea ----
  function drawAll() {
    view = 'all';
    const list = jar.ideas();
    if (!list.length) { drawJar(); return; }
    const keep = $('.dn-list') ? $('.dn-list').scrollTop : 0;
    $('[data-view]').innerHTML = `<div class="dn-top"><div class="x-top"><button type="button" class="x-btn glass" data-jar>← Jar</button><div class="x-title">All ideas</div><button type="button" class="dn-add" data-add>+ Add an idea</button></div></div>
      <div class="dn-list">${list.map((i) => `<div class="dn-row"><button type="button" class="dn-row-open" data-open="${esc(i.id)}"><b>${esc(i.title)}</b><span>${WHERE[i.where]} · ${COST[i.cost]}</span></button>
        ${i.mine ? `<button type="button" class="dn-row-btn" data-edit="${esc(i.id)}">Edit</button>` : ''}<button type="button" class="dn-row-btn x" data-remove="${esc(i.id)}" aria-label="Remove">✕</button></div>`).join('')}</div>`;
    $('.dn-list').scrollTop = keep;
  }

  // ---- "New idea" ----
  const words = () => {
    const seen = {};
    jar.ideas().forEach((i) => i.title.split(/[^A-Za-z’']+/).forEach((w) => { if (w.length > 3) seen[w.toLowerCase()] = true; }));
    return Object.keys(seen).sort();
  };
  function openSheet(idea) {
    if (sheet) return;
    sheet = { id: idea ? idea.id : '', where: idea ? idea.where : 'in', cost: idea ? idea.cost : 'cheap' };
    const two = (name, now, opts) => `<div class="dn-two" data-two="${name}">${Object.keys(opts).map((k) => `<button type="button" data-v="${k}"${k === now ? ' class="on"' : ''}>${opts[k]}</button>`).join('')}</div>`;
    $('[data-sheet]').innerHTML = `<div class="dn-shade" data-cancel></div><div class="dn-sheet">
      <div class="dn-sheet-top"><button type="button" class="dn-cancel" data-cancel>Cancel</button><div class="dn-sheet-name">${idea ? 'Edit idea' : 'New idea'}</div></div>
      <div class="dn-box"><span data-typed></span><i></i></div>
      <div class="dn-sw">${two('where', sheet.where, WHERE)}${two('cost', sheet.cost, COST)}</div></div>`;
    const vocab = words();
    kb = openKeyboard(host, {
      go: idea ? 'Save' : 'Add to jar',
      max: 60,
      slots: 4,
      text: idea ? idea.title : '',
      suggest: (text) => {
        const last = (/[A-Za-z’']+$/.exec(text) || [''])[0].toLowerCase();
        return last ? vocab.filter((w) => w.indexOf(last) === 0 && w !== last).slice(0, 4) : [];
      },
      onChange: (text) => { const box = $('[data-typed]'); if (box) box.textContent = text.charAt(0).toUpperCase() + text.slice(1); },
      onGo: (word, k) => {
        if (word) { k.set(`${k.text.replace(/[A-Za-z’']+$/, '')}${word} `); return; }
        const saved = jar.saveIdea({ id: sheet.id, title: k.text, where: sheet.where, cost: sheet.cost });
        if (saved) k.close();
      },
      onClose: () => {
        kb = null;
        sheet = null;
        $('[data-sheet]').innerHTML = '';
        if (view === 'all') drawAll(); else if (view === 'jar') drawJar();
      },
    });
  }

  // ---- Undo ----
  let toastTimer = 0;
  function showToast(t) {
    clearTimeout(toastTimer);
    toast = t;
    $('[data-toast]').innerHTML = t ? `<div class="dn-toast"><span>${esc(t.text)}</span><button type="button" class="x-btn ink sm" data-undo>Undo</button></div>` : '';
    if (t) toastTimer = later(() => showToast(null), 7000);
  }

  host.addEventListener('click', (e) => {
    const t = e.target instanceof Element ? e.target.closest('button,[data-cancel]') : null;
    if (!t || t.closest('[data-kb]') || t.disabled) return;
    const d = t.dataset;
    if (t.parentNode.dataset.seg) setSeg(t.parentNode, d.v);
    else if (t.parentNode.dataset.two) {
      sheet[t.parentNode.dataset.two] = d.v;
      const btns = t.parentNode.querySelectorAll('button');
      for (let i = 0; i < btns.length; i++) btns[i].classList.toggle('on', btns[i] === t);
    } else if ('pick' in d) pickOne();
    else if ('again' in d) { const idea = jar.pick(); if (idea) showIdea(idea, true); }
    else if ('plan' in d) {
      try { justPlanned = jar.planIdea(shown).id; } catch (err) { showToast(null); $('[data-toast]').innerHTML = `<div class="dn-toast" style="padding-right:26px"><span style="margin:0">${esc(err.message)}</span></div>`; toastTimer = later(() => showToast(null), 5000); return; }
      $('[data-card]').innerHTML = cardHtml(shown, false) + actsHtml(shown);
    } else if ('unplan' in d) {
      jar.unplan(justPlanned);
      justPlanned = null;
      $('[data-card]').innerHTML = cardHtml(shown, false) + actsHtml(shown);
    } else if ('jar' in d) { showToast(null); drawJar(); }
    else if ('all' in d) drawAll();
    else if ('add' in d) openSheet(null);
    else if ('edit' in d) openSheet(jar.getIdea(d.edit));
    else if ('open' in d) { const idea = jar.getIdea(d.open); if (idea) { showToast(null); showIdea(idea, false); } }
    else if ('remove' in d) {
      const idea = jar.getIdea(d.remove);
      const undo = jar.removeIdea(d.remove);
      if (undo) showToast({ text: `Removed “${idea.title}”`, undo });
      drawAll();
    } else if ('undo' in d) {
      const u = toast && toast.undo;
      showToast(null);
      jar.restoreIdea(u);
      if (view === 'all') drawAll(); else drawJar();
    } else if ('cancel' in d && kb) kb.close();
  });

  // The calendar changed under us (an event moved or removed there): the jar's dates follow.
  const calendarChanged = () => { const box = view === 'jar' && $('[data-dates]'); if (box) box.innerHTML = datesHtml(); };
  window.addEventListener('calendar-updated', calendarChanged);
  stopListening = () => window.removeEventListener('calendar-updated', calendarChanged);

  const go = (ctx.args || [])[0];
  // (A pulled slip or the open sheet isn't kept in the address: coming back here shows the jar.)
  if (go === 'pick' || go === 'add') { try { history.replaceState(null, '', '#/datenight'); } catch (e) { /* stays as it is */ } }
  if (go === 'all') drawAll();
  else if (go === 'pick') { const idea = jar.pick(); if (idea) showIdea(idea, true); else drawJar(); }
  else { drawJar(); if (go === 'add') openSheet(null); }
}

export function unmount() {
  waits.forEach(clearTimeout);
  waits = [];
  if (stopListening) stopListening();
  stopListening = null;
  root = null;
}
