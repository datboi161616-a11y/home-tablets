// Family · Full-screen photo frame (Photos.dc.html in the design)
// Slow pan on each photo, cross-fade to the next one every minute.
// Tap anywhere to go back home.
import { getLocation } from '../services/location.js';
import { getWeather, describe } from '../services/weather.js';
// On the tablet: its own album (sent from phones, see addphotos.js).
// In a normal browser: sample pictures, so the screen can still be previewed.
import { photos as samplePhotos } from '../services/family-sample.js';
import { isTablet, getPhotos, onPhotosChanged } from '../services/tablet-photos.js';
import { feature } from '../services/features.js';

const SLIDE_MS = 60 * 1000;
let clockTimer, slideTimer, fadeTimer, offPhotos;

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

export function mount(el) {
  const c = clockParts();
  let photos = loadAlbum();
  let index = 0;
  let weatherText = '';

  el.innerHTML = `
  <style>
    .ph-root{position:absolute;top:0;right:0;bottom:0;left:0;background:#2A3038;color:#fff;overflow:hidden;cursor:pointer}
    .ph-slide{position:absolute;top:-6%;right:-6%;bottom:-6%;left:-6%;opacity:0;transition:opacity 2.5s ease}
    .ph-slide.on{opacity:1}
    .ph-slide.pan-a{animation:ph-pan-a ${SLIDE_MS + 3000}ms linear forwards}
    .ph-slide.pan-b{animation:ph-pan-b ${SLIDE_MS + 3000}ms linear forwards}
    @keyframes ph-pan-a{from{transform:scale(1) translate(0,0)}to{transform:scale(1.08) translate(-2%,-1.5%)}}
    @keyframes ph-pan-b{from{transform:scale(1.08) translate(-2%,1%)}to{transform:scale(1) translate(1.5%,0)}}
    .ph-dot{height:8px;width:8px;border-radius:4px;background:rgba(255,255,255,.5);transition:width .4s,background .4s}
    .ph-dot.on{width:28px;background:#fff}
  </style>
  <div class="ph-root" data-root>
    <div data-slides></div>
    <div style="position:absolute;left:0;right:0;bottom:0;height:220px;background:rgba(10,12,16,.55)"></div>
    <div style="position:absolute;left:48px;bottom:40px;display:flex;flex-direction:column;gap:6px">
      <div data-time class="display" style="font-weight:300;font-size:96px;line-height:1;letter-spacing:-3px">${c.time}</div>
      <div data-date style="font-size:22px;font-weight:500">${c.date}</div>
    </div>
    <div style="position:absolute;right:48px;bottom:44px;display:flex;flex-direction:column;align-items:flex-end;gap:14px;max-width:620px;text-align:right">
      <div data-title class="display" style="font-size:28px;font-weight:500"></div>
      <div data-caption style="font-size:18px;color:#E6E9ED"></div>
      <div data-dots style="display:flex;gap:8px;font-size:16px;font-weight:600"></div>
    </div>
    <div data-empty style="display:none;position:absolute;top:0;left:0;right:0;bottom:220px;align-items:center;justify-content:center;flex-direction:column;gap:20px;text-align:center">
      <div class="display" style="font-size:44px;font-weight:500">No photos yet</div>
      <div style="font-size:20px;color:#E6E9ED">Send some from a phone on the same Wi-Fi.</div>
      <a href="#/addphotos" class="pill" style="background:#fff;color:#1D2430;font-size:18px;padding:14px 26px">Add photos</a>
    </div>
    <div style="position:absolute;top:32px;right:32px;display:flex;gap:12px">
      ${feature('camera') ? '<a href="#/camera" class="pill" style="min-width:44px;background:rgba(10,12,16,.55);color:#fff">📷 Camera</a>' : ''}
      <a href="#/addphotos" class="pill" style="min-width:44px;background:rgba(10,12,16,.55);color:#fff">+ Add photos</a>
      <a href="#/home" class="pill" style="min-width:44px;background:rgba(10,12,16,.55);color:#fff">Home</a>
    </div>
  </div>`;

  const $ = (s) => el.querySelector(s);
  const slidesEl = $('[data-slides]');

  function renderDate() {
    const n = clockParts();
    $('[data-time]').textContent = n.time;
    $('[data-date]').textContent = weatherText ? `${n.date} · ${weatherText}` : n.date;
  }

  function show(i) {
    index = i;
    const p = photos[i];
    const slide = document.createElement('div');
    slide.className = `ph-slide ${p.video ? '' : i % 2 ? 'pan-b' : 'pan-a'}`;
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
        <div style="position:absolute;top:0;right:0;bottom:0;left:0;background:${u} center/cover no-repeat;filter:blur(28px) brightness(.55);transform:scale(1.1)"></div>
        <div style="position:absolute;top:6%;right:6%;bottom:6%;left:6%;background:${u} center/contain no-repeat"></div>`;
    } else {
      slide.style.cssText = slideBg(p);
    }
    slidesEl.appendChild(slide);
    // Fade in on the next frame, then drop older slides once the fade is done.
    requestAnimationFrame(() => requestAnimationFrame(() => slide.classList.add('on')));
    clearTimeout(fadeTimer);
    fadeTimer = setTimeout(() => {
      while (slidesEl.children.length > 1 && slidesEl.firstChild !== slide) slidesEl.firstChild.remove();
    }, 3000);

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
  }

  function next() { show((index + 1) % photos.length); }

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
      return;
    }
    show(0); // newest first
  }

  start();
  clockTimer = setInterval(renderDate, 10000);

  // A phone just sent photos (or one was removed): reload, newest first.
  offPhotos = onPhotosChanged(() => { photos = loadAlbum(); start(); });

  // Tap the left or right side to go back / forward a photo; tap the middle to go home.
  const onTap = (e) => {
    if (e.target.closest('a')) return;
    const r = $('[data-root]').getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    if (photos.length > 1 && x < 0.22) show((index - 1 + photos.length) % photos.length);
    else if (photos.length > 1 && x > 0.78) next();
    else location.hash = '#/home';
  };
  $('[data-root]').addEventListener('click', onTap);

  (async () => {
    try {
      const w = await getWeather(await getLocation());
      if (!el.isConnected) return;
      weatherText = `${w.temp}° ${describe(w.code).label}`;
      renderDate();
    } catch (err) {
      console.error(err);
    }
  })();
}

export function unmount() {
  clearInterval(clockTimer);
  clearTimeout(slideTimer);
  clearTimeout(fadeTimer);
  offPhotos?.();
}
