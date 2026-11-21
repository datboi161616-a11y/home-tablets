"""python device-taps.py video.mp4 "x,y;x,y;..."   (device-pass.sh makes the video and runs this)
Times taps in a screenrecord video made with Android's "pointer location" overlay on
(Developer options): a crosshair appears across the whole screen the instant a finger
lands and goes when it lifts, on any background. Tap points are in tablet pixels, in order."""
import re, subprocess, sys, os
import numpy as np
import imageio_ffmpeg  # pip install imageio-ffmpeg
W, H = 960, 600
video = sys.argv[1]
taps = [tuple(int(v) for v in p.split(',')) for p in sys.argv[2].split(';')]
raw = video + '.raw'
r = subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), '-y', '-i', video, '-fps_mode', 'passthrough', '-vf', f'scale={W}:{H},showinfo', '-f', 'rawvideo', '-pix_fmt', 'gray', raw], capture_output=True, text=True, errors='replace')
times = [float(m) for m in re.findall(r'pts_time:([0-9.]+)', r.stderr)]
frames = np.fromfile(raw, dtype=np.uint8).reshape(-1, H, W).astype(np.int16); os.remove(raw)
n = min(len(times), len(frames))
def whole(i): return float((np.abs(frames[i][40:] - frames[i - 1][40:]) > 14).mean() * 100)  # below the overlay's top strip
def cross(i, x, y):
    cx, cy = min(W - 2, x // 2), min(H - 2, y // 2)
    d = np.abs(frames[i] - frames[i - 1]) > 10
    col = d[40:, max(0, cx - 2):cx + 3].any(axis=1).mean() * 100
    row = d[max(40, cy - 2):cy + 3, :].any(axis=0).mean() * 100
    return float(max(col, row))
if '--dump' in sys.argv:
    for i in range(1, n):
        w = whole(i)
        if w > 0.02: print('%7.2fs %5.1f%%' % (times[i], w))
    sys.exit()
i = 1
out = []
for k, (x, y) in enumerate(taps):
    while i < n and not (cross(i, x, y) > 35 and whole(i) < 10): i += 1
    if i >= n: print('tap %d: no crosshair found' % (k + 1)); break
    down = i
    j = down + 1; up = None; new = None; press_seen = None
    while j < n and times[j] - times[down] < 3.2:
        w = whole(j)
        if up is None and cross(j, x, y) > 35 and w < 10: up = j
        elif new is None and w >= 12: new = j
        elif new is None and press_seen is None and 0.05 <= w < 12 and cross(j, x, y) < 35: press_seen = j
        j += 1
    ms = lambda a: None if a is None else round((times[a] - times[down]) * 1000)
    row = dict(tap=k + 1, at=round(times[down], 2), up=ms(up), reacted=ms(press_seen), new=ms(new))
    row['after_lift'] = None if (new is None or up is None) else row['new'] - row['up']
    out.append(row)
    print('tap %2d at %6.2fs | finger up +%s ms | button reacted +%s ms | new screen +%s ms (%s ms after lifting)' % (
        row['tap'], row['at'], row['up'], row['reacted'], row['new'], row['after_lift']))
    i = (new or up or down) + 1
