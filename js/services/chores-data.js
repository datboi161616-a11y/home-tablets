// Chores that rotate: what this screen keeps (localStorage 'chores.v1'), and the sums.
//
// { v: 1,
//   chores: [{ id, name, art, size: 1|2|3 (Quick, Medium, Big), evening: bool,
//              repeat: { kind: 'weekly', days: [0..6] (0 = Sunday) }
//                    | { kind: 'every', n, unit: 'day'|'week'|'month' },
//              start: 'YYYY-MM-DD' (first time), turns: [name] (the order; [] = no turns),
//              next: 'YYYY-MM-DD' (the day it is next due; before today = late),
//              turn: n (whose turn that is: turns[turn % turns.length]),
//              pick: 'behind' (whoever's behind; otherwise turns go in the fixed order),
//              who: name (pick 'behind' only: whose the open turn is) }],
//   log: [{ id, c: chore id, name, art, size, who (who gets the marble; '' = nobody),
//           due, at (ms), kind: 'done'|'skip', prevNext, prevTurn, prevWho }] }
//
// A chore has ONE open turn at a time (`next`). Ticking or skipping it moves `next` on to
// the following day it falls on and passes the turn to the next person; a late chore does
// not pile up. "Whoever's behind": when a turn is dealt with, the next one goes to whoever
// of the chore's people has the fewest points (sizes ticked, as in the jars) in the month it
// falls in; ties go to whoever did this chore longest ago, then to the order tapped. Days are 'YYYY-MM-DD' words in the screen's own time, so they sort as text.
import { getFamily } from './family.js';

const KEY = 'chores.v1';
const EVENT = 'chores-changed';
const MAX_CHORES = 40;
const MAX_LOG = 600;
const KEEP_DAYS = 100; // the jars count this month; older marbles are forgotten

// ---------------------------------------------------------------------------------------
// Days
// ---------------------------------------------------------------------------------------
const two = (n) => (n < 10 ? `0${n}` : String(n));
export const ymd = (d) => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
/** 'YYYY-MM-DD' -> a Date at noon that day (noon: clock changes can't push it into a neighbour). */
export function toDate(s) {
  const p = String(s).split('-');
  return new Date(+p[0], +p[1] - 1, +p[2], 12);
}
export function addDays(s, n) {
  const d = toDate(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
}
/** The same day of the month, n months on (Jan 31 + 1 month = Feb 28). */
export function addMonths(s, n) {
  const p = String(s).split('-');
  const first = new Date(+p[0], +p[1] - 1 + n, 1, 12);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0, 12).getDate();
  return ymd(new Date(first.getFullYear(), first.getMonth(), Math.min(+p[2], last), 12));
}
export const weekday = (s) => toDate(s).getDay();
export const daysBetween = (a, b) => Math.round((toDate(b) - toDate(a)) / 86400000);

// ---------------------------------------------------------------------------------------
// When a chore falls
// ---------------------------------------------------------------------------------------
/** The first day the chore falls on, on or after `from` (never before its own first time). */
export function firstDue(chore, from) {
  const r = chore.repeat;
  const start = chore.start;
  const at = from && from > start ? from : start;
  if (r.kind === 'weekly') {
    for (let i = 0; i < 7; i++) {
      const d = addDays(at, i);
      if (r.days.indexOf(weekday(d)) >= 0) return d;
    }
    return at;
  }
  if (at === start) return start;
  if (r.unit === 'month') {
    for (let k = 1; k < 600; k++) {
      const d = addMonths(start, k * r.n);
      if (d >= at) return d;
    }
    return at;
  }
  const step = r.n * (r.unit === 'week' ? 7 : 1);
  return addDays(start, Math.ceil(daysBetween(start, at) / step) * step);
}

/**
 * The day it falls on after the turn that was due on `due` is dealt with today.
 * Weekly: the next chosen weekday. Every N weeks or months: the same weekday / day of the
 * month, the first one still ahead. Every N days: N days after it was really done.
 */
export function nextDue(chore, due, today) {
  const r = chore.repeat;
  const base = today > due ? today : due;
  if (r.kind === 'weekly') {
    for (let i = 1; i <= 7; i++) {
      const d = addDays(base, i);
      if (r.days.indexOf(weekday(d)) >= 0) return d;
    }
    return addDays(base, 7);
  }
  if (r.unit === 'day') return addDays(base, r.n);
  for (let k = 1; k < 600; k++) {
    const d = r.unit === 'month' ? addMonths(due, k * r.n) : addDays(due, k * r.n * 7);
    if (d > base) return d;
  }
  return addDays(base, 1);
}

/** The people who still take turns at it (somebody taken out of Settings drops out). */
export function turnsOf(chore, names) {
  const t = chore.turns || [];
  return names ? t.filter((n) => names.indexOf(n) >= 0) : t;
}
/** Whose turn number `turn` is ('' when the chore has no turns). */
export function whoAt(chore, turn, names) {
  const t = turnsOf(chore, names);
  return t.length ? t[((turn % t.length) + t.length) % t.length] : '';
}

// ---------------------------------------------------------------------------------------
// Whoever's behind
// ---------------------------------------------------------------------------------------
const pointsOf = (log, month) => { const t = tally(log, month); const out = {}; Object.keys(t).forEach((n) => { out[n] = t[n].points; }); return out; };
/** { name: ms } when each person last ticked chore `id`. */
function lastDone(log, id) {
  const out = {};
  log.forEach((e) => { if (e.c === id && e.kind === 'done' && e.who && !(out[e.who] >= e.at)) out[e.who] = e.at; });
  return out;
}
/** Fewest points, then longest since doing this chore (never = longest), then first tapped. */
function behindOf(people, pts, last) {
  let best = '';
  people.forEach((n) => {
    const a = pts[n] || 0;
    const b = pts[best] || 0;
    if (!best || a < b || (a === b && (last[n] || 0) < (last[best] || 0))) best = n;
  });
  return best;
}
/** Whose a 'behind' chore's open turn should be, from the log (points in the month it falls in). */
export function pickBehind(log, chore, names) {
  return behindOf(turnsOf(chore, names), pointsOf(log, String(chore.next).slice(0, 7)), lastDone(log, chore.id));
}
/** Whose the open turn is ('' = nobody). Somebody taken out of Settings: picked again without them. */
export function openWho(state, chore, names) {
  if (chore.pick !== 'behind') return whoAt(chore, chore.turn, names);
  return turnsOf(chore, names).indexOf(chore.who) >= 0 ? chore.who : pickBehind(state.log, chore, names);
}

/**
 * Every chore's turns from its open one up to `until`, soonest first: [{ chore, date, who, late }].
 * Later 'behind' turns are worked out as if each turn before them is done on its day.
 */
export function forecast(state, today, until, names) {
  const pts = {};
  const ptsIn = (m) => pts[m] || (pts[m] = pointsOf(state.log, m));
  const last = {};
  const lastOf = (id) => last[id] || (last[id] = lastDone(state.log, id));
  const runs = state.chores.map((c) => ({ c, d: c.next, t: c.turn, who: openWho(state, c, names), n: 0 }));
  const out = [];
  for (;;) {
    let r = null;
    runs.forEach((x) => { if (x.n < 40 && x.d <= until && (!r || x.d < r.d)) r = x; });
    if (!r) break;
    const c = r.c;
    out.push({ chore: c, date: r.d, who: r.who, late: r.d < today });
    r.n++;
    if (r.who) {
      const p = ptsIn(r.d.slice(0, 7));
      p[r.who] = (p[r.who] || 0) + c.size;
      lastOf(c.id)[r.who] = toDate(r.d).getTime();
    }
    r.d = nextDue(c, r.d, today);
    r.t++;
    r.who = c.pick === 'behind' ? behindOf(turnsOf(c, names), ptsIn(r.d.slice(0, 7)), lastOf(c.id)) : whoAt(c, r.t, names);
  }
  return out;
}
/** One chore's turns from the open one up to `until`: [{ date, who, late }]. */
export function project(chore, today, until, names, log = []) {
  return forecast({ chores: [chore], log }, today, until, names).map((x) => ({ date: x.date, who: x.who, late: x.late }));
}

// ---------------------------------------------------------------------------------------
// Changing things (each returns a new state; nothing here touches storage)
// ---------------------------------------------------------------------------------------
const copy = (state) => ({ v: 1, chores: state.chores.map((c) => Object.assign({}, c)), log: state.log.slice() });
let seq = 0;
const newId = (now) => `${(now || Date.now()).toString(36)}${(seq++).toString(36)}`;

/**
 * Deal with a chore's open turn. kind 'done': a marble for `who` (left out = whoever's turn
 * it was). kind 'skip': nobody gets one. Either way the turn passes on.
 */
export function settle(state, id, { kind = 'done', who, now = Date.now(), names } = {}) {
  const next = copy(state);
  const c = next.chores.find((x) => x.id === id);
  if (!c) return next;
  const today = ymd(new Date(now));
  const turnOf = openWho(next, c, names);
  next.log.push({
    id: newId(now), c: c.id, name: c.name, art: c.art, size: c.size,
    who: kind === 'skip' ? '' : (who == null ? turnOf : who),
    due: c.next, at: now, kind, prevNext: c.next, prevTurn: c.turn, prevWho: c.pick === 'behind' ? turnOf : undefined,
  });
  c.next = nextDue(c, c.next, today);
  c.turn += 1;
  if (c.pick === 'behind') c.who = pickBehind(next.log, c, names);
  return next;
}

/** Take a tick back: the marble goes, and the chore is that person's turn again. */
export function unsettle(state, logId) {
  const next = copy(state);
  const i = next.log.findIndex((e) => e.id === logId);
  if (i < 0) return next;
  const e = next.log[i];
  next.log.splice(i, 1);
  const c = next.chores.find((x) => x.id === e.c);
  // (Only when nothing has happened to the chore since.)
  if (c && !next.log.some((x) => x.c === e.c && x.at > e.at)) { c.next = e.prevNext; c.turn = e.prevTurn; if (e.prevWho) c.who = e.prevWho; }
  return next;
}

/** This month's marbles: { name: { count, points } } for ticks in month 'YYYY-MM'. */
export function tally(log, month) {
  const out = {};
  log.forEach((e) => {
    if (e.kind !== 'done' || !e.who || ymd(new Date(e.at)).slice(0, 7) !== month) return;
    const t = out[e.who] || (out[e.who] = { count: 0, points: 0 });
    t.count += 1;
    t.points += e.size;
  });
  return out;
}

/** Today's cards: the open turns that are due (late ones first), then what was ticked today. */
export function todayList(state, today, names) {
  const open = state.chores.filter((c) => c.next <= today)
    .map((c) => ({ chore: c, due: c.next, late: c.next < today, who: openWho(state, c, names), done: null }));
  open.sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : (a.chore.evening ? 1 : 0) - (b.chore.evening ? 1 : 0)));
  const done = state.log.filter((e) => e.kind === 'done' && ymd(new Date(e.at)) === today)
    .map((e) => ({ chore: state.chores.find((c) => c.id === e.c) || null, due: e.due, late: false, who: e.who, done: e }));
  return open.concat(done);
}

// ---------------------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------------------
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const dayWord = (s) => DAYS[weekday(s)];
export const monthWord = (s) => MONTHS[+String(s).split('-')[1] - 1];
/** "Nov 27" */
export const shortDate = (s) => `${monthWord(s).slice(0, 3)} ${+String(s).split('-')[2]}`;
/** "Wednesdays", "Mon, Thu", "Every day", "Every 3 months". */
export function repeatWords(r) {
  if (r.kind === 'weekly') {
    const d = r.days.slice().sort((a, b) => a - b);
    if (d.length === 7) return 'Every day';
    if (d.length === 1) return `${DAYS[d[0]]}s`;
    return d.map((x) => DAYS[x].slice(0, 3)).join(', ');
  }
  const unit = r.unit === 'day' ? 'day' : r.unit === 'week' ? 'week' : 'month';
  return r.n === 1 ? `Every ${unit}` : `Every ${r.n} ${unit}s`;
}

// ---------------------------------------------------------------------------------------
// The painted tiles (one per kind of chore, picked from the chore's name)
// ---------------------------------------------------------------------------------------
const ART = {
  bins: ['#3E7A4A', '#24502E', '<rect x="28" y="34" width="44" height="50" rx="5" fill="#2E3A40"/><rect x="24" y="26" width="52" height="10" rx="4" fill="#47565E"/><rect x="44" y="20" width="12" height="7" rx="3" fill="#47565E"/><path d="M38 44v30M50 44v30M62 44v30" stroke="#5E6E76" stroke-width="3" stroke-linecap="round"/><circle cx="32" cy="85" r="5" fill="#1A1F22"/><circle cx="68" cy="85" r="5" fill="#1A1F22"/>'],
  plants: ['#6E9A3C', '#46661F', '<path d="M50 56c-2-14 4-28 18-32-1 15-8 26-18 32z" fill="#BFE88A"/><path d="M50 58c-4-12-14-18-24-17 2 11 11 17 24 17z" fill="#93D05A"/><path d="M50 58V42" stroke="#3E6A1A" stroke-width="3"/><path d="M32 58h36l-5 26H37z" fill="#D9774A"/><rect x="30" y="56" width="40" height="7" rx="3" fill="#E8915F"/>'],
  laundry: ['#4D7FC4', '#2C5590', '<path d="M24 46h52l-6 34H30z" fill="#D9A766"/><path d="M28 52h44M29 60h42M30 68h40" stroke="#B5844A" stroke-width="2.5"/><path d="M30 46c2-10 10-14 16-11 4-7 16-6 18 2 6-2 12 2 12 9z" fill="#FFFFFF"/><path d="M44 40c4 2 8 2 12 0" stroke="#F4A3B4" stroke-width="4" fill="none" stroke-linecap="round"/>'],
  fridge: ['#3F8FA0', '#22606C', '<rect x="30" y="16" width="40" height="70" rx="6" fill="#F2F7F8"/><path d="M30 42h40" stroke="#B9CBD0" stroke-width="3"/><path d="M38 26v10M38 50v14" stroke="#8EA4AA" stroke-width="4" stroke-linecap="round"/><path d="M60 22l3 4 4-3" stroke="#7FC8E6" stroke-width="2.5" fill="none" stroke-linecap="round"/><circle cx="66" cy="64" r="2.5" fill="#7FC8E6"/><circle cx="62" cy="72" r="2" fill="#7FC8E6"/>'],
  vacuum: ['#9A5BB0', '#653A78', '<path d="M40 20c-6 0-8 6-6 12l10 30" fill="none" stroke="#F0E2F6" stroke-width="5" stroke-linecap="round"/><rect x="34" y="58" width="36" height="20" rx="8" fill="#F0E2F6"/><circle cx="40" cy="80" r="5" fill="#2A1C30"/><circle cx="64" cy="80" r="5" fill="#2A1C30"/><rect x="48" y="62" width="16" height="6" rx="3" fill="#C49AD4"/>'],
  sheets: ['#C0617A', '#86364C', '<rect x="16" y="44" width="68" height="24" rx="6" fill="#FFE9EE"/><rect x="20" y="34" width="22" height="14" rx="6" fill="#FFFFFF"/><path d="M16 60h68" stroke="#F2B9C6" stroke-width="3"/><rect x="16" y="66" width="6" height="14" rx="2" fill="#5A2232"/><rect x="78" y="66" width="6" height="14" rx="2" fill="#5A2232"/>'],
  filter: ['#6B6F86', '#41445A', '<rect x="22" y="24" width="56" height="52" rx="4" fill="#F1EEE4"/><path d="M30 24v52M38 24v52M46 24v52M54 24v52M62 24v52M70 24v52" stroke="#C9C2AE" stroke-width="3"/><rect x="22" y="24" width="56" height="52" rx="4" fill="none" stroke="#8E8A7A" stroke-width="4"/><path d="M78 38c6 2 6 8 0 10M78 52c6 2 6 8 0 10" stroke="#9FD6FF" stroke-width="3" fill="none" stroke-linecap="round"/>'],
  dishes: ['#3A9A9A', '#1F6468', '<ellipse cx="50" cy="70" rx="30" ry="9" fill="#C5E2E3"/><ellipse cx="50" cy="63" rx="30" ry="9" fill="#E3F3F3"/><ellipse cx="50" cy="56" rx="30" ry="9" fill="#FFFFFF"/><ellipse cx="50" cy="56" rx="19" ry="5" fill="#DCEFF0"/><circle cx="34" cy="34" r="6" fill="#FFFFFF" opacity=".7"/><circle cx="48" cy="25" r="4" fill="#FFFFFF" opacity=".6"/><circle cx="62" cy="35" r="5" fill="#FFFFFF" opacity=".65"/>'],
  tidy: ['#C98A3C', '#8A5A1E', '<path d="M62 18L46 56" stroke="#F3E3C2" stroke-width="5" stroke-linecap="round"/><path d="M32 60h28l6 24H26z" fill="#F7D98A"/><path d="M35 72v9M43 72v10M51 72v10M59 72v9" stroke="#C9A24A" stroke-width="2.5" stroke-linecap="round"/><rect x="30" y="54" width="32" height="9" rx="3" fill="#B5502E"/><path d="M76 40l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" fill="#FFFFFF" opacity=".85"/>'],
};
const ART_WORDS = [
  ['dishes', /dish|plates|washing.up/], ['bins', /\bbins?\b|trash|garbage|recycl|rubbish|curb|compost/], ['plants', /plant|water|garden|lawn/],
  ['fridge', /fridge|freezer/], ['vacuum', /vacuum|hoover|sweep|floor|mop/], ['sheets', /sheet|bed|pillow|duvet/],
  ['filter', /filter|furnace|smoke alarm|batter/], ['laundry', /laundry|wash|clothes|fold|iron|towel/],
];
/** Which tile suits a chore called `name`. */
export function artFor(name) {
  const n = String(name || '').toLowerCase();
  const hit = ART_WORDS.find((w) => w[1].test(n));
  return hit ? hit[0] : 'tidy';
}
let artN = 0;
/** <svg> tile, `size` px; round for Home's line. */
export function choreArt(key, size = 76, round = false) {
  const a = ART[key] || ART.tidy;
  const id = `cha${++artN}`;
  return `<svg width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true" style="display:block;flex:none"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a[0]}"/><stop offset="1" stop-color="${a[1]}"/></linearGradient></defs><rect width="100" height="100" rx="${round ? 50 : 28}" fill="url(#${id})"/><ellipse cx="34" cy="18" rx="30" ry="12" fill="#FFFFFF" opacity=".12"/>${a[2]}</svg>`;
}
/** The names offered as one-tap chips when adding a chore. */
export const PRESETS = ['Bins to the curb', 'Laundry', 'Water the plants', 'Vacuum', 'Dishes', 'Change the sheets', 'Clean out the fridge', 'Furnace filter'];

// ---------------------------------------------------------------------------------------
// The household (in the boards' soft colours)
// ---------------------------------------------------------------------------------------
const COLORS = ['#FF9A7A', '#7FD8C4', '#B9A3FF', '#FFD66B', '#7CC4FF', '#F4A3B4', '#BFE88A', '#E8C27A'];
export const peopleNames = () => getFamily().people.map((p) => String(p).trim()).filter(Boolean);
/** { name, color, initial } for a name (grey for somebody no longer in Settings). */
export function person(name) {
  const i = peopleNames().indexOf(name);
  return { name, color: i >= 0 ? COLORS[i % COLORS.length] : '#C9D2E8', initial: (String(name || '').trim().charAt(0) || '?').toUpperCase() };
}

// ---------------------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------------------
const EMPTY = () => ({ v: 1, chores: [], log: [] });
const okDay = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
export function load() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { s = null; }
  if (!s || !Array.isArray(s.chores) || !Array.isArray(s.log)) return EMPTY();
  return {
    v: 1,
    chores: s.chores.filter((c) => c && c.id && c.repeat && okDay(c.start) && okDay(c.next)).slice(0, MAX_CHORES),
    log: s.log.filter((e) => e && e.id && typeof e.at === 'number'),
  };
}
export function save(state) {
  const cut = Date.now() - KEEP_DAYS * 86400000;
  const out = { v: 1, chores: state.chores.slice(0, MAX_CHORES), log: state.log.filter((e) => e.at >= cut).slice(-MAX_LOG) };
  try { localStorage.setItem(KEY, JSON.stringify(out)); } catch (e) { /* full: it stays as it was */ }
  window.dispatchEvent(new Event(EVENT));
}
/** Run cb whenever the chores change. Returns the way to stop. */
export function onChanged(cb) {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}

const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const clean = (f) => ({
  name: cap(String(f.name || '').trim().slice(0, 40)),
  size: f.size === 2 || f.size === 3 ? f.size : 1,
  evening: !!f.evening,
  repeat: f.repeat.kind === 'weekly'
    ? { kind: 'weekly', days: f.repeat.days.slice(0, 7) }
    : { kind: 'every', n: Math.max(1, Math.min(99, Math.round(f.repeat.n) || 1)), unit: f.repeat.unit },
  start: f.start,
  turns: (f.turns || []).slice(0, 12),
  pick: f.pick === 'behind' ? 'behind' : 'turns',
});
export const canAdd = () => load().chores.length < MAX_CHORES;
/** A new chore from the sheet's fields ({ name, size, evening, repeat, start, turns }). */
export function addChore(fields, now = new Date()) {
  const s = load();
  const c = clean(fields);
  if (!c.name || s.chores.length >= MAX_CHORES) return null;
  c.id = newId(now.getTime());
  c.art = artFor(c.name);
  c.next = firstDue(c, ymd(now));
  c.turn = 0;
  if (c.pick === 'behind') c.who = pickBehind(s.log, c);
  s.chores.push(c);
  save(s);
  return c;
}
/** Change a chore. A new rhythm or first time starts its days afresh; the turn stays ('behind': picked again). */
export function updateChore(id, fields, now = new Date()) {
  const s = load();
  const c = s.chores.find((x) => x.id === id);
  const f = clean(fields);
  if (!c || !f.name) return;
  const moved = JSON.stringify(c.repeat) !== JSON.stringify(f.repeat) || c.start !== f.start;
  const repick = moved || c.pick !== f.pick || JSON.stringify(c.turns) !== JSON.stringify(f.turns);
  Object.assign(c, f, { art: artFor(f.name) });
  if (moved) c.next = firstDue(c, ymd(now));
  if (c.pick !== 'behind') delete c.who;
  else if (repick || !c.who) c.who = pickBehind(s.log, c);
  save(s);
}
export function removeChore(id) {
  const s = load();
  s.chores = s.chores.filter((c) => c.id !== id);
  save(s);
}
/** Tick a chore (`who`: somebody other than whoever's turn it was). */
export function tick(id, who) {
  save(settle(load(), id, { kind: 'done', who, names: peopleNames() }));
}
export function skip(id) {
  save(settle(load(), id, { kind: 'skip', names: peopleNames() }));
}
export function untick(logId) {
  save(unsettle(load(), logId));
}

// ---------------------------------------------------------------------------------------
// For Home and the menu
// ---------------------------------------------------------------------------------------
/** [{ name, color, initial, count }] this month, in the household's order. */
export function scores(state = load(), now = new Date()) {
  const t = tally(state.log, ymd(now).slice(0, 7));
  return peopleNames().map((n) => Object.assign(person(n), { count: (t[n] || {}).count || 0, points: (t[n] || {}).points || 0 }));
}

/**
 * Home's one quiet line: the most pressing chore that is due and not ticked, or null.
 * `text` says it all ("Bins to the curb tonight · Jordan"). To draw it as on the board:
 * `art` (a round 48 px tile), `title` (without the name), `who` ({ name, color, initial } or null).
 */
export function homeLine(now = new Date()) {
  const names = peopleNames();
  const top = todayList(load(), ymd(now), names).filter((x) => !x.done)[0];
  if (!top) return null;
  const c = top.chore;
  const title = top.late ? `${c.name} · late` : `${c.name} ${c.evening ? 'tonight' : 'today'}`;
  return {
    text: top.who ? `${title} · ${top.who}` : title,
    href: '#/chores',
    done: () => tick(c.id),
    tone: top.late ? 'late' : 'due',
    title,
    who: top.who ? person(top.who) : null,
    art: choreArt(c.art, 48, true),
  };
}

function cardFacts(now) {
  const state = load();
  const today = ymd(now);
  const names = peopleNames();
  const list = todayList(state, today, names);
  let soon = [];
  if (!list.length) {
    const seen = {};
    forecast(state, today, addDays(today, 6), names).forEach((p) => { if (!seen[p.chore.id]) { seen[p.chore.id] = 1; soon.push(p); } });
    soon = soon.slice(0, 3);
  }
  const sc = scores(state, now);
  const total = sc.reduce((a, p) => a + p.count, 0);
  const foot = !total ? '' : sc.length >= 2 && sc.length <= 3 ? `${sc.map((p) => `${p.name} ${p.count}`).join(' · ')} this month` : `${total} done this month`;
  return { state, list, soon, foot, pending: list.filter((x) => !x.done).length };
}

/** What the menu's card says. (bg/ink/soft: the card's colours, as on the board.) */
export function menuCard(now = new Date()) {
  const f = cardFacts(now);
  const look = { bg: 'linear-gradient(180deg, #34508A 0%, #1B2A52 100%)', ink: '#FFFFFF', soft: '#C9D2E8' };
  if (!f.state.chores.length && !f.list.length) return Object.assign({ title: 'Chores', lines: [], badge: 0, action: { label: '+ Add a chore', href: '#/chores/add' } }, look);
  const lines = f.list.length
    ? f.list.slice(0, 4).map((x) => `${x.done ? x.done.name : x.chore.name}${x.done ? ' · done' : x.who ? ` · ${x.who}` : ''}`)
    : f.soon.map((x) => `${dayWord(x.date).slice(0, 3)} · ${x.chore.name}`);
  return Object.assign({ title: 'Chores', lines, badge: f.pending }, look);
}

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TICK = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:block"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const dot = (p, size) => `<span style="width:${size}px;height:${size}px;border-radius:50%;background:${p.color};color:#1E2A33;display:flex;align-items:center;justify-content:center;font:700 ${Math.round(size * 0.47)}px Outfit,sans-serif;flex:none">${esc(p.initial)}</span>`;
/** The menu card's inside, in the board's look (for a card with the usual 24 px 26 px padding). */
export function menuCardHtml(now = new Date()) {
  const f = cardFacts(now);
  const head = (side) => `<div style="display:flex;align-items:baseline"><div style="font:700 27px Outfit,sans-serif">Chores</div>${side ? `<div style="margin-left:auto;font:600 17px Inter,sans-serif;color:#FFE39A">${side}</div>` : ''}</div>`;
  const strip = (t) => `<div style="position:absolute;left:26px;right:26px;bottom:24px;min-height:58px;border-radius:18px;display:flex;align-items:center;justify-content:center;font:600 18px Inter,sans-serif;background:rgba(255,255,255,.14);white-space:nowrap;overflow:hidden">${esc(t)}</div>`;
  const row = (art, name, sub, end, faded) => `<div style="display:flex;align-items:center;gap:12px;height:76px;border-radius:18px;background:#FFF7E6;color:#23324A;padding:0 12px 0 10px;margin-top:10px;${faded ? 'opacity:.7;' : ''}">${choreArt(art, 46)}
    <div style="flex:1;min-width:0"><div style="font:600 19px Inter,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(name)}</div>${sub ? `<div style="font:600 15px Inter,sans-serif;color:${sub[1] || '#6A7183'}">${esc(sub[0])}</div>` : ''}</div>${end}</div>`;
  if (!f.state.chores.length && !f.list.length) {
    return `${head('')}<div style="display:flex;flex-direction:column;align-items:center;margin-top:70px">${choreArt('laundry', 120)}<div style="font:600 22px Outfit,sans-serif;margin-top:22px">No chores yet</div></div>${strip('+ Add a chore')}`;
  }
  let rows;
  if (f.list.length) {
    rows = f.list.slice(0, 3).map((x) => {
      if (x.done) return row(x.done.art, x.done.name, [x.who ? `Done · ${x.who}` : 'Done'], `<span style="width:34px;height:34px;border-radius:50%;background:#3F9A63;display:flex;align-items:center;justify-content:center;flex:none">${TICK}</span>`, true);
      const when = x.late ? 'Late' : x.chore.evening ? 'Tonight' : '';
      const sub = [when, x.who].filter(Boolean).join(' · ');
      return row(x.chore.art, x.chore.name, sub ? [sub, x.late ? '#B5502E' : ''] : null, x.who ? dot(person(x.who), 34) : '');
    }).join('');
  } else {
    rows = f.soon.map((x) => row(x.chore.art, x.chore.name, [[dayWord(x.date), x.who].filter(Boolean).join(' · ')], x.who ? dot(person(x.who), 34) : '')).join('');
  }
  const side = f.list.length ? (f.pending ? 'Today' : 'All done') : f.soon.length ? 'This week' : '';
  return `${head(side)}<div style="margin-top:6px">${rows}</div>${f.foot ? strip(f.foot) : ''}`;
}
