// "What's new": the highlights of what has arrived by itself, each with a "Show me".
// Kitchen screens get it in their own look, Tom's deck in the deck's.
import { profile } from '../config.js';
import { backHref, backLabel } from '../services/nav.js';
import { newest, markSeen } from '../services/whatsnew.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function mount(el) {
  const deck = profile === 'tom';
  const edition = newest();
  markSeen(); // looked at: the word on the home screen can go

  el.innerHTML = `
  <style>
    .wn{height:100%;box-sizing:border-box;padding:36px 40px;display:flex;flex-direction:column;gap:20px}
    .wn-top{display:flex;align-items:center;gap:16px;flex:none}
    .wn-grid{flex:1;min-height:0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));grid-auto-rows:minmax(0,1fr);gap:16px}
    .wn-card{display:flex;flex-direction:column;gap:8px;padding:22px 24px;min-width:0;cursor:pointer}
    .wn-card h3{margin:0;font-family:Outfit,system-ui,sans-serif;font-size:26px;font-weight:500;line-height:1.15}
    .wn-card p{margin:0;font-size:18px;line-height:1.4;color:var(--ink-2)}
    .wn-go{margin-top:auto;font-size:17px;font-weight:600;color:var(--accent)}
    .wn-back{background:#fff}
    /* The flight deck's colours */
    .wn.deck{--ink:#E3EDF5;--ink-2:#9DB4C4;--accent:#5CE1E6;background:#05070D;color:var(--ink);font-family:'JetBrains Mono',monospace}
    .deck .wn-card{background:#0A1220;border:1px solid #1E3A4A;border-radius:4px}
    .deck .wn-card h3{font-family:Oxanium,sans-serif;color:#5CE1E6;letter-spacing:1px;text-transform:uppercase;font-size:22px}
    .deck .wn-card p{font-size:16px}
    .deck .wn-back{background:#12203A;color:var(--ink)}
    .deck .wn-title{font-family:Oxanium,sans-serif;letter-spacing:4px;text-transform:uppercase;color:#5CE1E6;font-size:30px}
  </style>
  <div class="wn${deck ? ' deck' : ''}">
    <div class="wn-top">
      <a href="${backHref()}" class="pill wn-back">${backLabel()}</a>
      <div class="display wn-title" style="font-size:${deck ? 30 : 40}px;font-weight:500">${deck ? 'New on the deck' : 'New on your kitchen screen'}</div>
      <div class="muted" style="margin-left:auto;font-size:17px;text-align:right">${deck ? 'IT ARRIVED BY ITSELF. NOTHING TO INSTALL.' : 'It arrived by itself. Nothing to install.'}</div>
    </div>
    <div class="wn-grid">
      ${edition.items.map(([title, line, screen]) => `
        <a class="card wn-card" href="#/${screen}">
          <h3>${esc(title)}</h3>
          <p>${esc(line)}</p>
          <div class="wn-go">${deck ? 'SHOW ME ▸' : 'Show me →'}</div>
        </a>`).join('')}
    </div>
  </div>`;
}

export function unmount() {}
