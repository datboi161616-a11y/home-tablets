// What the owner can set about the screen itself (Settings screen): how bright it is and
// when the night clock takes over. Kept on the device; none of it needs the internet.
const KEY = 'display.v1';
const DEFAULTS = {
  brightness: null, // 0.05-1, or null to leave it to Android
  night: true,      // switch to the night clock by itself
  nightFrom: 22,    // hour it starts (22 = 10 PM)
  nightTo: 6,       // hour it ends
};

/** The current choices, with every field present. */
export function display() {
  try { return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { return Object.assign({}, DEFAULTS); }
}

/** Change some of them, e.g. setDisplay({ brightness: 0.6 }). Tells the rest of the app. */
export function setDisplay(change) {
  const next = Object.assign(display(), change);
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch (e) { /* storage off: lasts until the page starts over */ }
  window.dispatchEvent(new Event('display-changed'));
  return next;
}

/** Is it night-clock time right now? */
export function isNightNow(now = new Date()) {
  const s = display();
  if (!s.night) return false;
  const h = now.getHours();
  return s.nightFrom > s.nightTo ? (h >= s.nightFrom || h < s.nightTo) : (h >= s.nightFrom && h < s.nightTo);
}

/** 22 -> "10 PM" */
export const hourText = (h) => `${((h + 11) % 12) + 1} ${h % 24 < 12 ? 'AM' : 'PM'}`;

/** What to ask Android for on an ordinary screen: 0.05-1, or -1 to leave the backlight alone. */
export function dayBrightness() {
  const b = display().brightness;
  return typeof b === 'number' ? Math.max(0.05, Math.min(1, b)) : -1;
}
