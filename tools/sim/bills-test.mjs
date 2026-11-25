// node tools/sim/bills-test.mjs
// Bills and renewals (js/services/bills-data.js) against answers worked out by hand: when
// each kind of bill falls due, ticking and un-ticking, what is left this month, who pays
// what, the Home line and the words.
const store = {};
globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem(k, v) { store[k] = String(v); }, removeItem(k) { delete store[k]; } };
globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.dispatchEvent = () => {};
const B = await import(new URL('../../js/services/bills-data.js', import.meta.url));

let bad = 0;
let n = 0;
function check(name, got, want) {
  n++;
  const ok = typeof want === 'number' && typeof got === 'number' ? Math.abs(got - want) < 0.005 : JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { bad++; console.log(`FAIL  ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } else console.log(`ok    ${name}`);
}
const bill = (o) => Object.assign({ id: 'x', name: 'Bill', amount: null, repeat: 'monthly', day: 1, month: 0, every: 1, start: '2026-01-01', paidThrough: '', who: '', home: 3 }, o);

// ---- when a bill falls due ----
check('monthly on the 10th, asked on Nov 25 -> Dec 10', B.nextOn(bill({ day: 10 }), '2026-11-25'), '2026-12-10');
check('monthly on the 27th, asked on Nov 25 -> Nov 27', B.nextOn(bill({ day: 27 }), '2026-11-25'), '2026-11-27');
check('monthly on the day itself', B.nextOn(bill({ day: 25 }), '2026-11-25'), '2026-11-25');
check('the 31st in February 2027 -> Feb 28', B.nextOn(bill({ day: 31 }), '2027-02-01'), '2027-02-28');
check('the 31st in a leap February (2028) -> Feb 29', B.nextOn(bill({ day: 31 }), '2028-02-01'), '2028-02-29');
check('the 31st asked on Apr 30 -> Apr 30', B.nextOn(bill({ day: 31 }), '2026-04-30'), '2026-04-30');
check('monthly over the new year', B.nextOn(bill({ day: 5 }), '2026-12-20'), '2027-01-05');
check('yearly Mar 14, asked in November -> next March', B.nextOn(bill({ repeat: 'yearly', month: 2, day: 14 }), '2026-11-25'), '2027-03-14');
check('yearly Dec 1, asked in November -> this December', B.nextOn(bill({ repeat: 'yearly', month: 11, day: 1 }), '2026-11-25'), '2026-12-01');
check('yearly Feb 29 in 2027 -> Feb 28', B.nextOn(bill({ repeat: 'yearly', month: 1, day: 29 }), '2027-01-01'), '2027-02-28');
const fort = bill({ repeat: 'weeks', every: 2, start: '2026-11-06' });
check('every 2 weeks from Nov 6, asked Nov 25 -> Dec 4', B.nextOn(fort, '2026-11-25'), '2026-12-04');
check('every 2 weeks, asked on a due day', B.nextOn(fort, '2026-11-20'), '2026-11-20');
check('every 2 weeks, asked before it starts', B.nextOn(fort, '2026-10-01'), '2026-11-06');
check('every 2 weeks across the clocks going back (Oct 23 -> Nov 6)', B.nextOn(bill({ repeat: 'weeks', every: 2, start: '2026-10-23' }), '2026-10-24'), '2026-11-06');
check('once, still ahead', B.nextOn(bill({ repeat: 'once', start: '2026-12-05' }), '2026-11-25'), '2026-12-05');
check('once, gone by', B.nextOn(bill({ repeat: 'once', start: '2026-12-05' }), '2026-12-06'), null);
check('weekly dates in November from Nov 6', B.occurrences(bill({ repeat: 'weeks', every: 1, start: '2026-11-06' }), '2026-11-01', '2026-11-30'), ['2026-11-06', '2026-11-13', '2026-11-20', '2026-11-27']);
check('nothing before a bill starts', B.occurrences(bill({ day: 10, start: '2026-12-10' }), '2026-11-01', '2026-11-30'), []);
check('next due: never ticked -> its start', B.nextDue(bill({ day: 27, start: '2026-11-27' })), '2026-11-27');
check('next due: ticked through Nov 27 -> Dec 27', B.nextDue(bill({ day: 27, start: '2026-11-27', paidThrough: '2026-11-27' })), '2026-12-27');
check('next due: a one-off that is ticked -> none', B.nextDue(bill({ repeat: 'once', start: '2026-12-05', paidThrough: '2026-12-05' })), null);
check('November runs 1 to 30', B.monthSpan(2026, 10), ['2026-11-01', '2026-11-30']);

// ---- words ----
check('$1,650', B.money(1650), '$1,650');
check('$142.60', B.money(142.6), '$142.60');
check('$2,194.08', B.money(2194.08), '$2,194.08');
check('about $140', B.amountText({ amount: 140, varies: true }), 'about $140');
check('no amount', B.amountText({ amount: null, varies: true }), '');
const D = '2026-11-25'; // a Wednesday
check('today', B.dueWords('2026-11-25', D).text, 'Today');
check('tomorrow', B.dueWords('2026-11-26', D).text, 'Tomorrow');
check('Friday', B.dueWords('2026-11-27', D), { text: 'Friday', soon: true, late: false });
check('Tue, Dec 1 (six days on)', B.dueWords('2026-12-01', D).text, 'Tue, Dec 1');
check('a week on', B.dueWords('2026-12-02', D), { text: 'Wed, Dec 2', soon: false, late: false });
check('next year', B.dueWords('2027-03-14', D).text, 'Sun, Mar 14, 2027');
check('late', B.dueWords('2026-11-20', D), { text: 'Late · Nov 20', soon: true, late: true });
check('10th of the month', B.dueRuleWords(bill({ day: 10 })), '10th of the month');
check('1st, 2nd, 3rd, 11th, 22nd', [1, 2, 3, 11, 22].map((d) => B.dueRuleWords(bill({ day: d })).split(' ')[0]), ['1st', '2nd', '3rd', '11th', '22nd']);
check('Every 2 weeks', B.repeatWords(fort), 'Every 2 weeks');
check('pictures by name', ['Electric', 'Netflix', 'Rent', 'Phones', 'Water', 'Gas heat', 'Internet', 'Spotify', 'Car insurance', 'Gym'].map(B.iconFor),
  ['electric', 'tv', 'rent', 'phones', 'water', 'gas', 'internet', 'music', 'car', 'bill']);
check('Home: Electric bill due Friday', B.homeText('Electric', '2026-11-27', D), 'Electric bill due Friday');
check('Home: Rent due tomorrow', B.homeText('Rent', '2026-11-26', D), 'Rent due tomorrow');
check('Home: Phone bill due today', B.homeText('Phones', '2026-11-25', D), 'Phone bill due today');
check('Home: late', B.homeText('Netflix', '2026-11-23', D), 'Netflix was due Monday');
check('Home: very late', B.homeText('Netflix', '2026-11-03', D), 'Netflix was due Nov 3');

// ---- the board's November: Alex & Jordan ----
const paidLine = (name, amount, who, due) => ({ pid: `p-${name}`, bill: `b-${name}`, name, amount, who, due, at: due, prev: '' });
const monthly = (name, amount, who, day, paidThrough, start) => ({ id: `b-${name}`, name, amount, repeat: 'monthly', day, start: start || `2026-11-${String(day).padStart(2, '0')}`, paidThrough, who, home: 3 });
store['bills.v1'] = JSON.stringify({ v: 1,
  bills: [
    monthly('Rent', 1650, 'split', 1, '2026-11-01'), monthly('Phones', 85, 'Alex', 1, '2026-11-01'), monthly('Car insurance', 118, 'Jordan', 10, '2026-11-10'),
    monthly('Spotify', 16.99, 'Jordan', 14, '2026-11-14'), monthly('Internet', 70, 'Jordan', 18, '2026-11-18'), monthly('Gas heat', 96, 'Jordan', 22, '2026-11-22'),
    monthly('Electric', 142.6, 'Alex', 27, ''), monthly('Netflix', 15.49, 'Alex', 28, ''),
    { id: 'b-Water', name: 'Water', amount: null, varies: true, repeat: 'weeks', every: 12, start: '2026-12-15', paidThrough: '', who: 'Jordan', home: 3 },
  ],
  paid: [paidLine('Rent', 1650, 'split', '2026-11-01'), paidLine('Phones', 85, 'Alex', '2026-11-01'), paidLine('Car insurance', 118, 'Jordan', '2026-11-10'),
    paidLine('Spotify', 16.99, 'Jordan', '2026-11-14'), paidLine('Internet', 70, 'Jordan', '2026-11-18'), paidLine('Gas heat', 96, 'Jordan', '2026-11-22')] });
let s = B.load();
check('9 bills, 6 paid lines survive loading', [s.bills.length, s.paid.length], [9, 6]);
check('due soon, in order', B.dueList(s).map((x) => `${x.bill.name} ${x.due}`),
  ['Electric 2026-11-27', 'Netflix 2026-11-28', 'Rent 2026-12-01', 'Phones 2026-12-01', 'Water 2026-12-15', 'Car insurance 2026-12-10', 'Spotify 2026-12-14', 'Internet 2026-12-18', 'Gas heat 2026-12-22']
    .sort((a, b) => (a.split(' ').pop() < b.split(' ').pop() ? -1 : a.split(' ').pop() > b.split(' ').pop() ? 1 : 0)));
const money = B.monthMoney(s, D);
check('left in November: $158.09', money.left, 158.09);
check('paid in November: $2,035.99', money.paid, 2035.99);
check('two still to pay', money.count, 2);
const nov = B.monthItems(s, 2026, 10);
check('November has 8 things, 6 ticked', [nov.length, nov.filter((x) => x.paid).length], [8, 6]);
check('November in all: $2,194.08', nov.reduce((t, x) => t + (x.amount || 0), 0), 2194.08);
const who = B.shares(nov, ['Alex', 'Jordan']);
check('Alex pays $1,068.09', who[0].total, 1068.09);
check('Jordan pays $1,125.99', who[1].total, 1125.99);
check('rent is half each', who[0].parts.find((p) => p.name === 'Rent'), { name: 'Rent', amount: 825 });
check('split five ways', B.shares([{ name: 'Rent', amount: 1650, who: 'split' }], ['A', 'B', 'C', 'D', 'E']).map((p) => p.total), [330, 330, 330, 330, 330]);
check('somebody who has left pays nothing', B.shares([{ name: 'Gym', amount: 30, who: 'Sam' }], ['Alex', 'Jordan']), []);
check('"who pays" needs two people', [B.usesWho(s, 2), B.usesWho(s, 1), B.usesWho({ bills: [{ who: '' }] }, 2)], [true, false, false]);
check('December: 9 things, none ticked', (() => { const d = B.monthItems(s, 2026, 11); return [d.length, d.filter((x) => x.paid).length]; })(), [9, 0]);

// ---- Home and the menu ----
check('Home, Wed Nov 25: Electric (2 days away)', B.homeLine(D).text, 'Electric bill due Friday');
check('Home, Mon Nov 23: nothing yet (4 days away)', B.homeLine('2026-11-23'), null);
check('Home, Tue Nov 24: 3 days before', B.homeLine('2026-11-24').tone, 'due');
check('Home, Sun Nov 29: late', [B.homeLine('2026-11-29').text, B.homeLine('2026-11-29').tone], ['Electric bill was due Friday', 'late']);
const card = B.menuCard(D);
check('menu card lines', card.lines, ['Electric · Friday · $142.60', 'Netflix · Saturday · $15.49', 'Rent · Tue, Dec 1 · $1,650', '$158 left']);
check('menu card badge: nothing due today', card.badge, 0);
check('menu card badge on the 28th: two', B.menuCard('2026-11-28').badge, 2);

// ---- ticking ----
const line = B.markPaid('b-Electric', D);
check('ticking Electric: paid for Nov 27, on the 25th', [line.due, line.at, line.amount], ['2026-11-27', '2026-11-25', 142.6]);
s = B.load();
check('Electric is next due Dec 27', B.nextDue(s.bills.find((b) => b.id === 'b-Electric')), '2026-12-27');
check('left in November: $15.49', B.monthMoney(s, D).left, 15.49);
check('Home moves on: nothing (Netflix is 3 days away -> shows)', B.homeLine(D).text, 'Netflix due Saturday');
check('an older paid line cannot be un-ticked once... Rent can (it is its latest)', B.canUnpay(s, s.paid[0]), true);
check('un-tick', B.unmarkPaid(line.pid), true);
s = B.load();
check('Electric is due Nov 27 again', B.nextDue(s.bills.find((b) => b.id === 'b-Electric')), '2026-11-27');
B.homeLine(D).done();
check('Home tick pays Electric', B.homeLine(D).text, 'Netflix due Saturday');
B.markPaid('b-Electric', D);
s = B.load();
check('only the latest tick of a bill can be undone', s.paid.filter((p) => p.bill === 'b-Electric').map((p) => B.canUnpay(s, p)), [false, true]);

// ---- adding, changing, removing ----
const added = B.saveBill({ name: '  Gym  ', amount: 30, repeat: 'monthly', day: 10, who: '', home: 3 }, '', D);
check('added on Nov 25 for the 10th: first due Dec 10', [added.name, added.start, B.nextDue(added)], ['Gym', '2026-12-10', '2026-12-10']);
const yearly = B.saveBill({ name: 'Car registration', amount: 88, repeat: 'yearly', date: '2027-03-14' }, '', D);
check('yearly from a picked date', [yearly.month, yearly.day, yearly.start], [2, 14, '2027-03-14']);
const once = B.saveBill({ name: 'Plumber', amount: 240, repeat: 'once', date: '2026-12-05' }, '', D);
check('a one-off', [once.start, B.nextDue(once)], ['2026-12-05', '2026-12-05']);
B.markPaid(once.id, D);
check('a paid one-off is no longer due', B.dueList(B.load()).some((x) => x.bill.id === once.id), false);
const renamed = B.saveBill({ name: 'Gym', amount: 35, repeat: 'monthly', day: 10 }, added.id, '2026-12-20');
check('changing only the amount moves nothing', [renamed.amount, renamed.start], [35, '2026-12-10']);
const moved = B.saveBill({ name: 'Gym', amount: 35, repeat: 'monthly', day: 15 }, added.id, D);
check('changing the day: next due Dec 15', B.nextDue(moved), '2026-12-15');
check('no name, no bill', B.saveBill({ name: '   ', repeat: 'monthly', day: 1 }, '', D), null);
const before = B.load().bills.length;
const gone = B.removeBill(added.id);
check('removed', B.load().bills.length, before - 1);
B.restoreBill(gone);
check('and put back in its place', B.load().bills.findIndex((b) => b.id === added.id), gone.at);

// ---- keeping it small ----
store['bills.v1'] = JSON.stringify({ v: 1, bills: [], paid: [paidLine('Old', 5, '', '2020-01-01'), paidLine('New', 5, '', B.today())] });
check('paid history older than 13 months goes', B.load().paid.map((p) => p.name), ['New']);
store['bills.v1'] = '{not json';
check('broken storage -> empty', B.load(), { v: 1, bills: [], paid: [] });
store['bills.v1'] = JSON.stringify({ bills: [{ name: '<img src=x onerror=alert(1)>', start: '2026-11-27', repeat: 'nonsense', day: 99, home: 'x' }, { name: 'No date' }, null] });
check('odd data is tidied', B.load().bills.map((b) => [b.repeat, b.day, b.home]), [['monthly', 1, 3]]);
check('nothing typed becomes markup in the menu card', B.menuCardHtml('2026-11-25').indexOf('<img'), -1);

console.log(bad ? `${bad} of ${n} FAILED` : `all ${n} ok`);
process.exit(bad ? 1 : 0);
