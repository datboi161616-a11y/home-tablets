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
