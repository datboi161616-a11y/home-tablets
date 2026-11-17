// Finds where the tablet is, with no setup and no API keys.
// 1. Device location (Wi-Fi based on the tablet), 2. fallback: IP address.
// The town name comes from BigDataCloud's free client-side reverse geocoder.
// Result is cached for a day so we don't ask on every screen.

const CACHE_KEY = 'location.v1';
const MAX_AGE = 24 * 60 * 60 * 1000;

function deviceCoords() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => resolve(null),
      { timeout: 8000, maximumAge: MAX_AGE }
    );
  });
}

async function reverseGeocode(coords) {
  // Without coords this endpoint uses the caller's IP address instead.
  const q = coords ? `latitude=${coords.lat}&longitude=${coords.lon}&` : '';
  const res = await fetch(
    `https://api.bigdatacloud.net/data/reverse-geocode-client?${q}localityLanguage=en`,
    { signal: AbortSignal.timeout(10000) }
  );
  if (!res.ok) throw new Error('reverse geocode failed');
  const d = await res.json();
  return {
    lat: coords?.lat ?? d.latitude,
    lon: coords?.lon ?? d.longitude,
    town: (d.city || d.locality || d.principalSubdivision || '')
      .replace(/^(Town|City|Village|Borough|Township) of /i, ''),
    region: d.principalSubdivisionCode?.split('-')[1] || d.principalSubdivision || '',
    source: coords ? 'device' : 'ip',
  };
}

export async function getLocation({ fresh = false } = {}) {
  const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
  if (!fresh && cached && Date.now() - cached.at < MAX_AGE) return cached;

  const loc = await reverseGeocode(await deviceCoords());
  const saved = { ...loc, at: Date.now() };
  localStorage.setItem(CACHE_KEY, JSON.stringify(saved));
  return saved;
}
