// The household's note board (board KP12 in the redesign), kept simple: each note is who
// wrote it and what they wrote. One note is shown big on the left; every note on the board
// is listed on the right (tap one, or swipe the big note, to read another).
// "Write a note" asks for a name and the note. "Delete" on the note asks once, then the note
// goes with a moment to Undo. Notes left from a phone arrive here too; the phone code sits
// behind the small phone button in the top bar.
// Notes are kept on this screen; nothing is shared with any other screen.
import { householdName } from '../services/family.js';
import {
  members, noMembers, loadMessages, postMessage, updateMessage, deleteMessage, canDelete, when,
  onMessagesChanged, emojiOnly, loadDraft, saveDraft, MAXLEN,
} from '../services/messages-data.js';
import { esc, topBar, phoneCode, wirePhoneCodes, avatar } from './ui.js';

let timer, root, onClick, featuredId, offNotes, stopCodes;
let undo = null;          // { id, timer }: a note just deleted, still on its way out
let toastTimer;
let lookedAt = new Set(); // notes a person has had in front of them on this visit
let order = [];           // the ids in the list, top to bottom (for swiping)
let reveal = false;       // the next drawing scrolls the list to the note on show
let armed = false, armTimer; // "Delete" has been tapped once and is asking "Delete?"
let touch = null, onTouchStart, onTouchEnd;

const INK = '#2D2140', SOFT = '#6B5D7A', RED = '#E2445C', GOLD = '#F2B23A';
const LAST_WHO = 'messages.lastWho';
// Long notes start smaller; fitFeatured() then shrinks further until the note fits.
const fitSize = (len) => (len <= 40 ? 64 : len <= 80 ? 54 : len <= 140 ? 44 : len <= 220 ? 36 : len <= 320 ? 30 : 26);

const HEART = (s) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21C5 15 2 12 2 8a5 5 0 0 1 10-1 5 5 0 0 1 10 1c0 4-3 7-10 13z" fill="${RED}"/></svg>`;
const STAR = (s) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l2.900 6.600 7.100.600-5.400 4.700 1.600 7-6.200-3.700-6.200 3.700 1.600-7-5.400-4.700 7.100-.600z" fill="${GOLD}"/></svg>`;
const PHONE = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="2" width="12" height="20" rx="2.500"/><path d="M11 18h2"/></svg>';

const STYLE = `
  <style>
    .mb { position:relative; height:100%; box-sizing:border-box; padding:32px 40px; display:flex; flex-direction:column; gap:20px; overflow:hidden;
      color:${INK}; font-family:Inter,system-ui,sans-serif; background:radial-gradient(circle at 35% 45%, #FFF3E8 0%, #FBE3D3 55%, #F4CDBE 100%); }
    .mb .x-title { color:${INK}; }
    .mb-red { background:${RED} !important; color:#fff !important; }
    .mb-main { flex:1; min-height:0; display:grid; grid-template-columns:minmax(0,1fr) 424px; grid-gap:28px; }
    .mb-main.empty { grid-template-columns:minmax(0,1fr); }
    .mb-left { display:flex; flex-direction:column; min-height:0; min-width:0; }
    .mb-side { display:flex; flex-direction:column; min-height:0; min-width:0; }
    .mb-note { flex:1; min-height:0; border-radius:36px; background:#fff; box-shadow:0 12px 28px rgba(120,60,50,.14); padding:26px 34px 28px; display:flex; flex-direction:column; gap:16px; }
    .mb-head { display:flex; align-items:center; gap:14px; flex:none; }
    .mb-name { font:600 22px Inter,sans-serif; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .mb-soft { color:${SOFT}; }
    .mb-pill { min-height:56px; padding:0 20px; border-radius:28px; border:0; background:#F7ECE5; color:${INK}; font:600 17px Inter,sans-serif; display:inline-flex; align-items:center; justify-content:center; gap:8px; cursor:pointer; flex:none; }
    .mb-pill.white { background:#fff; }
    .mb-pill.armed { background:#B3261E; color:#fff; }
    .mb-icon { width:56px; padding:0; }
    .mb-body { flex:1; min-height:0; display:flex; align-items:center; overflow-y:auto; scrollbar-width:none; }
    .mb-words { white-space:pre-line; overflow-wrap:anywhere; word-break:break-word; }
    .mb-big { font-family:Outfit,system-ui,sans-serif; font-weight:500; line-height:1.1; }
    .mb-list { flex:1; min-height:0; overflow-y:auto; scrollbar-width:none; display:flex; flex-direction:column; gap:12px; }
    .mb-list::-webkit-scrollbar, .mb-body::-webkit-scrollbar { display:none; }
    .mb-card { flex:none; padding:16px 20px; border-radius:24px; background:rgba(255,255,255,.75); cursor:pointer; min-height:80px; box-sizing:border-box; }
    .mb-card.active { background:#fff; box-shadow:inset 0 0 0 3px ${RED}; }
    .mb-card-text { font:500 24px/1.15 Outfit,sans-serif; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
    .mb-card-foot { margin-top:8px; font-size:15px; color:${SOFT}; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .mb-deco { position:absolute; pointer-events:none; }
    .mb-empty { flex:1; min-height:0; border-radius:36px; background:#fff; box-shadow:0 12px 28px rgba(120,60,50,.14); padding:40px 48px; display:flex; flex-direction:column; justify-content:center; gap:22px; position:relative; overflow:hidden; }
    .mb-over { position:absolute; top:0; right:0; bottom:0; left:0; background:rgba(45,33,64,.5); display:none; align-items:flex-start; justify-content:center; padding-top:40px; box-sizing:border-box; z-index:10; }
    .mb-sheet { background:#FFF8F2; color:${INK}; border-radius:32px; box-shadow:0 20px 60px rgba(45,33,64,.3); display:flex; flex-direction:column; gap:18px; box-sizing:border-box; }
    .mb-h { font:500 32px Outfit,sans-serif; flex:1; min-width:0; }
    .mb-person { min-height:88px; flex:1 1 0; border-radius:28px; border:0; background:#fff; color:${INK}; font:500 28px Outfit,sans-serif; display:flex; align-items:center; justify-content:center; gap:14px; cursor:pointer; box-shadow:inset 0 0 0 2px rgba(45,33,64,.12); min-width:0; padding:0 14px; }
    .mb-person.on { box-shadow:inset 0 0 0 4px ${RED}; }
    .mb-person span:last-child { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .mb-field { width:100%; box-sizing:border-box; border:2px solid rgba(45,33,64,.18); border-radius:18px; padding:14px 18px; font:22px/1.35 Inter,sans-serif; color:${INK}; background:#fff; outline:none; user-select:text; -webkit-user-select:text; }
    .mb-field:focus { border-color:${RED}; }
    .mb-text { height:140px; resize:none; flex:1; min-width:0; }
    .mb-over .x-code-title { display:none; }
    .mb-toast { position:absolute; left:40px; bottom:32px; width:748px; box-sizing:border-box; display:none; align-items:center; justify-content:space-between; gap:18px; background:${INK}; color:#fff; border-radius:999px; min-height:56px; padding:0 6px 0 28px; font:600 19px Inter,sans-serif; z-index:9; box-shadow:0 8px 20px rgba(45,33,64,.25); }
  </style>`;

// The notes on the board right now (a note just deleted is already off it).
const visible = () => loadMessages().filter((m) => !undo || m.id !== undo.id);

// ---------- Board ----------
function renderBoard() {
  if (!root) return;
  disarm();
  const all = visible();
  if (!all.some((m) => m.id === featuredId)) featuredId = all[0] ? all[0].id : undefined;
  const f = all.find((m) => m.id === featuredId);
  order = all.map((m) => m.id);

  const left = root.querySelector('[data-left]');
  const side = root.querySelector('[data-side]');
  root.querySelector('.mb-main').classList.toggle('empty', !f);
  side.style.display = f ? '' : 'none';
  // The empty board has its own big "Write a note": the top bar's would be a second one.
  const topNew = root.querySelector('[data-top-new]');
  if (topNew) topNew.style.visibility = f ? '' : 'hidden';

  if (!f) {
    left.innerHTML = `
      <div class="mb-empty">
        <div class="mb-big" style="font-size:60px">No notes yet</div>
        <div><button data-act="new" class="x-btn lg mb-red">Write a note</button></div>
        <div class="mb-deco" style="right:160px;bottom:140px">${HEART(64)}</div>
        <div class="mb-deco" style="right:90px;bottom:210px">${STAR(50)}</div>
      </div>`;
    return;
  }

  // ---- the big note: who wrote it, when, and the note ----
  const big = !f.photo && emojiOnly(f.text);
  left.innerHTML = `
    <div class="mb-note" data-note>
      <div class="mb-head">
        ${avatar(f.who, 58)}
        <div style="min-width:0;flex:1">
          <div class="mb-name">${esc(f.who)}</div>
          <div class="mb-soft" style="font-size:16px" data-when="${f.at}">${when(f.at)}</div>
        </div>
        ${canDelete() ? '<button data-act="delete" class="mb-pill">Delete</button>' : ''}
      </div>
      ${f.photo ? `
        <div style="flex:1;min-height:0;border-radius:20px;background:#E9D9CF;overflow:hidden">
          <img src="${esc(f.photo)}" alt="" style="width:100%;height:100%;object-fit:cover;display:block">
        </div>
        ${f.text ? `<div class="mb-big mb-words mb-body" style="flex:none;max-height:124px;align-items:flex-start;font-size:${f.text.length > 120 ? 26 : 34}px;line-height:1.2">${esc(f.text)}</div>` : ''}`
      : `
        <div data-fbox class="mb-body"${big ? ' style="justify-content:center"' : ''}>
          ${big
            ? `<div style="font-size:140px;line-height:1.1;text-align:center">${esc(f.text.trim())}</div>`
            : `<div data-ftext class="mb-big mb-words" style="font-size:${fitSize((f.text || '').length)}px">${esc(f.text)}</div>`}
        </div>`}
    </div>`;

  // ---- every note on the board ----
  const listWas = side.querySelector('[data-list]');
  const keepScroll = listWas ? listWas.scrollTop : 0; // re-drawing the list must not jump it back to the top
  side.innerHTML = `
    <div data-list class="mb-list">
      ${all.map((n) => `
        <div class="mb-card${n.id === featuredId ? ' active' : ''}" data-id="${esc(n.id)}">
          <div class="mb-card-text mb-words"${!n.photo && emojiOnly(n.text) ? ' style="font-size:38px"' : ''}>${n.photo && !n.text ? 'Photo' : esc(n.text)}</div>
          <div class="mb-card-foot">${esc(n.who)} · <span data-when="${n.at}">${when(n.at)}</span></div>
        </div>`).join('')}
    </div>`;
  const list = side.querySelector('[data-list]');
  if (keepScroll) list.scrollTop = keepScroll;
  const on = list.querySelector('.mb-card.active');
  if (reveal && on && (on.offsetTop < list.scrollTop || on.offsetTop + on.offsetHeight > list.scrollTop + list.clientHeight)) list.scrollTop = Math.max(0, on.offsetTop - 12);
  reveal = false;
  // Measure once the browser has laid the note out.
  Promise.resolve().then(fitFeatured);
}

// A long note shrinks until it fits the card; past the smallest size it scrolls.
function fitFeatured() {
  if (!root) return;
  const box = root.querySelector('[data-fbox]');
  const txt = root.querySelector('[data-ftext]');
  if (!box || !txt) return;
  let size = parseFloat(txt.style.fontSize) || 30;
  while (txt.offsetHeight > box.clientHeight + 1 && size > 24) {
    size -= 2;
    txt.style.fontSize = `${size}px`;
  }
  if (txt.offsetHeight > box.clientHeight + 1) box.style.alignItems = 'flex-start';
}

// Only the "20 min ago" words change each minute: nothing else is drawn again.
function freshenTimes() {
  if (!root) return;
  root.querySelectorAll('[data-when]').forEach((w) => {
    const t = when(+w.dataset.when);
    if (w.textContent !== t) w.textContent = t;
  });
}

// Swiping the big note, or tapping one in the list.
function show(id) {
  if (!id || id === featuredId) return;
  if (featuredId) updateMessage(featuredId, { seen: true });
  featuredId = id;
  lookedAt.add(id);
  reveal = true;
  renderBoard();
}
function step(by) {
  const i = order.indexOf(featuredId);
  if (i < 0) return;
  show(order[Math.max(0, Math.min(order.length - 1, i + by))]);
}

// ---------- Delete: tap once to ask, again to delete; Undo for a few seconds ----------
function disarm() {
  armed = false;
  clearTimeout(armTimer);
  const b = root && root.querySelector('[data-act="delete"]');
  if (b) { b.classList.remove('armed'); b.textContent = 'Delete'; }
}
function tapDelete(btn) {
  if (!armed) {
    armed = true;
    btn.classList.add('armed');
    btn.textContent = 'Delete?';
    armTimer = setTimeout(disarm, 4000);
    return;
  }
  disarm();
  removeNote(featuredId);
}

function toast(text, withUndo = false) {
  const t = root && root.querySelector('[data-toast]');
  if (!t) return;
  clearTimeout(toastTimer);
  t.innerHTML = `<span>${esc(text)}</span>${withUndo ? '<button data-act="undo" class="mb-pill white" style="min-height:48px">Undo</button>' : ''}`;
  t.style.paddingRight = withUndo ? '6px' : '28px';
  t.style.display = 'flex';
  toastTimer = setTimeout(hideToast, withUndo ? 8000 : 3200);
}
function hideToast() {
  clearTimeout(toastTimer);
  const t = root && root.querySelector('[data-toast]');
  if (t) t.style.display = 'none';
}

// The note really goes once the Undo moment has passed (or the screen is left).
function finishRemove() {
  if (!undo) return;
  clearTimeout(undo.timer);
  const id = undo.id;
  undo = null;
  deleteMessage(id);
}
function removeNote(id) {
  if (!id) return;
  finishRemove(); // only one note can be waiting for Undo at a time
  undo = { id, timer: setTimeout(() => { finishRemove(); if (root) renderBoard(); }, 8000) };
  featuredId = undefined;
  renderBoard();
  toast('Note deleted', true);
}

// ---------- Sheets ----------
function overlay(html, onTap) {
  const box = root.querySelector('[data-composer]');
  box.style.display = 'flex';
  box.innerHTML = html;
  box.onclick = onTap;
  return box;
}
function closeSheet() {
  if (stopCodes) stopCodes();
  stopCodes = null;
  const box = root && root.querySelector('[data-composer]');
  if (box) { box.style.display = 'none'; box.innerHTML = ''; box.onclick = null; }
}

// The phone button: the code to leave a note from a phone.
function openPhone() {
  overlay(`
    <div class="mb-sheet" style="width:520px;padding:32px">
      <div style="display:flex;align-items:center;gap:16px">
        <div class="mb-h">From your phone</div>
        <button data-p="close" class="mb-pill white">Close</button>
      </div>
      ${phoneCode({ tab: 'note', size: 260, tone: 'light', column: true, title: 'Note', sub: '​' })}
    </div>`, (e) => {
    if (e.target === e.currentTarget || e.target.closest('[data-p="close"]')) closeSheet();
  });
  stopCodes = wirePhoneCodes(root.querySelector('[data-composer]'));
}

// Write a note: who it's from, and the note. Post and Cancel sit right beside the note box,
// so when the keyboard lifts the screen (app.js) they stay in view with it.
function openComposer() {
  const named = !noMembers();
  const names = named ? members() : [];
  const draft = loadDraft();
  let saved = '';
  try { saved = localStorage.getItem(LAST_WHO) || ''; } catch { saved = ''; }
  let current = named
    ? (draft && names.includes(draft.who) ? draft.who : names.includes(saved) ? saved : names[0])
    : (draft && draft.who) || saved;

  const box = overlay(`
    <div class="mb-sheet" style="width:${names.length > 3 ? 1060 : 880}px;padding:28px 32px">
      <div class="mb-h">New note</div>
      ${named
        ? `<div style="display:flex;gap:12px">${names.map((n) => `<button data-who="${esc(n)}" class="mb-person${n === current ? ' on' : ''}">${avatar(n, names.length > 3 ? 48 : 56)}<span>${esc(n)}</span></button>`).join('')}</div>`
        : `<input data-c="name" class="mb-field" maxlength="30" placeholder="Your name" value="${esc(current)}" autocomplete="off">`}
      <div style="display:flex;gap:14px">
        <textarea data-c="text" class="mb-field mb-text" maxlength="${MAXLEN}" placeholder="Write a note…"></textarea>
        <div style="display:flex;flex-direction:column;justify-content:space-between;gap:10px;flex:none;width:160px">
          <button data-c="post" class="x-btn lg mb-red" disabled>Post</button>
          <button data-c="cancel" class="mb-pill white">Cancel</button>
        </div>
      </div>
    </div>`, null);

  const $ = (s) => box.querySelector(s);
  const text = $('[data-c="text"]');
  const nameBox = $('[data-c="name"]');
  const postBtn = $('[data-c="post"]');
  if (draft) text.value = draft.text.slice(0, MAXLEN);
  const who = () => (named ? current : (nameBox.value.trim() || 'Someone'));
  const keep = () => saveDraft({ text: text.value, who: named ? current : nameBox.value.trim() });
  const sync = () => { postBtn.disabled = !text.value.trim(); };
  sync();
  text.addEventListener('input', () => { keep(); sync(); });
  if (nameBox) nameBox.addEventListener('input', keep);

  box.onclick = (e) => {
    const chip = e.target.closest('[data-who]');
    if (chip) {
      current = chip.dataset.who;
      box.querySelectorAll('[data-who]').forEach((c) => c.classList.toggle('on', c === chip));
      keep();
      return;
    }
    const c = e.target.closest('[data-c]');
    const act = c ? c.dataset.c : '';
    if (act === 'cancel') { saveDraft(null); return closeSheet(); }
    // A tap beside the sheet only closes it while it is empty: nobody loses a half-written note.
    if (e.target === box) { if (!text.value.trim()) closeSheet(); return; }
    if (act === 'post' && !postBtn.disabled) {
      const msg = postMessage({ who: who(), text: text.value.trim() });
      if (!msg) { postBtn.textContent = 'Try again'; return; }
      try { localStorage.setItem(LAST_WHO, named ? current : nameBox.value.trim()); } catch { /* fine */ }
      saveDraft(null);
      featuredId = msg.id;
      reveal = true;
      closeSheet();
      renderBoard();
    }
  };
}

// Notes a person has had in front of them count as read (the Home screen's "new notes").
function markLooked() {
  lookedAt.forEach((id) => updateMessage(id, { seen: true }));
  lookedAt = new Set();
}

// ---------- Screen ----------
export function mount(el) {
  root = el;
  featuredId = undefined;
  undo = null;
  armed = false;
  order = [];
  lookedAt = new Set();
  const name = householdName();
  el.innerHTML = `${STYLE}
  <div class="mb">
    ${topBar({
      title: name ? `${name}${/s$/i.test(name) ? '’' : '’s'} board` : 'Notes',
      tone: 'light',
      right: `<div style="display:flex;gap:12px"><button data-act="phone" class="x-btn white mb-icon" aria-label="Note from your phone">${PHONE}</button>`
        + '<button data-act="new" data-top-new class="x-btn mb-red">+ Write a note</button></div>',
    })}
    <div class="mb-main">
      <div data-left class="mb-left"></div>
      <div data-side class="mb-side"></div>
    </div>
    <div data-toast class="mb-toast"></div>
    <div data-composer class="mb-over"></div>
  </div>`;

  renderBoard();
  // Somebody opened the board, so the note it opens on is being read.
  if (featuredId) lookedAt.add(featuredId);

  onClick = (e) => {
    // Any tap means somebody is at the screen, looking at the note on show.
    if (featuredId) lookedAt.add(featuredId);
    if (e.target.closest('[data-composer]')) return;
    const a = e.target.closest('[data-act]');
    const act = a ? a.dataset.act : '';
    if (act !== 'delete' && armed) disarm();
    const card = e.target.closest('.mb-card');
    if (card) return show(card.dataset.id);
    if (act === 'undo') {
      if (undo) { clearTimeout(undo.timer); featuredId = undo.id; undo = null; }
      hideToast();
      return renderBoard();
    }
    if (act === 'new') return openComposer();
    if (act === 'phone') return openPhone();
    if (act === 'delete') return tapDelete(a);
  };
  el.addEventListener('click', onClick);

  // Swipe the big note sideways to read the next or the one before.
  onTouchStart = (e) => {
    const t = e.touches && e.touches[0];
    touch = t && e.target.closest && e.target.closest('[data-note]') ? { x: t.clientX, y: t.clientY } : null;
  };
  onTouchEnd = (e) => {
    const t = e.changedTouches && e.changedTouches[0];
    if (!touch || !t) return;
    const dx = t.clientX - touch.x, dy = t.clientY - touch.y;
    touch = null;
    if (Math.abs(dx) > 70 && Math.abs(dx) > 2 * Math.abs(dy)) step(dx < 0 ? 1 : -1);
  };
  el.addEventListener('touchstart', onTouchStart, { passive: true });
  el.addEventListener('touchend', onTouchEnd, { passive: true });

  // Keep "20 min ago" style times fresh, and show notes sent from phones right away.
  // (A note that arrives while nobody is about stays unread until someone touches the screen.)
  timer = setInterval(freshenTimes, 60000);
  offNotes = onMessagesChanged(() => { if (el.isConnected) { featuredId = undefined; renderBoard(); } });
}

export function unmount() {
  clearInterval(timer);
  clearTimeout(toastTimer);
  clearTimeout(armTimer);
  if (offNotes) offNotes();
  closeSheet();
  finishRemove();
  markLooked();
  if (root) {
    root.removeEventListener('click', onClick);
    root.removeEventListener('touchstart', onTouchStart);
    root.removeEventListener('touchend', onTouchEnd);
  }
  root = null;
}
