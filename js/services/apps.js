// Regular Android apps (YouTube, Spotify, ...) that you've allowed for this
// tablet in your dashboard, shown as tiles inside our system.
const N = () => window.TabletNative;

export const hasApps = () => !!(N() && N().appList);

// Shown when previewing in a normal browser (no tablet), so the screen can be designed.
const SAMPLE = [
  { pkg: 'com.google.android.youtube', label: 'YouTube', color: '#FF0033' },
  { pkg: 'com.spotify.music', label: 'Spotify', color: '#1DB954' },
  { pkg: 'com.netflix.mediaclient', label: 'Netflix', color: '#E50914' },
  { pkg: 'us.zoom.videomeetings', label: 'Zoom', color: '#0B5CFF' },
  { pkg: 'com.whatsapp', label: 'WhatsApp', color: '#25D366' },
];

/** [{ pkg, label, icon? , color? }] */
export function getApps() {
  if (!hasApps()) return SAMPLE;
  try { return JSON.parse(N().appList()); } catch { return []; }
}

export function openApp(pkg) {
  if (hasApps()) return N().openApp(pkg);
  alert(`On the tablet this opens ${pkg}.`);
  return false;
}

export function onAppsChanged(cb) {
  window.addEventListener('tablet-apps', cb);
  return () => window.removeEventListener('tablet-apps', cb);
}
