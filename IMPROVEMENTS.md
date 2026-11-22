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

## 4 · Week plan and shopping list

60. A meal can be moved to another day without dragging: tap it, "Move to another day", tap the day (this week or next).
61. A whole day's meals can be moved, or two days swapped, the same way.
62. A meal slot can be marked "Leftovers", "Eating out" or "Nothing planned", and shows that instead of an empty plate.
63. The plan covers next week as well as this week.
64. "+ Add" opens a quick picker on the plan itself: favourites, meals planned lately, six ideas for that meal, and a search.
65. "Same meals again next week" copies this week into next week's empty slots.
66. A whole week can be cleared, after a second tap.
67. Every change on the plan (remove, move, swap, clear, copy, add) can be undone for eight seconds.
68. Each planned meal can say how many people it is for, and the shopping list buys enough for that number.
69. Tapping a meal opens a panel of big buttons: see the recipe, start cooking, how many people, move, take it off.
70. The week plan's text is bigger (day names, meal names, labels) and its buttons are at least 48 px, so it reads from across the kitchen.
71. Today's meals whose time has passed fade back, so what is still to come stands out.
72. The × that takes a meal off was cut off on the narrow day columns; it is whole now, and day names are never shortened.
73. Shopping list: removing one of your own items, or clearing the ticked things, can be undone for eight seconds.
74. A row of one-tap buttons adds everyday things (milk, bread, eggs…), leaving out what is already on the list.
75. Things you add yourself are remembered and offered first next time.
76. Your own items can have a quantity ("2 x milk", then + and − on the row).
77. Adding something that is already on the list raises its amount instead of making a second line.
78. Your own items are sorted into the right part of the shop (milk under Dairy, bread under Bakery) alongside the recipe ingredients.
79. When the week plan has added ingredients since the list was last opened, the list says which and marks them "New".
80. Next week's planned meals can be added to the list too (from the list or from the plan), and it says exactly what came on; nothing is doubled.
81. Shopping rows are bigger for one-handed use: larger tick boxes, taller rows, bigger names and buttons.
82. The top of the list shows a large "15 to get", with how many are already got.
83. An empty list says what to do and has buttons to the week plan and the recipes.
84. When the screen's storage is full, the plan and the list keep working, and adding an item no longer claims it was added when it couldn't be saved.
85. Old or damaged saved plans and lists are tidied when read instead of breaking the screens.
86. The list on a phone shows quantities ("2 × Milk"), and "3 x bananas" typed on the phone arrives as a quantity.

## 5 · Notes

87. Eight ready-made notes ("Back soon", "Dinner's in the oven", "Dog has been fed"…) write a note with one tap.
88. A note can be marked as for one person, and a reply is marked for the person being answered.
89. "New note" no longer opens the keyboard straight away; the typing box sits at the top with Post right under it, so both stay above the keyboard.
90. A half-written note is kept if the screen goes to the night clock or Home, or restarts, and comes back next time.
91. Cancel no longer throws away a written note with one tap; it asks for a second.
92. Notes written on the screen can be as long as those sent from a phone (500 letters; it was 400).
93. Line breaks in a note are kept, so a list sent from a phone shows one item per line.
94. A long note shrinks to fit the big card, and when even that isn't enough, "Read all" opens the whole note.
95. A photo note whose words were cut off gets the same "Read all" view, with the picture and every word.
96. A note that is only emoji is shown big, like a sticker.
97. Times on notes are clearer ("Yesterday · 6:10 PM", a real date instead of "Last week", the year on old notes).
98. Reading one note no longer marks every note as read, so Home's count of new notes stays right.
99. A note that arrives while nobody is at the screen stays "New" until somebody touches the screen.
100. A note can be pinned to the top of the list; pinned notes are never tucked away or tidied.
101. Chores can be ticked off with "Mark done".
102. Remove is one tap followed by "Undo" for eight seconds, instead of tapping twice.
103. Read notes more than two weeks old are tucked under "Show older notes" instead of crowding the list; they are never deleted by themselves.
104. "Tidy up" takes down every read note at once, after a clear confirmation.
105. The list no longer jumps back to the top when a note further down is tapped or when it refreshes.
106. If a note can't be saved, the words stay in the box with a plain message, instead of the screen stopping.
107. When no family names are set up, the note box explains where they are added.
108. "Remove" is no longer shown where it could not work.
109. The notes screen's buttons are bigger (56 px; the header ones were 44 px).

## 6 · Calendar

110. Linked calendars in another time zone show at the right local time (they were read as local time).
111. Outlook and Thunderbird calendars that name their time zones in their own way show the right time.
112. A trip that starts in one time zone and ends in another gets its real length.
113. Repeating events from another time zone keep the right time through daylight saving, and their end dates, skipped dates and cancelled single dates match (a cancelled lesson could still show).
114. Outlook all-day events written as midnight to midnight show as "All day".
115. Extra dates of a repeating event written as periods are no longer dropped.
116. Invitations the calendar's owner declined are hidden.
117. The same event written twice in one calendar shows once.
118. A linked calendar left with the plain name "Calendar" shows its own name (never an email address).
119. Linked-calendar events reach a year ahead, like the arrows do (it was about 60 days).
120. When a calendar link fails, the last good copy keeps the calendar going instead of freezing it.
121. Calendar problems are said in plain words ("The link for Dad's work has stopped working. Make a new one on the phone page").
122. Each linked calendar has its own colour and name in the key, and a day's details say which calendar an entry came from.
123. Birthdays on February 29 show on February 28 in other years (they never appeared).
124. A holiday calendar's "Christmas Day" no longer appears twice next to the screen's own holiday.
125. An event shared on two linked calendars shows once, and the Menu's "things this week" no longer counts doubles.
126. Within a day, holidays and birthdays come first, then things carrying over from the day before, then timed entries.
127. A Month view next to the Week view: a grid with coloured dots and titles, today marked, tap any day for its details.
128. The calendar can be looked back four weeks, to check when something happened.
129. The week arrows could skip a week around the spring clock change; they can't now.
130. Titles show the year when it isn't this year, and the first day of a month is labelled in the week.
131. A quiet week says what is next, with a "Show me" button that jumps there.
132. A day's details say how far away it is ("Tomorrow", "In 15 days").
133. Things lasting several days are marked "day 2 of 3".
134. Today's entries that are already over are faded.
135. The "saved at" time at the bottom follows the 12/24-hour choice.
136. With linked calendars, the bottom line says when they were last updated, with "Check now".
137. Adding an entry needs almost no typing: one-tap titles (recent ones, plus Doctor, Dentist, Haircut, Visitors…).
138. One-tap times in the add form (9 AM, 12 PM, 3 PM, 6 PM…).
139. The keyboard no longer pops up by itself when the add form opens and covers the choices.
140. Own entries can repeat every two weeks or every month (a 31st falls on the last day of shorter months).
141. Removing a repeating entry asks "just this one, this and later, or every one" (it always removed every one).
142. Every removal can be undone for ten seconds.
143. When the screen's limit of 300 own entries is reached, long-finished ones go first, and it says so if it is still full (it used to drop the oldest-added one silently).
144. Changing a repeating entry keeps the single dates already removed from it.
145. The calendar's arrows, Today, + Add and Close are bigger (52-56 px).
146. For whoever looks after the code: `node tools/sim/ics-test.mjs` checks the calendar-file reader against 38 cases.

## 7 · Setting up and staying up

147. On a sick connection (Wi-Fi up, internet half dead) a screen opens from its saved copy after four seconds instead of waiting a minute or more.
148. The setup finds `adb` by itself in the usual places, and says where to get it when it is missing (that message could never appear before: the check found the script's own function).
149. The setup looks each tablet over before touching it: Android and browser-engine versions, battery, Wi-Fi, the clock against internet time, free space, with a plain warning for anything off.
150. "Check tablet.bat" does only that looking-over on a plugged-in tablet and changes nothing.
151. Running the setup again on a tablet that is already set up can leave its screens and PIN alone (pressing Enter used to reset the PIN to the default without saying so).
152. The setup makes sure the home screen is really up and locked before it says "Done".
153. The setup uses last time's download when the PC is offline, and refuses a broken download.
154. Each tablet set up gets a line in setup-log.txt (date, serial number, which screens, app version; never the PIN).

## 8 · Recipes and cooking

155. Searching "berry" finds "berries" and "sandwiches" finds "sandwich" (it only worked one way round).
156. Search understands other words for the same thing: veggie, crockpot, prawn, courgette, aubergine, coriander, BBQ; "pasta" also finds spaghetti, penne and lasagna.
157. Short words no longer match the middle of other words ("ham" doesn't find "graham"), and a dish with the whole word in its name comes first.
158. When no recipe has every word typed, Recipes says so and shows the closest ones instead of an empty screen.
159. Search looks through what recipes use as well as their names, so "zucchini" or "chicken rice" finds dishes that don't mention it in the name.
160. Tapping the search box offers your last searches and some ideas as big buttons, so there is less to type.
161. Enter on the keyboard puts the keyboard away so the results can be seen.
162. "Nothing found" offers words to tap and "Clear the search", not just advice.
163. Recipe lists have filter buttons taken from the recipe data (30 min or less, Vegetarian, Slow cooker, One pot, Kids like it…), and the choice is still there on coming back from a dish.
164. "Pick one for me" opens a random dish from the list on screen.
165. A "Cooked lately" list, one tap from Favorites, shows what the family finished cooking, newest first.
166. Recipe cards say "Cooked yesterday", or "Cooking · step 3" for a dish in progress.
167. While something is being cooked, the Recipes page shows a bar with "Carry on cooking".
168. Deleting one of your own recipes can be undone.
169. Empty Favorites and Cooked lately pages explain how to fill them and have a "Browse recipes" button.
170. Changing servings rounds counted things to amounts that can be used (1½ eggs, not 1⅓).
171. Changed amounts switch to a natural measure when it comes out even (6 tsp becomes 2 tbsp, 8 tbsp becomes ½ cup).
172. Changed amounts make the words agree ("1 large egg", "2 yellow onions").
173. An eighth shows as ⅛ instead of "0.13".
174. Ingredients ticked on a dish's page are kept for twelve hours, through leaving the page or a restart.
175. "+ Shopping list" on a dish's page puts the ingredients you haven't ticked onto the shopping list, and says how many.
176. The dish page's buttons are bigger for wet hands (servings −/+ 56 px, ingredient rows 52 px).
177. On a dish in progress, "Cook now" becomes "Continue · step 3".
178. A dish says when it was last cooked.
179. The steps heading shows how many steps and the total time, and says when amounts in the steps are for the original number of servings.
180. After changing servings there is a "Back to 8" button.
181. "Make my own version" copies a library recipe into the My recipe editor, ready to change; the original stays.
182. About 350 recipe steps that mention a time but had no timer ("Rest 10 minutes") now have a timer button.
183. A step-timer button on the dish page says so when all eight timers are in use (it used to say the timer had started).
184. Cooking mode's step timers ring even when nobody has tapped a button on that screen since coming back to it.
185. Step timers ring for as long as was chosen in Settings, instead of a fixed two minutes.
186. A finished step timer blinks in two steps instead of an endless smooth animation the slow chip struggles with.
187. "Done cooking" shows an "Enjoy your meal!" screen with Back to recipes, Cook it again and Home (it used to drop to Home).
188. Timer buttons for other steps are named for what they time ("Crisp the pork · 7:58") instead of "Step 3".
189. A step timer has "+1 min" while it counts or rings.
190. A very long step shrinks its text to fit the card instead of running off the bottom.
191. Coming back to cooking left half-finished hours ago asks "Start from the beginning" or "Carry on from step 4".
192. Opening cooking mode for a recipe that has been deleted says so (it quietly opened a different recipe).
193. With changed servings, cooking mode says which amounts are for the new number and which are as written.
194. Cooking mode no longer highlights "vegetable oil" when a step says "sesame oil".
195. Cooking mode has bigger ingredient checkboxes and taller step dots.
196. In the My recipe editor, Serves, Prep and Cook have big −/+ buttons, so no keyboard is needed.
197. What is typed for a recipe of your own is kept as you go, so a restart mid-typing doesn't lose it.
198. Saving a second recipe with the same name as an existing one asks first.
199. Timers in your own steps understand "1 hour 30 minutes", "1½ hours", "half an hour" and "45 seconds".
200. Ingredient lines like "a pinch of salt", "an onion" and "half a cup of milk" are read as amounts.

## 9 · Home and the Menu

201. Home's clock changes exactly on the minute (it could be ten seconds late) and is right the moment the screen wakes.
202. With the 24-hour clock, Home has no empty gap where AM/PM used to be.
203. On a family birthday Home says "Happy birthday, Ava!".
204. On holidays Home says "Happy Thanksgiving", "Merry Christmas" and so on.
205. Home's weather card warns of rain, snow or storms in the next few hours ("Rain around 11 PM"), or says when it will be dry again.
206. Home's weather card shows tomorrow's forecast.
207. Coming back to Home shows the weather and tonight's dinner at once, without a flash of "Loading weather…".
208. Weather saved earlier says "as of 7:21 PM" when the Wi-Fi is down or it is over an hour old, and saved weather for another town or in the other degrees is not shown.
209. The weather is fetched the moment the Wi-Fi comes back or another town is chosen, instead of up to fifteen minutes later.
210. The note link on Home names the writer ("New note from Mom") and no longer runs past the card with a long name.
211. Tapping anywhere on Home's photo opens the photo frame, not only the small "Full screen" button.
212. A photo that won't load is skipped on Home instead of leaving the card blank.
213. When the week plan says "Eating out" or "Leftovers" tonight, Home's dinner card and the Menu's Recipes tile say so.
214. From 8 PM Home's dinner card shows tomorrow's planned dinner, so it can be thawed or prepared.
215. "Coming up" says "Now" for something under way, and is checked every five minutes.
216. Home's buttons (Timers, Menu, Full screen, Add photos) are bigger.
217. The Menu has a "Wipe the screen" button.
218. The Menu's clock changes exactly on the minute and leaves no gap with the 24-hour clock.
219. The Menu's top buttons are taller and still fit on one row.
220. Long hints on the Menu's tiles wrap to a second line instead of being cut off.
221. The Calendar tile says what is next and when, not only a count.
222. The Messages tile names the writer of the newest note.
223. The Shopping list tile's count changes while the Menu is open (when something is added from a phone, say).
224. The Weather tile shows saved weather at once instead of "Loading…", and its warning colour clears when a warning ends.
225. With no photos yet, the Photos tile goes straight to "Add photos".

## 10 · Night clock and Apps

226. The night clock changes exactly on the minute and does nothing in between (it redrew every ten seconds all night).
227. Every few minutes the night clock shifts a few pixels, so the screen doesn't keep a ghost of it after many nights.
228. The night clock is easier to read when dimmed: heavier strokes, a bigger date, brighter and larger lines for tomorrow.
229. A timer that rings while the night clock is up shows a big "Time's up · Pasta", and a tap anywhere stops it (a tap used to leave for Home with the timer still ringing).
230. Tomorrow's weather and first calendar entry sit under the date, leaving the corners free, so a running timer no longer covers them.
231. Opened by hand in the daytime, the night clock says "Tap anywhere to go back" and goes back to where you came from.
232. The night clock's top line says what is happening: "Dimmed until 6 AM", "Good morning", or when it will come on.
233. In the morning its "Today" line skips appointments that are already over.
234. A long calendar entry no longer pushes its time off the night clock.
235. With no forecast saved and no internet, the night clock says "No forecast just now" instead of a dash.
236. When the screen wakes, the night clock catches up at once instead of showing an old time.
237. With the 24-hour clock the night clock's time is properly centred.
238. A timer ringing at night brings the backlight up enough to find the screen and read which timer it is, and back down when it is stopped.
239. A timer counting down on the night clock is shown warm and dim instead of being the brightest thing in a dark room.
240. The Apps screen puts the most-used apps first.
241. If an app doesn't come up after a tap, the Apps screen says so plainly and what to try (it used to sit there saying "Opening…").
242. "Update apps" first says what will happen: it is for a grown-up, the PIN comes next, the Play Store stays open for fifteen minutes.
243. Coming back from the Play Store, the list refreshes by itself and marks what is new.
244. With no apps yet, the Apps screen explains how they get there, with the button for a grown-up.
245. After an app is used, its tile no longer still says "Opening…", and apps added or removed meanwhile show right away.
246. The Apps screen's back and "Update apps" buttons are bigger.
247. Long app names get a smaller font so more of the name shows.
248. A screen whose Android side is too old to list its apps no longer shows a made-up list that does nothing.
249. The app list is read from Android once per visit instead of for every tile (each read takes 30-44 ms on the tablet).
250. A switch saved as the text "false" can no longer turn a feature on by mistake.

## 11 · Weather

251. Owners on Celsius get wind in km/h, rain in mm and snow in cm everywhere on the Weather screen.
252. Wind has its direction in words ("from the southeast") and adds gusts when they are much stronger.
253. Humidity is shown, with "damp" or "dry air" at the extremes.
254. Sun strength (UV) is shown as a plain word with the number underneath.
255. A "Rain, next 12 hrs" box gives the chance and the expected amount (snow when snow is due).
256. After sunset the sunrise, sunset and sun-strength boxes switch to tomorrow's instead of times already past.
257. Today's high and low read the useful way for the time of day ("Today's high 64° · Tonight's low 44°" in the evening).
258. The summary line is plainer and covers more cases ("Rain until about 1 PM", "Dry tonight · frost likely"), and no longer says "Dry today" at 9 PM.
259. "Before you head out" has better tips: frost and the car, an umbrella for the morning, strong gusts, sunscreen.
260. The hour strip covers the next 24 hours instead of 12 and slides sideways.
261. Night hours sit on a darker band and a new day is named at midnight.
262. Sunrise and sunset appear as their own markers between the hours.
263. The week shows six days instead of five.
264. Weekend days are marked.
265. Each day has a bar showing its low-to-high range against the whole week's.
266. Tapping a day opens it in detail: hour by hour, rain or snow, wind, sun strength, sunrise and sunset.
267. "Today hour by hour" opens the whole of today, with the past hours faded and now marked.
268. With the Wi-Fi down, the saved forecast still describes the right hours, and an old one labels its temperature "expected about now".
269. With no internet the Weather screen says how old the forecast is, and has a big "Try again".
270. When the town is changed in Settings the Weather screen starts over for the new town at once, never showing the old town's weather under the new name.
271. Warning colours follow how serious the warning is, on the Weather screen, Home and the Menu.
272. Warnings say when they start as well as when they end, and the detail explains what a warning, a watch or an advisory means.
273. Several warnings at once are counted and all listed.
274. Warnings that have ended vanish by themselves while the screen is open.
275. A quiet "No weather warnings" line appears only where the warning service really covers the area.
276. For a town picked by hand in another time zone, "today", the hours and sunrise are right (today could show "--°").
277. A damaged saved copy or full storage no longer stops the weather on Home, the Menu, the night clock and the photo frame, and a missing temperature is no longer shown as "0°".
278. Missing numbers show "--", never "undefined°".

## 12 · Photo frame, camera and adding photos

279. "All photos" on the photo frame opens a grid of everything on the screen, newest first, with who sent each and when; tap one to jump to it.
280. Several photos can be removed at once from the grid: tick them (or "Choose all"), then one question to confirm.
281. The grid uses small copies made once and kept, so an album of hundreds doesn't load hundreds of full-size phone pictures.
282. A photo that won't open says so in the grid, so broken ones are easy to find and remove.
283. "Hold" keeps the current picture up, says until when, and carries on by itself after ten minutes.
284. Videos have a "Tap for sound" button; each new video starts quiet again, so the frame never plays sound to an empty kitchen.
285. A caption that is cut off shows "Read all", which opens the whole text with who sent it and when.
286. Swiping left or right changes the photo, as well as tapping the sides.
287. Going past the last photo says "Back to the first photo" (and the other way round).
288. When the frame opens, a hint shows for a few seconds: tap the sides or swipe for other photos, the middle for Home.
289. A photo or video that can't be shown and can't be skipped says so, with what to do (it was a blank grey screen).
290. A photo sent while the frame is up is shown at once with "New photo from…"; if a picture is being held or the grid is open, it offers "Show" instead of snatching the screen.
291. A photo removed from the phone page no longer restarts the slideshow from the beginning.
292. Photos arriving at an empty frame replace the "No photos yet" message (it stayed on top of them).
293. The empty frame offers "Take a photo" next to "Add photos from a phone".
294. With only one photo, the frame says so and hides the arrows and Hold.
295. Videos are no longer cut off at the screen's edges.
296. The photo frame's buttons are bigger (56 px).
297. The slow zoom and any video pause while the grid, a caption or a question covers them, and a video stops at once when the picture changes.
298. The camera has a self-timer (off, 3 s, 10 s) so people can step back into the picture; tapping again during the countdown stops it.
299. A clear "Photo saved" or "Video saved" shows at the top, with a bigger preview and "See it".
300. Camera problems say which problem it is (not allowed, busy, not found) and what to do.
301. When the album is full, the camera says so before taking the picture, with "Make room" leading to the grid (it used to click as if the photo was saved).
302. Stopping a video says "Saving the video…" until it is put away, and a failed save says why.
303. In the last ten seconds of a video the time turns red and counts down, so recording doesn't stop by surprise.
304. The camera's buttons are bigger, with a visible Back.
305. The code on "Add photos" is bigger, and so is the typed address.
306. "Add photos" says what the phone will show and what else that page can do (leave a note, add to the list, send a recipe).
307. When the screen isn't on Wi-Fi, "Add photos" says so and offers "Wi-Fi settings"; the code appears by itself once connected.
308. When photos arrive, "Add photos" shows a big message with "See them now" or "Stay here to send more".
309. The newest pictures on "Add photos" can be tapped to open them in the frame.
310. When the album is full or nearly full, "Add photos" has a "Choose photos to remove" button that opens the grid.

## 13 · The first-start tour

311. The tour has a "Back" button, for a Next tapped too fast.
312. A tour left half-watched goes back to its first card after ten minutes and waits there for the next person.
313. When the night clock takes over, the tour steps aside instead of sitting bright on top of it, and is offered again in the morning.
314. The tour shows off the timers ("name each one with a tap; they ring on whatever screen is up").
315. The tour ends on "Make it yours": the town, the clock, the alarm sound, on the kitchen screens and on Tom's deck.
316. "Carry on" after wandering off mid-tour returns to the right screen for every step (it only knew a few and otherwise stayed stuck).

## 14 · Tom's deck: planes overhead and departures

317. Planes Overhead opens with one sentence about the plane it has picked ("A Delta Boeing 737-900 from Atlanta to Boston is passing 3 miles northeast at 34,000 ft").
318. It says where to look from the window: a compass direction and how high in the sky, worked out from distance and altitude.
319. It says whether the plane is coming his way, moving away or passing by, and which way it is heading.
320. A plane squawking an emergency code gets a red banner that says what the code means.
321. Each plane has a badge for what it is: heavy jet, helicopter, business jet, military, cargo, small plane, glider, balloon.
322. Helicopters are drawn as helicopters, and one standing still says "hovering" instead of "0 mph".
323. On opening, the screen picks the most interesting plane in range, not simply the closest.
324. Routes give cities with their codes and, for flights abroad, the country.
325. About 100 more aircraft types and 35 more airlines are named in words, and the feed's uneven spellings no longer show.
326. A Range button switches the radar between 25 and 10 miles, for a crowded sky.
327. The radar is marked N, E, S, W, with the town under "Home" and distances on the rings.
328. The list reaches every plane on the radar, in pages with big buttons (it showed only the first seven); tapping a plane on the radar jumps to it.
329. Each row in the list says how far away the plane is and in which direction.
330. With nothing overhead, the screen says when the last plane was seen and what it was.
331. A strip keeps the day's count of aircraft seen from the house and the day's most unusual visitor.
332. When the live feed stops answering, the header says how old the planes are, and after ten minutes falls back to clearly marked sample planes.
333. The screens go easier on the free plane feeds: they wait longer after each failure, don't try at all with the Wi-Fi off, and share one request between screens.
334. After the town is changed, a feed failure can no longer show planes from the old town.
335. A full or damaged store on the screen can no longer throw away good live data or show an error.
336. Odd values from the feed (a missing speed or position) can no longer produce "NaN" or a broken row.
337. Planes Overhead and Departures follow a town change in Settings straight away.
338. Leaving either screen while it was still loading no longer leaves its once-a-minute checks running in the background.
339. The radar no longer animates continuously: planes step every four seconds and the sweep ticks four times a second instead of sixty.
340. On a metric screen, distances also show km and speeds km/h (altitude stays in feet).
341. The departure board's clock and times follow the 12/24-hour choice.
342. The board says which airport it is showing and why.
343. Tom can switch the board between the nearest few airports, and the deck follows his choice.
344. Board statuses are in plain words ("Just took off", "Due in 4 min", "Taxiing out").
345. Each board row shows the airline's name and the airport's code, and marks a flight after midnight.
346. Tapping a flight on the board opens it on the radar, already picked out.
347. Longer boards turn pages with big buttons instead of being cut at nine rows.
348. A board that cannot load says so instead of "Loading…" for ever, and the sample board is labelled as an example.

## 15 · Tom's deck: the flight deck, starfield, deep image and trivia

349. Settings, Viewscreen and Deep image stay in the deck's header in every setup (two were dropped when Apps and Camera were on).
350. The deck's header links and bottom buttons are bigger.
351. When the plane feed goes down, the deck's planes panel keeps the last real count and closest plane with its age, instead of switching to made-up planes.
352. The deck's departures line does the same, and can use three lines instead of being cut off on one.
353. With the Wi-Fi off, the deck's panels say so in plain words, and everything refreshes the moment it returns.
354. A deck that hasn't found its town says so instead of presenting New York's planes as "over your house".
355. The Space Station panel switches to "Overhead now · look up" when the pass starts (it could be fifteen minutes late) and is right after midnight.
356. The Space Station panel says how high the pass climbs, and warns when its orbit figures are old.
357. The Trivia button on the deck shows "Today's question" until it has been answered.
358. The deck does less work while it sits there: the radar sweep steps instead of running at 60 frames a second, and only the two Voyager numbers change each second.
359. The deck's small grey labels are larger and lighter.
360. The night starfield is drawn four times a second with plain timers instead of sixty, all night, and not at all while the screen is off.
361. Tapping anywhere on the starfield goes back to the deck.
362. The starfield's "dimmed" line shows the hours chosen in Settings and follows changes at once.
363. The starfield's sunrise, moon and Space Station lines no longer run off the edge.
364. Deep image: the arrows step back through NASA's pictures of the past seven days, then the famous ones.
365. Deep image: "Read more" opens NASA's whole write-up in a large reading panel with pages.
366. Deep image: on a video day the credit says the picture is a still from the day's video.
367. Deep image: when no picture arrives there is a big "Try again", and a picture that hangs for thirty seconds counts as failed instead of "Receiving…" for ever.
368. Deep image: the credit and caption are bigger and wrap instead of being cut off.
369. Deep image: at midnight the new day's picture no longer pulls away the one he is looking at.
370. Trivia: a choice of Everything, Flight, Space, or Weather and navigation questions.
371. Trivia: a question of the day, picked from the ones he has met least.
372. Trivia: no repeats until the whole bank has been asked.
373. Trivia: a running "in a row" count, and his best run kept.
374. Trivia: the end of a round shows today's tally, his best run, his all-time score and how many of the questions he has met.
375. Trivia: the explanation after each answer and the answer buttons are bigger.
376. Trivia: a round open at midnight finishes properly, and a full store can no longer stop the game.

## 16 · Tom's deck: tonight's sky, missions and alerts

377. The sky maths works out when the Sun, Moon and planets rise, set and are highest, on daylight-saving days and where the Sun never rises or sets.
378. Tonight's Sky says when the Sun sets and when it is fully dark.
379. Tonight's Sky shows the next full moon and new moon.
380. The Moon's row says when it rises or sets tonight.
381. One big sentence names the best thing to look at tonight ("Saturn is bright in the southwest all evening").
382. Planets are listed by how bright they really are tonight, and ones that only rise near bedtime go last (Mars after midnight used to push Saturn off the list).
383. A planet too close to the Sun to be seen is no longer listed.
384. Every row says how high to look in plain words (low, a third up, halfway up, high up, overhead).
385. When a brilliant planet is up only in the morning, a "Before dawn" line says so.
386. Near a meteor shower's peak, Tonight's Sky shows it, with how many an hour and whether the Moon will hide the faint ones.
387. A "Tomorrow night" button previews the next evening.
388. Tapping the Space Station row lists the next visible passes: when, how long, how bright, where it appears and fades, and who is aboard by name.
389. The Space Station row tells apart "still working it out", "none visible in the next three days" and "times unavailable".
390. Times on Tonight's Sky follow the 12/24-hour choice.
391. Changing the town in Settings makes Tonight's Sky, Space Missions and Sky Alert work everything out again.
392. Tonight's Sky is marked "Sample place" when it can't find where the screen is, instead of quietly showing Philadelphia's sky.
393. The cloud forecast is only used for the town it was fetched for, and says its age when old.
394. No more tiny grey text on the sky, missions and alert screens, and every button is 56 px.
395. Labels on the sky chart no longer overlap.
396. A thirty-second glimpse of the Space Station low on the horizon no longer sets off an alert.
397. Pass times worked out from an orbit more than ten days old are no longer shown as if they were right.
398. Every screen uses the same Space Station orbit, so they all give the same pass times, and it keeps working for three days without the internet.
399. Space Missions changes only the countdown each second instead of rebuilding the whole panel.
400. Launch status is in plain words ("Go for launch", "Date not confirmed", "On hold"), and "Liftoff!" shows only when a launch is confirmed.
401. A launch whose date has moved says so ("Moved from tonight 11:29 PM").
402. Rough launch dates are said honestly ("Sometime in December").
403. The launch panel says how the most recent launch went.
404. Tapping the launch panel lists every upcoming launch; tapping one explains the mission and says how far away the launch pad is.
405. Launches with people aboard are tagged, with a "Crewed only" filter.
406. The Space Station card no longer shows a made-up crew count when the crew feed is down.
407. Within an hour of a launch the schedule is rechecked every ten minutes, so scrubs and holds show up.
408. The Space Station alert says how bright the pass will be, where it appears and fades, and whether cloud may hide it.
409. Northern-lights and meteor alerts only go off once the sky is dark, and not under an overcast sky.
410. "Seen it" and "Dismiss" on Sky Alert put an alert away for good.
411. The rocket-launch alert uses the same launch list as Space Missions, and never fires on sample data.
412. A feed that fails is left alone for five minutes instead of being asked again every minute.
413. Small fixes: "1 minute" not "1 minutes"; the pulsing dots blink in two steps instead of animating endlessly.
414. For whoever looks after the code: `node tools/sim/astro-test.mjs` checks the sky maths against 51 published values.

## 17 · The phone page (arrives with the next app update on each screen)

415. Sending several photos shows each one with its own state (waiting, % sent, done, failed), and the bar fills by how much has really gone.
416. If the Wi-Fi drops for a moment the page tries that photo once more, and stops cleanly when the connection is really gone instead of failing every remaining photo.
417. After a batch that partly failed, "Try those again" sends only the ones that didn't go.
418. The caption is kept until the whole batch has arrived.
419. Videos and other files a phone can't send are left out straight away with a plain reason, before any waiting.
420. When the album is nearly full, only as many photos as fit are sent, and the page says how many were left out.
421. Picking a photo already sent from this phone asks first.
422. The screen's refusals are said plainly ("too big for the kitchen screen: the most it takes is 15 MB"), without a pointless "try again".
423. A HEIC photo the phone's browser can't open gets an explanation and what to do.
424. Tapping a photo in the album opens it large on the page, with caption, sender, Back/Next, swipe and Remove (it used to open the bare image in another tab).
425. A "Mine" button shows only the photos sent under your name.
426. The album has a Refresh button, counts photos and videos apart, and warns when it is nearly full.
427. The album's pictures are no longer downloaded again every time the page checks for changes.
428. One clear "Can't reach the kitchen screen" notice says what to check, keeps trying by itself and goes away when the screen answers.
429. An old or changed code gets its own message, saying where to scan again (it ended in a confusing error).
430. At the store, the List tab no longer shows the red "can't reach" notice: the saved list works there and says so.
431. The page's title says whose screen it is ("The Smiths' kitchen screen").
432. Notes: the family's names are one-tap buttons for "From".
433. Notes: ready-made short notes fill in with one tap.
434. Notes: the counter is against the real limit, and long notes are warned that they show smaller on the screen.
435. Notes: a Reply button on each note on the board.
436. Notes: a photo with a note shows its progress, and isn't uploaded twice if the note has to be sent again.
437. Notes: "Seen on the kitchen screen" and hearts update by themselves while the tab is open.
438. List: ticking an item just added on the phone used to be lost silently; the tick now arrives.
439. List: items and ticks that haven't reached the kitchen screen yet are marked.
440. List: things added before from this phone are offered as "Add again" buttons.
441. List: the tab shows how many things are left to get, and "2 milk" and "milk" count as the same thing.
442. The page stops checking for news while the phone is locked or the page is in the background, to save battery.
443. Recipe: an optional "A few words about it" field (the screen could already show it).
444. Recipe: pasting from a website strips the bullets, checkboxes and "1." / "Step 2:" from the lines.
445. Recipe: times can be typed as "90", "1:30" or "1 hr 30", and a wrong number gets a plain message instead of quietly becoming 4 servings or 0 minutes.
446. Recipe: the page says before the screen would cut something (a very long step, too many ingredients).
447. Recipe: deleting confirms that it worked, and the count shows near the limit.
448. Settings: tap a person's name to change it (it was delete and add again).
449. Settings: a birthday or date with no name stops the save and points at it (it used to vanish silently).
450. Settings: common wrong calendar links are caught on the phone, with what to use instead.
451. Settings: the result of "check this link" is said plainly.
452. Settings: clearer step-by-step help for finding the private link in Google Calendar, iCloud and Outlook.
453. The page follows the phone's dark mode.
454. The tab last used on this phone opens again on the next scan.
455. List: the things added by hand can be taken off the list from the phone (it could only tick them).
456. The album on a phone loads small copies made by the kitchen screen, instead of downloading every full-size photo to draw the grid.
457. A birthday can carry the year (the phone page asks, if you like), and the calendar and night clock then say how old they turn ("Turns 9").

## 18 · Finding out what is new

458. A "What's new" page shows the highlights of what has arrived by itself, each with "Show me", in the kitchen's look and in the deck's.
459. For a week after new things arrive, the home screen mentions it quietly ("New things have arrived"); a brand-new screen never sees it, because the tour is its introduction.
460. The app's automatic test on GitHub now checks what was added to the screen's little server: small album copies, removing a list item from a phone, a birthday's year, and the expired-link page.

## 19 · Looking after it for years

461. What the screen keeps about a recipe somebody stopped half-way through is put away after a month, and the screen's diary says when its storage is getting full, so it can't fill up without anybody knowing.
462. Publishing also runs the calendar-file and sky-maths tests first, and stops if one fails.
463. A printable one-page guide for the kitchen screens (`guide/kitchen-screen.html`), to slip in with the gift: the words match what the screen says, with a blank for the PIN.
464. The same for Tom's flight deck (`guide/flight-deck.html`).
465. The screen's diary notes when the Wi-Fi or the internet was gone for more than ten minutes: from when, and for how long ("the weather was old all afternoon" has its answer there).
466. The diary notes time spent on the battery too: from when, for how long, and how low it got.
467. For whoever looks after the code: `node tools/sim/device-visit.mjs` puts the working copy on a plugged-in tablet, opens every screen there, reports how long each took and any error, and puts the tablet back.

## 20 · Kitchen conversions

468. A Kitchen conversions screen, all by tapping, one tap from Recipes and from cooking mode (Back returns to the step you were on): teaspoons, tablespoons, fluid ounces, cups, pints, quarts and millilitres into one another.
469. Weights too: ounces, pounds, grams and kilos, and what an amount comes to as sticks and tablespoons of butter.
470. An oven table: Fahrenheit, Celsius, a fan oven's setting, gas mark, and the words recipes use ("moderate", "hot").
471. "Halve & double": half, a third, one and a half, double or three times a measure, answered in measures that can actually be scooped ("half of ¾ cup is 6 tablespoons").
472. Conversions also has "Is it done?": what a food thermometer should read for poultry, ground meat, steaks and roasts, fish, egg dishes and leftovers.

## 21 · A second pass over the kitchen screens

473. Weeks can start on Sunday or on Monday (Settings → Clock & night); the calendar's week and month views follow.
474. The night clock can show the clock only, without tomorrow's weather and calendar, for a screen that faces a bed.
475. The photo frame can hide its clock and date, and separately the weather.
476. An alarm nobody stops gets more insistent after half a minute (it can be switched off).
477. On a birthday whose year is known, Home says "Happy 9th birthday, Ava!".
478. The calendar's "Next big thing" gives the age too ("turns 22").
479. Home keeps a place free for the timer chip, so it no longer sits on top of "Coming up" or the photo.
480. A recipe can be planned for a day next week from its own page.
481. Coming from next week's "+ Add" on the week plan, the recipe's page offers that day (it offered nothing).
482. Settings → Wi-Fi & about: the list of what went wrong scrolls in its own box, and there is one plain line to read out over the phone to whoever is helping.
483. With the 12-hour clock, the photo frame's clock shows AM/PM like the other clocks.
484. A soft chime when a note arrives from a phone, so somebody in the kitchen looks up; never in the night clock's hours, and it can be switched off.
485. An optional heads-up: two soft notes a minute before a timer of five minutes or more runs out.
486. A Settings section longer than its card says "More below" until its end is reached.
487. "What's new" is always one tap away in Settings → Wi-Fi & about.
488. The screen's diary records when the screens updated themselves, and to which version.
489. For whoever looks after the code: `bash tools/check.sh` also runs every test with known answers, including a new one that each screen named in the app has its file, and each file is named.
490. On the two days a year the clocks change, Home says so ("Clocks went back last night"), so nobody wonders whether this clock is the right one.
491. The printable guides are published with the site, so they can be opened and printed from any computer or phone.
492. "Check tablet" says whether a newer app is out than the one on the tablet (which fetches it by itself within six hours, or at once after being switched off and on).
