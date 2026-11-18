// A small iCalendar (.ics) reader for the calendar links people paste into
// Tablet settings: Google Calendar "secret address in iCal format", iCloud
// "public calendar" links, and similar exports.
//
//   expandEvents(icsText, rangeStart, rangeEnd)
//     -> [{ title, start: Date, end: Date, allDay, location, uid }] sorted by start
//
// Supported (RFC 5545 subset that real Google / iCloud feeds use):
//   - folded lines (CRLF or LF followed by a space or tab), \r\n, \n or \r line ends
//   - VEVENT: SUMMARY, LOCATION (text unescaped), UID, DTSTART, DTEND or DURATION,
//     STATUS:CANCELLED (skipped). VALARM / VTIMEZONE blocks are ignored.
//   - dates: VALUE=DATE all-day (DTEND exclusive), UTC "…Z", floating local, and
//     TZID=… (read as the tablet's own local time; the tablet sits in the same
//     time zone as the people whose calendar it shows).
//   - RRULE: FREQ=DAILY/WEEKLY/MONTHLY/YEARLY with INTERVAL, COUNT, UNTIL, BYDAY
//     (MO,WE / 2SU / -1FR), BYMONTHDAY (incl. negative), BYMONTH, BYSETPOS, WKST.
//   - RDATE and EXDATE (date, UTC, local and TZID forms, comma lists, many lines).
//   - RECURRENCE-ID: a changed or cancelled single instance replaces the matching
//     occurrence of the series with the same UID.
// Not supported (ignored): HOURLY/MINUTELY/SECONDLY (the first instance is shown),
// BYYEARDAY, BYWEEKNO, BYHOUR/BYMINUTE, RANGE=THISANDFUTURE, real VTIMEZONE rules.
//
// Recurring times keep their local wall-clock time (a 6:30 PM practice stays at
// 6:30 PM across daylight-saving changes). Work per event is capped, so a broken
// rule can't freeze the tablet.
//
// Plain browser JavaScript (no Node APIs); only uses APIs available in Chrome 64.

const MAX_PERIODS = 2000; // rule periods (days / weeks / months / years) per event
const DAY = 86400000;
const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']; // index = Date#getDay()

// ---------- Reading the text ----------

/** Unfolds continuation lines and splits into logical lines. */
function unfold(text) {
  return String(text || '')
    .replace(/\r\n|\r/g, '\n')
    .replace(/\n[ \t]/g, '')
    .split('\n');
}

/** "DTSTART;TZID=America/Chicago:20251103T183000" -> { name, params, value } */
function parseLine(line) {
  let quoted = false;
  let i = 0;
  for (; i < line.length; i++) {
    const c = line.charAt(i);
    if (c === '"') quoted = !quoted;
    else if (c === ':' && !quoted) break;
  }
  if (i >= line.length) return null;
  const head = line.slice(0, i);
  const value = line.slice(i + 1);

  // Split "NAME;P1=a;P2="x;y"" on semicolons outside quotes.
  const parts = [];
  let cur = '';
  quoted = false;
  for (let j = 0; j < head.length; j++) {
    const c = head.charAt(j);
    if (c === '"') quoted = !quoted;
    if (c === ';' && !quoted) { parts.push(cur); cur = ''; } else cur += c;
  }
  parts.push(cur);

  const params = {};
  for (let k = 1; k < parts.length; k++) {
    const eq = parts[k].indexOf('=');
    if (eq < 0) continue;
    params[parts[k].slice(0, eq).toUpperCase()] = parts[k].slice(eq + 1).replace(/^"|"$/g, '');
  }
  // Drop an optional "group." prefix (e.g. "item1.SUMMARY").
  const name = parts[0].toUpperCase().replace(/^.*\./, '');
  return { name, params, value };
}

/** TEXT values: \n -> newline, \, \; \\ -> the character. */
function unescapeText(v) {
  return String(v).replace(/\\([\\;,nN])/g, (m, c) => (c === 'n' || c === 'N' ? '\n' : c));
}

/**
 * "20251225" -> all-day local midnight; "20251103T183000Z" -> UTC;
 * "20251103T183000" (floating or with TZID) -> local time. null if unreadable.
 */
function parseDate(value, params) {
  const v = String(value || '').trim();
  let m = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (m) return { date: new Date(+m[1], +m[2] - 1, +m[3]), allDay: true };
  m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/i.exec(v);
  if (!m) return null;
  const y = +m[1], mo = +m[2] - 1, d = +m[3], h = +m[4], mi = +m[5], s = +(m[6] || 0);
  if (params && params.VALUE === 'DATE') return { date: new Date(y, mo, d), allDay: true };
  const date = m[7] ? new Date(Date.UTC(y, mo, d, h, mi, s)) : new Date(y, mo, d, h, mi, s);
  return isNaN(date.getTime()) ? null : { date, allDay: false };
}

/** Comma-separated date lists (EXDATE / RDATE). */
function parseDateList(value, params) {
  return String(value).split(',').map((v) => parseDate(v, params)).filter(Boolean);
}

/** "P1D", "PT1H30M", "-PT15M", "P2W" -> { days, ms } (signed). */
function parseDuration(value) {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i.exec(String(value).trim());
  if (!m) return null;
  const sign = m[1] === '-' ? -1 : 1;
  return {
    days: sign * ((+m[2] || 0) * 7 + (+m[3] || 0)),
    ms: sign * ((+m[4] || 0) * 3600000 + (+m[5] || 0) * 60000 + (+m[6] || 0) * 1000),
  };
}

function parseRule(value) {
  const r = { freq: '', interval: 1, count: 0, until: null, byday: [], bymonthday: [], bymonth: [], bysetpos: [], wkst: 1 };
  String(value).split(';').forEach((part) => {
    const eq = part.indexOf('=');
    if (eq < 0) return;
    const key = part.slice(0, eq).toUpperCase();
    const val = part.slice(eq + 1).trim();
    const ints = () => val.split(',').map((x) => parseInt(x, 10)).filter((x) => !isNaN(x) && x !== 0);
    if (key === 'FREQ') r.freq = val.toUpperCase();
    else if (key === 'INTERVAL') r.interval = Math.max(1, parseInt(val, 10) || 1);
    else if (key === 'COUNT') r.count = Math.max(0, parseInt(val, 10) || 0);
    else if (key === 'UNTIL') {
      const u = parseDate(val);
      // A date-only UNTIL includes that whole day.
      if (u) r.until = u.allDay ? new Date(u.date.getFullYear(), u.date.getMonth(), u.date.getDate(), 23, 59, 59, 999) : u.date;
    } else if (key === 'BYDAY') {
      val.toUpperCase().split(',').forEach((x) => {
        const bm = /^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/.exec(x.trim());
        if (bm) r.byday.push({ n: bm[1] ? parseInt(bm[1], 10) : 0, wd: WEEKDAYS.indexOf(bm[2]) });
      });
    } else if (key === 'BYMONTHDAY') r.bymonthday = ints();
    else if (key === 'BYMONTH') r.bymonth = ints().filter((x) => x >= 1 && x <= 12);
    else if (key === 'BYSETPOS') r.bysetpos = ints();
    else if (key === 'WKST') { const w = WEEKDAYS.indexOf(val.toUpperCase()); if (w >= 0) r.wkst = w; }
  });
  return r;
}

/** All VEVENTs in the file, as plain objects (nothing expanded yet). */
export function parseEvents(text) {
  const out = [];
  const stack = [];
  let ev = null;
  unfold(text).forEach((raw) => {
    if (!raw) return;
    const line = parseLine(raw);
    if (!line) return;
    const val = line.value.trim();
    if (line.name === 'BEGIN') {
      stack.push(val.toUpperCase());
      if (val.toUpperCase() === 'VEVENT') {
        ev = { uid: '', title: '', location: '', status: '', start: null, end: null, duration: null,
          rrule: null, exdates: [], rdates: [], recurrenceId: null };
      }
      return;
    }
    if (line.name === 'END') {
      const top = stack.pop();
      if (top === 'VEVENT' && ev) { if (ev.start) out.push(ev); ev = null; }
      return;
    }
    // Only properties directly inside a VEVENT (not its VALARMs).
    if (!ev || stack[stack.length - 1] !== 'VEVENT') return;
    const p = line.params;
    switch (line.name) {
      case 'UID': ev.uid = val; break;
      case 'SUMMARY': ev.title = unescapeText(line.value).trim(); break;
      case 'LOCATION': ev.location = unescapeText(line.value).trim(); break;
      case 'STATUS': ev.status = val.toUpperCase(); break;
      case 'DTSTART': ev.start = parseDate(val, p); break;
      case 'DTEND': ev.end = parseDate(val, p); break;
      case 'DURATION': ev.duration = parseDuration(val); break;
      case 'RRULE': ev.rrule = parseRule(val); break;
      case 'EXDATE': ev.exdates = ev.exdates.concat(parseDateList(val, p)); break;
      case 'RDATE': if (!p.VALUE || p.VALUE !== 'PERIOD') ev.rdates = ev.rdates.concat(parseDateList(val, p)); break;
      case 'RECURRENCE-ID': ev.recurrenceId = parseDate(val, p); break;
      default: break;
    }
  });
  return out;
}

// ---------- Date helpers (local calendar days, DST-safe) ----------

const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes(), d.getSeconds());
const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const dayNumber = (d) => Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY);
const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();

/** Days of month m (0-11) falling on weekday wd; n picks the nth (negative = from the end), 0 = all. */
function weekdaysInMonth(y, m, wd, n) {
  const first = new Date(y, m, 1).getDay();
  const list = [];
  for (let d = 1 + ((wd - first + 7) % 7); d <= daysInMonth(y, m); d += 7) list.push(d);
  if (!n) return list;
  const pick = n > 0 ? list[n - 1] : list[list.length + n];
  return pick ? [pick] : [];
}

/** BYSETPOS picks from the sorted candidates of one period. */
function applySetPos(list, setpos) {
  if (!setpos.length) return list;
  const out = [];
  setpos.forEach((p) => {
    const x = p > 0 ? list[p - 1] : list[list.length + p];
    if (x && out.indexOf(x) < 0) out.push(x);
  });
  return out.sort((a, b) => a - b);
}

/** Matching days in one month for MONTHLY / YEARLY rules. Returns day numbers. */
function monthDays(y, m, r, startDay) {
  const dim = daysInMonth(y, m);
  let days = null;
  if (r.bymonthday.length) {
    days = r.bymonthday.map((d) => (d > 0 ? d : dim + d + 1)).filter((d) => d >= 1 && d <= dim);
  }
  if (r.byday.length) {
    let set = [];
    r.byday.forEach((b) => { set = set.concat(weekdaysInMonth(y, m, b.wd, b.n)); });
    days = days ? days.filter((d) => set.indexOf(d) >= 0) : set;
  }
  if (!days) days = startDay <= dim ? [startDay] : []; // e.g. the 31st skips short months
  return days.filter((d, i) => days.indexOf(d) === i).sort((a, b) => a - b);
}

/**
 * Candidate start times for rule period p (0 = the period containing DTSTART).
 * Returns { from: Date (period start), list: [Date] sorted }.
 */
function period(r, s, p) {
  const y0 = s.getFullYear(), m0 = s.getMonth(), d0 = s.getDate();
  const at = (y, m, d) => new Date(y, m, d, s.getHours(), s.getMinutes(), s.getSeconds());
  const monthOk = (d) => !r.bymonth.length || r.bymonth.indexOf(d.getMonth() + 1) >= 0;
  let list = [];
  let from;

  if (r.freq === 'DAILY') {
    from = new Date(y0, m0, d0 + p);
    const c = at(y0, m0, d0 + p);
    const dim = daysInMonth(c.getFullYear(), c.getMonth());
    const mdOk = !r.bymonthday.length || r.bymonthday.some((x) => (x > 0 ? x : dim + x + 1) === c.getDate());
    const wdOk = !r.byday.length || r.byday.some((b) => b.wd === c.getDay());
    if (monthOk(c) && mdOk && wdOk) list = [c];
  } else if (r.freq === 'WEEKLY') {
    const back = (s.getDay() - r.wkst + 7) % 7;
    from = new Date(y0, m0, d0 - back + 7 * p);
    const wds = r.byday.length ? r.byday.map((b) => b.wd) : [s.getDay()];
    list = wds
      .map((wd) => at(from.getFullYear(), from.getMonth(), from.getDate() + ((wd - r.wkst + 7) % 7)))
      .filter(monthOk)
      .sort((a, b) => a - b);
    list = applySetPos(list.filter((d, i) => i === 0 || d - list[i - 1] !== 0), r.bysetpos);
  } else if (r.freq === 'MONTHLY') {
    const idx = y0 * 12 + m0 + p;
    const y = Math.floor(idx / 12), m = idx % 12;
    from = new Date(y, m, 1);
    if (!r.bymonth.length || r.bymonth.indexOf(m + 1) >= 0) {
      list = applySetPos(monthDays(y, m, r, d0).map((d) => at(y, m, d)), r.bysetpos);
    }
  } else if (r.freq === 'YEARLY') {
    const y = y0 + p;
    from = new Date(y, 0, 1);
    if (r.byday.length && !r.bymonth.length && !r.bymonthday.length) {
      // e.g. BYDAY=20MO: nth weekday of the whole year.
      r.byday.forEach((b) => {
        const all = [];
        for (let d = new Date(y, 0, 1); d.getFullYear() === y; d = new Date(y, d.getMonth(), d.getDate() + 1)) {
          if (d.getDay() === b.wd) all.push(d);
        }
        const picked = !b.n ? all : [b.n > 0 ? all[b.n - 1] : all[all.length + b.n]].filter(Boolean);
        picked.forEach((d) => list.push(at(y, d.getMonth(), d.getDate())));
      });
    } else {
      // BYMONTH lists the months; BYMONTHDAY alone means every month; else DTSTART's month.
      const months = r.bymonth.length ? r.bymonth.map((x) => x - 1)
        : r.bymonthday.length ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] : [m0];
      months.forEach((m) => {
        monthDays(y, m, r, d0).forEach((d) => list.push(at(y, m, d)));
      });
    }
    list.sort((a, b) => a - b);
    list = applySetPos(list, r.bysetpos);
  }
  return { from, list };
}

/** How many periods can be skipped without missing anything that touches rangeStart. */
function skipAhead(r, s, rangeStart, spanDays) {
  if (r.count) return 0; // COUNT has to be counted from the beginning
  let n = 0;
  if (r.freq === 'DAILY') n = dayNumber(rangeStart) - dayNumber(s) - spanDays - 1;
  else if (r.freq === 'WEEKLY') n = Math.floor((dayNumber(rangeStart) - dayNumber(s) - spanDays) / 7) - 2;
  else if (r.freq === 'MONTHLY') n = (rangeStart.getFullYear() * 12 + rangeStart.getMonth()) - (s.getFullYear() * 12 + s.getMonth()) - Math.ceil(spanDays / 28) - 1;
  else if (r.freq === 'YEARLY') n = rangeStart.getFullYear() - s.getFullYear() - Math.ceil(spanDays / 365) - 1;
  return n > 0 ? Math.floor(n / r.interval) * r.interval : 0;
}

// ---------- Matching EXDATE / RECURRENCE-ID to occurrences ----------

function matcher(list) {
  const times = {};
  const days = {};
  list.forEach((x) => {
    if (x.allDay) days[dayKey(x.date)] = true;
    else times[x.date.getTime()] = true;
  });
  // Exact start time, or (for date-only entries) any occurrence on that day.
  return (d) => !!times[d.getTime()] || !!days[dayKey(d)];
}

// ---------- Expansion ----------

/**
 * Every event occurrence that overlaps [rangeStart, rangeEnd), sorted by start.
 * Each: { title, start, end, allDay, location, uid }.
 */
export function expandEvents(icsText, rangeStart, rangeEnd) {
  const events = parseEvents(icsText);
  const out = [];
  const t0 = rangeStart.getTime(), t1 = rangeEnd.getTime();

  // Single-instance changes, by series UID.
  const overrides = {};
  events.forEach((e) => {
    if (e.recurrenceId && e.uid) (overrides[e.uid] = overrides[e.uid] || []).push(e.recurrenceId);
  });

  events.forEach((e) => {
    if (e.status === 'CANCELLED') return; // also covers cancelled single instances
    const allDay = e.start.allDay;
    const s = e.start.date;

    // Length: whole days for all-day events (DTEND is exclusive), else milliseconds.
    let spanDays = 0, spanMs = 0;
    if (e.end && e.end.date > s) {
      if (allDay) spanDays = Math.max(1, dayNumber(e.end.date) - dayNumber(s));
      else spanMs = e.end.date - s;
    } else if (e.duration) {
      spanDays = Math.max(0, e.duration.days);
      spanMs = Math.max(0, e.duration.ms);
      if (allDay && !spanDays) spanDays = 1;
    } else if (allDay) {
      spanDays = 1;
    }
    const endOf = (start) => new Date(addDays(start, spanDays).getTime() + spanMs);

    const emit = (start) => {
      const end = endOf(start);
      const t = start.getTime();
      const overlaps = end.getTime() > t ? t < t1 && end.getTime() > t0 : t >= t0 && t < t1;
      if (overlaps) {
        out.push({ title: e.title || 'Busy', start, end, allDay, location: e.location, uid: e.uid });
      }
    };

    // A changed single instance is its own event.
    if (e.recurrenceId || !e.rrule) {
      if (!e.recurrenceId && e.rdates.length) {
        const skip = matcher(e.exdates);
        [{ date: s }].concat(e.rdates).forEach((x) => { if (!skip(x.date, allDay)) emit(x.date); });
      } else {
        emit(s);
      }
      return;
    }

    const r = e.rrule;
    const excluded = matcher(e.exdates.concat(overrides[e.uid] || []));
    const take = (d) => { if (!excluded(d, allDay)) emit(d); };

    if (['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].indexOf(r.freq) < 0) { take(s); return; }

    // DTSTART is always the first occurrence (and counts toward COUNT).
    let count = 1;
    take(s);
    e.rdates.forEach((x) => { if (x.date - s !== 0) take(x.date); });

    let done = (r.count && count >= r.count);
    for (let i = 0, p = skipAhead(r, s, rangeStart, spanDays + Math.ceil(spanMs / DAY)); i < MAX_PERIODS && !done; i++, p += r.interval) {
      const per = period(r, s, p);
      if (per.from.getTime() >= t1) break;
      for (let k = 0; k < per.list.length; k++) {
        const c = per.list[k];
        if (c <= s) continue;
        if ((r.until && c > r.until) || c.getTime() >= t1) { done = true; break; }
        count++;
        take(c);
        if (r.count && count >= r.count) { done = true; break; }
      }
    }
  });

  return out.sort((a, b) => a.start - b.start || (b.allDay - a.allDay) || (a.title < b.title ? -1 : a.title > b.title ? 1 : 0));
}
