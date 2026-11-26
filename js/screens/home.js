// Kitchen · Home. The household's photos fill the screen, one after another, with the
// time over them. Left alone for ten seconds, the photo and the time are all that is
// left; a touch brings back the weather, what's next, dinner, and the way into
// everything else. (It used to be a dashboard of cards with a small photo in one of them,
// and a separate "photo frame" screen. Home is the photo frame now.)
import { clockTime, clockAmPm, timeText, hourText, display } from '../services/display.js';
import { settings } from '../config.js';
import { householdName } from '../services/family.js';
import { getLocation, manualPlace, knownPlace } from '../services/location.js';
import { getWeather, describe } from '../services/weather.js';
import { wxIcon, eventIcon } from '../art.js';
import { isTablet, getPhotos, onPhotosChanged, thumbnail } from '../services/tablet-photos.js';
import { photos as samplePhotos } from '../services/family-sample.js';
import { rotationOf, onRotationChanged } from '../services/rotation.js';
import { upcoming, refreshCalendars, ordinal } from '../services/calendar-data.js';
import { chipShowsOn, onChipChanged } from '../services/timers.js';
import { fmtMinutes, loadIndex } from '../services/recipe-data.js';
import { tonight, getPlan, markFor, plannedFor, dayKey } from '../services/meal-plan.js';
import { loadMessages, onMessagesChanged } from '../services/messages-data.js';
import { getAlerts, untilText, alertColor } from '../services/weather-alerts.js';
import { tutorialRunning } from '../services/tutorial.js';
import { restful, season, seasonLayer } from './ui.js';
import { topHomeLine } from '../services/extras.js';

let timer, photoTimer, refreshTimer, roomTimer, offPhotos, offRotation, onCalendar, offNotes, onWake, onOnline, offChip, rest, undoTimer;

const REFRESH_MS = 15 * 60 * 1000; // weather, what's next and dinner stay fresh all day
const COMING_MS = 5 * 60 * 1000;   // what's next is looked at again this often (redrawn only if it changed)

// What the dinner chip showed last time, so coming back to Home shows it at once
// instead of "Pick a recipe" for a moment. { at: 'day|evening', info }
let lastDinner = null;

// "3 PM" or "3:30 PM" (or "15:00" / "15:30" with the 24-hour clock)
const fmtClock = (d) => (d.getMinutes() ? timeText(d) : hourText(d.getHours()));

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// The last weather this screen downloaded today (for when the Wi-Fi is down), or null.
// Only in the degrees the family chose, and only for the place the weather is for now.
function savedWeather() {
  try {
    const w = JSON.parse(localStorage.getItem('weather.v1') || 'null');
    if (!w || !w.at || new Date(w.at).toDateString() !== new Date().toDateString()) return null;
    if (w.units && w.units !== settings.units) return null;
    const place = manualPlace() || knownPlace();
    if (place && typeof place.lat === 'number' && typeof w.lat === 'number' && Math.abs(place.lat - w.lat) > 0.05) return null;
    w.hours = (w.hours || []).filter((h) => new Date(h.time).getTime() > Date.now());
    return w;
  } catch (e) { return null; }
}

// Is it dark out? Today's sunrise/sunset from the Weather screen's saved forecast
// when there is one, otherwise a rough guess from the clock.
function isNight() {
  const now = Date.now();
  try {
    const f = JSON.parse(localStorage.getItem('forecast.v2') || 'null');
    if (f && f.sunrise && f.sunset && new Date(f.sunset).toDateString() === new Date().toDateString()) {
      return now < new Date(f.sunrise).getTime() || now > new Date(f.sunset).getTime();
    }
  } catch (e) { /* no saved forecast */ }
  const h = new Date().getHours();
  return h < 6 || h >= 18;
}

// Rain, snow or a storm in the next few hours (or the rain stopping), in a few words:
// "Rain around 4 PM", "Snow around 11 PM", "Dry by 6 PM". '' when nothing changes.
const WET = { rain: 'Rain', snow: 'Snow', storm: 'Storms' };
function rainSoon(w) {
  const wet = (code) => WET[describe(code).icon] || '';
  const hours = (w.hours || []).filter((h) => new Date(h.time).getTime() > Date.now());
  if (!wet(w.code)) {
    const h = hours.find((x) => wet(x.code));
    return h ? `${wet(h.code)} around ${hourText(new Date(h.time).getHours())}` : '';
  }
  const dry = hours.find((x) => !wet(x.code));
  return dry ? `Dry by ${hourText(new Date(dry.time).getHours())}` : '';
}

// Tomorrow from the daily forecast weather.js keeps: { icon, high, low, label } or null.
function tomorrowWeather(w) {
  const d = w.daily;
  if (!d || !d.time) return null;
  const now = new Date();
  const key = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  const i = d.time.indexOf(key);
  if (i < 0 || !d.temperature_2m_max || d.temperature_2m_max[i] == null) return null;
  const desc = describe(d.weather_code ? d.weather_code[i] : null);
  return { icon: desc.icon, label: desc.label, high: Math.round(d.temperature_2m_max[i]), low: Math.round(d.temperature_2m_min[i]) };
}

// What the dinner card should say right now:
//   planned  tonight's dinner from the week plan
//   tomorrow in the evening (from 8 PM), tomorrow's planned dinner, so it can be thawed or prepared
//   out / leftovers  the week plan says so for tonight (no recipe idea pushed on top)
//   idea     the daily idea when nothing is planned
const evening = () => new Date().getHours() >= 20;
const dinnerSlot = () => `${new Date().toDateString()}|${evening() ? 'evening' : 'day'}`;
async function dinnerInfo() {
  const now = new Date();
  if (evening()) {
    const ids = plannedFor(dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)), 'dinner');
    if (ids.length) {
      const ix = await loadIndex();
      const e = ids.map((id) => ix.byId[id]).filter(Boolean)[0];
      if (e) return { kind: 'tomorrow', id: e.id, t: e.t, m: e.m };
    }
  }
  const t = await tonight();
  if (t && t.planned) return { kind: 'planned', id: t.entry.id, t: t.entry.t, m: t.entry.m };
  const mark = markFor(getPlan(), dayKey(now), 'dinner');
  if (mark === 'out' || mark === 'leftovers') return { kind: mark };
  return t ? { kind: 'idea', id: t.entry.id, t: t.entry.t, m: t.entry.m } : null;
}

// "Today 3 PM", "Now", "Tomorrow 9 AM", "Saturday", "8 days". `short` gives the weekday as
// "Sat" (and "Tomorrow" without the time), for when a long name needs the room (see fitComing).
function whenText(e, short) {
  const d = e.date instanceof Date ? e.date : new Date(e.date);
  const timed = d.getHours() || d.getMinutes();
  if (e.days === 0) {
    if (timed && d.getTime() <= Date.now()) return 'Now'; // under way (finished ones are left out)
    return timed ? `Today ${fmtClock(d)}` : 'Today';
  }
  if (e.days === 1) return timed && !short ? `Tomorrow ${fmtClock(d)}` : 'Tomorrow';
  if (e.days < 7) return d.toLocaleDateString('en-US', { weekday: short ? 'short' : 'long' });
  return `${e.days} days`;
}

// "Coming up" rows: next three things from the calendar, birthdays and holidays.
function comingUpRows(list) {
  if (!list.length) return '<div class="muted" style="font-size:18px">Nothing coming up</div>';
  return list.map((e) => `
            <div style="display:flex;align-items:center;gap:10px;font-size:18px">
              ${eventIcon(e.name)}
              <span data-name style="flex-grow:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(e.name)}</span>
              <span data-when data-short="${esc(whenText(e, true))}" style="font-weight:600;flex:none">${esc(whenText(e))}</span>
            </div>`).join('');
}

// ---- The greeting ----
// On a birthday or a holiday it says so ("Happy birthday, Ava!", "Happy Thanksgiving,
// Alex & Jordan"); otherwise good morning / afternoon / evening.
const HOLIDAY_WORDS = {
  "new year's": 'Happy New Year', "valentine's": 'Happy Valentine’s Day', "st patrick's": 'Happy St. Patrick’s Day',
  easter: 'Happy Easter', "mother's": 'Happy Mother’s Day', "father's": 'Happy Father’s Day',
  independence: 'Happy Fourth of July', halloween: 'Happy Halloween', thanksgiving: 'Happy Thanksgiving',
  christmas: 'Merry Christmas', "new year's eve": 'Happy New Year’s Eve',
};
const holidayKey = (s) => String(s).toLowerCase().replace(/[’`]/g, "'").replace(/\./g, '').replace(/\s+/g, ' ').trim()
  .replace(/ (day|sunday)$/, '');
// "Ava’s birthday" / "Alex birthday" -> "Ava" / "Alex"; anything else -> ''
const birthdayName = (s) => { const m = /^([^’'\d]+?)(?:[’']s)?\s+(?:birthday|bday)$/i.exec(String(s).trim()); return m ? m[1].trim() : ''; };

function greetingFor(list) {
  const name = householdName();
  const today = list.filter((e) => e.days === 0);
  const birthdays = today.filter((e) => e.kind === 'birthday');
  if (birthdays.length) {
    const names = birthdays.map((e) => birthdayName(e.name)).filter(Boolean);
    // One birthday whose year the family gave: "Happy 9th birthday, Ava!"
    const age = birthdays.length === 1 && birthdays[0].turns ? `${ordinal(birthdays[0].turns)} ` : '';
    if (names.length) return { text: `Happy ${names.length === 1 ? age : ''}birthday, ${names.slice(0, 2).join(' and ')}!`, special: true };
    return { text: `${birthdays[0].name} today${age ? ` · turns ${birthdays[0].turns}` : ''}`, special: true };
  }
  for (let i = 0; i < today.length; i++) {
    if (/observed/i.test(today[i].name)) continue;
    const words = HOLIDAY_WORDS[holidayKey(today[i].name)];
    if (words) return { text: name ? `${words}, ${name}` : words, special: true };
  }
  const h = new Date().getHours();
  const hello = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  return { text: name ? `${hello}, ${name}` : hello, special: false };
}

// On the two days a year the clocks change, say so: everybody wonders whether this
// clock is the one that is right. (It is: the screen changes itself.)
function clocksChanged(now) {
  const earlier = new Date(now.getTime() - 20 * 60 * 60 * 1000);
  const moved = earlier.getTimezoneOffset() - now.getTimezoneOffset(); // minutes; more than 0: forward
  return moved > 0 ? 'Clocks went forward last night' : moved < 0 ? 'Clocks went back last night' : '';
}
function clockParts() {
  const now = new Date();
  const changed = clocksChanged(now);
  return {
    time: clockTime(now),
    ampm: clockAmPm(now),
    date: now.toLocaleDateString('en-US', { weekday: 'long', month: changed ? 'short' : 'long', day: 'numeric' }) + (changed ? ` · ${changed}` : ''),
  };
}

// ---- The photo ----
// Where the clock can sit: the middle (the favourite), or wherever the photo is calmest.
// x is the middle of the block for 'center', its left edge for 'left', its right edge for 'right'.
const ZONES = [
  { id: 'c', x: 640, y: 372, align: 'center', cost: 0 },
  { id: 'tc', x: 640, y: 244, align: 'center', cost: 1 },
  { id: 'ml', x: 64, y: 372, align: 'left', cost: 1.6 },
  { id: 'mr', x: 1216, y: 372, align: 'right', cost: 1.6 },
  { id: 'tl', x: 64, y: 244, align: 'left', cost: 2 },
  { id: 'tr', x: 1216, y: 244, align: 'right', cost: 2 },
];
const BLOCK_W = 620, BLOCK_H = 300; // about the room the date, the time and a line under it take
const GRID_W = 64, GRID_H = 40;     // the photo is looked at this small

// Where on this photo is there the least going on (faces, text and branches are busy;
// sky, water and walls are calm)? Gives { zone, light } where light is how bright that
// part is, 0-255, so the shade behind the clock can be made as strong as it needs.
function calmestZone(small) {
  return new Promise((done) => {
    if (!small) { done(null); return; }
    const img = new Image();
    img.onerror = () => done(null);
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = GRID_W; c.height = GRID_H;
        const g = c.getContext('2d');
        g.drawImage(img, 0, 0, GRID_W, GRID_H);
        const px = g.getImageData(0, 0, GRID_W, GRID_H).data;
        const L = new Float32Array(GRID_W * GRID_H);
        for (let i = 0; i < L.length; i++) L[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
        let best = null;
        ZONES.forEach((z) => {
          const left = z.align === 'center' ? z.x - BLOCK_W / 2 : z.align === 'left' ? z.x : z.x - BLOCK_W;
          const x0 = Math.max(0, Math.floor(left / 20)), x1 = Math.min(GRID_W - 1, Math.ceil((left + BLOCK_W) / 20));
          const y0 = Math.max(0, Math.floor((z.y - BLOCK_H / 2) / 20)), y1 = Math.min(GRID_H - 1, Math.ceil((z.y + BLOCK_H / 2) / 20));
          let busy = 0, light = 0, n = 0;
          for (let y = y0; y < y1; y++) {
            for (let x = x0; x < x1; x++) {
              const v = L[y * GRID_W + x];
              busy += Math.abs(v - L[y * GRID_W + x + 1]) + Math.abs(v - L[(y + 1) * GRID_W + x]);
              light += v; n++;
            }
          }
          const score = busy / n + z.cost * 2.2;
          if (!best || score < best.score) best = { zone: z, score, light: light / n };
        });
        done(best);
      } catch (e) { done(null); }
    };
    img.src = small;
  });
}

// A painted evening for a screen with no photos yet (and it changes with the time of year).
function paintedScene(theme, night) {
  const winter = theme === 'winter' || theme === 'christmas' || theme === 'newyear' || theme === 'valentine';
  const fall = theme === 'autumn' || theme === 'halloween' || theme === 'thanksgiving';
  const sky = night ? ['#070B1C', '#141C3A', '#2A2A52'] : fall ? ['#2B2F5E', '#B8566A', '#F3A65A'] : winter ? ['#1E2A52', '#6C7FB3', '#F0C9B0'] : ['#27407A', '#E07C6A', '#F8C873'];
  const far = night ? '#1A2244' : winter ? '#8FA3C9' : fall ? '#6B3F5C' : '#4C5C8C';
  const mid = night ? '#121A36' : winter ? '#C9D6EA' : fall ? '#7A3F3A' : '#2F5B5A';
  const near = night ? '#0A1024' : winter ? '#EEF3FA' : fall ? '#3D2530' : '#17373A';
  const tree = night ? '#060A18' : winter ? '#2B4257' : fall ? '#22151E' : '#0E2628';
  const pine = (x, y, s) => `<path d="M${x} ${y - 70 * s}l${26 * s} ${44 * s}h${-14 * s}l${22 * s} ${38 * s}h${-68 * s}l${22 * s} ${-38 * s}h${-14 * s}z" fill="${tree}"/>`;
  return `<svg width="1280" height="800" viewBox="0 0 1280 800" preserveAspectRatio="xMidYMid slice" style="display:block;width:100%;height:100%" aria-hidden="true">
    <defs>
      <linearGradient id="hmSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky[0]}"/><stop offset=".55" stop-color="${sky[1]}"/><stop offset="1" stop-color="${sky[2]}"/></linearGradient>
      <radialGradient id="hmSun" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="${night ? '#F4F1E4' : '#FFF3C4'}"/><stop offset=".22" stop-color="${night ? '#F4F1E4' : '#FFE08A'}" stop-opacity="${night ? 0.9 : 1}"/><stop offset=".24" stop-color="${night ? '#C8D2F0' : '#FFC46B'}" stop-opacity=".35"/><stop offset="1" stop-color="#FFC46B" stop-opacity="0"/></radialGradient>
    </defs>
    <rect width="1280" height="800" fill="url(#hmSky)"/>
    ${night ? [[90, 70], [210, 150], [330, 60], [470, 120], [610, 50], [760, 140], [1010, 60], [1130, 170], [1210, 90], [880, 220], [150, 260], [540, 240]].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${i % 3 ? 1.4 : 2.2}" fill="#fff" opacity="${0.5 + (i % 4) * 0.12}"/>`).join('') : ''}
    <circle cx="${night ? 980 : 890}" cy="${night ? 170 : 470}" r="${night ? 190 : 300}" fill="url(#hmSun)"/>
    <path d="M0 520 L160 400 L300 470 L470 350 L640 460 L800 380 L960 470 L1120 390 L1280 480 V800 H0Z" fill="${far}"/>
    ${winter && !night ? '<path d="M470 350l40 28-22 4-18-10-20 14-16-6zM800 380l36 22-20 2-16-8-18 10-12-6zM1120 390l34 22-18 2-16-8-18 12-10-8z" fill="#fff" opacity=".85"/>' : ''}
    <path d="M0 610 C200 540 380 600 560 570 S900 520 1280 590 V800 H0Z" fill="${mid}"/>
    ${pine(150, 640, 1.5)}${pine(230, 650, 1.1)}${pine(1090, 640, 1.6)}${pine(1180, 655, 1.2)}${pine(1010, 648, 0.9)}
    <g transform="translate(600 560)">
      <path d="M-70 60V0L0-52 70 0V60Z" fill="${night ? '#1B2038' : winter ? '#7A5A4A' : '#5A3A30'}"/>
      <path d="M-86 6L0-64 86 6 72 16 0-42-72 16Z" fill="${winter ? '#F4F7FB' : night ? '#0B0F20' : '#2A1A1C'}"/>
      <rect x="-44" y="14" width="30" height="30" rx="3" fill="#FFD27A"/><rect x="18" y="14" width="30" height="30" rx="3" fill="#FFD27A"/>
      <rect x="-12" y="20" width="22" height="40" rx="2" fill="${night ? '#0B0F20' : '#2A1A1C'}"/>
    </g>
    <path d="M0 700 C260 640 520 690 760 660 S1100 640 1280 680 V800 H0Z" fill="${near}"/>
  </svg>`;
}

const ICON = {
  timers: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.500 2.500M10 2h4"/></svg>',
  menu: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></svg>',
  gallery: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="M4 18l5-5 4 4 3-3 4 4"/></svg>',
  dinner: '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="13" r="7"/><circle cx="12" cy="13" r="3.2"/><path d="M3 4v6M21 4v6"/></svg>',
};

export function mount(el) {
  const c = clockParts();
  let coming = upcoming(1);
  let greet = greetingFor(upcoming(3));
  let theme = season();
  const hideAfter = Math.max(0, +display().homeHideSecs || 0) * 1000;

  el.innerHTML = `
  <style>
    .hm{position:absolute;top:0;right:0;bottom:0;left:0;background:#0B0E18;color:#fff;overflow:hidden}
    .hm-layer{position:absolute;top:0;right:0;bottom:0;left:0;opacity:0;transition:opacity 1.4s ease;will-change:opacity}
    .hm-layer.on{opacity:1}
    .hm-back,.hm-pic{position:absolute;top:0;right:0;bottom:0;left:0;background:center/cover no-repeat}
    .hm-pic.zoom{animation:hm-zoom 70s ease-in-out infinite alternate;will-change:transform}
    @keyframes hm-zoom{from{transform:scale(1)}to{transform:scale(1.07)}}
    .hm-shade{position:absolute;top:0;right:0;bottom:0;left:0;pointer-events:none;
      background:linear-gradient(180deg,rgba(6,8,16,.55) 0,rgba(6,8,16,0) 22%,rgba(6,8,16,0) 62%,rgba(6,8,16,.72) 100%)}
    .hm-clock{position:absolute;width:${BLOCK_W}px;transition:opacity .6s ease;text-shadow:0 2px 18px rgba(0,0,0,.45)}
    .hm-glow{position:absolute;left:50%;top:50%;width:980px;height:520px;margin:-260px 0 0 -490px;pointer-events:none;
      background:radial-gradient(closest-side,rgba(4,6,14,1) 0,rgba(4,6,14,.6) 45%,rgba(4,6,14,0) 100%)}
    .hm-date{position:relative;font:500 24px Inter,sans-serif;letter-spacing:.5px}
    .hm-time{position:relative;font:200 204px/1 Outfit,sans-serif;letter-spacing:-6px;margin:2px 0 0;white-space:nowrap}
    .hm-ampm{font:500 40px Outfit,sans-serif;letter-spacing:0;margin-left:12px;opacity:.85}
    .hm-count{position:relative;font-size:34px;margin-top:6px}
    .hm-count.squeezed{display:none}
    .hm-wx{position:relative;font:500 24px Inter,sans-serif;margin-top:10px;display:inline-flex;align-items:center;gap:10px}
    .hm-top{position:absolute;left:40px;right:40px;top:32px;display:flex;align-items:flex-start;gap:16px}
    .hm-hello{font:500 30px Outfit,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 2px 14px rgba(0,0,0,.5)}
    .hm-cap{font:400 18px Inter,sans-serif;opacity:.9;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 1px 10px rgba(0,0,0,.6)}
    .hm-note{margin-top:12px;min-height:56px;display:inline-flex;align-items:center;gap:10px;padding:0 22px;border-radius:28px;background:var(--accent);color:#fff;font:600 19px Inter,sans-serif;max-width:560px}
    .hm-extra{margin-top:12px;display:flex;align-items:center;max-width:620px}
    .hm-extra a{min-height:56px;display:inline-flex;align-items:center;padding:0 22px;border-radius:28px;background:rgba(14,16,24,.6);
      box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.22);color:#fff;font:600 19px Inter,sans-serif;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .hm-extra button{flex:none;min-width:56px;height:56px;margin-left:10px;padding:0;border-radius:28px;border:0;background:#fff;color:#1D2430;font:700 24px Inter,sans-serif;cursor:pointer}
    .hm-extra button.undo{padding:0 22px;font-size:19px}
    .hm-note span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .hm-row{position:absolute;left:40px;right:40px;bottom:36px;display:flex;align-items:stretch;gap:14px}
    .hm-chip{flex:1 1 0;min-width:0;min-height:88px;border-radius:26px;padding:0 20px;display:flex;align-items:center;gap:14px;
      background:rgba(14,16,24,.6);box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.22);color:#fff}
    .hm-chip b{display:block;font:600 21px Inter,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .hm-chip i{display:block;font:400 16px Inter,sans-serif;font-style:normal;opacity:.82;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .hm-chip .x-eyebrow{font-size:13px;opacity:.75;margin-bottom:3px;display:block}
    .hm-dock{min-height:88px;border-radius:26px;padding:0 30px;font-size:22px}
    @media (prefers-reduced-motion: reduce){.hm-pic.zoom{animation:none}}
    /* Resting: the snow (or leaves) fades away, so nothing is left moving. */
    [data-season]{transition:opacity 1.5s ease}
    .hm.x-resting [data-season]{opacity:0;visibility:hidden;transition:opacity 1.5s ease,visibility 0s 1.5s}
  </style>
  <div class="hm" data-home>
    <div class="hm-layer" data-layer="0"><div class="hm-back"></div><div class="hm-pic"></div></div>
    <div class="hm-layer" data-layer="1"><div class="hm-back"></div><div class="hm-pic"></div></div>
    <div class="hm-shade"></div>
    <div data-season>${seasonLayer(theme)}</div>

    <div class="hm-clock" data-clock>
      <div class="hm-glow" data-glow></div>
      <div class="hm-date" data-date>${esc(c.date)}</div>
      <div class="hm-time"><span data-time>${c.time}</span><span data-ampm class="hm-ampm"${c.ampm ? '' : ' style="display:none"'}>${c.ampm}</span></div>
      <div class="hm-count x-serif" data-count></div>
      <div><a href="#/forecast" class="hm-wx x-chrome" data-wx-line></a></div>
    </div>

    <div class="hm-top x-chrome">
      <div style="flex:1;min-width:0">
        <div class="hm-hello" data-hello>${esc(greet.text)}</div>
        <div class="hm-cap" data-cap></div>
        <a href="#/messages" class="hm-note" data-notes style="display:none"></a>
        <div class="hm-extra" data-extra style="display:none"><a data-extra-go></a><button type="button" data-extra-done aria-label="Done">✓</button></div>
      </div>
      <a href="#/addphotos" class="x-btn accent" data-add style="display:none">Add your photos</a>
      <a href="#/photos" class="x-btn glass">${ICON.gallery}Gallery</a>
    </div>

    <div class="hm-row x-chrome" data-row>
      <a href="#/calendar" class="hm-chip" data-coming></a>
      <a href="#/recipes" class="hm-chip" data-dinner>
        <span style="display:flex;flex:none;opacity:.9">${ICON.dinner}</span>
        <span style="min-width:0"><span class="x-eyebrow" data-d-eyebrow>Dinner</span><b data-d-title>Pick a recipe</b></span>
      </a>
      <a href="#/timers" class="x-btn frost hm-dock">${ICON.timers}Timers</a>
      <a href="#/launcher" class="x-btn white hm-dock">${ICON.menu}Menu</a>
    </div>
  </div>`;

  const $ = (s) => el.querySelector(s);
  const root = $('[data-home]');

  // ---- Left alone, only the photo and the time are left; a touch brings the rest back ----
  // (A word from the screen itself, "New things have arrived", waits with the buttons.)
  const noticeBar = () => document.querySelector('#screen > [data-notice]');
  rest = restful(root, {
    after: hideAfter,
    stay: () => tutorialRunning(),
    onChange: (resting) => { const bar = noticeBar(); if (bar) bar.style.visibility = resting ? 'hidden' : ''; makeRoom(); },
  });

  // The timer chip sits in the bottom-left corner while a timer runs, and so does a word
  // from the screen: the row steps up for whichever is there.
  let fitClock = () => {}; // (see "Where the clock sits")
  function makeRoom() {
    const bar = noticeBar();
    const notice = !!bar && bar.style.display !== 'none';
    const chip = chipShowsOn('home');
    const bottom = `${36 + (chip ? 80 : 0) + (notice ? 60 : 0)}px`;
    if ($('[data-row]').style.bottom === bottom) return; // (looked at every 3 s: only a change is drawn)
    $('[data-row]').style.bottom = bottom;
    fitClock();
  }
  makeRoom();
  roomTimer = setInterval(makeRoom, 3000);
  offChip = onChipChanged(() => { if (el.isConnected) makeRoom(); });

  // ---- The time of year: a countdown under the clock, and things drifting past ----
  const showSeason = () => {
    theme = season();
    $('[data-season]').innerHTML = seasonLayer(theme);
    const line = $('[data-count]');
    line.textContent = theme.countdown ? theme.countdown.text : '';
    line.style.display = theme.countdown ? '' : 'none';
    line.style.color = theme.glow || '';
    fitClock();
  };
  showSeason();

  // ---- Where the clock sits ----
  let zoneNow = null;
  let zoneAt = ZONES[0];
  // The clock never sits under the greeting and the note / extra lines at the top left:
  // when they reach down that far, it steps down below them.
  const clockTop = (z) => {
    const stack = $('.hm-top > div');
    return Math.max(z.y - BLOCK_H / 2, stack ? 32 + stack.offsetHeight + 16 : 0);
  };
  fitClock = () => {
    const box = $('[data-clock]'), count = $('[data-count]'), row = $('[data-row]');
    box.style.top = `${clockTop(zoneAt)}px`;
    // Crowded (notes, an extra line, the timer chip and a word from the screen all at once):
    // the countdown under the clock gives way, so the weather line stays clear of the buttons.
    count.classList.remove('squeezed');
    if (box.offsetTop + box.offsetHeight > root.offsetHeight - (parseInt(row.style.bottom, 10) || 36) - row.offsetHeight - 8) count.classList.add('squeezed');
  };
  const placeClock = (zone, light) => {
    const z = zone || ZONES[0];
    const box = $('[data-clock]');
    const put = () => {
      zoneAt = z;
      box.style.textAlign = z.align;
      box.style.left = `${z.align === 'center' ? z.x - BLOCK_W / 2 : z.align === 'left' ? z.x : z.x - BLOCK_W}px`;
      fitClock();
      // A bright patch of photo needs more shade behind white letters than a dark one.
      const strength = light == null ? 0.34 : Math.max(0.16, Math.min(0.62, (light - 50) / 260));
      $('[data-glow]').style.opacity = strength.toFixed(2);
      $('[data-glow]').style.marginLeft = z.align === 'center' ? '-490px' : z.align === 'left' ? `${-490 - (BLOCK_W / 2 - 220)}px` : `${-490 + (BLOCK_W / 2 - 220)}px`;
    };
    if (zoneNow && zoneNow !== z.id) {
      // It moves between photos, never while one is up: out, across, in.
      box.style.opacity = '0';
      setTimeout(() => { if (!el.isConnected) return; put(); box.style.opacity = '1'; }, 620);
    } else put();
    zoneNow = z.id;
  };
  placeClock(null, null);

  // ---- The photos, one after another ----
  // The album's photos that are "in the rotation" (the Gallery chooses), a minute each
  // unless Settings says otherwise. The next one is fetched and looked at before it is
  // shown, so the screen never flashes empty; one that won't open is skipped.
  let list = [];
  let at = 0;
  let front = 1; // the layer showing now (the first photo goes on layer 0)
  let shownKey = '';
  const layers = [$('[data-layer="0"]'), $('[data-layer="1"]')];
  const night = isNight();
  const photosNow = () => {
    if (!isTablet()) return rotationOf(samplePhotos.filter((p) => !p.video)).map((p) => ({ id: p.id, art: p.art, title: p.title, line: p.addedBy ? `from ${p.addedBy}` : '' }));
    let all = rotationOf(getPhotos().filter((p) => !p.video));
    if (display().photoShuffle) {
      // Mixed up, but the same order all day (so "next" and "back" mean something).
      const seed = new Date().getDate();
      all = all.map((p, i) => [Math.sin((i + 1) * 12.9898 + seed) * 43758.5453 % 1, p]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
    }
    return all;
  };
  const setCaption = (p) => {
    const cap = $('[data-cap]');
    const show = p && display().photoCaptions !== false;
    cap.textContent = show ? (p.line ? `${p.title} · ${p.line}` : p.title || '') : '';
  };
  function putUp(p, picture, small, found) {
    if (!el.isConnected) return;
    const next = 1 - front;
    const layer = layers[next];
    const back = layer.querySelector('.hm-back');
    const pic = layer.querySelector('.hm-pic');
    pic.className = 'hm-pic';
    back.style.background = '';
    if (!p) {
      // No photos yet: the painted evening.
      pic.style.background = 'none';
      pic.innerHTML = paintedScene(theme.key, night);
    } else if (p.art) {
      pic.innerHTML = '';
      pic.style.background = p.art;
    } else {
      pic.innerHTML = '';
      const tall = picture && picture.naturalWidth / picture.naturalHeight < 1.05;
      pic.style.background = `url('${encodeURI(p.src)}') ${tall ? 'right center/contain' : 'center 35%/cover'} no-repeat`;
      // A tall photo stands at the right with the clock beside it, over a soft, dark, stretched
      // copy of itself (a tiny picture stretched: the look of a blur without the cost).
      back.style.background = tall && small ? `linear-gradient(rgba(8,10,18,.62),rgba(8,10,18,.62)),url(${small}) center/cover no-repeat` : '#0B0E18';
      if (!tall && display().photoZoom !== false) pic.className = 'hm-pic zoom';
      if (tall) found = { zone: ZONES[2], light: 40 };
    }
    layer.classList.add('on');
    layers[front].classList.remove('on');
    front = next;
    placeClock(found && found.zone, found ? found.light : null);
    setCaption(p);
  }
  function showPhoto(tries = 0) {
    list = photosNow();
    $('[data-add]').style.display = isTablet() && !getPhotos().length ? '' : 'none';
    if (!list.length) {
      if (shownKey !== 'painted') { shownKey = 'painted'; putUp(null); placeClock(ZONES[1], 60); }
      return;
    }
    const p = list[((at % list.length) + list.length) % list.length];
    if (p.id === shownKey && list.length > 1) return;
    if (p.art) { shownKey = p.id; putUp(p); return; }
    const img = new Image();
    img.onload = () => {
      if (!el.isConnected) return;
      thumbnail(p.src, { w: GRID_W * 2, h: GRID_H * 2 }).then((small) => calmestZone(small).then((found) => {
        shownKey = p.id;
        putUp(p, img, small, found);
      }));
    };
    img.onerror = () => {
      if (!el.isConnected) return;
      if (tries + 1 < list.length) { at++; showPhoto(tries + 1); }
    };
    img.src = p.src;
  }
  const step = (by) => { at += by; showPhoto(); restartSlides(); };
  const restartSlides = () => {
    clearInterval(photoTimer);
    photoTimer = setInterval(() => { at++; showPhoto(); }, Math.max(10, +display().slideSecs || 60) * 1000);
  };
  showPhoto();
  restartSlides();
  offPhotos = onPhotosChanged(() => { at = 0; shownKey = ''; showPhoto(); });
  offRotation = onRotationChanged(() => { shownKey = ''; showPhoto(); });

  // A swipe across the photo: the next one, or the one before.
  let swipe = null;
  root.addEventListener('touchstart', (e) => { swipe = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null; }, { passive: true });
  root.addEventListener('touchend', (e) => {
    if (!swipe) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - swipe.x, dy = t.clientY - swipe.y;
    swipe = null;
    if (Math.abs(dx) > 90 && Math.abs(dx) > Math.abs(dy) * 2) step(dx < 0 ? 1 : -1);
  }, { passive: true });

  // ---- "New note from Alex" (or "3 new notes"), until someone opens the board ----
  const showNotes = () => {
    if (!el.isConnected) return;
    const unread = loadMessages().filter((m) => !m.seen);
    const n = unread.length;
    const a = $('[data-notes]');
    a.style.display = n ? '' : 'none';
    a.innerHTML = `<span>${esc(n === 1 ? (unread[0].who ? `New note from ${unread[0].who}` : '1 new note') : `${n} new notes`)}</span>`;
    fitClock();
  };
  showNotes();
  offNotes = onMessagesChanged(showNotes);

  // ---- One quiet line from the extra apps (a bill due, a chore tonight, the dog's dinner):
  // only the most pressing one, with a tick where it can be done from here. ----
  let extraLine = null;
  let extraDoneAt = 0;
  let undoExtra = null;
  // (Asked every minute: the same line as already shown is left alone, and the clock isn't
  // measured again for nothing.)
  let extraShown = null;
  const showExtra = () => topHomeLine().then((line) => {
    if (!el.isConnected || undoExtra) return;
    extraLine = line;
    const key = line ? `${line.text}|${line.href || ''}|${line.done ? 1 : 0}` : '';
    if (key === extraShown) return;
    extraShown = key;
    const box = $('[data-extra]');
    box.style.display = line ? 'flex' : 'none';
    if (line) {
      const a = $('[data-extra-go]');
      a.textContent = line.text;
      a.setAttribute('href', line.href || '#/launcher');
      $('[data-extra-done]').style.display = line.done ? '' : 'none';
    }
    fitClock();
  }).catch(() => {});
  $('[data-extra-done]').addEventListener('click', () => {
    // One tap, one thing done: a second tap (or a double tap) must not tick the next line,
    // which comes up in the same place.
    const btn = $('[data-extra-done]');
    if (undoExtra) { // "Undo": put it back (not the second tap of a double tap)
      if (Date.now() - extraDoneAt < 700) return;
      const back = undoExtra;
      undoExtra = null;
      clearTimeout(undoTimer);
      try { back(); } catch (e) { /* gone already */ }
      btn.className = ''; btn.textContent = '✓';
      showExtra();
      return;
    }
    if (!extraLine || !extraLine.done || Date.now() - extraDoneAt < 1200) return;
    extraDoneAt = Date.now();
    const line = extraLine;
    extraLine = null;
    let back = null;
    try { back = line.done(); } catch (e) { /* its app shows why */ }
    if (typeof back !== 'function') { showExtra(); return; }
    // Done: the line stays a moment, crossed through, with Undo.
    undoExtra = back;
    $('[data-extra-go]').style.textDecoration = 'line-through';
    btn.className = 'undo'; btn.textContent = 'Undo';
    clearTimeout(undoTimer);
    undoTimer = setTimeout(() => {
      undoExtra = null;
      if (!el.isConnected) return;
      $('[data-extra-go]').style.textDecoration = '';
      btn.className = ''; btn.textContent = '✓';
      showExtra();
    }, 6000);
  });
  showExtra();

  // ---- Dinner: what's planned tonight (tomorrow's, late in the evening), else today's idea ----
  let dinnerShown = '';
  const showDinner = (info) => {
    if (!info || !el.isConnected) return;
    const sig = JSON.stringify(info);
    if (sig === dinnerShown) return;
    dinnerShown = sig;
    const id = info.id ? encodeURIComponent(info.id) : '';
    const set = (href, eyebrow, title) => {
      $('[data-dinner]').setAttribute('href', href);
      $('[data-d-eyebrow]').textContent = eyebrow;
      $('[data-d-title]').textContent = title;
    };
    if (info.kind === 'planned') set(`#/recipe/${id}`, `Tonight · ${fmtMinutes(info.m)}`, info.t);
    else if (info.kind === 'tomorrow') set(`#/dish/${id}`, 'Tomorrow’s dinner', info.t);
    else if (info.kind === 'out') set('#/plan', 'Tonight', 'Eating out');
    else if (info.kind === 'leftovers') set('#/plan', 'Tonight', 'Leftovers');
    else set(`#/dish/${id}`, 'Dinner idea', info.t);
  };
  const loadDinner = () => {
    const slot = dinnerSlot();
    return dinnerInfo().then((info) => {
      if (!info) return;
      lastDinner = { at: slot, info };
      showDinner(info);
    }).catch(() => {});
  };
  if (lastDinner && lastDinner.at === dinnerSlot()) showDinner(lastDinner.info);
  loadDinner();

  // ---- The next thing on the calendar ----
  let comingHtml = '';
  const renderComing = () => {
    if (!el.isConnected) return;
    // The holiday the line under the clock already counts down to isn't said twice.
    const counted = theme.countdown ? String(theme.countdown.name).replace(/^the /, '').toLowerCase() : '';
    coming = upcoming(3).filter((x) => !counted || String(x.name).toLowerCase() !== counted);
    const e = coming[0];
    const html = e
      ? `<span style="display:flex;flex:none">${eventIcon(e.name, 34)}</span><span style="min-width:0"><span class="x-eyebrow">${esc(whenText(e))}</span><b>${esc(e.name)}</b></span>`
      : '<span style="min-width:0"><span class="x-eyebrow">Calendar</span><b>Nothing coming up</b></span>';
    if (html !== comingHtml) { comingHtml = html; $('[data-coming]').innerHTML = html; }
    const g = greetingFor(upcoming(3));
    const h = $('[data-hello]');
    if (h.textContent !== g.text) h.textContent = g.text;
    h.style.color = g.special && theme.glow ? theme.glow : '';
  };
  renderComing();
  onCalendar = () => renderComing();
  window.addEventListener('calendar-updated', onCalendar);
  refreshCalendars();

  // ---- The clock: turns over exactly on the minute. At midnight the day's things move on. ----
  let day = new Date().toDateString();
  let hour = new Date().getHours();
  let comingAt = Date.now();
  const tick = () => {
    clearTimeout(timer);
    if (!el.isConnected) return;
    const n = clockParts();
    const ampm = $('[data-ampm]');
    $('[data-time]').textContent = n.time;
    ampm.textContent = n.ampm;
    ampm.style.display = n.ampm ? '' : 'none';
    if ($('[data-date]').textContent !== n.date) $('[data-date]').textContent = n.date;
    showExtra();
    const now = new Date();
    if (now.toDateString() !== day) {
      day = now.toDateString();
      showSeason();
      renderComing();
      loadDinner();
      comingAt = Date.now();
      if (shownKey === 'painted') { shownKey = ''; showPhoto(); }
    } else if (Date.now() - comingAt >= COMING_MS) {
      renderComing();
      comingAt = Date.now();
    }
    if (now.getHours() !== hour) { hour = now.getHours(); loadDinner(); }
    timer = setTimeout(tick, 60000 - (Date.now() % 60000) + 30);
  };
  timer = setTimeout(tick, 60000 - (Date.now() % 60000) + 30);
  // The screen was off (timers sleep then): put the right time up the moment it's back.
  onWake = () => { if (!document.hidden) tick(); };
  document.addEventListener('visibilitychange', onWake);

  // ---- Weather: one line under the clock and a chip. Fetched again every 15 minutes; ----
  // ---- with the Wi-Fi down, today's last forecast is shown and says from when.       ----
  // (The weather is said once, in the line under the clock: it used to be there and in a
  // chip at the bottom as well.)
  let warning = '';
  let lastShown = null;
  function showWeather(w, loc, offline) {
    lastShown = [w, loc, offline];
    const d = describe(w.code);
    // Honest about old numbers: say from when, if the Wi-Fi is down or they are over an hour old.
    const old = offline || Date.now() - w.at > 60 * 60 * 1000;
    const extra = warning ? `⚠ ${warning}` : old ? `as of ${timeText(new Date(w.at))}` : rainSoon(w);
    $('[data-wx-line]').innerHTML = `<span style="display:flex">${wxIcon(d.icon, 34, isNight())}</span>${w.temp}° · ${esc(d.label)}${extra ? ` · ${esc(extra)}` : ''}`;
  }
  const early = savedWeather();
  if (early) showWeather(early, manualPlace() || knownPlace(), false);

  let loading = false;
  async function loadWeather() {
    if (loading) return;
    loading = true;
    let loc = null;
    try {
      loc = await getLocation();
      getAlerts(loc).then((alerts) => {
        if (!el.isConnected) return;
        // A weather warning joins the line; one that ended goes away.
        warning = alerts.length ? alerts[0].event : '';
        if (lastShown) showWeather(lastShown[0], lastShown[1], lastShown[2]);
      }).catch(() => {});
      const w = await getWeather(loc);
      if (!el.isConnected) return;
      showWeather(w, loc, false);
    } catch (err) {
      console.error(err);
      if (!el.isConnected) return;
      const old = savedWeather();
      if (old) { showWeather(old, loc, true); return; }
    } finally {
      loading = false;
    }
  }
  loadWeather();
  // The Wi-Fi came back, or the owner chose another town: fresh weather now, not in 15 minutes.
  onOnline = () => { if (el.isConnected) { loadWeather(); refreshCalendars(); } };
  window.addEventListener('online', onOnline);
  window.addEventListener('place-changed', onOnline);
  refreshTimer = setInterval(() => {
    loadWeather();
    refreshCalendars(); // picks up new events from calendar links (redraws when they arrive)
  }, REFRESH_MS);
}

export function unmount() {
  clearTimeout(timer);
  clearTimeout(undoTimer);
  clearInterval(photoTimer);
  clearInterval(refreshTimer);
  clearInterval(roomTimer);
  { const bar = document.querySelector('#screen > [data-notice]'); if (bar) bar.style.visibility = ''; }
  if (rest) rest.stop();
  rest = null;
  offPhotos?.();
  offRotation?.();
  offNotes?.();
  offChip?.();
  offChip = offRotation = null;
  window.removeEventListener('calendar-updated', onCalendar);
  if (onWake) document.removeEventListener('visibilitychange', onWake);
  if (onOnline) { window.removeEventListener('online', onOnline); window.removeEventListener('place-changed', onOnline); }
  onWake = onOnline = null;
}
