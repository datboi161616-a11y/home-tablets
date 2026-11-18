// Tom · Deep-space viewscreen (DeepImage.dc.html in the design)
// Full-screen space picture of the day: NASA APOD when it works, otherwise a
// daily pick of famous Webb/Hubble pictures from NASA's Image Library.
// Tap the picture to hide or show the caption. The ◂ ▸ buttons step through the
// built-in famous pictures (today's picture is always first).
import { getSpaceImage, fallbackImage, SPACE_IMAGES, todayKey } from '../services/space.js';

let root;
let onTap;
let dayTimer = 0;
let st = null; // { el, today, day, idx, dir, tries }

/** How many pictures there are to flip through: today's plus the built-in ones. */
const total = () => (st.today.id ? SPACE_IMAGES.length : SPACE_IMAGES.length + 1);

/** Picture number i (0 = today's). Wraps around. */
function pictureAt(i) {
  const n = total();
  const k = ((i % n) + n) % n;
  if (k === 0) return st.today;
  // Today's pick is fallbackImage(0); the rest follow it in the built-in list.
  return fallbackImage(st.today.id ? k : k - 1);
}

function caption(el, data, idx) {
  const $ = (s) => el.querySelector(s);
  $('[data-title]').textContent = data.title;
  $('[data-text]').textContent = data.text;
  if (data.distance) {
    $('[data-k]').textContent = 'DISTANCE';
    $('[data-v]').textContent = data.distance;
  } else {
    $('[data-k]').textContent = data.credit || 'PICTURE OF THE DAY';
    const d = data.date ? new Date(data.date + 'T12:00:00') : new Date();
    $('[data-v]').textContent = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
  }
  const who = data.copyright ? `© ${data.copyright}` : data.credit || 'NASA';
  $('[data-credit]').textContent = `PHOTO: ${who.toUpperCase()} · TAP THE PICTURE TO HIDE THE WORDS`;
  $('[data-label]').textContent = idx === 0 ? "VIEWSCREEN · TODAY'S PICTURE"
    : `VIEWSCREEN · FAMOUS PICTURES · ${idx} OF ${total() - 1}`;
  $('[data-caption]').style.visibility = 'visible';
}

function show(idx) {
  const el = st.el;
  const $ = (s) => el.querySelector(s);
  const n = total();
  idx = ((idx % n) + n) % n;
  st.idx = idx;
  const data = pictureAt(idx);

  const img = $('[data-img]');
  const bg = $('[data-bg]');
  const wait = $('[data-wait]');
  img.style.opacity = '0';
  bg.style.opacity = '0';
  // Keep the words hidden until the picture is actually there.
  $('[data-caption]').style.visibility = 'hidden';
  wait.style.display = '';
  wait.innerHTML = idx === 0
    ? "RECEIVING TODAY'S DEEP-SPACE IMAGE…<br>FROM NASA'S PICTURE OF THE DAY AND THE WEBB TELESCOPE"
    : `RECEIVING ${data.title.toUpperCase()}…`;

  img.onload = () => {
    if (st?.idx !== idx || !root?.isConnected) return;
    st.tries = 0;
    // Pictures that are much taller or wider than the screen are shown whole, over a
    // soft blurred copy, instead of being cut off at the top and bottom.
    const ar = img.naturalWidth / (img.naturalHeight || 1);
    const whole = ar < 1.3 || ar > 2.1;
    img.style.objectFit = whole ? 'contain' : 'cover';
    if (whole) { bg.src = img.src; bg.style.opacity = '1'; } else bg.removeAttribute('src');
    img.style.opacity = '1';
    wait.style.display = 'none';
    caption(el, data, idx);
  };
  img.onerror = () => {
    if (st?.idx !== idx || !root?.isConnected) return;
    // Picture didn't load: move on to the next one (a few at most).
    st.tries += 1;
    if (st.tries <= 3) show(idx + st.dir);
    else {
      st.tries = 0;
      wait.innerHTML = 'NO SIGNAL FROM DEEP SPACE<br>CHECK THE WI-FI CONNECTION';
    }
  };
  img.alt = data.title;
  img.src = data.url;
}

function loadToday() {
  return getSpaceImage()
    .catch((err) => { console.warn(err); return fallbackImage(); })
    .then((data) => {
      if (!root?.isConnected) return;
      st.today = data;
      st.day = todayKey();
      st.tries = 0;
      st.dir = 1;
      show(0);
    });
}

export function mount(el) {
  el.innerHTML = `
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Oxanium:wght@300;500;700&family=JetBrains+Mono:wght@400;600&display=swap">
  <style>
    .di-root{width:1280px;height:800px;box-sizing:border-box;background:#0E1424;color:#D7E6F0;font-family:'JetBrains Mono',monospace;position:relative;overflow:hidden}
    .di-root a{color:#5CE1E6}
    .di-ox{font-family:Oxanium,sans-serif}
    .di-c{position:absolute;width:60px;height:60px;pointer-events:none}
    .di-img{position:absolute;top:0;right:0;bottom:0;left:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity .6s}
    .di-bg{position:absolute;top:-40px;right:-40px;bottom:-40px;left:-40px;width:1360px;height:880px;object-fit:cover;opacity:0;filter:blur(28px) brightness(.45);transition:opacity .6s}
    .di-cap{position:absolute;left:110px;right:110px;bottom:50px;background:rgba(5,7,13,0.78);border-left:4px solid #FFB547;padding:20px 24px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:24px;align-items:end;transition:opacity .3s}
    .di-nav{position:absolute;top:50%;width:64px;height:112px;margin-top:-56px;border:1px solid #1E3A4A;background:rgba(5,7,13,0.7);color:#5CE1E6;font-size:28px;font-family:Oxanium,sans-serif;display:flex;align-items:center;justify-content:center;padding:0;cursor:pointer;transition:opacity .3s}
    .di-root.di-hide .di-cap,.di-root.di-hide .di-nav{opacity:0;pointer-events:none}
  </style>
  <div class="di-root">
    <div data-wait style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:20px;color:#7FA6B8;text-align:center;letter-spacing:2px;white-space:nowrap">RECEIVING TODAY'S DEEP-SPACE IMAGE…<br>FROM NASA'S PICTURE OF THE DAY AND THE WEBB TELESCOPE</div>
    <img data-bg class="di-bg" alt="" aria-hidden="true">
    <img data-img class="di-img" alt="" decoding="async">
    <div class="di-c" style="top:28px;left:28px;border-top:2px solid #5CE1E6;border-left:2px solid #5CE1E6"></div>
    <div class="di-c" style="top:28px;right:28px;border-top:2px solid #5CE1E6;border-right:2px solid #5CE1E6"></div>
    <div class="di-c" style="bottom:28px;left:28px;border-bottom:2px solid #5CE1E6;border-left:2px solid #5CE1E6"></div>
    <div class="di-c" style="bottom:28px;right:28px;border-bottom:2px solid #5CE1E6;border-right:2px solid #5CE1E6"></div>
    <div data-label style="position:absolute;top:44px;left:110px;font-size:14px;letter-spacing:4px;color:#5CE1E6;text-shadow:0 1px 4px #05070D,0 0 8px #05070D">VIEWSCREEN · MAGNIFICATION MAX</div>
    <a href="#/bridge" style="position:absolute;top:36px;right:110px;min-height:44px;padding:10px 18px;box-sizing:border-box;border:1px solid #1E3A4A;background:rgba(5,7,13,0.7);font-size:14px;letter-spacing:3px;display:flex;align-items:center">◂ DECK</a>
    <button data-prev class="di-nav" style="left:24px" aria-label="Previous picture">◂</button>
    <button data-next class="di-nav" style="right:24px" aria-label="Next picture">▸</button>
    <div data-caption class="di-cap" style="visibility:hidden">
      <div style="display:flex;flex-direction:column;gap:6px;min-width:0">
        <div data-title class="di-ox" style="font-size:34px;font-weight:500"></div>
        <div data-text style="font-size:16px;line-height:1.45;color:#B9CBD6"></div>
        <div data-credit style="font-size:12px;letter-spacing:2px;color:#7FA6B8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"></div>
      </div>
      <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end;font-size:14px">
        <div data-k style="color:#7FA6B8;letter-spacing:3px;white-space:nowrap">DISTANCE</div>
        <div data-v class="di-ox" style="font-size:28px;color:#FFB547;white-space:nowrap"></div>
      </div>
    </div>
  </div>`;

  root = el.querySelector('.di-root');
  st = { el, today: null, day: '', idx: 0, dir: 1, tries: 0 };
  onTap = (e) => {
    if (e.target.closest('a')) return;
    const nav = e.target.closest('button');
    if (nav) {
      if (!st.today) return;
      st.dir = nav.hasAttribute('data-prev') ? -1 : 1;
      st.tries = 0;
      root.classList.remove('di-hide');
      show(st.idx + st.dir);
      return;
    }
    root.classList.toggle('di-hide');
  };
  root.addEventListener('click', onTap);

  loadToday();
  // Left on all night? Bring up the new day's picture after midnight.
  dayTimer = setInterval(() => {
    if (st?.today && st.day !== todayKey()) loadToday();
  }, 15 * 60000);
}

export function unmount() {
  clearInterval(dayTimer);
  root?.removeEventListener('click', onTap);
  const img = root?.querySelector('[data-img]');
  if (img) { img.onload = img.onerror = null; }
  root = null;
  st = null;
}
