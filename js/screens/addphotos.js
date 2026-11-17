// Family · Add photos: a QR code phones scan to send photos to this tablet.
import { isTablet, getPhotos, uploadUrl, onPhotosChanged, qrSvg } from '../services/tablet-photos.js';

let off, flashTimer;

export function mount(el) {
  el.innerHTML = `
  <div style="height:100%;padding:40px;display:grid;grid-template-columns:440px minmax(0,1fr);gap:48px;align-items:center">
    <div class="card" style="padding:40px;display:flex;flex-direction:column;align-items:center;gap:20px">
      <div data-qr style="width:360px;height:360px;display:flex;align-items:center;justify-content:center;text-align:center"></div>
      <div data-url class="muted" style="font-size:15px;text-align:center;word-break:break-all"></div>
    </div>

    <div style="display:flex;flex-direction:column;gap:28px;min-width:0">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:16px">
        <a href="#/photos" class="pill" style="background:var(--card);color:var(--ink)">← Photos</a>
        <a href="#/home" class="pill" style="background:var(--card);color:var(--ink)">Home</a>
      </div>
      <div class="display" style="font-size:52px;font-weight:500;line-height:1.05">Add photos from your phone</div>
      <div style="display:flex;flex-direction:column;gap:20px;font-size:22px">
        ${[
          'Connect your phone to the same Wi-Fi as this tablet.',
          'Point your phone’s camera at the code and tap the link.',
          'Choose photos. They show up here in a few seconds.',
        ].map((t, i) => `
          <div style="display:flex;gap:18px;align-items:flex-start">
            <div class="display" style="flex:none;width:44px;height:44px;border-radius:22px;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700">${i + 1}</div>
            <div style="padding-top:7px">${t}</div>
          </div>`).join('')}
      </div>
      <div data-status class="muted" style="font-size:18px">Photos stay on this tablet. Nothing is uploaded to the internet.</div>
    </div>
  </div>`;

  const $ = (s) => el.querySelector(s);
  let lastCount = getPhotos().length;

  function render() {
    const url = uploadUrl();
    if (url === null) {
      // Testing in a normal browser: there is no tablet to send photos to.
      $('[data-qr]').innerHTML = `<div class="muted" style="font-size:20px">The QR code appears here on the tablet.</div>`;
      $('[data-url]').textContent = '';
    } else if (!url) {
      $('[data-qr]').innerHTML = `<div style="font-size:22px;font-weight:600">Connect the tablet to Wi-Fi first</div>`;
      $('[data-url]').textContent = 'Ask a grown-up: hold the top-left corner for 5 seconds → Wi-Fi settings';
    } else {
      $('[data-qr]').innerHTML = qrSvg(url, 360);
      $('[data-url]').textContent = url.replace(/\?k=.*/, '');
    }
    const count = getPhotos().length;
    if (count > lastCount) {
      const n = count - lastCount;
      $('[data-status]').innerHTML = `<span style="color:#2F6B4F;font-weight:600">✓ ${n} new photo${n > 1 ? 's' : ''} arrived!</span> <a href="#/photos" style="text-decoration:underline">See ${n > 1 ? 'them' : 'it'}</a>`;
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => { if (el.isConnected) location.hash = '#/photos'; }, 6000);
    } else if (isTablet()) {
      $('[data-status]').textContent = `${count} photo${count === 1 ? '' : 's'} on this tablet. Photos stay here; nothing is uploaded to the internet.`;
    }
    lastCount = count;
  }

  render();
  off = onPhotosChanged(render);
}

export function unmount() {
  off?.();
  clearTimeout(flashTimer);
}
