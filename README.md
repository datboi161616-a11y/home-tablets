# Home Tablets

A custom home-screen "OS" for six Lenovo Tab M10 FHD Plus (TB-X606FA) tablets, each
one a kitchen smart display for one household. Plain HTML/CSS/JavaScript: no build
step, no frameworks, free to host.

- **Family tablets (×5):** home dashboard, photo frame, recipes (about 1,000) with a
  cooking mode, week plan and grocery list, kitchen timers, calendar, weather, message
  board, camera, the household's own apps, night clock, and a first-start showcase tour.
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
2. Commit and push to `main`.
3. GitHub Actions publishes the site (about a minute) and stamps `version.json`.
4. Each tablet checks `version.json` every 30 minutes and reloads itself when it changes.

## Running it locally

```
python -m http.server 5173
```

Then open http://localhost:5173 (Family) or http://localhost:5173/?profile=tom (Tom).

## Tablet profile

Each tablet remembers its profile. Open the site once with `?profile=tom` or
`?profile=family`; it is stored on the device after that.

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
- `setup/`: the double-click USB setup for a new tablet.
- `data/recipes/`, `tools/`: the recipe collection and the scripts that check it.
- `tools/sim/`: scripts that open the site in a pretend tablet (headless Edge, tablet
  screen size and touch, slowed processor) to walk every screen, time them, and test
  working without Wi-Fi: `node tools/sim/offline-test.mjs . my-run`. `serve.py` serves the site for
  trying changes out (also to a real tablet over USB); `device-pass.sh` times taps on
  a real tablet plugged in over USB.
- `godseye-tablet/`: a custom build of God's Eye View for Tom's tablet. Not wired in
  yet; see its README.

## Data sources (all free)

Open-Meteo (weather), BigDataCloud (town name), Launch Library 2 (launches),
NASA APOD + NASA Image Library, CelesTrak (space station orbit), adsb.lol / adsb.fi
(aircraft; need a small relay because they don't allow browser requests),
adsbdb (flight routes), NOAA SWPC (northern lights).

## Still to do

- **Try it on a real tablet.** Everything so far has run on emulators and on a PC made
  to behave like the tablet; none of it has run on a TB-X606FA yet.
- God's Eye View on Tom's tablet (`godseye-tablet/`): needs that real-tablet test, then
  a place for its small server and a button on the flight deck.
- Optional: Google Photos picker (would need a small cloud service).

## Done

- Android launcher app (`android/`, see `android/SETUP.md`): kiosk mode, self-updates
  from GitHub Releases, live aircraft via the app, and it restarts the screens by itself
  if Android closes the page to free memory.
- Photos: phones on the same Wi-Fi scan a QR code and send photos straight to the
  tablet. **Private to each tablet** (they're individual gifts); nothing goes to the cloud.
- The same phone page sets the family name, people, birthdays and calendar links
  (Google Calendar / iCloud), leaves notes on the message board, edits the grocery list
  and adds the family's own recipes. Events can also be added on the tablet itself.
- Works without Wi-Fi from the last copy it saw: every screen (they are all fetched
  shortly after each start, not only the ones somebody opened), the fonts, every recipe,
  today's weather, the calendar. If a screen still can't open it says so, and opens by
  itself when the Wi-Fi is back.
