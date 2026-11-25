// node tools/sim/care-test.mjs
// Plants & pets (js/services/care-data.js) against answers worked out by hand: what is due,
// late or done at a given moment, where a date moves once the thing is done (every N days,
// monthly, yearly, across short months and a leap day), the order of today's care, and
// what Home and the menu card are told.
const store = {};
globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem(k, v) { store[k] = String(v); }, removeItem(k) { delete store[k]; } };
globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
let fired = 0;
globalThis.dispatchEvent = () => { fired++; };
const c = await import(new URL('../../js/services/care-data.js', import.meta.url));

let bad = 0;
let n = 0;
function check(name, got, want) {
  n++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { bad++; console.log(`FAIL  ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } else console.log(`ok    ${name}`);
}
const at = (y, m, d, h = 12, min = 0) => new Date(y, m - 1, d, h, min);
const NOW = at(2026, 11, 25, 17, 42); // Wednesday, November 25, 5:42 PM

// ---- days ----
check('day after Nov 30 is Dec 1', c.addDays('2026-11-30', 1), '2026-12-01');
check('7 days after Dec 28 is Jan 4', c.addDays('2026-12-28', 7), '2027-01-04');
check('Nov 23 to Nov 25 is 2 days', c.dayDiff('2026-11-23', '2026-11-25'), 2);
check('Oct 30 to Nov 2 is 3 days (the clocks go back in between)', c.dayDiff('2026-10-30', '2026-11-02'), 3);
check('Mar 6 to Mar 9 is 3 days (the clocks go forward in between)', c.dayDiff('2027-03-06', '2027-03-09'), 3);
check('Dec 30 to Jan 2 is 3 days', c.dayDiff('2026-12-30', '2027-01-02'), 3);
check('next 1st after Nov 25 is Dec 1', c.nextMonthly('2026-11-25', 1), '2026-12-01');
check('next 1st after Dec 1 is Jan 1', c.nextMonthly('2026-12-01', 1), '2027-01-01');
check('next 28th after Nov 25 is Nov 28', c.nextMonthly('2026-11-25', 28), '2026-11-28');
check('next 31st after Jan 31 is Feb 28 (2027 is not a leap year)', c.nextMonthly('2027-01-31', 31), '2027-02-28');
check('next 31st after Feb 28 is Mar 31 (it does not stay on the 28th)', c.nextMonthly('2027-02-28', 31), '2027-03-31');
check('next 31st after Feb 10, 2028 is Feb 29', c.nextMonthly('2028-02-10', 31), '2028-02-29');
check('a year after Feb 29, 2028 is Feb 28, 2029', c.addMonths('2028-02-29', 12), '2029-02-28');
check('a month after Jan 31 is Feb 28', c.addMonths('2027-01-31', 1), '2027-02-28');
check('Nov 28, 2026 is a Saturday', c.dayWords('2026-11-28', NOW), 'Sat, Nov 28');
check('a day in another year says which', c.dayWords('2027-06-12', NOW), 'Jun 12, 2027');

// ---- one task at one moment ----
const dinner = { id: 'f2', type: 'feed', mins: 17 * 60 + 30, last: null };
check('dinner at 5:30 PM, now 5:42 PM: due', c.taskState(dinner, NOW).state, 'due');
check('dinner at 5:30 PM, now 5:29 PM: later today', c.taskState(dinner, at(2026, 11, 25, 17, 29)).state, 'soon');
check('dinner at 5:30 PM, now exactly 5:30 PM: due', c.taskState(dinner, at(2026, 11, 25, 17, 30)).state, 'due');
check('dinner given at 5:35 PM today: done', c.taskState({ ...dinner, last: { at: +at(2026, 11, 25, 17, 35), who: '' } }, NOW).state, 'done');
check('dinner given yesterday 5:35 PM, now 5:42 PM: due again', c.taskState({ ...dinner, last: { at: +at(2026, 11, 24, 17, 35), who: 'Alex' } }, NOW).state, 'due');
check('dinner given at 11:50 PM, now 12:05 AM the next day: a new day', c.taskState({ ...dinner, last: { at: +at(2026, 11, 25, 23, 50), who: '' } }, at(2026, 11, 26, 0, 5)).state, 'soon');
const water = { id: 'w', type: 'water', every: 7, next: '2026-11-23', last: null };
check('water was for Nov 23, now Nov 25: 2 days late', c.taskState(water, NOW), { state: 'late', days: 2 });
check('water for today: due', c.taskState({ ...water, next: '2026-11-25' }, NOW), { state: 'due', days: 0 });
check('water for today, one minute past midnight: due', c.taskState({ ...water, next: '2026-11-25' }, at(2026, 11, 25, 0, 1)).state, 'due');
check('water for Nov 28: in 3 days', c.taskState({ ...water, next: '2026-11-28' }, NOW), { state: 'later', days: 3 });
check('water for Nov 30, now Dec 2 (over the month end): 2 days late', c.taskState({ ...water, next: '2026-11-30' }, at(2026, 12, 2)), { state: 'late', days: 2 });
check('water for Dec 31, now Jan 1 (over the year end): 1 day late', c.taskState({ ...water, next: '2026-12-31' }, at(2027, 1, 1)), { state: 'late', days: 1 });
check('1 day late is worded "1 day late"', c.lateWords(1), '1 day late');
check('2 days late is worded "2 days late"', c.lateWords(2), '2 days late');

// ---- once it is done ----
const watered = c.afterDone(water, 'Alex', NOW);
check('watered 2 days late on Nov 25, every 7 days: next Dec 2', watered.next, '2026-12-02');
check('...and who did it is remembered', watered.last, { at: +NOW, who: 'Alex' });
check('...and it shows as done today', c.taskState(watered, NOW).state, 'done');
check('...and tomorrow it is just "later", in 6 days', c.taskState(watered, at(2026, 11, 26)), { state: 'later', days: 6 });
check('watered early (was for Nov 28), every 7 days: next Dec 2', c.afterDone({ ...water, next: '2026-11-28' }, '', NOW).next, '2026-12-02');
check('basil every 2 days watered Nov 30: next Dec 2', c.afterDone({ ...water, every: 2, next: '2026-11-30' }, '', at(2026, 11, 30)).next, '2026-12-02');
const flea = { id: 'fl', type: 'flea', next: '2026-12-01', dom: 1, last: null };
check('flea & tick for Dec 1, done on Dec 1: next Jan 1', c.afterDone(flea, '', at(2026, 12, 1)).next, '2027-01-01');
check('flea & tick for Dec 1, done 3 days late: still Jan 1', c.afterDone(flea, '', at(2026, 12, 4)).next, '2027-01-01');
check('flea & tick for Dec 1, done 2 days early: Jan 1 (not Dec 1 again)', c.afterDone(flea, '', at(2026, 11, 29)).next, '2027-01-01');
check('flea & tick for Dec 1, done 5 weeks late (Jan 5): next Feb 1', c.afterDone(flea, '', at(2027, 1, 5)).next, '2027-02-01');
check('flea & tick on the 31st, done Jan 31: next Feb 28', c.afterDone({ ...flea, next: '2027-01-31', dom: 31 }, '', at(2027, 1, 31)).next, '2027-02-28');
check('...done Feb 28: next Mar 31', c.afterDone({ ...flea, next: '2027-02-28', dom: 31 }, '', at(2027, 2, 28)).next, '2027-03-31');
const vet = { id: 'v', type: 'vet', next: '2026-12-14', last: null };
check('vet for Dec 14, done Dec 14: next Dec 14, 2027', c.afterDone(vet, 'Jordan', at(2026, 12, 14)).next, '2027-12-14');
check('vet done on Feb 29, 2028: next Feb 28, 2029', c.afterDone({ ...vet, next: '2028-02-29' }, '', at(2028, 2, 29)).next, '2029-02-28');
check('a feed has no date to move', 'next' in c.afterDone(dinner, '', NOW), false);

// ---- the household of the design boards, Wednesday Nov 25, 5:42 PM ----
const items = [
  { id: 'biscuit', kind: 'pet', name: 'Biscuit', look: 'dog', sub: 'Golden retriever · 4', notes: '', photo: null, tasks: [
    { id: 'f1', type: 'feed', mins: 450, last: { at: +at(2026, 11, 25, 7, 40), who: 'Jordan' } },
    { id: 'f2', type: 'feed', mins: 1050, last: { at: +at(2026, 11, 24, 17, 35), who: 'Alex' } },
    { id: 'fl', type: 'flea', next: '2026-12-01', dom: 1, last: { at: +at(2026, 11, 1), who: 'Alex' } },
    { id: 'v', type: 'vet', next: '2027-06-12', last: null }] },
  { id: 'monstera', kind: 'plant', name: 'Monstera', look: 'monstera', sub: '', notes: '', photo: null, tasks: [{ id: 'w', type: 'water', every: 7, next: '2026-11-23', last: null }] },
  { id: 'basil', kind: 'plant', name: 'Basil', look: 'herb', sub: '', notes: '', photo: null, tasks: [{ id: 'w', type: 'water', every: 2, next: '2026-11-27', last: { at: +at(2026, 11, 25, 17, 41), who: '' } }] },
  { id: 'pepper', kind: 'pet', name: 'Pepper', look: 'cat', sub: '', notes: '', photo: null, tasks: [
    { id: 'f1', type: 'feed', mins: 420, last: { at: +at(2026, 11, 25, 7, 12), who: 'Jordan' } },
    { id: 'v', type: 'vet', next: '2026-12-14', last: null }] },
  { id: 'fig', kind: 'plant', name: 'Fiddle-leaf fig', look: 'fig', sub: '', notes: '', photo: null, tasks: [{ id: 'w', type: 'water', every: 7, next: '2026-12-02', last: { at: +at(2026, 11, 25, 9, 5), who: 'Alex' } }] },
  { id: 'snake', kind: 'plant', name: 'Snake plant', look: 'snake', sub: '', notes: '', photo: null, tasks: [{ id: 'w', type: 'water', every: 14, next: '2026-11-28', last: null }] },
  { id: 'pothos', kind: 'plant', name: 'Pothos', look: 'pothos', sub: '', notes: '', photo: null, tasks: [{ id: 'w', type: 'water', every: 7, next: '2026-11-29', last: null }] },
];
check('today: due first, then late, then done in the order they were done',
  c.todayList(items, NOW).map((e) => `${e.key} ${e.state}`),
  ['biscuit:f2 due', 'monstera:w late', 'pepper:f1 done', 'biscuit:f1 done', 'fig:w done', 'basil:w done']);
check('the same morning at 6:50 AM: nothing due yet, the late plant first, then the feeds in clock order',
  c.todayList(items.map((x) => ({ ...x, tasks: x.tasks.map((t) => ({ ...t, last: null })) })), at(2026, 11, 25, 6, 50)).map((e) => `${e.key} ${e.state}`),
  ['monstera:w late', 'pepper:f1 soon', 'biscuit:f1 soon', 'biscuit:f2 soon']);
check('two late plants: the one that has waited longest first',
  c.todayList([items[1], { ...items[5], tasks: [{ ...items[5].tasks[0], next: '2026-11-20' }] }], NOW).map((e) => `${e.item.name} ${e.days}`), ['Snake plant 5', 'Monstera 2']);
check('coming up, soonest first', c.comingUp(items, NOW).map((e) => `${e.date} ${e.item.name} ${c.taskName(e.task)}`),
  ['2026-11-27 Basil Water', '2026-11-28 Snake plant Water', '2026-11-29 Pothos Water', '2026-12-01 Biscuit Flea & tick', '2026-12-02 Fiddle-leaf fig Water', '2026-12-14 Pepper Vet checkup', '2027-06-12 Biscuit Vet checkup']);
check('a week on (Dec 2, 8 AM) with nothing ticked: 9, 5, 4, 3 days and 1 day late, the fig due, feeds later',
  c.todayList(items, at(2026, 12, 2, 8, 0)).filter((e) => e.state !== 'soon' && e.state !== 'done').map((e) => `${e.item.name} ${e.state} ${e.days}`),
  ['Fiddle-leaf fig due 0', 'Pepper due 0', 'Biscuit due 0', 'Monstera late 9', 'Basil late 5', 'Snake plant late 4', 'Pothos late 3', 'Biscuit late 1']);

// ---- words ----
check('7:00 AM is breakfast', c.feedName(420), 'Breakfast');
check('12:30 PM is lunch', c.feedName(750), 'Lunch');
check('5:30 PM is dinner', c.feedName(1050), 'Dinner');
check('Home: "Feed Biscuit"', c.doWords(items[0], items[0].tasks[1]), 'Feed Biscuit');
check('Home: "Water Monstera"', c.doWords(items[1], items[1].tasks[0]), 'Water Monstera');
check('menu: "Biscuit’s dinner"', c.cardWords(items[0], items[0].tasks[1]), 'Biscuit’s dinner');
check('menu: "Water the Monstera"', c.cardWords(items[1], items[1].tasks[0]), 'Water the Monstera');
check('menu: "Pepper’s vet checkup"', c.cardWords(items[3], items[3].tasks[1]), 'Pepper’s vet checkup');

// ---- common houseplants ----
check('Monstera: every 7 days', c.plantHint('Monstera'), { name: 'Monstera', every: 7, look: 'monstera' });
check('"my snake plant": every 14 days', c.plantHint('my snake plant').every, 14);
check('Basil: every 2 days, the herb pot', c.plantHint('basil'), { name: 'Basil', every: 2, look: 'herb' });
check('"Christmas cactus" is not a desert cactus', c.plantHint('Christmas cactus').every, 10);
check('Cactus: every 21 days', c.plantHint('Cactus').every, 21);
check('"Fig tree" is the fiddle-leaf fig', c.plantHint('Fig tree').look, 'fig');
check('a name nobody listed: no suggestion', c.plantHint('Gerald'), null);
check('typing "p" offers plants that start with p, then ones with a word that does', c.plantNames('p', 7), ['Pothos', 'Parsley', 'Peace lily', 'Philodendron', 'Palm', 'Snake plant', 'Spider plant']);
check('nothing typed: the first few', c.plantNames('', 3), ['Monstera', 'Fiddle-leaf fig', 'Snake plant']);

// ---- saved, done, undone, removed ----
check('nothing saved: an empty list', c.careItems(), []);
check('nothing saved: Home shows nothing', c.homeLine(NOW), null);
check('nothing saved: the menu card offers Add', c.menuCard(NOW), { title: 'Plants & pets', lines: [], badge: 0, action: { label: '+ Add', href: '#/care/add' } });
items.forEach((x) => c.saveCareItem(x));
check('seven saved', c.careItems().length, 7);
check('a save tells whoever is listening', fired >= 7, true);
check('no name: not saved', c.saveCareItem({ kind: 'plant', name: '   ', tasks: [] }), null);
const home = c.homeLine(NOW);
check('Home at 5:42 PM: Biscuit’s dinner', [home.text, home.label, home.tone, home.href], ['Feed Biscuit', 'Due now', 'due', '#/care']);
check('the menu card at 5:42 PM', c.menuCard(NOW), { title: 'Plants & pets',
  lines: ['Due now · Biscuit’s dinner', '2 days late · Water the Monstera', 'Fri, Nov 27 · Water the Basil'], badge: 2,
  action: { label: 'Biscuit fed', href: '#/care', key: 'biscuit:f2' } });
const was = c.markDone('biscuit:f2', '', NOW);
check('one tap: dinner is done', c.taskState(c.getCareItem('biscuit').tasks[1], NOW).state, 'done');
check('...and Home moves on to the late plant', [c.homeLine(NOW).text, c.homeLine(NOW).label, c.homeLine(NOW).tone], ['Water Monstera', '2 days late', 'late']);
c.setWho('biscuit:f2', 'Alex');
check('...then somebody says who', c.getCareItem('biscuit').tasks[1].last, { at: +NOW, who: 'Alex' });
c.putTask('biscuit', was);
check('Undo: dinner is due again, last given yesterday by Alex', [c.taskState(c.getCareItem('biscuit').tasks[1], NOW).state, c.getCareItem('biscuit').tasks[1].last.who], ['due', 'Alex']);
c.homeLine(NOW).done('Jordan');
check('Home’s tick does the same (at the moment it is tapped)', c.getCareItem('biscuit').tasks[1].last.who, 'Jordan');
c.markDone('biscuit:f2', '', NOW);
c.markDone('monstera:w', '', NOW);
check('everything done: Home shows nothing', c.homeLine(NOW), null);
check('...and the menu card has no button, only what is next', [c.menuCard(NOW).badge, c.menuCard(NOW).action, c.menuCard(NOW).lines[0]], [0, null, 'Fri, Nov 27 · Water the Basil']);
const gone = c.removeCareItem('pepper');
check('removed: six left', c.careItems().map((x) => x.id), ['biscuit', 'monstera', 'basil', 'fig', 'snake', 'pothos']);
c.saveCareItem(gone.item, gone.at);
check('Undo: back in its place', c.careItems().map((x) => x.id), ['biscuit', 'monstera', 'basil', 'pepper', 'fig', 'snake', 'pothos']);
check('a pet keeps at most three feeds, earliest first', c.tidyItem({ kind: 'pet', name: 'Rex', tasks: [1200, 400, 800, 600].map((m, i) => ({ id: `f${i}`, type: 'feed', mins: m })) }).tasks.map((t) => t.mins), [400, 600, 800]);
check('a plant keeps only its watering', c.tidyItem({ kind: 'plant', name: 'Ivy', tasks: [{ id: 'f', type: 'feed', mins: 400 }, { id: 'w', type: 'water', every: 500, next: '2026-12-01' }] }).tasks.map((t) => `${t.type} ${t.every}`), ['water 60']);
check('long words are cut', c.tidyItem({ kind: 'plant', name: 'x'.repeat(100), notes: 'y'.repeat(999), tasks: [] }).name.length + c.tidyItem({ kind: 'plant', name: 'x', notes: 'y'.repeat(999), tasks: [] }).notes.length, 24 + 160);
for (let i = 0; i < 50; i++) c.saveCareItem({ kind: 'plant', name: `Plant ${i}`, tasks: [] });
check('never more than 40', c.careItems().length, 40);
store['care.v1'] = '{not json';
check('a broken save: an empty list, no error', c.careItems(), []);

console.log(bad ? `${bad} of ${n} FAILED` : `all ${n} ok`);
process.exit(bad ? 1 : 0);
