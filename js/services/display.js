// What the owner can choose about the screen itself (Settings screen): brightness, the
// clock, the night clock, the photos on Home, alarms, what happens when it is left alone.
// Kept on the device; none of it needs the internet.
const KEY = 'display.v1';
const DEFAULTS = {
  brightness: null,     // 0.05-1, or null to leave it to Android
  clock24: false,       // 15:05 instead of 3:05 PM, everywhere
  night: true,          // switch to the night clock by itself
  nightFrom: 22,        // hour it starts (22 = 10 PM)
  nightTo: 6,           // hour it ends
  nightDim: 0.05,       // how bright the screen stays at night: 0.02 darkest, 0.05 dim, 0.15 soft
  nightStyle: 'full',   // night clock: 'full' (clock, tomorrow's weather and first thing) or 'clock' (clock and date only)
  weekStart: 1,         // the calendar's weeks start on 1 = Monday or 0 = Sunday
  restMinutes: 10,      // back to the resting screen after this long untouched; 0 = stay put
  restScreen: 'home',   // (no longer a choice: Home is the photo frame now)
  homeHideSecs: 10,     // Home: after this long untouched only the photo and the time are left; 0 = never
  holiday: true,        // holiday touches through the year (snow in December, a countdown to Christmas...)
  slideSecs: 60,        // photos on Home: how long each picture stays
  photoZoom: true,      // photos on Home: the slow zoom
  photoCaptions: true,  // photos on Home: who sent it and when
  photoShuffle: false,  // photos on Home: mixed up instead of newest first
  photoClock: true,     // (no longer used: Home always shows the time)
  photoWeather: true,   // (no longer used)
  alarmSound: 'beeps',  // timers: 'beeps', 'chime' or 'bell'
  alarmMinutes: 2,      // timers: how long an alarm rings if nobody stops it
  alarmInsist: true,    // timers: an alarm still ringing after 30 seconds repeats faster
  alarmHeadsUp: false,  // timers: two soft notes a minute before a longer timer runs out
  noteChime: true,      // a soft chime when a note arrives from a phone (never at night)
};

let now = null; // read once, then kept (date wording asks on every call)

/** The current choices, with every field present. Don't change the object; use setDisplay. */
export function display() {
  if (!now) {
    try { now = Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { now = Object.assign({}, DEFAULTS); }
  }
  return now;
}

/** Change some of them, e.g. setDisplay({ brightness: 0.6 }). Tells the rest of the app. */
export function setDisplay(change) {
  now = Object.assign({}, display(), change);
  try { localStorage.setItem(KEY, JSON.stringify(now)); } catch (e) { /* storage off: lasts until the page starts over */ }
  window.dispatchEvent(new Event('display-changed'));
  return now;
}

/** Is it night-clock time right now? */
export function isNightNow(at = new Date()) {
  const s = display();
  if (!s.night) return false;
  const h = at.getHours();
  return s.nightFrom > s.nightTo ? (h >= s.nightFrom || h < s.nightTo) : (h >= s.nightFrom && h < s.nightTo);
}

// ---- The clock, worded the way the owner chose ----
const two = (n) => String(n).padStart(2, '0');
/** "3:05" (AM/PM comes separately, see clockAmPm) or "15:05". */
export function clockTime(d = new Date()) {
  const h = d.getHours();
  return display().clock24 ? `${two(h)}:${two(d.getMinutes())}` : `${((h + 11) % 12) + 1}:${two(d.getMinutes())}`;
}
/** "AM" / "PM", or nothing with the 24-hour clock. */
export const clockAmPm = (d = new Date()) => (display().clock24 ? '' : d.getHours() < 12 ? 'AM' : 'PM');
/** "3:05 PM" or "15:05" */
export const timeText = (d = new Date()) => (display().clock24 ? clockTime(d) : `${clockTime(d)} ${clockAmPm(d)}`);
/** 22 -> "10 PM" or "22:00" */
export const hourText = (h) => (display().clock24 ? `${two(h % 24)}:00` : `${((h + 11) % 12) + 1} ${h % 24 < 12 ? 'AM' : 'PM'}`);
/** Minutes after midnight -> "3:05 PM" or "15:05" */
export const minutesText = (m) => { const d = new Date(2000, 0, 1, Math.floor(m / 60), m % 60); return timeText(d); };

/** What to ask Android for on an ordinary screen: 0.05-1, or -1 to leave the backlight alone. */
export function dayBrightness() {
  const b = display().brightness;
  return typeof b === 'number' ? Math.max(0.05, Math.min(1, b)) : -1;
}
/** ...and on the night clock. */
export const nightBrightness = () => Math.max(0.01, Math.min(0.3, +display().nightDim || 0.05));
