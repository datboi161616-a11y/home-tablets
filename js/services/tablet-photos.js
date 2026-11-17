// This tablet's own photo album. Photos are sent from phones on the same Wi-Fi
// (QR code on the "Add photos" screen) and stored on the tablet by the Android
// app. Nothing goes to the cloud, and each tablet has its own album.
//
// In a normal browser (testing on a PC) there is no tablet, so isTablet() is false
// and screens fall back to sample pictures.
import qrcode from '../vendor/qrcode.js';

const N = () => window.TabletNative;

export const isTablet = () => !!(N() && N().photoList);

const fmtDay = (ms) => new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/** Newest first: [{ id, src, video, title, line, name, added }] — or [] when not on a tablet. */
export function getPhotos() {
  if (!isTablet()) return [];
  try {
    const base = N().photoBase();
    return JSON.parse(N().photoList()).map((p) => ({
      id: p.id,
      src: base + p.id,
      video: !!p.video,
      name: p.name,
      added: p.added,
      title: p.caption || `Added ${fmtDay(p.added)}`,
      line: [p.name && `Added by ${p.name}`, p.caption && fmtDay(p.added)].filter(Boolean).join(' · '),
    }));
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
  try { return N().savePhoto(base64, caption); } catch { return false; }
}

/** Save a video clip (bare base64) into this tablet's album. Returns true on a tablet. */
export function saveVideo(base64, caption = 'Video') {
  if (!isTablet() || !N().saveVideo) return false;
  try { return N().saveVideo(String(base64).replace(/^data:[^,]+,/, ''), caption); } catch { return false; }
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
