// Events for the family week calendar (Calendar.dc.html).
// TODO(backend): replace the sample data below with the shared family calendar
// so anyone can add events from their phone. Until then the calendar shows a
// realistic repeating week plus the holidays from config.js.
import { events as holidays } from '../config.js';

// Calendar kinds -> colour. 'family' uses the accent colour from settings.
export const KINDS = {
  family: { label: 'Whole family' },
  house: { label: 'This house', color: '#2D5BA8' },
  birthday: { label: 'Birthdays', color: '#1D2430' },
};

// Repeating sample events. dow: 0 = Monday ... 6 = Sunday.
const WEEKLY = [
  { dow: 0, time: '6:30 PM', title: 'Soccer practice', kind: 'house' },
  { dow: 2, time: '4:00 PM', title: 'Piano lesson', kind: 'house' },
  { dow: 3, time: '7:00 PM', title: 'Family video call', kind: 'family' },
  { dow: 5, time: '9:00 AM', title: 'Farmers market', kind: 'house' },
  { dow: 6, time: '1:00 PM', title: 'Sunday brunch', kind: 'house' },
];

// Sample one-off events and birthdays (month 1-12, repeats yearly).
const DATED = [
  { month: 12, day: 24, time: '5:00 PM', title: 'Christmas Eve dinner', kind: 'family' },
  { month: 12, day: 25, time: '10:00 AM', title: 'Christmas morning', kind: 'family' },
  { month: 12, day: 25, time: 'All day', title: 'Grandpa Joe’s birthday', kind: 'birthday' },
  { month: 1, day: 14, time: 'All day', title: 'Ava’s birthday', kind: 'birthday' },
  { month: 3, day: 8, time: 'All day', title: 'Mom’s birthday', kind: 'birthday' },
  { month: 6, day: 2, time: 'All day', title: 'Liam’s birthday', kind: 'birthday' },
];

// Thanksgiving moves each year (4th Thursday of November); family arrives the day before.
function thanksgiving(year) {
  const first = new Date(year, 10, 1).getDay();
  return 1 + ((4 - first + 7) % 7) + 21;
}
function movable(year) {
  const t = thanksgiving(year);
  return [
    { month: 11, day: t - 1, time: 'All day', title: 'Family arrives', kind: 'family' },
    { month: 11, day: t, time: '3:00 PM', title: 'Thanksgiving dinner', kind: 'family' },
  ];
}

// Where the big holidays happen this year (shown in the footer).
const WHERE = { Christmas: 'Grandma’s house', "New Year's Day": 'our house' };

const timeKey = (t) => {
  if (t === 'All day') return -1;
  const m = t.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!m) return 0;
  return ((+m[1] % 12) + (m[3].toUpperCase() === 'PM' ? 12 : 0)) * 60 + +m[2];
};

export function startOfWeek(date = new Date()) {
  const d = new Date(date); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // back to Monday
  return d;
}

// Seven days (Mon-Sun) with their events, for the week containing `date`.
export function getWeek(date = new Date()) {
  const start = startOfWeek(date);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const m = d.getMonth() + 1, day = d.getDate();
    const dated = [...DATED, ...movable(d.getFullYear())];
    const list = [
      ...holidays
        .filter((h) => h.month === m && h.day === day && !dated.some((x) => x.month === m && x.day === day && x.kind === 'family'))
        .map((h) => ({ time: 'All day', title: h.name, kind: 'family' })),
      ...dated.filter((e) => e.month === m && e.day === day),
      ...WEEKLY.filter((e) => e.dow === i),
    ].sort((a, b) => timeKey(a.time) - timeKey(b.time));
    return {
      date: d,
      dow: d.toLocaleDateString('en-US', { weekday: 'short' }),
      num: day,
      isToday: d.getTime() === today.getTime(),
      events: list,
    };
  });
}

// The next holiday from config.js, e.g. { name, where, label: 'Dec 25', days }.
export function nextBigThing() {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const next = holidays.map((h) => {
    let d = new Date(today.getFullYear(), h.month - 1, h.day);
    if (d < today) d = new Date(today.getFullYear() + 1, h.month - 1, h.day);
    return { ...h, date: d, days: Math.round((d - today) / 86400000) };
  }).sort((a, b) => a.days - b.days)[0];
  if (!next) return null;
  return {
    name: next.name,
    where: WHERE[next.name] || '',
    label: next.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    days: next.days,
  };
}
