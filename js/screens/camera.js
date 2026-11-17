// Camera: full-screen live viewfinder. Photos save to this tablet's album.
//
// The point of this screen is the remote group photo: your dashboard opens it on
// the tablet (so your "their screen" picture shows the live camera), everyone gets
// in frame, and you tap "Take photo" — a 3-2-1 countdown runs, then it snaps.
// A "Camera on" badge and shutter sound mean nobody is ever filmed unawares.
// There's also a shutter button for whoever is standing at the tablet.
import { profile } from '../config.js';
import { savePhoto, saveVideo, isTablet } from '../services/tablet-photos.js';

const MAX_VIDEO_MS = 60 * 1000; // keep clips small enough to store
let stream, beepCtx, shooting = false, onShoot, onRec;
let recorder, chunks = [], recTimer, recStart;
const back = () => `#/${profile === 'tom' ? 'bridge' : 'home'}`;

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
  } catch { /* no audio (hidden session) */ }
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
    .cam-shutter.rec::after{content:'';position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:28px;height:28px;border-radius:5px;background:#fff}
    .cam-mode{position:absolute;left:50%;bottom:140px;transform:translateX(-50%);display:flex;gap:8px;background:rgba(0,0,0,.5);border-radius:999px;padding:5px}
    .cam-mode button{border:0;background:transparent;color:#bbb;font-size:16px;font-weight:600;padding:8px 18px;border-radius:999px;cursor:pointer}
    .cam-mode button.on{background:#fff;color:#111}
    .cam-time{position:absolute;left:50%;top:28px;transform:translateX(-50%);background:rgba(0,0,0,.5);padding:8px 16px;border-radius:999px;font-size:18px;font-weight:600;display:none}
    .cam-flash{position:absolute;top:0;right:0;bottom:0;left:0;background:#fff;opacity:0;pointer-events:none}
    .cam-flash.go{animation:cam-flash .35s ease-out}
    @keyframes cam-flash{0%{opacity:.9}100%{opacity:0}}
    .cam-count{position:absolute;top:0;right:0;bottom:0;left:0;display:none;align-items:center;justify-content:center;font-size:220px;font-weight:700;text-shadow:0 4px 30px rgba(0,0,0,.6)}
    .cam-saved{position:absolute;bottom:40px;left:28px;background:rgba(0,0,0,.6);border-radius:16px;padding:10px;display:none;gap:12px;align-items:center}
    .cam-saved img{width:72px;height:54px;object-fit:cover;border-radius:8px}
    .cam-msg{position:absolute;top:0;right:0;bottom:0;left:0;display:none;flex-direction:column;align-items:center;justify-content:center;gap:16px;text-align:center;padding:40px}
  </style>
  <div class="cam-root">
    <video class="cam-video" data-video autoplay playsinline muted></video>
    <div class="cam-badge"><span class="cam-rec"></span>Camera on</div>
    <a class="cam-done" href="${back()}">Done</a>
    <div class="cam-count" data-count></div>
    <div class="cam-flash" data-flash></div>
    <div class="cam-saved" data-saved><img data-thumb alt=""><div style="font-size:15px" data-saved-text>Saved to photos</div></div>
    <div class="cam-time" data-time>0:00</div>
    <div class="cam-mode">
      <button data-m="photo" class="on">Photo</button>
      <button data-m="video">Video</button>
    </div>
    <button class="cam-shutter" data-shutter aria-label="Take photo"></button>
    <div class="cam-msg" data-msg></div>
  </div>`;

  const $ = (s) => el.querySelector(s);
  const video = $('[data-video]');

  let mode = 'photo';

  (async function start() {
    try {
      // Audio too, so videos have sound. The viewfinder is muted (no feedback).
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: true });
      video.srcObject = stream;
    } catch (err) {
      console.error(err);
      $('[data-msg]').style.display = 'flex';
      $('[data-msg]').innerHTML = `<div style="font-size:32px;font-weight:600">Camera unavailable</div>
        <div style="font-size:20px;color:#bbb">${isTablet() ? 'The camera is turned off or already in use.' : 'Open this on the tablet to use its camera.'}</div>
        <a class="cam-done" href="${back()}" style="position:static;margin-top:8px">Back</a>`;
    }
  })();

  const log = (m) => { try { window.TabletNative && window.TabletNative.log && window.TabletNative.log(m); } catch { /* not on tablet */ } };

  function capture(tries = 0) {
    if (!stream) { log('capture: no stream'); return; }
    if (!video.videoWidth) {
      if (tries < 20) return void setTimeout(() => capture(tries + 1), 150); // wait for the first frame
      log('capture: video never got dimensions'); return;
    }
    log('capture: ' + video.videoWidth + 'x' + video.videoHeight);
    const c = document.createElement('canvas');
    c.width = video.videoWidth; c.height = video.videoHeight;
    c.getContext('2d').drawImage(video, 0, 0, c.width, c.height);
    const jpeg = c.toDataURL('image/jpeg', 0.9);
    const ok = savePhoto(jpeg, `Photo · ${new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`);
    log('capture: jpeg ' + jpeg.length + ' chars, saved=' + ok);
    shutterSound();
    const flash = $('[data-flash]');
    flash.classList.remove('go'); void flash.offsetWidth; flash.classList.add('go');
    $('[data-thumb]').src = jpeg;
    $('[data-saved]').style.display = 'flex';
    setTimeout(() => { $('[data-saved]').style.display = 'none'; }, 3500);
  }

  async function shoot(countdown = 0) {
    log('shoot countdown=' + countdown + ' shooting=' + shooting);
    if (shooting) return;
    shooting = true;
    const countEl = $('[data-count]');
    for (let n = countdown; n > 0; n--) {
      countEl.style.display = 'flex'; countEl.textContent = n; shutterSound();
      await new Promise((r) => setTimeout(r, 1000));
      if (!el.isConnected) { shooting = false; return; }
    }
    countEl.style.display = 'none';
    capture();
    shooting = false;
  }

  function fmt(ms) { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }

  function startRec() {
    if (!stream || recorder) return;
    const type = ['video/mp4', 'video/webm;codecs=vp8,opus', 'video/webm'].find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t));
    if (!type) { $('[data-saved-text]').textContent = 'Video not supported here'; $('[data-saved]').style.display = 'flex'; return; }
    chunks = [];
    recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 2500000 });
    recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    recorder.onstop = async () => {
      const blob = new Blob(chunks, { type });
      const buf = await blob.arrayBuffer();
      let bin = ''; const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      saveVideo(btoa(bin), `Video · ${new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`);
      $('[data-thumb]').src = '';
      $('[data-saved-text]').textContent = 'Video saved to photos';
      $('[data-saved]').style.display = 'flex';
      setTimeout(() => { $('[data-saved]').style.display = 'none'; }, 3500);
    };
    recorder.start();
    recStart = Date.now();
    shutterSound();
    $('[data-shutter]').classList.add('rec');
    $('[data-time]').style.display = 'block';
    recTimer = setInterval(() => {
      $('[data-time]').textContent = fmt(Date.now() - recStart);
      if (Date.now() - recStart >= MAX_VIDEO_MS) stopRec();
    }, 250);
  }

  function stopRec() {
    if (!recorder) return;
    clearInterval(recTimer);
    try { recorder.stop(); } catch { /* already stopped */ }
    recorder = null;
    $('[data-shutter]').classList.remove('rec');
    $('[data-time]').style.display = 'none';
  }

  function setMode(m) {
    if (recorder) stopRec();
    mode = m;
    el.querySelectorAll('[data-m]').forEach((b) => b.classList.toggle('on', b.dataset.m === m));
  }

  $('[data-shutter]').onclick = () => {
    if (mode === 'photo') shoot(0);
    else if (recorder) stopRec();
    else startRec();
  };
  el.querySelectorAll('[data-m]').forEach((b) => b.onclick = () => setMode(b.dataset.m));

  // Dashboard's remote shutter: a countdown so everyone can get in frame.
  onShoot = (e) => { setMode('photo'); shoot((e.detail && e.detail.countdown) || 3); };
  window.addEventListener('tablet-camera-shoot', onShoot);
  // Dashboard's remote video: start/stop recording.
  onRec = (e) => {
    const on = e.detail && e.detail.on;
    if (on) { setMode('video'); startRec(); } else stopRec();
  };
  window.addEventListener('tablet-camera-record', onRec);
}

export function unmount() {
  clearInterval(recTimer);
  if (recorder) { try { recorder.stop(); } catch { /* ignore */ } recorder = null; }
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = null;
  shooting = false;
  if (onShoot) window.removeEventListener('tablet-camera-shoot', onShoot);
  if (onRec) window.removeEventListener('tablet-camera-record', onRec);
}
