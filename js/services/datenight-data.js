// The date night jar: ideas on folded slips (about sixty to start with, plus the household's
// own), one pulled out at a time, and the date nights that went on the calendar.
// Kept on this screen only, under one key:
//   'datenight.v1' = { v: 1,
//     mine:   [{ id, title, where: 'in'|'out', cost: 'cheap'|'fancy', at (ms) }]   their own ideas
//     gone:   [starter id]                         starter ideas they took out of the jar
//     plans:  [{ id, ideaId, title, date: 'YYYY-MM-DD', time: 'HH:MM', eventId, done }]
//     recent: [idea id]                            the last few pulled out (not pulled again)
//     filter: { where: 'in'|'out'|'any', cost: 'cheap'|'fancy'|'any' } }
// A date night is an ordinary calendar event (my-events.js); it counts as done once its day
// has passed, and is forgotten if it was taken off the calendar before then.
import { saveMyEvent, removeMyEvent, getMyEvent, isoDay, fromIso } from './my-events.js';
import { getDay } from './calendar-data.js';
import { getFamily } from './family.js';
import { timeText, hourText } from './display.js';

const KEY = 'datenight.v1';
const EVENT = 'datenight-updated';
const MAX_MINE = 200;
const MAX_PLANS = 60;
const AVOID = 5; // "Pick again" never repeats the last few
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ---- the starter ideas: [title, the line under it, minutes] ---------------------------
const S = (where, cost, rows) => rows.map((r) => ({ title: r[0], note: r[1], mins: r[2], where, cost }));
const STARTERS = [].concat(
  S('in', 'cheap', [
    ['Homemade pasta night', 'Flour on the counter, a record on, and no rush.', 120],
    ['Blanket fort movie', 'Every cushion in the house, one screen, two spoons.', 150],
    ['Breakfast for dinner', 'Pancakes taste better at seven in the evening.', 60],
    ['Board game rematch', 'Loser does the dishes. Winner picks the next game.', 90],
    ['Living room picnic', 'A blanket on the floor and everything eaten with fingers.', 60],
    ['Bake something new', 'A recipe neither of you has tried, eaten while it’s warm.', 120],
    ['Old photos night', 'Pull out the albums and tell the stories behind them.', 60],
    ['Cards by candlelight', 'Lights off, candles on, one deck of cards.', 60],
    ['Puzzle and a playlist', 'A thousand pieces and the songs from the year you met.', 120],
    ['Pizza contest', 'Half the dough each. Strangest topping that works wins.', 90],
    ['Stars from the yard', 'A blanket, a thermos, and the phones left inside.', 60],
    ['Movie from the year you met', 'Popcorn is not optional.', 150],
    ['Dance in the kitchen', 'Chairs pushed back. Three songs at the very least.', 30],
    ['Plan a dream trip', 'No budget and no limits. Just a map and a pencil.', 60],
    ['Read to each other', 'One chapter each of something neither of you knows.', 60],
  ]),
  S('in', 'fancy', [
    ['Steakhouse at home', 'Good cuts, a hot pan, and the nice plates.', 120],
    ['Dress up for dinner in', 'Best outfits, candles, and nowhere to drive.', 120],
    ['Cheese and wine tasting', 'Five cheeses, two bottles, and score cards.', 90],
    ['Fondue night', 'One pot, long forks, and far too much bread.', 90],
    ['Sushi rolling night', 'The first rolls fall apart. The last ones look bought.', 120],
    ['Three-course cook-off', 'One makes the starter, one the main, dessert together.', 180],
    ['Cocktail class at home', 'Two new recipes and the good ingredients for once.', 90],
    ['Chocolate tasting', 'Six bars, small squares, and strong opinions.', 60],
    ['Spa night', 'Robes, face masks, and towels warm from the dryer.', 120],
    ['The fancy takeout', 'The place saved for birthdays, eaten in slippers.', 90],
    ['Seafood boil', 'Paper on the table, everything in one pot, no forks.', 120],
    ['Paint each other', 'Real canvases, real paint, no peeking until the end.', 120],
    ['Tasting menu at home', 'Six tiny courses, each on the smallest plate you own.', 180],
    ['Dessert for dinner', 'Skip to the good part: three desserts and two forks.', 60],
    ['Champagne and a classic film', 'Black and white on the screen, bubbles in the glass.', 150],
  ]),
  S('out', 'cheap', [
    ['Sunset walk', 'Leave half an hour early and take the long way.', 60],
    ['Ice cream and a drive', 'Two scoops each, windows down, no destination.', 60],
    ['Farmers market morning', 'Buy one thing you have never cooked before.', 90],
    ['Thrift store challenge', 'Ten dollars each to dress the other one.', 90],
    ['Picnic in the park', 'Sandwiches, a blanket, and something to throw.', 120],
    ['Coffee and a crossword', 'One table by the window and one pen between you.', 60],
    ['Free museum day', 'Each choose one thing to bring home, if only you could.', 120],
    ['Bookstore date', 'Split up, pick a book for each other, meet at the till.', 60],
    ['Hike to a view', 'Snacks at the top. Photos only once you get there.', 180],
    ['Mini golf', 'Loser buys the ice cream afterwards.', 90],
    ['Bowling night', 'Rented shoes, bumpers allowed, no judging.', 120],
    ['Drive with no map', 'Take turns calling left or right at every corner.', 90],
    ['Watch the sunrise', 'An early alarm, a full thermos, and a good spot.', 60],
    ['Walk a new neighborhood', 'Somewhere you have only ever driven through.', 90],
    ['Stars out of town', 'Far enough from the streetlights to see them all.', 120],
  ]),
  S('out', 'fancy', [
    ['Dinner somewhere new', 'A place neither of you has tried. Order to share.', 120],
    ['Concert night', 'Tickets on the fridge and something to look forward to.', 180],
    ['Theater tickets', 'Dress up a little. A drink at the interval.', 180],
    ['Tasting menu out', 'Let the kitchen decide every course.', 150],
    ['Night in a hotel', 'Close to home, far from the laundry.', 180],
    ['Massage for two', 'An hour of nobody asking you for anything.', 120],
    ['Cooking class', 'Somebody else’s kitchen, and somebody else’s washing up.', 180],
    ['Wine bar and small plates', 'Order slowly, one plate at a time.', 120],
    ['Dancing lessons', 'Stepping on toes is part of it.', 90],
    ['Comedy club', 'Sit near the front only if you are feeling brave.', 120],
    ['Rooftop drinks', 'Get there before the sun goes down.', 90],
    ['Day trip by train', 'Pick a stop you have never got off at.', 240],
    ['Pottery class', 'Two wobbly mugs to keep for ever.', 120],
    ['Live jazz', 'A small table, low lights, and no talking over the solo.', 120],
    ['Escape room', 'One hour to find out who stays calm.', 90],
  ]),
).map((idea, i) => Object.assign(idea, { id: `s${i < 9 ? '0' : ''}${i + 1}` }));

// ---- saving ---------------------------------------------------------------------------
const fresh = () => ({ v: 1, mine: [], gone: [], plans: [], recent: [], filter: { where: 'any', cost: 'any' } });
let seen = { raw: undefined, state: null };
function load() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch (e) { /* no storage: start empty */ }
  if (raw === seen.raw && seen.state) return seen.state;
  const st = fresh();
  try {
    const got = JSON.parse(raw || 'null');
    if (got && got.v === 1) {
      const arr = (x) => (Array.isArray(x) ? x : []);
      st.mine = arr(got.mine).filter((m) => m && m.id && typeof m.title === 'string' && m.title).slice(0, MAX_MINE);
      st.gone = arr(got.gone).filter((x) => typeof x === 'string').slice(0, STARTERS.length);
      st.plans = arr(got.plans).filter((p) => p && p.id && p.title && /^\d{4}-\d{2}-\d{2}$/.test(p.date || '')).slice(-MAX_PLANS);
      st.recent = arr(got.recent).filter((x) => typeof x === 'string').slice(-AVOID);
      if (got.filter) st.filter = { where: cleanWhere(got.filter.where, 'any'), cost: cleanCost(got.filter.cost, 'any') };
    }
  } catch (e) { /* unreadable: start empty */ }
  seen = { raw, state: st };
  return st;
}
function save(st, quiet) {
  try {
    const raw = JSON.stringify(st);
    localStorage.setItem(KEY, raw);
    seen = { raw, state: st };
  } catch (e) { seen = { raw: undefined, state: null }; }
  if (!quiet) window.dispatchEvent(new Event(EVENT));
}

function cleanWhere(x, other) { return x === 'in' || x === 'out' ? x : other; }
function cleanCost(x, other) { return x === 'cheap' || x === 'fancy' ? x : other; }
/** What was typed, tidied: single spaces, a capital first, 60 letters at most. */
export function tidyTitle(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// ---- the rules (plain functions: tools/sim/datenight-test.mjs) -------------------------
/** Does this idea fit the two switches ('any' fits everything)? */
export const fits = (idea, f) => (f.where === 'any' || idea.where === f.where) && (f.cost === 'any' || idea.cost === f.cost);

/**
 * One of `list` by chance (`rand` like Math.random), never one of the ids in `avoid`
 * while anything else is left (the newest of `avoid` is the last to come back).
 */
export function choose(list, avoid = [], rand = Math.random) {
  if (!list.length) return null;
  let skip = avoid.slice(-AVOID);
  let pool = list.filter((i) => skip.indexOf(i.id) < 0);
  while (!pool.length && skip.length) {
    skip = skip.slice(1);
    pool = list.filter((i) => skip.indexOf(i.id) < 0);
  }
  return pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))];
}

/**
 * The evening a date night goes on: the first free Friday or Saturday in the next two weeks,
 * else the first free evening of any day, else simply the next Friday. Tonight only counts
 * before 5 PM. `busy(day)` says whether that evening already has something.
 */
export function nextFreeEvening(now, busy) {
  const first = now.getHours() < 17 ? 0 : 1;
  const day = (i) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + first + i);
  let any = null;
  let friday = null;
  for (let i = 0; i < 14; i++) {
    const d = day(i);
    const weekend = d.getDay() === 5 || d.getDay() === 6;
    if (!friday && d.getDay() === 5) friday = d;
    if (busy(d)) continue;
    if (weekend) return d;
    if (!any) any = d;
  }
  return any || friday;
}

/**
 * The planned date nights as they stand today. One still on the calendar follows its event
 * (moved there: moved here); one taken off the calendar before it happened is forgotten;
 * one whose day has passed is done for good.
 */
export function settle(plans, eventOf, today) {
  const out = [];
  plans.forEach((p) => {
    if (p.done) { out.push(p); return; }
    const ev = eventOf(p.eventId);
    if (!ev) return;
    const q = Object.assign({}, p, { date: ev.date, time: ev.time || p.time });
    if (q.date < today) q.done = true;
    out.push(q);
  });
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** "Nov 14" */
export const dayWords = (iso) => { const d = fromIso(iso); return `${MONTHS[d.getMonth()]} ${d.getDate()}`; };
/** "Fri, Nov 27" */
export const longDayWords = (iso) => `${DAYS[fromIso(iso).getDay()]}, ${dayWords(iso)}`;
/** "7 PM" / "7:30 PM" (or 19:00 with the 24-hour clock) */
export function timeWords(time) {
  const [h, m] = String(time || '19:00').split(':').map(Number);
  return m ? timeText(new Date(2000, 0, 1, h, m)) : hourText(h);
}
/** When a planned one is, said shortly: "Tonight 7 PM", "Tomorrow 7 PM", "Fri 7 PM", "Dec 12". */
export function whenWords(plan, now = new Date()) {
  const d = fromIso(plan.date);
  const days = Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
  if (days === 0) return `Tonight ${timeWords(plan.time)}`;
  if (days === 1) return `Tomorrow ${timeWords(plan.time)}`;
  if (days > 1 && days < 7) return `${DAYS[d.getDay()]} ${timeWords(plan.time)}`;
  return dayWords(plan.date);
}

// ---- the ideas ------------------------------------------------------------------------
/** Everything in the jar: their own (newest first), then the starters they kept. */
export function ideas() {
  const st = load();
  const mine = st.mine.map((m) => ({ id: m.id, title: m.title, note: '', mins: 0, where: cleanWhere(m.where, 'in'), cost: cleanCost(m.cost, 'cheap'), mine: true, at: m.at || 0 }));
  return mine.concat(STARTERS.filter((s) => st.gone.indexOf(s.id) < 0));
}
export const getIdea = (id) => ideas().find((i) => i.id === id) || null;
export const filter = () => Object.assign({}, load().filter);
export function setFilter(change) {
  const st = load();
  if ('where' in change) st.filter.where = cleanWhere(change.where, 'any');
  if ('cost' in change) st.filter.cost = cleanCost(change.cost, 'any');
  save(st, true);
}
/** The ideas that fit the switches as they are set. */
export const fitting = () => { const f = filter(); return ideas().filter((i) => fits(i, f)); };

/** Add their own idea (or change it: give its id). Returns it, or null when nothing was typed. */
export function saveIdea({ id, title, where, cost }) {
  const t = tidyTitle(title);
  if (!t) return null;
  const st = load();
  const old = id ? st.mine.find((m) => m.id === id) : null;
  if (old) Object.assign(old, { title: t, where: cleanWhere(where, 'in'), cost: cleanCost(cost, 'cheap') });
  else {
    // The same words again: it is already in the jar.
    const same = ideas().find((i) => i.title.toLowerCase() === t.toLowerCase());
    if (same) return same;
    if (st.mine.length >= MAX_MINE) st.mine.pop();
    st.mine.unshift({ id: `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, title: t, where: cleanWhere(where, 'in'), cost: cleanCost(cost, 'cheap'), at: Date.now() });
  }
  save(st);
  return getIdea(old ? old.id : st.mine[0].id);
}
/** Take an idea out of the jar. Returns what restoreIdea() needs to put it back. */
export function removeIdea(id) {
  const st = load();
  const at = st.mine.findIndex((m) => m.id === id);
  let undo = null;
  if (at >= 0) undo = { mine: st.mine.splice(at, 1)[0], at };
  else if (STARTERS.some((s) => s.id === id) && st.gone.indexOf(id) < 0) { st.gone.push(id); undo = { starter: id }; }
  if (undo) save(st);
  return undo;
}
export function restoreIdea(undo) {
  if (!undo) return;
  const st = load();
  if (undo.mine) st.mine.splice(Math.min(undo.at, st.mine.length), 0, undo.mine);
  else st.gone = st.gone.filter((x) => x !== undo.starter);
  save(st);
}

/** Pull one out: fits the switches, not one of the last few, not one already on the calendar. */
export function pick(rand = Math.random) {
  const st = load();
  const planned = upcoming().map((p) => p.ideaId);
  const idea = choose(fitting(), planned.concat(st.recent), rand);
  if (!idea) return null;
  st.recent = st.recent.filter((x) => x !== idea.id).concat([idea.id]).slice(-AVOID);
  save(st, true);
  return idea;
}

// ---- on the calendar -------------------------------------------------------------------
const eveningBusy = (d) => {
  const from = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 18);
  const to = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 22);
  return getDay(d).events.some((e) => !e.allDay && e.start < to && (e.end > e.start ? e.end : new Date(e.start.getTime() + 3600000)) > from);
};
function plans() {
  const st = load();
  const now = settle(st.plans, getMyEvent, isoDay(new Date()));
  if (JSON.stringify(now) !== JSON.stringify(st.plans)) { st.plans = now; save(st, true); }
  return now;
}
/** Planned and still to come (today counts), soonest first. */
export const upcoming = () => plans().filter((p) => !p.done);
/** The last three that happened, newest first. */
export const lately = () => plans().filter((p) => p.done).reverse().slice(0, 3);
export const plannedFor = (ideaId) => upcoming().find((p) => p.ideaId === ideaId) || null;

/** Put this idea on the calendar: the next free evening at 7 PM. Returns the plan; throws my-events' friendly errors. */
export function planIdea(idea, now = new Date()) {
  const day = nextFreeEvening(now, eveningBusy);
  const two = getFamily().people.map((n) => String(n || '').trim()).filter(Boolean);
  const ev = saveMyEvent({ title: idea.title, date: isoDay(day), time: '19:00', minutes: idea.mins || 120, tag: 'out', who: two.length === 2 ? two : [] });
  const st = load();
  const plan = { id: `p${ev.id}`, ideaId: idea.id, title: idea.title, date: ev.date, time: ev.time, eventId: ev.id };
  st.plans = st.plans.concat([plan]).slice(-MAX_PLANS);
  save(st);
  return plan;
}
/** Take a planned one back off the calendar (the Undo). */
export function unplan(planId) {
  const st = load();
  const p = st.plans.find((x) => x.id === planId);
  if (!p) return;
  st.plans = st.plans.filter((x) => x.id !== planId);
  save(st);
  try { removeMyEvent(p.eventId); } catch (e) { /* already gone */ }
}

// ---- for Home, the menu and Settings ----------------------------------------------------
/** Home's one line: only on the day of a planned date night. */
export function homeLine() {
  const today = isoDay(new Date());
  const p = upcoming().find((x) => x.date === today);
  return p ? { text: `Date night tonight · ${p.title}`, href: '#/datenight', tone: 'info' } : null;
}
const countWords = (n) => `${n} ${n === 1 ? 'idea' : 'ideas'}`;
/** The menu card in words. */
export function menuCard() {
  const n = ideas().length;
  const next = upcoming()[0];
  return {
    title: 'Date night',
    lines: [n ? countWords(n) : 'Empty'].concat(next ? [`${whenWords(next)} · ${next.title}`] : []),
    badge: 0,
    action: n ? { label: 'Pick one', href: '#/datenight/pick' } : { label: '+ Add an idea', href: '#/datenight/add' },
  };
}
/** The menu card's colours (like the weather card's `look` in launcher.js). */
export const menuCardLook = { bg: 'radial-gradient(ellipse 340px 300px at 50% 62%, #7A2E45 0%, #44182C 60%, #2A0F1C 100%)', ink: '#FFF3EC', soft: '#F0BFCB' };
/** The menu card's insides, in launcher.js's own classes: the name, the count, the next one, the little jar, the button. */
export function menuCardHtml() {
  const c = menuCard();
  const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  return `<div class="lc-head"><span class="lc-name">Date night</span><span class="lc-side" style="color:#F0BFCB">${esc(c.lines[0])}</span></div>
    ${c.lines[1] ? `<div class="lc-sub" style="color:#F0BFCB">${esc(c.lines[1])}</div>` : ''}
    <div style="position:absolute;left:50%;top:104px;margin-left:-105px">${jarImg({ width: 210, slips: ideas().length, key: 'm', lite: true })}</div>
    <div class="lc-go" data-go="${esc(c.action.href)}" style="background:#F4A3B4;color:#3A1526;font-weight:700;font-size:19px">${esc(c.action.label)}</div>`;
}
/** Tell `cb` whenever the jar or its date nights change. Returns the way to stop. */
export function onChanged(cb) {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}

// ---- the painted jar -------------------------------------------------------------------
const PAPER = ['#FFE3C2', '#E98A9E', '#FFF4E6', '#F2B08B', '#CDB6F0', '#F6C66B', '#F4A3B4', '#FFF4E6', '#BFE0D2'];
const JAR = 'M140 96 C140 122 66 126 58 176 L58 408 Q58 458 108 458 L292 458 Q342 458 342 408 L342 176 C334 126 260 122 260 96 Z';
const LIGHTS = [[80, 265], [140, 295], [210, 255], [280, 289], [320, 335], [250, 355], [170, 345], [100, 385], [160, 415], [240, 405], [300, 425]];
/**
 * The glass jar (400 x 480 as drawn), as full as the jar really is.
 * { width (px), slips: how many ideas are inside, lid: on or off, key: makes its ids its own,
 *   lite: a small one (plainer slips) }
 */
export function jarSvg({ width = 400, slips = 40, lid = true, key = 'j', lite = false } = {}) {
  // The same jar every time: the slips fall by a fixed rule, not by chance.
  let seed = 7;
  const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const n = slips <= 0 ? 0 : Math.min(lite ? 64 : 96, Math.max(8, Math.round(slips * 2.4)));
  let paper = '';
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / 8);
    const x = (43 + (i % 8) * 42.5 + (r() - 0.5) * 14).toFixed(1);
    const y = (450 - row * 19.5 + (r() - 0.5) * 8).toFixed(1);
    const rot = Math.round((r() - 0.5) * 70);
    const fill = PAPER[Math.floor(r() * PAPER.length)];
    paper += `<g transform="translate(${x} ${y}) rotate(${rot})"><rect x="-27" y="-12" width="54" height="24" rx="4" fill="${fill}"/>${lite ? '' : '<rect x="-27" y="0" width="54" height="12" rx="3" fill="rgba(60,20,30,.10)"/>'}<path d="M-25 0H25" stroke="rgba(60,20,30,.22)" stroke-width="1.5"/></g>`;
  }
  const top = 450 - Math.floor((n - 1) / 8) * 19.5; // the lights sit among the slips, not in thin air
  const lights = LIGHTS.filter((p) => n && p[1] > top - 30);
  const glow = lights.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="22" fill="url(#${key}Glow)"/><circle cx="${p[0]}" cy="${p[1]}" r="5" fill="#FFF1C4"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${Math.round(width * 1.2)}" viewBox="0 0 400 480" aria-hidden="true" style="display:block;overflow:visible">
    <defs>
      <clipPath id="${key}Clip"><path d="${JAR}"/></clipPath>
      <linearGradient id="${key}Glass" x1="0" x2="1"><stop offset="0" stop-color="#FFFFFF" stop-opacity=".22"/><stop offset=".25" stop-color="#FFFFFF" stop-opacity=".06"/><stop offset=".75" stop-color="#FFFFFF" stop-opacity=".03"/><stop offset="1" stop-color="#FFFFFF" stop-opacity=".18"/></linearGradient>
      <linearGradient id="${key}Lid" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F2CB7E"/><stop offset="1" stop-color="#B07A36"/></linearGradient>
      <radialGradient id="${key}Glow"><stop offset="0" stop-color="#FFD98A" stop-opacity=".75"/><stop offset="1" stop-color="#FFD98A" stop-opacity="0"/></radialGradient>
      <linearGradient id="${key}Hi" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF" stop-opacity=".7"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></linearGradient>
    </defs>
    <ellipse cx="200" cy="462" rx="168" ry="16" fill="rgba(0,0,0,.4)"/>
    <path d="${JAR}" fill="rgba(255,240,230,.06)"/>
    <g clip-path="url(#${key}Clip)">${paper}${lights.length > 1 ? `<path d="M${lights.map((p) => p.join(' ')).join(' L')}" fill="none" stroke="rgba(40,60,30,.55)" stroke-width="1.6"/>` : ''}${glow}</g>
    <path d="${JAR}" fill="url(#${key}Glass)" stroke="rgba(255,255,255,.6)" stroke-width="3.5"/>
    <rect x="138" y="68" width="124" height="30" rx="6" fill="rgba(255,255,255,.08)" stroke="rgba(255,255,255,.55)" stroke-width="3"/>
    <path d="M84 190 C76 240 76 340 84 410" stroke="url(#${key}Hi)" stroke-width="12" stroke-linecap="round" fill="none"/>
    <path d="M318 200 C322 230 322 260 320 280" stroke="rgba(255,255,255,.35)" stroke-width="6" stroke-linecap="round" fill="none"/>
    <path d="M140 88 C160 98 240 98 260 88" fill="none" stroke="#E98A9E" stroke-width="5"/>
    <path d="M140 80 C160 90 240 90 260 80" fill="none" stroke="#E98A9E" stroke-width="5"/>
    <path d="M258 86 C276 96 290 112 294 134" fill="none" stroke="#C98A5A" stroke-width="2.5"/>
    <g transform="translate(296 150) rotate(12)"><path d="M-22 -16 H18 L28 0 L18 16 H-22 Z" fill="#E7C49A" stroke="#B88A5C" stroke-width="2"/><circle cx="16" cy="0" r="4" fill="#8A5A34"/><path d="M-6 -6c-4-6-13-3-11 4 2 6 11 11 11 11s9-5 11-11c2-7-7-10-11-4z" transform="translate(-4 0) scale(.8)" fill="#D2445E"/></g>
    ${lid ? `<rect x="126" y="22" width="148" height="48" rx="12" fill="url(#${key}Lid)"/>
    <path d="M132 34H268M132 46H268M132 58H268" stroke="rgba(90,50,10,.35)" stroke-width="2"/>
    <rect x="126" y="22" width="148" height="10" rx="5" fill="rgba(255,255,255,.35)"/>` : ''}
  </svg>`;
}

// The same jar as a picture. Drawn inline it is ~250 shapes the browser lays out and paints
// again on every visit (on the tablet's slow processor); as an <img> it is drawn once and
// kept. Everything in it is inside its own 400 x 480 box, so it looks exactly the same.
const jarPics = new Map();
/** jarSvg() as an <img> (same options). */
export function jarImg(opts = {}) {
  const svg = jarSvg(opts);
  let url = jarPics.get(svg);
  if (!url) {
    url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    if (jarPics.size > 12) jarPics.clear();
    jarPics.set(svg, url);
  }
  const w = opts.width || 400;
  return `<img src="${url}" width="${w}" height="${Math.round(w * 1.2)}" alt="" aria-hidden="true" draggable="false" style="display:block">`;
}
