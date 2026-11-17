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

Then switch on remote help for the whole tablet, so you can see any app (like
YouTube) and use "Take over" from your dashboard without anyone tapping "Allow":

```
adb shell appops set com.hometablets.launcher PROJECT_MEDIA allow
```

```
adb shell settings put secure enabled_accessibility_services com.hometablets.launcher/com.hometablets.launcher.RemoteTouch
```

```
adb shell settings put secure accessibility_enabled 1
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
