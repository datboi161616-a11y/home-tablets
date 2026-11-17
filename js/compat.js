// Compatibility for older Android WebViews (the tablets may ship with Chrome 7x).
// Modern engines skip all of this. JavaScript syntax is handled separately:
// the deploy step translates the code for older engines with esbuild.

// --- Hidden admin session: never make a sound in their home ---
// The Android app runs a second, invisible copy of the screens when you control
// a tablet remotely. That copy must stay silent (timer beeps, dictation).
if (window.TabletNative && window.TabletNative.isGhost && window.TabletNative.isGhost()) {
  const Silent = function () {
    const node = () => ({ connect() {}, disconnect() {}, start() {}, stop() {},
      frequency: { value: 0, setValueAtTime() {} },
      gain: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} } });
    return { currentTime: 0, state: 'running', destination: {}, resume: () => Promise.resolve(),
      close: () => Promise.resolve(), createOscillator: node, createGain: node };
  };
  window.AudioContext = window.webkitAudioContext = Silent;
  window.SpeechRecognition = window.webkitSpeechRecognition = undefined;
  HTMLMediaElement.prototype.play = () => Promise.resolve();
}

// --- AbortSignal.timeout (Chrome 103+) ---
if (typeof AbortSignal !== 'undefined' && !AbortSignal.timeout) {
  AbortSignal.timeout = (ms) => {
    const ctl = new AbortController();
    setTimeout(() => ctl.abort(), ms);
    return ctl.signal;
  };
}

// --- Flexbox `gap` (Chrome 84+) ---
// Older engines understand `gap` only for grid. For flex containers we turn
// the gap into margins on the children.
function flexGapSupported() {
  const d = document.createElement('div');
  d.style.cssText = 'display:flex;flex-direction:column;row-gap:1px;position:absolute;visibility:hidden';
  d.appendChild(document.createElement('div'));
  d.appendChild(document.createElement('div'));
  document.body.appendChild(d);
  const ok = d.scrollHeight === 1;
  d.remove();
  return ok;
}

function shimFlexGap(root) {
  const els = [root, ...root.querySelectorAll('*')];
  for (const el of els) {
    const cs = getComputedStyle(el);
    if (cs.display !== 'flex' && cs.display !== 'inline-flex') continue;
    const col = cs.flexDirection.startsWith('column');
    const gap = parseFloat(col ? cs.rowGap : cs.columnGap) || 0;
    const wrapGap = parseFloat(col ? cs.columnGap : cs.rowGap) || 0;
    if (!gap && !wrapGap) continue;
    const rev = cs.flexDirection.endsWith('reverse');
    const prop = col ? (rev ? 'marginBottom' : 'marginTop') : (rev ? 'marginRight' : 'marginLeft');
    const kids = [...el.children].filter((k) => {
      const ks = getComputedStyle(k);
      return ks.position !== 'absolute' && ks.position !== 'fixed' && ks.display !== 'none';
    });
    kids.forEach((k, i) => {
      if (k.dataset.gapShim) return;
      k.dataset.gapShim = '1';
      if (i > 0 && gap && k.style[prop] !== 'auto') {
        k.style[prop] = `${(parseFloat(getComputedStyle(k)[prop]) || 0) + gap}px`;
      }
      // Wrapping rows: approximate the cross-axis gap with a margin on every item.
      if (wrapGap && cs.flexWrap !== 'nowrap') {
        const cross = col ? 'marginRight' : 'marginBottom';
        k.style[cross] = `${(parseFloat(getComputedStyle(k)[cross]) || 0) + wrapGap}px`;
      }
    });
  }
}

export function installCompat(screenEl) {
  if (flexGapSupported()) return;
  document.documentElement.classList.add('no-flex-gap');
  let pending = new Set();
  let scheduled = false;
  const run = () => {
    scheduled = false;
    const roots = [...pending];
    pending = new Set();
    for (const r of roots) if (r.isConnected) shimFlexGap(r);
  };
  new MutationObserver((muts) => {
    for (const m of muts) {
      for (const n of m.addedNodes) {
        if (n.nodeType === 1) pending.add(n.parentElement || n);
      }
    }
    if (pending.size && !scheduled) { scheduled = true; requestAnimationFrame(run); }
  }).observe(screenEl, { childList: true, subtree: true });
  shimFlexGap(screenEl);
}
