// Family message board (Messages.dc.html).
// On the tablet, notes are stored by the tablet app: written on the tablet itself
// or sent from any phone on the home Wi-Fi (QR code → "Leave a note").
// In a normal browser (previewing on a PC) they live in localStorage, with a few
// example notes so the screen can be seen working.
//
// The tablet app keeps only { id, who, text, at, love, read, photo?, replyTo? } per note and
// can only mark ALL notes read at once. What the screen adds on top (which notes were
// really looked at, pinned, done, who a note is for) is kept on this screen in a small
// side list keyed by note id ("meta" below), so the app's stored notes never change shape.
import { getFamily, familyName } from './family.js';
import { getPhotos } from './tablet-photos.js';

const N = () => window.TabletNative;
const onTablet = () => !!(N() && N().notes);

const KEY = 'messages.v1';
const META_KEY = 'messages.meta.v1';
const DRAFT_KEY = 'messages.draft.v1';
const MAX = 60;
const MIN = 60 * 1000, HOUR = 60 * MIN, DAY = 24 * HOUR;

/** The most letters in a note: the same as the phone page and the tablet app allow. */
export const MAXLEN = 500;
/** Read notes older than this are tucked under "older notes" (pinned ones never are). */
export const ARCHIVE_DAYS = 14;

/** Ready-made notes, one tap each. */
export const QUICK_NOTES = [
  'Back soon', 'Back at 6', 'Dinner’s in the oven', 'Call me', 'Walked the dog',
  'Dog has been fed', 'Gone to the shop', 'Love you!',
];

/** Who can post from this tablet: the people entered in Tablet settings. */
export function members() {
  const people = getFamily().people;
  return people.length ? people : ['Me'];
}

/** True when no names have been set up yet (members() is then just "Me"). */
export const noMembers = () => !getFamily().people.length;

export const household = () => familyName();

// ---- what this screen adds to each note ----
// { [id]: { seen: 1, pinned: 1, done: at, for: 'Ava' } }
function readMeta() {
  try {
    const m = JSON.parse(localStorage.getItem(META_KEY) || '{}');
    return m && typeof m === 'object' && !Array.isArray(m) ? m : {};
  } catch { return {}; }
}
function writeMeta(m) {
  try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch { /* nothing to be done */ }
}
function patchMeta(id, patch) {
  const all = readMeta();
  const m = { ...(all[id] || {}) };
  Object.keys(patch).forEach((k) => { if (patch[k] === undefined || patch[k] === null || patch[k] === false) delete m[k]; else m[k] = patch[k]; });
  if (Object.keys(m).length) all[id] = m; else delete all[id];
  writeMeta(all);
}
// Forget the extras of notes that are gone (taken down here or from a phone).
function pruneMeta(ids) {
  const all = readMeta();
  let changed = false;
  Object.keys(all).forEach((id) => { if (!ids.has(id)) { delete all[id]; changed = true; } });
  if (changed) writeMeta(all);
}

// ---- the tablet app's notes ----
function fromNative(n) {
  const photos = n.photo ? getPhotos() : [];
  const p = n.photo ? photos.find((x) => x.id === n.photo) : null;
  return {
    id: n.id, who: n.who, household: household(), text: n.text, at: n.at,
    photo: p ? p.src : null, replyTo: n.replyTo || null,
    loved: (n.love || 0) > 0, seen: !!n.read,
  };
}

// ---- browser preview ----
function seed() {
  const now = Date.now();
  return [
    { who: 'Mom', at: now - 20 * MIN, text: 'Picked up milk and eggs. Leftover lasagna is in the fridge for lunch tomorrow.' },
    { who: 'Ava', at: now - 1 * DAY - 3 * HOUR, text: 'Got an A on my science project! Thanks for helping with the volcano, Dad.' },
    { who: 'Dad', at: now - 3 * DAY, text: 'Plumber is coming Thursday morning. Someone needs to be home by 9.' },
  ].map((m, i) => ({ id: `seed-${i}`, household: household(), photo: null, loved: false, seen: i > 0, ...m }));
}

// Never throws: when storage is full, photos go first, then the oldest notes.
function saveLocal(list) {
  list = list.slice(0, MAX);
  for (;;) {
    try { localStorage.setItem(KEY, JSON.stringify(list)); return true; }
    catch (err) {
      const withPhoto = [...list].reverse().find((m) => m.photo);
      if (withPhoto) withPhoto.photo = null;
      else if (list.length > 1) list.pop();
      else return false;
    }
  }
}

function loadLocal() {
  let list = null;
  try { list = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { list = null; }
  if (!Array.isArray(list)) { list = seed(); saveLocal(list); }
  return list.filter((m) => m && m.id);
}

// The stored notes, newest first, or null when the tablet app couldn't be read.
function loadBase() {
  if (onTablet()) {
    try { return JSON.parse(N().notes()).map(fromNative); } catch { return null; }
  }
  return loadLocal();
}

// ---- API used by the screens ----

/** Newest first. Each note: { id, who, text, at, photo, replyTo, loved, seen, pinned, done, for }. */
export function loadMessages() {
  const base = loadBase();
  if (!base) return [];
  const meta = readMeta();
  const list = base.map((m) => {
    const x = meta[m.id] || {};
    return {
      ...m,
      seen: !!(m.seen || x.seen),
      pinned: !!x.pinned,
      done: x.done || null,
      for: x.for || m.for || null,
    };
  });
  pruneMeta(new Set(list.map((m) => m.id)));
  return list.sort((a, b) => b.at - a.at);
}

/** photo: a JPEG data URL (or null). forWho: the person the note is meant for (or null). */
export function postMessage({ who, text, photo = null, replyTo = null, forWho = null }) {
  text = String(text || '').slice(0, MAXLEN);
  if (onTablet()) {
    let id = '';
    try { id = N().addNote(who, text, photo || '', replyTo || ''); } catch { id = ''; }
    if (!id) return null;
    // Written here, in front of the screen: it doesn't need announcing as new.
    patchMeta(id, { seen: 1, for: forWho || null });
    return loadMessages().find((m) => m.id === id) || null;
  }
  const list = loadLocal();
  const msg = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    who, household: household(), text, photo, replyTo, at: Date.now(), loved: false, seen: true,
  };
  list.unshift(msg);
  saveLocal(list);
  if (forWho) patchMeta(msg.id, { for: forWho });
  return loadMessages().find((m) => m.id === msg.id) || msg;
}

/** patch: { loved: true }, { seen: true }, { pinned: true|false }, { done: true|false } */
export function updateMessage(id, patch) {
  const extra = {};
  if (patch.seen) extra.seen = 1;
  if ('pinned' in patch) extra.pinned = patch.pinned ? 1 : null;
  if ('done' in patch) extra.done = patch.done ? Date.now() : null;
  if (Object.keys(extra).length) patchMeta(id, extra);
  if (onTablet()) {
    try { if (patch.loved) N().loveNote(id); } catch { /* stays as it was */ }
    // The app can only mark every note read at once: do that when every note has been seen
    // here, so the phone page agrees without hiding notes nobody has looked at yet.
    if (patch.seen && !loadMessages().some((m) => !m.seen)) { try { N().markNotesRead(); } catch { /* fine */ } }
    return loadMessages().find((m) => m.id === id);
  }
  const list = loadLocal();
  const m = list.find((x) => x.id === id);
  if (m) {
    if (patch.loved) m.loved = true;
    if (patch.seen) m.seen = true;
    saveLocal(list);
  }
  return loadMessages().find((x) => x.id === id);
}

/** Take a note off the board for good. Returns true if it was removed. */
export function deleteMessage(id) {
  let gone = false;
  if (onTablet()) {
    if (!N().deleteNote) return false;
    try { gone = !!N().deleteNote(id); } catch (e) { gone = false; }
  } else {
    const list = loadLocal();
    const left = list.filter((m) => m.id !== id);
    gone = left.length !== list.length && saveLocal(left);
  }
  if (gone) patchMeta(id, { seen: null, pinned: null, done: null, for: null });
  return gone;
}

/** Can notes be taken down on this screen? (Older tablet apps can't.) */
export const canDelete = () => !onTablet() || !!N().deleteNote;

/** Notes nobody has looked at yet (for the App menu). */
export function unreadCount() {
  return loadMessages().filter((m) => !m.seen).length;
}

/** A note was added (on the tablet or from a phone). */
export function onMessagesChanged(cb) {
  window.addEventListener('tablet-notes', cb);
  return () => window.removeEventListener('tablet-notes', cb);
}

/** Read, not pinned, and older than ARCHIVE_DAYS: tucked away under "older notes". */
export const isOld = (m, now = Date.now()) => m.seen && !m.pinned && now - m.at > ARCHIVE_DAYS * DAY;

// ---- a half-written note, kept until it is posted or thrown away ----
export function loadDraft() {
  try { const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); return d && typeof d.text === 'string' ? d : null; } catch { return null; }
}
export function saveDraft(d) {
  try {
    if (d && d.text && d.text.trim()) localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    else localStorage.removeItem(DRAFT_KEY);
  } catch { /* nothing to be done */ }
}

const clock = (d) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

// "20 min ago", "Today · 3:40 PM", "Yesterday · 6:10 PM", "Sunday · 9:00 AM", "Oct 3"
export function when(at) {
  const diff = Date.now() - at;
  if (diff < MIN) return 'Just now';
  if (diff < HOUR) return `${Math.floor(diff / MIN)} min ago`;
  const d = new Date(at), today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Math.round((today - new Date(d).setHours(0, 0, 0, 0)) / DAY);
  if (days <= 0) return `Today · ${clock(d)}`;
  if (days === 1) return `Yesterday · ${clock(d)}`;
  if (days < 7) return `${d.toLocaleDateString('en-US', { weekday: 'long' })} · ${clock(d)}`;
  const opts = { month: 'short', day: 'numeric' };
  if (d.getFullYear() !== today.getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString('en-US', opts);
}

/** "Wednesday, Nov 19 · 9:05 AM": the whole date, for reading a note in full. */
export function fullWhen(at) {
  const d = new Date(at);
  const opts = { weekday: 'long', month: 'short', day: 'numeric' };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return `${d.toLocaleDateString('en-US', opts)} · ${clock(d)}`;
}

// A note that is only emoji ("❤️", "👍👍") is shown big, like a sticker.
let emojiRe = null;
try { emojiRe = new RegExp('^(?:\\p{Extended_Pictographic}|\\p{Emoji_Modifier}|\\p{Regional_Indicator}|\\u200d|\\ufe0f|\\s)+$', 'u'); } catch { emojiRe = null; }
export const emojiOnly = (text) => {
  const t = String(text || '').trim();
  return !!(emojiRe && t && t.length <= 24 && emojiRe.test(t) && /[^\s‍️]/.test(t));
};

// Shrink a picked photo before saving it.
export function shrinkPhoto(file, max = 1600) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}
