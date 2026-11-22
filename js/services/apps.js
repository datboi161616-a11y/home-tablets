// Regular Android apps (YouTube, Spotify, ...) that you've allowed for this
// tablet in your dashboard, shown as tiles inside our system.
const N = () => window.TabletNative;

export const hasApps = () => !!(N() && N().appList);
/** A normal browser on a PC, not the kitchen screen: the screen shows a made-up list. */
export const isPreview = () => !N();

// Shown when previewing in a normal browser (no tablet), so the screen can be designed.
// The icons are the apps' own (from their Google Play pages), saved in data/app-icons/.
// On a tablet, Android supplies each installed app's real icon instead.
const SAMPLE = [
  { pkg: 'com.google.android.youtube', label: 'YouTube', color: '#FF0033', icon: 'data/app-icons/youtube.png' },
  { pkg: 'com.spotify.music', label: 'Spotify', color: '#1DB954', icon: 'data/app-icons/spotify.png' },
  { pkg: 'com.netflix.mediaclient', label: 'Netflix', color: '#E50914', icon: 'data/app-icons/netflix.png' },
  { pkg: 'us.zoom.videomeetings', label: 'Zoom', color: '#0B5CFF', icon: 'data/app-icons/zoom.png' },
  { pkg: 'com.whatsapp', label: 'WhatsApp', color: '#25D366', icon: 'data/app-icons/whatsapp.png' },
];

// An app that was allowed but later uninstalled comes back with no name (and no icon).
// Give it a readable name from its package ("com.spotify.music" -> "Spotify") instead of "undefined".
function nameFromPkg(pkg) {
  const skip = ['com', 'org', 'net', 'us', 'tv', 'android', 'app', 'apps', 'mobile', 'client', 'mediaclient', 'music', 'google'];
  const parts = String(pkg || '').split('.').filter((x) => x && skip.indexOf(x) < 0);
  const w = parts[0] || String(pkg || 'App');
  return w.charAt(0).toUpperCase() + w.slice(1);
}

// Android draws every icon for appList(), which takes 30-45 ms on the kitchen screens. The
// Menu and the Apps screen both ask within a moment of each other, so a list read in the
// last few seconds is used again; Android saying the apps changed throws it away.
const FRESH_MS = 3000;
let kept = null;
let keptAt = 0;
addEventListener('tablet-apps', () => { kept = null; });

/** [{ pkg, label, icon? , color?, missing? }] */
export function getApps() {
  // A real screen whose Android side is too old to list its apps shows none, not made-up ones.
  if (!hasApps()) return isPreview() ? SAMPLE : [];
  if (kept && Date.now() - keptAt < FRESH_MS) return kept.slice();
  try {
    const list = JSON.parse(N().appList());
    kept = (Array.isArray(list) ? list : []).filter((a) => a && a.pkg).map((a) => (
      a.label ? a : Object.assign({}, a, { label: nameFromPkg(a.pkg), missing: true })));
    keptAt = Date.now();
    return kept.slice();
  } catch (e) { return []; }
}

/** Opens the app. True if Android took the request; false if it isn't installed (or, in a browser, never). */
export function openApp(pkg) {
  if (!hasApps()) return false;
  try { return !!N().openApp(pkg); } catch (e) { return false; }
}

/** Can the Play Store be opened from here to update apps? (Needs a recent launcher app.) */
export const canUpdateApps = () => !!(N() && N().updateApps);

/** Opens the Play Store for a grown-up (the launcher asks for the PIN first). */
export function updateApps() {
  try { N().updateApps(); return true; } catch (e) { return false; }
}

export function onAppsChanged(cb) {
  window.addEventListener('tablet-apps', cb);
  return () => window.removeEventListener('tablet-apps', cb);
}

// ---- Which apps get used: counted on this screen only, so the favourites come first ----
const USE_KEY = 'apps.used.v1';
function readUse() {
  try {
    const u = JSON.parse(localStorage.getItem(USE_KEY) || '{}');
    return u && typeof u === 'object' && !Array.isArray(u) ? u : {};
  } catch (e) { return {}; }
}

/** Count one more opening of `pkg`. */
export function noteOpened(pkg) {
  const u = readUse();
  u[pkg] = { n: ((u[pkg] && u[pkg].n) || 0) + 1, at: Date.now() };
  // Apps that were taken off long ago don't pile up for ever.
  const keys = Object.keys(u);
  if (keys.length > 60) keys.sort((a, b) => (u[a].at || 0) - (u[b].at || 0)).slice(0, keys.length - 60).forEach((k) => { delete u[k]; });
  try { localStorage.setItem(USE_KEY, JSON.stringify(u)); } catch (e) { /* storage off: order stays as it was */ }
}

/** The same apps, most-opened first; ties keep Android's order. */
export function byUse(list) {
  const u = readUse();
  const n = (a) => (u[a.pkg] && u[a.pkg].n) || 0;
  return list.map((a, i) => ({ a, i })).sort((x, y) => n(y.a) - n(x.a) || x.i - y.i).map((x) => x.a);
}
