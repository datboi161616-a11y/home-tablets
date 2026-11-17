// Family · Message board (Messages.dc.html in the design)
// The newest note is featured on the left; tap an earlier note to feature it.
// "Record a reply" / "+ New note" open a composer (typing or voice dictation,
// optional photo). Posts are saved locally until the shared backend exists.
import { settings } from '../config.js';
import {
  MEMBERS, loadMessages, postMessage, updateMessage, when, shrinkPhoto,
} from '../services/messages-data.js';

let timer, recognizer, root, onClick, featuredId;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const initial = (name) => (name || '?').trim().charAt(0).toUpperCase();
const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;

const HEART = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/></svg>';
const MIC = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
const CAMERA = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>';

const STYLE = `
  <style>
    .msg-btn { min-height:60px; padding:0 28px; border-radius:999px; font-size:19px; font-weight:600; font-family:Inter,sans-serif; display:flex; align-items:center; gap:10px; cursor:pointer; }
    .msg-btn-primary { border:none; background:${settings.accent}; color:#fff; }
    .msg-btn-outline { border:2px solid var(--ink); background:#fff; color:var(--ink); }
    .msg-note { background:#fff; border-radius:20px; padding:18px 20px; display:flex; gap:14px; align-items:flex-start; cursor:pointer; flex:none; }
    .msg-note.active { box-shadow: inset 0 0 0 3px ${settings.accent}; }
    .msg-scroll { overflow-y:auto; scrollbar-width:none; }
    .msg-scroll::-webkit-scrollbar { display:none; }
    .msg-chip { min-height:48px; padding:0 20px; border-radius:999px; border:2px solid var(--line); background:#fff; color:var(--ink); font-size:17px; font-weight:600; font-family:Inter,sans-serif; cursor:pointer; }
    .msg-chip.on { background:var(--ink); border-color:var(--ink); color:#fff; }
    .msg-text { width:100%; height:150px; resize:none; border:2px solid var(--line); border-radius:16px; padding:16px 18px; font:22px/1.35 Inter,sans-serif; color:var(--ink); outline:none; user-select:text; }
    .msg-text:focus { border-color:${settings.accent}; }
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
          <div style="font-size:20px;font-weight:600">${esc(f.who)} · ${esc(f.household)}${f.replyTo ? `<span class="muted" style="font-weight:500"> · reply to ${esc(f.replyTo)}</span>` : ''}</div>
          <div class="muted" style="font-size:16px">${f.seen ? '' : 'New · '}${when(f.at)}</div>
        </div>
      </div>
      ${f.photo ? `
        <div style="flex-grow:1;min-height:0;border-radius:16px;background:#C9CFD6;overflow:hidden">
          <img src="${f.photo}" alt="" style="width:100%;height:100%;object-fit:cover;display:block">
        </div>
        <div class="display" style="font-size:34px;font-weight:500;line-height:1.25;overflow-wrap:anywhere;max-height:128px;overflow:hidden">“${esc(f.text)}”</div>`
      : `
        <div style="flex-grow:1;min-height:0;display:flex;align-items:center;overflow:hidden">
          <div class="display" style="font-size:${f.text.length > 140 ? 34 : 44}px;font-weight:500;line-height:1.25;overflow-wrap:anywhere">“${esc(f.text)}”</div>
        </div>`}
      <div style="display:flex;gap:12px">
        <button data-act="love" class="msg-btn msg-btn-primary">${HEART}${f.loved ? 'Love sent!' : 'Send love'}</button>
        <button data-act="reply" class="msg-btn msg-btn-outline">Record a reply</button>
      </div>` : `
      <div style="flex-grow:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px">
        <div class="display muted" style="font-size:30px">No notes yet</div>
        <button data-act="new" class="msg-btn msg-btn-primary">Write the first one</button>
      </div>`}
    </div>

    <div style="display:flex;flex-direction:column;gap:16px;min-height:0;min-width:0">
      <div style="display:flex;align-items:center;justify-content:space-between;min-height:44px">
        <div class="eyebrow muted">Earlier</div>
        <button data-act="new" class="pill" style="border:none;background:#fff;color:var(--ink);font-family:Inter,sans-serif;cursor:pointer">+ New note</button>
      </div>
      <div class="msg-scroll" style="display:flex;flex-direction:column;gap:16px;min-height:0;flex-grow:1">
        ${earlier.map((n) => `
          <div class="msg-note" data-id="${esc(n.id)}">
            <div style="width:44px;height:44px;flex-shrink:0;border-radius:50%;background:var(--ink);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:600">${initial(n.who)}</div>
            <div style="display:flex;flex-direction:column;gap:4px;min-width:0">
              <div class="muted" style="font-size:15px">${esc(n.who)} · ${when(n.at)}${n.loved ? ` · <span style="color:${settings.accent}">♥</span>` : ''}</div>
              <div style="font-size:18px;line-height:1.35;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden">${n.photo ? 'Photo · ' : ''}${esc(n.text)}</div>
            </div>
          </div>`).join('')}
      </div>
    </div>`;
}

// ---------- Composer ----------
function openComposer(replyTo) {
  const who = localStorage.getItem('messages.lastWho') || MEMBERS[0];
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
          ${MEMBERS.map((m) => `<button data-who="${esc(m)}" class="msg-chip${m === who ? ' on' : ''}">${esc(m)}</button>`).join('')}
        </div>
      </div>
      <textarea data-c="text" class="msg-text" maxlength="400" placeholder="${Speech ? 'Tap Speak, or type your note…' : 'Type your note…'}"></textarea>
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
  const sync = () => {
    const ok = text.value.trim().length > 0 || photo;
    postBtn.disabled = !ok;
    postBtn.style.opacity = ok ? 1 : 0.45;
  };
  sync();
  text.addEventListener('input', sync);

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
    recognizer.onerror = stopSpeech;
    try { recognizer.start(); } catch { return stopSpeech(); }
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
  el.innerHTML = `${STYLE}
  <div style="height:100%;padding:40px;display:flex;flex-direction:column;gap:24px">
    <div style="display:flex;align-items:center;justify-content:space-between">
      <div style="display:flex;align-items:center;gap:16px">
        <a href="#/launcher" class="pill" style="background:#fff">← Menu</a>
        <div class="display" style="font-size:40px;font-weight:500">Family board</div>
      </div>
      <div class="muted" style="font-size:17px">Notes from every screen in the family</div>
    </div>
    <div data-board style="flex-grow:1;display:grid;grid-template-columns:1.4fr 1fr;gap:24px;min-height:0"></div>
  </div>
  <div data-composer style="position:absolute;top:0;right:0;bottom:0;left:0;background:rgba(29,36,48,.45);display:none;align-items:center;justify-content:center;z-index:10"></div>`;

  renderBoard();

  onClick = (e) => {
    if (e.target.closest('[data-composer]')) return;
    const note = e.target.closest('.msg-note');
    if (note) {
      featuredId = note.dataset.id;
      return renderBoard();
    }
    const act = e.target.closest('[data-act]')?.dataset.act;
    const f = loadMessages().find((m) => m.id === featuredId);
    if (act === 'love' && f && !f.loved) {
      // TODO(backend): notify the sender that love was sent.
      updateMessage(f.id, { loved: true });
      renderBoard();
    } else if (act === 'reply' && f) {
      openComposer(f.who);
    } else if (act === 'new') {
      openComposer(null);
    }
  };
  el.addEventListener('click', onClick);

  // Keep "20 min ago" style times fresh.
  timer = setInterval(() => { if (el.isConnected) renderBoard(); }, 60000);
}

export function unmount() {
  clearInterval(timer);
  closeComposer();
  // The featured note has now been read.
  if (featuredId) updateMessage(featuredId, { seen: true });
  root?.removeEventListener('click', onClick);
  root = null;
}
