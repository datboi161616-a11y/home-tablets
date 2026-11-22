// Family · Message board (Messages.dc.html in the design)
// The newest note is featured on the left; tap an earlier note to feature it.
// "Record a reply" / "+ New note" open a composer (ready-made notes, typing or voice
// dictation, optional photo). Notes are kept on this tablet; phones on the home Wi-Fi can
// leave notes too (Photos → Add photos → scan the QR code → "Leave a note").
import { backHref, backLabel } from '../services/nav.js';
import { settings } from '../config.js';
import {
  members, noMembers, loadMessages, postMessage, updateMessage, deleteMessage, canDelete, when, fullWhen,
  shrinkPhoto, onMessagesChanged, isOld, emojiOnly, loadDraft, saveDraft, MAXLEN, QUICK_NOTES, ARCHIVE_DAYS,
} from '../services/messages-data.js';
import { spot, C } from '../art.js';

let timer, recognizer, root, onClick, featuredId, offNotes;
let undo = null;          // { id, timer }: a note just taken down, still on its way out
let toastTimer;
let showOld = false;      // the "older notes" drawer is open
let lookedAt = new Set(); // notes a person has had in front of them on this visit

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const initial = (name) => (name || '?').trim().charAt(0).toUpperCase();
// Long notes start smaller; fitFeatured() then shrinks further until the note fits.
const fitSize = (len) => (len <= 90 ? 44 : len <= 170 ? 36 : len <= 270 ? 30 : len <= 380 ? 26 : 24);
const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

const HEART = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/></svg>';
const MIC = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
const CAMERA = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>';
const TICK = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const PIN = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 3h6l-1 6 4 4H6l4-4zM12 13v8"/></svg>';

// Pin colours for the earlier notes, so the list reads like notes on a board.
const PINS = [C.accent, C.green, C.mustard, C.blue, C.plum];
// Fills the empty space under a short list: two pinned notes and a pencil, on the house halo.
const notesArt = () => `<svg viewBox="0 0 280 180" aria-hidden="true" focusable="false" style="display:block;width:260px;max-width:100%;height:auto">
  <circle cx="140" cy="96" r="80" fill="#F6EFE7"/>
  <g transform="rotate(-7 104 92)"><rect x="62" y="52" width="84" height="80" rx="4" fill="#FCE7A6"/><path d="M76 78h56M76 94h48M76 110h34" stroke="#C9A64A" stroke-width="4" stroke-linecap="round"/></g>
  <g transform="rotate(6 178 100)"><rect x="138" y="62" width="84" height="80" rx="4" fill="${C.peach}"/><path d="M180 124c-8-6-12-9-12-14a6 6 0 0 1 12-2a6 6 0 0 1 12 2c0 5-4 8-12 14z" fill="${C.accent}"/><path d="M152 86h52" stroke="#C98A6E" stroke-width="4" stroke-linecap="round"/></g>
  <circle cx="102" cy="54" r="7" fill="${C.accent}"/><circle cx="180" cy="64" r="7" fill="${C.green}"/>
  <g transform="rotate(-40 228 134)"><rect x="222" y="94" width="12" height="62" rx="2" fill="${C.gold}"/><path d="M222 156l6 13 6-13z" fill="${C.cream}"/><rect x="222" y="94" width="12" height="9" fill="${C.pink}"/></g>
</svg>`;

const STYLE = `
  <style>
    .msg-btn { min-height:60px; padding:0 24px; border-radius:999px; font-size:19px; font-weight:600; font-family:Inter,sans-serif; display:flex; align-items:center; gap:10px; cursor:pointer; flex:none; }
    .msg-btn-primary { border:none; background:${settings.accent}; color:#fff; }
    .msg-btn-outline { border:2px solid var(--ink); background:#fff; color:var(--ink); }
    .msg-btn-done { border:2px solid ${C.green}; background:#fff; color:${C.greenDeep}; }
    .msg-btn-done.on { background:${C.green}; color:#fff; }
    .msg-pill { min-height:56px; padding:0 20px; border-radius:999px; border:none; background:var(--bg); color:var(--ink); font-size:17px; font-weight:600; font-family:Inter,sans-serif; display:inline-flex; align-items:center; gap:8px; cursor:pointer; flex:none; }
    .msg-pill.white { background:#fff; }
    .msg-pill.on { background:${C.mustard}; color:#fff; }
    .msg-note { position:relative; background:#fff; border-radius:20px; padding:18px 20px; min-height:80px; display:flex; gap:14px; align-items:flex-start; cursor:pointer; flex:none; }
    .msg-note.done .msg-body { opacity:.55; }
    .msg-pin { position:absolute; top:-5px; left:50%; margin-left:-7px; width:14px; height:14px; border-radius:7px; box-shadow:0 2px 3px rgba(29,36,48,.25); }
    .msg-note.active { box-shadow: inset 0 0 0 3px ${settings.accent}; }
    .msg-note.pinned { box-shadow: inset 0 0 0 3px ${C.mustard}; }
    .msg-scroll { overflow-y:auto; scrollbar-width:none; }
    .msg-scroll::-webkit-scrollbar { display:none; }
    .msg-chip { min-height:52px; padding:0 20px; border-radius:999px; border:2px solid var(--line); background:#fff; color:var(--ink); font-size:17px; font-weight:600; font-family:Inter,sans-serif; cursor:pointer; }
    .msg-chip.on { background:var(--ink); border-color:var(--ink); color:#fff; }
    .msg-chip.quick { background:#FFF7E0; border-color:#F0DFA8; }
    .msg-text { width:100%; height:130px; flex:none; resize:none; border:2px solid var(--line); border-radius:16px; padding:14px 18px; font:22px/1.35 Inter,sans-serif; color:var(--ink); outline:none; user-select:text; }
    .msg-text:focus { border-color:${settings.accent}; }
    .msg-new, .msg-tag { display:inline-block; background:${settings.accent}; color:#fff; border-radius:999px; padding:1px 8px; font-size:12px; font-weight:700; letter-spacing:.04em; margin-right:6px; vertical-align:1px; }
    .msg-tag.pinned { background:${C.mustard}; }
    .msg-tag.done { background:${C.green}; }
    .msg-words { white-space:pre-line; overflow-wrap:anywhere; word-break:break-word; }
    .msg-listening { animation: msg-pulse 1.2s steps(2, jump-none) infinite; }
    @keyframes msg-pulse { 50% { opacity:.55; } }
    .msg-cancel.armed { background:#B3261E; color:#fff; }
  </style>`;

// The notes on the board right now (a note just taken down is already off it).
const visible = () => loadMessages().filter((m) => !undo || m.id !== undo.id);

// ---------- Board ----------
function renderBoard() {
  if (!root) return;
  const now = Date.now();
  const all = visible();
  if (!all.some((m) => m.id === featuredId)) featuredId = all[0]?.id;
  const f = all.find((m) => m.id === featuredId);
  const rest = all.filter((m) => m.id !== featuredId);
  // Pinned notes stay at the top of the list; old read notes are tucked away at the bottom.
  const earlier = rest.filter((m) => !isOld(m, now)).sort((a, b) => (b.pinned - a.pinned) || (b.at - a.at));
  const old = rest.filter((m) => isOld(m, now));
  const tidyable = all.filter((m) => m.seen && !m.pinned).length;
  const deletable = canDelete();

  // Re-drawing the list must not jump it back to the top.
  const listWas = root.querySelector('[data-list]');
  const keepScroll = listWas ? listWas.scrollTop : 0;

  const forLine = (m) => (m.for ? ` · for ${esc(m.for)}` : m.replyTo ? ` · reply to ${esc(m.replyTo)}` : '');
  const card = (n, i) => `
    <div class="msg-note${n.pinned ? ' pinned' : ''}${n.done ? ' done' : ''}" data-id="${esc(n.id)}"><span class="msg-pin" style="background:${n.pinned ? C.mustard : PINS[i % PINS.length]}"></span>
      <div style="width:44px;height:44px;flex-shrink:0;border-radius:50%;background:var(--ink);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:600">${initial(n.who)}</div>
      <div style="display:flex;flex-direction:column;gap:4px;min-width:0">
        <div class="muted" style="font-size:15px">${n.seen ? '' : '<span class="msg-new">NEW</span>'}${n.pinned ? '<span class="msg-tag pinned">PINNED</span>' : ''}${n.done ? '<span class="msg-tag done">✓ DONE</span>' : ''}${esc(n.who)}${forLine(n)} · ${when(n.at)}${n.loved ? ` · <span style="color:${settings.accent}">♥</span>` : ''}</div>
        <div class="msg-body msg-words" style="font-size:18px;line-height:1.35;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden">${n.photo ? (n.text ? 'Photo · ' : 'Photo') : ''}${esc(n.text)}</div>
      </div>
    </div>`;

  const big = f && !f.photo && emojiOnly(f.text);
  root.querySelector('[data-board]').innerHTML = `
    <div class="card" style="padding:32px 36px;display:flex;flex-direction:column;gap:18px;min-height:0;min-width:0">
      ${f ? `
      <div style="display:flex;align-items:center;gap:14px">
        <div style="width:56px;height:56px;flex:none;border-radius:50%;background:${settings.accent};color:#fff;display:flex;align-items:center;justify-content:center;font-family:Outfit,sans-serif;font-size:24px;font-weight:500">${initial(f.who)}</div>
        <div style="min-width:0;flex-grow:1">
          <div style="font-size:20px;font-weight:600;overflow-wrap:anywhere">${esc(f.who)}<span class="muted" style="font-weight:500">${forLine(f)}</span></div>
          <div class="muted" style="font-size:16px">${f.seen ? '' : 'New · '}${when(f.at)}${f.done ? ` · <span style="color:${C.greenDeep};font-weight:600">✓ Done</span>` : ''}</div>
        </div>
        <button data-act="pin" class="msg-pill${f.pinned ? ' on' : ''}">${PIN}${f.pinned ? 'Pinned' : 'Pin'}</button>
        ${deletable ? '<button data-act="remove" class="msg-pill">Remove</button>' : ''}
      </div>
      ${f.photo ? `
        <div style="flex-grow:1;min-height:0;border-radius:16px;background:#C9CFD6;overflow:hidden">
          <img src="${f.photo}" alt="" style="width:100%;height:100%;object-fit:cover;display:block">
        </div>
        ${f.text ? `<div data-fbox style="position:relative;flex:none"><div data-ftext class="display msg-words" style="font-size:${f.text.length > 120 ? 26 : 34}px;font-weight:500;line-height:1.25;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden">“${esc(f.text)}”</div></div>` : ''}`
      : `
        <div data-fbox="fit" style="position:relative;flex-grow:1;min-height:0;display:flex;align-items:center;overflow:hidden${big ? ';justify-content:center' : ''}">
          ${big
            ? `<div data-ftext style="font-size:140px;line-height:1.1;text-align:center">${esc(f.text.trim())}</div>`
            : `<div data-ftext class="display msg-words" style="font-size:${fitSize((f.text || '').length)}px;font-weight:500;line-height:1.25">“${esc(f.text)}”</div>`}
        </div>`}
      <div style="display:flex;gap:12px;align-items:center">
        <button data-act="love" class="msg-btn msg-btn-primary"${f.loved ? ' style="opacity:.75"' : ''}>${HEART}${f.loved ? 'Love sent!' : 'Send love'}</button>
        <button data-act="reply" class="msg-btn msg-btn-outline">${Speech ? 'Record a reply' : 'Write a reply'}</button>
        <button data-act="done" class="msg-btn msg-btn-done${f.done ? ' on' : ''}" style="margin-left:auto">${TICK}${f.done ? 'Done' : 'Mark done'}</button>
      </div>` : `
      <div style="flex-grow:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px">
        ${spot.noteBoard()}
        <div class="display muted" style="font-size:30px">No notes yet</div>
        <div class="muted" style="font-size:18px;text-align:center;max-width:440px">Leave one for the family: “Back at 6”, “Dog has been fed”… It takes two taps.</div>
        <button data-act="new" class="msg-btn msg-btn-primary">Write the first one</button>
      </div>`}
    </div>

    <div style="display:flex;flex-direction:column;gap:14px;min-height:0;min-width:0">
      <div style="display:flex;align-items:center;gap:10px;min-height:56px">
        <div class="eyebrow muted" style="margin-right:auto">Earlier</div>
        ${deletable && tidyable >= 2 ? '<button data-act="tidy" class="msg-pill white">Tidy up</button>' : ''}
        <button data-act="new" class="msg-pill white">+ New note</button>
      </div>
      <div data-list class="msg-scroll" style="display:flex;flex-direction:column;gap:16px;min-height:0;flex-grow:1;padding-top:6px;margin-top:-6px">
        ${f && !earlier.length && !old.length ? '<div class="muted" style="font-size:17px;padding:8px 4px">Older notes will be listed here. Tap one to read it in full.</div>' : ''}
        ${earlier.map(card).join('')}
        ${old.length ? `
          <button data-act="old" class="msg-pill" style="align-self:flex-start;background:transparent;border:2px solid var(--line)">${showOld ? 'Hide older notes' : `Show ${plural(old.length, 'older note', 'older notes')}`}</button>
          ${showOld ? `<div class="muted" style="font-size:16px;padding:0 4px">Read notes more than ${ARCHIVE_DAYS === 14 ? 'two weeks' : `${ARCHIVE_DAYS} days`} old are kept down here, out of the way.</div>${old.map((n, i) => card(n, i + earlier.length)).join('')}` : ''}` : ''}
        ${f && earlier.length <= 2 && !showOld ? `<div style="margin:auto 0;flex:none;display:flex;justify-content:center">${notesArt()}</div>` : ''}
      </div>
    </div>`;

  const list = root.querySelector('[data-list]');
  if (list && keepScroll) list.scrollTop = keepScroll;
  // Measure once the browser has laid the note out.
  Promise.resolve().then(fitFeatured);
}

// A long note shrinks until it fits the card; if even the smallest size is too big
// (or a photo note's words are cut short), a "Read all" button opens it in full.
function fitFeatured() {
  if (!root) return;
  const box = root.querySelector('[data-fbox]');
  const txt = root.querySelector('[data-ftext]');
  if (!box || !txt) return;
  let clipped;
  if (box.dataset.fbox === 'fit') {
    let size = parseFloat(txt.style.fontSize) || 30;
    while (txt.offsetHeight > box.clientHeight + 1 && size > 22) {
      size -= 2;
      txt.style.fontSize = `${size}px`;
    }
    clipped = txt.offsetHeight > box.clientHeight + 1;
    if (clipped) { box.style.alignItems = 'flex-start'; }
  } else {
    clipped = txt.scrollHeight > txt.clientHeight + 1;
  }
  if (clipped) {
    box.insertAdjacentHTML('beforeend', `<button data-act="read" class="msg-pill" style="position:absolute;right:0;bottom:0;background:#fff;box-shadow:-24px 0 18px #fff, 0 2px 10px rgba(29,36,48,.18)">Read all</button>`);
  }
}

// ---------- Overlays: reading a note in full, tidying up ----------
function overlay(html, onTap) {
  const box = root.querySelector('[data-composer]');
  box.style.display = 'flex';
  box.innerHTML = html;
  box.onclick = onTap;
  return box;
}

function openReader(m) {
  overlay(`
    <div class="card" style="width:900px;max-height:700px;padding:32px 36px;display:flex;flex-direction:column;gap:18px;box-shadow:0 20px 60px rgba(0,0,0,.25)">
      <div style="display:flex;align-items:center;gap:14px">
        <div style="width:56px;height:56px;flex:none;border-radius:50%;background:${settings.accent};color:#fff;display:flex;align-items:center;justify-content:center;font-family:Outfit,sans-serif;font-size:24px;font-weight:500">${initial(m.who)}</div>
        <div style="min-width:0;flex-grow:1">
          <div style="font-size:20px;font-weight:600">${esc(m.who)}${m.for ? `<span class="muted" style="font-weight:500"> · for ${esc(m.for)}</span>` : ''}</div>
          <div class="muted" style="font-size:16px">${fullWhen(m.at)}</div>
        </div>
        <button data-r="close" class="msg-pill">Close</button>
      </div>
      <div class="msg-scroll" style="min-height:0;display:flex;flex-direction:column;gap:18px">
        ${m.photo ? `<img src="${m.photo}" alt="" style="width:100%;height:360px;object-fit:contain;border-radius:16px;background:#F3F4F6;flex:none">` : ''}
        ${m.text ? `<div class="display msg-words" style="font-size:28px;font-weight:500;line-height:1.35;flex:none">“${esc(m.text)}”</div>` : ''}
      </div>
    </div>`, (e) => {
    if (e.target === e.currentTarget || e.target.closest('[data-r="close"]')) closeComposer();
  });
}

function openTidy() {
  const gone = visible().filter((m) => m.seen && !m.pinned);
  if (!gone.length) return;
  overlay(`
    <div class="card" style="width:640px;padding:36px;display:flex;flex-direction:column;gap:18px;box-shadow:0 20px 60px rgba(0,0,0,.25)">
      <div class="display" style="font-size:32px;font-weight:500">Take down ${plural(gone.length, 'read note', 'read notes')}?</div>
      <div style="font-size:19px;line-height:1.4">Everything that has already been read comes off the board. New notes and pinned notes stay up. This can’t be undone.</div>
      <div style="display:flex;gap:12px;justify-content:flex-end;margin-top:8px">
        <button data-t="keep" class="msg-btn msg-btn-outline">Keep them</button>
        <button data-t="go" class="msg-btn msg-btn-primary" style="background:#B3261E">Take them down</button>
      </div>
    </div>`, (e) => {
    const t = e.target.closest('[data-t]')?.dataset.t;
    if (e.target === e.currentTarget || t === 'keep') return closeComposer();
    if (t !== 'go') return;
    let n = 0;
    gone.forEach((m) => { if (deleteMessage(m.id)) n++; });
    closeComposer();
    featuredId = undefined;
    renderBoard();
    toast(n ? `${plural(n, 'note', 'notes')} taken down` : 'Couldn’t take the notes down just now');
  });
}

// ---------- A short message at the bottom, with Undo after removing a note ----------
function toast(textHtml, withUndo = false) {
  const t = root?.querySelector('[data-toast]');
  if (!t) return;
  clearTimeout(toastTimer);
  t.innerHTML = `<span>${esc(textHtml)}</span>${withUndo ? '<button data-act="undo" class="msg-pill" style="background:#fff;color:var(--ink)">Undo</button>' : ''}`;
  t.style.paddingRight = withUndo ? '8px' : '28px';
  t.style.minHeight = '56px';
  t.style.display = 'flex';
  toastTimer = setTimeout(() => { t.style.display = 'none'; }, withUndo ? 8000 : 4000);
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
  finishRemove(); // only one note can be waiting for Undo at a time
  undo = { id, timer: setTimeout(() => { finishRemove(); if (root) renderBoard(); }, 8000) };
  featuredId = undefined;
  renderBoard();
  toast('Note taken down', true);
}

// ---------- Composer ----------
function openComposer(replyTo) {
  const people = members();
  const draft = loadDraft();
  const restored = draft && (draft.replyTo || null) === (replyTo || null) ? draft : null;
  let saved = null;
  try { saved = localStorage.getItem('messages.lastWho'); } catch { saved = null; }
  let current = restored && people.includes(restored.who) ? restored.who : people.includes(saved) ? saved : people[0];
  let forWho = restored ? (restored.forWho || null) : (replyTo && people.includes(replyTo) ? replyTo : null);
  if (forWho && !people.includes(forWho)) forWho = null;
  let photo = null;
  const box = root.querySelector('[data-composer]');
  box.style.display = 'flex';
  box.innerHTML = `
    <div class="card msg-scroll" style="width:860px;max-height:780px;padding:28px 32px;display:flex;flex-direction:column;gap:16px;box-shadow:0 20px 60px rgba(0,0,0,.25)">
      <div style="display:flex;align-items:center;justify-content:space-between;flex:none">
        <div class="display" style="font-size:32px;font-weight:500">${replyTo ? `Reply to ${esc(replyTo)}` : 'New note'}</div>
        <button data-c="cancel" class="msg-pill msg-cancel">Cancel</button>
      </div>
      <textarea data-c="text" class="msg-text" maxlength="${MAXLEN}" placeholder="${Speech ? 'Tap a ready-made note below, tap Speak, or tap here to type…' : 'Tap a ready-made note below, or tap here to type…'}"></textarea>
      <div style="display:flex;align-items:center;gap:12px;flex:none">
        ${Speech ? `<button data-c="speak" class="msg-btn msg-btn-outline">${MIC}<span>Speak</span></button>` : ''}
        ${window.TabletNative ? '' : `<label class="msg-btn msg-btn-outline" style="position:relative">${CAMERA}<span data-c="photo-label">Add photo</span>
          <input data-c="file" type="file" accept="image/*" style="position:absolute;top:0;right:0;bottom:0;left:0;opacity:0;cursor:pointer">
        </label>`}
        <div data-c="thumb" style="width:60px;height:60px;flex:none;border-radius:12px;background:center/cover #C9CFD6;display:none"></div>
        <div data-c="hint" class="muted" style="font-size:16px;flex-grow:1;min-width:0"></div>
        <button data-c="post" class="msg-btn msg-btn-primary" disabled>Post</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;flex:none">
        <div class="eyebrow muted">Ready-made notes</div>
        <div style="display:flex;flex-wrap:wrap;gap:10px">
          ${QUICK_NOTES.map((q) => `<button data-quick="${esc(q)}" class="msg-chip quick">${esc(q)}</button>`).join('')}
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;flex:none">
        <div class="eyebrow muted">From</div>
        <div style="display:flex;flex-wrap:wrap;gap:10px">
          ${people.map((m) => `<button data-who="${esc(m)}" class="msg-chip${m === current ? ' on' : ''}">${esc(m)}</button>`).join('')}
        </div>
        ${noMembers() ? '<div class="muted" style="font-size:16px">To sign notes with your own names, add everyone from a phone. Settings shows how.</div>' : ''}
      </div>
      ${people.length > 1 ? `
      <div style="display:flex;flex-direction:column;gap:8px;flex:none">
        <div class="eyebrow muted">For</div>
        <div style="display:flex;flex-wrap:wrap;gap:10px">
          <button data-for="" class="msg-chip${forWho ? '' : ' on'}">Everyone</button>
          ${people.map((m) => `<button data-for="${esc(m)}" class="msg-chip${m === forWho ? ' on' : ''}">${esc(m)}</button>`).join('')}
        </div>
      </div>` : ''}
    </div>`;

  const $ = (s) => box.querySelector(s);
  const text = $('[data-c="text"]');
  const postBtn = $('[data-c="post"]');
  const cancelBtn = $('[data-c="cancel"]');
  const hint = $('[data-c="hint"]');
  let trouble = '';
  let note = '';
  let cancelArmed = false, cancelTimer;
  if (restored) { text.value = restored.text.slice(0, MAXLEN); note = 'Your unfinished note is back.'; }

  const keep = () => saveDraft({ text: text.value, who: current, forWho, replyTo: replyTo || null });
  const disarm = () => {
    cancelArmed = false; clearTimeout(cancelTimer);
    cancelBtn.classList.remove('armed'); cancelBtn.textContent = 'Cancel';
  };
  const sync = () => {
    const ok = text.value.trim().length > 0 || photo;
    postBtn.disabled = !ok;
    postBtn.style.opacity = ok ? 1 : 0.45;
    // A short line beside Post: trouble, the draft coming back, or how much room is left.
    const left = MAXLEN - text.value.length;
    hint.style.color = trouble ? '#B3261E' : '';
    hint.textContent = trouble || (left <= 60 ? (left ? `Room for ${left} more letters` : 'The note is full') : note);
  };
  sync();
  text.addEventListener('input', () => { trouble = ''; note = ''; disarm(); keep(); sync(); });

  // (No "Add photo" on the kitchen screen itself: it has no file chooser, so the button did
  // nothing there. Notes with a photo come from a phone.)
  ($('[data-c="file"]') || document.createElement('input')).addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      photo = await shrinkPhoto(file);
      if (!box.isConnected) return;
      const t = $('[data-c="thumb"]');
      t.style.display = 'block';
      t.style.backgroundImage = `url(${photo})`;
      $('[data-c="photo-label"]').textContent = 'Change photo';
    } catch (err) { console.error(err); }
    sync();
  });

  const stopSpeech = () => {
    recognizer?.stop();
    recognizer = null;
    const b = $('[data-c="speak"]');
    if (b) { b.classList.remove('msg-listening'); b.querySelector('span').textContent = 'Speak'; }
  };
  const startSpeech = () => {
    if (!Speech) return;
    stopSpeech();
    const base = text.value.trim();
    recognizer = new Speech();
    recognizer.lang = 'en-US';
    recognizer.interimResults = true;
    recognizer.continuous = true;
    recognizer.onresult = (e) => {
      const said = Array.from(e.results).map((r) => r[0].transcript).join(' ').trim();
      text.value = [base, said].filter(Boolean).join(' ').slice(0, MAXLEN);
      note = '';
      keep();
      sync();
    };
    recognizer.onend = stopSpeech;
    recognizer.onerror = (e) => {
      const err = e && e.error;
      if (err === 'not-allowed' || err === 'service-not-allowed') trouble = 'The microphone isn’t allowed here. Please type your note instead.';
      else if (err === 'network') trouble = 'Speaking needs the internet. Please type your note instead.';
      else if (err === 'no-speech') trouble = 'Didn’t hear anything. Tap Speak and try again, or type.';
      else if (err && err !== 'aborted') trouble = 'Couldn’t listen just now. Tap Speak to try again, or type.';
      sync();
      stopSpeech();
    };
    trouble = '';
    sync();
    try { recognizer.start(); } catch { trouble = 'Couldn’t listen just now. Please type your note instead.'; sync(); return stopSpeech(); }
    const b = $('[data-c="speak"]');
    b.classList.add('msg-listening');
    b.querySelector('span').textContent = 'Listening… tap to stop';
  };

  const pick = (attr, value) => box.querySelectorAll(`[${attr}]`).forEach((c) => c.classList.toggle('on', c.getAttribute(attr) === value));

  box.onclick = (e) => {
    const quick = e.target.closest('[data-quick]');
    if (quick) {
      // Fills an empty note, or is added to what is already there.
      const q = quick.dataset.quick;
      const was = text.value.trim();
      text.value = (was ? `${was}${/[.!?…]$/.test(was) ? ' ' : '. '}${q}` : q).slice(0, MAXLEN);
      trouble = ''; note = ''; disarm(); keep(); sync();
      return;
    }
    const chip = e.target.closest('[data-who]');
    if (chip) {
      current = chip.dataset.who;
      pick('data-who', current);
      keep();
      return;
    }
    const forChip = e.target.closest('[data-for]');
    if (forChip) {
      forWho = forChip.dataset.for || null;
      pick('data-for', forChip.dataset.for);
      keep();
      return;
    }
    const act = e.target.closest('[data-c]')?.dataset.c;
    if (act === 'cancel') {
      // With words in the box, Cancel asks for a second tap before throwing them away.
      if (text.value.trim() && !cancelArmed) {
        cancelArmed = true;
        cancelBtn.classList.add('armed');
        cancelBtn.textContent = 'Tap again to throw away';
        cancelTimer = setTimeout(() => { if (box.isConnected) disarm(); }, 5000);
        return;
      }
      clearTimeout(cancelTimer);
      saveDraft(null);
      return closeComposer();
    }
    if (act !== 'cancel' && cancelArmed) disarm();
    // A tap beside the note only closes it while it is still empty: nobody loses a
    // half-written note to a stray finger.
    if (e.target === box) { if (!text.value.trim() && !photo) closeComposer(); return; }
    if (act === 'speak') return recognizer ? stopSpeech() : startSpeech();
    if (act === 'post' && !postBtn.disabled) {
      stopSpeech();
      const msg = postMessage({ who: current, text: text.value.trim(), photo, replyTo, forWho });
      if (!msg) {
        trouble = 'Couldn’t put the note up just now. Please tap Post again.';
        return sync();
      }
      try { localStorage.setItem('messages.lastWho', current); } catch { /* fine */ }
      saveDraft(null);
      clearTimeout(cancelTimer);
      featuredId = msg.id;
      closeComposer();
      renderBoard();
    }
  };

  // "Record a reply" starts listening straight away when the tablet supports it. Otherwise
  // the keyboard waits until the box is tapped, so the ready-made notes and names stay in view.
  if (replyTo && Speech && !restored) startSpeech();
}

function closeComposer() {
  recognizer?.stop();
  recognizer = null;
  const box = root?.querySelector('[data-composer]');
  if (box) { box.style.display = 'none'; box.innerHTML = ''; box.onclick = null; }
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
  showOld = false;
  undo = null;
  lookedAt = new Set();
  el.innerHTML = `${STYLE}
  <div style="height:100%;padding:40px;display:flex;flex-direction:column;gap:24px">
    <div style="display:flex;align-items:center;justify-content:space-between">
      <div style="display:flex;align-items:center;gap:16px">
        <a href="${backHref()}" class="pill" style="background:#fff">${backLabel()}</a>
        <div class="display" style="font-size:40px;font-weight:500">Message board</div>
      </div>
      <div class="muted" style="font-size:17px">Leave a note here, or from a phone on your Wi-Fi</div>
    </div>
    <div data-board style="flex-grow:1;display:grid;grid-template-columns:1.4fr 1fr;gap:24px;min-height:0"></div>
  </div>
  <div data-toast style="position:absolute;right:40px;bottom:40px;display:none;align-items:center;gap:18px;background:var(--ink);color:#fff;border-radius:999px;padding:8px 8px 8px 28px;font-size:19px;font-weight:600;z-index:9;box-shadow:0 10px 30px rgba(0,0,0,.25)"></div>
  <div data-composer style="position:absolute;top:0;right:0;bottom:0;left:0;background:rgba(29,36,48,.45);display:none;align-items:center;justify-content:center;z-index:10"></div>`;

  renderBoard();
  // Somebody opened the board, so the note it opens on is being read.
  if (featuredId) lookedAt.add(featuredId);

  onClick = (e) => {
    // Any tap means somebody is at the screen, looking at the note on show.
    if (featuredId) lookedAt.add(featuredId);
    if (e.target.closest('[data-composer]')) return;
    const note = e.target.closest('.msg-note');
    if (note) {
      if (featuredId) updateMessage(featuredId, { seen: true });
      featuredId = note.dataset.id;
      lookedAt.add(featuredId);
      return renderBoard();
    }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'undo') {
      if (undo) { clearTimeout(undo.timer); featuredId = undo.id; undo = null; }
      clearTimeout(toastTimer);
      root.querySelector('[data-toast]').style.display = 'none';
      return renderBoard();
    }
    if (act === 'new') return openComposer(null);
    if (act === 'tidy') return openTidy();
    if (act === 'old') { showOld = !showOld; return renderBoard(); }
    const f = visible().find((m) => m.id === featuredId);
    if (!f) return;
    if (act === 'remove') removeNote(f.id);
    else if (act === 'love' && !f.loved) { updateMessage(f.id, { loved: true }); renderBoard(); }
    else if (act === 'pin') { updateMessage(f.id, { pinned: !f.pinned }); renderBoard(); }
    else if (act === 'done') { updateMessage(f.id, { done: !f.done }); renderBoard(); }
    else if (act === 'read') openReader(f);
    else if (act === 'reply') openComposer(f.who);
  };
  el.addEventListener('click', onClick);

  // Keep "20 min ago" style times fresh, and show notes sent from phones right away.
  // (A note that arrives while nobody is about stays "new" until someone touches the screen.)
  timer = setInterval(() => { if (el.isConnected) renderBoard(); }, 60000);
  offNotes = onMessagesChanged(() => { if (el.isConnected) { featuredId = undefined; renderBoard(); } });
}

export function unmount() {
  clearInterval(timer);
  clearTimeout(toastTimer);
  offNotes?.();
  closeComposer();
  finishRemove();
  markLooked();
  root?.removeEventListener('click', onClick);
  root = null;
}
