// Bills and renewals: what goes out and when.
//   #/bills          Due soon: each bill a paper stub with a big tick, next to what was paid this month
//   #/bills/month    The month: a timeline of what goes out when, and what each person pays
//   #/bills/add      Due soon with the "New bill" sheet open
//   #/bills/<id>     Due soon with that bill's sheet open
// The data and the pictures are in js/services/bills-data.js. Everything stays on this screen.
import { backHref, backLabel } from '../services/nav.js';
import { esc, people } from './ui.js';
import { openKeyboard, keyboardStyle } from './keyboard.js';
import * as B from '../services/bills-data.js';

const COMMON = ['Rent', 'Electric', 'Phones', 'Car insurance', 'Netflix', 'Internet', 'Water', 'Gas', 'Mortgage', 'Spotify', 'Credit card', 'Gym'];
const REPEATS = [['monthly', 1, 'Every month'], ['yearly', 1, 'Every year'], ['weeks', 1, 'Every week'], ['weeks', 2, 'Every 2 weeks'], ['weeks', 4, 'Every 4 weeks'], ['once', 1, 'Once']];
const HOMES = [[3, '3 days before'], [7, 'A week before'], [0, 'On the day'], [-1, 'Never']];
const SPARE_TINTS = ['#F2A7B8', '#C7B5F0', '#9AD0F0', '#F0D58A', '#B8E0A0', '#F7B58C'];
const TICK = (size, color, w = 3.2) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:block"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;

let cleanUp = null;

const STYLE = `
  .bl{position:absolute;left:0;top:0;right:0;bottom:0;overflow:hidden;font-family:Inter,system-ui,sans-serif;color:#F4EFE3;
    background:radial-gradient(ellipse 1100px 720px at 18% -12%,#2C5649 0%,#16302A 52%,#0B1B17 100%)}
  .bl button{font-family:inherit;border:0;cursor:pointer;-webkit-tap-highlight-color:transparent}
  .bl-top{position:absolute;left:40px;top:20px;right:40px;height:72px;display:flex;align-items:center;gap:22px}
  .bl-title{font:600 40px Outfit,sans-serif;color:#FFFFFF}
  .bl-tabs{display:flex;padding:4px;border-radius:999px;background:rgba(0,0,0,.28);box-shadow:inset 0 0 0 2px rgba(255,255,255,.14)}
  .bl-tab{min-height:56px;padding:0 26px;border-radius:999px;font:600 19px Inter,sans-serif;background:transparent;color:#DCE8E2}
  .bl-tab.on{background:#FBF4E4;color:#16302A}
  .bl-right{margin-left:auto;display:flex;align-items:center;gap:22px}
  .bl-left{text-align:right;font:600 26px Outfit,sans-serif;color:#FFFFFF;white-space:nowrap}
  .bl-bar{position:relative;width:300px;height:10px;border-radius:999px;background:rgba(255,255,255,.16);margin:8px 0 0 auto;overflow:hidden}
  .bl-bar i{position:absolute;left:0;top:0;bottom:0;background:#86D3A0;border-radius:999px}
  .bl-add{min-height:64px;padding:0 28px;border-radius:999px;background:#F2C46B;color:#2A2112;font:700 21px Inter,sans-serif;white-space:nowrap;box-shadow:0 3px 8px rgba(0,0,0,.25)}
  .bl-eyebrow{font:700 15px Inter,sans-serif;letter-spacing:1.6px;text-transform:uppercase}

  /* ---- due soon ---- */
  .bl-col{position:absolute;left:40px;top:120px;width:790px;bottom:24px;display:flex;flex-direction:column;gap:12px}
  .bl-list{flex:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;display:flex;flex-direction:column;gap:12px;padding-bottom:8px}
  .bl-stub{flex:none;height:108px;border-radius:24px;background:#FBF4E4;color:#2B2A22;display:flex;align-items:stretch;box-shadow:0 3px 8px rgba(0,0,0,.2);position:relative;overflow:hidden}
  .bl-stub-main{flex:1;min-width:0;display:flex;align-items:center;padding:0 0 0 18px;background:transparent;color:inherit;text-align:left}
  .bl-stub-name{font:600 26px Outfit,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .bl-stub-sub{font:500 19px Inter,sans-serif;margin-top:4px;color:#6E6A5A;white-space:nowrap;display:flex;align-items:center}
  .bl-stub-sub b{font-weight:600}
  .bl-stub-sub b.soon{color:#B5502E;font-weight:700}
  .bl-sep{margin:0 10px;color:#C9C2AE}
  .bl-dot{display:inline-block;width:14px;height:14px;border-radius:50%;margin-right:7px;flex:none}
  .bl-stub-amt{flex:none;text-align:right;padding:0 26px 0 12px;font:700 34px/1 Outfit,sans-serif;white-space:nowrap}
  .bl-stub-amt small{font:500 19px Inter,sans-serif;color:#9A9584}
  .bl-stub-amt em{font:500 19px Inter,sans-serif;font-style:normal;color:#6E6A5A;margin-right:6px}
  .bl-tick{flex:none;width:128px;border-left:3px dashed #E2D6BC;background:#F6EBD3;display:flex;align-items:center;justify-content:center;padding:0}
  .bl-tick span{width:72px;height:72px;border-radius:50%;box-shadow:inset 0 0 0 3px rgba(43,42,34,.28);display:flex;align-items:center;justify-content:center}
  .bl-tick.on span{background:#3F9A63;box-shadow:none;animation:bl-pop .3s ease-out both}
  .bl-tick.on path{stroke:#FFFFFF}
  .bl-notch{position:absolute;right:120px;width:18px;height:18px;border-radius:50%;pointer-events:none}
  @keyframes bl-pop{0%{transform:scale(.6)}60%{transform:scale(1.15)}100%{transform:scale(1)}}
  .bl-clear{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;font:italic 500 30px Fraunces,Georgia,serif;color:#DCE8E2}
  .bl-paid{position:absolute;left:862px;top:120px;width:378px;height:656px;box-sizing:border-box;border-radius:28px;background:rgba(4,14,11,.42);box-shadow:inset 0 0 0 2px rgba(255,255,255,.10);padding:20px 24px;display:flex;flex-direction:column}
  .bl-paid-list{margin-top:8px;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch}
  .bl-prow{display:flex;align-items:center;width:100%;height:62px;padding:0;background:transparent;color:inherit;text-align:left;border-bottom:1.5px solid rgba(255,255,255,.10)}
  .bl-prow:last-child{border-bottom:0}
  .bl-prow .n{font:600 20px Inter,sans-serif;color:#F4EFE3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .bl-prow .d{font:500 15px Inter,sans-serif;color:#A9BDB4}
  .bl-prow .a{font:600 21px Outfit,sans-serif;color:#F4EFE3;margin-right:12px}
  .bl-ok{flex:none;width:32px;height:32px;border-radius:50%;background:#3F9A63;display:flex;align-items:center;justify-content:center}
  .bl-spike{margin-top:auto;padding-top:14px;flex:none}
  .bl-empty{position:absolute;left:0;right:0;top:150px;display:flex;flex-direction:column;align-items:center;gap:26px}
  .bl-empty p{margin:0;font:italic 500 34px Fraunces,Georgia,serif;color:#F4EFE3}
  .bl-empty .bl-add{min-height:76px;padding:0 40px;font-size:24px}

  /* ---- the month ---- */
  .bl-nav{display:flex;align-items:center;gap:10px}
  .bl-arrow{width:64px;height:64px;border-radius:50%;background:rgba(0,0,0,.28);box-shadow:inset 0 0 0 2px rgba(255,255,255,.18);color:#F4EFE3;font:600 30px Inter,sans-serif;padding:0 0 4px}
  .bl-arrow[disabled]{opacity:.3}
  .bl-month{text-align:center;min-width:180px}
  .bl-month b{display:block;font:600 28px Outfit,sans-serif;color:#FFFFFF}
  .bl-month span{font:600 17px Inter,sans-serif;color:#A9BDB4}
  .bl-m div,.bl-m button{position:absolute}
  .bl-card{width:190px;height:132px;box-sizing:border-box;border-radius:20px;background:#FBF4E4;color:#2B2A22;padding:12px 14px;box-shadow:0 3px 8px rgba(0,0,0,.25);overflow:hidden;text-align:left}
  .bl-card.paid{background:#EDE6D4}
  .bl-card div{position:static}
  .bl-card .stripe{position:absolute;left:0;right:0;top:0;height:7px}
  .bl-card .h{display:flex;align-items:center;gap:8px;margin-top:4px;font:600 17px Inter,sans-serif;white-space:nowrap}
  .bl-card .h span{overflow:hidden;text-overflow:ellipsis}
  .bl-card .amt{font:700 30px/1 Outfit,sans-serif;margin-top:12px;white-space:nowrap}
  .bl-card .amt em{font:500 15px Inter,sans-serif;font-style:normal;color:#6E6A5A;margin-right:5px}
  .bl-card .sub{font:600 15px Inter,sans-serif;color:#6E6A5A;margin-top:7px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:122px}
  .bl-card .ok{position:absolute;right:12px;bottom:12px;width:30px;height:30px;border-radius:50%;background:#3F9A63;display:flex;align-items:center;justify-content:center}
  .bl-card .day{position:absolute;right:14px;bottom:14px;font:700 14px Inter,sans-serif;color:#B5502E;letter-spacing:.5px}
  .bl-who{position:absolute;left:40px;right:40px;top:578px;display:flex;gap:20px}
  .bl-who>div{flex:1 1 0;min-width:0;border-radius:26px;background:rgba(4,14,11,.45);box-shadow:inset 0 0 0 2px rgba(255,255,255,.10);padding:18px 22px;box-sizing:border-box}
  .bl-who .r{display:flex;align-items:center;gap:12px;font:600 22px Inter,sans-serif;white-space:nowrap}
  .bl-who .r b{margin-left:auto;font:700 38px/1 Outfit,sans-serif}
  .bl-who.many .r{flex-wrap:wrap;font-size:19px}
  .bl-who.many .r b{margin-left:0;flex-basis:100%;font-size:30px}
  .bl-who.many>div{padding:12px 18px}
  .bl-who.many .bl-seg{margin-top:10px}
  .bl-av{flex:none;width:44px;height:44px;border-radius:50%;color:#FFFFFF;display:flex;align-items:center;justify-content:center;font:700 20px Outfit,sans-serif}
  .bl-seg{display:flex;gap:4px;margin-top:16px}
  .bl-seg i{height:14px;border-radius:3px;min-width:3px}
  .bl-legend{position:absolute;left:40px;right:300px;top:716px;height:52px;overflow:hidden;display:flex;flex-wrap:wrap;gap:8px 26px;font:600 16px Inter,sans-serif;color:#C8D6CF}
  .bl-legend span{display:flex;align-items:center;gap:8px;white-space:nowrap}
  .bl-legend i{width:18px;height:14px;border-radius:3px}

  /* ---- the sheet ---- */
  .bl-shade{position:absolute;left:0;top:0;right:0;bottom:0;background:rgba(4,10,8,.72);z-index:5}
  .bl-sheet{position:absolute;left:250px;top:24px;width:780px;height:752px;border-radius:32px;background:#FBF4E4;color:#2B2A22;box-shadow:0 8px 24px rgba(0,0,0,.4);display:flex;flex-direction:column;overflow:hidden}
  .bl-sh-top{display:flex;align-items:center;height:76px;padding:0 12px;border-bottom:2px solid #EADFC6;flex:none}
  .bl-sh-top button{min-height:56px;min-width:110px;background:transparent;font:600 20px Inter,sans-serif;color:#6E6A5A}
  .bl-sh-top button.go{font:700 21px Inter,sans-serif;color:#1F6B47}
  .bl-sh-top button.go[disabled]{opacity:.35}
  .bl-sh-top div{flex:1;text-align:center;font:600 25px Outfit,sans-serif}
  .bl-namebox{margin:14px 16px 0;border-radius:22px;background:#F4E9D2;padding:14px 16px 16px;flex:none}
  .bl-name{display:flex;align-items:center;gap:16px;width:100%;height:72px;padding:0 12px;border-radius:16px;background:#FFFFFF;box-shadow:inset 0 0 0 2px #E6D7B8;font:600 28px Outfit,sans-serif;color:#2B2A22;text-align:left}
  .bl-name.typing{box-shadow:inset 0 0 0 3px #1F6B47}
  .bl-name span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .bl-name .ph{color:#B0A78F;font-weight:500}
  .bl-chips{display:flex;gap:10px;margin-top:12px;overflow:hidden}
  .bl-chip{min-height:56px;padding:0 22px;border-radius:999px;background:#F1E6CF;color:#3B3A30;display:inline-flex;align-items:center;justify-content:center;gap:10px;font:600 19px Inter,sans-serif;white-space:nowrap;flex:none;box-sizing:border-box}
  .bl-chip.on{background:#16302A;color:#FBF4E4}
  .bl-rows{margin:8px 16px 0}
  .bl-row{display:flex;align-items:center;width:100%;min-height:66px;padding:0 24px;background:transparent;border-bottom:2px solid #EFE3CC !important;font:600 21px Inter,sans-serif;color:#2B2A22;text-align:left}
  .bl-row.open,.bl-row.last{border-bottom:0 !important}
  .bl-row .v{margin-left:auto;font-weight:500;color:#6E6A5A;white-space:nowrap;display:flex;align-items:center;gap:8px}
  .bl-row .c{margin-left:14px;color:#B9AE94;font-size:26px;width:14px;text-align:center}
  .bl-ed{padding:0 16px 16px;border-bottom:2px solid #EFE3CC}
  .bl-ed.last{border-bottom:0}
  .bl-opts{display:flex;flex-wrap:wrap;gap:10px}
  .bl-opts .bl-chip{min-height:64px;flex:1 1 0}
  .bl-opts.three .bl-chip{flex:1 1 30%}
  .bl-pad{display:flex;gap:8px}
  .bl-keys{flex:1;display:flex;flex-wrap:wrap;gap:8px}
  .bl-key{flex:1 1 14%;height:64px;border-radius:14px;background:#FFFFFF;box-shadow:inset 0 0 0 2px #E6D7B8;font:600 26px Outfit,sans-serif;color:#2B2A22;padding:0}
  .bl-vary{flex:none;width:130px;border-radius:14px;background:#F1E6CF;color:#3B3A30;font:600 19px Inter,sans-serif}
  .bl-vary.on{background:#16302A;color:#FBF4E4}
  .bl-days{display:flex;flex-wrap:wrap;gap:6px}
  .bl-days button{flex:none;width:59px;height:58px;border-radius:12px;background:#FFFFFF;box-shadow:inset 0 0 0 2px #E6D7B8;font:600 21px Outfit,sans-serif;color:#2B2A22;padding:0}
  .bl-days button.on{background:#16302A;color:#FBF4E4;box-shadow:none}
  .bl-mini{width:30px;height:30px;border-radius:50%;color:#FFFFFF;display:flex;align-items:center;justify-content:center;font:700 15px Outfit,sans-serif;flex:none}
  .bl-foot{margin-top:18px;display:flex;gap:12px;padding:16px}
  .bl-foot button{flex:1;min-height:64px;border-radius:999px;font:600 20px Inter,sans-serif;background:#F1E6CF;color:#9A3B22}
  .bl-foot button.pay{background:#3F9A63;color:#FFFFFF}
  .bl-cal{flex:1;display:flex;flex-direction:column;padding:10px 20px 18px}
  .bl-cal-top{display:flex;align-items:center;height:72px;font:600 26px Outfit,sans-serif}
  .bl-cal-top b{flex:1;text-align:center;font-weight:600}
  .bl-cal-top button{width:64px;height:64px;border-radius:50%;background:#F1E6CF;color:#3B3A30;font:600 28px Inter,sans-serif;padding:0 0 4px}
  .bl-cal-grid{flex:1;display:flex;flex-wrap:wrap;align-content:flex-start}
  .bl-cal-grid span{width:14.28%;height:30px;text-align:center;font:600 15px Inter,sans-serif;color:#9A9584}
  .bl-cal-grid button,.bl-cal-grid i{width:14.28%;height:82px;background:transparent;font:600 24px Outfit,sans-serif;color:#2B2A22;padding:0}
  .bl-cal-grid button b{display:inline-flex;width:68px;height:68px;border-radius:50%;align-items:center;justify-content:center;font-weight:600}
  .bl-cal-grid button.today b{box-shadow:inset 0 0 0 2px #B5502E}
  .bl-cal-grid button.on b{background:#16302A;color:#FBF4E4;box-shadow:none}

  /* ---- undo ---- */
  .bl-undo{position:absolute;left:40px;bottom:24px;z-index:6;min-height:64px;padding:0 8px 0 26px;border-radius:999px;background:#FBF4E4;color:#2B2A22;display:flex;align-items:center;gap:14px;font:600 20px Inter,sans-serif;box-shadow:0 4px 12px rgba(0,0,0,.35)}
  .bl-undo button{min-height:52px;padding:0 24px;border-radius:999px;background:#16302A;color:#FBF4E4;font:700 19px Inter,sans-serif}
  ${keyboardStyle({ panel: '#0F241F', key: '#FBF4E4', ink: '#2B2A22', go: '#F2C46B', goInk: '#2A2112' })}
`;

export function mount(el, ctx) {
  if (cleanUp) cleanUp();
  const args = (ctx && ctx.args) || [];
  let view = args[0] === 'month' ? 'month' : 'soon';
  let shown = null; // the month on the timeline: [year, month]
  let sheet = null; // the open sheet's draft
  let kb = null;
  let undo = null;
  let undoTimer = 0;
  let dayTimer = 0;
  let busy = false; // a tick is popping

  el.innerHTML = `<style>${STYLE}</style><div class="bl"><div data-main></div><div data-sheet></div><div data-undo></div></div>`;
  const root = el.querySelector('.bl');
  const mainEl = root.querySelector('[data-main]');
  const sheetEl = root.querySelector('[data-sheet]');
  const undoEl = root.querySelector('[data-undo]');

  // ---- who ----
  const folks = () => people();
  const colorOf = (who, list) => {
    if (who === 'split') {
      const n = list.length;
      return `linear-gradient(90deg,${list.map((p, i) => `${p.color} ${(i * 100) / n}%,${p.color} ${((i + 1) * 100) / n}%`).join(',')})`;
    }
    const p = list.find((x) => x.name === who);
    return p ? p.color : '';
  };
  const whoWord = (who) => (who === 'split' ? 'Split' : who);

  // ---- the top bar ----
  function top(state, day) {
    const has = state.bills.length || state.paid.length;
    let right = '';
    if (has && view === 'soon') {
      const m = B.monthMoney(state, day);
      const month = B.monthName(B.parse(day).getMonth());
      const words = m.count ? `${m.left ? B.money(m.left) : m.count} left in ${month}` : m.paid ? `All paid in ${month}` : '';
      const part = m.paid + m.left > 0 ? (m.paid / (m.paid + m.left)) * 100 : m.count ? 0 : 100;
      right = `${words ? `<div><div class="bl-left">${esc(words)}</div><div class="bl-bar"><i style="width:${part.toFixed(1)}%"></i></div></div>` : ''}
        <button class="bl-add" data-add>+ Add a bill</button>`;
    } else if (has) {
      const now = B.parse(day);
      const span = (shown[0] - now.getFullYear()) * 12 + shown[1] - now.getMonth();
      const total = B.monthItems(state, shown[0], shown[1]).reduce((s, it) => s + (it.amount || 0), 0);
      right = `<div class="bl-nav"><button class="bl-arrow" data-month="-1" aria-label="Earlier"${span <= -12 ? ' disabled' : ''}>‹</button>
        <div class="bl-month"><b>${B.monthName(shown[1])}${shown[0] !== now.getFullYear() ? ` ${shown[0]}` : ''}</b>${total ? `<span>${B.money(total)} in all</span>` : ''}</div>
        <button class="bl-arrow" data-month="1" aria-label="Later"${span >= 12 ? ' disabled' : ''}>›</button></div>`;
    }
    return `<div class="bl-top"><a href="${backHref()}" class="x-btn glass">${esc(backLabel())}</a><div class="bl-title">Bills</div>
      ${has ? `<div class="bl-tabs"><button class="bl-tab${view === 'soon' ? ' on' : ''}" data-view="soon">Due soon</button><button class="bl-tab${view === 'month' ? ' on' : ''}" data-view="month">Month</button></div>` : ''}
      <div class="bl-right">${right}</div></div>`;
  }

  // ---- due soon ----
  function soon(state, day) {
    const list = B.dueList(state);
    const who = B.usesWho(state, folks().length);
    const stubs = list.map(({ bill, due }) => {
      const w = B.dueWords(due, day);
      const color = who && bill.who ? colorOf(bill.who, folks()) : '';
      const amt = bill.amount ? `${bill.varies ? '<em>about</em>' : ''}${B.money(bill.amount)}` : `<small>${esc(B.repeatWords(bill))}</small>`;
      return `<div class="bl-stub" data-stub="${esc(bill.id)}">
        <button class="bl-stub-main" data-open="${esc(bill.id)}">${B.billIcon(B.iconFor(bill.name), 72)}
          <div style="margin-left:20px;min-width:0;flex:1"><div class="bl-stub-name">${esc(bill.name)}</div>
            <div class="bl-stub-sub"><b${w.soon ? ' class="soon"' : ''}>${esc(w.text)}</b>${color ? `<span class="bl-sep">·</span><span class="bl-dot" style="background:${color}"></span>${esc(whoWord(bill.who))}` : ''}</div></div>
          <div class="bl-stub-amt">${amt}</div></button>
        <button class="bl-tick" data-pay="${esc(bill.id)}" aria-label="Paid"><span>${TICK(33, 'rgba(43,42,34,.22)')}</span></button>
        <div class="bl-notch" style="top:-9px;background:#16302A"></div><div class="bl-notch" style="bottom:-9px;background:#0F241F"></div>
      </div>`;
    }).join('');
    const d = B.parse(day);
    const [from, to] = B.monthSpan(d.getFullYear(), d.getMonth());
    const paid = state.paid.filter((p) => (p.at >= from && p.at <= to) || (p.due >= from && p.due <= to))
      .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
    return `<div class="bl-col"><div class="bl-eyebrow" style="color:#F2C46B;padding-left:6px">Due soon</div>
        ${list.length ? `<div class="bl-list">${stubs}</div>` : `<div class="bl-clear"><div class="bl-ok" style="width:96px;height:96px">${TICK(56, '#FFFFFF', 3.4)}</div>All paid</div>`}</div>
      <div class="bl-paid"><div class="bl-eyebrow" style="color:#86D3A0">Paid in ${B.monthName(d.getMonth())}</div>
        <div class="bl-paid-list">${paid.map((p) => `<button class="bl-prow" data-paid="${esc(p.pid)}">${B.billIcon(B.iconFor(p.name), 42)}
          <div style="margin-left:14px;flex:1;min-width:0"><div class="n">${esc(p.name)}</div><div class="d">${esc(B.shortDate(p.at, day))}</div></div>
          ${p.amount ? `<div class="a">${B.money(p.amount)}</div>` : ''}<div class="bl-ok">${TICK(20, '#FFFFFF', 3.4)}</div></button>`).join('')}</div>
        ${paid.length <= 6 ? `<div class="bl-spike">${B.spikeArt(330)}</div>` : ''}</div>`;
  }

  // ---- the month ----
  function month(state, day) {
    const [y, m] = shown;
    const [from, to] = B.monthSpan(y, m);
    const days = B.parse(to).getDate();
    const items = B.monthItems(state, y, m);
    const list = folks();
    const who = B.usesWho(state, list.length);
    const x = (d) => 98.7 + ((d - 1) * 1082.6) / (days - 1);
    let out = '';
    // Where each card sits: over its day, in two rows by turns, nudged apart where days crowd.
    const rows = [[], []];
    items.forEach((it, i) => { const c = { it, x: x(B.parse(it.due).getDate()), left: 0 }; c.left = Math.max(40, Math.min(1050, c.x - 95)); rows[i % 2].push(c); });
    rows.forEach((row) => {
      const step = Math.min(198, row.length > 1 ? 1010 / (row.length - 1) : 198);
      for (let i = 1; i < row.length; i++) row[i].left = Math.max(row[i].left, row[i - 1].left + step);
      for (let i = row.length - 1; i >= 0; i--) row[i].left = Math.min(row[i].left, i === row.length - 1 ? 1050 : row[i + 1].left - step);
      // A crowded month: the next card covers this one's right edge, so its corner (LATE, FRI, ✓) would show cut.
      for (let i = 0; i < row.length - 1; i++) row[i].covered = row[i + 1].left - row[i].left < 190;
    });
    const stem = (c, r) => {
      const late = !c.it.paid && c.it.due < day;
      const line = c.it.paid ? 'rgba(255,255,255,.35)' : late ? '#E8795A' : '#F2C46B';
      const sx = Math.max(c.left + 14, Math.min(c.left + 176, c.x));
      return `<div style="left:${(sx - 1.5).toFixed(1)}px;top:${r ? 416 : 264}px;width:3px;height:${r ? 36 : 188}px;background:${line}"></div>`
        + `<div style="left:${(sx - 8).toFixed(1)}px;top:444px;width:16px;height:16px;border-radius:50%;background:${c.it.paid ? '#86D3A0' : late ? '#E8795A' : '#F2C46B'};box-shadow:0 0 0 3px #102722"></div>`;
    };
    rows.forEach((row, r) => row.forEach((c) => { out += stem(c, r); }));
    // The line itself: filled up to today.
    const todayIn = day >= from && day <= to;
    const upTo = todayIn ? x(B.parse(day).getDate()) - 80 : day > to ? 1120 : 0;
    out += `<div style="left:80px;width:1120px;top:448px;height:8px;border-radius:999px;background:rgba(255,255,255,.14)"></div>`;
    if (upTo) out += `<div style="left:80px;width:${upTo.toFixed(1)}px;top:448px;height:8px;border-radius:999px;background:linear-gradient(90deg,#2E7A55,#86D3A0)"></div>`;
    const tDay = todayIn ? B.parse(day).getDate() : 0;
    for (let d = 1; d <= days; d++) {
      const label = d === 1 || d === days || (d % 5 === 0 && days - d > 2);
      if (d === tDay) continue;
      out += `<div style="left:${(x(d) - 1).toFixed(1)}px;top:466px;width:2px;height:${label ? 14 : 8}px;background:rgba(255,255,255,${label ? 0.5 : 0.22})"></div>`;
      if (label && !(tDay && Math.abs(d - tDay) < 2)) out += `<div style="left:${(x(d) - 30).toFixed(1)}px;width:60px;text-align:center;top:484px;font:600 17px Inter,sans-serif;color:#A9BDB4">${d}</div>`;
    }
    if (tDay) {
      out += `<div style="left:${(x(tDay) - 1.5).toFixed(1)}px;top:438px;width:3px;height:40px;background:#FFFFFF;border-radius:2px"></div>
        <div style="left:${(x(tDay) - 50).toFixed(1)}px;top:482px;width:100px;text-align:center"><span style="display:inline-block;padding:4px 12px;border-radius:999px;background:#FFFFFF;color:#16302A;font:700 14px Inter,sans-serif">TODAY ${tDay}</span></div>`;
    }
    rows.forEach((row, r) => row.forEach((c) => {
      const it = c.it;
      const color = who && it.who ? colorOf(it.who, list) : '';
      const w = B.dueWords(it.due, day);
      const corner = c.covered ? '' : it.paid ? `<div class="ok">${TICK(18, '#FFFFFF', 3.4)}</div>` : w.late ? '<div class="day">LATE</div>' : w.soon ? `<div class="day">${esc(B.weekday(it.due).slice(0, 3).toUpperCase())}</div>` : '';
      out += `<button class="bl-card${it.paid ? ' paid' : ''}" data-open="${esc(it.bill)}" style="left:${c.left.toFixed(1)}px;top:${r ? 284 : 132}px">
        ${color ? `<div class="stripe" style="background:${color}"></div>` : ''}${corner}
        <div class="h">${B.billIcon(B.iconFor(it.name), 38)}<span>${esc(it.name)}</span></div>
        <div class="amt">${it.amount ? `${it.varies ? '<em>about</em>' : ''}${B.money(it.amount)}` : '&nbsp;'}</div>
        <div class="sub">${esc(B.shortDate(it.due, it.due))}${color ? `<span style="margin:0 7px;color:#C9C2AE">·</span>${esc(whoWord(it.who))}` : ''}</div></button>`;
    }));
    if (!items.length) out += `<div style="left:0;right:0;top:250px;text-align:center;font:italic 500 30px Fraunces,Georgia,serif;color:#DCE8E2">Nothing due in ${B.monthName(m)}</div>`;
    // What each person pays.
    let pays = '';
    const split = who ? B.shares(items, list.map((p) => p.name)) : [];
    if (split.length) {
      const tints = {};
      const used = {};
      let spare = 0;
      split.forEach((p) => p.parts.forEach((part) => {
        if (tints[part.name]) return;
        let t = B.billTint(B.iconFor(part.name));
        if (used[t]) { t = SPARE_TINTS[spare % SPARE_TINTS.length]; spare += 1; }
        used[t] = true;
        tints[part.name] = t;
      }));
      const shared = {};
      items.forEach((it) => { if (it.who === 'split') shared[it.name] = true; });
      pays = `<div style="position:absolute;left:40px;right:40px;top:548px;height:1.5px;background:rgba(255,255,255,.10)"></div>
        <div class="bl-who${split.length > 3 ? ' many' : ''}">${split.map((p) => `<div><div class="r"><span class="bl-av" style="background:${(list.find((q) => q.name === p.name) || {}).color}">${esc(p.name.trim().charAt(0).toUpperCase())}</span><span style="overflow:hidden;text-overflow:ellipsis">${esc(p.name)}${split.length > 3 ? '' : ' pays'}</span><b>${B.money(p.total)}</b></div>
          <div class="bl-seg">${p.parts.map((part) => `<i style="flex:${part.amount.toFixed(2)};background:${tints[part.name]}"></i>`).join('')}</div></div>`).join('')}</div>
        <div class="bl-legend">${Object.keys(tints).map((n) => `<span><i style="background:${tints[n]}"></i>${esc(n)}${shared[n] ? (list.length === 2 ? ', half each' : ', split') : ''}</span>`).join('')}</div>`;
    }
    return `<div class="bl-m">${out}</div>${pays}`;
  }

  function drawMain() {
    const state = B.load();
    const day = B.today();
    if (!shown) { const d = B.parse(day); shown = [d.getFullYear(), d.getMonth()]; }
    const keep = mainEl.querySelector('.bl-list');
    const scroll = keep ? keep.scrollTop : 0;
    if (!state.bills.length && !state.paid.length) {
      mainEl.innerHTML = `${top(state, day)}<div class="bl-empty">${B.spikeArt(520)}<p>No bills yet</p><button class="bl-add" data-add>+ Add a bill</button></div>`;
      return;
    }
    mainEl.innerHTML = top(state, day) + (view === 'month' ? month(state, day) : soon(state, day));
    const now = mainEl.querySelector('.bl-list');
    if (now && scroll) now.scrollTop = scroll;
  }

  // ---- undo ----
  function offer(text, run) {
    clearTimeout(undoTimer);
    undo = run;
    undoEl.innerHTML = `<div class="bl-undo"><span>${esc(text)}</span><button data-undo-go>Undo</button></div>`;
    undoTimer = setTimeout(() => { undo = null; undoEl.innerHTML = ''; }, 6000);
  }
  function pay(id) {
    const line = B.markPaid(id);
    if (line) offer(`${line.name} paid`, () => B.unmarkPaid(line.pid));
  }

  // ---- the sheet ----
  function openSheet(id) {
    const state = B.load();
    const bill = id ? state.bills.find((b) => b.id === id) : null;
    if (id && !bill) return;
    const day = B.today();
    sheet = bill
      ? { id: bill.id, name: bill.name, amt: bill.amount ? (bill.amount % 1 ? bill.amount.toFixed(2) : String(bill.amount)) : '', varies: bill.varies, repeat: bill.repeat, every: bill.every, day: bill.day,
        date: bill.repeat === 'monthly' ? day : B.nextDue(bill) || bill.start, who: bill.who, home: bill.home, open: '', cal: null, due: B.nextDue(bill), last: (state.paid.filter((p) => p.bill === bill.id && p.due === bill.paidThrough).pop() || {}).pid || '' }
      : { id: '', name: '', amt: '', varies: false, repeat: 'monthly', every: 1, day: 1, date: day, who: '', home: 3, open: '', cal: null, due: null };
    drawSheet();
  }
  function closeSheet() {
    if (kb) kb.close();
    sheet = null;
    sheetEl.innerHTML = '';
    try { if (/^#\/bills\/./.test(location.hash) && location.hash !== '#/bills/month') history.replaceState(null, '', '#/bills'); } catch (e) { /* stays as it is */ }
  }
  const draftBill = () => ({ repeat: sheet.repeat, every: sheet.every, day: sheet.day, month: B.parse(sheet.date).getMonth(), start: sheet.date });
  function row(key, label, value, editor, last) {
    const open = sheet.open === key;
    return `<button class="bl-row${open ? ' open' : ''}${last && !open ? ' last' : ''}" data-row="${key}"><span>${label}</span><span class="v">${value}</span><span class="c"${open ? ' style="transform:translateY(-6px)"' : ''}>${open ? '⌄' : '›'}</span></button>
      ${open ? `<div class="bl-ed${last ? ' last' : ''}">${editor()}</div>` : ''}`;
  }
  function calendar() {
    const [y, m] = sheet.cal;
    const first = new Date(y, m, 1).getDay();
    const n = new Date(y, m + 1, 0).getDate();
    const day = B.today();
    let cells = 'SMTWTFS'.split('').map((c) => `<span>${c}</span>`).join('') + '<i></i>'.repeat(first);
    for (let d = 1; d <= n; d++) {
      const iso = B.iso(new Date(y, m, d));
      cells += `<button data-date="${iso}" class="${iso === sheet.date ? 'on' : iso === day ? 'today' : ''}"><b>${d}</b></button>`;
    }
    return `<div class="bl-cal"><div class="bl-cal-top"><button data-cal="-1" aria-label="Earlier">‹</button><b>${B.monthName(m)} ${y}</b><button data-cal="1" aria-label="Later">›</button></div>
      <div class="bl-cal-grid">${cells}</div></div>`;
  }
  function drawSheet() {
    if (!sheet) return;
    const list = folks();
    const s = sheet;
    const head = `<div class="bl-sh-top"><button data-cancel>${s.cal ? 'Back' : 'Cancel'}</button><div>${s.cal ? 'Due' : s.id ? 'Bill' : 'New bill'}</div>
      <button class="go" data-save${s.name.trim() ? '' : ' disabled'}${s.cal ? ' style="visibility:hidden"' : ''}>${s.id ? 'Save' : 'Add'}</button></div>`;
    if (s.cal) { sheetEl.innerHTML = `<div class="bl-shade"><div class="bl-sheet">${head}${calendar()}</div></div>`; return; }
    const have = B.load().bills.map((b) => b.name.toLowerCase());
    const roomy = !s.open || s.open === 'home' || (s.open === 'who' && list.length <= 2);
    const chips = !s.id && roomy ? COMMON.filter((n) => have.indexOf(n.toLowerCase()) < 0).slice(0, 5) : [];
    const amount = s.amt ? `${s.varies ? 'about ' : ''}$${esc(s.amt)}` : s.varies ? 'Varies' : 'Not set';
    const whoValue = s.who === 'split' ? `<span class="bl-mini" style="background:${colorOf('split', list)}"></span>Split`
      : s.who && colorOf(s.who, list) ? `<span class="bl-mini" style="background:${colorOf(s.who, list)}">${esc(s.who.charAt(0).toUpperCase())}</span>${esc(s.who)}` : 'Not set';
    const repeat = REPEATS.find((r) => r[0] === s.repeat && (r[0] !== 'weeks' || r[1] === s.every)) || REPEATS[0];
    const lastKey = 'home';
    const rows = [
      row('amount', 'Amount', amount, () => `<div class="bl-pad"><div class="bl-keys">${'1234567890.'.split('').map((k) => `<button class="bl-key" data-num="${k}">${k}</button>`).join('')}<button class="bl-key" data-num="back" aria-label="Delete">⌫</button></div>
        <button class="bl-vary${s.varies ? ' on' : ''}" data-varies>Varies</button></div>`),
      s.repeat === 'monthly'
        ? row('due', 'Due', esc(B.dueRuleWords(draftBill())), () => `<div class="bl-days">${Array.from({ length: 31 }, (_, i) => `<button data-day="${i + 1}"${s.day === i + 1 ? ' class="on"' : ''}>${i + 1}</button>`).join('')}</div>`)
        : `<button class="bl-row" data-pick-date><span>Due</span><span class="v">${esc(B.dueRuleWords(draftBill()))}</span><span class="c">›</span></button>`,
      row('repeat', 'Repeats', repeat[2], () => `<div class="bl-opts three">${REPEATS.map((r, i) => `<button class="bl-chip${r === repeat ? ' on' : ''}" data-repeat="${i}">${r[2]}</button>`).join('')}</div>`),
      list.length >= 2 ? row('who', 'Who pays', whoValue, () => `<div class="bl-opts">${list.map((p) => `<button class="bl-chip${s.who === p.name ? ' on' : ''}" data-who="${esc(p.name)}"><span class="bl-mini" style="width:36px;height:36px;font-size:17px;background:${p.color}">${esc(p.initial)}</span>${esc(p.name)}</button>`).join('')}
        <button class="bl-chip${s.who === 'split' ? ' on' : ''}" data-who="split"><span class="bl-mini" style="width:36px;height:36px;background:${colorOf('split', list)}"></span>Split</button>
        <button class="bl-chip${!s.who || !(s.who === 'split' || colorOf(s.who, list)) ? ' on' : ''}" data-who="">Not set</button></div>`) : '',
      row(lastKey, 'Show on Home', (HOMES.find((h) => h[0] === s.home) || HOMES[0])[1], () => `<div class="bl-opts">${HOMES.map((h) => `<button class="bl-chip${h[0] === s.home ? ' on' : ''}" data-home="${h[0]}">${h[1]}</button>`).join('')}</div>`, true),
    ].join('');
    sheetEl.innerHTML = `<div class="bl-shade"><div class="bl-sheet">${head}
      <div class="bl-namebox"><button class="bl-name${kb ? ' typing' : ''}" data-name>${s.name.trim() ? B.billIcon(B.iconFor(s.name), 52) : ''}<span data-name-text${s.name ? '' : ' class="ph"'}>${esc(s.name || 'Name')}</span></button>
        ${chips.length ? `<div class="bl-chips">${chips.map((c) => `<button class="bl-chip${c === s.name ? ' on' : ''}" data-chip="${esc(c)}">${c === s.name ? TICK(22, '#FBF4E4', 3) : ''}${esc(c)}</button>`).join('')}</div>` : ''}</div>
      <div class="bl-rows">${rows}</div>
      ${s.id && !s.open ? `<div class="bl-foot"><button data-remove>Remove</button>${s.last ? '<button data-unpay>Not paid</button>' : ''}${s.due ? '<button class="pay" data-paynow>Mark paid</button>' : ''}</div>` : ''}
    </div></div>`;
  }
  function typeName() {
    if (kb) return;
    sheet.open = '';
    const have = B.load().bills.map((b) => b.name.toLowerCase());
    kb = openKeyboard(root, {
      go: 'Done', max: B.NAME_MAX, text: sheet.name, slots: 4,
      suggest: (t) => { const q = t.trim().toLowerCase(); return q ? COMMON.filter((n) => n.toLowerCase().indexOf(q) === 0 && n.toLowerCase() !== q && have.indexOf(n.toLowerCase()) < 0).slice(0, 4) : []; },
      onChange: (t) => {
        if (!sheet) return;
        sheet.name = t;
        const box = sheetEl.querySelector('[data-name-text]');
        if (box) { box.textContent = t || 'Name'; box.className = t ? '' : 'ph'; }
        const go = sheetEl.querySelector('[data-save]');
        if (go) go.disabled = !t.trim();
      },
      onGo: (pick, k) => { if (pick) k.set(pick); k.close(); },
      onClose: (t) => { kb = null; if (sheet) { const name = String(t || '').trim(); sheet.name = name.charAt(0).toUpperCase() + name.slice(1); drawSheet(); } },
    });
    drawSheet();
  }
  function saveSheet() {
    const s = sheet;
    if (!s || !s.name.trim()) return;
    if (kb) kb.close();
    const amount = parseFloat(s.amt);
    B.saveBill({ name: sheet.name, amount: amount > 0 ? amount : null, varies: s.varies, repeat: s.repeat, every: s.every, day: s.day, date: s.date, who: s.who, home: s.home }, s.id);
    closeSheet();
  }

  // ---- taps ----
  const onClick = (e) => {
    const t = e.target.closest('button');
    if (!t || t.closest('[data-kb]')) return;
    const d = t.dataset;
    if (d.undoGo != null) { clearTimeout(undoTimer); const run = undo; undo = null; undoEl.innerHTML = ''; if (run) run(); return; }
    if (sheet) {
      const s = sheet;
      if (d.cancel != null) { if (s.cal) { s.cal = null; drawSheet(); } else closeSheet(); return; }
      if (d.save != null) { saveSheet(); return; }
      if (d.name != null) { typeName(); return; }
      if (kb) kb.close();
      if (!sheet) return;
      if (d.chip != null) s.name = d.chip;
      else if (d.row) s.open = s.open === d.row ? '' : d.row;
      else if (d.num) {
        if (d.num === 'back') s.amt = s.amt.slice(0, -1);
        else if (d.num === '.') { if (s.amt.indexOf('.') < 0) s.amt = `${s.amt || '0'}.`; }
        else if (/\.\d\d$/.test(s.amt) || (s.amt.indexOf('.') < 0 && s.amt.length >= 6)) return;
        else s.amt = s.amt === '0' ? d.num : s.amt + d.num;
      } else if (d.varies != null) s.varies = !s.varies;
      else if (d.day) s.day = +d.day;
      else if (d.pickDate != null) { const at = B.parse(s.date); s.cal = [at.getFullYear(), at.getMonth()]; s.open = ''; }
      else if (d.cal) { const at = new Date(s.cal[0], s.cal[1] + +d.cal, 1); s.cal = [at.getFullYear(), at.getMonth()]; }
      else if (d.date) { s.date = d.date; s.cal = null; }
      else if (d.repeat) { s.repeat = REPEATS[+d.repeat][0]; s.every = REPEATS[+d.repeat][1]; }
      else if (d.who != null) s.who = d.who;
      else if (d.home != null) s.home = +d.home;
      else if (d.remove != null) {
        const gone = B.removeBill(s.id);
        closeSheet();
        if (gone) offer(`${gone.bill.name} removed`, () => B.restoreBill(gone));
        return;
      } else if (d.paynow != null) { const id = s.id; closeSheet(); pay(id); return; }
      else if (d.unpay != null) { const pid = s.last; closeSheet(); B.unmarkPaid(pid); return; }
      else return;
      drawSheet();
      return;
    }
    if (d.add != null) openSheet('');
    else if (d.view) { view = d.view; try { history.replaceState(null, '', view === 'month' ? '#/bills/month' : '#/bills'); } catch (err) { /* stays as it is */ } drawMain(); }
    else if (d.month) { const at = new Date(shown[0], shown[1] + +d.month, 1); shown = [at.getFullYear(), at.getMonth()]; drawMain(); }
    else if (d.pay) {
      if (busy) return;
      busy = true;
      t.classList.add('on');
      setTimeout(() => { busy = false; pay(d.pay); }, 320);
    } else if (d.open) openSheet(d.open);
    else if (d.paid) {
      const state = B.load();
      const p = state.paid.find((x) => x.pid === d.paid);
      if (!p) return;
      if (state.bills.some((b) => b.id === p.bill)) openSheet(p.bill);
    }
  };
  root.addEventListener('click', onClick);
  // Nothing here takes the focus (there are no text boxes): a tap never calls Android's keyboard.
  const noFocus = (e) => { if (e.target.closest('button')) e.preventDefault(); };
  root.addEventListener('mousedown', noFocus);

  const stop = B.onChanged(drawMain);
  // A new day: "Tomorrow" becomes "Today", and the month may turn.
  const armDay = () => {
    const now = new Date();
    dayTimer = setTimeout(() => { shown = null; drawMain(); armDay(); }, new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 3) - now);
  };
  armDay();
  cleanUp = () => {
    stop();
    clearTimeout(undoTimer);
    clearTimeout(dayTimer);
    if (kb) kb.close();
    root.removeEventListener('click', onClick);
    root.removeEventListener('mousedown', noFocus);
    cleanUp = null;
  };

  drawMain();
  if (args[0] === 'add') openSheet('');
  else if (args[0] && args[0] !== 'month') openSheet(args[0]);
}

export function unmount() {
  if (cleanUp) cleanUp();
}
