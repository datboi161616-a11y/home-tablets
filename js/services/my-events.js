// Events typed on this tablet (Calendar → "+ Add"). Saved on this tablet only,
// like the week plan, and shown with everything else by calendar-data.js.
//
// Saved shape: { id, title, date: 'YYYY-MM-DD', allDay, time: 'HH:MM', minutes,
//                repeat: 'none'|'weekly'|'fortnightly'|'monthly'|'yearly',
//                skip: ['YYYY-MM-DD'] (repeats left out), until: 'YYYY-MM-DD' (last repeat), updated }
const KEY = 'calendar.mine.v1';
const MAX = 300;
const REPEATS = ['weekly', 'fortnightly', 'monthly', 'yearly'];

const pad = (n) => String(n).padStart(2, '0');
export const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromIso = (s) => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };

// The calendar asks for these once per day it shows (a year for "Coming up"), so the
// list is only read again when what is saved has changed.
let seen = { raw: null, list: [] };
export function myEvents() {
  try {
    const raw = localStorage.getItem(KEY) || '[]';
    if (raw !== seen.raw) {
      const list = JSON.parse(raw);
      seen = { raw, list: Array.isArray(list) ? list.filter((e) => e && e.id && e.title && e.date) : [] };
    }
    return seen.list.slice();
  } catch (e) { return []; }
}

/** Has this saved event finished for good (a one-off, or a repeat that stopped) before `day`? */
function overBefore(e, day) {
  const last = e.repeat && e.repeat !== 'none' ? (e.until ? fromIso(e.until) : null) : fromIso(e.date);
  return !!last && last < day;
}

function write(list) {
  // Full: things that are long over go first (oldest first), never something still to come.
  if (list.length > MAX) {
    const cutoff = new Date(); cutoff.setHours(0, 0, 0, 0); cutoff.setDate(cutoff.getDate() - 30);
    const old = list.filter((e) => overBefore(e, cutoff)).sort((a, b) => (a.date < b.date ? -1 : 1));
    const drop = {};
    old.slice(0, list.length - MAX).forEach((e) => { drop[e.id] = true; });
    list = list.filter((e) => !drop[e.id]);
    if (list.length > MAX) throw new Error('The calendar is full: remove a few things first');
  }
  try { localStorage.setItem(KEY, JSON.stringify(list)); }
  catch (e) { throw new Error('This screen is out of room to save events'); }
  window.dispatchEvent(new Event('calendar-updated'));
}

/** Add, or replace by id. Returns the saved event; throws with a friendly message. */
export function saveMyEvent(ev) {
  const title = String(ev.title || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (!title) throw new Error('Type what’s happening first');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ev.date || '')) throw new Error('Pick a day');
  const allDay = !!ev.allDay;
  const time = /^\d{2}:\d{2}$/.test(ev.time || '') ? ev.time : '09:00';
  const repeat = REPEATS.indexOf(ev.repeat) >= 0 ? ev.repeat : 'none';
  const old = ev.id ? getMyEvent(ev.id) : null;
  const saved = {
    id: ev.id || `me-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    title, date: ev.date, allDay, time,
    minutes: Math.max(15, Math.min(24 * 60, Math.round(+ev.minutes || 60))),
    repeat,
    updated: Date.now(),
  };
  // A repeat keeps its left-out days and its end when it is changed (unless it now starts later).
  if (repeat !== 'none' && old && old.repeat === repeat) {
    if (Array.isArray(old.skip) && old.skip.length) saved.skip = old.skip.filter((d) => d > saved.date);
    if (old.until && old.until >= saved.date) saved.until = old.until;
  }
  const list = myEvents().filter((e) => e.id !== saved.id);
  list.push(saved);
  write(list);
  return saved;
}

export function removeMyEvent(id) {
  write(myEvents().filter((e) => e.id !== id));
}

/** Put back exactly what was there before (the "Undo" after a change or removal). */
export function restoreMyEvent(saved) {
  if (!saved || !saved.id) return;
  const list = myEvents().filter((e) => e.id !== saved.id);
  list.push(saved);
  write(list);
}

/** A repeating event: leave out just the one on `day`. Returns the event as it was. */
export function skipMyEventOn(id, day) {
  const e = getMyEvent(id);
  if (!e) return null;
  const iso = isoDay(day);
  if (iso === e.date && e.repeat !== 'none') {
    // The first one: the repeat now starts at the next one instead.
    const next = nextAfter(e, day);
    if (!next) { removeMyEvent(id); return e; }
    restoreMyEvent(Object.assign({}, e, { date: isoDay(next), skip: (e.skip || []).filter((d) => d > isoDay(next)), updated: Date.now() }));
    return e;
  }
  restoreMyEvent(Object.assign({}, e, { skip: (e.skip || []).filter((d) => d !== iso).concat([iso]).slice(-100), updated: Date.now() }));
  return e;
}

/** A repeating event: stop it before `day` (that one and every later one go). Returns the event as it was. */
export function endMyEventBefore(id, day) {
  const e = getMyEvent(id);
  if (!e) return null;
  const last = new Date(day.getFullYear(), day.getMonth(), day.getDate() - 1);
  if (last < fromIso(e.date)) { removeMyEvent(id); return e; }
  restoreMyEvent(Object.assign({}, e, { until: isoDay(last), updated: Date.now() }));
  return e;
}

/** Titles typed here before, newest first, without repeats: for one-tap choices. */
export function recentTitles(n = 6) {
  const out = [];
  myEvents().slice().sort((a, b) => (b.updated || 0) - (a.updated || 0)).forEach((e) => {
    if (out.length < n && !out.some((t) => t.toLowerCase() === e.title.toLowerCase())) out.push(e.title);
  });
  return out;
}

const daysIn = (y, m) => new Date(y, m + 1, 0).getDate();

/** Does saved event `e` happen on day `d` (a local midnight)? */
function happensOn(e, d) {
  const first = fromIso(e.date);
  if (d < first) return false;
  if (e.until && d > fromIso(e.until)) return false;
  if (e.skip && e.skip.indexOf(isoDay(d)) >= 0) return false;
  if (e.repeat === 'weekly') return d.getDay() === first.getDay();
  if (e.repeat === 'fortnightly') {
    const days = Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(first.getFullYear(), first.getMonth(), first.getDate())) / 86400000);
    return days % 14 === 0;
  }
  if (e.repeat === 'monthly') {
    // The 29th-31st fall on the last day of shorter months.
    return d.getDate() === Math.min(first.getDate(), daysIn(d.getFullYear(), d.getMonth()));
  }
  if (e.repeat === 'yearly') {
    // Feb 29 events show on Feb 28 in other years.
    if (first.getMonth() === 1 && first.getDate() === 29 && new Date(d.getFullYear(), 1, 29).getMonth() !== 1) {
      return d.getMonth() === 1 && d.getDate() === 28;
    }
    return d.getMonth() === first.getMonth() && d.getDate() === first.getDate();
  }
  return d.getTime() === first.getTime();
}

/** The next day after `day` that repeating event `e` happens on (within two years), or null. */
function nextAfter(e, day) {
  for (let i = 1; i <= 740; i++) {
    const d = new Date(day.getFullYear(), day.getMonth(), day.getDate() + i);
    if (happensOn(e, d)) return d;
  }
  return null;
}

/** This tablet's events on day `d`: [{ id, title, start, end, allDay, repeat }]. */
export function myEventsOn(d) {
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return myEvents().filter((e) => happensOn(e, day)).map((e) => {
    const repeat = e.repeat || 'none';
    if (e.allDay) return { id: e.id, title: e.title, start: day, end: new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1), allDay: true, repeat };
    const [h, m] = e.time.split(':').map(Number);
    const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m);
    return { id: e.id, title: e.title, start, end: new Date(start.getTime() + e.minutes * 60000), allDay: false, repeat };
  });
}

export const getMyEvent = (id) => myEvents().find((e) => e.id === id) || null;
