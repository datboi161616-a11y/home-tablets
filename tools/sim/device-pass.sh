#!/bin/bash
# How long does a tap take on a REAL tablet? Plug one in (USB debugging on, Family
# screens), then:  bash tools/sim/device-pass.sh my-label
# It opens the menu, taps Calendar / Weather / Messages and back again (some right away,
# some after 40 s of nothing), records the screen, and prints for each tap how long the
# button took to react and how long the next screen took to appear.
# Needs adb, and Python with numpy and imageio-ffmpeg (pip install imageio-ffmpeg).
export MSYS_NO_PATHCONV=1
HERE="$(cd "$(dirname "$0")" && (pwd -W 2>/dev/null || pwd))"
L="${1:-run}"
adb shell am start -n com.hometablets.launcher/.MainActivity --es screen launcher >/dev/null 2>&1; sleep 9
# "Pointer location" draws a crosshair the instant a finger lands: that is the clock's start.
adb shell settings put system pointer_location 1; adb shell rm -f /sdcard/pass.mp4
(adb shell screenrecord --size 960x600 --bit-rate 6000000 --time-limit 175 /sdcard/pass.mp4 &); sleep 2
adb shell 'p() { input swipe $1 $2 $1 $2 110; sleep $3; }; sleep 2; p 1188 450 3; p 150 90 3; p 1645 450 3; p 150 90 3; p 730 918 3; p 150 90 3; sleep 40; p 730 918 3; p 150 90 3; sleep 40; p 1188 450 3; p 150 90 3'
adb shell pkill -INT screenrecord; sleep 3
adb pull /sdcard/pass.mp4 "$HERE/pass-$L.mp4" 2>&1 | tail -1; adb shell rm -f /sdcard/pass.mp4
adb shell settings put system pointer_location 0
# What else is the tablet busy with? (A stuck background app shows up here.)
adb shell 'top -b -n 1 -d 1 | sort -k9 -n -r | head -4 | cut -c1-150'
python "$HERE/device-taps.py" "$HERE/pass-$L.mp4" "1188,450;150,90;1645,450;150,90;730,918;150,90;730,918;150,90;1188,450;150,90"
