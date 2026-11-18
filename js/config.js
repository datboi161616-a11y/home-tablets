// Per-tablet settings. Each tablet picks a profile once (stored on the device),
// or you can force one with ?profile=tom in the URL while testing.
import { getFamily, familyName } from './services/family.js';

const params = new URLSearchParams(location.search);
if (params.get('profile')) localStorage.setItem('profile', params.get('profile'));

export const profile = localStorage.getItem('profile') || 'family';

// Family name and units come from "Tablet settings" on the phone page.
export const settings = {
  get familyName() { return familyName(); },
  accent: '#C2491F',
  get units() { return getFamily().units === 'celsius' ? 'celsius' : 'fahrenheit'; },
};

// Holidays shown alongside the family's own dates (US). Repeat yearly.
//   { month, day }            fixed date (month is 1-12)
//   { month, weekday, nth }   e.g. 4th Thursday of November (weekday 0 = Sunday, nth -1 = last)
//   { easter: 0 }             days from Easter Sunday
export const events = [
  { name: "New Year's Day", month: 1, day: 1 },
  { name: 'Martin Luther King Jr. Day', month: 1, weekday: 1, nth: 3 },
  { name: 'Valentine’s Day', month: 2, day: 14 },
  { name: 'Presidents’ Day', month: 2, weekday: 1, nth: 3 },
  { name: 'St. Patrick’s Day', month: 3, day: 17 },
  { name: 'Easter', easter: 0 },
  { name: 'Mother’s Day', month: 5, weekday: 0, nth: 2 },
  { name: 'Memorial Day', month: 5, weekday: 1, nth: -1 },
  { name: 'Father’s Day', month: 6, weekday: 0, nth: 3 },
  { name: 'Independence Day', month: 7, day: 4 },
  { name: 'Labor Day', month: 9, weekday: 1, nth: 1 },
  { name: 'Halloween', month: 10, day: 31 },
  { name: 'Veterans Day', month: 11, day: 11 },
  { name: 'Thanksgiving', month: 11, weekday: 4, nth: 4 },
  { name: 'Christmas Eve', month: 12, day: 24 },
  { name: 'Christmas', month: 12, day: 25 },
  { name: 'New Year’s Eve', month: 12, day: 31 },
];
