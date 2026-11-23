// The household's note board (board KP12 "Reactions" in the redesign).
// One note is shown big on the left, with four big buttons under it: Love it, I'll do it,
// Thank you, Reply. A reaction is by a person, and its symbol floats up off the note.
// Pin, done and take down sit behind "•••" on the note.
// "Seen by" is only what the screen really knows: who reacted, who replied, and who tapped
// their own name to say they have read it. Every note on the board is listed on the right
// (tap one, or swipe the big note, to read another), with a phone code under the list so
// somebody can leave a note from their phone.
// Notes are kept on this screen; nothing is shared with any other screen.
import { householdName } from '../services/family.js';
import {
  members, noMembers, loadMessages, postMessage, updateMessage, deleteMessage, canDelete, when, fullWhen,
  shrinkPhoto, onMessagesChanged, isOld, emojiOnly, loadDraft, saveDraft, MAXLEN, QUICK_NOTES, REACTIONS,
} from '../services/messages-data.js';
import { esc, topBar, phoneCode, wirePhoneCodes, people, avatar } from './ui.js';

let timer, recognizer, root, onClick, featuredId, offNotes, stopCodes;
let undo = null;          // { id, timer }: a note just taken down, still on its way out
let toastTimer;
let showOld = false;      // the "older notes" drawer is open
let lookedAt = new Set(); // notes a person has had in front of them on this visit
let actor = null;         // { name, until }: who tapped last, remembered for a minute
let actorTimer;
let order = [];           // the ids in the list, top to bottom (for swiping)
let mode = '';            // 'empty' | 'board': which phone code is on the screen
let floatTimers = [];
let reveal = false;       // the next drawing scrolls the list to the note on show
let touch = null, onTouchStart, onTouchEnd;

const INK = '#2D2140', SOFT = '#6B5D7A', RED = '#E2445C', GREEN = '#4C9A5E', GOLD = '#F2B23A', BLUE = '#5B7DD8';
const ACTOR_MS = 60000;
const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const same = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
// "Alex", "Alex and Jordan", "Alex, Jordan and Sam"
const nameList = (list) => (list.length < 2 ? list.join('') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`);
// Long notes start smaller; fitFeatured() then shrinks further until the note fits.
const fitSize = (len) => (len <= 40 ? 64 : len <= 80 ? 54 : len <= 140 ? 44 : len <= 220 ? 36 : len <= 320 ? 30 : 26);

// The reactions' own symbols (the board's): a heart, a tick, a star, and a speech bubble for Reply.
const SYM = {
  love: (s, c = RED) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21C5 15 2 12 2 8a5 5 0 0 1 10-1 5 5 0 0 1 10 1c0 4-3 7-10 13z" fill="${c}"/></svg>`,
  doing: (s, c = GREEN) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="${c}"/><path d="M7 12.500l3.200 3.200L17 9" stroke="#FFFFFF" stroke-width="2.600" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  thanks: (s, c = GOLD) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l2.900 6.600 7.100.600-5.400 4.700 1.600 7-6.200-3.700-6.200 3.700 1.600-7-5.400-4.700 7.100-.600z" fill="${c}"/></svg>`,
  reply: (s, c = BLUE) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H10l-5 4v-4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" fill="${c}"/></svg>`,
};
const FLOAT_COLORS = { love: [RED, '#F28BA0'], doing: [GREEN, '#7CBF8B'], thanks: [GOLD, '#F6CE7A'] };
const MIC = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
const CAMERA = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.500"/></svg>';
const TICK = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.500" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.500l4.500 4.500L19 7.500"/></svg>';
const PIN = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 3h6l-1 6 4 4H6l4-4zM12 13v8"/></svg>';

const STYLE = `
  <style>
    .mb { position:relative; height:100%; box-sizing:border-box; padding:32px 40px; display:flex; flex-direction:column; gap:20px; overflow:hidden;
      color:${INK}; font-family:Inter,system-ui,sans-serif; background:radial-gradient(circle at 35% 45%, #FFF3E8 0%, #FBE3D3 55%, #F4CDBE 100%); }
    .mb .x-title { color:${INK}; }
    .mb-red { background:${RED} !important; color:#fff !important; }
    .mb-main { flex:1; min-height:0; display:grid; grid-template-columns:minmax(0,1fr) 424px; grid-gap:28px; }
    .mb-left { display:flex; flex-direction:column; gap:14px; min-height:0; min-width:0; position:relative; }
    .mb-side { display:flex; flex-direction:column; gap:12px; min-height:0; min-width:0; }
    .mb-note { flex:1; min-height:0; border-radius:36px; background:#fff; box-shadow:0 22px 44px rgba(120,60,50,.16); padding:26px 34px 22px; display:flex; flex-direction:column; gap:14px; position:relative; }
    .mb-head { display:flex; align-items:center; gap:14px; flex:none; }
    .mb-name { font:600 22px Inter,sans-serif; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .mb-soft { color:${SOFT}; }
    .mb-pill { min-height:56px; padding:0 18px; border-radius:28px; border:0; background:#F7ECE5; color:${INK}; font:600 17px Inter,sans-serif; display:inline-flex; align-items:center; justify-content:center; gap:8px; cursor:pointer; flex:none; }
    .mb-pill.white { background:#fff; }
    .mb-more { min-width:56px; padding:0; font-size:24px; letter-spacing:2px; }
    .mb-pill.armed { background:#B3261E; color:#fff; }
    .mb-body { position:relative; flex:1; min-height:0; display:flex; align-items:center; overflow:hidden; }
    .mb-words { white-space:pre-line; overflow-wrap:anywhere; word-break:break-word; }
    .mb-big { font-family:Outfit,system-ui,sans-serif; font-weight:500; line-height:1.1; }
    .mb-foot { display:flex; align-items:flex-end; gap:12px; flex:none; min-height:56px; }
    .mb-chips { display:flex; flex-wrap:wrap; gap:8px; flex:1; min-width:0; }
    .mb-chip { min-height:46px; padding:0 16px 0 10px; border-radius:23px; display:inline-flex; align-items:center; gap:8px; font:600 17px Inter,sans-serif; max-width:100%; }
    .mb-chip span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .mb-chip.love { background:#FFE9EC; } .mb-chip.doing { background:#EAF4E6; } .mb-chip.thanks { background:#FFF4DC; } .mb-chip.done { background:${GREEN}; color:#fff; padding-left:14px; }
    .mb-seen { flex:none; text-align:right; }
    .mb-seen-row { display:flex; justify-content:flex-end; gap:6px; margin-top:4px; }
    .mb-saw { min-height:56px; min-width:56px; padding:0; border:0; background:transparent; color:${SOFT}; border-radius:28px; display:inline-flex; align-items:center; gap:8px; cursor:pointer; font:600 17px Inter,sans-serif; }
    .mb-saw.named { padding:0 16px 0 6px; background:#F7ECE5; }
    .mb-saw.on { color:${INK}; }
    .mb-saw.named.on { background:#EAF4E6; }
    .mb-dot { width:44px; height:44px; border-radius:22px; flex:none; display:inline-flex; align-items:center; justify-content:center; font:600 19px Outfit,sans-serif; box-sizing:border-box; border:2px dashed rgba(45,33,64,.4); color:${SOFT}; margin:0 auto; }
    .mb-bar { display:flex; gap:12px; flex:none; }
    .mb-react { flex:1; min-width:0; min-height:84px; border-radius:24px; border:0; background:#fff; color:${INK}; font:700 18px Inter,sans-serif; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px; cursor:pointer; }
    .mb-react.love { background:${RED}; color:#fff; }
    .mb-react.love.on { background:#B92F47; }
    .mb-react.doing.on { box-shadow:inset 0 0 0 4px ${GREEN}; }
    .mb-react.thanks.on { box-shadow:inset 0 0 0 4px ${GOLD}; }
    .mb-strip { display:flex; align-items:center; gap:16px; flex:none; min-height:56px; }
.mb-toasting .mb-strip { opacity:0; }
    .mb-list { position:relative; flex:1; min-height:0; overflow-y:auto; scrollbar-width:none; display:flex; flex-direction:column; gap:12px; }
    .mb-list::-webkit-scrollbar, .mb-scroll::-webkit-scrollbar { display:none; }
    .mb-scroll { overflow-y:auto; scrollbar-width:none; min-height:0; }
    .mb-card { flex:none; padding:16px 20px; border-radius:24px; background:rgba(255,255,255,.75); cursor:pointer; min-height:80px; box-sizing:border-box; }
    .mb-card.active { background:#fff; box-shadow:inset 0 0 0 3px ${RED}; }
    .mb-card.done .mb-card-text { opacity:.55; }
    .mb-card-text { font:500 24px/1.15 Outfit,sans-serif; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
    .mb-card-foot { display:flex; justify-content:space-between; align-items:center; gap:8px; margin-top:8px; font-size:15px; color:${SOFT}; }
    .mb-card-foot > span:first-child { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0; }
    .mb-tag { flex:none; padding:3px 11px; border-radius:999px; font:700 15px Inter,sans-serif; white-space:nowrap; max-width:170px; overflow:hidden; text-overflow:ellipsis; }
    .mb-tag.done { background:#EAF4E6; color:#2F6B3E; }
    .mb-tag.new { background:${RED}; color:#fff; margin-right:6px; }
    .mb-pinned { color:${GOLD}; vertical-align:-4px; margin-right:4px; }
    .mb-floats { position:absolute; top:0; right:0; bottom:0; left:0; pointer-events:none; overflow:hidden; }
    .mb-float { position:absolute; opacity:0; pointer-events:none; animation:mbFloat 3s ease-out both; }
    .mb-deco { position:absolute; pointer-events:none; }
    .mb [data-code] .x-code.column { width:100%; box-sizing:border-box; }
    .mb-empty { flex:1; min-height:0; border-radius:36px; background:#fff; box-shadow:0 22px 44px rgba(120,60,50,.16); padding:40px 48px; display:flex; flex-direction:column; justify-content:center; gap:22px; position:relative; overflow:hidden; }
    .mb-over { position:absolute; top:0; right:0; bottom:0; left:0; background:rgba(45,33,64,.5); display:none; align-items:center; justify-content:center; z-index:10; }
    .mb-sheet { background:#FFF8F2; color:${INK}; border-radius:32px; box-shadow:0 20px 60px rgba(45,33,64,.3); display:flex; flex-direction:column; gap:16px; }
    .mb-h { font:500 32px Outfit,sans-serif; }
    .mb-opt { min-height:56px; padding:0 22px; border-radius:28px; border:2px solid rgba(45,33,64,.16); background:#fff; color:${INK}; font:600 18px Inter,sans-serif; cursor:pointer; }
    .mb-opt.on { background:${INK}; border-color:${INK}; color:#fff; }
    .mb-opt.quick { background:#FFF4DC; border-color:#F0DFA8; }
    .mb-person { min-height:104px; flex:1 1 40%; border-radius:28px; border:0; background:#fff; color:${INK}; font:500 30px Outfit,sans-serif; display:flex; align-items:center; justify-content:center; gap:16px; cursor:pointer; box-shadow:inset 0 0 0 2px rgba(45,33,64,.12); min-width:0; }
    .mb-person span:last-child { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .mb-text { width:100%; height:130px; flex:none; resize:none; box-sizing:border-box; border:2px solid rgba(45,33,64,.18); border-radius:18px; padding:14px 18px; font:22px/1.35 Inter,sans-serif; color:${INK}; background:#fff; outline:none; user-select:text; -webkit-user-select:text; }
    .mb-text:focus { border-color:${RED}; }
    .mb-listening { animation:mbPulse 1.200s steps(2, jump-none) infinite; }
    .mb-toast { position:absolute; left:40px; bottom:32px; width:748px; box-sizing:border-box; display:none; align-items:center; justify-content:space-between; gap:18px; background:${INK}; color:#fff; border-radius:999px; min-height:56px; padding:0 28px; font:600 19px Inter,sans-serif; z-index:9; box-shadow:0 10px 30px rgba(45,33,64,.3); }
    @keyframes mbFloat { 0% { transform:translate3d(0,0,0) scale(.6); opacity:0; } 15% { opacity:1; transform:translate3d(0,-40px,0) scale(1.1); } 100% { transform:translate3d(var(--dx,0),-340px,0) scale(.9); opacity:0; } }
    @keyframes mbPulse { 50% { opacity:.55; } }
    @media (prefers-reduced-motion: reduce) {
      .mb-float, .mb-listening { animation:none !important; }
      .mb-float { display:none; }
    }
  </style>`;

// The notes on the board right now (a note just taken down is already off it).
const visible = () => loadMessages().filter((m) => !undo || m.id !== undo.id);

// ---------- Who is tapping ----------
// The screen can't see who is standing at it. With no names set, a reaction is just
// "somebody's" (''); with one name, it is theirs; with more, the person says who they are
// once (big name buttons) and the screen remembers for a minute.
function currentActor() {
  const ppl = people();
  if (!ppl.length) return '';
  if (ppl.length === 1) return ppl[0].name;
  if (actor && actor.until > Date.now() && ppl.some((p) => same(p.name, actor.name))) return actor.name;
  return null;
}
function setActor(name) {
  if (people().length < 2) return;
  actor = { name, until: Date.now() + ACTOR_MS };
  clearTimeout(actorTimer);
  actorTimer = setTimeout(() => { actor = null; if (root) renderBoard(); }, ACTOR_MS + 50);
}
function withActor(title, then) {
  const who = currentActor();
  if (who !== null) { if (who) setActor(who); return then(who); }
  const ppl = people();
  overlay(`
    <div class="mb-sheet" style="width:${ppl.length > 2 ? 820 : 720}px;padding:36px">
      <div style="display:flex;align-items:center;gap:16px">
        <div class="mb-h" style="flex:1">${esc(title)}</div>
        <button data-w="close" class="mb-pill white">Cancel</button>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:14px">
        ${ppl.map((p, i) => `<button data-w="${i}" class="mb-person">${avatar(p.name, 60)}<span>${esc(p.name)}</span></button>`).join('')}
      </div>
    </div>`, (e) => {
    const w = e.target.closest('[data-w]');
    if (e.target === e.currentTarget || (w && w.dataset.w === 'close')) return closeComposer();
    if (!w) return;
    const p = ppl[+w.dataset.w];
    closeComposer();
    if (!p) return;
    setActor(p.name);
    then(p.name);
  });
}

// ---------- "Seen by": only what the screen really knows ----------
// Who a note is waiting for: the person it is for, or everyone named in Settings but its
// writer. Somebody has seen it when they reacted to it, replied to it, or tapped their
// own name on it. null when there is nobody to wait for (no names set, or a household of one).
function seenInfo(m) {
  const ppl = people();
  if (!ppl.length) return null;
  let audience = ppl.filter((p) => !same(p.name, m.who));
  if (m.for && !same(m.for, m.who) && ppl.some((p) => same(p.name, m.for))) audience = ppl.filter((p) => same(p.name, m.for));
  if (!audience.length) return null;
  const known = m.seenBy.concat(...REACTIONS.map((r) => m.reactions[r.key]));
  return audience.map((p) => Object.assign({}, p, { seen: known.some((n) => same(n, p.name)) }));
}

// ---------- The words on a note's reactions ----------
function chips(m) {
  const named = (k) => m.reactions[k].filter(Boolean);
  const out = [];
  const love = named('love'), doing = named('doing'), thanks = named('thanks');
  if (love.length || m.loved) out.push(`<div class="mb-chip love">${SYM.love(26)}<span>${love.length ? esc(love.join(', ')) : 'Loved'}</span></div>`);
  if (m.reactions.doing.length) out.push(`<div class="mb-chip doing">${SYM.doing(26)}<span>${doing.length ? `${esc(nameList(doing))} will do it` : 'Somebody’s on it'}</span></div>`);
  if (m.reactions.thanks.length) out.push(`<div class="mb-chip thanks">${SYM.thanks(26)}<span>${thanks.length ? `Thanks from ${esc(nameList(thanks))}` : 'Thanked'}</span></div>`);
  if (m.done) out.push(`<div class="mb-chip done">${TICK}<span>Done</span></div>`);
  return out.join('');
}
// The list only marks a note that is done (its reactions are on the big note).
const tag = (m) => (m.done ? '<span class="mb-tag done">✓ Done</span>' : '');
const forLine = (m) => (m.for ? ` · for ${esc(m.for)}` : m.replyTo ? ` · reply to ${esc(m.replyTo)}` : '');

// ---------- Board ----------
function renderBoard() {
  if (!root) return;
  const now = Date.now();
  const all = visible();
  if (!all.some((m) => m.id === featuredId)) featuredId = all[0] ? all[0].id : undefined;
  const f = all.find((m) => m.id === featuredId);
  // Pinned notes stay at the top of the list; old read notes are tucked away at the bottom.
  const fresh = all.filter((m) => !isOld(m, now) || m.id === featuredId).sort((a, b) => (b.pinned - a.pinned) || (b.at - a.at));
  const old = all.filter((m) => isOld(m, now) && m.id !== featuredId);
  const tidyable = all.filter((m) => m.seen && !m.pinned).length;
  const deletable = canDelete();
  order = fresh.concat(showOld ? old : []).map((m) => m.id);

  const left = root.querySelector('[data-left]');
  const side = root.querySelector('[data-side]');
  const codeBox = root.querySelector('[data-code]');
  const newMode = f ? 'board' : 'empty';
  if (newMode !== mode) {
    mode = newMode;
    // (The code is only drawn again when the board goes from empty to not: drawing one is slow.)
    // (No "how to scan" words: the sub line only speaks up when there is no Wi-Fi.)
    codeBox.innerHTML = f
      ? phoneCode({ tab: 'note', size: 92, tone: 'light', title: 'Note from your phone', sub: '​' })
      : phoneCode({ tab: 'note', size: 210, tone: 'light', column: true, title: 'Note from your phone', sub: '​' });
    codeBox.style.cssText = f ? 'flex:none' : 'flex:1;display:flex;align-items:center;justify-content:center';
    if (stopCodes) stopCodes();
    stopCodes = wirePhoneCodes(root);
  }
  side.style.display = f ? '' : 'none';
  // The empty board has its own big "Write a note": the top bar's would be a second one.
  const topNew = root.querySelector('[data-top-new]');
  if (topNew) topNew.style.visibility = f ? '' : 'hidden';

  if (!f) {
    left.innerHTML = `
      <div class="mb-empty">
        <div class="mb-big" style="font-size:60px">Leave the first note</div>
        <div><button data-act="new" class="x-btn lg mb-red">Write a note</button></div>
        <div class="mb-deco" style="right:120px;bottom:120px">${SYM.love(54)}</div>
        <div class="mb-deco" style="right:60px;bottom:180px">${SYM.thanks(44)}</div>
      </div>`;
    return;
  }

  // ---- the big note ----
  const big = !f.photo && emojiOnly(f.text);
  const seen = seenInfo(f);
  const me = currentActor();
  const mine = (k) => me !== null && f.reactions[k].some((n) => same(n, me));

  let seenHtml = '';
  if (seen) {
    const namedRow = seen.length <= 2;
    seenHtml = `<div class="mb-seen">
      <div class="x-eyebrow mb-soft" style="font-size:15px;letter-spacing:1.5px">Seen by</div>
      <div class="mb-seen-row">${seen.map((p) => `<button data-saw="${esc(p.name)}" class="mb-saw${namedRow ? ' named' : ''}${p.seen ? ' on' : ''}" aria-label="${esc(p.name)} ${p.seen ? 'has seen it' : 'has not seen it yet'}">${p.seen ? avatar(p.name, 44) : `<span class="mb-dot">${esc(p.initial)}</span>`}${namedRow ? `<span style="max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.name)}${p.seen ? ' ✓' : '?'}</span>` : ''}</button>`).join('')}</div>
    </div>`;
  }

  let strip = '';
  if (actor && me !== null && people().length > 1) strip += `<button data-act="who" class="mb-pill white">${avatar(me, 36)}<span>${esc(me)} · not you?</span></button>`;

  left.innerHTML = `
    <div class="mb-note" data-note>
      <div class="mb-head">
        ${avatar(f.who, 58)}
        <div style="min-width:0;flex:1">
          <div class="mb-name">${esc(f.who)}<span class="mb-soft" style="font-weight:500">${forLine(f)}</span></div>
          <div class="mb-soft" style="font-size:16px">${f.pinned ? `<span class="mb-pinned">${PIN}</span>` : ''}${when(f.at)}</div>
        </div>
        <button data-act="more" class="mb-pill mb-more" aria-label="More">•••</button>
      </div>
      ${f.photo ? `
        <div style="flex:1;min-height:0;border-radius:20px;background:#E9D9CF;overflow:hidden">
          <img src="${esc(f.photo)}" alt="" style="width:100%;height:100%;object-fit:cover;display:block">
        </div>
        ${f.text ? `<div data-fbox style="position:relative;flex:none"><div data-ftext class="mb-big mb-words" style="font-size:${f.text.length > 120 ? 26 : 34}px;line-height:1.2;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(f.text)}</div></div>` : ''}`
      : `
        <div data-fbox="fit" class="mb-body"${big ? ' style="justify-content:center"' : ''}>
          ${big
            ? `<div data-ftext style="font-size:140px;line-height:1.1;text-align:center">${esc(f.text.trim())}</div>`
            : `<div data-ftext class="mb-big mb-words" style="font-size:${fitSize((f.text || '').length)}px">${esc(f.text)}</div>`}
        </div>`}
      <div class="mb-foot">
        <div class="mb-chips">${chips(f)}</div>
        ${seenHtml}
      </div>
    </div>
    <div class="mb-bar">
      <button data-react="love" class="mb-react love${mine('love') ? ' on' : ''}">${SYM.love(30, '#FFFFFF')}${mine('love') ? 'Loved ✓' : 'Love it'}</button>
      <button data-react="doing" class="mb-react doing${mine('doing') ? ' on' : ''}">${SYM.doing(30)}${mine('doing') ? 'I’ll do it ✓' : 'I’ll do it'}</button>
      <button data-react="thanks" class="mb-react thanks${mine('thanks') ? ' on' : ''}">${SYM.thanks(30)}${mine('thanks') ? 'Thanked ✓' : 'Thank you'}</button>
      <button data-act="reply" class="mb-react">${SYM.reply(30)}Reply</button>
    </div>
    <div class="mb-strip">${strip}</div>`;

  // ---- every note on the board ----
  const listWas = side.querySelector('[data-list]');
  const keepScroll = listWas ? listWas.scrollTop : 0; // re-drawing the list must not jump it back to the top
  const card = (n) => `
    <div class="mb-card${n.id === featuredId ? ' active' : ''}${n.done ? ' done' : ''}" data-id="${esc(n.id)}">
      <div class="mb-card-text mb-words"${!n.photo && emojiOnly(n.text) ? ' style="font-size:38px"' : ''}>${n.photo ? (n.text ? 'Photo · ' : 'Photo') : ''}${esc(n.text)}</div>
      <div class="mb-card-foot"><span>${n.seen || n.id === featuredId ? '' : '<span class="mb-tag new">NEW</span>'}${n.pinned ? `<span class="mb-pinned">${PIN}</span>` : ''}${esc(n.who)} · ${when(n.at)}</span>${tag(n)}</div>
    </div>`;
  side.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;min-height:56px;flex:none">
      <div class="x-eyebrow mb-soft" style="margin:0 auto 0 4px">On the board</div>
      ${deletable && tidyable >= 2 ? '<button data-act="tidy" class="mb-pill white">Tidy up</button>' : ''}
    </div>
    <div data-list class="mb-list">
      ${fresh.map(card).join('')}
      ${old.length ? `
        <button data-act="old" class="mb-pill" style="align-self:flex-start;background:transparent;box-shadow:inset 0 0 0 2px rgba(45,33,64,.2)">${showOld ? 'Hide older notes' : `Show ${plural(old.length, 'older note', 'older notes')}`}</button>
        ${showOld ? old.map(card).join('') : ''}` : ''}
    </div>`;
  const list = side.querySelector('[data-list]');
  if (list && keepScroll) list.scrollTop = keepScroll;
  const on = list && list.querySelector('.mb-card.active');
  if (reveal && on && (on.offsetTop < list.scrollTop || on.offsetTop + on.offsetHeight > list.scrollTop + list.clientHeight)) list.scrollTop = Math.max(0, on.offsetTop - 12);
  reveal = false;
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
    while (txt.offsetHeight > box.clientHeight + 1 && size > 24) {
      size -= 2;
      txt.style.fontSize = `${size}px`;
    }
    clipped = txt.offsetHeight > box.clientHeight + 1;
    if (clipped) { box.style.alignItems = 'flex-start'; }
  } else {
    clipped = txt.scrollHeight > txt.clientHeight + 1;
  }
  if (clipped && !box.querySelector('[data-act="read"]')) {
    box.insertAdjacentHTML('beforeend', '<button data-act="read" class="mb-pill" style="position:absolute;right:0;bottom:0;box-shadow:-20px 0 16px #fff, 0 2px 10px rgba(45,33,64,.18)">Read all</button>');
  }
}

// ---------- The reaction's own symbol floating up off the note ----------
function spawnFloats(kind) {
  const layer = root && root.querySelector('[data-floats]');
  if (!layer || !SYM[kind]) return;
  const N = 10; // a dozen at most; only transform and opacity move
  let html = '';
  for (let i = 0; i < N; i++) {
    const size = 30 + Math.round(Math.random() * 30);
    const leftPx = 70 + Math.round((i + Math.random() * 0.8) * (640 / N));
    const dx = Math.round((Math.random() - 0.5) * 120);
    html += `<div class="mb-float" style="left:${leftPx}px;top:${540 + Math.round(Math.random() * 50)}px;--dx:${dx}px;animation-duration:${(2.2 + Math.random() * 1.2).toFixed(2)}s;animation-delay:${(Math.random() * 0.5).toFixed(2)}s">${SYM[kind](size, FLOAT_COLORS[kind][i % 2])}</div>`;
  }
  const group = document.createElement('div');
  group.innerHTML = html;
  layer.appendChild(group);
  floatTimers.push(setTimeout(() => { group.remove(); }, 4200));
}

function react(kind) {
  const f = visible().find((m) => m.id === featuredId);
  if (!f) return;
  withActor('Who’s tapping?', (who) => {
    const had = f.reactions[kind].some((n) => same(n, who));
    updateMessage(f.id, { react: { kind, who, on: !had } });
    renderBoard();
    if (!had) spawnFloats(kind);
  });
}

// Tapping a name in "Seen by": that person says they have read the note (or takes it back).
function tapSeen(name) {
  const f = visible().find((m) => m.id === featuredId);
  if (!f) return;
  const explicit = f.seenBy.some((n) => same(n, name));
  const reacted = REACTIONS.some((r) => f.reactions[r.key].some((n) => same(n, name)));
  if (reacted && !explicit) return toast(`${name} already answered it`);
  updateMessage(f.id, { sawBy: { who: name, on: !explicit } });
  if (!explicit) setActor(name);
  renderBoard();
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

// ---------- Overlays: who is tapping, reading a note in full, tidying up ----------
function overlay(html, onTap) {
  const box = root.querySelector('[data-composer]');
  box.style.display = 'flex';
  box.innerHTML = html;
  box.onclick = onTap;
  return box;
}

function openReader(m) {
  overlay(`
    <div class="mb-sheet" style="width:900px;max-height:700px;padding:32px 36px">
      <div style="display:flex;align-items:center;gap:14px;flex:none">
        ${avatar(m.who, 58)}
        <div style="min-width:0;flex:1">
          <div class="mb-name">${esc(m.who)}${m.for ? `<span class="mb-soft" style="font-weight:500"> · for ${esc(m.for)}</span>` : ''}</div>
          <div class="mb-soft" style="font-size:16px">${fullWhen(m.at)}</div>
        </div>
        <button data-r="close" class="mb-pill white">Close</button>
      </div>
      <div class="mb-scroll" style="display:flex;flex-direction:column;gap:18px">
        ${m.photo ? `<img src="${esc(m.photo)}" alt="" style="width:100%;height:360px;object-fit:contain;border-radius:16px;background:#F3E7DF;flex:none">` : ''}
        ${m.text ? `<div class="mb-big mb-words" style="font-size:30px;line-height:1.3;flex:none">${esc(m.text)}</div>` : ''}
      </div>
    </div>`, (e) => {
    if (e.target === e.currentTarget || e.target.closest('[data-r="close"]')) closeComposer();
  });
}

// "•••" on the big note: the rarely used things, out of the way.
function openMore(f) {
  overlay(`
    <div class="mb-sheet" style="width:520px;padding:32px">
      <button data-m="pin" class="mb-opt" style="display:flex;align-items:center;gap:10px">${PIN}${f.pinned ? 'Unpin' : 'Pin to the top'}</button>
      <button data-m="done" class="mb-opt" style="display:flex;align-items:center;gap:10px">${TICK}${f.done ? 'Not done' : 'Mark done'}</button>
      ${canDelete() ? '<button data-m="remove" class="mb-opt" style="color:#B3261E">Take down</button>' : ''}
      <button data-m="close" class="mb-pill white" style="align-self:flex-end">Cancel</button>
    </div>`, (e) => {
    const b = e.target.closest('[data-m]');
    const m = b ? b.dataset.m : '';
    if (e.target === e.currentTarget || m === 'close') return closeComposer();
    if (!m) return;
    closeComposer();
    if (m === 'remove') removeNote(f.id);
    else if (m === 'pin') { updateMessage(f.id, { pinned: !f.pinned }); reveal = true; renderBoard(); }
    else if (m === 'done') { updateMessage(f.id, { done: !f.done }); renderBoard(); }
  });
}

function openTidy() {
  const gone = visible().filter((m) => m.seen && !m.pinned);
  if (!gone.length) return;
  overlay(`
    <div class="mb-sheet" style="width:660px;padding:36px">
      <div class="mb-h">Take down ${plural(gone.length, 'read note', 'read notes')}?</div>
      <div style="font-size:19px;line-height:1.4">New and pinned notes stay. This can’t be undone.</div>
      <div style="display:flex;gap:12px;justify-content:flex-end;margin-top:8px">
        <button data-t="keep" class="x-btn line">Keep them</button>
        <button data-t="go" class="x-btn" style="background:#B3261E;color:#fff">Take them down</button>
      </div>
    </div>`, (e) => {
    const b = e.target.closest('[data-t]');
    const t = b ? b.dataset.t : '';
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
function toast(text, withUndo = false) {
  const t = root && root.querySelector('[data-toast]');
  if (!t) return;
  clearTimeout(toastTimer);
  t.innerHTML = `<span>${esc(text)}</span>${withUndo ? '<button data-act="undo" class="mb-pill white" style="min-height:48px">Undo</button>' : ''}`;
  t.style.paddingRight = withUndo ? '6px' : '28px';
  t.style.display = 'flex';
  t.parentNode.classList.add('mb-toasting'); // the line under the buttons steps aside
  toastTimer = setTimeout(hideToast, withUndo ? 8000 : 3200);
}

function hideToast() {
  clearTimeout(toastTimer);
  const t = root && root.querySelector('[data-toast]');
  if (!t) return;
  t.style.display = 'none';
  t.parentNode.classList.remove('mb-toasting');
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
// replyNote: the note being answered (or null for a new note). startText: a ready-made note to begin with.
function openComposer(replyNote, startText) {
  const replyTo = replyNote ? replyNote.who : null;
  const names = members();
  const draft = loadDraft();
  const restored = draft && (draft.replyTo || null) === (replyTo || null) ? draft : null;
  let saved = null;
  try { saved = localStorage.getItem('messages.lastWho'); } catch { saved = null; }
  const tapping = currentActor();
  let current = restored && names.includes(restored.who) ? restored.who
    : tapping && names.includes(tapping) ? tapping
      : names.includes(saved) ? saved : names[0];
  // Nobody answers their own note: with nothing else to go on, the reply is from somebody else.
  if (replyTo && !restored && !tapping && same(current, replyTo)) current = names.find((n) => !same(n, replyTo)) || current;
  let forWho = restored ? (restored.forWho || null) : (replyTo && names.includes(replyTo) ? replyTo : null);
  if (forWho && !names.includes(forWho)) forWho = null;
  let photo = null;
  const box = root.querySelector('[data-composer]');
  box.style.display = 'flex';
  box.innerHTML = `
    <div class="mb-sheet mb-scroll" style="width:880px;max-height:776px;padding:26px 32px;box-sizing:border-box">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex:none">
        <div class="mb-h" style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${replyTo ? `Reply to ${esc(replyTo)}` : 'New note'}</div>
        <button data-c="cancel" class="mb-pill white">Cancel</button>
      </div>
      <textarea data-c="text" class="mb-text" maxlength="${MAXLEN}" placeholder="Write a note…"></textarea>
      <div style="display:flex;align-items:center;gap:12px;flex:none">
        ${Speech ? `<button data-c="speak" class="x-btn line">${MIC}<span>Speak</span></button>` : ''}
        ${window.TabletNative ? '' : `<label class="x-btn line" style="position:relative">${CAMERA}<span data-c="photo-label">Add photo</span>
          <input data-c="file" type="file" accept="image/*" style="position:absolute;top:0;right:0;bottom:0;left:0;opacity:0;cursor:pointer">
        </label>`}
        <div data-c="thumb" style="width:60px;height:60px;flex:none;border-radius:12px;background:center/cover #E9D9CF;display:none"></div>
        <div data-c="hint" class="mb-soft" style="font-size:16px;flex:1;min-width:0"></div>
        <button data-c="post" class="x-btn mb-red" style="min-width:150px" disabled>Post</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;flex:none">
        <div class="x-eyebrow mb-soft">Ready-made notes</div>
        <div style="display:flex;flex-wrap:wrap;gap:10px">
          ${QUICK_NOTES.map((q) => `<button data-quick="${esc(q)}" class="mb-opt quick">${esc(q)}</button>`).join('')}
        </div>
      </div>
      ${names.length > 1 ? `
      <div style="display:flex;flex-direction:column;gap:8px;flex:none">
        <div class="x-eyebrow mb-soft">From</div>
        <div style="display:flex;flex-wrap:wrap;gap:10px">
          ${names.map((m) => `<button data-who="${esc(m)}" class="mb-opt${m === current ? ' on' : ''}">${esc(m)}</button>`).join('')}
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;flex:none">
        <div class="x-eyebrow mb-soft">For</div>
        <div style="display:flex;flex-wrap:wrap;gap:10px">
          <button data-for="" class="mb-opt${forWho ? '' : ' on'}">Everyone</button>
          ${names.map((m) => `<button data-for="${esc(m)}" class="mb-opt${m === forWho ? ' on' : ''}">${esc(m)}</button>`).join('')}
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
  else if (startText) text.value = String(startText).slice(0, MAXLEN);

  const keep = () => saveDraft({ text: text.value, who: current, forWho, replyTo: replyTo || null });
  const disarm = () => {
    cancelArmed = false; clearTimeout(cancelTimer);
    cancelBtn.classList.remove('armed'); cancelBtn.textContent = 'Cancel';
  };
  const sync = () => {
    const ok = text.value.trim().length > 0 || photo;
    postBtn.disabled = !ok;
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
    const file = e.target.files && e.target.files[0];
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
    if (recognizer) recognizer.stop();
    recognizer = null;
    const b = $('[data-c="speak"]');
    if (b) { b.classList.remove('mb-listening'); b.querySelector('span').textContent = 'Speak'; }
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
    b.classList.add('mb-listening');
    b.querySelector('span').textContent = 'Listening…';
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
    const c = e.target.closest('[data-c]');
    const act = c ? c.dataset.c : '';
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
    if (cancelArmed) disarm();
    // A tap beside the note only closes it while it is still empty: nobody loses a
    // half-written note to a stray finger.
    if (e.target === box) { if (!text.value.trim() && !photo) closeComposer(); return; }
    if (act === 'speak') return recognizer ? stopSpeech() : startSpeech();
    if (act === 'post' && !postBtn.disabled) {
      stopSpeech();
      const msg = postMessage({ who: current, text: text.value.trim(), photo, replyTo, forWho, replyToId: replyNote ? replyNote.id : null });
      if (!msg) {
        trouble = 'Couldn’t put the note up just now. Please tap Post again.';
        return sync();
      }
      try { localStorage.setItem('messages.lastWho', current); } catch { /* fine */ }
      saveDraft(null);
      clearTimeout(cancelTimer);
      if (!noMembers()) setActor(current); // they have just said who they are
      featuredId = msg.id;
      reveal = true;
      closeComposer();
      renderBoard();
    }
  };

  // "Reply" starts listening straight away when the screen can. Otherwise the keyboard
  // waits until the box is tapped, so the ready-made notes and names stay in view.
  if (replyTo && Speech && !restored) startSpeech();
}

function closeComposer() {
  if (recognizer) recognizer.stop();
  recognizer = null;
  const box = root && root.querySelector('[data-composer]');
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
  actor = null;
  mode = '';
  order = [];
  floatTimers = [];
  lookedAt = new Set();
  const name = householdName();
  el.innerHTML = `${STYLE}
  <div class="mb">
    ${topBar({ title: name ? `${name}${/s$/i.test(name) ? '’' : '’s'} board` : 'Notes', tone: 'light', right: '<button data-act="new" data-top-new class="x-btn mb-red">+ Write a note</button>' })}
    <div class="mb-main">
      <div data-left class="mb-left"></div>
      <div class="mb-side">
        <div data-side class="mb-side" style="flex:1"></div>
        <div data-code></div>
      </div>
    </div>
    <div data-floats class="mb-floats" aria-hidden="true"></div>
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
    const card = e.target.closest('.mb-card');
    if (card) return show(card.dataset.id);
    const r = e.target.closest('[data-react]');
    if (r) return react(r.dataset.react);
    const saw = e.target.closest('[data-saw]');
    if (saw) return tapSeen(saw.dataset.saw);
    const a = e.target.closest('[data-act]');
    const act = a ? a.dataset.act : '';
    if (act === 'undo') {
      if (undo) { clearTimeout(undo.timer); featuredId = undo.id; undo = null; }
      hideToast();
      return renderBoard();
    }
    if (act === 'new') return openComposer(null);
    if (act === 'tidy') return openTidy();
    if (act === 'old') { showOld = !showOld; return renderBoard(); }
    if (act === 'who') { actor = null; clearTimeout(actorTimer); return withActor('Who’s here?', () => renderBoard()); }
    const f = visible().find((m) => m.id === featuredId);
    if (!f) return;
    if (act === 'more') openMore(f);
    else if (act === 'read') openReader(f);
    else if (act === 'reply') openComposer(f);
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
  // (A note that arrives while nobody is about stays "new" until someone touches the screen.)
  timer = setInterval(() => { if (el.isConnected) renderBoard(); }, 60000);
  offNotes = onMessagesChanged(() => { if (el.isConnected) { featuredId = undefined; renderBoard(); } });
}

export function unmount() {
  clearInterval(timer);
  clearTimeout(toastTimer);
  clearTimeout(actorTimer);
  floatTimers.forEach(clearTimeout);
  floatTimers = [];
  if (offNotes) offNotes();
  if (stopCodes) stopCodes();
  stopCodes = null;
  closeComposer();
  finishRemove();
  markLooked();
  if (root) {
    root.removeEventListener('click', onClick);
    root.removeEventListener('touchstart', onTouchStart);
    root.removeEventListener('touchend', onTouchEnd);
  }
  actor = null;
  root = null;
}
