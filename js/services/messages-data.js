// Family message board data (Messages.dc.html).
// TODO(backend): the board should sync through a shared family backend so a
// note posted on one tablet shows on every screen. For now messages live in
// this tablet's localStorage, seeded with realistic sample notes on first run.

const KEY = 'messages.v1';
const MAX = 60;

// Who can post from this tablet. TODO(backend): load from the family profile.
export const MEMBERS = ['Mom', 'Dad', 'Ava', 'Liam', 'Grandma Jo', 'Grandpa Joe'];

export const household = () => localStorage.getItem('household') || 'Home';

const MIN = 60 * 1000, HOUR = 60 * MIN, DAY = 24 * HOUR;

function seed() {
  const now = Date.now();
  return [
    { who: 'Grandma Jo', household: 'Grandma’s house', at: now - 20 * MIN,
      text: 'Made your favorite apple pie today. Saving a slice for whoever visits first!' },
    { who: 'Ava', household: 'Home', at: now - 1 * DAY - 3 * HOUR,
      text: 'Got an A on my science project! Thanks for helping with the volcano, Dad.' },
    { who: 'Grandpa Joe', household: 'Grandma’s house', at: now - 3 * DAY,
      text: 'Fixed the porch light. Come see the new bird feeder next time you’re over.' },
    { who: 'Jake', household: 'Uncle Jake’s', at: now - 8 * DAY,
      text: 'First ice on the lake this morning. Skating soon if it holds!' },
    { who: 'Tom', household: 'Uncle Tom’s', at: now - 10 * DAY,
      text: 'Flights booked. We land Wednesday at 2:15, can someone grab us from the airport?' },
  ].map((m, i) => ({ id: `seed-${i}`, photo: null, loved: false, seen: i > 0, ...m }));
}

export function loadMessages() {
  let list = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (!Array.isArray(list)) { list = seed(); save(list); }
  return list.sort((a, b) => b.at - a.at);
}

function save(list) {
  list = list.slice(0, MAX);
  // Photos are the big part; if storage is full drop the oldest photos first.
  for (;;) {
    try { localStorage.setItem(KEY, JSON.stringify(list)); return; }
    catch (err) {
      const withPhoto = [...list].reverse().find((m) => m.photo);
      if (!withPhoto) throw err;
      withPhoto.photo = null;
    }
  }
}

export function postMessage({ who, text, photo = null, replyTo = null }) {
  const list = loadMessages();
  const msg = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    who, household: household(), text, photo, replyTo, at: Date.now(), loved: false, seen: true,
  };
  list.unshift(msg);
  save(list);
  return msg;
}

export function updateMessage(id, patch) {
  const list = loadMessages();
  const m = list.find((x) => x.id === id);
  if (m) Object.assign(m, patch);
  save(list);
  return m;
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

// Shrink a picked photo so it fits comfortably in localStorage.
export function shrinkPhoto(file, max = 1024) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/jpeg', 0.75));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}
