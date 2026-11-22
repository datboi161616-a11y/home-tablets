// Family · Shopping list: everything this week's plan needs, plus your own things, by aisle.
// Tap a row to tick it off (ticked rows sink). "Have it" moves it to Already have. Add your
// own items by typing ("2 x milk" works) or with one tap on the quick chips. Undo is offered
// for a few seconds after anything comes off the list.
import { settings } from '../config.js';
import {
  buildShoppingList, onKitchenChanged, setHave, setGot, addExtra, setExtraGot, removeExtra, clearChecked,
  guessAisle, AISLE_NAMES, COMMON_ITEMS, recentExtras, setExtraQty, extraText, splitQty, listSnapshot, restoreList,
  setListNextWeek, listSeen, setListSeen,
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
const aisleIcon = (id) => `<svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true" focusable="false" style="flex:none"><circle cx="16" cy="16" r="16" fill="#F4F1EC"/>${AISLE_ART[id] || AISLE_ART.other}</svg>`;
const low = (s) => String(s || '').toLowerCase().trim();
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function mount(el) {
  const a = settings.accent;
  el.innerHTML = `${kitchenStyles()}
  <style>
    .sl-cols{column-count:3;column-gap:20px}
    .sl-sec{break-inside:avoid;-webkit-column-break-inside:avoid;background:#FFFFFF;border-radius:20px;padding:16px 18px 10px;margin-bottom:20px;display:inline-block;width:100%}
    .sl-h{font-size:15px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#4A5363;margin-bottom:4px}
    .sl-sec .sl-h{display:flex;align-items:center;gap:10px}
    .sl-sec .sl-h .sl-left{margin-left:auto}
    .sl-row{display:flex;align-items:center;gap:12px;min-height:64px;border-top:1px solid #EEF0F2;padding:6px 0}
    .sl-row:first-of-type{border-top:none}
    .sl-tick{width:40px;height:40px;border-radius:11px;border:2px solid #C9CFD6;flex:none;display:flex;align-items:center;justify-content:center;color:#fff;font-size:24px;cursor:pointer;background:#fff}
    .sl-row.got .sl-tick{background:${a};border-color:${a}}
    .sl-txt{flex:1;min-width:0;cursor:pointer;min-height:52px;display:flex;flex-direction:column;justify-content:center}
    .sl-n{font-size:20px;font-weight:600;line-height:1.2;overflow-wrap:anywhere}
    .sl-n::first-letter{text-transform:uppercase}
    .sl-a{font-size:15px;color:#4A5363;line-height:1.3}
    .sl-new{display:inline-block;margin-left:6px;padding:1px 8px;border-radius:999px;background:${a};color:#FFFFFF;font-size:12px;font-weight:700;letter-spacing:.5px;vertical-align:3px;text-transform:uppercase}
    .sl-row.got .sl-n{text-decoration:line-through;color:#8A93A3}
    .sl-row.got .sl-new{display:none}
    .sl-sec.done{opacity:.6}
    .sl-left{float:right;letter-spacing:0;text-transform:none;font-weight:600;color:#8A93A3}
    .sl-sec.done .sl-left{color:${a}}
    .sl-note{font-size:18px;color:#1D2430;background:#FFF4D6;border-radius:14px;padding:10px 16px;margin-top:-8px}
    .sl-have{min-height:52px;padding:0 14px;border-radius:999px;border:none;background:#F1F2F4;color:#1D2430;font-size:15px;font-weight:600;cursor:pointer;flex:none;font-family:Inter,sans-serif}
    .sl-q{width:52px;height:52px;border-radius:50%;border:none;background:#F1F2F4;color:#1D2430;font:600 26px Inter,sans-serif;cursor:pointer;flex:none;display:flex;align-items:center;justify-content:center}
    .sl-chip{min-height:52px;padding:0 18px;border-radius:999px;border:none;background:#FFFFFF;color:#1D2430;font-size:17px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif;display:inline-flex;align-items:center;gap:6px;flex:none}
    .sl-quick{display:flex;flex-wrap:wrap;gap:8px;max-height:52px;overflow:hidden;margin-top:-8px}
    .sl-quick .sl-chip.recent{background:#FFF4D6}
    .sl-stat{font-size:18px;flex:none;color:#4A5363;text-align:right;line-height:1.2}
    .sl-stat b{font-size:24px;color:#1D2430}
    .sl-toast{position:absolute;left:50%;bottom:28px;transform:translateX(-50%);z-index:40;display:flex;align-items:center;gap:18px;
      background:#1D2430;color:#FFFFFF;border-radius:999px;padding:8px 8px 8px 26px;font-size:18px;box-shadow:0 6px 20px rgba(0,0,0,.18);max-width:900px;min-height:64px}
    .sl-toast span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
    .sl-toast button{min-height:48px;padding:0 24px;border-radius:999px;border:none;background:#FFFFFF;color:#1D2430;font:600 17px Inter,sans-serif;cursor:pointer;flex:none}
    .sl-week{display:flex;align-items:center;gap:14px;background:#FFFFFF;border-radius:20px;padding:10px 12px 10px 20px;margin-bottom:20px;font-size:18px}
    .sl-week span{flex:1}
  </style>
  <div class="k-wrap" data-root style="position:relative">${kitchenTop({ title: 'Shopping list', active: 'shopping' })}<div class="k-empty k-scroll">Building your list…</div></div>`;
  const root = el.querySelector('[data-root]');
  let scrollTop = 0;
  let drawing = false;
  let typing = false; // keep the keyboard up after "Add", for adding several things in a row
  let note = ''; // e.g. "Milk is already on the list"
  let noteTimer;
  let clearArmed = false; // "Done shopping" needs a second tap
  let clearTimer;
  let toast = null; // { text, snap }: something just came off the list; Undo puts it back
  let toastTimer;
  let fresh = null; // planned items new since the list was last looked at (this visit)

  // Ticked-off things sink to the bottom of their aisle, so what's left to get is on top.
  const byGot = (list) => list.filter((x) => !x.got).concat(list.filter((x) => x.got));
  // Aisle box with a "3 left" / "All got" count; boxes that are all ticked fade back.
  const section = (id, title, items, rowsHtml) => {
    const n = items.filter((x) => !x.got).length;
    return `<div class="sl-sec${n ? '' : ' done'}"><div class="sl-h">${aisleIcon(id)}<span>${esc(title)}</span><span class="sl-left">${n ? `${n} left` : '✓ All got'}</span></div>${rowsHtml}</div>`;
  };

  const row = (x) => {
    const extra = x.kind === 'extra';
    return `
    <div class="sl-row${x.got ? ' got' : ''}">
      <div class="sl-tick" data-tick="${esc(x.key)}" data-kind="${x.kind}" role="checkbox" aria-checked="${x.got ? 'true' : 'false'}">${x.got ? '✓' : ''}</div>
      <div class="sl-txt" data-tick="${esc(x.key)}" data-kind="${x.kind}">
        <div class="sl-n">${esc(x.name)}${x.isNew ? '<span class="sl-new">New</span>' : ''}</div>
        ${x.sub ? `<div class="sl-a">${esc(x.sub)}</div>` : ''}
      </div>
      ${extra
        ? `<button class="sl-q" data-less="${esc(x.key)}" aria-label="${x.qty > 1 ? 'One fewer' : 'Take off the list'}">${x.qty > 1 ? '−' : '×'}</button><button class="sl-q" data-more="${esc(x.key)}" aria-label="One more">+</button>`
        : `<button class="sl-have" data-have="${esc(x.key)}">Have it</button>`}
    </div>`;
  };

  // Planned items and your own items together, by aisle; finished aisles go to the end.
  function aisles(list) {
    const from = (f) => (f.length > 1 ? `${f.length} recipes` : f[0]);
    const by = {};
    const put = (aisle, item) => { (by[aisle] || (by[aisle] = [])).push(item); };
    list.sections.forEach((s) => s.items.forEach((x) => put(s.id, {
      kind: 'item', key: x.key, name: x.name, sub: [x.amount, from(x.from)].filter(Boolean).join(' · '), got: x.got,
      isNew: !!(fresh && fresh.indexOf(x.key) >= 0),
    })));
    list.extras.forEach((x) => put(guessAisle(x.text), { kind: 'extra', key: x.id, name: extraText(x), sub: 'Added by you', got: x.got, qty: x.qty || 1 }));
    const names = {};
    AISLE_NAMES.forEach(([id, name]) => { names[id] = name; });
    const order = AISLE_NAMES.map((x) => x[0]).concat(['other']);
    const out = order.filter((id) => by[id]).map((id) => ({
      id, name: id === 'other' ? 'Other things' : names[id],
      items: by[id].slice().sort((p, q) => low(p.name.replace(/^\d+ × /, '')).localeCompare(low(q.name.replace(/^\d+ × /, '')))),
    }));
    return out.filter((s) => s.items.some((x) => !x.got)).concat(out.filter((s) => !s.items.some((x) => !x.got)));
  }

  // Quick chips: things added lately first, then everyday items; none already on the list.
  function quick(list) {
    const on = {};
    list.extras.forEach((x) => { if (!x.got) on[low(x.text)] = 1; });
    list.sections.forEach((s) => s.items.forEach((x) => { if (!x.got) on[low(x.name)] = 1; }));
    const out = [];
    const seen = {};
    recentExtras().forEach((t) => { const k = low(t); if (!on[k] && !seen[k]) { seen[k] = 1; out.push({ t, recent: true }); } });
    COMMON_ITEMS.forEach((t) => { const k = low(t); if (!on[k] && !seen[k]) { seen[k] = 1; out.push({ t }); } });
    return out.slice(0, 14);
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
        if (names.length) say(`New from the week plan: ${names.slice(0, 4).join(', ')}${names.length > 4 ? ` and ${names.length - 4} more` : ''}.`, 9000);
      }
      const old = root.querySelector('[data-body]');
      if (old) scrollTop = old.scrollTop;
      const all = list.sections.reduce((n, s) => n + s.items.length, 0) + list.extras.length;
      const left = list.sections.reduce((n, s) => n + s.items.filter((x) => !x.got).length, 0) + list.extras.filter((x) => !x.got).length;
      const anyGot = left < all;
      const empty = !list.recipes && !list.extras.length;
      const chips = quick(list);
      const typed = root.querySelector('[data-addtext]');
      const keep = typed ? typed.value : ''; // a redraw (a tick from the phone, say) keeps half-typed words
      if (typed && document.activeElement === typed) typing = true;

      root.innerHTML = `
        ${kitchenTop({ title: 'Shopping list', active: 'shopping' })}
        <div style="display:flex;gap:12px;align-items:center">
          <form data-addform style="display:flex;gap:12px;flex:1;margin:0">
            <input data-addtext class="k-input" style="flex:1" maxlength="60" placeholder="Add something — “2 x milk”, paper towels…" autocomplete="off" value="${esc(keep)}">
            <button class="k-btn dark" type="submit">Add</button>
          </form>
          <div class="sl-stat">${all ? (left ? `<b>${left}</b> to get${anyGot ? `<br>${all - left} got` : ''}` : '<b>Got everything!</b>') : ''}</div>
          ${anyGot ? `<button data-clear class="k-btn ${clearArmed ? 'solid' : 'line'}">${clearArmed ? 'Tap again to clear ticks' : 'Done shopping'}</button>` : ''}
        </div>
        ${chips.length ? `<div class="sl-quick" aria-label="Quick add">${chips.map((c) => `<button class="sl-chip${c.recent ? ' recent' : ''}" data-quick="${esc(c.t)}">+ ${esc(cap(c.t))}</button>`).join('')}</div>` : ''}
        ${note ? `<div class="sl-note">${esc(note)}</div>` : ''}
        <div data-body class="k-scroll">
          ${list.next || list.nextRecipes ? `<div class="sl-week"><span>${list.next
            ? `Includes next week’s ${list.nextRecipes} planned meal${list.nextRecipes === 1 ? '' : 's'}.`
            : `Next week has ${list.nextRecipes} planned meal${list.nextRecipes === 1 ? '' : 's'}.`}</span>
            <button class="k-btn ${list.next ? 'line' : 'solid'} sm" data-nextweek="${list.next ? '0' : '1'}">${list.next ? 'This week only' : 'Add them to the list'}</button></div>` : ''}
          ${empty ? `
            <div class="k-empty" style="padding-top:12px">
              ${spot.groceryBag().replace(/<rect width="285" height="170"[^>]*\/>/, '<circle cx="143" cy="88" r="80" fill="#FFFFFF"/>')}
              <div>The list is empty.</div>
              <div style="font-size:18px;max-width:640px">Tap a button above to add everyday things, or type your own.<br>Meals on the week plan add their ingredients here by themselves.</div>
              <div style="display:flex;gap:12px"><a href="#/plan" class="k-btn line">Week plan</a><a href="#/recipes" class="k-btn solid">Find recipes</a></div>
            </div>` : `
          <div class="sl-cols">
            ${aisles(list).map((s) => section(s.id, s.name, s.items, byGot(s.items).map(row).join(''))).join('')}
          </div>
          ${list.have.length ? `
            <div style="margin-top:4px;display:flex;flex-direction:column;gap:10px">
              <div class="sl-h">Already have — tap to put back on the list</div>
              <div style="display:flex;flex-wrap:wrap;gap:8px">
                ${list.have.map((x) => `<button class="sl-chip" data-need="${esc(x.key)}">+ ${esc(x.name)}</button>`).join('')}
              </div>
            </div>` : ''}
          ${list.missing ? `<div class="muted" style="font-size:16px;margin-top:12px">${list.missing} planned recipe${list.missing > 1 ? 's' : ''} couldn’t load — check the Wi-Fi.</div>` : ''}`}
          ${toast ? '<div style="height:90px"></div>' : ''}
        </div>
        ${toast ? `<div class="sl-toast"><span>${esc(toast.text)}</span><button data-undo>Undo</button></div>` : ''}`;
      const body = root.querySelector('[data-body]');
      if (body) body.scrollTop = scrollTop;
      if (typing) { typing = false; const input = root.querySelector('[data-addtext]'); if (input) input.focus(); }
      fillCounts(root);
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

  root.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-tick],[data-have],[data-need],[data-less],[data-more],[data-clear],[data-quick],[data-undo],[data-nextweek]');
    if (!t) return;
    if (t.dataset.tick) {
      const done = !t.closest('.sl-row').classList.contains('got');
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
      if (what === 'there') render();
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
        ? `Added for next week: ${names.slice(0, 5).join(', ')}${names.length > 5 ? ` and ${names.length - 5} more` : ''}. Amounts already on the list went up where needed.`
        : 'Next week needs nothing new — amounts already on the list went up where needed.', 10000);
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
        clearChecked();
        return;
      }
      clearArmed = true; // a stray tap shouldn't wipe the ticks
      clearTimer = setTimeout(() => { clearArmed = false; if (el.isConnected) render(); }, 4000);
      render();
    }
  });
  function say(text, ms = 5000) {
    note = text;
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => { note = ''; if (el.isConnected) render(); }, ms);
  }
  root.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = root.querySelector('[data-addtext]');
    const text = input.value.trim();
    if (!text) return;
    typing = true;
    input.value = ''; // (render keeps whatever is still in the box)
    const what = addExtra(text);
    const p = splitQty(text);
    const name = cap(p.text);
    if (what === 'there') say(`${name} is already on the list. Tap + on it for more.`);
    else if (what === 'more') say(`More ${p.text.toLowerCase()} on the list.`);
    else if (what === 'back') say(`${name} is back on the list.`);
    else say('');
    render();
  });

  off = onKitchenChanged(() => { if (el.isConnected) render(); });
  stopTimers = () => { clearTimeout(noteTimer); clearTimeout(clearTimer); clearTimeout(toastTimer); };
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
