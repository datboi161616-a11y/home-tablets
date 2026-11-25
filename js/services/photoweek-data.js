// Photo of the week: each week the household picks one photo from this screen's album, and
// at the end of the year the picks play back as "Our 2026". Kept on this screen only.
//
// Stored (localStorage 'photoweek.v1'): { v: 1, picks: { '2026-11-23': { id, at } } }
//   the name is the first day of the week (local date), `id` the album photo's id,
//   `at` when it was picked (ms). Nothing about the photo itself is copied: when a picked
//   photo is taken out of the album, its week simply shows as empty again.
//
// Weeks start on the day chosen in Settings (display().weekStart: 1 Monday, 0 Sunday) and
// are numbered the way calendars do: a week belongs to the year and month its fourth day
// falls in, so a year has 52 or 53 of them.
import { display } from './display.js';
import { isTablet, getPhotos } from './tablet-photos.js';
import { photos as samplePhotos } from './family-sample.js';

const KEY = 'photoweek.v1';
const EVENT = 'photoweek-changed';
const KEEP = 160; // weeks of picks kept (three years)

// ---------------------------------------------------------------------------------------
// Weeks (nothing here reads the clock or storage: tools/sim/photoweek-test.mjs)
// ---------------------------------------------------------------------------------------
const two = (n) => String(n).padStart(2, '0');
const dayAt = (ms, plus = 0) => { const d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + plus); };

/** The first moment (ms) of the week `ms` falls in. ws: 1 = weeks start Monday, 0 = Sunday. */
export function weekStartOf(ms, ws = 1) {
  const d = dayAt(ms);
  return dayAt(d, -((d.getDay() - ws + 7) % 7)).getTime();
}
/** A day as '2026-11-23'. */
export const dayKey = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`; };
/** The week `ms` falls in, named by its first day. */
export const weekKey = (ms, ws = 1) => dayKey(weekStartOf(ms, ws));
/** '2026-11-23' -> that day's first moment (ms), or NaN. */
export function keyStart(key) {
  const m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(String(key));
  return m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : NaN;
}
/** { year, week, month (0-11) } of the week that starts at `start`: where its fourth day falls. */
export function weekInfo(start) {
  const mid = dayAt(start, 3);
  const dayOfYear = Math.round((mid - new Date(mid.getFullYear(), 0, 1)) / 864e5);
  return { year: mid.getFullYear(), week: Math.floor(dayOfYear / 7) + 1, month: mid.getMonth() };
}
/** Every week of a year, in order: [{ key, start, end (its last day), week, month }]. 52 or 53. */
export function weeksOfYear(year, ws = 1) {
  const out = [];
  let mid = new Date(year, 0, 1);
  while (mid.getDay() !== (ws + 3) % 7) mid = dayAt(mid, 1);
  for (; mid.getFullYear() === year; mid = dayAt(mid, 7)) {
    const start = dayAt(mid, -3).getTime();
    out.push({ key: dayKey(start), start, end: dayAt(start, 6).getTime(), week: out.length + 1, month: mid.getMonth() });
  }
  return out;
}
/** "Nov 23 – 29" or "Nov 30 – Dec 6". */
export function weekRange(start) {
  const a = new Date(start), b = dayAt(start, 6);
  const mon = (d) => d.toLocaleDateString('en-US', { month: 'short' });
  return a.getMonth() === b.getMonth() ? `${mon(a)} ${a.getDate()} – ${b.getDate()}` : `${mon(a)} ${a.getDate()} – ${mon(b)} ${b.getDate()}`;
}
/**
 * The week Home asks about, or null. Asked on Sunday, and once more on Monday: always the
 * week that last Saturday was in (with Monday weeks, Sunday is its last day; with Sunday
 * weeks, the one that ended yesterday).
 */
export function askWeek(now, ws = 1) {
  const day = new Date(now).getDay();
  if (day > 1) return null;
  return weekKey(dayAt(now, -(day + 1)).getTime(), ws);
}
/** The year whose slideshow is offered right now (Dec 28 to Jan 7), or null. */
export function showYear(now) {
  const d = new Date(now);
  if (d.getMonth() === 11 && d.getDate() >= 28) return d.getFullYear();
  if (d.getMonth() === 0 && d.getDate() <= 7) return d.getFullYear() - 1;
  return null;
}
/** The album's photos that arrived in the week starting at `start`, newest first. */
export function photosInWeek(album, start) {
  const end = dayAt(start, 7).getTime();
  return album.filter((p) => p.added >= start && p.added < end).sort((a, b) => b.added - a.added);
}
/**
 * Picks as stored -> { weekKey: { id, at } } for weeks that start on `ws`. (If the first
 * day of the week is changed in Settings, each pick moves to the week its old first day
 * is in.) Only the newest KEEP weeks stay.
 */
export function tidyPicks(raw, ws = 1) {
  const out = {};
  Object.keys(raw && typeof raw === 'object' ? raw : {}).sort().slice(-KEEP).forEach((k) => {
    const start = keyStart(k);
    const p = raw[k];
    if (isNaN(start) || !p || typeof p.id !== 'string' || !p.id) return;
    out[weekKey(start, ws)] = { id: p.id.slice(0, 300), at: +p.at || 0 };
  });
  return out;
}
/**
 * A year's weeks with what each holds:
 * [{ key, start, end, week, month, photo (the pick, if it is still in the album) or null,
 *    when: 'past' | 'now' | 'ahead', open (true: no pick yet, and that week has photos to pick from) }]
 */
export function yearSlots(year, ws, picks, album, now) {
  const byId = {};
  album.forEach((p) => { byId[p.id] = p; });
  const thisWeek = weekStartOf(now, ws);
  return weeksOfYear(year, ws).map((w) => {
    const pick = picks[w.key];
    const photo = (pick && byId[pick.id]) || null;
    const when = w.start === thisWeek ? 'now' : w.start < thisWeek ? 'past' : 'ahead';
    return { ...w, photo, when, open: !photo && when !== 'ahead' && photosInWeek(album, w.start).length > 0 };
  });
}

// ---------------------------------------------------------------------------------------
// This screen's album and picks
// ---------------------------------------------------------------------------------------
const ws = () => (display().weekStart === 0 ? 0 : 1);

/** The album's pictures (no videos), newest first: [{ id, src | art, name, added }]. Samples on a PC. */
export function album() {
  const list = isTablet()
    ? getPhotos().filter((p) => !p.video)
    : samplePhotos.filter((p) => !p.video).map((p) => ({ id: p.id, art: p.art, name: p.addedBy, added: p.added }));
  return list.sort((a, b) => (b.added || 0) - (a.added || 0));
}

function read() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    return tidyPicks(s && s.v === 1 ? s.picks : null, ws());
  } catch (e) { return {}; }
}
function write(picks) {
  try { localStorage.setItem(KEY, JSON.stringify({ v: 1, picks: tidyPicks(picks, ws()) })); } catch (e) { /* storage off or full: the pick lasts until the page starts over */ }
  window.dispatchEvent(new Event(EVENT));
}

/** { weekKey: { id, at } } */
export const picks = () => read();
/** Make a photo its week's pick (another one that week is swapped out). */
export function setPick(key, id) {
  if (isNaN(keyStart(key)) || !id) return;
  const all = read();
  all[key] = { id: String(id), at: Date.now() };
  write(all);
}
/** Take a week's pick back. */
export function clearPick(key) {
  const all = read();
  if (!all[key]) return;
  delete all[key];
  write(all);
}

/** This week: { key, start, week, year, month }. */
export function thisWeek(now = Date.now()) {
  const start = weekStartOf(now, ws());
  return { key: dayKey(start), start, ...weekInfo(start) };
}
/** The week to show first: the one Home is asking about if it is still open, else this week. */
export function dueWeek(now = Date.now()) {
  const key = askWeek(now, ws());
  if (!key) return null;
  const slot = slotsFor(weekInfo(keyStart(key)).year, now).find((s) => s.key === key);
  return slot && slot.open ? slot : null;
}
/** A year's slots (see yearSlots) from this screen's album and picks. */
export function slotsFor(year, now = Date.now()) {
  return yearSlots(year, ws(), read(), album(), now);
}
/** The photos to pick from for a week. */
export const weekPhotos = (key) => photosInWeek(album(), keyStart(key));

// ---------------------------------------------------------------------------------------
// For Home and the menu
// ---------------------------------------------------------------------------------------
/**
 * The one line Home may show: on Sunday (and Monday, if still open) "Photo of the week",
 * with up to three of that week's photos; from Dec 28 to Jan 7 "Our 2026".
 * { text, href, tone, photos?: [{ src | art }] } or null.
 */
export function homeLine(now = Date.now()) {
  const due = dueWeek(now);
  if (due) {
    return {
      text: 'Photo of the week',
      href: '#/photoweek', // (it opens on the week being asked about)
      tone: new Date(now).getDay() === 0 ? 'due' : 'late',
      photos: photosInWeek(album(), due.start).slice(0, 3).map((p) => ({ src: p.src || '', art: p.art || '' })),
    };
  }
  const year = showYear(now);
  if (year && slotsFor(year, now).some((s) => s.photo)) return { text: `Our ${year}`, href: `#/photoweek/play/${year}`, tone: 'info' };
  return null;
}

/** The menu card: { title, lines, badge, action?, photo?: { src | art } (this week's pick, or the newest one) }. */
export function menuCard(now = Date.now()) {
  const week = thisWeek(now);
  const slots = slotsFor(week.year, now);
  const done = slots.filter((s) => s.photo);
  const due = dueWeek(now);
  const here = slots.find((s) => s.key === week.key);
  const open = due || (here && here.open ? here : null);
  const shown = (here && here.photo) || (done.length ? done[done.length - 1].photo : null);
  const card = {
    title: 'Photo of the week',
    lines: [`Week ${week.week}`, `${done.length} of ${slots.length}`],
    badge: due ? 1 : 0,
  };
  if (open) card.action = { label: 'Pick one', href: '#/photoweek' };
  else if (done.length) card.action = { label: `Our ${week.year}`, href: '#/photoweek/year' };
  if (shown) card.photo = { src: shown.src || '', art: shown.art || '' };
  return card;
}

/** Calls cb() when a pick changes. Returns an unsubscribe function. */
export function onChanged(cb) {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}
