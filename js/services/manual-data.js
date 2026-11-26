// The House manual: the things about a home that nobody remembers when they are needed.
// The guest Wi-Fi (shown as a code a phone's camera joins with), where the shut-offs are,
// who to ring, the appliances and their warranties, the paint on each wall, the filters and
// when they were last changed. Kept on this screen only; nothing is sent anywhere.
//
// Saved (one key): {
//   wifi: null | { ssid, password },
//   entries: [{ id, section, name, note, photos: [album photo id], updated,
//               where                                   (shutoffs, other; paint: the room)
//               phone                                   (numbers)
//               model, warranty: 'YYYY-MM-DD' | ''      (appliances)
//               color: '#RRGGBB', code, finish, brand   (paint; name = the colour's name)
//               size, every: months (0 = never), changed: 'YYYY-MM-DD' | ''   (filters) }]
// }
// Photos are the album's own (services/tablet-photos.js): only their ids are kept here.
const KEY = 'manual.v1';
const EVENT = 'manual-changed';
export const MAX_ENTRIES = 200;
export const MAX_PHOTOS = 2;

export const SECTIONS = [
  { id: 'shutoffs', title: 'Shut-offs' },
  { id: 'numbers', title: 'Numbers' },
  { id: 'appliances', title: 'Appliances' },
  { id: 'paint', title: 'Paint' },
  { id: 'filters', title: 'Filters' },
  { id: 'other', title: 'Other' },
];
const SECTION_IDS = SECTIONS.map((s) => s.id);
export const sectionTitle = (id) => (SECTIONS.find((s) => s.id === id) || { title: '' }).title;
export const FINISHES = ['Flat', 'Matte', 'Eggshell', 'Satin', 'Semi-gloss', 'High gloss'];
export const EVERY = [0, 1, 2, 3, 6, 12];
export const everyWords = (n) => (!n ? 'Never' : n === 12 ? '1 year' : n === 1 ? '1 month' : `${n} months`);

// ---- days ----
const pad = (n) => String(n).padStart(2, '0');
export const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const isIso = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
export const fromIso = (s) => { const p = String(s).split('-').map(Number); return new Date(p[0], (p[1] || 1) - 1, p[2] || 1); };
const asIso = (day) => (typeof day === 'string' ? day : isoDay(day || new Date()));
/** Whole days from one day to another (negative when `to` is earlier). */
export function daysBetween(from, to) {
  return Math.round((fromIso(asIso(to)) - fromIso(asIso(from))) / 864e5);
}
/** The same day `n` months on; the 31st lands on a shorter month's last day. */
export function addMonths(iso, n) {
  const d = fromIso(iso);
  const last = new Date(d.getFullYear(), d.getMonth() + n + 1, 0).getDate();
  return isoDay(new Date(d.getFullYear(), d.getMonth() + n, Math.min(d.getDate(), last)));
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "Jan 2", or "Mar 3, 2027" with the year. */
export function dayWords(iso, year = false) {
  if (!isIso(iso)) return '';
  const d = fromIso(iso);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}${year ? `, ${d.getFullYear()}` : ''}`;
}

// ---- the Wi-Fi code ----
// What a phone's camera reads to join a network: WIFI:T:WPA;S:<name>;P:<password>;;
// In the name and the password, \ ; , : and " are written with a \ in front.
export const wifiEscape = (s) => String(s == null ? '' : s).replace(/([\\;,:"])/g, '\\$1');
/** The text of the code, or '' when there is no network name. An empty password is an open network. */
export function wifiText(wifi) {
  const ssid = String((wifi && wifi.ssid) || '');
  const password = String((wifi && wifi.password) || '');
  if (!ssid) return '';
  return password ? `WIFI:T:WPA;S:${wifiEscape(ssid)};P:${wifiEscape(password)};;` : `WIFI:T:nopass;S:${wifiEscape(ssid)};;`;
}

// ---- tidy what is saved ----
const text = (s, max) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, max);
/** One entry, with only the things its section keeps. null when it has no name. */
export function cleanEntry(e) {
  if (!e) return null;
  const section = SECTION_IDS.indexOf(e.section) >= 0 ? e.section : 'other';
  const out = { id: String(e.id || ''), section, name: text(e.name, 40), note: text(e.note, 80), photos: [], updated: Number(e.updated) || 0 };
  if (section === 'shutoffs' || section === 'other' || section === 'paint') out.where = text(e.where, 60);
  if (section === 'shutoffs' || section === 'other' || section === 'appliances') {
    out.photos = (Array.isArray(e.photos) ? e.photos : []).map(String).filter(Boolean).slice(0, MAX_PHOTOS);
  }
  if (section === 'numbers') out.phone = text(e.phone, 24);
  if (section === 'appliances') { out.model = text(e.model, 40); out.warranty = isIso(e.warranty) ? e.warranty : ''; }
  if (section === 'paint') {
    out.color = /^#[0-9a-f]{6}$/i.test(e.color || '') ? e.color.toUpperCase() : '#DCD3C6';
    out.code = text(e.code, 20); out.finish = text(e.finish, 20); out.brand = text(e.brand, 30);
    if (!out.name) out.name = out.where; // a room with no colour name yet
  }
  if (section === 'filters') {
    out.size = text(e.size, 20);
    out.every = EVERY.indexOf(Number(e.every)) >= 0 ? Number(e.every) : 0;
    out.changed = isIso(e.changed) ? e.changed : '';
  }
  return out.name ? out : null;
}
function cleanWifi(w) {
  // (a network name or password may begin or end with a space: only the length is cut)
  const ssid = String((w && w.ssid) || '').slice(0, 32);
  return ssid.trim() ? { ssid, password: String((w && w.password) || '').slice(0, 63) } : null;
}

// ---- reading and saving ----
let seen = { raw: null, state: { wifi: null, entries: [] } };
/** { wifi, entries } as saved (a copy to read, not to change). */
export function manual() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch (e) { /* storage off */ }
  if (raw !== seen.raw || raw == null) {
    let state = { wifi: null, entries: [] };
    try {
      const j = JSON.parse(raw || '{}') || {};
      state = { wifi: cleanWifi(j.wifi), entries: (Array.isArray(j.entries) ? j.entries : []).map(cleanEntry).filter((e) => e && e.id).slice(0, MAX_ENTRIES) };
    } catch (e) { /* not what this wrote: start empty */ }
    seen = { raw, state };
  }
  return seen.state;
}
function write(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch (e) { throw new Error('No room left to save'); }
  window.dispatchEvent(new Event(EVENT));
}
export const entries = (section) => manual().entries.filter((e) => !section || e.section === section);
export const isEmpty = () => { const m = manual(); return !m.wifi && !m.entries.length; };

/** Save the guest Wi-Fi ({ ssid, password }), or take it away (null). Returns what was there. */
export function saveWifi(wifi) {
  const m = manual();
  write({ wifi: cleanWifi(wifi), entries: m.entries });
  return m.wifi;
}
/** Add an entry, or replace the one with its id. Returns the saved entry; throws with a short message. */
export function saveEntry(e) {
  const m = manual();
  const id = e.id || `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const clean = cleanEntry(Object.assign({}, e, { id, updated: Date.now() }));
  if (!clean) throw new Error('Name it first');
  const list = m.entries.slice();
  const i = list.findIndex((x) => x.id === id);
  if (i >= 0) list[i] = clean;
  else {
    if (list.length >= MAX_ENTRIES) throw new Error('The manual is full');
    list.push(clean);
  }
  write({ wifi: m.wifi, entries: list });
  return clean;
}
/** Take an entry out. Returns { entry, index } for putBack(), or null. */
export function removeEntry(id) {
  const m = manual();
  const index = m.entries.findIndex((x) => x.id === id);
  if (index < 0) return null;
  const entry = m.entries[index];
  write({ wifi: m.wifi, entries: m.entries.filter((x) => x.id !== id) });
  return { entry, index };
}
/** Undo removeEntry(). */
export function putBack(removed) {
  if (!removed || !removed.entry) return;
  const m = manual();
  const list = m.entries.filter((x) => x.id !== removed.entry.id);
  list.splice(Math.min(removed.index, list.length), 0, removed.entry);
  write({ wifi: m.wifi, entries: list });
}
/** A filter was changed (today, unless `day` says otherwise). Returns the day saved before, for Undo. */
export function markChanged(id, day) {
  const m = manual();
  const e = m.entries.find((x) => x.id === id);
  if (!e || e.section !== 'filters') return '';
  const before = e.changed || '';
  const changed = day === '' ? '' : asIso(day);
  write({ wifi: m.wifi, entries: m.entries.map((x) => (x.id === id ? Object.assign({}, x, { changed, updated: Date.now() }) : x)) });
  return before;
}

// ---- what is coming up ----
/** The day a filter is next due: its rhythm after the day it was last changed ('' with no rhythm or no such day yet). */
export function nextChange(e) {
  if (!e || e.section !== 'filters' || !e.every || !e.changed) return '';
  return addMonths(e.changed, e.every);
}
/** Filters with a next day, soonest first: [{ entry, next, days }] (days 0: due today; below 0: late). */
export function filterDates(list, today) {
  const now = asIso(today);
  return list.filter((e) => nextChange(e)).map((e) => ({ entry: e, next: nextChange(e), days: daysBetween(now, nextChange(e)) }))
    .sort((a, b) => a.days - b.days);
}
/** The next warranty to end, today or later: { entry, days } or null. */
export function nextWarranty(list, today) {
  const now = asIso(today);
  const left = list.filter((e) => e.section === 'appliances' && e.warranty && e.warranty >= now)
    .map((e) => ({ entry: e, days: daysBetween(now, e.warranty) })).sort((a, b) => a.days - b.days);
  return left[0] || null;
}

/** "Furnace filter"; a name that already says what it is stays as it is ("Furnace filter", "Smoke alarms"). */
const filterName = (name) => (/filter|batter|alarm/i.test(name) ? name : `${name} filter`);

/** homeLine() for a given manual and day (see homeLine). */
export function homeLineFor(state, today) {
  const due = filterDates(state.entries, today).filter((f) => f.days <= 0)[0];
  if (due) {
    return { text: `Change ${filterName(due.entry.name)}`, href: '#/manual/filters', tone: due.days < 0 ? 'late' : 'due', id: due.entry.id };
  }
  const w = nextWarranty(state.entries, today);
  if (w && w.days <= 30) {
    return { text: `${w.entry.name} warranty ends ${dayWords(w.entry.warranty)}`, href: '#/manual/appliances', tone: 'info' };
  }
  return null;
}
/**
 * The one quiet line Home may show: a filter that is due ('due' on its day, 'late' after;
 * done() marks it changed today), else a warranty in its last month ('info'), else null.
 */
export function homeLine(today) {
  const line = homeLineFor(manual(), today);
  if (!line) return null;
  const out = { text: line.text, href: line.href, tone: line.tone };
  if (line.id) out.done = () => { markChanged(line.id); };
  return out;
}

/** menuCard() for a given manual and day. */
export function menuCardFor(state, today) {
  const list = state.entries;
  if (!state.wifi && !list.length) return { title: 'House manual', lines: [], badge: 0, action: { label: '+ Add', href: '#/manual/add' } };
  const lines = [];
  const dates = filterDates(list, today);
  const due = dates.filter((f) => f.days <= 0);
  if (due.length) lines.push(`Change ${filterName(due[0].entry.name)}`);
  const w = nextWarranty(list, today);
  if (w && w.days <= 30) lines.push(`${w.entry.name} warranty · ${dayWords(w.entry.warranty)}`);
  if (state.wifi) lines.push(`Wi-Fi · ${state.wifi.ssid}`);
  if (!due.length && dates.length) lines.push(`${filterName(dates[0].entry.name)} · ${dayWords(dates[0].next)}`);
  SECTIONS.forEach((s) => {
    const n = list.filter((e) => e.section === s.id).length;
    if (n && s.id !== 'filters') lines.push(`${s.title} · ${n}`);
  });
  return { title: 'House manual', lines: lines.slice(0, 4), badge: due.length };
}
/** What the menu's card shows: { title, lines (≤ 4), badge (filters due), action (only when empty) }. */
export const menuCard = (today) => menuCardFor(manual(), today);

/** Calls cb() whenever the manual changes. Returns an unsubscribe function. */
export function onChanged(cb) {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}
