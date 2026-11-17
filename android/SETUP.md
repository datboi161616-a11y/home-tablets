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

The script downloads the newest app, installs it, turns on kiosk mode, lets your
dashboard see their screen without them ever being asked, starts the right screens,
then switches USB debugging off again. If anything is wrong it tells you exactly
what to do (most often: the tablet already has a Google account → go back to step 1).

## 3. Optional: Apps and Camera

Family tablets show the **Apps** and **Camera** buttons; Tom's tablet hides them to
stay focused on space and flight. Switch either one on or off per tablet from your
dashboard (**Features on this tablet**).

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

Unplug. From now on it updates itself and you manage it from your dashboard.

---

## Their photos

Each tablet has its own private album (photos stay on that tablet).

- **Send from a phone (no account):** on the tablet, Photos → **+ Add photos** shows
  a QR code. On a phone **on the same Wi-Fi**, point the camera at it, tap the link,
  **Choose photos** (Select All works). They appear in seconds.
- **Their iPhone photos, automatically:** install **Google Photos** on their iPhone,
  sign in with the tablet's Google account, turn on backup.
- **Camera:** Photos → **📷 Camera**, or from your dashboard (group photo with a
  3-2-1 countdown, or video).

If a phone can't reach the tablet, it's on mobile data or a guest Wi-Fi network.

## Grown-up menu

Hold the **top-left corner** for 5 seconds, enter the PIN:

- **Wi-Fi settings** (unlocks for 10 minutes), **Switch profile**, **Reload**,
  **Check for app update**, **New photo upload code**, **Remote viewing on/off**,
  **Unlock tablet for 10 minutes**, **Turn off kiosk mode permanently**.

## Automatic behaviour

- **Night:** from 10 PM, once nobody has touched it for 5 minutes, it switches to the
  night clock (Tom: starfield) and dims the screen. At 6 AM it goes back home.
- **Updates:** screen changes you push reach the tablet the next time it's idle;
  app updates install themselves within 6 hours.

## Running setup again later

Turn USB debugging back on (grown-up menu → **Unlock tablet** → Settings → System →
Developer options), plug in, run the script. It updates the app and keeps everything.

## Doing it by hand (if the script can't run)

```
adb install -r home-tablets.apk
```

```
adb shell dpm set-device-owner com.hometablets.launcher/.AdminReceiver
```

```
adb shell appops set com.hometablets.launcher PROJECT_MEDIA allow
```

```
adb shell am start -n com.hometablets.launcher/.MainActivity --es profile family --es pin 2512
```

(`profile tom` for Tom's tablet.) The app is at
https://github.com/datboi161616-a11y/home-tablets/releases/latest/download/home-tablets.apk

## Undoing kiosk mode

Grown-up menu → **Turn off kiosk mode permanently**, or factory reset the tablet.
