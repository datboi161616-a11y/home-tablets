# Setting up each tablet (about 10 minutes each)

Do this once per tablet, before wrapping it. You need a Windows PC with `adb`
(Android platform-tools, already on your PC) and a USB-C cable.

## 1. Factory reset and skip accounts

Kiosk mode (device owner) only works on a tablet with **no Google account**.

1. On a new tablet: just turn it on. On a used one: Settings → System → Reset → Erase all data.
2. In the setup wizard: pick language, **connect to Wi-Fi**, and **skip** signing in to Google.
   (You can add the recipient's own Wi-Fi later from the grown-up menu.)
3. Finish setup to the normal home screen.

## 2. Turn on USB debugging

1. Settings → About tablet → tap **Build number** 7 times.
2. Settings → System → Developer options → turn on **USB debugging**.
3. Plug into the PC and tap **Allow** on the tablet.

## 3. Install the app and make it the device owner

Download `home-tablets.apk` (this link always gets the newest version):
https://github.com/datboi161616-a11y/home-tablets/releases/latest/download/home-tablets.apk

Then, in a terminal in the folder where you saved it:

```
adb install home-tablets.apk
adb shell dpm set-device-owner com.hometablets.launcher/.AdminReceiver
```

The second line must say `Success: Device owner set ...`. If it says there are
accounts on the device, go back to step 1.

Then let your dashboard's "their screen right now" picture show any app (like
YouTube), without anyone at the tablet ever being asked to "Allow":

```
adb shell appops set com.hometablets.launcher PROJECT_MEDIA allow
```

## 4. Pick the profile (and optionally a PIN)

Family tablet:

```
adb shell am start -n com.hometablets.launcher/.MainActivity --es profile family --es pin 2512
```

Tom's tablet:

```
adb shell am start -n com.hometablets.launcher/.MainActivity --es profile tom --es pin 2512
```

Change `2512` to any 4–8 digit PIN for the grown-up menu.

## 5. Sign in once with a Google account (covers most apps)

You do **not** need a separate login for every app. One Google sign-in gives the
tablet, in a single step: **Gmail (email), Google Photos, YouTube + its
subscriptions, YouTube Music, Google Calendar, and the Play Store** — all signed
in at once. If the recipient already uses that Google account on their own phone,
signing the same account into the tablet brings their email, their photos and
their YouTube across (this is the closest thing to "linking their phone").

1. Grown-up menu (below) → **Wi-Fi settings**, then tap back to reach the main Settings page.
2. Accounts → **Add account → Google**, and sign in.
   - **Android-phone recipients:** use their own Google account so their stuff comes across.
   - **iPhone recipients:** Apple (iMessage, iCloud photos) can't be linked to a non-Apple
     device, so make a Google account for the tablet. WhatsApp (an app tile) covers messaging.
3. While you're here, also open the **Play Store** and update **Android System WebView**
   (and **Google Chrome** if listed) — the screens look best on a current web engine.
4. A few non-Google apps (Spotify, Netflix, WhatsApp) each need their own one-time login
   if you want them — you can do that now, or later from the dashboard.
5. Keep the account on the tablet so apps and the web engine keep updating themselves.
6. Grown-up menu → **About** should show WebView 100 or higher.

## 6. Done

Turn USB debugging off again (Developer options) and unplug. The tablet now boots
straight into the home screen, has no lock screen or status bar, stays on while
charging, and updates itself.

## Adding photos

Each tablet has its own private album: photos are stored on the tablet only.

1. On the tablet: Photos → **+ Add photos** (or the button on the Home screen).
2. On a phone **connected to the same Wi-Fi**: point the camera at the QR code and tap the link.
3. Enter your name, optionally a caption, and **Choose photos**. They appear on the tablet in seconds.
   The same page shows what's on the tablet and lets you remove photos.

If the phone says it can't reach the tablet, the phone is probably on mobile data
or a guest Wi-Fi network. Switch it to the same Wi-Fi as the tablet.

## Grown-up menu

Press and hold the **top-left corner** of the screen for 5 seconds, then enter the PIN:

- **Wi-Fi settings**: join the recipient's Wi-Fi (unlocks for 10 minutes).
- **Switch profile**, **Reload**, **Check for app update**.
- **New photo upload code**: old QR codes stop working (if a photo of the code got shared).
- **Unlock tablet for 10 minutes**: use other Android settings. It locks again after that.

## Updates

- **Screens and features** (the web app): push to GitHub. Tablets reload within 30 minutes.
- **The Android app itself** (rarely needed): push changes under `android/`. GitHub
  builds, tests and releases it; tablets install it silently within 6 hours.

## Undoing kiosk mode

Grown-up menu → **Turn off kiosk mode permanently**, or factory reset the tablet.
