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

Download `home-tablets.apk` from the latest release:
https://github.com/datboi161616-a11y/home-tablets/releases/latest

Then, in a terminal in the folder where you saved it:

```
adb install home-tablets.apk
adb shell dpm set-device-owner com.hometablets.launcher/.AdminReceiver
```

The second line must say `Success: Device owner set ...`. If it says there are
accounts on the device, go back to step 1.

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

## 5. Update the web engine (recommended)

The screens are drawn by Android's built-in web engine ("Android System WebView").
Out of the box it can be years old. Everything still works on an old one, but
spacing and animations look best on a current version.

1. Grown-up menu (below) → **Wi-Fi settings**, then tap back to reach the main Settings page.
2. Accounts → add a Google account. Use a spare account just for the
   tablets, not your personal one. (This works now because kiosk mode is already on.)
3. Open the Play Store → search **Android System WebView** → **Update**. Do the
   same for **Google Chrome** if it's listed.
4. Keep the account on the tablet so the web engine keeps updating itself.
5. Grown-up menu → **About** should now show WebView 100 or higher.

## 6. Done

Turn USB debugging off again (Developer options) and unplug. The tablet now boots
straight into the home screen, has no lock screen or status bar, stays on while
charging, and updates itself.

## Grown-up menu

Press and hold the **top-left corner** of the screen for 5 seconds, then enter the PIN:

- **Wi-Fi settings**: join the recipient's Wi-Fi (unlocks for 10 minutes).
- **Switch profile**, **Reload**, **Check for app update**.
- **Unlock tablet for 10 minutes**: use other Android settings. It locks again after that.

## Updates

- **Screens and features** (the web app): push to GitHub. Tablets reload within 30 minutes.
- **The Android app itself** (rarely needed): push changes under `android/`. GitHub
  builds, tests and releases it; tablets install it silently within 6 hours.

## Undoing kiosk mode

Grown-up menu → **Turn off kiosk mode permanently**, or factory reset the tablet.
