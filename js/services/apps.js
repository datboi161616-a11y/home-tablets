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

// An app that was allowed but later uninstalled comes back with no name (and no icon).
// Give it a readable name from its package ("com.spotify.music" -> "Spotify") instead of "undefined".
function nameFromPkg(pkg) {
  const skip = ['com', 'org', 'net', 'us', 'tv', 'android', 'app', 'apps', 'mobile', 'client', 'mediaclient', 'music', 'google'];
  const parts = String(pkg || '').split('.').filter((x) => x && skip.indexOf(x) < 0);
  const w = parts[0] || String(pkg || 'App');
  return w.charAt(0).toUpperCase() + w.slice(1);
}

/** [{ pkg, label, icon? , color?, missing? }] */
export function getApps() {
  if (!hasApps()) return SAMPLE;
  try {
    const list = JSON.parse(N().appList());
    return (Array.isArray(list) ? list : []).filter((a) => a && a.pkg).map((a) => (
      a.label ? a : { ...a, label: nameFromPkg(a.pkg), missing: true }));
  } catch { return []; }
}

/** Opens the app. True if it opened; false if it isn't installed (or, in a browser, never). */
export function openApp(pkg) {
  if (!hasApps()) return false;
  try { return !!N().openApp(pkg); } catch { return false; }
}

export function onAppsChanged(cb) {
  window.addEventListener('tablet-apps', cb);
  return () => window.removeEventListener('tablet-apps', cb);
}
