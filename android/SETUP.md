# Setting up a tablet (about 10 minutes each)

Do this once per tablet, before you wrap it. You need this Windows PC (it already
has `adb`) and a USB-C cable that carries data.

## 1. On the tablet: fresh start, no Google account yet

1. New tablet: just turn it on. Used one: Settings → System → Reset → **Erase all data**.
2. In the setup screens, pick the language and **connect to Wi-Fi**, but **skip
   signing in to Google**. (Kiosk mode can only be switched on before any account
   is added; you add the Google account in step 4.)
3. Turn on USB debugging: Settings → About tablet → tap **Build number** 7 times,
   then Settings → System → Developer options → **USB debugging** on.

## 2. On the PC: run the setup

1. Plug the tablet in. Tap **Allow** (tick "Always allow") when the tablet asks.
2. Double-click **`setup\Setup tablet.bat`** in this project.
3. Pick **1** (Family) or **2** (Tom), and a grown-up PIN (Enter = `2512`).
4. Say which **time zone** the tablet will live in, if it isn't yours. A Wi-Fi tablet
   can't work that out by itself, so a gift sent to another zone would show the wrong
   hour. (It can be changed later on the screen: Settings → Clock & night → Time zone.)

The script first looks the tablet over (Android and browser-engine versions, battery,
Wi-Fi, clock, free space) and marks anything worth a look with `!`. Then it downloads
the newest app, installs it, turns on kiosk mode, switches off the tablet's built-in
Alexa (see below), starts the right screens, makes sure the home screen really is up and
locked, then switches USB debugging off again. If anything is wrong it tells you exactly
what to do (most often: the tablet already has a Google account → go back to step 1).

It finds `adb` by itself if Google's platform-tools are unzipped in your Downloads
folder, on the Desktop, or next to the script. Each tablet it sets up gets a line in
`setup\setup-log.txt` (date, serial number, which screens, app version; never the PIN),
so you can tell later which of the six got what.

**Just looking:** `setup\Check tablet.bat` does only the looking-over and changes
nothing on the tablet. Handy before wrapping one, or when one is back on your desk.

## 3. Optional: Apps and Camera

Family tablets show the **Apps** and **Camera** buttons; Tom's tablet hides them to
stay focused on space and flight. Switch either one per tablet from the grown-up menu
(**Apps screen: ON/OFF**, **Camera: ON/OFF**).

## 4. On the tablet: one Google sign-in (about 2 minutes)

One Google account signs the tablet into **YouTube, Gmail, Google Photos, YouTube
Music, Calendar and the Play Store** at once. No separate login per app.

1. Hold the **top-left corner** for 5 seconds, enter the PIN → **Wi-Fi settings**,
   then tap back to the main Settings page.
2. **Accounts → Add account → Google** and sign in. Most recipients use iPhones,
   which can't be linked to Android, so make a Google account for the tablet.
3. Open the **Play Store** and update **Android System WebView**. The screens look
   best on a current web engine.
4. Optional one-time logins: WhatsApp (messaging for iPhone users), Spotify, Netflix…

Unplug. From now on it updates itself.

**Before you wrap it:** a new screen opens with a short **showcase** instead of Home
until someone finishes or skips it: it hops across the real screens showing off the
best features (weather, family photos and the QR code, dinner ideas, cooking mode,
recipes and the shopping list, calendar, notes, night mode; Tom's: live planes,
Voyager, tonight's sky, launches, trivia, starfield). If you skipped it while setting
up, turn it back on: grown-up menu → **Tutorial: show again**. It comes back at every
start until the new owner finishes or skips it. The **Tour** button on the App menu (TOUR on Tom's flight deck) runs it again any time.

---

## Their photos

Each tablet has its own private album (photos stay on that tablet).

- **Send from a phone (no account):** on the tablet, Photos → **+ Add photos** shows
  a QR code. On a phone **on the same Wi-Fi**, point the camera at it, tap the link,
  **Choose photos** (Select All works). They appear in seconds.
- **Their iPhone photos, automatically:** install **Google Photos** on their iPhone,
  sign in with the tablet's Google account, turn on backup.
- **Camera:** Photos → **📷 Camera** (photo or video).

If a phone can't reach the tablet, it's on mobile data or a guest Wi-Fi network.

## Grown-up menu

Hold the **top-left corner** for 5 seconds, enter the PIN:

- **Wi-Fi settings** (unlocks for 10 minutes), **Switch profile**, **Reload**,
  **Check for app update**, **Unlock tablet for 10 minutes**,
  **Turn off kiosk mode permanently**, **New photo upload code**,
  **Apps screen ON/OFF**, **Camera ON/OFF**, **Tutorial: show again**,
  **Update or add apps (Play Store, 15 minutes)**.

**When an app says it needs an update** (YouTube does now and then): its own "Update"
button leads nowhere, because kiosk mode keeps the Play Store shut. Open the Play Store
from the grown-up menu, or with **Update apps** on the Apps screen (it asks for the PIN).
It stays open for 15 minutes, then locks again. With a Google account on the tablet the
Play Store also updates apps by itself overnight.

## Settings on the screen itself

**Menu → Settings** (on Tom's deck: **SETTINGS** in the header), in sections:

- **Your family:** the name on the Home screen.
- **Screen & sound:** brightness, volume, what the screen goes back to when nobody is
  using it (Home or the photo frame) and after how long, and **Wipe the screen**
  (touches off for 30 seconds, for cleaning the glass).
- **Clock & night:** 12 or 24-hour clock, when the night clock starts and ends (or
  never), and how dim it is.
- **Photo frame:** how long each picture stays, the slow zoom, captions, the order.
- **Weather:** °F or °C, and the town (typed by name or ZIP code when the screen's own
  guess is off).
- **Timers:** the alarm sound and how long it rings.
- **Wi-Fi & about:** whether the Wi-Fi is connected, with a **Wi-Fi settings** button
  that asks for the grown-up PIN; checking for an update; starting the screens again;
  putting the settings back the way they came; and, for whoever looks after the screen,
  how it is doing and a short list of anything that went wrong lately.

Birthdays, the people who leave notes and calendar links are still added from a phone.

## Automatic behaviour

- **Night:** from 10 PM, once nobody has touched it for 5 minutes, it switches to the
  night clock (Tom: starfield) and dims the screen. At 6 AM it goes back to what was
  showing. The hours can be changed, or the night clock switched off, in Settings.
- **Back to Home:** a menu, the calendar, the weather or the shopping list left
  untouched for 10 minutes goes back to Home. The photo frame, a recipe, cooking mode
  and the timers stay up.
- **Updates:** screen changes you push reach the tablet the next time it's idle;
  app updates install themselves within 6 hours (or straight away after the tablet is
  switched off and on again: it looks for one every time it starts).
- **A fresh start each night:** between 3 and 5 AM, when nobody has touched it for half
  an hour, the page starts over and comes back on the same screen, so weeks of running
  don't add up.
- **A word in the corner** when the charger has come out ("Not plugged in · 42% left"),
  when the battery is low, or when the Wi-Fi has been gone for a few minutes.

## When something goes wrong

What the owner sees, and what to do (most of it they can do themselves):

| What they say | What it is | What to do |
|---|---|---|
| "It says *Not plugged in*" / "*Plug me in*" | The charger has come out or the socket is off. | Plug it in. It runs a few hours on its battery, then goes dark. |
| "It says *No Wi-Fi*" / the weather is old | The Wi-Fi or the internet is down. Everything else keeps working from what it saved. | Check the router. New router or password: Settings → Wi-Fi & about → **Wi-Fi settings** (grown-up PIN). |
| "A screen says it can't open" | Its code couldn't be fetched, or it stopped half-way. It tries again by itself. | Settings → Wi-Fi & about → **Start again**. Still there? See "Taking a change back" in the README. |
| "It looks stuck" | Rare; the screens start afresh by themselves every night anyway. | **Start again** in Settings, or hold the power button and restart. Nothing is lost. |
| "The weather is for the wrong town" | The automatic guess is a town or two off. | Settings → Weather → type the town or ZIP code. |
| "My phone can't reach it" | The phone is on mobile data or another Wi-Fi, or the code is old. | Same Wi-Fi as the screen; scan the code on Photos → Add photos again. |
| "An app won't open / wants an update" | Play Store updates need a grown-up. | Apps → **Update apps** (grown-up PIN). |
| "It's showing the ordinary Android home screen" | Somebody used "Unlock tablet" in the grown-up menu. | Press Home; or restart the tablet. |

**Finding out what happened.** Settings → Wi-Fi & about → *For whoever looks after this
screen* lists what went wrong lately (which screen, when), how long the Wi-Fi was gone,
time spent on the battery, and when the screens last updated themselves, with one line
to read out over the phone. Nothing is sent anywhere: somebody has to read it to you.

**With the tablet on your desk.** `setup\Check tablet.bat` looks it over without changing
anything; `node tools/sim/device-visit.mjs both --live` opens every screen on it and
reports errors.

## Their photos: removing one

On the photo frame, **Remove** (top right) takes the picture that is showing off the
screen, after asking once. The phone page can remove them too.

## Running setup again later

Turn USB debugging back on (grown-up menu → **Unlock tablet** → Settings → System →
Developer options), plug in, run the script. It updates the app and keeps everything;
pick **3** at the last question to leave the tablet's screens and PIN as they are.

## The built-in Alexa is switched off

Lenovo ships these tablets with Amazon Alexa. With no Amazon account signed in, its
background service (`amazon.speech.sim`) retries without a pause and keeps one to two of
the tablet's eight processor cores busy for good; measured on a real tablet, that was the
main thing making it feel slow. The home screen doesn't use Alexa, so setup disables it
(with `com.lenovo.smart_tab_m10_alexa` and `com.amazon.dee.app`). To bring it back on a
tablet: `adb shell pm enable amazon.speech.sim` (and the same for the other two).

## Trying a change on a real tablet before publishing it

While USB debugging is on, the app can load the screens from this PC instead of the
website, and the page can be inspected from the PC (chrome://inspect):

```
python tools/sim/serve.py
```

```
adb reverse tcp:5173 tcp:5173
```

```
adb shell am start -n com.hometablets.launcher/.MainActivity --es site http://localhost:5173/
```

`--es site off` goes back to the real site. With USB debugging off the app ignores all of this.

## Doing it by hand (if the script can't run)

```
adb install -r home-tablets.apk
```

```
adb shell dpm set-device-owner com.hometablets.launcher/.AdminReceiver
```

```
adb shell pm disable-user --user 0 amazon.speech.sim
```

```
adb shell am start -n com.hometablets.launcher/.MainActivity --es profile family --es pin 2512
```

(`profile tom` for Tom's tablet.) The app is at
https://github.com/datboi161616-a11y/home-tablets/releases/latest/download/home-tablets.apk

## Undoing kiosk mode

Grown-up menu → **Turn off kiosk mode permanently**, or factory reset the tablet.
