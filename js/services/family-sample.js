// Example photos for previewing the Photos screen in a normal browser (on a PC),
// where there's no tablet album. On the tablet, photos.js shows the photos that
// were added to this tablet from a phone. `art` is a gradient stand-in; photos.js
// renders `src` as a background image when present.
export const photos = [
  {
    title: 'Lake trip, summer 2025',
    caption: 'Last swim before dinner',
    addedBy: 'Mom',
    art: `radial-gradient(circle at 72% 30%, #FFE3A3 0 6%, rgba(255,214,140,.55) 12%, transparent 34%),
          linear-gradient(180deg, #F6B26B 0%, #E98B5D 30%, #A85C6B 48%, #3E5A7A 52%, #2B4560 70%, #1C2E40 100%)`,
  },
  {
    title: 'First snow',
    caption: 'Snowman number one of the year',
    addedBy: 'Grandpa',
    art: `radial-gradient(ellipse at 30% 110%, #FFFFFF 0 30%, transparent 55%),
          radial-gradient(ellipse at 85% 105%, #F2F5F8 0 25%, transparent 50%),
          linear-gradient(180deg, #8FA5BC 0%, #B7C6D4 45%, #DCE4EB 75%, #EEF2F5 100%)`,
  },
  {
    title: 'Apple picking',
    caption: 'Two bushels and a lot of cider donuts',
    addedBy: 'Sam',
    art: `radial-gradient(circle at 20% 35%, #D8452E 0 3%, transparent 4%),
          radial-gradient(circle at 34% 52%, #C23A26 0 2.5%, transparent 3.5%),
          radial-gradient(circle at 62% 28%, #E0552F 0 3%, transparent 4%),
          radial-gradient(ellipse at 50% 40%, #6E8F3A 0 40%, transparent 70%),
          linear-gradient(180deg, #B9D3E6 0%, #8DB06A 45%, #4F6B2A 80%, #3B4F22 100%)`,
  },
  {
    title: 'Birthday at Nana’s',
    caption: 'Eight candles, one breath',
    addedBy: 'Dad',
    art: `radial-gradient(circle at 50% 46%, #FFE7B0 0 4%, rgba(255,196,110,.5) 10%, transparent 30%),
          radial-gradient(circle at 38% 52%, rgba(255,200,120,.45) 0 6%, transparent 18%),
          radial-gradient(circle at 62% 52%, rgba(255,200,120,.45) 0 6%, transparent 18%),
          linear-gradient(180deg, #2A1A16 0%, #4A2C22 50%, #6B3D2A 80%, #3A221A 100%)`,
  },
];
