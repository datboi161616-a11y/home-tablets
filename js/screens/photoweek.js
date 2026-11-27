// Photo of the week. Three views, in the Gallery's cream look:
//   #/photoweek              pick this week's photo (on Sunday/Monday: the week Home asks about)
//   #/photoweek/pick/<week>  the same for another week (reached from the year: a missed week)
//   #/photoweek/year[/2026]  the year so far: a slot for every week, by month
//   #/photoweek/play[/2026]  "Our 2026": the title card, and the picks played one by one
// The data and the week arithmetic are in services/photoweek-data.js.
import { esc, topBar, avatar } from './ui.js';
import { soften } from '../services/soft-bg.js';
import { flushCompat } from '../compat.js';
import { backHref } from '../services/nav.js';
import { householdName } from '../services/family.js';
import { thumbnail, onPhotosChanged } from '../services/tablet-photos.js';
import { chipShowsOn } from '../services/timers.js';
import {
  picks, setPick, thisWeek, dueWeek, slotsFor, weekPhotos, weekInfo, weekRange, keyStart, showYear,
} from '../services/photoweek-data.js';

const STAR = (size, fill) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill}" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.8-4.9 4.6 1.3 6.5L12 17.2 6.1 20.4l1.3-6.5L2.5 9.3l6.6-.8z"/></svg>`;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MAX_TILES = 60;   // photos offered for one week
const EACH = 4000;      // the slideshow: how long each photo stays (ms)
// Where the title card lays its six photos (left, top, turn).
const SCATTER = [[690, 120, -6], [930, 90, 5], [760, 330, 4], [1000, 320, -5], [840, 520, -3], [1060, 540, 6]];

let offPhotos = null;
let stopShow = null;

const CSS = `
  .pw-root{position:absolute;top:0;right:0;bottom:0;left:0;background:#F6F1EA;color:#1F2A37;overflow:hidden;--accent:#E2683C;font-family:Inter,system-ui,sans-serif}
  .pw-root .x-btn.white{box-shadow:0 2px 8px rgba(60,40,20,.10)}
  .pw-top{position:absolute;left:40px;right:40px;top:26px}
  .pw-top .x-title{font-weight:600}
  .pw-range{font:500 18px Inter,sans-serif;color:#7A6A5A;margin-top:2px}
  .pw-count{font:600 30px Outfit,sans-serif;white-space:nowrap}
  .pw-count small{font-size:20px;color:#9A7E66;font-weight:500}
  /* ---- pick one ---- */
  .pw-scroll{position:absolute;left:0;right:0;top:112px;bottom:0;overflow-x:hidden;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:16px 40px 110px}
  .pw-grid{display:grid;grid-template-columns:389px 389px 389px;grid-auto-rows:300px;grid-gap:16px}
  .pw-tile{position:relative;border:0;padding:0;border-radius:22px;overflow:hidden;background:#E4DACB;cursor:pointer;font-family:inherit;box-shadow:0 2px 8px rgba(60,40,20,.10)}
  .pw-tile.on{box-shadow:0 0 0 6px #E2683C}
  .pw-img{position:absolute;top:0;right:0;bottom:0;left:0;background:center/cover no-repeat}
  .pw-week{position:absolute;left:16px;top:16px;height:48px;padding:0 18px 0 12px;border-radius:24px;background:#E2683C;color:#fff;display:none;align-items:center;font:600 18px Inter,sans-serif}
  .pw-week svg{margin-right:8px}
  .pw-tile.on .pw-week{display:flex;animation:pw-pop .3s ease-out}
  @keyframes pw-pop{from{transform:scale(.6);opacity:0}to{transform:scale(1);opacity:1}}
  .pw-who{position:absolute;left:14px;bottom:14px;display:flex}
  .pw-who > span{box-shadow:0 0 0 3px rgba(255,255,255,.9)}
  .pw-day{position:absolute;right:14px;bottom:14px;height:36px;padding:0 14px;border-radius:18px;background:rgba(255,255,255,.88);display:flex;align-items:center;font:600 16px Inter,sans-serif;color:#1F2A37}
  .pw-none{position:absolute;left:0;right:0;top:112px;bottom:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding-bottom:40px}
  .pw-none .x-serif{font-size:34px;margin:22px 0 26px}
  /* ---- the year so far ---- */
  .pw-month{position:absolute;top:134px;width:92px;text-align:center;font:700 15px Inter,sans-serif;letter-spacing:1.2px;color:#9A7E66;text-transform:uppercase}
  .pw-month.now{color:#E2683C}
  .pw-slot{position:absolute;width:92px;height:100px;border-radius:14px;background:#EDE4D8 center/cover no-repeat;border:0;padding:0;font-family:inherit;overflow:hidden}
  button.pw-slot{cursor:pointer}
  .pw-slot.has{background-color:#E4DACB;box-shadow:0 1px 5px rgba(60,40,20,.14)}
  .pw-slot.open{background:transparent;box-sizing:border-box;border:3px dashed #C9B8A4;color:#9A7E66;font:300 44px/1 Outfit,sans-serif}
  .pw-slot.open.now{border-color:#E2683C;color:#E2683C}
  .pw-slot.has.now{box-shadow:0 0 0 5px #E2683C}
  .pw-mark{position:absolute;right:6px;top:6px;width:30px;height:30px;border-radius:15px;background:#E2683C;display:flex;align-items:center;justify-content:center}
  /* ---- Our 2026 ---- */
  .pw-card{position:absolute;top:0;right:0;bottom:0;left:0;color:#FFF4EA;background:radial-gradient(ellipse 900px 700px at 25% 40%,#3A2A4A 0%,#1C1424 60%,#120D18 100%)}
  .pw-dot{position:absolute;border-radius:50%;background:#FFE6B0}
  .pw-snap{position:absolute;width:230px;height:172px;border-radius:10px;background:#3A2A4A center/cover no-repeat;box-shadow:0 0 0 7px #FFF8EE,0 8px 14px rgba(0,0,0,.4)}
  .pw-words{position:absolute;left:80px;top:200px}
  .pw-house{font:600 22px Inter,sans-serif;letter-spacing:2px;text-transform:uppercase;color:#FFC98A;min-height:27px}
  .pw-our{font-size:128px;line-height:1;margin-top:10px;white-space:nowrap}
  .pw-sum{font:500 30px Outfit,sans-serif;margin-top:18px;opacity:.85}
  .pw-go{position:absolute;left:80px;bottom:150px;background:#FFC98A;color:#2A1A10;padding:0 40px;font-size:24px}
  .pw-x{position:absolute;right:40px;top:28px;font-size:24px}
  .pw-bar{position:absolute;left:80px;right:80px;bottom:20px;height:80px;padding-top:26px;color:#FFF4EA}
  .pw-segs,.pw-letters{display:flex}
  .pw-segs i{flex:1;height:6px;border-radius:3px;background:rgba(255,255,255,.28);margin-right:4px}
  .pw-segs i.past{background:#FFFFFF}
  .pw-letters{margin-top:10px;font:600 16px Inter,sans-serif;letter-spacing:1px;opacity:.8}
  /* ---- playing ---- */
  .pw-show{position:absolute;top:0;right:0;bottom:0;left:0;background:#000;color:#fff}
  .pw-layer{position:absolute;top:0;right:0;bottom:0;left:0;background:center/cover no-repeat;opacity:0;transition:opacity .4s linear}
  .pw-layer.on{opacity:1}
  .pw-shade{position:absolute;top:0;right:0;bottom:0;left:0;background:linear-gradient(180deg,rgba(6,8,16,.45) 0,rgba(6,8,16,0) 25%,rgba(6,8,16,0) 60%,rgba(6,8,16,.78) 100%)}
  .pw-cap{position:absolute;left:80px;bottom:130px;color:#FFF4EA}
  .pw-cap b{display:block;font-size:64px;line-height:1;font-weight:400}
  .pw-cap span{display:block;font:500 24px Inter,sans-serif;margin-top:10px;opacity:.9}
  .pw-pause{position:absolute;right:80px;bottom:124px;width:76px;min-height:76px;padding:0;font-size:22px}
  .pw-show .pw-bar{cursor:pointer}
`;

// A photo into an element's background: a small copy from the album, or the sample's painting.
function paint(node, photo, w, h) {
  if (!photo.src) { node.style.background = photo.art || '#E4DACB'; node.style.backgroundSize = 'cover'; return; }
  thumbnail(photo.src, { w, h, wanted: () => node.isConnected }).then((url) => { if (url && node.isConnected) node.style.backgroundImage = `url(${url})`; });
}

function goBack() {
  if (history.length > 1) history.back(); else location.hash = backHref();
}

// The 52 or 53 little bars with the months' letters under them (shorter while a kitchen
// timer's chip sits in the corner).
function barHtml(slots) {
  const perMonth = new Array(12).fill(0);
  slots.forEach((s) => { perMonth[s.month]++; });
  return `<div class="pw-bar" data-bar${chipShowsOn('photoweek') ? ' style="right:270px"' : ''}><div class="pw-segs">${slots.map(() => '<i></i>').join('')}</div>
    <div class="pw-letters">${perMonth.map((n, m) => `<span style="flex:${n}">${MONTHS[m].charAt(0)}</span>`).join('')}</div></div>`;
}

// ---------------------------------------------------------------------------------------
// Pick one
// ---------------------------------------------------------------------------------------
function pickView(el, key, fromYear) {
  const start = keyStart(key);
  const info = weekInfo(start);
  const isNow = key === thisWeek().key;
  const list = weekPhotos(key).slice(0, MAX_TILES);
  const pickedCount = () => slotsFor(info.year).filter((s) => s.photo).length;
  const yearPill = fromYear ? '' : `<a class="x-btn white" href="#/photoweek/year/${info.year}">${STAR(22, '#E2683C')}Our ${info.year}<span data-count></span></a>`;
  const top = topBar(fromYear
    ? { title: `Week ${info.week}`, back: 'history', backLabel: '← Back', tone: 'light' }
    : { title: 'Photo of the week', tone: 'light', right: yearPill });
  const body = list.length
    ? `<div class="pw-scroll"><div class="pw-grid">${list.map((p) => `<button class="pw-tile" data-id="${esc(p.id)}">
        <span class="pw-img"></span>
        <span class="pw-week">${STAR(24, '#FFE6B0')}Week ${info.week}</span>
        ${p.name ? `<span class="pw-who">${avatar(p.name, 40)}</span>` : ''}
        <span class="pw-day">${new Date(p.added).toLocaleDateString('en-US', { weekday: 'short' })}</span>
      </button>`).join('')}</div></div>`
    : `<div class="pw-none">
        <svg width="260" height="200" viewBox="0 0 260 200" aria-hidden="true"><g transform="rotate(-5 130 100)"><rect x="50" y="22" width="160" height="150" rx="10" fill="#FFFFFF"/><rect x="62" y="34" width="136" height="104" rx="6" fill="#EDE4D8"/><path transform="translate(100 54) scale(2.5)" fill="#E2683C" d="M12 2.5l2.9 6 6.6.8-4.9 4.6 1.3 6.5L12 17.2 6.1 20.4l1.3-6.5L2.5 9.3l6.6-.8z"/></g></svg>
        <div class="x-serif">${isNow ? 'No photos this week yet.' : 'No photos that week.'}</div>
        ${isNow ? '<a class="x-btn accent lg" href="#/addphotos">Add photos</a>' : ''}
      </div>`;
  el.innerHTML = `<style>${CSS}</style><div class="pw-root"><div class="pw-top">${top}</div>${body}</div>`;
  // The dates go under the title (the title is the only text in its box).
  const title = el.querySelector('.x-title');
  title.innerHTML = `${title.innerHTML}<div class="pw-range">${esc(weekRange(start))}${list.length ? ' · Tap the one you like best' : ''}</div>`;

  const tiles = Array.prototype.slice.call(el.querySelectorAll('.pw-tile'));
  tiles.forEach((t, i) => paint(t.querySelector('.pw-img'), list[i], 389, 300));
  const mark = () => {
    const pick = picks()[key];
    tiles.forEach((t) => t.classList.toggle('on', !!pick && t.getAttribute('data-id') === pick.id));
    const count = el.querySelector('[data-count]');
    if (count) { const n = pickedCount(); count.textContent = n ? ` · ${n}` : ''; }
  };
  mark();
  el.querySelector('.pw-root').addEventListener('click', (e) => {
    if (e.target.closest('[data-back]')) { goBack(); return; }
    const tile = e.target.closest('.pw-tile');
    if (!tile) return;
    const id = tile.getAttribute('data-id');
    if (!tile.classList.contains('on')) setPick(key, id); // (another tap on the chosen one keeps it: tap a different one to change)
    mark();
  });
}

// ---------------------------------------------------------------------------------------
// The year so far
// ---------------------------------------------------------------------------------------
function yearView(el, year) {
  const slots = slotsFor(year);
  const done = slots.filter((s) => s.photo).length;
  const nowMonth = thisWeek().year === year ? thisWeek().month : -1;
  const rows = new Array(12).fill(0);
  const cells = slots.map((s) => {
    const at = `left:${40 + s.month * 100}px;top:${172 + rows[s.month]++ * 108}px`;
    const now = s.when === 'now' ? ' now' : '';
    if (s.photo) return `<button class="pw-slot has${now}" style="${at}" data-key="${s.key}">${now ? `<span class="pw-mark">${STAR(18, '#FFE6B0')}</span>` : ''}</button>`;
    if (s.open) return `<button class="pw-slot open${now}" style="${at}" data-key="${s.key}">+</button>`;
    return `<div class="pw-slot" style="${at}"></div>`;
  }).join('');
  el.innerHTML = `<style>${CSS}</style><div class="pw-root">
    <div class="pw-top">${topBar({
    title: `Our ${year}`, back: 'history', backLabel: '← Back', tone: 'light',
    right: `<div class="pw-count">${done}<small> of ${slots.length}</small></div>${done ? `<a class="x-btn accent" href="#/photoweek/play/${year}">▶&nbsp; Play so far</a>` : ''}`,
  })}</div>
    ${MONTHS.map((m, i) => `<div class="pw-month${i === nowMonth ? ' now' : ''}" style="left:${40 + i * 100}px">${m.slice(0, 3)}</div>`).join('')}
    ${cells}
  </div>`;
  slots.forEach((s) => { if (s.photo) paint(el.querySelector(`[data-key="${s.key}"]`), s.photo, 138, 150); });
  el.querySelector('.pw-root').addEventListener('click', (e) => {
    if (e.target.closest('[data-back]')) { goBack(); return; }
    const slot = e.target.closest('[data-key]');
    if (slot) location.hash = `#/photoweek/pick/${slot.getAttribute('data-key')}`;
  });
}

// ---------------------------------------------------------------------------------------
// Our 2026: the title card, then the picks one by one
// ---------------------------------------------------------------------------------------
function playView(el, year) {
  const slots = slotsFor(year);
  const list = slots.map((s, i) => ({ ...s, i })).filter((s) => s.photo);
  const house = householdName();
  // Six of them for the card, spread over the year.
  const six = list.length <= 6 ? list : SCATTER.map((_, k) => list[Math.round(k * (list.length - 1) / 5)]);
  el.innerHTML = `<style>${CSS}</style><div class="pw-root"><div class="pw-card">
    ${[[120, 90, 4, 0.7], [420, 160, 3, 0.5], [560, 60, 5, 0.6], [300, 620, 3, 0.4], [80, 520, 4, 0.5], [610, 700, 3, 0.5]]
    .map(([x, y, d, o]) => `<div class="pw-dot" style="left:${x}px;top:${y}px;width:${d}px;height:${d}px;opacity:${o}"></div>`).join('')}
    ${six.map((s, k) => `<div class="pw-snap" style="left:${SCATTER[k][0]}px;top:${SCATTER[k][1]}px;transform:rotate(${SCATTER[k][2]}deg)"></div>`).join('')}
    <div class="pw-words">
      <div class="pw-house">${esc(house)}</div>
      <div class="pw-our x-serif">Our ${year}</div>
      <div class="pw-sum">${list.length ? `${slots.length} weeks · ${list.length} photo${list.length === 1 ? '' : 's'}` : 'No photos picked yet'}</div>
    </div>
    ${list.length ? '<button class="x-btn lg pw-go" data-play>▶&nbsp; Play</button>' : ''}
    ${barHtml(slots)}
    <button class="x-btn glass round pw-x" data-close aria-label="Close">✕</button>
  </div></div>`;
  const root = el.querySelector('.pw-root');
  Array.prototype.forEach.call(el.querySelectorAll('.pw-snap'), (n, k) => paint(n, six[k].photo, 230, 172));

  function play() {
    const show = document.createElement('div');
    show.className = 'pw-show';
    show.innerHTML = `<div class="pw-layer"></div><div class="pw-layer"></div><div class="pw-shade"></div>
      <div class="pw-cap"><b class="x-serif"></b><span></span></div>
      <button class="x-btn glass pw-pause" data-pause aria-label="Pause">❚❚</button>
      ${barHtml(slots)}
      <button class="x-btn glass round pw-x" data-stop aria-label="Close">✕</button>`;
    root.appendChild(show);
    // (Its full-screen shade lies over every fade: a tiny picture, not a gradient drawn each time.)
    try { flushCompat(); soften(show); } catch (e) { /* it keeps its own background */ }
    const layers = show.querySelectorAll('.pw-layer');
    const segs = show.querySelectorAll('.pw-segs i');
    const month = show.querySelector('.pw-cap b');
    const line = show.querySelector('.pw-cap span');
    const pause = show.querySelector('[data-pause]');
    let at = -1, front = 0, seq = 0, timer = 0, paused = false, over = false;

    // One picture at a time is opened and made screen-sized; the album keeps the small copy.
    const load = (s) => (s.photo.src
      ? thumbnail(s.photo.src, { w: 1280, h: 800, wanted: () => !over }).then((url) => (url ? `url(${url})` : ''))
      : Promise.resolve(s.photo.art));
    const wait = () => { clearTimeout(timer); if (!paused) timer = setTimeout(() => go(at + 1), EACH); };
    const end = () => { over = true; clearTimeout(timer); show.remove(); stopShow = null; };
    function go(k) {
      if (over) return;
      if (k >= list.length) { end(); return; }
      const mine = ++seq;
      clearTimeout(timer);
      const s = list[k];
      load(s).then((bg) => {
        if (over || mine !== seq) return;
        if (!bg) { go(k + 1); return; } // the file wouldn't open: the next one
        const back = layers[1 - front];
        back.style.background = bg;
        if (s.photo.src) { back.style.backgroundSize = 'cover'; back.style.backgroundPosition = 'center'; }
        setTimeout(() => {
          if (over || mine !== seq) return;
          back.classList.add('on');
          layers[front].classList.remove('on');
          front = 1 - front;
          at = k;
          month.textContent = MONTHS[s.month];
          line.textContent = `Week ${s.week} · ${new Date(s.photo.added).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
          for (let j = 0; j < segs.length; j++) segs[j].classList.toggle('past', j <= s.i);
          wait();
          if (list[k + 1]) load(list[k + 1]); // ready before its turn
        }, 60);
      });
    }
    show.addEventListener('click', (e) => {
      if (e.target.closest('[data-stop]')) { end(); return; }
      if (e.target.closest('[data-pause]')) {
        paused = !paused;
        pause.textContent = paused ? '▶' : '❚❚';
        pause.setAttribute('aria-label', paused ? 'Play' : 'Pause');
        wait();
        return;
      }
      const bar = e.target.closest('[data-bar]');
      if (bar) {
        // A tap on the bar: the first pick from that week on.
        const box = bar.getBoundingClientRect();
        const week = Math.floor((e.clientX - box.left) / box.width * slots.length);
        let k = list.findIndex((s) => s.i >= week);
        if (k < 0) k = list.length - 1;
        go(k);
      }
    });
    stopShow = end;
    go(0);
  }

  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) goBack();
    else if (e.target.closest('[data-play]')) play();
  });
}

export function mount(el, { args = [] } = {}) {
  const view = args[0];
  const year = /^\d{4}$/.test(args[1] || '') ? +args[1] : 0;
  const draw = () => {
    if (view === 'year') yearView(el, year || thisWeek().year);
    else if (view === 'play') playView(el, year || showYear(Date.now()) || thisWeek().year);
    else if (view === 'pick' && !isNaN(keyStart(args[1]))) pickView(el, args[1], true);
    else pickView(el, (dueWeek() || thisWeek()).key, false);
  };
  draw();
  // Photos arrived or were removed: show it (never in the middle of the slideshow).
  offPhotos = onPhotosChanged(() => { if (el.isConnected && !stopShow) draw(); });
}

export function unmount() {
  if (offPhotos) offPhotos();
  offPhotos = null;
  if (stopShow) stopShow();
  stopShow = null;
}
