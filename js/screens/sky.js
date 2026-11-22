// Tom · Tonight's sky (Sky.dc.html in the design)
// Everything is worked out on the screen itself (js/services/astro.js): planets, the Moon,
// the Sun's times, a famous constellation and ISS flyovers. Only the ISS orbit (CelesTrak)
// and the cloud cover (Open-Meteo) come from the network.
//
// The chart is a view looking straight up: the middle is overhead, the edge is the
// horizon, and the rings are 60° and 30° above the horizon. It shows "tonight":
// from dark (Sun 6° below the horizon) until 11 PM (at least 3 hours).
// A button switches to tomorrow night; tapping the Space Station row lists the next passes.
import { getLocation } from '../services/location.js';
import { getIssPassInfo, getCloudCover, fmtTime, passDay } from '../services/space.js';
import { position, sunAlt, moonPhase, compass, CONSTELLATIONS, planetEcliptic, sunDistance, sunTimes, nextRiseSet, nextMoonPhase, altWords } from '../services/astro.js';
import { getCrew, brightnessWords } from '../services/iss.js';
import { showerNear } from '../services/skyalert.js';
import { hourText } from '../services/display.js';

let timer, refreshTimer, backTimer;
let ctx = null; // { el, loc, sample, passes, known, clouds, crew, day, memo }
let onPlace = null, onDisplay = null;

const STEP = 10 * 60000;
const R = 228; // chart radius in px (inside the 2px border)
const PLANETS = [
  { id: 'venus', name: 'VENUS', color: '#FFF3D6', dot: 16, minAlt: 5, hint: 'THE BRIGHTEST "STAR" IN THE SKY' },
  { id: 'jupiter', name: 'JUPITER', color: '#FFB547', dot: 16, minAlt: 10, hint: 'VERY BRIGHT, STEADY, NO TWINKLE' },
  { id: 'mars', name: 'MARS', color: '#FF8A65', dot: 12, minAlt: 10, hint: 'A STEADY ORANGE-RED DOT' },
  { id: 'saturn', name: 'SATURN', color: '#E9E4D6', dot: 12, minAlt: 10, hint: 'A STEADY, PALE GOLD "STAR"' },
  { id: 'mercury', name: 'MERCURY', color: '#C9C2B5', dot: 10, minAlt: 5, hint: 'LOW DOWN IN THE TWILIGHT GLOW' },
];
const ISS_SOON = 20 * 60000; // redraw often from 20 min before a flyover until it ends
const GLARE = 12; // a planet closer than this many degrees to the Sun is lost in its glow

/** Cloud cover in plain words. */
function skyWords(pct) {
  return pct < 20 ? 'CLEAR SKIES' : pct < 45 ? 'MOSTLY CLEAR' : pct < 70 ? 'PARTLY CLOUDY'
    : pct < 90 ? 'MOSTLY CLOUDY' : 'OVERCAST';
}

// ---------------------------------------------------------------- time helpers
// All built from the system's own time wording, so the owner's 12/24-hour choice is followed.
/** "9 PM" on the hour, else "9:40 PM" (or "21:00" / "21:40"). */
const hr = (d) => (d.getMinutes() ? fmtTime(d) : hourText(d.getHours()).toUpperCase());
const noAmPm = (s) => s.replace(/\s?[AP]M$/, '');
const ampm = (d) => (/[AP]M$/.exec(hr(d)) || [''])[0];
/** "7–10 PM", "11 PM–1 AM", "19:00–22:00" */
const range = (a, b) => (ampm(a) && ampm(a) === ampm(b) ? `${noAmPm(hr(a))}–${hr(b)}` : `${hr(a)}–${hr(b)}`);
const roundTo = (t, ms) => new Date(Math.round(t / ms) * ms);
const weekday = (d) => d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
const dayName = (d, now = new Date()) => {
  const days = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
  if (days === 0) return 'TONIGHT';
  if (days === 1) return 'TOMORROW';
  if (days < 7) return weekday(d);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
};

/** When "tonight" is: from dark until 11 PM (at least 3 hours), or now until dawn after midnight. */
function tonight(now, lat, lon) {
  const alt = (t) => sunAlt(t, lat, lon);
  const find = (from, hours, pred) => {
    for (let m = 0; m <= hours * 60; m += 5) {
      const t = new Date(from.getTime() + m * 60000);
      if (pred(alt(t))) return t;
    }
    return null;
  };
  const noon = new Date(now); noon.setHours(12, 0, 0, 0);
  const dusk = find(noon, 14, (a) => a < -6);
  let start, end;
  if (now < noon && alt(now) < -6) {
    start = now;
    end = find(now, 12, (a) => a > -6) || new Date(now.getTime() + 3 * 3600000);
  } else {
    start = new Date(Math.max(now, dusk || noon.getTime() + 10 * 3600000));
    const bedtime = new Date(dusk || start); bedtime.setHours(23, 0, 0, 0);
    end = new Date(Math.max(start.getTime() + 3 * 3600000, bedtime));
    const dawn = find(start, 16, (a) => a > -6);
    if (dawn && dawn > start && dawn < end) end = dawn;
  }
  if (end - start < STEP) end = new Date(start.getTime() + 3 * 3600000);
  return { dusk, start, end };
}

// ---------------------------------------------------------------- sky maths
function track(body, times, lat, lon) {
  return times.map((t) => position(body, t, lat, lon));
}

/** Visible stretch of a track: first/last sample above minAlt and the highest one. */
function summarize(trk, minAlt) {
  let a = -1, b = -1, best = -1;
  trk.forEach((p, k) => {
    if (p.alt < minAlt) return;
    if (a < 0) a = k;
    b = k;
    if (best < 0 || p.alt > trk[best].alt) best = k;
  });
  return a < 0 ? null : { a, b, best: trk[best], bestK: best, first: trk[a] };
}

function whenText(times, s, night) {
  const n = times.length - 1;
  const ta = roundTo(times[s.a], STEP), tb = roundTo(times[s.b], STEP);
  if (s.a === 0 && s.b === n) return night ? 'ALL NIGHT' : 'ALL EVENING';
  if (s.a === 0) return `UNTIL ${hr(tb)}`;
  if (s.b === n) return `AFTER ${hr(ta)}`;
  return range(ta, tb);
}

/** "SOUTHEAST, HALFWAY UP" (short compass words when it would not fit). */
function whereText({ alt, az }) {
  const h = altWords(alt);
  if (h === 'OVERHEAD') return 'OVERHEAD';
  const long = `${compass(az)}, ${h}`;
  return long.length > 20 ? `${compass(az, true)}, ${h}` : long;
}

/** The evening (noon of the day the night starts) that a window belongs to. */
function eveningOf(win) {
  const eve = new Date(win.start);
  if (eve.getHours() < 12) eve.setDate(eve.getDate() - 1);
  eve.setHours(12, 0, 0, 0);
  return eve;
}

function compute(loc, now = new Date()) {
  const { lat, lon } = loc;
  const win = tonight(now, lat, lon);
  const times = [];
  for (let t = win.start.getTime(); t <= win.end.getTime(); t += STEP) times.push(new Date(t));
  const night = win.start.getHours() < 12;
  // The chart shows the sky right now if it's dark, otherwise an hour into the evening.
  const ref = now >= win.start && now <= win.end ? now
    : new Date(Math.min(win.start.getTime() + 3600000, win.end.getTime()));

  const marks = [];
  const planets = [];
  for (const p of PLANETS) {
    const s = summarize(track(p.id, times, lat, lon), p.minAlt);
    const glare = sunDistance(p.id, times[s ? s.bestK : 0]) < GLARE;
    const mag = planetEcliptic(p.id, ref).mag;
    if (s && !glare) {
      // late: only comes up in the last part of the evening (it rises near bedtime).
      const late = s.a > (times.length - 1) * 0.6;
      planets.push({ id: p.id, name: p.name, hint: p.hint, mag, late, first: s.first, firstT: times[s.a], whenRaw: whenText(times, s, night),
        where: whereText(s.best), when: whenText(times, s, night), color: p.color === '#FFB547' ? p.color : '#D7E6F0' });
    }
    const at = position(p.id, ref, lat, lon);
    if (at.alt > 0 && !glare && (s || at.alt > 5)) marks.push({ ...at, label: p.name, color: p.color, dot: p.dot, labelColor: p.id === 'jupiter' ? '#FFB547' : '#D7E6F0' });
  }
  // Brightest first, from tonight's real brightness; ones that only rise near bedtime go last.
  planets.sort((a, b) => (a.late - b.late) || (a.mag - b.mag));

  // Before dawn: a bright planet that is up in the morning but not in the evening.
  let dawn = null;
  {
    const eveDay = eveningOf(win);
    const mt = sunTimes(new Date(eveDay.getTime() + 86400000), lat, lon);
    if (mt.civilDawn) {
      for (const p of PLANETS) {
        if (planets.some((x) => x.id === p.id)) continue;
        const t0 = new Date(mt.civilDawn.getTime() - 90 * 60000);
        const ts = [0, 30, 60, 90].map((m) => new Date(t0.getTime() + m * 60000));
        const s = summarize(track(p.id, ts, lat, lon), p.minAlt);
        const mag = planetEcliptic(p.id, mt.civilDawn).mag;
        if (s && mag < 0 && sunDistance(p.id, mt.civilDawn) >= GLARE) {
          dawn = `BEFORE DAWN: ${p.name}, ${mag < -3 ? 'BRILLIANT' : 'BRIGHT'} IN THE ${compass(s.first.az)} FROM ${hr(roundTo(ts[s.a], STEP))}`;
          break;
        }
      }
    }
  }

  const phase = moonPhase(ref);
  const eve = eveningOf(win);
  const sun = sunTimes(eve, lat, lon);
  const morning = sunTimes(new Date(eve.getTime() + 86400000), lat, lon);
  // Moon rising/setting around tonight: from 3 hours before the window to the morning.
  const moonFrom = new Date(win.start.getTime() - 3 * 3600000);
  const moonUpAtStart = position('moon', win.start, lat, lon).alt > -0.833;
  const mrs = nextRiseSet('moon', moonFrom, lat, lon, 27);
  let moonWhen = '';
  if (moonUpAtStart && mrs.set && mrs.set > win.start) moonWhen = `SETS ${hr(roundTo(mrs.set, 60000))}`;
  else if (!moonUpAtStart && mrs.rise && mrs.rise > win.start) moonWhen = `RISES ${hr(roundTo(mrs.rise, 60000))}`;
  else if (moonUpAtStart && !mrs.set) moonWhen = 'UP ALL NIGHT';

  let moon = null;
  const ms = summarize(track('moon', times, lat, lon), 5);
  if (ms && phase.fraction > 0.03) {
    moon = { name: 'MOON', hint: `${phase.name.toUpperCase()} · ${Math.round(phase.fraction * 100)}% LIT${moonWhen ? ' · ' + moonWhen : ''}`,
      where: whereText(ms.best), when: whenText(times, ms, night), color: '#D7E6F0', first: ms.first, whenRaw: whenText(times, ms, night) };
  }
  const mAt = position('moon', ref, lat, lon);
  if (mAt.alt > 0) marks.push({ ...mAt, label: 'MOON', color: '#E9E4D6', dot: 22, labelColor: '#D7E6F0' });

  // Most famous star pattern that climbs well above the horizon tonight.
  let constellation = null;
  for (const c of CONSTELLATIONS) {
    const s = summarize(track(c, times, lat, lon), 20);
    if (!s || s.best.alt < 30) continue;
    constellation = { name: c.name, hint: c.hint, where: whereText(s.best), when: whenText(times, s, night), color: '#D7E6F0', first: s.first };
    const at = position(c, ref, lat, lon);
    const later = position(c, new Date(ref.getTime() + 30 * 60000), lat, lon);
    if (at.alt > 3) marks.push({ ...at, label: `${c.name}${later.alt > at.alt && at.alt < 35 ? ' RISING' : ''}`, text: true });
    break;
  }

  // A meteor shower close to its peak.
  let shower = null;
  const sh = showerNear(new Date(win.start.getTime() + 3600000));
  if (sh) {
    const peak = sh.nights === 0 ? 'PEAKS TONIGHT' : sh.nights === -1 ? 'PEAKED LAST NIGHT' : sh.nights === 1 ? 'PEAKS TOMORROW NIGHT' : `PEAKS ${weekday(sh.date)} NIGHT`;
    const bright = phase.fraction > 0.5 && moon;
    shower = { name: `${sh.name} METEORS`, nights: sh.nights, rateNum: sh.rate,
      hint: bright ? `UP TO ${sh.rate} AN HOUR · THE BRIGHT MOON HIDES THE FAINT ONES` : `UP TO ${sh.rate} AN HOUR FROM A DARK SPOT`,
      where: 'ANYWHERE: LIE BACK', when: peak, color: '#D7E6F0' };
  }

  // Next full and new moon (whichever comes first goes first).
  const full = nextMoonPhase('full', ref), newm = nextMoonPhase('new', ref);

  return { win, times, ref, marks, planets, moon, constellation, shower, phase, sun, morning, eve, full, newm, dawn };
}

/** The one thing most worth going out for, in one plain sentence. */
function bestThing(sky, iss) {
  const dir = (p) => compass(p.az);
  const when = (w) => (/^\d/.test(w) ? `FROM ${w.replace('–', ' TO ')}` : w);
  if (iss && iss.tonight && iss.pass.maxAlt >= 25) {
    const p = iss.pass;
    return p.start <= Date.now() ? `THE SPACE STATION IS GOING OVER NOW: LOOK ${compass(p.endAz)}`
      : `THE SPACE STATION FLIES OVER AT ${fmtTime(p.start)}: LOOK ${compass(p.startAz)}`;
  }
  if (sky.shower && sky.shower.nights === 0 && sky.shower.rateNum >= 40) return `THE ${sky.shower.name.replace(' METEORS', '')} METEOR SHOWER PEAKS TONIGHT: BEST AFTER MIDNIGHT`;
  const planetLine = (p) => `${p.name} IS ${p.mag < -3 ? 'BRILLIANT' : 'BRIGHT'} IN THE ${dir(p.first)} ${when(p.whenRaw)}`;
  const early = sky.planets.find((x) => x.mag < 1.2 && !x.late);
  if (early) return planetLine(early);
  if (sky.moon && sky.phase.fraction >= 0.25) return `THE MOON IS ${Math.round(sky.phase.fraction * 100)}% LIT, IN THE ${dir(sky.moon.first)} ${when(sky.moon.whenRaw)}`;
  const late = sky.planets.find((x) => x.mag < 1.2);
  if (late) return planetLine(late);
  if (sky.constellation) return `LOOK FOR ${sky.constellation.name} IN THE ${dir(sky.constellation.first)}`;
  return 'NO BRIGHT PLANETS TONIGHT: A GOOD NIGHT FOR STARS';
}

// ---------------------------------------------------------------- rendering
const xy = ({ alt, az }) => {
  const r = ((90 - Math.max(alt, 0)) / 90) * R;
  return [230 + r * Math.sin((az * Math.PI) / 180), 230 - r * Math.cos((az * Math.PI) / 180)];
};

function markHTML(m, placed) {
  const [x, y] = xy(m);
  // Nudge a label down if another one already covers that spot (planets in conjunction, the
  // Moon next to a constellation name). Labels are about 10 px a letter.
  const w = m.label.length * 10 + (m.text ? 0 : m.dot + 8);
  const flip = m.text ? x > 300 : x > 330;
  const x0 = flip ? x - w : x, x1 = flip ? x : x + w;
  let shift = 0;
  while (placed.some((b) => x0 < b.x1 && x1 > b.x0 && Math.abs(b.y - (y + shift)) < 20) && shift < 80) shift += 20;
  placed.push({ x0, x1, y: y + shift });
  if (m.text) {
    const left = x > 300;
    return `<div style="position:absolute;${left ? `right:${460 - x}px` : `left:${x}px`};top:${y - 9 + shift}px;font-size:16px;color:#9CC3D5;white-space:nowrap">${m.label}</div>`;
  }
  const left = x > 330; // put the label on the inside so it stays within the circle
  return `<div style="position:absolute;${left ? `right:${460 - x - m.dot / 2}px` : `left:${x - m.dot / 2}px`};top:${y - m.dot / 2}px;display:flex;align-items:center;gap:8px;${left ? 'flex-direction:row-reverse' : ''}">
    <div style="width:${m.dot}px;height:${m.dot}px;border-radius:50%;background:${m.color};flex:none"></div>
    <span style="font-size:16px;color:${m.labelColor};white-space:nowrap;${shift ? `transform:translateY(${shift}px)` : ''}">${m.label}</span></div>`;
}

/** The pass to show for this night: one inside the night's window, else the next one at all. */
function issFor(sky, passes, day) {
  if (!passes?.length) return null;
  const now = Date.now();
  const after = day ? sky.win.start.getTime() - 3600000 : now;
  const tonightPass = passes.find((p) => p.end > after && p.start <= sky.win.end);
  if (tonightPass) return { pass: tonightPass, tonight: true };
  const next = passes.find((p) => p.end > after);
  return next ? { pass: next, tonight: false } : null;
}

function rowsFor(sky, iss, known, day) {
  let issRow = null;
  if (iss) {
    const p = iss.pass;
    const mins = Math.max(1, Math.round((p.end - p.start) / 60000));
    const now = Date.now();
    const until = Math.ceil((p.start - now) / 60000);
    const height = p.maxAlt >= 60 ? 'PASSES NEARLY OVERHEAD' : p.maxAlt >= 30 ? 'CLIMBS HALFWAY UP' : 'STAYS LOW IN THE SKY';
    let when;
    if (!iss.tonight) when = passDay(p.start);
    else if (p.start <= now) when = 'RIGHT NOW!';
    else if (until <= 60) when = `IN ${Math.max(1, until)} MIN · ${fmtTime(p.start)}`;
    else when = fmtTime(p.start);
    issRow = {
      name: 'ISS FLYOVER', color: '#5CE1E6', live: iss.tonight && until <= 60, iss: true,
      hint: iss.tonight ? `${height} · ${mins} MIN · ${brightnessWords({ visRange: p.minRange })}` : `NO FLYOVER ${day ? 'THAT NIGHT' : 'TONIGHT'} · NEXT ONE`,
      where: `${compass(p.startAz, true)} → ${compass(p.endAz, true)}`,
      when,
    };
  } else {
    issRow = { name: 'ISS FLYOVER', color: '#5CE1E6', iss: true,
      hint: known === null ? 'WORKING OUT FLYOVER TIMES…' : known ? 'NONE YOU CAN SEE IN THE NEXT 3 DAYS' : 'FLYOVER TIMES UNAVAILABLE RIGHT NOW',
      where: '—', when: known === null ? '…' : known ? 'CHECK AGAIN SOON' : 'TRYING AGAIN HOURLY' };
  }
  const others = [sky.shower, sky.moon, sky.constellation].filter(Boolean);
  const room = Math.max(0, 5 - others.length - 1);
  return [issRow, ...sky.planets.slice(0, room), ...others].slice(0, 5);
}

function cloudAverage(clouds, win) {
  if (!clouds) return null;
  const vals = clouds.time.map((t, k) => (t >= win.start - 1800000 && t <= win.end ? clouds.cloud[k] : null))
    .filter((v) => typeof v === 'number');
  return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
}

/** The night's sky maths changes slowly: worked out at most every 5 minutes (it takes a moment). */
function skyFor(c) {
  const now = new Date();
  const at = c.day ? (() => { const d = new Date(now); d.setDate(d.getDate() + 1); d.setHours(12, 0, 0, 0); return d; })() : now;
  const key = `${c.loc.lat},${c.loc.lon},${c.day},${Math.floor(now / (5 * 60000))}`;
  if (!c.memo || c.memo.key !== key) c.memo = { key, sky: compute(c.loc, at) };
  return c.memo.sky;
}

function render() {
  const { el, loc, passes, clouds, known, day } = ctx;
  const $ = (s) => el.querySelector(s);
  const sky = skyFor(ctx);
  const iss = issFor(sky, passes, day);

  // Title and the day button
  const town = loc.town ? ` OVER ${loc.town.toUpperCase()}` : '';
  $('[data-title]').textContent = `${day ? 'TOMORROW NIGHT' : "TONIGHT'S SKY"}${town}${ctx.sample ? ' · SAMPLE PLACE' : ''}`;
  $('[data-day]').textContent = day ? '◂ TONIGHT' : 'TOMORROW NIGHT ▸';

  // Header: clouds, with their age when the forecast is old
  const cloudAvg = cloudAverage(clouds, sky.win);
  let sub = '';
  if (cloudAvg != null) {
    sub = `${skyWords(cloudAvg)} ${day ? 'FORECAST' : 'TONIGHT'}`;
    if (clouds.at && Date.now() - clouds.at > 3 * 3600000) sub += ` · AS OF ${passDay(new Date(clouds.at)).replace(/^(TODAY|TONIGHT) /, '')}`;
  }
  $('[data-sub]').textContent = sub;

  // The Sun's evening, and the Moon's month
  const s = sky.sun, m = sky.morning;
  const sunBits = [];
  if (!s.sunset && sunAlt(sky.eve, loc.lat, loc.lon) > 0) sunBits.push('THE SUN DOESN’T SET TONIGHT');
  else if (!s.sunset && !s.sunrise) sunBits.push('THE SUN STAYS DOWN ALL DAY');
  else if (s.sunset) sunBits.push(`SUNSET ${fmtTime(s.sunset)}`);
  if (s.sunset || (!s.sunrise && !s.sunset)) sunBits.push(s.darkStart ? `FULLY DARK ${fmtTime(s.darkStart)}` : 'NEVER FULLY DARK');
  $('[data-sun]').textContent = sunBits.join(' · ');
  const phases = [['FULL MOON', sky.full], ['NEW MOON', sky.newm]].filter(([, d]) => d).sort((a, b) => a[1] - b[1])
    .map(([n, d]) => `${n} ${dayName(d)}`);
  $('[data-moons]').textContent = [m.sunrise ? `SUNRISE ${fmtTime(m.sunrise)}` : '', ...phases].filter(Boolean).join(' · ');
  const dawnEl = $('[data-dawn]');
  dawnEl.textContent = sky.dawn || '';
  dawnEl.style.display = sky.dawn ? '' : 'none';

  // Chart
  let path = '';
  if (iss?.tonight) {
    const pts = iss.pass.path.map((p) => xy(p).map((v) => v.toFixed(1)).join(',')).join(' ');
    const [sx, sy] = xy(iss.pass.path[0]);
    const [ex, ey] = xy(iss.pass.path[iss.pass.path.length - 1]);
    path = `<svg width="460" height="460" viewBox="0 0 460 460" style="position:absolute;left:0;top:0;overflow:visible">
        <polyline points="${pts}" fill="none" stroke="#5CE1E6" stroke-width="2"/>
        <circle cx="${ex}" cy="${ey}" r="4" fill="#5CE1E6"/>${issNow(iss.pass)}</svg>
      <div style="position:absolute;${sx > 300 ? `right:${460 - sx}px` : `left:${Math.max(4, sx - 10)}px`};top:${sy + (sy < 230 ? 18 : -38)}px;font-size:16px;color:#5CE1E6;white-space:nowrap">ISS PATH ${fmtTime(iss.pass.start)}</div>`;
  }
  const placed = [];
  $('[data-marks]').innerHTML = path + sky.marks.map((mk) => markHTML(mk, placed)).join('');
  // Say clearly when the chart isn't "right now" (in the daytime it shows the evening sky).
  const live = Math.abs(sky.ref - Date.now()) < 6 * 60000 && !day;
  $('[data-ref]').textContent = live ? 'SKY RIGHT NOW' : `SKY ${day ? 'TOMORROW' : 'TONIGHT'} AT ${fmtTime(roundTo(sky.ref.getTime(), 5 * 60000))}`;
  $('[data-phase]').textContent = `${sky.phase.name.toUpperCase()} · ${Math.round(sky.phase.fraction * 100)}% LIT`;

  // The best thing tonight, in one sentence
  $('[data-best]').textContent = bestThing(sky, iss);

  // List
  const rows = rowsFor(sky, iss, known, day);
  $('[data-rows]').innerHTML = rows.length ? rows.map((o) => `
    <div class="sk-row${o.iss ? ' sk-tap' : ''}"${o.iss ? ' data-iss-open role="button"' : ''}${o.live ? ' style="border-color:#5CE1E6"' : ''}>
      <div style="min-width:0">
        <div class="sk-ox sk-ell" style="font-size:24px;font-weight:500;color:${o.color}">${o.name}${o.iss ? ' <span style="font-size:18px">▸</span>' : ''}</div>
        <div class="sk-clamp" style="font-size:16px;color:#9CC3D5;margin-top:2px;line-height:1.25">${o.hint || ''}</div>
      </div>
      <div style="min-width:0;display:flex;flex-direction:column;gap:6px">
        <div class="sk-ell" style="font-size:17px"><span style="color:#9CC3D5">LOOK </span>${o.where}</div>
        <div class="sk-ell" style="font-size:17px${o.live ? ';color:#FFB547;font-weight:600' : ''}"><span style="color:#9CC3D5;font-weight:400">${o.iss || o.name.indexOf('METEORS') > 0 ? 'WHEN ' : 'BEST '}</span>${o.when}</div>
      </div>
    </div>`).join('')
    : '<div class="sk-row" style="grid-template-columns:1fr;font-size:17px;color:#9CC3D5">NOTHING BRIGHT IS UP TONIGHT — TRY STAR-SPOTTING!</div>';

  $('[data-tip]').textContent = cloudAvg != null && cloudAvg >= 70
    ? 'CLOUDY. IF THE CLOUDS BREAK, LOOK FOR THE MOON AND BRIGHT PLANETS FIRST — THEY SHINE THROUGH THIN CLOUD.'
    : 'TIP: GIVE YOUR EYES 15 MINUTES IN THE DARK. THE ISS LOOKS LIKE A BRIGHT, STEADY STAR MOVING FAST WITH NO BLINKING LIGHTS.';

  if (ctx.passList) renderPasses();

  // Is a flyover about to start (or happening)? Then the caller redraws every few seconds.
  return !!(iss?.tonight && iss.pass.start - Date.now() < ISS_SOON && iss.pass.end > Date.now());
}

/** A bright dot where the ISS is right now, while a flyover is happening. */
function issNow(pass) {
  const now = Date.now();
  if (now < pass.start || now > pass.end) return '';
  const k = Math.min(pass.path.length - 1, Math.max(0, Math.round((now - pass.start) / 30000)));
  const [x, y] = xy(pass.path[k]);
  return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="14" fill="none" stroke="#FFB547" stroke-width="2" class="sk-pulse"/>
    <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7" fill="#FFB547"/>`;
}

/** The Space Station panel: the next visible passes, where to look, and who is aboard. */
function renderPasses() {
  const { el, passes, known, crew } = ctx;
  const box = el.querySelector('[data-passes]');
  const now = Date.now();
  const list = (passes || []).filter((p) => p.end > now).slice(0, 5);
  const rows = list.map((p) => {
    const mins = Math.max(1, Math.round((p.end - p.start) / 60000));
    const until = Math.ceil((p.start - now) / 60000);
    const soon = p.start <= now ? 'GOING OVER NOW' : until <= 90 ? `STARTS IN ${until} MIN` : '';
    return `<div class="sk-pass">
      <div style="display:flex;justify-content:space-between;gap:16px;align-items:baseline">
        <div class="sk-ox" style="font-size:28px;font-weight:500;color:#5CE1E6">${passDay(new Date(p.start))}</div>
        <div style="font-size:20px;color:#FFB547;font-weight:600">${soon}</div>
      </div>
      <div style="font-size:19px;margin-top:6px">${mins} MIN · ${brightnessWords({ visRange: p.minRange })} · ${p.maxAlt >= 60 ? 'NEARLY OVERHEAD' : `${altWords(p.maxAlt)} AT ITS HIGHEST`}</div>
      <div style="font-size:18px;color:#9CC3D5;margin-top:4px">APPEARS ${compass(p.startAz)} → HIGHEST ${compass(p.maxAz)} → FADES ${compass(p.endAz)}</div>
    </div>`;
  }).join('');
  const crewLine = crew && crew.onIss
    ? `${crew.onIss} PEOPLE ABOARD${crew.names && crew.names.length ? ': ' + crew.names.join(', ').toUpperCase() : ''}`
    : '';
  box.querySelector('[data-pass-list]').innerHTML = rows
    || `<div class="sk-pass" style="font-size:20px">${known === null ? 'WORKING OUT THE FLYOVER TIMES…' : known ? 'NO PASSES YOU CAN SEE IN THE NEXT 3 DAYS. IT GOES OVER IN DAYLIGHT OR TOO LOW FOR NOW.' : 'FLYOVER TIMES ARE UNAVAILABLE RIGHT NOW. THE SCREEN TRIES AGAIN EVERY HOUR.'}</div>`;
  box.querySelector('[data-crew]').textContent = crewLine;
}

export function mount(el) {
  el.innerHTML = `
  <link rel="stylesheet" crossorigin href="https://fonts.googleapis.com/css2?family=Oxanium:wght@300;500;700&family=JetBrains+Mono:wght@400;600&display=swap">
  <style>
    .sk-root{width:1280px;height:800px;box-sizing:border-box;padding:24px 40px;background:#05070D;color:#D7E6F0;font-family:'JetBrains Mono',monospace;display:flex;flex-direction:column;gap:16px;position:relative}
    .sk-root a{color:#5CE1E6}
    .sk-ox{font-family:Oxanium,sans-serif}
    .sk-nsew{position:absolute;font-family:Oxanium,sans-serif;font-size:20px;color:#5CE1E6}
    .sk-row{border:1px solid #1E3A4A;background:#0A1220;display:grid;grid-template-columns:minmax(0,1fr) 270px;gap:14px;align-items:center;padding:8px 16px;min-height:56px}
    .sk-tap{cursor:pointer}
    .sk-tap:active{border-color:#5CE1E6}
    .sk-ell{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
    .sk-clamp{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
    .sk-btn{min-height:56px;padding:10px 20px;box-sizing:border-box;border:1px solid #1E3A4A;background:#0A1220;color:#5CE1E6;font-family:inherit;font-size:16px;letter-spacing:3px;display:flex;align-items:center;flex:none;text-decoration:none;cursor:pointer}
    .sk-btn:active{border-color:#5CE1E6}
    .sk-pass{border:1px solid #1E3A4A;background:#0A1220;padding:14px 20px}
    @keyframes sk-pulse{0%{opacity:1}100%{opacity:.15}}
    .sk-pulse{animation:sk-pulse 2s steps(2) infinite}
  </style>
  <div class="sk-root">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:20px;border-bottom:1px solid #1E3A4A;padding-bottom:12px">
      <div style="display:flex;align-items:center;gap:16px;min-width:0">
        <a href="#/bridge" class="sk-btn">◂ DECK</a>
        <div data-title class="sk-ox sk-ell" style="font-size:24px;font-weight:700;letter-spacing:5px;color:#5CE1E6">TONIGHT'S SKY</div>
      </div>
      <div style="display:flex;align-items:center;gap:16px;flex:none">
        <div data-sub style="font-size:16px;letter-spacing:2px;color:#9CC3D5">LOCATING…</div>
        <button data-day class="sk-btn">TOMORROW NIGHT ▸</button>
      </div>
    </div>
    <div style="flex-grow:1;display:grid;grid-template-columns:540px minmax(0,1fr);gap:24px;min-height:0">
      <div style="border:1px solid #1E3A4A;background:#0A1220;display:flex;flex-direction:column;align-items:center;justify-content:space-between;padding:12px 16px;box-sizing:border-box;min-height:0">
        <div style="text-align:center;display:flex;flex-direction:column;gap:4px">
          <div data-sun style="font-size:17px;letter-spacing:0;white-space:nowrap;color:#D7E6F0"></div>
          <div data-moons style="font-size:16px;letter-spacing:0;white-space:nowrap;color:#9CC3D5"></div>
        </div>
        <div style="position:relative;width:460px;height:460px;border-radius:50%;border:2px solid #5CE1E6;box-sizing:border-box;background:#070C18;flex:none">
          <div style="position:absolute;top:76px;right:76px;bottom:76px;left:76px;border-radius:50%;border:1px solid #1E3A4A"></div>
          <div style="position:absolute;top:152px;right:152px;bottom:152px;left:152px;border-radius:50%;border:1px solid #1E3A4A"></div>
          <div class="sk-nsew" style="left:50%;top:-1px;transform:translate(-50%,-100%)">N</div>
          <div class="sk-nsew" style="left:50%;bottom:-1px;transform:translate(-50%,100%)">S</div>
          <div class="sk-nsew" style="top:50%;right:-22px;transform:translateY(-50%)">E</div>
          <div class="sk-nsew" style="top:50%;left:-24px;transform:translateY(-50%)">W</div>
          <div data-marks style="position:absolute;top:-2px;right:-2px;bottom:-2px;left:-2px"></div>
        </div>
        <div style="display:flex;justify-content:space-between;width:100%;gap:12px">
          <div data-ref style="font-size:16px;letter-spacing:0;white-space:nowrap;color:#9CC3D5"></div>
          <div data-phase style="font-size:16px;letter-spacing:0;white-space:nowrap;color:#9CC3D5"></div>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;min-height:0;min-width:0">
        <div data-best class="sk-ox" style="font-size:26px;font-weight:500;line-height:1.2;color:#FFB547;letter-spacing:1px"></div>
        <div style="font-size:15px;letter-spacing:3px;color:#9CC3D5">WHAT TO LOOK FOR · NO TELESCOPE NEEDED</div>
        <div data-rows style="display:flex;flex-direction:column;gap:10px"></div>
        <div data-dawn style="display:none;font-size:17px;color:#FFB547;letter-spacing:1px"></div>
        <div data-tip style="margin-top:auto;border-left:4px solid #FFB547;background:#0A1220;padding:12px 18px;font-size:16px;line-height:1.4">TIP: GIVE YOUR EYES 15 MINUTES IN THE DARK. THE ISS LOOKS LIKE A BRIGHT, STEADY STAR MOVING FAST WITH NO BLINKING LIGHTS.</div>
      </div>
    </div>
    <div data-passes style="display:none;position:absolute;top:0;left:0;width:1280px;height:800px;box-sizing:border-box;padding:24px 40px;background:#05070D;flex-direction:column;gap:14px">
      <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #1E3A4A;padding-bottom:12px">
        <div class="sk-ox" style="font-size:26px;font-weight:700;letter-spacing:5px;color:#5CE1E6">SPACE STATION · NEXT PASSES YOU CAN SEE</div>
        <button data-pass-close class="sk-btn">CLOSE ✕</button>
      </div>
      <div data-pass-list style="display:flex;flex-direction:column;gap:10px;overflow-y:auto;min-height:0;flex:1"></div>
      <div data-crew style="font-size:18px;color:#9CC3D5;line-height:1.4"></div>
      <div style="font-size:16px;color:#9CC3D5">ONLY PASSES IN A DARK SKY WITH THE STATION LIT BY THE SUN ARE LISTED · TIMES CAN BE A MINUTE OR TWO OUT</div>
    </div>
  </div>`;

  ctx = { el, loc: null, sample: false, passes: null, known: null, clouds: null, crew: null, day: 0, memo: null, passList: false };
  const mine = ctx;
  const $ = (s) => el.querySelector(s);

  const tick = () => {
    if (ctx !== mine || !ctx.loc) return;
    const soon = render();
    clearTimeout(timer);
    // Things move: redraw every 5 min, or every 10 s around an ISS flyover so the
    // "IN 3 MIN" countdown and the ISS dot on the chart keep up.
    timer = setTimeout(tick, soon ? 10000 : 5 * 60000);
  };

  $('[data-day]').addEventListener('click', () => {
    ctx.day = ctx.day ? 0 : 1;
    clearTimeout(backTimer);
    // Left on "tomorrow", the screen goes back to tonight by itself after 3 minutes.
    if (ctx.day) backTimer = setTimeout(() => { if (ctx === mine) { ctx.day = 0; tick(); } }, 3 * 60000);
    tick();
  });
  $('[data-rows]').addEventListener('click', (e) => {
    if (!e.target.closest('[data-iss-open]')) return;
    ctx.passList = true;
    $('[data-passes]').style.display = 'flex';
    renderPasses();
  });
  $('[data-pass-close]').addEventListener('click', () => {
    ctx.passList = false;
    $('[data-passes]').style.display = 'none';
  });

  // The cloud forecast and ISS orbit are refreshed every hour while the screen stays open.
  const refresh = () => {
    const loc = ctx && ctx.loc;
    if (!loc) return;
    getCloudCover(loc).then((c) => { if (ctx === mine && ctx.loc === loc && c) { ctx.clouds = c; tick(); } }).catch(() => {});
    getIssPassInfo(loc, 72).then((r) => { if (ctx === mine && ctx.loc === loc) { ctx.passes = r.passes; ctx.known = r.known; tick(); } })
      .catch((err) => console.warn('iss', err));
    getCrew().then((c) => { if (ctx === mine) { ctx.crew = c; if (ctx.passList) renderPasses(); } }).catch(() => {});
  };

  const locate = async () => {
    let loc, sample = false;
    try {
      loc = await getLocation();
    } catch (err) {
      console.warn('location', err);
      loc = { lat: 39.95, lon: -75.17, town: 'Philadelphia' }; // sample place
      sample = true;
    }
    if (ctx !== mine) return;
    // A new place: forget everything worked out for the old one.
    ctx.loc = loc; ctx.sample = sample; ctx.memo = null; ctx.clouds = null; ctx.passes = null; ctx.known = null;
    tick();
    refresh();
  };

  // The town changed in Settings, or the 12/24-hour clock: work it all out again.
  onPlace = () => locate();
  onDisplay = () => { if (ctx === mine) { ctx.memo = null; tick(); } };
  window.addEventListener('place-changed', onPlace);
  window.addEventListener('display-changed', onDisplay);

  locate();
  refreshTimer = setInterval(refresh, 60 * 60000);
}

export function unmount() {
  clearTimeout(timer);
  clearTimeout(backTimer);
  clearInterval(refreshTimer);
  if (onPlace) window.removeEventListener('place-changed', onPlace);
  if (onDisplay) window.removeEventListener('display-changed', onDisplay);
  onPlace = onDisplay = null;
  ctx = null;
}
