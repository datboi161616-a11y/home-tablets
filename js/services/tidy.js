// A screen that runs for years collects things in its own storage: where somebody stopped
// in a recipe in March, a round of trivia nobody finished. Small each, but the storage is
// small too (about five million letters), and a full one makes saving fail everywhere at
// once. Once a day this puts away what is certainly finished with, and writes a line in
// the screen's diary (Settings → Wi-Fi & about) when the storage is getting full, so
// whoever looks after the screen hears about it before the owner does.
import { noteTrouble, storageUsed } from './trouble.js';

const MONTH = 30 * 24 * 60 * 60 * 1000;
const NEARLY_FULL = 3.5 * 1024 * 1024 * 2; // bytes, at two a letter: about 70% of the room
// Kept by earlier versions under names nothing reads any more.
const RETIRED = ['trivia.today.v1', 'forecast.v1'];

/** Put away what is finished with. Returns how many things went. */
export function tidyStorage(now = Date.now()) {
  let gone = 0;
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
    keys.forEach((key) => {
      if (!key) return;
      if (RETIRED.indexOf(key) >= 0) { localStorage.removeItem(key); gone++; return; }
      // Where somebody was in a recipe: finished with after a month, unless a timer of its is still going.
      if (key.indexOf('recipe.v1.') === 0) {
        let saved = null;
        try { saved = JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { saved = null; }
        if (!saved || typeof saved !== 'object') { localStorage.removeItem(key); gone++; return; }
        const timers = saved.timers || {};
        const running = Object.keys(timers).some((k) => timers[k] && timers[k].end > now && !timers[k].ack);
        if (saved.at && now - saved.at > MONTH && !running) { localStorage.removeItem(key); gone++; }
      }
    });
    if (storageUsed() > NEARLY_FULL) noteTrouble('The screen’s own storage is getting full (over two thirds used). Notes, lists and settings may stop saving if it fills.', '');
  } catch (e) { /* storage off: nothing to tidy */ }
  return gone;
}

/** A few minutes after starting (when it's quiet), then once a day. */
export function startTidying() {
  setTimeout(tidyStorage, 3 * 60 * 1000);
  setInterval(tidyStorage, 24 * 60 * 60 * 1000);
}
