// Plants & pets: today's care as painted tiles (due now first, then late, then done; one
// tap on Done ticks it), what is coming up underneath, one card per plant or pet
// (#/care/<id>), and a sheet for adding or changing one (#/care/add opens it). Everything
// is kept on this screen (services/care-data.js); all typing is on the screen's own keyboard.
import { topBar, esc, avatar, people } from './ui.js';
import { openKeyboard, keyboardStyle } from './keyboard.js';
import { minutesText, timeText } from '../services/display.js';
import { getPhotos, thumbnail } from '../services/tablet-photos.js';
import { chipShowsOn, onChipChanged } from '../services/timers.js';
import {
  careItems, getCareItem, saveCareItem, removeCareItem, markDone, setWho, putTask, todayList, comingUp, taskState,
  taskName, feedName, lateWords, doneWords, dayWords, isoDay, fromIso, addDays, addMonths, nextMonthly,
  plantHint, plantNames, lookArt, itemLook, LOOKS, LOOK_BG, MAX_ITEMS, MAX_FEEDS,
} from '../services/care-data.js';

const WAIT = 'care.photo'; // "Take a photo" was tapped for this one: { id, at }
const GREEN = '#3F7D45';
const tick = (size, color) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 12.5l5 5 10-11"/></svg>`;
const camera = (size, color) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="4"/></svg>`;
const LEAF = '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M5 19C5 10 11 5 20 4c0 9-5 15-13 15z"/></svg>';
const PAW = '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><ellipse cx="12" cy="16" rx="5" ry="4"/><circle cx="6" cy="10" r="2.2"/><circle cx="18" cy="10" r="2.2"/><circle cx="9" cy="6" r="2.2"/><circle cx="15" cy="6" r="2.2"/></svg>';
const SPOTS = ['Kitchen window', 'Living room', 'Bedroom', 'Bathroom', 'Balcony', 'Office', 'Hallway', 'Porch'];
const LOOK_NAME = { monstera: 'Monstera', fig: 'Fig', snake: 'Snake plant', pothos: 'Pothos', herb: 'Herb pot', dog: 'Dog', cat: 'Cat', fish: 'Fish', pet: 'Pet' };

const STYLE = `<style>
  .cr{position:absolute;left:0;top:0;width:1280px;height:800px;overflow:hidden;font-family:Inter,system-ui,sans-serif;color:#FFF8EC;
    background:radial-gradient(ellipse 1100px 700px at 28% -8%,#426F48 0%,#213C28 55%,#13241A 100%)}
  .cr button{font-family:inherit;border:0;cursor:pointer;-webkit-tap-highlight-color:transparent}
  .cr-top{position:absolute;left:40px;right:40px;top:28px}
  .cr .x-title{font-weight:600}
  .cr .x-btn.glass{background:rgba(10,20,12,.5);box-shadow:inset 0 0 0 2px rgba(255,255,255,.28)}
  .cr .x-btn.cr-add{background:#BFE3A8;color:#1E3A26}

  .cr-row{position:absolute;left:0;right:0;top:118px;height:460px;overflow-x:auto;overflow-y:hidden;white-space:nowrap;padding-left:40px;box-sizing:border-box;-webkit-overflow-scrolling:touch}
  .cr-row::-webkit-scrollbar,.cr-up::-webkit-scrollbar{display:none}
  .cr-end{display:inline-block;width:24px;height:1px}
  .cr-tile{display:inline-block;vertical-align:top;position:relative;width:227px;height:440px;margin-right:16px;border-radius:28px;background:#FFF8EC;color:#1E3A26;
    box-shadow:0 4px 10px rgba(0,0,0,.25);overflow:hidden;white-space:normal;cursor:pointer}
  .cr-tile.was{opacity:.92}
  .cr-tile.pop{animation:cr-pop .32s ease-out both}
  @keyframes cr-pop{0%{transform:scale(.96)}60%{transform:scale(1.03)}100%{transform:scale(1)}}
  .cr-pic{position:absolute;left:0;right:0;top:0;height:196px}
  .cr-circle{position:absolute;left:50%;top:24px;width:170px;height:170px;margin-left:-85px;border-radius:50%;background-size:cover;background-position:center}
  .cr-art{position:absolute;left:50%;bottom:4px;width:180px;height:180px;margin-left:-90px}
  .has > .cr-art{display:none}
  .cr-words{position:absolute;left:18px;right:18px;top:210px}
  .cr-name{font:600 26px Outfit,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .cr-what{font:500 19px Inter,sans-serif;color:#5A6E5E;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .cr-badge{display:inline-flex;align-items:center;height:34px;padding:0 14px;border-radius:17px;margin-top:12px;font:600 16px Inter,sans-serif;white-space:nowrap}
  .cr-badge.due{background:${GREEN};color:#fff}
  .cr-badge.late{background:#FBE3B8;color:#8A5A12}
  .cr-badge.ok{background:#E3F0DA;color:#2F6B35}
  .cr-badge svg{margin-right:6px}
  .cr-foot{position:absolute;left:14px;right:14px;bottom:14px;height:72px}
  .cr-done{width:100%;height:72px;border-radius:20px;background:${GREEN};color:#fff;display:flex;align-items:center;justify-content:center;font:700 23px Outfit,sans-serif}
  .cr-done svg{margin-right:10px}
  .cr-done.soft{background:#E3F0DA;color:#2F6B35}
  .cr-who{height:72px;border-radius:20px;background:#E3F0DA;color:#2F6B35;display:flex;align-items:center;justify-content:center;font:600 18px Inter,sans-serif;white-space:nowrap}
  .cr-who > * + *{margin-left:8px}
  .cr-who span{margin-right:4px}
  .cr-face{width:56px;height:56px;border-radius:50%;color:#fff;font:600 22px Inter,sans-serif;flex:none;padding:0}
  .cr-who.float{position:absolute;top:354px;padding:0 10px;box-shadow:0 4px 10px rgba(0,0,0,.25);z-index:2}
  .cr-was{height:72px;border-radius:20px;background:#E3F0DA;color:#2F6B35;display:flex;align-items:center;padding:0 14px;font:600 17px Inter,sans-serif;white-space:nowrap;box-sizing:border-box}
  .cr-was > span:first-child{margin-right:10px}
  .cr-was svg{vertical-align:-3px;margin-right:4px}

  .cr-label{position:absolute;left:44px;top:586px;font:700 15px Inter,sans-serif;letter-spacing:1.4px;color:#BFD8B8}
  .cr-up{position:absolute;left:0;right:0;top:620px;height:140px;overflow-x:auto;overflow-y:hidden;white-space:nowrap;padding-left:40px;box-sizing:border-box;-webkit-overflow-scrolling:touch}
  .cr.chip .cr-up{right:336px}
  .cr-next{display:inline-flex;vertical-align:top;align-items:center;width:288px;height:140px;margin-right:16px;border-radius:24px;background:rgba(255,248,236,.1);
    box-shadow:inset 0 0 0 1.5px rgba(255,248,236,.2);padding:0 16px 0 10px;box-sizing:border-box;cursor:pointer;white-space:normal;position:relative}
  .cr-disc{position:relative;width:96px;height:96px;border-radius:50%;background:rgba(255,248,236,.92);flex:none;margin-right:10px;overflow:hidden}
  .cr-disc .cr-circle{left:0;top:0;width:96px;height:96px;margin:0}
  .cr-disc .cr-art{left:4px;bottom:4px;width:88px;height:88px;margin:0}
  .cr-when{font:600 15px Inter,sans-serif;letter-spacing:.6px;color:#BFD8B8;text-transform:uppercase;white-space:nowrap}
  .cr-next b{display:block;font:600 21px Outfit,sans-serif;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .cr-next i{display:block;font:500 18px Inter,sans-serif;font-style:normal;opacity:.85;margin-top:2px;white-space:nowrap}

  .cr-empty{position:absolute;left:0;right:0;top:150px;display:flex;flex-direction:column;align-items:center}
  .cr-shelf{display:flex;align-items:flex-end;justify-content:center}
  .cr-pot{width:150px;height:150px;border-radius:50%;margin:0 12px;flex:none;display:flex;align-items:flex-end;justify-content:center}
  .cr-pot > div{width:150px;height:150px;margin-bottom:-4px}
  .cr-line{font:italic 500 34px Fraunces,Georgia,serif;margin:34px 0 30px}
  .cr-quiet{position:absolute;left:0;right:0;top:170px;display:flex;flex-direction:column;align-items:center}

  .cr-frame{position:absolute;left:40px;top:116px;width:400px;height:644px;border-radius:28px;overflow:hidden;box-shadow:0 0 0 8px #FFF8EC,0 6px 14px rgba(0,0,0,.3);background:#E9C28E}
  .cr-fill{position:absolute;left:0;top:0;width:100%;height:100%}
  .cr-fphoto{background-size:cover;background-position:center}
  .cr-frame.has .cr-scene{display:none}
  .cr-shade{position:absolute;left:0;right:0;bottom:0;height:170px;background:linear-gradient(180deg,rgba(40,24,14,0),rgba(40,24,14,.75))}
  .cr-fname{position:absolute;left:24px;right:24px;bottom:22px;color:#FFF8EC}
  .cr.chip .cr-fname{bottom:96px}
  .cr-fname b{display:block;font:700 50px/1.05 Outfit,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .cr-fname span{display:block;font:500 19px Inter,sans-serif;margin-top:6px;opacity:.9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .cr-cam{position:absolute;right:16px;top:16px;width:64px;height:64px;border-radius:50%;background:rgba(20,14,10,.5);display:flex;align-items:center;justify-content:center;padding:0}
  .cr-rows{position:absolute;left:472px;top:116px;width:768px;max-height:420px;overflow-y:auto;border-radius:28px;background:#FFF8EC;color:#1E3A26;box-shadow:0 4px 10px rgba(0,0,0,.25);-webkit-overflow-scrolling:touch}
  .cr-task{display:flex;align-items:center;min-height:104px;padding:0 24px;border-top:2px solid #EADFCB}
  .cr-task:first-child{border-top:0}
  .cr-task > div:first-child{flex:1;min-width:0}
  .cr-tname{font:600 23px Outfit,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .cr-tname span{font:500 19px Inter,sans-serif;color:#5A6E5E;margin-left:12px}
  .cr-last{font:500 17px Inter,sans-serif;color:#7A8A7C;margin-top:6px;display:flex;align-items:center;min-height:26px;white-space:nowrap}
  .cr-last > span:first-child{margin-right:8px}
  .cr-last em{font-style:normal;font-weight:600;color:#8A5A12}
  .cr-task .cr-done{width:auto;height:64px;padding:0 26px;font-size:21px;flex:none}
  .cr-task .cr-who{height:64px;padding:0 10px;flex:none}
  .cr-pill{height:64px;padding:0 20px;border-radius:20px;background:#F1E8D8;color:#1E3A26;display:flex;align-items:center;font:600 18px Inter,sans-serif;flex:none;white-space:nowrap}
  .cr-pill.ok{background:#E3F0DA;color:#2F6B35}
  .cr-pill svg{margin-right:8px}
  .cr-notes{position:absolute;left:472px;top:562px;width:768px;height:198px;border-radius:28px;background:#FDF0C4;color:#4A3A12;box-shadow:0 4px 10px rgba(0,0,0,.25);
    padding:22px 28px;box-sizing:border-box;text-align:left;display:block;overflow:hidden}
  .cr-notes small{display:block;font:700 15px Inter,sans-serif;letter-spacing:1.4px;color:#9A7A2A}
  .cr-notes span{display:block;font:italic 500 26px/1.4 Fraunces,Georgia,serif;margin-top:8px}
  .cr-notes span.none{font:600 20px Inter,sans-serif;color:#9A7A2A;margin-top:40px;text-align:center}

  .cr-dim{position:absolute;left:0;top:0;width:100%;height:100%;background:rgba(6,14,8,.45);z-index:5}
  .cr-sheet{position:absolute;left:250px;top:24px;width:780px;height:752px;border-radius:32px;background:#FFF8EC;color:#1E3A26;box-shadow:0 8px 24px rgba(0,0,0,.45);display:flex;flex-direction:column;overflow:hidden}
  .cr-sheet.in{animation:cr-up .24s ease-out both}
  @keyframes cr-up{0%{transform:translate3d(0,40px,0);opacity:0}100%{transform:translate3d(0,0,0);opacity:1}}
  .cr-head{display:flex;align-items:center;height:72px;padding:0 12px;border-bottom:2px solid #EADFCB;flex:none}
  .cr-head div{flex:1;text-align:center;font:600 24px Outfit,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .cr-plain{min-height:56px;min-width:104px;background:none;font:600 19px Inter,sans-serif;color:#5A6E5E}
  .cr-plain.go{font:700 20px Inter,sans-serif;color:${GREEN}}
  .cr-body{flex:1;min-height:0;overflow-y:auto;padding-bottom:16px;-webkit-overflow-scrolling:touch}
  .cr-seg{margin:14px 16px 0;display:flex;padding:6px;border-radius:22px;background:#EFE5D2}
  .cr-seg button{flex:1;height:64px;border-radius:18px;display:flex;align-items:center;justify-content:center;font:600 21px Inter,sans-serif;background:none;color:#1E3A26}
  .cr-seg button + button{margin-left:6px}
  .cr-seg button.on{background:${GREEN};color:#fff}
  .cr-seg svg{margin-right:10px}
  .cr-in{display:block;width:748px;margin:12px 16px 0;min-height:64px;border-radius:18px;background:#fff;box-shadow:inset 0 0 0 2px #EADFCB;padding:0 22px;box-sizing:border-box;
    font:600 26px Outfit,sans-serif;color:#1E3A26;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .cr-in.empty{color:#A8B4A0}
  .cr-in.typing{box-shadow:inset 0 0 0 2px ${GREEN}}
  .cr-in.typing::after{content:"";display:inline-block;width:3px;height:32px;background:${GREEN};margin-left:3px;vertical-align:-6px}
  .cr-in.long{white-space:normal;padding:14px 22px;line-height:1.3;font-size:24px}
  .cr-looks{margin:12px 16px 0;display:flex}
  .cr-look{position:relative;width:104px;height:104px;border-radius:22px;background:#F1E8D8;display:flex;align-items:center;justify-content:center;flex:none;padding:0;margin-right:24.8px;overflow:hidden;background-size:cover;background-position:center}
  .cr-look:last-child{margin-right:0}
  .cr-look > div{width:92px;height:92px;flex:none}
  .cr-look.on{background-color:#DCEBD3;box-shadow:inset 0 0 0 4px ${GREEN}}
  .cr-list{margin:10px 16px 0}
  .cr-item{display:flex;align-items:center;width:100%;min-height:66px;padding:0 24px;background:none;font:600 21px Inter,sans-serif;color:#1E3A26;text-align:left;border-top:2px solid #EADFCB;box-sizing:border-box}
  .cr-item:first-child{border-top:0}
  .cr-now{margin-left:auto;padding-left:16px;font-weight:500;color:#5A6E5E;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:470px}
  .cr-item.open .cr-now{font-weight:600;color:${GREEN}}
  .cr-chev{margin-left:14px;color:#A8B4A0;font-size:26px;flex:none;width:14px;text-align:center}
  .cr-item.open .cr-chev{transform:rotate(90deg)}
  .cr-del{justify-content:center;color:#B4472E;margin-top:6px;border-top:2px solid #EADFCB}
  .cr-more{display:flex;align-items:center;flex-wrap:wrap;padding:0 24px 8px}
  .cr-more > *{margin:0 10px 8px 0}
  .cr-chip{min-height:56px;min-width:64px;padding:0 18px;border-radius:999px;background:#E6DCC8;color:#1E3A26;font:600 19px Inter,sans-serif;flex:none;white-space:nowrap}
  .cr-chip.on{background:${GREEN};color:#fff}
  .cr-chip.wide{flex:1 1 0}
  .cr-chip.step{width:64px;padding:0;font-size:26px}
  .cr-val{min-width:150px;text-align:center;font:600 22px Outfit,sans-serif;flex:none}
  .cr-gap{flex:1 1 0;margin:0 !important}
  .cr-grid{display:flex;flex-wrap:wrap;padding:16px 0 0 20px}
  .cr-thumb{width:170px;height:128px;border-radius:18px;background:#EFE5D2;background-size:cover;background-position:center;margin:0 16px 16px 0;padding:0}
  .cr-take{margin:auto 16px 8px;min-height:72px;border-radius:20px;background:${GREEN};color:#fff;display:flex;align-items:center;justify-content:center;font:700 22px Outfit,sans-serif;flex:none}
  .cr-take svg{margin-right:12px}
  .cr-none{text-align:center;font:italic 500 28px Fraunces,Georgia,serif;margin-top:150px}

  .cr-undo{position:absolute;left:50%;top:28px;height:64px;transform:translateX(-50%);border-radius:32px;background:#FFF8EC;color:#1E3A26;display:flex;align-items:center;padding:0 6px 0 26px;
    font:600 19px Inter,sans-serif;white-space:nowrap;box-shadow:0 4px 10px rgba(0,0,0,.3);z-index:6}
  .cr-undo button{min-height:52px;padding:0 24px;margin-left:16px;border-radius:26px;background:${GREEN};color:#fff;font:700 19px Inter,sans-serif}
  ${keyboardStyle({ panel: '#16261B', key: '#FFF8EC', ink: '#1E3A26', go: '#BFE3A8', goInk: '#1E3A26', space: '#5A6E5E' })}
  @media (prefers-reduced-motion: reduce){.cr-tile.pop,.cr-sheet.in{animation:none}}
</style>`;

// ---- Words --------------------------------------------------------------------------------
const days = (n) => `${n} day${n === 1 ? '' : 's'}`;
const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
function lastWords(at, now) {
  const d = new Date(at);
  const today = isoDay(now);
  if (isoDay(d) === today) return `Today ${timeText(d)}`;
  if (isoDay(d) === addDays(today, -1)) return `Yesterday ${timeText(d)}`;
  return d.toLocaleDateString('en-US', d.getFullYear() === now.getFullYear() ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
}
const dateWords = (iso, now) => (iso === isoDay(now) ? 'Today' : dayWords(iso, now));

// ---- Pictures -----------------------------------------------------------------------------
// The soft circle with the painted look in front; a photo from the album fills the circle instead.
function picture(item, size) {
  const look = itemLook(item);
  const photo = item.photo ? ` data-photo="${esc(item.photo.src)}" data-w="${size}" data-h="${size}"` : '';
  return `<div class="cr-circle" style="background-color:${LOOK_BG[look]}"${photo}></div><div class="cr-art">${lookArt(look)}</div>`;
}
// Small copies of the photos, drawn in once they are ready (a photo that is gone leaves the painted look).
function fillPhotos(root) {
  [].forEach.call(root.querySelectorAll('[data-photo]'), (box) => {
    thumbnail(box.dataset.photo, { w: +box.dataset.w, h: +box.dataset.h, wanted: () => box.isConnected }).then((url) => {
      if (!url || !box.isConnected) return;
      box.style.backgroundImage = `url("${url}")`;
      if (box.parentNode.classList) box.parentNode.classList.add('has');
    });
  });
}

// ---- The sheet's own copy of a plant or pet while it is being added or changed ----------------
function newForm(kind, now) {
  const plant = kind === 'plant';
  return { id: '', was: null, kind, name: '', look: LOOKS[kind][0], photo: null, sub: '', notes: '', every: 7, next: isoDay(now),
    feeds: plant ? [] : [{ id: 'f1', mins: 420 }, { id: 'f2', mins: 1050 }], flea: '', vet: '', open: '', typing: '', touched: false };
}
function formOf(item, now) {
  const f = newForm(item.kind, now);
  const one = (type) => item.tasks.filter((t) => t.type === type)[0];
  Object.assign(f, { id: item.id, was: item, name: item.name, look: item.look, photo: item.photo, sub: item.sub, notes: item.notes, touched: true });
  if (one('water')) { f.every = one('water').every; f.next = one('water').next; }
  f.feeds = item.tasks.filter((t) => t.type === 'feed').map((t) => ({ id: t.id, mins: t.mins }));
  f.flea = one('flea') ? one('flea').next : '';
  f.vet = one('vet') ? one('vet').next : '';
  return f;
}
function itemOf(f) {
  const old = (id) => (f.was && f.was.tasks.filter((t) => t.id === id)[0]) || {};
  let tasks;
  if (f.kind === 'plant') tasks = [{ id: 'w', type: 'water', every: f.every, next: f.next, last: old('w').last }];
  else {
    tasks = f.feeds.map((x) => ({ id: x.id, type: 'feed', mins: x.mins, last: old(x.id).last }));
    // (Its day of the month stays unless the date was moved: a 31st shown as Feb 28 is still a 31st.)
    if (f.flea) tasks.push({ id: 'fl', type: 'flea', next: f.flea, dom: old('fl').next === f.flea ? old('fl').dom : fromIso(f.flea).getDate(), last: old('fl').last });
    if (f.vet) tasks.push({ id: 'v', type: 'vet', next: f.vet, last: old('v').last });
  }
  return { id: f.id, kind: f.kind, name: f.name, look: f.look, photo: f.photo, sub: f.sub, notes: f.notes, tasks };
}

let cleanup = null;

export function mount(el, { args = [] } = {}) {
  let view = 'main'; // 'main' | 'card'
  let item = null; // the card's plant or pet
  let form = null; // the add / change sheet while it is open
  let picker = ''; // '' | 'form' | 'card': the photo sheet, and what it is choosing for
  let kb = null;
  let fresh = null; // { key, pop, at }: what was ticked a moment ago ("Just now", and "Who?")
  let freshTimer = 0;
  let undo = null; // { text, back }
  let undoTimer = 0;
  let clock = 0;
  let stale = false;
  let sheetIn = false;

  el.innerHTML = `${STYLE}<div class="cr" data-root><div data-view></div><div data-layer></div><div data-undo-box></div></div>`;
  const root = el.querySelector('[data-root]');
  const viewBox = root.querySelector('[data-view]');
  const layer = root.querySelector('[data-layer]');
  const undoBox = root.querySelector('[data-undo-box]');
  const here = (hash) => { try { history.replaceState(null, '', hash); } catch (e) { /* stays as it is */ } };

  // ---- Today ------------------------------------------------------------------------------
  function whoBox(e, cls = '') {
    const ppl = people();
    return `<div class="cr-who${cls}">${ppl.length === 2 ? '<span>Who?</span>' : ''}${ppl.map((p) => `<button class="cr-face" data-who="${esc(p.name)}" data-key="${esc(e.key)}" style="background:${p.color}" aria-label="${esc(p.name)}">${esc(p.initial)}</button>`).join('')}</div>`;
  }
  // Just ticked, and nobody has said who yet (asked only when there is more than one person).
  const asking = (e) => !!fresh && fresh.key === e.key && people().length > 1 && !e.task.last.who;
  function tile(e) {
    const { item: it, task } = e;
    const isFresh = !!fresh && fresh.key === e.key;
    const badge = e.state === 'due' ? '<div class="cr-badge due">Due now</div>'
      : e.state === 'late' ? `<div class="cr-badge late">${lateWords(e.days)}</div>`
        : isFresh ? `<div class="cr-badge ok">${tick(18, '#2F6B35')}Just now</div>` : '';
    let foot;
    if (e.state !== 'done') foot = `<button class="cr-done${e.state === 'soon' ? ' soft' : ''}" data-done="${esc(e.key)}">${tick(26, e.state === 'soon' ? '#2F6B35' : '#fff')}Done</button>`;
    else if (asking(e) && people().length <= 3) foot = whoBox(e);
    else foot = `<div class="cr-was">${task.last.who ? avatar(task.last.who, 40) : ''}<span>${tick(18, '#2F6B35')}${esc(timeText(new Date(task.last.at)))}</span></div>`;
    return `<div class="cr-tile${e.state === 'done' ? ' was' : ''}${isFresh && fresh.pop ? ' pop' : ''}" data-open="${esc(it.id)}" data-tile="${esc(e.key)}">
      <div class="cr-pic">${picture(it, 170)}</div>
      <div class="cr-words"><div class="cr-name">${esc(it.name)}</div>
        <div class="cr-what">${esc(taskName(task))}${task.type === 'feed' ? ` · ${esc(minutesText(task.mins))}` : ''}</div>${badge}</div>
      <div class="cr-foot">${foot}</div></div>`;
  }
  const shelf = (looks) => `<div class="cr-shelf">${looks.map((l) => `<div class="cr-pot" style="background:${LOOK_BG[l]}"><div>${lookArt(l)}</div></div>`).join('')}</div>`;
  function drawMain() {
    const now = new Date();
    const items = careItems();
    const keep = [viewBox.querySelector('.cr-row'), viewBox.querySelector('.cr-up')].map((x) => (x ? x.scrollLeft : 0));
    const add = '<button class="x-btn cr-add" data-act="add">+ Add</button>';
    if (!items.length) {
      viewBox.innerHTML = `<div class="cr-top">${topBar({ title: 'Plants & pets' })}</div>
        <div class="cr-empty">${shelf(['monstera', 'dog', 'snake', 'cat'])}<div class="cr-line">Nothing to look after yet</div>
        <button class="x-btn lg cr-add" data-act="add">+ Add</button></div>`;
      return;
    }
    const list = todayList(items, now);
    // What was just ticked stays where the finger is for a moment ("Who?"), then joins the done ones.
    const moved = fresh ? list.findIndex((x) => x.key === fresh.key) : -1;
    if (moved >= 0 && fresh.at >= 0) list.splice(Math.min(fresh.at, list.length - 1), 0, list.splice(moved, 1)[0]);
    const up = comingUp(items, now);
    viewBox.innerHTML = `<div class="cr-top">${topBar({ title: 'Plants & pets', right: add })}</div>
      ${list.length ? `<div class="cr-row">${list.map(tile).join('')}<span class="cr-end"></span></div>`
    : `<div class="cr-quiet">${shelf(items.slice(0, 6).map(itemLook))}<div class="cr-line">Nothing today</div></div>`}
      ${up.length ? `<div class="cr-label">COMING UP</div><div class="cr-up">${up.map((e) => `<div class="cr-next" data-open="${esc(e.item.id)}">
        <div class="cr-disc">${picture(e.item, 96)}</div>
        <div style="min-width:0"><div class="cr-when">${esc(dayWords(e.date, now))}</div><b>${esc(e.item.name)}</b><i>${esc(taskName(e.task))}</i></div></div>`).join('')}<span class="cr-end"></span></div>` : ''}`;
    const row = viewBox.querySelector('.cr-row');
    const upRow = viewBox.querySelector('.cr-up');
    if (row) row.scrollLeft = keep[0];
    if (upRow) upRow.scrollLeft = keep[1];
    // More than three people: their faces don't fit inside a tile, so they float over its foot.
    const e = fresh && list.filter((x) => x.key === fresh.key)[0];
    if (row && e && asking(e) && people().length > 3) {
      const t = [].filter.call(row.querySelectorAll('[data-tile]'), (x) => x.dataset.tile === e.key)[0];
      row.insertAdjacentHTML('beforeend', whoBox(e, ' float'));
      const bar = row.lastElementChild;
      const w = bar.offsetWidth;
      let left = t.offsetLeft + 14;
      if (left + w > row.scrollLeft + 1264) left = Math.max(row.scrollLeft + 16, t.offsetLeft + 213 - w);
      bar.style.left = `${left}px`;
    }
  }

  // ---- One plant's or pet's card -------------------------------------------------------------
  function taskRow(task, now) {
    const s = taskState(task, now);
    const e = { key: `${item.id}:${task.id}`, task };
    const name = task.type === 'vet' ? 'Vet' : taskName(task);
    const plan = task.type === 'water' ? `Every ${days(task.every)}${s.state === 'later' || s.state === 'done' ? ` · ${dayWords(task.next, now)}` : ''}`
      : task.type === 'feed' ? `${minutesText(task.mins)} daily`
        : task.type === 'flea' ? `${ordinal(task.dom)} of each month` : 'Checkup';
    const last = `${task.last ? `${task.last.who ? avatar(task.last.who, 26) : ''}<span>${esc(lastWords(task.last.at, now))}</span>` : ''}${
      s.state === 'late' ? `${task.last ? '<span>&nbsp;·&nbsp;</span>' : ''}<em>${lateWords(s.days)}</em>` : ''}`;
    let right;
    const button = (soft) => `<button class="cr-done${soft ? ' soft' : ''}" data-done="${esc(e.key)}">${tick(22, soft ? '#2F6B35' : '#fff')}Done</button>`;
    if (s.state === 'done') right = asking(e) ? whoBox(e) : `<div class="cr-pill ok">${tick(20, '#2F6B35')}Today</div>`;
    else if (s.state === 'due' || s.state === 'late') right = button(false);
    else if (s.state === 'soon' || task.type === 'water') right = button(true);
    else right = `<button class="cr-pill" data-act="edit:${task.type}">${esc(dayWords(task.next, now))}</button>`;
    return `<div class="cr-task"><div><div class="cr-tname">${esc(name)}<span>${esc(plan)}</span></div><div class="cr-last">${last}</div></div>${right}</div>`;
  }
  function drawCard() {
    const now = new Date();
    const look = itemLook(item);
    const keep = viewBox.querySelector('.cr-rows');
    const top = keep ? keep.scrollTop : 0;
    viewBox.innerHTML = `<div class="cr-top">${topBar({ title: '', back: '#/care', backLabel: '← Plants & pets', right: '<button class="x-btn glass" data-act="edit">Edit</button>' })}</div>
      <div class="cr-frame">
        ${item.photo ? `<div class="cr-fill cr-fphoto" data-photo="${esc(item.photo.src)}" data-w="400" data-h="644"></div>` : ''}
        <div class="cr-scene">
          <div class="cr-fill" style="background:linear-gradient(180deg,#F3D9B0 0%,#E9C28E 62%,#8A5A3A 62%,#7A4C30 100%)"></div>
          <div style="position:absolute;left:40px;top:60px;width:120px;height:150px;border-radius:8px;background:#CFE3EE;box-shadow:inset 0 0 0 8px #FFF4E2"></div>
          ${item.kind === 'pet' ? `<div style="position:absolute;left:270px;top:40px;width:70px;height:220px">${lookArt('fig')}</div>` : ''}
          <div style="position:absolute;left:30px;top:${item.kind === 'pet' ? 210 : 150}px;width:340px;height:340px">${lookArt(look)}</div>
        </div>
        <div class="cr-shade"></div>
        <div class="cr-fname"><b>${esc(item.name)}</b>${item.sub ? `<span>${esc(item.sub)}</span>` : ''}</div>
        <button class="cr-cam" data-act="photo" aria-label="Photo">${camera(28, '#fff')}</button>
      </div>
      ${item.tasks.length ? `<div class="cr-rows">${item.tasks.map((t) => taskRow(t, now)).join('')}</div>` : ''}
      <button class="cr-notes" data-act="notes"><small>NOTES</small>${item.notes ? `<span>${esc(item.notes)}</span>` : '<span class="none">+ Add</span>'}</button>`;
    const rows = viewBox.querySelector('.cr-rows');
    if (rows) rows.scrollTop = top;
  }

  // ---- The add / change sheet ----------------------------------------------------------------
  const FIELD = { name: ['Name', 24], sub: ['', 40], notes: ['Notes', 160] };
  const subLabel = () => (form.kind === 'plant' ? 'Spot' : 'About');
  function formRows(f, now) {
    const today = isoDay(now);
    const chip = (act, on, label, cls = '') => `<button data-f="${act}" class="cr-chip${on ? ' on' : ''}${cls}">${label}</button>`;
    const date = (k, big) => `<div class="cr-more">${big ? chip(`d:${k}:none`, false, 'None') : chip(`d:${k}:today`, f[k] === today, 'Today')}<span class="cr-gap"></span>
      ${big ? chip(`d:${k}:-7`, false, '−1 wk') : ''}${chip(`d:${k}:-1`, false, '−', ' step')}<div class="cr-val">${esc(dateWords(f[k], now))}</div>${chip(`d:${k}:1`, false, '+', ' step')}
      ${chip(`d:${k}:7`, false, '+1 wk')}${big ? chip(`d:${k}:mo`, false, '+1 mo') : ''}</div>`;
    const more = {
      every: () => `<div class="cr-more" style="flex-wrap:nowrap">${chip('ev:-', false, '−', ' step')}${[3, 5, 7, 10, 14].map((n) => chip(`ev:${n}`, f.every === n, n, ' wide')).join('')}${chip('ev:+', false, '+', ' step')}</div>`,
      next: () => date('next', false),
      flea: () => date('flea', true),
      vet: () => date('vet', true),
      feeds: () => f.feeds.map((x, i) => `<div class="cr-more">${chip(`fd:${i}:-60`, false, '−1 h')}${chip(`fd:${i}:-15`, false, '−', ' step')}<div class="cr-val">${esc(minutesText(x.mins))}</div>
        ${chip(`fd:${i}:15`, false, '+', ' step')}${chip(`fd:${i}:60`, false, '+1 h')}<span class="cr-gap"></span>${chip(`fd:${i}:x`, false, '✕', ' step')}</div>`).join('')
        + (f.feeds.length < MAX_FEEDS ? `<div class="cr-more">${chip('fd:add', false, '+ Time')}</div>` : ''),
    };
    const rows = f.kind === 'plant'
      ? [['every', 'Water every', days(f.every)], ['next', 'Next', dateWords(f.next, now)]]
      : [['feeds', 'Feeding', f.feeds.length ? f.feeds.map((x) => minutesText(x.mins)).join(' · ') : 'None'],
        ['flea', 'Flea & tick', f.flea ? dateWords(f.flea, now) : 'None'], ['vet', 'Vet', f.vet ? dateWords(f.vet, now) : 'None']];
    return rows.map(([k, label, value]) => `<button data-f="open:${k}" class="cr-item${f.open === k ? ' open' : ''}"><span>${label}</span><span class="cr-now">${esc(value)}</span><span class="cr-chev">›</span></button>${
      f.open === k ? more[k]() : ''}`).join('')
      + [['sub', subLabel(), f.sub], ['notes', 'Notes', f.notes]].map(([k, label, value]) => `<button data-f="type:${k}" class="cr-item"><span>${label}</span><span class="cr-now">${esc(value)}</span><span class="cr-chev">›</span></button>`).join('');
  }
  function drawForm() {
    const f = form;
    const now = new Date();
    const old = layer.querySelector('.cr-body');
    const top = old ? old.scrollTop : 0;
    const box = (k) => { const v = f[k]; const label = k === 'sub' ? subLabel() : FIELD[k][0]; return `<button data-f="type:${k}" data-box class="cr-in${v ? '' : ' empty'}${f.typing === k ? ' typing' : ''}${k === 'notes' ? ' long' : ''}">${esc(v || label)}</button>`; };
    let body;
    if (f.typing && f.typing !== 'name') body = box(f.typing);
    else {
      body = `${f.id ? '' : `<div class="cr-seg"><button data-f="kind:plant" class="${f.kind === 'plant' ? 'on' : ''}">${LEAF}Plant</button><button data-f="kind:pet" class="${f.kind === 'pet' ? 'on' : ''}">${PAW}Pet</button></div>`}
        ${box('name')}
        <div class="cr-looks">${LOOKS[f.kind].map((l) => `<button data-f="look:${l}" class="cr-look${!f.photo && f.look === l ? ' on' : ''}" aria-label="${LOOK_NAME[l]}"><div>${lookArt(l)}</div></button>`).join('')}
          <button data-f="photo" class="cr-look${f.photo ? ' on' : ''}" aria-label="Photo"${f.photo ? ` data-photo="${esc(f.photo.src)}" data-w="104" data-h="104"` : ''}>${f.photo ? '' : camera(40, '#1E3A26')}</button></div>
        <div class="cr-list">${formRows(f, now)}${f.id ? '<button data-f="remove" class="cr-item cr-del">Remove</button>' : ''}</div>`;
    }
    layer.innerHTML = `<div class="cr-dim"><div class="cr-sheet${sheetIn ? ' in' : ''}">
      <div class="cr-head"><button data-f="cancel" class="cr-plain">Cancel</button><div>${f.id ? esc(f.was.name) : f.kind === 'plant' ? 'New plant' : 'New pet'}</div>
        <button data-f="save" class="cr-plain go">${f.id ? 'Save' : 'Add'}</button></div>
      <div class="cr-body">${body}</div></div></div>`;
    sheetIn = false;
    layer.querySelector('.cr-body').scrollTop = top;
    fillPhotos(layer);
  }
  function openForm(f, { type = '', open = '' } = {}) {
    form = f;
    f.open = open;
    sheetIn = true;
    drawForm();
    if (type) typeField(type);
  }
  function closeForm() {
    if (kb) { const k = kb; kb = null; k.close(); }
    form = null;
    picker = '';
    layer.innerHTML = '';
    if (stale) { stale = false; draw(); }
  }
  // A plant's name says how often it wants water and which pot it gets, until the person chooses.
  function hint(f) {
    const h = f.kind === 'plant' && !f.touched ? plantHint(f.name) : null;
    if (h) { f.every = h.every; if (!f.photo) f.look = h.look; }
  }
  function typeField(k) {
    const f = form;
    if (!f || kb) return;
    f.typing = k;
    f.open = '';
    drawForm();
    const pool = (t) => {
      if (f.kind !== 'plant' || k === 'notes') return [];
      if (k === 'name') return plantNames(t, 5);
      const q = t.trim().toLowerCase();
      return SPOTS.filter((x) => x.toLowerCase().indexOf(q) === 0).slice(0, 5);
    };
    kb = openKeyboard(root, {
      go: 'Done', slots: 5, text: f[k], max: FIELD[k][1], suggest: pool,
      onChange: (t) => {
        f[k] = cap(t);
        if (k === 'name') hint(f);
        const b = layer.querySelector('[data-box]');
        if (b) { b.textContent = f[k] || (k === 'sub' ? subLabel() : FIELD[k][0]); b.classList.toggle('empty', !f[k]); }
      },
      onGo: (pick, board) => { if (pick) { f[k] = pick; if (k === 'name') hint(f); } board.close(); },
      onClose: () => { kb = null; if (form) { form.typing = ''; form[k] = form[k].trim(); drawForm(); } },
    });
  }
  function saveForm() {
    const f = form;
    if (!f.name.trim()) { typeField('name'); return null; }
    if (!f.id && careItems().length >= MAX_ITEMS) return null;
    const saved = saveCareItem(itemOf(f));
    if (!saved) return null;
    if (view === 'card') item = saved;
    return saved;
  }
  function formAction(act) {
    const f = form;
    const now = new Date();
    const today = isoDay(now);
    const [a, b, c] = act.split(':');
    if (a === 'type') { if (kb) kb.close(); else typeField(b); return; }
    if (kb) { kb.close(); return; } // a tap outside the keyboard puts it away first
    if (a === 'cancel') { closeForm(); return; }
    if (a === 'save') { if (saveForm()) { closeForm(); draw(); arm(); } return; }
    if (a === 'remove') {
      const gone = removeCareItem(f.id);
      closeForm();
      if (!gone) return;
      view = 'main'; item = null; here('#/care');
      offerUndo(`${gone.item.name} removed`, () => saveCareItem(gone.item, gone.at));
      draw(); arm();
      return;
    }
    if (a === 'photo') { picker = 'form'; drawPicker(); return; }
    if (a === 'kind') { if (f.kind !== b) { const n = newForm(b, now); n.name = f.name; form = n; hint(n); } }
    else if (a === 'look') { f.look = b; f.photo = null; f.touched = true; }
    else if (a === 'open') {
      f.open = f.open === b ? '' : b;
      if (f.open === 'flea' && !f.flea) f.flea = nextMonthly(today, 1);
      if (f.open === 'vet' && !f.vet) f.vet = addMonths(today, 1);
    } else if (a === 'ev') { f.every = Math.max(1, Math.min(60, b === '-' ? f.every - 1 : b === '+' ? f.every + 1 : +b)); f.touched = true; }
    else if (a === 'd') {
      const v = c === 'none' ? '' : c === 'today' ? today : c === 'mo' ? addMonths(f[b], 1) : addDays(f[b], +c);
      f[b] = v && v < today ? today : v;
      if (!v) f.open = '';
    } else if (a === 'fd') {
      if (b === 'add') { const last = f.feeds[f.feeds.length - 1]; f.feeds.push({ id: `f${Date.now().toString(36)}`, mins: last ? Math.min(1380, last.mins + 300) : 420 }); }
      else if (c === 'x') f.feeds.splice(+b, 1);
      else f.feeds[+b].mins = Math.max(0, Math.min(1425, f.feeds[+b].mins + +c));
    }
    drawForm();
  }

  // ---- A photo from the album -----------------------------------------------------------------
  const album = () => getPhotos().filter((p) => !p.video).slice(0, 8);
  function drawPicker() {
    const list = album();
    layer.innerHTML = `<div class="cr-dim"><div class="cr-sheet">
      <div class="cr-head"><button data-pick="cancel" class="cr-plain">Cancel</button><div>Photo</div><span class="cr-plain"></span></div>
      ${list.length ? `<div class="cr-grid">${list.map((p, i) => `<button class="cr-thumb" data-pick="${i}" data-photo="${esc(p.src)}" data-w="170" data-h="128" aria-label="Photo ${i + 1}"></button>`).join('')}</div>` : '<div class="cr-none">No photos yet</div>'}
      <button class="cr-take" data-pick="take">${camera(28, '#fff')}Take a photo</button></div></div>`;
    fillPhotos(layer);
  }
  function pickAction(act) {
    const forCard = picker === 'card';
    const back = () => { picker = ''; if (form) drawForm(); else { layer.innerHTML = ''; if (stale) { stale = false; draw(); } } };
    if (act === 'cancel') { back(); return; }
    if (act === 'take') {
      // The camera saves into the album and goes back to Home or the menu; the next time this
      // app opens, the new photo is this one's picture (see arrived()).
      let id = forCard ? item.id : '';
      if (!forCard) { picker = ''; const saved = saveForm(); if (!saved) return; id = saved.id; }
      try { sessionStorage.setItem(WAIT, JSON.stringify({ id, at: Date.now() })); } catch (e) { /* the photo can still be picked from the album */ }
      location.hash = '#/camera';
      return;
    }
    const p = album()[+act];
    if (p) {
      const photo = { id: p.id, src: p.src };
      if (forCard) { item = saveCareItem(Object.assign({}, item, { photo })) || item; draw(); } else { form.photo = photo; form.touched = true; }
    }
    back();
  }
  // Back from the camera: the photo taken since "Take a photo" becomes that one's picture.
  function arrived() {
    let w = null;
    try { w = JSON.parse(sessionStorage.getItem(WAIT) || 'null'); sessionStorage.removeItem(WAIT); } catch (e) { return ''; }
    const it = w && Date.now() - w.at < 15 * 60000 ? getCareItem(w.id) : null;
    const p = it ? getPhotos().filter((x) => !x.video)[0] : null;
    if (!p || p.added < w.at) return '';
    saveCareItem(Object.assign({}, it, { photo: { id: p.id, src: p.src } }));
    return it.id;
  }

  // ---- Done, who, undo -----------------------------------------------------------------------
  function drawUndo() {
    undoBox.innerHTML = undo ? `<div class="cr-undo"><span>${esc(undo.text)}</span><button data-undo>Undo</button></div>` : '';
  }
  function offerUndo(text, back) {
    undo = { text, back };
    clearTimeout(undoTimer);
    undoTimer = setTimeout(() => { undo = null; drawUndo(); }, 8000);
    drawUndo();
  }
  function done(key) {
    const at = todayList().findIndex((x) => x.key === key);
    const was = markDone(key);
    if (!was) return;
    const id = key.split(':')[0];
    const it = getCareItem(id);
    fresh = { key, pop: true, at };
    clearTimeout(freshTimer);
    freshTimer = setTimeout(() => { fresh = null; draw(); }, 5000);
    offerUndo(doneWords(it, was), () => { putTask(id, was); if (fresh && fresh.key === key) { fresh = null; clearTimeout(freshTimer); } });
    draw();
    arm();
  }

  // ---- Drawing, and the moments it changes by itself --------------------------------------------
  function draw() {
    if (form || picker) { stale = true; return; }
    if (view === 'card') { item = getCareItem(item.id); if (!item) { view = 'main'; here('#/care'); } }
    if (view === 'card') drawCard(); else drawMain();
    if (fresh) fresh.pop = false;
    fillPhotos(viewBox);
  }
  // The next minute something becomes due (a feeding time), or midnight: draw again then, not every minute.
  function arm() {
    clearTimeout(clock);
    const now = new Date();
    const m = now.getHours() * 60 + now.getMinutes();
    let next = 1440;
    careItems().forEach((it) => it.tasks.forEach((t) => { if (t.type === 'feed' && t.mins > m && t.mins < next) next = t.mins; }));
    clock = setTimeout(() => { draw(); arm(); }, (next - m) * 60000 - now.getSeconds() * 1000 + 1500);
  }

  root.addEventListener('click', (ev) => {
    const t = ev.target instanceof Element ? ev.target : null;
    if (!t || t.closest('[data-kb]')) return;
    const hit = t.closest('[data-f],[data-pick],[data-undo],[data-who],[data-done],[data-act],[data-open]');
    if (form && !picker) { if (hit && hit.dataset.f) formAction(hit.dataset.f); else if (kb) kb.close(); return; }
    if (!hit) return;
    if (hit.dataset.pick != null) { pickAction(hit.dataset.pick); return; }
    if (hit.hasAttribute('data-undo')) { const u = undo; undo = null; clearTimeout(undoTimer); drawUndo(); if (u) { u.back(); draw(); arm(); } return; }
    if (hit.dataset.who != null) { setWho(hit.dataset.key, hit.dataset.who); fresh = null; clearTimeout(freshTimer); draw(); return; }
    if (hit.dataset.done) { done(hit.dataset.done); return; }
    if (hit.dataset.open) { location.hash = `#/care/${encodeURIComponent(hit.dataset.open)}`; return; }
    const act = hit.dataset.act || '';
    if (act === 'add') openForm(newForm('plant', new Date()));
    else if (act === 'edit') openForm(formOf(item, new Date()));
    else if (act.indexOf('edit:') === 0) openForm(formOf(item, new Date()), { open: act.slice(5) });
    else if (act === 'notes') openForm(formOf(item, new Date()), { type: 'notes' });
    else if (act === 'photo') { picker = 'card'; drawPicker(); }
  });

  // The kitchen timer's chip keeps a bottom corner: the row underneath ends before it.
  const chip = () => { let on = false; try { on = chipShowsOn('care'); } catch (e) { on = false; } root.classList.toggle('chip', on); };
  chip();
  const offChip = onChipChanged(chip);

  const shown = arrived() || (args[0] && args[0] !== 'add' ? args[0] : '');
  item = shown ? getCareItem(shown) : null;
  if (item) { view = 'card'; if (shown !== args[0]) here(`#/care/${encodeURIComponent(item.id)}`); }
  draw();
  arm();
  if (args[0] === 'add') { here('#/care'); openForm(newForm('plant', new Date())); }

  cleanup = () => {
    clearTimeout(freshTimer); clearTimeout(undoTimer); clearTimeout(clock);
    offChip();
    if (kb) { const k = kb; kb = null; form = null; k.close(); }
  };
}

export function unmount() {
  if (cleanup) cleanup();
  cleanup = null;
}
