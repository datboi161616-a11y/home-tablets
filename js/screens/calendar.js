// Family · Week calendar (Calendar.dc.html in the design)
import { settings } from '../config.js';
import { getWeek, nextBigThing, KINDS } from '../services/calendar-data.js';

let timer;

const colorOf = (kind) => (kind === 'family' ? settings.accent : KINDS[kind]?.color || '#2D5BA8');

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function render(el) {
  const days = getWeek();
  const big = nextBigThing();

  el.innerHTML = `
  <style>
    .cal-ev { color:#fff; border-radius:12px; padding:10px 12px; display:flex; flex-direction:column; gap:2px; }
    .cal-ev-time { font-size:13px; font-weight:600; }
    .cal-ev-title { font-size:16px; line-height:1.3; overflow-wrap:anywhere; }
    .cal-day { border-radius:20px; padding:18px 14px; display:flex; flex-direction:column; gap:12px; min-height:0; overflow:hidden; }
    .cal-day.today .cal-ev[data-kind="birthday"] { box-shadow: inset 0 0 0 2px rgba(255,255,255,.35); }
  </style>
  <div style="height:100%;padding:40px;display:flex;flex-direction:column;gap:24px">
    <div style="display:flex;align-items:center;justify-content:space-between">
      <div style="display:flex;align-items:center;gap:16px">
        <a href="#/launcher" class="pill" style="background:#fff">← Menu</a>
        <div class="display" style="font-size:40px;font-weight:500">This week</div>
      </div>
      <div class="muted" style="display:flex;gap:16px;font-size:16px">
        ${Object.entries(KINDS).map(([k, v]) => `
          <div style="display:flex;align-items:center;gap:8px"><div style="width:12px;height:12px;border-radius:50%;background:${colorOf(k)}"></div>${v.label}</div>`).join('')}
      </div>
    </div>

    <div style="flex-grow:1;min-height:0;display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:12px">
      ${days.map((d) => `
        <div class="cal-day${d.isToday ? ' today' : ''}" style="${d.isToday ? 'background:var(--ink);color:#fff' : 'background:#fff'}">
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

    <div style="background:#fff;border-radius:20px;padding:18px 24px;display:flex;justify-content:space-between;align-items:center;font-size:18px">
      <div>${big ? `<span style="font-weight:600">Next big thing:</span> ${esc(big.name)}${big.where ? ` at ${esc(big.where)}` : ''} · ${big.label}` : ''}</div>
      <div class="muted">Anyone in the family can add events from their phone</div>
    </div>
  </div>`;
}

export function mount(el) {
  render(el);
  // Re-render when the day rolls over so "today" and the week stay current.
  let day = new Date().toDateString();
  timer = setInterval(() => {
    const now = new Date().toDateString();
    if (now !== day) { day = now; render(el); }
  }, 60000);
}

export function unmount() {
  clearInterval(timer);
}
