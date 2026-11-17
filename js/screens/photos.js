// Family · Full-screen photo frame (Photos.dc.html in the design)
// Slow pan on each photo, cross-fade to the next one every minute.
// Tap anywhere to go back home.
import { getLocation } from '../services/location.js';
import { getWeather, describe } from '../services/weather.js';
// TODO(backend): swap the sample album for the shared family photo feed.
import { photos } from '../services/family-sample.js';

const SLIDE_MS = 60 * 1000;
let clockTimer, slideTimer, fadeTimer;

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

export function mount(el) {
  const c = clockParts();
  let index = 0;
  let weatherText = '';

  el.innerHTML = `
  <style>
    .ph-root{position:absolute;inset:0;background:#2A3038;color:#fff;overflow:hidden;cursor:pointer}
    .ph-slide{position:absolute;inset:-6%;opacity:0;transition:opacity 2.5s ease}
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
      <div data-dots style="display:flex;gap:8px">
        ${photos.map(() => '<div class="ph-dot"></div>').join('')}
      </div>
    </div>
    <a href="#/home" class="pill" style="position:absolute;top:32px;right:32px;min-width:44px;background:rgba(10,12,16,.55);color:#fff">Home</a>
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
    slide.className = `ph-slide ${i % 2 ? 'pan-b' : 'pan-a'}`;
    slide.style.cssText = slideBg(p);
    slidesEl.appendChild(slide);
    // Fade in on the next frame, then drop older slides once the fade is done.
    requestAnimationFrame(() => requestAnimationFrame(() => slide.classList.add('on')));
    clearTimeout(fadeTimer);
    fadeTimer = setTimeout(() => {
      while (slidesEl.children.length > 1 && slidesEl.firstChild !== slide) slidesEl.firstChild.remove();
    }, 3000);

    $('[data-title]').textContent = p.title;
    $('[data-caption]').innerHTML = `${esc(p.caption)} · Added by ${esc(p.addedBy)}`;
    [...$('[data-dots]').children].forEach((d, j) => d.classList.toggle('on', j === i));
  }

  if (photos.length) show(0);
  if (photos.length > 1) slideTimer = setInterval(() => show((index + 1) % photos.length), SLIDE_MS);
  clockTimer = setInterval(renderDate, 10000);

  // Tap anywhere goes back home.
  const onTap = () => { location.hash = "#/home"; };
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
  clearInterval(slideTimer);
  clearTimeout(fadeTimer);
}
