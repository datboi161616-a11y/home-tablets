// Family · Add photos: a QR code phones scan to send photos to this tablet.
import { isTablet, getPhotos, uploadUrl, onPhotosChanged, qrSvg, thumbnail, ALBUM_MAX } from '../services/tablet-photos.js';
import { photos as samplePhotos } from '../services/family-sample.js';
import { spot } from '../art.js';

let off, flashTimer, wifiTimer, tickTimer;

const QR_SIZE = 440; // big enough for an older phone held at arm's length
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const N = () => window.TabletNative;

export function mount(el, { homeRoute = 'home' } = {}) {
  const canWifi = !!(N() && N().wifiSettings);
  el.innerHTML = `
  <style>
    .ad-thumb{flex:none;width:96px;height:96px;border-radius:14px;background:#2A3038 center/cover no-repeat;position:relative;overflow:hidden;display:block}
    .ad-thumb.new{box-shadow:0 0 0 4px #2F6B4F}
    .ad-play{position:absolute;top:0;right:0;bottom:0;left:0;display:flex;align-items:center;justify-content:center;color:#fff;font-size:30px;background:rgba(10,12,16,.35)}
    .ad-pill{min-height:56px;font-size:18px;padding:0 24px;border:0;font-family:inherit;cursor:pointer}
    .ad-live{display:inline-block;width:10px;height:10px;border-radius:5px;background:#2F6B4F;margin-right:10px;vertical-align:1px}
  </style>
  <div style="height:100%;padding:36px 40px;display:grid;grid-template-columns:520px minmax(0,1fr);gap:44px;align-items:center">
    <div class="card" style="padding:34px 40px;display:flex;flex-direction:column;align-items:center;gap:14px">
      <div data-qr style="width:${QR_SIZE}px;height:${QR_SIZE}px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;text-align:center"></div>
      <div data-url-label class="muted" style="font-size:17px;text-align:center;display:none">No camera on the phone? Type this into its web browser:</div>
      <div data-url style="font-size:20px;font-weight:600;text-align:center;word-break:break-all"></div>
    </div>

    <div style="display:flex;flex-direction:column;gap:22px;min-width:0">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:16px">
        <a href="#/photos" class="pill ad-pill" style="background:var(--card);color:var(--ink)">← Photo frame</a>
        <a href="#/${homeRoute}" class="pill ad-pill" style="background:var(--card);color:var(--ink)">Home</a>
      </div>
      <div style="display:flex;align-items:center;gap:20px">
        <div class="display" style="flex:1;min-width:0;font-size:48px;font-weight:500;line-height:1.05">Add photos from your phone</div>
        <div style="flex:none;width:200px">${spot.phoneToTablet()}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:16px;font-size:21px;line-height:1.3">
        ${[
          'Connect your phone to the same Wi-Fi as this screen.',
          'Point your phone’s camera at the code, then tap the link that pops up.',
          'A page called “Your kitchen screen” opens. Type your name, tap <b>Choose photos</b> and pick as many as you like.',
        ].map((t, i) => `
          <div style="display:flex;gap:18px;align-items:flex-start">
            <div class="display" style="flex:none;width:44px;height:44px;border-radius:22px;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700">${i + 1}</div>
            <div style="padding-top:8px">${t}</div>
          </div>`).join('')}
        <div class="muted" style="font-size:18px;padding-left:62px">The same page can also leave a note, add to the shopping list or send a recipe.</div>
      </div>
      <div data-latest style="display:none;flex-direction:column;gap:10px">
        <div class="eyebrow muted">Newest on this screen · tap one to see it</div>
        <div data-thumbs style="display:flex;gap:12px;overflow:hidden"></div>
      </div>
      <div data-status class="muted" style="font-size:18px;line-height:1.4">Photos stay on this screen. Nothing is uploaded to the internet.</div>
    </div>
  </div>`;

  const $ = (s) => el.querySelector(s);
  let lastCount = getPhotos().length;
  let shownUrl; // the address the QR code currently shows (undefined = not drawn yet)
  let fresh = {}; // ids that arrived while this screen was open (outlined in green)

  // Newest few pictures, so people can see what's already here (and that theirs arrived).
  // Small copies, not the phone-sized originals: six of those were a lot for this screen's memory.
  function renderLatest(list) {
    const items = (isTablet() ? list : samplePhotos).slice(0, 6);
    $('[data-latest]').style.display = items.length ? 'flex' : 'none';
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

  // Only redraw the QR code when the address changes (drawing it is slow on the tablet).
  function renderQr() {
    const url = uploadUrl();
    if (url === shownUrl) return;
    shownUrl = url;
    $('[data-url-label]').style.display = url ? '' : 'none';
    if (url === null) {
      // Testing in a normal browser: there is no tablet to send photos to.
      $('[data-qr]').innerHTML = `<div class="muted" style="font-size:20px">The QR code appears here on the kitchen screen.</div>`;
      $('[data-url]').textContent = '';
    } else if (!url) {
      $('[data-qr]').innerHTML = `
        <div class="display" style="font-size:30px;font-weight:500">This screen isn’t on the Wi-Fi</div>
        <div style="font-size:19px;line-height:1.4" class="muted">The code appears here by itself as soon as it’s connected.</div>
        ${canWifi ? '<button data-wifi class="pill ad-pill" style="background:var(--ink);color:#fff">Wi-Fi settings (grown-ups)</button>' : ''}`;
      $('[data-url]').innerHTML = canWifi ? ''
        : '<span class="muted" style="font-weight:400;font-size:17px">A grown-up can connect it: hold the top-left corner for 5 seconds, then Wi-Fi settings.</span>';
      const w = $('[data-wifi]');
      if (w) w.addEventListener('click', () => { try { N().wifiSettings(); } catch (e) { /* older version of the screen */ } });
    } else {
      $('[data-qr]').innerHTML = qrSvg(url, QR_SIZE);
      // The whole address, key and all: without the key the screen answers "this link has expired".
      $('[data-url]').textContent = url;
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

  // What is waiting: ready for photos, nearly full, or full.
  function renderReady(count) {
    if (!isTablet()) return;
    if (count >= ALBUM_MAX - 50) {
      // Uploads stop at the limit; say so before someone's photos quietly don't arrive.
      $('[data-status]').innerHTML = `<span style="color:var(--accent);font-weight:600">The album is ${count >= ALBUM_MAX ? 'full' : 'almost full'} (${count} of ${ALBUM_MAX}).</span> `
        + 'Take a few old ones off to make room. <a href="#/photos/album" class="pill ad-pill" style="background:var(--card);color:var(--ink);margin-top:8px">Choose photos to remove</a>';
    } else if (shownUrl) {
      $('[data-status]').innerHTML = `<span class="ad-live"></span>Ready: photos appear here the moment they arrive. ${count} on this screen so far; they stay here and nothing goes on the internet.`;
    } else {
      $('[data-status]').textContent = `${count} photo${count === 1 ? '' : 's'} on this screen. Photos stay here; nothing is uploaded to the internet.`;
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
      // Off to the photo frame in a few seconds to show them, unless they want to send more first.
      let left = 8;
      const say = () => {
        $('[data-status]').innerHTML = `<div style="color:#2F6B4F;font-weight:700;font-size:22px">${esc(arrivedText(arrived))}</div>
          <div style="display:flex;gap:12px;align-items:center;margin-top:10px;flex-wrap:wrap">
            <a href="#/photos" class="pill ad-pill" style="background:#2F6B4F;color:#fff">See ${arrived.length > 1 ? 'them' : 'it'} now</a>
            <button data-stay class="pill ad-pill" style="background:var(--card);color:var(--ink)">Stay here to send more</button>
            <span>Showing ${arrived.length > 1 ? 'them' : 'it'} in ${left}…</span>
          </div>`;
        $('[data-stay]').addEventListener('click', () => { stopCountdown(); renderReady(getPhotos().length); });
      };
      stopCountdown();
      say();
      tickTimer = setInterval(() => { if (!el.isConnected) return; left--; if (left > 0) say(); }, 1000);
      flashTimer = setTimeout(() => { stopCountdown(); if (el.isConnected) location.hash = '#/photos'; }, 8000);
    } else {
      renderLatest(list);
      renderReady(count);
    }
    lastCount = count;
  }

  render();
  off = onPhotosChanged(render);
  // The tablet may join Wi-Fi (or get a new address) while this screen is open.
  if (isTablet()) wifiTimer = setInterval(() => { if (el.isConnected) { const was = shownUrl; renderQr(); if (was !== shownUrl && !flashTimer) renderReady(lastCount); } }, 5000);
}

export function unmount() {
  off?.();
  clearTimeout(flashTimer);
  clearInterval(tickTimer);
  clearInterval(wifiTimer);
  flashTimer = 0;
}
