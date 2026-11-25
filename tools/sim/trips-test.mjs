// node tools/sim/trips-test.mjs
// Trips and countdowns (js/services/trips-data.js) against answers worked out by hand: days
// to go (across a month end, a year end and a clock change), the trip's days in words, which
// days the forecast can reach, the packing templates, what is kept, and what Home, the menu
// and the calendar are told.
globalThis.location = { search: '', hash: '' };
const store = {};
globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem(k, v) { store[k] = String(v); }, removeItem(k) { delete store[k]; }, key: () => null, length: 0 };
globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
let fired = 0;
globalThis.dispatchEvent = () => { fired++; };
globalThis.fetch = () => Promise.reject(new Error('no internet in this test'));
const T = await import(new URL('../../js/services/trips-data.js', import.meta.url));

let bad = 0;
let n = 0;
function check(name, got, want) {
  n++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { bad++; console.log(`FAIL  ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } else console.log(`ok    ${name}`);
}
const TODAY = '2026-11-25'; // a Wednesday
const trip = (start, end, more) => Object.assign({ id: 'x', name: 'Trip', where: '', start, end, items: [] }, more);

// ---- days to go ----
check('Nov 25 to Dec 4 is 9 days', T.daysBetween(TODAY, '2026-12-04'), 9);
check('Nov 25 to Dec 23 is 28 days', T.daysBetween(TODAY, '2026-12-23'), 28);
check('Nov 25 to Jan 22 is 58 days (over the year end)', T.daysBetween(TODAY, '2027-01-22'), 58);
check('Nov 25 to Mar 14 is 109 days (over the March clock change)', T.daysBetween(TODAY, '2027-03-14'), 109);
check('Feb 27 to Mar 1 in a leap year is 3 days', T.daysBetween('2028-02-27', '2028-03-01'), 3);
check('backwards is negative', T.daysBetween('2026-12-04', TODAY), -9);
check('addDays over a month end', T.addDays('2026-11-29', 3), '2026-12-02');
check('addDays back over a year end', T.addDays('2027-01-01', -1), '2026-12-31');
check('9 days', T.countdown(trip('2026-12-04', '2026-12-06'), TODAY), { n: 9, big: '9', unit: 'days' });
check('1 day', T.countdown(trip('2026-11-26', '2026-11-28'), TODAY), { n: 1, big: '1', unit: 'day' });
check('the day it starts: Today', T.countdown(trip(TODAY, '2026-11-28'), TODAY), { n: 0, big: 'Today', unit: '' });
check('while away: Now', T.countdown(trip('2026-11-23', '2026-11-28'), TODAY), { n: -2, big: 'Now', unit: '' });

// ---- the days in words ----
check('long, three days', T.rangeText('2026-12-04', '2026-12-06', true), 'Fri Dec 4 – Sun Dec 6');
check('short, one month', T.rangeText('2026-12-23', '2026-12-26'), 'Dec 23 – 26');
check('short, two months', T.rangeText('2027-01-30', '2027-02-02'), 'Jan 30 – Feb 2');
check('short, over the year end', T.rangeText('2026-12-30', '2027-01-02'), 'Dec 30 – Jan 2');
check('one day, long', T.rangeText('2026-12-05', '2026-12-05', true), 'Sat Dec 5');
check('one day, short', T.rangeText('2026-12-05', '2026-12-05'), 'Dec 5');
check('Jan 22 2027 is a Friday', T.dayName('2027-01-22'), 'Fri');

// ---- which days the forecast reaches (today + 15 days; the first three still to come) ----
check('9 days off: all three days', T.forecastDays(trip('2026-12-04', '2026-12-06'), TODAY), ['2026-12-04', '2026-12-05', '2026-12-06']);
check('14 days off, a week long: the first two days only', T.forecastDays(trip('2026-12-09', '2026-12-16'), TODAY), ['2026-12-09', '2026-12-10']);
check('15 days off: its first day only', T.forecastDays(trip('2026-12-10', '2026-12-12'), TODAY), ['2026-12-10']);
check('16 days off: nothing', T.forecastDays(trip('2026-12-11', '2026-12-13'), TODAY), []);
check('28 days off: nothing', T.forecastDays(trip('2026-12-23', '2026-12-26'), TODAY), []);
check('already away: from today', T.forecastDays(trip('2026-11-23', '2026-11-26'), TODAY), ['2026-11-25', '2026-11-26']);
check('a long trip: three days, no more', T.forecastDays(trip('2026-11-26', '2026-12-05'), TODAY), ['2026-11-26', '2026-11-27', '2026-11-28']);

// ---- templates, paintings, where a typed item goes ----
check('template sizes as drawn', T.TEMPLATES.map((t) => `${t.name} ${t.items.length}`), ['Weekend 24', 'Beach 28', 'Ski 32', 'Family 20', 'Empty 0']);
check('no template lists a thing twice', T.TEMPLATES.map((t) => new Set(t.items.map((i) => i.text)).size === t.items.length), [true, true, true, true, true]);
check('every template item has a known kind', T.TEMPLATES.every((t) => t.items.every((i) => T.CATS.indexOf(i.cat) >= 0)), true);
check('Ski week is the ski painting, whatever the list', T.artFor('Ski week', 'weekend'), 'ski');
check('Christmas at Mom’s is the house', T.artFor('Christmas at Mom’s', 'weekend'), 'house');
check('Aruba is the beach', T.artFor('Aruba', 'empty'), 'beach');
check('a plain name follows its list', T.artFor('Long weekend', 'beach'), 'beach');
check('a plain name with no list: the cabin', T.artFor('Away', ''), 'cabin');
check('renamed to something plain: keeps its painting', T.artFor('Away', '', 'ski'), 'ski');
check('Marshmallows are food', T.guessCat('Marshmallows'), 'Food');
check('Wool socks are clothes', T.guessCat('wool socks'), 'Clothes');
check('Passports are papers', T.guessCat('Passports'), 'Papers');
check('Toothbrush', T.guessCat('Toothbrush'), 'Toiletries');
check('Headlamps are gear', T.guessCat('Headlamps'), 'Gear');

// ---- places ----
const portlands = [
  { town: 'Portland', region: 'Oregon', label: 'Portland, Oregon, United States', lat: 45.5, lon: -122.7 },
  { town: 'Portland', region: 'Maine', label: 'Portland, Maine, United States', lat: 43.7, lon: -70.3 },
  { town: 'Portland', region: 'Victoria', label: 'Portland, Victoria, Australia', lat: -38.3, lon: 141.6 },
];
check('a US place is town, state', T.placeLabel(portlands[1]), 'Portland, ME');
check('elsewhere is town, country', T.placeLabel(portlands[2]), 'Portland, Australia');
check('a place that is its own country', T.placeLabel({ town: 'Aruba', region: '', label: 'Aruba' }), 'Aruba');
check('"Portland, ME" means Maine', T.matchPlace(portlands, 'Portland, ME').region, 'Maine');
check('"Portland, maine" too', T.matchPlace(portlands, 'Portland, maine').region, 'Maine');
check('"Portland, Australia"', T.matchPlace(portlands, 'Portland, Australia').region, 'Victoria');
check('"Portland" alone: the first', T.matchPlace(portlands, 'Portland').region, 'Oregon');
check('nothing found', T.matchPlace([], 'Nowhere, ZZ'), null);
check('the town alone', T.town('Lake George, NY'), 'Lake George');

// ---- what is kept ----
const RealDate = Date;
// The clock says noon on a given day for everything below.
const clock = (y, m, d) => { globalThis.Date = class extends RealDate { constructor(...a) { if (a.length) super(...a); else super(y, m, d, 12, 0, 0); } static now() { return new RealDate(y, m, d, 12, 0, 0).getTime(); } }; };
clock(2026, 10, 25);
check('nothing saved: no trips', T.trips(), []);
check('nothing saved: Home says nothing', T.homeLine(), null);
check('nothing saved: the menu card invites', T.menuCard(), { title: 'Trips', lines: ['No trips yet'], badge: 0, action: { label: 'New trip', href: '#/trips/add' } });
check('no name: not saved', T.saveTrip({ name: '  ', start: '2026-12-04', end: '2026-12-06' }), null);
check('ends before it starts: not saved', T.saveTrip({ name: 'Back to front', start: '2026-12-06', end: '2026-12-04' }), null);
check('Feb 30: not saved', T.saveTrip({ name: 'Never', start: '2027-02-30', end: '2027-03-02' }), null);
const ski = T.saveTrip({ name: 'Ski week', where: 'Stowe, VT', start: '2027-01-22', end: '2027-01-25', template: 'ski' });
const xmas = T.saveTrip({ name: 'Christmas at Mom’s', where: 'Portland, ME', start: '2026-12-23', end: '2026-12-26', template: 'family' });
const cabin = T.saveTrip({ name: 'Cabin weekend', where: 'Lake George, NY', start: '2026-12-04', end: '2026-12-06', template: 'weekend' });
check('the nearest first', T.trips().map((t) => t.name), ['Cabin weekend', 'Christmas at Mom’s', 'Ski week']);
check('each starts from its list', [cabin.items.length, xmas.items.length, ski.items.length], [24, 20, 32]);
check('paintings', [cabin.art, xmas.art, ski.art], ['cabin', 'house', 'ski']);
check('a change tells whoever is listening', fired > 0, true);
check('damaged storage is no trips, not a crash', (() => { const keep = store['trips.v1']; store['trips.v1'] = '{oops'; const got = T.trips(); store['trips.v1'] = keep; return got; })(), []);

// packing
const ids = cabin.items.map((i) => i.id);
T.toggleItem(cabin.id, ids[0], 'Alex');
T.toggleItem(cabin.id, ids[1], 'Jordan');
T.toggleItem(cabin.id, ids[2], '');
check('3 of 24 packed', T.packed(T.getTrip(cabin.id)), { done: 3, total: 24 });
check('who packed it', T.getTrip(cabin.id).items.slice(0, 3).map((i) => i.by || ''), ['Alex', 'Jordan', '']);
T.toggleItem(cabin.id, ids[0], 'Jordan');
check('unticked: nobody', [T.getTrip(cabin.id).items[0].done, T.getTrip(cabin.id).items[0].by || ''], [false, '']);
check('a typed item gets a capital and a kind', (() => { const i = T.addItem(cabin.id, 'marshmallows'); return [i.text, i.cat]; })(), ['Marshmallows', 'Food']);
check('the same thing twice: not added', T.addItem(cabin.id, 'MARSHMALLOWS'), null);
check('nothing typed: not added', T.addItem(cabin.id, '   '), null);
const goneText = T.getTrip(cabin.id).items[3].text;
const gone = T.removeItem(cabin.id, ids[3]);
check('removed', T.getTrip(cabin.id).items.length, 24);
T.restoreItem(cabin.id, gone);
check('Undo puts it back where it was', T.getTrip(cabin.id).items[3].text, goneText);
check('the list stops at 80 things', (() => { for (let i = 0; i < 90; i++) T.addItem(ski.id, `Thing ${i}`); return T.getTrip(ski.id).items.length; })(), 80);

// changing a trip keeps its list
const renamed = T.saveTrip({ id: cabin.id, name: 'Cabin weekend', where: 'Lake Placid, NY', start: '2026-12-04', end: '2026-12-07' });
check('edited: same trip, same list, new days', [renamed.id, renamed.items.length, renamed.end, renamed.where, T.trips().length], [cabin.id, 25, '2026-12-07', 'Lake Placid, NY', 3]);
T.saveTrip({ id: cabin.id, name: 'Cabin weekend', where: 'Lake George, NY', start: '2026-12-04', end: '2026-12-06' });

// ---- Home, the menu, the calendar ----
check('Home, 9 days before', T.homeLine(), { text: '9 days · Cabin weekend', href: `#/trips/${cabin.id}`, tone: 'info', label: '9 DAYS', title: 'Cabin weekend' });
check('Home, 14 days before', T.homeLine('2026-11-20').text, '14 days · Cabin weekend');
check('Home, 15 days before: nothing yet', T.homeLine('2026-11-19'), null);
check('Home, the day before', T.homeLine('2026-12-03').text, '1 day · Cabin weekend');
check('Home, the day it starts', T.homeLine('2026-12-04').text, 'Today · Cabin weekend');
check('Home, while away and the next one is far off: nothing', T.homeLine('2026-12-05'), null);
check('Home, back again and Christmas is near', T.homeLine('2026-12-10').text, '13 days · Christmas at Mom’s');
check('the menu card', T.menuCard(), { title: 'Trips', lines: ['9 days', 'Cabin weekend', 'Lake George · Fri', 'Packed 2/25'], badge: 0 });
check('the menu card while away', T.menuCard('2026-12-05').lines, ['Now', 'Cabin weekend', 'Lake George', 'Packed 2/25']);
check('the menu card after it: the next trip', T.menuCard('2026-12-07').lines.slice(0, 2), ['16 days', 'Christmas at Mom’s']);
check('the calendar, December', T.tripsBetween('2026-12-01', '2026-12-31').map((t) => `${t.name} ${t.start} ${t.end}`), ['Cabin weekend 2026-12-04 2026-12-06', 'Christmas at Mom’s 2026-12-23 2026-12-26']);
check('the calendar, a week a trip ends in', T.tripsBetween('2026-12-06', '2026-12-12').map((t) => t.name), ['Cabin weekend']);
check('the calendar, the day after', T.tripsBetween('2026-12-07', '2026-12-12'), []);
check('the calendar takes Dates too', T.tripsBetween(new Date(2027, 0, 1), new Date(2027, 0, 31)).map((t) => t.name), ['Ski week']);
check('the calendar entry has just these', Object.keys(T.tripsBetween('2026-12-01', '2026-12-31')[0]), ['id', 'name', 'start', 'end']);

// ---- the forecast that was saved ----
store['trips.wx.v1'] = JSON.stringify({ [cabin.id]: { at: Date.now(), sig: 'Lake George, NY||fahrenheit', days: [
  { date: '2026-12-04', code: 73, hi: 32, lo: 19, rain: 70 }, { date: '2026-12-05', code: 0, hi: 28, lo: 12, rain: 0 }, { date: '2026-12-06', code: 2, hi: 34, lo: 20, rain: 10 }] } });
check('three days, in words', T.tripForecast(T.getTrip(cabin.id)).map((d) => `${d.day} ${d.icon} ${d.hi}/${d.lo} ${d.words}`), ['Fri snow 32/19 Snow 70%', 'Sat sun 28/12 Clear', 'Sun partly 34/20 Partly cloudy']);
check('Home gets the first day', (() => { const h = T.homeLine(); return [h.icon, h.temp]; })(), ['snow', 32]);
check('too far off: not shown even if saved', T.tripForecast(T.getTrip(cabin.id), '2026-11-18'), []);
check('for another place: not shown', T.tripForecast(Object.assign({}, T.getTrip(cabin.id), { where: 'Lake Placid, NY' })), []);
check('no internet: loadForecast says false, never throws', await T.loadForecast(T.getTrip(xmas.id), '2026-12-20'), false);

// ---- taking a trip away, and time passing ----
const was = T.removeTrip(xmas.id);
check('removed', T.trips().map((t) => t.name), ['Cabin weekend', 'Ski week']);
T.restoreTrip(was);
check('Undo', T.trips().map((t) => t.name), ['Cabin weekend', 'Christmas at Mom’s', 'Ski week']);
check('over: no longer listed', T.trips('2026-12-07').map((t) => t.name), ['Christmas at Mom’s', 'Ski week']);
check('its last day: still listed', T.trips('2026-12-06').length, 3);
check('24 trips at most', (() => { for (let i = 0; i < 30; i++) T.saveTrip({ name: `Trip ${i}`, start: '2027-05-01', end: '2027-05-02', template: 'empty' }); return T.trips().length; })(), 24);
// Two months on, saving anything drops the trips that ended over 30 days ago.
clock(2027, 0, 26);
T.setPacker('Jordan');
const left = JSON.parse(store['trips.v1']).trips.map((t) => t.name);
check('long over: gone from storage; Ski week (ended yesterday) kept', [left.indexOf('Cabin weekend'), left.indexOf('Christmas at Mom’s'), left.indexOf('Ski week') >= 0], [-1, -1, true]);
check('who is packing is remembered', T.packer(), 'Jordan');

console.log(bad ? `${bad} of ${n} FAILED` : `all ${n} passed`);
process.exit(bad ? 1 : 0);
