// Finds where the screen is, with no setup and no API keys.
// 1. Device location (Wi-Fi based), 2. fallback: IP address.
// The town name comes from BigDataCloud's free client-side reverse geocoder.
// Result is cached for a day so we don't ask on every screen.
//
// The owner can also name the town themselves (Settings → Weather): guessing from the
// internet address is sometimes a town or two off, and then the weather is too. A chosen
// town stays until they go back to "find it by itself".

const CACHE_KEY = 'location.v1';
const MANUAL_KEY = 'location.manual.v1';
const MAX_AGE = 24 * 60 * 60 * 1000;

const read = (key) => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; } };

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

/** The town the owner chose by hand, or null while the screen finds it by itself. */
export const manualPlace = () => read(MANUAL_KEY);

/** What the screen last worked out by itself (may be a day old), without asking anyone. */
export const knownPlace = () => read(CACHE_KEY);

/**
 * Towns by that name (or a ZIP / postal code), best match first: [{ lat, lon, town, region, label }].
 * Open-Meteo's free place search; no key, no account.
 */
export async function findPlaces(text) {
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.search = new URLSearchParams({ name: text.trim(), count: 6, language: 'en', format: 'json' });
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error('place search failed');
  const d = await res.json();
  return (d.results || []).map((r) => ({
    lat: r.latitude,
    lon: r.longitude,
    town: r.name,
    region: r.admin1 || '',
    label: [r.name, r.admin1, r.country].filter((part, i, all) => part && all.indexOf(part) === i).join(', '),
  }));
}

/** Use this place (one of findPlaces' answers) from now on; null goes back to finding it by itself. */
export function setPlace(place) {
  try {
    if (place) localStorage.setItem(MANUAL_KEY, JSON.stringify({ lat: place.lat, lon: place.lon, town: place.town, region: place.region, label: place.label, source: 'manual' }));
    else localStorage.removeItem(MANUAL_KEY);
  } catch (e) { /* storage off */ }
  window.dispatchEvent(new Event('place-changed'));
}

export async function getLocation({ fresh = false } = {}) {
  const manual = manualPlace();
  if (manual && typeof manual.lat === 'number') return Object.assign({ at: Date.now() }, manual);

  const cached = read(CACHE_KEY);
  if (!fresh && cached && Date.now() - cached.at < MAX_AGE) return cached;

  let loc;
  try {
    loc = await reverseGeocode(await deviceCoords());
  } catch (e) {
    // The lookup is down or the Wi-Fi is: yesterday's answer is still where the kitchen is.
    if (cached) return cached;
    throw e;
  }
  const saved = { ...loc, at: Date.now() };
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(saved)); } catch (e) { /* storage off */ }
  return saved;
}
