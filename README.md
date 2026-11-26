# Home Tablets

A custom home-screen "OS" for six Lenovo Tab M10 FHD Plus (TB-X606FA) tablets, each
one a kitchen smart display for one household. Plain HTML/CSS/JavaScript: no build
step, no frameworks, free to host.

- **Kitchen screens (×5; four go to couples, one to a family of five):** Home (a
  full-screen photo frame with the time; its buttons slip away when it is left alone),
  the Gallery, camera, recipes (about 1,000) with a cooking mode, week plan and grocery
  list, kitchen timers, calendar, weather, message board, the household's own apps,
  night clock, and a first start that asks for the household's name and then gives a
  showcase tour. Nothing in the wording assumes a family, and there are no child
  controls: the PIN and the 5-second corner hold are how the owner leaves kiosk mode.
- **Tom's tablet:** flight deck, planes overhead, departures, trivia, sky alert, space
  missions, tonight's sky, space image, starfield, and its own showcase tour.

Each tablet stands alone: its photos, notes, lists and settings stay on that tablet.

## Setting up a tablet

Plug it in and double-click **`setup/Setup tablet.bat`**. Full steps (about 10 minutes
per tablet): [android/SETUP.md](android/SETUP.md).

## Remote admin (parked)

The remote-admin dashboard (`admin/`: Cloudflare hub, dashboard, end-to-end test) is
built but **parked** while the focus is the tablet OS. It's switched off on the tablets
(they only connect when `remote.json` has a hub address, and it's empty) and its test
no longer runs in CI. To bring it back: deploy `admin/`, put the hub address in
`remote.json`, and re-add the hub + `admin/test/e2e.mjs` steps to
`.github/workflows/android.yml` (see the git history before this note).

## Pushing an update to every tablet

1. Edit the files.
2. Run `bash tools/check.sh` (a few seconds: the translation for the old browser engine,
   every import, a lint for mistakes, the tests with known answers).
3. For anything big, look at it on a real tablet first: `node tools/sim/device-visit.mjs both`.
4. Commit and push to `main`.
5. GitHub Actions runs the same checks, builds the site, and then **opens every screen
   of the built site in a real browser** (as a kitchen screen and as Tom's deck, with no
   internet behind it; `tools/sim/smoke.mjs`), once in today's Chrome and once in
   Chromium 81, the tablets' own engine. If a screen can't open, throws an error nobody
   catches, or shows "undefined", nothing is published and the tablets keep what they have.
6. The site is published (about two minutes in all) and `version.json` is stamped.
7. Each tablet checks `version.json` every 30 minutes and reloads itself when it has
   been left alone for a few minutes.

**Taking a change back.** If something bad did get out: `git revert <the commit>` and
push. That is a normal publish of the previous code, and the tablets pick it up the same
way (within about 40 minutes; at once if somebody taps Settings → Wi-Fi & about → Check now).
App updates (`android/`) can't be taken back that way: publish a new, fixed app instead.

`IMPROVEMENTS.md` is the numbered list of what has been added since November 2026.

## Running it locally

```
python tools/sim/serve.py
```

(Not `python -m http.server`: with that, a reload right after an edit can quietly reuse
the old files.)

Then open http://localhost:5173 (a kitchen screen) or http://localhost:5173/?profile=tom (Tom).

## Tablet profile

Each tablet remembers its profile. Open the site once with `?profile=tom` or
`?profile=family` (the kitchen screens; the profile's name is older than the wording);
it is stored on the device after that.

## Layout

- `index.html`, `css/base.css`: the shell. Screens are designed at 1280×800 and scaled (1.5× on the tablet's 1920×1200 screen).
- `js/app.js`: router, screen list, offline support, update checks.
- `js/screens/*.js`: one file per screen (`mount` / `unmount`).
- `js/services/*.js`: live data (weather, location, aircraft, space), what the tablet
  keeps (timers, lists, events), and the example data shown when previewing on a PC.
- `js/art.js`: the illustrations (inline SVG, no image files).
- `sw.js`: offline cache (network first, so updates always win when online).
- `android/`: the launcher app (kiosk mode, photo and settings pages for phones on the
  home Wi-Fi, self-update). Built and tested on emulators by GitHub Actions.
- `setup/`: the double-click USB setup for a new tablet, and `Check tablet.bat`, which
  looks a plugged-in tablet over without changing it.
- `guide/`: a one-page guide for each kind of screen (`kitchen-screen.html`,
  `flight-deck.html`). Open one in a browser, print it (one sheet), write the PIN in the
  blank, and slip it in with the gift.
- `data/recipes/`, `tools/`: the recipe collection and the scripts that check it.
- `tools/sim/`: scripts that open the site in a pretend tablet (headless Edge, tablet
  screen size and touch, slowed processor) to walk every screen, time them, and test
  working without Wi-Fi: `node tools/sim/offline-test.mjs . my-run`. `serve.py` serves the site for
  trying changes out (also to a real tablet over USB); `device-pass.sh` times taps on
  a real tablet plugged in over USB. `node tools/sim/try.mjs <screen> [steps.js]` opens
  one screen, taps what you tell it to, and gives back what the screen says, any
  errors and a picture (`--tom` for the flight deck, `--phone=<page>` for the phone page).
  Speed without a tablet: `node tools/sim/pc-trace.mjs [--stub=seed.js] [screens]` times
  every screen's script, layout and drawing (`THROTTLE=6` for the tablet's processor,
  `GAPSHIM=1` for its old engine's spacing fix, `PROFILE=1` / `LAYOUTS=1` for what caused
  them); `site-drive.mjs <site> paint-audit.mjs` lists what is costly to paint on each screen.
- `tools/check.sh`: the checks to run before publishing.
- `tools/sim/smoke.mjs`: opens every screen in a real browser with no internet behind it
  (the deploy runs it on the built site, in Chrome and in Chromium 81).
  `tools/sim/escape-test.mjs`: feeds hostile text (`<img onerror…>`) through every way
  outside text can reach a screen, and fails if any of it becomes markup.
- `godseye-tablet/`: a custom build of God's Eye View for Tom's tablet. Not wired in
  yet; see its README.

## Data sources (all free)

Open-Meteo (weather), BigDataCloud (town name), Launch Library 2 (launches),
NASA APOD + NASA Image Library, CelesTrak (space station orbit), adsb.lol / adsb.fi
(aircraft; need a small relay because they don't allow browser requests),
adsbdb (flight routes), NOAA SWPC (northern lights).

## Still to do

- Set up the other five tablets (`setup\Setup tablet.bat`); one kitchen screen has been
  running the real thing since November 2026.
- By hand, on a real tablet: the alarm sounds, video sound in the Gallery, the night
  clock at "Darkest", and the phone page on a real iPhone.
- God's Eye View on Tom's tablet (`godseye-tablet/`): needs that real-tablet test, then
  a place for its small server and a button on the flight deck.
- Optional: Google Photos picker (would need a small cloud service).

## Done

- Android launcher app (`android/`, see `android/SETUP.md`): kiosk mode, self-updates
  from GitHub Releases, live aircraft via the app, and it restarts the screens by itself
  if Android closes the page to free memory.
- Photos: phones on the same Wi-Fi scan a QR code and send photos straight to the
  tablet. **Private to each tablet** (they're individual gifts); nothing goes to the cloud.
- The same phone page sets the household's name, people, birthdays and calendar links
  (Google Calendar / iCloud), leaves notes on the message board, edits the grocery list
  and adds the household's own recipes. The name and the people can also be typed on
  the screen itself (the first-start welcome, or Settings). Events can also be added on the tablet itself.
- Works without Wi-Fi from the last copy it saw: every screen (they are all fetched
  shortly after each start, not only the ones somebody opened), the fonts, every recipe,
  today's weather, the calendar. If a screen still can't open it says so, and opens by
  itself when the Wi-Fi is back.
