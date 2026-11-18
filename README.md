# Home Tablets

A custom home-screen "OS" for six Lenovo Tab M10 FHD Plus (TB-X606F) tablets.
Plain HTML/CSS/JavaScript: no build step, no frameworks, free to host.

- **Family tablets (×5):** home dashboard, photos, cooking mode, calendar, weather, message board, night clock.
- **Tom's tablet:** flight deck, planes overhead, departures, trivia, sky alert, space missions, tonight's sky, space image, starfield.

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
- `js/services/*.js`: live data (weather, location, aircraft, space) and sample data.
- `sw.js`: offline cache (network first, so updates always win when online).

## Data sources (all free)

Open-Meteo (weather), BigDataCloud (town name), Launch Library 2 (launches),
NASA APOD + NASA Image Library, CelesTrak (space station orbit), adsb.lol / adsb.fi
(aircraft; need a small relay because they don't allow browser requests),
adsbdb (flight routes), NOAA SWPC (northern lights).

## Still to do

- Message board and calendar still use sample data (decide: per tablet, or shared?).
- Optional: Google Photos picker (would need a small cloud service).

## Done

- Android launcher app (`android/`, see `android/SETUP.md`): kiosk mode, self-updates
  from GitHub Releases, live aircraft via the app.
- Photos: phones on the same Wi-Fi scan a QR code and send photos straight to the
  tablet. **Private to each tablet** (they're individual gifts); nothing goes to the cloud.
