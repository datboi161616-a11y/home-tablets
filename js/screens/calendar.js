// Family · Week calendar (Calendar.dc.html in the design)
import { settings } from '../config.js';
import { getWeek, nextBigThing, calendarStatus, refreshCalendars, KINDS } from '../services/calendar-data.js';
import { eventIcon, spot } from '../art.js';
import { saveMyEvent, removeMyEvent, getMyEvent, myEvents, isoDay, fromIso } from '../services/my-events.js';

let timer, onUpdate;
let weekOffset = 0;
let form = null; // the add / change form while it's open (see showForm) // 0 = this week, 1 = next week… (the arrows; back to this week on every visit)
const MAX_AHEAD = 8; // calendar links are read about two months ahead

const colorOf = (kind) => (kind === 'family' ? settings.accent : KINDS[kind]?.color || '#2D5BA8');

// Little pictures for birthdays, holidays and named occasions (not for every dentist visit).
const OCCASION = /christmas|xmas|eve|thanksgiving|labor day|birthday|bday|valentine|anniversar|wedding|mother|father|patrick|easter|halloween|independence|memorial|veteran|president|new year/i;
function iconFor(e, size) {
  if (e.kind === 'birthday') return eventIcon(OCCASION.test(e.title) ? e.title : 'birthday', size);
  if (e.kind === 'holiday' || OCCASION.test(e.title)) return eventIcon(e.title, size);
  return '';
}
// The icon on a white disc, so it reads on any event colour.
const iconBadge = (e) => { const i = iconFor(e, 18); return i ? `<span class="cal-badge">${i}</span>` : ''; };

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Right side of the footer: setup hint, a download problem, or a tip.
function footerNote() {
  const st = calendarStatus();
  if (!st.calendars) return 'Tap + Add to put something on. Google or iPhone calendars: Add photos → scan the code → Tablet settings';
  if (st.lastError) {
    // Say how old the saved copy is, so nobody trusts a week-old calendar by mistake.
    const at = st.savedAt;
    if (!at) return `${st.lastError} · it will keep trying`;
    const time = at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const day = at.toDateString() === new Date().toDateString() ? 'today' : at.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    return `${st.lastError} · showing events saved ${day} at ${time}`;
  }
  return 'Tap + Add, or add events on your phone’s calendar — they show up here';
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
  return `Week of ${days[0].date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

// "Nov 16 – 22" or "Nov 30 – Dec 6": which dates the arrows have landed on.
function weekRange(days) {
  const a = days[0].date, b = days[6].date;
  const md = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return a.getMonth() === b.getMonth() ? `${md(a)} – ${b.getDate()}` : `${md(a)} – ${md(b)}`;
}

// "Thanksgiving · Nov 26 · in 8 days"
function countdown(big) {
  if (big.days === 0) return 'today!';
  if (big.days === 1) return 'tomorrow';
  return `in ${big.days} days`;
}

function render(el) {
  const days = getWeek(new Date(Date.now() + weekOffset * 7 * 86400000));
  const big = nextBigThing();
  const today = new Date(); today.setHours(0, 0, 0, 0);

  el.innerHTML = `
  <style>
    .cal-ev { color:#fff; border-radius:12px; padding:10px 12px; display:flex; flex-direction:column; gap:2px; flex:none; min-width:0; }
    .cal-ev-top { display:flex; align-items:center; gap:6px; min-width:0; }
    .cal-badge { flex:none; width:24px; height:24px; border-radius:12px; background:#fff; display:flex; align-items:center; justify-content:center; }
    .cal-quiet { position:absolute; left:50%; bottom:28px; transform:translateX(-50%); width:560px; background:#fff; border-radius:24px; padding:14px 32px 14px 14px;
      display:flex; align-items:center; gap:12px; box-shadow:0 12px 36px rgba(29,36,48,.14); pointer-events:none; }
    .cal-ev-time { font-size:13px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .cal-ev-title { font-size:16px; line-height:1.3; overflow-wrap:anywhere; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
    [data-week][disabled] { opacity:.3; }
    .cal-more { font-size:14px; font-weight:600; opacity:.7; flex:none; }
    .cal-day { border-radius:20px; padding:18px 14px; display:flex; flex-direction:column; gap:12px; min-height:0; overflow:hidden; }
    .cal-day.past { opacity:.55; }
    .cf-label { font-size:14px; font-weight:600; letter-spacing:1px; text-transform:uppercase; color:var(--ink-2); }
    .cf-row { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
    .cf-chip { min-height:52px; padding:0 20px; border-radius:26px; border:2px solid var(--line); background:#fff; color:var(--ink); font:600 17px Inter,sans-serif; cursor:pointer; }
    .cf-chip.on { background:var(--ink); border-color:var(--ink); color:#fff; }
    .cf-step { width:56px; height:52px; border-radius:26px; border:2px solid var(--line); background:#fff; color:var(--ink); font:600 18px Inter,sans-serif; cursor:pointer; }
    .cf-val { min-width:230px; text-align:center; font:500 24px Outfit,sans-serif; }
    .cf-in { width:100%; height:60px; box-sizing:border-box; border:2px solid var(--line); border-radius:16px; padding:0 18px; font:22px Inter,sans-serif; color:var(--ink); outline:none; user-select:text; }
    .cf-in:focus { border-color:${settings.accent}; }
    .cd-mine { cursor:pointer; border-radius:14px; }
    .cd-mine:active { background:#F2F4F7; }
    .cal-day.today .cal-ev[data-kind="birthday"] { box-shadow: inset 0 0 0 2px rgba(255,255,255,.35); }
  </style>
  <div style="height:100%;padding:40px;display:flex;flex-direction:column;gap:24px">
    <div style="display:flex;align-items:center;justify-content:space-between">
      <div style="display:flex;align-items:center;gap:16px">
        <a href="#/launcher" class="pill" style="background:#fff">← Menu</a>
        <div style="min-width:250px;display:flex;flex-direction:column">
          <div class="display" style="font-size:40px;font-weight:500;line-height:1.1">${weekTitle(days)}</div>
          <div class="muted" style="font-size:16px;font-weight:500">${weekRange(days)}</div>
        </div>
        <button data-week="-1" class="pill" style="background:#fff;border:none;font-size:22px;padding:0 18px;cursor:pointer"${weekOffset <= 0 ? ' disabled' : ''} aria-label="Earlier week">‹</button>
        <button data-week="1" class="pill" style="background:#fff;border:none;font-size:22px;padding:0 18px;cursor:pointer"${weekOffset >= MAX_AHEAD ? ' disabled' : ''} aria-label="Later week">›</button>
        ${weekOffset ? '<button data-week="0" class="pill" style="background:var(--ink);color:#fff;border:none;cursor:pointer">Today</button>' : ''}
        <button data-add class="pill" style="background:${settings.accent};color:#fff;border:none;cursor:pointer;font-size:18px;padding:0 24px">+ Add</button>
      </div>
      <div class="muted" style="display:flex;gap:16px;font-size:16px">
        ${Object.entries(KINDS).filter(([k]) => k !== 'tablet' || myEvents().length).map(([k, v]) => `
          <div style="display:flex;align-items:center;gap:8px"><div style="width:12px;height:12px;border-radius:50%;background:${colorOf(k)}"></div>${v.label}</div>`).join('')}
      </div>
    </div>

    <div style="flex-grow:1;min-height:0;position:relative;display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:12px">
      ${days.map((d) => `
        <div class="cal-day${d.isToday ? ' today' : ''}${!d.isToday && d.date < today ? ' past' : ''}" data-day="${days.indexOf(d)}" style="cursor:pointer;${d.isToday ? 'background:var(--ink);color:#fff' : 'background:#fff'}">
          <div style="display:flex;flex-direction:column;gap:2px">
            <div class="eyebrow">${d.dow}</div>
            <div class="display" style="font-size:40px;font-weight:500;line-height:1">${d.num}</div>
          </div>
          ${d.events.map((e) => `
            <div class="cal-ev" data-kind="${e.kind}" style="background:${colorOf(e.kind)}">
              <div class="cal-ev-top">${iconBadge(e)}<div class="cal-ev-time">${esc(e.time)}</div></div>
              <div class="cal-ev-title">${esc(e.title)}</div>
            </div>`).join('')}
        </div>`).join('')}
      ${days.every((d) => !d.events.length) ? `
        <div class="cal-quiet">
          <div style="flex:none;width:180px">${spot.quietDay()}</div>
          <div style="display:flex;flex-direction:column;gap:6px">
            <div class="display" style="font-size:28px;font-weight:500">A quiet week</div>
            <div class="muted" style="font-size:17px;line-height:1.35">Nothing on the calendar this week.</div>
          </div>
        </div>` : ''}
    </div>

    <div data-detail style="display:none;position:absolute;top:0;right:0;bottom:0;left:0;background:rgba(29,36,48,.45);z-index:5;align-items:center;justify-content:center"></div>

    <div style="background:#fff;border-radius:20px;padding:18px 24px;display:flex;justify-content:space-between;align-items:center;font-size:18px">
      <div style="white-space:nowrap;flex:none;max-width:62%;overflow:hidden;text-overflow:ellipsis">${big ? `<span style="font-weight:600">Next big thing:</span> <span style="display:inline-block;vertical-align:-5px;margin:0 2px">${eventIcon(big.name, 24)}</span> ${esc(big.name)}${big.where ? ` at ${esc(big.where)}` : ''} · ${big.label} · <span style="font-weight:600">${countdown(big)}</span>` : ''}</div>
      <div class="muted" style="text-align:right;margin-left:16px">${esc(footerNote())}</div>
    </div>
  </div>`;
}

function draw(el) {
  render(el);
  fitDays(el);
  // Again after layout settles (older WebViews add flex-gap margins a frame later).
  requestAnimationFrame(() => setTimeout(() => { if (el.isConnected) fitDays(el); }, 50));
}

// Tap a day: everything on it, with full titles, times and places.
function showDay(el, d) {
  const box = el.querySelector('[data-detail]');
  const title = d.date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  box.innerHTML = `
    <div style="background:#fff;border-radius:24px;padding:28px 32px;width:640px;max-height:640px;display:flex;flex-direction:column;gap:16px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:16px">
        <div class="display" style="font-size:32px;font-weight:500">${esc(title)}</div>
        <div style="display:flex;gap:10px;flex:none">
          <button data-add="${isoDay(d.date)}" class="pill" style="background:${settings.accent};color:#fff;border:none;cursor:pointer">+ Add</button>
          <button data-close class="pill" style="background:var(--ink);color:#fff;border:none;cursor:pointer">Close</button>
        </div>
      </div>
      <div style="overflow-y:auto;display:flex;flex-direction:column;gap:10px">
        ${d.events.length ? d.events.map((e) => `
          <div${e.id ? ` data-edit="${esc(e.id)}" class="cd-mine"` : ''} style="display:flex;gap:14px;align-items:flex-start;padding:12px 0;border-top:1px solid var(--line)">
            ${iconFor(e, 24) ? `<div style="width:24px;flex:none;margin-top:1px">${iconFor(e, 24)}</div>` : `<div style="width:12px;height:12px;border-radius:50%;margin:7px 6px 0;flex:none;background:${colorOf(e.kind)}"></div>`}
            <div style="width:150px;flex:none;font-weight:600;font-size:17px">${esc(e.time)}${e.endTime ? `<div class="muted" style="font-weight:500;font-size:15px">to ${esc(e.endTime)}</div>` : ''}</div>
            <div style="min-width:0"><div style="font-size:19px;font-weight:500;overflow-wrap:anywhere">${esc(e.title)}</div>
              ${e.location ? `<div class="muted" style="font-size:15px;margin-top:2px;overflow-wrap:anywhere">${esc(e.location)}</div>` : ''}
              ${e.id ? '<div class="muted" style="font-size:15px;margin-top:2px">Added on this tablet · tap to change</div>' : ''}</div>
          </div>`).join('') : `<div style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:4px 0 12px"><div style="width:240px">${spot.quietDay()}</div><div class="muted" style="font-size:19px">Nothing planned</div></div>`}
      </div>
    </div>`;
  box.style.display = 'flex';
}


// ---------- Adding / changing an event typed on this tablet ----------

const fmtMin = (m) => { const h = Math.floor(m / 60), mm = m % 60; return `${((h + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
const LENGTHS = [[30, '30 min'], [60, '1 hr'], [90, '1½ hr'], [120, '2 hr'], [180, '3 hr']];
const REPEATS = [['none', 'Just once'], ['weekly', 'Every week'], ['yearly', 'Every year']];
const midnightOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const shiftDay = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

function dayLabel(d) {
  const today = midnightOf(new Date());
  const diff = Math.round((d - today) / 86400000);
  const name = d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  return diff === 0 ? `Today · ${name}` : diff === 1 ? `Tomorrow · ${name}` : name;
}

/** Open the form: a new event on `date`, or the saved event `id`. `back` = the day to return to on Cancel. */
function showForm(el, { date, id, back }) {
  const saved = id ? getMyEvent(id) : null;
  if (id && !saved) return;
  const now = new Date();
  const day = midnightOf(saved ? fromIso(saved.date) : date || now);
  // New timed events start at the next whole hour today, 9 AM on other days.
  const start = day.getTime() === midnightOf(now).getTime() ? Math.min(23, now.getHours() + 1) * 60 : 9 * 60;
  let mins = start;
  if (saved) { const t = saved.time.split(':').map(Number); mins = t[0] * 60 + t[1]; }
  form = saved
    ? { id: saved.id, title: saved.title, date: day, allDay: saved.allDay, mins, minutes: saved.minutes, repeat: saved.repeat, back, confirm: false, error: '' }
    : { id: '', title: '', date: day, allDay: false, mins, minutes: 60, repeat: 'none', back, confirm: false, error: '' };
  drawForm(el, true);
}

function drawForm(el, focus) {
  const f = form;
  const box = el.querySelector('[data-detail]');
  box.innerHTML = `
    <div data-form style="background:#fff;border-radius:24px;padding:26px 32px;width:820px;display:flex;flex-direction:column;gap:16px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:16px">
        <div class="display" style="font-size:32px;font-weight:500">${f.id ? 'Change event' : 'Add to the calendar'}</div>
        <button data-f="cancel" class="pill" style="background:#fff;border:2px solid var(--line);cursor:pointer">Cancel</button>
      </div>
      <label style="display:flex;flex-direction:column;gap:8px">
        <span class="cf-label">What’s happening</span>
        <input data-title class="cf-in" maxlength="80" placeholder="e.g. Ava’s soccer game" value="${esc(f.title)}" autocomplete="off">
      </label>
      <div style="display:flex;flex-direction:column;gap:8px">
        <span class="cf-label">Day</span>
        <div class="cf-row">
          <button data-f="date-1" class="cf-step" aria-label="Day before">‹</button>
          <div class="cf-val" style="min-width:300px">${esc(dayLabel(f.date))}</div>
          <button data-f="date+1" class="cf-step" aria-label="Day after">›</button>
          <button data-f="date+7" class="cf-chip">+1 week</button>
          <button data-f="today" class="cf-chip">Today</button>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px">
        <span class="cf-label">Time</span>
        <div class="cf-row">
          <button data-f="allday" class="cf-chip${f.allDay ? ' on' : ''}">All day</button>
          <button data-f="timed" class="cf-chip${f.allDay ? '' : ' on'}">At a time</button>
          ${f.allDay ? '' : `
          <span style="width:12px"></span>
          <button data-f="t-60" class="cf-step" aria-label="1 hour earlier">−1h</button>
          <button data-f="t-15" class="cf-step" aria-label="15 minutes earlier">−</button>
          <div class="cf-val" style="min-width:140px">${fmtMin(f.mins)}</div>
          <button data-f="t+15" class="cf-step" aria-label="15 minutes later">+</button>
          <button data-f="t+60" class="cf-step" aria-label="1 hour later">+1h</button>`}
        </div>
        ${f.allDay ? '' : `<div class="cf-row"><span class="muted" style="font-size:17px;margin-right:4px">How long</span>${LENGTHS.map(([m, t]) => `<button data-f="len:${m}" class="cf-chip${f.minutes === m ? ' on' : ''}">${t}</button>`).join('')}<span class="muted" style="font-size:16px;margin-left:6px">until ${fmtMin((f.mins + f.minutes) % 1440)}</span></div>`}
      </div>
      <div style="display:flex;flex-direction:column;gap:8px">
        <span class="cf-label">Repeats</span>
        <div class="cf-row">${REPEATS.map(([k, t]) => `<button data-f="rep:${k}" class="cf-chip${f.repeat === k ? ' on' : ''}">${t}</button>`).join('')}</div>
      </div>
      <div style="display:flex;align-items:center;gap:14px;margin-top:4px">
        <button data-f="save" class="pill" style="background:${settings.accent};color:#fff;border:none;cursor:pointer;font-size:19px;min-height:56px;padding:0 34px">${f.id ? 'Save changes' : 'Add to calendar'}</button>
        <div data-ferr style="color:#B3261E;font-weight:600;font-size:17px">${esc(f.error)}</div>
        ${f.id ? `<button data-f="delete" class="pill" style="margin-left:auto;background:${f.confirm ? '#B3261E' : '#fff'};color:${f.confirm ? '#fff' : '#B3261E'};border:2px solid #B3261E;cursor:pointer">${f.confirm ? 'Tap again to remove' : 'Remove'}</button>` : ''}
      </div>
    </div>`;
  box.style.display = 'flex';
  const input = box.querySelector('[data-title]');
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); formAction(el, 'save'); } });
  if (focus && !f.id) input.focus();
}

function closeForm(el) {
  const back = form && form.back;
  form = null;
  el.querySelector('[data-detail]').style.display = 'none';
  return back;
}

// Jump the week view to the week holding `d` (within the weeks the arrows allow).
function goToWeekOf(d) {
  const mon = midnightOf(new Date()); mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7));
  const weeks = Math.floor(Math.round((midnightOf(d) - mon) / 86400000) / 7);
  weekOffset = Math.max(0, Math.min(MAX_AHEAD, weeks));
}

function formAction(el, act) {
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
  if (act === 'delete') {
    if (!f.confirm) { f.confirm = true; drawForm(el); return; }
    removeMyEvent(f.id);
    const d = f.date;
    closeForm(el);
    draw(el);
    showDayOn(el, d);
    return;
  }
  if (act === 'today') f.date = midnightOf(new Date());
  else if (act.indexOf('date') === 0) f.date = shiftDay(f.date, +act.slice(4));
  else if (act === 'allday') f.allDay = true;
  else if (act === 'timed') f.allDay = false;
  else if (act.indexOf('len:') === 0) f.minutes = +act.slice(4);
  else if (act.indexOf('rep:') === 0) f.repeat = act.slice(4);
  else if (act[0] === 't') f.mins = (f.mins + +act.slice(1) + 1440) % 1440;
  drawForm(el);
}

// Open the day popup for date `d`, if that day is in the week on screen.
function showDayOn(el, d) {
  const days = getWeek(new Date(Date.now() + weekOffset * 7 * 86400000));
  const hit = days.find((x) => x.date.getTime() === midnightOf(d).getTime());
  if (hit) showDay(el, hit);
}

export function mount(el) {
  weekOffset = 0;
  form = null;
  draw(el);
  // Swipe left/right across the week to change weeks (like turning a page).
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
    const next = Math.max(0, Math.min(MAX_AHEAD, weekOffset + (dx < 0 ? 1 : -1)));
    swipedAt = Date.now();
    if (next !== weekOffset) { weekOffset = next; draw(el); }
  });
  el.addEventListener('click', (e) => {
    if (Date.now() - swipedAt < 500) return; // the tap that ends a swipe doesn't open a day
    const box = el.querySelector('[data-detail]');
    if (form) {
      // The form only closes with Cancel / Save, so a stray tap can't lose what was typed.
      const fb = e.target.closest('[data-f]');
      if (fb) formAction(el, fb.dataset.f);
      return;
    }
    const add = e.target.closest('[data-add]');
    if (add) {
      const back = add.dataset.add ? fromIso(add.dataset.add) : null;
      const first = getWeek(new Date(Date.now() + weekOffset * 7 * 86400000))[0].date;
      showForm(el, { date: back || (weekOffset ? first : new Date()), back });
      return;
    }
    if (box && box.style.display === 'flex') {
      const ed = e.target.closest('[data-edit]');
      if (ed) {
        const shown = el.querySelector('[data-detail] [data-add]');
        showForm(el, { id: ed.dataset.edit, back: shown ? fromIso(shown.dataset.add) : null });
        return;
      }
      if (e.target === box || e.target.closest('[data-close]')) box.style.display = 'none';
      return;
    }
    const day = e.target.closest('[data-day]');
    if (day) { showDay(el, getWeek(new Date(Date.now() + weekOffset * 7 * 86400000))[+day.dataset.day]); return; }
    const b = e.target.closest('[data-week]');
    if (!b || b.disabled) return;
    const n = +b.dataset.week;
    weekOffset = n === 0 ? 0 : Math.max(0, Math.min(MAX_AHEAD, weekOffset + n));
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
    if (now !== day) { day = now; draw(el); }
  }, 60000);
}

export function unmount() {
  form = null;
  clearInterval(timer);
  window.removeEventListener('calendar-updated', onUpdate);
}
