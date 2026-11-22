// Offline support. Strategy: network first, cache as backup.
// When online, tablets always get your latest pushed version.
// When the Wi-Fi drops, they keep running from the last copy they saw.
const CACHE = 'tablet-v2';
// A sick connection (Wi-Fi up, internet half dead) neither answers nor fails for a minute
// or more, and every screen change would wait on it. After this long, the saved copy is
// used instead; the answer, if it ever comes, still replaces the saved copy for next time.
const PATIENCE_MS = 4000;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  // Drop caches from older versions of this file.
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // This tablet's own photos are served by the Android app, never cached here.
  if (url.pathname.includes('/__tablet/')) return;
  // Only cache our own files and fonts; live data APIs handle their own caching.
  const own = url.origin === location.origin;
  if (!own && !url.host.includes('fonts.g')) return;

  // Our own files: always ask the server whether they changed ("no-cache" = revalidate,
  // a quick not-modified answer when nothing changed). Without this, the browser can
  // reuse files for up to 10 minutes after an update and mix old and new pieces.
  const network = (own
    ? fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' })
    : fetch(req))
    .then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    });

  e.respondWith(new Promise((resolve) => {
    let answered = false;
    const answer = (res) => { if (!answered && res) { answered = true; resolve(res); } };
    // Waited long enough: the saved copy of this very file, if there is one. (With none,
    // keep waiting: there is nothing better to give.)
    const patience = setTimeout(() => caches.match(req).then(answer), PATIENCE_MS);
    network.then((res) => { clearTimeout(patience); answer(res); }, () => {
      clearTimeout(patience);
      caches.match(req).then((hit) => hit || caches.match('./index.html')).then((res) => {
        if (!answered) { answered = true; resolve(res || Response.error()); }
      });
    });
  }));
});
