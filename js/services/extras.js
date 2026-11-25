// The extra apps a household can switch on or off (Settings → Extra apps): bills, chores,
// the house manual, trips, the date night jar, the question of the day, the photo of the
// week, plants & pets. Nobody uses them all; each household keeps the ones it likes.
//
// Each one's service offers the same three things, which the Menu and Home use:
//   menuCard() / menuCardHtml()   what its card in the Menu shows
//   homeLine()                    one quiet line for Home, only when something is due
//   onChanged(cb)                 tells when its data changed
const KEY = 'extras.v1'; // { off: [id] }

export const EXTRAS = [
  { id: 'bills', name: 'Bills', bg: '#1F4D3A', ink: '#FFFFFF', soft: '#CDE8D8', load: () => import('./bills-data.js') },
  { id: 'chores', name: 'Chores', bg: '#2C3E63', ink: '#FFFFFF', soft: '#CFD9F0', load: () => import('./chores-data.js') },
  { id: 'care', name: 'Plants & pets', bg: '#FFF8EC', ink: '#1E3A26', soft: '#5E7A4E', load: () => import('./care-data.js') },
  { id: 'trips', name: 'Trips', bg: '#1F2A44', ink: '#FFFFFF', soft: '#D8DEEE', load: () => import('./trips-data.js') },
  { id: 'datenight', name: 'Date night', bg: '#4A1F35', ink: '#FFF3EC', soft: '#F0BFCB', load: () => import('./datenight-data.js') },
  { id: 'question', name: 'Question of the day', bg: '#1B2440', ink: '#FFFFFF', soft: '#CFD6EE', load: () => import('./question-data.js') },
  { id: 'photoweek', name: 'Photo of the week', bg: '#F6F1E9', ink: '#22303F', soft: '#6E6A60', load: () => import('./photoweek-data.js') },
  { id: 'manual', name: 'House manual', bg: '#1E3A5F', ink: '#FFFFFF', soft: '#CFE0F2', load: () => import('./manual-data.js') },
];

function offList() {
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); return s && Array.isArray(s.off) ? s.off : []; } catch (e) { return []; }
}
/** Is this extra app switched on? (All are, until somebody switches one off.) */
export const extraOn = (id) => offList().indexOf(id) < 0;
/** Switch one on or off. */
export function setExtra(id, on) {
  const off = offList().filter((x) => x !== id);
  if (!on) off.push(id);
  try { localStorage.setItem(KEY, JSON.stringify({ off })); } catch (e) { /* storage off */ }
  window.dispatchEvent(new Event('extras-changed'));
}
/** The extras that are switched on, in menu order. */
export const extrasOn = () => EXTRAS.filter((x) => extraOn(x.id));

const TONE = { late: 0, due: 1, info: 2 };
/**
 * The most pressing line across the extras that are on: { id, text, href, done?, tone } or
 * null. One line only: Home stays quiet.
 */
export async function topHomeLine() {
  const lines = await Promise.all(extrasOn().map((x) => x.load().then((m) => {
    const l = m.homeLine ? m.homeLine() : null;
    return l && l.text ? Object.assign({ id: x.id }, l) : null;
  }).catch(() => null)));
  const have = lines.filter(Boolean).sort((a, b) => (TONE[a.tone] == null ? 3 : TONE[a.tone]) - (TONE[b.tone] == null ? 3 : TONE[b.tone]));
  return have[0] || null;
}
