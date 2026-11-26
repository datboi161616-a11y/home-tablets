import { display } from './services/display.js';

// Compatibility for older Android WebViews (the tablets ship with Chrome 81).
// Modern engines skip most of this. JavaScript syntax is handled separately:
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

// --- Wording dates is slow on these tablets ---
// d.toLocaleDateString('en-US', {...}) builds a new formatter on every call: 2.7 ms each,
// measured on a real tablet, and Home, the Menu or the week plan make dozens (60-90 ms of
// every screen change). A formatter that is kept does the same wording in 0.03 ms. So the
// three toLocale... methods keep theirs, one for each combination of options.
(() => {
  if (typeof Intl === 'undefined' || !Intl.DateTimeFormat) return;
  const kept = new Map();
  const DATE = ['weekday', 'year', 'month', 'day'];
  const TIME = ['hour', 'minute', 'second', 'dayPeriod', 'fractionalSecondDigits'];
  const has = (o, fields) => fields.some((k) => o[k] !== undefined);
  function formatter(kind, locales, options) {
    // Anything unusual (a list of locales, options that aren't a plain object): the browser's own way.
    if (locales !== undefined && typeof locales !== 'string') return null;
    if (options !== undefined && (options === null || typeof options !== 'object')) return null;
    const clock24 = display().clock24;
    const key = `${kind}|${locales || ''}|${clock24 ? 24 : 12}|${JSON.stringify(options || {})}`;
    let f = kept.get(key);
    if (!f) {
      const o = Object.assign({}, options);
      // The same fields the built-in methods fill in when none is asked for.
      if (o.dateStyle === undefined && o.timeStyle === undefined) {
        const all = { year: 'numeric', month: 'numeric', day: 'numeric' };
        const clock = { hour: 'numeric', minute: 'numeric', second: 'numeric' };
        if (kind === 'date' && !has(o, DATE)) Object.assign(o, all);
        if (kind === 'time' && !has(o, TIME)) Object.assign(o, clock);
        if (kind === 'any' && !has(o, DATE) && !has(o, TIME)) Object.assign(o, all, clock);
      }
      // The owner's 24-hour clock (Settings) goes for every time the app words.
      if (clock24 && o.hour12 === undefined && o.hourCycle === undefined && (o.hour !== undefined || o.timeStyle !== undefined)) {
        o.hourCycle = 'h23';
        if (o.hour !== undefined && o.minute === undefined) o.minute = '2-digit'; // "15:00", not a bare "15"
      }
      f = new Intl.DateTimeFormat(locales, o);
      kept.set(key, f);
    }
    return f;
  }
  [['toLocaleDateString', 'date'], ['toLocaleTimeString', 'time'], ['toLocaleString', 'any']].forEach(([name, kind]) => {
    const builtIn = Date.prototype[name];
    Date.prototype[name] = function (locales, options) {
      let f = null;
      try { f = formatter(kind, locales, options); } catch (e) { f = null; }
      return f && !isNaN(this) ? f.format(this) : builtIn.call(this, locales, options);
    };
  });
})();

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

// Which style rules give something a gap? Looked up once per stylesheet (each screen
// brings its own <style> block), so that only elements that can have a gap are examined.
const rulesWithGap = new WeakMap();
const GAP = /(?:^|[{;\s])(?:row-|column-|grid-)?gap\s*:/;
function gapSelectors() {
  const list = [];
  for (const sheet of document.styleSheets) {
    let found = rulesWithGap.get(sheet);
    if (!found) {
      found = [];
      try {
        for (const rule of sheet.cssRules) {
          if (!rule.selectorText || !GAP.test(rule.cssText)) continue;
          // (Only selectors this engine can use: they are looked for all at once below.)
          try { document.querySelector(rule.selectorText); found.push(rule.selectorText); } catch (e) { /* not here */ }
        }
      } catch (e) { /* a stylesheet from another site (the fonts): none of our rules in it */ }
      rulesWithGap.set(sheet, found);
    }
    for (const s of found) list.push(s);
  }
  // One selector for them all, with the elements that have a gap in their own style="".
  return list.concat('[style*="gap"]').join(',');
}

// The flex containers to look at: `el` itself, and with `deep` everything inside it.
// Candidates are the elements with `gap` written in their own style="" and the ones
// matched by a rule that sets one; nothing else can need the fix.
// (One search with every selector at once: a search per rule cost the tablet ~10 ms a screen.)
function gapCandidates(el, deep, selector, into) {
  try {
    if (el.matches(selector)) into.add(el);
    if (deep) el.querySelectorAll(selector).forEach((x) => into.add(x));
  } catch (e) { /* a selector this engine can't use here */ }
}

// A child's own margin in px. getComputedStyle hands back a margin as laid out, so reading
// one made the browser lay out the whole screen first (on the tablet: a second full layout
// for every screen opened). The computed value (CSS Typed OM, there since Chrome 66) needs
// no layout; only a margin that isn't plain px (auto, a percentage) is read the old way.
const CSS_NAME = { marginLeft: 'margin-left', marginRight: 'margin-right', marginTop: 'margin-top', marginBottom: 'margin-bottom' };
function marginPx(k, prop) {
  try {
    const v = k.computedStyleMap && k.computedStyleMap().get(CSS_NAME[prop]);
    if (v && v.unit === 'px') return v.value;
  } catch (e) { /* not this engine: read it the old way */ }
  return parseFloat(getComputedStyle(k)[prop]) || 0;
}

// First everything is read, then everything is written. The first version did both in
// turn for every child, which made the browser work out the whole page's styles again
// each time: on a real tablet that was 280 ms of every long recipe list.
function shimFlexGap(targets) {
  const selector = gapSelectors();
  const containers = new Set();
  for (const [el, deep] of targets) if (el.isConnected) gapCandidates(el, deep, selector, containers);

  const todo = [];
  for (const el of containers) {
    const cs = getComputedStyle(el);
    if (cs.display !== 'flex' && cs.display !== 'inline-flex') continue;
    const col = cs.flexDirection.startsWith('column');
    const gap = parseFloat(col ? cs.rowGap : cs.columnGap) || 0;
    // Wrapping rows: the cross-axis gap is approximated with a margin on every item.
    const wrapGap = cs.flexWrap !== 'nowrap' ? (parseFloat(col ? cs.columnGap : cs.rowGap) || 0) : 0;
    if (!gap && !wrapGap) continue;
    const rev = cs.flexDirection.endsWith('reverse');
    const main = col ? (rev ? 'marginBottom' : 'marginTop') : (rev ? 'marginRight' : 'marginLeft');
    const cross = col ? 'marginRight' : 'marginBottom';
    let i = 0;
    for (const k of el.children) {
      // Already given its gap (it was counted then): nothing to read again.
      if (k.dataset.gapShim) { i++; continue; }
      const ks = getComputedStyle(k);
      if (ks.position === 'absolute' || ks.position === 'fixed' || ks.display === 'none') continue;
      const m = i > 0 && gap && k.style[main] !== 'auto' ? main : null;
      todo.push([k, m, m ? marginPx(k, main) + gap : 0, wrapGap ? cross : null, wrapGap ? marginPx(k, cross) + wrapGap : 0]);
      i++;
    }
  }
  for (const [k, main, mainPx, cross, crossPx] of todo) {
    k.dataset.gapShim = '1';
    if (main) k.style[main] = `${mainPx}px`;
    if (cross) k.style[cross] = `${crossPx}px`;
  }
}

let observer = null;
let onChanges = null;
/**
 * Give what was just added its gaps NOW, instead of at the end of the current task. app.js
 * calls it right after a screen is built, before anything there measures the screen, so the
 * one layout that measuring causes already has the gaps (and isn't done again for them).
 */
export function flushCompat() {
  if (observer && onChanges) { const muts = observer.takeRecords(); if (muts.length) onChanges(muts); }
}

export function installCompat(screenEl) {
  // (window.__gapShim: a test switch, to measure on a newer browser what the tablets do)
  if (flexGapSupported() && !window.__gapShim) return;
  document.documentElement.classList.add('no-flex-gap');
  // Straight away, in the same breath as the change itself (not a frame later): the new
  // content is then laid out and drawn once, with its gaps, instead of twice.
  onChanges = (muts) => {
    const targets = [];
    for (const m of muts) {
      if (m.type === 'attributes') {
        // Something hidden when its screen was built is being shown now (the weather's
        // hour strip, once the forecast is in): it never got its gap. Look at its container.
        const t = m.target;
        if (t !== screenEl && !t.dataset.gapShim && t.parentElement) targets.push([t.parentElement, false]);
        continue;
      }
      for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        targets.push([n, true]);                               // whatever came in, all of it
        if (m.target.nodeType === 1) targets.push([m.target, false]); // and the container it joined
      }
    }
    if (targets.length) shimFlexGap(targets);
  };
  observer = new MutationObserver(onChanges);
  observer.observe(screenEl, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
  shimFlexGap([[screenEl, true]]);
}
