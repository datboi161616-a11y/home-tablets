// This tablet's own photo album. Photos are sent from phones on the same Wi-Fi
// (QR code on the "Add photos" screen) and stored on the tablet by the Android
// app. Nothing goes to the cloud, and each tablet has its own album.
//
// In a normal browser (testing on a PC) there is no tablet, so isTablet() is false
// and screens fall back to sample pictures.
import qrcode from '../vendor/qrcode.js';

const N = () => window.TabletNative;

export const isTablet = () => !!(N() && N().photoList);

// "today", "yesterday", "Nov 3", or "Nov 3, 2024" for older years: easier to read than bare dates.
function fmtDay(ms) {
  const d = new Date(ms);
  const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
  if (d >= midnight) return 'today';
  if (d >= midnight - 864e5) return 'yesterday';
  const opts = { month: 'short', day: 'numeric' };
  if (d.getFullYear() !== midnight.getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString('en-US', opts);
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Asking the app for the album makes it open a small file for every photo (up to 500), and
// Home, the Menu, the notes and the frame all ask. So the answer is kept until the album
// changes (the app says so), or for half a minute at most.
let album = null;
let albumAt = 0;
window.addEventListener('tablet-photos', () => { album = null; });

/** Newest first: [{ id, src, video, title, line, name, added, caption, day }] — or [] when not on a tablet. */
export function getPhotos() {
  if (!isTablet()) return [];
  if (album && Date.now() - albumAt < 30000) return album.slice();
  try {
    const base = N().photoBase();
    album = JSON.parse(N().photoList()).map((p) => ({
      id: p.id,
      src: base + p.id,
      video: !!p.video,
      name: p.name,
      added: p.added,
      caption: p.caption || '',
      day: cap(fmtDay(p.added)),
      title: p.caption || `Added ${fmtDay(p.added)}`,
      line: [p.name && `Added by ${p.name}`, p.caption && cap(fmtDay(p.added))].filter(Boolean).join(' · '),
    }));
    albumAt = Date.now();
    return album.slice();
  } catch (err) {
    console.error(err);
    return [];
  }
}

/** Address phones open, '' if the tablet isn't on Wi-Fi, null if not a tablet. */
export function uploadUrl() {
  return isTablet() ? N().uploadUrl() : null;
}

/** Save a JPEG (data URL or bare base64) into this tablet's album. Returns true on a tablet. */
export function savePhoto(jpeg, caption = 'Camera') {
  if (!isTablet() || !N().savePhoto) return false;
  const base64 = String(jpeg).replace(/^data:[^,]+,/, '');
  album = null;
  try { return N().savePhoto(base64, caption); } catch { return false; }
}

/** Save a video clip (bare base64) into this tablet's album. Returns true on a tablet. */
export function saveVideo(base64, caption = 'Video') {
  if (!isTablet() || !N().saveVideo) return false;
  album = null;
  try { return N().saveVideo(String(base64).replace(/^data:[^,]+,/, ''), caption); } catch { return false; }
}

/** Can pictures be removed on this screen itself? (Only on a tablet.) */
export const canRemovePhotos = () => !!(isTablet() && N().deletePhoto);

/** Take a photo or video out of this tablet's album for good. True when it is gone. */
export function removePhoto(id) {
  if (!canRemovePhotos()) return false;
  let gone = false;
  try { gone = !!N().deletePhoto(id); } catch { gone = false; }
  // The app only announces changes that come from phones: tell the screens about this one.
  if (gone) window.dispatchEvent(new Event('tablet-photos'));
  return gone;
}

/** Take several out at once (the album view). Tells the screens once, at the end. Returns how many went. */
export function removePhotos(ids) {
  if (!canRemovePhotos()) return 0;
  let gone = 0;
  (ids || []).forEach((id) => { try { if (N().deletePhoto(id)) gone++; } catch { /* the next one may still go */ } });
  if (gone) { album = null; window.dispatchEvent(new Event('tablet-photos')); }
  return gone;
}

/** The most the album holds (the Android app's PhotoStore.MAX_ITEMS); phones can't send more. */
export const ALBUM_MAX = 500;
/** True when nothing more fits in this screen's album. */
export const albumFull = () => isTablet() && getPhotos().length >= ALBUM_MAX;

// ---- Small copies for the album grid and the "Add photos" screen ----
// Phones send pictures up to 2048 px across. A grid of those as backgrounds would keep
// a dozen full-size pictures in this screen's small memory and decode them all at once.
// So each is drawn once into a small picture, one at a time, and the small one is kept.
const thumbs = {};      // src -> small JPEG data URL, or '' when the file wouldn't open
let thumbCount = 0;
const thumbQueue = [];  // [{ src, w, h, wanted, done }]
let thumbBusy = false;

function nextThumb() {
  if (thumbBusy) return;
  const job = thumbQueue.shift();
  if (!job) return;
  if (job.wanted && !job.wanted()) { job.done(null); nextThumb(); return; } // scrolled past it already
  if (job.key in thumbs) { job.done(thumbs[job.key]); nextThumb(); return; }
  thumbBusy = true;
  const img = new Image();
  const finish = (url) => {
    img.onload = img.onerror = null;
    if (thumbCount > 800) { Object.keys(thumbs).slice(0, 200).forEach((k) => { delete thumbs[k]; thumbCount--; }); }
    if (!(job.key in thumbs)) thumbCount++;
    thumbs[job.key] = url;
    job.done(url);
    thumbBusy = false;
    setTimeout(nextThumb, 0); // let the screen draw between pictures
  };
  img.onload = () => {
    try {
      const c = document.createElement('canvas');
      c.width = job.w; c.height = job.h;
      const s = Math.max(job.w / img.naturalWidth, job.h / img.naturalHeight);
      const w = img.naturalWidth * s, h = img.naturalHeight * s;
      c.getContext('2d').drawImage(img, (job.w - w) / 2, (job.h - h) / 2, w, h);
      finish(c.toDataURL('image/jpeg', 0.72));
    } catch (err) { finish(''); }
  };
  img.onerror = () => finish('');
  img.src = encodeURI(job.src);
}

/**
 * A small copy of a photo, `w` x `h`, filled edge to edge. Resolves to a data URL, '' when
 * the file can't be opened, or null when `wanted()` said it was no longer needed.
 */
export function thumbnail(src, { w = 240, h = 180, wanted = null } = {}) {
  const key = `${w}x${h} ${src}`;
  if (key in thumbs) return Promise.resolve(thumbs[key]);
  return new Promise((done) => {
    thumbQueue.push({ key, src, w, h, wanted, done });
    nextThumb();
  });
}

/** Calls cb() whenever photos are added or removed. Returns an unsubscribe function. */
export function onPhotosChanged(cb) {
  window.addEventListener('tablet-photos', cb);
  return () => window.removeEventListener('tablet-photos', cb);
}

/** QR code as an SVG string (black on white, with a quiet zone). */
export function qrSvg(text, size = 360) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const quiet = 4;
  const total = n + quiet * 2;
  let d = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) d += `M${c + quiet} ${r + quiet}h1v1h-1z`;
    }
  }
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges" aria-label="QR code">
    <rect width="${total}" height="${total}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
