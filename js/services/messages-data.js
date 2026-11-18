// Family message board (Messages.dc.html).
// On the tablet, notes are stored by the tablet app: written on the tablet itself
// or sent from any phone on the home Wi-Fi (QR code → "Leave a note").
// In a normal browser (previewing on a PC) they live in localStorage, with a few
// example notes so the screen can be seen working.
import { getFamily, familyName } from './family.js';
import { getPhotos } from './tablet-photos.js';

const N = () => window.TabletNative;
const onTablet = () => !!(N() && N().notes);

const KEY = 'messages.v1';
const MAX = 60;
const MIN = 60 * 1000, HOUR = 60 * MIN, DAY = 24 * HOUR;

/** Who can post from this tablet: the people entered in Tablet settings. */
export function members() {
  const people = getFamily().people;
  return people.length ? people : ['Me'];
}

export const household = () => familyName();

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

function saveLocal(list) {
  list = list.slice(0, MAX);
  for (;;) {
    try { localStorage.setItem(KEY, JSON.stringify(list)); return; }
    catch (err) {
      const withPhoto = [...list].reverse().find((m) => m.photo);
      if (!withPhoto) throw err;
      withPhoto.photo = null;
    }
  }
}

function loadLocal() {
  let list = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (!Array.isArray(list)) { list = seed(); saveLocal(list); }
  return list;
}

// ---- API used by the screens ----

/** Newest first. */
export function loadMessages() {
  if (onTablet()) {
    try { return JSON.parse(N().notes()).map(fromNative); } catch { return []; }
  }
  return loadLocal().sort((a, b) => b.at - a.at);
}

/** photo: a JPEG data URL (or null). */
export function postMessage({ who, text, photo = null, replyTo = null }) {
  if (onTablet()) {
    const id = N().addNote(who, text, photo || '', replyTo || '');
    return loadMessages().find((m) => m.id === id) || null;
  }
  const list = loadLocal();
  const msg = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    who, household: household(), text, photo, replyTo, at: Date.now(), loved: false, seen: true,
  };
  list.unshift(msg);
  saveLocal(list);
  return msg;
}

/** patch: { loved: true } and/or { seen: true } */
export function updateMessage(id, patch) {
  if (onTablet()) {
    if (patch.loved) N().loveNote(id);
    if (patch.seen) N().markNotesRead();
    return loadMessages().find((m) => m.id === id);
  }
  const list = loadLocal();
  const m = list.find((x) => x.id === id);
  if (m) Object.assign(m, patch);
  saveLocal(list);
  return m;
}

/** Notes nobody has looked at yet (for the App menu). */
export function unreadCount() {
  return loadMessages().filter((m) => !m.seen).length;
}

/** A note was added (on the tablet or from a phone). */
export function onMessagesChanged(cb) {
  window.addEventListener('tablet-notes', cb);
  return () => window.removeEventListener('tablet-notes', cb);
}

// "20 min ago", "Today · 3:40 PM", "Yesterday", "Sunday", "Last week", "Oct 3"
export function when(at) {
  const diff = Date.now() - at;
  if (diff < MIN) return 'Just now';
  if (diff < HOUR) return `${Math.floor(diff / MIN)} min ago`;
  const d = new Date(at), today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Math.floor((today - new Date(d).setHours(0, 0, 0, 0)) / DAY);
  if (days <= 0) return `Today · ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  if (days === 1) return 'Yesterday';
  if (days < 7) return d.toLocaleDateString('en-US', { weekday: 'long' });
  if (days < 14) return 'Last week';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

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
