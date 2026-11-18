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

// Holidays shown alongside the family's own dates. month is 1-12; repeats yearly.
export const events = [
  { name: "New Year's Day", month: 1, day: 1 },
  { name: 'Valentine’s Day', month: 2, day: 14 },
  { name: 'Halloween', month: 10, day: 31 },
  { name: 'Christmas Eve', month: 12, day: 24 },
  { name: 'Christmas', month: 12, day: 25 },
];
