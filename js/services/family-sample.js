// Example photos for previewing the Gallery, Home and "Add photos" in a normal browser (on a
// PC), where there is no album. On the kitchen screen the real album is used instead
// (tablet-photos.js). The sample household is a couple, Alex and Jordan, with photos sent
// by them and by two friends, spread over a couple of months so the Gallery's weeks fill up.
//
// Each one: { id, day, title, caption, addedBy, art, added, video? }
//   art    a painted stand-in (a CSS background); the real album gives `src` instead
//   added  when it arrived (ms), counted back from now, so "This week" is never empty
//   day    "Today", "Yesterday", "Nov 14": what the real album gives
//   video  true on two of them: there is no clip to play, the Gallery only marks them
const DAY = 864e5;
const NOW = Date.now();

function dayWord(ms) {
  const d = new Date(ms);
  const midnight = new Date(NOW); midnight.setHours(0, 0, 0, 0);
  if (d >= midnight) return 'Today';
  if (d >= midnight - DAY) return 'Yesterday';
  const opts = { month: 'short', day: 'numeric' };
  if (d.getFullYear() !== midnight.getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString('en-US', opts);
}

// [id, days ago, title, caption, sent by, art, video]
const SAMPLES = [
  ['sample-pancakes', 0.08, 'Sunday pancakes', 'Jordan flipped one onto the stove', 'Alex',
    `radial-gradient(circle at 50% 58%, #F3C877 0 16%, #D99A3F 17% 22%, transparent 23%),
     radial-gradient(circle at 50% 50%, #FFF4DC 0 30%, transparent 31%),
     linear-gradient(160deg, #7FA8C9 0%, #A9C7DE 55%, #E9D7B8 100%)`],
  ['sample-gamenight', 1.1, 'Game night', 'Priya won. Again', 'Priya',
    `radial-gradient(circle at 30% 40%, #FFD27A 0 5%, rgba(255,200,110,.45) 12%, transparent 30%),
     radial-gradient(circle at 72% 62%, #E57A3A 0 7%, transparent 8%),
     linear-gradient(180deg, #2A1F3D 0%, #4B3C78 55%, #7A4B78 100%)`],
  ['sample-snow', 2.3, 'First snow on the balcony', 'We lasted four minutes out there', 'Jordan',
    `radial-gradient(ellipse at 30% 110%, #FFFFFF 0 30%, transparent 55%),
     radial-gradient(ellipse at 85% 105%, #F2F5F8 0 25%, transparent 50%),
     linear-gradient(180deg, #8FA5BC 0%, #B7C6D4 45%, #DCE4EB 75%, #EEF2F5 100%)`],
  ['sample-trail', 4.2, 'Trail run', 'The last hill, in real time', 'Marcus',
    `linear-gradient(180deg, #E9C27A 0%, #D9792E 30%, #8FA04A 31%, #55692D 100%)`, true],
  ['sample-apples', 8.4, 'Apple picking',
    // A long one, so the "Read all" caption can be seen on a PC too.
    'Two bushels and a lot of cider donuts. Alex climbed the tallest ladder in the orchard, Jordan carried everything back to the car, and the man at the stand told the story about the year the tractor got stuck, twice', 'Alex',
    `radial-gradient(circle at 20% 35%, #D8452E 0 3%, transparent 4%),
     radial-gradient(circle at 34% 52%, #C23A26 0 2.5%, transparent 3.5%),
     radial-gradient(circle at 62% 28%, #E0552F 0 3%, transparent 4%),
     radial-gradient(ellipse at 50% 40%, #6E8F3A 0 40%, transparent 70%),
     linear-gradient(180deg, #B9D3E6 0%, #8DB06A 45%, #4F6B2A 80%, #3B4F22 100%)`],
  ['sample-pizza', 9.2, 'Pizza night', 'Half mushroom, half whatever Alex did', 'Jordan',
    `radial-gradient(circle at 42% 44%, #C2452D 0 4%, transparent 5%),
     radial-gradient(circle at 60% 58%, #C2452D 0 4%, transparent 5%),
     radial-gradient(circle at 50% 50%, #F2C76B 0 30%, #C98A45 31% 36%, transparent 37%),
     linear-gradient(160deg, #5B3420 0%, #8C5B36 100%)`],
  ['sample-friendsgiving', 11.5, 'Dinner at Priya’s', 'Eight of us around a table for four', 'Priya',
    `radial-gradient(circle at 50% 46%, #FFE7B0 0 4%, rgba(255,196,110,.5) 10%, transparent 30%),
     radial-gradient(circle at 38% 52%, rgba(255,200,120,.45) 0 6%, transparent 18%),
     radial-gradient(circle at 62% 52%, rgba(255,200,120,.45) 0 6%, transparent 18%),
     linear-gradient(180deg, #2A1A16 0%, #4A2C22 50%, #6B3D2A 80%, #3A221A 100%)`],
  ['sample-lake', 16.3, 'The lake at sunset', 'Last swim before dinner', 'Alex',
    `radial-gradient(circle at 72% 30%, #FFE3A3 0 6%, rgba(255,214,140,.55) 12%, transparent 34%),
     linear-gradient(180deg, #F6B26B 0%, #E98B5D 30%, #A85C6B 48%, #3E5A7A 52%, #2B4560 70%, #1C2E40 100%)`],
  ['sample-concert', 19.1, 'The encore', 'Jordan knew every word', 'Jordan',
    `radial-gradient(circle at 30% 20%, rgba(255,120,180,.7) 0 8%, transparent 30%),
     radial-gradient(circle at 70% 24%, rgba(120,180,255,.7) 0 8%, transparent 30%),
     linear-gradient(180deg, #1B2547 0%, #3A2A66 60%, #0E1020 100%)`, true],
  ['sample-overlook', 24.6, 'Hike to the overlook', 'Worth every one of the switchbacks', 'Marcus',
    `linear-gradient(180deg, #4F7FB8 0%, #9CC4EE 50%, #6A9A4E 51%, #3E6B33 100%)`],
  ['sample-couch', 33.2, 'New couch day', 'It fit through the door with a finger to spare', 'Alex',
    `radial-gradient(ellipse at 50% 70%, #5E8C8A 0 34%, transparent 35%),
     linear-gradient(180deg, #F2D7B0 0%, #E8C79A 62%, #C98A45 63%, #8C5B36 100%)`],
  ['sample-roadtrip', 41.4, 'Road trip', 'Six hours, one playlist, no regrets', 'Jordan',
    `radial-gradient(circle at 80% 22%, #FFF1C9 0 5%, transparent 6%),
     linear-gradient(180deg, #7FC3E8 0%, #BFE4F2 55%, #E9D7A8 56%, #D8BF86 100%)`],
  ['sample-beach', 58.7, 'Beach day', 'Marcus brought the kite, the wind did not show up', 'Priya',
    `linear-gradient(180deg, #1B2547 0%, #5A4F82 35%, #D07A6A 58%, #F4B26A 72%, #6B4E68 74%, #141626 100%)`],
];

/** Newest first, like the real album. */
export const photos = SAMPLES.map(([id, daysAgo, title, caption, addedBy, art, video]) => {
  const added = Math.round(NOW - daysAgo * DAY);
  return { id, day: dayWord(added), title, caption, addedBy, art, added, video: !!video };
});
