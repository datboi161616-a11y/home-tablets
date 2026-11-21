# Home Tablets - one-step setup for a tablet plugged in over USB.
# Double-click "Setup tablet.bat" (next to this file) to run it.
#
# What it does, in order:
#   1. Checks the tablet is connected and USB debugging is allowed
#   2. Downloads the newest app from GitHub and installs it
#   3. Turns on kiosk mode (needs a tablet with NO Google account yet) and switches
#      off the built-in Alexa, which otherwise slows the whole tablet down
#   4. Asks Family or Tom, and a grown-up PIN, then starts the home screen
# Safe to run again on a tablet that's already set up (it just updates it).

$ErrorActionPreference = 'Stop'
$Pkg      = 'com.hometablets.launcher'
$ApkUrl   = 'https://github.com/datboi161616-a11y/home-tablets/releases/latest/download/home-tablets.apk'
$ApkPath  = Join-Path $env:TEMP 'home-tablets.apk'

function Say($text, $color = 'White') { Write-Host $text -ForegroundColor $color }
function Step($n, $text) { Write-Host ''; Write-Host "[$n/4] $text" -ForegroundColor Cyan }
function Stop-Setup($text) {
    Write-Host ''
    Write-Host $text -ForegroundColor Red
    Write-Host ''
    Read-Host 'Press Enter to close'
    exit 1
}

# adb prints normal progress on stderr; run it without PowerShell treating that as an error.
function Adb {
    $out = & cmd /c "adb $args 2>&1"
    return ($out | Out-String).Trim()
}

Clear-Host
Say '=========================================' 'Yellow'
Say '   Home Tablets - tablet setup' 'Yellow'
Say '=========================================' 'Yellow'

# ---------------------------------------------------------------- 1. connection
Step 1 'Looking for the tablet...'
if (-not (Get-Command adb -ErrorAction SilentlyContinue)) {
    Stop-Setup "Can't find 'adb'. Install Android platform-tools and make sure 'adb' works in a terminal."
}
$null = Adb 'start-server'
$devices = (Adb 'devices') -split "`n" | Select-Object -Skip 1 | Where-Object { $_ -match '\S' }
if (-not $devices) {
    Stop-Setup @"
No tablet found. Check:
  - The USB cable is plugged in (some cables only charge - try another).
  - On the tablet: Settings > About tablet > tap 'Build number' 7 times,
    then Settings > System > Developer options > turn on 'USB debugging'.
Then run this again.
"@
}
if ($devices -match 'unauthorized') {
    Stop-Setup "The tablet is asking 'Allow USB debugging?'. Tap ALLOW on the tablet (tick 'Always allow'), then run this again."
}
if (@($devices).Count -gt 1) {
    Stop-Setup 'More than one device is plugged in. Unplug everything except the tablet you are setting up.'
}
$model = Adb 'shell getprop ro.product.model'
Say "  Found: $model" 'Green'

# ---------------------------------------------------------------- 2. install
Step 2 'Downloading and installing the newest app...'
try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $ApkUrl -OutFile $ApkPath -UseBasicParsing
} catch {
    Stop-Setup "Couldn't download the app. Check this PC's internet connection. ($($_.Exception.Message))"
}
$install = Adb "install -r `"$ApkPath`""
if ($install -notmatch 'Success') { Stop-Setup "Install failed:`n$install" }
Say '  App installed.' 'Green'

# ---------------------------------------------------------------- 3. kiosk mode
Step 3 'Turning on kiosk mode...'
# (Not "dpm list-owners": the tablets' Android 10 doesn't have that command.)
$owners = Adb 'shell dumpsys device_policy'
if ($owners -match "(?s)Device Owner:.{0,200}?package=$([regex]::Escape($Pkg))") {
    Say '  Already on (this tablet was set up before).' 'Green'
} else {
    $dpm = Adb "shell dpm set-device-owner $Pkg/.AdminReceiver"
    if ($dpm -match 'Success') {
        Say '  Kiosk mode is on.' 'Green'
    } elseif ($dpm -match 'account') {
        Stop-Setup @"
Kiosk mode can only be turned on when the tablet has NO accounts yet.
Fix: Settings > System > Reset > Erase all data. During the setup screens,
connect to Wi-Fi but SKIP signing in to Google. Then run this again.
(You add the Google account AFTER this script - see the last step.)
"@
    } else {
        Stop-Setup "Couldn't turn on kiosk mode:`n$dpm"
    }
}

# Lenovo builds Amazon Alexa into these tablets. With no Amazon account signed in, its
# background service retries without a pause and keeps one to two of the processor's
# cores busy for good, which makes everything else sluggish. The home screen doesn't use
# it, so switch it off. (To bring one back: adb shell pm enable <name>.)
foreach ($extra in @('amazon.speech.sim', 'com.lenovo.smart_tab_m10_alexa', 'com.amazon.dee.app')) {
    $null = Adb "shell pm disable-user --user 0 $extra"
}
Say '  Switched off the built-in Alexa (it slows the tablet down and is not used here).' 'Green'

# ---------------------------------------------------------------- 4. profile + PIN
Step 4 'Which screens should this tablet show?'
Say '  1) Family'
Say "  2) Tom (space & flight)"
do { $choice = Read-Host '  Type 1 or 2' } while ($choice -notin @('1', '2'))
$screens = if ($choice -eq '2') { 'tom' } else { 'family' }

do {
    $pin = Read-Host '  Grown-up PIN, 4-8 digits (press Enter for 2512)'
    if (-not $pin) { $pin = '2512' }
} while ($pin -notmatch '^\d{4,8}$')

$null = Adb "shell am start -n $Pkg/.MainActivity --es profile $screens --es pin $pin"
Say "  Started with $screens screens." 'Green'
Start-Sleep -Seconds 2
# Close the USB door: settings can only be changed over USB, so switch it off now.
# (To run this script again later: Settings > System > Developer options > USB debugging.)
$null = Adb 'shell settings put global adb_enabled 0'

# ---------------------------------------------------------------- done
Write-Host ''
Say '=========================================' 'Green'
Say '   Done! The tablet is set up.' 'Green'
Say '=========================================' 'Green'
Say ''
Say 'Last step, on the tablet (about 2 minutes):'
Say "  1. Hold the TOP-LEFT corner for 5 seconds, enter PIN $pin."
Say "  2. Tap 'Wi-Fi settings', then tap back to the main Settings page."
Say "  3. Accounts > Add account > Google, and sign in."
Say '     (That one sign-in gives YouTube, Gmail, Photos, Play Store.)'
Say "  4. Open Play Store and update 'Android System WebView'."
Say ''
Say 'Then unplug. It will update itself from now on.'
Say '(USB debugging was switched off for safety. To run this again later, turn it back on'
Say ' from the grown-up menu > Unlock tablet > Settings > Developer options.)'
Say "This tablet's grown-up PIN is: $pin  (write it down)" 'Yellow'
Write-Host ''
Read-Host 'Press Enter to close'
