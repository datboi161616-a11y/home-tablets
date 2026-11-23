// Calendar: a big traditional month where every day keeps its best photo, so the month
// reads as a mosaic (board KC03). Days still to come show what is planned. Tapping a day
// opens it (what is on, its photos, Add); "Add" opens a large sheet built around a month
// to pick the day from. A week view is one button away.
import { minutesText, timeText } from '../services/display.js';
import { settings } from '../config.js';
import { getWeek, getDay, nextAfter, nextBigThing, calendarStatus, refreshCalendars, linkedCalendars, startOfWeek, weekdayNames, KINDS, BACK_WEEKS } from '../services/calendar-data.js';
import { eventIcon } from '../art.js';
import { saveMyEvent, removeMyEvent, getMyEvent, myEvents, isoDay, fromIso, restoreMyEvent, skipMyEventOn, endMyEventBefore, recentTitles } from '../services/my-events.js';
import { getPhotos, thumbnail, isTablet } from '../services/tablet-photos.js';
import { photos as samplePhotos } from '../services/family-sample.js';
import { topBar, esc, people, personColor, phoneCode, wirePhoneCodes, season, seasonLayer } from './ui.js';

let timer, onUpdate, onPhotos, undoTimer, stopCodes;
let view = 'month'; // 'month' (opens first) or 'week'
let weekOffset = 0; // 0 = this week, 1 = next week, -1 = last week… (the arrows)
let monthOffset = 0; // 0 = this month
let form = null; // the add / change sheet while it's open (see showForm)
let sheet = ''; // '', 'day' or 'cals': which other sheet is open over the month
let stale = false; // something changed while a sheet was open: draw again when it closes
let undo = null; // { text, restore } after a removal, for the "Undo" button
let checking = false; // "Check now" was tapped and the calendars are being read
let album = null; // this screen's photos filed by day (see photosByDay)
// How many weeks ahead the arrows go: a year, so something added for a later date can
// always be seen, changed and removed.
const MAX_AHEAD = 52;
const MIN_WEEK = -BACK_WEEKS; // a few weeks back: "when was the plumber here?"
const MAX_MONTH = 12;
const DAY = 86400000;
const GOLD = '#FFCF7A';

// A colour for each kind of thing typed here (my-events.js EVENT_TAGS).
const TAGS = {
  plan: { label: 'Plan', color: '#7A6CB8' },
  appointment: { label: 'Appointment', color: '#5B7FD6' },
  out: { label: 'Going out', short: 'Out', color: '#D05C8E' },
  trip: { label: 'Trip', color: '#3E9BC0' },
  birthday: { label: 'Birthday', color: '#C9892B' },
  reminder: { label: 'Reminder', color: '#8C7A6B' },
};
// (The screen is dark: birthdays are gold here, not the ink colour the light screens used.)
const colorOf = (kind) => (kind === 'family' ? settings.accent : kind === 'birthday' ? '#C9892B' : (KINDS[kind] && KINDS[kind].color) || '#2D5BA8');
/** An event's colour: the person it is for, else its kind. */
function colorOfEvent(e) {
  if (e.kind !== 'tablet') return colorOf(e.kind);
  if (e.who && e.who.length === 1) return personColor(e.who[0]);
  return (TAGS[e.tag] || TAGS.plan).color;
}

// Little pictures for birthdays, holidays and named occasions (not for every dentist visit).
const OCCASION = /christmas|xmas|eve|thanksgiving|labor day|birthday|bday|valentine|anniversar|wedding|mother|father|patrick|easter|halloween|independence|memorial|veteran|president|new year/i;
function iconFor(e, size) {
  if (e.kind === 'birthday') return eventIcon(OCCASION.test(e.title) ? e.title : 'birthday', size);
  if (e.kind === 'holiday' || OCCASION.test(e.title)) return eventIcon(e.title, size);
  return '';
}
// The icon on a white disc, so it reads on any event colour.
const iconBadge = (e) => { const i = iconFor(e, 18); return i ? `<span class="kc-badge">${i}</span>` : ''; };

const midnightOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const shiftDay = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const dayDiff = (a, b) => Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / DAY);
// The first day of the week on screen, counted in calendar days (not hours, so a
// daylight-saving weekend can never make the arrows skip or repeat a week).
const weekStart = () => shiftDay(startOfWeek(new Date()), weekOffset * 7);
const monthStart = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth() + monthOffset, 1); };
const monthsFromNow = (d) => { const n = new Date(); return (d.getFullYear() - n.getFullYear()) * 12 + d.getMonth() - n.getMonth(); };
const thisYear = (d) => d.getFullYear() === new Date().getFullYear();

// ---------- The photos, filed by the day they were added ----------

/** { byDay: { 'YYYY-MM-DD': [photo] }, oldest: Date|null }. Each photo: { src, art, caption, name, added }. */
function photosByDay() {
  if (album) return album;
  let list;
  if (isTablet()) {
    list = getPhotos().filter((p) => !p.video).map((p) => ({ src: p.src, art: '', caption: p.caption || '', name: p.name || '', added: +p.added || 0 }));
  } else {
    // A PC preview has no album: the sample pictures, over the last few weeks.
    const noon = midnightOf(new Date()).getTime() + 12 * 3600000;
    const back = [0, 1, 7, 20];
    list = samplePhotos.map((p, i) => ({ src: p.src || '', art: p.art || '', caption: p.title || p.caption || '', name: p.addedBy || '',
      added: +p.added || noon - (back[i % back.length] + Math.floor(i / back.length) * 31) * DAY }));
  }
  const byDay = {};
  let oldest = 0;
  list.forEach((p) => {
    if (!(p.added > 0)) return;
    const k = isoDay(new Date(p.added));
    (byDay[k] = byDay[k] || []).push(p);
    if (!oldest || p.added < oldest) oldest = p.added;
  });
  album = { byDay, oldest: oldest ? new Date(oldest) : null };
  return album;
}
const photosOn = (d) => photosByDay().byDay[isoDay(d)] || [];
/** The one picture a day's box shows: one somebody wrote a few words for, else the newest. */
function bestPhoto(d) {
  const list = photosOn(d);
  return list.filter((p) => p.caption)[0] || list[0] || null;
}
// A picture as a filled box: the real photo comes as a small copy, one at a time (loadThumbs).
function photoBox(p, cls, w, h) {
  if (p.src) return `<div class="${cls}" data-thumb="${esc(p.src)}" data-tw="${w}" data-th="${h}"></div>`;
  return `<div class="${cls}" style="background:${esc(p.art)}"></div>`;
}
function loadThumbs(el) {
  el.querySelectorAll('[data-thumb]').forEach((node) => {
    const src = node.dataset.thumb;
    node.removeAttribute('data-thumb');
    thumbnail(src, { w: +node.dataset.tw || 200, h: +node.dataset.th || 160, wanted: () => node.isConnected }).then((url) => {
      if (!node.isConnected) return;
      if (url) { node.style.backgroundImage = `url(${url})`; node.classList.add('in'); } else if (url === '') {
        // The file would not open: the day goes back to a plain box.
        const cell = node.closest('.has-ph');
        if (cell) cell.classList.remove('has-ph');
      }
    });
  });
}
// How far back the month arrows go: last month, or as far as the oldest photo (two years at most).
function minMonth() {
  const o = photosByDay().oldest;
  return Math.max(-24, Math.min(-1, o ? monthsFromNow(o) : -1));
}

/** A photo from this date a year, a month or a week ago, if the album has one: { photo, date, label } or null. */
function memory() {
  const t = midnightOf(new Date());
  const tries = [];
  for (let y = 1; y <= 10; y++) tries.push([new Date(t.getFullYear() - y, t.getMonth(), t.getDate()), `On this day, ${t.getFullYear() - y}`, true]);
  for (let m = 1; m <= 11; m++) tries.push([new Date(t.getFullYear(), t.getMonth() - m, t.getDate()), m === 1 ? 'A month ago today' : `${m} months ago today`, true]);
  for (let w = 1; w <= 3; w++) tries.push([shiftDay(t, -7 * w), w === 1 ? 'A week ago today' : `${w} weeks ago today`, false]);
  for (let i = 0; i < tries.length; i++) {
    const d = tries[i][0];
    if (tries[i][2] && d.getDate() !== t.getDate()) continue; // no Feb 30: that month has no such day
    const photo = bestPhoto(d);
    if (photo) return { photo, date: d, label: tries[i][1] };
  }
  return null;
}

// ---------- Words ----------

// "Updated 10:32 AM" / "Wed at 9:15 PM" with the owner's 12- or 24-hour clock.
function whenSaved(at) {
  const day = at.toDateString() === new Date().toDateString() ? '' : `${at.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} at `;
  return `${day}${timeText(at)}`;
}

// The linked calendars: a setup hint, a download problem, or when they were last read.
function linkNote() {
  const st = calendarStatus();
  if (!st.calendars) return { text: '', error: false, button: false };
  if (st.lastError) {
    // Say how old the saved copy is, so nobody trusts a week-old calendar by mistake.
    const at = st.savedAt;
    if (!at) return { text: st.lastError, error: true, button: true };
    return { text: `${st.lastError} · showing what was saved ${at.toDateString() === new Date().toDateString() ? 'today at ' : ''}${whenSaved(at)}`, error: true, button: true };
  }
  return { text: st.savedAt ? `Updated ${whenSaved(st.savedAt)}` : '', error: false, button: true };
}

// Hide events that don't fit in a day column (week view) and say "+N more" instead.
function fitDays(el) {
  el.querySelectorAll('.kc-wday').forEach((day) => {
    if (!day.clientHeight) return; // not laid out yet
    const evs = [...day.querySelectorAll('.kc-ev')];
    const old = day.querySelector('.kc-more');
    if (old) old.remove();
    evs.forEach((e) => { e.style.display = ''; });
    if (day.scrollHeight <= day.clientHeight + 1) return;
    const more = document.createElement('div');
    more.className = 'kc-more';
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

const inDays = (n) => (n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`);

// "Today", "Tomorrow", "In 5 days", "Yesterday", "3 days ago" for a day.
function howFar(d) {
  const n = dayDiff(midnightOf(new Date()), d);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  return n > 0 ? `In ${n} days` : `${-n} days ago`;
}

const REPEAT_WORDS = { weekly: 'every week', fortnightly: 'every 2 weeks', monthly: 'every month', yearly: 'every year' };

// The key: one colour per calendar link (named as on the phone page), then the rest.
function legend() {
  const links = linkedCalendars();
  const items = links.map((c) => [colorOf(c.kind), c.name]);
  items.push([TAGS.plan.color, 'Added on this screen']);
  people().slice(0, 6).forEach((p) => items.push([p.color, `For ${p.name}`]));
  items.push([colorOf('family'), 'Dates from Settings'], [colorOf('birthday'), KINDS.birthday.label], [colorOf('holiday'), KINDS.holiday.label]);
  return items.map(([c, label]) => `
    <div class="kc-key"><span class="kc-dot" style="background:${c}"></span><span class="kc-cut">${esc(label)}</span></div>`).join('');
}

// ---------- The month's painting (behind the days that have no photo) ----------

function painting(month) {
  const s = month <= 1 || month === 11 ? 'winter' : month <= 4 ? 'spring' : month <= 7 ? 'summer' : 'autumn';
  const P = {
    winter: { sky: ['#52688C', '#A9B9CF', '#E3E9F1'], hills: ['#C9D5E3', '#9FB1C6', '#6F839C'], a: '#F4F7FB', b: '#3E5068' },
    spring: { sky: ['#6FA3C9', '#CFE3EC', '#F6DDE2'], hills: ['#9CC27A', '#6FA35A', '#47793F'], a: '#F7BCD0', b: '#FFFFFF' },
    summer: { sky: ['#3F8FCB', '#8FCBE6', '#F7E3A6'], hills: ['#7DB85A', '#4F9447', '#2F6B3A'], a: '#F6D24A', b: '#E8F3C0' },
    autumn: { sky: ['#6E86A8', '#D9B48A', '#E8C796'], hills: ['#B7793F', '#9B4F2A', '#6E3B22'], a: '#C9562C', b: '#E3A23A' },
  }[s];
  return `<svg class="kc-paint" viewBox="0 0 984 634" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="kcSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${P.sky[0]}"/><stop offset="0.45" stop-color="${P.sky[1]}"/><stop offset="1" stop-color="${P.sky[2]}"/></linearGradient></defs>
    <rect width="984" height="634" fill="url(#kcSky)"/>
    ${s === 'summer' ? `<circle cx="780" cy="120" r="54" fill="${P.a}"/>` : ''}
    <path d="M0 260 Q180 200 380 250 T760 230 T984 240 V634 H0Z" fill="${P.hills[0]}"/>
    <path d="M0 360 Q240 300 520 370 T984 340 V634 H0Z" fill="${P.hills[1]}"/>
    <path d="M0 470 Q300 420 640 480 T984 460 V634 H0Z" fill="${P.hills[2]}"/>
    <g fill="${P.a}"><circle cx="120" cy="330" r="34"/><circle cx="170" cy="345" r="24"/><circle cx="820" cy="310" r="30"/><circle cx="860" cy="325" r="22"/></g>
    <g fill="${P.b}"><circle cx="420" cy="420" r="30"/><circle cx="460" cy="432" r="20"/><circle cx="640" cy="450" r="26"/></g>
  </svg>`;
}

const STYLE = `
  <style>
    .kc { height:100%; box-sizing:border-box; padding:20px 24px; display:flex; flex-direction:column; gap:14px; background:#15121A; color:#fff; position:relative; overflow:hidden; font-family:Inter,system-ui,sans-serif; }
    .kc .x-btn.gold { background:${GOLD}; color:#15121A; }
    .kc .x-btn.danger { background:transparent; color:#FF9D94; box-shadow:inset 0 0 0 2px #FF9D94; }
    .kc .x-btn.danger.sure { background:#C9382E; color:#fff; box-shadow:none; }
    .kc-seg { display:flex; flex:none; border-radius:999px; padding:4px; background:rgba(255,255,255,.1); }
    .kc-seg button { min-height:56px; padding:0 22px; border:0; border-radius:999px; background:transparent; color:#fff; font:600 18px Inter,sans-serif; cursor:pointer; }
    .kc-seg button.on { background:#fff; color:#15121A; }
    .kc-body { flex:1; min-height:0; display:flex; gap:20px; }
    .kc-main { flex:1; min-width:0; display:flex; flex-direction:column; gap:8px; }
    .kc-dows { display:grid; grid-template-columns:repeat(7,minmax(0,1fr)); gap:6px; flex:none; }
    .kc-dow { font:600 15px Inter,sans-serif; letter-spacing:2px; text-transform:uppercase; color:#A89DB5; padding-left:8px; }
    .kc-dow.now { color:${GOLD}; }
    .kc-frame { flex:1; min-height:0; position:relative; }
    .kc-paint { position:absolute; left:0; top:0; width:100%; height:100%; display:block; border-radius:10px; }
    .kc-gap { position:absolute; background:#15121A; }
    .kc-grid { position:absolute; left:0; top:0; width:100%; height:100%; display:grid; grid-template-columns:repeat(7,minmax(0,1fr)); gap:6px; }
    .kc-cell { position:relative; min-width:0; min-height:0; cursor:pointer; background:rgba(21,18,26,.62); }
    .kc-cell.past { background:rgba(21,18,26,.38); }
    .kc-cell.out { background:#15121A; box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.09); }
    .kc-phw { position:absolute; left:0; top:0; width:100%; height:100%; overflow:hidden; display:none; }
    .has-ph > .kc-phw { display:block; }
    .kc-ph { position:absolute; left:0; top:0; width:100%; height:100%; background-size:cover; background-position:center; }
    .kc-ph[data-tw] { opacity:0; }
    .kc-ph.in { opacity:1; }
    .kc-shade { position:absolute; left:0; top:0; width:100%; height:100%; background:linear-gradient(180deg,rgba(10,8,14,.62) 0%,rgba(10,8,14,0) 34%,rgba(10,8,14,0) 46%,rgba(10,8,14,.78) 100%); }
    .kc-cell.out.has-ph > .kc-phw { opacity:.45; }
    .kc-num { position:absolute; left:9px; top:5px; font:600 21px Outfit,sans-serif; display:flex; align-items:baseline; gap:6px; }
    .has-ph > .kc-num, .has-ph > .kc-dow { text-shadow:0 1px 3px rgba(0,0,0,.6); }
    .kc-cell.out .kc-num { color:#A89DB5; }
    .kc-num small { font:600 15px Inter,sans-serif; letter-spacing:1.5px; text-transform:uppercase; }
    .kc-cell.today { z-index:2; box-shadow:inset 0 0 0 3px ${GOLD}; }
    .kc-cell.today .kc-num { color:${GOLD}; }
    .kc-ring { position:absolute; left:-5px; top:-5px; right:-5px; bottom:-5px; border:4px solid ${GOLD}; border-radius:9px; pointer-events:none; animation:kc-pulse 3s ease-in-out infinite; }
    .kc-chips { position:absolute; left:6px; right:6px; bottom:6px; display:flex; flex-direction:column; gap:3px; }
    .kc-chip { height:23px; line-height:23px; border-radius:6px; padding:0 7px; font:600 15px/23px Inter,sans-serif; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .kc-chip.more { background:rgba(255,255,255,.2); }
    .kc-cut { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .kc-dot { width:12px; height:12px; border-radius:50%; flex:none; display:inline-block; }
    @keyframes kc-pulse { 0%,100% { opacity:.25; } 50% { opacity:.95; } }
    @keyframes kc-up { from { transform:translateY(36px); opacity:0; } to { transform:none; opacity:1; } }

    .kc-side { width:250px; flex:none; display:flex; flex-direction:column; gap:12px; min-height:0; overflow:hidden; }
    .kc-eye { font:600 15px Inter,sans-serif; letter-spacing:2px; text-transform:uppercase; color:${GOLD}; }
    .kc-card { border-radius:16px; background:rgba(255,255,255,.08); padding:12px; cursor:pointer; flex:none; }
    .kc-mem { position:relative; height:150px; border-radius:10px; overflow:hidden; margin-top:8px; background:rgba(255,255,255,.06); }
    .kc-row { display:flex; align-items:center; gap:12px; min-height:58px; padding:0 12px; border-radius:14px; background:rgba(255,255,255,.06); cursor:pointer; flex:none; }
    .kc-warn { font:500 15px/1.35 Inter,sans-serif; color:#FFB4A8; }

    .kc-week { flex:1; min-height:0; position:relative; display:grid; grid-template-columns:repeat(7,minmax(0,1fr)); gap:8px; }
    .kc-wday { border-radius:16px; background:rgba(255,255,255,.07); display:flex; flex-direction:column; gap:8px; min-height:0; overflow:hidden; cursor:pointer; padding-bottom:10px; }
    .kc-wday.past { opacity:.6; }
    .kc-wday.today { box-shadow:inset 0 0 0 3px ${GOLD}; }
    .kc-wday.today .kc-num { color:${GOLD}; }
    .kc-whead { position:relative; flex:none; height:84px; }
    .kc-whead .kc-num { font-size:38px; font-weight:500; top:30px; left:12px; }
    .kc-whead .kc-dow { position:absolute; left:12px; top:10px; padding:0; }
    .has-ph > .kc-dow { color:#fff; }
    .kc-ev { color:#fff; border-radius:10px; padding:8px 7px; margin:0 5px; display:flex; flex-direction:column; gap:2px; flex:none; min-width:0; }
    .kc-ev.over { opacity:.5; }
    .kc-ev-top { display:flex; align-items:center; gap:6px; min-width:0; }
    .kc-badge { flex:none; width:24px; height:24px; border-radius:12px; background:#fff; display:flex; align-items:center; justify-content:center; }
    .kc-ev-time { font-size:15px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .kc-ev-title { font-size:16px; line-height:1.25; overflow-wrap:anywhere; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
    .kc-more { font-size:15px; font-weight:600; opacity:.75; flex:none; margin:0 12px; }
    .kc-quiet { position:absolute; left:50%; bottom:24px; transform:translateX(-50%); width:640px; background:#2A2334; border-radius:24px; padding:16px 16px 16px 26px;
      display:flex; align-items:center; gap:16px; box-shadow:0 12px 36px rgba(0,0,0,.4); }

    .kc-over { display:none; position:absolute; left:0; top:0; width:100%; height:100%; z-index:5; background:rgba(8,6,12,.72); align-items:center; justify-content:center; }
    .kc-sheet { background:#221C2B; border-radius:28px; box-sizing:border-box; display:flex; flex-direction:column; box-shadow:0 20px 60px rgba(0,0,0,.5); }
    .kc-sheet.kc-in { animation:kc-up .28s ease-out both; }
    .kc-key { display:flex; align-items:center; gap:9px; font:500 18px Inter,sans-serif; max-width:260px; min-height:28px; }
    .kc-h { font:500 36px/1.1 Outfit,sans-serif; }
    .kc-soft { color:#CFC6D8; }
    .kc-item { display:flex; gap:14px; align-items:flex-start; padding:14px 12px; border-radius:16px; background:rgba(255,255,255,.06); min-height:64px; box-sizing:border-box; }
    .kc-item.mine { cursor:pointer; }
    .kc-bar { width:6px; align-self:stretch; border-radius:3px; flex:none; }
    .kc-tile { position:relative; width:168px; height:126px; border-radius:12px; overflow:hidden; background:rgba(255,255,255,.06); flex:none; }

    .kf-label { font:600 15px Inter,sans-serif; letter-spacing:1.5px; text-transform:uppercase; color:#A89DB5; width:92px; flex:none; }
    .kf-line { display:flex; align-items:center; gap:10px; min-width:0; min-height:56px; }
    .kf-row { display:flex; align-items:center; gap:8px; flex-wrap:wrap; height:56px; overflow:hidden; min-width:0; flex:1; }
    .kf-row.tight { gap:6px; }
    .kf-chip { min-height:56px; padding:0 17px; border-radius:28px; border:0; background:rgba(255,255,255,.1); color:#fff; font:600 18px Inter,sans-serif; cursor:pointer; flex:none; white-space:nowrap; display:inline-flex; align-items:center; gap:8px; max-width:190px; }
    .kf-chip.on { background:${GOLD}; color:#15121A; }
    .kf-step { width:60px; height:56px; border-radius:28px; border:0; background:rgba(255,255,255,.1); color:#fff; font:600 19px Inter,sans-serif; cursor:pointer; flex:none; }
    .kf-val { min-width:128px; text-align:center; font:500 26px Outfit,sans-serif; flex:none; }
    .kf-in { flex:1; min-width:0; height:64px; box-sizing:border-box; border:2px solid rgba(255,255,255,.24); border-radius:18px; padding:0 20px; background:rgba(255,255,255,.07); font:500 24px Inter,sans-serif; color:#fff; outline:none; user-select:text; -webkit-user-select:text; }
    .kf-in::placeholder { color:#A89DB5; }
    .kf-in:focus { border-color:${GOLD}; }
    .kf-cal { display:grid; grid-template-columns:repeat(7,56px); grid-auto-rows:56px; }
    .kf-d { position:relative; border:0; background:transparent; color:#fff; font:500 21px Outfit,sans-serif; cursor:pointer; border-radius:28px; padding:0; }
    .kf-d.out { color:#7F7590; }
    .kf-d[disabled] { color:#5A5166; cursor:default; }
    .kf-d.now { box-shadow:inset 0 0 0 2px ${GOLD}; color:${GOLD}; }
    .kf-d.on { background:${GOLD}; color:#15121A; font-weight:700; }
    .kf-d i { position:absolute; left:50%; bottom:7px; width:6px; height:6px; margin-left:-3px; border-radius:3px; background:#D05C8E; }
    .kf-d.on i { background:#15121A; }
    .kc [data-step][disabled] { opacity:.3; }
    .kc-undo { position:absolute; left:50%; bottom:28px; transform:translateX(-50%); z-index:6; background:#fff; color:#15121A; border-radius:32px;
      padding:6px 6px 6px 26px; display:flex; align-items:center; gap:16px; font:500 19px Inter,sans-serif; box-shadow:0 12px 36px rgba(0,0,0,.45); max-width:900px; }
    .kc-undo span { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    @media (prefers-reduced-motion: reduce) { .kc-ring, .kc-sheet.kc-in { animation:none; } .kc-ring { opacity:.6; } }
  </style>`;

// ---------- The month ----------

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
    const photo = bestPhoto(d.date);
    cells.push(`
      <div class="kc-cell${d.isToday ? ' today' : ''}${out ? ' out' : ''}${!d.isToday && d.date < today ? ' past' : ''}${photo ? ' has-ph' : ''}" data-day="${isoDay(d.date)}">
        ${photo ? `<div class="kc-phw">${photoBox(photo, 'kc-ph', 200, 160)}<div class="kc-shade"></div></div>` : ''}
        ${d.isToday ? '<div class="kc-ring"></div>' : ''}
        <div class="kc-num">${d.num}${d.isToday ? '<small>Today</small>' : d.num === 1 && out ? `<small>${d.date.toLocaleDateString('en-US', { month: 'short' })}</small>` : ''}</div>
        <div class="kc-chips">
          ${shown.map((e) => `<div class="kc-chip" style="background:${colorOfEvent(e)}">${esc(e.title)}</div>`).join('')}
          ${more > 0 ? `<div class="kc-chip more">+${more} more</div>` : ''}
        </div>
      </div>`);
  }
  // Dark lines between the days, so the painting behind shows through as a mosaic.
  let gaps = '';
  for (let i = 1; i < 7; i++) gaps += `<div class="kc-gap" style="top:0;height:100%;width:6px;left:calc(${i} * (100% + 6px) / 7 - 6px)"></div>`;
  for (let i = 1; i < rows; i++) gaps += `<div class="kc-gap" style="left:0;width:100%;height:6px;top:calc(${i} * (100% + 6px) / ${rows} - 6px)"></div>`;
  const todayDow = monthOffset === 0 ? dayDiff(startOfWeek(today), today) : -1;
  return `
    <div class="kc-dows">${weekdayNames().map((x, i) => `<div class="kc-dow${i === todayDow ? ' now' : ''}">${x}</div>`).join('')}</div>
    <div class="kc-frame">
      ${painting(first.getMonth())}${gaps}
      <div class="kc-grid" style="grid-template-rows:repeat(${rows},minmax(0,1fr))">${cells.join('')}</div>
    </div>`;
}

// ---------- The week ----------

function weekGrid(days, today) {
  const quiet = days.every((d) => !d.events.length);
  // An empty week says what comes next, with a way to go there.
  const next = quiet ? nextAfter(days[6].date) : null;
  return `
    <div class="kc-week">
      ${days.map((d, i) => {
        const photo = bestPhoto(d.date);
        return `
        <div class="kc-wday${d.isToday ? ' today' : ''}${!d.isToday && d.date < today ? ' past' : ''}" data-day="${isoDay(d.date)}">
          <div class="kc-whead${photo ? ' has-ph' : ''}">
            ${photo ? `<div class="kc-phw">${photoBox(photo, 'kc-ph', 200, 130)}<div class="kc-shade"></div></div>` : ''}
            <div class="kc-dow${d.isToday ? ' now' : ''}">${d.dow}</div>
            <div class="kc-num">${d.num}${d.isToday ? '<small>Today</small>' : d.num === 1 || i === 0 ? `<small>${d.date.toLocaleDateString('en-US', { month: 'short' })}</small>` : ''}</div>
          </div>
          ${d.events.map((e) => `
            <div class="kc-ev${d.isToday && e.over ? ' over' : ''}" style="background:${colorOfEvent(e)}">
              <div class="kc-ev-top">${iconBadge(e)}<div class="kc-ev-time">${esc(e.ofDays ? `${e.time} · ${e.dayOf}/${e.ofDays}` : e.time)}</div></div>
              <div class="kc-ev-title">${esc(e.title)}</div>
            </div>`).join('')}
        </div>`;
      }).join('')}
      ${quiet ? `
        <div class="kc-quiet">
          <div style="display:flex;flex-direction:column;gap:4px;min-width:0;flex:1">
            <div class="kc-h" style="font-size:28px">A quiet week</div>
            ${next ? `<div class="kc-soft kc-cut" style="font-size:18px">Next: ${esc(next.name)}${next.turns ? ` · turns ${next.turns}` : ''} · ${next.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}${next.days > 0 ? `, in ${next.days} days` : ''}</div>` : ''}
          </div>
          ${next && dayDiff(startOfWeek(new Date()), next.date) <= MAX_AHEAD * 7 + 6 ? `<button data-jump="${isoDay(next.date)}" class="x-btn sm gold">Show me</button>` : ''}
        </div>` : ''}
    </div>`;
}

// ---------- Beside the month: a memory and the next big thing ----------
// (What is coming up is already on the month and the week, so it is not listed again here.)

function sidePanel() {
  const mem = memory();
  const big = nextBigThing();
  const note = linkNote();
  return `
    <div class="kc-side">
      ${mem ? `
      <div class="kc-card" data-jump="${isoDay(mem.date)}" data-any>
        <div class="kc-eye kc-cut">${esc(mem.label)}</div>
        <div class="kc-mem">${photoBox(mem.photo, 'kc-ph', 340, 200)}</div>
        ${mem.photo.caption || mem.photo.name ? `<div class="kc-cut x-serif" style="font-size:18px;margin-top:8px">${esc(mem.photo.caption || `From ${mem.photo.name}`)}</div>` : ''}
      </div>` : ''}
      ${big ? `
      <div class="kc-card" data-jump="${isoDay(big.date)}" style="display:flex;align-items:center;gap:12px">
        <span class="kc-badge" style="width:44px;height:44px;border-radius:22px">${eventIcon(big.name, 26)}</span>
        <div style="min-width:0">
          <div class="kc-cut" style="font:600 18px Inter,sans-serif">${esc(big.name)}${big.turns ? ` · ${big.turns}` : ''}</div>
          <div class="kc-cut" style="font:500 22px Outfit,sans-serif;color:${GOLD}">${esc(big.label)} · ${inDays(big.days)}</div>
        </div>
      </div>` : ''}
      <div style="flex:1;min-height:0"></div>
      ${note.error ? `<div class="kc-warn" style="flex:none;max-height:62px;overflow:hidden">${esc(note.text)}</div>` : ''}
      <button data-cals class="x-btn sm frost" style="flex:none;width:100%">${calendarStatus().calendars ? 'Calendars' : 'Link a calendar'}</button>
    </div>`;
}

function render(el) {
  const today = midnightOf(new Date());
  const month = view === 'month';
  const days = month ? null : getWeek(weekStart());
  const first = monthStart();
  const title = month ? first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : `${weekTitle(days)} · ${weekRange(days)}`;
  const atStart = month ? monthOffset <= minMonth() : weekOffset <= MIN_WEEK;
  const atEnd = month ? monthOffset >= MAX_MONTH : weekOffset >= MAX_AHEAD;
  const away = month ? monthOffset !== 0 : weekOffset !== 0;
  const right = `
    <button data-step="-1" class="x-btn glass round"${atStart ? ' disabled' : ''} aria-label="${month ? 'Earlier month' : 'Earlier week'}">‹</button>
    <button data-step="1" class="x-btn glass round"${atEnd ? ' disabled' : ''} aria-label="${month ? 'Later month' : 'Later week'}">›</button>
    ${away ? '<button data-step="0" class="x-btn white">Today</button>' : ''}
    <div class="kc-seg"><button data-view="month" class="${month ? 'on' : ''}">Month</button><button data-view="week" class="${month ? '' : 'on'}">Week</button></div>
    <button data-add class="x-btn gold">+ Add</button>`;

  el.innerHTML = `${STYLE}
  <div class="kc">
    ${seasonLayer(season(), { quiet: true })}
    ${topBar({ title, tone: 'dark', right })}
    <div class="kc-body">
      <div class="kc-main">${month ? monthGrid(today) : weekGrid(days, today)}</div>
      ${sidePanel()}
    </div>
    <div data-detail class="kc-over"></div>
    ${undo ? `<div class="kc-undo" data-undo-bar><span>${esc(undo.text)}</span><button data-undo class="x-btn sm ink">Undo</button></div>` : ''}
  </div>`;
}

function draw(el) {
  stale = false;
  sheet = '';
  render(el);
  loadThumbs(el);
  if (view !== 'week') return;
  fitDays(el);
  // Again after layout settles (older WebViews add flex-gap margins a frame later).
  requestAnimationFrame(() => setTimeout(() => { if (el.isConnected) fitDays(el); }, 50));
}

// The days things can be added to: from this week's first day to the last week the arrows reach.
function canAddOn(d) {
  const n = dayDiff(startOfWeek(new Date()), d);
  return n >= 0 && n <= MAX_AHEAD * 7 + 6;
}

function openSheet(el, kind, html) {
  const box = el.querySelector('[data-detail]');
  box.innerHTML = html;
  box.style.display = 'flex';
  // It slides up when it opens, not again every time a choice inside it is tapped.
  if (sheet !== kind && box.firstElementChild) box.firstElementChild.classList.add('kc-in');
  sheet = kind;
  loadThumbs(box);
  return box;
}
function closeSheet(el) {
  sheet = '';
  if (stopCodes) { stopCodes(); stopCodes = null; }
  const box = el.querySelector('[data-detail]');
  if (box) { box.style.display = 'none'; box.innerHTML = ''; }
  if (stale) draw(el);
}

// Tap a day: everything on it, with full titles, times and places; its photos; and Add.
function showDay(el, d) {
  const title = d.date.toLocaleDateString('en-US', thisYear(d.date) ? { weekday: 'long', month: 'long', day: 'numeric' } : { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const pics = photosOn(d.date);
  const shown = pics.slice(0, 6);
  const past = d.date <= midnightOf(new Date());
  const side = pics.length > 0;
  openSheet(el, 'day', `
    <div class="kc-sheet" data-day-box="${isoDay(d.date)}" style="width:${side ? 1060 : 760}px;max-height:700px;padding:26px 30px;gap:18px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex:none">
        <div style="min-width:0">
          <div class="kc-eye">${howFar(d.date)}</div>
          <div class="kc-h kc-cut" style="margin-top:4px">${esc(title)}</div>
        </div>
        <div style="display:flex;gap:12px;flex:none">
          ${canAddOn(d.date) ? `<button data-add="${isoDay(d.date)}" class="x-btn gold">+ Add</button>` : ''}
          <button data-close class="x-btn frost">Close</button>
        </div>
      </div>
      <div style="display:flex;gap:24px;min-height:0;flex:1">
        <div class="x-scroll" style="flex:1;min-width:0;display:flex;flex-direction:column;gap:10px">
          ${d.events.length ? d.events.map((e) => `
            <div${e.id ? ` data-edit="${esc(e.id)}"` : ''} class="kc-item${e.id ? ' mine' : ''}"${d.isToday && e.over ? ' style="opacity:.55"' : ''}>
              <span class="kc-bar" style="background:${colorOfEvent(e)}"></span>
              <div style="width:128px;flex:none;font:600 18px Inter,sans-serif">${esc(e.time)}${e.endTime ? `<div class="kc-soft" style="font-weight:500;font-size:15px">to ${esc(e.endTime)}</div>` : ''}${e.ofDays ? `<div class="kc-soft" style="font-weight:500;font-size:15px">day ${e.dayOf} of ${e.ofDays}</div>` : ''}</div>
              <div style="min-width:0;flex:1"><div style="font:500 21px/1.25 Inter,sans-serif;overflow-wrap:anywhere;display:flex;align-items:center;gap:8px">${iconFor(e, 24)}<span style="min-width:0">${esc(e.title)}</span></div>
                ${e.location ? `<div class="kc-soft" style="font-size:16px;margin-top:3px;overflow-wrap:anywhere">${esc(e.location)}</div>` : ''}
                ${e.calendar ? `<div class="kc-soft" style="font-size:16px;margin-top:3px">From ${esc(e.calendar)}</div>` : ''}
                ${e.id && (e.who && e.who.length || (e.tag && e.tag !== 'plan' && TAGS[e.tag]) || REPEAT_WORDS[e.repeat]) ? `<div class="kc-soft" style="font-size:16px;margin-top:3px">${esc([e.who && e.who.length ? `For ${e.who.join(' and ')}` : '', e.tag && e.tag !== 'plan' && TAGS[e.tag] ? TAGS[e.tag].label : '', REPEAT_WORDS[e.repeat] || ''].filter(Boolean).join(' · '))}</div>` : ''}</div>
            </div>`).join('') : `
            <div style="display:flex;flex-direction:column;justify-content:center;gap:8px;padding:26px 12px">
              <div class="x-serif" style="font-size:28px">${past && !d.isToday ? 'Nothing was planned.' : 'Nothing planned yet.'}</div>
            </div>`}
        </div>
        ${side ? `
        <div style="width:348px;flex:none;display:flex;flex-direction:column;gap:12px;min-height:0">
          <div class="kc-eye" style="color:#A89DB5">${pics.length} photo${pics.length === 1 ? '' : 's'}</div>
          <div style="display:flex;flex-wrap:wrap;gap:12px;overflow:hidden">
            ${shown.map((p) => `<div class="kc-tile">${photoBox(p, 'kc-ph', 252, 190)}</div>`).join('')}
          </div>
          <div style="flex:1"></div>
          ${pics.length > shown.length ? '<a href="#/photos" class="x-btn sm frost" style="flex:none">Open the gallery</a>' : ''}
        </div>` : ''}
      </div>
    </div>`);
}

// Open the day sheet for date `d` (any day: from the week, the month or a saved change).
function showDayOn(el, d) {
  showDay(el, getDay(d));
}

// The key, the linked calendars and how they are doing, and the code to link one from a phone.
function showCals(el) {
  const note = linkNote();
  const links = linkedCalendars();
  openSheet(el, 'cals', `
    <div class="kc-sheet" style="width:980px;max-height:700px;padding:26px 30px;gap:18px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex:none">
        <div class="kc-h">Calendars</div>
        <button data-close class="x-btn frost">Close</button>
      </div>
      <div style="display:flex;gap:28px;min-height:0">
        <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:14px">
          <div class="kc-eye" style="color:#A89DB5">${links.length ? `${links.length} linked` : 'Colours'}</div>
          <div style="display:flex;flex-wrap:wrap;gap:10px 22px">${legend()}</div>
          ${note.text ? `<div class="${note.error ? 'kc-warn' : 'kc-soft'}" style="font:${note.error ? 500 : 400} 18px/1.4 Inter,sans-serif;margin-top:6px">${esc(note.text)}</div>` : ''}
          ${note.button ? `<div><button data-check class="x-btn sm white"${checking ? ' disabled' : ''}>${checking ? 'Checking…' : note.error ? 'Try again' : 'Check now'}</button></div>` : ''}
        </div>
        <div style="width:330px;flex:none">${phoneCode({ tab: 'settings', title: 'Link a calendar', sub: 'Google, iPhone or birthdays.', column: true, size: 170 })}</div>
      </div>
    </div>`);
  if (stopCodes) stopCodes();
  stopCodes = wirePhoneCodes(el);
}

// ---------- Adding / changing an event typed on this screen ----------

const fmtMin = (m) => minutesText(m);
const LENGTHS = [[30, '30 min'], [60, '1 hr'], [90, '1½ hr'], [120, '2 hr'], [180, '3 hr']];
const REPEATS = [['none', 'Just once'], ['weekly', 'Weekly'], ['fortnightly', 'Every 2 weeks'], ['monthly', 'Monthly'], ['yearly', 'Yearly']];
// One-tap titles, so most things need no typing at all. A suggestion also sets what usually
// goes with it (a birthday is all day, every year), which can still be changed.
const SUGGEST = [
  { t: 'Dinner out', tag: 'out', at: 19 * 60, len: 120 },
  { t: 'Date night', tag: 'out', at: 19 * 60, len: 180 },
  { t: 'Dentist', tag: 'appointment', len: 60 },
  { t: 'Trip', tag: 'trip', allDay: true },
  { t: 'Birthday', tag: 'birthday', allDay: true, repeat: 'yearly' },
  { t: 'Friends over', tag: 'plan', at: 18 * 60, len: 180 },
  { t: 'Doctor', tag: 'appointment', len: 60 },
  { t: 'Haircut', tag: 'appointment', len: 60 },
];

function titleChips(current) {
  const seen = {};
  const list = [];
  recentTitles(2).concat(SUGGEST.map((s) => s.t)).forEach((t) => {
    const k = t.toLowerCase();
    if (!seen[k] && list.length < 8) { seen[k] = true; list.push(t); }
  });
  return list.map((t) => `<button data-f="title" data-title-chip="${esc(t)}" class="kf-chip${current.trim().toLowerCase() === t.toLowerCase() ? ' on' : ''}"><span class="kc-cut">${esc(t)}</span></button>`).join('');
}

/** Open the sheet: a new event on `date`, or the saved event `id` (as it falls on day `on`). `back` = the day to return to on Cancel. */
function showForm(el, { date, id, back, on }) {
  const saved = id ? getMyEvent(id) : null;
  if (id && !saved) return;
  const now = new Date();
  const day = midnightOf(saved ? fromIso(saved.date) : date || now);
  // New timed events start at the next whole hour today, 9 AM on other days.
  const start = day.getTime() === midnightOf(now).getTime() ? Math.min(23, now.getHours() + 1) * 60 : 9 * 60;
  let mins = start;
  if (saved) { const t = saved.time.split(':').map(Number); mins = t[0] * 60 + t[1]; }
  const cal = new Date(day.getFullYear(), day.getMonth(), 1);
  form = saved
    ? { id: saved.id, title: saved.title, date: day, cal, allDay: saved.allDay, mins, minutes: saved.minutes, repeat: saved.repeat || 'none',
      who: Array.isArray(saved.who) ? saved.who.slice() : [], tag: TAGS[saved.tag] ? saved.tag : 'plan', back, on: on || back || day, confirm: false, error: '' }
    : { id: '', title: '', date: day, cal, allDay: false, mins, minutes: 60, repeat: 'none', who: [], tag: 'plan', back, confirm: false, error: '' };
  drawForm(el);
}

// The month the day is picked from: tap a day. Days that already have something show a dot.
function pickMonth(f) {
  const first = f.cal;
  const gridStart = startOfWeek(first);
  const todayIso = isoDay(new Date());
  const chosen = isoDay(f.date);
  let cells = '';
  for (let i = 0; i < 42; i++) {
    const d = shiftDay(gridStart, i);
    const iso = isoDay(d);
    const out = d.getMonth() !== first.getMonth();
    const busy = !out && getDay(d).events.length > 0;
    cells += `<button data-f="pick:${iso}" class="kf-d${out ? ' out' : ''}${iso === todayIso ? ' now' : ''}${iso === chosen ? ' on' : ''}"${canAddOn(d) ? '' : ' disabled'}>${d.getDate()}${busy ? '<i></i>' : ''}</button>`;
  }
  const prevOk = canAddOn(new Date(first.getFullYear(), first.getMonth(), 0));
  const nextOk = canAddOn(new Date(first.getFullYear(), first.getMonth() + 1, 1));
  return `
    <div style="width:392px;flex:none;display:flex;flex-direction:column;gap:6px">
      <div style="display:flex;align-items:center;gap:8px">
        <button data-f="cal-1" class="kf-step" aria-label="Earlier month"${prevOk ? '' : ' disabled style="opacity:.3"'}>‹</button>
        <div style="flex:1;text-align:center;font:500 24px Outfit,sans-serif">${first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</div>
        <button data-f="cal+1" class="kf-step" aria-label="Later month"${nextOk ? '' : ' disabled style="opacity:.3"'}>›</button>
      </div>
      <div class="kf-cal" style="grid-auto-rows:24px">${weekdayNames().map((x) => `<div style="text-align:center;font:600 15px Inter,sans-serif;color:#A89DB5">${x.slice(0, 2)}</div>`).join('')}</div>
      <div class="kf-cal">${cells}</div>
    </div>`;
}

function drawForm(el) {
  const f = form;
  const was = f.id ? getMyEvent(f.id) || {} : {};
  const repeating = was.repeat && was.repeat !== 'none';
  const onLabel = f.on ? f.on.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '';
  const diff = dayDiff(midnightOf(new Date()), f.date);
  const dayWords = f.date.toLocaleDateString('en-US', thisYear(f.date) ? { weekday: 'long', month: 'long', day: 'numeric' } : { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const names = people();
  // Somebody an older event was for, who is no longer in Settings, still shows (and can be taken off).
  f.who.forEach((n) => { if (!names.some((p) => p.name === n)) names.push({ name: n, color: personColor(n) }); });
  // Two names or seven: they all fit on the one line.
  const shown = names.slice(0, 7);
  const nameW = Math.min(150, Math.floor((640 - 62 - 8 * shown.length) / Math.max(1, shown.length)));
  const box = openSheet(el, 'form', `
    <div data-form class="kc-sheet" style="width:1232px;padding:22px 28px;gap:14px">
      <div style="display:flex;align-items:center;gap:16px;flex:none">
        <div style="min-width:0;flex:1">
          <div class="kc-h kc-cut">${esc(dayWords)}${diff === 0 ? ' <span class="x-serif kc-soft" style="font-size:26px">today</span>' : diff === 1 ? ' <span class="x-serif kc-soft" style="font-size:26px">tomorrow</span>' : ''}</div>
        </div>
        <button data-f="cancel" class="x-btn frost">Cancel</button>
      </div>
      <div style="display:flex;gap:32px;min-height:0">
        ${pickMonth(f)}
        <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:8px">
          <div class="kf-line">
            <span class="kf-label">What</span>
            <input data-title class="kf-in" maxlength="80" placeholder="What’s on?" value="${esc(f.title)}" autocomplete="off">
          </div>
          <div class="kf-line"><span class="kf-label"></span><div class="kf-row">${titleChips(f.title)}</div></div>
          <div class="kf-line">
            <span class="kf-label">When</span>
            <div class="kf-row">
              <button data-f="allday" class="kf-chip${f.allDay ? ' on' : ''}">All day</button>
              <button data-f="timed" class="kf-chip${f.allDay ? '' : ' on'}">At a time</button>
              ${f.allDay ? '' : `
              <span style="flex:1"></span>
              <button data-f="t-60" class="kf-step" aria-label="1 hour earlier">−1h</button>
              <button data-f="t-15" class="kf-step" aria-label="15 minutes earlier">−</button>
              <div class="kf-val">${fmtMin(f.mins)}</div>
              <button data-f="t+15" class="kf-step" aria-label="15 minutes later">+</button>
              <button data-f="t+60" class="kf-step" aria-label="1 hour later">+1h</button>`}
            </div>
          </div>
          ${f.allDay ? '' : `
          <div class="kf-line"><span class="kf-label">How long</span><div class="kf-row">${LENGTHS.map(([m, t]) => `<button data-f="len:${m}" class="kf-chip${f.minutes === m ? ' on' : ''}">${t}</button>`).join('')}</div></div>`}
          <div class="kf-line">
            <span class="kf-label">Repeats</span>
            <div class="kf-row">${REPEATS.map(([k, t]) => `<button data-f="rep:${k}" class="kf-chip${f.repeat === k ? ' on' : ''}">${t}</button>`).join('')}</div>
          </div>
          ${names.length ? `
          <div class="kf-line">
            <span class="kf-label">Who</span>
            <div class="kf-row"><button data-f="who:" class="kf-chip${f.who.length ? '' : ' on'}"${shown.length > 3 ? ' style="padding:0 14px"' : ''}>${shown.length > 3 ? 'All' : 'Everyone'}</button>${shown.map((p) => `<button data-f="who:${esc(p.name)}" class="kf-chip${f.who.indexOf(p.name) >= 0 ? ' on' : ''}" style="max-width:${nameW}px${shown.length > 3 ? ';padding:0 12px' : ''}"><span class="kc-dot" style="background:${p.color}"></span><span class="kc-cut">${esc(p.name)}</span></button>`).join('')}</div>
          </div>` : ''}
          <div class="kf-line">
            <span class="kf-label">Kind</span>
            <div class="kf-row tight">${Object.keys(TAGS).map((k) => `<button data-f="tag:${k}" class="kf-chip${f.tag === k ? ' on' : ''}"  style="padding:0 11px;font-size:17px;gap:6px"><span class="kc-dot" style="background:${TAGS[k].color}"></span>${TAGS[k].short || TAGS[k].label}</button>`).join('')}</div>
          </div>
          <div style="display:flex;align-items:center;gap:12px;margin-top:auto;padding-top:6px;min-height:64px">
            ${f.confirm && repeating ? `
              <span style="font:600 18px Inter,sans-serif;flex:none">Remove which?</span>
              <button data-f="del:one" class="x-btn sm danger">Just ${esc(onLabel)}</button>
              <button data-f="del:later" class="x-btn sm danger">This and later</button>
              <button data-f="del:all" class="x-btn sm danger sure">Every one</button>
              <button data-f="keep" class="x-btn sm frost" style="margin-left:auto">Keep it</button>` : `
              <button data-f="save" class="x-btn lg gold">${f.id ? 'Save changes' : 'Save'}</button>
              <div data-ferr class="kc-warn kc-cut" style="font-size:18px;font-weight:600;flex:1">${esc(f.error)}</div>
              ${f.id ? `<button data-f="delete" class="x-btn danger${f.confirm ? ' sure' : ''}" style="margin-left:auto">${f.confirm ? 'Tap again to remove' : 'Remove'}</button>` : ''}`}
          </div>
        </div>
      </div>
    </div>`);
  const input = box.querySelector('[data-title]');
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); input.blur(); formAction(el, 'save'); } });
  // Typing a title that matches a choice lights it up (and un-lights the others).
  input.addEventListener('input', () => {
    box.querySelectorAll('[data-title-chip]').forEach((c) => { c.classList.toggle('on', c.dataset.titleChip.toLowerCase() === input.value.trim().toLowerCase()); });
  });
  // The keyboard isn't opened by itself: it would cover the choices. Tapping the box opens it.
}

function closeForm(el) {
  const back = form && form.back;
  form = null;
  closeSheet(el);
  return back;
}

// The days an event can be put on: from the first day of this week to the last week the arrows reach.
function clampDay(d) {
  const first = startOfWeek(new Date());
  const last = shiftDay(first, MAX_AHEAD * 7 + 6);
  return d < first ? first : d > last ? last : d;
}

// Show the week and month holding `d`, within what the arrows allow.
function goToWeekOf(d) {
  const weeks = Math.floor(dayDiff(startOfWeek(new Date()), midnightOf(d)) / 7);
  weekOffset = Math.max(MIN_WEEK, Math.min(MAX_AHEAD, weeks));
  monthOffset = Math.max(minMonth(), Math.min(MAX_MONTH, monthsFromNow(d)));
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
        time: `${String(Math.floor(f.mins / 60)).padStart(2, '0')}:${String(f.mins % 60).padStart(2, '0')}`, minutes: f.minutes, repeat: f.repeat,
        who: f.who, tag: f.tag });
    } catch (err) { f.error = err.message || 'Couldn’t save'; drawForm(el); return; }
    const d = f.date;
    form = null;
    goToWeekOf(d);
    draw(el);
    showDayOn(el, d);
    return;
  }
  if (act === 'delete' || act.indexOf('del:') === 0) {
    const was = getMyEvent(f.id);
    if (!was) { form = null; draw(el); return; }
    const repeating = was.repeat && was.repeat !== 'none';
    if (act === 'delete' && !f.confirm) { f.confirm = true; drawForm(el); return; }
    const on = f.on || f.date;
    let text = `Removed “${was.title}”`;
    if (act === 'del:one') { skipMyEventOn(f.id, on); text = `Removed “${was.title}” on ${on.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`; }
    else if (act === 'del:later') { endMyEventBefore(f.id, on); text = `“${was.title}” stops before ${on.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`; }
    else if (act === 'del:all' || !repeating) removeMyEvent(f.id);
    else return;
    const back = f.back || on;
    form = null;
    offerUndo(el, text, () => restoreMyEvent(was));
    draw(el);
    showDayOn(el, back);
    return;
  }
  if (act === 'keep') { drawForm(el); return; }
  if (act === 'title') {
    f.title = btn ? btn.dataset.titleChip : f.title;
    // A new event takes what usually goes with the suggestion.
    const s = f.id ? null : SUGGEST.filter((x) => x.t === f.title)[0];
    if (s) {
      f.tag = s.tag;
      f.allDay = !!s.allDay;
      if (s.at != null) f.mins = s.at;
      if (s.len) f.minutes = s.len;
      f.repeat = s.repeat || 'none';
    }
    drawForm(el);
    return;
  }
  const setDay = (d) => { f.date = clampDay(d); f.cal = new Date(f.date.getFullYear(), f.date.getMonth(), 1); };
  if (act.indexOf('pick:') === 0) { const d = fromIso(act.slice(5)); if (canAddOn(d)) setDay(d); }
  else if (act.indexOf('cal') === 0) {
    const to = new Date(f.cal.getFullYear(), f.cal.getMonth() + +act.slice(3), 1);
    if (canAddOn(to) || canAddOn(new Date(to.getFullYear(), to.getMonth() + 1, 0))) f.cal = to;
  }
  else if (act === 'allday') f.allDay = true;
  else if (act === 'timed') f.allDay = false;
  else if (act.indexOf('len:') === 0) f.minutes = +act.slice(4);
  else if (act.indexOf('rep:') === 0) f.repeat = act.slice(4);
  else if (act.indexOf('tag:') === 0) f.tag = TAGS[act.slice(4)] ? act.slice(4) : 'plan';
  else if (act.indexOf('who:') === 0) {
    const n = act.slice(4);
    if (!n) f.who = [];
    else if (f.who.indexOf(n) >= 0) f.who = f.who.filter((x) => x !== n);
    else f.who = f.who.concat([n]);
  }
  else if (act[0] === 't') f.mins = (f.mins + +act.slice(1) + 1440) % 1440;
  drawForm(el);
}

export function mount(el) {
  view = 'month';
  weekOffset = 0;
  monthOffset = 0;
  form = null;
  sheet = '';
  undo = null;
  checking = false;
  album = null;
  draw(el);
  const step = (n) => {
    if (view === 'month') monthOffset = n === 0 ? 0 : Math.max(minMonth(), Math.min(MAX_MONTH, monthOffset + n));
    else weekOffset = n === 0 ? 0 : Math.max(MIN_WEEK, Math.min(MAX_AHEAD, weekOffset + n));
  };
  // Swipe left/right across the month (or week) to change it (like turning a page).
  let touch = null, swipedAt = 0;
  el.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    touch = e.touches.length === 1 ? { x: t.clientX, y: t.clientY } : null;
  }, { passive: true });
  el.addEventListener('touchend', (e) => {
    const t = e.changedTouches[0];
    if (!touch || !t || sheet || form) { touch = null; return; }
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
      const open = sheet === 'day' ? el.querySelector('[data-day-box]') : null;
      const day = open ? fromIso(open.dataset.dayBox) : null;
      draw(el);
      if (day) showDayOn(el, day);
      return;
    }
    if (form) {
      // The sheet only closes with Cancel / Save, so a stray tap can't lose what was typed.
      const fb = e.target.closest('[data-f]');
      if (fb && !fb.disabled) formAction(el, fb.dataset.f, fb);
      return;
    }
    const add = e.target.closest('[data-add]');
    if (add) {
      const back = add.dataset.add ? fromIso(add.dataset.add) : null;
      // From the top bar: today, or the first day of the week / month on screen.
      const first = view === 'month' ? monthStart() : weekStart();
      const shown = (view === 'month' ? monthOffset : weekOffset) !== 0 && first > new Date() ? first : new Date();
      showForm(el, { date: back || clampDay(midnightOf(shown)), back });
      return;
    }
    if (sheet) {
      const ed = e.target.closest('[data-edit]');
      if (ed) {
        const shown = el.querySelector('[data-day-box]');
        const on = shown ? fromIso(shown.dataset.dayBox) : null;
        showForm(el, { id: ed.dataset.edit, back: on, on });
        return;
      }
      const check = e.target.closest('[data-check]');
      if (check && !checking) {
        checking = true;
        showCals(el);
        refreshCalendars(true).then(() => {
          checking = false;
          if (!el.isConnected) return;
          if (sheet === 'cals') { stale = true; showCals(el); } else onUpdate();
        });
        return;
      }
      if (e.target === box || e.target.closest('[data-close]')) closeSheet(el);
      return;
    }
    if (e.target.closest('[data-cals]')) { showCals(el); return; }
    const jump = e.target.closest('[data-jump]');
    if (jump) {
      const d = fromIso(jump.dataset.jump);
      // (A memory from long ago opens its day without leaving the month on screen.)
      if (!jump.hasAttribute('data-any')) { goToWeekOf(d); draw(el); }
      showDayOn(el, d);
      return;
    }
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
  // Don't redraw under an open sheet (a background calendar download would close it):
  // it is drawn again when the sheet closes.
  onUpdate = () => {
    if (!el.isConnected) return;
    if (form || sheet) { stale = true; return; }
    draw(el);
  };
  window.addEventListener('calendar-updated', onUpdate);
  onPhotos = () => { album = null; onUpdate(); };
  window.addEventListener('tablet-photos', onPhotos);
  refreshCalendars(); // no-op unless the saved copy is older than 30 minutes
  // Re-render when the day rolls over so "today" and the month stay current.
  let day = new Date().toDateString();
  timer = setInterval(() => {
    const now = new Date().toDateString();
    if (now !== day) { day = now; album = null; onUpdate(); }
  }, 60000);
}

export function unmount() {
  form = null;
  sheet = '';
  undo = null;
  album = null;
  if (stopCodes) { stopCodes(); stopCodes = null; }
  clearInterval(timer);
  clearTimeout(undoTimer);
  window.removeEventListener('calendar-updated', onUpdate);
  window.removeEventListener('tablet-photos', onPhotos);
}
