// Kitchen display · Night clock ("Rain on the window", board IdeaKH11)
// A dim amber clock over the view from a dark window: hills, one house, a street lamp, and
// tomorrow's sun waiting faintly below the hills. Tap anywhere to go back home.
//
// The window follows the real weather when it is known: drops run down the glass only when
// it is raining (or rain is on the way in the next hours), snow drifts when it is snowing,
// and otherwise it is a clear night with a few stars (none to speak of under cloud).
//
// app.js brings this up by itself at night and turns the backlight right down (2-15 %), so
// the clock is very large and there are no bright patches to light up a dark room. It
// stays up for eight hours: only the rain or snow on the glass moves (a few small divs,
// transform and opacity only, and app.js pauses even those once nobody touches it), and the
// text changes once a minute. The bottom corners are kept free for the timer chip
// and the "plug me in" word.
import { isNightNow, hourText, display, clockTime, clockAmPm } from '../services/display.js';
import { getLocation } from '../services/location.js';
import { getWeather, describe } from '../services/weather.js';
import { getWeek } from '../services/calendar-data.js';
import * as timerSvc from '../services/timers.js';
import { esc } from './ui.js';

let tickTimer, refreshTimer, ringTimer, backTimer, offVisible;

const REFRESH_MS = 30 * 60 * 1000;
// Burn-in: an LCD left on one picture all night can keep a faint ghost of it. The clock
// moves to the next of these spots (px) every few minutes; small enough nobody notices.
const SHIFT = [[0, 0], [14, -8], [-12, 10], [10, 12], [-14, -10], [6, -14], [-6, 14], [16, 4], [-16, -4]];
const SHIFT_MINUTES = 3;

const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const isNight = () => isNightNow(); // the hours are the owner's choice (Settings)

function clockParts() {
  const now = new Date();
  return {
    time: clockTime(now),
    ampm: clockAmPm(now),
    date: now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
  };
}

// The day the bottom row is about: after midnight (or in the morning) that's today,
// in the evening it's tomorrow.
function comingDay() {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (now.getHours() < 12 ? 0 : 1));
  return { date: d, word: now.getHours() < 12 ? 'Today' : 'Tomorrow' };
}

// "Dentist · 9:30 AM  +2 more" for that day, or a plain word when there's nothing.
// For today, things that are already over are left out: at 10 AM "Dentist 8:00" is old news.
function firstUp(day, today) {
  let items = [];
  try {
    const week = getWeek(day);
    const found = week.filter((d) => dayKey(d.date) === dayKey(day))[0];
    items = found ? found.events : [];
  } catch (e) { console.error(e); } // a calendar that can't be read: say nothing is planned
  if (today) {
    const now = new Date();
    items = items.filter((x) => {
      const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i.exec(x.endTime || x.time || '');
      if (!m) return true; // all day, "Until …": keep
      let h = +m[1] % 12;
      if (m[3]) { if (/pm/i.test(m[3])) h += 12; } else h = +m[1];
      return h * 60 + +m[2] > now.getHours() * 60 + now.getMinutes();
    });
  }
  if (!items.length) return { title: today ? 'Nothing else planned' : 'Nothing planned', time: '', more: '', none: true };
  const e = items.filter((x) => x.time !== 'All day')[0] || items[0];
  // The time first and the "+2 more" kept apart: a long name is cut short, never those.
  // (no-break spaces: a plain space at the end of the flex item would be dropped; "All day" says nothing)
  return { title: e.title, time: e.time === 'All day' ? ' ' : `${e.time} · `, more: items.length > 1 ? `+${items.length - 1} more` : '' };
}

// That day's forecast from a weather result (live or saved): { kind, text } or null.
function dayForecast(w, day) {
  const d = w && w.daily;
  if (!d || !d.time) return null;
  const i = d.time.indexOf(dayKey(day));
  if (i < 0) return null;
  const what = describe(d.weather_code[i]);
  return { kind: what.icon, text: `${what.label} · high ${Math.round(d.temperature_2m_max[i])}° · low ${Math.round(d.temperature_2m_min[i])}°` };
}

// Weather read in the last three hours says what it is doing outside now; older than that
// and the window shows a plain clear night rather than pretend to know.
const FRESH_MS = 3 * 60 * 60 * 1000;
const fresh = (w) => !!(w && w.at && Date.now() - w.at < FRESH_MS && typeof w.code === 'number');

// What the window shows: 'rain' | 'snow' | 'clear' | 'cloud'.
function skyFor(w) {
  if (!fresh(w)) return 'clear';
  const now = describe(w.code).icon;
  const wet = (k) => k === 'rain' || k === 'storm';
  if (now === 'snow') return 'snow';
  if (wet(now)) return 'rain';
  // On its way in the next few hours (the forecast's coming hours): the glass is already wet.
  const soon = (w.hours || []).filter((h) => h && typeof h.code === 'number').map((h) => describe(h.code).icon);
  if (soon.some(wet)) return 'rain';
  if (soon.indexOf('snow') >= 0) return 'snow';
  return now === 'sun' || now === 'partly' ? 'clear' : 'cloud';
}

// "Light rain now, 41°"
function nowWords(w) {
  if (!fresh(w)) return null;
  const what = describe(w.code);
  return { kind: what.icon, text: `${what.label} now${typeof w.temp === 'number' ? `, ${w.temp}°` : ''}` };
}

function savedWeather() {
  try { return JSON.parse(localStorage.getItem('weather.v1') || 'null'); } catch (e) { return null; }
}

// Is a kitchen or cooking timer ringing? The timers service knows both kinds, and their names.
function ringingNow() {
  return timerSvc.ringingNames().length ? { names: timerSvc.ringingText() } : null;
}

// Dim amber on near-black. Labels are a little dimmer than the clock but never dark brown:
// at 2 % backlight anything darker than this disappears.
const INK = '#C99A5E';
const INK_2 = '#B58A56';

// Small pictures for the lines at the bottom, in colours that stay dark.
function icon(kind) {
  const cloud = '<ellipse cx="18" cy="13" rx="13" ry="8" fill="#5A6680"/><circle cx="13" cy="10" r="7" fill="#5A6680"/><circle cx="22" cy="9" r="6" fill="#5A6680"/>';
  let body;
  if (kind === 'rain' || kind === 'storm') body = `${cloud}<g stroke="#5A6680" stroke-width="2.4" stroke-linecap="round"><line x1="10" y1="24" x2="8" y2="30"/><line x1="18" y1="24" x2="16" y2="30"/><line x1="26" y1="24" x2="24" y2="30"/></g>`;
  else if (kind === 'snow') body = `${cloud}<g fill="#7A869C"><circle cx="9" cy="27" r="2.4"/><circle cx="18" cy="29" r="2.4"/><circle cx="27" cy="27" r="2.4"/></g>`;
  else if (kind === 'cloud' || kind === 'fog') body = `<g transform="translate(0 4)">${cloud}</g>`;
  else if (kind === 'moon') body = `<path d="M22 5a12 12 0 1 0 8 20a10 10 0 0 1-8-20z" fill="${INK_2}"/>`;
  else body = `<circle cx="17" cy="17" r="7.5" fill="${INK}"/><g stroke="${INK}" stroke-width="2.2" stroke-linecap="round"><line x1="17" y1="2" x2="17" y2="6"/><line x1="17" y1="28" x2="17" y2="32"/><line x1="2" y1="17" x2="6" y2="17"/><line x1="28" y1="17" x2="32" y2="17"/></g>`;
  return `<svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true" focusable="false" style="flex:none;margin-right:12px">${body}</svg>`;
}

// The view out of the window: sky, hills, one house with a lamp left on, a street lamp.
// Nothing here moves.
const SCENE = `<svg class="nt-scene" viewBox="0 0 1280 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="ntSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#07080D"/><stop offset="0.7" stop-color="#10131F"/><stop offset="1" stop-color="#0A0B12"/></linearGradient>
      <radialGradient id="ntStreet" cx="980" cy="560" r="220" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#7A5A30" stop-opacity="0.4"/><stop offset="1" stop-color="#7A5A30" stop-opacity="0"/></radialGradient>
    </defs>
    <rect x="-40" y="-40" width="1360" height="880" fill="url(#ntSky)"/>
    <path fill="#0B0D16" d="M-40 600 L90 560 L160 580 L240 520 L320 560 L420 540 L520 580 L640 548 L760 570 L880 530 L1000 566 L1120 540 L1320 570 V840 H-40Z"/>
    <rect x="760" y="340" width="440" height="440" fill="url(#ntStreet)"/>
    <rect x="976" y="420" width="6" height="200" fill="#151827"/><circle cx="979" cy="418" r="7" fill="#B88A52"/>
    <g fill="#14182A"><rect x="140" y="520" width="120" height="80"/><path d="M130 524 L200 480 L270 524Z"/><rect x="180" y="548" width="20" height="18" fill="#3A2C1A"/></g>
  </svg>`;

// What is on (and beyond) the glass for each kind of night. Fixed spots, so nothing jumps
// when the weather is read again.
function skyLayer(kind) {
  if (kind === 'rain') {
    const drips = [[120, 70, 5, 0], [340, 90, 7, 2], [610, 60, 6, 4], [860, 80, 8, 1], [1100, 70, 6.5, 3], [1220, 50, 9, 6]];
    return `${drips.map(([x, h, secs, wait]) => `<div class="nt-drip" style="left:${x}px;height:${h}px;animation-duration:${secs}s;animation-delay:-${wait}s"></div>`).join('')}
      <svg class="nt-beads" viewBox="0 0 1280 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false"><g fill="rgba(170,190,220,.26)">
        <circle cx="80" cy="140" r="5"/><circle cx="260" cy="90" r="4"/><circle cx="470" cy="210" r="6"/><circle cx="700" cy="120" r="4"/><circle cx="930" cy="250" r="5"/><circle cx="1180" cy="110" r="6"/><circle cx="200" cy="420" r="4"/><circle cx="1050" cy="400" r="5"/><circle cx="560" cy="680" r="4"/><circle cx="1220" cy="620" r="5"/></g>
        <circle cx="390" cy="330" r="7" fill="rgba(170,190,220,.32)"/><circle cx="1000" cy="180" r="6" fill="rgba(170,190,220,.32)"/></svg>`;
  }
  if (kind === 'snow') {
    const flakes = [[90, 7, 22, 3, 40], [250, 5, 30, 14, -30], [420, 8, 26, 8, 24], [590, 5, 34, 21, -44], [760, 7, 24, 1, 36], [930, 6, 31, 17, -20], [1090, 8, 27, 11, 30], [1210, 5, 36, 25, -36]];
    return flakes.map(([x, r, secs, wait, drift]) => `<div class="nt-flake" style="left:${x}px;width:${r}px;height:${r}px;--drift:${drift}px;animation-duration:${secs}s;animation-delay:-${wait}s"></div>`).join('');
  }
  // A clear night: a few stars, three of them a little brighter. Under cloud only the brightest show.
  const stars = [[110, 90, 1.8], [300, 170, 1.4], [450, 60, 1.6], [640, 40, 1.3], [820, 110, 1.8], [1010, 70, 1.4], [1170, 150, 1.7], [210, 300, 1.3], [1100, 290, 1.4], [720, 460, 1.2], [60, 430, 1.3], [1230, 400, 1.3]];
  const some = kind === 'cloud' ? stars.slice(0, 3) : stars;
  return `<svg class="nt-beads" viewBox="0 0 1280 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
    <g fill="${kind === 'cloud' ? '#3A3F4E' : '#6E7488'}">${some.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('')}</g>
    ${kind === 'cloud' ? '' : '<g fill="#8E94A8" opacity=".7"><circle cx="560" cy="150" r="2.2"/><circle cx="900" cy="230" r="2"/><circle cx="180" cy="200" r="2"/></g>'}</svg>`;
}

export function mount(el) {
  const c = clockParts();
  // "Clock only" (Settings → Clock & night): no weather or calendar lines, for a screen that
  // faces a bed. A ringing timer still says so.
  const clockOnly = display().nightStyle === 'clock';
  // Opened by hand in the daytime (Settings → "See the night clock"): a tap goes back there.
  const byHand = !isNight();
  const cameFrom = location.hash;

  el.innerHTML = `
  <style>
    .nt-root{position:absolute;top:0;right:0;bottom:0;left:0;background:#07080D;color:${INK};cursor:pointer;overflow:hidden;
      -webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none}
    /* Everything sits on one sheet a little bigger than the screen, so the whole picture
       can step a few pixels now and then (burn-in) without showing an edge. */
    .nt-move{position:absolute;top:-24px;right:-24px;bottom:-24px;left:-24px}
    .nt-scene,.nt-beads{position:absolute;top:0;left:0;width:100%;height:100%}
    /* Tomorrow's sun, waiting below the hills: brighter when tomorrow is fair. (Still: a big
       glow that breathes all night costs the weak graphics chip a repaint every frame.) */
    .nt-dawn{position:absolute;left:0;right:0;bottom:0;height:290px;opacity:.16;
      background:radial-gradient(760px 250px at 30% 100%,rgba(201,140,70,.5),rgba(201,140,70,0) 70%)}
    .nt-dawn.fair{opacity:.46}
    .nt-sky{position:absolute;top:0;right:0;bottom:0;left:0}
    .nt-drip{position:absolute;top:0;width:3px;border-radius:2px;background:linear-gradient(180deg,rgba(150,170,200,0),rgba(150,170,200,.46));
      will-change:transform;animation:nt-drip linear infinite}
    .nt-flake{position:absolute;top:-20px;border-radius:50%;background:rgba(190,200,220,.5);will-change:transform;animation:nt-snow linear infinite}
    @keyframes nt-drip{0%{transform:translateY(-90px);opacity:0}10%{opacity:.7}100%{transform:translateY(880px);opacity:.5}}
    @keyframes nt-snow{0%{transform:translate3d(0,0,0)}100%{transform:translate3d(var(--drift,30px),900px,0)}}

    .nt-wrap{position:absolute;top:24px;right:24px;bottom:24px;left:24px;display:flex;flex-direction:column;align-items:center}
    .nt-mid{margin-top:128px;display:flex;flex-direction:column;align-items:center;flex:none}
    .nt-time{font-size:250px;font-weight:200;line-height:1;letter-spacing:-6px;white-space:nowrap;font-variant-numeric:tabular-nums}
    .nt-ampm{font-size:54px;letter-spacing:0;margin-left:18px;font-weight:300;color:${INK_2}}
    .nt-date{font-size:26px;font-weight:500;letter-spacing:6px;text-transform:uppercase;color:${INK_2};margin-top:10px;white-space:nowrap}
    /* What the night and the morning hold. Kept clear of the bottom corners. */
    .nt-day{position:absolute;left:120px;right:120px;bottom:104px;display:flex;flex-direction:column;align-items:center;text-align:center;color:${INK_2}}
    .nt-line{display:flex;align-items:center;justify-content:center;max-width:100%;min-height:40px;font:500 25px/1.2 Inter,system-ui,sans-serif;white-space:nowrap}
    .nt-line+.nt-line{margin-top:10px}
    .nt-bit{display:flex;align-items:center;min-width:0}
    .nt-bit+.nt-bit{margin-left:48px}
    .nt-bit b{font-weight:600;color:${INK}}
    .nt-cut{min-width:0;overflow:hidden;text-overflow:ellipsis}
    .nt-ring{display:none;position:absolute;left:120px;right:120px;bottom:96px;height:118px;box-sizing:border-box;padding:0 48px;border-radius:28px;background:#C2491F;color:#FFFFFF;
      flex-direction:column;align-items:center;justify-content:center;text-align:center}
    .nt-ring b{font-size:40px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:940px}
    .nt-ring span{font-size:24px;font-weight:600}
    .nt-foot{position:absolute;left:300px;right:300px;bottom:34px;text-align:center;font:500 18px Inter,system-ui,sans-serif;color:${INK_2};white-space:nowrap}
    @media (prefers-reduced-motion: reduce){
      .nt-drip,.nt-flake{animation:none;display:none}
    }
  </style>
  <div class="nt-root display" data-tap-anywhere aria-label="Night clock">
    <div class="nt-move" data-shift>
      ${SCENE}
      <div class="nt-dawn" data-dawn></div>
      <div class="nt-sky" data-sky aria-hidden="true"></div>
      <div class="nt-wrap">
        <div class="nt-mid">
          <div class="nt-time"><span data-time>${c.time}</span><span data-ampm class="nt-ampm">${c.ampm}</span></div>
          <div class="nt-date" data-date>${c.date}</div>
        </div>
        <div class="nt-day" data-daybox${clockOnly ? ' style="display:none"' : ''}>
          <div class="nt-line" data-weather-line>&nbsp;</div>
          <div class="nt-line"><span data-first-time style="flex:none"></span><span class="nt-cut" data-first>&nbsp;</span><span data-first-more style="flex:none;margin-left:14px"></span></div>
        </div>
        <div class="nt-ring" data-ring><b data-ring-names>Time’s up!</b><span>Tap to stop</span></div>
        <div class="nt-foot" data-mode></div>
      </div>
    </div>
  </div>`;

  const $ = (s) => el.querySelector(s);
  if (!c.ampm) $('[data-ampm]').style.display = 'none';

  // The small line at the foot: what this screen is doing.
  function renderTop() {
    const s = display();
    const h = new Date().getHours();
    let mode;
    if (isNight()) mode = `Dimmed until ${hourText(s.nightTo)}`;
    else if (!byHand && h >= 4 && h < 12) mode = 'Good morning'; // the night just ended; Home follows shortly
    else mode = s.night ? `Comes on at ${hourText(s.nightFrom)}` : 'Switched off in Settings';
    $('[data-mode]').textContent = mode;
  }

  // The window: what is falling outside, and how bright tomorrow's sun waits. Drawn again
  // only when the weather changes kind, so the drops never start over for nothing.
  let lastWeather = null;
  let skyShown = '';
  function renderSky() {
    if (!el.isConnected) return;
    const w = fresh(lastWeather) ? lastWeather : savedWeather();
    const kind = skyFor(w);
    if (kind !== skyShown) { skyShown = kind; $('[data-sky]').innerHTML = skyLayer(kind); }
    const next = dayForecast(lastWeather, comingDay().date) || dayForecast(savedWeather(), comingDay().date);
    $('[data-dawn]').classList.toggle('fair', !!next && (next.kind === 'sun' || next.kind === 'partly'));
  }

  // What it is doing outside now, the coming day's weather and its first calendar item.
  function renderDay() {
    if (!el.isConnected) return;
    renderSky();
    if (clockOnly) return;
    const day = comingDay();
    const today = day.word === 'Today';
    const first = firstUp(day.date, today);
    $('[data-first-time]').textContent = first.none ? '' : `${day.word}: ${first.time}`;
    $('[data-first]').textContent = !first.none ? first.title : `${first.title} ${today ? 'today' : 'tomorrow'}`;
    $('[data-first-more]').textContent = first.more;
    const now = nowWords(fresh(lastWeather) ? lastWeather : savedWeather());
    const f = dayForecast(lastWeather, day.date) || dayForecast(savedWeather(), day.date);
    const dark = new Date().getHours() < 6 || new Date().getHours() >= 18;
    const bits = [];
    if (now) bits.push(`<span class="nt-bit">${icon(now.kind === 'sun' && dark ? 'moon' : now.kind)}${esc(now.text)}</span>`);
    bits.push(f ? `<span class="nt-bit">${icon(f.kind)}<span>${day.word} <b>${esc(f.text.charAt(0).toLowerCase() + f.text.slice(1))}</b></span></span>`
      : '<span class="nt-bit">No forecast just now</span>');
    $('[data-weather-line]').innerHTML = bits.join('');
  }

  // Burn-in: nudge the whole picture to the next spot every few minutes.
  function shift() {
    const n = Math.floor(Date.now() / (SHIFT_MINUTES * 60 * 1000)) % SHIFT.length;
    $('[data-shift]').style.transform = `translate(${SHIFT[n][0]}px,${SHIFT[n][1]}px)`;
  }

  // A timer ringing in the night must be impossible to miss, and a tap must stop it rather
  // than walking off to Home and leaving it ringing.
  let ringShown = false;
  function renderRing() {
    if (!el.isConnected) return;
    const r = ringingNow();
    const on = !!r;
    if (on) $('[data-ring-names]').textContent = r.names ? `Time’s up · ${r.names}` : 'Time’s up!';
    if (on === ringShown) return;
    ringShown = on;
    $('[data-ring]').style.display = on ? 'flex' : 'none';
    $('[data-daybox]').style.display = on || clockOnly ? 'none' : 'flex';
    renderTop();
  }

  let word = '';
  function tick() {
    if (!el.isConnected) return;
    const n = clockParts();
    $('[data-time]').textContent = n.time;
    $('[data-ampm]').textContent = n.ampm;
    $('[data-date]').textContent = n.date;
    shift();
    renderTop();
    // Midnight and noon: the bottom row moves on to the next day.
    const w = comingDay().word + new Date().toDateString();
    if (w !== word) { word = w; renderDay(); } else renderSky();
  }
  // On the minute, not every few seconds: the screen is up all night, and the clock should
  // never be up to ten seconds late either.
  function schedule() {
    clearTimeout(tickTimer);
    const now = new Date();
    tickTimer = setTimeout(() => { tick(); schedule(); }, (60 - now.getSeconds()) * 1000 - now.getMilliseconds() + 50);
  }
  tick();
  schedule();
  renderRing();
  // A ringing timer has no event of its own: look every few seconds (reading, not drawing).
  ringTimer = setInterval(renderRing, 3000);

  // The screen was switched off or the page sat in the background: catch up at once.
  offVisible = () => { if (document.visibilityState === 'visible' && el.isConnected) { tick(); schedule(); renderRing(); } };
  document.addEventListener('visibilitychange', offVisible);

  // Tap anywhere: stop a ringing timer, otherwise leave.
  $('[data-tap-anywhere]').addEventListener('click', () => {
    const r = ringingNow();
    if (r) { timerSvc.stopAllRinging(); setTimeout(renderRing, 60); return; }
    if (byHand && history.length > 1) {
      history.back();
      // Nothing to go back to (opened straight from a link): Home instead.
      clearTimeout(backTimer);
      backTimer = setTimeout(() => { if (location.hash === cameFrom) location.hash = '#/home'; }, 400);
    } else location.hash = '#/home';
  });

  async function loadWeather() {
    try {
      const w = await getWeather(await getLocation());
      lastWeather = w;
    } catch (err) {
      console.error(err); // offline: renderDay falls back to the last saved forecast
    }
    renderDay();
  }
  // The clock stays up all night: refresh the forecast and calendar now and then.
  // (Nothing is fetched when only the clock is shown: the window then goes by the last
  // weather this screen read, while that is recent.)
  if (!clockOnly) {
    loadWeather();
    refreshTimer = setInterval(loadWeather, REFRESH_MS);
  }
}

export function unmount() {
  clearTimeout(tickTimer);
  clearInterval(refreshTimer);
  clearInterval(ringTimer);
  clearTimeout(backTimer);
  if (offVisible) document.removeEventListener('visibilitychange', offVisible);
  offVisible = null;
}
