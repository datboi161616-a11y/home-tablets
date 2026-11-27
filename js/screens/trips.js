// Kitchen · Trips and countdowns (boards TRP01–03)
//   #/trips        the next trip as a big painted card (days to go, its forecast, how much is
//                  packed) and the later ones counting down beside it
//   #/trips/add    the same, with the "New trip" sheet up
//   #/trips/<id>   one trip: the countdown over its painting, the destination's forecast for
//                  its days, and the packing list in big tick rows (who packed what)
// The sheet: the name and the place typed on the screen's own keyboard, the days picked on a
// month, the packing list started from a template. "Edit" on a trip: remove items (✕), change
// its details, or remove the trip (Undo for each removal). Food on the list has "+ list":
// it goes on the shopping list. What is kept and how: services/trips-data.js.
import {
  trips, getTrip, saveTrip, removeTrip, restoreTrip, addItem, toggleItem, removeItem, restoreItem, markListed, packer, setPacker,
  countdown, rangeText, packed, tripForecast, loadForecast, onChanged, tripArt, wxArt, TEMPLATES, template, CATS, guessCat,
  isoDay, fromIso, placeLabel, town,
} from '../services/trips-data.js';
import { findPlaces } from '../services/location.js';
import { addExtra } from '../services/meal-plan.js';
import { chipShowsOn, onChipChanged } from '../services/timers.js';
import { backHref, backLabel } from '../services/nav.js';
import { openKeyboard, keyboardStyle } from './keyboard.js';
import { esc, people, personColor } from './ui.js';

let cleanup = null;
let comeBack = null; // { text, undo }: a trip was just removed; the list offers Undo

const TICK = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const ICON = (d) => `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#2A2340" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const TILE_ART = {
  weekend: ICON('<rect x="4" y="8" width="16" height="12" rx="2"/><path d="M9 8V5h6v3M4 13h16"/>'),
  beach: ICON('<path d="M12 4a8 8 0 0 1 8 8H4a8 8 0 0 1 8-8zM12 12v8M8 20h8"/>'),
  ski: ICON('<path d="M12 3v18M4 7.5l16 9M4 16.5l16-9M10 5l2 2 2-2M10 19l2-2 2 2"/>'),
  family: ICON('<rect x="4" y="10" width="16" height="10" rx="1.5"/><path d="M3 10h18M12 10v10M12 10c-2-4-6-4-6-1s6 1 6 1 6 2 6-1-4-3-6 1"/>'),
  empty: ICON('<path d="M12 6v12M6 12h12"/>'),
};
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const STYLE = `
  <style>
    .tp{position:absolute;left:0;top:0;width:100%;height:100%;overflow:hidden;font-family:Inter,system-ui,sans-serif;color:#FFFFFF;
      background:radial-gradient(ellipse 1100px 700px at 70% -10%,#5E4C82 0%,#2E2B55 48%,#171A33 100%)}
    .tp-hills{position:absolute;left:0;bottom:0}
    .tp-top{position:absolute;left:40px;top:20px;right:40px;display:flex;align-items:center;gap:12px}
    .tp-top .x-btn.glass{background:rgba(14,14,36,.55);box-shadow:inset 0 0 0 2px rgba(255,255,255,.28)}
    .tp-title{margin-left:10px;font:500 40px Outfit,sans-serif;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .tp-new{min-height:64px;padding:0 26px;border-radius:999px;border:0;background:#FF9A4D;color:#2A1505;font:600 20px Inter,sans-serif;cursor:pointer;flex:none;
      display:inline-flex;align-items:center;gap:10px;white-space:nowrap}
    .tp-new.lg{min-height:76px;padding:0 40px;font-size:23px}
    .tp-new s{font-size:26px;line-height:1;text-decoration:none}

    /* ---- the painted cards ---- */
    .tp-big,.tp-trip{position:absolute;left:40px;top:112px;height:648px;border-radius:30px;overflow:hidden;background:#22224A;color:#FFFFFF;
      box-shadow:0 6px 16px rgba(0,0,0,.35);display:flex;flex-direction:column;text-decoration:none}
    .tp-big{width:760px}
    .tp-trip{width:580px}
    .tp-art{position:relative;flex:1 1 0;min-height:0;overflow:hidden}
    .tp-art>svg{position:absolute;left:0;top:0;width:100%;height:100%}
    .tp-art>i{position:absolute;left:0;bottom:0;width:100%;height:190px;background:linear-gradient(180deg,rgba(20,18,44,0),rgba(20,18,44,.85))}
    .tp-art.d>i{height:150px;background:linear-gradient(180deg,rgba(34,34,74,0),rgba(34,34,74,1))}
    .tp-art.light>u{position:absolute;left:0;top:0;width:100%;height:230px;background:linear-gradient(180deg,rgba(20,18,44,.5),rgba(20,18,44,0))}
    .tp-count{position:absolute;left:34px;top:26px;display:flex;align-items:baseline;white-space:nowrap}
    .tp-count b{font:700 150px/1 Outfit,sans-serif;margin-right:14px}
    .tp-count span{font:500 44px Outfit,sans-serif}
    .tp-count b.w,.tp-art.d .tp-count b.w{font-size:104px}
    .tp-art.d .tp-count{left:30px;top:22px}
    .tp-art.d .tp-count b{font-size:128px;margin-right:12px}
    .tp-art.d .tp-count span{font-size:40px}
    .tp-name{position:absolute;left:34px;right:34px;bottom:20px}
    .tp-name b{display:block;font:700 44px/1.1 Outfit,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .tp-name span,.tp-when{display:block;font:500 21px Inter,sans-serif;color:rgba(255,255,255,.88);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .tp-name span{margin-top:6px}
    .tp-when{position:absolute;left:30px;right:30px;bottom:18px}
    .tp-wx{flex:none;display:flex;height:88px;align-items:center;padding:14px 34px 0}
    .tp-wx div{flex:1;display:flex;align-items:center}
    .tp-wx p{margin:0 0 0 10px;font:500 26px/1.1 Outfit,sans-serif}
    .tp-wx p small{display:block;font:600 18px Inter,sans-serif;color:rgba(255,255,255,.75);margin-bottom:2px}
    .tp-wx p span,.tp-tile b span{color:rgba(255,255,255,.6);font-size:21px}
    .tp-packed{flex:none;padding:22px 34px 30px}
    .tp-packed.line{margin-top:12px;box-shadow:inset 0 2px 0 rgba(255,255,255,.12)}
    .tp-packed>div{display:flex;align-items:baseline;font:600 21px Inter,sans-serif}
    .tp-packed b{margin-left:auto;font:700 26px Outfit,sans-serif}
    .tp-packed b span{font-weight:500;color:rgba(255,255,255,.65)}
    .tp-bar{height:14px;border-radius:999px;background:rgba(255,255,255,.2);overflow:hidden;margin-top:10px}
    .tp-bar i{display:block;height:100%;border-radius:999px;background:#FF9A4D}

    .tp-side{position:absolute;left:820px;top:112px;width:420px;height:648px;overflow-y:auto;-webkit-overflow-scrolling:touch}
    /* a kitchen timer is counting: its chip takes a bottom corner (right on the list, left on a trip) */
    .tp.chip .tp-side,.tp.chip .tp-trip{height:580px}
    .tp-small{display:flex;height:205px;border-radius:26px;overflow:hidden;background:#FFF7EC;color:#2A2340;margin-bottom:16px;text-decoration:none}
    .tp-small:last-child{margin-bottom:0}
    .tp-small>div:first-child{width:150px;flex:none}
    .tp-small>div:last-child{flex:1;min-width:0;padding:20px 14px 20px 22px;display:flex;flex-direction:column}
    .tp-small p{margin:0;display:flex;align-items:baseline;white-space:nowrap}
    .tp-small p b{font:700 58px/1 Outfit,sans-serif;margin-right:8px}
    .tp-small p span{font:500 22px Outfit,sans-serif;color:#6B6385}
    .tp-small h3{margin:auto 0 0;font:700 25px/1.15 Outfit,sans-serif;max-height:58px;overflow:hidden}
    .tp-small em{font:500 17px Inter,sans-serif;font-style:normal;color:#6B6385;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

    .tp-empty{position:absolute;left:0;top:112px;width:100%;display:flex;flex-direction:column;align-items:center}
    .tp-empty .tp-art{flex:none;width:640px;height:400px;border-radius:30px}
    .tp-empty .tp-art>i{display:none}
    .tp-empty-line{font-size:36px;margin:30px 0 26px}

    /* ---- one trip ---- */
    .tp-fc{flex:none;padding:6px 30px 28px}
    .tp-where{font:500 22px Outfit,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .tp-tiles{display:flex;margin-top:14px}
    .tp-tile{flex:1;display:flex;flex-direction:column;align-items:center;padding:16px 0 18px;border-radius:18px;background:rgba(255,255,255,.08);margin-right:12px}
    .tp-tile:last-child{margin-right:0}
    .tp-tile small{font:600 18px Inter,sans-serif;color:rgba(255,255,255,.8)}
    .tp-tile b{font:500 32px/1 Outfit,sans-serif;margin-top:4px}
    .tp-tile b span{font-size:24px}
    .tp-tile em{margin-top:8px;font:600 17px Inter,sans-serif;font-style:normal;color:rgba(255,255,255,.8)}

    .tp-pack{position:absolute;left:640px;top:112px;width:600px;height:648px;border-radius:30px;background:#FFF7EC;color:#2A2340;box-shadow:0 6px 16px rgba(0,0,0,.35);
      padding:16px 26px 22px;box-sizing:border-box;display:flex;flex-direction:column}
    .tp-ph{display:flex;align-items:center;min-height:56px;flex:none}
    .tp-ph h2{margin:0;font:500 30px Outfit,sans-serif}
    .tp-ph>b{margin-left:auto;font:700 28px Outfit,sans-serif;white-space:nowrap}
    .tp-ph>b span{font-weight:500;color:#8A7FA6}
    .tp-who{display:flex;margin-left:14px}
    .tp-who button{width:56px;height:56px;border:0;background:transparent;padding:0;cursor:pointer;display:flex;align-items:center;justify-content:center;opacity:.4}
    .tp-who button.on{opacity:1}
    .tp-who button span{width:44px;height:44px;border-radius:50%;color:#FFFFFF;font:600 20px Outfit,sans-serif;display:flex;align-items:center;justify-content:center}
    .tp-who button.on span{box-shadow:0 0 0 3px #FFF7EC,0 0 0 6px #2A2340}
    .tp-pack .tp-bar{height:12px;background:#EDE3D3;flex:none;margin-top:6px}
    .tp-cols{display:flex;margin-top:10px;min-height:0;flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;align-items:flex-start}
    .tp-cols>div{flex:1 1 0;min-width:0}
    .tp-cols>div:first-child{margin-right:26px}
    .tp-cat{display:flex;align-items:baseline;margin:6px 0 2px;font:600 15px Inter,sans-serif;letter-spacing:1.4px;color:#8A7FA6;text-transform:uppercase}
    .tp-cat span{margin-left:auto}
    .tp-row{display:flex;align-items:center;min-height:58px;border-bottom:2px solid #F0E6D8;cursor:pointer}
    .tp-row>i{width:40px;height:40px;border-radius:50%;border:3px solid #C9BFD9;box-sizing:border-box;flex:none;display:flex;align-items:center;justify-content:center;margin-right:14px}
    .tp-row>span{font:600 20px Inter,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;flex:1}
    .tp-row.done>span{color:#9A93AE;text-decoration:line-through}
    .tp-row>em{font:600 16px Inter,sans-serif;font-style:normal;color:#8A7FA6;flex:none;margin-left:8px;white-space:nowrap}
    .tp-row.pop>i{animation:tp-pop .28s ease-out both}
    @keyframes tp-pop{0%{transform:scale(.6)}60%{transform:scale(1.15)}100%{transform:scale(1)}}
    .tp-plus,.tp-del{flex:none;height:56px;border:0;background:transparent;padding:0;cursor:pointer;display:flex;align-items:center;margin-left:6px}
    .tp-plus u{text-decoration:none;min-height:40px;padding:0 14px;border-radius:999px;background:#F1E5D3;color:#2A2340;font:600 16px Inter,sans-serif;display:flex;align-items:center;white-space:nowrap}
    .tp-del{width:56px;justify-content:center;font:600 22px Inter,sans-serif;color:#B4472F}
    .tp-none{flex:1;display:flex;align-items:center;justify-content:center;font-size:28px;color:#8A7FA6}
    .tp-add{margin-top:14px;min-height:64px;border-radius:20px;border:0;background:#F1E5D3;color:#2A2340;font:600 21px Inter,sans-serif;cursor:pointer;flex:none;
      display:flex;align-items:center;justify-content:center}
    .tp-add s{font-size:28px;line-height:1;text-decoration:none;margin-right:10px}

    /* typing a new item: a box over the top of the list, the keyboard below */
    .tp-addbox{position:absolute;left:640px;top:112px;width:600px;border-radius:30px;background:#FFF7EC;color:#2A2340;box-shadow:0 0 0 3px #FF9A4D;
      padding:18px;box-sizing:border-box}
    .tp-type{min-height:76px;border-radius:20px;background:#F3E9DA;display:flex;align-items:center;padding:0 24px;font:500 28px Outfit,sans-serif;white-space:nowrap;overflow:hidden}
    .tp-type.ph{color:#9A93AE}
    .tp-type.on{box-shadow:inset 0 0 0 3px #FF9A4D}
    .tp-type.on:after{content:'';width:3px;height:34px;background:#FF9A4D;margin-left:3px;flex:none}
    .tp-cats{display:flex;margin-top:12px}
    .tp-cats button{flex:1 1 0;min-width:0;min-height:56px;border-radius:16px;border:0;background:#F1E5D3;color:#2A2340;font:600 16px Inter,sans-serif;cursor:pointer;margin-right:8px;padding:0}
    .tp-cats button:last-child{margin-right:0}
    .tp-cats button.on{background:#2A2340;color:#FFF7EC}
    .tp-last{font:600 17px Inter,sans-serif;color:#2C8478;margin:12px 6px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

    /* ---- the sheet ---- */
    .tp-scrim{position:absolute;left:0;top:0;width:100%;height:100%;z-index:5;background:rgba(10,8,24,.66)}
    .tp-sheet{position:absolute;left:200px;top:70px;width:880px;border-radius:32px;background:#FFF7EC;color:#2A2340;box-shadow:0 8px 24px rgba(0,0,0,.5);overflow:hidden;display:flex;flex-direction:column}
    .tp-sh{display:flex;align-items:center;height:76px;padding:0 14px;border-bottom:2px solid #EADFCF;flex:none}
    .tp-sh h2{flex:1;margin:0;text-align:center;font:500 26px Outfit,sans-serif;white-space:nowrap}
    .tp-sh button{min-height:56px;min-width:110px;border:0;background:transparent;font:600 20px Inter,sans-serif;color:#6B6385;cursor:pointer;border-radius:999px;padding:0 24px}
    .tp-sh button.go{background:#FF9A4D;color:#2A1505}
    .tp-sheet .tp-type{margin:16px 18px 0;cursor:pointer}
    .tp-box{margin:12px 18px 18px;border-radius:20px;background:#FBF2E5}
    .tp-line{display:flex;align-items:center;min-height:68px;padding:0 24px;border-bottom:2px solid #F0E6D8;font:600 21px Inter,sans-serif;cursor:pointer}
    .tp-line span{margin-left:auto;font-weight:500;color:#6B6385;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:560px}
    .tp-line span.need{color:#C25E14;font-weight:600}
    .tp-line.on span{color:#2A2340}
    .tp-line.on span:after{content:'';display:inline-block;width:3px;height:26px;background:#FF9A4D;margin-left:3px;vertical-align:middle}
    .tp-line>i{margin-left:14px;color:#B9AFCC;font-size:26px;font-style:normal}
    .tp-line.last{border-bottom:0}
    .tp-tpl{padding:0 24px 22px}
    .tp-tpl>p{margin:0;display:flex;align-items:center;min-height:64px;font:600 21px Inter,sans-serif}
    .tp-tpl>p span{margin-left:auto;color:#C25E14}
    .tp-tiles5{display:flex}
    .tp-t{flex:1 1 0;height:150px;border-radius:22px;background:#FFFFFF;border:3px solid #EADFCF;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;
      cursor:pointer;margin-right:12px;padding:0;color:#2A2340}
    .tp-t:last-child{margin-right:0}
    .tp-t.on{background:#FFE2C8;border-color:#FF9A4D}
    .tp-t b{font:700 20px Outfit,sans-serif;margin:8px 0}
    .tp-t span{font:500 16px Inter,sans-serif;color:#6B6385}
    .tp-chips{display:flex;flex-wrap:wrap;margin:8px -10px 0 0;height:98px;overflow:hidden}
    .tp-chips span{min-height:40px;padding:0 16px;border-radius:999px;background:#FFFFFF;border:2px solid #EADFCF;display:inline-flex;align-items:center;font:600 17px Inter,sans-serif;margin:10px 10px 0 0}
    /* picking the days */
    .tp-mon{display:flex;align-items:center;height:72px;padding:0 18px;flex:none}
    .tp-mon b{flex:1;text-align:center;font:500 26px Outfit,sans-serif}
    .tp-mon button{width:64px;height:56px;border-radius:999px;border:0;background:#F1E5D3;color:#2A2340;font:600 26px Inter,sans-serif;cursor:pointer;padding:0}
    .tp-mon button[disabled]{opacity:.35}
    .tp-grid{display:flex;flex-wrap:wrap;padding:0 18px 18px}
    .tp-grid small{width:14.28%;text-align:center;font:600 15px Inter,sans-serif;letter-spacing:1px;color:#8A7FA6;text-transform:uppercase;height:30px}
    .tp-grid button,.tp-grid i{width:14.28%;height:62px;border:0;background:transparent;font:600 22px Inter,sans-serif;color:#2A2340;cursor:pointer;padding:0;margin:1px 0}
    .tp-grid button[disabled]{color:#C9BFD9;cursor:default}
    .tp-grid button.in{background:#FFE2C8}
    .tp-grid button.a,.tp-grid button.b{background:#FF9A4D;color:#2A1505;font-weight:700}
    .tp-grid button.a{border-radius:31px 0 0 31px}
    .tp-grid button.b{border-radius:0 31px 31px 0}
    .tp-grid button.a.b{border-radius:31px}
    .tp-grid button.now{text-decoration:underline}

    .tp-toast{position:absolute;left:50%;bottom:20px;transform:translateX(-50%);z-index:6;display:flex;align-items:center;background:#FFF7EC;color:#2A2340;border-radius:999px;
      padding:8px 8px 8px 28px;font:600 20px Inter,sans-serif;box-shadow:0 4px 12px rgba(0,0,0,.4);max-width:760px}
    .tp-toast span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;margin-right:18px}
    ${keyboardStyle({ panel: '#1B1C3A', key: '#FFF7EC', ink: '#2A2340', go: '#FF9A4D', goInk: '#2A1505', space: '#6B6385' })}
  </style>`;

const HILLS = `<svg class="tp-hills" width="1280" height="260" viewBox="0 0 1280 260" preserveAspectRatio="none" aria-hidden="true">
  <path d="M0 150L120 90 230 150 360 70 520 160 640 100 780 170 900 80 1040 150 1160 96 1280 140V260H0z" fill="#232349" opacity=".8"/>
  <path d="M0 200l90-40 120 50 160-60 150 60 140-40 170 50 140-60 150 50 160-30V260H0z" fill="#1B1C3A"/></svg>`;

const href = (t) => `#/trips/${encodeURIComponent(t.id)}`;
const whereWhen = (t, long) => [t.where, rangeText(t.start, t.end, long)].filter(Boolean).join(' · ');
// A painting with its countdown over it (`d`: the smaller one on a trip's own page).
const count = (t) => { const c = countdown(t); return `<div class="tp-count"><b${c.unit ? '' : ' class="w"'}>${c.big}</b><span>${c.unit}</span></div>`; };
const art = (t, cls, inside) => `<div class="tp-art ${cls}${t.art === 'ski' || t.art === 'beach' ? ' light' : ''}">${tripArt(t.art, '100%', '100%')}<i></i><u></u>${count(t)}${inside}</div>`;
const bar = (p) => `<div class="tp-bar"><i style="width:${p.total ? Math.round(p.done / p.total * 100) : 0}%"></i></div>`;

function listHtml() {
  const all = trips();
  if (!all.length) {
    return `<div class="tp-empty"><div class="tp-art">${tripArt('cabin', '100%', '100%')}</div>
      <div class="x-serif tp-empty-line">No trips yet</div><button type="button" class="tp-new lg" data-new><s>+</s> New trip</button></div>`;
  }
  const t = all[0];
  const p = packed(t);
  const wx = tripForecast(t);
  const small = (s) => {
    const c = countdown(s);
    return `<a class="tp-small" href="${href(s)}"><div>${tripArt(s.art, 150, 205)}</div>
      <div><p><b>${c.big}</b><span>${c.unit}</span></p><h3>${esc(s.name)}</h3><em>${esc(whereWhen(s, false))}</em></div></a>`;
  };
  return `<a class="tp-big" href="${href(t)}">
      ${art(t, '', `<div class="tp-name"><b>${esc(t.name)}</b><span>${esc(whereWhen(t, true))}</span></div>`)}
      ${wx.length ? `<div class="tp-wx">${wx.map((d) => `<div>${wxArt(d.icon, 48)}<p><small>${d.day}</small>${d.hi}° <span>${d.lo}°</span></p></div>`).join('')}</div>` : ''}
      ${p.total ? `<div class="tp-packed${wx.length ? ' line' : ''}"><div>Packed<b>${p.done} <span>of ${p.total}</span></b></div>${bar(p)}</div>` : ''}
    </a>
    <div class="tp-side">${all.slice(1).map(small).join('')}</div>`;
}

export function mount(el, ctx) {
  // A trip's page goes back where it was opened from: the list, the calendar, Home.
  el.addEventListener('click', (e) => {
    if (!(e.target instanceof Element) || !e.target.closest('[data-trip-back]')) return;
    if (history.length > 1) history.back(); else location.hash = '#/trips';
  });
  const arg = (ctx.args && ctx.args[0]) || '';
  const tripId = arg && arg !== 'add' && trips().some((t) => t.id === arg) ? arg : ''; // (a trip that is over, or gone: the list)
  let sheet = null;    // the New trip / Edit trip sheet: its draft and which part is up
  let kb = null;
  let editing = false; // a trip's page with ✕ on every item
  let adding = null;   // { cat (chosen by hand, else guessed), last (just added) }: typing a new item
  let toast = comeBack; // { text, undo }
  let toastT = 0;
  let dayT = 0;
  let popId = '';      // the row just ticked (it pops once)
  let found = [];      // places found for what is typed in "Where"
  let lookT = 0;
  let lookN = 0;
  comeBack = null;

  el.innerHTML = `${STYLE}<div class="tp" data-root>${HILLS}<div class="tp-top" data-top></div><div data-body></div><div data-over></div><div data-toast></div></div>`;
  const root = el.querySelector('[data-root]');
  const $ = (s) => root.querySelector(s);
  const today = () => isoDay();

  // ---- drawing ----
  function drawTop() {
    const t = tripId && getTrip(tripId);
    $('[data-top]').innerHTML = t
      ? `<button type="button" class="x-btn glass" data-trip-back>← Back</button><div class="tp-title">${esc(t.name)}</div>${editing
        ? '<button type="button" class="x-btn glass" data-remove>Remove trip</button><button type="button" class="x-btn glass" data-details>Details</button><button type="button" class="tp-new" data-edit>Done</button>'
        : '<button type="button" class="x-btn glass" data-edit>Edit</button>'}`
      : `<a class="x-btn glass" href="${backHref()}">${esc(backLabel())}</a><div class="tp-title">Trips</div>${trips().length ? '<button type="button" class="tp-new" data-new><s>+</s> New trip</button>' : ''}`;
  }

  function packHtml(t) {
    const p = packed(t);
    const who = people();
    const me = currentPacker();
    const row = (i) => {
      const id = esc(i.id);
      const color = i.by ? personColor(i.by) : '#3BA99C';
      const side = editing ? `<button type="button" class="tp-del" data-del="${id}" aria-label="Remove">✕</button>`
        : i.done ? (i.by ? `<em style="color:${color}">${esc(i.by)}</em>` : '')
          : i.cat !== 'Food' ? '' : i.listed ? '<em>On list</em>' : `<button type="button" class="tp-plus" data-list="${id}"><u>+ list</u></button>`;
      return `<div class="tp-row${i.done ? ' done' : ''}${i.id === popId ? ' pop' : ''}" data-tick="${id}" role="button">
        <i${i.done ? ` style="background:${color};border-color:${color}"` : ''}>${i.done ? TICK : ''}</i><span>${esc(i.text)}</span>${side}</div>`;
    };
    // Each kind of thing under its own heading, in two columns of about the same length.
    const cols = [[], []];
    const tall = [0, 0];
    CATS.forEach((cat) => {
      const items = t.items.filter((i) => i.cat === cat);
      if (!items.length) return;
      const k = tall[0] <= tall[1] ? 0 : 1;
      tall[k] += items.length + 0.6;
      cols[k].push(`<div class="tp-cat">${cat}<span>${items.filter((i) => i.done).length} / ${items.length}</span></div>${items.map(row).join('')}`);
    });
    return `<div class="tp-ph"><h2>Packing</h2>
        ${who.length ? `<div class="tp-who">${who.map((w) => `<button type="button" data-who="${esc(w.name)}" class="${w.name === me ? 'on' : ''}" aria-label="${esc(w.name)}"><span style="background:${w.color}">${esc(w.initial)}</span></button>`).join('')}</div>` : ''}
        ${p.total ? `<b>${p.done} <span>of ${p.total}</span></b>` : ''}</div>
      ${p.total ? `${bar(p)}<div class="tp-cols" data-cols><div>${cols[0].join('')}</div><div>${cols[1].join('')}</div></div>`
        : '<div class="x-serif tp-none">Nothing to pack yet</div>'}
      <button type="button" class="tp-add" data-add><s>+</s> Add item</button>`;
  }
  // Whose ticks these are: the one chosen last, else the first person here ('' when nobody is named).
  function currentPacker() {
    const who = people().map((w) => w.name);
    const p = packer();
    return who.indexOf(p) >= 0 ? p : who[0] || '';
  }

  function drawBody() {
    const t = tripId && getTrip(tripId);
    const body = $('[data-body]');
    if (!tripId) { body.innerHTML = listHtml(); return; }
    if (!t) { location.hash = '#/trips'; return; } // (removed from under us)
    const wx = tripForecast(t);
    const scroll = $('[data-cols]') ? $('[data-cols]').scrollTop : 0;
    body.innerHTML = `<div class="tp-trip">
        ${art(t, 'd', `<div class="tp-when">${esc(wx.length ? rangeText(t.start, t.end, true) : whereWhen(t, true))}</div>`)}
        ${wx.length ? `<div class="tp-fc"><div class="tp-where">${esc(t.where)}</div><div class="tp-tiles">${wx.map((d) => `<div class="tp-tile"><small>${d.day}</small>${wxArt(d.icon, 72)}<b>${d.hi}° <span>${d.lo}°</span></b><em>${esc(d.words)}</em></div>`).join('')}</div></div>` : ''}
      </div><div class="tp-pack">${packHtml(t)}</div>`;
    if ($('[data-cols]')) $('[data-cols]').scrollTop = scroll;
    popId = '';
  }

  function drawToast() {
    clearTimeout(toastT);
    $('[data-toast]').innerHTML = toast ? `<div class="tp-toast"><span>${esc(toast.text)}</span><button type="button" class="x-btn ink sm" data-undo>Undo</button></div>` : '';
    if (toast) toastT = setTimeout(() => { toast = null; drawToast(); }, 7000);
  }

  // ---- typing a new item ----
  // Each key changes only the box: the shade over the whole screen stays (painting all of it
  // again for every letter is slow on the tablet).
  function showAdd() {
    const text = kb ? kb.text : '';
    const cat = adding.cat || guessCat(text);
    const inner = `<div class="tp-addbox"><div class="tp-type on${text ? '' : ' ph'}">${esc(text) || 'Add item'}</div>
      <div class="tp-cats">${CATS.map((c) => `<button type="button" data-cat="${c}" class="${c === cat ? 'on' : ''}">${c}</button>`).join('')}</div>
      ${adding.last ? `<div class="tp-last">✓ ${esc(adding.last)}</div>` : ''}</div>`;
    const scrim = $('[data-over] > .tp-scrim:not([data-scrim])');
    if (scrim) scrim.innerHTML = inner;
    else $('[data-over]').innerHTML = `<div class="tp-scrim">${inner}</div>`;
  }
  function openAdd() {
    adding = { cat: '', last: '' };
    kb = openKeyboard(root, {
      go: 'Add', max: 40, slots: 0,
      onChange: () => { if (adding) showAdd(); },
      onGo: (pick, k) => {
        const item = addItem(tripId, k.text, adding.cat || guessCat(k.text));
        if (!item) return;
        adding = { cat: '', last: item.text };
        k.set('');
      },
      onClose: () => { kb = null; adding = null; $('[data-over]').innerHTML = ''; },
    });
  }

  // ---- the sheet ----
  function openSheet(t) {
    const month = fromIso(t ? t.start : today());
    sheet = t
      ? { id: t.id, name: t.name, where: t.where, place: t.place, start: t.start, end: t.end, template: '', pane: 'main', field: '', picking: false, month }
      : { id: '', name: '', where: '', place: null, start: '', end: '', template: 'weekend', pane: 'main', field: '', picking: false, month };
    drawSheet();
    if (!t) typeIn('name');
  }
  function closeSheet() {
    if (kb) kb.close();
    sheet = null;
    $('[data-over]').innerHTML = '';
    if (arg === 'add') history.replaceState(null, '', '#/trips');
  }
  function datesHtml() {
    const y = sheet.month.getFullYear();
    const m = sheet.month.getMonth();
    const now = today();
    const first = new Date(y, m, 1).getDay();
    const days = new Date(y, m + 1, 0).getDate();
    let cells = 'SMTWTFS'.split('').map((d) => `<small>${d}</small>`).join('') + '<i></i>'.repeat(first);
    for (let d = 1; d <= days; d++) {
      const iso = isoDay(new Date(y, m, d));
      const cls = [iso === sheet.start ? 'a' : '', iso === sheet.end ? 'b' : '', sheet.start && iso > sheet.start && iso < sheet.end ? 'in' : '', iso === now ? 'now' : ''].filter(Boolean).join(' ');
      cells += `<button type="button" data-day="${iso}" class="${cls}"${iso < now ? ' disabled' : ''}>${d}</button>`;
    }
    const atStart = y === fromIso(now).getFullYear() && m === fromIso(now).getMonth();
    return `<div class="tp-sh"><button type="button" style="visibility:hidden"></button><h2>${sheet.picking ? 'Now tap the day you come back' : sheet.start ? rangeText(sheet.start, sheet.end, true) : 'Tap the day you leave'}</h2><button type="button" class="go" data-dates>${sheet.picking ? 'Just one day' : 'Done'}</button></div>
      <div class="tp-mon"><button type="button" data-month="-1"${atStart ? ' disabled' : ''} aria-label="Earlier">‹</button><b>${MONTH_NAMES[m]} ${y}</b><button type="button" data-month="1" aria-label="Later">›</button></div>
      <div class="tp-grid">${cells}</div>`;
  }
  function drawSheet() {
    if (!sheet) return;
    const s = sheet;
    const tpl = template(s.template);
    const main = () => `<div class="tp-sh"><button type="button" data-cancel>Cancel</button><h2>${s.id ? 'Edit trip' : 'New trip'}</h2><button type="button" class="go" data-save>${s.id ? 'Save' : 'Add'}</button></div>
      <div class="tp-type${s.name ? '' : ' ph'}${s.field === 'name' ? ' on' : ''}" data-f="name" role="button">${esc(s.name) || (s.field === 'name' ? '' : 'Trip name')}</div>
      <div class="tp-box">
        <div class="tp-line${s.field === 'where' ? ' on' : ''}" data-f="where" role="button">Where<span>${esc(s.where)}</span><i>›</i></div>
        <div class="tp-line${s.id ? ' last' : ''}" data-dates role="button">Dates<span class="${s.start ? '' : 'need'}">${s.start ? rangeText(s.start, s.end, true) : 'Choose'}</span><i>›</i></div>
        ${s.id ? '' : `<div class="tp-tpl"><p>Packing list<span>${tpl.name}</span></p>
          <div class="tp-tiles5">${TEMPLATES.map((x) => `<button type="button" class="tp-t${x.id === s.template ? ' on' : ''}" data-tpl="${x.id}">${TILE_ART[x.id]}<b>${x.name}</b><span>${x.items.length} items</span></button>`).join('')}</div>
          <div class="tp-chips">${tpl.items.slice(0, 7).map((i) => `<span>${esc(i.text)}</span>`).join('')}${tpl.items.length > 7 ? `<span>+ ${tpl.items.length - 7} more</span>` : ''}</div></div>`}
      </div>`;
    // Already open: only the sheet's inside changes (each key, each choice), not the shade.
    const inner = s.pane === 'dates' ? datesHtml() : main();
    const box = $('[data-over] > [data-scrim] > .tp-sheet');
    if (box) box.innerHTML = inner;
    else $('[data-over]').innerHTML = `<div class="tp-scrim" data-scrim><div class="tp-sheet">${inner}</div></div>`;
  }
  // The places that match what is typed in "Where" (asked for a moment after the last key).
  function lookUp(text) {
    clearTimeout(lookT);
    const n = ++lookN;
    if (town(text).length < 3) { found = []; return; }
    lookT = setTimeout(() => {
      findPlaces(town(text)).then((list) => {
        if (n !== lookN || !kb) return;
        const seen = {};
        found = list.map((p) => ({ label: placeLabel(p), lat: p.lat, lon: p.lon })).filter((p) => (seen[p.label] ? false : (seen[p.label] = true))).slice(0, 3);
        kb.refresh();
      }, () => { /* no Wi-Fi: what was typed is kept as it is */ });
    }, 400);
  }
  function typeIn(field) {
    if (kb) kb.close();
    sheet.field = field;
    found = [];
    const isNew = !sheet.id;
    kb = openKeyboard(root, {
      go: field === 'name' && isNew ? 'Next' : 'Done', max: 40, slots: 3, text: sheet[field],
      suggest: () => (field === 'where' ? found.map((p) => p.label) : []),
      onChange: (text) => {
        if (!sheet) return;
        if (field === 'where' && text !== sheet.where) { sheet.place = null; lookUp(text); }
        sheet[field] = text;
        drawSheet();
      },
      onGo: (pick, k) => {
        const p = pick && found.filter((x) => x.label === pick)[0];
        if (p) { sheet.where = p.label; sheet.place = { lat: p.lat, lon: p.lon }; }
        k.close();
        if (field === 'name' && isNew && sheet.name.trim() && !sheet.where) typeIn('where');
      },
      onClose: () => { kb = null; clearTimeout(lookT); lookN++; if (sheet) { sheet.field = ''; const typed = sheet[field].trim(); sheet[field] = typed.charAt(0).toUpperCase() + typed.slice(1); drawSheet(); } },
    });
    drawSheet();
  }
  function saveSheet() {
    if (kb) kb.close();
    if (!sheet.name.trim()) { typeIn('name'); return; }
    if (!sheet.start) { sheet.pane = 'dates'; drawSheet(); return; }
    if (!saveTrip(sheet)) return;
    closeSheet();
  }

  // ---- taps ----
  root.addEventListener('click', (e) => {
    const hit = (sel) => (e.target instanceof Element ? e.target.closest(sel) : null);
    let t;
    if (hit('[data-kb]')) return;
    if ((t = hit('[data-undo]'))) { const u = toast; toast = null; drawToast(); if (u) u.undo(); return; }
    if (sheet) {
      if ((t = hit('[data-cancel]'))) closeSheet();
      else if ((t = hit('[data-save]'))) saveSheet();
      else if ((t = hit('[data-f]'))) typeIn(t.getAttribute('data-f'));
      else if ((t = hit('[data-dates]'))) { if (kb) kb.close(); sheet.pane = sheet.pane === 'dates' ? 'main' : 'dates'; sheet.picking = false; if (sheet.start) sheet.month = fromIso(sheet.start); drawSheet(); }
      else if ((t = hit('[data-tpl]'))) { sheet.template = t.getAttribute('data-tpl'); drawSheet(); }
      else if ((t = hit('[data-month]'))) { sheet.month = new Date(sheet.month.getFullYear(), sheet.month.getMonth() + Number(t.getAttribute('data-month')), 1); drawSheet(); }
      else if ((t = hit('[data-day]'))) {
        // First tap: the day it starts. Second: the day it ends (an earlier day starts again).
        const day = t.getAttribute('data-day');
        if (sheet.picking && day >= sheet.start) { sheet.end = day; sheet.picking = false; } else { sheet.start = sheet.end = day; sheet.picking = true; }
        drawSheet();
      } else if (kb && !hit('.tp-sheet')) kb.close();
      return;
    }
    if (adding) {
      if ((t = hit('[data-cat]'))) { adding.cat = t.getAttribute('data-cat'); showAdd(); }
      else if (!hit('.tp-addbox')) kb.close();
      return;
    }
    if (hit('[data-new]')) openSheet(null);
    else if (hit('[data-edit]')) { editing = !editing; drawTop(); drawBody(); }
    else if (hit('[data-details]')) { editing = false; drawTop(); drawBody(); openSheet(getTrip(tripId)); }
    else if (hit('[data-remove]')) {
      const was = removeTrip(tripId);
      if (was) comeBack = { text: `${was.name} removed`, undo: () => restoreTrip(was) };
      location.hash = '#/trips';
    } else if (hit('[data-add]')) openAdd();
    else if ((t = hit('[data-who]'))) setPacker(t.getAttribute('data-who'));
    else if ((t = hit('[data-del]'))) {
      const was = removeItem(tripId, t.getAttribute('data-del'));
      if (was) { toast = { text: `${was.item.text} removed`, undo: () => restoreItem(tripId, was) }; drawToast(); }
    } else if ((t = hit('[data-list]'))) {
      const id = t.getAttribute('data-list');
      const item = getTrip(tripId).items.filter((i) => i.id === id)[0];
      const how = item ? addExtra(item.text) : '';
      if (how && how !== 'unsaved') markListed(tripId, id);
    } else if ((t = hit('[data-tick]')) && !editing) {
      popId = t.getAttribute('data-tick');
      toggleItem(tripId, popId, currentPacker());
    }
  });

  // ---- keeping up ----
  const redraw = () => { if (!el.isConnected) return; drawTop(); drawBody(); if (adding) showAdd(); };
  const room = () => root.classList.toggle('chip', chipShowsOn('trips'));
  const offData = onChanged(redraw);
  const offChip = onChipChanged(room);
  // The numbers change at midnight.
  const tomorrow = () => {
    const now = new Date();
    dayT = setTimeout(() => { redraw(); tomorrow(); }, new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime() + 2000);
  };
  tomorrow();
  cleanup = () => { offData(); offChip(); clearTimeout(toastT); clearTimeout(dayT); clearTimeout(lookT); if (kb) kb.close(); };

  room();
  drawTop();
  drawBody();
  drawToast();
  const shown = tripId ? getTrip(tripId) : trips()[0];
  if (shown) loadForecast(shown);
  if (arg === 'add') openSheet(null);
}

export function unmount() {
  if (cleanup) cleanup();
  cleanup = null;
}
