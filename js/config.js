// Per-tablet settings. Each tablet picks a profile once (stored on the device),
// or you can force one with ?profile=tom in the URL while testing.
const params = new URLSearchParams(location.search);
if (params.get('profile')) localStorage.setItem('profile', params.get('profile'));

export const profile = localStorage.getItem('profile') || 'family';

export const settings = {
  familyName: localStorage.getItem('familyName') || 'Family',
  accent: '#C2491F',
  units: 'fahrenheit',
};

// Countdown events for the "Coming up" card. month is 1-12; repeats yearly.
// Later this list comes from the shared backend so you can edit it remotely.
export const events = [
  { name: 'Christmas', month: 12, day: 25 },
  { name: "New Year's Day", month: 1, day: 1 },
  { name: 'Valentine’s Day', month: 2, day: 14 },
];
