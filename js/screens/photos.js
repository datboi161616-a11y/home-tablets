// Family · Full-screen photo frame (Photos.dc.html in the design)
// Slow pan on each photo, cross-fade to the next one every minute.
// Tap the middle to go back home, the sides (or a swipe) for the other photos.
// "All photos" opens a grid of the whole album: jump to one, or remove several at once.
// "Hold" keeps one picture up (it carries on by itself after a while).
//
// Routes: #/photos, #/photos/album (opens the grid), #/photos/show/<id> (starts on that one).
import { display, clockTime, clockAmPm, timeText } from '../services/display.js';
import { getLocation } from '../services/location.js';
import { getWeather, describe } from '../services/weather.js';
// On the tablet: its own album (sent from phones, see addphotos.js).
// In a normal browser: sample pictures, so the screen can still be previewed.
import { photos as samplePhotos } from '../services/family-sample.js';
import {
  isTablet, getPhotos, onPhotosChanged, canRemovePhotos, removePhoto, removePhotos, thumbnail,
} from '../services/tablet-photos.js';
import { feature } from '../services/features.js';
import { framesArt } from '../art.js';

// How long each picture stays: a minute, or what the owner chose (Settings → Photo frame).
const slideMs = () => Math.max(10, +display().slideSecs || 60) * 1000;
// A held picture carries on by itself after this long, so the frame never stays stuck.
const HOLD_MS = 10 * 60 * 1000;
// Videos move on when they end, or after this long at most (clips are 60 s or less).
const VIDEO_MAX_MS = 70 * 1000;
let clockTimer, slideTimer, fadeTimer, weatherTimer, holdTimer, toastTimer, hintTimer, offPhotos, io;
let alive = null; // this visit's marker: chunked album building stops when it changes

function clockParts() {
  const now = new Date();
  return {
    time: clockTime(now),
    ampm: clockAmPm(now), // "PM" (nothing with the 24-hour clock)
    date: now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }),
  };
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

// Real photos (src) win; gradients are the stand-in until the backend exists.
const slideBg = (p) => (p.src
  ? `background:#2A3038 url('${encodeURI(p.src)}') center/cover no-repeat`
  : `background:${p.art}`);

function loadAlbum() {
  const list = isTablet() ? getPhotos() : samplePhotos.map((p) => ({ ...p, name: p.addedBy, line: `${p.caption} · Added by ${p.addedBy}` }));
  if (!display().photoShuffle || list.length < 3) return list;
  // "Mixed up": the newest one still comes first (somebody just sent it), the rest in any order.
  const rest = list.slice(1);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = rest[i]; rest[i] = rest[j]; rest[j] = t;
  }
  return [list[0]].concat(rest);
}

const MAX_DOTS = 12;
const TILE_W = 240, TILE_H = 180; // the small copies in the album grid
const CHUNK = 40;                 // grid tiles built per step (the album can hold 500)

export function mount(el, { homeRoute = 'home', args = [] } = {}) {
  const c = clockParts();
  const prefs = display();
  const visit = alive = {};
  let photos = loadAlbum();
  let index = 0;
  let weatherText = '';
  let broken = 0; // photos in a row that wouldn't load
  let preload = null;
  let held = false;
  let albumOpen = false, askOpen = false, fullOpen = false;
  let currentVideo = null, videoGo = null;
  const canRemove = canRemovePhotos();

  el.innerHTML = `
  <style>
    .ph-root{position:absolute;top:0;right:0;bottom:0;left:0;background:#2A3038;color:#fff;overflow:hidden;cursor:pointer}
    /* will-change: the slide is drawn once and then only moved. Without it the tablet drew
       the whole picture again for every step of the slow zoom: under one frame a second. */
    .ph-slide{position:absolute;top:-6%;right:-6%;bottom:-6%;left:-6%;opacity:0;transition:opacity 2.5s ease;will-change:transform,opacity}
    .ph-slide.quick{transition-duration:.35s}
    .ph-slide.on{opacity:1}
    .ph-back{position:absolute;top:0;left:0;width:100%;height:100%}
    .ph-ask,.ph-full{display:none;position:absolute;top:0;right:0;bottom:0;left:0;background:rgba(10,12,16,.62);align-items:center;justify-content:center;cursor:default;z-index:8}
    .ph-ask button,.ph-full button{border:0;font-family:inherit;cursor:pointer;font-size:19px;padding:0 30px;min-height:56px;justify-content:center}
    /* In 300 small steps, not 60 times a second: the picture moves under half a pixel per
       step either way, and the tablet draws about five frames a second instead of sixty
       (measured: the smooth version kept a processor core and a half busy all day). */
    .ph-slide.pan-a{animation:ph-pan-a 63s steps(300, end) forwards}
    .ph-slide.pan-b{animation:ph-pan-b 63s steps(300, end) forwards}
    @keyframes ph-pan-a{from{transform:scale(1) translate(0,0)}to{transform:scale(1.08) translate(-2%,-1.5%)}}
    @keyframes ph-pan-b{from{transform:scale(1.08) translate(-2%,1%)}to{transform:scale(1) translate(1.5%,0)}}
    .ph-dot{height:8px;width:8px;border-radius:4px;background:rgba(255,255,255,.5);transition:width .4s,background .4s}
    .ph-dot.on{width:28px;background:#fff}
    .ph-clamp{overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;max-width:620px}
    .ph-arrow{position:absolute;top:50%;margin-top:-32px;width:64px;height:64px;border-radius:32px;background:rgba(10,12,16,.4);color:#fff;
      display:none;align-items:center;justify-content:center;font-size:40px;line-height:1;opacity:.75;pointer-events:none}
    .ph-pill{border:0;font-family:inherit;cursor:pointer;min-height:56px;font-size:18px;padding:0 22px;background:rgba(10,12,16,.55);color:#fff;white-space:nowrap}
    .ph-cap{border:0;background:transparent;color:#fff;font-family:inherit;text-align:right;padding:6px 0;cursor:pointer;display:flex;flex-direction:column;align-items:flex-end;gap:8px;min-height:48px}
    .ph-more{font-size:16px;font-weight:600;color:#fff;background:rgba(255,255,255,.18);border-radius:999px;padding:6px 14px;display:none}
    .ph-badge{background:rgba(10,12,16,.62);padding:0 18px;border-radius:999px;font-size:17px;font-weight:600;color:#fff;min-height:48px;display:none;align-items:center;gap:8px;border:0;font-family:inherit}
    button.ph-badge{cursor:pointer;min-height:56px;padding:0 22px;font-size:18px}
    .ph-toast{position:absolute;top:180px;left:50%;transform:translateX(-50%);background:rgba(10,12,16,.82);color:#fff;border-radius:999px;padding:10px 12px 10px 26px;
      font-size:20px;font-weight:600;display:flex;align-items:center;gap:16px;white-space:nowrap;opacity:0;pointer-events:none;transition:opacity .4s;z-index:9;min-height:56px}
    .ph-toast.plain{padding-right:26px}
    .ph-toast button{border:0;background:#fff;color:#1D2430;border-radius:999px;font-family:inherit;font-size:18px;font-weight:700;min-height:48px;padding:0 22px;cursor:pointer}
    .ph-hint{position:absolute;left:50%;bottom:240px;transform:translateX(-50%);background:rgba(10,12,16,.62);border-radius:999px;padding:12px 26px;font-size:19px;
      white-space:nowrap;pointer-events:none;opacity:0;transition:opacity .6s}
    .ph-broken{position:absolute;top:30%;left:12%;right:12%;text-align:center;display:flex;flex-direction:column;gap:12px;align-items:center}
    /* The album: every picture as a small copy, to look through, jump to, or remove. */
    .ph-album{display:none;position:absolute;top:0;right:0;bottom:0;left:0;background:#1D2430;cursor:default;z-index:6}
    .ph-ahead{position:absolute;top:0;left:0;right:0;height:112px;display:flex;align-items:center;gap:14px;padding:0 40px}
    .ph-grid{position:absolute;top:112px;left:0;right:0;bottom:0;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:4px 40px 40px;
      display:grid;grid-template-columns:repeat(5,minmax(0,1fr));grid-gap:18px 16px;align-content:start}
    .ph-album.picking .ph-grid{bottom:104px}
    .ph-tile{border:0;background:transparent;color:#E6E9ED;font-family:inherit;padding:0;text-align:left;cursor:pointer;display:flex;flex-direction:column;gap:8px}
    .ph-thumb{position:relative;width:100%;height:168px;border-radius:14px;background:#2A3038 center/cover no-repeat;overflow:hidden;border:4px solid transparent}
    .ph-tile.cur .ph-thumb{border-color:#fff}
    .ph-tile.sel .ph-thumb{border-color:#E8734A}
    .ph-tlabel{font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .ph-tplay{position:absolute;top:0;right:0;bottom:0;left:0;display:flex;align-items:center;justify-content:center;font-size:34px;background:rgba(10,12,16,.35)}
    .ph-tbroken{position:absolute;top:0;right:0;bottom:0;left:0;display:flex;align-items:center;justify-content:center;text-align:center;font-size:16px;padding:10px;color:#C9D0D8}
    .ph-tick{position:absolute;top:10px;right:10px;width:40px;height:40px;border-radius:20px;border:3px solid #fff;background:rgba(10,12,16,.4);display:none;
      align-items:center;justify-content:center;font-size:24px;font-weight:700}
    .ph-album.picking .ph-tick{display:flex}
    .ph-tile.sel .ph-tick{background:#E8734A;border-color:#E8734A}
    .ph-selbar{display:none;position:absolute;left:0;right:0;bottom:0;height:104px;background:#11161D;align-items:center;gap:14px;padding:0 40px}
    .ph-album.picking .ph-selbar{display:flex}
    .ph-pill[disabled]{opacity:.4}
  </style>
  <div class="ph-root" data-root>
    <div data-slides></div>
    <!-- The dark strip the words sit on: only as tall as what the owner chose to show. -->
    <div style="position:absolute;left:0;right:0;bottom:0;height:${prefs.photoClock || prefs.photoCaptions ? 220 : prefs.photoWeather ? 140 : 84}px;background:${prefs.photoClock || prefs.photoCaptions || prefs.photoWeather ? 'rgba(10,12,16,.55)' : 'linear-gradient(rgba(10,12,16,0),rgba(10,12,16,.55))'}"></div>
    <div style="position:absolute;left:48px;bottom:40px;display:${prefs.photoClock || prefs.photoWeather ? 'flex' : 'none'};flex-direction:column;gap:6px">
      <div class="display" style="font-weight:300;font-size:96px;line-height:1;letter-spacing:-3px;white-space:nowrap${prefs.photoClock ? '' : ';display:none'}"><span data-time>${c.time}</span><span data-ampm style="font-size:30px;font-weight:500;letter-spacing:0;margin-left:10px">${c.ampm}</span></div>
      <div data-date style="font-size:${prefs.photoClock ? 22 : 28}px;font-weight:500">${prefs.photoClock ? c.date : ''}</div>
    </div>
    <div style="position:absolute;right:48px;bottom:36px;display:flex;flex-direction:column;align-items:flex-end;gap:10px;max-width:620px;text-align:right">
      <button class="ph-cap" data-more-btn aria-label="Read the whole caption">
        <div data-title class="display ph-clamp" style="font-size:28px;font-weight:500;line-height:1.2"></div>
        <div data-caption class="ph-clamp" style="font-size:18px;color:#E6E9ED;line-height:1.3"></div>
        <div class="ph-more" data-more>Read all ›</div>
      </button>
      <div data-dots style="display:flex;gap:8px;font-size:16px;font-weight:600"></div>
    </div>
    <div class="ph-arrow" data-arrow style="left:28px">‹</div>
    <div class="ph-arrow" data-arrow style="right:28px">›</div>
    <div class="ph-hint" data-hint></div>
    <div data-empty style="display:none;position:absolute;top:0;left:0;right:0;bottom:220px;align-items:center;justify-content:center;flex-direction:column;gap:20px;text-align:center">
      <div style="width:380px;height:220px;display:flex;align-items:center;justify-content:center;border-radius:190px/110px;background:rgba(255,255,255,.06)"><div style="width:340px">${framesArt()}</div></div>
      <div class="display" style="font-size:44px;font-weight:500">No photos yet</div>
      <div style="font-size:20px;color:#E6E9ED">Send some from a phone on the same Wi-Fi${feature('camera') ? ', or take one right here' : ''}.</div>
      <div style="display:flex;gap:14px">
        <a href="#/addphotos" class="pill ph-pill" style="background:#fff;color:#1D2430">Add photos from a phone</a>
        ${feature('camera') ? '<a href="#/camera" class="pill ph-pill" style="background:rgba(255,255,255,.16)">📷 Take a photo</a>' : ''}
      </div>
    </div>
    <div style="position:absolute;top:104px;left:32px;display:flex;flex-direction:column;align-items:flex-start;gap:10px">
      <button class="ph-badge" data-held aria-label="Carry on with the slideshow"></button>
      <div style="display:flex;gap:10px;align-items:center">
        <div class="ph-badge" data-vbadge>▶ Video</div>
        <button class="ph-badge" data-sound></button>
      </div>
    </div>
    <div style="position:absolute;top:32px;right:32px;display:flex;gap:10px">
      ${feature('camera') ? '<a href="#/camera" class="pill ph-pill">📷 Camera</a>' : ''}
      <button data-album-open class="pill ph-pill" style="display:none">▦ All photos</button>
      <button data-hold class="pill ph-pill" style="display:none">⏸ Hold</button>
      <button data-remove class="pill ph-pill" style="display:none">Remove</button>
      <a href="#/addphotos" class="pill ph-pill">+ Add photos</a>
      <a href="#/${homeRoute}" class="pill ph-pill">Home</a>
    </div>
    <div class="ph-album" data-album>
      <div class="ph-ahead">
        <div style="flex:1;min-width:0">
          <div class="display" data-album-title style="font-size:34px;font-weight:500">All photos</div>
          <div data-album-sub style="font-size:17px;color:#C9D0D8;margin-top:2px"></div>
        </div>
        ${canRemove ? '<button data-pick class="pill ph-pill" style="background:rgba(255,255,255,.12)">Choose photos to remove</button>' : ''}
        <button data-album-close class="pill ph-pill" style="background:#fff;color:#1D2430">‹ Back to the slideshow</button>
      </div>
      <div class="ph-grid" data-grid></div>
      <div class="ph-selbar">
        <div data-picked style="flex:1;font-size:20px;font-weight:600"></div>
        <button data-pick-all class="pill ph-pill" style="background:rgba(255,255,255,.12)">Choose all</button>
        <button data-pick-cancel class="pill ph-pill" style="background:rgba(255,255,255,.12)">Cancel</button>
        <button data-pick-remove class="pill ph-pill" style="background:#C2491F" disabled>Remove</button>
      </div>
    </div>
    <div class="ph-full" data-full>
      <div style="background:#fff;color:#1D2430;border-radius:24px;padding:34px 40px;width:720px;max-height:640px;overflow-y:auto">
        <div data-full-title class="display" style="font-size:32px;font-weight:500;line-height:1.2"></div>
        <div data-full-line style="font-size:20px;line-height:1.45;color:#4A5363;margin-top:12px"></div>
        <div data-full-count style="font-size:17px;color:#6B7380;margin-top:14px"></div>
        <div style="display:flex;justify-content:flex-end;margin-top:22px">
          <button data-full-close class="pill" style="background:#ECEEF0;color:#1D2430">Close</button>
        </div>
      </div>
    </div>
    <div class="ph-ask" data-ask>
      <div style="background:#fff;color:#1D2430;border-radius:24px;padding:34px 40px;max-width:560px;text-align:center">
        <div data-ask-title class="display" style="font-size:32px;font-weight:500">Remove this photo?</div>
        <div data-ask-line style="font-size:19px;line-height:1.4;color:#4A5363;margin-top:10px">It comes off this screen for good.</div>
        <div style="display:flex;gap:12px;justify-content:center;margin-top:24px">
          <button data-keep class="pill" style="background:#ECEEF0;color:#1D2430">Keep it</button>
          <button data-really class="pill" style="background:#C2491F;color:#fff">Remove</button>
        </div>
      </div>
    </div>
    <div class="ph-toast" data-toast></div>
  </div>`;

  const $ = (s) => el.querySelector(s);
  const slidesEl = $('[data-slides]');
  const albumEl = $('[data-album]');
  const gridEl = $('[data-grid]');
  const askEl = $('[data-ask]');
  const fullEl = $('[data-full]');

  // The corner shows what the owner chose (Settings → Photo frame): the time and date, the
  // weather, both, or neither.
  function renderDate() {
    const n = clockParts();
    $('[data-time]').textContent = n.time;
    $('[data-ampm]').textContent = n.ampm;
    const wx = prefs.photoWeather ? weatherText : '';
    $('[data-date]').textContent = prefs.photoClock ? (wx ? `${n.date} · ${wx}` : n.date) : wx;
  }

  // ---- Little messages at the top ("New photo from Grandma", "Photo removed") ----
  let toastRun = null;
  function toast(text, action) {
    const t = $('[data-toast]');
    t.innerHTML = `<span>${esc(text)}</span>${action ? `<button>${esc(action.label)}</button>` : ''}`;
    t.classList.toggle('plain', !action);
    t.style.opacity = '1';
    t.style.pointerEvents = action ? 'auto' : 'none';
    toastRun = action ? action.run : null;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, action ? 15000 : 4500);
  }
  function hideToast() {
    const t = $('[data-toast]');
    t.style.opacity = '0';
    t.style.pointerEvents = 'none';
    toastRun = null;
  }
  $('[data-toast]').addEventListener('click', (e) => {
    e.stopPropagation();
    if (e.target.closest('button') && toastRun) { const run = toastRun; hideToast(); run(); }
  });

  // ---- Is anything holding the slideshow still? ----
  const busy = () => held || albumOpen || askOpen || fullOpen;

  /** Start the countdown to the next picture (unless something is holding it still). */
  function schedule() {
    clearTimeout(slideTimer);
    const p = photos[index];
    if (!p || busy() || photos.length < 2) return;
    if (p.video) { if (videoGo) slideTimer = setTimeout(videoGo, VIDEO_MAX_MS); }
    else slideTimer = setTimeout(next, slideMs());
  }

  /** Stop the slow zoom while held or covered (no point drawing what nobody sees). */
  function applyPaused() {
    const still = busy();
    [...slidesEl.children].forEach((s) => { s.style.animationPlayState = still ? 'paused' : ''; });
    if (currentVideo) {
      if (albumOpen) { try { currentVideo.pause(); } catch (e) { /* fine */ } }
      else if (currentVideo.paused && !currentVideo.ended) currentVideo.play?.().catch(() => {});
    }
  }

  // The soft, dark copy of the photo behind it. It used to be the photo itself with a live
  // blur, which this tablet's graphics chip can't keep up with. A tiny drawing stretched
  // over the screen looks the same and costs nothing.
  function softBackdrop(canvas, img) {
    const g = canvas.getContext('2d');
    const s = Math.max(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight);
    const w = img.naturalWidth * s, h = img.naturalHeight * s;
    g.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
    g.fillStyle = 'rgba(14,17,22,.5)';
    g.fillRect(0, 0, canvas.width, canvas.height);
  }

  // A file that won't open, and nothing else to move on to: say so instead of a blank screen.
  function markBroken(slide, video) {
    if (slide.querySelector('.ph-broken')) return;
    const box = document.createElement('div');
    box.className = 'ph-broken';
    box.innerHTML = `<div class="display" style="font-size:36px;font-weight:500">${video ? 'This video won’t play' : 'This photo won’t open'}</div>
      <div style="font-size:20px;color:#E6E9ED;line-height:1.4">It may not have arrived whole. Send it again from the phone${canRemove ? ', or take this one off with Remove at the top' : ''}.</div>`;
    slide.appendChild(box);
  }

  /** Show photo `i`. `quick`: somebody tapped, so change at once instead of the slow fade. */
  function show(i, quick) {
    index = i;
    const p = photos[i];
    currentVideo = null; videoGo = null;
    $('[data-empty]').style.display = 'none'; // (the album may have been empty a moment ago)
    // Never more than the old picture and the new one (tapping through quickly used to pile them up).
    while (slidesEl.children.length > 1) slidesEl.firstChild.remove();
    // The clip that was playing stops now, not when its slide has faded out.
    [...slidesEl.querySelectorAll('video')].forEach((v) => { try { v.pause(); } catch (e) { /* fine */ } });
    const slide = document.createElement('div');
    const pan = !p.video && prefs.photoZoom;
    slide.className = `ph-slide ${quick ? 'quick ' : ''}${pan ? (i % 2 ? 'pan-b' : 'pan-a') : ''}`;
    if (p.video) {
      // Play the clip (muted until somebody taps for sound), full-frame over black. Advance when it ends.
      slide.style.background = '#000';
      const v = document.createElement('video');
      v.src = encodeURI(p.src);
      v.muted = true; v.autoplay = true; v.playsInline = true;
      v.loop = held; // held: play it again and again instead of moving on
      v.style.cssText = 'position:absolute;top:6%;right:6%;bottom:6%;left:6%;width:88%;height:88%;object-fit:contain';
      // Move on when it ends, if it can't play, or after 70s at most (clips are ≤60s).
      let moved = false;
      const go = () => {
        if (moved || !el.isConnected || slidesEl.lastChild !== slide || photos.length < 2 || busy()) return;
        moved = true; next();
      };
      v.addEventListener('ended', go);
      v.addEventListener('error', () => {
        if (!el.isConnected || slidesEl.lastChild !== slide) return;
        if (photos.length > 1 && ++broken < photos.length && !busy()) go();
        else markBroken(slide, true);
      });
      v.addEventListener('playing', () => { broken = 0; });
      slide.appendChild(v);
      currentVideo = v; videoGo = go;
      v.play?.().catch(() => {});
    } else if (p.src) {
      // Whole photo (portrait ones too) over a blurred, darkened copy of itself.
      const u = `url('${encodeURI(p.src)}')`;
      slide.style.background = '#2A3038';
      slide.innerHTML = `
        <canvas class="ph-back" width="64" height="40"></canvas>
        <div style="position:absolute;top:6%;right:6%;bottom:6%;left:6%;background:${u} center/contain no-repeat"></div>`;
      // A missing or damaged file would leave a blank grey screen for a whole minute: skip it.
      const probe = new Image();
      probe.onload = () => {
        broken = 0;
        try { softBackdrop(slide.firstElementChild, probe); } catch (err) { /* plain dark is fine */ }
      };
      probe.onerror = () => {
        if (!el.isConnected || slidesEl.lastChild !== slide) return;
        // Skip it, unless it's the only one, every one is broken, or somebody is looking at it on purpose.
        if (photos.length > 1 && ++broken < photos.length && !busy()) next();
        else markBroken(slide, false);
      };
      probe.src = encodeURI(p.src);
    } else {
      slide.style.cssText = slideBg(p);
    }
    if (pan) {
      // The drift lasts as long as the picture stays, still at about five small steps a second.
      const ms = slideMs() + 3000;
      slide.style.animationDuration = `${ms}ms`;
      slide.style.animationTimingFunction = `steps(${Math.max(40, Math.min(300, Math.round(ms / 210)))}, end)`;
    }
    slidesEl.appendChild(slide);
    // Fade in on the next frame, then drop older slides once the fade is done.
    requestAnimationFrame(() => requestAnimationFrame(() => slide.classList.add('on')));
    clearTimeout(fadeTimer);
    fadeTimer = setTimeout(() => {
      while (slidesEl.children.length > 1 && slidesEl.firstChild !== slide) slidesEl.firstChild.remove();
    }, quick ? 600 : 3000);

    updateMeta();
    applyPaused();
    // Auto-advance: photos after their time is up; videos when they end (or 70 s at most).
    schedule();

    // Load the next photo in the background so it fades in whole, not half-drawn.
    const up = photos.length > 1 && photos[(i + 1) % photos.length];
    if (up && up.src && !up.video) { preload = new Image(); preload.src = encodeURI(up.src); }
  }

  /** Everything around the picture: caption, dots, buttons. (Also after the album changes.) */
  function updateMeta() {
    const p = photos[index];
    // (Settings can hide who sent it and when, for a frame that is only pictures.)
    const titleEl = $('[data-title]'), capEl = $('[data-caption]');
    titleEl.textContent = p && prefs.photoCaptions ? p.title : '';
    capEl.textContent = p && prefs.photoCaptions ? (p.line || '') : '';
    $('[data-more-btn]').style.display = p && prefs.photoCaptions && (p.title || p.line) ? '' : 'none';
    // "Read all" only when the words are cut off (measured once the text is laid out).
    $('[data-more]').style.display = 'none';
    requestAnimationFrame(() => {
      if (!el.isConnected) return;
      const cut = (e) => e.scrollHeight > e.clientHeight + 2;
      $('[data-more]').style.display = cut(titleEl) || cut(capEl) ? 'block' : 'none';
    });
    const dots = $('[data-dots]');
    if (photos.length === 1) {
      dots.textContent = 'The only photo so far';
    } else if (photos.length <= MAX_DOTS) {
      if (dots.children.length !== photos.length) dots.innerHTML = photos.map(() => '<div class="ph-dot"></div>').join('');
      [...dots.children].forEach((d, j) => d.classList.toggle('on', j === index));
    } else {
      dots.textContent = `${index + 1} / ${photos.length}`;
    }
    el.querySelectorAll('[data-arrow]').forEach((a) => { a.style.display = photos.length > 1 ? 'flex' : 'none'; });
    $('[data-remove]').style.display = canRemove && p && p.id ? '' : 'none';
    $('[data-album-open]').style.display = photos.length ? '' : 'none';
    $('[data-hold]').style.display = photos.length > 1 ? '' : 'none';
    if (held && photos.length < 2) { held = false; clearTimeout(holdTimer); } // nothing left to hold back
    // Videos: a sign that it is one, and a button to hear it.
    $('[data-vbadge]').style.display = p && p.video ? 'flex' : 'none';
    $('[data-sound]').style.display = p && p.video ? 'flex' : 'none';
    renderSound();
    renderHold();
  }

  function next() { show((index + 1) % photos.length); }

  /** One photo on (+1) or back (-1), saying so when it goes round to the other end. */
  function step(d) {
    if (photos.length < 2) return;
    let j = index + d;
    if (j >= photos.length) { j = 0; toast('Back to the first photo'); }
    else if (j < 0) { j = photos.length - 1; toast('That was the first one. Here’s the last photo'); }
    show(j, true);
  }

  // ---- Sound for videos (they start quiet: the frame may be playing to an empty kitchen) ----
  function renderSound() {
    const b = $('[data-sound]');
    const on = currentVideo && !currentVideo.muted;
    b.textContent = on ? '🔊 Sound on · tap for quiet' : '🔇 Tap for sound';
  }
  $('[data-sound]').addEventListener('click', (e) => {
    e.stopPropagation();
    const v = currentVideo;
    if (!v) return;
    v.muted = !v.muted;
    if (!v.muted) {
      const tried = v.play?.();
      if (tried && tried.catch) tried.catch(() => { if (currentVideo === v) { v.muted = true; v.play?.().catch(() => {}); renderSound(); toast('The sound couldn’t start. Try once more'); } });
    }
    renderSound();
  });

  // ---- Hold: keep this picture up for a while ----
  function renderHold() {
    $('[data-hold]').textContent = held ? '▶ Carry on' : '⏸ Hold';
    const badge = $('[data-held]');
    badge.style.display = held ? 'flex' : 'none';
  }
  function setHeld(on) {
    held = on;
    clearTimeout(holdTimer);
    if (on) {
      const until = new Date(Date.now() + HOLD_MS);
      $('[data-held]').textContent = `⏸ Held · moves on by itself at ${timeText(until)} · tap to carry on`;
      holdTimer = setTimeout(() => { if (el.isConnected) setHeld(false); }, HOLD_MS);
    }
    if (currentVideo) currentVideo.loop = on;
    renderHold();
    applyPaused();
    schedule();
  }
  $('[data-hold]').addEventListener('click', (e) => { e.stopPropagation(); setHeld(!held); });
  $('[data-held]').addEventListener('click', (e) => { e.stopPropagation(); setHeld(false); });

  // ---- The whole caption, when it's too long for the bottom corner ----
  $('[data-more-btn]').addEventListener('click', (e) => {
    e.stopPropagation();
    const p = photos[index];
    if (!p) return;
    $('[data-full-title]').textContent = p.title || '';
    $('[data-full-line]').textContent = p.line || '';
    $('[data-full-count]').textContent = photos.length > 1 ? `Photo ${index + 1} of ${photos.length}` : '';
    fullEl.style.display = 'flex';
    fullOpen = true;
    applyPaused(); schedule();
  });
  fullEl.addEventListener('click', (e) => {
    e.stopPropagation();
    if (e.target === fullEl || e.target.closest('[data-full-close]')) {
      fullEl.style.display = 'none';
      fullOpen = false;
      applyPaused(); schedule();
    }
  });

  // ---- Taking pictures off the screen (one here, or several from the album) ----
  let askIds = [];
  function openAsk(ids) {
    askIds = ids;
    const one = ids.length === 1 && photos.find((p) => p.id === ids[0]);
    const vids = photos.filter((p) => ids.indexOf(p.id) >= 0 && p.video).length;
    $('[data-ask-title]').textContent = ids.length === 1
      ? (one && one.video ? 'Remove this video?' : 'Remove this photo?')
      : `Remove these ${ids.length} ${vids === ids.length ? 'videos' : vids ? 'photos and videos' : 'photos'}?`;
    $('[data-ask-line]').textContent = ids.length === 1 ? 'It comes off this screen for good.' : 'They come off this screen for good.';
    $('[data-really]').textContent = ids.length === 1 ? 'Remove' : `Remove ${ids.length}`;
    askEl.style.display = 'flex';
    askOpen = true;
    applyPaused(); schedule();
  }
  function closeAsk() {
    askEl.style.display = 'none';
    askOpen = false;
    askIds = [];
    applyPaused(); schedule(); // the pictures stood still while the question was up
  }
  $('[data-remove]').addEventListener('click', (e) => {
    e.stopPropagation();
    const p = photos[index];
    if (p && p.id) openAsk([p.id]);
  });
  askEl.addEventListener('click', (e) => {
    e.stopPropagation(); // not a tap on the photo
    if (e.target.closest('[data-really]')) {
      const ids = askIds.slice();
      const many = ids.length > 1;
      // (The album tells us it changed, and the frame and grid follow: see onPhotosChanged below.)
      const gone = many ? removePhotos(ids) : (removePhoto(ids[0]) ? 1 : 0);
      if (!gone) { $('[data-ask-line]').textContent = 'That didn’t work. Try again in a moment.'; return; }
      closeAsk();
      if (many) { picked = {}; setPicking(false); }
      toast(gone === 1 ? (many ? '1 removed. The others couldn’t be' : 'Removed') : `${gone} removed${gone < ids.length ? `. ${ids.length - gone} couldn’t be` : ''}`);
    } else if (e.target.closest('[data-keep]') || e.target === askEl) {
      closeAsk();
    }
  });

  // ---- The album: everything on the screen, as a grid ----
  let picking = false;
  let picked = {}; // id -> true
  const albumOrder = () => photos.slice().sort((a, b) => (b.added || 0) - (a.added || 0)); // newest first, even when mixed up

  function loadThumb(b) {
    if (b.__queued || b.__done) return;
    b.__queued = true;
    thumbnail(b.__src, { w: TILE_W, h: TILE_H, wanted: () => el.isConnected && albumOpen && b.isConnected && b.__seen })
      .then((url) => {
        b.__queued = false;
        if (url === null || !b.isConnected) return; // scrolled past before its turn: tried again when it's back
        b.__done = true;
        const t = b.firstElementChild;
        if (url) t.style.backgroundImage = `url(${url})`;
        else t.insertAdjacentHTML('beforeend', '<div class="ph-tbroken">This one won’t open</div>');
      });
  }

  function tile(p) {
    const b = document.createElement('button');
    b.className = `ph-tile${photos[index] && photos[index].id === p.id ? ' cur' : ''}${picked[p.id] ? ' sel' : ''}`;
    b.__id = p.id;
    const label = [p.day, p.name].filter(Boolean).join(' · ') || p.title || '';
    b.innerHTML = `<div class="ph-thumb">${p.video ? '<div class="ph-tplay">▶</div>' : ''}<div class="ph-tick">✓</div></div><div class="ph-tlabel">${esc(label)}</div>`;
    if (!p.src) b.firstElementChild.style.background = p.art || '#2A3038';
    else if (!p.video) {
      b.__src = p.src;
      if (io) io.observe(b); else { b.__seen = true; loadThumb(b); }
    }
    return b;
  }

  function renderAlbum(scrollToCurrent) {
    const token = {};
    renderAlbum.token = token;
    if (io) io.disconnect();
    io = window.IntersectionObserver ? new IntersectionObserver((entries) => {
      entries.forEach((en) => { en.target.__seen = en.isIntersecting; if (en.isIntersecting) loadThumb(en.target); });
    }, { root: gridEl, rootMargin: '240px 0px' }) : null;
    const keep = gridEl.scrollTop;
    gridEl.innerHTML = '';
    const list = albumOrder();
    const vids = list.filter((p) => p.video).length;
    $('[data-album-title]').textContent = vids ? `All photos and videos (${list.length})` : `All photos (${list.length})`;
    $('[data-album-sub]').textContent = list.length
      ? `Newest first. Tap one to show it${canRemove ? ', or “Choose photos to remove” to take several off at once' : ''}.`
      : 'Nothing on this screen yet.';
    renderPicked();
    let at = 0;
    const chunk = () => {
      if (renderAlbum.token !== token || alive !== visit || !albumOpen) return;
      const frag = document.createDocumentFragment();
      list.slice(at, at + CHUNK).forEach((p) => frag.appendChild(tile(p)));
      at += CHUNK;
      gridEl.appendChild(frag);
      if (scrollToCurrent) {
        const cur = gridEl.querySelector('.ph-tile.cur');
        if (cur) { scrollToCurrent = false; gridEl.scrollTop = Math.max(0, cur.offsetTop - 160); }
      } else if (keep && gridEl.scrollTop < keep) gridEl.scrollTop = keep;
      if (at < list.length) setTimeout(chunk, 40);
    };
    chunk();
  }

  function renderPicked() {
    const n = Object.keys(picked).length;
    $('[data-picked]').textContent = n ? `${plural(n, 'photo')} chosen` : 'Tap the photos to take off';
    const btn = $('[data-pick-remove]');
    btn.disabled = !n;
    btn.textContent = n ? `Remove ${n}` : 'Remove';
    $('[data-pick-all]').textContent = n && n === photos.length ? 'Choose none' : 'Choose all';
  }
  function setPicking(on) {
    picking = on;
    if (!on) picked = {};
    albumEl.classList.toggle('picking', on);
    [...gridEl.children].forEach((t) => t.classList.toggle('sel', !!picked[t.__id]));
    renderPicked();
  }

  function openAlbum() {
    if (!photos.length) return;
    albumOpen = true;
    albumEl.style.display = 'block';
    hideHint();
    applyPaused(); schedule();
    renderAlbum(true);
  }
  function closeAlbum() {
    albumOpen = false;
    setPicking(false);
    albumEl.style.display = 'none';
    if (io) { io.disconnect(); io = null; }
    gridEl.innerHTML = ''; // the small pictures are kept (tablet-photos.js); the tiles needn't be
    applyPaused(); schedule();
  }
  $('[data-album-open]').addEventListener('click', (e) => { e.stopPropagation(); openAlbum(); });
  albumEl.addEventListener('click', (e) => {
    e.stopPropagation(); // never a tap on the photo behind
    const t = e.target.closest('.ph-tile');
    if (t) {
      if (picking) {
        if (picked[t.__id]) delete picked[t.__id]; else picked[t.__id] = true;
        t.classList.toggle('sel', !!picked[t.__id]);
        renderPicked();
        return;
      }
      const i = photos.findIndex((p) => p.id === t.__id);
      closeAlbum();
      if (i >= 0) show(i, true);
      return;
    }
    if (e.target.closest('[data-album-close]')) closeAlbum();
    else if (e.target.closest('[data-pick]')) setPicking(!picking);
    else if (e.target.closest('[data-pick-cancel]')) setPicking(false);
    else if (e.target.closest('[data-pick-all]')) {
      const all = Object.keys(picked).length === photos.length;
      picked = {};
      if (!all) photos.forEach((p) => { picked[p.id] = true; });
      setPicking(true);
    } else if (e.target.closest('[data-pick-remove]')) {
      const ids = Object.keys(picked);
      if (ids.length) openAsk(ids);
    }
  });

  // ---- First steps ----
  function hideHint() { clearTimeout(hintTimer); $('[data-hint]').style.opacity = '0'; }
  function showHint() {
    const h = $('[data-hint]');
    h.textContent = photos.length > 1 ? 'Tap the sides (or swipe) for other photos · Tap the middle for Home' : 'Tap anywhere for Home';
    h.style.opacity = '1';
    clearTimeout(hintTimer);
    hintTimer = setTimeout(hideHint, 7000);
  }

  function start(at = 0) {
    clearTimeout(slideTimer);
    $('[data-empty]').style.display = photos.length ? 'none' : 'flex';
    if (!photos.length) {
      slidesEl.innerHTML = '';
      currentVideo = null; videoGo = null;
      if (held) setHeld(false);
      if (albumOpen) closeAlbum();
      index = 0;
      updateMeta();
      $('[data-more-btn]').style.display = 'none';
      $('[data-dots]').innerHTML = '';
      hideHint();
      return;
    }
    show(Math.max(0, Math.min(at, photos.length - 1)));
  }

  // Opened at a particular photo (#/photos/show/<id>), or straight into the album (#/photos/album).
  const wantId = args[0] === 'show' ? args[1] : null;
  const startAt = wantId ? photos.findIndex((p) => p.id === wantId) : 0;
  start(startAt > 0 ? startAt : 0);
  if (args[0] === 'album') openAlbum();
  else if (photos.length) showHint();
  clockTimer = setInterval(renderDate, 10000);

  // A phone just sent photos, or some were removed (here or from the phone page).
  offPhotos = onPhotosChanged(() => {
    if (!el.isConnected) return;
    const cur = photos[index] && photos[index].id;
    const had = {};
    photos.forEach((p) => { had[p.id] = true; });
    const fresh = loadAlbum();
    const still = {};
    fresh.forEach((p) => { still[p.id] = true; });
    const arrived = fresh.filter((p) => !had[p.id]).sort((a, b) => (b.added || 0) - (a.added || 0));
    // Mixed up: keep the order the others were already in, with the new ones first.
    photos = prefs.photoShuffle ? arrived.concat(photos.filter((p) => still[p.id])) : fresh;
    Object.keys(picked).forEach((id) => { if (!still[id]) delete picked[id]; });
    if (askOpen && askIds.some((id) => !still[id])) closeAsk(); // what it asked about is gone already
    if (!photos.length) { start(); return; }

    const curAt = photos.findIndex((p) => p.id === cur);
    if (arrived.length) {
      const names = [...new Set(arrived.map((p) => p.name).filter(Boolean))];
      const vids = arrived.filter((p) => p.video).length;
      const what = arrived.length === 1 ? (vids ? 'New video' : 'New photo') : `${arrived.length} new ${vids === arrived.length ? 'videos' : vids ? 'photos and videos' : 'photos'}`;
      const text = `${what}${names.length === 1 ? ` from ${names[0]}` : ''}`;
      if (busy() && curAt >= 0) {
        // Somebody is looking at something on purpose: don't snatch it away, offer it instead.
        index = curAt;
        updateMeta();
        const firstNew = arrived[0].id;
        toast(text, { label: 'Show', run: () => {
          if (albumOpen) closeAlbum();
          if (held) setHeld(false);
          const i = photos.findIndex((p) => p.id === firstNew);
          show(i >= 0 ? i : 0, true);
        } });
      } else {
        show(photos.findIndex((p) => p.id === arrived[0].id), true);
        toast(text);
      }
    } else if (curAt >= 0) {
      index = curAt; // the one on screen is still here: carry on with it
      updateMeta();
    } else {
      show(Math.min(index, photos.length - 1), true); // it was removed: the next one takes its place
    }
    if (albumOpen) renderAlbum(false);
  });

  // Tap the left or right side to go back / forward a photo; tap the middle to go home.
  const onTap = (e) => {
    if (e.target.closest('a, button, [data-album], [data-ask], [data-full], [data-toast]')) return;
    const r = $('[data-root]').getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    if (photos.length > 1 && x < 0.22) step(-1);
    else if (photos.length > 1 && x > 0.78) step(1);
    else location.hash = `#/${homeRoute}`;
  };
  $('[data-root]').addEventListener('click', onTap);

  // A swipe left or right works too (a finger that moves is never a tap, so it never goes Home).
  let sx = null, sy = 0, st = 0;
  const root = $('[data-root]');
  root.addEventListener('touchstart', (e) => {
    sx = null;
    if (e.touches.length !== 1 || busy() || e.target.closest('[data-album], [data-ask], [data-full]')) return;
    sx = e.touches[0].clientX; sy = e.touches[0].clientY; st = Date.now();
  }, { passive: true });
  root.addEventListener('touchend', (e) => {
    if (sx == null) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - sx, dy = t.clientY - sy;
    sx = null;
    const wide = root.getBoundingClientRect().width / 1280; // the stage may be drawn smaller
    if (Math.abs(dx) > 70 * wide && Math.abs(dx) > Math.abs(dy) * 1.5 && Date.now() - st < 900) step(dx < 0 ? 1 : -1);
  }, { passive: true });

  // The frame can stay up all day, so keep the temperature fresh (the weather service caches it).
  const loadWeather = async () => {
    try {
      const w = await getWeather(await getLocation());
      if (!el.isConnected) return;
      weatherText = `${w.temp}° ${describe(w.code).label}`;
      renderDate();
    } catch (err) {
      console.error(err);
    }
  };
  if (prefs.photoWeather) { // (not fetched at all when the owner switched it off)
    loadWeather();
    weatherTimer = setInterval(loadWeather, 15 * 60 * 1000);
  }
}

export function unmount() {
  alive = null;
  clearInterval(clockTimer);
  clearInterval(weatherTimer);
  clearTimeout(slideTimer);
  clearTimeout(fadeTimer);
  clearTimeout(holdTimer);
  clearTimeout(toastTimer);
  clearTimeout(hintTimer);
  if (io) { io.disconnect(); io = null; }
  offPhotos?.();
}
