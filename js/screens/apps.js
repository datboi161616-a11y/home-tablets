// Apps: YouTube, Spotify, etc. as big tiles. Pressing Home inside an app
// always comes back to our system (kiosk mode).
import { profile } from '../config.js';
import { getApps, openApp, onAppsChanged, hasApps } from '../services/apps.js';
import { C } from '../art.js';

let off, msgTimer, busyTimer;

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const THEMES = {
  family: {
    bg: '#ECEEF0', ink: '#1D2430', ink2: '#4A5363', tile: '#FFFFFF', radius: '24px',
    font: "Outfit, system-ui, sans-serif", back: '#/launcher', backLabel: '← Menu',
    title: 'Apps', sub: 'Press the Home button any time to come back here.',
    accent: '#C2491F',
  },
  tom: {
    bg: '#05070D', ink: '#D7E6F0', ink2: '#7FA6B8', tile: '#0B1220', radius: '6px',
    font: "Oxanium, 'JetBrains Mono', monospace", back: '#/bridge', backLabel: '◂ DECK',
    title: 'APPS', sub: 'PRESS HOME ANY TIME TO RETURN TO THE FLIGHT DECK',
    accent: '#FFB547',
  },
};

// Room for the grid on the 1280x800 canvas: 800 - padding 80 - header 52 - footer line ~24 - gaps 56.
const GRID_H = 588;
const GAP = 24;

// Family look only: a tablet full of apps, on the house halo. Fills the space under a short grid.
const appsArt = (w = 340) => `<svg viewBox="0 0 360 200" aria-hidden="true" focusable="false" style="display:block;width:${w}px;max-width:100%;height:auto">
  <circle cx="180" cy="104" r="92" fill="#F7F5FA"/>
  <rect x="84" y="46" width="192" height="126" rx="16" fill="${C.ink}"/><rect x="95" y="57" width="170" height="104" rx="6" fill="#F1EFF5"/>
  <rect x="109" y="69" width="38" height="38" rx="10" fill="${C.accent}"/><path d="M123 79l12 9-12 9z" fill="#FFF"/>
  <rect x="161" y="69" width="38" height="38" rx="10" fill="${C.green}"/><path d="M175 99V80l13-3v17" stroke="#FFF" stroke-width="3" fill="none" stroke-linejoin="round"/><circle cx="172" cy="99" r="3.5" fill="#FFF"/><circle cx="185" cy="94" r="3.5" fill="#FFF"/>
  <rect x="213" y="69" width="38" height="38" rx="10" fill="${C.blue}"/><rect x="221" y="80" width="16" height="14" rx="3" fill="#FFF"/><path d="M237 87l8-5v12z" fill="#FFF"/>
  <rect x="109" y="115" width="38" height="38" rx="10" fill="${C.mustard}"/><rect x="161" y="115" width="38" height="38" rx="10" fill="${C.plum}"/><rect x="213" y="115" width="38" height="38" rx="10" fill="${C.ink3}"/>
  <path d="M296 70v-22l16-4v18" stroke="${C.green}" stroke-width="4" fill="none" stroke-linejoin="round"/><circle cx="292" cy="70" r="5" fill="${C.green}"/><circle cx="308" cy="64" r="5" fill="${C.green}"/>
  <path d="M58 124l3 7 7 .5-5 4.5 1.5 7L58 139l-6.5 4 1.5-7-5-4.5 7-.5z" fill="${C.gold}"/>
</svg>`;

/** Columns and tile height so any number of apps fits on one screen without scrolling. */
function gridSize(n) {
  const cols = n <= 10 ? 5 : n <= 18 ? 6 : n <= 28 ? 7 : 8;
  const rows = Math.max(1, Math.ceil(n / cols));
  const h = Math.min(200, Math.floor((GRID_H - (rows - 1) * GAP) / rows));
  const compact = h < 180;
  // Tile = padding + icon + gap + up to two lines of name, all inside h.
  return { cols, h, icon: Math.max(36, Math.min(96, h - (compact ? 80 : 104))), compact };
}


// ---- Fallback app pictures (generic shapes by kind of app, never a company's logo) ----
const KIND_GLYPH = {
  video: '<path fill="#fff" fill-rule="evenodd" d="M13 10h22a9 9 0 0 1 9 9v10a9 9 0 0 1-9 9H13a9 9 0 0 1-9-9V19a9 9 0 0 1 9-9zM20 17v14l11-7z"/>',
  music: '<path d="M19 34V12l20-5v22" fill="none" stroke="#fff" stroke-width="4" stroke-linejoin="round"/><circle cx="14" cy="34" r="6" fill="#fff"/><circle cx="34" cy="29" r="6" fill="#fff"/>',
  movie: '<rect x="6" y="14" width="36" height="24" rx="4" fill="#fff"/><path d="M6 14l6-8h6l-6 8m6 0l6-8h6l-6 8m6 0l6-8h6" stroke="#fff" stroke-width="3" fill="none" stroke-linejoin="round"/>',
  call: '<rect x="4" y="13" width="28" height="22" rx="6" fill="#fff"/><path d="M34 21l10-6v18l-10-6z" fill="#fff"/>',
  chat: '<path d="M24 6c-10.5 0-19 7.2-19 16 0 4.4 2.1 8.4 5.6 11.3L9 42l9.2-4.4c1.8.5 3.8.8 5.8.8 10.5 0 19-7.2 19-16S34.5 6 24 6z" fill="#fff"/>',
  game: '<path d="M12 14h24a9 9 0 0 1 9 10l-1 8a6 6 0 0 1-10.6 3.4L30 31H18l-3.4 4.4A6 6 0 0 1 4 32l-1-8a9 9 0 0 1 9-10z" fill="#fff"/>',
  book: '<path d="M24 12c-5-4-12-4-18-2v28c6-2 13-2 18 2 5-4 12-4 18-2V10c-6-2-13-2-18 2z" fill="#fff"/><path d="M24 12v28" stroke="rgba(0,0,0,.25)" stroke-width="2"/>',
  web: '<circle cx="24" cy="24" r="18" fill="none" stroke="#fff" stroke-width="4"/><path d="M6 24h36M24 6c-6 6-6 30 0 36M24 6c6 6 6 30 0 36" fill="none" stroke="#fff" stroke-width="3"/>',
  photo: '<rect x="5" y="9" width="38" height="30" rx="6" fill="#fff"/><circle cx="16" cy="19" r="4" fill="rgba(0,0,0,.25)"/><path d="M5 35l12-12 8 8 6-6 12 12z" fill="rgba(0,0,0,.25)"/>',
  map: '<path d="M24 4c-8 0-14 6-14 14 0 10 14 26 14 26s14-16 14-26c0-8-6-14-14-14z" fill="#fff"/><circle cx="24" cy="18" r="5" fill="rgba(0,0,0,.25)"/>',
  shop: '<path d="M8 16h32l-3 26H11z" fill="#fff"/><path d="M17 20v-6a7 7 0 0 1 14 0v6" fill="none" stroke="#fff" stroke-width="4"/>',
  news: '<rect x="6" y="8" width="36" height="32" rx="4" fill="#fff"/><path d="M12 16h24M12 23h24M12 30h14" stroke="rgba(0,0,0,.25)" stroke-width="3" stroke-linecap="round"/>',
  weather: '<circle cx="18" cy="18" r="8" fill="#fff"/><path d="M14 40a8 8 0 0 1 2-15.8A11 11 0 0 1 37 26a7 7 0 0 1 1 14z" fill="#fff"/>',
};
// Which picture an app gets, from its name and package.
const KINDS = [
  ['call', /zoom|meet|duo|skype|facetime|teams|webex|video ?call/],
  ['video', /youtube|tube|twitch|vimeo|video|tiktok|kids/],
  ['movie', /netflix|disney|hulu|prime ?video|hbo|\bmax\b|peacock|paramount|plex|movie|film|tv/],
  ['music', /spotify|music|pandora|audible|podcast|radio|deezer|tidal|soundcloud|sirius/],
  ['chat', /whatsapp|messenger|message|chat|signal|telegram|viber|discord|sms/],
  ['game', /game|play ?games|roblox|minecraft|chess|puzzle|candy|solitaire|sudoku/],
  ['book', /kindle|book|libby|read|scribd|wattpad/],
  ['photo', /photo|gallery|camera|instagram|pinterest/],
  ['map', /maps?\b|waze|navigation/],
  ['shop', /amazon|shop|store|walmart|target|ebay|etsy|instacart|doordash|uber ?eats/],
  ['news', /news|cnn|bbc|times|post|reddit/],
  ['weather', /weather/],
  ['web', /chrome|browser|firefox|edge|opera|duckduckgo|web/],
];
function appKind(a) {
  const t = `${a.label || ''} ${a.pkg || ''}`.toLowerCase();
  for (let i = 0; i < KINDS.length; i++) if (KINDS[i][1].test(t)) return KINDS[i][0];
  return '';
}
const FALLBACK_COLORS = ['#C2491F', '#3E7D6E', '#2D5BA8', '#A84E72', '#C98A1E', '#5B6FA8'];
function colorFor(a) {
  let h = 0;
  const t = String(a.pkg || a.label || '');
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) >>> 0;
  return FALLBACK_COLORS[h % FALLBACK_COLORS.length];
}

export function mount(el) {
  const t = THEMES[profile] || THEMES.family;
  const tom = profile === 'tom';
  let busy = null; // the app that's starting, so a second tap doesn't open it twice

  function say(text) {
    const m = el.querySelector('[data-msg]');
    if (!m) return;
    m.textContent = text;
    m.style.display = 'block';
    clearTimeout(msgTimer);
    msgTimer = setTimeout(() => { if (el.isConnected) m.style.display = 'none'; }, 5000);
  }

  // When Android can't give us the app's own icon (browser preview, or the app was
  // uninstalled), draw a simple picture of what kind of app it is on the app's colour.
  function letterIcon(a, size) {
    const g = KIND_GLYPH[appKind(a)];
    const inner = g
      ? `<svg viewBox="0 0 48 48" width="${Math.round(size * 0.56)}" height="${Math.round(size * 0.56)}" aria-hidden="true" focusable="false">${g}</svg>`
      : `<span style="font-size:${Math.round(size * 0.42)}px;font-weight:700">${esc((a.label || '?')[0])}</span>`;
    return `<div class="ap-icon" style="background:${a.color || colorFor(a)};display:flex;align-items:center;justify-content:center;color:#fff">${inner}</div>`;
  }

  function render() {
    const apps = getApps();
    const g = gridSize(apps.length);
    const rows = Math.max(1, Math.ceil(apps.length / g.cols));
    const spare = GRID_H - rows * g.h - (rows - 1) * GAP; // empty height under the grid
    el.innerHTML = `
    ${tom ? '<link rel="stylesheet" crossorigin href="https://fonts.googleapis.com/css2?family=Oxanium:wght@300;500;700&family=JetBrains+Mono:wght@400;600&display=swap">' : ''}
    <style>
      .ap-root{position:absolute;top:0;right:0;bottom:0;left:0;background:${t.bg};color:${t.ink};padding:40px;display:flex;flex-direction:column;gap:28px}
      .ap-grid{display:grid;grid-template-columns:repeat(${g.cols},minmax(0,1fr));grid-auto-rows:${g.h}px;gap:${GAP}px;align-content:start;overflow:hidden}
      .ap-tile{background:${t.tile};border-radius:${t.radius};padding:${g.compact ? '12px 10px' : '18px 12px'};display:flex;flex-direction:column;align-items:center;gap:${g.compact ? 8 : 12}px;
        cursor:pointer;border:${tom ? '1px solid #1E3A4A' : '0'};transition:transform .12s ease,opacity .2s;justify-content:center;min-width:0;overflow:hidden}
      .ap-tile:active{transform:scale(.96)}
      .ap-tile.busy{opacity:.6}
      .ap-tile.missing .ap-icon{filter:grayscale(1);opacity:.5}
      .ap-icon{flex:none;width:${g.icon}px;height:${g.icon}px;border-radius:${Math.round(g.icon * 0.23)}px;object-fit:contain}
      .ap-name{font-family:${t.font};font-size:${g.compact ? 20 : 24}px;font-weight:500;text-align:center;line-height:1.15;max-width:100%;
        overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;word-break:break-word}
      .ap-note{font-size:15px;color:${t.ink2};margin-top:-6px}
      .ap-msg{position:absolute;left:50%;bottom:32px;transform:translateX(-50%);max-width:900px;display:none;background:${tom ? '#0B1220' : '#1D2430'};color:${tom ? t.accent : '#fff'};
        ${tom ? `border:1px solid ${t.accent};font-family:JetBrains Mono,monospace;letter-spacing:1px;` : ''}padding:14px 26px;border-radius:999px;font-size:19px;font-weight:600;text-align:center;z-index:5}
    </style>
    <div class="ap-root">
      <div style="display:flex;align-items:center;gap:24px">
        <a href="${t.back}" class="pill" style="background:${tom ? 'transparent' : t.tile};color:${tom ? '#5CE1E6' : t.ink};${tom ? 'border:1px solid #1E3A4A;letter-spacing:3px;font-family:JetBrains Mono,monospace;font-size:14px' : ''}">${t.backLabel}</a>
        <div style="font-family:${t.font};font-size:${tom ? '22px' : '44px'};font-weight:500;${tom ? 'letter-spacing:6px;color:#5CE1E6' : ''}">${t.title}</div>
      </div>
      ${apps.length ? `
        <div class="ap-grid">
          ${apps.map((a) => `
            <div class="ap-tile${a.missing ? ' missing' : ''}" data-pkg="${esc(a.pkg)}">
              ${a.icon ? `<img class="ap-icon" src="${esc(a.icon)}" alt="">` : letterIcon(a, g.icon)}
              <div class="ap-name">${esc(a.label)}</div>
              ${a.missing && !g.compact ? `<div class="ap-note">${tom ? 'NOT INSTALLED' : 'Not installed'}</div>` : ''}
            </div>`).join('')}
        </div>
        ${!tom && spare >= 240 ? `<div style="flex:1;min-height:0;display:flex;align-items:center;justify-content:center;pointer-events:none">${appsArt(Math.min(380, Math.round((spare - 60) * 1.8)))}</div>` : ''}
        <div style="margin-top:auto;color:${t.ink2};font-size:${tom ? '14px' : '18px'};${tom ? 'letter-spacing:2px;font-family:JetBrains Mono,monospace' : ''}">${t.sub}</div>`
      : `
        <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;text-align:center">
          ${tom ? '' : `<div style="margin-bottom:8px">${appsArt(360)}</div>`}
          <div style="font-family:${t.font};font-size:36px;font-weight:500">No apps yet</div>
          <div style="color:${t.ink2};font-size:20px;max-width:640px">Apps like YouTube or Spotify will show up here once they've been added for this screen.</div>
        </div>`}
      <div class="ap-msg" data-msg></div>
    </div>`;

    // A missing icon picture shouldn't show as a broken image: use the letter tile instead.
    el.querySelectorAll('img.ap-icon').forEach((img) => {
      img.addEventListener('error', () => {
        const a = apps.find((x) => x.pkg === img.closest('[data-pkg]').dataset.pkg) || {};
        img.outerHTML = letterIcon(a, g.icon);
      });
    });

    el.querySelectorAll('[data-pkg]').forEach((tile) => {
      tile.addEventListener('click', () => {
        const pkg = tile.dataset.pkg;
        const a = apps.find((x) => x.pkg === pkg) || { label: 'That app' };
        if (busy) return;
        if (!hasApps()) { say(`On the kitchen screen, this opens ${a.label}.`); return; }
        busy = pkg;
        tile.classList.add('busy');
        const name = tile.querySelector('.ap-name');
        name.textContent = tom ? 'OPENING…' : 'Opening…';
        const reset = () => {
          busy = null;
          if (!el.isConnected) return;
          tile.classList.remove('busy');
          name.textContent = a.label;
        };
        if (openApp(pkg)) {
          // The old tablets take a few seconds to start an app; keep the tile marked meanwhile.
          clearTimeout(busyTimer);
          busyTimer = setTimeout(reset, 4000);
        } else {
          reset();
          say(tom
            ? `${a.label.toUpperCase()} WON'T OPEN. IT MAY NEED INSTALLING AGAIN.`
            : `${a.label} won’t open. It may need to be installed again — ask the person who set up this screen.`);
        }
      });
    });
  }

  render();
  off = hasApps() ? onAppsChanged(render) : null;
}

export function unmount() {
  off?.();
  clearTimeout(msgTimer);
  clearTimeout(busyTimer);
}
