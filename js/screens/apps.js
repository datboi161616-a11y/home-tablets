// Apps: YouTube, Spotify, etc. as big tiles. Pressing Home inside an app
// always comes back to our system (kiosk mode).
import { profile } from '../config.js';
import { getApps, openApp, onAppsChanged, hasApps } from '../services/apps.js';

let off;

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const THEMES = {
  family: {
    bg: '#ECEEF0', ink: '#1D2430', ink2: '#4A5363', tile: '#FFFFFF', radius: '24px',
    font: "Outfit, system-ui, sans-serif", back: '#/launcher', backLabel: '← Menu',
    title: 'Apps', sub: 'Press the Home button any time to come back here.',
  },
  tom: {
    bg: '#05070D', ink: '#D7E6F0', ink2: '#7FA6B8', tile: '#0B1220', radius: '6px',
    font: "Oxanium, 'JetBrains Mono', monospace", back: '#/bridge', backLabel: '◂ DECK',
    title: 'APPS', sub: 'PRESS HOME ANY TIME TO RETURN TO THE FLIGHT DECK',
  },
};

export function mount(el) {
  const t = THEMES[profile] || THEMES.family;
  const tom = profile === 'tom';

  function render() {
    const apps = getApps();
    el.innerHTML = `
    ${tom ? '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Oxanium:wght@300;500;700&family=JetBrains+Mono:wght@400;600&display=swap">' : ''}
    <style>
      .ap-root{position:absolute;top:0;right:0;bottom:0;left:0;background:${t.bg};color:${t.ink};padding:40px;display:flex;flex-direction:column;gap:28px}
      .ap-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:24px;align-content:start}
      .ap-tile{background:${t.tile};border-radius:${t.radius};padding:28px 16px 24px;display:flex;flex-direction:column;align-items:center;gap:16px;
        cursor:pointer;border:${tom ? '1px solid #1E3A4A' : '0'};transition:transform .12s ease;min-height:200px;justify-content:center}
      .ap-tile:active{transform:scale(.96)}
      .ap-icon{width:104px;height:104px;border-radius:24px;object-fit:contain}
      .ap-name{font-family:${t.font};font-size:24px;font-weight:500;text-align:center;line-height:1.15}
    </style>
    <div class="ap-root">
      <div style="display:flex;align-items:center;gap:24px">
        <a href="${t.back}" class="pill" style="background:${tom ? 'transparent' : t.tile};color:${tom ? '#5CE1E6' : t.ink};${tom ? 'border:1px solid #1E3A4A;letter-spacing:3px;font-family:JetBrains Mono,monospace;font-size:14px' : ''}">${t.backLabel}</a>
        <div style="font-family:${t.font};font-size:${tom ? '22px' : '44px'};font-weight:500;${tom ? 'letter-spacing:6px;color:#5CE1E6' : ''}">${t.title}</div>
      </div>
      ${apps.length ? `
        <div class="ap-grid">
          ${apps.map((a) => `
            <div class="ap-tile" data-pkg="${esc(a.pkg)}">
              ${a.icon
                ? `<img class="ap-icon" src="${a.icon}" alt="">`
                : `<div class="ap-icon" style="background:${a.color || '#888'};display:flex;align-items:center;justify-content:center;color:#fff;font-size:44px;font-weight:700">${esc(a.label[0])}</div>`}
              <div class="ap-name">${esc(a.label)}</div>
            </div>`).join('')}
        </div>
        <div style="margin-top:auto;color:${t.ink2};font-size:${tom ? '14px' : '18px'};${tom ? 'letter-spacing:2px;font-family:JetBrains Mono,monospace' : ''}">${t.sub}</div>`
      : `
        <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;text-align:center">
          <div style="font-family:${t.font};font-size:36px;font-weight:500">No apps yet</div>
          <div style="color:${t.ink2};font-size:20px;max-width:640px">Apps like YouTube or Spotify will show up here once they've been added for this tablet.</div>
        </div>`}
    </div>`;

    el.querySelectorAll('[data-pkg]').forEach((tile) => {
      tile.addEventListener('click', () => openApp(tile.dataset.pkg));
    });
  }

  render();
  off = hasApps() ? onAppsChanged(render) : null;
}

export function unmount() {
  off?.();
}
