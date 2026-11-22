// This screen's household settings, entered when it is set up or from a phone (scan the QR code on
// Photos → Add photos, then "Tablet settings"). Stored on the tablet itself.
//
// { familyName, people: [name], dates: [{ name, month, day, kind: 'birthday'|'event', year? (birthdays) }],
//   calendars: [{ name, url }], units: 'fahrenheit'|'celsius' }
//
// In a normal browser (previewing on a PC) there's no tablet, so a small example
// household (a couple) is used so the screens can still be seen working.

const N = () => window.TabletNative;
export const onTablet = () => !!(N() && N().familySettings);

const EMPTY = { familyName: '', people: [], dates: [], calendars: [], units: 'fahrenheit' };

const PREVIEW = {
  familyName: 'Alex & Jordan',
  people: ['Alex', 'Jordan'],
  dates: [
    { name: "Alex's birthday", month: 1, day: 14, kind: 'birthday', year: 1996 },
    { name: "Jordan's birthday", month: 3, day: 8, kind: 'birthday' },
    { name: 'Anniversary', month: 6, day: 20, kind: 'event' },
  ],
  calendars: [],
  units: 'fahrenheit',
};

let cached = null;
let preview = PREVIEW; // what a PC preview shows (Settings there changes it for the visit)

/** Current settings, with every field present. */
export function getFamily() {
  if (cached) return cached;
  let s = preview;
  if (onTablet()) {
    try { s = { ...EMPTY, ...JSON.parse(N().familySettings()) }; } catch { s = EMPTY; }
  }
  cached = { ...EMPTY, ...s };
  return cached;
}

/**
 * The household's name as they typed it when the screen was set up ("Alex & Jordan",
 * "The Smiths"), or '' when nobody has yet. Most of these screens belong to a couple,
 * one to a family of five: never assume either.
 */
export const householdName = () => String(getFamily().familyName || '').trim();
/** The same, with "Home" standing in until a name is given (for a heading that needs a word). */
export const familyName = () => householdName() || 'Home';

/** Can the name and the temperature unit be changed on the screen itself? (Needs launcher app 1.27 or later.) */
export const canSaveFamily = () => !onTablet() || !!N().saveFamilySettings;

/**
 * Change some of the settings on the screen itself, e.g. saveFamily({ familyName: 'The Smiths' })
 * or saveFamily({ units: 'celsius' }). Whatever isn't named stays. True when saved.
 */
export function saveFamily(change) {
  if (onTablet()) {
    // The app saves it and then announces 'tablet-family', like a change from a phone.
    try { if (!N().saveFamilySettings || !N().saveFamilySettings(JSON.stringify(change))) return false; } catch { return false; }
    cached = null;
    return true;
  }
  preview = { ...preview, ...change };
  cached = null;
  window.dispatchEvent(new Event('tablet-family'));
  return true;
}

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
