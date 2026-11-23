// Kitchen timers as glass pots on a hob: each timer is a pot that fills up as its time
// passes (a full pot is ready), with digits big enough to read from across the room.
// Several at once, and they ring on any screen (services/timers.js does the counting).
//
// Cheap to draw: the liquid is one block per pot moved by a transform, its level stepping
// a whole percent at a time. The surface wave stands still, except on a lone pot, where it
// slides slowly; steam and bubbles only on that lone pot too. Burners glow without pulsing
// (only a ringing pot boils and flickers). Nothing changes size, and nothing is blurred.
import {
  timers, state, left, fmt, addTimer, pauseTimer, resumeTimer, addMinute, restartTimer, removeTimer, stopRinging,
  onTimersChanged, minutesText, missed, whenText, agoText, room, MAX, pauseAll, resumeAll, clearFinished, undoable, undoRemove,
} from '../services/timers.js';
import { topBar, esc } from './ui.js';

// Minutes. The everyday kitchen times, up to a long roast.
const PRESETS = [1, 2, 3, 5, 10, 15, 20, 30, 45, 60, 90, 120];
// The big buttons when nothing is on the hob yet.
const FIRST = [1, 3, 5, 10, 15, 30];
// Names a timer can be given with one tap (the owner's own typed names come first).
const NAMES = ['Pasta', 'Rice', 'Eggs', 'Oven', 'Potatoes', 'Tea'];
const MAX_CUSTOM = 12 * 60; // a slow cooker's day
let tickTimer, off, msgTimer, undoTimer;

// The owner's last "Other time", recent other times and typed names, kept on this screen only.
const PREFS = 'kitchen.timers.prefs.v1';
const loadPrefs = () => { try { return JSON.parse(localStorage.getItem(PREFS) || '{}') || {}; } catch (e) { return {}; } };
const savePrefs = (p) => { try { localStorage.setItem(PREFS, JSON.stringify(p)); } catch (e) { /* storage off */ } };

// "1 hr 30 min" is too long for a preset button: "1½ hr".
const presetLabel = (m) => (m === 90 ? '1½ hr' : minutesText(m));
const setText = (secs) => (secs < 60 ? `${secs} sec` : minutesText(Math.round(secs / 60)));
// "Rings at 6:40 PM", "Rings tomorrow at 7:05 AM" (the owner's 12/24-hour clock)
const ringsText = (end) => { const w = whenText(end); return /^\d/.test(w) ? `Rings at ${w}` : `Rings ${w.replace(/ (?=\d)/, ' at ')}`; };
// Ringing first, then the one finishing soonest, then paused, then finished.
const ORDER = { done: 0, running: 1, paused: 2, stopped: 3 };
const rank = (t) => (missed(t) ? 2.5 : ORDER[state(t)]);
const sorted = (list) => list.slice().sort((a, b) => (rank(a) - rank(b)) || (left(a) - left(b)));

// What is in each pot: [surface, depths]. Deep colours, so white digits read on all of them.
const LIQUIDS = [
  ['#F0934A', '#C2551F'], ['#D9A02E', '#A26A10'], ['#E0624F', '#A8321F'], ['#6DB36A', '#3C7F3F'],
  ['#45AFA7', '#1F7A75'], ['#6394E0', '#345FAE'], ['#A47BD6', '#6C45A6'], ['#DE74A2', '#A83F70'],
];
const liquidOf = (t) => LIQUIDS[(parseInt(String(t.id).replace(/\D/g, '').slice(-6), 10) || 0) % LIQUIDS.length];
// One wave, 200 px from crest to crest, long enough for the widest pot plus one slide.
const WAVE = `M0 14 V7 q50 -12 100 0 ${new Array(12).join('t100 0 ')}V14 Z`;
// How far down the liquid's surface sits (% of the pot): a sliver at the start, the "ready" mark when done.
const EMPTY_AT = 95, READY_AT = 17;
const progress = (t) => (state(t) === 'running' || state(t) === 'paused' ? Math.max(0, Math.min(1, 1 - left(t) / Math.max(1000, t.secs * 1000))) : 1);
// Whole percents: the level moves now and then (a short ease), not on every tick.
const levelOf = (t) => `translate3d(0,${Math.round(EMPTY_AT - progress(t) * (EMPTY_AT - READY_AT))}%,0)`;

export function mount(el) {
  const prefs = loadPrefs();
  let custom = Math.min(MAX_CUSTOM, Math.max(1, +prefs.custom || 25));
  let name = ''; // the name the next timer gets ('' = just "10 min timer")
  let lastStart = { key: '', at: 0 };
  el.innerHTML = `
  <style>
    .tm{height:100%;box-sizing:border-box;position:relative;overflow:hidden;color:#FFFFFF;padding:24px 36px 20px;display:flex;flex-direction:column;
      background:linear-gradient(180deg,#2B2F36 0%,#1C1F24 60%,#121417 100%);font-family:Inter,system-ui,sans-serif}
    .tm-tiles{position:absolute;left:0;right:0;top:0;height:200px;opacity:.7;border-bottom:4px solid #474D57;
      background:repeating-linear-gradient(90deg,#343941 0,#343941 118px,#2A2E35 118px,#2A2E35 120px)}
    .tm .x-top,.tm-status,.tm-stage{position:relative}
    .tm-amber{background:#FFC36B;color:#1C1F24}
    .tm-status{display:flex;align-items:center;gap:18px;min-height:34px;margin-top:10px;flex:none}
    .tm-msg{flex:1;min-width:0;font-size:18px;font-weight:600;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .tm-msg.warn{color:#FFC36B}
    .tm-more{position:absolute;right:36px;top:92px;z-index:16;display:none;flex-direction:column;gap:8px;padding:10px;border-radius:24px;background:#262A31;box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.2)}
    .tm-more.open{display:flex}
    .tm-more .x-btn{background:rgba(255,255,255,.12);color:#FFFFFF;min-width:210px}
    .tm-stage{flex:1;min-height:0;display:grid;gap:14px 20px;align-items:center;justify-items:center;margin-top:6px}
    /* (many pots pack to the top: the strip along the bottom stays free for the ringing chip and Undo) */
    .tm-stage.n6,.tm-stage.n8{align-content:start}
    .tm-stage.n1,.tm-stage.n2,.tm-stage.n3,.tm-stage.n4{padding-bottom:62px}
    .tm-stage.n1{grid-template-columns:1fr}
    .tm-stage.n2{grid-template-columns:1fr 1fr}
    .tm-stage.n3,.tm-stage.n6{grid-template-columns:repeat(3,minmax(0,1fr))}
    .tm-stage.n4,.tm-stage.n8{grid-template-columns:repeat(4,minmax(0,1fr))}

    .tm-cell{display:flex;flex-direction:column;align-items:center;min-width:0;max-width:100%}
    .tm-name{font:500 34px Outfit,sans-serif;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:10px;position:relative;z-index:1}
    .tm-name small{font:500 .6em Inter,sans-serif;opacity:.7}
    .tm-potwrap{position:relative;flex:none}
    .tm-ear{position:absolute;top:30px;width:38px;height:20px;border-radius:10px;background:#5A606B}
    .tm-ear.l{left:-34px}.tm-ear.r{right:-34px}
    .tm-pot{position:relative;overflow:hidden;box-sizing:border-box;width:470px;height:350px;border-radius:40px;border:4px solid rgba(255,255,255,.45);background:rgba(255,255,255,.05)}
    .tm-liq{position:absolute;left:0;top:0;width:100%;height:100%;will-change:transform;transition:transform 1s linear}
    .tm-wave{position:absolute;left:0;top:-13px;display:block}
    .n1 .tm-cell.running .tm-wave{animation:tm-wave 9s linear infinite}
    .tm-bub{position:absolute;top:120px;width:10px;height:10px;border-radius:50%;background:rgba(255,255,255,.75);opacity:0;animation:tm-bub 3s ease-out infinite}
    .tm-glass{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;
      background:linear-gradient(90deg,rgba(255,255,255,.16) 0,rgba(255,255,255,.04) 15%,rgba(255,255,255,.03) 85%,rgba(255,255,255,.14) 100%)}
    .tm-mark{position:absolute;left:0;top:${READY_AT}%;line-height:1;margin-top:-2px}
    .tm-mark i{display:block;width:26px;height:3px;background:rgba(255,255,255,.55)}
    .tm-face{position:absolute;left:0;top:0;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
    .tm-clock{font:700 150px/1 Outfit,sans-serif;letter-spacing:-.02em;font-variant-numeric:tabular-nums;text-shadow:0 2px 0 rgba(0,0,0,.28)}
    .tm-clock.long{font-size:100px}
    .tm-note{font-size:22px;color:#F1F3F6;margin-top:6px;font-weight:500;text-shadow:0 1px 0 rgba(0,0,0,.5)}
    .tm-up{font:500 30px Outfit,sans-serif;margin-bottom:12px;text-shadow:0 1px 0 rgba(0,0,0,.35)}
    .tm-stop{min-height:110px;width:74%;border:0;border-radius:28px;background:#FFFFFF;color:#1C1F24;font:700 44px Outfit,sans-serif;cursor:pointer}
    .tm-hob{position:relative;width:118%;height:34px;flex:none}
    .tm-glow{position:absolute;left:0;top:-14px;width:100%;height:70px;opacity:.85;
      background:radial-gradient(ellipse at 50% 50%,rgba(255,106,43,.9) 0,rgba(224,64,26,.35) 42%,rgba(224,64,26,0) 70%)}
    .tm-grate{position:absolute;left:0;top:10px;width:100%;height:12px;border-radius:6px;background:#0B0C0E}
    .tm-steam{position:absolute;top:-70px;width:70px;height:100px;border-radius:50%;opacity:0;pointer-events:none;
      background:radial-gradient(ellipse at 50% 50%,rgba(255,255,255,.34) 0,rgba(255,255,255,.12) 45%,rgba(255,255,255,0) 70%);animation:tm-steam 5s ease-out infinite}
    .tm-foam{position:absolute;left:8%;top:-13px;width:84%;height:26px;display:none;pointer-events:none}
    .tm-foam i{position:absolute;top:0;width:26px;height:26px;border-radius:50%;background:#FFF6E6;animation:tm-foam .7s ease-in-out infinite alternate}
    .tm-btns{display:flex;gap:10px;justify-content:center;margin-top:8px;max-width:100%}
    .tm-btns .x-btn{background:rgba(255,255,255,.12);color:#FFFFFF}
    .tm-btns .x-btn.main{background:#FFFFFF;color:#1C1F24}

    /* how big, by how many pots there are */
    .n1 .tm-pot{width:620px;height:380px}
    .n1 .tm-clock{font-size:190px}.n1 .tm-clock.long{font-size:130px}
    .n1 .tm-name{font-size:38px}.n1 .tm-note{font-size:24px}
    .n3 .tm-pot{width:320px;height:330px}
    .n3 .tm-clock{font-size:104px}.n3 .tm-clock.long{font-size:68px}
    .n3 .tm-name{font-size:30px}.n3 .tm-note{font-size:20px}
    .n3 .tm-ear,.n6 .tm-ear{width:30px}.n3 .tm-ear.l,.n6 .tm-ear.l{left:-26px}.n3 .tm-ear.r,.n6 .tm-ear.r{right:-26px}
    .n3 .tm-stop,.n4 .tm-stop{min-height:92px;font-size:36px;width:80%}
    .n4 .tm-pot{width:236px;height:300px;border-radius:32px}
    .n4 .tm-clock{font-size:76px}.n4 .tm-clock.long{font-size:50px}
    .n6 .tm-pot{width:320px;height:158px;border-radius:30px}
    .n6 .tm-clock{font-size:84px}.n6 .tm-clock.long{font-size:64px}
    .n8 .tm-pot{width:236px;height:158px;border-radius:30px}
    .n8 .tm-clock{font-size:72px}.n8 .tm-clock.long{font-size:50px}
    .n4 .tm-ear,.n8 .tm-ear{width:24px;top:24px}.n4 .tm-ear.l,.n8 .tm-ear.l{left:-20px}.n4 .tm-ear.r,.n8 .tm-ear.r{right:-20px}
    .n4 .tm-name,.n6 .tm-name,.n8 .tm-name{font-size:24px;margin-bottom:6px}
    .n4 .tm-note,.n6 .tm-note,.n8 .tm-note{font-size:17px;margin-top:2px}
    .n6 .tm-hob,.n8 .tm-hob,.n4 .tm-hob{height:24px;width:112%}
    .n6 .tm-glow,.n8 .tm-glow,.n4 .tm-glow{height:50px;top:-8px}
    .n6 .tm-grate,.n8 .tm-grate,.n4 .tm-grate{top:6px;height:10px}
    .n6 .tm-up,.n8 .tm-up{font-size:20px;margin-bottom:6px}
    .n6 .tm-stop,.n8 .tm-stop{min-height:76px;font-size:30px;width:82%;border-radius:22px}
    .n6 .tm-mark,.n8 .tm-mark{display:none}
    .n4 .tm-btns,.n8 .tm-btns{gap:6px}
    .n4 .tm-btns .x-btn,.n8 .tm-btns .x-btn{padding:0 13px;font-size:17px}
    .n6 .tm-btns,.n8 .tm-btns,.n4 .tm-btns{margin-top:4px}

    /* what the pot is doing */
    .tm-cell.paused .tm-glow,.tm-cell.over .tm-glow{opacity:.12}
    .tm-cell.over .tm-liq{opacity:.5}
    .tm-cell.over .tm-clock{opacity:.6}
    .tm-cell.ring .tm-pot{border-color:#FFFFFF;animation:tm-boil .5s ease-in-out infinite}
    .tm-cell.ring .tm-glow{animation:tm-burn .7s ease-in-out infinite}
    .tm-cell.ring .tm-foam{display:block}
    @keyframes tm-wave{from{transform:translate3d(0,0,0)}to{transform:translate3d(-200px,0,0)}}
    @keyframes tm-burn{0%,100%{opacity:.7}50%{opacity:1}}
    @keyframes tm-bub{0%{transform:translate3d(0,0,0);opacity:0}20%{opacity:.8}100%{transform:translate3d(0,-90px,0);opacity:0}}
    @keyframes tm-steam{0%{transform:translate3d(0,0,0) scale(1);opacity:0}30%{opacity:.9}100%{transform:translate3d(0,-110px,0) scale(1.7);opacity:0}}
    @keyframes tm-boil{0%,100%{transform:translate3d(0,0,0) rotate(0deg)}25%{transform:translate3d(-3px,0,0) rotate(-.6deg)}75%{transform:translate3d(3px,0,0) rotate(.6deg)}}
    @keyframes tm-foam{from{transform:translate3d(0,6px,0) scale(.8)}to{transform:translate3d(0,-6px,0) scale(1.15)}}

    /* nothing on the hob yet */
    .tm-empty{width:100%;display:flex;align-items:center;justify-content:center;gap:70px}
    .tm-empty .tm-pot{width:400px;height:320px}
    .tm-firsts{display:grid;grid-template-columns:repeat(3,170px);gap:14px}
    .tm-first{min-height:124px;border:0;border-radius:28px;background:rgba(255,255,255,.12);color:#FFFFFF;cursor:pointer;font:700 60px/1 Outfit,sans-serif;
      display:flex;flex-direction:column;align-items:center;justify-content:center;box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.3)}
    .tm-first small{font:500 19px Inter,sans-serif;opacity:.8;margin-top:4px}

    /* starting a new one */
    .tm-sheet{position:absolute;left:0;top:0;width:100%;height:100%;z-index:20;background:rgba(8,9,11,.84);display:none;align-items:center;justify-content:center}
    .tm-sheet.open{display:flex}
    .tm-card{width:1060px;box-sizing:border-box;border-radius:32px;background:#262A31;box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.2);padding:26px 30px 28px;display:flex;flex-direction:column;gap:14px}
    .tm-card .x-eyebrow{color:#FFC36B}
    .tm-names{display:flex;gap:10px;align-items:center}
    .tm-n{min-height:60px;padding:0 20px;border-radius:999px;border:0;background:rgba(255,255,255,.12);color:#FFFFFF;font:600 19px Inter,sans-serif;cursor:pointer;white-space:nowrap}
    .tm-n.on{background:#FFC36B;color:#1C1F24}
    .tm-type{min-height:60px;width:150px;min-width:0;flex:1;box-sizing:border-box;padding:0 20px;border-radius:999px;border:2px dashed rgba(255,255,255,.4);background:rgba(0,0,0,.25);color:#FFFFFF;font:600 19px Inter,sans-serif}
    .tm-type::placeholder{color:rgba(255,255,255,.6)}
    .tm-type.on{border:2px solid #FFC36B}
    .tm-presets{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px}
    .tm-p{min-height:84px;border-radius:22px;border:0;background:rgba(255,255,255,.12);color:#FFFFFF;font:500 30px Outfit,sans-serif;cursor:pointer;padding:0 4px}
    .tm-full .tm-p,.tm-full .tm-first,.tm-full [data-start-custom],.tm-full [data-recent-start]{opacity:.45}
    .tm-other{display:flex;align-items:center;gap:10px}
    .tm-other .x-btn{background:rgba(255,255,255,.12);color:#FFFFFF;padding:0 18px}
    .tm-other .x-btn.tm-amber{background:#FFC36B;color:#1C1F24;padding:0 34px}
    .tm-val{font:500 38px Outfit,sans-serif;flex:1;text-align:center;white-space:nowrap}
    .tm-recent{display:flex;gap:10px;align-items:center;font-size:18px;font-weight:600;color:#AEB6C2}
    .tm-recent .x-btn{background:rgba(255,255,255,.12);color:#FFFFFF}
    .tm-undo{position:absolute;left:50%;bottom:18px;z-index:15;transform:translateX(-50%);display:flex;align-items:center;gap:18px;background:#FFFFFF;color:#1C1F24;border-radius:999px;padding:8px 8px 8px 28px;font-size:20px;font-weight:600;white-space:nowrap;box-shadow:0 6px 20px rgba(0,0,0,.4)}
    @media (prefers-reduced-motion: reduce){
      .tm-stage .tm-cell .tm-wave,.tm-glow,.tm-bub,.tm-steam,.tm-foam i,.tm-cell.ring .tm-pot,.tm-cell.ring .tm-glow{animation:none}
      .tm-liq{transition:none}
    }
  </style>
  <div class="tm" data-root>
    <div class="tm-tiles" aria-hidden="true"></div>
    ${topBar({ title: 'Timers', tone: 'dark', right: '<div data-tools style="display:flex;align-items:center;gap:12px"></div>' })}
    <div class="tm-status"><span class="tm-msg" data-msg></span></div>
    <div class="tm-more" data-more></div>
    <div class="tm-stage" data-list></div>
    <div data-undo></div>
    <div class="tm-sheet" data-sheet>
      <div class="tm-card">
        <div style="display:flex;align-items:center;gap:16px">
          <div class="x-title">New timer</div>
          <button class="x-btn glass" data-close>Close</button>
        </div>
        <div class="x-eyebrow">Name</div>
        <div class="tm-names" data-names></div>
        <div class="x-eyebrow">Time</div>
        <div class="tm-presets">${PRESETS.map((m) => `<button class="tm-p" data-start="${m}">${presetLabel(m)}</button>`).join('')}</div>
        <div class="x-eyebrow">Other time</div>
        <div class="tm-other">
          <button class="x-btn" data-custom="-60">−1 hr</button>
          <button class="x-btn" data-custom="-5">−5</button>
          <button class="x-btn" data-custom="-1">−1</button>
          <div data-custom-val class="tm-val"></div>
          <button class="x-btn" data-custom="1">+1</button>
          <button class="x-btn" data-custom="5">+5</button>
          <button class="x-btn" data-custom="60">+1 hr</button>
          <button class="x-btn tm-amber" data-start-custom>Start</button>
        </div>
        <div class="tm-recent" data-recent></div>
      </div>
    </div>
  </div>`;

  const $ = (s) => el.querySelector(s);
  const root = $('[data-root]');
  const sheet = $('[data-sheet]');
  const showCustom = () => { $('[data-custom-val]').textContent = minutesText(custom); };
  showCustom();
  const openSheet = () => { sheet.classList.add('open'); };
  const closeSheet = () => {
    sheet.classList.remove('open');
    const inp = $('[data-type-name]');
    if (inp && document.activeElement === inp) inp.blur();
  };

  // ---- Names ----
  const typedNames = () => (Array.isArray(prefs.names) ? prefs.names : []);
  function showNames() {
    const typed = typedNames();
    const list = typed.concat(NAMES.filter((n) => typed.indexOf(n) < 0)).slice(0, 6);
    const input = $('[data-type-name]');
    const typing = input && document.activeElement === input;
    const html = list.map((n) => `<button class="tm-n${n === name ? ' on' : ''}" data-name="${esc(n)}">${esc(n)}</button>`).join('');
    // Keep the text box (and the keyboard) when only the chips change.
    if (!input) $('[data-names]').innerHTML = `${html}<input class="tm-type" data-type-name maxlength="20" placeholder="✎ Type a name…" enterkeyhint="done" autocomplete="off">`;
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
      ? `<span style="margin-right:4px">Recent</span>${recent.map((m) => `<button class="x-btn sm" data-recent-start="${m}">${minutesText(m)}</button>`).join('')}`
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
    msgTimer = setTimeout(() => { if (el.isConnected) { m.textContent = ''; m.className = 'tm-msg'; showFull(); } }, warn ? 6000 : 4000);
  }
  const fullText = () => `All ${MAX} timers are in use.`;
  // While all 8 are counting, the start buttons look switched off and the reason stays on screen.
  function showFull() {
    const full = room() <= 0;
    root.classList.toggle('tm-full', full);
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
    closeSheet();
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
    showNames();
    showRecent();
  }

  // ---- Undo ----
  function showUndo(text) {
    const box = $('[data-undo]');
    box.innerHTML = `<div class="tm-undo"><span>${esc(text)}</span><button class="x-btn sm ink" data-undo-btn>Undo</button></div>`;
    clearTimeout(undoTimer);
    undoTimer = setTimeout(() => { if (el.isConnected) box.innerHTML = ''; }, 10000);
  }

  // ---- One pot ----
  function pot(t, lively) {
    const st = state(t);
    const gone = missed(t);
    const ring = st === 'done' && !gone;
    const finished = st === 'done' || st === 'stopped';
    const [top, deep] = liquidOf(t);
    // Running timers say when they'll ring, so you know without doing sums.
    const note = st === 'paused' ? 'Paused'
      : ring ? 'Time’s up!'
        : finished ? `Rang ${agoText(t.end)}` : ringsText(t.end);
    const going = st === 'running';
    const long = left(t) >= 3600000;
    const face = ring
      ? `<div class="tm-up">Time’s up!</div><button class="tm-stop" data-stop="${t.id}">Stop</button>`
      : `<div class="tm-clock${long ? ' long' : ''}" data-clock="${t.id}">${fmt(left(t))}</div><div class="tm-note">${esc(note)}</div>`;
    const btn = (attr, label, cls) => `<button class="x-btn sm${cls ? ` ${cls}` : ''}" data-${attr}="${t.id}">${label}</button>`;
    return `
      <div class="tm-cell ${st}${ring ? ' ring' : ''}${finished && !ring ? ' over' : ''}">
        <div class="tm-name">${esc(t.label)}${t.named ? `<small> · ${setText(t.secs)}</small>` : ''}</div>
        <div class="tm-potwrap">
          ${lively && going ? '<div class="tm-steam" style="left:30%"></div><div class="tm-steam" style="left:52%;animation-delay:-2.3s"></div>' : ''}
          <div class="tm-ear l"></div><div class="tm-ear r"></div>
          <div class="tm-pot">
            <div class="tm-liq" data-liq="${t.id}" style="transform:${levelOf(t)};background:linear-gradient(180deg,${top},${deep})">
              <svg class="tm-wave" width="1300" height="14" viewBox="0 0 1300 14" aria-hidden="true"><path d="${WAVE}" fill="${top}"/></svg>
              ${lively && (going || ring) ? '<i class="tm-bub" style="left:28%"></i><i class="tm-bub" style="left:61%;animation-delay:-1.4s"></i>' : ''}
            </div>
            <div class="tm-glass"></div>
            <div class="tm-mark"><i></i></div>
            <div class="tm-face">${face}</div>
          </div>
          <div class="tm-foam" aria-hidden="true"><i style="left:4%"></i><i style="left:34%;animation-delay:-.3s"></i><i style="left:66%;animation-delay:-.5s"></i></div>
        </div>
        <div class="tm-hob" aria-hidden="true"><div class="tm-glow"></div><div class="tm-grate"></div></div>
        <div class="tm-btns">
          ${finished ? `${btn('plus', '+1 min')}${btn('again', 'Again')}${btn('remove', 'Done', 'main')}`
    : `${btn(st === 'paused' ? 'resume' : 'pause', st === 'paused' ? 'Resume' : 'Pause', 'main')}${btn('plus', '+1 min')}${btn('remove', 'Cancel')}`}
        </div>
      </div>`;
  }

  // Nothing running: an empty pot, and the times people set most as big buttons.
  const emptyHtml = () => `
    <div class="tm-empty">
      <div class="tm-cell over">
        <div class="tm-potwrap">
          <div class="tm-ear l"></div><div class="tm-ear r"></div>
          <div class="tm-pot">
            <div class="tm-glass"></div><div class="tm-mark"><i></i></div>
            <div class="tm-face" style="padding:0 34px;box-sizing:border-box">
              <div class="x-serif" style="font-size:36px;line-height:1.2">Nothing on the hob</div>
            </div>
          </div>
        </div>
        <div class="tm-hob" aria-hidden="true"><div class="tm-glow"></div><div class="tm-grate"></div></div>
      </div>
      <div>
        <div class="tm-firsts">${FIRST.map((m) => `<button class="tm-first" data-start="${m}">${m}<small>min</small></button>`).join('')}</div>
        <button class="x-btn lg tm-amber" data-new style="width:100%;margin-top:14px">Other time</button>
      </div>
    </div>`;

  let lastShape = null;
  function render() {
    const list = sorted(timers());
    const n = list.length;
    const counting = list.filter((t) => state(t) === 'running').length;
    const paused = list.filter((t) => state(t) === 'paused').length;
    const finished = list.filter((t) => state(t) === 'done' || state(t) === 'stopped').length;
    // The top bar: a new pot, and "•••" for the rarer ones (all at once, the alarm's settings).
    const more = `
      ${counting && n > 1 ? '<button class="x-btn sm" data-pause-all>Pause all</button>' : paused > 1 ? '<button class="x-btn sm" data-resume-all>Resume all</button>' : ''}
      ${finished > (n > 1 ? 0 : 1) ? '<button class="x-btn sm" data-clear-done>Clear finished</button>' : ''}
      <button class="x-btn sm" data-alarm>Alarm sound</button>`;
    const tools = `<button class="x-btn sm glass" data-more-btn aria-label="More">•••</button>
      ${n ? '<button class="x-btn tm-amber" data-new>+ New timer</button>' : ''}`;
    // Rebuild only when a pot changes what it shows; otherwise just the digits and the levels.
    const shape = tools + more + list.map((t) => {
      const st = state(t);
      const gone = missed(t);
      return [t.id, st, gone, t.label, t.secs, left(t) >= 3600000, st === 'running' ? t.end : '', st === 'done' || st === 'stopped' ? agoText(t.end) : ''].join('|');
    }).join(';');
    if (shape !== lastShape) {
      lastShape = shape;
      $('[data-tools]').innerHTML = tools;
      $('[data-more]').innerHTML = more;
      const box = $('[data-list]');
      box.className = `tm-stage ${n <= 1 ? 'n1' : n === 2 ? 'n2' : n === 3 ? 'n3' : n === 4 ? 'n4' : n <= 6 ? 'n6' : 'n8'}`;
      // Steam and bubbles only on a lone pot: the screen's graphics are weak.
      box.innerHTML = n ? list.map((t) => pot(t, n === 1)).join('') : emptyHtml();
      showFull();
    } else {
      list.forEach((t) => {
        const c = el.querySelector(`[data-clock="${t.id}"]`);
        const text = fmt(left(t));
        if (c && c.textContent !== text) c.textContent = text;
        const l = el.querySelector(`[data-liq="${t.id}"]`);
        const lev = levelOf(t);
        if (l && l.style.transform !== lev) l.style.transform = lev;
      });
    }
  }

  const moreBox = $('[data-more]');
  el.addEventListener('click', (e) => {
    if (e.target === sheet) { closeSheet(); return; } // a tap beside the card
    const b = e.target.closest('button');
    // Any tap closes the "•••" list, except the one that opens it.
    if (!b || !b.matches('[data-more-btn]')) moreBox.classList.remove('open');
    if (!b) return;
    if (b.matches('[data-more-btn]')) { moreBox.classList.toggle('open'); return; }
    const d = b.dataset;
    if (d.start) start(+d.start, false);
    else if (d.recentStart) start(+d.recentStart, true);
    else if (d.name != null && b.classList.contains('tm-n')) {
      name = name === d.name ? '' : d.name; // tap again to take the name off
      nameInput.value = '';
      showNames();
    } else if (d.custom) { custom = Math.min(MAX_CUSTOM, Math.max(1, custom + +d.custom)); showCustom(); showRecent(); }
    else if (b.matches('[data-start-custom]')) start(custom, true);
    else if (b.matches('[data-new]')) openSheet();
    else if (b.matches('[data-close]')) closeSheet();
    else if (b.matches('[data-alarm]')) {
      // Settings opens on its Timers section: the alarm sound, how long it rings, the heads-up.
      try { sessionStorage.setItem('settings.section', 'timers'); } catch (err) { /* storage off */ }
      location.hash = '#/settings';
    } else if (d.again) restartTimer(d.again);
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
