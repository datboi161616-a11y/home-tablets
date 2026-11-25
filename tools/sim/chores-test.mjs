// node tools/sim/chores-test.mjs
// "Chores that rotate" (js/services/chores-data.js) against answers worked out with a
// calendar: the days a chore falls on, whose turn it is, late chores, skipping, taking a
// tick back, and this month's count. (25 November 2026 is a Wednesday.)
globalThis.location = { search: '', hash: '' };
const store = {};
globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem(k, v) { store[k] = String(v); }, removeItem(k) { delete store[k]; }, key: () => null, length: 0 };
globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.dispatchEvent = () => {};
globalThis.Event = globalThis.Event || class { constructor(t) { this.type = t; } };
const ch = await import(new URL('../../js/services/chores-data.js', import.meta.url));

let bad = 0;
let n = 0;
function check(name, got, want) {
  n++;
  if (JSON.stringify(got) !== JSON.stringify(want)) { bad++; console.log(`FAIL  ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } else console.log(`ok    ${name}`);
}
const at = (day, h = 9) => { const p = day.split('-'); return new Date(+p[0], +p[1] - 1, +p[2], h).getTime(); };
const weekly = (days) => ({ kind: 'weekly', days });
const every = (k, unit) => ({ kind: 'every', n: k, unit });

// ---- days
check('25 Nov 2026 is a Wednesday', ch.weekday('2026-11-25'), 3);
check('6 days after 28 Nov is 4 Dec', ch.addDays('2026-11-28', 6), '2026-12-04');
check('a day after 28 Feb 2027 is 1 Mar (no leap day)', ch.addDays('2027-02-28', 1), '2027-03-01');
check('a day after 28 Feb 2028 is 29 Feb (leap year)', ch.addDays('2028-02-28', 1), '2028-02-29');
check('3 months after 30 Nov is 28 Feb', ch.addMonths('2026-11-30', 3), '2027-02-28');
check('1 month after 31 Jan 2028 is 29 Feb', ch.addMonths('2028-01-31', 1), '2028-02-29');
check('1 month after 15 Dec is 15 Jan next year', ch.addMonths('2026-12-15', 1), '2027-01-15');
check('across the clocks changing (14 Mar 2027): 13 to 15 Mar is 2 days', ch.daysBetween('2027-03-13', '2027-03-15'), 2);

// ---- the first time
check('Wednesdays, starting Wed 25 Nov: that day', ch.firstDue({ repeat: weekly([3]), start: '2026-11-25' }, '2026-11-25'), '2026-11-25');
check('Wednesdays, starting Thu 26 Nov: Wed 2 Dec', ch.firstDue({ repeat: weekly([3]), start: '2026-11-26' }, '2026-11-25'), '2026-12-02');
check('Mon and Thu, starting Wed 25 Nov: Thu 26 Nov', ch.firstDue({ repeat: weekly([1, 4]), start: '2026-11-25' }, '2026-11-25'), '2026-11-26');
check('every 3 months from 30 Nov: 30 Nov', ch.firstDue({ repeat: every(3, 'month'), start: '2026-11-30' }, '2026-11-25'), '2026-11-30');
check('every 3 days from 20 Nov, asked on the 25th: the 26th', ch.firstDue({ repeat: every(3, 'day'), start: '2026-11-20' }, '2026-11-25'), '2026-11-26');
check('every 2 weeks from 14 Nov, asked on the 25th: the 28th', ch.firstDue({ repeat: every(2, 'week'), start: '2026-11-14' }, '2026-11-25'), '2026-11-28');
check('every month from 31 Oct, asked on 25 Nov: 30 Nov', ch.firstDue({ repeat: every(1, 'month'), start: '2026-10-31' }, '2026-11-25'), '2026-11-30');

// ---- the next time
check('Wednesdays, done on the day: next Wednesday', ch.nextDue({ repeat: weekly([3]) }, '2026-11-25', '2026-11-25'), '2026-12-02');
check('Wednesdays, done two days late (Fri): still next Wednesday', ch.nextDue({ repeat: weekly([3]) }, '2026-11-25', '2026-11-27'), '2026-12-02');
check('Wednesdays, done eight days late (Thu 3 Dec): Wed 9 Dec', ch.nextDue({ repeat: weekly([3]) }, '2026-11-25', '2026-12-03'), '2026-12-09');
check('Mon and Thu, done Thu: Mon', ch.nextDue({ repeat: weekly([1, 4]) }, '2026-11-26', '2026-11-26'), '2026-11-30');
check('every day: tomorrow', ch.nextDue({ repeat: every(1, 'day') }, '2026-11-25', '2026-11-25'), '2026-11-26');
check('every 3 days, done a day late: 3 days after it was done', ch.nextDue({ repeat: every(3, 'day') }, '2026-11-25', '2026-11-26'), '2026-11-29');
check('every 2 weeks (Sat), done on Monday: the Saturday two weeks on', ch.nextDue({ repeat: every(2, 'week') }, '2026-11-28', '2026-11-30'), '2026-12-12');
check('every 2 weeks, three weeks late: the first of its Saturdays still ahead', ch.nextDue({ repeat: every(2, 'week') }, '2026-11-28', '2026-12-19'), '2026-12-26');
check('every 3 months from 30 Nov: 28 Feb', ch.nextDue({ repeat: every(3, 'month') }, '2026-11-30', '2026-11-30'), '2027-02-28');
check('done early (Mon for Wed): the Wednesday after that one', ch.nextDue({ repeat: weekly([3]) }, '2026-11-25', '2026-11-23'), '2026-12-02');

// ---- turns
const bins = { id: 'b', name: 'Bins to the curb', art: 'bins', size: 1, evening: true, repeat: weekly([3]), start: '2026-11-25', turns: ['Jordan', 'Alex'], next: '2026-11-25', turn: 0 };
const laundry = { id: 'l', name: 'Laundry', art: 'laundry', size: 2, evening: false, repeat: weekly([3, 6]), start: '2026-11-25', turns: ['Alex', 'Jordan'], next: '2026-11-25', turn: 0 };
const dust = { id: 'd', name: 'Dust', art: 'tidy', size: 1, evening: false, repeat: every(1, 'day'), start: '2026-11-25', turns: [], next: '2026-11-25', turn: 0 };
check('turn 0 of Jordan, Alex', ch.whoAt(bins, 0), 'Jordan');
check('turn 3 of Jordan, Alex', ch.whoAt(bins, 3), 'Alex');
check('no turns: nobody', ch.whoAt(dust, 5), '');
check('Jordan taken out of Settings: Alex every time', ch.whoAt(bins, 0, ['Alex']), 'Alex');
check('five people, turn 7 is the third', ch.whoAt({ turns: ['Dana', 'Chris', 'Maya', 'Eli', 'Noor'] }, 7), 'Maya');
check('laundry over the week from Wed 25 Nov', ch.project(laundry, '2026-11-25', '2026-12-01').map((x) => `${x.date} ${x.who}`), ['2026-11-25 Alex', '2026-11-28 Jordan']);
check('bins three weeks ahead', ch.project(bins, '2026-11-25', '2026-12-09').map((x) => `${x.date} ${x.who}`), ['2026-11-25 Jordan', '2026-12-02 Alex', '2026-12-09 Jordan']);
check('late bins (it is Friday): shown late, then next Wednesday', ch.project(bins, '2026-11-27', '2026-12-03').map((x) => `${x.date} ${x.who} ${x.late}`), ['2026-11-25 Jordan true', '2026-12-02 Alex false']);

// ---- ticking, skipping, taking it back
const s = { v: 1, chores: [bins, laundry, dust], log: [] };
check('today (Wed): evening chores after the others', ch.todayList(s, '2026-11-25').map((x) => x.chore.name), ['Laundry', 'Dust', 'Bins to the curb']);
const s1 = ch.settle(s, 'l', { now: at('2026-11-25', 7) });
check('ticking does not change what it was given', s.log.length, 0);
check('laundry ticked: Alex gets it', [s1.log[0].who, s1.log[0].size, s1.log[0].kind], ['Alex', 2, 'done']);
check('laundry is next on Saturday, Jordan’s turn', [s1.chores[1].next, ch.whoAt(s1.chores[1], s1.chores[1].turn)], ['2026-11-28', 'Jordan']);
check('today now: two to do, then the ticked one', ch.todayList(s1, '2026-11-25').map((x) => `${x.done ? 'done ' : ''}${x.done ? x.done.name : x.chore.name}`), ['Dust', 'Bins to the curb', 'done Laundry']);
const s2 = ch.settle(s1, 'b', { who: 'Alex', now: at('2026-11-25', 20) });
check('someone else did the bins: Alex gets it, and it is still Alex next week', [s2.log[1].who, s2.chores[0].next, ch.whoAt(s2.chores[0], s2.chores[0].turn)], ['Alex', '2026-12-02', 'Alex']);
const s3 = ch.settle(s2, 'd', { kind: 'skip', now: at('2026-11-25', 21) });
check('dust skipped: nobody gets it, tomorrow again', [s3.log[2].who, s3.log[2].kind, s3.chores[2].next], ['', 'skip', '2026-11-26']);
check('November so far', ch.tally(s3.log, '2026-11'), { Alex: { count: 2, points: 3 } });
check('nothing in December', ch.tally(s3.log, '2026-12'), {});
const s4 = ch.unsettle(s3, s1.log[0].id);
check('laundry tick taken back: Alex’s turn today again', [s4.log.length, s4.chores[1].next, ch.whoAt(s4.chores[1], s4.chores[1].turn)], [2, '2026-11-25', 'Alex']);
check('…and the count goes down', ch.tally(s4.log, '2026-11'), { Alex: { count: 1, points: 1 } });
// Late: nobody touched the bins until Friday.
const late = ch.todayList(s, '2026-11-27');
check('on Friday everything from Wednesday is late', late.map((x) => `${x.chore.name} ${x.late} ${x.due}`), ['Laundry true 2026-11-25', 'Dust true 2026-11-25', 'Bins to the curb true 2026-11-25']);
const mixed = ch.todayList({ v: 1, chores: [Object.assign({}, dust, { next: '2026-11-27' }), bins], log: [] }, '2026-11-27');
check('a late chore comes before one due today', mixed.map((x) => x.chore.name), ['Bins to the curb', 'Dust']);
const s5 = ch.settle(s, 'b', { now: at('2026-11-27') });
check('ticked late on Friday: it counts for Jordan, next is Wed 2 Dec for Alex', [s5.log[0].who, s5.chores[0].next, ch.whoAt(s5.chores[0], s5.chores[0].turn)], ['Jordan', '2026-12-02', 'Alex']);
// The month turns over.
const s6 = ch.settle(s5, 'b', { now: at('2026-12-02') });
check('December has its own count', [ch.tally(s6.log, '2026-11'), ch.tally(s6.log, '2026-12')], [{ Jordan: { count: 1, points: 1 } }, { Alex: { count: 1, points: 1 } }]);
// A whole month of rotation among five.
let five = { v: 1, chores: [{ id: 'x', name: 'Dishes', art: 'dishes', size: 1, evening: true, repeat: every(1, 'day'), start: '2026-11-01', turns: ['Dana', 'Chris', 'Maya', 'Eli', 'Noor'], next: '2026-11-01', turn: 0 }], log: [] };
for (let d = 1; d <= 30; d++) five = ch.settle(five, 'x', { now: at(`2026-11-${d < 10 ? '0' : ''}${d}`, 19) });
const fiveTally = ch.tally(five.log, '2026-11');
check('30 days of dishes among five: six each', Object.keys(fiveTally).map((k) => fiveTally[k].count), [6, 6, 6, 6, 6]);
check('…and 1 December is Dana’s again', [five.chores[0].next, ch.whoAt(five.chores[0], five.chores[0].turn)], ['2026-12-01', 'Dana']);

// ---- words and pictures
check('one weekday', ch.repeatWords(weekly([3])), 'Wednesdays');
check('two weekdays, in week order', ch.repeatWords(weekly([4, 1])), 'Mon, Thu');
check('all seven', ch.repeatWords(weekly([0, 1, 2, 3, 4, 5, 6])), 'Every day');
check('every 3 months', ch.repeatWords(every(3, 'month')), 'Every 3 months');
check('every 1 week', ch.repeatWords(every(1, 'week')), 'Every week');
check('short date', ch.shortDate('2026-11-27'), 'Nov 27');
check('pictures by name', ['Bins to the curb', 'Wash the dishes', 'Fold the washing', 'Change the furnace filter', 'Mop the floor', 'Walk to the shop'].map(ch.artFor), ['bins', 'dishes', 'laundry', 'filter', 'vacuum', 'tidy']);

// ---- kept on the screen
store['chores.v1'] = '{not json';
check('a spoiled save reads as empty', ch.load(), { v: 1, chores: [], log: [] });
const added = ch.addChore({ name: '  Bins to the curb ', size: 1, evening: true, repeat: weekly([3]), start: '2026-11-25', turns: ['Jordan', 'Alex'] }, new Date(at('2026-11-25')));
check('added: trimmed, pictured, due on its first day', [added.name, added.art, added.next, added.turn], ['Bins to the curb', 'bins', '2026-11-25', 0]);
check('a chore with no name is not added', ch.addChore({ name: '  ', size: 1, repeat: weekly([3]), start: '2026-11-25', turns: [] }), null);
ch.updateChore(added.id, { name: 'Bins', size: 3, evening: true, repeat: weekly([5]), start: '2026-11-25', turns: ['Jordan', 'Alex'] }, new Date(at('2026-11-25')));
check('moved to Fridays: next is Fri 27 Nov', [ch.load().chores[0].name, ch.load().chores[0].size, ch.load().chores[0].next], ['Bins', 3, '2026-11-27']);
ch.removeChore(added.id);
check('removed', ch.load().chores.length, 0);

console.log(bad ? `${bad} of ${n} FAILED` : `all ${n} chores answers right`);
process.exit(bad ? 1 : 0);
