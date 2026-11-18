// Camera: full-screen live viewfinder, Photo/Video. Saves to this tablet's album.
//
// The point of this screen is the remote group photo: your dashboard opens it on
// the tablet (so your "their screen" picture shows the live camera), everyone gets
// in frame, and you tap "Take photo" — a 3-2-1 countdown runs, then it snaps.
// A "Camera on" badge and shutter sound mean nobody is ever filmed unawares.
import { profile } from '../config.js';
import { savePhoto, saveVideo, isTablet } from '../services/tablet-photos.js';

const MAX_VIDEO_MS = 60 * 1000; // keep clips small enough to store
// If nobody touches the screen for this long, the camera switches itself off (with a warning first),
// so it's never left running on the counter by accident.
const IDLE_MS = 3 * 60 * 1000;
const IDLE_WARN_S = 10;

// Everything for one visit to this screen lives in `visit`; leaving the screen ends it,
// so late callbacks (camera starting, timers, recorder) can tell they're stale.
let visit = null;
let beepCtx;

const back = () => `#/${profile === 'tom' ? 'bridge' : 'home'}`;
const log = (m) => {
  console.log('[camera] ' + m);
  try { window.TabletNative && window.TabletNative.log && window.TabletNative.log(m); } catch { /* not on tablet */ }
};
const stamp = () => new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

function shutterSound() {
  try {
    beepCtx = beepCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = beepCtx.createOscillator(), g = beepCtx.createGain();
    o.connect(g); g.connect(beepCtx.destination);
    o.frequency.setValueAtTime(900, beepCtx.currentTime);
    o.frequency.exponentialRampToValueAtTime(300, beepCtx.currentTime + 0.08);
    g.gain.setValueAtTime(0.3, beepCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, beepCtx.currentTime + 0.12);
    o.start(); o.stop(beepCtx.currentTime + 0.12);
  } catch { /* no audio */ }
}

/** Blob -> base64 without Blob.arrayBuffer (missing on the tablets' Chrome 74). */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]+,/, ''));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export function mount(el) {
  el.innerHTML = `
  <style>
    .cam-root{position:absolute;top:0;right:0;bottom:0;left:0;background:#000;color:#fff;overflow:hidden;font-family:Inter,system-ui,sans-serif}
    .cam-video{position:absolute;top:0;right:0;bottom:0;left:0;width:100%;height:100%;object-fit:cover;transform:scaleX(-1)}
    .cam-badge{position:absolute;top:28px;left:28px;display:flex;align-items:center;gap:10px;background:rgba(0,0,0,.5);padding:10px 18px;border-radius:999px;font-size:18px;font-weight:600}
    .cam-rec{width:12px;height:12px;border-radius:50%;background:#FF3B30;animation:cam-pulse 1.4s infinite}
    @keyframes cam-pulse{0%,100%{opacity:1}50%{opacity:.3}}
    .cam-done{position:absolute;top:28px;right:28px;background:rgba(0,0,0,.5);color:#fff;border-radius:999px;padding:12px 22px;font-size:16px;font-weight:600;text-decoration:none;min-height:44px;display:flex;align-items:center}
    .cam-shutter{position:absolute;left:50%;bottom:32px;transform:translateX(-50%);width:88px;height:88px;border-radius:50%;background:#fff;border:6px solid rgba(255,255,255,.5);cursor:pointer}
    .cam-shutter:active{transform:translateX(-50%) scale(.92)}
    .cam-shutter.rec{background:#FF3B30}
    .cam-shutter.vid:not(.rec)::after{content:'';position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:40px;height:40px;border-radius:50%;background:#FF3B30}
    .cam-shutter.wait{opacity:.4;pointer-events:none}
    .cam-shutter.rec::after{content:'';position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:28px;height:28px;border-radius:5px;background:#fff}
    .cam-mode{position:absolute;left:50%;bottom:140px;transform:translateX(-50%);display:flex;gap:8px;background:rgba(0,0,0,.5);border-radius:999px;padding:5px}
    .cam-mode button{border:0;background:transparent;color:#bbb;font-size:16px;font-weight:600;padding:8px 18px;border-radius:999px;cursor:pointer;min-height:44px}
    .cam-mode button.on{background:#fff;color:#111}
    .cam-time{position:absolute;left:50%;top:28px;transform:translateX(-50%);background:rgba(0,0,0,.5);padding:8px 16px;border-radius:999px;font-size:18px;font-weight:600;display:none}
    .cam-flash{position:absolute;top:0;right:0;bottom:0;left:0;background:#fff;opacity:0;pointer-events:none}
    .cam-flash.go{animation:cam-flash .35s ease-out}
    @keyframes cam-flash{0%{opacity:.9}100%{opacity:0}}
    .cam-count{position:absolute;top:0;right:0;bottom:0;left:0;display:none;align-items:center;justify-content:center;font-size:220px;font-weight:700;text-shadow:0 4px 30px rgba(0,0,0,.6)}
    .cam-saved{position:absolute;bottom:40px;left:28px;background:rgba(0,0,0,.6);color:#fff;text-decoration:none;border-radius:16px;padding:10px 14px;display:none;gap:12px;align-items:center;font-size:15px;min-height:74px}
    .cam-see{font-weight:700;text-decoration:underline}
    .cam-saved img{width:72px;height:54px;object-fit:cover;border-radius:8px}
    .cam-wait{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,.55);padding:14px 26px;border-radius:999px;font-size:22px;font-weight:600}
    .cam-idle{position:absolute;left:50%;top:96px;transform:translateX(-50%);background:rgba(0,0,0,.7);padding:14px 26px;border-radius:999px;font-size:20px;font-weight:600;display:none;white-space:nowrap}
    .cam-btn{border:0;background:#fff;color:#111;border-radius:999px;padding:12px 26px;font-size:18px;font-weight:600;min-height:48px;cursor:pointer;font-family:inherit}
    .cam-msg{position:absolute;top:0;right:0;bottom:0;left:0;display:none;flex-direction:column;align-items:center;justify-content:center;gap:16px;text-align:center;padding:40px;background:#000}
  </style>
  <div class="cam-root">
    <video class="cam-video" data-video autoplay playsinline muted poster="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"></video>
    <div class="cam-badge"><span class="cam-rec"></span>Camera on</div>
    <a class="cam-done" href="${back()}">Done</a>
    <div class="cam-time" data-time>0:00</div>
    <div class="cam-count" data-count></div>
    <div class="cam-flash" data-flash></div>
    <div class="cam-wait" data-wait>Starting camera…</div>
    <div class="cam-idle" data-idle></div>
    <a class="cam-saved" data-saved href="#/photos"><img data-thumb alt=""><span data-saved-text>Saved to photos</span><span class="cam-see">See it ›</span></a>
    <div class="cam-mode"><button data-m="photo" class="on">Photo</button><button data-m="video">Video</button></div>
    <button class="cam-shutter wait" data-shutter aria-label="Take photo"></button>
    <div class="cam-msg" data-msg></div>
  </div>`;

  const $ = (s) => el.querySelector(s);
  const video = $('[data-video]');
  const v = visit = {
    stream: null, ready: false, queued: null, shooting: false, mode: 'photo',
    recorder: null, recTimer: 0, recStart: 0, timers: [],
  };
  const live = () => visit === v;
  const later = (fn, ms) => { v.timers.push(setTimeout(() => { if (live()) fn(); }, ms)); };

  let savedTimer = 0;
  function showSaved(text, thumb, ok = true) {
    $('[data-saved-text]').textContent = text;
    const img = $('[data-thumb]');
    img.style.display = thumb ? '' : 'none';
    if (thumb) img.src = thumb;
    // "See it" opens the photo frame, which starts with the newest picture: this one.
    const box = $('[data-saved]');
    box.querySelector('.cam-see').style.display = ok ? '' : 'none';
    box.style.pointerEvents = ok ? '' : 'none';
    box.style.display = 'flex';
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => { if (live()) box.style.display = 'none'; }, 5000);
    v.timers.push(savedTimer);
  }

  function setWaiting(on) {
    $('[data-wait]').style.display = on ? '' : 'none';
    $('[data-shutter]').classList.toggle('wait', on);
  }

  function showProblem(text) {
    setWaiting(false);
    const msg = $('[data-msg]');
    msg.style.display = 'flex';
    msg.innerHTML = `<div style="font-size:32px;font-weight:600">Camera unavailable</div>
      <div style="font-size:20px;color:#bbb">${text}</div>
      <div style="display:flex;gap:16px;margin-top:8px">
        ${isTablet() ? '<button class="cam-btn" data-retry>Try again</button>' : ''}
        <a class="cam-done" href="${back()}" style="position:static">Back</a>
      </div>`;
    const retry = msg.querySelector('[data-retry]');
    if (retry) retry.onclick = () => startCamera();
  }

  // ---- start the camera (stop it if we've already left) ----
  const VIDEO = { facingMode: 'user', width: { ideal: 1920 }, height: { ideal: 1080 } };
  const withTimeout = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('timeout')), ms))]);
  async function startCamera() {
    log('opening camera');
    $('[data-msg]').style.display = 'none';
    setWaiting(true);
    if (v.stream) { v.stream.getTracks().forEach((t) => t.stop()); v.stream = null; v.ready = false; }
    try {
      // Camera only. The microphone is switched on just while a video is recording.
      const stream = await navigator.mediaDevices.getUserMedia({ video: VIDEO, audio: false });
      if (!live()) { stream.getTracks().forEach((t) => t.stop()); return; } // left already
      v.stream = stream;
      video.srcObject = stream;
      if (video.play) video.play().catch(() => {});
      log('camera stream started');
      // "Ready" = the live picture has a size. Check directly instead of relying on events.
      const started = Date.now();
      const poll = setInterval(() => {
        if (!live()) { clearInterval(poll); return; }
        if (video.videoWidth > 0) {
          clearInterval(poll);
          v.ready = true;
          setWaiting(false);
          log('camera ready ' + video.videoWidth + 'x' + video.videoHeight);
          if (v.queued) { const q = v.queued; v.queued = null; q(); } // a remote request was waiting
        } else if (Date.now() - started > 15000) {
          clearInterval(poll);
          log('camera picture never arrived');
          stream.getTracks().forEach((t) => t.stop());
          v.stream = null;
          showProblem('The camera didn’t start. Tap Try again.');
        }
      }, 200);
      v.timers.push(poll);
    } catch (err) {
      if (!live()) return;
      log('camera unavailable: ' + (err && err.name));
      showProblem(isTablet() ? 'The camera is turned off or already in use.' : 'Open this on the tablet to use its camera.');
    }
  }
  startCamera();

  // ---- switch off by itself when nobody's using it ----
  let idleAt = Date.now();
  const touched = () => { idleAt = Date.now(); $('[data-idle]').style.display = 'none'; };
  el.addEventListener('pointerdown', touched, true);
  el.addEventListener('touchstart', touched, true);
  const idlePoll = setInterval(() => {
    if (!live()) return;
    if (v.recorder || v.shooting || (v.queued && v.stream)) { idleAt = Date.now(); return; }
    const left = Math.ceil((idleAt + IDLE_MS - Date.now()) / 1000);
    const box = $('[data-idle]');
    if (left <= 0) { log('switched off: not used'); location.hash = back(); }
    else if (left <= IDLE_WARN_S && v.stream) {
      box.style.display = 'block';
      box.textContent = `Camera turning off in ${left}… tap to keep it on`;
    }
  }, 1000);
  v.timers.push(idlePoll);

  // Run now if the camera is streaming, otherwise as soon as it is.
  const whenReady = (fn) => {
    log('remote request, camera ready=' + v.ready);
    if (v.ready) fn(); else v.queued = fn;
  };

  function capture() {
    if (!v.ready || !video.videoWidth) { log('capture skipped: camera not ready'); return; }
    const c = document.createElement('canvas');
    c.width = video.videoWidth; c.height = video.videoHeight;
    c.getContext('2d').drawImage(video, 0, 0, c.width, c.height);
    const jpeg = c.toDataURL('image/jpeg', 0.9);
    const ok = savePhoto(jpeg, `Photo · ${stamp()}`);
    log('photo ' + c.width + 'x' + c.height + ' saved=' + ok);
    shutterSound();
    const flash = $('[data-flash]');
    flash.classList.remove('go'); void flash.offsetWidth; flash.classList.add('go');
    showSaved(ok || !isTablet() ? 'Saved to photos' : 'Couldn’t save the photo', jpeg, ok || !isTablet());
  }

  function shoot(countdown) {
    if (v.shooting) return;
    v.shooting = true;
    const countEl = $('[data-count]');
    const tick = (n) => {
      if (n > 0) {
        countEl.style.display = 'flex'; countEl.textContent = n; shutterSound();
        later(() => tick(n - 1), 1000);
      } else {
        countEl.style.display = 'none';
        capture();
        v.shooting = false;
      }
    };
    tick(countdown);
  }

  const fmt = (ms) => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

  async function startRec() {
    if (!v.ready || v.recorder || v.starting) return;
    const type = ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
      .find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t));
    if (!type) { showSaved('Video isn’t supported on this tablet', null, false); return; }
    v.starting = true;
    // Switch the microphone on just for this clip. If it can't open, record without sound.
    const mic = navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    let audio = null;
    try { audio = await withTimeout(mic, 4000); }
    catch (err) {
      log('recording without sound (' + (err && (err.name || err.message)) + ')');
      mic.then((late) => late.getTracks().forEach((t) => t.stop())).catch(() => {}); // if it opens later, close it
    }
    v.starting = false;
    if (!live() || !v.ready) { if (audio) audio.getTracks().forEach((t) => t.stop()); return; }
    v.mic = audio;
    const source = new MediaStream([...v.stream.getVideoTracks(), ...(audio ? audio.getAudioTracks() : [])]);
    const chunks = [];
    const rec = new MediaRecorder(source, { mimeType: type, videoBitsPerSecond: 2500000 });
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = async () => {
      // Save even if they already left the screen; only touch the UI if they're still here.
      try {
        const b64 = await blobToBase64(new Blob(chunks, { type }));
        const ok = saveVideo(b64, `Video · ${stamp()}`);
        log('video ' + Math.round(b64.length * 0.75 / 1024) + ' KB saved=' + ok);
        if (live()) showSaved(ok || !isTablet() ? 'Video saved to photos' : 'Couldn’t save the video (too long?)', null, ok || !isTablet());
      } catch (err) { log('video save failed ' + err); }
    };
    rec.start(1000);
    v.recorder = rec;
    v.recStart = Date.now();
    shutterSound();
    $('[data-shutter]').classList.add('rec');
    $('[data-time]').textContent = `0:00 / ${fmt(MAX_VIDEO_MS)}`;
    $('[data-time]').style.display = 'block';
    v.recTimer = setInterval(() => {
      if (!live()) return;
      $('[data-time]').textContent = `${fmt(Date.now() - v.recStart)} / ${fmt(MAX_VIDEO_MS)}`;
      if (Date.now() - v.recStart >= MAX_VIDEO_MS) stopRec();
    }, 250);
  }

  function stopRec() {
    if (!v.recorder) return;
    clearInterval(v.recTimer);
    try { v.recorder.stop(); } catch { /* already stopped */ }
    v.recorder = null;
    if (v.mic) { v.mic.getTracks().forEach((t) => t.stop()); v.mic = null; } // microphone off again
    $('[data-shutter]').classList.remove('rec');
    $('[data-time]').style.display = 'none';
  }

  function setMode(m) {
    if (v.recorder) stopRec();
    v.mode = m;
    el.querySelectorAll('[data-m]').forEach((b) => b.classList.toggle('on', b.dataset.m === m));
    // Video mode shows a red record dot on the button, so it's clear it films rather than snaps.
    const btn = $('[data-shutter]');
    btn.classList.toggle('vid', m === 'video');
    btn.setAttribute('aria-label', m === 'video' ? 'Start recording' : 'Take photo');
  }

  $('[data-shutter]').onclick = () => {
    if (v.mode === 'photo') shoot(0);
    else if (v.recorder) stopRec();
    else startRec();
  };
  el.querySelectorAll('[data-m]').forEach((b) => { b.onclick = () => setMode(b.dataset.m); });

  // From your dashboard: photo with a countdown, or start/stop video.
  v.onShoot = (e) => { touched(); setMode('photo'); whenReady(() => shoot((e.detail && e.detail.countdown) || 3)); };
  v.onRec = (e) => {
    touched();
    if (e.detail && e.detail.on) whenReady(() => { setMode('video'); startRec(); });
    else stopRec();
  };
  window.addEventListener('tablet-camera-shoot', v.onShoot);
  window.addEventListener('tablet-camera-record', v.onRec);
}

export function unmount() {
  const v = visit;
  visit = null; // marks every pending callback of this visit as stale
  if (!v) return;
  v.timers.forEach((t) => { clearTimeout(t); clearInterval(t); });
  clearInterval(v.recTimer);
  if (v.recorder) { try { v.recorder.stop(); } catch { /* ignore */ } } // still saves the clip
  if (v.mic) v.mic.getTracks().forEach((t) => t.stop());
  if (v.stream) v.stream.getTracks().forEach((t) => t.stop());
  window.removeEventListener('tablet-camera-shoot', v.onShoot);
  window.removeEventListener('tablet-camera-record', v.onRec);
}
