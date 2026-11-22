// Family · Kitchen timers: big presets, several at once, ring on any screen.
import { backHref, backLabel } from '../services/nav.js';
import { settings } from '../config.js';
import {
  timers, state, left, fmt, addTimer, pauseTimer, resumeTimer, addMinute, restartTimer, removeTimer, stopRinging,
  onTimersChanged, minutesText, missed, whenText, agoText, room, MAX, pauseAll, resumeAll, clearFinished, undoable, undoRemove,
} from '../services/timers.js';
import { spot } from '../art.js';

// Minutes. The everyday kitchen times, up to a long roast.
const PRESETS = [1, 2, 3, 5, 10, 15, 20, 30, 45, 60, 90, 120];
// Names a timer can be given with one tap (the owner's own typed names come first).
const NAMES = ['Pasta', 'Rice', 'Eggs', 'Oven', 'Potatoes', 'Tea'];
const MAX_CUSTOM = 12 * 60; // a slow cooker's day
let tickTimer, off, msgTimer, undoTimer;

// The owner's last "Other time", recent other times and typed names, kept on this screen only.
const PREFS = 'kitchen.timers.prefs.v1';
const loadPrefs = () => { try { return JSON.parse(localStorage.getItem(PREFS) || '{}') || {}; } catch (e) { return {}; } };
const savePrefs = (p) => { try { localStorage.setItem(PREFS, JSON.stringify(p)); } catch (e) { /* storage off */ } };

// Nothing running: the kitchen timer picture on a soft halo instead of the tile's square background.
const idleArt = () => spot.timer().replace(/<rect width="285" height="170"[^>]*\/>/, '<circle cx="143" cy="92" r="78" fill="#FBF3EE"/>');

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// "1 hr 30 min" is too long for a preset button: "1½ hr".
const presetLabel = (m) => (m === 90 ? '1½ hr' : minutesText(m));
const setText = (secs) => (secs < 60 ? `${secs} sec` : minutesText(Math.round(secs / 60)));
// "Rings at 6:40 PM", "Rings tomorrow at 7:05 AM" (the owner's 12/24-hour clock)
const ringsText = (end) => { const w = whenText(end); return /^\d/.test(w) ? `Rings at ${w}` : `Rings ${w.replace(/ (?=\d)/, ' at ')}`; };
// Ringing first, then the one finishing soonest, then paused, then finished.
const ORDER = { done: 0, running: 1, paused: 2, stopped: 3 };
const rank = (t) => (missed(t) ? 2.5 : ORDER[state(t)]);
const sorted = (list) => list.slice().sort((a, b) => (rank(a) - rank(b)) || (left(a) - left(b)));

export function mount(el) {
  const a = settings.accent;
  const prefs = loadPrefs();
  let custom = Math.min(MAX_CUSTOM, Math.max(1, +prefs.custom || 25));
  let name = ''; // the name the next timer gets ('' = just "10 min timer")
  let lastStart = { key: '', at: 0 };
  el.innerHTML = `
  <style>
    .tm-wrap{height:100%;padding:28px 40px 32px;display:grid;grid-template-columns:minmax(0,1fr) 520px;gap:24px}
    .tm-left{display:flex;flex-direction:column;gap:16px;min-width:0}
    .tm-presets{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px}
    .tm-presets.full .tm-p{opacity:.45}
    .tm-p{min-height:88px;border-radius:22px;border:none;background:#FFFFFF;color:#1D2430;font-family:Outfit,sans-serif;font-size:30px;font-weight:500;cursor:pointer;transition:transform .1s ease;padding:0 4px}
    .tm-p:active,.tm-b:active,.tm-n:active{transform:scale(.96)}
    .tm-b{min-height:56px;padding:0 20px;border-radius:999px;border:none;font:600 18px Inter,sans-serif;cursor:pointer;background:#F1F2F4;color:#1D2430;transition:transform .1s ease;white-space:nowrap}
    .tm-b.dark{background:#1D2430;color:#FFFFFF}
    .tm-b.solid{background:${a};color:#FFFFFF}
    .tm-names{display:flex;gap:10px;align-items:center}
    .tm-n{min-height:52px;padding:0 18px;border-radius:999px;border:2px solid transparent;background:#FFFFFF;color:#1D2430;font:600 18px Inter,sans-serif;cursor:pointer;white-space:nowrap;transition:transform .1s ease}
    .tm-n.on{background:${a};color:#FFFFFF}
    .tm-type{min-height:52px;width:150px;min-width:0;flex:1;padding:0 18px;border-radius:999px;border:2px dashed #C9CED6;background:#FFFFFF;color:#1D2430;font:600 18px Inter,sans-serif}
    .tm-type.on{border:2px solid ${a}}
    .tm-card{background:#FFFFFF;border-radius:22px;padding:18px 22px;display:flex;flex-direction:column;gap:10px;flex-shrink:0}
    .tm-card.ring{background:${a};color:#FFFFFF;animation:tm-pulse 1s steps(1,end) infinite alternate}
    .tm-card.ring .tm-b{background:#FFFFFF;color:${a}}
    .tm-card.ring .tm-b.solid{background:#1D2430;color:#FFFFFF}
    .tm-card.missed{border:3px solid ${a}}
    @keyframes tm-pulse{from{opacity:1}to{opacity:.85}}
    .tm-clock{font-family:Outfit,sans-serif;font-size:64px;font-weight:500;line-height:1;font-variant-numeric:tabular-nums}
    .tm-many .tm-clock{font-size:48px}
    .tm-many .tm-card{padding:14px 20px;gap:8px}
    .tm-card.stopped .tm-clock,.tm-card.missed .tm-clock{opacity:.5}
    .tm-bar{height:8px;border-radius:999px;background:#EEF0F2;overflow:hidden;margin-top:-2px}
    .tm-bar i{display:block;height:100%;border-radius:999px;background:${a};transition:width .25s linear}
    .tm-card.paused .tm-bar i{background:#8A93A3}
    .tm-card.done .tm-bar,.tm-card.stopped .tm-bar{display:none}
    .tm-msg{font-size:19px;font-weight:600;color:#1D2430;min-height:26px;line-height:1.35}
    .tm-msg.warn{color:#FFFFFF;background:${a};border-radius:16px;padding:12px 18px}
    .tm-undo{display:flex;align-items:center;gap:16px;background:#1D2430;color:#FFFFFF;border-radius:20px;padding:10px 12px 10px 22px;font-size:19px;font-weight:600}
    .tm-undo .tm-b{background:#FFFFFF;color:#1D2430;margin-left:auto}
  </style>
  <div class="tm-wrap">
    <div class="tm-left">
      <div style="display:flex;align-items:center;gap:16px">
        <a href="${backHref()}" class="pill" style="background:#FFFFFF">${backLabel()}</a>
        <div class="display" style="font-size:34px;font-weight:500">Timers</div>
      </div>
      <div class="eyebrow muted">Give it a name, if you like</div>
      <div class="tm-names" data-names></div>
      <div class="eyebrow muted">Tap a time to start</div>
      <div class="tm-presets" data-presets>${PRESETS.map((m) => `<button class="tm-p" data-start="${m}">${presetLabel(m)}</button>`).join('')}</div>
      <div class="card" style="padding:16px 20px;display:flex;flex-direction:column;gap:12px">
        <div style="display:flex;align-items:center;gap:14px">
          <div style="font-size:19px;font-weight:600">Other time</div>
          <div data-custom-val class="display" style="font-size:34px;font-weight:500;flex:1;text-align:center;line-height:1.05"></div>
          <button class="tm-b solid" data-start-custom style="min-width:120px">Start</button>
        </div>
        <div style="display:flex;gap:8px;justify-content:space-between">
          <button class="tm-b" data-custom="-60">−1 hr</button>
          <button class="tm-b" data-custom="-5">−5</button>
          <button class="tm-b" data-custom="-1">−1</button>
          <button class="tm-b" data-custom="1">+1</button>
          <button class="tm-b" data-custom="5">+5</button>
          <button class="tm-b" data-custom="60">+1 hr</button>
        </div>
        <div data-recent style="display:flex;gap:8px;align-items:center"></div>
      </div>
      <div data-msg class="tm-msg"></div>
      <div class="muted" style="font-size:17px;margin-top:auto">Timers keep running on every screen. When one finishes it rings until you tap it.</div>
    </div>
    <div style="display:flex;flex-direction:column;gap:12px;min-height:0">
      <div data-tools style="display:flex;align-items:center;gap:10px"></div>
      <div data-list style="display:flex;flex-direction:column;gap:12px;overflow-y:auto;min-height:0;flex:1"></div>
      <div data-undo></div>
    </div>
  </div>`;

  const $ = (s) => el.querySelector(s);
  const showCustom = () => {
    $('[data-custom-val]').textContent = minutesText(custom);
  };
  showCustom();

  // ---- Names ----
  const typedNames = () => (Array.isArray(prefs.names) ? prefs.names : []);
  function showNames() {
    const typed = typedNames();
    const list = typed.concat(NAMES.filter((n) => typed.indexOf(n) < 0)).slice(0, 5);
    const input = $('[data-type-name]');
    const typing = input && document.activeElement === input;
    const html = list.map((n) => `<button class="tm-n${n === name ? ' on' : ''}" data-name="${esc(n)}">${esc(n)}</button>`).join('');
    // Keep the text box (and the keyboard) when only the chips change.
    if (!input) $('[data-names]').innerHTML = `${html}<input class="tm-type" data-type-name maxlength="20" placeholder="✎ Type…" enterkeyhint="done" autocomplete="off">`;
    else {
      Array.prototype.slice.call($('[data-names]').querySelectorAll('.tm-n')).forEach((b) => b.remove());
      input.insertAdjacentHTML('beforebegin', html);
      if (typing) input.focus();
    }
    const inp = $('[data-type-name]');
    inp.classList.toggle('on', !!name && list.indexOf(name) < 0);
  }
  showNames();
  const nameInput = $('[data-type-name]');
  nameInput.addEventListener('input', () => {
    name = nameInput.value.trim().slice(0, 20);
    showNames();
  });
  nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') nameInput.blur(); });

  // ---- Recent other times ----
  function showRecent() {
    const recent = (Array.isArray(prefs.recent) ? prefs.recent : []).filter((m) => m !== custom).slice(0, 4);
    $('[data-recent]').innerHTML = recent.length
      ? `<span class="muted" style="font-size:17px;font-weight:600;margin-right:4px">Recent</span>${recent.map((m) => `<button class="tm-b" data-recent-start="${m}">${minutesText(m)}</button>`).join('')}`
      : '';
    $('[data-recent]').style.display = recent.length ? 'flex' : 'none';
  }
  showRecent();

  // ---- Messages: "Pasta started", "all 8 are in use" ----
  function say(text, warn) {
    const m = $('[data-msg]');
    m.textContent = text;
    m.className = `tm-msg${warn ? ' warn' : ''}`;
    clearTimeout(msgTimer);
    msgTimer = setTimeout(() => { if (el.isConnected) showFull(); }, warn ? 6000 : 4000);
  }
  function fullText() {
    return `All ${MAX} timers are in use, so a new one can’t start. Cancel one, or clear a finished one, to make room.`;
  }
  // While all 8 are counting, the presets look switched off and the reason stays on screen.
  function showFull() {
    const full = room() <= 0;
    $('[data-presets]').classList.toggle('full', full);
    $('[data-start-custom]').style.opacity = full ? '.45' : '';
    const m = $('[data-msg]');
    if (full) { m.textContent = fullText(); m.className = 'tm-msg warn'; }
    else if (m.classList.contains('warn')) { m.textContent = ''; m.className = 'tm-msg'; }
  }

  function start(mins, fromCustom) {
    const secs = mins * 60;
    // Wet fingers often tap twice: the same time twice within a second is one tap.
    const key = String(secs);
    if (lastStart.key === key && Date.now() - lastStart.at < 1000) return;
    lastStart = { key, at: Date.now() };
    if (!addTimer(secs, name || undefined)) { say(fullText(), true); return; }
    const what = name || `${minutesText(mins)} timer`;
    say(`${what} started. ${ringsText(Date.now() + secs * 1000)}.`);
    // Remember a typed name and an "Other time" for next time.
    if (name && NAMES.indexOf(name) < 0) prefs.names = [name].concat(typedNames().filter((n) => n !== name)).slice(0, 3);
    if (fromCustom && PRESETS.indexOf(mins) < 0) prefs.recent = [mins].concat((prefs.recent || []).filter((m) => m !== mins)).slice(0, 5);
    if (fromCustom) prefs.custom = mins;
    savePrefs(prefs);
    name = '';
    nameInput.value = '';
    if (document.activeElement === nameInput) nameInput.blur();
    showNames();
    showRecent();
  }

  // ---- Undo ----
  function showUndo(text) {
    const box = $('[data-undo]');
    box.innerHTML = `<div class="tm-undo"><span>${esc(text)}</span><button class="tm-b" data-undo-btn>Undo</button></div>`;
    clearTimeout(undoTimer);
    undoTimer = setTimeout(() => { if (el.isConnected) box.innerHTML = ''; }, 10000);
  }

  let lastHtml = '';
  function render() {
    const list = sorted(timers());
    const pct = (t) => `${Math.max(0, Math.min(100, (left(t) / Math.max(1000, t.secs * 1000)) * 100)).toFixed(1)}%`;
    const html = list.length ? list.map((t) => {
      const st = state(t);
      const gone = missed(t);
      const ring = st === 'done' && !gone;
      // Running timers say when they'll ring, so you know without doing sums.
      const note = st === 'paused' ? 'Paused'
        : ring ? 'Time’s up!'
          : gone ? `Rang at ${whenText(t.end)} · ${agoText(t.end)}`
            : st === 'stopped' ? `Rang ${agoText(t.end)}` : ringsText(t.end);
      const finished = st === 'done' || st === 'stopped';
      return `
      <div class="tm-card ${st}${ring ? ' ring' : ''}${gone ? ' missed' : ''}">
        <div style="display:flex;justify-content:space-between;align-items:baseline;font-size:20px;font-weight:600;gap:12px">
          <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.label)}${t.named ? `<span style="font-size:16px;opacity:.7;font-weight:500"> · ${setText(t.secs)}</span>` : ''}</span>
          <span style="opacity:.8;white-space:nowrap;font-size:18px">${note}</span>
        </div>
        <div class="tm-clock" data-clock="${t.id}">${fmt(left(t))}</div>
        <div class="tm-bar"><i data-bar="${t.id}" style="width:${pct(t)}"></i></div>
        <div style="display:flex;gap:10px">
          ${finished ? `${ring ? `<button class="tm-b solid" data-stop="${t.id}">Stop</button>` : ''}
            <button class="tm-b" data-plus="${t.id}">+1 min</button>
            <button class="tm-b" data-again="${t.id}">Again</button>
            <button class="tm-b dark" data-remove="${t.id}" style="margin-left:auto">Done</button>` : `
            <button class="tm-b dark" data-${st === 'paused' ? 'resume' : 'pause'}="${t.id}">${st === 'paused' ? 'Resume' : 'Pause'}</button>
            <button class="tm-b" data-plus="${t.id}">+1 min</button>
            <button class="tm-b" data-remove="${t.id}" style="margin-left:auto">Cancel</button>`}
        </div>
      </div>`;
    }).join('') : `<div class="card" style="flex-grow:1;padding:28px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;text-align:center">
        ${idleArt()}
        <div class="display" style="font-size:28px;font-weight:500">No timers running</div>
        <div class="muted" style="font-size:18px;line-height:1.4;max-width:340px">Tap a time on the left to start one. You can run up to ${MAX} at once.</div>
      </div>`;
    // Above the list: how many, and the buttons for all of them at once.
    const counting = list.filter((t) => state(t) === 'running').length;
    const paused = list.filter((t) => state(t) === 'paused').length;
    const finished = list.filter((t) => state(t) === 'done' || state(t) === 'stopped').length;
    const busy = MAX - room(); // counting, paused or ringing
    const tools = list.length ? `
      <div style="font-size:19px;font-weight:600;flex:1">${busy ? `${busy} of ${MAX} in use` : 'All finished'}</div>
      ${counting && list.length > 1 ? '<button class="tm-b" data-pause-all>Pause all</button>' : paused > 1 ? '<button class="tm-b" data-resume-all>Resume all</button>' : ''}
      ${finished > (list.length > 1 ? 0 : 1) ? '<button class="tm-b" data-clear-done>Clear finished</button>' : ''}` : '';
    // Rebuild only when the set of buttons changes; otherwise just update the clocks and bars.
    const shape = tools + html.replace(/data-clock="([^"]+)">[^<]*</g, 'data-clock="$1"><').replace(/width:[\d.]+%/g, '');
    if (shape !== lastHtml) {
      lastHtml = shape;
      $('[data-tools]').innerHTML = tools;
      $('[data-tools]').style.display = tools ? 'flex' : 'none';
      const box = $('[data-list]');
      box.classList.toggle('tm-many', list.length > 3); // smaller cards, so more fit without scrolling
      box.innerHTML = html;
      showFull();
    } else {
      list.forEach((t) => {
        const c = el.querySelector(`[data-clock="${t.id}"]`);
        if (c) c.textContent = fmt(left(t));
        const b = el.querySelector(`[data-bar="${t.id}"]`);
        if (b) b.style.width = pct(t);
      });
    }
  }

  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const d = b.dataset;
    if (d.start) start(+d.start, false);
    else if (d.recentStart) start(+d.recentStart, true);
    else if (d.name != null && b.classList.contains('tm-n')) {
      name = name === d.name ? '' : d.name; // tap again to take the name off
      nameInput.value = '';
      showNames();
    } else if (d.custom) { custom = Math.min(MAX_CUSTOM, Math.max(1, custom + +d.custom)); showCustom(); showRecent(); }
    else if (b.matches('[data-start-custom]')) start(custom, true);
    else if (d.again) restartTimer(d.again);
    else if (d.pause) pauseTimer(d.pause);
    else if (d.resume) resumeTimer(d.resume);
    else if (d.plus) addMinute(d.plus);
    else if (d.remove) {
      const t = timers().filter((x) => x.id === d.remove)[0];
      const st = t && state(t);
      removeTimer(d.remove);
      if (t) showUndo(`${t.label} ${st === 'done' || st === 'stopped' ? 'cleared' : 'cancelled'}.`);
    } else if (d.stop) stopRinging(d.stop);
    else if (b.matches('[data-pause-all]')) pauseAll();
    else if (b.matches('[data-resume-all]')) resumeAll();
    else if (b.matches('[data-clear-done]')) {
      const n = clearFinished();
      if (n) showUndo(n === 1 ? 'Finished timer cleared.' : `${n} finished timers cleared.`);
    } else if (b.matches('[data-undo-btn]')) {
      if (undoable().length) undoRemove();
      $('[data-undo]').innerHTML = '';
    }
  });

  render();
  off = onTimersChanged(render);
  tickTimer = setInterval(() => { if (el.isConnected) render(); }, 250);
}

export function unmount() {
  clearInterval(tickTimer); clearTimeout(msgTimer); clearTimeout(undoTimer);
  if (off) off(); off = null;
}
