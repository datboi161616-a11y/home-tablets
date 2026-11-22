// Family · Week calendar (Calendar.dc.html in the design), with a month view
import { minutesText, timeText } from '../services/display.js';
import { backHref, backLabel } from '../services/nav.js';
import { settings } from '../config.js';
import { getWeek, getDay, nextAfter, nextBigThing, calendarStatus, refreshCalendars, linkedCalendars, startOfWeek, weekdayNames, KINDS, BACK_WEEKS } from '../services/calendar-data.js';
import { eventIcon, spot } from '../art.js';
import { saveMyEvent, removeMyEvent, getMyEvent, myEvents, isoDay, fromIso, restoreMyEvent, skipMyEventOn, endMyEventBefore, recentTitles } from '../services/my-events.js';

let timer, onUpdate, undoTimer;
let view = 'week'; // 'week' or 'month' (back to the week on every visit)
let weekOffset = 0; // 0 = this week, 1 = next week, -1 = last week… (the arrows)
let monthOffset = 0; // 0 = this month (month view)
let form = null; // the add / change form while it's open (see showForm)
let undo = null; // { text, restore } after a removal, for the "Undo" button
let checking = false; // "Check now" was tapped and the calendars are being read
// How many weeks ahead the arrows go. It was 8 (calendar links are only read about two
// months ahead), but something added here for a later date then saved without a trace:
// the week it was in could never be shown, so it could not be seen, changed or removed.
const MAX_AHEAD = 52;
const MIN_WEEK = -BACK_WEEKS; // a few weeks back: "when was the plumber here?"
const MAX_MONTH = 12, MIN_MONTH = -1;

const colorOf = (kind) => (kind === 'family' ? settings.accent : KINDS[kind]?.color || '#2D5BA8');

// Little pictures for birthdays, holidays and named occasions (not for every dentist visit).
const OCCASION = /christmas|xmas|eve|thanksgiving|labor day|birthday|bday|valentine|anniversar|wedding|mother|father|patrick|easter|halloween|independence|memorial|veteran|president|new year/i;
function iconFor(e, size) {
  if (e.kind === 'birthday') return eventIcon(OCCASION.test(e.title) ? e.title : 'birthday', size);
  if (e.kind === 'holiday' || OCCASION.test(e.title)) return eventIcon(e.title, size);
  return '';
}
// The icon on a white disc, so it reads on any event colour.
const iconBadge = (e) => { const i = iconFor(e, 18); return i ? `<span class="cal-badge">${i}</span>` : ''; };

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const midnightOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const shiftDay = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const dayDiff = (a, b) => Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000);
// The Monday of the week on screen, counted in calendar days (not hours, so a
// daylight-saving weekend can never make the arrows skip or repeat a week).
const weekStart = () => shiftDay(startOfWeek(new Date()), weekOffset * 7);
const monthStart = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth() + monthOffset, 1); };
const thisYear = (d) => d.getFullYear() === new Date().getFullYear();

// "Updated 10:32 AM" / "Wed at 9:15 PM" with the owner's 12- or 24-hour clock.
function whenSaved(at) {
  const day = at.toDateString() === new Date().toDateString() ? '' : `${at.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} at `;
  return `${day}${timeText(at)}`;
}

// Right side of the footer: setup hint, a download problem, or when the calendars were last read.
function footerNote() {
  const st = calendarStatus();
  if (!st.calendars) return { text: 'Tap + Add to put something on. Google or iPhone calendars: Add photos → scan the code → Settings', button: '' };
  const button = checking ? '<button class="pill cal-check" disabled>Checking…</button>' : `<button data-check class="pill cal-check">${st.lastError ? 'Try again' : 'Check now'}</button>`;
  if (st.lastError) {
    // Say how old the saved copy is, so nobody trusts a week-old calendar by mistake.
    const at = st.savedAt;
    if (!at) return { text: st.lastError, button };
    return { text: `${st.lastError} · showing what was saved ${at.toDateString() === new Date().toDateString() ? 'today at ' : ''}${whenSaved(at)}`, button };
  }
  return { text: st.savedAt ? `Calendars updated ${whenSaved(st.savedAt)}` : 'Tap + Add, or add events on your phone’s calendar — they show up here', button };
}

// Hide events that don't fit in a day column and say "+N more" instead.
function fitDays(el) {
  el.querySelectorAll('.cal-day').forEach((day) => {
    if (!day.clientHeight) return; // not laid out yet
    const evs = [...day.querySelectorAll('.cal-ev')];
    const old = day.querySelector('.cal-more');
    if (old) old.remove();
    evs.forEach((e) => { e.style.display = ''; });
    if (day.scrollHeight <= day.clientHeight + 1) return;
    const more = document.createElement('div');
    more.className = 'cal-more';
    day.appendChild(more);
    let hidden = 0;
    for (let i = evs.length - 1; i >= 0 && day.scrollHeight > day.clientHeight + 1; i--) {
      evs[i].style.display = 'none';
      hidden++;
      more.textContent = `+${hidden} more`;
    }
  });
}

function weekTitle(days) {
  if (weekOffset === 0) return 'This week';
  if (weekOffset === 1) return 'Next week';
  if (weekOffset === -1) return 'Last week';
  const d = days[0].date;
  return `Week of ${d.toLocaleDateString('en-US', thisYear(d) ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

// "Nov 16 – 22" or "Nov 30 – Dec 6" (and "Dec 28, 2026 – Jan 3, 2027" across a new year).
function weekRange(days) {
  const a = days[0].date, b = days[6].date;
  const md = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (a.getFullYear() !== b.getFullYear()) return `${md(a)}, ${a.getFullYear()} – ${md(b)}, ${b.getFullYear()}`;
  const range = a.getMonth() === b.getMonth() ? `${md(a)} – ${b.getDate()}` : `${md(a)} – ${md(b)}`;
  return thisYear(a) ? range : `${range}, ${a.getFullYear()}`;
}

// "Thanksgiving · Nov 26 · in 8 days"
function countdown(big) {
  if (big.days === 0) return 'today!';
  if (big.days === 1) return 'tomorrow';
  return `in ${big.days} days`;
}

// "Today", "Tomorrow", "In 5 days", "Yesterday", "3 days ago" for a day.
function howFar(d) {
  const n = dayDiff(midnightOf(new Date()), d);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  return n > 0 ? `In ${n} days` : `${-n} days ago`;
}

// "All day · day 2 of 3" for things over several days.
const REPEAT_WORDS = { weekly: 'every week', fortnightly: 'every 2 weeks', monthly: 'every month', yearly: 'every year' };

// The key: one colour per calendar link (named as on the phone page), then the rest.
function legend() {
  const links = linkedCalendars();
  const items = links.length ? links.map((c) => [c.kind, c.name]) : [['family', KINDS.family.label]];
  if (myEvents().length) items.push(['tablet', KINDS.tablet.label]);
  items.push(['birthday', KINDS.birthday.label], ['holiday', KINDS.holiday.label]);
  return items.map(([k, label]) => `
    <div style="display:flex;align-items:center;gap:8px;white-space:nowrap;max-width:220px"><div style="width:12px;height:12px;border-radius:50%;flex:none;background:${colorOf(k)}"></div><span style="overflow:hidden;text-overflow:ellipsis">${esc(label)}</span></div>`).join('');
}

const STYLE = `
  <style>
    .cal-ev { color:#fff; border-radius:12px; padding:10px 12px; display:flex; flex-direction:column; gap:2px; flex:none; min-width:0; }
    .cal-ev.over { opacity:.5; }
    .cal-ev-top { display:flex; align-items:center; gap:6px; min-width:0; }
    .cal-badge { flex:none; width:24px; height:24px; border-radius:12px; background:#fff; display:flex; align-items:center; justify-content:center; }
    .cal-quiet { position:absolute; left:50%; bottom:28px; transform:translateX(-50%); width:680px; background:#fff; border-radius:24px; padding:14px 24px 14px 14px;
      display:flex; align-items:center; gap:12px; box-shadow:0 12px 36px rgba(29,36,48,.14); pointer-events:none; }
    .cal-quiet button { pointer-events:auto; }
    .cal-ev-time { font-size:13px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .cal-ev-title { font-size:16px; line-height:1.3; overflow-wrap:anywhere; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
    [data-step][disabled] { opacity:.3; }
    .cal-more { font-size:14px; font-weight:600; opacity:.7; flex:none; }
    .cal-day { border-radius:20px; padding:18px 14px; display:flex; flex-direction:column; gap:12px; min-height:0; overflow:hidden; }
    .cal-day.past, .cal-cell.past { opacity:.55; }
    .cal-nav { background:#fff; border:none; font-size:22px; padding:0 18px; min-width:56px; min-height:56px; justify-content:center; cursor:pointer; flex:none; }
    .cal-seg { display:flex; background:#fff; border-radius:28px; padding:4px; flex:none; }
    .cal-seg button { min-height:48px; padding:0 18px; border:none; border-radius:24px; background:transparent; color:var(--ink); font:600 17px Inter,sans-serif; cursor:pointer; }
    .cal-seg button.on { background:var(--ink); color:#fff; }
    .cal-check { background:#fff; border:2px solid var(--line); color:var(--ink); cursor:pointer; flex:none; margin-left:12px; min-height:48px; }
    .cal-month { flex-grow:1; min-height:0; display:grid; grid-template-columns:repeat(7,minmax(0,1fr)); gap:8px; }
    .cal-dow { font-size:15px; font-weight:600; letter-spacing:1px; text-transform:uppercase; color:var(--ink-2); padding:0 10px; }
    .cal-cell { background:#fff; border-radius:14px; padding:6px 8px; display:flex; flex-direction:column; gap:3px; min-height:0; overflow:hidden; cursor:pointer; }
    .cal-cell.out { background:transparent; box-shadow:inset 0 0 0 2px var(--line); }
    .cal-cell.today { background:var(--ink); color:#fff; }
    .cal-num { font:500 22px Outfit,sans-serif; line-height:1.1; display:flex; align-items:center; gap:6px; }
    .cal-line { font-size:16px; line-height:1.25; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:flex; align-items:center; gap:6px; }
    .cal-dot { width:10px; height:10px; border-radius:50%; flex:none; }
    .cf-label { font-size:14px; font-weight:600; letter-spacing:1px; text-transform:uppercase; color:var(--ink-2); width:118px; flex:none; }
    .cf-line { display:flex; align-items:center; gap:12px; min-width:0; }
    .cf-row { display:flex; align-items:center; gap:10px; flex-wrap:wrap; min-width:0; }
    .cf-chips { display:flex; align-items:center; gap:10px; flex-wrap:nowrap; overflow:hidden; min-width:0; }
    .cf-chip { min-height:52px; padding:0 20px; border-radius:26px; border:2px solid var(--line); background:#fff; color:var(--ink); font:600 17px Inter,sans-serif; cursor:pointer; flex:none; white-space:nowrap; }
    .cf-chip.sm { padding:0 14px; }
    .cf-chip.on { background:var(--ink); border-color:var(--ink); color:#fff; }
    .cf-step { width:56px; height:52px; border-radius:26px; border:2px solid var(--line); background:#fff; color:var(--ink); font:600 18px Inter,sans-serif; cursor:pointer; flex:none; }
    .cf-val { min-width:230px; text-align:center; font:500 24px Outfit,sans-serif; }
    .cf-in { width:100%; height:60px; box-sizing:border-box; border:2px solid var(--line); border-radius:16px; padding:0 18px; font:22px Inter,sans-serif; color:var(--ink); outline:none; user-select:text; }
    .cf-in:focus { border-color:${settings.accent}; }
    .cd-mine { cursor:pointer; border-radius:14px; }
    .cd-mine:active { background:#F2F4F7; }
    .cal-day.today .cal-ev[data-kind="birthday"] { box-shadow: inset 0 0 0 2px rgba(255,255,255,.35); }
    .cal-undo { position:absolute; left:50%; bottom:112px; transform:translateX(-50%); z-index:6; background:var(--ink); color:#fff; border-radius:28px;
      padding:6px 6px 6px 24px; display:flex; align-items:center; gap:16px; font-size:18px; box-shadow:0 12px 36px rgba(29,36,48,.25); max-width:900px; }
    .cal-undo span { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .cal-undo button { min-height:52px; padding:0 24px; border:none; border-radius:26px; background:#fff; color:var(--ink); font:600 18px Inter,sans-serif; cursor:pointer; flex:none; }
  </style>`;

function weekGrid(days, today) {
  const quiet = days.every((d) => !d.events.length);
  // An empty week says what comes next, with a way to go there.
  const next = quiet ? nextAfter(days[6].date) : null;
  return `
    <div style="flex-grow:1;min-height:0;position:relative;display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:12px">
      ${days.map((d, i) => `
        <div class="cal-day${d.isToday ? ' today' : ''}${!d.isToday && d.date < today ? ' past' : ''}" data-day="${isoDay(d.date)}" style="cursor:pointer;${d.isToday ? 'background:var(--ink);color:#fff' : 'background:#fff'}">
          <div style="display:flex;flex-direction:column;gap:2px">
            <div class="eyebrow">${d.dow}${d.isToday ? ' · Today' : ''}</div>
            <div class="display" style="font-size:40px;font-weight:500;line-height:1">${d.num}${d.num === 1 || i === 0 ? `<span style="font-size:18px;margin-left:6px">${d.date.toLocaleDateString('en-US', { month: 'short' })}</span>` : ''}</div>
          </div>
          ${d.events.map((e) => `
            <div class="cal-ev${d.isToday && e.over ? ' over' : ''}" data-kind="${e.kind}" style="background:${colorOf(e.kind)}">
              <div class="cal-ev-top">${iconBadge(e)}<div class="cal-ev-time">${esc(e.ofDays ? `${e.time} · ${e.dayOf}/${e.ofDays}` : e.time)}</div></div>
              <div class="cal-ev-title">${esc(e.title)}</div>
            </div>`).join('')}
        </div>`).join('')}
      ${quiet ? `
        <div class="cal-quiet">
          <div style="flex:none;width:140px">${spot.quietDay()}</div>
          <div style="display:flex;flex-direction:column;gap:6px;min-width:0;flex-grow:1">
            <div class="display" style="font-size:28px;font-weight:500">A quiet week</div>
            <div class="muted" style="font-size:17px;line-height:1.35;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${next
              ? `Next: ${esc(next.name)}${next.turns ? ` · turns ${next.turns}` : ''} · ${next.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}${next.days > 0 ? `, in ${next.days} days` : ''}`
              : 'Nothing on the calendar this week.'}</div>
          </div>
          ${next && dayDiff(startOfWeek(new Date()), next.date) <= MAX_AHEAD * 7 + 6 ? `<button data-jump="${isoDay(next.date)}" class="pill" style="background:var(--ink);color:#fff;border:none;cursor:pointer;flex:none;min-height:52px">Show me</button>` : ''}
        </div>` : ''}
    </div>`;
}

function monthGrid(today) {
  const first = monthStart();
  const gridStart = startOfWeek(first);
  const dim = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const rows = Math.ceil((dayDiff(gridStart, first) + dim) / 7);
  const lines = rows > 5 ? 2 : 3; // how many things fit in a day box
  const cells = [];
  for (let i = 0; i < rows * 7; i++) {
    const d = getDay(shiftDay(gridStart, i));
    const out = d.date.getMonth() !== first.getMonth();
    const shown = d.events.slice(0, d.events.length > lines ? lines - 1 : lines);
    const more = d.events.length - shown.length;
    cells.push(`
      <div class="cal-cell${d.isToday ? ' today' : ''}${out ? ' out' : ''}${!d.isToday && d.date < today ? ' past' : ''}" data-day="${isoDay(d.date)}">
        <div class="cal-num">${d.num}${d.num === 1 && out ? `<span style="font-size:15px">${d.date.toLocaleDateString('en-US', { month: 'short' })}</span>` : ''}</div>
        ${shown.map((e) => `<div class="cal-line"><span class="cal-dot" style="background:${colorOf(e.kind)}${d.isToday ? ';box-shadow:0 0 0 2px #fff' : ''}"></span><span style="overflow:hidden;text-overflow:ellipsis">${esc(e.title)}</span></div>`).join('')}
        ${more > 0 ? `<div class="cal-line" style="font-weight:600;opacity:.7">+${more} more</div>` : ''}
      </div>`);
  }
  return `
    <div style="flex-grow:1;min-height:0;display:flex;flex-direction:column;gap:8px">
      <div style="display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px">${weekdayNames().map((x) => `<div class="cal-dow">${x}</div>`).join('')}</div>
      <div class="cal-month" style="grid-template-rows:repeat(${rows},minmax(0,1fr))">${cells.join('')}</div>
    </div>`;
}

function render(el) {
  const big = nextBigThing();
  const today = midnightOf(new Date());
  const month = view === 'month';
  const days = month ? null : getWeek(weekStart());
  const first = monthStart();
  const title = month ? first.toLocaleDateString('en-US', { month: 'long' }) : weekTitle(days);
  const sub = month ? `${monthOffset === 0 ? 'This month · ' : monthOffset === 1 ? 'Next month · ' : ''}${first.getFullYear()}` : weekRange(days);
  const atStart = month ? monthOffset <= MIN_MONTH : weekOffset <= MIN_WEEK;
  const atEnd = month ? monthOffset >= MAX_MONTH : weekOffset >= MAX_AHEAD;
  const away = month ? monthOffset !== 0 : weekOffset !== 0;
  const note = footerNote();

  el.innerHTML = `${STYLE}
  <div style="height:100%;padding:40px;display:flex;flex-direction:column;gap:${month ? 16 : 24}px">
    <div style="display:flex;align-items:center;justify-content:space-between">
      <div style="display:flex;align-items:center;gap:14px">
        <a href="${backHref()}" class="pill" style="background:#fff;flex:none;white-space:nowrap">${backLabel()}</a>
        <div style="min-width:230px;flex:none;display:flex;flex-direction:column">
          <div class="display" style="font-size:40px;font-weight:500;line-height:1.1;white-space:nowrap">${esc(title)}</div>
          <div class="muted" style="font-size:16px;font-weight:500;white-space:nowrap">${esc(sub)}</div>
        </div>
        <button data-step="-1" class="pill cal-nav"${atStart ? ' disabled' : ''} aria-label="${month ? 'Earlier month' : 'Earlier week'}">‹</button>
        <button data-step="1" class="pill cal-nav"${atEnd ? ' disabled' : ''} aria-label="${month ? 'Later month' : 'Later week'}">›</button>
        ${away ? '<button data-step="0" class="pill" style="background:var(--ink);color:#fff;border:none;cursor:pointer;flex:none;white-space:nowrap;min-height:56px">Today</button>' : ''}
        <div class="cal-seg"><button data-view="week" class="${month ? '' : 'on'}">Week</button><button data-view="month" class="${month ? 'on' : ''}">Month</button></div>
        <button data-add class="pill" style="background:${settings.accent};color:#fff;border:none;cursor:pointer;font-size:18px;padding:0 24px;flex:none;white-space:nowrap;min-height:56px">+ Add</button>
      </div>
      <div class="muted" style="display:flex;flex-wrap:wrap;justify-content:flex-end;gap:4px 16px;font-size:16px;min-width:0;margin-left:16px">${legend()}</div>
    </div>

    ${month ? monthGrid(today) : weekGrid(days, today)}

    <div data-detail style="display:none;position:absolute;top:0;right:0;bottom:0;left:0;background:rgba(29,36,48,.45);z-index:5;align-items:center;justify-content:center"></div>

    <div style="background:#fff;border-radius:20px;padding:${note.button ? 8 : 18}px 24px;min-height:${note.button ? 64 : 0}px;box-sizing:border-box;display:flex;justify-content:space-between;align-items:center;font-size:18px">
      <div style="white-space:nowrap;flex:none;max-width:56%;overflow:hidden;text-overflow:ellipsis">${big ? `<span style="font-weight:600">Next big thing:</span> <span style="display:inline-block;vertical-align:-5px;margin:0 2px">${eventIcon(big.name, 24)}</span> ${esc(big.name)}${big.where ? ` at ${esc(big.where)}` : ''}${big.turns ? ` · turns ${big.turns}` : ''} · ${big.label} · <span style="font-weight:600">${countdown(big)}</span>` : ''}</div>
      <div style="display:flex;align-items:center;min-width:0;margin-left:16px">
        <div class="muted" style="text-align:right;min-width:0">${esc(note.text)}</div>${note.button}
      </div>
    </div>
    ${undo ? `<div class="cal-undo" data-undo-bar><span>${esc(undo.text)}</span><button data-undo>Undo</button></div>` : ''}
  </div>`;
}

function draw(el) {
  render(el);
  if (view !== 'week') return;
  fitDays(el);
  // Again after layout settles (older WebViews add flex-gap margins a frame later).
  requestAnimationFrame(() => setTimeout(() => { if (el.isConnected) fitDays(el); }, 50));
}

// The days things can be added to: from this week's Monday to the last week the arrows reach.
function canAddOn(d) {
  const n = dayDiff(startOfWeek(new Date()), d);
  return n >= 0 && n <= MAX_AHEAD * 7 + 6;
}

// Tap a day: everything on it, with full titles, times and places.
function showDay(el, d) {
  const box = el.querySelector('[data-detail]');
  const title = d.date.toLocaleDateString('en-US', thisYear(d.date) ? { weekday: 'long', month: 'long', day: 'numeric' } : { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  box.innerHTML = `
    <div data-day-box="${isoDay(d.date)}" style="background:#fff;border-radius:24px;padding:28px 32px;width:680px;max-height:640px;box-sizing:border-box;display:flex;flex-direction:column;gap:16px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:16px">
        <div style="min-width:0">
          <div class="display" style="font-size:32px;font-weight:500">${esc(title)}</div>
          <div class="muted" style="font-size:17px;font-weight:600">${howFar(d.date)}</div>
        </div>
        <div style="display:flex;gap:10px;flex:none">
          ${canAddOn(d.date) ? `<button data-add="${isoDay(d.date)}" class="pill" style="background:${settings.accent};color:#fff;border:none;cursor:pointer;min-height:56px;padding:0 24px">+ Add</button>` : ''}
          <button data-close class="pill" style="background:var(--ink);color:#fff;border:none;cursor:pointer;min-height:56px;padding:0 24px">Close</button>
        </div>
      </div>
      <div style="overflow-y:auto;display:flex;flex-direction:column;gap:10px">
        ${d.events.length ? d.events.map((e) => `
          <div${e.id ? ` data-edit="${esc(e.id)}" class="cd-mine"` : ''} style="display:flex;gap:14px;align-items:flex-start;padding:12px 0;border-top:1px solid var(--line)${d.isToday && e.over ? ';opacity:.55' : ''}">
            ${iconFor(e, 24) ? `<div style="width:24px;flex:none;margin-top:1px">${iconFor(e, 24)}</div>` : `<div style="width:12px;height:12px;border-radius:50%;margin:7px 6px 0;flex:none;background:${colorOf(e.kind)}"></div>`}
            <div style="width:150px;flex:none;font-weight:600;font-size:17px">${esc(e.time)}${e.endTime ? `<div class="muted" style="font-weight:500;font-size:15px">to ${esc(e.endTime)}</div>` : ''}${e.ofDays ? `<div class="muted" style="font-weight:500;font-size:15px">day ${e.dayOf} of ${e.ofDays}</div>` : ''}</div>
            <div style="min-width:0"><div style="font-size:19px;font-weight:500;overflow-wrap:anywhere">${esc(e.title)}</div>
              ${e.location ? `<div class="muted" style="font-size:15px;margin-top:2px;overflow-wrap:anywhere">${esc(e.location)}</div>` : ''}
              ${e.calendar ? `<div class="muted" style="font-size:15px;margin-top:2px">From ${esc(e.calendar)}</div>` : ''}
              ${e.id ? `<div class="muted" style="font-size:15px;margin-top:2px">Added here${REPEAT_WORDS[e.repeat] ? ` · ${REPEAT_WORDS[e.repeat]}` : ''} · tap to change</div>` : ''}</div>
          </div>`).join('') : `<div style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:4px 0 12px"><div style="width:240px">${spot.quietDay()}</div><div class="muted" style="font-size:19px">Nothing planned</div></div>`}
      </div>
    </div>`;
  box.style.display = 'flex';
}


// ---------- Adding / changing an event typed on this tablet ----------

const fmtMin = (m) => minutesText(m);
const LENGTHS = [[30, '30 min'], [60, '1 hr'], [90, '1½ hr'], [120, '2 hr'], [180, '3 hr']];
const REPEATS = [['none', 'Just once'], ['weekly', 'Every week'], ['fortnightly', 'Every 2 weeks'], ['monthly', 'Every month'], ['yearly', 'Every year']];
// One-tap times and titles, so most things need no typing at all.
const QUICK_TIMES = [9 * 60, 10 * 60, 12 * 60, 15 * 60, 17 * 60, 18 * 60, 19 * 60];
const COMMON_TITLES = ['Doctor', 'Dentist', 'Haircut', 'Visitors', 'Birthday party', 'School', 'Church', 'Bin day'];

function dayLabel(d) {
  const today = midnightOf(new Date());
  const diff = dayDiff(today, d);
  const name = d.toLocaleDateString('en-US', thisYear(d) ? { weekday: 'long', month: 'short', day: 'numeric' } : { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  return diff === 0 ? `Today · ${name}` : diff === 1 ? `Tomorrow · ${name}` : name;
}

function titleChips(current) {
  const seen = {};
  const list = [];
  recentTitles(4).concat(COMMON_TITLES).forEach((t) => {
    const k = t.toLowerCase();
    if (!seen[k] && list.length < 7) { seen[k] = true; list.push(t); }
  });
  return list.map((t) => `<button data-f="title" data-title-chip="${esc(t)}" class="cf-chip sm${current.trim().toLowerCase() === t.toLowerCase() ? ' on' : ''}">${esc(t)}</button>`).join('');
}

/** Open the form: a new event on `date`, or the saved event `id` (as it falls on day `on`). `back` = the day to return to on Cancel. */
function showForm(el, { date, id, back, on }) {
  const saved = id ? getMyEvent(id) : null;
  if (id && !saved) return;
  const now = new Date();
  const day = midnightOf(saved ? fromIso(saved.date) : date || now);
  // New timed events start at the next whole hour today, 9 AM on other days.
  const start = day.getTime() === midnightOf(now).getTime() ? Math.min(23, now.getHours() + 1) * 60 : 9 * 60;
  let mins = start;
  if (saved) { const t = saved.time.split(':').map(Number); mins = t[0] * 60 + t[1]; }
  form = saved
    ? { id: saved.id, title: saved.title, date: day, allDay: saved.allDay, mins, minutes: saved.minutes, repeat: saved.repeat || 'none', back, on: on || back || day, confirm: false, error: '' }
    : { id: '', title: '', date: day, allDay: false, mins, minutes: 60, repeat: 'none', back, confirm: false, error: '' };
  drawForm(el);
}

function drawForm(el) {
  const f = form;
  const box = el.querySelector('[data-detail]');
  const repeating = f.id && (getMyEvent(f.id) || {}).repeat && (getMyEvent(f.id) || {}).repeat !== 'none';
  const onLabel = f.on ? f.on.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '';
  box.innerHTML = `
    <div data-form style="background:#fff;border-radius:24px;padding:24px 32px;width:980px;box-sizing:border-box;display:flex;flex-direction:column;gap:14px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:16px">
        <div class="display" style="font-size:32px;font-weight:500">${f.id ? 'Change event' : 'Add to the calendar'}</div>
        <button data-f="cancel" class="pill" style="background:#fff;border:2px solid var(--line);cursor:pointer;min-height:52px;padding:0 24px">Cancel</button>
      </div>
      <div class="cf-line">
        <span class="cf-label">What</span>
        <input data-title class="cf-in" maxlength="80" placeholder="Tap a choice below, or type here" value="${esc(f.title)}" autocomplete="off">
      </div>
      <div class="cf-line"><span class="cf-label"></span><div class="cf-chips">${titleChips(f.title)}</div></div>
      <div class="cf-line">
        <span class="cf-label">Day</span>
        <div class="cf-row">
          <button data-f="date-1" class="cf-step" aria-label="Day before">‹</button>
          <div class="cf-val" style="min-width:0;width:290px;flex:none;font-size:22px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(dayLabel(f.date))}</div>
          <button data-f="date+1" class="cf-step" aria-label="Day after">›</button>
          <button data-f="date+7" class="cf-chip">+1 week</button>
          <button data-f="date+28" class="cf-chip">+4 weeks</button>
          <button data-f="today" class="cf-chip">Today</button>
        </div>
      </div>
      <div class="cf-line">
        <span class="cf-label">Time</span>
        <div class="cf-row">
          <button data-f="allday" class="cf-chip${f.allDay ? ' on' : ''}">All day</button>
          <button data-f="timed" class="cf-chip${f.allDay ? '' : ' on'}">At a time</button>
          ${f.allDay ? '' : `
          <span style="width:8px"></span>
          <button data-f="t-60" class="cf-step" aria-label="1 hour earlier">−1h</button>
          <button data-f="t-15" class="cf-step" aria-label="15 minutes earlier">−</button>
          <div class="cf-val" style="min-width:140px">${fmtMin(f.mins)}</div>
          <button data-f="t+15" class="cf-step" aria-label="15 minutes later">+</button>
          <button data-f="t+60" class="cf-step" aria-label="1 hour later">+1h</button>`}
        </div>
      </div>
      ${f.allDay ? '' : `
      <div class="cf-line"><span class="cf-label"></span><div class="cf-chips">${QUICK_TIMES.map((m) => `<button data-f="at:${m}" class="cf-chip sm${f.mins === m ? ' on' : ''}">${fmtMin(m)}</button>`).join('')}</div></div>
      <div class="cf-line"><span class="cf-label">How long</span><div class="cf-row">${LENGTHS.map(([m, t]) => `<button data-f="len:${m}" class="cf-chip${f.minutes === m ? ' on' : ''}">${t}</button>`).join('')}<span class="muted" style="font-size:17px;margin-left:6px">until ${fmtMin((f.mins + f.minutes) % 1440)}</span></div></div>`}
      <div class="cf-line">
        <span class="cf-label">Repeats</span>
        <div class="cf-row">${REPEATS.map(([k, t]) => `<button data-f="rep:${k}" class="cf-chip sm${f.repeat === k ? ' on' : ''}">${t}</button>`).join('')}</div>
      </div>
      <div style="display:flex;align-items:center;gap:12px;margin-top:4px;min-height:56px">
        ${f.confirm && repeating ? `
          <span style="font-weight:600;font-size:17px;flex:none">Remove which?</span>
          <button data-f="del:one" class="cf-chip" style="border-color:#B3261E;color:#B3261E">Just ${esc(onLabel)}</button>
          <button data-f="del:later" class="cf-chip" style="border-color:#B3261E;color:#B3261E">This and later</button>
          <button data-f="del:all" class="cf-chip" style="background:#B3261E;border-color:#B3261E;color:#fff">Every one</button>
          <button data-f="keep" class="cf-chip" style="margin-left:auto">Keep it</button>` : `
          <button data-f="save" class="pill" style="background:${settings.accent};color:#fff;border:none;cursor:pointer;font-size:19px;min-height:56px;padding:0 34px">${f.id ? 'Save changes' : 'Add to calendar'}</button>
          <div data-ferr style="color:#B3261E;font-weight:600;font-size:17px">${esc(f.error)}</div>
          ${f.id ? `<button data-f="delete" class="pill" style="margin-left:auto;min-height:56px;padding:0 24px;background:${f.confirm ? '#B3261E' : '#fff'};color:${f.confirm ? '#fff' : '#B3261E'};border:2px solid #B3261E;cursor:pointer">${f.confirm ? 'Tap again to remove' : 'Remove'}</button>` : ''}`}
      </div>
    </div>`;
  box.style.display = 'flex';
  const input = box.querySelector('[data-title]');
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); formAction(el, 'save'); } });
  // Typing a title that matches a choice lights it up (and un-lights the others).
  input.addEventListener('input', () => {
    box.querySelectorAll('[data-title-chip]').forEach((c) => { c.classList.toggle('on', c.dataset.titleChip.toLowerCase() === input.value.trim().toLowerCase()); });
  });
  // The keyboard isn't opened by itself: it would cover the choices. Tapping the box opens it.
}

function closeForm(el) {
  const back = form && form.back;
  form = null;
  el.querySelector('[data-detail]').style.display = 'none';
  return back;
}

// The days an event can be put on: from the first day of this week to the last week the arrows reach.
function clampDay(d) {
  const first = startOfWeek(new Date());
  const last = shiftDay(first, MAX_AHEAD * 7 + 6);
  return d < first ? first : d > last ? last : d;
}

// Show the week (or month) holding `d`, within what the arrows allow.
function goToWeekOf(d) {
  const weeks = Math.floor(dayDiff(startOfWeek(new Date()), midnightOf(d)) / 7);
  weekOffset = Math.max(MIN_WEEK, Math.min(MAX_AHEAD, weeks));
  const now = new Date();
  monthOffset = Math.max(MIN_MONTH, Math.min(MAX_MONTH, (d.getFullYear() - now.getFullYear()) * 12 + d.getMonth() - now.getMonth()));
}

// After a removal: a short "Undo" at the bottom of the screen.
function offerUndo(el, text, restore) {
  undo = { text, restore };
  clearTimeout(undoTimer);
  undoTimer = setTimeout(() => {
    undo = null;
    const bar = el.querySelector('[data-undo-bar]');
    if (bar) bar.remove();
  }, 10000);
}

function formAction(el, act, btn) {
  const f = form;
  if (!f) return;
  const input = el.querySelector('[data-title]');
  if (input) f.title = input.value;
  if (act !== 'delete') f.confirm = false;
  f.error = '';
  if (act === 'cancel') {
    const back = closeForm(el);
    if (back) showDayOn(el, back);
    return;
  }
  if (act === 'save') {
    try {
      saveMyEvent({ id: f.id, title: f.title, date: isoDay(f.date), allDay: f.allDay,
        time: `${String(Math.floor(f.mins / 60)).padStart(2, '0')}:${String(f.mins % 60).padStart(2, '0')}`, minutes: f.minutes, repeat: f.repeat });
    } catch (err) { f.error = err.message || 'Couldn’t save'; drawForm(el); return; }
    const d = f.date;
    closeForm(el);
    goToWeekOf(d);
    draw(el);
    showDayOn(el, d);
    return;
  }
  if (act === 'delete' || act.indexOf('del:') === 0) {
    const was = getMyEvent(f.id);
    if (!was) { closeForm(el); draw(el); return; }
    const repeating = was.repeat && was.repeat !== 'none';
    if (act === 'delete' && !f.confirm) { f.confirm = true; drawForm(el); return; }
    const on = f.on || f.date;
    let text = `Removed “${was.title}”`;
    if (act === 'del:one') { skipMyEventOn(f.id, on); text = `Removed “${was.title}” on ${on.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`; }
    else if (act === 'del:later') { endMyEventBefore(f.id, on); text = `“${was.title}” stops before ${on.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`; }
    else if (act === 'del:all' || !repeating) removeMyEvent(f.id);
    else return;
    const back = f.back || on;
    closeForm(el);
    offerUndo(el, text, () => restoreMyEvent(was));
    draw(el);
    showDayOn(el, back);
    return;
  }
  if (act === 'keep') { drawForm(el); return; }
  if (act === 'title') { f.title = btn ? btn.dataset.titleChip : f.title; drawForm(el); return; }
  if (act === 'today') f.date = midnightOf(new Date());
  else if (act.indexOf('date') === 0) f.date = clampDay(shiftDay(f.date, +act.slice(4)));
  else if (act === 'allday') f.allDay = true;
  else if (act === 'timed') f.allDay = false;
  else if (act.indexOf('at:') === 0) f.mins = +act.slice(3);
  else if (act.indexOf('len:') === 0) f.minutes = +act.slice(4);
  else if (act.indexOf('rep:') === 0) f.repeat = act.slice(4);
  else if (act[0] === 't') f.mins = (f.mins + +act.slice(1) + 1440) % 1440;
  drawForm(el);
}

// Open the day popup for date `d` (any day: from the week, the month or a saved change).
function showDayOn(el, d) {
  showDay(el, getDay(d));
}

export function mount(el) {
  view = 'week';
  weekOffset = 0;
  monthOffset = 0;
  form = null;
  undo = null;
  checking = false;
  draw(el);
  const step = (n) => {
    if (view === 'month') monthOffset = n === 0 ? 0 : Math.max(MIN_MONTH, Math.min(MAX_MONTH, monthOffset + n));
    else weekOffset = n === 0 ? 0 : Math.max(MIN_WEEK, Math.min(MAX_AHEAD, weekOffset + n));
  };
  // Swipe left/right across the week (or month) to change it (like turning a page).
  let touch = null, swipedAt = 0;
  el.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    touch = e.touches.length === 1 ? { x: t.clientX, y: t.clientY } : null;
  }, { passive: true });
  el.addEventListener('touchend', (e) => {
    const t = e.changedTouches[0];
    const box = el.querySelector('[data-detail]');
    if (!touch || !t || (box && box.style.display === 'flex')) { touch = null; return; }
    const dx = t.clientX - touch.x, dy = t.clientY - touch.y;
    touch = null;
    if (Math.abs(dx) < 80 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const before = view === 'month' ? monthOffset : weekOffset;
    step(dx < 0 ? 1 : -1);
    swipedAt = Date.now();
    if ((view === 'month' ? monthOffset : weekOffset) !== before) draw(el);
  });
  el.addEventListener('click', (e) => {
    if (Date.now() - swipedAt < 500) return; // the tap that ends a swipe doesn't open a day
    const box = el.querySelector('[data-detail]');
    if (e.target.closest('[data-undo]') && undo) {
      try { undo.restore(); } catch (err) { /* nothing to put back */ }
      undo = null;
      clearTimeout(undoTimer);
      const open = box && box.style.display === 'flex' && !form ? el.querySelector('[data-day-box]') : null;
      draw(el);
      if (open) showDayOn(el, fromIso(open.dataset.dayBox));
      return;
    }
    if (form) {
      // The form only closes with Cancel / Save, so a stray tap can't lose what was typed.
      const fb = e.target.closest('[data-f]');
      if (fb) formAction(el, fb.dataset.f, fb);
      return;
    }
    const add = e.target.closest('[data-add]');
    if (add) {
      const back = add.dataset.add ? fromIso(add.dataset.add) : null;
      // From the header: today, or the first day of the week / month on screen.
      const first = view === 'month' ? monthStart() : weekStart();
      const shown = (view === 'month' ? monthOffset : weekOffset) !== 0 && first > new Date() ? first : new Date();
      showForm(el, { date: back || clampDay(midnightOf(shown)), back });
      return;
    }
    if (box && box.style.display === 'flex') {
      const ed = e.target.closest('[data-edit]');
      if (ed) {
        const shown = el.querySelector('[data-day-box]');
        const on = shown ? fromIso(shown.dataset.dayBox) : null;
        showForm(el, { id: ed.dataset.edit, back: on, on });
        return;
      }
      if (e.target === box || e.target.closest('[data-close]')) box.style.display = 'none';
      return;
    }
    const check = e.target.closest('[data-check]');
    if (check) {
      checking = true;
      draw(el);
      refreshCalendars(true).then(() => { checking = false; if (el.isConnected && !form) onUpdate(); });
      return;
    }
    const jump = e.target.closest('[data-jump]');
    if (jump) { const d = fromIso(jump.dataset.jump); goToWeekOf(d); draw(el); showDayOn(el, d); return; }
    const v = e.target.closest('[data-view]');
    if (v) {
      if (v.dataset.view === view) return;
      // Switching keeps roughly the same place: the month holding the week on screen, or that month's first week.
      if (v.dataset.view === 'month') goToWeekOf(weekOffset === 0 ? new Date() : shiftDay(weekStart(), 3));
      else goToWeekOf(monthOffset === 0 ? new Date() : monthStart());
      view = v.dataset.view;
      draw(el);
      return;
    }
    const day = e.target.closest('[data-day]');
    if (day) { showDayOn(el, fromIso(day.dataset.day)); return; }
    const b = e.target.closest('[data-step]');
    if (!b || b.disabled) return;
    step(+b.dataset.step);
    draw(el);
  });
  // Don't redraw under an open form or day popup (a background calendar download would close them).
  onUpdate = () => {
    if (!el.isConnected || form) return;
    const box = el.querySelector('[data-detail]');
    if (box && box.style.display === 'flex') return;
    draw(el);
  };
  window.addEventListener('calendar-updated', onUpdate);
  refreshCalendars(); // no-op unless the saved copy is older than 30 minutes
  // Re-render when the day rolls over so "today" and the week stay current.
  let day = new Date().toDateString();
  timer = setInterval(() => {
    const now = new Date().toDateString();
    if (now !== day) { day = now; onUpdate(); }
  }, 60000);
}

export function unmount() {
  form = null;
  undo = null;
  clearInterval(timer);
  clearTimeout(undoTimer);
  window.removeEventListener('calendar-updated', onUpdate);
}
