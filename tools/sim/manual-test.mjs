// node tools/sim/manual-test.mjs
// The House manual (js/services/manual-data.js) against answers worked out by hand: the
// text of the guest Wi-Fi code, when a filter is next due, which warranty ends next, the
// line Home shows, the menu card, and what is kept when things are saved and removed.
const store = {};
globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem(k, v) { store[k] = String(v); }, removeItem(k) { delete store[k]; }, key: () => null, length: 0 };
globalThis.window = globalThis;
let fired = 0;
const listeners = [];
globalThis.addEventListener = (n, cb) => { listeners.push([n, cb]); };
globalThis.removeEventListener = (n, cb) => { const i = listeners.findIndex((l) => l[0] === n && l[1] === cb); if (i >= 0) listeners.splice(i, 1); };
globalThis.dispatchEvent = (e) => { listeners.filter((l) => l[0] === e.type).forEach((l) => l[1](e)); };
const m = await import(new URL('../../js/services/manual-data.js', import.meta.url));
const { default: qrcode } = await import(new URL('../../js/vendor/qrcode.js', import.meta.url));

let bad = 0;
let n = 0;
function check(name, got, want) {
  n++;
  if (JSON.stringify(got) !== JSON.stringify(want)) { bad++; console.log(`FAIL  ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } else console.log(`ok    ${name}`);
}

// ---- the Wi-Fi code's text ----
check('plain network', m.wifiText({ ssid: 'Maple Street Guest', password: 'porch-light-42' }), 'WIFI:T:WPA;S:Maple Street Guest;P:porch-light-42;;');
check('no password: an open network', m.wifiText({ ssid: 'Cafe', password: '' }), 'WIFI:T:nopass;S:Cafe;;');
check('no name: no code', m.wifiText({ ssid: '', password: 'x' }), '');
check('nothing saved: no code', m.wifiText(null), '');
check('; , : " and \\ get a \\ in front', m.wifiText({ ssid: 'A;B,C', password: 'p:a"s\\s' }), 'WIFI:T:WPA;S:A\\;B\\,C;P:p\\:a\\"s\\\\s;;');
check('other signs are left alone', m.wifiEscape('a-b_c!@$*?= d'), 'a-b_c!@$*?= d');
check('capitals are kept', m.wifiText({ ssid: 'NetGear5G', password: 'XyZ123' }), 'WIFI:T:WPA;S:NetGear5G;P:XyZ123;;');
// The longest a network allows (32 + 63, every sign escaped) still fits in one code.
{
  const qr = qrcode(0, 'M');
  qr.addData(m.wifiText({ ssid: ';'.repeat(32), password: ':'.repeat(63) }));
  let ok = true;
  try { qr.make(); } catch (e) { ok = false; }
  check('the longest name and password still make a code', ok && qr.getModuleCount() > 21, true);
}

// ---- days ----
check('3 months after Oct 2', m.addMonths('2026-10-02', 3), '2027-01-02');
check('1 month after Jan 31 is the end of February', m.addMonths('2027-01-31', 1), '2027-02-28');
check('1 month after Jan 31 in a leap year', m.addMonths('2028-01-31', 1), '2028-02-29');
check('12 months after Feb 29', m.addMonths('2028-02-29', 12), '2029-02-28');
check('6 months after Aug 31', m.addMonths('2026-08-31', 6), '2027-02-28');
check('days from Nov 25 to Jan 2', m.daysBetween('2026-11-25', '2027-01-02'), 38);
check('days across the clocks going back (Nov 1 2026)', m.daysBetween('2026-10-31', '2026-11-02'), 2);
check('days back', m.daysBetween('2026-11-25', '2026-11-20'), -5);
check('day words', m.dayWords('2027-01-02'), 'Jan 2');
check('day words with the year', m.dayWords('2027-03-03', true), 'Mar 3, 2027');

// ---- filters ----
const furnace = { id: 'f1', section: 'filters', name: 'Furnace', size: '16×25×1', note: 'MERV 11', every: 3, changed: '2026-10-02' };
const alarms = { id: 'f2', section: 'filters', name: 'Smoke alarms', size: 'AA ×6', every: 12, changed: '2026-03-08' };
const hood = { id: 'f3', section: 'filters', name: 'Range hood', size: '', every: 0, changed: '2026-01-01' };
const fresh = { id: 'f4', section: 'filters', name: 'Fridge water', size: '', every: 6, changed: '' };
check('furnace: next change', m.nextChange(furnace), '2027-01-02');
check('no rhythm: no next change', m.nextChange(hood), '');
check('never changed: no next change yet', m.nextChange(fresh), '');
check('soonest first', m.filterDates([alarms, hood, furnace, fresh], '2026-11-25').map((f) => [f.entry.id, f.next, f.days]), [['f1', '2027-01-02', 38], ['f2', '2027-03-08', 103]]);
check('late ones lead', m.filterDates([furnace, alarms], '2027-03-10').map((f) => [f.entry.id, f.days]), [['f1', -67], ['f2', -2]]);

// ---- warranties ----
const dish = { id: 'a1', section: 'appliances', name: 'Dishwasher', warranty: '2027-03-03' };
const fridge = { id: 'a2', section: 'appliances', name: 'Fridge', warranty: '2028-06-01' };
const washer = { id: 'a3', section: 'appliances', name: 'Washer', warranty: '2025-01-01' };
const dryer = { id: 'a4', section: 'appliances', name: 'Dryer', warranty: '' };
const apps = [fridge, washer, dish, dryer];
check('next warranty to end', m.nextWarranty(apps, '2026-11-25').entry.id, 'a1');
check('one that already ended is not next', m.nextWarranty([washer, dryer], '2026-11-25'), null);
check('it still counts on its last day', m.nextWarranty(apps, '2027-03-03').days, 0);
check('the day after, the next one', m.nextWarranty(apps, '2027-03-04').entry.id, 'a2');

// ---- the line on Home ----
const line = (list, day) => { const l = m.homeLineFor({ wifi: null, entries: list }, day); return l && [l.text, l.tone, l.href]; };
check('nothing due: no line', line([furnace, alarms, ...apps], '2026-11-25'), null);
check('filter due today', line([furnace, ...apps], '2027-01-02'), ['Change Furnace filter', 'due', '#/manual/filters']);
check('the day before: nothing', line([furnace], '2027-01-01'), null);
check('filter late the day after', line([furnace], '2027-01-03'), ['Change Furnace filter', 'late', '#/manual/filters']);
check('warranty: 31 days before, nothing', line(apps, '2027-01-31'), null);
check('warranty: 30 days before', line(apps, '2027-02-01'), ['Dishwasher warranty ends Mar 3', 'info', '#/manual/appliances']);
check('warranty: on its last day', line(apps, '2027-03-03'), ['Dishwasher warranty ends Mar 3', 'info', '#/manual/appliances']);
check('warranty: gone the day after', line(apps, '2027-03-04'), null);
check('a due filter comes before a warranty', line([furnace, ...apps], '2027-02-10')[0], 'Change Furnace filter');
check('an empty manual: no line', line([], '2026-11-25'), null);

// ---- the menu card ----
check('empty: a way to add', m.menuCardFor({ wifi: null, entries: [] }, '2026-11-25'), { title: 'House manual', lines: [], badge: 0, action: { label: '+ Add', href: '#/manual/add' } });
const full = { wifi: { ssid: 'Maple Street Guest', password: 'porch-light-42' }, entries: [furnace, alarms, ...apps, { id: 'n1', section: 'numbers', name: 'Vet' }, { id: 's1', section: 'shutoffs', name: 'Water' }] };
check('a usual day: at most four lines', m.menuCardFor(full, '2026-11-25'), { title: 'House manual', lines: ['Wi-Fi · Maple Street Guest', 'Furnace filter · Jan 2', 'Shut-offs · 1', 'Numbers · 1'], badge: 0 });
check('a filter due: it leads, with a badge', m.menuCardFor(full, '2027-01-05'), { title: 'House manual', lines: ['Change Furnace filter', 'Wi-Fi · Maple Street Guest', 'Shut-offs · 1', 'Numbers · 1'], badge: 1 });
check('the card never says the password', JSON.stringify(m.menuCardFor(full, '2026-11-25')).indexOf('porch') < 0, true);

// ---- saving ----
const off = m.onChanged(() => { fired++; });
check('starts empty', [m.isEmpty(), m.manual().entries.length, m.homeLine('2026-11-25')], [true, 0, null]);
m.saveWifi({ ssid: 'Maple Street Guest', password: 'porch-light-42' });
check('Wi-Fi saved', m.manual().wifi, { ssid: 'Maple Street Guest', password: 'porch-light-42' });
const a = m.saveEntry({ section: 'shutoffs', name: '  Main   water ', where: 'Basement', note: 'Turn right', photos: ['p1', 'p2', 'p3'], phone: '555' });
check('an entry keeps only what its section has, two photos at most', [a.name, a.where, a.photos, 'phone' in a], ['Main water', 'Basement', ['p1', 'p2'], false]);
const f = m.saveEntry({ section: 'filters', name: 'Furnace', size: '16×25×1', every: 3, changed: '2026-10-02' });
const p = m.saveEntry({ section: 'paint', name: 'Pale Oak', where: 'Living room', color: '#dcd3c6', code: 'OC-20', finish: 'Eggshell', brand: 'Benjamin Moore', photos: ['p1'] });
check('paint: colour kept, no photos', [p.color, p.photos], ['#DCD3C6', []]);
check('a room with no colour name is named after the room', m.cleanEntry({ id: 'x', section: 'paint', where: 'Hall' }).name, 'Hall');
let threw = '';
try { m.saveEntry({ section: 'numbers', name: '   ' }); } catch (e) { threw = e.message; }
check('no name: not saved', threw, 'Name it first');
check('a bad warranty day is dropped', m.cleanEntry({ id: 'x', section: 'appliances', name: 'Oven', warranty: 'soon' }).warranty, '');
check('three saved', m.entries().map((e) => e.section), ['shutoffs', 'filters', 'paint']);
m.saveEntry(Object.assign({}, a, { where: 'Garage' }));
check('saving again replaces, in place', m.entries().map((e) => [e.id === a.id, e.where || '']).slice(0, 1), [[true, 'Garage']]);
const gone = m.removeEntry(a.id);
check('removed', m.entries().length, 2);
m.putBack(gone);
check('Undo puts it back where it was', m.entries().map((e) => e.id), [a.id, f.id, p.id]);
// The filter comes due, and one tap on Home marks it changed.
const home = m.homeLine('2027-01-02');
check('Home: the filter is due', [home.text, home.tone, typeof home.done], ['Change Furnace filter', 'due', 'function']);
const before = m.markChanged(f.id, '2027-01-02');
check('changed: the next day moves on three months', [before, m.nextChange(m.entries('filters')[0]), m.homeLine('2027-01-02')], ['2026-10-02', '2027-04-02', null]);
m.markChanged(f.id, before);
check('Undo: back to the day before', m.homeLine('2027-01-02').tone, 'due');
m.saveWifi(null);
check('Wi-Fi taken away', m.manual().wifi, null);
check('each change was announced', fired, 10);
off();
m.saveWifi({ ssid: 'X' });
check('and no more once unsubscribed', fired, 10);
store['manual.v1'] = '{not json';
check('a broken save reads as empty', m.isEmpty(), true);
store['manual.v1'] = JSON.stringify({ entries: Array.from({ length: 260 }, (_, i) => ({ id: `e${i}`, section: 'other', name: `Thing ${i}` })) });
check('never more than 200 entries', m.entries().length, 200);

console.log(bad ? `${bad} of ${n} FAILED` : `${n} checks passed`);
process.exit(bad ? 1 : 0);
