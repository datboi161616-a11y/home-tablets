// node tools/sim/datenight-test.mjs
// The date night jar (js/services/datenight-data.js) against answers worked out by hand:
// which ideas fit the switches, "Pick again" not repeating, the evening a date night goes
// on, when one counts as done, and how its day is said.
globalThis.location = { search: '', hash: '' };
const store = {};
globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem(k, v) { store[k] = String(v); }, removeItem(k) { delete store[k]; }, key: () => null, length: 0 };
globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.dispatchEvent = () => {};
if (typeof globalThis.Event === 'undefined') globalThis.Event = class { constructor(type) { this.type = type; } };
const dn = await import(new URL('../../js/services/datenight-data.js', import.meta.url));
const cal = await import(new URL('../../js/services/my-events.js', import.meta.url));

let bad = 0;
let n = 0;
function check(name, got, want) {
  n++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { bad++; console.log(`FAIL  ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } else console.log(`ok    ${name}`);
}
const iso = (d) => (d ? cal.isoDay(d) : null);

// ---- the starter jar ----
const all = dn.ideas();
check('60 ideas to start with', all.length, 60);
check('15 of each kind', ['in/cheap', 'in/fancy', 'out/cheap', 'out/fancy'].map((k) => all.filter((i) => `${i.where}/${i.cost}` === k).length), [15, 15, 15, 15]);
check('no two starters share a name or an id', [new Set(all.map((i) => i.title.toLowerCase())).size, new Set(all.map((i) => i.id)).size], [60, 60]);
check('every starter has its line and a length', all.every((i) => i.note && i.mins >= 30), true);

// ---- the switches ----
const pasta = { id: 'a', where: 'in', cost: 'cheap' };
check('Stay in + Cheap fits a cheap night in', dn.fits(pasta, { where: 'in', cost: 'cheap' }), true);
check('Go out does not', dn.fits(pasta, { where: 'out', cost: 'any' }), false);
check('Either + Either fits everything', dn.fits(pasta, { where: 'any', cost: 'any' }), true);
check('Stay in + Fancy does not', dn.fits(pasta, { where: 'in', cost: 'fancy' }), false);
dn.setFilter({ where: 'in' });
check('Stay in: 30 of the 60', dn.fitting().length, 30);
dn.setFilter({ cost: 'fancy' });
check('Stay in + Fancy: 15', dn.fitting().length, 15);
dn.setFilter({ where: 'any', cost: 'any' });
check('Either + Either: all 60', dn.fitting().length, 60);

// ---- picking ----
const five = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id }));
check('chance 0 takes the first', dn.choose(five, [], () => 0).id, 'a');
check('chance 0.99 takes the last', dn.choose(five, [], () => 0.99).id, 'e');
check('the last picks are left out', dn.choose(five, ['a', 'b'], () => 0).id, 'c');
check('only one idea: it comes again', dn.choose([{ id: 'a' }], ['a'], () => 0).id, 'a');
check('all picked lately: the oldest pick comes back first', dn.choose(five, ['c', 'a', 'e', 'b', 'd'], () => 0.5).id, 'c');
check('an empty jar gives nothing', dn.choose([], [], () => 0), null);
const pulled = [];
for (let i = 0; i < 6; i++) pulled.push(dn.pick(() => 0).id);
check('six pulls in a row: no repeat inside the last five', pulled, ['s01', 's02', 's03', 's04', 's05', 's06']);
check('…and the seventh may be the first again', dn.pick(() => 0).id, 's01');

// ---- the evening it goes on (November 2026: the 25th is a Wednesday) ----
const free = () => false;
const at = (d, h) => new Date(2026, 10, d, h);
check('Wed -> that Friday', iso(dn.nextFreeEvening(at(25, 10), free)), '2026-11-27');
check('Friday busy -> Saturday', iso(dn.nextFreeEvening(at(25, 10), (d) => d.getDate() === 27)), '2026-11-28');
check('Fri and Sat busy -> next Friday', iso(dn.nextFreeEvening(at(25, 10), (d) => d.getDate() === 27 || d.getDate() === 28)), '2026-12-04');
check('Friday morning -> tonight', iso(dn.nextFreeEvening(at(27, 9), free)), '2026-11-27');
check('Friday after 5 PM -> Saturday', iso(dn.nextFreeEvening(at(27, 18), free)), '2026-11-28');
check('Saturday night -> next Friday', iso(dn.nextFreeEvening(at(28, 20), free)), '2026-12-04');
check('every Fri and Sat busy -> the first free evening (tonight, Wed)', iso(dn.nextFreeEvening(at(25, 10), (d) => d.getDay() >= 5)), '2026-11-25');
check('everything busy -> the next Friday anyway', iso(dn.nextFreeEvening(at(25, 10), () => true)), '2026-11-27');
check('over the new year', iso(dn.nextFreeEvening(new Date(2026, 11, 30, 12), (d) => d.getFullYear() === 2026)), '2027-01-01');

// ---- done once its day has passed ----
const events = { e1: { date: '2026-11-27', time: '19:00' }, e2: { date: '2026-11-20', time: '19:00' }, e4: { date: '2026-12-05', time: '18:30' } };
const eventOf = (id) => events[id] || null;
const plans = [
  { id: 'p1', title: 'Pasta', date: '2026-11-27', time: '19:00', eventId: 'e1' },
  { id: 'p2', title: 'Bowling', date: '2026-11-20', time: '19:00', eventId: 'e2' },
  { id: 'p3', title: 'Taken off the calendar', date: '2026-11-28', time: '19:00', eventId: 'e3' },
  { id: 'p4', title: 'Moved on the calendar', date: '2026-11-21', time: '19:00', eventId: 'e4' },
  { id: 'p5', title: 'Long ago', date: '2026-10-17', time: '19:00', eventId: 'gone', done: true },
];
const on25 = dn.settle(plans, eventOf, '2026-11-25');
check('oldest first; the removed one is forgotten', on25.map((p) => p.id), ['p5', 'p2', 'p1', 'p4']);
check('done: only the ones before today', on25.filter((p) => p.done).map((p) => p.id), ['p5', 'p2']);
check('a moved one follows its event', [on25[3].date, on25[3].time], ['2026-12-05', '18:30']);
check('on its own day it is not done yet', dn.settle(plans, eventOf, '2026-11-27').find((p) => p.id === 'p1').done, undefined);
check('the day after, it is', dn.settle(plans, eventOf, '2026-11-28').find((p) => p.id === 'p1').done, true);
check('a done one stays although its event is long gone', dn.settle(on25, () => null, '2027-01-01').map((p) => p.id), ['p5', 'p2']);

// ---- words ----
const wed = new Date(2026, 10, 25, 10);
check('today', dn.whenWords({ date: '2026-11-25', time: '19:00' }, wed), 'Tonight 7 PM');
check('tomorrow', dn.whenWords({ date: '2026-11-26', time: '19:30' }, wed), 'Tomorrow 7:30 PM');
check('this week', dn.whenWords({ date: '2026-11-27', time: '19:00' }, wed), 'Fri 7 PM');
check('a week or more away', dn.whenWords({ date: '2026-12-12', time: '19:00' }, wed), 'Dec 12');
check('day words', [dn.dayWords('2026-11-14'), dn.longDayWords('2026-11-27')], ['Nov 14', 'Fri, Nov 27']);
check('what was typed is tidied', dn.tidyTitle('  ice   skating  '), 'Ice skating');

// ---- their own ideas, taking out and putting back ----
const mine = dn.saveIdea({ title: 'ice skating', where: 'out', cost: 'cheap' });
check('their own idea goes first', [dn.ideas()[0].title, dn.ideas()[0].mine, dn.ideas().length], ['Ice skating', true, 61]);
check('the same words again add nothing', [dn.saveIdea({ title: 'ICE skating', where: 'in', cost: 'fancy' }).id, dn.ideas().length], [mine.id, 61]);
check('nothing typed adds nothing', [dn.saveIdea({ title: '   ' }), dn.ideas().length], [null, 61]);
dn.saveIdea({ id: mine.id, title: 'Ice skating at dusk', where: 'out', cost: 'fancy' });
check('changed', [dn.getIdea(mine.id).title, dn.getIdea(mine.id).cost], ['Ice skating at dusk', 'fancy']);
const u1 = dn.removeIdea(mine.id);
const u2 = dn.removeIdea('s01');
check('one of theirs and a starter taken out', [dn.ideas().length, dn.getIdea('s01')], [59, null]);
dn.restoreIdea(u2);
dn.restoreIdea(u1);
check('Undo puts both back where they were', [dn.ideas().length, dn.ideas()[0].id, dn.ideas()[1].id], [61, mine.id, 's01']);

// ---- on the calendar for real (far ahead, so the answers never go stale: Wed June 1, 2095) ----
const far = new Date(2095, 5, 1, 10);
const plan = dn.planIdea(dn.getIdea('s01'), far);
const ev = cal.getMyEvent(plan.eventId);
check('the event: Friday 7 PM, two hours, going out', [ev.title, ev.date, ev.time, ev.minutes, ev.tag], ['Homemade pasta night', '2095-06-03', '19:00', 120, 'out']);
const second = dn.planIdea(dn.getIdea('s02'), far);
check('a second one takes Saturday (Friday is taken now)', second.date, '2095-06-04');
dn.unplan(second.id);
check('Undo takes it off the calendar too', [cal.getMyEvent(second.eventId), dn.plannedFor('s02')], [null, null]);
check('the menu card names the next one', dn.menuCard().lines, ['61 ideas', 'Jun 3 · Homemade pasta night']);
cal.removeMyEvent(plan.eventId);
check('removed on the calendar: forgotten here', [dn.plannedFor('s01'), dn.menuCard().lines], [null, ['61 ideas']]);
check('Home says nothing when no date night is today', dn.homeLine(), null);

console.log(bad ? `${bad} of ${n} FAILED` : `all ${n} date night checks pass`);
process.exit(bad ? 1 : 0);
