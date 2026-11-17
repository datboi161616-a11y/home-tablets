// Tom · Deep-space viewscreen (DeepImage.dc.html in the design)
// Full-screen space picture of the day: NASA APOD when it works, otherwise a
// daily pick of famous Webb/Hubble pictures from NASA's Image Library.
// Tap the picture to hide or show the caption.
import { getSpaceImage, fallbackImage } from '../services/space.js';

let root;
let onTap;

function show(el, data) {
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
  $('[data-caption]').style.visibility = 'visible';

  const img = $('[data-img]');
  img.style.opacity = '0';
  img.onload = () => {
    img.style.opacity = '1';
    $('[data-wait]').style.display = 'none';
  };
  img.onerror = () => {
    // Picture didn't load: try the built-in ones (a few at most).
    const tries = (Number(img.dataset.tries) || 0) + 1;
    img.dataset.tries = tries;
    if (tries <= 3) show(el, fallbackImage(tries - 1 + (data.id ? 1 : 0)));
    else $('[data-wait]').innerHTML = 'NO SIGNAL FROM DEEP SPACE<br>CHECK THE WI-FI CONNECTION';
  };
  img.alt = data.title;
  img.src = data.url;
}

export function mount(el) {
  el.innerHTML = `
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Oxanium:wght@300;500;700&family=JetBrains+Mono:wght@400;600&display=swap">
  <style>
    .di-root{width:1280px;height:800px;box-sizing:border-box;background:#0E1424;color:#D7E6F0;font-family:'JetBrains Mono',monospace;position:relative;overflow:hidden}
    .di-root a{color:#5CE1E6}
    .di-ox{font-family:Oxanium,sans-serif}
    .di-c{position:absolute;width:60px;height:60px;pointer-events:none}
    .di-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity .6s}
    .di-cap{position:absolute;left:110px;right:110px;bottom:50px;background:rgba(5,7,13,0.78);border-left:4px solid #FFB547;padding:20px 24px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:24px;align-items:end;transition:opacity .3s}
    .di-root.di-hide .di-cap{opacity:0;pointer-events:none}
  </style>
  <div class="di-root">
    <div data-wait style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:20px;color:#7FA6B8;text-align:center;letter-spacing:2px;white-space:nowrap">RECEIVING TODAY'S DEEP-SPACE IMAGE…<br>FROM NASA'S PICTURE OF THE DAY AND THE WEBB TELESCOPE</div>
    <img data-img class="di-img" alt="" decoding="async">
    <div class="di-c" style="top:28px;left:28px;border-top:2px solid #5CE1E6;border-left:2px solid #5CE1E6"></div>
    <div class="di-c" style="top:28px;right:28px;border-top:2px solid #5CE1E6;border-right:2px solid #5CE1E6"></div>
    <div class="di-c" style="bottom:28px;left:28px;border-bottom:2px solid #5CE1E6;border-left:2px solid #5CE1E6"></div>
    <div class="di-c" style="bottom:28px;right:28px;border-bottom:2px solid #5CE1E6;border-right:2px solid #5CE1E6"></div>
    <div style="position:absolute;top:44px;left:110px;font-size:14px;letter-spacing:4px;color:#5CE1E6;text-shadow:0 1px 4px #05070D">VIEWSCREEN · MAGNIFICATION MAX</div>
    <a href="#/bridge" style="position:absolute;top:36px;right:110px;min-height:44px;padding:10px 18px;box-sizing:border-box;border:1px solid #1E3A4A;background:rgba(5,7,13,0.7);font-size:14px;letter-spacing:3px;display:flex;align-items:center">◂ DECK</a>
    <div data-caption class="di-cap" style="visibility:hidden">
      <div style="display:flex;flex-direction:column;gap:6px;min-width:0">
        <div data-title class="di-ox" style="font-size:34px;font-weight:500"></div>
        <div data-text style="font-size:16px;line-height:1.45;color:#B9CBD6"></div>
      </div>
      <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end;font-size:14px">
        <div data-k style="color:#7FA6B8;letter-spacing:3px;white-space:nowrap">DISTANCE</div>
        <div data-v class="di-ox" style="font-size:28px;color:#FFB547;white-space:nowrap"></div>
      </div>
    </div>
  </div>`;

  root = el.querySelector('.di-root');
  onTap = (e) => {
    if (e.target.closest('a')) return;
    root.classList.toggle('di-hide');
  };
  root.addEventListener('click', onTap);

  getSpaceImage()
    .then((data) => { if (root?.isConnected) show(el, data); })
    .catch((err) => { console.warn(err); if (root?.isConnected) show(el, fallbackImage()); });
}

export function unmount() {
  root?.removeEventListener('click', onTap);
  const img = root?.querySelector('[data-img]');
  if (img) { img.onload = img.onerror = null; }
  root = null;
}
