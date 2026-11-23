// Gallery → Add photos (board KP08 of the November 2026 redesign, "Live arrivals"):
// a big code phones scan to send photos to this screen, with a line sweeping over it, and
// on the right a drawn phone that the photos visibly fly out of, into an "Arriving now"
// frame, with the sender's name. Back leads to the Gallery when its "+ Add photos" opened this
// (#/addphotos/gallery), otherwise to Home or the Menu, wherever the person came from.
import { isTablet, getPhotos, uploadUrl, onPhotosChanged, qrSvg, thumbnail, ALBUM_MAX } from '../services/tablet-photos.js';
import { photos as samplePhotos } from '../services/family-sample.js';
import { esc, topBar } from './ui.js';

let off, flashTimer, wifiTimer, tickTimer, flyTimer;

const QR_SIZE = 400; // big enough for an older phone held at arm's length
const N = () => window.TabletNative;
const FLY_MS = 1000;      // one photo's flight from the phone to the frame
const FLY_EVERY = 1500;   // ...and the next one sets off this long after
const FLY_MOST = 6;       // of a big batch, this many are shown flying in

// While it waits, two blank prints drift along the dotted arc from the drawn phone to the frame.
// (A CSS transform on two small boxes of their own, not SVG animation: that repainted the whole
// 1280x800 drawing every frame, and kept going after the screen's other loops pause.)
// The keyframes follow the arc's curve, evenly by distance, easing like cubic-bezier(.4,0,.2,1).
const ARC = [[1120, 458], [1100, 330], [990, 350], [916, 470]];
function driftKeyframes() {
  const at = (t, i) => {
    const u = 1 - t;
    return u * u * u * ARC[0][i] + 3 * u * u * t * ARC[1][i] + 3 * u * t * t * ARC[2][i] + t * t * t * ARC[3][i];
  };
  const pts = [];
  const len = [0];
  for (let k = 0; k <= 100; k++) {
    pts.push([at(k / 100, 0), at(k / 100, 1)]);
    if (k) len.push(len[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
  }
  const pointAt = (f) => { // f: share of the way along the arc
    const want = f * len[100];
    let k = 1;
    while (k < 100 && len[k] < want) k++;
    const a = len[k - 1], b = len[k], w = b > a ? (want - a) / (b - a) : 0;
    return [pts[k - 1][0] + (pts[k][0] - pts[k - 1][0]) * w, pts[k - 1][1] + (pts[k][1] - pts[k - 1][1]) * w];
  };
  const bez = (s, p1, p2) => 3 * (1 - s) * (1 - s) * s * p1 + 3 * (1 - s) * s * s * p2 + s * s * s;
  const ease = (t) => { // cubic-bezier(.4,0,.2,1): find s whose x is t, give its y
    let lo = 0, hi = 1;
    for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (bez(m, 0.4, 0.2) < t) lo = m; else hi = m; }
    return bez((lo + hi) / 2, 0, 1);
  };
  const frames = [];
  for (let k = 0; k <= 20; k++) {
    const [x, y] = pointAt(ease(k / 20));
    frames.push(`${k * 5}%{opacity:.8;transform:translate(${x.toFixed(1)}px,${y.toFixed(1)}px)}`);
  }
  return `@keyframes ad-drift{${frames.join('')}}`;
}

export function mount(el, { args = [] } = {}) {
  const canWifi = !!(N() && N().wifiSettings);
  const back = args[0] === 'gallery' ? { back: '#/photos', backLabel: '← Gallery' } : {};
  el.innerHTML = `
  <style>
    .ad-root{position:absolute;top:0;right:0;bottom:0;left:0;overflow:hidden;color:#fff;font-family:Inter,system-ui,sans-serif;
      background:linear-gradient(135deg,#2B3A67 0%,#4B3C78 50%,#7A4B78 100%);--accent:#E0663A}
    .ad-top{position:absolute;left:40px;right:40px;top:26px}
    .ad-live{display:flex;align-items:center;gap:12px;font:600 18px Inter,sans-serif;white-space:nowrap}
    .ad-dot{width:14px;height:14px;border-radius:7px;background:#6EE7A0;animation:ad-live 1.6s ease-in-out infinite}
    .ad-live.wait .ad-dot{background:#B9B4CC;animation:none}
    @keyframes ad-live{0%,100%{opacity:1}50%{opacity:.3}}
    /* ---- the code ---- */
    .ad-card{position:absolute;left:40px;top:108px;width:480px;height:666px;border-radius:36px;background:#fff;color:#1E2240;
      display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 24px 24px;box-shadow:0 24px 60px rgba(10,10,40,.4)}
    .ad-eyebrow{font:700 16px Inter,sans-serif;letter-spacing:2.5px;text-transform:uppercase}
    .ad-qr{position:relative;width:${QR_SIZE}px;height:${QR_SIZE}px;margin-top:12px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;text-align:center}
    .ad-qr svg{display:block}
    .ad-scan{position:absolute;left:-8px;right:-8px;top:0;height:8px;border-radius:4px;background:linear-gradient(90deg,rgba(224,102,58,0),#E0663A,rgba(224,102,58,0));
      animation:ad-scan 4s ease-in-out infinite;will-change:transform;display:none}
    .ad-qr.ready .ad-scan{display:block}
    @keyframes ad-scan{0%,100%{transform:translateY(0)}50%{transform:translateY(${QR_SIZE - 8}px)}}
    .ad-url-label{font-size:16px;color:#5A5F80;margin-top:22px;text-align:center}
    .ad-url{font:600 19px Inter,sans-serif;text-align:center;word-break:break-all;margin-top:4px;line-height:1.3}
    /* ---- the right side ---- */
    .ad-right{position:absolute;left:564px;right:40px;top:108px}
    .ad-head{font:500 42px/1.1 Outfit,sans-serif;white-space:nowrap}
    .ad-steps{margin-top:22px;display:flex;flex-direction:column;gap:16px;font-size:21px;line-height:1.35}
    .ad-step{display:flex;gap:14px;align-items:flex-start}
    .ad-num{flex:none;width:36px;height:36px;border-radius:18px;background:rgba(255,255,255,.16);font:700 18px Outfit,sans-serif;display:flex;align-items:center;justify-content:center;margin-top:-4px}
    .ad-frame{position:absolute;left:564px;top:352px;width:350px;height:284px;border-radius:22px;background:rgba(255,255,255,.13);padding:12px 14px}
    .ad-frame .ad-eyebrow{font-size:15px;color:#FFD08A}
    .ad-land{position:relative;height:202px;margin-top:8px;border-radius:14px;overflow:hidden;background:rgba(20,24,44,.35);display:flex;align-items:center;justify-content:center;text-align:center;
      font-size:17px;line-height:1.35;color:#D6CDEB;padding:0 22px}
    .ad-landed{position:absolute;top:0;right:0;bottom:0;left:0;background:#14182C center/cover no-repeat;display:flex;align-items:center;justify-content:center;font-size:44px;color:#fff}
    .ad-landed.in{animation:ad-in .5s ease-out}
    @keyframes ad-in{from{opacity:0;transform:translateY(-26px)}to{opacity:1;transform:translateY(0)}}
    .ad-from{font-size:18px;margin-top:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .ad-art{position:absolute;left:0;top:0;pointer-events:none}
    .ad-print{position:absolute;left:-24px;top:-18px;width:48px;height:36px;border-radius:5px;background:#fff;padding:4px;opacity:0;pointer-events:none;
      animation:ad-drift 5s linear infinite}
    .ad-print + .ad-print{animation-delay:2.5s}
    .ad-print span{display:block;height:100%;border-radius:3px}
    ${driftKeyframes()}
    .ad-flyer{position:absolute;left:986px;top:353px;width:260px;height:192px;border-radius:14px;background:#14182C center/cover no-repeat;box-shadow:0 0 0 4px #fff;
      opacity:0;pointer-events:none;will-change:transform;display:flex;align-items:center;justify-content:center;font-size:60px}
    .ad-flyer.go{opacity:1;transform:translate(-377px,46px) scale(1.1) rotate(-4deg);transition:transform ${FLY_MS}ms cubic-bezier(.4,0,.2,1)}
    .ad-flyer.start{opacity:1;transform:translate(0,0) scale(.2) rotate(-12deg)}
    /* ---- the bottom: what is here already, and what just happened ---- */
    .ad-foot{position:absolute;left:564px;right:40px;top:650px;bottom:18px}
    .ad-foot .ad-eyebrow{font-size:15px;color:#D6CDEB}
    .ad-thumbs{display:flex;gap:10px;overflow:hidden;margin-top:6px}
    .ad-thumb{flex:none;width:64px;height:64px;border-radius:12px;background:#14182C center/cover no-repeat;position:relative;overflow:hidden;display:block}
    .ad-thumb.new{box-shadow:inset 0 0 0 4px #6EE7A0}
    .ad-play{position:absolute;top:0;right:0;bottom:0;left:0;display:flex;align-items:center;justify-content:center;color:#fff;font-size:24px;background:rgba(10,12,16,.35)}
    .ad-status{font-size:16px;line-height:1.35;color:#E4DDF3;margin-top:8px}
    .ad-status b{color:#FFD08A}
    .ad-came{font:600 22px Outfit,sans-serif;color:#9FF2C1}
    @media (prefers-reduced-motion: reduce){.ad-dot,.ad-scan,.ad-landed.in{animation:none}.ad-flyers{display:none}.ad-flyer.go{transition:none}}
  </style>
  <div class="ad-root">
    <svg class="ad-art" width="1280" height="800" viewBox="0 0 1280 800" aria-hidden="true">
      <defs><linearGradient id="ad-trail" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#FFD08A" stop-opacity="0"/><stop offset="1" stop-color="#FFD08A" stop-opacity=".75"/></linearGradient></defs>
      <path id="ad-arc" d="M1120 458 C1100 330 990 350 916 470" fill="none" stroke="url(#ad-trail)" stroke-width="3" stroke-dasharray="6 10"/>
      <g transform="translate(1066 410) rotate(-12)">
        <rect x="0" y="0" width="118" height="208" rx="20" fill="#14182C" stroke="#8A93C8" stroke-width="3"/>
        <rect x="9" y="20" width="100" height="168" rx="9" fill="#F4ECE0"/>
        <rect x="18" y="36" width="40" height="40" rx="6" fill="#E57A3A"/><rect x="62" y="36" width="40" height="40" rx="6" fill="#7FC3E8"/>
        <rect x="18" y="80" width="40" height="40" rx="6" fill="#9AA9BE"/><rect x="62" y="80" width="40" height="40" rx="6" fill="#D9792E"/>
        <rect x="18" y="144" width="84" height="30" rx="15" fill="#E0663A"/>
      </g>
    </svg>
    <div class="ad-flyers" data-flyers aria-hidden="true">
      <div class="ad-print"><span style="background:#E9A07A"></span></div><div class="ad-print"><span style="background:#8FC6E4"></span></div>
    </div>

    <div class="ad-top">${topBar({ title: 'Add photos', ...back, tone: 'dark', right: `
      <div class="ad-live" data-live><span class="ad-dot"></span><span data-live-text></span></div>` })}</div>

    <div class="ad-card">
      <div class="ad-qr" data-qr-box><div data-qr></div><div class="ad-scan"></div></div>
      <div class="ad-url-label" data-url-label style="display:none">Or type into the phone’s browser:</div>
      <div class="ad-url" data-url></div>
    </div>

    <div class="ad-right">
      <div class="ad-head">Send photos from your phone</div>
      <div class="ad-steps">
        ${[
          'Join the same Wi-Fi as this screen',
          'Scan the code with the camera',
          'Type your name, tap <b>Choose photos</b>',
        ].map((t, i) => `<div class="ad-step"><div class="ad-num">${i + 1}</div><div>${t}</div></div>`).join('')}
      </div>
    </div>

    <div class="ad-frame">
      <div class="ad-eyebrow" data-frame-title>Arriving here</div>
      <div class="ad-land" data-land><span data-land-text></span></div>
      <div class="ad-from" data-from>&nbsp;</div>
    </div>
    <div class="ad-flyer" data-flyer></div>

    <div class="ad-foot">
      <div data-latest style="display:none">
        <div class="ad-eyebrow">Newest in the Gallery</div>
        <div class="ad-thumbs" data-thumbs></div>
      </div>
      <div class="ad-status" data-status>Photos stay on this screen, never on the internet.</div>
    </div>
  </div>`;

  const $ = (s) => el.querySelector(s);
  let lastCount = getPhotos().length;
  let shownUrl; // the address the code currently shows (undefined = not drawn yet)
  let fresh = {}; // ids that arrived while this screen was open (outlined in green)

  // Newest few pictures, so people can see what's already here (and that theirs arrived).
  // Small copies, not the phone-sized originals: those were a lot for this screen's memory.
  function renderLatest(list) {
    const items = (isTablet() ? list : samplePhotos).slice(0, 8);
    $('[data-latest]').style.display = items.length ? '' : 'none';
    $('[data-thumbs]').innerHTML = items.map((p, i) => {
      const bg = !p.src && p.art ? `background:${p.art}` : '';
      const to = p.id ? `#/photos/show/${encodeURIComponent(p.id)}` : '#/photos';
      return `<a class="ad-thumb${fresh[p.id] ? ' new' : ''}" data-i="${i}" href="${to}" style="${bg}" aria-label="See this photo">${p.video ? '<div class="ad-play">▶</div>' : ''}</a>`;
    }).join('');
    items.forEach((p, i) => {
      if (!p.src || p.video) return;
      thumbnail(p.src, { w: 96, h: 96 }).then((url) => {
        const t = el.isConnected && $(`[data-thumbs] [data-i="${i}"]`);
        if (t && url) t.style.backgroundImage = `url(${url})`;
      });
    });
  }

  // Only redraw the code when the address changes (drawing it is slow on the kitchen screen).
  function renderQr() {
    const url = uploadUrl();
    if (url === shownUrl) return;
    shownUrl = url;
    const live = $('[data-live]');
    $('[data-url-label]').style.display = url ? '' : 'none';
    $('[data-qr-box]').classList.toggle('ready', url !== '');
    $('[data-flyers]').style.display = url === '' ? 'none' : '';
    live.classList.toggle('wait', !url);
    if (url === null) {
      // Previewing in a normal browser: there is no screen to send photos to. A stand-in
      // code, so the page looks as it will.
      $('[data-qr]').innerHTML = qrSvg('http://kitchen-screen.example/photos', QR_SIZE);
      $('[data-url]').innerHTML = '<span style="font-weight:400;font-size:16px;color:#5A5F80">A preview: on the kitchen screen this is its own code.</span>';
      $('[data-live-text]').textContent = 'Preview';
    } else if (!url) {
      $('[data-qr]').innerHTML = `
        <div style="font:500 28px Outfit,sans-serif;white-space:nowrap">This screen isn’t on the Wi-Fi</div>
        ${canWifi ? '<button data-wifi class="x-btn ink" style="margin-top:8px">Wi-Fi settings</button>' : ''}`;
      $('[data-url]').innerHTML = canWifi ? ''
        : '<span style="font-weight:400;font-size:17px;color:#5A5F80">To connect it: hold the top-left corner for 5 seconds, then Wi-Fi settings.</span>';
      const w = $('[data-wifi]');
      if (w) w.addEventListener('click', () => { try { N().wifiSettings(); } catch (e) { /* older version of the screen */ } });
      $('[data-live-text]').textContent = 'No Wi-Fi';
    } else {
      $('[data-qr]').innerHTML = qrSvg(url, QR_SIZE);
      // The whole address, key and all: without the key the screen answers "this link has expired".
      $('[data-url]').textContent = url;
      $('[data-live-text]').textContent = 'Ready';
    }
  }

  function arrivedText(list) {
    const n = list.length;
    const vids = list.filter((p) => p.video).length;
    const pics = n - vids;
    const plural = (k, w) => `${k} ${w}${k > 1 ? 's' : ''}`;
    const what = vids === 0 ? `${n} new photo${n > 1 ? 's' : ''}` : pics === 0 ? `${n} new video${n > 1 ? 's' : ''}`
      : `${plural(pics, 'new photo')} and ${plural(vids, 'video')}`;
    const names = [...new Set(list.map((p) => p.name).filter(Boolean))];
    const from = names.length === 1 ? ` from ${names[0]}` : '';
    return `✓ ${what}${from} arrived!`;
  }

  function stopCountdown() { clearTimeout(flashTimer); clearInterval(tickTimer); flashTimer = 0; }

  // ---- The fly-in: each photo that really arrived leaves the drawn phone and lands in the frame ----
  let queue = [];   // [{ p, at, of }] still to fly
  let flying = false;
  function land(job, url) {
    const box = $('[data-land]');
    const old = box.querySelector('.ad-landed');
    if (old) old.remove();
    const pic = document.createElement('div');
    pic.className = 'ad-landed in';
    if (url) pic.style.backgroundImage = `url(${url})`;
    else pic.textContent = job.p.video ? '▶' : '';
    box.appendChild(pic);
    $('[data-frame-title]').textContent = 'Arriving now';
    const name = String(job.p.name || '').trim();
    $('[data-from]').innerHTML = `${name ? `From <b>${esc(name)}</b>` : (job.p.video ? 'A video' : 'A photo')}${job.of > 1 ? ` · ${job.at} of ${job.of}` : ''}`;
  }
  function flyNext() {
    const job = queue.shift();
    if (!job || !el.isConnected) {
      flying = false;
      if (el.isConnected) $('[data-flyers]').style.display = shownUrl === '' ? 'none' : ''; // the blank prints drift again
      return;
    }
    flying = true;
    $('[data-flyers]').style.display = 'none'; // real ones are on their way
    const go = (url) => {
      if (!el.isConnected) return;
      const f = $('[data-flyer]');
      f.className = 'ad-flyer start';
      f.style.backgroundImage = url ? `url(${url})` : '';
      f.textContent = url ? '' : (job.p.video ? '▶' : '');
      void f.offsetWidth; // start from the phone, then set off
      f.className = 'ad-flyer go';
      clearTimeout(flyTimer);
      flyTimer = setTimeout(() => {
        if (!el.isConnected) return;
        f.className = 'ad-flyer';
        land(job, url);
        flyTimer = setTimeout(flyNext, FLY_EVERY - FLY_MS);
      }, FLY_MS);
    };
    if (job.p.src && !job.p.video) thumbnail(job.p.src, { w: 320, h: 200 }).then(go);
    else go('');
  }
  function flyIn(arrived) {
    // Oldest of the batch first, so the last one to land is the newest.
    const some = arrived.slice(0, FLY_MOST).reverse();
    const of = arrived.length;
    some.forEach((p, i) => queue.push({ p, at: of - some.length + i + 1, of }));
    if (!flying) flyNext();
  }

  // What is waiting: ready for photos, nearly full, or full.
  function renderReady(count) {
    $('[data-latest]').style.display = $('[data-thumbs]').children.length ? '' : 'none';
    if (!isTablet()) return;
    const words = $('[data-land-text]');
    if (words) words.textContent = count >= ALBUM_MAX ? 'No room for more' : '';
    if (count >= ALBUM_MAX - 50) {
      // Uploads stop at the limit; say so before someone's photos quietly don't arrive.
      $('[data-latest]').style.display = 'none';
      $('[data-status]').innerHTML = `<div style="font-size:18px"><b>The Gallery is ${count >= ALBUM_MAX ? 'full' : 'almost full'} (${count} of ${ALBUM_MAX})</b></div>
        <a href="#/photos/choose" class="x-btn white" style="margin-top:12px">Make room</a>`;
    } else {
      $('[data-status]').textContent = `${count} in the Gallery. Photos stay on this screen, never on the internet.`;
    }
  }

  function render() {
    renderQr();
    const list = getPhotos();
    const count = list.length;
    if (count > lastCount) {
      const arrived = list.slice(0, count - lastCount); // newest first
      arrived.forEach((p) => { fresh[p.id] = true; });
      renderLatest(list);
      flyIn(arrived);
      // Off to the Gallery in a few seconds to show them, unless they want to send more first.
      // (Long enough for every one that flies in to land.)
      let left = Math.max(8, Math.ceil((Math.min(queue.length + 1, FLY_MOST) * FLY_EVERY) / 1000) + 4);
      const total = left;
      const them = arrived.length > 1 ? 'them' : 'it';
      const say = () => {
        $('[data-latest]').style.display = 'none';
        $('[data-status]').innerHTML = `<div class="ad-came">${esc(arrivedText(arrived))}</div>
          <div style="display:flex;gap:12px;align-items:center;margin-top:10px">
            <a href="#/photos" class="x-btn white">See ${them}</a>
            <button data-stay class="x-btn glass">Send more</button>
            <span style="font-size:17px;white-space:nowrap">Showing ${them} in ${left}…</span>
          </div>`;
        $('[data-stay]').addEventListener('click', () => { stopCountdown(); renderReady(getPhotos().length); });
      };
      stopCountdown();
      say();
      tickTimer = setInterval(() => { if (!el.isConnected) return; left--; if (left > 0) say(); }, 1000);
      flashTimer = setTimeout(() => { stopCountdown(); if (el.isConnected) location.hash = '#/photos'; }, total * 1000);
    } else {
      renderLatest(list);
      if (!flashTimer) renderReady(count);
    }
    lastCount = count;
  }

  render();
  off = onPhotosChanged(render);
  // The screen may join Wi-Fi (or get a new address) while this is open.
  if (isTablet()) wifiTimer = setInterval(() => { if (el.isConnected) { const was = shownUrl; renderQr(); if (was !== shownUrl && !flashTimer) renderReady(lastCount); } }, 5000);
}

export function unmount() {
  if (off) { off(); off = null; }
  clearTimeout(flashTimer);
  clearTimeout(flyTimer);
  clearInterval(tickTimer);
  clearInterval(wifiTimer);
  flashTimer = 0;
}
