// What the calendar screens show, from three sources on this tablet:
//   1. the calendar links saved in Tablet settings (Google Calendar / iCloud
//      iCal addresses), downloaded by the tablet app and read with ics.js;
//   2. the birthdays and dates typed into Tablet settings (repeat yearly);
//   3. the holidays in config.js (repeat yearly).
//
// Calendar links are slow and may be offline, so the events found there are
// kept in localStorage (this week plus the next ~60 days) and every function
// below reads that copy instantly. refreshCalendars() updates it at most every
// 30 minutes (or right away when the settings change) and then fires the
// window event 'calendar-updated' so open screens can redraw.
import { events as holidays } from '../config.js';
import { getFamily, fetchCalendarFeeds } from './family.js';
import { expandEvents } from './ics.js';

// Calendar kinds -> colour. 'family' uses the accent colour from settings.
export const KINDS = {
  family: { label: 'Calendar' },
  house: { label: 'Other calendars', color: '#2D5BA8' },
  birthday: { label: 'Birthdays', color: '#1D2430' },
  holiday: { label: 'Holidays', color: '#7A8594' },
};

const CACHE_KEY = 'calendar-cache-v1';
const REFRESH_MS = 30 * 60 * 1000;
const AHEAD_DAYS = 61;
const DAY = 86400000;

// ---------- Small date helpers ----------

const midnight = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const dayDiff = (a, b) => Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / DAY);
const sameName = (a, b) => String(a).toLowerCase().replace(/[’'`]/g, '') === String(b).toLowerCase().replace(/[’'`]/g, '');

/** "6:30 PM" */
export function fmtTime(d) {
  const h = d.getHours();
  return `${((h + 11) % 12) + 1}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

export function startOfWeek(date = new Date()) {
  const d = midnight(date);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // back to Monday
  return d;
}

// ---------- Cache of calendar-link events ----------
// { at: ms of last download, sig: settings fingerprint, error: '',
//   events: [{ t: title, s: start ms, e: end ms, a: allDay, l: location, f: feed name, k: kind }] }

let cache = null;
function readCache() {
  if (cache) return cache;
  try { cache = JSON.parse(localStorage.getItem(CACHE_KEY)) || null; } catch (e) { cache = null; }
  if (!cache || !Array.isArray(cache.events)) cache = { at: 0, sig: '', error: '', events: [] };
  return cache;
}
function writeCache(c) {
  cache = c;
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch (e) { /* storage full: keep in memory */ }
}

const calendarsOf = (fam) => (fam.calendars || []).filter((c) => c && c.url);
const signature = (fam) => JSON.stringify(calendarsOf(fam).map((c) => [c.name || '', c.url]));

/** Calendar-link events as Dates (only those from links still in settings). */
function feedEvents() {
  const c = readCache();
  if (c.sig !== signature(getFamily())) return [];
  return c.events.map((x) => ({ title: x.t, start: new Date(x.s), end: new Date(x.e), allDay: !!x.a, location: x.l || '', kind: x.k || 'family' }));
}

// ---------- Yearly dates (settings + holidays) ----------

// Easter Sunday (Gregorian, "anonymous" algorithm) as [month 1-12, day].
function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return [month, day];
}
/** Does holiday `h` (see config.js) fall on day `d`? */
function holidayOn(h, d) {
  const m = d.getMonth() + 1, day = d.getDate();
  if (h.easter != null) {
    const [em, ed] = easter(d.getFullYear());
    const e = new Date(d.getFullYear(), em - 1, ed + h.easter);
    return e.getMonth() + 1 === m && e.getDate() === day;
  }
  if (h.month !== m) return false;
  if (h.weekday == null) return h.day === day;
  if (d.getDay() !== h.weekday) return false;
  const nth = Math.floor((day - 1) / 7) + 1; // 1st, 2nd… of this weekday in the month
  if (h.nth > 0) return nth === h.nth;
  return day + 7 > new Date(d.getFullYear(), m, 0).getDate(); // last one in the month
}

/** Settings dates and holidays that fall on day `d`. */
function datedOn(d, feedTitles) {
  const m = d.getMonth() + 1, day = d.getDate();
  const out = [];
  (getFamily().dates || []).forEach((x) => {
    if (+x.month === m && +x.day === day && x.name) out.push({ title: x.name, kind: x.kind === 'birthday' ? 'birthday' : 'event' });
  });
  holidays.forEach((h) => {
    // Skip a holiday the calendar link already has (e.g. a Google "Holidays" calendar).
    if (holidayOn(h, d) && !feedTitles.some((t) => sameName(t, h.name)) && !out.some((o) => sameName(o.title, h.name))) {
      out.push({ title: h.name, kind: 'holiday' });
    }
  });
  return out;
}

/** Everything on one day: [{ title, time, kind, sort, start?, allDay }] sorted, all-day first. */
function itemsOn(d, feeds) {
  const dayStart = midnight(d), dayEnd = addDays(dayStart, 1);
  const list = [];
  feeds.forEach((e) => {
    if (!(e.start < dayEnd && (e.end > dayStart || (e.end - e.start === 0 && e.start >= dayStart)))) return;
    let time, sort;
    if (e.allDay) { time = 'All day'; sort = -1; } else if (e.start >= dayStart) {
      time = fmtTime(e.start); sort = e.start.getHours() * 60 + e.start.getMinutes();
    } else if (e.end >= dayEnd) { time = 'All day'; sort = -1; } else { time = `Until ${fmtTime(e.end)}`; sort = 0; }
    list.push({ title: e.title, time, kind: e.kind, sort, start: e.start, end: e.end, allDay: time === 'All day' });
  });
  datedOn(d, list.map((x) => x.title)).forEach((x) => {
    list.push({ title: x.title, time: 'All day', kind: x.kind, sort: -1, start: dayStart, end: dayEnd, allDay: true });
  });
  return list.sort((a, b) => a.sort - b.sort);
}

// ---------- What the screens use ----------

/** Seven days (Mon-Sun) with their events, for the week containing `date`. */
export function getWeek(date = new Date()) {
  const start = startOfWeek(date);
  const today = midnight(new Date());
  const feeds = feedEvents();
  const out = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(start, i);
    out.push({
      date: d,
      dow: d.toLocaleDateString('en-US', { weekday: 'short' }),
      num: d.getDate(),
      isToday: d.getTime() === today.getTime(),
      // Settings dates that aren't birthdays use the main calendar colour.
      events: itemsOn(d, feeds).map((e) => ({ time: e.time, title: e.title, kind: e.kind === 'event' ? 'family' : e.kind })),
    });
  }
  return out;
}

/**
 * The next `n` things from today on (today included; today's timed events
 * that are already over are left out): [{ name, date, days, kind }].
 */
export function upcoming(n = 3) {
  const now = new Date();
  const today = midnight(now);
  const feeds = feedEvents();
  const out = [];
  for (let i = 0; i < 366 && out.length < n; i++) {
    const d = addDays(today, i);
    itemsOn(d, feeds).forEach((e) => {
      if (e.end && e.end <= now && !(e.allDay && i === 0)) return;
      if (e.start < d && i > 0) return; // a multi-day event counts once
      if (out.some((o) => o.days === i && sameName(o.name, e.title))) return;
      out.push({ name: e.title, date: e.start < d ? d : e.start, days: i, kind: e.kind });
    });
  }
  return out.slice(0, n);
}

/** The next holiday or settings date (birthday, anniversary…): { name, where, label, days, date }. */
export function nextBigThing() {
  const today = midnight(new Date());
  for (let i = 0; i < 367; i++) {
    const d = addDays(today, i);
    const x = datedOn(d, [])[0];
    if (x) {
      return { name: x.title, where: '', label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), days: i, date: d };
    }
  }
  return null;
}

/** How many things are on the calendar from today through Sunday. */
export function thisWeekCount() {
  const today = midnight(new Date());
  const end = addDays(startOfWeek(today), 7);
  const feeds = feedEvents();
  let count = feeds.filter((e) => e.start < end && e.end > today).length;
  for (let d = today; d < end; d = addDays(d, 1)) count += datedOn(d, feeds.map((e) => e.title)).length;
  return count;
}

/** The first thing tomorrow, for the night clock: { title, time } or null. */
export function firstTomorrow() {
  const items = itemsOn(addDays(midnight(new Date()), 1), feedEvents());
  const timed = items.filter((e) => !e.allDay);
  const e = timed[0] || items[0];
  return e ? { title: e.title, time: e.time } : null;
}

/** { configured: any calendar link or date set, calendars: number of links, lastError, updatedAt } */
export function calendarStatus() {
  const fam = getFamily();
  const c = readCache();
  const links = calendarsOf(fam).length;
  return {
    configured: links > 0 || (fam.dates || []).length > 0,
    calendars: links,
    lastError: links ? c.error || '' : '',
    updatedAt: c.at ? new Date(c.at) : null,
  };
}

// ---------- Downloading ----------

let inFlight = null;

/**
 * Downloads the calendar links (if the copy is older than 30 minutes, the
 * links changed, or `force`), then fires 'calendar-updated'. Never rejects.
 */
export function refreshCalendars(force = false) {
  if (inFlight) return inFlight;
  const fam = getFamily();
  const sig = signature(fam);
  const old = readCache();
  if (!force && old.sig === sig && Date.now() - old.at < REFRESH_MS) return Promise.resolve();

  const links = calendarsOf(fam);
  if (!links.length) {
    writeCache({ at: Date.now(), sig, error: '', events: [] });
    window.dispatchEvent(new Event('calendar-updated'));
    return Promise.resolve();
  }

  inFlight = fetchCalendarFeeds()
    .then((feeds) => {
      const today = midnight(new Date());
      const from = startOfWeek(today);
      const to = addDays(today, AHEAD_DAYS);
      const sameLinks = old.sig === sig;
      const events = [];
      const failed = [];
      if (!feeds.length) failed.push('your calendar');
      feeds.forEach((f, i) => {
        const name = f.name || (links[i] && links[i].name) || `Calendar ${i + 1}`;
        const kind = i === 0 ? 'family' : 'house';
        let list = null;
        if (f.ok !== false && typeof f.ics === 'string' && /BEGIN:VCALENDAR/i.test(f.ics)) {
          try {
            list = expandEvents(f.ics, from, to).map((e) => ({ t: e.title, s: e.start.getTime(), e: e.end.getTime(), a: e.allDay ? 1 : 0, l: e.location || '', f: name, k: kind }));
          } catch (err) { console.error('calendar', name, err); }
        }
        if (!list) {
          failed.push(name);
          // Offline or the link failed: keep what we had for this calendar.
          list = sameLinks ? old.events.filter((x) => x.f === name).map((x) => Object.assign({}, x, { k: kind })) : [];
        }
        events.push.apply(events, list);
      });
      if (!feeds.length && sameLinks) events.push.apply(events, old.events);
      events.sort((a, b) => a.s - b.s);
      const error = failed.length ? `Couldn't update ${failed.join(', ')}` : '';
      // A failed download is retried sooner than a good one (in about 5 minutes).
      writeCache({ at: failed.length ? Date.now() - REFRESH_MS + 5 * 60 * 1000 : Date.now(), sig, error, events });
    })
    .catch((err) => { console.error('calendar refresh', err); })
    .then(() => {
      inFlight = null;
      window.dispatchEvent(new Event('calendar-updated'));
    });
  return inFlight;
}

// Keep the copy fresh while the tablet runs, and reload when settings change.
setTimeout(() => refreshCalendars(), 0);
setInterval(() => refreshCalendars(), 5 * 60 * 1000); // no-op unless 30 min have passed
window.addEventListener('tablet-family', () => { setTimeout(() => refreshCalendars(true), 0); });
