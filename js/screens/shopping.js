// Family · Shopping list: everything this week's plan needs, by aisle.
// Tap a row to tick it off. "Have it" moves it to Already have. Add your own items at the top.
import { settings } from '../config.js';
import {
  buildShoppingList, onKitchenChanged, setHave, setGot, addExtra, setExtraGot, removeExtra, clearChecked,
} from '../services/meal-plan.js';
import { esc, kitchenStyles, kitchenTop, fillCounts } from './kitchen-ui.js';

let off;

export function mount(el) {
  const a = settings.accent;
  el.innerHTML = `${kitchenStyles()}
  <style>
    .sl-cols{column-count:3;column-gap:20px}
    .sl-sec{break-inside:avoid;-webkit-column-break-inside:avoid;background:#FFFFFF;border-radius:20px;padding:16px 18px 10px;margin-bottom:20px;display:inline-block;width:100%}
    .sl-h{font-size:14px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:#4A5363;margin-bottom:4px}
    .sl-row{display:flex;align-items:center;gap:12px;min-height:58px;border-top:1px solid #EEF0F2;padding:6px 0}
    .sl-row:first-of-type{border-top:none}
    .sl-tick{width:30px;height:30px;border-radius:9px;border:2px solid #C9CFD6;flex:none;display:flex;align-items:center;justify-content:center;color:#fff;font-size:18px;cursor:pointer;background:#fff}
    .sl-row.got .sl-tick{background:${a};border-color:${a}}
    .sl-txt{flex:1;min-width:0;cursor:pointer}
    .sl-n{font-size:18px;font-weight:600;line-height:1.2;overflow-wrap:anywhere}
    .sl-n::first-letter{text-transform:uppercase}
    .sl-a{font-size:14px;color:#4A5363;line-height:1.3}
    .sl-row.got .sl-n{text-decoration:line-through;color:#8A93A3}
    .sl-have{min-height:40px;padding:0 12px;border-radius:999px;border:none;background:#F1F2F4;color:#1D2430;font-size:14px;font-weight:600;cursor:pointer;flex:none;font-family:Inter,sans-serif}
    .sl-chip{min-height:44px;padding:0 16px;border-radius:999px;border:none;background:#FFFFFF;color:#1D2430;font-size:15px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif;display:inline-flex;align-items:center;gap:6px}
  </style>
  <div class="k-wrap" data-root>${kitchenTop({ title: 'Shopping list', active: 'shopping' })}<div class="k-empty k-scroll">Building your list…</div></div>`;
  const root = el.querySelector('[data-root]');
  let scrollTop = 0;
  let drawing = false;

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
          <div class="muted" style="font-size:17px;flex:none">${list.recipes ? `${list.recipes} planned meal${list.recipes > 1 ? 's' : ''} · ${left} to get` : `${left} to get`}</div>
          ${anyGot ? '<button data-clear class="k-btn line">Done shopping</button>' : ''}
        </div>
        <div data-body class="k-scroll">
          ${!list.recipes && !list.extras.length ? `
            <div class="k-empty">
              <div>Nothing on the list yet.</div>
              <div style="font-size:17px">Add meals to the week plan and their ingredients show up here.</div>
              <a href="#/recipes" class="k-btn solid">Find recipes</a>
            </div>` : `
          <div class="sl-cols">
            ${list.extras.length ? `<div class="sl-sec"><div class="sl-h">Added by you</div>
              ${list.extras.map((x) => row(x.id, x.text, '', '', x.got, 'extra')).join('')}</div>` : ''}
            ${list.sections.map((s) => `<div class="sl-sec"><div class="sl-h">${esc(s.name)}</div>
              ${s.items.map((x) => row(x.key, x.name, x.amount, from(x.from), x.got, 'item')).join('')}</div>`).join('')}
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
    else if (t.matches('[data-clear]')) clearChecked();
  });
  root.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = root.querySelector('[data-addtext]');
    addExtra(input.value);
  });

  off = onKitchenChanged(() => { if (el.isConnected) render(); });
  render().catch((err) => {
    console.error(err);
    const msg = root.querySelector('.k-empty');
    if (msg) msg.textContent = 'Couldn’t build the list. Check the Wi-Fi.';
  });
}

export function unmount() { if (off) off(); off = null; }
