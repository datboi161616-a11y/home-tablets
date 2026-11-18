// Welcome tour: the first thing a new owner sees. A few big, friendly pages that show
// where things are, then it's done for good (welcome-state.js). Family tablets get the
// warm illustrated tour; Tom's gets the same idea in flight-deck style.
import { profile, settings } from '../config.js';
import { familyName } from '../services/family.js';
import { tileArt, spot, C } from '../art.js';
import { isTablet, uploadUrl, qrSvg } from '../services/tablet-photos.js';
import { setWelcomeDone } from '../services/welcome-state.js';

let step = 0;
let qrTimer;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// ---------------- Family pictures ----------------

// A tablet with Android's three buttons along the bottom; the Home button glows.
const homeButtonArt = () => `<svg viewBox="0 0 520 380" aria-hidden="true" focusable="false" style="display:block;width:100%;height:auto">
  <rect x="40" y="30" width="440" height="300" rx="30" fill="${C.ink}"/>
  <rect x="62" y="52" width="396" height="214" rx="10" fill="#ECEEF0"/>
  <rect x="84" y="74" width="170" height="70" rx="10" fill="#FFF"/><rect x="266" y="74" width="170" height="170" rx="10" fill="${C.peach}"/>
  <rect x="84" y="156" width="170" height="88" rx="10" fill="${C.accent}"/>
  <text x="100" y="122" font-family="Outfit,sans-serif" font-size="34" fill="${C.ink}">1:22</text>
  <g fill="#8C95A3"><path d="M150 298l14-9v18z"/><rect x="352" y="289" width="18" height="18" rx="3"/></g>
  <circle cx="260" cy="298" r="34" fill="${C.gold}" opacity=".35"/><circle cx="260" cy="298" r="12" fill="none" stroke="#FFF" stroke-width="4"/>
  <path d="M242 366l18-18 18 18" fill="none" stroke="${C.gold}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// Six menu tiles, like the App menu.
const menuArt = () => `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;width:100%">${
  [['photos', 'Photos'], ['calendar', 'Calendar'], ['weather', 'Weather'], ['recipes', 'Recipes'], ['messages', 'Messages'], ['grocery', 'Grocery list']]
    .map(([k, t]) => `<div style="background:${k === 'recipes' ? C.accent : '#FFF'};border-radius:16px;overflow:hidden;color:${k === 'recipes' ? '#FFF' : C.ink}">
      <div style="height:96px;overflow:hidden">${tileArt[k]().replace('style="display:block;', 'style="display:block;width:100%;height:96px;')}</div>
      <div class="display" style="font-size:18px;font-weight:500;padding:8px 12px 12px">${t}</div></div>`).join('')}</div>`;

const nightArt = () => `<div style="position:relative;width:100%;height:100%;background:#000;border-radius:24px;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center">
  <div class="display" style="font-size:120px;font-weight:300;color:#C98A6E;line-height:1">10:00<span style="font-size:32px"> PM</span></div>
  <div style="color:#8A6A5C;font-size:20px;margin-top:8px">Goodnight</div>
  <div style="position:absolute;left:0;right:0;bottom:0">${spot.nightHills()}</div></div>`;

function photosArt() {
  const url = uploadUrl();
  if (url) {
    return `<div style="background:#FFF;border-radius:24px;padding:24px;display:flex;flex-direction:column;align-items:center;gap:10px">
      <div data-qr style="width:300px;height:300px">${qrSvg(url, 300)}</div>
      <div class="muted" style="font-size:15px">Scan with your phone’s camera</div></div>`;
  }
  if (isTablet()) {
    return `<div style="background:#FFF;border-radius:24px;padding:32px;text-align:center;font-size:21px;line-height:1.4">
      The code appears here once the tablet is on Wi-Fi.<div class="muted" style="font-size:17px;margin-top:8px">You can also do this later: All apps → Photos → Add photos.</div></div>`;
  }
  return spot.phoneToTablet();
}

const name = () => familyName();
const festive = () => { const d = new Date(); return (d.getMonth() === 11) || (d.getMonth() === 0 && d.getDate() <= 6); };

const FAMILY = [
  () => ({
    eyebrow: festive() ? 'Merry Christmas!' : 'Hello!',
    title: name() !== 'Family' ? `Welcome, ${esc(name())}` : 'Welcome to your new tablet',
    body: 'It’s a photo frame, a family calendar, a recipe book and a little more. Here’s a quick look around. It takes about a minute.',
    art: `<div style="background:${C.ink};border-radius:24px;overflow:hidden;width:100%">${tileArt.home().replace('style="display:block;', 'style="display:block;width:100%;height:auto;')}</div>`,
    next: 'Let’s look around',
  }),
  () => ({
    eyebrow: 'Getting around',
    title: 'Home is always one tap away',
    body: 'Wherever you end up, press the round <b>Home</b> button at the bottom of the screen. It always brings you back to the home screen.',
    art: homeButtonArt(),
  }),
  () => ({
    eyebrow: 'Getting around',
    title: 'Everything is in the menu',
    body: 'On the home screen, tap <b>All apps</b>. Photos, the calendar, weather, recipes, notes and more are all there. Just tap a tile to open it.',
    art: menuArt(),
    tint: '#ECEEF0',
  }),
  () => ({
    eyebrow: 'Photos',
    title: 'Send photos from your phone',
    body: `<ol style="margin:0;padding-left:28px;display:flex;flex-direction:column;gap:10px">
      <li>Join the same Wi-Fi as this tablet.</li><li>Point your phone’s camera at the code.</li><li>Tap the link and choose photos.</li></ol>
      <div class="muted" style="font-size:18px;margin-top:14px">They appear in the photo frame in a few seconds, and they stay on this tablet. Anyone in the family can do it, any time: <b>All apps → Photos → Add photos</b>.</div>`,
    art: photosArt(),
    tint: '#F6EFE7',
  }),
  () => ({
    eyebrow: 'Together',
    title: 'Plan the week together',
    wide: [
      ['calendar', 'Calendar', 'Tap <b>+ Add</b> to put birthdays, visits and appointments on it.'],
      ['recipes', 'Recipes', 'Pick dinners for the week. The shopping list fills itself in.'],
      ['messages', 'Message board', 'Leave a note for whoever walks by next.'],
    ],
  }),
  () => ({
    eyebrow: 'At night',
    title: 'Quiet at night',
    body: 'At 10 at night the screen dims to a soft clock, and it brightens again at 6 in the morning. Tap the clock any time to go back home.',
    art: nightArt(),
    tall: true,
  }),
  () => ({
    eyebrow: 'All set',
    title: 'Enjoy your tablet!',
    body: 'If you ever get lost, press <b>Home</b>. To see this tour again, tap <b>Tour</b> on the App menu.',
    art: `<div style="width:100%;display:flex;justify-content:center"><div style="width:420px">${spot.noteBoard()}</div></div>`,
    next: 'Go to the home screen',
    tint: '#FBF6E9',
  }),
];

// ---------------- Tom's pictures (flight deck style) ----------------

const T = { bg: '#05070D', panel: '#0A1220', line: '#1E3A4A', cyan: '#5CE1E6', amber: '#FFB547', ink: '#D7E6F0', dim: '#7FA6B8' };
const tomSvg = (body) => `<svg viewBox="0 0 440 360" aria-hidden="true" focusable="false" style="display:block;width:100%;height:auto">${body}</svg>`;
const stars = (n, seed = 7) => { let s = seed, o = ''; for (let i = 0; i < n; i++) { s = (s * 9301 + 49297) % 233280; const x = (s / 233280) * 440; s = (s * 9301 + 49297) % 233280; const y = (s / 233280) * 360; o += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${i % 5 ? 1.2 : 2}" fill="#D7E6F0" opacity="${i % 3 ? 0.5 : 0.9}"/>`; } return o; };
const plane = (x, y, r, c = T.amber) => `<path transform="translate(${x} ${y}) rotate(${r}) scale(1.3)" d="M0-12l2 7 9 5v3l-9-2v6l3 2v2l-5-1-5 1v-2l3-2v-6l-9 2v-3l9-5z" fill="${c}"/>`;
const TOM_ART = {
  rocket: () => tomSvg(`${stars(40)}
    <circle cx="220" cy="410" r="190" fill="#0E2233"/><path d="M60 360q160-90 320 0" fill="none" stroke="${T.cyan}" stroke-width="2" opacity=".4"/>
    <g transform="translate(220 170) rotate(30)"><path d="M0-110c30 30 40 80 30 140H-30C-40-30-30-80 0-110z" fill="#E8EEF3"/><circle cx="0" cy="-40" r="14" fill="${T.cyan}"/><circle cx="0" cy="-40" r="8" fill="#0A1220"/>
      <path d="M-30 10l-26 40 26-6zM30 10l26 40-26-6z" fill="#C2491F"/><path d="M-18 30h36l-6 18h-24z" fill="#9AA8B8"/>
      <path d="M-12 48q12 70 0 90q-12-20 0-90zM12 48q-12 70 0 90q12-20 0-90z" fill="${T.amber}"/></g>`),
  radar: () => tomSvg(`<circle cx="220" cy="180" r="150" fill="${T.panel}" stroke="${T.cyan}" stroke-width="3"/><circle cx="220" cy="180" r="95" fill="none" stroke="${T.line}" stroke-width="2"/><circle cx="220" cy="180" r="45" fill="none" stroke="${T.line}" stroke-width="2"/>
    <path d="M220 180L370 180A150 150 0 0 0 326 74z" fill="${T.cyan}" opacity=".25"/><circle cx="220" cy="180" r="6" fill="#FFF"/>
    ${plane(150, 110, 40)}${plane(300, 140, -60)}${plane(250, 260, 150)}${plane(120, 220, 100)}${plane(310, 230, 20, T.cyan)}`),
  sky: () => tomSvg(`${stars(60, 3)}
    <circle cx="320" cy="90" r="46" fill="#F3E6C8"/><circle cx="342" cy="78" r="40" fill="${T.bg}"/>
    <path d="M30 300q190-160 390-120" fill="none" stroke="${T.amber}" stroke-width="3" stroke-dasharray="4 10" stroke-linecap="round"/>
    <g transform="translate(250 200) rotate(-20)"><rect x="-38" y="-6" width="76" height="12" fill="${T.dim}"/><rect x="-62" y="-22" width="22" height="44" fill="${T.cyan}"/><rect x="40" y="-22" width="22" height="44" fill="${T.cyan}"/><rect x="-10" y="-14" width="20" height="28" rx="4" fill="#E8EEF3"/></g>
    <path d="M0 330q110-30 220 0t220 0v30H0z" fill="#0E1A26"/>`),
  trivia: () => tomSvg(`${stars(30, 11)}
    <rect x="70" y="60" width="300" height="200" fill="${T.panel}" stroke="${T.line}" stroke-width="2"/>
    <text x="220" y="185" text-anchor="middle" font-family="Oxanium,sans-serif" font-size="130" font-weight="700" fill="${T.cyan}">?</text>
    <g font-family="JetBrains Mono,monospace" font-size="16" fill="${T.dim}"><text x="90" y="92">Q 1 / 307</text><text x="300" y="92">★ 4</text></g>
    <g transform="translate(330 270)"><path d="M0-40c12 12 16 32 12 56H-12C-16-8-12-28 0-40z" fill="#E8EEF3"/><path d="M-6 16q6 28 0 36q-6-8 0-36zM6 16q-6 28 0 36q6-8 0-36z" fill="${T.amber}"/></g>`),
  night: () => tomSvg(`${stars(90, 5)}<circle cx="110" cy="100" r="3" fill="${T.cyan}"/><path d="M0 300q120-40 240-10t200-10v80H0z" fill="#0B1220"/>
    <text x="220" y="210" text-anchor="middle" font-family="Oxanium,sans-serif" font-size="70" font-weight="300" fill="${T.amber}" opacity=".7">22:00</text>`),
  home: () => tomSvg(`<rect x="30" y="30" width="380" height="260" rx="24" fill="#111A27" stroke="${T.line}" stroke-width="2"/><rect x="50" y="50" width="340" height="180" fill="${T.bg}" stroke="${T.line}"/>
    <text x="70" y="90" font-family="Oxanium,sans-serif" font-size="20" font-weight="700" letter-spacing="4" fill="${T.cyan}">FLIGHT DECK</text>
    <rect x="70" y="110" width="90" height="100" fill="${T.panel}" stroke="${T.line}"/><rect x="175" y="110" width="195" height="100" fill="${T.panel}" stroke="${T.line}"/>
    <g fill="#5A6577"><path d="M130 262l12-8v16z"/><rect x="296" y="254" width="16" height="16" rx="2"/></g>
    <circle cx="220" cy="262" r="28" fill="${T.amber}" opacity=".3"/><circle cx="220" cy="262" r="10" fill="none" stroke="#FFF" stroke-width="3.5"/>
    <path d="M202 336l18-18 18 18" fill="none" stroke="${T.amber}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`),
};

const TOM = [
  () => ({ eyebrow: 'INCOMING TRANSMISSION', title: 'Welcome aboard, Captain Tom', body: 'This tablet is your flight deck: real planes over your house, rocket launches, the space station and the night sky. Here’s a quick tour.', art: TOM_ART.rocket(), next: 'Start the tour' }),
  () => ({ eyebrow: 'NAVIGATION', title: 'Home base', body: 'Wherever you are, press the round Home button at the bottom of the screen to get back to the flight deck.', art: TOM_ART.home() }),
  () => ({ eyebrow: 'RADAR', title: 'Planes over your house', body: 'Tap the radar to see the real planes flying overhead right now: where they’re from, where they’re going and how high they are.', art: TOM_ART.radar() }),
  () => ({ eyebrow: 'OBSERVATORY', title: 'Tonight’s sky', body: 'See when the space station flies over and what’s up tonight. When there’s something worth stepping outside for, a sky alert lets you know.', art: TOM_ART.sky() }),
  () => ({ eyebrow: 'MISSION CONTROL', title: 'Launches and trivia', body: 'Count down to the next rocket launches, and test yourself with over 300 space and flight questions.', art: TOM_ART.trivia() }),
  () => ({ eyebrow: 'NIGHT WATCH', title: 'Starfield at night', body: 'At 10 at night the deck dims to a starfield, and it wakes up again at 6 in the morning. Tap it any time to come back.', art: TOM_ART.night() }),
  () => ({ eyebrow: 'ALL SYSTEMS GO', title: 'Ready for launch', body: 'To see this tour again, tap TOUR on the flight deck. Clear skies, Captain!', art: TOM_ART.rocket(), next: 'Go to the flight deck' }),
];

// ---------------- Rendering ----------------

function familyPage(p, i, n) {
  const dots = Array.from({ length: n }, (_, k) => `<span style="width:${k === i ? 28 : 10}px;height:10px;border-radius:5px;background:${k === i ? settings.accent : '#C4CAD2'}"></span>`).join('');
  const main = p.wide
    ? `<div style="flex:1;display:flex;flex-direction:column;gap:28px;min-height:0">
        <div><div class="eyebrow" style="color:${settings.accent};font-size:16px">${p.eyebrow}</div>
          <div class="display" style="font-size:54px;font-weight:500;line-height:1.08;margin-top:8px">${p.title}</div></div>
        <div style="flex:1;display:grid;grid-template-columns:repeat(3,1fr);gap:22px;min-height:0">
          ${p.wide.map(([k, t, d]) => `<div style="background:#FFF;border-radius:24px;overflow:hidden;display:flex;flex-direction:column">
            <div style="height:210px;overflow:hidden;${k === 'recipes' ? `background:${settings.accent}` : ''}">${tileArt[k]().replace('style="display:block;', 'style="display:block;width:100%;height:210px;')}</div>
            <div style="padding:22px 26px;display:flex;flex-direction:column;gap:8px"><div class="display" style="font-size:28px;font-weight:500">${t}</div><div style="font-size:20px;line-height:1.4;color:${C.ink2}">${d}</div></div></div>`).join('')}
        </div></div>`
    : `<div style="flex:1;display:grid;grid-template-columns:${p.tall ? '1fr 1fr' : '560px 1fr'};gap:56px;align-items:center;min-height:0">
        <div style="height:100%;max-height:560px;display:flex;align-items:center;justify-content:center;${p.tint ? `background:${p.tint};border-radius:28px;padding:28px;box-sizing:border-box` : ''}">${p.art}</div>
        <div style="display:flex;flex-direction:column;gap:20px">
          <div class="eyebrow" style="color:${settings.accent};font-size:16px">${p.eyebrow}</div>
          <div class="display" style="font-size:54px;font-weight:500;line-height:1.08">${p.title}</div>
          <div style="font-size:23px;line-height:1.45;color:${C.ink}">${p.body}</div>
        </div></div>`;
  return `
  <div style="height:100%;box-sizing:border-box;padding:36px 48px 36px;display:flex;flex-direction:column;gap:24px;background:var(--bg)">
    <div style="display:flex;justify-content:space-between;align-items:center;min-height:52px">
      <div style="display:flex;gap:8px;align-items:center">${dots}</div>
      ${i < n - 1 ? '<button data-w="skip" class="pill" style="background:transparent;border:0;color:var(--ink-2);font-size:18px;cursor:pointer">Skip the tour</button>' : ''}
    </div>
    ${main}
    <div style="display:flex;justify-content:space-between;align-items:center">
      ${i > 0 ? '<button data-w="back" class="pill" style="background:#FFF;border:0;font-size:20px;min-height:60px;padding:0 30px;cursor:pointer">← Back</button>' : '<span></span>'}
      <button data-w="next" class="pill" style="background:${settings.accent};color:#FFF;border:0;font-size:22px;min-height:68px;padding:0 44px;cursor:pointer">${p.next || 'Next →'}</button>
    </div>
  </div>`;
}

function tomPage(p, i, n) {
  const dots = Array.from({ length: n }, (_, k) => `<span style="width:${k === i ? 30 : 12}px;height:6px;background:${k === i ? T.cyan : T.line}"></span>`).join('');
  const btn = `font-family:Oxanium,sans-serif;font-weight:700;letter-spacing:3px;cursor:pointer;text-transform:uppercase`;
  return `
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Oxanium:wght@300;500;700&family=JetBrains+Mono:wght@400;600&display=swap">
  <div style="height:100%;box-sizing:border-box;padding:32px 44px;background:${T.bg};color:${T.ink};font-family:'JetBrains Mono',monospace;display:flex;flex-direction:column;gap:24px">
    <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid ${T.line};padding-bottom:16px;min-height:44px">
      <div style="display:flex;gap:8px;align-items:center">${dots}<span style="margin-left:14px;font-size:14px;letter-spacing:3px;color:${T.dim}">${i + 1} / ${n}</span></div>
      ${i < n - 1 ? `<button data-w="skip" style="${btn};background:none;border:1px solid ${T.line};color:${T.dim};min-height:44px;padding:0 18px;font-size:13px">Skip tour</button>` : ''}
    </div>
    <div style="flex:1;display:grid;grid-template-columns:520px 1fr;gap:56px;align-items:center;min-height:0">
      <div style="border:1px solid ${T.line};background:${T.panel};padding:24px">${p.art}</div>
      <div style="display:flex;flex-direction:column;gap:20px">
        <div style="font-size:15px;letter-spacing:4px;color:${T.amber}">${p.eyebrow}</div>
        <div style="font-family:Oxanium,sans-serif;font-size:52px;font-weight:500;line-height:1.08;color:${T.cyan}">${p.title}</div>
        <div style="font-size:21px;line-height:1.55">${p.body}</div>
      </div>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center">
      ${i > 0 ? `<button data-w="back" style="${btn};background:none;border:1px solid ${T.line};color:${T.ink};min-height:60px;padding:0 28px;font-size:16px">← Back</button>` : '<span></span>'}
      <button data-w="next" style="${btn};background:${T.cyan};border:0;color:${T.bg};min-height:68px;padding:0 40px;font-size:19px">${p.next || 'Next →'}</button>
    </div>
  </div>`;
}

export function mount(el, ctx) {
  const tom = profile === 'tom';
  const pages = tom ? TOM : FAMILY;
  step = 0;
  const home = (ctx && ctx.homeRoute) || (tom ? 'bridge' : 'home');
  const draw = () => {
    el.innerHTML = (tom ? tomPage : familyPage)(pages[step](), step, pages.length);
    clearInterval(qrTimer);
    // The photos page: the tablet may join Wi-Fi while it's open.
    if (!tom && step === 3 && isTablet() && !uploadUrl()) qrTimer = setInterval(() => { if (el.isConnected && uploadUrl()) draw(); }, 5000);
  };
  const finish = () => { setWelcomeDone(true); location.hash = `#/${home}`; };
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-w]');
    if (!b) return;
    const w = b.dataset.w;
    if (w === 'skip') finish();
    else if (w === 'back') { step = Math.max(0, step - 1); draw(); }
    else if (w === 'next') { if (step >= pages.length - 1) finish(); else { step++; draw(); } }
  });
  // Swipe left/right to turn pages too.
  let x0 = null;
  el.addEventListener('touchstart', (e) => { x0 = e.touches.length === 1 ? e.touches[0].clientX : null; }, { passive: true });
  el.addEventListener('touchend', (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0; x0 = null;
    if (Math.abs(dx) < 90) return;
    if (dx < 0 && step < pages.length - 1) { step++; draw(); } else if (dx > 0 && step > 0) { step--; draw(); }
  });
  draw();
}

export function unmount() { clearInterval(qrTimer); }
