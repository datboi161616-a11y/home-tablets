// Offline support. Strategy: network first, cache as backup.
// When online, tablets always get your latest pushed version.
// When the Wi-Fi drops, they keep running from the last copy they saw.
const CACHE = 'tablet-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Only cache our own files and fonts; live data APIs handle their own caching.
  const cacheable = url.origin === location.origin || url.host.includes('fonts.g');
  if (!cacheable) return;

  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
  );
});
