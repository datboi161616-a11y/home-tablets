// Camera: its own app (not part of the Gallery). Full-screen live viewfinder, Photo/Video.
// What it takes is saved to this screen's Gallery.
//
// The point of this screen is the remote group photo: your dashboard opens it on
// the tablet (so your "their screen" picture shows the live camera), everyone gets
// in frame, and you tap "Take photo" — a 3-2-1 countdown runs, then it snaps.
// A "Camera on" badge and shutter sound mean nobody is ever filmed unawares.
import { profile } from '../config.js';
import { savePhoto, saveVideo, isTablet, albumFull, ALBUM_MAX } from '../services/tablet-photos.js';
import { C } from '../art.js';
import { timeText } from '../services/display.js';
import { backHref } from '../services/nav.js';

// The self-timer for "Take photo": off, 3 or 10 seconds, so people can step back into the
// picture. Remembered on this screen (it is the same household taking the next one).
const TIMERS = [0, 3, 10];
const TIMER_KEY = 'camera.timer';
const rememberedTimer = () => { try { const n = +localStorage.getItem(TIMER_KEY); return TIMERS.indexOf(n) >= 0 ? n : 0; } catch (e) { return 0; } };

// Camera picture for the screens without a live view (starting, unavailable). Drawn for the black
// background: a dim halo, a slate camera. Never shown over the live picture.
const camArt = () => `<svg viewBox="0 0 240 170" aria-hidden="true" focusable="false" style="display:block;width:240px;height:170px">
  <circle cx="120" cy="88" r="78" fill="#161B23"/>
  <path d="M90 52l9-15h42l9 15z" fill="${C.ink3}"/><rect x="52" y="50" width="136" height="90" rx="18" fill="${C.ink3}"/>
  <circle cx="120" cy="95" r="31" fill="${C.ink}"/><circle cx="120" cy="95" r="21" fill="#5B6FA8"/><circle cx="112" cy="87" r="7" fill="#C9D3F0"/>
  <circle cx="168" cy="68" r="6" fill="${C.accent}"/><rect x="66" y="62" width="18" height="8" rx="4" fill="${C.cloudDark}"/>
</svg>`;

const MAX_VIDEO_MS = 60 * 1000; // keep clips small enough to store
// If nobody touches the screen for this long, the camera switches itself off (with a warning first),
// so it's never left running on the counter by accident.
const IDLE_MS = 3 * 60 * 1000;
const IDLE_WARN_S = 10;

// Everything for one visit to this screen lives in `visit`; leaving the screen ends it,
// so late callbacks (camera starting, timers, recorder) can tell they're stale.
let visit = null;
let beepCtx;

const log = (m) => {
  console.log('[camera] ' + m);
  try { window.TabletNative && window.TabletNative.log && window.TabletNative.log(m); } catch { /* not on tablet */ }
};
// "Nov 21, 9:15 PM", or "Nov 21, 21:15" when the owner chose the 24-hour clock.
const stamp = (d = new Date()) => `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${timeText(d)}`;

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

export function mount(el, { args = [] } = {}) {
  // Back to where the person came from: the Gallery when its Camera button opened this
  // (#/camera/gallery), otherwise Home or the Menu (services/nav.js).
  const fromGallery = args[0] === 'gallery' && profile !== 'tom';
  const back = () => (fromGallery ? '#/photos' : backHref());
  el.innerHTML = `
  <style>
    .cam-root{position:absolute;top:0;right:0;bottom:0;left:0;background:#000;color:#fff;overflow:hidden;font-family:Inter,system-ui,sans-serif}
    .cam-video{position:absolute;top:0;right:0;bottom:0;left:0;width:100%;height:100%;object-fit:cover;transform:scaleX(-1)}
    .cam-badge{position:absolute;top:28px;left:28px;display:flex;align-items:center;gap:10px;background:rgba(0,0,0,.5);padding:10px 18px;border-radius:999px;font-size:18px;font-weight:600}
    .cam-rec{width:12px;height:12px;border-radius:50%;background:#FF3B30;animation:cam-pulse 1.4s infinite}
    @keyframes cam-pulse{0%,100%{opacity:1}50%{opacity:.3}}
    .cam-done{position:absolute;top:28px;right:28px}
    .cam-shutter{position:absolute;left:50%;bottom:32px;transform:translateX(-50%);width:88px;height:88px;border-radius:50%;background:#fff;border:6px solid rgba(255,255,255,.5);cursor:pointer}
    .cam-shutter:active{transform:translateX(-50%) scale(.92)}
    .cam-shutter.rec{background:#FF3B30}
    .cam-shutter.vid:not(.rec)::after{content:'';position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:40px;height:40px;border-radius:50%;background:#FF3B30}
    .cam-shutter.wait{opacity:.4;pointer-events:none}
    .cam-shutter.rec::after{content:'';position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:28px;height:28px;border-radius:5px;background:#fff}
    .cam-mode{position:absolute;left:50%;bottom:138px;transform:translateX(-50%);display:flex;gap:8px;background:rgba(0,0,0,.5);border-radius:999px;padding:5px}
    .cam-mode button{border:0;background:transparent;color:#ccc;font-size:18px;font-weight:600;padding:0 28px;border-radius:999px;cursor:pointer;min-height:56px;font-family:inherit}
    .cam-mode button.on{background:#fff;color:#111}
    .cam-timer{position:absolute;left:50%;bottom:44px;margin-left:84px;border:0;background:rgba(0,0,0,.55);color:#fff;border-radius:999px;padding:0 22px;
      min-height:64px;font-size:19px;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap}
    .cam-timer.on{background:#fff;color:#111}
    .cam-time{position:absolute;left:50%;top:28px;transform:translateX(-50%);background:rgba(0,0,0,.5);padding:8px 16px;border-radius:999px;font-size:18px;font-weight:600;display:none}
    .cam-time.soon{background:#C2491F}
    .cam-ok{position:absolute;left:50%;top:28px;transform:translateX(-50%);background:#2F6B4F;color:#fff;padding:0 28px;border-radius:999px;font-size:22px;font-weight:700;
      min-height:56px;display:flex;align-items:center;opacity:0;transition:opacity .3s;pointer-events:none;white-space:nowrap}
    .cam-ok.bad{background:#C2491F}
    .cam-flash{position:absolute;top:0;right:0;bottom:0;left:0;background:#fff;opacity:0;pointer-events:none}
    .cam-flash.go{animation:cam-flash .35s ease-out}
    @keyframes cam-flash{0%{opacity:.9}100%{opacity:0}}
    .cam-count{position:absolute;top:0;right:0;bottom:0;left:0;display:none;align-items:center;justify-content:center;font-size:220px;font-weight:700;text-shadow:0 4px 30px rgba(0,0,0,.6)}
    .cam-saved{position:absolute;bottom:36px;left:28px;max-width:460px;background:rgba(0,0,0,.7);color:#fff;text-decoration:none;border-radius:18px;padding:12px 18px 12px 12px;display:none;gap:14px;align-items:center;font-size:18px;line-height:1.3;min-height:84px}
    .cam-see{font-weight:700;text-decoration:underline;white-space:nowrap}
    .cam-saved img{width:96px;height:72px;object-fit:cover;border-radius:10px;flex:none}
    .cam-wait{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,.55);padding:14px 26px;border-radius:999px;font-size:22px;font-weight:600}
    .cam-idle{position:absolute;left:50%;top:96px;transform:translateX(-50%);background:rgba(0,0,0,.7);padding:14px 26px;border-radius:999px;font-size:20px;font-weight:600;display:none;white-space:nowrap}
    .cam-art{position:absolute;left:50%;top:50%;margin:-215px 0 0 -120px;pointer-events:none}
    .cam-msg{position:absolute;top:0;right:0;bottom:0;left:0;display:none;flex-direction:column;align-items:center;justify-content:center;gap:16px;text-align:center;padding:40px;background:#000}
  </style>
  <div class="cam-root">
    <video class="cam-video" data-video autoplay playsinline muted poster="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"></video>
    <div class="cam-badge"><span class="cam-rec"></span>Camera on</div>
    <a class="cam-done x-btn glass" href="${back()}">Done</a>
    <div class="cam-time" data-time>0:00</div>
    <div class="cam-count" data-count></div>
    <div class="cam-flash" data-flash></div>
    <div class="cam-ok" data-ok></div>
    <div class="cam-art" data-wait-art>${camArt()}</div>
    <div class="cam-wait" data-wait>Starting camera…</div>
    <div class="cam-idle" data-idle></div>
    <a class="cam-saved" data-saved href="#/photos/show/newest"><img data-thumb alt=""><span data-saved-text></span><span class="cam-see" data-see>See it in the Gallery ›</span></a>
    <div class="cam-mode"><button data-m="photo" class="on">Photo</button><button data-m="video">Video</button></div>
    <button class="cam-shutter wait" data-shutter aria-label="Take photo"></button>
    <button class="cam-timer" data-timer></button>
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

  let savedTimer = 0, okTimer = 0;
  /**
   * The box in the corner after a photo or video: what happened, a small copy, and a link.
   * `link`: { href, label } (default: "See it in the Gallery"), or null for none.
   * `stay`: keep it up (used while a video is still being saved).
   */
  function showSaved(text, thumb, ok = true, link, stay) {
    // (Nothing to say when it worked: the big word at the top says so, the link says where.)
    const words = $('[data-saved-text]');
    words.textContent = text;
    words.style.display = text ? '' : 'none';
    const img = $('[data-thumb]');
    img.style.display = thumb ? '' : 'none';
    if (thumb) img.src = thumb;
    // "See it in the Gallery" opens the Gallery's big viewer on the newest one: this one.
    const to = link === undefined ? (ok ? { href: '#/photos/show/newest', label: 'See it in the Gallery ›' } : null) : link;
    const box = $('[data-saved]');
    const see = $('[data-see]');
    see.style.display = to ? '' : 'none';
    if (to) { see.textContent = to.label; box.setAttribute('href', to.href); }
    box.style.pointerEvents = to ? '' : 'none';
    box.style.display = 'flex';
    clearTimeout(savedTimer);
    if (!stay) {
      savedTimer = setTimeout(() => { if (live()) box.style.display = 'none'; }, 7000);
      v.timers.push(savedTimer);
    }
  }
  // ...and a big, plain word at the top that can be read from across the room.
  function flashWord(text, bad) {
    const ok = $('[data-ok]');
    ok.textContent = text;
    ok.classList.toggle('bad', !!bad);
    ok.style.opacity = '1';
    clearTimeout(okTimer);
    okTimer = setTimeout(() => { if (live()) ok.style.opacity = '0'; }, 2500);
    v.timers.push(okTimer);
  }
  // Nothing more fits in the album: say so plainly and offer the way to make room.
  const FULL_TEXT = `The Gallery is full (${ALBUM_MAX})`;
  const MAKE_ROOM = { href: '#/photos/choose', label: 'Make room ›' };

  function setWaiting(on) {
    $('[data-wait]').style.display = on ? '' : 'none';
    $('[data-wait-art]').style.display = on ? '' : 'none';
    $('[data-shutter]').classList.toggle('wait', on);
  }

  function showProblem(text, title = 'The camera isn’t working') {
    setWaiting(false);
    const msg = $('[data-msg]');
    msg.style.display = 'flex';
    msg.innerHTML = `${camArt()}
      <div style="font-size:32px;font-weight:600">${title}</div>
      <div style="font-size:20px;color:#ccc;max-width:720px;line-height:1.4">${text}</div>
      <div style="display:flex;gap:16px;margin-top:8px">
        ${isTablet() ? '<button class="x-btn white" data-retry>Try again</button>' : ''}
        <a class="x-btn frost" href="${back()}">Back</a>
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
          showProblem('It didn’t start.');
        }
      }, 200);
      v.timers.push(poll);
    } catch (err) {
      if (!live()) return;
      const why = (err && err.name) || '';
      log('camera unavailable: ' + why);
      // Say which of the usual reasons it is, so the person knows whether trying again can help.
      if (!isTablet()) showProblem('Open this on the kitchen screen to use its camera.', 'No camera here');
      else if (/NotAllowed|Security|PermissionDenied/.test(why)) showProblem('The screen hasn’t been allowed to use its camera. Switch the screen off and on again and choose “Allow” when it asks.', 'The camera isn’t allowed');
      else if (/NotFound|DevicesNotFound|Overconstrained/.test(why)) showProblem('If Try again doesn’t help, restart the screen.', 'Camera not found');
      else if (/NotReadable|TrackStart|Abort/.test(why)) showProblem('Something else is using it, such as a video call.', 'The camera is busy');
      else showProblem('It may be in use. Try again in a moment.');
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
    // Full already: don't flash and click as if it worked.
    if (albumFull()) { showSaved(FULL_TEXT, null, false, MAKE_ROOM); flashWord('Not saved', true); return; }
    let jpeg = '';
    try {
      const c = document.createElement('canvas');
      c.width = video.videoWidth; c.height = video.videoHeight;
      c.getContext('2d').drawImage(video, 0, 0, c.width, c.height);
      jpeg = c.toDataURL('image/jpeg', 0.9);
    } catch (err) { log('capture failed ' + err); }
    const ok = !!jpeg && (savePhoto(jpeg, `Photo · ${stamp()}`) || !isTablet());
    log('photo ' + video.videoWidth + 'x' + video.videoHeight + ' saved=' + ok);
    shutterSound();
    const flash = $('[data-flash]');
    flash.classList.remove('go'); void flash.offsetWidth; flash.classList.add('go');
    if (ok) { showSaved('', jpeg); flashWord('✓ Photo saved'); }
    else if (albumFull()) { showSaved(FULL_TEXT, jpeg || null, false, MAKE_ROOM); flashWord('Not saved', true); }
    else { showSaved('Please try again', jpeg || null, false); flashWord('Not saved', true); }
  }

  function endCountdown() {
    $('[data-count]').style.display = 'none';
    v.counting = null;
    v.shooting = false;
  }

  function shoot(countdown) {
    if (v.shooting) return;
    v.shooting = true;
    const countEl = $('[data-count]');
    const run = v.counting = {}; // tapping the button again during the countdown stops it
    const tick = (n) => {
      if (v.counting !== run) return;
      if (n > 0) {
        countEl.style.display = 'flex'; countEl.textContent = n; shutterSound();
        later(() => tick(n - 1), 1000);
      } else {
        endCountdown();
        capture();
      }
    };
    tick(countdown);
  }

  // ---- the self-timer button (photo mode only) ----
  let timerSecs = rememberedTimer();
  function renderTimer() {
    const b = $('[data-timer]');
    b.textContent = timerSecs ? `⏱ ${timerSecs} s timer` : '⏱ Timer off';
    b.classList.toggle('on', !!timerSecs);
    b.style.display = v.mode === 'photo' ? '' : 'none';
    b.setAttribute('aria-label', timerSecs ? `Self-timer: ${timerSecs} seconds. Tap to change` : 'Self-timer off. Tap to change');
  }
  $('[data-timer]').onclick = () => {
    timerSecs = TIMERS[(TIMERS.indexOf(timerSecs) + 1) % TIMERS.length];
    try { localStorage.setItem(TIMER_KEY, String(timerSecs)); } catch (e) { /* fine for this visit */ }
    renderTimer();
  };
  renderTimer();

  const fmt = (ms) => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

  async function startRec() {
    if (!v.ready || v.recorder || v.starting) return;
    const type = ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
      .find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t));
    if (!type) { showSaved('Video isn’t supported on this screen', null, false); return; }
    // A whole minute of filming that then can't be kept would be a sad surprise: say so first.
    if (albumFull()) { showSaved(FULL_TEXT, null, false, MAKE_ROOM); flashWord('Not recording', true); return; }
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
      // A minute of video takes a few seconds to put away: say so, so nobody thinks it's lost.
      if (live()) showSaved('Saving the video…', null, false, null, true);
      try {
        const b64 = await blobToBase64(new Blob(chunks, { type }));
        const ok = saveVideo(b64, `Video · ${stamp()}`);
        log('video ' + Math.round(b64.length * 0.75 / 1024) + ' KB saved=' + ok);
        if (!live()) return;
        if (ok || !isTablet()) { showSaved('', null, true); flashWord('✓ Video saved'); }
        else if (albumFull()) { showSaved(FULL_TEXT, null, false, MAKE_ROOM); flashWord('Video not saved', true); }
        else { showSaved('It may be too big: try a shorter one', null, false); flashWord('Video not saved', true); }
      } catch (err) {
        log('video save failed ' + err);
        if (live()) { showSaved('Please try again', null, false); flashWord('Video not saved', true); }
      }
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
      const took = Date.now() - v.recStart;
      const left = Math.ceil((MAX_VIDEO_MS - took) / 1000);
      // The last ten seconds turn red and count down, so it doesn't stop by surprise.
      const t = $('[data-time]');
      t.textContent = left <= 10 ? `${fmt(took)} / ${fmt(MAX_VIDEO_MS)} · stops in ${Math.max(0, left)}` : `${fmt(took)} / ${fmt(MAX_VIDEO_MS)}`;
      t.classList.toggle('soon', left <= 10);
      if (took >= MAX_VIDEO_MS) stopRec();
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
    $('[data-time]').classList.remove('soon');
  }

  function setMode(m) {
    if (v.recorder) stopRec();
    if (v.counting) endCountdown(); // switching to video stops a photo countdown
    v.mode = m;
    renderTimer();
    el.querySelectorAll('[data-m]').forEach((b) => b.classList.toggle('on', b.dataset.m === m));
    // Video mode shows a red record dot on the button, so it's clear it films rather than snaps.
    const btn = $('[data-shutter]');
    btn.classList.toggle('vid', m === 'video');
    btn.setAttribute('aria-label', m === 'video' ? 'Start recording' : 'Take photo');
  }

  $('[data-shutter]').onclick = () => {
    if (v.mode === 'photo' && v.counting) { endCountdown(); flashWord('Timer stopped', true); }
    else if (v.mode === 'photo') shoot(timerSecs);
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
