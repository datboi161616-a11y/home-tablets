// Family · Add photos: a QR code phones scan to send photos to this tablet.
import { isTablet, getPhotos, uploadUrl, onPhotosChanged, qrSvg } from '../services/tablet-photos.js';
import { photos as samplePhotos } from '../services/family-sample.js';
import { spot } from '../art.js';

let off, flashTimer, wifiTimer;

const ALBUM_MAX = 500; // the tablet app's limit (PhotoStore.MAX_ITEMS)
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function mount(el, { homeRoute = 'home' } = {}) {
  el.innerHTML = `
  <style>
    .ad-thumb{flex:none;width:96px;height:96px;border-radius:14px;background:#2A3038 center/cover no-repeat;position:relative;overflow:hidden}
    .ad-play{position:absolute;top:0;right:0;bottom:0;left:0;display:flex;align-items:center;justify-content:center;color:#fff;font-size:30px;background:rgba(10,12,16,.35)}
  </style>
  <div style="height:100%;padding:40px;display:grid;grid-template-columns:440px minmax(0,1fr);gap:48px;align-items:center">
    <div class="card" style="padding:40px;display:flex;flex-direction:column;align-items:center;gap:16px">
      <div data-qr style="width:360px;height:360px;display:flex;align-items:center;justify-content:center;text-align:center"></div>
      <div data-url-label class="muted" style="font-size:15px;text-align:center;display:none">No camera on the phone? Type this into its web browser:</div>
      <div data-url style="font-size:17px;font-weight:600;text-align:center;word-break:break-all"></div>
    </div>

    <div style="display:flex;flex-direction:column;gap:24px;min-width:0">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:16px">
        <a href="#/photos" class="pill" style="background:var(--card);color:var(--ink)">← Photos</a>
        <a href="#/${homeRoute}" class="pill" style="background:var(--card);color:var(--ink)">Home</a>
      </div>
      <div style="display:flex;align-items:center;gap:20px">
        <div class="display" style="flex:1;min-width:0;font-size:52px;font-weight:500;line-height:1.05">Add photos from your phone</div>
        <div style="flex:none;width:250px">${spot.phoneToTablet()}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:18px;font-size:22px">
        ${[
          'Connect your phone to the same Wi-Fi as this screen.',
          'Point your phone’s camera at the code and tap the link.',
          'Choose photos. They show up here in a few seconds.',
        ].map((t, i) => `
          <div style="display:flex;gap:18px;align-items:flex-start">
            <div class="display" style="flex:none;width:44px;height:44px;border-radius:22px;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700">${i + 1}</div>
            <div style="padding-top:7px">${t}</div>
          </div>`).join('')}
      </div>
      <a data-latest href="#/photos" style="display:none;flex-direction:column;gap:10px">
        <div class="eyebrow muted">Newest on this screen</div>
        <div data-thumbs style="display:flex;gap:12px;overflow:hidden"></div>
      </a>
      <div data-status class="muted" style="font-size:18px">Photos stay on this screen. Nothing is uploaded to the internet.</div>
    </div>
  </div>`;

  const $ = (s) => el.querySelector(s);
  let lastCount = getPhotos().length;
  let shownUrl; // the address the QR code currently shows (undefined = not drawn yet)

  // Newest few pictures, so people can see what's already here (and that theirs arrived).
  function renderLatest(list) {
    const items = (isTablet() ? list : samplePhotos).slice(0, 6);
    $('[data-latest]').style.display = items.length ? 'flex' : 'none';
    $('[data-thumbs]').innerHTML = items.map((p) => {
      const bg = p.src && !p.video ? `background-image:url('${esc(encodeURI(p.src))}')` : p.art ? `background:${p.art}` : '';
      return `<div class="ad-thumb" style="${bg}">${p.video ? '<div class="ad-play">▶</div>' : ''}</div>`;
    }).join('');
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
      $('[data-qr]').innerHTML = `<div style="font-size:22px;font-weight:600">Connect this screen to Wi-Fi first</div>`;
      $('[data-url]').innerHTML = '<span class="muted" style="font-weight:400">Ask a grown-up: hold the top-left corner for 5 seconds → Wi-Fi settings. The code appears here by itself once it’s connected.</span>';
    } else {
      $('[data-qr]').innerHTML = qrSvg(url, 360);
      // The whole address, key and all: without the key the screen answers "this link has expired".
      $('[data-url]').textContent = url;
    }
  }

  function arrivedText(fresh) {
    const n = fresh.length;
    const vids = fresh.filter((p) => p.video).length;
    const pics = n - vids;
    const plural = (k, w) => `${k} ${w}${k > 1 ? 's' : ''}`;
    const what = vids === 0 ? `${n} new photo${n > 1 ? 's' : ''}` : pics === 0 ? `${n} new video${n > 1 ? 's' : ''}`
      : `${plural(pics, 'new photo')} and ${plural(vids, 'video')}`;
    const names = [...new Set(fresh.map((p) => p.name).filter(Boolean))];
    const from = names.length === 1 ? ` from ${names[0]}` : '';
    return `✓ ${what}${from} arrived!`;
  }

  function render() {
    renderQr();
    const list = getPhotos();
    const count = list.length;
    renderLatest(list);
    if (count > lastCount) {
      const fresh = list.slice(0, count - lastCount); // newest first
      $('[data-status]').innerHTML = `<span style="color:#2F6B4F;font-weight:600">${esc(arrivedText(fresh))}</span> Showing ${fresh.length > 1 ? 'them' : 'it'} in a moment… <a href="#/photos" style="text-decoration:underline">See now</a>`;
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => { if (el.isConnected) location.hash = '#/photos'; }, 6000);
    } else if (isTablet() && count >= ALBUM_MAX - 50) {
      // Uploads stop at the limit; say so before someone's photos quietly don't arrive.
      $('[data-status]').innerHTML = `<span style="color:var(--accent);font-weight:600">The album is ${count >= ALBUM_MAX ? 'full' : 'almost full'} (${count} of ${ALBUM_MAX}).</span> Remove a few old ones from the phone page to make room.`;
    } else if (isTablet()) {
      $('[data-status]').textContent = `${count} photo${count === 1 ? '' : 's'} on this screen. Photos stay here; nothing is uploaded to the internet.`;
    }
    lastCount = count;
  }

  render();
  off = onPhotosChanged(render);
  // The tablet may join Wi-Fi (or get a new address) while this screen is open.
  if (isTablet()) wifiTimer = setInterval(() => { if (el.isConnected) renderQr(); }, 5000);
}

export function unmount() {
  off?.();
  clearTimeout(flashTimer);
  clearInterval(wifiTimer);
}
