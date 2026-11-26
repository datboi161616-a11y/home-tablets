// Bills and renewals: what the household pays and when. Everything stays on this screen
// (localStorage 'bills.v1'); nothing is linked to a bank, nothing is sent anywhere.
//
//   { v: 1,
//     bills: [{ id, name, amount: number|null, varies: bool,
//               repeat: 'monthly'|'yearly'|'weeks'|'once', day: 1-31, month: 0-11, every: weeks,
//               start: 'YYYY-MM-DD'  (the first due date that counts),
//               paidThrough: 'YYYY-MM-DD'|''  (the last due date ticked),
//               who: ''|'split'|<a person's name>, home: -1 (never) | days before it shows on Home }],
//     paid:  [{ pid, bill, name, amount, who, due, at, prev }]   kept 13 months }
//
// Days are 'YYYY-MM-DD' in the screen's own time; they compare as plain text.

const KEY = 'bills.v1';
const EVENT = 'bills-changed';
const MAX_BILLS = 60;
const MAX_PAID = 800;
const KEEP_MONTHS = 13;
export const NAME_MAX = 28;

const two = (n) => String(n).padStart(2, '0');
export const iso = (d) => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
export const parse = (s) => { const p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); };
export const today = () => iso(new Date());
export const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
export const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
const monthLen = (y, m) => new Date(y, m + 1, 0).getDate();
// The day of a month, pulled back to its last day when the month is shorter ("the 31st" in February).
const ymd = (y, m, d) => { const first = new Date(y, m, 1); return iso(new Date(first.getFullYear(), first.getMonth(), Math.min(d, monthLen(first.getFullYear(), first.getMonth())))); };
const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));

// ---------------------------------------------------------------------------------------
// When a bill falls due (no storage: tools/sim/bills-test.mjs checks these by hand)
// ---------------------------------------------------------------------------------------
/** The first due date on or after `from` by the bill's own rule, or null (a one-off that has passed). */
export function nextOn(bill, from) {
  const f = parse(from);
  if (bill.repeat === 'monthly') {
    const c = ymd(f.getFullYear(), f.getMonth(), bill.day);
    return c >= from ? c : ymd(f.getFullYear(), f.getMonth() + 1, bill.day);
  }
  if (bill.repeat === 'yearly') {
    const c = ymd(f.getFullYear(), bill.month, bill.day);
    return c >= from ? c : ymd(f.getFullYear() + 1, bill.month, bill.day);
  }
  if (bill.repeat === 'weeks') {
    if (from <= bill.start) return bill.start;
    const step = 7 * Math.max(1, bill.every || 1);
    return addDays(bill.start, Math.ceil(daysBetween(bill.start, from) / step) * step);
  }
  return from <= bill.start ? bill.start : null;
}

/** The next due date nobody has ticked yet, or null. */
export function nextDue(bill) {
  const from = bill.paidThrough && bill.paidThrough >= bill.start ? addDays(bill.paidThrough, 1) : bill.start;
  return nextOn(bill, from);
}

/** Every due date of a bill from `from` to `to` (both included), never before its start. */
export function occurrences(bill, from, to) {
  const out = [];
  let at = nextOn(bill, from > bill.start ? from : bill.start);
  while (at && at <= to && out.length < 60) {
    out.push(at);
    at = nextOn(bill, addDays(at, 1));
  }
  return out;
}

/** The first and last day of a month. */
export const monthSpan = (y, m) => [ymd(y, m, 1), ymd(y, m, 31)];

/**
 * A month as the timeline draws it: what was ticked (from the paid list, so a bill that
 * has since been removed still shows) and what is still to pay, by due date.
 * [{ bill, name, amount, varies, who, due, paid, pid }]
 */
export function monthItems(state, y, m) {
  const [from, to] = monthSpan(y, m);
  const items = state.paid.filter((p) => p.due >= from && p.due <= to)
    .map((p) => ({ bill: p.bill, name: p.name, amount: p.amount, varies: false, who: p.who, due: p.due, paid: true, pid: p.pid }));
  state.bills.forEach((b) => {
    const first = nextDue(b);
    if (!first) return;
    occurrences(b, first > from ? first : from, to)
      .forEach((due) => items.push({ bill: b.id, name: b.name, amount: b.amount, varies: !!b.varies, who: b.who, due, paid: false, pid: '' }));
  });
  return items.sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0));
}

/**
 * This month's money: { left, paid, count } where `left` is everything not ticked that is
 * due by the end of the month (late ones too), `paid` what was ticked for this month's
 * due dates, `count` how many are still to pay.
 */
export function monthMoney(state, day = today()) {
  const d = parse(day);
  const [from, to] = monthSpan(d.getFullYear(), d.getMonth());
  let left = 0, count = 0;
  state.bills.forEach((b) => {
    const first = nextDue(b);
    if (!first || first > to) return;
    const n = occurrences(b, first, to).length;
    count += n;
    left += n * (b.amount || 0);
  });
  const paid = state.paid.filter((p) => p.due >= from && p.due <= to).reduce((s, p) => s + (p.amount || 0), 0);
  return { left: cents(left), paid: cents(paid), count };
}

/**
 * What each person pays out of a list of month items: a bill with somebody's name is
 * theirs, 'split' is shared evenly between everyone, the rest belongs to nobody.
 * [{ name, total, parts: [{ name, amount }] }] for the people who pay something.
 */
export function shares(items, names) {
  const out = names.map((name) => ({ name, total: 0, parts: [] }));
  items.forEach((it) => {
    if (!it.amount) return;
    if (it.who === 'split' && out.length) {
      out.forEach((p) => { p.total += it.amount / out.length; p.parts.push({ name: it.name, amount: it.amount / out.length }); });
    } else {
      const p = out.find((x) => x.name === it.who);
      if (p) { p.total += it.amount; p.parts.push({ name: it.name, amount: it.amount }); }
    }
  });
  out.forEach((p) => { p.total = cents(p.total); });
  return out.filter((p) => p.parts.length);
}

/** "Who pays" is only drawn once a bill uses it and there are two or more people to tell apart. */
export const usesWho = (state, peopleCount) => peopleCount >= 2 && state.bills.some((b) => b.who);

// ---------------------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------------------
const cents = (n) => Math.round(n * 100) / 100;
/** $1,650 · $142.60 */
export function money(n) {
  const v = cents(Math.abs(+n || 0));
  const whole = Math.floor(v);
  const c = Math.round((v - whole) * 100);
  return `$${String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${c ? `.${two(c)}` : ''}`;
}
/** What a bill costs in words: "$85", "about $140", or '' when nobody knows yet. */
export const amountText = (b) => (b.amount ? `${b.varies ? 'about ' : ''}${money(b.amount)}` : '');

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const monthName = (m) => MONTHS[m];
export const weekday = (day) => WEEKDAYS[parse(day).getDay()];
/** Nov 27 (with the year when it is not this one) */
export function shortDate(day, from = today()) {
  const d = parse(day);
  return `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}${day.slice(0, 4) !== from.slice(0, 4) ? `, ${d.getFullYear()}` : ''}`;
}
/** Today · Tomorrow · Friday · Tue, Dec 1 · Late · Nov 20  →  { text, soon, late } */
export function dueWords(due, from = today()) {
  const n = daysBetween(from, due);
  if (n < 0) return { text: `Late · ${shortDate(due, from)}`, soon: true, late: true };
  if (n === 0) return { text: 'Today', soon: true, late: false };
  if (n === 1) return { text: 'Tomorrow', soon: true, late: false };
  if (n < 6) return { text: weekday(due), soon: true, late: false };
  return { text: `${weekday(due).slice(0, 3)}, ${shortDate(due, from)}`, soon: false, late: false };
}
const nth = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;
/** Every month · Every year · Every 2 weeks · Once */
export function repeatWords(b) {
  if (b.repeat === 'monthly') return 'Every month';
  if (b.repeat === 'yearly') return 'Every year';
  if (b.repeat === 'weeks') return b.every > 1 ? `Every ${b.every} weeks` : 'Every week';
  return 'Once';
}
/** 10th of the month · Mar 14 · Fri, Nov 27 */
export function dueRuleWords(b, from = today()) {
  if (b.repeat === 'monthly') return `${nth(b.day)} of the month`;
  if (b.repeat === 'yearly') return `${MONTHS[b.month].slice(0, 3)} ${b.day}`;
  return `${weekday(b.start).slice(0, 3)}, ${shortDate(b.start, from)}`;
}

// Which picture a bill gets, from its name (the pictures themselves are in the screen).
const ICON_WORDS = [
  ['electric', /electric|power|energy|hydro/], ['water', /water|sewer/], ['gas', /\bgas\b|heat|oil|propane/],
  ['internet', /internet|wi-?fi|broadband|cable|fib(er|re)/], ['phones', /phone|mobile|cell|verizon|t-mobile|at&t/],
  ['tv', /netflix|hulu|disney|hbo|\bmax\b|prime|tv|youtube|stream|paramount|peacock/], ['music', /spotify|music|audible|pandora/],
  ['rent', /rent|mortgage|hoa|house|home|property|condo/], ['car', /\bcars?\b|auto|vehicle|truck|lease|parking/],
  ['card', /card|visa|amex|loan|bank/], ['shield', /insurance|life|health|dental|renters/],
];
export function iconFor(name) {
  const n = String(name || '').toLowerCase();
  const hit = ICON_WORDS.find((w) => w[1].test(n));
  return hit ? hit[0] : 'bill';
}
// "Electric bill due Friday" but "Rent due Friday".
function homeName(name) {
  const n = name.trim();
  if (/^phones?$/i.test(n)) return 'Phone bill';
  return /^(electric|water|gas|internet|power|heat|gas heat)$/i.test(n) ? `${n} bill` : n;
}

/** The words of the Home line for a due date. */
export function homeText(name, due, from = today()) {
  const n = daysBetween(from, due);
  const label = homeName(name);
  if (n < 0) return `${label} was due ${n > -7 ? weekday(due) : shortDate(due, from)}`;
  return `${label} due ${n === 0 ? 'today' : n === 1 ? 'tomorrow' : n < 7 ? weekday(due) : shortDate(due, from)}`;
}

// ---------------------------------------------------------------------------------------
// What the screen keeps
// ---------------------------------------------------------------------------------------
const num = (v, lo, hi, or) => { const n = Math.round(+v); return n >= lo && n <= hi ? n : or; };
function cleanBill(b) {
  if (!b || typeof b !== 'object' || !String(b.name || '').trim() || !isDay(b.start)) return null;
  const amount = +b.amount > 0 && +b.amount < 1e6 ? cents(+b.amount) : null;
  return {
    id: String(b.id || '').slice(0, 24) || newId(),
    name: String(b.name).trim().slice(0, NAME_MAX),
    amount,
    varies: !!b.varies,
    repeat: ['monthly', 'yearly', 'weeks', 'once'].indexOf(b.repeat) >= 0 ? b.repeat : 'monthly',
    day: num(b.day, 1, 31, 1),
    month: num(b.month, 0, 11, 0),
    every: num(b.every, 1, 52, 1),
    start: b.start,
    paidThrough: isDay(b.paidThrough) ? b.paidThrough : '',
    who: String(b.who || '').slice(0, 40),
    home: [-1, 0, 3, 7].indexOf(+b.home) >= 0 ? +b.home : 3,
  };
}
function cleanPaid(p) {
  if (!p || typeof p !== 'object' || !isDay(p.due) || !isDay(p.at)) return null;
  return {
    pid: String(p.pid || '').slice(0, 24) || newId(), bill: String(p.bill || '').slice(0, 24), name: String(p.name || 'Bill').slice(0, NAME_MAX),
    amount: +p.amount > 0 ? cents(+p.amount) : null, who: String(p.who || '').slice(0, 40), due: p.due, at: p.at, prev: isDay(p.prev) ? p.prev : '',
  };
}
let seq = 0;
function newId() { seq += 1; return `b${Date.now().toString(36)}${seq.toString(36)}`; }

/** Everything, tidied: paid history older than 13 months goes, and so do one-offs paid that long ago. */
export function load() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { raw = null; }
  const d = new Date();
  const oldest = ymd(d.getFullYear(), d.getMonth() - KEEP_MONTHS, 1);
  const bills = (raw && Array.isArray(raw.bills) ? raw.bills : []).map(cleanBill).filter(Boolean)
    .filter((b) => !(b.repeat === 'once' && b.paidThrough && b.paidThrough < oldest)).slice(0, MAX_BILLS);
  const paid = (raw && Array.isArray(raw.paid) ? raw.paid : []).map(cleanPaid).filter(Boolean)
    .filter((p) => p.due >= oldest).slice(-MAX_PAID);
  return { v: 1, bills, paid };
}
function save(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage off or full: it lasts until the screen reloads */ }
  try { window.dispatchEvent(new Event(EVENT)); } catch (e) { /* no window (tests) */ }
}

/**
 * Add a bill or change one (give its id). `draft` is what the sheet holds:
 * { name, amount, varies, repeat, day, month, every, date (for yearly, weeks and once), who, home }.
 * Returns the bill, or null (no name, or the list is full).
 */
export function saveBill(draft, id = '', day = today()) {
  const state = load();
  const old = id ? state.bills.find((b) => b.id === id) : null;
  if (!old && state.bills.length >= MAX_BILLS) return null;
  const b = cleanBill(Object.assign({}, old || { id: newId(), paidThrough: '' }, draft, { start: day }));
  if (!b) return null;
  const date = isDay(draft.date) ? draft.date : day;
  if (b.repeat === 'yearly') { b.month = parse(date).getMonth(); b.day = parse(date).getDate(); }
  // The first due date that counts: the day picked, or the next time the rule comes round.
  b.start = b.repeat === 'weeks' || b.repeat === 'once' ? date : nextOn(Object.assign({}, b, { start: day }), day);
  if (old) {
    const same = old.repeat === b.repeat && old.day === b.day && old.month === b.month && old.every === b.every && (b.repeat === 'monthly' || b.repeat === 'yearly' || old.start === b.start);
    if (same) b.start = old.start; // only the name, amount or who changed: nothing moves
    state.bills[state.bills.indexOf(old)] = b;
  } else state.bills.push(b);
  save(state);
  return b;
}

/** Take a bill off the list (what was paid stays in the history). Returns what `restoreBill` needs for Undo. */
export function removeBill(id) {
  const state = load();
  const at = state.bills.findIndex((b) => b.id === id);
  if (at < 0) return null;
  const bill = state.bills.splice(at, 1)[0];
  save(state);
  return { bill, at };
}
export function restoreBill(removed) {
  if (!removed || !removed.bill) return;
  const state = load();
  if (state.bills.some((b) => b.id === removed.bill.id)) return;
  state.bills.splice(Math.min(removed.at, state.bills.length), 0, removed.bill);
  save(state);
}

/** Tick a bill's next due date as paid. Returns the paid line (its pid undoes it), or null. */
export function markPaid(id, day = today()) {
  const state = load();
  const b = state.bills.find((x) => x.id === id);
  const due = b && nextDue(b);
  if (!due) return null;
  const line = { pid: newId(), bill: b.id, name: b.name, amount: b.amount, who: b.who, due, at: day, prev: b.paidThrough };
  state.paid.push(line);
  b.paidThrough = due;
  save(state);
  return line;
}
/** Can this paid line be un-ticked? Only a bill's latest one (or one whose bill is gone). */
export function canUnpay(state, p) {
  const b = state.bills.find((x) => x.id === p.bill);
  return !b || b.paidThrough === p.due;
}
/** Un-tick a paid line: the bill is due again. */
export function unmarkPaid(pid) {
  const state = load();
  const at = state.paid.findIndex((p) => p.pid === pid);
  if (at < 0 || !canUnpay(state, state.paid[at])) return false;
  const p = state.paid.splice(at, 1)[0];
  const b = state.bills.find((x) => x.id === p.bill);
  if (b) b.paidThrough = p.prev;
  save(state);
  return true;
}

/** Bills still to pay, soonest first: [{ bill, due }]. */
export function dueList(state) {
  return state.bills.map((bill) => ({ bill, due: nextDue(bill) })).filter((x) => x.due)
    .sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0));
}

/** Tell `cb` whenever a bill is added, changed, ticked or removed. Returns the way to stop. */
export function onChanged(cb) {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}

// ---------------------------------------------------------------------------------------
// For Home and the menu
// ---------------------------------------------------------------------------------------
/**
 * The one line Home may show: the most pressing bill that is late or inside its
 * "show on Home" days. `done` ticks it (the line then goes, or the next bill takes its place).
 * `icon` is the bill's picture (48px round, markup), as on the Home board.
 */
export function homeLine(day = today()) {
  const hit = dueList(load()).find((x) => x.bill.home >= 0 && daysBetween(day, x.due) <= x.bill.home);
  if (!hit) return null;
  const id = hit.bill.id;
  return {
    text: homeText(hit.bill.name, hit.due, day),
    href: '#/bills',
    done: () => { const l = markPaid(id); return l ? () => unmarkPaid(l.pid) : null; }, // (returns its Undo)
    tone: hit.due < day ? 'late' : 'due',
    icon: billIcon(iconFor(hit.bill.name), 48, true),
  };
}

/** The menu card in words: the next three bills, what is left this month, and how many are late or due today. */
export function menuCard(day = today()) {
  const state = load();
  const list = dueList(state);
  const m = monthMoney(state, day);
  const lines = list.slice(0, 3).map((x) => [x.bill.name, dueWords(x.due, day).text, amountText(x.bill)].filter(Boolean).join(' · '));
  if (m.left > 0) lines.push(`${money(Math.round(m.left))} left`);
  return {
    title: 'Bills',
    lines: list.length ? lines : ['No bills yet'],
    badge: list.filter((x) => x.due <= day).length,
    action: { label: '+ Add a bill', href: '#/bills/add' },
  };
}

// ---------------------------------------------------------------------------------------
// The pictures (painted tiles, one per kind of bill) and the menu card
// ---------------------------------------------------------------------------------------
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// kind: [top colour, bottom colour, the drawing, its colour in the "who pays" bars]
const ICONS = {
  electric: ['#2B3F7A', '#18244F', '<path d="M56 14L30 56h18l-6 30 28-44H52z" fill="#FFD45E" stroke="#E8A93A" stroke-width="2" stroke-linejoin="round"/>', '#FFD45E'],
  tv: ['#B8232F', '#6E1119', '<rect x="22" y="28" width="56" height="40" rx="6" fill="#2A0A0E" opacity=".55"/><path d="M43 36v24l20-12z" fill="#FFF1E8"/><rect x="34" y="72" width="32" height="5" rx="2.5" fill="#2A0A0E" opacity=".55"/>', '#E0525E'],
  rent: ['#C77B4E', '#8A4A2B', '<path d="M18 50L50 24l32 26" fill="none" stroke="#FFF1E2" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><path d="M28 46v32h44V46" fill="#FFF1E2"/><rect x="44" y="58" width="13" height="20" rx="2" fill="#8A4A2B"/><rect x="33" y="52" width="9" height="9" rx="1.5" fill="#F7C873"/><rect x="60" y="52" width="9" height="9" rx="1.5" fill="#F7C873"/>', '#E7C27A'],
  phones: ['#3E6E8E', '#22425A', '<rect x="34" y="18" width="32" height="64" rx="7" fill="#EAF4FA"/><rect x="38" y="26" width="24" height="42" rx="2" fill="#7EB8DA"/><circle cx="50" cy="75" r="3" fill="#22425A"/>', '#7EB8DA'],
  water: ['#2F7FA6', '#1A4F6B', '<path d="M50 18C40 34 30 46 30 59a20 20 0 0 0 40 0c0-13-10-25-20-41z" fill="#BFE8FA"/><path d="M40 60a10 10 0 0 0 9 10" stroke="#FFFFFF" stroke-width="4" fill="none" stroke-linecap="round"/>', '#BFE8FA'],
  gas: ['#5A3A6E', '#331E42', '<path d="M50 16c4 14 22 22 22 42a22 22 0 0 1-44 0c0-10 6-16 10-22 2 8 6 11 9 11-3-11 0-22 3-31z" fill="#FF9B4A"/><path d="M50 50c2 7 11 11 11 20a11 11 0 0 1-22 0c0-6 5-9 6-13 1 4 3 5 5 5-1-4-1-8 0-12z" fill="#FFE07A"/>', '#FF9B4A'],
  internet: ['#2E6B5E', '#18413A', '<path d="M20 44a42 42 0 0 1 60 0" fill="none" stroke="#D8F5EC" stroke-width="7" stroke-linecap="round"/><path d="M31 56a26 26 0 0 1 38 0" fill="none" stroke="#D8F5EC" stroke-width="7" stroke-linecap="round"/><circle cx="50" cy="70" r="7" fill="#D8F5EC"/>', '#7FD8C4'],
  music: ['#2D8A4E', '#165C30', '<circle cx="50" cy="50" r="30" fill="#0F3A20" opacity=".55"/><path d="M34 42c11-4 22-3 32 2M36 52c9-3 18-2 26 2M38 61c7-2 14-1 20 2" stroke="#D9F7E2" stroke-width="5" fill="none" stroke-linecap="round"/>', '#4FB874'],
  car: ['#4C6A3A', '#2C4221', '<path d="M22 60l6-16c2-5 5-8 11-8h22c6 0 9 3 11 8l6 16z" fill="#F2E6C9"/><rect x="18" y="56" width="64" height="16" rx="6" fill="#F2E6C9"/><path d="M34 46l3-6h26l3 6z" fill="#8EC0D9"/><circle cx="32" cy="74" r="7" fill="#2A2A2A"/><circle cx="68" cy="74" r="7" fill="#2A2A2A"/><circle cx="24" cy="63" r="3" fill="#FFD45E"/><circle cx="76" cy="63" r="3" fill="#FFD45E"/>', '#A9C98E'],
  card: ['#5B4A8A', '#33285A', '<rect x="18" y="30" width="64" height="42" rx="7" fill="#EDE6FA"/><rect x="18" y="40" width="64" height="9" fill="#33285A"/><rect x="26" y="57" width="20" height="7" rx="2" fill="#E8B84A"/>', '#C7B5F0'],
  shield: ['#8A3F5A', '#57223A', '<path d="M50 16l26 9v20c0 18-11 31-26 39-15-8-26-21-26-39V25z" fill="#FBE4EA"/><path d="M38 50l9 9 16-18" fill="none" stroke="#8A3F5A" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>', '#F2A7B8'],
  bill: ['#6B6250', '#3F392D', '<path d="M28 16h44v66l-7-5-7 5-8-5-8 5-7-5-7 5z" fill="#FBF4E4"/><rect x="36" y="28" width="28" height="5" rx="2.5" fill="#CFC3A6"/><rect x="36" y="40" width="20" height="5" rx="2.5" fill="#CFC3A6"/><rect x="36" y="56" width="28" height="7" rx="3" fill="#86B899"/>', '#D9CFB6'],
};
/** A bill's painted tile. `round`: a full circle (the Home line), else a rounded square. */
export function billIcon(kind, size = 72, round = false) {
  const k = ICONS[kind] ? kind : 'bill';
  const id = `bil-${k}${size}${round ? 'r' : ''}`;
  return `<svg width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true" style="display:block;flex:none"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${ICONS[k][0]}"/><stop offset="1" stop-color="${ICONS[k][1]}"/></linearGradient></defs>`
    + `<rect width="100" height="100" rx="${round ? 50 : 27}" fill="url(#${id})"/><ellipse cx="34" cy="18" rx="30" ry="12" fill="#FFFFFF" opacity=".12"/>${ICONS[k][2]}</svg>`;
}
/** The colour a bill gets in the "who pays" bars. */
export const billTint = (kind) => (ICONS[kind] || ICONS.bill)[3];

/** The paid bills on their spike (the right-hand panel, and the picture when there are no bills yet). */
export function spikeArt(width = 330) {
  return `<svg width="${width}" height="${Math.round((width * 150) / 330)}" viewBox="0 0 330 150" aria-hidden="true" style="display:block">
    <ellipse cx="165" cy="138" rx="120" ry="9" fill="#000" opacity=".25"/>
    <rect x="106" y="124" width="118" height="16" rx="6" fill="#7A5A3A"/><rect x="106" y="124" width="118" height="5" rx="2.5" fill="#9A7650"/>
    <path d="M165 10v116" stroke="#C9CED2" stroke-width="4" stroke-linecap="round"/>
    <g transform="rotate(-8 165 104)"><rect x="112" y="94" width="106" height="26" rx="3" fill="#EFE4CB"/></g>
    <g transform="rotate(6 165 82)"><rect x="110" y="70" width="110" height="28" rx="3" fill="#F6EEDB"/></g>
    <g transform="rotate(-4 165 56)"><rect x="114" y="42" width="102" height="30" rx="3" fill="#FBF4E4"/><rect x="128" y="50" width="38" height="5" rx="2.5" fill="#D9CFB6"/><rect x="128" y="60" width="26" height="5" rx="2.5" fill="#D9CFB6"/><g transform="rotate(-14 188 57)"><rect x="168" y="47" width="44" height="20" rx="4" fill="none" stroke="#3F9A63" stroke-width="2.5"/><text x="190" y="62" text-anchor="middle" font-family="Outfit" font-weight="700" font-size="13" fill="#3F9A63">PAID</text></g></g>
  </svg>`;
}

/** The menu card's background (deep green). */
export const menuCardBg = 'linear-gradient(180deg, #24493E 0%, #12291F 100%)';
/** The inside of the menu card as drawn: the next three bills, what is left this month, + Add a bill. */
export function menuCardHtml(day = today()) {
  const state = load();
  const list = dueList(state).slice(0, 3);
  const m = monthMoney(state, day);
  const go = (label) => `<div style="position:absolute;left:26px;right:26px;bottom:24px;min-height:58px;border-radius:18px;display:flex;align-items:center;justify-content:center;font:600 18px Inter,sans-serif;background:rgba(255,255,255,.14)">${label}</div>`;
  const head = `<div style="display:flex;align-items:baseline"><div style="font:700 27px Outfit,sans-serif">Bills</div>${list.length && m.left > 0 ? `<div style="margin-left:auto;font:600 17px Inter,sans-serif;color:#A9D8BE">${money(Math.round(m.left))} left</div>` : ''}</div>`;
  if (!list.length) {
    return `${head}<div style="margin-top:56px;display:flex;justify-content:center">${spikeArt(250)}</div>
      <div style="margin-top:18px;text-align:center;font:italic 500 22px Fraunces,Georgia,serif;color:#DCE8E2">${state.bills.length ? 'All paid.' : 'No bills yet.'}</div>${go('+ Add a bill')}`;
  }
  return `${head}<div style="margin-top:6px">${list.map((x) => {
    const w = dueWords(x.due, day);
    return `<div style="display:flex;align-items:center;gap:12px;height:76px;border-radius:18px;background:#FBF4E4;color:#2B2A22;padding:0 10px;margin-top:10px">${billIcon(iconFor(x.bill.name), 46)}
      <div style="flex:1;min-width:0"><div style="font:600 19px Inter,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(x.bill.name)}</div><div style="font:600 15px Inter,sans-serif;color:${w.soon ? '#B5502E' : '#6E6A5A'}">${esc(w.text)}</div></div>
      <div style="font:700 21px Outfit,sans-serif;white-space:nowrap">${esc(amountText(x.bill))}</div></div>`;
  }).join('')}</div>${go('+ Add a bill')}`;
}
