// Apps: YouTube, Spotify, etc. as big tiles. Pressing Home inside an app
// always comes back to our system (kiosk mode).
import { profile } from '../config.js';
import { getApps, openApp, onAppsChanged, hasApps } from '../services/apps.js';

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

/** Columns and tile height so any number of apps fits on one screen without scrolling. */
function gridSize(n) {
  const cols = n <= 10 ? 5 : n <= 18 ? 6 : n <= 28 ? 7 : 8;
  const rows = Math.max(1, Math.ceil(n / cols));
  const h = Math.min(200, Math.floor((GRID_H - (rows - 1) * GAP) / rows));
  const compact = h < 180;
  // Tile = padding + icon + gap + up to two lines of name, all inside h.
  return { cols, h, icon: Math.max(36, Math.min(96, h - (compact ? 80 : 104))), compact };
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

  function letterIcon(a, size) {
    return `<div class="ap-icon" style="background:${a.color || '#888'};display:flex;align-items:center;justify-content:center;color:#fff;font-size:${Math.round(size * 0.42)}px;font-weight:700">${esc((a.label || '?')[0])}</div>`;
  }

  function render() {
    const apps = getApps();
    const g = gridSize(apps.length);
    el.innerHTML = `
    ${tom ? '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Oxanium:wght@300;500;700&family=JetBrains+Mono:wght@400;600&display=swap">' : ''}
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
        <div style="margin-top:auto;color:${t.ink2};font-size:${tom ? '14px' : '18px'};${tom ? 'letter-spacing:2px;font-family:JetBrains Mono,monospace' : ''}">${t.sub}</div>`
      : `
        <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;text-align:center">
          <div style="font-family:${t.font};font-size:36px;font-weight:500">No apps yet</div>
          <div style="color:${t.ink2};font-size:20px;max-width:640px">Apps like YouTube or Spotify will show up here once they've been added for this tablet.</div>
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
        if (!hasApps()) { say(`On the tablet, this opens ${a.label}.`); return; }
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
            : `${a.label} won’t open. It may need to be installed again — ask the person who set up this tablet.`);
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
