// Plants & pets (js/screens/care.js): what the household looks after, kept on this screen only.
//
// Saved under one key, 'care.v1': { v: 1, items: [item] } (at most 40)
//   item  { id, kind: 'plant'|'pet', name, look (a painted look, see LOOKS), photo: null | { id, src } (from the album),
//           sub (a plant's spot, or a few words about a pet), notes, tasks: [task] }
//   task  { id, type: 'water', every (days), next: 'YYYY-MM-DD', last }
//         { id, type: 'feed', mins (minutes after midnight, every day), last }
//         { id, type: 'flea', next, dom (its day of the month), last }      monthly
//         { id, type: 'vet', next, last }                                   yearly
//   last  null | { at (ms), who (a name, or '') }: the last time it was done
//
// The date rules are plain functions of (task, now), tested in tools/sim/care-test.mjs.
const KEY = 'care.v1';
const EVENT = 'care-updated';
const DAY = 86400000;
export const MAX_ITEMS = 40;
export const MAX_FEEDS = 3;

// ---- Days ---------------------------------------------------------------------------------
const pad = (n) => String(n).padStart(2, '0');
export const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromIso = (s) => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
const isIso = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
export const addDays = (iso, n) => { const d = fromIso(iso); d.setDate(d.getDate() + n); return isoDay(d); };
/** Whole days from day `a` to day `b` (clock changes don't count). */
export const dayDiff = (a, b) => Math.round((fromIso(b) - fromIso(a)) / DAY);
const monthDay = (y, m, dom) => isoDay(new Date(y, m, Math.min(dom, new Date(y, m + 1, 0).getDate())));
/** The first "day `dom` of a month" after day `iso` (the 31st in a short month is its last day). */
export function nextMonthly(iso, dom) {
  const d = fromIso(iso);
  const here = monthDay(d.getFullYear(), d.getMonth(), dom);
  return here > iso ? here : monthDay(d.getFullYear(), d.getMonth() + 1, dom);
}
/** The same day a number of months on (Jan 31 + 1 -> Feb 28). */
export function addMonths(iso, n) { const d = fromIso(iso); return monthDay(d.getFullYear(), d.getMonth() + n, d.getDate()); }
/** "Sat, Nov 28", or "Jun 12, 2027" in another year */
export const dayWords = (iso, now = new Date()) => fromIso(iso).toLocaleDateString('en-US', fromIso(iso).getFullYear() === now.getFullYear()
  ? { weekday: 'short', month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });

// ---- What is due ----------------------------------------------------------------------------
/**
 * { state, days } for one task right now:
 *   'due'   to do now (a feed whose time has come, anything dated today)
 *   'late'  dated before today, `days` late (feeds are never late: tomorrow is a new day)
 *   'soon'  a feed later today
 *   'done'  done today
 *   'later' dated after today, in `days` days
 */
export function taskState(task, now = new Date()) {
  const today = isoDay(now);
  const doneToday = !!task.last && isoDay(new Date(task.last.at)) === today;
  if (task.type === 'feed') {
    if (doneToday) return { state: 'done', days: 0 };
    return { state: now.getHours() * 60 + now.getMinutes() >= task.mins ? 'due' : 'soon', days: 0 };
  }
  const d = dayDiff(task.next, today);
  if (d < 0) return { state: doneToday ? 'done' : 'later', days: -d };
  return { state: d ? 'late' : 'due', days: d };
}
/** The task as it is once somebody has done it at `now`: remembered, and its next date moved on. */
export function afterDone(task, who = '', now = new Date()) {
  const today = isoDay(now);
  const t = Object.assign({}, task, { last: { at: now.getTime(), who: String(who || '').slice(0, 30) } });
  if (task.type === 'water') t.next = addDays(today, task.every);
  // (Done a few days early or late, the month's own day stays: the 1st stays the 1st.)
  else if (task.type === 'flea') t.next = nextMonthly(task.next > today ? task.next : today, task.dom);
  else if (task.type === 'vet') t.next = addMonths(today, 12);
  return t;
}
const RANK = { due: 0, late: 1, soon: 2, done: 3 };
/** Today's care, in the order it is shown: due now, late (latest first), later today, done. [{ key, item, task, state, days }] */
export function todayList(items = careItems(), now = new Date()) {
  const out = [];
  items.forEach((item, i) => item.tasks.forEach((task) => {
    const s = taskState(task, now);
    if (s.state !== 'later') out.push({ key: `${item.id}:${task.id}`, item, task, state: s.state, days: s.days, i });
  }));
  return out.sort((a, b) => RANK[a.state] - RANK[b.state] || (a.state === 'late' ? b.days - a.days : 0)
    || (a.state === 'done' ? a.task.last.at - b.task.last.at : (a.task.mins || 0) - (b.task.mins || 0)) || a.i - b.i);
}
/** The dated things still to come, soonest first. [{ key, item, task, date }] */
export function comingUp(items = careItems(), now = new Date()) {
  const today = isoDay(now);
  const out = [];
  items.forEach((item) => item.tasks.forEach((task) => {
    if (task.type !== 'feed' && task.next > today) out.push({ key: `${item.id}:${task.id}`, item, task, date: task.next });
  }));
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

// ---- Words --------------------------------------------------------------------------------
export const feedName = (mins) => (mins < 630 ? 'Breakfast' : mins < 900 ? 'Lunch' : 'Dinner');
export const taskName = (task) => ({ water: 'Water', flea: 'Flea & tick', vet: 'Vet checkup' }[task.type] || feedName(task.mins));
export const lateWords = (days) => `${days} day${days === 1 ? '' : 's'} late`;
/** "Due now" / "2 days late" */
export const stateWords = (e) => (e.state === 'late' ? lateWords(e.days) : 'Due now');
/** Home's line: "Feed Biscuit", "Water Monstera" */
export function doWords(item, task) {
  if (task.type === 'feed') return `Feed ${item.name}`;
  if (task.type === 'water') return `Water ${item.name}`;
  return `${item.name} · ${task.type === 'vet' ? 'Vet' : 'Flea & tick'}`;
}
/** The menu card's line: "Biscuit’s dinner", "Water the Monstera" */
export function cardWords(item, task) {
  if (task.type === 'water') return `Water the ${item.name}`;
  return `${item.name}’s ${taskName(task).toLowerCase()}`;
}
/** Once it is done: "Biscuit fed", "Monstera watered", "Biscuit’s flea & tick done" */
export const doneWords = (item, task) => (task.type === 'feed' ? `${item.name} fed` : task.type === 'water' ? `${item.name} watered`
  : `${item.name}’s ${task.type === 'vet' ? 'checkup' : 'flea & tick'} done`);

// ---- Common houseplants: how often they want water, and the painted look nearest to them ----
const PLANTS = [
  ['Monstera', 7, 'monstera'], ['Fiddle-leaf fig', 7, 'fig'], ['Snake plant', 14, 'snake'], ['Pothos', 7, 'pothos'], ['Basil', 2, 'herb'],
  ['Mint', 2, 'herb'], ['Parsley', 3, 'herb'], ['Rosemary', 5, 'herb'], ['Thyme', 5, 'herb'], ['Spider plant', 7, 'pothos'],
  ['Peace lily', 5, 'monstera'], ['ZZ plant', 14, 'snake'], ['Rubber plant', 10, 'fig'], ['Aloe', 14, 'snake'], ['Jade plant', 14, 'herb'],
  ['Christmas cactus', 10, 'pothos'], ['Cactus', 21, 'snake'], ['Succulent', 14, 'herb'], ['Orchid', 7, 'monstera'], ['Fern', 3, 'pothos'],
  ['Philodendron', 7, 'pothos'], ['Calathea', 5, 'monstera'], ['Ivy', 5, 'pothos'], ['Money tree', 10, 'fig'], ['Dracaena', 10, 'fig'],
  ['African violet', 5, 'herb'], ['Bird of paradise', 7, 'monstera'], ['Lavender', 7, 'herb'], ['Palm', 7, 'fig'], ['Tomato', 2, 'herb'],
];
/** { name, every, look } for a plant's name as typed ("my big monstera"), or null. */
export function plantHint(name) {
  const q = String(name || '').toLowerCase();
  const hit = PLANTS.filter((p) => q.indexOf(p[0].toLowerCase()) >= 0 || (p[0] === 'Fiddle-leaf fig' && /\bfig\b|fiddle/.test(q)))[0];
  return hit ? { name: hit[0], every: hit[1], look: hit[2] } : null;
}
/** Plant names for the keyboard's row: the ones that start with what is typed. */
export function plantNames(typed, n = 5) {
  const q = String(typed || '').trim().toLowerCase();
  const names = PLANTS.map((p) => p[0]);
  const starts = names.filter((p) => p.toLowerCase().indexOf(q) === 0);
  return starts.concat(names.filter((p) => q && p.toLowerCase().indexOf(` ${q}`) > 0)).slice(0, n);
}

// ---- The painted looks ------------------------------------------------------------------------
export const LOOKS = { plant: ['monstera', 'fig', 'snake', 'pothos', 'herb'], pet: ['dog', 'cat', 'fish', 'pet'] };
/** The soft circle behind each look. */
export const LOOK_BG = { dog: '#F6DDB4', cat: '#E4E4EA', fish: '#DDE9F2', pet: '#F1E3CC', monstera: '#DCEBD3', fig: '#E6EED8', snake: '#E3E8DA', pothos: '#E4EFD8', herb: '#D8E9EC' };
const ART = {
  dog: '<defs><linearGradient id="@" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#EBB065"/><stop offset="1" stop-color="#C7843E"/></linearGradient></defs><path d="M146 168 Q186 150 176 108" stroke="#C7843E" stroke-width="14" fill="none" stroke-linecap="round"/><ellipse cx="100" cy="150" rx="54" ry="42" fill="url(#@)"/><ellipse cx="100" cy="140" rx="28" ry="30" fill="#F4CF94"/><rect x="74" y="158" width="18" height="36" rx="9" fill="#D99A50"/><rect x="108" y="158" width="18" height="36" rx="9" fill="#D99A50"/><ellipse cx="83" cy="193" rx="12" ry="6" fill="#F4CF94"/><ellipse cx="117" cy="193" rx="12" ry="6" fill="#F4CF94"/><path d="M70 112 Q100 126 130 112" stroke="#C8303A" stroke-width="8" fill="none" stroke-linecap="round"/><circle cx="100" cy="124" r="6" fill="#F2C23A"/><ellipse cx="100" cy="78" rx="42" ry="38" fill="url(#@)"/><ellipse cx="62" cy="84" rx="14" ry="30" fill="#B26C2C" transform="rotate(18 62 84)"/><ellipse cx="138" cy="84" rx="14" ry="30" fill="#B26C2C" transform="rotate(-18 138 84)"/><ellipse cx="100" cy="96" rx="22" ry="16" fill="#F7DCAA"/><path d="M93 106 Q100 122 107 106Z" fill="#E8707A"/><ellipse cx="100" cy="88" rx="9" ry="6.5" fill="#2A1A12"/><circle cx="85" cy="72" r="5" fill="#2A1A12"/><circle cx="115" cy="72" r="5" fill="#2A1A12"/><circle cx="86.5" cy="70.5" r="1.6" fill="#fff"/><circle cx="116.5" cy="70.5" r="1.6" fill="#fff"/>',
  monstera: '<g stroke="#3E8A54" stroke-width="5" fill="none" stroke-linecap="round"><path d="M100 146 Q90 110 64 80"/><path d="M100 146 Q112 100 140 70"/><path d="M100 146 Q100 100 100 50"/><path d="M100 146 Q120 128 158 118"/></g><g transform="rotate(200 58 82)"><ellipse cx="58" cy="82" rx="34" ry="27.88" fill="#2F7D4A"/><g stroke="#FFF8EC" stroke-width="4" stroke-linecap="round"><line x1="66.5" y1="71.8" x2="90.3" y2="63.3"/><line x1="68.2" y1="83.7" x2="92" y2="83.7"/><line x1="66.5" y1="93.9" x2="90.3" y2="102.4"/></g><line x1="30.79" y1="82" x2="61.4" y2="82" stroke="#4FA06A" stroke-width="2.5"/></g><g transform="rotate(-20 142 70)"><ellipse cx="142" cy="70" rx="34" ry="27.88" fill="#2F7D4A"/><g stroke="#FFF8EC" stroke-width="4" stroke-linecap="round"><line x1="150.5" y1="59.8" x2="174.3" y2="51.3"/><line x1="152.2" y1="71.7" x2="176" y2="71.7"/><line x1="150.5" y1="81.9" x2="174.3" y2="90.4"/></g><line x1="114.8" y1="70" x2="145.4" y2="70" stroke="#4FA06A" stroke-width="2.5"/></g><g transform="rotate(-90 100 46)"><ellipse cx="100" cy="46" rx="30" ry="24.59" fill="#2F7D4A"/><g stroke="#FFF8EC" stroke-width="4" stroke-linecap="round"><line x1="107.5" y1="37.0" x2="128.5" y2="29.5"/><line x1="109.0" y1="47.5" x2="130" y2="47.5"/><line x1="107.5" y1="56.5" x2="128.5" y2="64.0"/></g><line x1="76.0" y1="46" x2="103.0" y2="46" stroke="#4FA06A" stroke-width="2.5"/></g><g transform="rotate(10 156 118)"><ellipse cx="156" cy="118" rx="26" ry="21.32" fill="#2F7D4A"/><g stroke="#FFF8EC" stroke-width="4" stroke-linecap="round"><line x1="162.5" y1="110.2" x2="180.7" y2="103.7"/><line x1="163.8" y1="119.3" x2="182" y2="119.3"/><line x1="162.5" y1="127.1" x2="180.7" y2="133.6"/></g><line x1="135.2" y1="118" x2="158.6" y2="118" stroke="#4FA06A" stroke-width="2.5"/></g><path d="M64 150 L136 150 L126 204 Q100 210 74 204Z" fill="#C8643B"/><rect x="56" y="140" width="88" height="18" rx="6" fill="#A44E2C"/><path d="M76 160 L82 200" stroke="#fff" stroke-opacity=".18" stroke-width="5" stroke-linecap="round"/>',
  herb: '<ellipse cx="70" cy="120" rx="13" ry="9" fill="#6DB24A" transform="rotate(-20 70 120)"/><ellipse cx="90" cy="104" rx="13" ry="9" fill="#5EA040" transform="rotate(10 90 104)"/><ellipse cx="110" cy="110" rx="13" ry="9" fill="#7CC05A" transform="rotate(-10 110 110)"/><ellipse cx="130" cy="122" rx="13" ry="9" fill="#6DB24A" transform="rotate(20 130 122)"/><ellipse cx="80" cy="136" rx="13" ry="9" fill="#5EA040" transform="rotate(0 80 136)"/><ellipse cx="120" cy="138" rx="13" ry="9" fill="#7CC05A" transform="rotate(0 120 138)"/><ellipse cx="100" cy="90" rx="13" ry="9" fill="#6DB24A" transform="rotate(0 100 90)"/><ellipse cx="100" cy="128" rx="13" ry="9" fill="#5EA040" transform="rotate(0 100 128)"/><ellipse cx="60" cy="136" rx="13" ry="9" fill="#7CC05A" transform="rotate(-30 60 136)"/><ellipse cx="140" cy="136" rx="13" ry="9" fill="#5EA040" transform="rotate(30 140 136)"/><path d="M64 150 L136 150 L126 204 Q100 210 74 204Z" fill="#5E9AA8"/><rect x="56" y="140" width="88" height="18" rx="6" fill="#4A7F8C"/><path d="M76 160 L82 200" stroke="#fff" stroke-opacity=".18" stroke-width="5" stroke-linecap="round"/>',
  cat: '<defs><linearGradient id="@" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#A3A9B4"/><stop offset="1" stop-color="#7A818E"/></linearGradient></defs><path d="M140 186 Q190 186 182 140 Q178 118 162 124" stroke="#7A818E" stroke-width="13" fill="none" stroke-linecap="round"/><ellipse cx="100" cy="150" rx="48" ry="44" fill="url(#@)"/><ellipse cx="100" cy="150" rx="22" ry="30" fill="#E8E4DE"/><g stroke="#5E6470" stroke-width="5" stroke-linecap="round"><path d="M58 140 Q66 136 70 142"/><path d="M142 140 Q134 136 130 142"/><path d="M56 160 Q64 156 70 162"/><path d="M144 160 Q136 156 130 162"/></g><ellipse cx="82" cy="192" rx="13" ry="7" fill="#E8E4DE"/><ellipse cx="118" cy="192" rx="13" ry="7" fill="#E8E4DE"/><path d="M60 74 L58 24 L94 52Z" fill="#8C929E"/><path d="M140 74 L142 24 L106 52Z" fill="#8C929E"/><path d="M66 64 L65 36 L86 54Z" fill="#E8A0A8"/><path d="M134 64 L135 36 L114 54Z" fill="#E8A0A8"/><ellipse cx="100" cy="80" rx="46" ry="40" fill="url(#@)"/><g stroke="#5E6470" stroke-width="5" stroke-linecap="round"><path d="M90 46 L92 60"/><path d="M100 44 L100 60"/><path d="M110 46 L108 60"/></g><ellipse cx="100" cy="98" rx="20" ry="13" fill="#E8E4DE"/><path d="M95 90 L105 90 L100 96Z" fill="#E8848E"/><ellipse cx="82" cy="78" rx="8" ry="9" fill="#9CC96A"/><ellipse cx="118" cy="78" rx="8" ry="9" fill="#9CC96A"/><ellipse cx="82" cy="78" rx="2.6" ry="7" fill="#1E2418"/><ellipse cx="118" cy="78" rx="2.6" ry="7" fill="#1E2418"/><g stroke="#F4F1EC" stroke-width="1.6" opacity=".9"><line x1="78" y1="98" x2="44" y2="92"/><line x1="78" y1="102" x2="44" y2="106"/><line x1="122" y1="98" x2="156" y2="92"/><line x1="122" y1="102" x2="156" y2="106"/></g>',
  fig: '<path d="M100 146 L100 20" stroke="#6B4A36" stroke-width="6"/><g transform="rotate(-30 80 40)"><ellipse cx="80" cy="40" rx="16" ry="24" fill="#3E8A4C"/><line x1="80" y1="20" x2="80" y2="60" stroke="#7CC08A" stroke-width="2"/></g><g transform="rotate(30 120 34)"><ellipse cx="120" cy="34" rx="16" ry="24" fill="#3E8A4C"/><line x1="120" y1="14" x2="120" y2="54" stroke="#7CC08A" stroke-width="2"/></g><g transform="rotate(-50 78 78)"><ellipse cx="78" cy="78" rx="16" ry="24" fill="#3E8A4C"/><line x1="78" y1="58" x2="78" y2="98" stroke="#7CC08A" stroke-width="2"/></g><g transform="rotate(45 124 72)"><ellipse cx="124" cy="72" rx="16" ry="24" fill="#3E8A4C"/><line x1="124" y1="52" x2="124" y2="92" stroke="#7CC08A" stroke-width="2"/></g><g transform="rotate(-60 84 112)"><ellipse cx="84" cy="112" rx="16" ry="24" fill="#3E8A4C"/><line x1="84" y1="92" x2="84" y2="132" stroke="#7CC08A" stroke-width="2"/></g><g transform="rotate(60 118 110)"><ellipse cx="118" cy="110" rx="16" ry="24" fill="#3E8A4C"/><line x1="118" y1="90" x2="118" y2="130" stroke="#7CC08A" stroke-width="2"/></g><g transform="rotate(0 100 20)"><ellipse cx="100" cy="20" rx="16" ry="24" fill="#3E8A4C"/><line x1="100" y1="0" x2="100" y2="40" stroke="#7CC08A" stroke-width="2"/></g><path d="M64 150 L136 150 L126 204 Q100 210 74 204Z" fill="#EDE3D2"/><rect x="56" y="140" width="88" height="18" rx="6" fill="#CFC2AC"/><path d="M76 160 L82 200" stroke="#fff" stroke-opacity=".18" stroke-width="5" stroke-linecap="round"/>',
  snake: '<path d="M66 150 Q64 90 70 50 Q88 90 86 150Z" fill="#3F7A4A" stroke="#D6C25A" stroke-width="3"/><path d="M69 120 L83 114 M68 150 L84 144" stroke="#2C5A36" stroke-width="3"/><path d="M90 150 Q88 60 100 20 Q112 60 110 150Z" fill="#3F7A4A" stroke="#D6C25A" stroke-width="3"/><path d="M93 90 L107 84 M92 120 L108 114" stroke="#2C5A36" stroke-width="3"/><path d="M114 150 Q112 84 130 44 Q136 84 134 150Z" fill="#3F7A4A" stroke="#D6C25A" stroke-width="3"/><path d="M117 114 L131 108 M116 144 L132 138" stroke="#2C5A36" stroke-width="3"/><path d="M78 150 Q76 110 85 70 Q100 110 98 150Z" fill="#3F7A4A" stroke="#D6C25A" stroke-width="3"/><path d="M81 140 L95 134 M80 170 L96 164" stroke="#2C5A36" stroke-width="3"/><path d="M104 150 Q102 106 117 66 Q126 106 124 150Z" fill="#3F7A4A" stroke="#D6C25A" stroke-width="3"/><path d="M107 136 L121 130 M106 166 L122 160" stroke="#2C5A36" stroke-width="3"/><path d="M64 150 L136 150 L126 204 Q100 210 74 204Z" fill="#2F3640"/><rect x="56" y="140" width="88" height="18" rx="6" fill="#1E242C"/><path d="M76 160 L82 200" stroke="#fff" stroke-opacity=".18" stroke-width="5" stroke-linecap="round"/>',
  pothos: '<g stroke="#5E9A4A" stroke-width="3" fill="none"><path d="M70 146 Q40 170 46 210"/><path d="M130 146 Q164 170 158 214"/><path d="M100 146 Q96 110 86 96"/></g><path transform="rotate(20 46 180)" d="M46 192 C30 180 34 166 46 174 C58 166 62 180 46 192Z" fill="#7CB85A"/><path transform="rotate(-10 50 206)" d="M50 218 C34 206 38 192 50 200 C62 192 66 206 50 218Z" fill="#9CCB6A"/><path transform="rotate(-20 158 186)" d="M158 198 C142 186 146 172 158 180 C170 172 174 186 158 198Z" fill="#7CB85A"/><path transform="rotate(10 154 212)" d="M154 224 C138 212 142 198 154 206 C166 198 170 212 154 224Z" fill="#9CCB6A"/><path transform="rotate(0 86 100)" d="M86 112 C70 100 74 86 86 94 C98 86 102 100 86 112Z" fill="#7CB85A"/><path transform="rotate(30 104 118)" d="M104 130 C88 118 92 104 104 112 C116 104 120 118 104 130Z" fill="#9CCB6A"/><path transform="rotate(-30 76 126)" d="M76 138 C60 126 64 112 76 120 C88 112 92 126 76 138Z" fill="#6DAE4C"/><path transform="rotate(20 124 128)" d="M124 140 C108 128 112 114 124 122 C136 114 140 128 124 140Z" fill="#7CB85A"/><path d="M64 150 L136 150 L126 204 Q100 210 74 204Z" fill="#F3E7D2"/><rect x="56" y="140" width="88" height="18" rx="6" fill="#D8C8AE"/><path d="M76 160 L82 200" stroke="#fff" stroke-opacity=".18" stroke-width="5" stroke-linecap="round"/>',
  fish: '<circle cx="100" cy="124" r="74" fill="#D9EEF3"/><path d="M30 100 A74 74 0 1 0 170 100Z" fill="#8FCDE0"/><path d="M52 176 Q56 150 62 176 M66 180 Q72 142 78 182" stroke="#5EA040" stroke-width="5" fill="none" stroke-linecap="round"/>'
    + '<path d="M76 140 L52 122 L52 158Z" fill="#E0702A"/><ellipse cx="104" cy="140" rx="32" ry="19" fill="#F28A3C"/><path d="M96 124 Q106 108 116 126Z" fill="#E0702A"/><circle cx="120" cy="135" r="4" fill="#2A1A12"/>'
    + '<circle cx="146" cy="112" r="4" fill="#fff" opacity=".8"/><circle cx="154" cy="96" r="2.5" fill="#fff" opacity=".8"/><ellipse cx="100" cy="52" rx="46" ry="9" fill="#B9DCE5"/><ellipse cx="100" cy="52" rx="38" ry="5" fill="#E8F5F8"/>',
  pet: '<circle cx="100" cy="112" r="82" fill="#E7CFA8"/><ellipse cx="100" cy="138" rx="36" ry="29" fill="#8A5A3A"/><circle cx="56" cy="104" r="14" fill="#8A5A3A"/><circle cx="82" cy="72" r="15.5" fill="#8A5A3A"/><circle cx="118" cy="72" r="15.5" fill="#8A5A3A"/><circle cx="144" cy="104" r="14" fill="#8A5A3A"/>',
};
let artN = 0;
/** A painted look as a picture that fills its box (each one gets its own gradient name). */
export function lookArt(look) {
  const inner = (ART[look] || ART.pet).replace(/@/g, `care-g${++artN}`);
  return `<svg viewBox="0 0 200 215" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style="display:block" aria-hidden="true">${inner}</svg>`;
}
export const itemLook = (item) => (ART[item.look] ? item.look : item.kind === 'plant' ? 'monstera' : 'pet');

// ---- Saved ----------------------------------------------------------------------------------
const text = (s, max) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, max);
const newId = (p) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
function tidyLast(l) {
  return l && typeof l.at === 'number' && isFinite(l.at) ? { at: l.at, who: text(l.who, 30) } : null;
}
function tidyTask(t, kind) {
  if (!t || typeof t !== 'object') return null;
  const base = { id: text(t.id, 20) || newId('t'), type: t.type, last: tidyLast(t.last) };
  if (kind === 'plant' && t.type === 'water' && isIso(t.next)) return Object.assign(base, { every: Math.max(1, Math.min(60, Math.round(+t.every) || 7)), next: t.next });
  if (kind === 'pet' && t.type === 'feed' && isFinite(+t.mins)) return Object.assign(base, { mins: Math.max(0, Math.min(1439, Math.round(+t.mins))) });
  if (kind === 'pet' && t.type === 'flea' && isIso(t.next)) return Object.assign(base, { next: t.next, dom: Math.max(1, Math.min(31, Math.round(+t.dom) || fromIso(t.next).getDate())) });
  if (kind === 'pet' && t.type === 'vet' && isIso(t.next)) return Object.assign(base, { next: t.next });
  return null;
}
/** An item with every field present and within bounds, or null when it has no name. */
export function tidyItem(it) {
  if (!it || typeof it !== 'object') return null;
  const kind = it.kind === 'pet' ? 'pet' : 'plant';
  const name = text(it.name, 24);
  if (!name) return null;
  let tasks = (Array.isArray(it.tasks) ? it.tasks : []).map((t) => tidyTask(t, kind)).filter(Boolean);
  // One of each dated kind, a few feeds (earliest first), feeds before the dated ones.
  const one = (type) => tasks.filter((t) => t.type === type).slice(0, 1);
  tasks = kind === 'plant' ? one('water')
    : tasks.filter((t) => t.type === 'feed').sort((a, b) => a.mins - b.mins).slice(0, MAX_FEEDS).concat(one('flea'), one('vet'));
  const photo = it.photo && it.photo.src ? { id: text(it.photo.id, 200), src: String(it.photo.src).slice(0, 400) } : null;
  return { id: text(it.id, 20) || newId('c'), kind, name, look: LOOKS[kind].indexOf(it.look) >= 0 ? it.look : LOOKS[kind][kind === 'pet' ? 3 : 0],
    photo, sub: text(it.sub, 40), notes: text(it.notes, 160), tasks };
}
let seen = { raw: null, list: [] };
/** Everything the household looks after, in the order it was added. */
export function careItems() {
  try {
    const raw = localStorage.getItem(KEY) || '';
    if (raw !== seen.raw) {
      const saved = raw ? JSON.parse(raw) : null;
      seen = { raw, list: (saved && Array.isArray(saved.items) ? saved.items : []).map(tidyItem).filter(Boolean).slice(0, MAX_ITEMS) };
    }
    return seen.list.slice();
  } catch (e) { return []; }
}
export const getCareItem = (id) => careItems().filter((x) => x.id === id)[0] || null;
function write(list) {
  try { localStorage.setItem(KEY, JSON.stringify({ v: 1, items: list })); } catch (e) { return false; }
  window.dispatchEvent(new Event(EVENT));
  return true;
}
/** Add (no id yet), or replace by id. `at`: where a removed one goes back. Returns the saved item, or null (no name, or full). */
export function saveCareItem(it, at = -1) {
  const item = tidyItem(it);
  if (!item) return null;
  const list = careItems();
  const i = list.findIndex((x) => x.id === item.id);
  if (i >= 0) list[i] = item;
  else if (list.length >= MAX_ITEMS) return null;
  else if (at >= 0) list.splice(Math.min(at, list.length), 0, item);
  else list.push(item);
  return write(list) ? item : null;
}
/** Take one away. Returns { item, at } for saveCareItem(item, at) to put it back (Undo), or null. */
export function removeCareItem(id) {
  const list = careItems();
  const at = list.findIndex((x) => x.id === id);
  if (at < 0) return null;
  const item = list.splice(at, 1)[0];
  return write(list) ? { item, at } : null;
}
/** Put one task of an item back as it was (Undo), or change it. */
export function putTask(itemId, task) {
  const item = getCareItem(itemId);
  if (!item) return false;
  return !!saveCareItem(Object.assign({}, item, { tasks: item.tasks.map((t) => (t.id === task.id ? task : t)) }));
}
/** Somebody did it (key: "item:task"). Returns the task as it was, for putTask() to undo, or null. */
export function markDone(key, who = '', now = new Date()) {
  const [itemId, taskId] = String(key).split(':');
  const item = getCareItem(itemId);
  const was = item && item.tasks.filter((t) => t.id === taskId)[0];
  if (!was) return null;
  return putTask(itemId, afterDone(was, who, now)) ? was : null;
}
/** Say who did what was just done. */
export function setWho(key, who) {
  const [itemId, taskId] = String(key).split(':');
  const item = getCareItem(itemId);
  const t = item && item.tasks.filter((x) => x.id === taskId)[0];
  return !!(t && t.last) && putTask(itemId, Object.assign({}, t, { last: { at: t.last.at, who } }));
}

// ---- For Home, the menu and anything else that shows this ---------------------------------------
/** Calls cb() whenever anything here is added, changed, done or removed. Returns an unsubscribe function. */
export function onChanged(cb) {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}
const urgent = (now) => todayList(careItems(), now).filter((e) => e.state === 'due' || e.state === 'late');
/**
 * The one line Home may show: the most urgent thing that is due now or late, else null.
 * { text: 'Feed Biscuit', label: 'Due now' | '2 days late', tone: 'due'|'late', href, done(who?), key, art (the painted look) }
 */
export function homeLine(now = new Date()) {
  const e = urgent(now)[0];
  if (!e) return null;
  return { text: doWords(e.item, e.task), label: stateWords(e), tone: e.state, href: '#/care', key: e.key,
    done: (who = '') => { const was = markDone(e.key, who); return was ? () => putTask(e.item.id, was) : null; }, art: lookArt(itemLook(e.item)) };
}
// The card's rows: what is due or late, then the next dates, three in all.
function cardRows(now) {
  return urgent(now).map((e) => ({ e, label: stateWords(e), tone: e.state }))
    .concat(comingUp(careItems(), now).map((e) => ({ e, label: dayWords(e.date, now), tone: 'info' }))).slice(0, 3);
}
/**
 * The menu card: { title, lines (<= 3: "Due now · Biscuit’s dinner"), badge (how many are due or late),
 *   action: { label: 'Biscuit fed', href, key } (markDone(key) does it in one tap) | { label: '+ Add', href } | null }
 */
export function menuCard(now = new Date()) {
  const due = urgent(now);
  return {
    title: 'Plants & pets',
    lines: cardRows(now).map((r) => `${r.label} · ${cardWords(r.e.item, r.e.task)}`),
    badge: due.length,
    action: due.length ? { label: doneWords(due[0].item, due[0].task), href: '#/care', key: due[0].key }
      : careItems().length ? null : { label: '+ Add', href: '#/care/add' },
  };
}
const escHtml = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TICK = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12.5l5 5 10-11"/></svg>';
/**
 * The menu card's inside, in this feature's look (the card itself: background #FFF8EC, text #1E3A26).
 * The button carries data-care-done="<key>": a tap on it should call markDone(key) instead of opening the app.
 */
export function menuCardHtml(now = new Date()) {
  const items = careItems();
  const due = urgent(now);
  const head = `<div style="display:flex;align-items:baseline;flex:none"><div style="font:700 27px Outfit,sans-serif;white-space:nowrap">Plants &amp; pets</div>${
    due.length ? `<div style="margin-left:auto;font:600 17px Inter,sans-serif;color:#3F7D45;white-space:nowrap">${due.length} to do</div>` : ''}</div>`;
  const go = (label, attr = '') => `<div ${attr} style="position:absolute;left:26px;right:26px;bottom:24px;min-height:58px;border-radius:18px;display:flex;align-items:center;justify-content:center;font:600 18px Inter,sans-serif;background:#3F7D45;color:#fff">${label}</div>`;
  const shelfOf = (list, sizes) => `<div style="position:absolute;left:0;right:0;bottom:92px;height:96px;display:flex;align-items:flex-end;justify-content:center">${
    list.map((x, i) => `<div style="width:${sizes[i % sizes.length]}px;height:${sizes[i % sizes.length]}px;flex:none">${lookArt(itemLook(x))}</div>`).join('')}</div>
    <div style="position:absolute;left:20px;right:20px;bottom:92px;height:8px;border-radius:4px;background:#D9C6A4"></div>`;
  if (!items.length) {
    return `${head}<div style="margin-top:70px;font:italic 500 23px Fraunces,Georgia,serif;text-align:center">Nothing to look after yet</div>
      ${shelfOf([{ look: 'monstera', kind: 'plant' }, { look: 'dog', kind: 'pet' }, { look: 'snake', kind: 'plant' }], [78, 84, 70])}${go('+ Add')}`;
  }
  const tone = { due: '#3F7D45', late: '#8A5A12', info: '#7A8A7C' };
  const rows = cardRows(now).map((r, i) => `<div style="height:66px;display:flex;align-items:center;border-top:${i ? '1.5px solid rgba(30,58,38,.12)' : '0'}">
      <div style="width:50px;height:50px;flex:none;margin-right:12px">${lookArt(itemLook(r.e.item))}</div>
      <div style="min-width:0"><div style="font:600 14px Inter,sans-serif;letter-spacing:.5px;text-transform:uppercase;color:${tone[r.tone]}">${escHtml(r.label)}</div>
      <div style="font:500 20px Inter,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(cardWords(r.e.item, r.e.task))}</div></div></div>`).join('');
  const plants = items.filter((x) => x.kind === 'plant');
  return `${head}<div style="margin-top:10px">${rows}</div>
    ${shelfOf((plants.length ? plants : items).slice(0, 4), [78, 70, 78, 84])}
    ${due.length ? go(`<span style="display:inline-flex;margin-right:8px">${TICK}</span>${escHtml(doneWords(due[0].item, due[0].task))}`, `data-care-done="${escHtml(due[0].key)}"`) : ''}`;
}
