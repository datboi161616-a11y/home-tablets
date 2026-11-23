// Kitchen · Weather. Three of the owner's picks in one screen:
//   - the weather as a painted street (clouds drift, the chimney smokes), with a line you
//     slide across it that wipes the picture into the hours to come (board KC07);
//   - the next 12 hours as a graph on a see-through band: a temperature line that draws
//     itself, rain bars that grow, a marker where the rain starts (KC08). The graph IS the
//     slider: slide along it, or tap an hour;
//   - how much daylight is left, on the sun's arc, and the days getting shorter or longer
//     until the solstice (KC11).
// Everything the old screen had is still here: the week (tap a day for its hours), "before
// you head out", wind / humidity / UV / rain, warnings, the "as of" note when the internet
// is off. "More" holds today in full, °F/°C, the town and "check again".
//
// The tablets' graphics are weak: the scene is CSS gradients and flat SVG; only transform
// and opacity are animated, and the wipe itself is two transforms (no clip-path, no width).
import { topBar, esc } from './ui.js';
import { settings } from '../config.js';
import { getLocation } from '../services/location.js';
import { describe } from '../services/weather.js';
import {
  getForecast, freshen, outlook, advice, rangeLine, fmtTime, fmtHour, deg, uvWord, windFrom, amountText, isoDay,
  sunInfo, spanText,
} from '../services/forecast-data.js';
import { wxIcon, wearArt } from '../art.js';
import { getAlertsInfo, whenText, kindText, alertColor } from '../services/weather-alerts.js';
import { saveFamily, canSaveFamily, onFamilyChanged } from '../services/family.js';
import { moonPhase } from '../services/astro.js';

let timer, retry, ticker, onPlace, offFamily, onRelease;

const DAYS = 6; // tomorrow and the five after it: the rest of the week
const W = 1280;          // the canvas
const SCENE_H = 470;     // the painted scene
const BAND_L = 36, BAND_W = 1208, BAND_H = 172, BAND_TOP = SCENE_H - 12 - BAND_H;
const COLS = 12;
const CW = BAND_W / COLS;
const colX = (i) => BAND_L + CW * (i + 0.5); // an hour's place across the screen

const dayName = (iso) => new Date(`${iso}T12:00`).toLocaleDateString('en-US', { weekday: 'short' });
const longDay = (iso) => new Date(`${iso}T12:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
const weekend = (iso) => { const d = new Date(`${iso}T12:00`).getDay(); return d === 0 || d === 6; };
const clock = (ms) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const timeOr = (iso) => (iso ? fmtTime(iso) : '--');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** "just now", "25 minutes ago", "3 hours ago", "yesterday 6:05 PM" */
function ageText(ms) {
  const min = Math.round((Date.now() - ms) / 60000);
  if (min < 2) return 'just now';
  if (min < 60) return `${min} minutes ago`;
  const hrs = Math.round(min / 60);
  if (hrs < 12 || new Date(ms).toDateString() === new Date().toDateString()) return hrs === 1 ? 'an hour ago' : `${hrs} hours ago`;
  const y = new Date(); y.setDate(y.getDate() - 1);
  const day = new Date(ms).toDateString() === y.toDateString() ? 'yesterday' : new Date(ms).toLocaleDateString('en-US', { weekday: 'long' });
  return `${day} ${clock(ms)}`;
}

// What to wear, read from the advice line (and the feels-like temperature).
function wearFor(text, f) {
  const t = String(text).toLowerCase();
  const w = [];
  if (/heavy coat|bundle up|coat and boots/.test(t)) w.push('coat');
  else if (/jacket/.test(t)) w.push('jacket');
  if (/umbrella/.test(t)) w.push('umbrella');
  if (/sunglasses|sunscreen/.test(t)) w.push('sunglasses');
  if (!w.length && f && f.feels != null && !/no coat/.test(t)) {
    const cold = settings.units === 'fahrenheit' ? f.feels <= 55 : f.feels <= 13;
    if (cold) w.push('jacket');
  }
  return w;
}

// =======================================================================================
// The painted street
// =======================================================================================
const rgb = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const mix = (a, b, t) => { const x = rgb(a), y = rgb(b); return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('')}`; };

// Sky, top to horizon, for every kind of weather by day, around sunrise/sunset, and by night.
const SKY = {
  day: {
    sun: ['#4E9BDB', '#9CCBEC', '#DDEBEE'], partly: ['#5B9DD2', '#A7CCE6', '#E2E8E4'], cloud: ['#7C8A9C', '#B9BFC4', '#D9CDB8'],
    fog: ['#A3ABB3', '#C6CACD', '#D8D8D2'], rain: ['#4C576A', '#6F7A89', '#8E949A'], storm: ['#2E3646', '#4A5466', '#5E6470'], snow: ['#8A97A8', '#BFC7D0', '#E2E6EA'],
  },
  dusk: {
    sun: ['#2A2A62', '#8A4F86', '#F2A166'], partly: ['#2F2E60', '#86557F', '#EBA06E'], cloud: ['#3A3D55', '#6E6577', '#B98C78'],
    fog: ['#55586A', '#807C86', '#A89A94'], rain: ['#2A3040', '#454B5C', '#6A6068'], storm: ['#1E2330', '#353B4A', '#4E4A54'], snow: ['#454C62', '#77788A', '#B3A3A6'],
  },
  night: {
    sun: ['#0A0F24', '#172142', '#2A3860'], partly: ['#0C1126', '#192240', '#2B3759'], cloud: ['#131926', '#232B3A', '#343C4B'],
    fog: ['#1C212C', '#2E3440', '#434852'], rain: ['#0D121C', '#1C2330', '#2A313E'], storm: ['#090C14', '#161B26', '#232934'], snow: ['#182030', '#2B364B', '#465166'],
  },
};
// How much the weather dims the street (on top of dusk and night).
const GLOOM = { sun: 0, partly: 0, cloud: 0.08, fog: 0.1, rain: 0.22, storm: 0.32, snow: 0.04 };
const NIGHT_INK = '#0E1422';
const STARS = [[120, 60], [220, 130], [330, 40], [470, 96], [560, 30], [650, 150], [760, 52], [1010, 44], [1090, 170], [1170, 90], [1240, 36], [60, 180], [900, 30], [400, 190]];

const cloudsSvg = (shapes, color, opacity) => `<svg width="1700" height="220" viewBox="0 0 1700 220" aria-hidden="true" style="display:block" fill="${color}" opacity="${opacity}">${shapes.map((e) => `<ellipse cx="${e[0]}" cy="${e[1]}" rx="${e[2]}" ry="${e[3]}"/>`).join('')}</svg>`;
const CLOUDS_A = [[300, 90, 180, 36], [370, 64, 110, 38], [760, 128, 200, 32], [690, 104, 100, 34], [1210, 80, 220, 40], [1290, 56, 130, 40]];
const CLOUDS_B = [[130, 150, 170, 28], [540, 62, 150, 30], [610, 42, 90, 30], [1000, 156, 210, 30], [1460, 120, 180, 34]];
const CLOUDS_FEW = [[330, 96, 150, 30], [400, 72, 90, 32], [1180, 70, 170, 32], [1250, 50, 100, 32]];

/**
 * The street for one moment. spec:
 *   kind   sun | partly | cloud | fog | rain | storm | snow
 *   phase  day | dusk | night
 *   frac   how far the sun is through its day, 0..1 (where to draw it)
 *   moon   { fraction, waxing } for the night sky
 *   month  0-11 (the tree, the pumpkins)
 *   id     makes the gradient names its own
 */
function sceneHtml(spec) {
  const { kind, phase, id } = spec;
  const sky = (SKY[phase] || SKY.day)[kind] || SKY[phase].cloud;
  const dim = clamp((phase === 'night' ? 0.6 : phase === 'dusk' ? 0.3 : 0) + (GLOOM[kind] || 0) * (phase === 'night' ? 0.3 : 1), 0, 0.72);
  const tone = (c) => mix(c, NIGHT_INK, dim);
  const snowy = kind === 'snow';
  const wet = kind === 'rain' || kind === 'storm';
  const clear = kind === 'sun' || kind === 'partly';
  const lit = phase !== 'day' || wet || kind === 'fog' || kind === 'snow';
  const m = spec.month;
  const winter = m === 11 || m <= 1, autumn = m === 9 || m === 10, green = m >= 3 && m <= 8;

  const lawn = snowy ? ['#EEF2F6', '#C8D2DD'] : green ? ['#7FA050', '#48682E'] : autumn ? ['#8A8448', '#57542E'] : ['#84865A', '#585C3C'];
  const hills = snowy ? '#DDE4EA' : green ? '#86A070' : '#8E9484';
  const street = snowy ? '#D5DBE2' : wet ? '#5E6670' : '#9A9488';
  const cloudTint = { partly: '#FFFFFF', cloud: '#E9ECEF', rain: '#5A6475', storm: '#3C4556', snow: '#D5DAE0', fog: '#D0D4D8', sun: '#FFFFFF' }[kind];
  const cloud = phase === 'night' ? mix(cloudTint, '#1A2030', 0.72) : phase === 'dusk' ? mix(cloudTint, '#5A4A6A', 0.45) : cloudTint;

  // --- the still part: one flat SVG ---
  const s = [];
  s.push(`<defs>
    <linearGradient id="wxL${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${tone(lawn[0])}"/><stop offset="1" stop-color="${tone(lawn[1])}"/></linearGradient>
    <radialGradient id="wxW${id}" cx="0.5" cy="0.5" r="0.8"><stop offset="0" stop-color="#FFE9B0"/><stop offset="1" stop-color="#F0A848"/></radialGradient>
    <radialGradient id="wxS${id}" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${phase === 'dusk' ? '#FFD08A' : '#FFF6CF'}" stop-opacity="0.9"/><stop offset="0.35" stop-color="${phase === 'dusk' ? '#FFA860' : '#FFF0B8'}" stop-opacity="0.4"/><stop offset="1" stop-color="#FFE9A0" stop-opacity="0"/></radialGradient>
  </defs>`);
  if (phase === 'night' && clear) s.push(`<g fill="#FFFFFF" opacity="0.8">${STARS.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="${i % 3 ? 1.6 : 2.2}"/>`).join('')}</g>`);
  if (phase !== 'night' && clear) {
    // The sun where it really is in its day: low at the ends, high at midday.
    const fr = clamp(spec.frac == null ? 0.5 : spec.frac, 0, 1);
    const x = 540 + fr * 460, y = 236 - Math.sin(Math.PI * fr) * 180;
    s.push(`<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="130" fill="url(#wxS${id})"/><circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="32" fill="${phase === 'dusk' ? '#FFD78E' : '#FFEFB0'}"/>`);
  }
  if (phase === 'night' && clear) {
    // The moon as it is tonight (the lit share, and which side).
    const k = spec.moon ? clamp(spec.moon.fraction, 0, 1) : 0.6;
    const r = 28, cx = 1010, cy = 118;
    const rx = (r * Math.abs(1 - 2 * k)).toFixed(1);
    s.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="#2A3552"/>`
      + `<path transform="translate(${cx} ${cy})${spec.moon && !spec.moon.waxing ? ' scale(-1 1)' : ''}" d="M0 ${-r}A${r} ${r} 0 0 1 0 ${r}A${rx} ${r} 0 0 ${k < 0.5 ? 0 : 1} 0 ${-r}Z" fill="#F4EEDC"/>`);
  }
  // far hills, lawn, street
  s.push(`<path d="M0 244Q320 208 660 232T1280 222V470H0Z" fill="${tone(hills)}" opacity="0.75"/>`);
  s.push(`<rect y="254" width="1280" height="216" fill="url(#wxL${id})"/>`);
  s.push(`<path d="M0 296Q640 268 1280 300V336Q640 300 0 328Z" fill="${tone(street)}"/>`);
  if (wet) s.push(`<g fill="${mix(sky[2], '#FFFFFF', 0.25)}" opacity="0.55"><ellipse cx="420" cy="302" rx="64" ry="5"/><ellipse cx="1060" cy="304" rx="80" ry="6"/><ellipse cx="1210" cy="322" rx="40" ry="4"/><ellipse cx="180" cy="322" rx="50" ry="4"/></g>`);
  // the tree
  s.push(`<path d="M598 290L606 178L592 146M606 178L630 140M602 222L574 190M604 204L642 178" stroke="${tone('#4A3626')}" stroke-width="9" fill="none" stroke-linecap="round"/>`);
  if (snowy) s.push('<g fill="#FFFFFF"><circle cx="592" cy="143" r="6"/><circle cx="630" cy="137" r="6"/><circle cx="574" cy="187" r="5"/><circle cx="642" cy="175" r="5"/></g>');
  else if (green) s.push(`<g fill="${tone('#4F7A36')}"><circle cx="606" cy="146" r="46"/><circle cx="574" cy="176" r="32"/><circle cx="640" cy="170" r="34"/></g>`);
  else if (autumn) s.push(`<g fill="${tone('#C86A2A')}"><circle cx="630" cy="138" r="7"/><circle cx="575" cy="188" r="6"/><circle cx="643" cy="176" r="5"/><circle cx="592" cy="144" r="5"/></g>`);
  // the house
  s.push(`<rect x="892" y="100" width="22" height="50" fill="${tone('#5B3226')}"/>`);
  s.push(`<rect x="700" y="170" width="260" height="98" fill="${tone('#D4C2A4')}"/>`);
  s.push(`<path d="M680 176L830 104L980 176Z" fill="${tone('#6E4034')}"/>`);
  if (snowy) s.push(`<path d="M680 176L830 104L980 176H956L830 119L704 176Z" fill="${tone('#F4F7FA')}"/><rect x="889" y="96" width="28" height="8" rx="4" fill="${tone('#F4F7FA')}"/>`);
  const win = lit ? `url(#wxW${id})` : tone('#8399AC');
  s.push(`<rect x="724" y="190" width="56" height="46" fill="${win}"/><rect x="880" y="190" width="56" height="46" fill="${win}"/>`);
  s.push(`<path d="M752 190V236M724 213H780M908 190V236M880 213H936" stroke="${tone('#6A5A44')}" stroke-width="4"/>`);
  s.push(`<rect x="806" y="200" width="48" height="68" fill="${tone('#5E3A2A')}"/><circle cx="845" cy="236" r="3" fill="#E8C070"/>`);
  s.push(`<rect x="688" y="264" width="284" height="10" fill="${tone(snowy ? '#E9EEF2' : '#8E7E66')}"/>`);
  if (autumn) s.push(`<ellipse cx="742" cy="262" rx="15" ry="12" fill="${tone('#E5732C')}"/><ellipse cx="764" cy="266" rx="10" ry="8" fill="${tone('#E89040')}"/>`);
  if (winter && !autumn) s.push(`<circle cx="830" cy="218" r="9" fill="none" stroke="${tone('#3E7D4E')}" stroke-width="5"/>`); // a wreath on the door
  if (kind === 'fog') s.push('<rect y="120" width="1280" height="350" fill="#D8DCDF" opacity="0.32"/>');

  // --- the moving part: a few whole layers, each moved by transform only ---
  let moving = '';
  if (kind === 'partly') moving += `<div class="wx-cloud" style="top:20px;animation-duration:90s">${cloudsSvg(CLOUDS_FEW, cloud, 0.9)}</div>`;
  else if (kind !== 'sun') {
    moving += `<div class="wx-cloud" style="top:6px;animation-duration:80s">${cloudsSvg(CLOUDS_A, cloud, kind === 'fog' ? 0.6 : 0.88)}</div>`
      + `<div class="wx-cloud" style="top:26px;animation-duration:115s;animation-direction:alternate-reverse">${cloudsSvg(CLOUDS_B, mix(cloud, sky[0], 0.3), kind === 'fog' ? 0.5 : 0.8)}</div>`;
  }
  if (kind === 'fog') moving += '<div class="wx-fog" style="top:150px"></div><div class="wx-fog" style="top:214px;animation-duration:70s;animation-direction:alternate-reverse"></div>';
  if (kind === 'storm') moving += '<div class="wx-flash"></div>';

  return `<div class="wx-sky" style="background:linear-gradient(180deg,${sky[0]} 0%,${sky[1]} 34%,${sky[2]} 56%)"></div>`
    + `<svg class="wx-still" width="${W}" height="${SCENE_H}" viewBox="0 0 ${W} ${SCENE_H}" aria-hidden="true">${s.join('')}</svg>${moving}`;
}

// The same "random" numbers every time, so a redraw looks the same.
const rnd = (i, salt) => { const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453; return x - Math.floor(x); };
// Rain and snow fall as two sheets each (two moving layers, not a dozen): a sheet is two
// screens tall, its lower half what shows, and its upper half the same drops shifted by one
// fall, so the loop has no seam.
const FALL = 480;
function sheetHtml(cls, n, salt, dx, secs, extra) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const x = Math.round((i + rnd(i, salt)) * ((W + Math.abs(dx)) / n));
    const y = Math.round(FALL + rnd(i, salt + 1) * FALL);
    const more = extra ? extra(i) : '';
    out.push(`<i class="${cls}" style="left:${x}px;top:${y}px;${more}"></i><i class="${cls}" style="left:${x - dx}px;top:${y - FALL}px;${more}"></i>`);
  }
  return `<div class="wx-sheetfall" style="--dx:${dx}px;animation-duration:${secs}s">${out.join('')}</div>`;
}
const rainHtml = () => sheetHtml('wx-drop', 6, 1, -110, 0.8) + sheetHtml('wx-drop', 6, 4, -110, 1.05);
const flake = (salt) => (i) => { const z = Math.round(6 + rnd(i, salt) * 6); return `width:${z}px;height:${z}px`; };
const snowHtml = () => sheetHtml('wx-flake', 6, 5, 40, 9, flake(7)) + sheetHtml('wx-flake', 6, 8, -30, 12.5, flake(9));

// Day, night, or the half hour either side of sunrise and sunset, for a moment of the forecast.
function sunAt(f, t, isDay) {
  const d = ((f && f.days) || []).find((x) => x.date === isoDay(new Date(t)));
  const rise = d && d.sunrise ? new Date(d.sunrise).getTime() : NaN;
  const set = d && d.sunset ? new Date(d.sunset).getTime() : NaN;
  if (!isFinite(rise) || !isFinite(set) || set <= rise) return { phase: isDay === false ? 'night' : 'day', frac: 0.5 };
  const near = 40 * 60000;
  const phase = Math.abs(t - rise) < near || Math.abs(t - set) < near ? 'dusk' : t > rise && t < set ? 'day' : 'night';
  return { phase, frac: (t - rise) / (set - rise) };
}

// =======================================================================================
// The screen
// =======================================================================================
const STYLE = `
  .wx { position:absolute; top:0; right:0; bottom:0; left:0; background:#161B27; color:#FFFFFF; overflow:hidden; font-family:Inter,system-ui,sans-serif; }
  .wx-scene { position:absolute; left:0; top:0; width:${W}px; height:${SCENE_H}px; overflow:hidden; background:#4C576A; }
  .wx-layer, .wx-sky, .wx-clip, .wx-clip > div { position:absolute; left:0; top:0; width:${W}px; height:${SCENE_H}px; }
  .wx-still { position:absolute; left:0; top:0; display:block; }
  .wx-clip { overflow:hidden; will-change:transform; }
  .wx-clip > div { will-change:transform; }
  .wx-snap .wx-clip, .wx-snap .wx-clip > div, .wx-snap .wx-seam, .wx-snap .wx-hi { transition:transform .22s ease-out; }
  .wx-cloud { position:absolute; left:-100px; will-change:transform; animation:wx-cloud 80s linear infinite alternate; }
  .wx-fog { position:absolute; left:-200px; width:1700px; height:64px; will-change:transform; animation:wx-cloud 55s linear infinite alternate;
    background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.5) 28%,rgba(255,255,255,.34) 68%,rgba(255,255,255,0)); border-radius:32px; }
  .wx-flash { position:absolute; left:0; top:0; width:100%; height:260px; background:linear-gradient(180deg,rgba(255,255,255,.75),rgba(255,255,255,0)); opacity:0; animation:wx-flash 9s linear infinite; }
  .wx-sheetfall { position:absolute; left:0; top:-${FALL}px; width:${W + 120}px; height:${FALL * 2}px; will-change:transform; animation:wx-fall 1s linear infinite; }
  .wx-drop { position:absolute; width:3px; height:26px; border-radius:2px; background:#C9D6E6; opacity:.7; transform:rotate(14deg); }
  .wx-flake { position:absolute; border-radius:50%; background:#FFFFFF; opacity:.9; }
  .wx-smoke { position:absolute; left:888px; top:76px; width:30px; height:30px; border-radius:50%; background:#E9ECEF; opacity:0; will-change:transform; animation:wx-smoke 7s ease-out infinite; }
  .wx-shade { position:absolute; left:0; top:0; width:100%; height:300px; background:linear-gradient(180deg,rgba(18,24,36,.62),rgba(18,24,36,.28) 60%,rgba(18,24,36,0)); pointer-events:none; }
  .wx-seam { position:absolute; left:-2px; top:0; width:4px; height:${SCENE_H}px; pointer-events:none; will-change:transform; }
  .wx-seam-line { position:absolute; left:0; top:0; width:4px; height:100%; transform-origin:50% 100%; background:linear-gradient(180deg,rgba(255,255,255,0),#FFFFFF 26%,#FFFFFF 86%,rgba(255,255,255,0)); animation:wx-seam 3s ease-in-out infinite; }
  .wx-knob { position:absolute; left:-24px; top:${BAND_TOP - 26}px; width:52px; height:52px; border-radius:50%; background:#FFFFFF; color:#2E3646; display:flex; align-items:center; justify-content:center; font:700 22px Inter,sans-serif; box-shadow:0 4px 14px rgba(0,0,0,.35); }
  .wx-top { position:absolute; left:32px; right:32px; top:24px; }
  .wx-top .x-title { text-shadow:0 1px 4px rgba(0,0,0,.4); }
  .wx-alert { max-width:470px; min-width:0; flex:0 1 auto; color:#FFFFFF; justify-content:flex-start; overflow:hidden; }
  .wx-alert span { overflow:hidden; text-overflow:ellipsis; min-width:0; }
  .wx-hero { position:absolute; left:44px; top:94px; width:620px; text-shadow:0 1px 4px rgba(0,0,0,.45); pointer-events:none; }
  .wx-temp { font:200 116px/1 Outfit,system-ui,sans-serif; letter-spacing:-2px; flex:none; }
  .wx-cond { font:500 34px/1.1 Outfit,system-ui,sans-serif; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .wx-wait .wx-temp { font-size:84px; }
  .wx-wait .wx-cond { white-space:normal; font-size:30px; }
  .wx-sub { font-size:19px; line-height:1.35; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .wx-out { font-size:20px; font-weight:600; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .wx-side { position:absolute; right:36px; top:96px; width:330px; text-align:right; text-shadow:0 1px 4px rgba(0,0,0,.5); display:flex; flex-direction:column; align-items:flex-end; }
  .wx-note { font-size:16px; line-height:1.35; min-height:22px; }
  .wx-big { font:500 40px/1.1 Outfit,system-ui,sans-serif; white-space:nowrap; }
  .wx-band { position:absolute; left:${BAND_L}px; top:${BAND_TOP}px; width:${BAND_W}px; height:${BAND_H}px; border-radius:24px; background:rgba(14,20,28,.56); box-shadow:inset 0 0 0 1px rgba(255,255,255,.15); overflow:hidden; }
  .wx-track { position:absolute; left:${BAND_L}px; top:${BAND_TOP - 30}px; width:${BAND_W}px; height:${BAND_H + 30}px; touch-action:none; }
  .wx-hi { position:absolute; left:0; top:0; width:${CW.toFixed(2)}px; height:100%; background:rgba(255,255,255,.12); will-change:transform; }
  .wx-row { position:absolute; left:0; width:100%; display:flex; text-align:center; }
  .wx-row > span { width:${CW.toFixed(2)}px; flex:none; white-space:nowrap; }
  .wx-bars { position:absolute; left:0; top:108px; width:100%; height:36px; display:flex; align-items:flex-end; }
  .wx-bars > span { width:${CW.toFixed(2)}px; flex:none; display:flex; justify-content:center; align-items:flex-end; height:100%; }
  .wx-bar { width:44px; border-radius:7px 7px 0 0; transform-origin:50% 100%; animation:wx-grow 1.1s ease-out both; }
  .wx-draw { position:absolute; left:0; top:60px; width:100%; height:48px; overflow:hidden; animation:wx-draw-a 2.4s ease-out both; }
  .wx-draw > svg { display:block; animation:wx-draw-b 2.4s ease-out both; }
  .wx-nowdot { position:absolute; width:18px; height:18px; margin:-9px 0 0 -9px; border-radius:50%; background:#FFD58A; animation:wx-now 2s ease-in-out infinite; }
  .wx-mark { position:absolute; top:8px; width:2px; height:${BAND_H - 16}px; opacity:.75; background:repeating-linear-gradient(180deg,#9CC4EE 0,#9CC4EE 6px,rgba(156,196,238,0) 6px,rgba(156,196,238,0) 12px); }

  .wx-low { position:absolute; left:32px; right:32px; top:${SCENE_H + 14}px; bottom:16px; display:flex; gap:14px; }
  .wx-sun { position:relative; flex:none; width:420px; border-radius:28px; overflow:hidden; }
  .wx-sun-in { position:absolute; left:0; top:0; width:100%; height:100%; padding:12px 20px 0; display:flex; flex-direction:column; }
  .wx-sun-foot { margin:auto -20px 0; padding:9px 18px 10px; background:rgba(20,14,34,.62); display:flex; align-items:center; gap:12px; font-size:15px; line-height:1.3; }
  .wx-sun-big { font:300 40px/1.05 Outfit,system-ui,sans-serif; white-space:nowrap; }
  .wx-glow { position:absolute; width:56px; height:56px; margin:-28px 0 0 -28px; border-radius:50%; background:radial-gradient(circle,rgba(255,214,128,.95) 0,rgba(255,190,100,.45) 45%,rgba(255,170,80,0) 70%); animation:wx-glow 4s ease-in-out infinite; }
  .wx-disc { position:absolute; width:22px; height:22px; margin:-11px 0 0 -11px; border-radius:50%; background:#FFF3D2; }
  .wx-right { flex:1; min-width:0; display:flex; flex-direction:column; gap:12px; }
  .wx-out-card { flex:none; height:124px; border-radius:24px; background:rgba(255,255,255,.07); padding:12px 20px 12px 14px; display:flex; align-items:center; gap:16px; cursor:pointer; }
  .wx-wear { flex:none; width:96px; height:96px; border-radius:50%; background:#F3E6C8; display:flex; align-items:center; justify-content:center; overflow:hidden; }
  .wx-wear svg { width:90px !important; height:75px !important; }
  .wx-advice { font:500 21px/1.24 Outfit,system-ui,sans-serif; max-height:80px; overflow:hidden; font-size:24px; }
  .wx-fl { font-size:15px; opacity:.72; white-space:nowrap; }
  .wx-fv { font-size:17px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .wx-fs { font-size:15px; opacity:.72; min-height:19px; }
  .wx-days { flex:1; min-height:0; display:grid; grid-template-columns:repeat(${DAYS},minmax(0,1fr)); grid-gap:10px; }
  .wx-day { border-radius:20px; background:rgba(255,255,255,.08); padding:9px 8px; display:flex; flex-direction:column; align-items:center; justify-content:space-between; min-height:0; cursor:pointer; }
  .wx-day-name { font-size:17px; font-weight:600; white-space:nowrap; }
  .wx-day-hi { font:500 30px/1 Outfit,system-ui,sans-serif; }
  .wx-rng { position:relative; width:84%; height:6px; border-radius:3px; background:rgba(255,255,255,.14); }
  .wx-rng span { position:absolute; top:0; bottom:0; border-radius:3px; background:linear-gradient(90deg,#6FA0E0,#F0A850); }

  .wx-detail { display:none; position:absolute; top:0; right:0; bottom:0; left:0; background:rgba(8,11,18,.72); z-index:5; align-items:center; justify-content:center; }
  .wx-sheet { background:#1F2634; color:#FFFFFF; border-radius:28px; padding:24px 28px; display:flex; flex-direction:column; gap:16px; max-height:752px; box-shadow:inset 0 0 0 1px rgba(255,255,255,.1); }
  .wx-sheet .wx-fv { font-size:20px; }
  .wx-sheet .wx-fs { white-space:normal; }
  .wx-hours { overflow-x:auto; overflow-y:hidden; -webkit-overflow-scrolling:touch; background:rgba(255,255,255,.05); border-radius:18px; padding:10px 12px; flex:none; }
  .wx-hours-row { display:flex; gap:4px; }
  .wx-hr { flex:none; width:84px; padding:7px 0; border-radius:14px; display:flex; flex-direction:column; align-items:center; gap:3px; background:rgba(255,255,255,.09); }
  .wx-hr-night { background:rgba(255,255,255,.03); }
  .wx-hr-sun { background:rgba(255,214,138,.18); }
  .wx-hr-time { font-size:15px; font-weight:600; opacity:.8; white-space:nowrap; }
  .wx-hr-temp { font:500 22px Outfit,system-ui,sans-serif; }
  .wx-hr-suntime { font-size:15px; font-weight:600; white-space:nowrap; line-height:26px; }
  .wx-hr-rain { font-size:15px; font-weight:600; }

  @keyframes wx-cloud { from { transform:translate3d(0,0,0); } to { transform:translate3d(-200px,0,0); } }
  @keyframes wx-fall { from { transform:translate3d(0,0,0); } to { transform:translate3d(var(--dx),${FALL}px,0); } }
  @keyframes wx-smoke { 0% { transform:translate3d(0,0,0) scale(.5); opacity:.6; } 100% { transform:translate3d(-40px,-74px,0) scale(1.6); opacity:0; } }
  @keyframes wx-flash { 0%,91%,94%,100% { opacity:0; } 92% { opacity:.8; } 93% { opacity:.15; } 93.5% { opacity:.6; } }
  @keyframes wx-seam { 0%,100% { opacity:.6; } 50% { opacity:1; } }
  @keyframes wx-grow { from { transform:scaleY(0); } to { transform:scaleY(1); } }
  @keyframes wx-draw-a { from { transform:translate3d(-100%,0,0); } to { transform:translate3d(0,0,0); } }
  @keyframes wx-draw-b { from { transform:translate3d(100%,0,0); } to { transform:translate3d(0,0,0); } }
  @keyframes wx-now { 0%,100% { opacity:1; } 50% { opacity:.35; } }
  @keyframes wx-glow { 0%,100% { transform:scale(1); opacity:.85; } 50% { transform:scale(1.18); opacity:1; } }
  @media (prefers-reduced-motion: reduce) {
    .wx-cloud, .wx-fog, .wx-flash, .wx-seam-line, .wx-bar, .wx-draw, .wx-draw > svg, .wx-nowdot, .wx-glow { animation:none !important; }
    .wx-sheetfall { animation:none !important; } /* still rain and snow: the lower half shows */
    .wx-smoke { animation:none !important; opacity:.45; transform:translate3d(-5px,-2px,0) scale(.7); }
    .wx-smoke + .wx-smoke { display:none; }
  }
`;

const fact = (l, v, s) => `<div><div class="wx-fl">${l}</div><div class="wx-fv">${v}</div><div class="wx-fs">${s || ''}</div></div>`;

// Sunrise and sunset fall between the hours: little markers in the hour strip.
function sunEvents(f) {
  const out = [];
  (f.days || []).forEach((d) => {
    if (d.sunrise) out.push({ at: new Date(d.sunrise).getTime(), kind: 'Sunrise', iso: d.sunrise });
    if (d.sunset) out.push({ at: new Date(d.sunset).getTime(), kind: 'Sunset', iso: d.sunset });
  });
  return out;
}

/** A row of hours for a day's sheet: time, sky, temperature, chance of rain. */
function hoursHtml(list, f, { markNow = false } = {}) {
  const events = sunEvents(f);
  const cols = [];
  const nowMs = Date.now();
  list.forEach((h, i) => {
    const t = new Date(h.time);
    const midnight = t.getHours() === 0;
    const isNow = markNow && nowMs >= t.getTime() && nowMs < t.getTime() + 3600000;
    const past = markNow && t.getTime() + 3600000 <= nowMs;
    const label = isNow ? 'Now' : midnight && i > 0 ? `${dayName(h.time.slice(0, 10))} ${fmtHour(h.time)}` : fmtHour(h.time);
    const night = h.isDay === false;
    cols.push(`
      <div class="wx-hr${night ? ' wx-hr-night' : ''}"${isNow ? ' data-f-now style="box-shadow:inset 0 0 0 3px #FFD58A"' : past ? ' style="opacity:.45"' : ''}>
        <div class="wx-hr-time">${esc(label)}</div>
        ${wxIcon(describe(h.code).icon, 32, night)}
        <div class="wx-hr-temp">${deg(h.temp)}</div>
        <div class="wx-hr-rain" style="color:${h.rain >= 30 ? '#9CC4EE' : '#8A93A1'}">${h.rain >= 10 ? `${h.rain}%` : '&nbsp;'}</div>
      </div>`);
    const start = t.getTime();
    events.filter((e) => e.at >= start && e.at < start + 3600000).forEach((e) => cols.push(`
        <div class="wx-hr wx-hr-sun">
          <div class="wx-hr-time">${e.kind}</div>
          ${wxIcon('sun', 28, false)}
          <div class="wx-hr-suntime">${esc(fmtTime(e.iso))}</div>
          <div class="wx-hr-rain">&nbsp;</div>
        </div>`));
  });
  return cols.join('');
}

function dayCard(d) {
  const bar = d.bar ? (() => { const w = Math.max(8, d.bar[1] * 100); const l = Math.min(d.bar[0] * 100, 100 - w); return `<div class="wx-rng"><span style="left:${l.toFixed(1)}%;width:${w.toFixed(1)}%"></span></div>`; })() : '<div style="height:6px"></div>';
  return `
    <div class="wx-day" data-f-date="${esc(d.date)}" role="button">
      <div class="wx-day-name" style="${d.weekend ? 'color:#FFD58A' : ''}">${esc(d.day)}</div>
      <div style="display:flex;align-items:center;gap:6px">${wxIcon(d.icon, 40)}${d.rain >= 20 ? `<span style="font-size:15px;font-weight:600;color:#9CC4EE">${d.rain}%</span>` : ''}</div>
      <div class="wx-day-hi">${d.hi}</div>
      ${bar}
      <div style="font-size:15px;opacity:.75">Low ${d.lo}</div>
    </div>`;
}

export function mount(el) {
  el.innerHTML = `
  <style>${STYLE}</style>
  <div class="wx">
    <div data-wx-scene class="wx-scene wx-snap">
      <div data-wx-now class="wx-layer"></div>
      <div data-wx-later class="wx-clip" style="display:none"><div></div></div>
      <div data-wx-rain class="wx-clip" style="display:none"><div>${rainHtml()}</div></div>
      <div data-wx-snow class="wx-clip" style="display:none"><div>${snowHtml()}</div></div>
      <div data-wx-smoke style="display:none"><i class="wx-smoke"></i><i class="wx-smoke" style="animation-delay:3.5s"></i></div>
      <div class="wx-shade"></div>
      <div data-wx-seam class="wx-seam" style="display:none"><div class="wx-seam-line"></div><div class="wx-knob">↔</div></div>

      <div class="wx-hero">
        <div data-f-eyebrow class="x-eyebrow" style="color:#FFE7B8">&nbsp;</div>
        <div style="display:flex;align-items:center;gap:20px;margin-top:2px">
          <div data-f-temp class="wx-temp">--°</div>
          <div style="min-width:0">
            <div data-f-label class="wx-cond">Loading weather…</div>
            <div data-f-range class="wx-sub"></div>
            <div data-f-extra class="wx-sub"></div>
          </div>
        </div>
        <div data-f-outlook class="wx-out"></div>
      </div>

      <div class="wx-side">
        <div data-f-updated class="wx-note"></div>
        <div data-wx-coming style="margin-top:10px"></div>
        <button data-wx-back class="x-btn white sm" style="display:none;margin-top:14px;text-shadow:none">Back to now</button>
      </div>

      <div data-wx-band class="wx-band"></div>
      <div data-wx-track class="wx-track"></div>

      <div class="wx-top">${topBar({
    title: 'Weather',
    tone: 'dark',
    right: `<button data-f-alert class="x-btn wx-alert" style="display:none"></button>
        <button data-f-retry class="x-btn glass" style="display:none">Try again</button>
        <button data-wx-more class="x-btn glass">More</button>`,
  })}</div>
    </div>

    <div class="wx-low">
      <div data-wx-sun class="wx-sun"></div>
      <div class="wx-right">
        <div data-wx-outcard class="wx-out-card" role="button">
          <span data-f-wear class="wx-wear"></span>
          <div style="flex:1;min-width:0">
            <div class="x-eyebrow" style="color:#FFD58A;margin-bottom:4px">Before you head out</div>
            <div data-f-advice class="wx-advice">&nbsp;</div>
          </div>
        </div>
        <div data-f-days class="wx-days"></div>
      </div>
    </div>
    <div data-f-detail class="wx-detail"></div>
  </div>`;

  const $ = (s) => el.querySelector(s);
  let alerts = [];
  let alertInfo = null;
  let last = null;        // the forecast on screen, as saved (freshen() works out "now" again)
  let shownHour = -1;     // the hour the graph was drawn for
  let loading = false;
  let offlineNow = false;
  let gen = 0;            // a newer load (e.g. the town changed) wins over an older one
  let cols = [];          // the hours on the graph (the first is this hour)
  let sel = 0;            // the hour the wipe line is on
  let lineX = colX(0);
  let dragging = false;
  let town = '';
  const painted = { now: '', later: '' };
  let sunShown = '';      // the daylight panel as last drawn

  const sceneEl = $('[data-wx-scene]');
  const detail = $('[data-f-detail]');
  const closeDetail = () => { detail.style.display = 'none'; detail.innerHTML = ''; };
  const title = (t) => { el.querySelector('.x-title').textContent = t; };

  // ------------------------------------------------------------------ the scene
  function paint(which, spec) {
    const key = [spec.kind, spec.phase, spec.phase === 'night' ? '' : Math.round(clamp(spec.frac, 0, 1) * 24), spec.month].join('|');
    if (painted[which] === key) return;
    painted[which] = key;
    const box = which === 'now' ? $('[data-wx-now]') : $('[data-wx-later]').firstElementChild;
    box.innerHTML = sceneHtml(Object.assign({ id: which === 'now' ? 'a' : 'b' }, spec));
  }
  // Shows only the part of a layer between x = a and a + 1280 (two transforms, nothing repainted).
  function clip(wrap, a) {
    wrap.style.transform = `translate3d(${a}px,0,0)`;
    wrap.firstElementChild.style.transform = `translate3d(${-a}px,0,0)`;
  }
  // The scene for one hour of the graph (0 is right now).
  function specAt(f, i) {
    const h = cols[i];
    const t = i === 0 || !h ? Date.now() : new Date(h.time).getTime() + 30 * 60000;
    const code = i === 0 || !h ? f.code : h.code;
    const sun = sunAt(f, t, i === 0 || !h ? f.isDay : h.isDay);
    let moon = null;
    try { moon = moonPhase(new Date(t)); } catch (e) { moon = null; }
    return { kind: describe(code).icon, phase: sun.phase, frac: sun.frac, moon, month: new Date(t).getMonth() };
  }
  // With no forecast: a quiet grey street by the clock, promising nothing.
  function plainSpec() {
    const hr = new Date().getHours();
    return { kind: 'cloud', phase: hr >= 7 && hr < 18 ? 'day' : 'night', frac: 0.5, moon: null, month: new Date().getMonth() };
  }

  // Left of the line is the hour it stands on; right of it is still now.
  function layout() {
    const f = last ? freshen(last) : null;
    const seam = $('[data-wx-seam]');
    const later = $('[data-wx-later]');
    const rain = $('[data-wx-rain]'), snow = $('[data-wx-snow]');
    if (!f || !cols.length) {
      seam.style.display = 'none'; later.style.display = 'none'; rain.style.display = 'none'; snow.style.display = 'none';
      $('[data-wx-smoke]').style.display = 'none';
      return;
    }
    const a = specAt(f, 0);
    const b = sel > 0 ? specAt(f, sel) : a;
    // On the last hour the whole picture has turned (no sliver of now left at the edge).
    const edge = sel === cols.length - 1 && !dragging ? W : lineX;
    paint('now', a);
    seam.style.display = '';
    seam.firstElementChild.style.display = sel > 0 || dragging ? '' : 'none';
    seam.style.transform = `translate3d(${lineX.toFixed(1)}px,0,0)`;
    if (sel > 0) {
      paint('later', b);
      later.style.display = '';
      clip(later, edge - W);
    } else {
      later.style.display = 'none';
    }
    const fall = (wrap, kinds) => {
      const now = kinds.includes(a.kind), then = sel > 0 && kinds.includes(b.kind);
      wrap.style.display = now || then ? '' : 'none';
      if (now && (then || sel === 0)) clip(wrap, 0);
      else if (then) clip(wrap, edge - W);
      else if (now) clip(wrap, edge);
    };
    fall(rain, ['rain', 'storm']);
    fall(snow, ['snow']);
    // The chimney smokes when it is cool enough for a fire.
    const cool = f.temp != null && f.temp < (f.units === 'celsius' ? 16 : 60);
    $('[data-wx-smoke]').style.display = cool ? '' : 'none';
    const hi = el.querySelector('.wx-hi');
    if (hi) hi.style.transform = `translate3d(${(sel * CW).toFixed(1)}px,0,0)`;
  }

  // ------------------------------------------------------------------ the graph band
  function bandHtml(f) {
    const n = cols.length;
    const temps = cols.map((h, i) => (i === 0 && f.temp != null ? f.temp : h.temp));
    const known = temps.filter((v) => v != null);
    const lo = Math.min.apply(null, known.length ? known : [0]), hi = Math.max.apply(null, known.length ? known : [1]);
    const y = (v) => (hi > lo ? 40 - ((v - lo) / (hi - lo)) * 30 : 24);
    const pts = temps.map((v, i) => (v == null ? null : [CW * (i + 0.5), y(v)])).filter(Boolean);
    const path = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('');
    // Where the rain (or snow) starts: the first hour it turns likely.
    let mark = -1;
    for (let i = 1; i < n; i++) if (cols[i].rain >= 50 && cols[i - 1].rain < 50) { mark = i; break; }
    const snowAt = (h) => (h.snow || 0) > 0;
    return `
      <div class="wx-hi"></div>
      ${mark > 0 ? `<div class="wx-mark" style="left:${(CW * mark).toFixed(1)}px"></div>` : ''}
      <div class="wx-row" style="top:10px;font-size:16px;font-weight:600">${cols.map((h, i) => `<span style="${i === 0 ? 'color:#FFD58A' : i === mark ? 'color:#9CC4EE' : ''}">${i === 0 ? 'Now' : esc(fmtHour(h.time))}</span>`).join('')}</div>
      <div class="wx-row" style="top:31px;font:300 24px Outfit,system-ui,sans-serif">${temps.map((v, i) => `<span style="${i === 0 ? 'font-weight:500' : ''}">${deg(v)}</span>`).join('')}</div>
      <div class="wx-draw"><svg width="${BAND_W}" height="48" viewBox="0 0 ${BAND_W} 48" aria-hidden="true">
        <defs><linearGradient id="wxLine" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#FFD58A"/><stop offset="0.2" stop-color="#FFFFFF"/><stop offset="1" stop-color="#9CC4EE"/></linearGradient>
        <linearGradient id="wxArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0.22"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></linearGradient></defs>
        ${pts.length > 1 ? `<path d="${path}V48H${pts[0][0].toFixed(1)}Z" fill="url(#wxArea)"/><path d="${path}" fill="none" stroke="url(#wxLine)" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>` : ''}
        <g fill="#FFFFFF">${pts.slice(1).map((p) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="4.5"/>`).join('')}</g>
      </svg></div>
      ${pts.length && temps[0] != null ? `<div class="wx-nowdot" style="left:${pts[0][0].toFixed(1)}px;top:${(60 + pts[0][1]).toFixed(1)}px"></div>` : ''}
      <div class="wx-bars">${cols.map((h, i) => `<span><div class="wx-bar" style="height:${Math.max(3, Math.round((h.rain || 0) * 0.34))}px;background:${snowAt(h) ? '#FFFFFF' : h.rain >= 70 ? '#9CC4EE' : h.rain >= 40 ? '#7FB2E5' : '#6F94BC'};animation-delay:${(i * 0.08).toFixed(2)}s"></div></span>`).join('')}</div>
      <div class="wx-row" style="top:147px;font-size:15px;color:#C9D6E6">${cols.map((h) => `<span style="${h.rain >= 70 ? 'color:#FFFFFF;font-weight:700' : ''}">${h.rain || 0}%</span>`).join('')}</div>`;
  }

  // What is coming, in a few words, top right: "Rain arrives in 1 h 48 min".
  function comingHtml(f) {
    const now = Date.now();
    const big = (eyebrow, main, sub) => `<div class="x-eyebrow" style="color:#C9D6E6">${eyebrow}</div><div class="wx-big">${main}</div>${sub ? `<div style="font-size:18px;line-height:1.35">${sub}</div>` : ''}`;
    const snowing = cols.length && (cols[0].snow || 0) > 0;
    const sky = describe(f.code).icon;
    if (f.rainNow || sky === 'snow' || snowing) {
      const what = sky === 'snow' || snowing ? 'Snow' : 'Rain';
      const dry = cols.slice(1).find((h) => h.rain < 30 && !h.wet && !h.snow);
      if (dry) return big(`${what} eases in`, esc(spanText(new Date(dry.time).getTime() - now)), '');
      return big(`${what} for now`, 'All 12 hours', '');
    }
    const i = cols.findIndex((h, k) => k > 0 && h.rain >= 50);
    if (i > 0) {
      const h = cols[i];
      const what = (h.snow || 0) > 0 ? 'Snow' : 'Rain';
      // The wettest hour, and when it dries up again, from the hourly amounts.
      const rest = cols.slice(i);
      const most = rest.reduce((m, x) => ((x.wet || 0) > (m.wet || 0) ? x : m), rest[0]);
      const dry = rest.find((x) => x.rain < 30 && !x.wet && !x.snow);
      // (when it starts is marked on the graph)
      const sub = [(most.wet || 0) > 0 && most !== h ? `heaviest ${fmtHour(most.time)}` : '', dry ? `dry by ${fmtHour(dry.time)}` : ''].filter(Boolean).join(' · ');
      return big(`${what} arrives in`, esc(spanText(new Date(h.time).getTime() - now)), esc(sub));
    }
    const chance = cols.reduce((m, h) => Math.max(m, h.rain || 0), 0);
    return big('Next 12 hours', 'Dry', chance >= 20 ? `${chance}% chance of a shower` : '');
  }

  // ------------------------------------------------------------------ the words over the scene
  function hero(f) {
    el.querySelector('.wx-hero').classList.remove('wx-wait');
    if (sel > 0 && cols[sel]) {
      const h = cols[sel];
      const sky = describe(h.code);
      const tomorrow = h.time.slice(0, 10) !== isoDay();
      $('[data-f-eyebrow]').textContent = `${fmtHour(h.time)}${tomorrow ? ' tomorrow' : ''}`;
      $('[data-f-temp]').textContent = deg(h.temp);
      $('[data-f-label]').textContent = sky.label;
      const snow = (h.snow || 0) > 0;
      const amt = snow ? amountText(h.snow, f.snowUnit || 'in') : amountText(h.wet, f.rainUnit || 'in');
      // (the chance is on the graph under the line)
      $('[data-f-range]').textContent = h.feels != null ? `Feels like ${h.feels}°` : '';
      $('[data-f-extra]').textContent = amt ? `${amt} of ${snow ? 'snow' : 'rain'}` : '';
      $('[data-f-outlook]').textContent = '';
    } else {
      const now = describe(f.code);
      $('[data-f-eyebrow]').textContent = f.estimated ? 'About now' : 'Now';
      $('[data-f-temp]').textContent = deg(f.temp);
      $('[data-f-label]').textContent = now.label;
      $('[data-f-range]').textContent = f.estimated ? 'Expected about now' : f.feels != null ? `Feels like ${f.feels}°` : '';
      $('[data-f-extra]').textContent = rangeLine(f);
      // The rain to come is told top right when the hours are known.
      $('[data-f-outlook]').textContent = cols.length ? '' : outlook(f);
    }
    $('[data-wx-back]').style.display = sel > 0 ? '' : 'none';
    $('[data-wx-coming]').style.display = sel > 0 ? 'none' : '';
  }

  function select(i, x) {
    if (!cols.length || !last) return;
    sel = clamp(i, 0, cols.length - 1);
    lineX = x == null ? colX(sel) : clamp(x, colX(0), colX(cols.length - 1));
    layout();
    hero(Object.assign(freshen(last), { __town: town }));
  }

  // Slide along the graph, or tap an hour.
  const track = $('[data-wx-track]');
  const at = (e) => {
    const r = track.getBoundingClientRect();
    const x = BAND_L + ((e.clientX - r.left) / (r.width || 1)) * BAND_W;
    return { x, i: Math.round((x - BAND_L) / CW - 0.5) };
  };
  track.addEventListener('pointerdown', (e) => {
    if (!cols.length) return;
    dragging = true;
    sceneEl.classList.remove('wx-snap');
    try { track.setPointerCapture(e.pointerId); } catch (err) { /* an old engine: the window listener below still ends it */ }
    const p = at(e);
    select(p.i, p.x);
  });
  track.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const p = at(e);
    select(p.i, p.x);
  });
  onRelease = () => {
    if (!dragging) return;
    dragging = false;
    sceneEl.classList.add('wx-snap');
    select(sel); // the line settles on the hour
  };
  window.addEventListener('pointerup', onRelease);
  window.addEventListener('pointercancel', onRelease);

  // ------------------------------------------------------------------ taps
  el.addEventListener('click', (e) => {
    if (detail.style.display === 'flex') {
      const unit = e.target.closest('[data-wx-unit]');
      if (unit) { if (saveFamily({ units: unit.getAttribute('data-wx-unit') })) closeDetail(); return; }
      if (e.target.closest('[data-wx-refresh]')) { closeDetail(); load({ fresh: true }); return; }
      if (e.target === detail || e.target.closest('[data-close]')) closeDetail();
      return;
    }
    if (e.target.closest('[data-f-retry]')) { load({ fresh: true }); return; }
    if (e.target.closest('[data-f-alert]') && alerts.length) { openAlerts(); return; }
    if (e.target.closest('[data-wx-back]')) { select(0); return; }
    if (e.target.closest('[data-wx-more]') || e.target.closest('[data-wx-outcard]')) { openDay(isoDay(), true); return; }
    const day = e.target.closest('[data-f-date]');
    if (day && last) openDay(day.getAttribute('data-f-date'));
  });

  // Tap the warning: every warning in full, with when, what it means and what to do.
  function openAlerts() {
    detail.innerHTML = `
      <div data-f-alerts-open class="wx-sheet" style="width:840px">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:16px">
          <div class="x-title" style="font-size:32px">${alerts.length > 1 ? `${alerts.length} weather warnings` : 'Weather warning'}</div>
          <button data-close class="x-btn white">Close</button>
        </div>
        <div class="x-scroll" style="display:flex;flex-direction:column;gap:14px">
          ${alerts.map((a) => `
            <div style="border-left:8px solid ${alertColor(a)};padding:4px 0 4px 16px;display:flex;flex-direction:column;gap:6px">
              <div style="font-size:23px;font-weight:700">${esc(a.event)}</div>
              ${whenText(a) ? `<div style="font-size:18px;font-weight:600;color:#FFD58A">${esc(whenText(a).replace(/^./, (c) => c.toUpperCase()))}</div>` : ''}
              ${kindText(a) ? `<div style="font-size:17px;opacity:.75">${esc(kindText(a))}</div>` : ''}
              ${a.what ? `<div style="font-size:18px;line-height:1.4">${esc(a.what)}</div>` : ''}
              ${a.todo ? `<div style="font-size:18px;line-height:1.4"><span style="font-weight:600">What to do:</span> ${esc(a.todo)}</div>` : ''}
            </div>`).join('')}
          <div style="font-size:15px;opacity:.7">From the National Weather Service${alertInfo && !alertInfo.ok ? ' · last checked a while ago, the internet is off' : ''}</div>
        </div>
      </div>`;
    detail.style.display = 'flex';
  }

  // A day hour by hour, with everything else known about it. Today ("More") also has what
  // is true right now, °F/°C, the town and "check again".
  function openDay(date, more) {
    const f = last ? freshen(last) : null;
    const d = f ? (f.days || []).find((x) => x.date === date) : null;
    const isToday = date === isoDay();
    const foot = more ? `
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
          ${canSaveFamily() ? `<button data-wx-unit="fahrenheit" class="x-btn sm ${settings.units === 'fahrenheit' ? 'white' : 'frost'}">°F</button>
          <button data-wx-unit="celsius" class="x-btn sm ${settings.units === 'celsius' ? 'white' : 'frost'}">°C</button>` : ''}
          <a href="#/settings" class="x-btn sm frost">Change the town</a>
          <button data-wx-refresh class="x-btn sm frost">Check again now</button>
          <div style="flex:1;min-width:0;text-align:right;font-size:15px;opacity:.7">${last ? `Forecast from ${esc(ageText(last.at))} · Open-Meteo` : ''}</div>
        </div>` : '';
    if (!d) {
      if (!more) return;
      detail.innerHTML = `
        <div class="wx-sheet" style="width:860px">
          <div style="display:flex;align-items:center;gap:16px">
            <div class="x-title" style="font-size:32px">Weather</div>
            <button data-close class="x-btn white">Close</button>
          </div>
          <div style="font-size:19px;opacity:.85">No forecast yet.</div>
          ${foot}
        </div>`;
      detail.style.display = 'flex';
      return;
    }
    // Today: the whole day, the hours gone by faded and "Now" ringed.
    const hours = (f.hours || []).filter((h) => h.time.slice(0, 10) === date);
    const sky = describe(d.code);
    const rainAmt = amountText(d.wet, f.rainUnit || 'in');
    const snowAmt = amountText(d.snow, f.snowUnit || 'in');
    const unit = f.windUnit || 'mph';
    const n = f.next12 || { chance: 0, wet: 0, snow: 0 };
    // One grid: today's adds what is true now (its rain is the next 12 hours').
    const facts = (more ? [
      fact('Wind now', f.windSpeed == null ? '--' : f.windSpeed < 2 ? 'Calm' : `${f.windSpeed} ${unit}`, [windFrom(f.windDir), f.gusts != null && f.windSpeed != null && f.gusts >= f.windSpeed + 10 ? `gusts ${f.gusts}` : ''].filter(Boolean).join(' · ')),
      fact('Humidity', f.humidity != null ? `${f.humidity}%` : '--', f.humidity == null ? '' : f.humidity >= 80 ? 'damp' : f.humidity <= 30 ? 'dry air' : ''),
      n.snow > 0 ? fact('Snow, next 12 hrs', esc(amountText(n.snow, f.snowUnit || 'in') || 'Some'), `${n.chance}% chance`)
    : fact('Rain, next 12 hrs', n.chance >= 10 ? `${n.chance}% chance` : 'None expected', amountText(n.wet, f.rainUnit || 'in') ? `about ${esc(amountText(n.wet, f.rainUnit || 'in'))}` : ''),
      fact('Tonight’s low', f.tonightLow != null ? deg(f.tonightLow) : deg(f.low), f.frostTonight ? 'frost likely' : ''),
    ] : [fact('Rain', `${d.rain || 0}%`, rainAmt ? `about ${esc(rainAmt)}` : '')]).concat([
      snowAmt ? fact('Snow', esc(snowAmt), '') : '',
      fact('Wind', d.wind != null ? `up to ${d.wind} ${unit}` : '--', [windFrom(d.dir), d.gusts != null && d.wind != null && d.gusts >= d.wind + 10 ? `gusts ${d.gusts}` : ''].filter(Boolean).join(' · ')),
      fact('Sun strength', d.uv != null ? esc(uvWord(d.uv)) : '--', d.uv != null ? `UV ${Math.round(d.uv)} at most` : ''),
      fact('Sunrise', esc(timeOr(d.sunrise)), ''),
      fact('Sunset', esc(timeOr(d.sunset)), ''),
    ]).filter(Boolean);
    const across = facts.length <= 6 ? 6 : Math.ceil(facts.length / 2);
    detail.innerHTML = `
      <div class="wx-sheet" style="width:1180px">
        <div style="display:flex;align-items:center;gap:16px">
          ${wxIcon(sky.icon, 64)}
          <div style="flex-grow:1;min-width:0">
            <div class="x-title" style="font-size:32px">${isToday ? 'Today' : esc(longDay(date))}</div>
            <div style="font-size:19px;opacity:.8">${esc(sky.label)} · High ${deg(d.hi)} · Low ${deg(d.lo)}</div>
          </div>
          <button data-close class="x-btn white">Close</button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(${across},minmax(0,1fr));grid-gap:12px">${facts.join('')}</div>
        ${hours.length ? `
          <div data-f-dayhours class="wx-hours"><div class="wx-hours-row">${hoursHtml(hours, f, { markNow: isToday })}</div></div>`
    : ''}
        ${foot}
      </div>`;
    detail.style.display = 'flex';
    // Start the strip a little before "now" (after layout has settled).
    if (isToday) {
      setTimeout(() => {
        const strip = detail.querySelector('[data-f-dayhours]');
        const now = detail.querySelector('[data-f-now]');
        if (strip && now) strip.scrollLeft = Math.max(0, now.offsetLeft - strip.offsetLeft - 180);
      }, 0);
    }
  }

  function showAlerts(info) {
    alertInfo = info;
    const now = Date.now();
    alerts = (info.list || []).filter((a) => !a.until || a.until > now); // a warning that has ended goes away
    const box = $('[data-f-alert]');
    showUpdated();
    if (!alerts.length) { box.style.display = 'none'; box.innerHTML = ''; if (detail.querySelector('[data-f-alerts-open]')) closeDetail(); return; }
    const a = alerts[0];
    box.style.display = '';
    box.style.background = alertColor(a);
    box.innerHTML = `<span>⚠ ${esc(a.event)}${alerts.length > 1 ? `<span style="font-weight:500;opacity:.85"> +${alerts.length - 1}</span>` : ''}</span>`;
  }

  // Under the top bar, right: when this forecast is from, honestly, and whether anyone
  // is watching for warnings.
  function showUpdated(offline) {
    if (offline != null) offlineNow = offline;
    const upd = $('[data-f-updated]');
    const btn = $('[data-f-retry]');
    const lines = [];
    const off = offlineNow || (last && last.stale);
    if (last) {
      if (off) lines.push(`<span style="color:#FFD58A;font-weight:600">No internet right now</span><br>Forecast from ${esc(ageText(last.at))}`);
    } else if (offlineNow) {
      lines.push('<span style="color:#FFD58A;font-weight:600">No internet right now</span>');
    }
    upd.innerHTML = lines.join(' · ');
    btn.style.display = off ? '' : 'none';
    btn.disabled = loading;
    btn.textContent = loading ? 'Checking…' : 'Try again';
  }

  // ------------------------------------------------------------------ the daylight panel
  function sunPanel(f) {
    const box = $('[data-wx-sun]');
    const s = f ? sunInfo(f) : null;
    if (!s) {
      sunShown = '';
      box.style.background = 'linear-gradient(180deg,#1E1A3E 0%,#4B3A6E 60%,#8A5A72 100%)';
      box.innerHTML = `<div class="wx-sun-in" style="justify-content:center;align-items:center;text-align:center">
        <div class="x-eyebrow" style="color:#FFE0A6">Daylight</div></div>`;
      return;
    }
    box.style.background = s.golden ? 'linear-gradient(180deg,#1E1A3E 0%,#4B3A6E 34%,#C46E6A 66%,#F3A65E 82%)'
      : s.up ? 'linear-gradient(180deg,#234A80 0%,#5A86BC 46%,#E7B585 80%)'
        : 'linear-gradient(180deg,#0E1024 0%,#1E1A3E 48%,#3B2E5A 80%)';
    // Words: what it is and how long (the times are on the arc under it)
    let eyebrow, big;
    if (s.up) {
      eyebrow = s.golden ? 'Golden hour' : 'Daylight left';
      big = spanText(s.left);
    } else if (s.untilRise != null) {
      eyebrow = 'Sunrise in';
      big = spanText(s.untilRise);
    } else {
      eyebrow = 'After dark';
      big = 'Sun’s down';
    }
    // After dark the arc is tomorrow's.
    const tomorrow = !s.up && s.frac > 1 && s.next;
    const rise = tomorrow ? s.next.sunrise : s.sunrise, set = tomorrow ? s.next.sunset : s.sunset;
    // The arc: 380 wide, the horizon at y = 80, the times on the dark land under it.
    const fr = clamp(s.frac, 0, 1);
    const q = Math.round(fr * 120) / 120;
    const sx = 190 - 150 * Math.cos(Math.PI * q), sy = 80 - 66 * Math.sin(Math.PI * q);
    const arc = `
      <svg width="380" height="112" viewBox="0 0 380 112" aria-hidden="true" style="display:block">
        <defs><linearGradient id="wxArc" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#FFE29A"/><stop offset="1" stop-color="#FF9A5A"/></linearGradient></defs>
        ${s.up ? '' : '<g fill="#FFFFFF" opacity="0.7"><circle cx="60" cy="20" r="1.6"/><circle cx="140" cy="44" r="1.3"/><circle cx="250" cy="14" r="1.6"/><circle cx="320" cy="40" r="1.3"/><circle cx="200" cy="30" r="1.2"/></g>'}
        <path d="M40 80A150 66 0 0 1 340 80" fill="none" stroke="rgba(255,255,255,.34)" stroke-width="3" stroke-dasharray="4 9"/>
        ${s.up ? `<path d="M40 80A150 66 0 0 1 ${sx.toFixed(1)} ${sy.toFixed(1)}" fill="none" stroke="url(#wxArc)" stroke-width="5" stroke-linecap="round"/>` : ''}
        <path d="M-20 80L38 74L80 80L130 72L190 81L250 74L300 80L342 73L400 78V112H-20Z" fill="rgba(20,14,34,.62)"/>
        <g fill="#FFFFFF" opacity="0.85"><circle cx="40" cy="80" r="5"/><circle cx="340" cy="80" r="5"/></g>
      </svg>
      ${s.up ? `<div class="wx-glow" style="left:${sx.toFixed(1)}px;top:${sy.toFixed(1)}px"></div><div class="wx-disc" style="left:${sx.toFixed(1)}px;top:${sy.toFixed(1)}px"></div>` : ''}
      <div style="position:absolute;left:0;right:0;top:86px;display:flex;justify-content:space-between;align-items:baseline;font-size:15px;white-space:nowrap">
        <div>Sunrise <b style="font-size:18px;font-weight:600">${esc(timeOr(rise))}</b></div>
        ${tomorrow ? '<div style="opacity:.8">tomorrow</div>' : ''}
        <div style="color:#FFE0A6">Sunset <b style="font-size:18px;font-weight:600">${esc(timeOr(set))}</b></div>
      </div>`;
    // The days getting shorter or longer, and the turn of the year.
    const per = s.perDay;
    let change = '';
    if (per != null) {
      const halves = Math.round(Math.abs(per) / 30) / 2;
      const amount = halves === 0.5 ? '½ min' : `${Math.floor(halves)}${halves % 1 ? '½' : ''} min`;
      change = halves === 0 ? 'holding steady' : `${amount} ${per < 0 ? 'less' : 'more'} a day`;
    }
    const lights = s.week.map((x) => x.light);
    const lmin = Math.min.apply(null, lights), lmax = Math.max.apply(null, lights);
    const bars = s.week.length >= 3 ? `<div style="display:flex;align-items:flex-end;height:34px;gap:4px;flex:none">${s.week.map((x, i) => `<span style="width:7px;border-radius:3px;height:${Math.round(14 + (lmax > lmin ? (x.light - lmin) / (lmax - lmin) : 0.5) * 20)}px;background:${i === 0 ? '#FFFFFF' : '#FFE0A6'};opacity:${i === 0 ? 1 : 0.75}"></span>`).join('')}</div>` : '';
    const sol = s.solstice;
    const which = sol.shortest ? 'Shortest' : 'Longest';
    const solLine = sol.days <= 0 ? `${which} day: today`
      : `${which} day ${new Date(sol.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    const html = `<div class="wx-sun-in">
        <div class="x-eyebrow" style="color:#FFE0A6">${eyebrow}</div>
        <div data-wx-sunbig class="wx-sun-big"></div>
        <div style="position:relative;width:420px;margin:0 -20px;height:112px;flex:none;overflow:hidden"><div style="position:absolute;left:20px;top:0;width:380px;height:112px">${arc}</div></div>
        <div class="wx-sun-foot" style="margin-top:0;flex:1">
          ${bars}
          <div style="min-width:0">${s.light != null ? `${esc(spanText(s.light * 1000))} of light${change ? ` · ${change}` : ''}<br>` : ''}<span style="color:#BFD8F6">${esc(solLine)}</span></div>
        </div>
      </div>`;
    // Every half minute only the number changes: the arc is rebuilt only when it moves.
    if (html !== sunShown) { box.innerHTML = html; sunShown = html; }
    box.querySelector('[data-wx-sunbig]').textContent = big;
  }

  // ------------------------------------------------------------------ everything
  function render(saved) {
    const f = Object.assign(freshen(saved), { __town: town });
    const hourNow = new Date().getHours();
    // The next 12 hours, this hour first.
    cols = (f.hours || []).filter((h) => new Date(h.time).getTime() > Date.now() - 3600000).slice(0, COLS);
    if (hourNow !== shownHour) { sel = 0; lineX = colX(0); }
    sel = clamp(sel, 0, Math.max(0, cols.length - 1));
    shownHour = hourNow;

    const band = $('[data-wx-band]');
    band.innerHTML = cols.length ? bandHtml(f) : '';
    $('[data-wx-coming]').innerHTML = cols.length ? comingHtml(f) : '';
    if (!cols.length) paint('now', specAt(f, 0));
    layout();
    hero(f);

    // (wind, humidity, sun strength and rain are in "More", which this card also opens)
    const tip = advice(f);
    $('[data-f-advice]').textContent = tip || ' ';
    $('[data-f-wear]').innerHTML = wearArt(wearFor(tip, f));
    const today = isoDay();

    sunPanel(f);

    // The rest of the week, starting tomorrow (a saved copy may start on an earlier day).
    const days = (f.days || []).filter((d) => d.date > today).slice(0, DAYS);
    const his = days.map((d) => d.hi).filter((v) => v != null);
    const los = days.map((d) => d.lo).filter((v) => v != null);
    const wkLo = Math.min.apply(null, los.length ? los : [0]);
    const wkHi = Math.max.apply(null, his.length ? his : [1]);
    $('[data-f-days]').innerHTML = days.map((d, i) => dayCard({
      date: d.date,
      day: i === 0 && (f.days || []).some((x) => x.date === today) ? 'Tomorrow' : dayName(d.date),
      weekend: weekend(d.date),
      icon: describe(d.code).icon,
      hi: deg(d.hi),
      lo: deg(d.lo),
      rain: d.rain,
      bar: d.hi != null && d.lo != null && wkHi > wkLo ? [(d.lo - wkLo) / (wkHi - wkLo), (d.hi - d.lo) / (wkHi - wkLo)] : null,
    })).join('');
    showUpdated();
  }

  // Nothing to show yet (still asking, or no internet and nothing saved).
  function showWaiting(label, sub) {
    cols = []; sel = 0; lineX = colX(0);
    painted.now = '';
    paint('now', plainSpec());
    layout();
    el.querySelector('.wx-hero').classList.add('wx-wait');
    $('[data-f-eyebrow]').innerHTML = '&nbsp;';
    $('[data-f-temp]').textContent = '--°';
    $('[data-f-label]').textContent = label;
    $('[data-f-range]').textContent = '';
    $('[data-f-extra]').textContent = '';
    $('[data-f-outlook]').textContent = sub;
    $('[data-wx-coming]').innerHTML = '';
    $('[data-wx-back]').style.display = 'none';
    $('[data-wx-band]').innerHTML = '';
    $('[data-f-advice]').textContent = ' ';
    $('[data-f-wear]').innerHTML = wearArt([]);
    $('[data-f-days]').innerHTML = '';
    sunPanel(null);
  }

  async function load(opts = {}) {
    const me = ++gen;
    clearTimeout(retry);
    loading = true;
    showUpdated();
    try {
      const loc = await getLocation();
      if (!el.isConnected || me !== gen) return;
      town = loc.town || '';
      title(loc.town ? `Weather in ${loc.town}` : 'Weather');
      // Watches and warnings from the National Weather Service, most serious first.
      getAlertsInfo(loc).then((info) => { if (el.isConnected && me === gen) showAlerts(info); }).catch(() => {});
      const f = await getForecast(loc, opts);
      if (!el.isConnected || me !== gen) return;
      last = f;
      loading = false;
      offlineNow = false;
      render(f);
      if (f.stale) retry = setTimeout(load, 2 * 60 * 1000); // try again soon, not in 15 minutes
    } catch (err) {
      console.error(err);
      if (!el.isConnected || me !== gen) return;
      loading = false;
      // Keep showing what's already on screen; only explain when there's nothing.
      if (!last) showWaiting('No forecast yet', ''); // ("No internet right now" and "Try again" are top right)
      showUpdated(true);
      retry = setTimeout(load, 60 * 1000);
    } finally {
      if (me === gen) loading = false;
    }
  }

  // The owner picked another town (or °F/°C) in Settings: start over at once, never
  // showing the old town's weather under the new name.
  onPlace = () => {
    last = null;
    alerts = [];
    alertInfo = null;
    town = '';
    closeDetail();
    showAlerts({ list: [], covered: null, ok: false });
    title('Weather');
    showWaiting('Loading weather…', '');
    load();
  };
  window.addEventListener('place-changed', onPlace);
  offFamily = onFamilyChanged(() => { if (last && last.units !== settings.units) onPlace(); });

  // Every half minute: warnings that have ended go, "how old" and the daylight left stay
  // true, and when the hour turns the graph moves on (even with the internet off).
  ticker = setInterval(() => {
    if (alertInfo && alerts.some((a) => a.until && a.until <= Date.now())) showAlerts(alertInfo);
    if (!last) { showUpdated(); return; }
    if (new Date().getHours() !== shownHour) { render(last); return; }
    const f = Object.assign(freshen(last), { __town: town });
    if (!dragging) { layout(); hero(f); }
    sunPanel(f);
    showUpdated();
  }, 30 * 1000);

  showWaiting('Loading weather…', '');
  load();
  timer = setInterval(load, 15 * 60 * 1000);
}

export function unmount() {
  clearInterval(timer);
  clearTimeout(retry);
  clearInterval(ticker);
  if (onPlace) window.removeEventListener('place-changed', onPlace);
  if (offFamily) offFamily();
  if (onRelease) {
    window.removeEventListener('pointerup', onRelease);
    window.removeEventListener('pointercancel', onRelease);
  }
  onPlace = null; offFamily = null; onRelease = null;
}
