// Family · Full-screen photo frame (Photos.dc.html in the design)
// Slow pan on each photo, cross-fade to the next one every minute.
// Tap anywhere to go back home.
import { getLocation } from '../services/location.js';
import { getWeather, describe } from '../services/weather.js';
// On the tablet: its own album (sent from phones, see addphotos.js).
// In a normal browser: sample pictures, so the screen can still be previewed.
import { photos as samplePhotos } from '../services/family-sample.js';
import { isTablet, getPhotos, onPhotosChanged, canRemovePhotos, removePhoto } from '../services/tablet-photos.js';
import { feature } from '../services/features.js';
import { framesArt } from '../art.js';

const SLIDE_MS = 60 * 1000;
let clockTimer, slideTimer, fadeTimer, weatherTimer, offPhotos;

function clockParts() {
  const now = new Date();
  return {
    time: `${((now.getHours() + 11) % 12) + 1}:${String(now.getMinutes()).padStart(2, '0')}`,
    date: now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }),
  };
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// Real photos (src) win; gradients are the stand-in until the backend exists.
const slideBg = (p) => (p.src
  ? `background:#2A3038 url('${encodeURI(p.src)}') center/cover no-repeat`
  : `background:${p.art}`);

function loadAlbum() {
  if (isTablet()) return getPhotos();
  return samplePhotos.map((p) => ({ ...p, line: `${p.caption} · Added by ${p.addedBy}` }));
}

const MAX_DOTS = 12;

export function mount(el, { homeRoute = 'home' } = {}) {
  const c = clockParts();
  let photos = loadAlbum();
  let index = 0;
  let weatherText = '';
  let broken = 0; // photos in a row that wouldn't load
  let preload = null;

  el.innerHTML = `
  <style>
    .ph-root{position:absolute;top:0;right:0;bottom:0;left:0;background:#2A3038;color:#fff;overflow:hidden;cursor:pointer}
    /* will-change: the slide is drawn once and then only moved. Without it the tablet drew
       the whole picture again for every step of the slow zoom: under one frame a second. */
    .ph-slide{position:absolute;top:-6%;right:-6%;bottom:-6%;left:-6%;opacity:0;transition:opacity 2.5s ease;will-change:transform,opacity}
    .ph-slide.quick{transition-duration:.35s}
    .ph-slide.on{opacity:1}
    .ph-back{position:absolute;top:0;left:0;width:100%;height:100%}
    .ph-ask{display:none;position:absolute;top:0;right:0;bottom:0;left:0;background:rgba(10,12,16,.62);align-items:center;justify-content:center;cursor:default}
    .ph-ask button{border:0;font-family:inherit;cursor:pointer;font-size:18px;padding:14px 28px}
    /* In 600 small steps, not 60 times a second: the picture moves a fifth of a pixel per
       step either way, and the tablet draws about ten frames a second instead of sixty
       (measured: the smooth version kept a processor core and a half busy all day). */
    .ph-slide.pan-a{animation:ph-pan-a ${SLIDE_MS + 3000}ms steps(600, end) forwards}
    .ph-slide.pan-b{animation:ph-pan-b ${SLIDE_MS + 3000}ms steps(600, end) forwards}
    @keyframes ph-pan-a{from{transform:scale(1) translate(0,0)}to{transform:scale(1.08) translate(-2%,-1.5%)}}
    @keyframes ph-pan-b{from{transform:scale(1.08) translate(-2%,1%)}to{transform:scale(1) translate(1.5%,0)}}
    .ph-dot{height:8px;width:8px;border-radius:4px;background:rgba(255,255,255,.5);transition:width .4s,background .4s}
    .ph-dot.on{width:28px;background:#fff}
    .ph-clamp{overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;max-width:620px}
    .ph-arrow{position:absolute;top:50%;margin-top:-32px;width:64px;height:64px;border-radius:32px;background:rgba(10,12,16,.4);color:#fff;
      display:none;align-items:center;justify-content:center;font-size:40px;line-height:1;opacity:.75;pointer-events:none}
  </style>
  <div class="ph-root" data-root>
    <div data-slides></div>
    <div style="position:absolute;left:0;right:0;bottom:0;height:220px;background:rgba(10,12,16,.55)"></div>
    <div style="position:absolute;left:48px;bottom:40px;display:flex;flex-direction:column;gap:6px">
      <div data-time class="display" style="font-weight:300;font-size:96px;line-height:1;letter-spacing:-3px">${c.time}</div>
      <div data-date style="font-size:22px;font-weight:500">${c.date}</div>
    </div>
    <div style="position:absolute;right:48px;bottom:44px;display:flex;flex-direction:column;align-items:flex-end;gap:14px;max-width:620px;text-align:right">
      <div data-title class="display ph-clamp" style="font-size:28px;font-weight:500;line-height:1.2"></div>
      <div data-caption class="ph-clamp" style="font-size:18px;color:#E6E9ED;line-height:1.3"></div>
      <div data-dots style="display:flex;gap:8px;font-size:16px;font-weight:600"></div>
    </div>
    <div class="ph-arrow" data-arrow style="left:28px">‹</div>
    <div class="ph-arrow" data-arrow style="right:28px">›</div>
    <div data-empty style="display:none;position:absolute;top:0;left:0;right:0;bottom:220px;align-items:center;justify-content:center;flex-direction:column;gap:20px;text-align:center">
      <div style="width:380px;height:220px;display:flex;align-items:center;justify-content:center;border-radius:190px/110px;background:rgba(255,255,255,.06)"><div style="width:340px">${framesArt()}</div></div>
      <div class="display" style="font-size:44px;font-weight:500">No photos yet</div>
      <div style="font-size:20px;color:#E6E9ED">Send some from a phone on the same Wi-Fi.</div>
      <a href="#/addphotos" class="pill" style="background:#fff;color:#1D2430;font-size:18px;padding:14px 26px">Add photos</a>
    </div>
    <div style="position:absolute;top:32px;right:32px;display:flex;gap:12px">
      ${feature('camera') ? '<a href="#/camera" class="pill" style="min-width:44px;background:rgba(10,12,16,.55);color:#fff">📷 Camera</a>' : ''}
      <button data-remove class="pill" style="display:none;border:0;font-family:inherit;cursor:pointer;min-width:44px;background:rgba(10,12,16,.55);color:#fff">Remove</button>
      <a href="#/addphotos" class="pill" style="min-width:44px;background:rgba(10,12,16,.55);color:#fff">+ Add photos</a>
      <a href="#/${homeRoute}" class="pill" style="min-width:44px;background:rgba(10,12,16,.55);color:#fff">Home</a>
    </div>
    <div class="ph-ask" data-ask>
      <div style="background:#fff;color:#1D2430;border-radius:24px;padding:34px 40px;max-width:540px;text-align:center">
        <div data-ask-title class="display" style="font-size:32px;font-weight:500">Remove this photo?</div>
        <div data-ask-line style="font-size:18px;line-height:1.4;color:#4A5363;margin-top:10px">It comes off this screen for good.</div>
        <div style="display:flex;gap:12px;justify-content:center;margin-top:24px">
          <button data-keep class="pill" style="background:#ECEEF0;color:#1D2430">Keep it</button>
          <button data-really class="pill" style="background:#C2491F;color:#fff">Remove</button>
        </div>
      </div>
    </div>
  </div>`;

  const $ = (s) => el.querySelector(s);
  const slidesEl = $('[data-slides]');

  function renderDate() {
    const n = clockParts();
    $('[data-time]').textContent = n.time;
    $('[data-date]').textContent = weatherText ? `${n.date} · ${weatherText}` : n.date;
  }

  // The soft, dark copy of the photo behind it. It used to be the photo itself with a live
  // blur, which this tablet's graphics chip can't keep up with. A tiny drawing stretched
  // over the screen looks the same and costs nothing.
  function softBackdrop(canvas, img) {
    const c = canvas.getContext('2d');
    const s = Math.max(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight);
    const w = img.naturalWidth * s, h = img.naturalHeight * s;
    c.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
    c.fillStyle = 'rgba(14,17,22,.5)';
    c.fillRect(0, 0, canvas.width, canvas.height);
  }

  /** Show photo `i`. `quick`: somebody tapped, so change at once instead of the slow fade. */
  function show(i, quick) {
    index = i;
    const p = photos[i];
    // Never more than the old picture and the new one (tapping through quickly used to pile them up).
    while (slidesEl.children.length > 1) slidesEl.firstChild.remove();
    const slide = document.createElement('div');
    slide.className = `ph-slide ${quick ? 'quick ' : ''}${p.video ? '' : i % 2 ? 'pan-b' : 'pan-a'}`;
    if (p.video) {
      // Play the clip (muted), full-frame over black. Advance when it ends.
      slide.style.background = '#000';
      const v = document.createElement('video');
      v.src = encodeURI(p.src);
      v.muted = true; v.autoplay = true; v.playsInline = true;
      v.style.cssText = 'position:absolute;top:0;right:0;bottom:0;left:0;width:100%;height:100%;object-fit:contain';
      // Move on when it ends, if it can't play, or after 70s at most (clips are ≤60s).
      let moved = false;
      const go = () => { if (!moved && el.isConnected && slidesEl.lastChild === slide && photos.length > 1) { moved = true; next(); } };
      v.addEventListener('ended', go);
      v.addEventListener('error', go);
      clearTimeout(slideTimer);
      slideTimer = setTimeout(go, 70 * 1000);
      slide.appendChild(v);
      slide.appendChild(badge('▶ Video'));
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
        if (!el.isConnected || slidesEl.lastChild !== slide || photos.length < 2) return;
        if (++broken < photos.length) next();
      };
      probe.src = encodeURI(p.src);
    } else {
      slide.style.cssText = slideBg(p);
    }
    slidesEl.appendChild(slide);
    // Fade in on the next frame, then drop older slides once the fade is done.
    requestAnimationFrame(() => requestAnimationFrame(() => slide.classList.add('on')));
    clearTimeout(fadeTimer);
    fadeTimer = setTimeout(() => {
      while (slidesEl.children.length > 1 && slidesEl.firstChild !== slide) slidesEl.firstChild.remove();
    }, quick ? 600 : 3000);
    showRemove();

    $('[data-title]').textContent = p.title;
    $('[data-caption]').innerHTML = esc(p.line || '');
    const dots = $('[data-dots]');
    if (photos.length <= MAX_DOTS) {
      if (dots.children.length !== photos.length) dots.innerHTML = photos.map(() => '<div class="ph-dot"></div>').join('');
      [...dots.children].forEach((d, j) => d.classList.toggle('on', j === i));
    } else {
      dots.textContent = `${i + 1} / ${photos.length}`;
    }

    // Auto-advance: photos after SLIDE_MS; videos set their own timing above.
    if (!p.video) {
      clearTimeout(slideTimer);
      if (photos.length > 1) slideTimer = setTimeout(next, SLIDE_MS);
    }

    // Load the next photo in the background so it fades in whole, not half-drawn.
    const up = photos.length > 1 && photos[(i + 1) % photos.length];
    if (up && up.src && !up.video) { preload = new Image(); preload.src = encodeURI(up.src); }
    el.querySelectorAll('[data-arrow]').forEach((a) => { a.style.display = photos.length > 1 ? 'flex' : 'none'; });
  }

  function next() { show((index + 1) % photos.length); }

  // ---- Taking a picture off the screen ----
  const askEl = $('[data-ask]');
  let keepPlace = null; // after removing one, stay where we were instead of jumping to the newest
  function showRemove() {
    $('[data-remove]').style.display = canRemovePhotos() && photos[index] && photos[index].id ? '' : 'none';
  }
  function closeAsk(carryOn) {
    askEl.style.display = 'none';
    // The pictures stood still while the question was up.
    if (carryOn && photos.length > 1 && photos[index] && !photos[index].video) { clearTimeout(slideTimer); slideTimer = setTimeout(next, SLIDE_MS); }
  }
  $('[data-remove]').addEventListener('click', (e) => {
    e.stopPropagation();
    const p = photos[index];
    if (!p) return;
    clearTimeout(slideTimer);
    $('[data-ask-title]').textContent = p.video ? 'Remove this video?' : 'Remove this photo?';
    $('[data-ask-line]').textContent = 'It comes off this screen for good.';
    askEl.style.display = 'flex';
  });
  askEl.addEventListener('click', (e) => {
    e.stopPropagation(); // not a tap on the photo
    if (e.target.closest('[data-really]')) {
      const p = photos[index];
      keepPlace = index;
      if (p && removePhoto(p.id)) return; // the album tells us it changed (below)
      keepPlace = null;
      $('[data-ask-line]').textContent = 'That didn\u2019t work. Try again in a moment.';
    } else if (e.target.closest('[data-keep]') || e.target === askEl) {
      closeAsk(true);
    }
  });

  function badge(text) {
    const b = document.createElement('div');
    b.textContent = text;
    b.style.cssText = 'position:absolute;top:40px;left:48px;background:rgba(10,12,16,.6);padding:8px 16px;border-radius:999px;font-size:16px;font-weight:600;color:#fff';
    return b;
  }

  function start() {
    clearTimeout(slideTimer);
    $('[data-empty]').style.display = photos.length ? 'none' : 'flex';
    if (!photos.length) {
      slidesEl.innerHTML = '';
      $('[data-title]').textContent = '';
      $('[data-caption]').textContent = '';
      $('[data-dots]').innerHTML = '';
      el.querySelectorAll('[data-arrow]').forEach((a) => { a.style.display = 'none'; });
      showRemove();
      return;
    }
    show(0); // newest first
  }

  start();
  clockTimer = setInterval(renderDate, 10000);

  // A phone just sent photos (or one was removed): reload, newest first.
  offPhotos = onPhotosChanged(() => {
    photos = loadAlbum();
    const stay = keepPlace;
    keepPlace = null;
    closeAsk(false);
    if (stay == null || !photos.length) start();
    else show(Math.min(stay, photos.length - 1), true); // one was removed here: carry on from the same place
  });

  // Tap the left or right side to go back / forward a photo; tap the middle to go home.
  const onTap = (e) => {
    if (e.target.closest('a, button')) return;
    const r = $('[data-root]').getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    if (photos.length > 1 && x < 0.22) show((index - 1 + photos.length) % photos.length, true);
    else if (photos.length > 1 && x > 0.78) show((index + 1) % photos.length, true);
    else location.hash = `#/${homeRoute}`;
  };
  $('[data-root]').addEventListener('click', onTap);

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
  loadWeather();
  weatherTimer = setInterval(loadWeather, 15 * 60 * 1000);
}

export function unmount() {
  clearInterval(clockTimer);
  clearInterval(weatherTimer);
  clearTimeout(slideTimer);
  clearTimeout(fadeTimer);
  offPhotos?.();
}
