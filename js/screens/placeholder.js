// Shown in place of a screen that can't be shown:
//  - `failed`: its code couldn't be fetched. That happens when the Wi-Fi is down and
//    the screen was never kept on the device (app.js fetches them all shortly after
//    start). Starting the page over is what fetches it again, so this does that by
//    itself as soon as the site answers.
//  - `broken`: it was fetched, but stopped with an error.
//  - neither: it's in the design but not built yet ("coming soon").
import { siteAnswers } from '../services/online.js';

// The address the page last started over for (app.js forgets it once a screen opens).
const TRIED_KEY = 'screen-retry';
let timer = null;
let recheck = null;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// The kitchen screens' look.
const FAMILY = {
  page: (heading, line, buttons) => `
    <div style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px;padding:0 120px;text-align:center">
      <div class="display" style="font-size:48px;font-weight:500">${heading}</div>
      <div class="muted" style="font-size:20px;line-height:1.4">${line}</div>
      <div style="display:flex;gap:14px">${buttons}</div>
    </div>`,
  home: (route) => `<a href="#/${route}" class="pill" style="background:var(--ink);color:#fff">Back home</a>`,
  again: '<button data-again class="pill" style="border:none;background:var(--card);color:var(--ink);font-family:inherit;cursor:pointer">Try again</button>',
};

// The flight deck's look (Tom's tablet).
const DECK = {
  page: (heading, line, buttons) => `
    <link rel="stylesheet" crossorigin href="https://fonts.googleapis.com/css2?family=Oxanium:wght@300;500;700&family=JetBrains+Mono:wght@400;600&display=swap">
    <div style="height:100%;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px;padding:0 120px;text-align:center;background:#05070D;color:#D7E6F0;font-family:'JetBrains Mono',monospace">
      <div style="font-family:Oxanium,sans-serif;font-size:34px;font-weight:700;letter-spacing:6px;text-transform:uppercase;color:#5CE1E6">${heading}</div>
      <div style="font-size:17px;line-height:1.5;letter-spacing:1px;color:#7FA6B8">${line}</div>
      <div style="display:flex;gap:14px">${buttons}</div>
    </div>`,
  home: (route) => `<a href="#/${route}" style="min-height:48px;padding:0 22px;box-sizing:border-box;border:1px solid #1E3A4A;color:#5CE1E6;font-size:14px;letter-spacing:3px;display:flex;align-items:center">◂ DECK</a>`,
  again: '<button data-again style="min-height:48px;padding:0 26px;border:none;border-radius:0;background:#FFB547;color:#05070D;font-family:Oxanium,sans-serif;font-size:15px;font-weight:700;letter-spacing:3px;cursor:pointer">TRY AGAIN</button>',
};

export function mount(el, { name, title, homeRoute = 'home', failed = false, broken = false }) {
  const style = homeRoute === 'bridge' ? DECK : FAMILY;
  // No way "back home" on the home screen itself: it would lead right back here.
  const home = name === homeRoute ? '' : style.home(homeRoute);

  if (!failed && !broken) {
    el.innerHTML = style.page(`<span style="text-transform:capitalize">${esc(name)}</span>`, 'This screen is coming soon.', home);
    return;
  }

  // Started over for this very screen already and it still won't open: the site is
  // answering, so it isn't the Wi-Fi. Say so, instead of starting over for ever.
  let tried = '';
  try { tried = sessionStorage.getItem(TRIED_KEY) || ''; } catch (e) { /* storage off */ }
  const waiting = failed && tried !== location.hash;

  el.innerHTML = style.page(`${esc(title || name)} can’t open right now`,
    waiting ? 'The Wi-Fi may be down. This opens by itself as soon as it’s back.'
      : 'Something went wrong with this screen. Try again in a little while.',
    home + style.again);
  el.querySelector('[data-again]').addEventListener('click', () => location.reload());
  if (!waiting) return;

  recheck = () => siteAnswers().then((up) => {
    if (!up || !el.isConnected) return;
    try { sessionStorage.setItem(TRIED_KEY, location.hash); } catch (e) { /* storage off */ }
    location.reload();
  });
  recheck(); // right away: the Wi-Fi may only have blinked while this screen was being fetched
  timer = setInterval(recheck, 15000);
  addEventListener('online', recheck);
}

export function unmount() {
  clearInterval(timer);
  timer = null;
  if (recheck) removeEventListener('online', recheck);
  recheck = null;
}
