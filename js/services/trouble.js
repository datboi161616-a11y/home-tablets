// A short diary of what went wrong on this screen: for whoever looks after it, months
// later and maybe from far away ("it did something odd on Tuesday"). The last thirty
// things, kept on the device; Settings → Wi-Fi & about shows them. Nothing is sent anywhere.
//
// Two kinds of line: trouble (a screen that couldn't open, the Wi-Fi gone for an hour) and
// plain records (the screens updated themselves to a new version). Records are there to
// match a complaint to a date; they are never counted as something that went wrong.
const KEY = 'trouble.v1';
const MAX = 30;
const startedAt = Date.now();

const read = () => { try { const l = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(l) ? l.filter((x) => x && x.what) : []; } catch (e) { return []; } };

function add(what, screen, record) {
  try {
    const text = String(what || 'Something went wrong').slice(0, 220);
    const list = read();
    const last = list[list.length - 1];
    if (last && last.what === text && last.screen === (screen || '')) { last.times = (last.times || 1) + 1; last.at = Date.now(); }
    else {
      const line = { at: Date.now(), screen: screen || '', what: text };
      if (record) line.info = true;
      list.push(line);
    }
    localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX)));
  } catch (e) { /* storage off or full: nothing to be done about it here */ }
}

/** Write one down: what went wrong, and on which screen. The same thing twice in a row is counted, not repeated. */
export function noteTrouble(what, screen) { add(what, screen, false); }

/** Something worth knowing later that is NOT a fault (the screens updated themselves, say). */
export function noteRecord(what) { add(what, '', true); }

/** Newest first: [{ at, screen, what, times?, info? }] ("info": a record, not a fault). */
export const trouble = () => read().reverse();
/** How many of them are real trouble. */
export const troubleCount = () => read().filter((x) => !x.info).length;
export function clearTrouble() { try { localStorage.removeItem(KEY); } catch (e) { /* storage off */ } }

/** When this page started (the screens have been running since then). */
export const runningSince = () => startedAt;

/** Roughly how much the screen keeps in its own storage (settings, lists, notes), in bytes. */
export function storageUsed() {
  let n = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      n += k.length + (localStorage.getItem(k) || '').length;
    }
  } catch (e) { /* storage off */ }
  return n * 2; // kept as two bytes a character
}
