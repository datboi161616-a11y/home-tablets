// Has this screen finished (or skipped) the hands-on tutorial (services/tutorial.js)?
// Until it has, Home starts the tutorial instead (see app.js).
// To run it again for a new owner: grown-up menu → "Tutorial: show again",
// or the "Tour" button on the App menu / flight deck.
const KEY = 'welcome.done.v1';

export function welcomeDone() {
  try { return localStorage.getItem(KEY) === '1'; } catch (e) { return true; }
}
export function setWelcomeDone(done) {
  try { if (done) localStorage.setItem(KEY, '1'); else localStorage.removeItem(KEY); } catch (e) { /* storage off */ }
}
