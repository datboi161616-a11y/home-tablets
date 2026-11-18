// Family · Week calendar (Calendar.dc.html in the design)
import { settings } from '../config.js';
import { getWeek, nextBigThing, calendarStatus, refreshCalendars, KINDS } from '../services/calendar-data.js';

let timer, onUpdate;
let weekOffset = 0; // 0 = this week, 1 = next week… (the arrows; back to this week on every visit)
const MAX_AHEAD = 8; // calendar links are read about two months ahead

const colorOf = (kind) => (kind === 'family' ? settings.accent : KINDS[kind]?.color || '#2D5BA8');

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Right side of the footer: setup hint, a download problem, or a tip.
function footerNote() {
  const st = calendarStatus();
  if (!st.calendars) return 'Add your Google or iPhone calendar: Photos → Add photos → scan the code → Tablet settings';
  if (st.lastError) return `${st.lastError} · showing saved events`;
  return 'Add events on your phone’s calendar — they show up here';
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

function render(el) {
  const days = getWeek(new Date(Date.now() + weekOffset * 7 * 86400000));
  const big = nextBigThing();

  el.innerHTML = `
  <style>
    .cal-ev { color:#fff; border-radius:12px; padding:10px 12px; display:flex; flex-direction:column; gap:2px; flex:none; min-width:0; }
    .cal-ev-time { font-size:13px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .cal-ev-title { font-size:16px; line-height:1.3; overflow-wrap:anywhere; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
    [data-week][disabled] { opacity:.3; }
    .cal-more { font-size:14px; font-weight:600; opacity:.7; flex:none; }
    .cal-day { border-radius:20px; padding:18px 14px; display:flex; flex-direction:column; gap:12px; min-height:0; overflow:hidden; }
    .cal-day.today .cal-ev[data-kind="birthday"] { box-shadow: inset 0 0 0 2px rgba(255,255,255,.35); }
  </style>
  <div style="height:100%;padding:40px;display:flex;flex-direction:column;gap:24px">
    <div style="display:flex;align-items:center;justify-content:space-between">
      <div style="display:flex;align-items:center;gap:16px">
        <a href="#/launcher" class="pill" style="background:#fff">← Menu</a>
        <div class="display" style="font-size:40px;font-weight:500;min-width:250px">${weekTitle(days)}</div>
        <button data-week="-1" class="pill" style="background:#fff;border:none;font-size:22px;padding:0 18px;cursor:pointer"${weekOffset <= 0 ? ' disabled' : ''} aria-label="Earlier week">‹</button>
        <button data-week="1" class="pill" style="background:#fff;border:none;font-size:22px;padding:0 18px;cursor:pointer"${weekOffset >= MAX_AHEAD ? ' disabled' : ''} aria-label="Later week">›</button>
        ${weekOffset ? '<button data-week="0" class="pill" style="background:var(--ink);color:#fff;border:none;cursor:pointer">Today</button>' : ''}
      </div>
      <div class="muted" style="display:flex;gap:16px;font-size:16px">
        ${Object.entries(KINDS).map(([k, v]) => `
          <div style="display:flex;align-items:center;gap:8px"><div style="width:12px;height:12px;border-radius:50%;background:${colorOf(k)}"></div>${v.label}</div>`).join('')}
      </div>
    </div>

    <div style="flex-grow:1;min-height:0;display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:12px">
      ${days.map((d) => `
        <div class="cal-day${d.isToday ? ' today' : ''}" data-day="${days.indexOf(d)}" style="cursor:pointer;${d.isToday ? 'background:var(--ink);color:#fff' : 'background:#fff'}">
          <div style="display:flex;flex-direction:column;gap:2px">
            <div class="eyebrow">${d.dow}</div>
            <div class="display" style="font-size:40px;font-weight:500;line-height:1">${d.num}</div>
          </div>
          ${d.events.map((e) => `
            <div class="cal-ev" data-kind="${e.kind}" style="background:${colorOf(e.kind)}">
              <div class="cal-ev-time">${esc(e.time)}</div>
              <div class="cal-ev-title">${esc(e.title)}</div>
            </div>`).join('')}
        </div>`).join('')}
    </div>

    <div data-detail style="display:none;position:absolute;top:0;right:0;bottom:0;left:0;background:rgba(29,36,48,.45);z-index:5;align-items:center;justify-content:center"></div>

    <div style="background:#fff;border-radius:20px;padding:18px 24px;display:flex;justify-content:space-between;align-items:center;font-size:18px">
      <div>${big ? `<span style="font-weight:600">Next big thing:</span> ${esc(big.name)}${big.where ? ` at ${esc(big.where)}` : ''} · ${big.label}` : ''}</div>
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
        <button data-close class="pill" style="background:var(--ink);color:#fff;border:none;cursor:pointer">Close</button>
      </div>
      <div style="overflow-y:auto;display:flex;flex-direction:column;gap:10px">
        ${d.events.length ? d.events.map((e) => `
          <div style="display:flex;gap:14px;align-items:flex-start;padding:12px 0;border-top:1px solid var(--line)">
            <div style="width:12px;height:12px;border-radius:50%;margin-top:7px;flex:none;background:${colorOf(e.kind)}"></div>
            <div style="width:150px;flex:none;font-weight:600;font-size:17px">${esc(e.time)}${e.endTime ? `<div class="muted" style="font-weight:500;font-size:15px">to ${esc(e.endTime)}</div>` : ''}</div>
            <div style="min-width:0"><div style="font-size:19px;font-weight:500;overflow-wrap:anywhere">${esc(e.title)}</div>
              ${e.location ? `<div class="muted" style="font-size:15px;margin-top:2px;overflow-wrap:anywhere">${esc(e.location)}</div>` : ''}</div>
          </div>`).join('') : '<div class="muted" style="font-size:19px;padding:12px 0">Nothing planned</div>'}
      </div>
    </div>`;
  box.style.display = 'flex';
}

export function mount(el) {
  weekOffset = 0;
  draw(el);
  el.addEventListener('click', (e) => {
    const box = el.querySelector('[data-detail]');
    if (box && box.style.display === 'flex') {
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
  onUpdate = () => { if (el.isConnected) draw(el); };
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
  clearInterval(timer);
  window.removeEventListener('calendar-updated', onUpdate);
}
