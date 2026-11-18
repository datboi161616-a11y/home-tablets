// Events typed on this tablet (Calendar → "+ Add"). Saved on this tablet only,
// like the week plan, and shown with everything else by calendar-data.js.
//
// Saved shape: { id, title, date: 'YYYY-MM-DD', allDay, time: 'HH:MM', minutes,
//                repeat: 'none'|'weekly'|'yearly', updated }
const KEY = 'calendar.mine.v1';
const MAX = 300;

const pad = (n) => String(n).padStart(2, '0');
export const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromIso = (s) => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };

export function myEvents() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(list) ? list.filter((e) => e && e.id && e.title && e.date) : [];
  } catch (e) { return []; }
}

function write(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX))); }
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
  const saved = {
    id: ev.id || `me-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    title, date: ev.date, allDay, time,
    minutes: Math.max(15, Math.min(24 * 60, Math.round(+ev.minutes || 60))),
    repeat: ['weekly', 'yearly'].includes(ev.repeat) ? ev.repeat : 'none',
    updated: Date.now(),
  };
  const list = myEvents().filter((e) => e.id !== saved.id);
  list.push(saved);
  write(list);
  return saved;
}

export function removeMyEvent(id) {
  write(myEvents().filter((e) => e.id !== id));
}

/** Does saved event `e` happen on day `d` (a local midnight)? */
function happensOn(e, d) {
  const first = fromIso(e.date);
  if (d < first) return false;
  if (e.repeat === 'weekly') return d.getDay() === first.getDay();
  if (e.repeat === 'yearly') {
    // Feb 29 events show on Feb 28 in other years.
    if (first.getMonth() === 1 && first.getDate() === 29 && new Date(d.getFullYear(), 1, 29).getMonth() !== 1) {
      return d.getMonth() === 1 && d.getDate() === 28;
    }
    return d.getMonth() === first.getMonth() && d.getDate() === first.getDate();
  }
  return d.getTime() === first.getTime();
}

/** This tablet's events on day `d`: [{ id, title, start, end, allDay }]. */
export function myEventsOn(d) {
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return myEvents().filter((e) => happensOn(e, day)).map((e) => {
    if (e.allDay) return { id: e.id, title: e.title, start: day, end: new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1), allDay: true };
    const [h, m] = e.time.split(':').map(Number);
    const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m);
    return { id: e.id, title: e.title, start, end: new Date(start.getTime() + e.minutes * 60000), allDay: false };
  });
}

export const getMyEvent = (id) => myEvents().find((e) => e.id === id) || null;
