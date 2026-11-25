// node tools/sim/question-test.mjs
// Question of the day (js/services/question-data.js) against answers worked out by hand:
// which evening a moment belongs to (a new question at 5 PM), the day's number, an order
// that never repeats within a year, when a sealed day opens (everyone answered, or the next
// morning), the book, and what Home says.
globalThis.location = { search: '', hash: '' };
const store = {};
globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem(k, v) { store[k] = String(v); }, removeItem(k) { delete store[k]; }, key: () => null, length: 0 };
globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
let fired = 0;
globalThis.dispatchEvent = () => { fired++; };
// The household comes from the screen's settings: a pretend couple.
globalThis.TabletNative = { familySettings: () => JSON.stringify({ familyName: 'Alex & Jordan', people: ['Alex', 'Jordan'] }) };
const q = await import(new URL('../../js/services/question-data.js', import.meta.url));

let bad = 0;
let n = 0;
function check(name, got, want) {
  n++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { bad++; console.log(`FAIL  ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } else console.log(`ok    ${name}`);
}
const at = (y, m, d, h = 0, min = 0) => new Date(y, m - 1, d, h, min);
const onDisk = () => JSON.parse(store['question.v1']);

// ---- the list ----
check('at least 365 questions', q.QUESTIONS.length >= 365, true);
check('no question twice', new Set(q.QUESTIONS.map((x) => x.text.toLowerCase())).size, q.QUESTIONS.length);
const quick = q.QUESTIONS.filter((x) => x.a);
const share = quick.length / q.QUESTIONS.length;
check('about a fifth are quick choices', share > 0.17 && share < 0.23, true);
check('every quick choice has two answers, each with a known picture',
  quick.filter((x) => !(x.a[0] && x.b[0] && x.a[0] !== x.b[0] && q.ART.includes(x.a[1]) && q.ART.includes(x.b[1]) && x.a[1] !== x.b[1])).map((x) => x.text), []);
check('every picture is used', q.ART.filter((k) => !quick.some((x) => x.a[1] === k || x.b[1] === k)), []);
check('questions fit the screen (80 letters at most)', q.QUESTIONS.filter((x) => x.text.length > 80).map((x) => x.text), []);
check('choice labels fit a tile (22 letters at most)', quick.filter((x) => x.a[0].length > 22 || x.b[0].length > 22).map((x) => x.text), []);

// ---- which evening ----
check('4:59 PM still belongs to yesterday evening', q.questionDay(at(2026, 11, 25, 16, 59)), '2026-11-24');
check('5:00 PM starts today', q.questionDay(at(2026, 11, 25, 17, 0)), '2026-11-25');
check('just after midnight is still that evening', q.questionDay(at(2026, 11, 26, 0, 5)), '2026-11-25');
check('New Year morning belongs to Dec 31', q.questionDay(at(2027, 1, 1, 9)), '2026-12-31');
check('Mar 1 morning in a leap year belongs to Feb 29', q.questionDay(at(2028, 3, 1, 8)), '2028-02-29');
check('evening is 5 PM to midnight',
  [q.isEvening(at(2026, 11, 25, 16, 59)), q.isEvening(at(2026, 11, 25, 17)), q.isEvening(at(2026, 11, 25, 23, 59)), q.isEvening(at(2026, 11, 26, 0, 1))], [false, true, true, false]);

// ---- counting days ----
check('Jul 1 to Nov 25 is 147 days on: No. 148', q.dayNumber('2026-07-01', '2026-11-25'), 148);
check('the first day is No. 1', q.dayNumber('2026-11-25', '2026-11-25'), 1);
check('across the spring clock change', q.daysBetween('2026-03-07', '2026-03-09'), 2);
check('across the autumn clock change', q.daysBetween('2026-10-31', '2026-11-02'), 2);
check('across a leap day', q.daysBetween('2028-02-28', '2028-03-01'), 2);
check('a clock set back before the first day never gives No. 0', q.dayNumber('2026-11-25', '2026-11-20'), 1);

// ---- the order ----
const N = q.QUESTIONS.length;
const order = q.orderFor(12345, N);
check('the order has every question once', order.slice().sort((a, b) => a - b), Array.from({ length: N }, (_, i) => i));
check('the same seed gives the same order', q.orderFor(12345, N), order);
check('another household gets another order', JSON.stringify(q.orderFor(54321, N)) !== JSON.stringify(order), true);
check('it is shuffled (not the list as written)', order.slice(0, 20).some((v, i) => v !== i), true);
const year = [];
for (let i = 0; i < 365; i++) year.push(q.questionIndex(777, '2026-07-01', q.dayKey(new Date(2026, 6, 1 + i))));
check('no question twice in a year', new Set(year).size, 365);
check('day 1 is the first of the order', q.questionIndex(777, '2026-07-01', '2026-07-01'), q.orderFor(777, N)[0]);
check('No. 148 is the 148th of the order', q.questionIndex(777, '2026-07-01', '2026-11-25'), q.orderFor(777, N)[147]);
check('after the whole list it starts again', q.questionIndex(777, '2026-07-01', q.dayKey(new Date(2026, 6, 1 + N))), q.orderFor(777, N)[0]);

// ---- sealed or open ----
const AJ = ['Alex', 'Jordan'];
check('nobody yet: open', q.stateOf(AJ, {}, '2026-11-25', at(2026, 11, 25, 19)), 'open');
check('one of two: still sealed that evening', q.stateOf(AJ, { Alex: 'x' }, '2026-11-25', at(2026, 11, 25, 23)), 'open');
check('one of two: still sealed at 5:59 AM', q.stateOf(AJ, { Alex: 'x' }, '2026-11-25', at(2026, 11, 26, 5, 59)), 'open');
check('one of two: opens at 6 AM', q.stateOf(AJ, { Alex: 'x' }, '2026-11-25', at(2026, 11, 26, 6, 0)), 'revealed');
check('both: opens at once', q.stateOf(AJ, { Alex: 'x', Jordan: 'y' }, '2026-11-25', at(2026, 11, 25, 19)), 'revealed');
check('nobody by morning: nothing to open, still answerable', q.stateOf(AJ, {}, '2026-11-25', at(2026, 11, 26, 10)), 'open');
check('four of five in the evening: sealed', q.stateOf(['a', 'b', 'c', 'd', 'e'], { a: '1', b: '1', c: '1', d: '1' }, '2026-11-25', at(2026, 11, 25, 21)), 'open');
check('five of five: opens', q.stateOf(['a', 'b', 'c', 'd', 'e'], { a: '1', b: '1', c: '1', d: '1', e: '1' }, '2026-11-25', at(2026, 11, 25, 21)), 'revealed');
check('no people: one shared answer opens at once', q.stateOf([], { '': 'x' }, '2026-11-25', at(2026, 11, 25, 19)), 'revealed');
check('no people, nothing yet: open', q.stateOf([], {}, '2026-11-25', at(2026, 11, 25, 19)), 'open');
check('no people: one shared slot', q.slots([]), ['']);
check('who is waiting', q.waiting(['a', 'b', 'c'], { b: 'x' }), ['a', 'c']);
check('the morning after Dec 31 is Jan 1, 6 AM', q.opensAt('2026-12-31').getTime(), at(2027, 1, 1, 6).getTime());

// ---- book titles ----
check('a couple', q.bookTitle('Alex & Jordan'), 'Alex & Jordan’s book');
check('a name ending in s', q.bookTitle('The Riveras'), 'The Riveras’ book');
check('no name yet', q.bookTitle(''), 'The book');

// ---- what Home says (5 people) ----
const five = { names: ['a', 'b', 'c', 'd', 'e'], waiting: ['d', 'e'], state: 'open', text: 'Q?' };
check('five people, three in', q.homeText(five, at(2026, 11, 25, 19)), '3 of 5 answered');
check('not before 5 PM', q.homeText(five, at(2026, 11, 25, 16)), null);
check('no people: the question', q.homeText({ names: [''], waiting: [''], state: 'open', text: 'Q?' }, at(2026, 11, 25, 19)), 'Q?');

// ---- keeping three years ----
const many = {};
for (let i = 0; i < 1200; i++) many[q.dayKey(new Date(2024, 0, 1 + i))] = { a: { x: 'y' } };
const kept = q.prune(many);
check('only the newest 1,096 days are kept', Object.keys(kept).length, 1096);
check('the oldest ones go', Object.keys(kept).sort()[0], q.dayKey(new Date(2024, 0, 1 + 104)));

// ---- a real evening, Alex & Jordan ----
const eve = at(2026, 11, 25, 18, 42);
let t = q.today(eve);
check('first visit: No. 1 on the evening it starts', [t.day, t.n, t.state, t.waiting], ['2026-11-25', 1, 'open', AJ]);
check('nothing is kept until somebody answers', Object.keys(onDisk().days), []);
check('Home, nobody answered: the question itself', q.homeLine(eve).text, t.text);
const pick = (i, words) => (t.a ? (i ? t.b[0] : t.a[0]) : words);
const alexSays = pick(0, 'Mom’s tuna noodle casserole.');
t = q.answer('Alex', `  ${alexSays}  `, eve);
check('Alex answers: sealed, Jordan waiting', [t.state, t.waiting, t.answers.Alex], ['open', ['Jordan'], alexSays]);
check('it said so (one event)', fired, 1);
check('Home: who answered, whose turn', q.homeLine(eve), { label: 'Tonight’s question', text: 'Alex answered · Jordan’s turn', href: '#/question', tone: 'due' });
const card = q.menuCard(eve);
check('the menu card', [card.title, card.side, card.lines.slice(1), card.badge, card.action], ['Question', 'No. 1', ['Alex · Answered', 'Jordan · Not yet'], 1, { label: 'Answer', href: '#/question' }]);
check('answering twice changes nothing', q.answer('Alex', 'again', eve), null);
check('somebody who does not live here cannot answer', q.answer('Sam', 'hi', eve), null);
check('an empty answer is not one', q.answer('Jordan', '   ', eve), null);
check('still sealed: not in the book', q.book(eve).length, 0);
check('Undo takes it back, and the day with it', [q.unanswer('Alex', eve), q.today(eve).waiting, Object.keys(onDisk().days)], [true, AJ, []]);
q.answer('Alex', alexSays, eve);
t = q.answer('Jordan', 'x'.repeat(150), eve);
check('Jordan answers: opened', [t.state, t.waiting], ['revealed', []]);
check('a long answer is cut at 100 letters', t.answers.Jordan.length, 100);
check('Home goes quiet once everyone answered', q.homeLine(eve), null);
check('no Undo once it is open', q.unanswer('Jordan', eve), false);
check('in the book', q.book(eve).map((e) => [e.day, e.n, e.names]), [['2026-11-25', 1, AJ]]);
check('the menu card says Read, no badge', [q.menuCard(eve).action.label, q.menuCard(eve).badge], ['Read', 0]);

// the next day: before 5 PM yesterday's stays, at 5 PM a new one
check('next morning: yesterday’s question, open to read', [q.today(at(2026, 11, 26, 9)).day, q.today(at(2026, 11, 26, 9)).state], ['2026-11-25', 'revealed']);
check('Home says nothing in the morning', q.homeLine(at(2026, 11, 26, 9)), null);
const eve2 = at(2026, 11, 26, 17, 0);
t = q.today(eve2);
check('5 PM: a new question, No. 2', [t.day, t.n, t.state], ['2026-11-26', 2, 'open']);
check('and it is a different one', t.text !== q.book(eve2)[0].text, true);
q.answer('Jordan', pick(1, 'Only me tonight'), eve2);
const late = at(2026, 11, 26, 23);
check('one answer that evening: sealed, not in the book', [q.today(late).state, q.book(late).length, q.bookDay('2026-11-26', late)], ['open', 1, null]);
const morn = at(2026, 11, 27, 6, 30);
check('next morning it opens with what there is; Alex skipped', [q.today(morn).state, q.today(morn).waiting, q.book(morn).map((e) => e.day)], ['revealed', ['Alex'], ['2026-11-26', '2026-11-25']]);
check('too late for Alex', q.answer('Alex', 'late', morn), null);
check('an answer typed across 5 PM does not land on the new question', q.answer('Alex', 'late', at(2026, 11, 27, 17, 1), '2026-11-26'), null);
check('a day nobody answered leaves no page', [q.today(at(2026, 11, 28, 18)).n, q.book(at(2026, 11, 28, 18)).length], [4, 2]);

// ---- what is on disk is never trusted ----
const solo = at(2026, 12, 1, 20);
store['question.v1'] = '{not json';
q.reload();
check('broken storage starts fresh', [q.today(solo).n, q.book(solo)], [1, []]);
store['question.v1'] = JSON.stringify({ seed: 'x', start: 12, days: [] });
q.reload();
check('wrong shapes start fresh', [q.today(solo).n, q.book(solo)], [1, []]);
store['question.v1'] = JSON.stringify({ seed: 9, start: '2026-07-01', days: {} });
q.reload();
check('the 148th day reads No. 148', q.today(at(2026, 11, 25, 18)).n, 148);
check('before 5 PM that day it is still No. 147', q.today(at(2026, 11, 25, 12)).n, 147);
check('the same household, the same question', q.today(at(2026, 11, 25, 18)).text, q.QUESTIONS[q.orderFor(9, N)[147]].text);

console.log(bad ? `\n${bad} of ${n} FAILED` : `\nAll ${n} question checks passed.`);
process.exit(bad ? 1 : 0);
