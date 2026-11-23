// The screen's own keyboard (never Android's: it kept popping open and shut). A box on the
// screen is a plain button; tapping it slides this panel up over the bottom of the screen.
// Nothing ever takes the focus: there is no <input>, a key only changes the text.
// Used by the Shopping list ("Add something") and Recipes (search).
//
//   const kb = openKeyboard(host, {
//     go: 'Add',                         // the big key's word
//     suggest: (text) => ['Milk', …],    // the row of suggestions above the keys
//     onChange: (text) => …,             // after each key (draw the box's text)
//     onGo: (pick, kb) => …,             // the big key (pick = '') or a suggestion (pick = its words)
//     onClose: () => …,                  // ✕ Close, or kb.close()
//   });
//   kb.text / kb.set('') / kb.refresh() / kb.close()
//
// keyboardStyle(colours) gives the panel's CSS in a screen's own colours.
import { esc } from './kitchen-ui.js';

const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
const NUMS = ['1234567890', "-'&,./", '%#()+'];

/** CSS for the keyboard in a screen's colours. */
export function keyboardStyle({ panel = '#0E222C', key = '#FFF8EE', ink = '#23323A', fn = 'rgba(255,255,255,.16)', fnInk = '#FFFFFF',
  sug = 'rgba(255,255,255,.14)', sugInk = '#FFFFFF', go = '#FFB86B', goInk = '#23323A', space = '#5B6B73', line = 'rgba(255,255,255,.3)' } = {}) {
  return `
    .kb-panel{position:absolute;left:0;bottom:0;width:100%;z-index:7;background:${panel};box-shadow:0 -4px 14px rgba(0,0,0,.35);
      padding:14px 20px 16px;display:flex;flex-direction:column;gap:8px;animation:kb-up .18s ease-out both}
    .kb-sug{display:flex;gap:10px;height:76px;margin-bottom:4px}
    .kb-s{flex:1 1 0;min-width:0;border-radius:38px;border:0;background:${sug};color:${sugInk};font:600 20px/1.15 Inter,system-ui,sans-serif;
      padding:0 12px;overflow:hidden;cursor:pointer}
    .kb-s[hidden]{display:block;visibility:hidden}
    .kb-close{flex:none;width:150px;border-radius:999px;border:0;background:transparent;box-shadow:inset 0 0 0 2px ${line};color:${fnInk};
      font:600 21px Inter,system-ui,sans-serif;cursor:pointer}
    .kb-r{display:flex;gap:10px;justify-content:center}
    .kb-k{flex:none;width:114px;height:76px;border-radius:14px;border:0;background:${key};color:${ink};font:500 32px Inter,system-ui,sans-serif;
      cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0}
    .kb-panel.up .kb-k.l{text-transform:uppercase}
    .kb-k.fn{background:${fn};color:${fnInk};font-size:24px;font-weight:600}
    .kb-k.w2{width:238px}
    .kb-k.sp{flex:1 1 0;width:auto;font-size:22px;color:${space}}
    .kb-k.go{width:300px;background:${go};color:${goInk};font-weight:700;font-size:28px}
    .kb-panel .num{display:none}
    .kb-panel.n .num{display:flex}
    .kb-panel.n .abc{display:none}
    @keyframes kb-up{0%{transform:translate3d(0,100%,0)}100%{transform:translate3d(0,0,0)}}
    @media (prefers-reduced-motion: reduce){.kb-panel{animation:none}}`;
}

const key = (c, letter) => `<button type="button" class="kb-k${letter ? ' l' : ''}" data-k="${esc(c)}">${esc(c)}</button>`;
const BACK = '<button type="button" class="kb-k fn w2" data-kback aria-label="Delete">⌫</button>';

/**
 * Slide the keyboard up inside `host` (a positioned element). Returns the keyboard; only
 * one per host (opening again returns the one that is up).
 */
export function openKeyboard(host, opts = {}) {
  if (host.__kb) return host.__kb;
  const o = Object.assign({ go: 'Add', max: 60, slots: 6, text: '', suggest: () => [], onChange: () => {}, onGo: () => {}, onClose: () => {} }, opts);
  const panel = document.createElement('div');
  panel.className = 'kb-panel up';
  panel.setAttribute('data-kb', '');
  panel.innerHTML = `
    <div class="kb-sug">${Array.from({ length: o.slots }, () => '<button type="button" class="kb-s" data-s="" hidden></button>').join('')}
      <button type="button" class="kb-close" data-kclose>✕ Close</button></div>
    ${ROWS.map((r, i) => `<div class="kb-r abc">${r.split('').map((c) => key(c, true)).join('')}${i === 2 ? BACK : ''}</div>`).join('')}
    ${NUMS.map((r, i) => `<div class="kb-r num">${r.split('').map((c) => key(c)).join('')}${i === 2 ? BACK : ''}</div>`).join('')}
    <div class="kb-r">
      <button type="button" class="kb-k fn w2" data-knum><span class="abc">123</span><span class="num">ABC</span></button>
      <button type="button" class="kb-k sp" data-k=" ">space</button>
      <button type="button" class="kb-k go" data-kgo>${esc(o.go)}</button>
    </div>`;
  let num = false;
  const setNum = (on) => { num = on; panel.classList.toggle('n', on); };
  const kb = {
    el: panel,
    text: String(o.text || '').slice(0, o.max),
    open: true,
    /** Put new words in the box. */
    set(t) { kb.text = String(t || '').slice(0, o.max); kb.refresh(); },
    /** Draw the box's text (onChange) and fresh suggestions. */
    refresh() {
      if (!kb.open) return;
      panel.classList.toggle('up', !kb.text.trim());
      const list = o.suggest(kb.text) || [];
      const btns = panel.querySelectorAll('[data-s]');
      for (let i = 0; i < btns.length; i++) {
        const t = list[i] || '';
        if (btns[i].getAttribute('data-s') === t) continue;
        btns[i].setAttribute('data-s', t);
        btns[i].textContent = t;
        btns[i].hidden = !t;
      }
      o.onChange(kb.text);
    },
    close() {
      if (!kb.open) return;
      kb.open = false;
      if (panel.parentNode) panel.parentNode.removeChild(panel);
      delete host.__kb;
      o.onClose(kb.text);
    },
  };
  // A tap on a key must never move the focus anywhere (nothing on these screens takes typing).
  panel.addEventListener('mousedown', (e) => e.preventDefault());
  panel.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t || !kb.open) return;
    const sug = t.getAttribute('data-s');
    if (t.dataset.k != null) {
      const c = t.dataset.k;
      if (c === ' ' && (!kb.text || / $/.test(kb.text))) return;
      if (kb.text.length < o.max) kb.text += c;
      if (c === ' ' && num) setNum(false); // "2 x milk": back to letters
    } else if (t.hasAttribute('data-kback')) kb.text = kb.text.slice(0, -1);
    else if (t.hasAttribute('data-knum')) { setNum(!num); return; }
    else if (t.hasAttribute('data-kgo') || sug) {
      if (num) setNum(false);
      o.onGo(sug || '', kb);
      if (!kb.open) return;
    } else if (t.hasAttribute('data-kclose')) { kb.close(); return; }
    kb.refresh();
  });
  host.appendChild(panel);
  host.__kb = kb;
  kb.refresh();
  return kb;
}
