# Improvements log

A goal set on 2026-11-21: 500 new improvements or features. Every one that has been
built, checked and published gets a numbered line here, so the last number is the running
count. Only things somebody using a screen (or looking after them) would notice or benefit
from are counted.

## 1 · Settings, the clock and alarms

1. Settings is arranged in seven sections down the side (Your family, Screen & sound, Clock & night, Photo frame, Weather, Timers, Wi-Fi & about) instead of one crowded page.
2. Settings opens again on the section you were last in, for example after looking at the night clock.
3. A 24-hour clock can be chosen; the big clocks on Home, the Menu, the night clock and the photo frame all follow it.
4. With the 24-hour clock chosen, every other time follows too: the hourly forecast, calendar entries, notes, a timer's "ready at", sunrise and sunset.
5. How bright the night clock stays can be chosen: Darkest, Dim or Soft.
6. A "See the night clock" button in Settings shows that choice straight away.
7. What the screen goes back to when nobody is using it can be chosen: Home or the photo frame.
8. How long it waits before going back can be chosen: 5, 10 or 30 minutes, or never.
9. Photo frame: how long each picture stays can be chosen, from 15 seconds to 15 minutes (the slow zoom keeps pace with it).
10. Photo frame: the slow zoom can be switched off for pictures that hold perfectly still.
11. Photo frame: who sent a picture and when can be hidden, for a frame that is only pictures.
12. Photo frame: a "Mixed up" order (the newest picture still comes first).
13. Three alarm sounds to pick from (Beeps, Chime, Bell); tapping one plays it.
14. How long an alarm nobody stops keeps ringing can be chosen: 1, 2, 5 or 10 minutes.
15. Cooking mode's step timers ring with the same alarm as the kitchen timers (they had their own, quieter beep).
16. When a timer goes off, the chip on every screen says which one ("Time's up! Pasta · Tap to stop").
17. The town for the weather can be set by hand, by name or ZIP code, for when the screen's own guess is a town or two off.
18. One tap goes back to letting the screen find the town by itself.
19. When the lookup of where the screen is fails (Wi-Fi down, service down), the last known place is used instead of no weather at all.
20. Settings shows which version the screen is running, with "Check now" for updates and "Update now" when one is ready.
21. A "Start again" button in Settings restarts the screens if something looks stuck, without losing photos, lists or timers.
22. For whoever looks after the code: `bash tools/check.sh` runs the deploy's translation for the old browser engine, follows every import, and searches for things that engine doesn't have, in a few seconds.

## 2 · Looking after itself

23. A quiet notice appears in the corner when the charger has come out ("Not plugged in · 42% left"), long before the battery runs flat.
24. When the battery is low the notice turns urgent ("Plug me in · 15% left") and shows on every screen, the night clock and photo frame included.
25. A notice when the Wi-Fi or the internet has been gone for a few minutes ("No Wi-Fi · showing what was saved"); tapping it opens the Wi-Fi part of Settings.
26. "Wipe the screen" (Settings → Screen & sound): touches are switched off for 30 seconds so the glass can be cleaned without pressing anything.
27. The screens start themselves afresh once a night, in the small hours when nobody is about, and come back on the same screen at the same dimness, so weeks of running don't add up.
28. After a restart in the night, the photo frame still comes back in the morning if that is what the night interrupted.
29. The screen keeps a short diary of things that went wrong (what, which screen, when) for whoever looks after it, shown in Settings → Wi-Fi & about. Nothing is sent anywhere.
30. Settings → Wi-Fi & about says how the screen is doing: running since when, how much it keeps, plugged in or on its battery.
31. "Put them back" returns brightness, the clock, the night hours and the town to how they came, after asking twice; photos, lists and notes are not touched.
32. Tom's flight deck has a Settings screen of its own, in the deck's dark colours (it had none): brightness, sound, 12 or 24-hour clock, when the starfield takes over and how dim it is, Wi-Fi, updates, the tour.
33. On the flight deck the town can be set by hand, so tonight's sky, the planes overhead and the weather are for the right place.
34. Publishing stops by itself when a check fails, so a mistake that the checks can catch never reaches a kitchen.
35. For whoever looks after the code: `node tools/sim/try.mjs <screen> [steps.js]` opens one screen in a pretend tablet, taps what you tell it to, and gives back what the screen says, any errors, and a picture.

## 3 · Kitchen timers

36. A timer can be named with one tap (Pasta, Rice, Eggs, Oven, Potatoes) or a typed name; the name shows on its card, on the chip and when it rings.
37. Names you type yourself are remembered and offered first next time.
38. Cancelling or clearing a timer by mistake can be undone for ten seconds, and the timer comes back exactly as it was.
39. When all eight timers are in use the Timers screen says so, and why, instead of behaving as if a new one had started.
40. Starting a timer from another screen when all eight are in use no longer fails silently: the chip says so on whatever screen is up.
41. Longer presets for roasts and slow cooking: 1½ hours and 2 hours.
42. "Other time" has −1 hr and +1 hr steps and goes up to 12 hours, so a long time is a few taps.
43. The last "Other time" used is remembered instead of always starting from 25 minutes.
44. Recently used other times appear as one-tap buttons.
45. Each ringing timer has its own Stop; before, Stop silenced every ringing timer at once.
46. A finished timer says how long ago it rang, and one that rang out with nobody there shows quietly as "Rang at 6:07 PM" instead of flashing for ever.
47. A timer that was stopped stays for three minutes with "+1 min" and "Again", instead of sometimes vanishing the moment it was stopped.
48. A long timer says the day when it will ring tomorrow ("Rings tomorrow at 5:04 AM").
49. "Pause all", "Resume all" and "Clear finished" above the list, with a count of how many of the eight are in use.
50. Starting a timer shows a short confirmation with the time it will ring.
51. A double tap with wet fingers no longer starts two identical timers.
52. The countdown chip is bigger: readable from across the room.
53. The chip moves to another corner rather than cover a button on the screen underneath.
54. With several timers the chip names the next one and counts the rest ("4:10 Pasta · 2 more"), and when two ring at once it names both.
55. A timer that rang out unattended no longer shows as "0:00 (paused)" on the chip; it says when it finished.
56. Finished timers nobody cleared no longer use up the eight places, and clear themselves after twelve hours.
57. If the clock is corrected after a timer starts, the timer can no longer suddenly show hours left.
58. With four or more timers the cards get more compact so more fit, and a ringing card flashes once a second instead of animating all the time (lighter work for the screen).
59. A typed name with unusual characters can't break the card or the chip, and timers keep working when the screen's storage is unavailable.
