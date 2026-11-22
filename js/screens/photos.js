// Gallery: every photo and video on this screen (board KP05 of the November 2026 redesign).
// A ring for each person who sends photos, above a river of photos that flows week by week,
// newest on the left. Home is the photo frame now: it shows the photos that are "on Home"
// (js/services/rotation.js), and this is where the household looks through them, adds,
// removes and chooses which ones take their turn there.
//
// Tap a photo for the big viewer (swipe or the arrows for the others, the caption, who sent
// it, Remove, and the "Shows on Home" switch). "Choose" picks several at once.
//
// Routes: #/photos            the Gallery
//         #/photos/album      the same (older links)
//         #/photos/choose     opens with "Choose" already on (to make room when it is full)
//         #/photos/show/<id>  opens the viewer on that one ("newest" for the newest)
import { esc, topBar, people, avatar, phoneCode, wirePhoneCodes } from './ui.js';
// On the kitchen screen: its own album (sent from phones, see addphotos.js).
// In a normal browser: sample pictures, so the screen can still be previewed.
import { photos as samplePhotos } from '../services/family-sample.js';
import {
  isTablet, getPhotos, onPhotosChanged, canRemovePhotos, removePhoto, removePhotos, thumbnail,
} from '../services/tablet-photos.js';
import { inRotation, setRotation, tidyRotation, onRotationChanged } from '../services/rotation.js';
import { feature } from '../services/features.js';
import { framesArt } from '../art.js';

let toastTimer, offPhotos, offRotation, stopCodes, stopView, io;
let alive = null; // this visit's marker: chunked building stops when it changes

const DAY = 864e5;
const CHUNK = 40;        // tiles built per step (the album can hold 500)
const COL = 210, ROW = 240, GAP = 12; // the river's grid: two rows of tiles
const HERE = '\u0000here'; // the "person" for photos with no name: taken with this screen's camera

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const keyOf = (name) => String(name || '').trim().toLowerCase() || HERE;

const HOUSE = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" fill="currentColor"/></svg>';
const HOUSE_OFF = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4 3l16 19" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
const CAMERA = '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M8.5 5l1.2-2h4.6l1.2 2H19a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" fill="currentColor"/><circle cx="12" cy="12.5" r="4" fill="#F6F1E9"/></svg>';

// Weeks start on Sunday, like the calendar on the wall.
function weekStart(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d.getTime();
}
function weekLabel(start, thisWeek) {
  if (start === thisWeek) return 'This week';
  if (start === weekStart(thisWeek - 3 * DAY)) return 'Last week';
  const a = new Date(start);
  const b = new Date(start); b.setDate(b.getDate() + 6);
  const month = (d, long) => d.toLocaleDateString('en-US', { month: long ? 'long' : 'short' });
  const year = b.getFullYear() !== new Date().getFullYear() ? `, ${b.getFullYear()}` : '';
  return a.getMonth() === b.getMonth()
    ? `${month(a, true)} ${a.getDate()}–${b.getDate()}${year}`
    : `${month(a)} ${a.getDate()} – ${month(b)} ${b.getDate()}${year}`;
}

function loadAlbum() {
  const list = isTablet()
    ? getPhotos()
    : samplePhotos.map((p) => ({ ...p, name: p.addedBy, title: `${p.title}: ${p.caption}`, line: `Added by ${p.addedBy} · ${p.day}` }));
  return list.sort((a, b) => (b.added || 0) - (a.added || 0)); // newest first
}

export function mount(el, { args = [] } = {}) {
  const visit = alive = {};
  const canRemove = canRemovePhotos();
  const hasCamera = feature('camera');
  let album = loadAlbum();
  let who = null;          // null: everyone; otherwise a person's key
  let homeFilter = 'all';  // 'all' | 'on' | 'off'
  let picking = false;
  let picked = {};         // id -> true
  let fresh = {};          // ids that arrived while the Gallery was open (they glow)
  let rings = [];
  let lastSeen = null;     // the photo the viewer last showed (outlined in the river)
  // The viewer
  let viewing = false, vList = [], vIndex = 0, vVideo = null, preload = null;
  let askIds = [];

  el.innerHTML = `
  <style>
    .ga-root{position:absolute;top:0;right:0;bottom:0;left:0;background:#F6F1E9;color:#22303F;overflow:hidden;--accent:#E0663A;
      display:flex;flex-direction:column;padding:26px 0 0;font-family:Inter,system-ui,sans-serif}
    .ga-pad{padding:0 40px}
    .ga-root .x-btn.white{box-shadow:0 2px 8px rgba(34,48,63,.08)}
    .ga-count{text-align:right;line-height:1.3;flex:none}
    .ga-count b{display:block;font:600 18px Inter,sans-serif}
    .ga-count span{font-size:16px;color:#6E7B89}
    /* ---- people ---- */
    .ga-row{display:flex;align-items:flex-start;gap:24px;height:128px;margin-top:14px;flex:none}
    .ga-rings{flex:1;min-width:0;display:flex;gap:14px;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;padding:5px 4px 0}
    .ga-ring{flex:none;width:104px;border:0;background:transparent;padding:0;font-family:inherit;color:inherit;cursor:pointer;text-align:center;position:relative}
    .ga-face{display:block;width:78px;height:78px;border-radius:39px;margin:9px auto 0;background:#D5DCE3 center/cover no-repeat;position:relative;overflow:hidden}
    .ga-face.all{background:#22303F;color:#fff;font:700 22px Outfit,sans-serif;display:flex;align-items:center;justify-content:center}
    .ga-face.quiet{box-shadow:inset 0 0 0 4px #D5DCE3}
    .ga-dash{position:absolute;left:4px;top:0;width:96px;height:96px;pointer-events:none}
    .ga-dash.spin{animation:ga-spin 14s linear infinite;will-change:transform}
    @keyframes ga-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
    .ga-rname{display:block;font:600 16px Inter,sans-serif;margin-top:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .ga-rname i{font-style:normal;color:#E0663A}
    .ga-ring.quiet .ga-rname{color:#6E7B89}
    .ga-ring.on .ga-face{box-shadow:0 0 0 4px #22303F}
    .ga-ring.on .ga-rname{font-weight:700;color:#22303F}
    .ga-side{flex:none;width:452px;display:flex;flex-direction:column;gap:8px;padding-top:5px}
    .ga-seg{display:flex;background:#fff;border-radius:999px;padding:4px;box-shadow:0 2px 8px rgba(34,48,63,.08)}
    .ga-seg button{flex:1;border:0;background:transparent;color:#22303F;font:600 17px Inter,sans-serif;min-height:56px;border-radius:999px;cursor:pointer;white-space:nowrap;padding:0 10px}
    .ga-seg button.on{background:#22303F;color:#fff}
    .ga-note{font-size:16px;line-height:1.35;color:#4D5B6A;padding:0 8px;overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2}
    .ga-note b{color:#E0663A}
    /* ---- choosing several ---- */
    .ga-pick{display:none;align-items:center;gap:12px;height:128px;margin-top:14px;flex:none}
    .ga-root.picking .ga-pick{display:flex}
    .ga-root.picking .ga-row{display:none}
    .ga-picked{flex:1;min-width:0;font:500 26px Outfit,sans-serif}
    .ga-picked small{display:block;font:400 16px Inter,sans-serif;color:#6E7B89;margin-top:2px}
    .ga-danger{background:#B8401A;color:#fff}
    /* ---- the river ---- */
    .ga-river{flex:1;min-height:0;position:relative;display:flex;gap:34px;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;padding:12px 150px 0 40px}
    .ga-week{flex:none}
    .ga-wlabel{font:700 15px Inter,sans-serif;letter-spacing:2px;text-transform:uppercase;color:#6E7B89;margin-bottom:12px;white-space:nowrap}
    .ga-week.now .ga-wlabel{color:#E0663A}
    .ga-grid{display:grid;grid-auto-flow:column dense;grid-template-rows:${ROW}px ${ROW}px;grid-auto-columns:${COL}px;grid-gap:${GAP}px}
    .ga-tile{position:relative;border:0;padding:0;background:#DDD5C8;border-radius:22px;overflow:hidden;cursor:pointer;font-family:inherit;color:#fff;display:block;width:100%;height:100%}
    .ga-tile.wide{grid-column:span 2}
    .ga-tile.hero{grid-column:span 2;grid-row:span 2}
    .ga-tile.tall{grid-row:span 2}
    .ga-img{position:absolute;top:0;right:0;bottom:0;left:0;background:center/cover no-repeat}
    .ga-tile.off .ga-img{opacity:.5}
    .ga-home{position:absolute;top:10px;left:10px;width:38px;height:38px;border-radius:19px;background:#E0663A;color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 2px rgba(255,255,255,.9)}
    .ga-tile.off .ga-home{background:rgba(34,48,63,.82);color:#D5DCE3}
    .ga-home .no{display:none}
    .ga-tile.off .ga-home .yes{display:none}
    .ga-tile.off .ga-home .no{display:block}
    .ga-who{position:absolute;left:10px;bottom:10px;display:flex;align-items:center;gap:8px;max-width:calc(100% - 20px)}
    .ga-who > span:first-child{box-shadow:0 0 0 2px rgba(255,255,255,.9)}
    .ga-chip{background:rgba(255,255,255,.92);color:#22303F;border-radius:999px;padding:7px 14px;font:600 16px Inter,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
    .ga-vid{position:absolute;right:10px;top:10px;background:#22303F;color:#fff;border-radius:999px;padding:6px 12px;font:600 15px Inter,sans-serif}
    .ga-broken{position:absolute;top:0;right:0;bottom:0;left:0;display:flex;align-items:center;justify-content:center;text-align:center;font-size:16px;padding:12px;color:#4D5B6A}
    .ga-tick{position:absolute;right:10px;bottom:10px;width:44px;height:44px;border-radius:22px;border:3px solid #fff;background:rgba(34,48,63,.45);display:none;align-items:center;justify-content:center;font:700 24px Inter,sans-serif;color:#fff}
    .ga-root.picking .ga-tick{display:flex}
    .ga-root.picking .ga-who{max-width:calc(100% - 76px)}
    .ga-tile.sel .ga-tick{background:#E0663A;border-color:#E0663A}
    .ga-tile.sel::before,.ga-tile.cur::before,.ga-tile.new::after{content:'';position:absolute;top:0;right:0;bottom:0;left:0;border-radius:22px;pointer-events:none;z-index:1}
    .ga-tile.cur::before{box-shadow:inset 0 0 0 4px #22303F}
    .ga-tile.sel::before{box-shadow:inset 0 0 0 5px #E0663A}
    .ga-tile.new::after{box-shadow:inset 0 0 0 5px #E0663A;animation:ga-new 2.4s ease-in-out infinite}
    @keyframes ga-new{0%,100%{opacity:1}50%{opacity:.25}}
    .ga-fade{position:absolute;right:0;bottom:0;width:130px;height:560px;background:linear-gradient(90deg,rgba(246,241,233,0),#F6F1E9);pointer-events:none}
    .ga-older{position:absolute;right:36px;bottom:22px;font:600 16px Inter,sans-serif;color:#6E7B89;pointer-events:none;transition:opacity .4s}
    .ga-newest{position:absolute;left:40px;bottom:18px;display:none;box-shadow:0 4px 14px rgba(34,48,63,.25)}
    .ga-empty{flex:1;display:none;align-items:center;justify-content:center;gap:56px;padding:0 40px 30px}
    .ga-none{flex:1;display:none;flex-direction:column;align-items:center;justify-content:center;gap:16px;text-align:center;padding-bottom:40px}
    /* ---- the big viewer ---- */
    .ga-view{display:none;position:absolute;top:0;right:0;bottom:0;left:0;background:#14171C;color:#fff;z-index:6}
    .ga-stage{position:absolute;top:104px;right:0;bottom:136px;left:0}
    .ga-pic{position:absolute;top:0;right:110px;bottom:0;left:110px;background:center/contain no-repeat}
    .ga-pic.art{top:10px;bottom:10px;right:190px;left:190px;border-radius:26px;background-size:cover}
    .ga-stage video{position:absolute;top:0;left:110px;width:1060px;height:100%;object-fit:contain;background:#000}
    .ga-sample{position:absolute;left:0;right:0;top:44%;text-align:center;font:500 22px Inter,sans-serif}
    .ga-sample span{background:rgba(16,18,26,.6);border-radius:999px;padding:12px 24px}
    .ga-wont{position:absolute;top:26%;left:14%;right:14%;text-align:center;display:flex;flex-direction:column;gap:12px;align-items:center}
    .ga-vtop{position:absolute;top:26px;left:40px;right:40px;display:flex;align-items:center;gap:14px}
    .ga-vcount{flex:1;font:500 20px Inter,sans-serif;color:#C9D0D8;padding-left:6px}
    .ga-arrow{position:absolute;top:50%;margin-top:-52px;width:76px;height:76px;border-radius:38px;border:0;background:rgba(255,255,255,.14);color:#fff;font:300 46px/1 Outfit,sans-serif;cursor:pointer;
      display:flex;align-items:center;justify-content:center;padding-bottom:6px}
    .ga-vbar{position:absolute;left:0;right:0;bottom:0;min-height:136px;background:#1D2229;display:flex;align-items:center;gap:20px;padding:16px 40px}
    .ga-vcap{flex:1;min-width:0;border:0;background:transparent;color:#fff;font-family:inherit;text-align:left;padding:0;cursor:pointer;min-height:64px}
    .ga-vtitle{font:500 26px/1.2 Outfit,sans-serif;overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2}
    .ga-vline{font-size:18px;color:#C9D0D8;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .ga-vmore{display:none;font:600 16px Inter,sans-serif;background:rgba(255,255,255,.16);border-radius:999px;padding:5px 14px;margin-top:6px}
    .ga-vbar.open{align-items:flex-start}
    .ga-vbar.open .ga-vtitle{display:block;max-height:330px;overflow-y:auto}
    .ga-switch{flex:none;border:0;cursor:pointer;font:600 20px Inter,sans-serif;min-height:72px;border-radius:999px;padding:0 14px 0 24px;display:flex;align-items:center;gap:14px;
      background:rgba(255,255,255,.12);color:#C9D0D8}
    .ga-switch.on{background:#E0663A;color:#fff}
    .ga-track{width:68px;height:40px;border-radius:20px;background:rgba(0,0,0,.3);position:relative;flex:none}
    .ga-knob{position:absolute;top:4px;left:4px;width:32px;height:32px;border-radius:16px;background:#fff;transition:transform .2s}
    .ga-switch.on .ga-knob{transform:translateX(28px)}
    /* ---- questions and little messages ---- */
    .ga-ask{display:none;position:absolute;top:0;right:0;bottom:0;left:0;background:rgba(10,12,16,.62);align-items:center;justify-content:center;z-index:8}
    .ga-toast{position:absolute;bottom:152px;left:50%;transform:translateX(-50%);background:rgba(16,18,26,.92);color:#fff;border-radius:999px;padding:10px 12px 10px 28px;
      font:600 20px Inter,sans-serif;display:flex;align-items:center;gap:16px;white-space:nowrap;opacity:0;pointer-events:none;transition:opacity .4s;z-index:9;min-height:64px}
    .ga-toast.plain{padding-right:28px}
    .ga-toast button{border:0;background:#fff;color:#1D2430;border-radius:999px;font:700 18px Inter,sans-serif;min-height:56px;padding:0 24px;cursor:pointer}
    @media (prefers-reduced-motion: reduce){.ga-dash.spin,.ga-tile.new::after{animation:none}.ga-knob{transition:none}}
  </style>
  <div class="ga-root" data-root>
    <div class="ga-pad">
      ${topBar({ title: 'Gallery', tone: 'light', right: `
        <div class="ga-count" data-count></div>
        <button class="x-btn white" data-pick>Choose</button>
        ${hasCamera ? `<a class="x-btn white" href="#/camera/gallery">${CAMERA} Camera</a>` : ''}
        <a class="x-btn accent" href="#/addphotos">+ Add photos</a>` })}
      <div class="ga-row">
        <div class="ga-rings" data-rings></div>
        <div class="ga-side">
          <div class="ga-seg" data-seg>
            <button data-f="all">All</button><button data-f="on">On Home</button><button data-f="off">Not on Home</button>
          </div>
          <div class="ga-note" data-note></div>
        </div>
      </div>
      <div class="ga-pick">
        <div class="ga-picked" data-picked></div>
        <button class="x-btn white" data-pick-all>Choose all</button>
        <button class="x-btn ink" data-pick-on disabled>${HOUSE} Show on Home</button>
        <button class="x-btn white" data-pick-off disabled>Take off Home</button>
        ${canRemove ? '<button class="x-btn ga-danger" data-pick-remove disabled>Remove</button>' : ''}
        <button class="x-btn line" data-pick-done>Done</button>
      </div>
    </div>
    <div class="ga-river" data-river></div>
    <div class="ga-fade" data-fade aria-hidden="true"></div>
    <div class="ga-older" data-older>Swipe for older →</div>
    <button class="x-btn ink sm ga-newest" data-newest>← Back to the newest</button>
    <div class="ga-none" data-none>
      <div style="font:500 34px Outfit,sans-serif" data-none-title></div>
      <div style="font-size:19px;color:#4D5B6A;max-width:640px;line-height:1.4" data-none-line></div>
      <button class="x-btn ink" data-none-all>Show every photo</button>
    </div>
    <div class="ga-empty" data-empty>
      <div style="display:flex;flex-direction:column;gap:16px;max-width:560px">
        <div style="width:300px">${framesArt()}</div>
        <div style="font:500 44px Outfit,sans-serif">No photos yet</div>
        <div style="font-size:20px;line-height:1.4;color:#4D5B6A">Send some from a phone on the same Wi-Fi${hasCamera ? ', or take one right here' : ''}. They show up here, and take turns on Home.</div>
        <div style="display:flex;gap:14px;margin-top:6px">
          <a href="#/addphotos" class="x-btn accent">+ Add photos</a>
          ${hasCamera ? `<a href="#/camera/gallery" class="x-btn white">${CAMERA} Take a photo</a>` : ''}
        </div>
      </div>
      ${phoneCode({ tab: 'photos', size: 220, tone: 'light', column: true })}
    </div>

    <div class="ga-view" data-view>
      <div class="ga-stage" data-stage></div>
      <div class="ga-vtop">
        <button class="x-btn glass" data-vclose>← Gallery</button>
        <div class="ga-vcount" data-vcount></div>
        <button class="x-btn glass" data-vsound style="display:none"></button>
        ${canRemove ? '<button class="x-btn glass" data-vremove>Remove</button>' : ''}
      </div>
      <button class="ga-arrow" data-vprev style="left:22px" aria-label="The photo before">‹</button>
      <button class="ga-arrow" data-vnext style="right:22px" aria-label="The next photo">›</button>
      <div class="ga-vbar" data-vbar>
        <div data-vwho style="flex:none;display:flex"></div>
        <button class="ga-vcap" data-vcap aria-label="Read the whole caption">
          <div class="ga-vtitle" data-vtitle></div>
          <div class="ga-vline" data-vline></div>
          <span class="ga-vmore" data-vmore>Read all ›</span>
        </button>
        <button class="ga-switch" data-vhome role="switch">${HOUSE}<span data-vhome-text></span><span class="ga-track"><span class="ga-knob"></span></span></button>
      </div>
    </div>

    <div class="ga-ask" data-ask>
      <div style="background:#fff;color:#1D2430;border-radius:28px;padding:34px 40px;max-width:580px;text-align:center">
        <div data-ask-title style="font:500 32px Outfit,sans-serif">Remove this photo?</div>
        <div data-ask-line style="font-size:19px;line-height:1.4;color:#4A5363;margin-top:10px"></div>
        <div style="display:flex;gap:12px;justify-content:center;margin-top:24px">
          <button data-keep class="x-btn line">Keep</button>
          <button data-really class="x-btn ga-danger">Remove</button>
        </div>
      </div>
    </div>
    <div class="ga-toast" data-toast></div>
  </div>`;

  const $ = (s) => el.querySelector(s);
  const root = $('[data-root]');
  const river = $('[data-river]');
  const viewEl = $('[data-view]');
  const stage = $('[data-stage]');
  const askEl = $('[data-ask]');
  stopCodes = wirePhoneCodes(el);

  // ---- Little messages at the bottom ("New photo from Priya", "Removed") ----
  let toastRun = null;
  function hideToast() {
    const t = $('[data-toast]');
    t.style.opacity = '0';
    t.style.pointerEvents = 'none';
    toastRun = null;
  }
  function toast(text, action) {
    const t = $('[data-toast]');
    t.innerHTML = `<span>${esc(text)}</span>${action ? `<button>${esc(action.label)}</button>` : ''}`;
    t.classList.toggle('plain', !action);
    t.style.opacity = '1';
    t.style.pointerEvents = action ? 'auto' : 'none';
    toastRun = action ? action.run : null;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, action ? 15000 : 4500);
  }
  $('[data-toast]').addEventListener('click', (e) => {
    if (e.target.closest('button') && toastRun) { const run = toastRun; hideToast(); run(); }
  });

  // ---- Which photos are showing ----
  const byPerson = (p) => who === null || keyOf(p.name) === who;
  const byHome = (p) => homeFilter === 'all' || inRotation(p.id) === (homeFilter === 'on');
  const visible = () => album.filter((p) => byPerson(p) && byHome(p));
  const noun = (list) => {
    const vids = list.filter((p) => p.video).length;
    return vids === list.length && vids ? 'video' : vids ? 'photos and videos' : 'photo';
  };
  const count = (list) => (noun(list) === 'photos and videos' ? `${list.length} photos and videos` : plural(list.length, noun(list)));

  // ---- The top: how many, and the rings ----
  function renderCount() {
    const thisWeek = weekStart(Date.now());
    const fresh7 = album.filter((p) => (p.added || 0) >= thisWeek).length;
    const onHome = album.filter((p) => inRotation(p.id)).length;
    $('[data-count]').innerHTML = album.length
      ? `<b>${esc(count(album))}${fresh7 ? ` · ${fresh7} new this week` : ''}</b><span>${onHome === album.length ? 'All of them show on Home' : `${onHome} on Home`}</span>`
      : '';
    $('[data-pick]').style.display = album.length ? '' : 'none';
    const off = album.length - onHome;
    const seg = $('[data-seg]');
    seg.querySelector('[data-f="on"]').textContent = `On Home · ${onHome}`;
    seg.querySelector('[data-f="off"]').textContent = `Not on Home · ${off}`;
    [...seg.children].forEach((b) => b.classList.toggle('on', b.dataset.f === homeFilter));
  }

  /** Everyone who lives here, and everyone who has ever sent a photo. */
  function renderRings() {
    const thisWeek = weekStart(Date.now());
    const map = {};
    const order = [];
    const add = (name, key) => {
      if (!map[key]) { map[key] = { key, name, total: 0, week: 0, latest: null }; order.push(map[key]); }
      return map[key];
    };
    people().forEach((p) => add(p.name, keyOf(p.name)));
    album.forEach((p) => { // (newest first, so the first one seen is each person's latest)
      const key = keyOf(p.name);
      const r = add(key === HERE ? 'Taken here' : String(p.name).trim(), key);
      r.total++;
      if ((p.added || 0) >= thisWeek) r.week++;
      if (!r.latest) r.latest = p;
    });
    // Whoever sent something this week comes first (most first); the rest stay in their order.
    rings = order.map((r, i) => ({ r, i })).sort((a, b) => (b.r.week - a.r.week) || (a.i - b.i)).map((x) => x.r);
    if (who !== null && !map[who]) who = null; // the person's last photo went
    const top = rings[0] && rings[0].week > 0 && (!rings[1] || rings[1].week < rings[0].week) ? rings[0] : null;
    const dash = (spin) => `<svg class="ga-dash${spin ? ' spin' : ''}" viewBox="0 0 96 96" aria-hidden="true"><circle cx="48" cy="48" r="45" fill="none" stroke="#E0663A" stroke-width="4" stroke-dasharray="40 14"/></svg>`;
    const box = $('[data-rings]');
    box.innerHTML = `<button class="ga-ring${who === null ? ' on' : ''}" data-ring="-1"><span class="ga-face all">All</span><span class="ga-rname">Everyone</span></button>`
      + rings.map((r, i) => {
        const face = r.key === HERE
          ? '<span class="ga-face" data-face style="background-color:#22303F"></span>'
          : (r.latest ? '<span class="ga-face" data-face></span>'
            : `<span class="ga-face" style="background:none">${avatar(r.name, 78)}</span>`);
        return `<button class="ga-ring${who === r.key ? ' on' : ''}${r.week ? '' : ' quiet'}" data-ring="${i}" aria-label="${esc(r.name)}: ${plural(r.total, 'photo')}">
          ${r.week ? dash(r === top) : ''}${face}
          <span class="ga-rname">${esc(r.name)}${r.week ? ` <i>${r.week}</i>` : ''}</span></button>`;
      }).join('');
    // Each ring shows that person's latest picture.
    rings.forEach((r, i) => {
      const face = box.querySelector(`[data-ring="${i}"] [data-face]`);
      const p = r.latest;
      if (!face || !p) return;
      if (!r.week) face.classList.add('quiet');
      if (!p.src) { if (p.art) face.style.background = p.art; return; }
      if (p.video) return;
      thumbnail(p.src, { w: 96, h: 96 }).then((url) => { if (url && face.isConnected) face.style.backgroundImage = `url(${url})`; });
    });
    renderNote(top);
  }

  // A kind line beside the rings: who sent the most this week, and (gently) who has gone quiet.
  function renderNote(top) {
    const parts = [];
    if (top && rings.filter((r) => r.week).length > 1) parts.push(`<b>${esc(top.name)}</b> sent the most this week (${top.week}).`);
    const now = Date.now();
    const quiet = rings
      .filter((r) => r.key !== HERE && r.latest && r.latest.added && now - r.latest.added > 30 * DAY)
      .sort((a, b) => a.latest.added - b.latest.added)[0];
    if (quiet) {
      const since = new Date(quiet.latest.added).toLocaleDateString('en-US', { month: 'long' });
      parts.push(`Nothing new from ${esc(quiet.name)} since ${since}. Maybe ask for one?`);
    }
    if (!parts.length && album.length) parts.push('The house marks the photos that take their turn on Home.');
    $('[data-note]').innerHTML = parts.join(' ');
  }

  // ---- The river ----
  function loadThumb(b) {
    if (b.__queued || b.__done) return;
    b.__queued = true;
    thumbnail(b.__src, { w: b.__w, h: b.__h, wanted: () => el.isConnected && b.isConnected && b.__seen })
      .then((url) => {
        b.__queued = false;
        if (url === null || !b.isConnected) return; // swiped past before its turn: tried again when it's back
        b.__done = true;
        if (url) b.firstElementChild.style.backgroundImage = `url(${url})`;
        else b.insertAdjacentHTML('beforeend', '<span class="ga-broken">This one won’t open</span>');
      });
  }

  function tile(p, shape) {
    const b = document.createElement('button');
    const on = inRotation(p.id);
    b.className = `ga-tile${shape ? ` ${shape}` : ''}${on ? '' : ' off'}${picked[p.id] ? ' sel' : ''}${fresh[p.id] ? ' new' : ''}${lastSeen === p.id ? ' cur' : ''}`;
    b.__id = p.id;
    const name = String(p.name || '').trim();
    const big = shape === 'hero' || shape === 'wide';
    const words = [name, p.caption || (p.src ? '' : p.title)].filter(Boolean).join(' · ');
    b.setAttribute('aria-label', `${p.video ? 'Video' : 'Photo'}${name ? ` from ${name}` : ''}, ${p.day || ''}. ${on ? 'Shows on Home' : 'Not on Home'}`);
    b.innerHTML = `<span class="ga-img"></span>
      <span class="ga-home"><span class="yes">${HOUSE}</span><span class="no">${HOUSE_OFF}</span></span>
      ${p.video ? '<span class="ga-vid">▶ Video</span>' : ''}
      <span class="ga-who">${name ? avatar(name, 36) : ''}${big && words ? `<span class="ga-chip">${esc(words)}</span>` : ''}</span>
      <span class="ga-tick">✓</span>`;
    const img = b.firstElementChild;
    if (!p.src) img.style.background = p.art || '#2A3038';
    else if (p.video) img.style.background = '#2A3038';
    else {
      b.__src = p.src;
      b.__w = big ? 432 : shape === 'tall' ? 216 : 252;
      b.__h = shape === 'hero' ? 492 : shape === 'wide' ? 240 : shape === 'tall' ? 506 : 288;
      if (io) io.observe(b); else { b.__seen = true; loadThumb(b); }
    }
    return b;
  }

  function renderRiver(keepPlace) {
    const token = {};
    renderRiver.token = token;
    if (io) io.disconnect();
    io = window.IntersectionObserver ? new IntersectionObserver((entries) => {
      entries.forEach((en) => { en.target.__seen = en.isIntersecting; if (en.isIntersecting) loadThumb(en.target); });
    }, { root: river, rootMargin: '0px 480px' }) : null;
    const keep = keepPlace ? river.scrollLeft : 0;
    river.innerHTML = '';
    river.scrollLeft = 0;
    const list = visible();

    // Nothing at all, or nothing that fits what was asked for.
    const empty = !album.length;
    $('[data-empty]').style.display = empty ? 'flex' : 'none';
    $('[data-none]').style.display = !empty && !list.length ? 'flex' : 'none';
    river.style.display = list.length ? 'flex' : 'none';
    $('[data-fade]').style.display = list.length ? '' : 'none';
    root.querySelector('.ga-row').style.visibility = empty ? 'hidden' : '';
    if (!empty && !list.length) {
      const person = who !== null && rings.find((r) => r.key === who);
      $('[data-none-title]').textContent = homeFilter === 'off'
        ? (person ? `Every photo from ${person.name} is on Home` : 'Every photo is on Home')
        : homeFilter === 'on' ? (person ? `None from ${person.name} are on Home` : 'No photos are on Home')
          : 'No photos here';
      $('[data-none-line]').textContent = homeFilter === 'on' && !person
        ? 'Home shows its painted scene until some are. Tap a photo and switch “Shows on Home” on, or use Choose for several at once.'
        : '';
    }
    $('[data-older]').style.opacity = '0';
    $('[data-newest]').style.display = 'none';

    // Week by week, newest on the left. The newest week leads with one big picture.
    const thisWeek = weekStart(Date.now());
    const weeks = [];
    list.forEach((p) => {
      const start = p.added ? weekStart(p.added) : 0;
      const last = weeks[weeks.length - 1];
      if (last && last.start === start) last.items.push(p); else weeks.push({ start, items: [p] });
    });
    const jobs = [];
    // The grid has two rows. So that no week ends with a hole, its photos are laid in blocks:
    // a wide one over (or under) two small ones, four small ones, two small ones, or one tall one.
    weeks.forEach((w, wi) => {
      const items = w.items.slice();
      const put = (shape) => jobs.push({ w, p: items.shift(), shape });
      if (wi === 0 && items.length !== 2) put('hero');
      let k = 0;
      while (items.length) {
        const r = items.length;
        if (r === 1) put('tall');
        else if (r === 2) { put(''); put(''); }
        else if (r === 3 || k % 2 === 0) {
          if (k % 4 === 0) { put('wide'); put(''); put(''); } else { put(''); put('wide'); put(''); }
        } else { put(''); put(''); put(''); put(''); }
        k++;
      }
    });
    let at = 0;
    const chunk = () => {
      if (renderRiver.token !== token || alive !== visit) return;
      jobs.slice(at, at + CHUNK).forEach((j) => {
        if (!j.w.grid) {
          const box = document.createElement('div');
          box.className = `ga-week${j.w.start === thisWeek ? ' now' : ''}`;
          const label = j.w.start ? weekLabel(j.w.start, thisWeek) : 'Earlier';
          box.innerHTML = `<div class="ga-wlabel">${esc(label)} · ${j.w.items.length}</div><div class="ga-grid"></div>`;
          j.w.grid = box.lastElementChild;
          river.appendChild(box);
        }
        j.w.grid.appendChild(tile(j.p, j.shape));
      });
      at += CHUNK;
      if (keep && river.scrollLeft < keep) river.scrollLeft = keep;
      if (at < jobs.length) setTimeout(chunk, 40);
      else onScroll();
    };
    chunk();
  }

  function onScroll() {
    const x = river.scrollLeft;
    const more = river.scrollWidth - river.clientWidth;
    $('[data-older]').style.opacity = more > 40 && x < 40 && river.style.display !== 'none' ? '1' : '0';
    $('[data-newest]').style.display = x > 1500 && river.style.display !== 'none' ? '' : 'none';
  }
  river.addEventListener('scroll', onScroll, { passive: true });
  $('[data-newest]').addEventListener('click', () => { river.scrollLeft = 0; });

  /** The house on every tile, after photos went on or off Home. */
  function refreshTiles() {
    river.querySelectorAll('.ga-tile').forEach((t) => {
      t.classList.toggle('off', !inRotation(t.__id));
      t.classList.toggle('sel', !!picked[t.__id]);
      t.classList.toggle('cur', lastSeen === t.__id);
    });
  }

  function renderAll(keepPlace) {
    renderRings();
    renderCount();
    renderRiver(keepPlace);
    renderPicked();
  }

  // ---- Rings and the Home filter ----
  $('[data-rings]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-ring]');
    if (!b) return;
    const r = rings[+b.dataset.ring];
    who = !r || who === r.key ? null : r.key; // a second tap on the same ring is "everyone" again
    renderRings();
    renderRiver(false);
  });
  $('[data-seg]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-f]');
    if (!b) return;
    homeFilter = b.dataset.f;
    renderCount();
    renderRiver(false);
  });
  $('[data-none-all]').addEventListener('click', () => { who = null; homeFilter = 'all'; renderAll(false); });

  // ---- Choosing several ----
  function renderPicked() {
    const ids = Object.keys(picked);
    const n = ids.length;
    const shown = visible();
    $('[data-picked]').innerHTML = n
      ? `${plural(n, 'photo')} chosen<small>${ids.filter((id) => inRotation(id)).length} of them on Home</small>`
      : 'Tap the photos you want<small>Then show them on Home, take them off Home, or remove them.</small>';
    const set = (sel, text) => { const b = $(sel); if (b) { b.disabled = !n; if (text) b.textContent = text; } };
    set('[data-pick-on]');
    set('[data-pick-off]');
    set('[data-pick-remove]', n ? `Remove ${n}` : 'Remove');
    $('[data-pick-all]').textContent = n && shown.every((p) => picked[p.id]) ? 'Choose none' : 'Choose all';
  }
  function setPicking(on) {
    picking = on;
    if (!on) picked = {};
    root.classList.toggle('picking', on);
    $('[data-pick]').style.visibility = on ? 'hidden' : '';
    refreshTiles();
    renderPicked();
  }
  $('[data-pick]').addEventListener('click', () => setPicking(true));
  $('[data-pick-done]').addEventListener('click', () => setPicking(false));
  $('[data-pick-all]').addEventListener('click', () => {
    const shown = visible();
    const all = shown.length && shown.every((p) => picked[p.id]);
    picked = {};
    if (!all) shown.forEach((p) => { picked[p.id] = true; });
    refreshTiles();
    renderPicked();
  });
  const putOnHome = (on) => {
    const ids = Object.keys(picked);
    if (!ids.length) return;
    picked = {};
    setRotation(ids, on); // (the screen follows: see onRotationChanged below)
    refreshTiles();
    renderPicked();
    toast(on ? `${plural(ids.length, 'photo')} will show on Home` : `${plural(ids.length, 'photo')} taken off Home. ${ids.length === 1 ? 'It stays' : 'They stay'} in the Gallery`);
  };
  $('[data-pick-on]').addEventListener('click', () => putOnHome(true));
  $('[data-pick-off]').addEventListener('click', () => putOnHome(false));
  if (canRemove) $('[data-pick-remove]').addEventListener('click', () => { const ids = Object.keys(picked); if (ids.length) openAsk(ids); });

  river.addEventListener('click', (e) => {
    const t = e.target.closest('.ga-tile');
    if (!t) return;
    if (picking) {
      if (picked[t.__id]) delete picked[t.__id]; else picked[t.__id] = true;
      t.classList.toggle('sel', !!picked[t.__id]);
      renderPicked();
      return;
    }
    openViewer(t.__id);
  });

  // ---- The big viewer ----
  function markBroken(video) {
    if (stage.querySelector('.ga-wont')) return;
    const box = document.createElement('div');
    box.className = 'ga-wont';
    box.innerHTML = `<div style="font:500 36px Outfit,sans-serif">${video ? 'This video won’t play' : 'This photo won’t open'}</div>
      <div style="font-size:20px;color:#E6E9ED;line-height:1.4">It may not have arrived whole. Send it again from the phone${canRemove ? ', or take this one off with Remove at the top' : ''}.</div>`;
    stage.appendChild(box);
  }

  function renderSound() {
    const b = $('[data-vsound]');
    b.style.display = vVideo ? '' : 'none';
    b.textContent = vVideo && !vVideo.muted ? '🔊 Sound on · tap for quiet' : '🔇 Tap for sound';
  }
  $('[data-vsound]').addEventListener('click', () => {
    const v = vVideo;
    if (!v) return;
    v.muted = !v.muted;
    if (!v.muted) {
      const tried = v.play && v.play();
      if (tried && tried.catch) tried.catch(() => { if (vVideo === v) { v.muted = true; if (v.play) v.play().catch(() => {}); renderSound(); toast('The sound couldn’t start. Try once more'); } });
    }
    renderSound();
  });

  function stopVideo() {
    if (vVideo) { try { vVideo.pause(); vVideo.removeAttribute('src'); vVideo.load(); } catch (e) { /* fine */ } }
    vVideo = null;
  }

  function renderHomeSwitch() {
    const p = vList[vIndex];
    if (!p) return;
    const on = inRotation(p.id);
    const b = $('[data-vhome]');
    b.classList.toggle('on', on);
    b.setAttribute('aria-checked', on ? 'true' : 'false');
    $('[data-vhome-text]').textContent = on ? 'Shows on Home' : 'Not on Home';
  }

  function showAt(i) {
    vIndex = i;
    const p = vList[i];
    if (!p) return;
    lastSeen = p.id;
    if (fresh[p.id]) delete fresh[p.id]; // seen now
    stopVideo();
    stage.innerHTML = '';
    if (p.video && p.src) {
      // Plays at once, quiet until somebody taps for sound, again and again until they move on.
      const v = document.createElement('video');
      v.src = encodeURI(p.src);
      v.muted = true; v.autoplay = true; v.playsInline = true; v.loop = true;
      v.addEventListener('error', () => { if (vVideo === v) markBroken(true); });
      stage.appendChild(v);
      vVideo = v;
      const tried = v.play && v.play();
      if (tried && tried.catch) tried.catch(() => {});
    } else if (p.src) {
      const pic = document.createElement('div');
      pic.className = 'ga-pic';
      pic.style.backgroundImage = `url('${encodeURI(p.src)}')`;
      stage.appendChild(pic);
      const probe = new Image();
      probe.onerror = () => { if (el.isConnected && viewing && vList[vIndex] === p) markBroken(false); };
      probe.src = encodeURI(p.src);
    } else {
      // (A sample picture, in a normal browser.)
      const pic = document.createElement('div');
      pic.className = 'ga-pic art';
      pic.style.background = p.art || '#2A3038';
      stage.appendChild(pic);
      if (p.video) stage.insertAdjacentHTML('beforeend', '<div class="ga-sample"><span>▶ A video plays here on the kitchen screen</span></div>');
    }
    const name = String(p.name || '').trim();
    $('[data-vwho]').innerHTML = name ? avatar(name, 64) : '';
    const bar = $('[data-vbar]');
    bar.classList.remove('open');
    const titleEl = $('[data-vtitle]');
    titleEl.textContent = p.title || '';
    $('[data-vline]').textContent = p.line || '';
    // "Read all" only when the words are cut off (measured once the text is laid out).
    $('[data-vmore]').style.display = 'none';
    requestAnimationFrame(() => {
      if (!el.isConnected || vList[vIndex] !== p) return;
      $('[data-vmore]').style.display = titleEl.scrollHeight > titleEl.clientHeight + 2 ? 'inline-block' : 'none';
    });
    $('[data-vcount]').textContent = vList.length > 1 ? `${p.video ? 'Video' : 'Photo'} ${i + 1} of ${vList.length}` : (p.video ? 'The only video here' : 'The only photo here');
    el.querySelectorAll('.ga-arrow').forEach((a) => { a.style.display = vList.length > 1 ? 'flex' : 'none'; });
    renderSound();
    renderHomeSwitch();
    // The next one, ready before it is asked for.
    const up = vList.length > 1 && vList[(i + 1) % vList.length];
    if (up && up.src && !up.video) { preload = new Image(); preload.src = encodeURI(up.src); }
  }

  function openViewer(id) {
    vList = visible();
    let i = vList.findIndex((p) => p.id === id);
    if (i < 0) { vList = album.slice(); i = vList.findIndex((p) => p.id === id); } // (hidden by a filter)
    if (i < 0) return false;
    viewing = true;
    viewEl.style.display = 'block';
    showAt(i);
    return true;
  }
  function closeViewer() {
    viewing = false;
    stopVideo();
    stage.innerHTML = '';
    viewEl.style.display = 'none';
    refreshTiles();
    river.querySelectorAll('.ga-tile.new').forEach((t) => { if (!fresh[t.__id]) t.classList.remove('new'); });
    // Back in the river where that photo is.
    const cur = river.querySelector('.ga-tile.cur');
    if (cur) {
      const a = cur.getBoundingClientRect(), r = river.getBoundingClientRect();
      if (a.left < r.left || a.right > r.right) river.scrollLeft += (a.left - r.left) * (river.clientWidth / r.width) - 300;
    }
  }
  /** One on (+1) or back (-1), saying so when it goes round to the other end. */
  function step(d) {
    if (vList.length < 2) return;
    let j = vIndex + d;
    if (j >= vList.length) { j = 0; toast('Back to the newest one'); }
    else if (j < 0) { j = vList.length - 1; toast('That was the newest. Here’s the oldest one'); }
    showAt(j);
  }
  $('[data-vclose]').addEventListener('click', closeViewer);
  $('[data-vprev]').addEventListener('click', () => step(-1));
  $('[data-vnext]').addEventListener('click', () => step(1));
  $('[data-vcap]').addEventListener('click', () => {
    const bar = $('[data-vbar]');
    if ($('[data-vmore]').style.display === 'none' && !bar.classList.contains('open')) return; // nothing more to read
    const open = bar.classList.toggle('open');
    $('[data-vmore]').textContent = open ? 'Show less' : 'Read all ›';
    if (!open) $('[data-vmore]').style.display = 'inline-block';
  });
  $('[data-vhome]').addEventListener('click', () => {
    const p = vList[vIndex];
    if (!p) return;
    const on = !inRotation(p.id);
    setRotation(p.id, on);
    toast(on ? 'It will take its turn on Home' : 'Taken off Home. It stays in the Gallery');
  });
  if (canRemove) $('[data-vremove]').addEventListener('click', () => { const p = vList[vIndex]; if (p && p.id) openAsk([p.id]); });

  // A swipe left or right works too.
  let sx = null, sy = 0, st = 0;
  viewEl.addEventListener('touchstart', (e) => {
    sx = null;
    if (e.touches.length !== 1 || e.target.closest('.ga-vbar, .ga-vtop')) return;
    sx = e.touches[0].clientX; sy = e.touches[0].clientY; st = Date.now();
  }, { passive: true });
  viewEl.addEventListener('touchend', (e) => {
    if (sx == null) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - sx, dy = t.clientY - sy;
    sx = null;
    const wide = root.getBoundingClientRect().width / 1280; // the stage may be drawn smaller
    if (Math.abs(dx) > 70 * wide && Math.abs(dx) > Math.abs(dy) * 1.5 && Date.now() - st < 900) step(dx < 0 ? 1 : -1);
  }, { passive: true });

  // ---- Taking pictures off this screen for good (one in the viewer, or several chosen) ----
  function openAsk(ids) {
    askIds = ids;
    const these = album.filter((p) => ids.indexOf(p.id) >= 0);
    const vids = these.filter((p) => p.video).length;
    $('[data-ask-title]').textContent = ids.length === 1
      ? (vids ? 'Remove this video?' : 'Remove this photo?')
      : `Remove these ${ids.length} ${vids === ids.length ? 'videos' : vids ? 'photos and videos' : 'photos'}?`;
    $('[data-ask-line]').textContent = `${ids.length === 1 ? 'It comes' : 'They come'} off this screen for good. To only stop ${ids.length === 1 ? 'it' : 'them'} showing on Home, use “${ids.length === 1 ? 'Shows on Home' : 'Take off Home'}” instead.`;
    $('[data-really]').textContent = ids.length === 1 ? 'Remove' : `Remove ${ids.length}`;
    askEl.style.display = 'flex';
  }
  function closeAsk() {
    askEl.style.display = 'none';
    askIds = [];
  }
  askEl.addEventListener('click', (e) => {
    if (e.target.closest('[data-really]')) {
      const ids = askIds.slice();
      const many = ids.length > 1;
      // (The album tells us it changed, and everything follows: see onPhotosChanged below.)
      const gone = many ? removePhotos(ids) : (removePhoto(ids[0]) ? 1 : 0);
      if (!gone) { $('[data-ask-line]').textContent = 'That didn’t work. Try again in a moment.'; return; }
      closeAsk();
      if (picking) { picked = {}; renderPicked(); }
      toast(gone === 1 ? (many ? '1 removed. The others couldn’t be' : 'Removed') : `${gone} removed${gone < ids.length ? `. ${ids.length - gone} couldn’t be` : ''}`);
    } else if (e.target.closest('[data-keep]') || e.target === askEl) {
      closeAsk();
    }
  });

  stopView = stopVideo; // (a clip must not play on after the Gallery is left)

  // ---- Start ----
  // (Photos that have gone needn't be remembered as "not on Home". Never with an empty
  // album: a list that failed to load must not wipe what the household chose.)
  const tidy = () => { if (album.length) tidyRotation(album.map((p) => p.id)); };
  tidy();
  renderAll(false);
  if (args[0] === 'show' && album.length) openViewer(args[1] === 'newest' ? album[0].id : args[1]);
  else if (args[0] === 'choose' && album.length) setPicking(true);

  // Photos went on or off Home (here, or by a choice made elsewhere).
  offRotation = onRotationChanged(() => {
    if (!el.isConnected) return;
    renderCount();
    renderPicked();
    if (viewing) renderHomeSwitch();
    if (homeFilter === 'all' || viewing) refreshTiles(); else renderRiver(true);
  });

  // A phone just sent photos, or some were removed (here or from the phone page).
  offPhotos = onPhotosChanged(() => {
    if (!el.isConnected) return;
    const had = {};
    album.forEach((p) => { had[p.id] = true; });
    album = loadAlbum();
    const still = {};
    album.forEach((p) => { still[p.id] = true; });
    const arrived = album.filter((p) => !had[p.id]);
    arrived.forEach((p) => { fresh[p.id] = true; });
    Object.keys(picked).forEach((id) => { if (!still[id]) delete picked[id]; });
    Object.keys(fresh).forEach((id) => { if (!still[id]) delete fresh[id]; });
    if (askIds.length && askIds.some((id) => !still[id])) closeAsk(); // what it asked about is gone already
    tidy();
    if (!album.length && picking) setPicking(false);

    if (viewing) {
      // Keep the one being looked at; if it was removed, the next one takes its place.
      const cur = vList[vIndex] && vList[vIndex].id;
      vList = vList.filter((p) => still[p.id]);
      const at = vList.findIndex((p) => p.id === cur);
      if (!vList.length) closeViewer();
      else if (at >= 0) { vIndex = at; $('[data-vcount]').textContent = vList.length > 1 ? `${vList[at].video ? 'Video' : 'Photo'} ${at + 1} of ${vList.length}` : ''; }
      else showAt(Math.min(vIndex, vList.length - 1));
    }
    renderAll(!arrived.length || viewing || picking);

    if (arrived.length) {
      const names = [...new Set(arrived.map((p) => p.name).filter(Boolean))];
      const vids = arrived.filter((p) => p.video).length;
      const what = arrived.length === 1 ? (vids ? 'New video' : 'New photo') : `${arrived.length} new ${vids === arrived.length ? 'videos' : vids ? 'photos and videos' : 'photos'}`;
      const text = `${what}${names.length === 1 ? ` from ${names[0]}` : ''}`;
      const firstNew = arrived[0].id;
      // Somebody may be looking at something on purpose: don't snatch it away, offer it instead.
      toast(text, { label: 'Show', run: () => {
        if (picking) setPicking(false);
        if (viewing) closeViewer();
        who = null; homeFilter = 'all';
        renderAll(false);
        openViewer(firstNew);
      } });
    }
  });
}

export function unmount() {
  alive = null;
  clearTimeout(toastTimer);
  if (io) { io.disconnect(); io = null; }
  if (stopCodes) { stopCodes(); stopCodes = null; }
  if (stopView) { stopView(); stopView = null; }
  if (offPhotos) { offPhotos(); offPhotos = null; }
  if (offRotation) { offRotation(); offRotation = null; }
}
