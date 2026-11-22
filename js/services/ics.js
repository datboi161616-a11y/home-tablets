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
//     TZID=… (converted from that zone with the browser's zone tables; Windows /
//     Outlook names, "(UTC-05:00) Eastern Time…" and prefixed names are understood;
//     an unknown name is read as the screen's own time).
//   - Outlook's X-MICROSOFT-CDO-ALLDAYEVENT midnight-to-midnight all-day events.
//   - RRULE: FREQ=DAILY/WEEKLY/MONTHLY/YEARLY with INTERVAL, COUNT, UNTIL, BYDAY
//     (MO,WE / 2SU / -1FR), BYMONTHDAY (incl. negative), BYMONTH, BYSETPOS, WKST.
//   - RDATE (incl. PERIOD) and EXDATE (date, UTC, local and TZID forms, comma lists, many lines).
//   - RECURRENCE-ID: a changed or cancelled single instance replaces the matching
//     occurrence of the series with the same UID.
//   - Invitations the calendar's owner declined (Google names a main calendar after
//     its owner's email) are left out; an event written twice shows once.
// Not supported (ignored): HOURLY/MINUTELY/SECONDLY (the first instance is shown),
// BYYEARDAY, BYWEEKNO, BYHOUR/BYMINUTE, RANGE=THISANDFUTURE, real VTIMEZONE rules.
//
// Recurring times keep their wall-clock time in their own zone (a 6:30 PM practice
// stays at 6:30 PM across daylight-saving changes). Work per event is capped, so a
// broken rule can't freeze the screen. Tests: node tools/sim/ics-test.mjs
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

// ---------- Time zones ----------
// A TZID names the zone the wall-clock time is in. When it is the screen's own zone
// (the usual case) nothing changes; when it isn't (a relative's calendar in another
// state, a flight that lands in another zone) the time is converted with the browser's
// own zone tables (Intl). Outlook / Exchange use Windows zone names, and some
// programs write long or prefixed names; those are mapped to the usual ones. A name
// that can't be worked out is read as the screen's own time, as before.

const WINDOWS_ZONES = {
  'eastern standard time': 'America/New_York', 'us eastern standard time': 'America/Indianapolis',
  'central standard time': 'America/Chicago', 'mountain standard time': 'America/Denver',
  'us mountain standard time': 'America/Phoenix', 'pacific standard time': 'America/Los_Angeles',
  'alaskan standard time': 'America/Anchorage', 'hawaiian standard time': 'Pacific/Honolulu',
  'atlantic standard time': 'America/Halifax', 'newfoundland standard time': 'America/St_Johns',
  'canada central standard time': 'America/Regina', 'central standard time (mexico)': 'America/Mexico_City',
  'sa pacific standard time': 'America/Bogota', 'e. south america standard time': 'America/Sao_Paulo',
  'gmt standard time': 'Europe/London', 'greenwich standard time': 'Atlantic/Reykjavik',
  'w. europe standard time': 'Europe/Berlin', 'romance standard time': 'Europe/Paris',
  'central europe standard time': 'Europe/Budapest', 'central european standard time': 'Europe/Warsaw',
  'e. europe standard time': 'Europe/Chisinau', 'fle standard time': 'Europe/Kiev', 'gtb standard time': 'Europe/Bucharest',
  'russian standard time': 'Europe/Moscow', 'israel standard time': 'Asia/Jerusalem', 'arabian standard time': 'Asia/Dubai',
  'south africa standard time': 'Africa/Johannesburg', 'india standard time': 'Asia/Kolkata',
  'china standard time': 'Asia/Shanghai', 'singapore standard time': 'Asia/Singapore', 'tokyo standard time': 'Asia/Tokyo',
  'korea standard time': 'Asia/Seoul', 'aus eastern standard time': 'Australia/Sydney', 'e. australia standard time': 'Australia/Brisbane',
  'cen. australia standard time': 'Australia/Adelaide', 'w. australia standard time': 'Australia/Perth',
  'new zealand standard time': 'Pacific/Auckland', 'utc': 'UTC', 'coordinated universal time': 'UTC',
};
// Outlook display names such as "(UTC-05:00) Eastern Time (US & Canada)".
const ZONE_WORDS = [
  [/eastern time/i, 'America/New_York'], [/central time/i, 'America/Chicago'], [/arizona/i, 'America/Phoenix'],
  [/mountain time/i, 'America/Denver'], [/pacific time/i, 'America/Los_Angeles'], [/alaska/i, 'America/Anchorage'],
  [/hawaii/i, 'Pacific/Honolulu'], [/atlantic time/i, 'America/Halifax'], [/london|dublin|edinburgh/i, 'Europe/London'],
];

const zoneCache = {};
let localZoneName;
function localZone() {
  if (localZoneName === undefined) {
    try { localZoneName = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { localZoneName = ''; }
  }
  return localZoneName;
}

/** A zone that can give its UTC offset (minutes) at any moment, or null for "the screen's own time". */
function makeZone(name) {
  if (/^(utc|gmt|etc\/utc|etc\/gmt|z)$/i.test(name)) return { key: 'UTC', offset: () => 0 };
  const fixed = /^(?:utc|gmt)\s*([+-])(\d{1,2}):?(\d{2})?$/i.exec(name);
  if (fixed) {
    const mins = (fixed[1] === '-' ? -1 : 1) * (+fixed[2] * 60 + +(fixed[3] || 0));
    return { key: `fixed${mins}`, offset: () => mins };
  }
  let fmt;
  try {
    fmt = new Intl.DateTimeFormat('en-US', { timeZone: name, hour12: false, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
  } catch (e) { return undefined; } // not a zone this browser knows
  const iana = fmt.resolvedOptions().timeZone;
  if (iana && iana === localZone()) return null;
  return {
    key: iana || name,
    offset(ms) {
      const p = {};
      fmt.formatToParts(new Date(ms)).forEach((x) => { p[x.type] = x.value; });
      const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
      return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60000);
    },
  };
}

/** TZID text -> zone (see makeZone), null when it is the screen's own zone or unknown. */
function zoneFor(tzid) {
  const raw = String(tzid || '').trim().replace(/^"|"$/g, '');
  if (!raw) return null;
  if (raw in zoneCache) return zoneCache[raw];
  const tries = [WINDOWS_ZONES[raw.toLowerCase()], raw];
  const tail = /([A-Za-z_]+\/[A-Za-z_+-]+(?:\/[A-Za-z_+-]+)?)$/.exec(raw); // "/mozilla.org/20050126_1/America/New_York"
  if (tail) tries.push(tail[1]);
  ZONE_WORDS.forEach(([re, z]) => { if (re.test(raw)) tries.push(z); });
  let zone = null;
  for (let i = 0; i < tries.length; i++) {
    if (!tries[i]) continue;
    const z = makeZone(tries[i]);
    if (z !== undefined) { zone = z; break; }
  }
  zoneCache[raw] = zone;
  return zone;
}

/** Wall-clock time in `zone` (held in a local Date's fields) -> the real moment. */
function wallToReal(wall, zone) {
  if (!zone) return wall;
  const guess = Date.UTC(wall.getFullYear(), wall.getMonth(), wall.getDate(), wall.getHours(), wall.getMinutes(), wall.getSeconds());
  const off1 = zone.offset(guess);
  let t = guess - off1 * 60000;
  const off2 = zone.offset(t);
  if (off2 !== off1) t = guess - off2 * 60000;
  return new Date(t);
}

/** The real moment -> its wall-clock time in `zone` (held in a local Date's fields). */
function realToWall(real, zone) {
  if (!zone) return real;
  const w = new Date(real.getTime() + zone.offset(real.getTime()) * 60000);
  return new Date(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate(), w.getUTCHours(), w.getUTCMinutes(), w.getUTCSeconds());
}

const realOf = (x) => (x.zone ? wallToReal(x.date, x.zone) : x.date);
const sameZone = (a, b) => (a ? a.key : '') === (b ? b.key : '');
/** A parsed date as wall-clock time in `zone` (all-day dates stay as they are). */
function inZone(x, zone) {
  if (x.allDay || sameZone(x.zone, zone)) return x.date;
  return realToWall(realOf(x), zone);
}

/**
 * "20251225" -> all-day local midnight; "20251103T183000Z" -> UTC;
 * "20251103T183000" floating -> local time; with TZID -> wall time in that zone
 * ({ zone } set when it isn't the screen's own). null if unreadable.
 */
function parseDate(value, params) {
  const v = String(value || '').trim();
  let m = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (m) return { date: new Date(+m[1], +m[2] - 1, +m[3]), allDay: true, zone: null };
  m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/i.exec(v);
  if (!m) return null;
  const y = +m[1], mo = +m[2] - 1, d = +m[3], h = +m[4], mi = +m[5], s = +(m[6] || 0);
  if (params && params.VALUE === 'DATE') return { date: new Date(y, mo, d), allDay: true, zone: null };
  const date = m[7] ? new Date(Date.UTC(y, mo, d, h, mi, s)) : new Date(y, mo, d, h, mi, s);
  if (isNaN(date.getTime())) return null;
  return { date, allDay: false, utc: !!m[7], zone: !m[7] && params && params.TZID ? zoneFor(params.TZID) : null };
}

/** Comma-separated date lists (EXDATE / RDATE; a PERIOD "start/end" counts by its start). */
function parseDateList(value, params) {
  return String(value).split(',').map((v) => parseDate(v.split('/')[0], params)).filter(Boolean);
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
      // A date-only UNTIL includes that whole day. A timed one is a moment (usually
      // UTC); expandEvents turns it into the event's own wall-clock time.
      if (u) r.until = u.allDay ? { date: new Date(u.date.getFullYear(), u.date.getMonth(), u.date.getDate(), 23, 59, 59, 999), allDay: true, zone: null } : u;
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

/** An all-day date for the calendar day `d` shows on its own wall clock. */
const asDay = (x) => ({ date: new Date(x.date.getFullYear(), x.date.getMonth(), x.date.getDate()), allDay: true, zone: null });

/** The calendar's own name (X-WR-CALNAME), e.g. "Soccer" or, for a Google main calendar, the owner's email. */
export function calendarName(text) {
  const m = /(?:^|\n)X-WR-CALNAME[^:\n]*:([^\r\n]*)/i.exec(String(text || ''));
  return m ? unescapeText(m[1]).trim() : '';
}

/** All VEVENTs in the file, as plain objects (nothing expanded yet). */
export function parseEvents(text) {
  const out = [];
  const stack = [];
  let ev = null;
  // A Google main calendar is named after its owner's email: their declined invitations are hidden.
  const owner = calendarName(text).toLowerCase();
  unfold(text).forEach((raw) => {
    if (!raw) return;
    const line = parseLine(raw);
    if (!line) return;
    const val = line.value.trim();
    if (line.name === 'BEGIN') {
      stack.push(val.toUpperCase());
      if (val.toUpperCase() === 'VEVENT') {
        ev = { uid: '', title: '', location: '', status: '', start: null, end: null, duration: null,
          rrule: null, exdates: [], rdates: [], recurrenceId: null, declined: false, outlookAllDay: false };
      }
      return;
    }
    if (line.name === 'END') {
      const top = stack.pop();
      if (top === 'VEVENT' && ev) {
        // Outlook writes some all-day events as midnight-to-midnight times plus this flag.
        if (ev.outlookAllDay && ev.start && !ev.start.allDay) {
          ev.start = asDay(ev.start);
          if (ev.end) ev.end = asDay(ev.end);
          ev.duration = null;
        }
        if (ev.start) out.push(ev);
        ev = null;
      }
      return;
    }
    // Only properties directly inside a VEVENT (not its VALARMs).
    if (!ev || stack[stack.length - 1] !== 'VEVENT') return;
    const p = line.params;
    switch (line.name) {
      case 'X-MICROSOFT-CDO-ALLDAYEVENT':
      case 'X-MICROSOFT-MSNCALENDAR-ALLDAYEVENT':
        if (/^true$/i.test(val)) ev.outlookAllDay = true;
        break;
      case 'ATTENDEE':
        if (owner && /^declined$/i.test(p.PARTSTAT || '') && val.replace(/^mailto:/i, '').toLowerCase() === owner) ev.declined = true;
        break;
      case 'UID': ev.uid = val; break;
      case 'SUMMARY': ev.title = unescapeText(line.value).trim(); break;
      case 'LOCATION': ev.location = unescapeText(line.value).trim(); break;
      case 'STATUS': ev.status = val.toUpperCase(); break;
      case 'DTSTART': ev.start = parseDate(val, p); break;
      case 'DTEND': ev.end = parseDate(val, p); break;
      case 'DURATION': ev.duration = parseDuration(val); break;
      case 'RRULE': ev.rrule = parseRule(val); break;
      case 'EXDATE': ev.exdates = ev.exdates.concat(parseDateList(val, p)); break;
      case 'RDATE': ev.rdates = ev.rdates.concat(parseDateList(val, p)); break;
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
    if (e.declined) return; // the calendar's owner said no to this invitation
    const allDay = e.start.allDay;
    // Recurrences are worked out in the event's own wall-clock time (zone null = the
    // screen's own), then each occurrence is turned into the real moment.
    const zone = allDay ? null : e.start.zone;
    const s = e.start.date;
    const wall = (x) => ({ date: inZone(x, zone), allDay: x.allDay });

    // Length: whole days for all-day events (DTEND is exclusive), else milliseconds
    // between the real start and end (DTEND may name another zone, e.g. a flight).
    let spanDays = 0, spanMs = 0;
    const realStart = realOf(e.start);
    const endReal = e.end ? (e.end.allDay ? e.end.date : realOf(e.end)) : null;
    if (endReal && endReal > realStart) {
      if (allDay) spanDays = Math.max(1, dayNumber(e.end.date) - dayNumber(s));
      else spanMs = endReal - realStart;
    } else if (e.duration) {
      spanDays = Math.max(0, e.duration.days);
      spanMs = Math.max(0, e.duration.ms);
      if (allDay && !spanDays) spanDays = 1;
    } else if (allDay) {
      spanDays = 1;
    }

    const emit = (wallStart) => {
      const start = zone ? wallToReal(wallStart, zone) : wallStart;
      const end = spanDays
        ? new Date((zone ? wallToReal(addDays(wallStart, spanDays), zone) : addDays(wallStart, spanDays)).getTime() + spanMs)
        : new Date(start.getTime() + spanMs);
      const t = start.getTime();
      const overlaps = end.getTime() > t ? t < t1 && end.getTime() > t0 : t >= t0 && t < t1;
      if (overlaps) {
        out.push({ title: e.title || 'Busy', start, end, allDay, location: e.location, uid: e.uid });
      }
    };

    // A changed single instance is its own event.
    if (e.recurrenceId || !e.rrule) {
      if (!e.recurrenceId && e.rdates.length) {
        const skip = matcher(e.exdates.map(wall));
        [{ date: s }].concat(e.rdates.map(wall)).forEach((x) => { if (!skip(x.date, allDay)) emit(x.date); });
      } else {
        emit(s);
      }
      return;
    }

    const r = e.rrule;
    const excluded = matcher(e.exdates.concat(overrides[e.uid] || []).map(wall));
    const take = (d) => { if (!excluded(d, allDay)) emit(d); };
    // UNTIL: a UTC moment becomes the event's wall time; a date or floating time is read as it is.
    const until = !r.until ? null : r.until.allDay || !r.until.utc ? r.until.date : inZone(r.until, zone);

    if (['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].indexOf(r.freq) < 0) { take(s); return; }

    // DTSTART is always the first occurrence (and counts toward COUNT).
    let count = 1;
    take(s);
    e.rdates.map(wall).forEach((x) => { if (x.date - s !== 0) take(x.date); });

    // Wall-clock times can be up to a day off the real ones, so the end test allows a day.
    const t1Wall = t1 + DAY;
    let done = (r.count && count >= r.count);
    for (let i = 0, p = skipAhead(r, s, rangeStart, spanDays + Math.ceil(spanMs / DAY) + 1); i < MAX_PERIODS && !done; i++, p += r.interval) {
      const per = period(r, s, p);
      if (per.from.getTime() >= t1Wall) break;
      for (let k = 0; k < per.list.length; k++) {
        const c = per.list[k];
        if (c <= s) continue;
        if ((until && c > until) || c.getTime() >= t1Wall) { done = true; break; }
        count++;
        take(c);
        if (r.count && count >= r.count) { done = true; break; }
      }
    }
  });

  out.sort((a, b) => a.start - b.start || (b.allDay - a.allDay) || (a.title < b.title ? -1 : a.title > b.title ? 1 : 0));
  // The same event written twice (some exports repeat a meeting) shows once.
  return out.filter((x, i) => i === 0 || !(x.start - out[i - 1].start === 0 && x.title === out[i - 1].title && x.end - out[i - 1].end === 0));
}
