// Has this screen finished (or skipped) the first-start welcome and tour (screens/welcome.js, services/tutorial.js)?
// Until it has, Home opens the welcome instead (see app.js).
// To run it again for a new owner: the owner's menu (hold the top-left corner, then the PIN) → "Tutorial: show again",
// or Settings, Wi-Fi & about, "Show the tour again".
const KEY = 'welcome.done.v1';

export function welcomeDone() {
  try { return localStorage.getItem(KEY) === '1'; } catch (e) { return true; }
}
export function setWelcomeDone(done) {
  try { if (done) localStorage.setItem(KEY, '1'); else localStorage.removeItem(KEY); } catch (e) { /* storage off */ }
}
