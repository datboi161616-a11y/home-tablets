// This tablet's family settings, entered from a phone (scan the QR code on
// Photos → Add photos, then "Tablet settings"). Stored on the tablet itself.
//
// { familyName, people: [name], dates: [{ name, month, day, kind: 'birthday'|'event' }],
//   calendars: [{ name, url }], units: 'fahrenheit'|'celsius' }
//
// In a normal browser (previewing on a PC) there's no tablet, so a small example
// family is used so the screens can still be seen working.

const N = () => window.TabletNative;
export const onTablet = () => !!(N() && N().familySettings);

const EMPTY = { familyName: '', people: [], dates: [], calendars: [], units: 'fahrenheit' };

const PREVIEW = {
  familyName: 'Family',
  people: ['Mom', 'Dad', 'Ava', 'Liam', 'Grandma Jo'],
  dates: [
    { name: "Ava's birthday", month: 1, day: 14, kind: 'birthday' },
    { name: "Mom's birthday", month: 3, day: 8, kind: 'birthday' },
    { name: 'Anniversary', month: 6, day: 20, kind: 'event' },
  ],
  calendars: [],
  units: 'fahrenheit',
};

let cached = null;

/** Current settings, with every field present. */
export function getFamily() {
  if (cached) return cached;
  let s = PREVIEW;
  if (onTablet()) {
    try { s = { ...EMPTY, ...JSON.parse(N().familySettings()) }; } catch { s = EMPTY; }
  }
  cached = { ...EMPTY, ...s };
  return cached;
}

/** "The Smiths" or "Family" if not set yet. */
export const familyName = () => getFamily().familyName || 'Family';

/** Settings were changed from a phone. */
export function onFamilyChanged(cb) {
  const h = () => { cached = null; cb(getFamily()); };
  window.addEventListener('tablet-family', h);
  return () => window.removeEventListener('tablet-family', h);
}

/**
 * Downloads the calendar links saved in settings (done by the tablet app, since
 * calendar sites block web pages from reading them). Resolves to [{ name, ics, ok, error }].
 */
export function fetchCalendarFeeds() {
  if (!onTablet() || !N().fetchCalendars) return Promise.resolve([]);
  return new Promise((resolve) => {
    const cb = `cal${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
    const timer = setTimeout(() => { delete window[cb]; resolve([]); }, 45000);
    window[cb] = (feeds) => { clearTimeout(timer); delete window[cb]; resolve(Array.isArray(feeds) ? feeds : []); };
    N().fetchCalendars(cb);
  });
}

// The tablet app tells every screen when settings change.
window.addEventListener('tablet-family', () => { cached = null; });
