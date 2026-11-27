// Chores that rotate.
//   This week   today's chores as big cream cards (whose turn, 1-3 dots for its size, one
//               tap to tick), the days ahead down the side, a see-saw of this month's count
//               for a couple.
//   Fair share  a glass jar per person filling with marbles (a bigger marble for a bigger
//               chore) against the dashed fair-share line.
//   Sheets      a new chore, asked one question at a time and checked over before it's added;
//               changing one (name by chip or the screen's own keyboard,
//               Repeats, First time, Takes turns (in order, or whoever's behind), Size), and a chore's own little sheet
//               (someone else did it, skip this time, change, remove).
// #/chores/add opens straight on the new-chore sheet; #/chores/fair on the jars.
// With nobody named in Settings chores have no turns: just done or not.
import { backHref, backLabel } from '../services/nav.js';
import { timeText } from '../services/display.js';
import { openKeyboard, keyboardStyle } from './keyboard.js';
import {
  load, save, ymd, addDays, addMonths, weekday, daysBetween, firstDue, forecast, openWho, todayList, tally,
  dayWord, monthWord, shortDate, repeatWords, choreArt, artFor, PRESETS, peopleNames, person, scores,
  addChore, updateChore, removeChore, tick, skip, untick, canAdd,
} from '../services/chores-data.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SIZES = ['', 'Quick', 'Medium', 'Big'];
const DAY3 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const CSS = `
  .ch{position:absolute;left:0;top:0;width:1280px;height:800px;overflow:hidden;font-family:Inter,system-ui,sans-serif;color:#F3F1EA;
    background:radial-gradient(ellipse 1100px 720px at 80% -12%, #3B5590 0%, #1E2D55 50%, #111A33 100%)}
  .ch button{border:0;background:none;font:inherit;color:inherit;padding:0;margin:0;text-align:left;cursor:pointer}
  .ch-top{position:absolute;left:40px;top:20px;right:40px;height:72px;display:flex;align-items:center;gap:22px}
  .ch-title{font:600 40px Outfit,sans-serif;color:#FFFFFF}
  .ch-seg{display:flex;padding:4px;border-radius:999px;background:rgba(0,0,0,.28);border:2px solid rgba(255,255,255,.14)}
  .ch .ch-seg button{min-height:56px;padding:0 26px;border-radius:999px;display:flex;align-items:center;font:600 19px Inter,sans-serif;color:#D6DDF0}
  .ch .ch-seg button.on{background:#FFF7E6;color:#1E2D55}
  .ch-right{margin-left:auto;display:flex;align-items:center;gap:22px}
  .ch-saw{display:flex;align-items:center;gap:16px;padding:6px 8px;border-radius:999px;background:rgba(0,0,0,.25);border:2px solid rgba(255,255,255,.14);height:64px;box-sizing:border-box}
  .ch-saw b{font:700 26px Outfit,sans-serif}
  .ch .ch-add{min-height:64px;padding:0 28px;border-radius:999px;background:#FFD66B;color:#2A2410;display:flex;align-items:center;font:700 21px Inter,sans-serif;white-space:nowrap;box-shadow:0 4px 10px rgba(0,0,0,.3)}
  .ch-month{font:600 26px Outfit,sans-serif;color:#FFFFFF}
  .ch-av{border-radius:50%;color:#1E2A33;display:flex;align-items:center;justify-content:center;font-family:Outfit,sans-serif;font-weight:700;flex:none}

  .ch-today{position:absolute;left:40px;top:118px;width:806px}
  .ch-today.wide{left:237px}
  .ch-h{display:flex;align-items:baseline;gap:12px;padding-left:6px;height:38px}
  .ch-h b{font:600 30px Outfit,sans-serif;color:#FFFFFF}
  .ch-h span{font:500 19px Inter,sans-serif;color:#AEB8D4}
  .ch-cards{display:flex;flex-direction:column;gap:14px;margin-top:14px;max-height:542px;overflow-y:auto;padding-bottom:6px;box-sizing:border-box}
  .ch-card{height:120px;flex:none;border-radius:26px;background:#FFF7E6;color:#23324A;display:flex;align-items:stretch;box-shadow:0 4px 10px rgba(0,0,0,.25)}
  .ch-card.done{opacity:.78}
  .ch .ch-body{flex:1;min-width:0;display:flex;align-items:center;padding-left:20px;border-radius:26px 0 0 26px}
  .ch-what{margin-left:20px;flex:1;min-width:0}
  .ch-name{font:600 27px Outfit,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .ch-sub{font:600 19px Inter,sans-serif;margin-top:6px;display:flex;align-items:center;height:22px}
  .ch-sub .w{color:#6A7183;margin-right:6px}
  .ch-sub .w.late{color:#B5502E;font-weight:700}
  .ch-sub .w.ok{color:#3F9A63;font-weight:700}
  .ch-sub i{display:inline-block;width:9px;height:9px;border-radius:50%;background:#D9DCE3;margin-left:4px}
  .ch-sub i.on{background:#8A93A8}
  .ch-who{display:flex;align-items:center;gap:10px;padding:8px 16px 8px 8px;border-radius:999px;margin-right:6px;flex:none;font:700 21px Inter,sans-serif}
  .ch .ch-tick{width:132px;flex:none;display:flex;align-items:center;justify-content:center;border-radius:0 26px 26px 0}
  .ch-ring{width:72px;height:72px;border-radius:50%;border:3px solid rgba(35,50,74,.28);box-sizing:border-box;display:flex;align-items:center;justify-content:center}
  .ch-ring.on{border:0;background:#3F9A63}
  .ch-ring.pop{animation:ch-pop .3s ease-out both}
  @keyframes ch-pop{0%{transform:scale(.6)}60%{transform:scale(1.14)}100%{transform:scale(1)}}
  .ch-line{display:block;margin-top:6px}
  .ch-quiet{font:500 24px Outfit,sans-serif;color:#C9D2E8;padding:18px 6px 0}

  .ch-week{position:absolute;left:878px;top:118px;width:362px;height:658px;box-sizing:border-box;border-radius:28px;background:rgba(8,14,32,.42);border:2px solid rgba(255,255,255,.10);padding:6px 18px 18px;overflow-y:auto}
  .ch-day{display:flex;align-items:baseline;gap:10px;margin:12px 0 8px 4px}
  .ch-day b{font:600 21px Outfit,sans-serif;color:#FFFFFF}
  .ch-day span{font:500 16px Inter,sans-serif;color:#AEB8D4}
  .ch .ch-row{display:flex;align-items:center;gap:12px;width:100%;height:70px;border-radius:18px;background:rgba(255,247,230,.94);color:#23324A;padding:0 12px 0 10px;margin-bottom:8px;box-sizing:border-box}
  .ch-row .n{flex:1;min-width:0;font:600 19px Inter,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .ch-row .d{font:600 15px Inter,sans-serif;color:#6A7183;flex:none}

  .ch-empty{position:absolute;left:0;right:0;top:210px;display:flex;flex-direction:column;align-items:center}
  .ch-empty p{font:500 34px Outfit,sans-serif;color:#FFFFFF;margin:8px 0 30px}
  .ch .ch-empty .ch-add{min-height:76px;padding:0 40px;font-size:24px}

  .ch-jars{position:absolute;left:52px;top:126px;width:1176px;display:flex;justify-content:space-around}
  .ch-jar{text-align:center}
  .ch-jar svg{display:block;margin:0 auto}
  .ch-jn{display:flex;align-items:center;justify-content:center;gap:12px;margin-top:16px;font:600 24px Outfit,sans-serif;color:#FFFFFF}
  .ch-jc{font:700 40px/1 Outfit,sans-serif;color:#FFFFFF;margin-top:10px}
  .ch-jc span{font:500 18px Inter,sans-serif;color:#AEB8D4;margin-left:8px}
  .ch-fair{position:absolute;left:52px;width:1176px;border-top:3px dashed #FFD66B;opacity:.9}
  .ch-fairw{position:absolute;right:52px;font:700 15px Inter,sans-serif;letter-spacing:1.2px;color:#FFD66B}
  .ch-next{position:absolute;left:40px;right:40px;top:606px;height:86px;border-radius:26px;background:rgba(8,14,32,.45);border:2px solid rgba(255,255,255,.10);display:flex;align-items:center;padding:0 22px;gap:16px;box-sizing:border-box}
  .ch-next>b{font:600 22px Inter,sans-serif;color:#FFFFFF}
  .ch-pill{display:flex;align-items:center;gap:10px;padding:6px 18px 6px 6px;border-radius:999px;font:700 21px Inter,sans-serif}
  .ch-key{margin-left:auto;display:flex;align-items:center;gap:14px;font:600 18px Inter,sans-serif;color:#C9D2E8}
  .ch-key span{display:flex;align-items:center;gap:6px}
  .ch-key i{border-radius:50%;background:#C9D2E8}

  .ch-shade{position:absolute;left:0;top:0;right:0;bottom:0;background:rgba(6,10,24,.6);z-index:5}
  .ch-sheet{position:absolute;left:250px;top:24px;width:780px;height:752px;border-radius:32px;background:#FFF7E6;color:#23324A;box-shadow:0 8px 20px rgba(0,0,0,.45);display:flex;flex-direction:column;overflow:hidden;animation:ch-in .18s ease-out both}
  @keyframes ch-in{0%{opacity:0;transform:translate3d(0,24px,0)}100%{opacity:1;transform:translate3d(0,0,0)}}
  .ch-sh{display:flex;align-items:center;height:76px;padding:0 12px;border-bottom:2px solid #ECE0C8;flex:none}
  .ch .ch-sh button{min-height:56px;min-width:110px;padding:0 14px;display:flex;align-items:center;justify-content:center;font:600 20px Inter,sans-serif;color:#6A7183;border-radius:999px}
  .ch .ch-sh button.go{font:700 21px Inter,sans-serif;color:#2D4C9A}
  .ch .ch-sh button[disabled]{opacity:.35}
  .ch-sh div{flex:1;text-align:center;font:600 25px Outfit,sans-serif}
  .ch-nb{margin:14px 16px 0;border-radius:22px;background:#F6EDD9;padding:14px 16px 16px;flex:none}
  .ch .ch-nm{display:flex;align-items:center;gap:16px;width:100%;height:72px;padding:0 12px;border-radius:16px;background:#FFFFFF;border:2px solid #E6D9BC;box-sizing:border-box;font:600 28px Outfit,sans-serif;white-space:nowrap;overflow:hidden}
  .ch .ch-nm.typing{border-color:#2D4C9A}
  .ch-nm .ph{color:#A9A08A}
  .ch-chips{display:flex;gap:10px;margin-top:12px;overflow-x:auto}
  .ch .ch-chip{min-height:56px;padding:0 22px;border-radius:999px;background:#F2EAD6;color:#3B3A30;display:inline-flex;align-items:center;justify-content:center;gap:10px;font:600 19px Inter,sans-serif;white-space:nowrap;flex:none;box-sizing:border-box}
  .ch .ch-chip.on{background:#1E2D55;color:#FFF7E6}
  .ch-form{margin:6px 16px 0;flex:1;min-height:0;overflow-y:auto}
  .ch .ch-fr{display:flex;align-items:center;width:100%;min-height:66px;padding:0 24px;border-bottom:2px solid #F0E5CF;font:600 21px Inter,sans-serif;color:#23324A;box-sizing:border-box}
  .ch-fr.plain{border-bottom:0}
  .ch-fr .v{margin-left:auto;font-weight:500;color:#6A7183;white-space:nowrap}
  .ch-fr .c{margin-left:14px;color:#B9AE94;font-size:26px}
  .ch-fr .ch-two{margin-left:auto}
  .ch .ch-fr .ch-two .ch-chip{min-height:48px;font-size:17px;padding:0 18px}
  .ch-turns{display:flex;gap:12px;padding:0 16px 14px;border-bottom:2px solid #F0E5CF;flex-wrap:wrap}
  .ch .ch-turn{flex:1 1 0;min-width:0;min-height:76px;border-radius:22px;background:#F2EAD6;border:3px solid transparent;display:flex;align-items:center;gap:14px;padding:0 18px;box-sizing:border-box;font:700 22px Inter,sans-serif}
  .ch-turn .nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .ch-turn .no{width:40px;height:40px;border-radius:50%;background:#1E2D55;color:#FFF7E6;display:flex;align-items:center;justify-content:center;font:700 20px Outfit,sans-serif;flex:none}
  .ch-turn .no.off{background:transparent;box-shadow:inset 0 0 0 2px #CFC3A8}
  .ch-turns.many .ch-turn{flex-direction:column;justify-content:center;gap:4px;padding:8px 4px;min-height:104px;font-size:17px;position:relative}
  .ch-turns.many .ch-turn .nm{flex:none;max-width:100%}
  .ch-turns.many .ch-turn .no{position:absolute;right:6px;top:6px;width:30px;height:30px;font-size:16px}
  .ch-sizes{display:flex;gap:10px;padding:0 16px 6px}
  .ch-sizes .ch-chip{flex:1}
  .ch-pg{padding:18px 24px;flex:1;min-height:0;overflow-y:auto}
  .ch-pg h4{font:600 19px Inter,sans-serif;color:#6A7183;margin:22px 0 10px}
  .ch-two{display:flex;gap:10px}
  .ch-two .ch-chip{flex:1;min-height:64px;font-size:21px}
  .ch-wd{display:flex;gap:10px;margin-top:22px}
  .ch .ch-wd button{flex:1;height:88px;border-radius:22px;background:#F2EAD6;color:#3B3A30;font:700 21px Inter,sans-serif;text-align:center}
  .ch .ch-wd button.on{background:#1E2D55;color:#FFF7E6}
  .ch-step{display:flex;align-items:center;gap:16px;margin-top:22px}
  .ch .ch-step button.pm{width:76px;height:76px;border-radius:50%;background:#F2EAD6;font:600 38px Outfit,sans-serif;text-align:center;color:#23324A}
  .ch-step b{width:70px;text-align:center;font:700 44px Outfit,sans-serif}
  .ch-step .ch-chip{flex:1;min-height:64px}
  .ch-cal{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px}
  .ch-cal b{font:600 26px Outfit,sans-serif}
  .ch .ch-cal button{width:64px;height:64px;border-radius:50%;background:#F2EAD6;text-align:center;font:600 30px Outfit,sans-serif}
  .ch .ch-cal button[disabled]{opacity:.3}
  .ch-grid{display:flex;flex-wrap:wrap}
  .ch-grid span{width:14.28%;height:34px;text-align:center;font:600 15px Inter,sans-serif;color:#8A8370}
  .ch .ch-grid button{width:14.28%;height:68px;text-align:center;font:600 23px Outfit,sans-serif;border-radius:50%;color:#23324A}
  .ch .ch-grid button[disabled]{color:#CFC3A8}
  .ch .ch-grid button.on{background:#1E2D55;color:#FFF7E6;border-radius:22px}
  .ch-grid em{width:14.28%;height:68px}
  .ch-q{font:600 32px Outfit,sans-serif;margin:2px 0 18px}
  .ch-qs{font:500 19px Inter,sans-serif;color:#6A7183;margin:-8px 0 18px}
  .ch-opts{display:flex;flex-direction:column;gap:12px}
  .ch .ch-opt{display:block;width:100%;min-height:84px;padding:14px 24px;border-radius:22px;background:#F2EAD6;color:#23324A;box-sizing:border-box}
  .ch-opt b{display:block;font:700 23px Inter,sans-serif}
  .ch-opt span{display:block;font:500 18px Inter,sans-serif;color:#6A7183;margin-top:4px}
  .ch .ch-opt.on{background:#1E2D55;color:#FFF7E6}
  .ch-opt.on span{color:#C9D2E8}
  .ch-nav{display:flex;align-items:center;gap:12px;margin-top:24px;min-height:64px}
  .ch .ch-nav .ch-chip{margin-left:auto;min-height:64px;padding:0 32px;font-size:21px}
  .ch .ch-nav .ch-chip.go{min-height:72px;padding:0 56px;background:#3F9A63;color:#FFFFFF;font-weight:700}
  .ch .ch-lk{min-height:56px;padding:0 12px;font:600 20px Inter,sans-serif;color:#6A7183}
  .ch-ck .ch-fr .v{overflow:hidden;text-overflow:ellipsis;max-width:400px}
  .ch .ch-ck .ch-fr .ch-chip{margin-left:14px;min-height:48px;font-size:17px;padding:0 18px}

  .ch-act{position:absolute;left:320px;top:150px;width:640px;border-radius:32px;background:#FFF7E6;color:#23324A;box-shadow:0 8px 20px rgba(0,0,0,.45);padding:22px 24px 24px;box-sizing:border-box;animation:ch-in .18s ease-out both}
  .ch-ah{display:flex;align-items:center;gap:18px}
  .ch-ah .t{flex:1;min-width:0}
  .ch-ah .t b{display:block;font:600 30px Outfit,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .ch-ah .t span{font:500 19px Inter,sans-serif;color:#6A7183}
  .ch .ch-x{width:64px;height:64px;border-radius:50%;background:#F2EAD6;text-align:center;font:600 26px Inter,sans-serif;flex:none}
  .ch-act h4{font:600 19px Inter,sans-serif;color:#6A7183;margin:22px 0 10px}
  .ch-pp{display:flex;gap:10px;flex-wrap:wrap}
  .ch .ch-pp button{min-height:68px;padding:0 20px 0 8px;border-radius:999px;display:flex;align-items:center;gap:10px;font:700 21px Inter,sans-serif}
  .ch-ab{display:flex;gap:10px;margin-top:22px}
  .ch-ab .ch-chip{flex:1;min-height:68px;font-size:20px;padding:0 10px}
  .ch .ch-ab .ch-chip.go{background:#3F9A63;color:#FFFFFF}
  .ch .ch-ab .ch-chip.del{color:#B5502E}

  .ch-undo{position:absolute;left:50%;bottom:26px;transform:translateX(-50%);z-index:6;display:flex;align-items:center;gap:8px;padding:0 8px 0 26px;height:72px;border-radius:999px;background:#0B1226;border:2px solid rgba(255,255,255,.2);font:600 20px Inter,sans-serif;color:#FFFFFF;white-space:nowrap}
  .ch .ch-undo button{min-height:56px;padding:0 24px;border-radius:999px;background:#FFD66B;color:#2A2410;font:700 20px Inter,sans-serif;margin-left:12px}
  @media (prefers-reduced-motion: reduce){.ch-sheet,.ch-act,.ch-ring.pop{animation:none}}
`;

const TICK = (size, stroke) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:block"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;
const av = (p, size) => `<span class="ch-av" style="width:${size}px;height:${size}px;background:${p.color};font-size:${Math.round(size * 0.46)}px">${esc(p.initial)}</span>`;
const dots = (n) => [1, 2, 3].map((i) => `<i${i <= n ? ' class="on"' : ''}></i>`).join('');
// The washing line under today's cards (and the picture of a first day with no chores).
const LINE = `<svg class="ch-line" width="806" height="150" viewBox="0 0 806 150" aria-hidden="true">
  <path d="M0 26 C200 60 600 60 806 22" stroke="#C9D2E8" stroke-width="2.5" fill="none" opacity=".55"/>
  <g transform="translate(120 44)"><rect x="-4" y="-6" width="8" height="14" rx="2" fill="#E8C27A"/><path d="M-40 6 h80 l-6 70 h-68z" fill="#7FD8C4" opacity=".9"/><path d="M-40 6 h80 v10 h-80z" fill="#FFFFFF" opacity=".25"/></g>
  <g transform="translate(250 50)"><rect x="-4" y="-6" width="8" height="14" rx="2" fill="#E8C27A"/><path d="M-28 6 h56 v42 h-56z" fill="#FFF7E6"/><path d="M-28 6 h56 v6 h-56z" fill="#F4A3B4"/></g>
  <g transform="translate(372 54)"><rect x="-4" y="-6" width="8" height="14" rx="2" fill="#E8C27A"/><path d="M-30 6 l12 -2 h36 l12 2 l-6 20 h-6 v44 h-36 v-44 h-6z" fill="#FF9A7A" opacity=".95"/></g>
  <g transform="translate(500 52)"><rect x="-4" y="-6" width="8" height="14" rx="2" fill="#E8C27A"/><path d="M-22 6 h44 v30 l-8 -6 l-8 6 l-6 -6 l-6 6 l-8 -6 l-8 6z" fill="#B9A3FF" opacity=".9"/></g>
  <g transform="translate(640 46)"><rect x="-4" y="-6" width="8" height="14" rx="2" fill="#E8C27A"/><path d="M-34 6 h68 v54 h-68z" fill="#FFD66B" opacity=".9"/><path d="M-34 22 h68 M-34 38 h68" stroke="#E6B84A" stroke-width="3"/></g>
</svg>`;

let root = null;
let hostEl = null; // the keyboard slides up in here, over everything
let view = 'week';
let sheet = null; // { type: 'form', page, d: draft } | { type: 'act', id }
let undo = null; // { snap, text }
let undoTimer = 0;
let dayTimer = 0;
let shownDay = '';
let kb = null;
let popLog = '';
let lastTick = 0;

const today = () => ymd(new Date());

// ---------------------------------------------------------------------------------------
// This week
// ---------------------------------------------------------------------------------------
function whenWords(x, now) {
  if (x.done) return `<span class="w ok">Done ${esc(timeText(new Date(x.done.at)))}</span>`;
  if (x.late) {
    const n = daysBetween(x.due, now);
    return `<span class="w late">${n === 1 ? 'Yesterday' : n < 7 ? `Since ${dayWord(x.due)}` : `Since ${shortDate(x.due)}`}</span>`;
  }
  return x.chore.evening ? '<span class="w">Tonight</span>' : '';
}
function card(x, now) {
  const name = x.done ? x.done.name : x.chore.name;
  const art = x.done ? x.done.art : x.chore.art;
  const size = x.done ? x.done.size : x.chore.size;
  const p = x.who ? person(x.who) : null;
  const inside = `${choreArt(art, 76)}<div class="ch-what"><div class="ch-name">${esc(name)}</div><div class="ch-sub">${whenWords(x, now)}${dots(size)}</div></div>
    ${p ? `<span class="ch-who" style="background:${p.color}33">${av(p, 52)}${esc(p.name)}</span>` : ''}`;
  if (x.done) {
    return `<div class="ch-card done"><div class="ch-body">${inside}</div>
      <button class="ch-tick" data-act="untick" data-log="${esc(x.done.id)}" aria-label="Not done"><span class="ch-ring on${popLog === x.done.id ? ' pop' : ''}">${TICK(36, '#FFFFFF')}</span></button></div>`;
  }
  return `<div class="ch-card"><button class="ch-body" data-act="open" data-id="${esc(x.chore.id)}">${inside}</button>
    <button class="ch-tick" data-act="tick" data-id="${esc(x.chore.id)}" aria-label="Done"><span class="ch-ring">${TICK(33, 'rgba(43,42,34,.22)')}</span></button></div>`;
}
function weekRows(state, now, names) {
  const end = addDays(now, 6);
  const days = {};
  const later = [];
  const seen = {};
  forecast(state, now, addDays(now, 400), names).forEach((t) => {
    const c = t.chore;
    if (t.date <= now || seen[c.id] === 'later') return;
    if (t.date <= end) { seen[c.id] = 'week'; (days[t.date] || (days[t.date] = [])).push({ c, t }); } else if (!seen[c.id]) { seen[c.id] = 'later'; later.push({ c, t }); }
  });
  const row = (x, when) => {
    const p = x.t.who ? person(x.t.who) : null;
    return `<button class="ch-row" data-act="open" data-id="${esc(x.c.id)}">${choreArt(x.c.art, 48)}<span class="n">${esc(x.c.name)}</span>${when ? `<span class="d">${when}</span>` : ''}${p ? av(p, 38) : ''}</button>`;
  };
  let html = Object.keys(days).sort().map((d) => `<div class="ch-day"><b>${daysBetween(now, d) === 1 ? 'Tomorrow' : DAY3[weekday(d)]}</b><span>${shortDate(d)}</span></div>${days[d].map((x) => row(x, '')).join('')}`).join('');
  if (later.length) {
    later.sort((a, b) => (a.t.date < b.t.date ? -1 : 1));
    html += `<div class="ch-day"><b>Later</b></div>${later.map((x) => row(x, shortDate(x.t.date))).join('')}`;
  }
  return html;
}
function seesaw(sc) {
  const tilt = Math.max(-9, Math.min(9, (sc[1].count - sc[0].count) * 2));
  return `<div class="ch-saw">${av(sc[0], 48)}<b>${sc[0].count}</b>
    <svg width="86" height="40" viewBox="0 0 86 40" aria-hidden="true"><path d="M43 22 l-10 16 h20z" fill="#C9D2E8"/><rect x="2" y="16" width="82" height="7" rx="3.5" fill="#FFD66B" transform="rotate(${tilt} 43 20)"/></svg>
    <b>${sc[1].count}</b>${av(sc[1], 48)}</div>`;
}
function weekView(state, now, names) {
  const list = todayList(state, now, names);
  const side = weekRows(state, now, names);
  const cards = list.map((x) => card(x, now)).join('');
  return `<div class="ch-today${side ? '' : ' wide'}">
      <div class="ch-h"><b>Today</b><span>${dayWord(now)}</span></div>
      ${list.length ? `<div class="ch-cards">${cards}${list.length <= 3 ? LINE : ''}</div>` : `<div class="ch-quiet">Nothing today</div>${LINE}`}
    </div>
    ${side ? `<div class="ch-week">${side}</div>` : ''}`;
}

// ---------------------------------------------------------------------------------------
// Fair share (the bottom strip of the screen stays free for the kitchen-timer chip)
// ---------------------------------------------------------------------------------------
const RADII = [0, 13, 18, 24];
/** Marbles (sizes, biggest first) laid in rows from the bottom of a jar; k shrinks them. */
function pack(sizes, k) {
  const out = [];
  let x = 33;
  let bottom = 296;
  let rowH = 0;
  sizes.forEach((s) => {
    const r = RADII[s] * k;
    if (x + 2 * r > 171 && x > 33) { bottom -= rowH + 2; x = 33; rowH = 0; }
    if (!rowH) rowH = 2 * r;
    out.push({ cx: x + r, cy: bottom - r, r });
    x += 2 * r + 3;
  });
  return { out, top: out.length ? bottom - rowH : 296 };
}
function fairView(state, now, names) {
  const month = now.slice(0, 7);
  const t = tally(state.log, month);
  const mine = (n) => state.log.filter((e) => e.kind === 'done' && e.who === n && ymd(new Date(e.at)).slice(0, 7) === month).map((e) => e.size).sort((a, b) => b - a);
  const jars = names.map((n) => ({ p: person(n), sizes: mine(n), count: (t[n] || {}).count || 0 }));
  let k = 1;
  while (k > 0.3 && jars.some((j) => pack(j.sizes, k).top < 48)) k *= 0.92;
  const w = Math.min(196, Math.floor(1176 / Math.max(1, jars.length)) - 24);
  const sc = w / 196;
  let tops = 0;
  const cols = jars.map((j) => {
    const m = pack(j.sizes, k);
    tops += m.top;
    const shine = j.sizes.length <= 40;
    return `<div class="ch-jar" style="width:${w}px"><svg width="${w}" height="${Math.round(320 * sc)}" viewBox="0 0 196 320" aria-hidden="true">
        <rect x="30" y="0" width="136" height="22" rx="6" fill="#C9A15E"/><rect x="30" y="0" width="136" height="7" rx="3.5" fill="#E2C07E"/>
        <path d="M24 26 h148 q14 0 14 18 v258 q0 18 -18 18 h-120 q-18 0 -18 -18 v-258 q0 -18 14 -18z" fill="rgba(210,225,255,.10)" stroke="rgba(220,232,255,.45)" stroke-width="3"/>
        ${m.out.map((c) => `<circle cx="${c.cx.toFixed(1)}" cy="${c.cy.toFixed(1)}" r="${c.r.toFixed(1)}" fill="${j.p.color}"/>${shine ? `<circle cx="${(c.cx - c.r * 0.35).toFixed(1)}" cy="${(c.cy - c.r * 0.35).toFixed(1)}" r="${(c.r * 0.32).toFixed(1)}" fill="#FFFFFF" opacity=".55"/>` : ''}`).join('')}
        <path d="M30 60 v200" stroke="#FFFFFF" stroke-width="6" stroke-linecap="round" opacity=".18"/></svg>
      <div class="ch-jn">${av(j.p, w < 150 ? 40 : 52)}<span>${esc(j.p.name)}</span></div>
      <div class="ch-jc">${j.count}<span>done</span></div></div>`;
  }).join('');
  const any = jars.some((j) => j.sizes.length);
  const fairY = 126 + Math.round((tops / Math.max(1, jars.length)) * sc);
  // Whose turns come up next (each person once, soonest first).
  const next = [];
  forecast(state, now, addDays(now, 13), names).forEach((x) => { if (x.who && next.indexOf(x.who) < 0 && next.length < 3) next.push(x.who); });
  return `<div class="ch-jars">${cols}</div>
    ${any && jars.length > 1 ? `<div class="ch-fair" style="top:${fairY}px"></div><div class="ch-fairw" style="top:${fairY - 26}px">FAIR SHARE</div>` : ''}
    <div class="ch-next">${next.length ? `<b>Next turns go to</b>${next.map((n) => { const p = person(n); return `<span class="ch-pill" style="background:${p.color}33">${av(p, 44)}${esc(p.name)}</span>`; }).join('')}` : ''}
      <span class="ch-key"><span><i style="width:18px;height:18px"></i>Quick</span><span><i style="width:26px;height:26px"></i>Medium</span><span><i style="width:34px;height:34px"></i>Big</span></span></div>`;
}

// ---------------------------------------------------------------------------------------
// The sheets
// ---------------------------------------------------------------------------------------
function blank() {
  const now = today();
  return { id: null, name: '', size: 1, evening: false, kind: 'weekly', days: [weekday(now)], n: 2, unit: 'week', start: now, turns: peopleNames(), pick: peopleNames().length >= 2 ? 'behind' : 'turns', month: now.slice(0, 7),
    wiz: true, step: 'what', reviewed: false, other: false, mode: peopleNames().length >= 2 ? 'behind' : 'turns' };
}
function draftOf(c) {
  const w = c.repeat.kind === 'weekly';
  return {
    id: c.id, name: c.name, size: c.size, evening: c.evening, kind: c.repeat.kind,
    days: w ? c.repeat.days.slice() : [weekday(c.start)], n: w ? 2 : c.repeat.n, unit: w ? 'week' : c.repeat.unit,
    start: c.start, turns: c.turns.filter((n) => peopleNames().indexOf(n) >= 0), pick: c.pick === 'behind' ? 'behind' : 'turns', month: (c.start > today() ? c.start : today()).slice(0, 7),
  };
}
const repeatOf = (d) => (d.kind === 'weekly' ? { kind: 'weekly', days: d.days.slice() } : { kind: 'every', n: d.n, unit: d.unit });
const fieldsOf = (d) => ({ name: d.name, size: d.size, evening: d.evening, repeat: repeatOf(d), start: d.start, turns: d.turns, pick: d.pick });
function firstWords(d) {
  const now = today();
  const f = firstDue({ repeat: repeatOf(d), start: d.start }, now);
  const n = daysBetween(now, f);
  return n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : `${DAY3[weekday(f)]}, ${shortDate(f)}`;
}
const nameInside = (d) => `${choreArt(artFor(d.name), 52)}<span${d.name ? '' : ' class="ph"'}>${esc(d.name || (d.wiz ? 'Tap to type it, or pick one below' : 'Name'))}</span>`;

function formMain(d) {
  const names = peopleNames();
  const used = load().chores.map((c) => c.name.toLowerCase());
  const chips = PRESETS.filter((p) => p === d.name || used.indexOf(p.toLowerCase()) < 0);
  return `<div class="ch-sh"><button data-act="close">Cancel</button><div>${d.id ? 'Chore' : 'New chore'}</div><button class="go" data-act="save"${d.name.trim() ? '' : ' disabled'}>${d.id ? 'Save' : 'Add'}</button></div>
    <div class="ch-nb"><button class="ch-nm" data-act="type">${nameInside(d)}</button>
      <div class="ch-chips">${chips.map((p) => `<button class="ch-chip${p === d.name ? ' on' : ''}" data-act="preset" data-v="${esc(p)}">${p === d.name ? TICK(22, '#FFF7E6') : ''}${esc(p)}</button>`).join('')}</div></div>
    <div class="ch-form">
      <button class="ch-fr" data-act="page" data-v="repeats"><span>Repeats</span><span class="v">${esc(repeatWords(repeatOf(d)))}${d.evening ? ' · evening' : ''}</span><span class="c">›</span></button>
      <button class="ch-fr" data-act="page" data-v="first"><span>First time</span><span class="v">${firstWords(d)}</span><span class="c">›</span></button>
      ${names.length ? `<div class="ch-fr plain"><span>Takes turns</span>${names.length >= 2 ? `<div class="ch-two">${[['turns', 'Take turns'], ['behind', 'Whoever’s behind']].map((o) => `<button class="ch-chip${d.pick === o[0] ? ' on' : ''}" data-act="pick" data-v="${o[0]}">${o[1]}</button>`).join('')}</div>` : ''}</div>
      <div class="ch-turns${names.length > 3 ? ' many' : ''}">${names.map((n) => {
    const p = person(n);
    const i = d.turns.indexOf(n);
    return `<button class="ch-turn" data-act="turn" data-v="${esc(n)}" style="${i >= 0 ? `background:${p.color}40;border-color:${p.color}` : ''}">${av(p, 48)}<span class="nm">${esc(n)}</span><span class="no${i >= 0 ? '' : ' off'}">${i < 0 ? '' : d.pick === 'behind' ? TICK(22, '#FFF7E6') : i + 1}</span></button>`;
  }).join('')}</div>` : ''}
      <div class="ch-fr plain"><span>Size</span></div>
      <div class="ch-sizes">${[1, 2, 3].map((s) => `<button class="ch-chip${d.size === s ? ' on' : ''}" data-act="size" data-v="${s}">${SIZES[s]}</button>`).join('')}</div>
    </div>`;
}
function formRepeats(d) {
  const units = [['day', 'Days'], ['week', 'Weeks'], ['month', 'Months']];
  return `<div class="ch-sh"><button data-act="page" data-v="main">‹ Back</button><div>Repeats</div><button style="visibility:hidden"></button></div>
    <div class="ch-pg">
      <div class="ch-two"><button class="ch-chip${d.kind === 'weekly' ? ' on' : ''}" data-act="kind" data-v="weekly">Weekly</button><button class="ch-chip${d.kind === 'every' ? ' on' : ''}" data-act="kind" data-v="every">Every…</button></div>
      ${d.kind === 'weekly'
    ? `<div class="ch-wd">${DAY3.map((w, i) => `<button class="${d.days.indexOf(i) >= 0 ? 'on' : ''}" data-act="wd" data-v="${i}">${w}</button>`).join('')}</div>`
    : `<div class="ch-step"><button class="pm" data-act="n" data-v="-1" aria-label="Fewer">−</button><b>${d.n}</b><button class="pm" data-act="n" data-v="1" aria-label="More">+</button>
        ${units.map((u) => `<button class="ch-chip${d.unit === u[0] ? ' on' : ''}" data-act="unit" data-v="${u[0]}">${u[1]}</button>`).join('')}</div>`}
      <h4>Time</h4>
      <div class="ch-two"><button class="ch-chip${d.evening ? '' : ' on'}" data-act="eve" data-v="0">Any time</button><button class="ch-chip${d.evening ? ' on' : ''}" data-act="eve" data-v="1">Evening</button></div>
    </div>`;
}
function calendar(d) {
  const now = today();
  const first = `${d.month}-01`;
  const lead = weekday(first);
  const count = daysBetween(first, addMonths(first, 1));
  let cells = '';
  for (let i = 0; i < lead; i++) cells += '<em></em>';
  for (let n = 1; n <= count; n++) {
    const day = addDays(first, n - 1);
    cells += `<button data-act="start" data-v="${day}"${day < now ? ' disabled' : ''}${day === d.start ? ' class="on"' : ''}>${n}</button>`;
  }
  return `<div class="ch-cal"><button data-act="month" data-v="-1" aria-label="Earlier"${d.month <= now.slice(0, 7) ? ' disabled' : ''}>‹</button><b>${monthWord(first)} ${first.slice(0, 4)}</b><button data-act="month" data-v="1" aria-label="Later">›</button></div>
      <div class="ch-grid">${DAY3.map((w) => `<span>${w}</span>`).join('')}${cells}</div>`;
}
function formFirst(d) {
  return `<div class="ch-sh"><button data-act="page" data-v="main">‹ Back</button><div>First time</div><button style="visibility:hidden"></button></div>
    <div class="ch-pg">
      ${calendar(d)}
    </div>`;
}

// A new chore is asked one question at a time (what, how often, which day first, who does
// it, how big), then shown to check over before it's added. Changing a chore keeps the rows above.
const OFTEN = [['day', 'Every day'], ['week', 'Every week'], ['2week', 'Every 2 weeks'], ['month', 'Every month'], ['other', 'Other…']];
const SIZE_LINES = ['', 'About 5 minutes', 'About half an hour', 'An hour or more'];
const wzSteps = (d) => ['what', 'often', 'first'].concat(peopleNames().length >= 2 ? ['who'].concat(d.mode === 'one' ? ['one'] : d.mode === 'turns' ? ['order'] : []) : [], ['size', 'check']);
function wzAdvance(d) {
  const steps = wzSteps(d);
  const next = steps[Math.min(steps.length - 1, steps.indexOf(d.step) + 1)];
  // Once it's been checked over, an answer goes straight back to the check (a new "who" may ask whom first).
  d.step = d.reviewed && next !== 'one' && next !== 'order' ? 'check' : next;
  if (d.step === 'check') d.reviewed = true;
}
function oftenKey(d) {
  if (d.other) return 'other';
  if (d.kind === 'weekly') return d.days.length === 1 ? 'week' : 'other';
  if (d.n === 1 && d.unit === 'day') return 'day';
  if (d.n === 2 && d.unit === 'week') return '2week';
  if (d.n === 1 && d.unit === 'month') return 'month';
  return 'other';
}
function whoWords(d) {
  if (d.pick === 'behind') return 'Whoever has done less';
  if (d.turns.length === 1) return `${d.turns[0]}, every time`;
  return `Take turns: ${d.turns.join(', then ')}`;
}
function formWizard(d) {
  const names = peopleNames();
  const opt = (act, v, on, title, line) => `<button class="ch-opt${on ? ' on' : ''}" data-act="${act}" data-v="${esc(v)}"><b>${title}</b>${line ? `<span>${line}</span>` : ''}</button>`;
  const backOk = d.step !== 'what' && (!d.reviewed || d.step === 'one' || d.step === 'order' || d.step === 'check');
  const nav = (more) => `<div class="ch-nav">${backOk ? '<button class="ch-lk" data-act="w:back">← Back</button>' : ''}${more || ''}</div>`;
  const next = (ok) => (ok ? '<button class="ch-chip on" data-act="w:next">Next →</button>' : '');
  const people = (act, mark) => `<div class="ch-turns${names.length > 3 ? ' many' : ''}" style="padding:0;border-bottom:0">${names.map((n) => {
    const p = person(n);
    const m = mark(n);
    return `<button class="ch-turn" data-act="${act}" data-v="${esc(n)}" style="${m ? `background:${p.color}40;border-color:${p.color}` : ''}">${av(p, 48)}<span class="nm">${esc(n)}</span><span class="no${m ? '' : ' off'}">${m}</span></button>`;
  }).join('')}</div>`;
  let body = '';
  if (d.step === 'what') {
    const used = load().chores.map((c) => c.name.toLowerCase());
    const chips = PRESETS.filter((p) => p === d.name || used.indexOf(p.toLowerCase()) < 0);
    body = `<div class="ch-q">What chore?</div>
      <button class="ch-nm" data-act="type">${nameInside(d)}</button>
      <div class="ch-chips" style="flex-wrap:wrap">${chips.map((p) => `<button class="ch-chip${p === d.name ? ' on' : ''}" data-act="preset" data-v="${esc(p)}">${p === d.name ? TICK(22, '#FFF7E6') : ''}${esc(p)}</button>`).join('')}</div>
      ${nav(next(d.name.trim()))}`;
  } else if (d.step === 'often') {
    const k = oftenKey(d);
    const units = [['day', 'Days'], ['week', 'Weeks'], ['month', 'Months']];
    body = `<div class="ch-q">How often?</div>
      <div class="ch-chips" style="flex-wrap:wrap;margin-top:0">${OFTEN.map((o) => `<button class="ch-chip${k === o[0] ? ' on' : ''}" data-act="w:often" data-v="${o[0]}" style="min-height:64px;font-size:21px">${o[1]}</button>`).join('')}</div>
      ${k === 'other' ? `<div class="ch-step"><span style="font:600 21px Inter,sans-serif">Every</span><button class="pm" data-act="n" data-v="-1" aria-label="Fewer">−</button><b>${d.n}</b><button class="pm" data-act="n" data-v="1" aria-label="More">+</button>
        ${units.map((u) => `<button class="ch-chip${d.unit === u[0] ? ' on' : ''}" data-act="unit" data-v="${u[0]}">${u[1]}</button>`).join('')}</div>` : ''}
      <h4>Time</h4>
      <div class="ch-two"><button class="ch-chip${d.evening ? '' : ' on'}" data-act="eve" data-v="0">Any time</button><button class="ch-chip${d.evening ? ' on' : ''}" data-act="eve" data-v="1">Evening</button></div>
      ${nav(next(true))}`;
  } else if (d.step === 'first') {
    body = `<div class="ch-q">Which day first?</div>${calendar(d)}${nav(next(true))}`;
  } else if (d.step === 'who') {
    const a = esc(names[0]);
    const b = esc(names[1]);
    body = `<div class="ch-q">Who does it?</div>
      <div class="ch-opts">
        ${opt('w:who', 'one', d.mode === 'one', 'Always the same person', `${a} does it every time`)}
        ${opt('w:who', 'turns', d.mode === 'turns', 'Take turns', names.length === 2 ? `${a}, then ${b}, then ${a} again…` : `${a}, then ${b}, then ${esc(names[2])}…`)}
        ${opt('w:who', 'behind', d.mode === 'behind', 'Whoever has done less', 'It goes to whoever has done less this month (bigger jobs count more)')}
      </div>${nav(next(true))}`;
  } else if (d.step === 'one') {
    body = `<div class="ch-q">Who does it?</div>${people('w:one', (n) => (d.turns.length === 1 && d.turns[0] === n ? TICK(22, '#FFF7E6') : ''))}${nav(next(d.turns.length === 1))}`;
  } else if (d.step === 'order') {
    body = `<div class="ch-q">${d.turns.length ? 'Who’s next?' : 'Who goes first?'}</div>
      ${people('w:order', (n) => (d.turns.indexOf(n) >= 0 ? d.turns.indexOf(n) + 1 : ''))}
      ${nav(`${d.turns.length ? '<button class="ch-lk" data-act="w:restart">Start over</button>' : ''}${next(d.turns.length >= 2)}`)}`;
  } else if (d.step === 'size') {
    body = `<div class="ch-q">How big a job?</div><div class="ch-qs">A bigger job gets a bigger marble on Fair share.</div>
      <div class="ch-opts">${[1, 2, 3].map((s) => opt('size', s, d.size === s, s === 3 ? 'Big job' : SIZES[s], SIZE_LINES[s])).join('')}</div>${nav(next(true))}`;
  } else {
    const line = (label, value, step) => `<div class="ch-fr"><span>${label}</span><span class="v">${value}</span><button class="ch-chip" data-act="w:go" data-v="${step}">Change</button></div>`;
    body = `<div class="ch-q">Does this look right?</div>
      <div class="ch-ck">
        ${line('Chore', esc(d.name), 'what')}
        ${line('How often', `${esc(repeatWords(repeatOf(d)))}${d.evening ? ' · evening' : ''}`, 'often')}
        ${line('First time', firstWords(d), 'first')}
        ${names.length >= 2 ? line('Who', esc(whoWords(d)), 'who') : ''}
        ${line('Size', SIZES[d.size], 'size')}
      </div>
      ${nav('<button class="ch-chip go" data-act="save">Add chore</button>')}`;
  }
  return `<div class="ch-sh"><button data-act="close">Cancel</button><div>New chore</div><button style="visibility:hidden"></button></div>
    <div class="ch-pg">${body}</div>`;
}
function actSheet(c) {
  const now = today();
  const names = peopleNames();
  const due = c.next <= now;
  const mine = openWho(load(), c, names);
  const others = names.filter((n) => n !== mine);
  return `<div class="ch-act">
    <div class="ch-ah">${choreArt(c.art, 72)}<div class="t"><b>${esc(c.name)}</b><span>${esc(repeatWords(c.repeat))}</span></div><button class="ch-x" data-act="close" aria-label="Close">✕</button></div>
    ${others.length ? `<h4>${mine ? 'Someone else did it' : 'Who did it'}</h4><div class="ch-pp">${others.map((n) => { const p = person(n); return `<button data-act="by" data-v="${esc(n)}" style="background:${p.color}40">${av(p, 52)}${esc(n)}</button>`; }).join('')}</div>` : ''}
    <div class="ch-ab">${due ? '' : '<button class="ch-chip go" data-act="early">Done</button>'}<button class="ch-chip" data-act="skip">Skip this time</button><button class="ch-chip" data-act="edit">Edit</button><button class="ch-chip del" data-act="remove">Remove</button></div>
  </div>`;
}
function sheetHtml() {
  if (!sheet) return '';
  if (sheet.type === 'act') {
    const c = load().chores.find((x) => x.id === sheet.id);
    if (!c) { sheet = null; return ''; }
    return `<div class="ch-shade" data-act="shade">${actSheet(c)}</div>`;
  }
  if (sheet.type === 'full') {
    return `<div class="ch-shade" data-act="shade"><div class="ch-act">
      <div class="ch-ah"><div class="t"><b>The chore list is full</b><span>Remove a chore you no longer need to make room.</span></div><button class="ch-x" data-act="close" aria-label="Close">✕</button></div>
      <div class="ch-ab"><button class="ch-chip" data-act="close">OK</button></div></div></div>`;
  }
  const d = sheet.d;
  return `<div class="ch-shade"><div class="ch-sheet">${sheet.page === 'repeats' ? formRepeats(d) : sheet.page === 'first' ? formFirst(d) : d.wiz ? formWizard(d) : formMain(d)}</div></div>`;
}

// ---------------------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------------------
function render() {
  if (!root) return;
  const state = load();
  const now = today();
  shownDay = now;
  const names = peopleNames();
  if (!names.length) view = 'week';
  const none = !state.chores.length && !todayList(state, now, names).length;
  const sc = scores(state);
  const right = none ? '' : view === 'fair' ? `<div class="ch-month">${monthWord(now)}</div>`
    : `${sc.length === 2 ? seesaw(sc) : ''}<button class="ch-add" data-act="add">+ Add a chore</button>`;
  const body = none
    ? `<div class="ch-empty">${LINE.replace('class="ch-line"', '')}<p>No chores yet</p><button class="ch-add" data-act="add">+ Add a chore</button></div>`
    : view === 'fair' ? fairView(state, now, names) : weekView(state, now, names);
  const hold = root.querySelector('.ch-week');
  const scroll = hold ? hold.scrollTop : 0;
  root.querySelector('[data-main]').innerHTML = `<div class="ch-top"><a href="${backHref()}" class="x-btn glass">${esc(backLabel())}</a><div class="ch-title">Chores</div>
      ${!none && names.length ? `<div class="ch-seg"><button class="${view === 'week' ? 'on' : ''}" data-act="view" data-v="week">This week</button><button class="${view === 'fair' ? 'on' : ''}" data-act="view" data-v="fair">Fair share</button></div>` : ''}
      <div class="ch-right">${right}</div></div>${body}
    ${undo ? `<div class="ch-undo">${esc(undo.text)}<button data-act="undo">Undo</button></div>` : ''}`;
  const week = root.querySelector('.ch-week');
  if (week && scroll) week.scrollTop = scroll;
  popLog = '';
}
function drawSheet() {
  if (!root) return;
  if (kb) kb.close();
  root.querySelector('[data-sheet]').innerHTML = sheetHtml();
}
function offerUndo(snap, text) {
  clearTimeout(undoTimer);
  undo = { snap, text };
  undoTimer = setTimeout(() => { undo = null; render(); }, 7000);
}
function closeSheet() { sheet = null; drawSheet(); }

function typeName() {
  const d = sheet.d;
  const box = root.querySelector('.ch-nm');
  const used = load().chores.map((c) => c.name.toLowerCase());
  box.classList.add('typing');
  kb = openKeyboard(hostEl, {
    go: 'Done', text: d.name, max: 40, slots: 4,
    suggest: (t) => { const q = t.trim().toLowerCase(); return q ? PRESETS.filter((p) => p.toLowerCase().indexOf(q) >= 0 && p.toLowerCase() !== q && used.indexOf(p.toLowerCase()) < 0) : []; },
    onChange: (t) => {
      d.name = t;
      const b = root.querySelector('.ch-nm');
      if (b) b.innerHTML = nameInside(d);
      const go = root.querySelector('.ch-sh .go');
      if (go) go.disabled = !t.trim();
    },
    onGo: (pick, k) => {
      if (pick) k.set(pick);
      if (d.wiz && d.step === 'what' && d.name.trim()) wzAdvance(d);
      k.close();
    },
    onClose: () => { kb = null; d.name = d.name.trim(); if (sheet && sheet.type === 'form' && sheet.page === 'main') drawSheet(); },
  });
}

function onTap(e) {
  const t = e.target instanceof Element ? e.target.closest('[data-act]') : null;
  if (!t || t.disabled) return;
  const act = t.getAttribute('data-act');
  const v = t.getAttribute('data-v');
  const id = t.getAttribute('data-id');
  const d = sheet && sheet.type === 'form' ? sheet.d : null;
  // One tap, one tick: the list redraws at once and the next chore's tick lands in the same place.
  if (act === 'tick' || act === 'untick') {
    if (Date.now() - lastTick < 700) return;
    lastTick = Date.now();
  }
  switch (act) {
    case 'view': view = v; render(); break;
    case 'add': sheet = canAdd() ? { type: 'form', page: 'main', d: blank() } : { type: 'full' }; drawSheet(); break;
    case 'tick': {
      tick(id);
      const log = load().log;
      popLog = log.length ? log[log.length - 1].id : '';
      render();
      break;
    }
    case 'untick': untick(t.getAttribute('data-log')); render(); break;
    case 'open': sheet = { type: 'act', id }; drawSheet(); break;
    case 'shade': if (e.target === t) closeSheet(); break;
    case 'close': closeSheet(); break;
    case 'undo': clearTimeout(undoTimer); save(JSON.parse(undo.snap)); undo = null; render(); break;
    // ---- a chore's own sheet
    case 'by': case 'early': case 'skip': case 'remove': {
      const snap = JSON.stringify(load());
      const c = load().chores.find((x) => x.id === sheet.id);
      if (!c) { closeSheet(); break; }
      if (act === 'skip') { skip(c.id); offerUndo(snap, `${c.name} skipped`); }
      else if (act === 'remove') { removeChore(c.id); offerUndo(snap, `${c.name} removed`); }
      else tick(c.id, act === 'by' ? v : undefined);
      sheet = null;
      drawSheet();
      render();
      break;
    }
    case 'edit': {
      const c = load().chores.find((x) => x.id === sheet.id);
      sheet = c ? { type: 'form', page: 'main', d: draftOf(c) } : null;
      drawSheet();
      break;
    }
    // ---- the new chore / change sheet
    case 'type': if (kb) kb.close(); else typeName(); break;
    case 'preset':
      d.name = d.name === v && !d.wiz ? '' : v;
      if (d.name && !d.id) d.evening = /bins|dishes/i.test(v);
      if (d.wiz) wzAdvance(d); // (a one-tap answer: on to the next question)
      drawSheet();
      break;
    // ---- the new chore, one question at a time
    case 'w:next':
      if (d.step === 'what' && !d.name.trim()) break;
      wzAdvance(d);
      drawSheet();
      break;
    case 'w:back': { const steps = wzSteps(d); d.step = steps[Math.max(0, steps.indexOf(d.step) - 1)]; drawSheet(); break; }
    case 'w:go': d.step = v; drawSheet(); break;
    case 'w:often':
      d.other = v === 'other';
      if (v === 'week') { d.kind = 'weekly'; d.days = [weekday(d.start)]; } else d.kind = 'every';
      if (v === 'day') { d.n = 1; d.unit = 'day'; }
      if (v === '2week') { d.n = 2; d.unit = 'week'; }
      if (v === 'month') { d.n = 1; d.unit = 'month'; }
      if (!d.other) wzAdvance(d);
      drawSheet();
      break;
    case 'w:who':
      d.mode = v;
      d.pick = v === 'behind' ? 'behind' : 'turns';
      d.turns = v === 'behind' ? peopleNames() : v === 'one' && d.turns.length === 1 ? d.turns : [];
      wzAdvance(d);
      drawSheet();
      break;
    case 'w:one': d.turns = [v]; wzAdvance(d); drawSheet(); break;
    case 'w:order': {
      if (d.turns.indexOf(v) < 0) d.turns.push(v);
      const left = peopleNames().filter((n) => d.turns.indexOf(n) < 0);
      if (left.length === 1) d.turns.push(left[0]); // (the last one left goes last)
      if (left.length <= 1) wzAdvance(d);
      drawSheet();
      break;
    }
    case 'w:restart': d.turns = []; drawSheet(); break;
    case 'page': sheet.page = v; drawSheet(); break;
    case 'turn': {
      const i = d.turns.indexOf(v);
      if (i >= 0) d.turns.splice(i, 1); else d.turns.push(v);
      drawSheet();
      break;
    }
    case 'pick': d.pick = v; drawSheet(); break;
    case 'size': d.size = +v; if (d.wiz) wzAdvance(d); drawSheet(); break;
    case 'kind': d.kind = v; drawSheet(); break;
    case 'wd': {
      const i = d.days.indexOf(+v);
      if (i < 0) d.days.push(+v); else if (d.days.length > 1) d.days.splice(i, 1);
      drawSheet();
      break;
    }
    case 'n': d.n = Math.max(1, Math.min(52, d.n + +v)); drawSheet(); break;
    case 'unit': d.unit = v; drawSheet(); break;
    case 'eve': d.evening = v === '1'; drawSheet(); break;
    case 'month': d.month = addMonths(`${d.month}-01`, +v).slice(0, 7); drawSheet(); break;
    case 'start':
      d.start = v;
      if (d.wiz && d.kind === 'weekly' && d.days.length === 1) { d.days = [weekday(v)]; } // ("every week" falls on the day picked)
      if (d.wiz) wzAdvance(d);
      sheet.page = 'main';
      drawSheet();
      break;
    case 'save':
      if (kb) kb.close();
      if (!d.name.trim()) break;
      if (d.id) updateChore(d.id, fieldsOf(d)); else addChore(fieldsOf(d));
      sheet = null;
      drawSheet();
      render();
      break;
    default:
  }
}

export function mount(el, ctx) {
  hostEl = el;
  const args = (ctx && ctx.args) || [];
  view = args[0] === 'fair' && peopleNames().length ? 'fair' : 'week';
  sheet = args[0] !== 'add' ? null : canAdd() ? { type: 'form', page: 'main', d: blank() } : { type: 'full' };
  undo = null;
  el.innerHTML = `<style>${CSS}${keyboardStyle({ panel: '#0B1226', go: '#FFD66B', goInk: '#2A2410' })}</style><div class="ch"><div data-main></div><div data-sheet></div></div>`;
  root = el.querySelector('.ch');
  root.addEventListener('click', onTap);
  render();
  drawSheet();
  // Past midnight the day's cards change.
  dayTimer = setInterval(() => { if (today() !== shownDay && !sheet) render(); }, 30000);
}

export function unmount() {
  clearInterval(dayTimer);
  clearTimeout(undoTimer);
  if (kb) kb.close();
  if (root) root.removeEventListener('click', onTap);
  root = null;
  hostEl = null;
  sheet = null;
  undo = null;
  kb = null;
}
