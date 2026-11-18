// Family · Message board (Messages.dc.html in the design)
// The newest note is featured on the left; tap an earlier note to feature it.
// "Record a reply" / "+ New note" open a composer (typing or voice dictation,
// optional photo). Notes are kept on this tablet; phones on the home Wi-Fi can
// leave notes too (Photos → Add photos → scan the QR code → "Leave a note").
import { settings } from '../config.js';
import {
  members, loadMessages, postMessage, updateMessage, deleteMessage, when, shrinkPhoto, onMessagesChanged,
} from '../services/messages-data.js';
import { spot, C } from '../art.js';

let timer, recognizer, root, onClick, featuredId, offNotes, removeTimer;
let removeArmed = false; // "Remove" was tapped once; the next tap really removes
const MAXLEN = 400;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const initial = (name) => (name || '?').trim().charAt(0).toUpperCase();
// Long notes get a smaller font so the whole note fits on the featured card.
const fitSize = (len) => (len <= 90 ? 44 : len <= 170 ? 36 : len <= 270 ? 30 : 26);
const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;

const HEART = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/></svg>';
const MIC = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
const CAMERA = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>';

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
    .msg-btn { min-height:60px; padding:0 28px; border-radius:999px; font-size:19px; font-weight:600; font-family:Inter,sans-serif; display:flex; align-items:center; gap:10px; cursor:pointer; }
    .msg-btn-primary { border:none; background:${settings.accent}; color:#fff; }
    .msg-btn-outline { border:2px solid var(--ink); background:#fff; color:var(--ink); }
    .msg-note { position:relative; background:#fff; border-radius:20px; padding:18px 20px; display:flex; gap:14px; align-items:flex-start; cursor:pointer; flex:none; }
    .msg-pin { position:absolute; top:-5px; left:50%; margin-left:-7px; width:14px; height:14px; border-radius:7px; box-shadow:0 2px 3px rgba(29,36,48,.25); }
    .msg-note.active { box-shadow: inset 0 0 0 3px ${settings.accent}; }
    .msg-scroll { overflow-y:auto; scrollbar-width:none; }
    .msg-scroll::-webkit-scrollbar { display:none; }
    .msg-chip { min-height:48px; padding:0 20px; border-radius:999px; border:2px solid var(--line); background:#fff; color:var(--ink); font-size:17px; font-weight:600; font-family:Inter,sans-serif; cursor:pointer; }
    .msg-chip.on { background:var(--ink); border-color:var(--ink); color:#fff; }
    .msg-text { width:100%; height:150px; resize:none; border:2px solid var(--line); border-radius:16px; padding:16px 18px; font:22px/1.35 Inter,sans-serif; color:var(--ink); outline:none; user-select:text; }
    .msg-text:focus { border-color:${settings.accent}; }
    .msg-btn-remove { min-height:60px; padding:0 22px; border-radius:999px; border:none; background:transparent; color:#5B6573; font-size:17px; font-weight:600; font-family:Inter,sans-serif; cursor:pointer; margin-left:auto; }
    .msg-btn-remove.armed { background:#B3261E; color:#fff; }
    .msg-new { display:inline-block; background:${settings.accent}; color:#fff; border-radius:999px; padding:1px 8px; font-size:12px; font-weight:700; letter-spacing:.04em; margin-right:6px; vertical-align:1px; }
    .msg-listening { animation: msg-pulse 1.2s ease-in-out infinite; }
    @keyframes msg-pulse { 50% { opacity:.55; } }
  </style>`;

// ---------- Board ----------
function renderBoard() {
  const list = loadMessages();
  if (!list.some((m) => m.id === featuredId)) featuredId = list[0]?.id;
  const f = list.find((m) => m.id === featuredId);
  const earlier = list.filter((m) => m.id !== featuredId);

  root.querySelector('[data-board]').innerHTML = `
    <div class="card" style="padding:36px;display:flex;flex-direction:column;gap:20px;min-height:0;min-width:0">
      ${f ? `
      <div style="display:flex;align-items:center;gap:14px">
        <div style="width:56px;height:56px;flex:none;border-radius:50%;background:${settings.accent};color:#fff;display:flex;align-items:center;justify-content:center;font-family:Outfit,sans-serif;font-size:24px;font-weight:500">${initial(f.who)}</div>
        <div style="min-width:0">
          <div style="font-size:20px;font-weight:600">${esc(f.who)}${f.replyTo ? `<span class="muted" style="font-weight:500"> · reply to ${esc(f.replyTo)}</span>` : ''}</div>
          <div class="muted" style="font-size:16px">${f.seen ? '' : 'New · '}${when(f.at)}</div>
        </div>
      </div>
      ${f.photo ? `
        <div style="flex-grow:1;min-height:0;border-radius:16px;background:#C9CFD6;overflow:hidden">
          <img src="${f.photo}" alt="" style="width:100%;height:100%;object-fit:cover;display:block">
        </div>
        ${f.text ? `<div class="display" style="font-size:${f.text.length > 120 ? 26 : 34}px;font-weight:500;line-height:1.25;overflow-wrap:anywhere;flex:none;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden">“${esc(f.text)}”</div>` : ''}`
      : `
        <div style="flex-grow:1;min-height:0;display:flex;align-items:center;overflow:hidden">
          <div class="display" style="font-size:${fitSize((f.text || '').length)}px;font-weight:500;line-height:1.25;overflow-wrap:anywhere">“${esc(f.text)}”</div>
        </div>`}
      <div style="display:flex;gap:12px;align-items:center">
        <button data-act="love" class="msg-btn msg-btn-primary"${f.loved ? ' style="opacity:.75"' : ''}>${HEART}${f.loved ? 'Love sent!' : 'Send love'}</button>
        <button data-act="reply" class="msg-btn msg-btn-outline">${Speech ? 'Record a reply' : 'Write a reply'}</button>
        <button data-act="remove" class="msg-btn-remove${removeArmed ? ' armed' : ''}">${removeArmed ? 'Tap again to remove' : 'Remove'}</button>
      </div>` : `
      <div style="flex-grow:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px">
        ${spot.noteBoard()}
        <div class="display muted" style="font-size:30px">No notes yet</div>
        <button data-act="new" class="msg-btn msg-btn-primary">Write the first one</button>
      </div>`}
    </div>

    <div style="display:flex;flex-direction:column;gap:16px;min-height:0;min-width:0">
      <div style="display:flex;align-items:center;justify-content:space-between;min-height:44px">
        <div class="eyebrow muted">Earlier</div>
        <button data-act="new" class="pill" style="border:none;background:#fff;color:var(--ink);font-family:Inter,sans-serif;cursor:pointer">+ New note</button>
      </div>
      <div class="msg-scroll" style="display:flex;flex-direction:column;gap:16px;min-height:0;flex-grow:1;padding-top:6px;margin-top:-6px">
        ${f && !earlier.length ? '<div class="muted" style="font-size:17px;padding:8px 4px">Older notes will be listed here. Tap one to read it in full.</div>' : ''}
        ${earlier.map((n, i) => `
          <div class="msg-note" data-id="${esc(n.id)}"><span class="msg-pin" style="background:${PINS[i % PINS.length]}"></span>
            <div style="width:44px;height:44px;flex-shrink:0;border-radius:50%;background:var(--ink);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:600">${initial(n.who)}</div>
            <div style="display:flex;flex-direction:column;gap:4px;min-width:0">
              <div class="muted" style="font-size:15px">${n.seen ? '' : '<span class="msg-new">NEW</span>'}${esc(n.who)} · ${when(n.at)}${n.loved ? ` · <span style="color:${settings.accent}">♥</span>` : ''}</div>
              <div style="font-size:18px;line-height:1.35;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden">${n.photo ? (n.text ? 'Photo · ' : 'Photo') : ''}${esc(n.text)}</div>
            </div>
          </div>`).join('')}
        ${f && earlier.length <= 2 ? `<div style="margin:auto 0;flex:none;display:flex;justify-content:center">${notesArt()}</div>` : ''}
      </div>
    </div>`;
}

// ---------- Composer ----------
function openComposer(replyTo) {
  const people = members();
  const saved = localStorage.getItem('messages.lastWho');
  const who = people.includes(saved) ? saved : people[0];
  let photo = null;
  const box = root.querySelector('[data-composer]');
  box.style.display = 'flex';
  box.innerHTML = `
    <div class="card" style="width:820px;padding:32px;display:flex;flex-direction:column;gap:20px;box-shadow:0 20px 60px rgba(0,0,0,.25)">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <div class="display" style="font-size:32px;font-weight:500">${replyTo ? `Reply to ${esc(replyTo)}` : 'New note'}</div>
        <button data-c="cancel" class="pill" style="border:none;background:var(--bg);color:var(--ink);font-family:Inter,sans-serif;cursor:pointer">Cancel</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <div class="eyebrow muted">From</div>
        <div style="display:flex;flex-wrap:wrap;gap:10px">
          ${people.map((m) => `<button data-who="${esc(m)}" class="msg-chip${m === who ? ' on' : ''}">${esc(m)}</button>`).join('')}
        </div>
      </div>
      <textarea data-c="text" class="msg-text" maxlength="${MAXLEN}" placeholder="${Speech ? 'Tap Speak, or type your note…' : 'Type your note…'}"></textarea>
      <div data-c="hint" class="muted" style="font-size:16px;min-height:20px;margin-top:-10px"></div>
      <div style="display:flex;align-items:center;gap:12px">
        ${Speech ? `<button data-c="speak" class="msg-btn msg-btn-outline">${MIC}<span>Speak</span></button>` : ''}
        <label class="msg-btn msg-btn-outline" style="position:relative">${CAMERA}<span data-c="photo-label">Add photo</span>
          <input data-c="file" type="file" accept="image/*" style="position:absolute;top:0;right:0;bottom:0;left:0;opacity:0;cursor:pointer">
        </label>
        <div data-c="thumb" style="width:60px;height:60px;border-radius:12px;background:center/cover #C9CFD6;display:none"></div>
        <button data-c="post" class="msg-btn msg-btn-primary" style="margin-left:auto" disabled>Post</button>
      </div>
    </div>`;

  const $ = (s) => box.querySelector(s);
  const text = $('[data-c="text"]');
  const postBtn = $('[data-c="post"]');
  let current = who;
  const hint = $('[data-c="hint"]');
  let trouble = '';
  const sync = () => {
    const ok = text.value.trim().length > 0 || photo;
    postBtn.disabled = !ok;
    postBtn.style.opacity = ok ? 1 : 0.45;
    // A short line under the note: microphone trouble, or how much room is left.
    const left = MAXLEN - text.value.length;
    hint.style.color = trouble ? '#B3261E' : '';
    hint.textContent = trouble || (left <= 60 ? (left ? `Room for ${left} more letters` : 'The note is full') : '');
  };
  sync();
  text.addEventListener('input', () => { trouble = ''; sync(); });

  $('[data-c="file"]').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      photo = await shrinkPhoto(file);
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
      text.value = [base, said].filter(Boolean).join(' ');
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

  box.onclick = (e) => {
    const chip = e.target.closest('[data-who]');
    if (chip) {
      current = chip.dataset.who;
      box.querySelectorAll('[data-who]').forEach((c) => c.classList.toggle('on', c === chip));
      return;
    }
    const act = e.target.closest('[data-c]')?.dataset.c;
    if (act === 'cancel' || e.target === box) return closeComposer();
    if (act === 'speak') return recognizer ? stopSpeech() : startSpeech();
    if (act === 'post' && !postBtn.disabled) {
      stopSpeech();
      localStorage.setItem('messages.lastWho', current);
      const msg = postMessage({ who: current, text: text.value.trim(), photo, replyTo });
      featuredId = msg.id;
      closeComposer();
      renderBoard();
    }
  };

  // "Record a reply" starts listening straight away when the tablet supports it.
  if (replyTo && Speech) startSpeech();
  else text.focus();
}

function closeComposer() {
  recognizer?.stop();
  recognizer = null;
  const box = root?.querySelector('[data-composer]');
  if (box) { box.style.display = 'none'; box.innerHTML = ''; box.onclick = null; }
}

// ---------- Screen ----------
export function mount(el) {
  root = el;
  featuredId = undefined;
  removeArmed = false;
  el.innerHTML = `${STYLE}
  <div style="height:100%;padding:40px;display:flex;flex-direction:column;gap:24px">
    <div style="display:flex;align-items:center;justify-content:space-between">
      <div style="display:flex;align-items:center;gap:16px">
        <a href="#/launcher" class="pill" style="background:#fff">← Menu</a>
        <div class="display" style="font-size:40px;font-weight:500">Message board</div>
      </div>
      <div class="muted" style="font-size:17px">Leave a note here, or from a phone on your Wi-Fi</div>
    </div>
    <div data-board style="flex-grow:1;display:grid;grid-template-columns:1.4fr 1fr;gap:24px;min-height:0"></div>
  </div>
  <div data-composer style="position:absolute;top:0;right:0;bottom:0;left:0;background:rgba(29,36,48,.45);display:none;align-items:center;justify-content:center;z-index:10"></div>`;

  renderBoard();

  onClick = (e) => {
    if (e.target.closest('[data-composer]')) return;
    const note = e.target.closest('.msg-note');
    if (note) {
      removeArmed = false;
      featuredId = note.dataset.id;
      return renderBoard();
    }
    const act = e.target.closest('[data-act]')?.dataset.act;
    const f = loadMessages().find((m) => m.id === featuredId);
    // Remove takes two taps, so a note can't vanish by accident.
    if (act !== 'remove' && removeArmed) { removeArmed = false; clearTimeout(removeTimer); renderBoard(); }
    if (act === 'remove' && f) {
      clearTimeout(removeTimer);
      if (!removeArmed) {
        removeArmed = true;
        removeTimer = setTimeout(() => { removeArmed = false; if (root) renderBoard(); }, 5000);
      } else {
        removeArmed = false;
        if (deleteMessage(f.id)) featuredId = undefined;
      }
      return renderBoard();
    }
    if (act === 'love' && f && !f.loved) {
      updateMessage(f.id, { loved: true });
      renderBoard();
    } else if (act === 'reply' && f) {
      openComposer(f.who);
    } else if (act === 'new') {
      openComposer(null);
    }
  };
  el.addEventListener('click', onClick);

  // Keep "20 min ago" style times fresh, and show notes sent from phones right away.
  timer = setInterval(() => { if (el.isConnected) renderBoard(); }, 60000);
  offNotes = onMessagesChanged(() => { if (el.isConnected) { featuredId = undefined; renderBoard(); } });
}

export function unmount() {
  clearInterval(timer);
  clearTimeout(removeTimer);
  offNotes?.();
  closeComposer();
  // The featured note has now been read.
  if (featuredId) updateMessage(featuredId, { seen: true });
  root?.removeEventListener('click', onClick);
  root = null;
}
