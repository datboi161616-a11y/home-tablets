// Has this tablet finished (or skipped) the welcome tour?
// Until it has, the Home screen opens the tour instead (see app.js).
// To show it again for a new owner: grown-up menu → "Welcome tour: show again",
// or the "Tour" button on the App menu / flight deck.
const KEY = 'welcome.done.v1';

export function welcomeDone() {
  try { return localStorage.getItem(KEY) === '1'; } catch (e) { return true; }
}
export function setWelcomeDone(done) {
  try { if (done) localStorage.setItem(KEY, '1'); else localStorage.removeItem(KEY); } catch (e) { /* storage off */ }
}
