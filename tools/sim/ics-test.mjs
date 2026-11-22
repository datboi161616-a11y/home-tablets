// node tools/sim/ics-test.mjs
//
// Checks the calendar-link reader (js/services/ics.js) on small feeds written here,
// shaped like real Google / iCloud / Outlook exports. Prints PASS/FAIL per case and
// exits non-zero when anything fails. Runs as if the screen sits in US Central time
// (America/Chicago), so time-zone conversions can be checked.
process.env.TZ = 'America/Chicago';

// ICS_FILE=/path/to/other/ics.js checks another copy (e.g. an older one) instead.
const icsUrl = process.env.ICS_FILE ? new URL(`file:///${process.env.ICS_FILE.replace(/\\/g, '/').replace(/^\//, '')}`).href : new URL('../../js/services/ics.js', import.meta.url).href;
const mod = await import(icsUrl);
const { expandEvents } = mod;
const calendarName = mod.calendarName || (() => '');

const cal = (body, head = '') => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//test//EN\r\n${head}${body}END:VCALENDAR\r\n`;
const ev = (lines) => `BEGIN:VEVENT\r\n${lines.join('\r\n')}\r\nEND:VEVENT\r\n`;
const D = (y, m, d, h = 0, mi = 0) => new Date(y, m - 1, d, h, mi);
const hm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const when = (e) => (e.allDay ? ymd(e.start) : `${ymd(e.start)} ${hm(e.start)}`);

let failed = 0, passed = 0;
function check(name, fn) {
  let ok = false, why = '';
  try {
    const r = fn();
    ok = r === true;
    if (!ok) why = typeof r === 'string' ? r : JSON.stringify(r);
  } catch (err) { why = String(err && err.stack || err); }
  if (ok) passed++; else failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      got: ${why}`}`);
}
const same = (got, want) => (JSON.stringify(got) === JSON.stringify(want) ? true : `${JSON.stringify(got)} (wanted ${JSON.stringify(want)})`);
const Y = [D(2026, 1, 1), D(2027, 12, 31)]; // a wide range

// ---------- Reading the text ----------

check('UTC "Z" time shows in the screen’s own time', () => {
  const r = expandEvents(cal(ev(['UID:1', 'SUMMARY:Call', 'DTSTART:20261203T180000Z', 'DTEND:20261203T190000Z'])), ...Y);
  return same(r.map(when), ['2026-12-03 12:00']);
});

check('folded lines (space and tab) are joined', () => {
  const r = expandEvents(cal(ev(['UID:1', 'SUMMARY:Grandma’s 80th birth', ' day par', '\tty', 'DTSTART:20261203T180000Z'])), ...Y);
  return same(r.map((e) => e.title), ['Grandma’s 80th birthday party']);
});

check('escaped commas, semicolons, backslashes and newlines', () => {
  const r = expandEvents(cal(ev(['UID:1', 'SUMMARY:Lunch\\, then shops\\; maybe', 'LOCATION:12 Oak St\\nSpringfield\\\\IL', 'DTSTART:20261203T180000Z'])), ...Y);
  return same([r[0].title, r[0].location], ['Lunch, then shops; maybe', '12 Oak St\nSpringfield\\IL']);
});

check('LF-only and CR-only line ends', () => {
  const lf = cal(ev(['UID:1', 'SUMMARY:A', 'DTSTART:20261203T180000Z'])).replace(/\r\n/g, '\n');
  const cr = cal(ev(['UID:2', 'SUMMARY:B', 'DTSTART:20261203T180000Z'])).replace(/\r\n/g, '\r');
  return same(expandEvents(lf, ...Y).map((e) => e.title).concat(expandEvents(cr, ...Y).map((e) => e.title)), ['A', 'B']);
});

check('no SUMMARY (a private event) reads “Busy”', () => same(expandEvents(cal(ev(['UID:1', 'DTSTART:20261203T180000Z'])), ...Y).map((e) => e.title), ['Busy']));

check('a reminder’s own SUMMARY doesn’t replace the event’s', () => {
  const r = expandEvents(cal(ev(['UID:1', 'SUMMARY:Dentist', 'DTSTART:20261203T180000Z', 'BEGIN:VALARM', 'ACTION:DISPLAY', 'SUMMARY:Reminder', 'TRIGGER:-PT30M', 'END:VALARM'])), ...Y);
  return same(r.map((e) => e.title), ['Dentist']);
});

check('calendar’s own name (X-WR-CALNAME)', () => same(calendarName(cal('', 'X-WR-CALNAME:Soccer\\, Spring\r\n')), 'Soccer, Spring'));

// ---------- All-day and multi-day ----------

check('all-day event (VALUE=DATE), DTEND is the day after', () => {
  const r = expandEvents(cal(ev(['UID:1', 'SUMMARY:Trip', 'DTSTART;VALUE=DATE:20261224', 'DTEND;VALUE=DATE:20261227'])), ...Y);
  return same([r.length, r[0].allDay, ymd(r[0].start), ymd(r[0].end)], [1, true, '2026-12-24', '2026-12-27']);
});

check('all-day event with no DTEND lasts one day', () => {
  const r = expandEvents(cal(ev(['UID:1', 'SUMMARY:Day off', 'DTSTART;VALUE=DATE:20261224'])), ...Y);
  return same([ymd(r[0].start), ymd(r[0].end)], ['2026-12-24', '2026-12-25']);
});

check('Outlook all-day flag on midnight-to-midnight times', () => {
  const r = expandEvents(cal(ev(['UID:1', 'SUMMARY:Holiday', 'DTSTART;TZID="Eastern Standard Time":20261225T000000',
    'DTEND;TZID="Eastern Standard Time":20261226T000000', 'X-MICROSOFT-CDO-ALLDAYEVENT:TRUE'])), ...Y);
  return same([r.length, r[0].allDay, ymd(r[0].start), ymd(r[0].end)], [1, true, '2026-12-25', '2026-12-26']);
});

check('an event at midnight with no length is kept', () => {
  const r = expandEvents(cal(ev(['UID:1', 'SUMMARY:New year', 'DTSTART:20270101T000000'])), D(2027, 1, 1), D(2027, 1, 2));
  return same(r.map(when), ['2027-01-01 00:00']);
});

check('an event overlapping the start of the range is included', () => {
  const r = expandEvents(cal(ev(['UID:1', 'SUMMARY:Overnight', 'DTSTART:20261202T220000', 'DTEND:20261203T020000'])), D(2026, 12, 3), D(2026, 12, 4));
  return same(r.length, 1);
});

// ---------- Time zones ----------

check('TZID of the screen’s own zone keeps the time', () => {
  const r = expandEvents(cal(ev(['UID:1', 'SUMMARY:Practice', 'DTSTART;TZID=America/Chicago:20261203T183000'])), ...Y);
  return same(r.map(when), ['2026-12-03 18:30']);
});

check('TZID of another zone is converted (New York 7 PM = 6 PM here)', () => {
  const r = expandEvents(cal(ev(['UID:1', 'SUMMARY:Call Mom', 'DTSTART;TZID=America/New_York:20261203T190000', 'DTEND;TZID=America/New_York:20261203T200000'])), ...Y);
  return same([when(r[0]), hm(r[0].end)], ['2026-12-03 18:00', '19:00']);
});

check('Outlook Windows zone name ("Pacific Standard Time")', () => {
  const r = expandEvents(cal(ev(['UID:1', 'SUMMARY:Meeting', 'DTSTART;TZID=Pacific Standard Time:20261203T090000'])), ...Y);
  return same(r.map(when), ['2026-12-03 11:00']);
});

check('prefixed zone name (/mozilla.org/…/America/Denver)', () => {
  const r = expandEvents(cal(ev(['UID:1', 'SUMMARY:Meeting', 'DTSTART;TZID=/mozilla.org/20050126_1/America/Denver:20261203T090000'])), ...Y);
  return same(r.map(when), ['2026-12-03 10:00']);
});

check('Outlook display name "(UTC-05:00) Eastern Time (US & Canada)"', () => {
  const r = expandEvents(cal(ev(['UID:1', 'SUMMARY:Meeting', 'DTSTART;TZID="(UTC-05:00) Eastern Time (US & Canada)":20261203T090000'])), ...Y);
  return same(r.map(when), ['2026-12-03 08:00']);
});

check('unknown zone name is read as the screen’s own time', () => {
  const r = expandEvents(cal(ev(['UID:1', 'SUMMARY:Meeting', 'DTSTART;TZID=Custom Zone 7:20261203T090000'])), ...Y);
  return same(r.map(when), ['2026-12-03 09:00']);
});

check('a flight leaving New York and landing in Los Angeles is 6 hours long', () => {
  const r = expandEvents(cal(ev(['UID:1', 'SUMMARY:Flight', 'DTSTART;TZID=America/New_York:20261220T080000', 'DTEND;TZID=America/Los_Angeles:20261220T110000'])), ...Y);
  return same([when(r[0]), (r[0].end - r[0].start) / 3600000], ['2026-12-20 07:00', 6]);
});

check('a weekly New York event keeps New York time across daylight saving', () => {
  // Mar 1 and Mar 15 2027 straddle the change (Mar 14); both zones change together.
  const r = expandEvents(cal(ev(['UID:1', 'SUMMARY:Class', 'DTSTART;TZID=America/New_York:20270301T190000', 'RRULE:FREQ=WEEKLY;COUNT=3;INTERVAL=2'])), ...Y);
  return same(r.map(when), ['2027-03-01 18:00', '2027-03-15 18:00', '2027-03-29 18:00']);
});

check('a weekly Phoenix event moves by an hour here when daylight saving starts', () => {
  // Arizona has no daylight saving: 6 PM there is 7 PM Chicago in winter, 8 PM in summer.
  const r = expandEvents(cal(ev(['UID:1', 'SUMMARY:Call', 'DTSTART;TZID=America/Phoenix:20270308T180000', 'RRULE:FREQ=WEEKLY;COUNT=2'])), ...Y);
  return same(r.map(when), ['2027-03-08 19:00', '2027-03-15 20:00']);
});

check('a local weekly event stays at 6:30 PM across daylight saving', () => {
  const r = expandEvents(cal(ev(['UID:1', 'SUMMARY:Practice', 'DTSTART:20261028T183000', 'RRULE:FREQ=WEEKLY;COUNT=3'])), ...Y);
  return same(r.map(when), ['2026-10-28 18:30', '2026-11-04 18:30', '2026-11-11 18:30']);
});

// ---------- Repeating events ----------

check('WEEKLY BYDAY=MO,WE COUNT=4', () => {
  const r = expandEvents(cal(ev(['UID:1', 'SUMMARY:Gym', 'DTSTART:20261130T070000', 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=4'])), ...Y);
  return same(r.map(when), ['2026-11-30 07:00', '2026-12-02 07:00', '2026-12-07 07:00', '2026-12-09 07:00']);
});

check('DAILY INTERVAL=2 UNTIL (UTC) for a New York event', () => {
  // UNTIL 2026-12-05 00:00Z = Dec 4 7 PM New York: the Dec 4 7 PM one is the last.
  const r = expandEvents(cal(ev(['UID:1', 'SUMMARY:Pills', 'DTSTART;TZID=America/New_York:20261130T190000', 'RRULE:FREQ=DAILY;INTERVAL=2;UNTIL=20261205T000000Z'])), ...Y);
  return same(r.map(when), ['2026-11-30 18:00', '2026-12-02 18:00', '2026-12-04 18:00']);
});

check('MONTHLY last Friday (BYDAY=-1FR)', () => {
  const r = expandEvents(cal(ev(['UID:1', 'SUMMARY:Book club', 'DTSTART:20261127T190000', 'RRULE:FREQ=MONTHLY;BYDAY=-1FR;COUNT=3'])), ...Y);
  return same(r.map(when), ['2026-11-27 19:00', '2026-12-25 19:00', '2027-01-29 19:00']);
});

check('MONTHLY on the 31st skips shorter months', () => {
  const r = expandEvents(cal(ev(['UID:1', 'SUMMARY:Rent', 'DTSTART;VALUE=DATE:20270131', 'RRULE:FREQ=MONTHLY;COUNT=3'])), ...Y);
  return same(r.map(when), ['2027-01-31', '2027-03-31', '2027-05-31']);
});

check('YEARLY all-day birthday started long ago', () => {
  const r = expandEvents(cal(ev(['UID:1', 'SUMMARY:Dad’s birthday', 'DTSTART;VALUE=DATE:19560704', 'RRULE:FREQ=YEARLY'])), D(2027, 1, 1), D(2028, 1, 1));
  return same(r.map(when), ['2027-07-04']);
});

check('YEARLY Thanksgiving (BYMONTH=11;BYDAY=4TH)', () => {
  const r = expandEvents(cal(ev(['UID:1', 'SUMMARY:Thanksgiving', 'DTSTART;VALUE=DATE:20201126', 'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=4TH'])), D(2026, 1, 1), D(2028, 1, 1));
  return same(r.map(when), ['2026-11-26', '2027-11-25']);
});

check('COUNT already used up long before the range shows nothing', () => {
  const r = expandEvents(cal(ev(['UID:1', 'SUMMARY:Course', 'DTSTART:20200106T090000', 'RRULE:FREQ=WEEKLY;COUNT=10'])), ...Y);
  return same(r.length, 0);
});

check('EXDATE (comma list, many lines, date-only and TZID forms)', () => {
  const r = expandEvents(cal(ev(['UID:1', 'SUMMARY:Piano', 'DTSTART;TZID=America/Chicago:20261201T160000', 'RRULE:FREQ=DAILY;COUNT=6',
    'EXDATE;TZID=America/Chicago:20261202T160000,20261203T160000', 'EXDATE;VALUE=DATE:20261205'])), ...Y);
  return same(r.map(when), ['2026-12-01 16:00', '2026-12-04 16:00', '2026-12-06 16:00']);
});

check('EXDATE in UTC removes the matching New York occurrence', () => {
  const r = expandEvents(cal(ev(['UID:1', 'SUMMARY:Call', 'DTSTART;TZID=America/New_York:20261201T190000', 'RRULE:FREQ=DAILY;COUNT=3', 'EXDATE:20261203T000000Z'])), ...Y);
  return same(r.map(when), ['2026-12-01 18:00', '2026-12-03 18:00']);
});

check('RECURRENCE-ID: one moved and one cancelled occurrence', () => {
  const r = expandEvents(cal(
    ev(['UID:s1', 'SUMMARY:Lesson', 'DTSTART;TZID=America/New_York:20261201T170000', 'RRULE:FREQ=WEEKLY;COUNT=3']) +
    ev(['UID:s1', 'SUMMARY:Lesson (moved)', 'RECURRENCE-ID;TZID=America/New_York:20261208T170000', 'DTSTART;TZID=America/New_York:20261209T170000']) +
    ev(['UID:s1', 'SUMMARY:Lesson', 'STATUS:CANCELLED', 'RECURRENCE-ID:20261215T220000Z', 'DTSTART:20261215T220000Z'])), ...Y);
  return same(r.map((e) => `${when(e)} ${e.title}`), ['2026-12-01 16:00 Lesson', '2026-12-09 16:00 Lesson (moved)']);
});

check('a cancelled event isn’t shown', () => same(expandEvents(cal(ev(['UID:1', 'SUMMARY:Party', 'STATUS:CANCELLED', 'DTSTART:20261203T180000Z'])), ...Y).length, 0));

check('RDATE extra dates, including the PERIOD form', () => {
  const r = expandEvents(cal(ev(['UID:1', 'SUMMARY:Visit', 'DTSTART:20261201T100000', 'RDATE:20261205T100000', 'RDATE;VALUE=PERIOD:20261210T100000/PT2H'])), ...Y);
  return same(r.map(when), ['2026-12-01 10:00', '2026-12-05 10:00', '2026-12-10 10:00']);
});

check('Feb 29 yearly only on leap years', () => {
  const r = expandEvents(cal(ev(['UID:1', 'SUMMARY:Leap', 'DTSTART;VALUE=DATE:20240229', 'RRULE:FREQ=YEARLY'])), D(2026, 1, 1), D(2029, 1, 1));
  return same(r.map(when), ['2028-02-29']);
});

check('daily event far in the past is quick and correct a year ahead', () => {
  const t = Date.now();
  const r = expandEvents(cal(ev(['UID:1', 'SUMMARY:Walk', 'DTSTART:20100101T070000', 'RRULE:FREQ=DAILY'])), D(2027, 6, 1), D(2027, 6, 8));
  return same([r.length, when(r[0]), Date.now() - t < 500], [7, '2027-06-01 07:00', true]);
});

// ---------- Invitations ----------

check('an invitation the calendar’s owner declined is hidden', () => {
  const head = 'X-WR-CALNAME:pat@example.com\r\n';
  const r = expandEvents(cal(
    ev(['UID:1', 'SUMMARY:Declined', 'DTSTART:20261203T180000Z', 'ATTENDEE;CN=Pat;PARTSTAT=DECLINED:mailto:pat@example.com', 'ATTENDEE;PARTSTAT=ACCEPTED:mailto:sam@example.com']) +
    ev(['UID:2', 'SUMMARY:Someone else declined', 'DTSTART:20261203T190000Z', 'ATTENDEE;PARTSTAT=ACCEPTED:mailto:Pat@Example.com', 'ATTENDEE;PARTSTAT=DECLINED:mailto:sam@example.com']), head), ...Y);
  return same(r.map((e) => e.title), ['Someone else declined']);
});

check('the same event written twice shows once', () => {
  const one = ['UID:1', 'SUMMARY:Dinner', 'DTSTART:20261203T180000Z', 'DTEND:20261203T190000Z'];
  return same(expandEvents(cal(ev(one) + ev(one)), ...Y).length, 1);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
