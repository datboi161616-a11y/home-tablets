// node tools/sim/photoweek-test.mjs
// "Photo of the week" (js/services/photoweek-data.js) against a wall calendar: which week a
// day is in, its number and month, how many weeks a year has, when Home asks, when the
// year's slideshow is offered, and that a pick whose photo left the album shows as empty.
globalThis.location = { search: '', hash: '' };
const store = {};
globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem(k, v) { store[k] = String(v); }, removeItem(k) { delete store[k]; }, key: () => null, length: 0 };
globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.dispatchEvent = () => {};
const pw = await import(new URL('../../js/services/photoweek-data.js', import.meta.url));

let bad = 0;
let n = 0;
function check(name, got, want) {
  n++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { bad++; console.log(`FAIL  ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } else console.log(`ok    ${name}`);
}
const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h).getTime();
const info = (y, m, d, ws) => { const i = pw.weekInfo(pw.weekStartOf(at(y, m, d), ws)); return [i.year, i.week, i.month + 1]; };

// ---- which week a day is in ----
check('Wed Nov 25 2026, Monday weeks: starts Nov 23', pw.weekKey(at(2026, 11, 25), 1), '2026-11-23');
check('Wed Nov 25 2026, Sunday weeks: starts Nov 22', pw.weekKey(at(2026, 11, 25), 0), '2026-11-22');
check('Sun Nov 29 2026 is the last day of a Monday week', pw.weekKey(at(2026, 11, 29, 23), 1), '2026-11-23');
check('Sun Nov 29 2026 is the first day of a Sunday week', pw.weekKey(at(2026, 11, 29, 0), 0), '2026-11-29');
check('Mon Nov 23 just after midnight', pw.weekKey(at(2026, 11, 23, 0), 1), '2026-11-23');
check('the key reads back as that day', pw.dayKey(pw.keyStart('2026-11-23')), '2026-11-23');
check('not a key', isNaN(pw.keyStart('2026-W48')), true);

// ---- number, year and month (the week's fourth day decides) ----
check('Nov 23-29 2026 is week 48 (in November)', info(2026, 11, 25, 1), [2026, 48, 11]);
check('Thu Jan 1 2026 is in week 1 of 2026', info(2026, 1, 1, 1), [2026, 1, 1]);
check('Mon Dec 29 2025 already belongs to 2026', info(2025, 12, 29, 1), [2026, 1, 1]);
check('Fri Jan 1 2027 still belongs to 2026: week 53', info(2027, 1, 1, 1), [2026, 53, 12]);
check('Mon Jan 4 2027 is week 1 of 2027', info(2027, 1, 4, 1), [2027, 1, 1]);
check('Mon Nov 30 2026 (Nov 30 - Dec 6) counts as December', info(2026, 11, 30, 1), [2026, 49, 12]);
check('Sunday weeks: Nov 22-28 2026 is week 47', info(2026, 11, 25, 0), [2026, 47, 11]);
check('Sunday weeks: Dec 28 2025 - Jan 3 2026 belongs to 2025', info(2026, 1, 1, 0), [2025, 53, 12]);

// ---- a whole year ----
const y26 = pw.weeksOfYear(2026, 1);
check('2026 has 53 Monday weeks', y26.length, 53);
check('...from Dec 29 2025', y26[0].key, '2025-12-29');
check('...to the one starting Dec 28 2026', [y26[52].key, pw.dayKey(y26[52].end)], ['2026-12-28', '2027-01-03']);
check('2027 has 52', pw.weeksOfYear(2027, 1).length, 52);
check('2025 has 52', pw.weeksOfYear(2025, 1).length, 52);
check('2026 has 52 Sunday weeks', pw.weeksOfYear(2026, 0).length, 52);
check('2025 has 53 Sunday weeks', pw.weeksOfYear(2025, 0).length, 53);
const perMonth = (list) => { const c = new Array(12).fill(0); list.forEach((w) => c[w.month]++); return c; };
check('weeks per month, 2026 (a month has as many as it has Thursdays)', perMonth(y26), [5, 4, 4, 5, 4, 4, 5, 4, 4, 5, 4, 5]);
check('numbered 1 to 53 in order', y26.every((w, i) => w.week === i + 1 && (!i || w.start > y26[i - 1].start)), true);
check('every week starts the day after the one before ends (clock changes included)', y26.every((w, i) => !i || pw.dayKey(w.start - 12 * 3600e3) === pw.dayKey(y26[i - 1].end)), true);
check('the range in words', pw.weekRange(pw.keyStart('2026-11-23')), 'Nov 23 – 29');
check('...across two months', pw.weekRange(pw.keyStart('2026-11-30')), 'Nov 30 – Dec 6');

// ---- when Home asks ----
check('Sunday, Monday weeks: asks about the week ending today', pw.askWeek(at(2026, 11, 29, 9), 1), '2026-11-23');
check('Monday after: still that week', pw.askWeek(at(2026, 11, 30, 9), 1), '2026-11-23');
check('Tuesday: no longer', pw.askWeek(at(2026, 12, 1, 9), 1), null);
check('Saturday: not yet', pw.askWeek(at(2026, 11, 28, 20), 1), null);
check('Sunday, Sunday weeks: asks about the week that ended yesterday', pw.askWeek(at(2026, 11, 29, 9), 0), '2026-11-22');
check('Monday, Sunday weeks: the same one', pw.askWeek(at(2026, 11, 30, 9), 0), '2026-11-22');

// ---- when the year plays ----
check('Dec 27: not yet', pw.showYear(at(2026, 12, 27)), null);
check('Dec 28: Our 2026', pw.showYear(at(2026, 12, 28, 0)), 2026);
check('Dec 31', pw.showYear(at(2026, 12, 31, 20)), 2026);
check('Jan 7 2027: still Our 2026', pw.showYear(at(2027, 1, 7, 23)), 2026);
check('Jan 8 2027: over', pw.showYear(at(2027, 1, 8, 0)), null);

// ---- the album by week ----
const album = [
  { id: 'a', added: at(2026, 11, 23, 0) },   // the week's first moment
  { id: 'b', added: at(2026, 11, 26, 18) },
  { id: 'c', added: at(2026, 11, 29, 23) },  // its last evening
  { id: 'd', added: at(2026, 11, 30, 0) },   // next week
  { id: 'e', added: at(2026, 11, 22, 23) },  // the week before
  { id: 'f', added: at(2026, 7, 5, 10) },
];
check('Nov 23-29: three photos, newest first', pw.photosInWeek(album, pw.keyStart('2026-11-23')).map((p) => p.id), ['c', 'b', 'a']);
check('a week with none', pw.photosInWeek(album, pw.keyStart('2026-08-03')).length, 0);

// ---- picks ----
check('junk in storage is dropped', pw.tidyPicks({ '2026-11-23': { id: 'b', at: 5 }, nonsense: { id: 'x' }, '2026-11-16': null, '2026-11-09': { id: 7 } }, 1), { '2026-11-23': { id: 'b', at: 5 } });
check('weeks switched to Sunday: the pick moves to the week its Monday is in', pw.tidyPicks({ '2026-11-23': { id: 'b', at: 5 } }, 0), { '2026-11-22': { id: 'b', at: 5 } });
const many = {};
const weekNo = (i) => pw.dayKey(new Date(2020, 0, 6 + i * 7).getTime());
for (let i = 0; i < 200; i++) many[weekNo(i)] = { id: `p${i}`, at: i };
const kept = Object.keys(pw.tidyPicks(many, 1));
check('only the newest 160 weeks are kept', [kept.length, kept.indexOf(weekNo(199)) >= 0, kept.indexOf(weekNo(39)) >= 0], [160, true, false]);

// ---- the year so far (Wed Nov 25 2026) ----
const picked = { '2026-06-29': { id: 'f', at: 1 }, '2026-11-16': { id: 'gone', at: 2 }, '2026-11-23': { id: 'b', at: 3 } };
const slots = pw.yearSlots(2026, 1, picked, album, at(2026, 11, 25));
const slot = (key) => { const s = slots.find((x) => x.key === key); return [s.week, s.when, s.photo ? s.photo.id : null, s.open]; };
check('53 slots', slots.length, 53);
check('this week: picked', slot('2026-11-23'), [48, 'now', 'b', false]);
check('July 5 picked late into week 27', slot('2026-06-29'), [27, 'past', 'f', false]);
check('its photo left the album: empty again, and can be picked again (e is that week)', slot('2026-11-16'), [47, 'past', null, true]);
check('a past week with no photos: empty, nothing to pick', slot('2026-08-03'), [32, 'past', null, false]);
check('next week has a photo dated ahead: still waiting', slot('2026-11-30'), [49, 'ahead', null, false]);
check('picked so far', slots.filter((s) => s.photo).length, 2);
check('nothing picked, this week has photos: open', pw.yearSlots(2026, 1, {}, album, at(2026, 11, 25)).find((s) => s.key === '2026-11-23').open, true);

// ---- the menu card in early January: last year's slideshow is the way in ----
const first = pw.album()[0];
const year = new Date(first.added).getFullYear();
store['photoweek.v1'] = JSON.stringify({ v: 1, picks: { [pw.weekKey(first.added, 1)]: { id: first.id, at: 1 } } });
const jan = pw.menuCard(at(year + 1, 1, 5));
check('Jan 5: nothing picked this year yet, the button plays last year', [jan.lines[1], jan.action], [`0 of ${pw.weeksOfYear(year + 1, 1).length} weeks`, { label: `Our ${year}`, href: `#/photoweek/play/${year}` }]);
delete store['photoweek.v1'];

console.log(bad ? `\n${bad} of ${n} FAILED` : `${n}/${n} photo weeks right`);
process.exit(bad ? 1 : 0);
