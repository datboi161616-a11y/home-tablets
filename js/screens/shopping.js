// Family · Shopping list: everything this week's plan needs, by aisle.
// Tap a row to tick it off. "Have it" moves it to Already have. Add your own items at the top.
import { settings } from '../config.js';
import {
  buildShoppingList, onKitchenChanged, setHave, setGot, addExtra, setExtraGot, removeExtra, clearChecked,
} from '../services/meal-plan.js';
import { esc, kitchenStyles, kitchenTop, fillCounts } from './kitchen-ui.js';
import { spot, C } from '../art.js';

let off, stopTimers;

// Little aisle pictures for the section headings (flat, app palette, 32 x 32).
const AISLE_ART = {
  produce: `<path d="M12 12l6 16 6-16z" fill="#E5772F"/><path d="M18 12q-4-6 0-8M18 12q4-7 8-6" stroke="${C.green}" stroke-width="2.5" fill="none" stroke-linecap="round"/>`,
  meat: `<ellipse cx="14" cy="15" rx="8" ry="7" fill="${C.accentSoft}"/><path d="M19 19l6 6" stroke="${C.cream}" stroke-width="4" stroke-linecap="round"/><circle cx="26" cy="25" r="2.5" fill="${C.cream}"/>`,
  seafood: `<ellipse cx="14" cy="16" rx="9" ry="6" fill="${C.blue}"/><path d="M22 16l6-5v10z" fill="${C.blue}"/><circle cx="10" cy="15" r="1.6" fill="#FFF"/>`,
  dairy: `<path d="M11 12l3-5h6l3 5v15H11z" fill="#FFF" stroke="${C.cloud}" stroke-width="1.5"/><rect x="11" y="17" width="12" height="6" fill="${C.sky}"/>`,
  bakery: `<path d="M5 20q0-10 13-10t13 10v4H5z" fill="#E2B067"/><path d="M12 13l-2 6M18 12l-1 7M24 13l1 6" stroke="#C98A3E" stroke-width="2" stroke-linecap="round"/>`,
  frozen: `<path d="M16 6v20M7 11l18 10M7 21l18-10" stroke="${C.blue}" stroke-width="2.5" stroke-linecap="round"/>`,
  canned: `<rect x="9" y="8" width="14" height="18" rx="2" fill="${C.cloudDark}"/><rect x="9" y="13" width="14" height="8" fill="${C.accent}"/><ellipse cx="16" cy="8" rx="7" ry="2" fill="${C.cloud}"/>`,
  pantry: `<rect x="9" y="11" width="14" height="16" rx="4" fill="${C.gold}"/><rect x="10" y="6" width="12" height="5" rx="1.5" fill="${C.accent}"/><rect x="12" y="16" width="8" height="6" rx="1" fill="#FFF"/>`,
  international: `<path d="M6 17h20q-1 9-10 9t-10-9z" fill="#FFF" stroke="${C.cloud}" stroke-width="1.5"/><path d="M14 4l6 13M20 4l2 13" stroke="${C.mustard}" stroke-width="2" stroke-linecap="round"/>`,
  spices: `<rect x="10" y="12" width="12" height="15" rx="3" fill="${C.accentSoft}"/><rect x="11" y="7" width="10" height="5" rx="1.5" fill="${C.ink3}"/><circle cx="14" cy="9.5" r=".9" fill="#FFF"/><circle cx="18" cy="9.5" r=".9" fill="#FFF"/>`,
  beverages: `<path d="M13 5h6v5l3 4v13H10V14l3-4z" fill="${C.green}"/><rect x="10" y="16" width="12" height="6" fill="${C.mint}"/>`,
  extra: `<rect x="8" y="6" width="16" height="21" rx="2" fill="#FCE7A6"/><path d="M11 12h10M11 16h10M11 20h6" stroke="#C9A64A" stroke-width="2" stroke-linecap="round"/>`,
  other: `<path d="M8 12h16l-2 15H10z" fill="#D9B98C"/><path d="M12 12q0-6 4-6t4 6" stroke="#B8945F" stroke-width="2" fill="none"/>`,
};
const aisleIcon = (id) => `<svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true" focusable="false" style="flex:none"><circle cx="16" cy="16" r="16" fill="#F4F1EC"/>${AISLE_ART[id] || AISLE_ART.other}</svg>`;

export function mount(el) {
  const a = settings.accent;
  el.innerHTML = `${kitchenStyles()}
  <style>
    .sl-cols{column-count:3;column-gap:20px}
    .sl-sec{break-inside:avoid;-webkit-column-break-inside:avoid;background:#FFFFFF;border-radius:20px;padding:16px 18px 10px;margin-bottom:20px;display:inline-block;width:100%}
    .sl-h{font-size:14px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:#4A5363;margin-bottom:4px}
    .sl-sec .sl-h{display:flex;align-items:center;gap:10px}
    .sl-sec .sl-h .sl-left{margin-left:auto}
    .sl-row{display:flex;align-items:center;gap:12px;min-height:58px;border-top:1px solid #EEF0F2;padding:6px 0}
    .sl-row:first-of-type{border-top:none}
    .sl-tick{width:30px;height:30px;border-radius:9px;border:2px solid #C9CFD6;flex:none;display:flex;align-items:center;justify-content:center;color:#fff;font-size:18px;cursor:pointer;background:#fff}
    .sl-row.got .sl-tick{background:${a};border-color:${a}}
    .sl-txt{flex:1;min-width:0;cursor:pointer}
    .sl-n{font-size:18px;font-weight:600;line-height:1.2;overflow-wrap:anywhere}
    .sl-n::first-letter{text-transform:uppercase}
    .sl-a{font-size:14px;color:#4A5363;line-height:1.3}
    .sl-row.got .sl-n{text-decoration:line-through;color:#8A93A3}
    .sl-sec.done{opacity:.6}
    .sl-left{float:right;letter-spacing:0;text-transform:none;font-weight:600;color:#8A93A3}
    .sl-sec.done .sl-left{color:${a}}
    .sl-note{font-size:16px;color:#4A5363;margin-top:-10px;min-height:0}
    .sl-have{min-height:44px;padding:0 12px;border-radius:999px;border:none;background:#F1F2F4;color:#1D2430;font-size:14px;font-weight:600;cursor:pointer;flex:none;font-family:Inter,sans-serif}
    .sl-chip{min-height:44px;padding:0 16px;border-radius:999px;border:none;background:#FFFFFF;color:#1D2430;font-size:15px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif;display:inline-flex;align-items:center;gap:6px}
  </style>
  <div class="k-wrap" data-root>${kitchenTop({ title: 'Shopping list', active: 'shopping' })}<div class="k-empty k-scroll">Building your list…</div></div>`;
  const root = el.querySelector('[data-root]');
  let scrollTop = 0;
  let drawing = false;
  let typing = false; // keep the keyboard up after "Add", for adding several things in a row
  let note = ''; // e.g. "Milk is already on the list"
  let noteTimer;
  let clearArmed = false; // "Done shopping" needs a second tap
  let clearTimer;

  // Ticked-off things sink to the bottom of their aisle, so what's left to get is on top.
  const byGot = (list) => list.filter((x) => !x.got).concat(list.filter((x) => x.got));
  // Aisle box with a "3 left" / "All got" count; boxes that are all ticked fade back.
  const section = (id, title, items, rowsHtml) => {
    const n = items.filter((x) => !x.got).length;
    return `<div class="sl-sec${n ? '' : ' done'}"><div class="sl-h">${aisleIcon(id)}<span>${esc(title)}</span><span class="sl-left">${n ? `${n} left` : '✓ All got'}</span></div>${rowsHtml}</div>`;
  };

  const row = (key, name, amount, from, got, kind) => `
    <div class="sl-row${got ? ' got' : ''}">
      <div class="sl-tick" data-tick="${esc(key)}" data-kind="${kind}">${got ? '✓' : ''}</div>
      <div class="sl-txt" data-tick="${esc(key)}" data-kind="${kind}">
        <div class="sl-n">${esc(name)}</div>
        ${amount || from ? `<div class="sl-a">${esc([amount, from].filter(Boolean).join(' · '))}</div>` : ''}
      </div>
      ${kind === 'extra'
        ? `<button class="sl-have" data-rmextra="${esc(key)}">Remove</button>`
        : `<button class="sl-have" data-have="${esc(key)}">Have it</button>`}
    </div>`;

  let again = false;
  async function render() {
    if (drawing) { again = true; return; } // redraw once more when this one finishes
    drawing = true;
    try {
      const list = await buildShoppingList();
      if (!el.isConnected) return;
      const old = root.querySelector('[data-body]');
      if (old) scrollTop = old.scrollTop;
      const left = list.sections.reduce((n, s) => n + s.items.filter((x) => !x.got).length, 0) + list.extras.filter((x) => !x.got).length;
      const anyGot = list.sections.some((s) => s.items.some((x) => x.got)) || list.extras.some((x) => x.got);
      const from = (f) => (f.length > 1 ? `${f.length} recipes` : f[0]);

      root.innerHTML = `
        ${kitchenTop({ title: 'Shopping list', active: 'shopping' })}
        <div style="display:flex;gap:12px;align-items:center">
          <form data-addform style="display:flex;gap:12px;flex:1;margin:0">
            <input data-addtext class="k-input" style="flex:1" maxlength="60" placeholder="Add something else — milk, paper towels…" autocomplete="off">
            <button class="k-btn dark" type="submit">Add</button>
          </form>
          <div class="muted" style="font-size:17px;flex:none">${list.recipes ? `${list.recipes} planned meal${list.recipes > 1 ? 's' : ''} · ` : ''}${left ? `${left} to get` : anyGot ? 'Got everything!' : '0 to get'}</div>
          ${anyGot ? `<button data-clear class="k-btn ${clearArmed ? 'solid' : 'line'}">${clearArmed ? 'Tap again to clear ticks' : 'Done shopping'}</button>` : ''}
        </div>
        ${note ? `<div class="sl-note">${esc(note)}</div>` : ''}
        <div data-body class="k-scroll">
          ${!list.recipes && !list.extras.length ? `
            <div class="k-empty" style="padding-top:24px">
              ${spot.groceryBag().replace(/<rect width="285" height="170"[^>]*\/>/, '<circle cx="143" cy="88" r="80" fill="#FFFFFF"/>')}
              <div>Nothing on the list yet.</div>
              <div style="font-size:17px">Add meals to the week plan and their ingredients show up here.</div>
              <a href="#/recipes" class="k-btn solid">Find recipes</a>
            </div>` : `
          <div class="sl-cols">
            ${list.extras.length ? section('extra', 'Added by you', list.extras,
              byGot(list.extras).map((x) => row(x.id, x.text, '', '', x.got, 'extra')).join('')) : ''}
            ${list.sections.map((s) => section(s.id, s.name, s.items,
              byGot(s.items).map((x) => row(x.key, x.name, x.amount, from(x.from), x.got, 'item')).join(''))).join('')}
          </div>
          ${list.have.length ? `
            <div style="margin-top:4px;display:flex;flex-direction:column;gap:10px">
              <div class="sl-h">Already have — tap to put back on the list</div>
              <div style="display:flex;flex-wrap:wrap;gap:8px">
                ${list.have.map((x) => `<button class="sl-chip" data-need="${esc(x.key)}">+ ${esc(x.name)}</button>`).join('')}
              </div>
            </div>` : ''}
          ${list.missing ? `<div class="muted" style="font-size:15px;margin-top:12px">${list.missing} planned recipe(s) couldn’t load — check the Wi-Fi.</div>` : ''}`}
        </div>`;
      const body = root.querySelector('[data-body]');
      if (body) body.scrollTop = scrollTop;
      if (typing) { typing = false; const input = root.querySelector('[data-addtext]'); if (input) input.focus(); }
      fillCounts(root);
    } finally {
      drawing = false;
      if (again && el.isConnected) { again = false; render(); }
    }
  }

  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tick],[data-have],[data-need],[data-rmextra],[data-clear]');
    if (!t) return;
    if (t.dataset.tick) {
      const done = !t.closest('.sl-row').classList.contains('got');
      if (t.dataset.kind === 'extra') setExtraGot(t.dataset.tick, done); else setGot(t.dataset.tick, done);
    } else if (t.dataset.have) setHave(t.dataset.have, true);
    else if (t.dataset.need) setHave(t.dataset.need, false);
    else if (t.dataset.rmextra) removeExtra(t.dataset.rmextra);
    else if (t.matches('[data-clear]')) {
      clearTimeout(clearTimer);
      if (clearArmed) { clearArmed = false; clearChecked(); return; }
      clearArmed = true; // a stray tap shouldn't wipe the ticks
      clearTimer = setTimeout(() => { clearArmed = false; if (el.isConnected) render(); }, 4000);
      render();
    }
  });
  function say(text) {
    note = text;
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => { note = ''; if (el.isConnected) render(); }, 5000);
  }
  root.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = root.querySelector('[data-addtext]');
    const text = input.value.trim();
    if (!text) return;
    typing = true;
    const what = addExtra(text);
    const name = text.charAt(0).toUpperCase() + text.slice(1);
    if (what === 'there') { say(`${name} is already on the list.`); input.value = ''; render(); }
    else if (what === 'back') say(`${name} is back on the list.`);
    else say('');
  });

  off = onKitchenChanged(() => { if (el.isConnected) render(); });
  stopTimers = () => { clearTimeout(noteTimer); clearTimeout(clearTimer); };
  render().catch((err) => {
    console.error(err);
    const msg = root.querySelector('.k-empty');
    if (msg) msg.textContent = 'Couldn’t build the list. Check the Wi-Fi.';
  });
}

export function unmount() {
  if (off) off();
  off = null;
  if (stopTimers) stopTimers();
  stopTimers = null;
}
