// Tom · Deep-space viewscreen (DeepImage.dc.html in the design)
// Full-screen space picture of the day: NASA APOD when it works, otherwise a
// daily pick of famous Webb/Hubble pictures from NASA's Image Library.
// Tap the picture to hide or show the caption. The ◂ ▸ buttons step through: today's
// picture, NASA's pictures from the past week (fetched one at a time, kept on the screen),
// then the built-in famous pictures. "READ MORE" opens NASA's whole write-up, in pages.
import { getSpaceImage, fallbackImage, SPACE_IMAGES, todayKey, NASA_API_KEY } from '../services/space.js';

const DAYS = 7;                       // earlier NASA pictures to step back through
const DAYS_KEY = 'deepimage.days.v1'; // { 'YYYY-MM-DD': picture } (the newest dozen)
const LOAD_MS = 30000;                // a picture that hasn't arrived by then counts as failed

let root;
let onTap;
let onOnline;
let dayTimer = 0;
let loadTimer = 0;
let st = null; // { el, today, day, idx, dir, tries, reading }

const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || 'null') || d; } catch (e) { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage full */ } };
const dateWords = (key, opts) => new Date(key + 'T12:00:00').toLocaleDateString('en-US', opts).toUpperCase();

/** "2026-11-20" for n days before the date key given. */
function daysBefore(key, n) {
  const d = new Date(key + 'T12:00:00');
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Same tidying as the picture of the day: the first sentences that fit the caption.
function firstSentences(text, max = 230) {
  const parts = text.match(/[^.!?]+[.!?]+/g) || [text];
  let out = '';
  for (const p of parts) {
    if ((out + p).length > max) break;
    out += p;
  }
  return (out || text.slice(0, max - 1) + '…').trim();
}

/** NASA's picture for one earlier day (or null if it can't be had). Kept once fetched. */
async function apodDay(date) {
  const all = read(DAYS_KEY, {});
  if (all[date]) return all[date];
  if (navigator.onLine === false) return null;
  try {
    const res = await fetch(`https://api.nasa.gov/planetary/apod?api_key=${NASA_API_KEY}&date=${date}&thumbs=true`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`apod ${res.status}`);
    const d = await res.json();
    const video = d.media_type === 'video';
    const url = video ? d.thumbnail_url : d.url;
    if (!url || !/\.(jpe?g|png|gif|webp)(\?|$)/i.test(url) || /logo/i.test(url) || !d.title || d.title === 'NASA Science') return null;
    const full = (d.explanation || '').replace(/\s+/g, ' ').trim();
    const ly = full.match(/([\d.,]+(?:\s+(?:thousand|million|billion))?)\s+light[- ]years?/i);
    const pic = {
      title: d.title, text: firstSentences(full), full, url, video,
      distance: ly ? `${ly[1].toUpperCase()} LIGHT-YEARS` : null,
      credit: 'NASA PICTURE OF THE DAY',
      copyright: (d.copyright || '').replace(/\s+/g, ' ').trim() || null,
      date: d.date || date,
    };
    const keep = read(DAYS_KEY, {});
    keep[date] = pic;
    const keys = Object.keys(keep).sort().reverse();
    keys.slice(12).forEach((k) => { delete keep[k]; });
    write(DAYS_KEY, keep);
    return pic;
  } catch (err) {
    console.warn('apod day', date, err);
    return null;
  }
}

// The pictures in order: 0 = today's, 1..DAYS = earlier NASA days, then the famous ones.
const famousCount = () => (st.today.id ? SPACE_IMAGES.length - 1 : SPACE_IMAGES.length);
const total = () => 1 + DAYS + famousCount();
const firstFamous = 1 + DAYS;

/** { data } for a picture we have, or { date } for an earlier NASA day still to fetch. */
function spotAt(i) {
  if (i === 0) return { data: st.today };
  if (i < firstFamous) return { date: daysBefore(st.today.date || st.day, i) };
  // Today's pick is fallbackImage(0) when NASA's didn't come; the rest follow it in the list.
  const k = i - DAYS; // 1-based among the famous ones
  return { data: fallbackImage(st.today.id ? k : k - 1) };
}

/** NASA's picture for today (not an earlier day's, not a built-in famous one). */
const isToday = (data) => !!data && !data.id && (!data.date || data.date >= todayKey());

// A picture from a video day is a still from the video: say so.
const isVideo = (data) => data.video || /youtube|ytimg|vimeo|vumbnail/i.test(data.url || '');

function caption(el, data, idx) {
  const $ = (s) => el.querySelector(s);
  $('[data-title]').textContent = data.title;
  $('[data-text]').textContent = data.text;
  if (data.distance) {
    $('[data-k]').textContent = 'DISTANCE';
    $('[data-v]').textContent = data.distance;
  } else {
    $('[data-k]').textContent = data.credit || 'PICTURE OF THE DAY';
    $('[data-v]').textContent = dateWords(data.date || todayKey(), { month: 'short', day: 'numeric' });
  }
  const who = data.copyright ? `© ${data.copyright}` : data.credit || 'NASA';
  // Say honestly what this is: a built-in famous picture is not NASA's picture of the day.
  const what = data.id ? ' · ONE OF THE SCREEN’S BUILT-IN FAMOUS PICTURES'
    : idx === 0 && !isToday(data) ? ` · NASA’S PICTURE FOR ${dateWords(data.date, { month: 'short', day: 'numeric' })}` : '';
  $('[data-credit]').textContent = `PHOTO: ${who.toUpperCase()}${what}${isVideo(data) ? ' · A STILL FROM THE DAY’S VIDEO' : ''}`;
  let label;
  if (idx === 0) {
    label = data.id ? 'VIEWSCREEN · A FAMOUS PICTURE · TODAY’S HASN’T ARRIVED'
      : isToday(data) ? "VIEWSCREEN · TODAY'S PICTURE"
        : `NASA’S PICTURE FOR ${dateWords(data.date, { weekday: 'short', month: 'short', day: 'numeric' })} · TODAY’S ISN’T IN YET`;
  } else if (idx < firstFamous) label = `VIEWSCREEN · NASA’S PICTURE FOR ${dateWords(data.date, { weekday: 'long', month: 'short', day: 'numeric' })}`;
  else label = `VIEWSCREEN · FAMOUS PICTURES · ${idx - DAYS} OF ${famousCount()}`;
  $('[data-label]').textContent = label;
  // The whole write-up, when NASA's is longer than what fits here.
  const more = data.full ? data.full.length > data.text.length + 20 : !!data.date;
  $('[data-more]').style.display = more ? '' : 'none';
  $('[data-caption]').style.visibility = 'visible';
}

function noSignal() {
  const $ = (s) => st.el.querySelector(s);
  st.tries = 0;
  $('[data-wait-text]').innerHTML = navigator.onLine === false
    ? 'NO SIGNAL FROM DEEP SPACE<br>THE WI-FI IS OFF: THE PICTURE COMES AS SOON AS IT’S BACK'
    : 'NO SIGNAL FROM DEEP SPACE<br>THE PICTURE DIDN’T ARRIVE. CHECK THE WI-FI, THEN TRY AGAIN';
  $('[data-retry]').style.display = '';
}

/** This picture couldn't be had: move on to the next (a few at most), then say so. */
function failed(idx) {
  if (st?.idx !== idx || !root?.isConnected) return;
  clearTimeout(loadTimer);
  st.tries += 1;
  if (st.tries <= 3) show(idx + st.dir);
  else noSignal();
}

function paint(idx, data) {
  const el = st.el;
  const $ = (s) => el.querySelector(s);
  const img = $('[data-img]');
  const bg = $('[data-bg]');
  const wait = $('[data-wait]');
  st.data = data;

  img.onload = () => {
    if (st?.idx !== idx || !root?.isConnected) return;
    clearTimeout(loadTimer);
    st.tries = 0;
    // Pictures that are much taller or wider than the screen are shown whole, over a
    // soft blurred copy, instead of being cut off at the top and bottom.
    const ar = img.naturalWidth / (img.naturalHeight || 1);
    const whole = ar < 1.3 || ar > 2.1;
    img.style.objectFit = whole ? 'contain' : 'cover';
    if (whole) {
      try {
        const pen = bg.getContext('2d');
        pen.clearRect(0, 0, bg.width, bg.height);
        const s = Math.max(bg.width / img.naturalWidth, bg.height / img.naturalHeight);
        const w = img.naturalWidth * s, h = img.naturalHeight * s;
        pen.drawImage(img, (bg.width - w) / 2, (bg.height - h) / 2, w, h);
        pen.fillStyle = 'rgba(5,7,13,.58)';
        pen.fillRect(0, 0, bg.width, bg.height);
        bg.style.opacity = '1';
      } catch (err) { /* plain dark is fine */ }
    }
    img.style.opacity = '1';
    wait.style.display = 'none';
    caption(el, data, idx);
  };
  img.onerror = () => failed(idx);
  // A very slow connection: don't sit on "RECEIVING…" for ever.
  clearTimeout(loadTimer);
  loadTimer = setTimeout(() => { img.onload = img.onerror = null; failed(idx); }, LOAD_MS);
  img.alt = data.title;
  img.src = data.url;
}

function show(idx) {
  const el = st.el;
  const $ = (s) => el.querySelector(s);
  const n = total();
  idx = ((idx % n) + n) % n;
  st.idx = idx;
  closeReader();
  const spot = spotAt(idx);

  const img = $('[data-img]');
  img.onload = img.onerror = null;
  clearTimeout(loadTimer);
  img.style.opacity = '0';
  $('[data-bg]').style.opacity = '0';
  // Keep the words hidden until the picture is actually there.
  $('[data-caption]').style.visibility = 'hidden';
  $('[data-wait]').style.display = 'flex';
  $('[data-retry]').style.display = 'none';
  $('[data-wait-text]').innerHTML = idx === 0
    ? (spot.data.id ? `RECEIVING ${spot.data.title.toUpperCase()}…<br>NASA’S PICTURE FOR TODAY HASN’T ARRIVED YET`
      : "RECEIVING TODAY'S DEEP-SPACE IMAGE…<br>FROM NASA'S PICTURE OF THE DAY")
    : spot.date ? `RECEIVING NASA’S PICTURE FOR ${dateWords(spot.date, { weekday: 'long', month: 'short', day: 'numeric' })}…`
      : `RECEIVING ${spot.data.title.toUpperCase()}…`;

  if (spot.data) { paint(idx, spot.data); return; }
  apodDay(spot.date).then((data) => {
    if (st?.idx !== idx || !root?.isConnected) return;
    if (data) { paint(idx, data); return; }
    // NASA's earlier days can't be had just now: go on to the famous pictures (or back
    // to today's), rather than knocking on every day in between.
    if (navigator.onLine === false) { noSignal(); return; }
    show(st.dir > 0 ? firstFamous : 0);
  });
}

// ---- The whole write-up, in pages ----
function pagesOf(text) {
  const parts = text.match(/[^.!?]+[.!?]+["’”)]*\s*/g) || [text];
  const pages = [''];
  for (const p of parts) {
    if (pages[pages.length - 1] && (pages[pages.length - 1] + p).length > 650) pages.push('');
    pages[pages.length - 1] += p;
  }
  return pages.map((p) => p.trim());
}

function drawPage() {
  const $ = (s) => st.el.querySelector(s);
  const r = st.reading;
  $('[data-read-text]').textContent = r.pages[r.page];
  $('[data-read-page]').textContent = r.pages.length > 1 ? `PAGE ${r.page + 1} OF ${r.pages.length}` : '';
  $('[data-read-back]').style.visibility = r.page > 0 ? 'visible' : 'hidden';
  $('[data-read-next]').style.visibility = r.page < r.pages.length - 1 ? 'visible' : 'hidden';
}

async function openReader() {
  const $ = (s) => st.el.querySelector(s);
  const data = st.data;
  const idx = st.idx;
  if (!data) return;
  let full = data.full;
  $('[data-read-title]').textContent = data.title;
  $('[data-reader]').style.display = 'flex';
  root.classList.add('di-reading');
  const asked = { pages: [''], page: 0 };
  st.reading = asked;
  if (!full && data.date) {
    $('[data-read-text]').textContent = 'RECEIVING NASA’S WHOLE STORY…';
    ['[data-read-back]', '[data-read-next]'].forEach((s) => { $(s).style.visibility = 'hidden'; });
    $('[data-read-page]').textContent = '';
    const day = await apodDay(data.date);
    if (st?.idx !== idx || !root?.isConnected || st.reading !== asked) return; // closed meanwhile
    full = day && day.full;
    if (full) data.full = full;
  }
  st.reading = { pages: pagesOf(full || data.text), page: 0 };
  if (!full && data.date) st.reading.pages[0] = data.text + '\n\n(NASA’s whole story can’t be fetched just now. Try again later.)';
  drawPage();
}

function closeReader() {
  if (!st) return;
  st.reading = null;
  const r = st.el.querySelector('[data-reader]');
  if (r) r.style.display = 'none';
  root?.classList.remove('di-reading');
}

function loadToday() {
  return getSpaceImage()
    .catch((err) => { console.warn(err); return fallbackImage(); })
    .then((data) => {
      if (!root?.isConnected) return;
      const first = !st.today;
      st.today = data;
      st.day = todayKey();
      // Past midnight while he's looking at another picture: don't pull it away from him.
      if (!first && st.idx !== 0) return;
      st.tries = 0;
      st.dir = 1;
      st.wanted = 0;
      show(0);
    });
}

/** The newer picture waiting to be looked at: a button, so the one he's reading stays put. */
function drawOffer() {
  const $ = (s) => st.el.querySelector(s);
  const on = !!st.pending;
  $('[data-newer]').style.display = on ? '' : 'none';
  $('[data-label]').style.right = on ? '380px' : '40px';
}

/**
 * Every 15 minutes: has today's NASA picture come in since? (space.js only asks NASA again
 * once its copy has gone stale, so this never asks more often than before.) If so it is
 * offered, not swapped in. The words on the one showing are brought up to date too
 * ("TODAY'S" becomes yesterday's after midnight).
 */
function checkToday() {
  getSpaceImage().catch(() => null).then((data) => {
    if (!st || !root?.isConnected || !data) return;
    st.day = todayKey();
    const cap = st.el.querySelector('[data-caption]');
    if (cap.style.visibility === 'visible' && st.data) caption(st.el, st.data, st.idx);
    const has = (d) => d && d.url === data.url;
    if (has(st.today) || has(st.pending) || !isToday(data)) return;
    // Nothing on the screen yet (still waiting, or "no signal"): just show it.
    if (cap.style.visibility !== 'visible' && st.idx === 0) { adoptToday(data); return; }
    st.pending = data;
    drawOffer();
  });
}

function adoptToday(data) {
  st.today = data;
  st.pending = null;
  drawOffer();
  st.tries = 0;
  st.dir = 1;
  st.wanted = 0;
  root.classList.remove('di-hide');
  show(0);
}

export function mount(el) {
  el.innerHTML = `
  <link rel="stylesheet" crossorigin href="https://fonts.googleapis.com/css2?family=Oxanium:wght@300;500;700&family=JetBrains+Mono:wght@400;600&display=swap">
  <style>
    .di-root{width:1280px;height:800px;box-sizing:border-box;background:#0E1424;color:#D7E6F0;font-family:'JetBrains Mono',monospace;position:relative;overflow:hidden}
    .di-root a{color:#5CE1E6}
    .di-ox{font-family:Oxanium,sans-serif}
    .di-c{position:absolute;width:60px;height:60px;pointer-events:none}
    .di-img{position:absolute;top:0;right:0;bottom:0;left:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity .6s}
    /* The soft copy behind a tall or wide picture: a tiny drawing stretched over the screen.
       (A live blur of the full picture is more than the tablet's graphics chip can do.) */
    .di-bg{position:absolute;top:0;left:0;width:100%;height:100%;opacity:0;transition:opacity .6s}
    .di-cap{position:absolute;left:110px;right:110px;bottom:40px;background:rgba(5,7,13,0.82);border-left:4px solid #FFB547;padding:20px 24px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:24px;align-items:end;transition:opacity .3s}
    .di-nav{position:absolute;top:50%;width:72px;height:120px;margin-top:-60px;border:1px solid #1E3A4A;background:rgba(5,7,13,0.7);color:#5CE1E6;font-size:30px;font-family:Oxanium,sans-serif;display:flex;align-items:center;justify-content:center;padding:0;cursor:pointer;transition:opacity .3s}
    .di-btn{min-height:56px;padding:0 22px;box-sizing:border-box;border:1px solid #2C5568;background:rgba(5,7,13,0.85);color:#5CE1E6;font-family:'JetBrains Mono',monospace;font-size:16px;letter-spacing:3px;cursor:pointer;display:flex;align-items:center;justify-content:center;white-space:nowrap}
    .di-btn:active{border-color:#5CE1E6;color:#A8F2F4}
    .di-root.di-hide .di-cap,.di-root.di-hide .di-nav,.di-root.di-reading .di-cap{opacity:0;pointer-events:none}
    .di-read{position:absolute;left:110px;right:110px;top:110px;bottom:40px;background:rgba(5,7,13,0.94);border-left:4px solid #FFB547;padding:26px 32px;box-sizing:border-box;display:none;flex-direction:column;gap:18px}
  </style>
  <div class="di-root">
    <div data-wait style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:22px">
      <div data-wait-text style="font-size:20px;color:#9FBFCF;text-align:center;letter-spacing:2px;line-height:1.5;white-space:nowrap">RECEIVING TODAY'S DEEP-SPACE IMAGE…<br>FROM NASA'S PICTURE OF THE DAY AND THE WEBB TELESCOPE</div>
      <button data-retry class="di-btn" style="display:none;min-width:220px">TRY AGAIN</button>
    </div>
    <canvas data-bg class="di-bg" width="64" height="40" aria-hidden="true"></canvas>
    <img data-img class="di-img" alt="" decoding="async">
    <div class="di-c" style="bottom:28px;left:28px;border-bottom:2px solid #5CE1E6;border-left:2px solid #5CE1E6"></div>
    <div class="di-c" style="bottom:28px;right:28px;border-bottom:2px solid #5CE1E6;border-right:2px solid #5CE1E6"></div>
    <a href="#/bridge" class="di-btn" style="position:absolute;top:24px;left:40px;text-decoration:none">◂ DECK</a>
    <div data-label style="position:absolute;top:42px;left:184px;right:40px;font-size:16px;letter-spacing:3px;color:#5CE1E6;text-shadow:0 1px 4px #05070D,0 0 8px #05070D;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">VIEWSCREEN · MAGNIFICATION MAX</div>
    <button data-newer class="di-btn" style="display:none;position:absolute;top:24px;right:40px;border-color:#FFB547;color:#FFB547">TODAY’S PICTURE IS IN ▸</button>
    <button data-prev class="di-nav" style="left:24px" aria-label="Previous picture">◂</button>
    <button data-next class="di-nav" style="right:24px" aria-label="Next picture">▸</button>
    <div data-caption class="di-cap" style="visibility:hidden">
      <div style="display:flex;flex-direction:column;gap:8px;min-width:0">
        <div data-title class="di-ox" style="font-size:34px;font-weight:500;line-height:1.15"></div>
        <div data-text style="font-size:19px;line-height:1.45;color:#C9D8E2"></div>
        <div data-credit style="font-size:15px;letter-spacing:1px;color:#9FBFCF;line-height:1.35"></div>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;align-items:flex-end;font-size:15px">
        <button data-more class="di-btn" style="display:none">READ MORE ▸</button>
        <div data-k style="color:#9FBFCF;letter-spacing:3px;white-space:nowrap">DISTANCE</div>
        <div data-v class="di-ox" style="font-size:28px;color:#FFB547;white-space:nowrap"></div>
      </div>
    </div>
    <div data-reader class="di-read">
      <div data-read-title class="di-ox" style="font-size:32px;font-weight:500;line-height:1.15"></div>
      <div data-read-text style="flex:1;min-height:0;overflow:hidden;font-size:22px;line-height:1.55;color:#D7E6F0;white-space:pre-line"></div>
      <div style="display:flex;align-items:center;gap:14px">
        <button data-read-back class="di-btn">◂ BACK</button>
        <div data-read-page style="flex:1;text-align:center;font-size:16px;letter-spacing:3px;color:#9FBFCF"></div>
        <button data-read-next class="di-btn">MORE ▸</button>
        <button data-read-close class="di-btn" style="margin-left:24px">CLOSE ✕</button>
      </div>
    </div>
  </div>`;

  root = el.querySelector('.di-root');
  st = { el, today: null, day: '', idx: 0, wanted: 0, dir: 1, tries: 0, reading: null, data: null, pending: null };
  // Try again with the picture he asked for (not wherever the failures had moved on to).
  const retry = () => { st.tries = 0; if (st.today) show(st.wanted); else loadToday(); };
  onTap = (e) => {
    if (e.target.closest('a')) return;
    const t = e.target;
    if (t.closest('[data-retry]')) { retry(); return; }
    if (t.closest('[data-newer]')) { if (st.pending) adoptToday(st.pending); return; }
    if (t.closest('[data-more]')) { openReader(); return; }
    if (t.closest('[data-read-close]')) { closeReader(); return; }
    if (t.closest('[data-read-next]')) { if (st.reading && st.reading.page < st.reading.pages.length - 1) { st.reading.page += 1; drawPage(); } return; }
    if (t.closest('[data-read-back]')) { if (st.reading && st.reading.page > 0) { st.reading.page -= 1; drawPage(); } return; }
    if (t.closest('[data-reader]')) return; // a tap on the words while reading does nothing
    const nav = t.closest('[data-prev],[data-next]');
    if (nav) {
      if (!st.today) return;
      st.dir = nav.hasAttribute('data-prev') ? -1 : 1;
      st.tries = 0;
      root.classList.remove('di-hide');
      st.wanted = (((st.idx + st.dir) % total()) + total()) % total();
      show(st.wanted);
      return;
    }
    root.classList.toggle('di-hide');
  };
  root.addEventListener('click', onTap);
  // The Wi-Fi came back while it said "no signal": try again straight away.
  onOnline = () => {
    if (!st || !root?.isConnected) return;
    if (el.querySelector('[data-retry]').style.display !== 'none') retry();
  };
  window.addEventListener('online', onOnline);

  loadToday();
  // Left open (all night, or since before NASA posted today's): offer today's when it comes.
  dayTimer = setInterval(() => {
    if (st?.today) checkToday();
  }, 15 * 60000);
}

export function unmount() {
  clearInterval(dayTimer);
  clearTimeout(loadTimer);
  root?.removeEventListener('click', onTap);
  window.removeEventListener('online', onOnline);
  const img = root?.querySelector('[data-img]');
  if (img) { img.onload = img.onerror = null; }
  root = null;
  st = null;
}
