# God's Eye View, tablet edition (for Tom's screen)

A custom build of [God's Eye View](https://github.com/bilawalsidhu/gods-eye-view)
(MIT, © 2026 Bilawal Sidhu) for the Lenovo Tab M10 FHD Plus TB-X606FA:
MediaTek Helio P22T, PowerVR GE8320, 2 GB of memory, 1920×1200 touch screen.

**Status (2026-11-19): built and tested on a PC by simulation only.** It has
not run on a real TB-X606FA yet, and nothing here is wired into the kitchen
screens or published on the site. See "Still to find out on the real screen".

Nothing is taken out of the app. Everything the edition adds can be switched
off: `?tablet=0` gives the stock app, and the **All controls** button brings
back every stock panel.

## What is here

| File | What it is |
| --- | --- |
| `tablet-edition.patch` | The whole edition as one patch against upstream commit `8b2ca602e54e08d51f0c9c6570a2e380239e201b` (v0.3.0, 2026-11-18). New files live in `src/tablet/`; eight upstream files get small hooks. |
| `bench/` | The scripts that make a headless browser behave like the tablet and drive or measure the app. |
| `results/` | What they measured, and a picture of each mission. |
| `LICENSE-gods-eye-view` | Upstream's MIT licence, which covers the patch too. |

## Build it

Needs Node 24.14 or newer (upstream's own requirement) and git.

```sh
git clone https://github.com/bilawalsidhu/gods-eye-view
cd gods-eye-view
git checkout 8b2ca602e54e08d51f0c9c6570a2e380239e201b
git apply --index ../tablet-edition.patch
PUPPETEER_SKIP_DOWNLOAD=1 npm ci --ignore-scripts
GEV_TABLET=1 npx vite build --outDir dist-tablet     # the tablet edition
npm run preview -- --outDir dist-tablet --port 4175   # serve it (pages + data relays)
node --test src/tablet/governor.test.mjs              # the speed tuner's 40 tests
```

`GEV_TABLET=1` turns the edition on in the build. Without it the build is the
stock app, and `?tablet=1` still turns the edition on for one page load.

## What the edition does

### Easier to find your way round

- **Missions menu.** The app opens on twelve plain choices: Planes in the sky,
  Ride in the cockpit, The space station, Rocket launches, Earthquakes today,
  Storms and rain, Military aircraft, Live street cameras, Radio around the
  world, Guided stories, Sit back and watch, Just explore. Picking one sets the
  app up through its own actions: the right data, the right camera, nothing
  left over from the last one (a film's retro look is put back, the radio is
  stopped, the cockpit or Stories is left).
- **Mission bar.** One line at the top says what is on screen and what a tap
  does.
- **Simple view** (on by default). The stock cockpit of rails, readouts and
  toolbars is tucked away. The app's own card about what you tapped or are
  following stays, below the bar and trimmed of its technical buttons: a
  plane's photo, route and "Enter Cockpit"; the radio player; a camera's
  picture; the count of what is in view.
- **What do the words mean?** The `?` button explains FL390, kts, STALE,
  SQUAWK and the rest in plain English.
- **All controls / Simple view** switches between the two at any time.
- The cockpit, Stories and the film have their own ways out; the bar follows
  them (leaving the cockpit lands on Planes, the others reopen the menu).
- Links that lead off the app are switched off, so a kiosk cannot be stranded
  on another site.

### Lighter on a small graphics chip

- **Speed tuner** (`src/tablet/governor.js`). While the picture moves it aims
  for 30 frames a second by trading sharpness: a six-step ladder from full
  resolution down to half, with map detail to match. Every step is a trial.
  A step down that does not make the picture faster is taken back (so a slow
  processor does not cost sharpness for nothing); where stepping down does
  not help it tries stepping up instead; a step up that costs frame rate is
  taken back and left alone for a while. It remembers the step that worked,
  and starts afresh when a mission changes the scene. The stock app has these
  controls and never touches them.
- **Sharp when still.** A picture that is not moving is redrawn at the stock
  app's full resolution and detail.
- No 4× multisampling, no order-independent blending buffers, no canvas
  antialiasing, the sharpening filter off to start with (it can be turned
  back on in All controls), no frosted-glass blur behind panels, a smaller
  map-tile cache.
- A start that fails on a slow connection retries by itself (up to 3 times).

### Links the launcher can use

| Link | Does |
| --- | --- |
| `?home=<lat>,<lon>` | Where the screen is, so "near you" is near you. Remembered. Without it the app's own start view (35°N 82.5°W) is used. |
| `?mission=<id>` | Start straight in a mission: `planes`, `cockpit`, `station`, `launches`, `quakes`, `weather`, `military`, `cameras`, `radio`, `stories`, `show`, `explore`. |
| `?tabletdiag=1` | A small readout of the speed tuner's step, frame rate and memory. |
| `?tablet=0` / `?tablet=1` | The edition off / on for this page load. |

## How it was tested, and what a PC can and cannot tell

`bench/drive.mjs` opens the app in headless Edge made to look like the tablet:
1280×800 CSS pixels at 1.5×, touch only (coarse pointer, no hover), eight
cores, 2 GB reported, an Android WebView user agent, and the processor slowed
with Chrome's CPU throttle.

- **Can tell:** that every mission sets up, switches and exits correctly;
  what a finger tap does; how the page lays out; how much processor time a
  frame takes; how much memory the page holds on a PC.
- **Cannot tell:** anything about the PowerVR GE8320. The PC's graphics card
  is hundreds of times faster, so no graphics limit shows up here at all.
- **Only roughly:** the processor. The throttle is accurate up to 4× and
  falls apart beyond that; the tablet's processor is something like 12 to 20
  times slower than the test PC (an i7-13700), so tablet figures are the 4×
  figures stretched 3 to 5 times, not measurements.
- **Beware live data.** The cost of the plane views follows how many
  aircraft the feed returns at that moment. The same stock view measured
  67 ms a frame one morning and 23 ms that afternoon. Compare builds only
  inside one session, or minutes apart.

## What was measured (2026-11-19)

All on the test PC with the processor slowed 4×, the tablet's screen size and
touch setup, and live data. The raw numbers are in `results/`.

### Live planes: stock app against tablet edition

Three runs within five minutes, each with about 950 to 1,150 aircraft loaded,
frames paced as the app paces them (the stock app runs free, the edition caps
itself at 30):

| | Stock app | Tablet edition |
| --- | --- | --- |
| Frames a second | 37 to 40 | 29 (holding its cap of 30) |
| Processor time per frame | 23 to 26 ms | 25 ms |
| Share of the processor in use | 84 to 86 % | 67 % |
| Picture while moving | 1280×800, 4× multisampled | 832×520 to 960×600, not multisampled |
| Map triangles per frame | 427,000 to 476,000 | 299,000 |
| Page memory on the PC | 958 to 990 MB | 946 MB |

**What that says.** The edition gives the graphics chip much less to do: a
third to a half of the pixels, no multisampling, about a third fewer
triangles. It does **not** make a frame cheaper for the processor. Holding
the best, starting and lowest quality steps in one session (`results/planes-4x-quality-steps.json`)
gave 26, 27 to 34 and 23 to 29 ms a frame: the same within the noise.

Where the processor's time goes in that view: about half in Cesium drawing
the scene, a quarter in the app's own per-frame work (moving the aircraft,
placing the labels and brackets), and most of the rest in the browser
re-laying out the page each frame.

### What that suggests for the tablet (an estimate, not a measurement)

Stretching the 4× figures 3 to 5 times for the tablet's processor:

| View | At 4× on the PC | Tablet, processor alone |
| --- | --- | --- |
| Whole globe, nothing on | 9 ms a frame | 22 to 30 fps (30 is the cap) |
| Earthquakes | 12 ms | 17 to 28 fps |
| Satellites | 25 ms | 8 to 13 fps |
| Live planes, about 1,000 aircraft | 23 to 26 ms | 8 to 14 fps |
| Live planes on a heavy feed (seen once, stock) | 188 ms | under 2 fps |

Those are ceilings: the graphics chip can only lower them. So the plane and
satellite views are likely to be choppy on this tablet whatever the build,
and the still and slow views should be fine.

### Things tried that made no measurable difference (taken back out)

- Pacing the side rails' layout passes to a few a second.
- Keeping the label overlay's diagnostics off the page (A/B in one session).

And one that changed the design: a quality step down on a slow processor buys
nothing, so the speed tuner now checks each step and takes back the ones that
did not help.

### What was checked

- All twelve missions set up correctly in order, three full runs, the last
  as a touch-only tablet; switching quickly; leaving the cockpit, Stories and
  the film by their own controls; finger taps on planes and radio stations;
  the film's look put back afterwards; All controls and back.
- The speed tuner: 40 unit tests.
- The app's own test suite with the patch applied: 15,097 of 15,129 pass and
  15 are skipped. The 17 that fail also fail on the untouched app on this
  Windows PC (the project's own test runner does not start on Windows at
  all; the suite was run with `node --import=./build/registerVue.js --test
  "src/**/*.test.mjs" "server/**/*.test.mjs"`).

## Still to find out on the real screen

A PC cannot stand in for these, so they are the first things to check when a
TB-X606FA arrives (USB debugging on, `adb reverse tcp:4175 tcp:4175`, open
`http://localhost:4175/?tabletdiag=1` in the tablet's Chrome):

1. **The graphics chip.** How many frames a second the PowerVR GE8320 draws,
   and which step the speed tuner settles on.
2. **Memory.** On the PC the page holds about 0.9 to 1.0 GB and its graphics
   about 0.2 to 0.4 GB after a tour of every mission. The tablet has 2 GB for
   everything. If Android closes the page, the fix is on the tablet-app side
   (reload it) plus fewer things on at once.
3. **The browser engine.** The app needs Android System WebView / Chrome 116
   or newer; the tablets ship with about 74 and must be updated first.
4. **Start-up time** over home Wi-Fi (the main script is 8.6 MB).
5. **How choppy the plane views are.** If they are too slow, the levers left
   change how the app looks (fewer labels at once, fewer kinds of contact),
   so they are the owner's call, not defaults.

## Putting it on Tom's screen (not done yet)

- The app needs its own small server (Node 24: the pages plus about 150 data
  relays). Two free places it can live: on the tablet itself (Termux), or a
  free cloud host. Not decided; decide after the real-screen test.
- In the kitchen-screen app, show it in its own full-screen WebView (not an
  iframe: the app refuses framing), which must block navigation to any other
  site and reload the page if Android closes it. Pass `?home=` from the
  screen's configured location.
