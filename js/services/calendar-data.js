// What the calendar screens show, from three sources on this tablet:
//   1. the calendar links saved in Tablet settings (Google Calendar / iCloud
//      iCal addresses), downloaded by the tablet app and read with ics.js;
//   2. the birthdays and dates typed into Tablet settings (repeat yearly);
//   3. the holidays in config.js (repeat yearly);
//   4. events typed on this tablet (Calendar → "+ Add", my-events.js).
//
// Calendar links are slow and may be offline, so the events found there are
// kept in localStorage (from four weeks back to a year ahead, as far as the
// calendar screen's arrows go) and every function below reads that copy
// instantly. refreshCalendars() updates it at most every 30 minutes (or right
// away when the settings change) and then fires the window event
// 'calendar-updated' so open screens can redraw.
import { timeText } from './display.js';
import { events as holidays } from '../config.js';
import { getFamily, fetchCalendarFeeds } from './family.js';
import { expandEvents, calendarName } from './ics.js';
import { myEventsOn } from './my-events.js';

// Calendar kinds -> colour. 'family' uses the accent colour from settings.
// The first calendar link is 'family', the second 'house', any more 'cal3'…'cal6',
// each in its own colour (white text reads on all of them).
export const KINDS = {
  family: { label: 'Calendar' },
  house: { label: 'Other calendars', color: '#2D5BA8' },
  cal3: { label: 'Calendar 3', color: '#7B4FA0' },
  cal4: { label: 'Calendar 4', color: '#2F7484' },
  cal5: { label: 'Calendar 5', color: '#9A5B13' },
  cal6: { label: 'Calendar 6', color: '#A63A5E' },
  tablet: { label: 'Added here', color: '#3E7D6E' },
  birthday: { label: 'Birthdays', color: '#1D2430' },
  holiday: { label: 'Holidays', color: '#7A8594' },
};
const LINK_KINDS = ['family', 'house', 'cal3', 'cal4', 'cal5', 'cal6'];

const CACHE_KEY = 'calendar-cache-v1';
const REFRESH_MS = 30 * 60 * 1000;
export const BACK_WEEKS = 4; // how far back the calendar screen can look
const AHEAD_DAYS = 53 * 7; // a year ahead, like the calendar screen's arrows
const MAX_SAVED = 5000; // calendar-link events kept (a daily event for a year is 365)
const DAY = 86400000;

// ---------- Small date helpers ----------

const midnight = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const dayDiff = (a, b) => Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / DAY);
const keyOf = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
// Names compared loosely, so a Google holiday calendar's "Christmas Day", "Thanksgiving Day"
// or "Easter Sunday" is the same as this screen's own "Christmas", "Thanksgiving", "Easter".
const loose = (s) => String(s).toLowerCase().replace(/\(observed\)/g, '').replace(/[’'`.]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().replace(/ (day|sunday)$/, '');
const sameName = (a, b) => loose(a) === loose(b);

/** "6:30 PM" */
export function fmtTime(d) {
  return timeText(d);
}

export function startOfWeek(date = new Date()) {
  const d = midnight(date);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // back to Monday
  return d;
}

// ---------- Cache of calendar-link events ----------
// { at: ms of last download, sig: settings fingerprint, error: '', okAt, names: [shown name per link],
//   events: [{ t: title, s: start ms, e: end ms, a: allDay, l: location, f: feed name, i: link index, k: kind }] }

let cache = null;
function readCache() {
  if (cache) return cache;
  try { cache = JSON.parse(localStorage.getItem(CACHE_KEY)) || null; } catch (e) { cache = null; }
  if (!cache || !Array.isArray(cache.events)) cache = { at: 0, sig: '', error: '', events: [] };
  return cache;
}
function writeCache(c) {
  cache = c;
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch (e) {
    // Storage full: keep the nearest half (and everything in memory for this visit).
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(Object.assign({}, c, { events: c.events.slice(0, Math.ceil(c.events.length / 2)) }))); } catch (e2) { /* keep in memory */ }
  }
}

const calendarsOf = (fam) => (fam.calendars || []).filter((c) => c && c.url);
const signature = (fam) => JSON.stringify(calendarsOf(fam).map((c) => [c.name || '', c.url]));

// The cached events as Dates, worked out once per download (every screen asks often),
// and filed by day so a day's events are found without looking through a whole year.
let memo = { from: null, sig: '', list: [], byDay: {} };
function feedIndex() {
  const c = readCache();
  const sig = signature(getFamily());
  if (memo.from === c && memo.sig === sig) return memo;
  const list = c.sig !== sig ? [] : c.events.map((x) => ({ title: x.t, start: new Date(x.s), end: new Date(x.e), allDay: !!x.a, location: x.l || '', kind: x.k || 'family', calendar: x.f || '' }));
  const byDay = {};
  list.forEach((e) => {
    // Every day the event touches (long ones capped at two months).
    let d = midnight(e.start);
    for (let n = 0; n < 62 && (d < e.end || n === 0); n++, d = addDays(d, 1)) (byDay[keyOf(d)] = byDay[keyOf(d)] || []).push(e);
  });
  memo = { from: c, sig, list, byDay };
  return memo;
}

/** Calendar-link events as Dates (only those from links still in settings). */
function feedEvents() {
  return feedIndex().list;
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
  // A Feb 29 birthday is kept on Feb 28 when the year has no Feb 29.
  const leapless = m === 2 && day === 28 && new Date(d.getFullYear(), 1, 29).getMonth() !== 1;
  const out = [];
  (getFamily().dates || []).forEach((x) => {
    if (!x.name || +x.month !== m) return;
    if (+x.day === day || (leapless && +x.day === 29)) {
      // With the year they were born (the phone page asks, if you like): how old they turn.
      const age = x.kind === 'birthday' && +x.year >= 1900 ? d.getFullYear() - x.year : 0;
      out.push({ title: x.name, kind: x.kind === 'birthday' ? 'birthday' : 'event', turns: age > 0 && age < 130 ? age : 0 });
    }
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
// Order within a day: all-day things first (holidays and birthdays before the rest),
// then by time; things that started on an earlier day ("Until 9 AM") come first.
const KIND_ORDER = { holiday: 0, birthday: 1, event: 2 };

/** How many calendar days an event touches (an all-day end is the day after). */
function daysTouched(e) {
  const lastMoment = e.allDay ? new Date(e.end.getTime() - 1) : new Date(Math.max(e.start.getTime(), e.end.getTime() - 1));
  return Math.max(1, dayDiff(e.start, lastMoment) + 1);
}

function itemsOn(d) {
  const dayStart = midnight(d), dayEnd = addDays(dayStart, 1);
  const list = [];
  (feedIndex().byDay[keyOf(dayStart)] || []).forEach((e) => {
    if (!(e.start < dayEnd && (e.end > dayStart || (e.end - e.start === 0 && e.start >= dayStart)))) return;
    // The same event on two linked calendars (a shared family event) shows once.
    if (list.some((o) => o.start - e.start === 0 && sameName(o.title, e.title))) return;
    let time, sort;
    if (e.allDay) { time = 'All day'; sort = -1; } else if (e.start >= dayStart) {
      time = fmtTime(e.start); sort = e.start.getHours() * 60 + e.start.getMinutes();
    } else if (e.end >= dayEnd) { time = 'All day'; sort = -1; } else { time = `Until ${fmtTime(e.end)}`; sort = -0.5; }
    const span = daysTouched(e);
    list.push({ title: e.title, time, kind: e.kind, sort, start: e.start, end: e.end, allDay: time === 'All day', location: e.location || '',
      calendar: e.calendar || '', dayOf: span > 1 ? dayDiff(e.start, dayStart) + 1 : 0, ofDays: span > 1 ? span : 0,
      endTime: !e.allDay && e.end > e.start && e.end <= dayEnd ? fmtTime(e.end) : '' });
  });
  // Typed on this tablet.
  myEventsOn(dayStart).forEach((e) => {
    list.push({ id: e.id, title: e.title, time: e.allDay ? 'All day' : fmtTime(e.start), kind: 'tablet',
      sort: e.allDay ? -1 : e.start.getHours() * 60 + e.start.getMinutes(), start: e.start, end: e.end, allDay: e.allDay, location: '',
      repeat: e.repeat || 'none', endTime: e.allDay ? '' : fmtTime(e.end) });
  });
  datedOn(d, list.map((x) => x.title)).forEach((x) => {
    list.push({ title: x.title, time: x.turns ? `Turns ${x.turns}` : 'All day', kind: x.kind, sort: -1, start: dayStart, end: dayEnd, allDay: true });
  });
  const rank = (x) => (x.kind in KIND_ORDER ? KIND_ORDER[x.kind] : 3);
  return list.sort((a, b) => a.sort - b.sort || (a.sort === -1 ? rank(a) - rank(b) : 0));
}

// ---------- What the screens use ----------

/** Seven days (Mon-Sun) with their events, for the week containing `date`. */
export function getWeek(date = new Date()) {
  const start = startOfWeek(date);
  const out = [];
  for (let i = 0; i < 7; i++) out.push(getDay(addDays(start, i)));
  return out;
}

/**
 * One day with its events (the same shape as a getWeek() day). Each event:
 * { id (own entries), time, endTime, title, location, kind, allDay, calendar (link name),
 *   dayOf / ofDays (2 of 3 for things over several days, else 0), repeat (own entries),
 *   over (a timed thing that has already finished), start, end }.
 */
export function getDay(date) {
  const d = midnight(date);
  const now = new Date();
  return {
    date: d,
    dow: d.toLocaleDateString('en-US', { weekday: 'short' }),
    num: d.getDate(),
    isToday: d.getTime() === midnight(now).getTime(),
    // Settings dates that aren't birthdays use the main calendar colour.
    events: itemsOn(d).map((e) => ({ id: e.id || '', time: e.time, endTime: e.endTime || '', title: e.title, location: e.location || '',
      kind: e.kind === 'event' ? 'family' : e.kind, allDay: !!e.allDay, calendar: e.calendar || '', dayOf: e.dayOf || 0, ofDays: e.ofDays || 0,
      repeat: e.repeat || '', over: !e.allDay && !!e.end && e.end <= now && e.end > e.start, start: e.start, end: e.end })),
  };
}

/** The first thing on the calendar after day `date` (up to a year on): { name, date, days (from today) } or null. */
export function nextAfter(date) {
  const today = midnight(new Date());
  const from = addDays(midnight(date), 1);
  for (let i = 0; i < 366; i++) {
    const d = addDays(from, i);
    const e = itemsOn(d).filter((x) => !(x.start < d))[0];
    if (e) return { name: e.title, date: d, days: dayDiff(today, d) };
  }
  return null;
}

/** The linked calendars with their names and colour kinds, for a key: [{ name, kind }]. */
export function linkedCalendars() {
  const fam = getFamily();
  const c = readCache();
  const names = c.sig === signature(fam) && Array.isArray(c.names) ? c.names : [];
  return calendarsOf(fam).slice(0, LINK_KINDS.length).map((x, i) => ({ name: names[i] || x.name || `Calendar ${i + 1}`, kind: LINK_KINDS[i] }));
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
      return { name: x.title, where: '', label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), days: i, date: d, turns: x.turns || 0 };
    }
  }
  return null;
}

/** How many things are on the calendar from today through Sunday. */
export function thisWeekCount() {
  const today = midnight(new Date());
  const end = addDays(startOfWeek(today), 7);
  // Each thing once: something over several days counts on its first day here, and an
  // event on two linked calendars counts once (itemsOn already shows it once).
  let count = 0;
  for (let d = today; d < end; d = addDays(d, 1)) {
    count += itemsOn(d).filter((e) => d.getTime() === today.getTime() || !(e.start < d)).length;
  }
  return count;
}

/** The first thing tomorrow, for the night clock: { title, time } or null. */
export function firstTomorrow() {
  const items = itemsOn(addDays(midnight(new Date()), 1), feedEvents());
  const timed = items.filter((e) => !e.allDay);
  const e = timed[0] || items[0];
  return e ? { title: e.title, time: e.time } : null;
}

/**
 * { configured: any calendar link or date set, calendars: number of links, lastError (plain
 *   words, '' when fine), updatedAt, savedAt, checking: a download is under way }
 */
export function calendarStatus() {
  const fam = getFamily();
  const c = readCache();
  const links = calendarsOf(fam).length;
  const current = c.sig === signature(fam);
  return {
    configured: links > 0 || (fam.dates || []).length > 0,
    calendars: links,
    lastError: links && current ? c.error || '' : '',
    updatedAt: c.at ? new Date(c.at) : null,
    // When the events on screen were last downloaded successfully (null: never).
    savedAt: links && current && c.okAt ? new Date(c.okAt) : null,
    checking: !!inFlight,
  };
}

// What went wrong with one calendar link, in plain words for the owner.
function problemWords(name, error) {
  const e = String(error || '');
  if (/HTTP (401|403|404|410)/.test(e)) return `The link for ${name} has stopped working. Make a new one on the phone page`;
  if (/isn.?t a calendar/i.test(e)) return `The link for ${name} isn’t a calendar link`;
  if (/too large/i.test(e)) return `${name} is too big to show`;
  return `Couldn’t reach ${name}`;
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
      const from = addDays(startOfWeek(today), -7 * BACK_WEEKS);
      const to = addDays(today, AHEAD_DAYS);
      const sameLinks = old.sig === sig;
      const events = [];
      const problems = [];
      const names = [];
      if (!feeds.length) problems.push(links.length > 1 ? 'Couldn’t reach your calendars' : 'Couldn’t reach your calendar');
      feeds.forEach((f, i) => {
        const set = (links[i] && links[i].name) || f.name || '';
        // A link left with the plain name "Calendar" shows the calendar's own name
        // (e.g. "Soccer"), but never an email address.
        const own = typeof f.ics === 'string' ? calendarName(f.ics) : '';
        const name = (!set || /^calendar\s*\d*$/i.test(set)) && own && own.indexOf('@') < 0 ? own.slice(0, 30) : set || `Calendar ${i + 1}`;
        names[i] = name;
        const kind = LINK_KINDS[i] || 'house';
        let list = null;
        // A failed download still brings the last good copy the screen saved; reading it
        // again keeps the calendar going (and moving with the days) while the link is down.
        if (typeof f.ics === 'string' && /BEGIN:VCALENDAR/i.test(f.ics)) {
          try {
            list = expandEvents(f.ics, from, to).map((e) => ({ t: e.title, s: e.start.getTime(), e: e.end.getTime(), a: e.allDay ? 1 : 0, l: e.location || '', f: name, i, k: kind }));
          } catch (err) { console.error('calendar', name, err); }
        }
        if (f.ok === false || !list) problems.push(problemWords(name, f.error));
        if (!list) {
          // Nothing readable: keep what we had for this calendar.
          list = sameLinks ? old.events.filter((x) => (x.i != null ? x.i === i : x.f === name)).map((x) => Object.assign({}, x, { f: name, i, k: kind })) : [];
        }
        events.push.apply(events, list);
      });
      if (!feeds.length && sameLinks) events.push.apply(events, old.events);
      events.sort((a, b) => a.s - b.s);
      // Too many to keep: the ones nearest today stay.
      const kept = events.length > MAX_SAVED ? events.filter((x) => x.e >= today.getTime()).slice(0, MAX_SAVED) : events;
      const error = problems.join(' · ');
      // A failed download is retried sooner than a good one (in about 5 minutes).
      // okAt = when the saved events were last downloaded without trouble.
      const okAt = problems.length ? (sameLinks ? old.okAt || 0 : 0) : Date.now();
      writeCache({ at: problems.length ? Date.now() - REFRESH_MS + 5 * 60 * 1000 : Date.now(), sig, error, events: kept, okAt,
        names: names.length ? names : (sameLinks && old.names) || [] });
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
