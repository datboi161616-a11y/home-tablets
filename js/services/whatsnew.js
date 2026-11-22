// "What's new": the screens update themselves, so new things arrive without anybody
// knowing. When a batch worth showing off has landed, a quiet word appears on the home
// screen for a week ("New things have arrived"), leading to a page of the highlights.
// A brand-new screen never sees it: the first-start tour is its introduction.
//
// To announce the next batch: add an edition at the END of the list with a new id.
import { profile } from '../config.js';
import { welcomeDone } from './welcome-state.js';

const KITCHEN = [
  { id: '2026-11',
    items: [
      ['Timers with names', 'Pasta, eggs, the oven: name each one with a tap. Cancelled one by mistake? Undo.', 'timers'],
      ['The Gallery', 'Every photo in one place: look through them, add more, take some off, choose which ones show on Home.', 'photos'],
      ['A week plan you can rearrange', 'Move meals between days, plan next week, mark leftovers or eating out.', 'plan'],
      ['A quicker shopping list', 'One-tap everyday things, “2 x milk”, and it goes to the store on your phone.', 'shopping'],
      ['Search by what’s in the fridge', 'Try “chicken rice” or “zucchini”: recipes that use it, not just ones named for it.', 'recipes'],
      ['The whole month', 'A month view on the calendar, and entries that repeat every two weeks or every month.', 'calendar'],
      ['Weather in depth', 'Wind, humidity, the next 24 hours, and any day of the week hour by hour.', 'forecast'],
      ['Notes in one tap', 'Ready-made notes, pin the important one, tick off the chores.', 'messages'],
      ['Make it yours', 'A 24-hour clock, your town, your alarm sound, how long each photo stays on Home.', 'settings'],
    ] },
];
const TOM = [
  { id: '2026-11',
    items: [
      ['Where to look', 'Planes Overhead now says which way to look out of the window, and how high.', 'flights'],
      ['Tonight’s best sight', 'One sentence on the best thing in the sky tonight, and a peek at tomorrow night.', 'sky'],
      ['Space Station, in detail', 'Every visible pass: when, how bright, where it appears and where it fades.', 'sky'],
      ['Every launch, in plain words', 'Go for launch, on hold, moved: and how far away the launch pad is.', 'missions'],
      ['A week of NASA pictures', 'Step back through the past seven days, and read the whole story of each.', 'deepimage'],
      ['Question of the day', 'Trivia with a daily question, no repeats, and a choice of flight, space or weather.', 'trivia'],
      ['Choose your airport', 'The departures board can switch between the airports near you.', 'departures'],
      ['Alerts worth getting up for', 'Only when the sky is dark and clear enough to see it. Seen it? Put it away.', 'alert'],
      ['Set it up your way', 'Your town, the clock, how bright the deck is, when the starfield takes over.', 'settings'],
    ] },
];

const EDITIONS = profile === 'tom' ? TOM : KITCHEN;
const SEEN_KEY = 'whatsnew.seen.v1';      // the id of the last edition looked at
const SINCE_KEY = 'whatsnew.since.v1';    // when the word about the newest one first went up
const WORD_FOR_MS = 7 * 24 * 60 * 60 * 1000;

const get = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const set = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* storage off */ } };

/** The newest batch: { id, items: [[title, line, screen]] }. */
export const newest = () => EDITIONS[EDITIONS.length - 1];

/** Should the home screen mention it? (Not looked at yet, tour already done, and not for more than a week.) */
export function worthAWord() {
  if (!welcomeDone() || get(SEEN_KEY) === newest().id) return false;
  const marker = `${newest().id}|`;
  let since = get(SINCE_KEY) || '';
  if (since.indexOf(marker) !== 0) { since = marker + Date.now(); set(SINCE_KEY, since); }
  return Date.now() - Number(since.slice(marker.length)) < WORD_FOR_MS;
}

/** They have seen it (or just finished the tour, which showed it all). */
export function markSeen() { set(SEEN_KEY, newest().id); }
