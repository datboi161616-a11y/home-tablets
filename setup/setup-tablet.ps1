# Home Tablets - one-step setup for a tablet plugged in over USB.
# Double-click "Setup tablet.bat" (next to this file) to run it.
#
# What it does, in order:
#   1. Checks the tablet is connected and USB debugging is allowed, and looks it over
#      (Android and browser-engine versions, battery, Wi-Fi, clock, free space)
#   2. Downloads the newest app from GitHub and installs it
#   3. Turns on kiosk mode (needs a tablet with NO Google account yet) and switches
#      off the built-in Alexa, which otherwise slows the whole tablet down
#   4. Asks Family or Tom, and a grown-up PIN, then starts the home screen and makes
#      sure it really is up and locked
# Safe to run again on a tablet that's already set up: it updates the app and, unless you
# ask otherwise, leaves its screens and PIN as they are.
#
# "Check tablet.bat" runs this with -Check: step 1 only. It reports on the tablet that is
# plugged in and changes nothing on it.
param([switch]$Check)

$ErrorActionPreference = 'Stop'
$Pkg      = 'com.hometablets.launcher'
$ApkUrl   = 'https://github.com/datboi161616-a11y/home-tablets/releases/latest/download/home-tablets.apk'
$ApkPath  = Join-Path $env:TEMP 'home-tablets.apk'
$LogPath  = Join-Path $PSScriptRoot 'setup-log.txt'
$Steps    = 4
if ($Check) { $Steps = 1 }

function Say($text, $color = 'White') { Write-Host $text -ForegroundColor $color }
function Warn($text) { Write-Host "  ! $text" -ForegroundColor Yellow; $script:Warnings += 1 }
function Step($n, $text) { Write-Host ''; Write-Host "[$n/$Steps] $text" -ForegroundColor Cyan }
function Stop-Setup($text) {
    Write-Host ''
    Write-Host $text -ForegroundColor Red
    Write-Host ''
    Read-Host 'Press Enter to close'
    exit 1
}
$Warnings = 0

# adb prints normal progress on stderr; run it without PowerShell treating that as an error.
function Adb {
    $out = & cmd /c "adb $args 2>&1"
    return ($out | Out-String).Trim()
}

# 'adb' is rarely on the PATH: most people unzip Google's platform-tools somewhere and
# leave it there. Look in the usual places before giving up.
function Find-Adb {
    # (adb.exe, as a program: plain "adb" would find this script's own Adb function.)
    $cmd = Get-Command adb.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($cmd) { return $cmd.Source }
    $places = @(
        (Join-Path $PSScriptRoot 'platform-tools\adb.exe'),
        (Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'),
        (Join-Path $env:USERPROFILE 'platform-tools\adb.exe'),
        'C:\platform-tools\adb.exe'
    )
    foreach ($p in $places) { if (Test-Path $p) { return $p } }
    foreach ($root in @((Join-Path $env:USERPROFILE 'Downloads'), (Join-Path $env:USERPROFILE 'Desktop'))) {
        if (Test-Path $root) {
            $hit = Get-ChildItem -Path $root -Filter adb.exe -Recurse -Depth 3 -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($hit) { return $hit.FullName }
        }
    }
    return $null
}

Clear-Host
Say '=========================================' 'Yellow'
if ($Check) { Say '   Home Tablets - tablet check' 'Yellow' } else { Say '   Home Tablets - tablet setup' 'Yellow' }
Say '=========================================' 'Yellow'

# ---------------------------------------------------------------- 1. connection
Step 1 'Looking for the tablet...'
$adbExe = Find-Adb
if (-not $adbExe) {
    Stop-Setup @"
Can't find 'adb', the tool that talks to the tablet over USB.
Get "SDK Platform-Tools for Windows" from developer.android.com/tools/releases/platform-tools,
unzip it into your Downloads folder (or next to this file), and run this again.
"@
}
# So that plain "adb" works for the rest of this run, wherever it was found.
$env:PATH = (Split-Path $adbExe) + ';' + $env:PATH
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
if ($devices -match 'offline') {
    Stop-Setup 'The tablet is plugged in but not answering. Unplug it, wake its screen, plug it in again, then run this again.'
}
if (@($devices).Count -gt 1) {
    Stop-Setup 'More than one device is plugged in. Unplug everything except the tablet you are setting up.'
}
$model  = Adb 'shell getprop ro.product.model'
$serial = Adb 'get-serialno'
Say "  Found: $model  (serial $serial)" 'Green'

# ---- a look at the tablet itself (nothing is changed here)
$android = Adb 'shell getprop ro.build.version.release'
$engine = ''
if ((Adb 'shell dumpsys webviewupdate') -match 'Current WebView package[^\r\n]*,\s*([\d.]+)\)') { $engine = $Matches[1] }
Say "  Android $android, browser engine (WebView) $engine"
if ($engine -and ([int]($engine -split '\.')[0]) -lt 81) {
    Warn "The browser engine is older than the screens were tested with (81). After setup, update 'Android System WebView' in the Play Store."
}

$battery = -1
if ((Adb 'shell dumpsys battery') -match '(?m)^\s*level:\s*(\d+)') { $battery = [int]$Matches[1] }
if ($battery -ge 0) {
    Say "  Battery $battery%"
    if ($battery -lt 15) { Warn 'The battery is nearly empty. Leave it on a wall charger for a while: a PC charges it slowly.' }
}

$onWifi = (Adb 'shell ip -4 addr show wlan0') -match 'inet '
if ($onWifi) { Say '  Wi-Fi: connected' } else { Warn 'Not on Wi-Fi. The screens need it for weather, calendars and updates: connect it (Settings > Network) before it leaves the house, or at its new home.' }

# The clock, against the internet's (this PC's own clock may be minutes out).
$zone = Adb 'shell getprop persist.sys.timezone'
$tabletNow = 0
[void][long]::TryParse((Adb 'shell date +%s'), [ref]$tabletNow)
$netNow = 0
try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $head = Invoke-WebRequest -Uri 'https://github.com' -Method Head -UseBasicParsing -TimeoutSec 10
    $netNow = [long]([DateTimeOffset]::Parse($head.Headers['Date'])).ToUnixTimeSeconds()
} catch { $netNow = 0 }
Say "  Time zone: $zone"
if ($tabletNow -gt 0 -and $netNow -gt 0) {
    $off = [math]::Abs($tabletNow - $netNow)
    if ($off -gt 120) { Warn "The tablet's clock is $([math]::Round($off / 60)) minutes out. On the tablet: Settings > System > Date & time > turn on 'Use network-provided time'." }
    else { Say '  Clock: right' }
}

$free = Adb 'shell df /data'
if ($free -match '(?m)^\S+\s+\d+\s+\d+\s+(\d+)\s+\d+%') {
    $freeGb = [math]::Round([long]$Matches[1] / 1048576, 1)
    Say "  Free space: $freeGb GB"
    if ($freeGb -lt 2) { Warn 'Less than 2 GB free. Photos sent to the screen need room.' }
}

$owners = Adb 'shell dumpsys device_policy'
$alreadySetUp = $owners -match "(?s)Device Owner:.{0,200}?package=$([regex]::Escape($Pkg))"
$appVersion = ''
if ((Adb "shell dumpsys package $Pkg") -match 'versionName=(\S+)') { $appVersion = $Matches[1] }
if ($alreadySetUp) { Say "  Already set up: app $appVersion, kiosk mode on." 'Green' }
# Is a newer app out than the one on this tablet? (It fetches its own within six hours, and
# straight away after being switched off and on again.)
if ($appVersion) {
    try {
        $rel = Invoke-RestMethod -Uri 'https://api.github.com/repos/datboi161616-a11y/home-tablets/releases/latest' -TimeoutSec 10 -Headers @{ 'User-Agent' = 'home-tablets-setup' }
        $latest = 0
        if ($rel.tag_name -match '^app-(\d+)$') { $latest = [int]$Matches[1] }
        $have = 0
        if ($appVersion -match '^1\.(\d+)') { $have = [int]$Matches[1] }
        if ($latest -gt $have -and $have -gt 0) {
            if ($Check) { Warn "A newer app is out (1.$latest; this tablet has $appVersion). It updates itself within six hours, or at once if you restart the tablet." }
            else { Say "  A newer app (1.$latest) is out; the next step installs it." }
        } elseif ($have -gt 0) { Say '  The app is the newest one.' }
    } catch { }
}
elseif ($appVersion) { Say "  The app is installed ($appVersion) but kiosk mode is not on yet." }
else { Say '  A new tablet: nothing of ours on it yet.' }

if ($Check) {
    $locked = (Adb 'shell dumpsys activity activities') -match 'mLockTaskModeState=LOCKED'
    if ($alreadySetUp) {
        if ($locked) { Say '  The home screen is up and locked.' 'Green' } else { Warn 'Kiosk mode is on but the screen is not locked to the app right now (somebody may have used "Unlock tablet").' }
    }
    Write-Host ''
    if ($Warnings) { Say "Checked: $Warnings thing(s) to look at, marked with ! above." 'Yellow' } else { Say 'Checked: everything looks right.' 'Green' }
    Say 'Nothing was changed on the tablet.'
    Write-Host ''
    Read-Host 'Press Enter to close'
    exit 0
}

# ---------------------------------------------------------------- 2. install
Step 2 'Downloading and installing the newest app...'
try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $ApkUrl -OutFile $ApkPath -UseBasicParsing
} catch {
    # No internet on this PC right now? A copy from an earlier run will do.
    if (Test-Path $ApkPath) { Warn "Couldn't download the newest app, so the copy from last time is used. (The tablet updates itself later anyway.)" }
    else { Stop-Setup "Couldn't download the app. Check this PC's internet connection. ($($_.Exception.Message))" }
}
if ((Get-Item $ApkPath).Length -lt 500KB) {
    Stop-Setup "The download isn't a complete app (only $([math]::Round((Get-Item $ApkPath).Length / 1KB)) KB). Run this again in a minute."
}
$install = Adb "install -r `"$ApkPath`""
if ($install -notmatch 'Success') { Stop-Setup "Install failed:`n$install" }
if ((Adb "shell dumpsys package $Pkg") -match 'versionName=(\S+)') { $appVersion = $Matches[1] }
Say "  App $appVersion installed." 'Green'

# ---------------------------------------------------------------- 3. kiosk mode
Step 3 'Turning on kiosk mode...'
# (Not "dpm list-owners": the tablets' Android 10 doesn't have that command.)
if ($alreadySetUp) {
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
$choices = @('1', '2')
if ($alreadySetUp) {
    # Running this again must not quietly change a PIN somebody already knows.
    Say '  3) Leave its screens and PIN as they are (just update it)'
    $choices = @('1', '2', '3')
}
do { $choice = Read-Host "  Type $($choices -join ', ')" } while ($choice -notin $choices)

# A gift is set up here and may live in another time zone; a Wi-Fi tablet can't work that
# out for itself, and its own Date and time page is behind the grown-up menu.
Say ''
Say "  Its clock is on: $zone"
Say '  Will it live in another time zone?'
Say '  1) No, leave it   2) Eastern   3) Central   4) Mountain   5) Arizona   6) Pacific   7) Alaska   8) Hawaii'
do { $tzChoice = Read-Host '  Type 1 to 8 (press Enter for 1)'; if (-not $tzChoice) { $tzChoice = '1' } } while ($tzChoice -notin @('1', '2', '3', '4', '5', '6', '7', '8'))
$zones = @{ '2' = 'America/New_York'; '3' = 'America/Chicago'; '4' = 'America/Denver'; '5' = 'America/Phoenix'; '6' = 'America/Los_Angeles'; '7' = 'America/Anchorage'; '8' = 'Pacific/Honolulu' }
$newZone = ''
$zoneArg = ''
if ($zones.ContainsKey($tzChoice)) { $newZone = $zones[$tzChoice]; $zoneArg = " --es timezone $newZone" }

$pin = ''
if ($choice -eq '3') {
    $screens = 'as before'
    $null = Adb "shell am start -n $Pkg/.MainActivity$zoneArg"
    Say '  Started again, with the screens and PIN it had.' 'Green'
} else {
    $screens = if ($choice -eq '2') { 'tom' } else { 'family' }
    do {
        $pin = Read-Host '  Grown-up PIN, 4-8 digits (press Enter for 2512)'
        if (-not $pin) { $pin = '2512' }
    } while ($pin -notmatch '^\d{4,8}$')
    $null = Adb "shell am start -n $Pkg/.MainActivity --es profile $screens --es pin $pin$zoneArg"
    Say "  Started with $screens screens." 'Green'
}

# Is it really up, and locked to the app? (Give it a moment to draw.)
Start-Sleep -Seconds 4
if ($newZone) {
    $nowZone = Adb 'shell getprop persist.sys.timezone'
    if ($nowZone -eq $newZone) { Say "  Its clock is now on $newZone." 'Green' }
    else { Warn "The time zone is still $nowZone. Once it is at its new home: Menu > Settings > Clock & night > Time zone." }
}
$activity = Adb 'shell dumpsys activity activities'
if ($activity -match "mResumedActivity:[^\r\n]*$([regex]::Escape($Pkg))") { Say '  The home screen is showing.' 'Green' }
else { Warn 'The home screen is not in front. Look at the tablet: it may be asking a question (tap Allow / OK), then press its Home button.' }
if ($activity -match 'mLockTaskModeState=LOCKED') { Say '  Locked to the home screen (kiosk).' 'Green' }
else { Warn 'It is not locked to the home screen yet. Restart the tablet once; if it still shows the ordinary Android home, run this again.' }

# A line for your own records of which tablet got what (never the PIN).
try {
    Add-Content -Path $LogPath -Encoding utf8 -Value ("{0}  {1}  {2}  {3}  app {4}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm'), $serial, $model, $screens, $appVersion)
} catch { }

# Close the USB door: settings can only be changed over USB, so switch it off now.
# (To run this script again later: Settings > System > Developer options > USB debugging.)
$null = Adb 'shell settings put global adb_enabled 0'

# ---------------------------------------------------------------- done
Write-Host ''
Say '=========================================' 'Green'
Say '   Done! The tablet is set up.' 'Green'
Say '=========================================' 'Green'
if ($Warnings) { Say "($Warnings thing(s) to look at, marked with ! above.)" 'Yellow' }
Say ''
Say 'Last step, on the tablet (about 2 minutes):'
if ($pin) { Say "  1. Hold the TOP-LEFT corner for 5 seconds, enter PIN $pin." }
else { Say '  1. Hold the TOP-LEFT corner for 5 seconds, enter its PIN.' }
Say "  2. Tap 'Wi-Fi settings', then tap back to the main Settings page."
Say "  3. Accounts > Add account > Google, and sign in."
Say '     (That one sign-in gives YouTube, Gmail, Photos, Play Store.)'
Say "  4. Open Play Store and update 'Android System WebView'."
Say ''
Say 'Then unplug. It will update itself from now on.'
Say '(USB debugging was switched off for safety. To run this again later, turn it back on'
Say ' from the grown-up menu > Unlock tablet > Settings > Developer options.)'
if ($pin) { Say "This tablet's grown-up PIN is: $pin  (write it down)" 'Yellow' }
Say "A line about this tablet was added to setup-log.txt, next to this file." 'DarkGray'
Write-Host ''
Read-Host 'Press Enter to close'
