// House manual: a blueprint-blue screen of paper cards for the things about a home nobody
// remembers when they are needed. The guest Wi-Fi as a code a phone's camera joins with
// ("Show big" fills the screen with it), where the shut-offs are (with photos from the
// album), who to ring, the appliances and their warranties, the paint on each wall, the
// filters and when they are next due.
//
//   #/manual            the six cards        #/manual/<section>   one section's cards
//   #/manual/wifi       the big Wi-Fi card   #/manual/add         the add sheet
//
// Everything is typed on the screen's own keyboard (keyboard.js): nothing here is an
// <input>. What is saved lives in services/manual-data.js.
import { topBar, esc } from './ui.js';
import { openKeyboard, keyboardStyle } from './keyboard.js';
import { getPhotos, thumbnail, qrSvg } from '../services/tablet-photos.js';
import { soften } from '../services/soft-bg.js';
import * as data from '../services/manual-data.js';

const INK = '#16304F';
const PAPER = '#F7F2E7';
const AMBER = '#F2B544';
const MUTED = '#44566C';
const SOFT = '#6A7B90';
const LINE = '#E8E0D0';

const icon = (d, size = 30, stroke = INK) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICONS = {
  wifi: '<path d="M2 9a15 15 0 0 1 20 0M5 13a10 10 0 0 1 14 0M8.5 16.5a5 5 0 0 1 7 0"/><circle cx="12" cy="20" r="1.3"/>',
  shutoffs: '<circle cx="12" cy="10" r="6"/><path d="M12 4v12M6 10h12M3 20h18M12 16v4"/>',
  numbers: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
  appliances: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M5 9h14M9 6h.01M12 6h.01"/><circle cx="12" cy="15" r="3"/>',
  paint: '<rect x="3" y="4" width="15" height="6" rx="1.5"/><path d="M18 7h3v5h-9v3"/><rect x="10.5" y="15" width="3" height="6" rx="1"/>',
  filters: '<circle cx="12" cy="12" r="2"/><path d="M12 10c0-4 1-7 4-7 2 0 2 3 0 5M14 12c4 0 7 1 7 4 0 2-3 2-5 0M12 14c0 4-1 7-4 7-2 0-2-3 0-5M10 12c-4 0-7-1-7-4 0-2 3-2 5 0"/>',
  other: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 12h7M9 16h7"/>',
};
const EXPAND = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
// The first day's picture: a house drawn as a blueprint.
const HOUSE = `<svg width="420" height="300" viewBox="0 0 420 300" fill="none" stroke="#CFE3F7" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M70 150L210 50l140 100"/><path d="M100 132v128h220V132"/><path d="M186 260v-70h48v70"/><path d="M126 164h40v40h-40zM254 164h40v40h-40z"/><path d="M146 164v40M126 184h40M274 164v40M254 184h40"/>
  <path d="M270 92V62h26v50"/><circle cx="226" cy="226" r="3"/>
  <g stroke-width="2" opacity=".6"><path d="M100 282h220M100 274v16M320 274v16"/><path d="M40 132v128M32 132h16M32 260h16"/><path d="M20 260h380" stroke-dasharray="2 10"/></g></svg>`;

// Wall colours to pick the nearest from (the name and code say exactly which).
const PALETTE = ['#F4F3EE', '#EFE9DC', '#E8DFCF', '#DCD3C6', '#D1CBC1', '#C4BCB0',
  '#B7B2A8', '#9A9A96', '#77797B', '#55595E', '#3E4A55', '#2B2F36',
  '#DCE6EA', '#B9CCD6', '#8FAFC2', '#5F86A3', '#34597A', '#1F3550',
  '#DDE5D8', '#CBD3C8', '#A9BBA3', '#7C9A7E', '#55735A', '#2F4A3A',
  '#F3E3C3', '#EBCB8B', '#D9A05B', '#C97B4A', '#A73A32', '#6E2A2A',
  '#F0D9D5', '#E2B8B0', '#C98F8B', '#B9A3C4', '#8C7AA8', '#5B4A78'];
const dark = (hex) => {
  const n = parseInt(String(hex).slice(1), 16);
  return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114 < 140;
};

// What each section's sheet asks, after the name: [field, label, kind].
//   text: words · code: capitals and numbers · phone · secret: exactly as typed
//   choice / color / date: picked on the right of the sheet
const ROWS = {
  shutoffs: [['where', 'Where', 'text'], ['note', 'Note', 'text']],
  numbers: [['phone', 'Number', 'phone'], ['note', 'Note', 'text']],
  appliances: [['model', 'Model', 'code'], ['warranty', 'Warranty ends', 'date'], ['note', 'Note', 'text']],
  paint: [['where', 'Room', 'text'], ['color', 'Colour', 'color'], ['code', 'Code', 'code'], ['finish', 'Finish', 'choice'], ['brand', 'Brand', 'text']],
  filters: [['size', 'Size', 'code'], ['note', 'Note', 'text'], ['every', 'Change every', 'choice'], ['changed', 'Last changed', 'date']],
  other: [['where', 'Where', 'text'], ['note', 'Note', 'text']],
  wifi: [['password', 'Password', 'secret']],
};
const NAME = {
  shutoffs: ['Name', 'text', 40], numbers: ['Who', 'text', 40], appliances: ['Appliance', 'text', 40], paint: ['Colour name', 'text', 40],
  filters: ['What', 'text', 40], other: ['Name', 'text', 40], wifi: ['Network', 'secret', 32],
};
const HAS_PHOTOS = { shutoffs: true, appliances: true, other: true };
const MAX = { where: 60, note: 80, phone: 24, model: 40, code: 20, brand: 30, size: 20, password: 63 };
const WORDS = {
  'shutoffs.name': ['Water', 'Breakers', 'Gas', 'Water heater', 'Sprinklers'],
  'numbers.name': ['Plumber', 'Electrician', 'Vet', 'Doctor', 'Dentist', 'Landlord', 'Neighbour'],
  'appliances.name': ['Dishwasher', 'Fridge', 'Washer', 'Dryer', 'Oven', 'Furnace', 'Water heater'],
  'filters.name': ['Furnace', 'Fridge water', 'Range hood', 'Smoke alarms', 'Vacuum'],
  where: ['Basement', 'Garage', 'Kitchen', 'Outside', 'Laundry', 'Attic', 'Hall closet'],
  'paint.where': ['Living room', 'Kitchen', 'Bedroom', 'Bathroom', 'Hall', 'Trim & doors', 'Front door'],
  brand: ['Benjamin Moore', 'Sherwin-Williams', 'Behr', 'Valspar', 'Farrow & Ball', 'Dulux'],
  size: ['16×25×1', '20×20×1', '16×20×1', '20×25×1', 'AA', 'AAA', '9V'],
};

const CSS = `
  .hm{position:absolute;top:0;right:0;bottom:0;left:0;overflow:hidden;font-family:Inter,system-ui,sans-serif;color:#fff;
    background:radial-gradient(ellipse 1100px 700px at 28% -8%,#2B5F8E 0%,#17395E 52%,#0D2340 100%)}
  .hm-grid{position:absolute;top:0;right:0;bottom:0;left:0;pointer-events:none;
    background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Cpath d='M0 39.5h40M.5 0v40' stroke='%23fff' stroke-opacity='.045'/%3E%3C/svg%3E")}
  .hm button{font-family:inherit;border:0;cursor:pointer;-webkit-tap-highlight-color:transparent}
  .hm-top{position:absolute;left:40px;top:20px;right:40px}
  .hm-top .x-title{font-size:40px}
  .hm-add{background:${AMBER};color:#2A1D05;font-weight:700}
  .hm-add .pl{font-size:26px;line-height:1}
  .hm-card{position:absolute;box-sizing:border-box;border-radius:26px;background:${PAPER};color:${INK};box-shadow:0 6px 14px rgba(0,0,0,.28);
    overflow:hidden;padding:22px;display:flex;flex-direction:column;text-align:left;cursor:pointer}
  .hm-card:active,.hm-e:active{opacity:.86}
  .hm-h{display:flex;align-items:center;gap:12px;flex:none}
  .hm-h b{font:500 26px Outfit,sans-serif;white-space:nowrap}
  .hm-h i{margin-left:auto;font:600 18px Inter,sans-serif;font-style:normal;color:${SOFT}}
  .hm-plus{flex:1;margin-top:16px;border-radius:18px;border:3px dashed #B9C3CF;display:flex;align-items:center;justify-content:center;font:500 44px Inter,sans-serif;color:#8D9AAB}
  .hm-r{display:flex;align-items:baseline;gap:10px;padding:8px 0;border-top:2px solid ${LINE}}
  .hm-r b{font:600 20px Inter,sans-serif;flex:none;max-width:170px}
  .hm-r span{font:500 19px Inter,sans-serif;color:${MUTED};flex:1;min-width:0}
  .hm-r.col{flex-direction:column;gap:0;padding:9px 0;align-items:stretch}
  .hm-r.col span{font-size:18px;flex:none}
  .hm-cut{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .hm-ph{background:#D9D3C6 center/cover no-repeat;border-radius:16px}
  .hm-warn{margin-top:auto;border-radius:14px;background:#FDE9C2;color:#6B4300;padding:10px 14px;font:600 17px Inter,sans-serif}
  .hm-warn span{font-weight:500;display:block}
  .hm-big{font:700 36px/1 Outfit,sans-serif}
  .hm-sub{margin-top:5px;font:500 18px Inter,sans-serif;color:${MUTED}}
  .hm-next{margin-top:auto;font:600 18px Inter,sans-serif;color:#2D6A4F}
  .hm-next.due{color:#B3261E}
  .hm-quiet{margin:-14px -14px -14px auto;min-height:56px;padding:0 14px;background:transparent;font:600 18px Inter,sans-serif;color:${SOFT}}
  .hm-qr{align-self:center;margin-top:18px;padding:10px;border-radius:18px;border:3px solid #E3E8EF;background:#fff}
  .hm-showbig{margin-top:auto;min-height:72px;border-radius:22px;background:${INK};color:#fff;display:flex;align-items:center;justify-content:center;gap:12px;font:700 24px Outfit,sans-serif;width:100%}
  .hm-empty{position:absolute;left:0;right:0;top:150px;display:flex;flex-direction:column;align-items:center;gap:26px}
  .hm-empty p{margin:0;font:500 30px Outfit,sans-serif}

  .hm-list{position:absolute;left:40px;right:0;top:104px;bottom:0;overflow-y:auto;-webkit-overflow-scrolling:touch;
    display:flex;flex-wrap:wrap;align-content:flex-start;gap:16px;padding:8px 40px 110px 0}
  .hm-e{box-sizing:border-box;width:389px;border-radius:26px;background:${PAPER};color:${INK};box-shadow:0 6px 14px rgba(0,0,0,.28);overflow:hidden;cursor:pointer;display:flex;flex-direction:column}
  .hm-e .tx{padding:20px 24px 22px;display:flex;flex-direction:column;flex:1;min-width:0}
  .hm-e .n{font:700 30px/1.15 Outfit,sans-serif}
  .hm-e .a{margin-top:8px;font:600 19px Inter,sans-serif;color:${MUTED}}
  .hm-e .b{margin-top:4px;font:500 18px Inter,sans-serif;color:${SOFT}}
  .hm-e .pic{height:170px;border-radius:0;flex:none}
  .hm-e .hm-warn{margin-top:14px;align-self:flex-start}
  .hm-e .hm-warn.over{background:#E9E4D8;color:${SOFT}}
  .hm-e .hm-next{margin-top:12px}
  .hm-sw{height:150px;position:relative;flex:none}
  .hm-sw svg{position:absolute;left:0;bottom:-1px}
  .hm-sw span{position:absolute;left:24px;top:20px;right:24px;font:600 22px Inter,sans-serif;opacity:.9}
  .hm-e.paint{height:284px}
  .hm-e.paint .tx{padding:4px 24px 0}
  .hm-e.paint .n{font-size:34px}
  .hm-done{margin-top:14px;align-self:flex-start;min-height:56px;padding:0 26px;border-radius:999px;background:#2D6A4F;color:#fff;font:600 19px Inter,sans-serif}

  .hm-warm{position:absolute;top:0;right:0;bottom:0;left:0;color:${INK};background:radial-gradient(ellipse 900px 600px at 50% 40%,#FFF6DF 0%,#F3E2BA 60%,#E7CC93 100%)}
  .hm-warm .arcs{position:absolute;left:0;top:0}
  .hm-warm .done{position:absolute;left:40px;top:20px;background:${INK};color:#fff;padding:0 34px;font-weight:700}
  .hm-wcard{position:absolute;left:150px;top:92px;width:980px;height:600px;border-radius:40px;background:#fff;box-shadow:0 10px 24px rgba(90,60,10,.24);display:flex;align-items:center;padding:0 60px;box-sizing:border-box;gap:60px}
  .hm-wcard .q{flex:none;padding:14px;border-radius:26px;border:4px solid #EEF1F5}
  .hm-wcard .lb{font:500 20px Inter,sans-serif;color:${SOFT}}
  .hm-wcard .v{margin-top:4px;font:700 40px/1.15 Outfit,sans-serif;word-break:break-all}
  .hm-wcard .v.pw{font-size:44px;letter-spacing:1px}
  .hm-wcard .v.long{font-size:30px}

  .hm-dim{position:absolute;top:0;right:0;bottom:0;left:0;background:rgba(4,12,24,.66);z-index:4}
  .hm-sheet{position:absolute;left:70px;top:24px;width:1140px;height:668px;border-radius:32px;background:#fff;color:${INK};box-shadow:0 12px 30px rgba(0,0,0,.4);overflow:hidden;display:flex;flex-direction:column;z-index:5}
  .hm-sheet .hd{display:flex;align-items:center;height:76px;padding:0 14px;border-bottom:2px solid ${LINE};flex:none}
  .hm-sheet .hd .t{min-height:56px;min-width:110px;padding:0 12px;background:transparent;font:600 20px Inter,sans-serif;color:#5B6B80}
  .hm-sheet .hd .t.red{color:#B3261E}
  .hm-sheet .hd .ti{flex:1;text-align:center;font:500 26px Outfit,sans-serif}
  .hm-sheet .hd .sv{min-height:56px;min-width:110px;padding:0 24px;border-radius:999px;background:${AMBER};color:#2A1D05;font:600 20px Inter,sans-serif}
  .hm-sheet .hd .sv[disabled]{opacity:.4}
  .hm-sheet .hd .sp{width:110px}
  .hm-sheet .bd{flex:1;display:flex;gap:22px;padding:20px 22px 22px;min-height:0}
  .hm-sheet .lf{width:500px;flex:none;display:flex;flex-direction:column;gap:14px}
  .hm-nm{min-height:68px;border-radius:20px;background:#F1EEE7;display:flex;align-items:center;padding:0 22px;font:700 28px Outfit,sans-serif;color:${INK};text-align:left;width:100%}
  .hm-nm.none{color:#9AA6B5;font-weight:500}
  .hm-rows{border-radius:20px;background:#F7F4EE;overflow:hidden;flex:none}
  .hm-row{display:flex;align-items:center;min-height:60px;padding:0 22px;font:600 21px Inter,sans-serif;width:100%;background:transparent;color:${INK};border-top:2px solid ${LINE} !important;text-align:left}
  .hm-row:first-child{border-top:0 !important}
  .hm-row.on{background:#FBE7BD}
  .hm-row .v{margin-left:auto;font-weight:500;color:${MUTED};padding-left:16px;min-width:0}
  .hm-row .ch{margin-left:14px;color:#A7B2C0;font-size:26px;flex:none}
  .hm-row .dot{flex:none;width:30px;height:30px;border-radius:15px;margin-left:auto;box-shadow:inset 0 0 0 2px rgba(0,0,0,.12)}
  .hm-row .dot + .v{margin-left:10px;padding-left:0}
  .hm-pl{margin-top:8px;font:600 21px Inter,sans-serif;padding:0 4px}
  .hm-strip{display:flex;gap:14px}
  .hm-strip button{width:236px;height:130px;border-radius:18px;flex:none;box-sizing:border-box;padding:0}
  .hm-strip .th.on{box-shadow:0 0 0 4px ${AMBER}}
  .hm-strip .pl{border:3px dashed #B9C3CF;background:transparent;font:500 44px Inter,sans-serif;color:#8D9AAB}
  .hm-strip .pl.on{border-color:${AMBER};color:#B27A10}
  .hm-rt{flex:1;min-width:0;border-radius:24px;overflow:hidden;position:relative;background:#EEF2F6;display:flex;flex-direction:column;align-items:center;justify-content:center}
  .hm-rt.black{background:#000}
  .hm-rt .full{position:absolute;top:0;right:0;bottom:0;left:0;border-radius:0;background-color:#000;background-size:contain}
  .hm-rt .rm{position:absolute;left:18px;bottom:18px;min-height:56px;padding:0 24px;border-radius:999px;background:rgba(0,0,0,.6);color:#fff;font:600 19px Inter,sans-serif}
  .hm-opts{align-self:stretch;display:flex;flex-direction:column;gap:10px;padding:0 40px}
  .hm-opt{min-height:60px;border-radius:18px;background:#fff;color:${INK};font:600 22px Inter,sans-serif;display:flex;align-items:center;gap:14px;padding:0 22px;text-align:left}
  .hm-opt.on{background:${INK};color:#fff}
  .hm-opt.on svg{stroke:#fff}
  .hm-pal{display:flex;flex-wrap:wrap;gap:10px;width:542px}
  .hm-pal button{width:82px;height:68px;border-radius:14px;box-shadow:inset 0 0 0 2px rgba(0,0,0,.1);padding:0}
  .hm-pal button.on{box-shadow:0 0 0 4px ${AMBER},inset 0 0 0 3px #fff}
  .hm-date{display:flex;gap:16px}
  .hm-date div{display:flex;flex-direction:column;align-items:center;gap:10px;width:150px}
  .hm-date button{width:150px;height:72px;border-radius:18px;background:#fff;color:${INK};font:500 40px Inter,sans-serif}
  .hm-date b{font:700 38px Outfit,sans-serif;height:56px;line-height:56px}
  .hm-dq{display:flex;gap:12px;margin-top:22px}
  .hm-dq button{min-height:60px;padding:0 28px;border-radius:999px;background:#fff;color:${INK};font:600 20px Inter,sans-serif}
  .hm-pick{display:flex;flex-wrap:wrap;gap:12px;width:540px}
  .hm-pick button{width:172px;height:124px;padding:0;position:relative}
  .hm-pick button.on{box-shadow:0 0 0 4px ${AMBER}}
  .hm-pick button.on::after{content:'✓';position:absolute;right:8px;top:8px;width:34px;height:34px;border-radius:17px;background:${AMBER};color:#2A1D05;font:700 20px/34px Inter,sans-serif;text-align:center}
  .hm-cam{margin-top:18px;min-height:64px;padding:0 30px;border-radius:999px;background:${INK};color:#fff;font:600 21px Inter,sans-serif}
  .hm-rt p{margin:0 0 6px;font:500 24px Outfit,sans-serif;color:${MUTED}}

  .hm-typebg{position:absolute;top:0;right:0;bottom:0;left:0;background:rgba(4,12,24,.5);z-index:6}
  .hm-type{position:absolute;left:70px;width:1140px;bottom:462px;box-sizing:border-box;min-height:84px;border-radius:22px;background:#fff;color:${INK};z-index:6;
    display:flex;align-items:center;padding:0 26px;box-shadow:0 6px 14px rgba(0,0,0,.3)}
  .hm-type .lb{font:600 20px Inter,sans-serif;color:${SOFT};flex:none;margin-right:18px}
  .hm-type .tx{font:700 30px Outfit,sans-serif;white-space:pre;overflow:hidden;min-width:0;direction:rtl;text-align:left}
  .hm-type .tx bdi{direction:ltr;unicode-bidi:bidi-override}
  .hm-type .car{flex:none;width:3px;height:40px;background:${AMBER};margin-left:3px}
  .hm-toast{position:absolute;left:40px;bottom:24px;z-index:8;min-height:68px;border-radius:999px;background:#08162A;color:#fff;display:flex;align-items:center;gap:18px;
    padding:0 8px 0 28px;font:600 20px Inter,sans-serif;box-shadow:0 4px 12px rgba(0,0,0,.35)}
  .hm-toast.plain{padding-right:28px}
  .hm-toast button{min-height:56px;padding:0 24px;border-radius:999px;background:${AMBER};color:#2A1D05;font:600 19px Inter,sans-serif}
  ${keyboardStyle({ panel: '#0A1C33', key: '#F7F2E7', ink: INK, go: AMBER, goInk: '#2A1D05', space: '#5B6B80' })}`;

// The add sheet, kept while the camera has the screen: { draft, view, since }.
let pending = null;

let off = () => {};

export function mount(el, { args = [] } = {}) {
  let view = 'main';   // 'main' | 'wifi' | a section's id
  let draft = null;    // what the sheet is filling in: { kind: 'entry' | 'wifi', isNew, pane, sel, ...the fields }
  let toast = null;    // { text, undo }
  let toastTimer = 0;
  let album = {};      // album photo id -> its address
  let newest = [];     // the album's newest photos, for the picker

  el.innerHTML = `<style>${CSS}</style><div class="hm"><div class="hm-grid"></div><div data-view></div><div data-sheet></div><div data-typing></div><div data-toast></div></div>`;
  const root = el.querySelector('.hm');
  const $ = (sel) => root.querySelector(sel);
  const viewEl = $('[data-view]');
  const sheetEl = $('[data-sheet]');
  const today = () => data.isoDay(new Date());

  function readAlbum() {
    const list = getPhotos().filter((p) => !p.video);
    album = {};
    list.forEach((p) => { album[p.id] = p.src; });
    newest = list.slice(0, 9);
  }
  const live = (e) => (e.photos || []).filter((id) => album[id]);
  // Small copies of the photos, one after another (the full pictures are far too big).
  function fillPhotos(scope) {
    scope.querySelectorAll('[data-ph]').forEach((node) => {
      const src = album[node.getAttribute('data-ph')];
      if (!src) return;
      thumbnail(src, { w: Number(node.getAttribute('data-w')), h: Number(node.getAttribute('data-h')), wanted: () => node.isConnected })
        .then((url) => { if (url && node.isConnected) node.style.backgroundImage = `url("${url}")`; }).catch(() => {});
    });
  }
  const photo = (id, w, h, cls = '') => `<div class="hm-ph ${cls}" data-ph="${esc(id)}" data-w="${w}" data-h="${h}"${cls === 'full' || cls === 'pic' ? '' : ` style="width:${w}px;height:${h}px"`}></div>`;

  // ---------------------------------------------------------------- the main screen
  const top = (title, right, back) => `<div class="hm-top">${topBar(Object.assign({ title, right }, back ? { back: 'history', backLabel: '← House manual' } : {}))}</div>`;
  const addBtn = (section, label = 'Add') => `<button class="x-btn hm-add" data-add="${section}"><span class="pl">+</span> ${label}</button>`;
  const head = (id, title, count) => `<div class="hm-h">${icon(ICONS[id])}<b>${title}</b>${count ? `<i>${count}</i>` : ''}</div>`;
  const box = (id, x, y, w, h, inner, has) => `<div class="hm-card" role="button" ${has ? `data-open="${id}"` : `data-add="${id}"`} style="left:${x}px;top:${y}px;width:${w}px;height:${h}px">${inner}${has ? '' : '<div class="hm-plus">+</div>'}</div>`;

  function wifiCard(wifi) {
    const st = 'left:40px;top:112px;width:360px;height:588px;background:#fff;padding:24px 30px;cursor:default';
    if (!wifi) return `<div class="hm-card" role="button" data-wifiedit style="${st};cursor:pointer">${head('wifi', 'Guest Wi-Fi')}<div class="hm-plus">+</div></div>`;
    return `<div class="hm-card" style="${st}">
      <div class="hm-h">${icon(ICONS.wifi)}<b>Guest Wi-Fi</b><button class="hm-quiet" data-wifiedit>Edit</button></div>
      <div class="hm-qr" data-big role="button">${qrSvg(data.wifiText(wifi), 240)}</div>
      <div class="hm-cut" style="margin-top:18px;font:500 26px Outfit,sans-serif;text-align:center">${esc(wifi.ssid)}</div>
      <button class="hm-showbig" data-big>${EXPAND}Show big</button></div>`;
  }
  function shutCard(list) {
    const pics = [];
    list.forEach((e) => { const p = live(e)[0]; if (p && pics.length < 2) pics.push(p); });
    const rows = list.slice(0, 5).map((e) => `<div class="hm-r"><b class="hm-cut">${esc(e.name)}</b><span class="hm-cut">${esc(e.where || e.note)}</span></div>`).join('');
    const inner = !list.length ? head('shutoffs', 'Shut-offs') : `<div style="display:flex;gap:20px;flex:1;min-height:0">
      <div style="flex:1;min-width:0">${head('shutoffs', 'Shut-offs', list.length > 5 ? list.length : 0)}<div style="margin-top:14px">${rows}</div></div>
      ${pics.length ? `<div style="width:196px;flex:none;display:flex;flex-direction:column;gap:10px">${pics.map((p) => photo(p, 196, 123)).join('')}</div>` : ''}</div>`;
    return box('shutoffs', 420, 112, 542, 300, inner, list.length);
  }
  function numbersCard(list) {
    const rows = list.slice(0, 3).map((e) => `<div class="hm-r col"><b class="hm-cut" style="max-width:none">${esc(e.name)}</b><span class="hm-cut">${esc(e.phone || e.note)}</span></div>`).join('');
    return box('numbers', 978, 112, 262, 300, head('numbers', 'Numbers', list.length) + (list.length ? `<div style="margin-top:12px">${rows}</div>` : ''), list.length);
  }
  function appliancesCard(list) {
    const w = data.nextWarranty(list, today());
    const room = w ? 3 : 5;
    const names = list.slice(0, room).map((e, i) => `<div class="hm-cut">${esc(e.name)}${i === room - 1 && list.length > room ? ` +${list.length - room}` : ''}</div>`).join('');
    const inner = head('appliances', 'Appliances', list.length) + (list.length ? `<div style="margin-top:14px;font:500 19px/1.55 Inter,sans-serif;color:${MUTED}">${names}</div>` : '')
      + (w ? `<div class="hm-warn"><div class="hm-cut">${esc(w.entry.name)} warranty</div><span>ends ${data.dayWords(w.entry.warranty, true)}</span></div>` : '');
    return box('appliances', 420, 428, 262, 272, inner, list.length);
  }
  function paintCard(list) {
    const inner = head('paint', 'Paint', list.length) + (list.length ? `<div style="margin-top:18px;display:flex;gap:6px">${list.slice(0, 6).map((e) => `<div style="flex:1;max-width:70px;height:100px;background:${e.color};border-radius:10px;box-shadow:inset 0 -22px 0 rgba(255,255,255,.55),inset 0 0 0 1px rgba(0,0,0,.08)"></div>`).join('')}</div>
      <div style="margin-top:auto;font:500 18px/1.45 Inter,sans-serif;color:${MUTED}">${list.slice(0, 2).map((e) => `<div class="hm-cut">${esc([e.where, e.name].filter((x, i, a) => x && a.indexOf(x) === i).join(' · '))}</div>`).join('')}</div>` : '');
    return box('paint', 698, 428, 264, 272, inner, list.length);
  }
  function nextLine(e) {
    const f = data.filterDates([e], today())[0];
    if (!f) return '';
    return f.days > 0 ? `<div class="hm-next">Next change · ${data.dayWords(f.next)}</div>` : `<div class="hm-next due">${f.days ? `Due since ${data.dayWords(f.next)}` : 'Due today'}</div>`;
  }
  function filtersCard(list) {
    const soon = data.filterDates(list, today())[0];
    const inner = head('filters', 'Filters', list.length > 2 ? list.length : 0) + list.slice(0, 2).map((e) => `<div class="hm-big hm-cut" style="margin-top:16px">${esc(e.size || e.name)}</div>
      <div class="hm-sub hm-cut">${esc([e.size ? e.name : '', e.note].filter(Boolean).join(' · '))}</div>`).join('')
      + (soon ? (soon.days > 0 ? `<div class="hm-next">Next change · ${data.dayWords(soon.next)}</div>` : `<div class="hm-next due hm-cut">Change · ${esc(soon.entry.name)}</div>`) : '');
    return box('filters', 978, 428, 262, 272, inner, list.length);
  }
  function mainHtml(m) {
    if (!m.wifi && !m.entries.length) {
      return `${top('House manual', '')}<div class="hm-empty">${HOUSE}<p>Nothing written down yet</p><button class="x-btn lg hm-add" data-add=""><span class="pl">+</span> Add</button></div>`;
    }
    const of = (s) => m.entries.filter((e) => e.section === s);
    const other = of('other').length;
    return top('House manual', `${other ? `<button class="x-btn glass" data-open="other">Other · ${other}</button>` : ''}${addBtn('')}`)
      + wifiCard(m.wifi) + shutCard(of('shutoffs')) + numbersCard(of('numbers')) + appliancesCard(of('appliances')) + paintCard(of('paint')) + filtersCard(of('filters'));
  }

  // ---------------------------------------------------------------- one section
  const WAVE = `<svg width="389" height="60" viewBox="0 0 392 60" preserveAspectRatio="none" aria-hidden="true"><path d="M0 34c40-10 70 8 110-2s70-14 120-4 80 10 162-6V60H0z" fill="${PAPER}"/><path d="M0 34c40-10 70 8 110-2s70-14 120-4 80 10 162-6" fill="none" stroke="rgba(0,0,0,.08)" stroke-width="3"/></svg>`;
  /** One entry as a paper card (`shown`: in the sheet, as it will look; nothing on it can be tapped). */
  function entryCard(e, shown) {
    const tap = shown ? '' : ` role="button" data-edit="${esc(e.id)}"`;
    const s = e.section;
    if (s === 'paint') {
      return `<div class="hm-e paint"${tap}><div class="hm-sw" style="background:${e.color};color:${dark(e.color) ? '#fff' : INK}">${WAVE}<span class="hm-cut">${esc(e.where)}</span></div>
        <div class="tx"><div class="n hm-cut">${esc(e.name || e.where || 'Colour name')}</div><div class="a hm-cut">${esc([e.code, e.finish].filter(Boolean).join(' · '))}</div><div class="b hm-cut">${esc(e.brand)}</div></div></div>`;
    }
    const pic = !shown && live(e)[0];
    const line = (cls, t) => (t ? `<div class="${cls}">${esc(t)}</div>` : '');
    let body = '';
    if (s === 'numbers') body = `<div class="a" style="margin-top:0;font-size:22px">${esc(e.name || 'Who')}</div>${line('n', e.phone)}${line('b', e.note)}`;
    else if (s === 'filters') {
      body = `<div class="n" style="font-size:40px">${esc(e.size || e.name || 'What')}</div>${line('a', [e.size ? e.name : '', e.note].filter(Boolean).join(' · '))}${nextLine(e)}`
        + (e.every && !shown ? `<button class="hm-done" data-changed="${esc(e.id)}">Changed</button>` : '');
    } else if (s === 'appliances') {
      const over = e.warranty && e.warranty < today();
      body = `<div class="n">${esc(e.name || 'Appliance')}</div>${line('a', e.model)}${line('b', e.note)}`
        + (e.warranty ? `<div class="hm-warn${over ? ' over' : ''}">${over ? 'Warranty ended' : `Warranty · ${data.dayWords(e.warranty, true)}`}</div>` : '');
    } else body = `<div class="n">${esc(e.name || 'Name')}</div>${line('a', e.where)}${line('b', e.note)}`;
    return `<div class="hm-e"${tap}>${pic ? photo(pic, 389, 170, 'pic') : ''}<div class="tx">${body}</div></div>`;
  }
  function sectionHtml(id) {
    const list = data.entries(id);
    const title = id === 'paint' ? 'Paint colours' : data.sectionTitle(id);
    return `${top(title, addBtn(id, id === 'paint' ? 'Add colour' : 'Add'), true)}<div class="hm-list">${list.map((e) => entryCard(e)).join('')}</div>`;
  }

  // ---------------------------------------------------------------- the big Wi-Fi card
  function wifiBig(wifi) {
    const long = (s) => (s.length > 22 ? ' long' : '');
    return `<div class="hm-warm"><svg class="arcs" width="1280" height="800" viewBox="0 0 1280 800" aria-hidden="true"><g fill="none" stroke="#D9B873" stroke-width="3" opacity=".55"><path d="M120 120a120 120 0 0 1 170 0M150 150a76 76 0 0 1 110 0"/><path d="M1020 650a120 120 0 0 1 170 0M1050 680a76 76 0 0 1 110 0"/></g></svg>
      <button class="x-btn done" data-back>Done</button>
      <div class="hm-wcard"><div class="q">${qrSvg(data.wifiText(wifi), 400)}</div>
        <div style="flex:1;min-width:0"><div style="display:flex;align-items:center;gap:14px">${icon(ICONS.wifi, 44, '#C88A12')}<span style="font:500 30px Outfit,sans-serif;color:#A87210">Wi-Fi</span></div>
          <div class="lb" style="margin-top:26px">Network</div><div class="v${long(wifi.ssid)}">${esc(wifi.ssid)}</div>
          ${wifi.password ? `<div class="lb" style="margin-top:30px">Password</div><div class="v pw${long(wifi.password)}">${esc(wifi.password)}</div>` : ''}</div></div></div>`;
  }

  function drawView() {
    const m = data.manual();
    if (view === 'wifi' && !m.wifi) view = 'main';
    readAlbum();
    viewEl.innerHTML = view === 'wifi' ? wifiBig(m.wifi) : view === 'main' ? mainHtml(m) : sectionHtml(view);
    fillPhotos(viewEl);
    if (view === 'wifi') { try { soften(el); } catch (e) { /* the CSS gradient shows instead */ } }
  }

  // ---------------------------------------------------------------- Undo
  function say(text, undo) {
    clearTimeout(toastTimer);
    toast = text ? { text, undo } : null;
    $('[data-toast]').innerHTML = toast ? `<div class="hm-toast${undo ? '' : ' plain'}"><span>${esc(text)}</span>${undo ? '<button data-undo>Undo</button>' : ''}</div>` : '';
    if (toast) toastTimer = setTimeout(() => say(''), 6000);
  }

  // ---------------------------------------------------------------- the sheet
  const sectionOf = () => (draft.kind === 'wifi' ? 'wifi' : draft.section);
  const restPane = () => (draft.kind === 'wifi' ? 'qr' : !draft.section ? 'section' : !HAS_PHOTOS[draft.section] ? 'card' : draft.photos.length ? 'photo' : 'pick');
  function openEntry(section, entry) {
    readAlbum();
    draft = Object.assign({ kind: 'entry', isNew: !entry, section, name: '', note: '', where: '', phone: '', model: '', warranty: '', color: '#DCD3C6', code: '', finish: '', brand: '', size: '', every: 0, changed: '' },
      entry || {}, { photos: entry ? live(entry) : [], sel: 0 });
    draft.pane = restPane();
    drawSheet();
  }
  function openWifi() {
    const w = data.manual().wifi;
    draft = { kind: 'wifi', isNew: !w, name: w ? w.ssid : '', password: w ? w.password : '', pane: 'qr' };
    drawSheet();
  }
  const canSave = () => !!(draft.name.trim() || (draft.section === 'paint' && draft.where.trim()));

  function rowValue(field, kind) {
    const v = draft[field];
    if (kind === 'date') return v ? data.dayWords(v, true) : '';
    if (field === 'every') return v ? data.everyWords(v) : '';
    return v || '';
  }
  function paneHtml() {
    const p = draft.pane;
    if (p === 'section') {
      const opts = [['wifi', 'Guest Wi-Fi']].concat(data.SECTIONS.map((s) => [s.id, s.title]));
      return `<div class="hm-opts">${opts.map((o) => `<button class="hm-opt${draft.section === o[0] ? ' on' : ''}" data-set="section" data-v="${o[0]}">${icon(ICONS[o[0]], 28)}${o[1]}</button>`).join('')}</div>`;
    }
    if (p === 'finish') return `<div class="hm-opts">${data.FINISHES.map((f) => `<button class="hm-opt${draft.finish === f ? ' on' : ''}" data-set="finish" data-v="${f}">${f}</button>`).join('')}</div>`;
    if (p === 'every') return `<div class="hm-opts">${data.EVERY.map((n) => `<button class="hm-opt${draft.every === n ? ' on' : ''}" data-set="every" data-v="${n}">${data.everyWords(n)}</button>`).join('')}</div>`;
    if (p === 'color') return `<div class="hm-pal">${PALETTE.map((c) => `<button style="background:${c}"${draft.color === c ? ' class="on"' : ''} data-set="color" data-v="${c}" aria-label="${c}"></button>`).join('')}</div>`;
    if (p === 'warranty' || p === 'changed') {
      const d = data.fromIso(draft[p]);
      const col = (part, words) => `<div><button data-step="${part}" data-by="1">+</button><b>${words}</b><button data-step="${part}" data-by="-1">−</button></div>`;
      return `<div class="hm-date">${col('m', data.dayWords(draft[p]).split(' ')[0])}${col('d', d.getDate())}${col('y', d.getFullYear())}</div>
        <div class="hm-dq">${p === 'changed' ? '<button data-set="changed" data-v="today">Today</button>' : ''}<button data-set="${p}" data-v="">No date</button></div>`;
    }
    if (p === 'photo') {
      const id = draft.photos[draft.sel] || draft.photos[0];
      return `${photo(id, 574, 430, 'full')}<button class="rm" data-unphoto="${esc(id)}">Remove photo</button>`;
    }
    if (p === 'pick') {
      return (newest.length ? `<div class="hm-pick">${newest.map((ph) => `<button class="hm-ph${draft.photos.indexOf(ph.id) >= 0 ? ' on' : ''}" data-pick="${esc(ph.id)}" data-ph="${esc(ph.id)}" data-w="172" data-h="124" aria-label="Photo"></button>`).join('')}</div>` : '<p>No photos yet</p>')
        + '<button class="hm-cam" data-camera>Take a photo</button>';
    }
    if (p === 'qr') {
      const t = data.wifiText({ ssid: draft.name, password: draft.password });
      return t ? `<div class="hm-qr" style="margin:0">${qrSvg(t, 300)}</div>` : icon(ICONS.wifi, 160, '#C3CEDA');
    }
    return entryCard(draft, true);
  }
  function sheetHtml() {
    const s = sectionOf();
    const nm = NAME[s] || NAME.other;
    const rows = (s && ROWS[s]) || [];
    const sectionRow = draft.kind === 'entry' ? `<button class="hm-row${draft.pane === 'section' ? ' on' : ''}" data-pane="section"><span>Section</span><span class="v hm-cut">${esc(data.sectionTitle(s))}</span><span class="ch">›</span></button>` : '';
    const strip = HAS_PHOTOS[s] ? `<div class="hm-pl">Photos</div><div class="hm-strip">${draft.photos.map((id, i) => `<button class="hm-ph th${draft.pane === 'photo' && draft.sel === i ? ' on' : ''}" data-show="${i}" data-ph="${esc(id)}" data-w="236" data-h="130" aria-label="Photo"></button>`).join('')}${draft.photos.length < data.MAX_PHOTOS ? `<button class="pl${draft.pane === 'pick' ? ' on' : ''}" data-pane="pick" aria-label="Add a photo">+</button>` : ''}</div>` : '';
    return `<div class="hm-dim"></div><div class="hm-sheet" role="dialog">
      <div class="hd"><button class="t" data-shut>Cancel</button>${draft.isNew ? '' : '<button class="t red" data-remove>Remove</button>'}
        <div class="ti">${draft.kind === 'wifi' ? 'Guest Wi-Fi' : draft.isNew ? 'New entry' : esc(data.sectionTitle(s))}</div>${draft.isNew ? '' : '<span class="sp"></span>'}
        <button class="sv" data-save${canSave() ? '' : ' disabled'}>Save</button></div>
      <div class="bd"><div class="lf">
        <button class="hm-nm hm-cut${draft.name ? '' : ' none'}" data-type="name">${esc(draft.name || nm[0])}</button>
        <div class="hm-rows">${sectionRow}${rows.map((r) => {
    const typed = r[2] === 'text' || r[2] === 'code' || r[2] === 'phone' || r[2] === 'secret';
    const dot = r[2] === 'color' ? `<span class="dot" style="background:${draft.color}"></span>` : '';
    return `<button class="hm-row${draft.pane === r[0] ? ' on' : ''}" ${typed ? `data-type="${r[0]}"` : `data-pane="${r[0]}"`}><span>${r[1]}</span>${dot}<span class="v hm-cut">${r[2] === 'color' ? '' : esc(rowValue(r[0], r[2]))}</span><span class="ch">›</span></button>`;
  }).join('')}</div>
        ${strip}</div>
        <div class="hm-rt${draft.pane === 'photo' ? ' black' : ''}">${paneHtml()}</div></div></div>`;
  }
  function drawSheet() {
    sheetEl.innerHTML = draft ? sheetHtml() : '';
    if (draft) fillPhotos(sheetEl);
  }
  function shut() {
    if (root.__kb) root.__kb.close();
    draft = null;
    drawSheet();
  }
  function save() {
    if (!draft || !canSave()) return;
    try {
      if (draft.kind === 'wifi') data.saveWifi({ ssid: draft.name, password: draft.password });
      else {
        const e = Object.assign({}, draft);
        ['kind', 'isNew', 'pane', 'sel'].forEach((k) => { delete e[k]; });
        data.saveEntry(e);
      }
    } catch (err) { say(err.message); return; }
    shut();
    drawView();
  }
  function remove() {
    if (draft.kind === 'wifi') {
      const was = data.saveWifi(null);
      say('Removed', () => data.saveWifi(was));
    } else {
      const gone = data.removeEntry(draft.id);
      say('Removed', () => data.putBack(gone));
    }
    shut();
    drawView();
  }
  // A date row's + and −: month, day or year, never past the end of a month.
  function step(part, by) {
    const d = data.fromIso(draft[draft.pane]);
    let y = d.getFullYear() + (part === 'y' ? by : 0);
    let mo = d.getMonth() + (part === 'm' ? by : 0);
    if (part === 'm') { mo = (mo + 12) % 12; }
    const now = new Date().getFullYear();
    y = Math.max(now - 20, Math.min(now + 25, y));
    const last = new Date(y, mo + 1, 0).getDate();
    let day = d.getDate() + (part === 'd' ? by : 0);
    if (part === 'd') day = day < 1 ? last : day > last ? 1 : day;
    draft[draft.pane] = data.isoDay(new Date(y, mo, Math.min(day, last)));
  }

  // ---------------------------------------------------------------- typing
  // The keyboard's keys are small letters; the row above them offers capitals ("ABC"), the
  // signs it has no key for, and likely words. Words begin with a capital by themselves;
  // codes are typed in capitals; a network name and password are kept exactly as typed.
  function typeInto(field) {
    if (root.__kb) return;
    const s = sectionOf();
    const spec = field === 'name' ? NAME[s] || NAME.other : (ROWS[s] || []).find((r) => r[0] === field);
    const kind = field === 'name' ? spec[1] : spec[2];
    const label = field === 'name' ? spec[0] : spec[1];
    const max = field === 'name' ? spec[2] : MAX[field] || 40;
    const words = WORDS[`${s}.${field}`] || WORDS[field] || [];
    const signs = field === 'size' ? ['×'] : [];
    const slots = 7;
    let prev = String(draft[field] || '');
    $('[data-typing]').innerHTML = `<div class="hm-typebg"></div><div class="hm-type"><span class="lb">${label}</span><span class="tx"><bdi data-tx></bdi></span><span class="car"></span></div>`;
    const shown = $('[data-tx]');
    openKeyboard(root, {
      go: 'Done', max, slots, text: prev,
      caps: kind === 'text' ? 'auto' : kind === 'code' ? 'lock' : 'none',
      suggest: (t) => {
        const q = t.trim().toLowerCase();
        return signs.concat(words.filter((w) => w.toLowerCase().indexOf(q) === 0 && w.toLowerCase() !== q).slice(0, slots - signs.length));
      },
      onChange: (t) => {
        prev = t;
        shown.textContent = t;
      },
      onGo: (pick, k) => {
        if (pick && pick.length === 1) k.text = (k.text + pick).slice(0, max);
        else if (pick) k.text = pick.slice(0, max);
        else k.close();
      },
      onClose: () => {
        $('[data-typing]').innerHTML = '';
        if (!draft) return;
        draft[field] = kind === 'secret' ? prev : prev.replace(/\s+/g, ' ').trim();
        drawSheet();
      },
    });
    const k = root.__kb;
    if (kind === 'phone' && k) k.el.querySelector('[data-knum]').click();
  }

  // ---------------------------------------------------------------- taps
  root.addEventListener('click', (ev) => {
    const t = ev.target.closest('[data-back],[data-undo],[data-changed],[data-wifiedit],[data-big],[data-add],[data-open],[data-edit],[data-shut],[data-save],[data-remove],[data-type],[data-pane],[data-set],[data-step],[data-show],[data-unphoto],[data-pick],[data-camera]');
    if (!t || t.closest('[data-kb]')) return;
    const a = (n) => t.getAttribute(n);
    if (t.hasAttribute('data-undo')) { const u = toast && toast.undo; say(''); if (u) { u(); drawView(); } return; }
    if (draft) {
      // (the sheet is up: only its own buttons)
      if (!t.closest('.hm-sheet')) return;
      if (t.hasAttribute('data-shut')) shut();
      else if (t.hasAttribute('data-save')) save();
      else if (t.hasAttribute('data-remove')) remove();
      else if (t.hasAttribute('data-type')) typeInto(a('data-type'));
      else {
        if (t.hasAttribute('data-pane')) {
          const p = a('data-pane');
          draft.pane = draft.pane === p && p !== 'pick' && draft.section ? restPane() : p;
          if ((p === 'warranty' || p === 'changed') && !draft[p]) {
            const d = new Date();
            draft[p] = data.isoDay(p === 'warranty' ? new Date(d.getFullYear() + 1, d.getMonth(), d.getDate()) : d);
          }
        } else if (t.hasAttribute('data-set')) {
          const f = a('data-set');
          const v = a('data-v');
          if (f === 'section' && v === 'wifi') { openWifi(); return; }
          draft[f] = f === 'every' ? Number(v) : v === 'today' ? today() : v;
          draft.pane = restPane();
        } else if (t.hasAttribute('data-step')) step(a('data-step'), Number(a('data-by')));
        else if (t.hasAttribute('data-show')) { draft.sel = Number(a('data-show')); draft.pane = 'photo'; }
        else if (t.hasAttribute('data-unphoto')) { draft.photos = draft.photos.filter((id) => id !== a('data-unphoto')); draft.sel = 0; draft.pane = restPane(); }
        else if (t.hasAttribute('data-pick')) {
          const id = a('data-pick');
          const i = draft.photos.indexOf(id);
          if (i >= 0) draft.photos.splice(i, 1);
          else { if (draft.photos.length >= data.MAX_PHOTOS) draft.photos.pop(); draft.photos.push(id); }
        } else if (t.hasAttribute('data-camera')) {
          pending = { draft, view, since: Date.now() };
          location.hash = '#/camera/manual';
          return;
        }
        drawSheet();
      }
      return;
    }
    if (t.hasAttribute('data-back')) { view = 'main'; drawView(); }
    else if (t.hasAttribute('data-changed')) {
      const id = a('data-changed');
      const before = data.markChanged(id);
      say('Changed', () => data.markChanged(id, before));
      drawView();
    } else if (t.hasAttribute('data-wifiedit')) openWifi();
    else if (t.hasAttribute('data-big')) { view = 'wifi'; drawView(); }
    else if (t.hasAttribute('data-add')) openEntry(a('data-add'));
    else if (t.hasAttribute('data-open')) { view = a('data-open'); drawView(); }
    else if (t.hasAttribute('data-edit')) {
      const e = data.entries().find((x) => x.id === a('data-edit'));
      if (e) openEntry(e.section, e);
    }
  });

  // ---------------------------------------------------------------- opening
  const arg = args[0] || '';
  if (data.SECTIONS.some((s) => s.id === arg) || arg === 'wifi') view = arg;
  // Back from the camera: the sheet is as it was left, with the photo just taken.
  const back = pending && Date.now() - pending.since < 15 * 60000 ? pending : null;
  pending = null;
  if (back) view = back.view;
  drawView();
  if (back) {
    draft = back.draft;
    const fresh = getPhotos().filter((p) => !p.video && p.added >= back.since).map((p) => p.id);
    fresh.slice(0, data.MAX_PHOTOS).reverse().forEach((id) => {
      if (draft.photos.indexOf(id) >= 0) return;
      if (draft.photos.length >= data.MAX_PHOTOS) draft.photos.pop();
      draft.photos.push(id);
    });
    if (fresh.length) { draft.sel = draft.photos.length - 1; draft.pane = 'photo'; }
    drawSheet();
  } else if (arg === 'add') openEntry('');

  off = () => {
    clearTimeout(toastTimer);
    if (root.__kb) { draft = null; root.__kb.close(); }
  };
}

export function unmount() {
  off();
  off = () => {};
}
